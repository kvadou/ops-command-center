#!/usr/bin/env node
/**
 * Scheduled Job: Marketing Report Generator
 * Generates weekly marketing reports automatically
 *
 * Heroku Scheduler Configuration:
 * - Frequency: Weekly (Monday at 6:00 AM UTC)
 * - Command: node jobs/marketing-report-scheduler-job.js [environment]
 *
 * Environments: local, staging, production, westside, eastside
 */

require('dotenv').config();
const { getPool } = require('../database-connections');
const MarketingReportService = require('../services/marketing-report-service');
const { logger } = require('../utils/logger');

async function marketingReportSchedulerJob(environment) {
  // Feature flag check
  if (process.env.MARKETING_REPORTS_DISABLED === 'true') {
    logger.info({
      msg: 'Scheduled marketing report skipped - disabled via env',
      environment
    });
    return {
      skipped: true,
      reason: 'MARKETING_REPORTS_DISABLED is set to true'
    };
  }

  const pool = getPool(environment);
  const reportService = new MarketingReportService(pool);

  logger.info({
    msg: 'Starting scheduled marketing report generation',
    environment
  });

  const results = {
    reports: [],
    errors: []
  };

  try {
    // Get all active scheduled reports
    const scheduledReports = await pool.query(`
      SELECT * FROM marketing_scheduled_reports
      WHERE is_active = true
      AND (next_run_at IS NULL OR next_run_at <= NOW())
    `);

    if (scheduledReports.rows.length === 0) {
      // No scheduled reports configured, generate default weekly report
      logger.info({ msg: 'No scheduled reports configured, generating default weekly report' });

      const report = await generateDefaultWeeklyReport(pool, reportService);
      results.reports.push(report);
    } else {
      // Process each scheduled report
      for (const scheduled of scheduledReports.rows) {
        try {
          const report = await processScheduledReport(pool, reportService, scheduled);
          results.reports.push(report);
        } catch (error) {
          logger.error({
            msg: 'Error processing scheduled report',
            reportId: scheduled.id,
            reportName: scheduled.name,
            error: error.message
          });
          results.errors.push({
            reportId: scheduled.id,
            reportName: scheduled.name,
            error: error.message
          });
        }
      }
    }

    logger.info({
      msg: 'Marketing report scheduler completed',
      environment,
      reportsGenerated: results.reports.length,
      errors: results.errors.length
    });

    return results;
  } catch (error) {
    logger.error({
      msg: 'Marketing report scheduler failed',
      environment,
      error: error.message,
      stack: error.stack
    });
    throw error;
  }
}

/**
 * Generate default weekly report when no scheduled reports are configured
 */
async function generateDefaultWeeklyReport(pool, reportService) {
  const endDate = new Date();

  // Create a run record
  const runResult = await pool.query(`
    INSERT INTO marketing_report_runs (report_type, period_start, period_end, status, started_at)
    VALUES ('weekly', $1, $2, 'running', NOW())
    RETURNING id
  `, [
    new Date(endDate.getTime() - 7 * 24 * 60 * 60 * 1000).toISOString().split('T')[0],
    endDate.toISOString().split('T')[0]
  ]);

  const runId = runResult.rows[0].id;

  try {
    const report = await reportService.generateWeeklyReport({
      endDate,
      compareToPrevious: true
    });

    // Update run record with success
    await pool.query(`
      UPDATE marketing_report_runs
      SET status = 'completed', report_data = $2, completed_at = NOW()
      WHERE id = $1
    `, [runId, JSON.stringify(report)]);

    logger.info({
      msg: 'Default weekly report generated',
      runId,
      periodStart: report.period.start,
      periodEnd: report.period.end
    });

    return {
      runId,
      type: 'weekly',
      success: true,
      report
    };
  } catch (error) {
    // Update run record with failure
    await pool.query(`
      UPDATE marketing_report_runs
      SET status = 'failed', error_message = $2, completed_at = NOW()
      WHERE id = $1
    `, [runId, error.message]);

    throw error;
  }
}

/**
 * Process a specific scheduled report
 */
