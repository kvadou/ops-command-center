/**
 * Marketing Command Service
 *
 * AI-powered marketing advisor using Claude Sonnet 4.
 * Orchestrates chat interactions, manages conversations,
 * and parses action recommendations from AI responses.
 *
 * Features:
 * - Marketing-specific system prompt with real-time data
 * - Action recommendation parsing and pending action creation
 * - Conversation history management
 * - Weekly budget controls
 */

const axios = require('axios');
const { logger } = require('../utils/logger');
const MarketingDataAggregator = require('./marketing-data-aggregator');

// Claude API pricing (as of Jan 2026)
const CLAUDE_PRICING = {
  'claude-sonnet-4-20250514': {
    input_per_1k: 0.003,
    output_per_1k: 0.015,
  },
};

const DEFAULT_MODEL = 'claude-sonnet-4-20250514';
const WEEKLY_BUDGET_CENTS = 5000; // $50/week

// Marketing Command Center System Prompt
const MARKETING_SYSTEM_PROMPT = `You are the Marketing Command Center AI for Acme Operations - an expert marketing advisor with deep knowledge of digital advertising, conversion optimization, and chess education marketing.

## Your Role
You are a strategic marketing advisor who:
- Analyzes marketing performance data and identifies opportunities
- Provides actionable recommendations backed by data
- Suggests campaign optimizations with clear reasoning
- Helps plan budget allocation and restart strategies
- Understands the chess education market and parent decision-making
- Models budget scenarios to predict outcomes

## Your Personality
- Data-driven but accessible - explain metrics in plain terms
- Strategic and proactive - don't just report, recommend
- Honest about limitations and uncertainties
- Concise but thorough - respect the user's time

## Response Format
Your responses are rendered as markdown, so use proper markdown syntax:
- **Use bullet points** with "- " prefix for lists
- **Use headings** with "##" or "###" for sections
- **Bold important items** with **double asterisks**
- Use numbered lists (1. 2. 3.) for sequential steps
- Keep responses scannable with clear visual hierarchy

## Advanced Capabilities

### Live Ad Platform Data Access
You have REAL-TIME access to Google Ads and Meta Ads account data via their APIs. When users ask about campaigns, account structure, or optimization:
- You can see ALL campaigns (active and paused) with their exact names and IDs
- You can see current status, daily budgets, and campaign types
- You can see 30-day performance metrics (spend, clicks, conversions, CTR, CPC)
- Use the exact campaign IDs when recommending actions

When live campaign data is provided, reference the specific campaign names and IDs in your recommendations. This data is fetched in real-time from the ad platforms.

### Budget Scenario Modeling
When asked about "what if we spend $X" or budget planning, use the provided scenario projections to give data-driven predictions:
- Expected leads based on historical CPL
- Expected registrations based on historical CPR
- Expected revenue and ROAS
- Confidence ranges (typically ±20%)

Always clarify these are projections based on historical data and actual results may vary.

### Cohort-Based Recommendations
Use retention data to suggest:
- Targeting adjustments based on which cohorts retain best
- Budget allocation toward higher-LTV audiences
- Timing recommendations based on conversion patterns

### A/B Test Suggestions
When recommending optimizations, suggest specific A/B tests:
- Ad copy variations to test
- Audience segment tests
- Landing page tests
- Budget allocation tests

## Action Recommendations
When you recommend an action that can be executed, format it as:
\`[ACTION: ACTION_TYPE | platform | target_id | target_name | brief_reasoning]\`

Available action types:
- PAUSE_CAMPAIGN - Pause a campaign that's underperforming
- RESUME_CAMPAIGN - Resume a paused campaign
- ADJUST_BUDGET - Change campaign budget (MUST include dollar amount like "$50/day" in reasoning)
- CREATE_CAMPAIGN_DRAFT - Suggest a new campaign structure
- MODIFY_TARGETING - Suggest targeting changes
- UPDATE_AD_COPY - Suggest ad copy changes (draft only)

Examples:
\`[ACTION: PAUSE_CAMPAIGN | meta | 123456789 | Summer Chess Campaign | Poor ROAS of 0.3x with $500 spent]\`
\`[ACTION: ADJUST_BUDGET | google | 987654321 | NYC Chess Search | Increase from $30/day to $50/day based on strong 3.2x ROAS]\`

CRITICAL: All actions require explicit user approval before execution. Never imply actions will happen automatically.

## Quick Links Reference
When discussing campaigns, you can reference these Ads Manager links:
- Meta Ads Manager: https://adsmanager.facebook.com
- Google Ads: https://ads.google.com
- Klaviyo: https://www.klaviyo.com/campaigns

## Safety Rules
1. Never auto-execute actions - all require explicit user approval
2. Explain reasoning for every recommendation
3. Acknowledge budget constraints (marketing is currently paused)
4. Provide restart strategies when budget returns
5. Be conservative with budget recommendations
6. Flag risks clearly when suggesting changes
7. Clearly label projections as estimates with confidence ranges

## Guidelines
1. **Be Specific**: Reference actual campaign names and metrics
2. **Prioritize**: Focus on highest-impact opportunities first
3. **Contextualize**: Consider seasonality and chess education cycles
4. **Quantify**: Include expected impact when possible
5. **Be Realistic**: Acknowledge when data is insufficient
6. **Suggest Tests**: Recommend A/B tests when uncertain about changes`;

