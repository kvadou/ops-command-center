/**
 * Google Ads Analytics API Routes
 * Provides comprehensive Google Ads analytics similar to Meta Ads analytics
 */

const express = require('express');
const router = express.Router();
const { pool } = global;
const { asyncHandler } = require('../middleware/error-handler');
const { logger } = require('../utils/logger');

// Helper function to convert ET date to UTC
function etDateToUTC(dateStr, isEndOfDay) {
  const { DateTime } = require('luxon');
  const et = DateTime.fromISO(dateStr, { zone: 'America/New_York' });
  if (isEndOfDay) {
    return et.endOf('day').toUTC().toISO();
  }
  return et.startOf('day').toUTC().toISO();
}

// Helper function to get LTV by label (similar to Meta analytics)
// Uses the same CTE-based approach as api-submissions.js
async function getLTVByLabel(ltvMetric = 'average') {
  const client = await pool.connect();
  try {
    const query = `
      WITH client_invoice_revenue AS (
        SELECT
          CAST(client_id AS VARCHAR) AS client_id,
          SUM(CASE WHEN status = 'paid' THEN gross ELSE 0 END) AS total_paid_invoices
        FROM invoices
        GROUP BY client_id
      ),
      client_lesson_stats AS (
        SELECT
          CAST(ar.paying_client_id AS VARCHAR) AS client_id,
          COUNT(DISTINCT ar.appointment_id) AS total_lessons
        FROM appointment_recipients ar
        JOIN appointments a ON a.appointment_id = ar.appointment_id
        WHERE a.status IN ('complete', 'cancelled - chargeable')
          AND ar.status <> 'missed'
          AND ar.paying_client_id IS NOT NULL
        GROUP BY ar.paying_client_id
        HAVING COUNT(DISTINCT ar.appointment_id) >= 1
      ),
      client_ltv_by_label AS (
        SELECT
          jsonb_extract_path_text(label_elem, 'name') AS label_name,
          cir.total_paid_invoices AS ltv_value
        FROM clients c
        LEFT JOIN client_lesson_stats cls ON c.client_id = cls.client_id
        LEFT JOIN client_invoice_revenue cir ON c.client_id = cir.client_id
        CROSS JOIN LATERAL jsonb_array_elements(c.labels) AS label_elem
        WHERE cls.total_lessons >= 1
          AND cir.total_paid_invoices > 0
          AND jsonb_extract_path_text(label_elem, 'name') IS NOT NULL
          AND jsonb_extract_path_text(label_elem, 'name') != ''
      ),
      label_ltv_stats AS (
        SELECT
          label_name,
          AVG(ltv_value) AS avg_ltv,
          PERCENTILE_CONT(0.5) WITHIN GROUP (ORDER BY ltv_value) AS median_ltv
        FROM client_ltv_by_label
        GROUP BY label_name
      )
      SELECT label_name, avg_ltv, median_ltv
      FROM label_ltv_stats
      WHERE avg_ltv > 0 OR median_ltv > 0
    `;
    const result = await client.query(query);
    const ltvMap = {};
    result.rows.forEach(row => {
      const avg = parseFloat(row.avg_ltv) || 0;
      const median = parseFloat(row.median_ltv) || 0;
      // For backward compatibility, return single value if metric specified
      if (ltvMetric === 'median') {
        ltvMap[row.label_name] = median;
      } else {
        ltvMap[row.label_name] = avg;
      }
    });
    return ltvMap;
  } catch (err) {
    logger.error({ err: err }, 'Error fetching LTV by label:');
    return {};
  } finally {
    client.release();
  }
}

/**
 * Get Google Ads analytics
 * GET /api/submissions/analytics/google?startDate=YYYY-MM-DD&endDate=YYYY-MM-DD
 */
