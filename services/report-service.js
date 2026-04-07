/**
 * Report Service
 * Generates and sends weekly/monthly analytics reports
 */

const { DateTime } = require('luxon');
const axios = require('axios');
const http = require('http');
const https = require('https');
const { getInstance: getBrevoEmailSender } = require('../utils/brevo-email-sender');
const { TRIAL_PRICE } = require('../config/constants');
const { getCurrentEnvironment } = require('../config/environments');
const { generateReportEmail, generateChartImage } = require('../utils/report-email-template');
const { logger } = require('../utils/logger');

// Create HTTP agents with higher connection limits to prevent internal API call bottlenecks
// Default Node.js limit is 5 sockets per host - we need more for parallel API calls
const httpAgent = new http.Agent({ keepAlive: true, maxSockets: 50 });
const httpsAgent = new https.Agent({ keepAlive: true, maxSockets: 50, rejectUnauthorized: false });

class ReportService {
  /**
   * Generate analytics data for a date range
   * Now runs all HTTP calls in parallel for better performance
   */
  async generateAnalyticsData(startDate, endDate, reportType = 'monthly', trendsEndDate = null) {
    try {
      // Use internal API calls - construct URL based on environment
      // For Heroku/scheduled jobs, use the BASE_URL env var
      // For local development, use localhost
      const baseUrl = process.env.BASE_URL || (process.env.NODE_ENV === 'production' ? 'https://join.acmeops.com' : 'http://localhost:3000');
      const startISO = DateTime.fromISO(startDate).toISODate();
      const endISO = DateTime.fromISO(endDate).toISODate();
      const trendsView = reportType === 'weekly' ? 'weekly' : 'monthly';
      const trendsEnd = trendsEndDate || endISO;
      const authHeaders = process.env.REPORT_AUTH_TOKEN ? { Authorization: `Bearer ${process.env.REPORT_AUTH_TOKEN}` } : {};

      // Use custom agent for higher connection limits
      const agent = baseUrl.startsWith('https') ? httpsAgent : httpAgent;

      // Fetch all data in parallel for better performance
      const [analyticsResponse, trendsResponse, marketingResponse] = await Promise.all([
        // Main analytics
        axios.get(`${baseUrl}/api/analytics`, {
          params: { tab: 'all', view: 'monthly', start: startISO, end: endISO },
          headers: authHeaders,
          timeout: 120000,
          httpAgent: httpAgent,
          httpsAgent: httpsAgent
        }),
        // Trends data
        axios.get(`${baseUrl}/api/analytics/trends`, {
          params: { tab: 'all', view: trendsView, end: trendsEnd },
          headers: authHeaders,
          timeout: 120000,
          httpAgent: httpAgent,
          httpsAgent: httpsAgent
        }),
        // Marketing summary (gracefully handle failure)
        axios.get(`${baseUrl}/api/reports/marketing-summary`, {
          params: { start: startISO, end: endISO },
          headers: authHeaders,
          timeout: 60000,
          httpAgent: httpAgent,
          httpsAgent: httpsAgent
        }).catch((error) => {
          logger.warn({ data: error.message }, 'Marketing summary fetch failed, continuing without it:');
          return { data: null };
        })
      ]);

      return {
        analytics: analyticsResponse.data,
        trends: trendsResponse.data,
        marketing: marketingResponse.data
      };
    } catch (error) {
      logger.error({ err: error }, 'Error generating analytics data:');
      throw error;
    }
  }

