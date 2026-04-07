#!/usr/bin/env node
/**
 * Scheduled Job: Referral Points Accumulation
 * Updates points for all tracking referrals and checks for tier milestones.
 *
 * Heroku Scheduler Configuration:
 * - Frequency: Daily at 08:00 UTC (3 AM ET / 4 AM EDT)
 * - Command: node jobs/referral-points-job.js [environment]
 *
 * Environments: local, staging, production, westside, eastside
 */

require('dotenv').config();
const { getPool } = require('../database-connections');
const ReferralService = require('../services/referral-service');
const { logger } = require('../utils/logger');

async function main() {
  const environment = process.argv[2] || 'production';

  if (process.env.REFERRAL_POINTS_DISABLED === 'true') {
    logger.info({ msg: 'Referral points job skipped — disabled via env', environment });
    process.exit(0);
  }

  const pool = getPool(environment);
  const service = new ReferralService(pool);

  logger.info({ msg: 'Starting referral points accumulation', environment });

  const results = await service.updateAllTrackingPoints();

  logger.info({
    msg: 'Referral points job complete',
    environment,
    ...results
  });

  // Check for new tier milestones (every 5 conversions = pay tier change)
  if (results.converted > 0) {
    // Get the newly converted referrals' tutors
    const { rows: newConversions } = await pool.query(`
      SELECT DISTINCT contractor_id, c.first_name, c.last_name
      FROM tutor_referrals tr
      LEFT JOIN contractors c ON c.contractor_id = tr.contractor_id
      WHERE tr.status = 'converted'
        AND tr.converted_at >= NOW() - INTERVAL '1 day'
    `);

    for (const tutor of newConversions) {
      const stats = await service.getTutorStats(tutor.contractor_id);
      const isMilestone = stats.total_converted % 5 === 0;

      if (isMilestone) {
        logger.info({
          msg: 'Tutor hit referral pay tier milestone',
          contractor_id: tutor.contractor_id,
          tutor_name: `${tutor.first_name} ${tutor.last_name}`,
          total_converted: stats.total_converted,
          pay_tier: stats.pay_tier,
          rate_bonus: stats.rate_bonus
        });
        // TODO: Send Slack notification for tier milestone
      }
    }
  }
}

main()
  .then(() => process.exit(0))
  .catch((err) => {
    logger.error({ err, msg: 'Referral points job failed' });
    process.exit(1);
  });
