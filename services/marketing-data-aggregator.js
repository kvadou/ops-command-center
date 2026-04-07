/**
 * Marketing Data Aggregator Service
 *
 * Aggregates marketing data from multiple sources to build LLM context
 * for the Marketing Command Center AI advisor.
 *
 * Data Sources:
 * - ad_spend_data: Platform spend, CPL, CPR, ROAS
 * - booking_submissions: Leads, registrations, revenue attribution
 * - invoices: Realized revenue linked to acquisition source
 * - CCT analytics: Cohort retention, conversion rates
 * - Google Ads API: Live campaign data (structure, status, budgets)
 * - Meta Ads API: Live campaign data (when enabled)
 */

const { logger } = require('../utils/logger');
const GoogleAdsService = require('./google-ads-api');
const MetaAdsService = require('./meta-ads-api');

class MarketingDataAggregator {
  constructor(pool) {
    this.pool = pool;

    // Initialize ad platform APIs for live data fetching
    try {
      this.googleAdsService = new GoogleAdsService();
    } catch (error) {
      logger.warn({ error: error.message }, 'Google Ads API not available');
      this.googleAdsService = null;
    }

    try {
      this.metaAdsService = new MetaAdsService();
    } catch (error) {
      logger.warn({ error: error.message }, 'Meta Ads API not available');
      this.metaAdsService = null;
    }
  }

  /**
   * Build comprehensive marketing context for Claude
   * Returns structured markdown with ~2-4k tokens of context
   */
  async buildMarketingContext(options = {}) {
    const {
      dateRange = 'last_30_days',
      includeCampaignDetails = true,
      includeAudienceInsights = true,
    } = options;

    const contextParts = [];

    try {
      // Calculate date range
      const dates = this.getDateRange(dateRange);

      // Gather all data in parallel (including realized revenue for AROAS)
      const [
        spendSummary,
        conversionMetrics,
        topCampaigns,
        bottomCampaigns,
        cohortRetention,
        recentTrends,
        realizedRevenue,
        monthlyComparison,
      ] = await Promise.all([
        this.getSpendSummary(dates),
        this.getConversionMetrics(dates),
        this.getTopCampaigns(dates, 5),
        this.getBottomCampaigns(dates, 3),
        this.getCohortRetention(),
        this.getRecentTrends(dates),
        this.getRealizedRevenueSummary(dates),
        this.getMonthlyComparison(),
      ]);

      // Build context string
      contextParts.push(this.formatOverviewSection(spendSummary, conversionMetrics));

      // Add realized revenue section (critical for AROAS insights)
      contextParts.push(this.formatRealizedRevenueSection(realizedRevenue));

      if (includeCampaignDetails) {
        contextParts.push(this.formatCampaignSection(topCampaigns, bottomCampaigns));
      }

      contextParts.push(this.formatTrendsSection(recentTrends));
      contextParts.push(this.formatMonthlyComparisonSection(monthlyComparison));
      contextParts.push(this.formatRetentionSection(cohortRetention));

      if (includeAudienceInsights) {
        const audienceData = await this.getAudienceInsights(dates);
        contextParts.push(this.formatAudienceSection(audienceData));
      }

      // Add budget status note
      contextParts.push(this.formatBudgetStatus());

      return {
        context: contextParts.join('\n\n'),
        metrics: {
          spendSummary,
          conversionMetrics,
          topCampaigns,
          bottomCampaigns,
          cohortRetention,
          realizedRevenue,
          monthlyComparison,
        }
      };
    } catch (error) {
      logger.error({ error: error.message }, 'Failed to build marketing context');
      return {
        context: '## Marketing Data\nUnable to load marketing data. Please try again.',
        metrics: null,
        error: error.message
      };
    }
  }