  /**
   * Generate multi-period analytics data (3 weeks or 3 months)
   * Returns normalized structure with current, previous, twoPeriodsAgo, deltas, and momentum
   * @param {string} reportType - 'weekly' or 'monthly'
   * @param {number} weekOffset - Number of weeks to offset from current
   * @param {number} monthOffset - Number of months to offset from current
   * @param {boolean} includeYoY - Whether to include year-over-year comparison data
   */
  async generateMultiPeriodAnalytics(reportType, weekOffset = 0, monthOffset = 0, includeYoY = false, quarterOffset = 0, yearOffset = 0) {
    try {
      const baseUrl = process.env.BASE_URL || (process.env.NODE_ENV === 'production' ? 'https://join.acmeops.com' : 'http://localhost:3000');

      let currentPeriod, previousPeriod, twoPeriodsAgo;
      let yoyCurrentPeriod, yoyPreviousPeriod, yoyTwoPeriodsAgoPeriod;

      const makePeriod = (start, end) => ({
        start: start.toISODate(),
        end: end.toISODate(),
        startDateTime: start,
        endDateTime: end
      });

      if (reportType === 'weekly') {
        const now = DateTime.now().setZone('America/New_York').minus({ weeks: weekOffset });
        let daysToSubtract = now.weekday === 7 ? 1 : now.weekday + 1;
        const lastSaturday = now.minus({ days: daysToSubtract });
        const lastSunday = lastSaturday.minus({ days: 6 }).startOf('day');

        currentPeriod = makePeriod(lastSunday, lastSaturday.endOf('day'));
        previousPeriod = makePeriod(lastSunday.minus({ weeks: 1 }), lastSaturday.minus({ weeks: 1 }).endOf('day'));
        twoPeriodsAgo = makePeriod(lastSunday.minus({ weeks: 2 }), lastSaturday.minus({ weeks: 2 }).endOf('day'));

        if (includeYoY) {
          yoyCurrentPeriod = makePeriod(lastSunday.minus({ years: 1 }), lastSaturday.minus({ years: 1 }).endOf('day'));
          yoyPreviousPeriod = makePeriod(lastSunday.minus({ weeks: 1, years: 1 }), lastSaturday.minus({ weeks: 1, years: 1 }).endOf('day'));
          yoyTwoPeriodsAgoPeriod = makePeriod(lastSunday.minus({ weeks: 2, years: 1 }), lastSaturday.minus({ weeks: 2, years: 1 }).endOf('day'));
        }
      } else if (reportType === 'quarterly') {
        const now = DateTime.now().setZone('America/New_York');
        // Current quarter minus offset
        const refDate = now.minus({ months: quarterOffset * 3 });
        const quarter = Math.ceil(refDate.month / 3);
        const qStart = DateTime.fromObject({ year: refDate.year, month: (quarter - 1) * 3 + 1, day: 1 }, { zone: 'America/New_York' });
        const qEnd = qStart.plus({ months: 3 }).minus({ days: 1 }).endOf('day');

        currentPeriod = makePeriod(qStart, qEnd);
        const prevQStart = qStart.minus({ months: 3 });
        const prevQEnd = prevQStart.plus({ months: 3 }).minus({ days: 1 }).endOf('day');
        previousPeriod = makePeriod(prevQStart, prevQEnd);
        const twoQStart = qStart.minus({ months: 6 });
        const twoQEnd = twoQStart.plus({ months: 3 }).minus({ days: 1 }).endOf('day');
        twoPeriodsAgo = makePeriod(twoQStart, twoQEnd);

        if (includeYoY) {
          yoyCurrentPeriod = makePeriod(qStart.minus({ years: 1 }), qEnd.minus({ years: 1 }));
          yoyPreviousPeriod = makePeriod(prevQStart.minus({ years: 1 }), prevQEnd.minus({ years: 1 }));
          yoyTwoPeriodsAgoPeriod = makePeriod(twoQStart.minus({ years: 1 }), twoQEnd.minus({ years: 1 }));
        }
      } else if (reportType === 'annually') {
        const now = DateTime.now().setZone('America/New_York');
        const refYear = now.minus({ years: yearOffset });

        const yStart = refYear.startOf('year');
        const yEnd = refYear.endOf('year');
        currentPeriod = makePeriod(yStart, yEnd);
        previousPeriod = makePeriod(yStart.minus({ years: 1 }), yEnd.minus({ years: 1 }));
        twoPeriodsAgo = makePeriod(yStart.minus({ years: 2 }), yEnd.minus({ years: 2 }));

        // YoY doesn't make sense for annual view (it would be the same as previous year)
        // but we include it for consistency — comparing to 1 year prior
        if (includeYoY) {
          yoyCurrentPeriod = makePeriod(yStart.minus({ years: 1 }), yEnd.minus({ years: 1 }));
          yoyPreviousPeriod = makePeriod(yStart.minus({ years: 2 }), yEnd.minus({ years: 2 }));
          yoyTwoPeriodsAgoPeriod = makePeriod(yStart.minus({ years: 3 }), yEnd.minus({ years: 3 }));
        }
      } else {
        // monthly
        const now = DateTime.now().setZone('America/New_York').minus({ months: monthOffset });
        const lastMonth = now.minus({ months: 1 });

        currentPeriod = makePeriod(lastMonth.startOf('month'), lastMonth.endOf('month'));
        previousPeriod = makePeriod(lastMonth.minus({ months: 1 }).startOf('month'), lastMonth.minus({ months: 1 }).endOf('month'));
        twoPeriodsAgo = makePeriod(lastMonth.minus({ months: 2 }).startOf('month'), lastMonth.minus({ months: 2 }).endOf('month'));

        if (includeYoY) {
          const lastYearMonth = lastMonth.minus({ years: 1 });
          yoyCurrentPeriod = makePeriod(lastYearMonth.startOf('month'), lastYearMonth.endOf('month'));
          yoyPreviousPeriod = makePeriod(lastYearMonth.minus({ months: 1 }).startOf('month'), lastYearMonth.minus({ months: 1 }).endOf('month'));
          yoyTwoPeriodsAgoPeriod = makePeriod(lastYearMonth.minus({ months: 2 }).startOf('month'), lastYearMonth.minus({ months: 2 }).endOf('month'));
        }
      }

      // Fetch all periods in parallel (including YoY periods if requested)
      const fetchPromises = [
        this.generateAnalyticsData(currentPeriod.start, currentPeriod.end, reportType),
        this.generateAnalyticsData(previousPeriod.start, previousPeriod.end, reportType),
        this.generateAnalyticsData(twoPeriodsAgo.start, twoPeriodsAgo.end, reportType)
      ];

      if (includeYoY) {
        fetchPromises.push(
          this.generateAnalyticsData(yoyCurrentPeriod.start, yoyCurrentPeriod.end, reportType),
          this.generateAnalyticsData(yoyPreviousPeriod.start, yoyPreviousPeriod.end, reportType),
          this.generateAnalyticsData(yoyTwoPeriodsAgoPeriod.start, yoyTwoPeriodsAgoPeriod.end, reportType)
        );
      }

      const results = await Promise.all(fetchPromises);
      const [currentData, previousData, twoPeriodsAgoData] = results;
      const yoyCurrentData = includeYoY ? results[3] : null;
      const yoyPreviousData = includeYoY ? results[4] : null;
      const yoyTwoPeriodsAgoData = includeYoY ? results[5] : null;
      
      // Extract and normalize totals
      const extractTotals = (data) => {
        const totals = data?.analytics?.totals || {};
        return {
          totalLessons: totals.totalLessons || 0,
          totalHours: totals.totalHours || 0,
          totalStudents: totals.totalStudents || 0,
          activeTutors: totals.totalActiveTutors || 0,
          totalRevenue: totals.totalRevenue || 0,
          totalTutorPay: totals.totalTutorPay || 0,
          totalAdhocPay: totals.totalAdhocPay || 0,
          totalProfit: (totals.totalRevenue || 0) - (totals.totalTutorPay || 0) - (totals.totalAdhocPay || 0),
          marginPct: totals.profitMarginPct || 0
        };
      };
      
      const currentTotals = extractTotals(currentData);
      const previousTotals = extractTotals(previousData);
      const twoPeriodsAgoTotals = extractTotals(twoPeriodsAgoData);
      const yoyCurrentTotals = yoyCurrentData ? extractTotals(yoyCurrentData) : null;
      const yoyPreviousTotals = yoyPreviousData ? extractTotals(yoyPreviousData) : null;
      const yoyTwoPeriodsAgoTotals = yoyTwoPeriodsAgoData ? extractTotals(yoyTwoPeriodsAgoData) : null;

      // Calculate days in each period for daily-average normalization (monthly/quarterly)
      const daysIn = (period) => {
        const start = DateTime.fromISO(period.start);
        const end = DateTime.fromISO(period.end);
        return Math.round(end.diff(start, 'days').days) + 1;
      };
      const currentDays = daysIn(currentPeriod);
      const previousDays = daysIn(previousPeriod);
      const twoPeriodsAgoDays = daysIn(twoPeriodsAgo);
      const yoyCurrentDays = includeYoY ? daysIn(yoyCurrentPeriod) : null;
      const yoyPreviousDays = includeYoY ? daysIn(yoyPreviousPeriod) : null;
      const yoyTwoPeriodsAgoDays = includeYoY ? daysIn(yoyTwoPeriodsAgoPeriod) : null;

      // For monthly reports, normalize flow metrics (revenue, lessons, hours, pay, profit)
      // to daily averages before computing % change so Feb (28d) vs Jan (31d) is fair.
      // Count/snapshot metrics (activeTutors, totalStudents) are NOT normalized.
      const shouldNormalize = reportType === 'monthly' || reportType === 'quarterly';
      const flowMetrics = new Set(['totalRevenue', 'totalTutorPay', 'totalProfit', 'totalAdhocPay', 'totalLessons', 'totalHours']);

      // Calculate deltas — normalized to daily averages for flow metrics in monthly/quarterly
      const calculateDelta = (current, previous, currDays = currentDays, prevDays = previousDays, metricKey = null) => {
        if (previous === 0) return current > 0 ? 100 : 0;
        if (shouldNormalize && metricKey && flowMetrics.has(metricKey)) {
          const currDaily = current / currDays;
          const prevDaily = previous / prevDays;
          if (prevDaily === 0) return currDaily > 0 ? 100 : 0;
          return ((currDaily - prevDaily) / prevDaily) * 100;
        }
        return ((current - previous) / previous) * 100;
      };

      // Helper to build deltas for a single metric key across all period comparisons
      const buildMetricDeltas = (key) => ({
        vsPrevious: calculateDelta(currentTotals[key], previousTotals[key], currentDays, previousDays, key),
        vsTwoPeriodsAgo: calculateDelta(currentTotals[key], twoPeriodsAgoTotals[key], currentDays, twoPeriodsAgoDays, key),
        ...(yoyCurrentTotals && { yoyCurrent: calculateDelta(currentTotals[key], yoyCurrentTotals[key], currentDays, yoyCurrentDays, key) }),
        ...(yoyPreviousTotals && { yoyPrevious: calculateDelta(previousTotals[key], yoyPreviousTotals[key], previousDays, yoyPreviousDays, key) }),
        ...(yoyTwoPeriodsAgoTotals && { yoyTwoAgo: calculateDelta(twoPeriodsAgoTotals[key], yoyTwoPeriodsAgoTotals[key], twoPeriodsAgoDays, yoyTwoPeriodsAgoDays, key) })
      });

      const deltas = {
        totalLessons: buildMetricDeltas('totalLessons'),
        totalHours: buildMetricDeltas('totalHours'),
        totalStudents: buildMetricDeltas('totalStudents'),
        activeTutors: buildMetricDeltas('activeTutors'),
        totalRevenue: buildMetricDeltas('totalRevenue'),
        totalTutorPay: buildMetricDeltas('totalTutorPay'),
        totalProfit: buildMetricDeltas('totalProfit'),
        totalAdhocPay: buildMetricDeltas('totalAdhocPay')
      };
      
      // Calculate momentum scores (+2 to -2)
      const calculateMomentum = (vsPrev, vsTwoAgo) => {
        const prevImproving = vsPrev > 0.5;
        const twoAgoImproving = vsTwoAgo > 0.5;
        if (prevImproving && twoAgoImproving) return 2;
        if (prevImproving && !twoAgoImproving) return 1;
        if (!prevImproving && twoAgoImproving) return -1;
        if (!prevImproving && !twoAgoImproving) return -2;
        return 0; // mixed/neutral
      };
      
      const momentum = {
        totalLessons: calculateMomentum(deltas.totalLessons.vsPrevious, deltas.totalLessons.vsTwoPeriodsAgo),
        totalHours: calculateMomentum(deltas.totalHours.vsPrevious, deltas.totalHours.vsTwoPeriodsAgo),
        totalStudents: calculateMomentum(deltas.totalStudents.vsPrevious, deltas.totalStudents.vsTwoPeriodsAgo),
        activeTutors: calculateMomentum(deltas.activeTutors.vsPrevious, deltas.activeTutors.vsTwoPeriodsAgo),
        totalRevenue: calculateMomentum(deltas.totalRevenue.vsPrevious, deltas.totalRevenue.vsTwoPeriodsAgo),
        totalTutorPay: calculateMomentum(deltas.totalTutorPay.vsPrevious, deltas.totalTutorPay.vsTwoPeriodsAgo),
        totalProfit: calculateMomentum(deltas.totalProfit.vsPrevious, deltas.totalProfit.vsTwoPeriodsAgo),
        totalAdhocPay: calculateMomentum(deltas.totalAdhocPay.vsPrevious, deltas.totalAdhocPay.vsTwoPeriodsAgo)
      };
      
      // Fetch category data for all three periods - all 12 calls in parallel
      const categoryLabels = { 'Home': 'Home', 'Online': 'Online', 'Club': 'Club', 'School': 'School' };
      const categoryData = {};
      const authHeaders = { ...(process.env.REPORT_AUTH_TOKEN && { Authorization: `Bearer ${process.env.REPORT_AUTH_TOKEN}` }) };

      const extractCatTotals = (data) => {
        const totals = data?.totals || {};
        return {
          lessons: totals.totalLessons || 0,
          hours: totals.totalHours || 0,
          revenue: totals.totalRevenue || 0,
          profit: (totals.totalRevenue || 0) - (totals.totalTutorPay || 0) - (totals.totalAdhocPay || 0)
        };
      };

      // Build all 12 category API calls (4 categories × 3 periods) for parallel execution
      // Using custom HTTP agents for higher connection limits
      const categoryKeys = Object.keys(categoryLabels);
      const allCategoryPromises = categoryKeys.flatMap((category) => {
        const labelPattern = categoryLabels[category];
        return [
          axios.get(`${baseUrl}/api/analytics`, {
            params: { tab: 'all', view: 'monthly', start: currentPeriod.start, end: currentPeriod.end, labels: labelPattern },
            headers: authHeaders,
            timeout: 120000,
            httpAgent: httpAgent,
            httpsAgent: httpsAgent
          }).catch(() => ({ data: null })),
          axios.get(`${baseUrl}/api/analytics`, {
            params: { tab: 'all', view: 'monthly', start: previousPeriod.start, end: previousPeriod.end, labels: labelPattern },
            headers: authHeaders,
            timeout: 120000,
            httpAgent: httpAgent,
            httpsAgent: httpsAgent
          }).catch(() => ({ data: null })),
          axios.get(`${baseUrl}/api/analytics`, {
            params: { tab: 'all', view: 'monthly', start: twoPeriodsAgo.start, end: twoPeriodsAgo.end, labels: labelPattern },
            headers: authHeaders,
            timeout: 120000,
            httpAgent: httpAgent,
            httpsAgent: httpsAgent
          }).catch(() => ({ data: null }))
        ];
      });

      const allCategoryResults = await Promise.all(allCategoryPromises);

      // Process results: every 3 elements = [current, previous, twoAgo] for each category
      categoryKeys.forEach((category, idx) => {
        const baseIdx = idx * 3;
        categoryData[category] = {
          current: extractCatTotals(allCategoryResults[baseIdx]?.data),
          previous: extractCatTotals(allCategoryResults[baseIdx + 1]?.data),
          twoPeriodsAgo: extractCatTotals(allCategoryResults[baseIdx + 2]?.data)
        };
      });
      
      // Fetch segment-specific metrics for all periods (including YoY if requested)
      let segmentMetrics = null;
      try {
        const pool = global.pool;
        if (pool) {
          const segmentPromises = [
            this.fetchSegmentMetrics(pool, currentPeriod.start, currentPeriod.end),
            this.fetchSegmentMetrics(pool, previousPeriod.start, previousPeriod.end),
            this.fetchSegmentMetrics(pool, twoPeriodsAgo.start, twoPeriodsAgo.end)
          ];

          if (includeYoY) {
            segmentPromises.push(
              this.fetchSegmentMetrics(pool, yoyCurrentPeriod.start, yoyCurrentPeriod.end),
              this.fetchSegmentMetrics(pool, yoyPreviousPeriod.start, yoyPreviousPeriod.end),
              this.fetchSegmentMetrics(pool, yoyTwoPeriodsAgoPeriod.start, yoyTwoPeriodsAgoPeriod.end)
            );
          }

          const segmentResults = await Promise.all(segmentPromises);
          const [cwMetrics, pwMetrics, twoWMetrics] = segmentResults;

          segmentMetrics = {
            current: cwMetrics,
            previous: pwMetrics,
            twoPeriodsAgo: twoWMetrics
          };

          if (includeYoY) {
            segmentMetrics.yoyCurrent = segmentResults[3];
            segmentMetrics.yoyPrevious = segmentResults[4];
            segmentMetrics.yoyTwoPeriodsAgo = segmentResults[5];
          }
        }
      } catch (error) {
        logger.warn({ data: error.message }, 'Could not fetch segment metrics:');
      }

      // Fetch total business metrics for all periods (including YoY if requested)
      let totalBusinessMetrics = null;
      try {
        const pool = global.pool;
        if (pool) {
          const totalPromises = [
            this.fetchTotalBusinessMetrics(pool, currentPeriod.start, currentPeriod.end, reportType),
            this.fetchTotalBusinessMetrics(pool, previousPeriod.start, previousPeriod.end, reportType),
            this.fetchTotalBusinessMetrics(pool, twoPeriodsAgo.start, twoPeriodsAgo.end, reportType)
          ];

          if (includeYoY) {
            totalPromises.push(
              this.fetchTotalBusinessMetrics(pool, yoyCurrentPeriod.start, yoyCurrentPeriod.end, reportType),
              this.fetchTotalBusinessMetrics(pool, yoyPreviousPeriod.start, yoyPreviousPeriod.end, reportType),
              this.fetchTotalBusinessMetrics(pool, yoyTwoPeriodsAgoPeriod.start, yoyTwoPeriodsAgoPeriod.end, reportType)
            );
          }

          const totalResults = await Promise.all(totalPromises);
          const [cwTotal, pwTotal, twoWTotal] = totalResults;

          totalBusinessMetrics = {
            current: cwTotal,
            previous: pwTotal,
            twoPeriodsAgo: twoWTotal
          };

          if (includeYoY) {
            totalBusinessMetrics.yoyCurrent = totalResults[3];
            totalBusinessMetrics.yoyPrevious = totalResults[4];
            totalBusinessMetrics.yoyTwoPeriodsAgo = totalResults[5];
          }
        }
      } catch (error) {
        logger.warn({ data: error.message }, 'Could not fetch total business metrics:');
      }

      // Build response
      const response = {
        currentPeriod: {
          totals: currentTotals,
          analytics: currentData.analytics,
          dateRange: currentPeriod,
          daysInPeriod: currentDays
        },
        previousPeriod: {
          totals: previousTotals,
          analytics: previousData.analytics,
          dateRange: previousPeriod,
          daysInPeriod: previousDays
        },
        twoPeriodsAgo: {
          totals: twoPeriodsAgoTotals,
          analytics: twoPeriodsAgoData.analytics,
          dateRange: twoPeriodsAgo,
          daysInPeriod: twoPeriodsAgoDays
        },
        deltas,
        dayNormalized: shouldNormalize,
        momentum,
        categoryData,
        segmentMetrics,
        totalBusinessMetrics,
        trends: currentData.trends
      };

      // Add YoY data for all 3 periods if requested
      if (includeYoY) {
        response.yoyData = {
          current: {
            totals: yoyCurrentTotals,
            analytics: yoyCurrentData?.analytics,
            dateRange: yoyCurrentPeriod
          },
          previous: {
            totals: yoyPreviousTotals,
            analytics: yoyPreviousData?.analytics,
            dateRange: yoyPreviousPeriod
          },
          twoPeriodsAgo: {
            totals: yoyTwoPeriodsAgoTotals,
            analytics: yoyTwoPeriodsAgoData?.analytics,
            dateRange: yoyTwoPeriodsAgoPeriod
          }
        };
      }

      return response;
    } catch (error) {
      logger.error({ err: error }, 'Error generating multi-period analytics:');
      throw error;
    }
  }

