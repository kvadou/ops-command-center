const express = require('express');
const router = express.Router();
const { buildDeps } = require('../config/deps');
const { parseUTC, toNY } = require('../utils/date');
const { asyncHandler } = require('../middleware/error-handler');
const { logger } = require('../utils/logger');

// Get the pool and other dependencies
const { pool } = buildDeps();

// POST /api/tutor-overview - Get tutor overview data
router.post('/', asyncHandler(async (req, res) => {
  const {
    startDate,
    endDate,
    previousStartDate,
    previousEndDate
  } = req.body;
  
  try {
    logger.info('### Fetching tutor overview data...');
    logger.info({ data: req.body }, 'Request body:');
    
    // Validate required date parameters
    if (!startDate || !endDate || !previousStartDate || !previousEndDate) {
      return res.status(400).json({ 
        error: 'Missing required date parameters',
        received: { startDate: !!startDate, endDate: !!endDate, previousStartDate: !!previousStartDate, previousEndDate: !!previousEndDate }
      });
    }
    
    // Validate and parse dates
    let currentStart, currentEnd, prevStart, prevEnd;
    try {
      currentStart = toNY(parseUTC(startDate)).startOf('day').toISO();
      currentEnd = toNY(parseUTC(endDate)).endOf('day').toISO();
      prevStart = toNY(parseUTC(previousStartDate)).startOf('day').toISO();
      prevEnd = toNY(parseUTC(previousEndDate)).endOf('day').toISO();
    } catch (dateError) {
      logger.error({ data: dateError }, 'Date parsing error:');
      return res.status(400).json({ 
        error: 'Invalid date format',
        details: dateError.message,
        receivedDates: { startDate, endDate, previousStartDate, previousEndDate }
      });
    }
    
    logger.info(`Current Period: ${currentStart} to ${currentEnd}`);
    logger.info(`Previous Period: ${prevStart} to ${prevEnd}`);
    
    // Set a longer timeout for this complex query (60 seconds)
    const client = await pool.connect();
    try {
      // Set statement_timeout to 60 seconds (60000 milliseconds)
      await client.query('SET statement_timeout = 60000');
    } catch (timeoutError) {
      logger.warn({ data: timeoutError }, 'Could not set statement timeout:');
    }
    
    const query = `
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
          AND a.start <= $2
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
          AND NOT EXISTS (
            SELECT 1
            FROM appointments a
            LEFT JOIN appointment_recipients ar ON a.appointment_id = ar.appointment_id
            WHERE CAST(ar.paying_client_id AS VARCHAR) = ppc.paying_client_id
              AND a.start BETWEEN $1 AND $2
              AND a.status IN ('complete', 'cancelled', 'cancelled-chargeable')
          )
      ),
      filtered_lost_clients AS (
        SELECT 
          lcd.*,
          s.labels
        FROM lost_clients_details lcd
        LEFT JOIN services s ON lcd.service_id = s.service_id
        WHERE s.labels::TEXT ILIKE '%home%' OR s.labels::TEXT ILIKE '%online%'
      ),
      distinct_lessons AS (
        SELECT DISTINCT ON (a.appointment_id, ac.contractor_id)
          ac.contractor_id,
          a.appointment_id,
          ROUND(
            CASE 
              WHEN (s.labels::TEXT ILIKE '%school%' OR s.labels::TEXT ILIKE '%club%')
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
          AND a.start <= $2
          AND a.status IN ('complete', 'cancelled-chargeable')
          AND NOT (s.labels::TEXT ILIKE '%support%' OR s.labels::TEXT ILIKE '%non%')
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
        COALESCE(MAX(c.status), MAX(ac.status)) AS tutor_status,  -- Use contractors table status (authoritative), fallback to appointment_contractors
        ARRAY[]::TEXT[] AS labels, -- Temporarily disabled tutor_labels table
        ROUND(COALESCE(MAX(agg.total_lesson_hours), 0), 2) AS tutor_total_hours_period,
        (SELECT COUNT(*) FROM filtered_lost_clients l WHERE l.contractor_id = ac.contractor_id) AS lost_clients_period,
        ARRAY(
          SELECT json_build_object(
            'client_name', l.client_name,
            'last_lesson_date', l.last_lesson_date,
            'total_lesson_count', l.total_lesson_count
          )
          FROM filtered_lost_clients l
          WHERE l.contractor_id = ac.contractor_id
        ) AS lost_clients_details,
        COUNT(DISTINCT ar.paying_client_id) AS clients_worked_with,
        COUNT(
          DISTINCT CASE 
            WHEN a.start >= NOW() - INTERVAL '30 days' 
            THEN ar.paying_client_id 
            ELSE NULL 
          END
        ) AS clients_active_30_days,
        COALESCE(MAX(agg.total_lesson_count), 0) AS total_complete_appointments_period,
        0 AS total_complete_appointments_all_time,  -- Disabled for performance
        0 AS tutor_total_hours_all_time,  -- Disabled for performance
        COUNT(
          DISTINCT CASE 
            WHEN a.start BETWEEN $1 AND $2 
            THEN ar.paying_client_id 
            ELSE NULL 
          END
        ) AS clients_worked_with_period,
        COUNT(
          DISTINCT CASE 
            WHEN a.start BETWEEN $3 AND $4 
            THEN ar.paying_client_id 
            ELSE NULL 
          END
        ) AS clients_worked_with_previous_period,
        COUNT(
          DISTINCT CASE 
            WHEN a.start BETWEEN $1 AND $2 AND a.status = 'cancelled'
            THEN a.appointment_id 
            ELSE NULL 
          END
        ) AS total_cancelled_appointments_period,
        COUNT(
          DISTINCT CASE 
            WHEN a.start BETWEEN $1 AND $2 AND a.status = 'cancelled-chargeable'
            THEN a.appointment_id 
            ELSE NULL 
          END
        ) AS total_chargeable_cancelled_appointments_period,
        0 AS total_cancelled_appointments_all_time,  -- Disabled for performance
        0 AS total_chargeable_cancelled_appointments_all_time,  -- Disabled for performance
        (SELECT COUNT(DISTINCT cpc.paying_client_id)
         FROM current_period_clients cpc
         LEFT JOIN previous_period_clients ppc 
           ON cpc.paying_client_id = ppc.paying_client_id 
           AND cpc.contractor_id = ppc.contractor_id
         WHERE ppc.paying_client_id IS NULL 
           AND cpc.contractor_id = ac.contractor_id
        ) AS new_clients_period,
        (
          SELECT COUNT(DISTINCT cpc.paying_client_id)
          FROM current_period_clients cpc
          JOIN previous_period_clients ppc
            ON cpc.paying_client_id = ppc.paying_client_id 
            AND cpc.contractor_id = ppc.contractor_id
          WHERE cpc.contractor_id = ac.contractor_id
        ) AS retained_clients_period
      FROM appointments a
      LEFT JOIN appointment_contractors ac ON a.appointment_id = ac.appointment_id
      LEFT JOIN appointment_recipients ar ON a.appointment_id = ar.appointment_id
      LEFT JOIN contractors c ON ac.contractor_id = c.contractor_id  -- Join contractors table for authoritative status
      -- LEFT JOIN tutor_labels tl ON ac.contractor_id = tl.contractor_id
      LEFT JOIN aggregated_lessons agg ON ac.contractor_id = agg.contractor_id
      LEFT JOIN services s ON a.service_id = s.service_id
      WHERE a.status IN ('complete', 'cancelled', 'cancelled-chargeable')
        AND a.start >= NOW() - INTERVAL '2 years'  -- Performance: limit scan to recent appointments
      GROUP BY ac.contractor_id;
    `;
    
    let result;
    try {
      // Use the client connection with extended timeout
      result = await client.query(query, [currentStart, currentEnd, prevStart, prevEnd]);
      
      if (result.rows.length === 0) {
        logger.warn('No appointments found for the given date range.');
      }
    } catch (queryError) {
      logger.error({ data: queryError }, 'Query execution error:');
      if (queryError.message.includes('timeout') || queryError.code === 'ETIMEDOUT') {
        // Reset timeout and release client before returning
        try {
          await client.query('SET statement_timeout = DEFAULT');
        } catch (resetError) {
          logger.warn({ data: resetError }, 'Could not reset statement timeout:');
        }
        client.release();
        return res.status(504).json({ 
          error: 'Query timeout - The request took too long to process. Please try a shorter date range or contact support.',
          details: 'The query exceeded the 60 second timeout limit. This may occur with large date ranges.'
        });
      }
      throw queryError;
    } finally {
      // Reset timeout settings and release client
      try {
        await client.query('SET statement_timeout = DEFAULT');
      } catch (resetError) {
        logger.warn({ data: resetError }, 'Could not reset statement timeout:');
      }
      client.release();
    }
    
    const appointments = result.rows;
    logger.info(`📊 Query returned ${appointments.length} tutors`);
    
    // Log top 10 tutors by total_complete_appointments_period for debugging
    const topTutors = appointments
      .map(a => ({
        tutor_id: a.tutor_id,
        tutor_name: a.tutor_name,
        tutor_status: a.tutor_status,
        total_complete_appointments_period: a.total_complete_appointments_period,
        tutor_total_hours_period: a.tutor_total_hours_period
      }))
      .sort((a, b) => (b.total_complete_appointments_period || 0) - (a.total_complete_appointments_period || 0))
      .slice(0, 10);
    logger.info({ data: JSON.stringify(topTutors, null, 2) }, '📊 Top 10 tutors by total_complete_appointments_period:');
    
    const finalTutorOverview = appointments.map(appointment => {
      const allTimeRetentionRate = appointment.clients_worked_with > 0 ? 
        (appointment.clients_active_30_days / appointment.clients_worked_with * 100).toFixed(2) : '0.00';
      const periodRetentionRate = appointment.clients_worked_with_previous_period > 0 ? 
        (appointment.retained_clients_period / appointment.clients_worked_with_previous_period * 100).toFixed(2) : '0.00';
      
      return {
        tutor_id: appointment.tutor_id,
        tutor_name: appointment.tutor_name,
        tutor_status: appointment.tutor_status,
        labels: appointment.labels,
        tutor_total_hours_period: appointment.tutor_total_hours_period,
        lost_clients_period: appointment.lost_clients_period,
        lost_clients_details: appointment.lost_clients_details,
        clients_worked_with: appointment.clients_worked_with,
        clients_active_30_days: appointment.clients_active_30_days,
        total_complete_appointments_period: appointment.total_complete_appointments_period,
        total_complete_appointments_all_time: appointment.total_complete_appointments_all_time,
        tutor_total_hours_all_time: appointment.tutor_total_hours_all_time,
        clients_worked_with_period: appointment.clients_worked_with_period,
        clients_worked_with_previous_period: appointment.clients_worked_with_previous_period,
        total_cancelled_appointments_period: appointment.total_cancelled_appointments_period,
        total_chargeable_cancelled_appointments_period: appointment.total_chargeable_cancelled_appointments_period,
        total_cancelled_appointments_all_time: appointment.total_cancelled_appointments_all_time,
        total_chargeable_cancelled_appointments_all_time: appointment.total_chargeable_cancelled_appointments_all_time,
        new_clients_period: appointment.new_clients_period,
        retained_clients_period: appointment.retained_clients_period,
        all_time_retention_rate: allTimeRetentionRate,
        period_retention_rate: periodRetentionRate
      };
    });
    
    const averagePeriodRetentionRate = finalTutorOverview.length > 0 ? 
      (finalTutorOverview.reduce((sum, tutor) => sum + parseFloat(tutor.period_retention_rate), 0) / finalTutorOverview.length).toFixed(2) : '0.00';
    
    logger.info({ data: averagePeriodRetentionRate }, '📊 Average period retention rate (unweighted) =>');
    
    res.json({
      tutorOverview: finalTutorOverview,
      allTutorsAvgMonthlyRetention: averagePeriodRetentionRate
    });
  } catch (error) {
    logger.error({ data: {
      message: error.message,
      stack: error.stack,
      code: error.code,
      detail: error.detail,
      hint: error.hint,
      position: error.position,
      internalQuery: error.internalQuery,
      internalPosition: error.internalPosition,
      where: error.where
    } }, '❌ /tutor-overview failed:');
    res.status(500).json({ 
      error: error.message || 'Failed to fetch tutor overview data',
      details: error.detail || error.hint || 'Unknown error occurred'
    });
  }
}));

module.exports = router;
