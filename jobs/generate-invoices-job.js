#!/usr/bin/env node
/**
 * Scheduled Job: Generate Invoices from Lessons
 * Auto-generates invoices from completed lessons/appointments
 * 
 * Heroku Scheduler Configuration:
 * - Frequency: Daily
 * - Time: 2:00 AM UTC (or preferred time)
 * - Command: node jobs/generate-invoices-job.js [environment]
 * 
 * Environments: local, staging, production, westside, eastside
 */

require('dotenv').config();
const { buildDeps } = require('../config/deps');
const { getPool } = require('../database-connections');
const InvoiceGenerationService = require('../services/invoice-generation-service');
const { logger } = require('../utils/logger');

async function generateInvoicesJob(environment) {
  // Check feature flag - scheduled jobs should NOT run unless enabled
  if (process.env.STANDALONE_ACCOUNTING_ENABLED !== 'true') {
    logger.info({
      msg: 'Scheduled invoice generation skipped - standalone accounting not enabled',
      environment
    });
    return {
      skipped: true,
      reason: 'STANDALONE_ACCOUNTING_ENABLED is not set to true'
    };
  }

  const pool = getPool(environment);
  const invoiceGenService = new InvoiceGenerationService(pool);

  logger.info({
    msg: 'Starting scheduled invoice generation',
    environment
  });

  try {
    // Generate invoices for the previous day (yesterday)
    const yesterday = new Date();
    yesterday.setDate(yesterday.getDate() - 1);
    yesterday.setHours(0, 0, 0, 0);

    const today = new Date();
    today.setHours(0, 0, 0, 0);

    const result = await invoiceGenService.generateInvoicesFromLessons({
      startDate: yesterday,
      endDate: today,
      regenerate: false
    });

    logger.info({
      msg: 'Scheduled invoice generation completed',
      environment,
      invoicesCreated: result.invoicesCreated,
      invoicesUpdated: result.invoicesUpdated,
      errors: result.errors.length
    });

    if (result.errors.length > 0) {
      logger.warn({
        msg: 'Invoice generation had errors',
        environment,
        errorCount: result.errors.length,
        errors: result.errors
      });
    }

    return result;
  } catch (error) {
    logger.error({
      msg: 'Error in scheduled invoice generation',
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

generateInvoicesJob(environment)
  .then((result) => {
    logger.info({ data: result }, 'Invoice generation completed:');
    process.exit(0);
  })
  .catch((error) => {
    logger.error({ err: error }, 'Invoice generation failed:');
    process.exit(1);
  });
