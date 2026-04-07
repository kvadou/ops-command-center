// services/meta-ads-api.js
/**
 * Meta (Facebook) Ads API Integration Service
 * Fetches ad performance data from Meta Marketing API
 * 
 * Required Environment Variables:
 * - META_APP_ID: Your Meta App ID
 * - META_APP_SECRET: Your Meta App Secret
 * - META_ACCESS_TOKEN: Long-lived access token with ads_read permission
 * - META_AD_ACCOUNT_ID: Your Meta Ad Account ID (format: act_123456789)
 */

const { FacebookAdsApi, AdAccount, Campaign, AdSet, Ad, ServerEvent, EventRequest, UserData, CustomData } = require('facebook-nodejs-business-sdk');
const { DateTime } = require('luxon');
const crypto = require('crypto');
const { parseLocationFromName } = require('../utils/locationParser');
const { logger } = require('../utils/logger');

class MetaAdsService {
  constructor() {
    const appId = process.env.META_APP_ID;
    const appSecret = process.env.META_APP_SECRET;
    const accessToken = process.env.META_ACCESS_TOKEN;
    const adAccountId = process.env.META_AD_ACCOUNT_ID;

    if (!appId || !appSecret || !accessToken || !adAccountId) {
      logger.warn('Meta Ads API credentials not configured. Set META_APP_ID, META_APP_SECRET, META_ACCESS_TOKEN, and META_AD_ACCOUNT_ID environment variables.');
      this.enabled = false;
      return;
    }

    // Ensure ad account ID has 'act_' prefix (required by Meta API)
    // Accept both formats: 'act_123456789' or just '123456789'
    const normalizedAdAccountId = adAccountId.startsWith('act_') 
      ? adAccountId 
      : `act_${adAccountId}`;

    // Initialize Facebook Ads API
    FacebookAdsApi.init(accessToken);
    this.api = FacebookAdsApi.init(accessToken);
    this.adAccountId = normalizedAdAccountId;
    this.pixelId = process.env.META_PIXEL_ID || '1882314972045275'; // Default from index.html
    this.enabled = true;

    // In-memory cache for campaigns and metrics
    // Cache structure: { key: { data: ..., timestamp: ..., ttl: ... } }
    this.cache = {};
    this.CACHE_TTL = 5 * 60 * 1000; // 5 minutes default
    this.METRICS_CACHE_TTL = 15 * 60 * 1000; // 15 minutes for metrics (less frequently changing)
  }

  /**
   * Check if the service is configured and ready to use
   * @returns {boolean} True if the API is configured
   */
  isConfigured() {
    return this.enabled === true;
  }

  /**
   * Get cached data if still valid
   * @param {string} key - Cache key
   * @param {number} ttl - Time to live in milliseconds
   * @returns {any|null} Cached data or null if expired/missing
   */
  _getCache(key, ttl = this.CACHE_TTL) {
    const cached = this.cache[key];
    if (!cached) return null;
    
    const age = Date.now() - cached.timestamp;
    if (age > ttl) {
      delete this.cache[key];
      return null;
    }
    
    return cached.data;
  }

  /**
   * Set cache data
   * @param {string} key - Cache key
   * @param {any} data - Data to cache
   */
  _setCache(key, data) {
    this.cache[key] = {
      data,
      timestamp: Date.now(),
    };
  }

  /**
   * Clear cache for a specific key or all cache
   * @param {string} key - Optional cache key to clear, or undefined to clear all
   */
  clearCache(key) {
    if (key) {
      delete this.cache[key];
    } else {
      this.cache = {};
    }
  }

