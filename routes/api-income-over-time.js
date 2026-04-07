const express = require('express');
const { asyncHandler } = require('../middleware/error-handler');
const { logger } = require('../utils/logger');
const router = express.Router();
const { pool, auth } = global;

/**
 * GET /api/income-over-time
 * Returns income data grouped by time periods (monthly/weekly/daily)
 * Query params:
 *   - dateType: 'activity' | 'invoice' (default: 'activity')
 *   - interval: 'month' | 'week' | 'day' (default: 'month')
 *   - startDate: YYYY-MM-DD
 *   - endDate: YYYY-MM-DD
 *   - clientManagerId: optional client manager filter
 *   - showAllBranches: boolean
 */
router.get('/', auth, asyncHandler(async (req, res) => {
  try {
    const locationPool = req.locationPool || pool;
    const { 
      dateType = 'activity', 
      interval = 'month', 
      startDate, 
      endDate, 
      clientManagerId,
      showAllBranches 
    } = req.query;

    if (!startDate || !endDate) {
      return res.status(400).json({
        error: 'startDate and endDate are required'
      });
    }

    // Parse dates
    const start = new Date(startDate);
    const end = new Date(endDate);
    end.setHours(23, 59, 59, 999); // Include full end date

    // Determine date truncation based on interval
    let dateTrunc;
    let dateFormat;
    switch (interval) {
      case 'day':
        dateTrunc = 'day';
        dateFormat = 'YYYY-MM-DD';
        break;
      case 'week':
        dateTrunc = 'week';
        dateFormat = 'YYYY-MM-DD';
        break;
      case 'month':
      default:
        dateTrunc = 'month';
        dateFormat = 'YYYY-MM';
        break;
    }

    let query = '';
    let params = [start, end];

    if (dateType === 'invoice') {
      // Income based on invoice dates
      query = `
        WITH invoice_periods AS (
          SELECT 
            DATE_TRUNC('${dateTrunc}', i.date_sent) AS period,
            SUM(i.gross)::numeric AS gross_income,
            SUM(i.tax)::numeric AS branch_tax,
            SUM(i.net)::numeric AS net_income
          FROM invoices i
          ${clientManagerId ? `
            JOIN clients c ON i.client_id::text = c.client_id::text
            WHERE c.associated_agent_id = $4
              AND i.date_sent >= $1 AND i.date_sent <= $2
          ` : `
            WHERE i.date_sent >= $1 AND i.date_sent <= $2
          `}
            AND i.status IN ('paid', 'sent', 'draft')
          GROUP BY DATE_TRUNC('${dateTrunc}', i.date_sent)
        ),
        tutor_pay_periods AS (
          SELECT 
            DATE_TRUNC('${dateTrunc}', po.date_sent) AS period,
            SUM(po.amount)::numeric AS tutor_income
          FROM payment_orders po
          JOIN payment_order_charges poc ON poc.payment_order_id = po.id
          LEFT JOIN appointments a ON poc.appointment_id = a.appointment_id
          ${clientManagerId ? `
            JOIN appointment_recipients ar ON ar.appointment_id = a.appointment_id
            JOIN clients c ON ar.paying_client_id::text = c.client_id::text
            WHERE c.associated_agent_id = $4
              AND po.date_sent >= $1 AND po.date_sent <= $2
          ` : `
            WHERE po.date_sent >= $1 AND po.date_sent <= $2
          `}
            AND po.status IN ('paid', 'sent', 'draft')
            AND a.status IN ('complete', 'cancelled-chargeable')
          GROUP BY DATE_TRUNC('${dateTrunc}', po.date_sent)
        ),
        affiliate_commission_periods AS (
          SELECT 
            DATE_TRUNC('${dateTrunc}', i.date_sent) AS period,
            SUM(COALESCE(i.affiliate_commission::numeric, 0::numeric)) AS affiliate_commission
          FROM invoices i
          ${clientManagerId ? `
            JOIN clients c ON i.client_id::text = c.client_id::text
            WHERE c.associated_agent_id = $4
              AND i.date_sent >= $1 AND i.date_sent <= $2
          ` : `
            WHERE i.date_sent >= $1 AND i.date_sent <= $2
          `}
            AND i.status IN ('paid', 'sent', 'draft')
          GROUP BY DATE_TRUNC('${dateTrunc}', i.date_sent)
        )
        SELECT 
          COALESCE(ip.period::timestamp, tpp.period::timestamp, acp.period::timestamp) AS period,
          COALESCE(ip.gross_income::numeric, 0) AS gross_income,
          COALESCE(tpp.tutor_income::numeric, 0) AS tutor_income,
          COALESCE(acp.affiliate_commission::numeric, 0) AS affiliate_commission,
          COALESCE(ip.branch_tax::numeric, 0) AS branch_tax,
          COALESCE(ip.gross_income::numeric, 0) - COALESCE(tpp.tutor_income::numeric, 0) - COALESCE(ip.branch_tax::numeric, 0) AS branch_net
        FROM invoice_periods ip
        FULL OUTER JOIN tutor_pay_periods tpp ON ip.period = tpp.period
        FULL OUTER JOIN affiliate_commission_periods acp ON COALESCE(ip.period::timestamp, tpp.period::timestamp) = acp.period
        ORDER BY period ASC
      `;
      
      if (clientManagerId) {
        params.push(clientManagerId);
      }
    } else {
      // Income based on activity dates (appointment start dates and ad hoc charge dates)
      query = `
        WITH appointment_periods AS (
          SELECT 
            DATE_TRUNC('${dateTrunc}', a.start)::timestamp AS period,
            SUM(
              COALESCE(
                NULLIF(ar.charge_rate::text, '')::numeric,
                0::numeric
              ) * 
              COALESCE(
                NULLIF(a.units::text, '')::numeric,
                0::numeric
              )
            )::numeric AS gross_income
          FROM appointments a
          JOIN appointment_recipients ar ON ar.appointment_id = a.appointment_id
          JOIN services s ON a.service_id = s.service_id
          WHERE ar.charge_rate::text !~ '[^0-9.]' 
            AND a.units::text !~ '[^0-9.]'
          ${clientManagerId ? `
            JOIN clients c ON ar.paying_client_id::text = c.client_id::text
            WHERE c.associated_agent_id = $4
              AND a.start >= $1 AND a.start <= $2
          ` : `
            WHERE a.start >= $1 AND a.start <= $2
          `}
            AND a.status IN ('complete', 'cancelled-chargeable')
            AND ar.status IN ('attended', 'missed-chargeable')
          GROUP BY DATE_TRUNC('${dateTrunc}', a.start)::timestamp
        ),
        adhoc_periods AS (
          SELECT 
            DATE_TRUNC('${dateTrunc}', ahc.date_occurred)::timestamp AS period,
            SUM(COALESCE(ahc.net_gross::numeric, ahc.client_cost::numeric, 0::numeric))::numeric AS gross_income
          FROM adhoc_charges ahc
          ${clientManagerId ? `
            JOIN clients c ON ahc.client_id::text = c.client_id::text
            WHERE c.associated_agent_id = $4
              AND ahc.date_occurred >= $1 AND ahc.date_occurred <= $2
          ` : `
            WHERE ahc.date_occurred >= $1 AND ahc.date_occurred <= $2
          `}
          GROUP BY DATE_TRUNC('${dateTrunc}', ahc.date_occurred)::timestamp
        ),
        combined_gross AS (
          SELECT 
            period::timestamp AS period,
            SUM(income_amount)::numeric AS gross_income
          FROM (
            SELECT period::timestamp AS period, gross_income::numeric AS income_amount FROM appointment_periods
            UNION ALL
            SELECT period::timestamp AS period, gross_income::numeric AS income_amount FROM adhoc_periods
          ) combined
          GROUP BY period::timestamp
        ),
        tutor_pay_periods AS (
          SELECT 
            DATE_TRUNC('${dateTrunc}', a.start)::timestamp AS period,
            SUM(
              CASE
                WHEN a.charge_type = 'hourly'
                  THEN COALESCE(ac.pay_rate, 0)::numeric * COALESCE(a.units, 0)::numeric
                WHEN a.charge_type = 'one-off'
                  THEN COALESCE(ac.pay_rate, 0)::numeric
                WHEN a.charge_type = 'one-off-split'
                  THEN COALESCE(ac.pay_rate, 0)::numeric
                WHEN a.charge_type = 'hourly-split'
                  THEN COALESCE(ac.pay_rate, 0)::numeric * COALESCE(a.units, 0)::numeric
                ELSE
                  COALESCE(ac.pay_rate, 0)::numeric * COALESCE(a.units, 0)::numeric
              END
            )::numeric AS tutor_income
          FROM appointments a
          JOIN appointment_contractors ac ON ac.appointment_id = a.appointment_id
          JOIN services s ON a.service_id = s.service_id
          ${clientManagerId ? `
            JOIN appointment_recipients ar ON ar.appointment_id = a.appointment_id
            JOIN clients c ON ar.paying_client_id::text = c.client_id::text
            WHERE c.associated_agent_id = $4
              AND a.start >= $1 AND a.start <= $2
          ` : `
            WHERE a.start >= $1 AND a.start <= $2
          `}
            AND a.status IN ('complete', 'cancelled-chargeable')
          GROUP BY DATE_TRUNC('${dateTrunc}', a.start)::timestamp
        )
        SELECT 
          COALESCE(cg.period::timestamp, tpp.period::timestamp) AS period,
          COALESCE(cg.gross_income::numeric, 0) AS gross_income,
          COALESCE(tpp.tutor_income::numeric, 0) AS tutor_income,
          0::numeric AS affiliate_commission,
          0::numeric AS branch_tax,
          COALESCE(cg.gross_income::numeric, 0) - COALESCE(tpp.tutor_income::numeric, 0) AS branch_net
        FROM combined_gross cg
        FULL OUTER JOIN tutor_pay_periods tpp ON cg.period = tpp.period
        ORDER BY period ASC
      `;
      
      if (clientManagerId) {
        params.push(clientManagerId);
      }
    }

    // Log the query for debugging if it's the activity date type
    if (dateType === 'activity') {
      logger.info('Executing activity date query...');
      logger.info({ data: query.length }, 'Query length:');
      logger.info({ data: query.substring(0, 500) }, 'Query preview (first 500 chars):');
    }
    
    const { rows } = await locationPool.query(query, params);

    // Format periods for display
    const formattedRows = rows.map(row => {
      const periodDate = new Date(row.period);
      let periodLabel;
      
      switch (interval) {
        case 'day':
          periodLabel = periodDate.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: '2-digit' });
          break;
        case 'week':
          const weekStart = new Date(periodDate);
          weekStart.setDate(weekStart.getDate() - weekStart.getDay());
          periodLabel = weekStart.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: '2-digit' });
          break;
        case 'month':
        default:
          periodLabel = periodDate.toLocaleDateString('en-US', { month: 'short', year: 'numeric' });
          break;
      }

      return {
        period: row.period,
        periodLabel,
        gross_income: parseFloat(row.gross_income || 0),
        tutor_income: parseFloat(row.tutor_income || 0),
        affiliate_commission: parseFloat(row.affiliate_commission || 0),
        branch_tax: parseFloat(row.branch_tax || 0),
        branch_net: parseFloat(row.branch_net || 0)
      };
    });

    // Calculate totals
    const totals = formattedRows.reduce((acc, row) => {
      acc.gross_income += row.gross_income;
      acc.tutor_income += row.tutor_income;
      acc.affiliate_commission += row.affiliate_commission;
      acc.branch_tax += row.branch_tax;
      acc.branch_net += row.branch_net;
      return acc;
    }, {
      gross_income: 0,
      tutor_income: 0,
      affiliate_commission: 0,
      branch_tax: 0,
      branch_net: 0
    });

    res.json({
      dateType,
      interval,
      data: formattedRows,
      totals,
      dateRange: { startDate, endDate }
    });
    } catch (error) {
      logger.error({ err: error }, 'Error fetching income over time:');
      logger.error({ error: { 
        dateType: req.query.dateType, 
        interval: req.query.interval, 
        startDate: req.query.startDate, 
        endDate: req.query.endDate, 
        clientManagerId: req.query.clientManagerId, 
        showAllBranches: req.query.showAllBranches 
      } }, 'Query params:');
      if (error.message && error.message.includes('gross')) {
        const queryToLog = query && query.length > 0 ? query.substring(0, 2000) : 'query not defined or empty';
        logger.error({ error: queryToLog }, 'SQL Query (first 2000 chars):');
        logger.error({ data: error }, 'Full error:');
        logger.error({ error: error.stack }, 'Error stack:');
      }
      res.status(500).json({
        error: 'Failed to fetch income over time',
        details: error.message
      });
    }
}));

module.exports = router;

