const express = require('express');
const router = express.Router();
const NodeCache = require('node-cache');
const { getOrSet, generateKey, clearCacheByPrefix } = require('../utils/cache');
const { tableExists } = require('../utils/schema-cache');
const { logger } = require('../utils/logger');

// Import auth middleware - must be at the top before routes
const { requireAuth } = require('../middleware/auth');
const auth = global.auth || requireAuth;

// Initialize cache for calendar events (5 minute TTL)
const calendarCache = new NodeCache({
  stdTTL: 300, // 5 minutes
  checkperiod: 60, // Check for expired keys every 60 seconds
  useClones: false // Faster, but be careful with mutations
});

const { getLocationPool } = require('../utils/pool');
const { asyncHandler } = require('../middleware/error-handler');

// Invalidate entity-list caches on any write operation (POST/PUT/PATCH/DELETE)
router.use((req, res, next) => {
  if (req.method !== 'GET' && req.method !== 'HEAD' && req.method !== 'OPTIONS') {
    const originalJson = res.json.bind(res);
    res.json = function (body) {
      if (res.statusCode >= 200 && res.statusCode < 300) {
        // Clear all entity list caches since writes may affect any list
        Promise.all([
          clearCacheByPrefix('entity:tutors'),
          clearCacheByPrefix('entity:clients'),
          clearCacheByPrefix('entity:schools')
        ]).catch(() => {});
      }
      return originalJson(body);
    };
  }
  next();
});

// GET /api/entity-lists/tutors - List tutors with search and filters
router.get('/tutors', auth, asyncHandler(async (req, res) => {
  try {
    const pool = getLocationPool(req);
    if (!pool) {
      logger.error('No database pool available');
      return res.status(500).json({ error: 'Database connection not available' });
    }

    const cacheKey = generateKey('entity:tutors', req.query);
    const cachedResult = await getOrSet(cacheKey, async () => {
    
    const { 
      search, 
      status, 
      label, 
      labels, // Array of labels (comma-separated)
      town,
      zipcode,
      created_after,
      created_before,
      address,
      radius,
      tier_rate,
      preferred_teaching_area,
      page = 1, 
      limit = 50 
    } = req.query;
    
    let query = `
      SELECT 
        contractor_id,
        first_name,
        last_name,
        email,
        mobile,
        phone,
        status,
        default_rate,
        labels,
        town,
        postcode,
        street,
        date_created,
        updated_at,
        extra_attrs
      FROM contractors
      WHERE 1=1
    `;
    
    const params = [];
    let paramCount = 0;
    
    if (search && typeof search === 'string' && search.trim().length > 0) {
      // Split search term by spaces to handle full names (e.g., "ana moioli")
      const searchTerms = search.trim().split(/\s+/).filter(term => term.length > 0);
      if (searchTerms.length > 1) {
        // Multiple words: search each word separately (e.g., "ana" AND "moioli")
        // This allows matching "Ana Moioli" when searching "ana moioli"
        const searchConditions = searchTerms.map((term) => {
          paramCount++;
          params.push(`%${term}%`);
          return `(first_name ILIKE $${paramCount} OR last_name ILIKE $${paramCount})`;
        }).join(' AND ');
        paramCount++;
        params.push(`%${search}%`); // Also search full term in email
        query += ` AND (${searchConditions} OR email ILIKE $${paramCount})`;
      } else if (searchTerms.length === 1) {
        // Single word: search in first_name, last_name, or email
        paramCount++;
        query += ` AND (
          first_name ILIKE $${paramCount} OR
          last_name ILIKE $${paramCount} OR
          email ILIKE $${paramCount}
        )`;
        params.push(`%${searchTerms[0]}%`);
      }
      // If searchTerms.length === 0, skip (shouldn't happen due to filter, but safe)
    }
    
    if (status) {
      paramCount++;
      query += ` AND status = $${paramCount}`;
      params.push(status);
    }
    
    // Handle multiple labels (checkbox-group)
    if (labels) {
      const labelArray = Array.isArray(labels) ? labels : labels.split(',');
      if (labelArray.length > 0) {
        const labelConditions = labelArray.map((label, idx) => {
          paramCount++;
          params.push(`%${label}%`);
          return `label_elem::text ILIKE $${paramCount}`;
        }).join(' OR ');
        query += ` AND (
          EXISTS (
            SELECT 1 FROM jsonb_array_elements(labels) AS label_elem
            WHERE ${labelConditions}
          )
        )`;
      }
    } else if (label) {
      // Single label filter (backward compatibility)
      paramCount++;
      query += ` AND EXISTS (
        SELECT 1 FROM jsonb_array_elements_text(labels) AS label_elem
        WHERE label_elem ILIKE $${paramCount}
      )`;
      params.push(`%${label}%`);
    }
    
    if (town) {
      paramCount++;
      query += ` AND town ILIKE $${paramCount}`;
      params.push(`%${town}%`);
    }
    
    if (zipcode) {
      paramCount++;
      query += ` AND postcode ILIKE $${paramCount}`;
      params.push(`%${zipcode}%`);
    }
    
    if (created_after) {
      paramCount++;
      query += ` AND date_created >= $${paramCount}`;
      params.push(created_after);
    }
    
    if (created_before) {
      paramCount++;
      query += ` AND date_created <= $${paramCount}`;
      params.push(created_before);
    }
    
    // Custom fields from extra_attrs
    if (tier_rate) {
      paramCount++;
      query += ` AND extra_attrs->>'tier_rate' ILIKE $${paramCount}`;
      params.push(`%${tier_rate}%`);
    }
    
    if (preferred_teaching_area) {
      paramCount++;
      query += ` AND extra_attrs->>'preferred_teaching_area' ILIKE $${paramCount}`;
      params.push(`%${preferred_teaching_area}%`);
    }
    
    query += ` ORDER BY last_name, first_name`;
    
    const offset = (parseInt(page) - 1) * parseInt(limit);
    paramCount++;
    query += ` LIMIT $${paramCount}`;
    params.push(parseInt(limit));
    
    paramCount++;
    query += ` OFFSET $${paramCount}`;
    params.push(offset);
    
    const { rows } = await pool.query(query, params);
    
    // Get total count
    let countQuery = `SELECT COUNT(*) as total FROM contractors WHERE 1=1`;
    const countParams = [];
    let countParamCount = 0;
    
    if (search && typeof search === 'string' && search.trim().length > 0) {
      // Split search term by spaces to handle full names (e.g., "ana moioli")
      const searchTerms = search.trim().split(/\s+/).filter(term => term.length > 0);
      if (searchTerms.length > 1) {
        // Multiple words: search each word separately (e.g., "ana" AND "moioli")
        const searchConditions = searchTerms.map((term) => {
          countParamCount++;
          countParams.push(`%${term}%`);
          return `(first_name ILIKE $${countParamCount} OR last_name ILIKE $${countParamCount})`;
        }).join(' AND ');
        countParamCount++;
        countParams.push(`%${search}%`); // Also search full term in email
        countQuery += ` AND (${searchConditions} OR email ILIKE $${countParamCount})`;
      } else if (searchTerms.length === 1) {
        // Single word: search in first_name, last_name, or email
        countParamCount++;
        countQuery += ` AND (
          first_name ILIKE $${countParamCount} OR
          last_name ILIKE $${countParamCount} OR
          email ILIKE $${countParamCount}
        )`;
        countParams.push(`%${searchTerms[0]}%`);
      }
      // If searchTerms.length === 0, skip (shouldn't happen due to filter, but safe)
    }
    
    if (status) {
      countParamCount++;
      countQuery += ` AND status = $${countParamCount}`;
      countParams.push(status);
    }
    
    // Handle multiple labels in count query
    if (labels) {
      const labelArray = Array.isArray(labels) ? labels : labels.split(',');
      if (labelArray.length > 0) {
        const labelConditions = labelArray.map((label, idx) => {
          countParamCount++;
          countParams.push(`%${label}%`);
          return `label_elem::text ILIKE $${countParamCount}`;
        }).join(' OR ');
        countQuery += ` AND (
          EXISTS (
            SELECT 1 FROM jsonb_array_elements(labels) AS label_elem
            WHERE ${labelConditions}
          )
        )`;
      }
    } else if (label) {
      countParamCount++;
      countQuery += ` AND EXISTS (
        SELECT 1 FROM jsonb_array_elements_text(labels) AS label_elem
        WHERE label_elem ILIKE $${countParamCount}
      )`;
      countParams.push(`%${label}%`);
    }
    
    // Add other filters to count query
    if (town) {
      countParamCount++;
      countQuery += ` AND town ILIKE $${countParamCount}`;
      countParams.push(`%${town}%`);
    }
    
    if (zipcode) {
      countParamCount++;
      countQuery += ` AND postcode ILIKE $${countParamCount}`;
      countParams.push(`%${zipcode}%`);
    }
    
    if (created_after) {
      countParamCount++;
      countQuery += ` AND date_created >= $${countParamCount}`;
      countParams.push(created_after);
    }
    
    if (created_before) {
      countParamCount++;
      countQuery += ` AND date_created <= $${countParamCount}`;
      countParams.push(created_before);
    }
    
    if (tier_rate) {
      countParamCount++;
      countQuery += ` AND extra_attrs->>'tier_rate' ILIKE $${countParamCount}`;
      countParams.push(`%${tier_rate}%`);
    }
    
    if (preferred_teaching_area) {
      countParamCount++;
      countQuery += ` AND extra_attrs->>'preferred_teaching_area' ILIKE $${countParamCount}`;
      countParams.push(`%${preferred_teaching_area}%`);
    }
    
    const { rows: countRows } = await pool.query(countQuery, countParams);
    const total = parseInt(countRows[0].total);
    
    // Get counts for each status tab
    const statusCounts = {};
    const statuses = ['pending', 'approved', 'rejected', 'dormant', 'inactive'];
    
    try {
      for (const status of statuses) {
        const countResult = await pool.query(
          `SELECT COUNT(*) as count FROM contractors WHERE status = $1`,
          [status]
        );
        statusCounts[status] = parseInt(countResult.rows[0].count);
      }
      // Total count (all statuses)
      statusCounts.all = total;
    } catch (countError) {
      logger.error({ err: countError }, 'Error fetching status counts:');
      // Continue without counts if there's an error
    }
    
    return {
      tutors: rows,
      pagination: {
        page: parseInt(page),
        limit: parseInt(limit),
        total,
        totalPages: Math.ceil(total / parseInt(limit))
      },
      tabCounts: statusCounts
    };
    }, 60); // 60 second TTL

    res.json(cachedResult);
  } catch (error) {
    logger.error({ err: error }, 'Error fetching tutors list:');
    logger.error({ error: error.message }, 'Error message:');
    logger.error({ error: error.stack }, 'Error stack:');
    res.status(500).json({
      error: 'Failed to fetch tutors list',
      details: process.env.NODE_ENV === 'development' ? error.message : undefined,
      stack: process.env.NODE_ENV === 'development' ? error.stack : undefined
    });
  }
}));

// GET /api/entity-lists/clients - List clients with search and filters
router.get('/clients', auth, asyncHandler(async (req, res) => {
  try {
    const pool = getLocationPool(req);

    const cacheKey = generateKey('entity:clients', req.query);
    const cachedResult = await getOrSet(cacheKey, async () => {
    const { 
      search, 
      status, 
      label, 
      labels, // Array of labels (comma-separated)
      pipeline_stage,
      town,
      zipcode,
      created_after,
      created_before,
      consent,
      address,
      radius,
      off_season_address,
      event_name,
      page = 1, 
      limit = 50 
    } = req.query;
    
    let query = `
      SELECT 
        client_id,
        first_name,
        last_name,
        email,
        mobile,
        phone,
        status,
        pipeline_stage_name,
        invoice_balance,
        available_balance,
        labels,
        town,
        postcode,
        street,
        tc_created_at,
        extra_attrs
      FROM clients
      WHERE 1=1
    `;
    
    const params = [];
    let paramCount = 0;
    
    if (search && typeof search === 'string' && search.trim().length > 0) {
      // Split search term by spaces to handle full names (e.g., "ana moioli")
      const searchTerms = search.trim().split(/\s+/).filter(term => term.length > 0);
      if (searchTerms.length > 1) {
        // Multiple words: search each word separately (e.g., "ana" AND "moioli")
        // This allows matching "Ana Moioli" when searching "ana moioli"
        const searchConditions = searchTerms.map((term, idx) => {
          paramCount++;
          params.push(`%${term}%`);
          return `(first_name ILIKE $${paramCount} OR last_name ILIKE $${paramCount})`;
        }).join(' AND ');
        paramCount++;
        params.push(`%${search}%`); // Also search full term in email
        query += ` AND (${searchConditions} OR email ILIKE $${paramCount})`;
      } else {
        // Single word: search in first_name, last_name, or email
        paramCount++;
        query += ` AND (
          first_name ILIKE $${paramCount} OR
          last_name ILIKE $${paramCount} OR
          email ILIKE $${paramCount}
        )`;
        params.push(`%${search}%`);
      }
    }
    
    if (status) {
      paramCount++;
      query += ` AND status = $${paramCount}`;
      params.push(status);
    }
    
    if (pipeline_stage) {
      paramCount++;
      query += ` AND pipeline_stage_name = $${paramCount}`;
      params.push(pipeline_stage);
    }
    
    // Handle multiple labels (checkbox-group)
    if (labels) {
      const labelArray = Array.isArray(labels) ? labels : labels.split(',');
      if (labelArray.length > 0) {
        const labelConditions = labelArray.map((label, idx) => {
          paramCount++;
          params.push(`%${label}%`);
          return `label_elem::text ILIKE $${paramCount}`;
        }).join(' OR ');
        query += ` AND (
          EXISTS (
            SELECT 1 FROM jsonb_array_elements(labels) AS label_elem
            WHERE ${labelConditions}
          )
        )`;
      }
    } else if (label) {
      // Single label filter (backward compatibility)
      paramCount++;
      query += ` AND EXISTS (
        SELECT 1 FROM jsonb_array_elements_text(labels) AS label_elem
        WHERE label_elem ILIKE $${paramCount}
      )`;
      params.push(`%${label}%`);
    }
    
    if (town) {
      paramCount++;
      query += ` AND town ILIKE $${paramCount}`;
      params.push(`%${town}%`);
    }
    
    if (zipcode) {
      paramCount++;
      query += ` AND postcode ILIKE $${paramCount}`;
      params.push(`%${zipcode}%`);
    }
    
    if (created_after) {
      paramCount++;
      query += ` AND tc_created_at >= $${paramCount}`;
      params.push(created_after);
    }
    
    if (created_before) {
      paramCount++;
      query += ` AND tc_created_at <= $${paramCount}`;
      params.push(created_before);
    }
    
    // Custom fields from extra_attrs
    if (off_season_address) {
      paramCount++;
      query += ` AND extra_attrs->>'off_season_address' ILIKE $${paramCount}`;
      params.push(`%${off_season_address}%`);
    }
    
    if (event_name) {
      paramCount++;
      query += ` AND extra_attrs->>'event_name' ILIKE $${paramCount}`;
      params.push(`%${event_name}%`);
    }
    
    query += ` ORDER BY last_name, first_name`;
    
    const offset = (parseInt(page) - 1) * parseInt(limit);
    paramCount++;
    query += ` LIMIT $${paramCount}`;
    params.push(parseInt(limit));
    
    paramCount++;
    query += ` OFFSET $${paramCount}`;
    params.push(offset);
    
    const { rows } = await pool.query(query, params);
    
    // Get total count
    let countQuery = `SELECT COUNT(*) as total FROM clients WHERE 1=1`;
    const countParams = [];
    let countParamCount = 0;
    
    if (search && typeof search === 'string' && search.trim().length > 0) {
      // Split search term by spaces to handle full names (e.g., "ana moioli")
      const searchTerms = search.trim().split(/\s+/).filter(term => term.length > 0);
      if (searchTerms.length > 1) {
        // Multiple words: search each word separately (e.g., "ana" AND "moioli")
        const searchConditions = searchTerms.map((term) => {
          countParamCount++;
          countParams.push(`%${term}%`);
          return `(first_name ILIKE $${countParamCount} OR last_name ILIKE $${countParamCount})`;
        }).join(' AND ');
        countParamCount++;
        countParams.push(`%${search}%`); // Also search full term in email
        countQuery += ` AND (${searchConditions} OR email ILIKE $${countParamCount})`;
      } else if (searchTerms.length === 1) {
        // Single word: search in first_name, last_name, or email
        countParamCount++;
        countQuery += ` AND (
          first_name ILIKE $${countParamCount} OR
          last_name ILIKE $${countParamCount} OR
          email ILIKE $${countParamCount}
        )`;
        countParams.push(`%${searchTerms[0]}%`);
      }
      // If searchTerms.length === 0, skip (shouldn't happen due to filter, but safe)
    }
    
    if (status) {
      countParamCount++;
      countQuery += ` AND status = $${countParamCount}`;
      countParams.push(status);
    }
    
    if (pipeline_stage) {
      countParamCount++;
      countQuery += ` AND pipeline_stage_name = $${countParamCount}`;
      countParams.push(pipeline_stage);
    }
    
    // Handle multiple labels in count query
    if (labels) {
      const labelArray = Array.isArray(labels) ? labels : labels.split(',');
      if (labelArray.length > 0) {
        const labelConditions = labelArray.map((label, idx) => {
          countParamCount++;
          countParams.push(`%${label}%`);
          return `label_elem::text ILIKE $${countParamCount}`;
        }).join(' OR ');
        countQuery += ` AND (
          EXISTS (
            SELECT 1 FROM jsonb_array_elements(labels) AS label_elem
            WHERE ${labelConditions}
          )
        )`;
      }
    } else if (label) {
      countParamCount++;
      countQuery += ` AND EXISTS (
        SELECT 1 FROM jsonb_array_elements_text(labels) AS label_elem
        WHERE label_elem ILIKE $${countParamCount}
      )`;
      countParams.push(`%${label}%`);
    }
    
    // Add other filters to count query
    if (town) {
      countParamCount++;
      countQuery += ` AND town ILIKE $${countParamCount}`;
      countParams.push(`%${town}%`);
    }
    
    if (zipcode) {
      countParamCount++;
      countQuery += ` AND postcode ILIKE $${countParamCount}`;
      countParams.push(`%${zipcode}%`);
    }
    
    if (created_after) {
      countParamCount++;
      countQuery += ` AND tc_created_at >= $${countParamCount}`;
      countParams.push(created_after);
    }
    
    if (created_before) {
      countParamCount++;
      countQuery += ` AND tc_created_at <= $${countParamCount}`;
      countParams.push(created_before);
    }
    
    if (off_season_address) {
      countParamCount++;
      countQuery += ` AND extra_attrs->>'off_season_address' ILIKE $${countParamCount}`;
      countParams.push(`%${off_season_address}%`);
    }
    
    if (event_name) {
      countParamCount++;
      countQuery += ` AND extra_attrs->>'event_name' ILIKE $${countParamCount}`;
      countParams.push(`%${event_name}%`);
    }
    
    const { rows: countRows } = await pool.query(countQuery, countParams);
    const total = parseInt(countRows[0].total);
    
    // Get counts for each status tab
    let tabCounts = { all: total };
    try {
      const statusCountsQuery = `
        SELECT 
          status,
          COUNT(*) as count
        FROM clients
        GROUP BY status
      `;
      const { rows: statusRows } = await pool.query(statusCountsQuery);
      statusRows.forEach(row => {
        tabCounts[row.status] = parseInt(row.count);
      });
    } catch (countError) {
      logger.error({ err: countError }, 'Error fetching status counts:');
    }
    
    return {
      clients: rows,
      pagination: {
        page: parseInt(page),
        limit: parseInt(limit),
        total,
        totalPages: Math.ceil(total / parseInt(limit))
      },
      tabCounts
    };
    }, 60); // 60 second TTL

    res.json(cachedResult);
  } catch (error) {
    logger.error({ err: error }, 'Error fetching clients list:');
    res.status(500).json({ error: 'Failed to fetch clients list' });
  }
}));

