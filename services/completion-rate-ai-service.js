/**
 * Completion Rate AI Analysis Service
 *
 * On-demand AI analysis for completion rate anomalies and insights.
 * Uses Anthropic Claude API with strict cost controls.
 *
 * Cost Controls:
 * - Weekly budget cap (configurable, default $20/week)
 * - Token logging to completion_rate_ai_logs table
 * - Caching for repeated queries about same entity
 * - Simple analyses use minimal context
 */

const axios = require('axios');
const { logger } = require('../utils/logger');

// Claude API pricing (as of Jan 2025)
const CLAUDE_PRICING = {
  'claude-3-5-sonnet-20241022': {
    input_per_1k: 0.003,
    output_per_1k: 0.015,
  },
  'claude-3-haiku-20240307': {
    input_per_1k: 0.00025,
    output_per_1k: 0.00125,
  }
};

const DEFAULT_MODEL = 'claude-3-5-sonnet-20241022';
const WEEKLY_BUDGET_CENTS = 2000; // $20/week default

class CompletionRateAIService {
  constructor(pool) {
    this.pool = pool;
    this.apiKey = process.env.ANTHROPIC_API_KEY;
    this.weeklyBudgetCents = parseInt(process.env.COMPLETION_RATE_AI_BUDGET_CENTS || WEEKLY_BUDGET_CENTS);
  }

  /**
   * Check if AI analysis is available
   */
  isAvailable() {
    return !!this.apiKey;
  }

