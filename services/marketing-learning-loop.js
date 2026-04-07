/**
 * Marketing Performance Learning Loop Service
 * Tracks AI prediction accuracy and calibrates confidence scores over time
 */

const { logger } = require('../utils/logger');

class MarketingLearningLoop {
  constructor(pool) {
    this.pool = pool;
  }

  /**
   * Record a prediction and its actual outcome
   */
  async recordPrediction(predictionData) {
    const {
      predictionType,
      predictedValue,
      actualValue,
      platform,
      draftId,
      insightId,
      measurementPeriod,
      metadata
    } = predictionData;

    // Validate numeric inputs to prevent corrupted calibration data
    if (typeof predictedValue !== 'number' || isNaN(predictedValue)) {
      throw new Error('predictedValue must be a valid number');
    }
    if (typeof actualValue !== 'number' || isNaN(actualValue)) {
      throw new Error('actualValue must be a valid number');
    }

    try {
      const accuracyScore = this.calculateAccuracy(predictedValue, actualValue);
      const variancePercent = this.calculateVariance(predictedValue, actualValue);

      await this.pool.query(`
        INSERT INTO marketing_prediction_accuracy (
          prediction_type,
          predicted_value,
          actual_value,
          accuracy_score,
          variance_percent,
          draft_id,
          insight_id,
          measurement_date,
          measurement_period,
          context
        ) VALUES ($1, $2, $3, $4, $5, $6, $7, CURRENT_DATE, $8, $9)
      `, [
        predictionType,
        predictedValue,
        actualValue,
        accuracyScore,
        variancePercent,
        draftId || null,
        insightId || null,
        measurementPeriod || 'day_7',
        JSON.stringify({ platform, ...metadata } || {})
      ]);

      logger.info({
        msg: 'Learning loop: Prediction recorded',
        predictionType,
        accuracyScore,
        platform
      });

      // Update calibration after each prediction
      await this.updateCalibration(predictionType, platform);

      return { accuracyScore, variancePercent };
    } catch (error) {
      logger.error({
        msg: 'Learning loop: Failed to record prediction',
        error: error.message,
        predictionType,
        platform
      });
      throw new Error(`Failed to record prediction: ${error.message}`);
    }
  }

  /**
   * Calculate accuracy score between predicted and actual values (0.00 to 1.00)
   */
  calculateAccuracy(predicted, actual) {
    if (actual === 0) return predicted === 0 ? 1.0 : 0.0;
    const error = Math.abs(predicted - actual) / Math.abs(actual);
    return Math.max(0, Math.min(1, parseFloat((1 - error).toFixed(2))));
  }

  /**
   * Calculate variance percentage between predicted and actual values
   */
  calculateVariance(predicted, actual) {
    if (actual === 0) return predicted === 0 ? 0 : 100;
    return parseFloat((((predicted - actual) / actual) * 100).toFixed(2));
  }

