const express = require('express');
const router = express.Router();
const { requireAuth } = require('../middleware/auth');
const auth = global.auth || requireAuth;

const { getLocationPool: getPool } = require('../utils/pool');
const { asyncHandler } = require('../middleware/error-handler');
const { logger } = require('../utils/logger');

// Helper function to handle database connection errors with retry
async function executeQueryWithRetry(queryFn, maxRetries = 3, retryDelay = 1000) {
  let lastError;
  for (let attempt = 1; attempt <= maxRetries; attempt++) {
    try {
      return await queryFn();
    } catch (error) {
      lastError = error;
      if (error.code === '53300' || error.message?.includes('too many connections')) {
        if (attempt < maxRetries) {
          const delay = retryDelay * attempt;
          logger.warn(`⚠️ Connection pool exhausted, retrying in ${delay}ms (attempt ${attempt}/${maxRetries})`);
          await new Promise(resolve => setTimeout(resolve, delay));
          continue;
        }
      }
      throw error;
    }
  }
  throw lastError;
}

/**
 * POST /api/entity-analytics/tutors
 * Comprehensive tutor analytics similar to client analytics
 * Returns Tutor Value Generated (TVG) metrics, distribution, cohorts, and top performers
 */
router.post('/tutors', auth, asyncHandler(async (req, res) => {
  try {
    const pool = getPool(req);
    const { 
      labels = [], 
      dateRange = {},
      minLessons = 1
    } = req.body;

    // Build label filter if provided
    let serviceLabelFilterSQL = '';
    let queryParams = [];
    let paramCount = 0;
    
    if (labels && labels.length > 0) {
      const labelConditions = labels.map((label) => {
        paramCount++;
        queryParams.push(`%${label}%`);
        return `lbl.value ILIKE $${paramCount}`;
      }).join(' OR ');
      serviceLabelFilterSQL = `
        AND EXISTS (
          SELECT 1 
          FROM jsonb_array_elements_text(COALESCE(s.labels, '[]'::jsonb)) AS lbl(value)
          WHERE ${labelConditions}
        )
      `;
    }

    // Build date range filtering
    let dateWhereClause = '';
    if (dateRange && dateRange.start) {
      paramCount++;
      dateWhereClause += ` AND a.start >= $${paramCount}`;
      queryParams.push(dateRange.start);
    }
    if (dateRange && dateRange.end) {
      paramCount++;
      dateWhereClause += ` AND a.start <= $${paramCount}`;
      queryParams.push(dateRange.end);
    }

    // Add minLessons parameter
    paramCount++;
    const minLessonsParam = paramCount;
    queryParams.push(minLessons);

    // Get aggregate metrics
    const metricsQuery = `
      WITH tutor_revenue AS (
        SELECT
          ac.contractor_id,
          SUM(CASE WHEN ar.status <> 'missed' AND a.status IN ('complete', 'cancelled - chargeable') 
            THEN ar.charge_rate * a.units ELSE 0 END) AS total_revenue,
          COUNT(DISTINCT a.appointment_id) AS total_lessons,
          COUNT(DISTINCT ar.paying_client_id) AS unique_clients,
          COUNT(DISTINCT CASE WHEN a.start >= NOW() - INTERVAL '30 days' THEN ar.paying_client_id END) AS active_clients_30d,
          COUNT(DISTINCT CASE WHEN a.start >= NOW() - INTERVAL '90 days' THEN ar.paying_client_id END) AS active_clients_90d,
          SUM(CASE WHEN a.status IN ('complete', 'cancelled - chargeable') THEN a.units ELSE 0 END) AS total_hours
        FROM appointment_contractors ac
        JOIN appointments a ON ac.appointment_id = a.appointment_id
        LEFT JOIN services s ON a.service_id = s.service_id
        LEFT JOIN appointment_recipients ar ON a.appointment_id = ar.appointment_id
        WHERE a.status IN ('complete', 'cancelled - chargeable')
          AND ar.status <> 'missed'
          AND ar.paying_client_id IS NOT NULL
          ${serviceLabelFilterSQL}
          ${dateWhereClause}
        GROUP BY ac.contractor_id
        HAVING COUNT(DISTINCT a.appointment_id) >= $${minLessonsParam}
      ),
      approved_tutors AS (
        SELECT contractor_id FROM contractors WHERE status = 'approved'
      )
      SELECT
        COUNT(DISTINCT tr.contractor_id) FILTER (WHERE at.contractor_id IS NOT NULL) AS total_tutors,
        COALESCE(SUM(tr.total_revenue) FILTER (WHERE at.contractor_id IS NOT NULL), 0) AS total_tutor_value_generated,
        COALESCE(AVG(tr.total_revenue) FILTER (WHERE at.contractor_id IS NOT NULL), 0) AS avg_tutor_value_generated,
        COALESCE(PERCENTILE_CONT(0.5) WITHIN GROUP (ORDER BY tr.total_revenue) FILTER (WHERE at.contractor_id IS NOT NULL), 0) AS median_tutor_value_generated,
        COALESCE(PERCENTILE_CONT(0.75) WITHIN GROUP (ORDER BY tr.total_revenue) FILTER (WHERE at.contractor_id IS NOT NULL), 0) AS p75_tutor_value_generated,
        COALESCE(PERCENTILE_CONT(0.90) WITHIN GROUP (ORDER BY tr.total_revenue) FILTER (WHERE at.contractor_id IS NOT NULL), 0) AS p90_tutor_value_generated,
        COALESCE(SUM(tr.total_lessons) FILTER (WHERE at.contractor_id IS NOT NULL), 0) AS total_lessons_completed,
        COALESCE(AVG(tr.total_lessons) FILTER (WHERE at.contractor_id IS NOT NULL), 0) AS avg_lessons_per_tutor,
        COALESCE(SUM(tr.unique_clients) FILTER (WHERE at.contractor_id IS NOT NULL), 0) AS total_clients_served,
        COALESCE(AVG(tr.unique_clients) FILTER (WHERE at.contractor_id IS NOT NULL), 0) AS avg_clients_per_tutor,
        COALESCE(SUM(tr.active_clients_30d) FILTER (WHERE at.contractor_id IS NOT NULL), 0) AS active_clients_30_days,
        COALESCE(SUM(tr.active_clients_90d) FILTER (WHERE at.contractor_id IS NOT NULL), 0) AS active_clients_90_days,
        COALESCE(SUM(tr.total_hours) FILTER (WHERE at.contractor_id IS NOT NULL), 0) AS total_hours
      FROM tutor_revenue tr
      LEFT JOIN approved_tutors at ON tr.contractor_id = at.contractor_id
    `;

    const { rows: metrics } = await executeQueryWithRetry(
      () => pool.query(metricsQuery, queryParams),
      3,
      1000
    );

    // Get top tutors by TVG
    const topTutorsQuery = `
      WITH tutor_revenue AS (
        SELECT
          ac.contractor_id,
          ac.contractor_name,
          SUM(CASE WHEN ar.status <> 'missed' AND a.status IN ('complete', 'cancelled - chargeable') 
            THEN ar.charge_rate * a.units ELSE 0 END) AS total_revenue,
          COUNT(DISTINCT a.appointment_id) AS total_lessons,
          COUNT(DISTINCT ar.paying_client_id) AS unique_clients
        FROM appointment_contractors ac
        JOIN appointments a ON ac.appointment_id = a.appointment_id
        LEFT JOIN services s ON a.service_id = s.service_id
        LEFT JOIN appointment_recipients ar ON a.appointment_id = ar.appointment_id
        JOIN contractors c ON ac.contractor_id = c.contractor_id
        WHERE a.status IN ('complete', 'cancelled - chargeable')
          AND ar.status <> 'missed'
          AND ar.paying_client_id IS NOT NULL
          AND c.status = 'approved'
          ${serviceLabelFilterSQL}
          ${dateWhereClause}
        GROUP BY ac.contractor_id, ac.contractor_name
        HAVING COUNT(DISTINCT a.appointment_id) >= $${minLessonsParam}
      )
      SELECT
        contractor_id,
        contractor_name,
        total_revenue AS tvg_value,
        total_lessons,
        unique_clients
      FROM tutor_revenue
      ORDER BY total_revenue DESC
      LIMIT 10
    `;

    const { rows: topTutors } = await executeQueryWithRetry(
      () => pool.query(topTutorsQuery, queryParams),
      3,
      1000
    );

    // Get TVG distribution data
    const distributionQuery = `
      WITH tutor_revenue AS (
        SELECT
          ac.contractor_id,
          SUM(CASE WHEN ar.status <> 'missed' AND a.status IN ('complete', 'cancelled - chargeable') 
            THEN ar.charge_rate * a.units ELSE 0 END) AS total_revenue
        FROM appointment_contractors ac
        JOIN appointments a ON ac.appointment_id = a.appointment_id
        LEFT JOIN services s ON a.service_id = s.service_id
        LEFT JOIN appointment_recipients ar ON a.appointment_id = ar.appointment_id
        JOIN contractors c ON ac.contractor_id = c.contractor_id
        WHERE a.status IN ('complete', 'cancelled - chargeable')
          AND ar.status <> 'missed'
          AND ar.paying_client_id IS NOT NULL
          AND c.status = 'approved'
          ${serviceLabelFilterSQL}
          ${dateWhereClause}
        GROUP BY ac.contractor_id
        HAVING COUNT(DISTINCT a.appointment_id) >= $${minLessonsParam}
      ),
      tvg_ranges AS (
        SELECT
          CASE
            WHEN COALESCE(tr.total_revenue, 0) = 0 THEN '0'
            WHEN COALESCE(tr.total_revenue, 0) < 5000 THEN '0-5K'
            WHEN COALESCE(tr.total_revenue, 0) < 10000 THEN '5K-10K'
            WHEN COALESCE(tr.total_revenue, 0) < 25000 THEN '10K-25K'
            WHEN COALESCE(tr.total_revenue, 0) < 50000 THEN '25K-50K'
            WHEN COALESCE(tr.total_revenue, 0) < 100000 THEN '50K-100K'
            WHEN COALESCE(tr.total_revenue, 0) < 250000 THEN '100K-250K'
            ELSE '250K+'
          END AS tvg_range,
          COUNT(*) FILTER (WHERE COALESCE(tr.total_revenue, 0) > 0) AS tutor_count
        FROM tutor_revenue tr
        GROUP BY 
          CASE
            WHEN COALESCE(tr.total_revenue, 0) = 0 THEN '0'
            WHEN COALESCE(tr.total_revenue, 0) < 5000 THEN '0-5K'
            WHEN COALESCE(tr.total_revenue, 0) < 10000 THEN '5K-10K'
            WHEN COALESCE(tr.total_revenue, 0) < 25000 THEN '10K-25K'
            WHEN COALESCE(tr.total_revenue, 0) < 50000 THEN '25K-50K'
            WHEN COALESCE(tr.total_revenue, 0) < 100000 THEN '50K-100K'
            WHEN COALESCE(tr.total_revenue, 0) < 250000 THEN '100K-250K'
            ELSE '250K+'
          END
      )
      SELECT tvg_range AS range, tutor_count AS count
      FROM tvg_ranges
      ORDER BY 
        CASE tvg_range
          WHEN '0' THEN 1
          WHEN '0-5K' THEN 2
          WHEN '5K-10K' THEN 3
          WHEN '10K-25K' THEN 4
          WHEN '25K-50K' THEN 5
          WHEN '50K-100K' THEN 6
          WHEN '100K-250K' THEN 7
          WHEN '250K+' THEN 8
        END
    `;

    const { rows: distribution } = await executeQueryWithRetry(
      () => pool.query(distributionQuery, queryParams),
      3,
      1000
    );

    // Get cohort analysis (tutors grouped by first lesson month)
    const cohortQuery = `
      WITH tutor_first_lesson AS (
        SELECT
          ac.contractor_id,
          DATE_TRUNC('month', MIN(a.start)) AS first_lesson_month
        FROM appointment_contractors ac
        JOIN appointments a ON ac.appointment_id = a.appointment_id
        LEFT JOIN services s ON a.service_id = s.service_id
        JOIN contractors c ON ac.contractor_id = c.contractor_id
        WHERE a.status IN ('complete', 'cancelled - chargeable')
          AND c.status = 'approved'
          ${serviceLabelFilterSQL}
        GROUP BY ac.contractor_id
        HAVING COUNT(DISTINCT a.appointment_id) >= $${minLessonsParam}
      ),
      tutor_revenue AS (
        SELECT
          ac.contractor_id,
          SUM(CASE WHEN ar.status <> 'missed' AND a.status IN ('complete', 'cancelled - chargeable') 
            THEN ar.charge_rate * a.units ELSE 0 END) AS total_revenue
        FROM appointment_contractors ac
        JOIN appointments a ON ac.appointment_id = a.appointment_id
        LEFT JOIN services s ON a.service_id = s.service_id
        LEFT JOIN appointment_recipients ar ON a.appointment_id = ar.appointment_id
        WHERE a.status IN ('complete', 'cancelled - chargeable')
          AND ar.status <> 'missed'
          AND ar.paying_client_id IS NOT NULL
          ${serviceLabelFilterSQL}
          ${dateWhereClause}
        GROUP BY ac.contractor_id
      )
      SELECT
        tfl.first_lesson_month,
        COUNT(DISTINCT tfl.contractor_id) AS cohort_size,
        COALESCE(AVG(tr.total_revenue), 0) AS avg_tvg,
        COALESCE(SUM(tr.total_revenue), 0) AS total_tvg
      FROM tutor_first_lesson tfl
      LEFT JOIN tutor_revenue tr ON tfl.contractor_id = tr.contractor_id
      WHERE 1=1
        ${dateWhereClause}
      GROUP BY tfl.first_lesson_month
      ORDER BY tfl.first_lesson_month DESC
      LIMIT 24
    `;

    const { rows: cohorts } = await executeQueryWithRetry(
      () => pool.query(cohortQuery, queryParams),
      3,
      1000
    );

    // Get individual tutor TVG values for detailed distribution analysis
    const individualTVGQuery = `
      WITH tutor_revenue AS (
        SELECT
          ac.contractor_id,
          SUM(CASE WHEN ar.status <> 'missed' AND a.status IN ('complete', 'cancelled - chargeable') 
            THEN ar.charge_rate * a.units ELSE 0 END) AS total_revenue
        FROM appointment_contractors ac
        JOIN appointments a ON ac.appointment_id = a.appointment_id
        LEFT JOIN services s ON a.service_id = s.service_id
        LEFT JOIN appointment_recipients ar ON a.appointment_id = ar.appointment_id
        JOIN contractors c ON ac.contractor_id = c.contractor_id
        WHERE a.status IN ('complete', 'cancelled - chargeable')
          AND ar.status <> 'missed'
          AND ar.paying_client_id IS NOT NULL
          AND c.status = 'approved'
          ${serviceLabelFilterSQL}
          ${dateWhereClause}
        GROUP BY ac.contractor_id
        HAVING COUNT(DISTINCT a.appointment_id) >= $${minLessonsParam}
      )
      SELECT
        COALESCE(tr.total_revenue, 0) AS tvg_value
      FROM tutor_revenue tr
      WHERE COALESCE(tr.total_revenue, 0) > 0
      ORDER BY tvg_value ASC
    `;

    const { rows: individualTVGs } = await executeQueryWithRetry(
      () => pool.query(individualTVGQuery, queryParams),
      3,
      1000
    );

    const responseData = {
      metrics: metrics[0] || {},
      topTutors: topTutors.map(t => ({
        ...t,
        tvg_value: parseFloat(t.tvg_value || 0),
        total_lessons: parseInt(t.total_lessons || 0),
        unique_clients: parseInt(t.unique_clients || 0)
      })),
      distribution: distribution.map(d => ({
        range: d.range,
        count: parseInt(d.count || 0)
      })),
      cohorts: cohorts.map(c => ({
        first_lesson_month: c.first_lesson_month,
        cohort_size: parseInt(c.cohort_size || 0),
        avg_tvg: parseFloat(c.avg_tvg || 0),
        total_tvg: parseFloat(c.total_tvg || 0)
      })),
      individualTVGs: individualTVGs.map(row => parseFloat(row.tvg_value) || 0)
    };

    res.json(responseData);
  } catch (error) {
    logger.error({ err: error }, 'Error fetching tutor analytics:');
    res.status(500).json({ error: 'Failed to fetch tutor analytics', details: error.message });
  }
}));

