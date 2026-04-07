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
  const {
    location,
    startDate,
    endDate,
    serviceId
  } = req.query;
  const clauses = [];
  const params = [];
  let idx = 1;
  if (startDate && endDate) {
    clauses.push(`a.start BETWEEN $${idx} AND $${idx + 1}`);
    params.push(startDate, endDate);
    idx += 2;
  }
  if (serviceId) {
    clauses.push(`a."serviceId" = $${idx}`);
    params.push(serviceId);
    idx += 1;
  }
  if (location) {
    clauses.push(`s.location = $${idx}`);
    params.push(location);
    idx += 1;
  }
  const where = clauses.length ? 'WHERE ' + clauses.join(' AND ') : '';
  const sql = `
    SELECT
      a.id,
      a.start,
      a."end",
      a."serviceId",
      s.name           AS "serviceName",
      s.description    AS "serviceDescription",
      s.location       AS "serviceLocation",
      s.price,
      s.type,
      s.image          AS "selectedImage",
      s."colourGroup",
      s."dft_max_srs",
      s."rcrs",
      s."labelId",
      s."labelName"
    FROM "Appointments" a
    JOIN "Services"    s
      ON a."serviceId" = s."serviceId"
    ${where}
    ORDER BY a.start;
  `;
  try {
    const {
      rows
    } = await pool.query(sql, params);
    res.json(rows);
  } catch (err) {
    logger.error({ err: err }, 'âŒ Error fetching events via raw SQL:');
    res.status(500).send('Error fetching events');
  }
}));
module.exports = router;