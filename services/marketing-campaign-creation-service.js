/**
 * Marketing Campaign Creation Service
 *
 * Orchestrates full campaign creation for Meta and Google Ads
 * with AI-assisted ad copy generation and targeting configuration.
 */

const MetaAdsService = require('./meta-ads-api');
const GoogleAdsService = require('./google-ads-api');
const Anthropic = require('@anthropic-ai/sdk');
const { logger } = require('../utils/logger');

class MarketingCampaignCreationService {
  constructor(pool) {
    this.pool = pool;
    this.metaAds = new MetaAdsService();
    this.googleAds = new GoogleAdsService();

    // Initialize Anthropic for AI-assisted ad copy
    if (process.env.ANTHROPIC_API_KEY) {
      this.anthropic = new Anthropic({
        apiKey: process.env.ANTHROPIC_API_KEY,
      });
    }
  }

  /**
   * Campaign Objectives mapped to platform-specific values
   */
  static OBJECTIVES = {
    AWARENESS: {
      meta: 'OUTCOME_AWARENESS',
      google: 'BRAND_AWARENESS_AND_REACH',
      description: 'Increase brand awareness and reach',
    },
    TRAFFIC: {
      meta: 'OUTCOME_TRAFFIC',
      google: 'WEBSITE_TRAFFIC',
      description: 'Drive traffic to your website',
    },
    LEADS: {
      meta: 'OUTCOME_LEADS',
      google: 'LEAD_GENERATION',
      description: 'Generate leads and sign-ups',
    },
    CONVERSIONS: {
      meta: 'OUTCOME_SALES',
      google: 'SALES',
      description: 'Drive conversions and sales',
    },
  };

  /**
   * Get available objectives for campaign creation
   */
  getObjectives() {
    return Object.entries(MarketingCampaignCreationService.OBJECTIVES).map(([key, value]) => ({
      id: key,
      name: key.charAt(0) + key.slice(1).toLowerCase(),
      description: value.description,
    }));
  }

  /**
   * Get targeting options for a platform
   * @param {string} platform - 'meta' or 'google'
   */
  async getTargetingOptions(platform) {
    const baseOptions = {
      locations: [
        { id: 'US', name: 'United States' },
        { id: 'US:NY', name: 'New York, USA' },
        { id: 'US:CA', name: 'California, USA' },
        { id: 'US:TX', name: 'Texas, USA' },
        { id: 'US:FL', name: 'Florida, USA' },
      ],
      ageRanges: [
        { min: 18, max: 24 },
        { min: 25, max: 34 },
        { min: 35, max: 44 },
        { min: 45, max: 54 },
        { min: 55, max: 64 },
        { min: 65, max: null },
      ],
      genders: [
        { id: 'all', name: 'All' },
        { id: 'male', name: 'Male' },
        { id: 'female', name: 'Female' },
      ],
    };

    if (platform === 'meta') {
      return {
        ...baseOptions,
        interests: [
          // Education & Learning
          { id: 'education', name: 'Education', category: 'Interests' },
          { id: 'parenting', name: 'Parenting', category: 'Interests' },
          { id: 'children_activities', name: 'Children Activities', category: 'Interests' },
          { id: 'chess', name: 'Chess', category: 'Interests' },
          { id: 'board_games', name: 'Board Games', category: 'Interests' },
          { id: 'learning_games', name: 'Learning Games', category: 'Interests' },
          // Parent Demographics
          { id: 'parents_preschool', name: 'Parents of preschoolers (3-5)', category: 'Demographics' },
          { id: 'parents_elementary', name: 'Parents of elementary schoolers (6-8)', category: 'Demographics' },
          { id: 'parents_tweens', name: 'Parents of tweens (9-12)', category: 'Demographics' },
        ],
        placements: [
          { id: 'facebook_feed', name: 'Facebook Feed' },
          { id: 'instagram_feed', name: 'Instagram Feed' },
          { id: 'instagram_stories', name: 'Instagram Stories' },
          { id: 'instagram_reels', name: 'Instagram Reels' },
          { id: 'facebook_marketplace', name: 'Facebook Marketplace' },
          { id: 'messenger', name: 'Messenger' },
          { id: 'audience_network', name: 'Audience Network' },
        ],
      };
    }

    if (platform === 'google') {
      return {
        ...baseOptions,
        keywords: [
          { id: 'chess_lessons', name: 'chess lessons for kids', matchType: 'phrase' },
          { id: 'learn_chess', name: 'learn chess online', matchType: 'broad' },
          { id: 'kids_chess', name: 'kids chess', matchType: 'exact' },
          { id: 'chess_tutor', name: 'chess tutor', matchType: 'phrase' },
          { id: 'chess_class', name: 'chess class near me', matchType: 'broad' },
        ],
        networks: [
          { id: 'search', name: 'Google Search' },
          { id: 'display', name: 'Google Display Network' },
          { id: 'youtube', name: 'YouTube' },
        ],
      };
    }

    return baseOptions;
  }

