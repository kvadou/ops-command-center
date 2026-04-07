// routes/api-ads-manager.js
/**
 * Ads Manager API Routes
 * Provides endpoints for managing ads across Meta, Google, and Klaviyo platforms
 */

const express = require('express');
const router = express.Router();
const auth = global.auth;
const { asyncHandler } = require('../middleware/error-handler');
const { logger } = require('../utils/logger');

// Import ad services
let MetaAdsService, GoogleAdsService, KlaviyoAdsService;
try {
  MetaAdsService = require('../services/meta-ads-api');
  GoogleAdsService = require('../services/google-ads-api');
  KlaviyoAdsService = require('../services/klaviyo-ads-service');
} catch (err) {
  logger.warn({ data: err.message }, 'Ad service modules not available:');
}

/**
 * Get campaigns for a specific platform
 * GET /api/ads-manager/campaigns/:platform
 * Query params: 
 *   - includeMetrics: boolean (default: false) - Whether to include performance metrics
 *   - useCache: boolean (default: true) - Whether to use cached data
 */
router.get('/campaigns/:platform', auth, asyncHandler(async (req, res) => {
  try {
    const { platform } = req.params;
    const includeMetrics = req.query.includeMetrics === 'true';
    const useCache = req.query.useCache !== 'false'; // Default to true

    if (!['meta', 'google', 'klaviyo'].includes(platform)) {
      return res.status(400).json({
        error: 'Invalid platform',
        message: 'Platform must be one of: meta, google, klaviyo',
      });
    }

    let campaigns = [];

    if (platform === 'meta') {
      const metaService = new MetaAdsService();
      if (!metaService.enabled) {
        return res.status(400).json({
          error: 'Meta Ads API is not configured',
          message: 'Please check your environment variables',
        });
      }
      campaigns = await metaService.getCampaignsList({ includeMetrics, useCache });
    } else if (platform === 'google') {
      const googleService = new GoogleAdsService();
      if (!googleService.enabled) {
        return res.status(400).json({
          error: 'Google Ads API is not configured',
          message: 'Please check your environment variables',
        });
      }
      campaigns = await googleService.getCampaignsList();
    } else if (platform === 'klaviyo') {
      const klaviyoService = new KlaviyoAdsService();
      if (!klaviyoService.enabled) {
        return res.status(400).json({
          error: 'Klaviyo API is not configured',
          message: 'Please check your environment variables',
        });
      }
      campaigns = await klaviyoService.getCampaignsList();
    }

    res.json({
      success: true,
      platform,
      campaigns,
      count: campaigns.length,
    });
  } catch (error) {
    logger.error({ err: error }, 'Error fetching ${req.params.platform} campaigns:');
    
    // Check for expired token errors (Meta API)
    if (error.message?.includes('expired') || 
        error.message?.includes('Session has expired') ||
        error.message?.includes('Error validating access token')) {
      return res.status(401).json({
        error: 'Access token expired',
        message: error.message || 'Your Meta access token has expired. Please generate a new long-lived access token or use a System User token (never expires).',
        tokenExpired: true,
      });
    }
    
    // Check for rate limit errors (Meta API)
    if (error.response?.code === 17 || 
        error.response?.error_subcode === 2446079 ||
        error.message?.includes('request limit reached') ||
        error.message?.includes('too many calls')) {
      return res.status(429).json({
        error: 'Rate limit exceeded',
        message: 'Too many API calls to Meta. Please wait a moment and try again.',
        retryAfter: 60,
      });
    }
    
    res.status(500).json({
      error: 'Failed to fetch campaigns',
      message: error.message,
      ...(process.env.NODE_ENV === 'development' && { details: error.stack }),
    });
  }
}));

/**
 * Update campaign status (enable/disable)
 * PATCH /api/ads-manager/campaigns/:platform/:campaignId
 * Body: { status: 'ACTIVE' | 'PAUSED' | 'ENABLED' | 'CANCELED' }
 */
