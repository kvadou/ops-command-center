// services/marketing-ai-brain.js
/**
 * Marketing AI Brain Service
 *
 * Central intelligence that analyzes all marketing platforms and business data
 * to generate actionable insights and recommendations.
 */

const Anthropic = require('@anthropic-ai/sdk');
const MetaAdsApi = require('./meta-ads-api');
const GoogleAdsApi = require('./google-ads-api');
const KlaviyoAdsService = require('./klaviyo-ads-service');
const KlaviyoSyncService = require('./klaviyo-sync-service');
const { logger } = require('../utils/logger');

// Retry configuration for transient API errors
const MAX_RETRIES = 2;
const RETRY_DELAYS = [1000, 3000]; // 1s, 3s

class MarketingAiBrain {
  constructor(pool) {
    this.pool = pool;
    this.anthropic = new Anthropic();
    this.metaApi = new MetaAdsApi();
    this.googleApi = new GoogleAdsApi();
    this.klaviyoApi = new KlaviyoAdsService();
    this.klaviyoSync = new KlaviyoSyncService(pool);
  }

  /**
   * Helper to call Anthropic API with retry logic for transient errors
   */
  async callAnthropicWithRetry(params, retryCount = 0) {
    try {
      const response = await this.anthropic.messages.create(params);
      return response;
    } catch (err) {
      // Check if this is a retryable error (503, 529, or overloaded)
      const status = err.status || err.error?.status;
      const isOverloaded = err.message?.includes('overloaded') ||
                           err.message?.includes('503') ||
                           err.message?.includes('529') ||
                           status === 503 ||
                           status === 529;

      logger.warn({ data: err.message }, `Anthropic API error (attempt ${retryCount + 1}/${MAX_RETRIES + 1}):`);

      // Retry on transient errors
      if (isOverloaded && retryCount < MAX_RETRIES) {
        const delay = RETRY_DELAYS[retryCount] || 3000;
        logger.info(`Retrying in ${delay}ms...`);
        await new Promise(resolve => setTimeout(resolve, delay));
        return this.callAnthropicWithRetry(params, retryCount + 1);
      }

      // If we've exhausted retries or it's not a transient error, throw
      if (isOverloaded) {
        const apiError = new Error('The AI service is temporarily overloaded. Please try again in a moment.');
        apiError.isTransient = true;
        apiError.status = 503;
        throw apiError;
      }

      throw err;
    }
  }

  /**
   * Collect all platform data for analysis
   */
  async collectPlatformData() {
    const data = {
      meta: { campaigns: [], error: null },
      google: { campaigns: [], error: null },
      klaviyo: { campaigns: [], flows: [], lists: [], error: null },
    };

    // Meta campaigns
    try {
      if (this.metaApi.isConfigured()) {
        data.meta.campaigns = await this.metaApi.getCampaignsList() || [];
      }
    } catch (err) {
      data.meta.error = err.message;
      logger.warn({ data: err.message }, 'Could not fetch Meta campaigns:');
    }

    // Google campaigns
    try {
      if (this.googleApi.isConfigured()) {
        data.google.campaigns = await this.googleApi.getCampaignsList() || [];
      }
    } catch (err) {
      data.google.error = err.message;
      logger.warn({ data: err.message }, 'Could not fetch Google campaigns:');
    }

    // Klaviyo data
    try {
      if (this.klaviyoApi.enabled) {
        data.klaviyo.campaigns = await this.klaviyoApi.getCampaignsList() || [];
        data.klaviyo.flows = await this.klaviyoSync.getFlowsWithEmails() || [];
        data.klaviyo.lists = await this.klaviyoSync.getLists() || [];
      }
    } catch (err) {
      data.klaviyo.error = err.message;
      logger.warn({ data: err.message }, 'Could not fetch Klaviyo data:');
    }

    return data;
  }

