const express = require('express');
const router = express.Router();
const { pool, axios, cloudinary, auth } = global;
const { getPool } = require('../database-connections');
const qrGeneratorService = require('../services/qr-code-generator-service');
const { asyncHandler } = require('../middleware/error-handler');
const { logger } = require('../utils/logger');

// Helper function to get the correct database connection based on subdomain
function getLocationPool(req) {
  const hostname = req.get('host') || req.hostname;
  let location = 'production'; // default

  // Check if we're running locally
  if (hostname && (hostname.includes('localhost') || hostname.includes('127.0.0.1') || hostname.includes(':3001') || hostname.includes(':5001'))) {
    location = 'local';
  } else if (hostname) {
    const subdomain = hostname.split('.')[0];
    switch (subdomain) {
      case 'eastside':
        location = 'eastside';
        break;
      case 'westside':
        location = 'westside';
        break;
      case 'join':
        location = 'production';
        break;
      default:
        location = 'production';
    }
  }

  return getPool(location);
}

// QR Code Generator API configuration
// v1 API: Static QR code generation (https://api.qr-code-generator.com/v1)
// v3-preview API: Dynamic QR code management (https://api.qrcg.com/v3-preview) - requires PRO account
// See OpenAPI spec: docs/openapi.json
const QR_CODE_API_BASE = 'https://api.qr-code-generator.com/v1';
const QR_CODE_PRO_API_BASE = 'https://api.qrcg.com/v3-preview';
const QR_CODE_API_TOKEN = process.env.QR_CODE_GENERATOR_API_KEY || 'REPLACE_ME';

// Base URL for tracking URLs (used for self-hosted QR codes)
const TRACKING_BASE_URL = process.env.TRACKING_BASE_URL || 'https://join.acmeops.com';

/**
 * Generate a QR code using the QR Code Generator API
 */
const generateQRCode = async (options) => {
  const {
    qr_code_text,
    image_format = 'SVG',
    image_width = 500,
    frame_name = 'no-frame',
    frame_color = '#000000',
    frame_text = '',
    frame_icon_name = '',
    foreground_color = '#000000',
    background_color = '#FFFFFF',
    marker_left_inner_color = '#000000',
    marker_left_outer_color = '#000000',
    marker_right_inner_color = '#000000',
    marker_right_outer_color = '#000000',
    marker_bottom_inner_color = '#000000',
    marker_bottom_outer_color = '#000000',
    marker_left_template = 'version1',
    marker_right_template = 'version1',
    marker_bottom_template = 'version1',
    qr_code_logo = 'no-logo'
  } = options;

  const requestBody = {
    qr_code_text,
    image_format,
    frame_name,
    qr_code_logo
  };

  // Only add optional parameters if they have non-default values
  if (image_format === 'PNG' || image_format === 'JPG') {
    requestBody.image_width = image_width;
  }

  if (frame_name !== 'no-frame') {
    if (frame_color !== '#000000') requestBody.frame_color = frame_color;
    if (frame_text) requestBody.frame_text = frame_text;
    if (frame_icon_name) requestBody.frame_icon_name = frame_icon_name;
  }

  if (foreground_color !== '#000000') requestBody.foreground_color = foreground_color;
  if (background_color !== '#FFFFFF') requestBody.background_color = background_color;

  // Marker colors
  if (marker_left_inner_color !== '#000000') requestBody.marker_left_inner_color = marker_left_inner_color;
  if (marker_left_outer_color !== '#000000') requestBody.marker_left_outer_color = marker_left_outer_color;
  if (marker_right_inner_color !== '#000000') requestBody.marker_right_inner_color = marker_right_inner_color;
  if (marker_right_outer_color !== '#000000') requestBody.marker_right_outer_color = marker_right_outer_color;
  if (marker_bottom_inner_color !== '#000000') requestBody.marker_bottom_inner_color = marker_bottom_inner_color;
  if (marker_bottom_outer_color !== '#000000') requestBody.marker_bottom_outer_color = marker_bottom_outer_color;

  // Marker templates
  if (marker_left_template !== 'version1') requestBody.marker_left_template = marker_left_template;
  if (marker_right_template !== 'version1') requestBody.marker_right_template = marker_right_template;
  if (marker_bottom_template !== 'version1') requestBody.marker_bottom_template = marker_bottom_template;

  try {
    const response = await axios.post(
      `${QR_CODE_API_BASE}/create?access-token=${QR_CODE_API_TOKEN}`,
      requestBody,
      {
        responseType: 'arraybuffer',
        headers: {
          'Content-Type': 'application/json'
        }
      }
    );

    return {
      success: true,
      data: response.data,
      contentType: response.headers['content-type'],
      format: image_format
    };
  } catch (error) {
    logger.error({ data: error.response?.data || error.message }, 'QR Code API Error:');
    throw new Error(error.response?.data?.message || 'Failed to generate QR code');
  }
};

/**
 * Upload QR code image to Cloudinary
 */
const uploadToCloudinary = async (buffer, format, name) => {
  return new Promise((resolve, reject) => {
    const uploadStream = cloudinary.uploader.upload_stream(
      {
        folder: 'acme-ops/qr-codes',
        public_id: `qr-${name.replace(/[^a-zA-Z0-9]/g, '-')}-${Date.now()}`,
        resource_type: 'image',
        format: format.toLowerCase()
      },
      (error, result) => {
        if (error) {
          reject(error);
        } else {
          resolve(result);
        }
      }
    );
    uploadStream.end(buffer);
  });
};

/**
 * Fetch Dynamic QR codes from QR Code Generator PRO API
 * Documentation: https://dev.qrcg.com
 * Endpoint: GET /v3-preview/qrcodes
 */
const fetchProQRCodes = async (perPage = 50, cursor = null) => {
  try {
    let url = `${QR_CODE_PRO_API_BASE}/qrcodes?perPage=${perPage}`;
    if (cursor) {
      url += `&cursor=${cursor}`;
    }
    
    logger.info(`Fetching QR codes from: ${url}`);
    
    const response = await axios.get(url, {
      headers: {
        'Authorization': `Key ${QR_CODE_API_TOKEN}`,
        'Content-Type': 'application/json'
      }
    });
    
    logger.info(`Successfully fetched QR codes. Response has ${response.data?.data?.length || 0} items`);
    
    return {
      success: true,
      data: response.data
    };
  } catch (error) {
    logger.error({ status: error.response?.status, error: error.response?.data || error.message }, 'Error fetching PRO QR codes');
    return {
      success: false,
      error: error.response?.data?.message || error.response?.data || error.message
    };
  }
};

/**
 * Fetch a single Dynamic QR code from QR Code Generator PRO API
 * Endpoint: GET /v3-preview/qrcodes/{qrcodeId}
 */
const fetchProQRCode = async (qrCodeId) => {
  try {
    const response = await axios.get(`${QR_CODE_PRO_API_BASE}/qrcodes/${qrCodeId}`, {
      headers: {
        'Authorization': `Key ${QR_CODE_API_TOKEN}`,
        'Content-Type': 'application/json'
      }
    });
    
    return {
      success: true,
      data: response.data
    };
  } catch (error) {
    logger.error({ data: error.response?.data || error.message }, 'Error fetching PRO QR code:');
    return {
      success: false,
      error: error.response?.data?.message || error.response?.data || error.message
    };
  }
};

// =====================
// QR CODE CRUD ENDPOINTS
// =====================

/**
 * GET /api/qr-codes/remote - Fetch QR codes directly from QR Code Generator PRO API
 */
router.get('/remote', auth, asyncHandler(async (req, res) => {
  try {
    const { perPage = 50, cursor } = req.query;
    
    const result = await fetchProQRCodes(parseInt(perPage), cursor);
    
    if (!result.success) {
      return res.status(500).json({ error: result.error });
    }
    
    res.json(result.data);
  } catch (error) {
    logger.error({ err: error }, 'Error fetching remote QR codes:');
    res.status(500).json({ error: 'Failed to fetch QR codes from remote API' });
  }
}));

/**
 * POST /api/qr-codes/sync - Sync QR codes from PRO API to local database
 * 
 * Response structure from v3-preview API:
 * {
 *   "data": [{
 *     "id": "12345",
 *     "type": "url",
 *     "title": "My QR Code",
 *     "status": "active",
 *     "createdAt": "2025-10-20T12:00:00Z",
 *     "scans": { "total": 100, "unique": 75 },
 *     "previewUrl": "https://cdn.qr-code-generator.com/..."
 *   }],
 *   "pagination": { "nextCursor": "...", "hasMore": true }
 * }
 */
router.post('/sync', auth, asyncHandler(async (req, res) => {
  try {
    let allQRCodes = [];
    let cursor = null;
    let hasMore = true;
    let pageCount = 0;
    const maxPages = 10; // Safety limit

    logger.info('Starting QR code sync from PRO API...');

    // Fetch all QR codes from PRO API (with pagination)
    while (hasMore && pageCount < maxPages) {
      const result = await fetchProQRCodes(50, cursor);

      if (!result.success) {
        logger.error({ data: result.error }, 'Sync failed:');
        return res.status(500).json({ error: result.error });
      }

      // v3-preview API returns { data: [...], pagination: { nextCursor, hasMore } }
      const qrCodes = result.data.data || [];
      logger.info(`Page ${pageCount + 1}: Got ${qrCodes.length} QR codes`);
      
      if (Array.isArray(qrCodes)) {
        allQRCodes = allQRCodes.concat(qrCodes);
      }

      // Handle pagination
      const pagination = result.data.pagination || {};
      cursor = pagination.nextCursor;
      hasMore = pagination.hasMore === true && cursor;
      pageCount++;
    }

    logger.info(`Total QR codes fetched: ${allQRCodes.length}`);

    if (allQRCodes.length === 0) {
      return res.json({
        success: true,
        message: 'No QR codes found in your PRO account',
        synced: 0,
        created: 0,
        updated: 0,
        total: 0
      });
    }

    let synced = 0;
    let created = 0;
    let updated = 0;

    // Sync each QR code to local database
    for (const remoteQR of allQRCodes) {
      const remoteId = String(remoteQR.id);

      // Check if we already have this QR code (by remote_id)
      const existing = await pool.query(
        'SELECT id FROM qr_codes WHERE remote_id = $1',
        [remoteId]
      );

      // Extract data from v3-preview API response structure
      const name = remoteQR.title || 'Untitled';
      const destinationUrl = remoteQR.url || ''; // Note: List endpoint may not include url, need to fetch detail
      const imageUrl = remoteQR.previewUrl || '';
      const scans = remoteQR.scans?.total || 0;
      const uniqueScans = remoteQR.scans?.unique || 0;
      const isActive = remoteQR.status === 'active';
      
      if (existing.rows.length > 0) {
        // Update existing record
        await pool.query(`
          UPDATE qr_codes SET
            name = $1,
            destination_url = $2,
            qr_code_image_url = $3,
            total_scans = $4,
            unique_scans = $5,
            is_active = $6,
            updated_at = NOW()
          WHERE remote_id = $7
        `, [name, destinationUrl, imageUrl, scans, uniqueScans, isActive, remoteId]);
        updated++;
      } else {
        // Insert new record
        await pool.query(`
          INSERT INTO qr_codes (
            remote_id, name, destination_url, qr_code_image_url,
            total_scans, unique_scans, is_active, created_by
          ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
        `, [remoteId, name, destinationUrl, imageUrl, scans, uniqueScans, isActive, req.user?.email || 'system']);
        created++;
      }
      synced++;
    }
    
    res.json({
      success: true,
      message: `Synced ${synced} QR codes (${created} created, ${updated} updated)`,
      synced,
      created,
      updated,
      total: allQRCodes.length
    });
  } catch (error) {
    logger.error({ err: error }, 'Error syncing QR codes:');
    res.status(500).json({ error: error.message || 'Failed to sync QR codes' });
  }
}));

