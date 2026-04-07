/**
 * Report Drilldown Service
 * Provides drill-down data for Executive Reports metrics
 * Each metric type returns the underlying records for validation
 */

const { DateTime } = require('luxon');
const { TRIAL_PRICE } = require('../config/constants');

class ReportDrilldownService {
  constructor(pool) {
    this.pool = pool;
  }

  /**
   * Get drill-down data for a specific metric
   * @param {string} metric - The metric key (revenue, tutorPay, activeTutors, etc.)
   * @param {string} segment - The segment (home, online, schools, club)
   * @param {string} startDate - Start date (ISO string)
   * @param {string} endDate - End date (ISO string)
   */
  async getDrilldownData(metric, segment, startDate, endDate) {
    const startUTC = DateTime.fromISO(startDate).setZone('America/New_York').startOf('day').toUTC().toISO();
    const endUTC = DateTime.fromISO(endDate).setZone('America/New_York').endOf('day').toUTC().toISO();

    const methodMap = {
      revenue: () => this.getRevenueDrilldown(segment, startUTC, endUTC),
      tutorPay: () => this.getTutorPayDrilldown(segment, startUTC, endUTC),
      activeTutors: () => this.getActiveTutorsDrilldown(segment, startUTC, endUTC),
      activeStudents: () => this.getActiveStudentsDrilldown(segment, startUTC, endUTC),
      uniqueStudents: () => this.getActiveStudentsDrilldown(segment, startUTC, endUTC), // alias for Total Business Overview
      newLeads: () => this.getNewLeadsDrilldown(segment, startUTC, endUTC),
      trialLessons: () => this.getTrialLessonsDrilldown(segment, startUTC, endUTC),
      firstPaidLessons: () => this.getFirstPaidLessonsDrilldown(segment, startUTC, endUTC),
      thirdLessons: () => this.getThirdLessonsDrilldown(segment, startUTC, endUTC),
      activeSchools: () => this.getActiveSchoolsDrilldown(startUTC, endUTC),
      lessonsCompleted: () => this.getLessonsCompletedDrilldown(segment, startUTC, endUTC),
      campSessions: () => this.getCampSessionsDrilldown(startUTC, endUTC),
      campDays: () => this.getCampDaysDrilldown(startUTC, endUTC),
      campStudents: () => this.getCampStudentsDrilldown(startUTC, endUTC),
      classPackPurchases: () => this.getClassPackPurchasesDrilldown(startUTC, endUTC),
      // Total Business Overview metrics (aliases and special metrics)
      totalRevenue: () => this.getRevenueDrilldown(segment, startUTC, endUTC),
      totalTutorPay: () => this.getTutorPayDrilldown(segment, startUTC, endUTC),
      tutors10Plus: () => this.getTutorsByHoursDrilldown(segment, startUTC, endUTC, 10, null, 'weekly'),
      tutors40_60: () => this.getTutorsByHoursDrilldown(segment, startUTC, endUTC, 40, 60, 'monthly'),
      tutors60_80: () => this.getTutorsByHoursDrilldown(segment, startUTC, endUTC, 60, 80, 'monthly'),
      tutors80Plus: () => this.getTutorsByHoursDrilldown(segment, startUTC, endUTC, 80, null, 'monthly'),
      tutorsBonusTotal: () => this.getConsistencyBonusTutorsDrilldown(startUTC, endUTC)
    };

    if (!methodMap[metric]) {
      throw new Error(`Unknown metric: ${metric}`);
    }

    return methodMap[metric]();
  }

  /**
   * Get segment filter condition for SQL queries
   */
  getSegmentFilter(segment) {
    // Labels are location-specific (e.g. "Home - NYC", "Club - Park Slope")
    // Use text matching instead of exact jsonb @> containment
    const segmentMap = {
      home: "s.labels::text LIKE '%\"Home %'",
      online: "s.labels @> '\"Online\"'::jsonb",
      schools: "s.labels::text LIKE '%\"School%'",
      club: "s.labels::text LIKE '%\"Club %'",
      // 'total' combines home + online for Total Business Overview
      total: "(s.labels::text LIKE '%\"Home %' OR s.labels @> '\"Online\"'::jsonb)"
    };
    return segmentMap[segment] || "1=1";
  }

