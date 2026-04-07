/**
 * API endpoints for entity metrics (tutors, clients, students, affiliates)
 * Provides aggregated metrics for dashboard cards
 */

const express = require('express');
const router = express.Router();
const { requireAuth } = require('../middleware/auth');
const auth = global.auth || requireAuth;
const { logger } = require('../utils/logger');

const { getLocationPool } = require('../utils/pool');
const { asyncHandler } = require('../middleware/error-handler');

// GET /api/entity-metrics/tutors - Get tutor metrics
router.get('/tutors', auth, asyncHandler(async (req, res) => {
  try {
    const pool = getLocationPool(req);
    if (!pool) {
      return res.status(500).json({ error: 'Database connection not available' });
    }

    // Get metrics from tutor analytics endpoint logic
    // Active tutors (approved status)
    const activeTutorsQuery = `SELECT COUNT(*) as count FROM contractors WHERE status = 'approved'`;
    const { rows: activeRows } = await pool.query(activeTutorsQuery);
    const activeTutors = parseInt(activeRows[0].count);

    // Ramped up tutors (10+ lessons in first 60 days) - simplified check
    // This is a simplified version - full logic would require checking first lesson date
    const rampedUpQuery = `
      SELECT COUNT(DISTINCT c.contractor_id) as count
      FROM contractors c
      WHERE c.status = 'approved'
      AND EXISTS (
        SELECT 1 FROM appointments a
        JOIN appointment_contractors ac ON a.appointment_id = ac.appointment_id
        WHERE ac.contractor_id = c.contractor_id
        AND a.status IN ('complete', 'completed')
        GROUP BY ac.contractor_id
        HAVING COUNT(*) >= 10
      )
    `;
    const { rows: rampedRows } = await pool.query(rampedUpQuery);
    const rampedUp = parseInt(rampedRows[0].count);

    // High performers (top 20% by revenue)
    // Calculate revenue from appointment_recipients charge_rate where contractor is linked via appointment_contractors
    const highPerformersQuery = `
      WITH contractor_revenue AS (
        SELECT 
          ac.contractor_id,
          COALESCE(SUM(ar.charge_rate), 0) as total_revenue
        FROM appointment_contractors ac
        JOIN appointments a ON a.appointment_id = ac.appointment_id
        LEFT JOIN appointment_recipients ar ON ar.appointment_id = a.appointment_id
        JOIN contractors c ON c.contractor_id = ac.contractor_id
        WHERE a.status IN ('complete', 'completed')
        AND c.status = 'approved'
        GROUP BY ac.contractor_id
      ),
      total_approved AS (
        SELECT COUNT(*)::numeric as total FROM contractors WHERE status = 'approved'
      ),
      top_performers AS (
        SELECT contractor_id
        FROM contractor_revenue
        ORDER BY total_revenue DESC
        LIMIT GREATEST(1, CEIL((SELECT total FROM total_approved) * 0.2))
      )
      SELECT COUNT(*) as count
      FROM top_performers
    `;
    const { rows: highPerfRows } = await pool.query(highPerformersQuery);
    const highPerformers = parseInt(highPerfRows[0].count);

    // Needs attention (low activity - less than 5 lessons in last 90 days)
    // Only includes approved tutors
    const needsAttentionQuery = `
      SELECT COUNT(DISTINCT c.contractor_id) as count
      FROM contractors c
      WHERE c.status = 'approved'
      AND (
        NOT EXISTS (
          SELECT 1 FROM appointments a
          JOIN appointment_contractors ac ON a.appointment_id = ac.appointment_id
          WHERE ac.contractor_id = c.contractor_id
          AND a.status IN ('complete', 'completed')
          AND a.start >= NOW() - INTERVAL '90 days'
        )
        OR (
          SELECT COUNT(*) FROM appointments a
          JOIN appointment_contractors ac ON a.appointment_id = ac.appointment_id
          WHERE ac.contractor_id = c.contractor_id
          AND a.status IN ('complete', 'completed')
          AND a.start >= NOW() - INTERVAL '90 days'
        ) < 5
      )
    `;
    const { rows: needsAttentionRows } = await pool.query(needsAttentionQuery);
    const needsAttention = parseInt(needsAttentionRows[0].count);

    res.json({
      activeTutors,
      rampedUp,
      highPerformers,
      needsAttention
    });
  } catch (error) {
    logger.error({ msg: 'Error fetching tutor metrics', error: error.message });
    res.status(500).json({ error: 'Failed to fetch tutor metrics', details: error.message });
  }
}));

