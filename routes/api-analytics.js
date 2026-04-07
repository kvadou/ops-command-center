const express = require('express');
const router = express.Router();

const { toNY, parseUTC } = require('../utils/date');
const helpers = require('../helpers');
const { generateKey, getOrSet } = require('../utils/cache');
const { asyncHandler } = require('../middleware/error-handler');
const { logger } = require('../utils/logger');

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

// Helper function to build label filter SQL with OR logic
// Returns { serviceFilterSQL, tutorFilterSQL, params, needsContractorJoin }
function buildLabelFilters(serviceLabels, tutorLabels, marketTutorFilters, paramOffset = 3, contractorAlias = 'c') {
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
      return `EXISTS (SELECT 1 FROM jsonb_array_elements_text(COALESCE(${contractorAlias}.labels, '[]'::jsonb)) AS tutor_lbl(value) WHERE tutor_lbl.value ILIKE $${currentParam})`;
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
      return `EXISTS (SELECT 1 FROM jsonb_array_elements_text(COALESCE(${contractorAlias}.labels, '[]'::jsonb)) AS market_lbl(value) WHERE market_lbl.value ILIKE $${homeParam} OR market_lbl.value ILIKE $${schoolParam})`;
    });
    if (tutorFilterSQL) {
      tutorFilterSQL += ` AND (${marketConditions.join(' OR ')})`;
    } else {
      tutorFilterSQL = `AND (${marketConditions.join(' OR ')})`;
    }
  }
  
  return { serviceFilterSQL, tutorFilterSQL, params, needsContractorJoin };
}

// Helper function for period-based active tutors calculation
async function getActiveTutorsForPeriod(client, start, end, tab = 'all', labelGroups = {}, customLabels = null, onlyLabel = false) {
  let labelFilter = '';
  let params = [start, end];
  let needsContractorJoin = false;
  
  // Handle custom labels if provided (takes precedence over tab-based filtering)
  if (customLabels && customLabels.length > 0) {
    // Special case for "only label" - only show tutors with ONLY that label
    if (onlyLabel && customLabels.length === 1 && customLabels[0] === "First Lesson Complete") {
      labelFilter = `AND jsonb_array_length(s.labels) = 1 AND s.labels @> '["First Lesson Complete"]'`;
    } else {
      // Separate labels into service, tutor, and market types
      const { serviceLabels, tutorLabels, marketTutorFilters } = identifyLabelTypes(customLabels);
      
      if (tutorLabels.length > 0 || marketTutorFilters.length > 0) {
        needsContractorJoin = true;
      }
      
      // Build filters for both service and tutor labels
      const { serviceFilterSQL, tutorFilterSQL, params: filterParams } = buildLabelFilters(
        serviceLabels, 
        tutorLabels, 
        marketTutorFilters, 
        3
      );
      
      params = [start, end, ...filterParams];
      labelFilter = serviceFilterSQL;
      if (tutorFilterSQL) {
        labelFilter += tutorFilterSQL;
      }
    }
  } else if (tab !== 'all' && labelGroups[tab]) {
    // Fall back to tab-based filtering if no custom labels
    const patterns = labelGroups[tab].map(s => s.toLowerCase());
    const conditions = patterns.map((_, idx) => {
      params.push(`%${patterns[idx]}%`);
      return `lbl.value ILIKE $${params.length}`;
    });
    labelFilter = `AND EXISTS (SELECT 1 FROM jsonb_array_elements_text(COALESCE(s.labels, '[]'::jsonb)) AS lbl(value) WHERE ${conditions.join(' OR ')})`;
  }

  const query = `
    SELECT COUNT(DISTINCT ac.contractor_id)::int AS value
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
      ${labelFilter}
  `;
  
  const { rows } = await client.query(query, params);
  return { ytd: rows[0]?.value || 0, months: {} };
}

// Config: label groups and tutor hour buckets are stored in DB in services.labels JSONB already.
// We expose read endpoints here and compute analytics by label filter.

