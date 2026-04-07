const logger = require('../utils/logger');

const VALID_CANCELLED_BY = ['client', 'tutor', 'admin'];
const VALID_REASONS = ['rescheduled', 'no_show', 'sick', 'schedule_conflict', 'weather', 'other'];

/**
 * Main lessons query with JOINs, filtering, pagination, and tab counts.
 */
async function getLessons(pool, filters = {}) {
  const {
    search,
    status,
    cancelled_by,
    cancellation_reason,
    tutor_id,
    client_name,
    start_date,
    end_date,
    tab = 'upcoming',
    page = 1,
    limit = 50,
  } = filters;

  const params = [];
  const whereClauses = [];
  let paramIdx = 0;

  const nextParam = (val) => {
    paramIdx++;
    params.push(val);
    return `$${paramIdx}`;
  };

  // Tab-based status filter
  if (tab === 'upcoming') {
    whereClauses.push(`a.status = 'planned' AND a.start >= NOW()`);
  } else if (tab === 'completed') {
    whereClauses.push(`a.status IN ('complete', 'cancelled-chargeable')`);
  } else if (tab === 'cancelled') {
    whereClauses.push(`a.status = 'cancelled'`);
  }
  // 'all' — no status filter

  // Optional filters
  if (status) {
    whereClauses.push(`a.status = ${nextParam(status)}`);
  }
  if (cancelled_by) {
    if (cancelled_by === 'unknown') {
      whereClauses.push(`(a.cancelled_by IS NULL OR a.cancelled_by = 'unknown')`);
    } else {
      whereClauses.push(`a.cancelled_by = ${nextParam(cancelled_by)}`);
    }
  }
  if (cancellation_reason) {
    whereClauses.push(`a.cancellation_reason = ${nextParam(cancellation_reason)}`);
  }
  if (tutor_id) {
    whereClauses.push(`ac.contractor_id = ${nextParam(parseInt(tutor_id, 10))}`);
  }
  if (client_name) {
    whereClauses.push(`ar_agg.paying_clients ILIKE ${nextParam(`%${client_name}%`)}`);
  }
  if (start_date) {
    whereClauses.push(`a.start >= ${nextParam(start_date)}`);
  }
  if (end_date) {
    whereClauses.push(`a.start <= ${nextParam(end_date)}`);
  }
  if (search) {
    const searchParam = nextParam(`%${search}%`);
    whereClauses.push(`(
      a.topic ILIKE ${searchParam}
      OR s.name ILIKE ${searchParam}
      OR ar_agg.paying_clients ILIKE ${searchParam}
      OR ar_agg.recipients ILIKE ${searchParam}
    )`);
  }

  const whereSQL = whereClauses.length > 0
    ? `WHERE ${whereClauses.join(' AND ')}`
    : '';

  const orderBy = tab === 'upcoming'
    ? 'ORDER BY a.start ASC'
    : 'ORDER BY a.start DESC';

  const offsetVal = (Math.max(1, parseInt(page, 10)) - 1) * parseInt(limit, 10);

  // CTE for aggregated recipients (deduplicate paying_client_name, comma-join recipient_name)
  const baseQuery = `
    WITH ar_agg AS (
      SELECT
        ar.appointment_id,
        STRING_AGG(DISTINCT ar.paying_client_name, ', ') AS paying_clients,
        STRING_AGG(DISTINCT ar.recipient_name, ', ') AS recipients,
        STRING_AGG(DISTINCT ar.paying_client_id::TEXT, ',') AS paying_client_ids
      FROM appointment_recipients ar
      GROUP BY ar.appointment_id
    )
  `;

  // Count query for pagination
  const countSQL = `
    ${baseQuery}
    SELECT COUNT(*) AS total
    FROM appointments a
    LEFT JOIN ar_agg ON ar_agg.appointment_id = a.appointment_id
    LEFT JOIN appointment_contractors ac ON ac.appointment_id = a.appointment_id
    LEFT JOIN contractors c ON c.contractor_id = ac.contractor_id
    LEFT JOIN services s ON s.service_id = a.service_id
    ${whereSQL}
  `;

  // Tab counts query (same joins/filters minus the tab filter)
  const tabCountFilterClauses = whereClauses.filter(c =>
    !c.includes("a.status") && !c.includes("a.start >= NOW()")
  );
  const tabCountWhere = tabCountFilterClauses.length > 0
    ? `WHERE ${tabCountFilterClauses.join(' AND ')}`
    : '';

  // We need separate params for the tab count query — only include params that aren't from tab filters
  // Since tab filters use no params (hardcoded values), we can reuse the same params array
  const tabCountSQL = `
    ${baseQuery}
    SELECT
      COUNT(*) FILTER (WHERE a.status = 'planned' AND a.start >= NOW()) AS upcoming,
      COUNT(*) FILTER (WHERE a.status IN ('complete', 'cancelled-chargeable')) AS completed,
      COUNT(*) FILTER (WHERE a.status = 'cancelled') AS cancelled,
      COUNT(*) AS all_count
    FROM appointments a
    LEFT JOIN ar_agg ON ar_agg.appointment_id = a.appointment_id
    LEFT JOIN appointment_contractors ac ON ac.appointment_id = a.appointment_id
    LEFT JOIN contractors c ON c.contractor_id = ac.contractor_id
    LEFT JOIN services s ON s.service_id = a.service_id
    ${tabCountWhere}
  `;

  // Data query
  const dataSQL = `
    ${baseQuery}
    SELECT
      a.appointment_id,
      a.topic,
      a.start,
      a.finish,
      a.status,
      a.service_id,
      a.cancelled_by,
      a.cancellation_reason,
      a.cancellation_note,
      a.cancelled_at,
      s.name AS service_name,
      s.labels AS service_labels,
      ar_agg.paying_clients,
      ar_agg.recipients,
      ar_agg.paying_client_ids,
      c.contractor_id AS tutor_id,
      CONCAT(c.first_name, ' ', c.last_name) AS tutor_name
    FROM appointments a
    LEFT JOIN ar_agg ON ar_agg.appointment_id = a.appointment_id
    LEFT JOIN appointment_contractors ac ON ac.appointment_id = a.appointment_id
    LEFT JOIN contractors c ON c.contractor_id = ac.contractor_id
    LEFT JOIN services s ON s.service_id = a.service_id
    ${whereSQL}
    ${orderBy}
    LIMIT ${parseInt(limit, 10)} OFFSET ${offsetVal}
  `;

  const [countResult, tabCountResult, dataResult] = await Promise.all([
    pool.query(countSQL, params),
    pool.query(tabCountSQL, params),
    pool.query(dataSQL, params),
  ]);

  const total = parseInt(countResult.rows[0].total, 10);
  const parsedLimit = parseInt(limit, 10);
  const tabRow = tabCountResult.rows[0];

  return {
    lessons: dataResult.rows,
    pagination: {
      page: parseInt(page, 10),
      limit: parsedLimit,
      total,
      totalPages: Math.ceil(total / parsedLimit),
    },
    tabCounts: {
      upcoming: parseInt(tabRow.upcoming, 10),
      completed: parseInt(tabRow.completed, 10),
      cancelled: parseInt(tabRow.cancelled, 10),
      all: parseInt(tabRow.all_count, 10),
    },
  };
}

