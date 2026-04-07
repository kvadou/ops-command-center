/**
 * Marketing Command Center API Routes
 *
 * AI-powered marketing advisor endpoints for chat, conversations,
 * and action approval workflow.
 */

const express = require('express');
const router = express.Router();
const { Pool } = require('pg');
const { asyncHandler } = require('../middleware/error-handler');
const { logger } = require('../utils/logger');
const MarketingCommandService = require('../services/marketing-command-service');
const MarketingDataAggregator = require('../services/marketing-data-aggregator');
const MarketingActionExecutor = require('../services/marketing-action-executor');
const MarketingReportService = require('../services/marketing-report-service');
const MarketingCampaignDraftService = require('../services/marketing-campaign-draft-service');
const MarketingCampaignCreationService = require('../services/marketing-campaign-creation-service');
const MarketingBlogDraftService = require('../services/marketing-blog-draft-service');
const MarketingABTestService = require('../services/marketing-ab-test-service');
const MarketingInstagramService = require('../services/marketing-instagram-service');
const KlaviyoSyncService = require('../services/klaviyo-sync-service');
const MarketingAiBrain = require('../services/marketing-ai-brain');
const MarketingResultsTracker = require('../services/marketing-results-tracker');
const MarketingAlertsService = require('../services/marketing-alerts-service');
const MarketingBudgetOptimizer = require('../services/marketing-budget-optimizer');
const MarketingLearningLoop = require('../services/marketing-learning-loop');

// Database connection - handle local development vs production
const isLocal = process.env.DATABASE_URL?.includes('localhost') ||
                process.env.DATABASE_URL?.includes('127.0.0.1');

const needsSSL = !isLocal && process.env.DATABASE_URL &&
  (process.env.DATABASE_URL.includes('rds.amazonaws.com') ||
   process.env.DATABASE_URL.includes('cluster-') ||
   /postgres:\/\/[a-z]{10,}:[^@]+@/.test(process.env.DATABASE_URL));

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: needsSSL ? { rejectUnauthorized: false } : false
});

// Initialize services
const commandService = new MarketingCommandService(pool);
const dataAggregator = new MarketingDataAggregator(pool);
const actionExecutor = new MarketingActionExecutor(pool);
const reportService = new MarketingReportService(pool);
const draftService = new MarketingCampaignDraftService(pool);
const campaignCreationService = new MarketingCampaignCreationService(pool);
const blogDraftService = new MarketingBlogDraftService(pool);
const abTestService = new MarketingABTestService(pool);
const instagramService = new MarketingInstagramService(pool);
const klaviyoSyncService = new KlaviyoSyncService(pool);
const aiBrain = new MarketingAiBrain(pool);
const resultsTracker = new MarketingResultsTracker(pool);
const alertsService = new MarketingAlertsService(pool);

/**
 * Helper to get user info from request
 */
function getUserInfo(req) {
  return {
    userId: req.auth?.userId || req.user?.id || null,
    userEmail: req.auth?.email || req.user?.email || 'unknown@acmeops.com',
  };
}

// ============================================
// CHAT ENDPOINTS
// ============================================

/**
 * POST /api/marketing-command-center/chat
 * Send a message and get AI response
 */
router.post('/chat', asyncHandler(async (req, res) => {
  const { conversation_id, message } = req.body;
  const { userId, userEmail } = getUserInfo(req);

  if (!message || !message.trim()) {
    return res.status(400).json({
      success: false,
      error: 'Message is required'
    });
  }

  const result = await commandService.chat({
    conversationId: conversation_id,
    userMessage: message.trim(),
    userId,
    userEmail,
  });

  if (!result.success) {
    return res.status(result.budgetExceeded ? 429 : 500).json(result);
  }

  res.json(result);
}));

/**
 * GET /api/marketing-command-center/suggestions
 * Get suggested questions for new conversations
 */
router.get('/suggestions', asyncHandler(async (req, res) => {
  const suggestions = commandService.getSuggestedQuestions();
  res.json(suggestions);
}));

/**
 * GET /api/marketing-command-center/debug/live-ads
 * Debug endpoint to test live ad platform data access
 */
router.get('/debug/live-ads', asyncHandler(async (req, res) => {
  const testMessage = req.query.message || 'review our google ads account';

  // Test detection
  const isGoogle = dataAggregator.isGoogleAdsQuestion(testMessage);
  const isMeta = dataAggregator.isMetaAdsQuestion(testMessage);

  // Get live data context
  const liveContext = await dataAggregator.getLiveAdPlatformContext(testMessage);

  // Also try direct API calls
  const googleDirect = await dataAggregator.getLiveGoogleCampaigns();
  const metaDirect = await dataAggregator.getLiveMetaCampaigns();

  res.json({
    testMessage,
    detection: {
      isGoogleQuestion: isGoogle,
      isMetaQuestion: isMeta,
    },
    services: {
      googleAdsAvailable: !!dataAggregator.googleAdsService,
      googleAdsEnabled: dataAggregator.googleAdsService?.enabled || false,
      metaAdsAvailable: !!dataAggregator.metaAdsService,
      metaAdsEnabled: dataAggregator.metaAdsService?.enabled || false,
    },
    directResults: {
      google: {
        success: googleDirect.success,
        error: googleDirect.error,
        campaignCount: googleDirect.campaigns?.length || 0,
      },
      meta: {
        success: metaDirect.success,
        error: metaDirect.error,
        campaignCount: metaDirect.campaigns?.length || 0,
      },
    },
    liveContextLength: liveContext.length,
    liveContextPreview: liveContext.substring(0, 500) + (liveContext.length > 500 ? '...' : ''),
  });
}));

// ============================================
// CONVERSATION ENDPOINTS
// ============================================

/**
 * GET /api/marketing-command-center/conversations
 * List user's conversations
 */
router.get('/conversations', asyncHandler(async (req, res) => {
  const { userId, userEmail } = getUserInfo(req);
  const conversations = await commandService.getConversations(userId, userEmail);
  res.json(conversations);
}));

/**
 * GET /api/marketing-command-center/conversations/:id
 * Get a specific conversation with messages
 */
router.get('/conversations/:id', asyncHandler(async (req, res) => {
  const { id } = req.params;

  const conversation = await commandService.getConversation(parseInt(id));

  if (!conversation) {
    return res.status(404).json({
      success: false,
      error: 'Conversation not found'
    });
  }

  res.json(conversation);
}));

/**
 * POST /api/marketing-command-center/conversations
 * Create a new conversation
 */
router.post('/conversations', asyncHandler(async (req, res) => {
  const { userId, userEmail } = getUserInfo(req);

  const conversationId = await commandService.createConversation(userId, userEmail);

  res.json({
    success: true,
    conversation_id: conversationId
  });
}));

// ============================================
// PENDING ACTIONS ENDPOINTS
// ============================================

/**
 * GET /api/marketing-command-center/pending-actions
 * List pending actions awaiting approval
 */
router.get('/pending-actions', asyncHandler(async (req, res) => {
  const { status } = req.query;
  const actions = await commandService.getPendingActions(status || 'pending');
  res.json(actions);
}));

/**
 * POST /api/marketing-command-center/approve-action/:id
 * Approve a pending action
 */
router.post('/approve-action/:id', asyncHandler(async (req, res) => {
  const { id } = req.params;
  const { userEmail } = getUserInfo(req);

  const result = await commandService.approveAction(parseInt(id), userEmail);

  if (!result.success) {
    return res.status(400).json(result);
  }

  res.json(result);
}));

/**
 * POST /api/marketing-command-center/reject-action/:id
 * Reject a pending action
 */
router.post('/reject-action/:id', asyncHandler(async (req, res) => {
  const { id } = req.params;
  const { reason } = req.body;
  const { userEmail } = getUserInfo(req);

  const result = await commandService.rejectAction(parseInt(id), userEmail, reason);

  if (!result.success) {
    return res.status(400).json(result);
  }

  res.json(result);
}));

/**
 * POST /api/marketing-command-center/execute-action/:id
 * Execute an approved action
 */
router.post('/execute-action/:id', asyncHandler(async (req, res) => {
  const { id } = req.params;

  try {
    const result = await actionExecutor.executeAction(parseInt(id));
    res.json(result);
  } catch (error) {
    logger.error({ err: error }, `Error executing action ${id}:`);
    res.status(400).json({
      success: false,
      error: error.message,
    });
  }
}));

/**
 * POST /api/marketing-command-center/rollback-action/:id
 * Rollback an executed action
 */
router.post('/rollback-action/:id', asyncHandler(async (req, res) => {
  const { id } = req.params;

  try {
    const result = await actionExecutor.rollbackAction(parseInt(id));
    res.json(result);
  } catch (error) {
    logger.error({ err: error }, `Error rolling back action ${id}:`);
    res.status(400).json({
      success: false,
      error: error.message,
    });
  }
}));