router.patch('/campaigns/:platform/:campaignId', auth, asyncHandler(async (req, res) => {
  try {
    const { platform, campaignId } = req.params;
    const { status } = req.body;

    if (!['meta', 'google', 'klaviyo'].includes(platform)) {
      return res.status(400).json({
        error: 'Invalid platform',
        message: 'Platform must be one of: meta, google, klaviyo',
      });
    }

    if (!status) {
      return res.status(400).json({
        error: 'Status is required',
        message: 'Please provide a status in the request body',
      });
    }

    let updatedCampaign;

    if (platform === 'meta') {
      const metaService = new MetaAdsService();
      if (!metaService.enabled) {
        return res.status(400).json({
          error: 'Meta Ads API is not configured',
        });
      }

      // Map status: 'ACTIVE' or 'PAUSED' for Meta
      const metaStatus = status === 'ENABLED' ? 'ACTIVE' : status;
      if (!['ACTIVE', 'PAUSED'].includes(metaStatus)) {
        return res.status(400).json({
          error: 'Invalid status',
          message: 'Status must be ACTIVE or PAUSED for Meta',
        });
      }

      updatedCampaign = await metaService.updateCampaignStatus(campaignId, metaStatus);
      // Clear cache after updating campaign status
      metaService.clearCache();
    } else if (platform === 'google') {
      const googleService = new GoogleAdsService();
      if (!googleService.enabled) {
        return res.status(400).json({
          error: 'Google Ads API is not configured',
        });
      }

      // Map status: 'ENABLED' or 'PAUSED' for Google
      const googleStatus = status === 'ACTIVE' ? 'ENABLED' : status;
      if (!['ENABLED', 'PAUSED'].includes(googleStatus)) {
        return res.status(400).json({
          error: 'Invalid status',
          message: 'Status must be ENABLED or PAUSED for Google',
        });
      }

      updatedCampaign = await googleService.updateCampaignStatus(campaignId, googleStatus);
    } else if (platform === 'klaviyo') {
      const klaviyoService = new KlaviyoAdsService();
      if (!klaviyoService.enabled) {
        return res.status(400).json({
          error: 'Klaviyo API is not configured',
        });
      }

      // Klaviyo only supports canceling campaigns
      if (status === 'CANCELED' || status === 'PAUSED') {
        const result = await klaviyoService.cancelCampaign(campaignId);
        updatedCampaign = {
          id: campaignId,
          status: 'CANCELED',
          message: result.message,
        };
      } else {
        return res.status(400).json({
          error: 'Invalid status',
          message: 'Klaviyo only supports canceling campaigns. Use status: CANCELED',
        });
      }
    }

    res.json({
      success: true,
      platform,
      campaign: updatedCampaign,
    });
    } catch (error) {
      logger.error({ err: error }, 'Error updating ${req.params.platform} campaign ${req.params.campaignId}:');
      
      // Provide user-friendly error messages
      let statusCode = 500;
      let errorMessage = error.message || 'Failed to update campaign';
      
      // Check for permission errors
      if (error.message?.includes('Permission denied') || 
          error.message?.includes('ads_management')) {
        statusCode = 403; // Forbidden
      } else if (error.message?.includes('not configured')) {
        statusCode = 400; // Bad Request
      }
      
      res.status(statusCode).json({
        error: 'Failed to update campaign',
        message: errorMessage,
        ...(process.env.NODE_ENV === 'development' && { details: error.stack }),
      });
    }
}));

/**
 * Get API status for all platforms
 * GET /api/ads-manager/status
 */
router.get('/status', auth, asyncHandler(async (req, res) => {
  try {
    const status = {
      meta: {
        enabled: false,
        hasCredentials: false,
      },
      google: {
        enabled: false,
        hasCredentials: false,
      },
      klaviyo: {
        enabled: false,
        hasCredentials: false,
      },
    };

    // Check Meta
    const metaAppId = process.env.META_APP_ID;
    const metaAccessToken = process.env.META_ACCESS_TOKEN;
    const metaAdAccountId = process.env.META_AD_ACCOUNT_ID;
    status.meta.hasCredentials = !!(metaAppId && metaAccessToken && metaAdAccountId);
    if (status.meta.hasCredentials) {
      try {
        const metaService = new MetaAdsService();
        status.meta.enabled = metaService.enabled;
        // Note: Token validation happens when fetching campaigns
        // Expired tokens will be caught and displayed as errors in the UI
      } catch (err) {
        status.meta.error = err.message;
      }
    }

    // Check Google
    const googleClientId = process.env.GOOGLE_ADS_CLIENT_ID;
    const googleRefreshToken = process.env.GOOGLE_ADS_REFRESH_TOKEN;
    const googleDeveloperToken = process.env.GOOGLE_ADS_DEVELOPER_TOKEN;
    const googleCustomerId = process.env.GOOGLE_ADS_CUSTOMER_ID;
    status.google.hasCredentials = !!(googleClientId && googleRefreshToken && googleDeveloperToken && googleCustomerId);
    if (status.google.hasCredentials) {
      try {
        const googleService = new GoogleAdsService();
        status.google.enabled = googleService.enabled;
      } catch (err) {
        status.google.error = err.message;
      }
    }

    // Check Klaviyo
    const klaviyoApiKey = process.env.KLAVIYO_API_KEY;
    status.klaviyo.hasCredentials = !!klaviyoApiKey;
    if (status.klaviyo.hasCredentials) {
      try {
        const klaviyoService = new KlaviyoAdsService();
        status.klaviyo.enabled = klaviyoService.enabled;
      } catch (err) {
        status.klaviyo.error = err.message;
      }
    }

    res.json(status);
  } catch (error) {
    logger.error({ err: error }, 'Error checking ads manager status:');
    res.status(500).json({
      error: 'Failed to check status',
      message: error.message,
    });
  }
}));

