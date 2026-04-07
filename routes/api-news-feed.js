const express = require('express');
const multer = require('multer');
const router = express.Router();
const { requireAuth } = require('../middleware/auth');
const { requireRole, requireAdmin } = require('../middleware/rbac');
const { getPool: getPoolByEnv } = require('../database-connections');
const { asyncHandler } = require('../middleware/error-handler');
const { logger } = require('../utils/logger');

// Configure multer for file uploads
const upload = multer({
  storage: multer.memoryStorage(),
  limits: {
    fileSize: 50 * 1024 * 1024 // 50MB limit for videos
  }
});

// Import WebSocket for real-time updates (will be available after server starts)
const getWebSocket = () => global.websocket || null;

// Helper function to get pool from request or determine environment
function getPool(req) {
  // Try to get pool from request (set by location-db middleware)
  if (req.locationPool) {
    return req.locationPool;
  }

  // Fallback: determine environment from request or use local
  const hostname = req.get('host') || req.hostname || '';
  let env = 'local';

  if (hostname.includes('eastside')) {
    env = 'eastside';
  } else if (hostname.includes('westside')) {
    env = 'westside';
  } else if (process.env.NODE_ENV === 'production' || hostname.includes('herokuapp.com')) {
    env = 'production';
  } else if (process.env.NODE_ENV === 'staging') {
    env = 'staging';
  }

  return getPoolByEnv(env);
}

/**
 * News Feed API Routes
 * 
 * Handles:
 * - Creating and managing posts
 * - Comments on posts
 * - Reactions (likes, etc.)
 * - Visibility filtering based on role and branch
 */

// Get all posts (filtered by visibility and role)
router.get('/posts', requireAuth, asyncHandler(async (req, res) => {
  try {
    const pool = getPool(req);
    const {
      page = 1,
      limit = 20,
      visibility,
      branch_id
    } = req.query;

    const offset = (page - 1) * limit;
    // Get role from query param (set by frontend based on role context) or default to admin
    const userRole = req.query.role || req.user?.role || 'admin';
    const userBranch = req.query.branch_id || req.user?.branch_id || branch_id;
    const currentUserId = req.user?.id?.toString() || req.user?.email || null;

    // Build WHERE clause based on visibility and role
    let whereConditions = ['p.deleted_at IS NULL'];
    let queryParams = [];
    let paramCount = 0;

    // Visibility filtering based on role
    if (userRole === 'tutor' || userRole === 'client' || userRole === 'student') {
      // Limited visibility users can only see 'tutors' or 'public' posts
      whereConditions.push(`p.visibility_level IN ('tutors', 'public')`);
    } else {
      // Admin/operations can see all posts
      if (visibility) {
        paramCount++;
        whereConditions.push(`p.visibility_level = $${paramCount}`);
        queryParams.push(visibility);
      }
    }

    // Branch filtering
    if (userBranch && userBranch !== 'main') {
      paramCount++;
      whereConditions.push(`(p.branch_id = $${paramCount} OR p.branch_id IS NULL OR $${paramCount} = ANY(p.target_branches::text[]))`);
      queryParams.push(userBranch);
    }

    const whereClause = whereConditions.length > 0 ? 'WHERE ' + whereConditions.join(' AND ') : '';

    // Build user_reacted subquery separately to avoid parameter conflicts
    let userReactedQuery = '';
    if (currentUserId) {
      paramCount++;
      userReactedQuery = `, EXISTS(
        SELECT 1 FROM news_feed_reactions r
        WHERE r.post_id = p.id AND r.user_id = $${paramCount}
      ) as user_reacted`;
      queryParams.push(currentUserId);
    } else {
      userReactedQuery = ', false as user_reacted';
    }

    // Add limit and offset
    const limitParam = paramCount + 1;
    const offsetParam = paramCount + 2;
    queryParams.push(parseInt(limit), parseInt(offset));

    const orderByClause = req.query.sort === 'top'
      ? 'p.is_pinned DESC, (reaction_count + comment_count) DESC, p.created_at DESC'
      : 'p.is_pinned DESC, p.created_at DESC';

    const postsQuery = `
      SELECT 
        p.*,
        COALESCE(u.email, p.author_id) as author_email,
        u.first_name as author_first_name,
        u.last_name as author_last_name,
        NULL as author_image_url,
        (SELECT COUNT(*) FROM news_feed_reactions WHERE post_id = p.id) as reaction_count,
        (SELECT COUNT(*) FROM news_feed_comments WHERE post_id = p.id AND deleted_at IS NULL) as comment_count
        ${userReactedQuery}
      FROM news_feed_posts p
      LEFT JOIN users u ON p.author_id = u.id::text OR p.author_id = u.email
      ${whereClause}
      ORDER BY ${orderByClause}
      LIMIT $${limitParam} OFFSET $${offsetParam}
    `;

    const { rows: posts } = await pool.query(postsQuery, queryParams);

    // Get reactions for each post
    for (const post of posts) {
      const reactionsQuery = `
        SELECT reaction_type, COUNT(*) as count
        FROM news_feed_reactions
        WHERE post_id = $1
        GROUP BY reaction_type
      `;
      const { rows: reactions } = await pool.query(reactionsQuery, [post.id]);
      post.reactions = reactions;
    }

    // Get total count (use same WHERE clause but without limit/offset and user_reacted params)
    const countParams = currentUserId
      ? queryParams.slice(0, -3) // Remove limit, offset, and currentUserId
      : queryParams.slice(0, -2); // Remove limit and offset
    const countQuery = `
      SELECT COUNT(*) as total
      FROM news_feed_posts p
      ${whereClause}
    `;
    const { rows: countRows } = await pool.query(countQuery, countParams);
    const total = parseInt(countRows[0]?.total || 0);

    res.json({
      posts,
      pagination: {
        page: parseInt(page),
        limit: parseInt(limit),
        total,
        pages: Math.ceil(total / limit)
      }
    });
  } catch (error) {
    logger.error({ err: error }, 'Error fetching news feed posts:');
    logger.error({ data: error.stack }, 'Error stack:');
    res.status(500).json({ error: 'Failed to fetch posts', details: error.message });
  }
}));