  /**
   * Fetch segment-specific metrics for Executive Reports
   * Returns metrics organized by segment: home, online, schools, club
   */
  async fetchSegmentMetrics(pool, startDate, endDate) {
    const client = await pool.connect();
    try {
      // Convert dates to proper timestamps for queries
      const startUTC = DateTime.fromISO(startDate).setZone('America/New_York').startOf('day').toUTC().toISO();
      const endUTC = DateTime.fromISO(endDate).setZone('America/New_York').endOf('day').toUTC().toISO();
      const startDateOnly = startDate.split('T')[0];
      const endDateOnly = endDate.split('T')[0];

      // Define all queries for parallel execution
      // 1. New Leads by segment (PAID trial bookings from booking_submissions)
      // Detects trials by is_trial flag OR booking_type containing 'trial'
      const newLeadsQuery = `
        SELECT
          CASE
            WHEN COALESCE(lesson_type, booking_type, '') ILIKE '%home%' THEN 'Home'
            WHEN COALESCE(lesson_type, booking_type, '') ILIKE '%online%' THEN 'Online'
            WHEN COALESCE(lesson_type, booking_type, '') ILIKE '%club%' THEN 'Club'
            ELSE 'Unknown'
          END AS segment,
          COUNT(*) AS new_leads
        FROM booking_submissions
        WHERE created_at >= $1::timestamptz AND created_at <= $2::timestamptz
          AND (is_trial = true OR COALESCE(booking_type, '') ILIKE '%trial%')
          AND payment_status IN ('paid', 'verified')
        GROUP BY segment
      `;

      // 2. Trial Lessons by segment (completed appointments detected as trials)
      // Labels are location-specific (e.g. "Home - NYC", "Club - Park Slope") so use text matching
      const trialLessonsQuery = `
        WITH trial_detection AS (
          SELECT
            a.appointment_id,
            CASE
              WHEN s.labels::text LIKE '%"Home %' THEN 'Home'
              WHEN s.labels @> '"Online"'::jsonb THEN 'Online'
              WHEN s.labels::text LIKE '%"Club %' THEN 'Club'
              ELSE 'Unknown'
            END AS segment
          FROM appointments a
          JOIN services s ON a.service_id = s.service_id
          LEFT JOIN appointment_recipients ar ON ar.appointment_id = a.appointment_id AND ar.status <> 'missed'
          WHERE a.status = 'complete'
            AND a.is_deleted IS NOT TRUE
            AND a.start >= $1::timestamptz AND a.start <= $2::timestamptz
            AND (
              a.topic ILIKE '%trial%'
              OR s.labels @> '"Trial"'::jsonb
              OR (ar.charge_rate > 0 AND ar.charge_rate <= ${TRIAL_PRICE})
            )
        )
        SELECT segment, COUNT(DISTINCT appointment_id) AS trial_lessons
        FROM trial_detection
        WHERE segment IN ('Home', 'Online', 'Club')
        GROUP BY segment
      `;

      // 3. First Paid Lessons (clients' first NON-trial lesson in this period)
      const firstPaidLessonsQuery = `
        WITH client_lessons AS (
          SELECT
            ar.paying_client_id,
            a.start,
            CASE
              WHEN s.labels::text LIKE '%"Home %' THEN 'Home'
              WHEN s.labels @> '"Online"'::jsonb THEN 'Online'
              ELSE 'Unknown'
            END AS segment,
            CASE WHEN (
              a.topic ILIKE '%trial%'
              OR s.labels @> '"Trial"'::jsonb
              OR (ar.charge_rate > 0 AND ar.charge_rate <= ${TRIAL_PRICE})
            ) THEN true ELSE false END AS is_trial
          FROM appointment_recipients ar
          JOIN appointments a ON a.appointment_id = ar.appointment_id
          JOIN services s ON a.service_id = s.service_id
          WHERE a.status = 'complete'
            AND a.is_deleted IS NOT TRUE
            AND ar.paying_client_id IS NOT NULL
            AND ar.status <> 'missed'
        ),
        client_first_paid AS (
          SELECT paying_client_id, segment, MIN(start) AS first_paid_date
          FROM client_lessons
          WHERE is_trial = false
          GROUP BY paying_client_id, segment
        )
        SELECT segment, COUNT(DISTINCT paying_client_id) AS first_paid_lessons
        FROM client_first_paid
        WHERE first_paid_date >= $1::timestamptz AND first_paid_date <= $2::timestamptz
        GROUP BY segment
      `;

      // 4. Third lessons (clients who had their 3rd NON-TRIAL lesson in this period)
      // Trial lessons are excluded from the count - must match report-drilldown-service.js logic
      const thirdLessonsQuery = `
        WITH distinct_client_appointments AS (
          -- Get distinct appointments per paying client (avoids counting siblings twice)
          SELECT DISTINCT
            ar.paying_client_id,
            a.appointment_id,
            a.start,
            CASE
              WHEN s.labels::text LIKE '%"Home %' THEN 'Home'
              WHEN s.labels @> '"Online"'::jsonb THEN 'Online'
              WHEN s.labels::text LIKE '%"Club %' THEN 'Club'
              WHEN s.labels::text LIKE '%"School%' THEN 'School'
              ELSE 'Unknown'
            END AS segment
          FROM appointment_recipients ar
          JOIN appointments a ON a.appointment_id = ar.appointment_id
          JOIN services s ON a.service_id = s.service_id
          WHERE a.status = 'complete'
            AND a.is_deleted IS NOT TRUE
            AND ar.paying_client_id IS NOT NULL
            AND ar.status <> 'missed'
            -- Exclude trial lessons: charged at trial price ($${TRIAL_PRICE} or less)
            -- Lessons named 'trial' but charged full price are NOT trials
            AND NOT (ar.charge_rate > 0 AND ar.charge_rate <= ${TRIAL_PRICE})
        ),
        client_lessons AS (
          SELECT
            paying_client_id,
            start,
            segment,
            ROW_NUMBER() OVER (PARTITION BY paying_client_id ORDER BY start, appointment_id) AS lesson_number
          FROM distinct_client_appointments
        )
        SELECT
          segment,
          COUNT(DISTINCT paying_client_id) AS third_lessons
        FROM client_lessons
        WHERE lesson_number = 3
          AND start >= $1::timestamptz AND start <= $2::timestamptz
        GROUP BY segment
      `;

      // 5. Active Students by segment (DISTINCT students in completed lessons)
      const activeStudentsQuery = `
        SELECT
          CASE
            WHEN s.labels::text LIKE '%"Home %' THEN 'Home'
            WHEN s.labels @> '"Online"'::jsonb THEN 'Online'
            WHEN s.labels::text LIKE '%"Club %' THEN 'Club'
            WHEN s.labels::text LIKE '%"School%' THEN 'School'
            ELSE 'Unknown'
          END AS segment,
          COUNT(DISTINCT ar.recipient_id) AS active_students
        FROM appointment_recipients ar
        JOIN appointments a ON a.appointment_id = ar.appointment_id
        JOIN services s ON a.service_id = s.service_id
        WHERE a.status = 'complete'
          AND a.is_deleted IS NOT TRUE
          AND a.start >= $1::timestamptz AND a.start <= $2::timestamptz
          AND ar.status <> 'missed'
        GROUP BY
          CASE
            WHEN s.labels::text LIKE '%"Home %' THEN 'Home'
            WHEN s.labels @> '"Online"'::jsonb THEN 'Online'
            WHEN s.labels::text LIKE '%"Club %' THEN 'Club'
            WHEN s.labels::text LIKE '%"School%' THEN 'School'
            ELSE 'Unknown'
          END
      `;

      // 6. Tutors by segment
      const tutorsQuery = `
        SELECT
          CASE
            WHEN s.labels::text LIKE '%"Home %' THEN 'Home'
            WHEN s.labels @> '"Online"'::jsonb THEN 'Online'
            WHEN s.labels::text LIKE '%"Club %' AND s.labels::text NOT LIKE '%Support%' THEN 'Club'
            WHEN s.labels::text LIKE '%"School%' THEN 'School'
            ELSE 'Unknown'
          END AS segment,
          COUNT(DISTINCT ac.contractor_id) AS tutors
        FROM appointment_contractors ac
        JOIN appointments a ON a.appointment_id = ac.appointment_id
        JOIN services s ON a.service_id = s.service_id
        WHERE a.status IN ('complete', 'cancelled-chargeable')
          AND a.is_deleted IS NOT TRUE
          AND a.start >= $1::timestamptz AND a.start <= $2::timestamptz
          AND s.labels::text NOT LIKE '%Non Teaching%'
          AND s.labels::text NOT LIKE '%Support%'
        GROUP BY
          CASE
            WHEN s.labels::text LIKE '%"Home %' THEN 'Home'
            WHEN s.labels @> '"Online"'::jsonb THEN 'Online'
            WHEN s.labels::text LIKE '%"Club %' AND s.labels::text NOT LIKE '%Support%' THEN 'Club'
            WHEN s.labels::text LIKE '%"School%' THEN 'School'
            ELSE 'Unknown'
          END
      `;

      // 7. Active schools (distinct schools by name with lessons)
      const activeSchoolsQuery = `
        SELECT COUNT(DISTINCT SPLIT_PART(s.name, ' // ', 1)) AS active_schools
        FROM appointments a
        JOIN services s ON a.service_id = s.service_id
        WHERE a.status IN ('complete', 'cancelled-chargeable')
          AND a.is_deleted IS NOT TRUE
          AND a.start >= $1::timestamptz AND a.start <= $2::timestamptz
          AND s.labels::text LIKE '%"School%'
      `;

      // 8. Classes held (for schools and clubs)
      const classesHeldQuery = `
        SELECT
          CASE
            WHEN s.labels::text LIKE '%"Club %' THEN 'Club'
            WHEN s.labels::text LIKE '%"School%' THEN 'School'
            ELSE 'Other'
          END AS segment,
          COUNT(DISTINCT a.appointment_id) AS classes_held
        FROM appointments a
        JOIN services s ON a.service_id = s.service_id
        WHERE a.status IN ('complete', 'cancelled-chargeable')
          AND a.is_deleted IS NOT TRUE
          AND a.start >= $1::timestamptz AND a.start <= $2::timestamptz
          AND (s.labels::text LIKE '%"Club %' OR s.labels::text LIKE '%"School%')
        GROUP BY
          CASE
            WHEN s.labels::text LIKE '%"Club %' THEN 'Club'
            WHEN s.labels::text LIKE '%"School%' THEN 'School'
            ELSE 'Other'
          END
      `;

      // 9. Camp Sessions (individual camp appointments)
      const campSessionsQuery = `
        SELECT COUNT(DISTINCT a.appointment_id) AS camp_sessions
        FROM appointments a
        JOIN services s ON a.service_id = s.service_id
        WHERE a.status IN ('complete', 'cancelled-chargeable')
          AND a.is_deleted IS NOT TRUE
          AND a.start >= $1::timestamptz AND a.start <= $2::timestamptz
          AND (s.name ILIKE '%camp%' OR s.labels @> '"Camp"'::jsonb)
      `;

      // 10. Camp Days (distinct calendar dates with camp lessons)
      const campDaysQuery = `
        SELECT COUNT(DISTINCT DATE(a.start AT TIME ZONE 'America/New_York')) AS camp_days
        FROM appointments a
        JOIN services s ON a.service_id = s.service_id
        WHERE a.status IN ('complete', 'cancelled-chargeable')
          AND a.is_deleted IS NOT TRUE
          AND a.start >= $1::timestamptz AND a.start <= $2::timestamptz
          AND (s.name ILIKE '%camp%' OR s.labels @> '"Camp"'::jsonb)
      `;

      // 11. Camp Students (DISTINCT students in camp lessons)
      const campStudentsQuery = `
        SELECT COUNT(DISTINCT ar.recipient_id) AS camp_students
        FROM appointment_recipients ar
        JOIN appointments a ON a.appointment_id = ar.appointment_id
        JOIN services s ON a.service_id = s.service_id
        WHERE a.status IN ('complete', 'cancelled-chargeable')
          AND a.is_deleted IS NOT TRUE
          AND a.start >= $1::timestamptz AND a.start <= $2::timestamptz
          AND (s.name ILIKE '%camp%' OR s.labels @> '"Camp"'::jsonb)
          AND ar.status <> 'missed'
      `;

      // 12. Class Pack Purchases (PAID pro-forma invoices for club class packs)
      // Identifies club class packs by description patterns (Park Slope, club class pack, etc.)
      const classPackPurchasesQuery = `
        SELECT COUNT(DISTINCT pi.client_id) AS class_pack_purchases
        FROM proforma_invoices pi
        WHERE pi.status = 'paid'
          AND pi.date_paid >= $1::timestamptz AND pi.date_paid <= $2::timestamptz
          AND pi.amount > 15
          AND (
            pi.description ILIKE '%park slope%'
            OR pi.description ILIKE '%club%class%'
            OR pi.description ILIKE '%class%pack%club%'
            OR pi.description ILIKE '%club%credit%'
            OR pi.description ILIKE '%club%bundle%'
          )
      `;

      // 13. Tutor pay by segment
      const tutorPayQuery = `
        WITH contractor_pay AS (
          SELECT
            ac.appointment_id,
            CASE
              WHEN s.labels::text LIKE '%"Home %' THEN 'Home'
              WHEN s.labels @> '"Online"'::jsonb THEN 'Online'
              WHEN s.labels::text LIKE '%"Club %' THEN 'Club'
              WHEN s.labels::text LIKE '%"School%' THEN 'School'
              ELSE 'Unknown'
            END AS segment,
            SUM(
              CASE
                WHEN a.charge_type = 'hourly' THEN ac.pay_rate * a.units
                WHEN a.charge_type = 'one-off' THEN ac.pay_rate
                WHEN a.charge_type = 'one-off-split' THEN ac.pay_rate
                WHEN a.charge_type = 'hourly-split' THEN ac.pay_rate * a.units
                ELSE ac.pay_rate * a.units
              END
            ) AS base_tutor_pay
          FROM appointment_contractors ac
          JOIN appointments a ON a.appointment_id = ac.appointment_id
          JOIN services s ON a.service_id = s.service_id
          WHERE a.status IN ('complete', 'cancelled-chargeable')
            AND a.is_deleted IS NOT TRUE
            AND a.start >= $1::timestamptz AND a.start <= $2::timestamptz
          GROUP BY ac.appointment_id,
            CASE
              WHEN s.labels::text LIKE '%"Home %' THEN 'Home'
              WHEN s.labels @> '"Online"'::jsonb THEN 'Online'
              WHEN s.labels::text LIKE '%"Club %' THEN 'Club'
              WHEN s.labels::text LIKE '%"School%' THEN 'School'
              ELSE 'Unknown'
            END
        ),
        student_premium AS (
          SELECT
            a.appointment_id,
            CASE
              WHEN s.labels::text LIKE '%"Home %' THEN 'Home'
              WHEN s.labels @> '"Online"'::jsonb THEN 'Online'
              WHEN s.labels::text LIKE '%"Club %' THEN 'Club'
              WHEN s.labels::text LIKE '%"School%' THEN 'School'
              ELSE 'Unknown'
            END AS segment,
            COALESCE(
              CASE
                WHEN s.sr_premium IS NOT NULL AND s.sr_premium > 0 THEN
                  (SELECT COUNT(*) * s.sr_premium * a.units
                   FROM appointment_recipients ar
                   WHERE ar.appointment_id = a.appointment_id
                     AND ar.status <> 'missed')
                ELSE 0
              END, 0
            ) AS premium_pay
          FROM appointments a
          LEFT JOIN services s ON a.service_id = s.service_id
          WHERE a.status IN ('complete', 'cancelled-chargeable')
            AND a.is_deleted IS NOT TRUE
            AND a.start >= $1::timestamptz AND a.start <= $2::timestamptz
        )
        SELECT
          cp.segment,
          ROUND(SUM(COALESCE(cp.base_tutor_pay, 0) + COALESCE(sp.premium_pay, 0)), 2) AS tutor_pay
        FROM contractor_pay cp
        LEFT JOIN student_premium sp ON sp.appointment_id = cp.appointment_id AND sp.segment = cp.segment
        GROUP BY cp.segment
      `;

      // 14. Revenue by segment
      const revenueQuery = `
        SELECT
          CASE
            WHEN s.labels::text LIKE '%"Home %' THEN 'Home'
            WHEN s.labels @> '"Online"'::jsonb THEN 'Online'
            WHEN s.labels::text LIKE '%"Club %' THEN 'Club'
            WHEN s.labels::text LIKE '%"School%' THEN 'School'
            ELSE 'Unknown'
          END AS segment,
          ROUND(SUM(
            CASE
              WHEN a.charge_type = 'hourly' THEN ar.charge_rate * a.units
              WHEN a.charge_type = 'one-off' THEN ar.charge_rate
              WHEN a.charge_type = 'one-off-split' THEN ar.charge_rate
              WHEN a.charge_type = 'hourly-split' THEN ar.charge_rate * a.units
              ELSE ar.charge_rate * a.units
            END
          ), 2) AS revenue
        FROM appointments a
        LEFT JOIN appointment_recipients ar ON a.appointment_id = ar.appointment_id AND ar.status <> 'missed'
        JOIN services s ON a.service_id = s.service_id
        WHERE a.status IN ('complete', 'cancelled-chargeable')
          AND a.is_deleted IS NOT TRUE
          AND a.start >= $1::timestamptz AND a.start <= $2::timestamptz
        GROUP BY
          CASE
            WHEN s.labels::text LIKE '%"Home %' THEN 'Home'
            WHEN s.labels @> '"Online"'::jsonb THEN 'Online'
            WHEN s.labels::text LIKE '%"Club %' THEN 'Club'
            WHEN s.labels::text LIKE '%"School%' THEN 'School'
            ELSE 'Unknown'
          END
      `;

      // Execute all 14 queries in parallel for performance
      const [
        { rows: newLeadsRows },
        { rows: trialLessonsRows },
        { rows: firstPaidLessonsRows },
        { rows: thirdLessonsRows },
        { rows: activeStudentsRows },
        { rows: tutorsRows },
        { rows: activeSchoolsRows },
        { rows: classesHeldRows },
        { rows: campSessionsRows },
        { rows: campDaysRows },
        { rows: campStudentsRows },
        { rows: classPackPurchasesRows },
        { rows: tutorPayRows },
        { rows: revenueRows }
      ] = await Promise.all([
        client.query(newLeadsQuery, [startUTC, endUTC]),
        client.query(trialLessonsQuery, [startUTC, endUTC]),
        client.query(firstPaidLessonsQuery, [startUTC, endUTC]),
        client.query(thirdLessonsQuery, [startUTC, endUTC]),
        client.query(activeStudentsQuery, [startUTC, endUTC]),
        client.query(tutorsQuery, [startUTC, endUTC]),
        client.query(activeSchoolsQuery, [startUTC, endUTC]),
        client.query(classesHeldQuery, [startUTC, endUTC]),
        client.query(campSessionsQuery, [startUTC, endUTC]),
        client.query(campDaysQuery, [startUTC, endUTC]),
        client.query(campStudentsQuery, [startUTC, endUTC]),
        client.query(classPackPurchasesQuery, [startUTC, endUTC]),
        client.query(tutorPayQuery, [startUTC, endUTC]),
        client.query(revenueQuery, [startUTC, endUTC])
      ]);

      // Organize results by segment with new metric names
      const segments = {
        home: {
          revenue: 0,
          tutorPay: 0,
          marginPct: 0,
          activeTutors: 0,
          activeStudents: 0,
          newLeads: 0,
          trialLessons: 0,
          firstPaidLessons: 0,
          thirdLessons: 0
        },
        online: {
          revenue: 0,
          tutorPay: 0,
          marginPct: 0,
          activeTutors: 0,
          activeStudents: 0,
          newLeads: 0,
          trialLessons: 0,
          firstPaidLessons: 0,
          thirdLessons: 0
        },
        schools: {
          revenue: 0,
          tutorPay: 0,
          marginPct: 0,
          activeTutors: 0,
          activeSchools: parseInt(activeSchoolsRows[0]?.active_schools || 0),
          lessonsCompleted: 0
        },
        club: {
          revenue: 0,
          tutorPay: 0,
          marginPct: 0,
          activeTutors: 0,
          lessonsCompleted: 0,
          activeStudents: 0,
          campSessions: parseInt(campSessionsRows[0]?.camp_sessions || 0),
          campDays: parseInt(campDaysRows[0]?.camp_days || 0),
          campStudents: parseInt(campStudentsRows[0]?.camp_students || 0),
          newLeads: 0,
          trialLessons: 0,
          classPackPurchases: parseInt(classPackPurchasesRows[0]?.class_pack_purchases || 0)
        }
      };

      // Map new leads (PAID trial bookings)
      for (const row of newLeadsRows) {
        const segment = row.segment?.toLowerCase();
        if (segment === 'home' && segments.home) segments.home.newLeads = parseInt(row.new_leads || 0);
        if (segment === 'online' && segments.online) segments.online.newLeads = parseInt(row.new_leads || 0);
        if (segment === 'club' && segments.club) segments.club.newLeads = parseInt(row.new_leads || 0);
      }

      // Map trial lessons (completed trial appointments)
      for (const row of trialLessonsRows) {
        const segment = row.segment?.toLowerCase();
        if (segment === 'home' && segments.home) segments.home.trialLessons = parseInt(row.trial_lessons || 0);
        if (segment === 'online' && segments.online) segments.online.trialLessons = parseInt(row.trial_lessons || 0);
        if (segment === 'club' && segments.club) segments.club.trialLessons = parseInt(row.trial_lessons || 0);
      }

      // Map first paid lessons
      for (const row of firstPaidLessonsRows) {
        const segment = row.segment?.toLowerCase();
        if (segment === 'home' && segments.home) segments.home.firstPaidLessons = parseInt(row.first_paid_lessons || 0);
        if (segment === 'online' && segments.online) segments.online.firstPaidLessons = parseInt(row.first_paid_lessons || 0);
      }

      // Map third lessons
      for (const row of thirdLessonsRows) {
        const segment = row.segment?.toLowerCase();
        if (segment === 'home' && segments.home) segments.home.thirdLessons = parseInt(row.third_lessons || 0);
        if (segment === 'online' && segments.online) segments.online.thirdLessons = parseInt(row.third_lessons || 0);
      }

      // Map active students
      for (const row of activeStudentsRows) {
        const segment = row.segment?.toLowerCase();
        if (segment === 'home' && segments.home) segments.home.activeStudents = parseInt(row.active_students || 0);
        if (segment === 'online' && segments.online) segments.online.activeStudents = parseInt(row.active_students || 0);
        if (segment === 'club' && segments.club) segments.club.activeStudents = parseInt(row.active_students || 0);
      }

      // Map active tutors
      for (const row of tutorsRows) {
        const segment = row.segment?.toLowerCase();
        if (segment === 'home' && segments.home) segments.home.activeTutors = parseInt(row.tutors || 0);
        if (segment === 'online' && segments.online) segments.online.activeTutors = parseInt(row.tutors || 0);
        if (segment === 'club' && segments.club) segments.club.activeTutors = parseInt(row.tutors || 0);
        if (segment === 'school' && segments.schools) segments.schools.activeTutors = parseInt(row.tutors || 0);
      }

      // Map lessons completed (for schools and clubs)
      for (const row of classesHeldRows) {
        const segment = row.segment?.toLowerCase();
        if (segment === 'club' && segments.club) segments.club.lessonsCompleted = parseInt(row.classes_held || 0);
        if (segment === 'school' && segments.schools) segments.schools.lessonsCompleted = parseInt(row.classes_held || 0);
      }

      // Map tutor pay and calculate margin
      for (const row of tutorPayRows) {
        const segment = row.segment?.toLowerCase();
        if (segment === 'home' && segments.home) segments.home.tutorPay = parseFloat(row.tutor_pay || 0);
        if (segment === 'online' && segments.online) segments.online.tutorPay = parseFloat(row.tutor_pay || 0);
        if (segment === 'club' && segments.club) segments.club.tutorPay = parseFloat(row.tutor_pay || 0);
        if (segment === 'school' && segments.schools) segments.schools.tutorPay = parseFloat(row.tutor_pay || 0);
      }

      // Map revenue
      for (const row of revenueRows) {
        const segment = row.segment?.toLowerCase();
        if (segment === 'home' && segments.home) segments.home.revenue = parseFloat(row.revenue || 0);
        if (segment === 'online' && segments.online) segments.online.revenue = parseFloat(row.revenue || 0);
        if (segment === 'club' && segments.club) segments.club.revenue = parseFloat(row.revenue || 0);
        if (segment === 'school' && segments.schools) segments.schools.revenue = parseFloat(row.revenue || 0);
      }

      // Calculate margin percentages
      for (const [key, data] of Object.entries(segments)) {
        if (data.revenue > 0) {
          data.marginPct = ((data.revenue - data.tutorPay) / data.revenue) * 100;
        }
      }

      return segments;
    } finally {
      client.release();
    }
  }

