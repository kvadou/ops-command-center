const express = require('express');
const router = express.Router();
const { requireAuth } = require('../middleware/auth');
const auth = global.auth || requireAuth;

const { getLocationPool: getPool } = require('../utils/pool');
const { asyncHandler } = require('../middleware/error-handler');
const { logger } = require('../utils/logger');

/**
 * GET /api/school-activity/:clientId
 * Get all CRM activity for a school
 */
router.get('/:clientId', auth, asyncHandler(async (req, res) => {
  try {
    const pool = getPool(req);
    const { clientId } = req.params;
    const { type, limit = 50, offset = 0 } = req.query;

    let query = `
      SELECT id, client_id as "clientId", activity_type as "activityType",
             subject, description, contact_person as "contactPerson",
             outcome, follow_up_date as "followUpDate", follow_up_completed as "followUpCompleted",
             invoice_id as "invoiceId", source, created_by as "createdBy",
             created_at as "createdAt", updated_at as "updatedAt"
      FROM school_activity
      WHERE client_id = $1
    `;
    const params = [clientId];

    if (type && type !== 'all') {
      params.push(type);
      query += ` AND activity_type = $${params.length}`;
    }

    query += ` ORDER BY created_at DESC LIMIT $${params.length + 1} OFFSET $${params.length + 2}`;
    params.push(parseInt(limit), parseInt(offset));

    const result = await pool.query(query, params);

    // Also get total count
    let countQuery = `SELECT COUNT(*) FROM school_activity WHERE client_id = $1`;
    const countParams = [clientId];
    if (type && type !== 'all') {
      countParams.push(type);
      countQuery += ` AND activity_type = $2`;
    }
    const countResult = await pool.query(countQuery, countParams);

    res.json({
      activities: result.rows,
      total: parseInt(countResult.rows[0].count),
      limit: parseInt(limit),
      offset: parseInt(offset)
    });
  } catch (error) {
    if (error.code === '42P01') { // table doesn't exist yet
      return res.json({ activities: [], total: 0, limit: 50, offset: 0 });
    }
    logger.error({ err: error }, 'Error fetching school activity:');
    res.status(500).json({ error: 'Failed to fetch school activity', details: error.message });
  }
}));

/**
 * POST /api/school-activity/:clientId
 * Log new CRM activity for a school
 */
router.post('/:clientId', auth, asyncHandler(async (req, res) => {
  try {
    const pool = getPool(req);
    const { clientId } = req.params;
    const {
      activityType, subject, description,
      contactPerson, outcome, followUpDate,
      invoiceId, source = 'school_crm'
    } = req.body;
    const createdBy = req.user?.name || req.user?.email || 'Unknown';

    if (!activityType || !description?.trim()) {
      return res.status(400).json({ error: 'Activity type and description are required' });
    }

    const validTypes = ['call', 'email', 'note', 'task', 'meeting'];
    if (!validTypes.includes(activityType)) {
      return res.status(400).json({ error: `Invalid activity type. Must be one of: ${validTypes.join(', ')}` });
    }

    const result = await pool.query(
      `INSERT INTO school_activity
       (client_id, activity_type, subject, description, contact_person, outcome, follow_up_date, invoice_id, source, created_by)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)
       RETURNING id, client_id as "clientId", activity_type as "activityType",
                 subject, description, contact_person as "contactPerson",
                 outcome, follow_up_date as "followUpDate", follow_up_completed as "followUpCompleted",
                 invoice_id as "invoiceId", source, created_by as "createdBy",
                 created_at as "createdAt", updated_at as "updatedAt"`,
      [clientId, activityType, subject || null, description.trim(),
       contactPerson || null, outcome || null, followUpDate || null,
       invoiceId || null, source, createdBy]
    );

    res.json(result.rows[0]);
  } catch (error) {
    logger.error({ err: error }, 'Error creating school activity:');
    res.status(500).json({ error: 'Failed to create activity', details: error.message });
  }
}));

/**
 * PUT /api/school-activity/:clientId/:activityId
 * Update a school activity
 */