/**
 * Aggregated cancellation analytics for a date range.
 */
async function getCancellationReport(pool, filters = {}) {
  const now = new Date();
  const threeMonthsAgo = new Date(now);
  threeMonthsAgo.setMonth(threeMonthsAgo.getMonth() - 3);

  const startDate = filters.start_date || threeMonthsAgo.toISOString();
  const endDate = filters.end_date || now.toISOString();

  const summarySQL = `
    WITH lesson_counts AS (
      SELECT
        COUNT(*) FILTER (WHERE status IN ('complete', 'cancelled-chargeable')) AS completed,
        COUNT(*) FILTER (WHERE status = 'cancelled') AS cancelled,
        COUNT(*) FILTER (WHERE status = 'cancelled' AND cancelled_by = 'client') AS client_caused,
        COUNT(*) FILTER (WHERE status = 'cancelled' AND cancelled_by = 'tutor') AS tutor_caused,
        COUNT(*) FILTER (WHERE status = 'cancelled' AND cancelled_by = 'admin') AS admin_caused,
        COUNT(*) FILTER (WHERE status = 'cancelled' AND (cancelled_by IS NULL OR cancelled_by = 'unknown')) AS untagged
      FROM appointments
      WHERE start >= $1 AND start <= $2
    )
    SELECT
      completed,
      cancelled AS total_cancelled,
      client_caused,
      tutor_caused,
      admin_caused,
      untagged,
      CASE WHEN (completed + cancelled) > 0
        THEN ROUND(cancelled::NUMERIC / (completed + cancelled) * 100, 1)
        ELSE 0
      END AS cancellation_rate
    FROM lesson_counts
  `;

  const topClientSQL = `
    WITH client_lessons AS (
      SELECT
        ar.paying_client_name AS name,
        ar.paying_client_id AS client_id,
        COUNT(*) AS total_lessons,
        COUNT(*) FILTER (WHERE a.status = 'cancelled') AS total_cancelled,
        MODE() WITHIN GROUP (ORDER BY a.cancellation_reason) FILTER (WHERE a.status = 'cancelled' AND a.cancellation_reason IS NOT NULL) AS most_common_reason,
        MAX(a.cancelled_at) FILTER (WHERE a.status = 'cancelled') AS last_cancelled
      FROM appointments a
      JOIN appointment_recipients ar ON ar.appointment_id = a.appointment_id
      WHERE a.start >= $1 AND a.start <= $2
      GROUP BY ar.paying_client_name, ar.paying_client_id
      HAVING COUNT(*) FILTER (WHERE a.status = 'cancelled') > 0
    )
    SELECT
      name,
      client_id,
      total_cancelled,
      ROUND(total_cancelled::NUMERIC / NULLIF(total_lessons, 0) * 100, 1) AS percent_of_lessons,
      most_common_reason,
      last_cancelled
    FROM client_lessons
    ORDER BY total_cancelled DESC
    LIMIT 20
  `;

  const topTutorSQL = `
    WITH tutor_lessons AS (
      SELECT
        CONCAT(c.first_name, ' ', c.last_name) AS name,
        c.contractor_id,
        COUNT(*) AS total_lessons,
        COUNT(*) FILTER (WHERE a.status = 'cancelled') AS total_cancelled,
        MODE() WITHIN GROUP (ORDER BY a.cancellation_reason) FILTER (WHERE a.status = 'cancelled' AND a.cancellation_reason IS NOT NULL) AS most_common_reason,
        MAX(a.cancelled_at) FILTER (WHERE a.status = 'cancelled') AS last_cancelled
      FROM appointments a
      JOIN appointment_contractors ac ON ac.appointment_id = a.appointment_id
      JOIN contractors c ON c.contractor_id = ac.contractor_id
      WHERE a.start >= $1 AND a.start <= $2
      GROUP BY c.first_name, c.last_name, c.contractor_id
      HAVING COUNT(*) FILTER (WHERE a.status = 'cancelled') > 0
    )
    SELECT
      name,
      contractor_id,
      total_cancelled,
      ROUND(total_cancelled::NUMERIC / NULLIF(total_lessons, 0) * 100, 1) AS percent_of_lessons,
      most_common_reason,
      last_cancelled
    FROM tutor_lessons
    ORDER BY total_cancelled DESC
    LIMIT 20
  `;

  const dateParams = [startDate, endDate];

  const [summaryResult, clientResult, tutorResult] = await Promise.all([
    pool.query(summarySQL, dateParams),
    pool.query(topClientSQL, dateParams),
    pool.query(topTutorSQL, dateParams),
  ]);

  const s = summaryResult.rows[0];

  return {
    summary: {
      totalCancelled: parseInt(s.total_cancelled, 10),
      cancellationRate: parseFloat(s.cancellation_rate),
      clientCaused: parseInt(s.client_caused, 10),
      tutorCaused: parseInt(s.tutor_caused, 10),
      adminCaused: parseInt(s.admin_caused, 10),
      untagged: parseInt(s.untagged, 10),
    },
    topCancellersByClient: clientResult.rows.map(r => ({
      name: r.name,
      client_id: r.client_id,
      totalCancelled: parseInt(r.total_cancelled, 10),
      percentOfLessons: parseFloat(r.percent_of_lessons),
      mostCommonReason: r.most_common_reason,
      lastCancelled: r.last_cancelled,
    })),
    topCancellersByTutor: tutorResult.rows.map(r => ({
      name: r.name,
      contractor_id: r.contractor_id,
      totalCancelled: parseInt(r.total_cancelled, 10),
      percentOfLessons: parseFloat(r.percent_of_lessons),
      mostCommonReason: r.most_common_reason,
      lastCancelled: r.last_cancelled,
    })),
  };
}

