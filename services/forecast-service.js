/**
 * Forecast Service
 * Handles forecast-related business logic and API interactions
 *
 * Enhanced with:
 * - Scheduled lessons forecasting
 * - Pattern-based lesson projection
 * - Two scenarios (optimistic 100%, realistic historical rate)
 * - Stale job detection
 * - Target management
 * - Seasonality adjustments
 */

const axios = require('axios');
const { logger } = require('../utils/logger');
const { DateTime } = require('luxon');
const { getOrSet, generateKey } = require('../utils/cache');

const FORECAST_SERVICE_URL = process.env.FORECAST_API_URL || process.env.FORECAST_SERVICE_URL || 'https://stc-forecast-engine.herokuapp.com';

// Label-to-channel mapping
const CHANNEL_PATTERNS = {
  home: ['Home'],
  digital: ['Online'],
  clubs: ['Club'],
  schools: ['School']
};

/**
 * Build SQL clause to filter by tutor (contractor) label.
 * Contractor labels are JSONB with mixed format:
 *   - Plain strings: "1099"
 *   - JSON objects: {"id": 326032, "name": "W2"}
 * Using text LIKE handles both.
 *
 * @param {string|null} tutorLabel - 'W2', '1099', or null (no filter)
 * @param {string} contractorAlias - SQL alias for the contractors table in EXISTS
 * @param {string} appointmentRef - SQL expression for the appointment ID to match against
 * @returns {string} SQL WHERE clause fragment (empty string if no filter)
 */
function buildTutorLabelFilter(tutorLabel, contractorAlias = 'c_tl', appointmentRef = 'ac.appointment_id') {
  if (!tutorLabel) return '';
  // Only allow known values to prevent SQL injection
  const allowed = { 'W2': 'W2', '1099': '1099' };
  const label = allowed[tutorLabel];
  if (!label) return '';
  return `
    AND EXISTS (
      SELECT 1 FROM appointment_contractors ac_tl
      JOIN contractors ${contractorAlias} ON ${contractorAlias}.contractor_id = ac_tl.contractor_id
      WHERE ac_tl.appointment_id = ${appointmentRef}
      AND ${contractorAlias}.labels::text LIKE '%${label}%'
    )`;
}

// Helper to determine channel from labels
function getChannelFromLabels(labels) {
  if (!labels) return 'other';
  const labelsStr = typeof labels === 'string' ? labels : JSON.stringify(labels);

  for (const [channel, patterns] of Object.entries(CHANNEL_PATTERNS)) {
    if (patterns.some(p => labelsStr.toLowerCase().includes(p.toLowerCase()))) {
      return channel;
    }
  }
  return 'other';
}

// Helper to extract market from labels
function getMarketFromLabels(labels) {
  if (!labels) return null;
  const labelsStr = typeof labels === 'string' ? labels : JSON.stringify(labels);

  const marketPatterns = [
    { pattern: /NYC|New York/i, market: 'NYC' },
    { pattern: /LA|Los Angeles/i, market: 'LA' },
    { pattern: /SF|San Francisco/i, market: 'SF' },
    { pattern: /Westside/i, market: Westside },
    { pattern: /Eastside/i, market: Eastside },
    { pattern: /Westchester/i, market: 'Westchester' },
    { pattern: /Hamptons/i, market: 'Hamptons' }
  ];

  for (const { pattern, market } of marketPatterns) {
    if (pattern.test(labelsStr)) return market;
  }
  return null;
}

class ForecastService {
  constructor(pool) {
    this.pool = pool;
  }

  /**
   * Run forecast training and generation
   */
  async runForecast(horizonDays = 90, segment = null) {
    try {
      const response = await axios.post(`${FORECAST_SERVICE_URL}/train_and_forecast`, {
        horizonDays,
        segment
      }, {
        timeout: 10000
      });

      return {
        success: true,
        ...response.data
      };
    } catch (error) {
      logger.error({ error: error.message, horizonDays, segment }, 'Forecast training error');

      if (error.code === 'ECONNABORTED' || error.message.includes('timeout')) {
        const err = new Error('Forecast service did not respond in time. The training may still be running in the background. Please check back in a few minutes.');
        err.status = 504;
        err.code = 'TIMEOUT';
        throw err;
      }

      const err = new Error(error.message || 'Failed to run forecast training');
      err.status = 500;
      err.code = 'FORECAST_ERROR';
      throw err;
    }
  }

  /**
   * Get current forecast (latest run) with metrics
   */
  async getCurrentForecast(segment = null, market = null, lessonType = null) {
    try {
      // Build segment object
      let seg = segment;
      if (typeof segment === 'string') {
        try {
          seg = JSON.parse(segment);
        } catch (e) {
          // Invalid JSON, ignore
        }
      }

      if (!seg && (market || lessonType)) {
        seg = {};
        if (market) seg.market = market;
        if (lessonType) seg.lesson_type = lessonType;
      }

      const response = await axios.get(`${FORECAST_SERVICE_URL}/current`, {
        params: seg ? { segment: JSON.stringify(seg) } : {},
        timeout: 10000
      });

      return response.data;
    } catch (error) {
      // Log error safely (handle if logger is not available)
      try {
        logger.error({ error: error.message, segment, market, lessonType }, 'Get current forecast error');
      } catch (logError) {
        logger.error({ data: [error.message, 'Logger error:', logError.message] }, 'Forecast error:');
      }

      // If service unavailable, return empty forecast
      if (error.code === 'ECONNREFUSED' || error.code === 'ETIMEDOUT' || error.code === 'ENOTFOUND' ||
          error.response?.status === 503 || error.response?.status === 502 || error.response?.status === 504) {
        return {
          run_id: null,
          run_at: null,
          metrics: { mape: 0, wape: 0, coverage_p80: 0 },
          blend_weight: 0.7,
          forecasts: []
        };
      }

      // For other errors, return empty forecast to prevent UI errors
      try {
        logger.warn({ error: error.message }, 'Forecast service error (returning empty forecast)');
      } catch (logError) {
        logger.warn({ data: error.message }, 'Forecast service error (returning empty forecast):');
      }
      return {
        run_id: null,
        run_at: null,
        metrics: { mape: 0, wape: 0, coverage_p80: 0 },
        blend_weight: 0.7,
        forecasts: []
      };
    }
  }

  /**
   * Get drilldown for a specific forecast date
   */
  async getDrilldown(date, segment = null, market = null, lessonType = null) {
    if (!date) {
      throw { status: 400, message: 'date parameter is required', code: 'MISSING_DATE' };
    }

    try {
      // Build segment object
      let seg = segment;
      if (typeof segment === 'string') {
        try {
          seg = JSON.parse(segment);
        } catch (e) {
          // Invalid JSON, ignore
        }
      }

      if (!seg && (market || lessonType)) {
        seg = {};
        if (market) seg.market = market;
        if (lessonType) seg.lesson_type = lessonType;
      }

      const response = await axios.get(`${FORECAST_SERVICE_URL}/drilldown`, {
        params: {
          date,
          ...(seg ? { segment: JSON.stringify(seg) } : {})
        },
        timeout: 10000
      });

      return response.data;
    } catch (error) {
      logger.error({ error: error.message, date, segment, market, lessonType }, 'Get drilldown error');

      // If service unavailable, return empty drilldown
      if (error.code === 'ECONNREFUSED' || error.code === 'ETIMEDOUT' || error.code === 'ENOTFOUND' ||
          error.response?.status === 503 || error.response?.status === 502 || error.response?.status === 504) {
        return { lessons: [] };
      }

      // For other errors, return empty drilldown to prevent UI errors
      logger.warn({ error: error.message }, 'Forecast service error (returning empty drilldown)');
      return { lessons: [] };
    }
  }

  /**
   * Check if training is currently running
   */
  async getTrainingStatus() {
    try {
      const response = await axios.get(`${FORECAST_SERVICE_URL}/training/status`, {
        timeout: 5000
      });
      return response.data;
    } catch (error) {
      logger.error({ error: error.message }, 'Get training status error');
      // Return default status if service unavailable
      return {
        is_running: false,
        active_tasks: 0
      };
    }
  }

  /**
   * Get historical actuals (last 6 months) for chart overlay
   */
  async getActuals(market = null, lessonType = null) {
    if (!this.pool) {
      throw new Error('Database pool not available');
    }
    try {
      const whereClauses = [];
      const params = [];
      let paramIdx = 1;

      // Calculate date range (last 6 months)
      const endDate = new Date();
      const startDate = new Date();
      startDate.setMonth(startDate.getMonth() - 6);

      params.push(startDate.toISOString(), endDate.toISOString());
      paramIdx = 3;

      if (market) {
        whereClauses.push(`EXISTS (
          SELECT 1 FROM jsonb_array_elements_text(s.labels) AS lbl 
          WHERE lbl LIKE $${paramIdx}
        )`);
        params.push(`%${market}%`);
        paramIdx++;
      }

      if (lessonType) {
        whereClauses.push(`EXISTS (
          SELECT 1 FROM jsonb_array_elements_text(s.labels) AS lbl 
          WHERE lbl LIKE $${paramIdx}
        )`);
        params.push(`%${lessonType}%`);
        paramIdx++;
      }

      const query = `
        SELECT 
          DATE(a.start AT TIME ZONE 'America/New_York') AS date,
          SUM(
            CASE
              WHEN a.charge_type = 'hourly' THEN ar.charge_rate * COALESCE(a.units, 1)
              WHEN a.charge_type = 'one-off' THEN ar.charge_rate
              WHEN a.charge_type = 'one-off-split' THEN ar.charge_rate
              WHEN a.charge_type = 'hourly-split' THEN ar.charge_rate * COALESCE(a.units, 1)
              ELSE ar.charge_rate * COALESCE(a.units, 1)
            END
          ) AS revenue
        FROM appointments a
        JOIN appointment_recipients ar ON a.appointment_id = ar.appointment_id
          AND ar.status <> 'missed'
        JOIN services s ON a.service_id = s.service_id
        WHERE a.start BETWEEN $1 AND $2
          AND a.status IN ('complete', 'cancelled-chargeable')
          ${whereClauses.length > 0 ? 'AND ' + whereClauses.join(' AND ') : ''}
        GROUP BY DATE(a.start AT TIME ZONE 'America/New_York')
        ORDER BY DATE(a.start AT TIME ZONE 'America/New_York')
      `;

      const { rows } = await this.pool.query(query, params);

      return {
        actuals: rows.map(row => ({
          date: row.date.toISOString().split('T')[0],
          revenue: parseFloat(row.revenue || 0)
        }))
      };
    } catch (error) {
      logger.error({ error: error.message, market, lessonType }, 'Get actuals error');
      const err = new Error(error.message || 'Failed to get actuals');
      err.status = 500;
      err.code = 'ACTUALS_ERROR';
      throw err;
    }
  }

  // ==========================================================================
  // ENHANCED FORECAST METHODS
  // ==========================================================================

  /**
   * Get scheduled lessons summary aggregated by channel and date (memory-efficient)
   * Used by getScenarios for KPI calculations without loading all rows
   */
  async getScheduledSummary({ startDate, endDate, channel = null, market = null, tutorLabel = null }) {
    if (!this.pool) {
      throw new Error('Database pool not available');
    }

    const start = startDate || DateTime.now().toISODate();
    const end = endDate || DateTime.now().plus({ days: 90 }).toISODate();

    // Aggregate by channel and date in SQL to avoid loading 6000+ rows
    // IMPORTANT: We use two separate aggregations to avoid Cartesian product:
    // 1. lesson_data: COUNT lessons and SUM revenue (joins appointment_recipients)
    // 2. appointment_pay: SUM tutor pay (joins appointment_contractors)
    // Then we combine them at the channel+date level
    const query = `
      WITH appointment_base AS (
        -- Base appointment data (one row per appointment)
        -- This avoids the cartesian product when joining recipients
        SELECT DISTINCT
          a.appointment_id,
          DATE(a.start AT TIME ZONE 'America/New_York') AS lesson_date,
          COALESCE(a.units, 1) AS units,
          s.dft_charge_type,
          CASE
            WHEN s.labels::text LIKE '%"Home %' THEN 'home'
            WHEN s.labels @> '"Online"'::jsonb THEN 'digital'
            WHEN s.labels::text LIKE '%"Club %' THEN 'clubs'
            WHEN s.labels::text LIKE '%"School%' THEN 'schools'
            ELSE 'other'
          END AS channel
        FROM appointments a
        JOIN services s ON a.service_id = s.service_id
        WHERE DATE(a.start AT TIME ZONE 'America/New_York') BETWEEN $1 AND $2
          AND a.status NOT IN ('complete', 'cancelled-chargeable', 'cancelled')
          AND a.is_deleted IS NOT TRUE
          AND NOT EXISTS (
            SELECT 1 FROM jsonb_array_elements_text(COALESCE(s.labels, '[]'::jsonb)) AS lbl
            WHERE lbl ILIKE '%Non teaching%' OR lbl ILIKE '%Support%'
          )
      ),
      recipient_revenue AS (
        -- Revenue per appointment (sum all recipients' charges)
        SELECT
          ar.appointment_id,
          COUNT(DISTINCT ar.recipient_id) AS student_count,
          SUM(
            CASE
              WHEN ab.dft_charge_type = 'hourly' THEN COALESCE(ar.charge_rate, 0) * ab.units
              WHEN ab.dft_charge_type = 'one-off' THEN COALESCE(ar.charge_rate, 0)
              WHEN ab.dft_charge_type = 'one-off-split' THEN COALESCE(ar.charge_rate, 0)
              WHEN ab.dft_charge_type = 'hourly-split' THEN COALESCE(ar.charge_rate, 0) * ab.units
              ELSE COALESCE(ar.charge_rate, 0) * ab.units
            END
          ) AS revenue
        FROM appointment_recipients ar
        JOIN appointment_base ab ON ar.appointment_id = ab.appointment_id
        WHERE ar.status IS NULL OR ar.status <> 'missed'
        GROUP BY ar.appointment_id
      ),
      lesson_data AS (
        -- Aggregate by channel and date (now one row per appointment)
        SELECT
          ab.lesson_date,
          ab.channel,
          COUNT(*) AS lessons,
          SUM(ab.units) AS hours,
          SUM(COALESCE(rr.student_count, 0)) AS unique_students,
          SUM(COALESCE(rr.revenue, 0)) AS expected_revenue
        FROM appointment_base ab
        LEFT JOIN recipient_revenue rr ON ab.appointment_id = rr.appointment_id
        GROUP BY ab.lesson_date, ab.channel
      ),
      recipient_counts AS (
        -- Pre-aggregate recipient counts per appointment for student premium calc
        SELECT appointment_id, COUNT(*) AS student_count
        FROM appointment_recipients
        WHERE status IS NULL OR status <> 'missed'
        GROUP BY appointment_id
      ),
      pay_data AS (
        -- Sum tutor pay per channel per date (separate aggregation)
        -- Includes base pay + student premium (sr_premium * student_count * units)
        -- Uses pre-aggregated recipient_counts instead of correlated subquery
        SELECT
          DATE(a.start AT TIME ZONE 'America/New_York') AS lesson_date,
          CASE
            WHEN s.labels::text LIKE '%"Home %' THEN 'home'
            WHEN s.labels @> '"Online"'::jsonb THEN 'digital'
            WHEN s.labels::text LIKE '%"Club %' THEN 'clubs'
            WHEN s.labels::text LIKE '%"School%' THEN 'schools'
            ELSE 'other'
          END AS channel,
          COUNT(DISTINCT ac.contractor_id) AS unique_tutors,
          SUM(
            -- Base pay
            CASE
              WHEN a.charge_type = 'hourly' THEN COALESCE(ac.pay_rate, 0) * COALESCE(a.units, 1)
              WHEN a.charge_type = 'one-off' THEN COALESCE(ac.pay_rate, 0)
              ELSE COALESCE(ac.pay_rate, 0) * COALESCE(a.units, 1)
            END
            -- Student premium: sr_premium * student_count * units
            + COALESCE(
              CASE
                WHEN s.sr_premium IS NOT NULL AND s.sr_premium > 0 THEN
                  s.sr_premium * COALESCE(rc.student_count, 0) * COALESCE(a.units, 1)
                ELSE 0
              END
            , 0)
          ) AS tutor_pay
        FROM appointments a
        JOIN services s ON a.service_id = s.service_id
        LEFT JOIN appointment_contractors ac ON a.appointment_id = ac.appointment_id
        LEFT JOIN recipient_counts rc ON rc.appointment_id = a.appointment_id
        WHERE DATE(a.start AT TIME ZONE 'America/New_York') BETWEEN $1 AND $2
          AND a.status NOT IN ('complete', 'cancelled-chargeable', 'cancelled')
          AND a.is_deleted IS NOT TRUE
          AND NOT EXISTS (
            SELECT 1 FROM jsonb_array_elements_text(COALESCE(s.labels, '[]'::jsonb)) AS lbl
            WHERE lbl ILIKE '%Non teaching%' OR lbl ILIKE '%Support%'
          )
          ${buildTutorLabelFilter(tutorLabel, 'c_tl1', 'a.appointment_id')}
        GROUP BY DATE(a.start AT TIME ZONE 'America/New_York'),
          CASE
            WHEN s.labels::text LIKE '%"Home %' THEN 'home'
            WHEN s.labels @> '"Online"'::jsonb THEN 'digital'
            WHEN s.labels::text LIKE '%"Club %' THEN 'clubs'
            WHEN s.labels::text LIKE '%"School%' THEN 'schools'
            ELSE 'other'
          END
      ),
      unique_counts AS (
        -- Compute unique students/tutors in a single pass (avoids separate query)
        SELECT
          COUNT(DISTINCT ar.recipient_id) AS unique_students,
          COUNT(DISTINCT ac.contractor_id) AS unique_tutors
        FROM appointment_base ab
        LEFT JOIN appointment_recipients ar ON ab.appointment_id = ar.appointment_id
          AND (ar.status IS NULL OR ar.status <> 'missed')
        LEFT JOIN appointment_contractors ac ON ab.appointment_id = ac.appointment_id
        ${channel && channel !== 'all' ? `WHERE ab.channel = $3` : ''}
      )
      SELECT
        ld.channel,
        ld.lesson_date AS date,
        ld.lessons,
        ld.hours,
        ld.unique_students,
        ld.expected_revenue AS revenue,
        COALESCE(pd.tutor_pay, 0) AS tutor_pay,
        COALESCE(pd.unique_tutors, 0) AS unique_tutors,
        uc.unique_students AS overall_unique_students,
        uc.unique_tutors AS overall_unique_tutors
      FROM lesson_data ld
      LEFT JOIN pay_data pd ON ld.lesson_date = pd.lesson_date AND ld.channel = pd.channel
      CROSS JOIN unique_counts uc
      ${channel && channel !== 'all' ? `WHERE ld.channel = $3` : ''}
    `;

    const params = [start, end];
    if (channel && channel !== 'all') {
      params.push(channel);
    }

    try {
      const timings = { start: Date.now() };
      const { rows } = await this.pool.query(query, params);
      timings.afterQuery = Date.now();

      // Transform into by-channel and daily structures
      const byChannel = {};
      const daily = {};

      // Extract unique counts from the first row (same value on every row via CROSS JOIN)
      const uniqueStudents = parseInt(rows[0]?.overall_unique_students) || 0;
      const uniqueTutors = parseInt(rows[0]?.overall_unique_tutors) || 0;

      for (const row of rows) {
        const ch = row.channel;
        const dateKey = row.date instanceof Date
          ? row.date.toISOString().split('T')[0]
          : row.date;

        // Initialize channel
        if (!byChannel[ch]) {
          byChannel[ch] = { lessons: 0, hours: 0, revenue: 0, tutor_pay: 0 };
        }

        // Aggregate channel totals
        byChannel[ch].lessons += parseInt(row.lessons) || 0;
        byChannel[ch].hours += parseFloat(row.hours) || 0;
        byChannel[ch].revenue += parseFloat(row.revenue) || 0;
        byChannel[ch].tutor_pay += parseFloat(row.tutor_pay) || 0;

        // Aggregate daily totals
        if (!daily[dateKey]) {
          daily[dateKey] = { date: dateKey, lessons: 0, hours: 0, revenue: 0, tutor_pay: 0 };
        }
        daily[dateKey].lessons += parseInt(row.lessons) || 0;
        daily[dateKey].hours += parseFloat(row.hours) || 0;
        daily[dateKey].revenue += parseFloat(row.revenue) || 0;
        daily[dateKey].tutor_pay += parseFloat(row.tutor_pay) || 0;
      }

      // Calculate totals from daily data, split by past vs today+future
      // Pending is further split: recent (<14 days old) vs stale (>=14 days old)
      const today = DateTime.now().toISODate();
      const twoWeeksAgo = DateTime.now().minus({ days: 14 }).toISODate();
      let totalLessons = 0, totalHours = 0, totalRevenue = 0, totalTutorPay = 0;
      let pendingLessons = 0, pendingHours = 0, pendingRevenue = 0, pendingTutorPay = 0;
      let pendingRecentLessons = 0, pendingRecentHours = 0, pendingRecentRevenue = 0, pendingRecentTutorPay = 0;
      let pendingStaleLessons = 0, pendingStaleHours = 0, pendingStaleRevenue = 0, pendingStaleTutorPay = 0;
      let futureLessons = 0, futureHours = 0, futureRevenue = 0, futureTutorPay = 0;

      for (const [dateKey, data] of Object.entries(daily)) {
        totalLessons += data.lessons;
        totalHours += data.hours;
        totalRevenue += data.revenue;
        totalTutorPay += data.tutor_pay;

        // Split into pending (past) vs scheduled (today+future)
        if (dateKey < today) {
          pendingLessons += data.lessons;
          pendingHours += data.hours;
          pendingRevenue += data.revenue;
          pendingTutorPay += data.tutor_pay;
          // Further split pending: recent (<14 days) vs stale (>=14 days)
          if (dateKey >= twoWeeksAgo) {
            pendingRecentLessons += data.lessons;
            pendingRecentHours += data.hours;
            pendingRecentRevenue += data.revenue;
            pendingRecentTutorPay += data.tutor_pay;
          } else {
            pendingStaleLessons += data.lessons;
            pendingStaleHours += data.hours;
            pendingStaleRevenue += data.revenue;
            pendingStaleTutorPay += data.tutor_pay;
          }
        } else {
          futureLessons += data.lessons;
          futureHours += data.hours;
          futureRevenue += data.revenue;
          futureTutorPay += data.tutor_pay;
        }
      }

      timings.afterLoop = Date.now();
      logger.info({
        queryTime: timings.afterQuery - timings.start,
        loopTime: timings.afterLoop - timings.afterQuery,
        rows: rows.length,
        dailyKeys: Object.keys(daily).length,
        channelKeys: Object.keys(byChannel).length,
        uniqueStudents,
        uniqueTutors,
        totalHours,
        totalTutorPay,
        pendingTutorPay,
        futureTutorPay
      }, 'getScheduledSummary: completed');

      return {
        byChannel,
        daily,
        uniqueStudents,
        uniqueTutors,
        totalHours,
        totals: {
          lessons: totalLessons,
          hours: Math.round(totalHours * 100) / 100,
          revenue: Math.round(totalRevenue * 100) / 100,
          tutor_pay: Math.round(totalTutorPay * 100) / 100,
          margin: Math.round((totalRevenue - totalTutorPay) * 100) / 100,
          // Split totals for pending completion vs scheduled
          pending_lessons: pendingLessons,
          pending_hours: Math.round(pendingHours * 100) / 100,
          pending_revenue: Math.round(pendingRevenue * 100) / 100,
          pending_tutor_pay: Math.round(pendingTutorPay * 100) / 100,
          // Pending split by age: recent (<14 days) vs stale (>=14 days)
          pending_recent_lessons: pendingRecentLessons,
          pending_recent_hours: Math.round(pendingRecentHours * 100) / 100,
          pending_recent_revenue: Math.round(pendingRecentRevenue * 100) / 100,
          pending_recent_tutor_pay: Math.round(pendingRecentTutorPay * 100) / 100,
          pending_stale_lessons: pendingStaleLessons,
          pending_stale_hours: Math.round(pendingStaleHours * 100) / 100,
          pending_stale_revenue: Math.round(pendingStaleRevenue * 100) / 100,
          pending_stale_tutor_pay: Math.round(pendingStaleTutorPay * 100) / 100,
          future_lessons: futureLessons,
          future_hours: Math.round(futureHours * 100) / 100,
          future_revenue: Math.round(futureRevenue * 100) / 100,
          future_tutor_pay: Math.round(futureTutorPay * 100) / 100
        }
      };
    } catch (error) {
      logger.error({ error: error.message, startDate, endDate, channel }, 'getScheduledSummary error');
      throw error;
    }
  }

