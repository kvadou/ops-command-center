#!/usr/bin/env node
/**
 * Scheduled Job: Completion Rate Analytics
 * Computes daily snapshots and detects anomalies for completion rate analytics
 *
 * Heroku Scheduler Configuration:
 * - Frequency: Daily
 * - Time: 3:00 AM UTC (after invoice generation)
 * - Command: node jobs/completion-rate-analytics-job.js [environment]
 *
 * Environments: local, staging, production, westside, eastside
 */

require('dotenv').config();
const { getPool } = require('../database-connections');
const ForecastService = require('../services/forecast-service');
const { logger } = require('../utils/logger');

async function completionRateAnalyticsJob(environment) {
  // Feature flag check - can be controlled via env var
  if (process.env.COMPLETION_RATE_ANALYTICS_DISABLED === 'true') {
    logger.info({
      msg: 'Scheduled completion rate analytics skipped - disabled via env',
      environment
    });
    return {
      skipped: true,
      reason: 'COMPLETION_RATE_ANALYTICS_DISABLED is set to true'
    };
  }

  const pool = getPool(environment);
  const forecastService = new ForecastService(pool);

  logger.info({
    msg: 'Starting scheduled completion rate analytics',
    environment
  });

  const results = {
    snapshots: null,
    anomalies: null,
    errors: []
  };

  // Step 1: Compute daily snapshots
  try {
    logger.info({
      msg: 'Computing daily completion rate snapshots',
      environment
    });

    results.snapshots = await forecastService.computeDailySnapshots();

    logger.info({
      msg: 'Daily snapshots completed',
      environment,
      snapshotsCreated: results.snapshots.snapshots_created,
      snapshotDate: results.snapshots.snapshot_date
    });
  } catch (error) {
    logger.error({
      msg: 'Error computing daily snapshots',
      environment,
      error: error.message,
      stack: error.stack
    });
    results.errors.push({
      phase: 'snapshots',
      error: error.message
    });
  }

  // Step 2: Detect anomalies (even if snapshots failed, use existing data)
  try {
    logger.info({
      msg: 'Running anomaly detection',
      environment
    });

    results.anomalies = await forecastService.detectAndStoreAnomalies({
      lookbackDays: 30
    });

    logger.info({
      msg: 'Anomaly detection completed',
      environment,
      anomaliesDetected: results.anomalies.anomalies_detected,
      byType: results.anomalies.by_type
    });
  } catch (error) {
    logger.error({
      msg: 'Error in anomaly detection',
      environment,
      error: error.message,
      stack: error.stack
    });
    results.errors.push({
      phase: 'anomalies',
      error: error.message
    });
  }

  // Summary log
  const success = results.errors.length === 0;
  logger.info({
    msg: 'Completion rate analytics job finished',
    environment,
    success,
    snapshotsCreated: results.snapshots?.snapshots_created || 0,
    anomaliesDetected: results.anomalies?.anomalies_detected || 0,
    errorCount: results.errors.length
  });

  if (!success) {
    logger.warn({
      msg: 'Completion rate analytics job had errors',
      environment,
      errors: results.errors
    });
  }

  return results;
}

// Main execution
const environment = process.argv[2] || process.env.NODE_ENV || 'local';

if (!['local', 'staging', 'production', 'westside', 'eastside'].includes(environment)) {
  logger.error('Invalid environment. Must be: local, staging, production, westside, eastside');
  process.exit(1);
}

completionRateAnalyticsJob(environment)
  .then((result) => {
    logger.info({ data: JSON.stringify(result, null, 2) }, 'Completion rate analytics completed:');
    process.exit(result.errors.length > 0 ? 1 : 0);
  })
  .catch((error) => {
    logger.error({ err: error }, 'Completion rate analytics failed:');
    process.exit(1);
  });
