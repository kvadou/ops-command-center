const express = require('express');
const router = express.Router();
const cache = require('../utils/cache');

// Use location-specific pool from middleware instead of creating a separate pool
// This prevents connection pool exhaustion by reusing the same pool as other routes
const { getLocationPool: getPool } = require('../utils/pool');
const { asyncHandler } = require('../middleware/error-handler');
const { logger } = require('../utils/logger');

// Helper function to handle database connection errors with retry
async function executeQueryWithRetry(queryFn, maxRetries = 3, retryDelay = 1000) {
  let lastError;
  for (let attempt = 1; attempt <= maxRetries; attempt++) {
    try {
      return await queryFn();
    } catch (error) {
      lastError = error;
      // Check if it's a connection pool exhaustion error
      if (error.code === '53300' || error.message?.includes('too many connections')) {
        if (attempt < maxRetries) {
          const delay = retryDelay * attempt; // Exponential backoff
          logger.warn('⚠️ Connection pool exhausted, retrying in ${delay}ms (attempt ${attempt}/${maxRetries})');
          await new Promise(resolve => setTimeout(resolve, delay));
          continue;
        }
      }
      // If it's not a connection error or we've exhausted retries, throw immediately
      throw error;
    }
  }
  throw lastError;
}

// Log all requests to this router for debugging
router.use((req, res, next) => {
  logger.info('🔍 [api-crm router] ${req.method} ${req.path} ${req.url}');
  logger.info('🔍 [api-crm router] Full URL: ${req.protocol}://${req.get(\'host\')}${req.originalUrl}');
  logger.info('🔍 [api-crm router] Router middleware executing - request reached router!');
  next();
});

// Test endpoint to verify routing - MUST be before any other routes
router.get('/analytics/test', asyncHandler(async (req, res) => {
  logger.info('✅ Test endpoint hit!');
  logger.info({ data: req.path }, '✅ Test endpoint - req.path:');
  logger.info({ data: req.url }, '✅ Test endpoint - req.url:');
  logger.info({ data: req.originalUrl }, '✅ Test endpoint - req.originalUrl:');
  try {
    res.json({ success: true, message: 'Analytics endpoint is reachable', timestamp: new Date().toISOString() });
    logger.info('✅ Test endpoint - Response sent');
  } catch (err) {
    logger.error({ err: err }, '❌ Test endpoint - Error sending response:');
    res.status(500).json({ error: 'Failed to send response' });
  }
}));

// ============================================================================
// CLIENT MANAGEMENT - Core CRM Functionality
// ============================================================================

// Get all clients with comprehensive CRM data
router.post('/clients', asyncHandler(async (req, res) => {
  try {
    const pool = getPool(req);
    const { 
      page = 1, 
      limit = 50, 
      search = '', 
      labels = [], 
      status = '', 
      sortBy = 'total_revenue',
      sortOrder = 'desc',
      dateRange = {},
      lifetimeValueMin = 0,
      lifetimeValueMax = null
    } = req.body;

    // Validate sort fields to prevent SQL injection
    const allowedSortFields = ['client_id', 'first_name', 'last_name', 'email', 'mobile', 'phone', 'status', 'created_at', 'updated_at', 'total_revenue', 'total_lessons', 'total_hours', 'number_of_students', 'last_lesson_date', 'first_lesson_date', 'total_paid_invoices', 'total_invoices', 'last_invoice_date', 'last_activity_date', 'activity_status'];
    if (!allowedSortFields.includes(sortBy)) {
      sortBy = 'total_revenue';
    }
    const allowedDirections = ['ASC', 'DESC'];
    if (!allowedDirections.includes(sortOrder.toUpperCase())) {
      sortOrder = 'DESC';
    }

    const offset = (page - 1) * limit;

    // Build dynamic WHERE clause
    let whereConditions = ['1=1'];
    let queryParams = [];
    let paramCount = 0;

    // Search functionality
    if (search) {
      paramCount++;
      whereConditions.push(`(
        c.first_name ILIKE $${paramCount} OR 
        c.last_name ILIKE $${paramCount} OR 
        c.email ILIKE $${paramCount} OR
        c.client_id::text ILIKE $${paramCount}
      )`);
      queryParams.push(`%${search}%`);
    }

    // Label filtering
    if (labels.length > 0) {
      paramCount++;
      whereConditions.push(`c.labels ?| $${paramCount}`);
      queryParams.push(labels);
    }

    // Status filtering
    if (status) {
      paramCount++;
      whereConditions.push(`c.status = $${paramCount}`);
      queryParams.push(status);
    }

    // Date range filtering
    if (dateRange.start) {
      paramCount++;
      whereConditions.push(`c.created_at >= $${paramCount}`);
      queryParams.push(dateRange.start);
    }
    if (dateRange.end) {
      paramCount++;
      whereConditions.push(`c.created_at <= $${paramCount}`);
      queryParams.push(dateRange.end);
    }

    // Lifetime value filtering (using paid invoices only)
    // Note: This filtering happens in the main query WHERE clause after JOINs
    if (lifetimeValueMin > 0) {
      // Will be added after the CTEs are defined
      paramCount++;
      whereConditions.push(`COALESCE(invoice_data.total_paid, 0) >= $${paramCount}`);
      queryParams.push(lifetimeValueMin);
    }
    if (lifetimeValueMax) {
      paramCount++;
      whereConditions.push(`COALESCE(invoice_data.total_paid, 0) <= $${paramCount}`);
      queryParams.push(lifetimeValueMax);
    }

    const query = `
      WITH lifetime_data AS (
        SELECT 
          CAST(ar.paying_client_id AS VARCHAR) AS client_id,
          SUM(ar.charge_rate) AS total_revenue,
          COUNT(*) AS total_lessons,
          SUM(a.units) AS total_hours,
          COUNT(DISTINCT ar.recipient_id) AS number_of_students,
          MAX(a.start) AS last_lesson_date,
          MIN(a.start) AS first_lesson_date
        FROM appointment_recipients ar
        JOIN appointments a ON a.appointment_id = ar.appointment_id
        WHERE a.status IN ('complete', 'cancelled - chargeable')
        GROUP BY ar.paying_client_id
      ),
      invoice_data AS (
        SELECT 
          client_id,
          SUM(CASE WHEN status = 'paid' THEN gross ELSE 0 END) AS total_paid,
          COUNT(*) AS total_invoices,
          MAX(date_sent) AS last_invoice_date
        FROM invoices
        GROUP BY client_id
      ),
      recent_activity AS (
        SELECT 
          CAST(ar.paying_client_id AS VARCHAR) AS client_id,
          MAX(a.start) AS last_activity_date
        FROM appointment_recipients ar
        JOIN appointments a ON a.appointment_id = ar.appointment_id
        WHERE a.start >= NOW() - INTERVAL '30 days'
        GROUP BY ar.paying_client_id
      )
      SELECT 
        c.*,
        -- Lifetime value = sum of paid invoices only (matching TutorCruncher "Total Paid")
        COALESCE(invoice_data.total_paid, 0) AS total_revenue,
        COALESCE(lifetime_data.total_lessons, 0) AS total_lessons,
        COALESCE(lifetime_data.total_hours, 0) AS total_hours,
        COALESCE(lifetime_data.number_of_students, 0) AS number_of_students,
        lifetime_data.last_lesson_date,
        lifetime_data.first_lesson_date,
        COALESCE(invoice_data.total_paid, 0) AS total_paid_invoices,
        COALESCE(invoice_data.total_invoices, 0) AS total_invoices,
        invoice_data.last_invoice_date,
        recent_activity.last_activity_date,
        CASE 
          WHEN recent_activity.last_activity_date IS NOT NULL THEN 'Active'
          WHEN lifetime_data.last_lesson_date > NOW() - INTERVAL '90 days' THEN 'Recent'
          ELSE 'Inactive'
        END AS activity_status
      FROM clients c
      LEFT JOIN lifetime_data ON c.client_id = lifetime_data.client_id
      LEFT JOIN invoice_data ON c.client_id = invoice_data.client_id
      LEFT JOIN recent_activity ON c.client_id = recent_activity.client_id
      WHERE ${whereConditions.join(' AND ')}
      ORDER BY ${sortBy} ${sortOrder.toUpperCase()}
      LIMIT $${paramCount + 1} OFFSET $${paramCount + 2}
    `;

    queryParams.push(limit, offset);
    
    const { rows: clients } = await pool.query(query, queryParams);

    // Get total count for pagination
    const countQuery = `
      SELECT COUNT(*) as total
      FROM clients c
      LEFT JOIN (
        SELECT 
          client_id,
          SUM(CASE WHEN status = 'paid' THEN gross ELSE 0 END) AS total_paid
        FROM invoices
        GROUP BY client_id
      ) invoice_data ON c.client_id = invoice_data.client_id
      WHERE ${whereConditions.join(' AND ')}
    `;

    const { rows: countResult } = await pool.query(countQuery, queryParams.slice(0, -2));
    const total = parseInt(countResult[0].total);

    res.json({
      clients,
      pagination: {
        page: parseInt(page),
        limit: parseInt(limit),
        total,
        pages: Math.ceil(total / limit)
      }
    });

  } catch (error) {
    logger.error({ err: error }, 'Error fetching clients:');
    res.status(500).json({ error: 'Failed to fetch clients' });
  }
}));

// Get detailed client profile
router.get('/clients/:id', asyncHandler(async (req, res) => {
  try {
    const pool = getPool(req);
    const { id } = req.params;

    const cacheKey = `crm:client:${id}`;
    const cachedData = await cache.getOrSet(cacheKey, async () => {
      // First, get client basic info (needed for email in communications query)
      const clientQuery = `SELECT * FROM clients WHERE client_id = $1`;
      const { rows: clientRows } = await pool.query(clientQuery, [id]);

      if (clientRows.length === 0) {
        throw new Error('Client not found');
      }

      const client = clientRows[0];

      // Now parallelize all remaining independent queries
      const lifetimeQuery = `
        WITH lifetime_data AS (
          SELECT
            SUM(ar.charge_rate) AS total_revenue,
            COUNT(*) AS total_lessons,
            SUM(a.units) AS total_hours,
            COUNT(DISTINCT ar.recipient_id) AS number_of_students,
            MAX(a.start) AS last_lesson_date,
            MIN(a.start) AS first_lesson_date,
            AVG(ar.charge_rate) AS avg_lesson_value
          FROM appointment_recipients ar
          JOIN appointments a ON a.appointment_id = ar.appointment_id
          WHERE ar.paying_client_id = $1 AND a.status IN ('complete', 'cancelled - chargeable')
        ),
        invoice_data AS (
          SELECT
            SUM(CASE WHEN status = 'paid' THEN gross ELSE 0 END) AS total_paid,
            COUNT(*) AS total_invoices,
            MAX(date_sent) AS last_invoice_date,
            AVG(gross) AS avg_invoice_value
          FROM invoices
          WHERE client_id = $1
        )
        SELECT
          lifetime_data.*,
          invoice_data.*,
          COALESCE(invoice_data.total_paid, 0) AS lifetime_value,
          COALESCE(invoice_data.total_paid, 0) AS total_paid_invoices
        FROM lifetime_data, invoice_data
      `;

      const activitiesQuery = `
        SELECT
          a.appointment_id,
          a.start,
          a.finish,
          a.units,
          a.status,
          s.name as service_name,
          s.service_id,
          ar.charge_rate,
          ar.recipient_id,
          ar.recipient_name,
          ar.status as recipient_status,
          COALESCE(
            (SELECT STRING_AGG(ac.contractor_name, ', ')
             FROM appointment_contractors ac
             WHERE ac.appointment_id = a.appointment_id),
            'No tutor assigned'
          ) as tutor_names
        FROM appointment_recipients ar
        JOIN appointments a ON a.appointment_id = ar.appointment_id
        JOIN services s ON s.service_id = a.service_id
        WHERE ar.paying_client_id = $1
        ORDER BY a.start DESC
        LIMIT 100
      `;

      const invoicesQuery = `
        SELECT
          id,
          display_id,
          date_sent,
          gross,
          net,
          status,
          url,
          client_first_name,
          client_last_name,
          client_email
        FROM invoices
        WHERE client_id = $1
        ORDER BY date_sent DESC
      `;

      const studentsQuery = `
        SELECT DISTINCT
          ar.recipient_id,
          ar.recipient_name,
          COUNT(*) as lesson_count,
          COUNT(CASE WHEN a.status IN ('complete', 'cancelled - chargeable') THEN 1 END) as completed_lessons,
          MAX(a.start) as last_lesson,
          MIN(a.start) as first_lesson,
          SUM(a.units) as total_hours,
          SUM(ar.charge_rate) as total_value,
          ARRAY_AGG(DISTINCT s.name) FILTER (WHERE s.name IS NOT NULL) as service_types
        FROM appointment_recipients ar
        JOIN appointments a ON a.appointment_id = ar.appointment_id
        LEFT JOIN services s ON s.service_id = a.service_id
        WHERE ar.paying_client_id = $1
        GROUP BY ar.recipient_id, ar.recipient_name
        ORDER BY lesson_count DESC
      `;

      const communicationsQuery = `
        SELECT
          cr.id,
          cr.appointment_id,
          cr.client_email,
          cr.student_name,
          cr.status,
          cr.date_sent,
          cr.sent_at,
          cr.email_subject,
          cr.email_opened_at,
          cr.email_opened_count,
          cr.email_clicked_at,
          cr.email_clicked_count,
          cr.email_delivered_at,
          cr.email_bounced_at,
          cr.engagement_score,
          cr.brevo_message_id,
          cr.brevo_events,
          a.start as appointment_start,
          s.name as service_name
        FROM client_reports cr
        LEFT JOIN appointments a ON cr.appointment_id = a.appointment_id
        LEFT JOIN services s ON a.service_id = s.service_id
        WHERE cr.client_email = $1 OR cr.client_email = $2
        ORDER BY COALESCE(cr.sent_at, cr.date_sent) DESC NULLS LAST
        LIMIT 100
      `;

      // Execute all queries in parallel
      const [
        { rows: lifetimeRows },
        { rows: activities },
        { rows: invoices },
        { rows: students },
        { rows: communications }
      ] = await Promise.all([
        pool.query(lifetimeQuery, [id]),
        pool.query(activitiesQuery, [id]),
        pool.query(invoicesQuery, [id]),
        pool.query(studentsQuery, [id]),
        pool.query(communicationsQuery, [client.email, client.email?.toLowerCase()])
      ]);

      const lifetimeData = lifetimeRows[0] || {};

      // Parse JSON fields safely
      const parseJSONField = (field) => {
        if (!field) return [];
        if (typeof field === 'string') {
          try {
            return JSON.parse(field);
          } catch {
            return [];
          }
        }
        return Array.isArray(field) ? field : [];
      };

      // Construct client name
      const clientName = client.client_name ||
        `${client.first_name || ''} ${client.last_name || ''}`.trim() ||
        client.email ||
        'Unknown Client';

      return {
        client: {
          ...client,
          client_name: clientName,
          labels: parseJSONField(client.labels),
          paid_recipients: parseJSONField(client.paid_recipients),
          received_notifications: parseJSONField(client.received_notifications),
          extra_attrs: parseJSONField(client.extra_attrs)
        },
        lifetimeData,
        activities: activities || [],
        invoices: invoices || [],
        students: students || [],
        communications: communications || []
      };
    }, 60); // 60 second TTL

    res.json(cachedData);

  } catch (error) {
    logger.error({ err: error }, 'Error fetching client details:');
    if (error.message === 'Client not found') {
      return res.status(404).json({ error: 'Client not found' });
    }
    res.status(500).json({ error: 'Failed to fetch client details', details: error.message });
  }
}));

