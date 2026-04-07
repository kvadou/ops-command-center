/**
 * Klaviyo Analytics API Routes
 * Provides analytics for email marketing campaigns via Klaviyo API
 */

const express = require('express');
const router = express.Router();
const axios = require('axios');
const { columnsExist } = require('../utils/schema-cache');
const { asyncHandler } = require('../middleware/error-handler');
const { logger } = require('../utils/logger');

const KLAVIYO_API_KEY = process.env.KLAVIYO_API_KEY || 'REPLACE_ME';
const KLAVIYO_API_BASE = 'https://a.klaviyo.com/api';

/**
 * Helper function to make Klaviyo API requests
 */
async function klaviyoRequest(endpoint, params = {}) {
  try {
    const url = `${KLAVIYO_API_BASE}${endpoint}`;
    const response = await axios.get(url, {
      params: {
        ...params,
        api_key: KLAVIYO_API_KEY,
      },
      headers: {
        'Accept': 'application/json',
        'Content-Type': 'application/json',
      },
    });
    return response.data;
  } catch (error) {
    logger.error({ error: error.response?.data || error.message }, `Klaviyo API error for ${endpoint}:`);
    throw error;
  }
}

/**
 * Get Klaviyo analytics for email marketing campaigns
 * GET /api/submissions/analytics/klaviyo?startDate=YYYY-MM-DD&endDate=YYYY-MM-DD
 */