// Link Preview (OpenGraph)
router.get('/link-preview', requireAuth, asyncHandler(async (req, res) => {
  try {
    const { url } = req.query;
    if (!url) return res.status(400).json({ error: 'URL is required' });

    // Add protocol if missing
    const targetUrl = url.startsWith('http') ? url : `https://${url}`;

    const response = await fetch(targetUrl, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (compatible; Googlebot/2.1; +http://www.google.com/bot.html)',
      }
    });

    if (!response.ok) return res.json({ title: url, url: targetUrl });

    const html = await response.text();

    // Simple Regex extraction (lightweight)
    const getMeta = (prop) => {
      const match = html.match(new RegExp(`<meta property="${prop}" content="([^"]*)"`, 'i')) ||
        html.match(new RegExp(`<meta name="${prop}" content="([^"]*)"`, 'i'));
      return match ? match[1] : null;
    };

    const title = getMeta('og:title') ||
      (html.match(/<title>([^<]*)<\/title>/i) ? html.match(/<title>([^<]*)<\/title>/i)[1] : '') ||
      targetUrl;

    const description = getMeta('og:description') ||
      getMeta('description') || '';

    const image = getMeta('og:image') || '';

    res.json({
      title,
      description,
      image,
      url: targetUrl
    });
  } catch (error) {
    logger.error({ err: error }, 'Error fetching link preview:');
    // Return graceful fallback
    res.json({ title: req.query.url, url: req.query.url });
  }
}));

// Search Giphy (proxy endpoint to avoid CORS and use server-side API key)
router.get('/giphy/search', requireAuth, asyncHandler(async (req, res) => {
  try {
    const { q, limit = 20 } = req.query;

    if (!q || q.trim().length === 0) {
      return res.json({ data: [] });
    }

    // Use Giphy API key from environment, or fallback to public demo key
    const giphyApiKey = process.env.GIPHY_API_KEY || 'dc6zaTOxFJmzC';

    const response = await fetch(
      `https://api.giphy.com/v1/gifs/search?api_key=${giphyApiKey}&q=${encodeURIComponent(q)}&limit=${limit}`
    );

    if (response.ok) {
      const data = await response.json();
      res.json(data);
    } else {
      // If API key fails, return empty results gracefully
      logger.warn({ data: response.status }, 'Giphy API request failed:');
      res.json({ data: [] });
    }
  } catch (error) {
    logger.error({ err: error }, 'Error searching Giphy:');
    res.json({ data: [] });
  }
}));

// Upload media files
router.post('/upload', requireAuth, upload.array('files', 10), asyncHandler(async (req, res) => {
  try {
    const { cloudinary } = global;
    if (!cloudinary) {
      return res.status(500).json({ error: 'Cloudinary not configured' });
    }

    if (!req.files || req.files.length === 0) {
      return res.status(400).json({ error: 'No files uploaded' });
    }

    const uploadPromises = req.files.map(file => {
      return new Promise((resolve, reject) => {
        const stream = cloudinary.uploader.upload_stream(
          {
            folder: 'acme-ops/news-feed',
            resource_type: 'auto', // auto-detect image/video
          },
          (error, result) => {
            if (error) return reject(error);
            resolve({
              url: result.secure_url,
              public_id: result.public_id,
              resource_type: result.resource_type,
              width: result.width,
              height: result.height,
              duration: result.duration // for videos
            });
          }
        );
        stream.end(file.buffer);
      });
    });

    const results = await Promise.all(uploadPromises);
    res.json({ files: results });
  } catch (error) {
    logger.error({ err: error }, 'Error uploading files:');
    res.status(500).json({ error: 'Failed to upload files' });
  }
}));

// Create a new post
router.post('/posts', requireAuth, asyncHandler(async (req, res) => {
  try {
    const pool = getPool(req);
    const {
      content,
      post_type = 'text',
      media_urls = [],
      visibility_level = 'internal',
      target_branches = [],
      hashtags = [],
      mentions = [],
      location = null
    } = req.body;

    if ((!content || content.trim().length === 0) && (!media_urls || media_urls.length === 0)) {
      return res.status(400).json({ error: 'Content or media is required' });
    }

    // Ensure content is a string even if empty
    const safeContent = content || '';

    // Store author_id as email or user ID (flexible - convert to string)
    const author_id = req.user?.id?.toString() || req.user?.email;
    // Get branch_id from body or user context
    const branch_id = req.body.branch_id || req.user?.branch_id || null;

    // Parse mentions and send notifications
    const mentionList = Array.isArray(mentions) ? mentions : [];
    if (mentionList.length > 0) {
      // TODO: Send notifications to mentioned users
      // This would integrate with a notification system
      logger.info({ data: mentionList }, 'Mentions detected:');
    }

    // Insert post (location column doesn't exist in schema yet, so we'll store it in content or skip for now)
    // TODO: Add location column to database schema in future migration
    const insertQuery = `
      INSERT INTO news_feed_posts (
        author_id,
        branch_id,
        content,
        post_type,
        media_urls,
        visibility_level,
        target_branches,
        hashtags,
        mentions
      ) VALUES ($1, $2, $3, $4, $5::jsonb, $6, $7::jsonb, $8::jsonb, $9::jsonb)
      RETURNING *
    `;

    // Append location to content if provided (until we add location column)
    let postContent = safeContent.trim();
    if (location) {
      postContent += `\n📍 ${location}`;
    }

    const { rows } = await pool.query(insertQuery, [
      author_id,
      branch_id,
      postContent,
      post_type,
      JSON.stringify(media_urls),
      visibility_level,
      JSON.stringify(target_branches),
      JSON.stringify(hashtags),
      JSON.stringify(mentionList)
    ]);

    // Get full post with author info
    const postQuery = `
      SELECT 
        p.*,
        COALESCE(u.email, p.author_id) as author_email,
        u.first_name as author_first_name,
        u.last_name as author_last_name,
        NULL as author_image_url
      FROM news_feed_posts p
      LEFT JOIN users u ON p.author_id = u.id::text OR p.author_id = u.email
      WHERE p.id = $1
    `;
    const { rows: postRows } = await pool.query(postQuery, [rows[0].id]);

    res.status(201).json({ post: postRows[0] });
  } catch (error) {
    logger.error({ err: error }, 'Error creating post:');
    res.status(500).json({ error: 'Failed to create post' });
  }
}));

