// services/meta-offline-events-sync.js
/**
 * Meta Offline Events Sync Service
 * Syncs completed bookings to Meta as offline conversion events
 * 
 * This service:
 * 1. Finds completed bookings (paid/verified) with Meta attribution
 * 2. Checks if they've already been uploaded
 * 3. Uploads them to Meta Conversions API
 * 4. Tracks upload status to prevent duplicates
 */

const MetaAdsService = require('./meta-ads-api');
const { getPool } = require('../database-connections');
const { logger } = require('../utils/logger');

/**
 * Convert country name to ISO 3166-1 2-letter code
 * @param {string} countryName - Country name (e.g., "United States", "united states", "US")
 * @returns {string} ISO 3166-1 2-letter code (e.g., "US")
 */
function countryNameToISO(countryName) {
  if (!countryName) return 'US';
  
  const normalized = countryName.trim().toLowerCase();
  
  // Common country name mappings to ISO codes
  const countryMap = {
    'united states': 'US',
    'united states of america': 'US',
    'usa': 'US',
    'canada': 'CA',
    'united kingdom': 'GB',
    'uk': 'GB',
    'australia': 'AU',
    'mexico': 'MX',
    'germany': 'DE',
    'france': 'FR',
    'spain': 'ES',
    'italy': 'IT',
    'japan': 'JP',
    'china': 'CN',
    'india': 'IN',
    'brazil': 'BR',
    'south korea': 'KR',
    'netherlands': 'NL',
    'sweden': 'SE',
    'norway': 'NO',
    'denmark': 'DK',
    'finland': 'FI',
    'poland': 'PL',
    'belgium': 'BE',
    'switzerland': 'CH',
    'austria': 'AT',
    'ireland': 'IE',
    'portugal': 'PT',
    'greece': 'GR',
    'new zealand': 'NZ',
    'south africa': 'ZA',
    'argentina': 'AR',
    'chile': 'CL',
    'colombia': 'CO',
    'peru': 'PE',
    'venezuela': 'VE',
    'ecuador': 'EC',
    'uruguay': 'UY',
    'paraguay': 'PY',
    'bolivia': 'BO',
    'panama': 'PA',
    'costa rica': 'CR',
    'guatemala': 'GT',
    'honduras': 'HN',
    'nicaragua': 'NI',
    'el salvador': 'SV',
    'belize': 'BZ',
    'jamaica': 'JM',
    'trinidad and tobago': 'TT',
    'barbados': 'BB',
    'bahamas': 'BS',
    'dominican republic': 'DO',
    'puerto rico': 'PR',
    'philippines': 'PH',
    'singapore': 'SG',
    'malaysia': 'MY',
    'thailand': 'TH',
    'vietnam': 'VN',
    'indonesia': 'ID',
    'taiwan': 'TW',
    'hong kong': 'HK',
    'israel': 'IL',
    'united arab emirates': 'AE',
    'uae': 'AE',
    'saudi arabia': 'SA',
    'turkey': 'TR',
    'russia': 'RU',
    'ukraine': 'UA',
    'egypt': 'EG',
    'nigeria': 'NG',
    'kenya': 'KE',
    'ghana': 'GH',
    'morocco': 'MA',
    'tunisia': 'TN',
    'algeria': 'DZ',
  };
  
  // If already a 2-letter code, return uppercase
  if (normalized.length === 2) {
    return normalized.toUpperCase();
  }
  
  // Look up in map
  return countryMap[normalized] || 'US'; // Default to US if not found
}

class MetaOfflineEventsSync {
  constructor() {
    this.metaService = new MetaAdsService();
    // Detect environment: use NODE_ENV if set, otherwise default to 'production' on Heroku
    this.env = process.env.NODE_ENV || (process.env.DYNO ? 'production' : 'local');
  }

  /**
   * Check if a submission has already been uploaded to Meta
   * @param {number} submissionId - Submission ID
   * @param {string} eventName - Event name (default: 'Lead')
   * @returns {Promise<boolean>} True if already uploaded successfully
   */
  async isAlreadyUploaded(submissionId, eventName = 'Lead') {
    const pool = getPool(this.env);
    const { rows } = await pool.query(
      `SELECT upload_status FROM meta_offline_events 
       WHERE submission_id = $1 AND event_name = $2 AND upload_status = 'success'`,
      [submissionId, eventName]
    );
    return rows.length > 0;
  }

