const express = require('express');
const router = express.Router();
const { pool, auth } = global;
const { getPool } = require('../database-connections');
const { asyncHandler } = require('../middleware/error-handler');
const { logger } = require('../utils/logger');

/**
 * GET /api/monthly-financials
 * Returns financial data broken down by:
 *   1. Revenue by Category (Home, Online, Retail, Schools, Other)
 *   2. COGS by Category (tutor pay)
 *   3. COGS by Pay Type (1099 vs W-2)
 *   4. Gross Profit by Category (Revenue - COGS)
 *
 * Uses appointments + appointment_recipients (revenue) + appointment_contractors (tutor pay)
 * to match the Analytics Dashboard calculations.
 *
 * Query params:
 *   - year: YYYY (e.g., 2026)
 *   - month: 1-12 (e.g., 1 for January)
 */
router.get('/', auth, asyncHandler(async (req, res) => {
  try {
    const locationPool = req.locationPool || pool;
    const { year, month } = req.query;

    if (!year || !month) {
      return res.status(400).json({
        error: 'year and month are required query parameters'
      });
    }

    const yearNum = parseInt(year);
    const monthNum = parseInt(month);

    if (isNaN(yearNum) || isNaN(monthNum) || monthNum < 1 || monthNum > 12) {
      return res.status(400).json({
        error: 'Invalid year or month format'
      });
    }

    // Calculate date range for the month
    const startDate = new Date(yearNum, monthNum - 1, 1);
    const endDate = new Date(yearNum, monthNum, 1); // First of next month (exclusive)

    // ===========================================
    // REVENUE BY CATEGORY
    // ===========================================
    // Source: appointments + appointment_recipients (matching Analytics Dashboard)
    const revenueByCategoryQuery = `
      WITH revenue_calc AS (
        SELECT
          a.appointment_id,
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
              WHERE lbl.value ILIKE '%Club%' OR lbl.value ILIKE '%Park Slope%' OR lbl.value ILIKE '%UES%'
            ) THEN 'retail'
            WHEN EXISTS (
              SELECT 1 FROM jsonb_array_elements_text(COALESCE(s.labels, '[]'::jsonb)) AS lbl
              WHERE lbl.value ILIKE '%School%'
            ) THEN 'schools'
            ELSE 'other'
          END as category,
          SUM(
            CASE
              WHEN s.dft_charge_type = 'hourly' THEN ar.charge_rate * a.units
              WHEN s.dft_charge_type = 'one-off' THEN ar.charge_rate
              WHEN s.dft_charge_type = 'one-off-split' THEN ar.charge_rate
              WHEN s.dft_charge_type = 'hourly-split' THEN ar.charge_rate * a.units
              ELSE ar.charge_rate * a.units
            END
          ) AS revenue
        FROM appointments a
        JOIN services s ON a.service_id = s.service_id
        LEFT JOIN appointment_recipients ar ON a.appointment_id = ar.appointment_id
          AND ar.status <> 'missed'
        WHERE a.status IN ('complete', 'cancelled-chargeable')
          AND a.is_deleted IS NOT TRUE
          AND a.start >= $1
          AND a.start < $2
        GROUP BY a.appointment_id, s.labels, s.dft_charge_type
      )
      SELECT
        category,
        COALESCE(SUM(revenue), 0) as total
      FROM revenue_calc
      GROUP BY category
      ORDER BY category
    `;

    const revenueResult = await locationPool.query(revenueByCategoryQuery, [startDate, endDate]);

    const revenueByCategory = {
      home: 0,
      online: 0,
      retail: 0,
      schools: 0,
      other: 0,
      total: 0
    };

    for (const row of revenueResult.rows) {
      const amount = parseFloat(row.total) || 0;
      revenueByCategory[row.category] = amount;
      revenueByCategory.total += amount;
    }

    // ===========================================
    // COGS BY CATEGORY (Tutor Pay)
    // ===========================================
    // Source: appointments + appointment_contractors (matching Analytics Dashboard)
    // Includes sibling premium calculation
    const cogsByCategoryQuery = `
      WITH tutor_pay_calc AS (
        SELECT
          a.appointment_id,
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
              WHERE lbl.value ILIKE '%Club%' OR lbl.value ILIKE '%Park Slope%' OR lbl.value ILIKE '%UES%'
            ) THEN 'retail'
            WHEN EXISTS (
              SELECT 1 FROM jsonb_array_elements_text(COALESCE(s.labels, '[]'::jsonb)) AS lbl
              WHERE lbl.value ILIKE '%School%'
            ) THEN 'schools'
            ELSE 'other'
          END as category,
          SUM(
            CASE
              WHEN s.dft_charge_type = 'hourly' THEN ac.pay_rate * a.units
              WHEN s.dft_charge_type = 'one-off' THEN ac.pay_rate
              WHEN s.dft_charge_type = 'one-off-split' THEN ac.pay_rate
              WHEN s.dft_charge_type = 'hourly-split' THEN ac.pay_rate * a.units
              ELSE ac.pay_rate * a.units
            END
          ) + COALESCE(
            -- Sibling premium: count of recipients * sr_premium * units
            (SELECT COUNT(*) * COALESCE(s.sr_premium, 0) * a.units
             FROM appointment_recipients ar2
             WHERE ar2.appointment_id = a.appointment_id
               AND ar2.status <> 'missed'
            ),
            0
          ) AS tutor_pay
        FROM appointments a
        JOIN services s ON a.service_id = s.service_id
        JOIN appointment_contractors ac ON a.appointment_id = ac.appointment_id
        WHERE a.status IN ('complete', 'cancelled-chargeable')
          AND a.is_deleted IS NOT TRUE
          AND a.start >= $1
          AND a.start < $2
        GROUP BY a.appointment_id, s.labels, s.dft_charge_type, s.sr_premium, a.units
      )
      SELECT
        category,
        COALESCE(SUM(tutor_pay), 0) as total
      FROM tutor_pay_calc
      GROUP BY category
      ORDER BY category
    `;

    const cogsCategoryResult = await locationPool.query(cogsByCategoryQuery, [startDate, endDate]);

    const cogsByCategory = {
      home: 0,
      online: 0,
      retail: 0,
      schools: 0,
      other: 0,
      total: 0
    };

    for (const row of cogsCategoryResult.rows) {
      const amount = parseFloat(row.total) || 0;
      cogsByCategory[row.category] = amount;
      cogsByCategory.total += amount;
    }

    // ===========================================
    // COGS BY PAY TYPE (1099 vs W-2)
    // ===========================================
    // Source: appointments + appointment_contractors + contractors.labels
    // NOTE: Sibling premium is calculated per-appointment, then assigned to the
    // first contractor (by contractor_id) to avoid double-counting when multiple
    // contractors work the same appointment.
    const cogsByPayTypeQuery = `
      WITH contractor_pay AS (
        -- Base pay per contractor (without sibling premium)
        SELECT
          a.appointment_id,
          ac.contractor_id,
          CASE
            WHEN EXISTS (
              SELECT 1 FROM jsonb_array_elements_text(COALESCE(c.labels, '[]'::jsonb)) AS lbl
              WHERE lbl.value ILIKE '%W2%' OR lbl.value = 'W-2'
            ) THEN 'W-2'
            ELSE '1099'
          END as pay_type,
          CASE
            WHEN s.dft_charge_type = 'hourly' THEN ac.pay_rate * a.units
            WHEN s.dft_charge_type = 'one-off' THEN ac.pay_rate
            WHEN s.dft_charge_type = 'one-off-split' THEN ac.pay_rate
            WHEN s.dft_charge_type = 'hourly-split' THEN ac.pay_rate * a.units
            ELSE ac.pay_rate * a.units
          END AS base_pay,
          -- Only add sibling premium to the first contractor per appointment
          CASE
            WHEN ac.contractor_id = (
              SELECT MIN(ac2.contractor_id)
              FROM appointment_contractors ac2
              WHERE ac2.appointment_id = a.appointment_id
            ) THEN COALESCE(
              (SELECT COUNT(*) * COALESCE(s.sr_premium, 0) * a.units
               FROM appointment_recipients ar2
               WHERE ar2.appointment_id = a.appointment_id
                 AND ar2.status <> 'missed'),
              0
            )
            ELSE 0
          END AS sibling_premium
        FROM appointments a
        JOIN services s ON a.service_id = s.service_id
        JOIN appointment_contractors ac ON a.appointment_id = ac.appointment_id
        LEFT JOIN contractors c ON ac.contractor_id = c.contractor_id
        WHERE a.status IN ('complete', 'cancelled-chargeable')
          AND a.is_deleted IS NOT TRUE
          AND a.start >= $1
          AND a.start < $2
      )
      SELECT
        pay_type,
        COALESCE(SUM(base_pay + sibling_premium), 0) as total
      FROM contractor_pay
      GROUP BY pay_type
      ORDER BY pay_type
    `;

    const payTypeResult = await locationPool.query(cogsByPayTypeQuery, [startDate, endDate]);

    const cogsByPayType = {
      '1099': 0,
      'W-2': 0,
      total: 0
    };

    for (const row of payTypeResult.rows) {
      const amount = parseFloat(row.total) || 0;
      cogsByPayType[row.pay_type] = amount;
      cogsByPayType.total += amount;
    }

    // ===========================================
    // AD HOC CHARGES BY CATEGORY
    // ===========================================
    // Ad hoc charges categorized by contractor's primary work type in the month
    const adhocByCategoryQuery = `
      WITH contractor_primary_category AS (
        -- Find each contractor's most common service category in this period
        SELECT
          ac.contractor_id,
          (
            SELECT cat FROM (
              SELECT
                CASE
                  WHEN EXISTS (SELECT 1 FROM jsonb_array_elements_text(COALESCE(s2.labels, '[]'::jsonb)) AS lbl WHERE lbl.value ILIKE '%Home%') THEN 'home'
                  WHEN EXISTS (SELECT 1 FROM jsonb_array_elements_text(COALESCE(s2.labels, '[]'::jsonb)) AS lbl WHERE lbl.value ILIKE '%Online%') THEN 'online'
                  WHEN EXISTS (SELECT 1 FROM jsonb_array_elements_text(COALESCE(s2.labels, '[]'::jsonb)) AS lbl WHERE lbl.value ILIKE '%Club%' OR lbl.value ILIKE '%Park Slope%' OR lbl.value ILIKE '%UES%') THEN 'retail'
                  WHEN EXISTS (SELECT 1 FROM jsonb_array_elements_text(COALESCE(s2.labels, '[]'::jsonb)) AS lbl WHERE lbl.value ILIKE '%School%') THEN 'schools'
                  ELSE 'other'
                END as cat,
                COUNT(*) as cnt
              FROM appointments a2
              JOIN services s2 ON a2.service_id = s2.service_id
              JOIN appointment_contractors ac2 ON a2.appointment_id = ac2.appointment_id
              WHERE ac2.contractor_id = ac.contractor_id
                AND a2.status IN ('complete', 'cancelled-chargeable')
                AND a2.is_deleted IS NOT TRUE
                AND a2.start >= $1
                AND a2.start < $2
              GROUP BY cat
              ORDER BY cnt DESC
              LIMIT 1
            ) sub
          ) as primary_category
        FROM appointment_contractors ac
        JOIN appointments a ON a.appointment_id = ac.appointment_id
        WHERE a.status IN ('complete', 'cancelled-chargeable')
          AND a.is_deleted IS NOT TRUE
          AND a.start >= $1
          AND a.start < $2
        GROUP BY ac.contractor_id
      )
      SELECT
        COALESCE(cpc.primary_category, adhoc.service_category, 'other') as category,
        COALESCE(SUM(adhoc.pay_contractor), 0) as total,
        COUNT(*) as count
      FROM adhoc_charges adhoc
      LEFT JOIN contractor_primary_category cpc ON adhoc.contractor_id::text = cpc.contractor_id::text
      WHERE adhoc.date_occurred >= $1
        AND adhoc.date_occurred < $2
        AND adhoc.pay_contractor > 0
      GROUP BY COALESCE(cpc.primary_category, adhoc.service_category, 'other')
      ORDER BY total DESC
    `;

    const adhocResult = await locationPool.query(adhocByCategoryQuery, [startDate, endDate]);

    const adhocByCategory = {
      home: 0,
      online: 0,
      retail: 0,
      schools: 0,
      other: 0,
      total: 0
    };

    const adhocSummary = [];
    for (const row of adhocResult.rows) {
      const amount = parseFloat(row.total) || 0;
      const category = row.category || 'other';
      adhocByCategory[category] = (adhocByCategory[category] || 0) + amount;
      adhocByCategory.total += amount;
      adhocSummary.push({
        category: category,
        count: parseInt(row.count),
        total: Math.round(amount * 100) / 100
      });
    }

    // Add ad hoc charges to COGS by category
    for (const cat of ['home', 'online', 'retail', 'schools', 'other']) {
      cogsByCategory[cat] += adhocByCategory[cat] || 0;
      cogsByCategory.total += adhocByCategory[cat] || 0;
    }

    // ===========================================
    // DISTRIBUTE "OTHER" PROPORTIONALLY
    // ===========================================
    // Instead of having an "other" category, distribute it across
    // home, online, retail, schools based on their existing proportions.
    // This maintains COGS by category total = COGS by pay type total.

    // Distribute revenue "other" proportionally
    const revenueOther = revenueByCategory.other;
    const revenueKnown = revenueByCategory.home + revenueByCategory.online +
                         revenueByCategory.retail + revenueByCategory.schools;

    if (revenueKnown > 0 && revenueOther > 0) {
      const revHomeShare = revenueByCategory.home / revenueKnown;
      const revOnlineShare = revenueByCategory.online / revenueKnown;
      const revRetailShare = revenueByCategory.retail / revenueKnown;
      const revSchoolsShare = revenueByCategory.schools / revenueKnown;

      revenueByCategory.home += revenueOther * revHomeShare;
      revenueByCategory.online += revenueOther * revOnlineShare;
      revenueByCategory.retail += revenueOther * revRetailShare;
      revenueByCategory.schools += revenueOther * revSchoolsShare;
      revenueByCategory.other = 0;
    } else if (revenueOther > 0) {
      // Edge case: no known categories, default to home
      revenueByCategory.home += revenueOther;
      revenueByCategory.other = 0;
    }

    // Distribute COGS "other" proportionally
    const cogsOther = cogsByCategory.other;
    const cogsKnown = cogsByCategory.home + cogsByCategory.online +
                      cogsByCategory.retail + cogsByCategory.schools;

    if (cogsKnown > 0 && cogsOther > 0) {
      const cogsHomeShare = cogsByCategory.home / cogsKnown;
      const cogsOnlineShare = cogsByCategory.online / cogsKnown;
      const cogsRetailShare = cogsByCategory.retail / cogsKnown;
      const cogsSchoolsShare = cogsByCategory.schools / cogsKnown;

      cogsByCategory.home += cogsOther * cogsHomeShare;
      cogsByCategory.online += cogsOther * cogsOnlineShare;
      cogsByCategory.retail += cogsOther * cogsRetailShare;
      cogsByCategory.schools += cogsOther * cogsSchoolsShare;
      cogsByCategory.other = 0;
    } else if (cogsOther > 0) {
      // Edge case: no known categories, default to home
      cogsByCategory.home += cogsOther;
      cogsByCategory.other = 0;
    }

    // ===========================================
    // AD HOC CHARGES BY PAY TYPE
    // ===========================================
    const adhocByPayTypeQuery = `
      SELECT
        CASE
          WHEN EXISTS (
            SELECT 1 FROM jsonb_array_elements_text(COALESCE(c.labels, '[]'::jsonb)) AS lbl
            WHERE lbl.value ILIKE '%W2%' OR lbl.value = 'W-2'
          ) THEN 'W-2'
          ELSE '1099'
        END as pay_type,
        COALESCE(SUM(adhoc.pay_contractor), 0) as total
      FROM adhoc_charges adhoc
      LEFT JOIN contractors c ON adhoc.contractor_id::text = c.contractor_id::text
      WHERE adhoc.date_occurred >= $1
        AND adhoc.date_occurred < $2
        AND adhoc.pay_contractor > 0
      GROUP BY
        CASE
          WHEN EXISTS (
            SELECT 1 FROM jsonb_array_elements_text(COALESCE(c.labels, '[]'::jsonb)) AS lbl
            WHERE lbl.value ILIKE '%W2%' OR lbl.value = 'W-2'
          ) THEN 'W-2'
          ELSE '1099'
        END
    `;

    const adhocPayTypeResult = await locationPool.query(adhocByPayTypeQuery, [startDate, endDate]);

    for (const row of adhocPayTypeResult.rows) {
      const amount = parseFloat(row.total) || 0;
      cogsByPayType[row.pay_type] = (cogsByPayType[row.pay_type] || 0) + amount;
      cogsByPayType.total += amount;
    }

    // ===========================================
    // CALCULATE GROSS PROFIT BY CATEGORY
    // ===========================================
    const grossProfitByCategory = {
      home: revenueByCategory.home - cogsByCategory.home,
      online: revenueByCategory.online - cogsByCategory.online,
      retail: revenueByCategory.retail - cogsByCategory.retail,
      schools: revenueByCategory.schools - cogsByCategory.schools,
      other: revenueByCategory.other - cogsByCategory.other,
      total: revenueByCategory.total - cogsByCategory.total
    };

    // ===========================================
    // CALCULATE PERCENTAGE OF TOTAL REVENUE
    // ===========================================
    const percentOfTotal = {
      home: revenueByCategory.total > 0 ? (revenueByCategory.home / revenueByCategory.total) * 100 : 0,
      online: revenueByCategory.total > 0 ? (revenueByCategory.online / revenueByCategory.total) * 100 : 0,
      retail: revenueByCategory.total > 0 ? (revenueByCategory.retail / revenueByCategory.total) * 100 : 0,
      schools: revenueByCategory.total > 0 ? (revenueByCategory.schools / revenueByCategory.total) * 100 : 0,
      other: revenueByCategory.total > 0 ? (revenueByCategory.other / revenueByCategory.total) * 100 : 0
    };

    // ===========================================
    // DETAILED "OTHER" BREAKDOWN
    // ===========================================
    const otherBreakdownQuery = `
      WITH uncategorized_appointments AS (
        SELECT
          'Uncategorized Appointment' as category_name,
          COALESCE(s.name, 'Unknown Service') as description,
          SUM(
            CASE
              WHEN s.dft_charge_type = 'hourly' THEN ac.pay_rate * a.units
              WHEN s.dft_charge_type = 'one-off' THEN ac.pay_rate
              ELSE ac.pay_rate * a.units
            END
          ) as amount,
          CONCAT(c.first_name, ' ', c.last_name) as contractor_name,
          a.start as date_occurred
        FROM appointments a
        JOIN services s ON a.service_id = s.service_id
        JOIN appointment_contractors ac ON a.appointment_id = ac.appointment_id
        LEFT JOIN contractors c ON ac.contractor_id = c.contractor_id
        WHERE a.status IN ('complete', 'cancelled-chargeable')
          AND a.is_deleted IS NOT TRUE
          AND a.start >= $1
          AND a.start < $2
          AND NOT EXISTS (
            SELECT 1 FROM jsonb_array_elements_text(COALESCE(s.labels, '[]'::jsonb)) AS lbl
            WHERE lbl.value ILIKE '%Home%'
              OR lbl.value ILIKE '%Online%'
              OR lbl.value ILIKE '%School%'
              OR lbl.value ILIKE '%Club%'
              OR lbl.value ILIKE '%Park Slope%'
              OR lbl.value ILIKE '%UES%'
          )
        GROUP BY s.name, c.first_name, c.last_name, a.start
      ),
      other_adhoc AS (
        SELECT
          ac.category_name,
          ac.description,
          ac.pay_contractor as amount,
          CONCAT(ac.contractor_first_name, ' ', ac.contractor_last_name) as contractor_name,
          ac.date_occurred
        FROM adhoc_charges ac
        WHERE COALESCE(ac.service_category, 'other') = 'other'
          AND ac.date_occurred >= $1
          AND ac.date_occurred < $2
          AND ac.pay_contractor > 0
      )
      SELECT * FROM uncategorized_appointments WHERE amount > 0
      UNION ALL
      SELECT * FROM other_adhoc
      ORDER BY amount DESC
      LIMIT 50
    `;

    const otherBreakdownResult = await locationPool.query(otherBreakdownQuery, [startDate, endDate]);

    // ===========================================
    // RECONCILIATION CHECK
    // ===========================================
    const discrepancy = Math.abs(cogsByPayType.total - cogsByCategory.total);
    const isReconciled = discrepancy < 0.01; // Allow for floating point errors

    const response = {
      period: {
        year: yearNum,
        month: monthNum,
        monthName: new Date(yearNum, monthNum - 1, 1).toLocaleString('default', { month: 'long' }),
        startDate: startDate.toISOString().split('T')[0],
        endDate: new Date(yearNum, monthNum, 0).toISOString().split('T')[0] // Last day of month
      },
      revenueByCategory: {
        home: Math.round(revenueByCategory.home * 100) / 100,
        online: Math.round(revenueByCategory.online * 100) / 100,
        retail: Math.round(revenueByCategory.retail * 100) / 100,
        schools: Math.round(revenueByCategory.schools * 100) / 100,
        other: Math.round(revenueByCategory.other * 100) / 100,
        total: Math.round(revenueByCategory.total * 100) / 100
      },
      cogsByPayType: {
        '1099': Math.round(cogsByPayType['1099'] * 100) / 100,
        'W-2': Math.round(cogsByPayType['W-2'] * 100) / 100,
        total: Math.round(cogsByPayType.total * 100) / 100
      },
      cogsByCategory: {
        home: Math.round(cogsByCategory.home * 100) / 100,
        online: Math.round(cogsByCategory.online * 100) / 100,
        retail: Math.round(cogsByCategory.retail * 100) / 100,
        schools: Math.round(cogsByCategory.schools * 100) / 100,
        other: Math.round(cogsByCategory.other * 100) / 100,
        total: Math.round(cogsByCategory.total * 100) / 100
      },
      grossProfitByCategory: {
        home: Math.round(grossProfitByCategory.home * 100) / 100,
        online: Math.round(grossProfitByCategory.online * 100) / 100,
        retail: Math.round(grossProfitByCategory.retail * 100) / 100,
        schools: Math.round(grossProfitByCategory.schools * 100) / 100,
        other: Math.round(grossProfitByCategory.other * 100) / 100,
        total: Math.round(grossProfitByCategory.total * 100) / 100
      },
      percentOfTotal: {
        home: Math.round(percentOfTotal.home * 100) / 100,
        online: Math.round(percentOfTotal.online * 100) / 100,
        retail: Math.round(percentOfTotal.retail * 100) / 100,
        schools: Math.round(percentOfTotal.schools * 100) / 100,
        other: Math.round(percentOfTotal.other * 100) / 100
      },
      reconciliation: {
        isReconciled,
        discrepancy: Math.round(discrepancy * 100) / 100,
        message: isReconciled
          ? 'Pay type and category totals match'
          : `Warning: $${discrepancy.toFixed(2)} discrepancy between pay type and category totals`
      },
      otherBreakdown: otherBreakdownResult.rows.map(row => ({
        categoryName: row.category_name,
        description: row.description,
        amount: Math.round(parseFloat(row.amount || 0) * 100) / 100,
        contractorName: row.contractor_name,
        dateOccurred: row.date_occurred
      })),
      adhocSummary
    };

    res.json(response);
  } catch (error) {
    logger.error({ err: error }, 'Error fetching monthly financials:');
    res.status(500).json({
      error: 'Failed to fetch monthly financials',
      details: error.message
    });
  }
}));

