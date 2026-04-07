// services/google-ads-api.js
/**
 * Google Ads API Integration Service
 * Fetches ad performance data from Google Ads API
 * 
 * Required Environment Variables:
 * - GOOGLE_ADS_CLIENT_ID: OAuth2 Client ID
 * - GOOGLE_ADS_CLIENT_SECRET: OAuth2 Client Secret
 * - GOOGLE_ADS_REFRESH_TOKEN: OAuth2 Refresh Token
 * - GOOGLE_ADS_DEVELOPER_TOKEN: Google Ads API Developer Token
 * - GOOGLE_ADS_CUSTOMER_ID: Google Ads Customer ID (format: 1234567890)
 * 
 * Optional Environment Variables:
 * - GOOGLE_ADS_LOGIN_CUSTOMER_ID: MCC (Manager) account ID if accessing sub-accounts (format: 1234567890)
 */

const { GoogleAdsApi, Customer } = require('google-ads-api');
const { DateTime } = require('luxon');
const { logger } = require('../utils/logger');

class GoogleAdsService {
  constructor() {
    const clientId = process.env.GOOGLE_ADS_CLIENT_ID;
    const clientSecret = process.env.GOOGLE_ADS_CLIENT_SECRET;
    const refreshToken = process.env.GOOGLE_ADS_REFRESH_TOKEN;
    const developerToken = process.env.GOOGLE_ADS_DEVELOPER_TOKEN;
    const customerId = process.env.GOOGLE_ADS_CUSTOMER_ID;

    if (!clientId || !clientSecret || !refreshToken || !developerToken || !customerId) {
      logger.warn('Google Ads API credentials not configured. Set GOOGLE_ADS_CLIENT_ID, GOOGLE_ADS_CLIENT_SECRET, GOOGLE_ADS_REFRESH_TOKEN, GOOGLE_ADS_DEVELOPER_TOKEN, and GOOGLE_ADS_CUSTOMER_ID environment variables.');
      this.enabled = false;
      return;
    }

    try {
      // Validate customer ID format (should be numeric, no dashes)
      const cleanCustomerId = customerId.toString().replace(/-/g, '');
      if (!/^\d+$/.test(cleanCustomerId)) {
        throw new Error(`Invalid customer ID format: ${customerId}. Should be numeric (e.g., 1234567890)`);
      }

      logger.info('Initializing Google Ads API with:');
      logger.info(`- Customer ID: ${cleanCustomerId}`);
      logger.info(`- Client ID: ${clientId.substring(0, 20)}...`);
      logger.info(`- Developer Token: ${developerToken.substring(0, 10)}...`);
      logger.info(`- Refresh Token: ${refreshToken.substring(0, 20)}...`);

      // Initialize Google Ads API client
      // Note: google-ads-api v21 uses API version v21 by default
      // Explicitly set version to ensure compatibility
      this.client = new GoogleAdsApi({
        client_id: clientId,
        client_secret: clientSecret,
        developer_token: developerToken,
        version: 'v21' // Updated to match package version
      });

      // For MCC accounts, we may need to specify login_customer_id
      // Check if we have a login customer ID (MCC account ID) in env
      const loginCustomerId = process.env.GOOGLE_ADS_LOGIN_CUSTOMER_ID;
      
      const customerConfig = {
        customer_id: cleanCustomerId,
        refresh_token: refreshToken,
      };
      
      // If login_customer_id is provided (for MCC accounts), add it
      if (loginCustomerId) {
        const cleanLoginCustomerId = loginCustomerId.toString().replace(/-/g, '');
        if (/^\d+$/.test(cleanLoginCustomerId)) {
          customerConfig.login_customer_id = cleanLoginCustomerId;
          logger.info(`Using MCC account (login_customer_id: ${cleanLoginCustomerId})`);
        }
      }
      
      this._customer = this.client.Customer(customerConfig);

      // Verify customer object is properly initialized
      // Check for both report and query methods
      if (!this._customer || (typeof this._customer.report !== 'function' && typeof this._customer.query !== 'function')) {
        throw new Error('Customer object not properly initialized. Check your credentials and API version.');
      }

      // Store customer ID separately since the Customer object doesn't expose it
      this.customerId = cleanCustomerId;
      
      // Expose customer for testing (read-only access via getter)
      Object.defineProperty(this, 'customer', {
        get: () => this._customer,
        enumerable: false,
        configurable: false
      });

      this.enabled = true;
      logger.info('Google Ads API initialized successfully');
    } catch (error) {
      logger.error({ err: error }, 'Error initializing Google Ads API:');
      logger.error({ error: error.message }, 'Error details:');
      this.enabled = false;
    }
  }