  /**
   * Generate AI-assisted ad copy suggestions
   * @param {Object} params - Parameters for ad copy generation
   */
  async generateAdCopy(params) {
    const { objective, targetAudience, productFocus, tone = 'friendly' } = params;

    if (!this.anthropic) {
      // Return default suggestions if Claude not available
      return this._getDefaultAdCopy(objective);
    }

    try {
      const prompt = `Generate 3 ad copy variations for Acme Operations, a company that teaches chess to kids ages 3-12 through storytelling and fun activities.

Target Objective: ${objective}
Target Audience: ${targetAudience || 'Parents of children ages 3-12'}
Product Focus: ${productFocus || 'Chess lessons that teach critical thinking through stories'}
Tone: ${tone}

For each variation, provide:
1. Headline (max 40 characters for Meta, 30 for Google)
2. Primary Text (max 125 characters)
3. Description (max 90 characters)
4. Call to Action suggestion

Return as JSON array with format:
[
  {
    "headline": "...",
    "primaryText": "...",
    "description": "...",
    "cta": "Learn More" | "Sign Up" | "Book Now" | "Get Started"
  }
]`;

      const response = await this.anthropic.messages.create({
        model: 'claude-sonnet-4-20250514',
        max_tokens: 1024,
        messages: [{ role: 'user', content: prompt }],
      });

      // Parse Claude's response
      const content = response.content[0].text;
      const jsonMatch = content.match(/\[[\s\S]*\]/);
      if (jsonMatch) {
        return JSON.parse(jsonMatch[0]);
      }

      return this._getDefaultAdCopy(objective);
    } catch (error) {
      logger.error({ err: error }, 'Error generating ad copy:');
      return this._getDefaultAdCopy(objective);
    }
  }

  /**
   * Default ad copy when AI generation fails
   */
  _getDefaultAdCopy(objective) {
    const copies = {
      AWARENESS: [
        {
          headline: 'Chess Made Fun for Kids!',
          primaryText: 'Acme Operations teaches kids chess through engaging stories. Perfect for ages 3-12.',
          description: 'Build critical thinking skills while having fun',
          cta: 'Learn More',
        },
        {
          headline: 'Chess Stories Kids Love',
          primaryText: 'Transform screen time into brain time with our story-based chess lessons.',
          description: 'Expert coaches, engaging curriculum',
          cta: 'Learn More',
        },
      ],
      TRAFFIC: [
        {
          headline: 'Book a Free Chess Trial',
          primaryText: 'See why parents love our approach to teaching chess through storytelling.',
          description: 'First lesson free - no obligation',
          cta: 'Book Now',
        },
      ],
      LEADS: [
        {
          headline: 'Free Chess Starter Guide',
          primaryText: 'Download our guide to teaching your child chess at home.',
          description: 'Tips from expert coaches included',
          cta: 'Sign Up',
        },
      ],
      CONVERSIONS: [
        {
          headline: 'Start Chess Lessons Today',
          primaryText: 'Join thousands of families who chose Acme Operations.',
          description: 'Flexible scheduling, expert coaches',
          cta: 'Get Started',
        },
      ],
    };

    return copies[objective] || copies.AWARENESS;
  }