// GET /api/entity-metrics/clients - Get client metrics
router.get('/clients', auth, asyncHandler(async (req, res) => {
  try {
    const pool = getLocationPool(req);
    if (!pool) {
      return res.status(500).json({ error: 'Database connection not available' });
    }

    // Live clients
    const liveClientsQuery = `SELECT COUNT(*) as count FROM clients WHERE status = 'live'`;
    const { rows: liveRows } = await pool.query(liveClientsQuery);
    const liveClients = parseInt(liveRows[0].count);

    // High value clients (top 20% by lifetime value)
    const highValueQuery = `
      WITH client_revenue AS (
        SELECT 
          c.client_id, 
          COALESCE(SUM(ar.charge_rate), 0) as ltv
        FROM clients c
        LEFT JOIN appointment_recipients ar ON ar.paying_client_id::text = c.client_id
        LEFT JOIN appointments a ON a.appointment_id = ar.appointment_id
        WHERE c.status = 'live'
        AND (a.status IS NULL OR a.status IN ('complete', 'completed'))
        GROUP BY c.client_id
      ),
      total_live AS (
        SELECT COUNT(*)::numeric as total FROM clients WHERE status = 'live'
      ),
      top_clients AS (
        SELECT client_id
        FROM client_revenue
        ORDER BY ltv DESC
        LIMIT GREATEST(1, CEIL((SELECT total FROM total_live) * 0.2))
      )
      SELECT COUNT(*) as count
      FROM top_clients
    `;
    const { rows: highValueRows } = await pool.query(highValueQuery);
    const highValue = parseInt(highValueRows[0].count);

    // Active clients (lessons in last 30 days)
    const activeClientsQuery = `
      SELECT COUNT(DISTINCT ar.paying_client_id::text) as count
      FROM appointment_recipients ar
      JOIN appointments a ON a.appointment_id = ar.appointment_id
      JOIN clients c ON c.client_id = ar.paying_client_id::text
      WHERE a.status IN ('complete', 'completed')
      AND a.start >= NOW() - INTERVAL '30 days'
      AND c.status = 'live'
    `;
    const { rows: activeRows } = await pool.query(activeClientsQuery);
    const activeClients = parseInt(activeRows[0].count);

    // Needs attention (payment issues or low engagement)
    const needsAttentionQuery = `
      SELECT COUNT(DISTINCT c.client_id) as count
      FROM clients c
      WHERE c.status = 'live'
      AND (
        -- Payment issues
        (c.invoice_balance IS NOT NULL AND c.invoice_balance > 500)
        OR
        -- Low engagement (no lessons in last 90 days)
        NOT EXISTS (
          SELECT 1 FROM appointments a
          JOIN appointment_recipients ar ON a.appointment_id = ar.appointment_id
          WHERE ar.paying_client_id::text = c.client_id
          AND a.status IN ('complete', 'completed')
          AND a.start >= NOW() - INTERVAL '90 days'
        )
      )
    `;
    const { rows: needsAttentionRows } = await pool.query(needsAttentionQuery);
    const needsAttention = parseInt(needsAttentionRows[0].count);

    res.json({
      liveClients,
      highValue,
      activeClients,
      needsAttention
    });
  } catch (error) {
    logger.error({ msg: 'Error fetching client metrics', error: error.message });
    res.status(500).json({ error: 'Failed to fetch client metrics', details: error.message });
  }
}));

