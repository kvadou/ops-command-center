const express = require('express');
const router = express.Router();
const { Pool } = require('pg');
const multer = require('multer');
const path = require('path');

const { asyncHandler } = require('../middleware/error-handler');
const { logger } = require('../utils/logger');

// Database connection
// Determine if SSL is needed based on whether we're connecting to AWS RDS
const needsSSL = process.env.DATABASE_URL && 
  (process.env.DATABASE_URL.includes('rds.amazonaws.com') || 
   process.env.DATABASE_URL.includes('cluster-'));

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: needsSSL ? { rejectUnauthorized: false } : false
});

// Production API URL for Knowledge Hub content sync
// Use the direct Heroku URL to avoid SSL issues with custom domains
const PRODUCTION_API_URL = process.env.PRODUCTION_API_URL || 'https://acme-ops-main-69b238e9106c.herokuapp.com';

// Helper function to check if this is a franchise site (not main/HQ)
function isFranchiseSite(req) {
  const hostname = req.get('host') || req.hostname || '';
  const subdomain = hostname.split('.')[0].toLowerCase();
  
  // These are franchise sites that should proxy to production
  const franchiseSites = ['eastside', 'westside'];
  
  // Also check for franchise-specific environment
  if (process.env.FRANCHISE_ID && process.env.FRANCHISE_ID !== 'main') {
    return true;
  }
  
  return franchiseSites.includes(subdomain);
}

// Proxy helper to fetch knowledge content from production
// Note: We don't pass auth headers for read-only requests since this is public content
async function proxyToProduction(endpoint, req) {
  try {
    const url = `${PRODUCTION_API_URL}/api/knowledge${endpoint}`;
    
    const response = await fetch(url, {
      method: 'GET',
      headers: {
        'Content-Type': 'application/json',
        // Don't pass Authorization - public knowledge content doesn't need auth
      },
    });
    
    if (!response.ok) {
      throw new Error(`Production API returned ${response.status}`);
    }
    
    return await response.json();
  } catch (error) {
    logger.error(`[Knowledge Hub] Error proxying to production: ${error.message}`);
    throw error;
  }
}

// Configure multer for memory storage (upload to Cloudinary, not disk)
const { cloudinary } = global;
const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 50 * 1024 * 1024 }, // 50MB limit
  fileFilter: (req, file, cb) => {
    const allowedTypes = /pdf|png|jpg|jpeg|gif|doc|docx|xls|xlsx|ppt|pptx/;
    const extname = allowedTypes.test(path.extname(file.originalname).toLowerCase());
    if (extname) {
      return cb(null, true);
    } else {
      cb(new Error('Only documents and images are allowed'));
    }
  }
});

// Middleware to check if user is from main branch (franchisor)
const isMainBranch = async (req, res, next) => {
  try {
    // Get the hostname from the request
    const hostname = req.get('host') || req.hostname;
    
    // Extract subdomain from hostname
    let companyName = 'Acme Operations (Main Branch)'; // Default to HQ
    
    if (hostname) {
      const subdomain = hostname.split('.')[0];
      
      switch (subdomain) {
        case 'eastside':
          companyName = 'Acme Operations Eastside';
          break;
        case 'westside':
          companyName = 'Acme Operations Westside';
          break;
        case 'join':
          companyName = 'Acme Operations (Main Branch)';
          break;
        default:
          // For localhost or other domains, check environment variable
          companyName = process.env.COMPANY_NAME || 'Acme Operations (Main Branch)';
      }
    }
    
    req.isMainBranch = companyName === 'Acme Operations (Main Branch)';
    next();
  } catch (error) {
    logger.error({ err: error }, 'Error checking branch:');
    req.isMainBranch = false;
    next();
  }
};

// Helper function to generate slug
function generateSlug(text) {
  return text
    .toLowerCase()
    .replace(/[^\w\s-]/g, '')
    .replace(/\s+/g, '-')
    .replace(/-+/g, '-')
    .trim();
}

// Helper function to extract plain text from TipTap JSON
function extractPlainText(tiptapJson) {
  if (!tiptapJson || typeof tiptapJson !== 'object') return '';
  
  let text = '';
  
  const traverse = (node) => {
    if (node.text) {
      text += node.text + ' ';
    }
    if (node.content && Array.isArray(node.content)) {
      node.content.forEach(traverse);
    }
  };
  
  traverse(tiptapJson);
  return text.trim();
}

// ==================== COLLECTIONS ====================

// GET all collections
router.get('/collections', asyncHandler(async (req, res) => {
  try {
    // Franchise sites proxy to production for read operations
    if (isFranchiseSite(req)) {
      const queryString = req.query.published_only ? `?published_only=${req.query.published_only}` : '';
      const data = await proxyToProduction(`/collections${queryString}`, req);
      return res.json(data);
    }
    
    const publishedOnly = req.query.published_only === 'true';
    
    let query = `
      SELECT 
        c.*,
        COUNT(DISTINCT a.id) as article_count
      FROM knowledge_collections c
      LEFT JOIN knowledge_articles a ON c.id = a.collection_id AND a.is_published = true
      WHERE 1=1
    `;
    
    if (publishedOnly) {
      query += ' AND c.is_published = true';
    }
    
    query += ' GROUP BY c.id ORDER BY c.display_order, c.title';
    
    const result = await pool.query(query);
    res.json({ collections: result.rows });
  } catch (error) {
    logger.error({ err: error }, 'Error fetching collections:');
    res.status(500).json({ error: 'Failed to fetch collections' });
  }
}));

// GET single collection with articles
router.get('/collections/:id', asyncHandler(async (req, res) => {
  try {
    const { id } = req.params;
    
    // Franchise sites proxy to production for read operations
    if (isFranchiseSite(req)) {
      const data = await proxyToProduction(`/collections/${id}`, req);
      return res.json(data);
    }
    
    // Check if id is numeric (ID) or string (slug)
    const isNumeric = /^\d+$/.test(id);
    const whereClause = isNumeric ? 'id = $1' : 'slug = $1';
    
    const collectionResult = await pool.query(
      `SELECT * FROM knowledge_collections WHERE ${whereClause}`,
      [id]
    );
    
    if (collectionResult.rows.length === 0) {
      return res.status(404).json({ error: 'Collection not found' });
    }
    
    const collection = collectionResult.rows[0];
    
    const articlesResult = await pool.query(
      `SELECT 
        a.*,
        COUNT(DISTINCT c.id) as comment_count
      FROM knowledge_articles a
      LEFT JOIN knowledge_comments c ON a.id = c.article_id
      WHERE a.collection_id = $1 AND a.is_published = true
      GROUP BY a.id
      ORDER BY a.display_order, a.title`,
      [collection.id]
    );
    
    res.json({
      collection: collection,
      articles: articlesResult.rows
    });
  } catch (error) {
    logger.error({ err: error }, 'Error fetching collection:');
    res.status(500).json({ error: 'Failed to fetch collection' });
  }
}));