// ============================================================================
// SEARCH AND FILTERING
// ============================================================================

// Advanced search with multiple criteria
router.post('/clients/search', asyncHandler(async (req, res) => {
  try {
    const pool = getPool(req);
    const { 
      query: searchQuery = '',
      filters = {},
      sort = { field: 'total_revenue', direction: 'desc' },
      pagination = { page: 1, limit: 50 }
    } = req.body;

    const offset = (pagination.page - 1) * pagination.limit;

    // Validate sort fields to prevent SQL injection
    const allowedSortFields = ['client_id', 'first_name', 'last_name', 'email', 'mobile', 'phone', 'status', 'created_at', 'updated_at', 'total_revenue', 'total_lessons', 'total_hours', 'number_of_students', 'last_lesson_date', 'first_lesson_date', 'total_paid_invoices', 'total_invoices', 'last_invoice_date', 'last_activity_date', 'activity_status'];
    if (!allowedSortFields.includes(sort.field)) {
      sort.field = 'total_revenue';
    }
    const allowedDirections = ['ASC', 'DESC'];
    if (!allowedDirections.includes(sort.direction.toUpperCase())) {
      sort.direction = 'DESC';
    }

    let whereConditions = ['1=1'];
    let queryParams = [];
    let paramCount = 0;

    // Text search across multiple fields
    if (searchQuery) {
      paramCount++;
      whereConditions.push(`(
        c.first_name ILIKE $${paramCount} OR 
        c.last_name ILIKE $${paramCount} OR 
        c.email ILIKE $${paramCount} OR
        c.client_id::text ILIKE $${paramCount} OR
        c.mobile ILIKE $${paramCount} OR
        c.phone ILIKE $${paramCount}
      )`);
      queryParams.push(`%${searchQuery}%`);
    }

    // Apply filters
    if (filters.labels && filters.labels.length > 0) {
      paramCount++;
      whereConditions.push(`c.labels ?| $${paramCount}`);
      queryParams.push(filters.labels);
    }

    if (filters.status) {
      paramCount++;
      whereConditions.push(`c.status = $${paramCount}`);
      queryParams.push(filters.status);
    }

    if (filters.dateRange) {
      if (filters.dateRange.start) {
        paramCount++;
        whereConditions.push(`c.created_at >= $${paramCount}`);
        queryParams.push(filters.dateRange.start);
      }
      if (filters.dateRange.end) {
        paramCount++;
        whereConditions.push(`c.created_at <= $${paramCount}`);
        queryParams.push(filters.dateRange.end);
      }
    }

    if (filters.lifetimeValue) {
      if (filters.lifetimeValue.min) {
        paramCount++;
        whereConditions.push(`COALESCE(lifetime_data.total_revenue, 0) >= $${paramCount}`);
        queryParams.push(filters.lifetimeValue.min);
      }
      if (filters.lifetimeValue.max) {
        paramCount++;
        whereConditions.push(`COALESCE(lifetime_data.total_revenue, 0) <= $${paramCount}`);
        queryParams.push(filters.lifetimeValue.max);
      }
    }

    const query = `
      WITH lifetime_data AS (
        SELECT 
          CAST(ar.paying_client_id AS VARCHAR) AS client_id,
          SUM(ar.charge_rate) AS total_revenue,
          COUNT(*) AS total_lessons,
          SUM(a.units) AS total_hours
        FROM appointment_recipients ar
        JOIN appointments a ON a.appointment_id = ar.appointment_id
        WHERE a.status IN ('complete', 'cancelled - chargeable')
        GROUP BY ar.paying_client_id
      )
      SELECT 
        c.*,
        COALESCE(lifetime_data.total_revenue, 0) AS total_revenue,
        COALESCE(lifetime_data.total_lessons, 0) AS total_lessons,
        COALESCE(lifetime_data.total_hours, 0) AS total_hours
      FROM clients c
      LEFT JOIN lifetime_data ON c.client_id = lifetime_data.client_id
      WHERE ${whereConditions.join(' AND ')}
      ORDER BY ${sort.field} ${sort.direction.toUpperCase()}
      LIMIT $${paramCount + 1} OFFSET $${paramCount + 2}
    `;

    queryParams.push(pagination.limit, offset);
    
    const { rows: clients } = await pool.query(query, queryParams);

    res.json({
      clients,
      pagination: {
        page: pagination.page,
        limit: pagination.limit,
        total: clients.length
      }
    });

  } catch (error) {
    logger.error({ err: error }, 'Error in client search:');
    res.status(500).json({ error: 'Search failed' });
  }
}));

// ============================================================================
// ANALYTICS AND INSIGHTS
// ============================================================================

// Get CRM dashboard analytics
router.get('/analytics/dashboard', asyncHandler(async (req, res) => {
  try {
    const pool = getPool(req);

    const cacheKey = 'crm:analytics:dashboard';
    const cachedData = await cache.getOrSet(cacheKey, async () => {
      // Define all 6 independent queries
      const totalClientsQuery = `SELECT COUNT(*) as total FROM clients`;

      const activeClientsQuery = `
        SELECT COUNT(DISTINCT ar.paying_client_id) as active
        FROM appointment_recipients ar
        JOIN appointments a ON a.appointment_id = ar.appointment_id
        WHERE a.start >= NOW() - INTERVAL '30 days'
      `;

      const lifetimeValueQuery = `
        SELECT
          SUM(ar.charge_rate) as total_revenue,
          AVG(ar.charge_rate) as avg_lesson_value,
          COUNT(*) as total_lessons
        FROM appointment_recipients ar
        JOIN appointments a ON a.appointment_id = ar.appointment_id
        WHERE a.status IN ('complete', 'cancelled - chargeable')
      `;

      const topClientsQuery = `
        SELECT
          c.client_id,
          c.first_name,
          c.last_name,
          c.email,
          SUM(ar.charge_rate) as total_revenue,
          COUNT(*) as total_lessons
        FROM clients c
        JOIN appointment_recipients ar ON ar.paying_client_id = c.client_id
        JOIN appointments a ON a.appointment_id = ar.appointment_id
        WHERE a.status IN ('complete', 'cancelled - chargeable')
        GROUP BY c.client_id, c.first_name, c.last_name, c.email
        ORDER BY total_revenue DESC
        LIMIT 10
      `;

      const revenueTrendsQuery = `
        SELECT
          DATE_TRUNC('month', a.start) as month,
          SUM(ar.charge_rate) as revenue,
          COUNT(*) as lessons
        FROM appointment_recipients ar
        JOIN appointments a ON a.appointment_id = ar.appointment_id
        WHERE a.status IN ('complete', 'cancelled - chargeable')
          AND a.start >= NOW() - INTERVAL '12 months'
        GROUP BY DATE_TRUNC('month', a.start)
        ORDER BY month
      `;

      const acquisitionQuery = `
        SELECT
          DATE_TRUNC('month', created_at) as month,
          COUNT(*) as new_clients
        FROM clients
        WHERE created_at >= NOW() - INTERVAL '12 months'
        GROUP BY DATE_TRUNC('month', created_at)
        ORDER BY month
      `;

      // Execute all 6 queries in parallel
      const [
        { rows: totalClients },
        { rows: activeClients },
        { rows: lifetimeValue },
        { rows: topClients },
        { rows: revenueTrends },
        { rows: acquisition }
      ] = await Promise.all([
        pool.query(totalClientsQuery),
        pool.query(activeClientsQuery),
        pool.query(lifetimeValueQuery),
        pool.query(topClientsQuery),
        pool.query(revenueTrendsQuery),
        pool.query(acquisitionQuery)
      ]);

      return {
        overview: {
          totalClients: parseInt(totalClients[0].total),
          activeClients: parseInt(activeClients[0].active),
          totalRevenue: parseFloat(lifetimeValue[0].total_revenue || 0),
          avgLessonValue: parseFloat(lifetimeValue[0].avg_lesson_value || 0),
          totalLessons: parseInt(lifetimeValue[0].total_lessons || 0)
        },
        topClients,
        revenueTrends,
        acquisition
      };
    }, 30); // 30 second TTL

    res.json(cachedData);

  } catch (error) {
    logger.error({ err: error }, 'Error fetching dashboard analytics:');
    res.status(500).json({ error: 'Failed to fetch analytics' });
  }
}));

