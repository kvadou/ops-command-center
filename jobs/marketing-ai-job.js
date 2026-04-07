#!/usr/bin/env node
/**
 * Scheduled Job: Marketing AI Analysis
 * Runs daily AI analysis and generates insights, tracks results, and creates alerts
 *
 * Heroku Scheduler Configuration:
 * - Frequency: Daily at 6:00 AM UTC
 * - Command: node jobs/marketing-ai-job.js [environment]
 *
 * Environments: local, staging, production, westside, eastside
 */

require('dotenv').config();
const { getPool } = require('../database-connections');
const MarketingAiBrain = require('../services/marketing-ai-brain');
const MarketingResultsTracker = require('../services/marketing-results-tracker');
const MarketingAlertsService = require('../services/marketing-alerts-service');
const KlaviyoSyncService = require('../services/klaviyo-sync-service');
const MarketingBudgetOptimizer = require('../services/marketing-budget-optimizer');
const MarketingLearningLoop = require('../services/marketing-learning-loop');
const { logger } = require('../utils/logger');

async function marketingAiJob(environment) {
  // Feature flag check
  if (process.env.MARKETING_AI_DISABLED === 'true') {
    logger.info({
      msg: 'Marketing AI job skipped - disabled via env',
      environment
    });
    return {
      skipped: true,
      reason: 'MARKETING_AI_DISABLED is set to true'
    };
  }

  const pool = getPool(environment);

  // Initialize services
  const aiBrain = new MarketingAiBrain(pool);
  const resultsTracker = new MarketingResultsTracker(pool);
  const alertsService = new MarketingAlertsService(pool);
  const klaviyoSync = new KlaviyoSyncService(pool);
  const budgetOptimizer = new MarketingBudgetOptimizer(pool);
  const learningLoop = new MarketingLearningLoop(pool);

  logger.info({
    msg: 'Starting Marketing AI job',
    environment,
    timestamp: new Date().toISOString()
  });

  const results = {
    klaviyoSync: null,
    aiAnalysis: null,
    resultsTracking: null,
    alerts: null,
    budgetOptimization: null,
    learningLoop: null,
    errors: []
  };

  // Step 1: Sync Klaviyo data (if configured)
  try {
    if (process.env.KLAVIYO_API_KEY) {
      logger.info({ msg: 'Step 1: Syncing Klaviyo data' });
      results.klaviyoSync = await klaviyoSync.syncAll();
      logger.info({
        msg: 'Klaviyo sync completed',
        flows: results.klaviyoSync.flows,
        lists: results.klaviyoSync.lists
      });
    } else {
      logger.info({ msg: 'Step 1: Skipping Klaviyo sync - no API key configured' });
      results.klaviyoSync = { skipped: true, reason: 'No KLAVIYO_API_KEY' };
    }
  } catch (error) {
    logger.error({
      msg: 'Klaviyo sync failed',
      error: error.message,
      stack: error.stack
    });
    results.errors.push({ step: 'klaviyoSync', error: error.message });
  }

  // Step 2: Run AI Analysis
  try {
    // Check if Anthropic key is configured
    if (process.env.ANTHROPIC_API_KEY) {
      logger.info({ msg: 'Step 2: Running AI analysis' });
      results.aiAnalysis = await aiBrain.runAnalysis();
      logger.info({
        msg: 'AI analysis completed',
        insightsGenerated: results.aiAnalysis.insightsSaved
      });
    } else {
      logger.info({ msg: 'Step 2: Skipping AI analysis - no ANTHROPIC_API_KEY configured' });
      results.aiAnalysis = { skipped: true, reason: 'No ANTHROPIC_API_KEY' };
    }
  } catch (error) {
    logger.error({
      msg: 'AI analysis failed',
      error: error.message,
      stack: error.stack
    });
    results.errors.push({ step: 'aiAnalysis', error: error.message });
  }

  // Step 3: Track Results for pushed campaigns
  try {
    logger.info({ msg: 'Step 3: Running results tracking' });
    results.resultsTracking = await resultsTracker.runScheduledSnapshots();
    logger.info({
      msg: 'Results tracking completed',
      snapshotsTaken: results.resultsTracking.snapshotsTaken
    });
  } catch (error) {
    logger.error({
      msg: 'Results tracking failed',
      error: error.message,
      stack: error.stack
    });
    results.errors.push({ step: 'resultsTracking', error: error.message });
  }

  // Step 4: Generate Alerts
  try {
    logger.info({ msg: 'Step 4: Generating alerts' });
    results.alerts = await alertsService.runAlertGeneration();
    logger.info({
      msg: 'Alert generation completed',
      alertsGenerated: results.alerts.total
    });
  } catch (error) {
    logger.error({
      msg: 'Alert generation failed',
      error: error.message,
      stack: error.stack
    });
    results.errors.push({ step: 'alerts', error: error.message });
  }

  // Step 5: Run Budget Optimization (weekly on Mondays)
  try {
    const today = new Date();
    if (today.getDay() === 1) { // Monday = 1
      logger.info({ msg: 'Step 5: Running budget optimization (Monday)' });
      results.budgetOptimization = await budgetOptimizer.analyzeBudgetAllocation();
      logger.info({
        msg: 'Budget optimization completed',
        recommendations: results.budgetOptimization?.recommendations?.length || 0
      });
    } else {
      logger.info({ msg: 'Step 5: Skipping budget optimization (not Monday)' });
      results.budgetOptimization = { skipped: true, reason: 'Only runs on Mondays' };
    }
  } catch (error) {
    logger.error({
      msg: 'Budget optimization failed',
      error: error.message,
      stack: error.stack
    });
    results.errors.push({ step: 'budgetOptimization', error: error.message });
  }

  // Step 6: Run Learning Loop
  try {
    logger.info({ msg: 'Step 6: Running learning loop' });
    results.learningLoop = await learningLoop.runLearningCycle();
    logger.info({
      msg: 'Learning loop completed',
      recommendationsProcessed: results.learningLoop?.recommendationsProcessed || 0,
      calibrationsUpdated: results.learningLoop?.calibrationsUpdated || 0
    });
  } catch (error) {
    logger.error({
      msg: 'Learning loop failed',
      error: error.message,
      stack: error.stack
    });
    results.errors.push({ step: 'learningLoop', error: error.message });
  }

  // Log job run to database
  try {
    await pool.query(`
      INSERT INTO marketing_ai_job_runs (
        environment,
        run_at,
        klaviyo_sync_result,
        ai_analysis_result,
        results_tracking_result,
        alerts_result,
        budget_optimization_result,
        learning_loop_result,
        errors,
        status
      ) VALUES ($1, NOW(), $2, $3, $4, $5, $6, $7, $8, $9)
    `, [
      environment,
      JSON.stringify(results.klaviyoSync),
      JSON.stringify(results.aiAnalysis),
      JSON.stringify(results.resultsTracking),
      JSON.stringify(results.alerts),
      JSON.stringify(results.budgetOptimization),
      JSON.stringify(results.learningLoop),
      JSON.stringify(results.errors),
      results.errors.length > 0 ? 'completed_with_errors' : 'completed'
    ]);
  } catch (error) {
    logger.error({
      msg: 'Failed to log job run',
      error: error.message
    });
  }

  logger.info({
    msg: 'Marketing AI job completed',
    environment,
    status: results.errors.length > 0 ? 'completed_with_errors' : 'completed',
    summary: {
      klaviyoSync: results.klaviyoSync?.skipped ? 'skipped' : 'completed',
      aiAnalysis: results.aiAnalysis?.skipped ? 'skipped' : `${results.aiAnalysis?.insightsSaved || 0} insights`,
      resultsTracking: `${results.resultsTracking?.snapshotsTaken || 0} snapshots`,
      alerts: `${results.alerts?.total || 0} alerts`,
      budgetOptimization: results.budgetOptimization?.skipped ? 'skipped' : `${results.budgetOptimization?.recommendations?.length || 0} recommendations`,
      learningLoop: `${results.learningLoop?.recommendationsProcessed || 0} processed, ${results.learningLoop?.calibrationsUpdated || 0} calibrations`,
      errors: results.errors.length
    }
  });

  return results;
}

// Main execution
const environment = process.argv[2] || process.env.NODE_ENV || 'local';

if (!['local', 'staging', 'production', 'westside', 'eastside'].includes(environment)) {
  logger.error('Invalid environment. Must be: local, staging, production, westside, eastside');
  process.exit(1);
}

marketingAiJob(environment)
  .then((result) => {
    logger.info('\n========== Marketing AI Job Results ==========');
    logger.info({ data: result }, 'Object dump');
    logger.info('===============================================\n');
    process.exit(result.errors?.length > 0 ? 1 : 0);
  })
  .catch((error) => {
    logger.error({ err: error }, 'Marketing AI job failed:');
    process.exit(1);
  });

module.exports = marketingAiJob;
