const express = require('express');
const { asyncHandler } = require('../middleware/error-handler');
const { logger } = require('../utils/logger');
const router = express.Router();

// Get tutor hour buckets with drill-down capability
router.get('/tutor-hour-buckets', asyncHandler(async (req, res) => {
  // Use location-specific pool from middleware
  const pool = req.locationPool || global.pool;
  const client = await pool.connect();
  try {
    const { startDate, endDate, timeView = 'Monthly' } = req.query;
    
    if (!startDate || !endDate) {
      return res.status(400).json({ error: 'startDate and endDate are required' });
    }

    const start = new Date(startDate);
    const end = new Date(endDate);

    // Calculate tutor hours for the period, excluding non-teaching work
    // Use the same calculation logic as tutor-overview API for consistency
    const tutorHoursQuery = `
      WITH distinct_lessons AS (
        SELECT DISTINCT ON (a.appointment_id, ac.contractor_id)
          ac.contractor_id,
          ac.contractor_name,
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
          AND a.start < ($2::date + interval '1 day')
          AND a.status IN ('complete', 'cancelled-chargeable')
          AND (
            NOT (s.labels::TEXT ILIKE '%support%' OR s.labels::TEXT ILIKE '%non%')
            OR s.service_id IN (1313370, 1261386, 1261391)  -- Employee/owner lessons count toward consistency
          )
        ORDER BY a.appointment_id, ac.contractor_id, a.start
      ),
      tutor_hours AS (
        SELECT 
          contractor_id,
          MAX(contractor_name) AS contractor_name,
          SUM(duration_hours) AS total_hours
        FROM distinct_lessons
        GROUP BY contractor_id
      )
      SELECT * FROM tutor_hours
      ORDER BY total_hours DESC
    `;

    const { rows: tutorHours } = await client.query(tutorHoursQuery, [start, end]);

    // Define hour ranges based on time view
    const ranges = timeView === 'Weekly' 
      ? [
          { name: 'Tutors 10 hours', min: 10, max: 14.99, label: '10-14.99 hours' },
          { name: 'Tutors 15 hours', min: 15, max: 19.99, label: '15-19.99 hours' },
          { name: 'Tutors 20 hours', min: 20, max: null, label: '20+ hours' }
        ]
      : [
          { name: 'Tutors 40 hours', min: 40, max: 59.99, label: '40-59.99 hours - Consistency Bonus $200' },
          { name: 'Tutors 60 hours', min: 60, max: 79.99, label: '60-79.99 hours - Consistency Bonus $400' },
          { name: 'Tutors 80 hours', min: 80, max: null, label: '80+ hours - Consistency Bonus $600' }
        ];

    // Get consistency bonus status for all tutors in the period
    // Format dates for bonus lookup (YYYY-MM-DD)
    const periodStartStr = start.toISOString().split('T')[0];
    const periodEndStr = end.toISOString().split('T')[0];
    
    // Try to fetch bonus statuses, but handle gracefully if table doesn't exist
    let bonusStatuses = [];
    try {
      const bonusStatusQuery = `
        SELECT 
          contractor_id,
          bonus_amount,
          applied_at,
          tutorcruncher_charge_id
        FROM consistency_bonuses
        WHERE period_start = $1 
          AND period_end = $2
      `;
      
      const result = await client.query(bonusStatusQuery, [periodStartStr, periodEndStr]);
      bonusStatuses = result.rows;
    } catch (bonusError) {
      // If table doesn't exist or query fails, just continue without bonus status
      // This allows the API to work even if consistency_bonuses table hasn't been created yet
      logger.warn({ data: bonusError.message }, 'Could not fetch consistency bonus status (table may not exist):');
      bonusStatuses = [];
    }
    
    // Create a map of contractor_id -> bonus status for quick lookup
    const bonusMap = new Map();
    bonusStatuses.forEach(bonus => {
      bonusMap.set(bonus.contractor_id.toString(), {
        applied: true,
        bonusAmount: parseFloat(bonus.bonus_amount),
        appliedAt: bonus.applied_at,
        tutorcruncherChargeId: bonus.tutorcruncher_charge_id
      });
    });

    // Calculate bucket counts and tutor details
    const buckets = ranges.map(range => {
      const tutorsInRange = tutorHours.filter(tutor => {
        if (range.max === null) {
          return tutor.total_hours >= range.min;
        }
        return tutor.total_hours >= range.min && tutor.total_hours <= range.max;
      });

      return {
        name: range.label,
        value: tutorsInRange.length,
        tutors: tutorsInRange.map(tutor => {
          const bonusInfo = bonusMap.get(tutor.contractor_id.toString());
          return {
            id: tutor.contractor_id,
            name: tutor.contractor_name,
            hours: parseFloat(parseFloat(tutor.total_hours).toFixed(2)),
            bonusStatus: bonusInfo || { applied: false }
          };
        })
      };
    });

    res.json({
      buckets,
      timeView,
      totalTutors: tutorHours.length,
      dateRange: { start, end }
    });

  } catch (error) {
    logger.error({ err: error }, 'Error fetching tutor hour buckets:');
    logger.error({ data: error.stack }, 'Error stack:');
    logger.error({ data: !!global.pool }, 'Pool available:');
    res.status(500).json({ error: 'Internal server error', details: error.message });
  } finally {
    client.release();
  }
}));