  /**
   * Create a campaign draft (saved to database, not yet pushed to platform)
   */
  async createCampaignDraft(draftData) {
    const {
      name,
      platform,
      objective,
      budget,
      budgetType,
      startDate,
      endDate,
      targeting,
      adCopy,
      createdBy,
    } = draftData;

    const result = await this.pool.query(`
      INSERT INTO marketing_campaign_drafts (
        name, platform, status, objective,
        budget_amount, budget_type,
        start_date, end_date,
        targeting_config, creative_assets,
        created_by, created_at, updated_at
      ) VALUES ($1, $2, 'draft', $3, $4, $5, $6, $7, $8, $9, $10, NOW(), NOW())
      RETURNING *
    `, [
      name,
      platform,
      objective,
      budget,
      budgetType || 'daily',
      startDate,
      endDate,
      JSON.stringify(targeting || {}),
      JSON.stringify(adCopy || []),
      createdBy,
    ]);

    return result.rows[0];
  }

  /**
   * Update an existing campaign draft
   */
  async updateCampaignDraft(draftId, updates) {
    const allowedFields = [
      'name', 'platform', 'objective', 'budget_amount', 'budget_type',
      'start_date', 'end_date', 'targeting_config', 'creative_assets', 'status',
    ];

    const setClause = [];
    const values = [];
    let paramIndex = 1;

    for (const [key, value] of Object.entries(updates)) {
      const dbKey = key.replace(/([A-Z])/g, '_$1').toLowerCase();
      if (allowedFields.includes(dbKey)) {
        setClause.push(`${dbKey} = $${paramIndex}`);
        values.push(typeof value === 'object' ? JSON.stringify(value) : value);
        paramIndex++;
      }
    }

    if (setClause.length === 0) {
      throw new Error('No valid fields to update');
    }

    setClause.push(`updated_at = NOW()`);
    values.push(draftId);

    const result = await this.pool.query(`
      UPDATE marketing_campaign_drafts
      SET ${setClause.join(', ')}
      WHERE id = $${paramIndex}
      RETURNING *
    `, values);

    return result.rows[0];
  }

  /**
   * Get campaign draft by ID
   */
  async getCampaignDraft(draftId) {
    const result = await this.pool.query(`
      SELECT * FROM marketing_campaign_drafts WHERE id = $1
    `, [draftId]);
    return result.rows[0];
  }

  /**
   * List campaign drafts
   */
  async listCampaignDrafts(options = {}) {
    const { status, platform, limit = 50, offset = 0 } = options;

    let query = 'SELECT * FROM marketing_campaign_drafts WHERE 1=1';
    const params = [];
    let paramIndex = 1;

    if (status) {
      query += ` AND status = $${paramIndex}`;
      params.push(status);
      paramIndex++;
    }

    if (platform) {
      query += ` AND platform = $${paramIndex}`;
      params.push(platform);
      paramIndex++;
    }

    query += ` ORDER BY updated_at DESC LIMIT $${paramIndex} OFFSET $${paramIndex + 1}`;
    params.push(limit, offset);

    const result = await this.pool.query(query, params);
    return result.rows;
  }

