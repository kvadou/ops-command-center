const monthNames = [
  "jan",
  "feb",
  "mar",
  "apr",
  "may",
  "jun",
  "jul",
  "aug",
  "sep",
  "oct",
  "nov",
  "dec",
];

function initMonths() {
  return monthNames.reduce((acc, m) => {
    acc[m] = 0;
    return acc;
  }, {});
}

function rollup(rows) {
  const months = initMonths();
  rows.forEach((r) => {
    months[monthNames[r.month - 1]] = parseFloat(r.value);
  });
  const ytd = Object.values(months).reduce((sum, v) => sum + v, 0);

  return {
    ytd,
    months,
    detailRows: rows,
  };
}

// Helper: check if a column exists on a table (delegates to cached schema utility)
const { columnExists } = require('./utils/schema-cache');
const { logger } = require('./utils/logger');

async function getLessonsReport(client, year, tab = 'all', labelGroups = {}) {
  let tabFilter = '';
  let params = [year];
  
  if (tab !== 'all' && labelGroups[tab]) {
    const patterns = labelGroups[tab].map(s => s.toLowerCase());
    const conditions = patterns.map((_, idx) => {
      params.push(`%${patterns[idx]}%`);
      return `lbl.value ILIKE $${params.length}`;
    });
    tabFilter = `AND EXISTS (
      SELECT 1 FROM jsonb_array_elements_text(COALESCE(s.labels, '[]'::jsonb)) AS lbl(value)
      WHERE ${conditions.join(' OR ')}
    )`;
  }

  const { rows } = await client.query(
    `
      SELECT
        EXTRACT(MONTH FROM a.start)::int AS month,
        COUNT(*)::int                     AS value
      FROM appointments a
      JOIN services s
        ON a.service_id = s.service_id
      WHERE a.status IN ('complete','cancelled-chargeable')
        AND EXTRACT(YEAR FROM a.start) = $1
        -- exclude any service labeled Non‑teaching or Support
        AND EXISTS (
          SELECT 1
          FROM jsonb_array_elements_text(COALESCE(s.labels, '[]'::jsonb)) AS lbl2
          WHERE lbl2 NOT ILIKE '%Non teaching%' 
            AND lbl2 NOT ILIKE '%First Lesson Complete%' 
            AND lbl2 NOT ILIKE '%Sync to Website%' 
            AND lbl2 NOT ILIKE '%Job Finished%'
        )
        ${tabFilter}
      GROUP BY month
      ORDER BY month
    `,
    params
  );
  return rollup(rows);
}

async function getLessonHoursReport(client, year, tab = 'all', labelGroups = {}) {
  let tabFilter = '';
  let params = [year];
  
  if (tab !== 'all' && labelGroups[tab]) {
    const patterns = labelGroups[tab].map(s => s.toLowerCase());
    const conditions = patterns.map((_, idx) => {
      params.push(`%${patterns[idx]}%`);
      return `lbl.value ILIKE $${params.length}`;
    });
    tabFilter = `AND (${conditions.join(' OR ')})`;
  }

  const { rows } = await client.query(
    `
      SELECT
        EXTRACT(MONTH FROM a.start)::int   AS month,
        ROUND(SUM(a.units)::numeric, 2)     AS value
      FROM appointments a
      JOIN services s
        ON a.service_id = s.service_id
      CROSS JOIN LATERAL jsonb_array_elements_text(COALESCE(s.labels, '[]'::jsonb)) AS lbl
      WHERE a.status IN ('complete','cancelled-chargeable')
        AND EXTRACT(YEAR FROM a.start) = $1
        -- exclude any service labeled Non‑teaching or Support
        AND EXISTS (
          SELECT 1
          FROM jsonb_array_elements_text(COALESCE(s.labels, '[]'::jsonb)) AS lbl2
          WHERE lbl2 NOT ILIKE '%Non teaching%' 
            AND lbl2 NOT ILIKE '%First Lesson Complete%' 
            AND lbl2 NOT ILIKE '%Sync to Website%' 
            AND lbl2 NOT ILIKE '%Job Finished%'
        )
        ${tabFilter}
      GROUP BY month
      ORDER BY month
    `,
    params
  );
  return rollup(rows);
}

async function getStudentsReport(client, year, tab = 'all', labelGroups = {}) {
  let tabFilter = '';
  let params = [year];
  
  if (tab !== 'all' && labelGroups[tab]) {
    const patterns = labelGroups[tab].map(s => s.toLowerCase());
    const conditions = patterns.map((_, idx) => {
      params.push(`%${patterns[idx]}%`);
      return `lbl.value ILIKE $${params.length}`;
    });
    tabFilter = `AND (${conditions.join(' OR ')})`;
  }

  const { rows } = await client.query(
    `
      SELECT
        EXTRACT(MONTH FROM a.start)::int AS month,
        COUNT(ar.recipient_id)::int      AS value
      FROM appointments a
      JOIN appointment_recipients ar
        ON a.appointment_id = ar.appointment_id
      JOIN services s
        ON a.service_id = s.service_id
      CROSS JOIN LATERAL jsonb_array_elements_text(COALESCE(s.labels, '[]'::jsonb)) AS lbl
      WHERE a.status IN ('complete','cancelled-chargeable')
        -- only this year
        AND EXTRACT(YEAR FROM a.start) = $1
        -- exclude any service labeled Non-teaching or Support
        AND EXISTS (
          SELECT 1
          FROM jsonb_array_elements_text(COALESCE(s.labels, '[]'::jsonb)) AS lbl2
          WHERE lbl2 NOT ILIKE '%Non teaching%'
            AND lbl2 NOT ILIKE '%First Lesson Complete%'
            AND lbl2 NOT ILIKE '%Sync to Website%'
            AND lbl2 NOT ILIKE '%Job Finished%'
        )
        ${tabFilter}
      GROUP BY month
      ORDER BY month
    `,
    params
  );

  return rollup(rows);
}

async function getRevenueByLabel(client, start, end) {
  const monthNames = [
    "jan",
    "feb",
    "mar",
    "apr",
    "may",
    "jun",
    "jul",
    "aug",
    "sep",
    "oct",
    "nov",
    "dec",
  ];

  const initMonths = () =>
    monthNames.reduce((acc, m) => {
      acc[m] = 0;
      return acc;
    }, {});

  const { rows } = await client.query(
    `
    WITH all_labels AS (
      SELECT DISTINCT
        COALESCE(label.value, 'Unknown') AS label
      FROM services s
      LEFT JOIN LATERAL (
        SELECT TRIM(value) AS value
        FROM jsonb_array_elements_text(COALESCE(s.labels, '[]'::jsonb)) AS lbl(value)
        WHERE value NOT ILIKE '%Non teaching%'
          
          AND value NOT ILIKE '%First Lesson Complete%'
          AND value NOT ILIKE '%Sync to Website%'
          AND value NOT ILIKE '%Job Finished%'
        
      ) label ON TRUE
    ),
    label_revenue AS (
  SELECT
    COALESCE(label.value, 'Unknown') AS label,
    EXTRACT(MONTH FROM a.start)::int AS month,
    ROUND(SUM(ar.charge_rate), 2) AS expected_revenue
  FROM appointments a
  JOIN appointment_recipients ar ON a.appointment_id = ar.appointment_id
  JOIN services s ON a.service_id = s.service_id
  LEFT JOIN LATERAL (
    SELECT TRIM(value) AS value
    FROM jsonb_array_elements_text(COALESCE(s.labels, '[]'::jsonb)) AS lbl(value)
    WHERE value NOT ILIKE ANY(ARRAY[
      '%Non teaching%',
      '%Sync to Website%',
      '%Job Finished%'
    ])
  ) label ON TRUE
  LEFT JOIN (
    SELECT appointment_id, COUNT(*) AS student_count
    FROM appointment_recipients
    WHERE status <> 'missed'
    GROUP BY appointment_id
  ) sc ON sc.appointment_id = a.appointment_id
  WHERE a.status IN ('complete', 'cancelled-chargeable')
    AND a.start BETWEEN $1 AND $2
  GROUP BY label, month
)
    SELECT
      al.label,
      lr.month,
      COALESCE(lr.expected_revenue, 0) AS expected_revenue
    FROM all_labels al
    LEFT JOIN label_revenue lr ON lr.label = al.label
    ORDER BY al.label, lr.month;
    `,
    [start, end]
  );

  const result = {};

  for (const row of rows) {
    const label = row.label;
    const monthIndex = row.month ? row.month - 1 : null;
    const monthKey = monthIndex !== null ? monthNames[monthIndex] : null;
    const value = parseFloat(row.expected_revenue) || 0;

    if (!result[label]) {
      result[label] = {
        months: initMonths(),
        ytd: 0,
      };
    }

    if (monthKey) {
      result[label].months[monthKey] += value;
      result[label].ytd += value;
    }
  }

  return result;
}