  /**
   * Update calibration for a prediction type and platform
   */
  async updateCalibration(predictionType, platform = null, campaignType = null) {
    try {
      // Get recent accuracy data (last 30 predictions within 90 days)
      const recentAccuracy = await this.pool.query(`
        SELECT
          AVG(accuracy_score) as avg_accuracy,
          COUNT(*) as sample_size,
          STDDEV(accuracy_score) as std_dev
        FROM (
          SELECT accuracy_score
          FROM marketing_prediction_accuracy
          WHERE prediction_type = $1
            AND ($2::text IS NULL OR context->>'platform' = $2)
            AND measurement_date >= CURRENT_DATE - INTERVAL '90 days'
          ORDER BY measurement_date DESC
          LIMIT 30
        ) recent
      `, [predictionType, platform]);

      const { avg_accuracy, sample_size, std_dev } = recentAccuracy.rows[0];

      if (!sample_size || parseInt(sample_size, 10) < 5) {
        logger.info({
          msg: 'Learning loop: Insufficient data for calibration',
          predictionType,
          platform,
          sampleSize: sample_size
        });
        return null;
      }

      // Calculate confidence adjustment
      // Higher accuracy = higher confidence boost
      // Lower variance = higher confidence
      const confidenceAdjustment = this.calculateConfidenceAdjustment(
        parseFloat(avg_accuracy) || 0,
        parseFloat(std_dev) || 0
      );

      // Upsert calibration record
      // NOTE: NULL platform means "all platforms" calibration - applies when no platform-specific
      // calibration exists. This provides a fallback confidence adjustment for new platforms
      // or when predictions span multiple platforms.
      await this.pool.query(`
        INSERT INTO marketing_ai_calibration (
          prediction_type,
          platform,
          campaign_type,
          mean_accuracy,
          confidence_adjustment,
          sample_size,
          last_recalibrated_at,
          updated_at
        ) VALUES ($1, $2, $3, $4, $5, $6, NOW(), NOW())
        ON CONFLICT (prediction_type, platform, campaign_type)
        DO UPDATE SET
          mean_accuracy = EXCLUDED.mean_accuracy,
          confidence_adjustment = EXCLUDED.confidence_adjustment,
          sample_size = EXCLUDED.sample_size,
          last_recalibrated_at = NOW(),
          updated_at = NOW()
      `, [
        predictionType,
        platform,
        campaignType,
        avg_accuracy,
        confidenceAdjustment,
        sample_size
      ]);

      logger.info({
        msg: 'Learning loop: Calibration updated',
        predictionType,
        platform,
        meanAccuracy: avg_accuracy,
        confidenceAdjustment
      });

      return { meanAccuracy: avg_accuracy, confidenceAdjustment, sampleSize: sample_size };
    } catch (error) {
      logger.error({
        msg: 'Learning loop: Failed to update calibration',
        error: error.message,
        predictionType,
        platform
      });
      return null;
    }
  }

  /**
   * Calculate confidence adjustment based on accuracy and variance
   * Returns a multiplier between 0.5 and 1.3
   */
  calculateConfidenceAdjustment(avgAccuracy, stdDev) {
    // Base adjustment from accuracy (0.00-1.00 scale)
    // 0.80+ accuracy = positive adjustment
    // 0.60-0.80 = neutral
    // Below 0.60 = negative adjustment
    let adjustment = 1.0;

    if (avgAccuracy >= 0.80) {
      adjustment = 1.0 + (avgAccuracy - 0.80); // 1.00 to 1.20
    } else if (avgAccuracy < 0.60) {
      adjustment = 0.5 + (avgAccuracy / 0.60) * 0.5; // 0.50 to 1.00
    }

    // Reduce confidence if high variance (stdDev > 0.20)
    if (stdDev > 0.20) {
      adjustment -= (stdDev - 0.20); // Penalty for inconsistency
    }

    // Clamp to 0.5-1.3 range:
    // - 0.5 minimum: Never reduce confidence by more than 50% even for poor performance
    // - 1.3 maximum: Never boost confidence by more than 30% even for excellent performance
    // These bounds prevent overreaction to limited data samples
    return parseFloat(Math.max(0.5, Math.min(1.3, adjustment)).toFixed(3));
  }

  /**
   * Get calibration data for applying to new predictions
   */
  async getCalibration(predictionType, platform = null, campaignType = null) {
    try {
      const result = await this.pool.query(`
        SELECT
          prediction_type,
          platform,
          campaign_type,
          mean_accuracy,
          confidence_adjustment,
          sample_size,
          last_recalibrated_at
        FROM marketing_ai_calibration
        WHERE prediction_type = $1
          AND (platform IS NOT DISTINCT FROM $2)
          AND (campaign_type IS NOT DISTINCT FROM $3)
        ORDER BY last_recalibrated_at DESC
        LIMIT 1
      `, [predictionType, platform, campaignType]);

      return result.rows[0] || null;
    } catch (error) {
      logger.error({
        msg: 'Learning loop: Failed to get calibration',
        error: error.message,
        predictionType,
        platform
      });
      return null;
    }
  }

