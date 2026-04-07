const express = require('express');
const { asyncHandler } = require('../middleware/error-handler');
const { logger } = require('../utils/logger');
const router = express.Router();

// GET /api/lesson-hours
// Returns lesson hours and lesson count for tutors, clients, or students
// Query params: tab (tutors|clients|students), startDate, endDate, showAllBranches, branchId
router.get('/', asyncHandler(async (req, res) => {
  const pool = req.locationPool || global.pool;
  const client = await pool.connect();
  
  try {
    const { tab = 'tutors', startDate, endDate, showAllBranches = 'false', branchId } = req.query;
    
    if (!startDate || !endDate) {
      return res.status(400).json({ error: 'startDate and endDate are required' });
    }

    const start = new Date(startDate);
    const end = new Date(endDate);
    const showAll = showAllBranches === 'true';

    let query;
    let params = [start, end];

    // Base CTE for lesson hours calculation
    // This calculates hours per individual (if 2 people on same lesson, each gets full hours)
    const baseLessonHoursCTE = `
      WITH lesson_data AS (
        SELECT 
          a.appointment_id,
          a.start,
          a.finish,
          a.units,
          s.labels,
          CASE 
            WHEN (s.labels::TEXT ILIKE '%school%' OR s.labels::TEXT ILIKE '%club%')
                 AND (EXTRACT(EPOCH FROM (a.finish - a.start)) / 3600) < 1
            THEN 1.0
            ELSE EXTRACT(EPOCH FROM (a.finish - a.start)) / 3600
          END AS duration_hours
        FROM appointments a
        JOIN services s ON a.service_id = s.service_id
        WHERE a.status IN ('complete', 'cancelled-chargeable')
          AND a.start >= $1 AND a.start <= $2
          AND NOT (
            EXISTS (
              SELECT 1 
              FROM jsonb_array_elements_text(COALESCE(s.labels, '[]'::jsonb)) AS lbl
              WHERE lbl.value ILIKE '%non teaching%' 
                OR lbl.value ILIKE '%support%'
                OR lbl.value ILIKE '%admin%'
                OR lbl.value ILIKE '%meeting%'
            )
          )
      )
    `;

    if (tab === 'tutors') {
      // For tutors: group by contractor
      query = `
        ${baseLessonHoursCTE}
        SELECT 
          ac.contractor_id AS id,
          MAX(ac.contractor_name) AS name,
          SUM(ld.duration_hours) AS lesson_hours,
          COUNT(DISTINCT ld.appointment_id) AS lesson_count
        FROM lesson_data ld
        JOIN appointment_contractors ac ON ld.appointment_id = ac.appointment_id
        GROUP BY ac.contractor_id
        ORDER BY lesson_hours DESC
      `;
    } else if (tab === 'clients') {
      // For clients: group by paying client
      // Each recipient on a lesson counts as full hours for that client
      query = `
        ${baseLessonHoursCTE}
        SELECT 
          CAST(ar.paying_client_id AS VARCHAR) AS id,
          MAX(ar.paying_client_name) AS name,
          SUM(ld.duration_hours) AS lesson_hours,
          COUNT(DISTINCT ld.appointment_id) AS lesson_count
        FROM lesson_data ld
        JOIN appointment_recipients ar ON ld.appointment_id = ar.appointment_id
        WHERE ar.status <> 'missed'
          AND ar.paying_client_id IS NOT NULL
        GROUP BY CAST(ar.paying_client_id AS VARCHAR)
        ORDER BY lesson_hours DESC
      `;
    } else if (tab === 'students') {
      // For students: group by recipient
      // Each student on a lesson counts as full hours for that student
      query = `
        ${baseLessonHoursCTE}
        SELECT 
          CAST(ar.recipient_id AS VARCHAR) AS id,
          MAX(ar.recipient_name) AS name,
          SUM(ld.duration_hours) AS lesson_hours,
          COUNT(DISTINCT ld.appointment_id) AS lesson_count
        FROM lesson_data ld
        JOIN appointment_recipients ar ON ld.appointment_id = ar.appointment_id
        WHERE ar.status <> 'missed'
          AND ar.recipient_id IS NOT NULL
        GROUP BY CAST(ar.recipient_id AS VARCHAR)
        ORDER BY lesson_hours DESC
      `;
    } else {
      return res.status(400).json({ error: 'Invalid tab. Must be tutors, clients, or students' });
    }

    const { rows } = await client.query(query, params);

    // Calculate totals
    const totals = rows.reduce(
      (acc, row) => {
        acc.lesson_hours += parseFloat(row.lesson_hours || 0);
        acc.lesson_count += parseInt(row.lesson_count || 0);
        return acc;
      },
      { lesson_hours: 0, lesson_count: 0 }
    );

    // Format hours as hours:minutes (e.g., 48134:13)
    const formatHours = (hours) => {
      const totalMinutes = Math.round(hours * 60);
      const h = Math.floor(totalMinutes / 60);
      const m = totalMinutes % 60;
      return `${h}:${m.toString().padStart(2, '0')}`;
    };

    const formattedData = rows.map((row) => ({
      id: row.id,
      name: row.name || 'Unknown',
      lesson_hours: parseFloat(row.lesson_hours || 0),
      lesson_hours_formatted: formatHours(parseFloat(row.lesson_hours || 0)),
      lesson_count: parseInt(row.lesson_count || 0),
    }));

    const formattedTotals = {
      lesson_hours: totals.lesson_hours,
      lesson_hours_formatted: formatHours(totals.lesson_hours),
      lesson_count: totals.lesson_count,
    };

    res.json({
      data: formattedData,
      totals: formattedTotals,
      tab,
    });

  } catch (error) {
    logger.error({ err: error }, 'Error fetching lesson hours:');
    res.status(500).json({ error: 'Internal server error', details: error.message });
  } finally {
    client.release();
  }
}));

module.exports = router;


