  /**
   * Check if the service is configured and ready to use
   * @returns {boolean} True if the API is configured
   */
  isConfigured() {
    return this.enabled === true;
  }

  /**
   * Map Google Ads campaign status enum to string
   * Google Ads API returns status as numeric enum values
   * @param {number|string} status - Raw status from API
   * @returns {string} Human-readable status string
   */
  _mapCampaignStatus(status) {
    // Google Ads CampaignStatus enum values:
    // 0 = UNSPECIFIED, 1 = UNKNOWN, 2 = ENABLED, 3 = PAUSED, 4 = REMOVED
    const statusMap = {
      0: 'UNSPECIFIED',
      1: 'UNKNOWN',
      2: 'ENABLED',
      3: 'PAUSED',
      4: 'REMOVED',
      'UNSPECIFIED': 'UNSPECIFIED',
      'UNKNOWN': 'UNKNOWN',
      'ENABLED': 'ENABLED',
      'PAUSED': 'PAUSED',
      'REMOVED': 'REMOVED',
    };
    return statusMap[status] || String(status).toUpperCase();
  }

  /**
   * Fetch ad performance metrics for a date range
   * @param {string} startDate - ISO date string (YYYY-MM-DD)
   * @param {string} endDate - ISO date string (YYYY-MM-DD)
   * @returns {Promise<Array>} Array of ad metrics with campaign details
   */
  async fetchAdMetrics(startDate, endDate) {
    if (!this.enabled) {
      logger.info('[STUB] Google Ads fetchAdMetrics — returning mock data');
      return [
        { platform: 'google', accountId: 'stub-account', campaignId: '1001', campaignName: 'Brand Awareness - Search', utmCampaign: 'brand_awareness', date: startDate, impressions: 4520, clicks: 187, spend: 312.45, ctr: 4.14, cpc: 1.67, conversions: 12, conversionRate: 6.42 },
        { platform: 'google', accountId: 'stub-account', campaignId: '1002', campaignName: 'Local Services - Display', utmCampaign: 'local_services', date: startDate, impressions: 8930, clicks: 245, spend: 189.20, ctr: 2.74, cpc: 0.77, conversions: 8, conversionRate: 3.27 },
        { platform: 'google', accountId: 'stub-account', campaignId: '1003', campaignName: 'Retargeting - Previous Visitors', utmCampaign: 'retargeting', date: startDate, impressions: 2150, clicks: 98, spend: 74.30, ctr: 4.56, cpc: 0.76, conversions: 5, conversionRate: 5.10 },
      ];
    }

    logger.info(`Fetching Google Ads metrics from ${startDate} to ${endDate} for customer ${this.customerId}`);
    
    try {
      const startDateStr = DateTime.fromISO(startDate).toFormat('yyyy-MM-dd');
      const endDateStr = DateTime.fromISO(endDate).toFormat('yyyy-MM-dd');

      logger.info('Executing Google Ads query...');
      // Try using the query method with GAQL (Google Ads Query Language)
      // This is more reliable than the report method for some API versions
      const query = `
        SELECT
          campaign.id,
          campaign.name,
          campaign.url_custom_parameters,
          segments.date,
          metrics.impressions,
          metrics.clicks,
          metrics.cost_micros,
          metrics.ctr,
          metrics.average_cpc,
          metrics.conversions
        FROM campaign
        WHERE segments.date BETWEEN '${startDateStr}' AND '${endDateStr}'
          AND campaign.status != 'REMOVED'
        ORDER BY segments.date DESC, campaign.id
      `;
      
      logger.info({ data: query.substring(0, 200) + '...' }, 'GAQL Query:');
      const results = await this._customer.query(query);
      
      logger.info(`Received ${results.length} rows from Google Ads API`);

      // Transform data to match our schema
      // The report method returns results in a structured format
      const transformedResults = [];
      for (const row of results) {
        const campaignId = row.campaign?.id?.toString() || '';
        const campaignName = row.campaign?.name || '';
        const urlCustomParams = row.campaign?.url_custom_parameters;
        const date = row.segments?.date || '';
        const metrics = {
          impressions: row.metrics?.impressions || 0,
          clicks: row.metrics?.clicks || 0,
          cost_micros: row.metrics?.cost_micros || 0,
          ctr: row.metrics?.ctr || 0,
          average_cpc: row.metrics?.average_cpc || 0,
          conversions: row.metrics?.conversions || 0,
          conversion_rate: row.metrics?.conversion_rate || 0
        };

        // Extract UTM campaign from custom parameters
        let utmCampaign = campaignName;
        if (urlCustomParams && Array.isArray(urlCustomParams)) {
          const utmParam = urlCustomParams.find(
            param => param.key?.toLowerCase() === 'utm_campaign'
          );
          if (utmParam && utmParam.value) {
            utmCampaign = utmParam.value.string_value || utmParam.value.toString() || utmCampaign;
          }
        }

        transformedResults.push({
          platform: 'google',
          accountId: this.customerId,
          campaignId: campaignId?.toString() || '',
          campaignName: campaignName,
          utmCampaign: utmCampaign,
          date: date,
          impressions: parseInt(metrics.impressions || 0),
          clicks: parseInt(metrics.clicks || 0),
          spend: parseFloat((metrics.cost_micros || 0) / 1000000), // Convert micros to dollars
          ctr: parseFloat(metrics.ctr || 0) * 100, // Convert to percentage
          cpc: parseFloat((metrics.average_cpc || 0) / 1000000), // Convert micros to dollars
          conversions: parseInt(metrics.conversions || 0),
          conversionRate: metrics.clicks > 0 
            ? parseFloat((metrics.conversions || 0) / metrics.clicks) * 100 
            : 0 // Calculate conversion rate manually: conversions / clicks * 100
        });
      }

      return transformedResults;
    } catch (error) {
      logger.error({ err: error }, 'Error fetching Google Ads metrics:');
      logger.error({ err: error.code }, 'Error code:');
      logger.error({ err: error.details }, 'Error details:');
      logger.error({ error: error.message }, 'Error message:');
      
      // Provide helpful error messages
      if (error.message && error.message.includes('invalid_client')) {
        throw new Error('Google Ads OAuth authentication failed. Please verify your Client ID, Client Secret, and Refresh Token are correct. The refresh token may need to be regenerated.');
      }
      if (error.message && error.message.includes('invalid_grant')) {
        throw new Error('Google Ads refresh token is invalid or expired. Please generate a new refresh token.');
      }
      if (error.code === 12) {
        if (error.details && error.details.includes('GRPC target method')) {
          // This error can occur if:
          // 1. Basic Access approval hasn't fully propagated (can take 2-24 hours)
          // 2. The API method isn't available in the current API version
          // 3. There's a mismatch between the package version and API version
          throw new Error('Google Ads API method not found (GRPC error). This usually means: 1) Basic Access approval is still propagating (can take 2-24 hours after approval), 2) The API method may not be available, or 3) There may be an API version mismatch. Please wait a few hours and try again. If the issue persists after 24 hours, check the Google Ads API Center to confirm Basic Access is fully active.');
        }
        throw new Error(`Google Ads API error (code 12): ${error.message || 'Unknown error'}. Please verify your developer token has Basic Access approved and wait for it to fully propagate (can take 2-24 hours).`);
      }
      
      // Check for authentication errors
      if (error.code === 16 || error.message?.includes('UNAUTHENTICATED')) {
        throw new Error('Google Ads API authentication failed. Please verify your OAuth credentials (Client ID, Client Secret, Refresh Token) are correct.');
      }
      
      // Check for permission errors
      if (error.code === 7 || error.message?.includes('PERMISSION_DENIED')) {
        throw new Error('Google Ads API permission denied. Please verify your developer token has Basic Access and that the customer ID is accessible with your credentials.');
      }
      
      throw error;
    }
  }

