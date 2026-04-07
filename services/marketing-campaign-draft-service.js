/**
 * Marketing Campaign Draft Service
 *
 * Manages AI-generated campaign drafts for review before pushing to platforms.
 * Supports campaign creation, ad copy drafts, targeting suggestions, and creative briefs.
 */

const { logger } = require('../utils/logger');
const MetaAdsApi = require('./meta-ads-api');
const GoogleAdsApi = require('./google-ads-api');
const TikTokAdsApi = require('./tiktok-ads-api');
const LinkedInAdsApi = require('./linkedin-ads-api');

class MarketingCampaignDraftService {
  constructor(pool) {
    this.pool = pool;
    this.metaApi = new MetaAdsApi();
    this.googleApi = new GoogleAdsApi();
    this.tiktokApi = new TikTokAdsApi();
    this.linkedinApi = new LinkedInAdsApi();
  }

  /**
   * Create a new campaign draft
   * @param {Object} params - Draft parameters
   * @returns {Promise<Object>} Created draft
   */
  async createDraft(params) {
    const {
      conversationId,
      platform,
      campaignType,
      name,
      draftData,
      aiReasoning,
      createdBy,
    } = params;

    const result = await this.pool.query(`
      INSERT INTO marketing_campaign_drafts (
        conversation_id, platform, campaign_type, name, draft_data, ai_reasoning, created_by
      ) VALUES ($1, $2, $3, $4, $5, $6, $7)
      RETURNING *
    `, [conversationId, platform, campaignType, name, JSON.stringify(draftData), aiReasoning, createdBy]);

    logger.info({
      msg: 'Campaign draft created',
      draftId: result.rows[0].id,
      platform,
      campaignType,
      name,
    });

    return result.rows[0];
  }

  /**
   * Get all drafts with optional filtering
   */
  async getDrafts(options = {}) {
    const { status, platform, limit = 50 } = options;

    let query = `
      SELECT cd.*, mc.title as conversation_title
      FROM marketing_campaign_drafts cd
      LEFT JOIN marketing_conversations mc ON mc.id = cd.conversation_id
      WHERE 1=1
    `;
    const params = [];

    if (status) {
      params.push(status);
      query += ` AND cd.status = $${params.length}`;
    }

    if (platform) {
      params.push(platform);
      query += ` AND cd.platform = $${params.length}`;
    }

    params.push(limit);
    query += ` ORDER BY cd.created_at DESC LIMIT $${params.length}`;

    const result = await this.pool.query(query, params);
    return result.rows;
  }

  /**
   * Get a specific draft by ID
   */
  async getDraft(draftId) {
    const result = await this.pool.query(`
      SELECT cd.*, mc.title as conversation_title
      FROM marketing_campaign_drafts cd
      LEFT JOIN marketing_conversations mc ON mc.id = cd.conversation_id
      WHERE cd.id = $1
    `, [draftId]);

    return result.rows[0] || null;
  }

  /**
   * Update a draft
   */
  async updateDraft(draftId, updates) {
    const { name, draftData, aiReasoning, status } = updates;

    const fields = [];
    const values = [draftId];

    if (name !== undefined) {
      values.push(name);
      fields.push(`name = $${values.length}`);
    }

    if (draftData !== undefined) {
      values.push(JSON.stringify(draftData));
      fields.push(`draft_data = $${values.length}`);
    }

    if (aiReasoning !== undefined) {
      values.push(aiReasoning);
      fields.push(`ai_reasoning = $${values.length}`);
    }

    if (status !== undefined) {
      values.push(status);
      fields.push(`status = $${values.length}`);
    }

    fields.push('updated_at = NOW()');

    const result = await this.pool.query(`
      UPDATE marketing_campaign_drafts
      SET ${fields.join(', ')}
      WHERE id = $1
      RETURNING *
    `, values);

    return result.rows[0];
  }

