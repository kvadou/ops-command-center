/**
 * Missive Sync Job
 *
 * Periodically syncs conversations and messages from Missive API
 * to capture outgoing emails that webhooks don't provide.
 *
 * Run manually: node jobs/missive-sync-job.js
 * Or scheduled via Heroku Scheduler
 */

const missiveSyncService = require('../services/missive-sync-service');
const { logger } = require('../utils/logger');

async function run() {
  logger.info('🔄 Starting scheduled Missive sync job...');
  logger.info({ data: new Date().toISOString() }, 'Time:');

  if (!missiveSyncService.isConfigured()) {
    logger.info('⚠️ Missive API not configured. Skipping sync.');
    process.exit(0);
  }

  try {
    const stats = await missiveSyncService.syncRecentMessages({
      conversationLimit: 50,
      messageLimit: 10,
      verbose: false
    });

    logger.info('✅ Missive sync job completed');
    logger.info({ data: JSON.stringify(stats, null, 2) }, 'Stats:');

    process.exit(0);
  } catch (error) {
    logger.error({ error: error.message }, '❌ Missive sync job failed:');
    process.exit(1);
  }
}

run();
