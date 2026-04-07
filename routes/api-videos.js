const express = require('express');
const router = express.Router();
const { Pool } = require('pg');
const { S3Client, PutObjectCommand, GetObjectCommand } = require('@aws-sdk/client-s3');
const { getSignedUrl } = require('@aws-sdk/s3-request-presigner');
const jwt = require('jsonwebtoken');
const { asyncHandler } = require('../middleware/error-handler');
const { requireAuth } = require('../middleware/auth');
const { logger } = require('../utils/logger');

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: process.env.DATABASE_URL?.includes('amazonaws.com') ? { rejectUnauthorized: false } : false,
});

let s3Client = null;
function getS3() {
  if (!s3Client) {
    s3Client = new S3Client({
      region: process.env.AWS_REGION || 'us-east-1',
      credentials: {
        accessKeyId: process.env.AWS_ACCESS_KEY_ID,
        secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY,
      },
    });
  }
  return s3Client;
}

function getS3Bucket() {
  return process.env.CAPTURE_S3_BUCKET || process.env.AWS_S3_BUCKET;
}

/**
 * Try to extract user ID from Authorization header.
 * Returns userId or null if no valid token.
 */
function extractUserFromHeader(req) {
  const authHeader = req.headers.authorization;
  if (!authHeader || !authHeader.startsWith('Bearer ')) return null;
  try {
    const token = authHeader.split(' ')[1];
    const decoded = jwt.verify(token, process.env.JWT_SECRET);
    return decoded.id || decoded.userId || null;
  } catch {
    return null;
  }
}

// POST /api/videos/presigned-url
// Auth required. Creates a DB record and returns an S3 presigned PUT URL.
router.post('/presigned-url', requireAuth, asyncHandler(async (req, res) => {
  const bucket = getS3Bucket();
  if (!bucket) {
    return res.status(500).json({ error: 'Video uploads not configured (AWS_S3_BUCKET missing)' });
  }

  const { title, content_type = 'video/webm', file_size_bytes, recording_mode, layout, category } = req.body;
  const userId = req.user?.id;

  const result = await pool.query(
    `INSERT INTO video_recordings (title, s3_bucket, uploaded_by, file_size_bytes, status, recording_mode, layout, category)
     VALUES ($1, $2, $3, $4, 'processing', $5, $6, $7)
     RETURNING id, shareable_token`,
    [title || 'Untitled Recording', bucket, userId, file_size_bytes || null, recording_mode || null, layout || null, category || null]
  );

  const { id } = result.rows[0];
  const s3Key = `captures/recordings/${id}.webm`;

  await pool.query('UPDATE video_recordings SET s3_key = $1 WHERE id = $2', [s3Key, id]);

  const command = new PutObjectCommand({
    Bucket: bucket,
    Key: s3Key,
    ContentType: content_type,
  });

  const presignedUrl = await getSignedUrl(getS3(), command, { expiresIn: 3600 });

  logger.info({ videoId: id, userId }, '[Videos] Presigned URL created');

  res.json({
    video_id: id,
    presigned_url: presignedUrl,
    s3_key: s3Key,
  });
}));

// POST /api/videos/:id/complete
// Called by the extension after S3 upload finishes.
router.post('/:id/complete', requireAuth, asyncHandler(async (req, res) => {
  const { id } = req.params;
  const { duration_seconds, title, recording_mode, layout, description, tags, category, access_level } = req.body;
  const userId = req.user?.id;

  const updates = ['status = $1', 'updated_at = NOW()'];
  const values = ['ready'];
  let idx = 2;

  if (duration_seconds != null) { updates.push(`duration_seconds = $${idx++}`); values.push(duration_seconds); }
  if (title) { updates.push(`title = $${idx++}`); values.push(title); }
  if (recording_mode) { updates.push(`recording_mode = $${idx++}`); values.push(recording_mode); }
  if (layout) { updates.push(`layout = $${idx++}`); values.push(layout); }
  if (description) { updates.push(`description = $${idx++}`); values.push(description); }
  if (tags) { updates.push(`tags = $${idx++}`); values.push(JSON.stringify(tags)); }
  if (category) { updates.push(`category = $${idx++}`); values.push(category); }
  if (access_level) { updates.push(`access_level = $${idx++}`); values.push(access_level); }

  values.push(id, userId);

  const result = await pool.query(
    `UPDATE video_recordings SET ${updates.join(', ')}
     WHERE id = $${idx++} AND uploaded_by = $${idx}
     RETURNING id, shareable_token, title, duration_seconds`,
    values
  );

  if (result.rows.length === 0) {
    return res.status(404).json({ error: 'Recording not found' });
  }

  const rec = result.rows[0];
  const watchUrl = `${process.env.APP_BASE_URL || ''}/videos/watch/${rec.shareable_token}`;

  logger.info({ videoId: id, userId }, '[Videos] Recording marked ready');

  res.json({
    video_id: rec.id,
    title: rec.title,
    duration_seconds: rec.duration_seconds,
    watch_url: watchUrl,
    shareable_token: rec.shareable_token,
  });
}));

