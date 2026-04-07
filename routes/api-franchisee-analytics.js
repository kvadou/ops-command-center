const express = require('express');
const router = express.Router();
const { getPool } = require('../database-connections');
const { tableExists } = require('../utils/schema-cache');
const { asyncHandler } = require('../middleware/error-handler');
const { logger } = require('../utils/logger');

/**
 * Middleware to check if user is from main branch
 */
async function checkMainBranch(req, res, next) {
  try {
    // Get the hostname from the request
    const hostname = req.get('host') || req.hostname;
    
    // Always allow localhost for local development
    if (hostname && (hostname.includes('localhost') || hostname.includes('127.0.0.1'))) {
      return next();
    }
    
    // Extract subdomain from hostname
    let companyName = 'Acme Operations (Main Branch)'; // Default to HQ
    
    if (hostname) {
      const subdomain = hostname.split('.')[0];
      
      switch (subdomain) {
        case 'eastside':
          companyName = 'Acme Operations Eastside';
          break;
        case 'westside':
          companyName = 'Acme Operations Westside';
          break;
        case 'join':
          companyName = 'Acme Operations (Main Branch)';
          break;
        default:
          // For other domains, check environment variable
          companyName = process.env.COMPANY_NAME || 'Acme Operations (Main Branch)';
      }
    }
    
    const isMainBranch = companyName === 'Acme Operations (Main Branch)';
    
    if (!isMainBranch) {
      return res.status(403).json({ error: 'Access denied. This endpoint is only available to the main branch.' });
    }
    
    next();
  } catch (error) {
    logger.error({ err: error }, 'Error checking branch access:');
    res.status(500).json({ error: 'Failed to verify branch access' });
  }
}

/**
 * Get analytics for franchisee locations
 * GET /api/franchisee-analytics?location=all&view=monthly&start=...&end=...
 */
router.get('/', checkMainBranch, asyncHandler(async (req, res) => {
  try {
    const { location = 'all', view = 'monthly', start, end } = req.query;
    
    // Parse date range
    const startDate = start ? new Date(start) : new Date();
    const endDate = end ? new Date(end) : new Date();
    
    if (location === 'all') {
      // Aggregate data from all franchisee locations
      const [westsideData, eastsideData] = await Promise.all([
        getLocationAnalytics('westside', startDate, endDate),
        getLocationAnalytics('eastside', startDate, endDate)
      ]);
      
      // Aggregate the results
      const aggregated = {
        totals: {
          totalLessons: westsideData.totalLessons + eastsideData.totalLessons,
          totalHours: westsideData.totalHours + eastsideData.totalHours,
          totalStudents: westsideData.totalStudents + eastsideData.totalStudents,
          totalActiveTutors: westsideData.totalActiveTutors + eastsideData.totalActiveTutors,
          totalRevenue: westsideData.totalRevenue + eastsideData.totalRevenue,
          totalTutorPay: westsideData.totalTutorPay + eastsideData.totalTutorPay,
          totalAdhocPay: westsideData.totalAdhocPay + eastsideData.totalAdhocPay,
          tutorPayMarginPct: calculateMarginPct(westsideData.totalRevenue + eastsideData.totalRevenue, westsideData.totalTutorPay + eastsideData.totalTutorPay),
          profitMarginPct: calculateProfitMarginPct(westsideData.totalRevenue + eastsideData.totalRevenue, westsideData.totalTutorPay + eastsideData.totalTutorPay, westsideData.totalAdhocPay + eastsideData.totalAdhocPay)
        },
        breakdown: {
          'westside': westsideData,
          'eastside': eastsideData
        }
      };
      
      return res.json(aggregated);
    } else if (location === 'westside' || location === 'eastside') {
      const data = await getLocationAnalytics(location, startDate, endDate);
      return res.json({ totals: data });
    } else {
      return res.status(400).json({ error: 'Invalid location. Must be "all", "westside", or "eastside"' });
    }
  } catch (error) {
    logger.error({ err: error }, 'Error fetching franchisee analytics:');
    logger.error({ error: error.stack }, 'Error stack:');
    logger.error({ error: {
      message: error.message,
      location: req.query.location,
      startDate: req.query.start,
      endDate: req.query.end
    } }, 'Error details:');
    res.status(500).json({ 
      error: 'Failed to fetch franchisee analytics',
      details: error.message,
      stack: process.env.NODE_ENV !== 'production' ? error.stack : undefined,
      location: req.query.location,
      startDate: req.query.start,
      endDate: req.query.end
    });
  }
}));

/**
 * Get analytics for a specific location
 */
