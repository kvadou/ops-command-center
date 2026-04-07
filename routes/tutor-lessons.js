const express = require('express');
const { asyncHandler } = require('../middleware/error-handler');
const router = express.Router();

// POST /tutor-lessons - Fetch tutor lessons for drill-down
router.post('/', asyncHandler(async (req, res) => {
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
        CASE 
          WHEN a.charge_type = 'hourly' THEN a.units
          WHEN a.charge_type = 'hourly-split' THEN a.units
          WHEN a.charge_type = 'one-off' THEN 1.0
          WHEN a.charge_type = 'one-off-split' THEN 1.0
          ELSE a.units
        END AS teaching_hours
      FROM appointments a
      JOIN appointment_contractors ac ON a.appointment_id = ac.appointment_id
      JOIN services s ON a.service_id = s.service_id
      LEFT JOIN appointment_recipients ar ON a.appointment_id = ar.appointment_id 
        AND ar.status <> 'missed'
      WHERE a.status IN ('complete', 'cancelled-chargeable')
        AND a.start BETWEEN $1 AND $2
        AND ac.contractor_id = $3
        AND NOT (
          EXISTS (
            SELECT 1 
            FROM jsonb_array_elements_text(s.labels) AS label(value)
            WHERE label.value ILIKE '%non teaching%' 
              OR label.value ILIKE '%support%'
              OR label.value ILIKE '%admin%'
              OR label.value ILIKE '%meeting%'
          )
        )
      GROUP BY a.appointment_id, a.start, a.finish, a.units, s.name, s.labels, a.charge_type
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
      teachingHours: parseFloat(parseFloat(row.teaching_hours).toFixed(2)),
      students: row.students,
      labels: row.labels
    }));

    res.json({ lessons });

  } catch (error) {
    console.error('Error fetching tutor lessons:', error);
    res.status(500).json({ error: 'Internal server error' });
  } finally {
    client.release();
  }
}));

module.exports = router;

