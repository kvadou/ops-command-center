const express = require('express');
const { DateTime } = require('luxon');
const { parseUTC, toNY } = require('../utils/date');
const { columnExists } = require('../utils/schema-cache');
const { asyncHandler } = require('../middleware/error-handler');
const { logger } = require('../utils/logger');
const {
  pool,
  axios,
  cloudinary,
  tutorCruncherAPI,
  limitedGet,
  jwt,
  stripe,
  transporter,
  db,
  sequelize,
  Service,
  Location,
  ColourGroup,
  Appointment,
  delay,
  rateLimitRetry,
  auth,
  GRAVITY_FORMS_API_BASE_URL,
  KLAVIYO_API_KEY,
  LABEL_ID,
  TUTORCRUNCHER_API_BASE
} = global;

// Helper function to identify tutor-based labels
function identifyLabelTypes(labels) {
  if (!labels || labels.length === 0) {
    return { serviceLabels: [], tutorLabels: [], marketTutorFilters: [] };
  }
  
  const serviceLabels = [];
  const tutorLabels = [];
  const marketTutorFilters = [];
  
  labels.forEach(label => {
    // Employment type labels (1099, W2)
    if (label === '1099' || label === 'W2') {
      tutorLabels.push(label);
    }
    // Market-based tutor filters (Tutor - LA, Tutor - NYC, Tutor - SF)
    else if (label.startsWith('Tutor - ')) {
      const market = label.replace('Tutor - ', '').trim();
      marketTutorFilters.push(market);
    }
    // All other labels are service-based
    else {
      serviceLabels.push(label);
    }
  });
  
  return { serviceLabels, tutorLabels, marketTutorFilters };
}

// Helper function to build label filter SQL with AND logic
// Returns { serviceFilterSQL, tutorFilterSQL, params, needsContractorJoin }
function buildLabelFilters(serviceLabels, tutorLabels, marketTutorFilters, paramOffset = 3) {
  let serviceFilterSQL = '';
  let tutorFilterSQL = '';
  const params = [];
  let paramIndex = paramOffset;
  const needsContractorJoin = tutorLabels.length > 0 || marketTutorFilters.length > 0;
  
  // Service label filters - OR logic: any selected service label can match
  if (serviceLabels.length > 0) {
    const serviceConditions = serviceLabels.map((label) => {
      params.push(`%${label}%`);
      const currentParam = paramIndex;
      paramIndex++;
      return `EXISTS (SELECT 1 FROM jsonb_array_elements_text(COALESCE(s.labels, '[]'::jsonb)) AS lbl(value) WHERE lbl.value ILIKE $${currentParam})`;
    });
    // Wrap OR conditions in parentheses for correct operator precedence
    serviceFilterSQL = `AND (${serviceConditions.join(' OR ')})`;
  }
  
  // Tutor label filters (1099, W2) - OR logic: any selected tutor label can match
  if (tutorLabels.length > 0) {
    const tutorConditions = tutorLabels.map((label) => {
      params.push(`%${label}%`);
      const currentParam = paramIndex;
      paramIndex++;
      return `EXISTS (SELECT 1 FROM jsonb_array_elements_text(COALESCE(c.labels, '[]'::jsonb)) AS tutor_lbl(value) WHERE tutor_lbl.value ILIKE $${currentParam})`;
    });
    // Wrap OR conditions in parentheses for correct operator precedence
    tutorFilterSQL = `AND (${tutorConditions.join(' OR ')})`;
  }
  
  // Market-based tutor filters (Tutor - LA, etc.) - OR logic: tutor can match any selected market
  if (marketTutorFilters.length > 0) {
    const marketConditions = marketTutorFilters.map((market) => {
      // Check if contractor has labels matching this market (e.g., "Home - LA" or "School - LA")
      // We need to match patterns like "Home - LA", "School - LA", etc.
      const homePattern = `%Home - ${market}%`;
      const schoolPattern = `%School - ${market}%`;
      params.push(homePattern);
      const homeParam = paramIndex;
      paramIndex++;
      params.push(schoolPattern);
      const schoolParam = paramIndex;
      paramIndex++;
      return `EXISTS (SELECT 1 FROM jsonb_array_elements_text(COALESCE(c.labels, '[]'::jsonb)) AS market_lbl(value) WHERE market_lbl.value ILIKE $${homeParam} OR market_lbl.value ILIKE $${schoolParam})`;
    });
    if (tutorFilterSQL) {
      tutorFilterSQL += ` AND (${marketConditions.join(' OR ')})`;
    } else {
      tutorFilterSQL = `AND (${marketConditions.join(' OR ')})`;
    }
  }
  
  return { serviceFilterSQL, tutorFilterSQL, params, needsContractorJoin };
}

