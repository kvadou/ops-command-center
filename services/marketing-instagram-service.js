/**
 * Marketing Instagram Service
 *
 * Manages Instagram post drafts with AI-powered caption and hashtag generation,
 * approval workflow, and scheduled publishing.
 */

const Anthropic = require('@anthropic-ai/sdk');
const InstagramApiService = require('./instagram-api');
const { logger } = require('../utils/logger');

class MarketingInstagramService {
  constructor(pool) {
    this.pool = pool;
    this.instagramApi = new InstagramApiService();

    // Initialize Anthropic for AI generation
    if (process.env.ANTHROPIC_API_KEY) {
      this.anthropic = new Anthropic({
        apiKey: process.env.ANTHROPIC_API_KEY,
      });
    }
  }

  /**
   * Check if Instagram API is enabled
   * @returns {boolean}
   */
  isInstagramEnabled() {
    return this.instagramApi.isEnabled();
  }

  /**
   * Generate caption with AI
   * @param {Object} params - Generation parameters
   * @param {string} params.description - Brief description of the content
   * @param {string} params.mediaType - 'image', 'carousel', 'reel', or 'story'
   * @param {string} [params.tone] - Writing tone (fun, professional, casual)
   * @param {boolean} [params.includeEmojis] - Whether to include emojis
   * @returns {Promise<Object>} Generated caption and hashtags
   */
  async generateCaption(params) {
    const {
      description,
      mediaType,
      tone = 'fun',
      includeEmojis = true,
    } = params;

    if (!this.anthropic) {
      throw new Error('AI generation not available - ANTHROPIC_API_KEY not configured');
    }

    const prompt = `You are a social media manager for Acme Operations, a company that teaches chess to kids ages 3-12 through storytelling and fun activities.

Generate an Instagram ${mediaType} caption for the following content:
${description}

Guidelines:
- Tone: ${tone}
- Target audience: Parents of young children (ages 3-12)
- ${includeEmojis ? 'Include relevant emojis throughout' : 'Do not include emojis'}
- Keep it engaging and conversational
- Include a call-to-action when appropriate
- For reels: Keep it punchy and attention-grabbing
- For stories: Keep it brief and action-oriented
- For carousels: Encourage swiping through

Also suggest 20-30 relevant hashtags that will increase reach. Include:
- Brand hashtags: #AcmeOperations #ChessForKids #LearnChess
- Educational hashtags: #KidsEducation #STEMforKids #CriticalThinking
- Parenting hashtags: #ParentingTips #KidsActivities
- Trending/popular hashtags in the chess/education space

Return your response as JSON:
{
  "caption": "The generated caption text",
  "hashtags": ["hashtag1", "hashtag2", ...]
}`;

    try {
      const response = await this.anthropic.messages.create({
        model: 'claude-sonnet-4-20250514',
        max_tokens: 1024,
        messages: [{ role: 'user', content: prompt }],
      });

      const content = response.content[0].text;
      const jsonMatch = content.match(/\{[\s\S]*\}/);

      if (jsonMatch) {
        return JSON.parse(jsonMatch[0]);
      }

      // Fallback if JSON parsing fails
      return {
        caption: content,
        hashtags: ['AcmeOperations', 'ChessForKids', 'LearnChess'],
      };
    } catch (error) {
      logger.error({ err: error }, 'Error generating caption:');
      throw error;
    }
  }

  /**
   * Create a new Instagram post draft
   * @param {Object} draftData - Draft data
   * @returns {Promise<Object>} Created draft
   */
  async createDraft(draftData) {
    const {
      postType,
      caption,
      hashtags = [],
      mediaUrls = [],
      mediaFiles = [],
      scheduledAt,
      createdBy,
    } = draftData;

    const result = await this.pool.query(`
      INSERT INTO marketing_instagram_posts (
        post_type, status, caption, hashtags, media_urls, media_files,
        scheduled_at, created_by, created_at, updated_at
      ) VALUES ($1, 'draft', $2, $3, $4, $5, $6, $7, NOW(), NOW())
      RETURNING *
    `, [
      postType,
      caption || '',
      JSON.stringify(hashtags),
      JSON.stringify(mediaUrls),
      JSON.stringify(mediaFiles),
      scheduledAt || null,
      createdBy,
    ]);

    return result.rows[0];
  }

