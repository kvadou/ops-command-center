const express = require('express');
const { asyncHandler } = require('../middleware/error-handler');
const { logger } = require('../utils/logger');
const router = express.Router();
const { pool } = global;

// Get all e4 data with pagination, sorting, and filtering
router.get('/', asyncHandler(async (req, res) => {
  try {
    const {
      page = 1,
      limit = 100,
      search = '',
      sortBy = 'lesson_date',
      sortOrder = 'DESC',
      // Filter parameters
      lesson_status,
      tutor_id,
      lesson_location,
      division,
      tutor,
      client_email,
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
        clients ILIKE $${paramCount} OR
        client_email ILIKE $${paramCount} OR
        client_phone ILIKE $${paramCount} OR
        tutor ILIKE $${paramCount} OR
        lesson_location ILIKE $${paramCount} OR
        division ILIKE $${paramCount} OR
        curriculum ILIKE $${paramCount}
      )`);
      queryParams.push(`%${search}%`);
    }

    // Filter by lesson status
    if (lesson_status) {
      paramCount++;
      whereConditions.push(`lesson_status = $${paramCount}`);
      queryParams.push(lesson_status);
    }

    // Filter by tutor ID
    if (tutor_id) {
      paramCount++;
      whereConditions.push(`tutor_id = $${paramCount}`);
      queryParams.push(parseInt(tutor_id));
    }

    // Filter by lesson location
    if (lesson_location) {
      paramCount++;
      whereConditions.push(`lesson_location ILIKE $${paramCount}`);
      queryParams.push(`%${lesson_location}%`);
    }

    // Filter by division
    if (division) {
      paramCount++;
      whereConditions.push(`division ILIKE $${paramCount}`);
      queryParams.push(`%${division}%`);
    }

    // Filter by tutor name
    if (tutor) {
      paramCount++;
      whereConditions.push(`tutor ILIKE $${paramCount}`);
      queryParams.push(`%${tutor}%`);
    }

    // Filter by client email
    if (client_email) {
      paramCount++;
      whereConditions.push(`client_email ILIKE $${paramCount}`);
      queryParams.push(`%${client_email}%`);
    }

    // Filter by date range
    if (date_from) {
      paramCount++;
      whereConditions.push(`lesson_date >= $${paramCount}`);
      queryParams.push(date_from);
    }
    if (date_to) {
      paramCount++;
      whereConditions.push(`lesson_date <= $${paramCount}`);
      queryParams.push(date_to);
    }

    // Validate sortBy to prevent SQL injection
    const allowedSortFields = [
      'id', 'lesson_date', 'lesson_revenue', 'lesson_charged_amt',
      'tutor_pay', 'tutor_pay_new', 'gross_profit', 'gross_margin',
      'students_per_lesson', 'students_attended', 'attendance_rate',
      'tutor', 'tutor_id', 'clients', 'client_email', 'lesson_location',
      'division', 'lesson_status', 'lesson_time', 'created_at'
    ];
    const sortField = allowedSortFields.includes(sortBy) ? sortBy : 'lesson_date';
    const sortDir = sortOrder.toUpperCase() === 'ASC' ? 'ASC' : 'DESC';

    // Get total count
    const countQuery = `SELECT COUNT(*) as total FROM e4_data WHERE ${whereConditions.join(' AND ')}`;
    const countResult = await pool.query(countQuery, queryParams);
    const total = parseInt(countResult.rows[0].total);

    // Get paginated data
    const dataQuery = `
      SELECT 
        id,
        tutor_pay_legacy,
        tutor_pay_new,
        lesson_charged_amt,
        students_per_lesson,
        students_attended,
        lesson_revenue,
        lesson_date,
        lesson_length,
        lesson_location,
        tutor_confirmation_date,
        tutor_id,
        class_division,
        curriculum,
        lesson_status,
        clients,
        client_email,
        client_phone,
        pricing_profile,
        pricing_profile_id,
        one_student_price,
        lesson_net_amount,
        tutor_pay,
        lesson_time,
        division,
        attendance_rate,
        lessons_based_on_1hr,
        tutor,
        tutor_lesson_to_checkout_days,
        gross_profit,
        gross_margin,
        month,
        day,
        month_num,
        week_data,
        day_of_week_number,
        time,
        dow_day,
        time_type,
        day_type,
        day_and_time_type,
        day_time,
        month_week,
        raw_data,
        created_at,
        updated_at
      FROM e4_data
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
    logger.error({ err: error }, 'Error fetching e4 data:');
    res.status(500).json({ success: false, error: error.message });
  }
}));

// Get unique values for filter dropdowns
router.get('/filters', asyncHandler(async (req, res) => {
  try {
    const { field } = req.query;

    const allowedFields = [
      'lesson_status', 'tutor_id', 'lesson_location', 'division',
      'tutor', 'curriculum', 'class_division'
    ];

    if (!field || !allowedFields.includes(field)) {
      return res.status(400).json({ success: false, error: 'Invalid field' });
    }

    const query = `
      SELECT DISTINCT ${field} as value
      FROM e4_data
      WHERE ${field} IS NOT NULL
      ORDER BY value
    `;

    const result = await pool.query(query);
    const values = result.rows.map(row => row.value).filter(Boolean);

    res.json({ success: true, values });
  } catch (error) {
    logger.error({ err: error }, 'Error fetching filter values:');
    res.status(500).json({ success: false, error: error.message });
  }
}));

// Get statistics/summary
router.get('/stats', asyncHandler(async (req, res) => {
  try {
    
    const statsQuery = `
      SELECT 
        COUNT(*) as total_records,
        COUNT(DISTINCT tutor_id) as unique_tutors,
        COUNT(DISTINCT client_email) as unique_clients,
        COUNT(DISTINCT lesson_location) as unique_locations,
        MIN(lesson_date) as earliest_date,
        MAX(lesson_date) as latest_date
      FROM e4_data
    `;

    const result = await pool.query(statsQuery);
    const stats = result.rows[0];

    res.json({ success: true, stats });
  } catch (error) {
    logger.error({ err: error }, 'Error fetching e4 stats:');
    res.status(500).json({ success: false, error: error.message });
  }
}));

module.exports = router;

