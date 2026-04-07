const express = require('express');
const axios = require('axios');
const router = express.Router();
const { asyncHandler } = require('../middleware/error-handler');
const { getLocationPool: getPool } = require('../utils/pool');
const FailedCheckoutService = require('../services/failed-checkout-service');

// ---------------------------------------------------------------------------
// GET / — List failed checkouts with filters
// ---------------------------------------------------------------------------
router.get('/', asyncHandler(async (req, res) => {
  const pool = getPool(req);
  const service = new FailedCheckoutService(pool);
  const { status, startDate, endDate, tutorId, limit, offset } = req.query;

  const rows = await service.getFailedCheckouts({
    status,
    startDate,
    endDate,
    tutorId,
    limit: parseInt(limit, 10) || 200,
    offset: parseInt(offset, 10) || 0,
  });

  res.json(rows);
}));

// ---------------------------------------------------------------------------
// GET /stats — Summary cards data
// ---------------------------------------------------------------------------
router.get('/stats', asyncHandler(async (req, res) => {
  const pool = getPool(req);
  const service = new FailedCheckoutService(pool);
  const stats = await service.getStats();
  res.json(stats);
}));

// ---------------------------------------------------------------------------
// GET /summary — Aggregated tutor-level summary
// ---------------------------------------------------------------------------
router.get('/summary', asyncHandler(async (req, res) => {
  const pool = getPool(req);
  const service = new FailedCheckoutService(pool);
  const { startDate, endDate } = req.query;
  const rows = await service.getFailedCheckoutSummary({ startDate, endDate });
  res.json(rows);
}));

// ---------------------------------------------------------------------------
// GET /tally — Period-based tally view (replaces Stephanie's spreadsheet)
// ---------------------------------------------------------------------------
router.get('/tally', asyncHandler(async (req, res) => {
  const pool = getPool(req);
  const service = new FailedCheckoutService(pool);
  const { startDate, endDate, periodType } = req.query;
  const rows = await service.getTallyData({ startDate, endDate, periodType });
  res.json(rows);
}));

// ---------------------------------------------------------------------------
// GET /stats/detail — Detail rows behind a KPI card
// ---------------------------------------------------------------------------
router.get('/stats/detail', asyncHandler(async (req, res) => {
  const pool = getPool(req);
  const service = new FailedCheckoutService(pool);
  const { type } = req.query;

  if (!['pending', 'resolved', 'repeat_offenders'].includes(type)) {
    return res.status(400).json({ error: 'type must be pending, resolved, or repeat_offenders' });
  }

  const rows = await service.getStatsDetail(type);
  res.json(rows);
}));

// ---------------------------------------------------------------------------
// GET /config — Get failed checkout config
// ---------------------------------------------------------------------------
router.get('/config', asyncHandler(async (req, res) => {
  const pool = getPool(req);
  const service = new FailedCheckoutService(pool);
  const config = await service.getConfig();
  res.json(config || {});
}));

// ---------------------------------------------------------------------------
// PUT /config — Update failed checkout config
// ---------------------------------------------------------------------------
router.put('/config', asyncHandler(async (req, res) => {
  const pool = getPool(req);
  const service = new FailedCheckoutService(pool);
  const config = await service.updateConfig(req.body);
  res.json(config);
}));

// ---------------------------------------------------------------------------
// GET /tutor/:contractorId — Individual tutor's failed checkout history
// ---------------------------------------------------------------------------
router.get('/tutor/:contractorId', asyncHandler(async (req, res) => {
  const pool = getPool(req);
  const service = new FailedCheckoutService(pool);
  const { startDate, endDate } = req.query;
  const rows = await service.getFailedCheckoutsByTutor(req.params.contractorId, { startDate, endDate });
  res.json(rows);
}));

// ---------------------------------------------------------------------------
// POST /cleanup — Manually trigger ghost appointment cleanup
// ---------------------------------------------------------------------------
router.post('/cleanup', asyncHandler(async (req, res) => {
  const pool = getPool(req);
  const service = new FailedCheckoutService(pool);

  const tcToken = String(process.env.TUTORCRUNCHER_API_TOKEN || '').replace(/['"]/g, '').trim();
  const tcClient = axios.create({
    baseURL: process.env.TUTORCRUNCHER_API_BASE || 'https://account.acmeops.com/api/',
    timeout: 30000,
    headers: { Authorization: `token ${tcToken}` },
  });

  const result = await service.cleanupDeletedAppointments(tcClient);
  res.json(result);
}));

// ---------------------------------------------------------------------------
// POST /:id/send-soft — Send soft reminder email
// ---------------------------------------------------------------------------
router.post('/:id/send-soft', asyncHandler(async (req, res) => {
  const pool = getPool(req);
  const service = new FailedCheckoutService(pool);
  const result = await service.sendSoftEmail(parseInt(req.params.id, 10));
  res.json(result);
}));

// ---------------------------------------------------------------------------
// POST /:id/send-hard — Send hard reminder email
// ---------------------------------------------------------------------------
router.post('/:id/send-hard', asyncHandler(async (req, res) => {
  const pool = getPool(req);
  const service = new FailedCheckoutService(pool);
  const result = await service.sendHardEmail(parseInt(req.params.id, 10));
  res.json(result);
}));

// ---------------------------------------------------------------------------
// POST /batch-email — Send batch emails (soft or hard)
// ---------------------------------------------------------------------------
router.post('/batch-email', asyncHandler(async (req, res) => {
  const pool = getPool(req);
  const service = new FailedCheckoutService(pool);
  const { logIds, emailType } = req.body;

  if (!logIds || !Array.isArray(logIds) || logIds.length === 0) {
    return res.status(400).json({ error: 'logIds array is required' });
  }
  if (!['soft', 'hard'].includes(emailType)) {
    return res.status(400).json({ error: 'emailType must be "soft" or "hard"' });
  }

  const results = await service.sendBatchEmails(logIds, emailType);
  res.json(results);
}));

// ---------------------------------------------------------------------------
// POST /:id/resolve — Manually resolve a failed checkout
// ---------------------------------------------------------------------------
router.post('/:id/resolve', asyncHandler(async (req, res) => {
  const pool = getPool(req);
  const service = new FailedCheckoutService(pool);
  const result = await service.resolveManually(parseInt(req.params.id, 10), req.body.notes);
  res.json(result);
}));

// ---------------------------------------------------------------------------
// POST /detect — Manually trigger detection (for testing)
// ---------------------------------------------------------------------------
router.post('/detect', asyncHandler(async (req, res) => {
  const pool = getPool(req);
  const service = new FailedCheckoutService(pool);
  const result = await service.detectFailedCheckouts();
  res.json(result);
}));

// ---------------------------------------------------------------------------
// POST /check-resolutions — Manually trigger resolution check
// ---------------------------------------------------------------------------
router.post('/check-resolutions', asyncHandler(async (req, res) => {
  const pool = getPool(req);
  const service = new FailedCheckoutService(pool);
  const result = await service.checkResolutions();
  res.json(result);
}));

module.exports = router;