  /**
   * Revenue Drilldown - All completed lessons with revenue
   */
  async getRevenueDrilldown(segment, startUTC, endUTC) {
    const segmentFilter = this.getSegmentFilter(segment);
    const query = `
      SELECT
        a.appointment_id,
        a.start,
        s.name AS service_name,
        ROUND(SUM(
          CASE
            WHEN a.charge_type = 'hourly' THEN ar.charge_rate * a.units
            WHEN a.charge_type IN ('one-off', 'one-off-split') THEN ar.charge_rate
            ELSE ar.charge_rate * a.units
          END
        )::numeric, 2) AS revenue
      FROM appointments a
      JOIN services s ON a.service_id = s.service_id
      LEFT JOIN appointment_recipients ar ON a.appointment_id = ar.appointment_id AND ar.status <> 'missed'
      WHERE a.status IN ('complete', 'cancelled-chargeable')
        AND a.is_deleted IS NOT TRUE
        AND a.start >= $1::timestamptz AND a.start <= $2::timestamptz
        AND ${segmentFilter}
      GROUP BY a.appointment_id, a.start, s.name
      ORDER BY a.start DESC
    `;
    const { rows } = await this.pool.query(query, [startUTC, endUTC]);
    return {
      metric: 'revenue',
      segment,
      columns: [
        { key: 'start', label: 'Date', type: 'date' },
        { key: 'service_name', label: 'Service Name', type: 'text' },
        { key: 'revenue', label: 'Revenue', type: 'currency' },
        { key: 'appointment_id', label: 'TC Link', type: 'appointment_link' }
      ],
      data: rows.map(row => ({
        ...row,
        start: row.start,
        revenue: parseFloat(row.revenue || 0)
      }))
    };
  }

  /**
   * Tutor Pay Drilldown - All completed lessons with tutor pay including student premiums
   */
  async getTutorPayDrilldown(segment, startUTC, endUTC) {
    const segmentFilter = this.getSegmentFilter(segment);
    const query = `
      WITH base_pay AS (
        SELECT
          a.appointment_id,
          a.start,
          s.name AS service_name,
          s.sr_premium,
          a.units,
          c.contractor_id,
          c.first_name || ' ' || c.last_name AS tutor_name,
          ROUND(SUM(
            CASE
              WHEN a.charge_type = 'hourly' THEN ac.pay_rate * a.units
              WHEN a.charge_type IN ('one-off', 'one-off-split') THEN ac.pay_rate
              ELSE ac.pay_rate * a.units
            END
          )::numeric, 2) AS base_amount
        FROM appointments a
        JOIN services s ON a.service_id = s.service_id
        JOIN appointment_contractors ac ON a.appointment_id = ac.appointment_id
        JOIN contractors c ON c.contractor_id = ac.contractor_id
        WHERE a.status IN ('complete', 'cancelled-chargeable')
          AND a.is_deleted IS NOT TRUE
          AND a.start >= $1::timestamptz AND a.start <= $2::timestamptz
          AND ${segmentFilter}
        GROUP BY a.appointment_id, a.start, s.name, s.sr_premium, a.units, c.contractor_id, c.first_name, c.last_name
      ),
      student_counts AS (
        SELECT
          appointment_id,
          COUNT(*) AS student_count
        FROM appointment_recipients
        WHERE status <> 'missed'
        GROUP BY appointment_id
      )
      SELECT
        bp.appointment_id,
        bp.start,
        bp.service_name,
        bp.contractor_id,
        bp.tutor_name,
        ROUND((bp.base_amount + COALESCE(
          CASE
            WHEN bp.sr_premium IS NOT NULL AND bp.sr_premium > 0
            THEN COALESCE(sc.student_count, 0) * bp.sr_premium * bp.units
            ELSE 0
          END, 0
        ))::numeric, 2) AS pay_amount
      FROM base_pay bp
      LEFT JOIN student_counts sc ON sc.appointment_id = bp.appointment_id
      ORDER BY bp.start DESC
    `;
    const { rows } = await this.pool.query(query, [startUTC, endUTC]);
    return {
      metric: 'tutorPay',
      segment,
      columns: [
        { key: 'start', label: 'Date', type: 'date' },
        { key: 'service_name', label: 'Service Name', type: 'text' },
        { key: 'tutor_name', label: 'Tutor', type: 'contractor_link', idKey: 'contractor_id' },
        { key: 'pay_amount', label: 'Pay Amount', type: 'currency' },
        { key: 'appointment_id', label: 'TC Link', type: 'appointment_link' }
      ],
      data: rows.map(row => ({
        ...row,
        pay_amount: parseFloat(row.pay_amount || 0)
      }))
    };
  }