  /**
   * Fetch total business metrics for Executive Reports
   * Aggregates metrics across all segments for overview section
   * @param {Pool} pool - Database pool
   * @param {string} startDate - Start date (ISO string)
   * @param {string} endDate - End date (ISO string)
   * @param {string} reportType - 'weekly' or 'monthly'
   */
  async fetchTotalBusinessMetrics(pool, startDate, endDate, reportType = 'weekly') {
    const client = await pool.connect();
    try {
      const startUTC = DateTime.fromISO(startDate).setZone('America/New_York').startOf('day').toUTC().toISO();
      const endUTC = DateTime.fromISO(endDate).setZone('America/New_York').endOf('day').toUTC().toISO();

      // 1. Total Revenue (across all segments)
      const revenueQuery = `
        SELECT COALESCE(SUM(
          CASE
            WHEN a.charge_type = 'hourly' THEN ar.charge_rate * a.units
            WHEN a.charge_type IN ('one-off', 'one-off-split') THEN ar.charge_rate
            ELSE ar.charge_rate * a.units
          END
        ), 0) AS total_revenue
        FROM appointments a
        JOIN appointment_recipients ar ON a.appointment_id = ar.appointment_id AND ar.status <> 'missed'
        JOIN services s ON a.service_id = s.service_id
        WHERE a.status IN ('complete', 'cancelled-chargeable')
          AND a.is_deleted IS NOT TRUE
          AND a.start >= $1::timestamptz AND a.start <= $2::timestamptz
          AND s.labels::text NOT LIKE '%Non Teaching%' AND s.labels::text NOT LIKE '%Support%'
      `;

      // 2. Total Tutor Pay (across all segments)
      const tutorPayQuery = `
        WITH contractor_pay AS (
          SELECT
            ac.appointment_id,
            SUM(
              CASE
                WHEN a.charge_type = 'hourly' THEN ac.pay_rate * a.units
                WHEN a.charge_type = 'one-off' THEN ac.pay_rate
                WHEN a.charge_type = 'one-off-split' THEN ac.pay_rate
                WHEN a.charge_type = 'hourly-split' THEN ac.pay_rate * a.units
                ELSE ac.pay_rate * a.units
              END
            ) AS base_tutor_pay
          FROM appointment_contractors ac
          JOIN appointments a ON a.appointment_id = ac.appointment_id
          JOIN services s ON a.service_id = s.service_id
          WHERE a.status IN ('complete', 'cancelled-chargeable')
            AND a.is_deleted IS NOT TRUE
            AND a.start >= $1::timestamptz AND a.start <= $2::timestamptz
            AND s.labels::text NOT LIKE '%Non Teaching%' AND s.labels::text NOT LIKE '%Support%'
          GROUP BY ac.appointment_id
        ),
        student_premium AS (
          SELECT
            a.appointment_id,
            COALESCE(
              CASE
                WHEN s.sr_premium IS NOT NULL AND s.sr_premium > 0 THEN
                  (SELECT COUNT(*) * s.sr_premium * a.units
                   FROM appointment_recipients ar
                   WHERE ar.appointment_id = a.appointment_id
                     AND ar.status <> 'missed')
                ELSE 0
              END, 0
            ) AS premium_pay
          FROM appointments a
          LEFT JOIN services s ON a.service_id = s.service_id
          WHERE a.status IN ('complete', 'cancelled-chargeable')
            AND a.is_deleted IS NOT TRUE
            AND a.start >= $1::timestamptz AND a.start <= $2::timestamptz
        )
        SELECT
          ROUND(SUM(COALESCE(cp.base_tutor_pay, 0) + COALESCE(sp.premium_pay, 0)), 2) AS total_tutor_pay
        FROM contractor_pay cp
        LEFT JOIN student_premium sp ON sp.appointment_id = cp.appointment_id
      `;

      // 3. Unique Students
      const uniqueStudentsQuery = `
        SELECT COUNT(DISTINCT ar.recipient_id) AS unique_students
        FROM appointment_recipients ar
        JOIN appointments a ON a.appointment_id = ar.appointment_id
        JOIN services s ON a.service_id = s.service_id
        WHERE a.status IN ('complete', 'cancelled-chargeable')
          AND a.is_deleted IS NOT TRUE
          AND a.start >= $1::timestamptz AND a.start <= $2::timestamptz
          AND ar.status <> 'missed'
          AND s.labels::text NOT LIKE '%Non Teaching%' AND s.labels::text NOT LIKE '%Support%'
      `;

      // 4. Tutor hours breakdown (for 10+ hours weekly or consistency bonus monthly)
      const tutorHoursQuery = `
        WITH tutor_hours AS (
          SELECT ac.contractor_id, SUM(
            CASE
              WHEN (s.labels::text LIKE '%"School%' OR s.labels::text LIKE '%"Club %')
                   AND EXTRACT(EPOCH FROM (a.finish - a.start))/3600 < 1
              THEN 1.0
              ELSE EXTRACT(EPOCH FROM (a.finish - a.start))/3600
            END
          ) AS total_hours
          FROM appointments a
          JOIN appointment_contractors ac ON a.appointment_id = ac.appointment_id
          JOIN services s ON a.service_id = s.service_id
          WHERE a.status IN ('complete', 'cancelled-chargeable')
            AND a.is_deleted IS NOT TRUE
            AND a.start >= $1::timestamptz AND a.start <= $2::timestamptz
            AND s.labels::text NOT LIKE '%Non Teaching%' AND s.labels::text NOT LIKE '%Support%'
          GROUP BY ac.contractor_id
        )
        SELECT
          COUNT(*) AS active_tutors,
          COUNT(*) FILTER (WHERE total_hours >= 10) AS tutors_10plus,
          COUNT(*) FILTER (WHERE total_hours >= 40 AND total_hours < 60) AS tutors_40_60,
          COUNT(*) FILTER (WHERE total_hours >= 60 AND total_hours < 80) AS tutors_60_80,
          COUNT(*) FILTER (WHERE total_hours >= 80) AS tutors_80_plus,
          COUNT(*) FILTER (WHERE total_hours >= 40) AS tutors_bonus_total
        FROM tutor_hours
      `;

      // Execute all 4 queries in parallel for performance
      const [
        { rows: revenueRows },
        { rows: tutorPayRows },
        { rows: uniqueStudentsRows },
        { rows: tutorHoursRows }
      ] = await Promise.all([
        client.query(revenueQuery, [startUTC, endUTC]),
        client.query(tutorPayQuery, [startUTC, endUTC]),
        client.query(uniqueStudentsQuery, [startUTC, endUTC]),
        client.query(tutorHoursQuery, [startUTC, endUTC])
      ]);

      // Calculate metrics
      const totalRevenue = parseFloat(revenueRows[0]?.total_revenue || 0);
      const totalTutorPay = parseFloat(tutorPayRows[0]?.total_tutor_pay || 0);
      const marginPct = totalRevenue > 0 ? ((totalRevenue - totalTutorPay) / totalRevenue) * 100 : 0;
      const uniqueStudents = parseInt(uniqueStudentsRows[0]?.unique_students || 0);
      const activeTutors = parseInt(tutorHoursRows[0]?.active_tutors || 0);

      const result = {
        totalRevenue,
        totalTutorPay,
        marginPct,
        uniqueStudents,
        activeTutors
      };

      // Add weekly-specific metrics (10+ hours)
      if (reportType === 'weekly') {
        result.tutors10Plus = parseInt(tutorHoursRows[0]?.tutors_10plus || 0);
        result.pctTutors10Plus = activeTutors > 0 ? (result.tutors10Plus / activeTutors) * 100 : 0;
      }

      // Add monthly-specific metrics (consistency bonus tiers)
      if (reportType === 'monthly') {
        result.tutors40_60 = parseInt(tutorHoursRows[0]?.tutors_40_60 || 0);
        result.tutors60_80 = parseInt(tutorHoursRows[0]?.tutors_60_80 || 0);
        result.tutors80Plus = parseInt(tutorHoursRows[0]?.tutors_80_plus || 0);
        result.tutorsBonusTotal = parseInt(tutorHoursRows[0]?.tutors_bonus_total || 0);
        result.pctConsistencyBonus = activeTutors > 0 ? (result.tutorsBonusTotal / activeTutors) * 100 : 0;
      }

      return result;
    } finally {
      client.release();
    }
  }

