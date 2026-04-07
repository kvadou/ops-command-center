const express = require('express');
const router = express.Router();
const multer = require('multer');
const path = require('path');
const { tableExists } = require('../utils/schema-cache');
const { cloudinary } = global;

// Configure multer for memory storage (upload to Cloudinary, not disk)
const upload = multer({
  storage: multer.memoryStorage(),
  limits: {
    fileSize: 10 * 1024 * 1024 // 10MB limit
  }
});

const { getLocationPool } = require('../utils/pool');
const { asyncHandler } = require('../middleware/error-handler');
const { logger } = require('../utils/logger');

// GET /api/public-files - List all public files
router.get('/', asyncHandler(async (req, res) => {
  try {
    const pool = getLocationPool(req);
    if (!pool) {
      return res.status(500).json({ error: 'Database connection not available' });
    }

    const { search, page = 1, limit = 50 } = req.query;
    const params = [];
    let paramCount = 0;
    let whereConditions = [];

    let baseQuery = `FROM public_files WHERE 1=1`;

    if (search) {
      paramCount++;
      whereConditions.push(`(
        file_name ILIKE $${paramCount} OR
        original_name ILIKE $${paramCount} OR
        uploader_name ILIKE $${paramCount}
      )`);
      params.push(`%${search}%`);
    }

    if (whereConditions.length > 0) {
      baseQuery += ` AND ${whereConditions.join(' AND ')}`;
    }

    const countQuery = `SELECT COUNT(*) as total ${baseQuery}`;
    const countResult = await pool.query(countQuery, params);
    const total = parseInt(countResult.rows[0].total, 10);
    const totalPages = Math.ceil(total / limit);
    const offset = (page - 1) * limit;

    const selectQuery = `
      SELECT
        id,
        file_name,
        original_name,
        file_path,
        file_size,
        file_type,
        mime_type,
        uploader_id,
        uploader_name,
        date_uploaded,
        last_updated
      ${baseQuery}
      ORDER BY date_uploaded DESC
      LIMIT $${paramCount + 1} OFFSET $${paramCount + 2}
    `;

    params.push(limit, offset);
    const { rows: files } = await pool.query(selectQuery, params);

    res.json({
      data: files,
      'public-files': files,
      pagination: { page, limit, total, totalPages }
    });
  } catch (error) {
    logger.error({ err: error }, 'Error fetching public files list:');
    res.status(500).json({
      error: 'Failed to fetch public files list',
      details: error.message,
      stack: process.env.NODE_ENV === 'development' ? error.stack : undefined
    });
  }
}));

// POST /api/public-files - Upload a new public file
router.post('/', upload.single('file'), asyncHandler(async (req, res) => {
  try {
    const pool = getLocationPool(req);
    if (!pool) {
      return res.status(500).json({ error: 'Database connection not available' });
    }

    if (!req.file) {
      return res.status(400).json({ error: 'No file uploaded' });
    }

    // Get user info from request (if available)
    const user = req.user || {};
    const uploaderId = user.id || null;
    const uploaderName = user.first_name && user.last_name 
      ? `${user.first_name} ${user.last_name}`
      : user.email || 'Unknown';

    // Determine file type from extension
    const ext = path.extname(req.file.originalname).toLowerCase();
    let fileType = 'other';
    if (['.jpg', '.jpeg', '.png', '.gif', '.webp', '.svg'].includes(ext)) {
      fileType = 'image';
    } else if (ext === '.pdf') {
      fileType = 'pdf';
    } else if (['.doc', '.docx'].includes(ext)) {
      fileType = 'document';
    }

    // Check if public_files table exists (cached)
    const pfExists = await tableExists(pool, 'public_files');

    if (!pfExists) {
      return res.status(500).json({
        error: 'Public files table does not exist',
        details: 'Please run the migration to create the public_files table'
      });
    }

    // Upload to Cloudinary
    const isImage = req.file.mimetype.startsWith('image/');
    const uploadResult = await new Promise((resolve, reject) => {
      const stream = cloudinary.uploader.upload_stream(
        { folder: 'acme-ops/public-files', resource_type: isImage ? 'image' : 'raw', use_filename: true, unique_filename: true },
        (error, result) => error ? reject(error) : resolve(result)
      );
      stream.end(req.file.buffer);
    });

    // Insert into database
    const insertQuery = `
      INSERT INTO public_files (
        file_name, original_name, file_path, file_size, file_type, mime_type,
        uploader_id, uploader_name, date_uploaded, last_updated
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, NOW(), NOW())
      RETURNING *
    `;

    const { rows } = await pool.query(insertQuery, [
      req.file.originalname,
      req.file.originalname,
      uploadResult.secure_url,
      req.file.size,
      fileType,
      req.file.mimetype,
      uploaderId,
      uploaderName
    ]);

    res.json({
      success: true,
      file: rows[0],
      url: uploadResult.secure_url
    });
  } catch (error) {
    logger.error({ err: error }, 'Error uploading public file:');
    res.status(500).json({
      error: 'Failed to upload public file',
      details: error.message,
      stack: process.env.NODE_ENV === 'development' ? error.stack : undefined
    });
  }
}));

// DELETE /api/public-files/:id - Delete a public file
router.delete('/:id', asyncHandler(async (req, res) => {
  try {
    const pool = getLocationPool(req);
    if (!pool) {
      return res.status(500).json({ error: 'Database connection not available' });
    }

    const { id } = req.params;

    // Get file info before deleting
    const { rows } = await pool.query(
      'SELECT file_path FROM public_files WHERE id = $1',
      [id]
    );

    if (rows.length === 0) {
      return res.status(404).json({ error: 'File not found' });
    }

    const filePath = rows[0].file_path;

    // Delete from database
    await pool.query('DELETE FROM public_files WHERE id = $1', [id]);

    // Delete from Cloudinary
    if (filePath?.includes('cloudinary.com')) {
      const match = filePath.match(/\/upload\/(?:v\d+\/)?(.+?)(?:\.\w+)?$/);
      if (match) {
        const isImage = filePath.match(/\.(jpg|jpeg|png|gif|webp)$/i);
        await cloudinary.uploader.destroy(match[1], { resource_type: isImage ? 'image' : 'raw' })
          .catch(e => logger.warn({ data: e.message }, 'Cloudinary delete failed, continuing:'));
      }
    }

    res.json({ success: true, message: 'File deleted successfully' });
  } catch (error) {
    logger.error({ err: error }, 'Error deleting public file:');
    res.status(500).json({
      error: 'Failed to delete public file',
      details: error.message,
      stack: process.env.NODE_ENV === 'development' ? error.stack : undefined
    });
  }
}));

module.exports = router;