  /**
   * Active Tutors Drilldown - Tutors who taught lessons
   */
  async getActiveTutorsDrilldown(segment, startUTC, endUTC) {
    const segmentFilter = this.getSegmentFilter(segment);
    const query = `
      SELECT
        c.contractor_id,
        c.first_name || ' ' || c.last_name AS tutor_name,
        COUNT(DISTINCT a.appointment_id) AS lesson_count,
        ROUND(SUM(
          CASE
            WHEN (s.labels::text LIKE '%"School%' OR s.labels::text LIKE '%"Club %')
                 AND EXTRACT(EPOCH FROM (a.finish - a.start))/3600 < 1
            THEN 1.0
            ELSE EXTRACT(EPOCH FROM (a.finish - a.start))/3600
          END
        )::numeric, 2) AS total_hours
      FROM appointment_contractors ac
      JOIN contractors c ON c.contractor_id = ac.contractor_id
      JOIN appointments a ON a.appointment_id = ac.appointment_id
      JOIN services s ON a.service_id = s.service_id
      WHERE a.status IN ('complete', 'cancelled-chargeable')
        AND a.is_deleted IS NOT TRUE
        AND a.start >= $1::timestamptz AND a.start <= $2::timestamptz
        AND ${segmentFilter}
        AND s.labels::text NOT LIKE '%Non Teaching%' AND s.labels::text NOT LIKE '%Support%'
      GROUP BY c.contractor_id, c.first_name, c.last_name
      ORDER BY lesson_count DESC
    `;
    const { rows } = await this.pool.query(query, [startUTC, endUTC]);
    return {
      metric: 'activeTutors',
      segment,
      columns: [
        { key: 'tutor_name', label: 'Tutor Name', type: 'contractor_link', idKey: 'contractor_id' },
        { key: 'lesson_count', label: 'Lesson Count', type: 'number' },
        { key: 'total_hours', label: 'Total Hours', type: 'number' }
      ],
      data: rows.map(row => ({
        ...row,
        lesson_count: parseInt(row.lesson_count || 0),
        total_hours: parseFloat(row.total_hours || 0)
      }))
    };
  }

  /**
   * Active Students Drilldown - Students who attended lessons
   */
  async getActiveStudentsDrilldown(segment, startUTC, endUTC) {
    const segmentFilter = this.getSegmentFilter(segment);
    const query = `
      SELECT
        ar.recipient_id,
        COALESCE(sr.recipient_name, r.first_name || ' ' || r.last_name, 'Unknown Student') AS student_name,
        COUNT(DISTINCT a.appointment_id) AS lesson_count
      FROM appointment_recipients ar
      JOIN appointments a ON a.appointment_id = ar.appointment_id
      JOIN services s ON a.service_id = s.service_id
      LEFT JOIN service_recipients sr ON sr.recipient_id = ar.recipient_id AND sr.service_id = a.service_id
      LEFT JOIN recipients r ON r.recipient_id::text = ar.recipient_id::text
      WHERE a.status IN ('complete', 'cancelled-chargeable')
        AND a.is_deleted IS NOT TRUE
        AND a.start >= $1::timestamptz AND a.start <= $2::timestamptz
        AND ar.status <> 'missed'
        AND ${segmentFilter}
      GROUP BY ar.recipient_id, sr.recipient_name, r.first_name, r.last_name
      ORDER BY lesson_count DESC
    `;
    const { rows } = await this.pool.query(query, [startUTC, endUTC]);
    return {
      metric: 'activeStudents',
      segment,
      columns: [
        { key: 'student_name', label: 'Student Name', type: 'text' },
        { key: 'lesson_count', label: 'Lesson Count', type: 'number' }
      ],
      data: rows.map(row => ({
        ...row,
        lesson_count: parseInt(row.lesson_count || 0)
      }))
    };
  }

  /**
   * New Leads Drilldown - PAID trial bookings
   */
  async getNewLeadsDrilldown(segment, startUTC, endUTC) {
    // Handle 'total' segment (home + online combined)
    const isTotal = segment === 'total';

    let typeFilter;
    let params;

    if (isTotal) {
      // Total = home + online combined
      typeFilter = "(COALESCE(lesson_type, booking_type, '') ILIKE '%home%' OR COALESCE(lesson_type, booking_type, '') ILIKE '%online%')";
      params = [startUTC, endUTC];
    } else if (segment === 'club') {
      // Club uses ILIKE to match "Clubs - Park Slope Trial" etc.
      typeFilter = "COALESCE(lesson_type, booking_type, '') ILIKE '%club%'";
      params = [startUTC, endUTC];
    } else {
      // Home/Online use exact match on lesson_type
      const segmentMap = {
        home: 'home',
        online: 'online'
      };
      const lessonType = segmentMap[segment] || segment;
      typeFilter = "LOWER(COALESCE(lesson_type, booking_type, '')) = $3";
      params = [startUTC, endUTC, lessonType];
    }

    const query = `
      SELECT
        id,
        COALESCE(parent_first || ' ' || parent_last, parent_email) AS parent_name,
        COALESCE(students->0->>'first', '') || ' ' || COALESCE(students->0->>'last', '') AS student_name,
        created_at AS booking_date,
        tc_client_id,
        COALESCE(lesson_type, booking_type, '') AS lesson_type
      FROM booking_submissions
      WHERE (is_trial = true OR COALESCE(booking_type, '') ILIKE '%trial%')
        AND payment_status IN ('paid', 'verified')
        AND created_at >= $1::timestamptz AND created_at <= $2::timestamptz
        AND ${typeFilter}
      ORDER BY created_at DESC
    `;

    const { rows } = await this.pool.query(query, params);

    const columns = [
      { key: 'parent_name', label: 'Parent Name', type: 'text' },
      { key: 'student_name', label: 'Student Name', type: 'text' },
      { key: 'booking_date', label: 'Booking Date', type: 'date' },
      { key: 'tc_client_id', label: 'TC Link', type: 'client_link', idKey: 'tc_client_id' }
    ];

    // Add lesson type column for 'total' segment to show home vs online
    if (isTotal) {
      columns.splice(2, 0, { key: 'lesson_type', label: 'Type', type: 'text' });
    }

    return {
      metric: 'newLeads',
      segment,
      columns,
      data: rows
    };
  }