  /**
   * Fetch ad insights for a date range
   * @param {string} startDate - ISO date string (YYYY-MM-DD)
   * @param {string} endDate - ISO date string (YYYY-MM-DD)
   * @returns {Promise<Array>} Array of ad insights with campaign details
   */
  async fetchAdInsights(startDate, endDate) {
    if (!this.enabled) {
      logger.info('[STUB] Meta Ads fetchAdInsights — returning mock data');
      return [
        { platform: 'meta', accountId: 'act_stub', campaignId: '2001', campaignName: 'Parent Awareness - Facebook', adsetId: '3001', adsetName: 'Metro Area Parents 25-45', location: Westside, utmCampaign: 'parent_awareness', date: startDate, impressions: 12450, clicks: 342, spend: 256.80, ctr: 2.75, cpc: 0.75, conversions: 18, conversionRate: 5.26 },
        { platform: 'meta', accountId: 'act_stub', campaignId: '2002', campaignName: 'Enrollment Drive - Instagram', adsetId: '3002', adsetName: 'Family Interest Audiences', location: Eastside, utmCampaign: 'enrollment_drive', date: startDate, impressions: 8720, clicks: 215, spend: 178.40, ctr: 2.47, cpc: 0.83, conversions: 11, conversionRate: 5.12 },
        { platform: 'meta', accountId: 'act_stub', campaignId: '2003', campaignName: 'Retargeting - Website Visitors', adsetId: '3003', adsetName: 'Site Visitors 7d', location: null, utmCampaign: 'retargeting_web', date: startDate, impressions: 3200, clicks: 145, spend: 92.10, ctr: 4.53, cpc: 0.64, conversions: 9, conversionRate: 6.21 },
      ];
    }

    logger.info(`Fetching Meta Ads insights from ${startDate} to ${endDate} for account ${this.adAccountId}`);
    
    try {
      const account = new AdAccount(this.adAccountId);
      logger.info('AdAccount object created, calling getInsights...');
      
      // CRITICAL: Meta API may be filtering campaigns by default
      // Strategy: Fetch ALL campaigns first, then get insights for each campaign individually
      // This ensures we capture ALL campaigns regardless of status
      logger.info('Step 1: Fetching all campaigns...');
      const allCampaigns = await account.getCampaigns(['id', 'name', 'status', 'effective_status'], {
        limit: 1000,
        // Don't filter by status - get ALL campaigns
      });
      logger.info(`Found ${allCampaigns.length} total campaigns in account`);
      
      // CRITICAL: Fetch insights at account level FIRST to get comprehensive totals
      // Then fetch campaign-level insights
      // Meta API may limit results - we need to ensure we get ALL insights
      // The facebook-nodejs-business-sdk getInsights returns an array (or Promise<Array>)
      let allInsights = [];
      
      try {
        // Fetch insights - SDK should return an array
        // Use adset level to get location information from ad set names
        const insightsResponse = await account.getInsights(
          [
            'impressions',
            'clicks',
            'spend',
            'ctr',
            'cpc',
            'campaign_name',
            'campaign_id',
            'adset_name',
            'adset_id'
          ],
          {
            time_range: {
              since: startDate,
              until: endDate,
            },
            level: 'adset', // Get adset-level data to capture location information
            time_increment: 1, // Daily breakdown - returns one row per day per ad set
            limit: 5000, // Maximum limit per request
            // CRITICAL: Don't filter by status - we want ALL ad sets
            // The SDK might have default filters, so we explicitly don't set any
          }
        );
        
        // Handle response - SDK typically returns an array directly
        if (Array.isArray(insightsResponse)) {
          allInsights = insightsResponse;
        } else if (insightsResponse && Array.isArray(insightsResponse.data)) {
          // If wrapped in a data property
          allInsights = insightsResponse.data;
        } else {
          logger.warn({ data: typeof insightsResponse }, 'Unexpected insights response format:');
          allInsights = [];
        }
        
        logger.info(`Fetched ${allInsights.length} insights from Meta Ads API`);
        
        // Check if we're missing campaigns
        const campaignsWithInsights = new Set(allInsights.map(i => i.campaign_id));
        const campaignsWithoutInsights = allCampaigns.filter(c => !campaignsWithInsights.has(c.id));
        
        if (campaignsWithoutInsights.length > 0) {
          logger.warn(`⚠️  ${campaignsWithoutInsights.length} campaigns found but no insights returned`);
          logger.warn(`   This suggests campaigns may be filtered out by Meta API`);
          // Log first 10 missing campaigns for debugging
          campaignsWithoutInsights.slice(0, 10).forEach(c => {
            logger.warn(`   - ${c.name} (${c.id}) - Status: ${c.status}, Effective: ${c.effective_status}`);
          });
        }
        
        // If we got fewer insights than expected and account-level shows more activity,
        // there might be pagination or filtering issues
        if (allInsights.length > 0 && allInsights.length < 100) {
          logger.warn(`⚠️  Only received ${allInsights.length} insights - this might indicate pagination or filtering issues`);
        }
      } catch (error) {
        logger.error({ err: error }, 'Error fetching campaign-level insights:');
        throw error;
      }
      
      const insights = allInsights;

      logger.info(`Received ${insights.length} insights from Meta Ads API`);
      
      // Debug: Log date range of returned insights
      if (insights.length > 0) {
        const dates = insights.map(i => i.date_start).filter(Boolean).sort();
        const uniqueDates = [...new Set(dates)];
        logger.info(`📅 Insights cover ${uniqueDates.length} unique dates: ${uniqueDates[0]} to ${uniqueDates[uniqueDates.length - 1]}`);
        logger.info(`📊 Unique campaigns: ${[...new Set(insights.map(i => i.campaign_id))].length}`);
        
        // Calculate campaign-level totals
        const campaignTotals = {};
        insights.forEach(insight => {
          const campaignId = insight.campaign_id;
          if (!campaignTotals[campaignId]) {
            campaignTotals[campaignId] = { spend: 0, impressions: 0, clicks: 0 };
          }
          campaignTotals[campaignId].spend += parseFloat(insight.spend || 0);
          campaignTotals[campaignId].impressions += parseInt(insight.impressions || 0);
          campaignTotals[campaignId].clicks += parseInt(insight.clicks || 0);
        });
        const totalCampaignSpend = Object.values(campaignTotals).reduce((sum, c) => sum + c.spend, 0);
        logger.info(`📊 Campaign-level total spend: $${totalCampaignSpend.toFixed(2)}`);
      }
      
      // CRITICAL: Also fetch account-level totals to verify we're capturing ALL spend
      // This helps identify if campaigns are being filtered out
      try {
        const accountInsights = await account.getInsights(
          ['spend', 'impressions', 'clicks'],
          {
            time_range: {
              since: startDate,
              until: endDate,
            },
            level: 'account', // Account-level totals (includes ALL campaigns)
            time_increment: 1, // Daily breakdown
          }
        );
        if (accountInsights && accountInsights.length > 0) {
          const accountTotalSpend = accountInsights.reduce((sum, insight) => sum + parseFloat(insight.spend || 0), 0);
          const accountTotalImpressions = accountInsights.reduce((sum, insight) => sum + parseInt(insight.impressions || 0), 0);
          const accountTotalClicks = accountInsights.reduce((sum, insight) => sum + parseInt(insight.clicks || 0), 0);
          const accountDates = accountInsights.map(i => i.date_start).filter(Boolean).sort();
          const accountUniqueDates = [...new Set(accountDates)];
          
          logger.info(`📊 Account-level totals for ${startDate} to ${endDate}:`);
          logger.info(`   💰 Total spend: $${accountTotalSpend.toFixed(2)}`);
          logger.info(`   👁️  Total impressions: ${accountTotalImpressions.toLocaleString()}`);
          logger.info(`   🖱️  Total clicks: ${accountTotalClicks.toLocaleString()}`);
          logger.info(`   📅 Dates with activity: ${accountUniqueDates.length} (${accountUniqueDates[0]} to ${accountUniqueDates[accountUniqueDates.length - 1]})`);
          
          // Compare with campaign-level totals
          if (insights.length > 0) {
            const campaignTotalSpend = insights.reduce((sum, insight) => sum + parseFloat(insight.spend || 0), 0);
            const difference = accountTotalSpend - campaignTotalSpend;
            if (Math.abs(difference) > 0.01) {
              logger.warn(`⚠️  DISCREPANCY: Account-level spend ($${accountTotalSpend.toFixed(2)}) differs from campaign-level sum ($${campaignTotalSpend.toFixed(2)}) by $${difference.toFixed(2)}`);
              logger.warn(`   This suggests some campaigns may not be included in campaign-level insights`);
            }
          }
        }
      } catch (err) {
        logger.warn({ data: err.message }, 'Could not fetch account-level insights:');
      }

      // Transform data to match our schema
      const results = [];
      for (const insight of insights) {
        const campaignId = insight.campaign_id;
        const campaignName = insight.campaign_name || '';
        const adsetName = insight.adset_name || '';
        const adsetId = insight.adset_id || null;
        
        // Try to extract UTM campaign from campaign name
        // Many campaigns include UTM in the name like "Campaign Name - utm_campaign=value"
        let utmCampaign = campaignName;
        const utmMatch = campaignName.match(/utm_campaign[=:]\s*([^\s,]+)/i);
        if (utmMatch) {
          utmCampaign = utmMatch[1];
        }

        // Extract location from ad set name (preferred) or campaign name (fallback)
        // Ad set names typically contain location information
        const location = parseLocationFromName(adsetName || campaignName);

        // IMPORTANT: Use date_start from insight, not fallback to startDate
        // Meta API only returns insights for days with activity, so date_start is the actual date
        const insightDate = insight.date_start;
        if (!insightDate) {
          logger.warn(`⚠️  Insight missing date_start for campaign ${campaignId}, skipping`);
          continue;
        }

        results.push({
          platform: 'meta',
          accountId: this.adAccountId,
          campaignId: campaignId,
          campaignName: campaignName,
          adsetId: adsetId,
          adsetName: adsetName,
          location: location,
          utmCampaign: utmCampaign,
          date: insightDate, // Use actual date_start from insight
          impressions: parseInt(insight.impressions || 0),
          clicks: parseInt(insight.clicks || 0),
          spend: parseFloat(insight.spend || 0),
          ctr: parseFloat(insight.ctr || 0),
          cpc: parseFloat(insight.cpc || 0),
          conversions: parseInt(insight.actions?.find(a => a.action_type === 'purchase')?.value || 0),
          conversionRate: parseFloat(insight.conversion_rate || 0),
        });
      }

      return results;
    } catch (error) {
      logger.error({ err: error }, 'Error fetching Meta Ads insights:');
      
      // Check for expired token error
      if (this._isExpiredTokenError(error)) {
        const errorMsg = error.response?.error_user_msg || error.message || 'Access token has expired';
        throw new Error(`Meta access token expired: ${errorMsg}. Please generate a new long-lived access token or use a System User token (never expires).`);
      }
      
      throw error;
    }
  }

  /**
   * Fetch all campaigns to build a mapping of campaign names to UTM parameters
   * This helps match campaigns with UTM parameters from submissions
   */
  async fetchCampaigns() {
    if (!this.enabled) {
      logger.info('[STUB] Meta Ads fetchCampaigns — returning mock data');
      return [
        { id: '2001', name: 'Parent Awareness - Facebook', status: 'ACTIVE', effectiveStatus: 'ACTIVE' },
        { id: '2002', name: 'Enrollment Drive - Instagram', status: 'ACTIVE', effectiveStatus: 'ACTIVE' },
        { id: '2003', name: 'Retargeting - Website Visitors', status: 'PAUSED', effectiveStatus: 'PAUSED' },
      ];
    }

    try {
      const account = new AdAccount(this.adAccountId);
      // Fetch ALL campaigns regardless of status
      const campaigns = await account.getCampaigns(['name', 'id', 'status', 'effective_status'], {
        limit: 1000,
        // Don't filter by status - get ALL campaigns
      });

      return campaigns.map(campaign => ({
        id: campaign.id,
        name: campaign.name,
        status: campaign.status,
        effectiveStatus: campaign.effective_status,
      }));
    } catch (error) {
      logger.error({ err: error }, 'Error fetching Meta campaigns:');
      
      // Check for expired token error
      if (this._isExpiredTokenError(error)) {
        const errorMsg = error.response?.error_user_msg || error.message || 'Access token has expired';
        throw new Error(`Meta access token expired: ${errorMsg}. Please generate a new long-lived access token or use a System User token (never expires).`);
      }
      
      throw error;
    }
  }

