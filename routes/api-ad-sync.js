// routes/api-ad-sync.js
/**
 * Ad Data Sync API
 * Synchronizes ad performance data from Meta and Google Ads APIs
 * and stores it in the ad_spend_data table
 */

const express = require('express');
const { pool } = global;
const router = express.Router();
const auth = global.auth;
const { asyncHandler } = require('../middleware/error-handler');
const { logger } = require('../utils/logger');

// Import ad services (will be created)
let MetaAdsService, GoogleAdsService;
try {
  MetaAdsService = require('../services/meta-ads-api');
  GoogleAdsService = require('../services/google-ads-api');
} catch (err) {
  logger.warn({ data: err.message }, 'Ad service modules not available:');
}

/**
 * Test Google Ads API connection with a simple query
 * GET /api/ad-sync/test-google
 */
router.get('/test-google', auth, asyncHandler(async (req, res) => {
  try {
    const GoogleAdsService = require('../services/google-ads-api');
    const googleService = new GoogleAdsService();
    
    if (!googleService.enabled) {
      return res.status(400).json({
        error: 'Google Ads API is not configured',
        message: 'Please check your environment variables'
      });
    }

    // Try a very simple query to test the connection
    try {
      // Use the service's fetchAdMetrics method with a small date range (last 7 days)
      // This is more reliable than direct query access
      const endDate = new Date().toISOString().split('T')[0];
      const startDate = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString().split('T')[0];
      
      const results = await googleService.fetchAdMetrics(startDate, endDate);
      
      res.json({
        success: true,
        message: 'Google Ads API connection successful!',
        testResults: results.length > 0 
          ? `Found ${results.length} campaign record(s) with data for the last 7 days` 
          : 'No campaigns found with data for the last 7 days (but API is working)',
        sampleCampaign: results[0] || null,
        recordCount: results.length
      });
    } catch (testError) {
      logger.error({ err: testError }, 'Google Ads API test error:');
      logger.error({ error: testError.code }, 'Error code:');
      logger.error({ error: testError.details }, 'Error details:');
      
      // Provide helpful error messages
      let errorMessage = testError.message || 'Unknown error';
      let suggestion = 'Check your credentials and API access level.';
      
      if (testError.code === 12) {
        if (testError.details && testError.details.includes('GRPC target method')) {
          errorMessage = 'Google Ads API method not found (GRPC error). This usually means Basic Access approval is still propagating (can take 2-24 hours after approval).';
          suggestion = 'Wait 2-24 hours and try again. If the issue persists after 24 hours, check the Google Ads API Center to confirm Basic Access is fully active.';
        } else {
          errorMessage = `Google Ads API error (code 12): ${testError.message || 'Unknown error'}`;
          suggestion = 'Please verify your developer token has Basic Access approved and wait for it to fully propagate (can take 2-24 hours).';
        }
      } else if (testError.message && testError.message.includes('invalid_client')) {
        errorMessage = 'Google Ads OAuth authentication failed. Please verify your Client ID, Client Secret, and Refresh Token are correct.';
        suggestion = 'The refresh token may need to be regenerated. Check your OAuth credentials in Google Cloud Console.';
      } else if (testError.message && testError.message.includes('invalid_grant')) {
        errorMessage = 'Google Ads refresh token is invalid or expired.';
        suggestion = 'Please generate a new refresh token using the OAuth Playground.';
      } else if (testError.code === 16 || testError.message?.includes('UNAUTHENTICATED')) {
        errorMessage = 'Google Ads API authentication failed.';
        suggestion = 'Please verify your OAuth credentials (Client ID, Client Secret, Refresh Token) are correct.';
      } else if (testError.code === 7 || testError.message?.includes('PERMISSION_DENIED')) {
        errorMessage = 'Google Ads API permission denied.';
        suggestion = 'Please verify your developer token has Basic Access and that the customer ID is accessible with your credentials.';
      }
      
      res.status(500).json({
        error: 'Google Ads API test failed',
        message: errorMessage,
        code: testError.code,
        details: testError.details,
        suggestion: suggestion
      });
    }
  } catch (error) {
    logger.error({ err: error }, 'Error testing Google Ads API:');
    res.status(500).json({
      error: 'Failed to test Google Ads API',
      details: error.message
    });
  }
}));

