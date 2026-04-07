#!/usr/bin/env node
/**
 * Scheduled Job: Generate Payment Orders from Lessons
 * Auto-generates payment orders for tutors from completed lessons/appointments
 * 
 * Heroku Scheduler Configuration:
 * - Frequency: Daily
 * - Time: 2:30 AM UTC (or preferred time)
 * - Command: node jobs/generate-payment-orders-job.js [environment]
 * 
 * Environments: local, staging, production, westside, eastside
 */

require('dotenv').config();
const { buildDeps } = require('../config/deps');
const { getPool } = require('../database-connections');
const PaymentOrderGenerationService = require('../services/payment-order-generation-service');
const { logger } = require('../utils/logger');

async function generatePaymentOrdersJob(environment) {
  // Check feature flag - scheduled jobs should NOT run unless enabled
  if (process.env.STANDALONE_ACCOUNTING_ENABLED !== 'true') {
    logger.info({
      msg: 'Scheduled payment order generation skipped - standalone accounting not enabled',
      environment
    });
    return {
      skipped: true,
      reason: 'STANDALONE_ACCOUNTING_ENABLED is not set to true'
    };
  }

  const pool = getPool(environment);
  const paymentOrderGenService = new PaymentOrderGenerationService(pool);

  logger.info({
    msg: 'Starting scheduled payment order generation',
    environment
  });

  try {
    // Generate payment orders for the previous day (yesterday)
    const yesterday = new Date();
    yesterday.setDate(yesterday.getDate() - 1);
    yesterday.setHours(0, 0, 0, 0);

    const today = new Date();
    today.setHours(0, 0, 0, 0);

    const result = await paymentOrderGenService.generatePaymentOrdersFromLessons({
      startDate: yesterday,
      endDate: today,
      regenerate: false
    });

    logger.info({
      msg: 'Scheduled payment order generation completed',
      environment,
      paymentOrdersCreated: result.paymentOrdersCreated,
      paymentOrdersUpdated: result.paymentOrdersUpdated,
      errors: result.errors.length
    });

    if (result.errors.length > 0) {
      logger.warn({
        msg: 'Payment order generation had errors',
        environment,
        errorCount: result.errors.length,
        errors: result.errors
      });
    }

    return result;
  } catch (error) {
    logger.error({
      msg: 'Error in scheduled payment order generation',
      environment,
      error: error.message,
      stack: error.stack
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

generatePaymentOrdersJob(environment)
  .then((result) => {
    logger.info({ data: result }, 'Payment order generation completed:');
    process.exit(0);
  })
  .catch((error) => {
    logger.error({ err: error }, 'Payment order generation failed:');
    process.exit(1);
  });
