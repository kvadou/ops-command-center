/**
 * Redis Client Service
 *
 * Provides distributed caching and locking for multi-dyno Heroku environment
 * Used for: payment idempotency, distributed locks, rate limiting
 */

const redis = require('redis');
const { logger } = require('../utils/logger');

class RedisClient {
  constructor() {
    this.client = null;
    this.isConnected = false;
  }

  async connect() {
    if (this.isConnected) return this.client;

    const redisUrl = process.env.REDIS_URL;

    if (!redisUrl) {
      logger.warn('⚠️  REDIS_URL not set - Redis features disabled (local dev mode)');
      return null;
    }

    try {
      this.client = redis.createClient({
        url: redisUrl,
        socket: {
          tls: true,
          rejectUnauthorized: false
        }
      });

      this.client.on('error', (err) => {
        logger.error({ err: err }, 'Redis Client Error:');
        this.isConnected = false;
      });

      this.client.on('connect', () => {
        logger.info('✅ Redis connected');
        this.isConnected = true;
      });

      await this.client.connect();
      return this.client;
    } catch (error) {
      logger.error({ err: error }, '❌ Failed to connect to Redis:');
      this.client = null;
      this.isConnected = false;
      return null;
    }
  }

  async disconnect() {
    if (this.client && this.isConnected) {
      await this.client.disconnect();
      this.isConnected = false;
    }
  }

  /**
   * Set a value with expiration (TTL in seconds)
   */
  async set(key, value, ttl = 3600) {
    if (!this.client) return false;

    try {
      const serialized = typeof value === 'string' ? value : JSON.stringify(value);
      await this.client.setEx(key, ttl, serialized);
      return true;
    } catch (error) {
      logger.error({ err: error }, 'Redis SET error:');
      return false;
    }
  }

  /**
   * Get a value by key
   */
  async get(key) {
    if (!this.client) return null;

    try {
      const value = await this.client.get(key);
      if (!value) return null;

      // Try to parse as JSON, fall back to string
      try {
        return JSON.parse(value);
      } catch {
        return value;
      }
    } catch (error) {
      logger.error({ err: error }, 'Redis GET error:');
      return null;
    }
  }

  /**
   * Delete a key
   */
  async del(key) {
    if (!this.client) return false;

    try {
      await this.client.del(key);
      return true;
    } catch (error) {
      logger.error({ err: error }, 'Redis DEL error:');
      return false;
    }
  }

  /**
   * Check if key exists
   */
  async exists(key) {
    if (!this.client) return false;

    try {
      const result = await this.client.exists(key);
      return result === 1;
    } catch (error) {
      logger.error({ err: error }, 'Redis EXISTS error:');
      return false;
    }
  }

  /**
   * Set a value only if it doesn't exist (NX = Not eXists)
   * Returns true if the key was set, false if it already existed
   * Used for distributed locks
   */
  async setNX(key, value, ttl = 3600) {
    if (!this.client) return false;

    try {
      const serialized = typeof value === 'string' ? value : JSON.stringify(value);
      const result = await this.client.set(key, serialized, {
        NX: true,
        EX: ttl
      });
      return result === 'OK';
    } catch (error) {
      logger.error({ err: error }, 'Redis SETNX error:');
      return false;
    }
  }

  /**
   * Increment a counter
   */
  async incr(key) {
    if (!this.client) return null;

    try {
      return await this.client.incr(key);
    } catch (error) {
      logger.error({ err: error }, 'Redis INCR error:');
      return null;
    }
  }

  /**
   * Set expiration on existing key
   */
  async expire(key, ttl) {
    if (!this.client) return false;

    try {
      await this.client.expire(key, ttl);
      return true;
    } catch (error) {
      logger.error({ err: error }, 'Redis EXPIRE error:');
      return false;
    }
  }
}

// Singleton instance
const redisClient = new RedisClient();

module.exports = redisClient;