  /**
   * Check if error is related to expired access token
   * @param {Error} error - Error object
   * @returns {boolean} True if error is about expired token
   */
  _isExpiredTokenError(error) {
    const errorMessage = error.message || '';
    const errorUserMsg = error.response?.error_user_msg || '';
    const errorUserTitle = error.response?.error_user_title || '';
    const errorType = error.response?.error?.type || '';
    
    return (
      errorMessage.includes('Session has expired') ||
      errorMessage.includes('expired') ||
      errorMessage.includes('Error validating access token') ||
      errorUserMsg.includes('Session has expired') ||
      errorUserMsg.includes('expired') ||
      errorUserTitle.includes('Session has expired') ||
      errorType === 'OAuthException' ||
      error.response?.error?.code === 190 ||
      error.response?.error_subcode === 463
    );
  }

  /**
   * Get detailed campaign list with optional performance metrics
   * @param {Object} options - Options object
   * @param {boolean} options.includeMetrics - Whether to include performance metrics (default: false for lazy loading)
   * @param {boolean} options.useCache - Whether to use cache (default: true)
   * @returns {Promise<Array>} Array of campaigns with details
   */
  async getCampaignsList(options = {}) {
    if (!this.enabled) {
      logger.info('[STUB] Meta Ads getCampaignsList — returning mock data');
      return [
        { id: '2001', name: 'Parent Awareness - Facebook', status: 'ACTIVE', effectiveStatus: 'ACTIVE', dailyBudget: 85.00, lifetimeBudget: null, objective: 'OUTCOME_AWARENESS', createdAt: '2025-01-15T10:00:00Z', updatedAt: '2025-03-01T14:30:00Z', metrics: { spend: 256.80, impressions: 12450, clicks: 342, ctr: 2.75, cpc: 0.75 } },
        { id: '2002', name: 'Enrollment Drive - Instagram', status: 'ACTIVE', effectiveStatus: 'ACTIVE', dailyBudget: 60.00, lifetimeBudget: null, objective: 'OUTCOME_LEADS', createdAt: '2025-02-01T09:00:00Z', updatedAt: '2025-03-10T11:00:00Z', metrics: { spend: 178.40, impressions: 8720, clicks: 215, ctr: 2.47, cpc: 0.83 } },
        { id: '2003', name: 'Retargeting - Website Visitors', status: 'PAUSED', effectiveStatus: 'PAUSED', dailyBudget: 40.00, lifetimeBudget: null, objective: 'OUTCOME_TRAFFIC', createdAt: '2025-01-20T08:00:00Z', updatedAt: '2025-02-28T16:00:00Z', metrics: { spend: 92.10, impressions: 3200, clicks: 145, ctr: 4.53, cpc: 0.64 } },
      ];
    }

    const { includeMetrics = false, useCache = true } = options;
    const cacheKey = `campaigns_${includeMetrics ? 'with_metrics' : 'basic'}`;

    // Check cache first
    if (useCache) {
      const cached = this._getCache(cacheKey);
      if (cached) {
        logger.info(`✅ Using cached campaigns data (${includeMetrics ? 'with' : 'without'} metrics)`);
        return cached;
      }
    }

    try {
      const account = new AdAccount(this.adAccountId);
      const campaigns = await account.getCampaigns([
        'id',
        'name',
        'status',
        'effective_status',
        'daily_budget',
        'lifetime_budget',
        'objective',
        'created_time',
        'updated_time'
      ], {
        limit: 1000,
      });

      // Map campaigns without metrics first (faster initial load)
      let campaignsWithMetrics = campaigns.map((campaign) => ({
        id: campaign.id,
        name: campaign.name,
        status: campaign.status,
        effectiveStatus: campaign.effective_status,
        dailyBudget: campaign.daily_budget ? parseFloat(campaign.daily_budget) / 100 : null,
        lifetimeBudget: campaign.lifetime_budget ? parseFloat(campaign.lifetime_budget) / 100 : null,
        objective: campaign.objective,
        createdAt: campaign.created_time,
        updatedAt: campaign.updated_time,
        metrics: null, // Will be populated if includeMetrics is true
      }));

      // Only fetch metrics if requested (lazy loading)
      if (includeMetrics) {
        const endDate = new Date().toISOString().split('T')[0];
        const startDate = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString().split('T')[0];

        // Batch fetch insights for all campaigns at once (much more efficient!)
        let insightsMap = {};
        try {
          const allInsights = await account.getInsights(
            ['spend', 'impressions', 'clicks', 'ctr', 'cpc'],
            {
              time_range: { since: startDate, until: endDate },
              level: 'campaign',
              time_increment: 'all_days',
            }
          );

          // Group insights by campaign ID
          allInsights.forEach(insight => {
            const campaignId = insight.campaign_id;
            if (!insightsMap[campaignId]) {
              insightsMap[campaignId] = [];
            }
            insightsMap[campaignId].push(insight);
          });
        } catch (error) {
          logger.warn({ data: error.message }, 'Could not fetch batch insights (will show campaigns without metrics):');
          // Continue without insights - campaigns will show without metrics
        }

        // Add metrics to campaigns
        campaignsWithMetrics = campaignsWithMetrics.map((campaign) => {
          const campaignInsights = insightsMap[campaign.id] || [];
          
          const totals = campaignInsights.reduce((acc, insight) => ({
            spend: acc.spend + parseFloat(insight.spend || 0),
            impressions: acc.impressions + parseInt(insight.impressions || 0),
            clicks: acc.clicks + parseInt(insight.clicks || 0),
          }), { spend: 0, impressions: 0, clicks: 0 });

          return {
            ...campaign,
            metrics: campaignInsights.length > 0 ? {
              spend: totals.spend,
              impressions: totals.impressions,
              clicks: totals.clicks,
              ctr: totals.impressions > 0 ? (totals.clicks / totals.impressions) * 100 : 0,
              cpc: totals.clicks > 0 ? totals.spend / totals.clicks : 0,
            } : null,
          };
        });
      }

      // Cache the results
      if (useCache) {
        this._setCache(cacheKey, campaignsWithMetrics);
      }

      return campaignsWithMetrics;
    } catch (error) {
      logger.error({ err: error }, 'Error fetching Meta campaigns list:');
      
      // Check for expired token error
      if (this._isExpiredTokenError(error)) {
        const errorMsg = error.response?.error_user_msg || error.message || 'Access token has expired';
        throw new Error(`Meta access token expired: ${errorMsg}. Please generate a new long-lived access token or use a System User token (never expires).`);
      }
      
      throw error;
    }
  }

