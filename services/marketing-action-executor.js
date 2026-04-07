// services/marketing-action-executor.js
/**
 * Marketing Action Executor Service
 *
 * Executes approved marketing actions via platform APIs.
 * Captures before-state for rollback and logs all executions.
 */

const MetaAdsApi = require('./meta-ads-api');
const GoogleAdsApi = require('./google-ads-api');
const KlaviyoAdsService = require('./klaviyo-ads-service');
const TikTokAdsApi = require('./tiktok-ads-api');
const LinkedInAdsApi = require('./linkedin-ads-api');
const { logger } = require('../utils/logger');

class MarketingActionExecutor {
  constructor(pool) {
    this.pool = pool;
    this.metaApi = new MetaAdsApi();
    this.googleApi = new GoogleAdsApi();
    this.klaviyoApi = new KlaviyoAdsService();
    this.tiktokApi = new TikTokAdsApi();
    this.linkedinApi = new LinkedInAdsApi();
  }

  /**
   * Execute an approved action
   * @param {number} actionId - The pending action ID
   * @returns {Promise<Object>} Execution result
   */
  async executeAction(actionId) {
    // Fetch the pending action
    const actionResult = await this.pool.query(
      `SELECT * FROM marketing_pending_actions WHERE id = $1`,
      [actionId]
    );

    if (actionResult.rows.length === 0) {
      throw new Error(`Action ${actionId} not found`);
    }

    const action = actionResult.rows[0];

    // Verify action is approved
    if (action.status !== 'approved') {
      throw new Error(`Action ${actionId} is not approved (status: ${action.status})`);
    }

    let beforeState = null;
    let afterState = null;
    let success = false;
    let errorMessage = null;

    try {
      // Capture before-state
      beforeState = await this.captureBeforeState(action);

      // Execute the action
      const result = await this.routeAndExecute(action);

      // Capture after-state
      afterState = await this.captureAfterState(action);

      // Update action status to executed
      await this.pool.query(
        `UPDATE marketing_pending_actions
         SET status = 'executed',
             executed_at = NOW(),
             execution_result = $2
         WHERE id = $1`,
        [actionId, JSON.stringify(result)]
      );

      success = true;

      // Log the execution
      await this.logExecution(action, beforeState, afterState, true, null);

      return {
        success: true,
        actionId,
        result,
        beforeState,
        afterState,
      };
    } catch (error) {
      errorMessage = error.message;
      logger.error({ err: error }, `Error executing action ${actionId}:`);

      // Update action status to failed
      await this.pool.query(
        `UPDATE marketing_pending_actions
         SET status = 'failed',
             execution_result = $2
         WHERE id = $1`,
        [actionId, JSON.stringify({ error: errorMessage })]
      );

      // Log the failed execution
      await this.logExecution(action, beforeState, null, false, errorMessage);

      throw error;
    }
  }

  /**
   * Route action to appropriate platform API
   */
  async routeAndExecute(action) {
    const platform = action.platform?.toLowerCase();
    const actionType = action.action_type;
    const targetId = action.target_id;
    const payload = action.action_payload || {};

    // Handle CREATE_CAMPAIGN_DRAFT specially - it creates a draft rather than executing API calls
    if (actionType === 'CREATE_CAMPAIGN_DRAFT') {
      return this.createCampaignDraft(action, platform, payload);
    }

    // Handle UPDATE_AD_COPY, MODIFY_TARGETING, and ADJUST_BUDGET - these create drafts for review
    if (actionType === 'UPDATE_AD_COPY' || actionType === 'MODIFY_TARGETING' || actionType === 'ADJUST_BUDGET') {
      return this.createOptimizationDraft(action, platform, payload);
    }

    switch (platform) {
      case 'meta':
        return this.executeMetaAction(actionType, targetId, payload);
      case 'google':
        return this.executeGoogleAction(actionType, targetId, payload);
      case 'klaviyo':
        return this.executeKlaviyoAction(actionType, targetId, payload);
      case 'tiktok':
        return this.executeTikTokAction(actionType, targetId, payload);
      case 'linkedin':
        return this.executeLinkedInAction(actionType, targetId, payload);
      default:
        throw new Error(`Unsupported platform: ${platform}`);
    }
  }