/**
 * Get metrics for campaigns (Meta only - lazy loading)
 * GET /api/ads-manager/campaigns/meta/metrics
 * Query params:
 *   - campaignIds: comma-separated list of campaign IDs (optional, if not provided fetches all)
 */
router.get('/campaigns/meta/metrics', auth, asyncHandler(async (req, res) => {
  try {
    const metaService = new MetaAdsService();
    
    if (!metaService.enabled) {
      return res.status(400).json({
        error: 'Meta Ads API is not configured',
      });
    }

    const campaignIds = req.query.campaignIds 
      ? req.query.campaignIds.split(',').filter(id => id.trim())
      : null;

    const metrics = await metaService.getCampaignsMetrics(campaignIds);
    
    res.json({ success: true, metrics });
  } catch (error) {
    logger.error({ err: error }, 'Error fetching campaign metrics:');
    
    // Check for expired token errors
    if (error.message?.includes('expired') || 
        error.message?.includes('Session has expired') ||
        error.message?.includes('Error validating access token')) {
      return res.status(401).json({
        error: 'Access token expired',
        message: error.message || 'Your Meta access token has expired. Please generate a new long-lived access token or use a System User token (never expires).',
        tokenExpired: true,
      });
    }
    
    // Check for rate limit errors
    if (error.response?.code === 17 || 
        error.response?.error_subcode === 2446079 ||
        error.message?.includes('request limit reached') ||
        error.message?.includes('too many calls')) {
      return res.status(429).json({
        error: 'Rate limit exceeded',
        message: 'Too many API calls to Meta. Please wait a moment and try again.',
        retryAfter: 60,
      });
    }
    
    res.status(500).json({
      error: 'Failed to fetch metrics',
      message: error.message,
    });
  }
}));

/**
 * Get ad sets for a campaign (Meta only)
 * GET /api/ads-manager/campaigns/meta/:campaignId/ad-sets
 */
router.get('/campaigns/meta/:campaignId/ad-sets', auth, asyncHandler(async (req, res) => {
  try {
    const { campaignId } = req.params;
    const metaService = new MetaAdsService();
    
    if (!metaService.enabled) {
      return res.status(400).json({
        error: 'Meta Ads API is not configured',
      });
    }

    const adSets = await metaService.getAdSets(campaignId);
    res.json({ success: true, adSets });
  } catch (error) {
    logger.error({ err: error }, 'Error fetching ad sets for campaign ${req.params.campaignId}:');
    
    // Check for expired token errors
    if (error.message?.includes('expired') || 
        error.message?.includes('Session has expired') ||
        error.message?.includes('Error validating access token')) {
      return res.status(401).json({
        error: 'Access token expired',
        message: error.message || 'Your Meta access token has expired. Please generate a new long-lived access token or use a System User token (never expires).',
        tokenExpired: true,
      });
    }
    
    // Check for rate limit errors
    if (error.response?.code === 17 || 
        error.response?.error_subcode === 2446079 ||
        error.message?.includes('request limit reached') ||
        error.message?.includes('too many calls')) {
      return res.status(429).json({
        error: 'Rate limit exceeded',
        message: 'Too many API calls to Meta. Please wait a moment and try again.',
        retryAfter: 60, // Suggest waiting 60 seconds
      });
    }
    
    // Check for permission errors
    if (error.response?.error_subcode === 4841013 ||
        error.message?.includes('Permission denied') ||
        error.message?.includes('ads_management')) {
      return res.status(403).json({
        error: 'Permission denied',
        message: error.message || 'Your Meta access token needs "ads_management" permission.',
      });
    }
    
    res.status(500).json({
      error: 'Failed to fetch ad sets',
      message: error.message,
    });
  }
}));

/**
 * Update ad set status (Meta only)
 * PATCH /api/ads-manager/ad-sets/meta/:adSetId
 * Body: { status: 'ACTIVE' | 'PAUSED' }
 */
