const express = require('express');
const router = express.Router();
const { DateTime } = require('luxon');
const { tableExists } = require('../utils/schema-cache');
const { pool, puppeteer } = global;
const { getInstance: getBrevoEmailSender } = require('../utils/brevo-email-sender');
const { getCurrentEnvironment } = require('../config/environments');
const { generateReportEmail } = require('../utils/report-email-template');
const { asyncHandler } = require('../middleware/error-handler');
const { logger } = require('../utils/logger');

// Middleware to check admin role
const requireAdmin = (req, res, next) => {
  if (!req.user) {
    return res.status(401).json({ error: "Authentication required" });
  }
  const userRole = req.user?.role || "staff";
  if (userRole !== "admin") {
    return res.status(403).json({ error: "Admin access required" });
  }
  next();
};

// Get distribution lists
router.get('/distribution-lists', requireAdmin, asyncHandler(async (req, res) => {
  try {
    // Check if table exists, if not return empty array (cached)
    const rdlExists = await tableExists(pool, 'report_distribution_lists');

    if (!rdlExists) {
      logger.warn('report_distribution_lists table does not exist yet');
      return res.json([]);
    }
    
    const { rows } = await pool.query(
      'SELECT * FROM report_distribution_lists ORDER BY report_type, email'
    );
    res.json(rows);
  } catch (error) {
    logger.error({ data: error.message || error }, 'Error fetching distribution lists:');
    // If table doesn't exist, return empty array instead of error
    if (error.code === '42P01') {
      return res.json([]);
    }
    res.status(500).json({ error: 'Failed to fetch distribution lists', details: error.message });
  }
}));

// Add email to distribution list
router.post('/distribution-lists', requireAdmin, asyncHandler(async (req, res) => {
  try {
    const { reportType, email, name } = req.body;
    if (!reportType || !email) {
      return res.status(400).json({ error: 'reportType and email are required' });
    }
    
    const { rows } = await pool.query(
      `INSERT INTO report_distribution_lists (report_type, email, name, active)
       VALUES ($1, $2, $3, TRUE)
       ON CONFLICT (report_type, email) 
       DO UPDATE SET name = EXCLUDED.name, active = TRUE, updated_at = NOW()
       RETURNING *`,
      [reportType, email, name || null]
    );
    res.json(rows[0]);
  } catch (error) {
    logger.error({ err: error }, 'Error adding to distribution list:');
    res.status(500).json({ error: 'Failed to add to distribution list' });
  }
}));

// Remove email from distribution list
router.delete('/distribution-lists/:id', requireAdmin, asyncHandler(async (req, res) => {
  try {
    const { id } = req.params;
    await pool.query('DELETE FROM report_distribution_lists WHERE id = $1', [id]);
    res.json({ success: true });
  } catch (error) {
    logger.error({ err: error }, 'Error removing from distribution list:');
    res.status(500).json({ error: 'Failed to remove from distribution list' });
  }
}));

// Toggle active status
router.patch('/distribution-lists/:id/toggle', requireAdmin, asyncHandler(async (req, res) => {
  try {
    const { id } = req.params;
    const { rows } = await pool.query(
      'UPDATE report_distribution_lists SET active = NOT active, updated_at = NOW() WHERE id = $1 RETURNING *',
      [id]
    );
    res.json(rows[0]);
  } catch (error) {
    logger.error({ err: error }, 'Error toggling distribution list status:');
    res.status(500).json({ error: 'Failed to toggle status' });
  }
}));