  /**
   * Fetch all campaigns to build a mapping
   */
  async fetchCampaigns() {
    if (!this.enabled) {
      logger.info('[STUB] Google Ads fetchCampaigns — returning mock data');
      return [
        { id: '1001', name: 'Brand Awareness - Search', utmCampaign: 'brand_awareness' },
        { id: '1002', name: 'Local Services - Display', utmCampaign: 'local_services' },
        { id: '1003', name: 'Retargeting - Previous Visitors', utmCampaign: 'retargeting' },
      ];
    }

    try {
      const query = `
        SELECT
          campaign.id,
          campaign.name,
          campaign.url_custom_parameters
        FROM campaign
        WHERE campaign.status = "ENABLED"
      `;

      const results = await this.customer.query(query);
      return results.map(row => ({
        id: row.campaign.id.toString(),
        name: row.campaign.name,
        utmCampaign: this.extractUtmCampaign(row.campaign),
      }));
    } catch (error) {
      logger.error({ err: error }, 'Error fetching Google campaigns:');
      throw error;
    }
  }

  extractUtmCampaign(campaign) {
    if (campaign.url_custom_parameters) {
      const utmParam = campaign.url_custom_parameters.find(
        param => param.key?.toLowerCase() === 'utm_campaign'
      );
      if (utmParam && utmParam.value) {
        return utmParam.value.string_value;
      }
    }
    return campaign.name;
  }