/**
 * Test endpoint to check API configuration status
 * GET /api/ad-sync/status
 */
router.get('/status', auth, asyncHandler(async (req, res) => {
  try {
    const status = {
      meta: {
        enabled: false,
        hasCredentials: false,
        credentials: {}
      },
      google: {
        enabled: false,
        hasCredentials: false,
        credentials: {}
      }
    };

    // Check Meta Ads configuration
    const metaAppId = process.env.META_APP_ID;
    const metaAppSecret = process.env.META_APP_SECRET;
    const metaAccessToken = process.env.META_ACCESS_TOKEN;
    const metaAdAccountId = process.env.META_AD_ACCOUNT_ID;

    status.meta.hasCredentials = !!(metaAppId && metaAppSecret && metaAccessToken && metaAdAccountId);
    status.meta.credentials = {
      hasAppId: !!metaAppId,
      hasAppSecret: !!metaAppSecret,
      hasAccessToken: !!metaAccessToken,
      hasAdAccountId: !!metaAdAccountId,
      adAccountId: metaAdAccountId ? metaAdAccountId.substring(0, 10) + '...' : null
    };

    if (status.meta.hasCredentials) {
      try {
        const metaService = new MetaAdsService();
        status.meta.enabled = metaService.enabled;
      } catch (err) {
        status.meta.error = err.message;
      }
    }

    // Check Google Ads configuration
    const googleClientId = process.env.GOOGLE_ADS_CLIENT_ID;
    const googleClientSecret = process.env.GOOGLE_ADS_CLIENT_SECRET;
    const googleRefreshToken = process.env.GOOGLE_ADS_REFRESH_TOKEN;
    const googleDeveloperToken = process.env.GOOGLE_ADS_DEVELOPER_TOKEN;
    const googleCustomerId = process.env.GOOGLE_ADS_CUSTOMER_ID;

    status.google.hasCredentials = !!(googleClientId && googleClientSecret && googleRefreshToken && googleDeveloperToken && googleCustomerId);
    status.google.credentials = {
      hasClientId: !!googleClientId,
      hasClientSecret: !!googleClientSecret,
      hasRefreshToken: !!googleRefreshToken,
      hasDeveloperToken: !!googleDeveloperToken,
      hasCustomerId: !!googleCustomerId
    };

    if (status.google.hasCredentials) {
      try {
        const googleService = new GoogleAdsService();
        status.google.enabled = googleService.enabled;
      } catch (err) {
        status.google.error = err.message;
      }
    }

    res.json(status);
  } catch (error) {
    logger.error({ err: error }, 'Error checking ad sync status:');
    res.status(500).json({
      error: 'Failed to check status',
      details: error.message,
    });
  }
}));

/**
 * Sync ad data from Meta and Google Ads APIs
 * POST /api/ad-sync/sync
 * Query params:
 *   - startDate: YYYY-MM-DD (optional, defaults to 30 days ago)
 *   - endDate: YYYY-MM-DD (optional, defaults to today)
 *   - platform: 'meta', 'google', or 'all' (optional, defaults to 'all')
 */
