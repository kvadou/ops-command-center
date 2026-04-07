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
router.post('/', asyncHandler(async (req, res) => {
  const {
    tutorId
  } = req.body;
  try {
    logger.info(`Adding tutor to exclusion list: ${tutorId}`);
    const query = `
      INSERT INTO excluded_tutors (tutor_id) VALUES ($1)
      ON CONFLICT DO NOTHING
    `;
    await pool.query(query, [tutorId]);
    logger.info('âœ… Tutor excluded successfully');
    res.json({
      success: true
    });
  } catch (error) {
    logger.error({ err: error }, 'âŒ Error excluding tutor:');
    res.status(500).json({
      error: 'Internal Server Error'
    });
  }
}));
router.delete('/:tutorId', asyncHandler(async (req, res) => {
  const {
    tutorId
  } = req.params;
  try {
    logger.info(`Removing tutor from exclusion list: ${tutorId}`);
    const query = `
      DELETE FROM excluded_tutors WHERE tutor_id = $1
    `;
    await pool.query(query, [tutorId]);
    logger.info('âœ… Tutor removed from exclusion list');
    res.json({
      success: true
    });
  } catch (error) {
    logger.error({ err: error }, 'âŒ Error removing tutor from exclusion list:');
    res.status(500).json({
      error: 'Internal Server Error'
    });
  }
}));
module.exports = router;