/**
 * GET /api/monthly-financials/export
 * Returns CSV-formatted data for spreadsheet import
 */
router.get('/export', auth, asyncHandler(async (req, res) => {
  try {
    const locationPool = req.locationPool || pool;
    const { year, month } = req.query;

    if (!year || !month) {
      return res.status(400).json({
        error: 'year and month are required query parameters'
      });
    }

    const yearNum = parseInt(year);
    const monthNum = parseInt(month);
    const monthName = new Date(yearNum, monthNum - 1, 1).toLocaleString('default', { month: 'long' });

    // Fetch data using the main endpoint logic
    const params = new URLSearchParams({ year: year.toString(), month: month.toString() });

    // Make internal request to get the data
    // We'll duplicate the query logic here for simplicity
    const startDate = new Date(yearNum, monthNum - 1, 1);
    const endDate = new Date(yearNum, monthNum, 1);

    // Revenue by Category
    const revenueByCategoryQuery = `
      WITH revenue_calc AS (
        SELECT
          a.appointment_id,
          CASE
            WHEN EXISTS (SELECT 1 FROM jsonb_array_elements_text(COALESCE(s.labels, '[]'::jsonb)) AS lbl WHERE lbl.value ILIKE '%Home%') THEN 'In-Home'
            WHEN EXISTS (SELECT 1 FROM jsonb_array_elements_text(COALESCE(s.labels, '[]'::jsonb)) AS lbl WHERE lbl.value ILIKE '%Online%') THEN 'Online'
            WHEN EXISTS (SELECT 1 FROM jsonb_array_elements_text(COALESCE(s.labels, '[]'::jsonb)) AS lbl WHERE lbl.value ILIKE '%Club%' OR lbl.value ILIKE '%Park Slope%' OR lbl.value ILIKE '%UES%') THEN 'Retail'
            WHEN EXISTS (SELECT 1 FROM jsonb_array_elements_text(COALESCE(s.labels, '[]'::jsonb)) AS lbl WHERE lbl.value ILIKE '%School%') THEN 'Schools'
            ELSE 'Other'
          END as category,
          SUM(
            CASE
              WHEN s.dft_charge_type = 'hourly' THEN ar.charge_rate * a.units
              WHEN s.dft_charge_type = 'one-off' THEN ar.charge_rate
              WHEN s.dft_charge_type = 'one-off-split' THEN ar.charge_rate
              WHEN s.dft_charge_type = 'hourly-split' THEN ar.charge_rate * a.units
              ELSE ar.charge_rate * a.units
            END
          ) AS revenue
        FROM appointments a
        JOIN services s ON a.service_id = s.service_id
        LEFT JOIN appointment_recipients ar ON a.appointment_id = ar.appointment_id AND ar.status <> 'missed'
        WHERE a.status IN ('complete', 'cancelled-chargeable')
          AND a.is_deleted IS NOT TRUE
          AND a.start >= $1 AND a.start < $2
        GROUP BY a.appointment_id, s.labels, s.dft_charge_type
      )
      SELECT category, COALESCE(SUM(revenue), 0) as total
      FROM revenue_calc
      GROUP BY category
    `;

    // COGS by Category
    const cogsByCategoryQuery = `
      WITH tutor_pay_calc AS (
        SELECT
          a.appointment_id,
          CASE
            WHEN EXISTS (SELECT 1 FROM jsonb_array_elements_text(COALESCE(s.labels, '[]'::jsonb)) AS lbl WHERE lbl.value ILIKE '%Home%') THEN 'In-Home'
            WHEN EXISTS (SELECT 1 FROM jsonb_array_elements_text(COALESCE(s.labels, '[]'::jsonb)) AS lbl WHERE lbl.value ILIKE '%Online%') THEN 'Online'
            WHEN EXISTS (SELECT 1 FROM jsonb_array_elements_text(COALESCE(s.labels, '[]'::jsonb)) AS lbl WHERE lbl.value ILIKE '%Club%' OR lbl.value ILIKE '%Park Slope%' OR lbl.value ILIKE '%UES%') THEN 'Retail'
            WHEN EXISTS (SELECT 1 FROM jsonb_array_elements_text(COALESCE(s.labels, '[]'::jsonb)) AS lbl WHERE lbl.value ILIKE '%School%') THEN 'Schools'
            ELSE 'Other'
          END as category,
          SUM(
            CASE
              WHEN s.dft_charge_type = 'hourly' THEN ac.pay_rate * a.units
              WHEN s.dft_charge_type = 'one-off' THEN ac.pay_rate
              WHEN s.dft_charge_type = 'one-off-split' THEN ac.pay_rate
              WHEN s.dft_charge_type = 'hourly-split' THEN ac.pay_rate * a.units
              ELSE ac.pay_rate * a.units
            END
          ) + COALESCE(
            (SELECT COUNT(*) * COALESCE(s.sr_premium, 0) * a.units
             FROM appointment_recipients ar2
             WHERE ar2.appointment_id = a.appointment_id AND ar2.status <> 'missed'),
            0
          ) AS tutor_pay
        FROM appointments a
        JOIN services s ON a.service_id = s.service_id
        JOIN appointment_contractors ac ON a.appointment_id = ac.appointment_id
        WHERE a.status IN ('complete', 'cancelled-chargeable')
          AND a.is_deleted IS NOT TRUE
          AND a.start >= $1 AND a.start < $2
        GROUP BY a.appointment_id, s.labels, s.dft_charge_type, s.sr_premium, a.units
      )
      SELECT category, COALESCE(SUM(tutor_pay), 0) as total
      FROM tutor_pay_calc
      GROUP BY category
    `;

    // COGS by Pay Type (sibling premium assigned to first contractor only)
    const cogsByPayTypeQuery = `
      WITH contractor_pay AS (
        SELECT
          a.appointment_id,
          ac.contractor_id,
          CASE
            WHEN EXISTS (SELECT 1 FROM jsonb_array_elements_text(COALESCE(c.labels, '[]'::jsonb)) AS lbl WHERE lbl.value ILIKE '%W2%' OR lbl.value = 'W-2') THEN 'W-2'
            ELSE '1099'
          END as pay_type,
          CASE
            WHEN s.dft_charge_type = 'hourly' THEN ac.pay_rate * a.units
            WHEN s.dft_charge_type = 'one-off' THEN ac.pay_rate
            WHEN s.dft_charge_type = 'one-off-split' THEN ac.pay_rate
            WHEN s.dft_charge_type = 'hourly-split' THEN ac.pay_rate * a.units
            ELSE ac.pay_rate * a.units
          END AS base_pay,
          CASE
            WHEN ac.contractor_id = (SELECT MIN(ac2.contractor_id) FROM appointment_contractors ac2 WHERE ac2.appointment_id = a.appointment_id)
            THEN COALESCE((SELECT COUNT(*) * COALESCE(s.sr_premium, 0) * a.units FROM appointment_recipients ar2 WHERE ar2.appointment_id = a.appointment_id AND ar2.status <> 'missed'), 0)
            ELSE 0
          END AS sibling_premium
        FROM appointments a
        JOIN services s ON a.service_id = s.service_id
        JOIN appointment_contractors ac ON a.appointment_id = ac.appointment_id
        LEFT JOIN contractors c ON ac.contractor_id = c.contractor_id
        WHERE a.status IN ('complete', 'cancelled-chargeable')
          AND a.is_deleted IS NOT TRUE
          AND a.start >= $1 AND a.start < $2
      )
      SELECT pay_type, COALESCE(SUM(base_pay + sibling_premium), 0) as total
      FROM contractor_pay
      GROUP BY pay_type
    `;

    // Ad hoc by pay type
    const adhocByPayTypeQuery = `
      SELECT
        CASE
          WHEN EXISTS (SELECT 1 FROM jsonb_array_elements_text(COALESCE(c.labels, '[]'::jsonb)) AS lbl WHERE lbl.value ILIKE '%W2%' OR lbl.value = 'W-2') THEN 'W-2'
          ELSE '1099'
        END as pay_type,
        COALESCE(SUM(adhoc.pay_contractor), 0) as total
      FROM adhoc_charges adhoc
      LEFT JOIN contractors c ON adhoc.contractor_id::text = c.contractor_id::text
      WHERE adhoc.date_occurred >= $1 AND adhoc.date_occurred < $2 AND adhoc.pay_contractor > 0
      GROUP BY
        CASE
          WHEN EXISTS (SELECT 1 FROM jsonb_array_elements_text(COALESCE(c.labels, '[]'::jsonb)) AS lbl WHERE lbl.value ILIKE '%W2%' OR lbl.value = 'W-2') THEN 'W-2'
          ELSE '1099'
        END
    `;

    const [revenueResult, cogsResult, payTypeResult, adhocPayTypeResult] = await Promise.all([
      locationPool.query(revenueByCategoryQuery, [startDate, endDate]),
      locationPool.query(cogsByCategoryQuery, [startDate, endDate]),
      locationPool.query(cogsByPayTypeQuery, [startDate, endDate]),
      locationPool.query(adhocByPayTypeQuery, [startDate, endDate])
    ]);

    // Build data structures
    const categoryOrder = ['In-Home', 'Online', 'Retail', 'Schools', 'Other'];
    const revenueMap = {};
    const cogsMap = {};
    const payTypeMap = { '1099': 0, 'W-2': 0 };

    for (const row of revenueResult.rows) {
      revenueMap[row.category] = parseFloat(row.total) || 0;
    }
    for (const row of cogsResult.rows) {
      cogsMap[row.category] = parseFloat(row.total) || 0;
    }
    for (const row of payTypeResult.rows) {
      payTypeMap[row.pay_type] = (payTypeMap[row.pay_type] || 0) + (parseFloat(row.total) || 0);
    }
    for (const row of adhocPayTypeResult.rows) {
      payTypeMap[row.pay_type] = (payTypeMap[row.pay_type] || 0) + (parseFloat(row.total) || 0);
    }

    // ===========================================
    // DISTRIBUTE "OTHER" PROPORTIONALLY
    // ===========================================
    // Distribute "Other" across the 4 main categories proportionally

    // Distribute revenue "Other" proportionally
    const revOther = revenueMap['Other'] || 0;
    const revKnown = (revenueMap['In-Home'] || 0) + (revenueMap['Online'] || 0) +
                     (revenueMap['Retail'] || 0) + (revenueMap['Schools'] || 0);

    if (revKnown > 0 && revOther > 0) {
      const revHomeShare = (revenueMap['In-Home'] || 0) / revKnown;
      const revOnlineShare = (revenueMap['Online'] || 0) / revKnown;
      const revRetailShare = (revenueMap['Retail'] || 0) / revKnown;
      const revSchoolsShare = (revenueMap['Schools'] || 0) / revKnown;

      revenueMap['In-Home'] = (revenueMap['In-Home'] || 0) + revOther * revHomeShare;
      revenueMap['Online'] = (revenueMap['Online'] || 0) + revOther * revOnlineShare;
      revenueMap['Retail'] = (revenueMap['Retail'] || 0) + revOther * revRetailShare;
      revenueMap['Schools'] = (revenueMap['Schools'] || 0) + revOther * revSchoolsShare;
      revenueMap['Other'] = 0;
    } else if (revOther > 0) {
      revenueMap['In-Home'] = (revenueMap['In-Home'] || 0) + revOther;
      revenueMap['Other'] = 0;
    }

    // Distribute COGS "Other" proportionally
    const cogsOtherExp = cogsMap['Other'] || 0;
    const cogsKnownExp = (cogsMap['In-Home'] || 0) + (cogsMap['Online'] || 0) +
                         (cogsMap['Retail'] || 0) + (cogsMap['Schools'] || 0);

    if (cogsKnownExp > 0 && cogsOtherExp > 0) {
      const cogsHomeShare = (cogsMap['In-Home'] || 0) / cogsKnownExp;
      const cogsOnlineShare = (cogsMap['Online'] || 0) / cogsKnownExp;
      const cogsRetailShare = (cogsMap['Retail'] || 0) / cogsKnownExp;
      const cogsSchoolsShare = (cogsMap['Schools'] || 0) / cogsKnownExp;

      cogsMap['In-Home'] = (cogsMap['In-Home'] || 0) + cogsOtherExp * cogsHomeShare;
      cogsMap['Online'] = (cogsMap['Online'] || 0) + cogsOtherExp * cogsOnlineShare;
      cogsMap['Retail'] = (cogsMap['Retail'] || 0) + cogsOtherExp * cogsRetailShare;
      cogsMap['Schools'] = (cogsMap['Schools'] || 0) + cogsOtherExp * cogsSchoolsShare;
      cogsMap['Other'] = 0;
    } else if (cogsOtherExp > 0) {
      cogsMap['In-Home'] = (cogsMap['In-Home'] || 0) + cogsOtherExp;
      cogsMap['Other'] = 0;
    }

    // Remove 'Other' from the category order since it's now distributed
    const categoryOrderFinal = ['In-Home', 'Online', 'Retail', 'Schools'];

    // Calculate totals
    let revenueTotal = 0;
    let cogsTotal = 0;
    for (const cat of categoryOrderFinal) {
      revenueTotal += revenueMap[cat] || 0;
      cogsTotal += cogsMap[cat] || 0;
    }
    const payTypeTotal = payTypeMap['1099'] + payTypeMap['W-2'];

    // Build CSV content
    const csvLines = [
      `Monthly Financial Report - ${monthName} ${yearNum}`,
      '',
      'REVENUE BY CATEGORY',
      'Category,Amount'
    ];

    for (const cat of categoryOrderFinal) {
      csvLines.push(`${cat},${(revenueMap[cat] || 0).toFixed(2)}`);
    }
    csvLines.push(`Total,${revenueTotal.toFixed(2)}`);

    csvLines.push('');
    csvLines.push('COGS BY PAY TYPE');
    csvLines.push('Type,Amount');
    csvLines.push(`1099,${payTypeMap['1099'].toFixed(2)}`);
    csvLines.push(`W-2,${payTypeMap['W-2'].toFixed(2)}`);
    csvLines.push(`Total,${payTypeTotal.toFixed(2)}`);

    csvLines.push('');
    csvLines.push('COGS BY CATEGORY');
    csvLines.push('Category,Amount');
    for (const cat of categoryOrderFinal) {
      csvLines.push(`${cat},${(cogsMap[cat] || 0).toFixed(2)}`);
    }
    csvLines.push(`Total,${cogsTotal.toFixed(2)}`);

    csvLines.push('');
    csvLines.push('GROSS PROFIT BY CATEGORY');
    csvLines.push('Category,Revenue,COGS,Gross Profit,Margin %');
    for (const cat of categoryOrderFinal) {
      const rev = revenueMap[cat] || 0;
      const cogs = cogsMap[cat] || 0;
      const profit = rev - cogs;
      const margin = rev > 0 ? ((profit / rev) * 100).toFixed(1) : '0.0';
      csvLines.push(`${cat},${rev.toFixed(2)},${cogs.toFixed(2)},${profit.toFixed(2)},${margin}%`);
    }
    const totalProfit = revenueTotal - cogsTotal;
    const totalMargin = revenueTotal > 0 ? ((totalProfit / revenueTotal) * 100).toFixed(1) : '0.0';
    csvLines.push(`Total,${revenueTotal.toFixed(2)},${cogsTotal.toFixed(2)},${totalProfit.toFixed(2)},${totalMargin}%`);

    csvLines.push('');
    csvLines.push('% OF TOTAL REVENUE');
    csvLines.push('Category,Percentage');
    for (const cat of categoryOrderFinal) {
      const pct = revenueTotal > 0 ? (((revenueMap[cat] || 0) / revenueTotal) * 100).toFixed(1) : '0.0';
      csvLines.push(`${cat},${pct}%`);
    }

    csvLines.push('');
    csvLines.push('RECONCILIATION');
    const discrepancy = Math.abs(payTypeTotal - cogsTotal);
    csvLines.push(`COGS by Pay Type Total,${payTypeTotal.toFixed(2)}`);
    csvLines.push(`COGS by Category Total,${cogsTotal.toFixed(2)}`);
    csvLines.push(`Discrepancy,${discrepancy.toFixed(2)}`);
    csvLines.push(`Status,${discrepancy < 0.01 ? 'Reconciled' : 'MISMATCH'}`);

    const csvContent = csvLines.join('\n');

    res.setHeader('Content-Type', 'text/csv');
    res.setHeader('Content-Disposition', `attachment; filename="monthly-financials-${yearNum}-${String(monthNum).padStart(2, '0')}.csv"`);
    res.send(csvContent);
  } catch (error) {
    logger.error({ err: error }, 'Error exporting monthly financials:');
    res.status(500).json({
      error: 'Failed to export monthly financials',
      details: error.message
    });
  }
}));