// POST create collection (main branch only)
router.post('/collections', isMainBranch, asyncHandler(async (req, res) => {
  if (!req.isMainBranch) {
    return res.status(403).json({ error: 'Only franchisor can create collections' });
  }
  
  try {
    const { title, description, icon, display_order, is_published } = req.body;
    const slug = generateSlug(title);
    const userId = req.user?.id || null;
    
    const result = await pool.query(
      `INSERT INTO knowledge_collections 
        (title, slug, description, icon, display_order, is_published, created_by)
      VALUES ($1, $2, $3, $4, $5, $6, $7)
      RETURNING *`,
      [title, slug, description, icon, display_order || 0, is_published !== false, userId]
    );
    
    res.status(201).json({ collection: result.rows[0] });
  } catch (error) {
    logger.error({ err: error }, 'Error creating collection:');
    if (error.constraint === 'knowledge_collections_slug_key') {
      return res.status(400).json({ error: 'Collection with this title already exists' });
    }
    res.status(500).json({ error: 'Failed to create collection' });
  }
}));

// PUT update collection (main branch only)
router.put('/collections/:id', isMainBranch, asyncHandler(async (req, res) => {
  if (!req.isMainBranch) {
    return res.status(403).json({ error: 'Only franchisor can update collections' });
  }
  
  try {
    const { id } = req.params;
    const { title, description, slug: customSlug, icon, display_order, is_published } = req.body;
    // Use custom slug if provided, otherwise generate from title
    const slug = customSlug || (title ? generateSlug(title) : undefined);
    
    const updates = [];
    const values = [];
    let valueIndex = 1;
    
    if (title) {
      updates.push(`title = $${valueIndex++}`);
      values.push(title);
    }
    if (slug) {
      updates.push(`slug = $${valueIndex++}`);
      values.push(slug);
    }
    if (description !== undefined) {
      updates.push(`description = $${valueIndex++}`);
      values.push(description);
    }
    if (icon !== undefined) {
      updates.push(`icon = $${valueIndex++}`);
      values.push(icon);
    }
    if (display_order !== undefined) {
      updates.push(`display_order = $${valueIndex++}`);
      values.push(display_order);
    }
    if (is_published !== undefined) {
      updates.push(`is_published = $${valueIndex++}`);
      values.push(is_published);
    }
    
    updates.push(`updated_at = NOW()`);
    values.push(id);
    
    const result = await pool.query(
      `UPDATE knowledge_collections SET ${updates.join(', ')} WHERE id = $${valueIndex} RETURNING *`,
      values
    );
    
    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Collection not found' });
    }
    
    res.json({ collection: result.rows[0] });
  } catch (error) {
    logger.error({ err: error }, 'Error updating collection:');
    res.status(500).json({ error: 'Failed to update collection' });
  }
}));

// DELETE collection (main branch only)
router.delete('/collections/:id', isMainBranch, asyncHandler(async (req, res) => {
  if (!req.isMainBranch) {
    return res.status(403).json({ error: 'Only franchisor can delete collections' });
  }
  
  try {
    const { id } = req.params;
    const result = await pool.query(
      'DELETE FROM knowledge_collections WHERE id = $1 RETURNING id',
      [id]
    );
    
    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Collection not found' });
    }
    
    res.json({ message: 'Collection deleted successfully' });
  } catch (error) {
    logger.error({ err: error }, 'Error deleting collection:');
    res.status(500).json({ error: 'Failed to delete collection' });
  }
}));

// ==================== ARTICLES ====================

// GET all articles (with optional filters)
router.get('/articles', asyncHandler(async (req, res) => {
  try {
    // Franchise sites proxy to production for read operations
    if (isFranchiseSite(req)) {
      const params = new URLSearchParams();
      if (req.query.collection_id) params.append('collection_id', req.query.collection_id);
      if (req.query.tag) params.append('tag', req.query.tag);
      if (req.query.published_only) params.append('published_only', req.query.published_only);
      if (req.query.search) params.append('search', req.query.search);
      if (req.query.type) params.append('type', req.query.type);
      const queryString = params.toString() ? `?${params.toString()}` : '';
      const data = await proxyToProduction(`/articles${queryString}`, req);
      return res.json(data);
    }

    const { collection_id, tag, published_only, search, type } = req.query;
    
    let query = `
      SELECT 
        a.*,
        c.title as collection_title,
        c.slug as collection_slug,
        COUNT(DISTINCT comm.id) as comment_count
      FROM knowledge_articles a
      LEFT JOIN knowledge_collections c ON a.collection_id = c.id
      LEFT JOIN knowledge_comments comm ON a.id = comm.article_id
      WHERE 1=1
    `;
    const values = [];
    let valueIndex = 1;
    
    if (published_only === 'true') {
      query += ' AND a.is_published = true';
    }
    
    if (collection_id) {
      query += ` AND a.collection_id = $${valueIndex++}`;
      values.push(collection_id);
    }
    
    if (tag) {
      query += ` AND $${valueIndex++} = ANY(a.tags)`;
      values.push(tag);
    }
    
    if (search) {
      query += ` AND (a.title ILIKE $${valueIndex++} OR a.summary ILIKE $${valueIndex})`;
      values.push(`%${search}%`, `%${search}%`);
      valueIndex++;
    }

    if (type) {
      query += ` AND a.article_type = $${valueIndex++}`;
      values.push(type);
    }

    query += ' GROUP BY a.id, c.title, c.slug ORDER BY a.display_order, a.created_at DESC';
    
    const result = await pool.query(query, values);
    res.json({ articles: result.rows });
  } catch (error) {
    logger.error({ err: error }, 'Error fetching articles:');
    res.status(500).json({ error: 'Failed to fetch articles' });
  }
}));

// GET single article with sections and attachments
router.get('/articles/:id', asyncHandler(async (req, res) => {
  try {
    const { id } = req.params;
    
    // Franchise sites proxy to production for read operations
    if (isFranchiseSite(req)) {
      const data = await proxyToProduction(`/articles/${id}`, req);
      return res.json(data);
    }
    
    // Check if id is numeric (ID) or string (slug)
    const isNumeric = /^\d+$/.test(id);
    const whereClause = isNumeric ? 'a.id = $1' : 'a.slug = $1';
    
    // Get article
    const articleResult = await pool.query(
      `SELECT 
        a.*,
        c.title as collection_title,
        c.slug as collection_slug
      FROM knowledge_articles a
      LEFT JOIN knowledge_collections c ON a.collection_id = c.id
      WHERE ${whereClause}`,
      [id]
    );
    
    if (articleResult.rows.length === 0) {
      return res.status(404).json({ error: 'Article not found' });
    }
    
    const article = articleResult.rows[0];
    
    // Get sections
    const sectionsResult = await pool.query(
      'SELECT * FROM knowledge_article_sections WHERE article_id = $1 ORDER BY display_order',
      [article.id]
    );
    
    // Get attachments
    const attachmentsResult = await pool.query(
      'SELECT * FROM knowledge_attachments WHERE article_id = $1 ORDER BY display_order',
      [article.id]
    );
    
    // Increment view count
    await pool.query(
      'UPDATE knowledge_articles SET view_count = view_count + 1 WHERE id = $1',
      [article.id]
    );
    
    res.json({
      article: article,
      sections: sectionsResult.rows,
      attachments: attachmentsResult.rows
    });
  } catch (error) {
    logger.error({ err: error }, 'Error fetching article:');
    res.status(500).json({ error: 'Failed to fetch article' });
  }
}));