  /**
   * Update an existing draft
   * @param {number} draftId - Draft ID
   * @param {Object} updates - Fields to update
   * @returns {Promise<Object>} Updated draft
   */
  async updateDraft(draftId, updates) {
    const allowedFields = [
      'post_type', 'status', 'caption', 'hashtags', 'media_urls', 'media_files',
      'scheduled_at', 'ai_generated_caption', 'ai_generated_hashtags',
    ];

    const setClause = [];
    const values = [];
    let paramIndex = 1;

    for (const [key, value] of Object.entries(updates)) {
      const dbKey = key.replace(/([A-Z])/g, '_$1').toLowerCase();
      if (allowedFields.includes(dbKey)) {
        setClause.push(`${dbKey} = $${paramIndex}`);
        values.push(typeof value === 'object' ? JSON.stringify(value) : value);
        paramIndex++;
      }
    }

    if (setClause.length === 0) {
      throw new Error('No valid fields to update');
    }

    setClause.push(`updated_at = NOW()`);
    values.push(draftId);

    const result = await this.pool.query(`
      UPDATE marketing_instagram_posts
      SET ${setClause.join(', ')}
      WHERE id = $${paramIndex}
      RETURNING *
    `, values);

    return result.rows[0];
  }

  /**
   * Get a draft by ID
   * @param {number} draftId - Draft ID
   * @returns {Promise<Object>} Draft data
   */
  async getDraft(draftId) {
    const result = await this.pool.query(`
      SELECT * FROM marketing_instagram_posts WHERE id = $1
    `, [draftId]);
    return result.rows[0];
  }

  /**
   * List drafts with filtering
   * @param {Object} options - List options
   * @returns {Promise<Array>} Array of drafts
   */
  async listDrafts(options = {}) {
    const { status, postType, limit = 50, offset = 0 } = options;

    let query = 'SELECT * FROM marketing_instagram_posts WHERE 1=1';
    const params = [];
    let paramIndex = 1;

    if (status) {
      query += ` AND status = $${paramIndex}`;
      params.push(status);
      paramIndex++;
    }

    if (postType) {
      query += ` AND post_type = $${paramIndex}`;
      params.push(postType);
      paramIndex++;
    }

    query += ` ORDER BY COALESCE(scheduled_at, created_at) DESC LIMIT $${paramIndex} OFFSET $${paramIndex + 1}`;
    params.push(limit, offset);

    const result = await this.pool.query(query, params);
    return result.rows;
  }

  /**
   * Get posts scheduled for publishing
   * @returns {Promise<Array>} Array of posts ready to publish
   */
  async getScheduledForPublishing() {
    const result = await this.pool.query(`
      SELECT * FROM marketing_instagram_posts
      WHERE status = 'scheduled'
        AND scheduled_at <= NOW()
      ORDER BY scheduled_at ASC
    `);
    return result.rows;
  }

  /**
   * Submit draft for review
   * @param {number} draftId - Draft ID
   * @returns {Promise<Object>} Updated draft
   */
  async submitForReview(draftId) {
    const result = await this.pool.query(`
      UPDATE marketing_instagram_posts
      SET status = 'pending_review', updated_at = NOW()
      WHERE id = $1 AND status = 'draft'
      RETURNING *
    `, [draftId]);

    if (result.rows.length === 0) {
      throw new Error('Draft not found or not in draft status');
    }

    return result.rows[0];
  }

  /**
   * Approve a draft
   * @param {number} draftId - Draft ID
   * @param {string} approverEmail - Email of approver
   * @returns {Promise<Object>} Updated draft
   */
  async approveDraft(draftId, approverEmail) {
    const draft = await this.getDraft(draftId);
    if (!draft) throw new Error('Draft not found');
    if (draft.status !== 'pending_review') throw new Error('Draft not pending review');

    // If has scheduled time, set to scheduled; otherwise just approved
    const newStatus = draft.scheduled_at ? 'scheduled' : 'approved';

    const result = await this.pool.query(`
      UPDATE marketing_instagram_posts
      SET
        status = $1,
        approved_by = $2,
        approved_at = NOW(),
        updated_at = NOW()
      WHERE id = $3
      RETURNING *
    `, [newStatus, approverEmail, draftId]);

    return result.rows[0];
  }

