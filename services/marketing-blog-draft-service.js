/**
 * Marketing Blog Draft Service
 *
 * Manages blog post drafts with AI generation, approval workflow,
 * and Webflow-compatible HTML export.
 */

const Anthropic = require('@anthropic-ai/sdk');
const { logger } = require('../utils/logger');

class MarketingBlogDraftService {
  constructor(pool) {
    this.pool = pool;

    // Initialize Anthropic for AI blog generation
    if (process.env.ANTHROPIC_API_KEY) {
      this.anthropic = new Anthropic({
        apiKey: process.env.ANTHROPIC_API_KEY,
      });
    }
  }

  /**
   * Generate a blog post using AI
   * @param {Object} params - Generation parameters
   * @param {string} params.topic - The topic or title for the blog
   * @param {string} params.targetAudience - Who the blog is for
   * @param {string} params.tone - Writing tone (professional, friendly, casual)
   * @param {number} params.wordCount - Approximate target word count
   * @param {string[]} params.keywords - SEO keywords to include
   * @returns {Promise<Object>} Generated blog content
   */
  async generateBlog(params) {
    const {
      topic,
      targetAudience = 'Parents of children ages 3-12',
      tone = 'friendly',
      wordCount = 800,
      keywords = [],
    } = params;

    if (!this.anthropic) {
      throw new Error('AI generation not available - ANTHROPIC_API_KEY not configured');
    }

    const prompt = `You are a content writer for Acme Operations, a company that teaches chess to kids ages 3-12 through storytelling and fun activities.

Write a blog post about: ${topic}

Target Audience: ${targetAudience}
Tone: ${tone}
Target Length: Approximately ${wordCount} words
SEO Keywords to include naturally: ${keywords.length > 0 ? keywords.join(', ') : 'chess for kids, learn chess, chess lessons'}

Structure your response as JSON with the following format:
{
  "title": "The blog post title",
  "seoTitle": "SEO-optimized title (max 60 chars)",
  "seoDescription": "Meta description for search engines (max 160 chars)",
  "content": "The full blog post content in Markdown format",
  "excerpt": "A 2-3 sentence excerpt/summary",
  "suggestedKeywords": ["keyword1", "keyword2", "keyword3"]
}

Guidelines:
- Make the content engaging and informative
- Include practical tips parents can use
- Reference the benefits of chess for child development
- Keep paragraphs short for easy reading
- Use headers (##) to organize content
- Include a call-to-action at the end`;

    try {
      const response = await this.anthropic.messages.create({
        model: 'claude-sonnet-4-20250514',
        max_tokens: 4096,
        messages: [{ role: 'user', content: prompt }],
      });

      // Parse Claude's response
      const content = response.content[0].text;
      const jsonMatch = content.match(/\{[\s\S]*\}/);
      if (jsonMatch) {
        return JSON.parse(jsonMatch[0]);
      }

      // Fallback if JSON parsing fails
      return {
        title: topic,
        seoTitle: topic.substring(0, 60),
        seoDescription: `Learn about ${topic} with Acme Operations.`,
        content: content,
        excerpt: content.substring(0, 200),
        suggestedKeywords: keywords,
      };
    } catch (error) {
      logger.error({ err: error }, 'Error generating blog:');
      throw error;
    }
  }

  /**
   * Create a new blog draft
   */
  async createDraft(draftData) {
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
      createdBy,
    } = draftData;

    // Generate slug if not provided
    const finalSlug = slug || this._generateSlug(title);

    const result = await this.pool.query(`
      INSERT INTO marketing_blog_drafts (
        title, slug, status, content_markdown, content_html,
        seo_title, seo_description, keywords, target_audience,
        ai_prompt, created_by, created_at, updated_at
      ) VALUES ($1, $2, 'draft', $3, $4, $5, $6, $7, $8, $9, $10, NOW(), NOW())
      RETURNING *
    `, [
      title,
      finalSlug,
      contentMarkdown,
      contentHtml || '',
      seoTitle || title?.substring(0, 255),
      seoDescription || '',
      JSON.stringify(keywords || []),
      targetAudience || '',
      aiPrompt || '',
      createdBy,
    ]);

