const express = require('express');
const router = express.Router();
const { requireAuth } = require('../middleware/auth');
const auth = global.auth || requireAuth;
const { getLocationPool } = require('../utils/pool');
const { asyncHandler } = require('../middleware/error-handler');
const { logger } = require('../utils/logger');
const WebflowTutorSyncService = require('../services/webflow-tutor-sync-service');

/**
 * GET /api/webflow-sync/tutors/:contractorId/preview
 * Preview what will be synced to Webflow for a given tutor.
 */
router.get('/tutors/:contractorId/preview', auth, asyncHandler(async (req, res) => {
  const pool = getLocationPool(req);
  const contractorId = parseInt(req.params.contractorId);

  if (isNaN(contractorId)) {
    return res.status(400).json({ error: 'Invalid contractor ID' });
  }

  const { rows } = await pool.query(
    `SELECT contractor_id, first_name, last_name, slug,
            profile_bio, profile_headshot_url, profile_teaching_style,
            profile_years_experience, profile_title, photo, local_image_url,
            review_rating, town, state, webflow_item_id, profile_visible,
            profile_synced_at
     FROM contractors WHERE contractor_id = $1`,
    [contractorId]
  );

  if (rows.length === 0) {
    return res.status(404).json({ error: 'Contractor not found' });
  }

  const contractor = rows[0];
  const service = new WebflowTutorSyncService(pool);
  const fieldData = service.buildFieldData(contractor);
  const photoUrl = contractor.local_image_url || contractor.profile_headshot_url || contractor.photo || null;

  res.json({
    contractor_id: contractor.contractor_id,
    name: `${contractor.first_name} ${contractor.last_name}`.trim(),
    webflow_item_id: contractor.webflow_item_id,
    profile_visible: contractor.profile_visible,
    last_synced: contractor.profile_synced_at,
    webflow_configured: service.isConfigured(),
    field_preview: fieldData,
    photo_url: photoUrl,
    missing_fields: {
      slug: !contractor.slug,
      bio: !contractor.profile_bio,
      title: !contractor.profile_title,
      teaching_style: !contractor.profile_teaching_style,
      photo: !photoUrl,
    },
  });
}));

/**
 * POST /api/webflow-sync/tutors/:contractorId
 * Sync a single tutor to Webflow CMS (text + photo).
 */
router.post('/tutors/:contractorId', auth, asyncHandler(async (req, res) => {
  const pool = getLocationPool(req);
  const contractorId = parseInt(req.params.contractorId);

  if (isNaN(contractorId)) {
    return res.status(400).json({ error: 'Invalid contractor ID' });
  }

  const service = new WebflowTutorSyncService(pool);

  if (!service.isConfigured()) {
    return res.status(500).json({ error: 'Webflow sync not configured — missing env vars' });
  }

  const itemId = await service.syncTutor(contractorId);

  // Also sync photo
  let photoSynced = false;
  if (itemId) {
    try {
      await service.syncTutorPhoto(contractorId);
      photoSynced = true;
    } catch (err) {
      logger.error({ contractorId, error: err.message }, 'Webflow photo sync failed');
    }
  }

  // Update synced_at timestamp
  if (itemId) {
    await pool.query(
      'UPDATE contractors SET profile_synced_at = NOW() WHERE contractor_id = $1',
      [contractorId]
    );
  }

  logger.info({ contractorId, itemId, photoSynced }, 'Webflow single tutor sync complete');

  res.json({
    success: true,
    contractor_id: contractorId,
    webflow_item_id: itemId,
    photo_synced: photoSynced,
  });
}));

/**
 * POST /api/webflow-sync/tutors/bulk
 * Sync all eligible tutors to Webflow CMS.
 * Eligible = profile_visible AND has first_name AND has profile_bio.
 */
router.post('/tutors/bulk', auth, asyncHandler(async (req, res) => {
  const pool = getLocationPool(req);
  const service = new WebflowTutorSyncService(pool);

  if (!service.isConfigured()) {
    return res.status(500).json({ error: 'Webflow sync not configured — missing env vars' });
  }

  const { rows: tutors } = await pool.query(`
    SELECT contractor_id, first_name, last_name, slug, profile_bio,
           profile_title, profile_teaching_style, profile_visible,
           local_image_url, profile_headshot_url, photo, webflow_item_id
    FROM contractors
    WHERE profile_visible = true
      AND profile_bio IS NOT NULL
      AND first_name IS NOT NULL
    ORDER BY first_name
  `);

  const results = { synced: 0, photosSynced: 0, errors: [], skipped: [] };

  for (const tutor of tutors) {
    try {
      const itemId = await service.syncTutor(tutor.contractor_id);

      if (itemId) {
        results.synced++;

        // Sync photo too
        try {
          await service.syncTutorPhoto(tutor.contractor_id);
          results.photosSynced++;
        } catch (photoErr) {
          logger.warn({ contractorId: tutor.contractor_id, error: photoErr.message }, 'Photo sync failed during bulk');
        }

        // Update synced_at
        await pool.query(
          'UPDATE contractors SET profile_synced_at = NOW() WHERE contractor_id = $1',
          [tutor.contractor_id]
        );
      } else {
        results.skipped.push({
          contractor_id: tutor.contractor_id,
          name: `${tutor.first_name} ${tutor.last_name}`,
          reason: 'syncTutor returned null',
        });
      }

      // 1s delay to respect Webflow rate limits (~60 req/min)
      await new Promise(r => setTimeout(r, 1000));
    } catch (err) {
      logger.error({ contractorId: tutor.contractor_id, error: err.message }, 'Bulk sync error');
      results.errors.push({
        contractor_id: tutor.contractor_id,
        name: `${tutor.first_name} ${tutor.last_name}`,
        error: err.message,
      });
      // Continue with next tutor
      await new Promise(r => setTimeout(r, 1000));
    }
  }

  // Also report tutors that are visible but missing required data
  const { rows: incomplete } = await pool.query(`
    SELECT contractor_id, first_name, last_name,
           profile_bio IS NULL AS missing_bio,
           first_name IS NULL AS missing_name,
           (local_image_url IS NULL AND profile_headshot_url IS NULL AND photo IS NULL) AS missing_photo
    FROM contractors
    WHERE profile_visible = true
      AND (profile_bio IS NULL OR first_name IS NULL)
    ORDER BY first_name
  `);

  logger.info({
    synced: results.synced,
    photosSynced: results.photosSynced,
    errors: results.errors.length,
    skipped: results.skipped.length,
    incomplete: incomplete.length,
  }, 'Webflow bulk sync complete');

  res.json({
    total_eligible: tutors.length,
    synced: results.synced,
    photos_synced: results.photosSynced,
    errors: results.errors,
    skipped: results.skipped,
    incomplete_profiles: incomplete.map(r => ({
      contractor_id: r.contractor_id,
      name: `${r.first_name || '?'} ${r.last_name || '?'}`,
      missing_bio: r.missing_bio,
      missing_name: r.missing_name,
      missing_photo: r.missing_photo,
    })),
  });
}));

module.exports = router;
