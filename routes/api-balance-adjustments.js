const express = require('express');
const router = express.Router();
const { pool } = global;
const { logger } = require('../utils/logger');
const { asyncHandler } = require('../middleware/error-handler');

// GET /api/balance-adjustments — list all adjustments with filters
router.get('/', asyncHandler(async (req, res) => {
  const { category, client_id, start_date, end_date, page = '1', limit = '50' } = req.query;
  const pageNum = parseInt(page, 10);
  const limitNum = Math.min(parseInt(limit, 10), 200);
  const offset = (pageNum - 1) * limitNum;

  const conditions = [];
  const params = [];
  let paramIdx = 1;

  if (category && category !== 'all') {
    conditions.push(`category = $${paramIdx++}`);
    params.push(category);
  }
  if (client_id) {
    conditions.push(`client_id = $${paramIdx++}`);
    params.push(parseInt(client_id, 10));
  }
  if (start_date) {
    conditions.push(`created_at >= $${paramIdx++}`);
    params.push(start_date);
  }
  if (end_date) {
    conditions.push(`created_at <= $${paramIdx++}::date + interval '1 day'`);
    params.push(end_date);
  }

  const where = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : '';

  const [dataResult, countResult] = await Promise.all([
    pool.query(`
      SELECT * FROM client_balance_adjustments
      ${where}
      ORDER BY created_at DESC
      LIMIT $${paramIdx} OFFSET $${paramIdx + 1}
    `, [...params, limitNum, offset]),
    pool.query(`
      SELECT COUNT(*) as total FROM client_balance_adjustments ${where}
    `, params)
  ]);

  res.json({
    adjustments: dataResult.rows,
    total: parseInt(countResult.rows[0].total, 10),
    page: pageNum,
    limit: limitNum
  });
}));

// GET /api/balance-adjustments/summary — aggregated totals by category
router.get('/summary', asyncHandler(async (req, res) => {
  const { start_date, end_date } = req.query;
  const conditions = [];
  const params = [];
  let paramIdx = 1;

  if (start_date) {
    conditions.push(`created_at >= $${paramIdx++}`);
    params.push(start_date);
  }
  if (end_date) {
    conditions.push(`created_at <= $${paramIdx++}::date + interval '1 day'`);
    params.push(end_date);
  }

  const where = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : '';

  const result = await pool.query(`
    SELECT
      category,
      COUNT(*) as count,
      COALESCE(SUM(amount), 0) as total_amount
    FROM client_balance_adjustments
    ${where}
    GROUP BY category
    ORDER BY total_amount DESC
  `, params);

  const summary = {
    error: { count: 0, total: 0 },
    trial: { count: 0, total: 0 },
    bundle: { count: 0, total: 0 },
    goodwill: { count: 0, total: 0 },
    uncategorized: { count: 0, total: 0 }
  };

  let grandTotal = 0;
  for (const row of result.rows) {
    const cat = row.category || 'uncategorized';
    if (summary[cat]) {
      summary[cat].count = parseInt(row.count, 10);
      summary[cat].total = parseFloat(row.total_amount);
    }
    grandTotal += parseFloat(row.total_amount);
  }

  res.json({ summary, grandTotal });
}));

// GET /api/balance-adjustments/client/:clientId — per-client history
router.get('/client/:clientId', asyncHandler(async (req, res) => {
  const clientId = parseInt(req.params.clientId, 10);

  const result = await pool.query(`
    SELECT * FROM client_balance_adjustments
    WHERE client_id = $1
    ORDER BY created_at DESC
  `, [clientId]);

  const totalCredits = result.rows.reduce((sum, r) => sum + parseFloat(r.amount || 0), 0);

  res.json({
    adjustments: result.rows,
    totalCredits
  });
}));

// PATCH /api/balance-adjustments/:id/categorize — update category + notes
router.patch('/:id/categorize', asyncHandler(async (req, res) => {
  const { id } = req.params;
  const { category, notes } = req.body;
  const validCategories = ['error', 'trial', 'bundle', 'goodwill', 'uncategorized'];

  if (!validCategories.includes(category)) {
    return res.status(400).json({ error: `Invalid category. Must be one of: ${validCategories.join(', ')}` });
  }

  const userName = req.user?.name || req.user?.email || 'Unknown';

  const result = await pool.query(`
    UPDATE client_balance_adjustments
    SET category = $1, notes = $2, categorized_by = $3, categorized_at = NOW()
    WHERE id = $4
    RETURNING *
  `, [category, notes || null, userName, id]);

  if (result.rows.length === 0) {
    return res.status(404).json({ error: 'Adjustment not found' });
  }

  logger.info({ adjustmentId: id, category, categorizedBy: userName }, 'Balance adjustment categorized');
  res.json(result.rows[0]);
}));

module.exports = router;