// GET /api/entity-lists/schools - List schools with search and filters
router.get('/schools', auth, asyncHandler(async (req, res) => {
  try {
    const pool = getLocationPool(req);
    if (!pool) {
      return res.status(500).json({ error: 'Database connection not available' });
    }

    const cacheKey = generateKey('entity:schools', req.query);
    const cachedResult = await getOrSet(cacheKey, async () => {

    const {
      search,
      status, // active, paused, dormant
      location, // NYC, LA, SF, Hamptons, 'Eastside', Westside
      health, // healthy, needs_attention, unhealthy
      billing_model, // per_lesson, per_student, monthly_billing, term_billing, invoice_school_paid
      sort = 'name', // name, health, status, location
      sort_dir = 'asc', // asc, desc
      page = 1,
      limit = 50
    } = req.query;

    // All school labels to look for
    const schoolLabels = ['School - NYC', 'School - LA', 'School - SF', 'School - Hamptons', 'School - Eastside', 'School - Westside'];

    // Single query that computes all school data using JOINs instead of correlated subqueries.
    // The expensive base CTEs run once; we get all rows then filter/paginate/count in JS.
    const query = `
      WITH school_services AS (
        SELECT DISTINCT
          s.service_id,
          s.name AS service_name,
          s.labels AS service_labels,
          s.dft_charge_type,
          s.updated_at,
          (SELECT label
           FROM jsonb_array_elements_text(s.labels) AS label
           WHERE label LIKE 'School - %'
           LIMIT 1
          ) AS school_label
        FROM services s
        WHERE EXISTS (
          SELECT 1
          FROM jsonb_array_elements_text(s.labels) AS label
          WHERE label = ANY($1::text[])
        )
        AND s.is_deleted IS NOT TRUE
      ),
      school_groups AS (
        SELECT
          SPLIT_PART(ss.service_name, ' // ', 1) AS school_name,
          ss.school_label,
          REPLACE(ss.school_label, 'School - ', '') AS location,
          array_agg(DISTINCT ss.service_id) AS service_ids,
          COUNT(DISTINCT ss.service_id) AS job_count,
          MAX(ss.updated_at) AS last_activity
        FROM school_services ss
        WHERE ss.school_label IS NOT NULL
        GROUP BY SPLIT_PART(ss.service_name, ' // ', 1), ss.school_label
      ),
      -- Unnest service_ids for efficient JOIN-based aggregation
      school_service_map AS (
        SELECT sg.school_name, sg.school_label, unnest(sg.service_ids) AS service_id
        FROM school_groups sg
      ),
      -- Pre-aggregate revenue per service (recipients only - no cartesian product)
      service_revenue AS (
        SELECT a.service_id,
          COUNT(DISTINCT a.appointment_id) AS lesson_count,
          COALESCE(SUM(ar.charge_rate), 0) AS total_revenue
        FROM appointments a
        LEFT JOIN appointment_recipients ar ON a.appointment_id = ar.appointment_id
        WHERE a.status IN ('complete', 'awaiting-report') AND a.is_deleted IS NOT TRUE
        GROUP BY a.service_id
      ),
      -- Pre-aggregate cost per service (contractors only - separate to avoid cartesian product)
      service_cost AS (
        SELECT a.service_id,
          COALESCE(SUM(ac.pay_rate), 0) AS total_cost
        FROM appointments a
        LEFT JOIN appointment_contractors ac ON a.appointment_id = ac.appointment_id
        WHERE a.status IN ('complete', 'awaiting-report') AND a.is_deleted IS NOT TRUE
        GROUP BY a.service_id
      ),
      -- Combined metrics without cartesian product
      completed_appt_metrics AS (
        SELECT sr.service_id, sr.lesson_count, sr.total_revenue,
          COALESCE(sc.total_cost, 0) AS total_cost
        FROM service_revenue sr
        LEFT JOIN service_cost sc ON sc.service_id = sr.service_id
      ),
      -- Pre-aggregate student counts per service
      student_metrics AS (
        SELECT
          a.service_id,
          COUNT(DISTINCT ar.recipient_id) AS student_count
        FROM appointments a
        JOIN appointment_recipients ar ON a.appointment_id = ar.appointment_id
        WHERE ar.status != 'missed'
          AND a.is_deleted IS NOT TRUE
        GROUP BY a.service_id
      ),
      -- Pre-aggregate tutor names per service (last 60 days)
      tutor_info AS (
        SELECT
          a.service_id,
          STRING_AGG(DISTINCT c.first_name || ' ' || COALESCE(c.last_name, ''), ', ') AS tutor_names
        FROM appointments a
        JOIN appointment_contractors ac ON a.appointment_id = ac.appointment_id
        JOIN contractors c ON ac.contractor_id::text = c.contractor_id::text
        WHERE a.start > NOW() - INTERVAL '60 days'
          AND a.status NOT IN ('cancelled', 'cancelled-no-charge')
          AND a.is_deleted IS NOT TRUE
        GROUP BY a.service_id
      ),
      -- Pre-aggregate lesson days per service (future appointments)
      lesson_day_info AS (
        SELECT
          a.service_id,
          STRING_AGG(DISTINCT TO_CHAR(a.start, 'Dy'), ', ') AS lesson_days
        FROM appointments a
        WHERE a.start > NOW()
          AND a.status NOT IN ('cancelled', 'cancelled-no-charge')
          AND a.is_deleted IS NOT TRUE
        GROUP BY a.service_id
      ),
      -- Determine active status per service
      active_service_info AS (
        SELECT
          s.service_id,
          CASE
            WHEN NOT (
              EXISTS (
                SELECT 1 FROM jsonb_array_elements(s.labels) AS label
                WHERE label->>'name' ILIKE '%Job Finished%'
              ) OR EXISTS (
                SELECT 1 FROM jsonb_array_elements_text(s.labels) AS label
                WHERE label ILIKE '%Job Finished%'
              )
            )
            AND EXISTS (
              SELECT 1 FROM appointments a2
              WHERE a2.service_id = s.service_id
                AND a2.start > NOW() - INTERVAL '30 days'
                AND a2.status NOT IN ('cancelled', 'cancelled-no-charge')
            )
            THEN true
            ELSE false
          END AS is_active,
          s.dft_charge_type
        FROM services s
        WHERE s.is_deleted IS NOT TRUE
      ),
      -- Get paying client info per service (single scan)
      paying_client_info AS (
        SELECT DISTINCT ON (a.service_id)
          a.service_id,
          c.client_id::text AS client_id,
          c.email,
          c.first_name || ' ' || COALESCE(c.last_name, '') AS client_name
        FROM appointments a
        JOIN appointment_recipients ar ON a.appointment_id = ar.appointment_id
        JOIN clients c ON ar.paying_client_id::text = c.client_id::text
        WHERE a.is_deleted IS NOT TRUE
        ORDER BY a.service_id, a.start DESC
      ),
      -- Pre-aggregate all metrics by school using school_service_map JOINs (avoids LATERAL)
      school_revenue_agg AS (
        SELECT ssm.school_name, ssm.school_label,
          SUM(cam.total_revenue) AS total_revenue, SUM(cam.total_cost) AS total_cost, SUM(cam.lesson_count) AS lesson_count
        FROM school_service_map ssm
        JOIN completed_appt_metrics cam ON cam.service_id = ssm.service_id
        GROUP BY ssm.school_name, ssm.school_label
      ),
      school_student_agg AS (
        SELECT ssm.school_name, ssm.school_label, SUM(sm3.student_count) AS student_count
        FROM school_service_map ssm
        JOIN student_metrics sm3 ON sm3.service_id = ssm.service_id
        GROUP BY ssm.school_name, ssm.school_label
      ),
      school_tutor_agg AS (
        SELECT ssm.school_name, ssm.school_label, STRING_AGG(DISTINCT ti2.tutor_names, ', ') AS tutor_names
        FROM school_service_map ssm
        JOIN tutor_info ti2 ON ti2.service_id = ssm.service_id
        GROUP BY ssm.school_name, ssm.school_label
      ),
      school_lesson_day_agg AS (
        SELECT ssm.school_name, ssm.school_label, STRING_AGG(DISTINCT ldi2.lesson_days, ', ') AS lesson_days
        FROM school_service_map ssm
        JOIN lesson_day_info ldi2 ON ldi2.service_id = ssm.service_id
        GROUP BY ssm.school_name, ssm.school_label
      ),
      school_active_agg AS (
        SELECT ssm.school_name, ssm.school_label,
          bool_or(asi2.is_active) AS has_active,
          bool_or(asi2.dft_charge_type IN ('hourly', 'one-off')) AS has_hourly
        FROM school_service_map ssm
        JOIN active_service_info asi2 ON asi2.service_id = ssm.service_id
        GROUP BY ssm.school_name, ssm.school_label
      ),
      school_client_agg AS (
        SELECT DISTINCT ON (ssm.school_name, ssm.school_label)
          ssm.school_name, ssm.school_label, pci.client_id, pci.email
        FROM school_service_map ssm
        JOIN paying_client_info pci ON pci.service_id = ssm.service_id
        GROUP BY ssm.school_name, ssm.school_label, pci.client_id, pci.email
        ORDER BY ssm.school_name, ssm.school_label
      ),
      -- Invoice data per paying client for health status calculation
      school_invoice_agg AS (
        SELECT
          i.client_id::text,
          COUNT(*) FILTER (WHERE i.status = 'unpaid' AND i.date_sent < NOW() - INTERVAL '30 days') AS late_count,
          MAX(CASE
            WHEN i.status = 'unpaid' AND i.date_sent IS NOT NULL THEN EXTRACT(EPOCH FROM (NOW() - i.date_sent)) / 86400
            ELSE NULL
          END) AS max_days_outstanding_unpaid
        FROM invoices i
        GROUP BY i.client_id::text
      ),
      school_metrics AS (
        SELECT
          sg.school_name,
          sg.school_label,
          sg.location,
          sg.job_count,
          sg.last_activity,
          sca.client_id,
          sca.email,
          COALESCE(sra.total_revenue, 0) AS total_revenue,
          COALESCE(sra.total_cost, 0) AS total_cost,
          COALESCE(ssa.student_count, 0) AS student_count,
          COALESCE(sra.lesson_count, 0) AS lesson_count,
          sta.tutor_names,
          slda.lesson_days,
          COALESCE(saa.has_active, false) AS is_active,
          COALESCE(sia.late_count, 0) AS late_count,
          COALESCE(sia.max_days_outstanding_unpaid, 0) AS max_days_outstanding_unpaid,
          CASE
            WHEN COALESCE(saa.has_hourly, false) THEN 'per_lesson'
            ELSE 'per_student'
          END AS billing_model
        FROM school_groups sg
        LEFT JOIN school_revenue_agg sra ON sra.school_name = sg.school_name AND sra.school_label = sg.school_label
        LEFT JOIN school_student_agg ssa ON ssa.school_name = sg.school_name AND ssa.school_label = sg.school_label
        LEFT JOIN school_tutor_agg sta ON sta.school_name = sg.school_name AND sta.school_label = sg.school_label
        LEFT JOIN school_lesson_day_agg slda ON slda.school_name = sg.school_name AND slda.school_label = sg.school_label
        LEFT JOIN school_active_agg saa ON saa.school_name = sg.school_name AND saa.school_label = sg.school_label
        LEFT JOIN school_client_agg sca ON sca.school_name = sg.school_name AND sca.school_label = sg.school_label
        LEFT JOIN school_invoice_agg sia ON sia.client_id = sca.client_id
      )
      SELECT
        sm.school_name AS name,
        COALESCE(sm.client_id, 'SCHOOL_' || md5(sm.school_name)) AS "clientId",
        sm.email,
        sm.school_label AS "schoolLabel",
        sm.location,
        sm.is_active AS "isActive",
        sm.total_revenue AS "totalRevenue",
        sm.total_cost AS "totalCost",
        (sm.total_revenue - sm.total_cost) AS "totalMargin",
        CASE
          WHEN sm.total_revenue > 0 THEN ROUND(((sm.total_revenue - sm.total_cost) / sm.total_revenue * 100)::numeric, 1)
          ELSE 0
        END AS "marginPercent",
        sm.student_count AS "totalStudents",
        sm.lesson_count AS "totalLessons",
        sm.job_count AS "jobCount",
        sm.billing_model AS "billingModel",
        sm.last_activity AS "lastActivity",
        sm.tutor_names AS "tutorNames",
        COALESCE(sm.lesson_days, sts.lesson_days, smd.default_lesson_day) AS "lessonDays",
        sts.contract_value AS "contractValue",
        sts.school_confirmed AS "schoolConfirmed",
        sts.tutor_assigned AS "tutorAssigned",
        sts.contract_signed AS "contractSigned",
        sts.job_created AS "jobCreated",
        sts.roster_connected AS "rosterConnected",
        sts.sessions_count AS "sessionsCount",
        smd.school_type AS "schoolType",
        smd.payment_method AS "paymentMethod",
        CASE
          WHEN sts.roster_connected AND sts.job_created AND sts.contract_signed AND sts.tutor_assigned AND sts.school_confirmed THEN 'complete'
          WHEN sts.job_created THEN 'setup'
          WHEN sts.contract_signed THEN 'contracted'
          WHEN sts.school_confirmed THEN 'confirmed'
          ELSE 'pending'
        END AS "termStatus",
        CASE
          WHEN sm.late_count > 0 OR sm.max_days_outstanding_unpaid > 30 THEN 'unhealthy'
          WHEN sm.total_revenue > 0 AND ((sm.total_revenue - sm.total_cost) / sm.total_revenue) < 0.10 THEN 'unhealthy'
          WHEN sm.total_revenue > 0 AND ((sm.total_revenue - sm.total_cost) / sm.total_revenue) < 0.20 THEN 'needs_attention'
          WHEN sm.total_revenue > 0 AND ((sm.total_revenue - sm.total_cost) / sm.total_revenue) >= 0.20 THEN 'healthy'
          WHEN sm.is_active THEN 'needs_attention'
          ELSE 'unhealthy'
        END AS "healthStatus",
        CASE
          WHEN NOT sm.is_active AND sm.last_activity < NOW() - INTERVAL '180 days' THEN 'dormant'
          WHEN NOT sm.is_active THEN 'paused'
          ELSE 'active'
        END AS status
      FROM school_metrics sm
      LEFT JOIN school_term_status sts ON sts.school_name = sm.school_name
        AND sts.term = (
          CASE
            WHEN EXTRACT(MONTH FROM NOW()) BETWEEN 1 AND 4 THEN 'Spring ' || EXTRACT(YEAR FROM NOW())::text
            WHEN EXTRACT(MONTH FROM NOW()) BETWEEN 5 AND 7 THEN 'Summer ' || EXTRACT(YEAR FROM NOW())::text
            WHEN EXTRACT(MONTH FROM NOW()) BETWEEN 8 AND 11 THEN 'Fall ' || EXTRACT(YEAR FROM NOW())::text
            ELSE 'Winter ' || (EXTRACT(YEAR FROM NOW()) + 1)::text
          END
        )
      LEFT JOIN school_metadata smd ON smd.school_name = sm.school_name
    `;

    // Execute the base query ONCE and do filtering/pagination/counting in JS
    // Schools are typically < 100 rows, so this is far more efficient than 3 separate CTEs
    const { rows: allSchools } = await pool.query(query, [schoolLabels]);

    // Apply filters in JS
    let filtered = allSchools;

    if (search && search.trim()) {
      const searchLower = search.trim().toLowerCase();
      filtered = filtered.filter(r =>
        (r.name && r.name.toLowerCase().includes(searchLower)) ||
        (r.email && r.email.toLowerCase().includes(searchLower))
      );
    }

    if (location) {
      filtered = filtered.filter(r => r.location === location);
    }

    if (health) {
      filtered = filtered.filter(r => r.healthStatus === health);
    }

    if (billing_model) {
      filtered = filtered.filter(r => r.billingModel === billing_model);
    }

    if (status === 'active') {
      filtered = filtered.filter(r => r.isActive === true);
    } else if (status === 'paused') {
      filtered = filtered.filter(r => r.isActive === false && r.lastActivity >= new Date(Date.now() - 180 * 24 * 60 * 60 * 1000));
    } else if (status === 'dormant') {
      filtered = filtered.filter(r => r.isActive === false && r.lastActivity < new Date(Date.now() - 180 * 24 * 60 * 60 * 1000));
    }

    // Tab counts (computed from ALL schools, not filtered)
    const tabCounts = {
      all: allSchools.length,
      active: allSchools.filter(r => r.isActive === true).length,
      paused: allSchools.filter(r => r.isActive === false && r.lastActivity >= new Date(Date.now() - 180 * 24 * 60 * 60 * 1000)).length,
      dormant: allSchools.filter(r => r.isActive === false && r.lastActivity < new Date(Date.now() - 180 * 24 * 60 * 60 * 1000)).length
    };

    // Sorting
    const sortColumn = {
      name: 'name',
      health: 'healthStatus',
      status: 'status',
      location: 'location'
    }[sort] || 'name';

    const sortDirection = sort_dir === 'desc' ? -1 : 1;
    filtered.sort((a, b) => {
      const aVal = (a[sortColumn] || '').toString().toLowerCase();
      const bVal = (b[sortColumn] || '').toString().toLowerCase();
      return aVal < bVal ? -sortDirection : aVal > bVal ? sortDirection : 0;
    });

    const total = filtered.length;
    const offset = (parseInt(page) - 1) * parseInt(limit);
    const rows = filtered.slice(offset, offset + parseInt(limit));

    return {
      schools: rows,
      data: rows,
      pagination: {
        page: parseInt(page),
        limit: parseInt(limit),
        total,
        totalPages: Math.ceil(total / parseInt(limit))
      },
      tabCounts
    };
    }, 60); // 60 second TTL

    res.json(cachedResult);
  } catch (error) {
    logger.error({ err: error }, 'Error fetching schools list:');
    res.status(500).json({ error: 'Failed to fetch schools list', details: error.message });
  }
}));

