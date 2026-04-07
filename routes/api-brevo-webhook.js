/**
 * Brevo Webhook Endpoint
 * Handles tracking events from Brevo (opens, clicks, bounces, etc.)
 */

const express = require('express');
const router = express.Router();
const brevoTracking = require('../utils/brevo-tracking');
const { getPool } = require('../database-connections');
const { asyncHandler } = require('../middleware/error-handler');
const { logger } = require('../utils/logger');

/**
 * GET /api/brevo-webhook
 * Health check endpoint for Brevo webhook
 */
router.get('/', asyncHandler(async (req, res) => {
  try {
    logger.info('🔍 GET /api/brevo-webhook - Health check started');
    res.status(200).json({ 
      success: true, 
      message: 'Brevo webhook endpoint is active',
      timestamp: new Date().toISOString()
    });
    logger.info('✅ GET /api/brevo-webhook - Health check completed');
  } catch (error) {
    logger.error({ err: error }, '❌ Error in webhook health check:');
    res.status(500).json({ 
      success: false, 
      error: error.message 
    });
  }
}));

/**
 * POST /api/brevo-webhook
 * Handle webhook events from Brevo with location-based routing (legacy - auto-detect)
 */
router.post('/', asyncHandler(async (req, res) => {
  // Verify webhook secret (query param or header)
  const webhookSecret = process.env.BREVO_WEBHOOK_SECRET;
  if (webhookSecret) {
    if (req.query.secret !== webhookSecret && req.headers['x-brevo-secret'] !== webhookSecret) {
      logger.warn({ ip: req.ip }, 'Brevo webhook rejected: invalid or missing secret');
      return res.status(401).json({ error: 'Unauthorized' });
    }
  } else {
    logger.warn('BREVO_WEBHOOK_SECRET not configured — webhook requests are unverified. Set this env var for security.');
  }

  logger.info({ data: req.body }, 'Received Brevo webhook (auto-detect):');

  try {
    // Determine location based on webhook data
    const location = determineLocation(req.body);
    logger.info(`Determined location: ${location}`);

    // Immediately respond to Brevo to prevent timeout
    res.status(200).json({
      success: true,
      message: 'Webhook received',
      location: location
    });
    logger.info('Webhook response sent immediately');
    
    // Get the appropriate database pool
    const pool = getPool(location);
    
    // Process the webhook event asynchronously (non-blocking)
    setImmediate(async () => {
      try {
        await processWebhookEvent(req.body, pool, location);
        logger.info('✅ Webhook processed successfully for ${location}');
      } catch (error) {
        logger.error({ err: error }, '❌ Error processing webhook for ${location}:');
      }
    });
    
  } catch (error) {
    logger.error({ err: error }, '❌ Error in webhook handler:');
    if (!res.headersSent) {
      res.status(200).json({ 
        success: true, 
        message: 'Webhook received (error logged)',
        error: error.message
      });
    }
  }
}));

/**
 * POST /api/brevo-webhook/production
 * Handle webhook events for PRODUCTION environment
 */
router.post('/production', asyncHandler(async (req, res) => {
  logger.info({ data: req.body }, '📧 Received Brevo webhook for PRODUCTION:');
  await handleLocationWebhook(req, res, 'production');
}));

/**
 * POST /api/brevo-webhook/westside
 * Handle webhook events for WESTSIDE environment
 */
router.post('/westside', asyncHandler(async (req, res) => {
  logger.info({ data: req.body }, '📧 Received Brevo webhook for WESTSIDE:');
  await handleLocationWebhook(req, res, 'westside');
}));

/**
 * POST /api/brevo-webhook/eastside
 * Handle webhook events for EASTSIDE environment
 */
router.post('/eastside', asyncHandler(async (req, res) => {
  logger.info({ data: req.body }, '📧 Received Brevo webhook for EASTSIDE:');
  await handleLocationWebhook(req, res, 'eastside');
}));

