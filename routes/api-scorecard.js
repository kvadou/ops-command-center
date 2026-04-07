/**
 * EOS Scorecard API
 *
 * Weekly scorecard metrics: config, snapshots, live computation, manual entry.
 */
const express = require('express');
const router = express.Router();
const { buildDeps } = require('../config/deps');
const { asyncHandler } = require('../middleware/error-handler');
const { requireAuth } = require('../middleware/auth');
const ScorecardService = require('../services/scorecard-service');
const { logger } = require('../utils/logger');

const auth = global.auth || requireAuth;
const { pool } = buildDeps();

// GET /metrics — List active metrics config
router.get('/metrics', auth, asyncHandler(async (req, res) => {
  const service = new ScorecardService(pool);
  const metrics = await service.getMetrics();
  res.json({ metrics });
}));

// POST /metrics — Create or update a metric (admin)
router.post('/metrics', auth, asyncHandler(async (req, res) => {
  const { metric_key, display_name, owner } = req.body;
  if (!metric_key || !display_name || !owner) {
    return res.status(400).json({ error: 'metric_key, display_name, and owner are required' });
  }
  const service = new ScorecardService(pool);
  const metric = await service.upsertMetric(req.body);
  res.json({ metric });
}));

// DELETE /metrics/:key — Soft delete a metric
router.delete('/metrics/:key', auth, asyncHandler(async (req, res) => {
  const service = new ScorecardService(pool);
  await service.deleteMetric(req.params.key);
  res.json({ success: true });
}));

// GET /data — Trailing weekly snapshot grid
router.get('/data', auth, asyncHandler(async (req, res) => {
  const weeks = parseInt(req.query.weeks) || 13;
  const service = new ScorecardService(pool);
  const data = await service.getSnapshots(weeks);
  res.json(data);
}));

// GET /data/current — Live-compute current (incomplete) week
router.get('/data/current', auth, asyncHandler(async (req, res) => {
  const now = new Date();
  const day = now.getDay();
  const monday = new Date(now);
  monday.setDate(now.getDate() - (day === 0 ? 6 : day - 1));
  monday.setHours(0, 0, 0, 0);
  const sunday = new Date(monday);
  sunday.setDate(monday.getDate() + 6);
  const weekStart = monday.toISOString().split('T')[0];
  const weekEnd = sunday.toISOString().split('T')[0];

  const service = new ScorecardService(pool);
  const [metrics, values] = await Promise.all([
    service.getMetrics(),
    service.computeAllMetrics(weekStart, weekEnd)
  ]);
  res.json({ week_start: weekStart, week_end: weekEnd, metrics, values });
}));

// POST /data/manual — Manual entry
router.post('/data/manual', auth, asyncHandler(async (req, res) => {
  const { metric_key, week_start, value } = req.body;
  if (!metric_key || !week_start || value === undefined || value === null) {
    return res.status(400).json({ error: 'metric_key, week_start, and value are required' });
  }
  const service = new ScorecardService(pool);
  const entry = await service.saveManualValue(metric_key, week_start, value);
  res.json({ entry });
}));

// POST /data/snapshot — Trigger manual snapshot (admin/testing)
router.post('/data/snapshot', auth, asyncHandler(async (req, res) => {
  let { week_start } = req.body;
  if (!week_start) {
    // Default to previous week's Monday
    const now = new Date();
    const day = now.getDay();
    const thisMonday = new Date(now);
    thisMonday.setDate(now.getDate() - (day === 0 ? 6 : day - 1));
    const prevMonday = new Date(thisMonday);
    prevMonday.setDate(thisMonday.getDate() - 7);
    week_start = prevMonday.toISOString().split('T')[0];
  }
  const service = new ScorecardService(pool);
  const weekEnd = new Date(new Date(week_start).getTime() + 6 * 86400000).toISOString().split('T')[0];
  const snapshot = await service.snapshotWeek(week_start, weekEnd);
  res.json({ snapshot });
}));

module.exports = router;
