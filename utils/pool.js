/**
 * Shared utility for resolving the location-specific database pool from a request.
 *
 * The location-db middleware sets `req.locationPool` based on the hostname.
 * Many route files need to fall back to the global pool when the middleware
 * hasn't run (e.g., in tests or non-location-aware routes).
 *
 * Usage:
 *   const { getLocationPool } = require('../utils/pool');
 *   const pool = getLocationPool(req);
 */

const { logger } = require('./logger');

/**
 * Returns the location-specific pool from the request, falling back to global.pool.
 * Logs a warning when neither is available so pool misconfiguration is visible.
 *
 * @param {import('express').Request} req
 * @returns {import('pg').Pool}
 */
function getLocationPool(req) {
  const pool = req.locationPool || global.pool;
  if (!pool) {
    logger.error({ location: req.location, host: req.get && req.get('host') },
      'No pool found in req.locationPool or global.pool');
  }
  return pool;
}

module.exports = { getLocationPool };