// Get comments for a post
router.get('/posts/:id/comments', requireAuth, asyncHandler(async (req, res) => {
  try {
    const pool = getPool(req);
    const { id } = req.params;

    const query = `
      SELECT 
        c.*,
        COALESCE(u.email, c.author_id) as author_email,
        u.first_name as author_first_name,
        u.last_name as author_last_name,
        NULL as author_image_url
      FROM news_feed_comments c
      LEFT JOIN users u ON c.author_id = u.id::text OR c.author_id = u.email
      WHERE c.post_id = $1 AND c.deleted_at IS NULL
      ORDER BY c.created_at ASC
    `;

    const { rows } = await pool.query(query, [id]);
    res.json({ comments: rows });
  } catch (error) {
    logger.error({ err: error }, 'Error fetching comments:');
    res.status(500).json({ error: 'Failed to fetch comments' });
  }
}));

// Add a comment to a post
router.post('/posts/:id/comments', requireAuth, asyncHandler(async (req, res) => {
  try {
    const pool = getPool(req);
    const { id } = req.params;
    const { content } = req.body;

    if (!content || content.trim().length === 0) {
      return res.status(400).json({ error: 'Comment content is required' });
    }

    const author_id = req.user?.id?.toString() || req.user?.email;

    const query = `
      INSERT INTO news_feed_comments (post_id, author_id, content)
      VALUES ($1, $2, $3)
      RETURNING *
    `;

    const { rows } = await pool.query(query, [id, author_id, content.trim()]);

    // Get full comment with author info
    const commentQuery = `
      SELECT 
        c.*,
        COALESCE(u.email, c.author_id) as author_email,
        u.first_name as author_first_name,
        u.last_name as author_last_name,
        NULL as author_image_url
      FROM news_feed_comments c
      LEFT JOIN users u ON c.author_id = u.id::text OR c.author_id = u.email
      WHERE c.id = $1
    `;
    const { rows: commentRows } = await pool.query(commentQuery, [rows[0].id]);

    res.status(201).json({ comment: commentRows[0] });
  } catch (error) {
    logger.error({ err: error }, 'Error creating comment:');
    res.status(500).json({ error: 'Failed to create comment' });
  }
}));

// Get reactions for a post (with breakdown by type)
router.get('/posts/:id/reactions', requireAuth, asyncHandler(async (req, res) => {
  try {
    const pool = getPool(req);
    const { id } = req.params;
    const user_id = req.user?.id?.toString() || req.user?.email;

    // Get reaction breakdown by type
    const breakdownQuery = `
      SELECT reaction_type, COUNT(*) as count
      FROM news_feed_reactions
      WHERE post_id = $1
      GROUP BY reaction_type
    `;
    const { rows: breakdown } = await pool.query(breakdownQuery, [id]);

    // Get user's reaction if any
    const userReactionQuery = `
      SELECT reaction_type, user_id
      FROM news_feed_reactions
      WHERE post_id = $1 AND user_id = $2
    `;
    const { rows: userReaction } = await pool.query(userReactionQuery, [id, user_id]);

    res.json({
      reactions: breakdown,
      user_reaction: userReaction[0] || null
    });
  } catch (error) {
    logger.error({ err: error }, 'Error fetching reactions:');
    res.status(500).json({ error: 'Failed to fetch reactions' });
  }
}));

// Add or update a reaction
router.post('/posts/:id/reactions', requireAuth, asyncHandler(async (req, res) => {
  try {
    const pool = getPool(req);
    const { id } = req.params;
    const { reaction_type = 'like' } = req.body;

    const user_id = req.user?.id?.toString() || req.user?.email;

    // Use UPSERT to add or update reaction
    const query = `
      INSERT INTO news_feed_reactions (post_id, user_id, reaction_type)
      VALUES ($1, $2, $3)
      ON CONFLICT (post_id, user_id)
      DO UPDATE SET reaction_type = $3, created_at = NOW()
      RETURNING *
    `;

    const { rows } = await pool.query(query, [id, user_id, reaction_type]);
    res.json({ reaction: rows[0] });
  } catch (error) {
    logger.error({ err: error }, 'Error adding reaction:');
    res.status(500).json({ error: 'Failed to add reaction' });
  }
}));

// Remove a reaction
router.delete('/posts/:id/reactions', requireAuth, asyncHandler(async (req, res) => {
  try {
    const pool = getPool(req);
    const { id } = req.params;
    const user_id = req.user?.id?.toString() || req.user?.email;

    const query = `
      DELETE FROM news_feed_reactions
      WHERE post_id = $1 AND user_id = $2
      RETURNING *
    `;

    const { rows } = await pool.query(query, [id, user_id]);
    res.json({ success: true, reaction: rows[0] });
  } catch (error) {
    logger.error({ err: error }, 'Error removing reaction:');
    res.status(500).json({ error: 'Failed to remove reaction' });
  }
}));

