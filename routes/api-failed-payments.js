const express = require('express');
const router = express.Router();
const { asyncHandler } = require('../middleware/error-handler');
const { logger } = require('../utils/logger');
const { getLocationPool: getPool } = require('../utils/pool');
const { syncFailedPayments } = require('../services/failed-payment-sync-service');

// ---------------------------------------------------------------------------
// GET / — List active (open) failed-payment cases
// ---------------------------------------------------------------------------
router.get('/', asyncHandler(async (req, res) => {
  const pool = getPool(req);
  const { assignee, search, sort, order } = req.query;

  const allowedSorts = [
    'client_name', 'total_outstanding', 'invoice_count',
    'oldest_invoice_date', 'opened_at', 'last_activity_date', 'assignee'
  ];
  const sortCol = allowedSorts.includes(sort) ? sort : 'opened_at';
  const sortDir = order === 'asc' ? 'ASC' : 'DESC';

  const conditions = [`fpc.status = 'open'`];
  const params = [];

  if (assignee) {
    params.push(assignee);
    conditions.push(`fpc.assignee = $${params.length}`);
  }

  if (search) {
    params.push(`%${search}%`);
    conditions.push(`fpc.client_name ILIKE $${params.length}`);
  }

  const whereClause = conditions.join(' AND ');

  const sql = `
    SELECT
      fpc.*,
      la.last_activity_date,
      la.last_activity_summary
    FROM failed_payment_cases fpc
    LEFT JOIN LATERAL (
      SELECT
        a.created_at AS last_activity_date,
        a.description AS last_activity_summary
      FROM ar_activity a
      WHERE a.case_id = fpc.id
      ORDER BY a.created_at DESC
      LIMIT 1
    ) la ON true
    WHERE ${whereClause}
    ORDER BY ${sortCol === 'last_activity_date' ? 'la.last_activity_date' : 'fpc.' + sortCol} ${sortDir} NULLS LAST
  `;

  const { rows } = await pool.query(sql, params);
  res.json({ cases: rows });
}));

// ---------------------------------------------------------------------------
// GET /resolved — Resolved cases with pagination
// ---------------------------------------------------------------------------
router.get('/resolved', asyncHandler(async (req, res) => {
  const pool = getPool(req);
  const page = Math.max(1, parseInt(req.query.page, 10) || 1);
  const limit = Math.min(100, Math.max(1, parseInt(req.query.limit, 10) || 25));
  const offset = (page - 1) * limit;
  const { search } = req.query;

  const conditions = [`fpc.status = 'resolved'`];
  const params = [];

  if (search) {
    params.push(`%${search}%`);
    conditions.push(`fpc.client_name ILIKE $${params.length}`);
  }

  const whereClause = conditions.join(' AND ');

  // Count + rows in parallel
  const countSql = `SELECT COUNT(*) FROM failed_payment_cases fpc WHERE ${whereClause}`;
  const dataSql = `
    SELECT fpc.*
    FROM failed_payment_cases fpc
    WHERE ${whereClause}
    ORDER BY fpc.resolved_at DESC NULLS LAST
    LIMIT $${params.length + 1} OFFSET $${params.length + 2}
  `;

  const [countResult, dataResult] = await Promise.all([
    pool.query(countSql, params),
    pool.query(dataSql, [...params, limit, offset])
  ]);

  const total = parseInt(countResult.rows[0].count, 10);
  res.json({
    cases: dataResult.rows,
    total,
    page,
    totalPages: Math.ceil(total / limit)
  });
}));

