const express = require('express');
const router = express.Router();

const { getLocationPool } = require('../utils/pool');
const { asyncHandler } = require('../middleware/error-handler');
const { logger } = require('../utils/logger');

// GET /api/entity-lists/outbound-emails - Get list of outbound emails
router.get('/', asyncHandler(async (req, res) => {
  try {
    const pool = getLocationPool(req);
    if (!pool) {
      return res.status(500).json({ error: 'Database connection not available' });
    }

    const { search, status, page = 1, limit = 50 } = req.query;
    const params = [];
    let paramCount = 0;
    let whereConditions = [];

    let baseQuery = `
      FROM client_reports cr
      WHERE (cr.sent_at IS NOT NULL OR cr.date_sent IS NOT NULL)
    `;

    if (search) {
      paramCount++;
      whereConditions.push(`(
        cr.email_subject ILIKE $${paramCount} OR
        cr.client_email ILIKE $${paramCount} OR
        cr.client_name ILIKE $${paramCount} OR
        cr.student_name ILIKE $${paramCount}
      )`);
      params.push(`%${search}%`);
    }

    if (status && status !== 'all') {
      if (status === 'opened') {
        whereConditions.push(`cr.email_opened_at IS NOT NULL`);
      } else if (status === 'sent') {
        whereConditions.push(`cr.email_opened_at IS NULL`);
      } else {
        paramCount++;
        whereConditions.push(`cr.status = $${paramCount}`);
        params.push(status);
      }
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
        cr.id,
        cr.email_subject,
        cr.client_email,
        cr.client_name,
        cr.student_name,
        cr.tutor_name,
        cr.sent_at,
        cr.date_sent,
        cr.status,
        cr.email_opened_at,
        cr.email_opened_count,
        cr.email_clicked_at,
        cr.email_clicked_count,
        cr.email_delivered_at,
        cr.email_bounced_at,
        cr.brevo_message_id,
        cr.tutor_feedback,
        cr.last_updated
      ${baseQuery}
      ORDER BY COALESCE(cr.sent_at, cr.date_sent) DESC
      LIMIT $${paramCount + 1} OFFSET $${paramCount + 2}
    `;

    params.push(limit, offset);
    const { rows: emails } = await pool.query(selectQuery, params);

    res.json({
      data: emails,
      'outbound-emails': emails,
      pagination: { page, limit, total, totalPages }
    });
  } catch (error) {
    logger.error({ err: error }, 'Error fetching outbound emails list');
    res.status(500).json({
      error: 'Failed to fetch outbound emails list',
      details: error.message,
      stack: process.env.NODE_ENV === 'development' ? error.stack : undefined
    });
  }
}));

// GET /api/outbound-emails/:id - Get single email details
router.get('/:id', asyncHandler(async (req, res) => {
  try {
    const pool = getLocationPool(req);
    if (!pool) {
      return res.status(500).json({ error: 'Database connection not available' });
    }

    const { id } = req.params;

    const { rows } = await pool.query(`
      SELECT
        cr.id,
        cr.email_subject,
        cr.client_email,
        cr.client_name,
        cr.student_name,
        cr.tutor_name,
        cr.sent_at,
        cr.date_sent,
        cr.status,
        cr.email_opened_at,
        cr.email_opened_count,
        cr.email_clicked_at,
        cr.email_clicked_count,
        cr.email_delivered_at,
        cr.email_bounced_at,
        cr.email_complained_at,
        cr.brevo_message_id,
        cr.tutor_feedback,
        cr.engagement_score,
        cr.brevo_events
      FROM client_reports cr
      WHERE cr.id = $1
    `, [id]);

    if (rows.length === 0) {
      return res.status(404).json({ error: 'Email not found' });
    }

    const email = rows[0];

    // Try to get email body from report template or generate from tutor feedback
    // For now, we'll use tutor_feedback as the email body
    // In a real implementation, you might want to fetch the actual email HTML from Brevo API
    const emailBody = email.tutor_feedback || 'No email body available';

    res.json({
      ...email,
      email_body: emailBody,
      attachments: [] // Attachments would need to be stored separately or fetched from Brevo
    });
  } catch (error) {
    logger.error({ err: error }, 'Error fetching email details');
    res.status(500).json({
      error: 'Failed to fetch email details',
      details: error.message,
      stack: process.env.NODE_ENV === 'development' ? error.stack : undefined
    });
  }
}));

module.exports = router;