/**
 * Tag a cancelled appointment with cancellation metadata.
 */
async function tagCancellation(pool, appointmentId, { cancelledBy, reason, note }) {
  if (!VALID_CANCELLED_BY.includes(cancelledBy)) {
    const err = new Error(`Invalid cancelled_by value. Must be one of: ${VALID_CANCELLED_BY.join(', ')}`);
    err.statusCode = 400;
    throw err;
  }

  if (reason && !VALID_REASONS.includes(reason)) {
    const err = new Error(`Invalid reason value. Must be one of: ${VALID_REASONS.join(', ')}`);
    err.statusCode = 400;
    throw err;
  }

  // Verify appointment exists and is cancelled
  const check = await pool.query(
    `SELECT appointment_id, status FROM appointments WHERE appointment_id = $1`,
    [appointmentId]
  );

  if (check.rows.length === 0) {
    const err = new Error('Appointment not found');
    err.statusCode = 404;
    throw err;
  }

  const appt = check.rows[0];
  if (!['cancelled', 'cancelled-chargeable'].includes(appt.status)) {
    const err = new Error('Only cancelled appointments can be tagged with cancellation details');
    err.statusCode = 400;
    throw err;
  }

  const result = await pool.query(
    `UPDATE appointments
     SET cancelled_by = $1,
         cancellation_reason = $2,
         cancellation_note = $3,
         cancelled_at = NOW()
     WHERE appointment_id = $4
     RETURNING *`,
    [cancelledBy, reason || null, note || null, appointmentId]
  );

  logger.info({ appointmentId, cancelledBy, reason }, 'Cancellation tagged');

  return result.rows[0];
}

module.exports = {
  getLessons,
  getCancellationReport,
  tagCancellation,
};
