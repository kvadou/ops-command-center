const express = require('express');
const router = express.Router();
const { toNY, parseUTC } = require('../utils/date');
const { asyncHandler } = require('../middleware/error-handler');
const { logger } = require('../utils/logger');

// ─── Helpers ─────────────────────────────────────────────────────────────────

function getDateRange(view, query) {
  if (query?.start && query?.end) {
    const s = toNY(parseUTC(query.start)).startOf('day');
    const e = toNY(parseUTC(query.end)).startOf('day');
    return { start: s.toUTC().toISO(), end: e.toUTC().toISO(), year: s.year };
  }
  const nowNY = toNY(parseUTC(new Date().toISOString()));
  switch (view) {
    case 'daily': {
      const start = nowNY.startOf('day');
      const end = nowNY.plus({ days: 1 }).startOf('day');
      return { start: start.toUTC().toISO(), end: end.toUTC().toISO(), year: nowNY.year };
    }
    case 'weekly': {
      const start = nowNY.startOf('week');
      const end = nowNY.endOf('week').plus({ days: 1 }).startOf('day');
      return { start: start.toUTC().toISO(), end: end.toUTC().toISO(), year: nowNY.year };
    }
    case 'yearly': {
      const start = nowNY.startOf('year');
      const end = nowNY.endOf('year').plus({ days: 1 }).startOf('day');
      return { start: start.toUTC().toISO(), end: end.toUTC().toISO(), year: nowNY.year };
    }
    case 'monthly':
    default: {
      const start = nowNY.startOf('month');
      const end = nowNY.endOf('month').plus({ days: 1 }).startOf('day');
      return { start: start.toUTC().toISO(), end: end.toUTC().toISO(), year: nowNY.year };
    }
  }
}

// Build dynamic WHERE clause + params for historical_appointments
function buildHistoricalFilters(query, startParamIdx = 1) {
  const conditions = [];
  const params = [];
  let idx = startParamIdx;

  if (query.startDate) {
    conditions.push(`ha.appointment_date >= $${idx++}`);
    params.push(new Date(query.startDate).toISOString().split('T')[0]);
  }
  if (query.endDate) {
    conditions.push(`ha.appointment_date < $${idx++}`);
    params.push(new Date(query.endDate).toISOString().split('T')[0]);
  }
  if (query.sourceSystem && query.sourceSystem !== 'all') {
    conditions.push(`ha.source_system = $${idx++}`);
    params.push(query.sourceSystem);
  }
  if (query.status && query.status !== 'all') {
    conditions.push(`ha.status = $${idx++}`);
    params.push(query.status);
  }
  if (query.location) {
    conditions.push(`ha.location = $${idx++}`);
    params.push(query.location);
  }
  if (query.locationCategory) {
    conditions.push(`ha.location_category = $${idx++}`);
    params.push(query.locationCategory);
  }
  if (query.division) {
    conditions.push(`ha.division = $${idx++}`);
    params.push(query.division);
  }
  if (query.tutor) {
    // Names stored as "Last, First" — split search terms and match ALL parts
    // So "Chris" matches "Martinez, Chris" and "Sam" matches "Williams, Sam"
    const tutorParts = query.tutor.trim().split(/\s+/).filter(Boolean);
    for (const part of tutorParts) {
      conditions.push(`hat.tutor_name ILIKE $${idx++}`);
      params.push(`%${part}%`);
    }
  }
  if (query.client) {
    // Same approach for client names
    const clientParts = query.client.trim().split(/\s+/).filter(Boolean);
    for (const part of clientParts) {
      conditions.push(`hac.client_name ILIKE $${idx++}`);
      params.push(`%${part}%`);
    }
  }

  return { conditions, params, nextIdx: idx };
}

// ─── GET / — Aggregation endpoint (monthly breakdown by source) ──────────────

