const { getOrSet } = require('../utils/cache');

/**
 * Dashboard Feed Service
 * Provides real-time activity feed, today's lessons, revenue stats,
 * recent bookings, needs-attention items, tutor leaderboard, and new clients.
 */

async function getActivityFeed(pool, limit = 15) {
  // Pull recent events from multiple sources via UNION ALL
  const query = `
    (
      SELECT
        'lesson_completed' AS event_type,
        a.appointment_id AS entity_id,
        COALESCE(a.topic, 'Lesson #' || a.appointment_id) AS title,
        'Lesson completed' AS description,
        a.updated_at AS event_time
      FROM appointments a
      WHERE a.status IN ('complete', 'completed')
        AND a.is_deleted = FALSE
        AND a.updated_at > NOW() - INTERVAL '7 days'
      ORDER BY a.updated_at DESC
      LIMIT 10
    )
    UNION ALL
    (
      SELECT
        'booking_submitted' AS event_type,
        be.id AS entity_id,
        COALESCE(be.session_id, 'Booking') AS title,
        'Booking form ' || be.event_type AS description,
        be.created_at AS event_time
      FROM booking_form_events be
      WHERE be.event_type IN ('payment_completed', 'form_start')
        AND be.created_at > NOW() - INTERVAL '7 days'
      ORDER BY be.created_at DESC
      LIMIT 10
    )
    UNION ALL
    (
      SELECT
        'invoice_paid' AS event_type,
        i.id AS entity_id,
        COALESCE(i.display_id::text, i.id::text) AS title,
        'Invoice paid — $' || COALESCE(i.gross::text, '0') AS description,
        i.date_paid AS event_time
      FROM invoices i
      WHERE i.status = 'paid'
        AND i.date_paid > NOW() - INTERVAL '7 days'
      ORDER BY i.date_paid DESC
      LIMIT 10
    )
    UNION ALL
    (
      SELECT
        'client_created' AS event_type,
        c.client_id::int AS entity_id,
        COALESCE(c.first_name, '') || ' ' || COALESCE(c.last_name, '') AS title,
        'New client registered' AS description,
        c.created_at AS event_time
      FROM clients c
      WHERE c.created_at > NOW() - INTERVAL '7 days'
      ORDER BY c.created_at DESC
      LIMIT 10
    )
    UNION ALL
    (
      SELECT
        'payment_sent' AS event_type,
        po.id AS entity_id,
        COALESCE(po.payee_first, '') || ' ' || COALESCE(po.payee_last, '') AS title,
        'Payment sent — $' || COALESCE(po.amount::text, '0') AS description,
        po.date_sent AS event_time
      FROM payment_orders po
      WHERE po.status = 'paid'
        AND po.date_sent > NOW() - INTERVAL '7 days'
      ORDER BY po.date_sent DESC
      LIMIT 10
    )
    ORDER BY event_time DESC NULLS LAST
    LIMIT $1
  `;
  const { rows } = await pool.query(query, [limit]);
  return rows;
}

async function getTodaysLessons(pool) {
  return getOrSet('dashboard:todays-lessons', async () => {
    const [{ rows: summary }, { rows: upcoming }] = await Promise.all([
      pool.query(`
        SELECT
          COUNT(*)::int AS total,
          COUNT(*) FILTER (WHERE status IN ('complete', 'completed'))::int AS completed,
          COUNT(*) FILTER (WHERE status = 'cancelled')::int AS cancelled,
          COUNT(*) FILTER (WHERE status NOT IN ('complete', 'completed', 'cancelled'))::int AS pending
        FROM appointments
        WHERE start::date = CURRENT_DATE
          AND is_deleted = FALSE
      `),
      pool.query(`
        SELECT
          a.appointment_id,
          a.topic,
          a.start,
          a.finish,
          a.status,
          ac.contractor_name AS tutor_name,
          ar.paying_client_name AS client_name
        FROM appointments a
        LEFT JOIN appointment_contractors ac ON ac.appointment_id = a.appointment_id
        LEFT JOIN (
          SELECT DISTINCT ON (appointment_id) appointment_id, paying_client_name
          FROM appointment_recipients
        ) ar ON ar.appointment_id = a.appointment_id
        WHERE a.start::date = CURRENT_DATE
          AND a.is_deleted = FALSE
          AND a.status NOT IN ('complete', 'completed', 'cancelled')
        ORDER BY a.start ASC
        LIMIT 8
      `),
    ]);

    return {
      ...summary[0],
      upcoming,
    };
  }, 120);
}