// Update a post (edit)
router.patch('/posts/:id', requireAuth, asyncHandler(async (req, res) => {
  try {
    const pool = getPool(req);
    const { id } = req.params;
    const {
      content,
      visibility_level,
      media_urls,
      hashtags,
      mentions
    } = req.body;

    const author_id = req.user?.id?.toString() || req.user?.email;

    // Check if user owns the post
    const checkQuery = await pool.query(
      'SELECT author_id FROM news_feed_posts WHERE id = $1 AND deleted_at IS NULL',
      [id]
    );

    if (checkQuery.rows.length === 0) {
      return res.status(404).json({ error: 'Post not found' });
    }

    if (checkQuery.rows[0].author_id !== author_id) {
      return res.status(403).json({ error: 'You can only edit your own posts' });
    }

    // Build update query
    const updates = [];
    const values = [];
    let paramCount = 0;

    if (content !== undefined) {
      paramCount++;
      updates.push(`content = $${paramCount}`);
      values.push(content.trim());
    }

    if (visibility_level !== undefined) {
      paramCount++;
      updates.push(`visibility_level = $${paramCount}`);
      values.push(visibility_level);
    }

    if (media_urls !== undefined) {
      paramCount++;
      updates.push(`media_urls = $${paramCount}::jsonb`);
      values.push(JSON.stringify(media_urls));
    }

    if (hashtags !== undefined) {
      paramCount++;
      updates.push(`hashtags = $${paramCount}::jsonb`);
      values.push(JSON.stringify(hashtags));
    }

    if (mentions !== undefined) {
      paramCount++;
      updates.push(`mentions = $${paramCount}::jsonb`);
      values.push(JSON.stringify(mentions));
    }

    if (updates.length === 0) {
      return res.status(400).json({ error: 'No fields to update' });
    }

    paramCount++;
    values.push(id);

    const updateQuery = `
      UPDATE news_feed_posts
      SET ${updates.join(', ')}, updated_at = NOW()
      WHERE id = $${paramCount}
      RETURNING *
    `;

    const { rows } = await pool.query(updateQuery, values);

    // Get full post with author info
    const postQuery = `
      SELECT 
        p.*,
        COALESCE(u.email, p.author_id) as author_email,
        u.first_name as author_first_name,
        u.last_name as author_last_name,
        NULL as author_image_url
      FROM news_feed_posts p
      LEFT JOIN users u ON p.author_id = u.id::text OR p.author_id = u.email
      WHERE p.id = $1
    `;
    const { rows: postRows } = await pool.query(postQuery, [rows[0].id]);

    res.json({ post: postRows[0] });
  } catch (error) {
    logger.error({ err: error }, 'Error updating post:');
    res.status(500).json({ error: 'Failed to update post' });
  }
}));

// Delete a post (soft delete)
router.delete('/posts/:id', requireAuth, asyncHandler(async (req, res) => {
  try {
    const pool = getPool(req);
    const { id } = req.params;
    const author_id = req.user?.id?.toString() || req.user?.email;
    const userRole = req.user?.role || 'staff';

    // Check if user owns the post or is admin
    const checkQuery = await pool.query(
      'SELECT author_id FROM news_feed_posts WHERE id = $1 AND deleted_at IS NULL',
      [id]
    );

    if (checkQuery.rows.length === 0) {
      return res.status(404).json({ error: 'Post not found' });
    }

    const isOwner = checkQuery.rows[0].author_id === author_id;
    const isAdmin = ['admin', 'staff'].includes(userRole);

    if (!isOwner && !isAdmin) {
      return res.status(403).json({ error: 'You can only delete your own posts' });
    }

    // Soft delete
    const deleteQuery = `
      UPDATE news_feed_posts
      SET deleted_at = NOW()
      WHERE id = $1
      RETURNING *
    `;

    const { rows } = await pool.query(deleteQuery, [id]);

    // Broadcast deletion via WebSocket
    const ws = getWebSocket();
    if (ws) {
      ws.broadcastPostDeleted(id, rows[0]?.branch_id);
    }

    res.json({ success: true, post: rows[0] });
  } catch (error) {
    logger.error({ err: error }, 'Error deleting post:');
    res.status(500).json({ error: 'Failed to delete post' });
  }
}));

// ============================================
// COMMENT REPLIES (Threaded Comments)
// ============================================

// Get replies for a comment
router.get('/comments/:id/replies', requireAuth, asyncHandler(async (req, res) => {
  try {
    const pool = getPool(req);
    const { id } = req.params;

    const query = `
      SELECT 
        r.*,
        COALESCE(u.email, r.author_id) as author_email,
        u.first_name as author_first_name,
        u.last_name as author_last_name
      FROM news_feed_comment_replies r
      LEFT JOIN users u ON r.author_id = u.id::text OR r.author_id = u.email
      WHERE r.parent_comment_id = $1 AND r.deleted_at IS NULL
      ORDER BY r.created_at ASC
    `;

    const { rows } = await pool.query(query, [id]);
    res.json({ replies: rows });
  } catch (error) {
    logger.error({ err: error }, 'Error fetching comment replies:');
    res.status(500).json({ error: 'Failed to fetch replies' });
  }
}));

// Add a reply to a comment
router.post('/comments/:id/replies', requireAuth, asyncHandler(async (req, res) => {
  try {
    const pool = getPool(req);
    const { id } = req.params;
    const { content, mentions = [] } = req.body;

    if (!content || content.trim().length === 0) {
      return res.status(400).json({ error: 'Reply content is required' });
    }

    const author_id = req.user?.id?.toString() || req.user?.email;

    const query = `
      INSERT INTO news_feed_comment_replies (parent_comment_id, author_id, content, mentions)
      VALUES ($1, $2, $3, $4::jsonb)
      RETURNING *
    `;

    const { rows } = await pool.query(query, [id, author_id, content.trim(), JSON.stringify(mentions)]);

    // Get full reply with author info
    const replyQuery = `
      SELECT 
        r.*,
        COALESCE(u.email, r.author_id) as author_email,
        u.first_name as author_first_name,
        u.last_name as author_last_name
      FROM news_feed_comment_replies r
      LEFT JOIN users u ON r.author_id = u.id::text OR r.author_id = u.email
      WHERE r.id = $1
    `;
    const { rows: replyRows } = await pool.query(replyQuery, [rows[0].id]);

    // Update reply count cache on parent comment
    await pool.query(
      'UPDATE news_feed_comments SET reply_count_cache = reply_count_cache + 1 WHERE id = $1',
      [id]
    );

    res.status(201).json({ reply: replyRows[0] });
  } catch (error) {
    logger.error({ err: error }, 'Error creating reply:');
    res.status(500).json({ error: 'Failed to create reply' });
  }
}));