/**
 * Helper function to handle location-specific webhook
 */
async function handleLocationWebhook(req, res, location) {
  try {
    logger.info('🎯 Processing webhook for ${location.toUpperCase()} environment');
    
    // Immediately respond to Brevo to prevent timeout
    res.status(200).json({ 
      success: true, 
      message: 'Webhook received',
      location: location
    });
    logger.info('✅ Webhook response sent immediately for ${location}');
    
    // Get the appropriate database pool
    const pool = getPool(location);
    
    // Process the webhook event asynchronously (non-blocking)
    setImmediate(async () => {
      try {
        await processWebhookEvent(req.body, pool, location);
        logger.info('✅ Webhook processed successfully for ${location}');
      } catch (error) {
        logger.error({ err: error }, '❌ Error processing webhook for ${location}:');
      }
    });
    
  } catch (error) {
    logger.error({ err: error }, '❌ Error in webhook handler for ${location}:');
    if (!res.headersSent) {
      res.status(200).json({ 
        success: true, 
        message: 'Webhook received (error logged)',
        location: location,
        error: error.message
      });
    }
  }
}

/**
 * GET /api/tracking/pixel/:trackingId
 * Tracking pixel endpoint for email opens with location detection
 */
router.get('/pixel/:trackingId', asyncHandler(async (req, res) => {
  try {
    const { trackingId } = req.params;
    
    logger.info('📊 Tracking pixel hit: ${trackingId}');
    
    // Parse tracking ID to get report ID and location
    const { reportId, location } = extractReportIdFromTrackingId(trackingId);
    
    if (reportId) {
      // Get the appropriate database pool
      const pool = getPool(location || 'production');
      
      // Update the report with open tracking
      await pool.query(`
        UPDATE client_reports SET
          email_opened_at = COALESCE(email_opened_at, NOW()),
          email_opened_count = email_opened_count + 1,
          last_engagement_at = NOW()
        WHERE id = $1
      `, [reportId]);
      
      logger.info('✅ Updated open tracking for report ${reportId} in ${location || \'production\'}');
    }
    
    // Return a 1x1 transparent pixel
    const pixel = Buffer.from(
      'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==',
      'base64'
    );
    
    res.set({
      'Content-Type': 'image/png',
      'Content-Length': pixel.length,
      'Cache-Control': 'no-cache, no-store, must-revalidate',
      'Pragma': 'no-cache',
      'Expires': '0'
    });
    
    res.send(pixel);
    
  } catch (error) {
    logger.error({ err: error }, '❌ Error processing tracking pixel:');
    // Still return the pixel even if there's an error
    const pixel = Buffer.from(
      'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==',
      'base64'
    );
    res.set('Content-Type', 'image/png');
    res.send(pixel);
  }
}));

/**
 * GET /api/tracking/click/:trackingId
 * Click tracking endpoint for email links with location detection
 */
router.get('/click/:trackingId', asyncHandler(async (req, res) => {
  try {
    const { trackingId } = req.params;
    const { url } = req.query;
    
    logger.info('🔗 Click tracking hit: ${trackingId} -> ${url}');
    
    // Parse tracking ID to get report ID and location
    const { reportId, location } = extractReportIdFromTrackingId(trackingId);
    
    if (reportId) {
      // Get the appropriate database pool
      const pool = getPool(location || 'production');
      
      // Update the report with click tracking
      await pool.query(`
        UPDATE client_reports SET
          email_clicked_at = COALESCE(email_clicked_at, NOW()),
          email_clicked_count = email_clicked_count + 1,
          email_clicked_urls = array_append(
            COALESCE(email_clicked_urls, ARRAY[]::text[]), 
            $1
          ),
          last_engagement_at = NOW()
        WHERE id = $2
      `, [url, reportId]);
      
      logger.info('✅ Updated click tracking for report ${reportId}: ${url} in ${location || \'production\'}');
    }
    
    // Redirect to the original URL
    if (url) {
      res.redirect(decodeURIComponent(url));
    } else {
      res.redirect('https://acmeops.com');
    }
    
  } catch (error) {
    logger.error({ err: error }, '❌ Error processing click tracking:');
    // Redirect to a safe URL even if there's an error
    res.redirect('https://acmeops.com');
  }
}));

