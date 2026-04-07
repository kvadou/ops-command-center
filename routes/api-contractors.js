const express = require('express');
const { tableExists, getAllColumns } = require('../utils/schema-cache');
const {
  pool,
  auth
} = global;
const { requireAuth } = require('../middleware/auth');
const authMiddleware = auth || requireAuth;
const cache = require('../utils/cache');
const { asyncHandler } = require('../middleware/error-handler');
const { logger } = require('../utils/logger');
const router = express.Router();

// Get all contractors for search/selection
router.get('/', asyncHandler(async (req, res) => {
  try {
    const { search, status = 'approved', limit = 500, tutor_id } = req.query;

    // Build cache key from query params
    const cacheKey = `contractors:list:${search || 'all'}:${status}:${limit}:${tutor_id || 'all'}`;

    const result = await cache.getOrSet(cacheKey, async () => {
      // Check table and column existence (cached after first call)
      const contractorsExists = await tableExists(pool, 'contractors');

      if (!contractorsExists) {
        logger.warn('Contractors table does not exist. Returning empty array.');
        return [];
      }

      const columnSet = await getAllColumns(pool, 'contractors');
      const availableColumns = Array.from(columnSet);

      // Define all columns we want to select
      const desiredColumns = [
        'contractor_id',
        'first_name',
        'last_name',
        'email',
        'mobile',
        'phone',
        'status',
        'default_rate',
        'town',
        'state',
        'country',
        'postcode',
        'street',
        'timezone',
        'photo',
        'date_created',
        'review_rating',
        'labels',
        'extra_attrs',
        'qualifications',
        'skills',
        'institutions'
      ];

      // Build SELECT clause: use column if exists, otherwise NULL
      const selectClause = desiredColumns.map(col => {
        if (availableColumns.includes(col)) {
          return col;
        } else {
          return `NULL as ${col}`;
        }
      }).join(',\n        ');

      // If tutor_id is provided, return a single contractor
      if (tutor_id) {
        const { rows } = await pool.query(`
          SELECT
            ${selectClause}
          FROM contractors
          WHERE contractor_id = $1
        `, [tutor_id]);

        if (rows.length === 0) {
          return null; // Will be handled after cache
        }

        const contractor = rows[0];

        // Parse JSON fields safely
        try {
          contractor.labels = contractor.labels ? (typeof contractor.labels === 'string' ? JSON.parse(contractor.labels) : contractor.labels) : [];
          const extraAttrs = contractor.extra_attrs ? (typeof contractor.extra_attrs === 'string' ? JSON.parse(contractor.extra_attrs) : contractor.extra_attrs) : {};
          contractor.extra_attrs = extraAttrs;
          contractor.qualifications = contractor.qualifications ? (typeof contractor.qualifications === 'string' ? JSON.parse(contractor.qualifications) : contractor.qualifications) : [];
          contractor.skills = contractor.skills ? (typeof contractor.skills === 'string' ? JSON.parse(contractor.skills) : contractor.skills) : [];
          contractor.institutions = contractor.institutions ? (typeof contractor.institutions === 'string' ? JSON.parse(contractor.institutions) : contractor.institutions) : [];
        } catch (parseError) {
          logger.error({ err: parseError, tutorId: tutor_id }, 'Error parsing JSON fields for contractor');
          contractor.labels = Array.isArray(contractor.labels) ? contractor.labels : [];
          contractor.extra_attrs = typeof contractor.extra_attrs === 'object' ? contractor.extra_attrs : {};
          contractor.qualifications = Array.isArray(contractor.qualifications) ? contractor.qualifications : [];
          contractor.skills = Array.isArray(contractor.skills) ? contractor.skills : [];
          contractor.institutions = Array.isArray(contractor.institutions) ? contractor.institutions : [];
        }

        return contractor;
      }

      let query = `
        SELECT
          ${selectClause}
        FROM contractors
        WHERE 1=1
      `;

      const params = [];
      let paramCount = 0;

      if (search) {
        paramCount++;
        query += ` AND (first_name ILIKE $${paramCount} OR last_name ILIKE $${paramCount} OR email ILIKE $${paramCount})`;
        params.push(`%${search}%`);
      }

      if (status) {
        paramCount++;
        query += ` AND status = $${paramCount}`;
        params.push(status);
      }

      query += ` ORDER BY first_name, last_name LIMIT $${paramCount + 1}`;
      params.push(parseInt(limit));

      const { rows } = await pool.query(query, params);

      // Parse JSON fields for easier frontend consumption
      const contractors = rows.map(contractor => {
        try {
          const labels = contractor.labels ? (typeof contractor.labels === 'string' ? JSON.parse(contractor.labels) : contractor.labels) : [];
          const extraAttrs = contractor.extra_attrs ? (typeof contractor.extra_attrs === 'string' ? JSON.parse(contractor.extra_attrs) : contractor.extra_attrs) : {};

          // Extract tier_rate from extra_attrs if it exists
          let tierRate = null;
          if (Array.isArray(extraAttrs)) {
            const tierRateAttr = extraAttrs.find(attr => attr.machine_name === 'tier_rate');
            if (tierRateAttr && tierRateAttr.value) {
              // Remove dollar sign and parse as float
              const cleanValue = tierRateAttr.value.toString().replace(/[$,]/g, '');
              tierRate = parseFloat(cleanValue);
            }
          }

          return {
            ...contractor,
            labels,
            extra_attrs: extraAttrs,
            tier_rate: tierRate,
            qualifications: contractor.qualifications ? (typeof contractor.qualifications === 'string' ? JSON.parse(contractor.qualifications) : contractor.qualifications) : [],
            skills: contractor.skills ? (typeof contractor.skills === 'string' ? JSON.parse(contractor.skills) : contractor.skills) : [],
            institutions: contractor.institutions ? (typeof contractor.institutions === 'string' ? JSON.parse(contractor.institutions) : contractor.institutions) : []
          };
        } catch (parseError) {
          logger.error({ err: parseError, contractorId: contractor.contractor_id }, 'Error parsing JSON fields for contractor');
          return {
            ...contractor,
            labels: [],
            extra_attrs: {},
            tier_rate: null,
            qualifications: [],
            skills: [],
            institutions: []
          };
        }
      });

      return contractors;
    }, 60); // 60 second TTL for contractor lists

    // Handle 404 for tutor_id lookup
    if (tutor_id && result === null) {
      return res.status(404).json({ error: 'Contractor not found' });
    }

    res.json(result);
  } catch (error) {
    logger.error({ err: error }, 'Error fetching contractors');
    res.status(500).json({ 
      error: 'Failed to fetch contractors', 
      details: error.message,
      stack: process.env.NODE_ENV === 'development' ? error.stack : undefined
    });
  }
}));