router.patch('/ad-sets/meta/:adSetId', auth, asyncHandler(async (req, res) => {
  try {
    const { adSetId } = req.params;
    const { status } = req.body;

    if (!status || !['ACTIVE', 'PAUSED'].includes(status)) {
      return res.status(400).json({
        error: 'Status is required and must be ACTIVE or PAUSED',
      });
    }

    const metaService = new MetaAdsService();
    if (!metaService.enabled) {
      return res.status(400).json({
        error: 'Meta Ads API is not configured',
      });
    }

    const updatedAdSet = await metaService.updateAdSetStatus(adSetId, status);
    res.json({ success: true, adSet: updatedAdSet });
  } catch (error) {
    logger.error({ err: error }, 'Error updating ad set ${req.params.adSetId}:');
    res.status(500).json({
      error: 'Failed to update ad set',
      message: error.message,
    });
  }
}));

/**
 * Get ads for an ad set (Meta only)
 * GET /api/ads-manager/ad-sets/meta/:adSetId/ads
 */
router.get('/ad-sets/meta/:adSetId/ads', auth, asyncHandler(async (req, res) => {
  try {
    const { adSetId } = req.params;
    const metaService = new MetaAdsService();
    
    if (!metaService.enabled) {
      return res.status(400).json({
        error: 'Meta Ads API is not configured',
      });
    }

    const ads = await metaService.getAds(adSetId);
    res.json({ success: true, ads });
  } catch (error) {
    logger.error({ err: error }, 'Error fetching ads for ad set ${req.params.adSetId}:');
    
    // Check for expired token errors
    if (error.message?.includes('expired') || 
        error.message?.includes('Session has expired') ||
        error.message?.includes('Error validating access token')) {
      return res.status(401).json({
        error: 'Access token expired',
        message: error.message || 'Your Meta access token has expired. Please generate a new long-lived access token or use a System User token (never expires).',
        tokenExpired: true,
      });
    }
    
    // Check for rate limit errors
    if (error.response?.code === 17 || 
        error.response?.error_subcode === 2446079 ||
        error.message?.includes('request limit reached') ||
        error.message?.includes('too many calls')) {
      return res.status(429).json({
        error: 'Rate limit exceeded',
        message: 'Too many API calls to Meta. Please wait a moment and try again.',
        retryAfter: 60,
      });
    }
    
    res.status(500).json({
      error: 'Failed to fetch ads',
      message: error.message,
    });
  }
}));

/**
 * Update ad status (Meta only)
 * PATCH /api/ads-manager/ads/meta/:adId
 * Body: { status: 'ACTIVE' | 'PAUSED' }
 */
router.patch('/ads/meta/:adId', auth, asyncHandler(async (req, res) => {
  try {
    const { adId } = req.params;
    const { status } = req.body;

    if (!status || !['ACTIVE', 'PAUSED'].includes(status)) {
      return res.status(400).json({
        error: 'Status is required and must be ACTIVE or PAUSED',
      });
    }

    const metaService = new MetaAdsService();
    if (!metaService.enabled) {
      return res.status(400).json({
        error: 'Meta Ads API is not configured',
      });
    }

    const updatedAd = await metaService.updateAdStatus(adId, status);
    res.json({ success: true, ad: updatedAd });
  } catch (error) {
    logger.error({ err: error }, 'Error updating ad ${req.params.adId}:');
    res.status(500).json({
      error: 'Failed to update ad',
      message: error.message,
    });
  }
}));

/**
 * Update campaign budget (Meta only)
 * PATCH /api/ads-manager/campaigns/meta/:campaignId/budget
 * Body: { dailyBudget?: number, lifetimeBudget?: number }
 */
router.patch('/campaigns/meta/:campaignId/budget', auth, asyncHandler(async (req, res) => {
  try {
    const { campaignId } = req.params;
    const { dailyBudget, lifetimeBudget } = req.body;

    if (dailyBudget === undefined && lifetimeBudget === undefined) {
      return res.status(400).json({
        error: 'At least one budget value (dailyBudget or lifetimeBudget) is required',
      });
    }

    const metaService = new MetaAdsService();
    if (!metaService.enabled) {
      return res.status(400).json({
        error: 'Meta Ads API is not configured',
      });
    }

    const updatedCampaign = await metaService.updateCampaignBudget(campaignId, {
      dailyBudget,
      lifetimeBudget,
    });

    // Clear cache after updating budget
    metaService.clearCache();

    res.json({ success: true, campaign: updatedCampaign });
  } catch (error) {
    logger.error({ err: error }, 'Error updating campaign ${req.params.campaignId} budget:');
    res.status(500).json({
      error: 'Failed to update budget',
      message: error.message,
    });
  }
}));