// GET /api/entity-lists/schools/:id - Get single school by ID
router.get('/schools/:id', auth, asyncHandler(async (req, res) => {
  logger.info({ data: req.params.id }, '[School Detail] Request for ID:');
  try {
    const pool = getLocationPool(req);
    if (!pool) {
      logger.error('[School Detail] No database pool available');
      return res.status(500).json({ error: 'Database connection not available' });
    }

    const { id } = req.params;
    logger.info({ data: id }, '[School Detail] Looking up school:');
    const schoolLabels = ['School - NYC', 'School - LA', 'School - SF', 'School - Hamptons', 'School - Eastside', 'School - Westside'];

    // Build the same query as the list but for a single school
    const query = `
      WITH school_services AS (
        SELECT DISTINCT
          s.service_id,
          s.name AS service_name,
          s.status AS service_status,
          s.labels AS service_labels,
          s.dft_charge_rate,
          s.dft_contractor_rate,
          s.dft_charge_type,
          s.created_at,
          s.updated_at,
          CASE
            WHEN s.name ~* '(fall|spring|summer|winter|autumn)\\s+\\d{4}'
            THEN INITCAP((regexp_match(s.name, '(fall|spring|summer|winter|autumn)', 'i'))[1]) || ' ' || (regexp_match(s.name, '(\\d{4})'))[1]
            ELSE NULL
          END AS term_season,
          (SELECT label
           FROM jsonb_array_elements_text(s.labels) AS label
           WHERE label LIKE 'School - %'
           LIMIT 1
          ) AS school_label
        FROM services s
        WHERE EXISTS (
          SELECT 1
          FROM jsonb_array_elements_text(s.labels) AS label
          WHERE label = ANY($1::text[])
        )
        AND s.is_deleted IS NOT TRUE
      ),
      school_groups AS (
        SELECT
          SPLIT_PART(ss.service_name, ' // ', 1) AS school_name,
          ss.school_label,
          REPLACE(ss.school_label, 'School - ', '') AS location,
          array_agg(DISTINCT ss.service_id) AS service_ids,
          COUNT(DISTINCT ss.service_id) AS job_count,
          MAX(ss.updated_at) AS last_activity
        FROM school_services ss
        WHERE ss.school_label IS NOT NULL
        GROUP BY SPLIT_PART(ss.service_name, ' // ', 1), ss.school_label
      ),
      school_metrics AS (
        SELECT
          sg.school_name,
          sg.school_label,
          sg.location,
          sg.job_count,
          sg.last_activity,
          sg.service_ids,
          (SELECT c.client_id::text
           FROM appointments a
           JOIN appointment_recipients ar ON a.appointment_id = ar.appointment_id
           JOIN clients c ON ar.paying_client_id::text = c.client_id::text
           WHERE a.service_id = ANY(sg.service_ids)
           AND (c.first_name || ' ' || COALESCE(c.last_name, '')) ILIKE '%' || sg.school_name || '%'
           LIMIT 1) AS client_id,
          (SELECT c.email
           FROM appointments a
           JOIN appointment_recipients ar ON a.appointment_id = ar.appointment_id
           JOIN clients c ON ar.paying_client_id::text = c.client_id::text
           WHERE a.service_id = ANY(sg.service_ids)
           AND (c.first_name || ' ' || COALESCE(c.last_name, '')) ILIKE '%' || sg.school_name || '%'
           LIMIT 1) AS email,
          (SELECT c.phone
           FROM appointments a
           JOIN appointment_recipients ar ON a.appointment_id = ar.appointment_id
           JOIN clients c ON ar.paying_client_id::text = c.client_id::text
           WHERE a.service_id = ANY(sg.service_ids)
           AND (c.first_name || ' ' || COALESCE(c.last_name, '')) ILIKE '%' || sg.school_name || '%'
           LIMIT 1) AS phone,
          COALESCE((
            SELECT SUM(ar.charge_rate)
            FROM appointments a
            JOIN appointment_recipients ar ON a.appointment_id = ar.appointment_id
            WHERE a.service_id = ANY(sg.service_ids)
            AND a.status IN ('complete', 'awaiting-report')
          ), 0) AS total_revenue,
          COALESCE((
            SELECT SUM(ac.pay_rate)
            FROM appointments a
            JOIN appointment_contractors ac ON a.appointment_id = ac.appointment_id
            WHERE a.service_id = ANY(sg.service_ids)
            AND a.status IN ('complete', 'awaiting-report')
          ), 0) AS total_cost,
          COALESCE((
            SELECT COUNT(DISTINCT ar.recipient_id)
            FROM appointments a
            JOIN appointment_recipients ar ON a.appointment_id = ar.appointment_id
            WHERE a.service_id = ANY(sg.service_ids)
            AND ar.status != 'missed'
          ), 0) AS student_count,
          COALESCE((
            SELECT COUNT(DISTINCT a.appointment_id)
            FROM appointments a
            WHERE a.service_id = ANY(sg.service_ids)
            AND a.status IN ('complete', 'awaiting-report')
          ), 0) AS lesson_count,
          EXISTS (
            SELECT 1 FROM appointments a
            WHERE a.service_id = ANY(sg.service_ids)
            AND a.start > NOW() - INTERVAL '60 days'
            AND a.status NOT IN ('cancelled', 'deleted')
          ) AS is_active,
          COALESCE((
            SELECT COUNT(*) FROM invoices i
            WHERE i.client_id::text = (
              SELECT c.client_id::text
              FROM appointments a2
              JOIN appointment_recipients ar2 ON a2.appointment_id = ar2.appointment_id
              JOIN clients c ON ar2.paying_client_id::text = c.client_id::text
              WHERE a2.service_id = ANY(sg.service_ids)
              AND (c.first_name || ' ' || COALESCE(c.last_name, '')) ILIKE '%' || sg.school_name || '%'
              LIMIT 1
            )
            AND i.status = 'unpaid'
            AND i.date_sent < NOW() - INTERVAL '30 days'
          ), 0) AS late_count,
          COALESCE((
            SELECT MAX(EXTRACT(EPOCH FROM (NOW() - i.date_sent)) / 86400)
            FROM invoices i
            WHERE i.client_id::text = (
              SELECT c.client_id::text
              FROM appointments a2
              JOIN appointment_recipients ar2 ON a2.appointment_id = ar2.appointment_id
              JOIN clients c ON ar2.paying_client_id::text = c.client_id::text
              WHERE a2.service_id = ANY(sg.service_ids)
              AND (c.first_name || ' ' || COALESCE(c.last_name, '')) ILIKE '%' || sg.school_name || '%'
              LIMIT 1
            )
            AND i.status = 'unpaid'
            AND i.date_sent IS NOT NULL
          ), 0) AS max_days_outstanding_unpaid,
          CASE
            WHEN EXISTS (
              SELECT 1 FROM services s
              WHERE s.service_id = ANY(sg.service_ids)
              AND s.dft_charge_type IN ('hourly', 'one-off')
            ) THEN 'per_lesson'
            ELSE 'per_student'
          END AS billing_model
        FROM school_groups sg
      )
      SELECT
        sm.school_name AS name,
        COALESCE(sm.client_id, 'SCHOOL_' || md5(sm.school_name)) AS "clientId",
        sm.email,
        sm.phone,
        sm.school_label AS "schoolLabel",
        sm.location,
        sm.is_active AS "isActive",
        sm.total_revenue AS "totalRevenue",
        sm.total_cost AS "totalCost",
        (sm.total_revenue - sm.total_cost) AS "totalMargin",
        CASE
          WHEN sm.total_revenue > 0 THEN ROUND(((sm.total_revenue - sm.total_cost) / sm.total_revenue * 100)::numeric, 1)
          ELSE 0
        END AS "marginPercent",
        sm.student_count AS "totalStudents",
        sm.lesson_count AS "totalLessons",
        sm.job_count AS "jobCount",
        sm.billing_model AS "billingModel",
        sm.last_activity AS "lastActivity",
        sm.service_ids AS "serviceIds",
        CASE
          WHEN sm.late_count > 0 OR sm.max_days_outstanding_unpaid > 30 THEN 'unhealthy'
          WHEN sm.total_revenue > 0 AND ((sm.total_revenue - sm.total_cost) / sm.total_revenue) < 0.10 THEN 'unhealthy'
          WHEN sm.total_revenue > 0 AND ((sm.total_revenue - sm.total_cost) / sm.total_revenue) < 0.20 THEN 'needs_attention'
          WHEN sm.total_revenue > 0 AND ((sm.total_revenue - sm.total_cost) / sm.total_revenue) >= 0.20 THEN 'healthy'
          WHEN sm.is_active THEN 'needs_attention'
          ELSE 'unhealthy'
        END AS "healthStatus",
        CASE
          WHEN NOT sm.is_active AND sm.last_activity < NOW() - INTERVAL '180 days' THEN 'dormant'
          WHEN NOT sm.is_active THEN 'paused'
          ELSE 'active'
        END AS status
      FROM school_metrics sm
      WHERE COALESCE(sm.client_id, 'SCHOOL_' || md5(sm.school_name)) = $2
    `;

    logger.info({ schoolLabels, id }, '[School Detail] Executing query with labels');
    const { rows } = await pool.query(query, [schoolLabels, id]);
    logger.info({ rows: rows.length }, '[School Detail] Query returned');

    if (rows.length === 0) {
      logger.info('[School Detail] School not found');
      return res.status(404).json({ error: 'School not found' });
    }

    const school = rows[0];
    logger.info({ name: school.name, serviceIds: school.serviceIds }, '[School Detail] Found school');

    // Get jobs/services for this school
    const jobsQuery = `
      SELECT
        s.service_id AS "serviceId",
        s.name AS "serviceName",
        s.status,
        s.dft_charge_rate AS "chargeRate",
        s.dft_contractor_rate AS "payRate",
        s.created_at AS "createdAt",
        s.updated_at AS "updatedAt",
        CASE
          WHEN s.name ~* '(fall|spring|summer|winter|autumn)\\s+\\d{4}'
          THEN INITCAP((regexp_match(s.name, '(fall|spring|summer|winter|autumn)', 'i'))[1]) || ' ' || (regexp_match(s.name, '(\\d{4})'))[1]
          ELSE NULL
        END AS term,
        COALESCE((
          SELECT COUNT(DISTINCT a.appointment_id)
          FROM appointments a
          WHERE a.service_id = s.service_id
          AND a.status IN ('complete', 'awaiting-report')
        ), 0) AS "lessonCount",
        COALESCE((
          SELECT COUNT(DISTINCT ar.recipient_id)
          FROM appointments a
          JOIN appointment_recipients ar ON a.appointment_id = ar.appointment_id
          WHERE a.service_id = s.service_id
        ), 0) AS "studentCount",
        COALESCE((
          SELECT SUM(ar.charge_rate)
          FROM appointments a
          JOIN appointment_recipients ar ON a.appointment_id = ar.appointment_id
          WHERE a.service_id = s.service_id
          AND a.status IN ('complete', 'awaiting-report')
        ), 0) AS revenue,
        (SELECT array_agg(DISTINCT ac.contractor_name)
         FROM appointments a
         JOIN appointment_contractors ac ON a.appointment_id = ac.appointment_id
         WHERE a.service_id = s.service_id) AS tutors
      FROM services s
      WHERE s.service_id = ANY($1::int[])
      ORDER BY s.name
    `;

    // Only fetch jobs if we have service IDs
    if (school.serviceIds && school.serviceIds.length > 0) {
      const jobsResult = await pool.query(jobsQuery, [school.serviceIds]);
      school.jobs = jobsResult.rows;
    } else {
      school.jobs = [];
    }

    // Get recent invoices (simplified - just showing recent transactions)
    school.invoices = {
      total: 0,
      paid: 0,
      unpaid: 0,
      late: 0,
      details: []
    };

    res.json(school);
  } catch (error) {
    logger.error({ error: error.message }, 'Error fetching school detail:');
    logger.error({ error: error.stack }, 'Stack:');
    res.status(500).json({ error: 'Failed to fetch school details', details: error.message });
  }
}));

// GET /api/entity-lists/students - List students with search and filters
router.get('/students', asyncHandler(async (req, res) => {
  try {
    const pool = getLocationPool(req);
    const { search, page = 1, limit = 50 } = req.query;
    
    let query = `
      SELECT DISTINCT
        ar.recipient_id,
        ar.recipient_name,
        ar.paying_client_id,
        ar.paying_client_name
      FROM appointment_recipients ar
      WHERE 1=1
    `;
    
    const params = [];
    let paramCount = 0;
    
    if (search) {
      paramCount++;
      query += ` AND ar.recipient_name ILIKE $${paramCount}`;
      params.push(`%${search}%`);
    }
    
    query += ` ORDER BY ar.recipient_name`;
    
    const offset = (parseInt(page) - 1) * parseInt(limit);
    paramCount++;
    query += ` LIMIT $${paramCount}`;
    params.push(parseInt(limit));
    
    paramCount++;
    query += ` OFFSET $${paramCount}`;
    params.push(offset);
    
    const { rows } = await pool.query(query, params);
    
    // Get total count
    let countQuery = `SELECT COUNT(DISTINCT ar.recipient_id) as total FROM appointment_recipients ar WHERE 1=1`;
    const countParams = [];
    let countParamCount = 0;
    
    if (search) {
      countParamCount++;
      countQuery += ` AND ar.recipient_name ILIKE $${countParamCount}`;
      countParams.push(`%${search}%`);
    }
    
    const { rows: countRows } = await pool.query(countQuery, countParams);
    const total = parseInt(countRows[0].total);
    
    res.json({
      students: rows,
      pagination: {
        page: parseInt(page),
        limit: parseInt(limit),
        total,
        totalPages: Math.ceil(total / parseInt(limit))
      }
    });
  } catch (error) {
    logger.error({ err: error }, 'Error fetching students list:');
    res.status(500).json({ error: 'Failed to fetch students list' });
  }
}));

// GET /api/entity-lists/jobs - List jobs/services with search and filters
router.get('/jobs', auth, asyncHandler(async (req, res) => {
  try {
    const pool = getLocationPool(req);
    if (!pool) {
      logger.error('No database pool available');
      return res.status(500).json({ error: 'Database connection not available' });
    }
    
    const { search, status, label, labels, page = 1, limit = 50 } = req.query;
    
    // Check if "Services" table exists (cached)
    let servicesTableExists = false;
    try {
      servicesTableExists = await tableExists(pool, 'Services');
    } catch (tableCheckError) {
      logger.warn({ data: tableCheckError.message }, 'Could not check for Services table:');
      servicesTableExists = false;
    }
    
    let query = `
      SELECT 
        s.service_id,
        s.name,
        s.status,
        s.dft_charge_rate,
        s.dft_contractor_rate,
        s.labels,
        s.created_at
    `;
    
    // Add public_visible column if Services table exists
    if (servicesTableExists) {
      query += `, COALESCE(sv."publicVisible", false) as public_visible`;
    } else {
      query += `, false as public_visible`;
    }
    
    query += `
      FROM services s
    `;
    
    // Add LEFT JOIN only if Services table exists
    if (servicesTableExists) {
      query += `LEFT JOIN "Services" sv ON s.service_id::text = sv."serviceId"`;
    }
    
    query += ` WHERE 1=1`;
    
    const params = [];
    let paramCount = 0;
    
    if (search) {
      paramCount++;
      // Support searching by service_id (numeric) or name (text)
      const isNumeric = /^\d+$/.test(search.trim());
      if (isNumeric) {
        // Handle both text and integer service_id types
        query += ` AND (s.service_id::text = $${paramCount} OR s.service_id = $${paramCount}::integer OR s.name ILIKE $${paramCount + 1})`;
        params.push(search.trim());
        paramCount++;
        params.push(`%${search}%`);
      } else {
        query += ` AND s.name ILIKE $${paramCount}`;
        params.push(`%${search}%`);
      }
    }
    
    if (status) {
      paramCount++;
      query += ` AND status = $${paramCount}`;
      params.push(status);
    }
    
    // Handle multiple labels (checkbox-group)
    if (labels) {
      const labelArray = Array.isArray(labels) ? labels : labels.split(',');
      if (labelArray.length > 0) {
        const labelConditions = labelArray.map((label, idx) => {
          paramCount++;
          params.push(`%${label}%`);
          return `label_elem::text ILIKE $${paramCount}`;
        }).join(' OR ');
        query += ` AND (
          EXISTS (
            SELECT 1 FROM jsonb_array_elements(labels) AS label_elem
            WHERE ${labelConditions}
          )
        )`;
      }
    } else if (label) {
      // Single label filter (backward compatibility)
      paramCount++;
      query += ` AND EXISTS (
        SELECT 1 FROM jsonb_array_elements_text(labels) AS label_elem
        WHERE label_elem ILIKE $${paramCount}
      )`;
      params.push(`%${label}%`);
    }
    
    // Order by public_visible if Services table exists
    if (servicesTableExists) {
      query += ` ORDER BY COALESCE(sv."publicVisible", false) DESC, s.name`;
    } else {
      query += ` ORDER BY s.name`;
    }
    
    const offset = (parseInt(page) - 1) * parseInt(limit);
    paramCount++;
    query += ` LIMIT $${paramCount}`;
    params.push(parseInt(limit));
    
    paramCount++;
    query += ` OFFSET $${paramCount}`;
    params.push(offset);
    
    const { rows } = await pool.query(query, params);
    
    // Get total count
    let countQuery = `SELECT COUNT(*) as total FROM services WHERE 1=1`;
    const countParams = [];
    let countParamCount = 0;
    
    if (search) {
      // Support searching by service_id (numeric) or name (text)
      const isNumeric = /^\d+$/.test(search.trim());
      if (isNumeric) {
        // Handle both text and integer service_id types
        countParamCount++;
        countQuery += ` AND (service_id::text = $${countParamCount} OR service_id = $${countParamCount}::integer OR name ILIKE $${countParamCount + 1})`;
        countParams.push(search.trim());
        countParamCount++;
        countParams.push(`%${search}%`);
      } else {
        countParamCount++;
        countQuery += ` AND name ILIKE $${countParamCount}`;
        countParams.push(`%${search}%`);
      }
    }
    
    if (status) {
      countParamCount++;
      countQuery += ` AND status = $${countParamCount}`;
      countParams.push(status);
    }
    
    // Handle multiple labels in count query
    if (labels) {
      const labelArray = Array.isArray(labels) ? labels : labels.split(',');
      if (labelArray.length > 0) {
        const labelConditions = labelArray.map((label, idx) => {
          countParamCount++;
          countParams.push(`%${label}%`);
          return `label_elem::text ILIKE $${countParamCount}`;
        }).join(' OR ');
        countQuery += ` AND (
          EXISTS (
            SELECT 1 FROM jsonb_array_elements(labels) AS label_elem
            WHERE ${labelConditions}
          )
        )`;
      }
    } else if (label) {
      countParamCount++;
      countQuery += ` AND EXISTS (
        SELECT 1 FROM jsonb_array_elements_text(labels) AS label_elem
        WHERE label_elem ILIKE $${countParamCount}
      )`;
      countParams.push(`%${label}%`);
    }
    
    const { rows: countRows } = await pool.query(countQuery, countParams);
    const total = parseInt(countRows[0].total);
    
    // Get counts for each status tab
    let tabCounts = { all: total };
    try {
      const statusCountsQuery = `
        SELECT 
          status,
          COUNT(*) as count
        FROM services
        GROUP BY status
      `;
      const { rows: statusRows } = await pool.query(statusCountsQuery);
      statusRows.forEach(row => {
        // Map status values to tab keys
        const statusMap = {
          'planned': 'available',
          'in-progress': 'in_progress',
          'completed': 'finished',
          'pending': 'pending',
          'gone-cold': 'gone_cold'
        };
        const tabKey = statusMap[row.status] || row.status;
        tabCounts[tabKey] = parseInt(row.count);
      });
    } catch (countError) {
      logger.error({ err: countError }, 'Error fetching status counts:');
    }
    
    res.json({
      jobs: rows,
      pagination: {
        page: parseInt(page),
        limit: parseInt(limit),
        total,
        totalPages: Math.ceil(total / parseInt(limit))
      },
      tabCounts
    });
  } catch (error) {
    logger.error({ err: error }, 'Error fetching jobs list:');
    logger.error({ error: error.stack }, 'Error stack:');
    logger.error({ error: error.message }, 'Error message:');
    res.status(500).json({ 
      error: 'Failed to fetch jobs list',
      details: error.message,
      stack: process.env.NODE_ENV === 'development' ? error.stack : undefined
    });
  }
}));