// POST /api/videos/:id/thumbnail
// Auth required. Returns presigned PUT URL for thumbnail upload.
router.post('/:id/thumbnail', requireAuth, asyncHandler(async (req, res) => {
  const { id } = req.params;
  const userId = req.user?.id;
  const bucket = getS3Bucket();

  if (!bucket) {
    return res.status(500).json({ error: 'Uploads not configured' });
  }

  // Verify ownership
  const check = await pool.query(
    'SELECT id FROM video_recordings WHERE id = $1 AND uploaded_by = $2 AND deleted_at IS NULL',
    [id, userId]
  );
  if (check.rows.length === 0) {
    return res.status(404).json({ error: 'Recording not found' });
  }

  const s3Key = `captures/thumbnails/${id}.jpg`;

  await pool.query(
    'UPDATE video_recordings SET thumbnail_s3_key = $1, updated_at = NOW() WHERE id = $2',
    [s3Key, id]
  );

  const command = new PutObjectCommand({
    Bucket: bucket,
    Key: s3Key,
    ContentType: 'image/jpeg',
  });

  const presignedUrl = await getSignedUrl(getS3(), command, { expiresIn: 3600 });

  logger.info({ videoId: id, userId }, '[Videos] Thumbnail presigned URL created');

  res.json({ presigned_url: presignedUrl, s3_key: s3Key });
}));

// POST /api/videos/:id/view
// Public — no auth. Tracks a view with IP dedup.
router.post('/:id/view', asyncHandler(async (req, res) => {
  const { id } = req.params;
  const viewerIp = (req.headers['x-forwarded-for'] || '').split(',')[0].trim() || req.ip;
  const viewerUserId = extractUserFromHeader(req);

  // Dedup: same video + IP within 24 hours
  const recent = await pool.query(
    `SELECT id FROM video_views
     WHERE video_id = $1 AND viewer_ip = $2 AND created_at > NOW() - INTERVAL '24 hours'
     LIMIT 1`,
    [id, viewerIp]
  );

  if (recent.rows.length > 0) {
    return res.json({ tracked: false });
  }

  await Promise.all([
    pool.query(
      `INSERT INTO video_views (video_id, viewer_ip, viewer_user_id)
       VALUES ($1, $2, $3)`,
      [id, viewerIp, viewerUserId]
    ),
    pool.query(
      'UPDATE video_recordings SET view_count = COALESCE(view_count, 0) + 1 WHERE id = $1',
      [id]
    ),
  ]);

  res.json({ tracked: true });
}));

// GET /api/videos/watch/:token
// Public — no auth required (but may require login for restricted videos).
router.get('/watch/:token', asyncHandler(async (req, res) => {
  const { token } = req.params;
  const bucket = getS3Bucket();

  const result = await pool.query(
    `SELECT vr.id, vr.title, vr.s3_key, vr.s3_bucket, vr.duration_seconds,
            vr.file_size_bytes, vr.status, vr.created_at, vr.access_level,
            vr.allowed_users, vr.description, vr.recording_mode, vr.category,
            vr.view_count, vr.thumbnail_s3_key,
            u.first_name, u.last_name, u.avatar_url
     FROM video_recordings vr
     LEFT JOIN users u ON u.id = vr.uploaded_by
     WHERE vr.shareable_token = $1 AND vr.status = 'ready' AND vr.deleted_at IS NULL`,
    [token]
  );

  if (result.rows.length === 0) {
    return res.status(404).json({ error: 'Video not found' });
  }

  const rec = result.rows[0];

  // Access control for restricted videos
  if (rec.access_level === 'team' || rec.access_level === 'specific') {
    const viewerUserId = extractUserFromHeader(req);
    if (!viewerUserId) {
      return res.status(401).json({ error: 'Login required', requires_auth: true });
    }
    if (rec.access_level === 'specific') {
      const allowedUsers = rec.allowed_users || [];
      if (!allowedUsers.includes(viewerUserId)) {
        return res.status(403).json({ error: 'You do not have access to this video' });
      }
    }
  }

  // Generate presigned GET URL for video (valid 4 hours)
  const videoCommand = new GetObjectCommand({
    Bucket: bucket || rec.s3_bucket,
    Key: rec.s3_key,
  });
  const videoUrl = await getSignedUrl(getS3(), videoCommand, { expiresIn: 14400 });

  // Generate thumbnail presigned URL if exists
  let thumbnailUrl = null;
  if (rec.thumbnail_s3_key) {
    const thumbCommand = new GetObjectCommand({
      Bucket: bucket || rec.s3_bucket,
      Key: rec.thumbnail_s3_key,
    });
    thumbnailUrl = await getSignedUrl(getS3(), thumbCommand, { expiresIn: 14400 });
  }

  res.json({
    id: rec.id,
    title: rec.title,
    duration_seconds: rec.duration_seconds,
    file_size_bytes: rec.file_size_bytes,
    created_at: rec.created_at,
    video_url: videoUrl,
    thumbnail_url: thumbnailUrl,
    description: rec.description,
    recording_mode: rec.recording_mode,
    category: rec.category,
    view_count: rec.view_count,
    access_level: rec.access_level,
    recorded_by: rec.first_name ? `${rec.first_name} ${rec.last_name}` : null,
    recorded_by_avatar: rec.avatar_url || null,
  });
}));