  /**
   * Create a campaign draft in the marketing_campaign_drafts table
   */
  async createCampaignDraft(action, platform, payload) {
    const draftName = action.target_name || payload.name || 'New Campaign Draft';
    const draftData = {
      name: draftName,
      campaignObjective: payload.objective || 'CONVERSIONS',
      targeting: payload.targeting || {},
      budget: payload.budget || {},
      adCreative: payload.adCreative || {},
      schedule: payload.schedule || {},
      sourceActionId: action.id,
      projectedImpact: {
        estimated_cpl: payload.estimated_cpl || null,
        estimated_roas: payload.estimated_roas || null,
        estimated_reach: payload.estimated_reach || null,
        confidence: payload.confidence || 'medium',
      },
    };

    const result = await this.pool.query(`
      INSERT INTO marketing_campaign_drafts (
        name, platform, campaign_type, status, draft_data, ai_reasoning
      ) VALUES ($1, $2, 'new_campaign', 'draft', $3, $4)
      RETURNING *
    `, [
      draftName,
      platform,
      JSON.stringify(draftData),
      action.ai_reasoning,
    ]);

    return {
      type: 'draft_created',
      draftId: result.rows[0].id,
      draft: result.rows[0],
      message: `Campaign draft "${draftName}" created for ${platform}. Review in Draft Queue.`,
    };
  }

  /**
   * Create an optimization draft (ad copy changes, targeting changes)
   */
  async createOptimizationDraft(action, platform, payload) {
    const actionTypeMap = {
      'UPDATE_AD_COPY': 'ad_copy',
      'MODIFY_TARGETING': 'targeting',
      'ADJUST_BUDGET': 'budget',
    };
    const draftType = actionTypeMap[action.action_type] || 'targeting';

    const draftName = `${draftType === 'ad_copy' ? 'Copy Update' : draftType === 'budget' ? 'Budget Change' : 'Targeting Update'}: ${action.target_name || action.target_id}`;

    const draftData = {
      type: draftType,
      targetCampaignId: action.target_id,
      targetCampaignName: action.target_name,
      changes: payload,
      sourceActionId: action.id,
      projectedImpact: {
        estimated_improvement: payload.estimated_improvement || null,
        metric: payload.improvement_metric || null,
        confidence: payload.confidence || 'medium',
      },
    };

    const result = await this.pool.query(`
      INSERT INTO marketing_campaign_drafts (
        name, platform, campaign_type, status, draft_data, ai_reasoning
      ) VALUES ($1, $2, $3, 'draft', $4, $5)
      RETURNING *
    `, [
      draftName,
      platform,
      draftType,
      JSON.stringify(draftData),
      action.ai_reasoning,
    ]);

    return {
      type: 'draft_created',
      draftType,
      draftId: result.rows[0].id,
      draft: result.rows[0],
      message: `${draftType === 'ad_copy' ? 'Ad copy' : draftType === 'budget' ? 'Budget' : 'Targeting'} optimization draft created. Review in Draft Queue.`,
    };
  }

  /**
   * Execute Meta Ads action
   */
  async executeMetaAction(actionType, targetId, payload) {
    switch (actionType) {
      case 'PAUSE_CAMPAIGN':
        return this.metaApi.updateCampaignStatus(targetId, 'PAUSED');

      case 'RESUME_CAMPAIGN':
        return this.metaApi.updateCampaignStatus(targetId, 'ACTIVE');

      case 'ADJUST_BUDGET':
        const budgetParams = {};
        if (payload.dailyBudget) {
          budgetParams.dailyBudget = payload.dailyBudget;
        }
        if (payload.lifetimeBudget) {
          budgetParams.lifetimeBudget = payload.lifetimeBudget;
        }
        return this.metaApi.updateCampaignBudget(targetId, budgetParams);

      case 'PAUSE_ADSET':
        return this.metaApi.updateAdSetStatus(targetId, 'PAUSED');

      case 'RESUME_ADSET':
        return this.metaApi.updateAdSetStatus(targetId, 'ACTIVE');

      default:
        throw new Error(`Unsupported Meta action type: ${actionType}`);
    }
  }