  /**
   * Get all calibration data for dashboard
   */
  async getAllCalibrations() {
    try {
      const result = await this.pool.query(`
        SELECT
          prediction_type,
          platform,
          campaign_type,
          mean_accuracy,
          confidence_adjustment,
          sample_size,
          last_recalibrated_at,
          updated_at
        FROM marketing_ai_calibration
        ORDER BY prediction_type, platform NULLS FIRST, campaign_type NULLS FIRST
      `);

      return result.rows;
    } catch (error) {
      logger.error({
        msg: 'Learning loop: Failed to get all calibrations',
        error: error.message
      });
      return [];
    }
  }

  /**
   * Get accuracy trends over time
   */
  async getAccuracyTrends(predictionType = null, days = 30) {
    try {
      const safeDays = parseInt(days, 10) || 30;

      const result = await this.pool.query(`
        SELECT
          measurement_date,
          prediction_type,
          context->>'platform' as platform,
          AVG(accuracy_score) as avg_accuracy,
          COUNT(*) as prediction_count
        FROM marketing_prediction_accuracy
        WHERE measurement_date >= CURRENT_DATE - make_interval(days => $1)
          AND ($2::text IS NULL OR prediction_type = $2)
        GROUP BY measurement_date, prediction_type, context->>'platform'
        ORDER BY measurement_date DESC
      `, [safeDays, predictionType]);

      return result.rows;
    } catch (error) {
      logger.error({
        msg: 'Learning loop: Failed to get accuracy trends',
        error: error.message,
        predictionType
      });
      return [];
    }
  }

  /**
   * Get prediction accuracy summary for dashboard
   */
  async getAccuracySummary() {
    try {
      const result = await this.pool.query(`
        SELECT
          prediction_type,
          context->>'platform' as platform,
          AVG(accuracy_score) as avg_accuracy,
          MIN(accuracy_score) as min_accuracy,
          MAX(accuracy_score) as max_accuracy,
          COUNT(*) as total_predictions,
          COUNT(CASE WHEN accuracy_score >= 0.80 THEN 1 END) as accurate_predictions
        FROM marketing_prediction_accuracy
        WHERE measurement_date >= CURRENT_DATE - INTERVAL '30 days'
        GROUP BY prediction_type, context->>'platform'
        ORDER BY prediction_type, context->>'platform'
      `);

      return result.rows;
    } catch (error) {
      logger.error({
        msg: 'Learning loop: Failed to get accuracy summary',
        error: error.message
      });
      return [];
    }
  }

  /**
   * Get recent individual predictions for dashboard display
   */
  async getRecentPredictions(limit = 10) {
    try {
      const safeLimit = Math.min(Math.max(1, parseInt(limit, 10) || 10), 50);

      const result = await this.pool.query(`
        SELECT
          pa.id,
          pa.prediction_type,
          pa.predicted_value,
          pa.actual_value,
          pa.accuracy_score,
          pa.variance_percent,
          pa.measurement_date,
          pa.measurement_period,
          pa.context->>'platform' as platform,
          d.name as draft_name
        FROM marketing_prediction_accuracy pa
        LEFT JOIN marketing_campaign_drafts d ON pa.draft_id = d.id
        ORDER BY pa.measurement_date DESC, pa.id DESC
        LIMIT $1
      `, [safeLimit]);

      return result.rows;
    } catch (error) {
      logger.error({
        msg: 'Learning loop: Failed to get recent predictions',
        error: error.message
      });
      return [];
    }
  }

  /**
   * Apply calibration adjustment to a confidence score
   */
  async applyCalibration(baseConfidence, predictionType, platform = null, campaignType = null) {
    const calibration = await this.getCalibration(predictionType, platform, campaignType);

    if (!calibration) {
      return baseConfidence; // No calibration data, return original
    }

    const adjustedConfidence = baseConfidence * (calibration.confidence_adjustment || 1.0);

    // Clamp between 0 and 1
    return Math.max(0, Math.min(1, adjustedConfidence));
  }