// POST create article (main branch only)
router.post('/articles', isMainBranch, asyncHandler(async (req, res) => {
  if (!req.isMainBranch) {
    return res.status(403).json({ error: 'Only franchisor can create articles' });
  }
  
  try {
    const {
      collection_id,
      title,
      summary,
      content,
      tags,
      video_url,
      video_provider,
      is_published,
      display_order
    } = req.body;
    
    // Validate required fields
    if (!title || !title.trim()) {
      return res.status(400).json({ error: 'Title is required' });
    }
    if (!collection_id) {
      return res.status(400).json({ error: 'Collection is required' });
    }
    
    // Ensure collection_id is a number
    const collectionIdNum = parseInt(collection_id, 10);
    if (isNaN(collectionIdNum)) {
      return res.status(400).json({ error: 'Invalid collection ID' });
    }
    
    const slug = generateSlug(title);
    const userId = req.user?.id || null;
    
    const result = await pool.query(
      `INSERT INTO knowledge_articles
        (collection_id, title, slug, summary, content, tags, video_url, video_provider,
         is_published, display_order, created_by, publish_date,
         article_type, sop_version, sop_owner, sop_required, sop_audience)
      VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17)
      RETURNING *`,
      [
        collectionIdNum,
        title.trim(),
        slug,
        summary || null,
        JSON.stringify(content || {}),
        tags || [],
        video_url || null,
        video_provider || null,
        is_published !== false,
        display_order || 0,
        userId,
        is_published !== false ? new Date() : null,
        req.body.article_type || 'article',
        req.body.sop_version || null,
        req.body.sop_owner || null,
        req.body.sop_required || false,
        req.body.sop_audience || []
      ]
    );
    
    // Update search index
    const plainText = extractPlainText(content);
    await pool.query(
      `INSERT INTO knowledge_search_index (article_id, title, content, tags, search_vector)
       VALUES ($1, $2, $3, $4, to_tsvector('english', $2 || ' ' || $3))`,
      [result.rows[0].id, title, plainText, tags?.join(' ') || '']
    );
    
    res.status(201).json({ article: result.rows[0] });
  } catch (error) {
    logger.error({ err: error }, 'Error creating article:');
    if (error.constraint === 'knowledge_articles_slug_key') {
      return res.status(400).json({ error: 'Article with this title already exists' });
    }
    res.status(500).json({ error: 'Failed to create article' });
  }
}));

// PUT update article (main branch only)
router.put('/articles/:id', isMainBranch, asyncHandler(async (req, res) => {
  if (!req.isMainBranch) {
    return res.status(403).json({ error: 'Only franchisor can update articles' });
  }
  
  try {
    const { id } = req.params;
    const {
      title,
      summary,
      content,
      tags,
      video_url,
      video_provider,
      is_published,
      display_order
    } = req.body;
    
    const userId = req.user?.id || null;
    
    const updates = [];
    const values = [];
    let valueIndex = 1;
    
    if (title) {
      updates.push(`title = $${valueIndex++}`, `slug = $${valueIndex++}`);
      values.push(title, generateSlug(title));
    }
    if (summary !== undefined) {
      updates.push(`summary = $${valueIndex++}`);
      values.push(summary);
    }
    if (content) {
      updates.push(`content = $${valueIndex++}`);
      values.push(JSON.stringify(content));
    }
    if (tags !== undefined) {
      updates.push(`tags = $${valueIndex++}`);
      values.push(tags);
    }
    if (video_url !== undefined) {
      updates.push(`video_url = $${valueIndex++}`);
      values.push(video_url);
    }
    if (video_provider !== undefined) {
      updates.push(`video_provider = $${valueIndex++}`);
      values.push(video_provider);
    }
    if (is_published !== undefined) {
      updates.push(`is_published = $${valueIndex++}`);
      values.push(is_published);
      if (is_published) {
        updates.push(`publish_date = COALESCE(publish_date, NOW())`);
      }
    }
    if (display_order !== undefined) {
      updates.push(`display_order = $${valueIndex++}`);
      values.push(display_order);
    }
    if (req.body.article_type !== undefined) {
      updates.push(`article_type = $${valueIndex++}`);
      values.push(req.body.article_type);
    }
    if (req.body.sop_version !== undefined) {
      updates.push(`sop_version = $${valueIndex++}`);
      values.push(req.body.sop_version);
    }
    if (req.body.sop_owner !== undefined) {
      updates.push(`sop_owner = $${valueIndex++}`);
      values.push(req.body.sop_owner);
    }
    if (req.body.sop_required !== undefined) {
      updates.push(`sop_required = $${valueIndex++}`);
      values.push(req.body.sop_required);
    }
    if (req.body.sop_audience !== undefined) {
      updates.push(`sop_audience = $${valueIndex++}`);
      values.push(req.body.sop_audience);
    }

    updates.push(`last_edited_by = $${valueIndex++}`, `last_edited_at = NOW()`, `updated_at = NOW()`);
    values.push(userId, id);
    
    const result = await pool.query(
      `UPDATE knowledge_articles SET ${updates.join(', ')} WHERE id = $${valueIndex} RETURNING *`,
      values
    );
    
    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Article not found' });
    }
    
    // Update search index
    if (content || title) {
      const plainText = content ? extractPlainText(content) : '';
      await pool.query(
        `UPDATE knowledge_search_index 
         SET title = COALESCE($1, title),
             content = COALESCE($2, content),
             tags = COALESCE($3, tags),
             search_vector = to_tsvector('english', COALESCE($1, title) || ' ' || COALESCE($2, content)),
             updated_at = NOW()
         WHERE article_id = $4`,
        [title, plainText, tags?.join(' '), id]
      );
    }
    
    res.json({ article: result.rows[0] });
  } catch (error) {
    logger.error({ err: error }, 'Error updating article:');
    res.status(500).json({ error: 'Failed to update article' });
  }
}));

// DELETE article (main branch only)
router.delete('/articles/:id', isMainBranch, asyncHandler(async (req, res) => {
  if (!req.isMainBranch) {
    return res.status(403).json({ error: 'Only franchisor can delete articles' });
  }
  
  try {
    const { id } = req.params;
    const result = await pool.query(
      'DELETE FROM knowledge_articles WHERE id = $1 RETURNING id',
      [id]
    );
    
    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Article not found' });
    }
    
    res.json({ message: 'Article deleted successfully' });
  } catch (error) {
    logger.error({ err: error }, 'Error deleting article:');
    res.status(500).json({ error: 'Failed to delete article' });
  }
}));