/**
 * Extract report ID and location from tracking ID
 * Format: stc_{reportId}_{timestamp}_{randomId}_{location}
 * or: stc_{location}_{reportId}_{timestamp}_{randomId}
 */
function extractReportIdFromTrackingId(trackingId) {
  try {
    const parts = trackingId.split('_');
    if (parts.length >= 2 && parts[0] === 'stc') {
      // Check if location is at the end
      if (parts.length >= 4) {
        const lastPart = parts[parts.length - 1];
        if (['production', 'westside', 'eastside'].includes(lastPart)) {
          return {
            reportId: parseInt(parts[1], 10),
            location: lastPart
          };
        }
      }
      
      // Check if location is at the beginning (after 'stc')
      if (parts.length >= 4 && ['production', 'westside', 'eastside'].includes(parts[1])) {
        return {
          reportId: parseInt(parts[2], 10),
          location: parts[1]
        };
      }
      
      // Default format without location
      return {
        reportId: parseInt(parts[1], 10),
        location: null
      };
    }
    return { reportId: null, location: null };
  } catch (error) {
    logger.error({ err: error }, 'Error extracting report ID from tracking ID:');
    return { reportId: null, location: null };
  }
}

/**
 * Determine location based on webhook data
 * @param {Object} webhookData - The webhook payload from Brevo
 * @returns {string} - Location identifier (production, westside, eastside)
 */
function determineLocation(webhookData) {
  try {
    // Method 1: Check email domain patterns
    const email = webhookData.email || webhookData.recipient || '';
    
    // Westside-specific email patterns
    if (email.includes('westside') || email.includes('tn.') || email.includes('tennessee')) {
      return 'westside';
    }
    
    // Eastside-specific email patterns  
    if (email.includes('eastside') || email.includes('fl.') || email.includes('florida')) {
      return 'eastside';
    }
    
    // Method 2: Check for location-specific tracking IDs or message IDs
    const messageId = webhookData.messageId || webhookData.message_id || '';
    if (messageId.includes('westside') || messageId.includes('nash')) {
      return 'westside';
    }
    if (messageId.includes('eastside') || messageId.includes('orl')) {
      return 'eastside';
    }
    
    // Method 3: Check custom fields or tags
    const tags = webhookData.tags || webhookData.customFields || {};
    if (tags.location === 'westside' || tags.location === 'nash') {
      return 'westside';
    }
    if (tags.location === 'eastside' || tags.location === 'orl') {
      return 'eastside';
    }
    
    // Method 4: Check sender information
    const sender = webhookData.sender || webhookData.from || '';
    if (sender.includes('westside') || sender.includes('nash')) {
      return 'westside';
    }
    if (sender.includes('eastside') || sender.includes('orl')) {
      return 'eastside';
    }
    
    // Default to production for main operations
    logger.info('📍 No location-specific indicators found, defaulting to production');
    return 'production';
    
  } catch (error) {
    logger.error({ err: error }, '❌ Error determining location:');
    return 'production'; // Safe default
  }
}

/**
 * Process webhook event with location-specific database
 * @param {Object} webhookData - The webhook payload
 * @param {Object} pool - Database connection pool
 * @param {string} location - Location identifier
 */
