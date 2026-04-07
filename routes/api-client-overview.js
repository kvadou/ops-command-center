const express = require('express');
const { columnsExist } = require('../utils/schema-cache');
const { asyncHandler } = require('../middleware/error-handler');
const { pool } = global;
const { logger } = require('../utils/logger');

const router = express.Router();

// POST /api/client-overview - Get comprehensive client overview with revenue, lessons, and metrics
router.post('/', asyncHandler(async (req, res) => {
  try {
    logger.info('Fetching client overview...');

    // First check which columns exist in the clients table (cached)
    const availableColumns = await columnsExist(pool, 'clients', ['status', 'pipeline_stage_id', 'labels']);
    const hasStatusColumn = availableColumns.includes('status');
    const hasPipelineColumn = availableColumns.includes('pipeline_stage_id');
    const hasLabelsColumn = availableColumns.includes('labels');

    logger.info({ availableColumns }, '📋 Available client columns');

    // Add pagination, search, and label filtering parameters
    const {
      page = 1,
      limit = 100,
      search = '',
      labels = [],
      status = '',
      dateRange = {},
      lifetimeValueMin = 0,
      lifetimeValueMax = null
    } = req.body;
    const offset = (page - 1) * limit;

    // Build WHERE conditions dynamically
    let whereConditions = [];
    let queryParams = [];
    let paramCount = 0;

    if (search) {
      paramCount++;
      whereConditions.push(`(c.first_name || ' ' || c.last_name ILIKE $${paramCount} OR c.email ILIKE $${paramCount} OR c.client_id::text ILIKE $${paramCount})`);
      queryParams.push(`%${search}%`);
    }

    // Status filtering (only if status column exists)
    if (status && hasStatusColumn) {
      paramCount++;
      whereConditions.push(`c.status = $${paramCount}`);
      queryParams.push(status);
    }

    // Date range filtering
    if (dateRange && dateRange.start) {
      paramCount++;
      whereConditions.push(`c.created_at >= $${paramCount}`);
      queryParams.push(dateRange.start);
    }
    if (dateRange && dateRange.end) {
      paramCount++;
      whereConditions.push(`c.created_at <= $${paramCount}`);
      queryParams.push(dateRange.end);
    }

    // Label filtering - check if client has any of the specified labels by name (only if labels column exists)
    if (labels && labels.length > 0 && hasLabelsColumn) {
      paramCount++;
      // Ensure labels is an array of strings (extract name if objects)
      const labelNames = labels.map(label => {
        if (typeof label === 'string') return label;
        if (typeof label === 'object' && label.name) return label.name;
        return String(label);
      }).filter(Boolean);

      if (labelNames.length > 0) {
        // Check if any label object in the array has a matching name
        whereConditions.push(`
          EXISTS (
            SELECT 1
            FROM jsonb_array_elements(c.labels) AS label_elem
            WHERE jsonb_extract_path_text(label_elem, 'name') = ANY($${paramCount}::text[])
          )
        `);
        queryParams.push(labelNames);
      }
    }

    const whereClause = whereConditions.length > 0 ? 'WHERE ' + whereConditions.join(' AND ') : '';

    // Build client_data CTE with conditional column selection
    const statusSelect = hasStatusColumn ? 'c.status' : "NULL as status";
    const pipelineStageIdSelect = hasPipelineColumn ? 'c.pipeline_stage_id' : 'NULL::integer AS pipeline_stage_id';
    const labelsSelect = hasLabelsColumn
      ? `COALESCE(
            ARRAY(
              SELECT jsonb_extract_path_text(elem, 'name')
              FROM jsonb_array_elements(COALESCE(c.labels, '[]'::jsonb)) AS elem
              WHERE jsonb_extract_path_text(elem, 'name') IS NOT NULL
                AND jsonb_extract_path_text(elem, 'name') != ''
            ),
            ARRAY[]::text[]
          ) AS labels`
      : "ARRAY[]::text[] AS labels";

    const clientOverviewQuery = `
      WITH client_data AS (
        SELECT
          c.client_id,
          c.first_name || ' ' || c.last_name AS client_name,
          c.email,
          ${statusSelect},
          ${pipelineStageIdSelect},
          NULL::text AS pipeline_stage_name,
          ${labelsSelect}
        FROM clients c
        ${whereClause}
        ORDER BY c.client_id DESC
      ),
      gravity_data AS (
        SELECT
          gb.email,
          STRING_AGG(DISTINCT gb.utm_source, ', ') AS source
        FROM gravity_bookings gb
        WHERE gb.payment_successful IN ('true', 'true - send')
        GROUP BY gb.email
      ),
      -- Corrected revenue calculation based on charge type
      -- Only count revenue from recipients where THIS client is the paying client
      -- This ensures we only count revenue from THIS client's students, not other clients' students on the same appointment
      recipient_revenue AS (
        SELECT
          CAST(ar.paying_client_id AS VARCHAR) AS paying_client_id,
          ar.appointment_id,
          ar.recipient_id,
          a.units,
          CASE
            -- For hourly services, use recipient-specific charge_rate * units
            -- This ensures we only count revenue from THIS recipient, not other recipients on the same appointment
            WHEN s.dft_charge_type = 'hourly'
              THEN COALESCE(ar.charge_rate * a.units, 0)
            -- For one-off services, use recipient-specific charge_rate
            WHEN s.dft_charge_type = 'one-off'
              THEN COALESCE(ar.charge_rate, 0)
            -- For split services, use recipient-specific charge_rate (already per-recipient)
            WHEN s.dft_charge_type = 'one-off-split'
              THEN COALESCE(ar.charge_rate, 0)
            WHEN s.dft_charge_type = 'hourly-split'
              THEN COALESCE(ar.charge_rate, 0)  -- For split services, charge_rate is already per recipient
            ELSE
              COALESCE(ar.charge_rate * a.units, ar.charge_rate, 0)
          END AS revenue_per_recipient
        FROM appointment_recipients ar
        JOIN appointments a ON a.appointment_id = ar.appointment_id
        JOIN services s ON a.service_id = s.service_id
        WHERE a.status IN ('complete', 'cancelled - chargeable')
          AND ar.status <> 'missed'
          AND ar.paying_client_id IS NOT NULL
      ),
      appointment_hours_per_client AS (
        SELECT
          CAST(ar.paying_client_id AS VARCHAR) AS paying_client_id,
          a.appointment_id,
          a.units
        FROM appointment_recipients ar
        JOIN appointments a ON a.appointment_id = ar.appointment_id
        WHERE a.status IN ('complete', 'cancelled - chargeable')
          AND ar.status <> 'missed'
          AND ar.paying_client_id IS NOT NULL
        GROUP BY CAST(ar.paying_client_id AS VARCHAR), a.appointment_id, a.units
      ),
      client_hours AS (
        SELECT
          paying_client_id,
          SUM(units) AS total_hours
        FROM appointment_hours_per_client
        GROUP BY paying_client_id
      ),
      lesson_revenue_data AS (
        SELECT
          rr.paying_client_id,
          SUM(rr.revenue_per_recipient) AS lesson_revenue,
          COUNT(DISTINCT rr.appointment_id) AS total_lessons,
          COALESCE(ch.total_hours, 0) AS total_hours,
          COUNT(DISTINCT rr.recipient_id) AS number_of_students
        FROM recipient_revenue rr
        LEFT JOIN client_hours ch ON rr.paying_client_id = ch.paying_client_id
        GROUP BY rr.paying_client_id, ch.total_hours
      ),
      -- Invoice revenue (gross amount from paid invoices)
      invoice_revenue_data AS (
        SELECT
          CAST(client_id AS VARCHAR) AS client_id,
          SUM(CASE WHEN status = 'paid' THEN gross ELSE 0 END) AS invoice_revenue,
          COUNT(*) AS total_invoices
        FROM invoices
        GROUP BY client_id
      )
      SELECT
        cd.client_id,
        cd.client_name,
        cd.email,
        cd.status,
        cd.pipeline_stage_id,
        cd.pipeline_stage_name,
        COALESCE(gd.source, '') AS source,
        -- Total LTV = sum of paid invoices only (matching TutorCruncher "Total Paid")
        COALESCE(ird.invoice_revenue, 0) AS total_revenue,
        COALESCE(lrd.total_lessons, 0) AS total_lessons,
        COALESCE(lrd.total_hours, 0) AS total_hours,
        COALESCE(lrd.number_of_students, 0) AS number_of_students,
        cd.labels,
        COALESCE(lrd.lesson_revenue, 0) AS lesson_revenue,
        COALESCE(ird.invoice_revenue, 0) AS invoice_revenue,
        COALESCE(ird.total_invoices, 0) AS total_invoices
      FROM client_data cd
      LEFT JOIN gravity_data gd ON cd.email = gd.email
      LEFT JOIN lesson_revenue_data lrd ON cd.client_id = lrd.paying_client_id
      LEFT JOIN invoice_revenue_data ird ON cd.client_id = ird.client_id
      ORDER BY total_revenue DESC NULLS LAST, cd.client_id DESC
      LIMIT $${paramCount + 1} OFFSET $${paramCount + 2};
    `;

    queryParams.push(limit, offset);

    // Use location-specific database connection
    const locationPool = req.locationPool || pool;

    // Apply lifetime value filtering after query (since it's computed in CTE)
    // Filter results in JavaScript if lifetime value filters are specified
    let clientOverviewResult = await locationPool.query(clientOverviewQuery, queryParams);

    // Apply lifetime value filtering if specified
    if (lifetimeValueMin > 0 || lifetimeValueMax) {
      clientOverviewResult.rows = clientOverviewResult.rows.filter(client => {
        const ltv = parseFloat(client.total_revenue || 0);
        if (lifetimeValueMin > 0 && ltv < lifetimeValueMin) return false;
        if (lifetimeValueMax && ltv > lifetimeValueMax) return false;
        return true;
      });
    }

    const { rows: clientOverviewResultRows } = clientOverviewResult;

    // Get total count for pagination
    const countQuery = `
      SELECT COUNT(*) as total
      FROM clients c
      ${whereClause}
    `;
    const countParams = queryParams.slice(0, -2); // Remove limit and offset
    const countResult = await locationPool.query(countQuery, countParams);
    const total = parseInt(countResult.rows[0].total);

    // Process labels - ensure they're arrays of strings (not objects or JSON strings)
    const processedClients = clientOverviewResultRows.map(client => {
      let labels = client.labels || [];

      // If labels is a string, try to parse it
      if (typeof labels === 'string') {
        try {
          labels = JSON.parse(labels);
        } catch (e) {
          labels = [];
        }
      }

      // If labels is an array of objects, extract the name field
      if (Array.isArray(labels) && labels.length > 0 && typeof labels[0] === 'object') {
        labels = labels.map(label => {
          if (label && typeof label === 'object' && label.name) {
            return label.name;
          }
          return typeof label === 'string' ? label : String(label);
        });
      }

      return {
        ...client,
        labels: Array.isArray(labels) ? labels : []
      };
    });

    res.json({
      clientOverview: processedClients,
      pagination: {
        page: parseInt(page),
        limit: parseInt(limit),
        total,
        pages: Math.ceil(total / limit)
      }
    });
  } catch (error) {
    logger.error({ err: error, requestBody: req.body }, '❌ Error fetching client overview data');
    res.status(500).json({
      error: 'Error fetching client overview data',
      message: error.message,
      details: process.env.NODE_ENV === 'development' ? error.stack : undefined
    });
  }
}));

module.exports = router;