// ==================== COMMENTS ====================

// GET comments for an article
router.get('/comments', asyncHandler(async (req, res) => {
  try {
    const { article_id } = req.query;
    
    if (!article_id) {
      return res.status(400).json({ error: 'article_id is required' });
    }
    
    // Franchise sites proxy to production for read operations
    if (isFranchiseSite(req)) {
      const data = await proxyToProduction(`/comments?article_id=${article_id}`, req);
      return res.json(data);
    }
    
    const result = await pool.query(
      `SELECT * FROM knowledge_comments 
       WHERE article_id = $1 
       ORDER BY created_at ASC`,
      [article_id]
    );
    
    res.json({ comments: result.rows });
  } catch (error) {
    logger.error({ err: error }, 'Error fetching comments:');
    res.status(500).json({ error: 'Failed to fetch comments' });
  }
}));

// POST create comment
router.post('/comments', asyncHandler(async (req, res) => {
  try {
    // Franchise sites proxy comments to production
    if (isFranchiseSite(req)) {
      try {
        const token = req.headers.authorization;
        const response = await fetch(`${PRODUCTION_API_URL}/api/knowledge/comments`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            ...(token ? { 'Authorization': token } : {}),
          },
          body: JSON.stringify(req.body),
        });
        
        if (!response.ok) {
          const errorData = await response.json();
          return res.status(response.status).json(errorData);
        }
        
        const data = await response.json();
        return res.status(201).json(data);
      } catch (error) {
        logger.error({ err: error }, '[Knowledge Hub] Error proxying comment to production:');
        return res.status(500).json({ error: 'Failed to post comment' });
      }
    }
    
    const { article_id, parent_comment_id, content } = req.body;
    const userId = req.user?.id || null;
    const userName = req.user?.first_name + ' ' + req.user?.last_name || 'Anonymous';
    const userEmail = req.user?.email || '';
    
    const result = await pool.query(
      `INSERT INTO knowledge_comments 
        (article_id, parent_comment_id, user_id, user_name, user_email, content)
      VALUES ($1, $2, $3, $4, $5, $6)
      RETURNING *`,
      [article_id, parent_comment_id, userId, userName, userEmail, content]
    );
    
    res.status(201).json({ comment: result.rows[0] });
  } catch (error) {
    logger.error({ err: error }, 'Error creating comment:');
    res.status(500).json({ error: 'Failed to create comment' });
  }
}));

// PUT update comment
router.put('/comments/:id', asyncHandler(async (req, res) => {
  try {
    const { id } = req.params;
    const { content } = req.body;
    const userId = req.user?.id || null;
    
    const result = await pool.query(
      `UPDATE knowledge_comments 
       SET content = $1, is_edited = true, edited_at = NOW(), updated_at = NOW()
       WHERE id = $2 AND user_id = $3
       RETURNING *`,
      [content, id, userId]
    );
    
    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Comment not found or unauthorized' });
    }
    
    res.json({ comment: result.rows[0] });
  } catch (error) {
    logger.error({ err: error }, 'Error updating comment:');
    res.status(500).json({ error: 'Failed to update comment' });
  }
}));

// DELETE comment
router.delete('/comments/:id', asyncHandler(async (req, res) => {
  try {
    const { id } = req.params;
    const userId = req.user?.id || null;
    
    // Check if user is the comment author or is main branch
    const checkResult = await pool.query(
      'SELECT user_id FROM knowledge_comments WHERE id = $1',
      [id]
    );
    
    if (checkResult.rows.length === 0) {
      return res.status(404).json({ error: 'Comment not found' });
    }
    
    if (checkResult.rows[0].user_id !== userId && !req.isMainBranch) {
      return res.status(403).json({ error: 'Unauthorized to delete this comment' });
    }
    
    await pool.query('DELETE FROM knowledge_comments WHERE id = $1', [id]);
    res.json({ message: 'Comment deleted successfully' });
  } catch (error) {
    logger.error({ err: error }, 'Error deleting comment:');
    res.status(500).json({ error: 'Failed to delete comment' });
  }
}));

// ==================== QUESTIONS ====================

// GET questions (franchisees see their own, franchisor sees all)
router.get('/questions', isMainBranch, asyncHandler(async (req, res) => {
  try {
    const userId = req.user?.id || null;
    const { status, article_id } = req.query;
    
    let query = 'SELECT * FROM knowledge_questions WHERE 1=1';
    const values = [];
    let valueIndex = 1;
    
    // Franchisees can only see their own questions
    if (!req.isMainBranch) {
      query += ` AND user_id = $${valueIndex++}`;
      values.push(userId);
    }
    
    if (status) {
      query += ` AND status = $${valueIndex++}`;
      values.push(status);
    }
    
    if (article_id) {
      query += ` AND article_id = $${valueIndex++}`;
      values.push(article_id);
    }
    
    query += ` ORDER BY created_at DESC LIMIT $${valueIndex++}`;
    values.push(200);

    const result = await pool.query(query, values);
    res.json({ questions: result.rows });
  } catch (error) {
    logger.error({ err: error }, 'Error fetching questions:');
    res.status(500).json({ error: 'Failed to fetch questions' });
  }
}));

// POST create question
router.post('/questions', asyncHandler(async (req, res) => {
  try {
    const { article_id, subject, question, priority } = req.body;
    const userId = req.user?.id || null;
    const userName = req.user?.first_name + ' ' + req.user?.last_name || 'Anonymous';
    const userEmail = req.user?.email || '';
    
    const result = await pool.query(
      `INSERT INTO knowledge_questions 
        (article_id, user_id, user_name, user_email, subject, question, priority)
      VALUES ($1, $2, $3, $4, $5, $6, $7)
      RETURNING *`,
      [article_id, userId, userName, userEmail, subject, question, priority || 'normal']
    );
    
    res.status(201).json({ question: result.rows[0] });
  } catch (error) {
    logger.error({ err: error }, 'Error creating question:');
    res.status(500).json({ error: 'Failed to create question' });
  }
}));

// PATCH answer question (main branch only)
router.patch('/questions/:id', isMainBranch, asyncHandler(async (req, res) => {
  if (!req.isMainBranch) {
    return res.status(403).json({ error: 'Only franchisor can answer questions' });
  }
  
  try {
    const { id } = req.params;
    const { answer, status } = req.body;
    const userId = req.user?.id || null;
    
    const result = await pool.query(
      `UPDATE knowledge_questions 
       SET answer = $1, status = $2, answered_by = $3, answered_at = NOW(), updated_at = NOW()
       WHERE id = $4
       RETURNING *`,
      [answer, status || 'answered', userId, id]
    );
    
    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Question not found' });
    }
    
    res.json({ question: result.rows[0] });
  } catch (error) {
    logger.error({ err: error }, 'Error answering question:');
    res.status(500).json({ error: 'Failed to answer question' });
  }
}));