router.get('/', asyncHandler(async (req, res) => {
  const pool = req.locationPool || global.pool;
  const client = await pool.connect();
  try {
    const view = (req.query.view || 'monthly').toString().toLowerCase();
    let sourceSystem = req.query.sourceSystem || null;
    if (sourceSystem && sourceSystem.toLowerCase() === 'all') {
      sourceSystem = null;
    }
    const { start, end } = getDateRange(view, req.query);

    const startDate = new Date(start).toISOString().split('T')[0];
    const endDate = new Date(end).toISOString().split('T')[0];

    let sourceFilter = '';
    let params = [startDate, endDate];

    if (sourceSystem) {
      params.push(sourceSystem);
      sourceFilter = 'AND ha.source_system = $3';
    }

    const historicalQuery = `
      SELECT
        EXTRACT(MONTH FROM ha.appointment_date)::int AS month,
        ha.source_system,
        COUNT(*)::int AS total_lessons,
        ROUND(SUM(ha.duration_hours), 2) AS total_hours,
        ROUND(SUM(COALESCE(ha.revenue, 0)), 2) AS total_revenue,
        ROUND(SUM(COALESCE(ha.tutor_pay, 0)), 2) AS total_tutor_pay,
        ROUND(SUM(COALESCE(ha.revenue, 0) - COALESCE(ha.tutor_pay, 0)), 2) AS total_gross_profit,
        COUNT(DISTINCT hac.client_id)::int AS total_students,
        COUNT(DISTINCT hat.tutor_id)::int AS total_tutors
      FROM historical_appointments ha
      LEFT JOIN historical_appointment_clients hac ON ha.id = hac.historical_appointment_id
      LEFT JOIN historical_appointment_tutors hat ON ha.id = hat.historical_appointment_id
      WHERE ha.appointment_date >= $1
        AND ha.appointment_date < $2
        AND ha.status IN ('complete', 'completed')
        AND (
          (ha.source_system = 'mindbody' AND ha.appointment_date < '2023-11-01')
          OR
          (ha.source_system = 'e4' AND ha.appointment_date >= '2023-07-01' AND ha.appointment_date < '2024-06-01')
        )
        ${sourceFilter}
      GROUP BY month, ha.source_system
      ORDER BY month, ha.source_system;
    `;

    const currentQuery = `
      WITH revenue_calc AS (
        SELECT
          a.appointment_id,
          SUM(
            CASE
              WHEN s.dft_charge_type = 'hourly' THEN ar.charge_rate * a.units
              WHEN s.dft_charge_type = 'one-off' THEN ar.charge_rate
              WHEN s.dft_charge_type = 'one-off-split' THEN ar.charge_rate
              WHEN s.dft_charge_type = 'hourly-split' THEN ar.charge_rate * a.units
              ELSE ar.charge_rate * a.units
            END
          ) AS appointment_revenue
        FROM appointments a
        JOIN services s ON a.service_id = s.service_id
        LEFT JOIN appointment_recipients ar ON a.appointment_id = ar.appointment_id
          AND ar.status <> 'missed'
        WHERE a.status IN ('complete', 'cancelled-chargeable')
          AND a.is_deleted IS NOT TRUE
          AND a.start::date >= GREATEST($1::date, '2024-04-01'::date)
          AND a.start::date < $2::date
        GROUP BY a.appointment_id
      ),
      tutor_pay_calc AS (
        SELECT
          a.appointment_id,
          SUM(
            CASE
              WHEN s.dft_charge_type = 'hourly' THEN ac.pay_rate * a.units
              WHEN s.dft_charge_type = 'one-off' THEN ac.pay_rate
              WHEN s.dft_charge_type = 'one-off-split' THEN ac.pay_rate
              WHEN s.dft_charge_type = 'hourly-split' THEN ac.pay_rate * a.units
              ELSE ac.pay_rate * a.units
            END
          ) + COALESCE(
            (SELECT COUNT(*) * s.sr_premium * a.units
             FROM appointment_recipients ar2
             WHERE ar2.appointment_id = a.appointment_id
               AND ar2.status <> 'missed'
            ),
            0
          ) AS appointment_tutor_pay
        FROM appointments a
        JOIN services s ON a.service_id = s.service_id
        JOIN appointment_contractors ac ON a.appointment_id = ac.appointment_id
        WHERE a.status IN ('complete', 'cancelled-chargeable')
          AND a.is_deleted IS NOT TRUE
          AND a.start::date >= GREATEST($1::date, '2024-04-01'::date)
          AND a.start::date < $2::date
        GROUP BY a.appointment_id, s.sr_premium, a.units
      ),
      distinct_appointments AS (
        SELECT DISTINCT ON (a.appointment_id)
          a.appointment_id,
          a.start,
          a.units
        FROM appointments a
        WHERE a.status IN ('complete', 'cancelled-chargeable')
          AND a.is_deleted IS NOT TRUE
          AND a.start::date >= GREATEST($1::date, '2024-04-01'::date)
          AND a.start::date < $2::date
      )
      SELECT
        month_val AS month,
        'tutorcruncher' AS source_system,
        COUNT(*)::int AS total_lessons,
        ROUND(SUM(da.units), 2) AS total_hours,
        ROUND(SUM(COALESCE(da.appointment_revenue, 0)), 2) AS total_revenue,
        ROUND(SUM(COALESCE(da.appointment_tutor_pay, 0)), 2) AS total_tutor_pay,
        ROUND(SUM(COALESCE(da.appointment_revenue, 0) - COALESCE(da.appointment_tutor_pay, 0)), 2) AS total_gross_profit,
        (SELECT COUNT(DISTINCT ar2.recipient_id)::int
         FROM appointments a2
         LEFT JOIN appointment_recipients ar2 ON a2.appointment_id = ar2.appointment_id
           AND ar2.status <> 'missed'
         WHERE a2.status IN ('complete', 'cancelled-chargeable')
           AND a2.is_deleted IS NOT TRUE
           AND a2.start::date >= GREATEST($1::date, '2024-04-01'::date)
           AND a2.start::date < $2::date
           AND EXTRACT(MONTH FROM a2.start) = month_val) AS total_students,
        (SELECT COUNT(DISTINCT ac2.contractor_id)::int
         FROM appointments a2
         LEFT JOIN appointment_contractors ac2 ON a2.appointment_id = ac2.appointment_id
         WHERE a2.status IN ('complete', 'cancelled-chargeable')
           AND a2.is_deleted IS NOT TRUE
           AND a2.start::date >= GREATEST($1::date, '2024-04-01'::date)
           AND a2.start::date < $2::date
           AND EXTRACT(MONTH FROM a2.start) = month_val) AS total_tutors
      FROM (
        SELECT
          da.appointment_id,
          da.units,
          EXTRACT(MONTH FROM da.start)::int AS month_val,
          rc.appointment_revenue,
          tp.appointment_tutor_pay
        FROM distinct_appointments da
        LEFT JOIN revenue_calc rc ON da.appointment_id = rc.appointment_id
        LEFT JOIN tutor_pay_calc tp ON da.appointment_id = tp.appointment_id
      ) da
      GROUP BY month_val
      ORDER BY month_val;
    `;

    const historicalResult = await client.query(historicalQuery, params);

    const shouldQueryCurrent = new Date(endDate) >= new Date('2024-04-01') &&
                               (!sourceSystem || sourceSystem === 'tutorcruncher' || sourceSystem === 'all');

    let currentResult = { rows: [] };
    if (shouldQueryCurrent) {
      currentResult = await client.query(currentQuery, params);
    }

    const result = { rows: [...historicalResult.rows, ...currentResult.rows] };

    const totals = result.rows.reduce((acc, row) => {
      acc.lessons += row.total_lessons || 0;
      acc.hours += parseFloat(row.total_hours || 0);
      acc.revenue += parseFloat(row.total_revenue || 0);
      acc.tutorPay += parseFloat(row.total_tutor_pay || 0);
      acc.grossProfit += parseFloat(row.total_gross_profit || 0);
      return acc;
    }, { lessons: 0, hours: 0, revenue: 0, tutorPay: 0, grossProfit: 0 });

    const monthData = {};
    result.rows.forEach(row => {
      const monthKey = ['jan', 'feb', 'mar', 'apr', 'may', 'jun', 'jul', 'aug', 'sep', 'oct', 'nov', 'dec'][row.month - 1];
      if (!monthData[monthKey]) {
        monthData[monthKey] = { lessons: 0, hours: 0, revenue: 0, tutorPay: 0, grossProfit: 0, students: 0, tutors: 0, sourceSystems: {} };
      }
      monthData[monthKey].lessons += row.total_lessons || 0;
      monthData[monthKey].hours += parseFloat(row.total_hours || 0);
      monthData[monthKey].revenue += parseFloat(row.total_revenue || 0);
      monthData[monthKey].tutorPay += parseFloat(row.total_tutor_pay || 0);
      monthData[monthKey].grossProfit += parseFloat(row.total_gross_profit || 0);
      monthData[monthKey].students = Math.max(monthData[monthKey].students, row.total_students || 0);
      monthData[monthKey].tutors = Math.max(monthData[monthKey].tutors, row.total_tutors || 0);

      const src = row.source_system || 'unknown';
      if (!monthData[monthKey].sourceSystems[src]) {
        monthData[monthKey].sourceSystems[src] = { lessons: 0, revenue: 0 };
      }
      monthData[monthKey].sourceSystems[src].lessons += row.total_lessons || 0;
      monthData[monthKey].sourceSystems[src].revenue += parseFloat(row.total_revenue || 0);
    });

    res.json({
      lessons: { ytd: totals.lessons, months: monthData },
      hours: { ytd: totals.hours, months: monthData },
      revenue: { ytd: totals.revenue, months: monthData },
      tutorPay: { ytd: totals.tutorPay, months: monthData },
      grossProfit: { ytd: totals.grossProfit, months: monthData },
      students: { ytd: totals.lessons, months: monthData },
      tutors: { ytd: 0, months: monthData }
    });

  } catch (error) {
    logger.error({ err: error }, 'Error fetching historical analytics');
    res.status(500).json({ error: 'Internal server error', details: error.message });
  } finally {
    client.release();
  }
}));

