/**
 * TikTok Ads API Service
 *
 * Integration with TikTok for Business Marketing API
 * for campaign management and performance tracking.
 *
 * Required Environment Variables:
 * - TIKTOK_ACCESS_TOKEN: Long-lived access token
 * - TIKTOK_ADVERTISER_ID: Your advertiser account ID
 *
 * API Documentation: https://business-api.tiktok.com/portal/docs
 */

const axios = require('axios');
const { logger } = require('../utils/logger');

const TIKTOK_API_BASE = 'https://business-api.tiktok.com/open_api/v1.3';

class TikTokAdsApi {
  constructor() {
    this.accessToken = process.env.TIKTOK_ACCESS_TOKEN;
    this.advertiserId = process.env.TIKTOK_ADVERTISER_ID;

    if (!this.accessToken || !this.advertiserId) {
      logger.warn('TikTok Ads API credentials not configured. ' +
        'Set TIKTOK_ACCESS_TOKEN and TIKTOK_ADVERTISER_ID environment variables.');
      this.enabled = false;
      return;
    }

    this.enabled = true;
  }

  /**
   * Check if API is available
   */
  isAvailable() {
    return this.enabled;
  }

  /**
   * Make API request to TikTok
   */
  async _request(endpoint, method = 'GET', data = null) {
    if (!this.enabled) {
      logger.info(`[STUB] TikTok API ${method} ${endpoint}`);
      return { code: 0, message: 'OK', data: { list: [], page_info: { total_number: 0 } } };
    }

    const url = `${TIKTOK_API_BASE}${endpoint}`;
    const config = {
      method,
      url,
      headers: {
        'Access-Token': this.accessToken,
        'Content-Type': 'application/json',
      },
      timeout: 30000,
    };

    if (method === 'GET' && data) {
      config.params = data;
    } else if (data) {
      config.data = data;
    }

    try {
      const response = await axios(config);

      // TikTok API returns code 0 for success
      if (response.data.code !== 0) {
        throw new Error(response.data.message || 'TikTok API error');
      }

      return response.data.data;
    } catch (error) {
      logger.error({
        error: error.message,
        endpoint,
        response: error.response?.data,
      }, 'TikTok API request failed');
      throw error;
    }
  }

  /**
   * Get advertiser info
   */
  async getAdvertiserInfo() {
    return this._request('/advertiser/info/', 'GET', {
      advertiser_ids: JSON.stringify([this.advertiserId]),
    });
  }

  /**
   * Get list of campaigns
   * @param {Object} options - Query options
   */
  async getCampaignsList(options = {}) {
    const {
      status,
      limit = 100,
      page = 1,
    } = options;

    const params = {
      advertiser_id: this.advertiserId,
      page_size: limit,
      page,
    };

    if (status) {
      params.filtering = JSON.stringify({ status });
    }

    const data = await this._request('/campaign/get/', 'GET', params);

    return (data.list || []).map(campaign => ({
      id: campaign.campaign_id,
      name: campaign.campaign_name,
      status: campaign.operation_status,
      objective: campaign.objective_type,
      budgetMode: campaign.budget_mode,
      budget: campaign.budget,
      createdAt: campaign.create_time,
      modifiedAt: campaign.modify_time,
    }));
  }

  /**
   * Get campaign details
   * @param {string} campaignId - Campaign ID
   */
  async getCampaignDetails(campaignId) {
    const data = await this._request('/campaign/get/', 'GET', {
      advertiser_id: this.advertiserId,
      filtering: JSON.stringify({ campaign_ids: [campaignId] }),
    });

    if (!data.list || data.list.length === 0) {
      throw new Error(`Campaign ${campaignId} not found`);
    }

    return data.list[0];
  }

  /**
   * Update campaign status
   * @param {string} campaignId - Campaign ID
   * @param {string} status - 'ENABLE' or 'DISABLE'
   */
  async updateCampaignStatus(campaignId, status) {
    // TikTok uses ENABLE/DISABLE for status updates
    const tiktokStatus = status.toUpperCase() === 'ACTIVE' || status.toUpperCase() === 'ENABLE'
      ? 'ENABLE'
      : 'DISABLE';

    return this._request('/campaign/status/update/', 'POST', {
      advertiser_id: this.advertiserId,
      campaign_ids: [campaignId],
      operation_status: tiktokStatus,
    });
  }

