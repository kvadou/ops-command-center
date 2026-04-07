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
  syncPaymentOrders,
} = global;

const router = express.Router();

// Kick off payment orders sync only
router.get('/', asyncHandler(async (req, res) => {
  res.status(202).json({ success: true, message: 'Payment orders sync started' });
  try {
    await syncPaymentOrders();
    logger.info('✅ syncPaymentOrders completed via /api/sync-payment-orders');
  } catch (err) {
    logger.error({ error: err?.message || err }, '✖ syncPaymentOrders failed via endpoint');
  }
}));

module.exports = router;