// ─── GET /details — Data Explorer (paginated, filtered, all sources) ─────────

router.get('/details', asyncHandler(async (req, res) => {
  const pool = req.locationPool || global.pool;
  const client = await pool.connect();
  try {
    const page = Math.max(1, parseInt(req.query.page) || 1);
    const pageSize = Math.min(200, Math.max(1, parseInt(req.query.pageSize) || 50));
    const offset = (page - 1) * pageSize;
    const sortBy = req.query.sortBy || 'appointment_date';
    const sortOrder = (req.query.sortOrder || 'desc').toUpperCase() === 'ASC' ? 'ASC' : 'DESC';

    // Allowed sort columns to prevent SQL injection
    const allowedSorts = {
      'appointment_date': 'ha.appointment_date',
      'start_time': 'ha.start_time',
      'revenue': 'ha.revenue',
      'tutor_pay': 'ha.tutor_pay',
      'gross_profit': 'ha.gross_profit',
      'duration_hours': 'ha.duration_hours',
      'location': 'ha.location',
      'source_system': 'ha.source_system',
      'status': 'ha.status',
    };
    const sortColumn = allowedSorts[sortBy] || 'ha.appointment_date';

    const { conditions, params, nextIdx } = buildHistoricalFilters(req.query);

    const whereClause = conditions.length > 0 ? 'WHERE ' + conditions.join(' AND ') : '';

    // Tutor/client joins needed for filters and for returning data
    const tutorJoin = 'LEFT JOIN historical_appointment_tutors hat ON ha.id = hat.historical_appointment_id';
    const clientJoin = 'LEFT JOIN historical_appointment_clients hac ON ha.id = hac.historical_appointment_id';

    // Count query (for pagination)
    const countQuery = `
      SELECT COUNT(DISTINCT ha.id) AS total
      FROM historical_appointments ha
      ${tutorJoin}
      ${clientJoin}
      ${whereClause}
    `;

    // Data query
    const dataQuery = `
      SELECT DISTINCT ON (ha.id, ${sortColumn})
        ha.id,
        ha.appointment_date,
        ha.start_time,
        ha.duration_hours,
        ha.lesson_type,
        ha.division,
        ha.location,
        ha.location_category,
        ha.revenue,
        ha.tutor_pay,
        ha.gross_profit,
        ha.status,
        ha.source_system,
        ha.class_size,
        ha.dashboard_category,
        ha.focus,
        hat.tutor_name,
        hat.tutor_first_name,
        hat.tutor_last_name,
        hac.client_name,
        hac.client_id AS client_source_id,
        hac.client_email
      FROM historical_appointments ha
      ${tutorJoin}
      ${clientJoin}
      ${whereClause}
      ORDER BY ${sortColumn} ${sortOrder}, ha.id ${sortOrder}
      LIMIT $${nextIdx} OFFSET $${nextIdx + 1}
    `;

    // Summary: aggregate on filtered IDs (avoids join multiplication on SUM)
    const summaryQuery = `
      WITH filtered_ids AS (
        SELECT DISTINCT ha.id
        FROM historical_appointments ha
        ${tutorJoin}
        ${clientJoin}
        ${whereClause}
      )
      SELECT
        COUNT(*)::int AS total_lessons,
        ROUND(SUM(ha.duration_hours), 2) AS total_hours,
        ROUND(SUM(COALESCE(ha.revenue, 0)), 2) AS total_revenue,
        ROUND(SUM(COALESCE(ha.tutor_pay, 0)), 2) AS total_tutor_pay,
        ROUND(SUM(COALESCE(ha.gross_profit, 0)), 2) AS total_gross_profit,
        (SELECT COUNT(DISTINCT hat2.tutor_name)
         FROM historical_appointment_tutors hat2
         WHERE hat2.historical_appointment_id IN (SELECT id FROM filtered_ids)
        ) AS unique_tutors,
        (SELECT COUNT(DISTINCT hac2.client_name)
         FROM historical_appointment_clients hac2
         WHERE hac2.historical_appointment_id IN (SELECT id FROM filtered_ids)
        ) AS unique_clients
      FROM historical_appointments ha
      WHERE ha.id IN (SELECT id FROM filtered_ids)
    `;

    const dataParams = [...params, pageSize, offset];

    const [countResult, dataResult, summaryResult] = await Promise.all([
      client.query(countQuery, params),
      client.query(dataQuery, dataParams),
      client.query(summaryQuery, params),
    ]);

    const totalRows = parseInt(countResult.rows[0]?.total || 0);
    const totalPages = Math.ceil(totalRows / pageSize);

    res.json({
      rows: dataResult.rows,
      pagination: {
        page,
        pageSize,
        totalRows,
        totalPages,
      },
      summary: summaryResult.rows[0] || {},
    });

  } catch (error) {
    logger.error({ err: error }, 'Error fetching historical analytics details');
    res.status(500).json({ error: 'Internal server error', details: error.message });
  } finally {
    client.release();
  }
}));

// ─── GET /details/filters — Dropdown options for Data Explorer ───────────────

router.get('/details/filters', asyncHandler(async (req, res) => {
  const pool = req.locationPool || global.pool;
  const client = await pool.connect();
  try {
    const [sources, statuses, locations, locationCategories, divisions] = await Promise.all([
      client.query(`SELECT DISTINCT source_system FROM historical_appointments ORDER BY 1`),
      client.query(`SELECT DISTINCT status FROM historical_appointments WHERE status IS NOT NULL ORDER BY 1`),
      client.query(`SELECT DISTINCT location FROM historical_appointments WHERE location IS NOT NULL AND location != '' ORDER BY 1`),
      client.query(`SELECT DISTINCT location_category FROM historical_appointments WHERE location_category IS NOT NULL ORDER BY 1`),
      client.query(`SELECT DISTINCT division FROM historical_appointments WHERE division IS NOT NULL ORDER BY 1`),
    ]);

    // Date range per source system
    const dateRanges = await client.query(`
      SELECT source_system, MIN(appointment_date) AS earliest, MAX(appointment_date) AS latest, COUNT(*) AS total
      FROM historical_appointments
      GROUP BY source_system
      ORDER BY source_system
    `);

    res.json({
      sourceSystems: sources.rows.map(r => r.source_system),
      statuses: statuses.rows.map(r => r.status),
      locations: locations.rows.map(r => r.location),
      locationCategories: locationCategories.rows.map(r => r.location_category),
      divisions: divisions.rows.map(r => r.division),
      dateRanges: dateRanges.rows,
      eraPresets: [
        { label: 'All Time', startDate: '2016-01-01', endDate: new Date().toISOString().split('T')[0] },
        { label: 'MindBody', startDate: '2016-01-01', endDate: '2023-10-31' },
        { label: 'E4', startDate: '2023-06-01', endDate: '2024-05-31' },
        { label: 'TutorCruncher', startDate: '2024-04-01', endDate: new Date().toISOString().split('T')[0] },
      ],
    });

  } catch (error) {
    logger.error({ err: error }, 'Error fetching filter options');
    res.status(500).json({ error: 'Internal server error', details: error.message });
  } finally {
    client.release();
  }
}));