// GET /api/entity-lists/job-applications - List job applications (tenders) with search and filters
router.get('/job-applications', auth, asyncHandler(async (req, res) => {
  try {
    const pool = getLocationPool(req);
    if (!pool) {
      logger.error('No database pool available');
      return res.status(500).json({ error: 'Database connection not available' });
    }

    // Check if job_applications table exists (cached)
    const jaExists = await tableExists(pool, 'job_applications');

    if (!jaExists) {
      logger.warn('Job applications table does not exist. Returning empty array.');
      return res.json({
        data: [],
        'job-applications': [],
        pagination: { page: 1, limit: 50, total: 0, totalPages: 0 },
        tabCounts: { all: 0, pending: 0, requested: 0, accepted: 0, rejected: 0, withdrawn: 0 }
      });
    }

    const {
      search,
      service_id,
      contractor_id,
      status,
      tab,
      page = 1,
      limit = 50
    } = req.query;

    const params = [];
    let paramCount = 0;
    let whereConditions = [];

    let baseQuery = `
      FROM job_applications ja
      LEFT JOIN services s ON CAST(ja.service_id AS INTEGER) = s.service_id
      LEFT JOIN contractors ct ON ja.contractor_id = ct.contractor_id
      WHERE 1=1
    `;

    if (search) {
      paramCount++;
      whereConditions.push(`(
        ja.description ILIKE $${paramCount} OR
        s.name ILIKE $${paramCount} OR
        ct.first_name ILIKE $${paramCount} OR
        ct.last_name ILIKE $${paramCount}
      )`);
      params.push(`%${search}%`);
    }

    if (service_id) {
      paramCount++;
      whereConditions.push(`CAST(ja.service_id AS INTEGER) = $${paramCount}::integer`);
      params.push(parseInt(service_id));
    }

    if (contractor_id) {
      paramCount++;
      whereConditions.push(`ja.contractor_id = $${paramCount}::integer`);
      params.push(parseInt(contractor_id));
    }

    // Status filtering - handle both status param and tab param
    if (status) {
      paramCount++;
      whereConditions.push(`ja.status = $${paramCount}`);
      params.push(status);
    } else if (tab && tab !== 'all') {
      // Map tab names to status values
      const tabStatusMap = {
        'pending': 'pending',
        'requested': 'requested',
        'accepted': 'accepted',
        'rejected': 'rejected',
        'withdrawn': 'withdrawn'
      };
      if (tabStatusMap[tab]) {
        paramCount++;
        whereConditions.push(`ja.status = $${paramCount}`);
        params.push(tabStatusMap[tab]);
      }
    }

    const whereClause = whereConditions.length > 0 ? ` AND ${whereConditions.join(' AND ')}` : '';
    const offset = (parseInt(page) - 1) * parseInt(limit);

    let query = `
      SELECT
        ja.id,
        ja.service_id,
        s.name as service_name,
        ja.contractor_id,
        ct.first_name as contractor_first_name,
        ct.last_name as contractor_last_name,
        ja.description,
        ja.status,
        ja.date_created,
        ja.date_updated,
        ja.creator_id,
        ja.creator_first_name,
        ja.creator_last_name
      ${baseQuery} ${whereClause}
      ORDER BY ja.date_created DESC, ja.id DESC
      LIMIT $${paramCount + 1} OFFSET $${paramCount + 2}
    `;

    paramCount++;
    params.push(parseInt(limit));
    paramCount++;
    params.push(offset);

    const { rows } = await pool.query(query, params);

    // Get total count
    let countBaseQuery = `FROM job_applications ja`;
    let countWhereConditions = [];
    let countParams = [];
    let countParamCount = 0;

    if (search) {
      countBaseQuery += ` LEFT JOIN services s ON CAST(ja.service_id AS INTEGER) = s.service_id`;
      countBaseQuery += ` LEFT JOIN contractors ct ON ja.contractor_id = ct.contractor_id`;
    }

    countBaseQuery += ` WHERE 1=1`;

    if (search) {
      countParamCount++;
      countWhereConditions.push(`(
        ja.description ILIKE $${countParamCount} OR
        s.name ILIKE $${countParamCount} OR
        ct.first_name ILIKE $${countParamCount} OR
        ct.last_name ILIKE $${countParamCount}
      )`);
      countParams.push(`%${search}%`);
    }

    if (service_id) {
      countParamCount++;
      countWhereConditions.push(`CAST(ja.service_id AS INTEGER) = $${countParamCount}::integer`);
      countParams.push(parseInt(service_id));
    }

    if (contractor_id) {
      countParamCount++;
      countWhereConditions.push(`ja.contractor_id = $${countParamCount}::integer`);
      countParams.push(parseInt(contractor_id));
    }

    if (status) {
      countParamCount++;
      countWhereConditions.push(`ja.status = $${countParamCount}`);
      countParams.push(status);
    } else if (tab && tab !== 'all') {
      const tabStatusMap = {
        'pending': 'pending',
        'requested': 'requested',
        'accepted': 'accepted',
        'rejected': 'rejected',
        'withdrawn': 'withdrawn'
      };
      if (tabStatusMap[tab]) {
        countParamCount++;
        countWhereConditions.push(`ja.status = $${countParamCount}`);
        countParams.push(tabStatusMap[tab]);
      }
    }

    const countWhereClause = countWhereConditions.length > 0 ? ` AND ${countWhereConditions.join(' AND ')}` : '';
    let countQuery = `SELECT COUNT(*) as total ${countBaseQuery} ${countWhereClause}`;
    const { rows: countRows } = await pool.query(countQuery, countParams);
    const total = parseInt(countRows[0].total);

    // Get tab counts (all statuses)
    let tabCounts = { all: 0, pending: 0, requested: 0, accepted: 0, rejected: 0, withdrawn: 0 };
    try {
      let tabCountsBaseQuery = `FROM job_applications ja WHERE 1=1`;
      let tabCountsWhereConditions = [];
      let tabCountsParams = [];
      let tabCountsParamCount = 0;

      if (search) {
        tabCountsBaseQuery = `FROM job_applications ja
          LEFT JOIN services s ON CAST(ja.service_id AS INTEGER) = s.service_id
          LEFT JOIN contractors ct ON ja.contractor_id = ct.contractor_id
          WHERE 1=1`;
        tabCountsParamCount++;
        tabCountsWhereConditions.push(`(
          ja.description ILIKE $${tabCountsParamCount} OR
          s.name ILIKE $${tabCountsParamCount} OR
          ct.first_name ILIKE $${tabCountsParamCount} OR
          ct.last_name ILIKE $${tabCountsParamCount}
        )`);
        tabCountsParams.push(`%${search}%`);
      }

      if (service_id) {
        tabCountsParamCount++;
        tabCountsWhereConditions.push(`CAST(ja.service_id AS INTEGER) = $${tabCountsParamCount}::integer`);
        tabCountsParams.push(parseInt(service_id));
      }

      if (contractor_id) {
        tabCountsParamCount++;
        tabCountsWhereConditions.push(`ja.contractor_id = $${tabCountsParamCount}::integer`);
        tabCountsParams.push(parseInt(contractor_id));
      }

      const tabCountsWhereClause = tabCountsWhereConditions.length > 0 
        ? ` AND ${tabCountsWhereConditions.join(' AND ')}` 
        : '';

      const tabCountsQuery = `
        SELECT 
          COUNT(*) FILTER (WHERE ja.status = 'pending') as pending,
          COUNT(*) FILTER (WHERE ja.status = 'requested') as requested,
          COUNT(*) FILTER (WHERE ja.status = 'accepted') as accepted,
          COUNT(*) FILTER (WHERE ja.status = 'rejected') as rejected,
          COUNT(*) FILTER (WHERE ja.status = 'withdrawn') as withdrawn,
          COUNT(*) as all_count
        ${tabCountsBaseQuery} ${tabCountsWhereClause}
      `;
      const { rows: tabCountRows } = await pool.query(tabCountsQuery, tabCountsParams);
      if (tabCountRows[0]) {
        tabCounts = {
          all: parseInt(tabCountRows[0].all_count || 0),
          pending: parseInt(tabCountRows[0].pending || 0),
          requested: parseInt(tabCountRows[0].requested || 0),
          accepted: parseInt(tabCountRows[0].accepted || 0),
          rejected: parseInt(tabCountRows[0].rejected || 0),
          withdrawn: parseInt(tabCountRows[0].withdrawn || 0)
        };
      }
    } catch (tabCountError) {
      logger.error({ err: tabCountError }, 'Error fetching tab counts:');
    }

    res.json({
      data: rows,
      'job-applications': rows,
      pagination: {
        page: parseInt(page),
        limit: parseInt(limit),
        total,
        totalPages: Math.ceil(total / parseInt(limit))
      },
      tabCounts
    });
  } catch (error) {
    logger.error({ err: error }, 'Error fetching job applications list:');
    res.status(500).json({
      error: 'Failed to fetch job applications list',
      details: error.message,
      stack: process.env.NODE_ENV === 'development' ? error.stack : undefined
    });
  }
}));

// GET /api/entity-lists/ad-hoc-charges - List ad hoc charges with search and filters
router.get('/ad-hoc-charges', asyncHandler(async (req, res) => {
  try {
    const pool = getLocationPool(req);
    if (!pool) {
      logger.error('No database pool available');
      return res.status(500).json({ error: 'Database connection not available' });
    }

    // Check if adhoc_charges table exists (cached)
    const ahcExists = await tableExists(pool, 'adhoc_charges');

    if (!ahcExists) {
      logger.warn('Adhoc charges table does not exist. Returning empty array.');
      return res.json({
        data: [],
        'ad-hoc-charges': [],
        pagination: { page: 1, limit: 50, total: 0, totalPages: 0 }
      });
    }

    const {
      search,
      client_id,
      contractor_id,
      category_id,
      start_date,
      end_date,
      page = 1,
      limit = 50
    } = req.query;

    const params = [];
    let paramCount = 0;
    let whereConditions = [];

    let baseQuery = `
      FROM adhoc_charges ac
      LEFT JOIN clients cl ON ac.client_id::text = cl.client_id
      LEFT JOIN contractors ct ON CAST(ac.contractor_id AS INTEGER) = ct.contractor_id
      LEFT JOIN services s ON CAST(ac.service_id AS INTEGER) = s.service_id
      WHERE 1=1
    `;

    if (search) {
      paramCount++;
      whereConditions.push(`(
        ac.description ILIKE $${paramCount} OR
        ac.category_name ILIKE $${paramCount} OR
        cl.first_name ILIKE $${paramCount} OR
        cl.last_name ILIKE $${paramCount} OR
        ct.first_name ILIKE $${paramCount} OR
        ct.last_name ILIKE $${paramCount}
      )`);
      params.push(`%${search}%`);
    }

    if (client_id) {
      paramCount++;
      whereConditions.push(`ac.client_id::text = $${paramCount}`);
      params.push(client_id);
    }

    if (contractor_id) {
      paramCount++;
      whereConditions.push(`CAST(ac.contractor_id AS INTEGER) = $${paramCount}`);
      params.push(parseInt(contractor_id));
    }

    if (category_id) {
      paramCount++;
      whereConditions.push(`ac.category_id = $${paramCount}::bigint`);
      params.push(parseInt(category_id));
    }

    if (start_date) {
      paramCount++;
      whereConditions.push(`ac.date_occurred >= $${paramCount}::timestamp`);
      params.push(start_date);
    }

    if (end_date) {
      paramCount++;
      whereConditions.push(`ac.date_occurred <= $${paramCount}::timestamp`);
      params.push(end_date);
    }

    const whereClause = whereConditions.length > 0 ? ` AND ${whereConditions.join(' AND ')}` : '';
    const offset = (parseInt(page) - 1) * parseInt(limit);

    let query = `
      SELECT
        ac.id,
        ac.agent_id,
        ac.appointment_id,
        ac.category_id,
        ac.category_name,
        ac.client_id,
        cl.first_name as client_first_name,
        cl.last_name as client_last_name,
        ac.contractor_id,
        ct.first_name as contractor_first_name,
        ct.last_name as contractor_last_name,
        ac.contractor_email,
        ac.creator_id,
        ac.creator_first_name,
        ac.creator_last_name,
        ac.creator_email,
        ac.currency,
        ac.date_occurred,
        ac.description,
        ac.net_gross,
        ac.pay_contractor,
        ac.service_id,
        s.name as service_name,
        ac.tax_amount,
        ac.fetched_at,
        ac.last_updated
      ${baseQuery} ${whereClause}
      ORDER BY ac.date_occurred DESC, ac.id DESC
      LIMIT $${paramCount + 1} OFFSET $${paramCount + 2}
    `;

    paramCount++;
    params.push(parseInt(limit));
    paramCount++;
    params.push(offset);

    const { rows } = await pool.query(query, params);

    // Get total count
    let countBaseQuery = `FROM adhoc_charges ac`;
    let countWhereConditions = [];
    let countParams = [];
    let countParamCount = 0;

    // Add JOINs only if needed for search
    if (search) {
      countBaseQuery += ` LEFT JOIN clients cl ON ac.client_id::text = cl.client_id`;
      countBaseQuery += ` LEFT JOIN contractors ct ON CAST(ac.contractor_id AS INTEGER) = ct.contractor_id`;
    }

    countBaseQuery += ` WHERE 1=1`;

    if (search) {
      countParamCount++;
      countWhereConditions.push(`(
        ac.description ILIKE $${countParamCount} OR
        ac.category_name ILIKE $${countParamCount} OR
        cl.first_name ILIKE $${countParamCount} OR
        cl.last_name ILIKE $${countParamCount} OR
        ct.first_name ILIKE $${countParamCount} OR
        ct.last_name ILIKE $${countParamCount}
      )`);
      countParams.push(`%${search}%`);
    }

    if (client_id) {
      countParamCount++;
      countWhereConditions.push(`ac.client_id::text = $${countParamCount}`);
      countParams.push(client_id);
    }

    if (contractor_id) {
      countParamCount++;
      countWhereConditions.push(`CAST(ac.contractor_id AS INTEGER) = $${countParamCount}`);
      countParams.push(parseInt(contractor_id));
    }

    if (category_id) {
      countParamCount++;
      countWhereConditions.push(`ac.category_id = $${countParamCount}::bigint`);
      countParams.push(parseInt(category_id));
    }

    if (start_date) {
      countParamCount++;
      countWhereConditions.push(`ac.date_occurred >= $${countParamCount}::timestamp`);
      countParams.push(start_date);
    }

    if (end_date) {
      countParamCount++;
      countWhereConditions.push(`ac.date_occurred <= $${countParamCount}::timestamp`);
      countParams.push(end_date);
    }

    const countWhereClause = countWhereConditions.length > 0 ? ` AND ${countWhereConditions.join(' AND ')}` : '';
    let countQuery = `SELECT COUNT(*) as total ${countBaseQuery} ${countWhereClause}`;
    const { rows: countRows } = await pool.query(countQuery, countParams);
    const total = parseInt(countRows[0].total);

    res.json({
      data: rows,
      'ad-hoc-charges': rows,
      pagination: {
        page: parseInt(page),
        limit: parseInt(limit),
        total,
        totalPages: Math.ceil(total / parseInt(limit))
      }
    });
  } catch (error) {
    logger.error({ err: error }, 'Error fetching ad hoc charges list:');
    res.status(500).json({
      error: 'Failed to fetch ad hoc charges list',
      details: error.message,
      stack: process.env.NODE_ENV === 'development' ? error.stack : undefined
    });
  }
}));

// GET /api/entity-lists/lessons - List lessons/appointments with search and filters
router.get('/lessons', auth, asyncHandler(async (req, res) => {
  try {
    const pool = getLocationPool(req);
    const { 
      search, 
      status, 
      service_id, 
      start_date, 
      end_date, 
      tutor_id,
      student_id,
      client_id,
      location,
      invoice_status,
      page = 1, 
      limit = 50 
    } = req.query;
    
    // Build WHERE conditions and JOINs
    // Use JOINs instead of EXISTS for better performance
    const params = [];
    let paramCount = 0;
    let whereConditions = [];
    let joins = ['JOIN services s ON a.service_id = s.service_id'];
    
    if (search) {
      paramCount++;
      whereConditions.push(`(
        a.topic ILIKE $${paramCount} OR
        s.name ILIKE $${paramCount}
      )`);
      params.push(`%${search}%`);
    }
    
    if (status) {
      paramCount++;
      whereConditions.push(`a.status = $${paramCount}`);
      params.push(status);
    }
    
    if (service_id) {
      paramCount++;
      whereConditions.push(`a.service_id = $${paramCount}`);
      params.push(parseInt(service_id));
    }
    
    if (start_date) {
      paramCount++;
      whereConditions.push(`a.start >= $${paramCount}`);
      params.push(start_date);
    }
    
    if (end_date) {
      paramCount++;
      whereConditions.push(`a.start <= $${paramCount}`);
      params.push(end_date);
    }
    
    // Filter by tutor (contractor) - use JOIN instead of EXISTS
    if (tutor_id) {
      joins.push(`JOIN appointment_contractors ac_tutor ON ac_tutor.appointment_id = a.appointment_id`);
      paramCount++;
      whereConditions.push(`ac_tutor.contractor_id = $${paramCount}`);
      params.push(parseInt(tutor_id));
    }
    
    // Filter by student (recipient) - use JOIN instead of EXISTS
    let arAlias = 'ar_student';
    if (student_id) {
      joins.push(`JOIN appointment_recipients ${arAlias} ON ${arAlias}.appointment_id = a.appointment_id`);
      paramCount++;
      whereConditions.push(`${arAlias}.recipient_id = $${paramCount}`);
      params.push(parseInt(student_id));
    }
    
    // Filter by client (paying client) - use JOIN instead of EXISTS
    if (client_id) {
      // Reuse student join if it exists, otherwise create new one
      if (!student_id) {
        arAlias = 'ar_client';
        joins.push(`JOIN appointment_recipients ${arAlias} ON ${arAlias}.appointment_id = a.appointment_id`);
      }
      paramCount++;
      whereConditions.push(`${arAlias}.paying_client_id = $${paramCount}`);
      params.push(parseInt(client_id));
    }
    
    // Filter by location (from service labels or appointment location)
    if (location) {
      paramCount++;
      whereConditions.push(`(
        EXISTS (
          SELECT 1 FROM jsonb_array_elements_text(s.labels) AS label_elem
          WHERE label_elem ILIKE $${paramCount}
        ) OR
        a.location ILIKE $${paramCount}
      )`);
      params.push(`%${location}%`);
    }
    
    // Filter by invoice status (this would need a join to invoices table if it exists)
    // For now, we'll skip this as it requires invoice data structure
    
    const whereClause = whereConditions.length > 0 ? ` AND ${whereConditions.join(' AND ')}` : '';
    const joinsClause = joins.join(' ');
    
    // Optimized query: Use DISTINCT ON directly without subquery for better performance
    const offset = (parseInt(page) - 1) * parseInt(limit);
    
    let query = `
      SELECT DISTINCT ON (a.appointment_id)
        a.appointment_id,
        a.start,
        a.finish,
        a.status,
        a.topic,
        a.service_id,
        a.location,
        s.name as service_name
      FROM appointments a
      ${joinsClause}
      WHERE 1=1${whereClause}
      ORDER BY a.appointment_id, a.start DESC
      LIMIT $${paramCount + 1}
      OFFSET $${paramCount + 2}
    `;
    
    paramCount++;
    params.push(parseInt(limit));
    paramCount++;
    params.push(offset);
    
    const { rows } = await pool.query(query, params);
    
    // Get total count - reuse same JOINs and WHERE conditions
    // Note: count query doesn't need LIMIT/OFFSET, so exclude those params
    let countQuery = `
      SELECT COUNT(DISTINCT a.appointment_id) as total 
      FROM appointments a
      ${joinsClause}
      WHERE 1=1${whereClause}
    `;
    
    // Create params array without LIMIT and OFFSET (last 2 params)
    const countParams = params.slice(0, -2);
    
    const { rows: countRows } = await pool.query(countQuery, countParams);
    const total = parseInt(countRows[0].total);
    
    // Get counts for each status tab
    let tabCounts = { all: total };
    try {
      const statusCountsQuery = `
        SELECT 
          status,
          COUNT(*) as count
        FROM appointments
        GROUP BY status
      `;
      const { rows: statusRows } = await pool.query(statusCountsQuery);
      statusRows.forEach(row => {
        // Map status values to tab keys
        const statusMap = {
          'planned': 'planned',
          'complete': 'complete',
          'cancelled': 'cancelled',
          'cancelled-chargeable': 'cancelled'
        };
        const tabKey = statusMap[row.status] || row.status;
        if (tabCounts[tabKey]) {
          tabCounts[tabKey] += parseInt(row.count);
        } else {
          tabCounts[tabKey] = parseInt(row.count);
        }
      });
    } catch (countError) {
      logger.error({ err: countError }, 'Error fetching status counts:');
    }
    
    res.json({
      lessons: rows,
      pagination: {
        page: parseInt(page),
        limit: parseInt(limit),
        total,
        totalPages: Math.ceil(total / parseInt(limit))
      },
      tabCounts
    });
  } catch (error) {
    logger.error({ err: error }, 'Error fetching lessons list:');
    res.status(500).json({ error: 'Failed to fetch lessons list' });
  }
}));

// GET /api/entity-lists/affiliates - List affiliates with search and filters
router.get('/affiliates', auth, asyncHandler(async (req, res) => {
  try {
    const pool = getLocationPool(req);
    if (!pool) {
      logger.error('No database pool available');
      return res.status(500).json({ error: 'Database connection not available' });
    }
    
    const { 
      search, 
      status, 
      page = 1, 
      limit = 50,
      tab // For tab filtering (all, active, inactive)
    } = req.query;
    
    // Check if affiliates table exists (cached)
    const affExists = await tableExists(pool, 'affiliates');

    if (!affExists) {
      // Table doesn't exist, return empty result
      return res.json({
        data: [],
        pagination: {
          page: parseInt(page),
          limit: parseInt(limit),
          total: 0,
          totalPages: 0
        },
        tabCounts: {
          all: 0,
          active: 0,
          inactive: 0
        }
      });
    }
    
    const offset = (parseInt(page) - 1) * parseInt(limit);
    const params = [];
    let paramCount = 0;
    let whereConditions = ['1=1'];
    
    // Search functionality
    if (search) {
      paramCount++;
      whereConditions.push(`(
        name ILIKE $${paramCount} OR
        email ILIKE $${paramCount}
      )`);
      params.push(`%${search}%`);
    }
    
    // Status filtering
    if (status) {
      paramCount++;
      whereConditions.push(`status = $${paramCount}`);
      params.push(status);
    } else if (tab === 'active') {
      whereConditions.push(`status = 'active'`);
    } else if (tab === 'inactive') {
      whereConditions.push(`status = 'inactive'`);
    }
    
    const whereClause = whereConditions.join(' AND ');
    
    // Get total count for pagination
    const countQuery = `SELECT COUNT(*) FROM affiliates WHERE ${whereClause}`;
    const countResult = await pool.query(countQuery, params);
    const total = parseInt(countResult.rows[0].count);
    
    // Get tab counts
    const tabCountsQuery = await pool.query(`
      SELECT 
        COUNT(*) FILTER (WHERE status = 'active') as active,
        COUNT(*) FILTER (WHERE status = 'inactive') as inactive,
        COUNT(*) as all_count
      FROM affiliates
      ${search ? `WHERE (name ILIKE $1 OR email ILIKE $1)` : ''}
    `, search ? [`%${search}%`] : []);
    
    const tabCounts = {
      all: parseInt(tabCountsQuery.rows[0].all_count),
      active: parseInt(tabCountsQuery.rows[0].active || 0),
      inactive: parseInt(tabCountsQuery.rows[0].inactive || 0)
    };
    
    // Get paginated data
    const dataQuery = `
      SELECT 
        id,
        name,
        email,
        phone,
        status,
        date_created,
        created_at,
        updated_at
      FROM affiliates
      WHERE ${whereClause}
      ORDER BY date_created DESC NULLS LAST, created_at DESC NULLS LAST
      LIMIT $${paramCount + 1} OFFSET $${paramCount + 2}
    `;
    params.push(parseInt(limit), offset);
    
    const dataResult = await pool.query(dataQuery, params);
    
    res.json({
      data: dataResult.rows,
      pagination: {
        page: parseInt(page),
        limit: parseInt(limit),
        total,
        totalPages: Math.ceil(total / parseInt(limit))
      },
      tabCounts
    });
  } catch (error) {
    logger.error({ err: error }, 'Error fetching affiliates list:');
    res.status(500).json({ 
      error: 'Failed to fetch affiliates list',
      details: error.message,
      stack: process.env.NODE_ENV === 'development' ? error.stack : undefined
    });
  }
}));

