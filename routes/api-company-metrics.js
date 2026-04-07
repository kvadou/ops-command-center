/**
 * Company Metrics API
 *
 * Returns verified lifetime metrics with live TutorCruncher delta.
 * Base values (MB + E4) stored in company_metrics table.
 * TC completed appointments after base_date are counted live
 * across ALL branches (main, 'Westside', 'Eastside', future franchises).
 */
const express = require('express');
const router = express.Router();
const { buildDeps } = require('../config/deps');
const { asyncHandler } = require('../middleware/error-handler');
const { requireAuth } = require('../middleware/auth');
const { getPool } = require('../database-connections');
const { logger } = require('../utils/logger');

const auth = global.auth || requireAuth;
const { pool } = buildDeps();

// Franchise locations to query for live TC data
// Add new franchise env keys here as they come online
const FRANCHISE_ENVS = ['westside', 'eastside'];

/**
 * Query completed appointments across main + all franchise databases
 * Returns { count, revenue, by_location: { main: N, westside: N, ... } }
 */
async function getLiveTCDelta(baseDate) {
  const countQuery = `SELECT COUNT(*) as cnt FROM appointments WHERE status = 'complete' AND start >= $1`;
  // Revenue from appointment_recipients (charge_rate lives there, not on appointments)
  const revenueQuery = `
    SELECT COALESCE(SUM(ar.charge_rate * COALESCE(a.units, 1)), 0) as total
    FROM appointments a
    JOIN appointment_recipients ar ON ar.appointment_id = a.appointment_id AND ar.status <> 'missed'
    WHERE a.status = 'complete' AND a.start >= $1
  `;

  // Query main DB
  const mainCountPromise = pool.query(countQuery, [baseDate]);
  const mainRevenuePromise = pool.query(revenueQuery, [baseDate]).catch(err => {
    logger.warn({ err }, 'Revenue query failed on main DB — using 0');
    return { rows: [{ total: 0 }] };
  });

  // Query each franchise DB in parallel
  const franchisePromises = FRANCHISE_ENVS.map(async (env) => {
    try {
      const franchisePool = getPool(env);
      const [countResult, revenueResult] = await Promise.all([
        franchisePool.query(countQuery, [baseDate]),
        franchisePool.query(revenueQuery, [baseDate])
      ]);
      return {
        env,
        count: parseInt(countResult.rows[0].cnt) || 0,
        revenue: parseFloat(revenueResult.rows[0].total) || 0
      };
    } catch (err) {
      logger.warn({ err, env }, `Failed to query ${env} for company metrics — skipping`);
      return { env, count: 0, revenue: 0 };
    }
  });

  const [mainCount, mainRevenue, ...franchiseResults] = await Promise.all([
    mainCountPromise,
    mainRevenuePromise,
    ...franchisePromises
  ]);

  const byLocation = {
    main: {
      count: parseInt(mainCount.rows[0].cnt) || 0,
      revenue: parseFloat(mainRevenue.rows[0].total) || 0
    }
  };

  let totalCount = byLocation.main.count;
  let totalRevenue = byLocation.main.revenue;

  for (const fr of franchiseResults) {
    byLocation[fr.env] = { count: fr.count, revenue: fr.revenue };
    totalCount += fr.count;
    totalRevenue += fr.revenue;
  }

  return { count: totalCount, revenue: totalRevenue, by_location: byLocation };
}

/**
 * GET /api/company-metrics
 * Returns all company metrics with live TC delta from all branches
 */
router.get('/', auth, asyncHandler(async (req, res) => {
  const { rows: metrics } = await pool.query(
    'SELECT metric_key, metric_value, description, source_breakdown, base_date, verified_at FROM company_metrics ORDER BY metric_key'
  );

  if (metrics.length === 0) {
    return res.json({ metrics: [], message: 'No metrics seeded yet. Run scripts/seed-company-metrics.js' });
  }

  // Get base_date from handshakes metric (all metrics share the same base_date)
  const handshakeMetric = metrics.find(m => m.metric_key === 'total_handshakes');
  let tcDelta = { count: 0, revenue: 0, by_location: {} };

  if (handshakeMetric && handshakeMetric.base_date) {
    tcDelta = await getLiveTCDelta(handshakeMetric.base_date);
  }

  const result = metrics.map(m => {
    const base = parseFloat(m.metric_value);
    let delta = 0;
    let total = base;

    if (m.metric_key === 'total_handshakes') {
      delta = tcDelta.count;
      total = base + delta;
    } else if (m.metric_key === 'total_revenue') {
      delta = tcDelta.revenue;
      total = base + delta;
    }

    const breakdown = { ...(m.source_breakdown || {}) };
    if (delta > 0) {
      breakdown.tutorcruncher_live = delta;
      breakdown.tutorcruncher_by_location = m.metric_key === 'total_handshakes'
        ? Object.fromEntries(Object.entries(tcDelta.by_location).map(([k, v]) => [k, v.count]))
        : Object.fromEntries(Object.entries(tcDelta.by_location).map(([k, v]) => [k, v.revenue]));
    }

    return {
      metric_key: m.metric_key,
      base_value: base,
      tc_delta: delta,
      total,
      description: m.description,
      source_breakdown: breakdown,
      base_date: m.base_date,
      verified_at: m.verified_at,
    };
  });

  res.json({ metrics: result });
}));

/**
 * GET /api/company-metrics/:key
 * Returns a single metric by key with live TC delta from all branches
 */
router.get('/:key', auth, asyncHandler(async (req, res) => {
  const { key } = req.params;

  const { rows } = await pool.query(
    'SELECT metric_key, metric_value, description, source_breakdown, base_date, verified_at FROM company_metrics WHERE metric_key = $1',
    [key]
  );

  if (rows.length === 0) {
    return res.status(404).json({ error: `Metric "${key}" not found` });
  }

  const m = rows[0];
  const base = parseFloat(m.metric_value);
  let delta = 0;

  if ((key === 'total_handshakes' || key === 'total_revenue') && m.base_date) {
    const tcDelta = await getLiveTCDelta(m.base_date);
    delta = key === 'total_handshakes' ? tcDelta.count : tcDelta.revenue;

    const breakdown = { ...(m.source_breakdown || {}) };
    if (delta > 0) {
      breakdown.tutorcruncher_live = delta;
      breakdown.tutorcruncher_by_location = key === 'total_handshakes'
        ? Object.fromEntries(Object.entries(tcDelta.by_location).map(([k, v]) => [k, v.count]))
        : Object.fromEntries(Object.entries(tcDelta.by_location).map(([k, v]) => [k, v.revenue]));
    }

    return res.json({
      metric_key: m.metric_key,
      base_value: base,
      tc_delta: delta,
      total: base + delta,
      description: m.description,
      source_breakdown: breakdown,
      base_date: m.base_date,
      verified_at: m.verified_at,
    });
  }

  res.json({
    metric_key: m.metric_key,
    base_value: base,
    tc_delta: 0,
    total: base,
    description: m.description,
    source_breakdown: m.source_breakdown || {},
    base_date: m.base_date,
    verified_at: m.verified_at,
  });
}));

module.exports = router;