  /**
   * Get actuals (completed lessons) for a date range
   * Returns same structure as getScheduledSummary for easy merging
   * Used by getScenarios to show progress toward targets
   */
  async getActualsForRange({ startDate, endDate, channel = null, market = null, tutorLabel = null }) {
    if (!this.pool) {
      throw new Error('Database pool not available');
    }

    const start = startDate || DateTime.now().startOf('quarter').toISODate();
    const end = endDate || DateTime.now().toISODate();

    // Query completed appointments - same structure as getScheduledSummary
    // Status IN ('complete', 'cancelled-chargeable') = lessons that happened
    const query = `
      WITH appointment_base AS (
        SELECT DISTINCT
          a.appointment_id,
          DATE(a.start AT TIME ZONE 'America/New_York') AS lesson_date,
          COALESCE(a.units, 1) AS units,
          a.charge_type,
          CASE
            WHEN s.labels::text LIKE '%"Home %' THEN 'home'
            WHEN s.labels @> '"Online"'::jsonb THEN 'digital'
            WHEN s.labels::text LIKE '%"Club %' THEN 'clubs'
            WHEN s.labels::text LIKE '%"School%' THEN 'schools'
            ELSE 'other'
          END AS channel
        FROM appointments a
        JOIN services s ON a.service_id = s.service_id
        WHERE DATE(a.start AT TIME ZONE 'America/New_York') BETWEEN $1 AND $2
          AND a.status IN ('complete', 'cancelled-chargeable')
          AND a.is_deleted IS NOT TRUE
          AND NOT EXISTS (
            SELECT 1 FROM jsonb_array_elements_text(COALESCE(s.labels, '[]'::jsonb)) AS lbl
            WHERE lbl ILIKE '%Non teaching%' OR lbl ILIKE '%Support%'
          )
      ),
      recipient_revenue AS (
        SELECT
          ar.appointment_id,
          COUNT(DISTINCT ar.recipient_id) AS student_count,
          SUM(
            CASE
              WHEN ab.charge_type = 'hourly' THEN COALESCE(ar.charge_rate, 0) * ab.units
              WHEN ab.charge_type = 'one-off' THEN COALESCE(ar.charge_rate, 0)
              WHEN ab.charge_type = 'one-off-split' THEN COALESCE(ar.charge_rate, 0)
              WHEN ab.charge_type = 'hourly-split' THEN COALESCE(ar.charge_rate, 0) * ab.units
              ELSE COALESCE(ar.charge_rate, 0) * ab.units
            END
          ) AS revenue
        FROM appointment_recipients ar
        JOIN appointment_base ab ON ar.appointment_id = ab.appointment_id
        WHERE ar.status IS NULL OR ar.status <> 'missed'
        GROUP BY ar.appointment_id
      ),
      lesson_data AS (
        SELECT
          ab.lesson_date,
          ab.channel,
          COUNT(*) AS lessons,
          SUM(ab.units) AS hours,
          SUM(COALESCE(rr.student_count, 0)) AS unique_students,
          SUM(COALESCE(rr.revenue, 0)) AS expected_revenue
        FROM appointment_base ab
        LEFT JOIN recipient_revenue rr ON ab.appointment_id = rr.appointment_id
        GROUP BY ab.lesson_date, ab.channel
      ),
      actuals_recipient_counts AS (
        -- Pre-aggregate recipient counts per appointment for student premium calc
        SELECT appointment_id, COUNT(*) AS student_count
        FROM appointment_recipients
        WHERE status IS NULL OR status <> 'missed'
        GROUP BY appointment_id
      ),
      pay_data AS (
        -- Uses pre-aggregated actuals_recipient_counts instead of correlated subquery
        SELECT
          DATE(a.start AT TIME ZONE 'America/New_York') AS lesson_date,
          CASE
            WHEN s.labels::text LIKE '%"Home %' THEN 'home'
            WHEN s.labels @> '"Online"'::jsonb THEN 'digital'
            WHEN s.labels::text LIKE '%"Club %' THEN 'clubs'
            WHEN s.labels::text LIKE '%"School%' THEN 'schools'
            ELSE 'other'
          END AS channel,
          COUNT(DISTINCT ac.contractor_id) AS unique_tutors,
          SUM(
            CASE
              WHEN a.charge_type = 'hourly' THEN COALESCE(ac.pay_rate, 0) * COALESCE(a.units, 1)
              WHEN a.charge_type = 'one-off' THEN COALESCE(ac.pay_rate, 0)
              ELSE COALESCE(ac.pay_rate, 0) * COALESCE(a.units, 1)
            END
            + COALESCE(
              CASE
                WHEN s.sr_premium IS NOT NULL AND s.sr_premium > 0 THEN
                  s.sr_premium * COALESCE(arc.student_count, 0) * COALESCE(a.units, 1)
                ELSE 0
              END
            , 0)
          ) AS tutor_pay
        FROM appointments a
        JOIN services s ON a.service_id = s.service_id
        LEFT JOIN appointment_contractors ac ON a.appointment_id = ac.appointment_id
        LEFT JOIN actuals_recipient_counts arc ON arc.appointment_id = a.appointment_id
        WHERE DATE(a.start AT TIME ZONE 'America/New_York') BETWEEN $1 AND $2
          AND a.status IN ('complete', 'cancelled-chargeable')
          AND a.is_deleted IS NOT TRUE
          AND NOT EXISTS (
            SELECT 1 FROM jsonb_array_elements_text(COALESCE(s.labels, '[]'::jsonb)) AS lbl
            WHERE lbl ILIKE '%Non teaching%' OR lbl ILIKE '%Support%'
          )
          ${buildTutorLabelFilter(tutorLabel, 'c_tl2', 'a.appointment_id')}
        GROUP BY DATE(a.start AT TIME ZONE 'America/New_York'),
          CASE
            WHEN s.labels::text LIKE '%"Home %' THEN 'home'
            WHEN s.labels @> '"Online"'::jsonb THEN 'digital'
            WHEN s.labels::text LIKE '%"Club %' THEN 'clubs'
            WHEN s.labels::text LIKE '%"School%' THEN 'schools'
            ELSE 'other'
          END
      ),
      actuals_unique_counts AS (
        -- Compute unique students/tutors in a single pass (avoids separate query)
        SELECT
          COUNT(DISTINCT ar.recipient_id) AS unique_students,
          COUNT(DISTINCT ac.contractor_id) AS unique_tutors
        FROM appointment_base ab
        LEFT JOIN appointment_recipients ar ON ab.appointment_id = ar.appointment_id
          AND (ar.status IS NULL OR ar.status <> 'missed')
        LEFT JOIN appointment_contractors ac ON ab.appointment_id = ac.appointment_id
        ${channel && channel !== 'all' ? `WHERE ab.channel = $3` : ''}
      )
      SELECT
        ld.channel,
        ld.lesson_date AS date,
        ld.lessons,
        ld.hours,
        ld.unique_students,
        ld.expected_revenue AS revenue,
        COALESCE(pd.tutor_pay, 0) AS tutor_pay,
        COALESCE(pd.unique_tutors, 0) AS unique_tutors,
        auc.unique_students AS overall_unique_students,
        auc.unique_tutors AS overall_unique_tutors
      FROM lesson_data ld
      LEFT JOIN pay_data pd ON ld.lesson_date = pd.lesson_date AND ld.channel = pd.channel
      CROSS JOIN actuals_unique_counts auc
      ${channel && channel !== 'all' ? `WHERE ld.channel = $3` : ''}
    `;

    const params = [start, end];
    if (channel && channel !== 'all') {
      params.push(channel);
    }

    try {
      const timings = { start: Date.now() };
      const { rows } = await this.pool.query(query, params);
      timings.afterQuery = Date.now();

      // Transform into by-channel and daily structures (same as getScheduledSummary)
      const byChannel = {};
      const daily = {};

      // Extract unique counts from the first row (same value on every row via CROSS JOIN)
      const uniqueStudents = parseInt(rows[0]?.overall_unique_students) || 0;
      const uniqueTutors = parseInt(rows[0]?.overall_unique_tutors) || 0;

      for (const row of rows) {
        const ch = row.channel;
        const dateKey = row.date instanceof Date
          ? row.date.toISOString().split('T')[0]
          : row.date;

        if (!byChannel[ch]) {
          byChannel[ch] = { lessons: 0, hours: 0, revenue: 0, tutor_pay: 0 };
        }

        byChannel[ch].lessons += parseInt(row.lessons) || 0;
        byChannel[ch].hours += parseFloat(row.hours) || 0;
        byChannel[ch].revenue += parseFloat(row.revenue) || 0;
        byChannel[ch].tutor_pay += parseFloat(row.tutor_pay) || 0;

        if (!daily[dateKey]) {
          daily[dateKey] = { date: dateKey, lessons: 0, hours: 0, revenue: 0, tutor_pay: 0 };
        }
        daily[dateKey].lessons += parseInt(row.lessons) || 0;
        daily[dateKey].hours += parseFloat(row.hours) || 0;
        daily[dateKey].revenue += parseFloat(row.revenue) || 0;
        daily[dateKey].tutor_pay += parseFloat(row.tutor_pay) || 0;
      }

      // Calculate totals
      let totalLessons = 0, totalHours = 0, totalRevenue = 0, totalTutorPay = 0;
      for (const ch of Object.values(byChannel)) {
        totalLessons += ch.lessons;
        totalHours += ch.hours;
        totalRevenue += ch.revenue;
        totalTutorPay += ch.tutor_pay;
      }

      timings.afterLoop = Date.now();
      logger.info({
        queryTime: timings.afterQuery - timings.start,
        loopTime: timings.afterLoop - timings.afterQuery,
        rows: rows.length,
        totalLessons,
        totalRevenue: Math.round(totalRevenue * 100) / 100,
        uniqueStudents,
        uniqueTutors
      }, 'getActualsForRange: completed');

      return {
        byChannel,
        daily,
        uniqueStudents,
        uniqueTutors,
        totals: {
          lessons: totalLessons,
          hours: Math.round(totalHours * 100) / 100,
          revenue: Math.round(totalRevenue * 100) / 100,
          tutor_pay: Math.round(totalTutorPay * 100) / 100,
          margin: Math.round((totalRevenue - totalTutorPay) * 100) / 100
        }
      };
    } catch (error) {
      logger.error({ error: error.message, startDate, endDate, channel }, 'getActualsForRange error');
      throw error;
    }
  }

  /**
   * Get projected lessons summary aggregated by channel and date (memory-efficient)
   * Used by getScenarios for KPI calculations
   */
  async getProjectedSummary({ startDate, endDate, channel = null, market = null, tutorLabel = null, applySeasonality = true }) {
    if (!this.pool) {
      throw new Error('Database pool not available');
    }

    const start = startDate || DateTime.now().toISODate();
    const end = endDate || DateTime.now().plus({ days: 90 }).toISODate();
    const methodStart = Date.now();

    // Pre-load seasonality factors to avoid N+1 queries
    const seasonalityMap = applySeasonality ? await this.loadSeasonalityFactors() : new Map();
    logger.info({ seasonalityLoadTime: Date.now() - methodStart, mapSize: seasonalityMap.size }, 'getProjectedSummary: seasonality loaded');

    // Get active job patterns with aggregated rates
    const query = `
      SELECT
        jp.service_id,
        jp.avg_days_between_lessons,
        jp.last_lesson_date,
        jp.completion_rate,
        s.labels,
        COALESCE(
          (SELECT ar.charge_rate FROM appointments a
           JOIN appointment_recipients ar ON a.appointment_id = ar.appointment_id
           WHERE a.service_id = jp.service_id AND ar.status <> 'missed'
           ORDER BY a.start DESC LIMIT 1),
          s.dft_charge_rate, 0
        ) AS charge_rate,
        COALESCE(
          (SELECT ac.pay_rate FROM appointments a
           JOIN appointment_contractors ac ON a.appointment_id = ac.appointment_id
           WHERE a.service_id = jp.service_id
           ORDER BY a.start DESC LIMIT 1),
          s.dft_contractor_rate, 0
        ) AS pay_rate
      FROM job_lesson_patterns jp
      JOIN services s ON jp.service_id = s.service_id
      WHERE s.status = 'in-progress'
        AND jp.avg_days_between_lessons IS NOT NULL
        AND jp.avg_days_between_lessons <= 30
        AND jp.last_lesson_date >= CURRENT_DATE - INTERVAL '45 days'
        ${tutorLabel ? `
        AND EXISTS (
          SELECT 1 FROM appointments a_tl
          JOIN appointment_contractors ac_tl ON a_tl.appointment_id = ac_tl.appointment_id
          JOIN contractors c_tl ON c_tl.contractor_id = ac_tl.contractor_id
          WHERE a_tl.service_id = jp.service_id
          AND c_tl.labels::text LIKE '%${tutorLabel === 'W2' ? 'W2' : '1099'}%'
          LIMIT 1
        )` : ''}
    `;

    try {
      const timings = { start: Date.now() };
      const { rows: patterns } = await this.pool.query(query);
      timings.afterQuery = Date.now();
      logger.info({ patternsQueryTime: timings.afterQuery - timings.start, patternCount: patterns.length }, 'getProjectedSummary: patterns query completed');

      const byChannel = {};
      const daily = {};
      // Use native timestamps for fast loop comparisons
      const startTs = new Date(start).getTime();
      const endTs = new Date(end).getTime();
      const msPerDay = 86400000; // 24 * 60 * 60 * 1000
      let totalIterations = 0;

      // Pre-compute ALL dates and week numbers for the range (avoid creating Date objects in loop)
      const dateCache = new Map();
      const weekCache = new Map();
      for (let ts = startTs; ts <= endTs; ts += msPerDay) {
        const d = new Date(ts);
        const dateKey = d.toISOString().slice(0, 10);
        dateCache.set(ts, dateKey);
        // Week number calculation
        const dCopy = new Date(ts);
        dCopy.setHours(0, 0, 0, 0);
        dCopy.setDate(dCopy.getDate() + 4 - (dCopy.getDay() || 7));
        const yearStart = new Date(dCopy.getFullYear(), 0, 1);
        const weekNum = Math.ceil((((dCopy - yearStart) / msPerDay) + 1) / 7);
        weekCache.set(ts, weekNum);
      }
      timings.afterDateCache = Date.now();
      logger.info({ dateCacheTime: timings.afterDateCache - timings.afterQuery, cacheSize: dateCache.size }, 'getProjectedSummary: date cache built');

      // Helper to snap timestamp to day boundary for cache lookup
      const snapToDay = (ts) => Math.floor(ts / msPerDay) * msPerDay;

      for (const pattern of patterns) {
        const jobChannel = getChannelFromLabels(pattern.labels);
        const jobMarket = getMarketFromLabels(pattern.labels);

        // Apply channel filter
        if (channel && channel !== 'all' && jobChannel !== channel) continue;
        if (market && jobMarket !== market) continue;

        const chargeRate = parseFloat(pattern.charge_rate) || 0;
        const payRate = parseFloat(pattern.pay_rate) || 0;
        // Minimum 1 day between lessons to prevent runaway loops
        const avgDays = Math.max(1, parseFloat(pattern.avg_days_between_lessons) || 7);
        const completionRate = parseFloat(pattern.completion_rate) || 0.9;
        const avgMs = Math.round(avgDays) * msPerDay;

        // Project forward using timestamps (fast native math)
        let currentTs = pattern.last_lesson_date
          ? new Date(pattern.last_lesson_date).getTime() + avgMs
          : Date.now();

        // Limit iterations per pattern to prevent runaway (max 100 lessons per pattern for 90 days)
        let patternIterations = 0;
        const maxIterations = 100;

        while (currentTs <= endTs && patternIterations < maxIterations) {
          if (currentTs >= startTs) {
            const dayTs = snapToDay(currentTs);
            const dateKey = dateCache.get(dayTs) || new Date(currentTs).toISOString().slice(0, 10);

            // Get seasonality factor from cache
            let seasonFactor = 1.0;
            if (applySeasonality && seasonalityMap.size > 0) {
              const weekNum = weekCache.get(dayTs) || 1;
              seasonFactor = this.getSeasonalityFactorFromCache(
                seasonalityMap, weekNum, jobChannel, jobMarket
              );
            }

            const adjustedRate = completionRate * seasonFactor;
            const adjustedRevenue = chargeRate * adjustedRate;
            const adjustedPay = payRate * adjustedRate;

            // Aggregate by channel
            if (!byChannel[jobChannel]) {
              byChannel[jobChannel] = { lessons: 0, revenue: 0, tutor_pay: 0, raw_lessons: 0 };
            }
            byChannel[jobChannel].lessons += adjustedRate; // fractional lessons
            byChannel[jobChannel].raw_lessons += 1;
            byChannel[jobChannel].revenue += adjustedRevenue;
            byChannel[jobChannel].tutor_pay += adjustedPay;

            // Aggregate by date
            if (!daily[dateKey]) {
              daily[dateKey] = { date: dateKey, lessons: 0, revenue: 0, tutor_pay: 0 };
            }
            daily[dateKey].lessons += adjustedRate;
            daily[dateKey].revenue += adjustedRevenue;
            daily[dateKey].tutor_pay += adjustedPay;
          }

          totalIterations++;
          patternIterations++;
          currentTs += avgMs;
        }
      }

      timings.afterLoop = Date.now();
      logger.info({
        queryTime: timings.afterQuery - timings.start,
        loopTime: timings.afterLoop - timings.afterQuery,
        patterns: patterns.length,
        totalIterations,
        dailyKeys: Object.keys(daily).length,
        channelKeys: Object.keys(byChannel).length
      }, 'getProjectedSummary: completed');

      return { byChannel, daily };
    } catch (error) {
      logger.error({ error: error.message, startDate, endDate, channel }, 'getProjectedSummary error');
      throw error;
    }
  }

  /**
   * Get scheduled (future) lessons that exist in TutorCruncher
   * These have appointment_ids and can be drilled down to TC
   */
  async getScheduledLessons({ startDate, endDate, channel = null, market = null }) {
    if (!this.pool) {
      throw new Error('Database pool not available');
    }

    const start = startDate || DateTime.now().toISODate();
    const end = endDate || DateTime.now().plus({ days: 90 }).toISODate();

    const whereClauses = [];
    const params = [start, end];
    let paramIdx = 3;

    // Channel filter
    if (channel && channel !== 'all') {
      const channelPatterns = CHANNEL_PATTERNS[channel] || [channel];
      whereClauses.push(`EXISTS (
        SELECT 1 FROM jsonb_array_elements_text(s.labels) AS lbl
        WHERE ${channelPatterns.map(() => `lbl ILIKE $${paramIdx++}`).join(' OR ')}
      )`);
      channelPatterns.forEach(p => params.push(`%${p}%`));
    }

    // Market filter
    if (market) {
      whereClauses.push(`EXISTS (
        SELECT 1 FROM jsonb_array_elements_text(s.labels) AS lbl
        WHERE lbl ILIKE $${paramIdx}
      )`);
      params.push(`%${market}%`);
      paramIdx++;
    }

    const query = `
      SELECT
        a.appointment_id,
        a.service_id,
        s.name AS job_name,
        DATE(a.start AT TIME ZONE 'America/New_York') AS scheduled_date,
        a.start AS scheduled_time,
        a.units,
        a.charge_type,
        s.dft_charge_type,
        s.labels,
        s.sr_premium,
        ar.recipient_id,
        ar.recipient_name,
        ar.paying_client_id,
        ar.paying_client_name,
        ar.charge_rate,
        ac.contractor_id,
        ac.contractor_name,
        ac.pay_rate,
        -- Calculate expected revenue
        CASE
          WHEN s.dft_charge_type = 'hourly' THEN ar.charge_rate * COALESCE(a.units, 1)
          WHEN s.dft_charge_type = 'one-off' THEN ar.charge_rate
          WHEN s.dft_charge_type = 'one-off-split' THEN ar.charge_rate
          WHEN s.dft_charge_type = 'hourly-split' THEN ar.charge_rate * COALESCE(a.units, 1)
          ELSE ar.charge_rate * COALESCE(a.units, 1)
        END AS expected_revenue,
        -- Calculate expected tutor pay (base + student premium)
        -- Uses pre-aggregated sl_rc instead of correlated subquery
        CASE
          WHEN a.charge_type = 'hourly' THEN ac.pay_rate * COALESCE(a.units, 1)
          WHEN a.charge_type = 'one-off' THEN ac.pay_rate
          ELSE ac.pay_rate * COALESCE(a.units, 1)
        END
        + COALESCE(
          CASE
            WHEN s.sr_premium IS NOT NULL AND s.sr_premium > 0 THEN
              s.sr_premium * COALESCE(sl_rc.student_count, 0) * COALESCE(a.units, 1)
            ELSE 0
          END
        , 0) AS expected_tutor_pay
      FROM appointments a
      JOIN services s ON a.service_id = s.service_id
      LEFT JOIN appointment_recipients ar ON a.appointment_id = ar.appointment_id
      LEFT JOIN appointment_contractors ac ON a.appointment_id = ac.appointment_id
      LEFT JOIN (
        SELECT appointment_id, COUNT(*) AS student_count
        FROM appointment_recipients
        WHERE status IS NULL OR status <> 'missed'
        GROUP BY appointment_id
      ) sl_rc ON sl_rc.appointment_id = a.appointment_id
      WHERE DATE(a.start AT TIME ZONE 'America/New_York') BETWEEN $1 AND $2
        AND a.status NOT IN ('complete', 'cancelled-chargeable', 'cancelled')
        AND a.is_deleted IS NOT TRUE
        AND (ar.status IS NULL OR ar.status <> 'missed')
        -- Exclude non-teaching and support
        AND NOT EXISTS (
          SELECT 1 FROM jsonb_array_elements_text(COALESCE(s.labels, '[]'::jsonb)) AS lbl
          WHERE lbl ILIKE '%Non teaching%' OR lbl ILIKE '%Support%'
        )
        ${whereClauses.length > 0 ? 'AND ' + whereClauses.join(' AND ') : ''}
      ORDER BY a.start
    `;

    try {
      const { rows } = await this.pool.query(query, params);

      return rows.map(row => ({
        source_type: 'scheduled',
        appointment_id: row.appointment_id,
        service_id: row.service_id,
        job_name: row.job_name,
        date: row.scheduled_date,
        time: row.scheduled_time,
        units: parseFloat(row.units || 1),
        recipient_name: row.recipient_name,
        paying_client_name: row.paying_client_name,
        contractor_name: row.contractor_name,
        expected_revenue: parseFloat(row.expected_revenue || 0),
        expected_tutor_pay: parseFloat(row.expected_tutor_pay || 0),
        channel: getChannelFromLabels(row.labels),
        market: getMarketFromLabels(row.labels),
        labels: row.labels,
        completion_probability: 1.0, // Scheduled = 100% confidence
        drilldown_available: true
      }));
    } catch (error) {
      logger.error({ error: error.message, startDate, endDate, channel, market }, 'getScheduledLessons error');
      throw error;
    }
  }

