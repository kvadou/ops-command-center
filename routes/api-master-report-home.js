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
    const homeMetricsQuery = `
      WITH home_appointments AS (
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
          AND label LIKE '%Home%'
          AND EXTRACT(YEAR FROM a.start) = $1
          AND a.start BETWEEN $2 AND $3
      ),
      revenue_calc AS (
        SELECT 
          ha.appointment_id,
          SUM(ar.charge_rate * ha.units) AS appointment_revenue
        FROM home_appointments ha
        LEFT JOIN appointment_recipients ar
          ON ha.appointment_id = ar.appointment_id
          AND ar.status IN ('attended', 'missed-chargeable')
        GROUP BY ha.appointment_id
      ),
      tutor_pay_calc AS (
        SELECT 
          ha.appointment_id,
          SUM(ac.pay_rate) AS appointment_tutor_pay
        FROM home_appointments ha
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
      FROM home_appointments ha
      LEFT JOIN revenue_calc rc ON ha.appointment_id = rc.appointment_id
      LEFT JOIN tutor_pay_calc tp ON ha.appointment_id = tp.appointment_id
      GROUP BY month
      ORDER BY month;
    `;
    const homeLeadsQuery = `
      SELECT 
        EXTRACT(MONTH FROM a.start) AS month,
        COUNT(DISTINCT ar.paying_client_id) AS home_leads
      FROM appointments a
      JOIN services s ON a.service_id = s.service_id
      JOIN LATERAL jsonb_array_elements_text(s.labels) AS label ON TRUE
      JOIN appointment_recipients ar ON a.appointment_id = ar.appointment_id
      WHERE a.status IN ('complete', 'cancelled-chargeable')
        AND label LIKE '%Home%'
        AND a.start BETWEEN $1 AND $2
      GROUP BY month;
    `;
    const homeLessonsPlacedQuery = `
      SELECT 
        EXTRACT(MONTH FROM s.created_at) AS month,
        COUNT(*) AS lessons_placed
      FROM services s
      JOIN LATERAL jsonb_array_elements_text(s.labels) AS label ON TRUE
      WHERE s.created_at BETWEEN $1 AND $2
        AND label LIKE '%Home%'
        AND EXISTS (
          SELECT 1 FROM service_contractors sc WHERE sc.service_id = s.service_id
        )
        AND NOT EXISTS (
          SELECT 1 FROM appointments a WHERE a.service_id = s.service_id
        )
      GROUP BY month;
    `;
    const homeTrialFirstLessonsQuery = `
      SELECT 
        EXTRACT(MONTH FROM MIN(a.start)) AS month,
        COUNT(*) AS trial_first_lessons
      FROM appointments a
      JOIN appointment_recipients ar ON a.appointment_id = ar.appointment_id
      JOIN services s ON a.service_id = s.service_id
      JOIN LATERAL jsonb_array_elements_text(s.labels) AS label ON TRUE
      WHERE a.start BETWEEN $1 AND $2
        AND a.status IN ('complete', 'cancelled-chargeable')
        AND label LIKE '%Home%'
      GROUP BY ar.paying_client_id
      HAVING COUNT(a.appointment_id) = 1;
    `;
    const homeSeventhFullPdLessonQuery = `
      SELECT 
  EXTRACT(MONTH FROM MIN(a.start)) AS month,
  1 AS seventh_full_pd_lesson
FROM appointments a
JOIN appointment_recipients ar ON a.appointment_id = ar.appointment_id
JOIN services s ON a.service_id = s.service_id
JOIN LATERAL jsonb_array_elements_text(s.labels) AS label ON TRUE
WHERE a.start BETWEEN $1 AND $2
  AND a.status IN ('complete', 'cancelled-chargeable')
  AND label LIKE '%Home%'
GROUP BY ar.paying_client_id
HAVING COUNT(a.appointment_id) >= 7;

    `;
    const homeSavesWinbacksTakeoversQuery = `
      SELECT 
        EXTRACT(MONTH FROM a.start) AS month,
        COUNT(*) AS saves_winbacks_takeovers
      FROM appointments a
      JOIN services s ON a.service_id = s.service_id
      JOIN LATERAL jsonb_array_elements_text(s.labels) AS label ON TRUE
      WHERE a.start BETWEEN $1 AND $2
        AND a.status IN ('complete', 'cancelled-chargeable')
        AND label LIKE '%Home%'
        AND a.save_winback_takeover = true
      GROUP BY month;
    `;
    const homeActiveTutorCountQuery = `
      SELECT 
        EXTRACT(MONTH FROM a.start) AS month,
        COUNT(DISTINCT ac.contractor_id) AS active_tutors
      FROM appointment_contractors ac
      JOIN appointments a ON ac.appointment_id = a.appointment_id
      JOIN services s ON a.service_id = s.service_id
      JOIN LATERAL jsonb_array_elements_text(s.labels) AS label ON TRUE
      WHERE a.start BETWEEN $1 AND $2
        AND a.status IN ('complete', 'cancelled-chargeable')
        AND label LIKE '%Home%'
      GROUP BY month;
    `;
    const homeTutorsTaught20Query = `
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
          AND label LIKE '%Home%'
        GROUP BY ac.contractor_id, month
      )
      SELECT month, COUNT(*) AS tutors_count
      FROM tutor_hours
      WHERE total_hours >= 20
      GROUP BY month
      ORDER BY month;
    `;
    const homeTutorsTaught40Query = `
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
          AND label LIKE '%Home%'
        GROUP BY ac.contractor_id, month
      )
      SELECT month, COUNT(*) AS tutors_count
      FROM tutor_hours
      WHERE total_hours >= 40
      GROUP BY month
      ORDER BY month;
    `;
    const homeTutorsTaught60Query = `
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
          AND label LIKE '%Home%'
        GROUP BY ac.contractor_id, month
      )
      SELECT month, COUNT(*) AS tutors_count
      FROM tutor_hours
      WHERE total_hours >= 60
      GROUP BY month
      ORDER BY month;
    `;
    const homeTutorTaught80Query = `
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
          AND label LIKE '%Home%'
        GROUP BY ac.contractor_id, month
      )
      SELECT month, COUNT(*) AS tutors_count
      FROM tutor_hours
      WHERE total_hours >= 80 AND total_hours < 85
      GROUP BY month
      ORDER BY month;
    `;
    const homeTutorTaught85PlusQuery = `
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
          AND label LIKE '%Home%'
        GROUP BY ac.contractor_id, month
      )
      SELECT month, COUNT(*) AS tutors_count
      FROM tutor_hours
      WHERE total_hours >= 85
      GROUP BY month
      ORDER BY month;
    `;
    const queries = [{
      name: 'homeMetrics',
      query: homeMetricsQuery,
      params: [year, startDate, endDate]
    }, {
      name: 'homeLeads',
      query: homeLeadsQuery,
      params: [startDate, endDate]
    }, {
      name: 'homeLessonsPlaced',
      query: homeLessonsPlacedQuery,
      params: [startDate, endDate]
    }, {
      name: 'homeTrialFirstLessons',
      query: homeTrialFirstLessonsQuery,
      params: [startDate, endDate]
    }, {
      name: 'homeSeventhFullPdLesson',
      query: homeSeventhFullPdLessonQuery,
      params: [startDate, endDate]
    }, {
      name: 'homeActiveTutorCount',
      query: homeActiveTutorCountQuery,
      params: [startDate, endDate]
    }, {
      name: 'homeTutorsTaught20',
      query: homeTutorsTaught20Query,
      params: [startDate, endDate]
    }, {
      name: 'homeTutorsTaught40',
      query: homeTutorsTaught40Query,
      params: [startDate, endDate]
    }, {
      name: 'homeTutorsTaught60',
      query: homeTutorsTaught60Query,
      params: [startDate, endDate]
    }, {
      name: 'homeTutorTaught80',
      query: homeTutorTaught80Query,
      params: [startDate, endDate]
    }, {
      name: 'homeTutorTaught85Plus',
      query: homeTutorTaught85PlusQuery,
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
    const homeMetrics = processMetricResult(results.homeMetrics, 'total_lessons');
    const homeRevenue = processMetricResult(results.homeMetrics, 'total_revenue');
    const homeTutorPay = processMetricResult(results.homeMetrics, 'total_tutor_pay');
    const grossProfitMargin = {
      ytd: 0,
      months: {}
    };
    monthNames.forEach(m => {
      const rev = homeRevenue.months[m] || 0;
      const tp = homeTutorPay.months[m] || 0;
      grossProfitMargin.months[m] = rev > 0 ? ((rev - tp) / rev * 100).toFixed(2) : 0;
    });
    grossProfitMargin.ytd = homeRevenue.ytd > 0 ? ((homeRevenue.ytd - homeTutorPay.ytd) / homeRevenue.ytd * 100).toFixed(2) : 0;
    const homeLeads = processMetricResult(results.homeLeads, 'home_leads');
    const lessonsPlaced = processMetricResult(results.homeLessonsPlaced, 'lessons_placed');
    const trialFirstLessons = processMetricResult(results.homeTrialFirstLessons, 'trial_first_lessons');
    const seventhFullPdLesson = processMetricResult(results.homeSeventhFullPdLesson, 'seventh_full_pd_lesson');
    const activeTutorCount = processMetricResult(results.homeActiveTutorCount, 'active_tutors');
    const tutorsTaught20 = processMetricResult(results.homeTutorsTaught20, 'tutors_count');
    const tutorsTaught40 = processMetricResult(results.homeTutorsTaught40, 'tutors_count');
    const tutorsTaught60 = processMetricResult(results.homeTutorsTaught60, 'tutors_count');
    const tutorTaught80 = processMetricResult(results.homeTutorTaught80, 'tutors_count');
    const tutorTaught85Plus = processMetricResult(results.homeTutorTaught85Plus, 'tutors_count');
    const finalData = {
      lessons: homeMetrics,
      revenue: homeRevenue,
      tutorPay: homeTutorPay,
      grossProfitMargin,
      leads: homeLeads,
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
    logger.error({ err: error }, 'Error fetching master report home data');
    res.status(500).json({
      error: 'Internal server error'
    });
  } finally {
    if (client) client.release();
  }
}));
module.exports = router;