// GET /api/videos/library — MUST be before /:id routes
// Auth required. Paginated browsing of all team videos.
router.get('/library', requireAuth, asyncHandler(async (req, res) => {
  const { search, category, mine, page = 1, limit = 12 } = req.query;
  const userId = req.user?.id;
  const bucket = getS3Bucket();
  const pageNum = Math.max(1, parseInt(page, 10) || 1);
  const limitNum = Math.min(50, Math.max(1, parseInt(limit, 10) || 12));
  const offset = (pageNum - 1) * limitNum;

  const conditions = ["vr.status = 'ready'", 'vr.deleted_at IS NULL'];
  const values = [];
  let idx = 1;

  if (mine === 'true') {
    conditions.push(`vr.uploaded_by = $${idx++}`);
    values.push(userId);
  }

  if (category && category !== 'all') {
    conditions.push(`vr.category = $${idx++}`);
    values.push(category);
  }

  if (search) {
    conditions.push(`(vr.title ILIKE $${idx} OR vr.description ILIKE $${idx})`);
    values.push(`%${search}%`);
    idx++;
  }

  const whereClause = conditions.join(' AND ');

  const [countResult, dataResult] = await Promise.all([
    pool.query(
      `SELECT COUNT(*) FROM video_recordings vr WHERE ${whereClause}`,
      values
    ),
    pool.query(
      `SELECT vr.id, vr.title, vr.duration_seconds, vr.category, vr.recording_mode,
              vr.view_count, vr.thumbnail_s3_key, vr.shareable_token, vr.created_at,
              vr.description,
              u.first_name, u.last_name, u.avatar_url
       FROM video_recordings vr
       LEFT JOIN users u ON u.id = vr.uploaded_by
       WHERE ${whereClause}
       ORDER BY vr.created_at DESC
       LIMIT $${idx++} OFFSET $${idx++}`,
      [...values, limitNum, offset]
    ),
  ]);

  const total = parseInt(countResult.rows[0].count, 10);

  // Generate thumbnail presigned URLs
  const recordings = await Promise.all(
    dataResult.rows.map(async (r) => {
      let thumbnailUrl = null;
      if (r.thumbnail_s3_key && bucket) {
        const command = new GetObjectCommand({ Bucket: bucket, Key: r.thumbnail_s3_key });
        thumbnailUrl = await getSignedUrl(getS3(), command, { expiresIn: 14400 });
      }
      return {
        id: r.id,
        title: r.title,
        duration_seconds: r.duration_seconds,
        category: r.category,
        recording_mode: r.recording_mode,
        view_count: r.view_count,
        shareable_token: r.shareable_token,
        created_at: r.created_at,
        description: r.description,
        thumbnail_url: thumbnailUrl,
        recorded_by: r.first_name ? `${r.first_name} ${r.last_name}` : null,
        recorded_by_avatar: r.avatar_url || null,
      };
    })
  );

  res.json({ recordings, total, page: pageNum, limit: limitNum });
}));

// GET /api/videos/:id/comments
// Public — no auth. Returns comments for a video.
router.get('/:id/comments', asyncHandler(async (req, res) => {
  const { id } = req.params;

  const result = await pool.query(
    `SELECT vc.id, vc.timestamp_seconds, vc.text, vc.created_at,
            u.first_name || ' ' || u.last_name AS author,
            u.avatar_url AS author_avatar
     FROM video_comments vc
     LEFT JOIN users u ON u.id = vc.user_id
     WHERE vc.video_id = $1
     ORDER BY vc.timestamp_seconds ASC`,
    [id]
  );

  res.json({ comments: result.rows });
}));