router.post('/sync', auth, asyncHandler(async (req, res) => {
  try {
    const { startDate, endDate, platform = 'all' } = req.body;

    // Default to last 30 days if not provided
    const end = endDate ? new Date(endDate) : new Date();
    const start = startDate ? new Date(startDate) : new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);

    const startISO = start.toISOString().split('T')[0];
    const endISO = end.toISOString().split('T')[0];

    const results = {
      meta: { synced: 0, errors: [] },
      google: { synced: 0, errors: [] },
    };

    // Sync Meta Ads
    if (platform === 'all' || platform === 'meta') {
      try {
        logger.info('🔵 Attempting Meta Ads sync...');
        const metaService = new MetaAdsService();
        logger.info({ data: metaService.enabled }, 'Meta service enabled:');
        
        if (metaService.enabled) {
          logger.info('Meta Ads API is enabled, fetching insights...');
          // Add timeout wrapper
          const timeoutPromise = new Promise((_, reject) => {
            setTimeout(() => reject(new Error('Meta Ads API request timed out after 30 seconds')), 30000);
          });
          
          const metaDataPromise = metaService.fetchAdInsights(startISO, endISO);
          logger.info('Starting Promise.race for Meta Ads...');
          const metaData = await Promise.race([metaDataPromise, timeoutPromise]);
          logger.info({ records: metaData.length }, 'Meta Ads data received');
          
          await syncAdDataToDatabase(metaData, 'meta');
          results.meta.synced = metaData.length;
        } else {
          logger.info('Meta Ads API not configured');
          results.meta.errors.push('Meta Ads API not configured');
        }
      } catch (error) {
        logger.error({ err: error }, 'Error syncing Meta Ads:');
        results.meta.errors.push(error.message);
      }
    }

    // Sync Google Ads
    if (platform === 'all' || platform === 'google') {
      try {
        logger.info('🟢 Attempting Google Ads sync...');
        const googleService = new GoogleAdsService();
        logger.info({ data: googleService.enabled }, 'Google service enabled:');
        
        if (!googleService.enabled) {
          const errorMsg = 'Google Ads API not configured. Please check your environment variables (GOOGLE_ADS_CLIENT_ID, GOOGLE_ADS_CLIENT_SECRET, GOOGLE_ADS_REFRESH_TOKEN, GOOGLE_ADS_DEVELOPER_TOKEN, GOOGLE_ADS_CUSTOMER_ID).';
          logger.info({ data: errorMsg }, 'errorMsg');
          results.google.errors.push(errorMsg);
        } else {
          logger.info('Google Ads API is enabled, fetching metrics...');
          // Add timeout wrapper (increased to 60 seconds for Google Ads)
          const timeoutPromise = new Promise((_, reject) => {
            setTimeout(() => reject(new Error('Google Ads API request timed out after 60 seconds')), 60000);
          });
          
          const googleDataPromise = googleService.fetchAdMetrics(startISO, endISO);
          logger.info('Starting Promise.race for Google Ads...');
          const googleData = await Promise.race([googleDataPromise, timeoutPromise]);
          logger.info({ records: googleData.length }, 'Google Ads data received');
          
          await syncAdDataToDatabase(googleData, 'google');
          results.google.synced = googleData.length;
        }
      } catch (error) {
        logger.error({ err: error, errorDetails: { message: error.message, code: error.code, details: error.details } }, 'Error syncing Google Ads');
        
        // Provide more helpful error messages
        let errorMessage = error.message || 'Unknown error occurred';
        if (error.code === 12) {
          errorMessage = `Google Ads API error (code 12): ${error.message || 'Unknown error'}. This usually means: 1) Basic Access approval is still propagating (can take 2-24 hours after approval), 2) The API method may not be available, or 3) There may be an API version mismatch. Please wait a few hours and try again. If the issue persists after 24 hours, check the Google Ads API Center to confirm Basic Access is fully active.`;
        } else if (error.message && error.message.includes('invalid_client')) {
          errorMessage = 'Google Ads OAuth authentication failed. Please verify your Client ID, Client Secret, and Refresh Token are correct. The refresh token may need to be regenerated.';
        } else if (error.message && error.message.includes('invalid_grant')) {
          errorMessage = 'Google Ads refresh token is invalid or expired. Please generate a new refresh token.';
        } else if (error.code === 16 || error.message?.includes('UNAUTHENTICATED')) {
          errorMessage = 'Google Ads API authentication failed. Please verify your OAuth credentials (Client ID, Client Secret, Refresh Token) are correct.';
        } else if (error.code === 7 || error.message?.includes('PERMISSION_DENIED')) {
          errorMessage = 'Google Ads API permission denied. Please verify your developer token has Basic Access and that the customer ID is accessible with your credentials.';
        }
        
        results.google.errors.push(errorMessage);
      }
    }

    logger.info({ data: JSON.stringify(results, null, 2) }, 'Sync completed:');

    // Check if there were any errors
    const hasErrors = results.meta.errors.length > 0 || results.google.errors.length > 0;
    const hasSuccess = results.meta.synced > 0 || results.google.synced > 0;

    if (hasErrors && !hasSuccess) {
      // All syncs failed
      const errorMessages = [
        ...(results.meta.errors.length > 0 ? [`Meta: ${results.meta.errors.join(', ')}`] : []),
        ...(results.google.errors.length > 0 ? [`Google: ${results.google.errors.join(', ')}`] : [])
      ];
      return res.status(500).json({
        error: 'Sync failed',
        message: errorMessages.join('; '),
        results
      });
    } else if (hasErrors) {
      // Partial success
      return res.status(207).json({
        message: 'Sync completed with some errors',
        results
      });
    } else {
      // Success
      return res.json({
        message: 'Sync completed successfully',
        results
      });
    }
  } catch (error) {
    logger.error({ err: error }, 'Error in ad sync:');
    return res.status(500).json({
      error: 'Sync failed',
      message: error.message || 'Unknown error occurred',
      details: error.stack
    });
  }
}));

