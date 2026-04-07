const express = require('express');
const router = express.Router();
const { tableExists } = require('../utils/schema-cache');
const { asyncHandler } = require('../middleware/error-handler');
const { logger } = require('../utils/logger');

// Get unpaid invoices with environment-aware connection
router.get('/invoices', asyncHandler(async (req, res) => {
  let pool;
  try {
    // Use location-specific database pool (set by locationDbMiddleware)
    // This ensures Eastside uses Eastside DB, Westside uses Westside DB, etc.
    pool = req.locationPool || global.pool;
    
    if (!pool) {
      logger.error('❌ Database pool not available');
      return res.status(503).json({ 
        error: 'Database connection not available',
        details: 'The database pool has not been initialized'
      });
    }
    
    logger.info(`📍 [invoices] Using location: ${req.location || 'production'}, pool: ${pool === req.locationPool ? 'location-specific' : 'global'}`);

    // Helper function to add timeout to queries
    const withTimeout = (promise, timeoutMs = 5000) => {
      const timeout = new Promise((_, reject) => {
        setTimeout(() => reject(new Error(`Query timeout after ${timeoutMs}ms`)), timeoutMs);
      });
      return Promise.race([promise, timeout]);
    };

    // Test database connection first
    try {
      await withTimeout(pool.query('SELECT 1'), 3000);
      
      // Check if invoices table exists (cached after first call)
      const invoicesExists = await tableExists(pool, 'invoices');

      if (!invoicesExists) {
        logger.error('❌ invoices table does not exist');
        return res.status(503).json({ 
          error: 'Database table not found',
          details: 'The invoices table does not exist in the database. Please run migrations or sync invoices first.'
        });
      }
    } catch (connError) {
      logger.error({ error: connError.message }, '❌ Database connection failed:');
      return res.status(503).json({ 
        error: 'Database connection failed',
        details: connError.message
      });
    }

    const { 
      status = 'unpaid',
      sortBy = 'gross',
      sortOrder = 'DESC',
      page = 1,
      limit = 50
    } = req.query;

    const pageNum = Math.max(1, parseInt(page));
    const limitNum = Math.min(50, Math.max(1, parseInt(limit)));
    const offset = (pageNum - 1) * limitNum;

    // Build ORDER BY clause - sanitize input to prevent SQL injection
    const validSortColumns = ['gross', 'date_sent', 'days_outstanding'];
    const safeSortBy = validSortColumns.includes(sortBy) ? sortBy : 'gross';
    const safeSortOrder = sortOrder.toUpperCase() === 'ASC' ? 'ASC' : 'DESC';
    
    let orderBy = 'ORDER BY gross DESC';
    if (safeSortBy === 'gross') {
      orderBy = `ORDER BY gross ${safeSortOrder}`;
    } else if (safeSortBy === 'date_sent') {
      orderBy = `ORDER BY date_sent ${safeSortOrder}`;
    } else if (safeSortBy === 'days_outstanding') {
      orderBy = `ORDER BY (CURRENT_DATE - date_sent::date) ${safeSortOrder}`;
    }

    // Execute queries with timeout (reduced to 5 seconds for faster failure)
    // Check which optional columns exist to avoid "column does not exist" errors
    const { rows: colRows } = await withTimeout(pool.query(`
      SELECT column_name FROM information_schema.columns
      WHERE table_name = 'invoices' AND column_name IN ('url', 'client_id', 'client_first_name', 'client_last_name', 'client_email')
    `));
    const cols = new Set(colRows.map(r => r.column_name));

    const { rows } = await withTimeout(pool.query(`
      SELECT
        id,
        display_id,
        date_sent,
        gross,
        net,
        tax,
        status,
        ${cols.has('url') ? 'url,' : ''}
        ${cols.has('client_id') ? 'client_id,' : ''}
        ${cols.has('client_first_name') ? 'client_first_name,' : ''}
        ${cols.has('client_last_name') ? 'client_last_name,' : ''}
        ${cols.has('client_email') ? 'client_email,' : ''}
        (CURRENT_DATE - date_sent::date) as days_outstanding
      FROM invoices
      WHERE status = $1
      ${orderBy}
      LIMIT $2 OFFSET $3
    `, [status, limitNum, offset]));

    // Get total count with timeout
    const { rows: countRows } = await withTimeout(pool.query(
      'SELECT COUNT(*) as total FROM invoices WHERE status = $1',
      [status]
    ));

    const total = parseInt(countRows[0].total);

    res.json({
      invoices: rows,
      pagination: {
        page: pageNum,
        limit: limitNum,
        total,
        totalPages: Math.ceil(total / limitNum)
      }
    });

  } catch (error) {
    logger.error({ err: error }, '❌ Error fetching invoices:');
    res.status(500).json({ 
      error: 'Failed to fetch invoices', 
      details: error.message,
      stack: process.env.NODE_ENV === 'development' ? error.stack : undefined
    });
  }
}));

// Get invoice summary
router.get('/invoices/summary', asyncHandler(async (req, res) => {
  let pool;
  try {
    // Use location-specific database pool (set by locationDbMiddleware)
    // This ensures Eastside uses Eastside DB, Westside uses Westside DB, etc.
    pool = req.locationPool || global.pool;
    
    if (!pool) {
      logger.error('❌ Database pool not available');
      return res.status(503).json({ 
        error: 'Database connection not available',
        details: 'The database pool has not been initialized'
      });
    }
    
    logger.info(`📍 [invoices/summary] Using location: ${req.location || 'production'}, pool: ${pool === req.locationPool ? 'location-specific' : 'global'}`);

    const { rows } = await pool.query(`
      SELECT 
        status,
        COUNT(*) as count,
        SUM(gross) as total_gross
      FROM invoices
      WHERE status = 'unpaid'
      GROUP BY status
    `);

    const unpaidSummary = rows[0] || { count: 0, total_gross: 0 };

    res.json({
      summary: rows,
      unpaidCount: parseInt(unpaidSummary.count),
      unpaidAmount: parseFloat(unpaidSummary.total_gross || 0)
    });

  } catch (error) {
    logger.error({ err: error }, '❌ Error fetching summary:');
    res.status(500).json({ 
      error: 'Failed to fetch summary', 
      details: error.message,
      stack: process.env.NODE_ENV === 'development' ? error.stack : undefined
    });
  }
}));

module.exports = router;