// Get multi-period analytics data
// Reads from pre-computed snapshots for instant loading (<100ms)
// Falls back to on-demand computation if snapshot not found
router.get('/multi-period/:reportType', requireAdmin, asyncHandler(async (req, res) => {
  try {
    const { reportType } = req.params;
    const { weekOffset = 0, monthOffset = 0, quarterOffset = 0, yearOffset = 0, forceRefresh = 'false', includeYoY = 'false' } = req.query;

    if (!['weekly', 'monthly', 'quarterly', 'annually'].includes(reportType)) {
      return res.status(400).json({ error: 'Invalid report type' });
    }

    const reportService = require('../services/report-service');
    const offsetMap = { weekly: parseInt(weekOffset) || 0, monthly: parseInt(monthOffset) || 0, quarterly: parseInt(quarterOffset) || 0, annually: parseInt(yearOffset) || 0 };
    const offset = offsetMap[reportType];

    // Try to get pre-computed snapshot first (unless forceRefresh)
    if (forceRefresh !== 'true') {
      const snapshot = await reportService.getSnapshot(reportType, offset);
      if (snapshot) {
        // Return snapshot data with metadata
        return res.json({
          ...snapshot.data,
          _meta: {
            fromSnapshot: true,
            computedAt: snapshot.computedAt,
            computationTimeMs: snapshot.computationTimeMs,
            periodStart: snapshot.periodStart,
            periodEnd: snapshot.periodEnd
          }
        });
      }
    }

    // Fallback: compute on-demand (for missing snapshots or force refresh)
    logger.info(`[Reports] Computing ${reportType} offset=${offset} on-demand (no snapshot found)`);
    const startTime = Date.now();
    const multiPeriodData = await reportService.generateMultiPeriodAnalytics(
      reportType,
      parseInt(weekOffset) || 0,
      parseInt(monthOffset) || 0,
      includeYoY === 'true',
      parseInt(quarterOffset) || 0,
      parseInt(yearOffset) || 0
    );
    const computationTimeMs = Date.now() - startTime;

    res.json({
      ...multiPeriodData,
      _meta: {
        fromSnapshot: false,
        computedAt: new Date().toISOString(),
        computationTimeMs
      }
    });
  } catch (error) {
    logger.error({ err: error }, `Error fetching multi-period ${req.params.reportType} data:`);
    res.status(500).json({
      error: `Failed to fetch multi-period ${req.params.reportType} data`,
      details: error.message
    });
  }
}));

// Manual refresh endpoint - recomputes and saves snapshot
router.post('/multi-period/:reportType/refresh', requireAdmin, asyncHandler(async (req, res) => {
  try {
    const { reportType } = req.params;
    const { weekOffset = 0, monthOffset = 0, quarterOffset = 0, yearOffset = 0 } = req.query;

    if (!['weekly', 'monthly', 'quarterly', 'annually'].includes(reportType)) {
      return res.status(400).json({ error: 'Invalid report type' });
    }

    const reportService = require('../services/report-service');
    const offsetMap = { weekly: parseInt(weekOffset) || 0, monthly: parseInt(monthOffset) || 0, quarterly: parseInt(quarterOffset) || 0, annually: parseInt(yearOffset) || 0 };
    const offset = offsetMap[reportType];

    logger.info(`[Reports] Manual refresh requested for ${reportType} offset=${offset}`);
    const startTime = Date.now();

    // Compute fresh data
    const multiPeriodData = await reportService.generateMultiPeriodAnalytics(
      reportType,
      parseInt(weekOffset) || 0,
      parseInt(monthOffset) || 0,
      true,  // Always include YoY
      parseInt(quarterOffset) || 0,
      parseInt(yearOffset) || 0
    );
    const computationTimeMs = Date.now() - startTime;

    // Save as new snapshot
    const { periodKey, computedAt } = await reportService.saveSnapshot(
      reportType,
      offset,
      multiPeriodData,
      computationTimeMs
    );

    logger.info(`[Reports] Snapshot saved: ${reportType} ${periodKey} in ${computationTimeMs}ms`);

    res.json({
      ...multiPeriodData,
      _meta: {
        fromSnapshot: false,
        computedAt: computedAt.toISOString(),
        computationTimeMs,
        refreshed: true,
        periodKey
      }
    });
  } catch (error) {
    logger.error({ err: error }, `Error refreshing multi-period ${req.params.reportType} data:`);
    res.status(500).json({
      error: `Failed to refresh multi-period ${req.params.reportType} data`,
      details: error.message
    });
  }
}));

