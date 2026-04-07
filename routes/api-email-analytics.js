const express = require('express');
const router = express.Router();
const { getLocationPool } = require('../utils/pool');
const { columnsExist } = require('../utils/schema-cache');
const { asyncHandler } = require('../middleware/error-handler');
const { logger } = require('../utils/logger');

// GET /api/email-analytics/metrics - Get email analytics metrics
router.get('/metrics', asyncHandler(async (req, res) => {
  try {
    const pool = getLocationPool(req);
    if (!pool) {
      return res.status(500).json({ error: 'Database connection not available' });
    }

    const { start_date, end_date } = req.query;

    // Build date filter
    let dateFilter = '';
    const params = [];
    let paramCount = 0;

    if (start_date || end_date) {
      if (start_date) {
        paramCount++;
        dateFilter += ` AND (cr.sent_at >= $${paramCount} OR cr.date_sent >= $${paramCount})`;
        params.push(start_date);
      }
      if (end_date) {
        paramCount++;
        dateFilter += ` AND (cr.sent_at <= $${paramCount} OR cr.date_sent <= $${paramCount})`;
        params.push(`${end_date} 23:59:59`);
      }
    }

    // Check if client_reports table has email tracking fields (cached)
    const trackingColumns = await columnsExist(pool, 'client_reports', ['email_opened_at', 'email_clicked_at', 'email_delivered_at']);

    if (trackingColumns.length === 0) {
      // Return empty metrics if tracking fields don't exist
      return res.json({
        total_sent: 0,
        delivered: 0,
        opened: 0,
        clicked: 0,
        bounced: 0,
        complained: 0,
        unsubscribed: 0,
        avg_engagement_score: 0
      });
    }

    // Get email metrics from client_reports table
    const metricsQuery = `
      SELECT 
        COUNT(*) as total_sent,
        COUNT(CASE WHEN email_delivered_at IS NOT NULL THEN 1 END) as delivered,
        COUNT(CASE WHEN email_opened_at IS NOT NULL THEN 1 END) as opened,
        COUNT(CASE WHEN email_clicked_at IS NOT NULL THEN 1 END) as clicked,
        COUNT(CASE WHEN email_bounced_at IS NOT NULL THEN 1 END) as bounced,
        COUNT(CASE WHEN email_complained_at IS NOT NULL THEN 1 END) as complained,
        COUNT(CASE WHEN email_unsubscribed_at IS NOT NULL THEN 1 END) as unsubscribed,
        AVG(engagement_score) as avg_engagement_score,
        SUM(email_opened_count) as total_opens,
        SUM(email_clicked_count) as total_clicks
      FROM client_reports cr
      WHERE (cr.sent_at IS NOT NULL OR cr.date_sent IS NOT NULL)
      ${dateFilter}
    `;

    const { rows } = await pool.query(metricsQuery, params);

    const metrics = rows[0] || {
      total_sent: 0,
      delivered: 0,
      opened: 0,
      clicked: 0,
      bounced: 0,
      complained: 0,
      unsubscribed: 0,
      avg_engagement_score: 0,
      total_opens: 0,
      total_clicks: 0
    };

    res.json({
      total_sent: parseInt(metrics.total_sent, 10) || 0,
      delivered: parseInt(metrics.delivered, 10) || 0,
      opened: parseInt(metrics.opened, 10) || 0,
      clicked: parseInt(metrics.clicked, 10) || 0,
      bounced: parseInt(metrics.bounced, 10) || 0,
      complained: parseInt(metrics.complained, 10) || 0,
      unsubscribed: parseInt(metrics.unsubscribed, 10) || 0,
      avg_engagement_score: parseFloat(metrics.avg_engagement_score) || 0,
      total_opens: parseInt(metrics.total_opens, 10) || 0,
      total_clicks: parseInt(metrics.total_clicks, 10) || 0
    });
  } catch (error) {
    logger.error({ err: error }, 'Error fetching email analytics metrics:');
    res.status(500).json({
      error: 'Failed to fetch email analytics',
      details: error.message,
      stack: process.env.NODE_ENV === 'development' ? error.stack : undefined
    });
  }
}));