/**
 * POST /api/monthly-financials/recategorize-adhoc
 * Manually recategorize an ad hoc charge
 */
router.post('/recategorize-adhoc', auth, asyncHandler(async (req, res) => {
  try {
    const locationPool = req.locationPool || pool;
    const { adhocChargeId, serviceCategory } = req.body;

    if (!adhocChargeId || !serviceCategory) {
      return res.status(400).json({
        error: 'adhocChargeId and serviceCategory are required'
      });
    }

    const validCategories = ['home', 'online', 'retail', 'schools', 'other'];
    if (!validCategories.includes(serviceCategory)) {
      return res.status(400).json({
        error: `Invalid serviceCategory. Must be one of: ${validCategories.join(', ')}`
      });
    }

    const result = await locationPool.query(
      `UPDATE adhoc_charges
       SET service_category = $1, last_updated = NOW()
       WHERE id = $2
       RETURNING id, category_name, service_category, pay_contractor`,
      [serviceCategory, adhocChargeId]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({
        error: 'Ad hoc charge not found'
      });
    }

    res.json({
      success: true,
      adhocCharge: result.rows[0]
    });
  } catch (error) {
    logger.error({ err: error }, 'Error recategorizing ad hoc charge:');
    res.status(500).json({
      error: 'Failed to recategorize ad hoc charge',
      details: error.message
    });
  }
}));

