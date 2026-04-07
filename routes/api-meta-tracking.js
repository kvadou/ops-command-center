// routes/api-meta-tracking.js
/**
 * Meta Conversions API Tracking Endpoint
 * Sends PageView and other events server-side to improve Conversions API coverage
 */

const express = require('express');
const router = express.Router();
const MetaAdsService = require('../services/meta-ads-api');
const crypto = require('crypto');
const { asyncHandler } = require('../middleware/error-handler');
const { logger } = require('../utils/logger');

// Initialize MetaAdsService with error handling
let metaService;
try {
  metaService = new MetaAdsService();
  // Ensure enabled property exists
  if (typeof metaService.enabled === 'undefined') {
    metaService.enabled = false;
  }
} catch (error) {
  logger.error({ err: error }, 'Error initializing MetaAdsService:');
  // Create a disabled service object to prevent errors
  metaService = { enabled: false };
}

/**
 * Hash user data for privacy (SHA256)
 * @param {string} value - Value to hash
 * @returns {string} Hashed value
 */
function hashUserData(value) {
  if (!value) return null;
  return crypto.createHash('sha256').update(value.toLowerCase().trim()).digest('hex');
}

/**
 * Generate event ID for deduplication
 * Format: {eventName}_{timestamp}_{hash}
 */
function generateEventId(eventName, userData, timestamp) {
  const hashInput = [
    eventName,
    timestamp,
    userData.email || '',
    userData.phone || '',
    userData.firstName || '',
    userData.lastName || ''
  ].join('_');
  
  const hash = crypto.createHash('md5').update(hashInput).digest('hex').substring(0, 8);
  return `${eventName}_${timestamp}_${hash}`;
}

/**
 * POST /api/meta-tracking/pageview
 * Send PageView event to Meta Conversions API server-side
 * This improves Conversions API coverage and deduplication with pixel events
 */
router.post('/pageview', asyncHandler(async (req, res) => {
  // Wrap everything in a try-catch to ensure we never return 500
  try {
    // Check if metaService is properly initialized
    if (!metaService || !metaService.enabled) {
      // Return 200 with skipped flag - don't treat as error since tracking is optional
      return res.status(200).json({ 
        success: false,
        skipped: true,
        message: 'Meta Conversions API not configured - event skipped'
      });
    }

    const {
      url,
      referrer,
      userAgent,
      // User data (optional, will be hashed)
      email,
      phone,
      firstName,
      lastName,
      // Event metadata
      eventId, // If provided, use this for deduplication (should match pixel event ID)
      timestamp, // Unix timestamp in seconds (defaults to now)
    } = req.body || {};

    const eventTime = timestamp || Math.floor(Date.now() / 1000);
    const eventSourceUrl = url || req.headers.referer || 'https://join.acmeops.com';
    
    // Generate event ID if not provided
    // For deduplication with pixel events, the pixel should send the same eventId
    let finalEventId;
    try {
      finalEventId = eventId || generateEventId('PageView', { email, phone, firstName, lastName }, eventTime);
    } catch (idError) {
      logger.error({ data: idError }, 'Error generating event ID:');
      finalEventId = `PageView_${eventTime}_${Math.random().toString(36).substring(7)}`;
    }

    // Prepare user data (hash PII) - wrap in try-catch for safety
    let userData = {};
    try {
      userData = {
        email: email ? hashUserData(email) : null,
        phone: phone ? hashUserData(phone) : null,
        firstName: firstName ? hashUserData(firstName) : null,
        lastName: lastName ? hashUserData(lastName) : null,
      };
    } catch (hashError) {
      logger.error({ data: hashError }, 'Error hashing user data:');
      // Continue without hashed data
    }

    // Send PageView event to Meta Conversions API - wrap in try-catch
    try {
      if (metaService && typeof metaService.uploadOfflineEvent === 'function') {
        await metaService.uploadOfflineEvent({
          eventName: 'PageView',
          eventTime: eventTime,
          eventId: finalEventId,
          eventSourceUrl: eventSourceUrl,
          email: email,
          phone: phone,
          firstName: firstName,
          lastName: lastName,
          value: 0,
          currency: 'USD',
        });
      }
    } catch (metaError) {
      // Log but don't fail - tracking is non-critical
      logger.error({ data: metaError.message }, 'Error calling Meta API (non-critical):');
      // Continue to return success since the event was processed
    }

    // Ensure response is sent properly
    if (!res.headersSent) {
      return res.status(200).json({ 
        success: true,
        eventId: finalEventId,
        message: 'PageView event sent to Meta Conversions API'
      });
    }
  } catch (error) {
    // Log detailed error information
    logger.error('Error in PageView endpoint (non-critical):');
    logger.error({ error: error.message }, 'Error message:');
    logger.error({ data: error.stack }, 'Error stack:');
    if (error.response) {
      logger.error({ data: JSON.stringify(error.response, null, 2) }, 'Meta API Response:');
    }
    
    // Always return 200 with error details - don't fail the request since tracking is non-critical
    // This prevents the 500 error from showing in the browser console
    if (!res.headersSent) {
      try {
        return res.status(200).json({ 
          success: false,
          skipped: true,
          error: 'Failed to send PageView event',
          message: error.message || 'Unknown error',
          details: error.response ? JSON.stringify(error.response) : undefined
        });
      } catch (responseError) {
        // If even sending the error response fails, log it but don't throw
        logger.error({ data: responseError }, 'Error sending error response:');
        // Response may have already been sent, so we can't do anything else
      }
    }
  }
}));