// Define detailFns object with metric handlers
const detailFns = {
  revenue: async (client, startUTC, endUTC, customLabels = null, onlyLabel = false) => {
    // Separate labels into service, tutor, and market types
    const { serviceLabels, tutorLabels, marketTutorFilters } = identifyLabelTypes(customLabels || []);
    const needsContractorJoin = tutorLabels.length > 0 || marketTutorFilters.length > 0;
    
    // Build filters
    let serviceFilterSQL = '';
    let tutorFilterSQL = '';
    let filterParams = [];
    
    if (customLabels && customLabels.length > 0) {
      if (onlyLabel && customLabels.length === 1 && customLabels[0] === "First Lesson Complete") {
        serviceFilterSQL = `AND jsonb_array_length(s.labels) = 1 AND s.labels @> '["First Lesson Complete"]'`;
      } else {
        const filters = buildLabelFilters(serviceLabels, tutorLabels, marketTutorFilters, 3, 'c');
        serviceFilterSQL = filters.serviceFilterSQL;
        tutorFilterSQL = filters.tutorFilterSQL;
        filterParams = filters.params;
      }
    }
    
    const query = needsContractorJoin ? `
      WITH distinct_appointments AS (
        SELECT DISTINCT a.appointment_id, a.start, a.finish, a.status, a.units, s.service_id, s.name, s.dft_charge_type, s.dft_charge_rate, s.labels
        FROM appointments a
        LEFT JOIN services s ON a.service_id = s.service_id
        JOIN appointment_contractors ac_rev ON a.appointment_id = ac_rev.appointment_id
        JOIN contractors c ON ac_rev.contractor_id = c.contractor_id
        WHERE a.start >= $1 
          AND a.start < $2
          AND a.status IN ('complete', 'cancelled-chargeable')
          AND a.is_deleted IS NOT TRUE
          ${serviceFilterSQL}
          ${tutorFilterSQL}
      )
      SELECT 
        da.appointment_id,
        da.start,
        da.finish,
        da.status,
        da.name as service_name,
        ar.recipient_name,
        ar.charge_rate,
        da.units,
        CASE
          WHEN da.dft_charge_type = 'hourly' THEN ar.charge_rate * da.units
          WHEN da.dft_charge_type = 'one-off' THEN ar.charge_rate
          WHEN da.dft_charge_type = 'one-off-split' THEN ar.charge_rate
          WHEN da.dft_charge_type = 'hourly-split' THEN ar.charge_rate * da.units
          ELSE ar.charge_rate * da.units
        END as expected_revenue,
        da.labels as service_labels
      FROM distinct_appointments da
      LEFT JOIN appointment_recipients ar ON da.appointment_id = ar.appointment_id
      WHERE ar.status <> 'missed'
      ORDER BY da.start DESC
    ` : `
      SELECT 
        a.appointment_id,
        a.start,
        a.finish,
        a.status,
        s.name as service_name,
        ar.recipient_name,
        ar.charge_rate,
        a.units,
        CASE
          WHEN a.charge_type = 'hourly' THEN ar.charge_rate * a.units
          WHEN a.charge_type = 'one-off' THEN ar.charge_rate
          WHEN a.charge_type = 'one-off-split' THEN ar.charge_rate
          WHEN a.charge_type = 'hourly-split' THEN ar.charge_rate * a.units
          ELSE ar.charge_rate * a.units
        END as expected_revenue,
        s.labels as service_labels
      FROM appointments a
      LEFT JOIN services s ON a.service_id = s.service_id
      LEFT JOIN appointment_recipients ar ON a.appointment_id = ar.appointment_id
      WHERE a.start >= $1
        AND a.start < $2
        AND a.status IN ('complete', 'cancelled-chargeable')
        AND a.is_deleted IS NOT TRUE
        AND ar.status <> 'missed'
        ${serviceFilterSQL}
      ORDER BY a.start DESC
    `;
    
    const params = filterParams.length > 0 
      ? [startUTC, endUTC, ...filterParams]
      : [startUTC, endUTC];
    
    const result = await client.query(query, params);
    return result.rows;
  },
  lessons: async (client, startUTC, endUTC, customLabels = null, onlyLabel = false) => {
    // Separate labels into service, tutor, and market types
    const { serviceLabels, tutorLabels, marketTutorFilters } = identifyLabelTypes(customLabels || []);
    const needsContractorJoin = tutorLabels.length > 0 || marketTutorFilters.length > 0;
    
    // Build filters
    let serviceFilterSQL = '';
    let tutorFilterSQL = '';
    let filterParams = [];
    
    if (customLabels && customLabels.length > 0) {
      if (onlyLabel && customLabels.length === 1 && customLabels[0] === "First Lesson Complete") {
        serviceFilterSQL = `AND jsonb_array_length(s.labels) = 1 AND s.labels @> '["First Lesson Complete"]'`;
      } else {
        const filters = buildLabelFilters(serviceLabels, tutorLabels, marketTutorFilters, 3, 'c');
        serviceFilterSQL = filters.serviceFilterSQL;
        tutorFilterSQL = filters.tutorFilterSQL;
        filterParams = filters.params;
      }
    }
    
    const query = `
      WITH contractor_data AS (
        SELECT 
          ac.appointment_id,
          STRING_AGG(DISTINCT ac.contractor_name, ', ') AS contractor_names,
          SUM(
            CASE
              WHEN a.charge_type = 'hourly'
                THEN ac.pay_rate * a.units
              WHEN a.charge_type = 'one-off'
                THEN ac.pay_rate
              WHEN a.charge_type = 'one-off-split'
                THEN ac.pay_rate
              WHEN a.charge_type = 'hourly-split'
                THEN ac.pay_rate * a.units
              ELSE
                ac.pay_rate * a.units
            END
          ) + COALESCE(
            (SELECT COUNT(*) * s.sr_premium * a.units
             FROM appointment_recipients ar2
             WHERE ar2.appointment_id = ac.appointment_id
               AND ar2.status <> 'missed'
            ),
            0
          ) AS total_tutor_pay
        FROM appointment_contractors ac
        JOIN appointments a ON ac.appointment_id = a.appointment_id
        LEFT JOIN services s ON a.service_id = s.service_id
        ${needsContractorJoin ? `
        JOIN contractors c ON ac.contractor_id = c.contractor_id
        ` : ''}
        WHERE a.start >= $1 
          AND a.start < $2
          AND a.status IN ('complete', 'cancelled-chargeable')
          AND a.is_deleted IS NOT TRUE
          ${serviceFilterSQL}
          ${tutorFilterSQL}
        GROUP BY ac.appointment_id, s.sr_premium, a.units
      ),
      recipient_data AS (
        SELECT 
          ar.appointment_id,
          SUM(
            CASE
              WHEN a.charge_type = 'hourly' THEN ar.charge_rate * a.units
              WHEN a.charge_type = 'one-off' THEN ar.charge_rate
              WHEN a.charge_type = 'one-off-split' THEN ar.charge_rate
              WHEN a.charge_type = 'hourly-split' THEN ar.charge_rate * a.units
              ELSE ar.charge_rate * a.units
            END
          ) AS total_revenue
        FROM appointment_recipients ar
        JOIN appointments a ON ar.appointment_id = a.appointment_id
        LEFT JOIN services s ON a.service_id = s.service_id
        WHERE a.start >= $1 
          AND a.start < $2
          AND a.status IN ('complete', 'cancelled-chargeable')
          AND a.is_deleted IS NOT TRUE
          AND ar.status <> 'missed'
          ${serviceFilterSQL}
        GROUP BY ar.appointment_id
      ),
      distinct_appointments AS (
        SELECT DISTINCT a.appointment_id
        FROM appointments a
        LEFT JOIN services s ON a.service_id = s.service_id
        ${needsContractorJoin ? `
        JOIN appointment_contractors ac_main ON a.appointment_id = ac_main.appointment_id
        JOIN contractors c ON ac_main.contractor_id = c.contractor_id
        ` : ''}
        WHERE a.start >= $1 
          AND a.start < $2
          AND a.status IN ('complete', 'cancelled-chargeable')
          AND a.is_deleted IS NOT TRUE
          ${serviceFilterSQL}
          ${tutorFilterSQL}
      )
      SELECT 
        a.appointment_id as "lessonId",
        a.start,
        a.finish,
        a.topic,
        a.status,
        s.name as "jobName",
        ROUND(a.units::numeric, 2) as hours,
        COALESCE(cd.contractor_names, '') AS "tutorName",
        ROUND(COALESCE(cd.total_tutor_pay, 0)::numeric, 2) AS tutor_pay,
        ROUND(COALESCE(rd.total_revenue, 0)::numeric, 2) as revenue,
        s.labels as service_labels
      FROM appointments a
      LEFT JOIN services s ON a.service_id = s.service_id
      LEFT JOIN contractor_data cd ON a.appointment_id = cd.appointment_id
      LEFT JOIN recipient_data rd ON a.appointment_id = rd.appointment_id
      INNER JOIN distinct_appointments da ON a.appointment_id = da.appointment_id
      WHERE a.start >= $1 
        AND a.start < $2
        AND a.status IN ('complete', 'cancelled-chargeable')
        AND a.is_deleted IS NOT TRUE
      ORDER BY a.start DESC
    `;
    
    const params = filterParams.length > 0 
      ? [startUTC, endUTC, ...filterParams]
      : [startUTC, endUTC];
    
    const result = await client.query(query, params);
    return result.rows;
  },
  hours: async (client, startUTC, endUTC, customLabels = null, onlyLabel = false) => {
    // Separate labels into service, tutor, and market types
    const { serviceLabels, tutorLabels, marketTutorFilters } = identifyLabelTypes(customLabels || []);
    const needsContractorJoin = tutorLabels.length > 0 || marketTutorFilters.length > 0;
    
    // Build filters
    let serviceFilterSQL = '';
    let tutorFilterSQL = '';
    let filterParams = [];
    
    if (customLabels && customLabels.length > 0) {
      if (onlyLabel && customLabels.length === 1 && customLabels[0] === "First Lesson Complete") {
        serviceFilterSQL = `AND jsonb_array_length(s.labels) = 1 AND s.labels @> '["First Lesson Complete"]'`;
      } else {
        const filters = buildLabelFilters(serviceLabels, tutorLabels, marketTutorFilters, 3, 'c');
        serviceFilterSQL = filters.serviceFilterSQL;
        tutorFilterSQL = filters.tutorFilterSQL;
        filterParams = filters.params;
      }
    }
    
    const query = needsContractorJoin ? `
      WITH appointment_contractor_counts AS (
        SELECT 
          a.appointment_id,
          COUNT(DISTINCT ac.contractor_id)::numeric AS contractor_count
        FROM appointments a
        JOIN appointment_contractors ac ON a.appointment_id = ac.appointment_id
        JOIN services s ON a.service_id = s.service_id
        WHERE a.status IN ('complete','cancelled-chargeable')
          AND a.is_deleted IS NOT TRUE
          AND a.start >= $1 AND a.start < $2
          AND NOT (
            EXISTS (
              SELECT 1 
              FROM jsonb_array_elements_text(s.labels) AS label(value)
              WHERE label.value ILIKE '%non teaching%' 
                OR label.value ILIKE '%support%'
                OR label.value ILIKE '%admin%'
                OR label.value ILIKE '%meeting%'
            )
          )
        GROUP BY a.appointment_id
      ),
      distinct_appointments AS (
        SELECT DISTINCT 
          a.appointment_id, 
          a.units / COALESCE(acc.contractor_count, 1) AS units_per_contractor,
          ac.contractor_id, 
          ac.contractor_name
        FROM appointment_contractors ac
        JOIN appointments a ON ac.appointment_id = a.appointment_id
        JOIN services s ON a.service_id = s.service_id
        JOIN contractors c ON ac.contractor_id = c.contractor_id
        LEFT JOIN appointment_contractor_counts acc ON a.appointment_id = acc.appointment_id
        WHERE a.status IN ('complete','cancelled-chargeable')
          AND a.is_deleted IS NOT TRUE
          AND a.start >= $1 AND a.start < $2
          AND NOT (
            EXISTS (
              SELECT 1 
              FROM jsonb_array_elements_text(s.labels) AS label(value)
              WHERE label.value ILIKE '%non teaching%' 
                OR label.value ILIKE '%support%'
                OR label.value ILIKE '%admin%'
                OR label.value ILIKE '%meeting%'
            )
          )
          ${serviceFilterSQL}
          ${tutorFilterSQL}
      )
      SELECT 
        da.contractor_id AS tutor_id,
        da.contractor_name AS tutor_name,
        ROUND(SUM(da.units_per_contractor)::numeric, 2) AS total_hours
      FROM distinct_appointments da
      GROUP BY da.contractor_id, da.contractor_name
      ORDER BY total_hours DESC
    ` : `
      WITH appointment_contractor_counts AS (
        SELECT 
          a.appointment_id,
          COUNT(DISTINCT ac.contractor_id)::numeric AS contractor_count
        FROM appointments a
        JOIN appointment_contractors ac ON a.appointment_id = ac.appointment_id
        JOIN services s ON a.service_id = s.service_id
        WHERE a.status IN ('complete','cancelled-chargeable')
          AND a.is_deleted IS NOT TRUE
          AND a.start >= $1 AND a.start < $2
          AND NOT (
            EXISTS (
              SELECT 1 
              FROM jsonb_array_elements_text(s.labels) AS label(value)
              WHERE label.value ILIKE '%non teaching%' 
                OR label.value ILIKE '%support%'
                OR label.value ILIKE '%admin%'
                OR label.value ILIKE '%meeting%'
            )
          )
        GROUP BY a.appointment_id
      )
      SELECT 
        ac.contractor_id AS tutor_id,
        ac.contractor_name AS tutor_name,
        ROUND(SUM(a.units / COALESCE(acc.contractor_count, 1))::numeric, 2) AS total_hours
      FROM appointment_contractors ac
      JOIN appointments a ON ac.appointment_id = a.appointment_id
      JOIN services s ON a.service_id = s.service_id
      LEFT JOIN appointment_contractor_counts acc ON a.appointment_id = acc.appointment_id
      WHERE a.status IN ('complete','cancelled-chargeable')
        AND a.is_deleted IS NOT TRUE
        AND a.start >= $1 AND a.start < $2
        AND NOT (
          EXISTS (
            SELECT 1 
            FROM jsonb_array_elements_text(s.labels) AS label(value)
            WHERE label.value ILIKE '%non teaching%' 
              OR label.value ILIKE '%support%'
              OR label.value ILIKE '%admin%'
              OR label.value ILIKE '%meeting%'
          )
        )
        ${serviceFilterSQL}
      GROUP BY ac.contractor_id, ac.contractor_name
      ORDER BY total_hours DESC
    `;
    
    const params = filterParams.length > 0 
      ? [startUTC, endUTC, ...filterParams]
      : [startUTC, endUTC];
    
    const result = await client.query(query, params);
    return result.rows;
  },
  students: async (client, startUTC, endUTC, customLabels = null, onlyLabel = false) => {
    // Separate labels into service, tutor, and market types
    const { serviceLabels, tutorLabels, marketTutorFilters } = identifyLabelTypes(customLabels || []);
    const needsContractorJoin = tutorLabels.length > 0 || marketTutorFilters.length > 0;
    
    // Build filters
    let serviceFilterSQL = '';
    let tutorFilterSQL = '';
    let filterParams = [];
    
    if (customLabels && customLabels.length > 0) {
      if (onlyLabel && customLabels.length === 1 && customLabels[0] === "First Lesson Complete") {
        serviceFilterSQL = `AND jsonb_array_length(s.labels) = 1 AND s.labels @> '["First Lesson Complete"]'`;
      } else {
        const filters = buildLabelFilters(serviceLabels, tutorLabels, marketTutorFilters, 3, 'c');
        serviceFilterSQL = filters.serviceFilterSQL;
        tutorFilterSQL = filters.tutorFilterSQL;
        filterParams = filters.params;
      }
    }
    
    const query = needsContractorJoin ? `
      WITH distinct_appointments AS (
        SELECT DISTINCT a.appointment_id
        FROM appointments a
        LEFT JOIN services s ON a.service_id = s.service_id
        JOIN appointment_contractors ac_stud ON a.appointment_id = ac_stud.appointment_id
        JOIN contractors c ON ac_stud.contractor_id = c.contractor_id
        WHERE a.start >= $1 
          AND a.start < $2
          AND a.status IN ('complete', 'cancelled-chargeable')
          AND a.is_deleted IS NOT TRUE
          ${serviceFilterSQL}
          ${tutorFilterSQL}
      )
      SELECT 
        ar.recipient_id AS student_id,
        ar.recipient_name AS student_name,
        (
          SELECT ar2.paying_client_name
          FROM appointment_recipients ar2
          JOIN appointments a2 ON a2.appointment_id = ar2.appointment_id
          WHERE ar2.recipient_id = ar.recipient_id
            AND ar2.status <> 'missed'
            AND a2.start >= $1
            AND a2.start < $2
            AND a2.status IN ('complete', 'cancelled-chargeable')
          GROUP BY ar2.paying_client_name
          ORDER BY COUNT(DISTINCT a2.appointment_id) DESC, ar2.paying_client_name ASC
          LIMIT 1
        ) AS client_name,
        COUNT(DISTINCT da.appointment_id) AS lesson_count
      FROM distinct_appointments da
      JOIN appointment_recipients ar ON da.appointment_id = ar.appointment_id
      WHERE ar.status <> 'missed'
      GROUP BY ar.recipient_id, ar.recipient_name
      ORDER BY lesson_count DESC, ar.recipient_name ASC
    ` : `
      SELECT 
        ar.recipient_id AS student_id,
        ar.recipient_name AS student_name,
        (
          SELECT ar2.paying_client_name
          FROM appointment_recipients ar2
          JOIN appointments a2 ON a2.appointment_id = ar2.appointment_id
          WHERE ar2.recipient_id = ar.recipient_id
            AND ar2.status <> 'missed'
            AND a2.start >= $1
            AND a2.start < $2
            AND a2.status IN ('complete', 'cancelled-chargeable')
          GROUP BY ar2.paying_client_name
          ORDER BY COUNT(DISTINCT a2.appointment_id) DESC, ar2.paying_client_name ASC
          LIMIT 1
        ) AS client_name,
        COUNT(DISTINCT a.appointment_id) AS lesson_count
      FROM appointments a
      LEFT JOIN services s ON a.service_id = s.service_id
      LEFT JOIN appointment_recipients ar ON a.appointment_id = ar.appointment_id
      WHERE a.start >= $1 
        AND a.start < $2
        AND a.status IN ('complete', 'cancelled-chargeable')
        AND a.is_deleted IS NOT TRUE
        AND ar.status <> 'missed'
        ${serviceFilterSQL}
      GROUP BY ar.recipient_id, ar.recipient_name
      ORDER BY lesson_count DESC, ar.recipient_name ASC
    `;
    
    const params = filterParams.length > 0 
      ? [startUTC, endUTC, ...filterParams]
      : [startUTC, endUTC];
    
    const result = await client.query(query, params);
    return result.rows;
  },
  
  paidRevenue: async (client, startUTC, endUTC) => {
    const query = `
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
        AND i.date_sent >= $1 AND i.date_sent < $2
      ORDER BY i.date_sent DESC
    `;
    const result = await client.query(query, [startUTC, endUTC]);
    return result.rows;
  },

  tutorPay: async (client, startUTC, endUTC) => {
    const query = `
      SELECT
        po.id         AS payment_order_id,
        po.date_sent,
        po.amount
      FROM payment_orders po
      WHERE po.status = 'paid'
        AND po.date_sent >= $1 AND po.date_sent < $2
      ORDER BY po.date_sent DESC
    `;
    const result = await client.query(query, [startUTC, endUTC]);
    return result.rows;
  },

  tutorAdhocPay: async (client, startUTC, endUTC) => {
    const query = `
      SELECT
        po.id                AS payment_order_id,
        po.date_sent         AS date_sent,
        pc.adhoc_charge_id   AS charge_id,
        pc.amount            AS amount
      FROM payment_orders po
      JOIN payment_order_charges pc
        ON pc.payment_order_id = po.id
      WHERE po.status = 'paid'
        AND po.date_sent >= $1 AND po.date_sent < $2
        AND pc.adhoc_charge_id IS NOT NULL
      ORDER BY po.date_sent DESC, pc.adhoc_charge_id
    `;
    const result = await client.query(query, [startUTC, endUTC]);
    return result.rows;
  },

  expectedTutorPay: async (client, startUTC, endUTC, customLabels = null, onlyLabel = false) => {
    try {
      // Check if sr_premium column exists (cached after first call)
      const hasSrPremium = await columnExists(client, 'services', 'sr_premium');

      // Separate labels into service, tutor, and market types
      const { serviceLabels, tutorLabels, marketTutorFilters } = identifyLabelTypes(customLabels || []);
      const needsContractorJoin = tutorLabels.length > 0 || marketTutorFilters.length > 0;

      // Build filters
      let serviceFilterSQL = '';
      let tutorFilterSQL = '';
      let filterParams = [];

      if (customLabels && customLabels.length > 0) {
        if (onlyLabel && customLabels.length === 1 && customLabels[0] === "First Lesson Complete") {
          serviceFilterSQL = `AND jsonb_array_length(s.labels) = 1 AND s.labels @> '["First Lesson Complete"]'`;
        } else {
          const filters = buildLabelFilters(serviceLabels, tutorLabels, marketTutorFilters, 3, 'c');
          serviceFilterSQL = filters.serviceFilterSQL;
          tutorFilterSQL = filters.tutorFilterSQL;
          filterParams = filters.params;
        }
      }

      // Build sr_premium SQL fragment based on cached column check
      const srPremiumSQL_da = hasSrPremium ? `
          + COALESCE(
              CASE WHEN da.sr_premium IS NOT NULL AND da.sr_premium > 0 THEN
                (SELECT COUNT(*) * da.sr_premium * da.units
                   FROM appointment_recipients ar
                  WHERE ar.appointment_id = da.appointment_id
                    AND ar.status <> 'missed')
              ELSE 0 END
            , 0)` : '';
      const srPremiumSQL_s = hasSrPremium ? `
          + COALESCE(
              CASE WHEN s.sr_premium IS NOT NULL AND s.sr_premium > 0 THEN
                (SELECT COUNT(*) * s.sr_premium * a.units
                   FROM appointment_recipients ar
                  WHERE ar.appointment_id = a.appointment_id
                    AND ar.status <> 'missed')
              ELSE 0 END
            , 0)` : '';

      const query = needsContractorJoin ? `
        WITH distinct_appointments AS (
          SELECT DISTINCT a.appointment_id, a.start, a.status, a.charge_type, a.units, s.service_id, s.name, s.dft_charge_type, s.dft_charge_rate, s.sr_premium, s.labels
          FROM appointments a
          LEFT JOIN services s ON a.service_id = s.service_id
          JOIN appointment_contractors ac ON a.appointment_id = ac.appointment_id
          JOIN contractors c ON ac.contractor_id = c.contractor_id
          WHERE a.start >= $1 
            AND a.start < $2
            AND a.status IN ('complete', 'cancelled-chargeable')
            AND a.is_deleted IS NOT TRUE
            ${serviceFilterSQL}
            ${tutorFilterSQL}
        ),
        recipient_revenue AS (
          SELECT 
            ar.appointment_id,
            SUM(
              CASE
                WHEN da.dft_charge_type = 'hourly' THEN ar.charge_rate * da.units
                WHEN da.dft_charge_type = 'one-off' THEN ar.charge_rate
                WHEN da.dft_charge_type = 'one-off-split' THEN ar.charge_rate
                WHEN da.dft_charge_type = 'hourly-split' THEN ar.charge_rate * da.units
                ELSE ar.charge_rate * da.units
              END
            ) as total_revenue
          FROM distinct_appointments da
          LEFT JOIN appointment_recipients ar ON da.appointment_id = ar.appointment_id
          WHERE ar.status <> 'missed'
          GROUP BY ar.appointment_id
        )
        SELECT 
          da.appointment_id,
          da.start,
          da.start as lesson_start,
          da.status,
          da.name as service_name,
          ac.contractor_id,
          COALESCE(c.first_name || ' ' || c.last_name, 'Unknown Contractor') as contractor_name,
          COALESCE(ac.pay_rate, 0) as pay_rate,
          COALESCE(da.units, 0) as units,
          -- base pay calculation
          CASE
            WHEN da.charge_type = 'hourly' THEN COALESCE(ac.pay_rate, 0) * COALESCE(da.units, 0)
            WHEN da.charge_type = 'one-off' THEN COALESCE(ac.pay_rate, 0)
            WHEN da.charge_type = 'one-off-split' THEN COALESCE(ac.pay_rate, 0)
            WHEN da.charge_type = 'hourly-split' THEN COALESCE(ac.pay_rate, 0) * COALESCE(da.units, 0)
            ELSE COALESCE(ac.pay_rate, 0) * COALESCE(da.units, 0)
          END
          -- add sr_premium if column exists and has value (for each student)
          ${srPremiumSQL_da} AS expected_tutor_pay,
          COALESCE(rr.total_revenue, 0) as expected_revenue,
          da.labels as service_labels
        FROM distinct_appointments da
        LEFT JOIN appointment_contractors ac ON da.appointment_id = ac.appointment_id
        LEFT JOIN contractors c ON ac.contractor_id = c.contractor_id
        LEFT JOIN recipient_revenue rr ON da.appointment_id = rr.appointment_id
        ORDER BY da.start DESC
      ` : `
        WITH recipient_revenue AS (
          SELECT 
            ar.appointment_id,
            SUM(
              CASE
                WHEN s.dft_charge_type = 'hourly' THEN ar.charge_rate * a.units
                WHEN s.dft_charge_type = 'one-off' THEN ar.charge_rate
                WHEN s.dft_charge_type = 'one-off-split' THEN ar.charge_rate
                WHEN s.dft_charge_type = 'hourly-split' THEN ar.charge_rate * a.units
                ELSE ar.charge_rate * a.units
              END
            ) as total_revenue
          FROM appointments a
          LEFT JOIN appointment_recipients ar ON a.appointment_id = ar.appointment_id
          LEFT JOIN services s ON a.service_id = s.service_id
          WHERE ar.status <> 'missed'
            AND a.start >= $1 
            AND a.start < $2
            AND a.status IN ('complete', 'cancelled-chargeable')
            AND a.is_deleted IS NOT TRUE
          GROUP BY ar.appointment_id
        )
        SELECT 
          a.appointment_id,
          a.start,
          a.start as lesson_start,
          a.status,
          s.name as service_name,
          ac.contractor_id,
          COALESCE(c.first_name || ' ' || c.last_name, 'Unknown Contractor') as contractor_name,
          COALESCE(ac.pay_rate, 0) as pay_rate,
          COALESCE(a.units, 0) as units,
          -- base pay calculation
          CASE
            WHEN a.charge_type = 'hourly' THEN COALESCE(ac.pay_rate, 0) * COALESCE(a.units, 0)
            WHEN a.charge_type = 'one-off' THEN COALESCE(ac.pay_rate, 0)
            WHEN a.charge_type = 'one-off-split' THEN COALESCE(ac.pay_rate, 0)
            WHEN a.charge_type = 'hourly-split' THEN COALESCE(ac.pay_rate, 0) * COALESCE(a.units, 0)
            ELSE COALESCE(ac.pay_rate, 0) * COALESCE(a.units, 0)
          END
          -- add sr_premium if column exists and has value (for each student)
          ${srPremiumSQL_s} AS expected_tutor_pay,
          COALESCE(rr.total_revenue, 0) as expected_revenue,
          s.labels as service_labels
        FROM appointments a
        LEFT JOIN services s ON a.service_id = s.service_id
        LEFT JOIN appointment_contractors ac ON a.appointment_id = ac.appointment_id
        LEFT JOIN contractors c ON ac.contractor_id = c.contractor_id
        LEFT JOIN recipient_revenue rr ON a.appointment_id = rr.appointment_id
        WHERE a.start >= $1 
          AND a.start < $2
          AND a.status IN ('complete', 'cancelled-chargeable')
        AND a.is_deleted IS NOT TRUE
        ${serviceFilterSQL}
        ORDER BY a.start DESC
      `;
      
      const params = filterParams.length > 0 
        ? [startUTC, endUTC, ...filterParams]
        : [startUTC, endUTC];
      
      const result = await client.query(query, params);
      return result.rows;
    } catch (error) {
      logger.error({ err: error }, 'Error in expectedTutorPay query');
      return [{ message: 'Error loading expected tutor pay details', error: error.message }];
    }
  },

  home: async (client, startUTC, endUTC) => {
    const query = `
      WITH contractor_pay AS (
        SELECT
          ac.appointment_id,
          STRING_AGG(DISTINCT ac.contractor_name, ', ') AS contractor_names,
          SUM(
            CASE a.charge_type
              WHEN 'hourly' THEN ac.pay_rate
              WHEN 'one-off' THEN ac.pay_rate
              WHEN 'hourly-split' THEN ac.pay_rate
              WHEN 'one-off-split' THEN ac.pay_rate
              ELSE ac.pay_rate
            END
          ) AS base_tutor_pay
        FROM appointment_contractors ac
        JOIN appointments a ON a.appointment_id = ac.appointment_id
        JOIN services s ON a.service_id = s.service_id
        WHERE a.start >= $1 
          AND a.start < $2
          AND a.status IN ('complete', 'cancelled-chargeable')
          AND a.is_deleted IS NOT TRUE
          AND EXISTS (
            SELECT 1 FROM jsonb_array_elements_text(s.labels) AS label
            WHERE label IN ('Home - Hamptons', 'Home - LA', 'Home - NYC', 'Home - SF', 'Home - Westchester')
          )
        GROUP BY ac.appointment_id
      ),
      student_premium AS (
        SELECT
          a.appointment_id,
          COALESCE(
            CASE 
              WHEN s.sr_premium IS NOT NULL AND s.sr_premium > 0 THEN
                (SELECT COUNT(*) * s.sr_premium * a.units
                 FROM appointment_recipients ar
                 WHERE ar.appointment_id = a.appointment_id
                   AND ar.status <> 'missed')
              ELSE 0
            END
          , 0) AS premium_pay
        FROM appointments a
        LEFT JOIN services s ON a.service_id = s.service_id
        WHERE a.start >= $1 
          AND a.start < $2
          AND a.status IN ('complete', 'cancelled-chargeable')
          AND a.is_deleted IS NOT TRUE
          AND EXISTS (
            SELECT 1 FROM jsonb_array_elements_text(s.labels) AS label
            WHERE label IN ('Home - Hamptons', 'Home - LA', 'Home - NYC', 'Home - SF', 'Home - Westchester')
          )
      )
      SELECT 
        a.appointment_id,
        a.start,
        a.finish,
        a.topic,
        a.status,
        s.name as service_name,
        EXTRACT(EPOCH FROM (a.finish - a.start))/3600 as duration_hours,
        cp.contractor_names AS contractor_name,
        COALESCE(cp.base_tutor_pay, 0) + COALESCE(sp.premium_pay, 0) AS tutor_pay,
        SUM(
          CASE
            WHEN a.charge_type = 'hourly' THEN ar.charge_rate * a.units
            WHEN a.charge_type = 'one-off' THEN ar.charge_rate
            WHEN a.charge_type = 'one-off-split' THEN ar.charge_rate
            WHEN a.charge_type = 'hourly-split' THEN ar.charge_rate * a.units
            ELSE ar.charge_rate * a.units
          END
         ) as expected_revenue,
         s.labels as service_labels
       FROM appointments a
       LEFT JOIN services s ON a.service_id = s.service_id
       LEFT JOIN contractor_pay cp ON cp.appointment_id = a.appointment_id
       LEFT JOIN student_premium sp ON sp.appointment_id = a.appointment_id
       LEFT JOIN appointment_recipients ar ON a.appointment_id = ar.appointment_id AND ar.status <> 'missed'
       WHERE a.start >= $1 
         AND a.start < $2
         AND a.status IN ('complete', 'cancelled-chargeable')
         AND a.is_deleted IS NOT TRUE
         AND EXISTS (
           SELECT 1 FROM jsonb_array_elements_text(s.labels) AS label
           WHERE label IN ('Home - Hamptons', 'Home - LA', 'Home - NYC', 'Home - SF', 'Home - Westchester')
         )
       GROUP BY a.appointment_id, a.start, a.finish, a.topic, a.status, s.name, s.labels, cp.base_tutor_pay, sp.premium_pay, cp.contractor_names
      ORDER BY a.start DESC
    `;
    const result = await client.query(query, [startUTC, endUTC]);
    return result.rows;
  },

  homeRevenue: async (client, startUTC, endUTC) => {
    const query = `
      SELECT 
        a.appointment_id,
        a.start as lesson_start,
        a.status,
        s.name as service_name,
        ar.recipient_id,
        ar.recipient_name,
        ar.charge_rate,
        a.units,
        CASE
          WHEN a.charge_type = 'hourly' THEN ar.charge_rate * a.units
          WHEN a.charge_type = 'one-off' THEN ar.charge_rate
          WHEN a.charge_type = 'one-off-split' THEN ar.charge_rate
          WHEN a.charge_type = 'hourly-split' THEN ar.charge_rate * a.units
          ELSE ar.charge_rate * a.units
        END as expected_revenue
      FROM appointments a
      LEFT JOIN services s ON a.service_id = s.service_id
      LEFT JOIN appointment_recipients ar ON a.appointment_id = ar.appointment_id
      WHERE a.start >= $1
        AND a.start < $2
        AND a.status IN ('complete', 'cancelled-chargeable')
        AND a.is_deleted IS NOT TRUE
        AND ar.status <> 'missed'
        AND EXISTS (
          SELECT 1 FROM jsonb_array_elements_text(s.labels) AS label
          WHERE label IN ('Home - Hamptons', 'Home - LA', 'Home - NYC', 'Home - SF', 'Home - Westchester')
        )
      ORDER BY a.start DESC
    `;
    const result = await client.query(query, [startUTC, endUTC]);
    return result.rows;
  },

  clubs: async (client, startUTC, endUTC) => {
    const query = `
      WITH contractor_pay AS (
        SELECT
          ac.appointment_id,
          STRING_AGG(DISTINCT ac.contractor_name, ', ') AS contractor_names,
          SUM(
            CASE a.charge_type
              WHEN 'hourly' THEN ac.pay_rate
              WHEN 'one-off' THEN ac.pay_rate
              WHEN 'hourly-split' THEN ac.pay_rate
              WHEN 'one-off-split' THEN ac.pay_rate
              ELSE ac.pay_rate
            END
          ) AS base_tutor_pay
        FROM appointment_contractors ac
        JOIN appointments a ON a.appointment_id = ac.appointment_id
        JOIN services s ON a.service_id = s.service_id
        WHERE a.start >= $1 
          AND a.start < $2
          AND a.status IN ('complete', 'cancelled-chargeable')
          AND a.is_deleted IS NOT TRUE
          AND EXISTS (
            SELECT 1 FROM jsonb_array_elements_text(s.labels) AS label
            WHERE label IN ('Club - Park Slope', 'Club - Park Slope Support', 'Club - UES', 'Club - UES Support')
          )
        GROUP BY ac.appointment_id
      ),
      student_premium AS (
        SELECT
          a.appointment_id,
          COALESCE(
            CASE 
              WHEN s.sr_premium IS NOT NULL AND s.sr_premium > 0 THEN
                (SELECT COUNT(*) * s.sr_premium * a.units
                 FROM appointment_recipients ar
                 WHERE ar.appointment_id = a.appointment_id
                   AND ar.status <> 'missed')
              ELSE 0
            END
          , 0) AS premium_pay
        FROM appointments a
        LEFT JOIN services s ON a.service_id = s.service_id
        WHERE a.start >= $1 
          AND a.start < $2
          AND a.status IN ('complete', 'cancelled-chargeable')
          AND a.is_deleted IS NOT TRUE
          AND EXISTS (
            SELECT 1 FROM jsonb_array_elements_text(s.labels) AS label
            WHERE label IN ('Club - Park Slope', 'Club - Park Slope Support', 'Club - UES', 'Club - UES Support')
          )
      )
      SELECT 
        a.appointment_id,
        a.start,
        a.finish,
        a.topic,
        a.status,
        s.name as service_name,
        EXTRACT(EPOCH FROM (a.finish - a.start))/3600 as duration_hours,
        cp.contractor_names AS contractor_name,
        COALESCE(cp.base_tutor_pay, 0) + COALESCE(sp.premium_pay, 0) AS tutor_pay,
        SUM(
          CASE
            WHEN a.charge_type = 'hourly' THEN ar.charge_rate * a.units
            WHEN a.charge_type = 'one-off' THEN ar.charge_rate
            WHEN a.charge_type = 'one-off-split' THEN ar.charge_rate
            WHEN a.charge_type = 'hourly-split' THEN ar.charge_rate * a.units
            ELSE ar.charge_rate * a.units
          END
         ) as expected_revenue,
         s.labels as service_labels
       FROM appointments a
       LEFT JOIN services s ON a.service_id = s.service_id
       LEFT JOIN contractor_pay cp ON cp.appointment_id = a.appointment_id
       LEFT JOIN student_premium sp ON sp.appointment_id = a.appointment_id
       LEFT JOIN appointment_recipients ar ON a.appointment_id = ar.appointment_id AND ar.status <> 'missed'
       WHERE a.start >= $1 
         AND a.start < $2
         AND a.status IN ('complete', 'cancelled-chargeable')
         AND a.is_deleted IS NOT TRUE
         AND EXISTS (
           SELECT 1 FROM jsonb_array_elements_text(s.labels) AS label
           WHERE label IN ('Club - Park Slope', 'Club - Park Slope Support', 'Club - UES', 'Club - UES Support')
         )
       GROUP BY a.appointment_id, a.start, a.finish, a.topic, a.status, s.name, s.labels, cp.base_tutor_pay, sp.premium_pay, cp.contractor_names
      ORDER BY a.start DESC
    `;
    const result = await client.query(query, [startUTC, endUTC]);
    return result.rows;
  },

  schools: async (client, startUTC, endUTC) => {
    const query = `
      WITH contractor_pay AS (
        SELECT
          ac.appointment_id,
          STRING_AGG(DISTINCT ac.contractor_name, ', ') AS contractor_names,
          SUM(
            CASE a.charge_type
              WHEN 'hourly' THEN ac.pay_rate
              WHEN 'one-off' THEN ac.pay_rate
              WHEN 'hourly-split' THEN ac.pay_rate
              WHEN 'one-off-split' THEN ac.pay_rate
              ELSE ac.pay_rate
            END
          ) AS base_tutor_pay
        FROM appointment_contractors ac
        JOIN appointments a ON a.appointment_id = ac.appointment_id
        JOIN services s ON a.service_id = s.service_id
        WHERE a.start >= $1 
          AND a.start < $2
          AND a.status IN ('complete', 'cancelled-chargeable')
          AND a.is_deleted IS NOT TRUE
          AND EXISTS (
            SELECT 1 FROM jsonb_array_elements_text(s.labels) AS label
            WHERE label IN ('School - LA', 'School - NYC', 'School - SF')
          )
        GROUP BY ac.appointment_id
      ),
      student_premium AS (
        SELECT
          a.appointment_id,
          COALESCE(
            CASE 
              WHEN s.sr_premium IS NOT NULL AND s.sr_premium > 0 THEN
                (SELECT COUNT(*) * s.sr_premium * a.units
                 FROM appointment_recipients ar
                 WHERE ar.appointment_id = a.appointment_id
                   AND ar.status <> 'missed')
              ELSE 0
            END
          , 0) AS premium_pay
        FROM appointments a
        LEFT JOIN services s ON a.service_id = s.service_id
        WHERE a.start >= $1 
          AND a.start < $2
          AND a.status IN ('complete', 'cancelled-chargeable')
          AND a.is_deleted IS NOT TRUE
          AND EXISTS (
            SELECT 1 FROM jsonb_array_elements_text(s.labels) AS label
            WHERE label IN ('School - LA', 'School - NYC', 'School - SF')
          )
      )
      SELECT 
        a.appointment_id,
        a.start,
        a.finish,
        a.topic,
        a.status,
        s.name as service_name,
        EXTRACT(EPOCH FROM (a.finish - a.start))/3600 as duration_hours,
        cp.contractor_names AS contractor_name,
        COALESCE(cp.base_tutor_pay, 0) + COALESCE(sp.premium_pay, 0) AS tutor_pay,
        SUM(
          CASE
            WHEN a.charge_type = 'hourly' THEN ar.charge_rate * a.units
            WHEN a.charge_type = 'one-off' THEN ar.charge_rate
            WHEN a.charge_type = 'one-off-split' THEN ar.charge_rate
            WHEN a.charge_type = 'hourly-split' THEN ar.charge_rate * a.units
            ELSE ar.charge_rate * a.units
          END
         ) as expected_revenue,
         s.labels as service_labels
       FROM appointments a
       LEFT JOIN services s ON a.service_id = s.service_id
       LEFT JOIN contractor_pay cp ON cp.appointment_id = a.appointment_id
       LEFT JOIN student_premium sp ON sp.appointment_id = a.appointment_id
       LEFT JOIN appointment_recipients ar ON a.appointment_id = ar.appointment_id AND ar.status <> 'missed'
       WHERE a.start >= $1 
         AND a.start < $2
         AND a.status IN ('complete', 'cancelled-chargeable')
         AND a.is_deleted IS NOT TRUE
         AND EXISTS (
           SELECT 1 FROM jsonb_array_elements_text(s.labels) AS label
           WHERE label IN ('School - LA', 'School - NYC', 'School - SF')
         )
       GROUP BY a.appointment_id, a.start, a.finish, a.topic, a.status, s.name, s.labels, cp.base_tutor_pay, sp.premium_pay, cp.contractor_names
      ORDER BY a.start DESC
    `;
    const result = await client.query(query, [startUTC, endUTC]);
    return result.rows;
  },

  online: async (client, startUTC, endUTC) => {
    const query = `
      WITH contractor_pay AS (
        SELECT
          ac.appointment_id,
          STRING_AGG(DISTINCT ac.contractor_name, ', ') AS contractor_names,
          SUM(ac.pay_rate) AS base_tutor_pay
        FROM appointment_contractors ac
        JOIN appointments a ON a.appointment_id = ac.appointment_id
        JOIN services s ON a.service_id = s.service_id
        WHERE a.start >= $1
          AND a.start < $2
          AND a.status IN ('complete', 'cancelled-chargeable')
          AND a.is_deleted IS NOT TRUE
          AND s.labels @> '"Online"'::jsonb
        GROUP BY ac.appointment_id
      ),
      student_premium AS (
        SELECT
          a.appointment_id,
          COALESCE(
            CASE
              WHEN s.sr_premium IS NOT NULL AND s.sr_premium > 0 THEN
                (SELECT COUNT(*) * s.sr_premium * COALESCE(a.units, 1)
                 FROM appointment_recipients ar
                 WHERE ar.appointment_id = a.appointment_id
                   AND ar.status <> 'missed')
              ELSE 0
            END
          , 0) AS premium_pay
        FROM appointments a
        LEFT JOIN services s ON a.service_id = s.service_id
        WHERE a.start >= $1
          AND a.start < $2
          AND a.status IN ('complete', 'cancelled-chargeable')
          AND a.is_deleted IS NOT TRUE
          AND s.labels @> '"Online"'::jsonb
      )
      SELECT
        a.appointment_id,
        a.start,
        a.finish,
        a.topic,
        a.status,
        s.name as service_name,
        EXTRACT(EPOCH FROM (a.finish - a.start))/3600 as duration_hours,
        cp.contractor_names AS contractor_name,
        COALESCE(cp.base_tutor_pay, 0) + COALESCE(sp.premium_pay, 0) AS tutor_pay,
        SUM(
          CASE
            WHEN a.charge_type = 'hourly' THEN ar.charge_rate * COALESCE(a.units, 1)
            WHEN a.charge_type = 'one-off' THEN ar.charge_rate
            WHEN a.charge_type = 'one-off-split' THEN ar.charge_rate
            WHEN a.charge_type = 'hourly-split' THEN ar.charge_rate * COALESCE(a.units, 1)
            ELSE ar.charge_rate * COALESCE(a.units, 1)
          END
         ) as expected_revenue,
         s.labels as service_labels
       FROM appointments a
       LEFT JOIN services s ON a.service_id = s.service_id
       LEFT JOIN contractor_pay cp ON cp.appointment_id = a.appointment_id
       LEFT JOIN student_premium sp ON sp.appointment_id = a.appointment_id
       LEFT JOIN appointment_recipients ar ON a.appointment_id = ar.appointment_id AND ar.status <> 'missed'
       WHERE a.start >= $1
         AND a.start < $2
         AND a.status IN ('complete', 'cancelled-chargeable')
         AND a.is_deleted IS NOT TRUE
         AND s.labels @> '"Online"'::jsonb
       GROUP BY a.appointment_id, a.start, a.finish, a.topic, a.status, s.name, s.labels, cp.base_tutor_pay, sp.premium_pay, cp.contractor_names
      ORDER BY a.start DESC
    `;
    const result = await client.query(query, [startUTC, endUTC]);
    return result.rows;
  },

  onlineRevenue: async (client, startUTC, endUTC) => {
    const query = `
      SELECT 
        a.appointment_id,
        a.start as lesson_start,
        a.status,
        s.name as service_name,
        ar.recipient_id,
        ar.recipient_name,
        ar.charge_rate,
        a.units,
        CASE
          WHEN a.charge_type = 'hourly' THEN ar.charge_rate * a.units
          WHEN a.charge_type = 'one-off' THEN ar.charge_rate
          WHEN a.charge_type = 'one-off-split' THEN ar.charge_rate
          WHEN a.charge_type = 'hourly-split' THEN ar.charge_rate * a.units
          ELSE ar.charge_rate * a.units
        END as expected_revenue
      FROM appointments a
      LEFT JOIN services s ON a.service_id = s.service_id
      LEFT JOIN appointment_recipients ar ON a.appointment_id = ar.appointment_id
      WHERE a.start >= $1
        AND a.start < $2
        AND a.status IN ('complete', 'cancelled-chargeable')
        AND a.is_deleted IS NOT TRUE
        AND ar.status <> 'missed'
        AND EXISTS (
          SELECT 1 FROM jsonb_array_elements_text(s.labels) AS label
          WHERE label ILIKE '%Online%'
        )
      ORDER BY a.start DESC
    `;
    const result = await client.query(query, [startUTC, endUTC]);
    return result.rows;
  },

  // Placeholder handlers for metrics that don't have detail views yet
  // These prevent 400 errors and return empty data with a message
  totalLeads: async (client, startUTC, endUTC) => {
    return [{ message: 'Detail view not yet implemented for Total Leads' }];
  },

  convertedLeads: async (client, startUTC, endUTC) => {
    return [{ message: 'Detail view not yet implemented for Converted Leads' }];
  },

  unconvertedLeads: async (client, startUTC, endUTC) => {
    return [{ message: 'Detail view not yet implemented for Unconverted Leads' }];
  },

  lessonsPlaced: async (client, startUTC, endUTC) => {
    return [{ message: 'Detail view not yet implemented for Lessons Placed' }];
  },

  trialFirstLessons: async (client, startUTC, endUTC) => {
    return [{ message: 'Detail view not yet implemented for Trial/First Lessons' }];
  },

  convertedNotContinued: async (client, startUTC, endUTC) => {
    return [{ message: 'Detail view not yet implemented for Converted Not Continued' }];
  },

  threeFullLessons: async (client, startUTC, endUTC) => {
    return [{ message: 'Detail view not yet implemented for 3 Full Lessons' }];
  },

  sevenFullLessons: async (client, startUTC, endUTC) => {
    return [{ message: 'Detail view not yet implemented for 7 Full Lessons' }];
  },

  activeTutors: async (client, startUTC, endUTC, customLabels = null, onlyLabel = false) => {
    // Separate labels into service, tutor, and market types
    const { serviceLabels, tutorLabels, marketTutorFilters } = identifyLabelTypes(customLabels || []);
    const needsContractorJoin = tutorLabels.length > 0 || marketTutorFilters.length > 0;
    
    // Build filters
    let serviceFilterSQL = '';
    let tutorFilterSQL = '';
    let filterParams = [];
    
    if (customLabels && customLabels.length > 0) {
      if (onlyLabel && customLabels.length === 1 && customLabels[0] === "First Lesson Complete") {
        serviceFilterSQL = `AND jsonb_array_length(s.labels) = 1 AND s.labels @> '["First Lesson Complete"]'`;
      } else {
        const filters = buildLabelFilters(serviceLabels, tutorLabels, marketTutorFilters, 3, 'c');
        serviceFilterSQL = filters.serviceFilterSQL;
        tutorFilterSQL = filters.tutorFilterSQL;
        filterParams = filters.params;
      }
    }
    
    const query = `
      SELECT DISTINCT
        ac.contractor_id AS tutor_id,
        ac.contractor_name AS tutor_name,
        COUNT(DISTINCT a.appointment_id) AS completed_lessons
      FROM appointment_contractors ac
      JOIN appointments a ON ac.appointment_id = a.appointment_id
      JOIN services s ON a.service_id = s.service_id
      ${needsContractorJoin ? `
      JOIN contractors c ON ac.contractor_id = c.contractor_id
      ` : ''}
      WHERE a.status IN ('complete','cancelled-chargeable')
        AND a.is_deleted IS NOT TRUE
        AND a.start >= $1 AND a.start < $2
        AND NOT (
          EXISTS (
            SELECT 1 
            FROM jsonb_array_elements_text(s.labels) AS label(value)
            WHERE label.value ILIKE '%non teaching%' 
              OR label.value ILIKE '%support%'
              OR label.value ILIKE '%admin%'
              OR label.value ILIKE '%meeting%'
          )
        )
        ${serviceFilterSQL}
        ${tutorFilterSQL}
      GROUP BY ac.contractor_id, ac.contractor_name
      ORDER BY completed_lessons DESC
    `;
    
    const params = filterParams.length > 0 
      ? [startUTC, endUTC, ...filterParams]
      : [startUTC, endUTC];
    
    const result = await client.query(query, params);
    return result.rows;
  },

  inactiveTutors: async (client, startUTC, endUTC) => {
    return [{ message: 'Detail view not yet implemented for Inactive Tutors' }];
  },

  tutorsTaught0_19: async (client, startUTC, endUTC) => {
    return [{ message: 'Detail view not yet implemented for Tutors 0-19 hours' }];
  },

  tutorsTaught20_39: async (client, startUTC, endUTC) => {
    return [{ message: 'Detail view not yet implemented for Tutors 20-39 hours' }];
  },

  tutorsTaught40_59: async (client, startUTC, endUTC) => {
    return [{ message: 'Detail view not yet implemented for Tutors 40-59 hours' }];
  },

  tutorsTaught60_79: async (client, startUTC, endUTC) => {
    return [{ message: 'Detail view not yet implemented for Tutors 60-79 hours' }];
  },

  tutorTaught80Plus: async (client, startUTC, endUTC) => {
    return [{ message: 'Detail view not yet implemented for Tutors 80+ hours' }];
  },

  consistencyBonusPayout: async (client, startUTC, endUTC) => {
    return [{ message: 'Detail view not yet implemented for Consistency Bonus' }];
  },

  groupLessonCount: async (client, startUTC, endUTC) => {
    return [{ message: 'Detail view not yet implemented for Group Lesson Count' }];
  },

  groupLessonBonusPayout: async (client, startUTC, endUTC) => {
    return [{ message: 'Detail view not yet implemented for Group Lesson Bonus' }];
  },

  tutoradhocpay: async (client, startUTC, endUTC, customLabels = null, onlyLabel = false) => {
    // Separate labels into service, tutor, and market types
    const { serviceLabels, tutorLabels, marketTutorFilters } = identifyLabelTypes(customLabels || []);
    const needsContractorJoin = tutorLabels.length > 0 || marketTutorFilters.length > 0;
    
    // Build filters
    let serviceFilterSQL = '';
    let tutorFilterSQL = '';
    let filterParams = [];
    
    if (customLabels && customLabels.length > 0) {
      if (onlyLabel && customLabels.length === 1 && customLabels[0] === "First Lesson Complete") {
        serviceFilterSQL = `AND jsonb_array_length(s.labels) = 1 AND s.labels @> '["First Lesson Complete"]'`;
      } else {
        const filters = buildLabelFilters(serviceLabels, tutorLabels, marketTutorFilters, 3, 'c_adhoc');
        serviceFilterSQL = filters.serviceFilterSQL;
        tutorFilterSQL = filters.tutorFilterSQL;
        filterParams = filters.params;
      }
    }
    
    // Build tutor filter that works for both appointment-based and direct contractor-based charges
    let tutorFilterForAdhoc = '';
    if (needsContractorJoin && tutorFilterSQL) {
      // For adhoc charges, we need to filter by:
      // 1. Contractor from appointment (if appointment exists)
      // 2. Contractor directly from adhoc_charges.contractor_id (if no appointment)
      // We'll use OR logic to match either path
      const tutorFilterWithoutAnd = tutorFilterSQL.replace(/^\s*AND\s+/, '');
      // Replace c. with c_appt. for appointment contractors, and c. with c_direct. for direct contractors
      const tutorFilterForAppt = tutorFilterWithoutAnd.replace(/\bc\./g, 'c_appt.');
      const tutorFilterForDirect = tutorFilterWithoutAnd.replace(/\bc\./g, 'c_direct.');
      tutorFilterForAdhoc = `AND (
        (ac.appointment_id IS NOT NULL AND ${tutorFilterForAppt}) OR
        (ac.appointment_id IS NULL AND EXISTS (
          SELECT 1 FROM contractors c_direct 
          WHERE c_direct.contractor_id = ac.contractor_id 
          AND ${tutorFilterForDirect}
        ))
      )`;
    }
    
    const query = `
      SELECT
        po.id                AS payment_order_id,
        po.display_id        AS display_id,
        po.date_sent         AS date_sent,
        po.payee_first || ' ' || po.payee_last AS tutor_name,
        ac.id                AS charge_id,
        ac.description       AS description,
        ac.category_name     AS category_name,
        ${needsContractorJoin ? `
        COALESCE(
          NULLIF(STRING_AGG(DISTINCT ac_adhoc.contractor_name, ', '), ''),
          MAX(ac.contractor_first_name || ' ' || ac.contractor_last_name)
        ) AS contractor_name,
        ` : `
        (ac.contractor_first_name || ' ' || ac.contractor_last_name) AS contractor_name,
        `}
        ac.creator_first_name || ' ' || ac.creator_last_name AS creator_name,
        ac.date_occurred     AS date_occurred,
        COALESCE(pc.amount, ac.pay_contractor, 0) AS pay_contractor,
        pc.amount            AS amount,
        pc.sales_code        AS sales_code,
        pc.payer             AS payer,
        pc.units             AS units,
        a.appointment_id     AS appointment_id,
        a.topic              AS topic,
        a.start              AS start,
        a.units              AS appointment_units,
        s.name               AS service_name,
        s.labels             AS service_labels
      FROM adhoc_charges ac
      LEFT JOIN payment_order_charges pc ON pc.adhoc_charge_id = ac.id
      LEFT JOIN payment_orders po ON po.id = pc.payment_order_id
      LEFT JOIN appointments a ON a.appointment_id = ac.appointment_id
      LEFT JOIN services s ON a.service_id = s.service_id
      ${needsContractorJoin ? `
      LEFT JOIN appointment_contractors ac_adhoc ON a.appointment_id = ac_adhoc.appointment_id
      LEFT JOIN contractors c_appt ON ac_adhoc.contractor_id = c_appt.contractor_id
      ` : ''}
      WHERE ac.date_occurred >= $1 AND ac.date_occurred < $2
        ${customLabels && customLabels.length > 0 ?
          (onlyLabel && customLabels.length === 1 && customLabels[0] === "First Lesson Complete" ?
            `AND ac.appointment_id IS NOT NULL AND jsonb_array_length(s.labels) = 1 AND s.labels @> '["First Lesson Complete"]'` :
            `${serviceFilterSQL ? `AND ac.appointment_id IS NOT NULL ${serviceFilterSQL}` : ''} ${tutorFilterForAdhoc}`)
          : ''}
      ${needsContractorJoin ? `GROUP BY po.id, po.display_id, po.date_sent, po.payee_first, po.payee_last, ac.id, ac.description, ac.category_name, ac.contractor_first_name, ac.contractor_last_name, ac.creator_first_name, ac.creator_last_name, ac.date_occurred, pc.amount, ac.pay_contractor, pc.sales_code, pc.payer, pc.units, a.appointment_id, a.topic, a.start, a.units, s.name, s.labels` : ''}
      ORDER BY ac.date_occurred DESC, ac.id
    `;
    
    const params = filterParams.length > 0 
      ? [startUTC, endUTC, ...filterParams]
      : [startUTC, endUTC];
    
    const result = await client.query(query, params);
    return result.rows;
  },
  
  'first lesson complete': async (client, startUTC, endUTC) => {
    const query = `
      WITH contractor_data AS (
        SELECT 
          ac.appointment_id,
          STRING_AGG(DISTINCT ac.contractor_name, ', ') AS contractor_names,
          SUM(
            CASE
              WHEN a.charge_type = 'hourly' THEN ac.pay_rate
              WHEN a.charge_type = 'one-off' THEN ac.pay_rate
              WHEN a.charge_type = 'one-off-split' THEN ac.pay_rate
              WHEN a.charge_type = 'hourly-split' THEN ac.pay_rate
              ELSE ac.pay_rate
            END
          ) AS total_tutor_pay
        FROM appointment_contractors ac
        JOIN appointments a ON ac.appointment_id = a.appointment_id
        LEFT JOIN services s ON a.service_id = s.service_id
        WHERE a.start >= $1 
          AND a.start < $2
          AND a.status IN ('complete', 'cancelled-chargeable')
          AND a.is_deleted IS NOT TRUE
          AND jsonb_array_length(s.labels) = 1 
          AND s.labels @> '["First Lesson Complete"]'
        GROUP BY ac.appointment_id
      ),
      recipient_data AS (
        SELECT 
          ar.appointment_id,
          SUM(
            CASE
              WHEN a.charge_type = 'hourly' THEN ar.charge_rate * a.units
              WHEN a.charge_type = 'one-off' THEN ar.charge_rate
              WHEN a.charge_type = 'one-off-split' THEN ar.charge_rate
              WHEN a.charge_type = 'hourly-split' THEN ar.charge_rate * a.units
              ELSE ar.charge_rate * a.units
            END
          ) AS total_revenue
        FROM appointment_recipients ar
        JOIN appointments a ON ar.appointment_id = a.appointment_id
        LEFT JOIN services s ON a.service_id = s.service_id
        WHERE a.start >= $1 
          AND a.start < $2
          AND a.status IN ('complete', 'cancelled-chargeable')
          AND a.is_deleted IS NOT TRUE
          AND ar.status <> 'missed'
          AND jsonb_array_length(s.labels) = 1 
          AND s.labels @> '["First Lesson Complete"]'
        GROUP BY ar.appointment_id
      )
      SELECT 
        a.appointment_id as "lessonId",
        a.start,
        a.finish,
        a.topic,
        a.status,
        s.name as "jobName",
        a.units as hours,
        COALESCE(cd.contractor_names, '') AS "tutor",
        COALESCE(cd.total_tutor_pay, 0) AS tutor_pay,
        COALESCE(rd.total_revenue, 0) as revenue,
        s.labels as service_labels
      FROM appointments a
      LEFT JOIN services s ON a.service_id = s.service_id
      LEFT JOIN contractor_data cd ON a.appointment_id = cd.appointment_id
      LEFT JOIN recipient_data rd ON a.appointment_id = rd.appointment_id
      WHERE a.start >= $1 
        AND a.start < $2
        AND a.status IN ('complete', 'cancelled-chargeable')
        AND a.is_deleted IS NOT TRUE
        AND jsonb_array_length(s.labels) = 1 
        AND s.labels @> '["First Lesson Complete"]'
      ORDER BY a.start DESC
    `;
    const result = await client.query(query, [startUTC, endUTC]);
    return result.rows;
  }
};