async function getPaidRevenueByLabel(client, start, end) {
  const { rows } = await client.query(
    `
    WITH all_labels AS (
      SELECT DISTINCT
        COALESCE(label.value, 'Unknown') AS label
      FROM services s
      LEFT JOIN LATERAL (
        SELECT TRIM(value) AS value
        FROM jsonb_array_elements_text(COALESCE(s.labels, '[]'::jsonb)) AS lbl(value)
        WHERE value NOT ILIKE '%Non teaching%'
          
          AND value NOT ILIKE '%First Lesson Complete%'
          AND value NOT ILIKE '%Sync to Website%'
          AND value NOT ILIKE '%Job Finished%'
        
      ) label ON TRUE
    ),
    label_revenue AS (
      SELECT
        COALESCE(label.value, 'Unknown') AS label,
        ROUND(SUM(i.net), 2) AS paid_revenue
      FROM invoices i
      JOIN appointment_recipients ar ON i.client_id::text = ar.paying_client_id::text
      JOIN appointments a ON a.appointment_id = ar.appointment_id
      JOIN services s ON a.service_id = s.service_id
      LEFT JOIN LATERAL (
        SELECT TRIM(value) AS value
        FROM jsonb_array_elements_text(COALESCE(s.labels, '[]'::jsonb)) AS lbl(value)
        WHERE value NOT ILIKE '%Non teaching%'
          
          AND value NOT ILIKE '%First Lesson Complete%'
          AND value NOT ILIKE '%Sync to Website%'
          AND value NOT ILIKE '%Job Finished%'
        
      ) label ON TRUE
      WHERE i.status = 'paid'
        AND i.date_sent BETWEEN $1 AND $2
      GROUP BY label
    )
    SELECT
      a.label,
      COALESCE(r.paid_revenue, 0) AS paidRevenue
    FROM all_labels a
    LEFT JOIN label_revenue r ON r.label = a.label
    ORDER BY paidRevenue DESC;
    `,
    [start, end]
  );

  return rows.reduce((acc, row) => {
    const parsed = parseFloat(row.paidRevenue);
    acc[row.label] = {
      paidRevenue: isNaN(parsed) ? 0 : parsed,
    };
    return acc;
  }, {});
}

async function getExpectedRevenueReport(client, year, tab = 'all', labelGroups = {}) {
  let tabFilter = '';
  let params = [year];
  
  if (tab !== 'all' && labelGroups[tab]) {
    const patterns = labelGroups[tab].map(s => s.toLowerCase());
    const conditions = patterns.map((_, idx) => {
      params.push(`%${patterns[idx]}%`);
      return `lbl.value ILIKE $${params.length}`;
    });
    tabFilter = `AND (${conditions.join(' OR ')})`;
  }

  const { rows } = await client.query(
    `
      SELECT
        EXTRACT(MONTH FROM a.start)::int AS month,
        COALESCE(
          ROUND(SUM(ar.charge_rate)::numeric, 2),
          0
        )::numeric AS value
      FROM appointments a
      JOIN appointment_recipients ar
        ON a.appointment_id = ar.appointment_id
        AND ar.status <> 'missed'
      JOIN services s
        ON a.service_id = s.service_id
      CROSS JOIN LATERAL jsonb_array_elements_text(COALESCE(s.labels, '[]'::jsonb)) AS lbl
      WHERE a.status IN ('complete','cancelled-chargeable')
        AND EXTRACT(YEAR FROM a.start) = $1
        AND EXISTS (
          SELECT 1
          FROM jsonb_array_elements_text(COALESCE(s.labels, '[]'::jsonb)) AS lbl2
          WHERE lbl2 NOT ILIKE '%Non teaching%'
            AND lbl2 NOT ILIKE '%First Lesson Complete%'
            AND lbl2 NOT ILIKE '%Job Finished%'
            AND lbl2 NOT ILIKE '%Sync to Website%'
        )
        ${tabFilter}
      GROUP BY month
      ORDER BY month
    `,
    params
  );
  return rollup(rows);
}

async function getRevenueReport(client, year) {
  const { rows } = await client.query(
    `
      SELECT
        EXTRACT(MONTH FROM a.start)::int   AS month,
        COALESCE(ROUND(SUM(ar.charge_rate),2),0)::numeric AS value
      FROM appointments a
      JOIN appointment_recipients ar
        ON a.appointment_id = ar.appointment_id
      JOIN services s
        ON a.service_id = s.service_id
      WHERE a.status IN ('complete','cancelled-chargeable')
        AND EXTRACT(YEAR FROM a.start) = $1
        -- filter out any service labeled Non‑teaching or Support
        AND EXISTS (
          SELECT 1
          FROM jsonb_array_elements_text(COALESCE(s.labels, '[]'::jsonb)) AS lbl
          WHERE lbl NOT ILIKE '%Non teaching%'
            AND lbl NOT ILIKE '%First Lesson Complete%'
            AND lbl NOT ILIKE '%Job Finished%'
            AND lbl NOT ILIKE '%Sync to Website%'
        )
      GROUP BY month
      ORDER BY month
    `,
    [year]
  );
  return rollup(rows);
}

async function getPaidRevenueReport(client, year) {
  const { rows } = await client.query(
    `
      SELECT
        EXTRACT(MONTH FROM i.date_sent)::int AS month,
        COALESCE(
          ROUND(SUM(i.net)::numeric, 2),
          0
        )::numeric AS value
      FROM invoices i
      WHERE i.status = 'paid'
        AND EXTRACT(YEAR FROM i.date_sent) = $1
      GROUP BY month
      ORDER BY month
    `,
    [year]
  );
  return rollup(rows);
}

async function getTutorAdhocPayReport(client, start, end) {
  const { rows } = await client.query(
    `
      SELECT
        EXTRACT(MONTH FROM po.date_sent)::int AS month,
        COALESCE(ROUND(SUM(pc.amount), 2), 0)::numeric AS value
      FROM payment_orders po
      JOIN payment_order_charges pc
        ON pc.payment_order_id = po.id
      WHERE po.status = 'paid'
        AND po.date_sent BETWEEN $1 AND $2
        AND pc.adhoc_charge_id IS NOT NULL
      GROUP BY month
      ORDER BY month
    `,
    [start, end]
  );
  return rollup(rows);
}

async function getTutorPayReport(client, start, end, tab = 'all', labelGroups = {}) {
  const { rows } = await client.query(
    `
      SELECT
        EXTRACT(MONTH FROM po.date_sent)::int AS month,
        COALESCE(ROUND(SUM(po.amount), 2), 0)::numeric AS value
      FROM payment_orders po
      WHERE po.status = 'paid'
        AND po.date_sent BETWEEN $1 AND $2
      GROUP BY month
      ORDER BY month
    `,
    [start, end]
  );
  return rollup(rows);
}

async function getExpectedTutorPayReport(client, year, tab = 'all', labelGroups = {}) {
  // Determine if sr_premium column exists (e.g., may be missing on some envs)
  const hasSrPremium = await columnExists(client, 'services', 'sr_premium');

  const premiumSQL = hasSrPremium
    ? ` + COALESCE(sc.student_count * s.sr_premium * a.units, 0)`
    : ``;

  let tabFilter = '';
  let params = [year];
  
  if (tab !== 'all' && labelGroups[tab]) {
    const patterns = labelGroups[tab].map(s => s.toLowerCase());
    const conditions = patterns.map((_, idx) => {
      params.push(`%${patterns[idx]}%`);
      return `lbl.value ILIKE $${params.length}`;
    });
    tabFilter = `AND (${conditions.join(' OR ')})`;
  }

  const { rows } = await client.query(
    `
    SELECT
      EXTRACT(MONTH FROM a.start)::int AS month,
      ROUND(SUM(
        (
          CASE a.charge_type
            WHEN 'hourly' THEN ac.pay_rate
            WHEN 'one-off' THEN ac.pay_rate
            WHEN 'hourly-split' THEN ac.pay_rate
            WHEN 'one-off-split' THEN ac.pay_rate / NULLIF(sc.student_count,0)
            ELSE ac.pay_rate
          END
        )${premiumSQL}
      )::numeric, 2) AS value
    FROM appointments a
    JOIN appointment_contractors ac ON ac.appointment_id = a.appointment_id
    JOIN services s ON s.service_id = a.service_id
    CROSS JOIN LATERAL jsonb_array_elements_text(COALESCE(s.labels, '[]'::jsonb)) AS lbl
    LEFT JOIN (
      SELECT appointment_id, COUNT(*) AS student_count
      FROM appointment_recipients
      WHERE status <> 'missed'
      GROUP BY appointment_id
    ) sc ON sc.appointment_id = a.appointment_id
    WHERE a.status IN ('complete', 'cancelled-chargeable')
      AND EXTRACT(YEAR FROM a.start) = $1
      AND EXISTS (
        SELECT 1 FROM jsonb_array_elements_text(COALESCE(s.labels, '[]'::jsonb)) AS lbl2
        WHERE lbl2 NOT ILIKE '%Non teaching%'
          AND lbl2 NOT ILIKE '%First Lesson Complete%'
          AND lbl2 NOT ILIKE '%Sync to Website%'
          AND lbl2 NOT ILIKE '%Job Finished%'
      )
      ${tabFilter}
    GROUP BY month
    ORDER BY month;
  `,
    params
  );

  return rollup(rows);
}