  /**
   * Mark an event as uploaded (or failed)
   * @param {Object} data - Upload data
   * @returns {Promise<void>}
   */
  async markAsUploaded(data) {
    const {
      submissionId,
      eventName = 'Lead',
      eventId,
      eventTime,
      uploadStatus = 'success',
      uploadError = null
    } = data;

    const pool = getPool(this.env);
    await pool.query(
      `INSERT INTO meta_offline_events 
       (submission_id, event_name, event_id, event_time, upload_status, upload_error, uploaded_at)
       VALUES ($1, $2, $3, $4, $5, $6, NOW())
       ON CONFLICT (submission_id, event_name) 
       DO UPDATE SET
         upload_status = EXCLUDED.upload_status,
         upload_error = EXCLUDED.upload_error,
         uploaded_at = NOW(),
         retry_count = meta_offline_events.retry_count + 1,
         updated_at = NOW()`,
      [submissionId, eventName, eventId, eventTime, uploadStatus, uploadError]
    );
  }

  /**
   * Find bookings that should be uploaded as offline events
   * @param {Object} options - Query options
   * @param {string} options.startDate - Start date (ISO string)
   * @param {string} options.endDate - End date (ISO string)
   * @param {boolean} options.includeAlreadyUploaded - Include already uploaded (default: false)
   * @returns {Promise<Array>} Array of booking submissions
   */
  async findBookingsToUpload(options = {}) {
    const {
      startDate,
      endDate,
      includeAlreadyUploaded = false
    } = options;

    let query = `
      SELECT 
        bs.id,
        bs.parent_first,
        bs.parent_last,
        bs.parent_email,
        bs.parent_phone,
        bs.actual_price,
        bs.payment_status,
        bs.created_at,
        bs.utm,
        bs.landing_url,
        bs.address,
        bs.booking_type,
        bs.label_name,
        -- Check if already uploaded
        EXISTS(
          SELECT 1 FROM meta_offline_events 
          WHERE submission_id = bs.id 
            AND event_name = 'Lead' 
            AND upload_status = 'success'
        ) AS already_uploaded
      FROM booking_submissions bs
      WHERE bs.payment_status IN ('paid', 'verified')
        AND (
          -- Meta attribution via UTM
          (LOWER(COALESCE(bs.utm->>'utm_source', '')) = 'facebook' 
           AND COALESCE(bs.utm->>'utm_campaign', '') != '')
          OR
          -- Meta attribution via heard_about
          (LOWER(COALESCE(bs.heard_about, '')) IN ('facebook', 'instagram'))
        )
    `;

    const params = [];
    let paramIndex = 1;

    if (startDate) {
      query += ` AND bs.created_at >= $${paramIndex}::timestamptz`;
      params.push(startDate);
      paramIndex++;
    }

    if (endDate) {
      query += ` AND bs.created_at <= $${paramIndex}::timestamptz`;
      params.push(endDate);
      paramIndex++;
    }

    if (!includeAlreadyUploaded) {
      query += ` AND NOT EXISTS(
        SELECT 1 FROM meta_offline_events 
        WHERE submission_id = bs.id 
          AND event_name = 'Lead' 
          AND upload_status = 'success'
      )`;
    }

    query += ` ORDER BY bs.created_at DESC`;

    const pool = getPool(this.env);
    const { rows } = await pool.query(query, params);
    return rows;
  }