/**
 * GET /api/qr-codes - List all QR codes
 */
router.get('/', auth, asyncHandler(async (req, res) => {
  try {
    const { category, is_active, search, limit = 50, offset = 0 } = req.query;
    
    let query = `
      SELECT * FROM qr_codes
      WHERE deleted_at IS NULL
    `;
    const params = [];
    let paramIndex = 1;

    if (category) {
      query += ` AND category = $${paramIndex++}`;
      params.push(category);
    }

    if (is_active !== undefined) {
      query += ` AND is_active = $${paramIndex++}`;
      params.push(is_active === 'true');
    }

    if (search) {
      query += ` AND (name ILIKE $${paramIndex} OR description ILIKE $${paramIndex} OR destination_url ILIKE $${paramIndex})`;
      params.push(`%${search}%`);
      paramIndex++;
    }

    query += ` ORDER BY created_at DESC LIMIT $${paramIndex++} OFFSET $${paramIndex++}`;
    params.push(parseInt(limit), parseInt(offset));

    const result = await pool.query(query, params);
    
    // Get total count for pagination
    let countQuery = `SELECT COUNT(*) FROM qr_codes WHERE deleted_at IS NULL`;
    const countParams = [];
    let countParamIndex = 1;
    
    if (category) {
      countQuery += ` AND category = $${countParamIndex++}`;
      countParams.push(category);
    }
    if (is_active !== undefined) {
      countQuery += ` AND is_active = $${countParamIndex++}`;
      countParams.push(is_active === 'true');
    }
    if (search) {
      countQuery += ` AND (name ILIKE $${countParamIndex} OR description ILIKE $${countParamIndex} OR destination_url ILIKE $${countParamIndex})`;
      countParams.push(`%${search}%`);
    }
    
    const countResult = await pool.query(countQuery, countParams);

    res.json({
      qrCodes: result.rows,
      total: parseInt(countResult.rows[0].count),
      limit: parseInt(limit),
      offset: parseInt(offset)
    });
  } catch (error) {
    logger.error({ err: error }, 'Error fetching QR codes:');
    res.status(500).json({ error: 'Failed to fetch QR codes' });
  }
}));

/**
 * GET /api/qr-codes/categories - Get all unique categories
 */
router.get('/categories', auth, asyncHandler(async (req, res) => {
  try {
    const result = await pool.query(`
      SELECT DISTINCT category, COUNT(*) as count
      FROM qr_codes
      WHERE deleted_at IS NULL AND category IS NOT NULL
      GROUP BY category
      ORDER BY category
    `);
    res.json(result.rows);
  } catch (error) {
    logger.error({ err: error }, 'Error fetching categories:');
    res.status(500).json({ error: 'Failed to fetch categories' });
  }
}));

/**
 * GET /api/qr-codes/internal - List only self-hosted QR codes (source = 'internal')
 * NOTE: This route MUST be defined before /:id to avoid route conflicts
 */
router.get('/internal', auth, asyncHandler(async (req, res) => {
  try {
    const { category, is_active, search, folder_id, limit = 50, offset = 0 } = req.query;

    let query = `
      SELECT * FROM qr_codes
      WHERE deleted_at IS NULL AND (source = 'internal' OR source IS NULL)
    `;
    const params = [];
    let paramIndex = 1;

    if (category) {
      query += ` AND category = $${paramIndex++}`;
      params.push(category);
    }

    if (is_active !== undefined) {
      query += ` AND is_active = $${paramIndex++}`;
      params.push(is_active === 'true');
    }

    if (search) {
      query += ` AND (name ILIKE $${paramIndex} OR description ILIKE $${paramIndex} OR destination_url ILIKE $${paramIndex})`;
      params.push(`%${search}%`);
      paramIndex++;
    }

    // Filter by folder
    if (folder_id) {
      query += ` AND folder_id = $${paramIndex++}`;
      params.push(folder_id);
    }

    // Exclude external codes
    query += ` AND remote_id IS NULL`;

    query += ` ORDER BY created_at DESC LIMIT $${paramIndex++} OFFSET $${paramIndex++}`;
    params.push(parseInt(limit), parseInt(offset));

    const result = await pool.query(query, params);

    // Get total count
    let countQuery = `SELECT COUNT(*) FROM qr_codes WHERE deleted_at IS NULL AND (source = 'internal' OR source IS NULL) AND remote_id IS NULL`;
    const countParams = [];
    let countParamIndex = 1;

    if (category) {
      countQuery += ` AND category = $${countParamIndex++}`;
      countParams.push(category);
    }
    if (is_active !== undefined) {
      countQuery += ` AND is_active = $${countParamIndex++}`;
      countParams.push(is_active === 'true');
    }
    if (search) {
      countQuery += ` AND (name ILIKE $${countParamIndex} OR description ILIKE $${countParamIndex} OR destination_url ILIKE $${countParamIndex})`;
      countParams.push(`%${search}%`);
      countParamIndex++;
    }
    if (folder_id) {
      countQuery += ` AND folder_id = $${countParamIndex++}`;
      countParams.push(folder_id);
    }

    const countResult = await pool.query(countQuery, countParams);

    res.json({
      qrCodes: result.rows,
      total: parseInt(countResult.rows[0].count),
      limit: parseInt(limit),
      offset: parseInt(offset)
    });
  } catch (error) {
    logger.error({ err: error }, 'Error fetching internal QR codes:');
    res.status(500).json({ error: 'Failed to fetch QR codes' });
  }
}));

/**
 * GET /api/qr-codes/external - List only external/synced QR codes (source = 'external')
 * NOTE: This route MUST be defined before /:id to avoid route conflicts
 */
router.get('/external', auth, asyncHandler(async (req, res) => {
  try {
    const { category, is_active, search, limit = 50, offset = 0 } = req.query;
    
    let query = `
      SELECT * FROM qr_codes
      WHERE deleted_at IS NULL AND (source = 'external' OR remote_id IS NOT NULL)
    `;
    const params = [];
    let paramIndex = 1;

    if (category) {
      query += ` AND category = $${paramIndex++}`;
      params.push(category);
    }

    if (is_active !== undefined) {
      query += ` AND is_active = $${paramIndex++}`;
      params.push(is_active === 'true');
    }

    if (search) {
      query += ` AND (name ILIKE $${paramIndex} OR description ILIKE $${paramIndex} OR destination_url ILIKE $${paramIndex})`;
      params.push(`%${search}%`);
      paramIndex++;
    }

    query += ` ORDER BY created_at DESC LIMIT $${paramIndex++} OFFSET $${paramIndex++}`;
    params.push(parseInt(limit), parseInt(offset));

    const result = await pool.query(query, params);
    
    // Get total count
    let countQuery = `SELECT COUNT(*) FROM qr_codes WHERE deleted_at IS NULL AND (source = 'external' OR remote_id IS NOT NULL)`;
    const countParams = [];
    let countParamIndex = 1;
    
    if (category) {
      countQuery += ` AND category = $${countParamIndex++}`;
      countParams.push(category);
    }
    if (is_active !== undefined) {
      countQuery += ` AND is_active = $${countParamIndex++}`;
      countParams.push(is_active === 'true');
    }
    if (search) {
      countQuery += ` AND (name ILIKE $${countParamIndex} OR description ILIKE $${countParamIndex} OR destination_url ILIKE $${countParamIndex})`;
      countParams.push(`%${search}%`);
    }
    
    const countResult = await pool.query(countQuery, countParams);

    res.json({
      qrCodes: result.rows,
      total: parseInt(countResult.rows[0].count),
      limit: parseInt(limit),
      offset: parseInt(offset)
    });
  } catch (error) {
    logger.error({ err: error }, 'Error fetching external QR codes:');
    res.status(500).json({ error: 'Failed to fetch QR codes' });
  }
}));

// =====================================================
// PREMIUM ROUTES - Must be defined BEFORE /:id to avoid conflicts
// =====================================================

/**
 * GET /api/qr-codes/templates - List all QR code templates
 * NOTE: Must be before /:id route
 */
router.get('/templates', auth, asyncHandler(async (req, res) => {
  try {
    const { category, include_premium = 'true' } = req.query;
    
    let query = `
      SELECT * FROM qr_code_templates
      WHERE is_active = true
    `;
    const params = [];
    let paramIndex = 1;
    
    if (category) {
      query += ` AND category = $${paramIndex++}`;
      params.push(category);
    }
    
    if (include_premium === 'false') {
      query += ` AND is_premium = false`;
    }
    
    query += ` ORDER BY sort_order, name`;
    
    const result = await pool.query(query, params);
    res.json(result.rows);
  } catch (error) {
    logger.error({ err: error }, 'Error fetching templates:');
    res.status(500).json({ error: 'Failed to fetch templates' });
  }
}));

/**
 * GET /api/qr-codes/tags - List all tags
 * NOTE: Must be before /:id route
 */
router.get('/tags', auth, asyncHandler(async (req, res) => {
  try {
    const result = await pool.query(`
      SELECT t.*, 
        (SELECT COUNT(*) FROM qr_code_tag_assignments WHERE tag_id = t.id) as usage_count
      FROM qr_code_tags t
      ORDER BY t.name
    `);
    res.json(result.rows);
  } catch (error) {
    logger.error({ err: error }, 'Error fetching tags:');
    res.status(500).json({ error: 'Failed to fetch tags' });
  }
}));

/**
 * GET /api/qr-codes/folders - List all folders
 * NOTE: Must be before /:id route
 */
router.get('/folders', auth, asyncHandler(async (req, res) => {
  try {
    const result = await pool.query(`
      SELECT f.*, 
        (SELECT COUNT(*) FROM qr_codes WHERE folder_id = f.id AND deleted_at IS NULL) as qr_count
      FROM qr_code_folders f
      ORDER BY f.name
    `);
    res.json(result.rows);
  } catch (error) {
    logger.error({ err: error }, 'Error fetching folders:');
    res.status(500).json({ error: 'Failed to fetch folders' });
  }
}));

/**
 * GET /api/qr-codes/folders/tree - Get folder tree structure
 * NOTE: Must be before /:id route
 */
router.get('/folders/tree', auth, asyncHandler(async (req, res) => {
  try {
    const result = await pool.query(`
      SELECT f.*, 
        (SELECT COUNT(*) FROM qr_codes WHERE folder_id = f.id AND deleted_at IS NULL) as qr_count
      FROM qr_code_folders f
      ORDER BY f.parent_folder_id NULLS FIRST, f.name
    `);
    
    // Build tree structure
    const folders = result.rows;
    const folderMap = new Map();
    const tree = [];
    
    folders.forEach(f => {
      f.children = [];
      folderMap.set(f.id, f);
    });
    
    folders.forEach(f => {
      if (f.parent_folder_id && folderMap.has(f.parent_folder_id)) {
        folderMap.get(f.parent_folder_id).children.push(f);
      } else {
        tree.push(f);
      }
    });
    
    res.json(tree);
  } catch (error) {
    logger.error({ err: error }, 'Error fetching folder tree:');
    res.status(500).json({ error: 'Failed to fetch folder tree' });
  }
}));

/**
 * GET /api/qr-codes/stickers - Get available stickers
 * NOTE: Must be before /:id route
 */
router.get('/stickers', auth, asyncHandler(async (req, res) => {
  try {
    const result = await pool.query(`
      SELECT * FROM qr_code_stickers
      WHERE is_active = true
      ORDER BY category, sort_order, name
    `);
    res.json(result.rows);
  } catch (error) {
    logger.error({ err: error }, 'Error fetching stickers:');
    res.status(500).json({ error: 'Failed to fetch stickers' });
  }
}));