/**
 * GET /api/entity-analytics/students
 * Student analytics endpoint
 * Returns engagement metrics, lesson completion rates, and performance data
 */
router.get('/students', auth, asyncHandler(async (req, res) => {
  try {
    const pool = getPool(req);
    
    // Get aggregate metrics for students
    const metricsQuery = `
      WITH student_lessons AS (
        SELECT
          ar.recipient_id,
          COUNT(DISTINCT a.appointment_id) AS total_lessons,
          COUNT(DISTINCT CASE WHEN a.status = 'complete' THEN a.appointment_id END) AS completed_lessons,
          COUNT(DISTINCT CASE WHEN ar.status = 'missed' THEN a.appointment_id END) AS missed_lessons,
          SUM(CASE WHEN a.status IN ('complete', 'cancelled - chargeable') THEN a.units ELSE 0 END) AS total_hours,
          MIN(a.start) AS first_lesson_date,
          MAX(a.start) AS last_lesson_date,
          COUNT(DISTINCT ar.paying_client_id) AS unique_clients,
          COUNT(DISTINCT ac.contractor_id) AS unique_tutors
        FROM appointment_recipients ar
        JOIN appointments a ON ar.appointment_id = a.appointment_id
        LEFT JOIN appointment_contractors ac ON a.appointment_id = ac.appointment_id
        WHERE a.status IN ('complete', 'cancelled - chargeable', 'cancelled')
        GROUP BY ar.recipient_id
      )
      SELECT
        COUNT(DISTINCT sl.recipient_id) AS total_students,
        COALESCE(SUM(sl.total_lessons), 0) AS total_lessons_completed,
        COALESCE(AVG(sl.total_lessons), 0) AS avg_lessons_per_student,
        COALESCE(SUM(sl.completed_lessons), 0) AS total_completed_lessons,
        COALESCE(AVG(sl.completed_lessons::DECIMAL / NULLIF(sl.total_lessons, 0)), 0) * 100 AS avg_completion_rate,
        COALESCE(SUM(sl.missed_lessons), 0) AS total_missed_lessons,
        COALESCE(SUM(sl.total_hours), 0) AS total_hours,
        COALESCE(AVG(sl.total_hours), 0) AS avg_hours_per_student,
        COALESCE(SUM(sl.unique_clients), 0) AS total_clients_served,
        COALESCE(SUM(sl.unique_tutors), 0) AS total_tutors_worked_with
      FROM student_lessons sl
    `;

    const { rows: metrics } = await executeQueryWithRetry(
      () => pool.query(metricsQuery),
      3,
      1000
    );

    res.json({
      metrics: metrics[0] || {},
      message: 'Student analytics endpoint - data structure will be expanded as more student data becomes available'
    });
  } catch (error) {
    logger.error({ err: error }, 'Error fetching student analytics:');
    res.status(500).json({ error: 'Failed to fetch student analytics', details: error.message });
  }
}));

/**
 * GET /api/entity-analytics/affiliates
 * Affiliate analytics endpoint
 * Returns referral metrics, conversion rates, and commission data
 */
router.get('/affiliates', auth, asyncHandler(async (req, res) => {
  try {
    const pool = getPool(req);
    
    // Get aggregate metrics for affiliates
    const metricsQuery = `
      SELECT
        COUNT(DISTINCT affiliate_id) AS total_affiliates,
        COUNT(*) AS total_affiliate_records
      FROM affiliates
    `;

    const { rows: metrics } = await executeQueryWithRetry(
      () => pool.query(metricsQuery),
      3,
      1000
    );

    res.json({
      metrics: metrics[0] || {},
      message: 'Affiliate analytics endpoint - data structure will be expanded as more affiliate data becomes available'
    });
  } catch (error) {
    logger.error({ err: error }, 'Error fetching affiliate analytics:');
    res.status(500).json({ error: 'Failed to fetch affiliate analytics', details: error.message });
  }
}));

module.exports = router;

