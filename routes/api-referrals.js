/**
 * Tutor Referral Tracking API
 *
 * CRUD, matching, points, stats. Supports both JWT (OpsHub) and internal API key (STT) auth.
 */
const express = require('express');
const router = express.Router();
const { buildDeps } = require('../config/deps');
const { asyncHandler } = require('../middleware/error-handler');
const { requireAuth } = require('../middleware/auth');
const ReferralService = require('../services/referral-service');
const { logger } = require('../utils/logger');

const auth = global.auth || requireAuth;
const { pool } = buildDeps();

// Internal auth for STT cross-app calls (same pattern as tutor profile sync)
function requireInternalAuth(req, res, next) {
  const secret = process.env.INTERNAL_API_SECRET || process.env.STT_INTERNAL_API_SECRET;
  if (!secret) {
    logger.error('INTERNAL_API_SECRET not configured');
    return res.status(500).json({ error: 'Server configuration error' });
  }

  const authHeader = req.header('Authorization');
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return res.status(401).json({ error: 'Unauthorized' });
  }

  const token = authHeader.slice(7);
  if (token !== secret) {
    return res.status(401).json({ error: 'Unauthorized' });
  }

  next();
}

// Accept either JWT or internal API key
function requireAnyAuth(req, res, next) {
  const authHeader = req.header('Authorization');
  const secret = process.env.INTERNAL_API_SECRET || process.env.STT_INTERNAL_API_SECRET;

  // Check internal API key first
  if (secret && authHeader && authHeader.startsWith('Bearer ') && authHeader.slice(7) === secret) {
    return next();
  }

  // Fall back to JWT auth
  return auth(req, res, next);
}

// ─── STT + OpsHub: Submit referral ─────────────────────────────

router.post('/', requireAnyAuth, asyncHandler(async (req, res) => {
  const {
    contractor_id, referred_name, referred_email, referred_phone,
    referral_type, referring_client_id, referring_client_name, notes
  } = req.body;

  if (!contractor_id || !referred_name) {
    return res.status(400).json({ error: 'contractor_id and referred_name are required' });
  }
  if (!referred_email && !referred_phone) {
    return res.status(400).json({ error: 'Either referred_email or referred_phone is required' });
  }

  const service = new ReferralService(pool);
  const referral = await service.submitReferral({
    contractor_id, referred_name, referred_email, referred_phone,
    referral_type, referring_client_id, referring_client_name, notes
  });

  res.status(201).json({ referral });
}));

// ─── List referrals (filterable) ───────────────────────────────

router.get('/', requireAnyAuth, asyncHandler(async (req, res) => {
  const { contractor_id, status, limit, offset } = req.query;
  const service = new ReferralService(pool);
  const result = await service.listReferrals({
    contractor_id,
    status,
    limit: parseInt(limit) || 100,
    offset: parseInt(offset) || 0
  });
  res.json(result);
}));

// ─── Pending review count (for alert banners) ──────────────────

router.get('/pending-count', auth, asyncHandler(async (req, res) => {
  const service = new ReferralService(pool);
  const count = await service.getPendingReviewCount();
  res.json({ count });
}));

// ─── Auto-match suggestions for a client ───────────────────────

router.get('/suggestions', auth, asyncHandler(async (req, res) => {
  const { client_id, name, email, phone } = req.query;
  if (!client_id && !name && !email && !phone) {
    return res.status(400).json({ error: 'At least one search parameter required' });
  }
  const service = new ReferralService(pool);
  const suggestions = await service.findMatchSuggestions(client_id, name, email, phone);
  res.json({ suggestions });
}));

// ─── Tutor stats (STT dashboard) ──────────────────────────────

router.get('/stats/:contractor_id', requireAnyAuth, asyncHandler(async (req, res) => {
  const service = new ReferralService(pool);
  const stats = await service.getTutorStats(req.params.contractor_id);
  res.json({ stats });
}));

// ─── Single referral detail ────────────────────────────────────

router.get('/:id', auth, asyncHandler(async (req, res) => {
  const service = new ReferralService(pool);
  const referral = await service.getReferral(parseInt(req.params.id));
  if (!referral) {
    return res.status(404).json({ error: 'Referral not found' });
  }
  res.json({ referral });
}));

// ─── Confirm match ─────────────────────────────────────────────

router.patch('/:id/match', auth, asyncHandler(async (req, res) => {
  const { matched_client_id, matched_client_name } = req.body;
  if (!matched_client_id) {
    return res.status(400).json({ error: 'matched_client_id is required' });
  }

  const service = new ReferralService(pool);
  const referral = await service.confirmMatch(
    parseInt(req.params.id),
    matched_client_id,
    matched_client_name || null,
    req.user?.id || null
  );

  if (!referral) {
    return res.status(404).json({ error: 'Referral not found or not in matchable status' });
  }

  res.json({ referral });
}));

// ─── Reject referral ──────────────────────────────────────────

router.patch('/:id/reject', auth, asyncHandler(async (req, res) => {
  const { reason } = req.body;

  const service = new ReferralService(pool);
  const referral = await service.rejectReferral(
    parseInt(req.params.id),
    reason || null,
    req.user?.id || null
  );

  if (!referral) {
    return res.status(404).json({ error: 'Referral not found or not in rejectable status' });
  }

  res.json({ referral });
}));

// ─── Manual points refresh for single referral ─────────────────

router.post('/:id/refresh-points', auth, asyncHandler(async (req, res) => {
  const service = new ReferralService(pool);
  const referral = await service.updatePoints(parseInt(req.params.id));

  if (!referral) {
    return res.status(404).json({ error: 'Referral not found or not in tracking status' });
  }

  res.json({ referral });
}));

// ─── Batch points update (admin/testing) ───────────────────────

router.post('/refresh-all-points', auth, asyncHandler(async (req, res) => {
  const service = new ReferralService(pool);
  const results = await service.updateAllTrackingPoints();

  logger.info({ ...results, msg: 'Batch referral points refresh complete' });
  res.json({ results });
}));

module.exports = router;