/**
 * GET /api/qr-codes/stats/summary - Get overall QR code statistics
 * NOTE: Must be before /:id route
 */
router.get('/stats/summary', auth, asyncHandler(async (req, res) => {
  try {
    const result = await pool.query(`
      SELECT 
        COUNT(*) as total_qr_codes,
        COUNT(*) FILTER (WHERE is_active = true) as active_qr_codes,
        COALESCE(SUM(total_scans), 0) as total_scans,
        COALESCE(SUM(unique_scans), 0) as total_unique_scans
      FROM qr_codes
      WHERE deleted_at IS NULL
    `);

    res.json(result.rows[0]);
  } catch (error) {
    logger.error({ err: error }, 'Error fetching QR code stats:');
    res.status(500).json({ error: 'Failed to fetch statistics' });
  }
}));

/**
 * GET /api/qr-codes/analytics/overview - Get overall analytics
 * NOTE: Must be before /:id route
 */
router.get('/analytics/overview', auth, asyncHandler(async (req, res) => {
  try {
    const { start_date, end_date } = req.query;
    
    let dateFilter = '';
    const params = [];
    
    if (start_date && end_date) {
      dateFilter = 'AND scanned_at BETWEEN $1 AND $2';
      params.push(start_date, end_date);
    }
    
    const [totalStats, dailyTrend, topCodes] = await Promise.all([
      pool.query(`
        SELECT 
          COUNT(*) as total_scans,
          COUNT(DISTINCT session_id) as unique_scans,
          COUNT(DISTINCT qr_code_id) as active_codes,
          COUNT(DISTINCT country) as countries
        FROM qr_code_scans
        WHERE 1=1 ${dateFilter}
      `, params),
      pool.query(`
        SELECT DATE(scanned_at) as date, COUNT(*) as scans
        FROM qr_code_scans
        WHERE scanned_at >= NOW() - INTERVAL '30 days'
        GROUP BY DATE(scanned_at)
        ORDER BY date
      `),
      pool.query(`
        SELECT q.id, q.name, COUNT(s.*) as scans
        FROM qr_codes q
        LEFT JOIN qr_code_scans s ON s.qr_code_id = q.id
        WHERE q.deleted_at IS NULL
        GROUP BY q.id, q.name
        ORDER BY scans DESC
        LIMIT 10
      `)
    ]);
    
    res.json({
      summary: totalStats.rows[0],
      daily_trend: dailyTrend.rows,
      top_codes: topCodes.rows
    });
  } catch (error) {
    logger.error({ err: error }, 'Error fetching analytics overview:');
    res.status(500).json({ error: 'Failed to fetch analytics overview' });
  }
}));

/**
 * GET /api/qr-codes/bulk/export - Export QR codes
 * NOTE: Must be before /:id route
 */
router.get('/bulk/export', auth, asyncHandler(async (req, res) => {
  try {
    const { format = 'csv', folder_id, tags, include_analytics = 'true' } = req.query;
    
    let query = `
      SELECT 
        q.*,
        ${include_analytics === 'true' ? `
        (SELECT COUNT(*) FROM qr_code_scans WHERE qr_code_id = q.id) as total_scans,
        (SELECT COUNT(DISTINCT session_id) FROM qr_code_scans WHERE qr_code_id = q.id) as unique_scans
        ` : ''}
      FROM qr_codes q
      WHERE q.deleted_at IS NULL
    `;
    const params = [];
    let paramIndex = 1;
    
    if (folder_id) {
      query += ` AND q.folder_id = $${paramIndex++}`;
      params.push(folder_id);
    }
    
    query += ` ORDER BY q.created_at DESC`;
    
    const result = await pool.query(query, params);
    
    if (format === 'json') {
      res.json(result.rows);
    } else {
      // CSV format
      const headers = ['id', 'name', 'destination_url', 'tracking_url', 'category', 'total_scans', 'unique_scans', 'is_active', 'created_at'];
      const csvRows = [headers.join(',')];
      
      result.rows.forEach(row => {
        const values = headers.map(h => {
          const val = row[h] ?? '';
          return typeof val === 'string' && val.includes(',') ? `"${val}"` : val;
        });
        csvRows.push(values.join(','));
      });
      
      res.setHeader('Content-Type', 'text/csv');
      res.setHeader('Content-Disposition', 'attachment; filename=qr-codes-export.csv');
      res.send(csvRows.join('\n'));
    }
  } catch (error) {
    logger.error({ err: error }, 'Error exporting QR codes:');
    res.status(500).json({ error: 'Failed to export QR codes' });
  }
}));

/**
 * GET /api/qr-codes/for-entity/:type/:id - Get QR code for a linked entity
 * NOTE: Must be before /:id route
 */
router.get('/for-entity/:type/:id', auth, asyncHandler(async (req, res) => {
  try {
    const { type, id } = req.params;
    
    const result = await pool.query(
      'SELECT * FROM qr_codes WHERE linked_entity_type = $1 AND linked_entity_id = $2 AND deleted_at IS NULL',
      [type, id]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'No QR code linked to this entity' });
    }

    res.json(result.rows[0]);
  } catch (error) {
    logger.error({ err: error }, 'Error fetching QR code for entity:');
    res.status(500).json({ error: 'Failed to fetch QR code' });
  }
}));

// =====================================================
// END OF ROUTES THAT NEED TO BE BEFORE /:id
// =====================================================

/**
 * GET /api/qr-codes/:id - Get a single QR code
 */
router.get('/:id', auth, asyncHandler(async (req, res) => {
  try {
    const { id } = req.params;
    const result = await pool.query(
      'SELECT * FROM qr_codes WHERE id = $1 AND deleted_at IS NULL',
      [id]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'QR code not found' });
    }

    res.json(result.rows[0]);
  } catch (error) {
    logger.error({ err: error }, 'Error fetching QR code:');
    res.status(500).json({ error: 'Failed to fetch QR code' });
  }
}));

/**
 * GET /api/qr-codes/:id/analytics - Get analytics for a QR code
 */
router.get('/:id/analytics', auth, asyncHandler(async (req, res) => {
  try {
    const { id } = req.params;
    const { days = 30 } = req.query;

    // Get basic stats
    const statsResult = await pool.query(`
      SELECT 
        COUNT(*) as total_scans,
        COUNT(DISTINCT session_id) as unique_scans,
        COUNT(DISTINCT country) as countries,
        MIN(scanned_at) as first_scan,
        MAX(scanned_at) as last_scan
      FROM qr_code_scans
      WHERE qr_code_id = $1
        AND scanned_at >= NOW() - INTERVAL '${parseInt(days)} days'
    `, [id]);

    // Get scans by day
    const dailyResult = await pool.query(`
      SELECT 
        DATE(scanned_at) as date,
        COUNT(*) as scans,
        COUNT(DISTINCT session_id) as unique_scans
      FROM qr_code_scans
      WHERE qr_code_id = $1
        AND scanned_at >= NOW() - INTERVAL '${parseInt(days)} days'
      GROUP BY DATE(scanned_at)
      ORDER BY date
    `, [id]);

    // Get scans by device type
    const deviceResult = await pool.query(`
      SELECT 
        device_type,
        COUNT(*) as count
      FROM qr_code_scans
      WHERE qr_code_id = $1
        AND scanned_at >= NOW() - INTERVAL '${parseInt(days)} days'
      GROUP BY device_type
      ORDER BY count DESC
    `, [id]);

    // Get scans by country
    const countryResult = await pool.query(`
      SELECT 
        country,
        COUNT(*) as count
      FROM qr_code_scans
      WHERE qr_code_id = $1
        AND scanned_at >= NOW() - INTERVAL '${parseInt(days)} days'
        AND country IS NOT NULL
      GROUP BY country
      ORDER BY count DESC
      LIMIT 10
    `, [id]);

    // Get recent scans
    const recentResult = await pool.query(`
      SELECT *
      FROM qr_code_scans
      WHERE qr_code_id = $1
      ORDER BY scanned_at DESC
      LIMIT 20
    `, [id]);

    res.json({
      summary: statsResult.rows[0],
      dailyScans: dailyResult.rows,
      deviceBreakdown: deviceResult.rows,
      topCountries: countryResult.rows,
      recentScans: recentResult.rows
    });
  } catch (error) {
    logger.error({ err: error }, 'Error fetching QR code analytics:');
    res.status(500).json({ error: 'Failed to fetch analytics' });
  }
}));

/**
 * POST /api/qr-codes - Create a new QR code
 */
router.post('/', auth, asyncHandler(async (req, res) => {
  try {
    const {
      name,
      description,
      destination_url,
      category,
      tags = [],
      // Design options
      frame_name = 'no-frame',
      frame_color = '#000000',
      frame_text = '',
      frame_icon_name = '',
      foreground_color = '#000000',
      background_color = '#FFFFFF',
      marker_left_inner_color = '#000000',
      marker_left_outer_color = '#000000',
      marker_right_inner_color = '#000000',
      marker_right_outer_color = '#000000',
      marker_bottom_inner_color = '#000000',
      marker_bottom_outer_color = '#000000',
      marker_left_template = 'version1',
      marker_right_template = 'version1',
      marker_bottom_template = 'version1',
      qr_code_logo = 'no-logo'
    } = req.body;

    if (!name || !destination_url) {
      return res.status(400).json({ error: 'Name and destination URL are required' });
    }

    // Generate the QR code
    const qrResult = await generateQRCode({
      qr_code_text: destination_url,
      image_format: 'PNG',
      image_width: 500,
      frame_name,
      frame_color,
      frame_text,
      frame_icon_name,
      foreground_color,
      background_color,
      marker_left_inner_color,
      marker_left_outer_color,
      marker_right_inner_color,
      marker_right_outer_color,
      marker_bottom_inner_color,
      marker_bottom_outer_color,
      marker_left_template,
      marker_right_template,
      marker_bottom_template,
      qr_code_logo
    });

    // Upload to Cloudinary
    let qr_code_image_url = null;
    try {
      const cloudinaryResult = await uploadToCloudinary(
        Buffer.from(qrResult.data),
        'png',
        name
      );
      qr_code_image_url = cloudinaryResult.secure_url;
    } catch (uploadError) {
      logger.error({ data: uploadError }, 'Cloudinary upload error:');
      // Continue without image URL - store base64 instead
    }

    // Also generate SVG for high-quality storage
    let qr_code_svg = null;
    try {
      const svgResult = await generateQRCode({
        qr_code_text: destination_url,
        image_format: 'SVG',
        frame_name,
        frame_color,
        frame_text,
        frame_icon_name,
        foreground_color,
        background_color,
        marker_left_inner_color,
        marker_left_outer_color,
        marker_right_inner_color,
        marker_right_outer_color,
        marker_bottom_inner_color,
        marker_bottom_outer_color,
        marker_left_template,
        marker_right_template,
        marker_bottom_template,
        qr_code_logo
      });
      qr_code_svg = svgResult.data.toString('utf-8');
    } catch (svgError) {
      logger.error({ data: svgError }, 'SVG generation error:');
    }

    // Save to database
    const result = await pool.query(`
      INSERT INTO qr_codes (
        name, description, destination_url, qr_code_image_url, qr_code_svg,
        frame_name, frame_color, frame_text, frame_icon_name,
        foreground_color, background_color,
        marker_left_inner_color, marker_left_outer_color,
        marker_right_inner_color, marker_right_outer_color,
        marker_bottom_inner_color, marker_bottom_outer_color,
        marker_left_template, marker_right_template, marker_bottom_template,
        qr_code_logo, category, tags, created_by
      ) VALUES (
        $1, $2, $3, $4, $5,
        $6, $7, $8, $9,
        $10, $11,
        $12, $13, $14, $15, $16, $17,
        $18, $19, $20,
        $21, $22, $23, $24
      )
      RETURNING *
    `, [
      name, description, destination_url, qr_code_image_url, qr_code_svg,
      frame_name, frame_color, frame_text, frame_icon_name,
      foreground_color, background_color,
      marker_left_inner_color, marker_left_outer_color,
      marker_right_inner_color, marker_right_outer_color,
      marker_bottom_inner_color, marker_bottom_outer_color,
      marker_left_template, marker_right_template, marker_bottom_template,
      qr_code_logo, category, JSON.stringify(tags), req.user?.email || 'system'
    ]);

    res.status(201).json(result.rows[0]);
  } catch (error) {
    logger.error({ err: error }, 'Error creating QR code:');
    res.status(500).json({ error: error.message || 'Failed to create QR code' });
  }
}));