// Delete a comment reply
router.delete('/replies/:id', requireAuth, asyncHandler(async (req, res) => {
  try {
    const pool = getPool(req);
    const { id } = req.params;
    const author_id = req.user?.id?.toString() || req.user?.email;

    // Get the reply first to check ownership and get parent_comment_id
    const checkQuery = await pool.query(
      'SELECT author_id, parent_comment_id FROM news_feed_comment_replies WHERE id = $1 AND deleted_at IS NULL',
      [id]
    );

    if (checkQuery.rows.length === 0) {
      return res.status(404).json({ error: 'Reply not found' });
    }

    if (checkQuery.rows[0].author_id !== author_id) {
      return res.status(403).json({ error: 'You can only delete your own replies' });
    }

    // Soft delete
    await pool.query('UPDATE news_feed_comment_replies SET deleted_at = NOW() WHERE id = $1', [id]);

    // Update reply count cache
    await pool.query(
      'UPDATE news_feed_comments SET reply_count_cache = GREATEST(reply_count_cache - 1, 0) WHERE id = $1',
      [checkQuery.rows[0].parent_comment_id]
    );

    res.json({ success: true });
  } catch (error) {
    logger.error({ err: error }, 'Error deleting reply:');
    res.status(500).json({ error: 'Failed to delete reply' });
  }
}));

// ============================================
// COMMENT REACTIONS
// ============================================

// Add reaction to a comment
router.post('/comments/:id/reactions', requireAuth, asyncHandler(async (req, res) => {
  try {
    const pool = getPool(req);
    const { id } = req.params;
    const { reaction_type = 'like' } = req.body;
    const user_id = req.user?.id?.toString() || req.user?.email;

    const query = `
      INSERT INTO news_feed_comment_reactions (comment_id, user_id, reaction_type)
      VALUES ($1, $2, $3)
      ON CONFLICT (comment_id, user_id)
      DO UPDATE SET reaction_type = $3, created_at = NOW()
      RETURNING *
    `;

    const { rows } = await pool.query(query, [id, user_id, reaction_type]);

    // Update reaction count cache
    const countResult = await pool.query(
      'SELECT COUNT(*) as count FROM news_feed_comment_reactions WHERE comment_id = $1',
      [id]
    );
    await pool.query(
      'UPDATE news_feed_comments SET reaction_count_cache = $1 WHERE id = $2',
      [countResult.rows[0].count, id]
    );

    res.json({ reaction: rows[0] });
  } catch (error) {
    logger.error({ err: error }, 'Error adding comment reaction:');
    res.status(500).json({ error: 'Failed to add reaction' });
  }
}));

// Remove reaction from a comment
router.delete('/comments/:id/reactions', requireAuth, asyncHandler(async (req, res) => {
  try {
    const pool = getPool(req);
    const { id } = req.params;
    const user_id = req.user?.id?.toString() || req.user?.email;

    await pool.query(
      'DELETE FROM news_feed_comment_reactions WHERE comment_id = $1 AND user_id = $2',
      [id, user_id]
    );

    // Update reaction count cache
    const countResult = await pool.query(
      'SELECT COUNT(*) as count FROM news_feed_comment_reactions WHERE comment_id = $1',
      [id]
    );
    await pool.query(
      'UPDATE news_feed_comments SET reaction_count_cache = $1 WHERE id = $2',
      [countResult.rows[0].count, id]
    );

    res.json({ success: true });
  } catch (error) {
    logger.error({ err: error }, 'Error removing comment reaction:');
    res.status(500).json({ error: 'Failed to remove reaction' });
  }
}));

// ============================================
// POLL VOTING
// ============================================

// Vote on a poll
router.post('/posts/:id/vote', requireAuth, asyncHandler(async (req, res) => {
  try {
    const pool = getPool(req);
    const { id } = req.params;
    const { option_index } = req.body;
    const user_id = req.user?.id?.toString() || req.user?.email;

    if (option_index === undefined || option_index < 0) {
      return res.status(400).json({ error: 'Option index is required' });
    }

    // Get post to verify it has poll data
    const postQuery = await pool.query(
      'SELECT poll_data FROM news_feed_posts WHERE id = $1 AND deleted_at IS NULL',
      [id]
    );

    if (postQuery.rows.length === 0) {
      return res.status(404).json({ error: 'Post not found' });
    }

    const pollData = postQuery.rows[0].poll_data;
    if (!pollData || !pollData.options) {
      return res.status(400).json({ error: 'This post does not have a poll' });
    }

    // Check if poll has ended
    if (pollData.ends_at && new Date(pollData.ends_at) < new Date()) {
      return res.status(400).json({ error: 'This poll has ended' });
    }

    // Check if option_index is valid
    if (option_index >= pollData.options.length) {
      return res.status(400).json({ error: 'Invalid option index' });
    }

    // If multiple choice is not allowed, delete existing votes first
    if (!pollData.multiple_choice) {
      await pool.query(
        'DELETE FROM news_feed_poll_votes WHERE post_id = $1 AND user_id = $2',
        [id, user_id]
      );
    }

    // Add vote
    const voteQuery = `
      INSERT INTO news_feed_poll_votes (post_id, user_id, option_index)
      VALUES ($1, $2, $3)
      ON CONFLICT (post_id, user_id, option_index) DO NOTHING
      RETURNING *
    `;

    const { rows } = await pool.query(voteQuery, [id, user_id, option_index]);

    // Get vote counts for all options
    const votesQuery = `
      SELECT option_index, COUNT(*) as count
      FROM news_feed_poll_votes
      WHERE post_id = $1
      GROUP BY option_index
    `;
    const { rows: voteCounts } = await pool.query(votesQuery, [id]);

    // Get user's current votes
    const userVotesQuery = `
      SELECT option_index FROM news_feed_poll_votes WHERE post_id = $1 AND user_id = $2
    `;
    const { rows: userVotes } = await pool.query(userVotesQuery, [id, user_id]);

    res.json({
      success: true,
      vote_counts: voteCounts,
      user_votes: userVotes.map(v => v.option_index)
    });
  } catch (error) {
    logger.error({ err: error }, 'Error voting on poll:');
    res.status(500).json({ error: 'Failed to submit vote' });
  }
}));