  /**
   * Execute Google Ads action
   */
  async executeGoogleAction(actionType, targetId, payload) {
    switch (actionType) {
      case 'PAUSE_CAMPAIGN':
        return this.googleApi.updateCampaignStatus(targetId, 'PAUSED');

      case 'RESUME_CAMPAIGN':
        return this.googleApi.updateCampaignStatus(targetId, 'ENABLED');

      case 'ADJUST_BUDGET': {
        // Extract budget from payload - support multiple formats
        const dailyBudget = payload.dailyBudget || payload.budget || payload.newBudget;
        if (!dailyBudget) {
          throw new Error('ADJUST_BUDGET requires dailyBudget in payload');
        }
        // Parse budget value (handle "$60/day" format)
        const budgetValue = typeof dailyBudget === 'string'
          ? parseFloat(dailyBudget.replace(/[^0-9.]/g, ''))
          : dailyBudget;
        return this.googleApi.updateCampaignBudget(targetId, budgetValue);
      }

      default:
        throw new Error(`Unsupported Google action type: ${actionType}`);
    }
  }

  /**
   * Execute Klaviyo action
   */
  async executeKlaviyoAction(actionType, targetId, payload) {
    switch (actionType) {
      case 'CANCEL_CAMPAIGN':
        return this.klaviyoApi.cancelCampaign(targetId);

      default:
        throw new Error(`Unsupported Klaviyo action type: ${actionType}`);
    }
  }

  /**
   * Execute TikTok action
   */
  async executeTikTokAction(actionType, targetId, payload) {
    switch (actionType) {
      case 'PAUSE_CAMPAIGN':
        return this.tiktokApi.updateCampaignStatus(targetId, 'DISABLE');

      case 'RESUME_CAMPAIGN':
        return this.tiktokApi.updateCampaignStatus(targetId, 'ENABLE');

      case 'ADJUST_BUDGET':
        return this.tiktokApi.updateCampaignBudget(targetId, {
          budget: payload.budget || payload.dailyBudget,
          budgetMode: payload.budgetMode || 'BUDGET_MODE_DAY',
        });

      case 'PAUSE_ADGROUP':
        return this.tiktokApi.updateAdGroupStatus(targetId, 'DISABLE');

      case 'RESUME_ADGROUP':
        return this.tiktokApi.updateAdGroupStatus(targetId, 'ENABLE');

      default:
        throw new Error(`Unsupported TikTok action type: ${actionType}`);
    }
  }

  /**
   * Execute LinkedIn action
   */
  async executeLinkedInAction(actionType, targetId, payload) {
    switch (actionType) {
      case 'PAUSE_CAMPAIGN':
        return this.linkedinApi.updateCampaignStatus(targetId, 'PAUSED');

      case 'RESUME_CAMPAIGN':
        return this.linkedinApi.updateCampaignStatus(targetId, 'ACTIVE');

      case 'ADJUST_BUDGET':
        return this.linkedinApi.updateCampaignBudget(targetId, {
          dailyBudget: payload.dailyBudget,
          totalBudget: payload.totalBudget,
        });

      default:
        throw new Error(`Unsupported LinkedIn action type: ${actionType}`);
    }
  }

  /**
   * Capture state before execution for rollback
   */
  async captureBeforeState(action) {
    const platform = action.platform?.toLowerCase();
    const targetId = action.target_id;

    try {
      switch (platform) {
        case 'meta':
          return this.captureMetaState(targetId);
        case 'google':
          return this.captureGoogleState(targetId);
        case 'klaviyo':
          return this.captureKlaviyoState(targetId);
        case 'tiktok':
          return this.captureTikTokState(targetId);
        case 'linkedin':
          return this.captureLinkedInState(targetId);
        default:
          return null;
      }
    } catch (error) {
      logger.warn({ data: error.message }, `Could not capture before-state for ${platform}/${targetId}:`);
      return null;
    }
  }

