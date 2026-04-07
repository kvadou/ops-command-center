const express = require('express');
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
router.get('/', auth, (req, res) => {
  logger.info('🔔 /api/sync-all called – starting background sync');
  res.status(202).json({ success: true, message: 'Sync started' });

  (async () => {
    const steps = [
      { name: 'syncLabels', fn: syncLabels },
      { name: 'syncPipelineStages', fn: syncPipelineStages },
      { name: 'syncClients', fn: syncClients },
      { name: 'syncServices', fn: syncServices },
      { name: 'syncInvoices', fn: syncInvoices },
      { name: 'syncAppointments', fn: syncAppointments },
      { name: 'syncPaymentOrders', fn: syncPaymentOrders },
    ];

    for (const step of steps) {
      const t0 = Date.now();
      try {
        await step.fn();
        const ms = Date.now() - t0;
        logger.info(`✅ ${step.name} finished in ${(ms/1000/60).toFixed(2)} min`);
      } catch (err) {
        logger.error({ error: err?.message || err }, `✖ ${step.name} failed:`);
        // continue to next step instead of aborting the entire run
      }
    }
    logger.info('🎉 All sync tasks attempted');
  })();
});
module.exports = router;