// Get poll results
router.get('/posts/:id/poll-results', requireAuth, asyncHandler(async (req, res) => {
  try {
    const pool = getPool(req);
    const { id } = req.params;
    const user_id = req.user?.id?.toString() || req.user?.email;

    // Get vote counts
    const votesQuery = `
      SELECT option_index, COUNT(*) as count
      FROM news_feed_poll_votes
      WHERE post_id = $1
      GROUP BY option_index
    `;
    const { rows: voteCounts } = await pool.query(votesQuery, [id]);

    // Get total votes
    const totalQuery = `
      SELECT COUNT(DISTINCT user_id) as total FROM news_feed_poll_votes WHERE post_id = $1
    `;
    const { rows: totalRows } = await pool.query(totalQuery, [id]);

    // Get user's votes
    const userVotesQuery = `
      SELECT option_index FROM news_feed_poll_votes WHERE post_id = $1 AND user_id = $2
    `;
    const { rows: userVotes } = await pool.query(userVotesQuery, [id, user_id]);

    res.json({
      vote_counts: voteCounts,
      total_voters: parseInt(totalRows[0].total),
      user_votes: userVotes.map(v => v.option_index)
    });
  } catch (error) {
    logger.error({ err: error }, 'Error getting poll results:');
    res.status(500).json({ error: 'Failed to get poll results' });
  }
}));

// ============================================
// POST REPORTING
// ============================================

// Report a post
router.post('/posts/:id/report', requireAuth, asyncHandler(async (req, res) => {
  try {
    const pool = getPool(req);
    const { id } = req.params;
    const { reason, details } = req.body;
    const reporter_id = req.user?.id?.toString() || req.user?.email;

    if (!reason) {
      return res.status(400).json({ error: 'Reason is required' });
    }

    // Check if post exists
    const postQuery = await pool.query(
      'SELECT id FROM news_feed_posts WHERE id = $1 AND deleted_at IS NULL',
      [id]
    );

    if (postQuery.rows.length === 0) {
      return res.status(404).json({ error: 'Post not found' });
    }

    // Create report
    const query = `
      INSERT INTO news_feed_reports (post_id, reporter_id, reason, details)
      VALUES ($1, $2, $3, $4)
      RETURNING *
    `;

    const { rows } = await pool.query(query, [id, reporter_id, reason, details || null]);

    res.status(201).json({ report: rows[0], message: 'Report submitted successfully' });
  } catch (error) {
    logger.error({ err: error }, 'Error reporting post:');
    res.status(500).json({ error: 'Failed to submit report' });
  }
}));

// Report a comment
router.post('/comments/:id/report', requireAuth, asyncHandler(async (req, res) => {
  try {
    const pool = getPool(req);
    const { id } = req.params;
    const { reason, details } = req.body;
    const reporter_id = req.user?.id?.toString() || req.user?.email;

    if (!reason) {
      return res.status(400).json({ error: 'Reason is required' });
    }

    // Create report
    const query = `
      INSERT INTO news_feed_reports (comment_id, reporter_id, reason, details)
      VALUES ($1, $2, $3, $4)
      RETURNING *
    `;

    const { rows } = await pool.query(query, [id, reporter_id, reason, details || null]);

    res.status(201).json({ report: rows[0], message: 'Report submitted successfully' });
  } catch (error) {
    logger.error({ err: error }, 'Error reporting comment:');
    res.status(500).json({ error: 'Failed to submit report' });
  }
}));

// ============================================
// MODERATION
// ============================================

// Get moderation queue (admin only)
router.get('/moderation/queue', requireAuth, asyncHandler(async (req, res) => {
  try {
    const pool = getPool(req);
    const userRole = req.user?.role || 'staff';

    if (!['admin', 'staff'].includes(userRole)) {
      return res.status(403).json({ error: 'Admin access required' });
    }

    const { status = 'pending', page = 1, limit = 20 } = req.query;
    const offset = (page - 1) * limit;

    const query = `
      SELECT 
        p.*,
        COALESCE(u.email, p.author_id) as author_email,
        u.first_name as author_first_name,
        u.last_name as author_last_name
      FROM news_feed_posts p
      LEFT JOIN users u ON p.author_id = u.id::text OR p.author_id = u.email
      WHERE p.moderation_status = $1 AND p.deleted_at IS NULL
      ORDER BY p.created_at DESC
      LIMIT $2 OFFSET $3
    `;

    const { rows } = await pool.query(query, [status, limit, offset]);

    // Get total count
    const countQuery = `
      SELECT COUNT(*) as total FROM news_feed_posts 
      WHERE moderation_status = $1 AND deleted_at IS NULL
    `;
    const { rows: countRows } = await pool.query(countQuery, [status]);

    res.json({
      posts: rows,
      pagination: {
        page: parseInt(page),
        limit: parseInt(limit),
        total: parseInt(countRows[0].total),
        pages: Math.ceil(countRows[0].total / limit)
      }
    });
  } catch (error) {
    logger.error({ err: error }, 'Error fetching moderation queue:');
    res.status(500).json({ error: 'Failed to fetch moderation queue' });
  }
}));

