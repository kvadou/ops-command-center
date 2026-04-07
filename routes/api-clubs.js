const express = require('express');
const router = express.Router();
const { asyncHandler } = require('../middleware/error-handler');
const { TRIAL_PRICE } = require('../config/constants');

const { getLocationPool } = require('../utils/pool');
const { logger } = require('../utils/logger');

// ============================================================
// Public Endpoints (No Auth Required)
// ============================================================

// GET /api/clubs/public/:slug - Public club info for landing page
router.get('/public/:slug', asyncHandler(async (req, res) => {
  try {
    const pool = getLocationPool(req);
    if (!pool) {
      return res.status(500).json({ error: 'Database connection not available' });
    }

    const { slug } = req.params;

    // Fetch club details + booking types + upcoming dates in parallel
    const clubPromise = pool.query(`
      SELECT
        c.id, c.name, c.slug, c.location, c.description,
        c.hero_image_url, c.venue_name, c.venue_address,
        c.logistics_info, c.cancellation_policy, c.capacity,
        c.schedule, c.contact_email, c.contact_phone,
        c.service_labels, c.tc_package_url,
        (SELECT COUNT(DISTINCT cs.recipient_id)
         FROM club_students cs
         WHERE cs.club_id = c.id AND cs.status = 'active') as active_students
      FROM clubs c
      WHERE c.slug = $1 AND c.status = 'active'
    `, [slug]);

    const [clubResult] = await Promise.all([clubPromise]);
    const { rows: clubRows } = clubResult;

    if (clubRows.length === 0) {
      return res.status(404).json({ error: 'Club not found' });
    }

    const club = clubRows[0];
    const primaryLabel = club.service_labels?.[0] || 'Club - Park Slope';

    // Fetch booking types and upcoming dates in parallel
    const [bookingTypesResult, upcomingResult] = await Promise.all([
      pool.query(`
        SELECT id, name, description, original_price AS "originalPrice",
          actual_price AS "actualPrice", is_trial AS "isTrial", lesson_type AS "lessonType"
        FROM booking_types
        WHERE label_name = $1
          AND (lesson_type LIKE 'Club%')
        ORDER BY actual_price ASC
      `, [primaryLabel]),
      pool.query(`
        SELECT DISTINCT
          a.start,
          a.finish,
          s.name as service_name,
          (SELECT COUNT(*) FROM appointment_recipients ar
           WHERE ar.appointment_id = a.appointment_id
             AND (ar.status IS NULL OR ar.status <> 'missed')) as enrolled
        FROM appointments a
        JOIN services s ON a.service_id = s.service_id
        WHERE a.is_deleted IS NOT TRUE
          AND a.status = 'planned'
          AND a.start > NOW()
          AND s.labels::text LIKE $1
          AND s.labels::text NOT LIKE '%Support%'
        ORDER BY a.start ASC
        LIMIT 8
      `, ['%' + primaryLabel + '%'])
    ]);

    // Set cache headers - cache for 5 minutes
    res.set('Cache-Control', 'public, max-age=300');

    res.json({
      club: {
        name: club.name,
        slug: club.slug,
        location: club.location,
        description: club.description,
        heroImageUrl: club.hero_image_url,
        venueName: club.venue_name,
        venueAddress: club.venue_address,
        logisticsInfo: club.logistics_info,
        cancellationPolicy: club.cancellation_policy,
        capacity: club.capacity,
        schedule: club.schedule || [],
        contactEmail: club.contact_email,
        contactPhone: club.contact_phone,
        activeStudents: parseInt(club.active_students) || 0,
        tcPackageUrl: club.tc_package_url,
      },
      bookingTypes: bookingTypesResult.rows,
      upcomingDates: upcomingResult.rows.map(d => ({
        start: d.start,
        finish: d.finish,
        serviceName: d.service_name,
        enrolled: parseInt(d.enrolled) || 0,
        spotsRemaining: (club.capacity || 20) - (parseInt(d.enrolled) || 0),
      })),
    });
  } catch (error) {
    logger.error({ err: error }, 'Failed to fetch public club data');
    res.status(500).json({ error: 'Failed to fetch club data' });
  }
}));

// ============================================================
// Club Registry Endpoints
// ============================================================

// GET /api/clubs/registry - List all clubs
router.get('/registry', asyncHandler(async (req, res) => {
  try {
    const pool = getLocationPool(req);
    if (!pool) {
      return res.status(500).json({ error: 'Database connection not available' });
    }

    const { status } = req.query;
    let query = `
      SELECT c.*,
        (SELECT COUNT(DISTINCT cs.recipient_id)
         FROM club_students cs
         WHERE cs.club_id = c.id AND cs.status = 'active') as active_students,
        (SELECT COUNT(DISTINCT cs.recipient_id)
         FROM club_students cs
         WHERE cs.club_id = c.id) as total_students
      FROM clubs c
    `;
    const params = [];

    // Default to active clubs only; pass ?status=all to include archived
    if (status === 'all') {
      // No filter
    } else if (status) {
      query += ' WHERE c.status = $1';
      params.push(status);
    } else {
      query += " WHERE c.status = 'active'";
    }

    query += ' ORDER BY c.name';

    const { rows } = await pool.query(query, params);
    res.json({ clubs: rows });
  } catch (error) {
    logger.error({ err: error }, 'Failed to fetch club registry');
    res.status(500).json({ error: 'Failed to fetch clubs' });
  }
}));

// GET /api/clubs/registry/:id - Get single club with full details
router.get('/registry/:id', asyncHandler(async (req, res) => {
  try {
    const pool = getLocationPool(req);
    if (!pool) {
      return res.status(500).json({ error: 'Database connection not available' });
    }

    const { id } = req.params;

    const { rows } = await pool.query(`
      SELECT c.*,
        (SELECT COUNT(DISTINCT cs.recipient_id)
         FROM club_students cs
         WHERE cs.club_id = c.id AND cs.status = 'active') as active_students,
        (SELECT COUNT(DISTINCT cs.recipient_id)
         FROM club_students cs
         WHERE cs.club_id = c.id) as total_students
      FROM clubs c
      WHERE c.id = $1
    `, [id]);

    if (rows.length === 0) {
      return res.status(404).json({ error: 'Club not found' });
    }

    res.json({ club: rows[0] });
  } catch (error) {
    logger.error({ err: error, clubId: req.params.id }, 'Failed to fetch club');
    res.status(500).json({ error: 'Failed to fetch club' });
  }
}));

// PUT /api/clubs/registry/:id - Update club
router.put('/registry/:id', asyncHandler(async (req, res) => {
  try {
    const pool = getLocationPool(req);
    if (!pool) {
      return res.status(500).json({ error: 'Database connection not available' });
    }

    const { id } = req.params;
    const {
      name, location, venue_name, venue_address, capacity,
      default_pricing, schedule, contact_email, contact_phone,
      status, booking_form_url, service_labels, support_labels,
      description, hero_image_url, logistics_info, cancellation_policy, tc_package_url
    } = req.body;

    const { rows } = await pool.query(`
      UPDATE clubs SET
        name = COALESCE($2, name),
        location = COALESCE($3, location),
        venue_name = COALESCE($4, venue_name),
        venue_address = COALESCE($5, venue_address),
        capacity = COALESCE($6, capacity),
        default_pricing = COALESCE($7, default_pricing),
        schedule = COALESCE($8, schedule),
        contact_email = COALESCE($9, contact_email),
        contact_phone = COALESCE($10, contact_phone),
        status = COALESCE($11, status),
        booking_form_url = COALESCE($12, booking_form_url),
        service_labels = COALESCE($13, service_labels),
        support_labels = COALESCE($14, support_labels),
        description = COALESCE($15, description),
        hero_image_url = COALESCE($16, hero_image_url),
        logistics_info = COALESCE($17, logistics_info),
        cancellation_policy = COALESCE($18, cancellation_policy),
        tc_package_url = COALESCE($19, tc_package_url),
        updated_at = NOW()
      WHERE id = $1
      RETURNING *
    `, [id, name, location, venue_name, venue_address, capacity,
        default_pricing ? JSON.stringify(default_pricing) : null,
        schedule ? JSON.stringify(schedule) : null,
        contact_email, contact_phone, status, booking_form_url,
        service_labels ? JSON.stringify(service_labels) : null,
        support_labels ? JSON.stringify(support_labels) : null,
        description, hero_image_url, logistics_info, cancellation_policy, tc_package_url]);

    if (rows.length === 0) {
      return res.status(404).json({ error: 'Club not found' });
    }

    res.json({ club: rows[0] });
  } catch (error) {
    logger.error({ err: error, clubId: req.params.id }, 'Failed to update club');
    res.status(500).json({ error: 'Failed to update club' });
  }
}));

// POST /api/clubs/registry - Create new club
router.post('/registry', asyncHandler(async (req, res) => {
  try {
    const pool = getLocationPool(req);
    if (!pool) {
      return res.status(500).json({ error: 'Database connection not available' });
    }

    const {
      name, slug, location, venue_name, venue_address, capacity,
      default_pricing, schedule, contact_email, contact_phone,
      booking_form_url, service_labels, support_labels
    } = req.body;

    if (!name || !slug || !service_labels || service_labels.length === 0) {
      return res.status(400).json({ error: 'name, slug, and service_labels are required' });
    }

    const { rows } = await pool.query(`
      INSERT INTO clubs (name, slug, location, venue_name, venue_address, capacity,
        default_pricing, schedule, contact_email, contact_phone,
        booking_form_url, service_labels, support_labels)
      VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13)
      RETURNING *
    `, [name, slug, location, venue_name, venue_address, capacity,
        JSON.stringify(default_pricing || {}),
        JSON.stringify(schedule || []),
        contact_email, contact_phone, booking_form_url,
        JSON.stringify(service_labels),
        JSON.stringify(support_labels || [])]);

    res.status(201).json({ club: rows[0] });
  } catch (error) {
    if (error.code === '23505') {
      return res.status(409).json({ error: 'A club with that slug already exists' });
    }
    logger.error({ err: error }, 'Failed to create club');
    res.status(500).json({ error: 'Failed to create club' });
  }
}));

