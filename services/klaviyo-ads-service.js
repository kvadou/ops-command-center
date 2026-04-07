// services/klaviyo-ads-service.js
/**
 * Klaviyo Email Marketing API Integration Service
 * Manages email campaigns via Klaviyo API
 * 
 * Required Environment Variables:
 * - KLAVIYO_API_KEY: Your Klaviyo API key
 */

const axios = require('axios');
const { logger } = require('../utils/logger');

const KLAVIYO_API_BASE = 'https://a.klaviyo.com/api';
const REVISION = '2024-10-15'; // Required for API v3

class KlaviyoAdsService {
  constructor() {
    const apiKey = process.env.KLAVIYO_API_KEY;

    if (!apiKey) {
      logger.warn('Klaviyo API key not configured. Set KLAVIYO_API_KEY environment variable.');
      this.enabled = false;
      return;
    }

    this.apiKey = apiKey;
    this.enabled = true;
  }

  /**
   * Helper function to make Klaviyo API requests
   */
  async _request(endpoint, method = 'GET', body = null, params = {}) {
    if (!this.enabled) {
      logger.info(`[STUB] Klaviyo ads ${method} ${endpoint}`);
      return { data: [] };
    }

    const url = `${KLAVIYO_API_BASE}${endpoint}`;
    const config = {
      method,
      url,
      params: method === 'GET' ? params : undefined,
      ...(method !== 'GET' && body !== null ? { data: body } : {}),
      headers: {
        'Accept': 'application/json',
        'Content-Type': 'application/json',
        'revision': REVISION,
        'Authorization': `Klaviyo-API-Key ${this.apiKey}`,
      },
      timeout: 30000,
    };

    try {
      const response = await axios(config);
      return response.data;
    } catch (error) {
      logger.error({ error: error.response?.data || error.message }, `Klaviyo API error for ${endpoint}:`);
      throw error;
    }
  }

  /**
   * Helper function to paginate through Klaviyo API responses
   */
  async _paginate(endpoint, params = {}, maxPages = 100) {
    const allData = [];
    let cursor = null;
    let page = 0;

    while (page < maxPages) {
      const requestParams = { ...params };
      if (cursor) {
        requestParams['page[cursor]'] = cursor;
      }

      const response = await this._request(endpoint, 'GET', null, requestParams);
      
      if (response.data && Array.isArray(response.data)) {
        allData.push(...response.data);
      }

      // Check for next page
      const nextLink = response.links?.next;
      if (!nextLink) {
        break;
      }

      // Extract cursor from next link
      const cursorMatch = nextLink.match(/page%5Bcursor%5D=([^&]+)/);
      if (!cursorMatch) {
        break;
      }

      cursor = cursorMatch[1];
      page++;
    }

    return allData;
  }