// Get available periods for dropdown selection
router.get('/available-periods/:reportType', requireAdmin, asyncHandler(async (req, res) => {
  try {
    const { reportType } = req.params;

    if (!['weekly', 'monthly', 'quarterly', 'annually'].includes(reportType)) {
      return res.status(400).json({ error: 'Invalid report type' });
    }

    const periods = [];
    const now = DateTime.now().setZone('America/New_York');

    if (reportType === 'weekly') {
      // Generate available weeks (last 104 weeks = 2 years)
      for (let i = 0; i < 104; i++) {
        const weekStart = now.minus({ weeks: i }).startOf('week');
        const weekEnd = weekStart.endOf('week');

        // Format label: "Jan 6-12" or "Dec 30 - Jan 5"
        let label;
        if (weekStart.month === weekEnd.month) {
          label = `${weekStart.toFormat('MMM d')}-${weekEnd.toFormat('d')}`;
        } else {
          label = `${weekStart.toFormat('MMM d')} - ${weekEnd.toFormat('MMM d')}`;
        }

        // Add year if not current year
        if (weekStart.year !== now.year) {
          label += `, ${weekStart.year}`;
        }

        periods.push({
          start: weekStart.toISODate(),
          end: weekEnd.toISODate(),
          label
        });
      }
    } else if (reportType === 'quarterly') {
      // Generate available quarters (last 12 quarters = 3 years)
      for (let i = 0; i < 12; i++) {
        const refDate = now.minus({ months: i * 3 });
        const quarter = Math.ceil(refDate.month / 3);
        const quarterStart = DateTime.fromObject({ year: refDate.year, month: (quarter - 1) * 3 + 1, day: 1 }, { zone: 'America/New_York' });
        const quarterEnd = quarterStart.plus({ months: 3 }).minus({ days: 1 }).endOf('day');

        periods.push({
          start: quarterStart.toISODate(),
          end: quarterEnd.toISODate(),
          label: `Q${quarter} ${quarterStart.toFormat('yyyy')}`
        });
      }
    } else if (reportType === 'annually') {
      // Generate available years (last 5 years)
      for (let i = 0; i < 5; i++) {
        const yearStart = now.minus({ years: i }).startOf('year');
        const yearEnd = yearStart.endOf('year');

        periods.push({
          start: yearStart.toISODate(),
          end: yearEnd.toISODate(),
          label: yearStart.toFormat('yyyy')
        });
      }
    } else {
      // Generate available months (last 36 months = 3 years)
      for (let i = 0; i < 36; i++) {
        const monthStart = now.minus({ months: i }).startOf('month');
        const monthEnd = monthStart.endOf('month');

        periods.push({
          start: monthStart.toISODate(),
          end: monthEnd.toISODate(),
          label: monthStart.toFormat('MMMM yyyy')
        });
      }
    }

    res.json({ periods });
  } catch (error) {
    logger.error({ err: error }, `Error fetching available periods for ${req.params.reportType}:`);
    res.status(500).json({
      error: 'Failed to fetch available periods',
      details: error.message
    });
  }
}));

// Generate and send report (manual trigger)
router.post('/send/:reportType', requireAdmin, asyncHandler(async (req, res) => {
  try {
    const { reportType } = req.params;
    if (!['weekly', 'monthly'].includes(reportType)) {
      return res.status(400).json({ error: 'Invalid report type' });
    }

    const reportService = require('../services/report-service');
    
    // Set a timeout for report generation (5 minutes)
    const timeoutPromise = new Promise((_, reject) => 
      setTimeout(() => reject(new Error('Report generation timeout after 5 minutes')), 300000)
    );
    
    const result = await Promise.race([
      reportService.generateAndSendReport(reportType),
      timeoutPromise
    ]);
    
    res.json(result);
  } catch (error) {
    logger.error({ err: error }, `Error sending ${reportType} report:`);
    const errorMessage = error.message || 'Unknown error';
    res.status(500).json({ 
      error: `Failed to send ${reportType} report`, 
      details: errorMessage 
    });
  }
}));