  /**
   * Trial Lessons Drilldown - Completed trial appointments
   */
  async getTrialLessonsDrilldown(segment, startUTC, endUTC) {
    const segmentFilter = this.getSegmentFilter(segment);
    const query = `
      SELECT DISTINCT
        a.appointment_id,
        a.start,
        s.name AS service_name,
        c.first_name || ' ' || c.last_name AS client_name,
        ar.paying_client_id AS client_id
      FROM appointments a
      JOIN services s ON a.service_id = s.service_id
      LEFT JOIN appointment_recipients ar ON ar.appointment_id = a.appointment_id AND ar.status <> 'missed'
      LEFT JOIN clients c ON c.client_id::text = ar.paying_client_id::text
      WHERE a.status = 'complete'
        AND a.is_deleted IS NOT TRUE
        AND a.start >= $1::timestamptz AND a.start <= $2::timestamptz
        AND ${segmentFilter}
        AND (
          a.topic ILIKE '%trial%'
          OR s.labels @> '"Trial"'::jsonb
          OR (ar.charge_rate > 0 AND ar.charge_rate <= ${TRIAL_PRICE})
        )
      ORDER BY a.start DESC
    `;
    const { rows } = await this.pool.query(query, [startUTC, endUTC]);
    return {
      metric: 'trialLessons',
      segment,
      columns: [
        { key: 'start', label: 'Date', type: 'date' },
        { key: 'service_name', label: 'Service Name', type: 'text' },
        { key: 'client_name', label: 'Client', type: 'client_link', idKey: 'client_id' },
        { key: 'appointment_id', label: 'TC Link', type: 'appointment_link' }
      ],
      data: rows
    };
  }

  /**
   * First Paid Lessons Drilldown - Clients' first NON-trial lesson
   * Counts distinct appointments (not student rows) per paying client
   */
  async getFirstPaidLessonsDrilldown(segment, startUTC, endUTC) {
    const segmentFilter = this.getSegmentFilter(segment);
    const query = `
      WITH distinct_client_appointments AS (
        -- Get distinct non-trial appointments per paying client
        SELECT DISTINCT
          ar.paying_client_id,
          a.appointment_id,
          a.start,
          s.name AS service_name
        FROM appointment_recipients ar
        JOIN appointments a ON a.appointment_id = ar.appointment_id
        JOIN services s ON a.service_id = s.service_id
        WHERE a.status = 'complete'
          AND a.is_deleted IS NOT TRUE
          AND ar.paying_client_id IS NOT NULL
          AND ar.status <> 'missed'
          AND ${segmentFilter}
          -- Exclude trial lessons
          AND NOT (
            COALESCE(a.topic, '') ILIKE '%trial%'
            OR s.labels @> '"Trial"'::jsonb
          )
      ),
      client_first_paid AS (
        SELECT
          dca.paying_client_id,
          c.first_name || ' ' || c.last_name AS client_name,
          dca.appointment_id,
          dca.start AS lesson_date,
          dca.service_name,
          ROW_NUMBER() OVER (PARTITION BY dca.paying_client_id ORDER BY dca.start, dca.appointment_id) AS rn
        FROM distinct_client_appointments dca
        LEFT JOIN clients c ON c.client_id::text = dca.paying_client_id::text
      )
      SELECT
        paying_client_id AS client_id,
        client_name,
        lesson_date,
        service_name,
        appointment_id
      FROM client_first_paid
      WHERE rn = 1
        AND lesson_date >= $1::timestamptz AND lesson_date <= $2::timestamptz
      ORDER BY lesson_date DESC
    `;
    const { rows } = await this.pool.query(query, [startUTC, endUTC]);
    return {
      metric: 'firstPaidLessons',
      segment,
      columns: [
        { key: 'client_name', label: 'Client Name', type: 'client_link', idKey: 'client_id' },
        { key: 'lesson_date', label: 'Lesson Date', type: 'date' },
        { key: 'service_name', label: 'Service Name', type: 'text' },
        { key: 'appointment_id', label: 'TC Link', type: 'appointment_link' }
      ],
      data: rows
    };
  }