// Approve a post (admin only)
router.post('/moderation/:id/approve', requireAuth, asyncHandler(async (req, res) => {
  try {
    const pool = getPool(req);
    const { id } = req.params;
    const { notes } = req.body;
    const moderator_id = req.user?.id?.toString() || req.user?.email;
    const userRole = req.user?.role || 'staff';

    if (!['admin', 'staff'].includes(userRole)) {
      return res.status(403).json({ error: 'Admin access required' });
    }

    // Get current post state for audit log
    const currentPost = await pool.query(
      'SELECT * FROM news_feed_posts WHERE id = $1',
      [id]
    );

    if (currentPost.rows.length === 0) {
      return res.status(404).json({ error: 'Post not found' });
    }

    // Update post
    const query = `
      UPDATE news_feed_posts
      SET moderation_status = 'approved', 
          moderated_by = $2, 
          moderated_at = NOW(),
          moderation_notes = $3
      WHERE id = $1
      RETURNING *
    `;

    const { rows } = await pool.query(query, [id, moderator_id, notes || null]);

    // Log moderation action
    await pool.query(`
      INSERT INTO news_feed_moderation_log (post_id, action, actor_id, reason, previous_state, new_state)
      VALUES ($1, 'approve', $2, $3, $4, $5)
    `, [
      id,
      moderator_id,
      notes || 'Approved',
      JSON.stringify({ status: currentPost.rows[0].moderation_status }),
      JSON.stringify({ status: 'approved' })
    ]);

    // Broadcast post update via WebSocket
    const ws = getWebSocket();
    if (ws) {
      ws.broadcastPostUpdate(rows[0], 'approved');
    }

    res.json({ success: true, post: rows[0] });
  } catch (error) {
    logger.error({ err: error }, 'Error approving post:');
    res.status(500).json({ error: 'Failed to approve post' });
  }
}));

// Reject a post (admin only)
router.post('/moderation/:id/reject', requireAuth, asyncHandler(async (req, res) => {
  try {
    const pool = getPool(req);
    const { id } = req.params;
    const { reason } = req.body;
    const moderator_id = req.user?.id?.toString() || req.user?.email;
    const userRole = req.user?.role || 'staff';

    if (!['admin', 'staff'].includes(userRole)) {
      return res.status(403).json({ error: 'Admin access required' });
    }

    if (!reason) {
      return res.status(400).json({ error: 'Rejection reason is required' });
    }

    // Get current post state
    const currentPost = await pool.query(
      'SELECT * FROM news_feed_posts WHERE id = $1',
      [id]
    );

    if (currentPost.rows.length === 0) {
      return res.status(404).json({ error: 'Post not found' });
    }

    // Update post
    const query = `
      UPDATE news_feed_posts
      SET moderation_status = 'rejected', 
          moderated_by = $2, 
          moderated_at = NOW(),
          moderation_notes = $3
      WHERE id = $1
      RETURNING *
    `;

    const { rows } = await pool.query(query, [id, moderator_id, reason]);

    // Log moderation action
    await pool.query(`
      INSERT INTO news_feed_moderation_log (post_id, action, actor_id, reason, previous_state, new_state)
      VALUES ($1, 'reject', $2, $3, $4, $5)
    `, [
      id,
      moderator_id,
      reason,
      JSON.stringify({ status: currentPost.rows[0].moderation_status }),
      JSON.stringify({ status: 'rejected' })
    ]);

    res.json({ success: true, post: rows[0] });
  } catch (error) {
    logger.error({ err: error }, 'Error rejecting post:');
    res.status(500).json({ error: 'Failed to reject post' });
  }
}));

// Get moderation log (admin only)
router.get('/moderation/log', requireAuth, asyncHandler(async (req, res) => {
  try {
    const pool = getPool(req);
    const userRole = req.user?.role || 'staff';

    if (!['admin', 'staff'].includes(userRole)) {
      return res.status(403).json({ error: 'Admin access required' });
    }

    const { page = 1, limit = 50, post_id } = req.query;
    const offset = (page - 1) * limit;

    let query = `
      SELECT 
        ml.*,
        COALESCE(u.email, ml.actor_id) as actor_email,
        u.first_name as actor_first_name,
        u.last_name as actor_last_name
      FROM news_feed_moderation_log ml
      LEFT JOIN users u ON ml.actor_id = u.id::text OR ml.actor_id = u.email
    `;

    const params = [];
    if (post_id) {
      params.push(post_id);
      query += ` WHERE ml.post_id = $1`;
    }

    query += ` ORDER BY ml.created_at DESC LIMIT $${params.length + 1} OFFSET $${params.length + 2}`;
    params.push(limit, offset);

    const { rows } = await pool.query(query, params);

    res.json({ log: rows });
  } catch (error) {
    logger.error({ err: error }, 'Error fetching moderation log:');
    res.status(500).json({ error: 'Failed to fetch moderation log' });
  }
}));

// Get reports (admin only)
router.get('/moderation/reports', requireAuth, asyncHandler(async (req, res) => {
  try {
    const pool = getPool(req);
    const userRole = req.user?.role || 'staff';

    if (!['admin', 'staff'].includes(userRole)) {
      return res.status(403).json({ error: 'Admin access required' });
    }

    const { status = 'pending', page = 1, limit = 20 } = req.query;
    const offset = (page - 1) * limit;

    const query = `
      SELECT 
        r.*,
        COALESCE(u.email, r.reporter_id) as reporter_email,
        u.first_name as reporter_first_name,
        u.last_name as reporter_last_name
      FROM news_feed_reports r
      LEFT JOIN users u ON r.reporter_id = u.id::text OR r.reporter_id = u.email
      WHERE r.status = $1
      ORDER BY r.created_at DESC
      LIMIT $2 OFFSET $3
    `;

    const { rows } = await pool.query(query, [status, limit, offset]);

    res.json({ reports: rows });
  } catch (error) {
    logger.error({ err: error }, 'Error fetching reports:');
    res.status(500).json({ error: 'Failed to fetch reports' });
  }
}));