  /**
   * Reject a draft
   * @param {number} draftId - Draft ID
   * @param {string} reason - Rejection reason
   * @returns {Promise<Object>} Updated draft (back to draft status)
   */
  async rejectDraft(draftId, reason) {
    const result = await this.pool.query(`
      UPDATE marketing_instagram_posts
      SET
        status = 'draft',
        error_message = $1,
        updated_at = NOW()
      WHERE id = $2 AND status = 'pending_review'
      RETURNING *
    `, [reason || 'Rejected', draftId]);

    if (result.rows.length === 0) {
      throw new Error('Draft not found or not pending review');
    }

    return result.rows[0];
  }

  /**
   * Schedule a draft for publishing
   * @param {number} draftId - Draft ID
   * @param {Date|string} scheduledAt - When to publish
   * @returns {Promise<Object>} Updated draft
   */
  async scheduleDraft(draftId, scheduledAt) {
    const draft = await this.getDraft(draftId);
    if (!draft) throw new Error('Draft not found');
    if (!['draft', 'approved'].includes(draft.status)) {
      throw new Error('Only draft or approved posts can be scheduled');
    }

    const result = await this.pool.query(`
      UPDATE marketing_instagram_posts
      SET
        status = 'scheduled',
        scheduled_at = $1,
        updated_at = NOW()
      WHERE id = $2
      RETURNING *
    `, [scheduledAt, draftId]);

    return result.rows[0];
  }

  /**
   * Publish a post to Instagram
   * @param {number} draftId - Draft ID
   * @returns {Promise<Object>} Published post details
   */
  async publishPost(draftId) {
    if (!this.instagramApi.isEnabled()) {
      throw new Error('Instagram API not configured');
    }

    const draft = await this.getDraft(draftId);
    if (!draft) throw new Error('Draft not found');
    if (!['approved', 'scheduled'].includes(draft.status)) {
      throw new Error('Post must be approved or scheduled to publish');
    }

    // Mark as publishing
    await this.pool.query(`
      UPDATE marketing_instagram_posts
      SET status = 'publishing', updated_at = NOW()
      WHERE id = $1
    `, [draftId]);

    try {
      let containerId;
      const fullCaption = this._buildCaption(draft);
      const mediaUrls = draft.media_urls || [];

      // Create container based on post type
      switch (draft.post_type) {
        case 'image':
          if (mediaUrls.length === 0) throw new Error('No media URL provided');
          const imageResult = await this.instagramApi.createImageContainer({
            imageUrl: mediaUrls[0],
            caption: fullCaption,
          });
          containerId = imageResult.containerId;
          break;

        case 'carousel':
          if (mediaUrls.length < 2) throw new Error('Carousel requires at least 2 media items');
          const children = mediaUrls.map(url => ({
            type: this._detectMediaType(url),
            url,
          }));
          const carouselResult = await this.instagramApi.createCarouselContainer({
            children,
            caption: fullCaption,
          });
          containerId = carouselResult.containerId;
          break;

        case 'reel':
          if (mediaUrls.length === 0) throw new Error('No video URL provided');
          const reelResult = await this.instagramApi.createVideoContainer({
            videoUrl: mediaUrls[0],
            caption: fullCaption,
            mediaType: 'REELS',
          });
          containerId = reelResult.containerId;

          // Wait for video processing (poll status)
          await this._waitForContainerReady(containerId);
          break;

        case 'story':
          if (mediaUrls.length === 0) throw new Error('No media URL provided');
          const storyResult = await this.instagramApi.createStoryContainer({
            mediaUrl: mediaUrls[0],
            mediaType: this._detectMediaType(mediaUrls[0]),
          });
          containerId = storyResult.containerId;

          // Wait for processing if video
          if (this._detectMediaType(mediaUrls[0]) === 'VIDEO') {
            await this._waitForContainerReady(containerId);
          }
          break;

        default:
          throw new Error(`Unsupported post type: ${draft.post_type}`);
      }

      // Publish the container
      const publishResult = await this.instagramApi.publishContainer(containerId);

      // Get post details
      const postDetails = await this.instagramApi.getPostDetails(publishResult.postId);

      // Update draft with published info
      const result = await this.pool.query(`
        UPDATE marketing_instagram_posts
        SET
          status = 'published',
          instagram_post_id = $1,
          instagram_permalink = $2,
          published_at = NOW(),
          updated_at = NOW()
        WHERE id = $3
        RETURNING *
      `, [postDetails.id, postDetails.permalink, draftId]);

      return result.rows[0];
    } catch (error) {
      // Mark as failed
      await this.pool.query(`
        UPDATE marketing_instagram_posts
        SET status = 'failed', error_message = $1, updated_at = NOW()
        WHERE id = $2
      `, [error.message, draftId]);

      throw error;
    }
  }

