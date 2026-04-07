const express = require('express');
const { asyncHandler } = require('../middleware/error-handler');
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
    sessionId,
    attribution
  } = req.body || {};
  if (!sessionId) return res.status(400).json({
    error: 'sessionId required'
  });
  await pool.query(`INSERT INTO session_attribution (session_id, utm, landing_url, referrer, created_at)
     VALUES ($1, $2, $3, $4, NOW())
     ON CONFLICT (session_id) DO UPDATE
       SET utm = EXCLUDED.utm, landing_url = EXCLUDED.landing_url, referrer = EXCLUDED.referrer`, [sessionId, attribution.utm || {}, attribution.landing_url || null, attribution.referrer || null]);
  res.json({
    ok: true
  });
}));
module.exports = router;