async function getLocationAnalytics(location, startDate, endDate) {
  const pool = getPool(location);
  
  try {
    // Get total lessons
    const lessonsResult = await pool.query(`
      SELECT COUNT(*) as total_lessons
      FROM appointments a
      WHERE a.status IN ('complete', 'completed')
        AND (a.is_deleted = false OR a.is_deleted IS NULL)
        AND a.start >= $1 AND a.start < $2
    `, [startDate, endDate]);
    
    // Get total hours
    const hoursResult = await pool.query(`
      SELECT COALESCE(SUM(a.units), 0) as total_hours
      FROM appointments a
      WHERE a.status IN ('complete', 'completed')
        AND (a.is_deleted = false OR a.is_deleted IS NULL)
        AND a.start >= $1 AND a.start < $2
    `, [startDate, endDate]);
    
    // Get total students (from appointment_recipients table)
    const studentsResult = await pool.query(`
      SELECT COUNT(DISTINCT ar.recipient_id) as total_students
      FROM appointments a
      INNER JOIN appointment_recipients ar ON a.appointment_id = ar.appointment_id
      WHERE a.status IN ('complete', 'completed')
        AND (a.is_deleted = false OR a.is_deleted IS NULL)
        AND a.start >= $1 AND a.start < $2
    `, [startDate, endDate]);
    
    // Get active tutors (from appointment_contractors table)
    const tutorsResult = await pool.query(`
      SELECT COUNT(DISTINCT ac.contractor_id) as total_active_tutors
      FROM appointments a
      INNER JOIN appointment_contractors ac ON a.appointment_id = ac.appointment_id
      WHERE a.status IN ('complete', 'completed')
        AND (a.is_deleted = false OR a.is_deleted IS NULL)
        AND a.start >= $1 AND a.start < $2
    `, [startDate, endDate]);
    
    // Get revenue using appointment recipient charges
    const revenueResult = await pool.query(`
      SELECT COALESCE(SUM(
        CASE
          WHEN a.charge_type = 'hourly' THEN ar.charge_rate * a.units
          WHEN a.charge_type = 'one-off' THEN ar.charge_rate
          WHEN a.charge_type = 'one-off-split' THEN ar.charge_rate
          WHEN a.charge_type = 'hourly-split' THEN ar.charge_rate * a.units
          ELSE ar.charge_rate * a.units
        END
      ), 0) as total_revenue
      FROM appointments a
      LEFT JOIN appointment_recipients ar ON a.appointment_id = ar.appointment_id AND ar.status <> 'missed'
      WHERE a.status IN ('complete', 'cancelled-chargeable')
        AND (a.is_deleted = false OR a.is_deleted IS NULL)
        AND a.start >= $1 AND a.start < $2
    `, [startDate, endDate]);

    // Get tutor pay from appointment_contractors
    const tutorPayResult = await pool.query(`
      SELECT COALESCE(SUM(
        CASE
          WHEN a.charge_type = 'hourly' THEN ac.pay_rate * a.units
          WHEN a.charge_type = 'one-off' THEN ac.pay_rate
          WHEN a.charge_type = 'one-off-split' THEN ac.pay_rate
          WHEN a.charge_type = 'hourly-split' THEN ac.pay_rate * a.units
          ELSE ac.pay_rate * a.units
        END
      ), 0) as total_tutor_pay
      FROM appointments a
      JOIN appointment_contractors ac ON a.appointment_id = ac.appointment_id
      WHERE a.status IN ('complete', 'cancelled-chargeable')
        AND (a.is_deleted = false OR a.is_deleted IS NULL)
        AND a.start >= $1 AND a.start < $2
    `, [startDate, endDate]);

    const totalTutorPay = parseFloat(tutorPayResult.rows[0]?.total_tutor_pay || 0);
    
    // Try to get adhoc pay (from adhoc_charges table if it exists)
    let totalAdhocPay = 0;
    try {
      const adhocPayResult = await pool.query(`
        SELECT COALESCE(SUM(ac.pay_contractor), 0) as total_adhoc_pay
        FROM adhoc_charges ac
        WHERE ac.date_occurred >= $1 AND ac.date_occurred < $2
      `, [startDate, endDate]);
      totalAdhocPay = parseFloat(adhocPayResult.rows[0]?.total_adhoc_pay || 0);
    } catch (e) {
      // Table might not exist
      logger.info(`adhoc_charges table not available for ${location}`);
      totalAdhocPay = 0;
    }
    
    return {
      totalLessons: parseInt(lessonsResult.rows[0]?.total_lessons || 0),
      totalHours: parseFloat(hoursResult.rows[0]?.total_hours || 0),
      totalStudents: parseInt(studentsResult.rows[0]?.total_students || 0),
      totalActiveTutors: parseInt(tutorsResult.rows[0]?.total_active_tutors || 0),
      totalRevenue: parseFloat(revenueResult.rows[0]?.total_revenue || 0),
      totalTutorPay: totalTutorPay,
      totalAdhocPay: parseFloat(totalAdhocPay || 0)
    };
  } catch (error) {
    logger.error({ err: error }, `Error fetching analytics for ${location}:`);
    logger.error({ error: error.stack }, `Error stack for ${location}:`);
    logger.error({ error: {
      startDate: startDate?.toISOString(),
      endDate: endDate?.toISOString()
    } }, `Database query details for ${location}:`);
    throw error;
  }
}

/**
 * Calculate margin percentage
 */
function calculateMarginPct(revenue, cost) {
  if (!revenue || revenue === 0) return 0;
  return parseFloat(((cost / revenue) * 100).toFixed(1));
}

/**
 * Calculate profit margin percentage
 */