  /**
   * Capture state after execution
   */
  async captureAfterState(action) {
    // Same as before-state capture
    return this.captureBeforeState(action);
  }

  /**
   * Capture Meta campaign/ad set state
   */
  async captureMetaState(targetId) {
    try {
      // Try to get campaign details
      const campaigns = await this.metaApi.getCampaignsList({ limit: 100 });
      const campaign = campaigns.find(c => c.id === targetId);

      if (campaign) {
        return {
          type: 'campaign',
          id: campaign.id,
          name: campaign.name,
          status: campaign.status,
          dailyBudget: campaign.dailyBudget,
          lifetimeBudget: campaign.lifetimeBudget,
        };
      }

      // If not a campaign, might be an ad set
      // For now, return basic info
      return {
        type: 'unknown',
        id: targetId,
      };
    } catch (error) {
      logger.warn({ data: error.message }, 'Could not capture Meta state:');
      return { id: targetId, error: error.message };
    }
  }

  /**
   * Capture Google campaign state
   */
  async captureGoogleState(targetId) {
    try {
      const campaigns = await this.googleApi.getCampaignsList();
      const campaign = campaigns.find(c => c.id === targetId || c.resourceName?.includes(targetId));

      if (campaign) {
        return {
          type: 'campaign',
          id: campaign.id,
          resourceName: campaign.resourceName,
          name: campaign.name,
          status: campaign.status,
        };
      }

      return { id: targetId };
    } catch (error) {
      logger.warn({ data: error.message }, 'Could not capture Google state:');
      return { id: targetId, error: error.message };
    }
  }

  /**
   * Capture Klaviyo campaign state
   */
  async captureKlaviyoState(targetId) {
    try {
      const campaign = await this.klaviyoApi.getCampaignDetails(targetId);
      return {
        type: 'campaign',
        id: campaign.id,
        name: campaign.attributes?.name,
        status: campaign.attributes?.status,
      };
    } catch (error) {
      logger.warn({ data: error.message }, 'Could not capture Klaviyo state:');
      return { id: targetId, error: error.message };
    }
  }

  /**
   * Capture TikTok campaign state
   */
  async captureTikTokState(targetId) {
    try {
      const campaign = await this.tiktokApi.getCampaignDetails(targetId);
      return {
        type: 'campaign',
        id: campaign.campaign_id,
        name: campaign.campaign_name,
        status: campaign.operation_status,
        budget: campaign.budget,
        budgetMode: campaign.budget_mode,
      };
    } catch (error) {
      logger.warn({ data: error.message }, 'Could not capture TikTok state:');
      return { id: targetId, error: error.message };
    }
  }

  /**
   * Capture LinkedIn campaign state
   */
  async captureLinkedInState(targetId) {
    try {
      const campaign = await this.linkedinApi.getCampaignDetails(targetId);
      return {
        type: 'campaign',
        id: targetId,
        name: campaign.name,
        status: campaign.status,
        dailyBudget: campaign.dailyBudget?.amount,
        totalBudget: campaign.totalBudget?.amount,
      };
    } catch (error) {
      logger.warn({ data: error.message }, 'Could not capture LinkedIn state:');
      return { id: targetId, error: error.message };
    }
  }

  /**
   * Log execution to audit table
   */
  async logExecution(action, beforeState, afterState, success, errorMessage) {
    try {
      await this.pool.query(
        `INSERT INTO marketing_action_log (
          pending_action_id, action_type, platform,
          before_state, after_state,
          executed_by, executed_at, success, error_message
        ) VALUES ($1, $2, $3, $4, $5, $6, NOW(), $7, $8)`,
        [
          action.id,
          action.action_type,
          action.platform,
          beforeState ? JSON.stringify(beforeState) : null,
          afterState ? JSON.stringify(afterState) : null,
          action.approved_by,
          success,
          errorMessage,
        ]
      );
    } catch (error) {
      logger.error({ err: error }, 'Error logging action execution:');
      // Don't throw - logging failure shouldn't fail the action
    }
  }

