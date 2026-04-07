#!/usr/bin/env node
/**
 * Scheduled Job: Auto-Archive "Sync to Website" Services
 * Archives services with "Sync to Website" label that have been inactive for 30+ days.
 * Marks them as "finished" in TutorCruncher and archived in local DB.
 *
 * Heroku Scheduler Configuration:
 * - Frequency: Daily
 * - Time: 4:00 AM UTC (after sync and analytics jobs)
 * - Command: node jobs/auto-archive-services-job.js
 *
 * Dry run: DRY_RUN=true node jobs/auto-archive-services-job.js
 */

require('dotenv').config();
const { Pool } = require('pg');
const axios = require('axios');
const Bottleneck = require('bottleneck');
const { getPool } = require('../database-connections');
const cache = require('../utils/cache');
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

const environment = process.argv[2] || getEnvironment();
const pool = getPool(environment);
const isDryRun = process.env.DRY_RUN === 'true';

// TutorCruncher API setup
const tutorCruncherAPI = axios.create({
  baseURL: process.env.TUTORCRUNCHER_API_BASE || 'https://account.acmeops.com/api/',
  headers: {
    Authorization: `token ${process.env.TUTORCRUNCHER_API_TOKEN}`,
  },
  timeout: 60000,
});

// Rate limiting - 1 req/sec, max 5 concurrent
const limiter = new Bottleneck({
  reservoir: 3600,
  reservoirRefreshAmount: 3600,
  reservoirRefreshInterval: 60 * 60 * 1000,
  maxConcurrent: 5,
  minTime: 1000,
});

const limitedPut = (url, data) => limiter.schedule(() => tutorCruncherAPI.put(url, data));

// Delay helper
const delay = (ms) => new Promise(resolve => setTimeout(resolve, ms));

// Rate limit retry helper
const rateLimitRetry = async (fn, maxRetries = 3) => {
  for (let i = 0; i < maxRetries; i++) {
    try {
      return await fn();
    } catch (err) {
      if (err.response?.status === 429 && i < maxRetries - 1) {
        const waitTime = Math.pow(2, i) * 1000;
        logger.info(`Rate limited, waiting ${waitTime}ms before retry...`);
        await delay(waitTime);
        continue;
      }
      throw err;
    }
  }
};

async function findArchiveCandidates() {
  const { rows } = await pool.query(`
    SELECT s.service_id, s.name, s.labels,
      (SELECT MAX(a.start) FROM appointments a
       WHERE a.service_id::text = s.service_id::text
         AND a.status IN ('complete', 'cancelled-chargeable')
      ) AS last_completed_lesson
    FROM services s
    WHERE COALESCE(s.archived, false) = false
      AND EXISTS (
        SELECT 1 FROM jsonb_array_elements_text(s.labels) AS label
        WHERE LOWER(label) LIKE '%sync to website%'
      )
      AND NOT EXISTS (
        SELECT 1 FROM appointments a
        WHERE a.service_id::text = s.service_id::text
          AND a.status = 'planned'
          AND a.is_deleted IS NOT TRUE
          AND a.start > NOW()
      )
      AND (
        SELECT MAX(a.start) FROM appointments a
        WHERE a.service_id::text = s.service_id::text
          AND a.status IN ('complete', 'cancelled-chargeable')
      ) < NOW() - INTERVAL '30 days'
  `);
  return rows;
}

async function archiveService(serviceId, serviceName) {
  const serviceIdStr = serviceId.toString();

  // 1. Mark as "finished" in TutorCruncher
  try {
    await rateLimitRetry(() => limitedPut(`/services/${serviceIdStr}/`, { status: 'finished' }));
    logger.info({ serviceId: serviceIdStr, serviceName }, 'Marked service as finished in TutorCruncher');
  } catch (err) {
    // Log but continue — TC may already have it finished, or the service may not exist in TC
    logger.warn({ serviceId: serviceIdStr, serviceName, err: err.message }, 'Failed to mark service as finished in TC (continuing with local archive)');
  }

  // 2. Archive in local services table (raw)
  await pool.query(
    `UPDATE services SET archived = true, archived_at = NOW() WHERE service_id::text = $1`,
    [serviceIdStr]
  );

  // 3. Archive in curated "Services" table
  try {
    await pool.query(
      `UPDATE public."Services" SET "archived" = true, "archivedAt" = NOW() WHERE "serviceId" = $1`,
      [serviceIdStr]
    );
  } catch (err) {
    // Curated table may not have this service — that's fine
    logger.info({ serviceId: serviceIdStr, err: err.message }, 'Note: Could not archive in curated Services table');
  }
}

async function run() {
  logger.info({ environment, isDryRun }, 'Auto-archive services job starting');

  const candidates = await findArchiveCandidates();
  logger.info({ count: candidates.length, environment }, `Found ${candidates.length} inactive "Sync to Website" services to archive`);

  if (candidates.length === 0) {
    logger.info('No services to archive. Job complete.');
    return { archived: 0, errors: 0 };
  }

  // Log all candidates
  for (const svc of candidates) {
    const daysSince = Math.floor((Date.now() - new Date(svc.last_completed_lesson).getTime()) / (1000 * 60 * 60 * 24));
    logger.info({
      serviceId: svc.service_id,
      serviceName: svc.name,
      lastLesson: svc.last_completed_lesson,
      daysSinceLastLesson: daysSince,
    }, `Candidate: ${svc.name} (${svc.service_id}) — ${daysSince} days since last lesson`);
  }

  if (isDryRun) {
    logger.info({ count: candidates.length }, 'DRY RUN — no changes made');
    return { archived: 0, errors: 0, dryRun: true, candidates: candidates.length };
  }

  let archived = 0;
  let errors = 0;

  for (const svc of candidates) {
    try {
      await archiveService(svc.service_id, svc.name);
      archived++;
      logger.info({ serviceId: svc.service_id, serviceName: svc.name }, `Archived service: ${svc.name}`);
    } catch (err) {
      errors++;
      logger.error({ serviceId: svc.service_id, serviceName: svc.name, err }, `Failed to archive service: ${svc.name}`);
    }
  }

  // Clear services cache after archiving
  if (archived > 0) {
    await cache.clearCacheByPrefix('services');
    logger.info('Cleared services cache');
  }

  logger.info({ archived, errors, environment }, `Auto-archive job complete: ${archived} archived, ${errors} errors`);
  return { archived, errors };
}

// Run the job
run()
  .then((result) => {
    logger.info({ result }, 'Auto-archive services job finished');
    process.exit(result.errors > 0 ? 1 : 0);
  })
  .catch((err) => {
    logger.error({ err }, 'Auto-archive services job failed');
    process.exit(1);
  });