  /**
   * Collect business data from database
   */
  async collectBusinessData() {
    const data = {};

    // Booking submissions by source (last 90 days)
    try {
      const bookingsResult = await this.pool.query(`
        SELECT
          COALESCE(utm_source, 'direct') as source,
          COUNT(*) as total_bookings,
          COUNT(CASE WHEN payment_status = 'paid' THEN 1 END) as paid_bookings,
          SUM(CASE WHEN payment_status = 'paid' THEN COALESCE(actual_price, 0) ELSE 0 END) as revenue
        FROM booking_submissions
        WHERE created_at >= NOW() - INTERVAL '90 days'
        GROUP BY COALESCE(utm_source, 'direct')
        ORDER BY revenue DESC
      `);
      data.bookingsBySource = bookingsResult.rows;
    } catch (err) {
      logger.warn({ data: err.message }, 'Could not fetch bookings by source:');
      data.bookingsBySource = [];
    }

    // Trial to paid conversion by source
    try {
      const conversionResult = await this.pool.query(`
        SELECT
          COALESCE(utm_source, 'direct') as source,
          COUNT(CASE WHEN is_trial = true THEN 1 END) as trials,
          COUNT(CASE WHEN is_trial = false AND payment_status = 'paid' THEN 1 END) as conversions
        FROM booking_submissions
        WHERE created_at >= NOW() - INTERVAL '90 days'
        GROUP BY COALESCE(utm_source, 'direct')
      `);
      data.conversionBySource = conversionResult.rows;
    } catch (err) {
      logger.warn({ data: err.message }, 'Could not fetch conversion data:');
      data.conversionBySource = [];
    }

    // Ad spend data (last 30 days)
    try {
      const spendResult = await this.pool.query(`
        SELECT
          platform,
          SUM(spend) as total_spend,
          SUM(impressions) as total_impressions,
          SUM(clicks) as total_clicks,
          AVG(CASE WHEN clicks > 0 THEN spend / clicks END) as avg_cpc
        FROM ad_spend_data
        WHERE date >= NOW() - INTERVAL '30 days'
        GROUP BY platform
      `);
      data.adSpendByPlatform = spendResult.rows;
    } catch (err) {
      logger.warn({ data: err.message }, 'Could not fetch ad spend data:');
      data.adSpendByPlatform = [];
    }

    // Weekly trends
    try {
      const trendsResult = await this.pool.query(`
        SELECT
          DATE_TRUNC('week', date) as week,
          platform,
          SUM(spend) as spend,
          SUM(clicks) as clicks
        FROM ad_spend_data
        WHERE date >= NOW() - INTERVAL '8 weeks'
        GROUP BY DATE_TRUNC('week', date), platform
        ORDER BY week DESC
      `);
      data.weeklyTrends = trendsResult.rows;
    } catch (err) {
      logger.warn({ data: err.message }, 'Could not fetch weekly trends:');
      data.weeklyTrends = [];
    }

    return data;
  }

  /**
   * Generate AI insights from collected data
   */
  async generateInsights(platformData, businessData) {
    const systemPrompt = `You are an expert digital marketing analyst for Acme Operations, a chess tutoring company.

Your job is to analyze marketing performance data and generate actionable insights.

IMPORTANT RULES:
1. Only suggest actions that can be implemented (pause/resume campaigns, adjust budgets, create new campaigns)
2. Be specific with numbers and percentages
3. Prioritize by potential impact
4. Consider cross-platform opportunities
5. Flag anything concerning immediately

OUTPUT FORMAT:
Return a JSON array of insights, each with:
{
  "platform": "meta" | "google" | "klaviyo" | "cross_platform",
  "insight_type": "alert" | "optimization" | "new_campaign" | "budget_shift",
  "priority": "critical" | "high" | "medium" | "low",
  "target_id": "campaign/flow ID if applicable",
  "target_name": "name of campaign/flow",
  "title": "short title (under 100 chars)",
  "analysis": "detailed analysis of the situation",
  "recommendation": "specific action to take",
  "projected_impact": {
    "metric": "estimated improvement",
    "confidence": "high/medium/low"
  },
  "action_payload": {
    // Platform-specific action data if applicable
  }
}

Return ONLY valid JSON array. No markdown, no explanation.`;

    const userPrompt = `Analyze this marketing data and generate insights:

## Platform Data

### Meta Ads
${JSON.stringify(platformData.meta, null, 2)}

### Google Ads
${JSON.stringify(platformData.google, null, 2)}

### Klaviyo
Campaigns: ${platformData.klaviyo.campaigns?.length || 0}
Flows: ${platformData.klaviyo.flows?.length || 0}
Lists: ${platformData.klaviyo.lists?.length || 0}
${JSON.stringify(platformData.klaviyo, null, 2)}

## Business Data

### Bookings by Source (Last 90 Days)
${JSON.stringify(businessData.bookingsBySource, null, 2)}

### Trial to Paid Conversion
${JSON.stringify(businessData.conversionBySource, null, 2)}

### Ad Spend by Platform (Last 30 Days)
${JSON.stringify(businessData.adSpendByPlatform, null, 2)}

### Weekly Trends
${JSON.stringify(businessData.weeklyTrends, null, 2)}

Generate 3-10 actionable insights based on this data.`;

    try {
      const response = await this.callAnthropicWithRetry({
        model: 'claude-sonnet-4-20250514',
        max_tokens: 4000,
        messages: [
          { role: 'user', content: userPrompt }
        ],
        system: systemPrompt,
      });

      const content = response.content[0]?.text || '[]';

      // Parse JSON response
      let insights;
      try {
        insights = JSON.parse(content);
      } catch (parseErr) {
        // Try to extract JSON from response
        const jsonMatch = content.match(/\[[\s\S]*\]/);
        if (jsonMatch) {
          insights = JSON.parse(jsonMatch[0]);
        } else {
          logger.error('Could not parse AI response as JSON');
          insights = [];
        }
      }

      return Array.isArray(insights) ? insights : [];
    } catch (err) {
      logger.error({ error: err.message }, 'Error generating AI insights:');
      // Re-throw transient errors so the route can return appropriate status
      if (err.isTransient) {
        throw err;
      }
      return [];
    }
  }