  /**
   * Fetch metrics for campaigns (lazy loading)
   * @param {Array<string>} campaignIds - Optional array of campaign IDs to fetch metrics for. If not provided, fetches for all campaigns.
   * @returns {Promise<Object>} Map of campaignId -> metrics object
   */
  async getCampaignsMetrics(campaignIds = null) {
    if (!this.enabled) {
      logger.info('[STUB] Meta Ads getCampaignsMetrics — returning mock data');
      return {
        '2001': { spend: 256.80, impressions: 12450, clicks: 342, ctr: 2.75, cpc: 0.75 },
        '2002': { spend: 178.40, impressions: 8720, clicks: 215, ctr: 2.47, cpc: 0.83 },
        '2003': { spend: 92.10, impressions: 3200, clicks: 145, ctr: 4.53, cpc: 0.64 },
      };
    }

    const cacheKey = `campaigns_metrics_${campaignIds ? campaignIds.join('_') : 'all'}`;

    // Check cache first
    const cached = this._getCache(cacheKey, this.METRICS_CACHE_TTL);
    if (cached) {
      logger.info('✅ Using cached campaign metrics');
      return cached;
    }

    try {
      const endDate = new Date().toISOString().split('T')[0];
      const startDate = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString().split('T')[0];

      const account = new AdAccount(this.adAccountId);
      
      // Build insights request
      const insightsParams = {
        time_range: { since: startDate, until: endDate },
        level: 'campaign',
        time_increment: 'all_days',
      };

      // If specific campaign IDs provided, filter by them
      if (campaignIds && campaignIds.length > 0) {
        insightsParams.filtering = [
          {
            field: 'campaign.id',
            operator: 'IN',
            value: campaignIds,
          },
        ];
      }

      const allInsights = await account.getInsights(
        ['spend', 'impressions', 'clicks', 'ctr', 'cpc'],
        insightsParams
      );

      // Group insights by campaign ID and calculate totals
      const metricsMap = {};
      allInsights.forEach(insight => {
        const campaignId = insight.campaign_id;
        if (!metricsMap[campaignId]) {
          metricsMap[campaignId] = {
            spend: 0,
            impressions: 0,
            clicks: 0,
          };
        }
        metricsMap[campaignId].spend += parseFloat(insight.spend || 0);
        metricsMap[campaignId].impressions += parseInt(insight.impressions || 0);
        metricsMap[campaignId].clicks += parseInt(insight.clicks || 0);
      });

      // Format metrics with calculated values
      const formattedMetrics = {};
      Object.keys(metricsMap).forEach(campaignId => {
        const totals = metricsMap[campaignId];
        formattedMetrics[campaignId] = {
          spend: totals.spend,
          impressions: totals.impressions,
          clicks: totals.clicks,
          ctr: totals.impressions > 0 ? (totals.clicks / totals.impressions) * 100 : 0,
          cpc: totals.clicks > 0 ? totals.spend / totals.clicks : 0,
        };
      });

      // Cache the results
      this._setCache(cacheKey, formattedMetrics);

      return formattedMetrics;
    } catch (error) {
      logger.error({ err: error }, 'Error fetching campaign metrics:');
      
      // Check for expired token error
      if (this._isExpiredTokenError(error)) {
        const errorMsg = error.response?.error_user_msg || error.message || 'Access token has expired';
        throw new Error(`Meta access token expired: ${errorMsg}. Please generate a new long-lived access token or use a System User token (never expires).`);
      }
      
      throw error;
    }
  }

  /**
   * Update campaign status (enable/disable)
   * @param {string} campaignId - Campaign ID
   * @param {string} status - 'ACTIVE' or 'PAUSED'
   * @returns {Promise<Object>} Updated campaign object
   */
  async updateCampaignStatus(campaignId, status) {
    if (!this.enabled) {
      logger.info(`[STUB] Meta Ads updateCampaignStatus: campaign ${campaignId} → ${status}`);
      return { id: campaignId, name: 'Stub Campaign', status, effectiveStatus: status };
    }

    if (!['ACTIVE', 'PAUSED'].includes(status)) {
      throw new Error('Status must be ACTIVE or PAUSED');
    }

    try {
      const campaign = new Campaign(campaignId);
      await campaign.update([], {
        status: status,
      });

      // Fetch updated campaign to return
      const updatedCampaign = await campaign.read(['id', 'name', 'status', 'effective_status']);
      
      return {
        id: updatedCampaign.id,
        name: updatedCampaign.name,
        status: updatedCampaign.status,
        effectiveStatus: updatedCampaign.effective_status,
      };
    } catch (error) {
      logger.error({ err: error }, `Error updating Meta campaign ${campaignId} status:`);
      
      // Check for permissions error
      if (error.response?.error_subcode === 4841013 || 
          error.response?.error_user_title?.includes('permission') ||
          error.message?.includes('Permissions error')) {
        throw new Error(
          'Permission denied: Your Meta access token needs "ads_management" permission to update campaigns. ' +
          'Currently it only has "ads_read" permission. Please generate a new access token with ads_management permission.'
        );
      }
      
      // Check for other common errors
      if (error.response?.error_user_msg) {
        throw new Error(`Meta API Error: ${error.response.error_user_msg}`);
      }
      
      throw error;
    }
  }

  /**
   * Verify that all campaigns with activity are being captured in insights
   * This helps identify if campaigns are being filtered out
   */
  async verifyCampaignCoverage(startDate, endDate) {
    if (!this.enabled) {
      return { totalCampaigns: 3, campaignsWithInsights: 3, campaignsWithoutInsights: 0 };
    }

    try {
      const account = new AdAccount(this.adAccountId);
      
      // Fetch all campaigns
      const campaigns = await account.getCampaigns(['name', 'id', 'status', 'effective_status'], {
        limit: 1000,
      });
      
      logger.info(`📋 Found ${campaigns.length} total campaigns in account`);
      
      // Fetch campaign-level insights
      const insights = await account.getInsights(
        ['campaign_id', 'spend'],
        {
          time_range: { since: startDate, until: endDate },
          level: 'campaign',
          time_increment: 'all', // Aggregated total for the period
        }
      );
      
      const campaignsWithInsights = new Set(insights.map(i => i.campaign_id));
      const campaignsWithoutInsights = campaigns.filter(c => !campaignsWithInsights.has(c.id));
      
      if (campaignsWithoutInsights.length > 0) {
        logger.info(`⚠️  ${campaignsWithoutInsights.length} campaigns found but no insights returned:`);
        campaignsWithoutInsights.slice(0, 10).forEach(c => {
          logger.info(`   - ${c.name} (${c.id}) - Status: ${c.status}, Effective: ${c.effective_status}`);
        });
      }
      
      return {
        totalCampaigns: campaigns.length,
        campaignsWithInsights: campaignsWithInsights.size,
        campaignsWithoutInsights: campaignsWithoutInsights.length,
      };
    } catch (error) {
      logger.error({ err: error }, 'Error verifying campaign coverage:');
      throw error;
    }
  }

  /**
   * Hash user data for privacy (SHA256)
   * @param {string} value - Value to hash
   * @returns {string} Hashed value
   */
  _hashUserData(value) {
    if (!value) return null;
    return crypto.createHash('sha256').update(value.toLowerCase().trim()).digest('hex');
  }