// Action type patterns for parsing
const ACTION_PATTERNS = [
  'PAUSE_CAMPAIGN',
  'RESUME_CAMPAIGN',
  'ADJUST_BUDGET',
  'CREATE_CAMPAIGN_DRAFT',
  'MODIFY_TARGETING',
  'UPDATE_AD_COPY',
];

class MarketingCommandService {
  constructor(pool) {
    this.pool = pool;
    this.apiKey = process.env.ANTHROPIC_API_KEY;
    this.weeklyBudgetCents = parseInt(process.env.MARKETING_COMMAND_BUDGET_CENTS || WEEKLY_BUDGET_CENTS);
    this.dataAggregator = new MarketingDataAggregator(pool);
  }

  /**
   * Check if service is available
   */
  isAvailable() {
    return !!this.apiKey;
  }

  /**
   * Get current week's AI spend for marketing command
   */
  async getCurrentWeekSpend() {
    try {
      const result = await this.pool.query(`
        SELECT COALESCE(SUM(
          CASE WHEN metadata->>'cost' IS NOT NULL
               THEN (metadata->>'cost')::numeric
               ELSE 0.05
          END
        ), 0) as total_spend
        FROM marketing_messages
        WHERE role = 'assistant'
          AND created_at >= date_trunc('week', NOW())
      `);
      return parseFloat(result.rows[0].total_spend || 0);
    } catch (error) {
      logger.warn({ error: error.message }, 'Failed to get marketing command spend');
      return 0;
    }
  }

  /**
   * Check if budget allows new request
   */
  async canMakeRequest(estimatedCost = 0.05) {
    const currentSpend = await this.getCurrentWeekSpend();
    const budgetDollars = this.weeklyBudgetCents / 100;
    return (currentSpend + estimatedCost) <= budgetDollars;
  }

  /**
   * Calculate cost from token counts
   */
  calculateCost(inputTokens, outputTokens, model = DEFAULT_MODEL) {
    const pricing = CLAUDE_PRICING[model] || CLAUDE_PRICING[DEFAULT_MODEL];
    const inputCost = (inputTokens / 1000) * pricing.input_per_1k;
    const outputCost = (outputTokens / 1000) * pricing.output_per_1k;
    return inputCost + outputCost;
  }

  /**
   * Get conversation history
   */
  async getConversationHistory(conversationId, limit = 10) {
    try {
      const result = await this.pool.query(`
        SELECT role, content, created_at
        FROM marketing_messages
        WHERE conversation_id = $1
        ORDER BY created_at DESC
        LIMIT $2
      `, [conversationId, limit]);

      return result.rows.reverse();
    } catch (error) {
      logger.warn({ error: error.message }, 'Failed to get conversation history');
      return [];
    }
  }