  /**
   * Save insights to database
   */
  async saveInsights(insights) {
    const saved = [];

    for (const insight of insights) {
      try {
        const result = await this.pool.query(`
          INSERT INTO marketing_ai_insights (
            platform, insight_type, priority, target_id, target_name,
            title, analysis, recommendation, projected_impact, action_payload,
            status, expires_at
          ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, 'pending', NOW() + INTERVAL '7 days')
          RETURNING id
        `, [
          insight.platform,
          insight.insight_type,
          insight.priority,
          insight.target_id || null,
          insight.target_name || null,
          insight.title,
          insight.analysis,
          insight.recommendation,
          JSON.stringify(insight.projected_impact || {}),
          JSON.stringify(insight.action_payload || {}),
        ]);

        saved.push({ ...insight, id: result.rows[0].id });
      } catch (err) {
        logger.error({ error: err.message }, 'Error saving insight:');
      }
    }

    return saved;
  }

  /**
   * Run full analysis and generate insights
   */
  async runAnalysis() {
    logger.info('\n========== AI Marketing Brain Analysis ==========');

    // Collect data
    logger.info('Collecting platform data...');
    const platformData = await this.collectPlatformData();

    logger.info('Collecting business data...');
    const businessData = await this.collectBusinessData();

    // Generate insights
    logger.info('Generating AI insights...');
    const insights = await this.generateInsights(platformData, businessData);
    logger.info(`Generated ${insights.length} insights`);

    // Save to database
    logger.info('Saving insights...');
    const saved = await this.saveInsights(insights);
    logger.info(`Saved ${saved.length} insights`);

    logger.info('========== Analysis Complete ==========\n');

    return {
      platformData,
      businessData,
      insights: saved,
    };
  }

  /**
   * Get pending insights
   */
  async getPendingInsights(platform = null) {
    let query = `
      SELECT * FROM marketing_ai_insights
      WHERE status = 'pending'
        AND (expires_at IS NULL OR expires_at > NOW())
    `;
    const params = [];

    if (platform) {
      query += ` AND platform = $1`;
      params.push(platform);
    }

    query += ` ORDER BY
      CASE priority
        WHEN 'critical' THEN 1
        WHEN 'high' THEN 2
        WHEN 'medium' THEN 3
        ELSE 4
      END,
      created_at DESC`;

    const result = await this.pool.query(query, params);
    return result.rows;
  }

  /**
   * Dismiss an insight
   */
  async dismissInsight(insightId, dismissedBy) {
    await this.pool.query(`
      UPDATE marketing_ai_insights
      SET status = 'dismissed', dismissed_by = $2, dismissed_at = NOW()
      WHERE id = $1
    `, [insightId, dismissedBy]);
  }

  /**
   * Convert insight to draft
   */
  async insightToDraft(insightId, createdBy) {
    // Get the insight
    const insightResult = await this.pool.query(
      'SELECT * FROM marketing_ai_insights WHERE id = $1',
      [insightId]
    );

    if (insightResult.rows.length === 0) {
      throw new Error('Insight not found');
    }

    const insight = insightResult.rows[0];

    // Create draft
    const draftResult = await this.pool.query(`
      INSERT INTO marketing_campaign_drafts (
        platform, campaign_type, name, draft_data, ai_reasoning,
        projected_impact, insight_id, status, created_by
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, 'draft', $8)
      RETURNING id
    `, [
      insight.platform,
      insight.insight_type,
      insight.title,
      JSON.stringify(insight.action_payload || {}),
      insight.analysis + '\n\nRecommendation: ' + insight.recommendation,
      JSON.stringify(insight.projected_impact || {}),
      insightId,
      createdBy,
    ]);

    // Update insight status
    await this.pool.query(`
      UPDATE marketing_ai_insights
      SET status = 'added_to_queue', draft_id = $2
      WHERE id = $1
    `, [insightId, draftResult.rows[0].id]);

    return draftResult.rows[0].id;
  }
}

module.exports = MarketingAiBrain;