// GET /api/clubs/registry/:id/students - Get students for a club
router.get('/registry/:id/students', asyncHandler(async (req, res) => {
  try {
    const pool = getLocationPool(req);
    if (!pool) {
      return res.status(500).json({ error: 'Database connection not available' });
    }

    const { id } = req.params;
    const { status: studentStatus } = req.query;

    let query = `
      SELECT cs.*, r.first_name, r.last_name, r.paying_client_id,
        c.first_name as client_first_name, c.last_name as client_last_name, c.email as client_email,
        (SELECT cm.band_name FROM curriculum_modules cm
         JOIN curriculum_lessons cl ON cl.module_id = cm.id
         JOIN student_progress sp ON sp.curriculum_lesson_id = cl.id
         WHERE sp.recipient_id = cs.recipient_id
         ORDER BY cm.sort_order DESC, cl.lesson_number DESC
         LIMIT 1) as current_band,
        (SELECT cm.band_color FROM curriculum_modules cm
         JOIN curriculum_lessons cl ON cl.module_id = cm.id
         JOIN student_progress sp ON sp.curriculum_lesson_id = cl.id
         WHERE sp.recipient_id = cs.recipient_id
         ORDER BY cm.sort_order DESC, cl.lesson_number DESC
         LIMIT 1) as band_color,
        (SELECT COUNT(*) FROM student_progress sp WHERE sp.recipient_id = cs.recipient_id) as lessons_completed
      FROM club_students cs
      LEFT JOIN recipients r ON cs.recipient_id = r.recipient_id
      LEFT JOIN clients c ON r.paying_client_id::text = c.client_id::text
      WHERE cs.club_id = $1
    `;
    const params = [id];

    if (studentStatus) {
      query += ' AND cs.status = $2';
      params.push(studentStatus);
    }

    query += ' ORDER BY r.last_name, r.first_name';

    const { rows } = await pool.query(query, params);
    res.json({ students: rows });
  } catch (error) {
    logger.error({ err: error, clubId: req.params.id }, 'Failed to fetch club students');
    res.status(500).json({ error: 'Failed to fetch club students' });
  }
}));

// GET /api/clubs/dashboard - Get dashboard metrics for clubs
router.get('/dashboard', asyncHandler(async (req, res) => {
  try {
    const pool = getLocationPool(req);
    if (!pool) {
      return res.status(500).json({ error: 'Database connection not available' });
    }

    // Fetch active clubs from registry (with student counts already available)
    const { rows: clubs } = await pool.query(`
      SELECT c.id, c.name, c.slug, c.service_labels, c.support_labels,
        (SELECT COUNT(DISTINCT cs.recipient_id) FROM club_students cs WHERE cs.club_id = c.id AND cs.status = 'active') as active_students,
        (SELECT COUNT(DISTINCT cs.recipient_id) FROM club_students cs WHERE cs.club_id = c.id) as total_students
      FROM clubs c WHERE c.status = 'active' ORDER BY c.name
    `);

    const emptyMetrics = { totalJobs: 0, totalLessons: 0, upcomingLessons: 0, completedLessons: 0, totalRevenue: 0, activeStudents: 0, totalHours: 0 };

    if (clubs.length === 0) {
      return res.json({ clubs: [], combined: emptyMetrics });
    }

    // Collect ALL labels across all active clubs and query once
    const allLabelsByClub = clubs.map(club => ({
      id: club.id,
      labels: [
        ...(Array.isArray(club.service_labels) ? club.service_labels : []),
        ...(Array.isArray(club.support_labels) ? club.support_labels : [])
      ]
    }));
    const allLabels = [...new Set(allLabelsByClub.flatMap(c => c.labels))];

    if (allLabels.length === 0) {
      const clubResults = clubs.map(club => ({ id: club.id, name: club.name, slug: club.slug, ...emptyMetrics, activeStudents: parseInt(club.active_students) || 0 }));
      return res.json({ clubs: clubResults, combined: emptyMetrics });
    }

    // Single query: get per-service metrics, then map to clubs in JS
    const labelPatterns = allLabels.map(l => `%${l}%`);
    const metricsQuery = `
      SELECT
        lbl_match.label_value,
        COUNT(DISTINCT a.service_id) as total_jobs,
        COUNT(*) as total_lessons,
        COUNT(*) FILTER (WHERE a.status = 'planned') as upcoming_lessons,
        COUNT(*) FILTER (WHERE a.status IN ('complete', 'completed', 'cancelled-chargeable')) as completed_lessons,
        COALESCE(SUM(ar.charge_rate) FILTER (WHERE a.status IN ('complete', 'completed', 'cancelled-chargeable') AND (ar.status IS NULL OR ar.status <> 'missed')), 0) as total_revenue,
        COUNT(DISTINCT ar.recipient_id) FILTER (WHERE a.status IN ('complete', 'completed', 'cancelled-chargeable') AND (ar.status IS NULL OR ar.status <> 'missed')) as all_time_students,
        COALESCE(SUM(CASE WHEN a.status IN ('complete', 'completed', 'cancelled-chargeable') THEN a.units ELSE 0 END), 0) as total_hours
      FROM appointments a
      JOIN services s ON a.service_id = s.service_id
      CROSS JOIN LATERAL (
        SELECT lbl.value as label_value
        FROM jsonb_array_elements_text(COALESCE(s.labels, '[]'::jsonb)) AS lbl(value)
        WHERE lbl.value ILIKE ANY($1::text[])
        LIMIT 1
      ) lbl_match
      LEFT JOIN appointment_recipients ar ON ar.appointment_id = a.appointment_id
      WHERE a.is_deleted IS NOT TRUE
      GROUP BY lbl_match.label_value
    `;

    const { rows: metricRows } = await pool.query(metricsQuery, [labelPatterns]);

    // Map metrics to clubs based on which labels belong to which club
    const clubResults = clubs.map(club => {
      const clubLabels = [
        ...(Array.isArray(club.service_labels) ? club.service_labels : []),
        ...(Array.isArray(club.support_labels) ? club.support_labels : [])
      ];

      // Sum metrics from rows whose label matches this club's labels
      let totalJobs = 0, totalLessons = 0, upcomingLessons = 0, completedLessons = 0, totalRevenue = 0, totalHours = 0;
      for (const row of metricRows) {
        const matches = clubLabels.some(cl => row.label_value.toLowerCase().includes(cl.toLowerCase()) || cl.toLowerCase().includes(row.label_value.toLowerCase()));
        if (matches) {
          totalJobs += parseInt(row.total_jobs) || 0;
          totalLessons += parseInt(row.total_lessons) || 0;
          upcomingLessons += parseInt(row.upcoming_lessons) || 0;
          completedLessons += parseInt(row.completed_lessons) || 0;
          totalRevenue += parseFloat(row.total_revenue) || 0;
          totalHours += parseFloat(row.total_hours) || 0;
        }
      }

      return {
        id: club.id,
        name: club.name,
        slug: club.slug,
        totalJobs,
        totalLessons,
        upcomingLessons,
        completedLessons,
        totalRevenue,
        activeStudents: parseInt(club.active_students) || 0,
        totalHours,
      };
    });

    // Build combined metrics
    const combined = clubResults.reduce((acc, club) => ({
      totalJobs: acc.totalJobs + club.totalJobs,
      totalLessons: acc.totalLessons + club.totalLessons,
      upcomingLessons: acc.upcomingLessons + club.upcomingLessons,
      completedLessons: acc.completedLessons + club.completedLessons,
      totalRevenue: acc.totalRevenue + club.totalRevenue,
      activeStudents: acc.activeStudents + club.activeStudents,
      totalHours: acc.totalHours + club.totalHours,
    }), emptyMetrics);

    // Backward compatibility
    const parkSlope = clubResults.find(c => c.slug === 'park-slope') || combined;

    res.json({
      clubs: clubResults,
      combined,
      parkSlope,
    });
  } catch (error) {
    logger.error({ err: error }, 'Failed to fetch club dashboard');
    res.status(500).json({ error: 'Failed to fetch club dashboard' });
  }
}));