// Get comprehensive client analytics metrics
router.post('/analytics/client-metrics', asyncHandler(async (req, res) => {
  logger.info('📊 Analytics endpoint called');
  logger.info({ data: req.path }, '📊 Request path:');
  logger.info({ data: req.url }, '📊 Request url:');
  logger.info({ data: req.body }, '📊 Request body:');
  logger.info({ data: new Date().toISOString() }, '📊 Timestamp:');
  
  // Send immediate response to test if endpoint is reachable
  // res.json({ test: 'endpoint reached' }); return; // Uncomment to test
  
  try {
    const { 
      labels = [], 
      dateRange = {},
      minLessons = 1 // Only include clients with at least 1 completed lesson
    } = req.body;

    logger.info({ data: { labels, dateRange, minLessons } }, '📊 Processing analytics request:');

    // Build WHERE conditions for label filtering
    // Filter by SERVICE labels (appointment/service labels), not client labels
    // This matches the behavior of the Analytics Dashboard where "Online", "Home", "Clubs" refer to service types
    // When a single label is selected: show clients who have appointments with services that have this label
    // When multiple labels are selected: show clients who have appointments with services that have ANY of these labels
    let serviceLabelFilterSQL = '';
    let queryParams = [];
    let paramCount = 0;
    
    if (labels && labels.length > 0) {
      // Filter appointments by service labels using ILIKE pattern matching
      // This matches the behavior of the Analytics Dashboard
      const labelConditions = labels.map((label, idx) => {
        paramCount++;
        queryParams.push(`%${label}%`);
        return `lbl.value ILIKE $${paramCount}`;
      }).join(' OR ');
      serviceLabelFilterSQL = `
        AND EXISTS (
          SELECT 1 
          FROM jsonb_array_elements_text(COALESCE(s.labels, '[]'::jsonb)) AS lbl(value)
          WHERE ${labelConditions}
        )
      `;
    }

    // Build date range filtering for client creation
    let dateWhereClause = '';
    if (dateRange && dateRange.start) {
      paramCount++;
      dateWhereClause += ` AND c.created_at >= $${paramCount}`;
      queryParams.push(dateRange.start);
    }
    if (dateRange && dateRange.end) {
      paramCount++;
      dateWhereClause += ` AND c.created_at <= $${paramCount}`;
      queryParams.push(dateRange.end);
    }

    // Add minLessons parameter
    paramCount++;
    const minLessonsParam = paramCount;
    queryParams.push(minLessons);

    logger.info({ data: queryParams }, '📊 Query params:');
    logger.info({ data: minLessonsParam }, '📊 minLessonsParam:');
    logger.info({ data: serviceLabelFilterSQL }, '📊 serviceLabelFilterSQL:');
    logger.info({ data: new Date().toISOString() }, '📊 About to execute queries at:');

    // Get clients with completed lessons and paid invoices
    // Only include clients who have at least minLessons completed lessons
    const metricsQuery = `
      WITH client_invoice_revenue AS (
        SELECT
          CAST(client_id AS VARCHAR) AS client_id,
          SUM(CASE WHEN status = 'paid' THEN gross ELSE 0 END) AS total_paid_invoices,
          COUNT(CASE WHEN status = 'paid' THEN 1 END) AS paid_invoice_count
        FROM invoices
        GROUP BY client_id
      ),
      client_lesson_stats AS (
        SELECT
          CAST(ar.paying_client_id AS VARCHAR) AS client_id,
          COUNT(DISTINCT ar.appointment_id) AS total_lessons,
          SUM(a.units) AS total_hours,
          COUNT(DISTINCT ar.recipient_id) AS number_of_students,
          MIN(a.start) AS first_lesson_date,
          MAX(a.start) AS last_lesson_date
        FROM appointment_recipients ar
        JOIN appointments a ON a.appointment_id = ar.appointment_id
        JOIN services s ON a.service_id = s.service_id
        WHERE a.status IN ('complete', 'cancelled - chargeable')
          AND ar.status <> 'missed'
          AND ar.paying_client_id IS NOT NULL
          ${serviceLabelFilterSQL}
        GROUP BY ar.paying_client_id
      ),
      active_clients AS (
        SELECT DISTINCT
          CAST(ar.paying_client_id AS VARCHAR) AS client_id
        FROM appointment_recipients ar
        JOIN appointments a ON a.appointment_id = ar.appointment_id
        JOIN services s ON a.service_id = s.service_id
        WHERE a.start >= NOW() - INTERVAL '30 days'
          AND a.status IN ('complete', 'cancelled - chargeable')
          ${serviceLabelFilterSQL}
      ),
      active_clients_90 AS (
        SELECT DISTINCT
          CAST(ar.paying_client_id AS VARCHAR) AS client_id
        FROM appointment_recipients ar
        JOIN appointments a ON a.appointment_id = ar.appointment_id
        JOIN services s ON a.service_id = s.service_id
        WHERE a.start >= NOW() - INTERVAL '90 days'
          AND a.status IN ('complete', 'cancelled - chargeable')
          ${serviceLabelFilterSQL}
      )
      SELECT
        -- Total counts (includes ALL clients with completed lessons, both live and dormant)
        COUNT(DISTINCT c.client_id) FILTER (WHERE cls.total_lessons >= $${minLessonsParam}) AS total_active_clients,
        COUNT(DISTINCT c.client_id) FILTER (WHERE cls.total_lessons >= $${minLessonsParam} AND ac.client_id IS NOT NULL) AS active_clients_30_days,
        COUNT(DISTINCT c.client_id) FILTER (WHERE cls.total_lessons >= $${minLessonsParam} AND ac90.client_id IS NOT NULL) AS active_clients_90_days,
        
        -- Revenue metrics (include ALL clients with completed lessons and paid invoices, regardless of status)
        -- This includes dormant clients who stopped after a few lessons to get true LTV
        COALESCE(SUM(cir.total_paid_invoices) FILTER (WHERE cls.total_lessons >= $${minLessonsParam}), 0) AS total_lifetime_value,
        
        -- Average LTV calculation:
        -- AVG automatically divides total_lifetime_value by the COUNT of clients who meet the filter criteria
        -- The FILTER includes ALL clients (both active AND dormant) with:
        --   - Completed lessons >= minLessons
        --   - Paid invoices > 0
        -- This ensures dormant clients who stopped after a few lessons are included in the denominator
        -- Formula: SUM(cir.total_paid_invoices) / COUNT(clients with completed lessons AND paid invoices)
        COUNT(DISTINCT c.client_id) FILTER (WHERE cls.total_lessons >= $${minLessonsParam} AND cir.total_paid_invoices > 0) AS clients_with_paid_invoices,
        COALESCE(AVG(cir.total_paid_invoices) FILTER (WHERE cls.total_lessons >= $${minLessonsParam} AND cir.total_paid_invoices > 0), 0) AS avg_lifetime_value,
        -- Percentiles: Include all clients with completed lessons AND paid invoices (including dormant)
        COALESCE(PERCENTILE_CONT(0.5) WITHIN GROUP (ORDER BY cir.total_paid_invoices) FILTER (WHERE cls.total_lessons >= $${minLessonsParam} AND cir.total_paid_invoices > 0), 0) AS median_lifetime_value,
        COALESCE(PERCENTILE_CONT(0.75) WITHIN GROUP (ORDER BY cir.total_paid_invoices) FILTER (WHERE cls.total_lessons >= $${minLessonsParam} AND cir.total_paid_invoices > 0), 0) AS p75_lifetime_value,
        COALESCE(PERCENTILE_CONT(0.90) WITHIN GROUP (ORDER BY cir.total_paid_invoices) FILTER (WHERE cls.total_lessons >= $${minLessonsParam} AND cir.total_paid_invoices > 0), 0) AS p90_lifetime_value,
        
        -- Lesson metrics
        COALESCE(SUM(cls.total_lessons) FILTER (WHERE cls.total_lessons >= $${minLessonsParam}), 0) AS total_lessons_completed,
        COALESCE(AVG(cls.total_lessons) FILTER (WHERE cls.total_lessons >= $${minLessonsParam}), 0) AS avg_lessons_per_client,
        
        -- Student metrics
        COALESCE(SUM(cls.number_of_students) FILTER (WHERE cls.total_lessons >= $${minLessonsParam}), 0) AS total_students,
        COALESCE(AVG(cls.number_of_students) FILTER (WHERE cls.total_lessons >= $${minLessonsParam}), 0) AS avg_students_per_client,
        
        -- Hours metrics
        COALESCE(SUM(cls.total_hours) FILTER (WHERE cls.total_lessons >= $${minLessonsParam}), 0) AS total_hours,
        
        -- Client lifespan (average months from first lesson to last lesson)
        COALESCE(AVG(EXTRACT(EPOCH FROM (cls.last_lesson_date - cls.first_lesson_date)) / 2592000) FILTER (WHERE cls.total_lessons >= $${minLessonsParam} AND cls.first_lesson_date IS NOT NULL AND cls.last_lesson_date IS NOT NULL), 0) AS avg_client_lifespan_months
        
      FROM clients c
      INNER JOIN client_lesson_stats cls ON c.client_id = cls.client_id
      LEFT JOIN client_invoice_revenue cir ON c.client_id = cir.client_id
      LEFT JOIN active_clients ac ON c.client_id = ac.client_id
      LEFT JOIN active_clients_90 ac90 ON c.client_id = ac90.client_id
      WHERE 1=1
        -- Include ALL clients with completed lessons (including dormant clients)
        -- This ensures we get true LTV including clients who stopped after a few lessons
        AND cls.total_lessons >= $${minLessonsParam}
        ${dateWhereClause}
    `;

    const pool = getPool(req);
    
    logger.info('📊 Executing metrics query...');
    const { rows: metrics } = await executeQueryWithRetry(
      () => pool.query(metricsQuery, queryParams),
      3,
      1000
    );
    logger.info({ data: metrics.length }, '✅ Metrics query completed, rows:');
    logger.info({ data: metrics[0] }, '📊 Metrics data:');

    // Get top clients by lifetime value
    const topClientsQuery = `
      WITH client_invoice_revenue AS (
        SELECT
          CAST(client_id AS VARCHAR) AS client_id,
          SUM(CASE WHEN status = 'paid' THEN gross ELSE 0 END) AS total_paid_invoices
        FROM invoices
        GROUP BY client_id
      ),
      client_lesson_stats AS (
        SELECT
          CAST(ar.paying_client_id AS VARCHAR) AS client_id,
          COUNT(DISTINCT ar.appointment_id) AS total_lessons,
          COUNT(DISTINCT ar.recipient_id) AS number_of_students
        FROM appointment_recipients ar
        JOIN appointments a ON a.appointment_id = ar.appointment_id
        JOIN services s ON a.service_id = s.service_id
        WHERE a.status IN ('complete', 'cancelled - chargeable')
          AND ar.status <> 'missed'
          AND ar.paying_client_id IS NOT NULL
          ${serviceLabelFilterSQL}
        GROUP BY ar.paying_client_id
      )
      SELECT
        c.client_id,
        c.first_name || ' ' || c.last_name AS client_name,
        c.email,
        COALESCE(cir.total_paid_invoices, 0) AS lifetime_value,
        COALESCE(cls.total_lessons, 0) AS total_lessons,
        COALESCE(cls.number_of_students, 0) AS number_of_students
      FROM clients c
      INNER JOIN client_lesson_stats cls ON c.client_id = cls.client_id
      LEFT JOIN client_invoice_revenue cir ON c.client_id = cir.client_id
      WHERE cls.total_lessons >= $${minLessonsParam}
        ${dateWhereClause}
      ORDER BY lifetime_value DESC
      LIMIT 10
    `;

    logger.info('📊 Executing top clients query...');
    const { rows: topClients } = await executeQueryWithRetry(
      () => pool.query(topClientsQuery, queryParams),
      3,
      1000
    );
    logger.info({ data: topClients.length }, '✅ Top clients query completed, rows:');

    // Get LTV distribution data for histogram
    const distributionQuery = `
      WITH client_invoice_revenue AS (
        SELECT
          CAST(client_id AS VARCHAR) AS client_id,
          SUM(CASE WHEN status = 'paid' THEN gross ELSE 0 END) AS total_paid_invoices
        FROM invoices
        GROUP BY client_id
      ),
      client_lesson_stats AS (
        SELECT
          CAST(ar.paying_client_id AS VARCHAR) AS client_id,
          COUNT(DISTINCT ar.appointment_id) AS total_lessons
        FROM appointment_recipients ar
        JOIN appointments a ON a.appointment_id = ar.appointment_id
        JOIN services s ON a.service_id = s.service_id
        WHERE a.status IN ('complete', 'cancelled - chargeable')
          AND ar.status <> 'missed'
          AND ar.paying_client_id IS NOT NULL
          ${serviceLabelFilterSQL}
        GROUP BY ar.paying_client_id
      ),
      ltv_ranges AS (
        SELECT
          CASE
            WHEN COALESCE(cir.total_paid_invoices, 0) = 0 THEN '0'
            WHEN COALESCE(cir.total_paid_invoices, 0) < 500 THEN '0-500'
            WHEN COALESCE(cir.total_paid_invoices, 0) < 1000 THEN '500-1K'
            WHEN COALESCE(cir.total_paid_invoices, 0) < 2500 THEN '1K-2.5K'
            WHEN COALESCE(cir.total_paid_invoices, 0) < 5000 THEN '2.5K-5K'
            WHEN COALESCE(cir.total_paid_invoices, 0) < 10000 THEN '5K-10K'
            WHEN COALESCE(cir.total_paid_invoices, 0) < 25000 THEN '10K-25K'
            ELSE '25K+'
          END AS ltv_range,
          COUNT(*) FILTER (WHERE cls.total_lessons >= $${minLessonsParam} AND COALESCE(cir.total_paid_invoices, 0) > 0) AS client_count
        FROM clients c
        INNER JOIN client_lesson_stats cls ON c.client_id = cls.client_id
        LEFT JOIN client_invoice_revenue cir ON c.client_id = cir.client_id
        WHERE 1=1
          -- Include ALL clients with completed lessons (including dormant clients)
          -- This ensures we calculate true LTV including clients who stopped after a few lessons
          AND cls.total_lessons >= $${minLessonsParam}
          ${dateWhereClause}
        GROUP BY 
          CASE
            WHEN COALESCE(cir.total_paid_invoices, 0) = 0 THEN '0'
            WHEN COALESCE(cir.total_paid_invoices, 0) < 500 THEN '0-500'
            WHEN COALESCE(cir.total_paid_invoices, 0) < 1000 THEN '500-1K'
            WHEN COALESCE(cir.total_paid_invoices, 0) < 2500 THEN '1K-2.5K'
            WHEN COALESCE(cir.total_paid_invoices, 0) < 5000 THEN '2.5K-5K'
            WHEN COALESCE(cir.total_paid_invoices, 0) < 10000 THEN '5K-10K'
            WHEN COALESCE(cir.total_paid_invoices, 0) < 25000 THEN '10K-25K'
            ELSE '25K+'
          END
      )
      SELECT ltv_range, client_count
      FROM ltv_ranges
      ORDER BY 
        CASE ltv_range
          WHEN '0' THEN 1
          WHEN '0-500' THEN 2
          WHEN '500-1K' THEN 3
          WHEN '1K-2.5K' THEN 4
          WHEN '2.5K-5K' THEN 5
          WHEN '5K-10K' THEN 6
          WHEN '10K-25K' THEN 7
          WHEN '25K+' THEN 8
        END
    `;

    logger.info('📊 Executing distribution query...');
    const { rows: distribution } = await executeQueryWithRetry(
      () => pool.query(distributionQuery, queryParams),
      3,
      1000
    );
    logger.info({ data: distribution.length }, '✅ Distribution query completed, rows:');

    // Get cohort analysis (clients grouped by first lesson month)
    const cohortQuery = `
      WITH       client_first_lesson AS (
        SELECT
          CAST(ar.paying_client_id AS VARCHAR) AS client_id,
          DATE_TRUNC('month', MIN(a.start)) AS first_lesson_month
        FROM appointment_recipients ar
        JOIN appointments a ON a.appointment_id = ar.appointment_id
        JOIN services s ON a.service_id = s.service_id
        WHERE a.status IN ('complete', 'cancelled - chargeable')
          AND ar.status <> 'missed'
          AND ar.paying_client_id IS NOT NULL
          ${serviceLabelFilterSQL}
        GROUP BY ar.paying_client_id
        HAVING COUNT(DISTINCT ar.appointment_id) >= $${minLessonsParam}
      ),
      client_invoice_revenue AS (
        SELECT
          CAST(client_id AS VARCHAR) AS client_id,
          SUM(CASE WHEN status = 'paid' THEN gross ELSE 0 END) AS total_paid_invoices
        FROM invoices
        GROUP BY client_id
      )
      SELECT
        cfl.first_lesson_month,
        COUNT(DISTINCT cfl.client_id) AS cohort_size,
        COALESCE(AVG(cir.total_paid_invoices), 0) AS avg_ltv,
        COALESCE(SUM(cir.total_paid_invoices), 0) AS total_ltv
      FROM client_first_lesson cfl
      LEFT JOIN client_invoice_revenue cir ON cfl.client_id = cir.client_id
      LEFT JOIN clients c ON cfl.client_id = c.client_id
      WHERE 1=1
        ${dateWhereClause}
      GROUP BY cfl.first_lesson_month
      ORDER BY cfl.first_lesson_month DESC
      LIMIT 24
    `;

    logger.info('📊 Executing cohort query...');
    const { rows: cohorts } = await executeQueryWithRetry(
      () => pool.query(cohortQuery, queryParams),
      3,
      1000
    );
    logger.info({ data: cohorts.length }, '✅ Cohort query completed, rows:');

    // Get individual client LTV values for detailed distribution analysis
    const individualLTVQuery = `
      WITH client_invoice_revenue AS (
        SELECT
          CAST(client_id AS VARCHAR) AS client_id,
          SUM(CASE WHEN status = 'paid' THEN gross ELSE 0 END) AS total_paid_invoices
        FROM invoices
        GROUP BY client_id
      ),
      client_lesson_stats AS (
        SELECT
          CAST(ar.paying_client_id AS VARCHAR) AS client_id,
          COUNT(DISTINCT ar.appointment_id) AS total_lessons
        FROM appointment_recipients ar
        JOIN appointments a ON a.appointment_id = ar.appointment_id
        JOIN services s ON a.service_id = s.service_id
        WHERE a.status IN ('complete', 'cancelled - chargeable')
          AND ar.status <> 'missed'
          AND ar.paying_client_id IS NOT NULL
          ${serviceLabelFilterSQL}
        GROUP BY ar.paying_client_id
      )
      SELECT
        COALESCE(cir.total_paid_invoices, 0) AS ltv_value
      FROM clients c
      INNER JOIN client_lesson_stats cls ON c.client_id = cls.client_id
      LEFT JOIN client_invoice_revenue cir ON c.client_id = cir.client_id
      WHERE cls.total_lessons >= $${minLessonsParam}
        AND COALESCE(cir.total_paid_invoices, 0) > 0
        ${dateWhereClause}
      ORDER BY ltv_value ASC
    `;

    logger.info('📊 Executing individual LTV query...');
    const { rows: individualLTVs } = await executeQueryWithRetry(
      () => pool.query(individualLTVQuery, queryParams),
      3,
      1000
    );
    logger.info({ data: individualLTVs.length }, '✅ Individual LTV query completed, rows:');

    const responseData = {
      metrics: metrics[0] || {},
      topClients,
      distribution,
      cohorts,
      individualLTVs: individualLTVs.map(row => parseFloat(row.ltv_value) || 0)
    };

    logger.info('✅ Sending analytics response');
    res.json(responseData);

  } catch (error) {
    logger.error({ err: error }, '❌ Error fetching client analytics:');
    logger.error({ error: error.stack }, 'Error stack:');
    res.status(500).json({ error: 'Failed to fetch client analytics', details: error.message });
  }
}));