  /**
   * Compute lesson patterns for all active jobs
   * Stores results in job_lesson_patterns table
   */
  async computeJobPatterns() {
    if (!this.pool) {
      throw new Error('Database pool not available');
    }

    const query = `
      WITH job_lessons AS (
        SELECT
          a.service_id,
          DATE(a.start AT TIME ZONE 'America/New_York') AS lesson_date,
          EXTRACT(DOW FROM a.start) AS day_of_week,
          EXTRACT(HOUR FROM a.start) AS hour,
          a.status
        FROM appointments a
        JOIN services s ON a.service_id = s.service_id
        WHERE a.start >= NOW() - INTERVAL '90 days'
          AND a.status IN ('complete', 'cancelled-chargeable', 'cancelled')
          AND a.is_deleted IS NOT TRUE
          AND s.status = 'in-progress'
      ),
      job_stats AS (
        SELECT
          service_id,
          COUNT(*) FILTER (WHERE status IN ('complete', 'cancelled-chargeable')) AS completed_count,
          COUNT(*) AS total_count,
          MAX(lesson_date) AS last_lesson_date,
          -- Calculate average days between lessons
          CASE
            WHEN COUNT(*) FILTER (WHERE status IN ('complete', 'cancelled-chargeable')) > 1 THEN
              (MAX(lesson_date) - MIN(lesson_date))::NUMERIC /
              NULLIF(COUNT(*) FILTER (WHERE status IN ('complete', 'cancelled-chargeable')) - 1, 0)
            ELSE NULL
          END AS avg_days_between,
          -- Get mode of day of week
          MODE() WITHIN GROUP (ORDER BY day_of_week) AS typical_dow,
          -- Get mode of hour
          MODE() WITHIN GROUP (ORDER BY hour) AS typical_hour,
          -- Array of all days used
          ARRAY_AGG(DISTINCT day_of_week ORDER BY day_of_week) AS all_days
        FROM job_lessons
        WHERE status IN ('complete', 'cancelled-chargeable')
        GROUP BY service_id
        HAVING COUNT(*) >= 2  -- Need at least 2 lessons to compute pattern
      )
      INSERT INTO job_lesson_patterns (
        service_id, avg_days_between_lessons, typical_day_of_week, typical_hour,
        last_lesson_date, lesson_count_last_90_days, completion_rate, computed_at, updated_at
      )
      SELECT
        service_id,
        avg_days_between,
        all_days,
        typical_hour::INTEGER,
        last_lesson_date,
        completed_count,
        completed_count::NUMERIC / NULLIF(total_count, 0) AS completion_rate,
        NOW(),
        NOW()
      FROM job_stats
      ON CONFLICT (service_id) DO UPDATE SET
        avg_days_between_lessons = EXCLUDED.avg_days_between_lessons,
        typical_day_of_week = EXCLUDED.typical_day_of_week,
        typical_hour = EXCLUDED.typical_hour,
        last_lesson_date = EXCLUDED.last_lesson_date,
        lesson_count_last_90_days = EXCLUDED.lesson_count_last_90_days,
        completion_rate = EXCLUDED.completion_rate,
        computed_at = NOW(),
        updated_at = NOW()
      RETURNING *
    `;

    try {
      const { rows } = await this.pool.query(query);
      logger.info({ count: rows.length }, 'Computed job patterns');
      return { updated: rows.length, patterns: rows };
    } catch (error) {
      logger.error({ error: error.message }, 'computeJobPatterns error');
      throw error;
    }
  }

  /**
   * Get pattern insights for the Projected drilldown
   * Shows which jobs are projecting lessons and their patterns
   */
  async getPatternInsights({ startDate, endDate, channel = null, market = null }) {
    if (!this.pool) {
      throw new Error('Database pool not available');
    }

    const start = startDate || DateTime.now().toISODate();
    const end = endDate || DateTime.now().plus({ days: 90 }).toISODate();

    // Build channel filter
    let channelFilter = '';
    const params = [start, end];
    let paramIndex = 3;

    if (channel && channel !== 'All') {
      const channelLower = channel.toLowerCase();
      if (channelLower === 'home') {
        channelFilter = `AND s.labels::text LIKE '%"Home %' AND NOT s.labels @> '"Online"'::jsonb AND s.labels::text NOT LIKE '%"Club %' AND s.labels::text NOT LIKE '%"School%'`;
      } else if (channelLower === 'online') {
        channelFilter = `AND s.labels @> '"Online"'::jsonb`;
      } else if (channelLower === 'clubs') {
        channelFilter = `AND s.labels::text LIKE '%"Club %'`;
      } else if (channelLower === 'schools') {
        channelFilter = `AND s.labels::text LIKE '%"School%'`;
      }
    }

    const query = `
      WITH projected_patterns AS (
        SELECT
          jp.service_id,
          s.name AS job_name,
          ar.paying_client_name AS client_name,
          s.labels,
          jp.avg_days_between_lessons,
          jp.typical_day_of_week,
          jp.typical_hour,
          jp.last_lesson_date,
          jp.lesson_count_last_90_days,
          jp.completion_rate,
          jp.computed_at,
          -- Calculate how many lessons we project in the date range
          CASE
            WHEN jp.avg_days_between_lessons > 0 THEN
              CEIL(($2::date - GREATEST(jp.last_lesson_date, $1::date)) / jp.avg_days_between_lessons)
            ELSE 0
          END AS projected_lesson_count,
          -- Get total lesson revenue/pay from most recent appointment (sums all recipients/contractors)
          COALESCE(ar.total_lesson_revenue, s.dft_charge_rate, 0) AS charge_rate,
          COALESCE(ac.total_lesson_pay, s.dft_contractor_rate, 0) AS pay_rate,
          -- Extract channel from labels
          CASE
            WHEN s.labels::text LIKE '%"School%' THEN 'Schools'
            WHEN s.labels::text LIKE '%"Club %' THEN 'Clubs'
            WHEN s.labels @> '"Online"'::jsonb THEN 'Online'
            WHEN s.labels::text LIKE '%"Home %' THEN 'Home'
            ELSE 'Other'
          END AS channel
        FROM job_lesson_patterns jp
        JOIN services s ON jp.service_id = s.service_id
        -- Get TOTAL lesson revenue (sum all recipients) from most recent appointment
        LEFT JOIN LATERAL (
          SELECT
            SUM(ar.charge_rate) AS total_lesson_revenue,
            MIN(ar.paying_client_name) AS paying_client_name
          FROM (
            SELECT appointment_id
            FROM appointments
            WHERE service_id = s.service_id
            ORDER BY start DESC
            LIMIT 1
          ) latest
          JOIN appointment_recipients ar ON ar.appointment_id = latest.appointment_id
        ) ar ON true
        -- Get TOTAL lesson pay (sum all contractors) from most recent appointment
        LEFT JOIN LATERAL (
          SELECT SUM(ac.pay_rate) AS total_lesson_pay
          FROM (
            SELECT appointment_id
            FROM appointments
            WHERE service_id = s.service_id
            ORDER BY start DESC
            LIMIT 1
          ) latest
          JOIN appointment_contractors ac ON ac.appointment_id = latest.appointment_id
        ) ac ON true
        WHERE s.status = 'in-progress'
          AND jp.avg_days_between_lessons IS NOT NULL
          AND jp.avg_days_between_lessons <= 30  -- Skip irregular jobs
          AND jp.last_lesson_date >= CURRENT_DATE - INTERVAL '45 days'  -- Only active jobs
          ${channelFilter}
      )
      SELECT
        service_id,
        job_name,
        client_name,
        labels,
        avg_days_between_lessons,
        typical_day_of_week,
        typical_hour,
        last_lesson_date,
        lesson_count_last_90_days,
        completion_rate,
        projected_lesson_count,
        charge_rate,
        pay_rate,
        channel,
        -- Calculate projected revenue and pay
        ROUND(projected_lesson_count * charge_rate, 2) AS projected_revenue,
        ROUND(projected_lesson_count * pay_rate, 2) AS projected_tutor_pay
      FROM projected_patterns
      WHERE projected_lesson_count > 0
      ORDER BY projected_lesson_count DESC, job_name
      LIMIT 200
    `;

    try {
      const { rows } = await this.pool.query(query, params);

      // Format the patterns for the frontend
      const patterns = rows.map(row => ({
        source_type: 'projected',
        service_id: row.service_id,
        job_name: row.job_name || `Job #${row.service_id}`,
        client_name: row.client_name || 'Unknown',
        channel: row.channel,
        labels: row.labels,
        // Pattern details
        frequency: row.avg_days_between_lessons
          ? `Every ${Math.round(row.avg_days_between_lessons)} days`
          : 'Unknown',
        avg_days_between_lessons: parseFloat(row.avg_days_between_lessons) || 0,
        typical_days: row.typical_day_of_week || [],
        typical_hour: row.typical_hour,
        last_lesson_date: row.last_lesson_date,
        recent_lessons: row.lesson_count_last_90_days,
        completion_rate: row.completion_rate ? parseFloat(row.completion_rate) : null,
        // Projections
        projected_lessons: parseInt(row.projected_lesson_count) || 0,
        expected_revenue: parseFloat(row.projected_revenue) || 0,
        expected_tutor_pay: parseFloat(row.projected_tutor_pay) || 0,
        // For display in the table
        date: row.last_lesson_date,
        recipient_name: '-',
        contractor_name: '-',
        appointment_id: null,
      }));

      // Calculate summary stats
      const summary = {
        total_jobs: patterns.length,
        total_projected_lessons: patterns.reduce((sum, p) => sum + p.projected_lessons, 0),
        total_projected_revenue: patterns.reduce((sum, p) => sum + p.expected_revenue, 0),
        total_projected_pay: patterns.reduce((sum, p) => sum + p.expected_tutor_pay, 0),
      };

      logger.info({ count: patterns.length, startDate: start, endDate: end, channel }, 'getPatternInsights');
      return { patterns, summary };
    } catch (error) {
      logger.error({ error: error.message }, 'getPatternInsights error');
      throw error;
    }
  }

  /**
   * Get seasonality factor for a given date, channel, and market
   */
  async getSeasonalityFactor(date, channel = null, market = null) {
    if (!this.pool) return 1.0;

    const dt = typeof date === 'string' ? DateTime.fromISO(date) : DateTime.fromJSDate(date);
    const weekOfYear = dt.weekNumber;

    const query = `
      SELECT factor
      FROM seasonality_factors
      WHERE week_of_year = $1
        AND (channel IS NULL OR channel = $2)
        AND (market IS NULL OR market = $3)
      ORDER BY
        CASE WHEN channel IS NOT NULL AND market IS NOT NULL THEN 1
             WHEN channel IS NOT NULL THEN 2
             WHEN market IS NOT NULL THEN 3
             ELSE 4 END
      LIMIT 1
    `;

    try {
      const { rows } = await this.pool.query(query, [weekOfYear, channel, market]);
      return rows.length > 0 ? parseFloat(rows[0].factor) : 1.0;
    } catch (error) {
      logger.warn({ error: error.message, weekOfYear, channel, market }, 'getSeasonalityFactor error');
      return 1.0;
    }
  }

  /**
   * Load all seasonality factors into memory for efficient lookup
   * Returns a Map keyed by "week|channel|market" for O(1) lookups
   */
  async loadSeasonalityFactors() {
    if (!this.pool) return new Map();

    const query = `
      SELECT week_of_year, channel, market, factor
      FROM seasonality_factors
      ORDER BY
        CASE WHEN channel IS NOT NULL AND market IS NOT NULL THEN 1
             WHEN channel IS NOT NULL THEN 2
             WHEN market IS NOT NULL THEN 3
             ELSE 4 END
    `;

    try {
      const { rows } = await this.pool.query(query);
      const factorMap = new Map();

      for (const row of rows) {
        // Create keys at different specificity levels
        const week = row.week_of_year;
        const channel = row.channel || '*';
        const market = row.market || '*';

        // Most specific key first
        const key = `${week}|${channel}|${market}`;
        if (!factorMap.has(key)) {
          factorMap.set(key, parseFloat(row.factor));
        }
      }

      return factorMap;
    } catch (error) {
      logger.warn({ error: error.message }, 'loadSeasonalityFactors error');
      return new Map();
    }
  }

  /**
   * Look up seasonality factor from pre-loaded map
   */
  getSeasonalityFactorFromCache(factorMap, weekOfYear, channel, market) {
    // Try most specific to least specific
    const keys = [
      `${weekOfYear}|${channel}|${market}`,
      `${weekOfYear}|${channel}|*`,
      `${weekOfYear}|*|${market}`,
      `${weekOfYear}|*|*`
    ];

    for (const key of keys) {
      if (factorMap.has(key)) {
        return factorMap.get(key);
      }
    }
    return 1.0; // Default factor
  }

  /**
   * Project future lessons based on job patterns
   * Returns synthetic lessons that don't have appointment_ids
   */
  async projectLessons({ startDate, endDate, channel = null, market = null, applySeasonality = true }) {
    if (!this.pool) {
      throw new Error('Database pool not available');
    }

    const start = startDate || DateTime.now().toISODate();
    const end = endDate || DateTime.now().plus({ days: 90 }).toISODate();

    // Get active job patterns with their rates
    const query = `
      SELECT
        jp.service_id,
        jp.avg_days_between_lessons,
        jp.typical_day_of_week,
        jp.typical_hour,
        jp.last_lesson_date,
        jp.completion_rate,
        s.name AS job_name,
        s.labels,
        s.dft_charge_rate,
        s.dft_charge_type,
        s.dft_contractor_rate,
        -- Get most recent recipient charge rate
        (
          SELECT ar.charge_rate
          FROM appointments a
          JOIN appointment_recipients ar ON a.appointment_id = ar.appointment_id
          WHERE a.service_id = jp.service_id
            AND ar.status <> 'missed'
          ORDER BY a.start DESC
          LIMIT 1
        ) AS recent_charge_rate,
        -- Get most recent contractor pay rate
        (
          SELECT ac.pay_rate
          FROM appointments a
          JOIN appointment_contractors ac ON a.appointment_id = ac.appointment_id
          WHERE a.service_id = jp.service_id
          ORDER BY a.start DESC
          LIMIT 1
        ) AS recent_pay_rate
      FROM job_lesson_patterns jp
      JOIN services s ON jp.service_id = s.service_id
      WHERE s.status = 'in-progress'
        AND jp.avg_days_between_lessons IS NOT NULL
        AND jp.avg_days_between_lessons <= 30  -- Skip irregular jobs
        AND jp.last_lesson_date >= CURRENT_DATE - INTERVAL '45 days'  -- Only active jobs
    `;

    try {
      // Pre-load seasonality factors to avoid N+1 queries
      const seasonalityMap = applySeasonality ? await this.loadSeasonalityFactors() : new Map();

      const { rows: patterns } = await this.pool.query(query);
      const projections = [];

      for (const pattern of patterns) {
        const jobChannel = getChannelFromLabels(pattern.labels);
        const jobMarket = getMarketFromLabels(pattern.labels);

        // Apply channel/market filters
        if (channel && channel !== 'all' && jobChannel !== channel) continue;
        if (market && jobMarket !== market) continue;

        // Calculate rates
        const chargeRate = parseFloat(pattern.recent_charge_rate || pattern.dft_charge_rate || 0);
        const payRate = parseFloat(pattern.recent_pay_rate || pattern.dft_contractor_rate || 0);
        const avgDays = parseFloat(pattern.avg_days_between_lessons || 7);
        const completionRate = parseFloat(pattern.completion_rate || 0.9);

        // Project forward from last lesson or today
        let currentDate = pattern.last_lesson_date
          ? DateTime.fromJSDate(new Date(pattern.last_lesson_date)).plus({ days: Math.round(avgDays) })
          : DateTime.now();

        const endDt = DateTime.fromISO(end);
        const startDt = DateTime.fromISO(start);

        while (currentDate <= endDt) {
          // Only include dates within our range
          if (currentDate >= startDt) {
            // Get seasonality factor from pre-loaded cache (O(1) lookup)
            let seasonFactor = 1.0;
            if (applySeasonality && seasonalityMap.size > 0) {
              seasonFactor = this.getSeasonalityFactorFromCache(
                seasonalityMap,
                currentDate.weekNumber,
                jobChannel,
                jobMarket
              );
            }

            // Apply completion rate and seasonality
            const adjustedProbability = completionRate * seasonFactor;

            projections.push({
              source_type: 'projected',
              appointment_id: null,
              service_id: pattern.service_id,
              job_name: pattern.job_name,
              date: currentDate.toISODate(),
              time: null,
              units: 1, // Assume 1 unit per lesson
              recipient_name: null,
              paying_client_name: null,
              contractor_name: null,
              expected_revenue: chargeRate,
              expected_tutor_pay: payRate,
              channel: jobChannel,
              market: jobMarket,
              labels: pattern.labels,
              completion_probability: adjustedProbability,
              drilldown_available: false,
              pattern_basis: `Every ${Math.round(avgDays)} days`
            });
          }

          currentDate = currentDate.plus({ days: Math.round(avgDays) });
        }
      }

      return projections;
    } catch (error) {
      logger.error({ error: error.message, startDate, endDate, channel, market }, 'projectLessons error');
      throw error;
    }
  }

  /**
   * Get historical completion rates by channel (3 tiers)
   * Returns { realistic, best_case, worst_case } rate objects
   *
   * - realistic: 6-month rolling average (excl current partial month)
   * - best_case: peak monthly rate per channel (last 6 months, months with >=20 appts)
   * - worst_case: recent 4-week rolling average
   *
   * Denominator includes ALL past-due appointments (complete, cancelled, planned, awaiting-report)
   */
  async getHistoricalCompletionRates() {
    const defaults = {
      realistic: { home: 0.67, digital: 0.81, clubs: 0.96, schools: 0.81, other: 0.70 },
      best_case: { home: 0.79, digital: 0.88, clubs: 1.0, schools: 0.89, other: 0.80 },
      worst_case: { home: 0.57, digital: 0.76, clubs: 0.79, schools: 0.65, other: 0.60 }
    };

    if (!this.pool) {
      return defaults;
    }

    const channelCase = `
      CASE
        WHEN s.labels::text LIKE '%"Home %' THEN 'home'
        WHEN s.labels @> '"Online"'::jsonb THEN 'digital'
        WHEN s.labels::text LIKE '%"Club %' THEN 'clubs'
        WHEN s.labels::text LIKE '%"School%' THEN 'schools'
        ELSE 'other'
      END`;

    // Query 1: Realistic = 6-month rolling average per channel (excl current partial month)
    const realisticQuery = `
      SELECT
        ${channelCase} AS channel,
        COUNT(*) FILTER (WHERE a.status IN ('complete', 'cancelled-chargeable')) AS completed,
        COUNT(*) AS total
      FROM appointments a
      JOIN services s ON a.service_id = s.service_id
      WHERE a.start >= DATE_TRUNC('month', NOW()) - INTERVAL '6 months'
        AND a.start < DATE_TRUNC('month', NOW())
        AND a.is_deleted IS NOT TRUE
      GROUP BY channel
    `;

    // Query 2: Best case = peak monthly completion rate per channel (last 6 months, >=20 appts)
    const bestCaseQuery = `
      SELECT channel, MAX(pct) AS peak_pct
      FROM (
        SELECT
          ${channelCase} AS channel,
          DATE_TRUNC('month', a.start) AS month,
          COUNT(*) FILTER (WHERE a.status IN ('complete', 'cancelled-chargeable'))::float / NULLIF(COUNT(*), 0) AS pct,
          COUNT(*) AS total
        FROM appointments a
        JOIN services s ON a.service_id = s.service_id
        WHERE a.start >= DATE_TRUNC('month', NOW()) - INTERVAL '6 months'
          AND a.start < DATE_TRUNC('month', NOW())
          AND a.is_deleted IS NOT TRUE
        GROUP BY channel, month
      ) monthly
      WHERE total >= 20
      GROUP BY channel
    `;

    // Query 3: Worst case = recent 4-week rolling average per channel
    const worstCaseQuery = `
      SELECT
        ${channelCase} AS channel,
        COUNT(*) FILTER (WHERE a.status IN ('complete', 'cancelled-chargeable')) AS completed,
        COUNT(*) AS total
      FROM appointments a
      JOIN services s ON a.service_id = s.service_id
      WHERE a.start >= NOW() - INTERVAL '4 weeks'
        AND a.start < NOW()
        AND a.is_deleted IS NOT TRUE
      GROUP BY channel
    `;

    try {
      const [realisticResult, bestCaseResult, worstCaseResult] = await Promise.all([
        this.pool.query(realisticQuery),
        this.pool.query(bestCaseQuery),
        this.pool.query(worstCaseQuery)
      ]);

      // Build realistic rates
      const realistic = { ...defaults.realistic };
      for (const row of realisticResult.rows) {
        if (row.total > 0) {
          realistic[row.channel] = Math.round((row.completed / row.total) * 10000) / 10000;
        }
      }

      // Build best case rates
      const best_case = { ...defaults.best_case };
      for (const row of bestCaseResult.rows) {
        if (row.peak_pct != null) {
          best_case[row.channel] = Math.round(row.peak_pct * 10000) / 10000;
        }
      }

      // Build worst case rates
      const worst_case = { ...defaults.worst_case };
      for (const row of worstCaseResult.rows) {
        if (row.total > 0) {
          worst_case[row.channel] = Math.round((row.completed / row.total) * 10000) / 10000;
        }
      }

      return { realistic, best_case, worst_case };
    } catch (error) {
      logger.warn({ error: error.message }, 'getHistoricalCompletionRates error, using defaults');
      return defaults;
    }
  }

