/**
 * LinkedIn Marketing API Service
 *
 * Integration with LinkedIn Marketing API for campaign management
 * and performance tracking.
 *
 * Required Environment Variables:
 * - LINKEDIN_ACCESS_TOKEN: OAuth 2.0 access token
 * - LINKEDIN_AD_ACCOUNT_ID: Your ad account ID (sponsored account URN)
 *
 * API Documentation: https://learn.microsoft.com/en-us/linkedin/marketing/
 */

const axios = require('axios');
const { logger } = require('../utils/logger');

const LINKEDIN_API_BASE = 'https://api.linkedin.com/rest';
const LINKEDIN_API_VERSION = '202401'; // LinkedIn API versioning

class LinkedInAdsApi {
  constructor() {
    this.accessToken = process.env.LINKEDIN_ACCESS_TOKEN;
    this.adAccountId = process.env.LINKEDIN_AD_ACCOUNT_ID;

    if (!this.accessToken || !this.adAccountId) {
      logger.warn('LinkedIn Marketing API credentials not configured. ' +
        'Set LINKEDIN_ACCESS_TOKEN and LINKEDIN_AD_ACCOUNT_ID environment variables.');
      this.enabled = false;
      return;
    }

    this.enabled = true;
    // LinkedIn uses URN format for account IDs
    this.accountUrn = this.adAccountId.startsWith('urn:li:sponsoredAccount:')
      ? this.adAccountId
      : `urn:li:sponsoredAccount:${this.adAccountId}`;
  }

  /**
   * Check if API is available
   */
  isAvailable() {
    return this.enabled;
  }

  /**
   * Make API request to LinkedIn
   */
  async _request(endpoint, method = 'GET', data = null, params = {}) {
    if (!this.enabled) {
      logger.info(`[STUB] LinkedIn API ${method} ${endpoint}`);
      return { elements: [], paging: { total: 0 } };
    }

    const url = `${LINKEDIN_API_BASE}${endpoint}`;
    const config = {
      method,
      url,
      params,
      headers: {
        'Authorization': `Bearer ${this.accessToken}`,
        'Content-Type': 'application/json',
        'LinkedIn-Version': LINKEDIN_API_VERSION,
        'X-Restli-Protocol-Version': '2.0.0',
      },
      timeout: 30000,
    };

    if (data && method !== 'GET') {
      config.data = data;
    }

    try {
      const response = await axios(config);
      return response.data;
    } catch (error) {
      logger.error({
        error: error.message,
        endpoint,
        status: error.response?.status,
        data: error.response?.data,
      }, 'LinkedIn API request failed');
      throw error;
    }
  }

  /**
   * Get ad account info
   */
  async getAdAccountInfo() {
    return this._request(`/adAccounts/${encodeURIComponent(this.accountUrn)}`);
  }

  /**
   * Get list of campaigns
   * @param {Object} options - Query options
   */
  async getCampaignsList(options = {}) {
    const {
      status,
      limit = 100,
    } = options;

    const params = {
      q: 'search',
      search: JSON.stringify({
        account: { values: [this.accountUrn] },
        ...(status ? { status: { values: [status] } } : {}),
      }),
      count: limit,
    };

    const data = await this._request('/adCampaigns', 'GET', null, params);

    return (data.elements || []).map(campaign => ({
      id: this.extractId(campaign.id || campaign.$URN),
      urn: campaign.id || campaign.$URN,
      name: campaign.name,
      status: campaign.status,
      type: campaign.type,
      objectiveType: campaign.objectiveType,
      costType: campaign.costType,
      dailyBudget: campaign.dailyBudget?.amount,
      totalBudget: campaign.totalBudget?.amount,
      unitCost: campaign.unitCost?.amount,
      createdAt: campaign.changeAuditStamps?.created?.time,
      modifiedAt: campaign.changeAuditStamps?.lastModified?.time,
    }));
  }

  /**
   * Get campaign details
   * @param {string} campaignId - Campaign ID or URN
   */
  async getCampaignDetails(campaignId) {
    const urn = campaignId.startsWith('urn:') ? campaignId : `urn:li:sponsoredCampaign:${campaignId}`;
    return this._request(`/adCampaigns/${encodeURIComponent(urn)}`);
  }

  /**
   * Update campaign status
   * @param {string} campaignId - Campaign ID
   * @param {string} status - 'ACTIVE', 'PAUSED', 'ARCHIVED', 'CANCELED', 'DRAFT'
   */
  async updateCampaignStatus(campaignId, status) {
    const urn = campaignId.startsWith('urn:') ? campaignId : `urn:li:sponsoredCampaign:${campaignId}`;

    // LinkedIn uses specific status values
    const linkedInStatus = this.normalizeStatus(status);

    return this._request(
      `/adCampaigns/${encodeURIComponent(urn)}`,
      'PATCH',
      { patch: { $set: { status: linkedInStatus } } }
    );
  }