// ============================================================================
// LABELS AND CATEGORIZATION
// ============================================================================

// Get all unique labels from clients
router.get('/labels', asyncHandler(async (req, res) => {
  try {
    const pool = getPool(req);
    logger.info('📡 [API] /api/crm/labels endpoint called');

    const cacheKey = 'crm:labels';
    const cachedData = await cache.getOrSet(cacheKey, async () => {
      // First try to get labels from database (fast)
      try {
        const { rows: dbLabels } = await pool.query(`
          SELECT id, name, color, active
          FROM labels
          WHERE active = true
          ORDER BY name ASC
        `);

        if (dbLabels.length > 0 && dbLabels.some(l => l.color)) {
          logger.info('✅ [API] Found ${dbLabels.length} labels in database with colors');
          return {
            labels: dbLabels.map(label => ({
              id: label.id,
              name: label.name,
              colour: label.color || '#d3d3d3',
              clientCount: 0
            }))
          };
        } else {
          logger.info('⚠️ [API] Database labels exist but no colors found, fetching from API...');
        }
      } catch (dbError) {
        logger.info({ data: dbError.message }, '⚠️ [API] Database query failed, fetching from API...');
      }

      // Fallback: Fetch labels directly from TutorCruncher API
      const { limitedGet, rateLimitRetry } = global;

      if (!limitedGet) {
        logger.error('❌ [API] limitedGet is not available in global');
        throw new Error('API service unavailable');
      }

      const fetchLabels = async () => {
        logger.info('📡 [API] Calling TutorCruncher API: /labels/');
        return await limitedGet('/labels/');
      };

      logger.info('📡 [API] Fetching labels from TutorCruncher...');
      const response = await rateLimitRetry(fetchLabels);

      logger.info('✅ [API] TutorCruncher API responded');
      logger.info({ data: response.status }, '📊 [API] Response status:');
      logger.info({ data: response.data?.results?.length || 0 }, '📊 [API] Results count:');

      if (!response.data || !response.data.results) {
        logger.error({ error: response.data }, '❌ [API] Invalid response structure:');
        return { labels: [] };
      }

      // Filter to only client-applicable labels and format with colors
      const labels = response.data.results
        .filter(label => {
          // Only include labels that apply to clients
          const appliesTo = label.applies_to || [];
          return appliesTo.includes('Client') || appliesTo.length === 0;
        })
        .map(label => {
          // Get color - TutorCruncher uses 'colour' field
          const color = label.colour || label.color || '#d3d3d3';
          logger.info('🎨 [API] Label: "${label.name}", Color: ${color}');
          return {
            id: label.id,
            name: label.name,
            machine_name: label.machine_name,
            colour: color,
            clientCount: 0
          };
        })
        .sort((a, b) => a.name.localeCompare(b.name));

      logger.info('✅ [API] Returning ${labels.length} labels with colors');
      if (labels.length > 0) {
        logger.info({ data: labels.slice(0, 3).map(l => ({ name: l.name, colour: l.colour })) }, '🎨 [API] Sample labels:');
      }

      return { labels };
    }, 300); // 5 minute TTL - labels don't change often

    res.json(cachedData);
  } catch (error) {
    logger.error({ error: error.message }, '❌ [API] Error fetching labels:');
    logger.error({ error: error.stack }, '❌ [API] Error stack:');
    if (error.response) {
      logger.error({ error: error.response.status }, '❌ [API] Error response status:');
      logger.error({ error: error.response.data }, '❌ [API] Error response data:');
    }

    // Return empty array instead of falling back to DB (DB doesn't have colors)
    res.json({
      labels: [],
      error: 'Failed to fetch labels from TutorCruncher',
      message: error.message
    });
  }
}));

// Get clients by label
router.get('/clients/label/:label', asyncHandler(async (req, res) => {
  try {
    const pool = getPool(req);
    const { label } = req.params;
    const { page = 1, limit = 50 } = req.query;
    const offset = (page - 1) * limit;

    const cacheKey = `crm:clients:label:${label}:page:${page}:limit:${limit}`;
    const cachedData = await cache.getOrSet(cacheKey, async () => {
      const query = `
        WITH lifetime_data AS (
          SELECT
            CAST(ar.paying_client_id AS VARCHAR) AS client_id,
            SUM(ar.charge_rate) AS total_revenue,
            COUNT(*) AS total_lessons
          FROM appointment_recipients ar
          JOIN appointments a ON a.appointment_id = ar.appointment_id
          WHERE a.status IN ('complete', 'cancelled - chargeable')
          GROUP BY ar.paying_client_id
        )
        SELECT
          c.*,
          COALESCE(lifetime_data.total_revenue, 0) AS total_revenue,
          COALESCE(lifetime_data.total_lessons, 0) AS total_lessons
        FROM clients c
        LEFT JOIN lifetime_data ON c.client_id = lifetime_data.client_id
        WHERE c.labels ? $1
        ORDER BY total_revenue DESC
        LIMIT $2 OFFSET $3
      `;

      const { rows: clients } = await pool.query(query, [label, limit, offset]);
      return { clients };
    }, 60); // 60 second TTL

    res.json(cachedData);
  } catch (error) {
    logger.error({ err: error }, 'Error fetching clients by label:');
    res.status(500).json({ error: 'Failed to fetch clients by label' });
  }
}));

// ============================================================================
// ENHANCED ANALYTICS ENDPOINTS
// ============================================================================

// Get LTV milestone analytics
router.post('/analytics/milestones', asyncHandler(async (req, res) => {
  try {
    const pool = getPool(req);
    const { labels = [], dateRange = {} } = req.body;

    // Build WHERE conditions
    // When a single label is selected: show all clients that have that label (including those with multiple labels)
    // When multiple labels are selected: show clients that have ALL of those labels
    let labelWhereClause = '';
    let queryParams = [];
    let paramCount = 0;
    
    // Pre-filter clients by labels if needed
    let filteredClientsCTE = '';
    if (labels && labels.length > 0) {
      if (labels.length === 1) {
        // Single label: show all clients that have this label (including those with multiple labels)
        paramCount++;
        filteredClientsCTE = `
      filtered_clients AS (
        SELECT DISTINCT client_id::text AS client_id
        FROM clients c
        WHERE EXISTS (
          SELECT 1 
          FROM jsonb_array_elements(c.labels) AS label_elem
          WHERE jsonb_extract_path_text(label_elem, 'name') = $${paramCount}::text
        )
      ),
      `;
        queryParams.push(labels[0]);
      } else {
        // Multiple labels: show clients that have ALL of the selected labels
        const labelConditions = labels.map((label, idx) => {
          paramCount++;
          return `EXISTS (
            SELECT 1 
            FROM jsonb_array_elements(c.labels) AS label_elem
            WHERE jsonb_extract_path_text(label_elem, 'name') = $${paramCount}::text
          )`;
        }).join(' AND ');
        
        filteredClientsCTE = `
      filtered_clients AS (
        SELECT DISTINCT client_id::text AS client_id
        FROM clients c
        WHERE ${labelConditions}
      ),
      `;
        queryParams.push(...labels);
      }
    }

    const milestonesQuery = `
      WITH ${filteredClientsCTE}client_lessons AS (
        SELECT
          CAST(ar.paying_client_id AS VARCHAR) AS client_id,
          COUNT(DISTINCT ar.appointment_id) AS lesson_count,
          MIN(a.start) AS first_lesson_date
        FROM appointment_recipients ar
        JOIN appointments a ON a.appointment_id = ar.appointment_id
        ${labels && labels.length > 0 ? 'JOIN filtered_clients fc ON fc.client_id = ar.paying_client_id::text' : ''}
        WHERE a.status IN ('complete', 'cancelled - chargeable')
          AND ar.status <> 'missed'
          AND ar.paying_client_id IS NOT NULL
        GROUP BY ar.paying_client_id
      ),
      milestone_clients AS (
        SELECT
          client_id,
          lesson_count,
          first_lesson_date,
          CASE 
            WHEN lesson_count >= 1 THEN 1 ELSE 0 END AS reached_trial,
          CASE 
            WHEN lesson_count >= 5 THEN 1 ELSE 0 END AS reached_5,
          CASE 
            WHEN lesson_count >= 10 THEN 1 ELSE 0 END AS reached_10,
          CASE 
            WHEN lesson_count >= 15 THEN 1 ELSE 0 END AS reached_15,
          CASE 
            WHEN lesson_count >= 20 THEN 1 ELSE 0 END AS reached_20
        FROM client_lessons
      ),
      invoice_revenue AS (
        SELECT
          CAST(client_id AS VARCHAR) AS client_id,
          SUM(CASE WHEN status = 'paid' THEN gross ELSE 0 END) AS total_paid_invoices
        FROM invoices
        GROUP BY client_id
      ),
      trial_ltv AS (
        SELECT 
          COUNT(DISTINCT mc.client_id) AS clients_reached,
          COALESCE(AVG(ir.total_paid_invoices), 0) AS avg_ltv
        FROM milestone_clients mc
        LEFT JOIN invoice_revenue ir ON mc.client_id = ir.client_id
        WHERE mc.reached_trial = 1
      ),
      ltv_5 AS (
        SELECT 
          COUNT(DISTINCT mc.client_id) AS clients_reached,
          COALESCE(AVG(ir.total_paid_invoices), 0) AS avg_ltv
        FROM milestone_clients mc
        LEFT JOIN invoice_revenue ir ON mc.client_id = ir.client_id
        WHERE mc.reached_5 = 1
      ),
      ltv_10 AS (
        SELECT 
          COUNT(DISTINCT mc.client_id) AS clients_reached,
          COALESCE(AVG(ir.total_paid_invoices), 0) AS avg_ltv
        FROM milestone_clients mc
        LEFT JOIN invoice_revenue ir ON mc.client_id = ir.client_id
        WHERE mc.reached_10 = 1
      ),
      ltv_15 AS (
        SELECT 
          COUNT(DISTINCT mc.client_id) AS clients_reached,
          COALESCE(AVG(ir.total_paid_invoices), 0) AS avg_ltv
        FROM milestone_clients mc
        LEFT JOIN invoice_revenue ir ON mc.client_id = ir.client_id
        WHERE mc.reached_15 = 1
      ),
      ltv_20 AS (
        SELECT 
          COUNT(DISTINCT mc.client_id) AS clients_reached,
          COALESCE(AVG(ir.total_paid_invoices), 0) AS avg_ltv
        FROM milestone_clients mc
        LEFT JOIN invoice_revenue ir ON mc.client_id = ir.client_id
        WHERE mc.reached_20 = 1
      ),
      milestone_data AS (
        SELECT 
          'Trial Completed' AS milestone,
          t.clients_reached,
          t.avg_ltv,
          0 AS change_vs_prev,
          100 AS retention_rate,
          t.clients_reached::DECIMAL / NULLIF((SELECT clients_reached FROM trial_ltv), 0) AS client_ratio,
          1 AS sort_order
        FROM trial_ltv t
        UNION ALL
        SELECT 
          '5 Lessons',
          l5.clients_reached,
          l5.avg_ltv,
          CASE WHEN t.avg_ltv > 0 THEN ((l5.avg_ltv - t.avg_ltv) / t.avg_ltv * 100)::DECIMAL(10,2) ELSE 0 END AS change_vs_prev,
          CASE WHEN t.clients_reached > 0 THEN (l5.clients_reached::DECIMAL / t.clients_reached * 100)::DECIMAL(10,2) ELSE 0 END AS retention_rate,
          l5.clients_reached::DECIMAL / NULLIF((SELECT clients_reached FROM trial_ltv), 0) AS client_ratio,
          2 AS sort_order
        FROM ltv_5 l5
        CROSS JOIN trial_ltv t
        UNION ALL
        SELECT 
          '10 Lessons',
          l10.clients_reached,
          l10.avg_ltv,
          CASE WHEN l5.avg_ltv > 0 THEN ((l10.avg_ltv - l5.avg_ltv) / l5.avg_ltv * 100)::DECIMAL(10,2) ELSE 0 END AS change_vs_prev,
          CASE WHEN l5.clients_reached > 0 THEN (l10.clients_reached::DECIMAL / l5.clients_reached * 100)::DECIMAL(10,2) ELSE 0 END AS retention_rate,
          l10.clients_reached::DECIMAL / NULLIF((SELECT clients_reached FROM trial_ltv), 0) AS client_ratio,
          3 AS sort_order
        FROM ltv_10 l10
        CROSS JOIN ltv_5 l5
        UNION ALL
        SELECT 
          '15 Lessons',
          l15.clients_reached,
          l15.avg_ltv,
          CASE WHEN l10.avg_ltv > 0 THEN ((l15.avg_ltv - l10.avg_ltv) / l10.avg_ltv * 100)::DECIMAL(10,2) ELSE 0 END AS change_vs_prev,
          CASE WHEN l10.clients_reached > 0 THEN (l15.clients_reached::DECIMAL / l10.clients_reached * 100)::DECIMAL(10,2) ELSE 0 END AS retention_rate,
          l15.clients_reached::DECIMAL / NULLIF((SELECT clients_reached FROM trial_ltv), 0) AS client_ratio,
          4 AS sort_order
        FROM ltv_15 l15
        CROSS JOIN ltv_10 l10
        UNION ALL
        SELECT 
          '20+ Lessons',
          l20.clients_reached,
          l20.avg_ltv,
          CASE WHEN l15.avg_ltv > 0 THEN ((l20.avg_ltv - l15.avg_ltv) / l15.avg_ltv * 100)::DECIMAL(10,2) ELSE 0 END AS change_vs_prev,
          CASE WHEN l15.clients_reached > 0 THEN (l20.clients_reached::DECIMAL / l15.clients_reached * 100)::DECIMAL(10,2) ELSE 0 END AS retention_rate,
          l20.clients_reached::DECIMAL / NULLIF((SELECT clients_reached FROM trial_ltv), 0) AS client_ratio,
          5 AS sort_order
        FROM ltv_20 l20
        CROSS JOIN ltv_15 l15
      )
      SELECT milestone, clients_reached, avg_ltv, change_vs_prev, retention_rate, client_ratio
      FROM milestone_data
      ORDER BY sort_order
    `;

    const { rows: milestones } = await executeQueryWithRetry(
      () => pool.query(milestonesQuery, queryParams),
      3,
      1000
    );

    res.json({ milestones });
  } catch (error) {
    logger.error({ err: error }, 'Error fetching milestone analytics:');
    logger.error({ error: error.stack }, 'Error stack:');
    res.status(500).json({ error: 'Failed to fetch milestone analytics', details: error.message });
  }
}));