async function getGrossProfitMarginReport(client, year) {
  const { rows } = await client.query(
    `
    WITH paid_rev AS (
      SELECT
        EXTRACT(MONTH FROM date_sent)::int    AS month,
        SUM(net)::numeric                     AS paid_revenue
      FROM invoices
      WHERE status = 'paid'
        AND EXTRACT(YEAR FROM date_sent) = $1
      GROUP BY month
    ),
    teaching_pay AS (
      SELECT
        EXTRACT(MONTH FROM po.date_sent)::int AS month,
        SUM(pc.amount)::numeric               AS tutor_pay
      FROM payment_orders po
      JOIN payment_order_charges pc
        ON pc.payment_order_id = po.id
      WHERE po.status = 'paid'
        AND EXTRACT(YEAR FROM po.date_sent) = $1
        AND pc.adhoc_charge_id IS NULL
      GROUP BY month
    )
    SELECT
      pr.month,
      CASE
        WHEN pr.paid_revenue = 0 THEN 0
        ELSE ROUND(
          (pr.paid_revenue - COALESCE(tp.tutor_pay,0))
          / pr.paid_revenue * 100
        , 2)
      END::numeric AS value
    FROM paid_rev pr
    LEFT JOIN teaching_pay tp
      ON tp.month = pr.month
    ORDER BY pr.month
    `,
    [year]
  );
  return rollup(rows);
}

async function getNetProfitMarginReport(client, year) {
  const { rows } = await client.query(
    `
    WITH paid_rev AS (
      SELECT
        EXTRACT(MONTH FROM date_sent)::int    AS month,
        SUM(net)::numeric                     AS paid_revenue
      FROM invoices
      WHERE status = 'paid'
        AND EXTRACT(YEAR FROM date_sent) = $1
      GROUP BY month
    ),
    total_payout AS (
      SELECT
        EXTRACT(MONTH FROM po.date_sent)::int AS month,
        SUM(po.amount)::numeric               AS payout
      FROM payment_orders po
      WHERE po.status = 'paid'
        AND EXTRACT(YEAR FROM po.date_sent) = $1
      GROUP BY month
    )
    SELECT
      pr.month,
      CASE
        WHEN pr.paid_revenue = 0 THEN 0
        ELSE ROUND(
          (pr.paid_revenue - COALESCE(tp.payout,0))
          / pr.paid_revenue * 100
        , 2)
      END::numeric AS value
    FROM paid_rev pr
    LEFT JOIN total_payout tp
      ON tp.month = pr.month
    ORDER BY pr.month
    `,
    [year]
  );
  return rollup(rows);
}

async function getHomeLessonsReport(client, year) {
  const { rows } = await client.query(
    `
       SELECT
         EXTRACT(MONTH FROM a.start)::int        AS month,
         COALESCE(ROUND(SUM(a.units)::numeric,2), 0) AS value
       FROM appointments a
       JOIN services s
         ON a.service_id = s.service_id
       CROSS JOIN LATERAL
         jsonb_array_elements_text(COALESCE(s.labels, '[]'::jsonb)) AS lbl(value)
       WHERE a.status IN ('complete','cancelled-chargeable')
         AND EXTRACT(YEAR FROM a.start) = $1
         AND lbl.value ILIKE '%Home%'
       GROUP BY month
       ORDER BY month
     `,
    [year]
  );
  return rollup(rows);
}

async function getOnlineLessonsReport(client, year) {
  const { rows } = await client.query(
    `
       SELECT
         EXTRACT(MONTH FROM a.start)::int        AS month,
         COALESCE(ROUND(SUM(a.units)::numeric,2), 0) AS value
       FROM appointments a
       JOIN services s
         ON a.service_id = s.service_id
       CROSS JOIN LATERAL
         jsonb_array_elements_text(COALESCE(s.labels, '[]'::jsonb)) AS lbl(value)
       WHERE a.status IN ('complete','cancelled-chargeable')
         AND EXTRACT(YEAR FROM a.start) = $1
         AND lbl.value ILIKE '%Online%'
       GROUP BY month
       ORDER BY month
     `,
    [year]
  );
  return rollup(rows);
}

async function getHomeRevenueReport(client, year) {
  const { rows } = await client.query(
    `
       SELECT
         EXTRACT(MONTH FROM a.start)::int   AS month,
         COALESCE(ROUND(SUM(ar.charge_rate),2),0)::numeric AS value
       FROM appointments a
       JOIN services s
         ON a.service_id = s.service_id
       CROSS JOIN LATERAL
         jsonb_array_elements_text(COALESCE(s.labels, '[]'::jsonb)) AS lbl(value)
       JOIN appointment_recipients ar
         ON a.appointment_id = ar.appointment_id
       WHERE a.status IN ('complete','cancelled-chargeable')
         AND EXTRACT(YEAR FROM a.start) = $1
         AND lbl.value ILIKE '%Home%'
       GROUP BY month
       ORDER BY month
     `,
    [year]
  );
  return rollup(rows);
}

async function getOnlineRevenueReport(client, year) {
  const { rows } = await client.query(
    `
       SELECT
         EXTRACT(MONTH FROM a.start)::int   AS month,
         COALESCE(ROUND(SUM(ar.charge_rate),2),0)::numeric AS value
       FROM appointments a
       JOIN services s
         ON a.service_id = s.service_id
       CROSS JOIN LATERAL
         jsonb_array_elements_text(COALESCE(s.labels, '[]'::jsonb)) AS lbl(value)
       JOIN appointment_recipients ar
         ON a.appointment_id = ar.appointment_id
       WHERE a.status IN ('complete','cancelled-chargeable')
         AND EXTRACT(YEAR FROM a.start) = $1
         AND lbl.value ILIKE '%Online%'
       GROUP BY month
       ORDER BY month
     `,
    [year]
  );
  return rollup(rows);
}

async function getLeadsReport(client, year) {
  const { rows } = await client.query(
    `
    SELECT
      EXTRACT(MONTH FROM created_at)::int AS month,
      COUNT(DISTINCT id)::int AS value
    FROM clients
    WHERE EXTRACT(YEAR FROM created_at) = $1
    GROUP BY month
    ORDER BY month
  `,
    [year]
  );
  return rollup(rows);
}

async function getConvertedLeadsReport(client, start, end) {
  const { rows } = await client.query(
    `
      WITH month_leads AS (
        SELECT
          id as client_id,
          date_trunc('month', created_at) AS month_start
        FROM clients
        WHERE created_at BETWEEN $1 AND $2
      ),
      paid_clients AS (
        SELECT DISTINCT client_id
        FROM invoices
        WHERE status = 'paid'
          AND date_sent BETWEEN $1 AND $2
      )
      SELECT
        EXTRACT(MONTH FROM ml.month_start)::int AS month,
        COUNT(*)::int                           AS value
      FROM month_leads ml
      JOIN paid_clients pc
        ON pc.client_id = ml.client_id
      GROUP BY month
      ORDER BY month
    `,
    [start, end]
  );
  return rollup(rows);
}

async function getUnconvertedLeadsReport(client, start, end) {
  const { rows } = await client.query(
    `
    SELECT
      EXTRACT(MONTH FROM created_at)::int AS month,
      COUNT(*)::int AS value
    FROM clients c
    WHERE c.created_at BETWEEN $1 AND $2
      AND EXISTS (
        SELECT 1
        FROM appointment_recipients ar
        WHERE ar.paying_client_id::text = c.id::text
      )
    GROUP BY month
    ORDER BY month
  `,
    [start, end]
  );
  return rollup(rows);
}

async function getLessonsPlacedReport(client, year) {
  const { rows } = await client.query(
    `
      WITH ordered AS (
        SELECT
          ar.paying_client_id,
          a.start,
          ROW_NUMBER() OVER (
            PARTITION BY ar.paying_client_id
            ORDER BY a.start
          ) AS rn
        FROM appointments a
        JOIN appointment_recipients ar
          ON a.appointment_id = ar.appointment_id
        WHERE a.status IN ('complete','cancelled-chargeable')
          AND EXTRACT(YEAR FROM a.start) = $1
      )
      SELECT
        EXTRACT(MONTH FROM start)::int AS month,
        COUNT(*)::int                   AS value
      FROM ordered
      WHERE rn = 3    -- or whatever logic for “placed”
      GROUP BY month
      ORDER BY month
    `,
    [year]
  );
  return rollup(rows);
}

async function getTrialLessonsReport(client, start, end) {
  const { rows } = await client.query(
    `
      WITH first_lessons AS (
        SELECT
          ar.paying_client_id,
          MIN(a.start) AS first_lesson_date
        FROM appointment_recipients ar
        JOIN appointments a
          ON a.appointment_id = ar.appointment_id
        WHERE a.status = 'complete'
        GROUP BY ar.paying_client_id
      )
      SELECT
        EXTRACT(MONTH FROM fl.first_lesson_date)::int AS month,
        COUNT(*)::int                               AS value
      FROM first_lessons fl
      WHERE fl.first_lesson_date BETWEEN $1 AND $2
      GROUP BY month
      ORDER BY month
    `,
    [start, end]
  );
  return rollup(rows);
}