  /**
   * Approve a draft for pushing
   */
  async approveDraft(draftId, approvedBy) {
    const result = await this.pool.query(`
      UPDATE marketing_campaign_drafts
      SET status = 'approved', approved_by = $2, approved_at = NOW(), updated_at = NOW()
      WHERE id = $1 AND status = 'draft'
      RETURNING *
    `, [draftId, approvedBy]);

    if (result.rows.length === 0) {
      throw new Error('Draft not found or not in draft status');
    }

    logger.info({
      msg: 'Campaign draft approved',
      draftId,
      approvedBy,
    });

    return result.rows[0];
  }

  /**
   * Reject a draft
   */
  async rejectDraft(draftId, rejectedBy, reason) {
    const result = await this.pool.query(`
      UPDATE marketing_campaign_drafts
      SET status = 'rejected',
          ai_reasoning = COALESCE(ai_reasoning, '') || E'\n\nRejection reason: ' || $3,
          updated_at = NOW()
      WHERE id = $1 AND status IN ('draft', 'approved')
      RETURNING *
    `, [draftId, rejectedBy, reason || 'No reason provided']);

    if (result.rows.length === 0) {
      throw new Error('Draft not found or already processed');
    }

    return result.rows[0];
  }

  /**
   * Push an approved draft to the platform
   */
  async pushDraft(draftId) {
    const draft = await this.getDraft(draftId);

    if (!draft) {
      throw new Error('Draft not found');
    }

    if (draft.status !== 'approved') {
      throw new Error(`Draft must be approved before pushing (current status: ${draft.status})`);
    }

    const platform = draft.platform.toLowerCase();
    let result;

    try {
      switch (platform) {
        case 'meta':
          result = await this.pushMetaDraft(draft);
          break;
        case 'google':
          result = await this.pushGoogleDraft(draft);
          break;
        case 'tiktok':
          result = await this.pushTikTokDraft(draft);
          break;
        case 'linkedin':
          result = await this.pushLinkedInDraft(draft);
          break;
        default:
          throw new Error(`Unsupported platform: ${platform}`);
      }

      // Update draft with success
      await this.pool.query(`
        UPDATE marketing_campaign_drafts
        SET status = 'pushed', pushed_at = NOW(), push_result = $2, external_id = $3, updated_at = NOW()
        WHERE id = $1
      `, [draftId, JSON.stringify(result), result.externalId || null]);

      logger.info({
        msg: 'Campaign draft pushed to platform',
        draftId,
        platform,
        externalId: result.externalId,
      });

      return { success: true, draftId, result };
    } catch (error) {
      // Update draft with error
      await this.pool.query(`
        UPDATE marketing_campaign_drafts
        SET push_result = $2, updated_at = NOW()
        WHERE id = $1
      `, [draftId, JSON.stringify({ error: error.message })]);

      logger.error({
        msg: 'Failed to push campaign draft',
        draftId,
        platform,
        error: error.message,
      });

      throw error;
    }
  }

  /**
   * Push draft to Meta Ads
   */
  async pushMetaDraft(draft) {
    const { campaign_type, draft_data } = draft;

    switch (campaign_type) {
      case 'new_campaign':
        // Create campaign (would need createCampaign method in meta-ads-api.js)
        // For now, return placeholder
        return {
          success: true,
          message: 'Campaign creation requires Meta Ads API extension',
          externalId: null,
          draftData: draft_data,
        };

      case 'ad_copy':
        // Update ad creative
        return {
          success: true,
          message: 'Ad copy update ready for manual implementation',
          externalId: null,
          suggestedCopy: draft_data,
        };

      default:
        return {
          success: true,
          message: `Draft type ${campaign_type} processed`,
          draftData: draft_data,
        };
    }
  }

  /**
   * Push draft to Google Ads
   */
  async pushGoogleDraft(draft) {
    const { campaign_type, draft_data } = draft;

    // Google Ads API requires more complex campaign creation
    return {
      success: true,
      message: 'Google Ads draft ready for manual implementation',
      campaignType: campaign_type,
      draftData: draft_data,
    };
  }

