const express = require('express');
const { asyncHandler } = require('../middleware/error-handler');
const { pool, auth } = global;
const { logger } = require('../utils/logger');
const router = express.Router();

// Get alert configuration
router.get('/config', auth, asyncHandler(async (req, res) => {
  try {
    const result = await pool.query('SELECT * FROM bad_margin_alert_config WHERE id = 1');
    if (result.rows.length === 0) {
      // Return default config if none exists
      return res.json({
        id: 1,
        margin_threshold: 29.00,
        alert_emails: ['support@acmeops.com'],
        exception_service_ids: [],
        exception_labels: ['school', 'non', 'support'],
        enabled: true
      });
    }
    // Normalize array fields to ensure they're always arrays, not null
    const config = result.rows[0];
    res.json({
      ...config,
      alert_emails: Array.isArray(config.alert_emails) ? config.alert_emails : (config.alert_emails ? [config.alert_emails] : ['support@acmeops.com']),
      exception_service_ids: Array.isArray(config.exception_service_ids) ? config.exception_service_ids : [],
      exception_labels: Array.isArray(config.exception_labels) ? config.exception_labels : []
    });
  } catch (error) {
    logger.error({ err: error }, 'Error fetching alert config');
    // If table doesn't exist, return default config
    if (error.code === '42P01' || error.message.includes('does not exist')) {
      logger.warn('bad_margin_alert_config table does not exist. Please run the migration.');
      return res.json({
        id: 1,
        margin_threshold: 29.00,
        alert_emails: ['support@acmeops.com'],
        exception_service_ids: [],
        exception_labels: ['school', 'non', 'support'],
        enabled: true
      });
    }
    res.status(500).json({ error: 'Failed to fetch alert configuration', details: error.message });
  }
}));

// Update alert configuration
router.put('/config', auth, asyncHandler(async (req, res) => {
  try {
    const {
      margin_threshold,
      alert_emails,
      exception_service_ids,
      exception_labels,
      enabled
    } = req.body;

    // Check if table exists first
    try {
      await pool.query('SELECT 1 FROM bad_margin_alert_config LIMIT 1');
    } catch (tableError) {
      if (tableError.code === '42P01' || tableError.message.includes('does not exist')) {
        return res.status(503).json({ 
          error: 'Configuration table does not exist',
          message: 'Please run the migration: migrations/add_bad_margin_alerts.sql'
        });
      }
      throw tableError;
    }

    // Validate input
    if (margin_threshold !== undefined && (isNaN(margin_threshold) || margin_threshold < 0 || margin_threshold > 100)) {
      return res.status(400).json({ error: 'Margin threshold must be between 0 and 100' });
    }

    if (alert_emails !== undefined && !Array.isArray(alert_emails)) {
      return res.status(400).json({ error: 'alert_emails must be an array' });
    }

    // Build update query dynamically
    const updates = [];
    const values = [];
    let paramIndex = 1;

    if (margin_threshold !== undefined) {
      updates.push(`margin_threshold = $${paramIndex++}`);
      values.push(margin_threshold);
    }
    if (alert_emails !== undefined) {
      updates.push(`alert_emails = $${paramIndex++}`);
      values.push(alert_emails);
    }
    if (exception_service_ids !== undefined) {
      updates.push(`exception_service_ids = $${paramIndex++}`);
      values.push(exception_service_ids);
    }
    if (exception_labels !== undefined) {
      updates.push(`exception_labels = $${paramIndex++}`);
      values.push(exception_labels);
    }
    if (enabled !== undefined) {
      updates.push(`enabled = $${paramIndex++}`);
      values.push(enabled);
    }

    if (updates.length === 0) {
      return res.status(400).json({ error: 'No fields to update' });
    }

    // Always update updated_at
    updates.push(`updated_at = NOW()`);

    values.push(1); // id = 1

    const query = `
      UPDATE bad_margin_alert_config 
      SET ${updates.join(', ')} 
      WHERE id = $${paramIndex}
      RETURNING *
    `;

    const result = await pool.query(query, values);
    res.json(result.rows[0]);
  } catch (error) {
    logger.error({ err: error }, 'Error updating alert config');
    res.status(500).json({ 
      error: 'Failed to update alert configuration',
      details: error.message,
      code: error.code
    });
  }
}));

