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
router.get('/', asyncHandler(async (req, res) => {
  try {
    const existingServices = await Service.findAll({
      attributes: ['serviceId']
    });
    const existingServiceIds = existingServices.map(service => service.serviceId);
    const response = await axios.get(`${TUTORCRUNCHER_API_BASE}/appointments`, {
      headers: {
        Authorization: `Token ${TUTORCRUNCHER_API_TOKEN}`
      }
    });
    const appointments = response.data.results;
    for (const appointment of appointments) {
      if (appointment.service && existingServiceIds.includes(appointment.service.id.toString())) {
        const serviceId = appointment.service.id.toString();
        const appointmentId = appointment.id.toString();
        const existingAppointment = await Appointment.findOne({
          where: {
            id: appointmentId
          }
        });
        if (existingAppointment) {
          logger.info(`Updating appointment ${appointmentId} with status: ${appointment.status}`);
          await existingAppointment.update({
            start: appointment.start,
            end: appointment.finish,
            serviceId: serviceId,
            status: appointment.status
          });
        } else {
          logger.info(`Creating new appointment ${appointmentId} with status: ${appointment.status}`);
          await Appointment.create({
            id: appointmentId,
            start: appointment.start,
            end: appointment.finish,
            serviceId: serviceId,
            status: appointment.status
          });
        }
      }
    }
    res.status(200).json({
      message: 'Appointments synchronized successfully'
    });
  } catch (error) {
    logger.error({ err: error }, 'Error synchronizing appointments:');
    res.status(500).send('Error synchronizing appointments');
  }
}));
router.get('/:serviceId', asyncHandler(async (req, res) => {
  const {
    serviceId
  } = req.params;
  try {
    // Use location-specific database connection
    const locationPool = req.locationPool || pool;
    
    // Fetch all appointments with pagination
    let allAppointments = [];
    let nextUrl = `/appointments/?service=${serviceId}&page_size=100`;
    let page = 1;
    
    // Fetch all appointments with pagination (same pattern as optimized-sync.js)
    while (nextUrl) {
      logger.info(`Fetching appointments page ${page} for service ${serviceId}...`);
      
      let data;
      try {
        if (limitedGet) {
          // Use limitedGet for rate limiting (returns axios response with .data)
          const response = await limitedGet(nextUrl);
          data = response.data;
        } else {
          // Fallback to direct axios call
          const fullUrl = nextUrl.startsWith('http') ? nextUrl : `${TUTORCRUNCHER_API_BASE}${nextUrl}`;
          const response = await axios.get(fullUrl, {
            headers: {
              Authorization: `Token ${TUTORCRUNCHER_API_TOKEN}`
            }
          });
          data = response.data;
        }
      } catch (apiError) {
        // Handle TutorCruncher API errors
        if (apiError.response?.status === 404 || apiError.response?.status === 400) {
          // Service doesn't exist in TutorCruncher - return empty result
          logger.info(`Service ${serviceId} not found in TutorCruncher, returning empty appointments list`);
          return res.status(200).json({
            message: 'No appointments found (service may not exist in TutorCruncher)',
            appointments: []
          });
        }
        // Re-throw other errors
        throw apiError;
      }
      
      if (data.results && Array.isArray(data.results)) {
        allAppointments.push(...data.results);
        logger.info(`Page ${page}: Found ${data.results.length} appointments (total: ${allAppointments.length})`);
      }
      
      // Check if there's a next page (same pattern as optimized-sync.js)
      if (data.next) {
        // Extract relative path from full URL
        if (tutorCruncherAPI && tutorCruncherAPI.defaults && tutorCruncherAPI.defaults.baseURL) {
          nextUrl = data.next.replace(tutorCruncherAPI.defaults.baseURL, '');
        } else {
          nextUrl = data.next.replace(TUTORCRUNCHER_API_BASE, '');
        }
      } else {
        nextUrl = null;
      }
      
      page++;
      
      // Safety check to prevent infinite loops
      if (page > 100) {
        logger.warn(`Stopping pagination after 100 pages for service ${serviceId}`);
        break;
      }
    }
    
    logger.info(`Synced ${allAppointments.length} total appointments for service ${serviceId}`);
    
    for (const appointment of allAppointments) {
      const appointmentId = appointment.id.toString();
      
      // Check if appointment exists using raw query
      // Use lowercase 'appointments' table name (not capitalized "Appointments")
      const existingCheck = await locationPool.query(
        'SELECT appointment_id FROM appointments WHERE appointment_id = $1',
        [appointmentId]
      );
      
      if (existingCheck.rows.length > 0) {
        // Update existing appointment
        await locationPool.query(
          `UPDATE appointments 
           SET start = $1, finish = $2, service_id = $3, status = $4, updated_at = NOW()
           WHERE appointment_id = $5`,
          [
            appointment.start,
            appointment.finish,
            serviceId,
            appointment.status,
            appointmentId
          ]
        );
        logger.info(`Updated appointment ${appointmentId} with status: ${appointment.status}`);
      } else {
        // Create new appointment
        await locationPool.query(
          `INSERT INTO appointments (appointment_id, start, finish, service_id, status, created_at, updated_at)
           VALUES ($1, $2, $3, $4, $5, NOW(), NOW())`,
          [
            appointmentId,
            appointment.start,
            appointment.finish,
            serviceId,
            appointment.status
          ]
        );
        logger.info(`Created new appointment ${appointmentId} with status: ${appointment.status}`);
      }
    }
    res.status(200).json({
      message: 'Appointments synchronized successfully'
    });
  } catch (error) {
    logger.error({ err: error }, `Error synchronizing appointments for service ${serviceId}:`);
    
    // Handle specific error cases
    if (error.response?.status === 404 || error.response?.status === 400) {
      return res.status(404).json({
        error: 'Service not found in TutorCruncher',
        details: error.response.data?.detail || error.message,
        serviceId: serviceId
      });
    }
    
    res.status(500).json({
      error: 'Error synchronizing appointments',
      details: error.message
    });
  }
}));
module.exports = router;