  /**
   * Get forecast scenarios (best_case, realistic, worst_case)
   * Main method for the forecast dashboard
   * Uses aggregated summaries to avoid loading 12,000+ lessons into memory
   */
  async getScenarios({ startDate, endDate, channel = null, market = null, tutorLabel = null }) {
    const start = startDate || DateTime.now().toISODate();
    const end = endDate || DateTime.now().plus({ days: 90 }).toISODate();

    // Cache forecast scenarios for 5 minutes (300s) since calculations are expensive
    const cacheKey = generateKey('forecast:scenarios', { start, end, channel, market, tutorLabel });
    return getOrSet(cacheKey, async () => {

    const timings = { start: Date.now() };

    try {
      // Use memory-efficient summary methods that aggregate in SQL/loop
      timings.beforeQueries = Date.now();

      // For actuals, query from start of period up to today (not the full range)
      const today = DateTime.now().toISODate();
      const actualsEndDate = today < end ? today : end;

      // Query prior year actuals for YoY comparison
      const priorYearStart = DateTime.fromISO(start).minus({ years: 1 }).toISODate();
      const priorYearEnd = DateTime.fromISO(end).minus({ years: 1 }).toISODate();

      const [scheduledSummary, projectedSummary, completionRates, targets, actualsSummary, priorYearActuals, historicalAvg] = await Promise.all([
        this.getScheduledSummary({ startDate: start, endDate: end, channel, market, tutorLabel }),
        this.getProjectedSummary({ startDate: start, endDate: end, channel, market, tutorLabel }),
        this.getHistoricalCompletionRates(),
        this.getTargets(),
        this.getActualsForRange({ startDate: start, endDate: actualsEndDate, channel, market, tutorLabel }),
        this.getActualsForRange({ startDate: priorYearStart, endDate: priorYearEnd, channel, market, tutorLabel }),
        this.getHistoricalAverages()
      ]);
      timings.afterQueries = Date.now();
      logger.info({
        queryTime: timings.afterQueries - timings.beforeQueries,
        scheduledChannels: Object.keys(scheduledSummary.byChannel).length,
        scheduledDays: Object.keys(scheduledSummary.daily).length,
        projectedChannels: Object.keys(projectedSummary.byChannel).length,
        projectedDays: Object.keys(projectedSummary.daily).length,
        actualsLessons: actualsSummary.totals?.lessons || 0,
        actualsRevenue: actualsSummary.totals?.revenue || 0
      }, 'getScenarios: queries completed');

      // Merge scheduled and projected by channel
      const byChannel = {};
      const allChannels = new Set([
        ...Object.keys(scheduledSummary.byChannel),
        ...Object.keys(projectedSummary.byChannel)
      ]);

      for (const ch of allChannels) {
        const scheduled = scheduledSummary.byChannel[ch] || { lessons: 0, hours: 0, revenue: 0, tutor_pay: 0 };
        const projected = projectedSummary.byChannel[ch] || { lessons: 0, hours: 0, revenue: 0, tutor_pay: 0, raw_lessons: 0 };

        byChannel[ch] = {
          scheduled: { lessons: scheduled.lessons, hours: scheduled.hours || 0, revenue: scheduled.revenue, tutor_pay: scheduled.tutor_pay },
          projected: { lessons: projected.raw_lessons || projected.lessons, hours: projected.hours || 0, revenue: projected.revenue, tutor_pay: projected.tutor_pay },
          completion_rates: {
            realistic: completionRates.realistic[ch] || 0.75,
            best_case: completionRates.best_case[ch] || 0.85,
            worst_case: completionRates.worst_case[ch] || 0.60
          }
        };
      }

      // Merge daily data
      const daily = {};
      const allDates = new Set([
        ...Object.keys(scheduledSummary.daily),
        ...Object.keys(projectedSummary.daily)
      ]);

      for (const dateKey of allDates) {
        const sch = scheduledSummary.daily[dateKey] || { lessons: 0, hours: 0, revenue: 0, tutor_pay: 0 };
        const proj = projectedSummary.daily[dateKey] || { lessons: 0, hours: 0, revenue: 0, tutor_pay: 0 };

        daily[dateKey] = {
          date: dateKey,
          scheduled_lessons: sch.lessons,
          scheduled_hours: sch.hours || 0,
          scheduled_revenue: sch.revenue,
          projected_lessons: Math.round(proj.lessons), // Round fractional projected lessons
          projected_hours: proj.hours || 0,
          projected_revenue: proj.revenue,
          scheduled_tutor_pay: sch.tutor_pay,
          projected_tutor_pay: proj.tutor_pay,
          total_tutor_pay: sch.tutor_pay + proj.tutor_pay
        };
      }

      // Count totals
      let totalScheduledLessons = 0, totalProjectedLessons = 0;
      for (const ch of Object.values(byChannel)) {
        totalScheduledLessons += ch.scheduled.lessons;
        totalProjectedLessons += ch.projected.lessons;
      }

      // Calculate totals for a given scenario's completion rates
      // scenarioKey: 'realistic' | 'best_case' | 'worst_case'
      // Completion rates apply to BOTH scheduled and projected data because
      // not all scheduled lessons will complete (cancellations, no-shows, etc.)
      const calculateScenario = (scenarioKey) => {
        let totalRevenue = 0, totalTutorPay = 0, totalLessons = 0, totalHours = 0;
        let scheduledLessonsCount = 0, projectedLessonsCount = 0;
        let scheduledHours = 0, projectedHours = 0;
        let scheduledRevenue = 0, projectedRevenue = 0;
        let scheduledTutorPay = 0, projectedTutorPay = 0;
        const channelTotals = {};

        for (const [ch, data] of Object.entries(byChannel)) {
          const rate = data.completion_rates[scenarioKey] || 0.75;
          // Realistic rates were already applied in getProjectedSummary using the realistic rate
          // For other scenarios, we need to adjust the projected values relative to realistic
          const realisticRate = data.completion_rates.realistic || 0.75;

          // Apply completion rate to scheduled data too — not all scheduled lessons will complete
          const schRev = data.scheduled.revenue * rate;
          // Projected revenue was already adjusted by realistic rate in getProjectedSummary
          // To get the raw (100%) value, divide by realistic rate, then multiply by this scenario's rate
          const projRevRaw = realisticRate > 0 ? data.projected.revenue / realisticRate : data.projected.revenue;
          const projRev = projRevRaw * rate;

          const schPay = data.scheduled.tutor_pay * rate;
          const projPayRaw = realisticRate > 0 ? data.projected.tutor_pay / realisticRate : data.projected.tutor_pay;
          const projPay = projPayRaw * rate;

          const schLessons = Math.round(data.scheduled.lessons * rate);
          const projLessonsRaw = data.projected.lessons;
          const projLessons = Math.round(projLessonsRaw * rate);

          const schHours = (data.scheduled.hours || 0) * rate;
          const projHoursRaw = data.projected.hours || 0;
          const projHours = projHoursRaw * rate;

          const chRev = schRev + projRev;
          const chPay = schPay + projPay;
          const chLessons = schLessons + projLessons;
          const chHours = schHours + projHours;

          channelTotals[ch] = {
            total_revenue: Math.round(chRev * 100) / 100,
            total_tutor_pay: Math.round(chPay * 100) / 100,
            total_lessons: chLessons,
            total_hours: Math.round(chHours * 100) / 100,
            margin: Math.round((chRev - chPay) * 100) / 100,
            margin_pct: chRev > 0 ? Math.round((1 - chPay / chRev) * 10000) / 100 : 0,
            scheduled_lessons: schLessons,
            scheduled_hours: Math.round(schHours * 100) / 100,
            projected_lessons: projLessons,
            projected_hours: Math.round(projHours * 100) / 100,
            scheduled_revenue: Math.round(schRev * 100) / 100,
            projected_revenue: Math.round(projRev * 100) / 100,
            scheduled_tutor_pay: Math.round(schPay * 100) / 100,
            projected_tutor_pay: Math.round(projPay * 100) / 100,
            completion_rate: rate
          };

          totalRevenue += chRev;
          totalTutorPay += chPay;
          totalLessons += chLessons;
          totalHours += chHours;
          scheduledLessonsCount += schLessons;
          projectedLessonsCount += projLessons;
          scheduledHours += schHours;
          projectedHours += projHours;
          scheduledRevenue += schRev;
          projectedRevenue += projRev;
          scheduledTutorPay += schPay;
          projectedTutorPay += projPay;
        }

        const totalMargin = totalRevenue - totalTutorPay;
        const marginPct = totalRevenue > 0 ? Math.round((1 - totalTutorPay / totalRevenue) * 10000) / 100 : 0;

        return {
          total_lessons: totalLessons,
          total_hours: Math.round(totalHours * 100) / 100,
          total_revenue: Math.round(totalRevenue * 100) / 100,
          total_tutor_pay: Math.round(totalTutorPay * 100) / 100,
          total_margin: Math.round(totalMargin * 100) / 100,
          margin_pct: marginPct,
          scheduled_lessons: scheduledLessonsCount,
          scheduled_hours: Math.round(scheduledHours * 100) / 100,
          projected_lessons: projectedLessonsCount,
          projected_hours: Math.round(projectedHours * 100) / 100,
          scheduled_revenue: Math.round(scheduledRevenue * 100) / 100,
          projected_revenue: Math.round(projectedRevenue * 100) / 100,
          scheduled_tutor_pay: Math.round(scheduledTutorPay * 100) / 100,
          projected_tutor_pay: Math.round(projectedTutorPay * 100) / 100,
          by_channel: channelTotals
        };
      };

      // Sort daily data
      const sortedDaily = Object.values(daily).sort((a, b) => a.date.localeCompare(b.date));

      // Calculate pace data
      const startDt = DateTime.fromISO(start);
      const endDt = DateTime.fromISO(end);
      const now = DateTime.now();

      const totalDays = Math.floor(endDt.diff(startDt, 'days').days) + 1;
      const daysElapsed = Math.max(0, Math.min(
        Math.floor(now.diff(startDt, 'days').days) + 1,
        totalDays
      ));
      const timePercent = (daysElapsed / totalDays) * 100;

      // Find quarterly revenue target (null channel = overall target)
      const quarterlyTarget = targets.find(t =>
        t.target_type === 'quarterly_revenue' &&
        !t.channel
      );
      const revenueTarget = quarterlyTarget?.target_value || null;

      // Derive lessons target from revenue target and current avg revenue per lesson.
      // This ensures consistency with Configure Quarterly Targets which derives on-the-fly.
      // Stored quarterly_lessons / weekly_lessons can go stale as historical avg changes.
      const avgRevenuePerLesson = historicalAvg?.avg_revenue_per_lesson || 95;
      const lessonsTarget = revenueTarget
        ? Math.round(Number(revenueTarget) / avgRevenuePerLesson)
        : null;

      // Calculate actuals percentage vs targets
      const actualsRevenue = actualsSummary.totals?.revenue || 0;
      const actualsLessons = actualsSummary.totals?.lessons || 0;
      const revenuePercentOfTarget = revenueTarget
        ? (actualsRevenue / revenueTarget) * 100
        : null;
      const lessonsPercentOfTarget = lessonsTarget
        ? (actualsLessons / lessonsTarget) * 100
        : null;

      // Determine pace status
      let paceStatus = 'unknown';
      let paceDelta = null;
      if (revenuePercentOfTarget !== null) {
        paceDelta = revenuePercentOfTarget - timePercent;
        if (revenuePercentOfTarget >= timePercent) {
          paceStatus = 'ahead';
        } else if (revenuePercentOfTarget >= timePercent - 5) {
          paceStatus = 'on_track';
        } else {
          paceStatus = 'behind';
        }
      }

      // Use RAW scheduled totals for progress tracking (not rate-adjusted)
      // These represent what's actually in TutorCruncher, unmodified by completion rates
      // Use future-only revenue (excludes pending) — pending is reported separately
      const rawScheduledRevenue = scheduledSummary.totals?.future_revenue || 0;
      // Use future-only lessons (excludes pending) — pending is reported separately
      const rawScheduledLessons = scheduledSummary.totals?.future_lessons || 0;

      return {
        run_at: new Date().toISOString(),
        horizon_start: start,
        horizon_end: end,
        channel_filter: channel,
        market_filter: market,

        // Actuals data (completed lessons in the period)
        actuals: {
          total_lessons: actualsLessons,
          total_hours: actualsSummary.totals?.hours || 0,
          total_revenue: actualsRevenue,
          total_tutor_pay: actualsSummary.totals?.tutor_pay || 0,
          total_margin: actualsSummary.totals?.margin || 0,
          by_channel: actualsSummary.byChannel || {}
        },

        // Progress tracking (actuals + RAW scheduled toward target)
        // Uses raw scheduled values (not rate-adjusted) for objective progress tracking
        progress: {
          completed_lessons: actualsLessons,
          scheduled_lessons: rawScheduledLessons,
          total_lessons_toward_target: actualsLessons + rawScheduledLessons,
          lessons_target: lessonsTarget,
          completed_revenue: actualsRevenue,
          scheduled_revenue: Math.round(rawScheduledRevenue * 100) / 100,
          total_revenue_toward_target: Math.round((actualsRevenue + rawScheduledRevenue) * 100) / 100,
          revenue_target: revenueTarget,
          completed_hours: actualsSummary.totals?.hours || 0,
          scheduled_hours: scheduledSummary.totals?.future_hours || 0,
          completed_tutor_pay: actualsSummary.totals?.tutor_pay || 0,
          // Split scheduled into pending completion (past) vs scheduled (today+future)
          pending_completion_lessons: scheduledSummary.totals?.pending_lessons || 0,
          pending_completion_hours: scheduledSummary.totals?.pending_hours || 0,
          pending_completion_revenue: scheduledSummary.totals?.pending_revenue || 0,
          pending_completion_tutor_pay: scheduledSummary.totals?.pending_tutor_pay || 0,
          // Pending age split for realistic forecast
          pending_recent_lessons: scheduledSummary.totals?.pending_recent_lessons || 0,
          pending_recent_hours: scheduledSummary.totals?.pending_recent_hours || 0,
          pending_recent_revenue: scheduledSummary.totals?.pending_recent_revenue || 0,
          pending_recent_tutor_pay: scheduledSummary.totals?.pending_recent_tutor_pay || 0,
          pending_stale_lessons: scheduledSummary.totals?.pending_stale_lessons || 0,
          pending_stale_hours: scheduledSummary.totals?.pending_stale_hours || 0,
          pending_stale_revenue: scheduledSummary.totals?.pending_stale_revenue || 0,
          pending_stale_tutor_pay: scheduledSummary.totals?.pending_stale_tutor_pay || 0,
          scheduled_tutor_pay: scheduledSummary.totals?.future_tutor_pay || 0,
          total_tutor_pay: Math.round(((actualsSummary.totals?.tutor_pay || 0) + (scheduledSummary.totals?.tutor_pay || 0)) * 100) / 100,
          avg_revenue_per_lesson: avgRevenuePerLesson
        },

        // Pace indicators
        pace: {
          days_elapsed: daysElapsed,
          total_days: totalDays,
          time_percent: Math.round(timePercent * 10) / 10,
          revenue_percent: revenuePercentOfTarget !== null
            ? Math.round(revenuePercentOfTarget * 10) / 10
            : null,
          lessons_percent: lessonsPercentOfTarget !== null
            ? Math.round(lessonsPercentOfTarget * 10) / 10
            : null,
          status: paceStatus,
          delta: paceDelta !== null ? Math.round(paceDelta * 10) / 10 : null
        },

        // Prior year actuals for YoY comparison
        prior_year: {
          revenue: priorYearActuals.totals?.revenue || 0,
          lessons: priorYearActuals.totals?.lessons || 0,
          tutor_pay: priorYearActuals.totals?.tutor_pay || 0,
          profit: priorYearActuals.totals?.margin || 0,
          start: priorYearStart,
          end: priorYearEnd
        },

        best_case: {
          ...calculateScenario('best_case'),
          completion_rates: completionRates.best_case,
          unique_students: scheduledSummary.uniqueStudents || 0,
          unique_tutors: scheduledSummary.uniqueTutors || 0
        },
        realistic: {
          ...calculateScenario('realistic'),
          completion_rates: completionRates.realistic,
          unique_students: scheduledSummary.uniqueStudents || 0,
          unique_tutors: scheduledSummary.uniqueTutors || 0
        },
        worst_case: {
          ...calculateScenario('worst_case'),
          completion_rates: completionRates.worst_case,
          unique_students: scheduledSummary.uniqueStudents || 0,
          unique_tutors: scheduledSummary.uniqueTutors || 0
        },
        // Backward compat alias
        optimistic: {
          ...calculateScenario('best_case'),
          completion_rates: completionRates.best_case,
          completion_rate: 1.0,
          unique_students: scheduledSummary.uniqueStudents || 0,
          unique_tutors: scheduledSummary.uniqueTutors || 0
        },
        daily: sortedDaily,
        targets,
        lesson_count: {
          scheduled: totalScheduledLessons,
          projected: totalProjectedLessons,
          total: totalScheduledLessons + totalProjectedLessons
        },
        // Historical profit margin (includes adhoc tutor pay) for accurate profit forecasting
        historical_profit_margin: historicalAvg.profit_margin || null
      };
    } catch (error) {
      logger.error({ error: error.message, startDate, endDate, channel, market }, 'getScenarios error');
      throw error;
    }
    }, 300); // 5 minute TTL
  }

  /**
   * Get drilldown data for a specific date
   * Shows scheduled and projected lessons separately
   */
  async getForecastDrilldown({ date, channel = null, market = null }) {
    if (!date) {
      throw { status: 400, message: 'date parameter is required' };
    }

    const dateStr = typeof date === 'string' ? date : date.toISOString().split('T')[0];

    // Get scheduled lessons for that date
    const scheduled = await this.getScheduledLessons({
      startDate: dateStr,
      endDate: dateStr,
      channel,
      market
    });

    // Get projected lessons for that date
    const projected = await this.projectLessons({
      startDate: dateStr,
      endDate: dateStr,
      channel,
      market
    });

    // Filter projections to exclude jobs with scheduled lessons on same day
    const scheduledServiceIds = new Set(scheduled.map(l => l.service_id));
    const filteredProjected = projected.filter(l => !scheduledServiceIds.has(l.service_id));

    return {
      date: dateStr,
      scheduled_lessons: scheduled,
      projected_lessons: filteredProjected,
      totals: {
        scheduled_count: scheduled.length,
        scheduled_revenue: scheduled.reduce((sum, l) => sum + l.expected_revenue, 0),
        projected_count: filteredProjected.length,
        projected_revenue: filteredProjected.reduce((sum, l) => sum + l.expected_revenue * l.completion_probability, 0)
      }
    };
  }

  // ==========================================================================
  // STALE JOBS
  // ==========================================================================

  /**
   * Get jobs marked "in progress" with no lessons in 45+ days
   */
  async getStaleJobs({ channel = null, market = null } = {}) {
    if (!this.pool) {
      throw new Error('Database pool not available');
    }

    let query = `SELECT * FROM v_stale_jobs WHERE 1=1`;
    const params = [];
    let paramIdx = 1;

    if (channel && channel !== 'all') {
      query += ` AND channel = $${paramIdx}`;
      params.push(channel);
      paramIdx++;
    }

    if (market) {
      query += ` AND market = $${paramIdx}`;
      params.push(market);
      paramIdx++;
    }

    query += ` ORDER BY days_since_last_lesson DESC NULLS FIRST`;

    try {
      const { rows } = await this.pool.query(query, params);

      // Group by channel for summary
      const byChannel = {};
      for (const job of rows) {
        const ch = job.channel || 'other';
        byChannel[ch] = (byChannel[ch] || 0) + 1;
      }

      return {
        stale_jobs: rows.map(job => ({
          service_id: job.service_id,
          job_name: job.job_name,
          status: job.status,
          client_id: job.client_id,
          client_name: job.client_name,
          last_lesson_date: job.last_lesson_date,
          days_since_last_lesson: job.days_since_last_lesson,
          total_lessons: job.total_lessons,
          channel: job.channel,
          market: job.market,
          labels: job.labels,
          dft_charge_rate: job.dft_charge_rate,
          tc_url: `https://account.acmeops.com/services/${job.service_id}/`
        })),
        total_count: rows.length,
        by_channel: byChannel
      };
    } catch (error) {
      logger.error({ error: error.message, channel, market }, 'getStaleJobs error');
      throw error;
    }
  }