/**
 * PUT /api/qr-codes/:id - Update a QR code
 */
router.put('/:id', auth, asyncHandler(async (req, res) => {
  try {
    const { id } = req.params;
    const {
      name,
      description,
      destination_url,
      category,
      tags,
      is_active,
      regenerate = false, // If true, regenerate the QR code image
      // Design options (only used if regenerate is true)
      frame_name,
      frame_color,
      frame_text,
      frame_icon_name,
      foreground_color,
      background_color,
      marker_left_inner_color,
      marker_left_outer_color,
      marker_right_inner_color,
      marker_right_outer_color,
      marker_bottom_inner_color,
      marker_bottom_outer_color,
      marker_left_template,
      marker_right_template,
      marker_bottom_template,
      qr_code_logo
    } = req.body;

    // Get existing record
    const existing = await pool.query(
      'SELECT * FROM qr_codes WHERE id = $1 AND deleted_at IS NULL',
      [id]
    );

    if (existing.rows.length === 0) {
      return res.status(404).json({ error: 'QR code not found' });
    }

    let qr_code_image_url = existing.rows[0].qr_code_image_url;
    let qr_code_svg = existing.rows[0].qr_code_svg;

    // Regenerate QR code if requested or if URL changed
    const urlChanged = destination_url && destination_url !== existing.rows[0].destination_url;
    if (regenerate || urlChanged) {
      const designOptions = {
        qr_code_text: destination_url || existing.rows[0].destination_url,
        image_format: 'PNG',
        image_width: 500,
        frame_name: frame_name || existing.rows[0].frame_name,
        frame_color: frame_color || existing.rows[0].frame_color,
        frame_text: frame_text !== undefined ? frame_text : existing.rows[0].frame_text,
        frame_icon_name: frame_icon_name !== undefined ? frame_icon_name : existing.rows[0].frame_icon_name,
        foreground_color: foreground_color || existing.rows[0].foreground_color,
        background_color: background_color || existing.rows[0].background_color,
        marker_left_inner_color: marker_left_inner_color || existing.rows[0].marker_left_inner_color,
        marker_left_outer_color: marker_left_outer_color || existing.rows[0].marker_left_outer_color,
        marker_right_inner_color: marker_right_inner_color || existing.rows[0].marker_right_inner_color,
        marker_right_outer_color: marker_right_outer_color || existing.rows[0].marker_right_outer_color,
        marker_bottom_inner_color: marker_bottom_inner_color || existing.rows[0].marker_bottom_inner_color,
        marker_bottom_outer_color: marker_bottom_outer_color || existing.rows[0].marker_bottom_outer_color,
        marker_left_template: marker_left_template || existing.rows[0].marker_left_template,
        marker_right_template: marker_right_template || existing.rows[0].marker_right_template,
        marker_bottom_template: marker_bottom_template || existing.rows[0].marker_bottom_template,
        qr_code_logo: qr_code_logo || existing.rows[0].qr_code_logo
      };

      try {
        const qrResult = await generateQRCode(designOptions);
        const cloudinaryResult = await uploadToCloudinary(
          Buffer.from(qrResult.data),
          'png',
          name || existing.rows[0].name
        );
        qr_code_image_url = cloudinaryResult.secure_url;

        // Generate SVG too
        designOptions.image_format = 'SVG';
        const svgResult = await generateQRCode(designOptions);
        qr_code_svg = svgResult.data.toString('utf-8');
      } catch (regenerateError) {
        logger.error({ data: regenerateError }, 'Error regenerating QR code:');
        // Continue with existing image
      }
    }

    // Update database
    const result = await pool.query(`
      UPDATE qr_codes SET
        name = COALESCE($1, name),
        description = COALESCE($2, description),
        destination_url = COALESCE($3, destination_url),
        qr_code_image_url = $4,
        qr_code_svg = $5,
        frame_name = COALESCE($6, frame_name),
        frame_color = COALESCE($7, frame_color),
        frame_text = COALESCE($8, frame_text),
        frame_icon_name = COALESCE($9, frame_icon_name),
        foreground_color = COALESCE($10, foreground_color),
        background_color = COALESCE($11, background_color),
        marker_left_inner_color = COALESCE($12, marker_left_inner_color),
        marker_left_outer_color = COALESCE($13, marker_left_outer_color),
        marker_right_inner_color = COALESCE($14, marker_right_inner_color),
        marker_right_outer_color = COALESCE($15, marker_right_outer_color),
        marker_bottom_inner_color = COALESCE($16, marker_bottom_inner_color),
        marker_bottom_outer_color = COALESCE($17, marker_bottom_outer_color),
        marker_left_template = COALESCE($18, marker_left_template),
        marker_right_template = COALESCE($19, marker_right_template),
        marker_bottom_template = COALESCE($20, marker_bottom_template),
        qr_code_logo = COALESCE($21, qr_code_logo),
        category = COALESCE($22, category),
        tags = COALESCE($23, tags),
        is_active = COALESCE($24, is_active),
        updated_at = NOW()
      WHERE id = $25 AND deleted_at IS NULL
      RETURNING *
    `, [
      name, description, destination_url,
      qr_code_image_url, qr_code_svg,
      frame_name, frame_color, frame_text, frame_icon_name,
      foreground_color, background_color,
      marker_left_inner_color, marker_left_outer_color,
      marker_right_inner_color, marker_right_outer_color,
      marker_bottom_inner_color, marker_bottom_outer_color,
      marker_left_template, marker_right_template, marker_bottom_template,
      qr_code_logo, category,
      tags ? JSON.stringify(tags) : null,
      is_active,
      id
    ]);

    res.json(result.rows[0]);
  } catch (error) {
    logger.error({ err: error }, 'Error updating QR code:');
    res.status(500).json({ error: error.message || 'Failed to update QR code' });
  }
}));

/**
 * DELETE /api/qr-codes/:id - Soft delete a QR code
 */
router.delete('/:id', auth, asyncHandler(async (req, res) => {
  try {
    const { id } = req.params;
    
    const result = await pool.query(`
      UPDATE qr_codes
      SET deleted_at = NOW(), updated_at = NOW()
      WHERE id = $1 AND deleted_at IS NULL
      RETURNING id
    `, [id]);

    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'QR code not found' });
    }

    res.json({ success: true, message: 'QR code deleted' });
  } catch (error) {
    logger.error({ err: error }, 'Error deleting QR code:');
    res.status(500).json({ error: 'Failed to delete QR code' });
  }
}));

/**
 * POST /api/qr-codes/:id/regenerate - Regenerate a QR code image
 */
router.post('/:id/regenerate', auth, asyncHandler(async (req, res) => {
  try {
    const { id } = req.params;
    
    // Get existing record
    const existing = await pool.query(
      'SELECT * FROM qr_codes WHERE id = $1 AND deleted_at IS NULL',
      [id]
    );

    if (existing.rows.length === 0) {
      return res.status(404).json({ error: 'QR code not found' });
    }

    const qrCode = existing.rows[0];

    // Generate new QR code
    const qrResult = await generateQRCode({
      qr_code_text: qrCode.destination_url,
      image_format: 'PNG',
      image_width: 500,
      frame_name: qrCode.frame_name,
      frame_color: qrCode.frame_color,
      frame_text: qrCode.frame_text,
      frame_icon_name: qrCode.frame_icon_name,
      foreground_color: qrCode.foreground_color,
      background_color: qrCode.background_color,
      marker_left_inner_color: qrCode.marker_left_inner_color,
      marker_left_outer_color: qrCode.marker_left_outer_color,
      marker_right_inner_color: qrCode.marker_right_inner_color,
      marker_right_outer_color: qrCode.marker_right_outer_color,
      marker_bottom_inner_color: qrCode.marker_bottom_inner_color,
      marker_bottom_outer_color: qrCode.marker_bottom_outer_color,
      marker_left_template: qrCode.marker_left_template,
      marker_right_template: qrCode.marker_right_template,
      marker_bottom_template: qrCode.marker_bottom_template,
      qr_code_logo: qrCode.qr_code_logo
    });

    // Upload to Cloudinary
    const cloudinaryResult = await uploadToCloudinary(
      Buffer.from(qrResult.data),
      'png',
      qrCode.name
    );

    // Generate SVG too
    const svgResult = await generateQRCode({
      qr_code_text: qrCode.destination_url,
      image_format: 'SVG',
      frame_name: qrCode.frame_name,
      frame_color: qrCode.frame_color,
      frame_text: qrCode.frame_text,
      frame_icon_name: qrCode.frame_icon_name,
      foreground_color: qrCode.foreground_color,
      background_color: qrCode.background_color,
      marker_left_inner_color: qrCode.marker_left_inner_color,
      marker_left_outer_color: qrCode.marker_left_outer_color,
      marker_right_inner_color: qrCode.marker_right_inner_color,
      marker_right_outer_color: qrCode.marker_right_outer_color,
      marker_bottom_inner_color: qrCode.marker_bottom_inner_color,
      marker_bottom_outer_color: qrCode.marker_bottom_outer_color,
      marker_left_template: qrCode.marker_left_template,
      marker_right_template: qrCode.marker_right_template,
      marker_bottom_template: qrCode.marker_bottom_template,
      qr_code_logo: qrCode.qr_code_logo
    });

    // Update database
    const result = await pool.query(`
      UPDATE qr_codes SET
        qr_code_image_url = $1,
        qr_code_svg = $2,
        updated_at = NOW()
      WHERE id = $3
      RETURNING *
    `, [cloudinaryResult.secure_url, svgResult.data.toString('utf-8'), id]);

    res.json(result.rows[0]);
  } catch (error) {
    logger.error({ err: error }, 'Error regenerating QR code:');
    res.status(500).json({ error: error.message || 'Failed to regenerate QR code' });
  }
}));

/**
 * POST /api/qr-codes/:id/toggle - Toggle active status
 */
router.post('/:id/toggle', auth, asyncHandler(async (req, res) => {
  try {
    const { id } = req.params;
    
    const result = await pool.query(`
      UPDATE qr_codes
      SET is_active = NOT is_active, updated_at = NOW()
      WHERE id = $1 AND deleted_at IS NULL
      RETURNING *
    `, [id]);

    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'QR code not found' });
    }

    res.json(result.rows[0]);
  } catch (error) {
    logger.error({ err: error }, 'Error toggling QR code:');
    res.status(500).json({ error: 'Failed to toggle QR code status' });
  }
}));

/**
 * POST /api/qr-codes/:id/download - Download QR code in various formats
 */