  /**
   * Get distribution list for a report type
   */
  async getDistributionList(reportType) {
    const pool = global.pool;
    if (!pool) {
      throw new Error('Database pool not initialized. Make sure buildDeps() has been called.');
    }
    const { rows } = await pool.query(
      'SELECT email, name FROM report_distribution_lists WHERE report_type = $1 AND active = TRUE',
      [reportType]
    );
    return rows;
  }

  /**
   * Calculate date range for weekly report (Sunday to Saturday)
   */
  getWeeklyDateRange() {
    const now = DateTime.now().setZone('America/New_York');
    // Get last week (Sunday to Saturday)
    // Luxon's weekday: 1=Monday, 7=Sunday
    // We want last week's Sunday to Saturday
    let daysToSubtract;
    if (now.weekday === 7) {
      // Today is Sunday, so last week ended yesterday (Saturday)
      daysToSubtract = 1;
    } else {
      // Go back to last Saturday, then to the Sunday before that
      daysToSubtract = now.weekday + 1; // Days to get to last Saturday
    }
    
    const lastSaturday = now.minus({ days: daysToSubtract });
    const lastSunday = lastSaturday.minus({ days: 6 }).startOf('day');
    const endDate = lastSaturday.endOf('day');
    const startDate = lastSunday;
    
    // For trends API, we need to pass the start of the current week (Sunday) as exclusive end
    // The trends API will then calculate: endNY.minus({ days: 1 }).startOf('week').plus({ days: 1 })
    // which shifts to Sunday alignment, then goes back 12 weeks
    // So we pass the start of the current week (which is lastSaturday + 1 day = lastSunday + 7 days)
    const currentWeekSunday = lastSaturday.plus({ days: 1 }).startOf('day');
    
    return {
      start: startDate.toISODate(),
      end: endDate.toISODate(),
      startDateTime: startDate,
      endDateTime: endDate,
      trendsEnd: currentWeekSunday.toISODate() // Exclusive end for trends API (start of current week)
    };
  }

