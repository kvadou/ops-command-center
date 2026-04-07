/**
 * Database-backed duplicate email prevention for booking notifications
 * Prevents duplicate emails from being sent to support@acmeops.com
 * Works across multiple dynos/instances and persists across server restarts
 */


const { logger } = require('./logger');
const { pool } = global;

/**
 * Check if email was already sent and mark it as sent
 * Uses atomic database update to prevent race conditions
 * @param {number} submissionId - The booking submission ID
 * @param {string} bookingType - Type of booking (club, non-trial, trial)
 * @returns {Promise<boolean>} - Returns true if email should be sent, false if duplicate
 */
async function checkAndMarkEmailSent(submissionId, bookingType) {
  try {
    // First check if email was sent in the last 5 minutes (prevent duplicates)
    const checkResult = await pool.query(`
      SELECT booking_notification_sent_at 
      FROM booking_submissions 
      WHERE id = $1
    `, [submissionId]);
    
    const sentAt = checkResult.rows[0]?.booking_notification_sent_at;
    
    // If email was sent in the last 5 minutes, skip duplicate
    if (sentAt) {
      const sentTime = new Date(sentAt);
      const fiveMinutesAgo = new Date(Date.now() - 5 * 60 * 1000);
      
      if (sentTime > fiveMinutesAgo) {
        logger.info(`📧 Email already sent for submission ${submissionId} (${bookingType}) at ${sentAt}, skipping duplicate`);
        return false;
      }
    }
    
    // Use atomic UPDATE to mark email as sent (prevents race conditions)
    // Only update if it's NULL or older than 5 minutes (allows re-send after 5 min window)
    const result = await pool.query(`
      UPDATE booking_submissions 
      SET booking_notification_sent_at = NOW()
      WHERE id = $1 
        AND (booking_notification_sent_at IS NULL OR booking_notification_sent_at < NOW() - INTERVAL '5 minutes')
      RETURNING booking_notification_sent_at
    `, [submissionId]);
    
    // If no rows were updated, another process just sent the email (race condition prevented)
    if (result.rowCount === 0) {
      logger.info(`📧 Email send already in progress for submission ${submissionId} (${bookingType}), skipping duplicate`);
      return false;
    }
    
    logger.info(`📧 Marking email as sent for submission ${submissionId} (${bookingType})`);
    return true;
  } catch (error) {
    logger.error({ err: error }, `❌ Error checking email sent status for submission ${submissionId}:`);
    // Fallback: allow email to be sent if database check fails (better than blocking legitimate emails)
    return true;
  }
}

module.exports = {
  checkAndMarkEmailSent
};