router.get('/:id/download', auth, asyncHandler(async (req, res) => {
  try {
    const { id } = req.params;
    const { format = 'png' } = req.query;
    
    // Get existing record
    const existing = await pool.query(
      'SELECT * FROM qr_codes WHERE id = $1 AND deleted_at IS NULL',
      [id]
    );

    if (existing.rows.length === 0) {
      return res.status(404).json({ error: 'QR code not found' });
    }

    const qrCode = existing.rows[0];

    // Generate QR code in requested format
    const qrResult = await generateQRCode({
      qr_code_text: qrCode.destination_url,
      image_format: format.toUpperCase(),
      image_width: 1000,
      frame_name: qrCode.frame_name,
      frame_color: qrCode.frame_color,
      frame_text: qrCode.frame_text,
      frame_icon_name: qrCode.frame_icon_name,
      foreground_color: qrCode.foreground_color,
      background_color: qrCode.background_color,
      marker_left_inner_color: qrCode.marker_left_inner_color,
      marker_left_outer_color: qrCode.marker_left_outer_color,
      marker_right_inner_color: qrCode.marker_right_inner_color,
      marker_right_outer_color: qrCode.marker_right_outer_color,
      marker_bottom_inner_color: qrCode.marker_bottom_inner_color,
      marker_bottom_outer_color: qrCode.marker_bottom_outer_color,
      marker_left_template: qrCode.marker_left_template,
      marker_right_template: qrCode.marker_right_template,
      marker_bottom_template: qrCode.marker_bottom_template,
      qr_code_logo: qrCode.qr_code_logo
    });

    const contentTypes = {
      png: 'image/png',
      jpg: 'image/jpeg',
      svg: 'image/svg+xml',
      eps: 'application/postscript'
    };

    const filename = `${qrCode.name.replace(/[^a-zA-Z0-9]/g, '-')}.${format.toLowerCase()}`;
    
    res.set({
      'Content-Type': contentTypes[format.toLowerCase()] || 'application/octet-stream',
      'Content-Disposition': `attachment; filename="${filename}"`
    });
    
    res.send(Buffer.from(qrResult.data));
  } catch (error) {
    logger.error({ err: error }, 'Error downloading QR code:');
    res.status(500).json({ error: error.message || 'Failed to download QR code' });
  }
}));

/**
 * POST /api/qr-codes/preview - Generate a preview QR code without saving
 */
router.post('/preview', auth, asyncHandler(async (req, res) => {
  try {
    const {
      destination_url,
      frame_name = 'no-frame',
      frame_color = '#000000',
      frame_text = '',
      frame_icon_name = '',
      foreground_color = '#000000',
      background_color = '#FFFFFF',
      marker_left_inner_color = '#000000',
      marker_left_outer_color = '#000000',
      marker_right_inner_color = '#000000',
      marker_right_outer_color = '#000000',
      marker_bottom_inner_color = '#000000',
      marker_bottom_outer_color = '#000000',
      marker_left_template = 'version1',
      marker_right_template = 'version1',
      marker_bottom_template = 'version1',
      qr_code_logo = 'no-logo'
    } = req.body;

    if (!destination_url) {
      return res.status(400).json({ error: 'Destination URL is required' });
    }

    // Generate QR code as PNG for preview
    const qrResult = await generateQRCode({
      qr_code_text: destination_url,
      image_format: 'PNG',
      image_width: 300,
      frame_name,
      frame_color,
      frame_text,
      frame_icon_name,
      foreground_color,
      background_color,
      marker_left_inner_color,
      marker_left_outer_color,
      marker_right_inner_color,
      marker_right_outer_color,
      marker_bottom_inner_color,
      marker_bottom_outer_color,
      marker_left_template,
      marker_right_template,
      marker_bottom_template,
      qr_code_logo
    });

    // Return as base64 for easy display
    const base64 = Buffer.from(qrResult.data).toString('base64');
    res.json({
      success: true,
      preview: `data:image/png;base64,${base64}`
    });
  } catch (error) {
    logger.error({ err: error }, 'Error generating preview:');
    res.status(500).json({ error: error.message || 'Failed to generate preview' });
  }
}));

// =====================================================
// SELF-HOSTED QR CODE ENDPOINTS (Our QR Codes System)
// =====================================================

/**
 * POST /api/qr-codes/generate - Generate a new self-hosted QR code with tracking
 * 
 * This creates a QR code that points to our tracking URL, logs scans,
 * and redirects to the destination.
 */
router.post('/generate', auth, asyncHandler(async (req, res) => {
  try {
    const {
      name,
      description,
      destination_url,
      category,
      tags = [],
      linked_entity_type,
      linked_entity_id,
      auto_generated = false,
      // Design options
      foreground_color = '#000000',
      background_color = '#FFFFFF',
      pattern_style = 'square',
      corner_style = 'square',
      corner_dot_style = 'square',
      gradient_type,
      gradient_color1,
      gradient_color2,
      gradient_rotation = 0,
      logo_url,
      logo_size = 0.4,
      logo_margin = 5,
      frame_style = 'none',
      frame_color = '#000000',
      frame_text = '',
      frame_text_color = '#000000'
    } = req.body;

    if (!name || !destination_url) {
      return res.status(400).json({ error: 'Name and destination URL are required' });
    }

    // Generate a unique short code for tracking
    let shortCode;
    let isUnique = false;
    let attempts = 0;
    
    while (!isUnique && attempts < 10) {
      shortCode = qrGeneratorService.generateShortCode(8);
      const existing = await pool.query(
        'SELECT id FROM qr_codes WHERE short_code = $1',
        [shortCode]
      );
      if (existing.rows.length === 0) {
        isUnique = true;
      }
      attempts++;
    }

    if (!isUnique) {
      return res.status(500).json({ error: 'Failed to generate unique short code' });
    }

    // Build the tracking URL
    const trackingUrl = qrGeneratorService.buildTrackingUrl(shortCode, TRACKING_BASE_URL);

    // Generate QR code using our internal service
    const qrResult = await qrGeneratorService.generateQRCode({
      content: trackingUrl, // QR code points to our tracking URL
      foregroundColor: foreground_color,
      backgroundColor: background_color,
      width: 500,
      format: 'png'
    });

    // Upload to Cloudinary
    let qr_code_image_url = null;
    try {
      const cloudinaryResult = await uploadToCloudinary(
        qrResult.data,
        'png',
        name
      );
      qr_code_image_url = cloudinaryResult.secure_url;
    } catch (uploadError) {
      logger.error({ data: uploadError }, 'Cloudinary upload error:');
    }

    // Generate SVG for high-quality storage
    let qr_code_svg = null;
    try {
      const svgResult = await qrGeneratorService.generateQRCode({
        content: trackingUrl,
        foregroundColor: foreground_color,
        backgroundColor: background_color,
        format: 'svg'
      });
      qr_code_svg = svgResult.data;
    } catch (svgError) {
      logger.error({ data: svgError }, 'SVG generation error:');
    }

    // Save to database with new self-hosted fields
    const result = await pool.query(`
      INSERT INTO qr_codes (
        name, description, destination_url, qr_code_image_url, qr_code_svg,
        short_code, tracking_url, source,
        linked_entity_type, linked_entity_id, auto_generated,
        foreground_color, background_color,
        pattern_style, corner_style, corner_dot_style,
        gradient_type, gradient_color1, gradient_color2, gradient_rotation,
        logo_url, logo_size, logo_margin,
        frame_style, frame_color, frame_text, frame_text_color,
        category, tags, created_by
      ) VALUES (
        $1, $2, $3, $4, $5,
        $6, $7, 'internal',
        $8, $9, $10,
        $11, $12,
        $13, $14, $15,
        $16, $17, $18, $19,
        $20, $21, $22,
        $23, $24, $25, $26,
        $27, $28, $29
      )
      RETURNING *
    `, [
      name, description, destination_url, qr_code_image_url, qr_code_svg,
      shortCode, trackingUrl,
      linked_entity_type, linked_entity_id, auto_generated,
      foreground_color, background_color,
      pattern_style, corner_style, corner_dot_style,
      gradient_type, gradient_color1, gradient_color2, gradient_rotation,
      logo_url, logo_size, logo_margin,
      frame_style, frame_color, frame_text, frame_text_color,
      category, JSON.stringify(tags), req.user?.email || 'system'
    ]);

    res.status(201).json(result.rows[0]);
  } catch (error) {
    logger.error({ err: error }, 'Error generating self-hosted QR code:');
    res.status(500).json({ error: error.message || 'Failed to generate QR code' });
  }
}));

/**
 * POST /api/qr-codes/generate-preview - Generate a preview without saving
 */
router.post('/generate-preview', auth, asyncHandler(async (req, res) => {
  try {
    const {
      destination_url,
      foreground_color = '#000000',
      background_color = '#FFFFFF'
    } = req.body;

    if (!destination_url) {
      return res.status(400).json({ error: 'Destination URL is required' });
    }

    // Generate preview using internal service
    const preview = await qrGeneratorService.generateDataURL(destination_url, {
      foregroundColor: foreground_color,
      backgroundColor: background_color,
      width: 300
    });

    res.json({
      success: true,
      preview
    });
  } catch (error) {
    logger.error({ err: error }, 'Error generating preview:');
    res.status(500).json({ error: error.message || 'Failed to generate preview' });
  }
}));

// GET /api/qr-codes/for-entity/:type/:id is defined earlier in the file

/**
 * POST /api/qr-codes/:id/link - Link a QR code to an entity
 */
router.post('/:id/link', auth, asyncHandler(async (req, res) => {
  try {
    const { id } = req.params;
    const { linked_entity_type, linked_entity_id } = req.body;

    if (!linked_entity_type || !linked_entity_id) {
      return res.status(400).json({ error: 'Entity type and ID are required' });
    }

    const result = await pool.query(`
      UPDATE qr_codes
      SET linked_entity_type = $1,
          linked_entity_id = $2,
          updated_at = NOW()
      WHERE id = $3 AND deleted_at IS NULL
      RETURNING *
    `, [linked_entity_type, linked_entity_id, id]);

    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'QR code not found' });
    }

    res.json(result.rows[0]);
  } catch (error) {
    logger.error({ err: error }, 'Error linking QR code:');
    res.status(500).json({ error: 'Failed to link QR code' });
  }
}));

/**
 * POST /api/qr-codes/:id/unlink - Unlink a QR code from an entity
 */
router.post('/:id/unlink', auth, asyncHandler(async (req, res) => {
  try {
    const { id } = req.params;

    const result = await pool.query(`
      UPDATE qr_codes
      SET linked_entity_type = NULL,
          linked_entity_id = NULL,
          updated_at = NOW()
      WHERE id = $3 AND deleted_at IS NULL
      RETURNING *
    `, [id]);

    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'QR code not found' });
    }

    res.json(result.rows[0]);
  } catch (error) {
    logger.error({ err: error }, 'Error unlinking QR code:');
    res.status(500).json({ error: 'Failed to unlink QR code' });
  }
}));

/**
 * GET /api/qr-codes/:id/scans - Get scan history for a QR code
 */
router.get('/:id/scans', auth, asyncHandler(async (req, res) => {
  try {
    const { id } = req.params;
    const { limit = 100, offset = 0 } = req.query;

    const result = await pool.query(`
      SELECT *
      FROM qr_code_scans
      WHERE qr_code_id = $1
      ORDER BY scanned_at DESC
      LIMIT $2 OFFSET $3
    `, [id, parseInt(limit), parseInt(offset)]);

    const countResult = await pool.query(
      'SELECT COUNT(*) FROM qr_code_scans WHERE qr_code_id = $1',
      [id]
    );

    res.json({
      scans: result.rows,
      total: parseInt(countResult.rows[0].count),
      limit: parseInt(limit),
      offset: parseInt(offset)
    });
  } catch (error) {
    logger.error({ err: error }, 'Error fetching scans:');
    res.status(500).json({ error: 'Failed to fetch scans' });
  }
}));

module.exports = router;

// =====================================================
// PUBLIC REDIRECT ENDPOINT EXPORT
// This needs to be registered separately in server.js as a public route
// =====================================================

/**
 * Create the public redirect router for scan tracking
 * This should be mounted at /qr in server.js
 */
