/**
 * Idempotency Service
 *
 * Prevents duplicate payment processing across multiple Heroku dynos
 * Uses Redis for distributed locks when available, falls back to database
 *
 * Pattern:
 *   const result = await idempotencyService.executeOnce(key, asyncFunction);
 *   if (!result.executed) {
 *     // Already processed, use cached result
 *     return result.value;
 *   }
 */

const { Pool } = require('pg');
const redisClient = require('./redis-client');
const { logger } = require('../utils/logger');

class IdempotencyService {
  constructor() {
    this.pool = new Pool({ connectionString: process.env.DATABASE_URL });
  }

  /**
   * Execute a function exactly once for a given idempotency key
   *
   * @param {string} key - Unique idempotency key (e.g., 'payment:sub_123:stripe_ch_xyz')
   * @param {Function} fn - Async function to execute
   * @param {number} ttl - Time to live in seconds (default 24 hours)
   * @returns {Object} { executed: boolean, value: any }
   */
  async executeOnce(key, fn, ttl = 86400) {
    // Try Redis first (distributed, fast)
    if (redisClient.isConnected) {
      return await this._executeWithRedis(key, fn, ttl);
    }

    // Fallback to database lock (slower but works)
    return await this._executeWithDatabase(key, fn, ttl);
  }

  /**
   * Redis-based idempotency (fast, distributed)
   */
  async _executeWithRedis(key, fn, ttl) {
    const lockKey = `idempotency:${key}`;
    const resultKey = `idempotency_result:${key}`;

    // Check if result already exists
    const existingResult = await redisClient.get(resultKey);
    if (existingResult !== null) {
      logger.info(`⏭️  Idempotency: skipping ${key} (already processed)`);
      return { executed: false, value: existingResult };
    }

    // Try to acquire lock
    const acquired = await redisClient.setNX(lockKey, Date.now(), 300); // 5 min lock

    if (!acquired) {
      // Another process is already executing
      logger.info(`⏸️  Idempotency: waiting for ${key} (locked by another process)`);

      // Wait for result (poll every 500ms for up to 30 seconds)
      for (let i = 0; i < 60; i++) {
        await new Promise(resolve => setTimeout(resolve, 500));
        const result = await redisClient.get(resultKey);
        if (result !== null) {
          await redisClient.del(lockKey); // Clean up
          return { executed: false, value: result };
        }
      }

      // Timeout waiting for other process
      logger.error(`⏱️  Idempotency: timeout waiting for ${key}`);
      throw new Error(`Idempotency timeout: ${key}`);
    }

    // We have the lock - execute the function
    logger.info(`▶️  Idempotency: executing ${key}`);
    try {
      const result = await fn();

      // Store result with TTL
      await redisClient.set(resultKey, result, ttl);

      // Release lock
      await redisClient.del(lockKey);

      return { executed: true, value: result };
    } catch (error) {
      // Release lock on error
      await redisClient.del(lockKey);
      throw error;
    }
  }

  /**
   * Database-based idempotency (slower, but works without Redis)
   * Uses the same pattern as job_processing_claimed_at
   */
  async _executeWithDatabase(key, fn, ttl) {
    const tableName = 'idempotency_keys';

    // Ensure table exists
    await this._ensureIdempotencyTable();

    // Try to claim the key atomically
    const claimResult = await this.pool.query(`
      INSERT INTO ${tableName} (key, claimed_at, expires_at)
      VALUES ($1, NOW(), NOW() + interval '${ttl} seconds')
      ON CONFLICT (key) DO NOTHING
      RETURNING id
    `, [key]);

    if (claimResult.rows.length === 0) {
      // Key already exists - check if result is ready
      logger.info(`⏭️  Idempotency: skipping ${key} (already processed via DB)`);

      const existing = await this.pool.query(`
        SELECT result FROM ${tableName} WHERE key = $1
      `, [key]);

      if (existing.rows[0]?.result) {
        return { executed: false, value: existing.rows[0].result };
      }

      // Wait for result (poll every 500ms for up to 30 seconds)
      for (let i = 0; i < 60; i++) {
        await new Promise(resolve => setTimeout(resolve, 500));
        const result = await this.pool.query(`
          SELECT result FROM ${tableName} WHERE key = $1
        `, [key]);

        if (result.rows[0]?.result) {
          return { executed: false, value: result.rows[0].result };
        }
      }

      throw new Error(`Idempotency timeout: ${key}`);
    }

    // We claimed the key - execute the function
    logger.info(`▶️  Idempotency: executing ${key} (via DB)`);
    try {
      const result = await fn();

      // Store result
      await this.pool.query(`
        UPDATE ${tableName}
        SET result = $1, completed_at = NOW()
        WHERE key = $2
      `, [JSON.stringify(result), key]);

      return { executed: true, value: result };
    } catch (error) {
      // Mark as failed
      await this.pool.query(`
        UPDATE ${tableName}
        SET error = $1, completed_at = NOW()
        WHERE key = $2
      `, [error.message, key]);

      throw error;
    }
  }

  /**
   * Create idempotency_keys table if it doesn't exist
   */
  async _ensureIdempotencyTable() {
    await this.pool.query(`
      CREATE TABLE IF NOT EXISTS idempotency_keys (
        id SERIAL PRIMARY KEY,
        key TEXT UNIQUE NOT NULL,
        claimed_at TIMESTAMPTZ NOT NULL,
        completed_at TIMESTAMPTZ,
        expires_at TIMESTAMPTZ NOT NULL,
        result JSONB,
        error TEXT,
        created_at TIMESTAMPTZ DEFAULT NOW()
      )
    `);

    // Create index for cleanup
    await this.pool.query(`
      CREATE INDEX IF NOT EXISTS idx_idempotency_expires
      ON idempotency_keys(expires_at)
    `);
  }

  /**
   * Cleanup expired keys (run periodically via scheduler)
   */
  async cleanupExpired() {
    await this._ensureIdempotencyTable();

    const result = await this.pool.query(`
      DELETE FROM idempotency_keys
      WHERE expires_at < NOW()
      RETURNING key
    `);

    logger.info(`🧹 Cleaned up ${result.rows.length} expired idempotency keys`);
    return result.rows.length;
  }
}

module.exports = new IdempotencyService();