  /**
   * Get detailed campaign list with performance metrics
   * @returns {Promise<Array>} Array of campaigns with details
   */
  async getCampaignsList() {
    if (!this.enabled) {
      logger.info('[STUB] Google Ads getCampaignsList — returning mock data');
      return [
        { id: '1001', name: 'Brand Awareness - Search', status: 'ENABLED', advertisingChannelType: 'SEARCH', startDate: '2025-01-15', endDate: null, budget: 50.00, totalBudget: null, metrics: { spend: 312.45, impressions: 4520, clicks: 187, ctr: 4.14, cpc: 1.67, conversions: 12 } },
        { id: '1002', name: 'Local Services - Display', status: 'ENABLED', advertisingChannelType: 'DISPLAY', startDate: '2025-02-01', endDate: null, budget: 30.00, totalBudget: null, metrics: { spend: 189.20, impressions: 8930, clicks: 245, ctr: 2.74, cpc: 0.77, conversions: 8 } },
        { id: '1003', name: 'Retargeting - Previous Visitors', status: 'PAUSED', advertisingChannelType: 'DISPLAY', startDate: '2025-01-20', endDate: null, budget: 25.00, totalBudget: null, metrics: { spend: 74.30, impressions: 2150, clicks: 98, ctr: 4.56, cpc: 0.76, conversions: 5 } },
      ];
    }

    try {
      // Get campaigns with status and basic info
      const query = `
        SELECT
          campaign.id,
          campaign.name,
          campaign.status,
          campaign.advertising_channel_type,
          campaign.start_date,
          campaign.end_date,
          campaign_budget.amount_micros,
          campaign_budget.total_amount_micros
        FROM campaign
        WHERE campaign.status != 'REMOVED'
        ORDER BY campaign.name
      `;

      const results = await this._customer.query(query);

      // Get metrics for last 30 days
      const endDate = new Date().toISOString().split('T')[0];
      const startDate = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString().split('T')[0];

      const campaignsWithMetrics = await Promise.all(
        results.map(async (row) => {
          const campaignId = row.campaign.id.toString();
          const campaignName = row.campaign.name;

          try {
            // Get metrics for this campaign
            const metricsQuery = `
              SELECT
                campaign.id,
                segments.date,
                metrics.impressions,
                metrics.clicks,
                metrics.cost_micros,
                metrics.ctr,
                metrics.average_cpc,
                metrics.conversions
              FROM campaign
              WHERE campaign.id = ${campaignId}
                AND segments.date BETWEEN '${startDate}' AND '${endDate}'
            `;

            const metricsResults = await this._customer.query(metricsQuery);

            const totals = metricsResults.reduce((acc, metricRow) => ({
              impressions: acc.impressions + parseInt(metricRow.metrics?.impressions || 0),
              clicks: acc.clicks + parseInt(metricRow.metrics?.clicks || 0),
              costMicros: acc.costMicros + parseInt(metricRow.metrics?.cost_micros || 0),
              conversions: acc.conversions + parseFloat(metricRow.metrics?.conversions || 0),
            }), { impressions: 0, clicks: 0, costMicros: 0, conversions: 0 });

            return {
              id: campaignId,
              name: campaignName,
              status: this._mapCampaignStatus(row.campaign.status),
              advertisingChannelType: row.campaign.advertising_channel_type,
              startDate: row.campaign.start_date,
              endDate: row.campaign.end_date,
              budget: row.campaign_budget?.amount_micros
                ? parseFloat(row.campaign_budget.amount_micros) / 1000000
                : null,
              totalBudget: row.campaign_budget?.total_amount_micros
                ? parseFloat(row.campaign_budget.total_amount_micros) / 1000000
                : null,
              metrics: {
                spend: totals.costMicros / 1000000,
                impressions: totals.impressions,
                clicks: totals.clicks,
                ctr: totals.impressions > 0 ? (totals.clicks / totals.impressions) * 100 : 0,
                cpc: totals.clicks > 0 ? (totals.costMicros / 1000000) / totals.clicks : 0,
                conversions: totals.conversions,
              },
            };
          } catch (error) {
            // If we can't get metrics, return campaign without metrics
            logger.warn({ data: error.message }, `Could not fetch metrics for Google campaign ${campaignId}:`);
            return {
              id: campaignId,
              name: campaignName,
              status: this._mapCampaignStatus(row.campaign.status),
              advertisingChannelType: row.campaign.advertising_channel_type,
              startDate: row.campaign.start_date,
              endDate: row.campaign.end_date,
              budget: row.campaign_budget?.amount_micros
                ? parseFloat(row.campaign_budget.amount_micros) / 1000000
                : null,
              totalBudget: row.campaign_budget?.total_amount_micros
                ? parseFloat(row.campaign_budget.total_amount_micros) / 1000000
                : null,
              metrics: null,
            };
          }
        })
      );

      return campaignsWithMetrics;
    } catch (error) {
      logger.error({ err: error }, 'Error fetching Google campaigns list:');
      throw error;
    }
  }