// Get report history
router.get('/history', requireAdmin, asyncHandler(async (req, res) => {
  try {
    const { reportType, limit = 100 } = req.query;
    
    // Group by report period and aggregate recipients
    let query = `
      SELECT 
        report_type,
        period_start,
        period_end,
        MIN(sent_at) as first_sent_at,
        MAX(sent_at) as last_sent_at,
        COUNT(*) as recipient_count,
        ARRAY_AGG(DISTINCT recipient_email ORDER BY recipient_email) as recipients,
        ARRAY_AGG(DISTINCT status ORDER BY status) as statuses,
        MIN(id) as id
      FROM report_sends
    `;
    const params = [];
    
    if (reportType) {
      query += ' WHERE report_type = $1';
      params.push(reportType);
    }
    
    query += ` 
      GROUP BY report_type, period_start, period_end
      ORDER BY MAX(sent_at) DESC 
      LIMIT $${params.length + 1}
    `;
    params.push(parseInt(limit));
    
    const { rows } = await pool.query(query, params);
    res.json(rows);
  } catch (error) {
    logger.error({ err: error }, 'Error fetching report history:');
    res.status(500).json({ error: 'Failed to fetch report history' });
  }
}));

// Marketing analytics summary for reports
router.get('/marketing-summary', asyncHandler(async (req, res) => {
  try {
    const { start, end } = req.query;
    if (!start || !end) {
      return res.status(400).json({ error: 'start and end dates are required' });
    }

    const startDateUTC = DateTime.fromISO(start).setZone('America/New_York').startOf('day').toUTC().toISO();
    const endDateUTC = DateTime.fromISO(end).setZone('America/New_York').endOf('day').toUTC().toISO();
    const startDateOnly = start.split('T')[0];
    const endDateOnly = end.split('T')[0];

    const client = await pool.connect();
    try {
      // Get overall form stats
      const formStatsQuery = `
        SELECT
          COUNT(*) FILTER (WHERE status IN ('draft', 'submitted')) AS total_leads,
          COUNT(*) FILTER (WHERE payment_status IN ('paid', 'verified')) AS total_registrations,
          CASE 
            WHEN COUNT(*) FILTER (WHERE status IN ('draft', 'submitted')) > 0 
            THEN ROUND((COUNT(*) FILTER (WHERE payment_status IN ('paid', 'verified'))::numeric / 
                       COUNT(*) FILTER (WHERE status IN ('draft', 'submitted'))::numeric) * 100, 2)
            ELSE 0
          END AS conversion_rate
        FROM booking_submissions
        WHERE created_at >= $1::timestamptz AND created_at <= $2::timestamptz
      `;
      const { rows: formRows } = await client.query(formStatsQuery, [startDateUTC, endDateUTC]);
      const formStats = formRows[0] || {};

      // Get Meta ad spend
      const metaSpendQuery = `
        SELECT COALESCE(SUM(spend), 0) AS meta_spend
        FROM ad_spend_data
        WHERE date >= $1::date AND date <= $2::date AND platform = 'meta'
      `;
      const { rows: metaRows } = await client.query(metaSpendQuery, [startDateOnly, endDateOnly]);
      const metaSpend = parseFloat(metaRows[0]?.meta_spend || 0);

      // Get Google ad spend
      const googleSpendQuery = `
        SELECT COALESCE(SUM(spend), 0) AS google_spend
        FROM ad_spend_data
        WHERE date >= $1::date AND date <= $2::date AND platform = 'google'
      `;
      const { rows: googleRows } = await client.query(googleSpendQuery, [startDateOnly, endDateOnly]);
      const googleSpend = parseFloat(googleRows[0]?.google_spend || 0);

      // Get Klaviyo emails sent
      const klaviyoQuery = `
        SELECT COALESCE(SUM(count), 0) AS emails_sent
        FROM klaviyo_campaign_metrics
        WHERE metric_type = 'sent' AND metric_date >= $1::date AND metric_date <= $2::date
      `;
      const { rows: klaviyoRows } = await client.query(klaviyoQuery, [startDateOnly, endDateOnly]);
      const klaviyoEmailsSent = parseInt(klaviyoRows[0]?.emails_sent || 0);

      res.json({
        totalLeads: parseInt(formStats.total_leads || 0),
        totalRegistrations: parseInt(formStats.total_registrations || 0),
        conversionRate: parseFloat(formStats.conversion_rate || 0),
        metaSpend,
        googleSpend,
        klaviyoEmailsSent
      });
    } finally {
      client.release();
    }
  } catch (error) {
    logger.error({ err: error }, 'Error fetching marketing summary:');
      res.status(500).json({ error: 'Failed to fetch marketing summary', details: error.message });
  }
}));