  /**
   * Push a draft campaign to Meta Ads
   * Handles both new campaign creation and optimization updates (budget, etc.)
   */
  async pushToMeta(draftId) {
    if (!this.metaAds.enabled) {
      throw new Error('Meta Ads API is not configured. Set META_ADS_ACCESS_TOKEN and META_ADS_AD_ACCOUNT_ID environment variables.');
    }

    const draft = await this.getCampaignDraft(draftId);
    if (!draft) {
      throw new Error(`Draft ${draftId} not found`);
    }

    if (draft.platform !== 'meta') {
      throw new Error(`Draft ${draftId} is not a Meta campaign`);
    }

    const draftData = typeof draft.draft_data === 'string'
      ? JSON.parse(draft.draft_data)
      : (draft.draft_data || {});

    try {
      let result;
      let message;

      if (draft.campaign_type === 'budget') {
        // Budget optimization — update existing campaign budget
        const targetId = draftData.targetCampaignId;
        const dailyBudget = draftData.changes?.dailyBudget;
        if (!targetId || !dailyBudget) {
          throw new Error('Budget draft missing target campaign ID or daily budget amount');
        }
        result = await this.metaAds.updateCampaignBudget(targetId, { dailyBudget });
        result = { id: targetId, ...(result || {}) };
        message = `Budget updated to $${dailyBudget}/day on Meta Ads.`;
      } else if (draft.campaign_type === 'new_campaign') {
        // New campaign creation
        const budgetConfig = typeof draft.budget_config === 'string'
          ? JSON.parse(draft.budget_config)
          : (draft.budget_config || {});
        const objectiveConfig = MarketingCampaignCreationService.OBJECTIVES[draft.objective];
        if (!objectiveConfig) {
          throw new Error(`Unknown objective: ${draft.objective}`);
        }

        const campaign = await this.metaAds.createCampaign({
          name: draft.name,
          objective: objectiveConfig.meta,
          status: 'PAUSED',
          dailyBudget: budgetConfig.type === 'daily' ? budgetConfig.amount : null,
          lifetimeBudget: budgetConfig.type === 'lifetime' ? budgetConfig.amount : null,
          startTime: budgetConfig.startDate,
          endTime: budgetConfig.endDate,
        });

        const targeting = typeof draft.targeting_config === 'string'
          ? JSON.parse(draft.targeting_config)
          : (draft.targeting_config || {});

        const adSet = await this.metaAds.createAdSet({
          campaignId: campaign.id,
          name: `${draft.name} - Ad Set`,
          status: 'PAUSED',
          dailyBudget: budgetConfig.type === 'daily' ? budgetConfig.amount : null,
          lifetimeBudget: budgetConfig.type === 'lifetime' ? budgetConfig.amount : null,
          startTime: budgetConfig.startDate,
          endTime: budgetConfig.endDate,
          targeting,
          optimizationGoal: this._getOptimizationGoal(draft.objective),
          billingEvent: 'IMPRESSIONS',
        });

        const creatives = typeof draft.creative_assets === 'string'
          ? JSON.parse(draft.creative_assets)
          : (draft.creative_assets || []);

        const ads = [];
        for (let i = 0; i < creatives.length; i++) {
          const creative = creatives[i];
          const ad = await this.metaAds.createAd({
            adSetId: adSet.id,
            name: `${draft.name} - Ad ${i + 1}`,
            status: 'PAUSED',
            creative: {
              headline: creative.headline,
              primaryText: creative.primaryText,
              description: creative.description,
              callToAction: creative.cta,
              linkUrl: 'https://join.acmeops.com',
            },
          });
          ads.push(ad);
        }

        result = { id: campaign.id, campaign, adSet, ads };
        message = 'Campaign created on Meta (PAUSED). Review and activate in Meta Ads Manager.';
      } else {
        throw new Error(`Push to Meta not yet supported for draft type: ${draft.campaign_type}`);
      }

      // Mark draft as pushed with result
      await this.pool.query(`
        UPDATE marketing_campaign_drafts
        SET
          status = 'pushed',
          external_id = $1,
          pushed_at = NOW(),
          push_result = $2,
          updated_at = NOW()
        WHERE id = $3
      `, [String(result.id || ''), JSON.stringify(result), draftId]);

      return { success: true, result, message };
    } catch (error) {
      // Store error in push_result but keep status as 'approved' so user can retry
      try {
        await this.pool.query(`
          UPDATE marketing_campaign_drafts
          SET push_result = $1, updated_at = NOW()
          WHERE id = $2
        `, [JSON.stringify({ error: error.message }), draftId]);
      } catch (_) {
        // Don't mask the original error
      }
      throw error;
    }
  }