// ===========================================
// FRANCHISEE MONTHLY FINANCIALS
// ===========================================

/**
 * Check if user is from main branch (for franchisee data access)
 */
function checkMainBranch(req, res, next) {
  try {
    const hostname = req.get('host') || req.hostname;

    // Allow localhost for development
    if (hostname && (hostname.includes('localhost') || hostname.includes('127.0.0.1'))) {
      return next();
    }

    const subdomain = hostname ? hostname.split('.')[0] : 'join';
    const isMainBranch = subdomain === 'join' || subdomain === 'acme-ops-main';

    if (!isMainBranch) {
      return res.status(403).json({ error: 'Access denied. Franchisee data only available to main branch.' });
    }

    next();
  } catch (error) {
    logger.error({ err: error }, 'Error checking branch access:');
    res.status(500).json({ error: 'Failed to verify branch access' });
  }
}

/**
 * Get monthly financials for a single franchisee location
 */
async function getLocationMonthlyFinancials(location, startDate, endDate) {
  const locationPool = getPool(location);

  // Get total lessons
  const lessonsResult = await locationPool.query(`
    SELECT COUNT(*) as total
    FROM appointments a
    WHERE a.status IN ('complete', 'completed', 'cancelled-chargeable')
      AND (a.is_deleted = false OR a.is_deleted IS NULL)
      AND a.start >= $1 AND a.start < $2
  `, [startDate, endDate]);

  // Get total hours
  const hoursResult = await locationPool.query(`
    SELECT COALESCE(SUM(a.units), 0) as total
    FROM appointments a
    WHERE a.status IN ('complete', 'completed', 'cancelled-chargeable')
      AND (a.is_deleted = false OR a.is_deleted IS NULL)
      AND a.start >= $1 AND a.start < $2
  `, [startDate, endDate]);

  // Get total students
  const studentsResult = await locationPool.query(`
    SELECT COUNT(DISTINCT ar.recipient_id) as total
    FROM appointments a
    JOIN appointment_recipients ar ON a.appointment_id = ar.appointment_id AND ar.status <> 'missed'
    WHERE a.status IN ('complete', 'completed', 'cancelled-chargeable')
      AND (a.is_deleted = false OR a.is_deleted IS NULL)
      AND a.start >= $1 AND a.start < $2
  `, [startDate, endDate]);

  // Get total revenue
  const revenueResult = await locationPool.query(`
    SELECT COALESCE(SUM(
      CASE
        WHEN a.charge_type = 'hourly' THEN ar.charge_rate * a.units
        WHEN a.charge_type = 'one-off' THEN ar.charge_rate
        WHEN a.charge_type = 'one-off-split' THEN ar.charge_rate
        WHEN a.charge_type = 'hourly-split' THEN ar.charge_rate * a.units
        ELSE ar.charge_rate * a.units
      END
    ), 0) as total
    FROM appointments a
    LEFT JOIN appointment_recipients ar ON a.appointment_id = ar.appointment_id AND ar.status <> 'missed'
    WHERE a.status IN ('complete', 'cancelled-chargeable')
      AND (a.is_deleted = false OR a.is_deleted IS NULL)
      AND a.start >= $1 AND a.start < $2
  `, [startDate, endDate]);

  // Get total tutor pay
  const tutorPayResult = await locationPool.query(`
    SELECT COALESCE(SUM(
      CASE
        WHEN a.charge_type = 'hourly' THEN ac.pay_rate * a.units
        WHEN a.charge_type = 'one-off' THEN ac.pay_rate
        WHEN a.charge_type = 'one-off-split' THEN ac.pay_rate
        WHEN a.charge_type = 'hourly-split' THEN ac.pay_rate * a.units
        ELSE ac.pay_rate * a.units
      END
    ), 0) as total
    FROM appointments a
    JOIN appointment_contractors ac ON a.appointment_id = ac.appointment_id
    WHERE a.status IN ('complete', 'cancelled-chargeable')
      AND (a.is_deleted = false OR a.is_deleted IS NULL)
      AND a.start >= $1 AND a.start < $2
  `, [startDate, endDate]);

  // Get ad hoc pay (if table exists)
  let adhocPay = 0;
  try {
    const adhocResult = await locationPool.query(`
      SELECT COALESCE(SUM(pay_contractor), 0) as total
      FROM adhoc_charges
      WHERE date_occurred >= $1 AND date_occurred < $2
    `, [startDate, endDate]);
    adhocPay = parseFloat(adhocResult.rows[0]?.total || 0);
  } catch (e) {
    // Table might not exist
    adhocPay = 0;
  }

  const revenue = parseFloat(revenueResult.rows[0]?.total || 0);
  const tutorPay = parseFloat(tutorPayResult.rows[0]?.total || 0);
  const totalCogs = tutorPay + adhocPay;
  const grossProfit = revenue - totalCogs;
  const grossMargin = revenue > 0 ? (grossProfit / revenue) * 100 : 0;

  return {
    lessons: parseInt(lessonsResult.rows[0]?.total || 0),
    hours: parseFloat(hoursResult.rows[0]?.total || 0),
    students: parseInt(studentsResult.rows[0]?.total || 0),
    revenue,
    tutorPay,
    adhocPay,
    totalCogs,
    grossProfit,
    grossMargin
  };
}

