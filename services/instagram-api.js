/**
 * Instagram Graph API Service
 * Handles Instagram content publishing through the Facebook/Meta Graph API
 *
 * Required Environment Variables:
 * - META_ACCESS_TOKEN: Long-lived access token with instagram_basic, instagram_content_publish scopes
 * - INSTAGRAM_BUSINESS_ACCOUNT_ID: Instagram Business Account ID
 *
 * Note: Instagram Business Account must be connected to a Facebook Page
 */

const fetch = require('node-fetch');
const { logger } = require('../utils/logger');

class InstagramApiService {
  constructor() {
    this.accessToken = process.env.META_ACCESS_TOKEN;
    this.accountId = process.env.INSTAGRAM_BUSINESS_ACCOUNT_ID;
    this.baseUrl = 'https://graph.facebook.com/v19.0';

    if (!this.accessToken || !this.accountId) {
      logger.warn('Instagram API credentials not configured. Set META_ACCESS_TOKEN and INSTAGRAM_BUSINESS_ACCOUNT_ID environment variables.');
      this.enabled = false;
      return;
    }

    this.enabled = true;
  }

  /**
   * Check if Instagram API is configured
   * @returns {boolean}
   */
  isEnabled() {
    return this.enabled;
  }

  /**
   * Make an authenticated API request to the Graph API
   * @param {string} endpoint - API endpoint
   * @param {Object} options - Fetch options
   * @returns {Promise<Object>} API response
   */
  async _request(endpoint, options = {}) {
    const url = new URL(`${this.baseUrl}${endpoint}`);

    // Add access token to all requests
    if (options.method === 'POST' && options.body) {
      const body = typeof options.body === 'string' ? JSON.parse(options.body) : options.body;
      body.access_token = this.accessToken;
      options.body = JSON.stringify(body);
    } else {
      url.searchParams.append('access_token', this.accessToken);
    }

    const response = await fetch(url.toString(), {
      ...options,
      headers: {
        'Content-Type': 'application/json',
        ...options.headers,
      },
    });

    const data = await response.json();

    if (data.error) {
      throw new Error(`Instagram API Error: ${data.error.message} (Code: ${data.error.code})`);
    }

    return data;
  }

  /**
   * Create a media container for a single image post
   * @param {Object} params - Container parameters
   * @param {string} params.imageUrl - Public URL of the image
   * @param {string} [params.caption] - Post caption
   * @returns {Promise<Object>} Container creation result with id
   */
  async createImageContainer({ imageUrl, caption }) {
    if (!this.enabled) {
      logger.info('[STUB] Instagram createImageContainer');
      return { id: 'stub-container-' + Date.now() };
    }

    const params = {
      image_url: imageUrl,
      caption: caption || '',
      access_token: this.accessToken,
    };

    const result = await this._request(`/${this.accountId}/media`, {
      method: 'POST',
      body: JSON.stringify(params),
    });

    return {
      containerId: result.id,
      status: 'READY',
    };
  }

  /**
   * Create a media container for a video/reel
   * @param {Object} params - Container parameters
   * @param {string} params.videoUrl - Public URL of the video
   * @param {string} [params.caption] - Post caption
   * @param {string} [params.mediaType] - 'REELS' for reels, default is 'VIDEO'
   * @param {string} [params.coverUrl] - Public URL of cover image for reels
   * @returns {Promise<Object>} Container creation result with id
   */
  async createVideoContainer({ videoUrl, caption, mediaType = 'VIDEO', coverUrl }) {
    if (!this.enabled) { return { id: 'stub-' + Date.now(), data: [] }; }

    const params = {
      video_url: videoUrl,
      caption: caption || '',
      media_type: mediaType === 'REELS' ? 'REELS' : undefined,
      cover_url: coverUrl,
      access_token: this.accessToken,
    };

    // Remove undefined values
    Object.keys(params).forEach(key => params[key] === undefined && delete params[key]);

    const result = await this._request(`/${this.accountId}/media`, {
      method: 'POST',
      body: JSON.stringify(params),
    });

    return {
      containerId: result.id,
      status: 'IN_PROGRESS', // Videos need processing time
    };
  }

  /**
   * Create containers for a carousel post (multiple images/videos)
   * @param {Object} params - Carousel parameters
   * @param {Array<Object>} params.children - Array of {type: 'IMAGE'|'VIDEO', url: string}
   * @param {string} [params.caption] - Post caption (only on parent)
   * @returns {Promise<Object>} Container creation result with id
   */
  async createCarouselContainer({ children, caption }) {
    if (!this.enabled) { return { id: 'stub-' + Date.now(), data: [] }; }

    // First, create child containers (without publishing)
    const childContainerIds = [];

    for (const child of children) {
      const childParams = {
        is_carousel_item: true,
        access_token: this.accessToken,
      };

      if (child.type === 'VIDEO') {
        childParams.video_url = child.url;
        childParams.media_type = 'VIDEO';
      } else {
        childParams.image_url = child.url;
      }

      const result = await this._request(`/${this.accountId}/media`, {
        method: 'POST',
        body: JSON.stringify(childParams),
      });

      childContainerIds.push(result.id);
    }

    // Then create the carousel container
    const carouselParams = {
      media_type: 'CAROUSEL',
      children: childContainerIds.join(','),
      caption: caption || '',
      access_token: this.accessToken,
    };

    const result = await this._request(`/${this.accountId}/media`, {
      method: 'POST',
      body: JSON.stringify(carouselParams),
    });

    return {
      containerId: result.id,
      childContainerIds,
      status: 'READY',
    };
  }