// Review a report (admin only)
router.post('/moderation/reports/:id/review', requireAuth, asyncHandler(async (req, res) => {
  try {
    const pool = getPool(req);
    const { id } = req.params;
    const { status, resolution_notes } = req.body;
    const reviewer_id = req.user?.id?.toString() || req.user?.email;
    const userRole = req.user?.role || 'staff';

    if (!['admin', 'staff'].includes(userRole)) {
      return res.status(403).json({ error: 'Admin access required' });
    }

    if (!['resolved', 'dismissed'].includes(status)) {
      return res.status(400).json({ error: 'Invalid status. Use resolved or dismissed.' });
    }

    const query = `
      UPDATE news_feed_reports
      SET status = $2, reviewed_by = $3, reviewed_at = NOW(), resolution_notes = $4
      WHERE id = $1
      RETURNING *
    `;

    const { rows } = await pool.query(query, [id, status, reviewer_id, resolution_notes || null]);

    if (rows.length === 0) {
      return res.status(404).json({ error: 'Report not found' });
    }

    res.json({ success: true, report: rows[0] });
  } catch (error) {
    logger.error({ err: error }, 'Error reviewing report:');
    res.status(500).json({ error: 'Failed to review report' });
  }
}));

// ============================================
// PIN/UNPIN POSTS
// ============================================

// Pin a post (admin only)
router.post('/posts/:id/pin', requireAuth, asyncHandler(async (req, res) => {
  try {
    const pool = getPool(req);
    const { id } = req.params;
    const userRole = req.user?.role || 'staff';

    if (!['admin', 'staff'].includes(userRole)) {
      return res.status(403).json({ error: 'Admin access required' });
    }

    const query = `
      UPDATE news_feed_posts
      SET is_pinned = TRUE
      WHERE id = $1 AND deleted_at IS NULL
      RETURNING *
    `;

    const { rows } = await pool.query(query, [id]);

    if (rows.length === 0) {
      return res.status(404).json({ error: 'Post not found' });
    }

    res.json({ success: true, post: rows[0] });
  } catch (error) {
    logger.error({ err: error }, 'Error pinning post:');
    res.status(500).json({ error: 'Failed to pin post' });
  }
}));

// Unpin a post (admin only)
router.delete('/posts/:id/pin', requireAuth, asyncHandler(async (req, res) => {
  try {
    const pool = getPool(req);
    const { id } = req.params;
    const userRole = req.user?.role || 'staff';

    if (!['admin', 'staff'].includes(userRole)) {
      return res.status(403).json({ error: 'Admin access required' });
    }

    const query = `
      UPDATE news_feed_posts
      SET is_pinned = FALSE
      WHERE id = $1 AND deleted_at IS NULL
      RETURNING *
    `;

    const { rows } = await pool.query(query, [id]);

    if (rows.length === 0) {
      return res.status(404).json({ error: 'Post not found' });
    }

    res.json({ success: true, post: rows[0] });
  } catch (error) {
    logger.error({ err: error }, 'Error unpinning post:');
    res.status(500).json({ error: 'Failed to unpin post' });
  }
}));

// ============================================
// LINK PREVIEW (OpenGraph)
// ============================================

// Get link preview
router.post('/link-preview', requireAuth, asyncHandler(async (req, res) => {
  try {
    const { url } = req.body;

    if (!url) {
      return res.status(400).json({ error: 'URL is required' });
    }

    // Try to fetch OpenGraph data
    try {
      const response = await fetch(url, {
        headers: {
          'User-Agent': 'Mozilla/5.0 (compatible; AcmeOperations/1.0)'
        },
        timeout: 5000
      });

      if (!response.ok) {
        return res.json({ preview: null });
      }

      const html = await response.text();

      // Parse OpenGraph tags
      const getMetaContent = (property) => {
        const regex = new RegExp(`<meta[^>]*(?:property|name)=["']${property}["'][^>]*content=["']([^"']*)["']`, 'i');
        const match = html.match(regex);
        if (match) return match[1];

        // Try alternate format
        const regex2 = new RegExp(`<meta[^>]*content=["']([^"']*)["'][^>]*(?:property|name)=["']${property}["']`, 'i');
        const match2 = html.match(regex2);
        return match2 ? match2[1] : null;
      };

      // Get title from og:title or page title
      const getTitleFromHtml = () => {
        const titleMatch = html.match(/<title[^>]*>([^<]*)<\/title>/i);
        return titleMatch ? titleMatch[1].trim() : null;
      };

      const preview = {
        url,
        title: getMetaContent('og:title') || getMetaContent('twitter:title') || getTitleFromHtml(),
        description: getMetaContent('og:description') || getMetaContent('twitter:description') || getMetaContent('description'),
        image: getMetaContent('og:image') || getMetaContent('twitter:image'),
        site_name: getMetaContent('og:site_name'),
        type: getMetaContent('og:type')
      };

      // Filter out null values
      Object.keys(preview).forEach(key => {
        if (preview[key] === null) delete preview[key];
      });

      res.json({ preview });
    } catch (fetchError) {
      logger.error({ data: fetchError.message }, 'Error fetching URL for preview:');
      res.json({ preview: null });
    }
  } catch (error) {
    logger.error({ err: error }, 'Error generating link preview:');
    res.status(500).json({ error: 'Failed to generate link preview' });
  }
}));

// ============================================
// USER SEARCH (for mentions)
// ============================================

// Search users for mentions
router.get('/users/search', requireAuth, asyncHandler(async (req, res) => {
  try {
    const pool = getPool(req);
    const { q, limit = 10 } = req.query;

    if (!q || q.length < 1) {
      return res.json({ users: [] });
    }

    const query = `
      SELECT id, email, first_name, last_name
      FROM users
      WHERE 
        (first_name ILIKE $1 OR last_name ILIKE $1 OR email ILIKE $1)
        AND status = 'active'
      ORDER BY first_name, last_name
      LIMIT $2
    `;

    const { rows } = await pool.query(query, [`%${q}%`, limit]);

    // Format response
    const users = rows.map(user => ({
      id: user.id.toString(),
      name: `${user.first_name || ''} ${user.last_name || ''}`.trim() || user.email.split('@')[0],
      email: user.email
    }));

    res.json({ users });
  } catch (error) {
    logger.error({ err: error }, 'Error searching users:');
    res.status(500).json({ error: 'Failed to search users' });
  }
}));

module.exports = router;