// Get clients by milestone
router.post('/analytics/milestones/clients', asyncHandler(async (req, res) => {
  try {
    const pool = getPool(req);
    const { milestone, labels = [], page = 1, pageSize = 25 } = req.body;

    if (!milestone) {
      return res.status(400).json({ error: 'Milestone is required' });
    }

    // Determine lesson count threshold based on milestone
    let lessonThreshold = 0;
    switch (milestone) {
      case 'Trial Completed':
        lessonThreshold = 1;
        break;
      case '5 Lessons':
        lessonThreshold = 5;
        break;
      case '10 Lessons':
        lessonThreshold = 10;
        break;
      case '15 Lessons':
        lessonThreshold = 15;
        break;
      case '20+ Lessons':
        lessonThreshold = 20;
        break;
      default:
        return res.status(400).json({ error: 'Invalid milestone' });
    }

    // Build WHERE conditions
    // When a single label is selected: show all clients that have that label (including those with multiple labels)
    // When multiple labels are selected: show clients that have ALL of those labels
    let queryParams = [];
    let paramCount = 0;
    
    let filteredClientsCTE = '';
    if (labels && labels.length > 0) {
      if (labels.length === 1) {
        // Single label: show all clients that have this label (including those with multiple labels)
        paramCount++;
        filteredClientsCTE = `
      filtered_clients AS (
        SELECT DISTINCT client_id::text AS client_id
        FROM clients c
        WHERE EXISTS (
          SELECT 1 
          FROM jsonb_array_elements(c.labels) AS label_elem
          WHERE jsonb_extract_path_text(label_elem, 'name') = $${paramCount}::text
        )
      ),
      `;
        queryParams.push(labels[0]);
      } else {
        // Multiple labels: show clients that have ALL of the selected labels
        const labelConditions = labels.map((label, idx) => {
          paramCount++;
          return `EXISTS (
            SELECT 1 
            FROM jsonb_array_elements(c.labels) AS label_elem
            WHERE jsonb_extract_path_text(label_elem, 'name') = $${paramCount}::text
          )`;
        }).join(' AND ');
        
        filteredClientsCTE = `
      filtered_clients AS (
        SELECT DISTINCT client_id::text AS client_id
        FROM clients c
        WHERE ${labelConditions}
      ),
      `;
        queryParams.push(...labels);
      }
    }

    const offset = (page - 1) * pageSize;

    paramCount++;
    queryParams.push(lessonThreshold);
    const lessonThresholdParam = paramCount;
    
    paramCount++;
    queryParams.push(pageSize);
    const pageSizeParam = paramCount;
    
    paramCount++;
    queryParams.push(offset);
    const offsetParam = paramCount;

    // Construct the WITH clause properly
    const withClause = filteredClientsCTE 
      ? `WITH ${filteredClientsCTE.trim()}client_lessons AS (`
      : `WITH client_lessons AS (`;
    
    const clientsQuery = `
      ${withClause}
        SELECT
          CAST(ar.paying_client_id AS VARCHAR) AS client_id,
          COUNT(DISTINCT ar.appointment_id) AS lesson_count
        FROM appointment_recipients ar
        JOIN appointments a ON a.appointment_id = ar.appointment_id
        ${labels && labels.length > 0 ? 'JOIN filtered_clients fc ON fc.client_id = ar.paying_client_id::text' : ''}
        WHERE a.status IN ('complete', 'cancelled - chargeable')
          AND ar.status <> 'missed'
          AND ar.paying_client_id IS NOT NULL
        GROUP BY ar.paying_client_id
        HAVING COUNT(DISTINCT ar.appointment_id) >= $${lessonThresholdParam}
      ),
      client_invoice_revenue AS (
        SELECT
          CAST(client_id AS VARCHAR) AS client_id,
          SUM(CASE WHEN status = 'paid' THEN gross ELSE 0 END) AS total_paid_invoices
        FROM invoices
        GROUP BY client_id
      ),
      client_info AS (
        SELECT
          cl.client_id,
          TRIM(COALESCE(c.first_name, '') || ' ' || COALESCE(c.last_name, '')) AS client_name,
          c.client_id AS tutorcruncher_id,
          COALESCE(cir.total_paid_invoices, 0) AS avg_ltv,
          cl.lesson_count
        FROM client_lessons cl
        LEFT JOIN clients c ON c.client_id::text = cl.client_id
        LEFT JOIN client_invoice_revenue cir ON cir.client_id = cl.client_id
      )
      SELECT 
        client_id,
        client_name,
        tutorcruncher_id,
        avg_ltv,
        lesson_count
      FROM client_info
      ORDER BY avg_ltv DESC, client_name ASC
      LIMIT $${pageSizeParam} OFFSET $${offsetParam}
    `;

    logger.info({ data: { milestone, lessonThreshold, page, pageSize, labels } }, '📊 Fetching milestone clients:');
    logger.info({ data: queryParams }, '📊 Query params:');
    logger.info({ data: clientsQuery }, '📊 SQL Query:');
    
    const { rows: clients } = await pool.query(clientsQuery, queryParams);

    // Get total count for pagination
    let countParamCount = 0;
    let countParams = [];
    
    let countFilteredClientsCTE = '';
    if (labels && labels.length > 0) {
      countParamCount++;
      countFilteredClientsCTE = `
      filtered_clients AS (
        SELECT DISTINCT client_id::text AS client_id
        FROM clients c
        WHERE EXISTS (
          SELECT 1 
          FROM jsonb_array_elements(c.labels) AS label_elem
          WHERE jsonb_extract_path_text(label_elem, 'name') = ANY($${countParamCount}::text[])
        )
      ),
      `;
      countParams.push(labels);
    }
    countParamCount++;
    countParams.push(lessonThreshold);
    const countLessonThresholdParam = countParamCount;

    const countWithClause = countFilteredClientsCTE 
      ? `WITH ${countFilteredClientsCTE.trim()}client_lessons AS (`
      : `WITH client_lessons AS (`;
    
    const countQuery = `
      ${countWithClause}
        SELECT
          CAST(ar.paying_client_id AS VARCHAR) AS client_id,
          COUNT(DISTINCT ar.appointment_id) AS lesson_count
        FROM appointment_recipients ar
        JOIN appointments a ON a.appointment_id = ar.appointment_id
        ${labels && labels.length > 0 ? 'JOIN filtered_clients fc ON fc.client_id = ar.paying_client_id::text' : ''}
        WHERE a.status IN ('complete', 'cancelled - chargeable')
          AND ar.status <> 'missed'
          AND ar.paying_client_id IS NOT NULL
        GROUP BY ar.paying_client_id
        HAVING COUNT(DISTINCT ar.appointment_id) >= $${countLessonThresholdParam}
      )
      SELECT COUNT(*) AS total
      FROM client_lessons
    `;

    const { rows: countResult } = await pool.query(countQuery, countParams);
    const total = parseInt(countResult[0]?.total || 0);

    res.json({
      clients,
      pagination: {
        page,
        pageSize,
        total,
        totalPages: Math.ceil(total / pageSize)
      }
    });
  } catch (error) {
    logger.error({ err: error }, 'Error fetching milestone clients:');
    logger.error({ error: error.stack }, 'Error stack:');
    res.status(500).json({ error: 'Failed to fetch milestone clients', details: error.message });
  }
}));