  /**
   * Upload offline conversion event to Meta Conversions API
   * @param {Object} eventData - Event data object
   * @param {string} eventData.eventName - Event name (e.g., 'Lead', 'Purchase', 'CompleteRegistration')
   * @param {number} eventData.eventTime - Unix timestamp in seconds
   * @param {string} eventData.email - User email
   * @param {string} eventData.phone - User phone number
   * @param {string} eventData.firstName - User first name
   * @param {string} eventData.lastName - User last name
   * @param {string} eventData.city - User city
   * @param {string} eventData.state - User state
   * @param {string} eventData.zipCode - User zip code
   * @param {string} eventData.country - User country
   * @param {number} eventData.value - Event value (revenue)
   * @param {string} eventData.currency - Currency code (default: 'USD')
   * @param {string} eventData.eventId - Unique event ID (for deduplication)
   * @param {string} eventData.eventSourceUrl - Source URL
   * @param {Object} eventData.customData - Additional custom data
   * @returns {Promise<Object>} API response
   */
  async uploadOfflineEvent(eventData) {
    if (!this.enabled) {
      logger.info(`[STUB] Meta Ads uploadOfflineEvent: ${eventData.eventName}`);
      return { success: true, events_received: 1, messages: ['Stub mode — event not sent'] };
    }

    // Validate that we have at least email or phone (Meta requires customer information)
    const hasEmail = eventData.email && eventData.email.trim().length > 0;
    const hasPhone = eventData.phone && eventData.phone.trim().length > 0;
    
    if (!hasEmail && !hasPhone) {
      // Skip upload if no customer information - Meta will reject it anyway
      logger.info(`⚠️  Skipping Meta event upload for ${eventData.eventName || 'event'}: No email or phone provided (Meta requires customer information)`);
      return { skipped: true, reason: 'No customer information provided' };
    }

    try {
      // Create user data with hashed PII
      const userData = new UserData();
      
      // Set each field individually to avoid method chaining issues
      const hashedEmail = this._hashUserData(eventData.email);
      const hashedPhone = this._hashUserData(eventData.phone);
      const hashedFirstName = this._hashUserData(eventData.firstName);
      const hashedLastName = this._hashUserData(eventData.lastName);
      const hashedCity = this._hashUserData(eventData.city);
      const hashedState = this._hashUserData(eventData.state);
      const hashedZip = this._hashUserData(eventData.zipCode);
      
      if (hashedEmail) userData.setEmail(hashedEmail);
      if (hashedPhone) userData.setPhone(hashedPhone);
      if (hashedFirstName) userData.setFirstName(hashedFirstName);
      if (hashedLastName) userData.setLastName(hashedLastName);
      if (hashedCity) userData.setCity(hashedCity);
      if (hashedState) userData.setState(hashedState);
      if (hashedZip && userData.setPostalCode) {
        userData.setPostalCode(hashedZip);
      }
      // Try setCountryCode, fallback to setCountry if method doesn't exist
      if (userData.setCountryCode) {
        userData.setCountryCode(eventData.country || 'US');
      } else if (userData.setCountry) {
        userData.setCountry(eventData.country || 'US');
      }
      
      // Double-check that we have at least one customer identifier after hashing
      // (in case hashing failed or resulted in empty values)
      const hasValidCustomerData = hashedEmail || hashedPhone || hashedFirstName || hashedLastName;
      if (!hasValidCustomerData) {
        logger.info(`⚠️  Skipping Meta event upload for ${eventData.eventName || 'event'}: No valid customer data after hashing`);
        return { skipped: true, reason: 'No valid customer data after hashing' };
      }

      // Create custom data with value and currency
      const customData = new CustomData()
        .setValue(eventData.value || 0)
        .setCurrency(eventData.currency || 'USD');

      // Add any additional custom data (if method exists)
      if (eventData.customData && customData.setCustomProperty) {
        Object.entries(eventData.customData).forEach(([key, value]) => {
          customData.setCustomProperty(key, value);
        });
      }

      // Create server event
      const serverEvent = new ServerEvent()
        .setEventName(eventData.eventName || 'Lead')
        .setEventTime(eventData.eventTime || Math.floor(Date.now() / 1000))
        .setUserData(userData)
        .setCustomData(customData)
        .setEventSourceUrl(eventData.eventSourceUrl || 'https://join.acmeops.com')
        .setActionSource('website');

      // Set event ID for deduplication if provided
      if (eventData.eventId) {
        serverEvent.setEventId(eventData.eventId);
      }

      // Create event request
      const eventRequest = new EventRequest(process.env.META_ACCESS_TOKEN, this.pixelId)
        .setEvents([serverEvent]);

      // Execute the request
      const response = await eventRequest.execute();
      
      logger.info(`✅ Uploaded offline event: ${eventData.eventName} (${eventData.eventId || 'no ID'})`);
      
      return response;
    } catch (error) {
      // Check if this is the "insufficient customer information" error
      const isInsufficientDataError = error.response?.error_subcode === 2804050 || 
                                     error.message?.includes('customer information') ||
                                     error.response?.error_user_title?.includes('customer information');
      
      if (isInsufficientDataError) {
        // Log as warning instead of error - this is expected when customer data is missing
        logger.info(`⚠️  Skipped Meta event upload for ${eventData.eventName || 'event'}: Insufficient customer information (${error.response?.error_user_msg || error.message})`);
        return { skipped: true, reason: 'Insufficient customer information', error: error.message };
      }
      
      // For other errors, log as error
      logger.error({ err: error }, 'Error uploading offline event to Meta:');
      if (error.response) {
        logger.error({ err: error.response }, 'Meta API Error Response:');
      }
      throw error;
    }
  }

  /**
   * Upload multiple offline events in a batch
   * @param {Array<Object>} events - Array of event data objects
   * @returns {Promise<Object>} Results with success and error counts
   */
  async uploadOfflineEventsBatch(events) {
    if (!this.enabled) {
      logger.info(`[STUB] Meta Ads uploadOfflineEventsBatch: ${events?.length || 0} events`);
      return { success: events?.length || 0, errors: 0, total: events?.length || 0, results: [] };
    }

    if (!events || events.length === 0) {
      return { success: 0, errors: 0, results: [] };
    }

    const results = [];
    let successCount = 0;
    let errorCount = 0;

    // Meta recommends batching up to 50 events per request
    const batchSize = 50;
    for (let i = 0; i < events.length; i += batchSize) {
      const batch = events.slice(i, i + batchSize);
      
      try {
        // Filter out events without customer information before creating server events
        const validEvents = batch.filter(eventData => {
          const hasEmail = eventData.email && eventData.email.trim().length > 0;
          const hasPhone = eventData.phone && eventData.phone.trim().length > 0;
          return hasEmail || hasPhone;
        });
        
        // Track skipped events
        const skippedCount = batch.length - validEvents.length;
        if (skippedCount > 0) {
          logger.info(`⚠️  Skipping ${skippedCount} event(s) in batch: No customer information (email or phone)`);
          batch.forEach(eventData => {
            const hasEmail = eventData.email && eventData.email.trim().length > 0;
            const hasPhone = eventData.phone && eventData.phone.trim().length > 0;
            if (!hasEmail && !hasPhone) {
              results.push({ 
                eventId: eventData.eventId, 
                success: false, 
                skipped: true,
                reason: 'No customer information' 
              });
              errorCount++;
            }
          });
        }
        
        if (validEvents.length === 0) {
          // All events in batch were skipped
          continue;
        }
        
        // Create server events for the valid batch
        const serverEvents = validEvents
          .map(eventData => {
            const userData = new UserData();
            
            // Set each field individually to avoid method chaining issues
            const hashedEmail = this._hashUserData(eventData.email);
            const hashedPhone = this._hashUserData(eventData.phone);
            const hashedFirstName = this._hashUserData(eventData.firstName);
            const hashedLastName = this._hashUserData(eventData.lastName);
            const hashedCity = this._hashUserData(eventData.city);
            const hashedState = this._hashUserData(eventData.state);
            const hashedZip = this._hashUserData(eventData.zipCode);
            
            if (hashedEmail) userData.setEmail(hashedEmail);
            if (hashedPhone) userData.setPhone(hashedPhone);
            if (hashedFirstName) userData.setFirstName(hashedFirstName);
            if (hashedLastName) userData.setLastName(hashedLastName);
            if (hashedCity) userData.setCity(hashedCity);
            if (hashedState) userData.setState(hashedState);
            if (hashedZip && userData.setPostalCode) {
              userData.setPostalCode(hashedZip);
            }
            // Try setCountryCode, fallback to setCountry if method doesn't exist
            if (userData.setCountryCode) {
              userData.setCountryCode(eventData.country || 'US');
            } else if (userData.setCountry) {
              userData.setCountry(eventData.country || 'US');
            }
            
            // Validate that we have at least one customer identifier after hashing
            const hasValidCustomerData = hashedEmail || hashedPhone || hashedFirstName || hashedLastName;
            if (!hasValidCustomerData) {
              return null; // Will be filtered out
            }

            const customData = new CustomData()
              .setValue(eventData.value || 0)
              .setCurrency(eventData.currency || 'USD');

            // Add any additional custom data (if method exists)
            if (eventData.customData && customData.setCustomProperty) {
              Object.entries(eventData.customData).forEach(([key, value]) => {
                customData.setCustomProperty(key, value);
              });
            }

            const serverEvent = new ServerEvent()
              .setEventName(eventData.eventName || 'Lead')
              .setEventTime(eventData.eventTime || Math.floor(Date.now() / 1000))
              .setUserData(userData)
              .setCustomData(customData)
              .setEventSourceUrl(eventData.eventSourceUrl || 'https://join.acmeops.com')
              .setActionSource('website');

            if (eventData.eventId) {
              serverEvent.setEventId(eventData.eventId);
            }

            return serverEvent;
          })
          .filter(event => event !== null); // Remove null events (those without valid customer data)
        
        if (serverEvents.length === 0) {
          // All events were filtered out after hashing validation
          logger.info(`⚠️  Skipping batch: No events with valid customer data after hashing`);
          continue;
        }

        // Create and execute batch request
        const eventRequest = new EventRequest(process.env.META_ACCESS_TOKEN, this.pixelId)
          .setEvents(serverEvents);

        const response = await eventRequest.execute();
        
        successCount += serverEvents.length;
        results.push({
          batchIndex: Math.floor(i / batchSize),
          eventsProcessed: serverEvents.length,
          skipped: skippedCount,
          success: true,
          response: response
        });

        logger.info(`✅ Uploaded batch ${Math.floor(i / batchSize) + 1}: ${serverEvents.length} events${skippedCount > 0 ? ` (${skippedCount} skipped)` : ''}`);
      } catch (error) {
        // Check if this is the "insufficient customer information" error
        const isInsufficientDataError = error.response?.error_subcode === 2804050 || 
                                       error.message?.includes('customer information') ||
                                       error.response?.error_user_title?.includes('customer information');
        
        if (isInsufficientDataError) {
          // Log as warning and mark events as skipped
          logger.info(`⚠️  Skipped batch ${Math.floor(i / batchSize) + 1}: Insufficient customer information (${error.response?.error_user_msg || error.message})`);
          batch.forEach(eventData => {
            results.push({ 
              eventId: eventData.eventId, 
              success: false, 
              skipped: true,
              reason: 'Insufficient customer information' 
            });
            errorCount++;
          });
        } else {
          // For other errors, count as errors
          errorCount += batch.length;
          const errorDetails = {
            message: error.message,
            response: error.response,
            stack: error.stack
          };
          if (error.response && error.response._body) {
            errorDetails.body = error.response._body;
          }
          results.push({
            batchIndex: Math.floor(i / batchSize),
            eventsProcessed: batch.length,
            success: false,
            error: error.message,
            errorDetails: errorDetails
          });
          logger.error({ error: error.message }, `❌ Error uploading batch ${Math.floor(i / batchSize) + 1}:`);
          if (error.response) {
            logger.error({ err: JSON.stringify(error.response, null, 2) }, `   Response:`);
          }
          if (error.response && error.response._body) {
            logger.error({ err: error.response._body }, `   Response body:`);
          }
        }
      }
    }

    return {
      success: successCount,
      errors: errorCount,
      total: events.length,
      results: results
    };
  }