router.get('/', asyncHandler(async (req, res) => {
  const pool = req.locationPool || global.pool;
  const client = await pool.connect();
  try {
    const { startDate, endDate } = req.query;

    if (!startDate || !endDate) {
      return res.status(400).json({ error: 'startDate and endDate are required' });
    }

    // Convert dates to UTC timestamps
    // Handle both "YYYY-MM-DD" and ISO format dates
    const startDateParsed = startDate.includes('T') ? startDate : `${startDate}T00:00:00Z`;
    const endDateParsed = endDate.includes('T') ? endDate : `${endDate}T23:59:59Z`;
    const startDateUTC = new Date(startDateParsed).toISOString();
    const endDateUTC = new Date(endDateParsed).toISOString();
    
    // Extract date part for SQL date comparisons (YYYY-MM-DD)
    const startDateOnly = startDate.split('T')[0];
    const endDateOnly = endDate.split('T')[0];

    logger.info({ data: { startDate, endDate, startDateUTC, endDateUTC, startDateOnly, endDateOnly } }, '📊 Fetching Klaviyo analytics:');

    // Get comprehensive Klaviyo data from our database (synced from API)
    
    // Get total subscribers from klaviyo_profiles table
    let totalSubscribers = 0;
    let profiles = [];
    try {
      const { rows: profileRows } = await client.query(`
        SELECT 
          id, email, phone_number, first_name, last_name,
          created, updated, subscribed, unsubscribed_at
        FROM klaviyo_profiles
        WHERE subscribed = true
        ORDER BY created DESC
        LIMIT 100
      `);
      profiles = profileRows;
      
      // Get total count
      const { rows: countRows } = await client.query(`
        SELECT COUNT(*) as total FROM klaviyo_profiles WHERE subscribed = true
      `);
      totalSubscribers = parseInt(countRows[0]?.total || 0);
    } catch (err) {
      logger.warn({ data: err.message }, 'Could not fetch Klaviyo profiles from database:');
      // Fallback to booking_submissions
      const { rows: profileRows } = await client.query(`
        SELECT DISTINCT
          klaviyo_id as id,
          parent_email as email,
          parent_first as first_name,
          parent_last as last_name,
          created_at as created
        FROM booking_submissions
        WHERE klaviyo_id IS NOT NULL
        ORDER BY created_at DESC
        LIMIT 100
      `);
      profiles = profileRows;
      totalSubscribers = profileRows.length;
    }

    // Get campaign metrics from klaviyo_campaign_metrics table
    let campaigns = [];
    let emailsSent = 0;
    let uniqueOpens = 0;
    let uniqueClicks = 0;
    let conversions = 0;
    let revenue = 0;
    let unsubscribes = 0;
    let bounces = 0;
    let spamComplaints = 0;

    try {
      // Check if UTM columns exist (cached after first call)
      let hasUtmColumns = false;
      try {
        const utmCols = await columnsExist(client, 'klaviyo_campaigns', ['utm_source', 'utm_medium', 'utm_campaign']);
        hasUtmColumns = utmCols.length > 0;
      } catch (e) {
        logger.warn({ data: e.message }, 'Could not check for UTM columns, assuming they exist:');
        hasUtmColumns = true; // Assume they exist to avoid breaking
      }

      // Build query with or without UTM columns
      const utmColumns = hasUtmColumns 
        ? 'c.utm_source, c.utm_medium, c.utm_campaign, c.utm_content, c.utm_term, c.utm_id,'
        : 'NULL::VARCHAR as utm_source, NULL::VARCHAR as utm_medium, NULL::VARCHAR as utm_campaign, NULL::VARCHAR as utm_content, NULL::VARCHAR as utm_term, NULL::VARCHAR as utm_id,';
      
      const utmGroupBy = hasUtmColumns 
        ? 'c.utm_source, c.utm_medium, c.utm_campaign, c.utm_content, c.utm_term, c.utm_id'
        : '';

      // Get campaigns within date range with detailed metrics and UTM parameters
      const { rows: campaignRows } = await client.query(`
        SELECT 
          c.id, c.name, c.status, c.subject, c.from_name, c.from_email,
          c.sent_at, c.created_at, c.message_type,
          ${utmColumns}
          COALESCE(SUM(CASE WHEN cm.metric_type = 'sent' THEN cm.count ELSE 0 END), 0) as emails_sent,
          COALESCE(SUM(CASE WHEN cm.metric_type = 'opened' THEN cm.unique_count ELSE 0 END), 0) as unique_opens,
          COALESCE(SUM(CASE WHEN cm.metric_type = 'clicked' THEN cm.unique_count ELSE 0 END), 0) as unique_clicks,
          COALESCE(SUM(CASE WHEN cm.metric_type = 'bounced' THEN cm.count ELSE 0 END), 0) as bounces,
          COALESCE(SUM(CASE WHEN cm.metric_type = 'unsubscribed' THEN cm.count ELSE 0 END), 0) as unsubscribes,
          COALESCE(SUM(CASE WHEN cm.metric_type = 'revenue' THEN cm.value ELSE 0 END), 0) as revenue,
          COALESCE(SUM(CASE WHEN cm.metric_type = 'conversion' THEN cm.count ELSE 0 END), 0) as conversions
        FROM klaviyo_campaigns c
        LEFT JOIN klaviyo_campaign_metrics cm ON c.id = cm.campaign_id
          AND cm.metric_date >= $3::date AND cm.metric_date <= $4::date
        WHERE (c.sent_at >= $1::timestamptz AND c.sent_at <= $2::timestamptz)
          OR (c.created_at >= $1::timestamptz AND c.created_at <= $2::timestamptz)
        GROUP BY c.id, c.name, c.status, c.subject, c.from_name, c.from_email, c.sent_at, c.created_at, c.message_type${hasUtmColumns ? `, ${utmGroupBy}` : ''}
        ORDER BY c.sent_at DESC NULLS LAST, c.created_at DESC
      `, [startDateUTC, endDateUTC, startDateOnly, endDateOnly]);
      
      campaigns = campaignRows;

      // Aggregate campaign metrics for the date range
      const { rows: metricRows } = await client.query(`
        SELECT 
          metric_type,
          SUM(count) as total_count,
          SUM(unique_count) as total_unique_count,
          SUM(value) as total_value
        FROM klaviyo_campaign_metrics
        WHERE metric_date >= $1::date AND metric_date <= $2::date
        GROUP BY metric_type
      `, [startDateOnly, endDateOnly]);

      for (const metric of metricRows) {
        const type = metric.metric_type;
        const count = parseInt(metric.total_count || 0);
        const uniqueCount = parseInt(metric.total_unique_count || 0);
        const value = parseFloat(metric.total_value || 0);

        switch (type) {
          case 'sent':
            emailsSent = count;
            break;
          case 'opened':
            uniqueOpens = uniqueCount || count;
            break;
          case 'clicked':
            uniqueClicks = uniqueCount || count;
            break;
          case 'conversion':
            conversions = count;
            break;
          case 'revenue':
            revenue = value;
            break;
          case 'unsubscribed':
            unsubscribes = count;
            break;
          case 'bounced':
            bounces = count;
            break;
          case 'spam_complaint':
            spamComplaints = count;
            break;
        }
      }
    } catch (err) {
      logger.warn({ data: err.message }, 'Could not fetch campaign metrics from database:');
      // Metrics will default to 0
    }

    // Rates will be calculated in summary after combining campaign and flow metrics

    // Get Klaviyo-acquired clients from booking_submissions with detailed breakdown
    // This links Klaviyo profiles to actual bookings/revenue
    const klaviyoAcquiredQuery = `
      WITH klaviyo_profiles AS (
        SELECT DISTINCT
          bs.id AS submission_id,
          bs.tc_client_id,
          bs.created_at AS acquisition_date,
          bs.parent_email,
          bs.parent_first || ' ' || bs.parent_last AS parent_name,
          bs.booking_type,
          bs.label_name,
          bs.payment_status,
          bs.actual_price,
          COALESCE(bs.utm->>'utm_campaign', '') AS utm_campaign,
          COALESCE(bs.utm->>'utm_source', '') AS utm_source,
          COALESCE(bs.utm->>'utm_medium', '') AS utm_medium
        FROM booking_submissions bs
        WHERE bs.created_at >= $1::timestamptz 
          AND bs.created_at <= $2::timestamptz
          AND bs.klaviyo_id IS NOT NULL
          AND bs.payment_status IN ('paid', 'verified')
          AND bs.tc_client_id IS NOT NULL
      ),
      client_revenue AS (
        SELECT
          kp.submission_id,
          kp.tc_client_id,
          kp.acquisition_date,
          kp.parent_email,
          kp.parent_name,
          kp.booking_type,
          kp.label_name,
          kp.utm_campaign,
          kp.utm_source,
          kp.utm_medium,
          kp.actual_price AS initial_revenue,
          COALESCE(SUM(CASE WHEN i.status = 'paid' THEN i.gross ELSE 0 END), 0) AS total_revenue
        FROM klaviyo_profiles kp
        LEFT JOIN invoices i ON CAST(kp.tc_client_id AS VARCHAR) = CAST(i.client_id AS VARCHAR)
          AND i.status = 'paid'
          AND i.date_sent >= kp.acquisition_date
        WHERE kp.tc_client_id IS NOT NULL
        GROUP BY 
          kp.submission_id,
          kp.tc_client_id,
          kp.acquisition_date,
          kp.parent_email,
          kp.parent_name,
          kp.booking_type,
          kp.label_name,
          kp.utm_campaign,
          kp.utm_source,
          kp.utm_medium,
          kp.actual_price
      )
      SELECT 
        COUNT(DISTINCT cr.tc_client_id) AS total_clients,
        COUNT(DISTINCT cr.submission_id) AS total_submissions,
        SUM(cr.initial_revenue) AS initial_revenue,
        SUM(cr.total_revenue) AS total_revenue,
        AVG(cr.total_revenue) AS avg_revenue_per_client
      FROM client_revenue cr
    `;

    const { rows: klaviyoRevenueRows } = await client.query(klaviyoAcquiredQuery, [startDateUTC, endDateUTC]);
    const klaviyoRevenue = klaviyoRevenueRows[0] || {};

    // Get detailed customer data with revenue
    let customerData = [];
    try {
      const { rows: customerRows } = await client.query(`
        WITH klaviyo_profiles AS (
          SELECT DISTINCT
            bs.id AS submission_id,
            bs.tc_client_id,
            bs.created_at AS acquisition_date,
            bs.parent_email,
            bs.parent_first || ' ' || bs.parent_last AS parent_name,
            bs.booking_type,
            bs.label_name,
            bs.actual_price,
            COALESCE(bs.utm->>'utm_campaign', '') AS utm_campaign
          FROM booking_submissions bs
          WHERE bs.created_at >= $1::timestamptz 
            AND bs.created_at <= $2::timestamptz
            AND bs.klaviyo_id IS NOT NULL
            AND bs.payment_status IN ('paid', 'verified')
            AND bs.tc_client_id IS NOT NULL
        ),
        client_revenue AS (
          SELECT
            kp.submission_id,
            kp.tc_client_id,
            kp.acquisition_date,
            kp.parent_email,
            kp.parent_name,
            kp.booking_type,
            kp.label_name,
            kp.utm_campaign,
            kp.actual_price AS initial_revenue,
            COALESCE(SUM(CASE WHEN i.status = 'paid' THEN i.gross ELSE 0 END), 0) AS total_revenue
          FROM klaviyo_profiles kp
          LEFT JOIN invoices i ON CAST(kp.tc_client_id AS VARCHAR) = CAST(i.client_id AS VARCHAR)
            AND i.status = 'paid'
            AND i.date_sent >= kp.acquisition_date
          GROUP BY 
            kp.submission_id,
            kp.tc_client_id,
            kp.acquisition_date,
            kp.parent_email,
            kp.parent_name,
            kp.booking_type,
            kp.label_name,
            kp.utm_campaign,
            kp.actual_price
        )
        SELECT 
          cr.tc_client_id,
          cr.parent_email,
          cr.parent_name,
          cr.acquisition_date,
          cr.booking_type,
          cr.label_name,
          cr.utm_campaign,
          cr.initial_revenue,
          cr.total_revenue
        FROM client_revenue cr
        ORDER BY cr.total_revenue DESC
        LIMIT 500
      `, [startDateUTC, endDateUTC]);
      customerData = customerRows;
    } catch (err) {
      logger.warn({ data: err.message }, 'Could not fetch detailed customer data:');
    }

    // Add revenue from Klaviyo-acquired clients to total
    const totalRevenueFromKlaviyo = parseFloat(klaviyoRevenue.total_revenue || 0);
    
    // Note: Campaign revenue from metrics is already included in 'revenue' variable
    // We'll combine it with client revenue in the summary

    // Get additional metrics from flows
    let flowMetrics = { sent: 0, opened: 0, clicked: 0, conversions: 0, revenue: 0 };
    try {
      const { rows: flowMetricRows } = await client.query(`
        SELECT 
          metric_type,
          SUM(count) as total_count,
          SUM(unique_count) as total_unique_count,
          SUM(value) as total_value
        FROM klaviyo_flow_metrics
        WHERE metric_date >= $1::date AND metric_date <= $2::date
        GROUP BY metric_type
      `, [startDateOnly, endDateOnly]);

      for (const metric of flowMetricRows) {
        const type = metric.metric_type;
        if (type === 'sent') flowMetrics.sent += parseInt(metric.total_count || 0);
        if (type === 'opened') flowMetrics.opened += parseInt(metric.total_unique_count || metric.total_count || 0);
        if (type === 'clicked') flowMetrics.clicked += parseInt(metric.total_unique_count || metric.total_count || 0);
        if (type === 'conversion') flowMetrics.conversions += parseInt(metric.total_count || 0);
        if (type === 'revenue') flowMetrics.revenue += parseFloat(metric.total_value || 0);
      }
    } catch (err) {
      logger.warn({ data: err.message }, 'Could not fetch flow metrics:');
    }

    // Combine campaign and flow metrics
    const totalEmailsSent = emailsSent + flowMetrics.sent;
    const totalOpens = uniqueOpens + flowMetrics.opened;
    const totalClicks = uniqueClicks + flowMetrics.clicked;
    const totalConversions = conversions + flowMetrics.conversions;
    // Combine campaign revenue, flow revenue, and client revenue
    const totalRevenue = revenue + flowMetrics.revenue + totalRevenueFromKlaviyo;

    const summary = {
      total_subscribers: totalSubscribers,
      total_campaigns: campaigns.length,
      emails_sent: totalEmailsSent,
      unique_opens: totalOpens,
      unique_clicks: totalClicks,
      open_rate: totalEmailsSent > 0 ? (totalOpens / totalEmailsSent) * 100 : 0,
      click_rate: totalEmailsSent > 0 ? (totalClicks / totalEmailsSent) * 100 : 0,
      conversions: totalConversions,
      conversion_rate: totalEmailsSent > 0 ? (totalConversions / totalEmailsSent) * 100 : 0,
      revenue: totalRevenue,
      revenue_per_email: totalEmailsSent > 0 ? totalRevenue / totalEmailsSent : 0,
      unsubscribes: unsubscribes,
      unsubscribe_rate: totalEmailsSent > 0 ? (unsubscribes / totalEmailsSent) * 100 : 0,
      bounces: bounces,
      spam_complaints: spamComplaints,
      klaviyo_acquired_clients: parseInt(klaviyoRevenue.total_clients || 0),
      klaviyo_acquired_submissions: parseInt(klaviyoRevenue.total_submissions || 0),
      klaviyo_client_revenue: totalRevenueFromKlaviyo,
      campaign_emails_sent: emailsSent,
      flow_emails_sent: flowMetrics.sent,
    };

    logger.info(`✅ Klaviyo analytics query completed: ${campaigns.length} campaigns, ${totalSubscribers} subscribers, ${totalRevenue} revenue`);

    res.json({
      summary,
      campaigns: campaigns.map(c => ({
        id: c.id,
        name: c.name || 'Untitled Campaign',
        created_at: c.created_at,
        status: c.status,
        subject: c.subject,
        from_name: c.from_name,
        from_email: c.from_email,
        sent_at: c.sent_at,
        message_type: c.message_type,
        utm_source: c.utm_source,
        utm_medium: c.utm_medium,
        utm_campaign: c.utm_campaign,
        utm_content: c.utm_content,
        utm_term: c.utm_term,
        utm_id: c.utm_id,
        emails_sent: parseInt(c.emails_sent || 0),
        unique_opens: parseInt(c.unique_opens || 0),
        unique_clicks: parseInt(c.unique_clicks || 0),
        bounces: parseInt(c.bounces || 0),
        unsubscribes: parseInt(c.unsubscribes || 0),
        revenue: parseFloat(c.revenue || 0),
        conversions: parseInt(c.conversions || 0),
        open_rate: c.emails_sent > 0 ? ((c.unique_opens || 0) / c.emails_sent) * 100 : 0,
        click_rate: c.emails_sent > 0 ? ((c.unique_clicks || 0) / c.emails_sent) * 100 : 0,
        conversion_rate: c.emails_sent > 0 ? ((c.conversions || 0) / c.emails_sent) * 100 : 0,
        revenue_per_email: c.emails_sent > 0 ? (c.revenue || 0) / c.emails_sent : 0,
      })),
      profiles: profiles.slice(0, 100).map(p => ({
        id: p.id,
        email: p.email,
        phone_number: p.phone_number,
        first_name: p.first_name,
        last_name: p.last_name,
        created: p.created,
        updated: p.updated,
        subscribed: p.subscribed,
      })),
      customers: customerData.map(c => ({
        client_id: c.tc_client_id,
        email: c.parent_email,
        name: c.parent_name,
        acquisition_date: c.acquisition_date,
        booking_type: c.booking_type,
        location: c.label_name,
        campaign: c.utm_campaign,
        initial_revenue: parseFloat(c.initial_revenue || 0),
        total_revenue: parseFloat(c.total_revenue || 0),
      })),
    });
  } catch (err) {
    logger.error({ err: err }, '❌ Error fetching Klaviyo analytics:');
    logger.error({ error: err.stack }, '❌ Error stack:');
    logger.error({ error: {
      message: err.message,
      code: err.code,
      detail: err.detail,
      hint: err.hint,
      position: err.position,
      internalPosition: err.internalPosition,
      internalQuery: err.internalQuery,
      where: err.where,
      schema: err.schema,
      table: err.table,
      column: err.column,
      dataType: err.dataType,
      constraint: err.constraint,
      file: err.file,
      line: err.line,
      routine: err.routine
    } }, '❌ Error details:');
    res.status(500).json({
      error: 'Failed to fetch Klaviyo analytics',
      details: err.message,
      code: err.code,
      hint: err.hint
    });
  } finally {
    client.release();
  }
}));

module.exports = router;