// Get a specific contractor by ID
router.get('/:id', asyncHandler(async (req, res) => {
  try {
    const { id } = req.params;

    const cacheKey = `contractors:detail:${id}`;

    const contractor = await cache.getOrSet(cacheKey, async () => {
      // Check if the contractors table exists (cached)
      const contractorsExists = await tableExists(pool, 'contractors');

      if (!contractorsExists) {
        return null;
      }

      const { rows } = await pool.query(`
        SELECT *
        FROM contractors
        WHERE contractor_id = $1
      `, [id]);

      if (rows.length === 0) {
        return null;
      }

      const contractor = rows[0];

      // Parse JSON fields safely
      try {
        contractor.labels = contractor.labels ? (typeof contractor.labels === 'string' ? JSON.parse(contractor.labels) : contractor.labels) : [];
        const extraAttrs = contractor.extra_attrs ? (typeof contractor.extra_attrs === 'string' ? JSON.parse(contractor.extra_attrs) : contractor.extra_attrs) : {};
        contractor.extra_attrs = extraAttrs;

        // Extract tier_rate from extra_attrs if it exists
        contractor.tier_rate = null;
        if (Array.isArray(extraAttrs)) {
          const tierRateAttr = extraAttrs.find(attr => attr.machine_name === 'tier_rate');
          if (tierRateAttr && tierRateAttr.value) {
            // Remove dollar sign and parse as float
            const cleanValue = tierRateAttr.value.toString().replace(/[$,]/g, '');
            contractor.tier_rate = parseFloat(cleanValue);
          }
        }

        contractor.qualifications = contractor.qualifications ? (typeof contractor.qualifications === 'string' ? JSON.parse(contractor.qualifications) : contractor.qualifications) : [];
        contractor.skills = contractor.skills ? (typeof contractor.skills === 'string' ? JSON.parse(contractor.skills) : contractor.skills) : [];
        contractor.institutions = contractor.institutions ? (typeof contractor.institutions === 'string' ? JSON.parse(contractor.institutions) : contractor.institutions) : [];
        contractor.received_notifications = contractor.received_notifications ? (typeof contractor.received_notifications === 'string' ? JSON.parse(contractor.received_notifications) : contractor.received_notifications) : [];
        contractor.work_done_details = contractor.work_done_details ? (typeof contractor.work_done_details === 'string' ? JSON.parse(contractor.work_done_details) : contractor.work_done_details) : {};
      } catch (parseError) {
        logger.error({ err: parseError, contractorId: id }, 'Error parsing JSON fields for contractor');
        // Set defaults if parsing fails
        contractor.labels = Array.isArray(contractor.labels) ? contractor.labels : [];
        contractor.extra_attrs = typeof contractor.extra_attrs === 'object' ? contractor.extra_attrs : {};
        contractor.tier_rate = null;
        contractor.qualifications = Array.isArray(contractor.qualifications) ? contractor.qualifications : [];
        contractor.skills = Array.isArray(contractor.skills) ? contractor.skills : [];
        contractor.institutions = Array.isArray(contractor.institutions) ? contractor.institutions : [];
        contractor.received_notifications = Array.isArray(contractor.received_notifications) ? contractor.received_notifications : [];
        contractor.work_done_details = typeof contractor.work_done_details === 'object' ? contractor.work_done_details : {};
      }

      return contractor;
    }, 300); // 300 second TTL for individual contractor details

    if (!contractor) {
      return res.status(404).json({ error: 'Contractor not found' });
    }

    res.json(contractor);
  } catch (error) {
    logger.error({ err: error }, 'Error fetching contractor');
    res.status(500).json({ 
      error: 'Failed to fetch contractor', 
      details: error.message,
      stack: process.env.NODE_ENV === 'development' ? error.stack : undefined
    });
  }
}));