/**
 * Update campaign schedule (Meta only)
 * PATCH /api/ads-manager/campaigns/meta/:campaignId/schedule
 * Body: { startTime?: string (ISO), endTime?: string (ISO) }
 */
router.patch('/campaigns/meta/:campaignId/schedule', auth, asyncHandler(async (req, res) => {
  try {
    const { campaignId } = req.params;
    const { startTime, endTime } = req.body;

    if (!startTime && !endTime) {
      return res.status(400).json({
        error: 'At least one schedule value (startTime or endTime) is required',
      });
    }

    const metaService = new MetaAdsService();
    if (!metaService.enabled) {
      return res.status(400).json({
        error: 'Meta Ads API is not configured',
      });
    }

    const updatedCampaign = await metaService.updateCampaignSchedule(campaignId, {
      startTime,
      endTime,
    });

    // Clear cache after updating schedule
    metaService.clearCache();

    res.json({ success: true, campaign: updatedCampaign });
  } catch (error) {
    logger.error({ err: error }, 'Error updating campaign ${req.params.campaignId} schedule:');
    res.status(500).json({
      error: 'Failed to update schedule',
      message: error.message,
    });
  }
}));

/**
 * Duplicate a campaign (Meta only)
 * POST /api/ads-manager/campaigns/meta/:campaignId/duplicate
 * Body: { newName: string, status?: 'PAUSED' | 'ACTIVE' }
 */
router.post('/campaigns/meta/:campaignId/duplicate', auth, asyncHandler(async (req, res) => {
  try {
    const { campaignId } = req.params;
    const { newName, status } = req.body;

    if (!newName) {
      return res.status(400).json({
        error: 'newName is required',
      });
    }

    const metaService = new MetaAdsService();
    if (!metaService.enabled) {
      return res.status(400).json({
        error: 'Meta Ads API is not configured',
      });
    }

    const newCampaign = await metaService.duplicateCampaign(campaignId, newName, {
      status: status || 'PAUSED',
    });

    // Clear cache after duplicating campaign
    metaService.clearCache();

    res.json({ success: true, campaign: newCampaign });
  } catch (error) {
    logger.error({ err: error }, 'Error duplicating campaign ${req.params.campaignId}:');
    res.status(500).json({
      error: 'Failed to duplicate campaign',
      message: error.message,
    });
  }
}));

/**
 * Update campaign budget (Google only)
 * PATCH /api/ads-manager/campaigns/google/:campaignId/budget
 * Body: { dailyBudget: number } (in dollars)
 */
router.patch('/campaigns/google/:campaignId/budget', auth, asyncHandler(async (req, res) => {
  try {
    const { campaignId } = req.params;
    const { dailyBudget } = req.body;

    if (dailyBudget === undefined || dailyBudget === null) {
      return res.status(400).json({
        error: 'dailyBudget is required',
      });
    }

    if (typeof dailyBudget !== 'number' || dailyBudget <= 0) {
      return res.status(400).json({
        error: 'dailyBudget must be a positive number',
      });
    }

    const googleService = new GoogleAdsService();
    if (!googleService.enabled) {
      return res.status(400).json({
        error: 'Google Ads API is not configured',
      });
    }

    const result = await googleService.updateCampaignBudget(campaignId, dailyBudget);

    res.json({ success: true, campaign: result });
  } catch (error) {
    logger.error({ err: error }, 'Error updating Google campaign ${req.params.campaignId} budget:');
    res.status(500).json({
      error: 'Failed to update budget',
      message: error.message,
    });
  }
}));

/**
 * Get single campaign details (Google only)
 * GET /api/ads-manager/campaigns/google/:campaignId
 */
router.get('/campaigns/google/:campaignId', auth, asyncHandler(async (req, res) => {
  try {
    const { campaignId } = req.params;

    const googleService = new GoogleAdsService();
    if (!googleService.enabled) {
      return res.status(400).json({
        error: 'Google Ads API is not configured',
      });
    }

    // Get all campaigns and find the specific one
    const campaigns = await googleService.getCampaignsList();
    const campaign = campaigns.find(c => c.id === campaignId);

    if (!campaign) {
      return res.status(404).json({
        error: 'Campaign not found',
      });
    }

    res.json({ success: true, campaign });
  } catch (error) {
    logger.error({ err: error }, 'Error fetching Google campaign ${req.params.campaignId}:');
    res.status(500).json({
      error: 'Failed to fetch campaign',
      message: error.message,
    });
  }
}));

module.exports = router;
