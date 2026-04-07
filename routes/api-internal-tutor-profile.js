const express = require('express');
const router = express.Router();
const { asyncHandler } = require('../middleware/error-handler');
const { getLocationPool } = require('../utils/pool');
const { logger } = require('../utils/logger');
const cache = require('../utils/cache');
const TutorProfileService = require('../services/tutor-profile-service');
const WebflowTutorSyncService = require('../services/webflow-tutor-sync-service');

// Internal auth middleware — shared secret between STT and OpsHub
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

/**
 * GET /api/internal/tutor-profile/:tutorCruncherId
 * Called by STT to fetch current profile data for a tutor.
 */
router.get('/tutor-profile/:tutorCruncherId', requireInternalAuth, asyncHandler(async (req, res) => {
  const pool = getLocationPool(req);
  const contractorId = parseInt(req.params.tutorCruncherId);

  if (isNaN(contractorId)) {
    return res.status(400).json({ error: 'Invalid tutor ID' });
  }

  const { rows } = await pool.query(`
    SELECT
      contractor_id, first_name, last_name, slug, photo,
      profile_bio, profile_headshot_url, profile_teaching_style,
      profile_years_experience, profile_title, profile_visible,
      profile_synced_at, profile_languages, profile_previous_experience,
      profile_availability_notes, phone, emergency_contact_name,
      emergency_contact_phone, emergency_contact_relation
    FROM contractors WHERE contractor_id = $1
  `, [contractorId]);

  if (rows.length === 0) {
    return res.status(404).json({ error: 'Contractor not found' });
  }

  res.json(rows[0]);
}));

/**
 * POST /api/internal/tutor-profile-sync
 * Called by STT when a tutor updates their profile.
 * Updates contractors table with profile data.
 */
router.post('/tutor-profile-sync', requireInternalAuth, asyncHandler(async (req, res) => {
  const { tutorCruncherId, bio, headshotUrl, teachingStyle, yearsExperience, title,
    languages, previousExperience, availabilityNotes,
    emergencyContactName, emergencyContactPhone, emergencyContactRelation,
    phone
  } = req.body;

  if (!tutorCruncherId) {
    return res.status(400).json({ error: 'tutorCruncherId is required' });
  }

  const pool = getLocationPool(req);
  const service = new TutorProfileService(pool);

  await service.updateProfile(tutorCruncherId, {
    bio, headshotUrl, teachingStyle, yearsExperience, title,
    languages, previousExperience, availabilityNotes,
    emergencyContactName, emergencyContactPhone, emergencyContactRelation,
    phone,
  });

  // Clear contractor caches so updated profile data is immediately visible
  await cache.clearCacheByPrefix('contractors');

  logger.info({ tutorCruncherId }, 'Tutor profile synced from STT');

  // Auto-sync to Webflow CMS (fire-and-forget)
  const webflow = new WebflowTutorSyncService(pool);
  if (webflow.isConfigured()) {
    webflow.syncTutor(tutorCruncherId).catch(err => {
      logger.error({ tutorCruncherId, error: err.message }, 'Webflow sync failed');
    });
  }

  res.json({ success: true, tutorCruncherId });
}));

module.exports = router;