async function getConvertedNotContinuedReport(client, start, end) {
  const { rows } = await client.query(
    `
      WITH first_lessons AS (
        SELECT
          ar.paying_client_id,
          MIN(a.start) AS first_lesson_date
        FROM appointment_recipients ar
        JOIN appointments a
          ON a.appointment_id = ar.appointment_id
        WHERE a.status = 'complete'
        GROUP BY ar.paying_client_id
      ),
      counts_within_30d AS (
        SELECT
          ar.paying_client_id,
          COUNT(*) AS cnt
        FROM appointment_recipients ar
        JOIN appointments a
          ON a.appointment_id = ar.appointment_id
        JOIN first_lessons fl
          ON fl.paying_client_id = ar.paying_client_id
        WHERE a.status = 'complete'
          AND a.start >= fl.first_lesson_date
          AND a.start <  fl.first_lesson_date + INTERVAL '30 days'
        GROUP BY ar.paying_client_id
      )
      SELECT
        EXTRACT(MONTH FROM fl.first_lesson_date)::int AS month,
        COUNT(*)::int                               AS value
      FROM first_lessons fl
      LEFT JOIN counts_within_30d cw
        ON cw.paying_client_id = fl.paying_client_id
      WHERE fl.first_lesson_date BETWEEN $1 AND $2
        AND COALESCE(cw.cnt,0) = 1
      GROUP BY month
      ORDER BY month
    `,
    [start, end]
  );
  return rollup(rows);
}

async function getThreeLessonsReport(client, year) {
  const { rows } = await client.query(
    `
    WITH ordered AS (
      SELECT
        ar.paying_client_id,
        a.start,
        ROW_NUMBER() OVER (
          PARTITION BY ar.paying_client_id
          ORDER BY a.start
        ) AS rn
      FROM appointments a
      JOIN appointment_recipients ar
        ON a.appointment_id = ar.appointment_id
      WHERE a.status IN ('complete','cancelled-chargeable')
        AND EXTRACT(YEAR FROM a.start) = $1
    )
    SELECT
      EXTRACT(MONTH FROM start)::int AS month,
      COUNT(*)::int                   AS value
    FROM ordered
    WHERE rn = 3
    GROUP BY month
    ORDER BY month
    `,
    [year]
  );
  return rollup(rows);
}

async function getSevenLessonsReport(client, year) {
  const { rows } = await client.query(
    `
    WITH ordered AS (
      SELECT
        ar.paying_client_id,
        a.start,
        ROW_NUMBER() OVER (
          PARTITION BY ar.paying_client_id
          ORDER BY a.start
        ) AS rn
      FROM appointments a
      JOIN appointment_recipients ar
        ON a.appointment_id = ar.appointment_id
      WHERE a.status IN ('complete','cancelled-chargeable')
        AND EXTRACT(YEAR FROM a.start) = $1
    )
    SELECT
      EXTRACT(MONTH FROM start)::int AS month,
      COUNT(*)::int                   AS value
    FROM ordered
    WHERE rn = 7
    GROUP BY month
    ORDER BY month
    `,
    [year]
  );
  return rollup(rows);
}

async function getActiveTutorsReport(client, year) {
  const { rows } = await client.query(
    `
    SELECT
      EXTRACT(MONTH FROM a.start)::int     AS month,
      COUNT(DISTINCT ac.contractor_id)::int AS value
    FROM appointment_contractors ac
    JOIN appointments a
      ON ac.appointment_id = a.appointment_id
    WHERE a.status IN ('complete','cancelled-chargeable')
      AND EXTRACT(YEAR FROM a.start) = $1
    GROUP BY month
    ORDER BY month
    `,
    [year]
  );
  return rollup(rows);
}

async function getInactiveTutorsReport(client, year) {
  const { rows } = await client.query(
    `
    WITH
      approved_tutors AS (
        SELECT DISTINCT contractor_id
        FROM appointment_contractors
        WHERE status = 'approved'
      ),
        months AS (
      SELECT generate_series(
        /* first day of January of that year */
        make_date($1::int, 1, 1)::timestamp,
        /* first day of December of that year */
        make_date($1::int, 12, 1)::timestamp,
        /* step by one month */
        INTERVAL '1 month'
      ) AS month_start
    ),
      month_lessons AS (
        SELECT
          EXTRACT(MONTH FROM a.start)::int AS month,
          COUNT(*)                        AS lesson_count
        FROM appointments a
        JOIN appointment_contractors ac
          ON ac.appointment_id = a.appointment_id
        WHERE a.status IN ('complete','cancelled-chargeable')
          AND EXTRACT(YEAR FROM a.start) = $1
        GROUP BY month
      ),
      inactive_raw AS (
        SELECT
          EXTRACT(MONTH FROM m.month_start)::int AS month,
          COUNT(at.contractor_id)::int           AS inactive_count
        FROM months m
        CROSS JOIN approved_tutors at
        WHERE NOT EXISTS (
          SELECT 1
          FROM appointment_contractors ac2
          JOIN appointments a2
            ON ac2.appointment_id = a2.appointment_id
          WHERE ac2.contractor_id = at.contractor_id
            AND a2.status IN ('complete','cancelled-chargeable')
            AND EXTRACT(YEAR FROM a2.start) = $1
            AND date_trunc('month', a2.start) = m.month_start
        )
        GROUP BY month
      )
    SELECT
      mth.month,
      CASE
        WHEN COALESCE(ml.lesson_count, 0) = 0 THEN 0
        ELSE COALESCE(ir.inactive_count, 0)
      END AS value
    FROM (
      SELECT EXTRACT(MONTH FROM month_start)::int AS month
      FROM months
    ) AS mth
    LEFT JOIN month_lessons ml ON ml.month = mth.month
    LEFT JOIN inactive_raw  ir ON ir.month = mth.month
    ORDER BY mth.month
    `,
    [year]
  );
  return rollup(rows);
}

async function getTutorsByHoursReport(client, year, minH, maxH) {
  const clause =
    maxH != null
      ? `total_hours >= ${minH} AND total_hours < ${maxH}`
      : `total_hours >= ${minH}`;

  const { rows } = await client.query(
    `
      WITH tutor_hours AS (
        SELECT
          EXTRACT(MONTH FROM a.start)::int AS month,
          SUM(a.units)                   AS total_hours
        FROM appointment_contractors ac
        JOIN appointments a
          ON ac.appointment_id = a.appointment_id
        WHERE a.status IN ('complete','cancelled-chargeable')
          AND EXTRACT(YEAR FROM a.start) = $1
        GROUP BY month, ac.contractor_id
      )
      SELECT
        month,
        COUNT(*)::int AS value
      FROM tutor_hours
      WHERE ${clause}
      GROUP BY month
      ORDER BY month
    `,
    [year]
  );

  return rollup(rows);
}

async function getConsistencyBonusReport(client, year) {
  const { rows } = await client.query(
    `
      WITH tutor_hours AS (
        SELECT
          EXTRACT(MONTH FROM a.start)::int AS month,
          SUM(a.units)                   AS total_hours
        FROM appointment_contractors ac
        JOIN appointments a
          ON ac.appointment_id = a.appointment_id
        WHERE a.status IN ('complete','cancelled-chargeable')
          AND EXTRACT(YEAR FROM a.start) = $1
        GROUP BY month, ac.contractor_id
      )
      SELECT
        month,
        COALESCE(SUM(
          CASE
            WHEN total_hours >= 80 THEN 600
            WHEN total_hours >= 60 THEN 400
            WHEN total_hours >= 40 THEN 200
            ELSE 0
          END
        ),0)::int AS value
      FROM tutor_hours
      GROUP BY month
      ORDER BY month
    `,
    [year]
  );

  return rollup(rows);
}

async function getGroupStudentsReport(client, year) {
  const { rows } = await client.query(
    `
      WITH GroupedAppointments AS (
        SELECT
          EXTRACT(MONTH FROM a.start)::int AS month,
          COUNT(
            CASE
              WHEN ar.status IN ('attended','missed-chargeable')
                AND ar.charge_rate NOT IN (80.00,112.66,119.00)
                AND (s.labels::TEXT ILIKE '%home%' OR s.labels::TEXT ILIKE '%online%')
                AND a.status = 'complete'
              THEN 1
            END
          ) AS eligible_students
        FROM appointment_recipients ar
        JOIN appointment_contractors ac
          ON ar.appointment_id = ac.appointment_id
        JOIN appointments a
          ON ar.appointment_id = a.appointment_id
        JOIN services s
          ON a.service_id    = s.service_id
        WHERE EXTRACT(YEAR FROM a.start) = $1
        GROUP BY month
      )
      SELECT
        month,
        COALESCE(SUM(
          CASE WHEN eligible_students >= 2 THEN eligible_students ELSE 0 END
        ),0)::int AS value
      FROM GroupedAppointments
      GROUP BY month
      ORDER BY month;
    `,
    [year]
  );

  return rollup(rows);
}