  /**
   * Third Lessons Drilldown - Clients' 3rd NON-TRIAL lesson
   * Trial lessons are excluded from the count
   * Counts distinct appointments (not student rows) per paying client
   */
  async getThirdLessonsDrilldown(segment, startUTC, endUTC) {
    const segmentFilter = this.getSegmentFilter(segment);
    const query = `
      WITH distinct_client_appointments AS (
        -- Get distinct appointments per paying client (avoids counting siblings twice)
        SELECT DISTINCT
          ar.paying_client_id,
          a.appointment_id,
          a.start,
          s.name AS service_name
        FROM appointment_recipients ar
        JOIN appointments a ON a.appointment_id = ar.appointment_id
        JOIN services s ON a.service_id = s.service_id
        WHERE a.status = 'complete'
          AND a.is_deleted IS NOT TRUE
          AND ar.paying_client_id IS NOT NULL
          AND ar.status <> 'missed'
          AND ${segmentFilter}
          -- Exclude trial lessons: charged at trial price ($${TRIAL_PRICE} or less)
          -- Lessons named 'trial' but charged full price are NOT trials
          AND NOT (ar.charge_rate > 0 AND ar.charge_rate <= ${TRIAL_PRICE})
      ),
      client_lessons AS (
        SELECT
          dca.paying_client_id,
          c.first_name || ' ' || c.last_name AS client_name,
          dca.appointment_id,
          dca.start,
          dca.service_name,
          ROW_NUMBER() OVER (PARTITION BY dca.paying_client_id ORDER BY dca.start, dca.appointment_id) AS lesson_number
        FROM distinct_client_appointments dca
        LEFT JOIN clients c ON c.client_id::text = dca.paying_client_id::text
      )
      SELECT
        paying_client_id AS client_id,
        client_name,
        start AS lesson_date,
        service_name,
        appointment_id
      FROM client_lessons
      WHERE lesson_number = 3
        AND start >= $1::timestamptz AND start <= $2::timestamptz
      ORDER BY start DESC
    `;
    const { rows } = await this.pool.query(query, [startUTC, endUTC]);
    return {
      metric: 'thirdLessons',
      segment,
      columns: [
        { key: 'client_name', label: 'Client Name', type: 'client_link', idKey: 'client_id' },
        { key: 'lesson_date', label: 'Lesson Date', type: 'date' },
        { key: 'service_name', label: 'Service Name', type: 'text' },
        { key: 'appointment_id', label: 'TC Link', type: 'appointment_link' }
      ],
      data: rows
    };
  }

  /**
   * Active Schools Drilldown - Schools with lessons
   */
  async getActiveSchoolsDrilldown(startUTC, endUTC) {
    const query = `
      WITH school_data AS (
        SELECT
          SPLIT_PART(s.name, ' // ', 1) AS school_name,
          a.appointment_id,
          a.charge_type,
          a.units,
          ar.charge_rate,
          ar.paying_client_id
        FROM appointments a
        JOIN services s ON a.service_id = s.service_id
        LEFT JOIN appointment_recipients ar ON a.appointment_id = ar.appointment_id AND ar.status <> 'missed'
        WHERE a.status IN ('complete', 'cancelled-chargeable')
          AND a.is_deleted IS NOT TRUE
          AND a.start >= $1::timestamptz AND a.start <= $2::timestamptz
          AND s.labels::text LIKE '%"School%'
      )
      SELECT
        sd.school_name,
        COUNT(DISTINCT sd.appointment_id) AS lesson_count,
        ROUND(SUM(
          CASE
            WHEN sd.charge_type = 'hourly' THEN sd.charge_rate * sd.units
            WHEN sd.charge_type IN ('one-off', 'one-off-split') THEN sd.charge_rate
            ELSE sd.charge_rate * sd.units
          END
        )::numeric, 2) AS revenue,
        -- Get the paying client ID for linking to school-partners page
        -- Match client name to school name (same logic as entity-lists)
        (SELECT c.client_id
         FROM appointments a2
         JOIN appointment_recipients ar2 ON a2.appointment_id = ar2.appointment_id
         JOIN clients c ON ar2.paying_client_id::text = c.client_id::text
         JOIN services s2 ON a2.service_id = s2.service_id
         WHERE SPLIT_PART(s2.name, ' // ', 1) = sd.school_name
           AND (c.first_name || ' ' || COALESCE(c.last_name, '')) ILIKE '%' || sd.school_name || '%'
         LIMIT 1
        ) AS client_id
      FROM school_data sd
      GROUP BY sd.school_name
      ORDER BY lesson_count DESC
    `;
    const { rows } = await this.pool.query(query, [startUTC, endUTC]);
    return {
      metric: 'activeSchools',
      segment: 'schools',
      columns: [
        { key: 'school_name', label: 'School Name', type: 'text' },
        { key: 'lesson_count', label: 'Lesson Count', type: 'number' },
        { key: 'revenue', label: 'Revenue', type: 'currency' },
        { key: 'client_id', label: 'Dashboard', type: 'school_link' }
      ],
      data: rows.map(row => ({
        ...row,
        lesson_count: parseInt(row.lesson_count || 0),
        revenue: parseFloat(row.revenue || 0)
      }))
    };
  }