  /**
   * Create a new conversation
   */
  async createConversation(userId, userEmail) {
    try {
      const result = await this.pool.query(`
        INSERT INTO marketing_conversations (user_id, user_email, title)
        VALUES ($1, $2, 'New Marketing Conversation')
        RETURNING id
      `, [userId, userEmail]);

      return result.rows[0].id;
    } catch (error) {
      logger.error({ error: error.message }, 'Failed to create conversation');
      throw error;
    }
  }

  /**
   * Update conversation title based on first message
   */
  async updateConversationTitle(conversationId, firstMessage) {
    try {
      // Generate a short title from the first message
      const title = firstMessage.length > 50
        ? firstMessage.substring(0, 47) + '...'
        : firstMessage;

      await this.pool.query(`
        UPDATE marketing_conversations
        SET title = $1, updated_at = NOW()
        WHERE id = $2
      `, [title, conversationId]);
    } catch (error) {
      logger.warn({ error: error.message }, 'Failed to update conversation title');
    }
  }

  /**
   * Save a message to conversation
   */
  async saveMessage(conversationId, role, content, metadata = {}) {
    try {
      const result = await this.pool.query(`
        INSERT INTO marketing_messages (conversation_id, role, content, metadata)
        VALUES ($1, $2, $3, $4)
        RETURNING id, created_at
      `, [conversationId, role, content, JSON.stringify(metadata)]);

      // Update conversation timestamp
      await this.pool.query(`
        UPDATE marketing_conversations SET updated_at = NOW() WHERE id = $1
      `, [conversationId]);

      return result.rows[0];
    } catch (error) {
      logger.error({ error: error.message }, 'Failed to save message');
      throw error;
    }
  }

  /**
   * Parse actions from AI response
   */
  parseActions(responseText) {
    const actions = [];
    const actionRegex = /\[ACTION:\s*(\w+)\s*\|\s*([^|]+)\s*\|\s*([^|]+)\s*\|\s*([^|]+)\s*\|\s*([^\]]+)\]/g;

    let match;
    while ((match = actionRegex.exec(responseText)) !== null) {
      const [, actionType, platform, targetId, targetName, reasoning] = match;

      if (ACTION_PATTERNS.includes(actionType.trim())) {
        const action = {
          action_type: actionType.trim(),
          platform: platform.trim().toLowerCase(),
          target_id: targetId.trim(),
          target_name: targetName.trim(),
          ai_reasoning: reasoning.trim(),
          action_payload: {},
        };

        // Extract structured payload data from reasoning
        if (action.action_type === 'ADJUST_BUDGET') {
          action.action_payload = this.extractBudgetPayload(reasoning);
        }

        actions.push(action);
      }
    }