// Get retention and engagement metrics
router.post('/analytics/retention', asyncHandler(async (req, res) => {
  try {
    const pool = getPool(req);
    const { labels = [], dateRange = {} } = req.body;

    // Build WHERE conditions
    // When a single label is selected: show all clients that have that label (including those with multiple labels)
    // When multiple labels are selected: show clients that have ALL of those labels
    // Pre-filter clients for retention query
    let retentionQueryParams = [];
    let retentionParamCount = 0;
    
    let retentionFilteredClientsCTE = '';
    if (labels && labels.length > 0) {
      if (labels.length === 1) {
        // Single label: show all clients that have this label (including those with multiple labels)
        retentionParamCount++;
        retentionFilteredClientsCTE = `
      filtered_clients_retention AS (
        SELECT DISTINCT client_id::text AS client_id
        FROM clients c
        WHERE EXISTS (
          SELECT 1 
          FROM jsonb_array_elements(c.labels) AS label_elem
          WHERE jsonb_extract_path_text(label_elem, 'name') = $${retentionParamCount}::text
        )
      ),
      `;
        retentionQueryParams.push(labels[0]);
      } else {
        // Multiple labels: show clients that have ALL of the selected labels
        const labelConditions = labels.map((label, idx) => {
          retentionParamCount++;
          return `EXISTS (
            SELECT 1 
            FROM jsonb_array_elements(c.labels) AS label_elem
            WHERE jsonb_extract_path_text(label_elem, 'name') = $${retentionParamCount}::text
          )`;
        }).join(' AND ');
        
        retentionFilteredClientsCTE = `
      filtered_clients_retention AS (
        SELECT DISTINCT client_id::text AS client_id
        FROM clients c
        WHERE ${labelConditions}
      ),
      `;
        retentionQueryParams.push(...labels);
      }
    }

    const retentionQuery = `
      WITH ${retentionFilteredClientsCTE}client_lessons AS (
        SELECT
          CAST(ar.paying_client_id AS VARCHAR) AS client_id,
          COUNT(DISTINCT ar.appointment_id) AS total_lessons,
          COUNT(DISTINCT ar.recipient_id) AS number_of_students,
          MIN(a.start) AS first_lesson_date,
          MAX(a.start) AS last_lesson_date
        FROM appointment_recipients ar
        JOIN appointments a ON a.appointment_id = ar.appointment_id
        ${labels && labels.length > 0 ? 'JOIN filtered_clients_retention fc ON fc.client_id = ar.paying_client_id::text' : ''}
        WHERE a.status IN ('complete', 'cancelled - chargeable')
          AND ar.status <> 'missed'
          AND ar.paying_client_id IS NOT NULL
        GROUP BY ar.paying_client_id
      ),
      active_30d AS (
        SELECT DISTINCT
          CAST(ar.paying_client_id AS VARCHAR) AS client_id
        FROM appointment_recipients ar
        JOIN appointments a ON a.appointment_id = ar.appointment_id
        ${labels && labels.length > 0 ? 'JOIN filtered_clients_retention fc ON fc.client_id = ar.paying_client_id::text' : ''}
        WHERE a.start >= NOW() - INTERVAL '30 days'
          AND a.status IN ('complete', 'cancelled - chargeable')
      ),
      active_60d AS (
        SELECT DISTINCT
          CAST(ar.paying_client_id AS VARCHAR) AS client_id
        FROM appointment_recipients ar
        JOIN appointments a ON a.appointment_id = ar.appointment_id
        ${labels && labels.length > 0 ? 'JOIN filtered_clients_retention fc ON fc.client_id = ar.paying_client_id::text' : ''}
        WHERE a.start >= NOW() - INTERVAL '60 days'
          AND a.status IN ('complete', 'cancelled - chargeable')
      ),
      active_90d AS (
        SELECT DISTINCT
          CAST(ar.paying_client_id AS VARCHAR) AS client_id
        FROM appointment_recipients ar
        JOIN appointments a ON a.appointment_id = ar.appointment_id
        ${labels && labels.length > 0 ? 'JOIN filtered_clients_retention fc ON fc.client_id = ar.paying_client_id::text' : ''}
        WHERE a.start >= NOW() - INTERVAL '90 days'
          AND a.status IN ('complete', 'cancelled - chargeable')
      ),
      active_180d AS (
        SELECT DISTINCT
          CAST(ar.paying_client_id AS VARCHAR) AS client_id
        FROM appointment_recipients ar
        JOIN appointments a ON a.appointment_id = ar.appointment_id
        ${labels && labels.length > 0 ? 'JOIN filtered_clients_retention fc ON fc.client_id = ar.paying_client_id::text' : ''}
        WHERE a.start >= NOW() - INTERVAL '180 days'
          AND a.status IN ('complete', 'cancelled - chargeable')
      ),
      churned AS (
        SELECT
          cl.client_id
        FROM client_lessons cl
        WHERE cl.last_lesson_date < NOW() - INTERVAL '60 days'
          AND cl.last_lesson_date IS NOT NULL
      ),
      time_between_lessons AS (
        SELECT
          ar.paying_client_id::text AS client_id,
          EXTRACT(EPOCH FROM (a.start - LAG(a.start) OVER (PARTITION BY ar.paying_client_id ORDER BY a.start))) / 86400 AS days_between
        FROM appointment_recipients ar
        JOIN appointments a ON a.appointment_id = ar.appointment_id
        ${labels && labels.length > 0 ? 'JOIN filtered_clients_retention fc ON fc.client_id = ar.paying_client_id::text' : ''}
        WHERE a.status IN ('complete', 'cancelled - chargeable')
          AND ar.status <> 'missed'
          AND ar.paying_client_id IS NOT NULL
      ),
      avg_time_between AS (
        SELECT
          client_id,
          AVG(days_between) AS avg_days_between
        FROM time_between_lessons
        WHERE days_between IS NOT NULL
        GROUP BY client_id
      ),
      client_averages AS (
        SELECT
          cl.client_id,
          cl.total_lessons,
          cl.number_of_students,
          COALESCE(EXTRACT(EPOCH FROM (cl.last_lesson_date - cl.first_lesson_date)) / 2592000, 0) AS lifespan_months,
          COALESCE(atb.avg_days_between, 0) AS avg_days_between
        FROM client_lessons cl
        LEFT JOIN avg_time_between atb ON atb.client_id = cl.client_id
      )
      SELECT
        -- Retention rates
        (SELECT COUNT(*) FROM active_30d) AS active_clients_30d,
        (SELECT COUNT(*) FROM active_60d) AS active_clients_60d,
        (SELECT COUNT(*) FROM active_90d) AS active_clients_90d,
        (SELECT COUNT(*) FROM active_180d) AS active_clients_180d,
        (SELECT COUNT(*) FROM churned) AS churned_clients,
        -- Engagement metrics
        COALESCE(AVG(total_lessons), 0) AS avg_lessons_per_client,
        COALESCE(AVG(number_of_students), 0) AS avg_students_per_client,
        COALESCE(AVG(avg_days_between), 0) AS avg_days_between_lessons,
        COALESCE(AVG(lifespan_months), 0) AS avg_client_lifespan_months,
        -- Lessons per month
        COALESCE(AVG(total_lessons / NULLIF(lifespan_months, 0)), 0) AS avg_lessons_per_month,
        -- Client counts
        (SELECT COUNT(*) FROM client_lessons) AS total_clients
      FROM client_averages
    `;

    const { rows: retention } = await executeQueryWithRetry(
      () => pool.query(retentionQuery, retentionQueryParams),
      3,
      1000
    );
    
    res.json({ retention: retention[0] || {} });
  } catch (error) {
    logger.error({ err: error }, 'Error fetching retention analytics:');
    logger.error({ error: error.stack }, 'Error stack:');
    res.status(500).json({ error: 'Failed to fetch retention analytics', details: error.message });
  }
}));

// Get behavioral analytics
router.post('/analytics/behavior', asyncHandler(async (req, res) => {
  try {
    const pool = getPool(req);
    const { labels = [], dateRange = {} } = req.body;

    // Build WHERE conditions
    // When a single label is selected: show all clients that have that label (including those with multiple labels)
    // When multiple labels are selected: show clients that have ALL of those labels
    let queryParams = [];
    let paramCount = 0;
    
    // Pre-filter clients by labels if needed
    let filteredClientsCTE = '';
    if (labels && labels.length > 0) {
      if (labels.length === 1) {
        // Single label: show all clients that have this label (including those with multiple labels)
        paramCount++;
        filteredClientsCTE = `
      filtered_clients_behavior AS (
        SELECT DISTINCT client_id::text AS client_id
        FROM clients c
        WHERE EXISTS (
          SELECT 1 
          FROM jsonb_array_elements(c.labels) AS label_elem
          WHERE jsonb_extract_path_text(label_elem, 'name') = $${paramCount}::text
        )
      ),
      `;
        queryParams.push(labels[0]);
      } else {
        // Multiple labels: show clients that have ALL of the selected labels
        const labelConditions = labels.map((label, idx) => {
          paramCount++;
          return `EXISTS (
            SELECT 1 
            FROM jsonb_array_elements(c.labels) AS label_elem
            WHERE jsonb_extract_path_text(label_elem, 'name') = $${paramCount}::text
          )`;
        }).join(' AND ');
        
        filteredClientsCTE = `
      filtered_clients_behavior AS (
        SELECT DISTINCT client_id::text AS client_id
        FROM clients c
        WHERE ${labelConditions}
      ),
      `;
        queryParams.push(...labels);
      }
    }

    const behaviorQuery = `
      WITH ${filteredClientsCTE}client_lessons AS (
        SELECT
          CAST(ar.paying_client_id AS VARCHAR) AS client_id,
          COUNT(DISTINCT ar.recipient_id) AS number_of_students,
          COUNT(DISTINCT a.service_id) AS unique_service_types
        FROM appointment_recipients ar
        JOIN appointments a ON a.appointment_id = ar.appointment_id
        JOIN services s ON a.service_id = s.service_id
        ${labels && labels.length > 0 ? 'JOIN filtered_clients_behavior fc ON fc.client_id = ar.paying_client_id::text' : ''}
        WHERE a.status IN ('complete', 'cancelled - chargeable')
          AND ar.status <> 'missed'
          AND ar.paying_client_id IS NOT NULL
        GROUP BY ar.paying_client_id
      ),
      client_tutors AS (
        SELECT
          CAST(ar.paying_client_id AS VARCHAR) AS client_id,
          COUNT(DISTINCT ac.contractor_id) AS unique_tutors
        FROM appointment_recipients ar
        JOIN appointments a ON a.appointment_id = ar.appointment_id
        JOIN appointment_contractors ac ON ac.appointment_id = a.appointment_id
        ${labels && labels.length > 0 ? 'JOIN filtered_clients_behavior fc ON fc.client_id = ar.paying_client_id::text' : ''}
        WHERE a.status IN ('complete', 'cancelled - chargeable')
          AND ar.status <> 'missed'
          AND ar.paying_client_id IS NOT NULL
        GROUP BY ar.paying_client_id
      ),
      multi_student_clients AS (
        SELECT COUNT(*) AS count
        FROM client_lessons
        WHERE number_of_students > 1
      ),
      cross_enrollment_clients AS (
        SELECT COUNT(*) AS count
        FROM client_lessons
        WHERE unique_service_types > 1
      ),
      client_labels AS (
        SELECT
          c.client_id,
          jsonb_array_length(c.labels) AS label_count
        FROM clients c
      ),
      clients_with_trial AS (
        SELECT
          CAST(ar.paying_client_id AS VARCHAR) AS client_id,
          MIN(a.start) AS first_lesson_date
        FROM appointment_recipients ar
        JOIN appointments a ON a.appointment_id = ar.appointment_id
        ${labels && labels.length > 0 ? 'JOIN filtered_clients_behavior fc ON fc.client_id = ar.paying_client_id::text' : ''}
        WHERE a.status IN ('complete', 'cancelled - chargeable')
          AND ar.status <> 'missed'
          AND ar.paying_client_id IS NOT NULL
        GROUP BY ar.paying_client_id
      ),
      clients_with_multiple_lessons AS (
        SELECT
          CAST(ar.paying_client_id AS VARCHAR) AS client_id,
          COUNT(DISTINCT ar.appointment_id) AS lesson_count
        FROM appointment_recipients ar
        JOIN appointments a ON a.appointment_id = ar.appointment_id
        ${labels && labels.length > 0 ? 'JOIN filtered_clients_behavior fc ON fc.client_id = ar.paying_client_id::text' : ''}
        WHERE a.status IN ('complete', 'cancelled - chargeable')
          AND ar.status <> 'missed'
          AND ar.paying_client_id IS NOT NULL
        GROUP BY ar.paying_client_id
        HAVING COUNT(DISTINCT ar.appointment_id) > 1
      )
      SELECT
        -- Multiple students percentage
        (SELECT count FROM multi_student_clients) AS clients_multiple_students,
        ((SELECT count FROM multi_student_clients)::DECIMAL / NULLIF((SELECT COUNT(*) FROM client_lessons), 0) * 100)::DECIMAL(10,2) AS pct_multiple_students,
        -- Cross-enrollment metrics
        (SELECT count FROM cross_enrollment_clients) AS clients_cross_enrolled,
        ((SELECT count FROM cross_enrollment_clients)::DECIMAL / NULLIF((SELECT COUNT(*) FROM client_lessons), 0) * 100)::DECIMAL(10,2) AS pct_cross_enrolled,
        COALESCE(AVG(unique_service_types), 0) AS avg_service_types_per_client,
        -- Tutor diversity
        COALESCE(AVG(ct.unique_tutors), 0) AS avg_tutors_per_client,
        -- Client counts
        (SELECT COUNT(*) FROM client_lessons) AS total_clients,
        -- Trial conversion
        (SELECT COUNT(*) FROM clients_with_multiple_lessons) AS clients_converted_from_trial,
        ((SELECT COUNT(*) FROM clients_with_multiple_lessons)::DECIMAL / NULLIF((SELECT COUNT(*) FROM clients_with_trial), 0) * 100)::DECIMAL(10,2) AS trial_conversion_rate
      FROM client_lessons cl
      LEFT JOIN client_tutors ct ON cl.client_id = ct.client_id
    `;

    const { rows: behavior } = await executeQueryWithRetry(
      () => pool.query(behaviorQuery, queryParams),
      3,
      1000
    );
    
    res.json({ behavior: behavior[0] || {} });
  } catch (error) {
    logger.error({ err: error }, 'Error fetching behavioral analytics:');
    logger.error({ error: error.stack }, 'Error stack:');
    res.status(500).json({ error: 'Failed to fetch behavioral analytics', details: error.message });
  }
}));

// ============================================================================
// TUTOR MANAGEMENT - Enhanced Tutor Functionality
// ============================================================================