// GET /api/clubs/operations - Get operations data for a date range
router.get('/operations', asyncHandler(async (req, res) => {
  try {
    const pool = getLocationPool(req);
    if (!pool) {
      return res.status(500).json({ error: 'Database connection not available' });
    }

    const { startDate, endDate, clubId } = req.query;

    if (!startDate || !endDate) {
      return res.status(400).json({ error: 'startDate and endDate are required' });
    }

    const client = await pool.connect();

    try {
      // Look up labels from clubs table
      let clubLabels;

      if (clubId) {
        const { rows: clubRows } = await pool.query('SELECT service_labels, support_labels FROM clubs WHERE id = $1', [clubId]);
        if (clubRows.length === 0) {
          client.release();
          return res.status(404).json({ error: 'Club not found' });
        }
        const club = clubRows[0];
        clubLabels = [
          ...(Array.isArray(club.service_labels) ? club.service_labels : []),
          ...(Array.isArray(club.support_labels) ? club.support_labels : [])
        ];
      } else {
        // All active clubs
        const { rows: allClubs } = await pool.query("SELECT service_labels, support_labels FROM clubs WHERE status = 'active'");
        clubLabels = allClubs.flatMap(c => [
          ...(Array.isArray(c.service_labels) ? c.service_labels : []),
          ...(Array.isArray(c.support_labels) ? c.support_labels : [])
        ]);
      }

      const labelPatterns = clubLabels.map(label => `%${label}%`);

      // Get lessons with full financial details for the date range
      const lessonsQuery = `
        WITH club_services AS (
          SELECT s.service_id, s.name, s.dft_charge_type, s.sr_premium,
            (SELECT lbl.value
             FROM jsonb_array_elements_text(COALESCE(s.labels, '[]'::jsonb)) AS lbl(value)
             WHERE lbl.value ILIKE ANY($1::text[])
             LIMIT 1) as service_label
          FROM services s
          WHERE EXISTS (
            SELECT 1
            FROM jsonb_array_elements_text(COALESCE(s.labels, '[]'::jsonb)) AS lbl(value)
            WHERE lbl.value ILIKE ANY($1::text[])
          )
        ),
        lesson_students AS (
          SELECT
            ar.appointment_id,
            COUNT(*) FILTER (WHERE ar.status IS NULL OR ar.status <> 'missed') as student_count,
            COALESCE(SUM(ar.charge_rate) FILTER (WHERE ar.status IS NULL OR ar.status <> 'missed'), 0) as revenue,
            json_agg(json_build_object(
              'name', ar.recipient_name,
              'status', ar.status,
              'chargeRate', ar.charge_rate
            )) as students
          FROM appointment_recipients ar
          GROUP BY ar.appointment_id
        ),
        lesson_tutors AS (
          SELECT
            ac.appointment_id,
            string_agg(DISTINCT c.first_name || ' ' || c.last_name, ', ') as tutor_names,
            COALESCE(SUM(ac.pay_rate), 0) as base_pay_rate,
            json_agg(json_build_object(
              'name', c.first_name || ' ' || c.last_name,
              'contractorId', c.contractor_id,
              'payRate', ac.pay_rate
            )) as tutors
          FROM appointment_contractors ac
          JOIN contractors c ON ac.contractor_id = c.contractor_id
          GROUP BY ac.appointment_id
        )
        SELECT
          a.appointment_id,
          a.start,
          a.finish,
          a.status,
          a.units,
          a.location,
          cs.name as job_name,
          cs.service_label,
          cs.dft_charge_type,
          cs.sr_premium,
          COALESCE(lt.tutor_names, 'No tutor') as tutor_name,
          lt.tutors,
          COALESCE(ls.student_count, 0) as student_count,
          COALESCE(ls.revenue, 0) as revenue,
          ls.students,
          COALESCE(lt.base_pay_rate, 0) as base_pay_rate,
          -- Calculate tutor pay based on charge type
          CASE
            WHEN cs.dft_charge_type IN ('hourly', 'hourly-split')
              THEN COALESCE(lt.base_pay_rate, 0) * COALESCE(a.units, 1)
            ELSE COALESCE(lt.base_pay_rate, 0)
          END + (COALESCE(ls.student_count, 0) * COALESCE(cs.sr_premium, 0) * COALESCE(a.units, 1)) as tutor_pay
        FROM appointments a
        JOIN club_services cs ON a.service_id = cs.service_id
        LEFT JOIN lesson_students ls ON a.appointment_id = ls.appointment_id
        LEFT JOIN lesson_tutors lt ON a.appointment_id = lt.appointment_id
        WHERE a.is_deleted IS NOT TRUE
          AND DATE(a.start AT TIME ZONE 'America/New_York') >= $2::date
          AND DATE(a.start AT TIME ZONE 'America/New_York') <= $3::date
        ORDER BY a.start ASC
      `;

      const { rows } = await client.query(lessonsQuery, [labelPatterns, startDate, endDate]);

      // Calculate summary metrics - separate lessons from support
      let lessonCount = 0;
      let supportCount = 0;
      let totalStudents = 0;
      let totalRevenue = 0;
      let tutorPay = 0;
      let supportPay = 0;
      const uniqueStudents = new Set();

      const lessons = rows.map(row => {
        const revenue = parseFloat(row.revenue || 0);
        const pay = parseFloat(row.tutor_pay || 0);
        const studentCount = parseInt(row.student_count || 0);
        const isCompleted = ['complete', 'completed', 'cancelled-chargeable'].includes(row.status);
        const isSupport = row.service_label?.includes('Support');

        // Track lessons vs support separately
        if (isSupport) {
          supportCount++;
          supportPay += pay;
        } else {
          lessonCount++;
          tutorPay += pay;
          totalRevenue += revenue;
          totalStudents += studentCount;
        }

        // Track unique students (only from lessons, not support)
        if (!isSupport && row.students) {
          row.students.forEach(s => {
            if (s.name && s.status !== 'missed') {
              uniqueStudents.add(s.name);
            }
          });
        }

        return {
          appointmentId: row.appointment_id,
          date: row.start,
          endDate: row.finish,
          time: new Date(row.start).toLocaleTimeString('en-US', {
            hour: 'numeric',
            minute: '2-digit',
            timeZone: 'America/New_York'
          }),
          endTime: new Date(row.finish).toLocaleTimeString('en-US', {
            hour: 'numeric',
            minute: '2-digit',
            timeZone: 'America/New_York'
          }),
          location: row.location,
          jobName: row.job_name,
          label: row.service_label,
          labelColor: row.service_label?.includes('Support') ? '#ff1493' : '#1e90ff',
          tutorName: row.tutor_name,
          tutors: row.tutors || [],
          studentCount: studentCount,
          revenue: revenue,
          tutorPay: pay,
          profit: revenue - pay,
          status: row.status,
          isCheckedOut: isCompleted,
          students: row.students || [],
          units: row.units,
          chargeType: row.dft_charge_type,
          srPremium: row.sr_premium,
        };
      });

      // Calculate profit from lessons only (revenue - tutor pay, excludes support pay)
      const lessonProfit = totalRevenue - tutorPay;
      const lessonMargin = totalRevenue > 0 ? (lessonProfit / totalRevenue) * 100 : 0;

      // Combined profit includes support costs
      const combinedProfit = totalRevenue - tutorPay - supportPay;
      const combinedMargin = totalRevenue > 0 ? (combinedProfit / totalRevenue) * 100 : 0;

      const avgRevenuePerLesson = lessonCount > 0 ? totalRevenue / lessonCount : 0;

      res.json({
        summary: {
          // Lesson metrics
          lessonCount: lessonCount,
          studentCount: uniqueStudents.size,
          totalAttendance: totalStudents,
          grossRevenue: totalRevenue,
          tutorPay: tutorPay,
          lessonProfit: lessonProfit,
          lessonMargin: Math.round(lessonMargin * 10) / 10,
          avgRevenuePerLesson: Math.round(avgRevenuePerLesson * 100) / 100,
          // Support metrics
          supportCount: supportCount,
          supportPay: supportPay,
          // Combined metrics
          combinedProfit: combinedProfit,
          combinedMargin: Math.round(combinedMargin * 10) / 10,
        },
        lessons,
      });
    } finally {
      client.release();
    }
  } catch (error) {
    logger.error({ err: error }, 'Failed to fetch clubs operations data');
    res.status(500).json({
      error: 'Failed to fetch clubs operations data'
    });
  }
}));

// GET /api/clubs/booking-forms - Get booking forms for club jobs
router.get('/booking-forms', asyncHandler(async (req, res) => {
  try {
    const pool = getLocationPool(req);
    if (!pool) {
      return res.status(500).json({ error: 'Database connection not available' });
    }

    const client = await pool.connect();
    
    try {
      // Club labels
      const clubLabels = ['Club - Park Slope', 'Club - Park Slope Support'];

      // Get booking types that have club labels
      const query = `
        SELECT DISTINCT
          bt.id,
          bt.name,
          bt.description,
          bt.lesson_type as "lessonType",
          bt.original_price as "originalPrice",
          bt.actual_price as "actualPrice",
          bt.service_id as "serviceId",
          s.labels
        FROM booking_types bt
        LEFT JOIN services s ON bt.service_id::text = s.service_id::text
        WHERE (
          EXISTS (
            SELECT 1 
            FROM jsonb_array_elements_text(COALESCE(s.labels, '[]'::jsonb)) AS lbl(value)
            WHERE lbl.value ILIKE ANY($1::text[])
          )
          OR bt.lesson_type ILIKE '%club%'
        )
        ORDER BY bt.name
      `;

      const labelPatterns = clubLabels.map(label => `%${label}%`);
      const { rows } = await client.query(query, [labelPatterns]);

      // Transform results
      const forms = rows.map(row => ({
        id: row.id,
        name: row.name,
        description: row.description,
        lessonType: row.lessonType,
        originalPrice: parseFloat(row.originalPrice || 0),
        actualPrice: parseFloat(row.actualPrice || 0),
        serviceId: row.serviceId,
        labels: row.labels ? (Array.isArray(row.labels) ? row.labels : JSON.parse(row.labels)) : [],
      }));

      res.json({ forms });
    } finally {
      client.release();
    }
  } catch (error) {
    logger.error({ err: error }, 'Error fetching clubs booking forms');
    res.status(500).json({ error: 'Failed to fetch clubs booking forms' });
  }
}));

// GET /api/clubs/jobs-detail - Get detailed job/service metrics for Park Slope clubs
router.get('/jobs-detail', asyncHandler(async (req, res) => {
  try {
    const pool = getLocationPool(req);
    if (!pool) {
      return res.status(500).json({ error: 'Database connection not available' });
    }

    const client = await pool.connect();

    try {
      const parkSlopeLabels = ['Club - Park Slope', 'Club - Park Slope Support'];
      const labelPatterns = parkSlopeLabels.map(label => `%${label}%`);

      const query = `
        WITH club_services AS (
          SELECT s.service_id, s.name, s.labels, s.dft_charge_rate, s.status
          FROM services s
          WHERE EXISTS (
            SELECT 1
            FROM jsonb_array_elements_text(COALESCE(s.labels, '[]'::jsonb)) AS lbl(value)
            WHERE lbl.value ILIKE ANY($1::text[])
          )
          AND (s.status IS NULL OR s.status NOT IN ('archived', 'deleted'))
        )
        SELECT
          cs.service_id,
          cs.name,
          cs.labels,
          cs.dft_charge_rate as hourly_rate,
          cs.status,
          COUNT(DISTINCT a.appointment_id) as lesson_count,
          COUNT(DISTINCT a.appointment_id) FILTER (WHERE a.status IN ('complete','completed')) as completed_lessons,
          COUNT(DISTINCT a.appointment_id) FILTER (WHERE a.status = 'planned') as upcoming_lessons,
          COUNT(DISTINCT ar.recipient_id) FILTER (WHERE ar.status IS NULL OR ar.status <> 'missed') as student_count,
          COALESCE(SUM(ar.charge_rate) FILTER (WHERE a.status IN ('complete','completed','cancelled-chargeable') AND (ar.status IS NULL OR ar.status <> 'missed')), 0) as revenue,
          COALESCE(SUM(a.units) FILTER (WHERE a.status IN ('complete','completed','cancelled-chargeable')), 0) as hours
        FROM club_services cs
        LEFT JOIN appointments a ON cs.service_id = a.service_id AND a.is_deleted IS NOT TRUE
        LEFT JOIN appointment_recipients ar ON a.appointment_id = ar.appointment_id
        GROUP BY cs.service_id, cs.name, cs.labels, cs.dft_charge_rate, cs.status
        ORDER BY revenue DESC
      `;

      const { rows } = await client.query(query, [labelPatterns]);

      const jobs = rows.map(row => ({
        serviceId: row.service_id,
        name: row.name,
        labels: row.labels || [],
        hourlyRate: parseFloat(row.hourly_rate || 0),
        status: row.status,
        lessonCount: parseInt(row.lesson_count || 0),
        completedLessons: parseInt(row.completed_lessons || 0),
        upcomingLessons: parseInt(row.upcoming_lessons || 0),
        studentCount: parseInt(row.student_count || 0),
        revenue: parseFloat(row.revenue || 0),
        hours: parseFloat(row.hours || 0),
      }));

      res.json({ jobs });
    } finally {
      client.release();
    }
  } catch (error) {
    logger.error({ err: error }, 'Error fetching clubs jobs detail');
    res.status(500).json({ error: 'Failed to fetch clubs jobs detail' });
  }
}));