/**
 * Get ad spend data
 * GET /api/ad-sync/data
 * Query params:
 *   - startDate: YYYY-MM-DD
 *   - endDate: YYYY-MM-DD
 *   - platform: 'meta', 'google', or 'all'
 *   - utmCampaign: filter by UTM campaign name
 */
router.get('/data', auth, asyncHandler(async (req, res) => {
  try {
    const { startDate, endDate, platform, utmCampaign } = req.query;

    let query = `
      SELECT 
        platform,
        account_id AS "accountId",
        campaign_id AS "campaignId",
        campaign_name AS "campaignName",
        utm_campaign AS "utmCampaign",
        date,
        impressions,
        clicks,
        spend,
        ctr,
        cpc,
        conversions,
        conversion_rate AS "conversionRate",
        created_at AS "createdAt",
        updated_at AS "updatedAt"
      FROM ad_spend_data
      WHERE 1=1
    `;
    const params = [];
    let paramIndex = 1;

    if (startDate) {
      query += ` AND date >= $${paramIndex}`;
      params.push(startDate);
      paramIndex++;
    }

    if (endDate) {
      query += ` AND date <= $${paramIndex}`;
      params.push(endDate);
      paramIndex++;
    }

    if (platform && platform !== 'all') {
      query += ` AND platform = $${paramIndex}`;
      params.push(platform);
      paramIndex++;
    }

    if (utmCampaign) {
      query += ` AND utm_campaign = $${paramIndex}`;
      params.push(utmCampaign);
      paramIndex++;
    }

    query += ` ORDER BY date DESC, platform, campaign_name`;

    const result = await pool.query(query, params);
    res.json(result.rows);
  } catch (error) {
    logger.error({ err: error }, 'Error fetching ad spend data:');
    res.status(500).json({
      error: 'Failed to fetch ad spend data',
      details: error.message,
    });
  }
}));

/**
 * Helper function to sync ad data to database
 */
async function syncAdDataToDatabase(adData, platform) {
  if (!adData || adData.length === 0) {
    return;
  }

  // Use INSERT ... ON CONFLICT to update existing records
  for (const record of adData) {
    // Use adset_id if available, otherwise use campaign_id for unique constraint
    const uniqueId = record.adsetId || record.campaignId;
    
    const query = `
      INSERT INTO ad_spend_data (
        platform,
        account_id,
        campaign_id,
        campaign_name,
        adset_id,
        adset_name,
        location,
        utm_campaign,
        date,
        impressions,
        clicks,
        spend,
        ctr,
        cpc,
        conversions,
        conversion_rate,
        updated_at
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, NOW())
      ON CONFLICT (platform, COALESCE(adset_id, campaign_id), date) 
      DO UPDATE SET
        campaign_name = EXCLUDED.campaign_name,
        adset_id = EXCLUDED.adset_id,
        adset_name = EXCLUDED.adset_name,
        location = EXCLUDED.location,
        utm_campaign = EXCLUDED.utm_campaign,
        impressions = EXCLUDED.impressions,
        clicks = EXCLUDED.clicks,
        spend = EXCLUDED.spend,
        ctr = EXCLUDED.ctr,
        cpc = EXCLUDED.cpc,
        conversions = EXCLUDED.conversions,
        conversion_rate = EXCLUDED.conversion_rate,
        updated_at = NOW()
    `;

    await pool.query(query, [
      platform,
      record.accountId,
      record.campaignId,
      record.campaignName,
      record.adsetId || null,
      record.adsetName || null,
      record.location || null,
      record.utmCampaign,
      record.date,
      record.impressions,
      record.clicks,
      record.spend,
      record.ctr,
      record.cpc,
      record.conversions,
      record.conversionRate,
    ]);
  }
}

module.exports = router;