const router = express.Router();
router.get('/', asyncHandler(async (req, res) => {
  const {
    metric,
    startDate,
    endDate,
    monthStart,
    monthEnd,
    tab,
    labels,
    onlyLabel
  } = req.query;
  if (!metric || !startDate || !endDate) {
    return res.status(400).json({
      error: 'metric, startDate and endDate are required'
    });
  }
  // Use tab-specific endpoint if tab is provided and metric is 'lessons'
  let actualMetric = metric;
  if (tab && metric === 'lessons') {
    if (tab === 'home') {
      actualMetric = 'home';
    } else if (tab === 'online') {
      actualMetric = 'online';
    } else if (tab === 'clubs') {
      actualMetric = 'clubs';
    } else if (tab === 'schools') {
      actualMetric = 'schools';
    } else if (tab === 'first lesson complete') {
      actualMetric = 'first lesson complete';
    }
  }
  
  const fn = detailFns[actualMetric];
  if (!fn) {
    return res.status(400).json({
      error: `No detail view for metric â€œ${actualMetric}â€`
    });
  }
  
  // Parse custom labels if provided
  let customLabels = labels ? labels.split(',').map(l => l.trim()) : null;
  const onlyLabelFlag = onlyLabel === 'true';

  // If no custom labels but a tab filter is active (not 'all'), derive labels from the tab
  // This ensures drilldowns filter by the same labels as the main analytics cards
  if (!customLabels && tab && tab !== 'all') {
    const tabLabelGroups = {
      home: ["Home - Hamptons", "Home - LA", "Home - NYC", "Home - SF", "Home - Westchester"],
      online: ["Online"],
      clubs: ["Club - Park Slope", "Club - Park Slope Support", "Club - UES", "Club - UES Support"],
      schools: ["School - LA", "School - NYC", "School - SF"],
      community: ["community"],
    };
    const tabKey = tab.toLowerCase();
    if (tabLabelGroups[tabKey]) {
      customLabels = tabLabelGroups[tabKey];
    }
  }
  
  // Use month-specific dates if provided, otherwise use year dates
  let actualStartDate = startDate;
  let actualEndDate = endDate;
  
  if (monthStart && monthEnd) {
    actualStartDate = monthStart;
    actualEndDate = monthEnd;
  }
  
  // Parse dates as NY timezone dates (treat YYYY-MM-DD as midnight NY time)
  // If the date has a time component, parse as UTC and convert; otherwise treat as NY local date
  const parseAsNYDate = (dateStr) => {
    // Check if it's a date-only string (YYYY-MM-DD)
    if (/^\d{4}-\d{2}-\d{2}$/.test(dateStr)) {
      // Parse directly as NY timezone date at midnight
      return DateTime.fromISO(dateStr, { zone: 'America/New_York' });
    }
    // Parse as ISO string and convert to NY timezone
    return parseUTC(dateStr).setZone('America/New_York');
  };
  
  const startNY = parseAsNYDate(actualStartDate).startOf('day');
  // Frontend now sends exclusive end dates, so don't add a day
  const endNY = parseAsNYDate(actualEndDate).startOf('day');
  
  const startUTC = startNY.toUTC().toISO();
  const endUTC = endNY.toUTC().toISO();
  try {
    const client = await pool.connect();
    let result;
    if (fn.length === 2) {
      const year = Number(actualStartDate.slice(0, 4));
      result = await fn(client, year);
    } else if (fn.length === 3 || fn.length === 4) {
      // Check if this is a function that supports custom labels
      // All detail endpoints now support labels: lessons, students, hours, revenue, expectedTutorPay, activeTutors, tutoradhocpay
      if ((actualMetric === 'lessons' || actualMetric === 'students' || actualMetric === 'hours' || 
           actualMetric === 'revenue' || actualMetric === 'expectedTutorPay' || actualMetric === 'activeTutors' ||
           actualMetric === 'tutoradhocpay') && 
          (customLabels || onlyLabelFlag)) {
        result = await fn(client, startUTC, endUTC, customLabels, onlyLabelFlag);
      } else {
        result = await fn(client, startUTC, endUTC);
      }
    } else {
      result = await fn(client, startUTC, endUTC);
    }
    client.release();
    
    if (result && result.detailRows) {
      return res.json({
        rows: result.detailRows
      });
    }
    if (Array.isArray(result)) {
      return res.json({
        rows: result
      });
    }
    res.json({
      rows: []
    });
  } catch (err) {
    logger.error({ err }, 'Error in /api/master-report-details');
    res.status(500).json({
      error: err.message
    });
  }
}));
module.exports = router;