    return result.rows[0];
  }

  /**
   * Update an existing blog draft
   */
  async updateDraft(draftId, updates) {
    const allowedFields = [
      'title', 'slug', 'status', 'content_markdown', 'content_html',
      'seo_title', 'seo_description', 'keywords', 'target_audience',
      'webflow_compatible_html',
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
      UPDATE marketing_blog_drafts
      SET ${setClause.join(', ')}
      WHERE id = $${paramIndex}
      RETURNING *
    `, values);

    return result.rows[0];
  }

  /**
   * Get a blog draft by ID
   */
  async getDraft(draftId) {
    const result = await this.pool.query(`
      SELECT * FROM marketing_blog_drafts WHERE id = $1
    `, [draftId]);
    return result.rows[0];
  }

  /**
   * List blog drafts with filtering
   */
  async listDrafts(options = {}) {
    const { status, limit = 50, offset = 0 } = options;

    let query = 'SELECT * FROM marketing_blog_drafts WHERE 1=1';
    const params = [];
    let paramIndex = 1;

    if (status) {
      query += ` AND status = $${paramIndex}`;
      params.push(status);
      paramIndex++;
    }

    query += ` ORDER BY updated_at DESC LIMIT $${paramIndex} OFFSET $${paramIndex + 1}`;
    params.push(limit, offset);

    const result = await this.pool.query(query, params);
    return result.rows;
  }

  /**
   * Submit draft for review
   */
  async submitForReview(draftId) {
    const result = await this.pool.query(`
      UPDATE marketing_blog_drafts
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
   */
  async approveDraft(draftId, reviewerEmail) {
    const result = await this.pool.query(`
      UPDATE marketing_blog_drafts
      SET
        status = 'approved',
        reviewed_by = $1,
        reviewed_at = NOW(),
        updated_at = NOW()
      WHERE id = $2 AND status = 'pending_review'
      RETURNING *
    `, [reviewerEmail, draftId]);

    if (result.rows.length === 0) {
      throw new Error('Draft not found or not pending review');
    }

    return result.rows[0];
  }

  /**
   * Reject a draft
   */
  async rejectDraft(draftId, reviewerEmail, reason) {
    const result = await this.pool.query(`
      UPDATE marketing_blog_drafts
      SET
        status = 'rejected',
        reviewed_by = $1,
        reviewed_at = NOW(),
        updated_at = NOW()
      WHERE id = $2 AND status = 'pending_review'
      RETURNING *
    `, [reviewerEmail, draftId]);

    if (result.rows.length === 0) {
      throw new Error('Draft not found or not pending review');
    }

    return result.rows[0];
  }

  /**
   * Mark draft as published
   */
  async markPublished(draftId) {
    const result = await this.pool.query(`
      UPDATE marketing_blog_drafts
      SET status = 'published', updated_at = NOW()
      WHERE id = $1 AND status = 'approved'
      RETURNING *
    `, [draftId]);

    if (result.rows.length === 0) {
      throw new Error('Draft not found or not approved');
    }

    return result.rows[0];
  }

  /**
   * Delete a draft
   */
  async deleteDraft(draftId) {
    const result = await this.pool.query(`
      DELETE FROM marketing_blog_drafts WHERE id = $1 RETURNING id
    `, [draftId]);
    return result.rowCount > 0;
  }

  /**
   * Convert markdown to Webflow-compatible HTML
   */
  async exportToWebflow(draftId) {
    const draft = await this.getDraft(draftId);
    if (!draft) {
      throw new Error('Draft not found');
    }

    // Convert markdown to clean HTML for Webflow
    const html = this._markdownToHtml(draft.content_markdown);

    // Store the Webflow-compatible HTML
    await this.pool.query(`
      UPDATE marketing_blog_drafts
      SET webflow_compatible_html = $1, updated_at = NOW()
      WHERE id = $2
    `, [html, draftId]);

    return {
      title: draft.title,
      slug: draft.slug,
      seoTitle: draft.seo_title,
      seoDescription: draft.seo_description,
      html: html,
      keywords: draft.keywords,
    };
  }

  /**
   * Generate URL-friendly slug from title
   */
  _generateSlug(title) {
    return title
      .toLowerCase()
      .replace(/[^a-z0-9\s-]/g, '')
      .replace(/\s+/g, '-')
      .replace(/-+/g, '-')
      .substring(0, 255);
  }

  /**
   * Convert markdown to clean HTML
   * Basic implementation - in production, use a library like marked
   */
  _markdownToHtml(markdown) {
    if (!markdown) return '';

    let html = markdown;

    // Headers
    html = html.replace(/^### (.*$)/gim, '<h3>$1</h3>');
    html = html.replace(/^## (.*$)/gim, '<h2>$1</h2>');
    html = html.replace(/^# (.*$)/gim, '<h1>$1</h1>');

    // Bold
    html = html.replace(/\*\*(.*?)\*\*/g, '<strong>$1</strong>');

    // Italic
    html = html.replace(/\*(.*?)\*/g, '<em>$1</em>');

    // Links
    html = html.replace(/\[([^\]]+)\]\(([^)]+)\)/g, '<a href="$2">$1</a>');

    // Unordered lists
    html = html.replace(/^\- (.*$)/gim, '<li>$1</li>');
    html = html.replace(/(<li>.*<\/li>)/s, '<ul>$1</ul>');

    // Paragraphs - wrap remaining text in p tags
    html = html.split(/\n\n/).map(para => {
      para = para.trim();
      if (!para) return '';
      if (para.startsWith('<h') || para.startsWith('<ul') || para.startsWith('<ol')) {
        return para;
      }
      return `<p>${para}</p>`;
    }).join('\n');

    // Clean up line breaks
    html = html.replace(/\n/g, '');

    return html;
  }

  /**
   * Get blog statistics
   */
  async getStats() {
    const result = await this.pool.query(`
      SELECT
        COUNT(*) FILTER (WHERE status = 'draft') as drafts,
        COUNT(*) FILTER (WHERE status = 'pending_review') as pending_review,
        COUNT(*) FILTER (WHERE status = 'approved') as approved,
        COUNT(*) FILTER (WHERE status = 'published') as published,
        COUNT(*) as total
      FROM marketing_blog_drafts
    `);
    return result.rows[0];
  }
}

module.exports = MarketingBlogDraftService;
