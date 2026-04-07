/**
 * API route for triggering forecast data sync
 * Runs sync from web dyno context (which can connect to RDS with SSL)
 * 
 * POST /api/sync-forecast
 */

const express = require('express');
const router = express.Router();
const { getProdDbPool, getForecastDbPool } = require('../sync/utils/db');
const fs = require('fs');
const path = require('path');
const { asyncHandler } = require('../middleware/error-handler');
const { logger } = require('../utils/logger');

router.post('/sync-forecast', asyncHandler(async (req, res) => {
  const prodDb = getProdDbPool();
  const forecastDb = getForecastDbPool();
  
  let prodClient, forecastClient;
  const startTime = Date.now();
  let processed = 0;
  
  try {
    prodClient = await prodDb.connect();
    forecastClient = await forecastDb.connect();
    
    // Get last sync date
    const lastSyncRes = await forecastClient.query(
      'SELECT last_sync_date FROM forecast.sync_log ORDER BY last_sync_date DESC LIMIT 1'
    );
    
    // Default to 12 months ago for initial sync, or use last sync date
    const defaultLastSync = new Date();
    defaultLastSync.setMonth(defaultLastSync.getMonth() - 12);
    const lastSync = lastSyncRes.rows.length 
      ? new Date(lastSyncRes.rows[0].last_sync_date)
      : defaultLastSync;
    
    logger.info({ lastSync: lastSync.toISOString() }, 'Starting forecast sync');
    
    // Read SQL queries
    const completedQuery = fs.readFileSync(
      path.join(__dirname, '../sync/queries/fetchAppointments.sql'),
      'utf8'
    );
    
    const plannedQuery = fs.readFileSync(
      path.join(__dirname, '../sync/queries/fetchPlannedLessons.sql'),
      'utf8'
    );
    
    // Fetch completed appointments
    const completedLessons = await prodClient.query(completedQuery, [lastSync]);
    
    // Fetch planned lessons
    const plannedLessons = await prodClient.query(plannedQuery);
    
    // Insert/update daily_actuals
    for (const row of completedLessons.rows) {
      await forecastClient.query(
        `INSERT INTO forecast.daily_actuals (date, revenue, market, lesson_type)
         VALUES ($1, $2, $3, $4)
         ON CONFLICT (date, market, lesson_type)
         DO UPDATE SET revenue = EXCLUDED.revenue`,
        [row.lesson_date, row.revenue, row.market || null, row.lesson_type || null]
      );
      processed++;
    }
    
    // Insert/update daily_pipeline (with NULL run_id for raw synced data)
    for (const row of plannedLessons.rows) {
      await forecastClient.query(
        `INSERT INTO forecast.daily_pipeline (date, expected_value, count_lessons, market, lesson_type, run_id)
         VALUES ($1, $2, $3, $4, $5, NULL)
         ON CONFLICT (date, market, lesson_type, run_id)
         DO UPDATE SET 
           expected_value = EXCLUDED.expected_value,
           count_lessons = EXCLUDED.count_lessons`,
        [
          row.planned_date,
          row.potential_revenue,
          row.planned_lessons,
          row.market || null,
          row.lesson_type || null
        ]
      );
      processed++;
    }
    
    // Log sync completion
    await forecastClient.query('INSERT INTO forecast.sync_log (last_sync_date) VALUES (NOW())');
    
    const duration = Date.now() - startTime;
    await forecastClient.query(
      `INSERT INTO forecast.sync_audit (completed_at, records_processed, duration_ms, success, message)
       VALUES (NOW(), $1, $2, TRUE, 'Sync successful')`,
      [processed, duration]
    );
    
    res.json({
      success: true,
      message: `Forecast DB sync complete: ${processed} records`,
      recordsProcessed: processed,
      durationMs: duration
    });
    
  } catch (error) {
    logger.error({ err: error }, 'Sync error');
    
    // Log error to sync_audit
    try {
      await forecastClient.query(
        `INSERT INTO forecast.sync_audit (completed_at, success, message)
         VALUES (NOW(), FALSE, $1)`,
        [error.message]
      );
    } catch (auditError) {
      logger.error({ err: auditError }, 'Failed to log error to audit table');
    }
    
    res.status(500).json({
      success: false,
      error: error.message
    });
  } finally {
    if (prodClient) prodClient.release();
    if (forecastClient) forecastClient.release();
    await prodDb.end();
    await forecastDb.end();
  }
}));

module.exports = router;