/**
 * POST /api/meta-tracking/event
 * Send custom event to Meta Conversions API server-side
 */
router.post('/event', asyncHandler(async (req, res) => {
  try {
    if (!metaService.enabled) {
      // Return 200 with skipped flag - don't treat as error since tracking is optional
      return res.json({ 
        success: false,
        skipped: true,
        message: 'Meta Conversions API not configured - event skipped'
      });
    }

    const {
      eventName, // Required: 'PageView', 'Lead', 'CompleteRegistration', etc.
      url,
      email,
      phone,
      firstName,
      lastName,
      eventId,
      timestamp,
      value,
      currency = 'USD',
      customData = {},
    } = req.body;

    if (!eventName) {
      return res.status(400).json({ error: 'eventName is required' });
    }

    const eventTime = timestamp || Math.floor(Date.now() / 1000);
    const eventSourceUrl = url || req.headers.referer || 'https://join.acmeops.com';
    const finalEventId = eventId || generateEventId(eventName, { email, phone, firstName, lastName }, eventTime);

    await metaService.uploadOfflineEvent({
      eventName: eventName,
      eventTime: eventTime,
      eventId: finalEventId,
      eventSourceUrl: eventSourceUrl,
      email: email,
      phone: phone,
      firstName: firstName,
      lastName: lastName,
      value: value || 0,
      currency: currency,
      customData: customData,
    });

    res.json({ 
      success: true,
      eventId: finalEventId,
      message: `${eventName} event sent to Meta Conversions API`
    });
  } catch (error) {
    // Log detailed error information
    logger.error({ eventName: req.body.eventName || 'event' }, 'Error sending event to Meta Conversions API');
    logger.error({ error: error.message }, 'Error message:');
    logger.error({ data: error.stack }, 'Error stack:');
    if (error.response) {
      logger.error({ data: JSON.stringify(error.response, null, 2) }, 'Meta API Response:');
    }
    
    // Return 200 with error details - don't fail the request since tracking is non-critical
    // This prevents the 500 error from showing in the browser console
    res.json({ 
      success: false,
      skipped: true,
      error: 'Failed to send event',
      message: error.message || 'Unknown error',
      details: error.response ? JSON.stringify(error.response) : undefined
    });
  }
}));

module.exports = router;