// ─── GET /details/export — CSV export of filtered results ────────────────────

router.get('/details/export', asyncHandler(async (req, res) => {
  const pool = req.locationPool || global.pool;
  const client = await pool.connect();
  try {
    const { conditions, params } = buildHistoricalFilters(req.query);
    const whereClause = conditions.length > 0 ? 'WHERE ' + conditions.join(' AND ') : '';

    const tutorJoin = 'LEFT JOIN historical_appointment_tutors hat ON ha.id = hat.historical_appointment_id';
    const clientJoin = 'LEFT JOIN historical_appointment_clients hac ON ha.id = hac.historical_appointment_id';

    // Cap export at 100K rows
    const exportQuery = `
      SELECT DISTINCT ON (ha.id)
        ha.appointment_date,
        ha.start_time,
        hat.tutor_name,
        hac.client_name,
        ha.lesson_type,
        ha.division,
        ha.location,
        ha.location_category,
        ha.revenue,
        ha.tutor_pay,
        ha.gross_profit,
        ha.duration_hours,
        ha.status,
        ha.source_system,
        ha.class_size,
        ha.focus
      FROM historical_appointments ha
      ${tutorJoin}
      ${clientJoin}
      ${whereClause}
      ORDER BY ha.id, ha.appointment_date DESC
      LIMIT 100000
    `;

    const result = await client.query(exportQuery, params);

    // Build CSV
    const headers = [
      'Date', 'Time', 'Tutor', 'Client', 'Lesson Type', 'Division',
      'Location', 'Market', 'Revenue', 'Tutor Pay', 'Gross Profit',
      'Duration (hrs)', 'Status', 'Source System', 'Class Size', 'Focus'
    ];

    const csvRows = [headers.join(',')];
    for (const row of result.rows) {
      csvRows.push([
        row.appointment_date ? new Date(row.appointment_date).toISOString().split('T')[0] : '',
        row.start_time || '',
        `"${(row.tutor_name || '').replace(/"/g, '""')}"`,
        `"${(row.client_name || '').replace(/"/g, '""')}"`,
        `"${(row.lesson_type || '').replace(/"/g, '""')}"`,
        row.division || '',
        `"${(row.location || '').replace(/"/g, '""')}"`,
        row.location_category || '',
        row.revenue || 0,
        row.tutor_pay || 0,
        row.gross_profit || 0,
        row.duration_hours || '',
        row.status || '',
        row.source_system || '',
        row.class_size || '',
        row.focus || '',
      ].join(','));
    }

    res.setHeader('Content-Type', 'text/csv');
    res.setHeader('Content-Disposition', `attachment; filename="historical-analytics-${new Date().toISOString().split('T')[0]}.csv"`);
    res.send(csvRows.join('\n'));

  } catch (error) {
    logger.error({ err: error }, 'Error exporting historical analytics');
    res.status(500).json({ error: 'Internal server error', details: error.message });
  } finally {
    client.release();
  }
}));

// ─── GET /summary — Overall stats with era boundaries ────────────────────────