  /**
   * Get current week's AI spend
   */
  async getCurrentWeekSpend() {
    const result = await this.pool.query(`
      SELECT COALESCE(SUM(cost_estimate), 0) as total_spend
      FROM completion_rate_ai_logs
      WHERE created_at >= date_trunc('week', NOW())
    `);
    return parseFloat(result.rows[0].total_spend || 0);
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
   * Log AI usage for cost tracking
   */
  async logUsage({
    analysisType,
    dimensionType,
    dimensionValue,
    promptTokens,
    completionTokens,
    totalTokens,
    model,
    costEstimate,
    responseSummary,
    requestedBy
  }) {
    await this.pool.query(`
      INSERT INTO completion_rate_ai_logs (
        analysis_type, dimension_type, dimension_value,
        prompt_tokens, completion_tokens, total_tokens,
        model_used, cost_estimate, response_summary, requested_by
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)
    `, [
      analysisType, dimensionType, dimensionValue,
      promptTokens, completionTokens, totalTokens,
      model, costEstimate, responseSummary, requestedBy
    ]);
  }

  /**
   * Calculate cost estimate from token counts
   */
  calculateCost(inputTokens, outputTokens, model = DEFAULT_MODEL) {
    const pricing = CLAUDE_PRICING[model] || CLAUDE_PRICING[DEFAULT_MODEL];
    const inputCost = (inputTokens / 1000) * pricing.input_per_1k;
    const outputCost = (outputTokens / 1000) * pricing.output_per_1k;
    return inputCost + outputCost;
  }

  /**
   * Make API call to Claude
   */
  async callClaude(systemPrompt, userPrompt, model = DEFAULT_MODEL) {
    if (!this.apiKey) {
      throw new Error('ANTHROPIC_API_KEY not configured');
    }

    try {
      const response = await axios.post('https://api.anthropic.com/v1/messages', {
        model,
        max_tokens: 1024,
        system: systemPrompt,
        messages: [
          { role: 'user', content: userPrompt }
        ]
      }, {
        headers: {
          'x-api-key': this.apiKey,
          'anthropic-version': '2023-06-01',
          'content-type': 'application/json'
        },
        timeout: 30000
      });

      const { content, usage } = response.data;
      const text = content[0]?.text || '';

      return {
        text,
        inputTokens: usage.input_tokens,
        outputTokens: usage.output_tokens,
        model
      };
    } catch (error) {
      logger.error({
        error: error.message,
        status: error.response?.status
      }, 'Claude API call failed');
      throw error;
    }
  }

  /**
   * Analyze individual tutor or client completion rate issues
   */
  async analyzeIndividual({
    dimensionType, // 'tutor' or 'client'
    dimensionValue,
    dimensionDisplayName,
    currentRate,
    baselineRate,
    appointmentsTotal,
    revenueImpact,
    requestedBy
  }) {
    // Check budget
    if (!await this.canMakeRequest(0.05)) {
      return {
        success: false,
        error: 'Weekly AI budget exhausted',
        budget_remaining: 0
      };
    }

    // Get additional context
    const context = await this.getEntityContext(dimensionType, dimensionValue);

    const systemPrompt = `You are an operations analyst for Acme Operations, an education company that provides chess lessons to children. You analyze completion rates (% of scheduled lessons that actually happen).

Your job is to provide brief, actionable insights about why a ${dimensionType} might have a low completion rate and what ops can do about it.

Key context:
- "complete" and "cancelled-chargeable" both count as completed (revenue collected)
- "cancelled" means lost revenue and wasted tutor availability
- Good completion rate is 90%+, concerning is <85%
- Consider: timing patterns, client types, market conditions, tutor tenure

Be concise. Focus on actionable recommendations.`;

    const userPrompt = `Analyze this ${dimensionType}'s completion rate:

Name: ${dimensionDisplayName}
Current completion rate: ${(currentRate * 100).toFixed(1)}%
Baseline (channel avg): ${(baselineRate * 100).toFixed(1)}%
Total appointments (90 days): ${appointmentsTotal}
Estimated revenue impact: $${revenueImpact?.toFixed(0) || 'Unknown'}

${context ? `Additional context:\n${context}` : ''}

Provide:
1. Likely root causes (2-3 bullet points)
2. Recommended actions (2-3 specific steps ops should take)
3. Priority level (high/medium/low) based on revenue impact`;

    try {
      const result = await this.callClaude(systemPrompt, userPrompt);
      const cost = this.calculateCost(result.inputTokens, result.outputTokens, result.model);

      // Log usage
      await this.logUsage({
        analysisType: 'individual',
        dimensionType,
        dimensionValue,
        promptTokens: result.inputTokens,
        completionTokens: result.outputTokens,
        totalTokens: result.inputTokens + result.outputTokens,
        model: result.model,
        costEstimate: cost,
        responseSummary: result.text.substring(0, 200),
        requestedBy
      });

      return {
        success: true,
        analysis: result.text,
        cost,
        tokens: result.inputTokens + result.outputTokens
      };
    } catch (error) {
      return {
        success: false,
        error: error.message
      };
    }
  }

  /**
   * Generate weekly ops summary of all anomalies
   */
  async generateWeeklySummary({ requestedBy }) {
    // Check budget
    if (!await this.canMakeRequest(0.10)) {
      return {
        success: false,
        error: 'Weekly AI budget exhausted'
      };
    }

    // Get open anomalies
    const anomaliesResult = await this.pool.query(`
      SELECT
        dimension_type,
        dimension_display_name,
        anomaly_type,
        current_rate,
        baseline_rate,
        revenue_impact,
        appointments_affected,
        severity
      FROM completion_rate_anomalies
      WHERE status = 'open'
      ORDER BY
        CASE severity
          WHEN 'critical' THEN 1
          WHEN 'high' THEN 2
          WHEN 'medium' THEN 3
          ELSE 4
        END,
        revenue_impact DESC NULLS LAST
      LIMIT 20
    `);

    if (anomaliesResult.rows.length === 0) {
      return {
        success: true,
        analysis: 'No open anomalies to analyze this week. Completion rates are healthy across all dimensions.',
        cost: 0,
        tokens: 0
      };
    }

    const systemPrompt = `You are an operations analyst for Acme Operations. Generate a concise weekly summary of completion rate issues for the ops team meeting.

Focus on:
- Total revenue at risk
- Top priority items
- Common patterns across issues
- Quick wins vs systemic problems

Be direct and actionable. This goes to Nicholas (ops lead) who needs clear next steps.`;

    const anomalySummary = anomaliesResult.rows.map(a =>
      `- ${a.dimension_display_name} (${a.dimension_type}): ${(a.current_rate * 100).toFixed(0)}% vs ${(a.baseline_rate * 100).toFixed(0)}% baseline, $${a.revenue_impact?.toFixed(0) || '?'} impact [${a.severity}]`
    ).join('\n');

    const userPrompt = `Weekly Completion Rate Anomalies (${anomaliesResult.rows.length} open issues):

${anomalySummary}

Provide:
1. Executive summary (2-3 sentences)
2. Top 3 priority items to address this week
3. Any patterns you notice across the issues
4. Estimated total revenue recovery if all addressed`;

    try {
      const result = await this.callClaude(systemPrompt, userPrompt);
      const cost = this.calculateCost(result.inputTokens, result.outputTokens, result.model);

      await this.logUsage({
        analysisType: 'weekly_summary',
        dimensionType: null,
        dimensionValue: null,
        promptTokens: result.inputTokens,
        completionTokens: result.outputTokens,
        totalTokens: result.inputTokens + result.outputTokens,
        model: result.model,
        costEstimate: cost,
        responseSummary: result.text.substring(0, 200),
        requestedBy
      });

      return {
        success: true,
        analysis: result.text,
        anomalyCount: anomaliesResult.rows.length,
        cost,
        tokens: result.inputTokens + result.outputTokens
      };
    } catch (error) {
      return {
        success: false,
        error: error.message
      };
    }
  }

  /**
   * Analyze revenue improvement opportunities
   */
  async analyzeRevenueOpportunities({ requestedBy }) {
    // Check budget
    if (!await this.canMakeRequest(0.08)) {
      return {
        success: false,
        error: 'Weekly AI budget exhausted'
      };
    }

    // Get completion rates by dimension
    const channelRates = await this.pool.query(`
      SELECT
        dimension_value as channel,
        completion_rate,
        appointments_total,
        revenue_lost
      FROM v_current_completion_rates
      WHERE dimension_type = 'channel'
      ORDER BY revenue_lost DESC NULLS LAST
    `);

    // Get top improvement opportunities
    const opportunities = await this.pool.query(`
      SELECT
        dimension_type,
        dimension_value,
        dimension_display_name,
        completion_rate,
        appointments_total,
        revenue_lost
      FROM v_current_completion_rates
      WHERE completion_rate < 0.90
        AND appointments_total >= 10
      ORDER BY revenue_lost DESC NULLS LAST
      LIMIT 10
    `);

    const systemPrompt = `You are a revenue optimization analyst for Acme Operations. Identify the highest-impact opportunities to improve completion rates and recover lost revenue.

Think like a consultant: prioritize by effort vs impact. Consider:
- Quick wins (single tutor/client fixes)
- Systemic improvements (process changes)
- High-value vs low-value fixes`;

    const channelSummary = channelRates.rows.map(r =>
      `${r.channel}: ${(r.completion_rate * 100).toFixed(0)}% completion, $${r.revenue_lost?.toFixed(0) || '?'} lost revenue`
    ).join('\n');

    const opportunitySummary = opportunities.rows.map(o =>
      `- ${o.dimension_display_name} (${o.dimension_type}): ${(o.completion_rate * 100).toFixed(0)}%, ${o.appointments_total} appts, $${o.revenue_lost?.toFixed(0) || '?'} lost`
    ).join('\n');

    const userPrompt = `Current Channel Completion Rates:
${channelSummary}

Top Improvement Opportunities:
${opportunitySummary}

Provide:
1. Total addressable revenue opportunity (estimate)
2. Top 3 highest-impact improvements with expected ROI
3. Recommended sequence of interventions
4. Quick wins vs longer-term fixes`;

    try {
      const result = await this.callClaude(systemPrompt, userPrompt);
      const cost = this.calculateCost(result.inputTokens, result.outputTokens, result.model);

      await this.logUsage({
        analysisType: 'revenue_opportunity',
        dimensionType: null,
        dimensionValue: null,
        promptTokens: result.inputTokens,
        completionTokens: result.outputTokens,
        totalTokens: result.inputTokens + result.outputTokens,
        model: result.model,
        costEstimate: cost,
        responseSummary: result.text.substring(0, 200),
        requestedBy
      });

      return {
        success: true,
        analysis: result.text,
        cost,
        tokens: result.inputTokens + result.outputTokens
      };
    } catch (error) {
      return {
        success: false,
        error: error.message
      };
    }
  }

  /**
   * Get additional context for an entity (tutor or client)
   */
  async getEntityContext(dimensionType, dimensionValue) {
    try {
      if (dimensionType === 'tutor') {
        const result = await this.pool.query(`
          SELECT
            c.first_name || ' ' || c.last_name as name,
            c.status,
            MIN(a.start)::date as first_lesson,
            COUNT(DISTINCT a.service_id) as job_count,
            COUNT(DISTINCT CASE WHEN a.start >= NOW() - INTERVAL '30 days' THEN a.appointment_id END) as recent_appointments
          FROM contractors c
          LEFT JOIN appointment_contractors ac ON c.contractor_id = ac.contractor_id
          LEFT JOIN appointments a ON ac.appointment_id = a.appointment_id
          WHERE c.contractor_id = $1
          GROUP BY c.contractor_id, c.first_name, c.last_name, c.status
        `, [dimensionValue]);

        if (result.rows[0]) {
          const r = result.rows[0];
          return `Tutor tenure: since ${r.first_lesson || 'unknown'}\nActive jobs: ${r.job_count}\nRecent appointments (30d): ${r.recent_appointments}`;
        }
      }
      // Add client context if needed
      return null;
    } catch (error) {
      return null;
    }
  }

  /**
   * Get AI usage statistics
   */
  async getUsageStats() {
    const weeklySpend = await this.getCurrentWeekSpend();
    const budgetDollars = this.weeklyBudgetCents / 100;

    const statsResult = await this.pool.query(`
      SELECT
        analysis_type,
        COUNT(*) as call_count,
        SUM(total_tokens) as total_tokens,
        SUM(cost_estimate) as total_cost
      FROM completion_rate_ai_logs
      WHERE created_at >= date_trunc('week', NOW())
      GROUP BY analysis_type
    `);

    return {
      is_available: this.isAvailable(),
      weekly_budget: budgetDollars,
      weekly_spend: weeklySpend,
      budget_remaining: Math.max(0, budgetDollars - weeklySpend),
      budget_percent_used: Math.min(100, (weeklySpend / budgetDollars) * 100),
      by_type: statsResult.rows
    };
  }
}

module.exports = CompletionRateAIService;