function calculateProfitMarginPct(revenue, tutorPay, adhocPay) {
  if (!revenue || revenue === 0) return 0;
  const totalCosts = (tutorPay || 0) + (adhocPay || 0);
  const profit = revenue - totalCosts;
  return parseFloat(((profit / revenue) * 100).toFixed(1));
}

/**
 * Get drilldown details for franchisee analytics KPIs
 * GET /api/franchisee-analytics/detail?location=all&metric=lessons&start=...&end=...
 */
router.get('/detail', checkMainBranch, asyncHandler(async (req, res) => {
  try {
    const { location = 'all', metric = 'lessons', start, end } = req.query;
    
    // Parse date range
    const startDate = start ? new Date(start) : new Date();
    const endDate = end ? new Date(end) : new Date();
    
    let rows = [];
    
    if (location === 'all') {
      // Get data from all locations and combine
      const [westsideRows, eastsideRows] = await Promise.all([
        getLocationDetail('westside', metric, startDate, endDate),
        getLocationDetail('eastside', metric, startDate, endDate)
      ]);
      
      // Add location info to each row
      rows = [
        ...westsideRows.map(row => ({ ...row, location: Westside })),
        ...eastsideRows.map(row => ({ ...row, location: Eastside }))
      ];
    } else if (location === 'westside' || location === 'eastside') {
      rows = await getLocationDetail(location, metric, startDate, endDate);
      rows = rows.map(row => ({ ...row, location: location.charAt(0).toUpperCase() + location.slice(1) }));
    } else {
      return res.status(400).json({ error: 'Invalid location. Must be "all", "westside", or "eastside"' });
    }
    
    res.json({ rows });
  } catch (error) {
    logger.error({ err: error }, 'Error fetching franchisee analytics detail:');
    res.status(500).json({ 
      error: 'Failed to fetch franchisee analytics detail',
      details: error.message
    });
  }
}));

/**
 * Get drilldown details for a specific location and metric
 */
async function getLocationDetail(location, metric, startDate, endDate) {
  const pool = getPool(location);
  
  try {
    switch (metric) {
      case 'lessons':
        return await getLessonsDetail(pool, startDate, endDate);
      case 'hours':
        return await getHoursDetail(pool, startDate, endDate);
      case 'students':
        return await getStudentsDetail(pool, startDate, endDate);
      case 'activetutors':
        return await getActiveTutorsDetail(pool, startDate, endDate);
      case 'revenue':
        return await getRevenueDetail(pool, startDate, endDate);
      case 'profit':
        return await getProfitDetail(pool, startDate, endDate);
      case 'tutorpayexpected':
        return await getTutorPayDetail(pool, startDate, endDate);
      case 'tutoradhocpay':
        return await getAdhocPayDetail(pool, startDate, endDate);
      default:
        throw new Error(`Unknown metric: ${metric}`);
    }
  } catch (error) {
    logger.error({ err: error }, `Error fetching ${metric} detail for ${location}:`);
    throw error;
  }
}

/**
 * Get lessons detail for a location with comprehensive information
 */