  /**
   * Get paginated drilldown list combining scheduled + projected lessons
   * Optimized to avoid fetching all data at once
   * Supports search by job name, tutor name, or appointment ID
   */
  async getDrilldownList({ startDate, endDate, channel = null, market = null, tutorLabel = null, page = 0, limit = 100, search = null, includeCompleted = false }) {
    const start = startDate || DateTime.now().toISODate();
    const end = endDate || DateTime.now().plus({ days: 90 }).toISODate();
    const offset = page * limit;

    // Build filter clauses FIRST so we can use them in both count and data queries
    const filterClauses = [];
    const filterParams = [start, end];
    let filterParamIdx = 3;

    // Channel filter
    if (channel && channel !== 'all') {
      const channelPatterns = CHANNEL_PATTERNS[channel] || [channel];
      filterClauses.push(`EXISTS (
        SELECT 1 FROM jsonb_array_elements_text(s.labels) AS lbl
        WHERE ${channelPatterns.map(() => `lbl ILIKE $${filterParamIdx++}`).join(' OR ')}
      )`);
      channelPatterns.forEach(p => filterParams.push(`%${p}%`));
    }

    // Market filter
    if (market) {
      filterClauses.push(`EXISTS (
        SELECT 1 FROM jsonb_array_elements_text(s.labels) AS lbl
        WHERE lbl ILIKE $${filterParamIdx}
      )`);
      filterParams.push(`%${market}%`);
      filterParamIdx++;
    }

    // Tutor label filter (W2/1099)
    if (tutorLabel) {
      const tutorLabelSQL = buildTutorLabelFilter(tutorLabel, 'c_drilldown', 'a.appointment_id');
      if (tutorLabelSQL) {
        // Strip leading AND since filterClauses handles joining
        filterClauses.push(tutorLabelSQL.trim().replace(/^AND\s+/i, ''));
      }
    }

    // Search filter - search by job name, tutor name, or appointment ID
    if (search && search.trim()) {
      const searchTerm = search.trim();
      // Check if search is numeric (appointment ID)
      const isNumericSearch = /^\d+$/.test(searchTerm);

      if (isNumericSearch) {
        // Search by appointment ID (exact or partial match)
        filterClauses.push(`a.appointment_id::text LIKE $${filterParamIdx}`);
        filterParams.push(`%${searchTerm}%`);
        filterParamIdx++;
      } else {
        // Search by job name or tutor name
        filterClauses.push(`(
          s.name ILIKE $${filterParamIdx}
          OR EXISTS (
            SELECT 1 FROM appointment_contractors ac2
            WHERE ac2.appointment_id = a.appointment_id
              AND ac2.contractor_name ILIKE $${filterParamIdx}
          )
        )`);
        filterParams.push(`%${searchTerm}%`);
        filterParamIdx++;
      }
    }

    const filterClauseSQL = filterClauses.length > 0 ? 'AND ' + filterClauses.join(' AND ') : '';

    // Status filter: scheduled-only (default) or all statuses (for CSV export)
    const statusFilter = includeCompleted
      ? `AND a.status NOT IN ('cancelled')`
      : `AND a.status NOT IN ('complete', 'cancelled-chargeable', 'cancelled')`;

    // Get total count of lessons WITH channel/market filters applied
    // A lesson = one appointment (not one recipient)
    const countQuery = `
      SELECT COUNT(DISTINCT a.appointment_id) as scheduled_count
      FROM appointments a
      JOIN services s ON a.service_id = s.service_id
      WHERE DATE(a.start AT TIME ZONE 'America/New_York') BETWEEN $1 AND $2
        ${statusFilter}
        AND a.is_deleted IS NOT TRUE
        AND NOT EXISTS (
          SELECT 1 FROM jsonb_array_elements_text(COALESCE(s.labels, '[]'::jsonb)) AS lbl
          WHERE lbl ILIKE '%Non teaching%' OR lbl ILIKE '%Support%'
        )
        ${filterClauseSQL}
    `;

    const countResult = await this.pool.query(countQuery, filterParams);
    const scheduledCount = parseInt(countResult.rows[0]?.scheduled_count || 0);

    // Build params for paginated query (reuse filter params + add pagination)
    const params = [...filterParams];
    let paramIdx = filterParamIdx;

    // Add pagination params
    params.push(limit);
    params.push(offset);

    // Use JOINs to pre-aggregated subqueries instead of correlated subqueries per row
    // dl_recip: first recipient name + paying client, revenue sum, student count
    // dl_contr: first contractor name + pay rate
    const query = `
      SELECT DISTINCT ON (a.appointment_id, a.start)
        a.appointment_id,
        a.service_id,
        a.status AS appointment_status,
        s.name AS job_name,
        DATE(a.start AT TIME ZONE 'America/New_York') AS scheduled_date,
        a.start AS scheduled_time,
        dl_recip.recipient_name,
        dl_recip.paying_client_name,
        dl_contr.contractor_name,
        dl_recip.expected_revenue,
        -- Calculate tutor pay: aggregated base pay (all contractors) + student premium
        COALESCE(dl_contr.total_base_pay, 0)
          + COALESCE(s.sr_premium, 0) * COALESCE(dl_recip.student_count, 0) * COALESCE(a.units, 1)
          AS expected_tutor_pay,
        s.labels
      FROM appointments a
      JOIN services s ON a.service_id = s.service_id
      -- Pre-aggregated recipient data: first name, paying client, revenue total, student count
      LEFT JOIN (
        SELECT
          ar2.appointment_id,
          MIN(ar2.recipient_name) AS recipient_name,
          MIN(ar2.paying_client_name) AS paying_client_name,
          COUNT(*) AS student_count,
          SUM(
            CASE
              WHEN sv.dft_charge_type = 'hourly' THEN ar2.charge_rate * COALESCE(ap.units, 1)
              WHEN sv.dft_charge_type = 'hourly-split' THEN ar2.charge_rate * COALESCE(ap.units, 1)
              WHEN sv.dft_charge_type IN ('one-off', 'one-off-split') THEN ar2.charge_rate
              ELSE ar2.charge_rate * COALESCE(ap.units, 1)
            END
          ) AS expected_revenue
        FROM appointment_recipients ar2
        JOIN appointments ap ON ap.appointment_id = ar2.appointment_id
        JOIN services sv ON sv.service_id = ap.service_id
        WHERE (ar2.status IS NULL OR ar2.status <> 'missed')
        GROUP BY ar2.appointment_id
      ) dl_recip ON dl_recip.appointment_id = a.appointment_id
      -- Pre-aggregated contractor data: first contractor name + total base pay (all contractors)
      LEFT JOIN (
        SELECT
          ac2.appointment_id,
          MIN(ac2.contractor_name) AS contractor_name,
          SUM(
            CASE
              WHEN ap.charge_type = 'hourly' THEN COALESCE(ac2.pay_rate, 0) * COALESCE(ap.units, 1)
              WHEN ap.charge_type = 'one-off' THEN COALESCE(ac2.pay_rate, 0)
              ELSE COALESCE(ac2.pay_rate, 0) * COALESCE(ap.units, 1)
            END
          ) AS total_base_pay
        FROM appointment_contractors ac2
        JOIN appointments ap ON ap.appointment_id = ac2.appointment_id
        GROUP BY ac2.appointment_id
      ) dl_contr ON dl_contr.appointment_id = a.appointment_id
      WHERE DATE(a.start AT TIME ZONE 'America/New_York') BETWEEN $1 AND $2
        ${statusFilter}
        AND a.is_deleted IS NOT TRUE
        AND dl_recip.appointment_id IS NOT NULL
        AND NOT EXISTS (
          SELECT 1 FROM jsonb_array_elements_text(COALESCE(s.labels, '[]'::jsonb)) AS lbl
          WHERE lbl ILIKE '%Non teaching%' OR lbl ILIKE '%Support%'
        )
        ${filterClauseSQL}
      ORDER BY a.appointment_id, a.start
      LIMIT $${paramIdx} OFFSET $${paramIdx + 1}
    `;

    try {
      const { rows } = await this.pool.query(query, params);

      const now = DateTime.now().setZone('America/New_York').startOf('day');
      const lessons = rows.map(row => {
        const isCompleted = row.appointment_status === 'complete' || row.appointment_status === 'cancelled-chargeable';
        const dateStr = row.scheduled_date instanceof Date ? row.scheduled_date.toISOString().slice(0, 10) : String(row.scheduled_date);
        const lessonDate = DateTime.fromISO(dateStr, { zone: 'America/New_York' });
        const isPastDue = lessonDate.isValid && lessonDate < now;
        return {
        source_type: isCompleted ? 'completed' : (isPastDue ? 'pending' : 'scheduled'),
        appointment_id: row.appointment_id,
        service_id: row.service_id,
        job_name: row.job_name,
        date: row.scheduled_date,
        time: row.scheduled_time,
        recipient_name: row.recipient_name,
        paying_client_name: row.paying_client_name,
        contractor_name: row.contractor_name,
        expected_revenue: parseFloat(row.expected_revenue || 0),
        expected_tutor_pay: parseFloat(row.expected_tutor_pay || 0),
        channel: getChannelFromLabels(row.labels),
        market: getMarketFromLabels(row.labels),
      };
      });

      // If we've exhausted scheduled lessons and need more, add projected
      // Note: For now, just return scheduled with count to avoid memory issues
      // Projected lessons would require generating them which we want to avoid

      return {
        lessons,
        pagination: {
          page,
          limit,
          total: scheduledCount,
          total_pages: Math.ceil(scheduledCount / limit),
          has_more: (offset + rows.length) < scheduledCount,
        },
        note: 'Showing scheduled lessons only for performance. Use scenarios endpoint for projected data.'
      };
    } catch (error) {
      logger.error({ error: error.message, startDate, endDate, channel, market, page, limit }, 'getDrilldownList error');
      throw error;
    }
  }

  // ==========================================================================
  // TARGET MANAGEMENT
  // ==========================================================================

  /**
   * Get all forecast targets
   */
  async getTargets({ year = null } = {}) {
    if (!this.pool) return [];

    const targetYear = year || new Date().getFullYear();

    const query = `
      SELECT *
      FROM forecast_targets
      WHERE year = $1
        AND (effective_to IS NULL OR effective_to >= CURRENT_DATE)
      ORDER BY target_type, channel, quarter
    `;

    try {
      const { rows } = await this.pool.query(query, [targetYear]);
      return rows;
    } catch (error) {
      logger.error({ error: error.message, year: targetYear }, 'getTargets error');
      return [];
    }
  }

  /**
   * Create a new target
   */
  async createTarget({ target_type, channel, market, target_value, quarter, year, created_by }) {
    if (!this.pool) {
      throw new Error('Database pool not available');
    }

    const query = `
      INSERT INTO forecast_targets (target_type, channel, market, target_value, quarter, year, created_by)
      VALUES ($1, $2, $3, $4, $5, $6, $7)
      ON CONFLICT (target_type, channel, market, quarter, year)
      DO UPDATE SET
        target_value = EXCLUDED.target_value,
        updated_at = NOW()
      RETURNING *
    `;

    try {
      const { rows } = await this.pool.query(query, [
        target_type, channel || null, market || null, target_value, quarter || null, year, created_by
      ]);
      return rows[0];
    } catch (error) {
      logger.error({ error: error.message, target_type, channel, target_value }, 'createTarget error');
      throw error;
    }
  }

  /**
   * Update an existing target
   */
  async updateTarget(id, { target_value, effective_to }) {
    if (!this.pool) {
      throw new Error('Database pool not available');
    }

    const updates = [];
    const params = [id];
    let paramIdx = 2;

    if (target_value !== undefined) {
      updates.push(`target_value = $${paramIdx++}`);
      params.push(target_value);
    }

    if (effective_to !== undefined) {
      updates.push(`effective_to = $${paramIdx++}`);
      params.push(effective_to);
    }

    if (updates.length === 0) {
      throw { status: 400, message: 'No fields to update' };
    }

    const query = `
      UPDATE forecast_targets
      SET ${updates.join(', ')}, updated_at = NOW()
      WHERE id = $1
      RETURNING *
    `;

    try {
      const { rows } = await this.pool.query(query, params);
      return rows[0];
    } catch (error) {
      logger.error({ error: error.message, id }, 'updateTarget error');
      throw error;
    }
  }

  /**
   * Delete a target
   */
  async deleteTarget(id) {
    if (!this.pool) {
      throw new Error('Database pool not available');
    }

    const query = `DELETE FROM forecast_targets WHERE id = $1 RETURNING *`;

    try {
      const { rows } = await this.pool.query(query, [id]);
      return rows[0];
    } catch (error) {
      logger.error({ error: error.message, id }, 'deleteTarget error');
      throw error;
    }
  }

  // ==========================================================================
  // QUARTERLY TARGET PLANNING
  // ==========================================================================

  /**
   * Get historical averages for target planning
   * Returns avg revenue per lesson and channel revenue mix
   */
  async getHistoricalAverages({ lookbackMonths = 6 } = {}) {
    if (!this.pool) {
      throw new Error('Database pool not available');
    }

    const startDate = DateTime.now().minus({ months: lookbackMonths }).toISODate();

    // Get overall averages and channel breakdown
    // IMPORTANT: Count APPOINTMENTS as lessons, not recipients (students)
    // A sibling lesson with 2 kids = 1 lesson, not 2
    const query = `
      WITH appointment_data AS (
        SELECT
          a.appointment_id,
          CASE
            WHEN s.labels::text LIKE '%"Home %' THEN 'home'
            WHEN s.labels @> '"Online"'::jsonb THEN 'digital'
            WHEN s.labels::text LIKE '%"Club %' THEN 'clubs'
            WHEN s.labels::text LIKE '%"School%' THEN 'schools'
            ELSE 'other'
          END AS channel,
          -- Sum all recipient charges for this appointment
          SUM(
            CASE
              WHEN s.dft_charge_type = 'hourly' THEN COALESCE(ar.charge_rate, 0) * a.units
              ELSE COALESCE(ar.charge_rate, 0)
            END
          ) AS revenue
        FROM appointments a
        JOIN services s ON a.service_id = s.service_id
        JOIN appointment_recipients ar ON a.appointment_id = ar.appointment_id
        WHERE DATE(a.start AT TIME ZONE 'America/New_York') >= $1
          AND a.status IN ('complete', 'cancelled-chargeable')
          AND a.is_deleted IS NOT TRUE
        GROUP BY a.appointment_id, s.labels, s.dft_charge_type
      ),
      channel_totals AS (
        SELECT
          channel,
          COUNT(*) AS lessons,
          SUM(revenue) AS revenue,
          AVG(revenue) AS avg_revenue_per_lesson
        FROM appointment_data
        GROUP BY channel
      ),
      overall AS (
        SELECT
          COUNT(*) AS total_lessons,
          SUM(revenue) AS total_revenue,
          AVG(revenue) AS avg_revenue_per_lesson
        FROM appointment_data
      )
      SELECT
        o.total_lessons,
        o.total_revenue,
        ROUND(o.avg_revenue_per_lesson::numeric, 2) AS avg_revenue_per_lesson,
        json_agg(
          json_build_object(
            'channel', c.channel,
            'lessons', c.lessons,
            'revenue', ROUND(c.revenue::numeric, 2),
            'avg_per_lesson', ROUND(c.avg_revenue_per_lesson::numeric, 2),
            'percentage', ROUND((c.revenue / NULLIF(o.total_revenue, 0) * 100)::numeric, 1)
          ) ORDER BY c.revenue DESC
        ) AS channel_breakdown
      FROM overall o, channel_totals c
      GROUP BY o.total_lessons, o.total_revenue, o.avg_revenue_per_lesson
    `;

    // Query historical profit margin including adhoc tutor pay
    // This gives us a true profit margin % we can apply to forecast revenue
    // Uses separate CTEs for revenue and pay to avoid cartesian products
    const profitMarginQuery = `
      WITH appointment_base AS (
        SELECT a.appointment_id, a.charge_type, COALESCE(a.units, 1) AS units
        FROM appointments a
        WHERE DATE(a.start AT TIME ZONE 'America/New_York') >= $1
          AND a.status IN ('complete', 'cancelled-chargeable')
          AND a.is_deleted IS NOT TRUE
      ),
      recipient_revenue AS (
        SELECT SUM(
          CASE
            WHEN ab.charge_type IN ('hourly', 'hourly-split') THEN COALESCE(ar.charge_rate, 0) * ab.units
            ELSE COALESCE(ar.charge_rate, 0)
          END
        ) AS total_revenue
        FROM appointment_recipients ar
        JOIN appointment_base ab ON ar.appointment_id = ab.appointment_id
        WHERE ar.status IS NULL OR ar.status <> 'missed'
      ),
      contractor_pay AS (
        SELECT SUM(
          CASE
            WHEN ab.charge_type = 'hourly' THEN COALESCE(ac.pay_rate, 0) * ab.units
            ELSE COALESCE(ac.pay_rate, 0)
          END
        ) AS total_tutor_pay
        FROM appointment_contractors ac
        JOIN appointment_base ab ON ac.appointment_id = ab.appointment_id
      ),
      adhoc_pay AS (
        SELECT
          COALESCE(SUM(COALESCE(pc.amount, achg.pay_contractor, 0)), 0) AS total_adhoc_pay
        FROM adhoc_charges achg
        LEFT JOIN payment_order_charges pc ON pc.adhoc_charge_id = achg.id
        WHERE achg.date_occurred >= $1
      )
      SELECT
        rr.total_revenue,
        cp.total_tutor_pay,
        ap.total_adhoc_pay
      FROM recipient_revenue rr, contractor_pay cp, adhoc_pay ap
    `;

    try {
      const [{ rows }, profitRows] = await Promise.all([
        this.pool.query(query, [startDate]),
        this.pool.query(profitMarginQuery, [startDate])
      ]);

      // Calculate historical profit margin (accounting for adhoc pay)
      const profitRow = profitRows.rows[0] || {};
      const histRevenue = parseFloat(profitRow.total_revenue) || 0;
      const histTutorPay = parseFloat(profitRow.total_tutor_pay) || 0;
      const histAdhocPay = parseFloat(profitRow.total_adhoc_pay) || 0;
      const histProfit = histRevenue - histTutorPay - histAdhocPay;
      const histProfitMarginPct = histRevenue > 0 ? (histProfit / histRevenue) * 100 : 50;
      const histAdhocPct = histRevenue > 0 ? (histAdhocPay / histRevenue) * 100 : 0;
      const histTutorPayPct = histRevenue > 0 ? (histTutorPay / histRevenue) * 100 : 0;

      if (!rows.length || !rows[0].total_lessons) {
        // Return defaults if no historical data
        return {
          avg_revenue_per_lesson: 95,
          total_lessons: 0,
          total_revenue: 0,
          channel_mix: {
            home: 45,
            digital: 35,
            clubs: 15,
            schools: 5
          },
          lookback_months: lookbackMonths,
          profit_margin: {
            profit_margin_pct: histProfitMarginPct,
            tutor_pay_pct: histTutorPayPct,
            adhoc_pay_pct: histAdhocPct,
            total_revenue: histRevenue,
            total_tutor_pay: histTutorPay,
            total_adhoc_pay: histAdhocPay,
            total_profit: histProfit
          }
        };
      }

      const row = rows[0];
      const channelMix = {};
      const channelAvgRevenue = {};

      for (const ch of row.channel_breakdown || []) {
        if (ch.channel !== 'other') {
          channelMix[ch.channel] = ch.percentage;
          channelAvgRevenue[ch.channel] = parseFloat(ch.avg_per_lesson) || 0;
        }
      }

      // Normalize mix to 100%
      const total = Object.values(channelMix).reduce((a, b) => a + b, 0);
      if (total > 0 && total !== 100) {
        for (const ch of Object.keys(channelMix)) {
          channelMix[ch] = Math.round(channelMix[ch] / total * 100);
        }
      }

      return {
        avg_revenue_per_lesson: parseFloat(row.avg_revenue_per_lesson) || 95,
        total_lessons: parseInt(row.total_lessons) || 0,
        total_revenue: parseFloat(row.total_revenue) || 0,
        channel_mix: channelMix,
        channel_avg_revenue: channelAvgRevenue,
        channel_breakdown: row.channel_breakdown,
        lookback_months: lookbackMonths,
        profit_margin: {
          profit_margin_pct: Math.round(histProfitMarginPct * 100) / 100,
          tutor_pay_pct: Math.round(histTutorPayPct * 100) / 100,
          adhoc_pay_pct: Math.round(histAdhocPct * 100) / 100,
          total_revenue: Math.round(histRevenue * 100) / 100,
          total_tutor_pay: Math.round(histTutorPay * 100) / 100,
          total_adhoc_pay: Math.round(histAdhocPay * 100) / 100,
          total_profit: Math.round(histProfit * 100) / 100
        }
      };
    } catch (error) {
      logger.error({ error: error.message }, 'getHistoricalAverages error');
      throw error;
    }
  }

  /**
   * Get quarterly actuals for a specific quarter (for historical reference)
   */
  async getQuarterlyActuals({ year, quarter }) {
    if (!this.pool) {
      throw new Error('Database pool not available');
    }

    // Calculate quarter date range
    const startMonth = (quarter - 1) * 3 + 1;
    const startDate = DateTime.fromObject({ year, month: startMonth, day: 1 }).toISODate();
    const endDate = DateTime.fromObject({ year, month: startMonth + 2 }).endOf('month').toISODate();

    // Uses same revenue logic as getActualsForRange: a.charge_type (not s.dft_charge_type)
    // and aggregates per-appointment first to avoid double-counting with multiple recipients
    const query = `
      WITH appointment_base AS (
        SELECT DISTINCT
          a.appointment_id,
          a.units,
          a.charge_type,
          CASE
            WHEN s.labels::text LIKE '%"Home %' THEN 'home'
            WHEN s.labels @> '"Online"'::jsonb THEN 'digital'
            WHEN s.labels::text LIKE '%"Club %' THEN 'clubs'
            WHEN s.labels::text LIKE '%"School%' THEN 'schools'
            ELSE 'other'
          END AS channel
        FROM appointments a
        JOIN services s ON a.service_id = s.service_id
        WHERE DATE(a.start AT TIME ZONE 'America/New_York') BETWEEN $1 AND $2
          AND a.status IN ('complete', 'cancelled-chargeable')
          AND a.is_deleted IS NOT TRUE
      ),
      recipient_revenue AS (
        SELECT
          ar.appointment_id,
          SUM(
            CASE
              WHEN ab.charge_type = 'hourly' THEN COALESCE(ar.charge_rate, 0) * ab.units
              WHEN ab.charge_type = 'one-off' THEN COALESCE(ar.charge_rate, 0)
              WHEN ab.charge_type = 'one-off-split' THEN COALESCE(ar.charge_rate, 0)
              WHEN ab.charge_type = 'hourly-split' THEN COALESCE(ar.charge_rate, 0) * ab.units
              ELSE COALESCE(ar.charge_rate, 0) * ab.units
            END
          ) AS revenue
        FROM appointment_recipients ar
        JOIN appointment_base ab ON ar.appointment_id = ab.appointment_id
        WHERE ar.status IS NULL OR ar.status <> 'missed'
        GROUP BY ar.appointment_id
      ),
      contractor_pay AS (
        SELECT
          ac.appointment_id,
          SUM(
            CASE
              WHEN ab.charge_type = 'hourly' THEN COALESCE(ac.pay_rate, 0) * ab.units
              ELSE COALESCE(ac.pay_rate, 0)
            END
          ) AS tutor_pay
        FROM appointment_contractors ac
        JOIN appointment_base ab ON ac.appointment_id = ab.appointment_id
        GROUP BY ac.appointment_id
      )
      SELECT
        COUNT(*) AS total_lessons,
        ROUND(SUM(COALESCE(rr.revenue, 0))::numeric, 2) AS total_revenue,
        ROUND(SUM(COALESCE(cp.tutor_pay, 0))::numeric, 2) AS total_tutor_pay,
        ROUND((SUM(COALESCE(rr.revenue, 0)) - SUM(COALESCE(cp.tutor_pay, 0)))::numeric, 2) AS total_profit
      FROM appointment_base ab
      LEFT JOIN recipient_revenue rr ON ab.appointment_id = rr.appointment_id
      LEFT JOIN contractor_pay cp ON ab.appointment_id = cp.appointment_id
    `;

    try {
      const { rows } = await this.pool.query(query, [startDate, endDate]);
      const row = rows[0] || {};

      return {
        year,
        quarter,
        start_date: startDate,
        end_date: endDate,
        lessons: parseInt(row.total_lessons) || 0,
        revenue: parseFloat(row.total_revenue) || 0,
        tutor_pay: parseFloat(row.total_tutor_pay) || 0,
        profit: parseFloat(row.total_profit) || 0,
        margin_percent: row.total_revenue > 0
          ? Math.round((row.total_profit / row.total_revenue) * 100)
          : 0
      };
    } catch (error) {
      logger.error({ error: error.message, year, quarter }, 'getQuarterlyActuals error');
      throw error;
    }
  }