  /**
   * Update campaign status (enable/disable)
   * @param {string} campaignId - Campaign ID
   * @param {string} status - 'ENABLED' or 'PAUSED'
   * @returns {Promise<Object>} Updated campaign object
   */
  async updateCampaignStatus(campaignId, status) {
    if (!this.enabled) {
      logger.info(`[STUB] Google Ads updateCampaignStatus: campaign ${campaignId} → ${status}`);
      return { id: campaignId, name: 'Stub Campaign', status };
    }

    if (!['ENABLED', 'PAUSED'].includes(status)) {
      throw new Error('Status must be ENABLED or PAUSED');
    }

    try {
      // Google Ads API uses mutateResources for updates
      const campaignResourceName = `customers/${this.customerId}/campaigns/${campaignId}`;
      
      const operations = [
        {
          _resource: 'Campaign',
          _operation: 'update',
          resource_name: campaignResourceName,
          status: status,
        },
      ];

      // Execute the mutation
      await this._customer.mutateResources(operations);

      // Fetch updated campaign to return
      const query = `
        SELECT
          campaign.id,
          campaign.name,
          campaign.status
        FROM campaign
        WHERE campaign.id = ${campaignId}
      `;

      const updatedResults = await this._customer.query(query);
      if (updatedResults.length === 0) {
        throw new Error('Campaign not found after update');
      }

      const updatedCampaign = updatedResults[0];
      return {
        id: updatedCampaign.campaign.id.toString(),
        name: updatedCampaign.campaign.name,
        status: this._mapCampaignStatus(updatedCampaign.campaign.status),
      };
    } catch (error) {
      logger.error({ err: error }, `Error updating Google campaign ${campaignId} status:`);
      throw error;
    }
  }

