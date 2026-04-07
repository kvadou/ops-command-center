// TutorCruncher API Integration
// Reference: docs/api/tutorcruncher/ for API documentation and data structures
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
  TUTORCRUNCHER_API_BASE,
  TUTORCRUNCHER_API_TOKEN
} = global;
const router = express.Router();
router.get('/services/:serviceId', asyncHandler(async (req, res) => {
  const {
    serviceId
  } = req.params;
  
  // Validate required globals are available
  if (!TUTORCRUNCHER_API_BASE) {
    logger.error('TUTORCRUNCHER_API_BASE is not defined');
    return res.status(500).json({
      error: 'Server configuration error',
      details: 'TUTORCRUNCHER_API_BASE is not defined'
    });
  }
  
  if (!TUTORCRUNCHER_API_TOKEN) {
    logger.error('TUTORCRUNCHER_API_TOKEN is not defined');
    return res.status(500).json({
      error: 'Server configuration error',
      details: 'TUTORCRUNCHER_API_TOKEN is not defined'
    });
  }
  
  try {
    // Ensure proper URL construction - remove trailing slash from base and add proper path
    const baseUrl = TUTORCRUNCHER_API_BASE.endsWith('/') 
      ? TUTORCRUNCHER_API_BASE.slice(0, -1) 
      : TUTORCRUNCHER_API_BASE;
    const url = `${baseUrl}/services/${serviceId}`;
    logger.info(`Fetching service details from TutorCruncher: ${url}`);
    
    const response = await axios.get(url, {
      headers: {
        Authorization: `Token ${TUTORCRUNCHER_API_TOKEN}`
      },
      timeout: 30000 // 30 second timeout
    });
    
    logger.info({ data: response.data }, 'Full API Response:');
    const serviceData = {
      name: response.data.name,
      description: response.data.description,
      price: response.data.dft_charge_rate,
      type: response.data.type || 'one-off',
      dft_max_srs: response.data.dft_max_srs,
      rcrs: response.data.rcrs
    };
    res.json(serviceData);
  } catch (error) {
    logger.error({ err: error }, 'Error fetching service details from TutorCruncher:');
    logger.error({ data: serviceId }, 'Service ID:');
    logger.error({ data: error.response?.status }, 'Error response status:');
    logger.error({ data: error.response?.data }, 'Error response data:');
    logger.error({ error: error.message }, 'Error message:');
    
    // Handle 404 errors - service doesn't exist in TutorCruncher
    if (error.response?.status === 404) {
      return res.status(404).json({
        error: 'Service not found in TutorCruncher',
        details: error.response.data?.detail || 'No Service matches the given query.',
        serviceId: serviceId
      });
    }
    
    // Provide more helpful error messages for other errors
    let errorMessage = 'Error fetching service details';
    let errorDetails = error.message;
    let statusCode = 500;
    
    if (error.response) {
      // API returned an error response
      errorDetails = error.response.data || `HTTP ${error.response.status}`;
      if (error.response.status === 401) {
        errorMessage = 'Authentication failed - check API token';
        statusCode = 401;
      } else if (error.response.status === 403) {
        errorMessage = 'Access forbidden - check API permissions';
        statusCode = 403;
      } else if (error.response.status >= 400 && error.response.status < 500) {
        // Other 4xx errors
        statusCode = error.response.status;
        errorMessage = `TutorCruncher API error: ${error.response.status}`;
      }
    } else if (error.request) {
      // Request was made but no response received
      errorMessage = 'No response from TutorCruncher API';
      errorDetails = 'Network error or timeout';
    }
    
    res.status(statusCode).json({
      error: errorMessage,
      details: errorDetails,
      serviceId: serviceId
    });
  }
}));
router.get('/sessions', asyncHandler(async (req, res) => {
  const {
    serviceId
  } = req.query;
  if (!serviceId) {
    return res.status(400).json({
      error: 'Missing serviceId'
    });
  }
  try {
    // Add cache-busting headers for real-time TutorCruncher data
    res.set({
      'Cache-Control': 'no-cache, no-store, must-revalidate',
      'Pragma': 'no-cache',
      'Expires': '0'
    });
    
    const response = await fetch(`https://secure.tutorcruncher.com/api/appointments/?service=${serviceId}`, {
      headers: {
        Authorization: `Token ${process.env.TUTORCRUNCHER_API_TOKEN}`,
        'Content-Type': 'application/json'
      }
    });
    if (!response.ok) {
      const text = await response.text();
      throw new Error(`TutorCruncher API error: ${text}`);
    }
    const data = await response.json();
    const formatted = data.results.map(appointment => ({
      id: appointment.id,
      start: appointment.start,
      topic: appointment.topic,
      status: appointment.status
    }));
    return res.json({
      sessions: formatted
    });
  } catch (err) {
    logger.error({ err: err }, 'TutorCruncher fetch error:');
    res.status(500).json({
      error: 'Failed to fetch sessions'
    });
  }
}));
router.get('/students', asyncHandler(async (req, res) => {
  const raw = (req.query.search || '').trim();
  if (raw.length < 3) {
    return res.json({
      students: []
    });
  }
  let params = {};
  const parts = raw.split(/\s+/);
  if (parts.length > 1) {
    params = {
      user__first_name: parts[0],
      user__last_name: parts.slice(1).join(' ')
    };
  } else {
    params = {
      user__first_name__icontains: raw
    };
  }
  try {
    const {
      data
    } = await tutorCruncherAPI.get('/recipients/', {
      params
    });
    const students = (data.results || []).filter(r => r.role_type === 'Student').map(r => ({
      id: r.id,
      firstName: r.first_name,
      lastName: r.last_name,
      email: r.email
    }));
    res.json({
      students
    });
  } catch (err) {
    logger.error({ err: err }, 'TC lookup failed:');
    res.status(502).json({
      students: []
    });
  }
}));
router.get('/students/:id', asyncHandler(async (req, res) => {
  const {
    id
  } = req.params;
  try {
    const {
      data
    } = await tutorCruncherAPI.get(`/recipients/${id}/`);
    res.json(data);
  } catch (err) {
    logger.error({ err: err }, 'TC lookup failed:');
    res.status(502).json({
      error: 'Failed to fetch student details'
    });
  }
}));
module.exports = router;