// GET /api/clubs/lessons-detail - Get lessons for a specific job or all club lessons
router.get('/lessons-detail', asyncHandler(async (req, res) => {
  try {
    const pool = getLocationPool(req);
    if (!pool) {
      return res.status(500).json({ error: 'Database connection not available' });
    }

    const client = await pool.connect();

    try {
      const { service_id, limit = 100, offset = 0 } = req.query;
      const parkSlopeLabels = ['Club - Park Slope', 'Club - Park Slope Support'];
      const labelPatterns = parkSlopeLabels.map(label => `%${label}%`);

      let query;
      let params;

      if (service_id) {
        // Get lessons for a specific service
        query = `
          SELECT
            a.appointment_id,
            a.start,
            a.finish,
            a.status,
            a.topic,
            a.units,
            a.service_id,
            s.name as service_name,
            (
              SELECT string_agg(DISTINCT c.first_name || ' ' || c.last_name, ', ')
              FROM appointment_contractors ac
              JOIN contractors c ON ac.contractor_id = c.contractor_id
              WHERE ac.appointment_id = a.appointment_id
            ) as tutor_names,
            (
              SELECT json_agg(json_build_object('name', ar2.recipient_name, 'status', ar2.status))
              FROM appointment_recipients ar2
              WHERE ar2.appointment_id = a.appointment_id
            ) as students,
            (
              SELECT COALESCE(SUM(ar3.charge_rate), 0)
              FROM appointment_recipients ar3
              WHERE ar3.appointment_id = a.appointment_id AND (ar3.status IS NULL OR ar3.status <> 'missed')
            ) as charge_total
          FROM appointments a
          JOIN services s ON a.service_id = s.service_id
          WHERE a.service_id = $1
            AND a.is_deleted IS NOT TRUE
          ORDER BY a.start DESC
          LIMIT $2 OFFSET $3
        `;
        params = [service_id, limit, offset];
      } else {
        // Get all club lessons
        query = `
          WITH club_services AS (
            SELECT s.service_id
            FROM services s
            WHERE EXISTS (
              SELECT 1
              FROM jsonb_array_elements_text(COALESCE(s.labels, '[]'::jsonb)) AS lbl(value)
              WHERE lbl.value ILIKE ANY($1::text[])
            )
          )
          SELECT
            a.appointment_id,
            a.start,
            a.finish,
            a.status,
            a.topic,
            a.units,
            a.service_id,
            s.name as service_name,
            (
              SELECT string_agg(DISTINCT c.first_name || ' ' || c.last_name, ', ')
              FROM appointment_contractors ac
              JOIN contractors c ON ac.contractor_id = c.contractor_id
              WHERE ac.appointment_id = a.appointment_id
            ) as tutor_names,
            (
              SELECT json_agg(json_build_object('name', ar2.recipient_name, 'status', ar2.status))
              FROM appointment_recipients ar2
              WHERE ar2.appointment_id = a.appointment_id
            ) as students,
            (
              SELECT COALESCE(SUM(ar3.charge_rate), 0)
              FROM appointment_recipients ar3
              WHERE ar3.appointment_id = a.appointment_id AND (ar3.status IS NULL OR ar3.status <> 'missed')
            ) as charge_total
          FROM appointments a
          JOIN services s ON a.service_id = s.service_id
          JOIN club_services cs ON a.service_id = cs.service_id
          WHERE a.is_deleted IS NOT TRUE
          ORDER BY a.start DESC
          LIMIT $2 OFFSET $3
        `;
        params = [labelPatterns, limit, offset];
      }

      const { rows } = await client.query(query, params);

      const lessons = rows.map(row => ({
        appointmentId: row.appointment_id,
        start: row.start,
        finish: row.finish,
        status: row.status,
        topic: row.topic,
        units: parseFloat(row.units || 0),
        serviceId: row.service_id,
        serviceName: row.service_name,
        tutorNames: row.tutor_names,
        students: row.students || [],
        chargeTotal: parseFloat(row.charge_total || 0),
      }));

      res.json({ lessons });
    } finally {
      client.release();
    }
  } catch (error) {
    logger.error({ err: error }, 'Error fetching clubs lessons detail');
    res.status(500).json({ error: 'Failed to fetch clubs lessons detail' });
  }
}));

// GET /api/clubs/students-detail - Get student attendance and parent info for Park Slope clubs
router.get('/students-detail', asyncHandler(async (req, res) => {
  try {
    const pool = getLocationPool(req);
    if (!pool) {
      return res.status(500).json({ error: 'Database connection not available' });
    }

    const client = await pool.connect();

    try {
      const parkSlopeLabels = ['Club - Park Slope', 'Club - Park Slope Support'];
      const labelPatterns = parkSlopeLabels.map(label => `%${label}%`);

      const query = `
        WITH club_appointments AS (
          SELECT a.appointment_id, a.start, a.units, a.status as appt_status
          FROM appointments a
          JOIN services s ON a.service_id = s.service_id
          WHERE EXISTS (
            SELECT 1
            FROM jsonb_array_elements_text(COALESCE(s.labels, '[]'::jsonb)) AS lbl(value)
            WHERE lbl.value ILIKE ANY($1::text[])
          )
          AND a.is_deleted IS NOT TRUE
        )
        SELECT
          ar.recipient_id,
          ar.recipient_name,
          ar.paying_client_id,
          ar.paying_client_name,
          c.email as paying_client_email,
          c.mobile as paying_client_phone,
          COUNT(DISTINCT ca.appointment_id) as lesson_count,
          COUNT(DISTINCT ca.appointment_id) FILTER (WHERE ar.status = 'missed') as missed_lessons,
          COALESCE(SUM(ar.charge_rate) FILTER (WHERE ar.status IS NULL OR ar.status <> 'missed'), 0) as total_paid,
          COALESCE(SUM(ca.units) FILTER (WHERE ar.status IS NULL OR ar.status <> 'missed'), 0) as total_hours,
          MAX(ca.start) as last_lesson_date,
          MIN(ca.start) as first_lesson_date
        FROM appointment_recipients ar
        JOIN club_appointments ca ON ar.appointment_id = ca.appointment_id
        LEFT JOIN clients c ON ar.paying_client_id::text = c.client_id::text
        GROUP BY ar.recipient_id, ar.recipient_name, ar.paying_client_id, ar.paying_client_name, c.email, c.mobile
        ORDER BY total_paid DESC
      `;

      const { rows } = await client.query(query, [labelPatterns]);

      const students = rows.map(row => ({
        recipientId: row.recipient_id,
        recipientName: row.recipient_name,
        payingClientId: row.paying_client_id,
        payingClientName: row.paying_client_name,
        payingClientEmail: row.paying_client_email,
        payingClientPhone: row.paying_client_phone,
        lessonCount: parseInt(row.lesson_count || 0),
        missedLessons: parseInt(row.missed_lessons || 0),
        totalPaid: parseFloat(row.total_paid || 0),
        totalHours: parseFloat(row.total_hours || 0),
        lastLessonDate: row.last_lesson_date,
        firstLessonDate: row.first_lesson_date,
      }));

      res.json({ students });
    } finally {
      client.release();
    }
  } catch (error) {
    logger.error({ err: error }, 'Error fetching clubs students detail');
    res.status(500).json({ error: 'Failed to fetch clubs students detail' });
  }
}));

// GET /api/clubs/revenue-detail - Get revenue breakdown by job and month for Park Slope clubs
router.get('/revenue-detail', asyncHandler(async (req, res) => {
  try {
    const pool = getLocationPool(req);
    if (!pool) {
      return res.status(500).json({ error: 'Database connection not available' });
    }

    const client = await pool.connect();

    try {
      const parkSlopeLabels = ['Club - Park Slope', 'Club - Park Slope Support'];
      const labelPatterns = parkSlopeLabels.map(label => `%${label}%`);

      // Revenue by job
      const byJobQuery = `
        WITH club_services AS (
          SELECT s.service_id, s.name
          FROM services s
          WHERE EXISTS (
            SELECT 1
            FROM jsonb_array_elements_text(COALESCE(s.labels, '[]'::jsonb)) AS lbl(value)
            WHERE lbl.value ILIKE ANY($1::text[])
          )
        )
        SELECT
          cs.service_id,
          cs.name,
          COALESCE(SUM(ar.charge_rate) FILTER (WHERE a.status IN ('complete','completed','cancelled-chargeable') AND (ar.status IS NULL OR ar.status <> 'missed')), 0) as revenue
        FROM club_services cs
        LEFT JOIN appointments a ON cs.service_id = a.service_id AND a.is_deleted IS NOT TRUE
        LEFT JOIN appointment_recipients ar ON a.appointment_id = ar.appointment_id
        GROUP BY cs.service_id, cs.name
        HAVING COALESCE(SUM(ar.charge_rate) FILTER (WHERE a.status IN ('complete','completed','cancelled-chargeable') AND (ar.status IS NULL OR ar.status <> 'missed')), 0) > 0
        ORDER BY revenue DESC
      `;

      // Revenue by month
      const byMonthQuery = `
        WITH club_services AS (
          SELECT s.service_id
          FROM services s
          WHERE EXISTS (
            SELECT 1
            FROM jsonb_array_elements_text(COALESCE(s.labels, '[]'::jsonb)) AS lbl(value)
            WHERE lbl.value ILIKE ANY($1::text[])
          )
        )
        SELECT
          TO_CHAR(a.start, 'YYYY-MM') as month,
          COALESCE(SUM(ar.charge_rate) FILTER (WHERE ar.status IS NULL OR ar.status <> 'missed'), 0) as revenue
        FROM appointments a
        JOIN club_services cs ON a.service_id = cs.service_id
        LEFT JOIN appointment_recipients ar ON a.appointment_id = ar.appointment_id
        WHERE a.is_deleted IS NOT TRUE
          AND a.status IN ('complete','completed','cancelled-chargeable')
        GROUP BY TO_CHAR(a.start, 'YYYY-MM')
        ORDER BY month DESC
        LIMIT 24
      `;

      const [byJobResult, byMonthResult] = await Promise.all([
        client.query(byJobQuery, [labelPatterns]),
        client.query(byMonthQuery, [labelPatterns])
      ]);

      const byJob = byJobResult.rows.map(row => ({
        serviceId: row.service_id,
        name: row.name,
        revenue: parseFloat(row.revenue || 0),
      }));

      const byMonth = byMonthResult.rows.map(row => ({
        month: row.month,
        revenue: parseFloat(row.revenue || 0),
      }));

      const total = byJob.reduce((sum, job) => sum + job.revenue, 0);

      res.json({ byJob, byMonth, total });
    } finally {
      client.release();
    }
  } catch (error) {
    logger.error({ err: error }, 'Error fetching clubs revenue detail');
    res.status(500).json({ error: 'Failed to fetch clubs revenue detail' });
  }
}));