// ---------------------------------------------------------------------------
// GET /stats — KPI summary
// ---------------------------------------------------------------------------
router.get('/stats', asyncHandler(async (req, res) => {
  const pool = getPool(req);

  const sql = `
    WITH open_cases AS (
      SELECT
        COALESCE(SUM(total_outstanding), 0) AS total_outstanding,
        COUNT(*) AS active_count,
        COALESCE(
          EXTRACT(EPOCH FROM AVG(NOW() - opened_at)) / 86400,
          0
        ) AS avg_days_open
      FROM failed_payment_cases
      WHERE status = 'open'
    ),
    resolved_month AS (
      SELECT COUNT(*) AS resolved_this_month
      FROM failed_payment_cases
      WHERE status = 'resolved'
        AND resolved_at >= DATE_TRUNC('month', NOW())
    ),
    upcoming_follow AS (
      SELECT COUNT(*) AS upcoming_follow_ups
      FROM ar_activity
      WHERE follow_up_date IS NOT NULL
        AND follow_up_date <= (NOW() + INTERVAL '7 days')::date
        AND follow_up_completed = FALSE
    )
    SELECT
      oc.total_outstanding,
      oc.active_count,
      ROUND(oc.avg_days_open::numeric, 1) AS avg_days_open,
      rm.resolved_this_month,
      uf.upcoming_follow_ups
    FROM open_cases oc, resolved_month rm, upcoming_follow uf
  `;

  const { rows } = await pool.query(sql);
  res.json(rows[0]);
}));

// ---------------------------------------------------------------------------
// POST /sync — Trigger manual sync of failed payments
// NOTE: Must be before /:id to avoid Express matching "sync" as an :id param
// ---------------------------------------------------------------------------
router.post('/sync', asyncHandler(async (req, res) => {
  const pool = getPool(req);
  logger.info('Manual failed-payment sync triggered');

  const results = await syncFailedPayments(pool);
  res.json(results);
}));

// ---------------------------------------------------------------------------
// PATCH /activity/:activityId — Update an activity entry
// ---------------------------------------------------------------------------
router.patch('/activity/:activityId', asyncHandler(async (req, res) => {
  const pool = getPool(req);
  const { activityId } = req.params;
  const { description, contact_person, outcome, follow_up_date } = req.body;

  const setClauses = [];
  const params = [];

  if (description !== undefined) { params.push(description); setClauses.push(`description = $${params.length}`); }
  if (contact_person !== undefined) { params.push(contact_person || null); setClauses.push(`contact_person = $${params.length}`); }
  if (outcome !== undefined) { params.push(outcome || null); setClauses.push(`outcome = $${params.length}`); }
  if (follow_up_date !== undefined) { params.push(follow_up_date || null); setClauses.push(`follow_up_date = $${params.length}`); }

  if (setClauses.length === 0) {
    return res.status(400).json({ error: 'No valid fields to update' });
  }

  params.push(activityId);
  const { rows } = await pool.query(
    `UPDATE ar_activity SET ${setClauses.join(', ')} WHERE id = $${params.length} RETURNING *`,
    params
  );

  if (rows.length === 0) {
    return res.status(404).json({ error: 'Activity not found' });
  }

  logger.info({ activityId }, 'AR activity updated');
  res.json(rows[0]);
}));

// ---------------------------------------------------------------------------
// DELETE /activity/:activityId — Delete an activity entry
// ---------------------------------------------------------------------------
router.delete('/activity/:activityId', asyncHandler(async (req, res) => {
  const pool = getPool(req);
  const { activityId } = req.params;

  const { rowCount } = await pool.query('DELETE FROM ar_activity WHERE id = $1', [activityId]);

  if (rowCount === 0) {
    return res.status(404).json({ error: 'Activity not found' });
  }

  logger.info({ activityId }, 'AR activity deleted');
  res.json({ success: true });
}));

// ---------------------------------------------------------------------------
// GET /:id — Single case detail + activity timeline
// ---------------------------------------------------------------------------
router.get('/:id', asyncHandler(async (req, res) => {
  const pool = getPool(req);
  const { id } = req.params;

  const [caseResult, activityResult] = await Promise.all([
    pool.query('SELECT * FROM failed_payment_cases WHERE id = $1', [id]),
    pool.query(
      'SELECT * FROM ar_activity WHERE case_id = $1 ORDER BY created_at DESC',
      [id]
    )
  ]);

  if (caseResult.rows.length === 0) {
    return res.status(404).json({ error: 'Case not found' });
  }

  const caseData = caseResult.rows[0];

  // Fetch individual unpaid invoices for this client (Home/Online only, matching sync logic)
  const invoiceResult = await pool.query(`
    SELECT DISTINCT
      i.id AS invoice_id,
      i.still_to_pay,
      i.date_sent,
      ii.tutor_name,
      s.name AS service_name
    FROM invoices i
    JOIN invoice_items ii ON ii.invoice_id = i.id
    JOIN services s ON s.service_id = ii.service_id
    WHERE i.client_id = $1
      AND i.status = 'unpaid'
      AND i.still_to_pay > 0
      AND (
        s.labels::text LIKE '%"Home %'
        OR s.labels @> '"Online"'::jsonb
      )
      AND s.labels::text NOT LIKE '%"School%'
      AND s.labels::text NOT LIKE '%"Club %'
    ORDER BY i.date_sent DESC
  `, [caseData.client_id]);

  res.json({
    ...caseData,
    activities: activityResult.rows,
    invoices: invoiceResult.rows
  });
}));

