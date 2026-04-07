const express = require('express');
const { asyncHandler } = require('../middleware/error-handler');
const router = express.Router();
const { auth } = global;
const { logger } = require('../utils/logger');

// GET /api/activity
// Returns activity/action counts grouped by time periods
// Query params: interval (month|week|day), startDate, endDate, actionFilter, showAllBranches
router.get('/', auth, asyncHandler(async (req, res) => {
  const pool = req.locationPool || global.pool;
  const client = await pool.connect();
  
  try {
    const { 
      interval = 'month', 
      startDate, 
      endDate, 
      actionFilter,
      showAllBranches = 'false' 
    } = req.query;
    
    if (!startDate || !endDate) {
      return res.status(400).json({ error: 'startDate and endDate are required' });
    }

    const start = new Date(startDate);
    const end = new Date(endDate);
    end.setHours(23, 59, 59, 999);

    // Determine date truncation and format based on interval
    let dateTrunc, dateFormat, periodLabelFormat;
    switch (interval) {
      case 'day':
        dateTrunc = 'day';
        dateFormat = 'YYYY-MM-DD';
        periodLabelFormat = 'Mon DD, YYYY';
        break;
      case 'week':
        dateTrunc = 'week';
        dateFormat = 'YYYY-MM-DD';
        periodLabelFormat = 'Mon DD, YYYY';
        break;
      case 'month':
      default:
        dateTrunc = 'month';
        dateFormat = 'YYYY-MM-DD';
        periodLabelFormat = 'Mon YY';
        break;
    }

    // Build activity query - count various system activities
    // This aggregates appointments, invoices, and other activities as "actions"
    const query = `
      WITH appointment_actions AS (
        SELECT 
          DATE_TRUNC('${dateTrunc}', a.start)::date AS period_date,
          COUNT(*)::bigint AS action_count
        FROM appointments a
        WHERE a.status IN ('complete', 'cancelled-chargeable')
          AND a.start >= $1 AND a.start <= $2
        GROUP BY DATE_TRUNC('${dateTrunc}', a.start)::date
      ),
      invoice_actions AS (
        SELECT 
          DATE_TRUNC('${dateTrunc}', i.date_sent)::date AS period_date,
          COUNT(*)::bigint AS action_count
        FROM invoices i
        WHERE i.status IN ('paid', 'sent', 'draft')
          AND i.date_sent >= $1 AND i.date_sent <= $2
        GROUP BY DATE_TRUNC('${dateTrunc}', i.date_sent)::date
      ),
      payment_order_actions AS (
        SELECT 
          DATE_TRUNC('${dateTrunc}', po.date_sent)::date AS period_date,
          COUNT(*)::bigint AS action_count
        FROM payment_orders po
        WHERE po.status IN ('paid', 'sent', 'draft')
          AND po.date_sent >= $1 AND po.date_sent <= $2
        GROUP BY DATE_TRUNC('${dateTrunc}', po.date_sent)::date
      ),
      combined_actions AS (
        SELECT period_date, SUM(action_count)::bigint AS action_count
        FROM (
          SELECT period_date, action_count FROM appointment_actions
          UNION ALL
          SELECT period_date, action_count FROM invoice_actions
          UNION ALL
          SELECT period_date, action_count FROM payment_order_actions
        ) combined
        GROUP BY period_date
      )
      SELECT 
        period_date,
        TO_CHAR(period_date, '${periodLabelFormat}') AS period_label,
        COALESCE(action_count, 0)::bigint AS action_count
      FROM combined_actions
      ORDER BY period_date ASC
    `;

    const { rows } = await client.query(query, [start, end]);

    // Calculate total
    const total = rows.reduce((sum, row) => sum + parseInt(row.action_count || 0), 0);

    // Format data
    const formattedData = rows.map((row) => ({
      period: row.period_label || 'N/A',
      period_date: row.period_date,
      action_count: parseInt(row.action_count || 0),
    }));

    res.json({
      data: formattedData,
      total,
      interval,
    });

  } catch (error) {
    logger.error({ err: error }, 'Error fetching activity');
    res.status(500).json({ error: 'Internal server error', details: error.message });
  } finally {
    client.release();
  }
}));