// GET /api/clubs/hours-detail - Get hours breakdown by tutor for Park Slope clubs
router.get('/hours-detail', asyncHandler(async (req, res) => {
  try {
    const pool = getLocationPool(req);
    if (!pool) {
      return res.status(500).json({ error: 'Database connection not available' });
    }

    const client = await pool.connect();

    try {
      const parkSlopeLabels = ['Club - Park Slope', 'Club - Park Slope Support'];
      const labelPatterns = parkSlopeLabels.map(label => `%${label}%`);

      const query = `
        WITH club_services AS (
          SELECT s.service_id
          FROM services s
          WHERE EXISTS (
            SELECT 1
            FROM jsonb_array_elements_text(COALESCE(s.labels, '[]'::jsonb)) AS lbl(value)
            WHERE lbl.value ILIKE ANY($1::text[])
          )
        )
        SELECT
          c.contractor_id,
          c.first_name || ' ' || c.last_name as tutor_name,
          COUNT(DISTINCT a.appointment_id) as lesson_count,
          COALESCE(SUM(a.units), 0) as hours,
          COALESCE(SUM(ac.pay_rate * a.units), 0) as total_pay,
          COALESCE(SUM(ar_agg.charge_total), 0) as revenue_generated
        FROM appointment_contractors ac
        JOIN appointments a ON ac.appointment_id = a.appointment_id
        JOIN club_services cs ON a.service_id = cs.service_id
        JOIN contractors c ON ac.contractor_id = c.contractor_id
        LEFT JOIN (
          SELECT appointment_id, SUM(charge_rate) as charge_total
          FROM appointment_recipients
          WHERE status IS NULL OR status <> 'missed'
          GROUP BY appointment_id
        ) ar_agg ON a.appointment_id = ar_agg.appointment_id
        WHERE a.status IN ('complete', 'completed', 'cancelled-chargeable')
          AND a.is_deleted IS NOT TRUE
        GROUP BY c.contractor_id, c.first_name, c.last_name
        ORDER BY hours DESC
      `;

      const { rows } = await client.query(query, [labelPatterns]);

      const byTutor = rows.map(row => ({
        contractorId: row.contractor_id,
        name: row.tutor_name,
        lessonCount: parseInt(row.lesson_count || 0),
        hours: parseFloat(row.hours || 0),
        totalPay: parseFloat(row.total_pay || 0),
        revenueGenerated: parseFloat(row.revenue_generated || 0),
      }));

      const total = byTutor.reduce((sum, tutor) => sum + tutor.hours, 0);

      res.json({ byTutor, total });
    } finally {
      client.release();
    }
  } catch (error) {
    logger.error({ err: error }, 'Error fetching clubs hours detail');
    res.status(500).json({ error: 'Failed to fetch clubs hours detail' });
  }
}));

// GET /api/clubs/analytics - Get weekly analytics metrics for Park Slope club
router.get('/analytics', asyncHandler(async (req, res) => {
  try {
    const pool = getLocationPool(req);
    if (!pool) {
      return res.status(500).json({ error: 'Database connection not available' });
    }

    const { startDate, endDate } = req.query;

    if (!startDate || !endDate) {
      return res.status(400).json({ error: 'startDate and endDate are required' });
    }

    const client = await pool.connect();

    try {
      const parkSlopeLabels = ['Club - Park Slope', 'Club - Park Slope Support'];
      const labelPatterns = parkSlopeLabels.map(label => `%${label}%`);

      // 1. PS Total Students - Active students in completed club lessons within date range
      const totalStudentsQuery = `
        SELECT COUNT(DISTINCT ar.recipient_id) as total_students
        FROM appointment_recipients ar
        JOIN appointments a ON a.appointment_id = ar.appointment_id
        JOIN services s ON a.service_id = s.service_id
        WHERE a.status IN ('complete', 'cancelled-chargeable')
          AND a.is_deleted IS NOT TRUE
          AND DATE(a.start AT TIME ZONE 'America/New_York') >= $2::date
          AND DATE(a.start AT TIME ZONE 'America/New_York') <= $3::date
          AND ar.status <> 'missed'
          AND EXISTS (
            SELECT 1 FROM jsonb_array_elements_text(COALESCE(s.labels, '[]'::jsonb)) AS lbl(value)
            WHERE lbl.value ILIKE ANY($1::text[])
          )
      `;

      // 2. PS Camp Kids - Students in services with 'camp' in name
      const campStudentsQuery = `
        SELECT COUNT(DISTINCT ar.recipient_id) as camp_students
        FROM appointment_recipients ar
        JOIN appointments a ON a.appointment_id = ar.appointment_id
        JOIN services s ON a.service_id = s.service_id
        WHERE a.status IN ('complete', 'cancelled-chargeable')
          AND a.is_deleted IS NOT TRUE
          AND DATE(a.start AT TIME ZONE 'America/New_York') >= $2::date
          AND DATE(a.start AT TIME ZONE 'America/New_York') <= $3::date
          AND (s.name ILIKE '%camp%' OR s.labels @> '"Camp"'::jsonb)
          AND ar.status <> 'missed'
          AND EXISTS (
            SELECT 1 FROM jsonb_array_elements_text(COALESCE(s.labels, '[]'::jsonb)) AS lbl(value)
            WHERE lbl.value ILIKE ANY($1::text[])
          )
      `;

      // 3. PS Classes - Count of non-camp class sessions
      const classesQuery = `
        SELECT COUNT(DISTINCT a.appointment_id) as class_count
        FROM appointments a
        JOIN services s ON a.service_id = s.service_id
        WHERE a.status IN ('complete', 'cancelled-chargeable')
          AND a.is_deleted IS NOT TRUE
          AND DATE(a.start AT TIME ZONE 'America/New_York') >= $2::date
          AND DATE(a.start AT TIME ZONE 'America/New_York') <= $3::date
          AND NOT (s.name ILIKE '%camp%' OR s.labels @> '"Camp"'::jsonb)
          AND NOT (s.name ILIKE '%support%' OR s.labels @> '"Support"'::jsonb)
          AND EXISTS (
            SELECT 1 FROM jsonb_array_elements_text(COALESCE(s.labels, '[]'::jsonb)) AS lbl(value)
            WHERE lbl.value ILIKE ANY($1::text[])
          )
      `;

      // 4. PS Classes Operate Loss - Classes where revenue < tutor pay
      const classesLossQuery = `
        WITH class_financials AS (
          SELECT
            a.appointment_id,
            COALESCE(SUM(ar.charge_rate) FILTER (WHERE ar.status IS NULL OR ar.status <> 'missed'), 0) as revenue,
            COALESCE(SUM(
              CASE
                WHEN s.dft_charge_type IN ('hourly', 'hourly-split') THEN ac.pay_rate * COALESCE(a.units, 1)
                ELSE ac.pay_rate
              END
            ), 0) + (
              COUNT(ar.recipient_id) FILTER (WHERE ar.status IS NULL OR ar.status <> 'missed') * COALESCE(s.sr_premium, 0) * COALESCE(a.units, 1)
            ) as tutor_pay
          FROM appointments a
          JOIN services s ON a.service_id = s.service_id
          LEFT JOIN appointment_recipients ar ON a.appointment_id = ar.appointment_id
          LEFT JOIN appointment_contractors ac ON a.appointment_id = ac.appointment_id
          WHERE a.status IN ('complete', 'cancelled-chargeable')
            AND a.is_deleted IS NOT TRUE
            AND DATE(a.start AT TIME ZONE 'America/New_York') >= $2::date
            AND DATE(a.start AT TIME ZONE 'America/New_York') <= $3::date
            AND NOT (s.name ILIKE '%camp%' OR s.labels @> '"Camp"'::jsonb)
            AND NOT (s.name ILIKE '%support%' OR s.labels @> '"Support"'::jsonb)
            AND EXISTS (
              SELECT 1 FROM jsonb_array_elements_text(COALESCE(s.labels, '[]'::jsonb)) AS lbl(value)
              WHERE lbl.value ILIKE ANY($1::text[])
            )
          GROUP BY a.appointment_id, s.dft_charge_type, s.sr_premium, a.units
        )
        SELECT COUNT(*) as loss_count
        FROM class_financials
        WHERE revenue < tutor_pay
      `;

      // 5. PS Trials - Club trial bookings from booking_submissions
      const trialsQuery = `
        SELECT COUNT(*) as trial_count
        FROM booking_submissions bs
        LEFT JOIN booking_types bt ON bs.booking_type = bt.name
        WHERE (bt.is_trial = true OR bs.actual_price = ${TRIAL_PRICE} OR bs.booking_type ILIKE '%trial%')
          AND bs.payment_status IN ('paid', 'verified')
          AND DATE(bs.created_at AT TIME ZONE 'America/New_York') >= $1::date
          AND DATE(bs.created_at AT TIME ZONE 'America/New_York') <= $2::date
          AND (bs.label_name ILIKE '%Park Slope%' OR COALESCE(bs.lesson_type, bs.booking_type, '') ILIKE '%club%')
      `;

      // 6. Events - From event_leads table
      const eventsQuery = `
        SELECT COUNT(*) as event_count
        FROM event_leads
        WHERE DATE(created_at AT TIME ZONE 'America/New_York') >= $1::date
          AND DATE(created_at AT TIME ZONE 'America/New_York') <= $2::date
      `;

      // 7. PS Class Pack Bought - From proforma_invoices
      const classPackQuery = `
        SELECT COUNT(DISTINCT pi.client_id) as pack_count
        FROM proforma_invoices pi
        WHERE pi.status = 'paid'
          AND DATE(pi.date_paid AT TIME ZONE 'America/New_York') >= $1::date
          AND DATE(pi.date_paid AT TIME ZONE 'America/New_York') <= $2::date
          AND pi.amount > 15
          AND (
            pi.description ILIKE '%park slope%'
            OR pi.description ILIKE '%club%class%'
            OR pi.description ILIKE '%class%pack%club%'
            OR pi.description ILIKE '%club%credit%'
            OR pi.description ILIKE '%club%bundle%'
          )
      `;

      // 8. PS Leads - New leads from booking_submissions with Park Slope
      const leadsQuery = `
        SELECT COUNT(*) as lead_count
        FROM booking_submissions bs
        WHERE bs.payment_status IN ('paid', 'verified')
          AND DATE(bs.created_at AT TIME ZONE 'America/New_York') >= $1::date
          AND DATE(bs.created_at AT TIME ZONE 'America/New_York') <= $2::date
          AND (bs.label_name ILIKE '%Park Slope%' OR COALESCE(bs.lesson_type, bs.booking_type, '') ILIKE '%club%')
      `;

      // 9. Summer Camp Registration - Booking submissions for camp services
      const summerCampQuery = `
        SELECT COUNT(*) as camp_reg_count
        FROM booking_submissions bs
        WHERE bs.payment_status IN ('paid', 'verified')
          AND DATE(bs.created_at AT TIME ZONE 'America/New_York') >= $1::date
          AND DATE(bs.created_at AT TIME ZONE 'America/New_York') <= $2::date
          AND (
            bs.booking_type ILIKE '%camp%'
            OR bs.lesson_type ILIKE '%camp%'
            OR bs.label_name ILIKE '%camp%'
          )
          AND (bs.label_name ILIKE '%Park Slope%' OR COALESCE(bs.lesson_type, bs.booking_type, '') ILIKE '%club%' OR bs.label_name ILIKE '%camp%')
      `;

      // Execute all queries in parallel
      const [
        totalStudentsResult,
        campStudentsResult,
        classesResult,
        classesLossResult,
        trialsResult,
        eventsResult,
        classPackResult,
        leadsResult,
        summerCampResult
      ] = await Promise.all([
        client.query(totalStudentsQuery, [labelPatterns, startDate, endDate]),
        client.query(campStudentsQuery, [labelPatterns, startDate, endDate]),
        client.query(classesQuery, [labelPatterns, startDate, endDate]),
        client.query(classesLossQuery, [labelPatterns, startDate, endDate]),
        client.query(trialsQuery, [startDate, endDate]),
        client.query(eventsQuery, [startDate, endDate]),
        client.query(classPackQuery, [startDate, endDate]),
        client.query(leadsQuery, [startDate, endDate]),
        client.query(summerCampQuery, [startDate, endDate])
      ]);

      const totalStudents = parseInt(totalStudentsResult.rows[0]?.total_students || 0);
      const campStudents = parseInt(campStudentsResult.rows[0]?.camp_students || 0);
      const classStudents = totalStudents - campStudents;

      res.json({
        metrics: {
          psTotalStudents: totalStudents,
          psCampKids: campStudents,
          psClassKids: classStudents,
          psClasses: parseInt(classesResult.rows[0]?.class_count || 0),
          psClassesOperateLoss: parseInt(classesLossResult.rows[0]?.loss_count || 0),
          psTrials: parseInt(trialsResult.rows[0]?.trial_count || 0),
          events: parseInt(eventsResult.rows[0]?.event_count || 0),
          psClassPackBought: parseInt(classPackResult.rows[0]?.pack_count || 0),
          psLeads: parseInt(leadsResult.rows[0]?.lead_count || 0),
          summerCampRegistration: parseInt(summerCampResult.rows[0]?.camp_reg_count || 0),
          totalSummerCampRegistrations: parseInt(summerCampResult.rows[0]?.camp_reg_count || 0)
        },
        dateRange: {
          startDate,
          endDate
        }
      });
    } finally {
      client.release();
    }
  } catch (error) {
    logger.error({ err: error }, 'Error fetching clubs analytics');
    res.status(500).json({
      error: 'Failed to fetch clubs analytics data',
      details: error.message
    });
  }
}));