// Get alert history with filtering
router.get('/alerts', auth, asyncHandler(async (req, res) => {
  try {
    // Check if table exists first
    try {
      await pool.query('SELECT 1 FROM bad_margin_alerts LIMIT 1');
    } catch (tableError) {
      if (tableError.code === '42P01' || tableError.message.includes('does not exist')) {
        return res.json({
          alerts: [],
          total: 0,
          limit: parseInt(req.query.limit || 50),
          offset: parseInt(req.query.offset || 0),
          message: 'Alert history table does not exist. Please run the migration.'
        });
      }
      throw tableError;
    }

    const {
      status,
      limit = 50,
      offset = 0,
      startDate,
      endDate,
      minMargin,
      maxMargin
    } = req.query;

    let whereConditions = [];
    const queryParams = [];
    let paramIndex = 1;

    if (status) {
      whereConditions.push(`status = $${paramIndex++}`);
      queryParams.push(status);
    }

    if (startDate) {
      whereConditions.push(`alert_sent_at >= $${paramIndex++}`);
      queryParams.push(startDate);
    }

    if (endDate) {
      whereConditions.push(`alert_sent_at <= $${paramIndex++}`);
      queryParams.push(endDate);
    }

    if (minMargin !== undefined) {
      whereConditions.push(`margin_percentage >= $${paramIndex++}`);
      queryParams.push(parseFloat(minMargin));
    }

    if (maxMargin !== undefined) {
      whereConditions.push(`margin_percentage <= $${paramIndex++}`);
      queryParams.push(parseFloat(maxMargin));
    }

    const whereClause = whereConditions.length > 0 
      ? `WHERE ${whereConditions.join(' AND ')}` 
      : '';

    // Get total count
    const countQuery = `SELECT COUNT(*) FROM bad_margin_alerts ${whereClause}`;
    const countResult = await pool.query(countQuery, queryParams);
    const totalCount = parseInt(countResult.rows[0].count);

    // Get alerts
    queryParams.push(parseInt(limit));
    queryParams.push(parseInt(offset));

    const alertsQuery = `
      SELECT * FROM bad_margin_alerts 
      ${whereClause}
      ORDER BY alert_sent_at DESC 
      LIMIT $${paramIndex++} OFFSET $${paramIndex++}
    `;

    const alertsResult = await pool.query(alertsQuery, queryParams);

    res.json({
      alerts: alertsResult.rows,
      total: totalCount,
      limit: parseInt(limit),
      offset: parseInt(offset)
    });
  } catch (error) {
    logger.error({ err: error }, 'Error fetching alerts');
    res.status(500).json({ 
      error: 'Failed to fetch alerts',
      details: error.message,
      code: error.code
    });
  }
}));

// Get alert summary statistics
router.get('/alerts/summary', auth, asyncHandler(async (req, res) => {
  try {
    // Check if table exists first
    try {
      await pool.query('SELECT 1 FROM bad_margin_alerts LIMIT 1');
    } catch (tableError) {
      if (tableError.code === '42P01' || tableError.message.includes('does not exist')) {
        return res.json({
          by_status: {},
          total: 0,
          open: 0,
          resolved: 0,
          message: 'Alert history table does not exist. Please run the migration.'
        });
      }
      throw tableError;
    }

    const result = await pool.query(`
      SELECT 
        status,
        COUNT(*) as count,
        AVG(margin_percentage) as avg_margin,
        AVG(profit_loss) as avg_profit_loss,
        SUM(CASE WHEN profit_loss < 0 THEN 1 ELSE 0 END) as loss_count,
        SUM(CASE WHEN profit_loss >= 0 THEN 1 ELSE 0 END) as profit_count
      FROM bad_margin_alerts
      GROUP BY status
      ORDER BY status
    `);

    const summary = result.rows.reduce((acc, row) => {
      acc[row.status] = {
        count: parseInt(row.count),
        avg_margin: parseFloat(row.avg_margin || 0),
        avg_profit_loss: parseFloat(row.avg_profit_loss || 0),
        loss_count: parseInt(row.loss_count || 0),
        profit_count: parseInt(row.profit_count || 0)
      };
      return acc;
    }, {});

    // Get total counts
    const totalResult = await pool.query(`
      SELECT 
        COUNT(*) as total,
        COUNT(CASE WHEN status = 'open' THEN 1 END) as open_count,
        COUNT(CASE WHEN status = 'resolved' THEN 1 END) as resolved_count
      FROM bad_margin_alerts
    `);

    res.json({
      by_status: summary,
      total: parseInt(totalResult.rows[0].total || 0),
      open: parseInt(totalResult.rows[0].open_count || 0),
      resolved: parseInt(totalResult.rows[0].resolved_count || 0)
    });
  } catch (error) {
    logger.error({ err: error }, 'Error fetching alert summary');
    res.status(500).json({ 
      error: 'Failed to fetch alert summary',
      details: error.message,
      code: error.code
    });
  }
}));

// Update alert status
router.put('/alerts/:id/status', auth, asyncHandler(async (req, res) => {
  try {
    const { id } = req.params;
    const { status, resolved_by, resolution_notes } = req.body;

    const validStatuses = ['open', 'in_progress', 'resolved', 'ignored'];
    if (!validStatuses.includes(status)) {
      return res.status(400).json({ error: `Invalid status. Must be one of: ${validStatuses.join(', ')}` });
    }

    const updates = [];
    const values = [];
    let paramIndex = 1;

    updates.push(`status = $${paramIndex++}`);
    values.push(status);

    if (status === 'resolved') {
      updates.push(`resolved_at = NOW()`);
      if (resolved_by) {
        updates.push(`resolved_by = $${paramIndex++}`);
        values.push(resolved_by);
      }
    }

    if (resolution_notes) {
      updates.push(`resolution_notes = $${paramIndex++}`);
      values.push(resolution_notes);
    }

    updates.push(`updated_at = NOW()`);
    values.push(id);

    const query = `
      UPDATE bad_margin_alerts 
      SET ${updates.join(', ')} 
      WHERE id = $${paramIndex}
      RETURNING *
    `;

    const result = await pool.query(query, values);
    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Alert not found' });
    }

    res.json(result.rows[0]);
  } catch (error) {
    logger.error({ err: error }, 'Error updating alert status');
    res.status(500).json({ error: 'Failed to update alert status' });
  }
}));

// Get single alert details
router.get('/alerts/:id', auth, asyncHandler(async (req, res) => {
  try {
    const { id } = req.params;
    const result = await pool.query('SELECT * FROM bad_margin_alerts WHERE id = $1', [id]);
    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Alert not found' });
    }
    res.json(result.rows[0]);
  } catch (error) {
    logger.error({ err: error }, 'Error fetching alert');
    res.status(500).json({ error: 'Failed to fetch alert' });
  }
}));

module.exports = router;