// Get comprehensive tutor details (lessons, payment orders, payment history, clients)
router.get('/tutors/:contractorId', asyncHandler(async (req, res) => {
  try {
    const pool = getPool(req);
    const { contractorId } = req.params;

    const cacheKey = `crm:tutor:${contractorId}`;
    const cachedData = await cache.getOrSet(cacheKey, async () => {
      // Fetch tutor basic info from TutorCruncher
      const { tutorCruncherAPI, limitedGet, rateLimitRetry } = global;
      let tutor = null;
      try {
        const fetchContractor = async () => {
          return await limitedGet(`/contractors/${contractorId}/`);
        };
        const response = await rateLimitRetry(fetchContractor);
        tutor = response.data;
      } catch (error) {
        logger.error({ err: error }, 'Error fetching tutor from TutorCruncher:');
        // Continue with database queries even if TutorCruncher fails
      }

      // Define all 4 independent database queries
      const lessonsQuery = `
        SELECT
          a.appointment_id,
          a.start,
          a.finish,
          a.units,
          a.status,
          a.location,
          a.topic,
          s.name AS service_name,
          s.service_id,
          s.labels AS service_labels,
          ARRAY_AGG(
            DISTINCT jsonb_build_object(
              'recipient_id', ar.recipient_id,
              'recipient_name', ar.recipient_name,
              'paying_client_id', ar.paying_client_id,
              'paying_client_name', ar.paying_client_name,
              'charge_rate', ar.charge_rate,
              'status', ar.status
            )
          ) FILTER (WHERE ar.recipient_id IS NOT NULL) AS recipients,
          SUM(ar.charge_rate * a.units) FILTER (WHERE ar.status <> 'missed') AS total_revenue
        FROM appointments a
        JOIN appointment_contractors ac ON a.appointment_id = ac.appointment_id
        LEFT JOIN services s ON a.service_id = s.service_id
        LEFT JOIN appointment_recipients ar ON a.appointment_id = ar.appointment_id
        WHERE ac.contractor_id = $1
          AND a.status IN ('complete', 'cancelled-chargeable', 'cancelled')
        GROUP BY a.appointment_id, a.start, a.finish, a.units, a.status, a.location, a.topic, s.name, s.service_id, s.labels
        ORDER BY a.start DESC
        LIMIT 1000
      `;

      const paymentOrdersQuery = `
        SELECT
          po.id,
          po.display_id,
          po.date_sent,
          po.date_paid,
          po.amount,
          po.status,
          po.url,
          COUNT(DISTINCT poc.appointment_id) AS appointment_count,
          COUNT(DISTINCT poc.adhoc_charge_id) AS adhoc_charge_count
        FROM payment_orders po
        LEFT JOIN payment_order_charges poc ON po.id = poc.payment_order_id
        WHERE po.payee_id = $1
        GROUP BY po.id, po.display_id, po.date_sent, po.date_paid, po.amount, po.status, po.url
        ORDER BY po.date_sent DESC
        LIMIT 500
      `;

      const paymentHistoryQuery = `
        SELECT
          poc.charge_index,
          poc.date,
          poc.amount,
          poc.rate,
          poc.units,
          poc.sales_code,
          poc.tax_amount,
          poc.appointment_id,
          poc.adhoc_charge_id,
          po.id AS payment_order_id,
          po.display_id AS payment_order_display_id,
          po.date_sent AS payment_order_date_sent,
          po.status AS payment_order_status,
          a.start AS appointment_start,
          s.name AS service_name
        FROM payment_order_charges poc
        JOIN payment_orders po ON poc.payment_order_id = po.id
        LEFT JOIN appointments a ON poc.appointment_id = a.appointment_id
        LEFT JOIN services s ON a.service_id = s.service_id
        WHERE po.payee_id = $1
        ORDER BY poc.date DESC, po.date_sent DESC
        LIMIT 1000
      `;

      const clientsQuery = `
        SELECT DISTINCT
          CAST(ar.paying_client_id AS VARCHAR) AS client_id,
          CONCAT(c.first_name, ' ', c.last_name) AS client_name,
          c.email,
          c.first_name,
          c.last_name,
          COUNT(DISTINCT a.appointment_id) AS lesson_count,
          MIN(a.start) AS first_lesson_date,
          MAX(a.start) AS last_lesson_date,
          SUM(CASE WHEN ar.status <> 'missed' THEN ar.charge_rate * a.units ELSE 0 END) AS total_revenue,
          COUNT(DISTINCT ar.recipient_id) AS student_count
        FROM appointment_recipients ar
        JOIN appointments a ON ar.appointment_id = a.appointment_id
        JOIN appointment_contractors ac ON a.appointment_id = ac.appointment_id
        LEFT JOIN clients c ON CAST(ar.paying_client_id AS VARCHAR) = c.client_id
        WHERE ac.contractor_id = $1
          AND a.status IN ('complete', 'cancelled-chargeable')
          AND ar.status <> 'missed'
          AND ar.paying_client_id IS NOT NULL
        GROUP BY ar.paying_client_id, c.first_name, c.last_name, c.email
        ORDER BY last_lesson_date DESC
        LIMIT 500
      `;

      // Execute all 4 database queries in parallel
      const [
        { rows: lessons },
        { rows: paymentOrders },
        { rows: paymentHistory },
        { rows: clients }
      ] = await Promise.all([
        executeQueryWithRetry(() => pool.query(lessonsQuery, [contractorId]), 3, 1000),
        executeQueryWithRetry(() => pool.query(paymentOrdersQuery, [contractorId]), 3, 1000),
        executeQueryWithRetry(() => pool.query(paymentHistoryQuery, [contractorId]), 3, 1000),
        executeQueryWithRetry(() => pool.query(clientsQuery, [contractorId]), 3, 1000)
      ]);

      // Calculate summary statistics
      const totalLessons = lessons.length;
      const totalHours = lessons.reduce((sum, l) => sum + parseFloat(l.units || 0), 0);
      const totalRevenue = lessons.reduce((sum, l) => sum + parseFloat(l.total_revenue || 0), 0);
      const totalPaymentOrders = paymentOrders.length;
      const totalPayments = paymentOrders.reduce((sum, po) => sum + parseFloat(po.amount || 0), 0);
      const uniqueClients = clients.length;
      const completedLessons = lessons.filter(l => l.status === 'complete').length;

      return {
        tutor: tutor || null,
        summary: {
          total_lessons: totalLessons,
          total_hours: parseFloat(totalHours.toFixed(2)),
          total_revenue: parseFloat(totalRevenue.toFixed(2)),
          total_payment_orders: totalPaymentOrders,
          total_payments: parseFloat(totalPayments.toFixed(2)),
          unique_clients: uniqueClients,
          completed_lessons: completedLessons
        },
        lessons: lessons.map(l => ({
          ...l,
          recipients: l.recipients || []
        })),
        paymentOrders: paymentOrders,
        paymentHistory: paymentHistory,
        clients: clients
      };
    }, 60); // 60 second TTL

    res.json(cachedData);
  } catch (error) {
    logger.error({ err: error }, 'Error fetching tutor details:');
    res.status(500).json({ error: 'Failed to fetch tutor details', details: error.message });
  }
}));

// Get tutor analytics
router.post('/analytics/tutor-metrics', asyncHandler(async (req, res) => {
  try {
    const pool = getPool(req);
    const { labels = [], dateRange = { start: '', end: '' } } = req.body;
    
    // Build label filter if provided
    let labelWhereClause = '';
    let queryParams = [];
    if (labels && labels.length > 0) {
      labelWhereClause = `
        AND EXISTS (
          SELECT 1 
          FROM jsonb_array_elements_text(s.labels) AS label(value)
          WHERE label.value = ANY($${queryParams.length + 1})
        )
      `;
      queryParams.push(labels);
    }

    // Build date filter if provided
    let dateWhereClause = '';
    if (dateRange.start && dateRange.end) {
      dateWhereClause = `AND a.start BETWEEN $${queryParams.length + 1} AND $${queryParams.length + 2}`;
      queryParams.push(dateRange.start, dateRange.end);
    }

    const metricsQuery = `
      WITH tutor_lessons AS (
        SELECT 
          ac.contractor_id,
          ac.contractor_name,
          COUNT(DISTINCT a.appointment_id) AS total_lessons,
          COUNT(DISTINCT CASE WHEN a.status = 'complete' THEN a.appointment_id END) AS completed_lessons,
          SUM(CASE WHEN a.status IN ('complete', 'cancelled-chargeable') THEN a.units ELSE 0 END) AS total_hours,
          COUNT(DISTINCT ar.paying_client_id) AS unique_clients,
          COUNT(DISTINCT CASE WHEN a.start >= NOW() - INTERVAL '30 days' THEN ar.paying_client_id END) AS active_clients_30d,
          COUNT(DISTINCT CASE WHEN a.start >= NOW() - INTERVAL '60 days' THEN ar.paying_client_id END) AS active_clients_60d,
          COUNT(DISTINCT CASE WHEN a.start >= NOW() - INTERVAL '90 days' THEN ar.paying_client_id END) AS active_clients_90d,
          SUM(CASE WHEN ar.status <> 'missed' AND a.status IN ('complete', 'cancelled-chargeable') THEN ar.charge_rate * a.units ELSE 0 END) AS total_revenue,
          COUNT(DISTINCT CASE WHEN a.status = 'cancelled' THEN a.appointment_id END) AS cancelled_lessons,
          MIN(CASE WHEN a.status IN ('complete', 'cancelled-chargeable') THEN a.start END) AS first_lesson_date,
          MAX(CASE WHEN a.status IN ('complete', 'cancelled-chargeable') THEN a.start END) AS last_lesson_date
        FROM appointment_contractors ac
        JOIN appointments a ON ac.appointment_id = a.appointment_id
        LEFT JOIN services s ON a.service_id = s.service_id
        LEFT JOIN appointment_recipients ar ON a.appointment_id = ar.appointment_id
        WHERE a.status IN ('complete', 'cancelled-chargeable', 'cancelled')
          AND ar.status <> 'missed'
          ${labelWhereClause}
          ${dateWhereClause}
        GROUP BY ac.contractor_id, ac.contractor_name
      ),
      tutor_client_ltv AS (
        SELECT 
          ac.contractor_id,
          ar.paying_client_id AS client_id,
          SUM(CASE WHEN ar.status <> 'missed' AND a.status IN ('complete', 'cancelled-chargeable') THEN ar.charge_rate * a.units ELSE 0 END) AS client_ltv,
          COUNT(DISTINCT a.appointment_id) AS client_lessons,
          MIN(a.start) AS first_lesson,
          MAX(a.start) AS last_lesson,
          EXTRACT(EPOCH FROM (MAX(a.start) - MIN(a.start))) / 86400 AS client_engagement_days
        FROM appointment_contractors ac
        JOIN appointments a ON ac.appointment_id = a.appointment_id
        LEFT JOIN services s ON a.service_id = s.service_id
        LEFT JOIN appointment_recipients ar ON a.appointment_id = ar.appointment_id
        WHERE a.status IN ('complete', 'cancelled-chargeable')
          AND ar.status <> 'missed'
          AND ar.paying_client_id IS NOT NULL
          ${labelWhereClause}
          ${dateWhereClause}
        GROUP BY ac.contractor_id, ar.paying_client_id
      ),
      tutor_ramp_up AS (
        WITH first_lessons AS (
          SELECT 
            ac.contractor_id,
            MIN(a.start) AS first_lesson_date
          FROM appointment_contractors ac
          JOIN appointments a ON ac.appointment_id = a.appointment_id
          LEFT JOIN services s ON a.service_id = s.service_id
          WHERE a.status IN ('complete', 'cancelled-chargeable')
            ${labelWhereClause}
          GROUP BY ac.contractor_id
        )
        SELECT 
          fl.contractor_id,
          fl.first_lesson_date,
          COUNT(DISTINCT CASE WHEN a.start <= fl.first_lesson_date + INTERVAL '30 days' AND a.status IN ('complete', 'cancelled-chargeable') THEN DATE_TRUNC('week', a.start) END) AS weeks_to_ramp,
          COUNT(DISTINCT CASE WHEN a.start <= fl.first_lesson_date + INTERVAL '30 days' AND a.status IN ('complete', 'cancelled-chargeable') THEN a.appointment_id END) AS lessons_first_30_days,
          COUNT(DISTINCT CASE WHEN a.start <= fl.first_lesson_date + INTERVAL '60 days' AND a.status IN ('complete', 'cancelled-chargeable') THEN a.appointment_id END) AS lessons_first_60_days
        FROM first_lessons fl
        JOIN appointment_contractors ac ON fl.contractor_id = ac.contractor_id
        JOIN appointments a ON ac.appointment_id = a.appointment_id
        LEFT JOIN services s ON a.service_id = s.service_id
        WHERE a.status IN ('complete', 'cancelled-chargeable')
          ${labelWhereClause}
        GROUP BY fl.contractor_id, fl.first_lesson_date
      ),
      tutor_trial_conversion AS (
        SELECT 
          contractor_id,
          COUNT(DISTINCT CASE WHEN client_lessons = 1 THEN client_id END) AS trial_clients,
          COUNT(DISTINCT CASE WHEN client_lessons > 1 THEN client_id END) AS converted_clients
        FROM tutor_client_ltv
        GROUP BY contractor_id
      ),
      tutor_median_ltv AS (
        SELECT 
          contractor_id,
          percentile_cont(0.5) WITHIN GROUP (ORDER BY client_ltv) AS median_client_ltv
        FROM tutor_client_ltv
        GROUP BY contractor_id
      )
      SELECT 
        tl.contractor_id,
        tl.contractor_name,
        tl.total_lessons,
        tl.completed_lessons,
        tl.total_hours,
        tl.unique_clients,
        tl.active_clients_30d,
        tl.active_clients_60d,
        tl.active_clients_90d,
        tl.total_revenue,
        tl.cancelled_lessons,
        tl.first_lesson_date,
        tl.last_lesson_date,
        COALESCE(AVG(tcl.client_ltv), 0) AS avg_client_ltv,
        COALESCE(AVG(tcl.client_engagement_days), 0) AS avg_client_engagement_days,
        COALESCE(MAX(tcl.client_engagement_days), 0) AS max_client_engagement_days,
        COALESCE(tml.median_client_ltv, 0) AS median_client_ltv,
        COALESCE(ru.first_lesson_date, tl.first_lesson_date) AS ramp_start_date,
        COALESCE(ru.lessons_first_30_days, 0) AS lessons_first_30_days,
        COALESCE(ru.lessons_first_60_days, 0) AS lessons_first_60_days,
        CASE 
          WHEN ru.lessons_first_30_days >= 5 THEN TRUE
          ELSE FALSE
        END AS ramped_up_30_days,
        CASE 
          WHEN ru.lessons_first_60_days >= 10 THEN TRUE
          ELSE FALSE
        END AS ramped_up_60_days,
        COALESCE(tc.trial_clients, 0) AS trial_clients,
        COALESCE(tc.converted_clients, 0) AS converted_clients,
        CASE 
          WHEN COALESCE(tc.trial_clients, 0) > 0 
          THEN (COALESCE(tc.converted_clients, 0)::DECIMAL / tc.trial_clients * 100)::DECIMAL(10,2)
          ELSE 0
        END AS trial_conversion_rate,
        CASE 
          WHEN tl.total_lessons > 0 
          THEN (tl.completed_lessons::DECIMAL / tl.total_lessons * 100)::DECIMAL(10,2)
          ELSE 0
        END AS completion_rate
      FROM tutor_lessons tl
      LEFT JOIN tutor_client_ltv tcl ON tl.contractor_id = tcl.contractor_id
      LEFT JOIN tutor_ramp_up ru ON tl.contractor_id = ru.contractor_id
      LEFT JOIN tutor_trial_conversion tc ON tl.contractor_id = tc.contractor_id
      LEFT JOIN tutor_median_ltv tml ON tl.contractor_id = tml.contractor_id
      GROUP BY 
        tl.contractor_id, tl.contractor_name, tl.total_lessons, tl.completed_lessons, 
        tl.total_hours, tl.unique_clients, tl.active_clients_30d, tl.active_clients_60d, 
        tl.active_clients_90d, tl.total_revenue, tl.cancelled_lessons, 
        tl.first_lesson_date, tl.last_lesson_date,
        ru.first_lesson_date, ru.lessons_first_30_days, ru.lessons_first_60_days,
        tc.trial_clients, tc.converted_clients, tml.median_client_ltv
      ORDER BY tl.total_revenue DESC NULLS LAST
    `;

    const { rows: metrics } = await executeQueryWithRetry(
      () => pool.query(metricsQuery, queryParams),
      3,
      1000
    );

    // Calculate aggregate metrics
    const totalTutors = metrics.length;
    const totalRevenue = metrics.reduce((sum, m) => sum + parseFloat(m.total_revenue || 0), 0);
    const avgRevenue = totalTutors > 0 ? totalRevenue / totalTutors : 0;
    const avgLTV = metrics.reduce((sum, m) => sum + parseFloat(m.avg_client_ltv || 0), 0) / totalTutors || 0;
    const rampedUpCount = metrics.filter(m => m.ramped_up_60_days).length;
    const rampedUpPercentage = totalTutors > 0 ? (rampedUpCount / totalTutors * 100) : 0;

    res.json({
      metrics: metrics.map(m => ({
        ...m,
        total_revenue: parseFloat(m.total_revenue || 0),
        avg_client_ltv: parseFloat(m.avg_client_ltv || 0),
        median_client_ltv: parseFloat(m.median_client_ltv || 0),
        avg_client_engagement_days: parseFloat(m.avg_client_engagement_days || 0),
        trial_conversion_rate: parseFloat(m.trial_conversion_rate || 0),
        completion_rate: parseFloat(m.completion_rate || 0)
      })),
      aggregates: {
        total_tutors: totalTutors,
        total_revenue: parseFloat(totalRevenue.toFixed(2)),
        avg_revenue_per_tutor: parseFloat(avgRevenue.toFixed(2)),
        avg_ltv_per_tutor: parseFloat(avgLTV.toFixed(2)),
        ramped_up_count: rampedUpCount,
        ramped_up_percentage: parseFloat(rampedUpPercentage.toFixed(2))
      }
    });
  } catch (error) {
    logger.error({ err: error }, 'Error fetching tutor analytics:');
    res.status(500).json({ error: 'Failed to fetch tutor analytics', details: error.message });
  }
}));

