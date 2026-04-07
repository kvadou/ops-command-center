/**
 * Klaviyo Sync API Routes
 * Provides endpoints to trigger Klaviyo data syncs
 */

const express = require('express');
const router = express.Router();
const { exec } = require('child_process');
const { promisify } = require('util');
const { asyncHandler } = require('../middleware/error-handler');
const { logger } = require('../utils/logger');
const execAsync = promisify(exec);

/**
 * Trigger Klaviyo data sync
 * POST /api/submissions/analytics/klaviyo/sync
 * Body: { entity: 'all' | 'campaigns' | 'profiles' | 'lists' | 'flows', force: boolean, backfill: boolean, startDate?: string, endDate?: string }
 */
router.post('/sync', asyncHandler(async (req, res) => {
  try {
    const { entity = 'all', force = false, backfill = false, startDate, endDate } = req.body;

    if (!['all', 'campaigns', 'profiles', 'lists', 'flows', 'events', 'metrics'].includes(entity)) {
      return res.status(400).json({ 
        error: 'Invalid entity',
        valid_entities: ['all', 'campaigns', 'profiles', 'lists', 'flows', 'events', 'metrics']
      });
    }

    // Validate backfill dates
    if (backfill && startDate) {
      const start = new Date(startDate);
      const end = endDate ? new Date(endDate) : new Date();
      if (isNaN(start.getTime()) || isNaN(end.getTime())) {
        return res.status(400).json({ 
          error: 'Invalid date format',
          details: 'Dates must be in YYYY-MM-DD format'
        });
      }
      if (start > end) {
        return res.status(400).json({ 
          error: 'Invalid date range',
          details: 'startDate must be before endDate'
        });
      }
    }

    logger.info(`🔄 Triggering Klaviyo sync for entity: ${entity}, force: ${force}, backfill: ${backfill}`);

    // Build command
    let command;
    if (backfill && startDate) {
      const end = endDate || new Date().toISOString().split('T')[0];
      command = `node scripts/sync-klaviyo-data.js all --backfill ${startDate} ${end}`;
    } else {
      const forceFlag = force ? '--force' : '';
      command = `node scripts/sync-klaviyo-data.js ${entity} ${forceFlag}`.trim();
    }

    // Detect environment for logging
    const env = process.env.NODE_ENV || 'development';
    const dbEnv = process.env.DATABASE_URL 
      ? (process.env.DATABASE_URL.includes('localhost') ? 'local' : 
         process.env.DATABASE_URL.includes('de799vh47l12p6') ? 'staging' : 'production')
      : env;
    
    logger.info(`🔄 Starting Klaviyo sync in background`);
    logger.info(`   Command: ${command}`);
    logger.info(`   Environment: ${env}`);
    logger.info(`   Database: ${dbEnv}`);
    
    // Execute sync in background (non-blocking)
    execAsync(command, {
      cwd: process.cwd(),
      env: process.env,
      maxBuffer: 10 * 1024 * 1024, // 10MB buffer
    })
      .then(({ stdout, stderr }) => {
        logger.info({ data: stdout }, '✅ Klaviyo sync completed:');
        if (stderr) {
          logger.warn({ err: stderr }, '⚠️  Klaviyo sync warnings:');
        }
      })
      .catch((error) => {
        logger.error({ error: error.message }, '❌ Klaviyo sync error:');
        logger.error({ err: error }, '   Full error:');
      });

    // Return immediately with status (dbEnv already declared above)
    res.json({
      success: true,
      message: backfill 
        ? `Klaviyo backfill started from ${startDate} to ${endDate || 'today'}`
        : `Klaviyo sync started for entity: ${entity}`,
      entity,
      force,
      backfill,
      startDate,
      endDate: endDate || new Date().toISOString().split('T')[0],
      status: 'running',
      environment: dbEnv,
      database: dbEnv,
      note: `Sync is running in the background on ${dbEnv} database. Check server logs or sync status endpoint for progress.`,
    });
  } catch (err) {
    logger.error({ err: err }, '❌ Error triggering Klaviyo sync:');
    res.status(500).json({
      error: 'Failed to trigger Klaviyo sync',
      details: err.message
    });
  }
}));

/**
 * Get Klaviyo sync status/logs
 * GET /api/submissions/analytics/klaviyo/sync/status
 */
router.get('/sync/status', asyncHandler(async (req, res) => {
  const pool = req.locationPool || global.pool;
  const client = await pool.connect();
  try {
    const { limit = 20 } = req.query;

    const { rows } = await client.query(`
      SELECT 
        id, sync_type, status, records_synced, records_updated, records_created,
        error_message, started_at, completed_at, duration_seconds
      FROM klaviyo_sync_log
      ORDER BY started_at DESC
      LIMIT $1
    `, [parseInt(limit)]);

    // Also get database counts for diagnostics
    let campaignCount = 0;
    let profileCount = 0;
    let metricCount = 0;
    try {
      const { rows: campaignRows } = await client.query('SELECT COUNT(*) as count FROM klaviyo_campaigns');
      campaignCount = parseInt(campaignRows[0]?.count || 0);
      
      const { rows: profileRows } = await client.query('SELECT COUNT(*) as count FROM klaviyo_profiles');
      profileCount = parseInt(profileRows[0]?.count || 0);
      
      const { rows: metricRows } = await client.query('SELECT COUNT(*) as count FROM klaviyo_campaign_metrics');
      metricCount = parseInt(metricRows[0]?.count || 0);
    } catch (err) {
      logger.warn({ data: err.message }, 'Could not fetch database counts:');
    }

    res.json({
      success: true,
      logs: rows,
      count: rows.length,
      database: {
        campaigns: campaignCount,
        profiles: profileCount,
        metrics: metricCount,
      },
    });
  } catch (err) {
    logger.error({ err: err }, '❌ Error fetching sync status:');
    res.status(500).json({
      error: 'Failed to fetch sync status',
      details: err.message
    });
  } finally {
    client.release();
  }
}));

module.exports = router;