router.get('/summary', asyncHandler(async (req, res) => {
  const pool = req.locationPool || global.pool;
  const client = await pool.connect();
  try {
    const { startDate, endDate, sourceSystem } = req.query;

    if (!startDate || !endDate) {
      return res.status(400).json({ error: 'startDate and endDate are required' });
    }

    let sourceSystemFilter = sourceSystem;
    if (sourceSystemFilter && sourceSystemFilter.toLowerCase() === 'all') {
      sourceSystemFilter = null;
    }

    const start = new Date(startDate).toISOString().split('T')[0];
    const end = new Date(endDate).toISOString().split('T')[0];
    const startDateObj = new Date(start);
    const april2024 = new Date('2024-04-01');

    const results = [];

    if (startDateObj < april2024) {
      let sourceFilter = '';
      let params = [start, end];

      if (sourceSystemFilter) {
        params.push(sourceSystemFilter);
        sourceFilter = 'AND ha.source_system = $3';
      }

      const historicalQuery = `
        SELECT
          COUNT(*)::int AS total_appointments,
          ROUND(SUM(ha.duration_hours), 2) AS total_hours,
          ROUND(SUM(COALESCE(ha.revenue, 0)), 2) AS total_revenue,
          ROUND(SUM(COALESCE(ha.tutor_pay, 0)), 2) AS total_tutor_pay,
          ROUND(SUM(COALESCE(ha.revenue, 0) - COALESCE(ha.tutor_pay, 0)), 2) AS total_gross_profit,
          COUNT(DISTINCT hac.client_id)::int AS unique_clients,
          COUNT(DISTINCT hat.tutor_id)::int AS unique_tutors,
          ha.source_system,
          COUNT(*) FILTER (WHERE ha.division = 'In-Home')::int AS in_home_count,
          COUNT(*) FILTER (WHERE ha.division = 'Online')::int AS online_count,
          COUNT(*) FILTER (WHERE ha.division = 'School')::int AS school_count,
          COUNT(*) FILTER (WHERE ha.division = 'Retail')::int AS retail_count
        FROM historical_appointments ha
        LEFT JOIN historical_appointment_clients hac ON ha.id = hac.historical_appointment_id
        LEFT JOIN historical_appointment_tutors hat ON ha.id = hat.historical_appointment_id
        WHERE ha.appointment_date >= $1
          AND ha.appointment_date < $2
          AND ha.status IN ('complete', 'completed')
          AND (
            (ha.source_system = 'mindbody' AND ha.appointment_date < '2023-11-01')
            OR
            (ha.source_system = 'e4' AND ha.appointment_date >= '2023-07-01' AND ha.appointment_date < '2024-06-01')
          )
          ${sourceFilter}
        GROUP BY ha.source_system
        ORDER BY ha.source_system;
      `;

      const historicalResult = await client.query(historicalQuery, params);
      results.push(...historicalResult.rows);
    }

    if (new Date(end) >= april2024 && (!sourceSystemFilter || sourceSystemFilter === 'tutorcruncher')) {
      const currentStart = startDateObj >= april2024 ? start : '2024-04-01';

      const currentQuery = `
        WITH revenue_calc AS (
          SELECT
            a.appointment_id,
            SUM(
              CASE
                WHEN s.dft_charge_type = 'hourly' THEN ar.charge_rate * a.units
                WHEN s.dft_charge_type = 'one-off' THEN ar.charge_rate
                WHEN s.dft_charge_type = 'one-off-split' THEN ar.charge_rate
                WHEN s.dft_charge_type = 'hourly-split' THEN ar.charge_rate * a.units
                ELSE ar.charge_rate * a.units
              END
            ) AS appointment_revenue
          FROM appointments a
          JOIN services s ON a.service_id = s.service_id
          LEFT JOIN appointment_recipients ar ON a.appointment_id = ar.appointment_id
            AND ar.status <> 'missed'
          WHERE a.status IN ('complete', 'cancelled-chargeable')
            AND a.is_deleted IS NOT TRUE
            AND a.start::date >= $1
            AND a.start::date < $2
          GROUP BY a.appointment_id
        ),
        tutor_pay_calc AS (
          SELECT
            a.appointment_id,
            SUM(
              CASE
                WHEN s.dft_charge_type = 'hourly' THEN ac.pay_rate * a.units
                WHEN s.dft_charge_type = 'one-off' THEN ac.pay_rate
                WHEN s.dft_charge_type = 'one-off-split' THEN ac.pay_rate
                WHEN s.dft_charge_type = 'hourly-split' THEN ac.pay_rate * a.units
                ELSE ac.pay_rate * a.units
              END
            ) + COALESCE(
              (SELECT COUNT(*) * s.sr_premium * a.units
               FROM appointment_recipients ar2
               WHERE ar2.appointment_id = a.appointment_id
                 AND ar2.status <> 'missed'
              ),
              0
            ) AS appointment_tutor_pay
          FROM appointments a
          JOIN services s ON a.service_id = s.service_id
          JOIN appointment_contractors ac ON a.appointment_id = ac.appointment_id
          WHERE a.status IN ('complete', 'cancelled-chargeable')
            AND a.is_deleted IS NOT TRUE
            AND a.start::date >= $1
            AND a.start::date < $2
          GROUP BY a.appointment_id, s.sr_premium, a.units
        ),
        distinct_appointments AS (
          SELECT DISTINCT ON (a.appointment_id)
            a.appointment_id,
            a.units
          FROM appointments a
          WHERE a.status IN ('complete', 'cancelled-chargeable')
            AND a.is_deleted IS NOT TRUE
            AND a.start::date >= $1
            AND a.start::date < $2
        )
        SELECT
          COUNT(*)::int AS total_appointments,
          ROUND(SUM(da.units), 2) AS total_hours,
          ROUND(SUM(COALESCE(rc.appointment_revenue, 0)), 2) AS total_revenue,
          ROUND(SUM(COALESCE(tp.appointment_tutor_pay, 0)), 2) AS total_tutor_pay,
          ROUND(SUM(COALESCE(rc.appointment_revenue, 0) - COALESCE(tp.appointment_tutor_pay, 0)), 2) AS total_gross_profit,
          (SELECT COUNT(DISTINCT ar2.recipient_id)::int
           FROM appointments a2
           LEFT JOIN appointment_recipients ar2 ON a2.appointment_id = ar2.appointment_id
             AND ar2.status <> 'missed'
           WHERE a2.status IN ('complete', 'cancelled-chargeable')
             AND a2.is_deleted IS NOT TRUE
             AND a2.start::date >= $1
             AND a2.start::date < $2) AS unique_clients,
          (SELECT COUNT(DISTINCT ac2.contractor_id)::int
           FROM appointments a2
           LEFT JOIN appointment_contractors ac2 ON a2.appointment_id = ac2.appointment_id
           WHERE a2.status IN ('complete', 'cancelled-chargeable')
             AND a2.is_deleted IS NOT TRUE
             AND a2.start::date >= $1
             AND a2.start::date < $2) AS unique_tutors,
          'tutorcruncher' AS source_system,
          0::int AS in_home_count,
          0::int AS online_count,
          0::int AS school_count,
          0::int AS retail_count
        FROM distinct_appointments da
        LEFT JOIN revenue_calc rc ON da.appointment_id = rc.appointment_id
        LEFT JOIN tutor_pay_calc tp ON da.appointment_id = tp.appointment_id;
      `;

      const currentResult = await client.query(currentQuery, [currentStart, end]);
      results.push(...currentResult.rows);
    }

    const totals = results.reduce((acc, row) => {
      acc.total_appointments += row.total_appointments || 0;
      acc.total_hours += parseFloat(row.total_hours || 0);
      acc.total_revenue += parseFloat(row.total_revenue || 0);
      acc.total_tutor_pay += parseFloat(row.total_tutor_pay || 0);
      acc.total_gross_profit += parseFloat(row.total_gross_profit || 0);
      acc.unique_clients = Math.max(acc.unique_clients, row.unique_clients || 0);
      acc.unique_tutors = Math.max(acc.unique_tutors, row.unique_tutors || 0);
      acc.in_home_count += row.in_home_count || 0;
      acc.online_count += row.online_count || 0;
      acc.school_count += row.school_count || 0;
      acc.retail_count += row.retail_count || 0;
      return acc;
    }, {
      total_appointments: 0, total_hours: 0, total_revenue: 0,
      total_tutor_pay: 0, total_gross_profit: 0, unique_clients: 0,
      unique_tutors: 0, in_home_count: 0, online_count: 0,
      school_count: 0, retail_count: 0
    });

    res.json({ totals, bySourceSystem: results });

  } catch (error) {
    logger.error({ err: error }, 'Error fetching historical analytics summary');
    res.status(500).json({ error: 'Internal server error', details: error.message });
  } finally {
    client.release();
  }
}));

// ─── GET /timeline — Monthly totals by source across full history ─────────────

router.get('/timeline', asyncHandler(async (req, res) => {
  const pool = req.locationPool || global.pool;
  const client = await pool.connect();
  try {
    // Historical (MB + E4)
    const historicalResult = await client.query(`
      SELECT
        TO_CHAR(appointment_date, 'YYYY-MM') AS month,
        source_system,
        COUNT(*) FILTER (WHERE status = 'completed')::int AS completed,
        COUNT(*)::int AS total,
        ROUND(SUM(CASE WHEN status = 'completed' THEN COALESCE(revenue, 0) ELSE 0 END), 2) AS revenue
      FROM historical_appointments
      WHERE appointment_date IS NOT NULL
      GROUP BY 1, 2
      ORDER BY 1, 2
    `);

    // Live TC appointments
    const tcResult = await client.query(`
      SELECT
        TO_CHAR(a.start, 'YYYY-MM') AS month,
        'tutorcruncher' AS source_system,
        COUNT(*)::int AS completed,
        COUNT(*)::int AS total,
        ROUND(COALESCE(SUM(
          (SELECT SUM(ar.charge_rate * COALESCE(a2.units, 1))
           FROM appointment_recipients ar
           JOIN appointments a2 ON a2.appointment_id = ar.appointment_id
           WHERE ar.appointment_id = a.appointment_id AND ar.status <> 'missed')
        ), 0), 2) AS revenue
      FROM appointments a
      WHERE a.status = 'complete'
        AND a.is_deleted IS NOT TRUE
      GROUP BY 1
      ORDER BY 1
    `);

    const eras = [
      { key: 'mindbody', label: 'MindBody', color: '#3B82F6', start: '2016-01', end: '2023-10' },
      { key: 'e4', label: 'E4', color: '#10B981', start: '2023-06', end: '2024-05' },
      { key: 'tutorcruncher', label: 'TutorCruncher', color: '#8B5CF6', start: '2024-04', end: null },
    ];

    res.json({ months: [...historicalResult.rows, ...tcResult.rows], eras });
  } catch (error) {
    logger.error({ err: error }, 'Error fetching timeline');
    res.status(500).json({ error: 'Internal server error', details: error.message });
  } finally {
    client.release();
  }
}));