// GET /api/clubs/analytics/drilldown/:metric - Get detailed breakdown for a specific metric
router.get('/analytics/drilldown/:metric', asyncHandler(async (req, res) => {
  try {
    const pool = getLocationPool(req);
    if (!pool) {
      return res.status(500).json({ error: 'Database connection not available' });
    }

    const { metric } = req.params;
    const { startDate, endDate } = req.query;

    if (!startDate || !endDate) {
      return res.status(400).json({ error: 'startDate and endDate are required' });
    }

    const client = await pool.connect();

    try {
      const parkSlopeLabels = ['Club - Park Slope', 'Club - Park Slope Support'];
      const labelPatterns = parkSlopeLabels.map(label => `%${label}%`);

      let query;
      let params;
      let title;

      switch (metric) {
        case 'psTotalStudents':
          title = 'Total Students';
          query = `
            SELECT DISTINCT
              ar.recipient_id,
              r.first_name,
              r.last_name,
              r.email,
              COUNT(DISTINCT a.appointment_id) as lesson_count
            FROM appointment_recipients ar
            JOIN appointments a ON a.appointment_id = ar.appointment_id
            JOIN services s ON a.service_id = s.service_id
            LEFT JOIN recipients r ON ar.recipient_id::text = r.recipient_id::text
            WHERE a.status IN ('complete', 'cancelled-chargeable')
              AND a.is_deleted IS NOT TRUE
              AND DATE(a.start AT TIME ZONE 'America/New_York') >= $2::date
              AND DATE(a.start AT TIME ZONE 'America/New_York') <= $3::date
              AND ar.status <> 'missed'
              AND EXISTS (
                SELECT 1 FROM jsonb_array_elements_text(COALESCE(s.labels, '[]'::jsonb)) AS lbl(value)
                WHERE lbl.value ILIKE ANY($1::text[])
              )
            GROUP BY ar.recipient_id, r.first_name, r.last_name, r.email
            ORDER BY r.last_name, r.first_name
          `;
          params = [labelPatterns, startDate, endDate];
          break;

        case 'psCampKids':
          title = 'Camp Kids';
          query = `
            SELECT DISTINCT
              ar.recipient_id,
              r.first_name,
              r.last_name,
              r.email,
              s.name as service_name,
              COUNT(DISTINCT a.appointment_id) as lesson_count
            FROM appointment_recipients ar
            JOIN appointments a ON a.appointment_id = ar.appointment_id
            JOIN services s ON a.service_id = s.service_id
            LEFT JOIN recipients r ON ar.recipient_id::text = r.recipient_id::text
            WHERE a.status IN ('complete', 'cancelled-chargeable')
              AND a.is_deleted IS NOT TRUE
              AND DATE(a.start AT TIME ZONE 'America/New_York') >= $2::date
              AND DATE(a.start AT TIME ZONE 'America/New_York') <= $3::date
              AND (s.name ILIKE '%camp%' OR s.labels @> '"Camp"'::jsonb)
              AND ar.status <> 'missed'
              AND EXISTS (
                SELECT 1 FROM jsonb_array_elements_text(COALESCE(s.labels, '[]'::jsonb)) AS lbl(value)
                WHERE lbl.value ILIKE ANY($1::text[])
              )
            GROUP BY ar.recipient_id, r.first_name, r.last_name, r.email, s.name
            ORDER BY r.last_name, r.first_name
          `;
          params = [labelPatterns, startDate, endDate];
          break;

        case 'psClassKids':
          title = 'Class Kids (Non-Camp)';
          query = `
            SELECT DISTINCT
              ar.recipient_id,
              r.first_name,
              r.last_name,
              r.email,
              s.name as service_name,
              COUNT(DISTINCT a.appointment_id) as lesson_count
            FROM appointment_recipients ar
            JOIN appointments a ON a.appointment_id = ar.appointment_id
            JOIN services s ON a.service_id = s.service_id
            LEFT JOIN recipients r ON ar.recipient_id::text = r.recipient_id::text
            WHERE a.status IN ('complete', 'cancelled-chargeable')
              AND a.is_deleted IS NOT TRUE
              AND DATE(a.start AT TIME ZONE 'America/New_York') >= $2::date
              AND DATE(a.start AT TIME ZONE 'America/New_York') <= $3::date
              AND NOT (s.name ILIKE '%camp%' OR s.labels @> '"Camp"'::jsonb)
              AND ar.status <> 'missed'
              AND EXISTS (
                SELECT 1 FROM jsonb_array_elements_text(COALESCE(s.labels, '[]'::jsonb)) AS lbl(value)
                WHERE lbl.value ILIKE ANY($1::text[])
              )
            GROUP BY ar.recipient_id, r.first_name, r.last_name, r.email, s.name
            ORDER BY r.last_name, r.first_name
          `;
          params = [labelPatterns, startDate, endDate];
          break;

        case 'psClasses':
          title = 'Classes Run';
          query = `
            SELECT
              a.appointment_id,
              s.name as service_name,
              a.start,
              COUNT(DISTINCT ar.recipient_id) FILTER (WHERE ar.status <> 'missed') as student_count,
              con.first_name as tutor_first,
              con.last_name as tutor_last
            FROM appointments a
            JOIN services s ON a.service_id = s.service_id
            LEFT JOIN appointment_recipients ar ON a.appointment_id = ar.appointment_id
            LEFT JOIN appointment_contractors ac ON a.appointment_id = ac.appointment_id
            LEFT JOIN contractors con ON ac.contractor_id = con.contractor_id
            WHERE a.status IN ('complete', 'cancelled-chargeable')
              AND a.is_deleted IS NOT TRUE
              AND DATE(a.start AT TIME ZONE 'America/New_York') >= $2::date
              AND DATE(a.start AT TIME ZONE 'America/New_York') <= $3::date
              AND NOT (s.name ILIKE '%camp%' OR s.labels @> '"Camp"'::jsonb)
              AND NOT (s.name ILIKE '%support%' OR s.labels @> '"Support"'::jsonb)
              AND EXISTS (
                SELECT 1 FROM jsonb_array_elements_text(COALESCE(s.labels, '[]'::jsonb)) AS lbl(value)
                WHERE lbl.value ILIKE ANY($1::text[])
              )
            GROUP BY a.appointment_id, s.name, a.start, con.first_name, con.last_name
            ORDER BY a.start DESC
          `;
          params = [labelPatterns, startDate, endDate];
          break;

        case 'psClassesOperateLoss':
          title = 'Classes Operating at Loss';
          query = `
            WITH class_financials AS (
              SELECT
                a.appointment_id,
                s.name as service_name,
                a.start,
                COALESCE(SUM(ar.charge_rate) FILTER (WHERE ar.status IS NULL OR ar.status <> 'missed'), 0) as revenue,
                COALESCE(SUM(
                  CASE
                    WHEN s.dft_charge_type IN ('hourly', 'hourly-split') THEN ac.pay_rate * COALESCE(a.units, 1)
                    ELSE ac.pay_rate
                  END
                ), 0) + (
                  COUNT(ar.recipient_id) FILTER (WHERE ar.status IS NULL OR ar.status <> 'missed') * COALESCE(s.sr_premium, 0) * COALESCE(a.units, 1)
                ) as tutor_pay,
                COUNT(DISTINCT ar.recipient_id) FILTER (WHERE ar.status IS NULL OR ar.status <> 'missed') as student_count
              FROM appointments a
              JOIN services s ON a.service_id = s.service_id
              LEFT JOIN appointment_recipients ar ON a.appointment_id = ar.appointment_id
              LEFT JOIN appointment_contractors ac ON a.appointment_id = ac.appointment_id
              WHERE a.status IN ('complete', 'cancelled-chargeable')
                AND a.is_deleted IS NOT TRUE
                AND DATE(a.start AT TIME ZONE 'America/New_York') >= $2::date
                AND DATE(a.start AT TIME ZONE 'America/New_York') <= $3::date
                AND NOT (s.name ILIKE '%camp%' OR s.labels @> '"Camp"'::jsonb)
                AND NOT (s.name ILIKE '%support%' OR s.labels @> '"Support"'::jsonb)
                AND EXISTS (
                  SELECT 1 FROM jsonb_array_elements_text(COALESCE(s.labels, '[]'::jsonb)) AS lbl(value)
                  WHERE lbl.value ILIKE ANY($1::text[])
                )
              GROUP BY a.appointment_id, s.name, a.start, s.dft_charge_type, s.sr_premium, a.units
            )
            SELECT appointment_id, service_name, start, revenue, tutor_pay, student_count,
                   (tutor_pay - revenue) as loss_amount
            FROM class_financials
            WHERE revenue < tutor_pay
            ORDER BY start DESC
          `;
          params = [labelPatterns, startDate, endDate];
          break;

        case 'psTrials':
          title = 'Trials';
          query = `
            SELECT
              bs.id,
              bs.parent_first,
              bs.parent_last,
              bs.parent_email,
              bs.booking_type,
              bs.label_name,
              bs.actual_price,
              bs.created_at
            FROM booking_submissions bs
            LEFT JOIN booking_types bt ON bs.booking_type = bt.name
            WHERE (bt.is_trial = true OR bs.actual_price = ${TRIAL_PRICE} OR bs.booking_type ILIKE '%trial%')
              AND bs.payment_status IN ('paid', 'verified')
              AND DATE(bs.created_at AT TIME ZONE 'America/New_York') >= $1::date
              AND DATE(bs.created_at AT TIME ZONE 'America/New_York') <= $2::date
              AND (bs.label_name ILIKE '%Park Slope%' OR COALESCE(bs.lesson_type, bs.booking_type, '') ILIKE '%club%')
            ORDER BY bs.created_at DESC
          `;
          params = [startDate, endDate];
          break;

        case 'events':
          title = 'Events';
          query = `
            SELECT
              id,
              event_name,
              first_name,
              last_name,
              email,
              phone,
              notes,
              created_at
            FROM event_leads
            WHERE DATE(created_at AT TIME ZONE 'America/New_York') >= $1::date
              AND DATE(created_at AT TIME ZONE 'America/New_York') <= $2::date
            ORDER BY created_at DESC
          `;
          params = [startDate, endDate];
          break;

        case 'psClassPackBought':
          title = 'Class Packs Bought';
          query = `
            SELECT
              pi.id,
              pi.client_id,
              c.first_name,
              c.last_name,
              pi.description,
              pi.amount,
              pi.date_paid
            FROM proforma_invoices pi
            LEFT JOIN clients c ON pi.client_id::text = c.client_id
            WHERE pi.status = 'paid'
              AND DATE(pi.date_paid AT TIME ZONE 'America/New_York') >= $1::date
              AND DATE(pi.date_paid AT TIME ZONE 'America/New_York') <= $2::date
              AND pi.amount > 15
              AND (
                pi.description ILIKE '%park slope%'
                OR pi.description ILIKE '%club%class%'
                OR pi.description ILIKE '%class%pack%club%'
                OR pi.description ILIKE '%club%credit%'
                OR pi.description ILIKE '%club%bundle%'
              )
            ORDER BY pi.date_paid DESC
          `;
          params = [startDate, endDate];
          break;

        case 'psLeads':
          title = 'Leads';
          query = `
            SELECT
              bs.id,
              bs.parent_first,
              bs.parent_last,
              bs.parent_email,
              bs.booking_type,
              bs.label_name,
              bs.actual_price,
              bs.created_at
            FROM booking_submissions bs
            WHERE bs.payment_status IN ('paid', 'verified')
              AND DATE(bs.created_at AT TIME ZONE 'America/New_York') >= $1::date
              AND DATE(bs.created_at AT TIME ZONE 'America/New_York') <= $2::date
              AND (bs.label_name ILIKE '%Park Slope%' OR COALESCE(bs.lesson_type, bs.booking_type, '') ILIKE '%club%')
            ORDER BY bs.created_at DESC
          `;
          params = [startDate, endDate];
          break;

        case 'summerCampRegistration':
        case 'totalSummerCampRegistrations':
          title = 'Summer Camp Registrations';
          query = `
            SELECT
              bs.id,
              bs.parent_first,
              bs.parent_last,
              bs.parent_email,
              bs.booking_type,
              bs.label_name,
              bs.actual_price,
              bs.created_at
            FROM booking_submissions bs
            WHERE bs.payment_status IN ('paid', 'verified')
              AND DATE(bs.created_at AT TIME ZONE 'America/New_York') >= $1::date
              AND DATE(bs.created_at AT TIME ZONE 'America/New_York') <= $2::date
              AND (
                bs.booking_type ILIKE '%camp%'
                OR bs.lesson_type ILIKE '%camp%'
                OR bs.label_name ILIKE '%camp%'
              )
              AND (bs.label_name ILIKE '%Park Slope%' OR COALESCE(bs.lesson_type, bs.booking_type, '') ILIKE '%club%' OR bs.label_name ILIKE '%camp%')
            ORDER BY bs.created_at DESC
          `;
          params = [startDate, endDate];
          break;

        default:
          return res.status(400).json({ error: 'Invalid metric specified' });
      }

      const result = await client.query(query, params);

      res.json({
        metric,
        title,
        count: result.rows.length,
        data: result.rows,
        dateRange: { startDate, endDate }
      });

    } finally {
      client.release();
    }
  } catch (error) {
    logger.error({ err: error }, 'Error fetching analytics drilldown');
    res.status(500).json({
      error: 'Failed to fetch analytics drilldown',
      details: error.message
    });
  }
}));