  /**
   * Calculate date range for monthly report
   */
  getMonthlyDateRange() {
    const now = DateTime.now().setZone('America/New_York');
    // Last month
    const lastMonth = now.minus({ months: 1 });
    const startDate = lastMonth.startOf('month');
    const endDate = lastMonth.endOf('month');
    // For trends API, use start of next month as exclusive end date
    const trendsEndDate = lastMonth.plus({ months: 1 }).startOf('month');
    
    return {
      start: startDate.toISODate(),
      end: endDate.toISODate(),
      startDateTime: startDate,
      endDateTime: endDate,
      trendsEnd: trendsEndDate.toISODate() // Exclusive end for trends API
    };
  }

  /**
   * Generate and send report
   */
  async generateAndSendReport(reportType, customDateRange = null) {
    try {
      // Get date range
      let dateRange;
      if (customDateRange) {
        dateRange = customDateRange;
      } else if (reportType === 'weekly') {
        dateRange = this.getWeeklyDateRange();
      } else {
        dateRange = this.getMonthlyDateRange();
      }

      // Generate analytics data
      const data = await this.generateAnalyticsData(dateRange.start, dateRange.end, reportType, dateRange.trendsEnd);
      
      // Generate multi-period analytics for enhanced reports
      const multiPeriodData = await this.generateMultiPeriodAnalytics(reportType, 0, 0);
      data.multiPeriod = multiPeriodData;

      // Get distribution list
      const recipients = await this.getDistributionList(reportType);

      if (recipients.length === 0) {
        return {
          success: false,
          message: `No active recipients found for ${reportType} reports`,
          sent: 0
        };
      }

      // Generate chart image if possible, otherwise use SVG
      let chartImageBase64 = null;
      if (data.trends && data.trends.series && data.trends.series.length > 0) {
        try {
          logger.info(`Generating chart image for ${reportType} report with ${data.trends.series.length} data points...`);
          chartImageBase64 = await generateChartImage(data.trends.series, reportType);
          if (chartImageBase64) {
            logger.info('Chart image generated successfully');
          } else {
            logger.info('Chart image generation returned null, will use SVG fallback');
          }
        } catch (error) {
          logger.error({ err: error }, 'Error generating chart image, falling back to SVG:');
        }
      }

      // Generate email HTML with multi-period data
      const emailHtml = await generateReportEmail({
        reportType,
        dateRange,
        analytics: data.analytics,
        trends: data.trends,
        marketing: data.marketing,
        chartImage: chartImageBase64,
        multiPeriod: data.multiPeriod
      });

      // Send emails
      const brevoSender = getBrevoEmailSender();
      if (!brevoSender) {
        throw new Error('Brevo email sender not available');
      }

      const envConfig = getCurrentEnvironment();
      const location = envConfig.name;

      const results = [];
      for (const recipient of recipients) {
        try {
          const subject = reportType === 'weekly' 
            ? `Weekly Analytics Report - ${dateRange.startDateTime.toFormat('MMM d')} to ${dateRange.endDateTime.toFormat('MMM d, yyyy')}`
            : `Monthly Analytics Report - ${dateRange.startDateTime.toFormat('MMMM yyyy')}`;

          const emailResult = await brevoSender.sendEmail({
            to: recipient.email,
            subject,
            html: emailHtml,
            location
          });

          // Record send
          const pool = global.pool;
          if (!pool) {
            throw new Error('Database pool not initialized. Make sure buildDeps() has been called.');
          }
          await pool.query(
            `INSERT INTO report_sends (report_type, period_start, period_end, recipient_email, brevo_message_id, status)
             VALUES ($1, $2, $3, $4, $5, $6)`,
            [
              reportType,
              dateRange.start,
              dateRange.end,
              recipient.email,
              emailResult.messageId || null,
              emailResult.success ? 'sent' : 'failed'
            ]
          );

          results.push({
            email: recipient.email,
            success: emailResult.success,
            messageId: emailResult.messageId
          });
        } catch (error) {
          logger.error({ err: error }, `Error sending to ${recipient.email}:`);
          results.push({
            email: recipient.email,
            success: false,
            error: error.message
          });
        }
      }

      const successCount = results.filter(r => r.success).length;
      return {
        success: true,
        sent: successCount,
        total: recipients.length,
        results
      };
    } catch (error) {
      logger.error({ err: error }, `Error generating ${reportType} report:`);
      throw error;
    }
  }