/**
 * GET /api/marketing-command-center/action-history/:id
 * Get execution history for an action
 */
router.get('/action-history/:id', asyncHandler(async (req, res) => {
  const { id } = req.params;
  const history = await actionExecutor.getExecutionHistory(parseInt(id));
  res.json(history);
}));

/**
 * GET /api/marketing-command-center/recent-executions
 * Get all recent action executions
 */
router.get('/recent-executions', asyncHandler(async (req, res) => {
  const { limit } = req.query;
  const executions = await actionExecutor.getRecentExecutions(
    limit ? parseInt(limit) : 50
  );
  res.json(executions);
}));

// ============================================
// INSIGHTS ENDPOINTS
// ============================================

/**
 * GET /api/marketing-command-center/insights-summary
 * Get quick metrics summary for sidebar display
 */
router.get('/insights-summary', asyncHandler(async (req, res) => {
  // Support period parameter: 'day', 'week' (default), 'month'
  const period = req.query.period || 'week';
  const summary = await dataAggregator.getInsightsSummary(period);

  if (!summary) {
    return res.status(500).json({
      success: false,
      error: 'Failed to load insights'
    });
  }

  res.json(summary);
}));

/**
 * GET /api/marketing-command-center/leads
 * Get individual lead records for the time period
 */
router.get('/leads', asyncHandler(async (req, res) => {
  const period = req.query.period || 'week';
  const platform = req.query.platform || null; // Optional filter by platform
  const limit = Math.min(parseInt(req.query.limit) || 100, 500);

  const leads = await dataAggregator.getLeadsList(period, { platform, limit });
  res.json(leads);
}));

/**
 * GET /api/marketing-command-center/live-campaigns
 * Get live campaign counts from Meta and Google ad platforms
 */
router.get('/live-campaigns', asyncHandler(async (req, res) => {
  // Fetch live data from both platforms in parallel
  const [googleData, metaData] = await Promise.all([
    dataAggregator.getLiveGoogleCampaigns(),
    dataAggregator.getLiveMetaCampaigns(),
  ]);

  // Extract counts and status
  const google = {
    available: googleData.success,
    total: googleData.summary?.totalCampaigns || 0,
    active: googleData.summary?.enabledCount || 0,
    paused: googleData.summary?.pausedCount || 0,
    error: googleData.error || null,
  };

  const meta = {
    available: metaData.success,
    total: metaData.summary?.totalCampaigns || 0,
    active: metaData.summary?.activeCount || 0,
    paused: metaData.summary?.pausedCount || 0,
    error: metaData.error || null,
  };

  // Also get Klaviyo flow count if available
  let klaviyo = { available: false, active: 0, error: null };
  try {
    const KlaviyoService = require('../services/klaviyo-service');
    const klaviyoService = new KlaviyoService(pool);
    const flows = await klaviyoService.getFlows();
    if (flows && flows.data) {
      const activeFlows = flows.data.filter(f => f.attributes?.status === 'live').length;
      klaviyo = { available: true, active: activeFlows, total: flows.data.length };
    }
  } catch (err) {
    klaviyo = { available: false, active: 0, error: err.message };
  }

  res.json({
    google,
    meta,
    klaviyo,
    combined: {
      total: google.total + meta.total,
      active: google.active + meta.active + klaviyo.active,
    },
    fetchedAt: new Date().toISOString(),
  });
}));

/**
 * GET /api/marketing-command-center/usage-stats
 * Get AI usage statistics
 */
router.get('/usage-stats', asyncHandler(async (req, res) => {
  const stats = await commandService.getUsageStats();
  res.json(stats);
}));

/**
 * GET /api/marketing-command-center/sync-status
 * Get ad data sync status including last sync time and record counts
 */
router.get('/sync-status', asyncHandler(async (req, res) => {
  // Get record counts and last sync times from ad_spend_data table
  const result = await pool.query(`
    SELECT
      platform,
      COUNT(*) as record_count,
      MAX(updated_at) as last_updated,
      MIN(date) as oldest_date,
      MAX(date) as newest_date
    FROM ad_spend_data
    GROUP BY platform
  `);

  // Get overall last sync time
  const overallResult = await pool.query(`
    SELECT MAX(updated_at) as last_sync FROM ad_spend_data
  `);

  const platforms = {};
  result.rows.forEach(row => {
    platforms[row.platform] = {
      recordCount: parseInt(row.record_count),
      lastUpdated: row.last_updated,
      oldestDate: row.oldest_date,
      newestDate: row.newest_date,
    };
  });

  // Check API configuration status
  let metaConfigured = false;
  let googleConfigured = false;

  try {
    metaConfigured = !!(process.env.META_ACCESS_TOKEN && process.env.META_AD_ACCOUNT_ID);
    googleConfigured = !!(process.env.GOOGLE_ADS_CLIENT_ID && process.env.GOOGLE_ADS_DEVELOPER_TOKEN && process.env.GOOGLE_ADS_CUSTOMER_ID);
  } catch (err) {
    logger.error({ err: err }, 'Error checking API configuration:');
  }

  res.json({
    lastSync: overallResult.rows[0]?.last_sync || null,
    platforms,
    configuration: {
      meta: metaConfigured,
      google: googleConfigured,
    },
    totalRecords: result.rows.reduce((sum, row) => sum + parseInt(row.record_count), 0),
  });
}));

/**
 * POST /api/marketing-command-center/trigger-sync
 * Trigger a manual ad data sync
 */
router.post('/trigger-sync', asyncHandler(async (req, res) => {
  const { platform = 'all', days = 30 } = req.body;

  // Calculate date range
  const endDate = new Date().toISOString().split('T')[0];
  const startDate = new Date(Date.now() - days * 24 * 60 * 60 * 1000).toISOString().split('T')[0];

  // Forward the request to the ad-sync endpoint
  const fetch = require('node-fetch');
  const token = req.headers.authorization;
  const baseUrl = process.env.APP_URL || `http://localhost:${process.env.PORT || 3000}`;

  try {
    const syncRes = await fetch(`${baseUrl}/api/ad-sync/sync`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': token,
      },
      body: JSON.stringify({ platform, startDate, endDate }),
    });

    const syncData = await syncRes.json();

    if (syncRes.ok) {
      res.json({
        success: true,
        message: 'Sync triggered successfully',
        results: syncData.results || syncData,
      });
    } else {
      res.status(syncRes.status).json({
        success: false,
        error: syncData.error || 'Sync failed',
        details: syncData,
      });
    }
  } catch (err) {
    logger.error({ err: err }, 'Error triggering sync:');
    res.status(500).json({
      success: false,
      error: 'Failed to trigger sync',
      details: err.message,
    });
  }
}));

// ============================================
// SCENARIO MODELING ENDPOINTS
// ============================================

/**
 * GET /api/marketing-command-center/scenario
 * Model a budget scenario
 * Query params: weeklyBudget, platform (optional)
 */
router.get('/scenario', asyncHandler(async (req, res) => {
  const { weeklyBudget, platform } = req.query;

  if (!weeklyBudget || isNaN(parseFloat(weeklyBudget))) {
    return res.status(400).json({
      success: false,
      error: 'weeklyBudget is required and must be a number',
    });
  }

  const scenario = await dataAggregator.modelBudgetScenario(
    parseFloat(weeklyBudget),
    platform || 'split'
  );

  res.json(scenario);
}));

/**
 * GET /api/marketing-command-center/benchmarks
 * Get historical performance benchmarks
 */
router.get('/benchmarks', asyncHandler(async (req, res) => {
  const benchmarks = await dataAggregator.getHistoricalBenchmarks();
  res.json(benchmarks);
}));

/**
 * POST /api/marketing-command-center/budget-recommendation
 * Get optimal budget recommendation based on targets
 * Body: { leadsPerWeek, registrationsPerWeek, revenuePerWeek }
 */
router.post('/budget-recommendation', asyncHandler(async (req, res) => {
  const { leadsPerWeek, registrationsPerWeek, revenuePerWeek } = req.body;

  const targets = {};
  if (leadsPerWeek) targets.leadsPerWeek = parseInt(leadsPerWeek);
  if (registrationsPerWeek) targets.registrationsPerWeek = parseInt(registrationsPerWeek);
  if (revenuePerWeek) targets.revenuePerWeek = parseFloat(revenuePerWeek);

  if (Object.keys(targets).length === 0) {
    return res.status(400).json({
      success: false,
      error: 'At least one target is required (leadsPerWeek, registrationsPerWeek, or revenuePerWeek)',
    });
  }

  const recommendation = await dataAggregator.getOptimalBudgetRecommendation(targets);
  res.json(recommendation);
}));

/**
 * POST /api/marketing-command-center/invalidate-cache
 * Invalidate insights cache
 * Body: { insightType } (optional - if not provided, clears expired entries)
 */