const createRedirectRouter = () => {
  const redirectRouter = express.Router();

  /**
   * GET /qr/:shortCode - Public redirect endpoint for QR code tracking
   * 
   * When a QR code is scanned:
   * 1. Look up the QR code by short_code
   * 2. Log the scan event with device/location info
   * 3. Redirect to the destination URL
   */
  redirectRouter.get('/:shortCode', async (req, res) => {
    try {
      const { shortCode } = req.params;
      const { getPool } = require('../database-connections');

      // Use location-aware pool (from locationDbMiddleware) or fallback to global pool
      let activePool = req.locationPool || pool;
      let activeLocation = req.location || 'production';

      // Look up QR code by short_code in current location's database
      let qrResult = await activePool.query(`
        SELECT id, destination_url, is_active
        FROM qr_codes
        WHERE short_code = $1 AND deleted_at IS NULL
      `, [shortCode]);

      // If not found, check other location databases (Eastside, 'Westside')
      // This allows QR codes created on regional apps to be scanned via production URLs
      if (qrResult.rows.length === 0) {
        const otherLocations = ['eastside', 'westside', 'production'].filter(loc => loc !== activeLocation);

        for (const loc of otherLocations) {
          try {
            const otherPool = getPool(loc);
            if (otherPool) {
              const otherResult = await otherPool.query(`
                SELECT id, destination_url, is_active
                FROM qr_codes
                WHERE short_code = $1 AND deleted_at IS NULL
              `, [shortCode]);

              if (otherResult.rows.length > 0) {
                logger.info(`QR code ${shortCode} found in ${loc} database (not ${activeLocation})`);
                qrResult = otherResult;
                activePool = otherPool;
                activeLocation = loc;
                break;
              }
            }
          } catch (err) {
            logger.warn({ error: err.message }, `Could not check ${loc} database for QR code:`);
          }
        }
      }

      if (qrResult.rows.length === 0) {
        logger.warn(`QR code not found in any database: ${shortCode}`);
        return res.status(404).send('QR code not found');
      }

      const qrCode = qrResult.rows[0];
      const locationPool = activePool; // Use the pool where we found the QR code

      // Check if QR code is active
      if (!qrCode.is_active) {
        logger.warn(`QR code inactive: ${shortCode}`);
        return res.status(410).send('This QR code is no longer active');
      }

      // Parse user agent for device info
      const userAgent = req.headers['user-agent'] || '';
      const deviceInfo = qrGeneratorService.parseUserAgent(userAgent);

      // Get IP address
      const ipAddress = req.headers['x-forwarded-for']?.split(',')[0]?.trim() || 
                        req.socket?.remoteAddress || 
                        'unknown';

      // Extract UTM parameters
      const utmSource = req.query.utm_source || null;
      const utmMedium = req.query.utm_medium || null;
      const utmCampaign = req.query.utm_campaign || null;

      // Generate or get session ID
      const sessionId = req.cookies?.qr_session || 
                        `${ipAddress}-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;

      // Check if this is a unique scan (new session)
      const existingSession = await locationPool.query(
        'SELECT id FROM qr_code_scans WHERE qr_code_id = $1 AND session_id = $2',
        [qrCode.id, sessionId]
      );
      const isUniqueScan = existingSession.rows.length === 0;

      // Perform IP geolocation lookup (async, non-blocking)
      let geoData = { country: null, city: null, region: null, country_code: null, latitude: null, longitude: null, timezone: null };
      try {
        // Use ip-api.com (free, 45 req/min limit, no key needed)
        // Skip private/local IPs
        if (ipAddress && !ipAddress.startsWith('127.') && !ipAddress.startsWith('10.') && 
            !ipAddress.startsWith('192.168.') && !ipAddress.startsWith('::1') && ipAddress !== 'unknown') {
          const geoResponse = await axios.get(`http://ip-api.com/json/${ipAddress}?fields=status,country,countryCode,region,regionName,city,lat,lon,timezone`, {
            timeout: 2000 // 2 second timeout to not slow down redirect
          });
          if (geoResponse.data && geoResponse.data.status === 'success') {
            geoData = {
              country: geoResponse.data.country || null,
              city: geoResponse.data.city || null,
              region: geoResponse.data.regionName || null,
              country_code: geoResponse.data.countryCode || null,
              latitude: geoResponse.data.lat || null,
              longitude: geoResponse.data.lon || null,
              timezone: geoResponse.data.timezone || null
            };
          }
        }
      } catch (geoError) {
        // Don't let geolocation failure block the redirect
        logger.warn({ data: geoError.message }, 'Geolocation lookup failed:');
      }

      // Log the scan with geolocation data
      await locationPool.query(`
        INSERT INTO qr_code_scans (
          qr_code_id, user_agent, device_type, browser, os,
          ip_address, session_id, is_unique_scan,
          referrer, utm_source, utm_medium, utm_campaign,
          country, city, region, country_code, latitude, longitude, timezone
        ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17, $18, $19)
      `, [
        qrCode.id,
        userAgent,
        deviceInfo.deviceType,
        deviceInfo.browser,
        deviceInfo.os,
        ipAddress,
        sessionId,
        isUniqueScan,
        req.headers['referer'] || null,
        utmSource,
        utmMedium,
        utmCampaign,
        geoData.country,
        geoData.city,
        geoData.region,
        geoData.country_code,
        geoData.latitude,
        geoData.longitude,
        geoData.timezone
      ]);

      // Update QR code scan counts
      await locationPool.query(`
        UPDATE qr_codes
        SET total_scans = total_scans + 1,
            unique_scans = unique_scans + CASE WHEN $1 THEN 1 ELSE 0 END,
            last_scanned_at = NOW()
        WHERE id = $2
      `, [isUniqueScan, qrCode.id]);

      // Set session cookie for tracking unique scans (expires in 24 hours)
      res.cookie('qr_session', sessionId, {
        maxAge: 24 * 60 * 60 * 1000,
        httpOnly: true,
        secure: process.env.NODE_ENV === 'production',
        sameSite: 'lax'
      });

      // Build destination URL with UTM passthrough
      let destinationUrl = qrCode.destination_url;
      const utmParams = [];
      if (utmSource) utmParams.push(`utm_source=${encodeURIComponent(utmSource)}`);
      if (utmMedium) utmParams.push(`utm_medium=${encodeURIComponent(utmMedium)}`);
      if (utmCampaign) utmParams.push(`utm_campaign=${encodeURIComponent(utmCampaign)}`);
      
      if (utmParams.length > 0) {
        const separator = destinationUrl.includes('?') ? '&' : '?';
        destinationUrl = `${destinationUrl}${separator}${utmParams.join('&')}`;
      }

      // Redirect to destination
      logger.info(`QR scan: ${shortCode} -> ${destinationUrl} (${deviceInfo.deviceType}, ${deviceInfo.browser}, db: ${activeLocation})`);
      res.redirect(302, destinationUrl);

    } catch (error) {
      logger.error({ err: error }, 'Error processing QR redirect:');
      res.status(500).send('Error processing QR code');
    }
  });

  return redirectRouter;
};

module.exports.createRedirectRouter = createRedirectRouter;

// =====================================================
// PREMIUM FEATURES: TEMPLATES (POST routes - GET routes defined earlier)
// =====================================================

/**
 * GET /api/qr-codes/templates/:id - Get a single template
 */
router.get('/templates/:id', auth, asyncHandler(async (req, res) => {
  try {
    const { id } = req.params;
    const result = await pool.query(
      'SELECT * FROM qr_code_templates WHERE id = $1',
      [id]
    );
    
    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Template not found' });
    }
    
    res.json(result.rows[0]);
  } catch (error) {
    logger.error({ err: error }, 'Error fetching template:');
    res.status(500).json({ error: 'Failed to fetch template' });
  }
}));

/**
 * POST /api/qr-codes/templates - Create a new template (admin)
 */
router.post('/templates', auth, asyncHandler(async (req, res) => {
  try {
    const {
      name, description, category, thumbnail_url,
      foreground_color, background_color, dot_style,
      corner_square_style, corner_dot_style, use_gradient,
      gradient_start_color, gradient_end_color, gradient_direction,
      frame_style, frame_color, frame_text, frame_text_color,
      logo_image_url, error_correction, is_premium, sort_order
    } = req.body;
    
    const result = await pool.query(`
      INSERT INTO qr_code_templates (
        name, description, category, thumbnail_url,
        foreground_color, background_color, dot_style,
        corner_square_style, corner_dot_style, use_gradient,
        gradient_start_color, gradient_end_color, gradient_direction,
        frame_style, frame_color, frame_text, frame_text_color,
        logo_image_url, error_correction, is_premium, sort_order
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17, $18, $19, $20, $21)
      RETURNING *
    `, [
      name, description, category, thumbnail_url,
      foreground_color || '#000000', background_color || '#FFFFFF', dot_style || 'square',
      corner_square_style || 'square', corner_dot_style || 'square', use_gradient || false,
      gradient_start_color, gradient_end_color, gradient_direction,
      frame_style || 'none', frame_color, frame_text, frame_text_color,
      logo_image_url, error_correction || 'M', is_premium || false, sort_order || 0
    ]);
    
    res.status(201).json(result.rows[0]);
  } catch (error) {
    logger.error({ err: error }, 'Error creating template:');
    res.status(500).json({ error: 'Failed to create template' });
  }
}));

// =====================================================
// PREMIUM FEATURES: FOLDERS (POST/PUT/DELETE routes - GET routes defined earlier)
// =====================================================

/**
 * GET /api/qr-codes/folders/:id - Get a single folder
 */
router.get('/folders/:id', auth, asyncHandler(async (req, res) => {
  try {
    const { id } = req.params;
    const result = await pool.query(`
      SELECT f.*, 
        (SELECT COUNT(*) FROM qr_codes WHERE folder_id = f.id AND deleted_at IS NULL) as qr_count
      FROM qr_code_folders f
      WHERE f.id = $1
    `, [id]);
    
    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Folder not found' });
    }
    
    res.json(result.rows[0]);
  } catch (error) {
    logger.error({ err: error }, 'Error fetching folder:');
    res.status(500).json({ error: 'Failed to fetch folder' });
  }
}));

/**
 * POST /api/qr-codes/folders - Create a folder
 */
router.post('/folders', auth, asyncHandler(async (req, res) => {
  try {
    const { name, description, parent_folder_id, color, icon } = req.body;
    
    if (!name) {
      return res.status(400).json({ error: 'Folder name is required' });
    }
    
    const result = await pool.query(`
      INSERT INTO qr_code_folders (name, description, parent_folder_id, color, icon)
      VALUES ($1, $2, $3, $4, $5)
      RETURNING *
    `, [name, description, parent_folder_id, color || '#6A469D', icon || 'folder']);
    
    res.status(201).json(result.rows[0]);
  } catch (error) {
    logger.error({ err: error }, 'Error creating folder:');
    res.status(500).json({ error: 'Failed to create folder' });
  }
}));

/**
 * PUT /api/qr-codes/folders/:id - Update a folder
 */
router.put('/folders/:id', auth, asyncHandler(async (req, res) => {
  try {
    const { id } = req.params;
    const { name, description, parent_folder_id, color, icon } = req.body;
    
    const result = await pool.query(`
      UPDATE qr_code_folders
      SET name = COALESCE($1, name),
          description = COALESCE($2, description),
          parent_folder_id = $3,
          color = COALESCE($4, color),
          icon = COALESCE($5, icon),
          updated_at = NOW()
      WHERE id = $6 AND deleted_at IS NULL
      RETURNING *
    `, [name, description, parent_folder_id, color, icon, id]);
    
    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Folder not found' });
    }
    
    res.json(result.rows[0]);
  } catch (error) {
    logger.error({ err: error }, 'Error updating folder:');
    res.status(500).json({ error: 'Failed to update folder' });
  }
}));

