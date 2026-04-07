/**
 * Booking Form QR Code Service
 * 
 * Handles automatic QR code generation for booking forms/services.
 * - Auto-generates QR codes when booking forms are created
 * - Links QR codes to their respective services
 * - Organizes QR codes in a "Booking Forms" folder
 */

const { getPool } = require('../database-connections');
const qrGeneratorService = require('./qr-code-generator-service');
const { logger } = require('../utils/logger');

// Get the base URL for booking forms based on environment
const getBookingFormBaseUrl = () => {
  const baseUrl = process.env.BOOKING_FORM_BASE_URL || 
                  process.env.FRONTEND_URL || 
                  'https://join.acmeops.com';
  return baseUrl.replace(/\/$/, ''); // Remove trailing slash
};

// Get the tracking base URL for QR codes
const getTrackingBaseUrl = () => {
  return process.env.TRACKING_BASE_URL || 
         process.env.FRONTEND_URL || 
         'https://join.acmeops.com';
};

/**
 * Ensure the "Booking Forms" folder exists, create if not
 * @param {Object} pool - Database pool
 * @returns {Promise<string>} - Folder ID
 */
async function ensureBookingFormsFolder(pool) {
  // Check if folder exists
  const existingFolder = await pool.query(
    `SELECT id FROM qr_code_folders WHERE name = 'Booking Forms' AND deleted_at IS NULL LIMIT 1`
  );
  
  if (existingFolder.rows.length > 0) {
    return existingFolder.rows[0].id;
  }
  
  // Create the folder
  const result = await pool.query(`
    INSERT INTO qr_code_folders (name, description, color, icon)
    VALUES ('Booking Forms', 'Auto-generated QR codes for booking forms and services', '#6A469D', 'form')
    RETURNING id
  `);
  
  return result.rows[0].id;
}

/**
 * Build the booking form URL with UTM parameters
 * @param {number} serviceId - The service/booking form ID
 * @param {string} serviceName - The service name (for UTM campaign)
 * @returns {string} - Full URL with UTM parameters
 */
function buildBookingFormUrl(serviceId, serviceName) {
  const baseUrl = getBookingFormBaseUrl();
  const url = new URL(`${baseUrl}/booking-forms/frontend`);
  
  // Add service ID parameter
  url.searchParams.set('serviceId', serviceId);
  
  // Add UTM parameters for tracking
  url.searchParams.set('utm_source', 'qr_code');
  url.searchParams.set('utm_medium', 'scan');
  url.searchParams.set('utm_campaign', serviceName.toLowerCase().replace(/[^a-z0-9]+/g, '-'));
  
  return url.toString();
}

/**
 * Generate a QR code for a booking form/service
 * @param {Object} options - Options for generating the QR code
 * @param {Object} options.service - The service object
 * @param {string} options.location - Database location (local, production, etc.)
 * @returns {Promise<Object>} - The created QR code
 */
async function generateQRCodeForService(options) {
  const { service, location = 'production' } = options;
  const pool = getPool(location);
  
  // Support both id and serviceId since table uses serviceId
  const serviceId = service.serviceId || service.id;
  
  if (!service || !serviceId) {
    throw new Error('Service with valid ID is required');
  }
  
  // Check if QR code already exists for this service
  const existingQR = await pool.query(
    `SELECT * FROM qr_codes 
     WHERE linked_entity_type = 'service' 
     AND linked_entity_id = $1 
     AND deleted_at IS NULL`,
    [serviceId.toString()]
  );
  
  if (existingQR.rows.length > 0) {
    logger.info(`QR code already exists for service ${serviceId}`);
    return existingQR.rows[0];
  }
  
  // Ensure Booking Forms folder exists
  const folderId = await ensureBookingFormsFolder(pool);
  
  // Build the destination URL
  const destinationUrl = buildBookingFormUrl(serviceId, service.name);
  
  // Generate the QR code name
  const qrName = service.name || `Booking Form ${serviceId}`;
  
  // Generate short code
  const shortCode = qrGeneratorService.generateShortCode();
  const trackingUrl = qrGeneratorService.buildTrackingUrl(shortCode);
  
  // Generate QR code image (pointing to tracking URL for analytics)
  const qrCodeResult = await qrGeneratorService.generateAndUploadQRCode({
    text: trackingUrl,
    foregroundColor: '#6A469D', // Brand purple
    backgroundColor: '#FFFFFF',
    width: 400
  });
  
  // Insert the QR code record
  const result = await pool.query(`
    INSERT INTO qr_codes (
      name, 
      description, 
      destination_url, 
      qr_code_image_url, 
      qr_code_svg,
      short_code, 
      tracking_url, 
      source,
      linked_entity_type, 
      linked_entity_id, 
      auto_generated,
      folder_id,
      foreground_color, 
      background_color,
      category,
      is_active
    ) VALUES ($1, $2, $3, $4, $5, $6, $7, 'internal', 'service', $8, true, $9, '#6A469D', '#FFFFFF', 'booking_forms', true)
    RETURNING *
  `, [
    qrName,
    `QR code for booking form: ${qrName}`,
    destinationUrl,
    qrCodeResult.imageUrl,
    qrCodeResult.svg || null,
    shortCode,
    trackingUrl,
    serviceId.toString(),
    folderId
  ]);
  
  logger.info(`Created QR code for service ${service.id}: ${result.rows[0].id}`);
  
  return result.rows[0];
}