router.put('/:clientId/:activityId', auth, asyncHandler(async (req, res) => {
  try {
    const pool = getPool(req);
    const { clientId, activityId } = req.params;
    const {
      activityType, subject, description,
      contactPerson, outcome, followUpDate, followUpCompleted
    } = req.body;

    if (!description?.trim()) {
      return res.status(400).json({ error: 'Description is required' });
    }

    const result = await pool.query(
      `UPDATE school_activity
       SET activity_type = COALESCE($1, activity_type),
           subject = $2,
           description = $3,
           contact_person = $4,
           outcome = $5,
           follow_up_date = $6,
           follow_up_completed = COALESCE($7, follow_up_completed),
           updated_at = NOW()
       WHERE id = $8 AND client_id = $9
       RETURNING id, client_id as "clientId", activity_type as "activityType",
                 subject, description, contact_person as "contactPerson",
                 outcome, follow_up_date as "followUpDate", follow_up_completed as "followUpCompleted",
                 invoice_id as "invoiceId", source, created_by as "createdBy",
                 created_at as "createdAt", updated_at as "updatedAt"`,
      [activityType || null, subject || null, description.trim(),
       contactPerson || null, outcome || null, followUpDate || null,
       followUpCompleted, activityId, clientId]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Activity not found' });
    }

    res.json(result.rows[0]);
  } catch (error) {
    logger.error({ err: error }, 'Error updating school activity:');
    res.status(500).json({ error: 'Failed to update activity', details: error.message });
  }
}));

/**
 * DELETE /api/school-activity/:clientId/:activityId
 * Delete a school activity
 */
router.delete('/:clientId/:activityId', auth, asyncHandler(async (req, res) => {
  try {
    const pool = getPool(req);
    const { clientId, activityId } = req.params;

    const result = await pool.query(
      `DELETE FROM school_activity WHERE id = $1 AND client_id = $2 RETURNING id`,
      [activityId, clientId]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Activity not found' });
    }

    res.json({ success: true, id: parseInt(activityId) });
  } catch (error) {
    logger.error({ err: error }, 'Error deleting school activity:');
    res.status(500).json({ error: 'Failed to delete activity', details: error.message });
  }
}));

/**
 * GET /api/school-activity/follow-ups/upcoming
 * Get all upcoming follow-ups across all schools
 */
router.get('/follow-ups/upcoming', auth, asyncHandler(async (req, res) => {
  try {
    const pool = getPool(req);
    const days = parseInt(req.query.days) || 7;

    const result = await pool.query(
      `SELECT sa.id, sa.client_id as "clientId", sa.activity_type as "activityType",
              sa.subject, sa.description, sa.contact_person as "contactPerson",
              sa.outcome, sa.follow_up_date as "followUpDate",
              sa.follow_up_completed as "followUpCompleted",
              sa.invoice_id as "invoiceId", sa.created_by as "createdBy",
              sa.created_at as "createdAt",
              c.first_name || ' ' || COALESCE(c.last_name, '') as "schoolName"
       FROM school_activity sa
       LEFT JOIN clients c ON c.client_id::text = sa.client_id
       WHERE sa.follow_up_date IS NOT NULL
         AND sa.follow_up_completed = FALSE
         AND sa.follow_up_date BETWEEN CURRENT_DATE AND CURRENT_DATE + $1
       ORDER BY sa.follow_up_date ASC`,
      [days]
    );

    res.json(result.rows);
  } catch (error) {
    if (error.code === '42P01') {
      return res.json([]);
    }
    logger.error({ err: error }, 'Error fetching follow-ups:');
    res.status(500).json({ error: 'Failed to fetch follow-ups', details: error.message });
  }
}));

/**
 * PATCH /api/school-activity/:clientId/:activityId/complete-follow-up
 * Mark a follow-up as completed
 */
router.patch('/:clientId/:activityId/complete-follow-up', auth, asyncHandler(async (req, res) => {
  try {
    const pool = getPool(req);
    const { clientId, activityId } = req.params;

    const result = await pool.query(
      `UPDATE school_activity
       SET follow_up_completed = TRUE, updated_at = NOW()
       WHERE id = $1 AND client_id = $2
       RETURNING id, follow_up_date as "followUpDate", follow_up_completed as "followUpCompleted"`,
      [activityId, clientId]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Activity not found' });
    }

    res.json(result.rows[0]);
  } catch (error) {
    logger.error({ err: error }, 'Error completing follow-up:');
    res.status(500).json({ error: 'Failed to complete follow-up', details: error.message });
  }
}));

module.exports = router;