  /**
   * Process results from executed budget recommendations
   * Compares predictions to actual outcomes and records accuracy
   *
   * IMPORTANT: Only processes recommendations that have ACTUAL results recorded
   * (actual_cpl_change and actual_roas_change columns). Does NOT create placeholder
   * data where actualValue = predictedValue, as this would corrupt calibration with
   * false 100% accuracy scores.
   */
  async processExecutedRecommendations() {
    try {
      // Find recommendations executed 7+ days ago that:
      // 1. Haven't been analyzed yet (no prediction_accuracy record)
      // 2. Have actual results recorded (actual_cpl_change or actual_roas_change is NOT NULL)
      const result = await this.pool.query(`
        SELECT
          r.id,
          r.projected_improvement,
          r.execution_result,
          r.executed_at,
          r.recommended_allocation,
          r.actual_cpl_change,
          r.actual_roas_change
        FROM marketing_budget_recommendations r
        WHERE r.status = 'executed'
          AND r.executed_at <= NOW() - INTERVAL '7 days'
          AND (r.actual_cpl_change IS NOT NULL OR r.actual_roas_change IS NOT NULL)
          AND NOT EXISTS (
            SELECT 1 FROM marketing_prediction_accuracy p
            WHERE p.context->>'recommendation_id' = r.id::text
          )
      `);

      let processed = 0;

      for (const rec of result.rows) {
        const projectedImprovement = rec.projected_improvement || {};
        const recommendedAllocation = rec.recommended_allocation || {};

        // Determine primary platform from allocation
        const platforms = Object.keys(recommendedAllocation);
        const platform = platforms.length > 0 ? platforms[0] : null;

        // Record CPL prediction accuracy only if we have BOTH predicted AND actual data
        if (projectedImprovement.cpl_change_percent != null && rec.actual_cpl_change != null) {
          try {
            // Parse values - database may return strings
            const predictedCpl = parseFloat(projectedImprovement.cpl_change_percent);
            const actualCpl = parseFloat(rec.actual_cpl_change);

            // Skip if values are not valid numbers
            if (isNaN(predictedCpl) || isNaN(actualCpl)) {
              logger.warn({
                msg: 'Learning loop: Skipping CPL record with invalid numeric values',
                recommendationId: rec.id,
                predictedCpl: projectedImprovement.cpl_change_percent,
                actualCpl: rec.actual_cpl_change
              });
            } else {
              await this.recordPrediction({
                predictionType: 'cpl_change',
                predictedValue: predictedCpl,
                actualValue: actualCpl,
                platform,
                measurementPeriod: 'day_7',
                metadata: { recommendationId: rec.id }
              });
              processed++;
            }
          } catch (err) {
            logger.error({
              msg: 'Learning loop: Failed to record CPL prediction',
              recommendationId: rec.id,
              error: err.message
            });
          }
        }

        // Record ROAS prediction accuracy only if we have BOTH predicted AND actual data
        if (projectedImprovement.roas_change_percent != null && rec.actual_roas_change != null) {
          try {
            // Parse values - database may return strings
            const predictedRoas = parseFloat(projectedImprovement.roas_change_percent);
            const actualRoas = parseFloat(rec.actual_roas_change);

            // Skip if values are not valid numbers
            if (isNaN(predictedRoas) || isNaN(actualRoas)) {
              logger.warn({
                msg: 'Learning loop: Skipping ROAS record with invalid numeric values',
                recommendationId: rec.id,
                predictedRoas: projectedImprovement.roas_change_percent,
                actualRoas: rec.actual_roas_change
              });
            } else {
              await this.recordPrediction({
                predictionType: 'roas_change',
                predictedValue: predictedRoas,
                actualValue: actualRoas,
                platform,
                measurementPeriod: 'day_7',
                metadata: { recommendationId: rec.id }
              });
              processed++;
            }
          } catch (err) {
            logger.error({
              msg: 'Learning loop: Failed to record ROAS prediction',
              recommendationId: rec.id,
              error: err.message
            });
          }
        }
      }

      logger.info({
        msg: 'Learning loop: Processed executed recommendations',
        processed,
        recommendationsWithActuals: result.rows.length
      });

      return { processed };
    } catch (error) {
      logger.error({
        msg: 'Learning loop: Failed to process executed recommendations',
        error: error.message
      });
      return { processed: 0, error: error.message };
    }
  }