  /**
   * Attempt to rollback an executed action
   * @param {number} actionId - The executed action ID
   * @returns {Promise<Object>} Rollback result
   */
  async rollbackAction(actionId) {
    // Fetch the action and its log entry
    const actionResult = await this.pool.query(
      `SELECT pa.*, mal.before_state
       FROM marketing_pending_actions pa
       LEFT JOIN marketing_action_log mal ON mal.pending_action_id = pa.id
       WHERE pa.id = $1`,
      [actionId]
    );

    if (actionResult.rows.length === 0) {
      throw new Error(`Action ${actionId} not found`);
    }

    const action = actionResult.rows[0];
    const beforeState = action.before_state;

    if (!beforeState) {
      throw new Error(`No before-state available for rollback of action ${actionId}`);
    }

    if (action.status !== 'executed') {
      throw new Error(`Action ${actionId} is not in executed status (status: ${action.status})`);
    }

    // Attempt to restore previous state
    const platform = action.platform?.toLowerCase();
    const targetId = action.target_id;

    try {
      let result;

      switch (platform) {
        case 'meta':
          result = await this.rollbackMetaAction(action.action_type, targetId, beforeState);
          break;
        case 'google':
          result = await this.rollbackGoogleAction(action.action_type, targetId, beforeState);
          break;
        default:
          throw new Error(`Rollback not supported for platform: ${platform}`);
      }

      // Update action status
      await this.pool.query(
        `UPDATE marketing_pending_actions
         SET status = 'rolled_back',
             execution_result = $2
         WHERE id = $1`,
        [actionId, JSON.stringify({ rollback: true, result })]
      );

      return {
        success: true,
        actionId,
        result,
      };
    } catch (error) {
      logger.error({ err: error }, `Error rolling back action ${actionId}:`);
      throw error;
    }
  }

  /**
   * Rollback Meta action
   */
  async rollbackMetaAction(actionType, targetId, beforeState) {
    switch (actionType) {
      case 'PAUSE_CAMPAIGN':
      case 'RESUME_CAMPAIGN':
        // Restore previous status
        if (beforeState.status) {
          return this.metaApi.updateCampaignStatus(targetId, beforeState.status);
        }
        throw new Error('No previous status available for rollback');

      case 'ADJUST_BUDGET':
        // Restore previous budget
        const budgetParams = {};
        if (beforeState.dailyBudget) {
          budgetParams.dailyBudget = beforeState.dailyBudget;
        }
        if (beforeState.lifetimeBudget) {
          budgetParams.lifetimeBudget = beforeState.lifetimeBudget;
        }
        if (Object.keys(budgetParams).length === 0) {
          throw new Error('No previous budget available for rollback');
        }
        return this.metaApi.updateCampaignBudget(targetId, budgetParams);

      default:
        throw new Error(`Rollback not supported for action type: ${actionType}`);
    }
  }

  /**
   * Rollback Google action
   */
  async rollbackGoogleAction(actionType, targetId, beforeState) {
    switch (actionType) {
      case 'PAUSE_CAMPAIGN':
      case 'RESUME_CAMPAIGN':
        if (beforeState.status) {
          return this.googleApi.updateCampaignStatus(targetId, beforeState.status);
        }
        throw new Error('No previous status available for rollback');

      default:
        throw new Error(`Rollback not supported for action type: ${actionType}`);
    }
  }

  /**
   * Get execution history for an action
   */
  async getExecutionHistory(actionId) {
    const result = await this.pool.query(
      `SELECT * FROM marketing_action_log
       WHERE pending_action_id = $1
       ORDER BY executed_at DESC`,
      [actionId]
    );
    return result.rows;
  }

  /**
   * Get all recent executions
   */
  async getRecentExecutions(limit = 50) {
    const result = await this.pool.query(
      `SELECT mal.*, mpa.target_name, mpa.ai_reasoning
       FROM marketing_action_log mal
       JOIN marketing_pending_actions mpa ON mpa.id = mal.pending_action_id
       ORDER BY mal.executed_at DESC
       LIMIT $1`,
      [limit]
    );
    return result.rows;
  }
}

module.exports = MarketingActionExecutor;
