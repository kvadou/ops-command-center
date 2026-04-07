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
    tutorIds
  } = req.body;
  try {
    logger.info({ tutorIds }, 'Updating excluded tutors list');
    await pool.query('DELETE FROM excluded_tutors');
    if (tutorIds.length > 0) {
      // Validate all IDs are integers to prevent SQL injection
      const validIds = tutorIds.map(id => parseInt(id, 10)).filter(id => !isNaN(id));
      if (validIds.length > 0) {
        const placeholders = validIds.map((_, i) => `($${i + 1})`).join(',');
        await pool.query(`INSERT INTO excluded_tutors (tutor_id) VALUES ${placeholders}`, validIds);
      }
    }
    logger.info('✅ Exclusion list updated successfully');
    res.json({
      success: true
    });
  } catch (error) {
    logger.error({ err: error }, '❌ Error updating excluded tutors');
    res.status(500).json({
      error: 'Internal Server Error'
    });
  }
}));
module.exports = router;