async function getRevenueThisWeek(pool) {
  return getOrSet('dashboard:revenue-week', async () => {
    const { rows } = await pool.query(`
      SELECT
        COALESCE(SUM(gross), 0)::numeric AS total_invoiced,
        COALESCE(SUM(CASE WHEN status = 'paid' THEN gross ELSE 0 END), 0)::numeric AS total_collected,
        COUNT(*)::int AS invoice_count,
        COUNT(*) FILTER (WHERE status = 'paid')::int AS paid_count
      FROM invoices
      WHERE date_sent >= date_trunc('week', CURRENT_DATE)
        AND date_sent < date_trunc('week', CURRENT_DATE) + INTERVAL '7 days'
    `);
    return rows[0];
  }, 300);
}

async function getNeedsAttention(pool) {
  return getOrSet('dashboard:needs-attention', async () => {
    const [overdueInvoices, failedPayments, unpaired] = await Promise.all([
      pool.query(`
        SELECT COUNT(*)::int AS count,
               COALESCE(SUM(gross), 0)::numeric AS total
        FROM invoices
        WHERE status NOT IN ('paid', 'void', 'deleted')
          AND date_sent < NOW() - INTERVAL '30 days'
      `),
      pool.query(`
        SELECT COUNT(*)::int AS count
        FROM payment_orders
        WHERE status NOT IN ('paid', 'void')
          AND date_sent < NOW() - INTERVAL '14 days'
      `),
      pool.query(`
        SELECT COUNT(*)::int AS count
        FROM clients
        WHERE status = 'prospect'
          AND created_at < NOW() - INTERVAL '7 days'
          AND (pipeline_stage_name IS NULL OR pipeline_stage_name = '')
      `),
    ]);

    const items = [];
    if (overdueInvoices.rows[0].count > 0) {
      items.push({
        type: 'overdue_invoices',
        label: 'Overdue Invoices (30+ days)',
        count: overdueInvoices.rows[0].count,
        detail: `$${parseFloat(overdueInvoices.rows[0].total).toLocaleString()}`,
        severity: 'error',
        link: '/admin/accounting',
      });
    }
    if (failedPayments.rows[0].count > 0) {
      items.push({
        type: 'failed_payments',
        label: 'Stale Payment Orders',
        count: failedPayments.rows[0].count,
        severity: 'warning',
        link: '/admin/accounting',
      });
    }
    if (unpaired.rows[0].count > 0) {
      items.push({
        type: 'unpaired_prospects',
        label: 'Prospects Without Pipeline Stage',
        count: unpaired.rows[0].count,
        severity: 'info',
        link: '/pipeline/cct?reset=prospects',
      });
    }
    return items;
  }, 300);
}

async function getTutorLeaderboard(pool) {
  return getOrSet('dashboard:tutor-leaderboard', async () => {
    const { rows } = await pool.query(`
      SELECT
        ac.contractor_name AS tutor_name,
        ac.contractor_id,
        COUNT(*)::int AS lessons_today
      FROM appointment_contractors ac
      JOIN appointments a ON a.appointment_id = ac.appointment_id
      WHERE a.start::date = CURRENT_DATE
        AND a.is_deleted = FALSE
        AND a.status IN ('complete', 'completed', 'planned', 'awaiting-report')
      GROUP BY ac.contractor_name, ac.contractor_id
      ORDER BY lessons_today DESC
      LIMIT 5
    `);
    return rows;
  }, 300);
}

async function getNewClientsThisWeek(pool) {
  return getOrSet('dashboard:new-clients-week', async () => {
    const { rows } = await pool.query(`
      SELECT
        client_id,
        COALESCE(first_name, '') || ' ' || COALESCE(last_name, '') AS name,
        created_at
      FROM clients
      WHERE created_at >= date_trunc('week', CURRENT_DATE)
      ORDER BY created_at DESC
      LIMIT 10
    `);
    const { rows: countRows } = await pool.query(`
      SELECT COUNT(*)::int AS count
      FROM clients
      WHERE created_at >= date_trunc('week', CURRENT_DATE)
    `);
    return {
      count: countRows[0].count,
      clients: rows,
    };
  }, 300);
}

async function getDashboardFeed(pool) {
  const [activityFeed, todaysLessons, revenue, needsAttention, tutorLeaderboard, newClients] = await Promise.all([
    getActivityFeed(pool),
    getTodaysLessons(pool),
    getRevenueThisWeek(pool),
    getNeedsAttention(pool),
    getTutorLeaderboard(pool),
    getNewClientsThisWeek(pool),
  ]);

  return {
    activityFeed,
    todaysLessons,
    revenue,
    needsAttention,
    tutorLeaderboard,
    newClients,
  };
}

module.exports = {
  getDashboardFeed,
  getActivityFeed,
  getTodaysLessons,
  getRevenueThisWeek,
  getNeedsAttention,
  getTutorLeaderboard,
  getNewClientsThisWeek,
};