  /**
   * Upload an offline click conversion to Google Ads
   * Called after confirmed Stripe payment to close the attribution loop.
   *
   * Prerequisites:
   * - GOOGLE_ADS_CONVERSION_ACTION_ID env var must be set (numeric ID of the
   *   "Purchase" conversion action in Google Ads > Goals > Conversions)
   * - gclid must have been captured at booking time (stored in booking_submissions.utm->>'gclid')
   *
   * @param {string} gclid - Google Click ID captured at booking time
   * @param {number} conversionValueDollars - Conversion value in USD
   * @param {Date|string} conversionDateTime - When the conversion occurred
   * @returns {Promise<Object>} Upload result
   */
  async uploadConversion(gclid, conversionValueDollars, conversionDateTime) {
    if (!this.enabled) {
      logger.warn('Google Ads API not configured — skipping offline conversion upload');
      return { skipped: true, reason: 'API not configured' };
    }

    const conversionActionId = process.env.GOOGLE_ADS_CONVERSION_ACTION_ID;
    if (!conversionActionId) {
      logger.warn('GOOGLE_ADS_CONVERSION_ACTION_ID not set — skipping offline conversion upload');
      return { skipped: true, reason: 'Conversion action ID not configured' };
    }

    if (!gclid) {
      logger.info('No gclid — skipping offline conversion upload (organic or non-Google traffic)');
      return { skipped: true, reason: 'No gclid' };
    }

    try {
      // Format datetime to Google Ads required format: "yyyy-MM-dd HH:mm:ss+00:00"
      const dt = conversionDateTime instanceof Date ? conversionDateTime : new Date(conversionDateTime);
      const pad = (n) => String(n).padStart(2, '0');
      const formattedDateTime = `${dt.getUTCFullYear()}-${pad(dt.getUTCMonth() + 1)}-${pad(dt.getUTCDate())} ${pad(dt.getUTCHours())}:${pad(dt.getUTCMinutes())}:${pad(dt.getUTCSeconds())}+00:00`;

      const conversion = {
        gclid: gclid,
        conversion_action: `customers/${this.customerId}/conversionActions/${conversionActionId}`,
        conversion_date_time: formattedDateTime,
        conversion_value: parseFloat(conversionValueDollars) || 0,
        currency_code: 'USD',
      };

      logger.info(
        { data: { gclid: gclid.substring(0, 10) + '...', value: conversionValueDollars, dateTime: formattedDateTime } },
        'Uploading offline click conversion to Google Ads'
      );

      const result = await this._customer.conversionUploads.uploadClickConversions({
        customer_id: this.customerId,
        conversions: [conversion],
        partial_failure: true,
      });

      if (result.partial_failure_error) {
        logger.warn({ data: result.partial_failure_error }, 'Google Ads offline conversion partial failure');
        return { success: false, partialFailure: result.partial_failure_error };
      }

      logger.info({ data: { resultsCount: result.results?.length } }, '✅ Offline conversion uploaded to Google Ads');
      return { success: true, results: result.results };
    } catch (error) {
      // Log but never throw — conversion upload failure must not block payment processing
      logger.error({ err: error }, 'Error uploading offline conversion to Google Ads');
      return { success: false, error: error.message };
    }
  }