  /**
   * Lessons Completed Drilldown - All appointments for schools/clubs
   */
  async getLessonsCompletedDrilldown(segment, startUTC, endUTC) {
    const segmentFilter = this.getSegmentFilter(segment);
    const query = `
      SELECT
        a.appointment_id,
        a.start,
        s.name AS service_name,
        c.first_name || ' ' || c.last_name AS tutor_name,
        c.contractor_id
      FROM appointments a
      JOIN services s ON a.service_id = s.service_id
      LEFT JOIN appointment_contractors ac ON a.appointment_id = ac.appointment_id
      LEFT JOIN contractors c ON c.contractor_id = ac.contractor_id
      WHERE a.status IN ('complete', 'cancelled-chargeable')
        AND a.is_deleted IS NOT TRUE
        AND a.start >= $1::timestamptz AND a.start <= $2::timestamptz
        AND ${segmentFilter}
      ORDER BY a.start DESC
    `;
    const { rows } = await this.pool.query(query, [startUTC, endUTC]);
    return {
      metric: 'lessonsCompleted',
      segment,
      columns: [
        { key: 'start', label: 'Date', type: 'date' },
        { key: 'service_name', label: 'Service/School Name', type: 'text' },
        { key: 'tutor_name', label: 'Tutor', type: 'contractor_link', idKey: 'contractor_id' },
        { key: 'appointment_id', label: 'TC Link', type: 'appointment_link' }
      ],
      data: rows
    };
  }

  /**
   * Camp Sessions Drilldown - Camp appointments
   */
  async getCampSessionsDrilldown(startUTC, endUTC) {
    const query = `
      SELECT
        a.appointment_id,
        a.start,
        s.name AS service_name,
        ROUND(EXTRACT(EPOCH FROM (a.finish - a.start))/3600::numeric, 2) AS duration_hours
      FROM appointments a
      JOIN services s ON a.service_id = s.service_id
      WHERE a.status IN ('complete', 'cancelled-chargeable')
        AND a.is_deleted IS NOT TRUE
        AND a.start >= $1::timestamptz AND a.start <= $2::timestamptz
        AND (s.name ILIKE '%camp%' OR s.labels @> '"Camp"'::jsonb)
      ORDER BY a.start DESC
    `;
    const { rows } = await this.pool.query(query, [startUTC, endUTC]);
    return {
      metric: 'campSessions',
      segment: 'club',
      columns: [
        { key: 'start', label: 'Date', type: 'date' },
        { key: 'service_name', label: 'Service Name', type: 'text' },
        { key: 'duration_hours', label: 'Duration (hrs)', type: 'number' },
        { key: 'appointment_id', label: 'TC Link', type: 'appointment_link' }
      ],
      data: rows.map(row => ({
        ...row,
        duration_hours: parseFloat(row.duration_hours || 0)
      }))
    };
  }

  /**
   * Camp Days Drilldown - Camp appointments grouped by date
   */
  async getCampDaysDrilldown(startUTC, endUTC) {
    const query = `
      SELECT
        DATE(a.start AT TIME ZONE 'America/New_York') AS camp_date,
        COUNT(DISTINCT a.appointment_id) AS session_count,
        ARRAY_AGG(DISTINCT s.name) AS services
      FROM appointments a
      JOIN services s ON a.service_id = s.service_id
      WHERE a.status IN ('complete', 'cancelled-chargeable')
        AND a.is_deleted IS NOT TRUE
        AND a.start >= $1::timestamptz AND a.start <= $2::timestamptz
        AND (s.name ILIKE '%camp%' OR s.labels @> '"Camp"'::jsonb)
      GROUP BY DATE(a.start AT TIME ZONE 'America/New_York')
      ORDER BY camp_date DESC
    `;
    const { rows } = await this.pool.query(query, [startUTC, endUTC]);
    return {
      metric: 'campDays',
      segment: 'club',
      columns: [
        { key: 'camp_date', label: 'Date', type: 'date' },
        { key: 'session_count', label: 'Sessions', type: 'number' },
        { key: 'services', label: 'Services', type: 'array' }
      ],
      data: rows.map(row => ({
        ...row,
        session_count: parseInt(row.session_count || 0)
      }))
    };
  }

