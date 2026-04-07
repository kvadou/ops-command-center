const express = require('express');
const router = express.Router();
const { requireAuth: auth } = require('../middleware/auth');
const { requireStaffOrAdmin } = require('../middleware/rbac');
const { asyncHandler } = require('../middleware/error-handler');
const { logger } = require('../utils/logger');
const JobHealthService = require('../services/job-health-service');

// GET /api/job-health/at-risk — At-risk jobs with risk scores
router.get('/at-risk', auth, requireStaffOrAdmin, asyncHandler(async (req, res) => {
  const service = new JobHealthService(global.pool);
  const jobs = await service.getAtRiskJobs();
  res.json({ jobs, count: jobs.length });
}));

// GET /api/job-health/analytics — Historical placement metrics
router.get('/analytics', auth, requireStaffOrAdmin, asyncHandler(async (req, res) => {
  const service = new JobHealthService(global.pool);
  const analytics = await service.getAnalytics();
  res.json(analytics);
}));

// GET /api/job-health/score/:serviceId — Detailed risk breakdown for a single job
router.get('/score/:serviceId', auth, requireStaffOrAdmin, asyncHandler(async (req, res) => {
  const serviceId = parseInt(req.params.serviceId);
  if (isNaN(serviceId)) {
    return res.status(400).json({ error: 'Invalid service ID' });
  }

  const service = new JobHealthService(global.pool);
  const result = await service.getJobScore(serviceId);

  if (!result) {
    return res.status(404).json({ error: 'Job not found' });
  }

  res.json(result);
}));

// POST /api/job-health/recalculate — Trigger risk score recalculation
router.post('/recalculate', auth, requireStaffOrAdmin, asyncHandler(async (req, res) => {
  const service = new JobHealthService(global.pool);
  const result = await service.recalculateAllScores();
  logger.info({ updated: result.updated }, 'Recalculated job placement scores');
  res.json(result);
}));

module.exports = router;