  /**
   * Get ad sets for a campaign
   * @param {string} campaignId - Campaign ID
   * @returns {Promise<Array>} Array of ad sets
   */
  async getAdSets(campaignId) {
    if (!this.enabled) {
      return [
        { id: '3001', name: 'Metro Area Parents 25-45', status: 'ACTIVE', effectiveStatus: 'ACTIVE', dailyBudget: 42.50, lifetimeBudget: null, startTime: '2025-01-15T10:00:00Z', endTime: null, billingEvent: 'IMPRESSIONS', optimizationGoal: 'REACH' },
        { id: '3002', name: 'Family Interest Audiences', status: 'ACTIVE', effectiveStatus: 'ACTIVE', dailyBudget: 30.00, lifetimeBudget: null, startTime: '2025-02-01T09:00:00Z', endTime: null, billingEvent: 'IMPRESSIONS', optimizationGoal: 'LINK_CLICKS' },
      ];
    }

    try {
      const campaign = new Campaign(campaignId);
      const adSets = await campaign.getAdSets([
        'id',
        'name',
        'status',
        'effective_status',
        'daily_budget',
        'lifetime_budget',
        'start_time',
        'end_time',
        'billing_event',
        'optimization_goal',
      ], {
        limit: 1000,
      });

      return adSets.map(adSet => ({
        id: adSet.id,
        name: adSet.name,
        status: adSet.status,
        effectiveStatus: adSet.effective_status,
        dailyBudget: adSet.daily_budget ? parseFloat(adSet.daily_budget) / 100 : null,
        lifetimeBudget: adSet.lifetime_budget ? parseFloat(adSet.lifetime_budget) / 100 : null,
        startTime: adSet.start_time,
        endTime: adSet.end_time,
        billingEvent: adSet.billing_event,
        optimizationGoal: adSet.optimization_goal,
      }));
    } catch (error) {
      logger.error({ err: error }, `Error fetching ad sets for campaign ${campaignId}:`);
      
      // Check for expired token error
      if (this._isExpiredTokenError(error)) {
        const errorMsg = error.response?.error_user_msg || error.message || 'Access token has expired';
        throw new Error(`Meta access token expired: ${errorMsg}. Please generate a new long-lived access token or use a System User token (never expires).`);
      }
      
      throw error;
    }
  }

  /**
   * Update ad set status
   * @param {string} adSetId - Ad Set ID
   * @param {string} status - 'ACTIVE' or 'PAUSED'
   * @returns {Promise<Object>} Updated ad set
   */
  async updateAdSetStatus(adSetId, status) {
    if (!this.enabled) {
      return { id: adSetId, name: 'Stub Ad Set', status, effectiveStatus: status };
    }

    if (!['ACTIVE', 'PAUSED'].includes(status)) {
      throw new Error('Status must be ACTIVE or PAUSED');
    }

    try {
      const adSet = new AdSet(adSetId);
      await adSet.update([], { status: status });

      const updatedAdSet = await adSet.read(['id', 'name', 'status', 'effective_status']);
      return {
        id: updatedAdSet.id,
        name: updatedAdSet.name,
        status: updatedAdSet.status,
        effectiveStatus: updatedAdSet.effective_status,
      };
    } catch (error) {
      logger.error({ err: error }, `Error updating ad set ${adSetId} status:`);
      if (error.response?.error_subcode === 4841013 || 
          error.response?.error_user_title?.includes('permission')) {
        throw new Error('Permission denied: Your Meta access token needs "ads_management" permission.');
      }
      throw error;
    }
  }

  /**
   * Get ads for an ad set
   * @param {string} adSetId - Ad Set ID
   * @returns {Promise<Array>} Array of ads
   */
  async getAds(adSetId) {
    if (!this.enabled) {
      return [
        { id: '4001', name: 'Ad Creative A - Carousel', status: 'ACTIVE', effectiveStatus: 'ACTIVE', creativeId: 'cr-001' },
        { id: '4002', name: 'Ad Creative B - Video', status: 'ACTIVE', effectiveStatus: 'ACTIVE', creativeId: 'cr-002' },
      ];
    }

    try {
      const adSet = new AdSet(adSetId);
      const ads = await adSet.getAds([
        'id',
        'name',
        'status',
        'effective_status',
        'creative',
      ], {
        limit: 1000,
      });

      return ads.map(ad => ({
        id: ad.id,
        name: ad.name,
        status: ad.status,
        effectiveStatus: ad.effective_status,
        creativeId: ad.creative?.id || null,
      }));
    } catch (error) {
      logger.error({ err: error }, `Error fetching ads for ad set ${adSetId}:`);
      
      // Check for expired token error
      if (this._isExpiredTokenError(error)) {
        const errorMsg = error.response?.error_user_msg || error.message || 'Access token has expired';
        throw new Error(`Meta access token expired: ${errorMsg}. Please generate a new long-lived access token or use a System User token (never expires).`);
      }
      
      throw error;
    }
  }

