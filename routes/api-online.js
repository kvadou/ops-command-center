const express = require('express');
const router = express.Router();

const { getLocationPool } = require('../utils/pool');
const { asyncHandler } = require('../middleware/error-handler');
const { logger } = require('../utils/logger');

// GET /api/online/dashboard - Get dashboard metrics for online lessons
router.get('/dashboard', asyncHandler(async (req, res) => {
  try {
    const pool = getLocationPool(req);
    if (!pool) {
      return res.status(500).json({ error: 'Database connection not available' });
    }

    const client = await pool.connect();
    
    try {
      // Online label filter
      const onlineLabel = 'Online';

      // Get current month and last month for comparison
      const now = new Date();
      const currentMonthStart = new Date(now.getFullYear(), now.getMonth(), 1);
      const lastMonthStart = new Date(now.getFullYear(), now.getMonth() - 1, 1);
      const lastMonthEnd = new Date(now.getFullYear(), now.getMonth(), 0);

      const query = `
        WITH online_services AS (
          SELECT DISTINCT s.service_id
          FROM services s
          WHERE EXISTS (
            SELECT 1 
            FROM jsonb_array_elements_text(COALESCE(s.labels, '[]'::jsonb)) AS lbl(value)
            WHERE lbl.value ILIKE '%${onlineLabel}%'
          )
        ),
        online_appointments AS (
          SELECT DISTINCT a.appointment_id, a.start, a.finish, a.status, a.units, a.service_id
          FROM appointments a
          JOIN online_services os ON a.service_id = os.service_id
          WHERE a.is_deleted IS NOT TRUE
        )
        SELECT 
          (SELECT COUNT(DISTINCT service_id) FROM online_services) as total_jobs,
          (SELECT COUNT(*) FROM online_appointments) as total_lessons,
          (SELECT COUNT(*) FROM online_appointments WHERE status IN ('planned')) as upcoming_lessons,
          (SELECT COUNT(*) FROM online_appointments WHERE status IN ('complete', 'completed', 'cancelled-chargeable')) as completed_lessons,
          (
            SELECT COALESCE(SUM(ar.charge_rate), 0)
            FROM appointment_recipients ar
            JOIN online_appointments oa ON ar.appointment_id = oa.appointment_id
            WHERE oa.status IN ('complete', 'completed', 'cancelled-chargeable')
              AND ar.status <> 'missed'
          ) as total_revenue,
          (
            SELECT COUNT(DISTINCT ar.recipient_id)
            FROM appointment_recipients ar
            JOIN online_appointments oa ON ar.appointment_id = oa.appointment_id
            WHERE oa.status IN ('complete', 'completed', 'cancelled-chargeable')
              AND ar.status <> 'missed'
          ) as active_students,
          (
            SELECT COALESCE(SUM(
              CASE 
                WHEN oa.status IN ('complete', 'completed', 'cancelled-chargeable') THEN oa.units
                ELSE 0
              END
            ), 0)
            FROM online_appointments oa
          ) as total_hours,
          (
            SELECT COUNT(*)
            FROM online_appointments
            WHERE status IN ('complete', 'completed', 'cancelled-chargeable')
              AND start >= $1
              AND start < $2
          ) as this_month_lessons,
          (
            SELECT COALESCE(SUM(ar.charge_rate), 0)
            FROM appointment_recipients ar
            JOIN online_appointments oa ON ar.appointment_id = oa.appointment_id
            WHERE oa.status IN ('complete', 'completed', 'cancelled-chargeable')
              AND ar.status <> 'missed'
              AND oa.start >= $1
              AND oa.start < $2
          ) as this_month_revenue,
          (
            SELECT COALESCE(SUM(units), 0)
            FROM online_appointments
            WHERE status IN ('complete', 'completed', 'cancelled-chargeable')
              AND start >= $1
              AND start < $2
          ) as this_month_hours,
          (
            SELECT COUNT(*)
            FROM online_appointments
            WHERE status IN ('complete', 'completed', 'cancelled-chargeable')
              AND start >= $3
              AND start < $4
          ) as last_month_lessons,
          (
            SELECT COALESCE(SUM(ar.charge_rate), 0)
            FROM appointment_recipients ar
            JOIN online_appointments oa ON ar.appointment_id = oa.appointment_id
            WHERE oa.status IN ('complete', 'completed', 'cancelled-chargeable')
              AND ar.status <> 'missed'
              AND oa.start >= $3
              AND oa.start < $4
          ) as last_month_revenue,
          (
            SELECT COALESCE(SUM(units), 0)
            FROM online_appointments
            WHERE status IN ('complete', 'completed', 'cancelled-chargeable')
              AND start >= $3
              AND start < $4
          ) as last_month_hours
      `;

      const result = await client.query(query, [
        currentMonthStart.toISOString(),
        now.toISOString(),
        lastMonthStart.toISOString(),
        lastMonthEnd.toISOString(),
      ]);

      const row = result.rows[0];

      res.json({
        totalJobs: parseInt(row.total_jobs) || 0,
        totalLessons: parseInt(row.total_lessons) || 0,
        upcomingLessons: parseInt(row.upcoming_lessons) || 0,
        completedLessons: parseInt(row.completed_lessons) || 0,
        totalRevenue: parseFloat(row.total_revenue) || 0,
        activeStudents: parseInt(row.active_students) || 0,
        totalHours: parseFloat(row.total_hours) || 0,
        thisMonth: {
          lessons: parseInt(row.this_month_lessons) || 0,
          revenue: parseFloat(row.this_month_revenue) || 0,
          hours: parseFloat(row.this_month_hours) || 0,
        },
        lastMonth: {
          lessons: parseInt(row.last_month_lessons) || 0,
          revenue: parseFloat(row.last_month_revenue) || 0,
          hours: parseFloat(row.last_month_hours) || 0,
        },
      });
    } finally {
      client.release();
    }
  } catch (error) {
    logger.error({ err: error }, 'Error fetching online dashboard data');
    res.status(500).json({ error: 'Failed to fetch online dashboard data' });
  }
}));

module.exports = router;









