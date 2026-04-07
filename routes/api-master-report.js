const express = require('express');
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
const {
  generateMasterReport
} = require('../master-report.js');
const { asyncHandler } = require('../middleware/error-handler');
const { logger } = require('../utils/logger');
router.get('/', asyncHandler(async (req, res) => {
  try {
    const {
      year,
      startDate,
      endDate,
      start,
      end
    } = req.query;
    
    // Handle both parameter formats for backward compatibility
    const actualStartDate = startDate || start;
    const actualEndDate = endDate || end;
    const actualYear = year || (actualStartDate ? new Date(actualStartDate).getFullYear() : new Date().getFullYear());
    
    if (!actualStartDate || !actualEndDate) {
      return res.status(400).json({
        error: 'startDate and endDate (or start and end) are required'
      });
    }
    
    const yearInt = parseInt(actualYear, 10);
    const reportData = await generateMasterReport(yearInt, actualStartDate, actualEndDate);
    res.json(reportData);
  } catch (error) {
    logger.error({ err: error }, 'Error fetching master report data');
    res.status(500).json({
      error: 'Internal server error',
      details: error.message
    });
  }
}));
module.exports = router;