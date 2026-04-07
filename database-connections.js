/**
 * Database connection configuration
 *
 * Simplified for single-database operation.
 * Uses DATABASE_URL for the primary connection.
 * All environment aliases (staging, production, etc.) point to the same pool
 * so existing route code that references specific environments won't break.
 */

const { Pool } = require('pg');
const { logger } = require('./utils/logger');

const DATABASE_URL = process.env.DATABASE_URL || 'postgres://localhost:5432/ops_command_center';

// Detect if connection needs SSL
const isLocalDb = DATABASE_URL.includes('localhost') || DATABASE_URL.includes('127.0.0.1');
const sslConfig = isLocalDb ? false : { rejectUnauthorized: false };

// Single shared pool
let pool = null;

function getOrCreatePool() {
  if (!pool) {
    pool = new Pool({
      connectionString: DATABASE_URL,
      ssl: sslConfig,
      max: 5,
      min: 1,
      idleTimeoutMillis: 30000,
      connectionTimeoutMillis: 5000,
      statement_timeout: 60000,
      query_timeout: 55000,
      application_name: 'ops-command-center',
      keepAlive: true,
      keepAliveInitialDelayMillis: 10000,
    });
  }
  return pool;
}

/**
 * Get pool for any environment name.
 * All environments now resolve to the same single database.
 */
function getPool(_env = 'local') {
  return getOrCreatePool();
}

async function testConnection(env) {
  const p = getPool(env);
  try {
    const client = await p.connect();
    const result = await client.query('SELECT NOW() as current_time');
    const poolStats = {
      totalCount: p.totalCount,
      idleCount: p.idleCount,
      waitingCount: p.waitingCount,
    };
    client.release();
    logger.info(`Database connection successful: ${result.rows[0].current_time}`);
    logger.info(`Pool stats: ${poolStats.idleCount}/${poolStats.totalCount} connections, ${poolStats.waitingCount} waiting`);
    return { success: true, poolStats };
  } catch (error) {
    logger.error({ error: error.message }, 'Database connection failed:');
    return { success: false, error: error.message };
  }
}

function getPoolStats(_env) {
  if (!pool) return null;
  return {
    environment: 'primary',
    totalCount: pool.totalCount,
    idleCount: pool.idleCount,
    waitingCount: pool.waitingCount,
    utilizationPercent: pool.totalCount > 0
      ? Math.round(((pool.totalCount - pool.idleCount) / pool.totalCount) * 100)
      : 0,
  };
}

function getAllPoolStats() {
  const stats = getPoolStats();
  return stats ? { primary: stats } : {};
}

async function testAllConnections() {
  logger.info('Testing database connection...');
  await testConnection('primary');
}

async function closeAllPools() {
  if (pool) {
    await pool.end();
    logger.info('Database pool closed');
    pool = null;
  }
}

// Keep the same DB_CONFIGS export shape so nothing breaks,
// but point everything to the single DATABASE_URL.
const DB_CONFIGS = {
  local: { connectionString: DATABASE_URL, description: 'Primary database' },
  production: { connectionString: DATABASE_URL, description: 'Primary database' },
  staging: { connectionString: DATABASE_URL, description: 'Primary database' },
};

module.exports = {
  getPool,
  testConnection,
  testAllConnections,
  closeAllPools,
  getPoolStats,
  getAllPoolStats,
  DB_CONFIGS,
};

if (require.main === module) {
  testAllConnections()
    .then(() => {
      logger.info('Database connection test complete!');
      return closeAllPools();
    })
    .catch(err => logger.error({ err }, 'Database connection test failed'));
}