  /**
   * Normalize status to LinkedIn format
   */
  normalizeStatus(status) {
    const statusMap = {
      'ACTIVE': 'ACTIVE',
      'ENABLED': 'ACTIVE',
      'PAUSED': 'PAUSED',
      'DISABLED': 'PAUSED',
      'ARCHIVED': 'ARCHIVED',
      'CANCELED': 'CANCELED',
      'CANCELLED': 'CANCELED',
      'DRAFT': 'DRAFT',
    };
    return statusMap[status.toUpperCase()] || 'PAUSED';
  }

  /**
   * Update campaign budget
   * @param {string} campaignId - Campaign ID
   * @param {Object} budgetParams - Budget parameters
   */
  async updateCampaignBudget(campaignId, { dailyBudget, totalBudget, currency = 'USD' }) {
    const urn = campaignId.startsWith('urn:') ? campaignId : `urn:li:sponsoredCampaign:${campaignId}`;

    const patch = { $set: {} };

    if (dailyBudget !== undefined) {
      patch.$set.dailyBudget = {
        amount: String(dailyBudget),
        currencyCode: currency,
      };
    }

    if (totalBudget !== undefined) {
      patch.$set.totalBudget = {
        amount: String(totalBudget),
        currencyCode: currency,
      };
    }

    return this._request(
      `/adCampaigns/${encodeURIComponent(urn)}`,
      'PATCH',
      { patch }
    );
  }

  /**
   * Get campaign groups (LinkedIn's equivalent of ad sets)
   */
  async getCampaignGroups() {
    const params = {
      q: 'search',
      search: JSON.stringify({
        account: { values: [this.accountUrn] },
      }),
    };

    const data = await this._request('/adCampaignGroups', 'GET', null, params);

    return (data.elements || []).map(group => ({
      id: this.extractId(group.id || group.$URN),
      urn: group.id || group.$URN,
      name: group.name,
      status: group.status,
      totalBudget: group.totalBudget?.amount,
      createdAt: group.changeAuditStamps?.created?.time,
    }));
  }

  /**
   * Get campaign analytics
   * @param {Object} options - Query options
   */
  async getCampaignAnalytics(options = {}) {
    const {
      campaignIds = [],
      startDate,
      endDate,
      granularity = 'DAILY',
    } = options;

    // Default to last 7 days
    const end = endDate || new Date();
    const start = startDate || new Date(end.getTime() - 7 * 24 * 60 * 60 * 1000);

    const params = {
      q: 'analytics',
      pivot: 'CAMPAIGN',
      dateRange: JSON.stringify({
        start: {
          day: start.getDate(),
          month: start.getMonth() + 1,
          year: start.getFullYear(),
        },
        end: {
          day: end.getDate(),
          month: end.getMonth() + 1,
          year: end.getFullYear(),
        },
      }),
      timeGranularity: granularity,
      accounts: `List(${this.accountUrn})`,
      fields: 'impressions,clicks,costInLocalCurrency,externalWebsiteConversions,dateRange',
    };

    if (campaignIds.length > 0) {
      const urns = campaignIds.map(id =>
        id.startsWith('urn:') ? id : `urn:li:sponsoredCampaign:${id}`
      );
      params.campaigns = `List(${urns.join(',')})`;
    }

    const data = await this._request('/adAnalytics', 'GET', null, params);

    return (data.elements || []).map(row => ({
      campaignId: this.extractId(row.pivotValue),
      impressions: parseInt(row.impressions || 0),
      clicks: parseInt(row.clicks || 0),
      spend: parseFloat(row.costInLocalCurrency || 0),
      conversions: parseInt(row.externalWebsiteConversions || 0),
      ctr: row.impressions > 0 ? (row.clicks / row.impressions * 100) : 0,
      cpc: row.clicks > 0 ? (row.costInLocalCurrency / row.clicks) : 0,
      dateRange: row.dateRange,
    }));
  }

  /**
   * Get total spend for date range
   * @param {Object} dateRange - { startDate, endDate }
   */
  async getTotalSpend(dateRange = {}) {
    const analytics = await this.getCampaignAnalytics({
      startDate: dateRange.startDate,
      endDate: dateRange.endDate,
      granularity: 'ALL',
    });
    return analytics.reduce((sum, a) => sum + a.spend, 0);
  }

  /**
   * Extract ID from URN
   */
  extractId(urn) {
    if (!urn) return null;
    const parts = urn.split(':');
    return parts[parts.length - 1];
  }

  /**
   * Get creatives for a campaign
   * @param {string} campaignId - Campaign ID
   */
  async getCreatives(campaignId) {
    const urn = campaignId.startsWith('urn:') ? campaignId : `urn:li:sponsoredCampaign:${campaignId}`;

    const params = {
      q: 'search',
      search: JSON.stringify({
        campaign: { values: [urn] },
      }),
    };

    const data = await this._request('/adCreatives', 'GET', null, params);

    return (data.elements || []).map(creative => ({
      id: this.extractId(creative.id || creative.$URN),
      campaignId: this.extractId(creative.campaign),
      status: creative.status,
      type: creative.type,
      createdAt: creative.changeAuditStamps?.created?.time,
    }));
  }
}

module.exports = LinkedInAdsApi;