// Get reviews for a specific contractor
router.get('/:id/reviews', asyncHandler(async (req, res) => {
  try {
    const { id } = req.params;
    const { limit = 10 } = req.query;

    const cacheKey = `contractors:reviews:${id}:${limit}`;

    const reviews = await cache.getOrSet(cacheKey, async () => {
      const { rows } = await pool.query(`
        SELECT
          review_id,
          client_id,
          client_name,
          contractor_id,
          contractor_name,
          extra_attrs_value as review_text,
          star_rating_value,
          date_created
        FROM reviews
        WHERE contractor_id = $1
        ORDER BY date_created DESC
        LIMIT $2
      `, [id, parseInt(limit)]);

      return rows;
    }, 300); // 300 second TTL for reviews

    res.json(reviews);
  } catch (error) {
    logger.error({ error: error.message }, 'Error fetching contractor reviews');
    res.status(500).json({ error: 'Failed to fetch contractor reviews' });
  }
}));

// Search contractors for autocomplete
router.get('/search/autocomplete', asyncHandler(async (req, res) => {
  try {
    const { q, limit = 10 } = req.query;

    if (!q || q.length < 2) {
      return res.json([]);
    }

    const cacheKey = `contractors:autocomplete:${q}:${limit}`;

    const suggestions = await cache.getOrSet(cacheKey, async () => {
      // Search local database first
      const { rows } = await pool.query(`
        SELECT
          contractor_id,
          first_name,
          last_name,
          email,
          status,
          town,
          state
        FROM contractors
        WHERE (first_name ILIKE $1 OR last_name ILIKE $1 OR email ILIKE $1)
        AND status = 'approved'
        ORDER BY first_name, last_name
        LIMIT $2
      `, [`%${q}%`, parseInt(limit)]);

      if (rows.length > 0) {
        return rows.map(contractor => ({
          id: contractor.contractor_id,
          name: `${contractor.first_name} ${contractor.last_name}`,
          email: contractor.email,
          location: `${contractor.town}, ${contractor.state}`,
          status: contractor.status
        }));
      }

      // Fallback: search TutorCruncher API when no local results found
      // NOTE: TC list endpoint does NOT return status — must fetch detail for each
      try {
        const { tutorCruncherAPI } = require('../config/deps');
        const { data } = await tutorCruncherAPI.get(`/contractors/?page_size=10&search=${encodeURIComponent(q)}`);
        const listResults = data.results || [];

        // Fetch detail for each result to get status and full data, then backfill DB
        const approved = [];
        for (const tc of listResults) {
          try {
            const { data: full } = await tutorCruncherAPI.get(`/contractors/${tc.id}/`);
            await pool.query(`
              INSERT INTO contractors (
                contractor_id, latitude, longitude, date_created, first_name, last_name,
                email, mobile, phone, street, state, town, country, postcode, timezone,
                title, photo, status, default_rate, qualifications, skills, institutions,
                received_notifications, review_rating, review_duration, calendar_colour,
                labels, extra_attrs, work_done_details, created_at, updated_at
              )
              VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17, $18, $19, $20, $21, $22, $23, $24, $25, $26, $27, $28, $29, NOW(), NOW())
              ON CONFLICT (contractor_id) DO UPDATE SET
                first_name = EXCLUDED.first_name,
                last_name = EXCLUDED.last_name,
                email = EXCLUDED.email,
                status = EXCLUDED.status,
                town = EXCLUDED.town,
                state = EXCLUDED.state,
                updated_at = NOW()
            `, [
              full.id,
              full.latitude ? parseFloat(full.latitude) : null,
              full.longitude ? parseFloat(full.longitude) : null,
              full.date_created ? new Date(full.date_created) : null,
              full.first_name, full.last_name, full.email,
              full.mobile, full.phone, full.street, full.state, full.town,
              full.country, full.postcode, full.timezone, full.title, full.photo,
              full.status,
              full.default_rate ? parseFloat(full.default_rate) : null,
              JSON.stringify(full.qualifications || []),
              JSON.stringify(full.skills || []),
              JSON.stringify(full.institutions || []),
              JSON.stringify(full.received_notifications || []),
              full.review_rating ? parseFloat(full.review_rating) : null,
              full.review_duration || null,
              full.calendar_colour,
              JSON.stringify(full.labels || []),
              JSON.stringify(full.extra_attrs || []),
              JSON.stringify(full.work_done_details || {})
            ]);
            if (full.status === 'approved') {
              approved.push(full);
            }
          } catch (detailErr) {
            logger.error({ contractorId: tc.id, error: detailErr.message }, 'Failed to backfill contractor');
          }
        }

        // Clear autocomplete cache so next search hits fresh local data
        await cache.clearCacheByPrefix('contractors:autocomplete');

        return approved.map(c => ({
          id: c.id,
          name: `${c.first_name} ${c.last_name}`,
          email: c.email,
          location: [c.town, c.state].filter(Boolean).join(', '),
          status: c.status
        }));
      } catch (tcError) {
        logger.error({ error: tcError.message }, 'TC API fallback search failed');
        return [];
      }
    }, 60); // 60 second TTL for autocomplete searches

    res.json(suggestions);
  } catch (error) {
    logger.error({ error: error.message }, 'Error searching contractors');
    res.status(500).json({ error: 'Failed to search contractors' });
  }
}));