/**
 * DELETE /api/qr-codes/folders/:id - Delete a folder
 */
router.delete('/folders/:id', auth, asyncHandler(async (req, res) => {
  try {
    const { id } = req.params;
    const { move_contents_to } = req.query;
    
    // Move QR codes to another folder or root
    await pool.query(
      'UPDATE qr_codes SET folder_id = $1 WHERE folder_id = $2',
      [move_contents_to || null, id]
    );
    
    // Move subfolders to parent or root
    const folder = await pool.query('SELECT parent_folder_id FROM qr_code_folders WHERE id = $1', [id]);
    const parentId = folder.rows[0]?.parent_folder_id || null;
    
    await pool.query(
      'UPDATE qr_code_folders SET parent_folder_id = $1 WHERE parent_folder_id = $2',
      [parentId, id]
    );
    
    // Soft delete the folder
    await pool.query(
      'UPDATE qr_code_folders SET deleted_at = NOW() WHERE id = $1',
      [id]
    );
    
    res.json({ success: true });
  } catch (error) {
    logger.error({ err: error }, 'Error deleting folder:');
    res.status(500).json({ error: 'Failed to delete folder' });
  }
}));

/**
 * POST /api/qr-codes/folders/:id/move - Move QR codes to a folder
 */
router.post('/folders/:id/move', auth, asyncHandler(async (req, res) => {
  try {
    const { id } = req.params;
    const { qr_code_ids } = req.body;
    
    if (!Array.isArray(qr_code_ids) || qr_code_ids.length === 0) {
      return res.status(400).json({ error: 'QR code IDs are required' });
    }
    
    const folderId = id === 'root' ? null : id;
    
    await pool.query(
      'UPDATE qr_codes SET folder_id = $1, updated_at = NOW() WHERE id = ANY($2)',
      [folderId, qr_code_ids]
    );
    
    res.json({ success: true, moved: qr_code_ids.length });
  } catch (error) {
    logger.error({ err: error }, 'Error moving QR codes:');
    res.status(500).json({ error: 'Failed to move QR codes' });
  }
}));

// =====================================================
// PREMIUM FEATURES: TAGS (POST/DELETE routes - GET route defined earlier)
// =====================================================

/**
 * POST /api/qr-codes/tags - Create a tag
 */
router.post('/tags', auth, asyncHandler(async (req, res) => {
  try {
    const { name, color } = req.body;
    
    if (!name) {
      return res.status(400).json({ error: 'Tag name is required' });
    }
    
    const result = await pool.query(`
      INSERT INTO qr_code_tags (name, color)
      VALUES ($1, $2)
      ON CONFLICT (name) DO UPDATE SET color = $2
      RETURNING *
    `, [name, color || '#6A469D']);
    
    res.status(201).json(result.rows[0]);
  } catch (error) {
    logger.error({ err: error }, 'Error creating tag:');
    res.status(500).json({ error: 'Failed to create tag' });
  }
}));

/**
 * DELETE /api/qr-codes/tags/:id - Delete a tag
 */
router.delete('/tags/:id', auth, asyncHandler(async (req, res) => {
  try {
    const { id } = req.params;
    
    // Remove all assignments first
    await pool.query('DELETE FROM qr_code_tag_assignments WHERE tag_id = $1', [id]);
    
    // Delete the tag
    await pool.query('DELETE FROM qr_code_tags WHERE id = $1', [id]);
    
    res.json({ success: true });
  } catch (error) {
    logger.error({ err: error }, 'Error deleting tag:');
    res.status(500).json({ error: 'Failed to delete tag' });
  }
}));

/**
 * POST /api/qr-codes/:id/tags - Assign tags to a QR code
 */
router.post('/:id/tags', auth, asyncHandler(async (req, res) => {
  try {
    const { id } = req.params;
    const { tag_ids } = req.body;
    
    if (!Array.isArray(tag_ids)) {
      return res.status(400).json({ error: 'Tag IDs must be an array' });
    }
    
    // Remove existing assignments
    await pool.query('DELETE FROM qr_code_tag_assignments WHERE qr_code_id = $1', [id]);
    
    // Add new assignments
    if (tag_ids.length > 0) {
      const values = tag_ids.map((tagId, i) => `($1, $${i + 2})`).join(', ');
      await pool.query(
        `INSERT INTO qr_code_tag_assignments (qr_code_id, tag_id) VALUES ${values}`,
        [id, ...tag_ids]
      );
    }
    
    // Return updated tags
    const result = await pool.query(`
      SELECT t.* FROM qr_code_tags t
      INNER JOIN qr_code_tag_assignments a ON t.id = a.tag_id
      WHERE a.qr_code_id = $1
    `, [id]);
    
    res.json(result.rows);
  } catch (error) {
    logger.error({ err: error }, 'Error assigning tags:');
    res.status(500).json({ error: 'Failed to assign tags' });
  }
}));

/**
 * GET /api/qr-codes/:id/tags - Get tags for a QR code
 */
router.get('/:id/tags', auth, asyncHandler(async (req, res) => {
  try {
    const { id } = req.params;
    
    const result = await pool.query(`
      SELECT t.* FROM qr_code_tags t
      INNER JOIN qr_code_tag_assignments a ON t.id = a.tag_id
      WHERE a.qr_code_id = $1
      ORDER BY t.name
    `, [id]);
    
    res.json(result.rows);
  } catch (error) {
    logger.error({ err: error }, 'Error fetching QR code tags:');
    res.status(500).json({ error: 'Failed to fetch tags' });
  }
}));

// =====================================================
// PREMIUM FEATURES: NOTIFICATIONS
// =====================================================

/**
 * GET /api/qr-codes/:id/notifications - Get notification settings
 */
router.get('/:id/notifications', auth, asyncHandler(async (req, res) => {
  try {
    const { id } = req.params;
    
    let result = await pool.query(
      'SELECT * FROM qr_code_notifications WHERE qr_code_id = $1',
      [id]
    );
    
    // Create default settings if none exist
    if (result.rows.length === 0) {
      result = await pool.query(`
        INSERT INTO qr_code_notifications (qr_code_id)
        VALUES ($1)
        RETURNING *
      `, [id]);
    }
    
    res.json(result.rows[0]);
  } catch (error) {
    logger.error({ err: error }, 'Error fetching notification settings:');
    res.status(500).json({ error: 'Failed to fetch notification settings' });
  }
}));

/**
 * PUT /api/qr-codes/:id/notifications - Update notification settings
 */
router.put('/:id/notifications', auth, asyncHandler(async (req, res) => {
  try {
    const { id } = req.params;
    const {
      notify_on_scan, notify_on_milestone, milestone_thresholds,
      email_enabled, email_addresses, email_frequency,
      daily_digest_enabled, daily_digest_time, daily_digest_timezone,
      webhook_enabled, webhook_url, webhook_secret
    } = req.body;
    
    // Upsert notification settings
    const result = await pool.query(`
      INSERT INTO qr_code_notifications (
        qr_code_id, notify_on_scan, notify_on_milestone, milestone_thresholds,
        email_enabled, email_addresses, email_frequency,
        daily_digest_enabled, daily_digest_time, daily_digest_timezone,
        webhook_enabled, webhook_url, webhook_secret
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13)
      ON CONFLICT (qr_code_id) DO UPDATE SET
        notify_on_scan = COALESCE($2, qr_code_notifications.notify_on_scan),
        notify_on_milestone = COALESCE($3, qr_code_notifications.notify_on_milestone),
        milestone_thresholds = COALESCE($4, qr_code_notifications.milestone_thresholds),
        email_enabled = COALESCE($5, qr_code_notifications.email_enabled),
        email_addresses = COALESCE($6, qr_code_notifications.email_addresses),
        email_frequency = COALESCE($7, qr_code_notifications.email_frequency),
        daily_digest_enabled = COALESCE($8, qr_code_notifications.daily_digest_enabled),
        daily_digest_time = COALESCE($9, qr_code_notifications.daily_digest_time),
        daily_digest_timezone = COALESCE($10, qr_code_notifications.daily_digest_timezone),
        webhook_enabled = COALESCE($11, qr_code_notifications.webhook_enabled),
        webhook_url = COALESCE($12, qr_code_notifications.webhook_url),
        webhook_secret = COALESCE($13, qr_code_notifications.webhook_secret),
        updated_at = NOW()
      RETURNING *
    `, [
      id, notify_on_scan, notify_on_milestone, milestone_thresholds,
      email_enabled, email_addresses, email_frequency,
      daily_digest_enabled, daily_digest_time, daily_digest_timezone,
      webhook_enabled, webhook_url, webhook_secret
    ]);
    
    // Update the notifications_enabled flag on the QR code
    const hasNotifications = email_enabled || webhook_enabled || daily_digest_enabled;
    await pool.query(
      'UPDATE qr_codes SET notifications_enabled = $1 WHERE id = $2',
      [hasNotifications, id]
    );
    
    res.json(result.rows[0]);
  } catch (error) {
    logger.error({ err: error }, 'Error updating notification settings:');
    res.status(500).json({ error: 'Failed to update notification settings' });
  }
}));

// =====================================================
// PREMIUM FEATURES: BULK OPERATIONS
// =====================================================

/**
 * POST /api/qr-codes/bulk/create - Bulk create QR codes
 */
router.post('/bulk/create', auth, asyncHandler(async (req, res) => {
  try {
    const { qr_codes, folder_id, apply_template_id } = req.body;
    
    if (!Array.isArray(qr_codes) || qr_codes.length === 0) {
      return res.status(400).json({ error: 'QR codes array is required' });
    }
    
    if (qr_codes.length > 100) {
      return res.status(400).json({ error: 'Maximum 100 QR codes per batch' });
    }
    
    // Create bulk job record
    const jobResult = await pool.query(`
      INSERT INTO qr_code_bulk_jobs (job_type, status, total_items, config)
      VALUES ('create', 'processing', $1, $2)
      RETURNING id
    `, [qr_codes.length, JSON.stringify({ folder_id, apply_template_id })]);
    
    const jobId = jobResult.rows[0].id;
    
    // Get template if specified
    let template = null;
    if (apply_template_id) {
      const templateResult = await pool.query(
        'SELECT * FROM qr_code_templates WHERE id = $1',
        [apply_template_id]
      );
      template = templateResult.rows[0];
    }
    
    const created = [];
    const failed = [];
    
    for (const qrData of qr_codes) {
      try {
        // Generate short code and tracking URL
        const shortCode = qrGeneratorService.generateShortCode();
        const trackingUrl = qrGeneratorService.buildTrackingUrl(TRACKING_BASE_URL, shortCode);
        
        // Merge template settings if provided
        const settings = template ? {
          foreground_color: template.foreground_color,
          background_color: template.background_color,
          dot_style: template.dot_style,
          corner_square_style: template.corner_square_style,
          corner_dot_style: template.corner_dot_style,
          ...qrData
        } : qrData;
        
        // Generate QR code image
        const qrCodeImage = await qrGeneratorService.generateAndUploadQRCode(trackingUrl, settings);
        
        // Insert into database
        const result = await pool.query(`
          INSERT INTO qr_codes (
            name, description, destination_url, category,
            qr_code_image_url, short_code, tracking_url,
            foreground_color, background_color, folder_id,
            template_id, bulk_job_id, source, is_dynamic
          ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, 'internal', true)
          RETURNING *
        `, [
          settings.name || `QR Code ${Date.now()}`,
          settings.description,
          settings.destination_url,
          settings.category || 'marketing',
          qrCodeImage.url,
          shortCode,
          trackingUrl,
          settings.foreground_color || '#000000',
          settings.background_color || '#FFFFFF',
          folder_id,
          apply_template_id,
          jobId
        ]);
        
        created.push(result.rows[0]);
      } catch (err) {
        failed.push({ data: qrData, error: err.message });
      }
    }
    
    // Update job status
    await pool.query(`
      UPDATE qr_code_bulk_jobs
      SET status = 'completed',
          processed_items = $1,
          failed_items = $2,
          completed_at = NOW()
      WHERE id = $3
    `, [created.length, failed.length, jobId]);
    
    res.status(201).json({
      job_id: jobId,
      created: created.length,
      failed: failed.length,
      qr_codes: created,
      errors: failed
    });
  } catch (error) {
    logger.error({ err: error }, 'Error bulk creating QR codes:');
    res.status(500).json({ error: 'Failed to bulk create QR codes' });
  }
}));