// POST /api/videos/:id/comments
// Auth required. Adds a timestamped comment.
router.post('/:id/comments', requireAuth, asyncHandler(async (req, res) => {
  const { id } = req.params;
  const { timestamp_seconds, text } = req.body;
  const userId = req.user?.id;

  if (timestamp_seconds == null || !text) {
    return res.status(400).json({ error: 'timestamp_seconds and text are required' });
  }

  const result = await pool.query(
    `INSERT INTO video_comments (video_id, user_id, timestamp_seconds, text)
     VALUES ($1, $2, $3, $4)
     RETURNING id, timestamp_seconds, text, created_at`,
    [id, userId, timestamp_seconds, text]
  );

  const comment = result.rows[0];

  // Fetch user info for response
  const userResult = await pool.query(
    'SELECT first_name, last_name, avatar_url FROM users WHERE id = $1',
    [userId]
  );
  const user = userResult.rows[0] || {};

  res.status(201).json({
    ...comment,
    author: user.first_name ? `${user.first_name} ${user.last_name}` : null,
    author_avatar: user.avatar_url || null,
  });
}));

// GET /api/videos
// Auth required. Returns the current user's recordings.
router.get('/', requireAuth, asyncHandler(async (req, res) => {
  const userId = req.user?.id;

  const result = await pool.query(
    `SELECT id, title, duration_seconds, file_size_bytes, status, shareable_token, created_at
     FROM video_recordings
     WHERE uploaded_by = $1 AND deleted_at IS NULL
     ORDER BY created_at DESC
     LIMIT 50`,
    [userId]
  );

  const baseUrl = process.env.APP_BASE_URL || '';
  const recordings = result.rows.map((r) => ({
    ...r,
    watch_url: r.status === 'ready' ? `${baseUrl}/videos/watch/${r.shareable_token}` : null,
  }));

  res.json({ recordings });
}));

// PATCH /api/videos/:id
// Auth required. Update metadata (owner or admin).
router.patch('/:id', requireAuth, asyncHandler(async (req, res) => {
  const { id } = req.params;
  const userId = req.user?.id;
  const userRole = req.user?.role;
  const { title, description, tags, category, access_level, allowed_users } = req.body;

  // Check ownership or admin
  const check = await pool.query('SELECT uploaded_by FROM video_recordings WHERE id = $1 AND deleted_at IS NULL', [id]);
  if (check.rows.length === 0) {
    return res.status(404).json({ error: 'Recording not found' });
  }
  const isOwner = check.rows[0].uploaded_by === userId;
  const isAdmin = userRole === 'ADMIN' || userRole === 'SUPER_ADMIN';
  if (!isOwner && !isAdmin) {
    return res.status(403).json({ error: 'Not authorized' });
  }

  const updates = ['updated_at = NOW()'];
  const values = [];
  let idx = 1;

  if (title !== undefined) { updates.push(`title = $${idx++}`); values.push(title); }
  if (description !== undefined) { updates.push(`description = $${idx++}`); values.push(description); }
  if (tags !== undefined) { updates.push(`tags = $${idx++}`); values.push(JSON.stringify(tags)); }
  if (category !== undefined) { updates.push(`category = $${idx++}`); values.push(category); }
  if (access_level !== undefined) { updates.push(`access_level = $${idx++}`); values.push(access_level); }
  if (allowed_users !== undefined) { updates.push(`allowed_users = $${idx++}`); values.push(JSON.stringify(allowed_users)); }

  if (values.length === 0) {
    return res.status(400).json({ error: 'No fields to update' });
  }

  values.push(id);
  await pool.query(
    `UPDATE video_recordings SET ${updates.join(', ')} WHERE id = $${idx}`,
    values
  );

  logger.info({ videoId: id, userId }, '[Videos] Recording metadata updated');

  res.json({ success: true });
}));

// DELETE /api/videos/:id
// Auth required. Soft delete (owner or admin).
router.delete('/:id', requireAuth, asyncHandler(async (req, res) => {
  const { id } = req.params;
  const userId = req.user?.id;
  const userRole = req.user?.role;

  const check = await pool.query('SELECT uploaded_by FROM video_recordings WHERE id = $1 AND deleted_at IS NULL', [id]);
  if (check.rows.length === 0) {
    return res.status(404).json({ error: 'Recording not found' });
  }
  const isOwner = check.rows[0].uploaded_by === userId;
  const isAdmin = userRole === 'ADMIN' || userRole === 'SUPER_ADMIN';
  if (!isOwner && !isAdmin) {
    return res.status(403).json({ error: 'Not authorized' });
  }

  await pool.query('UPDATE video_recordings SET deleted_at = NOW() WHERE id = $1', [id]);

  logger.info({ videoId: id, userId }, '[Videos] Recording soft-deleted');

  res.json({ success: true });
}));

module.exports = router;