    return actions;
  }

  /**
   * Extract budget amount from AI reasoning text
   * Looks for patterns like "$50/day", "$100 daily", "budget to $75", etc.
   */
  extractBudgetPayload(reasoning) {
    const payload = {};

    // Match patterns: $50/day, $50 per day, $50 daily, budget to $50, budget of $50
    const budgetMatch = reasoning.match(/\$(\d+(?:\.\d{1,2})?)\s*(?:\/day|per day|daily|\/d)/i)
      || reasoning.match(/budget\s+(?:to|of|at)\s+\$(\d+(?:\.\d{1,2})?)/i)
      || reasoning.match(/\$(\d+(?:\.\d{1,2})?)\s*(?:budget|spend)/i)
      || reasoning.match(/\$(\d+(?:\.\d{1,2})?)/);

    if (budgetMatch) {
      payload.dailyBudget = parseFloat(budgetMatch[1]);
    }

    return payload;
  }

  /**
   * Create pending actions from parsed recommendations
   */
  async createPendingActions(conversationId, messageId, actions) {
    const createdActions = [];

    for (const action of actions) {
      try {
        const result = await this.pool.query(`
          INSERT INTO marketing_pending_actions
            (conversation_id, message_id, action_type, platform, target_id, target_name, action_payload, ai_reasoning, status)
          VALUES ($1, $2, $3, $4, $5, $6, $7, $8, 'pending')
          RETURNING id
        `, [
          conversationId,
          messageId,
          action.action_type,
          action.platform,
          action.target_id,
          action.target_name,
          JSON.stringify(action.action_payload || {}),
          action.ai_reasoning,
        ]);

        createdActions.push({
          id: result.rows[0].id,
          ...action,
          status: 'pending',
        });
      } catch (error) {
        logger.error({ error: error.message, action }, 'Failed to create pending action');
      }
    }

    return createdActions;
  }

  /**
   * Make API call to Claude
   */
  async callClaude(systemPrompt, messages, model = DEFAULT_MODEL, retryCount = 0) {
    if (!this.apiKey) {
      throw new Error('ANTHROPIC_API_KEY not configured');
    }

    const MAX_RETRIES = 2;
    const RETRY_DELAYS = [1000, 3000]; // 1s, 3s

    try {
      const response = await axios.post('https://api.anthropic.com/v1/messages', {
        model,
        max_tokens: 2000,
        system: systemPrompt,
        messages,
      }, {
        headers: {
          'x-api-key': this.apiKey,
          'anthropic-version': '2023-06-01',
          'content-type': 'application/json',
        },
        timeout: 25000, // 25s to stay under Heroku's 30s limit
      });

      const { content, usage } = response.data;
      const text = content[0]?.text || '';

      return {
        text,
        inputTokens: usage.input_tokens,
        outputTokens: usage.output_tokens,
        model,
      };
    } catch (error) {
      const status = error.response?.status;
      const isRetryable = status === 503 || status === 529 || status === 500 || error.code === 'ECONNRESET';

      logger.error({
        error: error.message,
        status,
        data: error.response?.data,
        retryCount,
        isRetryable,
      }, 'Claude API call failed for marketing command');

      // Retry on transient errors
      if (isRetryable && retryCount < MAX_RETRIES) {
        const delay = RETRY_DELAYS[retryCount] || 3000;
        logger.info({ retryCount: retryCount + 1, delay }, 'Retrying Claude API call');
        await new Promise(resolve => setTimeout(resolve, delay));
        return this.callClaude(systemPrompt, messages, model, retryCount + 1);
      }

      // Create a more descriptive error for common issues
      if (status === 503 || status === 529) {
        const apiError = new Error('The AI service is temporarily overloaded. Please try again in a moment.');
        apiError.isTransient = true;
        apiError.originalStatus = status;
        throw apiError;
      }

      throw error;
    }
  }

  /**
   * Main chat method
   */
  async chat({
    conversationId,
    userMessage,
    userId,
    userEmail,
  }) {
    // Check service availability
    if (!this.isAvailable()) {
      return {
        success: false,
        error: 'Marketing Command Center is not configured. Please contact support.',
        fallback: true,
      };
    }

    // Check budget
    if (!await this.canMakeRequest(0.05)) {
      return {
        success: false,
        error: 'Marketing Command Center is temporarily unavailable. Please try again later.',
        budgetExceeded: true,
      };
    }

    try {
      // Create conversation if needed
      let convId = conversationId;
      let isNewConversation = false;

      if (!convId) {
        convId = await this.createConversation(userId, userEmail);
        isNewConversation = true;
      }

      // Save user message
      await this.saveMessage(convId, 'user', userMessage);

      // Update title if new conversation
      if (isNewConversation) {
        await this.updateConversationTitle(convId, userMessage);
      }

      // Build enhanced marketing context (includes scenario modeling if relevant)
      const marketingContext = await this.buildEnhancedContext(userMessage);

      // Build system prompt with real-time data
      const systemPromptWithContext = `${MARKETING_SYSTEM_PROMPT}

## Current Marketing Data
${marketingContext}`;

      // Get conversation history
      const history = await this.getConversationHistory(convId, 10);

      // Build messages array
      const messages = history.map(msg => ({
        role: msg.role,
        content: msg.content,
      }));

      // Add current message if not already in history
      if (messages.length === 0 || messages[messages.length - 1].content !== userMessage) {
        messages.push({
          role: 'user',
          content: userMessage,
        });
      }

      // Call Claude
      const result = await this.callClaude(systemPromptWithContext, messages);

      // Calculate cost
      const cost = this.calculateCost(result.inputTokens, result.outputTokens, result.model);

      // Parse actions from response
      const parsedActions = this.parseActions(result.text);

      // Save assistant message
      const savedMessage = await this.saveMessage(convId, 'assistant', result.text, {
        model: result.model,
        inputTokens: result.inputTokens,
        outputTokens: result.outputTokens,
        cost,
        actionCount: parsedActions.length,
      });

      // Create pending actions if any
      let pendingActions = [];
      if (parsedActions.length > 0) {
        pendingActions = await this.createPendingActions(convId, savedMessage.id, parsedActions);
      }

      return {
        success: true,
        response: result.text,
        conversation_id: convId,
        pendingActions,
        metadata: {
          model: result.model,
          inputTokens: result.inputTokens,
          outputTokens: result.outputTokens,
          cost,
          actionCount: parsedActions.length,
        },
      };
    } catch (error) {
      logger.error({
        error: error.message,
        conversationId,
        userId,
        isTransient: error.isTransient,
      }, 'Marketing command chat failed');

      // Provide helpful message for transient errors
      if (error.isTransient) {
        return {
          success: false,
          error: error.message,
          isTransient: true,
          retryAfter: 5, // Suggest retry after 5 seconds
        };
      }

      return {
        success: false,
        error: 'I encountered an issue processing your request. Please try again.',
        technicalError: error.message,
      };
    }
  }

  /**
   * Get list of user's conversations
   */
  async getConversations(userId, userEmail, limit = 20) {
    try {
      const result = await this.pool.query(`
        SELECT
          c.id,
          c.title,
          c.created_at,
          c.updated_at,
          (SELECT COUNT(*) FROM marketing_messages WHERE conversation_id = c.id) as message_count
        FROM marketing_conversations c
        WHERE c.user_id = $1 OR c.user_email = $2
        ORDER BY c.updated_at DESC
        LIMIT $3
      `, [userId, userEmail, limit]);

      return result.rows;
    } catch (error) {
      logger.error({ error: error.message }, 'Failed to get conversations');
      return [];
    }
  }

  /**
   * Get a single conversation with messages
   */
  async getConversation(conversationId) {
    try {
      const conversationResult = await this.pool.query(`
        SELECT id, title, user_id, user_email, created_at, updated_at
        FROM marketing_conversations
        WHERE id = $1
      `, [conversationId]);

      if (conversationResult.rows.length === 0) {
        return null;
      }

      const messagesResult = await this.pool.query(`
        SELECT id, role, content, metadata, created_at
        FROM marketing_messages
        WHERE conversation_id = $1
        ORDER BY created_at ASC
      `, [conversationId]);

      return {
        ...conversationResult.rows[0],
        messages: messagesResult.rows,
      };
    } catch (error) {
      logger.error({ error: error.message }, 'Failed to get conversation');
      return null;
    }
  }

  /**
   * Get pending actions for approval
   */
  async getPendingActions(status = 'pending') {
    try {
      const result = await this.pool.query(`
        SELECT
          pa.*,
          c.title as conversation_title
        FROM marketing_pending_actions pa
        LEFT JOIN marketing_conversations c ON pa.conversation_id = c.id
        WHERE pa.status = $1
          AND (pa.expires_at IS NULL OR pa.expires_at > NOW())
        ORDER BY pa.created_at DESC
      `, [status]);

      return result.rows;
    } catch (error) {
      logger.error({ error: error.message }, 'Failed to get pending actions');
      return [];
    }
  }

  /**
   * Approve a pending action
   */
  async approveAction(actionId, approvedBy) {
    try {
      const result = await this.pool.query(`
        UPDATE marketing_pending_actions
        SET status = 'approved', approved_by = $2, approved_at = NOW()
        WHERE id = $1 AND status = 'pending'
        RETURNING *
      `, [actionId, approvedBy]);

      if (result.rows.length === 0) {
        return { success: false, error: 'Action not found or already processed' };
      }

      return { success: true, action: result.rows[0] };
    } catch (error) {
      logger.error({ error: error.message, actionId }, 'Failed to approve action');
      return { success: false, error: error.message };
    }
  }

  /**
   * Reject a pending action
   */
  async rejectAction(actionId, rejectedBy, reason = null) {
    try {
      const result = await this.pool.query(`
        UPDATE marketing_pending_actions
        SET status = 'rejected',
            approved_by = $2,
            approved_at = NOW(),
            execution_result = $3
        WHERE id = $1 AND status = 'pending'
        RETURNING *
      `, [actionId, rejectedBy, reason ? JSON.stringify({ reason }) : null]);

      if (result.rows.length === 0) {
        return { success: false, error: 'Action not found or already processed' };
      }

      return { success: true, action: result.rows[0] };
    } catch (error) {
      logger.error({ error: error.message, actionId }, 'Failed to reject action');
      return { success: false, error: error.message };
    }
  }

  /**
   * Detect if message is asking about budget scenarios
   * @returns {Object|null} Parsed scenario request or null
   */
  detectBudgetScenario(message) {
    const lowerMessage = message.toLowerCase();

    // Patterns like "what if we spend $500/week" or "if I had $1000 monthly budget"
    const budgetPatterns = [
      /what if (?:we |i )?(?:spend|had|budget|invest)\s*\$?(\d+(?:,\d{3})*(?:\.\d{2})?)\s*(?:\/|\s*per\s*)?(week|month|day)?/i,
      /(?:spend|budget|invest)\s*\$?(\d+(?:,\d{3})*(?:\.\d{2})?)\s*(?:\/|\s*per\s*)?(week|month|day)?/i,
      /\$(\d+(?:,\d{3})*(?:\.\d{2})?)\s*(?:\/|\s*per\s*)?(week|month|day)?\s*(?:budget|spend)/i,
      /with\s*\$?(\d+(?:,\d{3})*(?:\.\d{2})?)\s*(?:\/|\s*per\s*)?(week|month|day)?/i,
    ];

    for (const pattern of budgetPatterns) {
      const match = message.match(pattern);
      if (match) {
        let amount = parseFloat(match[1].replace(',', ''));
        let period = (match[2] || 'week').toLowerCase();

        // Normalize to weekly
        if (period === 'month' || period === 'monthly') {
          amount = amount / 4.33;
        } else if (period === 'day' || period === 'daily') {
          amount = amount * 7;
        }

        return { weeklyBudget: Math.round(amount), originalPeriod: period };
      }
    }

    // Check for general budget/scenario questions without specific amounts
    if (lowerMessage.includes('budget') && (
      lowerMessage.includes('scenario') ||
      lowerMessage.includes('what if') ||
      lowerMessage.includes('how much') ||
      lowerMessage.includes('recommend') ||
      lowerMessage.includes('suggest')
    )) {
      return { generalBudgetQuestion: true };
    }

    return null;
  }

  /**
   * Detect if message asks about target-based recommendations
   * @returns {Object|null} Parsed targets or null
   */
  detectTargetGoals(message) {
    const targets = {};

    // "I want 50 leads per week"
    const leadsMatch = message.match(/(\d+)\s*leads?\s*(?:per|\/)\s*(week|month|day)/i);
    if (leadsMatch) {
      let amount = parseInt(leadsMatch[1]);
      const period = leadsMatch[2].toLowerCase();
      if (period === 'month') amount = Math.round(amount / 4.33);
      else if (period === 'day') amount = amount * 7;
      targets.leadsPerWeek = amount;
    }

    // "I want 20 registrations per week"
    const regsMatch = message.match(/(\d+)\s*(?:registrations?|conversions?|sign[- ]?ups?)\s*(?:per|\/)\s*(week|month|day)/i);
    if (regsMatch) {
      let amount = parseInt(regsMatch[1]);
      const period = regsMatch[2].toLowerCase();
      if (period === 'month') amount = Math.round(amount / 4.33);
      else if (period === 'day') amount = amount * 7;
      targets.registrationsPerWeek = amount;
    }

    // "I want $5000 revenue per week"
    const revenueMatch = message.match(/\$?(\d+(?:,\d{3})*)\s*(?:revenue|sales)\s*(?:per|\/)\s*(week|month|day)/i);
    if (revenueMatch) {
      let amount = parseFloat(revenueMatch[1].replace(',', ''));
      const period = revenueMatch[2].toLowerCase();
      if (period === 'month') amount = amount / 4.33;
      else if (period === 'day') amount = amount * 7;
      targets.revenuePerWeek = Math.round(amount);
    }

    return Object.keys(targets).length > 0 ? targets : null;
  }

  /**
   * Build enhanced context with scenario modeling if applicable
   */
  async buildEnhancedContext(userMessage) {
    const parts = [];

    // Always include base marketing context
    const { context: marketingContext } = await this.dataAggregator.buildMarketingContext();
    parts.push(marketingContext);

    // Check for live ad platform data requests (Google Ads, Meta Ads)
    // This fetches real-time campaign data from the ad platform APIs
    const liveAdContext = await this.dataAggregator.getLiveAdPlatformContext(userMessage);
    if (liveAdContext) {
      parts.push(liveAdContext);
    }

    // Check for budget scenario
    const budgetScenario = this.detectBudgetScenario(userMessage);
    if (budgetScenario && budgetScenario.weeklyBudget) {
      const scenario = await this.dataAggregator.modelBudgetScenario(budgetScenario.weeklyBudget);
      parts.push(this.dataAggregator.formatBudgetScenarioContext(scenario));
    } else if (budgetScenario && budgetScenario.generalBudgetQuestion) {
      // Include historical benchmarks for general budget questions
      const benchmarks = await this.dataAggregator.getHistoricalBenchmarks();
      if (benchmarks.overall) {
        parts.push(`## Historical Performance Benchmarks (90-day)
- **Average CPL**: $${parseFloat(benchmarks.overall.avg_cpl || 0).toFixed(2)}
- **Average CPR**: $${parseFloat(benchmarks.overall.avg_cpr || 0).toFixed(2)}
- **Average ROAS**: ${parseFloat(benchmarks.overall.avg_roas || 0).toFixed(2)}x
- **Leads per $1 Spent**: ${parseFloat(benchmarks.overall.leads_per_dollar || 0).toFixed(3)}

Use these benchmarks to provide budget recommendations.`);
      }
    }

    // Check for target-based questions
    const targets = this.detectTargetGoals(userMessage);
    if (targets) {
      const recommendations = await this.dataAggregator.getOptimalBudgetRecommendation(targets);
      if (recommendations.success && recommendations.recommendations.length > 0) {
        parts.push(`## Budget Recommendations for Your Goals
${recommendations.recommendations.map(r =>
  `### Target: ${r.target}
- **Required Weekly Budget**: $${r.requiredWeeklyBudget.toLocaleString()}
- **Required Monthly Budget**: $${r.requiredMonthlyBudget.toLocaleString()}`
).join('\n\n')}`);
      }
    }

    return parts.join('\n\n---\n\n');
  }

  /**
   * Get suggested questions for new conversations
   */
  getSuggestedQuestions() {
    return [
      "Review our Google Ads account and recommend optimizations",
      "What's our best performing campaign right now?",
      "Which campaigns should we pause or optimize?",
      "What if we spend $500/week on Meta ads?",
      "How many leads can we expect with a $1000/month budget?",
      "Suggest A/B tests to improve our conversion rate",
    ];
  }

  /**
   * Get usage statistics
   */
  async getUsageStats() {
    const weeklySpend = await this.getCurrentWeekSpend();
    const budgetDollars = this.weeklyBudgetCents / 100;

    const statsResult = await this.pool.query(`
      SELECT
        DATE(created_at) as date,
        COUNT(*) as message_count
      FROM marketing_messages
      WHERE role = 'assistant'
        AND created_at >= NOW() - INTERVAL '7 days'
      GROUP BY DATE(created_at)
      ORDER BY date DESC
    `);

    return {
      is_available: this.isAvailable(),
      weekly_budget: budgetDollars,
      weekly_spend: weeklySpend,
      budget_remaining: Math.max(0, budgetDollars - weeklySpend),
      budget_percent_used: Math.min(100, (weeklySpend / budgetDollars) * 100),
      messages_by_day: statsResult.rows,
    };
  }
}

module.exports = MarketingCommandService;