/**
 * GET /api/monthly-financials/franchisee
 * Returns monthly financial data for franchisee locations (Westside & Eastside)
 */
router.get('/franchisee', auth, checkMainBranch, asyncHandler(async (req, res) => {
  try {
    const { year, month } = req.query;

    if (!year || !month) {
      return res.status(400).json({
        error: 'year and month are required query parameters'
      });
    }

    const yearNum = parseInt(year);
    const monthNum = parseInt(month);

    if (isNaN(yearNum) || isNaN(monthNum) || monthNum < 1 || monthNum > 12) {
      return res.status(400).json({
        error: 'Invalid year or month format'
      });
    }

    const startDate = new Date(yearNum, monthNum - 1, 1);
    const endDate = new Date(yearNum, monthNum, 1);

    // Fetch data from both locations in parallel
    const [westsideData, eastsideData] = await Promise.all([
      getLocationMonthlyFinancials('westside', startDate, endDate),
      getLocationMonthlyFinancials('eastside', startDate, endDate)
    ]);

    // Calculate combined totals
    const combined = {
      lessons: westsideData.lessons + eastsideData.lessons,
      hours: westsideData.hours + eastsideData.hours,
      students: westsideData.students + eastsideData.students,
      revenue: westsideData.revenue + eastsideData.revenue,
      tutorPay: westsideData.tutorPay + eastsideData.tutorPay,
      adhocPay: westsideData.adhocPay + eastsideData.adhocPay,
      totalCogs: westsideData.totalCogs + eastsideData.totalCogs,
      grossProfit: westsideData.grossProfit + eastsideData.grossProfit,
      grossMargin: 0
    };
    combined.grossMargin = combined.revenue > 0 ? (combined.grossProfit / combined.revenue) * 100 : 0;

    res.json({
      period: {
        year: yearNum,
        month: monthNum,
        monthName: new Date(yearNum, monthNum - 1, 1).toLocaleString('default', { month: 'long' }),
        startDate: startDate.toISOString().split('T')[0],
        endDate: new Date(yearNum, monthNum, 0).toISOString().split('T')[0]
      },
      combined: {
        lessons: combined.lessons,
        hours: Math.round(combined.hours * 100) / 100,
        students: combined.students,
        revenue: Math.round(combined.revenue * 100) / 100,
        tutorPay: Math.round(combined.tutorPay * 100) / 100,
        adhocPay: Math.round(combined.adhocPay * 100) / 100,
        totalCogs: Math.round(combined.totalCogs * 100) / 100,
        grossProfit: Math.round(combined.grossProfit * 100) / 100,
        grossMargin: Math.round(combined.grossMargin * 100) / 100
      },
      locations: {
        'westside': {
          name: 'Westside',
          lessons: westsideData.lessons,
          hours: Math.round(westsideData.hours * 100) / 100,
          students: westsideData.students,
          revenue: Math.round(westsideData.revenue * 100) / 100,
          tutorPay: Math.round(westsideData.tutorPay * 100) / 100,
          adhocPay: Math.round(westsideData.adhocPay * 100) / 100,
          totalCogs: Math.round(westsideData.totalCogs * 100) / 100,
          grossProfit: Math.round(westsideData.grossProfit * 100) / 100,
          grossMargin: Math.round(westsideData.grossMargin * 100) / 100
        },
        'eastside': {
          name: 'Eastside',
          lessons: eastsideData.lessons,
          hours: Math.round(eastsideData.hours * 100) / 100,
          students: eastsideData.students,
          revenue: Math.round(eastsideData.revenue * 100) / 100,
          tutorPay: Math.round(eastsideData.tutorPay * 100) / 100,
          adhocPay: Math.round(eastsideData.adhocPay * 100) / 100,
          totalCogs: Math.round(eastsideData.totalCogs * 100) / 100,
          grossProfit: Math.round(eastsideData.grossProfit * 100) / 100,
          grossMargin: Math.round(eastsideData.grossMargin * 100) / 100
        }
      }
    });
  } catch (error) {
    logger.error({ err: error }, 'Error fetching franchisee monthly financials:');
    res.status(500).json({
      error: 'Failed to fetch franchisee monthly financials',
      details: error.message
    });
  }
}));

