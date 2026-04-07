const express = require('express');
const router = express.Router();
const { asyncHandler } = require('../middleware/error-handler');
const { getLocationPool } = require('../utils/pool');
const { logger } = require('../utils/logger');
const TutorProfileService = require('../services/tutor-profile-service');

// ============================================================
// Public Endpoints (No Auth Required)
// ============================================================

// GET /api/tutor-profiles - List all visible tutor profiles
router.get('/', asyncHandler(async (req, res) => {
  const pool = getLocationPool(req);
  const service = new TutorProfileService(pool);

  const profiles = await service.listPublicProfiles();

  res.set('Cache-Control', 'public, max-age=300'); // 5 min cache
  res.json({ tutors: profiles, count: profiles.length });
}));

// GET /api/tutor-profiles/:slug - Single tutor profile by slug
router.get('/:slug', asyncHandler(async (req, res) => {
  const pool = getLocationPool(req);
  const service = new TutorProfileService(pool);

  const profile = await service.getPublicProfile(req.params.slug);

  if (!profile) {
    return res.status(404).json({ error: 'Tutor profile not found' });
  }

  // Parse labels JSON if stored as string
  if (profile.labels && typeof profile.labels === 'string') {
    try { profile.labels = JSON.parse(profile.labels); } catch { profile.labels = []; }
  }

  res.set('Cache-Control', 'public, max-age=300');
  res.json(profile);
}));

module.exports = router;