  /**
   * Record actual results for a recommendation after measurement period
   * Call this with actual performance data to track prediction accuracy
   */
  async recordRecommendationResults(recommendationId, actualResults) {
    const { actualCplChange, actualRoasChange, platform } = actualResults;

    try {
      // Get the original recommendation
      const recResult = await this.pool.query(
        'SELECT projected_improvement FROM marketing_budget_recommendations WHERE id = $1',
        [recommendationId]
      );

      if (recResult.rows.length === 0) {
        throw new Error('Recommendation not found');
      }

      const projectedImprovement = recResult.rows[0].projected_improvement || {};

      // Record CPL accuracy
      if (projectedImprovement.cpl_change_percent != null && actualCplChange != null) {
        await this.recordPrediction({
          predictionType: 'cpl_change',
          predictedValue: projectedImprovement.cpl_change_percent,
          actualValue: actualCplChange,
          platform,
          measurementPeriod: 'day_7',
          metadata: { recommendationId }
        });
      }

      // Record ROAS accuracy
      if (projectedImprovement.roas_change_percent != null && actualRoasChange != null) {
        await this.recordPrediction({
          predictionType: 'roas_change',
          predictedValue: projectedImprovement.roas_change_percent,
          actualValue: actualRoasChange,
          platform,
          measurementPeriod: 'day_7',
          metadata: { recommendationId }
        });
      }

      logger.info({
        msg: 'Learning loop: Recommendation results recorded',
        recommendationId,
        actualCplChange,
        actualRoasChange
      });

      return { success: true };
    } catch (error) {
      logger.error({
        msg: 'Learning loop: Failed to record recommendation results',
        error: error.message,
        recommendationId
      });
      throw new Error(`Failed to record recommendation results: ${error.message}`);
    }
  }

  /**
   * Run the full learning loop cycle
   */
  async runLearningCycle() {
    logger.info({ msg: 'Learning loop: Starting cycle' });

    const results = {
      recommendationsProcessed: 0,
      calibrationsUpdated: 0,
      errors: []
    };

    try {
      // Process any executed recommendations
      const processResult = await this.processExecutedRecommendations();
      results.recommendationsProcessed = processResult.processed;

      // Update calibrations for all prediction types
      const predictionTypes = ['cpl_change', 'roas_change', 'conversion_rate', 'ctr', 'cpl', 'roas'];

      for (const type of predictionTypes) {
        const calibResult = await this.updateCalibration(type, null, null);
        if (calibResult) {
          results.calibrationsUpdated++;
        }
      }

      logger.info({
        msg: 'Learning loop: Cycle completed',
        ...results
      });

    } catch (error) {
      logger.error({
        msg: 'Learning loop: Cycle failed',
        error: error.message
      });
      results.errors.push(error.message);
    }

    return results;
  }

  /**
   * Get learning loop status for monitoring
   */
  async getStatus() {
    try {
      const [calibrations, recentPredictions, summary] = await Promise.all([
        this.getAllCalibrations(),
        this.pool.query(`
          SELECT COUNT(*) as count, MAX(measurement_date) as latest_date
          FROM marketing_prediction_accuracy
          WHERE measurement_date >= CURRENT_DATE - INTERVAL '7 days'
        `),
        this.getAccuracySummary()
      ]);

      return {
        calibrationCount: calibrations.length,
        recentPredictions: parseInt(recentPredictions.rows[0]?.count || 0, 10),
        latestPredictionDate: recentPredictions.rows[0]?.latest_date,
        summary,
        calibrations
      };
    } catch (error) {
      logger.error({
        msg: 'Learning loop: Failed to get status',
        error: error.message
      });
      return {
        calibrationCount: 0,
        recentPredictions: 0,
        latestPredictionDate: null,
        summary: [],
        calibrations: [],
        error: error.message
      };
    }
  }
}

module.exports = MarketingLearningLoop;
