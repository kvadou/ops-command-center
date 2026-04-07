/**
 * Marketing A/B Test Tracking Service
 *
 * Tracks and analyzes A/B tests across marketing platforms.
 * Provides statistical significance calculations and winner determination.
 */

const { logger } = require('../utils/logger');

class MarketingABTestService {
  constructor(pool) {
    this.pool = pool;
  }

  /**
   * Create a new A/B test
   */
  async createTest(params) {
    const {
      name,
      platform,
      testType,
      hypothesis,
      startDate,
      endDate,
      createdBy,
      variants = [],
    } = params;

    const client = await this.pool.connect();

    try {
      await client.query('BEGIN');

      // Create the test
      const testResult = await client.query(`
        INSERT INTO marketing_ab_tests (
          name, platform, test_type, hypothesis, start_date, end_date, created_by, status
        ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
        RETURNING *
      `, [name, platform, testType, hypothesis, startDate, endDate, createdBy, startDate ? 'active' : 'draft']);

      const test = testResult.rows[0];

      // Create variants
      const createdVariants = [];
      for (const variant of variants) {
        const variantResult = await client.query(`
          INSERT INTO marketing_ab_test_variants (test_id, name, is_control, variant_config, external_ids)
          VALUES ($1, $2, $3, $4, $5)
          RETURNING *
        `, [test.id, variant.name, variant.isControl || false, JSON.stringify(variant.config || {}), JSON.stringify(variant.externalIds || {})]);

        createdVariants.push(variantResult.rows[0]);
      }

      await client.query('COMMIT');

      logger.info({
        msg: 'A/B test created',
        testId: test.id,
        name,
        platform,
        variantCount: createdVariants.length,
      });

      return { ...test, variants: createdVariants };
    } catch (error) {
      await client.query('ROLLBACK');
      throw error;
    } finally {
      client.release();
    }
  }

  /**
   * Get all tests with optional filtering
   */
  async getTests(options = {}) {
    const { status, platform, limit = 50 } = options;

    let query = `
      SELECT t.*,
        (SELECT COUNT(*) FROM marketing_ab_test_variants WHERE test_id = t.id) as variant_count,
        (SELECT json_agg(v.*) FROM marketing_ab_test_variants v WHERE v.test_id = t.id) as variants
      FROM marketing_ab_tests t
      WHERE 1=1
    `;
    const params = [];

    if (status) {
      params.push(status);
      query += ` AND t.status = $${params.length}`;
    }

    if (platform) {
      params.push(platform);
      query += ` AND t.platform = $${params.length}`;
    }

    params.push(limit);
    query += ` ORDER BY t.created_at DESC LIMIT $${params.length}`;

    const result = await this.pool.query(query, params);
    return result.rows;
  }

  /**
   * Get a specific test with variants and metrics
   */
  async getTest(testId) {
    const testResult = await this.pool.query(`
      SELECT * FROM marketing_ab_tests WHERE id = $1
    `, [testId]);

    if (testResult.rows.length === 0) {
      return null;
    }

    const test = testResult.rows[0];

    // Get variants
    const variantsResult = await this.pool.query(`
      SELECT * FROM marketing_ab_test_variants WHERE test_id = $1
    `, [testId]);

    // Get aggregated metrics per variant
    const metricsResult = await this.pool.query(`
      SELECT
        variant_id,
        SUM(spend) as total_spend,
        SUM(impressions) as total_impressions,
        SUM(clicks) as total_clicks,
        SUM(conversions) as total_conversions,
        SUM(revenue) as total_revenue,
        CASE WHEN SUM(impressions) > 0 THEN SUM(clicks)::float / SUM(impressions) * 100 ELSE 0 END as avg_ctr,
        CASE WHEN SUM(clicks) > 0 THEN SUM(spend) / SUM(clicks) ELSE 0 END as avg_cpc,
        CASE WHEN SUM(spend) > 0 THEN SUM(revenue) / SUM(spend) ELSE 0 END as avg_roas,
        MAX(statistical_significance) as latest_significance
      FROM marketing_ab_test_metrics
      WHERE test_id = $1
      GROUP BY variant_id
    `, [testId]);

    // Combine data
    const metricsMap = {};
    metricsResult.rows.forEach(m => {
      metricsMap[m.variant_id] = m;
    });

    const variants = variantsResult.rows.map(v => ({
      ...v,
      metrics: metricsMap[v.id] || null,
    }));

    return { ...test, variants };
  }