// GET /api/entity-lists/administrators - List administrators with search and filters
router.get('/administrators', asyncHandler(async (req, res) => {
  try {
    const pool = getLocationPool(req);
    if (!pool) {
      logger.error('No database pool available');
      return res.status(500).json({ error: 'Database connection not available' });
    }
    
    const { 
      search, 
      status, 
      role,
      page = 1, 
      limit = 50,
      tab // For tab filtering (all, active, inactive)
    } = req.query;
    
    // Check if administrators or users table exists (cached)
    const [adminsExist, usersExist] = await Promise.all([
      tableExists(pool, 'administrators'),
      tableExists(pool, 'users')
    ]);

    if (!adminsExist && !usersExist) {
      // Table doesn't exist, return empty result
      return res.json({
        data: [],
        pagination: {
          page: parseInt(page),
          limit: parseInt(limit),
          total: 0,
          totalPages: 0
        },
        tabCounts: {
          all: 0,
          active: 0,
          inactive: 0
        }
      });
    }
    
    // Use administrators table if it exists, otherwise fall back to users (cached)
    const useAdminsTable = adminsExist;
    const tableName = useAdminsTable ? 'administrators' : 'users';
    
    const offset = (parseInt(page) - 1) * parseInt(limit);
    const params = [];
    let paramCount = 0;
    let whereConditions = ['1=1'];
    
    // Only show admin users if using users table
    if (!useAdminsTable) {
      whereConditions.push(`(role = 'admin' OR role = 'staff')`);
    }
    
    // Search functionality
    if (search) {
      paramCount++;
      if (useAdminsTable) {
        whereConditions.push(`(
          first_name ILIKE $${paramCount} OR
          last_name ILIKE $${paramCount} OR
          email ILIKE $${paramCount}
        )`);
      } else {
        whereConditions.push(`(
          first_name ILIKE $${paramCount} OR
          last_name ILIKE $${paramCount} OR
          email ILIKE $${paramCount}
        )`);
      }
      params.push(`%${search}%`);
    }
    
    // Status filtering
    if (status) {
      paramCount++;
      whereConditions.push(`status = $${paramCount}`);
      params.push(status);
    } else if (tab === 'active') {
      whereConditions.push(`status = 'active'`);
    } else if (tab === 'inactive') {
      whereConditions.push(`status = 'inactive'`);
    }
    
    // Role filtering
    if (role) {
      paramCount++;
      whereConditions.push(`role = $${paramCount}`);
      params.push(role);
    }
    
    const whereClause = whereConditions.join(' AND ');
    
    // Get total count for pagination
    const countQuery = `SELECT COUNT(*) FROM ${tableName} WHERE ${whereClause}`;
    const countResult = await pool.query(countQuery, params);
    const total = parseInt(countResult.rows[0].count);
    
    // Get tab counts
    const tabCountsWhere = useAdminsTable ? '' : `WHERE (role = 'admin' OR role = 'staff')`;
    const tabCountsQuery = await pool.query(`
      SELECT 
        COUNT(*) FILTER (WHERE status = 'active') as active,
        COUNT(*) FILTER (WHERE status = 'inactive') as inactive,
        COUNT(*) as all_count
      FROM ${tableName}
      ${tabCountsWhere}
      ${search ? `${tabCountsWhere ? 'AND' : 'WHERE'} (first_name ILIKE $1 OR last_name ILIKE $1 OR email ILIKE $1)` : ''}
    `, search ? [`%${search}%`] : []);
    
    const tabCounts = {
      all: parseInt(tabCountsQuery.rows[0].all_count),
      active: parseInt(tabCountsQuery.rows[0].active || 0),
      inactive: parseInt(tabCountsQuery.rows[0].inactive || 0)
    };
    
    // Get paginated data
    let dataQuery;
    if (useAdminsTable) {
      dataQuery = `
        SELECT 
          id,
          first_name,
          last_name,
          email,
          role,
          status,
          last_login,
          created_at,
          updated_at
        FROM ${tableName}
        WHERE ${whereClause}
        ORDER BY created_at DESC NULLS LAST
        LIMIT $${paramCount + 1} OFFSET $${paramCount + 2}
      `;
    } else {
      dataQuery = `
        SELECT 
          id,
          first_name,
          last_name,
          email,
          role,
          'active' as status,
          created_at,
          updated_at
        FROM ${tableName}
        WHERE ${whereClause}
        ORDER BY created_at DESC NULLS LAST
        LIMIT $${paramCount + 1} OFFSET $${paramCount + 2}
      `;
    }
    params.push(parseInt(limit), offset);
    
    const dataResult = await pool.query(dataQuery, params);
    
    res.json({
      data: dataResult.rows,
      pagination: {
        page: parseInt(page),
        limit: parseInt(limit),
        total,
        totalPages: Math.ceil(total / parseInt(limit))
      },
      tabCounts
    });
  } catch (error) {
    logger.error({ err: error }, 'Error fetching administrators list:');
    res.status(500).json({ 
      error: 'Failed to fetch administrators list',
      details: error.message,
      stack: process.env.NODE_ENV === 'development' ? error.stack : undefined
    });
  }
}));

// GET /api/entity-lists/reviews - List reviews with search and filters
router.get('/reviews', auth, asyncHandler(async (req, res) => {
  try {
    const pool = getLocationPool(req);
    if (!pool) {
      logger.error('No database pool available');
      return res.status(500).json({ error: 'Database connection not available' });
    }

    // Check if reviews table exists (cached)
    const revExists = await tableExists(pool, 'reviews');

    if (!revExists) {
      logger.warn('Reviews table does not exist. Returning empty array.');
      return res.json({
        data: [],
        'reviews': [],
        pagination: { page: 1, limit: 50, total: 0, totalPages: 0 }
      });
    }

    const {
      search,
      client_id,
      contractor_id,
      min_rating,
      max_rating,
      start_date,
      end_date,
      page = 1,
      limit = 50
    } = req.query;

    const params = [];
    let paramCount = 0;
    let whereConditions = [];

    // Base query for reviews
    let baseQuery = `
      FROM reviews r
      WHERE 1=1
    `;

    if (search) {
      paramCount++;
      whereConditions.push(`(
        r.client_name ILIKE $${paramCount} OR
        r.contractor_name ILIKE $${paramCount} OR
        r.extra_attrs_value ILIKE $${paramCount}
      )`);
      params.push(`%${search}%`);
    }

    if (client_id) {
      paramCount++;
      whereConditions.push(`r.client_id = $${paramCount}::integer`);
      params.push(parseInt(client_id));
    }

    if (contractor_id) {
      paramCount++;
      whereConditions.push(`r.contractor_id = $${paramCount}::integer`);
      params.push(parseInt(contractor_id));
    }

    // Note: Rating filtering is done in JavaScript after parsing JSON
    // because star_rating_value may contain JSON strings

    if (start_date) {
      paramCount++;
      whereConditions.push(`r.date_created >= $${paramCount}::date`);
      params.push(start_date);
    }

    if (end_date) {
      paramCount++;
      whereConditions.push(`r.date_created <= $${paramCount}::date`);
      params.push(end_date);
    }

    const whereClause = whereConditions.length > 0 ? ` AND ${whereConditions.join(' AND ')}` : '';
    const offset = (parseInt(page) - 1) * parseInt(limit);

    // Use a subquery to avoid PostgreSQL validating star_rating_value column
    // The column contains JSON strings but is defined as NUMERIC, causing type errors
    let query = `
      SELECT
        review_id as id,
        client_id,
        client_name,
        contractor_id,
        contractor_name,
        extra_attrs_value::text as review_text_raw,
        date_created
      FROM (
        SELECT
          r.review_id,
          r.client_id,
          r.client_name,
          r.contractor_id,
          r.contractor_name,
          r.extra_attrs_value,
          r.date_created
        ${baseQuery} ${whereClause}
      ) as safe_reviews
      ORDER BY date_created DESC, review_id DESC
      LIMIT $${paramCount + 1}
      OFFSET $${paramCount + 2}
    `;

    paramCount++;
    params.push(parseInt(limit));
    paramCount++;
    params.push(offset);

    let rows;
    try {
      const result = await pool.query(query, params);
      rows = result.rows;
    } catch (queryError) {
      logger.error({ error: queryError.message }, 'Query error details:');
      throw queryError;
    }

    // Parse review_text JSON and extract review details
    const processedRows = rows.map(row => {
      let reviewText = null;
      let rating = null;

      // Try to parse the review_text JSON
      if (row.review_text_raw) {
        try {
          const parsed = typeof row.review_text_raw === 'string' 
            ? JSON.parse(row.review_text_raw) 
            : row.review_text_raw;
          
          if (Array.isArray(parsed)) {
            // Find review_details
            const reviewDetails = parsed.find(item => 
              item.machine_name === 'review_details' || item.name === 'Review Details'
            );
            if (reviewDetails && reviewDetails.value) {
              reviewText = reviewDetails.value;
            }

            // Extract rating from JSON
            const starRating = parsed.find(item => 
              item.machine_name === 'review_stars' || item.name === 'Review Rating'
            );
            if (starRating && starRating.value) {
              // Extract numeric value from strings like "5/5 stars" or "5"
              const match = starRating.value.match(/(\d+)/);
              if (match) {
                rating = parseFloat(match[1]);
              }
            }
          }
        } catch (e) {
          // If parsing fails, use raw value
          reviewText = row.review_text_raw;
        }
      }

      return {
        ...row,
        review_text: reviewText,
        rating: rating
      };
    });

    // Apply rating filters in JavaScript (after parsing JSON)
    let filteredRows = processedRows;
    if (min_rating) {
      const minRatingNum = parseFloat(min_rating);
      filteredRows = filteredRows.filter(row => row.rating !== null && row.rating >= minRatingNum);
    }
    if (max_rating) {
      const maxRatingNum = parseFloat(max_rating);
      filteredRows = filteredRows.filter(row => row.rating !== null && row.rating <= maxRatingNum);
    }

    // Get total count (before rating filtering for accurate pagination)
    let countBaseQuery = `FROM reviews r`;
    let countWhereConditions = [];
    let countParams = [];
    let countParamCount = 0;

    countBaseQuery += ` WHERE 1=1`;

    if (search) {
      countParamCount++;
      countWhereConditions.push(`(
        r.client_name ILIKE $${countParamCount} OR
        r.contractor_name ILIKE $${countParamCount} OR
        r.extra_attrs_value ILIKE $${countParamCount}
      )`);
      countParams.push(`%${search}%`);
    }

    if (client_id) {
      countParamCount++;
      countWhereConditions.push(`r.client_id = $${countParamCount}::integer`);
      countParams.push(parseInt(client_id));
    }

    if (contractor_id) {
      countParamCount++;
      countWhereConditions.push(`r.contractor_id = $${countParamCount}::integer`);
      countParams.push(parseInt(contractor_id));
    }

    // Note: Rating filtering is done in JavaScript after parsing JSON

    if (start_date) {
      countParamCount++;
      countWhereConditions.push(`r.date_created >= $${countParamCount}::date`);
      countParams.push(start_date);
    }

    if (end_date) {
      countParamCount++;
      countWhereConditions.push(`r.date_created <= $${countParamCount}::date`);
      countParams.push(end_date);
    }

    const countWhereClause = countWhereConditions.length > 0 ? ` AND ${countWhereConditions.join(' AND ')}` : '';
    let countQuery = `SELECT COUNT(*) as total ${countBaseQuery} ${countWhereClause}`;
    const { rows: countRows } = await pool.query(countQuery, countParams);
    const total = parseInt(countRows[0].total);

    // Apply pagination after filtering
    const totalAfterFilter = filteredRows.length;
    const jsOffset = (parseInt(page) - 1) * parseInt(limit);
    const paginatedRows = filteredRows.slice(jsOffset, jsOffset + parseInt(limit));

    res.json({
      data: paginatedRows,
      'reviews': paginatedRows,
      pagination: {
        page: parseInt(page),
        limit: parseInt(limit),
        total: totalAfterFilter,
        totalPages: Math.ceil(totalAfterFilter / parseInt(limit))
      }
    });
  } catch (error) {
    logger.error({ err: error }, 'Error fetching reviews list:');
    res.status(500).json({
      error: 'Failed to fetch reviews list',
      details: error.message,
      stack: process.env.NODE_ENV === 'development' ? error.stack : undefined
    });
  }
}));

// GET /api/entity-lists/reports - List client reports with search and filters
router.get('/reports', asyncHandler(async (req, res) => {
  try {
    const pool = getLocationPool(req);
    if (!pool) {
      logger.error('No database pool available');
      return res.status(500).json({ error: 'Database connection not available' });
    }

    // Check if client_reports table exists (cached)
    const crExists = await tableExists(pool, 'client_reports');

    if (!crExists) {
      logger.warn('Client reports table does not exist. Returning empty array.');
      return res.json({
        data: [],
        'reports': [],
        pagination: { page: 1, limit: 50, total: 0, totalPages: 0 }
      });
    }

    const {
      search,
      status,
      tutor_name,
      client_name,
      student_name,
      template_name,
      start_date,
      end_date,
      page = 1,
      limit = 50
    } = req.query;

    const params = [];
    let paramCount = 0;
    let whereConditions = [];

    // Base query for reports
    let baseQuery = `
      FROM client_reports r
      WHERE 1=1
    `;

    if (search) {
      paramCount++;
      whereConditions.push(`(
        r.tutor_name ILIKE $${paramCount} OR
        r.client_name ILIKE $${paramCount} OR
        r.student_name ILIKE $${paramCount} OR
        r.client_email ILIKE $${paramCount} OR
        r.tutor_feedback ILIKE $${paramCount} OR
        r.template_name ILIKE $${paramCount}
      )`);
      params.push(`%${search}%`);
    }

    if (status) {
      paramCount++;
      whereConditions.push(`r.status = $${paramCount}`);
      params.push(status);
    }

    if (tutor_name) {
      paramCount++;
      whereConditions.push(`r.tutor_name ILIKE $${paramCount}`);
      params.push(`%${tutor_name}%`);
    }

    if (client_name) {
      paramCount++;
      whereConditions.push(`r.client_name ILIKE $${paramCount}`);
      params.push(`%${client_name}%`);
    }

    if (student_name) {
      paramCount++;
      whereConditions.push(`r.student_name ILIKE $${paramCount}`);
      params.push(`%${student_name}%`);
    }

    if (template_name) {
      paramCount++;
      whereConditions.push(`r.template_name = $${paramCount}`);
      params.push(template_name);
    }

    if (start_date) {
      paramCount++;
      whereConditions.push(`r.date_sent >= $${paramCount}::date`);
      params.push(start_date);
    }

    if (end_date) {
      paramCount++;
      whereConditions.push(`r.date_sent <= $${paramCount}::date`);
      params.push(end_date);
    }

    const whereClause = whereConditions.length > 0 ? ` AND ${whereConditions.join(' AND ')}` : '';
    const offset = (parseInt(page) - 1) * parseInt(limit);

    let query = `
      SELECT
        r.id,
        r.date_sent,
        r.tutor_name,
        r.client_name,
        r.student_name,
        r.client_email,
        r.template_name,
        r.tutor_feedback,
        r.status,
        r.sent_at,
        r.brevo_message_id,
        r.email_opened_at,
        r.email_clicked_at,
        r.email_opened_count,
        r.email_clicked_count
      ${baseQuery} ${whereClause}
      ORDER BY COALESCE(r.sent_at, r.date_sent) DESC, r.id DESC
      LIMIT $${paramCount + 1}
      OFFSET $${paramCount + 2}
    `;

    paramCount++;
    params.push(parseInt(limit));
    paramCount++;
    params.push(offset);

    const { rows } = await pool.query(query, params);

    // Get total count
    let countBaseQuery = `FROM client_reports r`;
    let countWhereConditions = [];
    let countParams = [];
    let countParamCount = 0;

    countBaseQuery += ` WHERE 1=1`;

    if (search) {
      countParamCount++;
      countWhereConditions.push(`(
        r.tutor_name ILIKE $${countParamCount} OR
        r.client_name ILIKE $${countParamCount} OR
        r.student_name ILIKE $${countParamCount} OR
        r.client_email ILIKE $${countParamCount} OR
        r.tutor_feedback ILIKE $${countParamCount} OR
        r.template_name ILIKE $${countParamCount}
      )`);
      countParams.push(`%${search}%`);
    }

    if (status) {
      countParamCount++;
      countWhereConditions.push(`r.status = $${countParamCount}`);
      countParams.push(status);
    }

    if (tutor_name) {
      countParamCount++;
      countWhereConditions.push(`r.tutor_name ILIKE $${countParamCount}`);
      countParams.push(`%${tutor_name}%`);
    }

    if (client_name) {
      countParamCount++;
      countWhereConditions.push(`r.client_name ILIKE $${countParamCount}`);
      countParams.push(`%${client_name}%`);
    }

    if (student_name) {
      countParamCount++;
      countWhereConditions.push(`r.student_name ILIKE $${countParamCount}`);
      countParams.push(`%${student_name}%`);
    }

    if (template_name) {
      countParamCount++;
      countWhereConditions.push(`r.template_name = $${countParamCount}`);
      countParams.push(template_name);
    }

    if (start_date) {
      countParamCount++;
      countWhereConditions.push(`r.date_sent >= $${countParamCount}::date`);
      countParams.push(start_date);
    }

    if (end_date) {
      countParamCount++;
      countWhereConditions.push(`r.date_sent <= $${countParamCount}::date`);
      countParams.push(end_date);
    }

    const countWhereClause = countWhereConditions.length > 0 ? ` AND ${countWhereConditions.join(' AND ')}` : '';
    let countQuery = `SELECT COUNT(*) as total ${countBaseQuery} ${countWhereClause}`;
    const { rows: countRows } = await pool.query(countQuery, countParams);
    const total = parseInt(countRows[0].total);

    res.json({
      data: rows,
      'reports': rows,
      pagination: {
        page: parseInt(page),
        limit: parseInt(limit),
        total,
        totalPages: Math.ceil(total / parseInt(limit))
      }
    });
  } catch (error) {
    logger.error({ err: error }, 'Error fetching reports list:');
    res.status(500).json({
      error: 'Failed to fetch reports list',
      details: error.message,
      stack: process.env.NODE_ENV === 'development' ? error.stack : undefined
    });
  }
}));

// GET /api/entity-lists/packages - List packages with search and filters
router.get('/packages', auth, asyncHandler(async (req, res) => {
  try {
    const pool = getLocationPool(req);
    if (!pool) {
      logger.error('No database pool available');
      return res.status(500).json({ error: 'Database connection not available' });
    }

    // Check if packages table exists (cached)
    const pkgExists = await tableExists(pool, 'packages');

    if (!pkgExists) {
      logger.warn('Packages table does not exist. Returning empty array.');
      return res.json({
        data: [],
        'packages': [],
        pagination: { page: 1, limit: 50, total: 0, totalPages: 0 }
      });
    }

    const {
      search,
      status,
      page = 1,
      limit = 50
    } = req.query;

    const params = [];
    let paramCount = 0;
    let whereConditions = [];

    let baseQuery = `
      FROM packages p
      WHERE 1=1
    `;

    if (search) {
      paramCount++;
      whereConditions.push(`(
        p.name ILIKE $${paramCount} OR
        p.description ILIKE $${paramCount}
      )`);
      params.push(`%${search}%`);
    }

    if (status) {
      paramCount++;
      whereConditions.push(`p.active = $${paramCount}::boolean`);
      params.push(status === 'active');
    }

    const whereClause = whereConditions.length > 0 ? ` AND ${whereConditions.join(' AND ')}` : '';
    const offset = (parseInt(page) - 1) * parseInt(limit);

    let query = `
      SELECT
        p.id,
        p.name,
        p.description,
        p.cost,
        p.bonus_credit,
        p.total_value,
        COALESCE(p.total_value, p.cost + COALESCE(p.bonus_credit, 0)) as calculated_total_value,
        p.active,
        p.times_bought,
        p.icon,
        p.icon_colour,
        p.sort_index,
        p.date_created,
        p.last_updated
      ${baseQuery} ${whereClause}
      ORDER BY p.sort_index DESC, p.date_created DESC, p.id DESC
      LIMIT $${paramCount + 1} OFFSET $${paramCount + 2}
    `;

    paramCount++;
    params.push(parseInt(limit));
    paramCount++;
    params.push(offset);

    const { rows } = await pool.query(query, params);

    // Get total count
    let countBaseQuery = `FROM packages p`;
    let countWhereConditions = [];
    let countParams = [];
    let countParamCount = 0;

    countBaseQuery += ` WHERE 1=1`;

    if (search) {
      countParamCount++;
      countWhereConditions.push(`(
        p.name ILIKE $${countParamCount} OR
        p.description ILIKE $${countParamCount}
      )`);
      countParams.push(`%${search}%`);
    }

    if (status) {
      countParamCount++;
      countWhereConditions.push(`p.active = $${countParamCount}::boolean`);
      countParams.push(status === 'active');
    }

    const countWhereClause = countWhereConditions.length > 0 ? ` AND ${countWhereConditions.join(' AND ')}` : '';
    let countQuery = `SELECT COUNT(*) as total ${countBaseQuery} ${countWhereClause}`;
    const { rows: countRows } = await pool.query(countQuery, countParams);
    const total = parseInt(countRows[0].total);

    res.json({
      data: rows,
      'packages': rows,
      pagination: {
        page: parseInt(page),
        limit: parseInt(limit),
        total,
        totalPages: Math.ceil(total / parseInt(limit))
      }
    });
  } catch (error) {
    logger.error({ err: error }, 'Error fetching packages list:');
    res.status(500).json({
      error: 'Failed to fetch packages list',
      details: error.message,
      stack: process.env.NODE_ENV === 'development' ? error.stack : undefined
    });
  }
}));