// ─── GET /velocity — Current pace + projected 1M date ────────────────────────

router.get('/velocity', asyncHandler(async (req, res) => {
  const pool = req.locationPool || global.pool;
  const client = await pool.connect();
  try {
    // Get total completed from historical (MB + E4) + live TC
    const [historicalCount, tcCount, recentPace] = await Promise.all([
      client.query(`SELECT COUNT(*)::int AS total FROM historical_appointments WHERE status = 'completed'`),
      client.query(`SELECT COUNT(*)::int AS total FROM appointments WHERE status = 'complete' AND is_deleted IS NOT TRUE`),
      client.query(`
        SELECT COUNT(*)::int AS last_30_days, ROUND(COUNT(*)::numeric / 30, 1) AS per_day
        FROM appointments WHERE status = 'complete' AND is_deleted IS NOT TRUE AND start >= NOW() - INTERVAL '30 days'
      `),
    ]);

    const totalHistorical = parseInt(historicalCount.rows[0].total) || 0;
    const totalTC = parseInt(tcCount.rows[0].total) || 0;
    const totalAll = totalHistorical + totalTC;
    const perDay = parseFloat(recentPace.rows[0].per_day) || 0;
    const last30 = parseInt(recentPace.rows[0].last_30_days) || 0;

    const target = 1000000;
    const remaining = Math.max(0, target - totalAll);
    const daysToTarget = perDay > 0 ? Math.ceil(remaining / perDay) : null;
    const projectedDate = daysToTarget
      ? new Date(Date.now() + daysToTarget * 86400000).toISOString().split('T')[0]
      : null;

    res.json({
      total_historical: totalHistorical,
      total_tc: totalTC,
      total: totalAll,
      last_30_days: last30,
      per_day: perDay,
      per_week: Math.round(perDay * 7),
      per_month: Math.round(perDay * 30),
      target,
      remaining,
      days_to_target: daysToTarget,
      projected_date: projectedDate,
    });
  } catch (error) {
    logger.error({ err: error }, 'Error fetching velocity');
    res.status(500).json({ error: 'Internal server error', details: error.message });
  } finally {
    client.release();
  }
}));

// ─── GET /milestones — Cumulative milestone dates ────────────────────────────

router.get('/milestones', asyncHandler(async (req, res) => {
  const pool = req.locationPool || global.pool;
  const client = await pool.connect();
  try {
    // Calculate cumulative completed lessons (historical + TC) for milestones
    const result = await client.query(`
      WITH all_monthly AS (
        SELECT TO_CHAR(appointment_date, 'YYYY-MM') AS month, COUNT(*) AS completed
        FROM historical_appointments
        WHERE appointment_date IS NOT NULL AND status = 'completed'
        GROUP BY 1
        UNION ALL
        SELECT TO_CHAR(start, 'YYYY-MM') AS month, COUNT(*) AS completed
        FROM appointments
        WHERE status = 'complete' AND is_deleted IS NOT TRUE
        GROUP BY 1
      ),
      monthly_combined AS (
        SELECT month, SUM(completed) AS completed
        FROM all_monthly
        GROUP BY 1
        ORDER BY 1
      ),
      cumulative AS (
        SELECT month, completed, SUM(completed) OVER (ORDER BY month) AS running_total
        FROM monthly_combined
      )
      SELECT month, completed, running_total
      FROM cumulative
      ORDER BY month
    `);

    // Find milestone thresholds
    const thresholds = [1000, 5000, 10000, 25000, 50000, 75000, 100000, 150000, 200000, 250000, 500000, 750000, 1000000];
    const milestones = [];
    let prevTotal = 0;

    for (const row of result.rows) {
      const total = parseInt(row.running_total);
      for (const threshold of thresholds) {
        if (prevTotal < threshold && total >= threshold) {
          milestones.push({
            threshold,
            label: threshold >= 1000000 ? `${(threshold / 1000000).toFixed(0)}M` : `${(threshold / 1000).toFixed(0)}K`,
            month: row.month,
            actual_total: total,
          });
        }
      }
      prevTotal = total;
    }

    // Location breakdown (historical + TC)
    const locationBreakdown = await client.query(`
      SELECT location_category, completed, source_system FROM (
        SELECT location_category, COUNT(*)::int AS completed, source_system
        FROM historical_appointments
        WHERE location_category IS NOT NULL AND status = 'completed'
        GROUP BY location_category, source_system
        UNION ALL
        SELECT
          CASE
            WHEN a.location::text LIKE '%Online%' THEN 'Online'
            WHEN a.location::text LIKE '%Club%' OR a.location::text LIKE '%UES%' OR a.location::text LIKE '%Park Slope%' THEN 'New York'
            WHEN a.location::text LIKE '%School%' THEN 'School'
            WHEN a.location::text LIKE '%Los Angeles%' OR a.location::text LIKE '%LA %' THEN 'Los Angeles'
            WHEN a.location::text LIKE '%Westside%' THEN Westside
            WHEN a.location::text LIKE '%Eastside%' THEN Eastside
            WHEN a.location::text LIKE '%Hampton%' OR a.location::text LIKE '%Sag Harbor%' OR a.location::text LIKE '%Montauk%' THEN 'Hamptons'
            WHEN a.location IS NULL THEN 'New York'
            ELSE 'New York'
          END AS location_category,
          COUNT(*)::int AS completed,
          'tutorcruncher' AS source_system
        FROM appointments a
        WHERE a.status = 'complete' AND a.is_deleted IS NOT TRUE
        GROUP BY 1
      ) combined
      ORDER BY completed DESC
    `);

    res.json({
      cumulative: result.rows,
      milestones,
      location_breakdown: locationBreakdown.rows,
    });
  } catch (error) {
    logger.error({ err: error }, 'Error fetching milestones');
    res.status(500).json({ error: 'Internal server error', details: error.message });
  } finally {
    client.release();
  }
}));

// ─── GET /heatmap — Daily lesson counts for contribution grid ─────────────────