// ==================== DRAFTS ====================

// GET drafts (franchisees see their own, franchisor sees all)
router.get('/drafts', isMainBranch, asyncHandler(async (req, res) => {
  try {
    const userId = req.user?.id || null;
    const { status } = req.query;
    
    let query = 'SELECT * FROM knowledge_drafts WHERE 1=1';
    const values = [];
    let valueIndex = 1;
    
    // Franchisees can only see their own drafts
    if (!req.isMainBranch) {
      query += ` AND proposed_by = $${valueIndex++}`;
      values.push(userId);
    }
    
    if (status) {
      query += ` AND status = $${valueIndex++}`;
      values.push(status);
    }
    
    query += ` ORDER BY created_at DESC LIMIT $${valueIndex++}`;
    values.push(200);

    const result = await pool.query(query, values);
    res.json({ drafts: result.rows });
  } catch (error) {
    logger.error({ err: error }, 'Error fetching drafts:');
    res.status(500).json({ error: 'Failed to fetch drafts' });
  }
}));

// POST create draft
router.post('/drafts', asyncHandler(async (req, res) => {
  try {
    const {
      collection_id,
      article_id,
      title,
      summary,
      content,
      tags,
      video_url,
      video_provider
    } = req.body;
    
    const userId = req.user?.id || null;
    const userName = req.user?.first_name + ' ' + req.user?.last_name || 'Anonymous';
    const userEmail = req.user?.email || '';
    
    const result = await pool.query(
      `INSERT INTO knowledge_drafts 
        (collection_id, article_id, title, summary, content, tags, video_url, video_provider,
         proposed_by, proposed_by_name, proposed_by_email)
      VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)
      RETURNING *`,
      [
        collection_id,
        article_id,
        title,
        summary,
        JSON.stringify(content),
        tags || [],
        video_url,
        video_provider,
        userId,
        userName,
        userEmail
      ]
    );
    
    res.status(201).json({ draft: result.rows[0] });
  } catch (error) {
    logger.error({ err: error }, 'Error creating draft:');
    res.status(500).json({ error: 'Failed to create draft' });
  }
}));

// PATCH review draft (main branch only)
router.patch('/drafts/:id', isMainBranch, asyncHandler(async (req, res) => {
  if (!req.isMainBranch) {
    return res.status(403).json({ error: 'Only franchisor can review drafts' });
  }
  
  try {
    const { id } = req.params;
    const { status, review_notes } = req.body;
    const userId = req.user?.id || null;
    
    const result = await pool.query(
      `UPDATE knowledge_drafts 
       SET status = $1, review_notes = $2, reviewed_by = $3, reviewed_at = NOW(), updated_at = NOW()
       WHERE id = $4
       RETURNING *`,
      [status, review_notes, userId, id]
    );
    
    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Draft not found' });
    }
    
    // If approved, create the article
    if (status === 'approved') {
      const draft = result.rows[0];
      await pool.query(
        `INSERT INTO knowledge_articles 
          (collection_id, title, slug, summary, content, tags, video_url, video_provider, 
           is_published, created_by)
        VALUES ($1, $2, $3, $4, $5, $6, $7, $8, false, $9)`,
        [
          draft.collection_id,
          draft.title,
          generateSlug(draft.title),
          draft.summary,
          draft.content,
          draft.tags,
          draft.video_url,
          draft.video_provider,
          draft.proposed_by
        ]
      );
    }
    
    res.json({ draft: result.rows[0] });
  } catch (error) {
    logger.error({ err: error }, 'Error reviewing draft:');
    res.status(500).json({ error: 'Failed to review draft' });
  }
}));

// ==================== ATTACHMENTS ====================

// POST upload attachment
router.post('/attachments', upload.single('file'), asyncHandler(async (req, res) => {
  try {
    if (!req.file) {
      return res.status(400).json({ error: 'No file uploaded' });
    }

    const { article_id, collection_id, description, display_order } = req.body;
    const userId = req.user?.id || null;

    // Upload to Cloudinary
    const isImage = req.file.mimetype.startsWith('image/');
    const uploadResult = await new Promise((resolve, reject) => {
      const stream = cloudinary.uploader.upload_stream(
        { folder: 'acme-ops/knowledge-hub', resource_type: isImage ? 'image' : 'raw', use_filename: true, unique_filename: true },
        (error, result) => error ? reject(error) : resolve(result)
      );
      stream.end(req.file.buffer);
    });

    const result = await pool.query(
      `INSERT INTO knowledge_attachments
        (article_id, collection_id, file_name, file_path, file_type, file_size,
         mime_type, description, display_order, uploaded_by)
      VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)
      RETURNING *`,
      [
        article_id || null,
        collection_id || null,
        req.file.originalname,
        uploadResult.secure_url,
        path.extname(req.file.originalname).slice(1),
        req.file.size,
        req.file.mimetype,
        description,
        display_order || 0,
        userId
      ]
    );
    
    res.status(201).json({ attachment: result.rows[0] });
  } catch (error) {
    logger.error({ err: error }, 'Error uploading attachment:');
    res.status(500).json({ error: 'Failed to upload attachment' });
  }
}));

// GET download attachment
router.get('/attachments/:id/download', asyncHandler(async (req, res) => {
  try {
    const { id } = req.params;
    
    // Franchise sites redirect to production for file downloads
    if (isFranchiseSite(req)) {
      return res.redirect(`${PRODUCTION_API_URL}/api/knowledge/attachments/${id}/download`);
    }
    
    const result = await pool.query(
      'SELECT * FROM knowledge_attachments WHERE id = $1',
      [id]
    );
    
    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Attachment not found' });
    }
    
    const attachment = result.rows[0];

    // file_path is a Cloudinary URL — redirect to it
    if (attachment.file_path?.startsWith('http')) {
      return res.redirect(attachment.file_path);
    }
    // Legacy: local file path
    return res.status(404).json({ error: 'File stored on local disk and no longer available. Please re-upload.' });
  } catch (error) {
    logger.error({ err: error }, 'Error downloading attachment:');
    res.status(500).json({ error: 'Failed to download attachment' });
  }
}));

// DELETE attachment (main branch only)
router.delete('/attachments/:id', isMainBranch, asyncHandler(async (req, res) => {
  if (!req.isMainBranch) {
    return res.status(403).json({ error: 'Only franchisor can delete attachments' });
  }
  
  try {
    const { id } = req.params;
    
    const result = await pool.query(
      'DELETE FROM knowledge_attachments WHERE id = $1 RETURNING file_path',
      [id]
    );
    
    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Attachment not found' });
    }
    
    // Delete from Cloudinary
    const filePath = result.rows[0].file_path;
    if (filePath?.includes('cloudinary.com')) {
      const match = filePath.match(/\/upload\/(?:v\d+\/)?(.+?)(?:\.\w+)?$/);
      if (match) {
        const isImage = filePath.match(/\.(jpg|jpeg|png|gif|webp)$/i);
        await cloudinary.uploader.destroy(match[1], { resource_type: isImage ? 'image' : 'raw' })
          .catch(e => logger.warn({ data: e.message }, 'Cloudinary delete failed:'));
      }
    }
    
    res.json({ message: 'Attachment deleted successfully' });
  } catch (error) {
    logger.error({ err: error }, 'Error deleting attachment:');
    res.status(500).json({ error: 'Failed to delete attachment' });
  }
}));