async function getLessonsDetail(pool, startDate, endDate) {
  // First, get revenue and tutor pay aggregates per appointment
  const { rows } = await pool.query(`
    WITH 
    -- Calculate total revenue per appointment
    appointment_revenue AS (
      SELECT
        a.appointment_id,
        SUM(
          CASE
            WHEN a.charge_type = 'hourly' THEN ar.charge_rate * a.units
            WHEN a.charge_type = 'one-off' THEN ar.charge_rate
            WHEN a.charge_type = 'one-off-split' THEN ar.charge_rate
            WHEN a.charge_type = 'hourly-split' THEN ar.charge_rate * a.units
            ELSE ar.charge_rate * a.units
          END
        ) as revenue
      FROM appointments a
      LEFT JOIN appointment_recipients ar ON a.appointment_id = ar.appointment_id AND ar.status <> 'missed'
      WHERE a.status IN ('complete', 'completed', 'cancelled-chargeable')
        AND (a.is_deleted = false OR a.is_deleted IS NULL)
        AND a.start >= $1 AND a.start < $2
      GROUP BY a.appointment_id
    ),
    -- Calculate total tutor pay per appointment
    appointment_tutor_pay AS (
      SELECT
        a.appointment_id,
        SUM(
          CASE
            WHEN a.charge_type = 'hourly' THEN ac.pay_rate * a.units
            WHEN a.charge_type = 'one-off' THEN ac.pay_rate
            WHEN a.charge_type = 'one-off-split' THEN ac.pay_rate
            WHEN a.charge_type = 'hourly-split' THEN ac.pay_rate * a.units
            ELSE ac.pay_rate * a.units
          END
        ) as tutorPay
      FROM appointments a
      LEFT JOIN appointment_contractors ac ON a.appointment_id = ac.appointment_id
      WHERE a.status IN ('complete', 'completed', 'cancelled-chargeable')
        AND (a.is_deleted = false OR a.is_deleted IS NULL)
        AND a.start >= $1 AND a.start < $2
      GROUP BY a.appointment_id
    ),
    -- Get student names per appointment
    appointment_students AS (
      SELECT
        a.appointment_id,
        STRING_AGG(DISTINCT ar.recipient_name, ', ' ORDER BY ar.recipient_name) as studentNames
      FROM appointments a
      LEFT JOIN appointment_recipients ar ON a.appointment_id = ar.appointment_id AND ar.status <> 'missed'
      WHERE a.status IN ('complete', 'completed', 'cancelled-chargeable')
        AND (a.is_deleted = false OR a.is_deleted IS NULL)
        AND a.start >= $1 AND a.start < $2
      GROUP BY a.appointment_id
    )
    SELECT
      a.appointment_id as lessonId,
      a.start as date,
      a.finish as finishDate,
      a.status as appointmentStatus,
      a.charge_type as chargeType,
      a.units as hours,
      s.name as jobName,
      s.service_id as serviceId,
      STRING_AGG(DISTINCT ac.contractor_name, ', ' ORDER BY ac.contractor_name) as tutorName,
      STRING_AGG(DISTINCT ac.contractor_id::text, ', ') as tutorIds,
      s.labels as service_labels,
      COALESCE(ar.revenue, 0) as revenue,
      COALESCE(atp.tutorPay, 0) as tutorPay,
      COALESCE(ast.studentNames, '') as studentNames,
      COUNT(DISTINCT ar2.recipient_id) as studentCount
    FROM appointments a
    LEFT JOIN services s ON a.service_id = s.service_id
    LEFT JOIN appointment_contractors ac ON a.appointment_id = ac.appointment_id
    LEFT JOIN appointment_revenue ar ON a.appointment_id = ar.appointment_id
    LEFT JOIN appointment_tutor_pay atp ON a.appointment_id = atp.appointment_id
    LEFT JOIN appointment_students ast ON a.appointment_id = ast.appointment_id
    LEFT JOIN appointment_recipients ar2 ON a.appointment_id = ar2.appointment_id AND ar2.status <> 'missed'
    WHERE a.status IN ('complete', 'completed', 'cancelled-chargeable')
      AND (a.is_deleted = false OR a.is_deleted IS NULL)
      AND a.start >= $1 AND a.start < $2
    GROUP BY a.appointment_id, a.start, a.finish, a.status, a.charge_type, a.units, s.name, s.service_id, s.labels, ar.revenue, atp.tutorPay, ast.studentNames
    ORDER BY a.start DESC
  `, [startDate, endDate]);
  
  return rows.map(row => ({
    lessonId: row.lessonid || row.lessonId,
    jobName: row.jobname || row.jobName,
    date: row.date ? new Date(row.date).toLocaleDateString() : '',
    finishDate: row.finishdate ? new Date(row.finishdate).toLocaleDateString() : '',
    hours: Number(row.hours || 0).toFixed(2),
    revenue: Number(row.revenue || 0).toFixed(2),
    tutorName: row.tutorname || row.tutorName,
    tutorPay: Number(row.tutorpay || 0).toFixed(2),
    studentNames: row.studentnames || '',
    studentCount: Number(row.studentcount || 0),
    chargeType: row.chargetype || null,
    appointmentStatus: row.appointmentstatus || null,
    service_labels: row.service_labels,
    location: row.location
  }));
}

/**
 * Get hours detail for a location
 */
async function getHoursDetail(pool, startDate, endDate) {
  const { rows } = await pool.query(`
    SELECT
      ac.contractor_id,
      ac.contractor_name as tutorName,
      SUM(a.units) as totalHours
    FROM appointment_contractors ac
    JOIN appointments a ON ac.appointment_id = a.appointment_id
    WHERE a.status IN ('complete', 'completed')
      AND (a.is_deleted = false OR a.is_deleted IS NULL)
      AND a.start >= $1 AND a.start < $2
    GROUP BY ac.contractor_id, ac.contractor_name
    ORDER BY SUM(a.units) DESC
  `, [startDate, endDate]);
  
  return rows.map(row => ({
    ...row,
    totalHours: Number(row.totalhours || row.totalHours || 0).toFixed(2)
  }));
}

/**
 * Get students detail for a location - returns one row per student per lesson with full lesson details
 */