// GET /api/entity-metrics/students - Get student metrics
router.get('/students', auth, asyncHandler(async (req, res) => {
  try {
    const pool = getLocationPool(req);
    if (!pool) {
      return res.status(500).json({ error: 'Database connection not available' });
    }

    // Total students
    const totalQuery = `SELECT COUNT(*) as count FROM recipients`;
    const { rows: totalRows } = await pool.query(totalQuery);
    const totalStudents = parseInt(totalRows[0].count);

    // Active students (lessons in last 30 days)
    const activeQuery = `
      SELECT COUNT(DISTINCT ar.recipient_id) as count
      FROM appointment_recipients ar
      JOIN appointments a ON a.appointment_id = ar.appointment_id
      WHERE a.status IN ('complete', 'completed')
      AND a.start >= NOW() - INTERVAL '30 days'
    `;
    const { rows: activeRows } = await pool.query(activeQuery);
    const activeStudents = parseInt(activeRows[0].count);

    // Students by location (top location)
    const byLocationQuery = `
      SELECT COUNT(*) as count, r.town as location
      FROM recipients r
      WHERE r.town IS NOT NULL AND r.town != ''
      GROUP BY r.town
      ORDER BY count DESC
      LIMIT 1
    `;
    const { rows: locationRows } = await pool.query(byLocationQuery);
    const topLocation = locationRows[0] ? {
      location: locationRows[0].location,
      count: parseInt(locationRows[0].count)
    } : null;

    // Needs attention (no lessons in last 90 days)
    const needsAttentionQuery = `
      SELECT COUNT(DISTINCT r.recipient_id) as count
      FROM recipients r
      WHERE NOT EXISTS (
        SELECT 1 FROM appointments a
        JOIN appointment_recipients ar ON a.appointment_id = ar.appointment_id
        WHERE ar.recipient_id::text = r.recipient_id
        AND a.status IN ('complete', 'completed')
        AND a.start >= NOW() - INTERVAL '90 days'
      )
    `;
    const { rows: needsAttentionRows } = await pool.query(needsAttentionQuery);
    const needsAttention = parseInt(needsAttentionRows[0].count);

    res.json({
      totalStudents,
      activeStudents,
      topLocation,
      needsAttention
    });
  } catch (error) {
    logger.error({ msg: 'Error fetching student metrics', error: error.message });
    res.status(500).json({ error: 'Failed to fetch student metrics', details: error.message });
  }
}));

// GET /api/entity-metrics/affiliates - Get affiliate metrics
router.get('/affiliates', auth, asyncHandler(async (req, res) => {
  try {
    const pool = getLocationPool(req);
    if (!pool) {
      return res.status(500).json({ error: 'Database connection not available' });
    }

    // Active affiliates
    const activeQuery = `SELECT COUNT(*) as count FROM affiliates WHERE status = 'active'`;
    const { rows: activeRows } = await pool.query(activeQuery);
    const activeAffiliates = parseInt(activeRows[0].count);

    // High performers (if we track performance metrics)
    // For now, just return active count
    const highPerformers = activeAffiliates;

    // Recent additions (last 30 days)
    const recentQuery = `
      SELECT COUNT(*) as count
      FROM affiliates
      WHERE status = 'active'
      AND date_created >= NOW() - INTERVAL '30 days'
    `;
    const { rows: recentRows } = await pool.query(recentQuery);
    const recentAdditions = parseInt(recentRows[0].count);

    // Needs attention (inactive)
    const needsAttentionQuery = `SELECT COUNT(*) as count FROM affiliates WHERE status = 'inactive'`;
    const { rows: needsAttentionRows } = await pool.query(needsAttentionQuery);
    const needsAttention = parseInt(needsAttentionRows[0].count);

    res.json({
      activeAffiliates,
      highPerformers,
      recentAdditions,
      needsAttention
    });
  } catch (error) {
    logger.error({ msg: 'Error fetching affiliate metrics', error: error.message });
    res.status(500).json({ error: 'Failed to fetch affiliate metrics', details: error.message });
  }
}));

module.exports = router;