async function getAdditionalStudentsReport(client, year) {
  const { rows } = await client.query(
    `
      WITH group_data AS (
        SELECT
          EXTRACT(MONTH FROM a.start)::int AS month,
          COUNT(
            CASE
              WHEN ar.status IN ('attended','missed-chargeable')
                AND ar.charge_rate NOT IN (80.00,112.66,119.00)
                AND (s.labels::TEXT ILIKE '%home%' OR s.labels::TEXT ILIKE '%online%')
                AND a.status = 'complete'
              THEN ar.recipient_id
            END
          ) AS counted_students
        FROM appointment_recipients ar
        JOIN appointment_contractors ac
          ON ar.appointment_id = ac.appointment_id
        JOIN appointments a
          ON ar.appointment_id = a.appointment_id
        JOIN services s
          ON a.service_id    = s.service_id
        WHERE EXTRACT(YEAR FROM a.start) = $1
        GROUP BY month
      )
      SELECT
        month,
        COALESCE(SUM(counted_students),0)::int AS value
      FROM group_data
      GROUP BY month
      ORDER BY month;
    `,
    [year]
  );

  return rollup(rows);
}

async function getGroupBonusReport(client, year) {
  const { rows } = await client.query(
    `
      WITH group_lessons AS (
        SELECT
          EXTRACT(MONTH FROM a.start)::int AS month,
          COUNT(ar.recipient_id)        AS student_count
        FROM appointments a
        JOIN appointment_recipients ar
          ON a.appointment_id = ar.appointment_id
        WHERE a.status IN ('complete','cancelled-chargeable')
          AND EXTRACT(YEAR FROM a.start) = $1
        GROUP BY month, a.appointment_id
        HAVING COUNT(ar.recipient_id) >= 2
      )
      SELECT
        month,
        COALESCE(SUM(
          CASE
            WHEN student_count >= 5 THEN 40
            WHEN student_count >= 4 THEN 30
            WHEN student_count >= 3 THEN 20
            WHEN student_count >= 2 THEN 10
            ELSE 0
          END
        ),0)::int AS value
      FROM group_lessons
      GROUP BY month
      ORDER BY month
    `,
    [year]
  );

  return rollup(rows);
}

async function getLabelBreakdown(client, start, end) {
  const monthNames = [
    "jan",
    "feb",
    "mar",
    "apr",
    "may",
    "jun",
    "jul",
    "aug",
    "sep",
    "oct",
    "nov",
    "dec",
  ];
  const initMonths = () =>
    monthNames.reduce((acc, m) => ((acc[m] = 0), acc), {});

  const { rows } = await client.query(
    `
    WITH base_data AS (
      SELECT
        a.appointment_id,
        EXTRACT(MONTH FROM a.start)::int AS month,
        a.charge_type,
        a.units,
        ac.pay_rate,
        s.labels,
        s.sr_premium,
        -- Count active students for this appointment
        (SELECT COUNT(*) 
         FROM appointment_recipients ar 
         WHERE ar.appointment_id = a.appointment_id 
           AND ar.status <> 'missed') AS student_count
      FROM appointments a
      JOIN appointment_contractors ac ON ac.appointment_id = a.appointment_id
      JOIN services s ON s.service_id = a.service_id
      WHERE a.status IN ('complete', 'cancelled-chargeable')
        AND a.start BETWEEN $1 AND $2
    ),
    labeled_data AS (
      SELECT
        bd.month,
        lbl.value AS label,
        -- Base pay per contractor
        (CASE bd.charge_type
          WHEN 'hourly'        THEN bd.pay_rate
          WHEN 'one-off'       THEN bd.pay_rate
          WHEN 'hourly-split'  THEN bd.pay_rate
          WHEN 'one-off-split' THEN bd.pay_rate
          ELSE bd.pay_rate
        END
        -- Add sr_premium (student premium) if applicable
        + COALESCE(bd.sr_premium * bd.student_count * bd.units, 0)
        ) AS session_tutor_pay
      FROM base_data bd
      CROSS JOIN LATERAL jsonb_array_elements_text(bd.labels) AS lbl(value)
      WHERE lbl.value NOT ILIKE ANY (ARRAY[
        '%Non teaching%',
        '%First Lesson Complete%',
        '%Job Finished%',
        '%Sync to Website%'
      ])
    )
    SELECT
      label,
      month,
      SUM(session_tutor_pay)::numeric AS expected_tutor_pay
    FROM labeled_data
    GROUP BY label, month
    ORDER BY label, month;
`,
    [start, end]
  );

  const breakdown = {};
  rows.forEach((r) => {
    const key = r.label;
    if (!breakdown[key]) {
      breakdown[key] = {
        revenueMonths: initMonths(),
        tutorPayMonths: initMonths(),
        ytdRevenue: 0,
        ytdTutorPay: 0,
      };
    }
    const m = monthNames[r.month - 1];
    breakdown[key].tutorPayMonths[m] += parseFloat(r.expected_tutor_pay);
    breakdown[key].ytdTutorPay += parseFloat(r.expected_tutor_pay);
  });

  return breakdown;
}

async function getLessonsDetail(client, start, end) {
  const { rows } = await client.query(
    `
      SELECT
        a.appointment_id   AS lesson_id,
        a.start            AS lesson_start,
        a.charge_type,
        a.units,
        s.service_id,
        s.name             AS service_name
      FROM appointments a
      JOIN services s
        ON a.service_id = s.service_id
      WHERE a.status IN ('complete','cancelled-chargeable')
        AND a.start BETWEEN $1 AND $2
        AND EXISTS (
          SELECT 1
          FROM jsonb_array_elements_text(COALESCE(s.labels, '[]'::jsonb)) AS lbl
          WHERE lbl NOT ILIKE '%Non teaching%'
            AND lbl NOT ILIKE '%First Lesson Complete%'
            AND lbl NOT ILIKE '%Sync to Website%'
            AND lbl NOT ILIKE '%Job Finished%'
        )
      ORDER BY a.start
    `,
    [start, end]
  );
  return rows;
}

async function getLessonHoursDetail(client, start, end) {
  const { rows } = await client.query(
    `
      SELECT
        a.appointment_id   AS appointment_id,
        a.start            AS lesson_start,
        a.units            AS lesson_hours,
        s.service_id,
        s.name             AS service_name
      FROM appointments a
      JOIN services s
        ON a.service_id = s.service_id
      WHERE a.status IN ('complete','cancelled-chargeable')
        AND a.start BETWEEN $1 AND $2
        AND EXISTS (
          SELECT 1
          FROM jsonb_array_elements_text(COALESCE(s.labels, '[]'::jsonb)) AS lbl
          WHERE lbl NOT ILIKE '%Non teaching%'
            AND lbl NOT ILIKE '%First Lesson Complete%'
            AND lbl NOT ILIKE '%Sync to Website%'
            AND lbl NOT ILIKE '%Job Finished%'
        )
      ORDER BY a.start
    `,
    [start, end]
  );
  return rows;
}

async function getStudentsDetail(client, start, end) {
  const { rows } = await client.query(
    `
    SELECT
      a.appointment_id            AS lesson_id,
      a.start                     AS lesson_start,
      ar.recipient_id             AS student_id
    FROM appointment_recipients ar
    JOIN appointments a
      ON a.appointment_id = ar.appointment_id
    JOIN services s
      ON a.service_id = s.service_id

    WHERE a.status IN ('complete','cancelled-chargeable')
      AND a.start BETWEEN $1 AND $2

      -- same exclusion you use in getStudentsReport:
      AND EXISTS (
        SELECT 1
        FROM jsonb_array_elements_text(COALESCE(s.labels, '[]'::jsonb)) AS lbl(value)
        WHERE lbl NOT ILIKE '%Non teaching%'
          AND lbl NOT ILIKE '%First Lesson Complete%'
          AND lbl NOT ILIKE '%Sync to Website%'
          AND lbl NOT ILIKE '%Job Finished%'
      )

    ORDER BY a.start, ar.recipient_id
    `,
    [start, end]
  );

  logger.info({ data: rows.length }, "[detail:students] got rows:");
  return rows;
}

async function getRevenueDetail(client, start, end) {
  const { rows } = await client.query(
    `
      WITH student_counts AS (
        SELECT
          appointment_id,
          COUNT(*)::int AS student_count
        FROM appointment_recipients
        WHERE status <> 'missed'
        GROUP BY appointment_id
      )
      SELECT
        a.appointment_id,
        a.start                    AS lesson_start,
        ar.recipient_id,
        ar.charge_rate              AS expected_revenue,
        a.units
      FROM appointments a
      JOIN appointment_recipients ar
        ON a.appointment_id = ar.appointment_id
        AND ar.status <> 'missed'
      JOIN student_counts sc
        ON sc.appointment_id = a.appointment_id
      JOIN services s
        ON a.service_id = s.service_id
      WHERE a.status IN ('complete','cancelled-chargeable')
        AND a.start BETWEEN $1 AND $2
        AND EXISTS (
          SELECT 1
          FROM jsonb_array_elements_text(COALESCE(s.labels, '[]'::jsonb)) AS lbl
          WHERE lbl NOT ILIKE '%Non teaching%'
            AND lbl NOT ILIKE '%First Lesson Complete%'
            AND lbl NOT ILIKE '%Sync to Website%'
            AND lbl NOT ILIKE '%Job Finished%'
        )
      ORDER BY a.start
    `,
    [start, end]
  );
  return rows;
}