  /**
   * Get quarterly targets with derived metrics
   */
  async getQuarterlyTargets() {
    if (!this.pool) {
      throw new Error('Database pool not available');
    }

    const now = DateTime.now();
    const currentQuarter = Math.ceil(now.month / 3);
    const currentYear = now.year;

    // Build list of quarters: current + next 3
    const quarters = [];
    for (let i = 0; i < 4; i++) {
      let q = currentQuarter + i;
      let y = currentYear;
      if (q > 4) {
        q -= 4;
        y += 1;
      }
      quarters.push({ year: y, quarter: q });
    }

    // Get existing targets from database
    // Only fetch overall quarterly targets (channel IS NULL), not channel-specific breakdowns
    const targetQuery = `
      SELECT *
      FROM forecast_targets
      WHERE target_type = 'quarterly_revenue'
        AND channel IS NULL
        AND ((year = $1 AND quarter >= $2) OR year > $1)
      ORDER BY year, quarter
    `;

    const { rows: existingTargets } = await this.pool.query(targetQuery, [currentYear, currentQuarter]);

    // Get historical averages for derivation
    const historicalAvg = await this.getHistoricalAverages();

    // Build response for each quarter
    const result = [];
    for (const { year, quarter } of quarters) {
      const startMonth = (quarter - 1) * 3 + 1;
      const startDate = DateTime.fromObject({ year, month: startMonth, day: 1 });
      const endDate = startDate.plus({ months: 3 }).minus({ days: 1 });

      // Calculate fiscal quarter (FY starts in July)
      // Jan-Mar = Q3, Apr-Jun = Q4, Jul-Sep = Q1, Oct-Dec = Q2
      const fiscalQuarter = quarter <= 2 ? quarter + 2 : quarter - 2;
      const fiscalYear = quarter <= 2 ? year : year + 1;

      // Find existing target for this quarter
      const existingTarget = existingTargets.find(t => t.year === year && t.quarter === quarter);

      // Get prior year actuals for reference
      const priorYearActuals = await this.getQuarterlyActuals({ year: year - 1, quarter });

      const quarterData = {
        year,
        quarter,
        fiscal_year: fiscalYear,
        fiscal_quarter: fiscalQuarter,
        start_date: startDate.toISODate(),
        end_date: endDate.toISODate(),
        is_current: year === currentYear && quarter === currentQuarter,
        prior_year_actuals: priorYearActuals,
        target: null,
        derived: null
      };

      if (existingTarget) {
        const revenueTarget = parseFloat(existingTarget.target_value);
        const marginPercent = existingTarget.margin_percent || 50;
        const channelMix = existingTarget.channel_mix || historicalAvg.channel_mix;
        const avgRevenuePerLesson = historicalAvg.avg_revenue_per_lesson || 95;

        const lessonsNeeded = Math.round(revenueTarget / avgRevenuePerLesson);
        const weeksInQuarter = 13;
        const daysInQuarter = 91;

        quarterData.target = {
          id: existingTarget.id,
          revenue: revenueTarget,
          margin_percent: marginPercent,
          channel_mix: channelMix
        };

        quarterData.derived = {
          profit: Math.round(revenueTarget * (marginPercent / 100)),
          tutor_pay: Math.round(revenueTarget * (1 - marginPercent / 100)),
          lessons_total: lessonsNeeded,
          lessons_weekly: Math.round(lessonsNeeded / weeksInQuarter),
          lessons_daily: Math.round(lessonsNeeded / daysInQuarter),
          avg_revenue_per_lesson: avgRevenuePerLesson,
          channel_breakdown: Object.entries(channelMix).reduce((acc, [ch, pct]) => {
            acc[ch] = Math.round(revenueTarget * (pct / 100));
            return acc;
          }, {})
        };
      }

      result.push(quarterData);
    }

    return {
      quarters: result,
      historical_averages: historicalAvg
    };
  }

  /**
   * Save quarterly targets
   */
  async saveQuarterlyTargets({ year, quarter, revenue, margin_percent = 50, channel_mix, created_by }) {
    if (!this.pool) {
      throw new Error('Database pool not available');
    }

    // Validate inputs
    if (!year || !quarter || revenue === undefined) {
      throw { status: 400, message: 'year, quarter, and revenue are required' };
    }

    if (quarter < 1 || quarter > 4) {
      throw { status: 400, message: 'quarter must be between 1 and 4' };
    }

    // Upsert the quarterly target
    // The unique constraint is: (target_type, channel, market, quarter, week_number, year)
    const query = `
      INSERT INTO forecast_targets (
        target_type, target_value, year, quarter, margin_percent, channel_mix, created_by
      )
      VALUES ('quarterly_revenue', $1, $2, $3, $4, $5, $6)
      ON CONFLICT (target_type, channel, market, quarter, week_number, year)
      DO UPDATE SET
        target_value = EXCLUDED.target_value,
        margin_percent = EXCLUDED.margin_percent,
        channel_mix = EXCLUDED.channel_mix,
        updated_at = NOW()
      RETURNING *
    `;

    try {
      const { rows } = await this.pool.query(query, [
        revenue,
        year,
        quarter,
        margin_percent,
        JSON.stringify(channel_mix || {}),
        created_by
      ]);

      // Also generate weekly targets for this quarter
      await this.generateWeeklyTargetsFromQuarterly({ year, quarter, revenue, margin_percent });

      // Auto-sync weekly_lessons target from revenue / historical avg revenue per lesson
      await this.syncWeeklyLessonsTarget({ year, quarter, revenue });

      logger.info({ year, quarter, revenue, margin_percent }, 'Quarterly target saved');

      return rows[0];
    } catch (error) {
      logger.error({ error: error.message, year, quarter }, 'saveQuarterlyTargets error');
      throw error;
    }
  }

  /**
   * Generate weekly targets from quarterly target
   */
  async generateWeeklyTargetsFromQuarterly({ year, quarter, revenue, margin_percent }) {
    const startMonth = (quarter - 1) * 3 + 1;
    const startDate = DateTime.fromObject({ year, month: startMonth, day: 1 });
    const endDate = startDate.plus({ months: 3 }).minus({ days: 1 });

    // Calculate number of weeks in the quarter
    const weeksInQuarter = Math.ceil(endDate.diff(startDate, 'weeks').weeks);
    const weeklyRevenue = Math.round(revenue / weeksInQuarter);

    // Delete existing weekly targets for this quarter
    await this.pool.query(`
      DELETE FROM forecast_targets
      WHERE target_type = 'weekly_revenue'
        AND year = $1
        AND quarter = $2
    `, [year, quarter]);

    // Insert new weekly targets
    let currentWeek = startDate.startOf('week');
    let weekNum = 1;

    while (currentWeek < endDate) {
      const weekNumber = currentWeek.weekNumber;

      await this.pool.query(`
        INSERT INTO forecast_targets (target_type, target_value, year, quarter, week_number)
        VALUES ('weekly_revenue', $1, $2, $3, $4)
        ON CONFLICT DO NOTHING
      `, [weeklyRevenue, year, quarter, weekNumber]);

      currentWeek = currentWeek.plus({ weeks: 1 });
      weekNum++;
    }
  }

  /**
   * Sync weekly_lessons target when quarterly revenue target is saved.
   * Derives weekly lesson count from revenue / historical avg revenue per lesson.
   */
  async syncWeeklyLessonsTarget({ year, quarter, revenue }) {
    const historicalAvg = await this.getHistoricalAverages();
    const avgRevenuePerLesson = historicalAvg.avg_revenue_per_lesson || 95;
    const totalLessons = Math.round(revenue / avgRevenuePerLesson);
    const weeklyLessons = Math.round(totalLessons / 13);

    // Store the exact quarterly total so dashboard and popup read the same number
    // (avoids rounding drift from weekly × weeksInPeriod vs weekly × 13)
    await this.pool.query(`
      INSERT INTO forecast_targets (target_type, channel, target_value, year, created_by)
      VALUES ('quarterly_lessons', NULL, $1, $2, 'auto-sync')
      ON CONFLICT (target_type, channel, market, quarter, week_number, year)
      DO UPDATE SET target_value = EXCLUDED.target_value, updated_at = NOW()
    `, [totalLessons, year]);

    // Upsert overall weekly_lessons target (channel IS NULL, quarter IS NULL)
    // Used for chart reference lines; the quarterly_lessons total is authoritative
    await this.pool.query(`
      INSERT INTO forecast_targets (target_type, channel, target_value, year, created_by)
      VALUES ('weekly_lessons', NULL, $1, $2, 'auto-sync')
      ON CONFLICT (target_type, channel, market, quarter, week_number, year)
      DO UPDATE SET target_value = EXCLUDED.target_value, updated_at = NOW()
    `, [weeklyLessons, year]);

    // Also sync per-channel targets using channel mix from historical averages
    const channelMix = historicalAvg.channel_mix || {};
    for (const [channel, pct] of Object.entries(channelMix)) {
      if (!pct || channel === 'other') continue;
      const channelTotal = Math.round(totalLessons * (pct / 100));
      const channelWeekly = Math.round(weeklyLessons * (pct / 100));

      await this.pool.query(`
        INSERT INTO forecast_targets (target_type, channel, target_value, year, created_by)
        VALUES ('quarterly_lessons', $1, $2, $3, 'auto-sync')
        ON CONFLICT (target_type, channel, market, quarter, week_number, year)
        DO UPDATE SET target_value = EXCLUDED.target_value, updated_at = NOW()
      `, [channel, channelTotal, year]);

      await this.pool.query(`
        INSERT INTO forecast_targets (target_type, channel, target_value, year, created_by)
        VALUES ('weekly_lessons', $1, $2, $3, 'auto-sync')
        ON CONFLICT (target_type, channel, market, quarter, week_number, year)
        DO UPDATE SET target_value = EXCLUDED.target_value, updated_at = NOW()
      `, [channel, channelWeekly, year]);
    }

    logger.info({ year, quarter, totalLessons, weeklyLessons, avgRevenuePerLesson }, 'Lesson targets synced from quarterly revenue');
  }

  // ==========================================================================
  // HISTORICAL KPI DATA (For Executive Summary Modals)
  // ==========================================================================

  /**
   * Get historical KPI data aggregated by week
   * Used for executive summary charts comparing actuals vs forecast vs target
   *
   * @param {Object} params
   * @param {number} params.lookbackMonths - Number of months of historical data (default 3)
   * @param {number} params.forecastMonths - Number of months of forecast data (default 3)
   * @param {string} params.channel - Optional channel filter
   * @param {string} params.metric - Specific metric to get (lessons, hours, revenue, etc.)
   * @returns {Object} Historical actuals, forecast projections, and targets by week
   */
  async getHistoricalKPIs({ lookbackMonths = 3, forecastMonths = 3, channel = null, metric = 'all', periodStart = null, periodEnd = null }) {
    if (!this.pool) {
      throw new Error('Database pool not available');
    }

    const now = DateTime.now();

    // IMPORTANT: We use Sunday-Saturday weeks, but Luxon uses ISO weeks (Monday start)
    // Luxon weekday: 1=Mon, 2=Tue, 3=Wed, 4=Thu, 5=Fri, 6=Sat, 7=Sun
    // Calculate days since last Sunday: Sun=0, Mon=1, Tue=2, ..., Sat=6
    const daysSinceSunday = now.weekday % 7; // 7%7=0 for Sunday, else weekday for Mon-Sat
    const currentWeekSunday = now.minus({ days: daysSinceSunday }).startOf('day');

    // Historical ends on Saturday BEFORE current week starts (last complete week)
    const historicalEnd = currentWeekSunday.minus({ days: 1 }); // Saturday
    const historicalStart = historicalEnd.minus({ months: lookbackMonths }).startOf('day');

    // Forecast starts from Sunday of current week
    const forecastEnd = now.plus({ months: forecastMonths }).endOf('week');

    // Query historical completed appointments aggregated by week (Sun-Sat)
    // Uses subqueries to avoid cartesian product between recipients and contractors
    const historicalQuery = `
      WITH appointment_revenue AS (
        -- Pre-aggregate revenue per appointment (avoids cartesian product)
        SELECT
          ar.appointment_id,
          COUNT(DISTINCT ar.recipient_id) AS student_count,
          SUM(
            CASE
              WHEN a.charge_type = 'hourly' THEN COALESCE(ar.charge_rate, 0) * a.units
              WHEN a.charge_type = 'one-off' THEN COALESCE(ar.charge_rate, 0)
              WHEN a.charge_type = 'one-off-split' THEN COALESCE(ar.charge_rate, 0)
              WHEN a.charge_type = 'hourly-split' THEN COALESCE(ar.charge_rate, 0) * a.units
              ELSE COALESCE(ar.charge_rate, 0) * a.units
            END
          ) AS revenue
        FROM appointment_recipients ar
        JOIN appointments a ON ar.appointment_id = a.appointment_id
        JOIN services s ON a.service_id = s.service_id
        WHERE a.status IN ('complete', 'cancelled-chargeable') AND a.is_deleted IS NOT TRUE
          AND ar.status <> 'missed'
        GROUP BY ar.appointment_id
      ),
      appointment_pay AS (
        -- Pre-aggregate pay per appointment (avoids cartesian product)
        SELECT
          ac.appointment_id,
          COUNT(DISTINCT ac.contractor_id) AS tutor_count,
          SUM(
            CASE
              WHEN a.charge_type = 'hourly' THEN COALESCE(ac.pay_rate, 0) * a.units
              ELSE COALESCE(ac.pay_rate, 0)
            END
          ) AS base_pay
        FROM appointment_contractors ac
        JOIN appointments a ON ac.appointment_id = a.appointment_id
        WHERE a.status IN ('complete', 'cancelled-chargeable') AND a.is_deleted IS NOT TRUE
        GROUP BY ac.appointment_id
      ),
      weekly_data AS (
        SELECT
          -- Get Sunday of each week (ISO week starts Monday, so we adjust)
          DATE_TRUNC('week', DATE(a.start AT TIME ZONE 'America/New_York') + INTERVAL '1 day') - INTERVAL '1 day' AS week_start,
          COUNT(DISTINCT a.appointment_id) AS lessons,
          SUM(a.units) AS hours,
          SUM(COALESCE(ar_agg.student_count, 0)) AS unique_students,
          SUM(COALESCE(ap_agg.tutor_count, 0)) AS unique_tutors,
          SUM(COALESCE(ar_agg.revenue, 0)) AS revenue,
          SUM(
            COALESCE(ap_agg.base_pay, 0)
            + COALESCE(
              CASE
                WHEN s.sr_premium IS NOT NULL AND s.sr_premium > 0 THEN
                  s.sr_premium * COALESCE(ar_agg.student_count, 0) * a.units
                ELSE 0
              END
            , 0)
          ) AS tutor_pay
        FROM appointments a
        JOIN services s ON a.service_id = s.service_id
        LEFT JOIN appointment_revenue ar_agg ON a.appointment_id = ar_agg.appointment_id
        LEFT JOIN appointment_pay ap_agg ON a.appointment_id = ap_agg.appointment_id
        WHERE DATE(a.start AT TIME ZONE 'America/New_York') BETWEEN $1 AND $2
          AND a.status IN ('complete', 'cancelled-chargeable')
          AND a.is_deleted IS NOT TRUE
          ${channel ? `AND (
            CASE
              WHEN s.labels::text LIKE '%"Home %' THEN 'home'
              WHEN s.labels @> '"Online"'::jsonb THEN 'digital'
              WHEN s.labels::text LIKE '%"Club %' THEN 'clubs'
              WHEN s.labels::text LIKE '%"School%' THEN 'schools'
              ELSE 'other'
            END
          ) = $3` : ''}
        GROUP BY week_start
        ORDER BY week_start
      )
      SELECT
        week_start,
        lessons,
        hours,
        unique_students,
        unique_tutors,
        revenue,
        tutor_pay,
        revenue - tutor_pay AS profit
      FROM weekly_data
    `;

    const params = [
      historicalStart.toISODate(),
      historicalEnd.toISODate() // End at last complete week, not today
    ];
    if (channel) params.push(channel);

    // Prior year: same full date range (historical_start to forecast_end) shifted back 1 year
    const priorYearStart = historicalStart.minus({ years: 1 }).toISODate();
    const priorYearEnd = forecastEnd.minus({ years: 1 }).toISODate();
    const priorYearQuery = `
      WITH appointment_revenue AS (
        SELECT
          ar.appointment_id,
          COUNT(DISTINCT ar.recipient_id) AS student_count,
          SUM(
            CASE
              WHEN a.charge_type = 'hourly' THEN COALESCE(ar.charge_rate, 0) * a.units
              WHEN a.charge_type = 'one-off' THEN COALESCE(ar.charge_rate, 0)
              WHEN a.charge_type = 'one-off-split' THEN COALESCE(ar.charge_rate, 0)
              WHEN a.charge_type = 'hourly-split' THEN COALESCE(ar.charge_rate, 0) * a.units
              ELSE COALESCE(ar.charge_rate, 0) * a.units
            END
          ) AS revenue
        FROM appointment_recipients ar
        JOIN appointments a ON ar.appointment_id = a.appointment_id
        JOIN services s ON a.service_id = s.service_id
        WHERE a.status IN ('complete', 'cancelled-chargeable') AND a.is_deleted IS NOT TRUE
          AND ar.status <> 'missed'
        GROUP BY ar.appointment_id
      ),
      appointment_pay AS (
        SELECT
          ac.appointment_id,
          COUNT(DISTINCT ac.contractor_id) AS tutor_count,
          SUM(
            CASE
              WHEN a.charge_type = 'hourly' THEN COALESCE(ac.pay_rate, 0) * a.units
              ELSE COALESCE(ac.pay_rate, 0)
            END
          ) AS base_pay
        FROM appointment_contractors ac
        JOIN appointments a ON ac.appointment_id = a.appointment_id
        WHERE a.status IN ('complete', 'cancelled-chargeable') AND a.is_deleted IS NOT TRUE
        GROUP BY ac.appointment_id
      ),
      weekly_data AS (
        SELECT
          DATE_TRUNC('week', DATE(a.start AT TIME ZONE 'America/New_York') + INTERVAL '1 day') - INTERVAL '1 day' AS week_start,
          COUNT(DISTINCT a.appointment_id) AS lessons,
          SUM(a.units) AS hours,
          SUM(COALESCE(ar_agg.student_count, 0)) AS unique_students,
          SUM(COALESCE(ap_agg.tutor_count, 0)) AS unique_tutors,
          SUM(COALESCE(ar_agg.revenue, 0)) AS revenue,
          SUM(
            COALESCE(ap_agg.base_pay, 0)
            + COALESCE(
              CASE
                WHEN s.sr_premium IS NOT NULL AND s.sr_premium > 0 THEN
                  s.sr_premium * COALESCE(ar_agg.student_count, 0) * a.units
                ELSE 0
              END
            , 0)
          ) AS tutor_pay
        FROM appointments a
        JOIN services s ON a.service_id = s.service_id
        LEFT JOIN appointment_revenue ar_agg ON a.appointment_id = ar_agg.appointment_id
        LEFT JOIN appointment_pay ap_agg ON a.appointment_id = ap_agg.appointment_id
        WHERE DATE(a.start AT TIME ZONE 'America/New_York') BETWEEN $1 AND $2
          AND a.status IN ('complete', 'cancelled-chargeable')
          AND a.is_deleted IS NOT TRUE
          ${channel ? `AND (
            CASE
              WHEN s.labels::text LIKE '%"Home %' THEN 'home'
              WHEN s.labels @> '"Online"'::jsonb THEN 'digital'
              WHEN s.labels::text LIKE '%"Club %' THEN 'clubs'
              WHEN s.labels::text LIKE '%"School%' THEN 'schools'
              ELSE 'other'
            END
          ) = $3` : ''}
        GROUP BY week_start
        ORDER BY week_start
      )
      SELECT
        week_start,
        -- Aligned date: shift forward 1 year to align with current year X-axis
        (week_start + INTERVAL '1 year')::date AS aligned_week_start,
        lessons,
        hours,
        unique_students,
        unique_tutors,
        revenue,
        tutor_pay,
        revenue - tutor_pay AS profit
      FROM weekly_data
    `;

    const priorYearParams = [priorYearStart, priorYearEnd];
    if (channel) priorYearParams.push(channel);

    // Build period-specific prior year params (for dashboard date range YoY comparison)
    const periodPyParams = periodStart && periodEnd ? (() => {
      const pyStart = DateTime.fromISO(periodStart).minus({ years: 1 }).toISODate();
      const pyEnd = DateTime.fromISO(periodEnd).minus({ years: 1 }).toISODate();
      const p = [pyStart, pyEnd];
      if (channel) p.push(channel);
      return p;
    })() : null;

    // Run historical, prior year, and optional period prior year queries in parallel
    const [{ rows: historical }, { rows: priorYearRows }, periodPyResult] = await Promise.all([
      this.pool.query(historicalQuery, params),
      this.pool.query(priorYearQuery, priorYearParams),
      periodPyParams ? this.pool.query(priorYearQuery, periodPyParams) : Promise.resolve({ rows: [] }),
    ]);

    // Get forecast data starting from current week (includes today's week as "scheduled")
    const forecastData = await this.getScenarios({
      startDate: currentWeekSunday.toISODate(), // Start from Sunday of current week
      endDate: forecastEnd.toISODate(),
      channel
    });

    // Aggregate daily forecast into weekly
    const weeklyForecast = {};
    if (forecastData?.daily) {
      for (const day of forecastData.daily) {
        const weekStart = DateTime.fromISO(day.date)
          .plus({ days: 1 }) // Shift to make Sunday the start
          .startOf('week')
          .minus({ days: 1 })
          .toISODate();

        if (!weeklyForecast[weekStart]) {
          weeklyForecast[weekStart] = {
            week_start: weekStart,
            scheduled_lessons: 0,
            scheduled_hours: 0,
            scheduled_revenue: 0,
            scheduled_tutor_pay: 0,
            projected_lessons: 0,
            projected_hours: 0,
            projected_revenue: 0,
            projected_tutor_pay: 0
          };
        }

        weeklyForecast[weekStart].scheduled_lessons += day.scheduled_lessons || 0;
        weeklyForecast[weekStart].scheduled_hours += day.scheduled_hours || 0;
        weeklyForecast[weekStart].scheduled_revenue += day.scheduled_revenue || 0;
        weeklyForecast[weekStart].scheduled_tutor_pay += day.scheduled_tutor_pay || 0;
        weeklyForecast[weekStart].projected_lessons += day.projected_lessons || 0;
        weeklyForecast[weekStart].projected_hours += day.projected_hours || 0;
        weeklyForecast[weekStart].projected_revenue += day.projected_revenue || 0;
        weeklyForecast[weekStart].projected_tutor_pay += day.projected_tutor_pay || 0;
      }
    }

    // Get targets for the period
    const currentYear = now.year;
    const targets = await this.getTargets({ year: currentYear });

    // Build target lookup by week
    const weeklyTargets = {};
    for (const target of targets) {
      // For now, use quarterly targets and divide by weeks in quarter
      // When weekly targets exist, they take precedence
      if (target.week_number) {
        // Direct weekly target - use weekYear (not year) with weekNumber per Luxon requirements
        const weekStart = DateTime.fromObject({ weekYear: target.year, weekNumber: target.week_number })
          .startOf('week')
          .minus({ days: 1 }) // Adjust to Sunday
          .toISODate();
        weeklyTargets[weekStart] = weeklyTargets[weekStart] || {};
        weeklyTargets[weekStart][target.target_type] = target.target_value;
      }
    }

    // Build prior year data aligned to current year weeks
    const priorYear = priorYearRows.map(row => ({
      week_start: DateTime.fromJSDate(row.aligned_week_start).toISODate(),
      actual_week_start: DateTime.fromJSDate(row.week_start).toISODate(),
      lessons: parseInt(row.lessons) || 0,
      hours: parseFloat(row.hours) || 0,
      unique_students: parseInt(row.unique_students) || 0,
      unique_tutors: parseInt(row.unique_tutors) || 0,
      revenue: parseFloat(row.revenue) || 0,
      tutor_pay: parseFloat(row.tutor_pay) || 0,
      profit: parseFloat(row.profit) || 0
    }));

    // Only sum prior year weeks that align with the historical period (not the full forecast span)
    // so the YoY comparison is apples-to-apples (3 months vs 3 months)
    const historicalEndDate = historicalEnd.toISODate();
    const priorYearSummary = priorYear
      .filter(week => week.week_start <= historicalEndDate)
      .reduce((acc, week) => {
        acc.totalLessons += week.lessons;
        acc.totalHours += week.hours;
        acc.totalRevenue += week.revenue;
        acc.totalTutorPay += week.tutor_pay;
        acc.totalProfit += week.profit;
        acc.weekCount++;
        return acc;
      }, { totalLessons: 0, totalHours: 0, totalRevenue: 0, totalTutorPay: 0, totalProfit: 0, weekCount: 0 });

    // Period-specific prior year summary (uses dashboard's exact date range shifted -1 year)
    let periodPriorYearSummary = null;
    if (periodStart && periodEnd && periodPyResult.rows.length > 0) {
      periodPriorYearSummary = periodPyResult.rows.reduce((acc, row) => {
        acc.totalLessons += parseInt(row.lessons) || 0;
        acc.totalHours += parseFloat(row.hours) || 0;
        acc.totalRevenue += parseFloat(row.revenue) || 0;
        acc.totalTutorPay += parseFloat(row.tutor_pay) || 0;
        acc.totalProfit += (parseFloat(row.revenue) || 0) - (parseFloat(row.tutor_pay) || 0);
        acc.weekCount++;
        return acc;
      }, { totalLessons: 0, totalHours: 0, totalRevenue: 0, totalTutorPay: 0, totalProfit: 0, weekCount: 0 });
    }

    // Calculate summary metrics
    const historicalSummary = historical.reduce((acc, week) => {
      acc.totalLessons += parseInt(week.lessons) || 0;
      acc.totalHours += parseFloat(week.hours) || 0;
      acc.totalRevenue += parseFloat(week.revenue) || 0;
      acc.totalTutorPay += parseFloat(week.tutor_pay) || 0;
      acc.totalProfit += parseFloat(week.profit) || 0;
      acc.weekCount++;
      return acc;
    }, { totalLessons: 0, totalHours: 0, totalRevenue: 0, totalTutorPay: 0, totalProfit: 0, weekCount: 0, avgStudents: 0, avgTutors: 0 });

    // Average students/tutors across weeks
    if (historical.length > 0) {
      historicalSummary.avgStudents = Math.round(
        historical.reduce((sum, w) => sum + parseInt(w.unique_students || 0), 0) / historical.length
      );
      historicalSummary.avgTutors = Math.round(
        historical.reduce((sum, w) => sum + parseInt(w.unique_tutors || 0), 0) / historical.length
      );
    }

    return {
      period: {
        historical_start: historicalStart.toISODate(),
        historical_end: historicalEnd.toISODate(), // Last Saturday (last complete week)
        forecast_start: currentWeekSunday.toISODate(), // Sunday of current week
        forecast_end: forecastEnd.toISODate()
      },
      historical: historical.map(row => ({
        week_start: DateTime.fromJSDate(row.week_start).toISODate(),
        lessons: parseInt(row.lessons) || 0,
        hours: parseFloat(row.hours) || 0,
        unique_students: parseInt(row.unique_students) || 0,
        unique_tutors: parseInt(row.unique_tutors) || 0,
        revenue: parseFloat(row.revenue) || 0,
        tutor_pay: parseFloat(row.tutor_pay) || 0,
        adhoc_pay: 0, // Not tracked yet
        profit: parseFloat(row.profit) || 0
      })),
      historical_summary: {
        ...historicalSummary,
        avgLessonsPerWeek: historicalSummary.weekCount > 0
          ? Math.round(historicalSummary.totalLessons / historicalSummary.weekCount)
          : 0,
        avgRevenuePerWeek: historicalSummary.weekCount > 0
          ? Math.round(historicalSummary.totalRevenue / historicalSummary.weekCount)
          : 0
      },
      forecast: Object.values(weeklyForecast).sort((a, b) => a.week_start.localeCompare(b.week_start)),
      forecast_summary: forecastData?.realistic || {},
      prior_year: priorYear,
      prior_year_summary: priorYearSummary,
      period_prior_year_summary: periodPriorYearSummary,
      targets: weeklyTargets,
      scenarios: {
        best_case: forecastData?.best_case || {},
        realistic: forecastData?.realistic || {},
        worst_case: forecastData?.worst_case || {}
      }
    };
  }