router.post('/invalidate-cache', asyncHandler(async (req, res) => {
  const { insightType } = req.body;
  await dataAggregator.invalidateCache(insightType || null);
  res.json({ success: true, message: 'Cache invalidated' });
}));

// ============================================
// ANALYTICS ENDPOINTS
// ============================================

/**
 * GET /api/marketing-command-center/analytics/trends
 * Get spend, leads, and ROAS trends over time
 */
router.get('/analytics/trends', asyncHandler(async (req, res) => {
  const { range = 'last_30_days' } = req.query;
  const dates = dataAggregator.getDateRange(range);

  try {
    const result = await pool.query(`
      WITH daily_metrics AS (
        SELECT
          a.date,
          SUM(a.spend) as spend,
          SUM(a.clicks) as clicks,
          COUNT(DISTINCT bs.id) as leads,
          SUM(CASE WHEN bs.payment_status = 'paid' THEN COALESCE(bs.actual_price, 0) ELSE 0 END) as revenue
        FROM ad_spend_data a
        LEFT JOIN booking_submissions bs ON (
          LOWER(bs.utm_campaign) = LOWER(a.utm_campaign)
          AND DATE(bs.created_at) = a.date
        )
        WHERE a.date >= $1 AND a.date <= $2
        GROUP BY a.date
        ORDER BY a.date ASC
      )
      SELECT
        date,
        spend,
        leads,
        revenue,
        CASE WHEN spend > 0 THEN revenue / spend ELSE 0 END as roas
      FROM daily_metrics
    `, [dates.startDate, dates.endDate]);

    res.json(result.rows);
  } catch (error) {
    logger.error({ err: error }, 'Error fetching trends:');
    res.json([]);
  }
}));

/**
 * GET /api/marketing-command-center/analytics/campaigns
 * Get campaign performance for charts
 */
router.get('/analytics/campaigns', asyncHandler(async (req, res) => {
  const { range = 'last_30_days' } = req.query;
  const dates = dataAggregator.getDateRange(range);

  try {
    const result = await pool.query(`
      SELECT
        a.platform,
        a.campaign_id,
        a.campaign_name,
        SUM(a.spend) as spend,
        SUM(a.clicks) as clicks,
        COUNT(DISTINCT bs.id) as leads,
        SUM(CASE WHEN bs.payment_status = 'paid' THEN COALESCE(bs.actual_price, 0) ELSE 0 END) as revenue
      FROM ad_spend_data a
      LEFT JOIN booking_submissions bs ON (
        LOWER(bs.utm_campaign) = LOWER(a.utm_campaign)
        AND bs.created_at >= $1 AND bs.created_at <= $2
      )
      WHERE a.date >= $1 AND a.date <= $2
      GROUP BY a.platform, a.campaign_id, a.campaign_name
      HAVING SUM(a.spend) > 0
      ORDER BY SUM(a.spend) DESC
      LIMIT 20
    `, [dates.startDate, dates.endDate]);

    res.json(result.rows);
  } catch (error) {
    logger.error({ err: error }, 'Error fetching campaigns:');
    res.json([]);
  }
}));

/**
 * GET /api/marketing-command-center/analytics/cohorts
 * Get cohort retention data for charts
 */
router.get('/analytics/cohorts', asyncHandler(async (req, res) => {
  try {
    const cohorts = await dataAggregator.getCohortRetention();
    res.json(cohorts);
  } catch (error) {
    logger.error({ err: error }, 'Error fetching cohorts:');
    res.json([]);
  }
}));

// ============================================
// REPORT ENDPOINTS
// ============================================

/**
 * POST /api/marketing-command-center/reports/generate
 * Generate a weekly marketing report
 */
router.post('/reports/generate', asyncHandler(async (req, res) => {
  const { endDate, compareToPrevious = true } = req.body;

  try {
    const report = await reportService.generateWeeklyReport({
      endDate: endDate ? new Date(endDate) : new Date(),
      compareToPrevious,
    });

    res.json({
      success: true,
      report,
    });
  } catch (error) {
    logger.error({ err: error }, 'Error generating report:');
    res.status(500).json({
      success: false,
      error: error.message,
    });
  }
}));

/**
 * GET /api/marketing-command-center/reports/recent
 * Get recent marketing reports
 */
router.get('/reports/recent', asyncHandler(async (req, res) => {
  const { limit = 10 } = req.query;
  const reports = await reportService.getRecentReports(parseInt(limit));
  res.json(reports);
}));

/**
 * GET /api/marketing-command-center/reports/html/:periodStart
 * Get HTML version of a report for display/email
 */
router.get('/reports/html/:periodStart', asyncHandler(async (req, res) => {
  const { periodStart } = req.params;

  try {
    // Try to get from cache
    const cacheResult = await pool.query(`
      SELECT data FROM marketing_insights_cache
      WHERE insight_type = 'weekly_report' AND insight_key = $1
    `, [periodStart]);

    if (cacheResult.rows.length === 0) {
      return res.status(404).json({ error: 'Report not found' });
    }

    const report = cacheResult.rows[0].data;
    const html = reportService.generateHTMLReport(report);

    res.setHeader('Content-Type', 'text/html');
    res.send(html);
  } catch (error) {
    logger.error({ err: error }, 'Error fetching HTML report:');
    res.status(500).json({ error: error.message });
  }
}));

/**
 * GET /api/marketing-command-center/reports/latest
 * Get the most recent report
 */
router.get('/reports/latest', asyncHandler(async (req, res) => {
  const { format = 'json' } = req.query;

  try {
    const reports = await reportService.getRecentReports(1);

    if (reports.length === 0) {
      return res.status(404).json({ error: 'No reports available' });
    }

    const report = reports[0];

    if (format === 'html') {
      const html = reportService.generateHTMLReport(report);
      res.setHeader('Content-Type', 'text/html');
      return res.send(html);
    }

    res.json(report);
  } catch (error) {
    logger.error({ err: error }, 'Error fetching latest report:');
    res.status(500).json({ error: error.message });
  }
}));

// ============================================
// CAMPAIGN DRAFT ENDPOINTS
// ============================================

/**
 * GET /api/marketing-command-center/drafts
 * List campaign drafts
 */
router.get('/drafts', asyncHandler(async (req, res) => {
  const { status, platform, limit } = req.query;
  const drafts = await draftService.getDrafts({
    status,
    platform,
    limit: limit ? parseInt(limit) : 50,
  });
  res.json(drafts);
}));

/**
 * GET /api/marketing-command-center/drafts/:id
 * Get a specific draft
 */
router.get('/drafts/:id', asyncHandler(async (req, res) => {
  const draft = await draftService.getDraft(parseInt(req.params.id));
  if (!draft) {
    return res.status(404).json({ error: 'Draft not found' });
  }
  res.json(draft);
}));

/**
 * POST /api/marketing-command-center/drafts
 * Create a new campaign draft
 */
router.post('/drafts', asyncHandler(async (req, res) => {
  const { userEmail } = getUserInfo(req);
  const { conversationId, platform, campaignType, name, draftData, aiReasoning } = req.body;

  const draft = await draftService.createDraft({
    conversationId,
    platform,
    campaignType,
    name,
    draftData,
    aiReasoning,
    createdBy: userEmail,
  });

  res.json(draft);
}));

/**
 * PUT /api/marketing-command-center/drafts/:id
 * Update a draft
 */
router.put('/drafts/:id', asyncHandler(async (req, res) => {
  const { name, draftData, aiReasoning, status } = req.body;
  const draft = await draftService.updateDraft(parseInt(req.params.id), {
    name,
    draftData,
    aiReasoning,
    status,
  });
  res.json(draft);
}));

/**
 * POST /api/marketing-command-center/drafts/:id/approve
 * Approve a draft for pushing
 */
router.post('/drafts/:id/approve', asyncHandler(async (req, res) => {
  const { userEmail } = getUserInfo(req);
  const draft = await draftService.approveDraft(parseInt(req.params.id), userEmail);
  res.json(draft);
}));

/**
 * POST /api/marketing-command-center/drafts/:id/reject
 * Reject a draft
 */
router.post('/drafts/:id/reject', asyncHandler(async (req, res) => {
  const { userEmail } = getUserInfo(req);
  const { reason } = req.body;
  const draft = await draftService.rejectDraft(parseInt(req.params.id), userEmail, reason);
  res.json(draft);
}));

/**
 * POST /api/marketing-command-center/drafts/:id/push
 * Push an approved draft to platform
 */
router.post('/drafts/:id/push', asyncHandler(async (req, res) => {
  try {
    const result = await draftService.pushDraft(parseInt(req.params.id));
    res.json(result);
  } catch (error) {
    res.status(400).json({ success: false, error: error.message || 'Unknown error' });
  }
}));