// ==================== SEARCH ====================

// GET search
router.get('/search', asyncHandler(async (req, res) => {
  try {
    // Franchise sites proxy to production for read operations
    if (isFranchiseSite(req)) {
      const params = new URLSearchParams();
      if (req.query.q) params.append('q', req.query.q);
      if (req.query.collection_id) params.append('collection_id', req.query.collection_id);
      const queryString = params.toString() ? `?${params.toString()}` : '';
      const data = await proxyToProduction(`/search${queryString}`, req);
      return res.json(data);
    }
    
    const { q, collection_id } = req.query;
    
    if (!q) {
      return res.status(400).json({ error: 'Search query is required' });
    }
    
    // Use PostgreSQL full-text search
    let query = `
      SELECT 
        si.article_id,
        si.collection_id,
        si.title,
        si.content,
        si.tags,
        a.slug as article_slug,
        c.slug as collection_slug,
        c.title as collection_title,
        ts_rank(si.search_vector, plainto_tsquery('english', $1)) as rank
      FROM knowledge_search_index si
      LEFT JOIN knowledge_articles a ON si.article_id = a.id
      LEFT JOIN knowledge_collections c ON si.collection_id = c.id OR a.collection_id = c.id
      WHERE si.search_vector @@ plainto_tsquery('english', $1)
    `;
    
    const values = [q];
    let valueIndex = 2;
    
    if (collection_id) {
      query += ` AND (si.collection_id = $${valueIndex} OR a.collection_id = $${valueIndex})`;
      values.push(collection_id);
      valueIndex++;
    }
    
    // Only show published articles
    query += ` AND (a.is_published = true OR a.is_published IS NULL)`;
    
    query += ' ORDER BY rank DESC LIMIT 50';
    
    const result = await pool.query(query, values);
    res.json({ results: result.rows });
  } catch (error) {
    logger.error({ err: error }, 'Error searching:');
    res.status(500).json({ error: 'Failed to search' });
  }
}));

// ==================== CHECKLISTS ====================

// Helper to get franchise ID from request
function getFranchiseId(req) {
  const hostname = req.get('host') || req.hostname || '';
  const subdomain = hostname.split('.')[0].toLowerCase();
  
  if (['eastside', 'westside'].includes(subdomain)) {
    return subdomain;
  }
  
  // Check for franchise header (for API calls)
  if (req.headers['x-franchise-id']) {
    return req.headers['x-franchise-id'];
  }
  
  return 'main';
}

// GET checklist items for an article
router.get('/articles/:articleId/checklist', asyncHandler(async (req, res) => {
  try {
    const { articleId } = req.params;
    const franchiseId = getFranchiseId(req);
    
    // Franchise sites proxy to production for checklist items
    if (isFranchiseSite(req)) {
      const data = await proxyToProduction(`/articles/${articleId}/checklist`, req);
      return res.json(data);
    }
    
    // Get checklist items with progress for the requesting franchise
    const result = await pool.query(`
      SELECT 
        kci.*,
        kcp.is_completed,
        kcp.completed_by_email,
        kcp.completed_by_name,
        kcp.completed_at,
        kcp.notes as progress_notes
      FROM knowledge_checklist_items kci
      LEFT JOIN knowledge_checklist_progress kcp 
        ON kci.id = kcp.checklist_item_id 
        AND kcp.franchise_id = $2
      WHERE kci.article_id = $1
      ORDER BY kci.display_order, kci.id
    `, [articleId, franchiseId]);
    
    res.json({ 
      checklist_items: result.rows,
      franchise_id: franchiseId
    });
  } catch (error) {
    logger.error({ err: error }, 'Error fetching checklist:');
    res.status(500).json({ error: 'Failed to fetch checklist' });
  }
}));

// POST create checklist item (main branch only)
router.post('/articles/:articleId/checklist', isMainBranch, asyncHandler(async (req, res) => {
  if (!req.isMainBranch) {
    return res.status(403).json({ error: 'Only franchisor can create checklist items' });
  }
  
  try {
    const { articleId } = req.params;
    const { 
      title, 
      description, 
      help_text, 
      help_link,
      display_order, 
      is_required, 
      due_days,
      category 
    } = req.body;
    
    const result = await pool.query(`
      INSERT INTO knowledge_checklist_items 
        (article_id, title, description, help_text, help_link, display_order, is_required, due_days, category)
      VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
      RETURNING *
    `, [articleId, title, description, help_text, help_link, display_order || 0, is_required !== false, due_days, category]);
    
    res.status(201).json({ checklist_item: result.rows[0] });
  } catch (error) {
    logger.error({ err: error }, 'Error creating checklist item:');
    res.status(500).json({ error: 'Failed to create checklist item' });
  }
}));

// PUT update checklist item (main branch only)
router.put('/checklist-items/:id', isMainBranch, asyncHandler(async (req, res) => {
  if (!req.isMainBranch) {
    return res.status(403).json({ error: 'Only franchisor can update checklist items' });
  }
  
  try {
    const { id } = req.params;
    const { 
      title, 
      description, 
      help_text,
      help_link,
      display_order, 
      is_required, 
      due_days,
      category 
    } = req.body;
    
    const result = await pool.query(`
      UPDATE knowledge_checklist_items 
      SET 
        title = COALESCE($2, title),
        description = COALESCE($3, description),
        help_text = COALESCE($4, help_text),
        help_link = COALESCE($5, help_link),
        display_order = COALESCE($6, display_order),
        is_required = COALESCE($7, is_required),
        due_days = COALESCE($8, due_days),
        category = COALESCE($9, category),
        updated_at = NOW()
      WHERE id = $1
      RETURNING *
    `, [id, title, description, help_text, help_link, display_order, is_required, due_days, category]);
    
    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Checklist item not found' });
    }
    
    res.json({ checklist_item: result.rows[0] });
  } catch (error) {
    logger.error({ err: error }, 'Error updating checklist item:');
    res.status(500).json({ error: 'Failed to update checklist item' });
  }
}));