async function getPaidRevenueDetail(client, start, end) {
  const { rows } = await client.query(
    `
      SELECT
        i.id                                  AS invoice_id,
        i.date_sent                           AS date_sent,
        i.client_id::text                     AS client_id,
        c.first_name || ' ' || c.last_name    AS client_name,
        ROUND(i.net::numeric, 2)             AS paid_amount
      FROM invoices i
      LEFT JOIN clients c
        ON c.client_id::text = i.client_id::text
      WHERE i.status = 'paid'
        AND i.date_sent BETWEEN $1 AND $2
      ORDER BY i.date_sent
    `,
    [start, end]
  );
  return rows;
}

async function getTutorPayDetail(client, start, end) {
  const { rows } = await client.query(
    `
      SELECT
        po.id         AS payment_order_id,
        po.date_sent,
        po.amount
      FROM payment_orders po
      WHERE po.status = 'paid'
        AND po.date_sent BETWEEN $1 AND $2
      ORDER BY po.date_sent
    `,
    [start, end]
  );
  return rows;
}

async function getTutorAdhocPayDetail(client, start, end) {
  const { rows } = await client.query(
    `
      SELECT
        po.id                AS payment_order_id,
        po.date_sent         AS date_sent,
        pc.adhoc_charge_id   AS charge_id,
        pc.amount            AS amount
      FROM payment_orders po
      JOIN payment_order_charges pc
        ON pc.payment_order_id = po.id
      WHERE po.status = 'paid'
        AND po.date_sent BETWEEN $1 AND $2
        AND pc.adhoc_charge_id IS NOT NULL
      ORDER BY po.date_sent, pc.adhoc_charge_id
    `,
    [start, end]
  );
  return rows;
}

async function getGrossProfitMarginDetail(client, start, end) {
  const { rows } = await client.query(
    `
      WITH paid_rev AS (
        SELECT
          EXTRACT(MONTH FROM date_sent)::int AS month,
          SUM(net)::numeric                   AS paid_revenue
        FROM invoices
        WHERE status = 'paid'
          AND date_sent BETWEEN $1 AND $2
          AND date_sent < date_trunc('month', now())
        GROUP BY month
      ),
      teaching_pay AS (
        SELECT
          EXTRACT(MONTH FROM po.date_sent)::int AS month,
          SUM(pc.amount)::numeric               AS tutor_pay
        FROM payment_orders po
        JOIN payment_order_charges pc
          ON pc.payment_order_id = po.id
        WHERE po.status = 'paid'
          AND po.date_sent BETWEEN $1 AND $2
          AND po.date_sent < date_trunc('month', now())
          AND pc.adhoc_charge_id IS NULL
        GROUP BY month
      )
      SELECT
        pr.month,
        pr.paid_revenue,
        COALESCE(tp.tutor_pay, 0) AS tutor_pay
      FROM paid_rev pr
      LEFT JOIN teaching_pay tp
        ON tp.month = pr.month
      ORDER BY pr.month
    `,
    [start, end]
  );
  return rows;
}

async function getNetProfitMarginDetail(client, start, end) {
  const { rows } = await client.query(
    `
      WITH paid_rev AS (
        SELECT
          EXTRACT(MONTH FROM date_sent)::int AS month,
          SUM(net)::numeric                   AS paid_revenue
        FROM invoices
        WHERE status = 'paid'
          AND date_sent BETWEEN $1 AND $2
          AND date_sent < date_trunc('month', now())
        GROUP BY month
      ),
      total_payout AS (
        SELECT
          EXTRACT(MONTH FROM po.date_sent)::int AS month,
          SUM(po.amount)::numeric               AS payout
        FROM payment_orders po
        WHERE po.status = 'paid'
          AND po.date_sent BETWEEN $1 AND $2
          AND po.date_sent < date_trunc('month', now())
        GROUP BY month
      )
      SELECT
        pr.month,
        pr.paid_revenue,
        COALESCE(tp.payout, 0) AS payout
      FROM paid_rev pr
      LEFT JOIN total_payout tp
        ON tp.month = pr.month
      ORDER BY pr.month
    `,
    [start, end]
  );
  return rows;
}

async function getHomeLessonsDetail(client, start, end) {
  const { rows } = await client.query(
    `
      SELECT
        a.appointment_id,
        a.start,
        a.units AS home_hours
      FROM appointments a
      JOIN services s
        ON a.service_id = s.service_id
      WHERE a.status IN ('complete','cancelled-chargeable')
        AND a.start BETWEEN $1 AND $2
        AND EXISTS (
          SELECT 1 FROM jsonb_array_elements_text(COALESCE(s.labels, '[]'::jsonb)) AS lbl
          WHERE lbl ILIKE '%Home%'
        )
      ORDER BY a.start
    `,
    [start, end]
  );
  return rows;
}

async function getHomeRevenueDetail(client, start, end) {
  const { rows } = await client.query(
    `
      SELECT
        a.appointment_id,
        a.start,
        ar.charge_rate AS home_revenue
      FROM appointments a
      JOIN services s
        ON a.service_id = s.service_id
      JOIN appointment_recipients ar
        ON a.appointment_id = ar.appointment_id
      WHERE a.status IN ('complete','cancelled-chargeable')
        AND a.start BETWEEN $1 AND $2
        AND EXISTS (
          SELECT 1 FROM jsonb_array_elements_text(COALESCE(s.labels, '[]'::jsonb)) AS lbl
          WHERE lbl ILIKE '%Home%'
        )
      ORDER BY a.start
    `,
    [start, end]
  );
  return rows;
}

async function getOnlineLessonsDetail(client, start, end) {
  const { rows } = await client.query(
    `
      SELECT
        a.appointment_id,
        a.start,
        a.units AS online_hours
      FROM appointments a
      JOIN services s
        ON a.service_id = s.service_id
      WHERE a.status IN ('complete','cancelled-chargeable')
        AND a.start BETWEEN $1 AND $2
        AND EXISTS (
          SELECT 1 FROM jsonb_array_elements_text(COALESCE(s.labels, '[]'::jsonb)) AS lbl
          WHERE lbl ILIKE '%Online%'
        )
      ORDER BY a.start
    `,
    [start, end]
  );
  return rows;
}

async function getOnlineRevenueDetail(client, start, end) {
  const { rows } = await client.query(
    `
      SELECT
        a.appointment_id,
        a.start,
        ar.charge_rate AS online_revenue
      FROM appointments a
      JOIN services s
        ON a.service_id = s.service_id
      JOIN appointment_recipients ar
        ON a.appointment_id = ar.appointment_id
      WHERE a.status IN ('complete','cancelled-chargeable')
        AND a.start BETWEEN $1 AND $2
        AND EXISTS (
          SELECT 1 FROM jsonb_array_elements_text(COALESCE(s.labels, '[]'::jsonb)) AS lbl
          WHERE lbl ILIKE '%Online%'
        )
      ORDER BY a.start
    `,
    [start, end]
  );
  return rows;
}

async function getLeadsDetail(client, start, end) {
  const { rows } = await client.query(
    `
      SELECT
        id as client_id,
        created_at
      FROM clients
      WHERE created_at BETWEEN $1 AND $2
      ORDER BY created_at
    `,
    [start, end]
  );
  return rows;
}

async function getConvertedLeadsDetail(client, start, end) {
  const { rows } = await client.query(
    `
      WITH month_leads AS (
        SELECT id as client_id, date_trunc('month', created_at) AS month_start
        FROM clients WHERE created_at BETWEEN $1 AND $2
      ),
      paid_clients AS (
        SELECT DISTINCT client_id
        FROM invoices
        WHERE status='paid' AND date_sent BETWEEN $1 AND $2
      )
      SELECT ml.client_id, ml.month_start AS first_month
      FROM month_leads ml
      JOIN paid_clients pc ON pc.client_id::text=ml.client_id
      ORDER BY ml.month_start
    `,
    [start, end]
  );
  return rows;
}

async function getTrialLessonsDetail(client, start, end) {
  const { rows } = await client.query(
    `
      WITH first_lessons AS (
        SELECT
          ar.paying_client_id       AS client_id,
          MIN(a.start)              AS first_lesson_date
        FROM appointment_recipients ar
        JOIN appointments a
          ON a.appointment_id = ar.appointment_id
        WHERE a.status = 'complete'
        GROUP BY ar.paying_client_id
      )
      SELECT
        fl.client_id,
        fl.first_lesson_date
      FROM first_lessons fl
      WHERE fl.first_lesson_date BETWEEN $1 AND $2
      ORDER BY fl.first_lesson_date
    `,
    [start, end]
  );
  return rows;
}

async function getConvertedNotContinuedDetail(client, start, end) {
  const { rows } = await client.query(
    `
      WITH first_paid_lessons AS (
        SELECT
          ar.paying_client_id AS client_id,
          MIN(a.start)         AS first_paid_date
        FROM appointment_recipients ar
        JOIN appointments a
          ON a.appointment_id = ar.appointment_id
        JOIN invoices i
          ON i.client_id::text = ar.paying_client_id::text
        WHERE a.status = 'complete'
          AND i.status = 'paid'
          AND i.date_sent BETWEEN $1 AND $2
        GROUP BY ar.paying_client_id
      ),
      follow_up_counts AS (
        SELECT
          ar.paying_client_id AS client_id,
          COUNT(*)            AS lesson_count
        FROM appointment_recipients ar
        JOIN appointments a
          ON a.appointment_id = ar.appointment_id
        JOIN first_paid_lessons fl
          ON fl.client_id = ar.paying_client_id
        WHERE a.status = 'complete'
          AND a.start >= fl.first_paid_date
          AND a.start <  fl.first_paid_date + INTERVAL '30 days'
        GROUP BY ar.paying_client_id
      )
      SELECT
        fl.client_id,
        fl.first_paid_date
      FROM first_paid_lessons fl
      LEFT JOIN follow_up_counts fc
        ON fc.client_id = fl.client_id
      WHERE fl.first_paid_date BETWEEN $1 AND $2
        AND COALESCE(fc.lesson_count, 0) = 1
      ORDER BY fl.first_paid_date
    `,
    [start, end]
  );
  return rows;
}

