/**
 * Schema Cache Utility
 *
 * Eliminates redundant information_schema queries by caching table and column
 * metadata in-process memory. Schema does not change between deploys, so the
 * cache lives for the lifetime of the Node process (no TTL needed).
 *
 * Populates lazily on first request per pool+table combination.
 *
 * Usage:
 *   const { tableExists, columnsExist, getAllColumns } = require('../utils/schema-cache');
 *
 *   // Check if a single table exists
 *   const exists = await tableExists(pool, 'pipeline_stages');
 *
 *   // Check which of a list of columns exist on a table
 *   const available = await columnsExist(pool, 'clients', ['status', 'market', 'labels']);
 *   // Returns: ['status', 'market'] (only the ones that actually exist)
 *
 *   // Get all columns for a table (returns a Set)
 *   const columnSet = await getAllColumns(pool, 'clients');
 *   if (columnSet.has('archived_at')) { ... }
 */

const { logger } = require('./logger');

// Cache keyed by "poolId:tableName" to support multiple database pools
// (main, Westside, Eastside, etc.)
const tableCache = new Map();   // key -> boolean
const columnCache = new Map();  // key -> Set<string>

// Counter for assigning unique IDs to pool objects
let poolIdCounter = 0;
const poolIdMap = new WeakMap();

/**
 * Get a stable identifier for a pool object. Pools are compared by reference
 * so two calls with the same pool instance get the same cache partition.
 */
function getPoolId(pool) {
  if (!poolIdMap.has(pool)) {
    poolIdMap.set(pool, ++poolIdCounter);
  }
  return poolIdMap.get(pool);
}

/**
 * Build a cache key from pool and table name.
 */
function cacheKey(pool, tableName) {
  return `${getPoolId(pool)}:${tableName}`;
}

/**
 * Load all columns for a given table from information_schema and cache them.
 * Also caches whether the table itself exists.
 * Returns a Set of column names (empty Set if table does not exist).
 */
async function loadTableColumns(pool, tableName) {
  const key = cacheKey(pool, tableName);

  // Already cached
  if (columnCache.has(key)) {
    return columnCache.get(key);
  }

  try {
    const { rows } = await pool.query(
      `SELECT column_name
       FROM information_schema.columns
       WHERE table_schema = 'public'
         AND table_name = $1`,
      [tableName]
    );

    const columnSet = new Set(rows.map(r => r.column_name));

    // Cache results
    columnCache.set(key, columnSet);
    tableCache.set(key, columnSet.size > 0);

    if (logger && logger.debug) {
      logger.debug({ tableName, columnCount: columnSet.size }, 'Schema cache populated');
    }

    return columnSet;
  } catch (err) {
    // On error, don't cache - let the next call retry
    if (logger && logger.error) {
      logger.error({ err, tableName }, 'Schema cache: failed to load columns');
    }
    throw err;
  }
}

/**
 * Check whether a table exists in the public schema.
 *
 * @param {object} pool - pg Pool or client with .query()
 * @param {string} tableName - Name of the table to check
 * @returns {Promise<boolean>} true if the table exists
 */
async function tableExists(pool, tableName) {
  const key = cacheKey(pool, tableName);

  if (tableCache.has(key)) {
    return tableCache.get(key);
  }

  // Loading columns implicitly determines table existence
  const columnSet = await loadTableColumns(pool, tableName);
  return columnSet.size > 0;
}

/**
 * Check which columns from a list exist on a table.
 *
 * @param {object} pool - pg Pool or client with .query()
 * @param {string} tableName - Name of the table
 * @param {string[]} columnNames - Array of column names to check
 * @returns {Promise<string[]>} Array of column names that exist (preserving input order)
 */
async function columnsExist(pool, tableName, columnNames) {
  const columnSet = await loadTableColumns(pool, tableName);
  return columnNames.filter(col => columnSet.has(col));
}

/**
 * Get all column names for a table as a Set.
 * Useful when building dynamic INSERT/UPDATE queries.
 *
 * @param {object} pool - pg Pool or client with .query()
 * @param {string} tableName - Name of the table
 * @returns {Promise<Set<string>>} Set of all column names (empty if table does not exist)
 */
async function getAllColumns(pool, tableName) {
  return loadTableColumns(pool, tableName);
}

/**
 * Check whether a single column exists on a table.
 * Convenience wrapper around loadTableColumns for single-column checks.
 *
 * @param {object} pool - pg Pool or client with .query()
 * @param {string} tableName - Name of the table
 * @param {string} columnName - Name of the column to check
 * @returns {Promise<boolean>} true if the column exists
 */
async function columnExists(pool, tableName, columnName) {
  const columnSet = await loadTableColumns(pool, tableName);
  return columnSet.has(columnName);
}

/**
 * Clear the entire schema cache. Useful for testing or if schema changes
 * are applied while the process is running (unlikely in production).
 */
function clearSchemaCache() {
  tableCache.clear();
  columnCache.clear();
}

module.exports = {
  tableExists,
  columnExists,
  columnsExist,
  getAllColumns,
  clearSchemaCache
};
