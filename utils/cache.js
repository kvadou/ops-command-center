/**
 * Cache Utilities
 * Provides in-memory caching with optional Redis support
 */

const crypto = require('crypto');
const { logger } = require('./logger');

// In-memory cache store
const memoryCache = new Map();

// Redis client reference (set by initRedis)
let redisClient = null;

/**
 * Generate a cache key from prefix and parameters
 * @param {string} prefix - Cache key prefix
 * @param {object} params - Parameters to include in key
 * @returns {string} Cache key
 */
function generateKey(prefix, params = {}) {
  const paramsStr = Object.keys(params)
    .sort()
    .map(key => `${key}:${JSON.stringify(params[key])}`)
    .join('|');
  
  const hash = crypto.createHash('md5').update(paramsStr).digest('hex');
  return `${prefix}:${hash}`;
}

/**
 * Get value from cache or set if not present
 * @param {string} key - Cache key
 * @param {Function} fn - Function to call if cache miss
 * @param {number} ttl - Time to live in seconds
 * @returns {Promise<any>} Cached or computed value
 */
async function getOrSet(key, fn, ttl = 3600) {
  // Check memory cache
  const cached = memoryCache.get(key);
  if (cached && cached.expiresAt > Date.now()) {
    return cached.value;
  }

  // Cache miss - execute function
  const value = await fn();

  // Store in memory cache
  memoryCache.set(key, {
    value,
    expiresAt: Date.now() + (ttl * 1000)
  });

  // Clean up expired entries periodically
  if (Math.random() < 0.01) { // 1% chance to clean up
    const now = Date.now();
    for (const [k, v] of memoryCache.entries()) {
      if (v.expiresAt <= now) {
        memoryCache.delete(k);
      }
    }
  }

  return value;
}

/**
 * Initialize Redis client (optional)
 * @returns {Promise<object|null>} Redis client or null if not available
 */
async function initRedis() {
  try {
    // Check if Redis URL is configured
    const redisUrl = process.env.REDIS_URL;
    if (!redisUrl) {
      logger.info('📦 Redis not configured, using in-memory cache');
      return null;
    }

    // Try to import and initialize Redis
    const redis = require('redis');
    const client = redis.createClient({ url: redisUrl });

    await client.connect();
    logger.info('✅ Redis connected for shared caching across dynos');

    // Store client reference for clearCache
    redisClient = client;

    // Override getOrSet to use Redis
    module.exports.getOrSet = async (key, fn, ttl = 3600) => {
      try {
        // Try Redis first
        const cached = await client.get(key);
        if (cached) {
          return JSON.parse(cached);
        }
      } catch (err) {
        logger.warn({ data: err.message }, 'Redis get error, falling back to memory:');
      }

      // Cache miss - execute function
      const value = await fn();

      // Store in Redis
      try {
        await client.setEx(key, ttl, JSON.stringify(value));
      } catch (err) {
        logger.warn({ data: err.message }, 'Redis set error, falling back to memory:');
        // Fall back to memory cache
        memoryCache.set(key, {
          value,
          expiresAt: Date.now() + (ttl * 1000)
        });
      }

      return value;
    };

    return client;
  } catch (error) {
    logger.warn({ data: error.message }, 'Redis initialization failed, using in-memory cache:');
    return null;
  }
}

/**
 * Clear cache entry from both Redis and memory
 * @param {string} key - Cache key to clear
 */
async function clearCache(key) {
  // Always clear memory cache
  memoryCache.delete(key);

  // Also clear from Redis if connected
  if (redisClient) {
    try {
      await redisClient.del(key);
    } catch (err) {
      logger.warn({ data: err.message }, 'Redis clearCache error:');
    }
  }
}

/**
 * Clear all cache entries matching a prefix
 * @param {string} prefix - Cache key prefix to match (e.g., 'cct:list')
 */
async function clearCacheByPrefix(prefix) {
  // Clear matching entries from memory cache
  for (const key of memoryCache.keys()) {
    if (key.startsWith(prefix)) {
      memoryCache.delete(key);
    }
  }

  // Also clear from Redis if connected (using SCAN + DEL for safety)
  if (redisClient) {
    try {
      let cursor = 0;
      do {
        const result = await redisClient.scan(cursor, { MATCH: `${prefix}*`, COUNT: 100 });
        cursor = result.cursor;
        if (result.keys.length > 0) {
          await redisClient.del(result.keys);
        }
      } while (cursor !== 0);
    } catch (err) {
      logger.warn({ data: err.message }, 'Redis clearCacheByPrefix error:');
    }
  }
}

/**
 * Clear all cache entries
 */
function clearAllCache() {
  memoryCache.clear();
}

module.exports = {
  generateKey,
  getOrSet,
  initRedis,
  clearCache,
  clearCacheByPrefix,
  clearAllCache
};

