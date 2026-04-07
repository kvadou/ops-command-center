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
const { asyncHandler } = require('../middleware/error-handler');
const { logger } = require('../utils/logger');
const router = express.Router();
async function getDivisionsAndLabels(req, res) {
  try {
    const query = `
      SELECT DISTINCT division, ARRAY_AGG(DISTINCT label) AS labels
      FROM divisions
      GROUP BY division
      ORDER BY division
    `;
    const result = await pool.query(query);
    res.json(result.rows);
  } catch (error) {
    logger.error({ err: error }, 'Error fetching divisions and labels');
    res.status(500).send("Error fetching divisions and labels");
  }
}
router.get('/divisions-and-labels', asyncHandler(getDivisionsAndLabels));
router.post('/divisions-and-labels', asyncHandler(getDivisionsAndLabels));
module.exports = router;