/**
 * GET /api/monthly-financials/franchisee/export
 * Export franchisee monthly financials as CSV
 */
router.get('/franchisee/export', auth, checkMainBranch, asyncHandler(async (req, res) => {
  try {
    const { year, month } = req.query;

    if (!year || !month) {
      return res.status(400).json({
        error: 'year and month are required query parameters'
      });
    }

    const yearNum = parseInt(year);
    const monthNum = parseInt(month);
    const monthName = new Date(yearNum, monthNum - 1, 1).toLocaleString('default', { month: 'long' });

    const startDate = new Date(yearNum, monthNum - 1, 1);
    const endDate = new Date(yearNum, monthNum, 1);

    const [westsideData, eastsideData] = await Promise.all([
      getLocationMonthlyFinancials('westside', startDate, endDate),
      getLocationMonthlyFinancials('eastside', startDate, endDate)
    ]);

    const combined = {
      lessons: westsideData.lessons + eastsideData.lessons,
      hours: westsideData.hours + eastsideData.hours,
      students: westsideData.students + eastsideData.students,
      revenue: westsideData.revenue + eastsideData.revenue,
      tutorPay: westsideData.tutorPay + eastsideData.tutorPay,
      adhocPay: westsideData.adhocPay + eastsideData.adhocPay,
      totalCogs: westsideData.totalCogs + eastsideData.totalCogs,
      grossProfit: westsideData.grossProfit + eastsideData.grossProfit,
      grossMargin: 0
    };
    combined.grossMargin = combined.revenue > 0 ? (combined.grossProfit / combined.revenue) * 100 : 0;

    const csvLines = [
      `Franchisee Monthly Financial Report - ${monthName} ${yearNum}`,
      '',
      'COMBINED TOTALS',
      'Metric,Value',
      `Total Lessons,${combined.lessons}`,
      `Total Hours,${combined.hours.toFixed(2)}`,
      `Total Students,${combined.students}`,
      `Total Revenue,$${combined.revenue.toFixed(2)}`,
      `Total Tutor Pay,$${combined.tutorPay.toFixed(2)}`,
      `Total Ad Hoc Pay,$${combined.adhocPay.toFixed(2)}`,
      `Total COGS,$${combined.totalCogs.toFixed(2)}`,
      `Gross Profit,$${combined.grossProfit.toFixed(2)}`,
      `Gross Margin,${combined.grossMargin.toFixed(1)}%`,
      '',
      'WESTSIDE',
      'Metric,Value',
      `Lessons,${westsideData.lessons}`,
      `Hours,${westsideData.hours.toFixed(2)}`,
      `Students,${westsideData.students}`,
      `Revenue,$${westsideData.revenue.toFixed(2)}`,
      `Tutor Pay,$${westsideData.tutorPay.toFixed(2)}`,
      `Ad Hoc Pay,$${westsideData.adhocPay.toFixed(2)}`,
      `Total COGS,$${westsideData.totalCogs.toFixed(2)}`,
      `Gross Profit,$${westsideData.grossProfit.toFixed(2)}`,
      `Gross Margin,${westsideData.grossMargin.toFixed(1)}%`,
      '',
      'EASTSIDE',
      'Metric,Value',
      `Lessons,${eastsideData.lessons}`,
      `Hours,${eastsideData.hours.toFixed(2)}`,
      `Students,${eastsideData.students}`,
      `Revenue,$${eastsideData.revenue.toFixed(2)}`,
      `Tutor Pay,$${eastsideData.tutorPay.toFixed(2)}`,
      `Ad Hoc Pay,$${eastsideData.adhocPay.toFixed(2)}`,
      `Total COGS,$${eastsideData.totalCogs.toFixed(2)}`,
      `Gross Profit,$${eastsideData.grossProfit.toFixed(2)}`,
      `Gross Margin,${eastsideData.grossMargin.toFixed(1)}%`
    ];

    res.setHeader('Content-Type', 'text/csv');
    res.setHeader('Content-Disposition', `attachment; filename="franchisee-financials-${yearNum}-${String(monthNum).padStart(2, '0')}.csv"`);
    res.send(csvLines.join('\n'));
  } catch (error) {
    logger.error({ err: error }, 'Error exporting franchisee monthly financials:');
    res.status(500).json({
      error: 'Failed to export franchisee monthly financials',
      details: error.message
    });
  }
}));

module.exports = router;