  /**
   * Get a pre-computed snapshot for Executive Reports
   * Returns null if no snapshot exists (caller should fall back to compute)
   * @param {string} reportType - 'weekly', 'monthly', 'quarterly', or 'annually'
   * @param {number} offset - period offset (0 = current)
   */
  async getSnapshot(reportType, offset = 0) {
    const pool = global.pool;
    if (!pool) return null;

    try {
      const offsetColumnMap = { weekly: 'week_offset', monthly: 'month_offset', quarterly: 'quarter_offset', annually: 'year_offset' };
      const offsetColumn = offsetColumnMap[reportType] || 'month_offset';
      const { rows } = await pool.query(`
        SELECT data, computed_at, computation_time_ms, period_start, period_end
        FROM report_snapshots
        WHERE report_type = $1 AND ${offsetColumn} = $2
        ORDER BY computed_at DESC
        LIMIT 1
      `, [reportType, offset]);

      if (rows.length === 0) return null;

      return {
        data: rows[0].data,
        computedAt: rows[0].computed_at,
        computationTimeMs: rows[0].computation_time_ms,
        periodStart: rows[0].period_start,
        periodEnd: rows[0].period_end
      };
    } catch (error) {
      logger.error({ error: error.message }, 'Error fetching snapshot:');
      return null;
    }
  }