// Get tutor lessons for drill-down (POST version for frontend compatibility)
router.post('/tutor-lessons', asyncHandler(async (req, res) => {
  // Use location-specific pool from middleware
  const pool = req.locationPool || global.pool;
  const client = await pool.connect();
  try {
    const { tutorId, startDate, endDate } = req.body;
    
    if (!tutorId || !startDate || !endDate) {
      return res.status(400).json({ error: 'tutorId, startDate and endDate are required' });
    }

    const start = new Date(startDate);
    const end = new Date(endDate);

    const lessonsQuery = `
      SELECT 
        a.appointment_id,
        a.start,
        a.finish,
        a.units,
        s.name AS service_name,
        s.labels,
        ARRAY_AGG(
          json_build_object(
            'student_name', ar.recipient_name,
            'client_name', ar.paying_client_name,
            'status', ar.status
          )
        ) AS students,
        ROUND(
          CASE 
            WHEN (s.labels::TEXT ILIKE '%school%' OR s.labels::TEXT ILIKE '%club%')
                 AND (EXTRACT(EPOCH FROM (a.finish - a.start)) / 3600) < 1
            THEN 1.0
            ELSE EXTRACT(EPOCH FROM (a.finish - a.start)) / 3600
          END,
          2
        ) AS duration_hours,
        EXTRACT(EPOCH FROM (a.finish - a.start)) / 3600 AS raw_duration_hours
      FROM appointments a
      JOIN appointment_contractors ac ON a.appointment_id = ac.appointment_id
      LEFT JOIN services s ON a.service_id = s.service_id
      LEFT JOIN appointment_recipients ar ON a.appointment_id = ar.appointment_id 
        AND ar.status <> 'missed'
      WHERE a.status IN ('complete', 'cancelled-chargeable')
        AND a.start >= $1 AND a.start < ($2::date + interval '1 day')
        AND ac.contractor_id = $3
        AND (
          NOT (s.labels::TEXT ILIKE '%support%' OR s.labels::TEXT ILIKE '%non%')
          OR s.service_id IN (1313370, 1261386, 1261391)  -- Employee/owner lessons count toward consistency
        )
      GROUP BY a.appointment_id, a.start, a.finish, a.units, s.name, s.labels
      ORDER BY a.start
    `;

    const { rows } = await client.query(lessonsQuery, [start, end, tutorId]);

    const lessons = rows.map(row => ({
      id: row.appointment_id, // Add id field for MUI DataGrid
      lesson_id: row.appointment_id, // Add lesson_id for frontend compatibility
      appointmentId: row.appointment_id,
      start: row.start,
      finish: row.finish,
      serviceName: row.service_name,
      durationHours: parseFloat(row.duration_hours || 0),
      rawDurationHours: parseFloat(row.raw_duration_hours || 0),
      units: parseFloat(row.units || 0),
      students: row.students,
      labels: row.labels
    }));

    res.json({ lessons });

  } catch (error) {
    logger.error({ err: error }, 'Error fetching tutor lessons:');
    res.status(500).json({ error: 'Internal server error' });
  } finally {
    client.release();
  }
}));

// Get tutor lessons for drill-down (GET version)
router.get('/tutor-lessons', asyncHandler(async (req, res) => {
  // Use location-specific pool from middleware
  const pool = req.locationPool || global.pool;
  const client = await pool.connect();
  try {
    const { tutorId, startDate, endDate } = req.query;

    if (!tutorId || !startDate || !endDate) {
      return res.status(400).json({ error: 'tutorId, startDate and endDate are required' });
    }

    const start = new Date(startDate);
    const end = new Date(endDate);

    const lessonsQuery = `
      SELECT
        a.appointment_id,
        a.start,
        a.finish,
        a.units,
        s.name AS service_name,
        s.labels,
        ARRAY_AGG(
          json_build_object(
            'student_name', ar.recipient_name,
            'client_name', ar.paying_client_name,
            'status', ar.status
          )
        ) AS students,
        ROUND(
          CASE
            WHEN (s.labels::TEXT ILIKE '%school%' OR s.labels::TEXT ILIKE '%club%')
                 AND (EXTRACT(EPOCH FROM (a.finish - a.start)) / 3600) < 1
            THEN 1.0
            ELSE EXTRACT(EPOCH FROM (a.finish - a.start)) / 3600
          END,
          2
        ) AS duration_hours,
        EXTRACT(EPOCH FROM (a.finish - a.start)) / 3600 AS raw_duration_hours
      FROM appointments a
      JOIN appointment_contractors ac ON a.appointment_id = ac.appointment_id
      LEFT JOIN services s ON a.service_id = s.service_id
      LEFT JOIN appointment_recipients ar ON a.appointment_id = ar.appointment_id
        AND ar.status <> 'missed'
      WHERE a.status IN ('complete', 'cancelled-chargeable')
        AND a.start >= $1 AND a.start < ($2::date + interval '1 day')
        AND ac.contractor_id = $3
        AND (
          NOT (s.labels::TEXT ILIKE '%support%' OR s.labels::TEXT ILIKE '%non%')
          OR s.service_id IN (1313370, 1261386, 1261391)  -- Employee/owner lessons count toward consistency
        )
      GROUP BY a.appointment_id, a.start, a.finish, a.units, s.name, s.labels
      ORDER BY a.start
    `;

    const { rows } = await client.query(lessonsQuery, [start, end, tutorId]);

    const lessons = rows.map(row => ({
      id: row.appointment_id, // Add id field for MUI DataGrid
      lesson_id: row.appointment_id, // Add lesson_id for frontend compatibility
      appointmentId: row.appointment_id,
      start: row.start,
      finish: row.finish,
      serviceName: row.service_name,
      durationHours: parseFloat(row.duration_hours || 0),
      rawDurationHours: parseFloat(row.raw_duration_hours || 0),
      units: parseFloat(row.units || 0),
      students: row.students,
      labels: row.labels
    }));

    res.json({ lessons });

  } catch (error) {
    logger.error({ err: error }, 'Error fetching tutor lessons:');
    res.status(500).json({ error: 'Internal server error' });
  } finally {
    client.release();
  }
}));

module.exports = router;