/**
 * GET /api/marketing-command-center/drafts/templates
 * Get draft templates for each platform
 */
router.get('/draft-templates', asyncHandler(async (req, res) => {
  const templates = draftService.getTemplates();
  res.json(templates);
}));

// ============================================
// CAMPAIGN CREATION ENDPOINTS
// ============================================

/**
 * GET /api/marketing-command-center/campaigns/objectives
 * Get available campaign objectives
 */
router.get('/campaigns/objectives', asyncHandler(async (req, res) => {
  const objectives = campaignCreationService.getObjectives();
  res.json(objectives);
}));

/**
 * GET /api/marketing-command-center/campaigns/targeting/:platform
 * Get targeting options for a platform
 */
router.get('/campaigns/targeting/:platform', asyncHandler(async (req, res) => {
  const { platform } = req.params;
  if (!['meta', 'google'].includes(platform)) {
    return res.status(400).json({ error: 'Platform must be meta or google' });
  }
  const options = await campaignCreationService.getTargetingOptions(platform);
  res.json(options);
}));

/**
 * POST /api/marketing-command-center/campaigns/generate-copy
 * Generate AI-assisted ad copy suggestions
 */
router.post('/campaigns/generate-copy', asyncHandler(async (req, res) => {
  const { objective, targetAudience, productFocus, tone } = req.body;
  const suggestions = await campaignCreationService.generateAdCopy({
    objective,
    targetAudience,
    productFocus,
    tone,
  });
  res.json(suggestions);
}));

/**
 * POST /api/marketing-command-center/campaigns
 * Create a new campaign draft
 */
router.post('/campaigns', asyncHandler(async (req, res) => {
  const { userEmail } = getUserInfo(req);
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
  } = req.body;

  if (!name || !platform || !objective) {
    return res.status(400).json({ error: 'Name, platform, and objective are required' });
  }

  const draft = await campaignCreationService.createCampaignDraft({
    name,
    platform,
    objective,
    budget,
    budgetType,
    startDate,
    endDate,
    targeting,
    adCopy,
    createdBy: userEmail,
  });

  res.json(draft);
}));

/**
 * PUT /api/marketing-command-center/campaigns/:id
 * Update a campaign draft
 */
router.put('/campaigns/:id', asyncHandler(async (req, res) => {
  const draftId = parseInt(req.params.id);
  const draft = await campaignCreationService.updateCampaignDraft(draftId, req.body);
  if (!draft) {
    return res.status(404).json({ error: 'Draft not found' });
  }
  res.json(draft);
}));

/**
 * GET /api/marketing-command-center/campaigns/:id
 * Get a campaign draft
 */
router.get('/campaigns/:id', asyncHandler(async (req, res) => {
  const draftId = parseInt(req.params.id);
  const draft = await campaignCreationService.getCampaignDraft(draftId);
  if (!draft) {
    return res.status(404).json({ error: 'Draft not found' });
  }
  res.json(draft);
}));

/**
 * GET /api/marketing-command-center/campaigns
 * List campaign drafts
 */
router.get('/campaigns', asyncHandler(async (req, res) => {
  const { status, platform, limit, offset } = req.query;
  const drafts = await campaignCreationService.listCampaignDrafts({
    status,
    platform,
    limit: limit ? parseInt(limit) : 50,
    offset: offset ? parseInt(offset) : 0,
  });
  res.json(drafts);
}));

/**
 * DELETE /api/marketing-command-center/campaigns/:id
 * Delete a campaign draft
 */
router.delete('/campaigns/:id', asyncHandler(async (req, res) => {
  const draftId = parseInt(req.params.id);
  const deleted = await campaignCreationService.deleteCampaignDraft(draftId);
  if (!deleted) {
    return res.status(404).json({ error: 'Draft not found' });
  }
  res.json({ success: true, message: 'Draft deleted' });
}));

/**
 * POST /api/marketing-command-center/campaigns/:id/push-meta
 * Push a draft to Meta Ads
 */
router.post('/campaigns/:id/push-meta', asyncHandler(async (req, res) => {
  const draftId = parseInt(req.params.id);
  try {
    const result = await campaignCreationService.pushToMeta(draftId);
    res.json(result);
  } catch (error) {
    res.status(400).json({ success: false, error: error.message || 'Unknown error' });
  }
}));

/**
 * POST /api/marketing-command-center/campaigns/:id/push-google
 * Push a draft to Google Ads
 */
router.post('/campaigns/:id/push-google', asyncHandler(async (req, res) => {
  const draftId = parseInt(req.params.id);
  try {
    const result = await campaignCreationService.pushToGoogle(draftId);
    res.json(result);
  } catch (error) {
    res.status(400).json({ success: false, error: error.message || 'Unknown error' });
  }
}));

/**
 * POST /api/marketing-command-center/campaigns/:id/estimate-reach
 * Estimate reach for a campaign draft
 */
router.post('/campaigns/:id/estimate-reach', asyncHandler(async (req, res) => {
  const draftId = parseInt(req.params.id);
  const draft = await campaignCreationService.getCampaignDraft(draftId);
  if (!draft) {
    return res.status(404).json({ error: 'Draft not found' });
  }
  const targeting = typeof draft.targeting_config === 'string'
    ? JSON.parse(draft.targeting_config)
    : draft.targeting_config;
  const estimate = await campaignCreationService.estimateReach(draft.platform, targeting);
  res.json(estimate);
}));

// ============================================
// BLOG ENDPOINTS
// ============================================

/**
 * POST /api/marketing-command-center/blogs/generate
 * Generate a blog post using AI
 */
router.post('/blogs/generate', asyncHandler(async (req, res) => {
  const { topic, targetAudience, tone, wordCount, keywords } = req.body;

  if (!topic) {
    return res.status(400).json({ error: 'Topic is required' });
  }

  const generated = await blogDraftService.generateBlog({
    topic,
    targetAudience,
    tone,
    wordCount,
    keywords,
  });

  res.json(generated);
}));

/**
 * POST /api/marketing-command-center/blogs
 * Create a new blog draft
 */
router.post('/blogs', asyncHandler(async (req, res) => {
  const { userEmail } = getUserInfo(req);
  const {
    title,
    slug,
    contentMarkdown,
    contentHtml,
    seoTitle,
    seoDescription,
    keywords,
    targetAudience,
    aiPrompt,
  } = req.body;

  if (!title) {
    return res.status(400).json({ error: 'Title is required' });
  }

  const draft = await blogDraftService.createDraft({
    title,
    slug,
    contentMarkdown,
    contentHtml,
    seoTitle,
    seoDescription,
    keywords,
    targetAudience,
    aiPrompt,
    createdBy: userEmail,
  });

  res.json(draft);
}));

/**
 * GET /api/marketing-command-center/blogs
 * List blog drafts
 */
router.get('/blogs', asyncHandler(async (req, res) => {
  const { status, limit, offset } = req.query;
  const drafts = await blogDraftService.listDrafts({
    status,
    limit: limit ? parseInt(limit) : 50,
    offset: offset ? parseInt(offset) : 0,
  });
  res.json(drafts);
}));

/**
 * GET /api/marketing-command-center/blogs/stats
 * Get blog statistics
 */
router.get('/blogs/stats', asyncHandler(async (req, res) => {
  const stats = await blogDraftService.getStats();
  res.json(stats);
}));

/**
 * GET /api/marketing-command-center/blogs/:id
 * Get a blog draft by ID
 */
router.get('/blogs/:id', asyncHandler(async (req, res) => {
  const draft = await blogDraftService.getDraft(parseInt(req.params.id));
  if (!draft) {
    return res.status(404).json({ error: 'Blog draft not found' });
  }
  res.json(draft);
}));

/**
 * PUT /api/marketing-command-center/blogs/:id
 * Update a blog draft
 */
router.put('/blogs/:id', asyncHandler(async (req, res) => {
  const draftId = parseInt(req.params.id);
  const draft = await blogDraftService.updateDraft(draftId, req.body);
  if (!draft) {
    return res.status(404).json({ error: 'Blog draft not found' });
  }
  res.json(draft);
}));

/**
 * DELETE /api/marketing-command-center/blogs/:id
 * Delete a blog draft
 */
router.delete('/blogs/:id', asyncHandler(async (req, res) => {
  const draftId = parseInt(req.params.id);
  const deleted = await blogDraftService.deleteDraft(draftId);
  if (!deleted) {
    return res.status(404).json({ error: 'Blog draft not found' });
  }
  res.json({ success: true, message: 'Blog draft deleted' });
}));

/**
 * POST /api/marketing-command-center/blogs/:id/submit-review
 * Submit a draft for review
 */
