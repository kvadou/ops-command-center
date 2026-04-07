// src/utils/metaTracking.js
/**
 * Meta Conversions API Server-Side Tracking Utility
 * Sends events server-side to improve Conversions API coverage
 */

/**
 * Send PageView event to Meta Conversions API server-side
 * This improves coverage rate and deduplication with pixel events
 * 
 * @param {Object} options - Tracking options
 * @param {string} options.url - Current page URL (defaults to window.location.href)
 * @param {string} options.referrer - Referrer URL (defaults to document.referrer)
 * @param {string} options.email - User email (optional, will be hashed)
 * @param {string} options.phone - User phone (optional, will be hashed)
 * @param {string} options.firstName - User first name (optional, will be hashed)
 * @param {string} options.lastName - User last name (optional, will be hashed)
 * @param {string} options.eventId - Event ID for deduplication (optional)
 * @param {number} options.timestamp - Unix timestamp in seconds (optional, defaults to now)
 */
export async function sendPageViewToServer(options = {}) {
  // Don't send if we're in SSR or API is not available
  if (typeof window === 'undefined' || typeof fetch === 'undefined') {
    return;
  }

  try {
    const {
      url = window.location.href,
      referrer = document.referrer,
      email,
      phone,
      firstName,
      lastName,
      eventId,
      timestamp,
    } = options;

    // Send to server-side endpoint
    await fetch('/api/meta-tracking/pageview', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        url,
        referrer,
        email,
        phone,
        firstName,
        lastName,
        eventId,
        timestamp,
      }),
    });

    // Silently succeed - don't log unless there's an error
  } catch (error) {
    // Silently fail - don't break the app if server-side tracking fails
    // Only log in development
    if (process.env.NODE_ENV === 'development') {
      console.warn('Failed to send PageView to Meta Conversions API server-side:', error);
    }
  }
}

/**
 * Send custom event to Meta Conversions API server-side
 * 
 * @param {Object} options - Event options
 * @param {string} options.eventName - Event name (required)
 * @param {string} options.url - Current page URL
 * @param {string} options.email - User email (optional)
 * @param {string} options.phone - User phone (optional)
 * @param {string} options.firstName - User first name (optional)
 * @param {string} options.lastName - User last name (optional)
 * @param {string} options.eventId - Event ID for deduplication
 * @param {number} options.timestamp - Unix timestamp in seconds
 * @param {number} options.value - Event value (for Purchase events)
 * @param {string} options.currency - Currency code (default: USD)
 * @param {Object} options.customData - Additional custom data
 */
export async function sendEventToServer(options = {}) {
  if (typeof window === 'undefined' || typeof fetch === 'undefined') {
    return;
  }

  try {
    const {
      eventName,
      url = window.location.href,
      email,
      phone,
      firstName,
      lastName,
      eventId,
      timestamp,
      value,
      currency = 'USD',
      customData = {},
    } = options;

    if (!eventName) {
      console.warn('sendEventToServer: eventName is required');
      return;
    }

    await fetch('/api/meta-tracking/event', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        eventName,
        url,
        email,
        phone,
        firstName,
        lastName,
        eventId,
        timestamp,
        value,
        currency,
        customData,
      }),
    });
  } catch (error) {
    if (process.env.NODE_ENV === 'development') {
      console.warn(`Failed to send ${options.eventName} to Meta Conversions API server-side:`, error);
    }
  }
}

/**
 * Generate event ID for deduplication
 * Matches the format used by pixel events when possible
 * 
 * @param {string} eventName - Event name
 * @param {string} sessionId - Session ID (optional)
 * @returns {string} Event ID
 */
export function generateEventId(eventName, sessionId = null) {
  const timestamp = Math.floor(Date.now() / 1000);
  const sessionPart = sessionId ? `_${sessionId}` : '';
  return `${eventName}_${timestamp}${sessionPart}`;
}

