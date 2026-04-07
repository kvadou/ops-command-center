/**
 * Webhook Router — thin orchestrator
 *
 * Each webhook source is extracted into its own file under routes/webhooks/:
 *   - tutorcruncher.js  (~5700 lines) — TutorCruncher events + lesson reports
 *   - stripe.js         (~1780 lines) — Stripe checkout/subscription events
 *   - bad-margin.js     (~300 lines)  — Bad margin alert processing
 *   - missive.js        (~240 lines)  — Missive email/conversation tracking
 */
const express = require('express');
const router = express.Router();

// Mount domain-specific webhook handlers
router.use('/tutorcruncher', require('./webhooks/tutorcruncher'));
router.use('/bad-margin-alert', require('./webhooks/bad-margin'));
router.use('/stripe', require('./webhooks/stripe'));
router.use('/missive', require('./webhooks/missive'));

module.exports = router;
module.exports.handleCreatedReport = require('./webhooks/tutorcruncher').handleCreatedReport;