router.post('/blogs/:id/submit-review', asyncHandler(async (req, res) => {
  const draftId = parseInt(req.params.id);
  try {
    const draft = await blogDraftService.submitForReview(draftId);
    res.json(draft);
  } catch (error) {
    res.status(400).json({ error: error.message });
  }
}));

/**
 * POST /api/marketing-command-center/blogs/:id/approve
 * Approve a blog draft
 */
router.post('/blogs/:id/approve', asyncHandler(async (req, res) => {
  const { userEmail } = getUserInfo(req);
  const draftId = parseInt(req.params.id);
  try {
    const draft = await blogDraftService.approveDraft(draftId, userEmail);
    res.json(draft);
  } catch (error) {
    res.status(400).json({ error: error.message });
  }
}));

/**
 * POST /api/marketing-command-center/blogs/:id/reject
 * Reject a blog draft
 */
router.post('/blogs/:id/reject', asyncHandler(async (req, res) => {
  const { userEmail } = getUserInfo(req);
  const { reason } = req.body;
  const draftId = parseInt(req.params.id);
  try {
    const draft = await blogDraftService.rejectDraft(draftId, userEmail, reason);
    res.json(draft);
  } catch (error) {
    res.status(400).json({ error: error.message });
  }
}));

/**
 * POST /api/marketing-command-center/blogs/:id/publish
 * Mark a draft as published
 */
router.post('/blogs/:id/publish', asyncHandler(async (req, res) => {
  const draftId = parseInt(req.params.id);
  try {
    const draft = await blogDraftService.markPublished(draftId);
    res.json(draft);
  } catch (error) {
    res.status(400).json({ error: error.message });
  }
}));

/**
 * POST /api/marketing-command-center/blogs/:id/export-webflow
 * Export blog to Webflow-compatible HTML
 */
router.post('/blogs/:id/export-webflow', asyncHandler(async (req, res) => {
  const draftId = parseInt(req.params.id);
  try {
    const exported = await blogDraftService.exportToWebflow(draftId);
    res.json(exported);
  } catch (error) {
    res.status(400).json({ error: error.message });
  }
}));

// ============================================
// A/B TEST ENDPOINTS
// ============================================

/**
 * GET /api/marketing-command-center/ab-tests
 * List A/B tests
 */
router.get('/ab-tests', asyncHandler(async (req, res) => {
  const { status, platform, limit } = req.query;
  const tests = await abTestService.getTests({
    status,
    platform,
    limit: limit ? parseInt(limit) : 50,
  });
  res.json(tests);
}));

/**
 * GET /api/marketing-command-center/ab-tests/:id
 * Get a specific A/B test with variants and metrics
 */
router.get('/ab-tests/:id', asyncHandler(async (req, res) => {
  const test = await abTestService.getTest(parseInt(req.params.id));
  if (!test) {
    return res.status(404).json({ error: 'Test not found' });
  }
  res.json(test);
}));

/**
 * POST /api/marketing-command-center/ab-tests
 * Create a new A/B test
 */
router.post('/ab-tests', asyncHandler(async (req, res) => {
  const { userEmail } = getUserInfo(req);
  const { name, platform, testType, hypothesis, startDate, endDate, variants } = req.body;

  const test = await abTestService.createTest({
    name,
    platform,
    testType,
    hypothesis,
    startDate,
    endDate,
    createdBy: userEmail,
    variants,
  });

  res.json(test);
}));

/**
 * PUT /api/marketing-command-center/ab-tests/:id/status
 * Update test status
 */
router.put('/ab-tests/:id/status', asyncHandler(async (req, res) => {
  const { status, conclusion } = req.body;
  const test = await abTestService.updateTestStatus(parseInt(req.params.id), status, conclusion);
  res.json(test);
}));

/**
 * POST /api/marketing-command-center/ab-tests/:id/metrics
 * Record daily metrics for a variant
 */
router.post('/ab-tests/:id/metrics', asyncHandler(async (req, res) => {
  const { variantId, date, spend, impressions, clicks, conversions, revenue } = req.body;

  const metrics = await abTestService.recordMetrics({
    testId: parseInt(req.params.id),
    variantId,
    date,
    spend,
    impressions,
    clicks,
    conversions,
    revenue,
  });

  res.json(metrics);
}));

/**
 * GET /api/marketing-command-center/ab-tests/:id/time-series
 * Get metrics time series for a test
 */
router.get('/ab-tests/:id/time-series', asyncHandler(async (req, res) => {
  const timeSeries = await abTestService.getMetricsTimeSeries(parseInt(req.params.id));
  res.json(timeSeries);
}));

/**
 * GET /api/marketing-command-center/ab-tests/:id/summary
 * Get test summary with recommendations
 */
router.get('/ab-tests/:id/summary', asyncHandler(async (req, res) => {
  const summary = await abTestService.getTestSummary(parseInt(req.params.id));
  if (!summary) {
    return res.status(404).json({ error: 'Test not found' });
  }
  res.json(summary);
}));

/**
 * POST /api/marketing-command-center/ab-tests/:id/winner
 * Declare a winner for the test
 */
router.post('/ab-tests/:id/winner', asyncHandler(async (req, res) => {
  const { winnerVariantId, conclusion } = req.body;
  const test = await abTestService.declareWinner(
    parseInt(req.params.id),
    winnerVariantId,
    conclusion
  );
  res.json(test);
}));

/**
 * POST /api/marketing-command-center/ab-tests/:id/variants
 * Add a variant to a test
 */
router.post('/ab-tests/:id/variants', asyncHandler(async (req, res) => {
  const { name, isControl, config, externalIds } = req.body;
  const variant = await abTestService.addVariant(parseInt(req.params.id), {
    name,
    isControl,
    config,
    externalIds,
  });
  res.json(variant);
}));

/**
 * DELETE /api/marketing-command-center/ab-tests/:id
 * Delete a test
 */
router.delete('/ab-tests/:id', asyncHandler(async (req, res) => {
  await abTestService.deleteTest(parseInt(req.params.id));
  res.json({ success: true });
}));

// ============================================
// SAVED VIEWS ENDPOINTS
// ============================================

/**
 * GET /api/marketing-command-center/saved-views
 * List user's saved views
 */
router.get('/saved-views', asyncHandler(async (req, res) => {
  const { userEmail } = getUserInfo(req);

  const result = await pool.query(`
    SELECT * FROM marketing_saved_views
    WHERE user_email = $1
    ORDER BY is_default DESC, created_at DESC
  `, [userEmail]);

  res.json(result.rows);
}));

/**
 * POST /api/marketing-command-center/saved-views
 * Create a saved view
 */
router.post('/saved-views', asyncHandler(async (req, res) => {
  const { userEmail } = getUserInfo(req);
  const { name, description, viewConfig, isDefault } = req.body;

  // If setting as default, unset other defaults
  if (isDefault) {
    await pool.query(`
      UPDATE marketing_saved_views SET is_default = false WHERE user_email = $1
    `, [userEmail]);
  }

  const result = await pool.query(`
    INSERT INTO marketing_saved_views (user_email, name, description, view_config, is_default)
    VALUES ($1, $2, $3, $4, $5)
    RETURNING *
  `, [userEmail, name, description, JSON.stringify(viewConfig), isDefault || false]);

  res.json(result.rows[0]);
}));

/**
 * PUT /api/marketing-command-center/saved-views/:id
 * Update a saved view
 */
router.put('/saved-views/:id', asyncHandler(async (req, res) => {
  const { userEmail } = getUserInfo(req);
  const { name, description, viewConfig, isDefault } = req.body;

  if (isDefault) {
    await pool.query(`
      UPDATE marketing_saved_views SET is_default = false WHERE user_email = $1
    `, [userEmail]);
  }

  const result = await pool.query(`
    UPDATE marketing_saved_views
    SET name = COALESCE($2, name),
        description = COALESCE($3, description),
        view_config = COALESCE($4, view_config),
        is_default = COALESCE($5, is_default),
        updated_at = NOW()
    WHERE id = $1 AND user_email = $6
    RETURNING *
  `, [parseInt(req.params.id), name, description, viewConfig ? JSON.stringify(viewConfig) : null, isDefault, userEmail]);

  if (result.rows.length === 0) {
    return res.status(404).json({ error: 'View not found' });
  }

  res.json(result.rows[0]);
}));

/**
 * DELETE /api/marketing-command-center/saved-views/:id
 * Delete a saved view
 */
router.delete('/saved-views/:id', asyncHandler(async (req, res) => {
  const { userEmail } = getUserInfo(req);

  await pool.query(`
    DELETE FROM marketing_saved_views WHERE id = $1 AND user_email = $2
  `, [parseInt(req.params.id), userEmail]);

  res.json({ success: true });
}));

// ============================================
// EXPORT ENDPOINTS
// ============================================

/**
 * GET /api/marketing-command-center/export/analytics
 * Export analytics data as CSV
 */
