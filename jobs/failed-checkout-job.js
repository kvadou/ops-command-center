#!/usr/bin/env node
/**
 * Scheduled Job: Failed Checkout Detection
 * Detects lessons where tutors haven't checked out in TutorCruncher and tracks them.
 * Also checks previously-pending items for resolution (status changed to complete/cancelled).
 * Emails are NOT sent automatically — they are triggered manually from the UI.
 *
 * Heroku Scheduler Configuration:
 * - Frequency: Daily
 * - Command: node jobs/failed-checkout-job.js production
 */

require('dotenv').config();
const axios = require('axios');
const { getPool } = require('../database-connections');
const { logger } = require('../utils/logger');
const FailedCheckoutService = require('../services/failed-checkout-service');

async function failedCheckoutJob(environment) {
  const pool = getPool(environment);
  const service = new FailedCheckoutService(pool);

  logger.info({ msg: 'Starting failed checkout job', environment });

  // Create TC client for ghost cleanup
  const tcToken = String(process.env.TUTORCRUNCHER_API_TOKEN || '').replace(/['"]/g, '').trim();
  const tcClient = axios.create({
    baseURL: process.env.TUTORCRUNCHER_API_BASE || 'https://account.acmeops.com/api/',
    timeout: 30000,
    headers: { Authorization: `token ${tcToken}` },
  });

  try {
    // 1) Check resolutions first (items that were pending but tutor has since checked out)
    const resolutionResult = await service.checkResolutions();

    // 2) Clean up ghost appointments (deleted in TC but still in our DB)
    const cleanupResult = await service.cleanupDeletedAppointments(tcClient);

    // 3) Detect new failed checkouts
    const detectionResult = await service.detectFailedCheckouts();

    const result = {
      success: true,
      detected: detectionResult.detected,
      resolved: resolutionResult.resolved,
      ghostsCleaned: cleanupResult.deleted,
    };

    logger.info({ msg: 'Failed checkout job completed', ...result });
    return result;
  } catch (error) {
    logger.error({
      msg: 'Failed checkout job failed',
      environment,
      error: error.message,
      stack: error.stack,
    });
    throw error;
  }
}

// Main execution
const environment = process.argv[2] || process.env.NODE_ENV || 'local';

if (!['local', 'staging', 'production', 'westside', 'eastside'].includes(environment)) {
  logger.error('Invalid environment. Must be: local, staging, production, westside, eastside');
  process.exit(1);
}

failedCheckoutJob(environment)
  .then((result) => {
    logger.info({ data: JSON.stringify(result, null, 2) }, 'Failed checkout job completed:');
    process.exit(0);
  })
  .catch((error) => {
    logger.error({ err: error }, 'Failed checkout job failed:');
    process.exit(1);
  });
