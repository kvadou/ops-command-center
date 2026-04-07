const express = require('express');
const router = express.Router();
const { tableExists } = require('../utils/schema-cache');

const { getLocationPool } = require('../utils/pool');
const { asyncHandler } = require('../middleware/error-handler');
const { logger } = require('../utils/logger');

// GET /api/lesson-reminders - List all lesson reminders
router.get('/', asyncHandler(async (req, res) => {
  try {
    const pool = getLocationPool(req);
    if (!pool) {
      return res.status(500).json({ error: 'Database connection not available' });
    }

    // Check if table exists (cached)
    const lrExists = await tableExists(pool, 'lesson_reminders');

    if (!lrExists) {
      return res.json({
        data: [],
        'lesson-reminders': [],
        pagination: { page: 1, limit: 50, total: 0, totalPages: 0 }
      });
    }

    const { search, enabled, page = 1, limit = 50 } = req.query;
    const params = [];
    let paramCount = 0;
    let whereConditions = [];

    let baseQuery = `FROM lesson_reminders WHERE 1=1`;

    if (search) {
      paramCount++;
      whereConditions.push(`name ILIKE $${paramCount}`);
      params.push(`%${search}%`);
    }

    if (enabled !== undefined && enabled !== 'all') {
      paramCount++;
      whereConditions.push(`enabled = $${paramCount}`);
      params.push(enabled === 'true');
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
        name,
        enabled,
        label_ids,
        recipient_types,
        send_to_associated_clients,
        delivery_time_offset,
        date_created,
        last_updated
      ${baseQuery}
      ORDER BY date_created DESC
      LIMIT $${paramCount + 1} OFFSET $${paramCount + 2}
    `;

    params.push(limit, offset);
    const { rows: reminders } = await pool.query(selectQuery, params);

    res.json({
      data: reminders,
      'lesson-reminders': reminders,
      pagination: { page, limit, total, totalPages }
    });
  } catch (error) {
    logger.error({ err: error }, 'Error fetching lesson reminders list:');
    res.status(500).json({
      error: 'Failed to fetch lesson reminders list',
      details: error.message,
      stack: process.env.NODE_ENV === 'development' ? error.stack : undefined
    });
  }
}));

// GET /api/lesson-reminders/:id - Get single reminder
router.get('/:id', asyncHandler(async (req, res) => {
  try {
    const pool = getLocationPool(req);
    if (!pool) {
      return res.status(500).json({ error: 'Database connection not available' });
    }

    const { id } = req.params;

    const { rows } = await pool.query(
      'SELECT * FROM lesson_reminders WHERE id = $1',
      [id]
    );

    if (rows.length === 0) {
      return res.status(404).json({ error: 'Reminder not found' });
    }

    res.json(rows[0]);
  } catch (error) {
    logger.error({ err: error }, 'Error fetching lesson reminder:');
    res.status(500).json({
      error: 'Failed to fetch lesson reminder',
      details: error.message,
      stack: process.env.NODE_ENV === 'development' ? error.stack : undefined
    });
  }
}));

// POST /api/lesson-reminders - Create new reminder
router.post('/', asyncHandler(async (req, res) => {
  try {
    const pool = getLocationPool(req);
    if (!pool) {
      return res.status(500).json({ error: 'Database connection not available' });
    }

    const {
      name,
      enabled = true,
      label_ids = [],
      recipient_types = [],
      send_to_associated_clients = false,
      delivery_time_offset
    } = req.body;

    if (!name || !delivery_time_offset) {
      return res.status(400).json({
        error: 'Missing required fields',
        details: 'Name and delivery_time_offset are required'
      });
    }

    // Check if table exists (cached)
    const lrExists = await tableExists(pool, 'lesson_reminders');

    if (!lrExists) {
      return res.status(500).json({
        error: 'Lesson reminders table does not exist',
        details: 'Please run the migration to create the lesson_reminders table'
      });
    }

    const insertQuery = `
      INSERT INTO lesson_reminders (
        name, enabled, label_ids, recipient_types,
        send_to_associated_clients, delivery_time_offset,
        date_created, last_updated
      ) VALUES ($1, $2, $3, $4, $5, $6, NOW(), NOW())
      RETURNING *
    `;

    const { rows } = await pool.query(insertQuery, [
      name,
      enabled,
      JSON.stringify(label_ids),
      JSON.stringify(recipient_types),
      send_to_associated_clients,
      delivery_time_offset
    ]);

    res.json({
      success: true,
      reminder: rows[0]
    });
  } catch (error) {
    logger.error({ err: error }, 'Error creating lesson reminder:');
    res.status(500).json({
      error: 'Failed to create lesson reminder',
      details: error.message,
      stack: process.env.NODE_ENV === 'development' ? error.stack : undefined
    });
  }
}));

// PUT /api/lesson-reminders/:id - Update reminder
router.put('/:id', asyncHandler(async (req, res) => {
  try {
    const pool = getLocationPool(req);
    if (!pool) {
      return res.status(500).json({ error: 'Database connection not available' });
    }

    const { id } = req.params;
    const {
      name,
      enabled,
      label_ids,
      recipient_types,
      send_to_associated_clients,
      delivery_time_offset
    } = req.body;

    if (!name || !delivery_time_offset) {
      return res.status(400).json({
        error: 'Missing required fields',
        details: 'Name and delivery_time_offset are required'
      });
    }

    const updateQuery = `
      UPDATE lesson_reminders SET
        name = $1,
        enabled = $2,
        label_ids = $3,
        recipient_types = $4,
        send_to_associated_clients = $5,
        delivery_time_offset = $6,
        last_updated = NOW()
      WHERE id = $7
      RETURNING *
    `;

    const { rows } = await pool.query(updateQuery, [
      name,
      enabled,
      JSON.stringify(label_ids || []),
      JSON.stringify(recipient_types || []),
      send_to_associated_clients,
      delivery_time_offset,
      id
    ]);

    if (rows.length === 0) {
      return res.status(404).json({ error: 'Reminder not found' });
    }

    res.json({
      success: true,
      reminder: rows[0]
    });
  } catch (error) {
    logger.error({ err: error }, 'Error updating lesson reminder:');
    res.status(500).json({
      error: 'Failed to update lesson reminder',
      details: error.message,
      stack: process.env.NODE_ENV === 'development' ? error.stack : undefined
    });
  }
}));

// DELETE /api/lesson-reminders/:id - Delete reminder
router.delete('/:id', asyncHandler(async (req, res) => {
  try {
    const pool = getLocationPool(req);
    if (!pool) {
      return res.status(500).json({ error: 'Database connection not available' });
    }

    const { id } = req.params;

    const { rows } = await pool.query(
      'DELETE FROM lesson_reminders WHERE id = $1 RETURNING id',
      [id]
    );

    if (rows.length === 0) {
      return res.status(404).json({ error: 'Reminder not found' });
    }

    res.json({ success: true, message: 'Reminder deleted successfully' });
  } catch (error) {
    logger.error({ err: error }, 'Error deleting lesson reminder:');
    res.status(500).json({
      error: 'Failed to delete lesson reminder',
      details: error.message,
      stack: process.env.NODE_ENV === 'development' ? error.stack : undefined
    });
  }
}));

module.exports = router;