async function processWebhookEvent(webhookData, pool, location) {
  try {
    const { event, message_id, messageId, email, date, ts } = webhookData;
    
    // Brevo sends message-id (with hyphen) or message_id (with underscore) or messageId
    const webhookMessageId = webhookData['message-id'] || message_id || messageId;
    
    logger.info('🔄 Processing ${event} event for ${email} in ${location} environment');
    logger.info('📧 Webhook message ID: ${webhookMessageId}');
    logger.info({ data: JSON.stringify(webhookData) }, '📦 Full webhook data:');
    
    // First, try to find school email campaign by Brevo message ID
    // Check if school_email_campaigns table exists before querying (table may not exist in all environments)
    let campaignResult = { rows: [] };
    try {
      campaignResult = await pool.query(
        'SELECT id, school_client_id, campaign_type, status FROM school_email_campaigns WHERE brevo_message_id = $1',
        [webhookMessageId]
      );
    } catch (tableError) {
      // Table doesn't exist - this is OK, just skip school email campaign processing
      if (tableError.code === '42P01') { // relation does not exist
        logger.info('ℹ️ school_email_campaigns table does not exist, skipping school campaign lookup');
      } else {
        // Re-throw other errors
        throw tableError;
      }
    }
    
    if (campaignResult.rows.length > 0) {
      // This is a school email campaign
      const campaign = campaignResult.rows[0];
      logger.info('📧 Found school email campaign: ${campaign.id} (${campaign.campaign_type})');
      
      // Update campaign based on event type
      switch (event) {
        case 'delivered':
          await pool.query(
            `UPDATE school_email_campaigns SET
              status = 'delivered',
              email_delivered_at = COALESCE(email_delivered_at, NOW()),
              updated_at = NOW()
            WHERE id = $1`,
            [campaign.id]
          );
          break;
        case 'opened':
          await pool.query(
            `UPDATE school_email_campaigns SET
              status = CASE WHEN status = 'sent' THEN 'opened' ELSE status END,
              email_opened_at = COALESCE(email_opened_at, NOW()),
              email_opened_count = email_opened_count + 1,
              last_engagement_at = NOW(),
              updated_at = NOW()
            WHERE id = $1`,
            [campaign.id]
          );
          break;
        case 'click':
          const clickedUrl = webhookData.link || webhookData.url || '';
          await pool.query(
            `UPDATE school_email_campaigns SET
              status = CASE WHEN status IN ('sent', 'delivered', 'opened') THEN 'clicked' ELSE status END,
              email_clicked_at = COALESCE(email_clicked_at, NOW()),
              email_clicked_count = email_clicked_count + 1,
              email_clicked_urls = array_append(
                COALESCE(email_clicked_urls, ARRAY[]::text[]),
                $1
              ),
              last_engagement_at = NOW(),
              updated_at = NOW()
            WHERE id = $2`,
            [clickedUrl, campaign.id]
          );
          break;
        case 'bounce':
        case 'hard_bounce':
        case 'soft_bounce':
          await pool.query(
            `UPDATE school_email_campaigns SET
              status = 'bounced',
              email_bounced_at = NOW(),
              updated_at = NOW()
            WHERE id = $1`,
            [campaign.id]
          );
          break;
        case 'spam':
          await pool.query(
            `UPDATE school_email_campaigns SET
              email_complained_at = NOW(),
              updated_at = NOW()
            WHERE id = $1`,
            [campaign.id]
          );
          break;
        case 'unsubscribed':
          await pool.query(
            `UPDATE school_email_campaigns SET
              email_unsubscribed_at = NOW(),
              updated_at = NOW()
            WHERE id = $1`,
            [campaign.id]
          );
          break;
      }
      
      // Store webhook event in brevo_events JSONB
      await pool.query(
        `UPDATE school_email_campaigns SET
          brevo_events = COALESCE(brevo_events, '[]'::jsonb) || $1::jsonb,
          updated_at = NOW()
        WHERE id = $2`,
        [JSON.stringify([{ event, email, date: date || ts, data: webhookData }]), campaign.id]
      );
      
      logger.info('✅ Updated school email campaign ${campaign.id} for event: ${event}');
      return; // Exit early since we handled the school campaign
    }
    
    // Find the client report by Brevo message ID or by email and recent date
    // Try multiple strategies since Brevo may send different ID formats
    let reportResult = await pool.query(
      'SELECT id, client_email, sent_at FROM client_reports WHERE brevo_message_id = $1',
      [webhookMessageId]
    );
    
    // If not found by message ID, try to find by email and recent date (within last 72 hours)
    // Extended window to catch delayed webhooks and reports sent early in the day
    if (reportResult.rows.length === 0 && email) {
      logger.info('⚠️ No report found for message ID: ${webhookMessageId}, trying email lookup for ${email}');
      reportResult = await pool.query(
        `SELECT id, client_email, sent_at, brevo_message_id 
         FROM client_reports 
         WHERE client_email = $1 
         AND status = 'sent'
         AND date_sent >= NOW() - INTERVAL '72 hours'
         AND (sent_at IS NULL OR email_delivered_at IS NULL)
         ORDER BY date_sent DESC 
         LIMIT 1`,
        [email]
      );
      
      if (reportResult.rows.length > 0) {
        logger.info('✅ Found report by email fallback: ${reportResult.rows[0].id}, stored message ID: ${reportResult.rows[0].brevo_message_id}');
        
        // Update the brevo_message_id if it's different (to fix future lookups)
        if (reportResult.rows[0].brevo_message_id !== webhookMessageId) {
          await pool.query(
            'UPDATE client_reports SET brevo_message_id = $1 WHERE id = $2',
            [webhookMessageId, reportResult.rows[0].id]
          );
          logger.info('🔄 Updated brevo_message_id from ${reportResult.rows[0].brevo_message_id} to ${webhookMessageId}');
        }
      }
    }
    
    if (reportResult.rows.length === 0) {
      logger.info('⚠️ No report found for message ID: ${webhookMessageId} or email: ${email} in ${location}');
      return;
    }
    
    const report = reportResult.rows[0];
    logger.info('📊 Found report ${report.id} for ${report.client_email}');
    
    // Ensure the date is properly converted to UTC timestamp
    // Brevo may send 'ts' (timestamp in milliseconds) or 'date' (ISO string)
    const timestamp = ts ? new Date(ts * 1000) : (date ? new Date(date) : new Date());
    logger.info('🕐 Webhook timestamp - Raw: ${date || ts}, Parsed: ${timestamp.toISOString()}');
    
    // Process different event types
    switch (event) {
      case 'request':
      case 'sent':
        await pool.query(
          'UPDATE client_reports SET sent_at = COALESCE(sent_at, $1) WHERE id = $2',
          [timestamp, report.id]
        );
        logger.info('✅ Updated sent_at to ${timestamp.toISOString()} for report ${report.id} in ${location}');
        break;
        
      case 'delivered':
        await pool.query(
          'UPDATE client_reports SET email_delivered_at = COALESCE(email_delivered_at, $1), sent_at = COALESCE(sent_at, $1) WHERE id = $2',
          [timestamp, report.id]
        );
        logger.info('✅ Updated delivered_at to ${timestamp.toISOString()} for report ${report.id} in ${location}');
        break;
        
      case 'open':
      case 'opened':
        await pool.query(
          'UPDATE client_reports SET email_opened_at = COALESCE(email_opened_at, $1), email_opened_count = email_opened_count + 1, last_engagement_at = $1, sent_at = COALESCE(sent_at, $1) WHERE id = $2',
          [timestamp, report.id]
        );
        logger.info('✅ Updated opened tracking to ${timestamp.toISOString()} for report ${report.id} in ${location}');
        break;
        
      case 'loaded_by_proxy':
      case 'loaded-by-proxy':
        // Apple Mail Privacy Protection or other proxy services loaded the tracking pixel
        // This indicates the email was likely opened, but through a proxy (less accurate timing)
        await pool.query(
          'UPDATE client_reports SET email_opened_at = COALESCE(email_opened_at, $1), email_opened_count = email_opened_count + 1, last_engagement_at = $1, sent_at = COALESCE(sent_at, $1) WHERE id = $2',
          [timestamp, report.id]
        );
        logger.info('✅ Updated opened tracking (via proxy) to ${timestamp.toISOString()} for report ${report.id} in ${location} - Email likely opened via Apple Mail Privacy Protection or similar proxy service');
        break;
        
      case 'click':
      case 'clicked':
        await pool.query(
          'UPDATE client_reports SET email_clicked_at = COALESCE(email_clicked_at, $1), email_clicked_count = email_clicked_count + 1, last_engagement_at = $1, sent_at = COALESCE(sent_at, $1) WHERE id = $2',
          [timestamp, report.id]
        );
        logger.info('✅ Updated clicked tracking to ${timestamp.toISOString()} for report ${report.id} in ${location}');
        break;
        
      case 'hard_bounce':
      case 'soft_bounce':
      case 'bounce':
      case 'bounced':
        await pool.query(
          'UPDATE client_reports SET email_bounced_at = $1 WHERE id = $2',
          [timestamp, report.id]
        );
        logger.info('⚠️ Updated bounced status to ${timestamp.toISOString()} for report ${report.id} in ${location}');
        break;
        
      case 'spam':
      case 'complaint':
      case 'complained':
        await pool.query(
          'UPDATE client_reports SET email_complained_at = $1 WHERE id = $2',
          [timestamp, report.id]
        );
        logger.info('⚠️ Updated complained status to ${timestamp.toISOString()} for report ${report.id} in ${location}');
        break;
        
      case 'unsubscribe':
      case 'unsubscribed':
        await pool.query(
          'UPDATE client_reports SET email_unsubscribed_at = $1 WHERE id = $2',
          [timestamp, report.id]
        );
        logger.info('⚠️ Updated unsubscribed status to ${timestamp.toISOString()} for report ${report.id} in ${location}');
        break;
        
      default:
        logger.info('ℹ️ Unhandled event type: ${event} for report ${report.id} in ${location}');
    }
    
    // Store all webhook events in brevo_events JSONB field for analytics
    try {
      await pool.query(
        `UPDATE client_reports SET
          brevo_events = COALESCE(brevo_events, '[]'::jsonb) || $1::jsonb,
          updated_at = NOW()
        WHERE id = $2`,
        [JSON.stringify([{ 
          event, 
          email, 
          date: timestamp.toISOString(), 
          messageId: webhookMessageId,
          location,
          data: webhookData 
        }]), report.id]
      );
      logger.info('✅ Stored ${event} event in brevo_events for report ${report.id}');
    } catch (eventStoreError) {
      logger.error({ error: eventStoreError.message }, '⚠️ Error storing event in brevo_events:');
      // Don't fail the entire webhook processing if event storage fails
    }
    
  } catch (error) {
    logger.error({ err: error }, '❌ Error processing webhook event in ${location}:');
    logger.error({ error: error.stack }, '❌ Error stack:');
    logger.error({ error: JSON.stringify(webhookData) }, '❌ Webhook data that caused error:');
    // Don't throw - we want to continue processing other webhooks
  }
}

/**
 * Validate webhook signature (optional security measure)
 */
function validateWebhookSignature(payload, signature) {
  const secret = process.env.BREVO_WEBHOOK_SECRET;
  if (!secret) return true; // Allow if no secret configured yet
  if (!signature) return false;
  const crypto = require('crypto');
  const computed = crypto.createHmac('sha256', secret).update(JSON.stringify(payload)).digest('hex');
  try {
    return crypto.timingSafeEqual(Buffer.from(signature), Buffer.from(computed));
  } catch {
    return false;
  }
}

module.exports = router;