  /**
   * Camp Students Drilldown - Students grouped by attendance
   */
  async getCampStudentsDrilldown(startUTC, endUTC) {
    const query = `
      SELECT
        ar.recipient_id,
        COALESCE(sr.recipient_name, r.first_name || ' ' || r.last_name, 'Unknown Student') AS student_name,
        COUNT(DISTINCT a.appointment_id) AS session_count
      FROM appointment_recipients ar
      JOIN appointments a ON a.appointment_id = ar.appointment_id
      JOIN services s ON a.service_id = s.service_id
      LEFT JOIN service_recipients sr ON sr.recipient_id = ar.recipient_id AND sr.service_id = a.service_id
      LEFT JOIN recipients r ON r.recipient_id::text = ar.recipient_id::text
      WHERE a.status IN ('complete', 'cancelled-chargeable')
        AND a.is_deleted IS NOT TRUE
        AND a.start >= $1::timestamptz AND a.start <= $2::timestamptz
        AND (s.name ILIKE '%camp%' OR s.labels @> '"Camp"'::jsonb)
        AND ar.status <> 'missed'
      GROUP BY ar.recipient_id, sr.recipient_name, r.first_name, r.last_name
      ORDER BY session_count DESC
    `;
    const { rows } = await this.pool.query(query, [startUTC, endUTC]);
    return {
      metric: 'campStudents',
      segment: 'club',
      columns: [
        { key: 'student_name', label: 'Student Name', type: 'text' },
        { key: 'session_count', label: 'Sessions Attended', type: 'number' }
      ],
      data: rows.map(row => ({
        ...row,
        session_count: parseInt(row.session_count || 0)
      }))
    };
  }

