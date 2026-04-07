#!/usr/bin/env node
/**
 * Scheduled Job: Lead Score Decay
 * Reduces scores for inactive prospects — no activity in 30+ days.
 *
 * Logic:
 * - Finds prospects with a score > 0 and no recent activity
 * - "Activity" = most recent of: last note, last conversion event, last score update
 * - Reduces score by 1 point (floor at 0), recalculates tier
 * - Logs decay to lead_score_history for audit trail
 *
 * Heroku Scheduler Configuration:
 * - Frequency: Daily at 06:00 UTC (1 AM ET)
 * - Command: node jobs/lead-score-decay-job.js production
 *
 * Environments: local, staging, production, westside, eastside
 */

require('dotenv').config();
const { getPool } = require('../database-connections');
const { logger } = require('../utils/logger');

const DECAY_DAYS = 30;    // Days of inactivity before decay
const DECAY_AMOUNT = 1;   // Points to reduce per decay cycle
const MIN_SCORE = 0;      // Floor

function getTier(score) {
  if (score >= 8) return 'Hot';
  if (score >= 5) return 'Warm';
  if (score >= 3) return 'Cool';
  return 'Cold';
}

async function run(env = 'local') {
  const pool = getPool(env);
  if (!pool) {
    console.error(`No database pool for environment: ${env}`);
    process.exit(1);
  }

  logger.info({ env, decayDays: DECAY_DAYS, decayAmount: DECAY_AMOUNT }, 'Lead Score Decay starting');

  try {
    // Find prospects with scores > 0 and no activity in DECAY_DAYS
    // "Activity" = most recent of: last note, last event, last score update
    const { rows: candidates } = await pool.query(`
      SELECT
        c.id,
        c.first_name,
        c.last_name,
        c.lead_score,
        c.lead_score_tier,
        c.lead_score_components,
        c.lead_score_updated_at,
        GREATEST(
          COALESCE(c.lead_score_updated_at, '1970-01-01'::timestamptz),
          COALESCE((SELECT MAX(cn.created_at) FROM client_notes cn WHERE cn.client_id = c.id), '1970-01-01'::timestamptz),
          COALESCE((SELECT MAX(ce.created_at) FROM client_conversion_events ce WHERE ce.client_id = c.id), '1970-01-01'::timestamptz)
        ) AS last_activity
      FROM clients c
      WHERE c.status = 'prospect'
        AND c.lead_score > $1
        AND c.lead_score IS NOT NULL
        AND c.archived_at IS NULL
        AND GREATEST(
          COALESCE(c.lead_score_updated_at, '1970-01-01'::timestamptz),
          COALESCE((SELECT MAX(cn.created_at) FROM client_notes cn WHERE cn.client_id = c.id), '1970-01-01'::timestamptz),
          COALESCE((SELECT MAX(ce.created_at) FROM client_conversion_events ce WHERE ce.client_id = c.id), '1970-01-01'::timestamptz)
        ) < NOW() - INTERVAL '${DECAY_DAYS} days'
    `, [MIN_SCORE]);

    if (candidates.length === 0) {
      logger.info('No prospects eligible for score decay');
      process.exit(0);
    }

    logger.info({ count: candidates.length }, 'Prospects eligible for decay');

    let decayed = 0;
    let errors = 0;

    for (const prospect of candidates) {
      try {
        const newScore = Math.max(MIN_SCORE, prospect.lead_score - DECAY_AMOUNT);
        const newTier = getTier(newScore);

        // Update client record
        await pool.query(`
          UPDATE clients
          SET lead_score = $1,
              lead_score_tier = $2,
              lead_score_reasoning = CONCAT('Score decayed from ', lead_score::text, ' due to ${DECAY_DAYS}+ days of inactivity. Previous: ', lead_score_reasoning),
              lead_score_updated_at = NOW()
          WHERE id = $3
        `, [newScore, newTier, prospect.id]);

        // Log to history
        await pool.query(`
          INSERT INTO lead_score_history (client_id, score, tier, components, reasoning, trigger_event, model_used, tokens_used)
          VALUES ($1, $2, $3, $4, $5, 'score_decay', 'none', 0)
        `, [
          prospect.id,
          newScore,
          newTier,
          JSON.stringify(prospect.lead_score_components || {}),
          `Decayed from ${prospect.lead_score} to ${newScore} (${DECAY_DAYS}+ days inactive)`
        ]);

        decayed++;
        logger.info({
          clientId: prospect.id,
          name: `${prospect.first_name} ${prospect.last_name}`,
          oldScore: prospect.lead_score,
          newScore,
          newTier,
          lastActivity: prospect.last_activity
        }, 'Score decayed');
      } catch (err) {
        errors++;
        logger.error({ clientId: prospect.id, error: err.message }, 'Failed to decay score');
      }
    }

    logger.info({ decayed, errors, total: candidates.length }, 'Lead Score Decay complete');
    process.exit(errors > 0 ? 1 : 0);
  } catch (err) {
    logger.error({ error: err.message }, 'Lead Score Decay job failed');
    process.exit(1);
  }
}

const env = process.argv[2] || 'local';
run(env);
