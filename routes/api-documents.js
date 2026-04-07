const express = require('express');
const router = express.Router();
const multer = require('multer');
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

// POST /api/documents - Upload a new document
router.post('/', upload.single('file'), asyncHandler(async (req, res) => {
  try {
    const pool = getLocationPool(req);
    if (!pool) {
      return res.status(500).json({ error: 'Database connection not available' });
    }

    if (!req.file) {
      return res.status(400).json({ error: 'No file uploaded' });
    }

    const {
      name,
      description,
      type,
      client_id,
      contractor_id
    } = req.body;

    // Validate required fields
    if (!name) {
      return res.status(400).json({ 
        error: 'Missing required fields',
        details: 'Name is required'
      });
    }

    // Check if documents table exists (cached)
    const docsExists = await tableExists(pool, 'documents');

    if (!docsExists) {
      return res.status(500).json({ 
        error: 'Documents table does not exist',
        details: 'Please run the migration to create the documents table'
      });
    }

    // Upload to Cloudinary
    const isImage = req.file.mimetype.startsWith('image/');
    const uploadResult = await new Promise((resolve, reject) => {
      const stream = cloudinary.uploader.upload_stream(
        { folder: 'acme-ops/documents', resource_type: isImage ? 'image' : 'raw', use_filename: true, unique_filename: true },
        (error, result) => error ? reject(error) : resolve(result)
      );
      stream.end(req.file.buffer);
    });

    // Insert into database
    const insertQuery = `
      INSERT INTO documents (
        name, description, file_name, file_path, file_size, type,
        client_id, contractor_id, date_created, last_updated
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, NOW(), NOW())
      RETURNING *
    `;

    const { rows } = await pool.query(insertQuery, [
      name,
      description || '',
      req.file.originalname,
      uploadResult.secure_url,
      req.file.size,
      type || 'other',
      client_id || null,
      contractor_id || null
    ]);

    res.status(201).json({ document: rows[0] });
  } catch (error) {
    logger.error({ err: error }, 'Error uploading document:');
    res.status(500).json({
      error: 'Failed to upload document',
      details: error.message,
      stack: process.env.NODE_ENV === 'development' ? error.stack : undefined
    });
  }
}));

// GET /api/documents/:id/download - Download a document
router.get('/:id/download', asyncHandler(async (req, res) => {
  try {
    const pool = getLocationPool(req);
    if (!pool) {
      return res.status(500).json({ error: 'Database connection not available' });
    }

    const documentId = req.params.id;

    const { rows } = await pool.query(
      'SELECT * FROM documents WHERE id = $1',
      [documentId]
    );

    if (rows.length === 0) {
      return res.status(404).json({ error: 'Document not found' });
    }

    const document = rows[0];

    // file_path is a Cloudinary URL — redirect to it
    if (document.file_path.startsWith('http')) {
      return res.redirect(document.file_path);
    }

    // Legacy: local file path (pre-migration uploads)
    return res.status(404).json({ error: 'File stored on local disk and no longer available. Please re-upload.' });
  } catch (error) {
    logger.error({ err: error }, 'Error downloading document:');
    res.status(500).json({
      error: 'Failed to download document',
      details: error.message
    });
  }
}));

// DELETE /api/documents/:id - Delete a document
router.delete('/:id', asyncHandler(async (req, res) => {
  try {
    const pool = getLocationPool(req);
    if (!pool) {
      return res.status(500).json({ error: 'Database connection not available' });
    }

    const documentId = req.params.id;

    // Get document info before deleting
    const { rows } = await pool.query(
      'SELECT * FROM documents WHERE id = $1',
      [documentId]
    );

    if (rows.length === 0) {
      return res.status(404).json({ error: 'Document not found' });
    }

    const document = rows[0];

    // Delete file from Cloudinary
    if (document.file_path?.includes('cloudinary.com')) {
      const match = document.file_path.match(/\/upload\/(?:v\d+\/)?(.+?)(?:\.\w+)?$/);
      if (match) {
        const isImage = document.file_path.match(/\.(jpg|jpeg|png|gif|webp)$/i);
        await cloudinary.uploader.destroy(match[1], { resource_type: isImage ? 'image' : 'raw' })
          .catch(e => logger.warn({ data: e.message }, 'Cloudinary delete failed, continuing:'));
      }
    }

    // Delete from database
    await pool.query('DELETE FROM documents WHERE id = $1', [documentId]);

    res.json({ message: 'Document deleted successfully' });
  } catch (error) {
    logger.error({ err: error }, 'Error deleting document:');
    res.status(500).json({
      error: 'Failed to delete document',
      details: error.message
    });
  }
}));

module.exports = router;