async function getStudentsDetail(pool, startDate, endDate) {
  const { rows } = await pool.query(`
    WITH 
    -- Calculate total revenue per appointment
    appointment_revenue AS (
      SELECT
        a.appointment_id,
        SUM(
          CASE
            WHEN a.charge_type = 'hourly' THEN ar.charge_rate * a.units
            WHEN a.charge_type = 'one-off' THEN ar.charge_rate
            WHEN a.charge_type = 'one-off-split' THEN ar.charge_rate
            WHEN a.charge_type = 'hourly-split' THEN ar.charge_rate * a.units
            ELSE ar.charge_rate * a.units
          END
        ) as revenue
      FROM appointments a
      LEFT JOIN appointment_recipients ar ON a.appointment_id = ar.appointment_id AND ar.status <> 'missed'
      WHERE a.status IN ('complete', 'completed', 'cancelled-chargeable')
        AND (a.is_deleted = false OR a.is_deleted IS NULL)
        AND a.start >= $1 AND a.start < $2
      GROUP BY a.appointment_id
    ),
    -- Calculate total tutor pay per appointment
    appointment_tutor_pay AS (
      SELECT
        a.appointment_id,
        SUM(
          CASE
            WHEN a.charge_type = 'hourly' THEN ac.pay_rate * a.units
            WHEN a.charge_type = 'one-off' THEN ac.pay_rate
            WHEN a.charge_type = 'one-off-split' THEN ac.pay_rate
            WHEN a.charge_type = 'hourly-split' THEN ac.pay_rate * a.units
            ELSE ac.pay_rate * a.units
          END
        ) as tutorPay
      FROM appointments a
      LEFT JOIN appointment_contractors ac ON a.appointment_id = ac.appointment_id
      WHERE a.status IN ('complete', 'completed', 'cancelled-chargeable')
        AND (a.is_deleted = false OR a.is_deleted IS NULL)
        AND a.start >= $1 AND a.start < $2
      GROUP BY a.appointment_id
    ),
    -- Calculate per-student revenue
    student_revenue AS (
      SELECT
        ar.appointment_id,
        ar.recipient_id,
        CASE
          WHEN a.charge_type = 'hourly' THEN ar.charge_rate * a.units
          WHEN a.charge_type = 'one-off' THEN ar.charge_rate
          WHEN a.charge_type = 'one-off-split' THEN ar.charge_rate
          WHEN a.charge_type = 'hourly-split' THEN ar.charge_rate * a.units
          ELSE ar.charge_rate * a.units
        END as studentRevenue
      FROM appointments a
      JOIN appointment_recipients ar ON a.appointment_id = ar.appointment_id AND ar.status <> 'missed'
      WHERE a.status IN ('complete', 'completed', 'cancelled-chargeable')
        AND (a.is_deleted = false OR a.is_deleted IS NULL)
        AND a.start >= $1 AND a.start < $2
    )
    SELECT
      a.appointment_id as lessonId,
      a.start as date,
      a.finish as finishDate,
      a.status as appointmentStatus,
      a.charge_type as chargeType,
      a.units as hours,
      s.name as jobName,
      s.service_id as serviceId,
      STRING_AGG(DISTINCT ac.contractor_name, ', ' ORDER BY ac.contractor_name) as tutorName,
      s.labels as service_labels,
      COALESCE(ar_rev.revenue, 0) as revenue,
      COALESCE(atp.tutorPay, 0) as tutorPay,
      ar.recipient_id as studentId,
      ar.recipient_name as studentName,
      ar.paying_client_id as clientId,
      ar.paying_client_name as clientName,
      COALESCE(sr.studentRevenue, 0) as studentRevenue
    FROM appointments a
    LEFT JOIN services s ON a.service_id = s.service_id
    LEFT JOIN appointment_contractors ac ON a.appointment_id = ac.appointment_id
    LEFT JOIN appointment_revenue ar_rev ON a.appointment_id = ar_rev.appointment_id
    LEFT JOIN appointment_tutor_pay atp ON a.appointment_id = atp.appointment_id
    JOIN appointment_recipients ar ON a.appointment_id = ar.appointment_id AND ar.status <> 'missed'
    LEFT JOIN student_revenue sr ON a.appointment_id = sr.appointment_id AND ar.recipient_id = sr.recipient_id
    WHERE a.status IN ('complete', 'completed', 'cancelled-chargeable')
      AND (a.is_deleted = false OR a.is_deleted IS NULL)
      AND a.start >= $1 AND a.start < $2
    GROUP BY a.appointment_id, a.start, a.finish, a.status, a.charge_type, a.units, s.name, s.service_id, s.labels, ar_rev.revenue, atp.tutorPay, ar.recipient_id, ar.recipient_name, ar.paying_client_id, ar.paying_client_name, sr.studentRevenue
    ORDER BY a.start DESC, ar.recipient_name ASC
  `, [startDate, endDate]);
  
  return rows.map(row => ({
    lessonId: row.lessonid || row.lessonId,
    jobName: row.jobname || row.jobName,
    date: row.date ? new Date(row.date).toLocaleDateString() : '',
    finishDate: row.finishdate ? new Date(row.finishdate).toLocaleDateString() : '',
    hours: Number(row.hours || 0).toFixed(2),
    revenue: Number(row.revenue || 0).toFixed(2),
    tutorName: row.tutorname || row.tutorName,
    tutorPay: Number(row.tutorpay || 0).toFixed(2),
    studentId: row.studentid || row.studentId,
    studentName: row.studentname || row.studentName,
    clientId: row.clientid || row.clientId,
    clientName: row.clientname || row.clientName,
    studentRevenue: Number(row.studentrevenue || 0).toFixed(2),
    chargeType: row.chargetype || null,
    appointmentStatus: row.appointmentstatus || null,
    service_labels: row.service_labels,
    location: row.location
  }));
}

/**
 * Get active tutors detail for a location
 */