  /**
   * Convert a booking submission to Meta event data
   * @param {Object} booking - Booking submission row
   * @returns {Object} Event data for Meta API
   */
  convertBookingToEvent(booking) {
    const address = booking.address || {};
    const utm = booking.utm || {};
    
    // Event time should be when the booking was completed (created_at)
    const eventTime = Math.floor(new Date(booking.created_at).getTime() / 1000);

    // Determine event name based on payment status
    // 'CompleteRegistration' for paid bookings, 'Lead' for verified
    const eventName = booking.payment_status === 'paid' ? 'CompleteRegistration' : 'Lead';
    
    // Generate unique event ID for deduplication
    // Format: {eventName}_{submissionId}_{timestamp}
    // This ensures consistent deduplication with Meta's requirements
    const eventId = `${eventName}_${booking.id}_${eventTime}`;

    return {
      eventName: eventName,
      eventTime: eventTime,
      eventId: eventId,
      email: booking.parent_email,
      phone: booking.parent_phone,
      firstName: booking.parent_first,
      lastName: booking.parent_last,
      city: address.city,
      state: address.state,
      zipCode: address.zip,
      country: countryNameToISO(address.country),
      value: parseFloat(booking.actual_price || 0),
      currency: 'USD',
      eventSourceUrl: booking.landing_url || 'https://join.acmeops.com',
      customData: {
        booking_type: booking.booking_type,
        label_name: booking.label_name,
        utm_campaign: utm.utm_campaign || null,
        utm_source: utm.utm_source || null,
        utm_medium: utm.utm_medium || null,
        submission_id: booking.id
      }
    };
  }

  /**
   * Sync bookings to Meta as offline events
   * @param {Object} options - Sync options
   * @param {string} options.startDate - Start date (ISO string, optional)
   * @param {string} options.endDate - End date (ISO string, optional)
   * @param {number} options.limit - Maximum number of bookings to process (optional)
   * @returns {Promise<Object>} Sync results
   */
  async syncBookingsToMeta(options = {}) {
    if (!this.metaService.enabled) {
      throw new Error('Meta Ads API is not configured');
    }

    const { startDate, endDate, limit } = options;

    logger.info('🔄 Starting Meta offline events sync...');
    logger.info(`   Date range: ${startDate || 'all time'} to ${endDate || 'now'}`);
    if (limit) {
      logger.info(`   Limit: ${limit} bookings`);
    }

    // Find bookings to upload
    const bookings = await this.findBookingsToUpload({ startDate, endDate });
    
    if (limit) {
      bookings.splice(limit);
    }

    logger.info(`📋 Found ${bookings.length} bookings to upload`);

    if (bookings.length === 0) {
      return {
        total: 0,
        success: 0,
        errors: 0,
        skipped: 0,
        results: []
      };
    }

    // Convert bookings to event data and filter by age
    // Meta requires events within 7 days, so we use 6 days as a buffer
    const now = Math.floor(Date.now() / 1000);
    const sixDaysAgo = now - (6 * 24 * 60 * 60); // 6 days in seconds
    
    const validEvents = [];
    const validBookings = [];
    const skippedEvents = [];
    
    for (let i = 0; i < bookings.length; i++) {
      const booking = bookings[i];
      const event = this.convertBookingToEvent(booking);
      
      if (event.eventTime >= sixDaysAgo) {
        validEvents.push(event);
        validBookings.push(booking);
      } else {
        skippedEvents.push({
          submissionId: booking.id,
          eventName: event.eventName,
          eventId: event.eventId,
          eventTime: new Date(booking.created_at),
          reason: `Event too old: ${new Date(event.eventTime * 1000).toISOString()} (older than 6 days)`
        });
      }
    }
    
    if (skippedEvents.length > 0) {
      logger.info(`⏭️  Skipping ${skippedEvents.length} events that are older than 6 days (Meta requirement)`);
    }
    
    if (validEvents.length === 0) {
      logger.info('⚠️  No valid events to upload (all are too old)');
      return {
        total: bookings.length,
        success: 0,
        errors: 0,
        skipped: skippedEvents.length,
        results: skippedEvents.map(e => ({ ...e, status: 'skipped' }))
      };
    }

    // Upload events in batch
    const uploadResults = await this.metaService.uploadOfflineEventsBatch(validEvents);
    
    // Log detailed error information if there are errors
    if (uploadResults.errors > 0 && uploadResults.results && uploadResults.results.length > 0) {
      const failedBatch = uploadResults.results.find(r => !r.success);
      if (failedBatch && failedBatch.errorDetails) {
        logger.error('📋 Detailed error information:');
        logger.error({ data: failedBatch.errorDetails }, 'Object dump');
      }
    }

    // Mark each event as uploaded (or failed)
    const results = [];
    
    // First, mark skipped events
    for (const skipped of skippedEvents) {
      await this.markAsUploaded({
        submissionId: skipped.submissionId,
        eventName: skipped.eventName,
        eventId: skipped.eventId,
        eventTime: skipped.eventTime,
        uploadStatus: 'failed',
        uploadError: skipped.reason
      });
      
      results.push({
        submissionId: skipped.submissionId,
        eventName: skipped.eventName,
        status: 'skipped'
      });
    }
    
    // Then, mark uploaded events (both successful and failed)
    for (let i = 0; i < validEvents.length; i++) {
      const event = validEvents[i];
      const booking = validBookings[i];
      
      // Determine if this event was successful
      // For simplicity, we'll mark all as attempted and let the batch result tell us
      const wasSuccessful = i < uploadResults.success;
      
      await this.markAsUploaded({
        submissionId: booking.id,
        eventName: event.eventName,
        eventId: event.eventId,
        eventTime: new Date(booking.created_at),
        uploadStatus: wasSuccessful ? 'success' : 'failed',
        uploadError: wasSuccessful ? null : 'Batch upload error'
      });

      results.push({
        submissionId: booking.id,
        eventName: event.eventName,
        status: wasSuccessful ? 'success' : 'failed'
      });
    }

    logger.info(`✅ Sync complete: ${uploadResults.success} successful, ${uploadResults.errors} errors, ${skippedEvents.length} skipped`);

    return {
      total: bookings.length,
      success: uploadResults.success,
      errors: uploadResults.errors,
      skipped: skippedEvents.length,
      results: results
    };
  }

