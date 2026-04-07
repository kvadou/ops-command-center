#!/usr/bin/env node

/**
 * ETL Sync Script for Forecast Database
 * 
 * Syncs data from production database to forecast database:
 * - Completed appointments (daily_actuals)
 * - Planned lessons (daily_pipeline)
 * 
 * Runs nightly via Heroku Scheduler
 */

const fs = require('fs');
const path = require('path');
const { getProdDbPool, getForecastDbPool } = require('./utils/db');

const runSync = async () => {
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
    
    console.log(`Starting sync from ${lastSync.toISOString()}...`);
    
    // Read SQL queries
    const completedQuery = fs.readFileSync(
      path.join(__dirname, 'queries/fetchAppointments.sql'),
      'utf8'
    );
    
    const plannedQuery = fs.readFileSync(
      path.join(__dirname, 'queries/fetchPlannedLessons.sql'),
      'utf8'
    );
    
    // Fetch completed appointments
    console.log('Fetching completed appointments...');
    const completedLessons = await prodClient.query(completedQuery, [lastSync]);
    console.log(`Found ${completedLessons.rows.length} completed lesson records`);
    
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
    
    // Fetch planned lessons
    console.log('Fetching planned lessons...');
    const plannedLessons = await prodClient.query(plannedQuery);
    console.log(`Found ${plannedLessons.rows.length} planned lesson records`);
    
    // Insert/update daily_pipeline (with NULL run_id for raw synced data)
    // Note: Synced pipeline data uses NULL run_id; forecast runs create rows with UUID run_ids
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
    
    // Record sync log
    await forecastClient.query(
      `INSERT INTO forecast.sync_log (last_sync_date) VALUES (NOW())`
    );
    
    const duration = Date.now() - startTime;
    
    // Record successful sync audit
    await forecastClient.query(
      `INSERT INTO forecast.sync_audit (completed_at, records_processed, duration_ms, success, message)
       VALUES (NOW(), $1, $2, TRUE, 'Sync successful')`,
      [processed, duration]
    );
    
    console.log(`✓ Forecast DB sync complete: ${processed} records processed in ${duration}ms`);
    
  } catch (err) {
    console.error('✗ Sync error:', err);
    
    // Record failed sync audit
    if (forecastClient) {
      try {
        await forecastClient.query(
          `INSERT INTO forecast.sync_audit (completed_at, success, message)
           VALUES (NOW(), FALSE, $1)`,
          [err.message || 'Unknown error']
        );
      } catch (auditErr) {
        console.error('Failed to log audit error:', auditErr);
      }
    }
    
    throw err;
    
  } finally {
    // Close connections
    if (prodClient) prodClient.release();
    if (forecastClient) forecastClient.release();
    
    // Close pools
    await prodDb.end();
    await forecastDb.end();
  }
};

// Run sync
if (require.main === module) {
  runSync()
    .then(() => {
      console.log('Sync completed successfully');
      process.exit(0);
    })
    .catch((err) => {
      console.error('Sync failed:', err);
      process.exit(1);
    });
}

module.exports = { runSync };