async function getActiveTutorsDetail(pool, startDate, endDate) {
  // Check if contractors table exists (cached)
  let contractorsTableExists = false;
  try {
    contractorsTableExists = await tableExists(pool, 'contractors');
  } catch (e) {
    contractorsTableExists = false;
  }
  
  // Build query with optional contractors table join
  const query = contractorsTableExists ? `
    SELECT
      ac.contractor_id,
      COALESCE(
        NULLIF(TRIM(ac.contractor_name), ''),
        CONCAT(
          COALESCE(NULLIF(TRIM(c.first_name), ''), ''),
          CASE WHEN c.first_name IS NOT NULL AND c.last_name IS NOT NULL THEN ' ' ELSE '' END,
          COALESCE(NULLIF(TRIM(c.last_name), ''), '')
        ),
        'Unknown Tutor'
      ) as tutorName,
      COUNT(DISTINCT a.appointment_id) as completedLessons
    FROM appointment_contractors ac
    JOIN appointments a ON ac.appointment_id = a.appointment_id
    LEFT JOIN contractors c ON ac.contractor_id = c.contractor_id
    WHERE a.status IN ('complete', 'completed', 'cancelled-chargeable')
      AND (a.is_deleted = false OR a.is_deleted IS NULL)
      AND a.start >= $1 AND a.start < $2
      AND ac.contractor_id IS NOT NULL
    GROUP BY ac.contractor_id, ac.contractor_name, c.first_name, c.last_name
    HAVING COUNT(DISTINCT a.appointment_id) > 0
    ORDER BY COUNT(DISTINCT a.appointment_id) DESC, tutorName ASC
  ` : `
    SELECT
      ac.contractor_id,
      COALESCE(
        NULLIF(TRIM(ac.contractor_name), ''),
        'Unknown Tutor'
      ) as tutorName,
      COUNT(DISTINCT a.appointment_id) as completedLessons
    FROM appointment_contractors ac
    JOIN appointments a ON ac.appointment_id = a.appointment_id
    WHERE a.status IN ('complete', 'completed', 'cancelled-chargeable')
      AND (a.is_deleted = false OR a.is_deleted IS NULL)
      AND a.start >= $1 AND a.start < $2
      AND ac.contractor_id IS NOT NULL
    GROUP BY ac.contractor_id, ac.contractor_name
    HAVING COUNT(DISTINCT a.appointment_id) > 0
    ORDER BY COUNT(DISTINCT a.appointment_id) DESC, tutorName ASC
  `;
  
  const { rows } = await pool.query(query, [startDate, endDate]);
  
  return rows.map(row => ({
    contractorId: row.contractor_id || row.contractorid,
    tutorName: row.tutorname || row.tutorName || 'Unknown Tutor',
    completedLessons: Number(row.completedlessons || row.completedLessons || 0)
  }));
}

/**
 * Get revenue detail for a location
 */
async function getRevenueDetail(pool, startDate, endDate) {
  const { rows } = await pool.query(`
    SELECT
      a.appointment_id as lessonId,
      a.start as date,
      a.units as hours,
      s.name as jobName,
      STRING_AGG(DISTINCT ac.contractor_name, ', ') as tutorName,
      SUM(
        CASE
          WHEN a.charge_type = 'hourly' THEN ar.charge_rate * a.units
          WHEN a.charge_type = 'one-off' THEN ar.charge_rate
          WHEN a.charge_type = 'one-off-split' THEN ar.charge_rate
          WHEN a.charge_type = 'hourly-split' THEN ar.charge_rate * a.units
          ELSE ar.charge_rate * a.units
        END
      ) as revenue,
      s.labels as service_labels
    FROM appointments a
    JOIN services s ON a.service_id = s.service_id
    LEFT JOIN appointment_recipients ar ON a.appointment_id = ar.appointment_id AND ar.status <> 'missed'
    LEFT JOIN appointment_contractors ac ON a.appointment_id = ac.appointment_id
    WHERE a.status IN ('complete', 'cancelled-chargeable')
      AND (a.is_deleted = false OR a.is_deleted IS NULL)
      AND a.start >= $1 AND a.start < $2
    GROUP BY a.appointment_id, a.start, a.units, s.name, s.labels
    ORDER BY a.start DESC
  `, [startDate, endDate]);
  
  return rows.map(row => ({
    ...row,
    date: row.date ? new Date(row.date).toLocaleDateString() : '',
    hours: Number(row.hours || 0).toFixed(2),
    revenue: Number(row.revenue || 0).toFixed(2)
  }));
}

/**
 * Get tutor pay detail for a location
 */
async function getTutorPayDetail(pool, startDate, endDate) {
  const { rows } = await pool.query(`
    SELECT
      a.appointment_id as lessonId,
      a.start as date,
      a.units as hours,
      s.name as jobName,
      STRING_AGG(DISTINCT ac.contractor_name, ', ') as tutorName,
      SUM(
        CASE
          WHEN a.charge_type = 'hourly' THEN ac.pay_rate * a.units
          WHEN a.charge_type = 'one-off' THEN ac.pay_rate
          WHEN a.charge_type = 'one-off-split' THEN ac.pay_rate
          WHEN a.charge_type = 'hourly-split' THEN ac.pay_rate * a.units
          ELSE ac.pay_rate * a.units
        END
      ) as tutorPay,
      s.labels as service_labels
    FROM appointment_contractors ac
    JOIN appointments a ON ac.appointment_id = a.appointment_id
    LEFT JOIN services s ON a.service_id = s.service_id
    WHERE a.status IN ('complete', 'completed')
      AND (a.is_deleted = false OR a.is_deleted IS NULL)
      AND a.start >= $1 AND a.start < $2
    GROUP BY a.appointment_id, a.start, a.units, s.name, s.labels
    ORDER BY a.start DESC
  `, [startDate, endDate]);
  
  return rows.map(row => ({
    ...row,
    date: row.date ? new Date(row.date).toLocaleDateString() : '',
    hours: Number(row.hours || 0).toFixed(2),
    tutorPay: Number(row.tutorpay || row.tutorPay || 0).toFixed(2)
  }));
}