  /**
   * Update test status
   */
  async updateTestStatus(testId, status, conclusion = null) {
    const updates = { status };
    if (conclusion) {
      updates.conclusion = conclusion;
    }

    const setClauses = Object.keys(updates).map((key, idx) => `${key} = $${idx + 2}`);
    setClauses.push('updated_at = NOW()');

    const result = await this.pool.query(`
      UPDATE marketing_ab_tests
      SET ${setClauses.join(', ')}
      WHERE id = $1
      RETURNING *
    `, [testId, ...Object.values(updates)]);

    return result.rows[0];
  }

  /**
   * Record daily metrics for a variant
   */
  async recordMetrics(params) {
    const {
      testId,
      variantId,
      date,
      spend,
      impressions,
      clicks,
      conversions,
      revenue,
    } = params;

    // Calculate derived metrics
    const ctr = impressions > 0 ? (clicks / impressions * 100) : 0;
    const cpc = clicks > 0 ? (spend / clicks) : 0;
    const roas = spend > 0 ? (revenue / spend) : 0;

    // Calculate statistical significance
    const significance = await this.calculateSignificance(testId, variantId, conversions, impressions);

    const result = await this.pool.query(`
      INSERT INTO marketing_ab_test_metrics (
        test_id, variant_id, date, spend, impressions, clicks, conversions, revenue, ctr, cpc, roas, statistical_significance
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12)
      ON CONFLICT (test_id, variant_id, date)
      DO UPDATE SET
        spend = $4, impressions = $5, clicks = $6, conversions = $7, revenue = $8,
        ctr = $9, cpc = $10, roas = $11, statistical_significance = $12
      RETURNING *
    `, [testId, variantId, date, spend, impressions, clicks, conversions, revenue, ctr, cpc, roas, significance]);

    return result.rows[0];
  }

  /**
   * Calculate statistical significance using a simplified Z-test
   */
  async calculateSignificance(testId, variantId, conversions, impressions) {
    // Get control variant's data
    const controlResult = await this.pool.query(`
      SELECT v.id, SUM(m.conversions) as conversions, SUM(m.impressions) as impressions
      FROM marketing_ab_test_variants v
      LEFT JOIN marketing_ab_test_metrics m ON m.variant_id = v.id
      WHERE v.test_id = $1 AND v.is_control = true
      GROUP BY v.id
    `, [testId]);

    if (controlResult.rows.length === 0 || !controlResult.rows[0].impressions) {
      return null;
    }

    const control = controlResult.rows[0];
    const controlRate = control.conversions / control.impressions;
    const variantRate = impressions > 0 ? conversions / impressions : 0;

    // Simplified Z-test for proportions
    const pooledRate = (control.conversions + conversions) / (control.impressions + impressions);
    const se = Math.sqrt(pooledRate * (1 - pooledRate) * (1 / control.impressions + 1 / impressions));

    if (se === 0) return null;

    const z = Math.abs(variantRate - controlRate) / se;

    // Convert Z-score to confidence percentage (simplified)
    // z = 1.96 → 95% confidence, z = 2.58 → 99% confidence
    if (z >= 2.58) return 99;
    if (z >= 1.96) return 95;
    if (z >= 1.65) return 90;
    if (z >= 1.28) return 80;
    return Math.min(Math.round(z * 40), 79); // Rough approximation for lower values
  }

  /**
   * Determine and set winner
   */
  async declareWinner(testId, winnerVariantId, conclusion) {
    const result = await this.pool.query(`
      UPDATE marketing_ab_tests
      SET status = 'completed', winner_variant_id = $2, conclusion = $3, updated_at = NOW()
      WHERE id = $1
      RETURNING *
    `, [testId, winnerVariantId, conclusion]);

    logger.info({
      msg: 'A/B test winner declared',
      testId,
      winnerVariantId,
    });

    return result.rows[0];
  }

  /**
   * Get metrics time series for a test
   */
  async getMetricsTimeSeries(testId) {
    const result = await this.pool.query(`
      SELECT
        m.date,
        m.variant_id,
        v.name as variant_name,
        v.is_control,
        m.spend,
        m.impressions,
        m.clicks,
        m.conversions,
        m.revenue,
        m.ctr,
        m.roas,
        m.statistical_significance
      FROM marketing_ab_test_metrics m
      JOIN marketing_ab_test_variants v ON v.id = m.variant_id
      WHERE m.test_id = $1
      ORDER BY m.date ASC, v.is_control DESC
    `, [testId]);

    return result.rows;
  }