  /**
   * Create a story container
   * @param {Object} params - Story parameters
   * @param {string} params.mediaUrl - Public URL of the image or video
   * @param {string} params.mediaType - 'IMAGE' or 'VIDEO'
   * @returns {Promise<Object>} Container creation result with id
   */
  async createStoryContainer({ mediaUrl, mediaType }) {
    if (!this.enabled) { return { id: 'stub-' + Date.now(), data: [] }; }

    const params = {
      media_type: 'STORIES',
      access_token: this.accessToken,
    };

    if (mediaType === 'VIDEO') {
      params.video_url = mediaUrl;
    } else {
      params.image_url = mediaUrl;
    }

    const result = await this._request(`/${this.accountId}/media`, {
      method: 'POST',
      body: JSON.stringify(params),
    });

    return {
      containerId: result.id,
      status: mediaType === 'VIDEO' ? 'IN_PROGRESS' : 'READY',
    };
  }

  /**
   * Check the status of a media container (for video processing)
   * @param {string} containerId - Container ID to check
   * @returns {Promise<Object>} Container status
   */
  async getContainerStatus(containerId) {
    if (!this.enabled) { return { id: 'stub-' + Date.now(), data: [] }; }

    const result = await this._request(`/${containerId}?fields=status_code,status`);

    return {
      containerId,
      status: result.status_code || 'UNKNOWN',
      message: result.status,
    };
  }

  /**
   * Publish a media container to Instagram
   * @param {string} containerId - Container ID to publish
   * @returns {Promise<Object>} Published post info
   */
  async publishContainer(containerId) {
    if (!this.enabled) { return { id: 'stub-' + Date.now(), data: [] }; }

    const result = await this._request(`/${this.accountId}/media_publish`, {
      method: 'POST',
      body: JSON.stringify({
        creation_id: containerId,
        access_token: this.accessToken,
      }),
    });

    return {
      postId: result.id,
      success: true,
    };
  }

  /**
   * Get post details including permalink
   * @param {string} postId - Instagram post ID
   * @returns {Promise<Object>} Post details
   */
  async getPostDetails(postId) {
    if (!this.enabled) { return { id: 'stub-' + Date.now(), data: [] }; }

    const result = await this._request(
      `/${postId}?fields=id,media_type,media_url,permalink,timestamp,caption,like_count,comments_count`
    );

    return {
      id: result.id,
      mediaType: result.media_type,
      mediaUrl: result.media_url,
      permalink: result.permalink,
      timestamp: result.timestamp,
      caption: result.caption,
      likeCount: result.like_count,
      commentsCount: result.comments_count,
    };
  }

  /**
   * Get recent posts from the account
   * @param {number} limit - Maximum number of posts to fetch
   * @returns {Promise<Array>} Array of recent posts
   */
  async getRecentPosts(limit = 25) {
    if (!this.enabled) { return { id: 'stub-' + Date.now(), data: [] }; }

    const result = await this._request(
      `/${this.accountId}/media?fields=id,media_type,media_url,permalink,timestamp,caption,like_count,comments_count&limit=${limit}`
    );

    return result.data.map(post => ({
      id: post.id,
      mediaType: post.media_type,
      mediaUrl: post.media_url,
      permalink: post.permalink,
      timestamp: post.timestamp,
      caption: post.caption,
      likeCount: post.like_count,
      commentsCount: post.comments_count,
    }));
  }

  /**
   * Get account insights/metrics
   * @param {string} period - 'day', 'week', 'days_28', or 'lifetime'
   * @returns {Promise<Object>} Account metrics
   */
  async getAccountInsights(period = 'days_28') {
    if (!this.enabled) { return { id: 'stub-' + Date.now(), data: [] }; }

    const metrics = [
      'impressions',
      'reach',
      'profile_views',
      'follower_count',
    ];

    const result = await this._request(
      `/${this.accountId}/insights?metric=${metrics.join(',')}&period=${period}`
    );

    const insights = {};
    result.data.forEach(metric => {
      insights[metric.name] = metric.values[0]?.value || 0;
    });

    return insights;
  }

  /**
   * Search for hashtag suggestions based on a seed term
   * This uses the hashtag search endpoint
   * @param {string} query - Search query
   * @returns {Promise<Array>} Array of hashtag suggestions
   */
  async searchHashtags(query) {
    if (!this.enabled) { return { id: 'stub-' + Date.now(), data: [] }; }

    try {
      // Search for the hashtag ID
      const searchResult = await this._request(
        `/ig_hashtag_search?user_id=${this.accountId}&q=${encodeURIComponent(query)}`
      );

      if (!searchResult.data || searchResult.data.length === 0) {
        return [];
      }

      // Get hashtag info
      const hashtagId = searchResult.data[0].id;
      const hashtagResult = await this._request(
        `/${hashtagId}?fields=id,name,media_count`
      );

      return [{
        id: hashtagResult.id,
        name: hashtagResult.name,
        mediaCount: hashtagResult.media_count,
      }];
    } catch (error) {
      logger.error({ err: error }, 'Hashtag search error:');
      return [];
    }
  }

  /**
   * Validate that a media URL is accessible and properly formatted
   * @param {string} url - Media URL to validate
   * @returns {Promise<boolean>} Whether the URL is valid
   */
  async validateMediaUrl(url) {
    try {
      const response = await fetch(url, { method: 'HEAD' });
      return response.ok;
    } catch (error) {
      return false;
    }
  }
}

module.exports = InstagramApiService;
