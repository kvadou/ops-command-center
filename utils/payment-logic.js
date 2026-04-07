/**
 * Payment & pipeline logic utilities
 * Extracted from routes/api-payments.js for testability
 */

/**
 * Database-level atomic lock for processing (replaces in-memory PROCESSING_TRACKER)
 * This works across multiple Heroku dynos because it uses PostgreSQL
 * @param {Object} pool - Database pool
 * @param {number} submissionId - Booking submission ID
 * @returns {Promise<boolean>} True if lock was claimed
 */

const { logger } = require('./logger');
async function claimProcessingLock(pool, submissionId) {
  const result = await pool.query(
    `UPDATE booking_submissions
     SET job_processing_claimed_at = NOW()
     WHERE id = $1 AND job_processing_claimed_at IS NULL
     RETURNING id`,
    [submissionId]
  );

  if (result.rows.length > 0) {
    logger.info(`🔒 Claimed processing lock for submission ${submissionId}`);
    return true;
  }

  logger.info(`⏳ Processing lock already held for submission ${submissionId}, skipping duplicate`);
  return false;
}

/**
 * Clear the processing lock (for error recovery)
 * @param {Object} pool - Database pool
 * @param {number} submissionId - Booking submission ID
 */
async function releaseProcessingLock(pool, submissionId) {
  await pool.query(
    `UPDATE booking_submissions SET job_processing_claimed_at = NULL WHERE id = $1`,
    [submissionId]
  );
  logger.info(`🔓 Released processing lock for submission ${submissionId}`);
}

/**
 * Determine pipeline stage ID based on booking type
 * @param {string} bookingType - Booking type (e.g., "Home - Trial", "Home", "Online")
 * @param {string} lessonType - Lesson type (e.g., "Home", "Online", "Club")
 * @param {string} labelName - Label name (e.g., "Home - NYC", "Tournament")
 * @param {Object} pool - Database pool
 * @returns {Promise<number|null>} Pipeline stage ID or null if not found/excluded
 */
async function determinePipelineStage(bookingType, lessonType, labelName, pool) {
  try {
    // Skip CCT for Tournament booking forms - these are one-time events, not ongoing lessons
    if (labelName && labelName.toLowerCase().includes('tournament')) {
      logger.info(`ℹ️ Skipping pipeline tracking for Tournament booking (label: ${labelName})`);
      return null;
    }

    // Skip CCT for Service Catalog forms (forms with no standard lesson type)
    // Standard lesson types are: Home, Online, Club
    const standardLessonTypes = ['home', 'online', 'club'];
    if (!lessonType || !standardLessonTypes.includes(lessonType.toLowerCase())) {
      logger.info(`ℹ️ Skipping pipeline tracking for non-standard lesson type: ${lessonType || 'none'} (label: ${labelName || 'none'})`);
      return null;
    }

    // For Club bookings, return "Clubs" stage (they go directly into the Clubs column)
    if (lessonType === "Club") {
      const clubsStageResult = await pool.query(
        `SELECT id FROM pipeline_stages WHERE LOWER(name) = 'clubs' LIMIT 1`
      );
      return clubsStageResult.rows.length > 0 ? clubsStageResult.rows[0].id : null;
    }

    // ALL other bookings (Home, Online, Trial, etc.) start as "New Lead"
    // Jena will manually move them through: New Lead → Home/Online → Waiting to Pair → Trial
    // This ensures every new booking appears in CCT for follow-up and tutor pairing
    const newLeadStageResult = await pool.query(
      `SELECT id FROM pipeline_stages WHERE LOWER(name) = 'new lead' LIMIT 1`
    );
    return newLeadStageResult.rows.length > 0 ? newLeadStageResult.rows[0].id : null;
  } catch (error) {
    logger.error({ error: error.message }, `❌ Error determining pipeline stage:`);
    return null;
  }
}

/**
 * Determine market from label name
 * @param {string} labelName - Label name (e.g., "Home - NYC", "Home - LA")
 * @returns {string} Market name (NYC, LA, SF, Hamptons, Online, Other)
 */
function determineMarket(labelName) {
  if (!labelName) return 'Other';

  const labelLower = labelName.toLowerCase();
  if (labelLower.includes('park slope')) return 'Park Slope Club';
  if (labelLower.includes('nyc') || labelLower.includes('new york') || labelLower.includes('ues')) return 'NYC';
  if (labelLower.includes('la') || labelLower.includes('los angeles')) return 'LA';
  if (labelLower.includes('sf') || labelLower.includes('san francisco')) return 'SF';
  if (labelLower.includes('hamptons')) return 'Hamptons';
  if (labelLower.includes('online')) return 'Online';
  if (labelLower.includes('westchester')) return 'Westchester';

  return 'Other';
}

/**
 * Determine conversion status based on pipeline stage
 * @param {string} pipelineStageName - Pipeline stage name
 * @param {string} bookingType - Booking type
 * @returns {string} Conversion status
 */
function determineConversionStatus(pipelineStageName, bookingType) {
  if (!pipelineStageName) return 'prospect';

  const stageLower = pipelineStageName.toLowerCase();
  if (stageLower.includes('trial')) return 'trial_scheduled';
  if (stageLower.includes('waiting to pair')) return 'waiting_to_pair';
  if (stageLower.includes('won')) return 'converted';

  // For trial bookings, default to trial_scheduled
  if (bookingType && bookingType.toLowerCase().includes('trial')) {
    return 'trial_scheduled';
  }

  return 'prospect';
}

module.exports = {
  claimProcessingLock,
  releaseProcessingLock,
  determinePipelineStage,
  determineMarket,
  determineConversionStatus
};
