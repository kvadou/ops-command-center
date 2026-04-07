/**
 * Webhook Idempotency Utilities
 * Prevents duplicate processing when external systems retry webhooks
 */

const { logger } = require('./logger');

/**
 * Check if a webhook event has already been processed
 * @param {object} pool - Database pool
 * @param {string} eventId - Unique event ID from webhook source
 * @param {string} eventSource - Source system (tutorcruncher, stripe, missive, brevo)
 * @returns {Promise<boolean>} - True if already processed
 */
async function isEventProcessed(pool, eventId, eventSource) {
  if (!eventId) return false;

  try {
    const result = await pool.query(
      `SELECT id, processing_status FROM webhook_events
       WHERE event_id = $1 AND event_source = $2`,
      [eventId, eventSource]
    );

    if (result.rows.length > 0) {
      const status = result.rows[0].processing_status;
      // Consider 'completed' and 'processing' as already handled
      // Only 'failed' events should potentially be retried
      if (status === 'completed' || status === 'processing') {
        logger.info({
          event: 'webhook_duplicate_detected',
          eventId,
          eventSource,
          status
        }, `Duplicate webhook detected: ${eventSource}/${eventId}`);
        return true;
      }
    }
    return false;
  } catch (error) {
    // If table doesn't exist yet, allow processing (graceful degradation)
    if (error.code === '42P01') {
      logger.warn({ event: 'webhook_table_missing' }, 'webhook_events table not found, skipping dedup check');
      return false;
    }
    logger.error({ error: error.message, eventId, eventSource }, 'Error checking webhook idempotency');
    return false; // Allow processing on error
  }
}

/**
 * Mark a webhook event as being processed (claim it)
 * @param {object} pool - Database pool
 * @param {string} eventId - Unique event ID
 * @param {string} eventSource - Source system
 * @param {string} eventType - Type of event (e.g., 'checkout.session.completed')
 * @param {object} metadata - Optional metadata to store
 * @returns {Promise<boolean>} - True if successfully claimed (not duplicate)
 */
async function claimEvent(pool, eventId, eventSource, eventType = null, metadata = null) {
  if (!eventId) return true; // No ID = always process

  try {
    await pool.query(
      `INSERT INTO webhook_events (event_id, event_source, event_type, processing_status, metadata)
       VALUES ($1, $2, $3, 'processing', $4)
       ON CONFLICT (event_id, event_source) DO NOTHING`,
      [eventId, eventSource, eventType, metadata ? JSON.stringify(metadata) : null]
    );

    // Check if we actually inserted (claimed the event)
    const result = await pool.query(
      `SELECT processing_status FROM webhook_events
       WHERE event_id = $1 AND event_source = $2`,
      [eventId, eventSource]
    );

    if (result.rows.length > 0 && result.rows[0].processing_status === 'processing') {
      return true; // We claimed it
    }

    logger.info({
      event: 'webhook_already_claimed',
      eventId,
      eventSource
    }, `Webhook already claimed: ${eventSource}/${eventId}`);
    return false;
  } catch (error) {
    if (error.code === '42P01') {
      logger.warn({ event: 'webhook_table_missing' }, 'webhook_events table not found');
      return true; // Allow processing
    }
    logger.error({ error: error.message, eventId, eventSource }, 'Error claiming webhook event');
    return true; // Allow processing on error
  }
}

/**
 * Mark a webhook event as completed
 * @param {object} pool - Database pool
 * @param {string} eventId - Unique event ID
 * @param {string} eventSource - Source system
 */
async function markEventCompleted(pool, eventId, eventSource) {
  if (!eventId) return;

  try {
    await pool.query(
      `UPDATE webhook_events
       SET processing_status = 'completed', processed_at = NOW()
       WHERE event_id = $1 AND event_source = $2`,
      [eventId, eventSource]
    );
  } catch (error) {
    if (error.code !== '42P01') {
      logger.error({ error: error.message, eventId, eventSource }, 'Error marking webhook completed');
    }
  }
}

/**
 * Mark a webhook event as failed
 * @param {object} pool - Database pool
 * @param {string} eventId - Unique event ID
 * @param {string} eventSource - Source system
 * @param {string} errorMessage - Error message
 */
async function markEventFailed(pool, eventId, eventSource, errorMessage) {
  if (!eventId) return;

  try {
    await pool.query(
      `UPDATE webhook_events
       SET processing_status = 'failed', error_message = $3, processed_at = NOW()
       WHERE event_id = $1 AND event_source = $2`,
      [eventId, eventSource, errorMessage]
    );
  } catch (error) {
    if (error.code !== '42P01') {
      logger.error({ error: error.message, eventId, eventSource }, 'Error marking webhook failed');
    }
  }
}

/**
 * Generate a unique event ID for TutorCruncher webhooks
 * TC doesn't provide unique event IDs, so we generate one from the payload
 * @param {object} event - TC webhook event
 * @returns {string} - Generated event ID
 */
function generateTCEventId(event) {
  if (!event) return null;

  const action = event.action || 'unknown';
  const model = event.subject?.model || 'unknown';
  const id = event.subject?.id || event.subject?.appointment_id || 'unknown';
  const timestamp = event.timestamp || Date.now();

  // Create a deterministic ID based on the event content
  return `tc_${model}_${id}_${action}_${timestamp}`;
}

/**
 * Cleanup old webhook events (run periodically)
 * @param {object} pool - Database pool
 * @param {number} daysToKeep - How many days of events to retain
 */
async function cleanupOldEvents(pool, daysToKeep = 30) {
  try {
    const result = await pool.query(
      `DELETE FROM webhook_events
       WHERE processed_at < NOW() - INTERVAL '${daysToKeep} days'
       RETURNING id`
    );

    if (result.rowCount > 0) {
      logger.info({
        event: 'webhook_cleanup',
        deletedCount: result.rowCount,
        daysToKeep
      }, `Cleaned up ${result.rowCount} old webhook events`);
    }
  } catch (error) {
    if (error.code !== '42P01') {
      logger.error({ error: error.message }, 'Error cleaning up webhook events');
    }
  }
}

module.exports = {
  isEventProcessed,
  claimEvent,
  markEventCompleted,
  markEventFailed,
  generateTCEventId,
  cleanupOldEvents
};
