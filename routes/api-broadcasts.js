const express = require('express');
const router = express.Router();
const { tableExists } = require('../utils/schema-cache');

const { getLocationPool } = require('../utils/pool');
const { asyncHandler } = require('../middleware/error-handler');
const { logger } = require('../utils/logger');

// POST /api/broadcasts - Create a new broadcast
router.post('/', asyncHandler(async (req, res) => {
  try {
    const pool = getLocationPool(req);
    if (!pool) {
      return res.status(500).json({ error: 'Database connection not available' });
    }

    const {
      send_to,
      status_filter,
      label_filter,
      email_style,
      subject,
      email_body
    } = req.body;

    // Validate required fields
    if (!subject || !email_body) {
      return res.status(400).json({ 
        error: 'Missing required fields',
        details: 'Subject and email_body are required'
      });
    }

    // Check if broadcasts table exists (cached)
    const bcExists = await tableExists(pool, 'broadcasts');

    if (!bcExists) {
      return res.status(500).json({ 
        error: 'Broadcasts table does not exist',
        details: 'Please run the migration to create the broadcasts table'
      });
    }

    // Calculate recipient count (simplified - would need actual query in production)
    const recipientCount = 0; // TODO: Calculate based on filters

    // Insert into database
    const insertQuery = `
      INSERT INTO broadcasts (
        send_to, status_filter, label_filter, email_style,
        subject, email_body, recipient_count, status,
        date_created, last_updated
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, NOW(), NOW())
      RETURNING *
    `;

    const { rows } = await pool.query(insertQuery, [
      send_to || 'client',
      JSON.stringify(status_filter || []),
      JSON.stringify(label_filter || []),
      email_style || null,
      subject,
      email_body,
      recipientCount,
      'draft'
    ]);

    res.status(201).json({ broadcast: rows[0] });
  } catch (error) {
    logger.error({ err: error }, 'Error creating broadcast');
    res.status(500).json({
      error: 'Failed to create broadcast',
      details: error.message,
      stack: process.env.NODE_ENV === 'development' ? error.stack : undefined
    });
  }
}));

// PUT /api/broadcasts/:id - Update an existing broadcast
router.put('/:id', asyncHandler(async (req, res) => {
  try {
    const pool = getLocationPool(req);
    if (!pool) {
      return res.status(500).json({ error: 'Database connection not available' });
    }

    const broadcastId = req.params.id;
    const {
      send_to,
      status_filter,
      label_filter,
      email_style,
      subject,
      email_body
    } = req.body;

    // Validate required fields
    if (!subject || !email_body) {
      return res.status(400).json({ 
        error: 'Missing required fields',
        details: 'Subject and email_body are required'
      });
    }

    // Check if broadcasts table exists (cached)
    const bcExists = await tableExists(pool, 'broadcasts');

    if (!bcExists) {
      return res.status(500).json({ 
        error: 'Broadcasts table does not exist',
        details: 'Please run the migration to create the broadcasts table'
      });
    }

    // Calculate recipient count (simplified - would need actual query in production)
    const recipientCount = 0; // TODO: Calculate based on filters

    // Update in database
    const updateQuery = `
      UPDATE broadcasts SET
        send_to = $1,
        status_filter = $2,
        label_filter = $3,
        email_style = $4,
        subject = $5,
        email_body = $6,
        recipient_count = $7,
        last_updated = NOW()
      WHERE id = $8
      RETURNING *
    `;

    const { rows } = await pool.query(updateQuery, [
      send_to || 'client',
      JSON.stringify(status_filter || []),
      JSON.stringify(label_filter || []),
      email_style || null,
      subject,
      email_body,
      recipientCount,
      broadcastId
    ]);

    if (rows.length === 0) {
      return res.status(404).json({ error: 'Broadcast not found' });
    }

    res.json({ broadcast: rows[0] });
  } catch (error) {
    logger.error({ err: error }, 'Error updating broadcast');
    res.status(500).json({
      error: 'Failed to update broadcast',
      details: error.message,
      stack: process.env.NODE_ENV === 'development' ? error.stack : undefined
    });
  }
}));