router.get('/heatmap', asyncHandler(async (req, res) => {
  const pool = req.locationPool || global.pool;
  const client = await pool.connect();
  try {
    const year = req.query.year ? parseInt(req.query.year) : null;
    const sourceSystem = req.query.sourceSystem || null;

    let historicalWhere = ["appointment_date IS NOT NULL", "status = 'completed'"];
    let tcWhere = ["a.start IS NOT NULL", "a.status = 'complete'", "a.is_deleted IS NOT TRUE"];
    let params = [];
    let tcParams = [];
    let idx = 1;
    let tcIdx = 1;

    if (year) {
      historicalWhere.push(`EXTRACT(YEAR FROM appointment_date) = $${idx++}`);
      params.push(year);
      tcWhere.push(`EXTRACT(YEAR FROM a.start) = $${tcIdx++}`);
      tcParams.push(year);
    }
    if (sourceSystem && sourceSystem !== 'all') {
      if (sourceSystem === 'tutorcruncher') {
        // Only TC data
        historicalWhere = null;
      } else {
        historicalWhere.push(`source_system = $${idx++}`);
        params.push(sourceSystem);
        tcWhere = null; // Skip TC query
      }
    }

    const results = [];

    // Historical (MB + E4)
    if (historicalWhere) {
      const historicalResult = await client.query(`
        SELECT appointment_date::text AS day, COUNT(*)::int AS count
        FROM historical_appointments
        WHERE ${historicalWhere.join(' AND ')}
        GROUP BY 1
      `, params);
      results.push(...historicalResult.rows);
    }

    // Live TC
    if (tcWhere) {
      const tcResult = await client.query(`
        SELECT a.start::date::text AS day, COUNT(*)::int AS count
        FROM appointments a
        WHERE ${tcWhere.join(' AND ')}
        GROUP BY 1
      `, tcParams);
      results.push(...tcResult.rows);
    }

    // Merge days (historical + TC may overlap)
    const dayMap = {};
    for (const r of results) {
      dayMap[r.day] = (dayMap[r.day] || 0) + r.count;
    }
    const mergedDays = Object.entries(dayMap).map(([day, count]) => ({ day, count })).sort((a, b) => a.day.localeCompare(b.day));

    // Available years from both sources
    const years = await client.query(`
      SELECT DISTINCT yr FROM (
        SELECT EXTRACT(YEAR FROM appointment_date)::int AS yr
        FROM historical_appointments WHERE appointment_date IS NOT NULL AND status = 'completed'
        UNION
        SELECT EXTRACT(YEAR FROM start)::int AS yr
        FROM appointments WHERE status = 'complete' AND is_deleted IS NOT TRUE
      ) combined
      ORDER BY yr
    `);

    res.json({
      days: mergedDays,
      available_years: years.rows.map(r => r.yr),
    });
  } catch (error) {
    logger.error({ err: error }, 'Error fetching heatmap data');
    res.status(500).json({ error: 'Internal server error', details: error.message });
  } finally {
    client.release();
  }
}));

// ─── GET /leaderboard/tutors — Top tutors by completed lessons ────────────────

router.get('/leaderboard/tutors', asyncHandler(async (req, res) => {
  const pool = req.locationPool || global.pool;
  const client = await pool.connect();
  try {
    const limit = Math.min(100, parseInt(req.query.limit) || 50);

    // Use identity map to merge cross-era tutors by canonical_name
    const result = await client.query(`
      SELECT
        COALESCE(tim.canonical_name, hat.tutor_name) AS tutor_name,
        tim.tc_contractor_id,
        COUNT(DISTINCT ha.id)::int AS lessons,
        ROUND(SUM(COALESCE(ha.duration_hours, 0)), 1) AS hours,
        ROUND(SUM(COALESCE(ha.revenue, 0)), 2) AS revenue,
        MIN(ha.appointment_date)::text AS first_lesson,
        MAX(ha.appointment_date)::text AS last_lesson,
        array_agg(DISTINCT ha.source_system ORDER BY ha.source_system) AS eras,
        COUNT(DISTINCT TO_CHAR(ha.appointment_date, 'YYYY'))::int AS years_active
      FROM historical_appointment_tutors hat
      JOIN historical_appointments ha ON ha.id = hat.historical_appointment_id
      LEFT JOIN tutor_identity_map tim ON tim.source_tutor_name = hat.tutor_name AND tim.source_system = ha.source_system
      WHERE ha.status = 'completed' AND hat.tutor_name IS NOT NULL AND hat.tutor_name != ''
      GROUP BY COALESCE(tim.canonical_name, hat.tutor_name), tim.tc_contractor_id
      ORDER BY lessons DESC
      LIMIT $1
    `, [limit]);

    res.json({ tutors: result.rows });
  } catch (error) {
    logger.error({ err: error }, 'Error fetching tutor leaderboard');
    res.status(500).json({ error: 'Internal server error', details: error.message });
  } finally {
    client.release();
  }
}));

// ─── GET /leaderboard/clients — Top clients by lessons ───────────────────────

router.get('/leaderboard/clients', asyncHandler(async (req, res) => {
  const pool = req.locationPool || global.pool;
  const client = await pool.connect();
  try {
    const limit = Math.min(200, parseInt(req.query.limit) || 50);

    // Keywords that identify organizations (schools, clubs, venues, libraries, etc.)
    const orgKeywords = [
      'School', 'Academy', 'PS ', 'PS10', 'P.S.', 'Synagogue', 'Church', 'Temple',
      'Workshop', 'Library', 'Museum', 'Center', 'Centre', 'Club',
      'Bookshop', 'Owlets', 'Goddard', 'Montessori', 'Prep', 'Day Camp',
      'Y - ', 'YMCA', 'JCC', 'Community', 'Foundation', 'Institute',
      'Chess Club', 'Stories Bookshop', 'Smith Street',
      'Park Avenue', 'TriBeCa', 'Washington Market', 'Geneva',
      'Saint David', 'St. David', 'Chapin', 'Dalton', 'Brearley',
      'Collegiate', 'Riverdale', 'Horace Mann', 'Ethical Culture',
    ];

    // Test/fake names and internal entities to exclude from leaderboard
    const excludeNames = [
      'Baggins, Bilbo', 'Bilbo Baggins', 'Test', 'Demo',
      'Chess Club (UES)', 'Park Slope Chess Club',
    ];

    // Pull from all eras: MindBody + E4 (historical_appointments) and TutorCruncher (appointments)
    const result = await client.query(`
      WITH historical AS (
        SELECT
          hac.client_name,
          ha.id::text AS lesson_id,
          COALESCE(ha.revenue, 0) AS revenue,
          ha.appointment_date,
          ha.source_system
        FROM historical_appointment_clients hac
        JOIN historical_appointments ha ON ha.id = hac.historical_appointment_id
        WHERE ha.status = 'completed'
          AND hac.client_name IS NOT NULL AND hac.client_name != ''
      ),
      tc AS (
        SELECT
          COALESCE(
            c.first_name || ' ' || c.last_name,
            ar.paying_client_name
          ) AS client_name,
          a.appointment_id::text AS lesson_id,
          COALESCE(ar.charge_rate * COALESCE(a.units, 1), 0) AS revenue,
          a.start::date AS appointment_date,
          'tutorcruncher' AS source_system
        FROM appointments a
        JOIN appointment_recipients ar ON a.appointment_id = ar.appointment_id
        LEFT JOIN clients c ON c.client_id::text = ar.paying_client_id::text
        WHERE a.status IN ('complete', 'cancelled-chargeable')
          AND a.is_deleted IS NOT TRUE
          AND ar.paying_client_id IS NOT NULL
      ),
      combined AS (
        SELECT * FROM historical
        UNION ALL
        SELECT * FROM tc
      )
      SELECT
        client_name,
        COUNT(DISTINCT lesson_id)::int AS lessons,
        ROUND(SUM(revenue), 2) AS revenue,
        MIN(appointment_date)::text AS first_lesson,
        MAX(appointment_date)::text AS last_lesson,
        array_agg(DISTINCT source_system ORDER BY source_system) AS eras,
        COUNT(DISTINCT TO_CHAR(appointment_date, 'YYYY'))::int AS years_active
      FROM combined
      WHERE client_name IS NOT NULL AND client_name != ''
      GROUP BY client_name
      ORDER BY lessons DESC
      LIMIT $1
    `, [limit]);

    // Classify each client as 'family' or 'organization'
    const classified = result.rows
      .filter(r => !excludeNames.some(ex => r.client_name.toLowerCase().includes(ex.toLowerCase())))
      .map(r => {
        const name = r.client_name;
        const isOrg = orgKeywords.some(kw => name.includes(kw));
        return { ...r, client_type: isOrg ? 'organization' : 'family' };
      });

    res.json({ clients: classified });
  } catch (error) {
    logger.error({ err: error }, 'Error fetching client leaderboard');
    res.status(500).json({ error: 'Internal server error', details: error.message });
  } finally {
    client.release();
  }
}));