  /**
   * Retry failed uploads
   * @param {number} maxRetries - Maximum retry count (default: 3)
   * @returns {Promise<Object>} Retry results
   */
  async retryFailedUploads(maxRetries = 3) {
    if (!this.metaService.enabled) {
      throw new Error('Meta Ads API is not configured');
    }

    // Find failed uploads that haven't exceeded max retries
    const pool = getPool(this.env);
    const { rows: failedUploads } = await pool.query(
      `SELECT 
        moe.submission_id,
        moe.event_name,
        moe.event_id,
        moe.event_time,
        moe.retry_count,
        bs.parent_first,
        bs.parent_last,
        bs.parent_email,
        bs.parent_phone,
        bs.actual_price,
        bs.created_at,
        bs.utm,
        bs.landing_url,
        bs.address,
        bs.booking_type,
        bs.label_name
      FROM meta_offline_events moe
      JOIN booking_submissions bs ON bs.id = moe.submission_id
      WHERE moe.upload_status = 'failed'
        AND moe.retry_count < $1
      ORDER BY moe.created_at ASC
      LIMIT 100`,
      [maxRetries]
    );

    logger.info(`🔄 Retrying ${failedUploads.length} failed uploads...`);

    if (failedUploads.length === 0) {
      return { total: 0, success: 0, errors: 0 };
    }

    // Convert to event data and upload
    const events = failedUploads.map(upload => {
      const booking = {
        id: upload.submission_id,
        parent_first: upload.parent_first,
        parent_last: upload.parent_last,
        parent_email: upload.parent_email,
        parent_phone: upload.parent_phone,
        actual_price: upload.actual_price,
        created_at: upload.created_at,
        utm: upload.utm,
        landing_url: upload.landing_url,
        address: upload.address,
        booking_type: upload.booking_type,
        label_name: upload.label_name,
        payment_status: 'paid' // Assume paid if it was attempted before
      };
      return this.convertBookingToEvent(booking);
    });

    const uploadResults = await this.metaService.uploadOfflineEventsBatch(events);

    // Update status
    for (let i = 0; i < failedUploads.length; i++) {
      const upload = failedUploads[i];
      const wasSuccessful = i < uploadResults.success;
      
      await this.markAsUploaded({
        submissionId: upload.submission_id,
        eventName: upload.event_name,
        eventId: upload.event_id,
        eventTime: upload.event_time,
        uploadStatus: wasSuccessful ? 'success' : 'failed',
        uploadError: wasSuccessful ? null : 'Retry failed'
      });
    }

    return {
      total: failedUploads.length,
      success: uploadResults.success,
      errors: uploadResults.errors
    };
  }
}

module.exports = MetaOfflineEventsSync;