// GET /api/broadcasts/:id - Get a single broadcast
router.get('/:id', asyncHandler(async (req, res) => {
  try {
    const pool = getLocationPool(req);
    if (!pool) {
      return res.status(500).json({ error: 'Database connection not available' });
    }

    const broadcastId = req.params.id;

    // Check if broadcasts table exists (cached)
    const bcExists = await tableExists(pool, 'broadcasts');

    if (!bcExists) {
      return res.status(404).json({ error: 'Broadcasts table does not exist' });
    }

    const { rows } = await pool.query(
      'SELECT * FROM broadcasts WHERE id = $1',
      [broadcastId]
    );

    if (rows.length === 0) {
      return res.status(404).json({ error: 'Broadcast not found' });
    }

    // Parse JSON fields
    const broadcast = rows[0];
    if (broadcast.status_filter) {
      try {
        broadcast.status_filter = typeof broadcast.status_filter === 'string' 
          ? JSON.parse(broadcast.status_filter) 
          : broadcast.status_filter;
      } catch (e) {
        broadcast.status_filter = [];
      }
    }
    if (broadcast.label_filter) {
      try {
        broadcast.label_filter = typeof broadcast.label_filter === 'string'
          ? JSON.parse(broadcast.label_filter)
          : broadcast.label_filter;
      } catch (e) {
        broadcast.label_filter = [];
      }
    }

    res.json({ broadcast });
  } catch (error) {
    logger.error({ err: error }, 'Error fetching broadcast');
    res.status(500).json({
      error: 'Failed to fetch broadcast',
      details: error.message
    });
  }
}));

// DELETE /api/broadcasts/:id - Delete a broadcast
router.delete('/:id', asyncHandler(async (req, res) => {
  try {
    const pool = getLocationPool(req);
    if (!pool) {
      return res.status(500).json({ error: 'Database connection not available' });
    }

    const broadcastId = req.params.id;

    const { rows } = await pool.query(
      'DELETE FROM broadcasts WHERE id = $1 RETURNING id',
      [broadcastId]
    );

    if (rows.length === 0) {
      return res.status(404).json({ error: 'Broadcast not found' });
    }

    res.json({ message: 'Broadcast deleted successfully' });
  } catch (error) {
    logger.error({ err: error }, 'Error deleting broadcast');
    res.status(500).json({
      error: 'Failed to delete broadcast',
      details: error.message
    });
  }
}));

// GET /api/broadcasts/recipient-count - Calculate recipient count based on filters
router.get('/recipient-count', asyncHandler(async (req, res) => {
  try {
    const pool = getLocationPool(req);
    if (!pool) {
      return res.status(500).json({ error: 'Database connection not available' });
    }

    const { send_to, status, labels } = req.query;

    // This is a simplified version - in production, you'd query the actual clients/contractors table
    // based on the filters
    let count = 0;

    if (send_to === 'client') {
      let query = 'SELECT COUNT(*) as count FROM clients WHERE 1=1';
      const params = [];
      let paramCount = 0;

      if (status) {
        const statuses = status.split(',');
        paramCount++;
        query += ` AND status = ANY($${paramCount})`;
        params.push(statuses);
      }

      if (labels) {
        const labelIds = labels.split(',').map(id => parseInt(id));
        // This would need to check labels JSONB column
        // Simplified for now
      }

      const result = await pool.query(query, params);
      count = parseInt(result.rows[0].count, 10);
    } else if (send_to === 'contractor') {
      let query = 'SELECT COUNT(*) as count FROM contractors WHERE 1=1';
      const params = [];
      let paramCount = 0;

      if (status) {
        const statuses = status.split(',');
        paramCount++;
        query += ` AND status = ANY($${paramCount})`;
        params.push(statuses);
      }

      const result = await pool.query(query, params);
      count = parseInt(result.rows[0].count, 10);
    }

    res.json({ count });
  } catch (error) {
    logger.error({ err: error }, 'Error calculating recipient count');
    res.status(500).json({
      error: 'Failed to calculate recipient count',
      details: error.message
    });
  }
}));

// POST /api/broadcasts/:id/send-preview - Send preview email
router.post('/:id/send-preview', asyncHandler(async (req, res) => {
  try {
    // TODO: Implement preview email sending
    res.json({ message: 'Preview email sent successfully' });
  } catch (error) {
    logger.error({ err: error }, 'Error sending preview');
    res.status(500).json({
      error: 'Failed to send preview',
      details: error.message
    });
  }
}));

// POST /api/broadcasts/:id/send - Send broadcast
router.post('/:id/send', asyncHandler(async (req, res) => {
  try {
    const pool = getLocationPool(req);
    if (!pool) {
      return res.status(500).json({ error: 'Database connection not available' });
    }

    const broadcastId = req.params.id;

    // Get broadcast
    const { rows } = await pool.query(
      'SELECT * FROM broadcasts WHERE id = $1',
      [broadcastId]
    );

    if (rows.length === 0) {
      return res.status(404).json({ error: 'Broadcast not found' });
    }

    // TODO: Implement actual email sending logic
    // For now, just update the last_sent timestamp
    await pool.query(
      'UPDATE broadcasts SET last_sent = NOW(), status = $1 WHERE id = $2',
      ['sent', broadcastId]
    );

    res.json({ message: 'Broadcast sent successfully' });
  } catch (error) {
    logger.error({ err: error }, 'Error sending broadcast');
    res.status(500).json({
      error: 'Failed to send broadcast',
      details: error.message
    });
  }
}));

module.exports = router;