// ─── GET /leaderboard/locations — Markets ranked by GGHS ─────────────────────

router.get('/leaderboard/locations', asyncHandler(async (req, res) => {
  const pool = req.locationPool || global.pool;
  const client = await pool.connect();
  try {
    const result = await client.query(`
      SELECT
        location_category,
        COUNT(*)::int AS lessons,
        ROUND(SUM(COALESCE(revenue, 0)), 2) AS revenue,
        ROUND(SUM(COALESCE(duration_hours, 0)), 1) AS hours,
        MIN(appointment_date)::text AS first_lesson,
        MAX(appointment_date)::text AS last_lesson,
        COUNT(DISTINCT TO_CHAR(appointment_date, 'YYYY-MM'))::int AS active_months,
        ROUND(COUNT(*)::numeric / NULLIF(COUNT(DISTINCT TO_CHAR(appointment_date, 'YYYY-MM')), 0), 1) AS lessons_per_month
      FROM historical_appointments
      WHERE status = 'completed' AND location_category IS NOT NULL
      GROUP BY location_category
      ORDER BY lessons DESC
    `);

    res.json({ locations: result.rows });
  } catch (error) {
    logger.error({ err: error }, 'Error fetching location leaderboard');
    res.status(500).json({ error: 'Internal server error', details: error.message });
  } finally {
    client.release();
  }
}));

// ─── GET /achievements — Auto-calculated fun records ─────────────────────────

router.get('/achievements', asyncHandler(async (req, res) => {
  const pool = req.locationPool || global.pool;
  const client = await pool.connect();
  try {
    const [busiestDay, busiestMonth, longestTutor, mostConsistentClient, busiestWeek] = await Promise.all([
      // Busiest single day
      client.query(`
        SELECT appointment_date::text AS day, COUNT(*)::int AS lessons
        FROM historical_appointments WHERE status = 'completed'
        GROUP BY 1 ORDER BY 2 DESC LIMIT 1
      `),
      // Busiest month
      client.query(`
        SELECT TO_CHAR(appointment_date, 'YYYY-MM') AS month, COUNT(*)::int AS lessons
        FROM historical_appointments WHERE status = 'completed'
        GROUP BY 1 ORDER BY 2 DESC LIMIT 1
      `),
      // Longest-tenured tutor
      client.query(`
        SELECT hat.tutor_name,
          COUNT(DISTINCT ha.id)::int AS lessons,
          MIN(ha.appointment_date)::text AS first_lesson,
          MAX(ha.appointment_date)::text AS last_lesson,
          (MAX(ha.appointment_date) - MIN(ha.appointment_date))::int AS days_span
        FROM historical_appointment_tutors hat
        JOIN historical_appointments ha ON ha.id = hat.historical_appointment_id
        WHERE ha.status = 'completed' AND hat.tutor_name IS NOT NULL
        GROUP BY hat.tutor_name
        HAVING COUNT(DISTINCT ha.id) >= 100
        ORDER BY days_span DESC LIMIT 1
      `),
      // Most consistent client (most distinct months with lessons)
      client.query(`
        SELECT hac.client_name,
          COUNT(DISTINCT ha.id)::int AS lessons,
          COUNT(DISTINCT TO_CHAR(ha.appointment_date, 'YYYY-MM'))::int AS active_months,
          MIN(ha.appointment_date)::text AS first_lesson,
          MAX(ha.appointment_date)::text AS last_lesson
        FROM historical_appointment_clients hac
        JOIN historical_appointments ha ON ha.id = hac.historical_appointment_id
        WHERE ha.status = 'completed' AND hac.client_name IS NOT NULL
        GROUP BY hac.client_name
        HAVING COUNT(DISTINCT ha.id) >= 50
        ORDER BY active_months DESC LIMIT 1
      `),
      // Busiest week
      client.query(`
        SELECT DATE_TRUNC('week', appointment_date)::date::text AS week_start,
          COUNT(*)::int AS lessons
        FROM historical_appointments WHERE status = 'completed'
        GROUP BY 1 ORDER BY 2 DESC LIMIT 1
      `),
    ]);

    const achievements = [];

    if (busiestDay.rows[0]) {
      achievements.push({
        icon: "fire",
        title: "Most Lessons in a Single Day",
        value: `${busiestDay.rows[0].lessons.toLocaleString()} lessons`,
        detail: busiestDay.rows[0].day,
      });
    }
    if (busiestMonth.rows[0]) {
      achievements.push({
        icon: "calendar",
        title: "Busiest Month Ever",
        value: `${busiestMonth.rows[0].lessons.toLocaleString()} lessons`,
        detail: busiestMonth.rows[0].month,
      });
    }
    if (busiestWeek.rows[0]) {
      achievements.push({
        icon: "chart",
        title: "Busiest Week Ever",
        value: `${busiestWeek.rows[0].lessons.toLocaleString()} lessons`,
        detail: `Week of ${busiestWeek.rows[0].week_start}`,
      });
    }
    if (longestTutor.rows[0]) {
      const t = longestTutor.rows[0];
      const years = Math.round(t.days_span / 365 * 10) / 10;
      achievements.push({
        icon: "star",
        title: "Longest-Tenured Tutor",
        value: `${t.tutor_name}`,
        detail: `${years} years, ${t.lessons.toLocaleString()} lessons`,
      });
    }
    if (mostConsistentClient.rows[0]) {
      const c = mostConsistentClient.rows[0];
      achievements.push({
        icon: "heart",
        title: "Most Consistent Family",
        value: `${c.client_name}`,
        detail: `${c.active_months} months of lessons, ${c.lessons.toLocaleString()} total`,
      });
    }

    res.json({ achievements });
  } catch (error) {
    logger.error({ err: error }, 'Error fetching achievements');
    res.status(500).json({ error: 'Internal server error', details: error.message });
  } finally {
    client.release();
  }
}));

module.exports = router;