  /**
   * Update campaign budget
   * @param {string} campaignId - Campaign ID
   * @param {Object} budgetParams - Budget parameters
   */
  async updateCampaignBudget(campaignId, { budget, budgetMode = 'BUDGET_MODE_DAY' }) {
    return this._request('/campaign/update/', 'POST', {
      advertiser_id: this.advertiserId,
      campaign_id: campaignId,
      budget,
      budget_mode: budgetMode,
    });
  }

  /**
   * Get ad groups for a campaign
   * @param {string} campaignId - Campaign ID
   */
  async getAdGroups(campaignId) {
    const data = await this._request('/adgroup/get/', 'GET', {
      advertiser_id: this.advertiserId,
      filtering: JSON.stringify({ campaign_ids: [campaignId] }),
    });

    return (data.list || []).map(adgroup => ({
      id: adgroup.adgroup_id,
      campaignId: adgroup.campaign_id,
      name: adgroup.adgroup_name,
      status: adgroup.operation_status,
      budget: adgroup.budget,
      bidPrice: adgroup.bid_price,
      createdAt: adgroup.create_time,
    }));
  }

  /**
   * Update ad group status
   * @param {string} adGroupId - Ad group ID
   * @param {string} status - 'ENABLE' or 'DISABLE'
   */
  async updateAdGroupStatus(adGroupId, status) {
    const tiktokStatus = status.toUpperCase() === 'ACTIVE' || status.toUpperCase() === 'ENABLE'
      ? 'ENABLE'
      : 'DISABLE';

    return this._request('/adgroup/status/update/', 'POST', {
      advertiser_id: this.advertiserId,
      adgroup_ids: [adGroupId],
      operation_status: tiktokStatus,
    });
  }

  /**
   * Get campaign performance metrics
   * @param {string} campaignId - Campaign ID (optional, omit for all campaigns)
   * @param {Object} dateRange - { startDate, endDate }
   */
  async getCampaignMetrics(campaignId = null, dateRange = {}) {
    const { startDate, endDate } = dateRange;

    // Default to last 7 days
    const end = endDate || new Date();
    const start = startDate || new Date(end.getTime() - 7 * 24 * 60 * 60 * 1000);

    const params = {
      advertiser_id: this.advertiserId,
      report_type: 'BASIC',
      dimensions: JSON.stringify(['campaign_id']),
      data_level: 'AUCTION_CAMPAIGN',
      start_date: formatDate(start),
      end_date: formatDate(end),
      metrics: JSON.stringify([
        'spend',
        'impressions',
        'clicks',
        'ctr',
        'cpc',
        'cpm',
        'conversions',
        'conversion_rate',
        'cost_per_conversion',
      ]),
    };

    if (campaignId) {
      params.filtering = JSON.stringify({ campaign_ids: [campaignId] });
    }

    const data = await this._request('/report/integrated/get/', 'GET', params);

    return (data.list || []).map(row => ({
      campaignId: row.dimensions?.campaign_id,
      spend: parseFloat(row.metrics?.spend || 0),
      impressions: parseInt(row.metrics?.impressions || 0),
      clicks: parseInt(row.metrics?.clicks || 0),
      ctr: parseFloat(row.metrics?.ctr || 0),
      cpc: parseFloat(row.metrics?.cpc || 0),
      cpm: parseFloat(row.metrics?.cpm || 0),
      conversions: parseInt(row.metrics?.conversions || 0),
      conversionRate: parseFloat(row.metrics?.conversion_rate || 0),
      costPerConversion: parseFloat(row.metrics?.cost_per_conversion || 0),
    }));
  }

  /**
   * Get total spend for date range
   * @param {Object} dateRange - { startDate, endDate }
   */
  async getTotalSpend(dateRange = {}) {
    const metrics = await this.getCampaignMetrics(null, dateRange);
    return metrics.reduce((sum, m) => sum + m.spend, 0);
  }
}

/**
 * Format date for TikTok API (YYYY-MM-DD)
 */
function formatDate(date) {
  const d = new Date(date);
  return d.toISOString().split('T')[0];
}

module.exports = TikTokAdsApi;
