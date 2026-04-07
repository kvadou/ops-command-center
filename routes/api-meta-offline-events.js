// routes/api-meta-offline-events.js
/**
 * Meta Offline Events API Routes
 * Handles syncing booking submissions to Meta as offline conversion events
 */

const express = require('express');
const router = express.Router();
const MetaOfflineEventsSync = require('../services/meta-offline-events-sync');
const { asyncHandler } = require('../middleware/error-handler');
const { logger } = require('../utils/logger');

/**
 * POST /api/meta-offline-events/sync
 * Sync completed bookings to Meta as offline events
 * 
 * Query params:
 *   - startDate: YYYY-MM-DD (optional, defaults to 7 days ago)
 *   - endDate: YYYY-MM-DD (optional, defaults to today)
 *   - limit: Maximum number of bookings to process (optional)
 */
router.post('/sync', asyncHandler(async (req, res) => {
  try {
    const syncService = new MetaOfflineEventsSync();
    
    // Parse date range (default to last 7 days)
    const endDate = req.query.endDate 
      ? new Date(req.query.endDate + 'T23:59:59Z').toISOString()
      : new Date().toISOString();
    
    const startDate = req.query.startDate
      ? new Date(req.query.startDate + 'T00:00:00Z').toISOString()
      : new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString();

    const limit = req.query.limit ? parseInt(req.query.limit, 10) : undefined;

    logger.info(`📤 Meta offline events sync requested: ${startDate} to ${endDate}`);

    const results = await syncService.syncBookingsToMeta({
      startDate,
      endDate,
      limit
    });

    res.json({
      success: true,
      message: `Synced ${results.success} bookings to Meta`,
      results: results
    });
  } catch (error) {
    logger.error({ err: error }, 'Error syncing Meta offline events:');
    res.status(500).json({
      success: false,
      error: error.message,
      details: error.stack
    });
  }
}));

/**
 * POST /api/meta-offline-events/retry
 * Retry failed uploads
 * 
 * Query params:
 *   - maxRetries: Maximum retry count (default: 3)
 */
router.post('/retry', asyncHandler(async (req, res) => {
  try {
    const syncService = new MetaOfflineEventsSync();
    const maxRetries = req.query.maxRetries ? parseInt(req.query.maxRetries, 10) : 3;

    logger.info(`🔄 Retrying failed Meta offline event uploads (max retries: ${maxRetries})`);

    const results = await syncService.retryFailedUploads(maxRetries);

    res.json({
      success: true,
      message: `Retried ${results.total} failed uploads: ${results.success} successful, ${results.errors} errors`,
      results: results
    });
  } catch (error) {
    logger.error({ err: error }, 'Error retrying Meta offline events:');
    res.status(500).json({
      success: false,
      error: error.message,
      details: error.stack
    });
  }
}));

/**
 * GET /api/meta-offline-events/status
 * Get sync status and statistics
 */
router.get('/status', asyncHandler(async (req, res) => {
  try {
    const { getPool } = require('../database-connections');
    const pool = getPool();
    
    // Get upload statistics
    const statsQuery = `
      SELECT 
        upload_status,
        COUNT(*) as count,
        COUNT(*) FILTER (WHERE created_at >= NOW() - INTERVAL '7 days') as count_last_7_days,
        COUNT(*) FILTER (WHERE created_at >= NOW() - INTERVAL '30 days') as count_last_30_days
      FROM meta_offline_events
      GROUP BY upload_status
    `;
    
    const { rows: statsRows } = await pool.query(statsQuery);
    
    // Get recent uploads
    const recentQuery = `
      SELECT 
        moe.id,
        moe.submission_id,
        moe.event_name,
        moe.upload_status,
        moe.uploaded_at,
        moe.retry_count,
        bs.parent_email,
        bs.created_at as booking_created_at
      FROM meta_offline_events moe
      JOIN booking_submissions bs ON bs.id = moe.submission_id
      ORDER BY moe.uploaded_at DESC
      LIMIT 50
    `;
    
    const { rows: recentRows } = await pool.query(recentQuery);
    
    // Get pending/failed counts
    const pendingQuery = `
      SELECT COUNT(*) as count
      FROM meta_offline_events
      WHERE upload_status IN ('pending', 'failed')
        AND retry_count < 3
    `;
    
    const { rows: pendingRows } = await pool.query(pendingQuery);
    
    res.json({
      success: true,
      statistics: {
        byStatus: statsRows.reduce((acc, row) => {
          acc[row.upload_status] = {
            total: parseInt(row.count, 10),
            last7Days: parseInt(row.count_last_7_days, 10),
            last30Days: parseInt(row.count_last_30_days, 10)
          };
          return acc;
        }, {}),
        pendingRetries: parseInt(pendingRows[0]?.count || 0, 10)
      },
      recentUploads: recentRows
    });
  } catch (error) {
    logger.error({ err: error }, 'Error fetching Meta offline events status:');
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
}));

module.exports = router;