// PUT /api/contractors/:id/profile — Update tutor public profile fields
router.put('/:id/profile', authMiddleware, asyncHandler(async (req, res) => {
  const { getLocationPool } = require('../utils/pool');
  const pool = getLocationPool(req);
  const contractorId = parseInt(req.params.id);

  if (isNaN(contractorId)) {
    return res.status(400).json({ error: 'Invalid contractor ID' });
  }

  const {
    profileBio,
    profileHeadshotUrl,
    profileTeachingStyle,
    profileYearsExperience,
    profileTitle,
    profileVisible,
    profileLanguages,
    profilePreviousExperience,
    profileAvailabilityNotes,
    emergencyContactName,
    emergencyContactPhone,
    emergencyContactRelation,
  } = req.body;

  // Determine visibility: auto-enable if bio + headshot both present
  let visible = profileVisible;
  if (profileBio && (profileHeadshotUrl || profileBio)) {
    // Will be handled by backend logic
  }

  await pool.query(`
    UPDATE contractors SET
      profile_bio = COALESCE($1, profile_bio),
      profile_headshot_url = COALESCE($2, profile_headshot_url),
      profile_teaching_style = COALESCE($3, profile_teaching_style),
      profile_years_experience = $4,
      profile_title = COALESCE($5, profile_title),
      profile_visible = COALESCE($6, profile_visible),
      profile_languages = $7,
      profile_previous_experience = COALESCE($8, profile_previous_experience),
      profile_availability_notes = COALESCE($9, profile_availability_notes),
      emergency_contact_name = COALESCE($10, emergency_contact_name),
      emergency_contact_phone = COALESCE($11, emergency_contact_phone),
      emergency_contact_relation = COALESCE($12, emergency_contact_relation),
      profile_synced_at = NOW()
    WHERE contractor_id = $13
  `, [
    profileBio || null, profileHeadshotUrl || null, profileTeachingStyle || null,
    profileYearsExperience != null && profileYearsExperience !== '' ? parseInt(profileYearsExperience) || null : null,
    profileTitle || null, visible != null ? visible : null,
    profileLanguages || null, profilePreviousExperience || null, profileAvailabilityNotes || null,
    emergencyContactName || null, emergencyContactPhone || null, emergencyContactRelation || null,
    contractorId
  ]);

  // Clear caches
  await cache.clearCacheByPrefix('contractors');

  // Auto-sync to Webflow (fire-and-forget)
  const WebflowTutorSyncService = require('../services/webflow-tutor-sync-service');
  const webflow = new WebflowTutorSyncService(pool);
  if (webflow.isConfigured()) {
    webflow.syncTutor(contractorId).catch(err => {
      logger.error({ contractorId, error: err.message }, 'Webflow sync failed after profile update');
    });
  }

  // Sync profile to STT (fire-and-forget)
  const sttUrl = process.env.STT_INTERNAL_API_URL;
  const sttSecret = process.env.STT_INTERNAL_API_SECRET || process.env.INTERNAL_API_SECRET;
  if (sttUrl && sttSecret) {
    const syncPayload = {};
    if (profileBio) syncPayload.bio = profileBio;
    if (profileHeadshotUrl) syncPayload.headshotUrl = profileHeadshotUrl;
    if (profileLanguages) syncPayload.languages = profileLanguages;
    if (emergencyContactName) syncPayload.emergencyContactName = emergencyContactName;
    if (emergencyContactPhone) syncPayload.emergencyContactPhone = emergencyContactPhone;
    if (emergencyContactRelation) syncPayload.emergencyContactRelation = emergencyContactRelation;

    if (Object.keys(syncPayload).length > 0) {
      const axios = require('axios');
      axios.put(
        `${sttUrl}/tutors/${contractorId}/profile-sync`,
        syncPayload,
        { headers: { Authorization: `Bearer ${sttSecret}` }, timeout: 10000 }
      ).then(() => {
        logger.info({ contractorId }, 'Profile synced to STT');
      }).catch(err => {
        logger.warn({ contractorId, error: err.message }, 'Profile sync to STT failed (non-fatal)');
      });
    }
  }

  // Return updated profile
  const { rows } = await pool.query(`
    SELECT slug, profile_bio, profile_headshot_url, profile_teaching_style,
      profile_years_experience, profile_title, profile_visible, profile_synced_at,
      webflow_item_id, profile_languages, profile_previous_experience,
      profile_availability_notes, emergency_contact_name, emergency_contact_phone,
      emergency_contact_relation
    FROM contractors WHERE contractor_id = $1
  `, [contractorId]);

  logger.info({ contractorId }, 'Tutor profile updated from OpsHub');
  res.json({ success: true, profile: rows[0] });
}));

module.exports = router;