  /**
   * Class Pack Purchases Drilldown - Club credit package purchases (proforma invoices)
   * Identifies club class packs by description patterns (Park Slope, club class pack, etc.)
   */
  async getClassPackPurchasesDrilldown(startUTC, endUTC) {
    const query = `
      SELECT
        pi.client_id,
        COALESCE(pi.client_first_name || ' ' || pi.client_last_name, pi.client_email) AS client_name,
        pi.description AS package_description,
        pi.amount AS invoice_amount,
        pi.date_paid AS payment_date,
        pi.id AS invoice_id
      FROM proforma_invoices pi
      WHERE pi.status = 'paid'
        AND pi.date_paid >= $1::timestamptz AND pi.date_paid <= $2::timestamptz
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
    const { rows } = await this.pool.query(query, [startUTC, endUTC]);
    return {
      metric: 'classPackPurchases',
      segment: 'club',
      columns: [
        { key: 'client_name', label: 'Client Name', type: 'client_link', idKey: 'client_id' },
        { key: 'package_description', label: 'Package', type: 'text' },
        { key: 'invoice_amount', label: 'Amount', type: 'currency' },
        { key: 'payment_date', label: 'Payment Date', type: 'date' },
        { key: 'invoice_id', label: 'Invoice', type: 'proforma_invoice_link' }
      ],
      data: rows.map(row => ({
        ...row,
        invoice_amount: parseFloat(row.invoice_amount || 0)
      }))
    };
  }

  /**
   * Tutors by Hours Drilldown - Tutors within a specific hour range
   * Used for: tutors10Plus (weekly), tutors40_60, tutors60_80, tutors80Plus (monthly)
   */
  async getTutorsByHoursDrilldown(segment, startUTC, endUTC, minHours, maxHours, reportType) {
    const segmentFilter = this.getSegmentFilter(segment);
    const query = `
      SELECT
        c.contractor_id,
        c.first_name || ' ' || c.last_name AS tutor_name,
        COUNT(DISTINCT a.appointment_id) AS lesson_count,
        ROUND(SUM(
          CASE
            WHEN (s.labels::text LIKE '%"School%' OR s.labels::text LIKE '%"Club %')
                 AND EXTRACT(EPOCH FROM (a.finish - a.start))/3600 < 1
            THEN 1.0
            ELSE EXTRACT(EPOCH FROM (a.finish - a.start))/3600
          END
        )::numeric, 2) AS total_hours
      FROM appointment_contractors ac
      JOIN contractors c ON c.contractor_id = ac.contractor_id
      JOIN appointments a ON a.appointment_id = ac.appointment_id
      JOIN services s ON a.service_id = s.service_id
      WHERE a.status IN ('complete', 'cancelled-chargeable')
        AND a.is_deleted IS NOT TRUE
        AND a.start >= $1::timestamptz AND a.start <= $2::timestamptz
        AND ${segmentFilter}
        AND s.labels::text NOT LIKE '%Non Teaching%' AND s.labels::text NOT LIKE '%Support%'
      GROUP BY c.contractor_id, c.first_name, c.last_name
      HAVING SUM(
        CASE
          WHEN (s.labels::text LIKE '%"School%' OR s.labels::text LIKE '%"Club %')
               AND EXTRACT(EPOCH FROM (a.finish - a.start))/3600 < 1
          THEN 1.0
          ELSE EXTRACT(EPOCH FROM (a.finish - a.start))/3600
        END
      ) >= $3
      ${maxHours ? `AND SUM(
        CASE
          WHEN (s.labels::text LIKE '%"School%' OR s.labels::text LIKE '%"Club %')
               AND EXTRACT(EPOCH FROM (a.finish - a.start))/3600 < 1
          THEN 1.0
          ELSE EXTRACT(EPOCH FROM (a.finish - a.start))/3600
        END
      ) < $4` : ''}
      ORDER BY total_hours DESC
    `;

    const params = maxHours
      ? [startUTC, endUTC, minHours, maxHours]
      : [startUTC, endUTC, minHours];

    const { rows } = await this.pool.query(query, params);

    const tierLabel = maxHours
      ? `${minHours}-${maxHours - 0.01} hours`
      : `${minHours}+ hours`;

    return {
      metric: maxHours ? `tutors${minHours}_${maxHours}` : `tutors${minHours}Plus`,
      segment,
      columns: [
        { key: 'tutor_name', label: 'Tutor Name', type: 'contractor_link', idKey: 'contractor_id' },
        { key: 'total_hours', label: `Hours (${tierLabel})`, type: 'number' },
        { key: 'lesson_count', label: 'Lesson Count', type: 'number' }
      ],
      data: rows.map(row => ({
        ...row,
        lesson_count: parseInt(row.lesson_count || 0),
        total_hours: parseFloat(row.total_hours || 0)
      }))
    };
  }

  /**
   * Consistency Bonus Tutors Drilldown - Tutors eligible for consistency bonus
   * Shows tutors at each tier (40-60, 60-80, 80+)
   */
  async getConsistencyBonusTutorsDrilldown(startUTC, endUTC) {
    const query = `
      WITH tutor_hours AS (
        SELECT
          c.contractor_id,
          c.first_name || ' ' || c.last_name AS tutor_name,
          ROUND(SUM(
            CASE
              WHEN (s.labels::text LIKE '%"School%' OR s.labels::text LIKE '%"Club %')
                   AND EXTRACT(EPOCH FROM (a.finish - a.start))/3600 < 1
              THEN 1.0
              ELSE EXTRACT(EPOCH FROM (a.finish - a.start))/3600
            END
          )::numeric, 2) AS total_hours
        FROM appointment_contractors ac
        JOIN contractors c ON c.contractor_id = ac.contractor_id
        JOIN appointments a ON a.appointment_id = ac.appointment_id
        JOIN services s ON a.service_id = s.service_id
        WHERE a.status IN ('complete', 'cancelled-chargeable')
          AND a.is_deleted IS NOT TRUE
          AND a.start >= $1::timestamptz AND a.start <= $2::timestamptz
          AND (s.labels::text LIKE '%"Home %' OR s.labels @> '"Online"'::jsonb)
          AND s.labels::text NOT LIKE '%Non Teaching%' AND s.labels::text NOT LIKE '%Support%'
        GROUP BY c.contractor_id, c.first_name, c.last_name
      )
      SELECT
        contractor_id,
        tutor_name,
        total_hours,
        CASE
          WHEN total_hours >= 80 THEN '80+ hours ($150)'
          WHEN total_hours >= 60 THEN '60-80 hours ($100)'
          WHEN total_hours >= 40 THEN '40-60 hours ($50)'
          ELSE 'Below threshold'
        END AS tier,
        CASE
          WHEN total_hours >= 80 THEN 150
          WHEN total_hours >= 60 THEN 100
          WHEN total_hours >= 40 THEN 50
          ELSE 0
        END AS bonus_amount
      FROM tutor_hours
      WHERE total_hours >= 40
      ORDER BY total_hours DESC
    `;

    const { rows } = await this.pool.query(query, [startUTC, endUTC]);

    return {
      metric: 'tutorsBonusTotal',
      segment: 'total',
      columns: [
        { key: 'tutor_name', label: 'Tutor Name', type: 'contractor_link', idKey: 'contractor_id' },
        { key: 'total_hours', label: 'Total Hours', type: 'number' },
        { key: 'tier', label: 'Bonus Tier', type: 'text' },
        { key: 'bonus_amount', label: 'Bonus Amount', type: 'currency' }
      ],
      data: rows.map(row => ({
        ...row,
        total_hours: parseFloat(row.total_hours || 0),
        bonus_amount: parseInt(row.bonus_amount || 0)
      }))
    };
  }
}

module.exports = ReportDrilldownService;
