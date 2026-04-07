const express = require("express");
const {
  DateTime
} = require("luxon");
const {
  pool,
  axios,
  cloudinary,
  tutorCruncherAPI,
  limitedGet,
  jwt,
  stripe,
  transporter,
  db,
  sequelize,
  Service,
  Location,
  ColourGroup,
  Appointment,
  delay,
  rateLimitRetry,
  auth,
  GRAVITY_FORMS_API_BASE_URL,
  KLAVIYO_API_KEY,
  LABEL_ID,
  TUTORCRUNCHER_API_BASE
} = global;
const { asyncHandler } = require('../middleware/error-handler');
const { logger } = require('../utils/logger');
module.exports = function buildMetricsRouter({
  pool,
  auth = (req, res, next) => next()
}) {
  const router = express.Router();
  async function getMetricsByDivision(req, res) {
    const {
      startDate,
      endDate,
      labels
    } = req.body;
    try {
      if (!DateTime.fromISO(startDate).isValid || !DateTime.fromISO(endDate).isValid) {
        return res.status(400).send("Invalid date format. Please provide ISO formatted dates.");
      }
      const currentStartNY = DateTime.fromISO(startDate, {
        zone: "America/New_York"
      }).startOf("day");
      const currentEndNY = DateTime.fromISO(endDate, {
        zone: "America/New_York"
      }).endOf("day");
      const previousStartNY = currentStartNY.minus({
        months: 1
      }).startOf("month");
      const previousEndNY = currentStartNY.minus({
        months: 1
      }).endOf("month");
      const secondPreviousStartNY = currentStartNY.minus({
        months: 2
      }).startOf("month");
      const secondPreviousEndNY = currentStartNY.minus({
        months: 2
      }).endOf("month");
      const thirdPreviousStartNY = currentStartNY.minus({
        months: 3
      }).startOf("month");
      const thirdPreviousEndNY = currentStartNY.minus({
        months: 3
      }).endOf("month");
      const start = currentStartNY.toUTC().toISO();
      const end = currentEndNY.toUTC().toISO();
      const previousStart = previousStartNY.toUTC().toISO();
      const previousEnd = previousEndNY.toUTC().toISO();
      const secondPreviousStart = secondPreviousStartNY.toUTC().toISO();
      const secondPreviousEnd = secondPreviousEndNY.toUTC().toISO();
      const thirdPreviousStart = thirdPreviousStartNY.toUTC().toISO();
      const thirdPreviousEnd = thirdPreviousEndNY.toUTC().toISO();
      const labelsFilter = labels && labels.length > 0 ? `AND EXISTS (
               SELECT 1
               FROM jsonb_array_elements_text(s.labels) label
               WHERE label = ANY($3::text[])
             )` : "";
      const query = `
WITH 
current_period_clients AS (
  SELECT DISTINCT ar.paying_client_id
  FROM appointment_recipients ar
  JOIN appointments a ON ar.appointment_id = a.appointment_id
  JOIN services s ON a.service_id = s.service_id
  WHERE a.start >= $1 AND a.start <= $2
    AND a.status IN ('complete', 'cancelled-chargeable')
    ${labelsFilter}
),
previous_period_clients AS (
  SELECT DISTINCT ar.paying_client_id
  FROM appointment_recipients ar
  JOIN appointments a ON ar.appointment_id = a.appointment_id
  JOIN services s ON a.service_id = s.service_id
  WHERE a.start >= $4 AND a.start <= $5
    AND a.status IN ('complete', 'cancelled-chargeable')
    ${labelsFilter}
),
total_hours_period AS (
  SELECT COALESCE(SUM(EXTRACT(EPOCH FROM (a.finish - a.start)) / 3600), 0.0) AS total_hours
  FROM appointments a
  JOIN services s ON a.service_id = s.service_id
  WHERE a.start >= $1 AND a.start <= $2
    AND a.status IN ('complete', 'cancelled-chargeable')
    ${labelsFilter}
),
total_clients_all_time AS (
  SELECT COUNT(DISTINCT c.client_id) AS total_clients FROM clients c
),
active_clients_all_time AS (
  SELECT COUNT(DISTINCT ar.paying_client_id) AS active_clients
  FROM appointment_recipients ar
  JOIN appointments a ON ar.appointment_id = a.appointment_id
  WHERE a.status IN ('complete', 'cancelled-chargeable')
),
active_clients_period AS (
  SELECT COUNT(DISTINCT ar.paying_client_id) AS active_clients
  FROM appointment_recipients ar
  JOIN appointments a ON ar.appointment_id = a.appointment_id
  WHERE a.start >= $1 AND a.start <= $2
    AND a.status IN ('complete', 'cancelled-chargeable')
),
active_clients_previous_period AS (
  SELECT COUNT(DISTINCT ar.paying_client_id) AS active_clients
  FROM appointment_recipients ar
  JOIN appointments a ON ar.appointment_id = a.appointment_id
  WHERE a.start >= $4 AND a.start <= $5
    AND a.status IN ('complete', 'cancelled-chargeable')
),
inactive_clients AS (
  SELECT COUNT(DISTINCT c.client_id) AS inactive_count
  FROM clients c
  WHERE NOT EXISTS (
    SELECT 1 FROM appointment_recipients ar
    WHERE ar.paying_client_id::text = c.client_id::text
  )
),
total_lessons_period AS (
  SELECT 
    COUNT(*) AS lesson_count,
    ARRAY_AGG(a.appointment_id) AS lesson_ids,
    ARRAY_AGG(s.service_id) AS service_ids,
    ARRAY_AGG(a.start) AS start_times,
    ARRAY_AGG(s.name) AS job_names,
    ARRAY_AGG(
      (SELECT JSON_AGG(ar_inner.recipient_name)
       FROM appointment_recipients ar_inner
       WHERE ar_inner.appointment_id = a.appointment_id)
    ) AS student_names,
    ARRAY_AGG(
      (SELECT ac.contractor_name
       FROM appointment_contractors ac
       WHERE ac.appointment_id = a.appointment_id)
    ) AS tutor_names,
    ARRAY_AGG(ROUND(a.units::numeric, 2)) AS units
  FROM appointments a
  JOIN services s ON a.service_id = s.service_id
  WHERE a.start >= $1 AND a.start <= $2
    AND a.status IN ('complete', 'cancelled-chargeable')
    ${labelsFilter}
),
lessons_previous_period AS (
  SELECT 
    COUNT(*) AS lesson_count,
    ARRAY_AGG(a.appointment_id) AS lesson_ids,
    ARRAY_AGG(s.service_id) AS service_ids,
    ARRAY_AGG(a.start) AS start_times,
    ARRAY_AGG(s.name) AS job_names,
    ARRAY_AGG(
      (SELECT JSON_AGG(ar_inner.recipient_name)
       FROM appointment_recipients ar_inner
       WHERE ar_inner.appointment_id = a.appointment_id)
    ) AS student_names,
    ARRAY_AGG(
      (SELECT ac.contractor_name
       FROM appointment_contractors ac
       WHERE ac.appointment_id = a.appointment_id)
    ) AS tutor_names,
    ARRAY_AGG(ROUND(a.units::numeric, 2)) AS units
  FROM appointments a
  JOIN services s ON a.service_id = s.service_id
  WHERE a.start >= $4 AND a.start <= $5
    AND a.status IN ('complete', 'cancelled-chargeable')
    ${labelsFilter}
),
lessons_2_periods_ago AS (
  SELECT COUNT(*) AS lesson_count
  FROM appointments a
  JOIN services s ON a.service_id = s.service_id
  WHERE a.start >= $6 AND a.start <= $7
    AND a.status IN ('complete', 'cancelled-chargeable')
    ${labelsFilter}
),
lessons_3_periods_ago AS (
  SELECT COUNT(*) AS lesson_count
  FROM appointments a
  JOIN services s ON a.service_id = s.service_id
  WHERE a.start >= $8 AND a.start <= $9
    AND a.status IN ('complete', 'cancelled-chargeable')
    ${labelsFilter}
),
retained_clients AS (
  SELECT c.client_id AS paying_client_id,
         c.first_name || ' ' || c.last_name AS client_name
  FROM current_period_clients cp
  JOIN clients c ON c.client_id::text = cp.paying_client_id::text
  INTERSECT
  SELECT c.client_id AS paying_client_id,
         c.first_name || ' ' || c.last_name AS client_name
  FROM previous_period_clients pp
  JOIN clients c ON c.client_id::text = pp.paying_client_id::text
),
retained_clients_previous_period AS (
  SELECT paying_client_id
  FROM previous_period_clients
  INTERSECT
  SELECT paying_client_id
  FROM (
    SELECT DISTINCT ar.paying_client_id
    FROM appointment_recipients ar
    JOIN appointments a ON ar.appointment_id = a.appointment_id
    JOIN services s ON a.service_id = s.service_id
    WHERE a.start >= $6 AND a.start <= $7
      AND a.status IN ('complete', 'cancelled-chargeable')
      ${labelsFilter}
  ) clients_two_periods_ago
),
newly_active_clients AS (
  SELECT c.client_id AS paying_client_id,
         c.first_name || ' ' || c.last_name AS client_name
  FROM current_period_clients cp
  JOIN clients c ON c.client_id::text = cp.paying_client_id::text
  EXCEPT
  SELECT c.client_id AS paying_client_id,
         c.first_name || ' ' || c.last_name AS client_name
  FROM previous_period_clients pp
  JOIN clients c ON c.client_id::text = pp.paying_client_id::text
),
lost_clients AS (
  SELECT c.client_id AS paying_client_id,
         c.first_name || ' ' || c.last_name AS client_name
  FROM previous_period_clients pp
  JOIN clients c ON c.client_id::text = pp.paying_client_id::text
  EXCEPT
  SELECT c.client_id AS paying_client_id,
         c.first_name || ' ' || c.last_name AS client_name
  FROM current_period_clients cp
  JOIN clients c ON c.client_id::text = cp.paying_client_id::text
),
lessons_last_4_periods AS (
  SELECT COUNT(*) AS lesson_count
  FROM appointments a
  JOIN services s ON a.service_id = s.service_id
  WHERE a.start >= NOW() - INTERVAL '4 months'
    AND a.status IN ('complete', 'cancelled-chargeable')
    ${labelsFilter}
),
total_students_period AS (
  SELECT COUNT(ar.paying_client_id) AS student_count
  FROM appointment_recipients ar
  JOIN appointments a ON ar.appointment_id = a.appointment_id
  JOIN services s ON a.service_id = s.service_id
  WHERE a.start >= $1 AND a.start <= $2
    AND a.status IN ('complete', 'cancelled-chargeable')
    ${labelsFilter}
)
SELECT 
  (SELECT active_clients FROM active_clients_period) AS active_clients_period,
  (SELECT active_clients FROM active_clients_previous_period) AS active_clients_previous_period,
  (SELECT total_clients FROM total_clients_all_time) AS total_clients_all_time,
  (SELECT active_clients FROM active_clients_all_time) AS active_clients_all_time,
  (SELECT inactive_count FROM inactive_clients) AS inactive_clients,
  ROUND(
    (SELECT COUNT(*) FROM retained_clients) * 100.0 /
    NULLIF((SELECT COUNT(*) FROM previous_period_clients), 0), 2
  ) AS retention_rate,
  ARRAY(
    SELECT jsonb_build_object('client_id', paying_client_id, 'client_name', client_name)
    FROM retained_clients
  ) AS retained_clients,
  ARRAY(SELECT paying_client_id FROM retained_clients_previous_period) AS retained_clients_previous_period,
  (SELECT COUNT(*) FROM retained_clients_previous_period) AS retained_clients_previous_period_count,
  (SELECT COUNT(*) FROM current_period_clients)  AS newly_active_clients_count,
  (SELECT COUNT(*) FROM previous_period_clients) AS lost_clients_count,
  (SELECT lesson_count FROM total_lessons_period) AS total_lessons_period,
  (SELECT lesson_ids   FROM total_lessons_period) AS lesson_ids_period,
  (SELECT service_ids  FROM total_lessons_period) AS service_ids_period,
  (SELECT start_times  FROM total_lessons_period) AS start_times_period,
  (SELECT job_names    FROM total_lessons_period) AS job_names_period,
  (SELECT student_names FROM total_lessons_period) AS student_names_period,
  (SELECT tutor_names   FROM total_lessons_period) AS tutor_names_period,
  (SELECT units         FROM total_lessons_period) AS units_period,
  (SELECT lesson_count FROM lessons_previous_period) AS lessons_previous_period,
  (SELECT lesson_ids   FROM lessons_previous_period) AS lesson_ids_previous_period,
  (SELECT service_ids  FROM lessons_previous_period) AS service_ids_previous_period,
  (SELECT start_times  FROM lessons_previous_period) AS start_times_previous_period,
  (SELECT job_names    FROM lessons_previous_period) AS job_names_previous_period,
  (SELECT student_names FROM lessons_previous_period) AS student_names_previous_period,
  (SELECT tutor_names   FROM lessons_previous_period) AS tutor_names_previous_period,
  (SELECT units         FROM lessons_previous_period) AS units_previous_period,
  ARRAY(
    SELECT jsonb_build_object('client_id', paying_client_id, 'client_name', client_name)
    FROM newly_active_clients
  ) AS newly_active_clients,
  ARRAY(
    SELECT jsonb_build_object('client_id', paying_client_id, 'client_name', client_name)
    FROM lost_clients
  ) AS lost_clients,
  ROUND((SELECT total_hours FROM total_hours_period), 2) AS total_hours,
  ROUND(
    (SELECT lesson_count FROM total_lessons_period) * 1.0 /
    NULLIF((SELECT student_count FROM total_students_period), 0), 2
  ) AS avg_lessons_per_student,
  ROUND(
    (SELECT total_hours FROM total_hours_period) * 1.0 /
    NULLIF((SELECT lesson_count FROM total_lessons_period), 0), 2
  ) AS avg_hours_per_lesson,
  ROUND(
    (
      (SELECT lesson_count FROM total_lessons_period) +
      (SELECT lesson_count FROM lessons_previous_period) +
      (SELECT lesson_count FROM lessons_2_periods_ago) +
      (SELECT lesson_count FROM lessons_3_periods_ago)
    ) / 4.0, 2
  ) AS lessons_4_period_avg,
  (SELECT student_count FROM total_students_period) AS total_students,
  (SELECT lesson_count FROM total_lessons_period) AS total_lessons_period_dup,
  ROUND(
    (SELECT student_count FROM total_students_period) * 1.0 /
    NULLIF((SELECT lesson_count FROM total_lessons_period), 0), 2
  ) AS avg_students_per_lesson
;`;
      const params = [start, end, labels && labels.length > 0 ? labels : null, previousStart, previousEnd, secondPreviousStart, secondPreviousEnd, thirdPreviousStart, thirdPreviousEnd];
      const result = await pool.query(query, params);
      const row = result.rows[0] || {};
      const response = {
        retentionRate: row.retention_rate || 0,
        newlyActiveClients: row.newly_active_clients || [],
        lostClients: row.lost_clients || [],
        retainedClients: row.retained_clients || [],
        retainedClientsPreviousPeriod: row.retained_clients_previous_period || [],
        retainedClientsPreviousPeriodCount: row.retained_clients_previous_period_count || 0,
        newlyActiveClientsCount: (row.newly_active_clients || []).length || 0,
        lostClientsCount: (row.lost_clients || []).length || 0,
        totalLessonsPeriod: row.total_lessons_period || 0,
        lessonsPreviousPeriod: row.lessons_previous_period || 0,
        totalHours: row.total_hours || "0.00",
        avgStudentsPerLesson: row.avg_students_per_lesson || "N/A",
        avgHoursPerLesson: row.avg_hours_per_lesson || "N/A",
        avgLessonsFourPeriods: row.lessons_4_period_avg || 0,
        totalStudents: row.total_students || 0,
        activeClientsPeriod: row.active_clients_period || 0,
        activeClientsPreviousPeriod: row.active_clients_previous_period || 0,
        totalClientsAllTime: row.total_clients_all_time || 0,
        activeClientsAllTime: row.active_clients_all_time || 0,
        inactiveClients: row.inactive_clients || 0,
        lessonDetailsPeriod: {
          count: row.total_lessons_period || 0,
          lessonIds: row.lesson_ids_period || [],
          serviceIds: row.service_ids_period || [],
          startTimes: row.start_times_period || [],
          jobNames: row.job_names_period || [],
          studentNames: row.student_names_period || [],
          tutorNames: row.tutor_names_period || [],
          units: row.units_period || []
        },
        lessonDetailsPreviousPeriod: {
          count: row.lessons_previous_period || 0,
          lessonIds: row.lesson_ids_previous_period || [],
          serviceIds: row.service_ids_previous_period || [],
          startTimes: row.start_times_previous_period || [],
          jobNames: row.job_names_previous_period || [],
          studentNames: row.student_names_previous_period || [],
          tutorNames: row.tutor_names_previous_period || [],
          units: row.units_previous_period || []
        }
      };
      res.json(response);
    } catch (error) {
      logger.error({ err: error }, 'Error fetching retention metrics');
      res.status(500).send("Error fetching retention metrics");
    }
  }
  router.post("/metrics-by-division", auth, asyncHandler(getMetricsByDivision));
  return router;
};