router.get('/', asyncHandler(async (req, res) => {
  const client = await pool.connect();
  try {
    const { startDate, endDate, ltvMetric = 'average' } = req.query;

    if (!startDate || !endDate) {
      return res.status(400).json({ error: 'startDate and endDate are required' });
    }

    // Convert ET dates to UTC for database comparison
    const startDateUTC = etDateToUTC(startDate, false);
    const endDateUTC = etDateToUTC(endDate, true);
    const start = new Date(startDateUTC);
    const end = new Date(endDateUTC);

    if (isNaN(start.getTime()) || isNaN(end.getTime())) {
      return res.status(400).json({ error: 'Invalid date format' });
    }

    const startISO = start.toISOString();
    const endISO = end.toISOString();
    const params = [startISO, endISO];

    // Get LTV by label for revenue calculations
    const ltvByLabel = await getLTVByLabel(ltvMetric);

    // Calculate LTV-based revenue for Google Ads submissions
    const calculateLTVRevenue = (completionDetails) => {
      if (!completionDetails || !Array.isArray(completionDetails)) return 0;
      return completionDetails.reduce((total, detail) => {
        const labelName = detail.label_name;
        const ltv = ltvByLabel[labelName] || 0;
        return total + ltv;
      }, 0);
    };

    // Query for overall Google Ads metrics
    const overallQuery = `
      WITH       form_stats AS (
        SELECT
          COUNT(*) AS google_form_starts,
          COUNT(*) FILTER (WHERE payment_status IN ('paid', 'verified')) AS google_form_completions,
          COUNT(*) FILTER (WHERE payment_status = 'paid') AS google_payments,
          SUM(actual_price) FILTER (WHERE payment_status = 'paid') AS google_revenue,
          -- Include label_name and booking_type for LTV calculation
          json_agg(
            json_build_object(
              'label_name', label_name,
              'booking_type', booking_type,
              'payment_status', payment_status,
              'actual_price', actual_price,
              'is_google', true
            ) ORDER BY created_at
          ) FILTER (WHERE payment_status IN ('paid', 'verified')) AS completion_details
        FROM booking_submissions
        WHERE created_at >= $1::timestamptz AND created_at <= $2::timestamptz
          AND (
            LOWER(COALESCE(utm->>'utm_source', '')) = 'google'
            OR COALESCE(utm->>'gclid', '') != ''
            OR LOWER(COALESCE(utm->>'utm_source', '')) LIKE '%google%'
          )
      ),
      view_stats AS (
        SELECT
          COALESCE(COUNT(*), 0) AS google_form_views,
          COALESCE(COUNT(DISTINCT session_id), 0) AS google_unique_view_sessions
        FROM booking_form_views
        WHERE created_at >= $1::timestamptz AND created_at <= $2::timestamptz
          AND (
            LOWER(COALESCE(utm->>'utm_source', '')) = 'google'
            OR COALESCE(utm->>'gclid', '') != ''
            OR LOWER(COALESCE(utm->>'utm_source', '')) LIKE '%google%'
          )
      ),
      ad_spend_stats AS (
        SELECT
          COALESCE(SUM(impressions), 0) AS google_impressions,
          COALESCE(SUM(clicks), 0) AS google_clicks,
          COALESCE(SUM(spend), 0) AS google_spend,
          CASE 
            WHEN SUM(impressions) > 0 THEN ROUND((SUM(clicks)::numeric / SUM(impressions)::numeric) * 100, 2)
            ELSE 0
          END AS google_ctr,
          CASE 
            WHEN SUM(clicks) > 0 THEN ROUND((SUM(spend)::numeric / SUM(clicks)::numeric), 2)
            ELSE 0
          END AS google_cpc,
          COALESCE(SUM(conversions), 0) AS google_conversions,
          CASE 
            WHEN SUM(clicks) > 0 THEN ROUND((SUM(conversions)::numeric / SUM(clicks)::numeric) * 100, 2)
            ELSE 0
          END AS google_conversion_rate
        FROM ad_spend_data
        WHERE date >= DATE($1::timestamptz) AND date <= DATE($2::timestamptz)
          AND platform = 'google'
      )
      SELECT 
        COALESCE(vs.google_form_views, 0) AS google_form_views,
        COALESCE(vs.google_unique_view_sessions, 0) AS google_unique_view_sessions,
        COALESCE(fs.google_form_starts, 0) AS google_form_starts,
        COALESCE(fs.google_form_completions, 0) AS google_form_completions,
        COALESCE(fs.google_payments, 0) AS google_payments,
        COALESCE(fs.google_revenue, 0) AS google_revenue,
        fs.completion_details,
        COALESCE(ads.google_impressions, 0) AS google_impressions,
        COALESCE(ads.google_clicks, 0) AS google_clicks,
        COALESCE(ads.google_spend, 0) AS google_spend,
        COALESCE(ads.google_ctr, 0) AS google_ctr,
        COALESCE(ads.google_cpc, 0) AS google_cpc,
        COALESCE(ads.google_conversions, 0) AS google_conversions,
        COALESCE(ads.google_conversion_rate, 0) AS google_conversion_rate,
        CASE 
          WHEN COALESCE(vs.google_form_views, 0) > 0 THEN ROUND((COALESCE(fs.google_form_starts, 0)::numeric / vs.google_form_views::numeric) * 100, 2)
          ELSE 0
        END AS google_form_start_rate,
        CASE 
          WHEN COALESCE(fs.google_form_starts, 0) > 0 THEN ROUND((COALESCE(fs.google_form_completions, 0)::numeric / fs.google_form_starts::numeric) * 100, 2)
          ELSE 0
        END AS google_form_completion_rate,
        CASE 
          WHEN COALESCE(fs.google_form_starts, 0) > 0 AND COALESCE(ads.google_spend, 0) > 0 THEN ROUND((ads.google_spend::numeric / fs.google_form_starts::numeric), 2)
          ELSE 0
        END AS google_cpl,
        CASE 
          WHEN COALESCE(fs.google_form_completions, 0) > 0 AND COALESCE(ads.google_spend, 0) > 0 THEN ROUND((ads.google_spend::numeric / fs.google_form_completions::numeric), 2)
          ELSE 0
        END AS google_cpr,
        CASE 
          WHEN COALESCE(ads.google_spend, 0) > 0 AND COALESCE(fs.google_revenue, 0) > 0 THEN ROUND((fs.google_revenue::numeric / ads.google_spend::numeric), 2)
          ELSE 0
        END AS google_roas
      FROM form_stats fs
      CROSS JOIN view_stats vs
      CROSS JOIN ad_spend_stats ads
    `;

    const overallResult = await client.query(overallQuery, params);
    const rawOverall = overallResult.rows[0] || {
      google_form_views: 0,
      google_unique_view_sessions: 0,
      google_form_starts: 0,
      google_form_completions: 0,
      google_payments: 0,
      google_revenue: 0,
      google_impressions: 0,
      google_clicks: 0,
      google_spend: 0,
      google_ctr: 0,
      google_cpc: 0,
      google_conversions: 0,
      google_conversion_rate: 0,
      google_form_start_rate: 0,
      google_form_completion_rate: 0,
      google_cpl: 0,
      google_cpr: 0,
      google_roas: 0,
      completion_details: []
    };

    // Calculate LTV-based revenue
    const ltvRevenue = calculateLTVRevenue(rawOverall.completion_details);
    const googleLtvRoas = rawOverall.google_spend > 0 && ltvRevenue > 0
      ? parseFloat((ltvRevenue / rawOverall.google_spend).toFixed(2))
      : 0;

    // Query for campaign-level data
    const campaignQuery = `
      WITH ad_data AS (
        SELECT
          utm_campaign,
          campaign_name,
          SUM(impressions) AS impressions,
          SUM(clicks) AS clicks,
          SUM(spend) AS spend,
          CASE 
            WHEN SUM(impressions) > 0 THEN ROUND((SUM(clicks)::numeric / SUM(impressions)::numeric) * 100, 2)
            ELSE 0
          END AS ctr,
          CASE 
            WHEN SUM(clicks) > 0 THEN ROUND((SUM(spend)::numeric / SUM(clicks)::numeric), 2)
            ELSE 0
          END AS cpc,
          SUM(conversions) AS conversions
        FROM ad_spend_data
        WHERE date >= DATE($1::timestamptz) AND date <= DATE($2::timestamptz)
          AND platform = 'google'
        GROUP BY utm_campaign, campaign_name
      ),
      submission_data AS (
        SELECT
          COALESCE(utm->>'utm_campaign', '') AS utm_campaign,
          COUNT(*) AS form_starts,
          COUNT(*) FILTER (WHERE payment_status IN ('paid', 'verified')) AS form_completions,
          SUM(actual_price) FILTER (WHERE payment_status = 'paid') AS revenue,
          json_agg(
            json_build_object(
              'label_name', label_name,
              'booking_type', booking_type,
              'payment_status', payment_status,
              'actual_price', actual_price
            )
          ) FILTER (WHERE payment_status IN ('paid', 'verified')) AS completion_details
        FROM booking_submissions
        WHERE created_at >= $1::timestamptz AND created_at <= $2::timestamptz
          AND (
            LOWER(COALESCE(utm->>'utm_source', '')) = 'google'
            OR COALESCE(utm->>'gclid', '') != ''
            OR LOWER(COALESCE(utm->>'utm_source', '')) LIKE '%google%'
          )
          AND COALESCE(utm->>'utm_campaign', '') != ''
        GROUP BY COALESCE(utm->>'utm_campaign', '')
      )
      SELECT
        COALESCE(ad.utm_campaign, sub.utm_campaign) AS utm_campaign,
        COALESCE(ad.campaign_name, sub.utm_campaign) AS campaign_name,
        COALESCE(ad.impressions, 0) AS impressions,
        COALESCE(ad.clicks, 0) AS clicks,
        COALESCE(ad.spend, 0) AS spend,
        COALESCE(ad.ctr, 0) AS ctr,
        COALESCE(ad.cpc, 0) AS cpc,
        COALESCE(ad.conversions, 0) AS conversions,
        COALESCE(sub.form_starts, 0) AS form_starts,
        COALESCE(sub.form_completions, 0) AS form_completions,
        COALESCE(sub.revenue, 0) AS revenue,
        sub.completion_details,
        CASE 
          WHEN COALESCE(sub.form_starts, 0) > 0 AND COALESCE(ad.spend, 0) > 0 THEN ROUND((ad.spend::numeric / sub.form_starts::numeric), 2)
          ELSE 0
        END AS cpl,
        CASE 
          WHEN COALESCE(sub.form_completions, 0) > 0 AND COALESCE(ad.spend, 0) > 0 THEN ROUND((ad.spend::numeric / sub.form_completions::numeric), 2)
          ELSE 0
        END AS cpr,
        CASE 
          WHEN COALESCE(ad.spend, 0) > 0 AND COALESCE(sub.revenue, 0) > 0 THEN ROUND((sub.revenue::numeric / ad.spend::numeric), 2)
          ELSE 0
        END AS roas
      FROM ad_data ad
      FULL OUTER JOIN submission_data sub ON REPLACE(LOWER(COALESCE(ad.utm_campaign, '')), ' ', '_') = LOWER(COALESCE(sub.utm_campaign, ''))
      WHERE ad.utm_campaign IS NOT NULL OR sub.utm_campaign IS NOT NULL
      ORDER BY COALESCE(ad.spend, 0) DESC, COALESCE(sub.revenue, 0) DESC
    `;

    const campaignResult = await client.query(campaignQuery, params);
    
    // Calculate LTV revenue for each campaign
    const campaigns = campaignResult.rows.map(campaign => {
      const campaignLtvRevenue = calculateLTVRevenue(campaign.completion_details);
      const campaignLtvRoas = campaign.spend > 0 && campaignLtvRevenue > 0
        ? parseFloat((campaignLtvRevenue / campaign.spend).toFixed(2))
        : 0;
      
      return {
        ...campaign,
        ltv_revenue: campaignLtvRevenue,
        ltv_roas: campaignLtvRoas
      };
    });

    // Query for daily trends
    const dailyQuery = `
      WITH ad_data AS (
        SELECT
          date,
          SUM(impressions) AS impressions,
          SUM(clicks) AS clicks,
          SUM(spend) AS spend,
          SUM(conversions) AS conversions
        FROM ad_spend_data
        WHERE date >= DATE($1::timestamptz) AND date <= DATE($2::timestamptz)
          AND platform = 'google'
        GROUP BY date
      ),
      submission_data AS (
        SELECT
          DATE(created_at) AS date,
          COUNT(*) AS form_starts,
          COUNT(*) FILTER (WHERE payment_status IN ('paid', 'verified')) AS form_completions,
          SUM(actual_price) FILTER (WHERE payment_status = 'paid') AS revenue
        FROM booking_submissions
        WHERE created_at >= $1::timestamptz AND created_at <= $2::timestamptz
          AND (
            LOWER(COALESCE(utm->>'utm_source', '')) = 'google'
            OR COALESCE(utm->>'gclid', '') != ''
            OR LOWER(COALESCE(utm->>'utm_source', '')) LIKE '%google%'
          )
        GROUP BY DATE(created_at)
      )
      SELECT
        COALESCE(ad.date, sub.date) AS date,
        COALESCE(ad.impressions, 0) AS impressions,
        COALESCE(ad.clicks, 0) AS clicks,
        COALESCE(ad.spend, 0) AS spend,
        COALESCE(ad.conversions, 0) AS conversions,
        COALESCE(sub.form_starts, 0) AS form_starts,
        COALESCE(sub.form_completions, 0) AS form_completions,
        COALESCE(sub.revenue, 0) AS revenue
      FROM ad_data ad
      FULL OUTER JOIN submission_data sub ON ad.date = sub.date
      WHERE ad.date IS NOT NULL OR sub.date IS NOT NULL
      ORDER BY COALESCE(ad.date, sub.date) ASC
    `;

    const dailyResult = await client.query(dailyQuery, params);

    // Build overall summary
    const overall = {
      google_form_views: parseInt(rawOverall.google_form_views) || 0,
      google_unique_view_sessions: parseInt(rawOverall.google_unique_view_sessions) || 0,
      google_form_starts: parseInt(rawOverall.google_form_starts) || 0,
      google_form_completions: parseInt(rawOverall.google_form_completions) || 0,
      google_payments: parseInt(rawOverall.google_payments) || 0,
      google_revenue: parseFloat(rawOverall.google_revenue) || 0,
      google_impressions: parseInt(rawOverall.google_impressions) || 0,
      google_clicks: parseInt(rawOverall.google_clicks) || 0,
      google_spend: parseFloat(rawOverall.google_spend) || 0,
      google_ctr: parseFloat(rawOverall.google_ctr) || 0,
      google_cpc: parseFloat(rawOverall.google_cpc) || 0,
      google_conversions: parseInt(rawOverall.google_conversions) || 0,
      google_conversion_rate: parseFloat(rawOverall.google_conversion_rate) || 0,
      google_form_start_rate: parseFloat(rawOverall.google_form_start_rate) || 0,
      google_form_completion_rate: parseFloat(rawOverall.google_form_completion_rate) || 0,
      google_cpl: parseFloat(rawOverall.google_cpl) || 0,
      google_cpr: parseFloat(rawOverall.google_cpr) || 0,
      google_roas: parseFloat(rawOverall.google_roas) || 0,
      google_ltv_revenue: ltvRevenue,
      google_ltv_roas: googleLtvRoas
    };

    res.json({
      period: {
        startDate: start.toISOString(),
        endDate: end.toISOString()
      },
      overall,
      campaigns,
      daily: dailyResult.rows
    });
  } catch (err) {
    logger.error({ err: err }, '❌ Error fetching Google analytics:');
    res.status(500).json({
      error: 'Failed to fetch Google analytics',
      details: err.message
    });
  } finally {
    client.release();
  }
}));

module.exports = router;