// GET /api/email-analytics/emails - Get individual email performance
router.get('/emails', asyncHandler(async (req, res) => {
  try {
    const pool = getLocationPool(req);
    if (!pool) {
      return res.status(500).json({ error: 'Database connection not available' });
    }

    const {
      start_date,
      end_date,
      client,
      tutor,
      search,
      page = 1,
      limit = 50
    } = req.query;

    const params = [];
    let paramCount = 0;
    let whereConditions = [];

    let baseQuery = `
      FROM client_reports cr
      LEFT JOIN appointments a ON cr.appointment_id = a.appointment_id
      LEFT JOIN services s ON a.service_id = s.service_id
      LEFT JOIN contractors ct ON a.contractor_id = ct.contractor_id
      LEFT JOIN clients c ON cr.client_email = c.email
      WHERE (cr.sent_at IS NOT NULL OR cr.date_sent IS NOT NULL)
    `;

    if (start_date) {
      paramCount++;
      whereConditions.push(`(cr.sent_at >= $${paramCount} OR cr.date_sent >= $${paramCount})`);
      params.push(start_date);
    }

    if (end_date) {
      paramCount++;
      whereConditions.push(`(cr.sent_at <= $${paramCount} OR cr.date_sent <= $${paramCount})`);
      params.push(`${end_date} 23:59:59`);
    }

    if (search) {
      paramCount++;
      whereConditions.push(`(
        cr.email_subject ILIKE $${paramCount} OR
        cr.client_email ILIKE $${paramCount} OR
        cr.student_name ILIKE $${paramCount}
      )`);
      params.push(`%${search}%`);
    }

    if (client) {
      paramCount++;
      whereConditions.push(`(c.first_name ILIKE $${paramCount} OR c.last_name ILIKE $${paramCount})`);
      params.push(`%${client}%`);
    }

    if (tutor) {
      paramCount++;
      whereConditions.push(`(ct.first_name ILIKE $${paramCount} OR ct.last_name ILIKE $${paramCount})`);
      params.push(`%${tutor}%`);
    }

    const whereClause = whereConditions.length > 0 
      ? ` AND ${whereConditions.join(' AND ')}`
      : '';

    // Get total count
    const countQuery = `SELECT COUNT(*) as total ${baseQuery}${whereClause}`;
    const countResult = await pool.query(countQuery, params);
    const total = parseInt(countResult.rows[0].total, 10);

    // Get paginated results
    const offset = (parseInt(page, 10) - 1) * parseInt(limit, 10);
    paramCount++;
    params.push(parseInt(limit, 10));
    paramCount++;
    params.push(offset);

    const selectQuery = `
      SELECT 
        cr.id,
        cr.email_subject,
        cr.client_email,
        cr.student_name,
        cr.sent_at,
        cr.date_sent,
        cr.email_opened_at,
        cr.email_opened_count,
        cr.email_clicked_at,
        cr.email_clicked_count,
        cr.email_delivered_at,
        cr.email_bounced_at,
        cr.email_complained_at,
        cr.engagement_score,
        COALESCE(c.first_name || ' ' || c.last_name, '') as client_name,
        COALESCE(ct.first_name || ' ' || ct.last_name, '') as tutor_name,
        s.name as service_name
      ${baseQuery}${whereClause}
      ORDER BY COALESCE(cr.sent_at, cr.date_sent) DESC
      LIMIT $${paramCount - 1} OFFSET $${paramCount}
    `;

    const { rows } = await pool.query(selectQuery, params);

    res.json({
      data: rows,
      emails: rows,
      pagination: {
        page: parseInt(page, 10),
        limit: parseInt(limit, 10),
        total,
        totalPages: Math.ceil(total / parseInt(limit, 10))
      }
    });
  } catch (error) {
    logger.error({ err: error }, 'Error fetching email list:');
    res.status(500).json({
      error: 'Failed to fetch email list',
      details: error.message,
      stack: process.env.NODE_ENV === 'development' ? error.stack : undefined
    });
  }
}));

module.exports = router;

