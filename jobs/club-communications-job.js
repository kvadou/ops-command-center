/**
 * Club Communications Job
 *
 * Runs automated club communications:
 * - Class reminders (24hrs before)
 * - Missed class follow-ups (after class completes)
 * - Trial follow-up sequences (1, 3, 7 days after trial)
 *
 * Intended to run every hour via Heroku Scheduler.
 * All methods are idempotent — safe to run multiple times.
 *
 * Run manually: node jobs/club-communications-job.js
 */

require('dotenv').config();
const { getPool } = require('../database-connections');
const ClubCommunicationsService = require('../services/club-communications-service');
const { logger } = require('../utils/logger');

// Determine environment from Heroku app name or DATABASE_URL
function getEnvironment() {
  const dbUrl = process.env.DATABASE_URL || '';
  if (dbUrl.includes('c5cqb8h0eop3g3')) return 'eastside';
  if (dbUrl.includes('c2hbg00ac72j9d')) return 'westside';
  if (dbUrl.includes('c38vi3s2tbags3')) return 'production';
  if (dbUrl.includes('c5cnr847jq0fj3')) return 'staging';

  const herokuApp = process.env.HEROKU_APP_NAME || process.env.DYNO?.split('.')[0];
  if (herokuApp?.includes('eastside')) return 'eastside';
  if (herokuApp?.includes('westside')) return 'westside';
  if (herokuApp?.includes('main')) return 'production';
  if (herokuApp?.includes('staging')) return 'staging';

  return process.env.DATABASE_URL && !dbUrl.includes('localhost') ? 'production' : 'local';
}

async function runClubCommunications() {
  const env = getEnvironment();
  const pool = getPool(env);
  const service = new ClubCommunicationsService(pool);

  logger.info({ environment: env }, 'Club communications job starting');

  try {
    // Get all active clubs
    const { rows: clubs } = await pool.query(
      "SELECT id, name, slug FROM clubs WHERE status = 'active'"
    );

    if (clubs.length === 0) {
      logger.info('No active clubs found — nothing to process');
      return;
    }

    logger.info({ clubCount: clubs.length }, 'Processing active clubs');

    for (const club of clubs) {
      logger.info({ clubId: club.id, clubName: club.name }, 'Running club communications');

      // Get automation settings for this club
      const settings = await service.getAutomationSettings(club.id);

      if (settings.class_reminders_enabled) {
        try {
          const sent = await service.sendClassReminders(club.id);
          logger.info({ clubId: club.id, sent }, 'Class reminders processed');
        } catch (err) {
          logger.error({ err, clubId: club.id }, 'Class reminders failed');
        }
      }

      if (settings.missed_class_followup_enabled) {
        try {
          const sent = await service.sendMissedClassFollowups(club.id);
          logger.info({ clubId: club.id, sent }, 'Missed class follow-ups processed');
        } catch (err) {
          logger.error({ err, clubId: club.id }, 'Missed class follow-ups failed');
        }
      }

      if (settings.trial_followup_enabled) {
        try {
          const sent = await service.sendTrialFollowups(club.id);
          logger.info({ clubId: club.id, sent }, 'Trial follow-ups processed');
        } catch (err) {
          logger.error({ err, clubId: club.id }, 'Trial follow-ups failed');
        }
      }
    }

    logger.info('Club communications job completed');
  } catch (err) {
    logger.error({ err }, 'Club communications job failed');
    process.exit(1);
  }
}

// Run if called directly
if (require.main === module) {
  runClubCommunications()
    .then(() => process.exit(0))
    .catch((err) => {
      logger.error({ err }, 'Fatal error in club communications job');
      process.exit(1);
    });
}

module.exports = { runClubCommunications };