router.get('/export/analytics', asyncHandler(async (req, res) => {
  const { range = 'last_30_days', type = 'trends' } = req.query;
  const dates = dataAggregator.getDateRange(range);

  let data;
  let filename;
  let headers;

  switch (type) {
    case 'trends':
      const trendsResult = await pool.query(`
        SELECT
          a.date,
          SUM(a.spend) as spend,
          SUM(a.impressions) as impressions,
          SUM(a.clicks) as clicks,
          COUNT(DISTINCT bs.id) as leads,
          SUM(CASE WHEN bs.payment_status = 'paid' THEN COALESCE(bs.actual_price, 0) ELSE 0 END) as revenue
        FROM ad_spend_data a
        LEFT JOIN booking_submissions bs ON (
          LOWER(bs.utm_campaign) = LOWER(a.utm_campaign)
          AND DATE(bs.created_at) = a.date
        )
        WHERE a.date >= $1 AND a.date <= $2
        GROUP BY a.date
        ORDER BY a.date ASC
      `, [dates.startDate, dates.endDate]);
      data = trendsResult.rows;
      filename = `marketing-trends-${dates.startDate}-${dates.endDate}.csv`;
      headers = ['Date', 'Spend', 'Impressions', 'Clicks', 'Leads', 'Revenue'];
      break;

    case 'campaigns':
      const campaignsResult = await pool.query(`
        SELECT
          a.platform,
          a.campaign_name,
          SUM(a.spend) as spend,
          SUM(a.impressions) as impressions,
          SUM(a.clicks) as clicks,
          COUNT(DISTINCT bs.id) as leads,
          SUM(CASE WHEN bs.payment_status = 'paid' THEN COALESCE(bs.actual_price, 0) ELSE 0 END) as revenue
        FROM ad_spend_data a
        LEFT JOIN booking_submissions bs ON (
          LOWER(bs.utm_campaign) = LOWER(a.utm_campaign)
          AND bs.created_at >= $1 AND bs.created_at <= $2
        )
        WHERE a.date >= $1 AND a.date <= $2
        GROUP BY a.platform, a.campaign_name
        ORDER BY SUM(a.spend) DESC
      `, [dates.startDate, dates.endDate]);
      data = campaignsResult.rows;
      filename = `marketing-campaigns-${dates.startDate}-${dates.endDate}.csv`;
      headers = ['Platform', 'Campaign', 'Spend', 'Impressions', 'Clicks', 'Leads', 'Revenue'];
      break;

    default:
      return res.status(400).json({ error: 'Invalid export type' });
  }

  // Convert to CSV
  const csv = convertToCSV(data, headers);

  res.setHeader('Content-Type', 'text/csv');
  res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
  res.send(csv);
}));

/**
 * GET /api/marketing-command-center/export/report/:periodStart
 * Export report as PDF (returns HTML for client-side PDF generation)
 */
router.get('/export/report/:periodStart', asyncHandler(async (req, res) => {
  const { periodStart } = req.params;
  const { format = 'html' } = req.query;

  const cacheResult = await pool.query(`
    SELECT data FROM marketing_insights_cache
    WHERE insight_type = 'weekly_report' AND insight_key = $1
  `, [periodStart]);

  if (cacheResult.rows.length === 0) {
    return res.status(404).json({ error: 'Report not found' });
  }

  const report = cacheResult.rows[0].data;

  if (format === 'json') {
    res.setHeader('Content-Type', 'application/json');
    res.setHeader('Content-Disposition', `attachment; filename="marketing-report-${periodStart}.json"`);
    return res.send(JSON.stringify(report, null, 2));
  }

  // Return HTML for PDF generation
  const html = reportService.generateHTMLReport(report);
  res.setHeader('Content-Type', 'text/html');
  res.setHeader('Content-Disposition', `attachment; filename="marketing-report-${periodStart}.html"`);
  res.send(html);
}));

/**
 * GET /api/marketing-command-center/export/ab-test/:id
 * Export A/B test data as CSV
 */
router.get('/export/ab-test/:id', asyncHandler(async (req, res) => {
  const testId = parseInt(req.params.id);
  const test = await abTestService.getTest(testId);

  if (!test) {
    return res.status(404).json({ error: 'Test not found' });
  }

  const timeSeries = await abTestService.getMetricsTimeSeries(testId);

  const headers = ['Date', 'Variant', 'Is Control', 'Spend', 'Impressions', 'Clicks', 'Conversions', 'Revenue', 'CTR', 'ROAS', 'Statistical Significance'];
  const csv = convertToCSV(timeSeries.map(row => ({
    date: row.date,
    variant_name: row.variant_name,
    is_control: row.is_control,
    spend: row.spend,
    impressions: row.impressions,
    clicks: row.clicks,
    conversions: row.conversions,
    revenue: row.revenue,
    ctr: row.ctr,
    roas: row.roas,
    statistical_significance: row.statistical_significance,
  })), headers);

  res.setHeader('Content-Type', 'text/csv');
  res.setHeader('Content-Disposition', `attachment; filename="ab-test-${test.name.replace(/[^a-z0-9]/gi, '-')}.csv"`);
  res.send(csv);
}));

/**
 * Helper function to convert data to CSV
 */
function convertToCSV(data, headers) {
  if (!data || data.length === 0) {
    return headers.join(',') + '\n';
  }

  const keys = Object.keys(data[0]);
  const headerRow = headers || keys;

  const rows = data.map(row =>
    keys.map(key => {
      const value = row[key];
      if (value === null || value === undefined) return '';
      if (typeof value === 'string' && (value.includes(',') || value.includes('"') || value.includes('\n'))) {
        return `"${value.replace(/"/g, '""')}"`;
      }
      return value;
    }).join(',')
  );

  return [headerRow.join(','), ...rows].join('\n');
}

// ============================================
// SCHEDULED REPORTS ENDPOINTS
// ============================================

/**
 * GET /api/marketing-command-center/scheduled-reports
 * List scheduled reports
 */
router.get('/scheduled-reports', asyncHandler(async (req, res) => {
  const result = await pool.query(`
    SELECT * FROM marketing_scheduled_reports
    ORDER BY created_at DESC
  `);
  res.json(result.rows);
}));

/**
 * POST /api/marketing-command-center/scheduled-reports
 * Create a scheduled report
 */
router.post('/scheduled-reports', asyncHandler(async (req, res) => {
  const { userEmail } = getUserInfo(req);
  const { name, reportType, scheduleCron, recipients, reportConfig } = req.body;

  const result = await pool.query(`
    INSERT INTO marketing_scheduled_reports (name, report_type, schedule_cron, recipients, report_config, created_by)
    VALUES ($1, $2, $3, $4, $5, $6)
    RETURNING *
  `, [name, reportType || 'weekly', scheduleCron, JSON.stringify(recipients || []), JSON.stringify(reportConfig || {}), userEmail]);

  res.json(result.rows[0]);
}));

/**
 * PUT /api/marketing-command-center/scheduled-reports/:id
 * Update a scheduled report
 */
router.put('/scheduled-reports/:id', asyncHandler(async (req, res) => {
  const { name, reportType, scheduleCron, isActive, recipients, reportConfig } = req.body;

  const result = await pool.query(`
    UPDATE marketing_scheduled_reports
    SET name = COALESCE($2, name),
        report_type = COALESCE($3, report_type),
        schedule_cron = COALESCE($4, schedule_cron),
        is_active = COALESCE($5, is_active),
        recipients = COALESCE($6, recipients),
        report_config = COALESCE($7, report_config),
        updated_at = NOW()
    WHERE id = $1
    RETURNING *
  `, [parseInt(req.params.id), name, reportType, scheduleCron, isActive, recipients ? JSON.stringify(recipients) : null, reportConfig ? JSON.stringify(reportConfig) : null]);

  res.json(result.rows[0]);
}));

/**
 * DELETE /api/marketing-command-center/scheduled-reports/:id
 * Delete a scheduled report
 */
router.delete('/scheduled-reports/:id', asyncHandler(async (req, res) => {
  await pool.query(`DELETE FROM marketing_scheduled_reports WHERE id = $1`, [parseInt(req.params.id)]);
  res.json({ success: true });
}));

/**
 * GET /api/marketing-command-center/report-runs
 * Get report run history
 */
router.get('/report-runs', asyncHandler(async (req, res) => {
  const { limit = 50 } = req.query;

  const result = await pool.query(`
    SELECT rr.*, sr.name as scheduled_report_name
    FROM marketing_report_runs rr
    LEFT JOIN marketing_scheduled_reports sr ON sr.id = rr.scheduled_report_id
    ORDER BY rr.created_at DESC
    LIMIT $1
  `, [parseInt(limit)]);

  res.json(result.rows);
}));


// ===========================================
// INSTAGRAM ENDPOINTS
// ===========================================

