const express = require('express');
const { asyncHandler } = require('../middleware/error-handler');
const { logger } = require('../utils/logger');
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
const router = express.Router();
router.get('/', asyncHandler(async (req, res) => {
  const client = await pool.connect();
  try {
    const {
      year,
      startDate,
      endDate
    } = req.query;
    if (!year || !startDate || !endDate) {
      return res.status(400).json({
        error: 'year, startDate and endDate are required'
      });
    }
    const yearInt = parseInt(year, 10);
    const monthNames = ['jan', 'feb', 'mar', 'apr', 'may', 'jun', 'jul', 'aug', 'sep', 'oct', 'nov', 'dec'];
    const startNY = toNY(parseUTC(startDate)).startOf('day');
    const endNY = toNY(parseUTC(endDate)).endOf('day');
    const formattedStart = startNY.toISO();
    const formattedEnd = endNY.toISO();
    const startYearMonth = startNY.toFormat('yyyy-MM');
    const endYearMonth = endNY.toFormat('yyyy-MM');
    const onlineMetricsQuery = `
      WITH online_appointments AS (
        SELECT 
          a.appointment_id,
          a.start,
          a.finish,
          a.units,
          EXTRACT(EPOCH FROM (a.finish - a.start)) / 3600 AS hours
        FROM appointments a
        JOIN services s ON a.service_id = s.service_id
        JOIN LATERAL jsonb_array_elements_text(s.labels) AS label ON TRUE
        WHERE a.status IN ('complete', 'cancelled-chargeable')
          AND label LIKE '%Online%'
          AND EXTRACT(YEAR FROM a.start) = $1
          AND a.start BETWEEN $2 AND $3
      ),
      revenue_calc AS (
        SELECT 
          ha.appointment_id,
          SUM(ar.charge_rate * ha.units) AS appointment_revenue
        FROM online_appointments ha
        LEFT JOIN appointment_recipients ar
          ON ha.appointment_id = ar.appointment_id
          AND ar.status IN ('attended', 'missed-chargeable')
        GROUP BY ha.appointment_id
      ),
      tutor_pay_calc AS (
        SELECT 
          ha.appointment_id,
          SUM(ac.pay_rate) AS appointment_tutor_pay
        FROM online_appointments ha
        LEFT JOIN appointment_contractors ac
          ON ha.appointment_id = ac.appointment_id
        GROUP BY ha.appointment_id
      )
      SELECT 
        EXTRACT(MONTH FROM ha.start) AS month,
        COUNT(*) AS total_lessons,
        ROUND(SUM(ha.hours), 2) AS total_hours,
        ROUND(SUM(rc.appointment_revenue), 2) AS total_revenue,
        ROUND(SUM(tp.appointment_tutor_pay), 2) AS total_tutor_pay
      FROM online_appointments ha
      LEFT JOIN revenue_calc rc ON ha.appointment_id = rc.appointment_id
      LEFT JOIN tutor_pay_calc tp ON ha.appointment_id = tp.appointment_id
      GROUP BY month
      ORDER BY month;
    `;
    const onlineLeadsQuery = `
      SELECT 
        EXTRACT(MONTH FROM a.start) AS month,
        COUNT(DISTINCT ar.paying_client_id) AS online_leads
      FROM appointments a
      JOIN services s ON a.service_id = s.service_id
      JOIN LATERAL jsonb_array_elements_text(s.labels) AS label ON TRUE
      JOIN appointment_recipients ar ON a.appointment_id = ar.appointment_id
      WHERE a.status IN ('complete', 'cancelled-chargeable')
        AND label LIKE '%Online%'
        AND a.start BETWEEN $1 AND $2
      GROUP BY month;
    `;
    const onlineLessonsPlacedQuery = `
      SELECT 
        EXTRACT(MONTH FROM s.created_at) AS month,
        COUNT(*) AS lessons_placed
      FROM services s
      JOIN LATERAL jsonb_array_elements_text(s.labels) AS label ON TRUE
      WHERE s.created_at BETWEEN $1 AND $2
        AND label LIKE '%Online%'
        AND EXISTS (
          SELECT 1 FROM service_contractors sc WHERE sc.service_id = s.service_id
        )
        AND NOT EXISTS (
          SELECT 1 FROM appointments a WHERE a.service_id = s.service_id
        )
      GROUP BY month;
    `;
    const onlineTrialFirstLessonsQuery = `
      SELECT 
        EXTRACT(MONTH FROM MIN(a.start)) AS month,
        COUNT(*) AS trial_first_lessons
      FROM appointments a
      JOIN appointment_recipients ar ON a.appointment_id = ar.appointment_id
      JOIN services s ON a.service_id = s.service_id
      JOIN LATERAL jsonb_array_elements_text(s.labels) AS label ON TRUE
      WHERE a.start BETWEEN $1 AND $2
        AND a.status IN ('complete', 'cancelled-chargeable')
        AND label LIKE '%Online%'
      GROUP BY ar.paying_client_id
      HAVING COUNT(a.appointment_id) = 1;
    `;
    const onlineSeventhFullPdLessonQuery = `
      SELECT 
  EXTRACT(MONTH FROM MIN(a.start)) AS month,
  1 AS seventh_full_pd_lesson
FROM appointments a
JOIN appointment_recipients ar ON a.appointment_id = ar.appointment_id
JOIN services s ON a.service_id = s.service_id
JOIN LATERAL jsonb_array_elements_text(s.labels) AS label ON TRUE
WHERE a.start BETWEEN $1 AND $2
  AND a.status IN ('complete', 'cancelled-chargeable')
  AND label LIKE '%Online%'
GROUP BY ar.paying_client_id
HAVING COUNT(a.appointment_id) >= 7;

    `;
    const onlineSavesWinbacksTakeoversQuery = `
      SELECT 
        EXTRACT(MONTH FROM a.start) AS month,
        COUNT(*) AS saves_winbacks_takeovers
      FROM appointments a
      JOIN services s ON a.service_id = s.service_id
      JOIN LATERAL jsonb_array_elements_text(s.labels) AS label ON TRUE
      WHERE a.start BETWEEN $1 AND $2
        AND a.status IN ('complete', 'cancelled-chargeable')
        AND label LIKE '%Online%'
        AND a.save_winback_takeover = true
      GROUP BY month;
    `;
    const onlineActiveTutorCountQuery = `
      SELECT 
        EXTRACT(MONTH FROM a.start) AS month,
        COUNT(DISTINCT ac.contractor_id) AS active_tutors
      FROM appointment_contractors ac
      JOIN appointments a ON ac.appointment_id = a.appointment_id
      JOIN services s ON a.service_id = s.service_id
      JOIN LATERAL jsonb_array_elements_text(s.labels) AS label ON TRUE
      WHERE a.start BETWEEN $1 AND $2
        AND a.status IN ('complete', 'cancelled-chargeable')
        AND label LIKE '%Online%'
      GROUP BY month;
    `;
    const onlineTutorsTaught20Query = `
      WITH tutor_hours AS (
        SELECT 
          ac.contractor_id,
          EXTRACT(MONTH FROM a.start) AS month,
          SUM(a.units) AS total_hours
        FROM appointment_contractors ac
        JOIN appointments a ON ac.appointment_id = a.appointment_id
        JOIN services s ON a.service_id = s.service_id
        JOIN LATERAL jsonb_array_elements_text(s.labels) AS label ON TRUE
        WHERE a.start BETWEEN $1 AND $2
          AND a.status IN ('complete', 'cancelled-chargeable')
          AND label LIKE '%Online%'
        GROUP BY ac.contractor_id, month
      )
      SELECT month, COUNT(*) AS tutors_count
      FROM tutor_hours
      WHERE total_hours >= 20
      GROUP BY month
      ORDER BY month;
    `;
    const onlineTutorsTaught40Query = `
      WITH tutor_hours AS (
        SELECT 
          ac.contractor_id,
          EXTRACT(MONTH FROM a.start) AS month,
          SUM(a.units) AS total_hours
        FROM appointment_contractors ac
        JOIN appointments a ON ac.appointment_id = a.appointment_id
        JOIN services s ON a.service_id = s.service_id
        JOIN LATERAL jsonb_array_elements_text(s.labels) AS label ON TRUE
        WHERE a.start BETWEEN $1 AND $2
          AND a.status IN ('complete', 'cancelled-chargeable')
          AND label LIKE '%Online%'
        GROUP BY ac.contractor_id, month
      )
      SELECT month, COUNT(*) AS tutors_count
      FROM tutor_hours
      WHERE total_hours >= 40
      GROUP BY month
      ORDER BY month;
    `;
    const onlineTutorsTaught60Query = `
      WITH tutor_hours AS (
        SELECT 
          ac.contractor_id,
          EXTRACT(MONTH FROM a.start) AS month,
          SUM(a.units) AS total_hours
        FROM appointment_contractors ac
        JOIN appointments a ON ac.appointment_id = a.appointment_id
        JOIN services s ON a.service_id = s.service_id
        JOIN LATERAL jsonb_array_elements_text(s.labels) AS label ON TRUE
        WHERE a.start BETWEEN $1 AND $2
          AND a.status IN ('complete', 'cancelled-chargeable')
          AND label LIKE '%Online%'
        GROUP BY ac.contractor_id, month
      )
      SELECT month, COUNT(*) AS tutors_count
      FROM tutor_hours
      WHERE total_hours >= 60
      GROUP BY month
      ORDER BY month;
    `;
    const onlineTutorTaught80Query = `
      WITH tutor_hours AS (
        SELECT 
          ac.contractor_id,
          EXTRACT(MONTH FROM a.start) AS month,
          SUM(a.units) AS total_hours
        FROM appointment_contractors ac
        JOIN appointments a ON ac.appointment_id = a.appointment_id
        JOIN services s ON a.service_id = s.service_id
        JOIN LATERAL jsonb_array_elements_text(s.labels) AS label ON TRUE
        WHERE a.start BETWEEN $1 AND $2
          AND a.status IN ('complete', 'cancelled-chargeable')
          AND label LIKE '%Online%'
        GROUP BY ac.contractor_id, month
      )
      SELECT month, COUNT(*) AS tutors_count
      FROM tutor_hours
      WHERE total_hours >= 80 AND total_hours < 85
      GROUP BY month
      ORDER BY month;
    `;
    const onlineTutorTaught85PlusQuery = `
      WITH tutor_hours AS (
        SELECT 
          ac.contractor_id,
          EXTRACT(MONTH FROM a.start) AS month,
          SUM(a.units) AS total_hours
        FROM appointment_contractors ac
        JOIN appointments a ON ac.appointment_id = a.appointment_id
        JOIN services s ON a.service_id = s.service_id
        JOIN LATERAL jsonb_array_elements_text(s.labels) AS label ON TRUE
        WHERE a.start BETWEEN $1 AND $2
          AND a.status IN ('complete', 'cancelled-chargeable')
          AND label LIKE '%Online%'
        GROUP BY ac.contractor_id, month
      )
      SELECT month, COUNT(*) AS tutors_count
      FROM tutor_hours
      WHERE total_hours >= 85
      GROUP BY month
      ORDER BY month;
    `;
    const queries = [{
      name: 'onlineMetrics',
      query: onlineMetricsQuery,
      params: [year, startDate, endDate]
    }, {
      name: 'onlineLeads',
      query: onlineLeadsQuery,
      params: [startDate, endDate]
    }, {
      name: 'onlineLessonsPlaced',
      query: onlineLessonsPlacedQuery,
      params: [startDate, endDate]
    }, {
      name: 'onlineTrialFirstLessons',
      query: onlineTrialFirstLessonsQuery,
      params: [startDate, endDate]
    }, {
      name: 'onlineSeventhFullPdLesson',
      query: onlineSeventhFullPdLessonQuery,
      params: [startDate, endDate]
    }, {
      name: 'onlineActiveTutorCount',
      query: onlineActiveTutorCountQuery,
      params: [startDate, endDate]
    }, {
      name: 'onlineTutorsTaught20',
      query: onlineTutorsTaught20Query,
      params: [startDate, endDate]
    }, {
      name: 'onlineTutorsTaught40',
      query: onlineTutorsTaught40Query,
      params: [startDate, endDate]
    }, {
      name: 'onlineTutorsTaught60',
      query: onlineTutorsTaught60Query,
      params: [startDate, endDate]
    }, {
      name: 'onlineTutorTaught80',
      query: onlineTutorTaught80Query,
      params: [startDate, endDate]
    }, {
      name: 'onlineTutorTaught85Plus',
      query: onlineTutorTaught85PlusQuery,
      params: [startDate, endDate]
    }];
    const results = {};
    for (const q of queries) {
      results[q.name] = await client.query(q.query, q.params);
    }
    function processMetricResult(result, valueField) {
      const months = monthNames.reduce((acc, m) => ({
        ...acc,
        [m]: 0
      }), {});
      result.rows.forEach(row => {
        const monthIndex = row.month - 1;
        const monthName = monthNames[monthIndex];
        const value = parseFloat(row[valueField]) || 0;
        months[monthName] += value;
      });
      const ytd = Object.values(months).reduce((sum, val) => sum + val, 0);
      return {
        ytd,
        months
      };
    }
    const onlineMetrics = processMetricResult(results.onlineMetrics, 'total_lessons');
    const onlineRevenue = processMetricResult(results.onlineMetrics, 'total_revenue');
    const onlineTutorPay = processMetricResult(results.onlineMetrics, 'total_tutor_pay');
    const grossProfitMargin = {
      ytd: 0,
      months: {}
    };
    monthNames.forEach(m => {
      const rev = onlineRevenue.months[m] || 0;
      const tp = onlineTutorPay.months[m] || 0;
      grossProfitMargin.months[m] = rev > 0 ? ((rev - tp) / rev * 100).toFixed(2) : 0;
    });
    grossProfitMargin.ytd = onlineRevenue.ytd > 0 ? ((onlineRevenue.ytd - onlineTutorPay.ytd) / onlineRevenue.ytd * 100).toFixed(2) : 0;
    const onlineLeads = processMetricResult(results.onlineLeads, 'online_leads');
    const lessonsPlaced = processMetricResult(results.onlineLessonsPlaced, 'lessons_placed');
    const trialFirstLessons = processMetricResult(results.onlineTrialFirstLessons, 'trial_first_lessons');
    const seventhFullPdLesson = processMetricResult(results.onlineSeventhFullPdLesson, 'seventh_full_pd_lesson');
    const activeTutorCount = processMetricResult(results.onlineActiveTutorCount, 'active_tutors');
    const tutorsTaught20 = processMetricResult(results.onlineTutorsTaught20, 'tutors_count');
    const tutorsTaught40 = processMetricResult(results.onlineTutorsTaught40, 'tutors_count');
    const tutorsTaught60 = processMetricResult(results.onlineTutorsTaught60, 'tutors_count');
    const tutorTaught80 = processMetricResult(results.onlineTutorTaught80, 'tutors_count');
    const tutorTaught85Plus = processMetricResult(results.onlineTutorTaught85Plus, 'tutors_count');
    const finalData = {
      lessons: onlineMetrics,
      revenue: onlineRevenue,
      tutorPay: onlineTutorPay,
      grossProfitMargin,
      leads: onlineLeads,
      lessonsPlaced,
      trialNumber: trialFirstLessons,
      trialsNotConverted: trialFirstLessons,
      firstFullPdLesson: trialFirstLessons,
      seventhFullPdLesson,
      activeTutorCount,
      tutorsTaught20,
      tutorsTaught40,
      tutorsTaught60,
      tutorTaught80,
      tutorTaught85Plus
    };
    res.json(finalData);
  } catch (error) {
    logger.error({ err: error }, 'Error fetching master report online data');
    res.status(500).json({
      error: 'Internal server error'
    });
  } finally {
    client.release();
  }
}));
module.exports = router;