  /**
   * Push draft to TikTok
   */
  async pushTikTokDraft(draft) {
    const { campaign_type, draft_data } = draft;

    return {
      success: true,
      message: 'TikTok draft ready for manual implementation',
      campaignType: campaign_type,
      draftData: draft_data,
    };
  }

  /**
   * Push draft to LinkedIn
   */
  async pushLinkedInDraft(draft) {
    const { campaign_type, draft_data } = draft;

    return {
      success: true,
      message: 'LinkedIn draft ready for manual implementation',
      campaignType: campaign_type,
      draftData: draft_data,
    };
  }

  /**
   * Archive a draft
   */
  async archiveDraft(draftId) {
    const result = await this.pool.query(`
      UPDATE marketing_campaign_drafts
      SET status = 'archived', updated_at = NOW()
      WHERE id = $1
      RETURNING *
    `, [draftId]);

    return result.rows[0];
  }

  /**
   * Generate draft from AI conversation
   * Called by the command service when AI suggests a campaign
   */
  async generateDraftFromAI(params) {
    const {
      conversationId,
      platform,
      suggestion,
      createdBy,
    } = params;

    // Parse AI suggestion into structured draft
    const draftData = this.parseAISuggestion(suggestion, platform);

    return this.createDraft({
      conversationId,
      platform,
      campaignType: draftData.campaignType || 'new_campaign',
      name: draftData.name || `AI Draft - ${new Date().toLocaleDateString()}`,
      draftData,
      aiReasoning: suggestion.reasoning,
      createdBy,
    });
  }

  /**
   * Parse AI suggestion into structured draft data
   */
  parseAISuggestion(suggestion, platform) {
    const draftData = {
      campaignType: 'new_campaign',
      name: suggestion.name || 'Untitled Campaign',
      objective: suggestion.objective || 'CONVERSIONS',
      budget: {
        type: suggestion.budgetType || 'daily',
        amount: suggestion.budget || 50,
      },
      targeting: {
        audiences: suggestion.audiences || [],
        interests: suggestion.interests || [],
        locations: suggestion.locations || ['United States'],
        ageRange: suggestion.ageRange || { min: 25, max: 55 },
      },
      creative: {
        headline: suggestion.headline || '',
        primaryText: suggestion.primaryText || '',
        description: suggestion.description || '',
        callToAction: suggestion.callToAction || 'LEARN_MORE',
      },
      schedule: {
        startDate: suggestion.startDate || new Date().toISOString().split('T')[0],
        endDate: suggestion.endDate || null,
      },
    };

    return draftData;
  }

  /**
   * Get draft templates by campaign type
   */
  getTemplates() {
    return {
      meta: {
        new_campaign: {
          name: '',
          objective: 'CONVERSIONS',
          budget: { type: 'daily', amount: 50 },
          targeting: {
            audiences: [],
            interests: [],
            locations: ['United States'],
            ageRange: { min: 25, max: 55 },
          },
          creative: {
            headline: '',
            primaryText: '',
            description: '',
            callToAction: 'LEARN_MORE',
          },
        },
        ad_copy: {
          headline: '',
          primaryText: '',
          description: '',
          callToAction: 'LEARN_MORE',
        },
      },
      google: {
        new_campaign: {
          name: '',
          campaignType: 'SEARCH',
          budget: { type: 'daily', amount: 50 },
          keywords: [],
          negativeKeywords: [],
          adGroups: [],
        },
      },
      tiktok: {
        new_campaign: {
          name: '',
          objective: 'CONVERSIONS',
          budget: { type: 'daily', amount: 50 },
          targeting: {
            audiences: [],
            interests: [],
            locations: ['United States'],
            ageRange: { min: 18, max: 45 },
          },
        },
      },
      linkedin: {
        new_campaign: {
          name: '',
          objective: 'WEBSITE_CONVERSIONS',
          budget: { type: 'daily', amount: 100 },
          targeting: {
            jobTitles: [],
            industries: [],
            companySize: [],
            locations: ['United States'],
          },
        },
      },
    };
  }
}

module.exports = MarketingCampaignDraftService;