/**
 * POST /api/marketing-command-center/instagram/generate-caption
 * Generate caption and hashtags with AI
 */
router.post('/instagram/generate-caption', asyncHandler(async (req, res) => {
  const { description, mediaType, tone, includeEmojis } = req.body;

  if (!description) {
    return res.status(400).json({ error: 'Description is required' });
  }

  const result = await instagramService.generateCaption({
    description,
    mediaType: mediaType || 'image',
    tone: tone || 'fun',
    includeEmojis: includeEmojis !== false,
  });

  res.json(result);
}));

/**
 * GET /api/marketing-command-center/instagram
 * List Instagram post drafts
 */
router.get('/instagram', asyncHandler(async (req, res) => {
  const { status, postType, limit, offset } = req.query;

  const posts = await instagramService.listDrafts({
    status,
    postType,
    limit: limit ? parseInt(limit) : 50,
    offset: offset ? parseInt(offset) : 0,
  });

  res.json(posts);
}));

/**
 * GET /api/marketing-command-center/instagram/stats
 * Get Instagram post statistics
 */
router.get('/instagram/stats', asyncHandler(async (req, res) => {
  const stats = await instagramService.getStats();
  res.json(stats);
}));

/**
 * GET /api/marketing-command-center/instagram/upcoming
 * Get upcoming scheduled posts
 */
router.get('/instagram/upcoming', asyncHandler(async (req, res) => {
  const { days } = req.query;
  const posts = await instagramService.getUpcomingScheduled(days ? parseInt(days) : 7);
  res.json(posts);
}));

/**
 * GET /api/marketing-command-center/instagram/status
 * Check if Instagram API is configured
 */
router.get('/instagram/status', asyncHandler(async (req, res) => {
  res.json({
    enabled: instagramService.isInstagramEnabled(),
    message: instagramService.isInstagramEnabled()
      ? 'Instagram API is configured and ready'
      : 'Instagram API not configured - set INSTAGRAM_BUSINESS_ACCOUNT_ID and META_ACCESS_TOKEN',
  });
}));

/**
 * POST /api/marketing-command-center/instagram
 * Create a new Instagram post draft
 */
router.post('/instagram', asyncHandler(async (req, res) => {
  const { userEmail } = getUserInfo(req);
  const { postType, caption, hashtags, mediaUrls, mediaFiles, scheduledAt } = req.body;

  if (!postType) {
    return res.status(400).json({ error: 'Post type is required' });
  }

  const draft = await instagramService.createDraft({
    postType,
    caption,
    hashtags,
    mediaUrls,
    mediaFiles,
    scheduledAt,
    createdBy: userEmail,
  });

  res.json(draft);
}));

/**
 * GET /api/marketing-command-center/instagram/:id
 * Get a specific Instagram post draft
 */
router.get('/instagram/:id', asyncHandler(async (req, res) => {
  const draft = await instagramService.getDraft(parseInt(req.params.id));

  if (!draft) {
    return res.status(404).json({ error: 'Draft not found' });
  }

  res.json(draft);
}));

/**
 * PUT /api/marketing-command-center/instagram/:id
 * Update an Instagram post draft
 */
router.put('/instagram/:id', asyncHandler(async (req, res) => {
  const draft = await instagramService.updateDraft(parseInt(req.params.id), req.body);

  if (!draft) {
    return res.status(404).json({ error: 'Draft not found' });
  }

  res.json(draft);
}));

/**
 * DELETE /api/marketing-command-center/instagram/:id
 * Delete an Instagram post draft
 */
router.delete('/instagram/:id', asyncHandler(async (req, res) => {
  const success = await instagramService.deleteDraft(parseInt(req.params.id));

  if (!success) {
    return res.status(404).json({ error: 'Draft not found' });
  }

  res.json({ success: true });
}));

/**
 * POST /api/marketing-command-center/instagram/:id/submit-review
 * Submit draft for review
 */
router.post('/instagram/:id/submit-review', asyncHandler(async (req, res) => {
  const draft = await instagramService.submitForReview(parseInt(req.params.id));
  res.json(draft);
}));

/**
 * POST /api/marketing-command-center/instagram/:id/approve
 * Approve a draft
 */
router.post('/instagram/:id/approve', asyncHandler(async (req, res) => {
  const { userEmail } = getUserInfo(req);
  const draft = await instagramService.approveDraft(parseInt(req.params.id), userEmail);
  res.json(draft);
}));

/**
 * POST /api/marketing-command-center/instagram/:id/reject
 * Reject a draft
 */
router.post('/instagram/:id/reject', asyncHandler(async (req, res) => {
  const { reason } = req.body;
  const draft = await instagramService.rejectDraft(parseInt(req.params.id), reason);
  res.json(draft);
}));

/**
 * POST /api/marketing-command-center/instagram/:id/schedule
 * Schedule a draft for publishing
 */
router.post('/instagram/:id/schedule', asyncHandler(async (req, res) => {
  const { scheduledAt } = req.body;

  if (!scheduledAt) {
    return res.status(400).json({ error: 'Scheduled date/time is required' });
  }

  const draft = await instagramService.scheduleDraft(parseInt(req.params.id), scheduledAt);
  res.json(draft);
}));

/**
 * POST /api/marketing-command-center/instagram/:id/publish
 * Publish an approved post to Instagram
 */
router.post('/instagram/:id/publish', asyncHandler(async (req, res) => {
  const post = await instagramService.publishPost(parseInt(req.params.id));
  res.json(post);
}));

// ============================================
// KLAVIYO SYNC ENDPOINTS
// ============================================

/**
 * POST /api/marketing-command-center/klaviyo/sync
 * Trigger full Klaviyo sync
 */
router.post('/klaviyo/sync', asyncHandler(async (req, res) => {
  const results = await klaviyoSyncService.syncAll();
  res.json({ success: true, results });
}));

/**
 * GET /api/marketing-command-center/klaviyo/flows
 * Get all flows with their emails
 */
router.get('/klaviyo/flows', asyncHandler(async (req, res) => {
  const flows = await klaviyoSyncService.getFlowsWithEmails();
  res.json(flows);
}));

/**
 * GET /api/marketing-command-center/klaviyo/lists
 * Get all lists
 */
router.get('/klaviyo/lists', asyncHandler(async (req, res) => {
  const lists = await klaviyoSyncService.getLists();
  res.json(lists);
}));

// ============================================
// AI BRAIN ENDPOINTS
// ============================================

/**
 * POST /api/marketing-command-center/ai-brain/analyze
 * Run full AI analysis
 */
router.post('/ai-brain/analyze', asyncHandler(async (req, res) => {
  try {
    const results = await aiBrain.runAnalysis();
    res.json({
      success: true,
      insightsGenerated: results.insights.length,
      insights: results.insights,
    });
  } catch (err) {
    // Handle transient AI service errors gracefully
    if (err.isTransient || err.status === 503) {
      return res.status(503).json({
        success: false,
        error: 'The AI service is temporarily overloaded. Please try again in a moment.',
        isTransient: true,
      });
    }
    throw err;
  }
}));

/**
 * GET /api/marketing-command-center/ai-brain/insights
 * Get pending insights
 */
router.get('/ai-brain/insights', asyncHandler(async (req, res) => {
  const { platform } = req.query;
  const insights = await aiBrain.getPendingInsights(platform || null);
  res.json(insights);
}));

/**
 * POST /api/marketing-command-center/ai-brain/insights/:id/dismiss
 * Dismiss an insight
 */
router.post('/ai-brain/insights/:id/dismiss', asyncHandler(async (req, res) => {
  const { id } = req.params;
  const { userEmail } = getUserInfo(req);
  await aiBrain.dismissInsight(parseInt(id), userEmail);
  res.json({ success: true });
}));

/**
 * POST /api/marketing-command-center/ai-brain/insights/:id/to-draft
 * Convert insight to draft
 */
router.post('/ai-brain/insights/:id/to-draft', asyncHandler(async (req, res) => {
  const { id } = req.params;
  const { userEmail } = getUserInfo(req);
  const draftId = await aiBrain.insightToDraft(parseInt(id), userEmail);
  res.json({ success: true, draftId });
}));

// ============================================
// RESULTS TRACKING ENDPOINTS
// ============================================

/**
 * POST /api/marketing-command-center/results/run-snapshots
 * Run scheduled snapshots
 */
router.post('/results/run-snapshots', asyncHandler(async (req, res) => {
  const results = await resultsTracker.runScheduledSnapshots();
  res.json({ success: true, ...results });
}));

/**
 * GET /api/marketing-command-center/results/draft/:id
 * Get results for a specific draft
 */
router.get('/results/draft/:id', asyncHandler(async (req, res) => {
  const { id } = req.params;
  const results = await resultsTracker.getDraftResults(parseInt(id));
  res.json(results);
}));