// ============================================================
// Communications Endpoints
// ============================================================

// GET /api/clubs/:clubId/communications — Fetch communication log for a club
router.get('/:clubId/communications', asyncHandler(async (req, res) => {
  try {
    const pool = getLocationPool(req);
    const { clubId } = req.params;
    const { limit = 50, offset = 0, type } = req.query;

    let query = `
      SELECT cl.*,
        r.first_name || ' ' || r.last_name as student_name
      FROM club_communications_log cl
      LEFT JOIN recipients r ON cl.recipient_id = r.recipient_id::integer
      WHERE cl.club_id = $1
    `;
    const params = [clubId];
    let paramIdx = 2;

    if (type) {
      query += ` AND cl.communication_type = $${paramIdx}`;
      params.push(type);
      paramIdx++;
    }

    query += ` ORDER BY cl.created_at DESC LIMIT $${paramIdx} OFFSET $${paramIdx + 1}`;
    params.push(limit, offset);

    const [logsResult, countResult] = await Promise.all([
      pool.query(query, params),
      pool.query(
        `SELECT COUNT(*) FROM club_communications_log WHERE club_id = $1${type ? ` AND communication_type = $2` : ''}`,
        type ? [clubId, type] : [clubId]
      )
    ]);

    res.json({
      logs: logsResult.rows,
      total: parseInt(countResult.rows[0].count),
    });
  } catch (error) {
    logger.error({ err: error }, 'Failed to fetch communications log');
    res.status(500).json({ error: 'Failed to fetch communications' });
  }
}));

// GET /api/clubs/:clubId/automation-settings — Get automation settings
router.get('/:clubId/automation-settings', asyncHandler(async (req, res) => {
  try {
    const pool = getLocationPool(req);
    const { clubId } = req.params;

    const { rows } = await pool.query(
      'SELECT * FROM club_automation_settings WHERE club_id = $1',
      [clubId]
    );

    res.json({ settings: rows[0] || {
      club_id: parseInt(clubId),
      class_reminders_enabled: true,
      reminder_hours_before: 24,
      missed_class_followup_enabled: true,
      trial_followup_enabled: true,
      pack_depletion_enabled: true,
      pack_depletion_threshold: 2,
      win_back_enabled: false,
      win_back_days_inactive: 60,
    }});
  } catch (error) {
    logger.error({ err: error }, 'Failed to fetch automation settings');
    res.status(500).json({ error: 'Failed to fetch settings' });
  }
}));