// Download report as PDF
router.get('/download/:id', requireAdmin, asyncHandler(async (req, res) => {
  try {
    const { id } = req.params;
    
    // Get report send record
    const { rows } = await pool.query(
      'SELECT * FROM report_sends WHERE id = $1',
      [id]
    );
    
    if (rows.length === 0) {
      return res.status(404).json({ error: 'Report not found' });
    }
    
    const reportSend = rows[0];
    const reportType = reportSend.report_type;
    
    // Regenerate the report data
    const reportService = require('../services/report-service');
    const startDate = DateTime.fromISO(reportSend.period_start).setZone('America/New_York');
    const endDate = DateTime.fromISO(reportSend.period_end).setZone('America/New_York');
    const dateRange = {
      start: startDate.toISODate(),
      end: endDate.toISODate(),
      startDateTime: startDate,
      endDateTime: endDate
    };
    
    // Calculate trendsEnd for consistency with report generation
    // For weekly: trendsEnd is start of current week
    // For monthly: trendsEnd is start of next month
    let trendsEnd = null;
    if (reportType === 'weekly') {
      // Trends end is the start of the week after the report period
      trendsEnd = endDate.plus({ days: 1 }).startOf('day').toISODate();
    } else {
      // Trends end is the start of the month after the report period
      trendsEnd = endDate.plus({ months: 1 }).startOf('month').toISODate();
    }
    
    const data = await reportService.generateAnalyticsData(
      dateRange.start,
      dateRange.end,
      reportType,
      trendsEnd
    );
    
    // Generate multi-period analytics for enhanced reports
    // Calculate week/month offset based on report send date
    const reportDate = DateTime.fromISO(reportSend.period_start).setZone('America/New_York');
    const now = DateTime.now().setZone('America/New_York');
    let weekOffset = 0;
    let monthOffset = 0;
    
    if (reportType === 'weekly') {
      // Calculate how many weeks ago this report was for
      const weeksDiff = Math.floor(now.diff(reportDate, 'weeks').weeks);
      weekOffset = Math.max(0, weeksDiff);
    } else {
      // Calculate how many months ago this report was for
      const monthsDiff = Math.floor(now.diff(reportDate, 'months').months);
      monthOffset = Math.max(0, monthsDiff);
    }
    
    let multiPeriodData = null;
    try {
      multiPeriodData = await reportService.generateMultiPeriodAnalytics(reportType, weekOffset, monthOffset);
    } catch (error) {
      logger.warn({ error: error.message }, 'Could not generate multi-period data for PDF, using basic format:');
    }
    
    // Generate HTML with multi-period data if available
    const html = generateReportEmail({
      reportType,
      dateRange,
      analytics: data.analytics,
      trends: data.trends,
      marketing: data.marketing,
      multiPeriod: multiPeriodData
    });
    
    // Convert HTML to PDF using Puppeteer
    const puppeteerInstance = puppeteer || global.puppeteer;
    if (!puppeteerInstance) {
      logger.error('PDF generation failed: Puppeteer not configured');
      return res.status(500).json({ 
        error: 'PDF generation not available - Puppeteer not configured',
        details: 'Puppeteer is required for PDF generation. Please ensure it is installed and configured.'
      });
    }
    
    let browser;
    try {
      browser = await puppeteerInstance.launch({
        headless: true,
        args: ['--no-sandbox', '--disable-setuid-sandbox']
      });
      
      const page = await browser.newPage();
      await page.setContent(html, { waitUntil: 'networkidle0' });
      
      // Generate PDF with timeout
      const pdf = await Promise.race([
        page.pdf({
          format: 'Letter',
          printBackground: true,
          margin: {
            top: '20px',
            right: '20px',
            bottom: '20px',
            left: '20px'
          }
        }),
        new Promise((_, reject) => 
          setTimeout(() => reject(new Error('PDF generation timeout')), 60000)
        )
      ]);
      
      // Set response headers BEFORE sending
      res.setHeader('Content-Type', 'application/pdf');
      res.setHeader('Content-Disposition', `attachment; filename="${reportType}_report_${reportSend.period_start}_to_${reportSend.period_end}.pdf"`);
      res.send(pdf);
    } catch (pdfError) {
      logger.error({ data: pdfError }, 'Error generating PDF:');
      // Don't send JSON response if headers already sent
      if (!res.headersSent) {
        res.status(500).json({ error: 'Failed to generate PDF', details: pdfError.message });
      } else {
        // Headers already sent, can't change response type
        res.end();
      }
    } finally {
      if (browser) {
        try {
          await browser.close();
        } catch (closeError) {
          logger.error({ data: closeError }, 'Error closing browser:');
        }
      }
    }
  } catch (error) {
    logger.error({ err: error }, 'Error generating PDF:');
    // Ensure we haven't already sent headers
    if (!res.headersSent) {
      res.status(500).json({ error: 'Failed to generate PDF', details: error.message });
    }
  }
}));