  /**
   * Update ad status
   * @param {string} adId - Ad ID
   * @param {string} status - 'ACTIVE' or 'PAUSED'
   * @returns {Promise<Object>} Updated ad
   */
  async updateAdStatus(adId, status) {
    if (!this.enabled) {
      return { id: adId, name: 'Stub Ad', status, effectiveStatus: status };
    }

    if (!['ACTIVE', 'PAUSED'].includes(status)) {
      throw new Error('Status must be ACTIVE or PAUSED');
    }

    try {
      const ad = new Ad(adId);
      await ad.update([], { status: status });

      const updatedAd = await ad.read(['id', 'name', 'status', 'effective_status']);
      return {
        id: updatedAd.id,
        name: updatedAd.name,
        status: updatedAd.status,
        effectiveStatus: updatedAd.effective_status,
      };
    } catch (error) {
      logger.error({ err: error }, `Error updating ad ${adId} status:`);
      if (error.response?.error_subcode === 4841013 || 
          error.response?.error_user_title?.includes('permission')) {
        throw new Error('Permission denied: Your Meta access token needs "ads_management" permission.');
      }
      throw error;
    }
  }

  /**
   * Update campaign budget
   * @param {string} campaignId - Campaign ID
   * @param {Object} budgetData - Budget data { dailyBudget?: number, lifetimeBudget?: number }
   * @returns {Promise<Object>} Updated campaign
   */
  async updateCampaignBudget(campaignId, budgetData) {
    if (!this.enabled) {
      return { id: campaignId, name: 'Stub Campaign', dailyBudget: budgetData.dailyBudget || null, lifetimeBudget: budgetData.lifetimeBudget || null };
    }

    try {
      const campaign = new Campaign(campaignId);
      const updateParams = {};

      if (budgetData.dailyBudget !== undefined) {
        // Convert dollars to cents
        updateParams.daily_budget = Math.round(budgetData.dailyBudget * 100);
      }

      if (budgetData.lifetimeBudget !== undefined) {
        // Convert dollars to cents
        updateParams.lifetime_budget = Math.round(budgetData.lifetimeBudget * 100);
      }

      if (Object.keys(updateParams).length === 0) {
        throw new Error('No budget data provided');
      }

      await campaign.update([], updateParams);

      const updatedCampaign = await campaign.read([
        'id',
        'name',
        'daily_budget',
        'lifetime_budget',
      ]);

      return {
        id: updatedCampaign.id,
        name: updatedCampaign.name,
        dailyBudget: updatedCampaign.daily_budget ? parseFloat(updatedCampaign.daily_budget) / 100 : null,
        lifetimeBudget: updatedCampaign.lifetime_budget ? parseFloat(updatedCampaign.lifetime_budget) / 100 : null,
      };
    } catch (error) {
      logger.error({ err: error }, `Error updating campaign ${campaignId} budget:`);
      if (error.response?.error_subcode === 4841013 || 
          error.response?.error_user_title?.includes('permission')) {
        throw new Error('Permission denied: Your Meta access token needs "ads_management" permission.');
      }
      throw error;
    }
  }

  /**
   * Update campaign schedule (start/end dates)
   * @param {string} campaignId - Campaign ID
   * @param {Object} scheduleData - Schedule data { startTime?: string, endTime?: string }
   * @returns {Promise<Object>} Updated campaign
   */
  async updateCampaignSchedule(campaignId, scheduleData) {
    if (!this.enabled) {
      return { id: campaignId, name: 'Stub Campaign', startTime: scheduleData.startTime || null, endTime: scheduleData.endTime || null };
    }

    try {
      const campaign = new Campaign(campaignId);
      const updateParams = {};

      if (scheduleData.startTime) {
        updateParams.start_time = scheduleData.startTime;
      }

      if (scheduleData.endTime) {
        updateParams.end_time = scheduleData.endTime;
      }

      if (Object.keys(updateParams).length === 0) {
        throw new Error('No schedule data provided');
      }

      await campaign.update([], updateParams);

      const updatedCampaign = await campaign.read([
        'id',
        'name',
        'start_time',
        'end_time',
      ]);

      return {
        id: updatedCampaign.id,
        name: updatedCampaign.name,
        startTime: updatedCampaign.start_time,
        endTime: updatedCampaign.end_time,
      };
    } catch (error) {
      logger.error({ err: error }, `Error updating campaign ${campaignId} schedule:`);
      if (error.response?.error_subcode === 4841013 || 
          error.response?.error_user_title?.includes('permission')) {
        throw new Error('Permission denied: Your Meta access token needs "ads_management" permission.');
      }
      throw error;
    }
  }

  /**
   * Duplicate/clone a campaign
   * @param {string} campaignId - Campaign ID to clone
   * @param {string} newName - Name for the new campaign
   * @param {Object} options - Clone options { status?: 'PAUSED' | 'ACTIVE' }
   * @returns {Promise<Object>} New campaign object
   */
  async duplicateCampaign(campaignId, newName, options = {}) {
    if (!this.enabled) {
      return { id: 'stub-new-campaign', name: newName, status: options.status || 'PAUSED' };
    }

    try {
      const account = new AdAccount(this.adAccountId);
      const campaign = new Campaign(campaignId);

      // Read the original campaign
      const originalCampaign = await campaign.read([
        'name',
        'objective',
        'status',
        'daily_budget',
        'lifetime_budget',
        'start_time',
        'end_time',
      ]);

      // Create new campaign with same settings
      const newCampaign = await account.createCampaign([], {
        name: newName,
        objective: originalCampaign.objective,
        status: options.status || 'PAUSED', // Default to paused for safety
        daily_budget: originalCampaign.daily_budget,
        lifetime_budget: originalCampaign.lifetime_budget,
        start_time: originalCampaign.start_time,
        end_time: originalCampaign.end_time,
      });

      return {
        id: newCampaign.id,
        name: newCampaign.name,
        status: newCampaign.status,
      };
    } catch (error) {
      logger.error({ err: error }, `Error duplicating campaign ${campaignId}:`);
      if (error.response?.error_subcode === 4841013 ||
          error.response?.error_user_title?.includes('permission')) {
        throw new Error('Permission denied: Your Meta access token needs "ads_management" permission.');
      }
      throw error;
    }
  }

  /**
   * Create a new campaign
   * @param {Object} campaignData - Campaign configuration
   * @param {string} campaignData.name - Campaign name
   * @param {string} campaignData.objective - Campaign objective (e.g., 'OUTCOME_TRAFFIC')
   * @param {string} campaignData.status - Initial status ('ACTIVE' or 'PAUSED')
   * @param {number} campaignData.dailyBudget - Daily budget in dollars (optional)
   * @param {number} campaignData.lifetimeBudget - Lifetime budget in dollars (optional)
   * @param {string} campaignData.startTime - Start time ISO string (optional)
   * @param {string} campaignData.endTime - End time ISO string (optional)
   * @returns {Promise<Object>} Created campaign
   */
  async createCampaign(campaignData) {
    if (!this.enabled) {
      return { id: 'stub-campaign-' + Date.now(), name: campaignData.name, status: campaignData.status || 'PAUSED', objective: campaignData.objective };
    }

    const { name, objective, status = 'PAUSED', dailyBudget, lifetimeBudget, startTime, endTime } = campaignData;

    if (!name || !objective) {
      throw new Error('Campaign name and objective are required');
    }

    try {
      const account = new AdAccount(this.adAccountId);

      const params = {
        name,
        objective,
        status,
        special_ad_categories: [], // Required field - empty for non-special ads
      };

      // Set budget (convert dollars to cents)
      if (dailyBudget) {
        params.daily_budget = Math.round(dailyBudget * 100);
      }
      if (lifetimeBudget) {
        params.lifetime_budget = Math.round(lifetimeBudget * 100);
      }

      // Set schedule
      if (startTime) {
        params.start_time = startTime;
      }
      if (endTime) {
        params.end_time = endTime;
      }

      const campaign = await account.createCampaign([], params);

      // Clear cache since we created a new campaign
      this.clearCache();

      logger.info(`✅ Created Meta campaign: ${name} (${campaign.id})`);

      return {
        id: campaign.id,
        name: campaign.name || name,
        status: campaign.status || status,
        objective: campaign.objective || objective,
      };
    } catch (error) {
      logger.error({ err: error }, 'Error creating Meta campaign:');
      if (error.response?.error_subcode === 4841013 ||
          error.response?.error_user_title?.includes('permission')) {
        throw new Error('Permission denied: Your Meta access token needs "ads_management" permission.');
      }
      if (error.response?.error_user_msg) {
        throw new Error(`Meta API Error: ${error.response.error_user_msg}`);
      }
      throw error;
    }
  }