  /**
   * Get monthly aggregated KPIs for a specific metric
   * Simpler view for the executive summary charts
   */
  async getMonthlyKPITrend({ metric, channel = null, lookbackMonths = 6 }) {
    if (!this.pool) {
      throw new Error('Database pool not available');
    }

    const validMetrics = ['lessons', 'hours', 'revenue', 'tutor_pay', 'profit', 'students', 'tutors'];
    if (!validMetrics.includes(metric)) {
      throw new Error(`Invalid metric: ${metric}. Must be one of: ${validMetrics.join(', ')}`);
    }

    const now = DateTime.now();
    const startDate = now.minus({ months: lookbackMonths }).startOf('month');

    // Uses subqueries to avoid cartesian product between recipients and contractors
    const query = `
      WITH appointment_revenue AS (
        SELECT
          ar.appointment_id,
          COUNT(DISTINCT ar.recipient_id) AS student_count,
          SUM(
            CASE
              WHEN a.charge_type = 'hourly' THEN COALESCE(ar.charge_rate, 0) * a.units
              WHEN a.charge_type = 'one-off' THEN COALESCE(ar.charge_rate, 0)
              WHEN a.charge_type = 'one-off-split' THEN COALESCE(ar.charge_rate, 0)
              WHEN a.charge_type = 'hourly-split' THEN COALESCE(ar.charge_rate, 0) * a.units
              ELSE COALESCE(ar.charge_rate, 0) * a.units
            END
          ) AS revenue
        FROM appointment_recipients ar
        JOIN appointments a ON ar.appointment_id = a.appointment_id
        JOIN services s ON a.service_id = s.service_id
        WHERE a.status IN ('complete', 'cancelled-chargeable') AND a.is_deleted IS NOT TRUE
          AND ar.status <> 'missed'
        GROUP BY ar.appointment_id
      ),
      appointment_pay AS (
        SELECT
          ac.appointment_id,
          COUNT(DISTINCT ac.contractor_id) AS tutor_count,
          SUM(
            CASE
              WHEN a.charge_type = 'hourly' THEN COALESCE(ac.pay_rate, 0) * a.units
              ELSE COALESCE(ac.pay_rate, 0)
            END
          ) AS base_pay
        FROM appointment_contractors ac
        JOIN appointments a ON ac.appointment_id = a.appointment_id
        WHERE a.status IN ('complete', 'cancelled-chargeable') AND a.is_deleted IS NOT TRUE
        GROUP BY ac.appointment_id
      ),
      monthly_data AS (
        SELECT
          DATE_TRUNC('month', DATE(a.start AT TIME ZONE 'America/New_York')) AS month_start,
          COUNT(DISTINCT a.appointment_id) AS lessons,
          SUM(a.units) AS hours,
          SUM(COALESCE(ar_agg.student_count, 0)) AS unique_students,
          SUM(COALESCE(ap_agg.tutor_count, 0)) AS unique_tutors,
          SUM(COALESCE(ar_agg.revenue, 0)) AS revenue,
          SUM(COALESCE(ap_agg.base_pay, 0)) AS tutor_pay
        FROM appointments a
        JOIN services s ON a.service_id = s.service_id
        LEFT JOIN appointment_revenue ar_agg ON a.appointment_id = ar_agg.appointment_id
        LEFT JOIN appointment_pay ap_agg ON a.appointment_id = ap_agg.appointment_id
        WHERE DATE(a.start AT TIME ZONE 'America/New_York') BETWEEN $1 AND $2
          AND a.status IN ('complete', 'cancelled-chargeable')
          AND a.is_deleted IS NOT TRUE
          ${channel ? `AND (
            CASE
              WHEN s.labels::text LIKE '%"Home %' THEN 'home'
              WHEN s.labels @> '"Online"'::jsonb THEN 'digital'
              WHEN s.labels::text LIKE '%"Club %' THEN 'clubs'
              WHEN s.labels::text LIKE '%"School%' THEN 'schools'
              ELSE 'other'
            END
          ) = $3` : ''}
        GROUP BY month_start
        ORDER BY month_start
      )
      SELECT
        month_start,
        lessons,
        hours,
        unique_students AS students,
        unique_tutors AS tutors,
        revenue,
        tutor_pay,
        revenue - tutor_pay AS profit
      FROM monthly_data
    `;

    const params = [startDate.toISODate(), now.toISODate()];
    if (channel) params.push(channel);

    const { rows } = await this.pool.query(query, params);

    return {
      metric,
      channel,
      period: {
        start: startDate.toISODate(),
        end: now.toISODate()
      },
      data: rows.map(row => ({
        month: DateTime.fromJSDate(row.month_start).toFormat('MMM yyyy'),
        month_start: DateTime.fromJSDate(row.month_start).toISODate(),
        value: metric === 'students' ? parseInt(row.students) || 0
             : metric === 'tutors' ? parseInt(row.tutors) || 0
             : metric === 'lessons' ? parseInt(row.lessons) || 0
             : metric === 'hours' ? parseFloat(row.hours) || 0
             : parseFloat(row[metric]) || 0
      }))
    };
  }

  // ==========================================================================
  // COMPLETION RATE ANALYTICS
  // ==========================================================================

  /**
   * Get completion rate breakdown by dimension
   * Supports: channel, tutor, client, market
   */
  async getCompletionRatesByDimension({ dimension = 'channel', lookbackDays = 90, minAppointments = 10 }) {
    if (!this.pool) {
      throw new Error('Database pool not available');
    }

    const startDate = DateTime.now().minus({ days: lookbackDays }).toISODate();

    let query;
    switch (dimension) {
      case 'tutor':
        query = `
          SELECT
            ac.contractor_id AS dimension_value,
            ac.contractor_name AS dimension_display_name,
            COUNT(*) AS appointments_total,
            COUNT(*) FILTER (WHERE a.status IN ('complete', 'cancelled-chargeable')) AS appointments_completed,
            COUNT(*) FILTER (WHERE a.status = 'cancelled') AS appointments_cancelled,
            COUNT(*) FILTER (WHERE a.status IN ('complete', 'cancelled-chargeable'))::NUMERIC / NULLIF(COUNT(*), 0) AS completion_rate,
            SUM(CASE WHEN a.status IN ('complete', 'cancelled-chargeable') THEN ar.charge_rate * a.units ELSE 0 END) AS revenue_realized,
            SUM(CASE WHEN a.status = 'cancelled' THEN ar.charge_rate * a.units ELSE 0 END) AS revenue_lost
          FROM appointments a
          JOIN appointment_contractors ac ON a.appointment_id = ac.appointment_id
          LEFT JOIN appointment_recipients ar ON a.appointment_id = ar.appointment_id
          WHERE DATE(a.start AT TIME ZONE 'America/New_York') >= $1
            AND a.status IN ('complete', 'cancelled-chargeable', 'cancelled')
            AND a.is_deleted IS NOT TRUE
          GROUP BY ac.contractor_id, ac.contractor_name
          HAVING COUNT(*) >= $2
          ORDER BY completion_rate ASC, appointments_total DESC
        `;
        break;

      case 'client':
        query = `
          SELECT
            ar.paying_client_id AS dimension_value,
            ar.paying_client_name AS dimension_display_name,
            COUNT(*) AS appointments_total,
            COUNT(*) FILTER (WHERE a.status IN ('complete', 'cancelled-chargeable')) AS appointments_completed,
            COUNT(*) FILTER (WHERE a.status = 'cancelled') AS appointments_cancelled,
            COUNT(*) FILTER (WHERE a.status IN ('complete', 'cancelled-chargeable'))::NUMERIC / NULLIF(COUNT(*), 0) AS completion_rate,
            SUM(CASE WHEN a.status IN ('complete', 'cancelled-chargeable') THEN ar.charge_rate * a.units ELSE 0 END) AS revenue_realized,
            SUM(CASE WHEN a.status = 'cancelled' THEN ar.charge_rate * a.units ELSE 0 END) AS revenue_lost
          FROM appointments a
          JOIN appointment_recipients ar ON a.appointment_id = ar.appointment_id
          WHERE DATE(a.start AT TIME ZONE 'America/New_York') >= $1
            AND a.status IN ('complete', 'cancelled-chargeable', 'cancelled')
            AND a.is_deleted IS NOT TRUE
            AND ar.paying_client_id IS NOT NULL
          GROUP BY ar.paying_client_id, ar.paying_client_name
          HAVING COUNT(*) >= $2
          ORDER BY completion_rate ASC, appointments_total DESC
        `;
        break;

      case 'market':
        query = `
          WITH market_extracted AS (
            SELECT
              a.appointment_id,
              a.status,
              a.units,
              ar.charge_rate,
              CASE
                WHEN s.labels @> '"NYC"'::jsonb OR s.labels @> '"New York"'::jsonb THEN 'NYC'
                WHEN s.labels @> '"LA"'::jsonb OR s.labels @> '"Los Angeles"'::jsonb THEN 'LA'
                WHEN s.labels @> '"SF"'::jsonb OR s.labels @> '"San Francisco"'::jsonb THEN 'SF'
                WHEN s.labels @> '"Westside"'::jsonb THEN Westside
                WHEN s.labels @> '"Eastside"'::jsonb THEN Eastside
                WHEN s.labels @> '"Westchester"'::jsonb THEN 'Westchester'
                WHEN s.labels @> '"Hamptons"'::jsonb THEN 'Hamptons'
                ELSE 'Other'
              END AS market
            FROM appointments a
            JOIN services s ON a.service_id = s.service_id
            LEFT JOIN appointment_recipients ar ON a.appointment_id = ar.appointment_id
            WHERE DATE(a.start AT TIME ZONE 'America/New_York') >= $1
              AND a.status IN ('complete', 'cancelled-chargeable', 'cancelled')
              AND a.is_deleted IS NOT TRUE
          )
          SELECT
            market AS dimension_value,
            market AS dimension_display_name,
            COUNT(*) AS appointments_total,
            COUNT(*) FILTER (WHERE status IN ('complete', 'cancelled-chargeable')) AS appointments_completed,
            COUNT(*) FILTER (WHERE status = 'cancelled') AS appointments_cancelled,
            COUNT(*) FILTER (WHERE status IN ('complete', 'cancelled-chargeable'))::NUMERIC / NULLIF(COUNT(*), 0) AS completion_rate,
            SUM(CASE WHEN status IN ('complete', 'cancelled-chargeable') THEN charge_rate * units ELSE 0 END) AS revenue_realized,
            SUM(CASE WHEN status = 'cancelled' THEN charge_rate * units ELSE 0 END) AS revenue_lost
          FROM market_extracted
          GROUP BY market
          HAVING COUNT(*) >= $2
          ORDER BY completion_rate ASC
        `;
        break;

      case 'channel':
      default:
        query = `
          SELECT
            CASE
              WHEN s.labels::text LIKE '%"Home %' THEN 'home'
              WHEN s.labels @> '"Online"'::jsonb THEN 'digital'
              WHEN s.labels::text LIKE '%"Club %' THEN 'clubs'
              WHEN s.labels::text LIKE '%"School%' THEN 'schools'
              ELSE 'other'
            END AS dimension_value,
            CASE
              WHEN s.labels::text LIKE '%"Home %' THEN 'Home'
              WHEN s.labels @> '"Online"'::jsonb THEN 'Online'
              WHEN s.labels::text LIKE '%"Club %' THEN 'Clubs'
              WHEN s.labels::text LIKE '%"School%' THEN 'Schools'
              ELSE 'Other'
            END AS dimension_display_name,
            COUNT(*) AS appointments_total,
            COUNT(*) FILTER (WHERE a.status IN ('complete', 'cancelled-chargeable')) AS appointments_completed,
            COUNT(*) FILTER (WHERE a.status = 'cancelled') AS appointments_cancelled,
            COUNT(*) FILTER (WHERE a.status IN ('complete', 'cancelled-chargeable'))::NUMERIC / NULLIF(COUNT(*), 0) AS completion_rate,
            SUM(CASE WHEN a.status IN ('complete', 'cancelled-chargeable') THEN ar.charge_rate * a.units ELSE 0 END) AS revenue_realized,
            SUM(CASE WHEN a.status = 'cancelled' THEN ar.charge_rate * a.units ELSE 0 END) AS revenue_lost
          FROM appointments a
          JOIN services s ON a.service_id = s.service_id
          LEFT JOIN appointment_recipients ar ON a.appointment_id = ar.appointment_id
          WHERE DATE(a.start AT TIME ZONE 'America/New_York') >= $1
            AND a.status IN ('complete', 'cancelled-chargeable', 'cancelled')
            AND a.is_deleted IS NOT TRUE
          GROUP BY dimension_value, dimension_display_name
          HAVING COUNT(*) >= $2
          ORDER BY completion_rate ASC
        `;
    }

    try {
      const { rows } = await this.pool.query(query, [startDate, minAppointments]);

      // Calculate summary stats
      const totalAppointments = rows.reduce((sum, r) => sum + parseInt(r.appointments_total), 0);
      const totalCompleted = rows.reduce((sum, r) => sum + parseInt(r.appointments_completed), 0);
      const totalRevenueLost = rows.reduce((sum, r) => sum + parseFloat(r.revenue_lost || 0), 0);
      const overallRate = totalAppointments > 0 ? totalCompleted / totalAppointments : 0;

      return {
        dimension,
        lookback_days: lookbackDays,
        min_appointments: minAppointments,
        breakdown: rows.map(row => ({
          dimension_value: row.dimension_value,
          dimension_display_name: row.dimension_display_name,
          appointments_total: parseInt(row.appointments_total),
          appointments_completed: parseInt(row.appointments_completed),
          appointments_cancelled: parseInt(row.appointments_cancelled),
          completion_rate: parseFloat(row.completion_rate || 0),
          revenue_realized: parseFloat(row.revenue_realized || 0),
          revenue_lost: parseFloat(row.revenue_lost || 0),
        })),
        summary: {
          total_entries: rows.length,
          total_appointments: totalAppointments,
          total_completed: totalCompleted,
          overall_completion_rate: overallRate,
          total_revenue_lost: totalRevenueLost,
        },
      };
    } catch (error) {
      logger.error({ error: error.message, dimension, lookbackDays }, 'getCompletionRatesByDimension error');
      throw error;
    }
  }

  /**
   * Get completion rate trend over time for a specific dimension
   */
  async getCompletionRateTrend({ dimension = 'channel', dimensionValue = null, granularity = 'week', lookbackDays = 90 }) {
    if (!this.pool) {
      throw new Error('Database pool not available');
    }

    const startDate = DateTime.now().minus({ days: lookbackDays }).toISODate();

    // Build date truncation based on granularity
    const dateTrunc = granularity === 'day' ? 'day' : granularity === 'month' ? 'month' : 'week';

    let dimensionFilter = '';
    const params = [startDate];
    let paramIdx = 2;

    if (dimension === 'channel' && dimensionValue) {
      dimensionFilter = `AND CASE
        WHEN s.labels::text LIKE '%"Home %' THEN 'home'
        WHEN s.labels @> '"Online"'::jsonb THEN 'digital'
        WHEN s.labels::text LIKE '%"Club %' THEN 'clubs'
        WHEN s.labels::text LIKE '%"School%' THEN 'schools'
        ELSE 'other'
      END = $${paramIdx}`;
      params.push(dimensionValue);
    } else if (dimension === 'tutor' && dimensionValue) {
      dimensionFilter = `AND ac.contractor_id = $${paramIdx}`;
      params.push(dimensionValue);
    } else if (dimension === 'client' && dimensionValue) {
      dimensionFilter = `AND ar.paying_client_id = $${paramIdx}`;
      params.push(dimensionValue);
    }

    const query = `
      SELECT
        DATE_TRUNC('${dateTrunc}', a.start) AS period_start,
        COUNT(*) AS appointments_total,
        COUNT(*) FILTER (WHERE a.status IN ('complete', 'cancelled-chargeable')) AS appointments_completed,
        COUNT(*) FILTER (WHERE a.status = 'cancelled') AS appointments_cancelled,
        COUNT(*) FILTER (WHERE a.status IN ('complete', 'cancelled-chargeable'))::NUMERIC / NULLIF(COUNT(*), 0) AS completion_rate
      FROM appointments a
      JOIN services s ON a.service_id = s.service_id
      LEFT JOIN appointment_recipients ar ON a.appointment_id = ar.appointment_id
      LEFT JOIN appointment_contractors ac ON a.appointment_id = ac.appointment_id
      WHERE DATE(a.start AT TIME ZONE 'America/New_York') >= $1
        AND DATE(a.start AT TIME ZONE 'America/New_York') <= CURRENT_DATE
        AND a.status IN ('complete', 'cancelled-chargeable', 'cancelled')
        AND a.is_deleted IS NOT TRUE
        ${dimensionFilter}
      GROUP BY period_start
      ORDER BY period_start
    `;

    try {
      const { rows } = await this.pool.query(query, params);

      const trendData = rows.map(row => ({
        period_start: row.period_start,
        appointments_total: parseInt(row.appointments_total),
        appointments_completed: parseInt(row.appointments_completed),
        appointments_cancelled: parseInt(row.appointments_cancelled),
        completion_rate: parseFloat(row.completion_rate || 0),
      }));

      // Calculate summary statistics
      let summary = null;
      if (trendData.length > 0) {
        const rates = trendData.map(d => d.completion_rate);
        const avgRate = rates.reduce((a, b) => a + b, 0) / rates.length;
        const maxRate = Math.max(...rates);
        const minRate = Math.min(...rates);

        // Determine trend direction by comparing first half to second half
        const midPoint = Math.floor(rates.length / 2);
        const firstHalfAvg = rates.slice(0, midPoint).reduce((a, b) => a + b, 0) / (midPoint || 1);
        const secondHalfAvg = rates.slice(midPoint).reduce((a, b) => a + b, 0) / (rates.length - midPoint || 1);
        const trendDiff = secondHalfAvg - firstHalfAvg;

        let trendDirection = 'stable';
        if (trendDiff > 0.02) trendDirection = 'up';
        else if (trendDiff < -0.02) trendDirection = 'down';

        summary = {
          avg_rate: avgRate,
          max_rate: maxRate,
          min_rate: minRate,
          trend_direction: trendDirection,
          trend_change_pp: trendDiff,
        };
      }

      return {
        dimension,
        dimension_value: dimensionValue,
        granularity,
        lookback_days: lookbackDays,
        trend_data: trendData,
        summary,
      };
    } catch (error) {
      logger.error({ error: error.message, dimension, dimensionValue, granularity }, 'getCompletionRateTrend error');
      throw error;
    }
  }