// DELETE checklist item (main branch only)
router.delete('/checklist-items/:id', isMainBranch, asyncHandler(async (req, res) => {
  if (!req.isMainBranch) {
    return res.status(403).json({ error: 'Only franchisor can delete checklist items' });
  }
  
  try {
    const { id } = req.params;
    
    const result = await pool.query(
      'DELETE FROM knowledge_checklist_items WHERE id = $1 RETURNING id',
      [id]
    );
    
    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Checklist item not found' });
    }
    
    res.json({ message: 'Checklist item deleted successfully' });
  } catch (error) {
    logger.error({ err: error }, 'Error deleting checklist item:');
    res.status(500).json({ error: 'Failed to delete checklist item' });
  }
}));

// PUT update checklist progress (franchise can update their own)
router.put('/checklist-items/:id/progress', asyncHandler(async (req, res) => {
  try {
    const { id } = req.params;
    const { is_completed, notes } = req.body;
    const franchiseId = getFranchiseId(req);
    
    // Franchise sites proxy progress updates to production
    if (isFranchiseSite(req)) {
      try {
        const token = req.headers.authorization;
        const response = await fetch(`${PRODUCTION_API_URL}/api/knowledge/checklist-items/${id}/progress`, {
          method: 'PUT',
          headers: {
            'Content-Type': 'application/json',
            'X-Franchise-Id': franchiseId,
            ...(token ? { 'Authorization': token } : {}),
          },
          body: JSON.stringify({ is_completed, notes }),
        });
        
        if (!response.ok) {
          const errorData = await response.json();
          return res.status(response.status).json(errorData);
        }
        
        const data = await response.json();
        return res.json(data);
      } catch (error) {
        logger.error({ err: error }, '[Knowledge Hub] Error proxying progress update:');
        return res.status(500).json({ error: 'Failed to update progress' });
      }
    }
    
    // Get user info from request
    const userEmail = req.user?.email || 'unknown';
    const userName = req.user?.first_name && req.user?.last_name 
      ? `${req.user.first_name} ${req.user.last_name}`
      : req.user?.email?.split('@')[0] || 'Unknown User';
    
    // Upsert progress record
    const result = await pool.query(`
      INSERT INTO knowledge_checklist_progress 
        (checklist_item_id, franchise_id, is_completed, completed_by_email, completed_by_name, completed_at, notes, updated_at)
      VALUES ($1, $2, $3, $4, $5, $6, $7, NOW())
      ON CONFLICT (checklist_item_id, franchise_id) 
      DO UPDATE SET 
        is_completed = $3,
        completed_by_email = CASE WHEN $3 THEN $4 ELSE knowledge_checklist_progress.completed_by_email END,
        completed_by_name = CASE WHEN $3 THEN $5 ELSE knowledge_checklist_progress.completed_by_name END,
        completed_at = CASE WHEN $3 THEN $6 ELSE knowledge_checklist_progress.completed_at END,
        notes = COALESCE($7, knowledge_checklist_progress.notes),
        updated_at = NOW()
      RETURNING *
    `, [
      id, 
      franchiseId, 
      is_completed, 
      userEmail, 
      userName, 
      is_completed ? new Date() : null,
      notes
    ]);
    
    res.json({ 
      progress: result.rows[0],
      franchise_id: franchiseId
    });
  } catch (error) {
    logger.error({ err: error }, 'Error updating checklist progress:');
    res.status(500).json({ error: 'Failed to update progress' });
  }
}));

// ==================== FRANCHISE PROGRESS (HQ ONLY) ====================

// GET all franchise progress summary (main branch only)
router.get('/franchise-progress', isMainBranch, asyncHandler(async (req, res) => {
  if (!req.isMainBranch) {
    return res.status(403).json({ error: 'Only franchisor can view franchise progress' });
  }
  
  try {
    // Get overall progress for each franchise
    const summaryResult = await pool.query(`
      SELECT 
        fo.franchise_id,
        fo.franchise_name,
        fo.owner_name,
        fo.owner_email,
        fo.start_date,
        fo.target_completion_date,
        fo.status as onboarding_status,
        fo.completed_at,
        COUNT(DISTINCT kci.id) as total_items,
        COUNT(DISTINCT CASE WHEN kcp.is_completed THEN kci.id END) as completed_items,
        ROUND(
          (COUNT(DISTINCT CASE WHEN kcp.is_completed THEN kci.id END)::DECIMAL / 
           NULLIF(COUNT(DISTINCT kci.id), 0)) * 100, 1
        ) as completion_percentage,
        MAX(kcp.completed_at) as last_activity
      FROM franchise_onboarding fo
      CROSS JOIN knowledge_checklist_items kci
      LEFT JOIN knowledge_checklist_progress kcp 
        ON kci.id = kcp.checklist_item_id 
        AND fo.franchise_id = kcp.franchise_id
      GROUP BY fo.franchise_id, fo.franchise_name, fo.owner_name, fo.owner_email, 
               fo.start_date, fo.target_completion_date, fo.status, fo.completed_at
      ORDER BY fo.franchise_name
    `);
    
    res.json({ franchises: summaryResult.rows });
  } catch (error) {
    logger.error({ err: error }, 'Error fetching franchise progress:');
    res.status(500).json({ error: 'Failed to fetch franchise progress' });
  }
}));

// GET detailed progress for a specific franchise (main branch only)
router.get('/franchise-progress/:franchiseId', isMainBranch, asyncHandler(async (req, res) => {
  if (!req.isMainBranch) {
    return res.status(403).json({ error: 'Only franchisor can view franchise progress' });
  }
  
  try {
    const { franchiseId } = req.params;
    
    // Get franchise info
    const franchiseResult = await pool.query(
      'SELECT * FROM franchise_onboarding WHERE franchise_id = $1',
      [franchiseId]
    );
    
    if (franchiseResult.rows.length === 0) {
      return res.status(404).json({ error: 'Franchise not found' });
    }
    
    // Get all checklist items with progress for this franchise
    const progressResult = await pool.query(`
      SELECT 
        kci.*,
        ka.title as article_title,
        ka.slug as article_slug,
        kc.title as collection_title,
        kcp.is_completed,
        kcp.completed_by_email,
        kcp.completed_by_name,
        kcp.completed_at,
        kcp.notes as progress_notes
      FROM knowledge_checklist_items kci
      LEFT JOIN knowledge_articles ka ON kci.article_id = ka.id
      LEFT JOIN knowledge_collections kc ON ka.collection_id = kc.id
      LEFT JOIN knowledge_checklist_progress kcp 
        ON kci.id = kcp.checklist_item_id 
        AND kcp.franchise_id = $1
      ORDER BY kc.display_order, ka.display_order, kci.display_order, kci.id
    `, [franchiseId]);
    
    // Group by article
    const byArticle = {};
    progressResult.rows.forEach(item => {
      const articleKey = item.article_id;
      if (!byArticle[articleKey]) {
        byArticle[articleKey] = {
          article_id: item.article_id,
          article_title: item.article_title,
          article_slug: item.article_slug,
          collection_title: item.collection_title,
          items: [],
          completed_count: 0,
          total_count: 0
        };
      }
      byArticle[articleKey].items.push(item);
      byArticle[articleKey].total_count++;
      if (item.is_completed) {
        byArticle[articleKey].completed_count++;
      }
    });
    
    res.json({ 
      franchise: franchiseResult.rows[0],
      progress_by_article: Object.values(byArticle),
      total_items: progressResult.rows.length,
      completed_items: progressResult.rows.filter(r => r.is_completed).length
    });
  } catch (error) {
    logger.error({ err: error }, 'Error fetching franchise progress:');
    res.status(500).json({ error: 'Failed to fetch franchise progress' });
  }
}));