  /**
   * Add a variant to an existing test
   */
  async addVariant(testId, params) {
    const { name, isControl, config, externalIds } = params;

    const result = await this.pool.query(`
      INSERT INTO marketing_ab_test_variants (test_id, name, is_control, variant_config, external_ids)
      VALUES ($1, $2, $3, $4, $5)
      RETURNING *
    `, [testId, name, isControl || false, JSON.stringify(config || {}), JSON.stringify(externalIds || {})]);

    return result.rows[0];
  }

  /**
   * Update a variant
   */
  async updateVariant(variantId, params) {
    const { name, config, externalIds } = params;
    const updates = [];
    const values = [variantId];

    if (name !== undefined) {
      values.push(name);
      updates.push(`name = $${values.length}`);
    }

    if (config !== undefined) {
      values.push(JSON.stringify(config));
      updates.push(`variant_config = $${values.length}`);
    }

    if (externalIds !== undefined) {
      values.push(JSON.stringify(externalIds));
      updates.push(`external_ids = $${values.length}`);
    }

    if (updates.length === 0) {
      return null;
    }

    const result = await this.pool.query(`
      UPDATE marketing_ab_test_variants
      SET ${updates.join(', ')}
      WHERE id = $1
      RETURNING *
    `, values);

    return result.rows[0];
  }

  /**
   * Delete a test and all related data
   */
  async deleteTest(testId) {
    // Cascades will handle variants and metrics
    await this.pool.query(`
      DELETE FROM marketing_ab_tests WHERE id = $1
    `, [testId]);

    logger.info({ msg: 'A/B test deleted', testId });
  }

  /**
   * Get test summary statistics
   */
  async getTestSummary(testId) {
    const test = await this.getTest(testId);
    if (!test) return null;

    const controlVariant = test.variants.find(v => v.is_control);
    const testVariants = test.variants.filter(v => !v.is_control);

    const summary = {
      test,
      control: controlVariant ? {
        ...controlVariant,
        conversionRate: controlVariant.metrics?.total_impressions > 0
          ? (controlVariant.metrics.total_conversions / controlVariant.metrics.total_impressions * 100).toFixed(2)
          : 0,
      } : null,
      variants: testVariants.map(v => ({
        ...v,
        conversionRate: v.metrics?.total_impressions > 0
          ? (v.metrics.total_conversions / v.metrics.total_impressions * 100).toFixed(2)
          : 0,
        lift: controlVariant?.metrics?.total_impressions > 0 && v.metrics?.total_impressions > 0
          ? (((v.metrics.total_conversions / v.metrics.total_impressions) /
              (controlVariant.metrics.total_conversions / controlVariant.metrics.total_impressions)) - 1) * 100
          : 0,
      })),
      recommendation: this.generateRecommendation(test, controlVariant, testVariants),
    };

    return summary;
  }

  /**
   * Generate recommendation based on test results
   */
  generateRecommendation(test, control, variants) {
    if (!control?.metrics || variants.length === 0) {
      return 'Insufficient data to make a recommendation.';
    }

    const controlRate = control.metrics.total_conversions / control.metrics.total_impressions;
    let bestVariant = null;
    let bestLift = 0;
    let bestSignificance = 0;

    for (const v of variants) {
      if (!v.metrics) continue;

      const variantRate = v.metrics.total_conversions / v.metrics.total_impressions;
      const lift = (variantRate - controlRate) / controlRate * 100;
      const significance = v.metrics.latest_significance || 0;

      if (lift > bestLift && significance >= 90) {
        bestVariant = v;
        bestLift = lift;
        bestSignificance = significance;
      }
    }

    if (bestVariant && bestSignificance >= 95) {
      return `Recommend implementing "${bestVariant.name}" - ${bestLift.toFixed(1)}% lift with ${bestSignificance}% confidence.`;
    } else if (bestVariant && bestSignificance >= 90) {
      return `"${bestVariant.name}" shows promise with ${bestLift.toFixed(1)}% lift (${bestSignificance}% confidence). Consider extending test for higher confidence.`;
    } else {
      return 'No statistically significant winner yet. Continue running the test or review test parameters.';
    }
  }
}

module.exports = MarketingABTestService;