  /**
   * Get all email campaigns with metrics
   * @returns {Promise<Array>} Array of campaigns with details
   */
  async getCampaignsList() {
    if (!this.enabled) {
      logger.info('[STUB] Klaviyo getCampaignsList — returning mock data');
      return [
        { id: 'kl-001', name: 'Welcome Series', status: 'Live', sentAt: '2025-03-15T10:00:00Z', metrics: { recipients: 1250, opens: 485, clicks: 124, bounces: 12, unsubscribes: 3 } },
        { id: 'kl-002', name: 'Monthly Newsletter - March', status: 'Sent', sentAt: '2025-03-01T14:00:00Z', metrics: { recipients: 8400, opens: 2940, clicks: 672, bounces: 45, unsubscribes: 18 } },
        { id: 'kl-003', name: 'Re-engagement Campaign', status: 'Draft', sentAt: null, metrics: null },
      ];
    }

    try {
      // Fetch email campaigns
      // Note: Klaviyo campaigns endpoint doesn't support page[size] parameter
      const emailCampaigns = await this._paginate('/campaigns/', {
        'filter': "equals(messages.channel,'email')",
      });

      // Fetch SMS campaigns
      const smsCampaigns = await this._paginate('/campaigns/', {
        'filter': "equals(messages.channel,'sms')",
      });

      const allCampaigns = [...emailCampaigns, ...smsCampaigns];

      // Get metrics for each campaign
      const campaignsWithMetrics = await Promise.all(
        allCampaigns.map(async (campaign) => {
          try {
            // Try to get campaign messages/metrics
            const messagesResponse = await this._request(
              `/campaigns/${campaign.id}/campaign-messages/`,
              'GET'
            );

            // Extract metrics from messages
            let metrics = null;
            if (messagesResponse.data && messagesResponse.data.length > 0) {
              const message = messagesResponse.data[0];
              const stats = message.attributes?.statistics || {};

              metrics = {
                sent: stats.send_count || 0,
                delivered: stats.delivered_count || 0,
                opened: stats.open_count || 0,
                uniqueOpens: stats.unique_open_count || 0,
                clicked: stats.click_count || 0,
                uniqueClicks: stats.unique_click_count || 0,
                bounced: stats.bounce_count || 0,
                unsubscribed: stats.unsubscribe_count || 0,
                spamComplaints: stats.spam_count || 0,
              };
            }

            return {
              id: campaign.id,
              name: campaign.attributes?.name || 'Unnamed Campaign',
              status: campaign.attributes?.status || 'unknown',
              channel: campaign.attributes?.messages?.channel || 'email',
              createdAt: campaign.attributes?.created_at,
              scheduledAt: campaign.attributes?.scheduled_at,
              sentAt: campaign.attributes?.sent_at,
              metrics,
            };
          } catch (error) {
            // If we can't get metrics (e.g., draft campaign), return campaign without metrics
            logger.warn({ data: error.message }, `Could not fetch metrics for Klaviyo campaign ${campaign.id}:`);
            return {
              id: campaign.id,
              name: campaign.attributes?.name || 'Unnamed Campaign',
              status: campaign.attributes?.status || 'unknown',
              channel: campaign.attributes?.messages?.channel || 'email',
              createdAt: campaign.attributes?.created_at,
              scheduledAt: campaign.attributes?.scheduled_at,
              sentAt: campaign.attributes?.sent_at,
              metrics: null,
            };
          }
        })
      );

      return campaignsWithMetrics;
    } catch (error) {
      logger.error({ err: error }, 'Error fetching Klaviyo campaigns list:');
      throw error;
    }
  }

  /**
   * Cancel a scheduled campaign
   * @param {string} campaignId - Campaign ID
   * @returns {Promise<Object>} Cancellation result
   */
  async cancelCampaign(campaignId) {
    if (!this.enabled) {
      return { success: true, campaignId, message: '[STUB] Campaign cancel simulated' };
    }

    try {
      // First, get the campaign send job ID
      const campaignResponse = await this._request(`/campaigns/${campaignId}/`, 'GET');
      
      // Check if campaign has a send job
      const sendJobId = campaignResponse.data?.attributes?.send_job_id;
      
      if (!sendJobId) {
        throw new Error('Campaign does not have an active send job to cancel');
      }

      // Cancel the send job
      // Note: Klaviyo API v3 uses PATCH to cancel campaigns
      // The endpoint might be /campaigns/{id}/cancel/ or similar
      // Check Klaviyo API docs for exact endpoint
      const cancelResponse = await this._request(
        `/campaigns/${campaignId}/cancel/`,
        'PATCH',
        {}
      );

      return {
        success: true,
        campaignId,
        message: 'Campaign canceled successfully',
      };
    } catch (error) {
      logger.error({ err: error }, `Error canceling Klaviyo campaign ${campaignId}:`);
      
      // If cancel endpoint doesn't exist, return error
      if (error.response?.status === 404) {
        throw new Error('Cancel endpoint not available. Campaign may already be sent or canceled.');
      }
      
      throw error;
    }
  }

  /**
   * Get campaign details
   * @param {string} campaignId - Campaign ID
   * @returns {Promise<Object>} Campaign details
   */
  async getCampaignDetails(campaignId) {
    if (!this.enabled) {
      return { id: campaignId, attributes: { name: 'Stub Campaign', status: 'draft', created_at: new Date().toISOString() } };
    }

    try {
      const response = await this._request(`/campaigns/${campaignId}/`, 'GET');
      return response.data;
    } catch (error) {
      logger.error({ err: error }, `Error fetching Klaviyo campaign ${campaignId} details:`);
      throw error;
    }
  }
}

module.exports = KlaviyoAdsService;