/**
 * Generate QR codes for all existing services that don't have one
 * @param {string} location - Database location
 * @returns {Promise<Object>} - Summary of the operation
 */
async function generateQRCodesForExistingServices(location = 'production') {
  const pool = getPool(location);
  
  // Get all services that are publicly visible and don't have a QR code
  const servicesResult = await pool.query(`
    SELECT s.* 
    FROM "Services" s
    LEFT JOIN qr_codes q ON q.linked_entity_type = 'service' 
                         AND q.linked_entity_id = s."serviceId"::text 
                         AND q.deleted_at IS NULL
    WHERE s."publicVisible" = true
    AND q.id IS NULL
  `);
  
  const services = servicesResult.rows;
  logger.info(`Found ${services.length} services without QR codes`);
  
  const results = {
    total: services.length,
    success: 0,
    failed: 0,
    errors: []
  };
  
  for (const service of services) {
    try {
      await generateQRCodeForService({ service, location });
      results.success++;
    } catch (error) {
      results.failed++;
      results.errors.push({
        serviceId: service.id,
        serviceName: service.name,
        error: error.message
      });
      logger.error({ err: error }, `Failed to generate QR code for service ${service.id}:`);
    }
  }
  
  return results;
}

/**
 * Get QR code for a service, creating one if it doesn't exist
 * @param {number} serviceId - The service ID
 * @param {string} location - Database location
 * @returns {Promise<Object>} - The QR code
 */
async function getOrCreateQRCodeForService(serviceId, location = 'production') {
  const pool = getPool(location);
  
  // Check if QR code exists
  const existingQR = await pool.query(
    `SELECT * FROM qr_codes 
     WHERE linked_entity_type = 'service' 
     AND linked_entity_id = $1 
     AND deleted_at IS NULL`,
    [serviceId.toString()]
  );
  
  if (existingQR.rows.length > 0) {
    return existingQR.rows[0];
  }
  
  // Get the service details
  const serviceResult = await pool.query(
    `SELECT * FROM "Services" WHERE id = $1`,
    [serviceId]
  );
  
  if (serviceResult.rows.length === 0) {
    throw new Error(`Service ${serviceId} not found`);
  }
  
  // Generate the QR code
  return generateQRCodeForService({ 
    service: serviceResult.rows[0], 
    location 
  });
}

/**
 * Get QR code with analytics summary for a service
 * @param {number} serviceId - The service ID
 * @param {string} location - Database location
 * @returns {Promise<Object>} - QR code with analytics
 */
async function getQRCodeWithAnalytics(serviceId, location = 'production') {
  const pool = getPool(location);
  
  const result = await pool.query(`
    SELECT 
      q.*,
      COALESCE(COUNT(s.id), 0) as total_scans,
      COALESCE(COUNT(DISTINCT s.session_id), 0) as unique_scans,
      MAX(s.scanned_at) as last_scanned_at,
      COALESCE(SUM(CASE WHEN s.scanned_at >= NOW() - INTERVAL '7 days' THEN 1 ELSE 0 END), 0) as scans_last_7_days,
      COALESCE(SUM(CASE WHEN s.scanned_at >= NOW() - INTERVAL '24 hours' THEN 1 ELSE 0 END), 0) as scans_today
    FROM qr_codes q
    LEFT JOIN qr_code_scans s ON s.qr_code_id = q.id
    WHERE q.linked_entity_type = 'service' 
      AND q.linked_entity_id = $1 
      AND q.deleted_at IS NULL
    GROUP BY q.id
  `, [serviceId.toString()]);
  
  return result.rows[0] || null;
}

/**
 * Delete QR code for a service
 * @param {number} serviceId - The service ID
 * @param {string} location - Database location
 * @returns {Promise<boolean>} - Whether the deletion was successful
 */
async function deleteQRCodeForService(serviceId, location = 'production') {
  const pool = getPool(location);
  
  const result = await pool.query(`
    UPDATE qr_codes 
    SET deleted_at = NOW()
    WHERE linked_entity_type = 'service' 
      AND linked_entity_id = $1 
      AND deleted_at IS NULL
    RETURNING id
  `, [serviceId.toString()]);
  
  return result.rows.length > 0;
}

module.exports = {
  ensureBookingFormsFolder,
  buildBookingFormUrl,
  generateQRCodeForService,
  generateQRCodesForExistingServices,
  getOrCreateQRCodeForService,
  getQRCodeWithAnalytics,
  deleteQRCodeForService,
  getBookingFormBaseUrl,
  getTrackingBaseUrl
};
