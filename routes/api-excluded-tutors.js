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
    logger.info('Fetching excluded tutors...');
    const query = `
      SELECT tutor_id FROM excluded_tutors
    `;
    const result = await pool.query(query);
    res.json(result.rows.map(row => row.tutor_id));
  } catch (error) {
    logger.error({ err: error }, 'âŒ Error fetching excluded tutors:');
    res.status(500).json({
      error: 'Internal Server Error'
    });
  }
}));
module.exports = router;