  /**
   * Save a snapshot (used by manual refresh and job)
   */
  async saveSnapshot(reportType, offset, data, computationTimeMs) {
    const pool = global.pool;
    if (!pool) throw new Error('Database pool not initialized');

    const { DateTime } = require('luxon');
    const now = DateTime.now().setZone('America/New_York');

    // Generate period key
    let periodKey;
    if (reportType === 'weekly') {
      let daysToSubtract = now.weekday === 7 ? 1 : now.weekday + 1;
      const lastSaturday = now.minus({ days: daysToSubtract, weeks: offset });
      const lastSunday = lastSaturday.minus({ days: 6 });
      periodKey = lastSunday.toFormat("kkkk-'W'WW");
    } else if (reportType === 'quarterly') {
      const refDate = now.minus({ months: offset * 3 });
      const quarter = Math.ceil(refDate.month / 3);
      periodKey = `${refDate.year}-Q${quarter}`;
    } else if (reportType === 'annually') {
      const refYear = now.minus({ years: offset });
      periodKey = `${refYear.year}`;
    } else {
      const targetMonth = now.minus({ months: 1 + offset });
      periodKey = targetMonth.toFormat('yyyy-MM');
    }

    const periodStart = data.currentPeriod?.dateRange?.start;
    const periodEnd = data.currentPeriod?.dateRange?.end;

    const offsetValues = { week_offset: null, month_offset: null, quarter_offset: null, year_offset: null };
    const offsetColumnMap = { weekly: 'week_offset', monthly: 'month_offset', quarterly: 'quarter_offset', annually: 'year_offset' };
    offsetValues[offsetColumnMap[reportType]] = offset;

    await pool.query(`
      INSERT INTO report_snapshots (
        report_type, period_key, week_offset, month_offset, quarter_offset, year_offset,
        period_start, period_end, data, computed_at, computation_time_ms
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, NOW(), $10)
      ON CONFLICT (report_type, period_key)
      DO UPDATE SET
        week_offset = EXCLUDED.week_offset,
        month_offset = EXCLUDED.month_offset,
        quarter_offset = EXCLUDED.quarter_offset,
        year_offset = EXCLUDED.year_offset,
        period_start = EXCLUDED.period_start,
        period_end = EXCLUDED.period_end,
        data = EXCLUDED.data,
        computed_at = NOW(),
        computation_time_ms = EXCLUDED.computation_time_ms
    `, [
      reportType,
      periodKey,
      offsetValues.week_offset,
      offsetValues.month_offset,
      offsetValues.quarter_offset,
      offsetValues.year_offset,
      periodStart,
      periodEnd,
      JSON.stringify(data),
      computationTimeMs
    ]);

    return { periodKey, computedAt: new Date() };
  }
}

module.exports = new ReportService();

