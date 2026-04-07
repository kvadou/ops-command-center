#!/usr/bin/env node
/**
 * Scheduled Job: EOS Scorecard Weekly Snapshot
 * Snapshots the previous week's metrics and sends a Slack notification.
 *
 * Heroku Scheduler Configuration:
 * - Frequency: Weekly, Monday at 12:00 UTC (7 AM ET / 8 AM EDT)
 * - Command: node jobs/scorecard-snapshot-job.js [environment]
 *
 * Environments: local, staging, production, westside, eastside
 */

require('dotenv').config();
const { getPool } = require('../database-connections');
const ScorecardService = require('../services/scorecard-service');
const { logger } = require('../utils/logger');
const axios = require('axios');

/**
 * Send Slack notification with scorecard results
 */
async function sendSlackNotification(results, weekStart) {
  const webhookUrl = process.env.SLACK_SCORECARD_WEBHOOK_URL;
  if (!webhookUrl) {
    logger.warn('SLACK_SCORECARD_WEBHOOK_URL not set — skipping Slack notification');
    return;
  }

  // Group results by category
  const grouped = {};
  for (const r of results) {
    if (!grouped[r.category]) grouped[r.category] = [];
    grouped[r.category].push(r);
  }

  // Build status emoji
  function statusEmoji(r) {
    if (r.goal_value == null) return '—';
    if (r.is_on_track) return '✅';
    // Within 10% of goal
    const ratio = r.actual_value / r.goal_value;
    if (ratio >= 0.9) return '⚠️';
    return '❌';
  }

  // Format value based on display_format
  function formatValue(value, format) {
    if (value == null) return '—';
    if (format === 'currency') return `$${Number(value).toLocaleString('en-US', { minimumFractionDigits: 0, maximumFractionDigits: 0 })}`;
    if (format === 'percent') return `${value}%`;
    return Number(value).toLocaleString('en-US');
  }

  // Build text blocks per category
  const lines = [];
  for (const [category, metrics] of Object.entries(grouped)) {
    lines.push(`\n*${category}*`);
    for (const m of metrics) {
      const actual = formatValue(m.actual_value, m.display_format);
      const goal = m.goal_value != null ? formatValue(m.goal_value, m.display_format) : '—';
      const status = statusEmoji(m);
      const ownerFirst = m.owner.split(' ')[0]; // First name only
      lines.push(`  ${m.display_name} (${ownerFirst})  ·  ${actual}  |  Goal: ${goal}  ${status}`);
    }
  }

  const appUrl = process.env.APP_URL || 'https://analytics.chessat3.com';

  const payload = {
    text: `📊 Weekly EOS Scorecard — Week of ${weekStart}`,
    blocks: [
      {
        type: 'header',
        text: { type: 'plain_text', text: `📊 Weekly EOS Scorecard — Week of ${weekStart}` }
      },
      {
        type: 'section',
        text: { type: 'mrkdwn', text: lines.join('\n') }
      },
      { type: 'divider' },
      {
        type: 'context',
        elements: [{ type: 'mrkdwn', text: `<${appUrl}/analytics/scorecard|View Full Scorecard>` }]
      }
    ]
  };

  await axios.post(webhookUrl, payload);
  logger.info({ msg: 'Scorecard Slack notification sent', weekStart });
}

/**
 * Main job function
 */
async function main() {
  const environment = process.argv[2] || 'production';

  if (process.env.EOS_SCORECARD_DISABLED === 'true') {
    logger.info({ msg: 'EOS Scorecard snapshot skipped — disabled via env', environment });
    process.exit(0);
  }

  const pool = getPool(environment);
  const service = new ScorecardService(pool);

  // Calculate previous week (Mon-Sun)
  const now = new Date();
  const day = now.getDay();
  const todayMonday = new Date(now);
  todayMonday.setDate(now.getDate() - (day === 0 ? 6 : day - 1));
  const prevMonday = new Date(todayMonday);
  prevMonday.setDate(todayMonday.getDate() - 7);
  const prevSunday = new Date(prevMonday);
  prevSunday.setDate(prevMonday.getDate() + 6);

  const weekStart = prevMonday.toISOString().split('T')[0];
  const weekEnd = prevSunday.toISOString().split('T')[0];

  logger.info({ msg: 'Starting EOS Scorecard snapshot', environment, weekStart, weekEnd });

  const results = await service.snapshotWeek(weekStart, weekEnd);

  logger.info({ msg: 'Scorecard snapshot complete', metricCount: results.length, weekStart });

  await sendSlackNotification(results, weekStart);

  logger.info({ msg: 'EOS Scorecard job finished successfully' });
}

main()
  .then(() => process.exit(0))
  .catch((err) => {
    logger.error({ err, msg: 'EOS Scorecard job failed' });
    process.exit(1);
  });