/**
 * POST /api/marketing-command-center/results/draft/:id/snapshot
 * Manually take a snapshot
 */
router.post('/results/draft/:id/snapshot', asyncHandler(async (req, res) => {
  const { id } = req.params;
  const { snapshotType } = req.body;

  if (!['before', 'day_1', 'day_7', 'day_14', 'day_30'].includes(snapshotType)) {
    return res.status(400).json({ error: 'Invalid snapshot type' });
  }

  const result = await resultsTracker.takeSnapshot(parseInt(id), snapshotType);
  res.json({ success: true, ...result });
}));

// ============================================
// ALERTS ENDPOINTS
// ============================================

/**
 * GET /api/marketing-command-center/alerts
 * Get alerts
 */
router.get('/alerts', asyncHandler(async (req, res) => {
  const { limit, offset, includeRead, alertType } = req.query;
  const alerts = await alertsService.getAlerts({
    limit: limit ? parseInt(limit) : 50,
    offset: offset ? parseInt(offset) : 0,
    includeRead: includeRead === 'true',
    alertType: alertType || null,
  });
  res.json(alerts);
}));

/**
 * GET /api/marketing-command-center/alerts/counts
 * Get alert counts
 */
router.get('/alerts/counts', asyncHandler(async (req, res) => {
  const counts = await alertsService.getAlertCounts();
  res.json(counts);
}));

/**
 * POST /api/marketing-command-center/alerts/:id/read
 * Mark alert as read
 */
router.post('/alerts/:id/read', asyncHandler(async (req, res) => {
  await alertsService.markAsRead(parseInt(req.params.id));
  res.json({ success: true });
}));

/**
 * POST /api/marketing-command-center/alerts/read-all
 * Mark all alerts as read
 */
router.post('/alerts/read-all', asyncHandler(async (req, res) => {
  await alertsService.markAllAsRead();
  res.json({ success: true });
}));

/**
 * POST /api/marketing-command-center/alerts/:id/dismiss
 * Dismiss an alert
 */
router.post('/alerts/:id/dismiss', asyncHandler(async (req, res) => {
  await alertsService.dismissAlert(parseInt(req.params.id));
  res.json({ success: true });
}));

/**
 * POST /api/marketing-command-center/alerts/generate
 * Run alert generation
 */
router.post('/alerts/generate', asyncHandler(async (req, res) => {
  const results = await alertsService.runAlertGeneration();
  res.json({ success: true, ...results });
}));

// ============================================
// BUDGET OPTIMIZER ENDPOINTS
// ============================================

/**
 * GET /api/marketing-command-center/budget/recommendations
 * Get pending budget recommendations
 */
router.get('/budget/recommendations', asyncHandler(async (req, res) => {
  const budgetOptimizer = new MarketingBudgetOptimizer(pool);
  const recommendations = await budgetOptimizer.getPendingRecommendations();
  res.json({ success: true, recommendations });
}));

/**
 * GET /api/marketing-command-center/budget/history
 * Get recommendation history
 */
router.get('/budget/history', asyncHandler(async (req, res) => {
  const limit = parseInt(req.query.limit || '50', 10);
  if (isNaN(limit) || limit < 1 || limit > 1000) {
    return res.status(400).json({ success: false, error: 'Invalid limit parameter' });
  }
  const budgetOptimizer = new MarketingBudgetOptimizer(pool);
  const history = await budgetOptimizer.getRecommendationHistory(limit);
  res.json({ success: true, history });
}));

/**
 * POST /api/marketing-command-center/budget/recommendations/:id/approve
 * Approve a budget recommendation
 */
router.post('/budget/recommendations/:id/approve', asyncHandler(async (req, res) => {
  const id = parseInt(req.params.id, 10);
  if (!id || isNaN(id)) {
    return res.status(400).json({ success: false, error: 'Invalid recommendation ID' });
  }
  const { userEmail } = getUserInfo(req);
  const budgetOptimizer = new MarketingBudgetOptimizer(pool);
  const result = await budgetOptimizer.approveRecommendation(id, userEmail);
  res.json({ success: true, recommendation: result });
}));

/**
 * POST /api/marketing-command-center/budget/recommendations/:id/reject
 * Reject a budget recommendation
 */
router.post('/budget/recommendations/:id/reject', asyncHandler(async (req, res) => {
  const id = parseInt(req.params.id, 10);
  if (!id || isNaN(id)) {
    return res.status(400).json({ success: false, error: 'Invalid recommendation ID' });
  }
  const { reason } = req.body;
  const { userEmail } = getUserInfo(req);
  const budgetOptimizer = new MarketingBudgetOptimizer(pool);
  const result = await budgetOptimizer.rejectRecommendation(id, userEmail, reason);
  res.json({ success: true, recommendation: result });
}));

/**
 * POST /api/marketing-command-center/budget/recommendations/:id/execute
 * Execute an approved budget recommendation
 */
router.post('/budget/recommendations/:id/execute', asyncHandler(async (req, res) => {
  const id = parseInt(req.params.id, 10);
  if (!id || isNaN(id)) {
    return res.status(400).json({ success: false, error: 'Invalid recommendation ID' });
  }
  const budgetOptimizer = new MarketingBudgetOptimizer(pool);
  const result = await budgetOptimizer.executeRecommendation(id);
  res.json({ success: true, recommendation: result });
}));

/**
 * POST /api/marketing-command-center/budget/analyze
 * Analyze current budget allocation
 */
router.post('/budget/analyze', asyncHandler(async (req, res) => {
  const budgetOptimizer = new MarketingBudgetOptimizer(pool);
  const analysis = await budgetOptimizer.analyzeBudgetAllocation();
  res.json({ success: true, analysis });
}));

/**
 * GET /api/marketing-command-center/budget/snapshots
 * Get historical budget snapshots
 */
router.get('/budget/snapshots', asyncHandler(async (req, res) => {
  const days = parseInt(req.query.days || '30', 10);
  if (isNaN(days) || days < 1 || days > 365) {
    return res.status(400).json({ success: false, error: 'Invalid days parameter' });
  }
  const budgetOptimizer = new MarketingBudgetOptimizer(pool);
  const snapshots = await budgetOptimizer.getHistoricalSnapshots(days);
  res.json({ success: true, snapshots });
}));

// ============================================
// LEARNING LOOP ENDPOINTS
// ============================================

/**
 * GET /api/marketing-command-center/learning/calibrations
 * Get all prediction calibrations
 */
router.get('/learning/calibrations', asyncHandler(async (req, res) => {
  const learningLoop = new MarketingLearningLoop(pool);
  const calibrations = await learningLoop.getAllCalibrations();
  res.json({ success: true, calibrations });
}));

/**
 * GET /api/marketing-command-center/learning/accuracy
 * Get accuracy summary across all prediction types
 */
router.get('/learning/accuracy', asyncHandler(async (req, res) => {
  const learningLoop = new MarketingLearningLoop(pool);
  const summary = await learningLoop.getAccuracySummary();
  res.json({ success: true, summary });
}));

/**
 * GET /api/marketing-command-center/learning/trends
 * Get accuracy trends over time
 */
router.get('/learning/trends', asyncHandler(async (req, res) => {
  const { predictionType } = req.query;
  const days = parseInt(req.query.days || '30', 10);
  if (isNaN(days) || days < 1 || days > 365) {
    return res.status(400).json({ success: false, error: 'Invalid days parameter' });
  }
  const learningLoop = new MarketingLearningLoop(pool);
  const trends = await learningLoop.getAccuracyTrends(predictionType, days);
  res.json({ success: true, trends });
}));

/**
 * GET /api/marketing-command-center/learning/status
 * Get learning loop status
 */
router.get('/learning/status', asyncHandler(async (req, res) => {
  const learningLoop = new MarketingLearningLoop(pool);
  const status = await learningLoop.getStatus();
  res.json({ success: true, status });
}));

/**
 * GET /api/marketing-command-center/learning/predictions
 * Get recent individual predictions for dashboard display
 */
router.get('/learning/predictions', asyncHandler(async (req, res) => {
  const limit = parseInt(req.query.limit || '10', 10);
  if (isNaN(limit) || limit < 1 || limit > 50) {
    return res.status(400).json({ success: false, error: 'Invalid limit parameter (1-50)' });
  }
  const learningLoop = new MarketingLearningLoop(pool);
  const predictions = await learningLoop.getRecentPredictions(limit);
  res.json(predictions);
}));

/**
 * POST /api/marketing-command-center/learning/run-cycle
 * Manually run a learning cycle
 */
router.post('/learning/run-cycle', asyncHandler(async (req, res) => {
  const learningLoop = new MarketingLearningLoop(pool);
  const results = await learningLoop.runLearningCycle();
  res.json({ success: true, results });
}));

module.exports = router;