async function getThreeLessonsDetail(client, start, end) {
  const { rows } = await client.query(
    `
      WITH ordered AS (
        SELECT
          ar.paying_client_id            AS client_id,
          a.start                        AS lesson_date,
          ROW_NUMBER() OVER (
            PARTITION BY ar.paying_client_id
            ORDER BY a.start
          )                              AS rn
        FROM appointments a
        JOIN appointment_recipients ar
          ON a.appointment_id = ar.appointment_id
        WHERE a.status IN ('complete','cancelled-chargeable')
          AND a.start BETWEEN $1 AND $2
      )
      SELECT
        client_id,
        lesson_date AS third_lesson_date
      FROM ordered
      WHERE rn = 3
      ORDER BY lesson_date
    `,
    [start, end]
  );
  return rows;
}

async function getSevenLessonsDetail(client, start, end) {
  const { rows } = await client.query(
    `
      WITH ordered AS (
        SELECT
          ar.paying_client_id            AS client_id,
          a.start                        AS lesson_date,
          ROW_NUMBER() OVER (
            PARTITION BY ar.paying_client_id
            ORDER BY a.start
          )                              AS rn
        FROM appointments a
        JOIN appointment_recipients ar
          ON a.appointment_id = ar.appointment_id
        WHERE a.status IN ('complete','cancelled-chargeable')
          AND a.start BETWEEN $1 AND $2
      )
      SELECT
        client_id,
        lesson_date AS seventh_lesson_date
      FROM ordered
      WHERE rn = 7
      ORDER BY lesson_date
    `,
    [start, end]
  );
  return rows;
}

async function getActiveTutorsDetail(client, start, end) {
  const { rows } = await client.query(
    `
      SELECT DISTINCT
        ac.contractor_id,
        a.start             AS lesson_start
      FROM appointment_contractors ac
      JOIN appointments a
        ON ac.appointment_id = a.appointment_id
      WHERE a.status IN ('complete','cancelled-chargeable')
        AND a.start BETWEEN $1 AND $2
      ORDER BY ac.contractor_id, a.start
    `,
    [start, end]
  );
  return rows;
}

async function getInactiveTutorsDetail(client, start, end) {
  const { rows } = await client.query(
    `
      WITH
        approved AS (
          SELECT DISTINCT contractor_id
          FROM appointment_contractors
          WHERE status = 'approved'
        ),
        taught AS (
          SELECT DISTINCT ac.contractor_id
          FROM appointment_contractors ac
          JOIN appointments a
            ON ac.appointment_id = a.appointment_id
          WHERE a.status IN ('complete','cancelled-chargeable')
            AND a.start BETWEEN $1 AND $2
        )
      SELECT
        ap.contractor_id
      FROM approved ap
      LEFT JOIN taught t
        ON t.contractor_id = ap.contractor_id
      WHERE t.contractor_id IS NULL
      ORDER BY ap.contractor_id
    `,
    [start, end]
  );
  return rows;
}

async function getTutorsByHoursDetail(client, start, end, minH, maxH) {
  const clause =
    maxH != null
      ? `total_hours >= ${minH} AND total_hours < ${maxH}`
      : `total_hours >= ${minH}`;

  const { rows } = await client.query(
    `
      WITH tutor_hours AS (
        SELECT
          ac.contractor_id,
          SUM(a.units)::numeric AS total_hours
        FROM appointment_contractors ac
        JOIN appointments a
          ON ac.appointment_id = a.appointment_id
        WHERE a.status IN ('complete','cancelled-chargeable')
          AND a.start BETWEEN $1 AND $2
        GROUP BY ac.contractor_id
      )
      SELECT
        contractor_id,
        total_hours
      FROM tutor_hours
      WHERE ${clause}
      ORDER BY contractor_id
    `,
    [start, end]
  );

  return rows;
}

async function getConsistencyBonusDetail(client, start, end) {
  const { rows } = await client.query(
    `
    WITH tutor_hours AS (
      SELECT
        ac.contractor_id,
        SUM(a.units) AS total_hours
      FROM appointment_contractors ac
      JOIN appointments a ON a.appointment_id=ac.appointment_id
      WHERE a.status IN ('complete','cancelled-chargeable')
        AND a.start BETWEEN $1 AND $2
      GROUP BY ac.contractor_id
    )
    SELECT
      th.contractor_id,
      tc.name                       AS tutor_name,
      CASE
        WHEN th.total_hours >= 80 THEN 600
        WHEN th.total_hours >= 60 THEN 400
        WHEN th.total_hours >= 40 THEN 200
        ELSE 0
      END                            AS bonus,
      (th.contractor_id||'-cb-'||bonus) AS id
    FROM tutor_hours th
    JOIN contractors tc ON tc.id=th.contractor_id
    ORDER BY bonus DESC
  `,
    [start, end]
  );

  return rows;
}

async function getConvertedLeadsDetail(client, start, end) {
  const { rows } = await client.query(
    `
      WITH month_leads AS (
        SELECT id as client_id, date_trunc('month', created_at) AS month_start
        FROM clients
        WHERE created_at BETWEEN $1 AND $2
      ),
      paid_clients AS (
        SELECT DISTINCT client_id
        FROM invoices
        WHERE status = 'paid'
          AND date_sent BETWEEN $1 AND $2
      )
      SELECT
        ml.client_id,
        ml.month_start AS first_month
      FROM month_leads ml
      JOIN paid_clients pc
        ON pc.client_id::text = ml.client_id::text
      ORDER BY ml.month_start
    `,
    [start, end]
  );
  return rows;
}

async function getUnconvertedLeadsDetail(client, start, end) {
  const { rows } = await client.query(
    `
      SELECT
        c.id as client_id,
        c.created_at
      FROM clients c
      WHERE c.created_at BETWEEN $1 AND $2
        AND EXISTS (
          SELECT 1
          FROM appointment_recipients ar
          WHERE ar.paying_client_id::text = c.id::text
        )
      ORDER BY c.created_at
    `,
    [start, end]
  );
  return rows;
}

async function getLessonsPlacedDetail(client, start, end) {
  const { rows } = await client.query(
    `
      SELECT DISTINCT
        a.appointment_id,
        a.start,
        s.service_id,
        a.topic
      FROM appointments a
      JOIN services s
        ON a.service_id = s.service_id
      JOIN LATERAL jsonb_array_elements_text(COALESCE(s.labels, '[]'::jsonb)) AS lbl(value)
        ON lbl.value ILIKE '%Home%' OR lbl.value ILIKE '%Online%'
      JOIN appointment_contractors ac
        ON ac.appointment_id = a.appointment_id
      WHERE a.topic ILIKE '%trial%'
        AND a.start BETWEEN $1 AND $2
      ORDER BY a.start
    `,
    [start, end]
  );
  return rows;
}

async function getGroupStudentsDetail(client, start, end) {
  const { rows } = await client.query(
    `
      WITH student_counts AS (
        SELECT
          a.appointment_id,
          COUNT(
            CASE
              WHEN ar.status IN ('attended','missed-chargeable')
                AND ar.charge_rate NOT IN (80.00,112.66,119.00)
                AND (s.labels::TEXT ILIKE '%home%' OR s.labels::TEXT ILIKE '%online%')
                AND a.status = 'complete'
              THEN 1
            END
          ) AS eligible_students
        FROM appointment_recipients ar
        JOIN appointments a
          ON ar.appointment_id = a.appointment_id
        JOIN services s
          ON a.service_id    = s.service_id
        WHERE a.start BETWEEN $1 AND $2
        GROUP BY a.appointment_id
      )
      SELECT
        appointment_id,
        eligible_students AS student_count
      FROM student_counts
      WHERE eligible_students >= 2
    `,
    [start, end]
  );
  return rows;
}

async function getGroupBonusDetail(client, start, end) {
  const { rows } = await client.query(
    `
      WITH lesson_counts AS (
        SELECT
          a.appointment_id,
          COUNT(ar.recipient_id) AS student_count
        FROM appointments a
        JOIN appointment_recipients ar
          ON a.appointment_id = ar.appointment_id
        WHERE a.status IN ('complete','cancelled-chargeable')
          AND a.start BETWEEN $1 AND $2
        GROUP BY a.appointment_id
        HAVING COUNT(ar.recipient_id) >= 2
      )
      SELECT
        appointment_id,
        CASE
          WHEN student_count >= 5 THEN 40
          WHEN student_count >= 4 THEN 30
          WHEN student_count >= 3 THEN 20
          WHEN student_count >= 2 THEN 10
          ELSE 0
        END AS bonus
      FROM lesson_counts
    `,
    [start, end]
  );
  return rows;
}