function getDateRange(view, query) {
  // If explicit start/end provided, use those
  // Note: Frontend now sends exclusive end dates, so don't add a day
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

async function ensureConfig(client) {
  await client.query(`
    CREATE TABLE IF NOT EXISTS analytics_settings (
      id TEXT PRIMARY KEY,
      data JSONB NOT NULL,
      updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
    );
  `);

  const { rows } = await client.query(`SELECT data FROM analytics_settings WHERE id = 'default'`);
  if (rows.length) return rows[0].data;

  const defaultConfig = {
    labelGroups: {
      home: ["Home - Hamptons", "Home - LA", "Home - NYC", "Home - SF", "Home - Westchester"],
      online: ["Online"],
      clubs: ["Club - Park Slope", "Club - Park Slope Support", "Club - UES", "Club - UES Support"],
      schools: ["School - LA", "School - NYC", "School - SF"],
      community: ["community"],
    },
    tutorBuckets: [
      { name: '0-5h', min: 0, max: 5 },
      { name: '6-10h', min: 6, max: 10 },
      { name: '11-20h', min: 11, max: 20 },
      { name: '21-40h', min: 21, max: 40 },
      { name: '>40h', min: 41, max: null },
    ],
  };
  await client.query(
    `INSERT INTO analytics_settings (id, data) VALUES ('default', $1)`,
    [defaultConfig]
  );
  return defaultConfig;
}

router.get('/analytics', asyncHandler(async (req, res) => {
  try {
    const tab = (req.query.tab || 'all').toString().toLowerCase();
    const view = (req.query.view || 'monthly').toString().toLowerCase();
    const { start, end, year } = getDateRange(view, req.query);

    // Parse custom labels if provided
    const customLabels = req.query.labels ? req.query.labels.split(',').map(l => l.trim()) : null;
    const onlyLabel = req.query.onlyLabel === 'true';

    // Generate cache key based on query parameters
    const cacheKey = generateKey('analytics', {
      tab,
      view,
      start,
      end,
      year,
      labels: customLabels?.join(',') || '',
      onlyLabel
    });

    // Use location-specific pool from middleware
    const pool = req.locationPool || global.pool;
    
    // Cache analytics results for 5 minutes (300 seconds)
    // This significantly reduces database load for repeated requests
    // TEMPORARILY DISABLED for testing OR logic changes - re-enable after verification
    const result = await getOrSet(cacheKey, async () => {
      const client = await pool.connect();
      try {
      const config = await ensureConfig(client);
      
      // Prepare label groups for tab filtering
      const lcGroups = Object.fromEntries(
        Object.entries(config.labelGroups || {}).map(([k, arr]) => [k.toLowerCase(), (arr || []).map((s) => s.toLowerCase())])
      );
      
      // Base rollups (tolerate partial failures so the endpoint doesn't 500)
      const baseSettled = await Promise.allSettled([
        helpers.getLessonsReport(client, year, tab, lcGroups),
        helpers.getLessonHoursReport(client, year, tab, lcGroups),
        helpers.getStudentsReport(client, year, tab, lcGroups),
        helpers.getExpectedRevenueReport(client, year, tab, lcGroups),
        helpers.getPaidRevenueReport(client, year),
        helpers.getTutorPayReport(client, start, end),
        helpers.getExpectedTutorPayReport(client, year, tab, lcGroups),
        getActiveTutorsForPeriod(client, start, end, tab, lcGroups, customLabels, onlyLabel),
      ]);
      const [lessons, hours, students, expectedRevenue, paidRevenue, tutorPay, expectedTutorPay, activeTutors] = baseSettled.map((r, idx) => {
        if (r.status === 'fulfilled') return r.value;
        logger.error({ error: r.reason?.message || r.reason }, '[analytics] base rollup ${idx} failed:');
        return { ytd: 0, months: {} };
      });

      // Label-driven breakdowns
      const labelSettled = await Promise.allSettled([
        helpers.getRevenueByLabel(client, start, end),
        helpers.getPaidRevenueByLabel(client, start, end),
        helpers.getLabelBreakdown(client, start, end),
      ]);
      const [revenueByLabel, paidByLabel, labelBreakdown] = labelSettled.map((r, idx) => {
        if (r.status === 'fulfilled') return r.value;
        logger.error({ error: r.reason?.message || r.reason }, '[analytics] label rollup ${idx} failed:');
        return {};
      });

      // Determine which labels to include for the selected tab.
      const labelPatterns = lcGroups[tab] || [];
      const include = (label) => {
        if (tab === 'all') return true;
        const l = (label || '').toLowerCase();
        return labelPatterns.some((p) => l.includes(p));
      };

      const labels = Object.keys(revenueByLabel).filter(include);

      // Calculate revenue and tutor pay using the same logic as CSV export (master report details)
      let revenueTabFilter = '';
      let revenueParams = [start, end];
      let revenueNeedsContractorJoin = false;
      
      // Handle custom labels if provided
      if (customLabels && customLabels.length > 0) {
        // Special case for "only label" - only show lessons with ONLY that label
        if (onlyLabel && customLabels && customLabels.length === 1 && customLabels[0] === "First Lesson Complete") {
          revenueTabFilter = `AND jsonb_array_length(s.labels) = 1 AND s.labels @> '["First Lesson Complete"]'`;
        } else {
          // Separate labels into service, tutor, and market types
          const { serviceLabels, tutorLabels, marketTutorFilters } = identifyLabelTypes(customLabels);
          
          if (tutorLabels.length > 0 || marketTutorFilters.length > 0) {
            revenueNeedsContractorJoin = true;
          }
          
          // Build filters for both service and tutor labels (use 'c' alias - standardize revenue query)
          const { serviceFilterSQL, tutorFilterSQL, params: filterParams } = buildLabelFilters(
            serviceLabels, 
            tutorLabels, 
            marketTutorFilters, 
            3,
            'c'  // Standard alias
          );
          
          revenueParams = [start, end, ...filterParams];
          revenueTabFilter = serviceFilterSQL;
          if (tutorFilterSQL) {
            revenueTabFilter += tutorFilterSQL;
          }
          
          // Debug logging to verify OR logic is being used
          if (serviceLabels.length > 1) {
            logger.info({ data: serviceLabels }, '[Analytics] Multiple service labels selected:');
            logger.info({ data: serviceFilterSQL }, '[Analytics] Generated serviceFilterSQL:');
          }
        }
      } else if (tab !== 'all' && lcGroups[tab] && Array.isArray(lcGroups[tab]) && lcGroups[tab].length > 0) {
        const patterns = lcGroups[tab].map(s => s.toLowerCase());
        const conditions = patterns.map((pattern, idx) => {
          revenueParams.push(`%${pattern}%`);
          // Parameter index: $1=start, $2=end, $3+ are label patterns
          const paramIndex = revenueParams.length;
          return `lbl.value ILIKE $${paramIndex}`;
        });
        revenueTabFilter = `AND EXISTS (
          SELECT 1 FROM jsonb_array_elements_text(COALESCE(s.labels, '[]'::jsonb)) AS lbl(value)
          WHERE ${conditions.join(' OR ')}
        )`;
      }

      const revenueQuery = revenueNeedsContractorJoin ? `
        WITH distinct_appointments AS (
          SELECT DISTINCT a.appointment_id, a.charge_type, a.units
          FROM appointments a
          JOIN services s ON a.service_id = s.service_id
          JOIN appointment_contractors ac_rev ON a.appointment_id = ac_rev.appointment_id
          JOIN contractors c ON ac_rev.contractor_id = c.contractor_id
          WHERE a.status IN ('complete','cancelled-chargeable')
          AND a.is_deleted IS NOT TRUE
          AND a.start >= $1 AND a.start < $2
          ${revenueTabFilter}
        )
        SELECT 
          ROUND(SUM(
            CASE
              WHEN da.charge_type = 'hourly' THEN ar.charge_rate * da.units
              WHEN da.charge_type = 'one-off' THEN ar.charge_rate
              WHEN da.charge_type = 'one-off-split' THEN ar.charge_rate
              WHEN da.charge_type = 'hourly-split' THEN ar.charge_rate * da.units
              ELSE ar.charge_rate * da.units
            END
          ), 2) as total_revenue
        FROM distinct_appointments da
        LEFT JOIN appointment_recipients ar ON da.appointment_id = ar.appointment_id AND ar.status <> 'missed'
      ` : `
        SELECT 
          ROUND(SUM(
            CASE
              WHEN a.charge_type = 'hourly' THEN ar.charge_rate * a.units
              WHEN a.charge_type = 'one-off' THEN ar.charge_rate
              WHEN a.charge_type = 'one-off-split' THEN ar.charge_rate
              WHEN a.charge_type = 'hourly-split' THEN ar.charge_rate * a.units
              ELSE ar.charge_rate * a.units
            END
          ), 2) as total_revenue
        FROM appointments a
        LEFT JOIN appointment_recipients ar ON a.appointment_id = ar.appointment_id AND ar.status <> 'missed'
        JOIN services s ON a.service_id = s.service_id
        WHERE a.status IN ('complete','cancelled-chargeable')
        AND a.is_deleted IS NOT TRUE
        AND a.start >= $1 AND a.start < $2
        ${revenueTabFilter}
      `;
      
      const revenueRow = await client.query(revenueQuery, revenueParams);

      let tutorPayTabFilter = '';
      let tutorPayParams = [start, end];
      let tutorPayNeedsContractorJoin = false;
      
      // Handle custom labels if provided
      if (customLabels && customLabels.length > 0) {
        // Special case for "only label" - only show lessons with ONLY that label
        if (onlyLabel && customLabels.length === 1 && customLabels[0] === "First Lesson Complete") {
          tutorPayTabFilter = `AND jsonb_array_length(s.labels) = 1 AND s.labels @> '["First Lesson Complete"]'`;
        } else {
          // Separate labels into service, tutor, and market types
          const { serviceLabels, tutorLabels, marketTutorFilters } = identifyLabelTypes(customLabels);
          
          if (tutorLabels.length > 0 || marketTutorFilters.length > 0) {
            tutorPayNeedsContractorJoin = true;
          }
          
          // Build filters for both service and tutor labels (use 'c' alias - we'll standardize all CTEs to use 'c')
          const { serviceFilterSQL, tutorFilterSQL, params: filterParams } = buildLabelFilters(
            serviceLabels, 
            tutorLabels, 
            marketTutorFilters, 
            3,
            'c'  // Standard alias - all CTEs will use 'c'
          );
          
          tutorPayParams = [start, end, ...filterParams];
          tutorPayTabFilter = serviceFilterSQL;
          if (tutorFilterSQL) {
            tutorPayTabFilter += tutorFilterSQL;
          }
        }
      } else if (tab !== 'all' && lcGroups[tab] && Array.isArray(lcGroups[tab]) && lcGroups[tab].length > 0) {
        const patterns = lcGroups[tab].map(s => s.toLowerCase());
        const conditions = patterns.map((pattern, idx) => {
          tutorPayParams.push(`%${pattern}%`);
          // Parameter index: $1=start, $2=end, $3+ are label patterns
          const paramIndex = tutorPayParams.length;
          return `lbl.value ILIKE $${paramIndex}`;
        });
        tutorPayTabFilter = `AND EXISTS (
          SELECT 1 FROM jsonb_array_elements_text(COALESCE(s.labels, '[]'::jsonb)) AS lbl(value)
          WHERE ${conditions.join(' OR ')}
        )`;
      }

      const tutorPayQuery = tutorPayNeedsContractorJoin ? `
        WITH distinct_appointments AS (
          SELECT DISTINCT a.appointment_id
          FROM appointments a
          JOIN services s ON a.service_id = s.service_id
          JOIN appointment_contractors ac_filter ON a.appointment_id = ac_filter.appointment_id
          JOIN contractors c ON ac_filter.contractor_id = c.contractor_id
          WHERE a.status IN ('complete','cancelled-chargeable')
          AND a.is_deleted IS NOT TRUE
          AND a.start >= $1 AND a.start < $2
          ${tutorPayTabFilter}
        ),
        contractor_pay AS (
          SELECT
            ac.appointment_id,
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
            ) AS base_tutor_pay
          FROM appointment_contractors ac
          JOIN appointments a ON a.appointment_id = ac.appointment_id
          JOIN services s ON a.service_id = s.service_id
          JOIN distinct_appointments da ON da.appointment_id = a.appointment_id
          WHERE a.status IN ('complete','cancelled-chargeable')
          AND a.is_deleted IS NOT TRUE
          AND a.start >= $1 AND a.start < $2
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
          JOIN distinct_appointments da ON da.appointment_id = a.appointment_id
          WHERE a.status IN ('complete','cancelled-chargeable')
          AND a.is_deleted IS NOT TRUE
          AND a.start >= $1 AND a.start < $2
        )
        SELECT 
          ROUND(SUM(COALESCE(cp.base_tutor_pay, 0) + COALESCE(sp.premium_pay, 0)), 2) as total_tutor_pay
        FROM distinct_appointments da
        LEFT JOIN contractor_pay cp ON cp.appointment_id = da.appointment_id
        LEFT JOIN student_premium sp ON sp.appointment_id = da.appointment_id
      ` : `
        WITH contractor_pay AS (
          SELECT
            ac.appointment_id,
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
            ) AS base_tutor_pay
          FROM appointment_contractors ac
          JOIN appointments a ON a.appointment_id = ac.appointment_id
          JOIN services s ON a.service_id = s.service_id
          WHERE a.status IN ('complete','cancelled-chargeable')
          AND a.is_deleted IS NOT TRUE
          AND a.start >= $1 AND a.start < $2
          ${tutorPayTabFilter}
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
          WHERE a.status IN ('complete','cancelled-chargeable')
          AND a.is_deleted IS NOT TRUE
          AND a.start >= $1 AND a.start < $2
          ${tutorPayTabFilter}
        )
        SELECT 
          ROUND(SUM(COALESCE(cp.base_tutor_pay, 0) + COALESCE(sp.premium_pay, 0)), 2) as total_tutor_pay
        FROM appointments a
        JOIN services s ON a.service_id = s.service_id
        LEFT JOIN contractor_pay cp ON cp.appointment_id = a.appointment_id
        LEFT JOIN student_premium sp ON sp.appointment_id = a.appointment_id
        WHERE a.status IN ('complete','cancelled-chargeable')
        AND a.is_deleted IS NOT TRUE
        AND a.start >= $1 AND a.start < $2
        ${tutorPayTabFilter}
      `;
      
      const tutorPayRow = await client.query(tutorPayQuery, tutorPayParams);

      const totalRevenue = Number(revenueRow.rows?.[0]?.total_revenue ?? 0);
      const totalTutorPay = Number(tutorPayRow.rows?.[0]?.total_tutor_pay ?? 0);

      // Calculate total tutor adhoc pay
      let adhocPayTabFilter = '';
      let adhocPayParams = [start, end];
      let adhocPayNeedsContractorJoin = false;
      let adhocPayTutorFilterSQL = '';
      
      // Handle custom labels if provided
      if (customLabels && customLabels.length > 0) {
        // Special case for "only label" - only show lessons with ONLY that label
        if (onlyLabel && customLabels.length === 1 && customLabels[0] === "First Lesson Complete") {
          adhocPayTabFilter = `AND jsonb_array_length(s.labels) = 1 AND s.labels @> '["First Lesson Complete"]'`;
        } else {
          // Separate labels into service, tutor, and market types
          const { serviceLabels, tutorLabels, marketTutorFilters } = identifyLabelTypes(customLabels);
          
          if (tutorLabels.length > 0 || marketTutorFilters.length > 0) {
            adhocPayNeedsContractorJoin = true;
          }
          
          // Build filters for both service and tutor labels (use default 'c' alias, we'll replace it in the query)
          const { serviceFilterSQL, tutorFilterSQL, params: filterParams } = buildLabelFilters(
            serviceLabels, 
            tutorLabels, 
            marketTutorFilters, 
            3,
            'c'  // Use default alias, will be replaced with c_check/c_direct in subqueries
          );
          
          adhocPayParams = [start, end, ...filterParams];
          adhocPayTabFilter = serviceFilterSQL; // Service filter only (applies to appointments)
          adhocPayTutorFilterSQL = tutorFilterSQL || ''; // Tutor filter (will be handled separately)
        }
      } else if (tab !== 'all' && lcGroups[tab] && Array.isArray(lcGroups[tab]) && lcGroups[tab].length > 0) {
        const patterns = lcGroups[tab].map(s => s.toLowerCase());
        const conditions = patterns.map((pattern, idx) => {
          adhocPayParams.push(`%${pattern}%`);
          // Parameter index: $1=start, $2=end, $3+ are label patterns
          const paramIndex = adhocPayParams.length;
          return `lbl.value ILIKE $${paramIndex}`;
        });
        adhocPayTabFilter = `AND EXISTS (
          SELECT 1 FROM jsonb_array_elements_text(COALESCE(s.labels, '[]'::jsonb)) AS lbl(value)
          WHERE ${conditions.join(' OR ')}
        )`;
      }

      // Build tutor filter for adhoc charges that works for both appointment-based and direct contractor-based charges
      // Use DISTINCT to avoid counting the same charge multiple times when there are multiple matching contractors
      let tutorFilterForAppt = '';
      let tutorFilterForDirect = '';
      let hasTutorFilter = false;
      if (adhocPayNeedsContractorJoin && adhocPayTutorFilterSQL && adhocPayTutorFilterSQL.trim()) {
        const tutorFilterWithoutAnd = adhocPayTutorFilterSQL.replace(/^\s*AND\s+/, '').trim();
        if (tutorFilterWithoutAnd) {
          // Replace c. with the appropriate alias for each subquery
          tutorFilterForAppt = tutorFilterWithoutAnd.replace(/\bc\./g, 'c_check.');
          tutorFilterForDirect = tutorFilterWithoutAnd.replace(/\bc\./g, 'c_direct.');
          hasTutorFilter = tutorFilterForAppt && tutorFilterForDirect && tutorFilterForAppt.trim() && tutorFilterForDirect.trim();
        }
      }
      
      // Determine if we have a service label filter active (tab-based or custom labels)
      // When filtering by service labels, exclude charges without appointments (they can't have labels)
      const hasServiceLabelFilter = adhocPayTabFilter && adhocPayTabFilter.trim();

      const adhocPayQuery = adhocPayNeedsContractorJoin ? `
        WITH filtered_adhoc_charges AS (
          SELECT DISTINCT ac.id
          FROM adhoc_charges ac
          LEFT JOIN appointments a ON a.appointment_id = ac.appointment_id
          LEFT JOIN services s ON a.service_id = s.service_id
          WHERE ac.date_occurred >= $1 AND ac.date_occurred < $2
            ${hasServiceLabelFilter ? `AND ac.appointment_id IS NOT NULL ${adhocPayTabFilter}` : ''}
            ${hasTutorFilter ? `AND (
              (ac.appointment_id IS NOT NULL AND EXISTS (
                SELECT 1 FROM appointment_contractors ac_check
                JOIN contractors c_check ON ac_check.contractor_id = c_check.contractor_id
                WHERE ac_check.appointment_id = ac.appointment_id
                AND ${tutorFilterForAppt}
              )) OR
              (ac.appointment_id IS NULL AND EXISTS (
                SELECT 1 FROM contractors c_direct
                WHERE c_direct.contractor_id = ac.contractor_id
                AND ${tutorFilterForDirect}
              ))
            )` : ''}
        )
        SELECT
          ROUND(SUM(COALESCE(pc.amount, ac.pay_contractor, 0)), 2) as total_adhoc_pay
        FROM filtered_adhoc_charges fac
        JOIN adhoc_charges ac ON ac.id = fac.id
        LEFT JOIN payment_order_charges pc ON pc.adhoc_charge_id = ac.id
        LEFT JOIN payment_orders po ON po.id = pc.payment_order_id
      ` : `
        SELECT
          ROUND(SUM(COALESCE(pc.amount, ac.pay_contractor, 0)), 2) as total_adhoc_pay
        FROM adhoc_charges ac
        LEFT JOIN payment_order_charges pc ON pc.adhoc_charge_id = ac.id
        LEFT JOIN payment_orders po ON po.id = pc.payment_order_id
        LEFT JOIN appointments a ON a.appointment_id = ac.appointment_id
        LEFT JOIN services s ON a.service_id = s.service_id
        WHERE ac.date_occurred >= $1 AND ac.date_occurred < $2
        ${hasServiceLabelFilter ? `AND ac.appointment_id IS NOT NULL ${adhocPayTabFilter}` : ''}
      `;
      
      let totalAdhocPay = 0;
      try {
        if (adhocPayNeedsContractorJoin) {
          logger.info({ data: adhocPayQuery.substring(0, 500) }, 'Adhoc pay query with contractor join:');
          logger.info({ data: adhocPayParams.length }, 'Adhoc pay params count:');
        }
        const adhocPayRow = await client.query(adhocPayQuery, adhocPayParams);
        totalAdhocPay = Number(adhocPayRow.rows?.[0]?.total_adhoc_pay ?? 0);
      } catch (error) {
        logger.error({ error: error.message }, 'Error in adhoc pay query:');
        logger.error({ error: error.stack }, 'Error stack:');
        logger.error({ err: adhocPayQuery }, 'Full query:');
        logger.error({ err: adhocPayParams }, 'Params:');
        logger.error({ err: adhocPayTutorFilterSQL }, 'Tutor filter SQL:');
        logger.error({ err: tutorFilterForAppt }, 'Tutor filter for appt:');
        logger.error({ err: tutorFilterForDirect }, 'Tutor filter for direct:');
        // Return 0 instead of throwing to prevent 500 error
        totalAdhocPay = 0;
      }

      // Calculate lessons/hours/students within the range (respecting label filters)
      let useLabelFilter = false;
      let labelParams = [];
      let labelFilterSQL = '';
      let needsContractorJoin = false;
      let useArrayParameter = false; // Flag to indicate if labelParams should be passed as a single array
      
      // IMPORTANT: Custom labels take precedence over tab-based filtering
      if (customLabels && customLabels.length > 0) {
        useLabelFilter = true;
        // Special case for "only label" - only show lessons with ONLY that label
        if (onlyLabel && customLabels.length === 1 && customLabels[0] === "First Lesson Complete") {
          labelFilterSQL = `AND jsonb_array_length(s.labels) = 1 AND s.labels @> '["First Lesson Complete"]'`;
          labelParams = []; // No additional parameters needed
        } else {
          // Separate labels into service, tutor, and market types
          const { serviceLabels, tutorLabels, marketTutorFilters } = identifyLabelTypes(customLabels);
          
          if (tutorLabels.length > 0 || marketTutorFilters.length > 0) {
            needsContractorJoin = true;
          }
          
          // Build filters for both service and tutor labels (use 'c' alias for main queries)
          const { serviceFilterSQL, tutorFilterSQL, params: filterParams, needsContractorJoin: needsJoin } = buildLabelFilters(
            serviceLabels, 
            tutorLabels, 
            marketTutorFilters, 
            3,
            'c'  // Standard contractor alias
          );
          
          labelParams = filterParams;
          labelFilterSQL = serviceFilterSQL || '';
          if (tutorFilterSQL) {
            labelFilterSQL += tutorFilterSQL;
          }
          needsContractorJoin = needsJoin;
          useArrayParameter = false; // Custom labels use individual parameters
          
          // Debug logging to verify OR logic is being used
          logger.info({ data: customLabels }, '[Analytics] KPI calculation - customLabels:');
          logger.info({ data: serviceLabels }, '[Analytics] KPI calculation - serviceLabels:');
          logger.info({ data: tutorLabels }, '[Analytics] KPI calculation - tutorLabels:');
          logger.info({ data: serviceFilterSQL }, '[Analytics] KPI calculation - Generated serviceFilterSQL:');
          logger.info({ data: tutorFilterSQL }, '[Analytics] KPI calculation - Generated tutorFilterSQL:');
          logger.info({ data: labelFilterSQL }, '[Analytics] KPI calculation - Final labelFilterSQL:');
          logger.info({ data: labelParams }, '[Analytics] KPI calculation - labelParams:');
          logger.info({ data: needsContractorJoin }, '[Analytics] KPI calculation - needsContractorJoin:');
        }
      } else if (tab !== 'all' && labelPatterns.length > 0) {
        // Fall back to tab-based filtering only if no custom labels are provided
        useLabelFilter = true;
        labelParams = labelPatterns.map(p => `%${p}%`);
        labelFilterSQL = `AND EXISTS (SELECT 1 FROM jsonb_array_elements_text(COALESCE(s.labels, '[]'::jsonb)) AS lbl(value) WHERE lbl.value ILIKE ANY($3::text[]))`;
        useArrayParameter = true; // Tab labels use array parameter
      }
      
      // Safety check: if custom labels were provided but labelFilterSQL is empty, log a warning
      if (customLabels && customLabels.length > 0 && !labelFilterSQL) {
        logger.warn({ customLabels, labelFilterSQL, useLabelFilter }, '[Analytics] WARNING: Custom labels provided but labelFilterSQL is empty!');
      }

      const lessonsQuery = `
        SELECT COUNT(DISTINCT a.appointment_id)::int AS cnt
        FROM appointments a
        JOIN services s ON a.service_id = s.service_id
        ${needsContractorJoin ? `
        JOIN appointment_contractors ac ON a.appointment_id = ac.appointment_id
        JOIN contractors c ON ac.contractor_id = c.contractor_id
        ` : ''}
        WHERE a.status IN ('complete','cancelled-chargeable')
        AND a.is_deleted IS NOT TRUE
        AND a.start >= $1 AND a.start < $2
        ${labelFilterSQL}
      `;
      
      const lessonsParams = useLabelFilter && labelParams.length > 0 
        ? (useArrayParameter ? [start, end, labelParams] : [start, end, ...labelParams])
        : [start, end];
      
      // Debug logging for lessons query
      if (customLabels && customLabels.length > 0) {
        logger.info({ data: customLabels }, '[Analytics] Lessons query - customLabels:');
        logger.info({ data: labelFilterSQL }, '[Analytics] Lessons query - labelFilterSQL:');
        logger.info({ data: labelParams }, '[Analytics] Lessons query - labelParams:');
        logger.info({ data: useLabelFilter }, '[Analytics] Lessons query - useLabelFilter:');
        logger.info({ data: needsContractorJoin }, '[Analytics] Lessons query - needsContractorJoin:');
        logger.info({ data: lessonsParams.length }, '[Analytics] Lessons query - params count:');
        logger.info({ data: lessonsQuery.substring(0, 500) }, '[Analytics] Lessons query - SQL:');
      }
      
      const lessonsRow = await client.query(lessonsQuery, lessonsParams);

      const hoursQuery = needsContractorJoin ? `
        WITH distinct_appointments AS (
          SELECT DISTINCT a.appointment_id, a.units
          FROM appointments a
          JOIN services s ON a.service_id = s.service_id
          JOIN appointment_contractors ac ON a.appointment_id = ac.appointment_id
          JOIN contractors c ON ac.contractor_id = c.contractor_id
          WHERE a.status IN ('complete','cancelled-chargeable')
          AND a.is_deleted IS NOT TRUE
          AND a.start >= $1 AND a.start < $2
          ${labelFilterSQL}
        )
        SELECT COALESCE(ROUND(SUM(da.units)::numeric,2),0)::numeric AS val
        FROM distinct_appointments da
      ` : `
        SELECT COALESCE(ROUND(SUM(a.units)::numeric,2),0)::numeric AS val
        FROM appointments a
        JOIN services s ON a.service_id = s.service_id
        WHERE a.status IN ('complete','cancelled-chargeable')
        AND a.is_deleted IS NOT TRUE
        AND a.start >= $1 AND a.start < $2
        ${labelFilterSQL}
      `;
      
      const hoursRow = await client.query(
        hoursQuery,
        useLabelFilter && labelParams.length > 0 
          ? (useArrayParameter ? [start, end, labelParams] : [start, end, ...labelParams])
          : [start, end]
      );

      const studentsQuery = needsContractorJoin ? `
        WITH distinct_appointments AS (
          SELECT DISTINCT a.appointment_id
          FROM appointments a
          JOIN services s ON a.service_id = s.service_id
          JOIN appointment_contractors ac ON a.appointment_id = ac.appointment_id
          JOIN contractors c ON ac.contractor_id = c.contractor_id
          WHERE a.status IN ('complete','cancelled-chargeable')
          AND a.is_deleted IS NOT TRUE
          AND a.start >= $1 AND a.start < $2
          ${labelFilterSQL}
        )
        SELECT COUNT(ar.recipient_id)::int AS cnt
        FROM distinct_appointments da
        JOIN appointment_recipients ar ON da.appointment_id = ar.appointment_id
        WHERE ar.status <> 'missed'
      ` : `
        SELECT COUNT(ar.recipient_id)::int AS cnt
        FROM appointment_recipients ar
        JOIN appointments a ON a.appointment_id = ar.appointment_id
        JOIN services s ON a.service_id = s.service_id
        WHERE ar.status <> 'missed'
        AND a.status IN ('complete','cancelled-chargeable')
        AND a.is_deleted IS NOT TRUE
        AND a.start >= $1 AND a.start < $2
        ${labelFilterSQL}
      `;
      
      const studentsRow = await client.query(
        studentsQuery,
        useLabelFilter && labelParams.length > 0 
          ? (useArrayParameter ? [start, end, labelParams] : [start, end, ...labelParams])
          : [start, end]
      );

      // Tutor hour buckets (editable via admin later) — compute from helpers by thresholds
      const bucketsMonthly = Array.isArray(config.tutorBuckets) && config.tutorBuckets.length
        ? config.tutorBuckets
        : [
            { name: '0-5h', min: 0, max: 5 },
            { name: '6-10h', min: 6, max: 10 },
            { name: '11-20h', min: 11, max: 20 },
            { name: '21-40h', min: 21, max: 40 },
            { name: '>40h', min: 41, max: null },
          ];
      const bucketResults = [];
      for (const b of bucketsMonthly) {
        try {
          const r = await helpers.getTutorsByHoursReport(client, year, b.min, b.max);
          const monthKey = toNY(parseUTC(start)).toFormat('LLL').toLowerCase();
          bucketResults.push({ name: b.name, value: r.months?.[monthKey] || 0 });
        } catch (e) {
          logger.error({ error: e?.message || e }, '[analytics] tutorsByHours bucket failed:');
          bucketResults.push({ name: b.name, value: 0 });
        }
      }

      // Client tracker metrics for Home/Online/Clubs (period-based)
      const [leadsDetail, trialsRollup, convertedLeadsDetail] = await Promise.all([
        helpers.getLeadsDetail(client, start, end),
        helpers.getTrialLessonsReport(client, start, end),
        helpers.getConvertedLeadsDetail(client, start, end),
      ]);
      const clientTracker = {
        leads: (leadsDetail || []).length,
        trials: trialsRollup?.ytd || 0,
        conversions: (convertedLeadsDetail || []).length,
      };

      // Clubs: break out classes vs camps
      const { rows: clubRows } = await client.query(
        `SELECT
           SUM(CASE WHEN s.name ILIKE '%camp%' OR s.labels @> '"Camp"'::jsonb THEN 1 ELSE 0 END)::int AS camps,
           SUM(CASE WHEN s.name ILIKE '%camp%' OR s.labels @> '"Camp"'::jsonb THEN 0 ELSE 1 END)::int AS classes
         FROM appointments a
         JOIN services s ON s.service_id = a.service_id
         WHERE a.status IN ('complete','cancelled-chargeable')
      AND a.is_deleted IS NOT TRUE
           AND a.start >= $1 AND a.start < $2
           AND s.labels::text LIKE '%"Club %'`,
        [start, end]
      );
      const clubs = { classes: clubRows?.[0]?.classes || 0, camps: clubRows?.[0]?.camps || 0 };

      const schools = {};

      const unknown = revenueByLabel['Unknown']?.ytd || 0;
      const hadFailures = baseSettled.some(r => r.status === 'rejected') || labelSettled.some(r => r.status === 'rejected');
      const warnings = { unlabeledInvoice: unknown > 0, partialData: hadFailures };

        return {
          meta: { tab, view, start, end, year, warnings, config },
          totals: {
            totalLessons: Number(lessonsRow.rows?.[0]?.cnt ?? 0),
            totalHours: Number(hoursRow.rows?.[0]?.val ?? 0),
            totalStudents: Number(studentsRow.rows?.[0]?.cnt ?? 0),
            totalActiveTutors: activeTutors?.ytd ?? 0,
            totalRevenue,
            totalTutorPay,
            totalAdhocPay,
            totalTutorCost: totalTutorPay, // placeholder until bonuses/stipends added
            tutorPayCostPct: totalRevenue ? (totalTutorPay / totalRevenue) * 100 : 0, // Cost percentage (Tutor Pay / Revenue)
            adhocPayCostPct: totalRevenue ? (totalAdhocPay / totalRevenue) * 100 : 0, // Cost percentage (Adhoc Pay / Revenue)
            tutorPayMarginPct: totalRevenue ? ((totalRevenue - totalTutorPay) / totalRevenue) * 100 : 0,
            profitMarginPct: totalRevenue ? ((totalRevenue - totalTutorPay - totalAdhocPay) / totalRevenue) * 100 : 0,
            marginPct: totalRevenue ? ((totalRevenue - totalTutorPay - totalAdhocPay) / totalRevenue) * 100 : 0, // Keep for backwards compatibility
          },
          charts: {
            tutorBucketsMonthly: bucketResults,
          },
          clientTracker,
          clubs,
          schools,
          labels: {
            revenueByLabel,
            paidByLabel,
            labelBreakdown,
            included: labels,
          },
        };
      } finally {
        client.release();
      }
    }, 0); // Cache TTL temporarily set to 0 for testing OR logic changes

    res.json(result);
  } catch (err) {
    logger.error({ err: err }, 'Error in /api/analytics:');
    logger.error({ error: err.stack }, 'Error stack:');
    logger.error({ error: req.query }, 'Request query:');
    res.status(500).json({ error: 'Failed to compute analytics', details: err.message });
  }
}));

// Revenue & Profitability Trends
// Returns time-series data for revenue, tutor pay, adhoc pay, profit, and margin percent.
// Weekly: last 12 weeks ending at provided end (exclusive)
// Monthly: last 12 months ending at provided end (exclusive)
// Yearly: all available years up to provided end (exclusive)
router.get('/analytics/trends', asyncHandler(async (req, res) => {
  try {
    const tab = (req.query.tab || 'all').toString().toLowerCase();
    const view = (req.query.view || 'monthly').toString().toLowerCase();

    // Optional custom labels
    const customLabels = req.query.labels ? req.query.labels.split(',').map(l => l.trim()) : null;
    const onlyLabel = req.query.onlyLabel === 'true';

    // Determine end anchor; use getDateRange for consistent timezone behavior
    const { end: defaultEnd } = getDateRange(view, req.query);

    // Generate cache key for trends
    const cacheKey = generateKey('analytics:trends', {
      tab,
      view,
      end: defaultEnd,
      labels: customLabels?.join(',') || '',
      onlyLabel
    });

    const pool = req.locationPool || global.pool;
    
    // Cache trends results for 5 minutes
    const result = await getOrSet(cacheKey, async () => {
      const client = await pool.connect();
      try {
      const config = await ensureConfig(client);
      const lcGroups = Object.fromEntries(
        Object.entries(config.labelGroups || {}).map(([k, arr]) => [k.toLowerCase(), (arr || []).map((s) => s.toLowerCase())])
      );

      // Build period window
      // Use NY timezone alignment for period boundaries
      const tz = 'America/New_York';
      const endNY = toNY(parseUTC(defaultEnd));

      // Compute startNY based on view
      let startNY;
      if (view === 'weekly') {
        // 12 weeks prior from end (exclusive), aligned to Sunday start
        const endWeekStart = endNY.minus({ days: 1 }).startOf('week').plus({ days: 1 }).startOf('day'); // shift to Sunday
        startNY = endWeekStart.minus({ weeks: 12 });
      } else if (view === 'yearly') {
        // No explicit start; we'll not constrain and return all years
        startNY = null;
      } else {
        // monthly
        const endMonthStart = endNY.startOf('month');
        startNY = endMonthStart.minus({ months: 12 });
      }

      const start = startNY ? startNY.toUTC().toISO() : null;
      const end = endNY.toUTC().toISO();

      // Label filtering
      const patterns = lcGroups[tab] || [];
      let labelFilterSQL = '';
      let labelParams = [];
      let needsContractorJoin = false;
      
      if (customLabels && customLabels.length > 0) {
        if (onlyLabel && customLabels.length === 1) {
          labelFilterSQL = `AND jsonb_array_length(s.labels) = 1 AND s.labels @> '["${customLabels[0]}"]'`;
        } else {
          // Separate labels into service, tutor, and market types
          const { serviceLabels, tutorLabels, marketTutorFilters } = identifyLabelTypes(customLabels);
          
          if (tutorLabels.length > 0 || marketTutorFilters.length > 0) {
            needsContractorJoin = true;
          }
          
          // Build filters for both service and tutor labels
          const { serviceFilterSQL, tutorFilterSQL, params: filterParams } = buildLabelFilters(
            serviceLabels, 
            tutorLabels, 
            marketTutorFilters, 
            3,
            'c'  // Standard alias
          );
          
          labelParams = filterParams;
          labelFilterSQL = serviceFilterSQL;
          if (tutorFilterSQL) {
            labelFilterSQL += tutorFilterSQL;
          }
        }
      } else if (tab !== 'all' && patterns.length > 0) {
        // Build labelParams and conditions with correct parameter indexing
        // Parameters will be [start, end, ...labelParams] if start exists, or [...labelParams] if not
        // We'll determine the offset when building the query params (see line 1225)
        labelParams = patterns.map(p => `%${p}%`);
        // Use a placeholder that will be replaced, or build dynamically
        // Since we don't know if start exists here, we'll use a pattern that works for both
        // The actual param indices will be: if start exists: $3, $4, ...; if not: $1, $2, ...
        // We'll handle this by using the labelParams array length to determine offset
        const paramOffset = start ? 3 : 1; // $1=$start, $2=$end if start exists, else $1 is first label
        const conditions = labelParams.map((_, idx) => {
          return `lbl.value ILIKE $${paramOffset + idx}`;
        });
        labelFilterSQL = `AND EXISTS (
          SELECT 1 FROM jsonb_array_elements_text(COALESCE(s.labels, '[]'::jsonb)) AS lbl(value)
          WHERE ${conditions.join(' OR ')}
        )`;
      }

      // Period expression
      const periodExpr = view === 'weekly'
        ? `date_trunc('week', (${start ? 'a.start' : 'COALESCE(a.start, NOW())'}) AT TIME ZONE '${tz}' + interval '1 day') - interval '1 day'`
        : view === 'yearly'
          ? `date_trunc('year', (${start ? 'a.start' : 'COALESCE(a.start, NOW())'}) AT TIME ZONE '${tz}')`
          : `date_trunc('month', (${start ? 'a.start' : 'COALESCE(a.start, NOW())'}) AT TIME ZONE '${tz}')`;

      // Adhoc period expression uses adhoc_charges.date_occurred
      const adhocPeriodExpr = view === 'weekly'
        ? `date_trunc('week', (ac.date_occurred AT TIME ZONE '${tz}') + interval '1 day') - interval '1 day'`
        : view === 'yearly'
          ? `date_trunc('year', (ac.date_occurred AT TIME ZONE '${tz}'))`
          : `date_trunc('month', (ac.date_occurred AT TIME ZONE '${tz}'))`;

      // Where time constraints
      const timeWhereAppointments = start ? `AND a.start >= $1 AND a.start < $2` : ``;
      const timeWhereAdhoc = start ? `AND ac.date_occurred >= $1 AND ac.date_occurred < $2` : ``;

      // Revenue series
      const revenueSQL = needsContractorJoin ? `
        WITH distinct_appointments AS (
          SELECT DISTINCT a.appointment_id, ${periodExpr} AS period_start
          FROM appointments a
          JOIN services s ON a.service_id = s.service_id
          JOIN appointment_contractors ac_rev ON a.appointment_id = ac_rev.appointment_id
          JOIN contractors c ON ac_rev.contractor_id = c.contractor_id
          WHERE a.status IN ('complete','cancelled-chargeable')
          AND a.is_deleted IS NOT TRUE
          ${timeWhereAppointments}
          ${labelFilterSQL}
        )
        SELECT 
          da.period_start,
          ROUND(SUM(
            CASE
              WHEN a.charge_type = 'hourly' THEN ar.charge_rate * a.units
              WHEN a.charge_type = 'one-off' THEN ar.charge_rate
              WHEN a.charge_type = 'one-off-split' THEN ar.charge_rate
              WHEN a.charge_type = 'hourly-split' THEN ar.charge_rate * a.units
              ELSE ar.charge_rate * a.units
            END
          ), 2) AS revenue
        FROM distinct_appointments da
        JOIN appointments a ON da.appointment_id = a.appointment_id
        LEFT JOIN appointment_recipients ar ON a.appointment_id = ar.appointment_id AND ar.status <> 'missed'
        GROUP BY da.period_start
      ` : `
        SELECT 
          ${periodExpr} AS period_start,
          ROUND(SUM(
            CASE
              WHEN a.charge_type = 'hourly' THEN ar.charge_rate * a.units
              WHEN a.charge_type = 'one-off' THEN ar.charge_rate
              WHEN a.charge_type = 'one-off-split' THEN ar.charge_rate
              WHEN a.charge_type = 'hourly-split' THEN ar.charge_rate * a.units
              ELSE ar.charge_rate * a.units
            END
          ), 2) AS revenue
        FROM appointments a
        LEFT JOIN appointment_recipients ar ON a.appointment_id = ar.appointment_id AND ar.status <> 'missed'
        JOIN services s ON a.service_id = s.service_id
        WHERE a.status IN ('complete','cancelled-chargeable')
          AND a.is_deleted IS NOT TRUE
          ${timeWhereAppointments}
          ${labelFilterSQL}
        GROUP BY 1
      `;

      // Tutor pay series (base + student premium)
      const tutorPaySQL = needsContractorJoin ? `
        WITH distinct_appointments AS (
          SELECT DISTINCT a.appointment_id, ${periodExpr} AS period_start
          FROM appointments a
          JOIN services s ON a.service_id = s.service_id
          JOIN appointment_contractors ac_filter ON a.appointment_id = ac_filter.appointment_id
          JOIN contractors c ON ac_filter.contractor_id = c.contractor_id
          WHERE a.status IN ('complete','cancelled-chargeable')
          AND a.is_deleted IS NOT TRUE
          ${timeWhereAppointments}
          ${labelFilterSQL}
        ),
        contractor_pay AS (
          SELECT da.appointment_id, da.period_start, 
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
            ) AS base_tutor_pay
          FROM distinct_appointments da
          JOIN appointments a ON da.appointment_id = a.appointment_id
          JOIN appointment_contractors ac ON a.appointment_id = ac.appointment_id
          WHERE a.status IN ('complete','cancelled-chargeable')
            AND a.is_deleted IS NOT TRUE
          GROUP BY da.appointment_id, da.period_start
        ),
        student_premium AS (
          SELECT da.appointment_id, da.period_start,
            COALESCE(
              CASE 
                WHEN s.sr_premium IS NOT NULL AND s.sr_premium > 0 THEN
                  (SELECT COUNT(*) * s.sr_premium * a.units
                   FROM appointment_recipients ar
                   WHERE ar.appointment_id = a.appointment_id
                     AND ar.status <> 'missed')
                ELSE 0
              END, 0
            ) AS premium_pay
          FROM distinct_appointments da
          JOIN appointments a ON da.appointment_id = a.appointment_id
          LEFT JOIN services s ON a.service_id = s.service_id
        )
        SELECT cp.period_start,
               ROUND(SUM(COALESCE(cp.base_tutor_pay, 0) + COALESCE(sp.premium_pay, 0)), 2) AS tutor_pay
        FROM contractor_pay cp
        LEFT JOIN student_premium sp ON sp.appointment_id = cp.appointment_id AND sp.period_start = cp.period_start
        GROUP BY cp.period_start
      ` : `
        WITH contractor_pay AS (
          SELECT a.appointment_id, ${periodExpr} AS period_start, 
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
            ) AS base_tutor_pay
          FROM appointment_contractors ac
          JOIN appointments a ON a.appointment_id = ac.appointment_id
          JOIN services s ON a.service_id = s.service_id
          WHERE a.status IN ('complete','cancelled-chargeable')
            AND a.is_deleted IS NOT TRUE
            ${timeWhereAppointments}
            ${labelFilterSQL}
          GROUP BY a.appointment_id, period_start
        ),
        student_premium AS (
          SELECT a.appointment_id, ${periodExpr} AS period_start,
            COALESCE(
              CASE 
                WHEN s.sr_premium IS NOT NULL AND s.sr_premium > 0 THEN
                  (SELECT COUNT(*) * s.sr_premium * a.units
                   FROM appointment_recipients ar
                   WHERE ar.appointment_id = a.appointment_id
                     AND ar.status <> 'missed')
                ELSE 0
              END, 0
            ) AS premium_pay
          FROM appointments a
          LEFT JOIN services s ON a.service_id = s.service_id
          WHERE a.status IN ('complete','cancelled-chargeable')
            AND a.is_deleted IS NOT TRUE
            ${timeWhereAppointments}
            ${labelFilterSQL}
        )
        SELECT cp.period_start,
               ROUND(SUM(COALESCE(cp.base_tutor_pay, 0) + COALESCE(sp.premium_pay, 0)), 2) AS tutor_pay
        FROM contractor_pay cp
        LEFT JOIN student_premium sp ON sp.appointment_id = cp.appointment_id AND sp.period_start = cp.period_start
        GROUP BY cp.period_start
      `;

      // Adhoc pay series
      // Check if payment_order_charges table exists for more accurate amounts
      const pocExists = await client.query(`
        SELECT EXISTS (
          SELECT 1 FROM information_schema.tables
          WHERE table_name = 'payment_order_charges'
        ) AS exists
      `).then(r => r.rows[0].exists);

      const adhocSQL = needsContractorJoin ? `
        WITH distinct_adhoc_charges AS (
          SELECT DISTINCT ac.id, ${adhocPeriodExpr} AS period_start
          FROM adhoc_charges ac
          LEFT JOIN appointments a ON a.appointment_id = ac.appointment_id
          LEFT JOIN services s ON a.service_id = s.service_id
          JOIN appointment_contractors ac_adhoc ON a.appointment_id = ac_adhoc.appointment_id
          JOIN contractors c ON ac_adhoc.contractor_id = c.contractor_id
          WHERE 1=1
          ${timeWhereAdhoc}
          ${labelFilterSQL}
        )
        SELECT
          dac.period_start,
          ROUND(SUM(${pocExists ? 'COALESCE(pc.amount, ac.pay_contractor)' : 'ac.pay_contractor'}), 2) AS adhoc_pay
        FROM distinct_adhoc_charges dac
        JOIN adhoc_charges ac ON ac.id = dac.id
        ${pocExists ? `LEFT JOIN payment_order_charges pc ON pc.adhoc_charge_id = ac.id
        LEFT JOIN payment_orders po ON po.id = pc.payment_order_id` : ''}
        GROUP BY dac.period_start
      ` : `
        SELECT
          ${adhocPeriodExpr} AS period_start,
          ROUND(SUM(${pocExists ? 'COALESCE(pc.amount, ac.pay_contractor)' : 'ac.pay_contractor'}), 2) AS adhoc_pay
        FROM adhoc_charges ac
        ${pocExists ? `LEFT JOIN payment_order_charges pc ON pc.adhoc_charge_id = ac.id
        LEFT JOIN payment_orders po ON po.id = pc.payment_order_id` : ''}
        LEFT JOIN appointments a ON a.appointment_id = ac.appointment_id
        LEFT JOIN services s ON a.service_id = s.service_id
        WHERE 1=1
          ${timeWhereAdhoc}
          ${labelFilterSQL}
        GROUP BY 1
      `;

      // Execute series queries
      const revParams = start ? [start, end, ...labelParams] : labelParams.length ? [null, null, ...labelParams].filter(Boolean) : [];
      const payParams = start ? [start, end, ...labelParams] : labelParams.length ? [null, null, ...labelParams].filter(Boolean) : [];
      const adhocParams = start ? [start, end, ...labelParams] : labelParams.length ? [null, null, ...labelParams].filter(Boolean) : [];

      const [revRows, payRows, adhocRows] = await Promise.all([
        client.query(revenueSQL, revParams),
        client.query(tutorPaySQL, payParams),
        client.query(adhocSQL, adhocParams),
      ]);

      // Build unified period set
      const map = new Map();
      const addRow = (r, key, field) => {
        const k = r[key];
        if (!k) return;
        const iso = new Date(k).toISOString();
        if (!map.has(iso)) map.set(iso, { periodStart: iso, revenue: 0, tutorPay: 0, adhocPay: 0 });
        // Map SQL field names to object field names
        const sqlField = field === 'tutorPay' ? 'tutor_pay' : field === 'adhocPay' ? 'adhoc_pay' : field;
        map.get(iso)[field] = Number(r[sqlField] || 0);
      };
      for (const r of revRows.rows) addRow(r, 'period_start', 'revenue');
      for (const r of payRows.rows) addRow(r, 'period_start', 'tutorPay');
      for (const r of adhocRows.rows) addRow(r, 'period_start', 'adhocPay');

      // Convert to sorted array
      let series = Array.from(map.values()).sort((a, b) => new Date(a.periodStart) - new Date(b.periodStart));

      // For weekly/monthly, keep last 12 points
      if (view === 'weekly' || view === 'monthly') {
        series = series.slice(-12);
      }

      // Compute profit and margin
      series = series.map(p => {
        const revenue = Number(p.revenue || 0);
        const tutorPay = Number(p.tutorPay || 0);
        const adhocPay = Number(p.adhocPay || 0);
        const profit = revenue - tutorPay - adhocPay;
        const marginPct = revenue ? (profit / revenue) * 100 : 0;
        return {
          periodStart: p.periodStart,
          revenue,
          tutorPay,
          adhocPay,
          profit,
          marginPct,
        };
      });

        return { view, tab, series };
      } finally {
        client.release();
      }
    }, 0); // Cache TTL temporarily set to 0 for testing OR logic changes

    res.json(result);
  } catch (e) {
    logger.error({ err: e }, 'Error in /api/analytics/trends:');
    res.status(500).json({ error: 'Failed to compute trends' });
  }
}));

// Read config for admin UI
router.get('/analytics/config', asyncHandler(async (_req, res) => {
  const client = await pool.connect();
  try {
    const cfg = await ensureConfig(client);
    res.json(cfg);
  } catch (e) {
    logger.error({ err: e }, 'GET /api/analytics/config failed:');
    res.status(500).json({ error: 'Failed to load analytics config' });
  } finally {
    client.release();
  }
}));

// Update config (requires auth via global middleware)
router.put('/analytics/config', asyncHandler(async (req, res) => {
  const client = await pool.connect();
  try {
    await ensureConfig(client);
    const next = {
      labelGroups: req.body?.labelGroups || {},
      tutorBuckets: req.body?.tutorBuckets || [],
    };
    await client.query(
      `INSERT INTO analytics_settings (id, data, updated_at) VALUES ('default', $1, NOW())
       ON CONFLICT (id) DO UPDATE SET data = EXCLUDED.data, updated_at = EXCLUDED.updated_at`,
      [next]
    );
    res.json({ ok: true });
  } catch (e) {
    logger.error({ err: e }, 'PUT /api/analytics/config failed:');
    res.status(500).json({ error: 'Failed to update analytics config' });
  } finally {
    client.release();
  }
}));

// Detail drilldowns for KPI cards
router.get('/analytics/detail', asyncHandler(async (req, res) => {
  const metric = (req.query.metric || '').toString().toLowerCase();
  const tab = (req.query.tab || 'all').toString().toLowerCase();
  const view = (req.query.view || 'monthly').toString().toLowerCase();
  const { start, end, year } = getDateRange(view, req.query);

  // Parse custom labels if provided
  const customLabels = req.query.labels ? req.query.labels.split(',').map(l => l.trim()) : null;
  const onlyLabel = req.query.onlyLabel === 'true';

  const pool = req.locationPool || global.pool;
  const client = await pool.connect();
  try {
    const config = await ensureConfig(client);
    const lcGroups = Object.fromEntries(
      Object.entries(config.labelGroups || {}).map(([k, arr]) => [k.toLowerCase(), (arr || []).map((s) => s.toLowerCase())])
    );
    const patterns = lcGroups[tab] || [];
    const include = (labelsText) => {
      if (tab === 'all') return true;
      const l = (labelsText || '').toLowerCase();
      return patterns.some((p) => l.includes(p));
    };

    let rows = [];
    switch (metric) {
      case 'lessons':
        rows = await helpers.getLessonsDetail(client, start, end);
        break;
      case 'hours':
        rows = await helpers.getLessonHoursDetail(client, start, end);
        break;
      case 'students':
        rows = await helpers.getStudentsDetail(client, start, end);
        break;
      case 'revenue':
        rows = await helpers.getRevenueDetail(client, start, end);
        break;
      case 'tutorpay':
      case 'tutorpayexpected':
        rows = await helpers.getExpectedTutorPayDetail(client, start, end);
        break;
      default:
        return res.status(400).json({ error: 'Unknown metric' });
    }

    // Filter by labels (service labels for tab, or custom labels including tutor labels)
    const apptIds = Array.from(new Set(rows.map((r) => r.appointment_id || r.lesson_id).filter(Boolean)));
    
    if (apptIds.length > 0) {
      let filteredApptIds = apptIds;
      
      // Handle custom labels (including tutor labels)
      if (customLabels && customLabels.length > 0) {
        const { serviceLabels, tutorLabels, marketTutorFilters } = identifyLabelTypes(customLabels);
        
        if (onlyLabel && customLabels.length === 1 && customLabels[0] === "First Lesson Complete") {
          // Special case: only show appointments with ONLY this label
          const { rows: labelRows } = await client.query(
            `SELECT a.appointment_id
             FROM appointments a
             JOIN services s ON s.service_id = a.service_id
             WHERE a.appointment_id = ANY($1)
             AND jsonb_array_length(s.labels) = 1 
             AND s.labels @> '["First Lesson Complete"]'`,
            [apptIds]
          );
          filteredApptIds = labelRows.map(r => r.appointment_id);
        } else {
          // Build filter query for custom labels
          let filterQuery = `
            SELECT DISTINCT a.appointment_id
            FROM appointments a
            JOIN services s ON s.service_id = a.service_id
          `;
          const filterParams = [apptIds];
          let paramIndex = 2;
          const groupConditions = [];
          
          // Service label filters - OR logic within group
          if (serviceLabels.length > 0) {
            const serviceConditions = serviceLabels.map((label) => {
              filterParams.push(`%${label}%`);
              const currentParam = paramIndex;
              paramIndex++;
              return `EXISTS (SELECT 1 FROM jsonb_array_elements_text(COALESCE(s.labels, '[]'::jsonb)) AS lbl(value) WHERE lbl.value ILIKE $${currentParam})`;
            });
            groupConditions.push(`(${serviceConditions.join(' OR ')})`);
          }
          
          // Tutor label filters (requires join with contractors)
          if (tutorLabels.length > 0 || marketTutorFilters.length > 0) {
            filterQuery += `
              JOIN appointment_contractors ac_filter ON a.appointment_id = ac_filter.appointment_id
              JOIN contractors c_filter ON ac_filter.contractor_id = c_filter.contractor_id
            `;
            
            const tutorGroupConditions = [];
            
            if (tutorLabels.length > 0) {
              const tutorConditions = tutorLabels.map((label) => {
                filterParams.push(`%${label}%`);
                const currentParam = paramIndex;
                paramIndex++;
                return `EXISTS (SELECT 1 FROM jsonb_array_elements_text(COALESCE(c_filter.labels, '[]'::jsonb)) AS tutor_lbl(value) WHERE tutor_lbl.value ILIKE $${currentParam})`;
              });
              tutorGroupConditions.push(`(${tutorConditions.join(' OR ')})`);
            }
            
            if (marketTutorFilters.length > 0) {
              const marketConditions = marketTutorFilters.map((market) => {
                const homePattern = `%Home - ${market}%`;
                const schoolPattern = `%School - ${market}%`;
                filterParams.push(homePattern);
                const homeParam = paramIndex;
                paramIndex++;
                filterParams.push(schoolPattern);
                const schoolParam = paramIndex;
                paramIndex++;
                return `EXISTS (SELECT 1 FROM jsonb_array_elements_text(COALESCE(c_filter.labels, '[]'::jsonb)) AS market_lbl(value) WHERE market_lbl.value ILIKE $${homeParam} OR market_lbl.value ILIKE $${schoolParam})`;
              });
              tutorGroupConditions.push(`(${marketConditions.join(' OR ')})`);
            }
            
            // Combine tutor group conditions with OR (any tutor condition can match)
            if (tutorGroupConditions.length > 0) {
              groupConditions.push(`(${tutorGroupConditions.join(' OR ')})`);
            }
          }
          
          // Combine groups with AND (service AND tutor groups must both match if both exist)
          if (groupConditions.length > 0) {
            filterQuery += ` WHERE a.appointment_id = ANY($1) AND ${groupConditions.join(' AND ')}`;
            const { rows: labelRows } = await client.query(filterQuery, filterParams);
            filteredApptIds = labelRows.map(r => r.appointment_id);
          }
        }
      } else if (tab !== 'all') {
        // Fall back to tab-based service label filtering
        const { rows: labelRows } = await client.query(
          `SELECT a.appointment_id, s.labels::text AS labels
           FROM appointments a
           JOIN services s ON s.service_id = a.service_id
           WHERE a.appointment_id = ANY($1)`,
          [apptIds]
        );
        const idToLabels = Object.fromEntries(labelRows.map((r) => [r.appointment_id, r.labels || '']));
        filteredApptIds = apptIds.filter((id) => include(idToLabels[id]));
      }
      
      // Filter rows to only include filtered appointment IDs and deduplicate
      const filteredApptIdSet = new Set(filteredApptIds);
      const seenApptIds = new Set();
      rows = rows.filter((r) => {
        const apptId = r.appointment_id || r.lesson_id;
        if (!apptId || !filteredApptIdSet.has(apptId)) return false;
        // Deduplicate: only include first occurrence of each appointment
        if (seenApptIds.has(apptId)) return false;
        seenApptIds.add(apptId);
        return true;
      });
    }

    res.json({ rows });
  } catch (e) {
    logger.error({ err: e }, 'GET /api/analytics/detail failed:');
    res.status(500).json({ error: 'Failed to load detail' });
  } finally {
    client.release();
  }
}));

module.exports = router;