  /**
   * Push a draft campaign to Google Ads
   * Handles both new campaign creation and optimization updates (budget, etc.)
   */
  async pushToGoogle(draftId) {
    if (!this.googleAds.enabled) {
      throw new Error('Google Ads API is not configured. Set GOOGLE_ADS_CLIENT_ID, GOOGLE_ADS_CLIENT_SECRET, GOOGLE_ADS_REFRESH_TOKEN, GOOGLE_ADS_DEVELOPER_TOKEN, and GOOGLE_ADS_CUSTOMER_ID environment variables.');
    }

    const draft = await this.getCampaignDraft(draftId);
    if (!draft) {
      throw new Error(`Draft ${draftId} not found`);
    }

    if (draft.platform !== 'google') {
      throw new Error(`Draft ${draftId} is not a Google campaign`);
    }

    const draftData = typeof draft.draft_data === 'string'
      ? JSON.parse(draft.draft_data)
      : (draft.draft_data || {});

    try {
      let result;
      let message;

      if (draft.campaign_type === 'budget') {
        // Budget optimization — update existing campaign budget
        const targetId = draftData.targetCampaignId;
        const dailyBudget = draftData.changes?.dailyBudget;
        if (!targetId || !dailyBudget) {
          throw new Error('Budget draft missing target campaign ID or daily budget amount');
        }
        result = await this.googleAds.updateCampaignBudget(targetId, dailyBudget);
        result = { id: targetId, ...(result || {}) };
        message = `Budget updated to $${dailyBudget}/day on Google Ads.`;
      } else if (draft.campaign_type === 'new_campaign') {
        // New campaign creation
        const budgetConfig = typeof draft.budget_config === 'string'
          ? JSON.parse(draft.budget_config)
          : (draft.budget_config || {});

        result = await this.googleAds.createCampaign({
          name: draft.name,
          advertisingChannelType: 'SEARCH',
          status: 'PAUSED',
          budget: {
            amountMicros: (budgetConfig.amount || 0) * 1000000,
            deliveryMethod: 'STANDARD',
          },
          startDate: budgetConfig.startDate,
          endDate: budgetConfig.endDate,
        });
        message = 'Campaign created on Google Ads (PAUSED). Review and activate in Google Ads.';
      } else {
        throw new Error(`Push to Google not yet supported for draft type: ${draft.campaign_type}`);
      }

      // Mark draft as pushed with result
      await this.pool.query(`
        UPDATE marketing_campaign_drafts
        SET
          status = 'pushed',
          external_id = $1,
          pushed_at = NOW(),
          push_result = $2,
          updated_at = NOW()
        WHERE id = $3
      `, [String(result.id || ''), JSON.stringify(result), draftId]);

      return { success: true, result, message };
    } catch (error) {
      // Store error in push_result but keep status as 'approved' so user can retry
      try {
        await this.pool.query(`
          UPDATE marketing_campaign_drafts
          SET push_result = $1, updated_at = NOW()
          WHERE id = $2
        `, [JSON.stringify({ error: error.message }), draftId]);
      } catch (_) {
        // Don't mask the original error
      }
      throw error;
    }
  }

  /**
   * Get Meta optimization goal from objective
   */
  _getOptimizationGoal(objective) {
    const goals = {
      AWARENESS: 'REACH',
      TRAFFIC: 'LINK_CLICKS',
      LEADS: 'LEAD_GENERATION',
      CONVERSIONS: 'OFFSITE_CONVERSIONS',
    };
    return goals[objective] || 'LINK_CLICKS';
  }

  /**
   * Delete a campaign draft
   */
  async deleteCampaignDraft(draftId) {
    const result = await this.pool.query(`
      DELETE FROM marketing_campaign_drafts WHERE id = $1 RETURNING id
    `, [draftId]);
    return result.rowCount > 0;
  }

  /**
   * Estimate campaign reach based on targeting
   * (Uses Meta's reach estimate API when available)
   */
  async estimateReach(platform, targeting) {
    // TODO: Implement reach estimation using platform APIs
    // For now, return placeholder estimates
    return {
      estimatedReach: {
        min: 10000,
        max: 50000,
      },
      estimatedDaily: {
        impressions: { min: 1000, max: 5000 },
        clicks: { min: 50, max: 250 },
      },
      confidence: 'low',
      note: 'Reach estimates are approximate and may vary.',
    };
  }
}

module.exports = MarketingCampaignCreationService;