// GET /api/entity-lists/subscriptions - List subscriptions with search and filters
router.get('/subscriptions', asyncHandler(async (req, res) => {
  try {
    const pool = getLocationPool(req);
    if (!pool) {
      logger.error('No database pool available');
      return res.status(500).json({ error: 'Database connection not available' });
    }

    // Check if subscriptions table exists (cached)
    const subExists = await tableExists(pool, 'subscriptions');

    if (!subExists) {
      logger.warn('Subscriptions table does not exist. Returning empty array.');
      return res.json({
        data: [],
        'subscriptions': [],
        pagination: { page: 1, limit: 50, total: 0, totalPages: 0 }
      });
    }

    const {
      search,
      status,
      client,
      service,
      page = 1,
      limit = 50
    } = req.query;

    const params = [];
    let paramCount = 0;
    let whereConditions = [];

    let baseQuery = `
      FROM subscriptions s
      LEFT JOIN clients c ON s.client_id::text = c.client_id
      LEFT JOIN services sv ON s.service_id::integer = sv.service_id
      WHERE 1=1
    `;

    if (search) {
      paramCount++;
      whereConditions.push(`(
        s.name ILIKE $${paramCount} OR
        c.first_name ILIKE $${paramCount} OR
        c.last_name ILIKE $${paramCount} OR
        sv.name ILIKE $${paramCount}
      )`);
      params.push(`%${search}%`);
    }

    if (status) {
      paramCount++;
      whereConditions.push(`s.status = $${paramCount}`);
      params.push(status);
    }

    if (client) {
      paramCount++;
      whereConditions.push(`(c.first_name ILIKE $${paramCount} OR c.last_name ILIKE $${paramCount})`);
      params.push(`%${client}%`);
    }

    if (service) {
      paramCount++;
      whereConditions.push(`sv.name ILIKE $${paramCount}`);
      params.push(`%${service}%`);
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
        s.id,
        s.name,
        s.client_id,
        s.service_id,
        s.amount,
        s.frequency,
        s.status,
        s.start_date,
        s.end_date,
        s.next_billing_date,
        s.notes,
        s.date_created,
        s.last_updated,
        COALESCE(c.first_name || ' ' || c.last_name, '') as client_name,
        COALESCE(sv.name, '') as service_name
      ${baseQuery}${whereClause}
      ORDER BY s.date_created DESC, s.id DESC
      LIMIT $${paramCount - 1} OFFSET $${paramCount}
    `;

    const { rows } = await pool.query(selectQuery, params);

    res.json({
      data: rows,
      'subscriptions': rows,
      pagination: {
        page: parseInt(page, 10),
        limit: parseInt(limit, 10),
        total,
        totalPages: Math.ceil(total / parseInt(limit, 10))
      }
    });
  } catch (error) {
    logger.error({ err: error }, 'Error fetching subscriptions list:');
    res.status(500).json({
      error: 'Failed to fetch subscriptions list',
      details: error.message,
      stack: process.env.NODE_ENV === 'development' ? error.stack : undefined
    });
  }
}));

// GET /api/entity-lists/documents - List documents with search and filters
router.get('/documents', auth, asyncHandler(async (req, res) => {
  try {
    const pool = getLocationPool(req);
    if (!pool) {
      logger.error('No database pool available');
      return res.status(500).json({ error: 'Database connection not available' });
    }

    // Check if documents table exists (cached)
    const docExists = await tableExists(pool, 'documents');

    if (!docExists) {
      logger.warn('Documents table does not exist. Returning empty array.');
      return res.json({
        data: [],
        'documents': [],
        pagination: { page: 1, limit: 50, total: 0, totalPages: 0 }
      });
    }

    const {
      search,
      type,
      client,
      tutor,
      page = 1,
      limit = 50
    } = req.query;

    const params = [];
    let paramCount = 0;
    let whereConditions = [];

    let baseQuery = `
      FROM documents d
      LEFT JOIN clients c ON d.client_id::text = c.client_id
      LEFT JOIN contractors ct ON d.contractor_id::integer = ct.contractor_id
      WHERE 1=1
    `;

    if (search) {
      paramCount++;
      whereConditions.push(`(
        d.name ILIKE $${paramCount} OR
        d.description ILIKE $${paramCount} OR
        d.file_name ILIKE $${paramCount}
      )`);
      params.push(`%${search}%`);
    }

    if (type) {
      paramCount++;
      whereConditions.push(`d.type = $${paramCount}`);
      params.push(type);
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
        d.id,
        d.name,
        d.description,
        d.file_name,
        d.file_path,
        d.file_size,
        d.type,
        d.client_id,
        d.contractor_id,
        d.date_created,
        d.last_updated,
        COALESCE(c.first_name || ' ' || c.last_name, '') as client_name,
        COALESCE(ct.first_name || ' ' || ct.last_name, '') as contractor_name
      ${baseQuery}${whereClause}
      ORDER BY d.date_created DESC, d.id DESC
      LIMIT $${paramCount - 1} OFFSET $${paramCount}
    `;

    const { rows } = await pool.query(selectQuery, params);

    res.json({
      data: rows,
      'documents': rows,
      pagination: {
        page: parseInt(page, 10),
        limit: parseInt(limit, 10),
        total,
        totalPages: Math.ceil(total / parseInt(limit, 10))
      }
    });
  } catch (error) {
    logger.error({ err: error }, 'Error fetching documents list:');
    res.status(500).json({
      error: 'Failed to fetch documents list',
      details: error.message,
      stack: process.env.NODE_ENV === 'development' ? error.stack : undefined
    });
  }
}));

// GET /api/entity-lists/broadcasts - List broadcasts with search and filters
router.get('/outbound-emails', asyncHandler(async (req, res) => {
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
        cr.tutor_feedback
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
    logger.error({ err: error }, 'Error fetching outbound emails list:');
    res.status(500).json({
      error: 'Failed to fetch outbound emails list',
      details: error.message,
      stack: process.env.NODE_ENV === 'development' ? error.stack : undefined
    });
  }
}));