  /**
   * Compute anomalies on-the-fly from weekly completion rate trend data.
   * Uses rolling statistical analysis + US holiday calendar for classification.
   * No DB tables needed — purely computed from appointment data.
   */
  async computeCompletionRateAnomalies({ dimension = 'channel', dimensionValue = null, lookbackDays = 180 }) {
    const { getUSHolidayRanges, checkWeekOverlapsHoliday } = require('../utils/us-holidays');

    // Force minimum 180 days for meaningful stats
    const effectiveLookback = Math.max(lookbackDays, 180);

    // Get weekly trend data using existing method
    const trendResult = await this.getCompletionRateTrend({
      dimension,
      dimensionValue,
      granularity: 'week',
      lookbackDays: effectiveLookback,
    });

    const trendData = trendResult.trend_data || [];
    if (trendData.length < 6) {
      return {
        anomalies: [],
        summary: { critical: 0, warning: 0, expected: 0, positive: 0, total: 0 },
        trend_data: trendData.map(d => ({ ...d, rolling_avg: null })),
      };
    }

    // Build holiday ranges for all years in the data
    const years = new Set();
    for (const d of trendData) {
      const dt = new Date(d.period_start);
      years.add(dt.getUTCFullYear());
      years.add(dt.getUTCFullYear() + 1); // for Winter Break spanning years
    }
    const allHolidays = [];
    for (const yr of years) {
      allHolidays.push(...getUSHolidayRanges(yr));
    }

    // Compute 4-week rolling average and standard deviation
    const WINDOW = 4;
    const anomalies = [];
    const enrichedTrend = [];

    for (let i = 0; i < trendData.length; i++) {
      const point = trendData[i];
      let rollingAvg = null;
      let rollingStdDev = null;

      if (i >= WINDOW) {
        const window = trendData.slice(i - WINDOW, i).map(d => d.completion_rate);
        const mean = window.reduce((a, b) => a + b, 0) / window.length;
        const variance = window.reduce((sum, val) => sum + Math.pow(val - mean, 2), 0) / window.length;
        rollingAvg = mean;
        rollingStdDev = Math.sqrt(variance);
      }

      enrichedTrend.push({
        ...point,
        rolling_avg: rollingAvg,
      });

      // Skip first WINDOW points (not enough history)
      if (i < WINDOW || rollingStdDev === null || rollingStdDev === 0) continue;

      // Skip weeks with very few appointments (noisy data)
      if (point.appointments_total < 5) continue;

      const zScore = (point.completion_rate - rollingAvg) / rollingStdDev;
      const deviation = point.completion_rate - rollingAvg;
      const deviationPP = deviation * 100; // percentage points

      // Check holiday overlap
      const periodISO = typeof point.period_start === 'string'
        ? point.period_start.slice(0, 10)
        : new Date(point.period_start).toISOString().slice(0, 10);
      const { isHoliday, holidayName } = checkWeekOverlapsHoliday(periodISO, allHolidays);

      // Classify anomalies
      let classification = null;
      if (zScore <= -2) {
        classification = isHoliday ? 'expected' : 'critical';
      } else if (zScore <= -1.5) {
        classification = isHoliday ? 'expected' : 'warning';
      } else if (zScore >= 1.5) {
        classification = 'positive';
      }

      if (classification) {
        anomalies.push({
          week_start: periodISO,
          completion_rate: point.completion_rate,
          expected_rate: rollingAvg,
          deviation_pp: parseFloat(deviationPP.toFixed(1)),
          z_score: parseFloat(zScore.toFixed(2)),
          classification,
          is_holiday: isHoliday,
          holiday_name: holidayName,
          appointments_total: point.appointments_total,
          appointments_completed: point.appointments_completed,
          appointments_cancelled: point.appointments_cancelled,
        });
      }
    }

    // Summary counts
    const summary = {
      critical: anomalies.filter(a => a.classification === 'critical').length,
      warning: anomalies.filter(a => a.classification === 'warning').length,
      expected: anomalies.filter(a => a.classification === 'expected').length,
      positive: anomalies.filter(a => a.classification === 'positive').length,
      total: anomalies.length,
    };

    return {
      anomalies,
      summary,
      trend_data: enrichedTrend,
      holidays: allHolidays.map(h => ({
        name: h.name,
        start: h.start.toISOString().slice(0, 10),
        end: h.end.toISOString().slice(0, 10),
      })),
    };
  }

  /**
   * Calculate revenue impact of improving completion rate
   */
  async calculateCompletionRateImpact({ dimension, dimensionValue, currentRate, targetRate, lookbackDays = 90 }) {
    if (!this.pool) {
      throw new Error('Database pool not available');
    }

    const startDate = DateTime.now().minus({ days: lookbackDays }).toISODate();

    // Get average appointment value and volume for the dimension
    let query;
    const params = [startDate];
    let paramIdx = 2;

    if (dimension === 'channel') {
      query = `
        SELECT
          COUNT(*) AS appointments_total,
          AVG(ar.charge_rate * a.units) AS avg_lesson_value
        FROM appointments a
        JOIN services s ON a.service_id = s.service_id
        LEFT JOIN appointment_recipients ar ON a.appointment_id = ar.appointment_id
        WHERE DATE(a.start AT TIME ZONE 'America/New_York') >= $1
          AND a.status IN ('complete', 'cancelled-chargeable', 'cancelled')
          AND a.is_deleted IS NOT TRUE
          AND CASE
            WHEN s.labels::text LIKE '%"Home %' THEN 'home'
            WHEN s.labels @> '"Online"'::jsonb THEN 'digital'
            WHEN s.labels::text LIKE '%"Club %' THEN 'clubs'
            WHEN s.labels::text LIKE '%"School%' THEN 'schools'
            ELSE 'other'
          END = $2
      `;
      params.push(dimensionValue);
    } else if (dimension === 'tutor') {
      query = `
        SELECT
          COUNT(*) AS appointments_total,
          AVG(ar.charge_rate * a.units) AS avg_lesson_value
        FROM appointments a
        JOIN appointment_contractors ac ON a.appointment_id = ac.appointment_id
        LEFT JOIN appointment_recipients ar ON a.appointment_id = ar.appointment_id
        WHERE DATE(a.start AT TIME ZONE 'America/New_York') >= $1
          AND a.status IN ('complete', 'cancelled-chargeable', 'cancelled')
          AND a.is_deleted IS NOT TRUE
          AND ac.contractor_id = $2
      `;
      params.push(dimensionValue);
    } else {
      throw { status: 400, message: 'Unsupported dimension for impact calculation' };
    }

    try {
      const { rows } = await this.pool.query(query, params);
      const row = rows[0];

      if (!row || !row.appointments_total) {
        return {
          dimension,
          dimension_value: dimensionValue,
          error: 'No data found',
        };
      }

      const appointmentsTotal = parseInt(row.appointments_total);
      const avgLessonValue = parseFloat(row.avg_lesson_value || 0);
      const improvementPp = targetRate - currentRate;
      const monthlyAppointments = appointmentsTotal / (lookbackDays / 30);
      const additionalCompletedLessons = monthlyAppointments * improvementPp;
      const monthlyRevenueOpportunity = additionalCompletedLessons * avgLessonValue;
      const annualRevenueOpportunity = monthlyRevenueOpportunity * 12;

      return {
        dimension,
        dimension_value: dimensionValue,
        current_rate: currentRate,
        target_rate: targetRate,
        improvement_pp: improvementPp,
        appointments_in_period: appointmentsTotal,
        avg_lesson_value: avgLessonValue,
        monthly_appointments_estimate: Math.round(monthlyAppointments),
        additional_completed_monthly: Math.round(additionalCompletedLessons * 10) / 10,
        monthly_revenue_opportunity: Math.round(monthlyRevenueOpportunity),
        annual_revenue_opportunity: Math.round(annualRevenueOpportunity),
      };
    } catch (error) {
      logger.error({ error: error.message, dimension, dimensionValue }, 'calculateCompletionRateImpact error');
      throw error;
    }
  }

  /**
   * Compute and store daily completion rate snapshots
   * Called by scheduled job (cron)
   */
  async computeDailySnapshots() {
    if (!this.pool) {
      throw new Error('Database pool not available');
    }

    const snapshotDate = DateTime.now().minus({ days: 1 }).toISODate(); // Yesterday's data
    const startDate = DateTime.now().minus({ days: 91 }).toISODate(); // 90 day lookback

    logger.info({ snapshotDate }, 'Computing daily completion rate snapshots');

    try {
      // Insert channel-level snapshots
      const channelQuery = `
        INSERT INTO completion_rate_snapshots (
          snapshot_date, dimension_type, dimension_value, dimension_display_name,
          appointments_total, appointments_completed, appointments_cancelled,
          completion_rate, revenue_realized, revenue_lost
        )
        SELECT
          $1::date AS snapshot_date,
          'channel' AS dimension_type,
          CASE
            WHEN s.labels::text LIKE '%"Home %' THEN 'home'
            WHEN s.labels @> '"Online"'::jsonb THEN 'digital'
            WHEN s.labels::text LIKE '%"Club %' THEN 'clubs'
            WHEN s.labels::text LIKE '%"School%' THEN 'schools'
            ELSE 'other'
          END AS dimension_value,
          CASE
            WHEN s.labels::text LIKE '%"Home %' THEN 'Home'
            WHEN s.labels @> '"Online"'::jsonb THEN 'Online'
            WHEN s.labels::text LIKE '%"Club %' THEN 'Clubs'
            WHEN s.labels::text LIKE '%"School%' THEN 'Schools'
            ELSE 'Other'
          END AS dimension_display_name,
          COUNT(*) AS appointments_total,
          COUNT(*) FILTER (WHERE a.status IN ('complete', 'cancelled-chargeable')) AS appointments_completed,
          COUNT(*) FILTER (WHERE a.status = 'cancelled') AS appointments_cancelled,
          COUNT(*) FILTER (WHERE a.status IN ('complete', 'cancelled-chargeable'))::NUMERIC / NULLIF(COUNT(*), 0) AS completion_rate,
          SUM(CASE WHEN a.status IN ('complete', 'cancelled-chargeable') THEN COALESCE(ar.charge_rate * a.units, 0) ELSE 0 END) AS revenue_realized,
          SUM(CASE WHEN a.status = 'cancelled' THEN COALESCE(ar.charge_rate * a.units, 0) ELSE 0 END) AS revenue_lost
        FROM appointments a
        JOIN services s ON a.service_id = s.service_id
        LEFT JOIN appointment_recipients ar ON a.appointment_id = ar.appointment_id
        WHERE DATE(a.start AT TIME ZONE 'America/New_York') >= $2
          AND a.status IN ('complete', 'cancelled-chargeable', 'cancelled')
          AND a.is_deleted IS NOT TRUE
        GROUP BY dimension_value, dimension_display_name
        ON CONFLICT (snapshot_date, dimension_type, dimension_value)
        DO UPDATE SET
          appointments_total = EXCLUDED.appointments_total,
          appointments_completed = EXCLUDED.appointments_completed,
          appointments_cancelled = EXCLUDED.appointments_cancelled,
          completion_rate = EXCLUDED.completion_rate,
          revenue_realized = EXCLUDED.revenue_realized,
          revenue_lost = EXCLUDED.revenue_lost
      `;

      const channelResult = await this.pool.query(channelQuery, [snapshotDate, startDate]);

      // Insert overall snapshot
      const overallQuery = `
        INSERT INTO completion_rate_snapshots (
          snapshot_date, dimension_type, dimension_value, dimension_display_name,
          appointments_total, appointments_completed, appointments_cancelled,
          completion_rate, revenue_realized, revenue_lost
        )
        SELECT
          $1::date AS snapshot_date,
          'overall' AS dimension_type,
          NULL AS dimension_value,
          'All Channels' AS dimension_display_name,
          COUNT(*) AS appointments_total,
          COUNT(*) FILTER (WHERE a.status IN ('complete', 'cancelled-chargeable')) AS appointments_completed,
          COUNT(*) FILTER (WHERE a.status = 'cancelled') AS appointments_cancelled,
          COUNT(*) FILTER (WHERE a.status IN ('complete', 'cancelled-chargeable'))::NUMERIC / NULLIF(COUNT(*), 0) AS completion_rate,
          SUM(CASE WHEN a.status IN ('complete', 'cancelled-chargeable') THEN COALESCE(ar.charge_rate * a.units, 0) ELSE 0 END) AS revenue_realized,
          SUM(CASE WHEN a.status = 'cancelled' THEN COALESCE(ar.charge_rate * a.units, 0) ELSE 0 END) AS revenue_lost
        FROM appointments a
        JOIN services s ON a.service_id = s.service_id
        LEFT JOIN appointment_recipients ar ON a.appointment_id = ar.appointment_id
        WHERE DATE(a.start AT TIME ZONE 'America/New_York') >= $2
          AND a.status IN ('complete', 'cancelled-chargeable', 'cancelled')
          AND a.is_deleted IS NOT TRUE
        ON CONFLICT (snapshot_date, dimension_type, dimension_value)
        DO UPDATE SET
          appointments_total = EXCLUDED.appointments_total,
          appointments_completed = EXCLUDED.appointments_completed,
          appointments_cancelled = EXCLUDED.appointments_cancelled,
          completion_rate = EXCLUDED.completion_rate,
          revenue_realized = EXCLUDED.revenue_realized,
          revenue_lost = EXCLUDED.revenue_lost
      `;

      await this.pool.query(overallQuery, [snapshotDate, startDate]);

      logger.info({ snapshotDate, channelsUpdated: channelResult.rowCount }, 'Daily completion rate snapshots computed');

      return {
        snapshot_date: snapshotDate,
        channels_updated: channelResult.rowCount,
      };
    } catch (error) {
      logger.error({ error: error.message, snapshotDate }, 'computeDailySnapshots error');
      throw error;
    }
  }

  /**
   * Get anomaly detection thresholds
   */
  async getThresholds() {
    if (!this.pool) {
      throw new Error('Database pool not available');
    }

    try {
      const { rows } = await this.pool.query(`
        SELECT * FROM completion_rate_thresholds ORDER BY dimension_type, channel
      `);
      return rows;
    } catch (error) {
      logger.error({ error: error.message }, 'getThresholds error');
      throw error;
    }
  }

  /**
   * Detect anomalies based on current completion rates vs thresholds
   * Called after daily snapshot computation
   */
  async detectAndStoreAnomalies({ lookbackDays = 30 } = {}) {
    if (!this.pool) {
      throw new Error('Database pool not available');
    }

    const startDate = DateTime.now().minus({ days: lookbackDays }).toISODate();
    const comparisonStartDate = DateTime.now().minus({ days: 90 }).toISODate();
    const periodStart = startDate;
    const periodEnd = DateTime.now().toISODate();

    try {
      // Get current completion rates by dimension
      const currentRates = await this.getCompletionRatesByDimension({
        dimension: 'tutor',
        lookbackDays,
        minAppointments: 5,
      });

      // Get thresholds
      const thresholds = await this.getThresholds();
      const tutorThreshold = thresholds.find(t => t.dimension_type === 'tutor') || {
        low_rate_threshold: 0.85,
        sudden_drop_threshold: 0.10,
        high_variance_threshold: 0.15,
        min_appointments: 10,
      };

      // Get historical rates for comparison (baseline)
      const baselineRates = await this.getCompletionRatesByDimension({
        dimension: 'tutor',
        lookbackDays: 90,
        minAppointments: 10,
      });

      const baselineMap = new Map(
        baselineRates.breakdown?.map(r => [r.dimension_value, r.completion_rate]) || []
      );

      const anomalies = [];

      for (const item of (currentRates.breakdown || [])) {
        if (item.appointments_total < (tutorThreshold.min_appointments || 10)) continue;

        const baselineRate = baselineMap.get(item.dimension_value) || 0.90;
        const currentRate = item.completion_rate;
        const deviation = baselineRate - currentRate;
        const deviationPercent = baselineRate > 0 ? (deviation / baselineRate) * 100 : 0;

        // Check for low rate anomaly
        if (currentRate < parseFloat(tutorThreshold.low_rate_threshold || 0.85)) {
          const severity = currentRate < 0.70 ? 'critical' :
                          currentRate < 0.80 ? 'high' :
                          currentRate < 0.85 ? 'medium' : 'low';

          anomalies.push({
            dimension_type: 'tutor',
            dimension_value: item.dimension_value,
            dimension_display_name: item.dimension_display_name,
            anomaly_type: 'low_rate',
            severity,
            current_rate: currentRate,
            baseline_rate: baselineRate,
            deviation_percent: deviationPercent,
            appointments_affected: item.appointments_cancelled,
            revenue_impact: item.revenue_lost,
            period_start: periodStart,
            period_end: periodEnd,
            suggested_action: severity === 'critical'
              ? 'Immediate review required. Schedule 1:1 with tutor to discuss lesson reliability.'
              : 'Monitor closely. Check for scheduling conflicts or student-tutor fit issues.',
          });
        }

        // Check for sudden drop
        const dropThreshold = parseFloat(tutorThreshold.sudden_drop_threshold || 0.10);
        if (deviation >= dropThreshold && baselineRate >= 0.90) {
          anomalies.push({
            dimension_type: 'tutor',
            dimension_value: item.dimension_value,
            dimension_display_name: item.dimension_display_name,
            anomaly_type: 'sudden_drop',
            severity: deviation >= 0.15 ? 'high' : 'medium',
            current_rate: currentRate,
            baseline_rate: baselineRate,
            deviation_percent: deviationPercent,
            appointments_affected: item.appointments_cancelled,
            revenue_impact: item.revenue_lost,
            period_start: periodStart,
            period_end: periodEnd,
            suggested_action: 'Completion rate dropped significantly. Investigate recent cancellations for patterns.',
          });
        }

        // Check for improvement (positive anomaly)
        const improvementThreshold = parseFloat(tutorThreshold.improvement_threshold || 0.05);
        if (currentRate - baselineRate >= improvementThreshold && currentRate >= 0.95) {
          anomalies.push({
            dimension_type: 'tutor',
            dimension_value: item.dimension_value,
            dimension_display_name: item.dimension_display_name,
            anomaly_type: 'improving',
            severity: 'low',
            current_rate: currentRate,
            baseline_rate: baselineRate,
            deviation_percent: -deviationPercent, // Positive improvement
            appointments_affected: item.appointments_total,
            revenue_impact: 0,
            period_start: periodStart,
            period_end: periodEnd,
            suggested_action: 'Celebrate! Consider sharing best practices from this tutor.',
          });
        }
      }

      // Store anomalies (avoid duplicates for same dimension/type in same period)
      let insertedCount = 0;
      for (const anomaly of anomalies) {
        try {
          await this.pool.query(`
            INSERT INTO completion_rate_anomalies (
              dimension_type, dimension_value, dimension_display_name,
              anomaly_type, severity, current_rate, baseline_rate,
              deviation_percent, appointments_affected, revenue_impact,
              period_start, period_end, suggested_action
            )
            SELECT $1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13
            WHERE NOT EXISTS (
              SELECT 1 FROM completion_rate_anomalies
              WHERE dimension_type = $1
                AND dimension_value = $2
                AND anomaly_type = $4
                AND period_start = $11
                AND status IN ('open', 'acknowledged')
            )
          `, [
            anomaly.dimension_type,
            String(anomaly.dimension_value), // Convert to string for VARCHAR column
            anomaly.dimension_display_name,
            anomaly.anomaly_type,
            anomaly.severity,
            anomaly.current_rate,
            anomaly.baseline_rate,
            anomaly.deviation_percent,
            anomaly.appointments_affected,
            anomaly.revenue_impact,
            anomaly.period_start,
            anomaly.period_end,
            anomaly.suggested_action,
          ]);
          insertedCount++;
        } catch (err) {
          logger.warn({ error: err.message, anomaly }, 'Failed to insert anomaly');
        }
      }

      logger.info({
        detected: anomalies.length,
        inserted: insertedCount,
        lookbackDays,
      }, 'Anomaly detection completed');

      return {
        detected: anomalies.length,
        inserted: insertedCount,
        anomalies: anomalies.slice(0, 20), // Return first 20 for preview
      };
    } catch (error) {
      logger.error({ error: error.message }, 'detectAndStoreAnomalies error');
      throw error;
    }
  }

  /**
   * Get open anomalies for review
   */
  async getOpenAnomalies({ dimensionType = null, severity = null, limit = 50, offset = 0 } = {}) {
    if (!this.pool) {
      throw new Error('Database pool not available');
    }

    try {
      let whereClause = "WHERE status IN ('open', 'acknowledged')";
      const params = [];
      let paramIdx = 1;

      if (dimensionType) {
        whereClause += ` AND dimension_type = $${paramIdx++}`;
        params.push(dimensionType);
      }

      if (severity) {
        whereClause += ` AND severity = $${paramIdx++}`;
        params.push(severity);
      }

      const countQuery = `SELECT COUNT(*) FROM completion_rate_anomalies ${whereClause}`;
      const { rows: countRows } = await this.pool.query(countQuery, params);
      const total = parseInt(countRows[0].count);

      const query = `
        SELECT *,
          EXTRACT(DAY FROM NOW() - detected_at) as days_open
        FROM completion_rate_anomalies
        ${whereClause}
        ORDER BY
          CASE severity
            WHEN 'critical' THEN 1
            WHEN 'high' THEN 2
            WHEN 'medium' THEN 3
            ELSE 4
          END,
          revenue_impact DESC NULLS LAST,
          detected_at DESC
        LIMIT $${paramIdx++} OFFSET $${paramIdx}
      `;

      params.push(limit, offset);
      const { rows } = await this.pool.query(query, params);

      return {
        anomalies: rows,
        total,
        limit,
        offset,
      };
    } catch (error) {
      logger.error({ error: error.message }, 'getOpenAnomalies error');
      throw error;
    }
  }

  /**
   * Update anomaly status (acknowledge, resolve, dismiss)
   */
  async updateAnomalyStatus({ anomalyId, status, notes = null, reviewedBy = null }) {
    if (!this.pool) {
      throw new Error('Database pool not available');
    }

    const validStatuses = ['open', 'acknowledged', 'resolved', 'dismissed'];
    if (!validStatuses.includes(status)) {
      throw { status: 400, message: `Invalid status. Must be one of: ${validStatuses.join(', ')}` };
    }

    try {
      const updates = ['status = $2', 'updated_at = NOW()'];
      const params = [anomalyId, status];
      let paramIdx = 3;

      if (notes) {
        updates.push(`resolution_notes = $${paramIdx++}`);
        params.push(notes);
      }

      if (reviewedBy) {
        updates.push(`reviewed_by = $${paramIdx++}`, 'reviewed_at = NOW()');
        params.push(reviewedBy);
      }

      if (status === 'resolved') {
        updates.push('resolved_at = NOW()');
      }

      const query = `
        UPDATE completion_rate_anomalies
        SET ${updates.join(', ')}
        WHERE id = $1
        RETURNING *
      `;

      const { rows } = await this.pool.query(query, params);

      if (rows.length === 0) {
        throw { status: 404, message: 'Anomaly not found' };
      }

      logger.info({ anomalyId, status, reviewedBy }, 'Anomaly status updated');
      return rows[0];
    } catch (error) {
      logger.error({ error: error.message, anomalyId, status }, 'updateAnomalyStatus error');
      throw error;
    }
  }

  /**
   * Get anomaly statistics summary
   */
  async getAnomalyStats() {
    if (!this.pool) {
      throw new Error('Database pool not available');
    }

    try {
      const { rows } = await this.pool.query(`
        SELECT
          COUNT(*) FILTER (WHERE status = 'open') as open_count,
          COUNT(*) FILTER (WHERE status = 'acknowledged') as acknowledged_count,
          COUNT(*) FILTER (WHERE status = 'resolved' AND resolved_at > NOW() - INTERVAL '7 days') as resolved_this_week,
          COUNT(*) FILTER (WHERE severity = 'critical' AND status IN ('open', 'acknowledged')) as critical_open,
          COUNT(*) FILTER (WHERE severity = 'high' AND status IN ('open', 'acknowledged')) as high_open,
          SUM(revenue_impact) FILTER (WHERE status IN ('open', 'acknowledged')) as total_revenue_at_risk,
          COUNT(*) FILTER (WHERE anomaly_type = 'improving' AND detected_at > NOW() - INTERVAL '7 days') as improvements_this_week
        FROM completion_rate_anomalies
      `);

      return rows[0];
    } catch (error) {
      logger.error({ error: error.message }, 'getAnomalyStats error');
      throw error;
    }
  }
}

module.exports = ForecastService;
