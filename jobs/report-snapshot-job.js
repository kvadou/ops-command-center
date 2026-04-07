/**
 * Report Snapshot Job
 * Pre-computes Executive Reports data daily at midnight
 * Run via Heroku Scheduler: node jobs/report-snapshot-job.js
 *
 * Generates:
 * - 5 weekly snapshots (current + 4 previous weeks)
 * - 4 monthly snapshots (current + 3 previous months)
 *
 * All snapshots include YoY data for instant toggle in UI.
 */

const { DateTime } = require('luxon');

async function generateReportSnapshots() {
  logger.info('[Report Snapshot Job] Starting snapshot generation...');
  const startTime = Date.now();

  // Initialize database - buildDeps() is synchronous and returns {pool, ...}
  // We must set global.pool because reportService methods access it directly
  const { buildDeps } = require('../config/deps');
  const deps = buildDeps();
  global.pool = deps.pool;

  const pool = global.pool;
  const reportService = require('../services/report-service');
const { logger } = require('../utils/logger');

  const results = {
    weekly: [],
    monthly: [],
    errors: []
  };

  // Generate 5 weekly snapshots (current + 4 previous)
  logger.info('[Report Snapshot Job] Generating weekly snapshots...');
  for (let weekOffset = 0; weekOffset < 5; weekOffset++) {
    try {
      const snapshotStart = Date.now();
      logger.info(`[Report Snapshot Job] Computing weekly offset=${weekOffset}...`);

      const data = await reportService.generateMultiPeriodAnalytics(
        'weekly',
        weekOffset,
        0,
        true  // includeYoY = true
      );

      const computationTimeMs = Date.now() - snapshotStart;
      await saveSnapshot(pool, 'weekly', weekOffset, data, computationTimeMs);

      results.weekly.push({
        offset: weekOffset,
        periodKey: getPeriodKey('weekly', weekOffset),
        computationTimeMs
      });

      logger.info(`[Report Snapshot Job] Weekly offset=${weekOffset} completed in ${computationTimeMs}ms`);
    } catch (error) {
      logger.error({ error: error.message }, `[Report Snapshot Job] Error generating weekly offset=${weekOffset}:`);
      results.errors.push({ type: 'weekly', offset: weekOffset, error: error.message });
    }
  }

  // Generate 4 monthly snapshots (current + 3 previous)
  logger.info('[Report Snapshot Job] Generating monthly snapshots...');
  for (let monthOffset = 0; monthOffset < 4; monthOffset++) {
    try {
      const snapshotStart = Date.now();
      logger.info(`[Report Snapshot Job] Computing monthly offset=${monthOffset}...`);

      const data = await reportService.generateMultiPeriodAnalytics(
        'monthly',
        0,
        monthOffset,
        true  // includeYoY = true
      );

      const computationTimeMs = Date.now() - snapshotStart;
      await saveSnapshot(pool, 'monthly', monthOffset, data, computationTimeMs);

      results.monthly.push({
        offset: monthOffset,
        periodKey: getPeriodKey('monthly', monthOffset),
        computationTimeMs
      });

      logger.info(`[Report Snapshot Job] Monthly offset=${monthOffset} completed in ${computationTimeMs}ms`);
    } catch (error) {
      logger.error({ error: error.message }, `[Report Snapshot Job] Error generating monthly offset=${monthOffset}:`);
      results.errors.push({ type: 'monthly', offset: monthOffset, error: error.message });
    }
  }

  const totalTime = Date.now() - startTime;
  logger.info(`[Report Snapshot Job] Completed in ${totalTime}ms`);
  logger.info({ data: JSON.stringify(results, null, 2) }, `[Report Snapshot Job] Results:`);

  // Close pool
  await pool.end();

  return results;
}

/**
 * Generate period key for a given report type and offset
 */
function getPeriodKey(reportType, offset) {
  const now = DateTime.now().setZone('America/New_York');

  if (reportType === 'weekly') {
    // Calculate the week based on offset
    // Week ends on Saturday, starts on Sunday
    let daysToSubtract = now.weekday === 7 ? 1 : now.weekday + 1;
    const lastSaturday = now.minus({ days: daysToSubtract, weeks: offset });
    const lastSunday = lastSaturday.minus({ days: 6 });
    // ISO week format: YYYY-Www
    return lastSunday.toFormat("kkkk-'W'WW");
  } else {
    // Monthly: previous month minus offset
    const targetMonth = now.minus({ months: 1 + offset });
    return targetMonth.toFormat('yyyy-MM');
  }
}

/**
 * Save or update a snapshot in the database
 */
async function saveSnapshot(pool, reportType, offset, data, computationTimeMs) {
  const now = DateTime.now().setZone('America/New_York');
  const periodKey = getPeriodKey(reportType, offset);

  // Extract date range from the data
  const periodStart = data.currentPeriod?.dateRange?.start;
  const periodEnd = data.currentPeriod?.dateRange?.end;

  // Upsert the snapshot
  await pool.query(`
    INSERT INTO report_snapshots (
      report_type,
      period_key,
      week_offset,
      month_offset,
      period_start,
      period_end,
      data,
      computed_at,
      computation_time_ms
    ) VALUES ($1, $2, $3, $4, $5, $6, $7, NOW(), $8)
    ON CONFLICT (report_type, period_key)
    DO UPDATE SET
      week_offset = EXCLUDED.week_offset,
      month_offset = EXCLUDED.month_offset,
      period_start = EXCLUDED.period_start,
      period_end = EXCLUDED.period_end,
      data = EXCLUDED.data,
      computed_at = NOW(),
      computation_time_ms = EXCLUDED.computation_time_ms
  `, [
    reportType,
    periodKey,
    reportType === 'weekly' ? offset : null,
    reportType === 'monthly' ? offset : null,
    periodStart,
    periodEnd,
    JSON.stringify(data),
    computationTimeMs
  ]);
}

// Run if executed directly
if (require.main === module) {
  generateReportSnapshots()
    .then(() => {
      logger.info('[Report Snapshot Job] Job finished successfully');
      process.exit(0);
    })
    .catch((error) => {
      logger.error({ err: error }, '[Report Snapshot Job] Job failed:');
      process.exit(1);
    });
}

module.exports = { generateReportSnapshots, saveSnapshot, getPeriodKey };