  /**
   * Create an ad set within a campaign
   * @param {Object} adSetData - Ad set configuration
   * @param {string} adSetData.campaignId - Parent campaign ID
   * @param {string} adSetData.name - Ad set name
   * @param {string} adSetData.status - Initial status
   * @param {number} adSetData.dailyBudget - Daily budget in dollars (optional)
   * @param {number} adSetData.lifetimeBudget - Lifetime budget in dollars (optional)
   * @param {string} adSetData.startTime - Start time
   * @param {string} adSetData.endTime - End time
   * @param {Object} adSetData.targeting - Targeting configuration
   * @param {string} adSetData.optimizationGoal - Optimization goal
   * @param {string} adSetData.billingEvent - Billing event (e.g., 'IMPRESSIONS')
   * @returns {Promise<Object>} Created ad set
   */
  async createAdSet(adSetData) {
    if (!this.enabled) {
      return { id: 'stub-adset-' + Date.now(), name: adSetData.name, status: adSetData.status || 'PAUSED', campaignId: adSetData.campaignId };
    }

    const {
      campaignId,
      name,
      status = 'PAUSED',
      dailyBudget,
      lifetimeBudget,
      startTime,
      endTime,
      targeting = {},
      optimizationGoal = 'LINK_CLICKS',
      billingEvent = 'IMPRESSIONS',
    } = adSetData;

    if (!campaignId || !name) {
      throw new Error('Campaign ID and ad set name are required');
    }

    try {
      const account = new AdAccount(this.adAccountId);

      // Build targeting spec
      const targetingSpec = {
        geo_locations: {
          countries: targeting.countries || ['US'],
        },
      };

      // Add age targeting if specified
      if (targeting.ageMin || targeting.ageMax) {
        targetingSpec.age_min = targeting.ageMin || 18;
        targetingSpec.age_max = targeting.ageMax || 65;
      }

      // Add gender targeting if specified
      if (targeting.genders && targeting.genders.length > 0) {
        // Meta uses: 1 = male, 2 = female
        targetingSpec.genders = targeting.genders.map(g => {
          if (g === 'male') return 1;
          if (g === 'female') return 2;
          return null;
        }).filter(g => g !== null);
      }

      // Add interest targeting if specified
      if (targeting.interests && targeting.interests.length > 0) {
        targetingSpec.interests = targeting.interests.map(i => ({
          id: i.id,
          name: i.name,
        }));
      }

      // Add flexible spec for detailed targeting
      if (targeting.detailedTargeting && targeting.detailedTargeting.length > 0) {
        targetingSpec.flexible_spec = [{
          interests: targeting.detailedTargeting,
        }];
      }

      const params = {
        name,
        campaign_id: campaignId,
        status,
        billing_event: billingEvent,
        optimization_goal: optimizationGoal,
        targeting: targetingSpec,
      };

      // Set budget (convert dollars to cents)
      if (dailyBudget) {
        params.daily_budget = Math.round(dailyBudget * 100);
      }
      if (lifetimeBudget) {
        params.lifetime_budget = Math.round(lifetimeBudget * 100);
      }

      // Set schedule
      if (startTime) {
        params.start_time = startTime;
      }
      if (endTime) {
        params.end_time = endTime;
      }

      const adSet = await account.createAdSet([], params);

      logger.info(`✅ Created Meta ad set: ${name} (${adSet.id})`);

      return {
        id: adSet.id,
        name: adSet.name || name,
        status: adSet.status || status,
        campaignId,
      };
    } catch (error) {
      logger.error({ err: error }, 'Error creating Meta ad set:');
      if (error.response?.error_subcode === 4841013 ||
          error.response?.error_user_title?.includes('permission')) {
        throw new Error('Permission denied: Your Meta access token needs "ads_management" permission.');
      }
      if (error.response?.error_user_msg) {
        throw new Error(`Meta API Error: ${error.response.error_user_msg}`);
      }
      throw error;
    }
  }

  /**
   * Create an ad within an ad set
   * @param {Object} adData - Ad configuration
   * @param {string} adData.adSetId - Parent ad set ID
   * @param {string} adData.name - Ad name
   * @param {string} adData.status - Initial status
   * @param {Object} adData.creative - Creative configuration
   * @returns {Promise<Object>} Created ad
   */
  async createAd(adData) {
    if (!this.enabled) {
      return { id: 'stub-ad-' + Date.now(), name: adData.name, status: adData.status || 'PAUSED', adSetId: adData.adSetId, creativeId: 'stub-creative' };
    }

    const { adSetId, name, status = 'PAUSED', creative } = adData;

    if (!adSetId || !name || !creative) {
      throw new Error('Ad set ID, name, and creative are required');
    }

    try {
      const account = new AdAccount(this.adAccountId);

      // First create the ad creative
      const creativeParams = {
        name: `${name} Creative`,
        object_story_spec: {
          page_id: process.env.META_PAGE_ID,
          link_data: {
            link: creative.linkUrl || 'https://join.acmeops.com',
            message: creative.primaryText || '',
            name: creative.headline || '',
            description: creative.description || '',
            call_to_action: {
              type: this._mapCallToAction(creative.callToAction),
              value: {
                link: creative.linkUrl || 'https://join.acmeops.com',
              },
            },
          },
        },
      };

      // Add image if provided
      if (creative.imageUrl) {
        creativeParams.object_story_spec.link_data.picture = creative.imageUrl;
      }

      const adCreative = await account.createAdCreative([], creativeParams);

      // Now create the ad using the creative
      const adParams = {
        name,
        adset_id: adSetId,
        status,
        creative: { creative_id: adCreative.id },
      };

      const ad = await account.createAd([], adParams);

      logger.info(`✅ Created Meta ad: ${name} (${ad.id})`);

      return {
        id: ad.id,
        name: ad.name || name,
        status: ad.status || status,
        adSetId,
        creativeId: adCreative.id,
      };
    } catch (error) {
      logger.error({ err: error }, 'Error creating Meta ad:');
      if (error.response?.error_subcode === 4841013 ||
          error.response?.error_user_title?.includes('permission')) {
        throw new Error('Permission denied: Your Meta access token needs "ads_management" permission.');
      }
      if (error.response?.error_user_msg) {
        throw new Error(`Meta API Error: ${error.response.error_user_msg}`);
      }
      throw error;
    }
  }

  /**
   * Map call-to-action string to Meta API format
   */
  _mapCallToAction(cta) {
    const mapping = {
      'Learn More': 'LEARN_MORE',
      'Sign Up': 'SIGN_UP',
      'Book Now': 'BOOK_TRAVEL',
      'Get Started': 'GET_QUOTE',
      'Download': 'DOWNLOAD',
      'Shop Now': 'SHOP_NOW',
      'Contact Us': 'CONTACT_US',
    };
    return mapping[cta] || 'LEARN_MORE';
  }
}

module.exports = MetaAdsService;