// Get drill-down data for a specific metric
router.get('/executive-reports/drilldown', requireAdmin, asyncHandler(async (req, res) => {
  try {
    const { metric, segment, startDate, endDate } = req.query;

    // Validate required params
    if (!metric || !segment || !startDate || !endDate) {
      return res.status(400).json({
        error: 'Missing required parameters',
        required: ['metric', 'segment', 'startDate', 'endDate']
      });
    }

    // Validate metric
    const validMetrics = [
      'revenue', 'tutorPay', 'activeTutors', 'activeStudents',
      'newLeads', 'trialLessons', 'firstPaidLessons', 'thirdLessons',
      'activeSchools', 'lessonsCompleted', 'campSessions', 'campDays',
      'campStudents', 'classPackPurchases',
      // Total Business Overview metrics
      'totalRevenue', 'totalTutorPay', 'uniqueStudents',
      'tutors10Plus', 'tutors40_60', 'tutors60_80', 'tutors80Plus', 'tutorsBonusTotal'
    ];
    if (!validMetrics.includes(metric)) {
      return res.status(400).json({
        error: `Invalid metric: ${metric}`,
        validMetrics
      });
    }

    // Validate segment
    const validSegments = ['home', 'online', 'schools', 'club', 'total'];
    if (!validSegments.includes(segment)) {
      return res.status(400).json({
        error: `Invalid segment: ${segment}`,
        validSegments
      });
    }

    // Verify pool is available
    if (!global.pool) {
      logger.error('Database pool not available');
      return res.status(500).json({ error: 'Database connection not available' });
    }

    logger.info(`[Drilldown] Fetching ${metric} for ${segment} from ${startDate} to ${endDate}`);

    const ReportDrilldownService = require('../services/report-drilldown-service');
    const drilldownService = new ReportDrilldownService(global.pool);
    const data = await drilldownService.getDrilldownData(metric, segment, startDate, endDate);

    logger.info(`[Drilldown] Successfully returned ${data?.data?.length || 0} rows for ${metric}`);
    res.json(data);
  } catch (error) {
    logger.error({ error: error.message }, 'Error fetching drill-down data:');
    logger.error({ data: error.stack }, 'Stack:');
    res.status(500).json({
      error: 'Failed to fetch drill-down data',
      details: error.message
    });
  }
}));

module.exports = router;