  /**
   * Build full caption with hashtags
   * @param {Object} draft - Draft data
   * @returns {string} Full caption
   */
  _buildCaption(draft) {
    let caption = draft.caption || '';
    const hashtags = draft.hashtags || [];

    if (hashtags.length > 0) {
      const hashtagString = hashtags
        .map(tag => tag.startsWith('#') ? tag : `#${tag}`)
        .join(' ');
      caption = caption ? `${caption}\n\n${hashtagString}` : hashtagString;
    }

    return caption;
  }

  /**
   * Detect media type from URL
   * @param {string} url - Media URL
   * @returns {string} 'IMAGE' or 'VIDEO'
   */
  _detectMediaType(url) {
    const videoExtensions = ['.mp4', '.mov', '.avi', '.webm'];
    const lowerUrl = url.toLowerCase();
    return videoExtensions.some(ext => lowerUrl.includes(ext)) ? 'VIDEO' : 'IMAGE';
  }

  /**
   * Wait for a video container to finish processing
   * @param {string} containerId - Container ID
   * @param {number} maxAttempts - Maximum polling attempts
   * @param {number} intervalMs - Polling interval in ms
   */
  async _waitForContainerReady(containerId, maxAttempts = 30, intervalMs = 5000) {
    for (let attempt = 0; attempt < maxAttempts; attempt++) {
      const status = await this.instagramApi.getContainerStatus(containerId);

      if (status.status === 'FINISHED') {
        return;
      }

      if (status.status === 'ERROR') {
        throw new Error(`Container processing failed: ${status.message}`);
      }

      // Wait before next poll
      await new Promise(resolve => setTimeout(resolve, intervalMs));
    }

    throw new Error('Container processing timed out');
  }

  /**
   * Delete a draft
   * @param {number} draftId - Draft ID
   * @returns {Promise<boolean>} Success status
   */
  async deleteDraft(draftId) {
    const result = await this.pool.query(`
      DELETE FROM marketing_instagram_posts WHERE id = $1 RETURNING id
    `, [draftId]);
    return result.rowCount > 0;
  }

  /**
   * Get post statistics
   * @returns {Promise<Object>} Stats by status
   */
  async getStats() {
    const result = await this.pool.query(`
      SELECT
        COUNT(*) FILTER (WHERE status = 'draft') as drafts,
        COUNT(*) FILTER (WHERE status = 'pending_review') as pending_review,
        COUNT(*) FILTER (WHERE status = 'approved') as approved,
        COUNT(*) FILTER (WHERE status = 'scheduled') as scheduled,
        COUNT(*) FILTER (WHERE status = 'published') as published,
        COUNT(*) FILTER (WHERE status = 'failed') as failed,
        COUNT(*) as total
      FROM marketing_instagram_posts
    `);
    return result.rows[0];
  }

  /**
   * Get upcoming scheduled posts
   * @param {number} days - Number of days ahead to look
   * @returns {Promise<Array>} Scheduled posts
   */
  async getUpcomingScheduled(days = 7) {
    const result = await this.pool.query(`
      SELECT * FROM marketing_instagram_posts
      WHERE status = 'scheduled'
        AND scheduled_at > NOW()
        AND scheduled_at < NOW() + INTERVAL '${days} days'
      ORDER BY scheduled_at ASC
    `);
    return result.rows;
  }
}

module.exports = MarketingInstagramService;