// PUT update franchise onboarding info (main branch only)
router.put('/franchise-onboarding/:franchiseId', isMainBranch, asyncHandler(async (req, res) => {
  if (!req.isMainBranch) {
    return res.status(403).json({ error: 'Only franchisor can update franchise info' });
  }
  
  try {
    const { franchiseId } = req.params;
    const { 
      franchise_name, 
      owner_name, 
      owner_email,
      start_date, 
      target_completion_date,
      status,
      notes 
    } = req.body;
    
    const result = await pool.query(`
      INSERT INTO franchise_onboarding 
        (franchise_id, franchise_name, owner_name, owner_email, start_date, target_completion_date, status, notes)
      VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
      ON CONFLICT (franchise_id) 
      DO UPDATE SET 
        franchise_name = COALESCE($2, franchise_onboarding.franchise_name),
        owner_name = COALESCE($3, franchise_onboarding.owner_name),
        owner_email = COALESCE($4, franchise_onboarding.owner_email),
        start_date = COALESCE($5, franchise_onboarding.start_date),
        target_completion_date = COALESCE($6, franchise_onboarding.target_completion_date),
        status = COALESCE($7, franchise_onboarding.status),
        notes = COALESCE($8, franchise_onboarding.notes),
        completed_at = CASE WHEN $7 = 'completed' THEN NOW() ELSE franchise_onboarding.completed_at END,
        updated_at = NOW()
      RETURNING *
    `, [franchiseId, franchise_name, owner_name, owner_email, start_date, target_completion_date, status, notes]);
    
    res.json({ franchise: result.rows[0] });
  } catch (error) {
    logger.error({ err: error }, 'Error updating franchise onboarding:');
    res.status(500).json({ error: 'Failed to update franchise info' });
  }
}));

// POST bulk create checklist items for an article (main branch only)
router.post('/articles/:articleId/checklist/bulk', isMainBranch, asyncHandler(async (req, res) => {
  if (!req.isMainBranch) {
    return res.status(403).json({ error: 'Only franchisor can create checklist items' });
  }
  
  try {
    const { articleId } = req.params;
    const { items } = req.body; // Array of checklist items
    
    if (!Array.isArray(items) || items.length === 0) {
      return res.status(400).json({ error: 'Items array is required' });
    }
    
    const createdItems = [];
    
    for (let i = 0; i < items.length; i++) {
      const item = items[i];
      const result = await pool.query(`
        INSERT INTO knowledge_checklist_items 
          (article_id, title, description, help_text, help_link, display_order, is_required, due_days, category)
        VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
        RETURNING *
      `, [
        articleId, 
        item.title, 
        item.description, 
        item.help_text, 
        item.help_link,
        item.display_order ?? i, 
        item.is_required !== false, 
        item.due_days,
        item.category
      ]);
      createdItems.push(result.rows[0]);
    }
    
    res.status(201).json({ checklist_items: createdItems });
  } catch (error) {
    logger.error({ err: error }, 'Error bulk creating checklist items:');
    res.status(500).json({ error: 'Failed to create checklist items' });
  }
}));

// PUT reorder checklist items (main branch only)
router.put('/articles/:articleId/checklist/reorder', isMainBranch, asyncHandler(async (req, res) => {
  if (!req.isMainBranch) {
    return res.status(403).json({ error: 'Only franchisor can reorder checklist items' });
  }
  
  try {
    const { articleId } = req.params;
    const { item_ids } = req.body; // Array of item IDs in new order
    
    if (!Array.isArray(item_ids)) {
      return res.status(400).json({ error: 'item_ids array is required' });
    }
    
    // Update display_order for each item
    for (let i = 0; i < item_ids.length; i++) {
      await pool.query(
        'UPDATE knowledge_checklist_items SET display_order = $1, updated_at = NOW() WHERE id = $2 AND article_id = $3',
        [i, item_ids[i], articleId]
      );
    }
    
    // Return updated items
    const result = await pool.query(
      'SELECT * FROM knowledge_checklist_items WHERE article_id = $1 ORDER BY display_order',
      [articleId]
    );
    
    res.json({ checklist_items: result.rows });
  } catch (error) {
    logger.error({ err: error }, 'Error reordering checklist items:');
    res.status(500).json({ error: 'Failed to reorder checklist items' });
  }
}));

// ==================== SOP LIBRARY ====================

// GET /sops — public endpoint for SOP library (no auth required)
// Franchise sites proxy to production HQ for consistent SOP content
router.get('/sops', asyncHandler(async (req, res) => {
  try {
    if (isFranchiseSite(req)) {
      const params = new URLSearchParams();
      if (req.query.category) params.append('category', req.query.category);
      if (req.query.search) params.append('search', req.query.search);
      if (req.query.audience) params.append('audience', req.query.audience);
      const queryString = params.toString() ? `?${params.toString()}` : '';
      const data = await proxyToProduction(`/sops${queryString}`, req);
      return res.json(data);
    }

    const { category, search, audience } = req.query;

    let query = `
      SELECT
        a.id,
        a.title,
        a.slug,
        a.summary,
        a.content,
        a.tags,
        a.article_type,
        a.sop_version,
        a.sop_owner,
        a.sop_required,
        a.sop_audience,
        a.updated_at,
        a.view_count,
        c.title as collection_title,
        c.slug as collection_slug,
        c.id as collection_id
      FROM knowledge_articles a
      LEFT JOIN knowledge_collections c ON a.collection_id = c.id
      WHERE a.article_type = 'sop'
        AND a.is_published = true
    `;
    const values = [];
    let valueIndex = 1;

    if (category) {
      query += ` AND c.slug = $${valueIndex++}`;
      values.push(category);
    }

    if (search) {
      query += ` AND (a.title ILIKE $${valueIndex++} OR a.summary ILIKE $${valueIndex})`;
      values.push(`%${search}%`, `%${search}%`);
      valueIndex++;
    }

    if (audience) {
      query += ` AND ($${valueIndex++} = ANY(a.sop_audience) OR 'all' = ANY(a.sop_audience))`;
      values.push(audience);
    }

    query += ' ORDER BY a.sop_required DESC, c.title, a.display_order, a.title';

    const result = await pool.query(query, values);
    res.json({ sops: result.rows });
  } catch (error) {
    logger.error({ err: error }, 'Error fetching SOPs:');
    res.status(500).json({ error: 'Failed to fetch SOPs' });
  }
}));

module.exports = router;