// ---------------------------------------------------------------------------
// POST /:id/activity — Add outreach / activity entry
// ---------------------------------------------------------------------------
router.post('/:id/activity', asyncHandler(async (req, res) => {
  const pool = getPool(req);
  const { id } = req.params;
  const { activity_type, description, contact_person, outcome, follow_up_date, created_by } = req.body;

  if (!activity_type || !description) {
    return res.status(400).json({ error: 'activity_type and description are required' });
  }

  // Verify case exists
  const caseCheck = await pool.query('SELECT id, client_id FROM failed_payment_cases WHERE id = $1', [id]);
  if (caseCheck.rows.length === 0) {
    return res.status(404).json({ error: 'Case not found' });
  }

  const clientId = caseCheck.rows[0].client_id;

  const sql = `
    INSERT INTO ar_activity (case_id, client_id, activity_type, description, contact_person, outcome, follow_up_date, created_by)
    VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
    RETURNING *
  `;

  const { rows } = await pool.query(sql, [
    id, clientId, activity_type, description,
    contact_person || null, outcome || null, follow_up_date || null, created_by || null
  ]);

  logger.info({ caseId: id, activityType: activity_type }, 'AR activity added');
  res.status(201).json(rows[0]);
}));

// ---------------------------------------------------------------------------
// PATCH /:id — Update case metadata
// ---------------------------------------------------------------------------
router.patch('/:id', asyncHandler(async (req, res) => {
  const pool = getPool(req);
  const { id } = req.params;

  const allowedFields = ['assignee', 'issue_type', 'card_on_file', 'tutor_name', 'tc_link'];
  const setClauses = [];
  const params = [];

  for (const field of allowedFields) {
    if (req.body[field] !== undefined) {
      params.push(req.body[field]);
      setClauses.push(`${field} = $${params.length}`);
    }
  }

  if (setClauses.length === 0) {
    return res.status(400).json({ error: 'No valid fields to update' });
  }

  params.push(id);
  const sql = `
    UPDATE failed_payment_cases
    SET ${setClauses.join(', ')}
    WHERE id = $${params.length}
    RETURNING *
  `;

  const { rows } = await pool.query(sql, params);
  if (rows.length === 0) {
    return res.status(404).json({ error: 'Case not found' });
  }

  logger.info({ caseId: id, fields: Object.keys(req.body) }, 'Failed payment case updated');
  res.json(rows[0]);
}));

// ---------------------------------------------------------------------------
// PATCH /:id/resolve — Mark case as resolved
// ---------------------------------------------------------------------------
router.patch('/:id/resolve', asyncHandler(async (req, res) => {
  const pool = getPool(req);
  const { id } = req.params;
  const { resolution_notes, resolved_by } = req.body;

  // Update the case
  const updateSql = `
    UPDATE failed_payment_cases
    SET status = 'resolved', resolved_at = NOW(), resolution_notes = $1, resolved_by = $2
    WHERE id = $3 AND status = 'open'
    RETURNING *
  `;

  const { rows } = await pool.query(updateSql, [resolution_notes || null, resolved_by || null, id]);
  if (rows.length === 0) {
    return res.status(404).json({ error: 'Case not found or already resolved' });
  }

  const resolvedCase = rows[0];

  // Insert status_change activity
  await pool.query(
    `INSERT INTO ar_activity (case_id, client_id, activity_type, description, created_by)
     VALUES ($1, $2, 'status_change', $3, $4)`,
    [id, resolvedCase.client_id, resolution_notes || 'Case resolved', resolved_by || null]
  );

  logger.info({ caseId: id, resolvedBy: resolved_by }, 'Failed payment case resolved');
  res.json(resolvedCase);
}));

module.exports = router;