// Get detailed breakdown for a specific tutor metric
router.post('/analytics/tutor-metrics/detail', asyncHandler(async (req, res) => {
  try {
    const pool = getPool(req);
    const { contractorId, metric, labels = [], dateRange = { start: '', end: '' } } = req.body;
    
    if (!contractorId || !metric) {
      return res.status(400).json({ error: 'contractorId and metric are required' });
    }

    // Build label filter if provided
    let labelWhereClause = '';
    let queryParams = [contractorId];
    if (labels && labels.length > 0) {
      labelWhereClause = `
        AND EXISTS (
          SELECT 1 
          FROM jsonb_array_elements_text(s.labels) AS label(value)
          WHERE label.value = ANY($${queryParams.length + 1})
        )
      `;
      queryParams.push(labels);
    }

    // Build date filter if provided
    let dateWhereClause = '';
    if (dateRange.start && dateRange.end) {
      dateWhereClause = `AND a.start BETWEEN $${queryParams.length + 1} AND $${queryParams.length + 2}`;
      queryParams.push(dateRange.start, dateRange.end);
    }

    let detailQuery = '';
    let queryParamsFinal = [];

    switch (metric) {
      case 'total_revenue':
        detailQuery = `
          SELECT 
            a.appointment_id,
            a.start,
            s.name AS service_name,
            CONCAT(c.first_name, ' ', c.last_name) AS client_name,
            ar.recipient_name AS student_name,
            ar.charge_rate,
            a.units,
            (ar.charge_rate * a.units) AS revenue,
            a.status
          FROM appointment_contractors ac
          JOIN appointments a ON ac.appointment_id = a.appointment_id
          LEFT JOIN services s ON a.service_id = s.service_id
          LEFT JOIN appointment_recipients ar ON a.appointment_id = ar.appointment_id
          LEFT JOIN clients c ON CAST(ar.paying_client_id AS VARCHAR) = c.client_id
          WHERE ac.contractor_id = $1
            AND a.status IN ('complete', 'cancelled-chargeable')
            AND ar.status <> 'missed'
            ${labelWhereClause}
            ${dateWhereClause}
          ORDER BY a.start DESC
          LIMIT 1000
        `;
        queryParamsFinal = queryParams;
        break;

      case 'avg_client_ltv':
        detailQuery = `
          SELECT 
            CAST(ar.paying_client_id AS VARCHAR) AS client_id,
            CONCAT(c.first_name, ' ', c.last_name) AS client_name,
            c.email,
            COUNT(DISTINCT a.appointment_id) AS lesson_count,
            SUM(CASE WHEN ar.status <> 'missed' AND a.status IN ('complete', 'cancelled-chargeable') THEN ar.charge_rate * a.units ELSE 0 END) AS client_ltv,
            MIN(a.start) AS first_lesson_date,
            MAX(a.start) AS last_lesson_date,
            COUNT(DISTINCT ar.recipient_id) AS student_count
          FROM appointment_contractors ac
          JOIN appointments a ON ac.appointment_id = a.appointment_id
          LEFT JOIN services s ON a.service_id = s.service_id
          LEFT JOIN appointment_recipients ar ON a.appointment_id = ar.appointment_id
          LEFT JOIN clients c ON CAST(ar.paying_client_id AS VARCHAR) = c.client_id
          WHERE ac.contractor_id = $1
            AND a.status IN ('complete', 'cancelled-chargeable')
            AND ar.status <> 'missed'
            AND ar.paying_client_id IS NOT NULL
            ${labelWhereClause}
            ${dateWhereClause}
          GROUP BY ar.paying_client_id, c.first_name, c.last_name, c.email
          ORDER BY client_ltv DESC
          LIMIT 500
        `;
        queryParamsFinal = queryParams;
        break;

      case 'total_lessons':
        detailQuery = `
          SELECT 
            a.appointment_id,
            a.start,
            a.finish,
            a.units AS duration_hours,
            s.name AS service_name,
            CONCAT(c.first_name, ' ', c.last_name) AS client_name,
            ar.recipient_name AS student_name,
            a.status,
            a.location
          FROM appointment_contractors ac
          JOIN appointments a ON ac.appointment_id = a.appointment_id
          LEFT JOIN services s ON a.service_id = s.service_id
          LEFT JOIN appointment_recipients ar ON a.appointment_id = ar.appointment_id
          LEFT JOIN clients c ON CAST(ar.paying_client_id AS VARCHAR) = c.client_id
          WHERE ac.contractor_id = $1
            AND a.status IN ('complete', 'cancelled-chargeable', 'cancelled')
            ${labelWhereClause}
            ${dateWhereClause}
          ORDER BY a.start DESC
          LIMIT 1000
        `;
        queryParamsFinal = queryParams;
        break;

      case 'unique_clients':
        detailQuery = `
          SELECT DISTINCT
            CAST(ar.paying_client_id AS VARCHAR) AS client_id,
            CONCAT(c.first_name, ' ', c.last_name) AS client_name,
            c.email,
            COUNT(DISTINCT a.appointment_id) AS lesson_count,
            MIN(a.start) AS first_lesson_date,
            MAX(a.start) AS last_lesson_date,
            COUNT(DISTINCT ar.recipient_id) AS student_count
          FROM appointment_contractors ac
          JOIN appointments a ON ac.appointment_id = a.appointment_id
          LEFT JOIN services s ON a.service_id = s.service_id
          LEFT JOIN appointment_recipients ar ON a.appointment_id = ar.appointment_id
          LEFT JOIN clients c ON CAST(ar.paying_client_id AS VARCHAR) = c.client_id
          WHERE ac.contractor_id = $1
            AND a.status IN ('complete', 'cancelled-chargeable', 'cancelled')
            AND ar.status <> 'missed'
            AND ar.paying_client_id IS NOT NULL
            ${labelWhereClause}
            ${dateWhereClause}
          GROUP BY ar.paying_client_id, c.first_name, c.last_name, c.email
          ORDER BY last_lesson_date DESC
          LIMIT 500
        `;
        queryParamsFinal = queryParams;
        break;

      case 'active_clients_30d':
        detailQuery = `
          SELECT DISTINCT
            CAST(ar.paying_client_id AS VARCHAR) AS client_id,
            CONCAT(c.first_name, ' ', c.last_name) AS client_name,
            c.email,
            COUNT(DISTINCT a.appointment_id) AS lesson_count_30d,
            MAX(a.start) AS last_lesson_date,
            COUNT(DISTINCT ar.recipient_id) AS student_count
          FROM appointment_contractors ac
          JOIN appointments a ON ac.appointment_id = a.appointment_id
          LEFT JOIN services s ON a.service_id = s.service_id
          LEFT JOIN appointment_recipients ar ON a.appointment_id = ar.appointment_id
          LEFT JOIN clients c ON CAST(ar.paying_client_id AS VARCHAR) = c.client_id
          WHERE ac.contractor_id = $1
            AND a.status IN ('complete', 'cancelled-chargeable')
            AND ar.status <> 'missed'
            AND ar.paying_client_id IS NOT NULL
            AND a.start >= NOW() - INTERVAL '30 days'
            ${labelWhereClause}
            ${dateWhereClause}
          GROUP BY ar.paying_client_id, c.first_name, c.last_name, c.email
          ORDER BY last_lesson_date DESC
          LIMIT 500
        `;
        queryParamsFinal = queryParams;
        break;

      case 'trial_conversion':
        detailQuery = `
          WITH client_lessons AS (
            SELECT 
              ac.contractor_id,
              ar.paying_client_id AS client_id,
              CONCAT(c.first_name, ' ', c.last_name) AS client_name,
              c.email,
              COUNT(DISTINCT a.appointment_id) AS lesson_count,
              MIN(a.start) AS first_lesson_date,
              MAX(a.start) AS last_lesson_date,
              COUNT(DISTINCT ar.recipient_id) AS student_count
            FROM appointment_contractors ac
            JOIN appointments a ON ac.appointment_id = a.appointment_id
            LEFT JOIN services s ON a.service_id = s.service_id
            LEFT JOIN appointment_recipients ar ON a.appointment_id = ar.appointment_id
            LEFT JOIN clients c ON CAST(ar.paying_client_id AS VARCHAR) = c.client_id
            WHERE ac.contractor_id = $1
              AND a.status IN ('complete', 'cancelled-chargeable')
              AND ar.status <> 'missed'
              AND ar.paying_client_id IS NOT NULL
              ${labelWhereClause}
              ${dateWhereClause}
            GROUP BY ac.contractor_id, ar.paying_client_id, c.first_name, c.last_name, c.email
          )
          SELECT 
            client_id,
            client_name,
            email,
            lesson_count,
            first_lesson_date,
            last_lesson_date,
            student_count,
            CASE WHEN lesson_count = 1 THEN 'Trial' ELSE 'Converted' END AS status
          FROM client_lessons
          ORDER BY 
            CASE WHEN lesson_count = 1 THEN 0 ELSE 1 END,
            last_lesson_date DESC
          LIMIT 500
        `;
        queryParamsFinal = queryParams;
        break;

      case 'ramped_up':
        detailQuery = `
          WITH first_lessons AS (
            SELECT 
              ac.contractor_id,
              MIN(a.start) AS first_lesson_date
            FROM appointment_contractors ac
            JOIN appointments a ON ac.appointment_id = a.appointment_id
            LEFT JOIN services s ON a.service_id = s.service_id
            WHERE ac.contractor_id = $1
              AND a.status IN ('complete', 'cancelled-chargeable')
              ${labelWhereClause}
            GROUP BY ac.contractor_id
          ),
          lessons_by_period AS (
            SELECT 
              fl.contractor_id,
              fl.first_lesson_date,
              COUNT(DISTINCT CASE WHEN a.start <= fl.first_lesson_date + INTERVAL '30 days' AND a.status IN ('complete', 'cancelled-chargeable') THEN a.appointment_id END) AS lessons_first_30_days,
              COUNT(DISTINCT CASE WHEN a.start <= fl.first_lesson_date + INTERVAL '60 days' AND a.status IN ('complete', 'cancelled-chargeable') THEN a.appointment_id END) AS lessons_first_60_days,
              COUNT(DISTINCT CASE WHEN a.start <= fl.first_lesson_date + INTERVAL '90 days' AND a.status IN ('complete', 'cancelled-chargeable') THEN a.appointment_id END) AS lessons_first_90_days
            FROM first_lessons fl
            JOIN appointment_contractors ac ON fl.contractor_id = ac.contractor_id
            JOIN appointments a ON ac.appointment_id = a.appointment_id
            LEFT JOIN services s ON a.service_id = s.service_id
            WHERE a.status IN ('complete', 'cancelled-chargeable')
              ${labelWhereClause}
            GROUP BY fl.contractor_id, fl.first_lesson_date
          )
          SELECT 
            contractor_id,
            first_lesson_date,
            lessons_first_30_days,
            lessons_first_60_days,
            lessons_first_90_days,
            CASE WHEN lessons_first_30_days >= 5 THEN 'Ramped (30d)' WHEN lessons_first_60_days >= 10 THEN 'Ramped (60d)' ELSE 'Not Ramped' END AS ramp_status
          FROM lessons_by_period
          LIMIT 100
        `;
        queryParamsFinal = queryParams;
        break;

      default:
        return res.status(400).json({ error: 'Unknown metric' });
    }

    const { rows } = await executeQueryWithRetry(
      () => pool.query(detailQuery, queryParamsFinal),
      3,
      1000
    );

    res.json({
      metric,
      contractorId,
      rows: rows || [],
      total: rows?.length || 0
    });
  } catch (error) {
    logger.error({ err: error }, 'Error fetching tutor metric detail:');
    res.status(500).json({ error: 'Failed to fetch metric detail', details: error.message });
  }
}));

// Debug catch-all to see unmatched routes
router.use((req, res, next) => {
  logger.info('⚠️ [api-crm] Unmatched route in CRM router: ${req.method} ${req.path}');
  next(); // Let Express 404 handler take over
});

module.exports = router;
