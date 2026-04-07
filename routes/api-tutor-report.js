const express = require('express');
const router = express.Router();
const { pool, auth } = global;
const cache = require('../utils/cache');
const { asyncHandler } = require('../middleware/error-handler');
const { logger } = require('../utils/logger');

/**
 * Optimized endpoint to fetch all data needed for a tutor retention report in a single request
 * This reduces the number of API calls from ~5+ to just 1
 */
router.post('/', auth, asyncHandler(async (req, res) => {
  try {
    const {
      tutorId,
      startDate,
      endDate,
      previousStartDate,
      previousEndDate
    } = req.body;

    if (!tutorId || !startDate || !endDate) {
      return res.status(400).json({
        error: 'Missing required fields: tutorId, startDate, endDate'
      });
    }

    // Build cache key with all relevant params
    const cacheKey = `tutor-report:${tutorId}:${startDate}:${endDate}:${previousStartDate || 'none'}:${previousEndDate || 'none'}`;

    // Try to get from cache or fetch fresh data
    const cachedData = await cache.getOrSet(cacheKey, async () => {
      // Fetch all data in parallel using Promise.all
      const [
        tutorOverviewResult,
        groupSessionsResult,
        reviewsResult
      ] = await Promise.all([
      // 1. Get tutor overview data (includes lost_clients_details)
      pool.query(`
        WITH previous_period_clients AS (
          SELECT DISTINCT 
            CAST(ar.paying_client_id AS VARCHAR) AS paying_client_id, 
            ac.contractor_id, 
            CONCAT(c.first_name, ' ', c.last_name) AS client_name
          FROM appointments a
          LEFT JOIN appointment_contractors ac ON a.appointment_id = ac.appointment_id
          LEFT JOIN appointment_recipients ar ON a.appointment_id = ar.appointment_id
          LEFT JOIN clients c ON CAST(ar.paying_client_id AS VARCHAR) = c.client_id
          LEFT JOIN services s ON a.service_id = s.service_id
          WHERE a.start BETWEEN $3 AND $4
            AND a.status IN ('complete', 'cancelled', 'cancelled-chargeable')
        ),
        current_period_clients AS (
          SELECT DISTINCT
            CAST(ar.paying_client_id AS VARCHAR) AS paying_client_id,
            ac.contractor_id
          FROM appointments a
          LEFT JOIN appointment_contractors ac ON a.appointment_id = ac.appointment_id
          LEFT JOIN appointment_recipients ar ON a.appointment_id = ar.appointment_id
          WHERE a.start >= $1
            AND a.start < ($2::date + interval '1 day')
            AND a.status IN ('complete', 'cancelled', 'cancelled-chargeable')
        ),
        lost_clients_details AS (
          SELECT 
            ppc.contractor_id,
            ppc.paying_client_id,
            ppc.client_name,
            (SELECT MAX(a.start) 
             FROM appointments a
             LEFT JOIN appointment_recipients ar ON a.appointment_id = ar.appointment_id
             WHERE CAST(ar.paying_client_id AS VARCHAR) = ppc.paying_client_id
               AND a.status IN ('complete', 'cancelled', 'cancelled-chargeable')
            ) AS last_lesson_date,
            (SELECT COUNT(a.appointment_id)
             FROM appointments a
             LEFT JOIN appointment_recipients ar ON a.appointment_id = ar.appointment_id
             WHERE CAST(ar.paying_client_id AS VARCHAR) = ppc.paying_client_id
               AND a.status IN ('complete', 'cancelled-chargeable')
            ) AS total_lesson_count,
            a.service_id
          FROM previous_period_clients ppc
          LEFT JOIN current_period_clients cpc 
            ON ppc.paying_client_id = cpc.paying_client_id
            AND ppc.contractor_id = cpc.contractor_id
          LEFT JOIN appointments a 
            ON a.appointment_id = (
              SELECT a_inner.appointment_id
              FROM appointments a_inner
              JOIN appointment_recipients ar_inner 
                ON a_inner.appointment_id = ar_inner.appointment_id
              WHERE CAST(ar_inner.paying_client_id AS VARCHAR) = ppc.paying_client_id
                AND a_inner.status IN ('complete','cancelled','cancelled-chargeable')
              ORDER BY a_inner.start DESC
              LIMIT 1
            )
          WHERE cpc.paying_client_id IS NULL
            AND ppc.contractor_id = $5
            AND NOT EXISTS (
              SELECT 1
              FROM appointments a
              LEFT JOIN appointment_recipients ar ON a.appointment_id = ar.appointment_id
              WHERE CAST(ar.paying_client_id AS VARCHAR) = ppc.paying_client_id
                AND a.start >= $1 AND a.start < ($2::date + interval '1 day')
                AND a.status IN ('complete', 'cancelled', 'cancelled-chargeable')
            )
        ),
        filtered_lost_clients AS (
          SELECT 
            lcd.*,
            s.labels
          FROM lost_clients_details lcd
          LEFT JOIN services s ON lcd.service_id = s.service_id
          WHERE s.labels::text LIKE '%"Home %' OR s.labels @> '"Online"'::jsonb
        ),
        distinct_lessons AS (
          SELECT DISTINCT ON (a.appointment_id, ac.contractor_id)
            ac.contractor_id,
            a.appointment_id,
            ROUND(
              CASE
                WHEN (s.labels::text LIKE '%"School%' OR s.labels::text LIKE '%"Club %')
                     AND (EXTRACT(EPOCH FROM (a.finish - a.start)) / 3600) < 1
                THEN 1.0
                ELSE EXTRACT(EPOCH FROM (a.finish - a.start)) / 3600
              END,
              2
            ) AS duration_hours
          FROM appointments a
          JOIN appointment_contractors ac ON a.appointment_id = ac.appointment_id
          LEFT JOIN services s ON a.service_id = s.service_id
          WHERE a.start >= $1
            AND a.start < ($2::date + interval '1 day')
            AND a.status = 'complete'
            AND ac.contractor_id = $5
            AND (
              NOT (s.labels::TEXT ILIKE '%support%' OR s.labels::TEXT ILIKE '%non%')
              OR s.service_id IN (1313370, 1261386, 1261391)  -- Employee/owner lessons count toward consistency
            )
          ORDER BY a.appointment_id, ac.contractor_id, a.start
        ),
        aggregated_lessons AS (
          SELECT 
            contractor_id,
            COUNT(*) AS total_lesson_count,
            SUM(duration_hours) AS total_lesson_hours
          FROM distinct_lessons
          GROUP BY contractor_id
        )
        SELECT 
          ac.contractor_id AS tutor_id,
          MAX(ac.contractor_name) AS tutor_name, 
          COALESCE(MAX(c.status), MAX(ac.status)) AS tutor_status,
          ROUND(COALESCE(MAX(agg.total_lesson_hours), 0), 2) AS tutor_total_hours_period,
          COALESCE(MAX(agg.total_lesson_count), 0) AS total_complete_appointments_period,
          ARRAY(
            SELECT json_build_object(
              'client_name', l.client_name,
              'last_lesson_date', l.last_lesson_date,
              'total_lesson_count', l.total_lesson_count
            )
            FROM filtered_lost_clients l
            WHERE l.contractor_id = ac.contractor_id
          ) AS lost_clients_details
        FROM appointments a
        LEFT JOIN appointment_contractors ac ON a.appointment_id = ac.appointment_id
        LEFT JOIN contractors c ON ac.contractor_id = c.contractor_id
        LEFT JOIN aggregated_lessons agg ON ac.contractor_id = agg.contractor_id
        WHERE ac.contractor_id = $5
          AND a.status IN ('complete', 'cancelled', 'cancelled-chargeable')
        GROUP BY ac.contractor_id;
      `, [startDate, endDate, previousStartDate, previousEndDate, tutorId]),

      // 2. Get group sessions
      pool.query(`
        WITH GroupedAppointments AS (
          SELECT
            ac.contractor_id AS tutor_id,
            ar.appointment_id,
            a.status AS appointment_status,
            COUNT(ar.recipient_id) AS total_students,
            COUNT(
              CASE
                WHEN ar.status IN ('attended','missed-chargeable')
                  AND ar.charge_rate NOT IN (80.00, 112.66, 119.00)
                  AND (s.labels::text LIKE '%"Home %' OR s.labels @> '"Online"'::jsonb)
                  AND a.status = 'complete'
                THEN 1
              END
            ) AS eligible_students
          FROM appointment_recipients ar
          JOIN appointment_contractors ac ON ar.appointment_id = ac.appointment_id
          JOIN appointments a ON ar.appointment_id = a.appointment_id
          JOIN services s ON a.service_id = s.service_id
          WHERE ac.contractor_id = $1
            AND a.start >= $2 AND a.start < ($3::date + interval '1 day')
          GROUP BY ac.contractor_id, ar.appointment_id, a.status
        )
        SELECT
          tutor_id,
          appointment_id,
          appointment_status,
          total_students,
          eligible_students,
          CASE
            WHEN eligible_students >= 2 THEN eligible_students
            ELSE 0
          END AS counted_students
        FROM GroupedAppointments;
      `, [tutorId, startDate, endDate]),

      // 3. Get reviews for the period
      // date_created is timestamp without time zone, so cast ISO strings properly
      pool.query(`
        SELECT 
          r.review_id,
          r.contractor_id,
          r.client_name,
          r.extra_attrs_value,
          r.star_rating_value,
          r.date_created
        FROM reviews r
        WHERE r.contractor_id = $1
          AND r.date_created >= $2::timestamp
          AND r.date_created <= $3::timestamp
        ORDER BY r.date_created DESC;
      `, [tutorId, startDate, endDate])
      ]);

      const tutorData = tutorOverviewResult.rows[0] || {};
      const groupSessions = groupSessionsResult.rows || [];
      const reviews = reviewsResult.rows || [];

      // Debug logging
      logger.info({ tutorId, startDate, endDate, reviewsCount: reviews.length, reviewsSample: reviews.slice(0, 2) }, '📊 Tutor Report API Debug');

      // Parse lost_clients_details if it's a PostgreSQL array string
      let lostClients = [];
      if (tutorData.lost_clients_details) {
        if (Array.isArray(tutorData.lost_clients_details)) {
          lostClients = tutorData.lost_clients_details;
        } else if (typeof tutorData.lost_clients_details === 'string') {
          try {
            lostClients = JSON.parse(tutorData.lost_clients_details);
          } catch (e) {
            logger.warn({ err: e }, 'Failed to parse lost_clients_details');
          }
        }
      }

      // Return structured data for caching
      return {
        tutor: {
          tutor_id: tutorData.tutor_id,
          tutor_name: tutorData.tutor_name,
          tutor_status: tutorData.tutor_status,
          tutor_total_hours_period: tutorData.tutor_total_hours_period || 0,
          total_complete_appointments_period: tutorData.total_complete_appointments_period || 0,
          lost_clients_details: lostClients
        },
        groupSessions: groupSessions,
        reviews: reviews
      };
    }, 300); // TTL: 5 minutes

    res.json(cachedData);

  } catch (error) {
    logger.error({ err: error }, '❌ Error fetching tutor report data');
    res.status(500).json({ 
      error: 'Failed to fetch tutor report data',
      details: error.message 
    });
  }
}));

module.exports = router;