// PUT /api/clubs/:clubId/automation-settings — Update automation settings
router.put('/:clubId/automation-settings', asyncHandler(async (req, res) => {
  try {
    const pool = getLocationPool(req);
    const { clubId } = req.params;
    const {
      class_reminders_enabled,
      reminder_hours_before,
      missed_class_followup_enabled,
      trial_followup_enabled,
      pack_depletion_enabled,
      pack_depletion_threshold,
      win_back_enabled,
      win_back_days_inactive,
    } = req.body;

    const { rows } = await pool.query(`
      INSERT INTO club_automation_settings (
        club_id, class_reminders_enabled, reminder_hours_before,
        missed_class_followup_enabled, trial_followup_enabled,
        pack_depletion_enabled, pack_depletion_threshold,
        win_back_enabled, win_back_days_inactive, updated_at
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, NOW())
      ON CONFLICT (club_id) DO UPDATE SET
        class_reminders_enabled = COALESCE($2, club_automation_settings.class_reminders_enabled),
        reminder_hours_before = COALESCE($3, club_automation_settings.reminder_hours_before),
        missed_class_followup_enabled = COALESCE($4, club_automation_settings.missed_class_followup_enabled),
        trial_followup_enabled = COALESCE($5, club_automation_settings.trial_followup_enabled),
        pack_depletion_enabled = COALESCE($6, club_automation_settings.pack_depletion_enabled),
        pack_depletion_threshold = COALESCE($7, club_automation_settings.pack_depletion_threshold),
        win_back_enabled = COALESCE($8, club_automation_settings.win_back_enabled),
        win_back_days_inactive = COALESCE($9, club_automation_settings.win_back_days_inactive),
        updated_at = NOW()
      RETURNING *
    `, [clubId, class_reminders_enabled, reminder_hours_before,
        missed_class_followup_enabled, trial_followup_enabled,
        pack_depletion_enabled, pack_depletion_threshold,
        win_back_enabled, win_back_days_inactive]);

    res.json({ settings: rows[0] });
  } catch (error) {
    logger.error({ err: error }, 'Failed to update automation settings');
    res.status(500).json({ error: 'Failed to update settings' });
  }
}));

// GET /api/clubs/:clubId/communications/stats — Communication stats for dashboard
router.get('/:clubId/communications/stats', asyncHandler(async (req, res) => {
  try {
    const pool = getLocationPool(req);
    const { clubId } = req.params;

    const { rows } = await pool.query(`
      SELECT
        communication_type,
        COUNT(*) as total,
        COUNT(*) FILTER (WHERE status = 'sent') as sent,
        COUNT(*) FILTER (WHERE status = 'failed') as failed,
        MAX(created_at) as last_sent
      FROM club_communications_log
      WHERE club_id = $1
        AND created_at > NOW() - INTERVAL '30 days'
      GROUP BY communication_type
      ORDER BY communication_type
    `, [clubId]);

    res.json({ stats: rows });
  } catch (error) {
    logger.error({ err: error }, 'Failed to fetch communication stats');
    res.status(500).json({ error: 'Failed to fetch stats' });
  }
}));

// ============================================================
// Check-In Endpoints
// ============================================================

// GET /api/clubs/:clubId/checkin/today - Get today's classes with student rosters for check-in
router.get('/:clubId/checkin/today', asyncHandler(async (req, res) => {
  const pool = getLocationPool(req);
  if (!pool) {
    return res.status(500).json({ error: 'Database connection not available' });
  }

  const { clubId } = req.params;

  // 1. Get the club's labels
  const { rows: clubRows } = await pool.query(
    'SELECT service_labels, support_labels FROM clubs WHERE id = $1',
    [clubId]
  );

  if (clubRows.length === 0) {
    return res.status(404).json({ error: 'Club not found' });
  }

  const club = clubRows[0];
  const clubLabels = [
    ...(Array.isArray(club.service_labels) ? club.service_labels : []),
    ...(Array.isArray(club.support_labels) ? club.support_labels : [])
  ];

  if (clubLabels.length === 0) {
    return res.json({ classes: [], summary: { totalClasses: 0, totalStudents: 0, checkedIn: 0, absent: 0 } });
  }

  const labelPatterns = clubLabels.map(label => `%${label}%`);

  // 2. Find today's appointments matching club labels
  const { rows: classes } = await pool.query(`
    SELECT
      a.appointment_id,
      a.start,
      a.finish,
      a.status,
      a.location,
      s.name as job_name,
      (
        SELECT string_agg(DISTINCT c.first_name || ' ' || c.last_name, ', ')
        FROM appointment_contractors ac
        JOIN contractors c ON ac.contractor_id = c.contractor_id
        WHERE ac.appointment_id = a.appointment_id
      ) as tutor_names,
      (
        SELECT json_agg(
          json_build_object(
            'recipientId', ar.recipient_id,
            'recipientName', ar.recipient_name,
            'payingClientName', ar.paying_client_name,
            'status', ar.status,
            'chargeRate', ar.charge_rate
          )
          ORDER BY ar.recipient_name
        )
        FROM appointment_recipients ar
        WHERE ar.appointment_id = a.appointment_id
      ) as students
    FROM appointments a
    JOIN services s ON a.service_id = s.service_id
    WHERE DATE(a.start AT TIME ZONE 'America/New_York') = DATE(NOW() AT TIME ZONE 'America/New_York')
      AND a.is_deleted IS NOT TRUE
      AND a.status <> 'cancelled'
      AND EXISTS (
        SELECT 1
        FROM jsonb_array_elements_text(COALESCE(s.labels, '[]'::jsonb)) AS lbl(value)
        WHERE lbl.value ILIKE ANY($1::text[])
      )
    ORDER BY a.start ASC
  `, [labelPatterns]);

  // 3. Build summary
  // In check-in context: null = unmarked, 'missed' = absent
  // For completed classes, null still means attended (legacy data)
  let totalStudents = 0;
  let checkedIn = 0;
  let absent = 0;

  for (const cls of classes) {
    const students = cls.students || [];
    totalStudents += students.length;
    const isCompleted = ['complete', 'completed'].includes(cls.status);
    for (const s of students) {
      if (s.status === 'missed') {
        absent++;
      } else if (isCompleted) {
        // Completed classes: null means attended
        checkedIn++;
      }
      // Upcoming/in-progress classes: null means unmarked (don't count)
    }
  }

  logger.info({ clubId, classCount: classes.length, totalStudents }, 'Check-in data fetched for today');

  // Map to camelCase for frontend
  const mappedClasses = classes.map(cls => ({
    appointmentId: cls.appointment_id,
    start: cls.start,
    finish: cls.finish,
    status: cls.status,
    location: cls.location,
    jobName: cls.job_name,
    tutorName: cls.tutor_names || 'No tutor',
    students: (cls.students || []).map(s => ({
      recipientId: s.recipientId,
      studentName: s.recipientName,
      parentName: s.payingClientName,
      // NULL in DB means "attended" for completed classes, "unmarked" for upcoming
      // 'missed' means explicitly absent
      status: s.status === 'missed' ? 'missed' : (s.status === null ? null : s.status),
      chargeRate: s.chargeRate
    }))
  }));

  res.json({
    classes: mappedClasses,
    summary: {
      totalClasses: classes.length,
      totalStudents,
      checkedIn,
      absent
    }
  });
}));

// PUT /api/clubs/:clubId/checkin/:appointmentId - Mark attendance for students
router.put('/:clubId/checkin/:appointmentId', asyncHandler(async (req, res) => {
  const pool = getLocationPool(req);
  if (!pool) {
    return res.status(500).json({ error: 'Database connection not available' });
  }

  const { clubId, appointmentId } = req.params;
  const { updates } = req.body;

  if (!Array.isArray(updates) || updates.length === 0) {
    return res.status(400).json({ error: 'updates array is required and must not be empty' });
  }

  // Validate each update
  for (const update of updates) {
    if (!update.recipientId || !['present', 'missed'].includes(update.status)) {
      return res.status(400).json({ error: 'Each update must have recipientId and status (present or missed)' });
    }
  }

  // Apply all updates
  const updatePromises = updates.map(update => {
    const dbStatus = update.status === 'present' ? null : 'missed';
    return pool.query(
      'UPDATE appointment_recipients SET status = $1 WHERE appointment_id = $2 AND recipient_id = $3',
      [dbStatus, appointmentId, update.recipientId]
    );
  });

  await Promise.all(updatePromises);

  // Return refreshed student list (mapped to camelCase for frontend)
  const { rows: rawStudents } = await pool.query(`
    SELECT
      ar.recipient_id,
      ar.recipient_name,
      ar.paying_client_name,
      ar.status,
      ar.charge_rate
    FROM appointment_recipients ar
    WHERE ar.appointment_id = $1
    ORDER BY ar.recipient_name
  `, [appointmentId]);

  const students = rawStudents.map(s => ({
    recipientId: s.recipient_id,
    studentName: s.recipient_name,
    parentName: s.paying_client_name,
    status: s.status === 'missed' ? 'missed' : 'present',
    chargeRate: s.charge_rate
  }));

  logger.info({ clubId, appointmentId, updateCount: updates.length }, 'Attendance updated');

  res.json({ students });
}));

// PUT /api/clubs/:clubId/checkin/:appointmentId/mark-all - Mark all students present or absent
router.put('/:clubId/checkin/:appointmentId/mark-all', asyncHandler(async (req, res) => {
  const pool = getLocationPool(req);
  if (!pool) {
    return res.status(500).json({ error: 'Database connection not available' });
  }

  const { clubId, appointmentId } = req.params;
  const { status } = req.body;

  if (!['present', 'missed'].includes(status)) {
    return res.status(400).json({ error: 'status must be "present" or "missed"' });
  }

  const dbStatus = status === 'present' ? null : 'missed';

  await pool.query(
    'UPDATE appointment_recipients SET status = $1 WHERE appointment_id = $2',
    [dbStatus, appointmentId]
  );

  // Return refreshed student list (mapped to camelCase for frontend)
  const { rows: rawStudents } = await pool.query(`
    SELECT
      ar.recipient_id,
      ar.recipient_name,
      ar.paying_client_name,
      ar.status,
      ar.charge_rate
    FROM appointment_recipients ar
    WHERE ar.appointment_id = $1
    ORDER BY ar.recipient_name
  `, [appointmentId]);

  const students = rawStudents.map(s => ({
    recipientId: s.recipient_id,
    studentName: s.recipient_name,
    parentName: s.paying_client_name,
    status: s.status === 'missed' ? 'missed' : 'present',
    chargeRate: s.charge_rate
  }));

  logger.info({ clubId, appointmentId, status, studentCount: students.length }, 'All students marked');

  res.json({ students });
}));

module.exports = router;