/**
 * Get profit detail for a location - shows detailed profitability per lesson
 */
async function getProfitDetail(pool, startDate, endDate) {
  // Check if adhoc_charges and contractors tables exist (cached)
  let adhocTableExists = false;
  let contractorsTableExists = false;
  try {
    [adhocTableExists, contractorsTableExists] = await Promise.all([
      tableExists(pool, 'adhoc_charges'),
      tableExists(pool, 'contractors')
    ]);
  } catch (e) {
    // Tables don't exist, continue without them
  }
  
  const { rows } = await pool.query(`
    WITH 
    -- Calculate total revenue per appointment
    appointment_revenue AS (
      SELECT
        a.appointment_id,
        SUM(
          CASE
            WHEN a.charge_type = 'hourly' THEN ar.charge_rate * a.units
            WHEN a.charge_type = 'one-off' THEN ar.charge_rate
            WHEN a.charge_type = 'one-off-split' THEN ar.charge_rate
            WHEN a.charge_type = 'hourly-split' THEN ar.charge_rate * a.units
            ELSE ar.charge_rate * a.units
          END
        ) as revenue
      FROM appointments a
      LEFT JOIN appointment_recipients ar ON a.appointment_id = ar.appointment_id AND ar.status <> 'missed'
      WHERE a.status IN ('complete', 'completed', 'cancelled-chargeable')
        AND (a.is_deleted = false OR a.is_deleted IS NULL)
        AND a.start >= $1 AND a.start < $2
      GROUP BY a.appointment_id
    ),
    -- Calculate total tutor pay per appointment
    appointment_tutor_pay AS (
      SELECT
        a.appointment_id,
        SUM(
          CASE
            WHEN a.charge_type = 'hourly' THEN ac.pay_rate * a.units
            WHEN a.charge_type = 'one-off' THEN ac.pay_rate
            WHEN a.charge_type = 'one-off-split' THEN ac.pay_rate
            WHEN a.charge_type = 'hourly-split' THEN ac.pay_rate * a.units
            ELSE ac.pay_rate * a.units
          END
        ) as tutorPay
      FROM appointments a
      LEFT JOIN appointment_contractors ac ON a.appointment_id = ac.appointment_id
      WHERE a.status IN ('complete', 'completed', 'cancelled-chargeable')
        AND (a.is_deleted = false OR a.is_deleted IS NULL)
        AND a.start >= $1 AND a.start < $2
      GROUP BY a.appointment_id
    ),
    -- Get adhoc pay per appointment (if table exists)
    appointment_adhoc_pay AS (
      ${adhocTableExists ? `
      SELECT
        a.appointment_id,
        SUM(ac.pay_contractor) as adhocPay
      FROM appointments a
      LEFT JOIN adhoc_charges ac ON DATE(ac.date_occurred) = DATE(a.start)
        AND ac.contractor_id IN (
          SELECT contractor_id FROM appointment_contractors WHERE appointment_id = a.appointment_id
        )
      WHERE a.status IN ('complete', 'completed', 'cancelled-chargeable')
        AND (a.is_deleted = false OR a.is_deleted IS NULL)
        AND a.start >= $1 AND a.start < $2
      GROUP BY a.appointment_id
      ` : `
      SELECT
        a.appointment_id,
        0 as adhocPay
      FROM appointments a
      WHERE a.status IN ('complete', 'completed', 'cancelled-chargeable')
        AND (a.is_deleted = false OR a.is_deleted IS NULL)
        AND a.start >= $1 AND a.start < $2
      GROUP BY a.appointment_id
      `}
    ),
    -- Get student names per appointment
    appointment_students AS (
      SELECT
        a.appointment_id,
        STRING_AGG(DISTINCT ar.recipient_name, ', ' ORDER BY ar.recipient_name) as studentNames,
        COUNT(DISTINCT ar.recipient_id) as studentCount
      FROM appointments a
      LEFT JOIN appointment_recipients ar ON a.appointment_id = ar.appointment_id AND ar.status <> 'missed'
      WHERE a.status IN ('complete', 'completed', 'cancelled-chargeable')
        AND (a.is_deleted = false OR a.is_deleted IS NULL)
        AND a.start >= $1 AND a.start < $2
      GROUP BY a.appointment_id
    )
    SELECT
      a.appointment_id as lessonId,
      a.start as date,
      a.finish as finishDate,
      a.status as appointmentStatus,
      a.charge_type as chargeType,
      a.units as hours,
      s.name as jobName,
      s.service_id as serviceId,
      STRING_AGG(DISTINCT 
        COALESCE(
          NULLIF(TRIM(ac.contractor_name), ''),
          ${contractorsTableExists ? `
          CONCAT(
            COALESCE(NULLIF(TRIM(c.first_name), ''), ''),
            CASE WHEN c.first_name IS NOT NULL AND c.last_name IS NOT NULL THEN ' ' ELSE '' END,
            COALESCE(NULLIF(TRIM(c.last_name), ''), '')
          )
          ` : `''`}
        )
      , ', ' ORDER BY 
        COALESCE(
          NULLIF(TRIM(ac.contractor_name), ''),
          ${contractorsTableExists ? `
          CONCAT(
            COALESCE(NULLIF(TRIM(c.first_name), ''), ''),
            CASE WHEN c.first_name IS NOT NULL AND c.last_name IS NOT NULL THEN ' ' ELSE '' END,
            COALESCE(NULLIF(TRIM(c.last_name), ''), '')
          )
          ` : `''`}
        )
      ) as tutorName,
      s.labels as service_labels,
      COALESCE(ar.revenue, 0) as revenue,
      COALESCE(atp.tutorPay, 0) as tutorPay,
      COALESCE(aap.adhocPay, 0) as adhocPay,
      COALESCE(ar.revenue, 0) - COALESCE(atp.tutorPay, 0) - COALESCE(aap.adhocPay, 0) as profit,
      CASE 
        WHEN COALESCE(ar.revenue, 0) > 0 THEN
          ROUND(((COALESCE(ar.revenue, 0) - COALESCE(atp.tutorPay, 0) - COALESCE(aap.adhocPay, 0)) / COALESCE(ar.revenue, 0)) * 100, 1)
        ELSE 0
      END as profitMarginPct,
      COALESCE(ast.studentNames, '') as studentNames,
      COALESCE(ast.studentCount, 0) as studentCount
    FROM appointments a
    LEFT JOIN services s ON a.service_id = s.service_id
    LEFT JOIN appointment_contractors ac ON a.appointment_id = ac.appointment_id
    ${contractorsTableExists ? 'LEFT JOIN contractors c ON ac.contractor_id = c.contractor_id' : ''}
    LEFT JOIN appointment_revenue ar ON a.appointment_id = ar.appointment_id
    LEFT JOIN appointment_tutor_pay atp ON a.appointment_id = atp.appointment_id
    LEFT JOIN appointment_adhoc_pay aap ON a.appointment_id = aap.appointment_id
    LEFT JOIN appointment_students ast ON a.appointment_id = ast.appointment_id
    WHERE a.status IN ('complete', 'completed', 'cancelled-chargeable')
      AND (a.is_deleted = false OR a.is_deleted IS NULL)
      AND a.start >= $1 AND a.start < $2
    GROUP BY a.appointment_id, a.start, a.finish, a.status, a.charge_type, a.units, s.name, s.service_id, s.labels, ar.revenue, atp.tutorPay, aap.adhocPay, ast.studentNames, ast.studentCount
    ORDER BY profit DESC, a.start DESC
  `, [startDate, endDate]);
  
  return rows.map(row => ({
    lessonId: row.lessonid || row.lessonId,
    jobName: row.jobname || row.jobName,
    date: row.date ? new Date(row.date).toLocaleDateString() : '',
    finishDate: row.finishdate ? new Date(row.finishdate).toLocaleDateString() : '',
    hours: Number(row.hours || 0).toFixed(2),
    revenue: Number(row.revenue || 0).toFixed(2),
    tutorPay: Number(row.tutorpay || 0).toFixed(2),
    adhocPay: Number(row.adhocpay || 0).toFixed(2),
    profit: Number(row.profit || 0).toFixed(2),
    profitMarginPct: Number(row.profitmarginpct || 0).toFixed(1),
    tutorName: row.tutorname || row.tutorName || '—',
    studentNames: row.studentnames || '',
    studentCount: Number(row.studentcount || 0),
    chargeType: row.chargetype || null,
    appointmentStatus: row.appointmentstatus || null,
    service_labels: row.service_labels,
    location: row.location
  }));
}

/**
 * Get adhoc pay detail for a location
 */
async function getAdhocPayDetail(pool, startDate, endDate) {
  try {
    const { rows } = await pool.query(`
      SELECT
        ac.id as charge_id,
        ac.description,
        ac.category_name,
        ac.contractor_name,
        ac.creator_name,
        ac.date_occurred,
        ac.pay_contractor
      FROM adhoc_charges ac
      WHERE ac.date_occurred >= $1 AND ac.date_occurred < $2
      ORDER BY ac.date_occurred DESC
    `, [startDate, endDate]);
    
    return rows.map(row => ({
      ...row,
      date_occurred: row.date_occurred ? new Date(row.date_occurred).toLocaleDateString() : '',
      pay_contractor: Number(row.pay_contractor || 0).toFixed(2)
    }));
  } catch (error) {
    // Table might not exist
    logger.info(`adhoc_charges table not available for this location`);
    return [];
  }
}

module.exports = router;
