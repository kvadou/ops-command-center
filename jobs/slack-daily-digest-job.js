#!/usr/bin/env node
/**
 * Scheduled Job: Slack Daily Digest
 * Sends a daily summary of marketing alerts to Slack
 *
 * Heroku Scheduler Configuration:
 * - Frequency: Daily at 13:00 UTC (8 AM EST / 9 AM EDT)
 * - Command: node jobs/slack-daily-digest-job.js [environment]
 *
 * Environments: local, staging, production, westside, eastside
 */

require('dotenv').config();
const { getPool } = require('../database-connections');
const MarketingNotificationService = require('../services/marketing-notification-service');
const { logger } = require('../utils/logger');

async function slackDailyDigestJob(environment) {
  // Feature flag check
  if (process.env.SLACK_DAILY_DIGEST_DISABLED === 'true') {
    logger.info({
      msg: 'Slack daily digest skipped - disabled via env',
      environment
    });
    return {
      skipped: true,
      reason: 'SLACK_DAILY_DIGEST_DISABLED is set to true'
    };
  }

  const pool = getPool(environment);
  const notificationService = new MarketingNotificationService();

  logger.info({
    msg: 'Starting Slack daily digest job',
    environment
  });

  try {
    // Get alerts from the last 24 hours
    const result = await pool.query(`
      SELECT id, alert_type, title, message, platform, created_at
      FROM marketing_alerts
      WHERE created_at >= NOW() - INTERVAL '24 hours'
        AND is_dismissed = FALSE
      ORDER BY
        CASE alert_type
          WHEN 'critical' THEN 1
          WHEN 'warning' THEN 2
          ELSE 3
        END,
        created_at DESC
    `);

    const alerts = result.rows;

    logger.info({
      msg: 'Fetched alerts for daily digest',
      environment,
      alertCount: alerts.length
    });

    if (alerts.length === 0) {
      logger.info({
        msg: 'No alerts in last 24 hours, skipping digest',
        environment
      });
      return {
        success: true,
        alertCount: 0,
        message: 'No alerts to digest'
      };
    }

    // Send the digest
    const digestResult = await notificationService.sendDailyDigest(alerts);

    logger.info({
      msg: 'Slack daily digest completed',
      environment,
      alertCount: alerts.length,
      result: digestResult
    });

    return {
      success: true,
      alertCount: alerts.length,
      criticalCount: alerts.filter(a => a.alert_type === 'critical').length,
      warningCount: alerts.filter(a => a.alert_type === 'warning').length
    };
  } catch (error) {
    logger.error({
      msg: 'Slack daily digest job failed',
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

slackDailyDigestJob(environment)
  .then((result) => {
    logger.info({ data: JSON.stringify(result, null, 2) }, 'Slack daily digest completed:');
    process.exit(0);
  })
  .catch((error) => {
    logger.error({ err: error }, 'Slack daily digest failed:');
    process.exit(1);
  });