  /**
   * Update campaign budget (daily budget)
   * @param {string} campaignId - Campaign ID
   * @param {number} dailyBudgetDollars - New daily budget in dollars
   * @returns {Promise<Object>} Updated campaign with budget info
   */
  async updateCampaignBudget(campaignId, dailyBudgetDollars) {
    if (!this.enabled) {
      logger.info(`[STUB] Google Ads updateCampaignBudget: campaign ${campaignId} → $${dailyBudgetDollars}/day`);
      return { campaignId, campaignName: 'Stub Campaign', budgetResourceName: 'stub', newDailyBudget: dailyBudgetDollars, newBudgetMicros: Math.round(dailyBudgetDollars * 1000000), verified: true };
    }

    if (typeof dailyBudgetDollars !== 'number' || dailyBudgetDollars <= 0) {
      throw new Error('Daily budget must be a positive number');
    }

    // Convert dollars to micros (Google Ads uses micros: 1 dollar = 1,000,000 micros)
    const budgetMicros = Math.round(dailyBudgetDollars * 1000000);

    try {
      // First, get the campaign's budget resource name
      const campaignQuery = `
        SELECT
          campaign.id,
          campaign.name,
          campaign.campaign_budget
        FROM campaign
        WHERE campaign.id = ${campaignId}
      `;

      const campaignResults = await this._customer.query(campaignQuery);
      if (campaignResults.length === 0) {
        throw new Error(`Campaign ${campaignId} not found`);
      }

      const campaign = campaignResults[0];
      const budgetResourceName = campaign.campaign.campaign_budget;

      if (!budgetResourceName) {
        throw new Error(`Campaign ${campaignId} does not have a budget resource`);
      }

      logger.info(`Updating budget for campaign ${campaignId}: ${budgetResourceName} to $${dailyBudgetDollars}/day (${budgetMicros} micros)`);

      // Update the campaign budget
      const operations = [
        {
          _resource: 'CampaignBudget',
          _operation: 'update',
          resource_name: budgetResourceName,
          amount_micros: budgetMicros,
        },
      ];

      await this._customer.mutateResources(operations);

      // Fetch updated budget to verify
      const budgetQuery = `
        SELECT
          campaign_budget.id,
          campaign_budget.name,
          campaign_budget.amount_micros
        FROM campaign_budget
        WHERE campaign_budget.resource_name = '${budgetResourceName}'
      `;

      const budgetResults = await this._customer.query(budgetQuery);
      const updatedBudget = budgetResults[0]?.campaign_budget;

      return {
        campaignId: campaignId,
        campaignName: campaign.campaign.name,
        budgetResourceName: budgetResourceName,
        newDailyBudget: dailyBudgetDollars,
        newBudgetMicros: budgetMicros,
        verified: updatedBudget?.amount_micros === budgetMicros,
      };
    } catch (error) {
      logger.error({ err: error }, `Error updating Google campaign ${campaignId} budget:`);
      const msg = error.message || error.errors?.[0]?.message || error.errors?.[0]?.error_code?.toString() || JSON.stringify(error.errors || 'Unknown Google Ads error');
      throw new Error(`Failed to update Google Ads budget for campaign ${campaignId}: ${msg}`);
    }
  }
}

module.exports = GoogleAdsService;