router.get('/broadcasts', asyncHandler(async (req, res) => {
  try {
    const pool = getLocationPool(req);
    if (!pool) {
      logger.error('No database pool available');
      return res.status(500).json({ error: 'Database connection not available' });
    }

    // Check if broadcasts table exists (cached)
    const bcExists = await tableExists(pool, 'broadcasts');

    if (!bcExists) {
      logger.warn('Broadcasts table does not exist. Returning empty array.');
      return res.json({
        data: [],
        'broadcasts': [],
        pagination: { page: 1, limit: 50, total: 0, totalPages: 0 }
      });
    }

    const {
      search,
      status,
      page = 1,
      limit = 50
    } = req.query;

    const params = [];
    let paramCount = 0;
    let whereConditions = [];

    let baseQuery = `
      FROM broadcasts b
      WHERE 1=1
    `;

    if (search) {
      paramCount++;
      whereConditions.push(`b.subject ILIKE $${paramCount}`);
      params.push(`%${search}%`);
    }

    if (status) {
      paramCount++;
      whereConditions.push(`b.status = $${paramCount}`);
      params.push(status);
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
        b.id,
        b.subject,
        b.send_to,
        b.status_filter,
        b.label_filter,
        b.email_style,
        b.email_body,
        b.recipient_count,
        b.date_created,
        b.last_sent,
        b.last_updated
      ${baseQuery}${whereClause}
      ORDER BY b.date_created DESC, b.id DESC
      LIMIT $${paramCount - 1} OFFSET $${paramCount}
    `;

    const { rows } = await pool.query(selectQuery, params);

    res.json({
      data: rows,
      'broadcasts': rows,
      pagination: {
        page: parseInt(page, 10),
        limit: parseInt(limit, 10),
        total,
        totalPages: Math.ceil(total / parseInt(limit, 10))
      }
    });
  } catch (error) {
    logger.error({ err: error }, 'Error fetching broadcasts list:');
    res.status(500).json({
      error: 'Failed to fetch broadcasts list',
      details: error.message,
      stack: process.env.NODE_ENV === 'development' ? error.stack : undefined
    });
  }
}));

// GET /api/entity-lists/calendar/events - Optimized endpoint for calendar view
// This endpoint is specifically optimized for calendar displays with minimal data transfer
router.get('/calendar/events', auth, asyncHandler(async (req, res) => {
  try {
    const pool = getLocationPool(req);
    if (!pool) {
      return res.status(500).json({ error: 'Database connection not available' });
    }
    
    const { 
      start_date, 
      end_date, 
      tutor_id,
      student_id,
      client_id,
      service_id,
      status,
      location,
      labels
    } = req.query;
    
    if (!start_date || !end_date) {
      return res.status(400).json({ error: 'start_date and end_date are required' });
    }

    // Create cache key from query parameters
    const cacheKey = JSON.stringify({
      start_date,
      end_date,
      tutor_id,
      student_id,
      client_id,
      service_id,
      status,
      location,
      labels
    });

    // Check cache first
    const cachedResult = calendarCache.get(cacheKey);
    if (cachedResult) {
      return res.json({
        ...cachedResult,
        cached: true,
        cacheAge: Math.floor((Date.now() - cachedResult.cachedAt) / 1000) // Age in seconds
      });
    }

    const params = [];
    let paramCount = 0;
    const whereConditions = [];
    
    // Date range filter (most important for calendar)
    paramCount++;
    whereConditions.push(`a.start >= $${paramCount}`);
    params.push(start_date);
    
    paramCount++;
    whereConditions.push(`a.start <= $${paramCount}`);
    params.push(end_date);
    
    // Status filter
    if (status) {
      paramCount++;
      whereConditions.push(`a.status = $${paramCount}`);
      params.push(status);
    }
    
    // Service filter
    if (service_id) {
      paramCount++;
      whereConditions.push(`a.service_id = $${paramCount}`);
      params.push(parseInt(service_id));
    }
    
    // Location filter
    if (location) {
      paramCount++;
      whereConditions.push(`(
        EXISTS (
          SELECT 1 FROM jsonb_array_elements_text(s.labels) AS label_elem
          WHERE label_elem ILIKE $${paramCount}
        ) OR
        a.location ILIKE $${paramCount}
      )`);
      params.push(`%${location}%`);
    }
    
    // Labels filter (for club filtering, etc.)
    if (labels) {
      try {
        const labelArray = typeof labels === 'string' ? JSON.parse(labels) : labels;
        if (Array.isArray(labelArray) && labelArray.length > 0) {
          const labelConditions = labelArray.map((label, idx) => {
            paramCount++;
            params.push(`%${label}%`);
            return `lbl.value ILIKE $${paramCount}`;
          }).join(' OR ');
          whereConditions.push(`(
            EXISTS (
              SELECT 1 
              FROM jsonb_array_elements_text(COALESCE(s.labels, '[]'::jsonb)) AS lbl(value)
              WHERE ${labelConditions}
            )
          )`);
        }
      } catch (e) {
        logger.error({ error: e }, 'Error parsing labels parameter:');
      }
    }
    
    // Tutor filter - use INNER JOIN instead of EXISTS for better performance
    let tutorJoin = '';
    if (tutor_id) {
      tutorJoin = `JOIN appointment_contractors ac ON ac.appointment_id = a.appointment_id`;
      paramCount++;
      whereConditions.push(`ac.contractor_id = $${paramCount}`);
      params.push(parseInt(tutor_id));
    }
    
    // Student/Client filter - use INNER JOIN instead of EXISTS
    // Handle both student_id and client_id with a single join when possible
    let recipientJoin = '';
    let recipientAlias = 'ar';
    if (student_id || client_id) {
      recipientJoin = `JOIN appointment_recipients ${recipientAlias} ON ${recipientAlias}.appointment_id = a.appointment_id`;
      if (student_id) {
        paramCount++;
        whereConditions.push(`${recipientAlias}.recipient_id = $${paramCount}`);
        params.push(parseInt(student_id));
      }
      if (client_id) {
        paramCount++;
        whereConditions.push(`${recipientAlias}.paying_client_id = $${paramCount}`);
        params.push(parseInt(client_id));
      }
    }
    
    const whereClause = whereConditions.length > 0 ? `WHERE ${whereConditions.join(' AND ')}` : '';
    
    // Optimized query: Only fetch fields needed for calendar display
    // Use GROUP BY instead of DISTINCT for better performance with indexes
    // Join with labels to get the service label color for calendar display
    // Reduced LIMIT for faster initial load - calendar can fetch more as needed
    const query = `
      SELECT
        a.appointment_id,
        a.start,
        a.finish,
        a.status,
        a.topic,
        a.service_id,
        a.location,
        s.name as service_name,
        s.labels as service_labels,
        (
          SELECT l.color
          FROM service_labels sl
          JOIN labels l ON sl.label_id = l.id
          WHERE sl.service_id = s.service_id
          LIMIT 1
        ) as label_color
      FROM appointments a
      JOIN services s ON a.service_id = s.service_id
      ${tutorJoin}
      ${recipientJoin}
      ${whereClause}
      GROUP BY a.appointment_id, a.start, a.finish, a.status, a.topic, a.service_id, a.location, s.name, s.labels, s.service_id
      ORDER BY a.start ASC
      LIMIT 500
    `;
    
    const startTime = Date.now();
    const { rows } = await pool.query(query, params);
    const queryTime = Date.now() - startTime;
    
    // Log slow queries for monitoring
    if (queryTime > 1000) {
      logger.warn(`Slow calendar query: ${queryTime}ms for date range ${start_date} to ${end_date}`);
    }

    // Prepare response
    const response = {
      events: rows,
      count: rows.length,
      queryTime: queryTime,
      cached: false,
      cachedAt: Date.now()
    };

    // Cache the result for 5 minutes
    calendarCache.set(cacheKey, response);

    res.json(response);
  } catch (error) {
    logger.error({ err: error }, 'Error fetching calendar events:');
    res.status(500).json({ error: 'Failed to fetch calendar events', details: error.message });
  }
}));

// ============================================================================
// POST ENDPOINTS - CREATE ENTITIES
// ============================================================================

const multer = require('multer');
const upload = multer({ storage: multer.memoryStorage() });
const axios = require('axios');
// Note: auth is imported at the top of the file (line 3-4)

// Initialize TutorCruncher API client
const tutorCruncherAPI = axios.create({
  baseURL: 'https://secure.tutorcruncher.com/api',
  headers: {
    Authorization: `token ${process.env.TUTORCRUNCHER_API_TOKEN}`,
  },
});

// Helper to upload photo to TutorCruncher
async function uploadPhotoToTutorCruncher(photoFile, entityType, entityId) {
  if (!photoFile) return null;
  
  try {
    // Convert file to base64 or use FormData
    const FormData = require('form-data');
    const formData = new FormData();
    formData.append('photo', photoFile.buffer, {
      filename: photoFile.originalname,
      contentType: photoFile.mimetype
    });

    const response = await axios.post(
      `https://secure.tutorcruncher.com/api/${entityType}/${entityId}/photo/`,
      formData,
      {
        headers: {
          ...formData.getHeaders(),
          Authorization: `token ${process.env.TUTORCRUNCHER_API_TOKEN}`,
        },
      }
    );

    return response.data.photo || null;
  } catch (error) {
    logger.error({
      msg: 'Error uploading photo to TutorCruncher',
      entityType,
      entityId,
      error: error.message
    });
    return null;
  }
}

// POST /api/entity-lists/tutors - Create a new tutor/contractor
router.post('/tutors', auth, upload.single('photo'), asyncHandler(async (req, res) => {
  try {
    const pool = getLocationPool(req);
    if (!pool) {
      return res.status(500).json({ error: 'Database connection not available' });
    }

    const {
      first_name,
      last_name,
      email,
      mobile,
      phone,
      street,
      town,
      state,
      country,
      postcode,
      timezone,
      status = 'approved',
      default_rate,
      tier_rate,
      calendar_colour = '#757575',
      receive_service_notifications = true,
      receive_sms = false,
      received_notifications,
      date_of_birth,
      pronouns,
      bio,
      rating,
      preferred_teaching_area,
      gender,
      background_check = false,
      background_check_date,
      recipient_email,
      chessable_classroom,
      tax_setup,
      clients_do_not_pay_tax = false,
      localOnly = false // Flag to create locally without TutorCruncher sync
    } = req.body;

    // Validate required fields
    if (!first_name || !last_name) {
      return res.status(400).json({ error: 'First name and last name are required' });
    }

    // Parse received_notifications if it's a JSON string
    let notificationsArray = ['broadcasts'];
    if (received_notifications) {
      try {
        notificationsArray = typeof received_notifications === 'string' 
          ? JSON.parse(received_notifications) 
          : received_notifications;
      } catch (e) {
        // Use default if parsing fails
      }
    }

    // LOCAL-ONLY MODE: Create tutor directly in local database without TutorCruncher
    if (localOnly === true || localOnly === 'true') {
      try {
        // Generate a local contractor_id (negative numbers to avoid conflicts with TutorCruncher IDs)
        // Start from -1000000 and decrement
        const maxLocalIdResult = await pool.query(`
          SELECT MIN(contractor_id::integer) as min_id
          FROM contractors
          WHERE contractor_id ~ '^-?[0-9]+$' AND contractor_id::integer < 0
        `);
        const minLocalId = maxLocalIdResult.rows[0]?.min_id ?? -1000000;
        const contractorId = minLocalId - 1; // Decrement from the minimum negative ID

        // Geocode address if provided
        let latitude = null;
        let longitude = null;
        if (street && (town || postcode)) {
          const geocodedCoords = await geocodeAddressFromComponents({ street, town, state, postcode, country });
          if (geocodedCoords) {
            latitude = geocodedCoords.lat;
            longitude = geocodedCoords.lng;
          }
        }

        // Build extra_attrs
        const extraAttrs = {};
        if (date_of_birth) extraAttrs['user_dob'] = date_of_birth;
        if (pronouns) extraAttrs['pronouns'] = pronouns;
        if (bio) extraAttrs['bio'] = bio;
        if (rating) extraAttrs['rating'] = rating;
        if (preferred_teaching_area) extraAttrs['preferred_teaching_area'] = preferred_teaching_area;
        if (gender) extraAttrs['gender'] = gender;
        if (background_check) extraAttrs['background_check'] = background_check;
        if (background_check_date) extraAttrs['background_check_date'] = background_check_date;
        if (recipient_email) extraAttrs['recipient_email'] = recipient_email;
        if (chessable_classroom) extraAttrs['chessable_classroom'] = chessable_classroom;
        if (clients_do_not_pay_tax) extraAttrs['clients_do_not_pay_tax'] = clients_do_not_pay_tax;
        if (tier_rate) extraAttrs['tier_rate'] = tier_rate;

        // Insert directly into local database
        const insertQuery = `
          INSERT INTO contractors (
            contractor_id, first_name, last_name, email, mobile, phone,
            street, town, state, country, postcode, timezone,
            status, default_rate, calendar_colour, received_notifications,
            latitude, longitude, extra_attrs, date_created, created_at, updated_at
          ) VALUES (
            $1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12,
            $13, $14, $15, $16, $17, $18, $19, NOW(), NOW(), NOW()
          )
          RETURNING *
        `;

        const insertParams = [
          contractorId,
          first_name,
          last_name,
          email || null,
          mobile || null,
          phone || null,
          street || null,
          town || null,
          state || null,
          country || null,
          postcode || null,
          timezone || null,
          status,
          default_rate ? parseFloat(default_rate) : null,
          calendar_colour,
          JSON.stringify(notificationsArray),
          latitude,
          longitude,
          Object.keys(extraAttrs).length > 0 ? JSON.stringify(extraAttrs) : null
        ];

        const result = await pool.query(insertQuery, insertParams);
        const createdTutor = result.rows[0];

        logger.info({
          msg: 'Created contractor locally (localOnly mode)',
          contractorId,
          email,
          localOnly: true
        });

        // Invalidate contractor caches
        await clearCacheByPrefix('contractors');

        return res.status(201).json({
          success: true,
          tutor: {
            contractor_id: createdTutor.contractor_id,
            first_name: createdTutor.first_name,
            last_name: createdTutor.last_name,
            email: createdTutor.email,
            status: createdTutor.status
          },
          message: 'Tutor created successfully (local only - not synced to TutorCruncher)',
          localOnly: true
        });
      } catch (localError) {
        logger.error({
          msg: 'Error creating tutor locally',
          error: localError.message,
          stack: localError.stack
        });

        // Check for duplicate email
        if (localError.code === '23505' && localError.constraint?.includes('email')) {
          return res.status(400).json({
            error: `A tutor with email ${email} already exists`,
            details: localError.message,
            localOnly: true
          });
        }

        return res.status(500).json({
          error: 'Failed to create tutor locally',
          details: localError.message,
          localOnly: true
        });
      }
    }

    // TUTORCRUNCHER MODE: Create tutor in TutorCruncher (default behavior)
    // Build TutorCruncher payload
    const contractorPayload = {
      first_name,
      last_name,
      email: email || undefined,
      mobile: mobile || undefined,
      phone: phone || undefined,
      street: street || undefined,
      town: town || undefined,
      state: state || undefined,
      country: country || undefined,
      postcode: postcode || undefined,
      timezone: timezone || undefined,
      status,
      default_rate: default_rate ? parseFloat(default_rate) : undefined,
      receive_service_notifications: receive_service_notifications === true || receive_service_notifications === 'true',
      calendar_colour: calendar_colour || '#757575',
      change_via_branch: true,
      send_emails: false, // Don't send welcome email automatically
    };

    // Add tax_setup if provided
    if (tax_setup) {
      contractorPayload.contractor_tax_setup = tax_setup;
    }

    // Add extra_attrs for custom fields
    const extraAttrs = {};
    if (date_of_birth) extraAttrs['user_dob'] = date_of_birth;
    if (pronouns) extraAttrs['pronouns'] = pronouns;
    if (bio) extraAttrs['bio'] = bio;
    if (rating) extraAttrs['rating'] = rating;
    if (preferred_teaching_area) extraAttrs['preferred_teaching_area'] = preferred_teaching_area;
    if (gender) extraAttrs['gender'] = gender;
    if (background_check) extraAttrs['background_check'] = background_check;
    if (background_check_date) extraAttrs['background_check_date'] = background_check_date;
    if (recipient_email) extraAttrs['recipient_email'] = recipient_email;
    if (chessable_classroom) extraAttrs['chessable_classroom'] = chessable_classroom;
    if (clients_do_not_pay_tax) extraAttrs['clients_do_not_pay_tax'] = clients_do_not_pay_tax;
    
    if (Object.keys(extraAttrs).length > 0) {
      contractorPayload.extra_attrs = extraAttrs;
    }

    // Create contractor in TutorCruncher
    const tcResponse = await tutorCruncherAPI.post('/contractors/', contractorPayload);
    const contractorId = tcResponse.data.id;
    const contractorData = tcResponse.data;

    logger.info({
      msg: 'Created contractor in TutorCruncher',
      contractorId,
      email
    });

    // Upload photo if provided
    if (req.file) {
      await uploadPhotoToTutorCruncher(req.file, 'contractors', contractorId);
    }

    // Geocode address locally (TutorCruncher also geocodes automatically)
    // This ensures we have lat/lng stored locally even when we stop using TutorCruncher
    // The webhook will sync TutorCruncher's lat/lng, but local geocoding prepares us for the future
    if (street && (town || postcode)) {
      const geocodedCoords = await geocodeAddressFromComponents({ street, town, state, postcode, country });
      if (geocodedCoords) {
        // Optionally update TutorCruncher with our geocoded coordinates
        // (TutorCruncher will geocode it themselves, but this ensures consistency)
        try {
          await tutorCruncherAPI.patch(`/contractors/${contractorId}/`, {
            latitude: geocodedCoords.lat,
            longitude: geocodedCoords.lng
          });
        } catch (updateError) {
          // Non-critical - TutorCruncher will geocode it themselves, webhook will sync it
          logger.debug('Failed to update TutorCruncher with geocoded coordinates (non-critical):', updateError.message);
        }
      }
    }

    // The webhook will sync the contractor to local database with TutorCruncher's lat/lng
    // Our local geocoding above ensures we're prepared for when we stop using TutorCruncher

    res.status(201).json({
      success: true,
      tutor: {
        contractor_id: contractorId,
        first_name: contractorData.first_name,
        last_name: contractorData.last_name,
        email: contractorData.email,
        status: contractorData.status
      },
      message: 'Tutor created successfully'
    });
  } catch (error) {
    logger.error({
      msg: 'Error creating tutor',
      error: error.message,
      response: error.response?.data
    });

    // Handle TutorCruncher API errors
    if (error.response) {
      const tcError = error.response.data;
      let errorMessage = 'Failed to create tutor';
      let errorDetails = tcError || error.message;

      // Extract user-friendly error message from TutorCruncher response
      if (tcError) {
        // TutorCruncher often returns errors in format: { "field": "error message" }
        // or { "email": "error message" } for duplicate emails
        if (typeof tcError === 'object') {
          const errorValues = Object.values(tcError);
          if (errorValues.length > 0 && typeof errorValues[0] === 'string') {
            errorMessage = errorValues[0]; // Use the first error message
            errorDetails = tcError; // Keep full details for debugging
          } else if (tcError.error || tcError.message) {
            errorMessage = tcError.error || tcError.message;
            errorDetails = tcError;
          }
        } else if (typeof tcError === 'string') {
          errorMessage = tcError;
        }
      }

      return res.status(error.response.status || 500).json({
        error: errorMessage,
        details: errorDetails,
        tutorcruncherError: true
      });
    }

    res.status(500).json({
      error: 'Failed to create tutor',
      details: error.message
    });
  }
}));

// POST /api/entity-lists/clients - Create a new client
router.post('/clients', upload.single('photo'), asyncHandler(async (req, res) => {
  try {
    const pool = getLocationPool(req);
    if (!pool) {
      return res.status(500).json({ error: 'Database connection not available' });
    }

    const {
      title,
      first_name,
      last_name,
      email,
      mobile,
      phone,
      street,
      town,
      state,
      country,
      postcode,
      timezone,
      status = 'live',
      calendar_colour = '#FACC29',
      receive_sms = false,
      received_notifications,
      // Extra Fields
      gender,
      additional_information,
      date_of_birth,
      off_season_address,
      cancellation_policy,
      service_agreement,
      photo_release,
      client_notes,
      event_name,
      program_interest,
      format_interest,
      campaign,
      referral,
      tutor_ref,
      utm_source,
      booking_form,
      utm_medium,
      utm_campaign,
      utm_content,
      utm_term,
      // Accounting & Client Manager
      is_taxable = true,
      client_manager,
      attach_pdfs_to_payment_emails,
      auto_charge_override,
      invoice_grouping,
      localOnly = false // Flag to create locally without TutorCruncher sync
    } = req.body;

    // Validate required fields
    if (!last_name) {
      return res.status(400).json({ error: 'Last name is required' });
    }

    // Parse received_notifications if it's a JSON string
    let notificationsArray = ['broadcasts', 'apt_reminders', 'low_balance_reminders', 'invoice_reminders', 'pfi_reminders', 'invoice_payment_requests', 'pfi_payment_requests', 'lesson_scheduled'];
    if (received_notifications) {
      try {
        notificationsArray = typeof received_notifications === 'string' 
          ? JSON.parse(received_notifications) 
          : received_notifications;
      } catch (e) {
        // Use default if parsing fails
      }
    }

    // LOCAL-ONLY MODE: Create client directly in local database without TutorCruncher
    if (localOnly === true || localOnly === 'true') {
      try {
        // Generate a local client_id (negative numbers to avoid conflicts with TutorCruncher IDs)
        // Note: client_id is stored as VARCHAR, so we need to cast to integer for comparison
        const maxLocalIdResult = await pool.query(`
          SELECT MIN(client_id::integer) as min_id 
          FROM clients 
          WHERE client_id ~ '^-?[0-9]+$' AND client_id::integer < 0
        `);
        const minLocalId = maxLocalIdResult.rows[0]?.min_id ?? -1000000;
        const clientId = minLocalId - 1; // Decrement from the minimum negative ID

        // Geocode address if provided
        let latitude = null;
        let longitude = null;
        if (street && (town || postcode)) {
          const geocodedCoords = await geocodeAddressFromComponents({ street, town, state, postcode, country });
          if (geocodedCoords) {
            latitude = geocodedCoords.lat;
            longitude = geocodedCoords.lng;
          }
        }

        // Build extra_attrs
        const extraAttrs = {};
        if (gender) extraAttrs['gender'] = gender;
        if (additional_information) extraAttrs['additional_information'] = additional_information;
        if (date_of_birth) extraAttrs['client_dob'] = date_of_birth;
        if (off_season_address) extraAttrs['off_season_address'] = off_season_address;
        if (cancellation_policy) extraAttrs['cancellation_policy'] = cancellation_policy;
        if (service_agreement) extraAttrs['service_agreement'] = service_agreement;
        if (photo_release) extraAttrs['photo_release'] = photo_release;
        if (client_notes) extraAttrs['client_notes'] = client_notes;
        if (event_name) extraAttrs['event_name'] = event_name;
        if (program_interest) extraAttrs['program_interest'] = program_interest;
        if (format_interest) extraAttrs['format_interest'] = format_interest;
        if (campaign) extraAttrs['campaign'] = campaign;
        if (referral) extraAttrs['referral'] = referral;
        if (tutor_ref) extraAttrs['tutor_ref'] = tutor_ref;
        if (utm_source) extraAttrs['utm_source'] = utm_source;
        if (booking_form) extraAttrs['booking_form'] = booking_form;
        if (utm_medium) extraAttrs['utm_medium'] = utm_medium;
        if (utm_campaign) extraAttrs['utm_campaign'] = utm_campaign;
        if (utm_content) extraAttrs['utm_content'] = utm_content;
        if (utm_term) extraAttrs['utm_term'] = utm_term;

        // Calculate market from labels (if any)
        const market = null; // Will be calculated later if labels are added

        // Insert directly into local database
        const insertQuery = `
          INSERT INTO clients (
            client_id, title, first_name, last_name, email, mobile, phone,
            street, town, state, country, postcode, latitude, longitude,
            status, is_taxable, calendar_colour, timezone,
            received_notifications, labels, extra_attrs,
            associated_admin_id, market, lead_type, tc_created_at, remote_last_updated, created_at, updated_at
          ) VALUES (
            $1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14,
            $15, $16, $17, $18, $19, $20, $21, $22, $23, $24, NOW(), NOW(), NOW(), NOW()
          )
          RETURNING *
        `;

        const insertParams = [
          clientId.toString(), // Convert to string since client_id is VARCHAR
          title || null,
          first_name || '',
          last_name,
          email || null,
          mobile || null,
          phone || null,
          street || null,
          town || null,
          state || null,
          country || null,
          postcode || null,
          latitude,
          longitude,
          status,
          is_taxable === true || is_taxable === 'true',
          calendar_colour,
          timezone || null,
          JSON.stringify(notificationsArray),
          JSON.stringify([]), // labels - empty array for now
          Object.keys(extraAttrs).length > 0 ? JSON.stringify(extraAttrs) : null,
          client_manager ? parseInt(client_manager) : null,
          market,
          'New Lead' // Default lead_type for all new clients
        ];

        const result = await pool.query(insertQuery, insertParams);
        const createdClient = result.rows[0];

        logger.info({
          msg: 'Created client locally (localOnly mode)',
          clientId,
          email,
          localOnly: true
        });

        return res.status(201).json({
          success: true,
          client: {
            client_id: createdClient.client_id,
            first_name: createdClient.first_name,
            last_name: createdClient.last_name,
            email: createdClient.email,
            status: createdClient.status
          },
          message: 'Client created successfully (local only - not synced to TutorCruncher)',
          localOnly: true
        });
      } catch (localError) {
        logger.error({
          msg: 'Error creating client locally',
          error: localError.message,
          stack: localError.stack
        });

        // Check for duplicate email
        if (localError.code === '23505' && localError.constraint?.includes('email')) {
          return res.status(400).json({
            error: `A client with email ${email} already exists`,
            details: localError.message,
            localOnly: true
          });
        }

        return res.status(500).json({
          error: 'Failed to create client locally',
          details: localError.message,
          localOnly: true
        });
      }
    }

    // TUTORCRUNCHER MODE: Create client in TutorCruncher (default behavior)
    // Build TutorCruncher payload
    const clientPayload = {
      first_name: first_name || '',
      last_name,
      email: email || undefined,
      mobile: mobile || undefined,
      phone: phone || undefined,
      street: street || undefined,
      town: town || undefined,
      state: state || undefined,
      country: country || undefined,
      postcode: postcode || undefined,
      timezone: timezone || undefined,
      status,
      calendar_colour: calendar_colour || '#FACC29',
      received_notifications: notificationsArray,
      is_taxable: is_taxable === true || is_taxable === 'true',
      change_via_branch: true,
      send_emails: false, // Don't send welcome email automatically
    };

    // Add extra_attrs for custom fields
    const extraAttrs = {};
    if (gender) extraAttrs['gender'] = gender;
    if (additional_information) extraAttrs['additional_information'] = additional_information;
    if (date_of_birth) extraAttrs['client_dob'] = date_of_birth;
    if (off_season_address) extraAttrs['off_season_address'] = off_season_address;
    if (cancellation_policy) extraAttrs['cancellation_policy'] = cancellation_policy;
    if (service_agreement) extraAttrs['service_agreement'] = service_agreement;
    if (photo_release) extraAttrs['photo_release'] = photo_release;
    if (client_notes) extraAttrs['client_notes'] = client_notes;
    if (event_name) extraAttrs['event_name'] = event_name;
    if (program_interest) extraAttrs['program_interest'] = program_interest;
    if (format_interest) extraAttrs['format_interest'] = format_interest;
    if (campaign) extraAttrs['campaign'] = campaign;
    if (referral) extraAttrs['referral'] = referral;
    if (tutor_ref) extraAttrs['tutor_ref'] = tutor_ref;
    if (utm_source) extraAttrs['utm_source'] = utm_source;
    if (booking_form) extraAttrs['booking_form'] = booking_form;
    if (utm_medium) extraAttrs['utm_medium'] = utm_medium;
    if (utm_campaign) extraAttrs['utm_campaign'] = utm_campaign;
    if (utm_content) extraAttrs['utm_content'] = utm_content;
    if (utm_term) extraAttrs['utm_term'] = utm_term;

    if (Object.keys(extraAttrs).length > 0) {
      clientPayload.extra_attrs = extraAttrs;
    }

    // Add accounting/client manager fields
    if (client_manager) {
      clientPayload.associated_admin = client_manager;
    }
    if (attach_pdfs_to_payment_emails && attach_pdfs_to_payment_emails !== 'follow_branch') {
      clientPayload.attach_pdfs_to_payment_emails = attach_pdfs_to_payment_emails === 'yes';
    }
    if (auto_charge_override && auto_charge_override !== 'follow_branch') {
      clientPayload.auto_charge = auto_charge_override === 'yes' ? 1 : 0;
    }
    if (invoice_grouping && invoice_grouping !== 'follow_branch') {
      clientPayload.invoice_grouping = invoice_grouping;
    }

    // Create client in TutorCruncher
    const tcResponse = await tutorCruncherAPI.post('/clients/', clientPayload);
    const clientId = tcResponse.data.id;
    const clientData = tcResponse.data;

    logger.info({
      msg: 'Created client in TutorCruncher',
      clientId,
      email
    });

    // Upload photo if provided
    if (req.file) {
      await uploadPhotoToTutorCruncher(req.file, 'clients', clientId);
    }

    // Geocode address locally as backup (TutorCruncher also geocodes, but we want local control)
    if (street && (town || postcode)) {
      const geocodedCoords = await geocodeAddressFromComponents({ street, town, state, postcode, country });
      if (geocodedCoords) {
        try {
          await tutorCruncherAPI.patch(`/clients/${clientId}/`, {
            latitude: geocodedCoords.lat,
            longitude: geocodedCoords.lng
          });
        } catch (updateError) {
          logger.debug('Failed to update TutorCruncher with geocoded coordinates (non-critical):', updateError.message);
        }
      }
    }

    res.status(201).json({
      success: true,
      client: {
        client_id: clientId,
        first_name: clientData.first_name,
        last_name: clientData.last_name,
        email: clientData.email,
        status: clientData.status
      },
      message: 'Client created successfully'
    });
  } catch (error) {
    logger.error({
      msg: 'Error creating client',
      error: error.message,
      response: error.response?.data
    });

    if (error.response) {
      return res.status(error.response.status || 500).json({
        error: 'Failed to create client in TutorCruncher',
        details: error.response.data || error.message
      });
    }

    res.status(500).json({
      error: 'Failed to create client',
      details: error.message
    });
  }
}));

// POST /api/entity-lists/students - Create a new student/recipient
router.post('/students', auth, upload.single('photo'), asyncHandler(async (req, res) => {
  try {
    const pool = getLocationPool(req);
    if (!pool) {
      return res.status(500).json({ error: 'Database connection not available' });
    }

    const {
      title,
      first_name,
      last_name,
      email,
      mobile,
      phone,
      street,
      town,
      state,
      country,
      postcode,
      timezone,
      client_id, // Required - paying client
      calendar_colour = '#D2B48C',
      receive_sms = false,
      received_notifications,
      academic_year,
      // Extra Fields
      date_of_birth,
      gender,
      current_school,
      status,
      class_section,
      parent_name,
      localOnly = false // Flag to create locally without TutorCruncher sync
    } = req.body;

    // Validate required fields
    if (!first_name || !last_name) {
      return res.status(400).json({ error: 'First name and last name are required' });
    }

    if (!client_id) {
      return res.status(400).json({ error: 'Client ID is required' });
    }

    // Parse received_notifications if it's a JSON string
    let notificationsArray = ['broadcasts', 'apt_reminders', 'lesson_scheduled'];
    if (received_notifications) {
      try {
        notificationsArray = typeof received_notifications === 'string' 
          ? JSON.parse(received_notifications) 
          : received_notifications;
      } catch (e) {
        // Use default if parsing fails
      }
    }

    // LOCAL-ONLY MODE: Create student directly in local database without TutorCruncher
    if (localOnly === true || localOnly === 'true') {
      try {
        // Generate a local recipient_id (negative numbers to avoid conflicts with TutorCruncher IDs)
        // Note: recipient_id is stored as VARCHAR, so we need to cast to integer for comparison
        const maxLocalIdResult = await pool.query(`
          SELECT MIN(recipient_id::integer) as min_id 
          FROM recipients 
          WHERE recipient_id ~ '^-?[0-9]+$' AND recipient_id::integer < 0
        `);
        const minLocalId = maxLocalIdResult.rows[0]?.min_id ?? -1000000;
        const recipientId = minLocalId - 1; // Decrement from the minimum negative ID

        // Geocode address if provided
        let latitude = null;
        let longitude = null;
        if (street && (town || postcode)) {
          const geocodedCoords = await geocodeAddressFromComponents({ street, town, state, postcode, country });
          if (geocodedCoords) {
            latitude = geocodedCoords.lat;
            longitude = geocodedCoords.lng;
          }
        }

        // Build extra_attrs
        const extraAttrs = {};
        if (academic_year) extraAttrs['academic_year'] = academic_year;
        if (date_of_birth) extraAttrs['recipient_dob'] = date_of_birth;
        if (gender) extraAttrs['gender'] = gender;
        if (current_school) extraAttrs['current_school'] = current_school;
        if (status) extraAttrs['status'] = status;
        if (class_section) extraAttrs['class_section'] = class_section;
        if (parent_name) extraAttrs['parent_name'] = parent_name;

        // Insert directly into local database
        const insertQuery = `
          INSERT INTO recipients (
            recipient_id, first_name, last_name, email, mobile, phone,
            street, state, town, country, postcode, latitude, longitude,
            timezone, title, calendar_colour, default_rate, academic_year,
            date_of_birth, labels, extra_attrs, paying_client_id,
            associated_clients, date_created, updated_at
          ) VALUES (
            $1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14,
            $15, $16, $17, $18, $19, $20, $21, $22, $23, NOW(), NOW()
          )
          RETURNING *
        `;

        const insertParams = [
          recipientId.toString(), // Convert to string since recipient_id is VARCHAR
          first_name,
          last_name,
          email || null,
          mobile || null,
          phone || null,
          street || null,
          state || null,
          town || null,
          country || null,
          postcode || null,
          latitude,
          longitude,
          timezone || null,
          title || null,
          calendar_colour,
          null, // default_rate
          academic_year || null,
          date_of_birth || null,
          JSON.stringify([]), // labels - empty array for now
          Object.keys(extraAttrs).length > 0 ? JSON.stringify(extraAttrs) : null,
          parseInt(client_id), // paying_client_id
          JSON.stringify([parseInt(client_id)]) // associated_clients - array with paying client
        ];

        const result = await pool.query(insertQuery, insertParams);
        const createdStudent = result.rows[0];

        logger.info({
          msg: 'Created student locally (localOnly mode)',
          recipientId,
          client_id,
          localOnly: true
        });

        return res.status(201).json({
          success: true,
          student: {
            recipient_id: createdStudent.recipient_id,
            first_name: createdStudent.first_name,
            last_name: createdStudent.last_name,
            email: createdStudent.email
          },
          message: 'Student created successfully (local only - not synced to TutorCruncher)',
          localOnly: true
        });
      } catch (localError) {
        logger.error({
          msg: 'Error creating student locally',
          error: localError.message,
          stack: localError.stack
        });

        // Check for duplicate email
        if (localError.code === '23505' && localError.constraint?.includes('email')) {
          return res.status(400).json({
            error: `A student with email ${email} already exists`,
            details: localError.message,
            localOnly: true
          });
        }

        return res.status(500).json({
          error: 'Failed to create student locally',
          details: localError.message,
          localOnly: true
        });
      }
    }

    // TUTORCRUNCHER MODE: Create student in TutorCruncher (default behavior)
    // Build TutorCruncher payload
    const recipientPayload = {
      first_name,
      last_name,
      email: email || undefined,
      mobile: mobile || undefined,
      phone: phone || undefined,
      street: street || undefined,
      town: town || undefined,
      state: state || undefined,
      country: country || undefined,
      postcode: postcode || undefined,
      timezone: timezone || undefined,
      calendar_colour: calendar_colour || '#757575',
      received_notifications: notificationsArray,
      change_via_branch: true,
      send_emails: false,
    };

    // Add extra_attrs for custom fields
    const extraAttrs = {};
    if (academic_year) extraAttrs['academic_year'] = academic_year;
    if (date_of_birth) extraAttrs['recipient_dob'] = date_of_birth;
    if (gender) extraAttrs['gender'] = gender;
    if (current_school) extraAttrs['current_school'] = current_school;
    if (status) extraAttrs['status'] = status;
    if (class_section) extraAttrs['class_section'] = class_section;
    if (parent_name) extraAttrs['parent_name'] = parent_name;

    if (Object.keys(extraAttrs).length > 0) {
      recipientPayload.extra_attrs = extraAttrs;
    }

    // Create recipient in TutorCruncher
    const tcResponse = await tutorCruncherAPI.post('/recipients/', recipientPayload);
    const recipientId = tcResponse.data.id;
    const recipientData = tcResponse.data;

    logger.info({
      msg: 'Created recipient in TutorCruncher',
      recipientId,
      client_id
    });

    // Link recipient to client (paying client)
    try {
      await tutorCruncherAPI.post(`/clients/${client_id}/add_recipient/`, {
        recipient: recipientId
      });
    } catch (linkError) {
      logger.warn({
        msg: 'Failed to link recipient to client',
        recipientId,
        client_id,
        error: linkError.message
      });
      // Continue even if linking fails
    }

    // Upload photo if provided
    if (req.file) {
      await uploadPhotoToTutorCruncher(req.file, 'recipients', recipientId);
    }

    // Geocode address if TutorCruncher didn't provide lat/lng
    if (recipientData.user?.latitude && recipientData.user?.longitude) {
      // TutorCruncher provided coordinates - webhook will use these
    } else if (street && (town || postcode)) {
      // Geocode locally if TutorCruncher didn't provide coordinates
      const geocodedCoords = await geocodeAddressFromComponents({ street, town, state, postcode, country });
      if (geocodedCoords) {
        // Update TutorCruncher with geocoded coordinates (optional)
        try {
          await tutorCruncherAPI.patch(`/recipients/${recipientId}/`, {
            latitude: geocodedCoords.lat,
            longitude: geocodedCoords.lng
          });
        } catch (updateError) {
          logger.debug('Failed to update TutorCruncher with geocoded coordinates:', updateError.message);
        }
      }
    }

    res.status(201).json({
      success: true,
      student: {
        recipient_id: recipientId,
        first_name: recipientData.first_name,
        last_name: recipientData.last_name,
        email: recipientData.email
      },
      message: 'Student created successfully'
    });
  } catch (error) {
    logger.error({
      msg: 'Error creating student',
      error: error.message,
      response: error.response?.data
    });

    if (error.response) {
      return res.status(error.response.status || 500).json({
        error: 'Failed to create student in TutorCruncher',
        details: error.response.data || error.message
      });
    }

    res.status(500).json({
      error: 'Failed to create student',
      details: error.message
    });
  }
}));

// DELETE /api/entity-lists/students/:id - Delete a student (recipient)
router.delete('/students/:id', auth, asyncHandler(async (req, res) => {
  try {
    const pool = getLocationPool(req);
    const recipientId = req.params.id;

    // Check if student exists
    const checkQuery = `
      SELECT recipient_id, paying_client_id
      FROM recipients
      WHERE recipient_id::text = $1
    `;
    const { rows: students } = await pool.query(checkQuery, [String(recipientId)]);

    if (students.length === 0) {
      return res.status(404).json({ error: 'Student not found' });
    }

    const student = students[0];

    // Delete from recipients table
    await pool.query(
      `DELETE FROM recipients WHERE recipient_id::text = $1`,
      [String(recipientId)]
    );

    logger.info({
      msg: 'Deleted student',
      recipientId,
      payingClientId: student.paying_client_id
    });

    res.json({
      success: true,
      message: 'Student deleted successfully'
    });
  } catch (error) {
    logger.error({
      msg: 'Error deleting student',
      error: error.message,
      recipientId: req.params.id
    });

    res.status(500).json({
      error: 'Failed to delete student',
      details: error.message
    });
  }
}));

// POST /api/entity-lists/affiliates - Create a new affiliate/agent
router.post('/affiliates', upload.single('photo'), asyncHandler(async (req, res) => {
  try {
    const pool = getLocationPool(req);
    if (!pool) {
      return res.status(500).json({ error: 'Database connection not available' });
    }

    const {
      title,
      first_name,
      last_name,
      email,
      mobile,
      phone,
      street,
      town,
      state,
      country,
      postcode,
      timezone,
      calendar_colour = '#FFA500',
      receive_sms = false,
      received_notifications,
      // Extra Fields
      gender,
      date_of_birth,
      // Accounting
      tax_setup,
      commission_percent
    } = req.body;

    // Validate required fields
    if (!first_name || !last_name) {
      return res.status(400).json({ error: 'First name and last name are required' });
    }

    // Parse received_notifications if it's a JSON string
    let notificationsArray = ['broadcasts'];
    if (received_notifications) {
      try {
        notificationsArray = typeof received_notifications === 'string' 
          ? JSON.parse(received_notifications) 
          : received_notifications;
      } catch (e) {
        // Use default if parsing fails
      }
    }

    // Build TutorCruncher payload
    const agentPayload = {
      title: title || undefined,
      first_name,
      last_name,
      email: email || undefined,
      mobile: mobile || undefined,
      phone: phone || undefined,
      street: street || undefined,
      town: town || undefined,
      state: state || undefined,
      country: country || undefined,
      postcode: postcode || undefined,
      timezone: timezone || undefined,
      calendar_colour: calendar_colour || '#FFA500',
      received_notifications: notificationsArray,
      change_via_branch: true,
      send_emails: false,
    };

    // Add extra_attrs for custom fields
    const extraAttrs = {};
    if (gender) extraAttrs['gender'] = gender;
    if (date_of_birth) extraAttrs['agent_dob'] = date_of_birth;
    if (commission_percent) extraAttrs['commission_percent'] = commission_percent;

    if (Object.keys(extraAttrs).length > 0) {
      agentPayload.extra_attrs = extraAttrs;
    }

    // Add tax setup if provided
    if (tax_setup) {
      agentPayload.agent_tax_setup = tax_setup;
    }

    // Create agent in TutorCruncher
    const tcResponse = await tutorCruncherAPI.post('/agents/', agentPayload);
    const agentId = tcResponse.data.id;
    const agentData = tcResponse.data;

    logger.info({
      msg: 'Created agent in TutorCruncher',
      agentId,
      email
    });

    // Upload photo if provided
    if (req.file) {
      await uploadPhotoToTutorCruncher(req.file, 'agents', agentId);
    }

    // Geocode address locally as backup (TutorCruncher also geocodes, but we want local control)
    if (street && (town || postcode)) {
      const geocodedCoords = await geocodeAddressFromComponents({ street, town, state, postcode, country });
      if (geocodedCoords) {
        try {
          await tutorCruncherAPI.patch(`/agents/${agentId}/`, {
            latitude: geocodedCoords.lat,
            longitude: geocodedCoords.lng
          });
        } catch (updateError) {
          logger.debug('Failed to update TutorCruncher with geocoded coordinates (non-critical):', updateError.message);
        }
      }
    }

    res.status(201).json({
      success: true,
      affiliate: {
        agent_id: agentId,
        first_name: agentData.first_name,
        last_name: agentData.last_name,
        email: agentData.email
      },
      message: 'Affiliate created successfully'
    });
  } catch (error) {
    logger.error({
      msg: 'Error creating affiliate',
      error: error.message,
      response: error.response?.data
    });

    if (error.response) {
      return res.status(error.response.status || 500).json({
        error: 'Failed to create affiliate in TutorCruncher',
        details: error.response.data || error.message
      });
    }

    res.status(500).json({
      error: 'Failed to create affiliate',
      details: error.message
    });
  }
}));

// POST /api/entity-lists/admins - Create a new administrator
router.post('/admins', auth, upload.single('photo'), asyncHandler(async (req, res) => {
  try {
    const pool = getLocationPool(req);
    if (!pool) {
      return res.status(500).json({ error: 'Database connection not available' });
    }

    const {
      first_name,
      last_name,
      email,
      mobile,
      phone,
      street,
      town,
      state,
      country,
      postcode,
      timezone,
      default_client_view,
      client_manager,
      safeguarding_manager,
      received_notifications,
      // Permissions
      owner,
      change_branch,
      view_operations,
      edit_operations,
      export_operations,
      view_accounting,
      edit_accounting,
      export_accounting,
      view_analytics,
      edit_branch_settings,
      import: importPermission,
      edit_company_settings,
      use_api
    } = req.body;

    // Validate required fields
    if (!last_name) {
      return res.status(400).json({ error: 'Last name is required' });
    }
    if (!default_client_view) {
      return res.status(400).json({ error: 'Default Client View is required' });
    }

    // Parse received_notifications if it's a JSON string
    let notificationsArray = [];
    if (received_notifications) {
      try {
        notificationsArray = typeof received_notifications === 'string' 
          ? JSON.parse(received_notifications) 
          : received_notifications;
      } catch (e) {
        // Use default if parsing fails
        notificationsArray = ['broadcasts'];
      }
    }

    // Build permissions object
    const permissions = {
      owner: owner === 'true' || owner === true,
      change_branch: change_branch === 'true' || change_branch === true,
      view_operations: view_operations === 'true' || view_operations === true,
      edit_operations: edit_operations === 'true' || edit_operations === true,
      export_operations: export_operations === 'true' || export_operations === true,
      view_accounting: view_accounting === 'true' || view_accounting === true,
      edit_accounting: edit_accounting === 'true' || edit_accounting === true,
      export_accounting: export_accounting === 'true' || export_accounting === true,
      view_analytics: view_analytics === 'true' || view_analytics === true,
      edit_branch_settings: edit_branch_settings === 'true' || edit_branch_settings === true,
      import: importPermission === 'true' || importPermission === true,
      edit_company_settings: edit_company_settings === 'true' || edit_company_settings === true,
      use_api: use_api === 'true' || use_api === true
    };

    // Check if administrators table exists, otherwise use users table (cached)
    const useAdminsTable = await tableExists(pool, 'administrators');

    if (useAdminsTable) {
      // Geocode address if provided
      let latitude = null;
      let longitude = null;
      if (street && (town || postcode)) {
        const geocodedCoords = await geocodeAddressFromComponents({ street, town, state, postcode, country });
        if (geocodedCoords) {
          latitude = geocodedCoords.lat;
          longitude = geocodedCoords.lng;
        }
      }

      // Insert into administrators table
      const insertQuery = `
        INSERT INTO administrators (
          first_name, last_name, email, mobile, phone, street, town, state, country, postcode,
          latitude, longitude, timezone, default_client_view, client_manager, safeguarding_manager, received_notifications,
          permissions, photo, status, created_at, updated_at
        )
        VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17, $18, $19, $20, NOW(), NOW())
        RETURNING id, first_name, last_name, email, status
      `;

      // Handle photo upload (store as base64 or URL)
      let photoUrl = null;
      if (req.file) {
        // For now, store photo reference - you may want to upload to cloud storage
        photoUrl = `data:${req.file.mimetype};base64,${req.file.buffer.toString('base64')}`;
      }

      const result = await pool.query(insertQuery, [
        first_name || null,
        last_name,
        email || null,
        mobile || null,
        phone || null,
        street || null,
        town || null,
        state || null,
        country || null,
        postcode || null,
        latitude,
        longitude,
        timezone || null,
        default_client_view,
        client_manager === 'true' || client_manager === true,
        safeguarding_manager === 'true' || safeguarding_manager === true,
        JSON.stringify(notificationsArray),
        JSON.stringify(permissions),
        photoUrl,
        'active'
      ]);

      const admin = result.rows[0];

      logger.info({
        msg: 'Created administrator',
        adminId: admin.id,
        email: admin.email
      });

      res.status(201).json({
        success: true,
        admin: {
          id: admin.id,
          first_name: admin.first_name,
          last_name: admin.last_name,
          email: admin.email,
          status: admin.status
        },
        message: 'Administrator created successfully'
      });
    } else {
      // Fallback to users table with admin role
      const insertQuery = `
        INSERT INTO users (
          first_name, last_name, email, role, status, created_at, updated_at
        )
        VALUES ($1, $2, $3, $4, $5, NOW(), NOW())
        RETURNING id, first_name, last_name, email, role
      `;

      const result = await pool.query(insertQuery, [
        first_name || null,
        last_name,
        email || null,
        'admin',
        'active'
      ]);

      const admin = result.rows[0];

      logger.info({
        msg: 'Created administrator in users table',
        userId: admin.id,
        email: admin.email
      });

      res.status(201).json({
        success: true,
        admin: {
          id: admin.id,
          first_name: admin.first_name,
          last_name: admin.last_name,
          email: admin.email,
          role: admin.role
        },
        message: 'Administrator created successfully'
      });
    }
  } catch (error) {
    logger.error({
      msg: 'Error creating administrator',
      error: error.message,
      stack: error.stack
    });

    // Handle unique constraint violations
    if (error.code === '23505') {
      return res.status(400).json({
        error: 'An administrator with this email already exists'
      });
    }

    res.status(500).json({
      error: 'Failed to create administrator',
      details: error.message
    });
  }
}));

// GET /api/entity-lists/map-locations - Get all entity locations for map display
router.get('/map-locations', auth, asyncHandler(async (req, res) => {
  try {
    const pool = getLocationPool(req);
    if (!pool) {
      return res.status(500).json({ error: 'Database connection not available' });
    }

    const locations = [];

    // Fetch tutors/contractors
    try {
      const tutorsResult = await pool.query(`
        SELECT 
          contractor_id as id,
          first_name,
          last_name,
          email,
          street,
          town,
          state,
          country,
          postcode,
          status,
          latitude,
          longitude,
          'tutors' as entity_type
        FROM contractors
        WHERE street IS NOT NULL AND street != ''
          AND (town IS NOT NULL AND town != '' OR postcode IS NOT NULL AND postcode != '')
      `);
      
      tutorsResult.rows.forEach(row => {
        const address = [row.street, row.town, row.state, row.postcode, row.country]
          .filter(Boolean)
          .join(', ');
        locations.push({
          id: row.id,
          name: `${row.first_name || ''} ${row.last_name || ''}`.trim() || 'Unknown',
          email: row.email,
          address: address,
          status: row.status,
          entityType: row.entity_type,
          street: row.street,
          town: row.town,
          state: row.state,
          country: row.country,
          postcode: row.postcode,
          lat: row.latitude ? parseFloat(row.latitude) : null,
          lng: row.longitude ? parseFloat(row.longitude) : null
        });
      });
    } catch (error) {
      logger.error({ err: error }, 'Error fetching tutors:');
    }

    // Fetch clients
    try {
      const clientsResult = await pool.query(`
        SELECT 
          client_id as id,
          first_name,
          last_name,
          email,
          street,
          town,
          state,
          country,
          postcode,
          status,
          latitude,
          longitude,
          'clients' as entity_type
        FROM clients
        WHERE street IS NOT NULL AND street != ''
          AND (town IS NOT NULL AND town != '' OR postcode IS NOT NULL AND postcode != '')
      `);
      
      clientsResult.rows.forEach(row => {
        const address = [row.street, row.town, row.state, row.postcode, row.country]
          .filter(Boolean)
          .join(', ');
        locations.push({
          id: row.id,
          name: `${row.first_name || ''} ${row.last_name || ''}`.trim() || 'Unknown',
          email: row.email,
          address: address,
          status: row.status,
          entityType: row.entity_type,
          street: row.street,
          town: row.town,
          state: row.state,
          country: row.country,
          postcode: row.postcode,
          lat: row.latitude ? parseFloat(row.latitude) : null,
          lng: row.longitude ? parseFloat(row.longitude) : null
        });
      });
    } catch (error) {
      logger.error({ err: error }, 'Error fetching clients:');
    }

    // Fetch students/recipients
    try {
      const studentsResult = await pool.query(`
        SELECT 
          recipient_id as id,
          first_name,
          last_name,
          email,
          street,
          town,
          state,
          country,
          postcode,
          'active' as status,
          'students' as entity_type
        FROM recipients
        WHERE street IS NOT NULL AND street != ''
          AND (town IS NOT NULL AND town != '' OR postcode IS NOT NULL AND postcode != '')
      `);
      
      studentsResult.rows.forEach(row => {
        const address = [row.street, row.town, row.state, row.postcode, row.country]
          .filter(Boolean)
          .join(', ');
        locations.push({
          id: row.id,
          name: `${row.first_name || ''} ${row.last_name || ''}`.trim() || 'Unknown',
          email: row.email,
          address: address,
          status: row.status,
          entityType: row.entity_type,
          street: row.street,
          town: row.town,
          state: row.state,
          country: row.country,
          postcode: row.postcode
        });
      });
    } catch (error) {
      logger.error({ err: error }, 'Error fetching students:');
    }

    // Fetch affiliates/agents
    try {
      const affiliatesResult = await pool.query(`
        SELECT 
          id,
          first_name,
          last_name,
          email,
          street,
          town,
          state,
          country,
          postcode,
          status,
          latitude,
          longitude,
          'affiliates' as entity_type
        FROM affiliates
        WHERE street IS NOT NULL AND street != ''
          AND (town IS NOT NULL AND town != '' OR postcode IS NOT NULL AND postcode != '')
      `);
      
      affiliatesResult.rows.forEach(row => {
        const address = [row.street, row.town, row.state, row.postcode, row.country]
          .filter(Boolean)
          .join(', ');
        locations.push({
          id: row.id,
          name: `${row.first_name || ''} ${row.last_name || ''}`.trim() || 'Unknown',
          email: row.email,
          address: address,
          status: row.status,
          entityType: row.entity_type,
          street: row.street,
          town: row.town,
          state: row.state,
          country: row.country,
          postcode: row.postcode,
          lat: row.latitude ? parseFloat(row.latitude) : null,
          lng: row.longitude ? parseFloat(row.longitude) : null
        });
      });
    } catch (error) {
      logger.error({ err: error }, 'Error fetching affiliates:');
    }

    // Administrators removed - not needed for map display

    // Geocode addresses (simplified - in production, you'd want to batch geocode)
    // For now, return locations with address strings - frontend can geocode as needed
    // or use a geocoding service on the backend

    res.json({
      locations: locations,
      count: locations.length
    });
  } catch (error) {
    logger.error({ err: error }, 'Error fetching map locations:');
    res.status(500).json({
      error: 'Failed to fetch map locations',
      details: error.message
    });
  }
}));

module.exports = router;