// GET /api/activity/feed
// Returns detailed activity feed with all activity types
// Query params: startDate, endDate, activityType, limit, offset
router.get('/feed', auth, asyncHandler(async (req, res) => {
  const pool = req.locationPool || global.pool;
  const client = await pool.connect();
  
  try {
    const { 
      startDate, 
      endDate, 
      activityType,
      limit = 100,
      offset = 0
    } = req.query;
    
    if (!startDate || !endDate) {
      return res.status(400).json({ error: 'startDate and endDate are required' });
    }

    const start = new Date(startDate);
    const end = new Date(endDate);
    end.setHours(23, 59, 59, 999);

    const limitNum = parseInt(limit) || 100;
    const offsetNum = parseInt(offset) || 0;

    // Build comprehensive activity feed query
    // Only show completed activities (completed lessons, sent invoices, paid payments, sent reports)
    const query = `
      WITH completed_lesson_activities AS (
        SELECT 
          a.appointment_id::text AS id,
          'lesson_completed' AS activity_type,
          COALESCE(a.finish::date, a.start::date) AS activity_date,
          COALESCE(a.finish, a.start) AS timestamp,
          'Marked a Lesson as complete' AS title,
          COALESCE(
            (SELECT ar.recipient_name || ' - ' || s.name
             FROM appointment_recipients ar
             WHERE ar.appointment_id = a.appointment_id
             LIMIT 1),
            s.name,
            'Unknown Service'
          ) AS description,
          a.status AS status,
          a.service_id::bigint AS service_id,
          NULL::text AS client_id,
          NULL::text AS invoice_id,
          NULL::numeric AS amount,
          COALESCE(
            (SELECT ac.contractor_name
             FROM appointment_contractors ac
             WHERE ac.appointment_id = a.appointment_id
             LIMIT 1),
            'Unknown Tutor'
          ) AS actor_name,
          json_build_object(
            'appointment_id', a.appointment_id,
            'service_id', a.service_id,
            'service_name', s.name,
            'status', a.status,
            'units', a.units,
            'topic', a.topic
          ) AS metadata
        FROM appointments a
        LEFT JOIN services s ON s.service_id::text = a.service_id::text
        WHERE a.status IN ('complete', 'cancelled-chargeable')
          AND COALESCE(a.finish, a.start) >= $1 
          AND COALESCE(a.finish, a.start) <= $2
      ),
      report_activities AS (
        SELECT 
          cr.id::text AS id,
          'report_created' AS activity_type,
          COALESCE(cr.date_sent, cr.sent_at::date) AS activity_date,
          COALESCE(cr.sent_at, cr.date_sent::timestamp) AS timestamp,
          'Created a Report' AS title,
          COALESCE(
            cr.student_name || ' - ' || COALESCE(s.name, 'Unknown Service'),
            cr.student_name,
            'Unknown Report'
          ) AS description,
          cr.status AS status,
          a.service_id::bigint AS service_id,
          NULL::text AS client_id,
          NULL::text AS invoice_id,
          NULL::numeric AS amount,
          COALESCE(cr.tutor_name, 'Unknown Tutor') AS actor_name,
          json_build_object(
            'report_id', cr.id,
            'appointment_id', cr.appointment_id,
            'service_name', s.name,
            'status', cr.status
          ) AS metadata
        FROM client_reports cr
        LEFT JOIN appointments a ON cr.appointment_id = a.appointment_id
        LEFT JOIN services s ON a.service_id = s.service_id
        WHERE (cr.date_sent IS NOT NULL OR cr.sent_at IS NOT NULL)
          AND COALESCE(cr.sent_at, cr.date_sent::timestamp) >= $1 
          AND COALESCE(cr.sent_at, cr.date_sent::timestamp) <= $2
      ),
      appointment_activities AS (
        SELECT 
          id,
          activity_type,
          activity_date,
          timestamp,
          title,
          description,
          status,
          service_id,
          client_id,
          invoice_id,
          amount,
          actor_name,
          metadata
        FROM completed_lesson_activities
        UNION ALL
        SELECT 
          id,
          activity_type,
          activity_date,
          timestamp,
          title,
          description,
          status,
          service_id,
          client_id,
          invoice_id,
          amount,
          actor_name,
          metadata
        FROM report_activities
      ),
      invoice_activities AS (
        SELECT 
          i.id::text AS id,
          CASE 
            WHEN i.status = 'paid' THEN 'invoice_paid'
            WHEN i.status = 'sent' THEN 'invoice_raised'
            ELSE 'invoice'
          END AS activity_type,
          COALESCE(i.date_paid::date, i.date_sent::date) AS activity_date,
          COALESCE(i.date_paid, i.date_sent) AS timestamp,
          CASE 
            WHEN i.status = 'paid' THEN 'Marked an Invoice as paid'
            WHEN i.status = 'sent' THEN 'Raised an Invoice'
            ELSE 'Invoice ' || COALESCE(i.display_id, 'INV-' || i.id::text)
          END AS title,
          COALESCE(i.display_id, 'INV-' || i.id::text) || ' / ' || COALESCE(i.client_first_name || ' ' || i.client_last_name, 'Unknown Client') AS description,
          i.status AS status,
          NULL::bigint AS service_id,
          i.client_id::text AS client_id,
          i.id::text AS invoice_id,
          i.gross AS amount,
          COALESCE(i.client_first_name || ' ' || i.client_last_name, 'Unknown') AS actor_name,
          json_build_object(
            'invoice_id', i.id,
            'display_id', i.display_id,
            'status', i.status,
            'gross', i.gross,
            'net', i.net
          ) AS metadata
        FROM invoices i
        WHERE (i.date_paid IS NOT NULL OR i.date_sent IS NOT NULL)
          AND COALESCE(i.date_paid, i.date_sent) >= $1 
          AND COALESCE(i.date_paid, i.date_sent) <= $2
          AND i.status IN ('paid', 'sent')
      ),
      payment_order_activities AS (
        SELECT 
          po.id::text AS id,
          CASE 
            WHEN po.status = 'paid' THEN 'payment_paid'
            WHEN po.status = 'sent' THEN 'payment_created'
            ELSE 'payment_order'
          END AS activity_type,
          COALESCE(po.date_paid::date, po.date_sent::date) AS activity_date,
          COALESCE(po.date_paid, po.date_sent) AS timestamp,
          CASE 
            WHEN po.status = 'paid' THEN 'Marked a Payment Order as paid'
            WHEN po.status = 'sent' THEN 'Created a Payment Order'
            ELSE 'Payment Order ' || COALESCE(po.display_id, 'PO-' || po.id::text)
          END AS title,
          COALESCE(po.display_id, 'PO-' || po.id::text) || ' / ' || COALESCE(
            NULLIF(TRIM(COALESCE(po.payee_first, '') || ' ' || COALESCE(po.payee_last, '')), ''),
            'Unknown Contractor'
          ) AS description,
          po.status AS status,
          NULL::bigint AS service_id,
          NULL::text AS client_id,
          NULL::text AS invoice_id,
          COALESCE(po.amount, 0) AS amount,
          COALESCE(
            NULLIF(TRIM(COALESCE(po.payee_first, '') || ' ' || COALESCE(po.payee_last, '')), ''),
            'Unknown'
          ) AS actor_name,
          json_build_object(
            'payment_order_id', po.id,
            'display_id', po.display_id,
            'status', po.status,
            'amount', po.amount
          ) AS metadata
        FROM payment_orders po
        WHERE (po.date_paid IS NOT NULL OR po.date_sent IS NOT NULL)
          AND COALESCE(po.date_paid, po.date_sent) >= $1 
          AND COALESCE(po.date_paid, po.date_sent) <= $2
          AND po.status IN ('paid', 'sent')
      ),
      all_activities AS (
        SELECT * FROM appointment_activities
        UNION ALL
        SELECT * FROM invoice_activities
        UNION ALL
        SELECT * FROM payment_order_activities
      )
      SELECT 
        id,
        activity_type,
        activity_date,
        timestamp,
        title,
        description,
        status,
        service_id,
        client_id,
        invoice_id,
        amount,
        actor_name,
        metadata
      FROM all_activities
      ${activityType && activityType !== 'all' ? 'WHERE activity_type = $5' : ''}
      ORDER BY timestamp DESC
      LIMIT $3 OFFSET $4
    `;

    const params = activityType && activityType !== 'all'
      ? [start, end, limitNum, offsetNum, activityType]
      : [start, end, limitNum, offsetNum];

    logger.info({ params }, 'Executing activity feed query');
    
    let rows;
    try {
      const result = await client.query(query, params);
      rows = result.rows;
      logger.info({ count: rows.length }, 'Fetched activities');
    } catch (queryError) {
      logger.error({ error: queryError.message, detail: queryError.detail, hint: queryError.hint }, 'SQL Query Error in activity feed');
      throw queryError;
    }

    // Get total count for pagination
    let countQuery, countParams;
    if (activityType === 'appointment' || activityType === 'lesson_completed') {
      countQuery = `SELECT COUNT(*)::bigint AS total FROM appointments WHERE status IN ('complete', 'cancelled-chargeable') AND COALESCE(finish, start) >= $1 AND COALESCE(finish, start) <= $2`;
      countParams = [start, end];
    } else if (activityType === 'report_created') {
      countQuery = `SELECT COUNT(*)::bigint AS total FROM client_reports WHERE (date_sent IS NOT NULL OR sent_at IS NOT NULL) AND COALESCE(sent_at, date_sent::timestamp) >= $1 AND COALESCE(sent_at, date_sent::timestamp) <= $2`;
      countParams = [start, end];
    } else if (activityType === 'invoice' || activityType === 'invoice_raised' || activityType === 'invoice_paid') {
      countQuery = `SELECT COUNT(*)::bigint AS total FROM invoices WHERE status IN ('paid', 'sent') AND COALESCE(date_paid, date_sent) >= $1 AND COALESCE(date_paid, date_sent) <= $2`;
      countParams = [start, end];
    } else if (activityType === 'payment_order' || activityType === 'payment_created' || activityType === 'payment_paid') {
      countQuery = `SELECT COUNT(*)::bigint AS total FROM payment_orders WHERE status IN ('paid', 'sent') AND COALESCE(date_paid, date_sent) >= $1 AND COALESCE(date_paid, date_sent) <= $2`;
      countParams = [start, end];
    } else {
      countQuery = `
        WITH completed_lessons AS (
          SELECT COUNT(*)::bigint AS cnt
          FROM appointments a
          WHERE a.status IN ('complete', 'cancelled-chargeable')
            AND COALESCE(a.finish, a.start) >= $1 
            AND COALESCE(a.finish, a.start) <= $2
        ),
        reports AS (
          SELECT COUNT(*)::bigint AS cnt
          FROM client_reports cr
          WHERE (cr.date_sent IS NOT NULL OR cr.sent_at IS NOT NULL)
            AND COALESCE(cr.sent_at, cr.date_sent::timestamp) >= $1
            AND COALESCE(cr.sent_at, cr.date_sent::timestamp) <= $2
        ),
        invoices AS (
          SELECT COUNT(*)::bigint AS cnt
          FROM invoices i
          WHERE i.status IN ('paid', 'sent')
            AND COALESCE(i.date_paid, i.date_sent) >= $1 
            AND COALESCE(i.date_paid, i.date_sent) <= $2
        ),
        payment_orders AS (
          SELECT COUNT(*)::bigint AS cnt
          FROM payment_orders po
          WHERE po.status IN ('paid', 'sent')
            AND COALESCE(po.date_paid, po.date_sent) >= $1 
            AND COALESCE(po.date_paid, po.date_sent) <= $2
        )
        SELECT 
          (SELECT cnt FROM completed_lessons) +
          (SELECT cnt FROM reports) +
          (SELECT cnt FROM invoices) +
          (SELECT cnt FROM payment_orders) AS total
      `;
      countParams = [start, end];
    }

    const { rows: countRows } = await client.query(countQuery, countParams);

    const total = parseInt(countRows[0]?.total || 0);

    res.json({
      activities: rows,
      total,
      limit: limitNum,
      offset: offsetNum,
      hasMore: offsetNum + rows.length < total
    });

  } catch (error) {
    logger.error({ err: error, queryParams: { startDate: req.query.startDate, endDate: req.query.endDate, activityType: req.query.activityType, limit: req.query.limit, offset: req.query.offset } }, 'Error fetching activity feed');
    res.status(500).json({ 
      error: 'Internal server error', 
      details: error.message,
      stack: process.env.NODE_ENV === 'development' ? error.stack : undefined
    });
  } finally {
    client.release();
  }
}));

module.exports = router;