async function processScheduledReport(pool, reportService, scheduled) {
  const { id, name, report_type, report_config, recipients } = scheduled;

  // Calculate period based on report type
  const endDate = new Date();
  let startDate;

  switch (report_type) {
    case 'daily':
      startDate = new Date(endDate.getTime() - 1 * 24 * 60 * 60 * 1000);
      break;
    case 'monthly':
      startDate = new Date(endDate.getTime() - 30 * 24 * 60 * 60 * 1000);
      break;
    case 'weekly':
    default:
      startDate = new Date(endDate.getTime() - 7 * 24 * 60 * 60 * 1000);
  }

  // Create run record
  const runResult = await pool.query(`
    INSERT INTO marketing_report_runs (scheduled_report_id, report_type, period_start, period_end, status, started_at)
    VALUES ($1, $2, $3, $4, 'running', NOW())
    RETURNING id
  `, [id, report_type, startDate.toISOString().split('T')[0], endDate.toISOString().split('T')[0]]);

  const runId = runResult.rows[0].id;

  try {
    const report = await reportService.generateWeeklyReport({
      endDate,
      compareToPrevious: true,
      config: report_config
    });

    // Update run record
    await pool.query(`
      UPDATE marketing_report_runs
      SET status = 'completed', report_data = $2, completed_at = NOW()
      WHERE id = $1
    `, [runId, JSON.stringify(report)]);

    // Update scheduled report next run time
    const nextRunAt = calculateNextRunTime(report_type, scheduled.schedule_cron);
    await pool.query(`
      UPDATE marketing_scheduled_reports
      SET last_run_at = NOW(), next_run_at = $2, updated_at = NOW()
      WHERE id = $1
    `, [id, nextRunAt]);

    logger.info({
      msg: 'Scheduled report generated',
      runId,
      scheduledReportId: id,
      reportName: name,
      reportType: report_type,
      nextRunAt
    });

    return {
      runId,
      scheduledReportId: id,
      name,
      type: report_type,
      success: true,
      report
    };
  } catch (error) {
    await pool.query(`
      UPDATE marketing_report_runs
      SET status = 'failed', error_message = $2, completed_at = NOW()
      WHERE id = $1
    `, [runId, error.message]);

    throw error;
  }
}

/**
 * Calculate next run time based on report type
 */
function calculateNextRunTime(reportType, cronExpression) {
  const now = new Date();

  switch (reportType) {
    case 'daily':
      // Next day at 6 AM UTC
      const nextDaily = new Date(now);
      nextDaily.setUTCDate(nextDaily.getUTCDate() + 1);
      nextDaily.setUTCHours(6, 0, 0, 0);
      return nextDaily;

    case 'monthly':
      // First day of next month at 6 AM UTC
      const nextMonthly = new Date(now);
      nextMonthly.setUTCMonth(nextMonthly.getUTCMonth() + 1);
      nextMonthly.setUTCDate(1);
      nextMonthly.setUTCHours(6, 0, 0, 0);
      return nextMonthly;

    case 'weekly':
    default:
      // Next Monday at 6 AM UTC
      const nextWeekly = new Date(now);
      const daysUntilMonday = (8 - nextWeekly.getUTCDay()) % 7 || 7;
      nextWeekly.setUTCDate(nextWeekly.getUTCDate() + daysUntilMonday);
      nextWeekly.setUTCHours(6, 0, 0, 0);
      return nextWeekly;
  }
}

// Main execution
const environment = process.argv[2] || process.env.NODE_ENV || 'local';

if (!['local', 'staging', 'production', 'westside', 'eastside'].includes(environment)) {
  logger.error('Invalid environment. Must be: local, staging, production, westside, eastside');
  process.exit(1);
}

marketingReportSchedulerJob(environment)
  .then((result) => {
    logger.info({ data: JSON.stringify(result, null, 2) }, 'Marketing report scheduler completed:');
    process.exit(result.errors?.length > 0 ? 1 : 0);
  })
  .catch((error) => {
    logger.error({ err: error }, 'Marketing report scheduler failed:');
    process.exit(1);
  });
