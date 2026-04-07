/**
 * Marketing Budget Optimizer Service
 *
 * Analyzes cross-platform performance and recommends budget reallocation
 * to maximize ROAS and minimize CPL.
 */

const Anthropic = require('@anthropic-ai/sdk');
const { logger } = require('../utils/logger');
const MarketingNotificationService = require('./marketing-notification-service');

class MarketingBudgetOptimizer {
  constructor(pool) {
    this.pool = pool;
    this.anthropic = process.env.ANTHROPIC_API_KEY
      ? new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY })
      : null;
    this.model = process.env.ANTHROPIC_MODEL || 'claude-sonnet-4-20250514';
    this.notificationService = new MarketingNotificationService();
  }

  /**
   * Get current budget allocation and performance by platform
   */
  async getCurrentAllocation() {
    try {
      const result = await this.pool.query(`
        SELECT
          platform,
          AVG(daily_budget) as avg_daily_budget,
          AVG(daily_spend) as avg_daily_spend,
          AVG(performance_score) as avg_performance
        FROM marketing_budget_snapshots
        WHERE snapshot_date >= CURRENT_DATE - INTERVAL '7 days'
        GROUP BY platform
      `);

      // If no snapshots, get from ad_spend_data
      if (result.rows.length === 0) {
        const spendResult = await this.pool.query(`
          SELECT
            platform,
            AVG(spend) as avg_daily_spend,
            SUM(spend) / 7 as weekly_avg
          FROM ad_spend_data
          WHERE date >= CURRENT_DATE - INTERVAL '7 days'
          GROUP BY platform
        `);
        return spendResult.rows;
      }

      return result.rows;
    } catch (error) {
      logger.error({
        msg: 'Budget optimizer: Failed to get current allocation',
        error: error.message,
      });
      return [];
    }
  }

  /**
   * Get platform performance metrics for optimization
   */
  async getPlatformPerformance() {
    try {
      const result = await this.pool.query(`
        WITH platform_metrics AS (
          SELECT
            a.platform,
            SUM(a.spend) as total_spend,
            SUM(a.clicks) as total_clicks,
            SUM(a.impressions) as total_impressions,
            COUNT(DISTINCT bs.id) as total_leads,
            SUM(CASE WHEN bs.payment_status = 'paid' THEN COALESCE(bs.actual_price, 0) ELSE 0 END) as total_revenue
          FROM ad_spend_data a
          LEFT JOIN booking_submissions bs ON (
            LOWER(COALESCE(bs.utm->>'utm_source', '')) = LOWER(a.platform)
            AND DATE(bs.created_at) >= CURRENT_DATE - INTERVAL '30 days'
          )
          WHERE a.date >= CURRENT_DATE - INTERVAL '30 days'
          GROUP BY a.platform
        )
        SELECT
          platform,
          total_spend,
          total_clicks,
          total_impressions,
          total_leads,
          total_revenue,
          CASE WHEN total_clicks > 0 THEN total_spend / total_clicks ELSE 0 END as cpc,
          CASE WHEN total_leads > 0 THEN total_spend / total_leads ELSE 0 END as cpl,
          CASE WHEN total_spend > 0 THEN total_revenue / total_spend ELSE 0 END as roas,
          CASE WHEN total_impressions > 0 THEN total_clicks::float / total_impressions * 100 ELSE 0 END as ctr
        FROM platform_metrics
        WHERE total_spend > 0
      `);

      return result.rows;
    } catch (error) {
      logger.error({
        msg: 'Budget optimizer: Failed to get platform performance',
        error: error.message,
      });
      return [];
    }
  }

  /**
   * Get AI calibration data for confidence adjustment
   */
  async getCalibrationData() {
    try {
      const result = await this.pool.query(`
        SELECT prediction_type, platform, confidence_adjustment
        FROM marketing_ai_calibration
        WHERE sample_size >= 5
      `);
      return result.rows;
    } catch (error) {
      logger.error({
        msg: 'Budget optimizer: Failed to get calibration data',
        error: error.message,
      });
      return [];
    }
  }

  /**
   * Get historical budget snapshots for trend analysis
   */
  async getHistoricalSnapshots(days = 30) {
    try {
      const safeDays = parseInt(days, 10) || 30;

      const result = await this.pool.query(`
        SELECT
          snapshot_date,
          platform,
          daily_budget,
          daily_spend,
          performance_score
        FROM marketing_budget_snapshots
        WHERE snapshot_date >= CURRENT_DATE - make_interval(days => $1)
        ORDER BY snapshot_date DESC, platform
      `, [safeDays]);

      return result.rows;
    } catch (error) {
      logger.error({
        msg: 'Budget optimizer: Failed to get historical snapshots',
        error: error.message,
        days,
      });
      return [];
    }
  }

  /**
   * Generate budget recommendation using AI
   */
  async generateRecommendation(totalBudget = null) {
    if (!this.anthropic) {
      logger.warn({ msg: 'Budget optimizer: No Anthropic API key configured' });
      return null;
    }

    const currentAllocation = await this.getCurrentAllocation();
    const performance = await this.getPlatformPerformance();
    const calibration = await this.getCalibrationData();

    // If no total budget specified, use current total
    if (!totalBudget) {
      totalBudget = currentAllocation.reduce((sum, p) => sum + parseFloat(p.avg_daily_spend || 0), 0) * 7;
    }

    // Validate totalBudget before making AI call
    if (!totalBudget || totalBudget <= 0) {
      logger.warn({ msg: 'Budget optimizer: Insufficient data for recommendation' });
      return null;
    }

    const systemPrompt = `You are a digital marketing budget optimizer for Acme Operations.
Your job is to analyze platform performance and recommend optimal budget allocation.

RULES:
1. Focus on maximizing ROAS while maintaining acceptable CPL
2. Never recommend putting all budget in one platform (minimum 15% per active platform)
3. Consider both short-term performance and long-term brand building
4. Be conservative - don't recommend dramatic shifts (max 30% change per platform)
5. Factor in the calibration data to adjust confidence

OUTPUT FORMAT:
Return a JSON object with:
{
  "recommended_allocation": {
    "meta": <daily_budget>,
    "google": <daily_budget>
  },
  "rationale": "Explanation of the recommendation",
  "projected_improvement": {
    "cpl_change_percent": <number>,
    "roas_change_percent": <number>
  },
  "confidence": <0.0-1.0>,
  "risks": ["risk1", "risk2"]
}

Return ONLY valid JSON.`;

    const userPrompt = `Analyze this data and recommend optimal budget allocation for a weekly budget of $${totalBudget.toFixed(2)}:

## Current Allocation (7-day average)
${JSON.stringify(currentAllocation, null, 2)}

## Platform Performance (30-day)
${JSON.stringify(performance, null, 2)}

## AI Calibration Data
${JSON.stringify(calibration, null, 2)}

Generate a budget recommendation.`;

    try {
      const response = await this.anthropic.messages.create({
        model: this.model,
        max_tokens: 2000,
        system: systemPrompt,
        messages: [{ role: 'user', content: userPrompt }],
      });

      const content = response.content[0]?.text || '{}';
      let recommendation;

      try {
        recommendation = JSON.parse(content);
      } catch (e) {
        const jsonMatch = content.match(/\{[\s\S]*\}/);
        if (jsonMatch) {
          recommendation = JSON.parse(jsonMatch[0]);
        } else {
          throw new Error('Could not parse AI response');
        }
      }

      logger.info({
        msg: 'Budget recommendation generated',
        confidence: recommendation.confidence,
      });

      return recommendation;
    } catch (error) {
      logger.error({
        msg: 'Budget optimizer: AI recommendation failed',
        error: error.message,
      });
      return null;
    }
  }

  /**
   * Save a budget recommendation to the database
   */
  async saveRecommendation(recommendation) {
    try {
      const currentAllocation = await this.getCurrentAllocation();
      const currentAllocObj = currentAllocation.reduce((acc, p) => {
        acc[p.platform] = parseFloat(p.avg_daily_spend || 0);
        return acc;
      }, {});

      const result = await this.pool.query(`
        INSERT INTO marketing_budget_recommendations (
          recommendation_type,
          current_allocation,
          recommended_allocation,
          rationale,
          projected_improvement,
          confidence_score
        ) VALUES ($1, $2, $3, $4, $5, $6)
        RETURNING *
      `, [
        'reallocation',
        JSON.stringify(currentAllocObj),
        JSON.stringify(recommendation.recommended_allocation),
        recommendation.rationale,
        JSON.stringify(recommendation.projected_improvement || {}),
        recommendation.confidence || 0.7,
      ]);

      logger.info({
        msg: 'Budget recommendation saved',
        id: result.rows[0].id,
      });

      const saved = result.rows[0];

      // Send notification (don't let notification failure block save)
      try {
        await this.notificationService.notifyBudgetRecommendation({
          id: saved.id,
          recommendation_type: saved.recommendation_type,
          rationale: saved.rationale,
          confidence_score: saved.confidence_score,
          projected_improvement: recommendation.projected_improvement
        });
      } catch (err) {
        logger.error({
          msg: 'Failed to send budget recommendation notification',
          recommendationId: saved.id,
          error: err.message
        });
      }

      return saved;
    } catch (error) {
      logger.error({
        msg: 'Budget optimizer: Failed to save recommendation',
        error: error.message,
      });
      throw new Error(`Failed to save recommendation: ${error.message}`);
    }
  }

  /**
   * Get pending recommendations for review
   */
  async getPendingRecommendations() {
    try {
      const result = await this.pool.query(`
        SELECT * FROM marketing_budget_recommendations
        WHERE status = 'pending'
          AND (expires_at IS NULL OR expires_at > NOW())
        ORDER BY created_at DESC
      `);
      return result.rows;
    } catch (error) {
      logger.error({
        msg: 'Budget optimizer: Failed to get pending recommendations',
        error: error.message,
      });
      return [];
    }
  }

  /**
   * Get all recommendations with optional filtering
   */
  async getRecommendationHistory(limit = 50) {
    try {
      const result = await this.pool.query(`
        SELECT
          id,
          recommendation_type,
          current_allocation,
          recommended_allocation,
          rationale,
          projected_improvement,
          confidence_score,
          status,
          approved_by,
          approved_at,
          executed_at,
          execution_result,
          created_at,
          expires_at
        FROM marketing_budget_recommendations
        ORDER BY created_at DESC
        LIMIT $1
      `, [limit]);

      return result.rows;
    } catch (error) {
      logger.error({
        msg: 'Budget optimizer: Failed to get recommendation history',
        error: error.message,
        limit,
      });
      return [];
    }
  }

  /**
   * Approve a recommendation
   */
  async approveRecommendation(id, approvedBy) {
    try {
      const result = await this.pool.query(`
        UPDATE marketing_budget_recommendations
        SET status = 'approved', approved_by = $2, approved_at = NOW()
        WHERE id = $1
        RETURNING *
      `, [id, approvedBy]);

      if (result.rows.length === 0) {
        throw new Error('Recommendation not found');
      }

      logger.info({
        msg: 'Budget recommendation approved',
        id,
        approvedBy,
      });

      return result.rows[0];
    } catch (error) {
      logger.error({
        msg: 'Budget optimizer: Failed to approve recommendation',
        error: error.message,
        id,
        approvedBy,
      });
      throw new Error(`Failed to approve recommendation: ${error.message}`);
    }
  }

  /**
   * Reject a recommendation
   */
  async rejectRecommendation(id, rejectedBy, reason) {
    try {
      const result = await this.pool.query(`
        UPDATE marketing_budget_recommendations
        SET status = 'rejected', execution_result = $2
        WHERE id = $1
        RETURNING *
      `, [id, JSON.stringify({ rejection_reason: reason, rejected_by: rejectedBy })]);

      if (result.rows.length === 0) {
        throw new Error('Recommendation not found');
      }

      logger.info({
        msg: 'Budget recommendation rejected',
        id,
        rejectedBy,
        reason,
      });

      return result.rows[0];
    } catch (error) {
      logger.error({
        msg: 'Budget optimizer: Failed to reject recommendation',
        error: error.message,
        id,
        rejectedBy,
      });
      throw new Error(`Failed to reject recommendation: ${error.message}`);
    }
  }

  /**
   * Record actual results after execution for accuracy tracking
   */
  async recordActualResults(id, actualCplChange, actualRoasChange) {
    try {
      await this.pool.query(`
        UPDATE marketing_budget_recommendations
        SET
          actual_cpl_change = $2,
          actual_roas_change = $3
        WHERE id = $1
      `, [id, actualCplChange, actualRoasChange]);

      logger.info({
        msg: 'Budget recommendation results recorded',
        id,
        actualCplChange,
        actualRoasChange
      });
    } catch (error) {
      logger.error({
        msg: 'Budget optimizer: Failed to record actual results',
        error: error.message,
        id,
      });
      throw new Error(`Failed to record actual results: ${error.message}`);
    }
  }

  /**
   * Execute an approved recommendation (would integrate with ad platform APIs)
   */
  async executeRecommendation(id) {
    try {
      const recResult = await this.pool.query(
        'SELECT * FROM marketing_budget_recommendations WHERE id = $1',
        [id]
      );

      if (recResult.rows.length === 0) {
        throw new Error('Recommendation not found');
      }

      const rec = recResult.rows[0];

      if (rec.status !== 'approved') {
        throw new Error('Recommendation must be approved before execution');
      }

      // In production, this would call Meta/Google APIs to update budgets
      // For now, we log the intended changes
      const executionLog = {
        executed_at: new Date().toISOString(),
        changes: rec.recommended_allocation,
        note: 'Budget changes logged - manual implementation required',
      };

      await this.pool.query(`
        UPDATE marketing_budget_recommendations
        SET status = 'executed', executed_at = NOW(), execution_result = $2
        WHERE id = $1
      `, [id, JSON.stringify(executionLog)]);

      logger.info({
        msg: 'Budget recommendation executed',
        id,
        changes: rec.recommended_allocation,
      });

      return executionLog;
    } catch (error) {
      logger.error({
        msg: 'Budget optimizer: Failed to execute recommendation',
        error: error.message,
        id,
      });
      throw new Error(`Failed to execute recommendation: ${error.message}`);
    }
  }

  /**
   * Take a daily budget snapshot for trend tracking
   */
  async takeBudgetSnapshot(platform, dailyBudget, dailySpend, performanceScore) {
    try {
      await this.pool.query(`
        INSERT INTO marketing_budget_snapshots (snapshot_date, platform, daily_budget, daily_spend, performance_score)
        VALUES (CURRENT_DATE, $1, $2, $3, $4)
        ON CONFLICT (snapshot_date, platform) DO UPDATE SET
          daily_budget = EXCLUDED.daily_budget,
          daily_spend = EXCLUDED.daily_spend,
          performance_score = EXCLUDED.performance_score
      `, [platform, dailyBudget, dailySpend, performanceScore]);

      logger.info({
        msg: 'Budget snapshot taken',
        platform,
        dailySpend,
      });
    } catch (error) {
      logger.error({
        msg: 'Budget optimizer: Failed to take budget snapshot',
        error: error.message,
        platform,
      });
      throw new Error(`Failed to take budget snapshot: ${error.message}`);
    }
  }

  /**
   * Take snapshots for all platforms based on current ad_spend_data
   */
  async takeAllSnapshots() {
    try {
      const performance = await this.getPlatformPerformance();

      for (const p of performance) {
        // Calculate a simple performance score based on ROAS and CPL
        // Higher ROAS is better, lower CPL is better
        const roasScore = parseFloat(p.roas || 0) * 20; // Scale ROAS
        const cplScore = p.cpl > 0 ? 100 / parseFloat(p.cpl) : 0; // Inverse CPL
        const performanceScore = (roasScore + cplScore) / 2;

        const dailySpend = parseFloat(p.total_spend || 0) / 30;

        await this.takeBudgetSnapshot(
          p.platform,
          dailySpend, // Use daily spend as budget estimate
          dailySpend,
          performanceScore
        );
      }

      logger.info({
        msg: 'All budget snapshots taken',
        platformCount: performance.length,
      });
    } catch (error) {
      logger.error({
        msg: 'Budget optimizer: Failed to take all snapshots',
        error: error.message,
      });
      throw new Error(`Failed to take all snapshots: ${error.message}`);
    }
  }

  /**
   * Run the full optimization cycle
   */
  async runOptimization(totalBudget = null) {
    logger.info({ msg: 'Budget Optimizer: Starting optimization cycle' });

    // Take snapshots first
    await this.takeAllSnapshots();

    // Generate recommendation
    logger.info({ msg: 'Budget Optimizer: Generating AI recommendation' });
    const recommendation = await this.generateRecommendation(totalBudget);

    if (!recommendation) {
      logger.warn({ msg: 'Budget Optimizer: Failed to generate recommendation' });
      return { success: false, error: 'Failed to generate recommendation' };
    }

    // Save it
    logger.info({ msg: 'Budget Optimizer: Saving recommendation' });
    const saved = await this.saveRecommendation(recommendation);

    logger.info({ msg: 'Budget Optimizer: Optimization cycle complete' });

    return {
      success: true,
      recommendation: saved,
      details: recommendation,
    };
  }

  /**
   * Analyze current budget allocation and generate recommendations
   * (Alternative entry point matching task spec)
   */
  async analyzeBudgetAllocation() {
    // Get current spend and performance by platform
    const platformData = await this.getPlatformPerformance();

    // Get historical budget snapshots for trend analysis
    const historicalData = await this.getHistoricalSnapshots(30);

    // Generate AI recommendations
    const aiRecommendation = await this.generateRecommendation();

    // Save recommendation if generated
    let savedRecommendation = null;
    if (aiRecommendation) {
      savedRecommendation = await this.saveRecommendation(aiRecommendation);
    }

    // Take daily snapshot
    await this.takeAllSnapshots();

    return {
      currentAllocation: platformData,
      recommendations: savedRecommendation ? [savedRecommendation] : [],
      snapshotTaken: true,
    };
  }
}

module.exports = MarketingBudgetOptimizer;