/**
 * POST /api/qr-codes/bulk/update - Bulk update QR codes
 */
router.post('/bulk/update', auth, asyncHandler(async (req, res) => {
  try {
    const { qr_code_ids, updates } = req.body;
    
    if (!Array.isArray(qr_code_ids) || qr_code_ids.length === 0) {
      return res.status(400).json({ error: 'QR code IDs are required' });
    }
    
    const allowedFields = [
      'is_active', 'category', 'folder_id', 'is_dynamic',
      'expires_at', 'max_scans', 'notifications_enabled'
    ];
    
    const setClauses = [];
    const values = [qr_code_ids];
    let paramIndex = 2;
    
    for (const [field, value] of Object.entries(updates)) {
      if (allowedFields.includes(field)) {
        setClauses.push(`${field} = $${paramIndex++}`);
        values.push(value);
      }
    }
    
    if (setClauses.length === 0) {
      return res.status(400).json({ error: 'No valid fields to update' });
    }
    
    setClauses.push('updated_at = NOW()');
    
    const result = await pool.query(`
      UPDATE qr_codes
      SET ${setClauses.join(', ')}
      WHERE id = ANY($1) AND deleted_at IS NULL
      RETURNING id
    `, values);
    
    res.json({ updated: result.rowCount });
  } catch (error) {
    logger.error({ err: error }, 'Error bulk updating QR codes:');
    res.status(500).json({ error: 'Failed to bulk update QR codes' });
  }
}));

/**
 * POST /api/qr-codes/bulk/delete - Bulk delete QR codes
 */
router.post('/bulk/delete', auth, asyncHandler(async (req, res) => {
  try {
    const { qr_code_ids } = req.body;
    
    if (!Array.isArray(qr_code_ids) || qr_code_ids.length === 0) {
      return res.status(400).json({ error: 'QR code IDs are required' });
    }
    
    const result = await pool.query(`
      UPDATE qr_codes
      SET deleted_at = NOW()
      WHERE id = ANY($1) AND deleted_at IS NULL
      RETURNING id
    `, [qr_code_ids]);
    
    res.json({ deleted: result.rowCount });
  } catch (error) {
    logger.error({ err: error }, 'Error bulk deleting QR codes:');
    res.status(500).json({ error: 'Failed to bulk delete QR codes' });
  }
}));

// GET /api/qr-codes/bulk/export is defined earlier in the file

// =====================================================
// PREMIUM FEATURES: ADVANCED SETTINGS
// =====================================================

/**
 * PUT /api/qr-codes/:id/advanced-settings - Update advanced settings
 */
router.put('/:id/advanced-settings', auth, asyncHandler(async (req, res) => {
  try {
    const { id } = req.params;
    const {
      // Dynamic URL settings
      is_dynamic, redirect_type, scheduled_url, schedule_start_at, schedule_end_at, fallback_url,
      // Expiration settings
      expires_at, expiration_action, expiration_message, max_scans, max_unique_scans,
      // Password protection
      is_password_protected, password, password_hint,
      // Scan scheduling
      scan_schedule_enabled, scan_schedule, scan_schedule_timezone,
      outside_schedule_action, outside_schedule_message
    } = req.body;
    
    // Hash password if provided
    let passwordHash = undefined;
    if (password) {
      const bcrypt = require('bcryptjs');
      passwordHash = await bcrypt.hash(password, 10);
    }
    
    const result = await pool.query(`
      UPDATE qr_codes SET
        is_dynamic = COALESCE($1, is_dynamic),
        redirect_type = COALESCE($2, redirect_type),
        scheduled_url = $3,
        schedule_start_at = $4,
        schedule_end_at = $5,
        fallback_url = $6,
        expires_at = $7,
        expiration_action = COALESCE($8, expiration_action),
        expiration_message = $9,
        max_scans = $10,
        max_unique_scans = $11,
        is_password_protected = COALESCE($12, is_password_protected),
        password_hash = COALESCE($13, password_hash),
        password_hint = $14,
        scan_schedule_enabled = COALESCE($15, scan_schedule_enabled),
        scan_schedule = $16,
        scan_schedule_timezone = COALESCE($17, scan_schedule_timezone),
        outside_schedule_action = COALESCE($18, outside_schedule_action),
        outside_schedule_message = $19,
        updated_at = NOW()
      WHERE id = $20 AND deleted_at IS NULL
      RETURNING *
    `, [
      is_dynamic, redirect_type, scheduled_url, schedule_start_at, schedule_end_at, fallback_url,
      expires_at, expiration_action, expiration_message, max_scans, max_unique_scans,
      is_password_protected, passwordHash, password_hint,
      scan_schedule_enabled, scan_schedule ? JSON.stringify(scan_schedule) : null, scan_schedule_timezone,
      outside_schedule_action, outside_schedule_message,
      id
    ]);
    
    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'QR code not found' });
    }
    
    res.json(result.rows[0]);
  } catch (error) {
    logger.error({ err: error }, 'Error updating advanced settings:');
    res.status(500).json({ error: 'Failed to update advanced settings' });
  }
}));

// =====================================================
// PREMIUM FEATURES: ENHANCED ANALYTICS
// =====================================================

/**
 * GET /api/qr-codes/:id/analytics/detailed - Get detailed analytics
 */
router.get('/:id/analytics/detailed', auth, asyncHandler(async (req, res) => {
  try {
    const { id } = req.params;
    const { start_date, end_date, group_by = 'day' } = req.query;

    // Use location-aware pool for Eastside/Westside support
    const locationPool = getLocationPool(req);

    const dateFilter = start_date && end_date
      ? `AND scanned_at >= $2 AND scanned_at < $3`
      : '';
    const params = start_date && end_date ? [id, start_date, end_date] : [id];

    // Time series data
    const timeSeriesQuery = group_by === 'hour'
      ? `DATE_TRUNC('hour', scanned_at)`
      : group_by === 'week'
      ? `DATE_TRUNC('week', scanned_at)`
      : `DATE_TRUNC('day', scanned_at)`;

    const timeSeries = await locationPool.query(`
      SELECT 
        ${timeSeriesQuery} as period,
        COUNT(*) as total_scans,
        COUNT(*) FILTER (WHERE is_unique_scan = true) as unique_scans
      FROM qr_code_scans
      WHERE qr_code_id = $1 ${dateFilter}
      GROUP BY period
      ORDER BY period
    `, params);
    
    // Device breakdown
    const devices = await locationPool.query(`
      SELECT
        device_type,
        COUNT(*) as count,
        ROUND(COUNT(*) * 100.0 / SUM(COUNT(*)) OVER(), 2) as percentage
      FROM qr_code_scans
      WHERE qr_code_id = $1 ${dateFilter}
      GROUP BY device_type
      ORDER BY count DESC
    `, params);

    // Browser breakdown
    const browsers = await locationPool.query(`
      SELECT
        browser,
        COUNT(*) as count,
        ROUND(COUNT(*) * 100.0 / SUM(COUNT(*)) OVER(), 2) as percentage
      FROM qr_code_scans
      WHERE qr_code_id = $1 ${dateFilter}
      GROUP BY browser
      ORDER BY count DESC
      LIMIT 10
    `, params);

    // OS breakdown
    const operatingSystems = await locationPool.query(`
      SELECT
        os,
        COUNT(*) as count,
        ROUND(COUNT(*) * 100.0 / SUM(COUNT(*)) OVER(), 2) as percentage
      FROM qr_code_scans
      WHERE qr_code_id = $1 ${dateFilter}
      GROUP BY os
      ORDER BY count DESC
      LIMIT 10
    `, params);

    // Country breakdown
    const countries = await locationPool.query(`
      SELECT
        COALESCE(country, 'Unknown') as country,
        country_code,
        COUNT(*) as count,
        ROUND(COUNT(*) * 100.0 / SUM(COUNT(*)) OVER(), 2) as percentage
      FROM qr_code_scans
      WHERE qr_code_id = $1 ${dateFilter}
      GROUP BY country, country_code
      ORDER BY count DESC
      LIMIT 20
    `, params);

    // City breakdown
    const cities = await locationPool.query(`
      SELECT
        COALESCE(city, 'Unknown') as city,
        country,
        COUNT(*) as count,
        ROUND(COUNT(*) * 100.0 / SUM(COUNT(*)) OVER(), 2) as percentage
      FROM qr_code_scans
      WHERE qr_code_id = $1 ${dateFilter}
      GROUP BY city, country
      ORDER BY count DESC
      LIMIT 20
    `, params);

    // Hour of day analysis
    const hourlyPattern = await locationPool.query(`
      SELECT
        EXTRACT(HOUR FROM scanned_at) as hour,
        COUNT(*) as count
      FROM qr_code_scans
      WHERE qr_code_id = $1 ${dateFilter}
      GROUP BY hour
      ORDER BY hour
    `, params);

    // Day of week analysis
    const weekdayPattern = await locationPool.query(`
      SELECT
        EXTRACT(DOW FROM scanned_at) as day_of_week,
        TO_CHAR(scanned_at, 'Day') as day_name,
        COUNT(*) as count
      FROM qr_code_scans
      WHERE qr_code_id = $1 ${dateFilter}
      GROUP BY day_of_week, day_name
      ORDER BY day_of_week
    `, params);

    // UTM breakdown
    const utmSources = await locationPool.query(`
      SELECT
        COALESCE(utm_source, 'Direct') as utm_source,
        utm_medium,
        utm_campaign,
        COUNT(*) as count
      FROM qr_code_scans
      WHERE qr_code_id = $1 ${dateFilter}
      GROUP BY utm_source, utm_medium, utm_campaign
      ORDER BY count DESC
      LIMIT 20
    `, params);

    // Summary stats
    const summary = await locationPool.query(`
      SELECT
        COUNT(*) as total_scans,
        COUNT(*) FILTER (WHERE is_unique_scan = true) as unique_scans,
        COUNT(DISTINCT country) as countries_reached,
        COUNT(DISTINCT city) as cities_reached,
        MIN(scanned_at) as first_scan,
        MAX(scanned_at) as last_scan
      FROM qr_code_scans
      WHERE qr_code_id = $1 ${dateFilter}
    `, params);

    // Prevent browser caching - analytics data changes frequently
    res.set('Cache-Control', 'no-cache, no-store, must-revalidate');
    res.set('Pragma', 'no-cache');
    res.set('Expires', '0');
    res.json({
      summary: summary.rows[0],
      time_series: timeSeries.rows,
      devices: devices.rows,
      browsers: browsers.rows,
      operating_systems: operatingSystems.rows,
      countries: countries.rows,
      cities: cities.rows,
      hourly_pattern: hourlyPattern.rows,
      weekday_pattern: weekdayPattern.rows,
      utm_sources: utmSources.rows
    });
  } catch (error) {
    logger.error({ err: error }, 'Error fetching detailed analytics:');
    res.status(500).json({ error: 'Failed to fetch detailed analytics' });
  }
}));

// GET /api/qr-codes/analytics/overview is defined earlier in the file

// =====================================================
// PREMIUM FEATURES: STICKERS (GET route defined earlier)
// =====================================================
