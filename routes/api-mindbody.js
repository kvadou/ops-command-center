const express = require('express');
const { asyncHandler } = require('../middleware/error-handler');
const { logger } = require('../utils/logger');
const router = express.Router();
const { pool } = global;

// Get all mindbody data with pagination, sorting, and filtering
router.get('/', asyncHandler(async (req, res) => {
  try {
    const {
      page = 1,
      limit = 100,
      search = '',
      sortBy = 'date',
      sortOrder = 'DESC',
      // Filter parameters
      staff_paid,
      lesson_type,
      staff,
      late_cancel,
      no_show,
      payment_method,
      visit_service_category,
      dashboard_category,
      focus,
      location,
      client_id,
      date_from,
      date_to,
    } = req.query;

    const offset = (parseInt(page) - 1) * parseInt(limit);
    const limitNum = Math.min(parseInt(limit), 500); // Max 500 per page

    // Build WHERE clause
    let whereConditions = ['1=1'];
    let queryParams = [];
    let paramCount = 0;

    // Search across multiple fields
    if (search) {
      paramCount++;
      whereConditions.push(`(
        client ILIKE $${paramCount} OR
        client_id ILIKE $${paramCount} OR
        lesson_type ILIKE $${paramCount} OR
        staff ILIKE $${paramCount} OR
        location ILIKE $${paramCount} OR
        visit_service_category ILIKE $${paramCount} OR
        dashboard_category ILIKE $${paramCount}
      )`);
      queryParams.push(`%${search}%`);
    }

    // Filter by staff paid
    if (staff_paid) {
      paramCount++;
      whereConditions.push(`staff_paid = $${paramCount}`);
      queryParams.push(staff_paid);
    }

    // Filter by lesson type
    if (lesson_type) {
      paramCount++;
      whereConditions.push(`lesson_type ILIKE $${paramCount}`);
      queryParams.push(`%${lesson_type}%`);
    }

    // Filter by staff
    if (staff) {
      paramCount++;
      whereConditions.push(`staff ILIKE $${paramCount}`);
      queryParams.push(`%${staff}%`);
    }

    // Filter by late cancel
    if (late_cancel) {
      paramCount++;
      whereConditions.push(`late_cancel = $${paramCount}`);
      queryParams.push(late_cancel);
    }

    // Filter by no-show
    if (no_show) {
      paramCount++;
      whereConditions.push(`no_show = $${paramCount}`);
      queryParams.push(no_show);
    }

    // Filter by payment method
    if (payment_method) {
      paramCount++;
      whereConditions.push(`payment_method ILIKE $${paramCount}`);
      queryParams.push(`%${payment_method}%`);
    }

    // Filter by visit service category
    if (visit_service_category) {
      paramCount++;
      whereConditions.push(`visit_service_category ILIKE $${paramCount}`);
      queryParams.push(`%${visit_service_category}%`);
    }

    // Filter by dashboard category
    if (dashboard_category) {
      paramCount++;
      whereConditions.push(`dashboard_category ILIKE $${paramCount}`);
      queryParams.push(`%${dashboard_category}%`);
    }

    // Filter by focus
    if (focus) {
      paramCount++;
      whereConditions.push(`focus ILIKE $${paramCount}`);
      queryParams.push(`%${focus}%`);
    }

    // Filter by location
    if (location) {
      paramCount++;
      whereConditions.push(`location ILIKE $${paramCount}`);
      queryParams.push(`%${location}%`);
    }

    // Filter by client ID
    if (client_id) {
      paramCount++;
      whereConditions.push(`client_id = $${paramCount}`);
      queryParams.push(client_id);
    }

    // Filter by date range
    if (date_from) {
      paramCount++;
      whereConditions.push(`date >= $${paramCount}`);
      queryParams.push(date_from);
    }
    if (date_to) {
      paramCount++;
      whereConditions.push(`date <= $${paramCount}`);
      queryParams.push(date_to);
    }

    // Validate sortBy to prevent SQL injection
    const allowedSortFields = [
      'id', 'date', 'time', 'client_id', 'client', 'lesson_type',
      'staff', 'rev_per_visit', 'class_size', 'hrs', 'location',
      'dashboard_category', 'focus', 'visit_service_category',
      'late_cancel', 'no_show', 'payment_method', 'created_at'
    ];
    const sortField = allowedSortFields.includes(sortBy) ? sortBy : 'date';
    const sortDir = sortOrder.toUpperCase() === 'ASC' ? 'ASC' : 'DESC';

    // Get total count
    const countQuery = `SELECT COUNT(*) as total FROM mindbody_data WHERE ${whereConditions.join(' AND ')}`;
    const countResult = await pool.query(countQuery, queryParams);
    const total = parseInt(countResult.rows[0].total);

    // Get paginated data
    const dataQuery = `
      SELECT 
        id,
        staff_paid,
        date,
        day,
        time,
        client_id,
        client,
        lesson_type,
        staff,
        late_cancel,
        no_show,
        payment_method,
        rev_per_visit,
        visit_service_category,
        class_size,
        hrs,
        dashboard_category,
        focus,
        location,
        raw_data,
        created_at,
        updated_at
      FROM mindbody_data
      WHERE ${whereConditions.join(' AND ')}
      ORDER BY ${sortField} ${sortDir} NULLS LAST
      LIMIT $${paramCount + 1} OFFSET $${paramCount + 2}
    `;
    
    queryParams.push(limitNum, offset);
    const dataResult = await pool.query(dataQuery, queryParams);

    res.json({
      success: true,
      data: dataResult.rows,
      pagination: {
        page: parseInt(page),
        limit: limitNum,
        total,
        totalPages: Math.ceil(total / limitNum),
      },
    });
  } catch (error) {
    logger.error({ err: error }, 'Error fetching mindbody data');
    res.status(500).json({ success: false, error: error.message });
  }
}));

// Get unique values for filter dropdowns
router.get('/filters', asyncHandler(async (req, res) => {
  try {
    const { field } = req.query;

    const allowedFields = [
      'staff_paid', 'lesson_type', 'staff', 'late_cancel', 'no_show',
      'payment_method', 'visit_service_category', 'dashboard_category',
      'focus', 'location'
    ];

    if (!field || !allowedFields.includes(field)) {
      return res.status(400).json({ success: false, error: 'Invalid field' });
    }

    const query = `
      SELECT DISTINCT ${field} as value
      FROM mindbody_data
      WHERE ${field} IS NOT NULL
      ORDER BY value
    `;

    const result = await pool.query(query);
    const values = result.rows.map(row => row.value).filter(Boolean);

    res.json({ success: true, values });
  } catch (error) {
    logger.error({ err: error }, 'Error fetching filter values');
    res.status(500).json({ success: false, error: error.message });
  }
}));

// Get statistics/summary
router.get('/stats', asyncHandler(async (req, res) => {
  try {
    
    const statsQuery = `
      SELECT 
        COUNT(*) as total_records,
        COUNT(DISTINCT staff) as unique_staff,
        COUNT(DISTINCT client_id) as unique_clients,
        COUNT(DISTINCT location) as unique_locations,
        COUNT(DISTINCT lesson_type) as unique_lesson_types,
        MIN(date) as earliest_date,
        MAX(date) as latest_date
      FROM mindbody_data
    `;

    const result = await pool.query(statsQuery);
    const stats = result.rows[0];

    res.json({ success: true, stats });
  } catch (error) {
    logger.error({ err: error }, 'Error fetching mindbody stats');
    res.status(500).json({ success: false, error: error.message });
  }
}));

module.exports = router;

