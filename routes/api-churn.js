const express = require('express');
const router = express.Router();
const { asyncHandler } = require('../middleware/error-handler');
const { logger } = require('../utils/logger');
const ChurnPredictionService = require('../services/churn-prediction-service');

const { pool } = global;

// ─── At-Risk Clients ──────────────────────────────────────────────

router.get('/at-risk', asyncHandler(async (req, res) => {
  const { riskTier, limit = 50, offset = 0 } = req.query;

  const service = new ChurnPredictionService(pool);
  const result = await service.getAtRiskClients({
    riskTier: riskTier || undefined,
    limit: parseInt(limit, 10),
    offset: parseInt(offset, 10)
  });

  res.json(result);
}));

// ─── Explain Risk (Claude-powered) ───────────────────────────────

router.post('/:id/explain', asyncHandler(async (req, res) => {
  const { id } = req.params;

  const service = new ChurnPredictionService(pool);
  const result = await service.explainRisk(parseInt(id, 10));

  res.json(result);
}));

// ─── Tutor Churn Board ───────────────────────────────────────────

router.get('/tutor-board', asyncHandler(async (req, res) => {
  const service = new ChurnPredictionService(pool);
  const tutors = await service.getTutorChurnBoard();

  res.json({ tutors });
}));

module.exports = router;