  /**
   * Calculate date range based on preset
   */
  getDateRange(preset) {
    const now = new Date();
    let startDate, endDate;

    switch (preset) {
      case 'last_7_days':
        startDate = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
        break;
      case 'last_30_days':
        startDate = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);
        break;
      case 'last_90_days':
        startDate = new Date(now.getTime() - 90 * 24 * 60 * 60 * 1000);
        break;
      case 'this_month':
        startDate = new Date(now.getFullYear(), now.getMonth(), 1);
        break;
      case 'last_month':
        startDate = new Date(now.getFullYear(), now.getMonth() - 1, 1);
        now.setDate(0); // Last day of previous month
        break;
      default:
        startDate = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);
    }

    endDate = new Date();
    return { startDate, endDate };
  }

  /**
   * Get date ranges for current and previous periods
   * @param {string} period - 'day', 'week', or 'month'
   */
  getPeriodRanges(period) {
    const now = new Date();
    let periodDays, periodLabel, currentRange, previousRange;

    switch (period) {
      case 'day':
        periodDays = 1;
        periodLabel = 'Daily';
        // Current: today
        currentRange = {
          startDate: new Date(now.getFullYear(), now.getMonth(), now.getDate()),
          endDate: now,
        };
        // Previous: yesterday
        previousRange = {
          startDate: new Date(now.getFullYear(), now.getMonth(), now.getDate() - 1),
          endDate: new Date(now.getFullYear(), now.getMonth(), now.getDate()),
        };
        break;

      case 'month':
        periodDays = 30;
        periodLabel = 'Monthly';
        // Current: last 30 days
        currentRange = {
          startDate: new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000),
          endDate: now,
        };
        // Previous: 30 days before that
        previousRange = {
          startDate: new Date(now.getTime() - 60 * 24 * 60 * 60 * 1000),
          endDate: new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000),
        };
        break;

      case 'week':
      default:
        periodDays = 7;
        periodLabel = 'Weekly';
        // Current: last 7 days
        currentRange = {
          startDate: new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000),
          endDate: now,
        };
        // Previous: 7 days before that
        previousRange = {
          startDate: new Date(now.getTime() - 14 * 24 * 60 * 60 * 1000),
          endDate: new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000),
        };
        break;
    }

    return { currentRange, previousRange, periodDays, periodLabel };
  }

  /**
   * Get aggregated spend summary by platform
   */
  async getSpendSummary(dates) {
    try {
      const result = await this.pool.query(`
        SELECT
          platform,
          SUM(spend) as total_spend,
          SUM(impressions) as total_impressions,
          SUM(clicks) as total_clicks,
          SUM(conversions) as total_conversions,
          CASE WHEN SUM(clicks) > 0 THEN SUM(spend) / SUM(clicks) ELSE 0 END as avg_cpc,
          CASE WHEN SUM(impressions) > 0 THEN (SUM(clicks)::float / SUM(impressions)) * 100 ELSE 0 END as avg_ctr
        FROM ad_spend_data
        WHERE date >= $1 AND date <= $2
        GROUP BY platform
        ORDER BY total_spend DESC
      `, [dates.startDate, dates.endDate]);

      const platformData = result.rows;

      // Calculate totals
      const totals = {
        totalSpend: platformData.reduce((sum, p) => sum + parseFloat(p.total_spend || 0), 0),
        totalImpressions: platformData.reduce((sum, p) => sum + parseInt(p.total_impressions || 0), 0),
        totalClicks: platformData.reduce((sum, p) => sum + parseInt(p.total_clicks || 0), 0),
        totalConversions: platformData.reduce((sum, p) => sum + parseInt(p.total_conversions || 0), 0),
      };

      return {
        byPlatform: platformData,
        totals,
        dateRange: dates,
      };
    } catch (error) {
      logger.warn({ error: error.message }, 'Failed to get spend summary');
      return { byPlatform: [], totals: {}, dateRange: dates };
    }
  }

  /**
   * Get conversion funnel metrics from booking submissions
   */
  async getConversionMetrics(dates) {
    try {
      const result = await this.pool.query(`
        SELECT
          COUNT(*) as total_leads,
          COUNT(*) FILTER (WHERE status = 'registered' OR payment_status = 'paid') as registrations,
          COUNT(*) FILTER (WHERE is_trial = true) as trial_bookings,
          COUNT(*) FILTER (WHERE is_trial = false AND payment_status = 'paid') as paid_lessons,
          SUM(COALESCE(actual_price, 0)) FILTER (WHERE payment_status = 'paid') as total_revenue,
          SUM(COALESCE(realized_revenue, 0)) as realized_revenue
        FROM booking_submissions
        WHERE created_at >= $1 AND created_at <= $2
      `, [dates.startDate, dates.endDate]);

      const metrics = result.rows[0] || {};

      // Calculate derived metrics
      const totalLeads = parseInt(metrics.total_leads || 0);
      const registrations = parseInt(metrics.registrations || 0);
      const trials = parseInt(metrics.trial_bookings || 0);
      const paidLessons = parseInt(metrics.paid_lessons || 0);

      return {
        totalLeads,
        registrations,
        trialBookings: trials,
        paidLessons,
        totalRevenue: parseFloat(metrics.total_revenue || 0),
        realizedRevenue: parseFloat(metrics.realized_revenue || 0),
        conversionRate: totalLeads > 0 ? ((registrations / totalLeads) * 100).toFixed(1) : 0,
        trialToConversionRate: trials > 0 ? ((paidLessons / trials) * 100).toFixed(1) : 0,
      };
    } catch (error) {
      logger.warn({ error: error.message }, 'Failed to get conversion metrics');
      return {};
    }
  }

  /**
   * Get top performing campaigns
   */
  async getTopCampaigns(dates, limit = 5) {
    try {
      const result = await this.pool.query(`
        WITH campaign_performance AS (
          SELECT
            a.platform,
            a.campaign_id,
            a.campaign_name,
            SUM(a.spend) as spend,
            SUM(a.clicks) as clicks,
            SUM(a.conversions) as conversions,
            COUNT(DISTINCT bs.id) as leads,
            SUM(CASE WHEN bs.payment_status = 'paid' THEN 1 ELSE 0 END) as registrations,
            SUM(CASE WHEN bs.payment_status = 'paid' THEN COALESCE(bs.actual_price, 0) ELSE 0 END) as revenue
          FROM ad_spend_data a
          LEFT JOIN booking_submissions bs ON (
            REPLACE(LOWER(COALESCE(bs.utm_campaign, '')), ' ', '_') = REPLACE(LOWER(COALESCE(a.utm_campaign, '')), ' ', '_')
            AND bs.created_at >= $1 AND bs.created_at <= $2
          )
          WHERE a.date >= $1 AND a.date <= $2
          GROUP BY a.platform, a.campaign_id, a.campaign_name
        )
        SELECT
          *,
          CASE WHEN spend > 0 AND revenue > 0 THEN revenue / spend ELSE 0 END as roas,
          CASE WHEN leads > 0 THEN spend / leads ELSE 0 END as cpl,
          CASE WHEN registrations > 0 THEN spend / registrations ELSE 0 END as cpr
        FROM campaign_performance
        WHERE spend > 0
        ORDER BY CASE WHEN revenue > 0 THEN revenue / spend ELSE 0 END DESC
        LIMIT $3
      `, [dates.startDate, dates.endDate, limit]);

      return result.rows;
    } catch (error) {
      logger.warn({ error: error.message }, 'Failed to get top campaigns');
      return [];
    }
  }

  /**
   * Get bottom performing campaigns (for optimization suggestions)
   */
  async getBottomCampaigns(dates, limit = 3) {
    try {
      const result = await this.pool.query(`
        WITH campaign_performance AS (
          SELECT
            a.platform,
            a.campaign_id,
            a.campaign_name,
            SUM(a.spend) as spend,
            SUM(a.clicks) as clicks,
            COUNT(DISTINCT bs.id) as leads,
            SUM(CASE WHEN bs.payment_status = 'paid' THEN COALESCE(bs.actual_price, 0) ELSE 0 END) as revenue
          FROM ad_spend_data a
          LEFT JOIN booking_submissions bs ON (
            REPLACE(LOWER(COALESCE(bs.utm_campaign, '')), ' ', '_') = REPLACE(LOWER(COALESCE(a.utm_campaign, '')), ' ', '_')
            AND bs.created_at >= $1 AND bs.created_at <= $2
          )
          WHERE a.date >= $1 AND a.date <= $2
          GROUP BY a.platform, a.campaign_id, a.campaign_name
        )
        SELECT
          *,
          CASE WHEN spend > 0 AND revenue > 0 THEN revenue / spend ELSE 0 END as roas,
          CASE WHEN leads > 0 THEN spend / leads ELSE 0 END as cpl
        FROM campaign_performance
        WHERE spend >= 50
        ORDER BY CASE WHEN revenue > 0 THEN revenue / spend ELSE 0 END ASC
        LIMIT $3
      `, [dates.startDate, dates.endDate, limit]);

      return result.rows;
    } catch (error) {
      logger.warn({ error: error.message }, 'Failed to get bottom campaigns');
      return [];
    }
  }

  /**
   * Get cohort retention data
   */
  async getCohortRetention() {
    try {
      // Get retention by month of first booking
      const result = await this.pool.query(`
        WITH first_bookings AS (
          SELECT
            DISTINCT ON (client_email)
            client_email,
            DATE_TRUNC('month', created_at) as cohort_month,
            created_at as first_booking
          FROM booking_submissions
          WHERE payment_status = 'paid'
          ORDER BY client_email, created_at ASC
        ),
        repeat_bookings AS (
          SELECT
            fb.cohort_month,
            COUNT(DISTINCT fb.client_email) as cohort_size,
            COUNT(DISTINCT CASE
              WHEN bs.created_at > fb.first_booking
                AND bs.created_at < fb.first_booking + INTERVAL '90 days'
              THEN fb.client_email
            END) as retained_90_days
          FROM first_bookings fb
          LEFT JOIN booking_submissions bs ON fb.client_email = bs.client_email
            AND bs.payment_status = 'paid'
          WHERE fb.cohort_month >= DATE_TRUNC('month', NOW() - INTERVAL '6 months')
          GROUP BY fb.cohort_month
        )
        SELECT
          cohort_month,
          cohort_size,
          retained_90_days,
          CASE WHEN cohort_size > 0 THEN (retained_90_days::float / cohort_size * 100) ELSE 0 END as retention_rate
        FROM repeat_bookings
        ORDER BY cohort_month DESC
        LIMIT 6
      `);

      return result.rows;
    } catch (error) {
      logger.warn({ error: error.message }, 'Failed to get cohort retention');
      return [];
    }
  }

  /**
   * Get recent trends (week over week comparisons)
   */
  async getRecentTrends(dates) {
    try {
      const result = await this.pool.query(`
        WITH weekly_metrics AS (
          SELECT
            DATE_TRUNC('week', date) as week,
            SUM(spend) as spend,
            SUM(clicks) as clicks,
            SUM(conversions) as conversions
          FROM ad_spend_data
          WHERE date >= NOW() - INTERVAL '4 weeks'
          GROUP BY DATE_TRUNC('week', date)
          ORDER BY week DESC
          LIMIT 4
        )
        SELECT * FROM weekly_metrics
        ORDER BY week DESC
      `);

      return result.rows;
    } catch (error) {
      logger.warn({ error: error.message }, 'Failed to get recent trends');
      return [];
    }
  }

  /**
   * Get audience insights (lead types, markets)
   */
  async getAudienceInsights(dates) {
    try {
      // Lead type breakdown
      const leadTypeResult = await this.pool.query(`
        SELECT
          COALESCE(label_name, 'Unknown') as lead_type,
          COUNT(*) as count,
          SUM(CASE WHEN payment_status = 'paid' THEN 1 ELSE 0 END) as conversions
        FROM booking_submissions
        WHERE created_at >= $1 AND created_at <= $2
        GROUP BY label_name
        ORDER BY count DESC
        LIMIT 5
      `, [dates.startDate, dates.endDate]);

      // Market breakdown
      const marketResult = await this.pool.query(`
        SELECT
          COALESCE(market, 'Unknown') as market,
          COUNT(*) as count,
          SUM(CASE WHEN payment_status = 'paid' THEN COALESCE(actual_price, 0) ELSE 0 END) as revenue
        FROM booking_submissions
        WHERE created_at >= $1 AND created_at <= $2
        GROUP BY market
        ORDER BY count DESC
        LIMIT 5
      `, [dates.startDate, dates.endDate]);

      return {
        byLeadType: leadTypeResult.rows,
        byMarket: marketResult.rows,
      };
    } catch (error) {
      logger.warn({ error: error.message }, 'Failed to get audience insights');
      return { byLeadType: [], byMarket: [] };
    }
  }

  // ============================================
  // REALIZED REVENUE METHODS (for AI context)
  // ============================================

  /**
   * Get realized revenue summary by platform for AI context
   * This queries invoices linked to ad-acquired clients
   */
  async getRealizedRevenueSummary(dates) {
    try {
      // Meta realized revenue
      const metaResult = await this.pool.query(`
        WITH meta_clients AS (
          SELECT DISTINCT
            bs.tc_client_id,
            bs.created_at AS acquisition_date
          FROM booking_submissions bs
          WHERE bs.created_at >= $1 AND bs.created_at <= $2
            AND (
              (LOWER(COALESCE(bs.utm->>'utm_source', '')) = 'facebook'
               AND COALESCE(bs.utm->>'utm_campaign', '') != '')
              OR LOWER(COALESCE(bs.heard_about, '')) IN ('facebook', 'instagram')
            )
            AND bs.payment_status IN ('paid', 'verified')
            AND bs.tc_client_id IS NOT NULL
        )
        SELECT
          COUNT(DISTINCT mc.tc_client_id) AS client_count,
          COALESCE(SUM(CASE
            WHEN i.status = 'paid'
            AND (i.display_id IS NULL OR NOT i.display_id LIKE 'PFI-%')
            THEN i.gross ELSE 0
          END), 0) AS total_revenue
        FROM meta_clients mc
        LEFT JOIN invoices i ON CAST(mc.tc_client_id AS VARCHAR) = CAST(i.client_id AS VARCHAR)
          AND i.status = 'paid'
          AND i.date_sent >= mc.acquisition_date
      `, [dates.startDate, dates.endDate]);

      // Google realized revenue
      const googleResult = await this.pool.query(`
        WITH google_clients AS (
          SELECT DISTINCT
            bs.tc_client_id,
            bs.created_at AS acquisition_date
          FROM booking_submissions bs
          WHERE bs.created_at >= $1 AND bs.created_at <= $2
            AND (
              LOWER(COALESCE(bs.utm->>'utm_source', '')) = 'google'
              OR LOWER(COALESCE(bs.heard_about, '')) IN ('google', 'google ads', 'google search')
            )
            AND bs.payment_status IN ('paid', 'verified')
            AND bs.tc_client_id IS NOT NULL
        )
        SELECT
          COUNT(DISTINCT gc.tc_client_id) AS client_count,
          COALESCE(SUM(CASE
            WHEN i.status = 'paid'
            AND (i.display_id IS NULL OR NOT i.display_id LIKE 'PFI-%')
            THEN i.gross ELSE 0
          END), 0) AS total_revenue
        FROM google_clients gc
        LEFT JOIN invoices i ON CAST(gc.tc_client_id AS VARCHAR) = CAST(i.client_id AS VARCHAR)
          AND i.status = 'paid'
          AND i.date_sent >= gc.acquisition_date
      `, [dates.startDate, dates.endDate]);

      // Get ad spend for AROAS calculation
      const spendResult = await this.pool.query(`
        SELECT
          LOWER(platform) as platform,
          SUM(spend) as total_spend
        FROM ad_spend_data
        WHERE date >= $1 AND date <= $2
        GROUP BY LOWER(platform)
      `, [dates.startDate, dates.endDate]);

      const spendByPlatform = {};
      spendResult.rows.forEach(r => {
        spendByPlatform[r.platform] = parseFloat(r.total_spend || 0);
      });

      const metaRevenue = parseFloat(metaResult.rows[0]?.total_revenue || 0);
      const metaClients = parseInt(metaResult.rows[0]?.client_count || 0);
      const metaSpend = spendByPlatform['meta'] || 0;

      const googleRevenue = parseFloat(googleResult.rows[0]?.total_revenue || 0);
      const googleClients = parseInt(googleResult.rows[0]?.client_count || 0);
      const googleSpend = spendByPlatform['google'] || 0;

      return {
        meta: {
          clientCount: metaClients,
          realizedRevenue: metaRevenue,
          spend: metaSpend,
          aroas: metaSpend > 0 ? (metaRevenue / metaSpend).toFixed(2) : 'N/A',
        },
        google: {
          clientCount: googleClients,
          realizedRevenue: googleRevenue,
          spend: googleSpend,
          aroas: googleSpend > 0 ? (googleRevenue / googleSpend).toFixed(2) : 'N/A',
        },
        total: {
          clientCount: metaClients + googleClients,
          realizedRevenue: metaRevenue + googleRevenue,
          spend: metaSpend + googleSpend,
          aroas: (metaSpend + googleSpend) > 0
            ? ((metaRevenue + googleRevenue) / (metaSpend + googleSpend)).toFixed(2)
            : 'N/A',
        }
      };
    } catch (error) {
      logger.warn({ error: error.message }, 'Failed to get realized revenue summary');
      return { meta: {}, google: {}, total: {} };
    }
  }

  /**
   * Get monthly comparison for trend detection
   */
  async getMonthlyComparison() {
    try {
      const result = await this.pool.query(`
        WITH monthly_metrics AS (
          SELECT
            DATE_TRUNC('month', a.date) AS month,
            SUM(a.spend) AS spend,
            COUNT(DISTINCT bs.id) AS registrations,
            SUM(CASE WHEN bs.payment_status = 'paid' THEN COALESCE(bs.actual_price, 0) ELSE 0 END) AS trial_revenue
          FROM ad_spend_data a
          LEFT JOIN booking_submissions bs ON (
            LOWER(bs.utm->>'utm_source') IN ('facebook', 'google')
            AND DATE_TRUNC('month', bs.created_at) = DATE_TRUNC('month', a.date)
          )
          WHERE a.date >= NOW() - INTERVAL '3 months'
          GROUP BY DATE_TRUNC('month', a.date)
          ORDER BY month DESC
        )
        SELECT * FROM monthly_metrics LIMIT 3
      `);

      return result.rows.map(r => ({
        month: new Date(r.month).toLocaleDateString('en-US', { month: 'short', year: 'numeric' }),
        spend: parseFloat(r.spend || 0),
        registrations: parseInt(r.registrations || 0),
        trialRevenue: parseFloat(r.trial_revenue || 0),
      }));
    } catch (error) {
      logger.warn({ error: error.message }, 'Failed to get monthly comparison');
      return [];
    }
  }

  // ============================================
  // CONTEXT FORMATTING METHODS
  // ============================================

  formatOverviewSection(spend, conversions) {
    const total = spend.totals || {};
    return `## Marketing Performance Overview

### Spend Summary (Last 30 Days)
- **Total Spend**: $${(total.totalSpend || 0).toLocaleString(undefined, { minimumFractionDigits: 2 })}
- **Total Impressions**: ${(total.totalImpressions || 0).toLocaleString()}
- **Total Clicks**: ${(total.totalClicks || 0).toLocaleString()}
- **Platform Breakdown**:
${(spend.byPlatform || []).map(p =>
  `  - ${p.platform.toUpperCase()}: $${parseFloat(p.total_spend || 0).toLocaleString(undefined, { minimumFractionDigits: 2 })} (${parseFloat(p.avg_ctr || 0).toFixed(2)}% CTR, $${parseFloat(p.avg_cpc || 0).toFixed(2)} CPC)`
).join('\n')}

### Conversion Funnel
- **Total Leads**: ${conversions.totalLeads || 0}
- **Registrations**: ${conversions.registrations || 0} (${conversions.conversionRate}% conversion)
- **Trial Bookings**: ${conversions.trialBookings || 0}
- **Paid Lessons**: ${conversions.paidLessons || 0}
- **Total Revenue**: $${(conversions.totalRevenue || 0).toLocaleString(undefined, { minimumFractionDigits: 2 })}
- **Realized Revenue**: $${(conversions.realizedRevenue || 0).toLocaleString(undefined, { minimumFractionDigits: 2 })}

### Efficiency Metrics
- **Cost Per Lead (CPL)**: $${total.totalSpend && conversions.totalLeads ? (total.totalSpend / conversions.totalLeads).toFixed(2) : 'N/A'}
- **Cost Per Registration (CPR)**: $${total.totalSpend && conversions.registrations ? (total.totalSpend / conversions.registrations).toFixed(2) : 'N/A'}
- **ROAS**: ${total.totalSpend && conversions.totalRevenue ? (conversions.totalRevenue / total.totalSpend).toFixed(2) : 'N/A'}x`;
  }

  formatCampaignSection(top, bottom) {
    let section = `## Campaign Performance

### Top Performing Campaigns
${top.length === 0 ? '- No campaign data available' :
  top.map((c, i) =>
    `${i + 1}. **${c.campaign_name}** (${c.platform.toUpperCase()})
   - Spend: $${parseFloat(c.spend || 0).toFixed(2)} | Revenue: $${parseFloat(c.revenue || 0).toFixed(2)}
   - ROAS: ${parseFloat(c.roas || 0).toFixed(2)}x | CPL: $${parseFloat(c.cpl || 0).toFixed(2)} | Leads: ${c.leads || 0}`
  ).join('\n')}`;

    if (bottom.length > 0) {
      section += `\n\n### Underperforming Campaigns (Optimization Opportunities)
${bottom.map((c, i) =>
  `${i + 1}. **${c.campaign_name}** (${c.platform.toUpperCase()})
   - Spend: $${parseFloat(c.spend || 0).toFixed(2)} | Revenue: $${parseFloat(c.revenue || 0).toFixed(2)}
   - ROAS: ${parseFloat(c.roas || 0).toFixed(2)}x | CPL: $${parseFloat(c.cpl || 0).toFixed(2)}`
).join('\n')}`;
    }

    return section;
  }

  formatTrendsSection(trends) {
    if (!trends || trends.length < 2) {
      return `## Recent Trends\nInsufficient data for trend analysis.`;
    }

    const thisWeek = trends[0] || {};
    const lastWeek = trends[1] || {};

    const spendChange = lastWeek.spend > 0
      ? (((thisWeek.spend - lastWeek.spend) / lastWeek.spend) * 100).toFixed(1)
      : 'N/A';

    const clicksChange = lastWeek.clicks > 0
      ? (((thisWeek.clicks - lastWeek.clicks) / lastWeek.clicks) * 100).toFixed(1)
      : 'N/A';

    return `## Recent Trends (Week over Week)
- **Spend**: $${parseFloat(thisWeek.spend || 0).toFixed(2)} (${spendChange}% vs last week)
- **Clicks**: ${thisWeek.clicks || 0} (${clicksChange}% vs last week)
- **Conversions**: ${thisWeek.conversions || 0}`;
  }

  formatRetentionSection(retention) {
    if (!retention || retention.length === 0) {
      return `## Cohort Retention\nNo retention data available.`;
    }

    return `## Cohort Retention (90-Day)
${retention.map(r =>
  `- **${new Date(r.cohort_month).toLocaleDateString('en-US', { month: 'short', year: 'numeric' })}**: ${parseInt(r.cohort_size)} clients, ${parseFloat(r.retention_rate || 0).toFixed(1)}% retained`
).join('\n')}`;
  }

  formatAudienceSection(audience) {
    let section = `## Audience Insights

### By Lead Type
${(audience.byLeadType || []).map(l =>
  `- **${l.lead_type}**: ${l.count} leads, ${l.conversions} conversions`
).join('\n') || '- No data available'}

### By Market
${(audience.byMarket || []).map(m =>
  `- **${m.market}**: ${m.count} leads, $${parseFloat(m.revenue || 0).toFixed(2)} revenue`
).join('\n') || '- No data available'}`;

    return section;
  }

  formatRealizedRevenueSection(realizedRevenue) {
    if (!realizedRevenue || !realizedRevenue.total) {
      return `## Realized Revenue & AROAS\nNo realized revenue data available.`;
    }

    const { meta, google, total } = realizedRevenue;

    return `## Realized Revenue & AROAS (Actual Return on Ad Spend)

**Important Distinction:**
- **Trial Revenue**: Initial booking payment (often discounted $15 trial)
- **Realized Revenue**: Total invoiced revenue from ad-acquired clients over time
- **AROAS**: Realized Revenue ÷ Ad Spend (the true measure of ad ROI)

### By Platform
- **Meta (Facebook/Instagram)**:
  - Clients Acquired: ${meta.clientCount || 0}
  - Realized Revenue: $${(meta.realizedRevenue || 0).toLocaleString(undefined, { minimumFractionDigits: 2 })}
  - Ad Spend: $${(meta.spend || 0).toLocaleString(undefined, { minimumFractionDigits: 2 })}
  - AROAS: ${meta.aroas || 'N/A'}x

- **Google Ads**:
  - Clients Acquired: ${google.clientCount || 0}
  - Realized Revenue: $${(google.realizedRevenue || 0).toLocaleString(undefined, { minimumFractionDigits: 2 })}
  - Ad Spend: $${(google.spend || 0).toLocaleString(undefined, { minimumFractionDigits: 2 })}
  - AROAS: ${google.aroas || 'N/A'}x

### Combined Total
- **Total Clients Acquired**: ${total.clientCount || 0}
- **Total Realized Revenue**: $${(total.realizedRevenue || 0).toLocaleString(undefined, { minimumFractionDigits: 2 })}
- **Total Ad Spend**: $${(total.spend || 0).toLocaleString(undefined, { minimumFractionDigits: 2 })}
- **Overall AROAS**: ${total.aroas || 'N/A'}x`;
  }

  formatMonthlyComparisonSection(monthlyData) {
    if (!monthlyData || monthlyData.length === 0) {
      return `## Monthly Comparison\nNo monthly comparison data available.`;
    }

    return `## Monthly Performance Comparison
${monthlyData.map(m =>
  `- **${m.month}**: $${m.spend.toLocaleString(undefined, { minimumFractionDigits: 2 })} spend, ${m.registrations} registrations, $${m.trialRevenue.toLocaleString(undefined, { minimumFractionDigits: 2 })} trial revenue`
).join('\n')}`;
  }

  formatBudgetStatus() {
    return `## Current Budget Status
**Note**: Marketing budget is currently paused. AI recommendations focus on:
1. Restart strategies when budget returns
2. Campaign optimization for future activation
3. Organic growth opportunities
4. Retention improvements`;
  }

  // ============================================
  // CACHING METHODS
  // ============================================

  /**
   * Get cached insight or compute and cache it
   * @param {string} insightType - Type of insight (e.g., 'spend_summary', 'conversion_metrics')
   * @param {string} insightKey - Unique key for this specific insight
   * @param {Function} computeFn - Function to compute the insight if not cached
   * @param {number} ttlMinutes - Cache TTL in minutes (default 15)
   */
  async getCachedInsight(insightType, insightKey, computeFn, ttlMinutes = 15) {
    try {
      // Try to get from cache
      const cacheResult = await this.pool.query(`
        SELECT data, expires_at
        FROM marketing_insights_cache
        WHERE insight_type = $1 AND insight_key = $2 AND expires_at > NOW()
        LIMIT 1
      `, [insightType, insightKey]);

      if (cacheResult.rows.length > 0) {
        return cacheResult.rows[0].data;
      }

      // Cache miss - compute the insight
      const data = await computeFn();

      // Store in cache
      await this.pool.query(`
        INSERT INTO marketing_insights_cache (insight_type, insight_key, data, expires_at)
        VALUES ($1, $2, $3, NOW() + INTERVAL '${ttlMinutes} minutes')
        ON CONFLICT (insight_type, insight_key)
        DO UPDATE SET data = $3, expires_at = NOW() + INTERVAL '${ttlMinutes} minutes'
      `, [insightType, insightKey, JSON.stringify(data)]);

      return data;
    } catch (error) {
      // On cache error, just compute and return
      logger.warn({ error: error.message }, 'Cache error, computing directly');
      return await computeFn();
    }
  }

  /**
   * Invalidate cached insights
   */
  async invalidateCache(insightType = null) {
    try {
      if (insightType) {
        await this.pool.query(
          `DELETE FROM marketing_insights_cache WHERE insight_type = $1`,
          [insightType]
        );
      } else {
        await this.pool.query(`DELETE FROM marketing_insights_cache WHERE expires_at < NOW()`);
      }
    } catch (error) {
      logger.warn({ error: error.message }, 'Failed to invalidate cache');
    }
  }

  // ============================================
  // BUDGET SCENARIO MODELING
  // ============================================

  /**
   * Calculate historical performance metrics for scenario modeling
   */
  async getHistoricalBenchmarks() {
    return this.getCachedInsight('benchmarks', 'historical', async () => {
      try {
        // Get average performance over the last 90 days
        const result = await this.pool.query(`
          WITH daily_metrics AS (
            SELECT
              a.date,
              a.platform,
              SUM(a.spend) as spend,
              SUM(a.clicks) as clicks,
              SUM(a.impressions) as impressions,
              COUNT(DISTINCT bs.id) as leads,
              COUNT(DISTINCT CASE WHEN bs.payment_status = 'paid' THEN bs.id END) as registrations,
              SUM(CASE WHEN bs.payment_status = 'paid' THEN COALESCE(bs.actual_price, 0) ELSE 0 END) as revenue
            FROM ad_spend_data a
            LEFT JOIN booking_submissions bs ON (
              REPLACE(LOWER(COALESCE(bs.utm_campaign, '')), ' ', '_') = REPLACE(LOWER(COALESCE(a.utm_campaign, '')), ' ', '_')
              AND DATE(bs.created_at) = a.date
            )
            WHERE a.date >= NOW() - INTERVAL '90 days'
            GROUP BY a.date, a.platform
          )
          SELECT
            platform,
            AVG(spend) as avg_daily_spend,
            AVG(clicks) as avg_daily_clicks,
            AVG(leads) as avg_daily_leads,
            AVG(registrations) as avg_daily_registrations,
            AVG(revenue) as avg_daily_revenue,
            CASE WHEN SUM(spend) > 0 THEN SUM(leads)::float / SUM(spend) ELSE 0 END as leads_per_dollar,
            CASE WHEN SUM(spend) > 0 THEN SUM(registrations)::float / SUM(spend) ELSE 0 END as registrations_per_dollar,
            CASE WHEN SUM(spend) > 0 THEN SUM(revenue) / SUM(spend) ELSE 0 END as roas,
            CASE WHEN SUM(leads) > 0 THEN SUM(spend) / SUM(leads) ELSE 0 END as avg_cpl,
            CASE WHEN SUM(registrations) > 0 THEN SUM(spend) / SUM(registrations) ELSE 0 END as avg_cpr
          FROM daily_metrics
          GROUP BY platform
        `);

        // Also get overall metrics
        const overallResult = await this.pool.query(`
          WITH daily_totals AS (
            SELECT
              a.date,
              SUM(a.spend) as spend,
              COUNT(DISTINCT bs.id) as leads,
              COUNT(DISTINCT CASE WHEN bs.payment_status = 'paid' THEN bs.id END) as registrations,
              SUM(CASE WHEN bs.payment_status = 'paid' THEN COALESCE(bs.actual_price, 0) ELSE 0 END) as revenue
            FROM ad_spend_data a
            LEFT JOIN booking_submissions bs ON (
              REPLACE(LOWER(COALESCE(bs.utm_campaign, '')), ' ', '_') = REPLACE(LOWER(COALESCE(a.utm_campaign, '')), ' ', '_')
              AND DATE(bs.created_at) = a.date
            )
            WHERE a.date >= NOW() - INTERVAL '90 days'
            GROUP BY a.date
          )
          SELECT
            CASE WHEN SUM(spend) > 0 THEN SUM(leads)::float / SUM(spend) ELSE 0 END as leads_per_dollar,
            CASE WHEN SUM(spend) > 0 THEN SUM(registrations)::float / SUM(spend) ELSE 0 END as registrations_per_dollar,
            CASE WHEN SUM(spend) > 0 THEN SUM(revenue) / SUM(spend) ELSE 0 END as avg_roas,
            CASE WHEN SUM(leads) > 0 THEN SUM(spend) / SUM(leads) ELSE 0 END as avg_cpl,
            CASE WHEN SUM(registrations) > 0 THEN SUM(spend) / SUM(registrations) ELSE 0 END as avg_cpr,
            AVG(revenue / NULLIF(spend, 0)) as median_roas
          FROM daily_totals
          WHERE spend > 0
        `);

        return {
          byPlatform: result.rows,
          overall: overallResult.rows[0] || {},
        };
      } catch (error) {
        logger.warn({ error: error.message }, 'Failed to get historical benchmarks');
        return { byPlatform: [], overall: {} };
      }
    }, 60); // Cache for 1 hour
  }

  /**
   * Model budget scenario - predict outcomes for a given spend
   * @param {number} weeklyBudget - Proposed weekly budget
   * @param {string} platform - Platform to allocate (meta, google, or 'split')
   */
  async modelBudgetScenario(weeklyBudget, platform = 'split') {
    const benchmarks = await this.getHistoricalBenchmarks();

    if (!benchmarks.overall || Object.keys(benchmarks.overall).length === 0) {
      return {
        success: false,
        error: 'Insufficient historical data for scenario modeling',
      };
    }

    const overall = benchmarks.overall;
    const dailyBudget = weeklyBudget / 7;
    const monthlyBudget = weeklyBudget * 4.33;

    // Calculate projections based on historical performance
    const projections = {
      weekly: {
        budget: weeklyBudget,
        expectedLeads: Math.round(weeklyBudget * parseFloat(overall.leads_per_dollar || 0)),
        expectedRegistrations: Math.round(weeklyBudget * parseFloat(overall.registrations_per_dollar || 0)),
        expectedRevenue: weeklyBudget * parseFloat(overall.avg_roas || 0),
        expectedCPL: parseFloat(overall.avg_cpl || 0),
        expectedCPR: parseFloat(overall.avg_cpr || 0),
        expectedROAS: parseFloat(overall.avg_roas || 0),
      },
      monthly: {
        budget: monthlyBudget,
        expectedLeads: Math.round(monthlyBudget * parseFloat(overall.leads_per_dollar || 0)),
        expectedRegistrations: Math.round(monthlyBudget * parseFloat(overall.registrations_per_dollar || 0)),
        expectedRevenue: monthlyBudget * parseFloat(overall.avg_roas || 0),
      },
    };

    // Add confidence ranges (±20% based on historical variance)
    projections.weekly.leadRange = {
      low: Math.round(projections.weekly.expectedLeads * 0.8),
      high: Math.round(projections.weekly.expectedLeads * 1.2),
    };
    projections.weekly.revenueRange = {
      low: projections.weekly.expectedRevenue * 0.8,
      high: projections.weekly.expectedRevenue * 1.2,
    };

    // Platform-specific projections if requested
    if (platform !== 'split' && benchmarks.byPlatform) {
      const platformData = benchmarks.byPlatform.find(
        p => p.platform.toLowerCase() === platform.toLowerCase()
      );
      if (platformData) {
        projections.platformSpecific = {
          platform,
          expectedLeads: Math.round(weeklyBudget * parseFloat(platformData.leads_per_dollar || 0)),
          expectedRegistrations: Math.round(weeklyBudget * parseFloat(platformData.registrations_per_dollar || 0)),
          expectedROAS: parseFloat(platformData.roas || 0),
          avgCPL: parseFloat(platformData.avg_cpl || 0),
        };
      }
    }

    return {
      success: true,
      scenario: {
        weeklyBudget,
        dailyBudget,
        monthlyBudget,
        platform,
      },
      projections,
      benchmarks: {
        historical_cpl: parseFloat(overall.avg_cpl || 0).toFixed(2),
        historical_cpr: parseFloat(overall.avg_cpr || 0).toFixed(2),
        historical_roas: parseFloat(overall.avg_roas || 0).toFixed(2),
      },
      disclaimer: 'Projections based on 90-day historical performance. Actual results may vary.',
    };
  }

  /**
   * Get optimal budget recommendation based on target metrics
   * @param {Object} targets - Target metrics (e.g., { leadsPerWeek: 50 })
   */
  async getOptimalBudgetRecommendation(targets) {
    const benchmarks = await this.getHistoricalBenchmarks();

    if (!benchmarks.overall) {
      return { success: false, error: 'Insufficient data for recommendations' };
    }

    const overall = benchmarks.overall;
    const recommendations = [];

    if (targets.leadsPerWeek) {
      const requiredBudget = targets.leadsPerWeek / parseFloat(overall.leads_per_dollar || 0.01);
      recommendations.push({
        target: `${targets.leadsPerWeek} leads per week`,
        requiredWeeklyBudget: Math.round(requiredBudget),
        requiredMonthlyBudget: Math.round(requiredBudget * 4.33),
        basedOnCPL: parseFloat(overall.avg_cpl || 0).toFixed(2),
      });
    }

    if (targets.registrationsPerWeek) {
      const requiredBudget = targets.registrationsPerWeek / parseFloat(overall.registrations_per_dollar || 0.001);
      recommendations.push({
        target: `${targets.registrationsPerWeek} registrations per week`,
        requiredWeeklyBudget: Math.round(requiredBudget),
        requiredMonthlyBudget: Math.round(requiredBudget * 4.33),
        basedOnCPR: parseFloat(overall.avg_cpr || 0).toFixed(2),
      });
    }

    if (targets.revenuePerWeek) {
      const requiredBudget = targets.revenuePerWeek / parseFloat(overall.avg_roas || 1);
      recommendations.push({
        target: `$${targets.revenuePerWeek} revenue per week`,
        requiredWeeklyBudget: Math.round(requiredBudget),
        requiredMonthlyBudget: Math.round(requiredBudget * 4.33),
        basedOnROAS: parseFloat(overall.avg_roas || 0).toFixed(2),
      });
    }

    return {
      success: true,
      recommendations,
      benchmarks: overall,
    };
  }

  /**
   * Format budget scenario for AI context
   */
  formatBudgetScenarioContext(scenario) {
    if (!scenario.success) {
      return `## Budget Scenario\n${scenario.error}`;
    }

    const p = scenario.projections.weekly;
    return `## Budget Scenario Analysis

**Proposed Budget**: $${scenario.scenario.weeklyBudget}/week ($${scenario.scenario.monthlyBudget.toFixed(0)}/month)

### Expected Weekly Outcomes
- **Leads**: ${p.expectedLeads} (range: ${p.leadRange.low}-${p.leadRange.high})
- **Registrations**: ${p.expectedRegistrations}
- **Revenue**: $${p.expectedRevenue.toFixed(2)} (range: $${p.revenueRange.low.toFixed(2)}-$${p.revenueRange.high.toFixed(2)})
- **Expected ROAS**: ${p.expectedROAS.toFixed(2)}x
- **Expected CPL**: $${p.expectedCPL.toFixed(2)}

### Historical Benchmarks Used
- CPL: $${scenario.benchmarks.historical_cpl}
- CPR: $${scenario.benchmarks.historical_cpr}
- ROAS: ${scenario.benchmarks.historical_roas}x

*${scenario.disclaimer}*`;
  }

  /**
   * Get quick insights summary for Command Center dashboard
   * Uses 7-day range for "Weekly" metrics shown in UI
   * Includes platform breakdown for drilldowns
   * @param {string} period - 'day', 'week', or 'month'
   */
  async getInsightsSummary(period = 'week') {
    try {
      // Calculate date ranges based on period
      const { currentRange, previousRange, periodDays, periodLabel } = this.getPeriodRanges(period);
      const thisWeek = currentRange;
      const lastWeekStart = previousRange.startDate;
      const lastWeekEnd = previousRange.endDate;

      // Fetch this week and last week data in parallel
      const [spendThisWeek, spendLastWeek, conversionsThisWeek, conversionsLastWeek, realizedRevenue] = await Promise.all([
        this.getSpendSummary(thisWeek),
        this.getSpendSummary({ startDate: lastWeekStart, endDate: lastWeekEnd }),
        this.getConversionMetricsWithAttribution(thisWeek),
        this.getConversionMetricsWithAttribution({ startDate: lastWeekStart, endDate: lastWeekEnd }),
        this.getRealizedRevenueSummary(thisWeek),
      ]);

      const totalSpend = spendThisWeek.totals?.totalSpend || 0;
      const lastWeekSpend = spendLastWeek.totals?.totalSpend || 0;
      const totalLeads = conversionsThisWeek.totalLeads || 0;
      const lastWeekLeads = conversionsLastWeek.totalLeads || 0;
      const trialRevenue = conversionsThisWeek.totalRevenue || 0;
      const totalRealizedRevenue = realizedRevenue.total?.realizedRevenue || 0;

      // Calculate changes
      const spendChange = lastWeekSpend > 0 ? ((totalSpend - lastWeekSpend) / lastWeekSpend * 100) : 0;
      const leadsChange = lastWeekLeads > 0 ? ((totalLeads - lastWeekLeads) / lastWeekLeads * 100) : 0;

      // Calculate CPL and ROAS as numbers (not strings)
      const avgCpl = totalLeads > 0 ? totalSpend / totalLeads : 0;
      const lastWeekCpl = lastWeekLeads > 0 ? lastWeekSpend / lastWeekLeads : 0;
      const cplChange = lastWeekCpl > 0 ? ((avgCpl - lastWeekCpl) / lastWeekCpl * 100) : 0;

      const avgRoas = totalSpend > 0 ? totalRealizedRevenue / totalSpend : 0;

      // Build platform breakdown for drilldowns
      const platformBreakdown = (spendThisWeek.byPlatform || []).map(p => {
        const platformConversions = conversionsThisWeek.byPlatform?.find(
          c => c.platform?.toLowerCase() === p.platform?.toLowerCase()
        ) || {};
        const platformRevenue = realizedRevenue[p.platform?.toLowerCase()] || {};

        const spend = parseFloat(p.total_spend || 0);
        const leads = parseInt(platformConversions.leads || 0);
        const revenue = parseFloat(platformRevenue.realizedRevenue || 0);

        return {
          platform: p.platform,
          spend,
          leads,
          revenue,
          clicks: parseInt(p.total_clicks || 0),
          impressions: parseInt(p.total_impressions || 0),
          cpl: leads > 0 ? spend / leads : 0,
          roas: spend > 0 ? revenue / spend : 0,
          ctr: parseFloat(p.avg_ctr || 0),
        };
      });

      return {
        // Period info for UI labels
        period,
        periodLabel,
        periodDays,

        // Primary KPIs (numbers, not strings) - field names match frontend expectations
        totalSpend,
        totalLeads,
        avgCpl,
        avgRoas,
        totalRevenue: trialRevenue,
        realizedRevenue: totalRealizedRevenue,
        conversionRate: parseFloat(conversionsThisWeek.conversionRate || 0),

        // Period-over-period changes for trend indicators
        lastPeriodSpend: lastWeekSpend,
        spendChange,
        leadsChange,
        cplChange,
        roasChange: 0, // TODO: Calculate when we have last period ROAS

        // Platform breakdown for drilldowns
        platformBreakdown,

        // Legacy fields for backwards compatibility
        revenue: trialRevenue.toFixed(2),
        roas: totalSpend > 0 ? (trialRevenue / totalSpend).toFixed(2) : '0',
        cpl: totalLeads > 0 ? (totalSpend / totalLeads).toFixed(2) : '0',
        aroas: totalSpend > 0 ? (totalRealizedRevenue / totalSpend).toFixed(2) : '0',
        metaRealizedRevenue: realizedRevenue.meta?.realizedRevenue?.toFixed(2) || '0',
        metaAroas: realizedRevenue.meta?.aroas || '0',
        googleRealizedRevenue: realizedRevenue.google?.realizedRevenue?.toFixed(2) || '0',
        googleAroas: realizedRevenue.google?.aroas || '0',
      };
    } catch (error) {
      logger.error({ error: error.message }, 'Failed to get insights summary');
      return null;
    }
  }

  /**
   * Get conversion metrics with platform attribution
   * Only counts leads that came from tracked marketing sources
   */
  async getConversionMetricsWithAttribution(dates) {
    try {
      // First get overall metrics (for backwards compatibility)
      const overallResult = await this.pool.query(`
        SELECT
          COUNT(*) as total_leads,
          COUNT(*) FILTER (WHERE status = 'registered' OR payment_status = 'paid') as registrations,
          COUNT(*) FILTER (WHERE is_trial = true) as trial_bookings,
          COUNT(*) FILTER (WHERE is_trial = false AND payment_status = 'paid') as paid_lessons,
          SUM(COALESCE(actual_price, 0)) FILTER (WHERE payment_status = 'paid') as total_revenue,
          SUM(COALESCE(realized_revenue, 0)) as realized_revenue
        FROM booking_submissions
        WHERE created_at >= $1 AND created_at <= $2
      `, [dates.startDate, dates.endDate]);

      // Get platform-attributed leads (from UTM tracking)
      const platformResult = await this.pool.query(`
        SELECT
          CASE
            WHEN LOWER(COALESCE(utm->>'utm_source', '')) IN ('facebook', 'fb', 'instagram', 'ig', 'meta') THEN 'meta'
            WHEN LOWER(COALESCE(utm->>'utm_source', '')) IN ('google', 'gclid', 'adwords') THEN 'google'
            WHEN LOWER(COALESCE(utm->>'utm_source', '')) IN ('klaviyo', 'email') THEN 'klaviyo'
            ELSE 'other'
          END as platform,
          COUNT(*) as leads,
          SUM(COALESCE(actual_price, 0)) FILTER (WHERE payment_status = 'paid') as revenue
        FROM booking_submissions
        WHERE created_at >= $1 AND created_at <= $2
        GROUP BY 1
        ORDER BY leads DESC
      `, [dates.startDate, dates.endDate]);

      const metrics = overallResult.rows[0] || {};
      const totalLeads = parseInt(metrics.total_leads || 0);
      const registrations = parseInt(metrics.registrations || 0);
      const trials = parseInt(metrics.trial_bookings || 0);
      const paidLessons = parseInt(metrics.paid_lessons || 0);

      return {
        totalLeads,
        registrations,
        trialBookings: trials,
        paidLessons,
        totalRevenue: parseFloat(metrics.total_revenue || 0),
        realizedRevenue: parseFloat(metrics.realized_revenue || 0),
        conversionRate: totalLeads > 0 ? ((registrations / totalLeads) * 100).toFixed(1) : '0',
        trialToConversionRate: trials > 0 ? ((paidLessons / trials) * 100).toFixed(1) : '0',
        byPlatform: platformResult.rows,
      };
    } catch (error) {
      logger.warn({ error: error.message }, 'Failed to get conversion metrics with attribution');
      return { totalLeads: 0, byPlatform: [] };
    }
  }

  /**
   * Get individual lead records for verification
   * Returns names, dates, sources, and links to TutorCruncher
   * @param {string} period - 'day', 'week', or 'month'
   * @param {Object} options - { platform, limit }
   */
  async getLeadsList(period = 'week', options = {}) {
    try {
      const { platform, limit = 100 } = options;
      const { currentRange } = this.getPeriodRanges(period);

      let query = `
        SELECT
          bs.id,
          bs.parent_first,
          bs.parent_last,
          bs.parent_email,
          bs.client_id,
          bs.created_at,
          bs.status,
          bs.payment_status,
          bs.actual_price,
          bs.is_trial,
          bs.label_name,
          CASE
            WHEN LOWER(COALESCE(bs.utm->>'utm_source', '')) IN ('facebook', 'fb', 'instagram', 'ig', 'meta') THEN 'meta'
            WHEN LOWER(COALESCE(bs.utm->>'utm_source', '')) IN ('google', 'gclid', 'adwords') THEN 'google'
            WHEN LOWER(COALESCE(bs.utm->>'utm_source', '')) IN ('klaviyo', 'email') THEN 'klaviyo'
            ELSE 'other'
          END as platform,
          bs.utm->>'utm_source' as utm_source,
          bs.utm->>'utm_campaign' as utm_campaign,
          bs.utm->>'utm_medium' as utm_medium
        FROM booking_submissions bs
        WHERE bs.created_at >= $1 AND bs.created_at <= $2
      `;
      const params = [currentRange.startDate, currentRange.endDate];

      if (platform && platform !== 'all') {
        query += `
          AND (
            CASE
              WHEN LOWER(COALESCE(bs.utm->>'utm_source', '')) IN ('facebook', 'fb', 'instagram', 'ig', 'meta') THEN 'meta'
              WHEN LOWER(COALESCE(bs.utm->>'utm_source', '')) IN ('google', 'gclid', 'adwords') THEN 'google'
              WHEN LOWER(COALESCE(bs.utm->>'utm_source', '')) IN ('klaviyo', 'email') THEN 'klaviyo'
              ELSE 'other'
            END
          ) = $3
        `;
        params.push(platform.toLowerCase());
      }

      query += ` ORDER BY bs.created_at DESC LIMIT $${params.length + 1}`;
      params.push(limit);

      const result = await this.pool.query(query, params);

      // Format lead records with TutorCruncher links
      const leads = result.rows.map(row => ({
        id: row.id,
        name: [row.parent_first, row.parent_last].filter(Boolean).join(' ') || 'Unknown',
        email: row.parent_email,
        clientId: row.client_id,
        createdAt: row.created_at,
        status: row.status,
        paymentStatus: row.payment_status,
        amount: parseFloat(row.actual_price || 0),
        isTrial: row.is_trial,
        label: row.label_name,
        platform: row.platform,
        utmSource: row.utm_source,
        utmCampaign: row.utm_campaign,
        utmMedium: row.utm_medium,
        // TutorCruncher client link (if client_id exists)
        tutorCruncherUrl: row.client_id
          ? `https://account.acmeops.com/clients/${row.client_id}/`
          : null,
      }));

      // Summary stats
      const summary = {
        total: leads.length,
        byPlatform: {},
        byStatus: {},
        paidCount: leads.filter(l => l.paymentStatus === 'paid').length,
        trialCount: leads.filter(l => l.isTrial).length,
      };

      leads.forEach(lead => {
        summary.byPlatform[lead.platform] = (summary.byPlatform[lead.platform] || 0) + 1;
        summary.byStatus[lead.status || 'unknown'] = (summary.byStatus[lead.status || 'unknown'] || 0) + 1;
      });

      return {
        leads,
        summary,
        period,
        dateRange: currentRange,
      };
    } catch (error) {
      logger.error({ error: error.message }, 'Failed to get leads list');
      return { leads: [], summary: { total: 0 }, error: error.message };
    }
  }

  // ============================================
  // LIVE AD PLATFORM DATA (Real-time API calls)
  // ============================================

  /**
   * Fetch live Google Ads campaign data from the API
   * @returns {Promise<Object>} Campaign data with structure and performance
   */
  async getLiveGoogleCampaigns() {
    if (!this.googleAdsService || !this.googleAdsService.enabled) {
      return { success: false, error: 'Google Ads API not configured' };
    }

    try {
      const campaigns = await this.googleAdsService.getCampaignsList();

      // Sort by spend (highest first)
      const sortedCampaigns = campaigns.sort((a, b) => {
        const spendA = a.metrics?.spend || 0;
        const spendB = b.metrics?.spend || 0;
        return spendB - spendA;
      });

      // Separate by status (Google Ads API returns numeric codes: 2=ENABLED, 3=PAUSED, 4=REMOVED)
      const enabled = sortedCampaigns.filter(c => c.status === 2 || c.status === 'ENABLED');
      const paused = sortedCampaigns.filter(c => c.status === 3 || c.status === 'PAUSED');

      // Calculate totals
      const totalSpend = sortedCampaigns.reduce((sum, c) => sum + (c.metrics?.spend || 0), 0);
      const totalClicks = sortedCampaigns.reduce((sum, c) => sum + (c.metrics?.clicks || 0), 0);
      const totalConversions = sortedCampaigns.reduce((sum, c) => sum + (c.metrics?.conversions || 0), 0);

      return {
        success: true,
        campaigns: sortedCampaigns,
        enabled,
        paused,
        summary: {
          totalCampaigns: sortedCampaigns.length,
          enabledCount: enabled.length,
          pausedCount: paused.length,
          totalSpend,
          totalClicks,
          totalConversions,
          avgCPC: totalClicks > 0 ? totalSpend / totalClicks : 0,
        },
        fetchedAt: new Date().toISOString(),
      };
    } catch (error) {
      logger.error({ error: error.message }, 'Failed to fetch live Google campaigns');
      return { success: false, error: error.message };
    }
  }

  /**
   * Fetch live Meta Ads campaign data from the API
   * @returns {Promise<Object>} Campaign data with structure and performance
   */
  async getLiveMetaCampaigns() {
    if (!this.metaAdsService || !this.metaAdsService.enabled) {
      return { success: false, error: 'Meta Ads API not configured' };
    }

    try {
      const campaigns = await this.metaAdsService.getCampaignsList({ includeMetrics: true });

      // Separate by status
      const active = campaigns.filter(c => c.status === 'ACTIVE');
      const paused = campaigns.filter(c => c.status === 'PAUSED');

      // Calculate totals
      const totalSpend = campaigns.reduce((sum, c) => sum + (c.metrics?.spend || 0), 0);

      return {
        success: true,
        campaigns,
        active,
        paused,
        summary: {
          totalCampaigns: campaigns.length,
          activeCount: active.length,
          pausedCount: paused.length,
          totalSpend,
        },
        fetchedAt: new Date().toISOString(),
      };
    } catch (error) {
      logger.error({ error: error.message }, 'Failed to fetch live Meta campaigns');
      return { success: false, error: error.message };
    }
  }

  /**
   * Format live Google Ads campaigns for AI context
   * @param {Object} data - Campaign data from getLiveGoogleCampaigns
   * @returns {string} Formatted markdown context
   */
  formatLiveGoogleCampaignsContext(data) {
    if (!data.success) {
      return `## Live Google Ads Data\n⚠️ Unable to fetch live data: ${data.error}`;
    }

    const { summary, enabled, paused } = data;

    let context = `## Live Google Ads Account Data
*Fetched in real-time from Google Ads API*

### Account Summary
- **Total Campaigns**: ${summary.totalCampaigns} (${summary.enabledCount} enabled, ${summary.pausedCount} paused)
- **30-Day Spend**: $${summary.totalSpend.toLocaleString(undefined, { minimumFractionDigits: 2 })}
- **30-Day Clicks**: ${summary.totalClicks.toLocaleString()}
- **30-Day Conversions**: ${summary.totalConversions}
- **Average CPC**: $${summary.avgCPC.toFixed(2)}

### Active Campaigns (${enabled.length})
`;

    if (enabled.length === 0) {
      context += `*No active campaigns*\n`;
    } else {
      enabled.forEach((c, i) => {
        const m = c.metrics || {};
        context += `${i + 1}. **${c.name}** (ID: ${c.id})
   - Type: ${c.advertisingChannelType || 'Unknown'}
   - Daily Budget: ${c.budget ? '$' + c.budget.toFixed(2) : 'Not set'}
   - 30-Day: $${(m.spend || 0).toFixed(2)} spend, ${m.clicks || 0} clicks, ${m.conversions || 0} conversions
   - CTR: ${(m.ctr || 0).toFixed(2)}% | CPC: $${(m.cpc || 0).toFixed(2)}
`;
      });
    }

    if (paused.length > 0) {
      context += `\n### Paused Campaigns (${paused.length})
`;
      paused.slice(0, 5).forEach((c, i) => {
        context += `${i + 1}. **${c.name}** (ID: ${c.id}) - ${c.advertisingChannelType || 'Unknown'}
`;
      });
      if (paused.length > 5) {
        context += `   ... and ${paused.length - 5} more paused campaigns\n`;
      }
    }

    context += `
### Campaign IDs for Actions
Use these exact IDs when recommending campaign actions:
${enabled.slice(0, 10).map(c => `- ${c.name}: \`${c.id}\``).join('\n')}`;

    return context;
  }

  /**
   * Format live Meta Ads campaigns for AI context
   * @param {Object} data - Campaign data from getLiveMetaCampaigns
   * @returns {string} Formatted markdown context
   */
  formatLiveMetaCampaignsContext(data) {
    if (!data.success) {
      return `## Live Meta Ads Data\n⚠️ Unable to fetch live data: ${data.error}`;
    }

    const { campaigns, active, paused, summary } = data;

    if (!campaigns || campaigns.length === 0) {
      return `## Live Meta Ads Data\n*No campaigns found in Meta Ads account*`;
    }

    let context = `## Live Meta Ads Account Data
*Fetched in real-time from Meta Ads API*

### Account Summary
- **Total Campaigns**: ${summary.totalCampaigns} (${summary.activeCount} active, ${summary.pausedCount} paused)
- **Total Spend (recent)**: $${(summary.totalSpend || 0).toLocaleString(undefined, { minimumFractionDigits: 2 })}

### Active Campaigns (${active.length})
`;

    if (active.length === 0) {
      context += `*No active campaigns*\n`;
    } else {
      active.forEach((c, i) => {
        const m = c.metrics || {};
        context += `${i + 1}. **${c.name}** (ID: ${c.id})
   - Objective: ${c.objective || 'Unknown'}
   - Daily Budget: ${c.dailyBudget ? '$' + c.dailyBudget.toFixed(2) : 'Not set'}
   - Metrics: ${m.spend ? '$' + m.spend.toFixed(2) + ' spend' : 'No recent data'}${m.clicks ? ', ' + m.clicks + ' clicks' : ''}${m.conversions ? ', ' + m.conversions + ' conversions' : ''}
`;
      });
    }

    if (paused.length > 0) {
      context += `\n### Paused Campaigns (${paused.length})
`;
      paused.slice(0, 5).forEach((c, i) => {
        context += `${i + 1}. **${c.name}** (ID: ${c.id}) - ${c.objective || 'Unknown'}
`;
      });
      if (paused.length > 5) {
        context += `   ... and ${paused.length - 5} more paused campaigns\n`;
      }
    }

    context += `
### Campaign IDs for Actions
Use these exact IDs when recommending campaign actions:
${active.slice(0, 10).map(c => `- ${c.name}: \`${c.id}\``).join('\n')}`;

    return context;
  }

  /**
   * Detect if a message is asking about Google Ads campaigns
   * @param {string} message - User message
   * @returns {boolean}
   */
  isGoogleAdsQuestion(message) {
    const lowerMessage = message.toLowerCase();
    const googleKeywords = [
      'google ads', 'google ad', 'google campaign', 'google campaigns',
      'adwords', 'search ads', 'search campaign', 'google account',
      'ppc', 'sem campaign', 'google performance', 'google spend',
      'google budget', 'google cpc', 'google ctr', 'google conversions',
    ];

    const actionKeywords = [
      'campaign', 'campaigns', 'review', 'analyze', 'optimize', 'check',
      'audit', 'performance', 'status', 'pause', 'enable', 'budget',
      'account', 'structure', 'list', 'show me',
    ];

    // Check for explicit Google Ads mentions
    if (googleKeywords.some(kw => lowerMessage.includes(kw))) {
      return true;
    }

    // Check for generic campaign questions (likely about ads)
    if (actionKeywords.some(kw => lowerMessage.includes(kw)) &&
        (lowerMessage.includes('google') || lowerMessage.includes('ads') ||
         lowerMessage.includes('paid') || lowerMessage.includes('ppc'))) {
      return true;
    }

    return false;
  }

  /**
   * Detect if a message is asking about Meta/Facebook ads
   * @param {string} message - User message
   * @returns {boolean}
   */
  isMetaAdsQuestion(message) {
    const lowerMessage = message.toLowerCase();
    const metaKeywords = [
      'meta ads', 'facebook ads', 'instagram ads', 'fb ads',
      'meta campaign', 'facebook campaign', 'meta account',
      'facebook performance', 'meta spend', 'facebook budget',
    ];

    return metaKeywords.some(kw => lowerMessage.includes(kw));
  }

  /**
   * Get live ad platform data based on the user's question
   * @param {string} message - User message to analyze
   * @returns {Promise<string>} Additional context to add
   */
  async getLiveAdPlatformContext(message) {
    const contextParts = [];

    const isGoogleQuestion = this.isGoogleAdsQuestion(message);
    const isMetaQuestion = this.isMetaAdsQuestion(message);

    logger.info({
      message: message.substring(0, 100),
      isGoogleQuestion,
      isMetaQuestion,
      googleServiceAvailable: !!this.googleAdsService,
      googleServiceEnabled: this.googleAdsService?.enabled,
      metaServiceAvailable: !!this.metaAdsService,
      metaServiceEnabled: this.metaAdsService?.enabled,
    }, 'Live ad platform context detection');

    // Check if asking about Google Ads
    if (isGoogleQuestion) {
      logger.info('Fetching live Google Ads data...');
      const googleData = await this.getLiveGoogleCampaigns();
      logger.info({ success: googleData.success, error: googleData.error, campaignCount: googleData.campaigns?.length }, 'Google Ads live data result');
      contextParts.push(this.formatLiveGoogleCampaignsContext(googleData));
    }

    // Check if asking about Meta Ads
    if (isMetaQuestion) {
      logger.info('Fetching live Meta Ads data...');
      const metaData = await this.getLiveMetaCampaigns();
      logger.info({ success: metaData.success, error: metaData.error, campaignCount: metaData.campaigns?.length }, 'Meta Ads live data result');
      contextParts.push(this.formatLiveMetaCampaignsContext(metaData));
    }

    const result = contextParts.join('\n\n');
    logger.info({ contextLength: result.length, hasContent: result.length > 0 }, 'Live ad platform context result');

    return result;
  }
}

module.exports = MarketingDataAggregator;