async function getExpectedTutorPayDetail(client, start, end) {
  // Determine if sr_premium column exists (e.g., may be missing on some envs)
  const hasSrPremium = await columnExists(client, 'services', 'sr_premium');

  const premiumSQL = hasSrPremium
    ? ` + COALESCE(sc.student_count * s.sr_premium * a.units, 0)`
    : ``;

  const { rows } = await client.query(
    `
    SELECT
  a.appointment_id      AS lesson_id,
  a.start               AS lesson_start,
  a.charge_type,
  a.units,
  ac.pay_rate,
  ac.contractor_name,                  --  use directly from the same table
  s.name                AS service_name,
  (
    CASE a.charge_type
      WHEN 'hourly'        THEN ac.pay_rate
      WHEN 'one-off'       THEN ac.pay_rate
      WHEN 'hourly-split'  THEN ac.pay_rate
      WHEN 'one-off-split' THEN ac.pay_rate
      ELSE ac.pay_rate
    END${premiumSQL}
  ) AS tutor_pay
FROM appointments a
JOIN appointment_contractors ac ON ac.appointment_id = a.appointment_id
JOIN services s ON s.service_id = a.service_id
LEFT JOIN (
  SELECT appointment_id, COUNT(*) AS student_count
  FROM appointment_recipients
  WHERE status <> 'missed'
  GROUP BY appointment_id
) sc ON sc.appointment_id = a.appointment_id
WHERE a.status IN ('complete', 'cancelled-chargeable')
  AND a.start BETWEEN $1 AND $2
  AND EXISTS (
    SELECT 1
    FROM jsonb_array_elements_text(COALESCE(s.labels, '[]'::jsonb)) AS lbl
    WHERE lbl NOT ILIKE '%Non teaching%'
      AND lbl NOT ILIKE '%First Lesson Complete%'
      AND lbl NOT ILIKE '%Sync to Website%'
      AND lbl NOT ILIKE '%Job Finished%'
  )
ORDER BY a.start DESC;

  `,
    [start, end]
  );

  return rows;
}

module.exports = {
  getLessonsReport,
  getLabelBreakdown,
  getLessonHoursReport,
  getStudentsReport,
  getExpectedRevenueReport,
  getPaidRevenueReport,
  getTutorAdhocPayReport,
  getGrossProfitMarginReport,
  getNetProfitMarginReport,
  getHomeLessonsReport,
  getHomeRevenueReport,
  getOnlineLessonsReport,
  getOnlineRevenueReport,
  getTutorPayReport,
  getLeadsReport,
  getConvertedLeadsReport,
  getUnconvertedLeadsReport,
  getLessonsPlacedReport,
  getTrialLessonsReport,
  getConvertedNotContinuedReport,
  getThreeLessonsReport,
  getSevenLessonsReport,
  getActiveTutorsReport,
  getInactiveTutorsReport,
  getTutorsByHoursReport,
  getConsistencyBonusReport,
  getGroupStudentsReport,
  getGroupBonusReport,
  getRevenueByLabel,
  getPaidRevenueByLabel,
  getAdditionalStudentsReport,
  getLessonsDetail,
  getLessonHoursDetail,
  getStudentsDetail,
  getRevenueDetail,
  getPaidRevenueDetail,
  getTutorPayDetail,
  getTutorAdhocPayDetail,
  getGrossProfitMarginDetail,
  getNetProfitMarginDetail,
  getHomeLessonsDetail,
  getHomeRevenueDetail,
  getOnlineLessonsDetail,
  getOnlineRevenueDetail,
  getLeadsDetail,
  getConvertedLeadsDetail,
  getUnconvertedLeadsDetail,
  getLessonsPlacedDetail,
  getTrialLessonsDetail,
  getConvertedNotContinuedDetail,
  getThreeLessonsDetail,
  getSevenLessonsDetail,
  getActiveTutorsDetail,
  getInactiveTutorsDetail,
  getTutorsByHoursDetail,
  getConsistencyBonusDetail,
  getGroupStudentsDetail,
  getGroupBonusDetail,
  getExpectedTutorPayReport,
  getExpectedTutorPayDetail,
  getCOGSByPayType,
  getCOGSByCategory,
};

/**
 * Get COGS broken down by pay type (1099 vs W-2)
 * @param {Object} client - PostgreSQL client
 * @param {Date} startDate - Start of period
 * @param {Date} endDate - End of period (exclusive)
 * @returns {Object} - { '1099': number, 'W-2': number, total: number }
 */
async function getCOGSByPayType(client, startDate, endDate) {
  const { rows } = await client.query(
    `
    WITH payment_data AS (
      SELECT
        po.id,
        po.payee_id,
        po.amount,
        c.labels as contractor_labels
      FROM payment_orders po
      LEFT JOIN contractors c ON po.payee_id = c.contractor_id
      WHERE po.status = 'paid'
        AND po.date_sent >= $1
        AND po.date_sent < $2
    )
    SELECT
      CASE
        WHEN EXISTS (
          SELECT 1 FROM jsonb_array_elements_text(COALESCE(contractor_labels, '[]'::jsonb)) AS lbl
          WHERE lbl.value ILIKE '%W2%' OR lbl.value = 'W-2'
        ) THEN 'W-2'
        ELSE '1099'
      END as pay_type,
      COALESCE(SUM(amount), 0) as total
    FROM payment_data
    GROUP BY
      CASE
        WHEN EXISTS (
          SELECT 1 FROM jsonb_array_elements_text(COALESCE(contractor_labels, '[]'::jsonb)) AS lbl
          WHERE lbl.value ILIKE '%W2%' OR lbl.value = 'W-2'
        ) THEN 'W-2'
        ELSE '1099'
      END
    `,
    [startDate, endDate]
  );

  const result = { '1099': 0, 'W-2': 0, total: 0 };
  for (const row of rows) {
    const amount = parseFloat(row.total) || 0;
    result[row.pay_type] = amount;
    result.total += amount;
  }
  return result;
}

/**
 * Get COGS broken down by service category (Home, Online, Retail, Schools, Other)
 * @param {Object} client - PostgreSQL client
 * @param {Date} startDate - Start of period
 * @param {Date} endDate - End of period (exclusive)
 * @returns {Object} - { home: number, online: number, retail: number, schools: number, other: number, total: number }
 */
async function getCOGSByCategory(client, startDate, endDate) {
  const { rows } = await client.query(
    `
    WITH
    -- Appointment-based pay categorized by service labels
    appointment_pay AS (
      SELECT
        poc.id,
        poc.amount,
        CASE
          WHEN EXISTS (
            SELECT 1 FROM jsonb_array_elements_text(COALESCE(s.labels, '[]'::jsonb)) AS lbl
            WHERE lbl.value ILIKE '%Home%'
          ) THEN 'home'
          WHEN EXISTS (
            SELECT 1 FROM jsonb_array_elements_text(COALESCE(s.labels, '[]'::jsonb)) AS lbl
            WHERE lbl.value ILIKE '%Online%'
          ) THEN 'online'
          WHEN EXISTS (
            SELECT 1 FROM jsonb_array_elements_text(COALESCE(s.labels, '[]'::jsonb)) AS lbl
            WHERE lbl.value ILIKE '%School%'
          ) THEN 'schools'
          WHEN EXISTS (
            SELECT 1 FROM jsonb_array_elements_text(COALESCE(s.labels, '[]'::jsonb)) AS lbl
            WHERE lbl.value ILIKE '%Club%' OR lbl.value ILIKE '%Park Slope%' OR lbl.value ILIKE '%UES%'
          ) THEN 'retail'
          ELSE 'other'
        END as category
      FROM payment_order_charges poc
      JOIN payment_orders po ON poc.payment_order_id = po.id
      JOIN appointments a ON poc.appointment_id = a.appointment_id
      JOIN services s ON a.service_id = s.service_id
      WHERE po.status = 'paid'
        AND po.date_sent >= $1
        AND po.date_sent < $2
        AND poc.appointment_id IS NOT NULL
    ),
    -- Ad hoc charges (not linked to appointments)
    adhoc_pay AS (
      SELECT
        poc.id,
        poc.amount,
        COALESCE(ac.service_category, 'other') as category
      FROM payment_order_charges poc
      JOIN payment_orders po ON poc.payment_order_id = po.id
      LEFT JOIN adhoc_charges ac ON poc.adhoc_charge_id = ac.id
      WHERE po.status = 'paid'
        AND po.date_sent >= $1
        AND po.date_sent < $2
        AND poc.adhoc_charge_id IS NOT NULL
    ),
    -- Combine both sources
    all_pay AS (
      SELECT category, amount FROM appointment_pay
      UNION ALL
      SELECT category, amount FROM adhoc_pay
    )
    SELECT
      category,
      COALESCE(SUM(amount), 0) as total
    FROM all_pay
    GROUP BY category
    `,
    [startDate, endDate]
  );

  const result = { home: 0, online: 0, retail: 0, schools: 0, other: 0, total: 0 };
  for (const row of rows) {
    const amount = parseFloat(row.total) || 0;
    result[row.category] = amount;
    result.total += amount;
  }
  return result;
}
