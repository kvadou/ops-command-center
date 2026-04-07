const express = require('express');
const { asyncHandler } = require('../middleware/error-handler');
const { logger } = require('../utils/logger');
const {
  pool,
  axios,
  cloudinary,
  tutorCruncherAPI,
  limitedGet,
  jwt,
  stripe,
  transporter,
  db,
  sequelize,
  Service,
  Location,
  ColourGroup,
  Appointment,
  delay,
  rateLimitRetry,
  auth,
  GRAVITY_FORMS_API_BASE_URL,
  KLAVIYO_API_KEY,
  LABEL_ID,
  TUTORCRUNCHER_API_BASE
} = global;

const router = express.Router();

// GET /api/public-services - Get all public services for school directory
router.get('/', asyncHandler(async (req, res) => {
  try {
    logger.info('Fetching public services for school directory...');
    
    // Use location-specific database connection
    const locationPool = req.locationPool || pool;
    
    // Query for services that are marked as public AND don't have "Job Finished" label
    const { rows } = await locationPool.query(`
      SELECT 
        s."serviceId",
        s.name,
        s.description,
        s.location,
        s.price,
        s.type,
        s."colourGroup",
        s."labelId",
        s."labelName",
        s.image,
        s."createdAt",
        s."updatedAt"
      FROM public."Services" s
      LEFT JOIN services rs ON s."serviceId" = rs.service_id::text
      WHERE s."publicVisible" = true
        AND (
          rs.labels IS NULL
          OR NOT (rs.labels @> '"Job Finished"'::jsonb)
        )
      ORDER BY s.location, s.name
    `);
    
    logger.info(`Found ${rows.length} public services`);
    
    // Transform the data for the public API
    const publicServices = rows.map(service => ({
      id: service.serviceId,
      name: service.name,
      description: service.description,
      location: service.location,
      price: service.price,
      type: service.type,
      colourGroup: service.colourGroup,
      labelName: service.labelName,
      image: service.image,
      bookingUrl: `${req.protocol}://${req.get('host')}/booking-forms/frontend?serviceId=${service.serviceId}`,
      createdAt: service.createdAt,
      updatedAt: service.updatedAt
    }));
    
    res.json({
      success: true,
      services: publicServices,
      total: publicServices.length,
      last_updated: new Date().toISOString()
    });

  } catch (error) {
    logger.error({ err: error }, 'Error fetching public services:');
    
    res.status(500).json({
      success: false,
      error: 'Failed to fetch public services',
      message: error.message
    });
  }
}));

// GET /api/public-services/:location - Get public services by location
router.get('/:location', asyncHandler(async (req, res) => {
  try {
    const { location } = req.params;
    logger.info(`Fetching public services for location: ${location}`);
    
    // Use location-specific database connection
    const locationPool = req.locationPool || pool;
    
    // Query for services that are marked as public, match the location, AND don't have "Job Finished" label
    const { rows } = await locationPool.query(`
      SELECT 
        s."serviceId",
        s.name,
        s.description,
        s.location,
        s.price,
        s.type,
        s."colourGroup",
        s."labelId",
        s."labelName",
        s.image,
        s."createdAt",
        s."updatedAt"
      FROM public."Services" s
      LEFT JOIN services rs ON s."serviceId" = rs.service_id::text
      WHERE s."publicVisible" = true
        AND LOWER(s.location) LIKE LOWER($1)
        AND (
          rs.labels IS NULL
          OR NOT (rs.labels @> '"Job Finished"'::jsonb)
        )
      ORDER BY s.name
    `, [`%${location}%`]);
    
    logger.info(`Found ${rows.length} public services for location: ${location}`);
    
    // Transform the data for the public API
    const publicServices = rows.map(service => ({
      id: service.serviceId,
      name: service.name,
      description: service.description,
      location: service.location,
      price: service.price,
      type: service.type,
      colourGroup: service.colourGroup,
      labelName: service.labelName,
      image: service.image,
      bookingUrl: `${req.protocol}://${req.get('host')}/booking-forms/frontend?serviceId=${service.serviceId}`,
      createdAt: service.createdAt,
      updatedAt: service.updatedAt
    }));
    
    res.json({
      success: true,
      services: publicServices,
      location: location,
      total: publicServices.length,
      last_updated: new Date().toISOString()
    });

  } catch (error) {
    logger.error({ err: error }, `Error fetching public services for location ${req.params.location}:`);
    
    res.status(500).json({
      success: false,
      error: 'Failed to fetch public services',
      message: error.message
    });
  }
}));

module.exports = router;
