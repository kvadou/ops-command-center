const express = require('express');
const { asyncHandler } = require('../middleware/error-handler');
const { logger } = require('../utils/logger');
const router = express.Router();
const { pool, auth } = global;

/**
 * GET /api/income-breakdown
 * Returns income breakdown data by different dimensions
 * Query params:
 *   - breakdownType: 'clients' | 'client-managers' | 'ad-hoc-charge-categories' | 'tutors' | 'subjects' | 'subject-categories' | 'qualification-levels'
 *   - startDate: YYYY-MM-DD
 *   - endDate: YYYY-MM-DD
 *   - branchId: optional branch filter
 *   - showAllBranches: boolean
 */
router.get('/', auth, asyncHandler(async (req, res) => {
  try {
    const locationPool = req.locationPool || pool;
    const { breakdownType, startDate, endDate, branchId, showAllBranches } = req.query;

    if (!breakdownType || !startDate || !endDate) {
      return res.status(400).json({
        error: 'breakdownType, startDate, and endDate are required'
      });
    }

    // Parse dates
    const start = new Date(startDate);
    const end = new Date(endDate);
    end.setHours(23, 59, 59, 999); // Include full end date

    let query;
    let params = [start, end];

    switch (breakdownType) {
      case 'clients':
        query = `
          WITH invoice_data AS (
            SELECT 
              i.client_id,
              COALESCE(c.first_name || ' ' || c.last_name, 'No Client') AS client_name,
              SUM(i.gross) AS gross_income,
              SUM(i.tax) AS branch_tax,
              SUM(i.net) AS net_income
            FROM invoices i
            LEFT JOIN clients c ON i.client_id::text = c.client_id::text
            WHERE i.date_sent >= $1 AND i.date_sent <= $2
              AND i.status IN ('paid', 'sent', 'draft')
            GROUP BY i.client_id, c.first_name, c.last_name
          ),
          tutor_pay_data AS (
            SELECT 
              i.client_id,
              SUM(po.amount) AS tutor_income
            FROM invoices i
            JOIN payment_orders po ON po.date_sent >= $1 AND po.date_sent <= $2
            JOIN payment_order_charges poc ON poc.payment_order_id = po.id
            LEFT JOIN appointments a ON poc.appointment_id = a.appointment_id
            WHERE a.status IN ('complete', 'cancelled-chargeable')
              AND EXISTS (
                SELECT 1 FROM appointment_recipients ar
                WHERE ar.appointment_id = a.appointment_id
                  AND ar.paying_client_id::text = i.client_id::text
              )
            GROUP BY i.client_id
          )
          SELECT 
            COALESCE(id.client_name, 'No Client') AS category_name,
            COALESCE(id.gross_income, 0) AS gross_income,
            COALESCE(tpd.tutor_income, 0) AS tutor_income,
            0 AS affiliate_commission,
            COALESCE(id.branch_tax, 0) AS branch_tax,
            COALESCE(id.gross_income, 0) - COALESCE(tpd.tutor_income, 0) - COALESCE(id.branch_tax, 0) AS branch_net
          FROM invoice_data id
          LEFT JOIN tutor_pay_data tpd ON id.client_id = tpd.client_id
          ORDER BY id.gross_income DESC
        `;
        break;

      case 'client-managers':
        query = `
          WITH invoice_data AS (
            SELECT 
              c.associated_agent_id,
              COALESCE(c.associated_agent_name, 'No Client Manager') AS manager_name,
              SUM(i.gross) AS gross_income,
              SUM(i.tax) AS branch_tax,
              SUM(i.net) AS net_income
            FROM invoices i
            LEFT JOIN clients c ON i.client_id::text = c.client_id::text
            WHERE i.date_sent >= $1 AND i.date_sent <= $2
              AND i.status IN ('paid', 'sent', 'draft')
            GROUP BY c.associated_agent_id, c.associated_agent_name
          ),
          tutor_pay_data AS (
            SELECT 
              c.associated_agent_id,
              SUM(po.amount) AS tutor_income
            FROM invoices i
            JOIN clients c ON i.client_id::text = c.client_id::text
            JOIN payment_orders po ON po.date_sent >= $1 AND po.date_sent <= $2
            JOIN payment_order_charges poc ON poc.payment_order_id = po.id
            LEFT JOIN appointments a ON poc.appointment_id = a.appointment_id
            WHERE a.status IN ('complete', 'cancelled-chargeable')
              AND EXISTS (
                SELECT 1 FROM appointment_recipients ar
                WHERE ar.appointment_id = a.appointment_id
                  AND ar.paying_client_id::text = i.client_id::text
              )
            GROUP BY c.associated_agent_id
          )
          SELECT 
            COALESCE(id.manager_name, 'No Client Manager') AS category_name,
            COALESCE(id.gross_income, 0) AS gross_income,
            COALESCE(tpd.tutor_income, 0) AS tutor_income,
            0 AS affiliate_commission,
            COALESCE(id.branch_tax, 0) AS branch_tax,
            COALESCE(id.gross_income, 0) - COALESCE(tpd.tutor_income, 0) - COALESCE(id.branch_tax, 0) AS branch_net
          FROM invoice_data id
          LEFT JOIN tutor_pay_data tpd ON id.associated_agent_id = tpd.associated_agent_id
          ORDER BY id.gross_income DESC
        `;
        break;

      case 'ad-hoc-charge-categories':
        query = `
          WITH invoice_data AS (
            SELECT 
              ahc.category_name,
              SUM(i.gross) AS gross_income,
              SUM(i.tax) AS branch_tax,
              SUM(i.net) AS net_income
            FROM invoices i
            JOIN adhoc_charges ahc ON ahc.client_id::text = i.client_id::text
              AND ahc.date_occurred >= $1 AND ahc.date_occurred <= $2
            WHERE i.date_sent >= $1 AND i.date_sent <= $2
              AND i.status IN ('paid', 'sent', 'draft')
            GROUP BY ahc.category_name
          )
          SELECT 
            COALESCE(id.category_name, 'Not an Ad Hoc Charge') AS category_name,
            COALESCE(id.gross_income, 0) AS gross_income,
            0 AS tutor_income,
            0 AS affiliate_commission,
            COALESCE(id.branch_tax, 0) AS branch_tax,
            COALESCE(id.gross_income, 0) - COALESCE(id.branch_tax, 0) AS branch_net
          FROM invoice_data id
          UNION ALL
          SELECT 
            'Not an Ad Hoc Charge' AS category_name,
            SUM(i.gross) AS gross_income,
            SUM(po.amount) AS tutor_income,
            0 AS affiliate_commission,
            SUM(i.tax) AS branch_tax,
            SUM(i.gross) - SUM(po.amount) - SUM(i.tax) AS branch_net
          FROM invoices i
          LEFT JOIN payment_orders po ON po.date_sent >= $1 AND po.date_sent <= $2
          WHERE i.date_sent >= $1 AND i.date_sent <= $2
            AND i.status IN ('paid', 'sent', 'draft')
            AND NOT EXISTS (
              SELECT 1 FROM adhoc_charges ahc
              WHERE ahc.client_id::text = i.client_id::text
                AND ahc.date_occurred >= $1 AND ahc.date_occurred <= $2
            )
          GROUP BY 1
          ORDER BY gross_income DESC
        `;
        break;

      case 'tutors':
        query = `
          WITH tutor_pay_data AS (
            SELECT 
              po.payee_id,
              c.first_name || ' ' || c.last_name AS tutor_name,
              SUM(po.amount) AS tutor_income
            FROM payment_orders po
            LEFT JOIN contractors c ON po.payee_id = c.contractor_id
            WHERE po.date_sent >= $1 AND po.date_sent <= $2
              AND po.status IN ('paid', 'sent', 'draft')
            GROUP BY po.payee_id, c.first_name, c.last_name
          ),
          invoice_data AS (
            SELECT 
              po.payee_id,
              SUM(i.gross) AS gross_income,
              SUM(i.tax) AS branch_tax
            FROM payment_orders po
            JOIN payment_order_charges poc ON poc.payment_order_id = po.id
            LEFT JOIN appointments a ON poc.appointment_id = a.appointment_id
            LEFT JOIN appointment_recipients ar ON ar.appointment_id = a.appointment_id
            LEFT JOIN invoices i ON i.client_id::text = ar.paying_client_id::text
              AND i.date_sent >= $1 AND i.date_sent <= $2
            WHERE po.date_sent >= $1 AND po.date_sent <= $2
              AND po.status IN ('paid', 'sent', 'draft')
              AND a.status IN ('complete', 'cancelled-chargeable')
            GROUP BY po.payee_id
          )
          SELECT 
            COALESCE(tpd.tutor_name, 'No Tutor') AS category_name,
            COALESCE(id.gross_income, 0) AS gross_income,
            COALESCE(tpd.tutor_income, 0) AS tutor_income,
            0 AS affiliate_commission,
            COALESCE(id.branch_tax, 0) AS branch_tax,
            COALESCE(id.gross_income, 0) - COALESCE(tpd.tutor_income, 0) - COALESCE(id.branch_tax, 0) AS branch_net
          FROM tutor_pay_data tpd
          LEFT JOIN invoice_data id ON tpd.payee_id = id.payee_id
          ORDER BY tpd.tutor_income DESC
        `;
        break;

      case 'subjects':
        query = `
          WITH invoice_data AS (
            SELECT 
              s.service_id,
              s.name AS service_name,
              SUM(i.gross) AS gross_income,
              SUM(i.tax) AS branch_tax
            FROM invoices i
            JOIN appointment_recipients ar ON ar.paying_client_id::text = i.client_id::text
            JOIN appointments a ON a.appointment_id = ar.appointment_id
            JOIN services s ON s.service_id = a.service_id
            WHERE i.date_sent >= $1 AND i.date_sent <= $2
              AND i.status IN ('paid', 'sent', 'draft')
              AND a.status IN ('complete', 'cancelled-chargeable')
            GROUP BY s.service_id, s.name
          ),
          tutor_pay_data AS (
            SELECT 
              s.service_id,
              SUM(po.amount) AS tutor_income
            FROM payment_orders po
            JOIN payment_order_charges poc ON poc.payment_order_id = po.id
            JOIN appointments a ON poc.appointment_id = a.appointment_id
            JOIN services s ON s.service_id = a.service_id
            WHERE po.date_sent >= $1 AND po.date_sent <= $2
              AND po.status IN ('paid', 'sent', 'draft')
              AND a.status IN ('complete', 'cancelled-chargeable')
            GROUP BY s.service_id
          )
          SELECT 
            COALESCE(id.service_name, 'No Subject') AS category_name,
            COALESCE(id.gross_income, 0) AS gross_income,
            COALESCE(tpd.tutor_income, 0) AS tutor_income,
            0 AS affiliate_commission,
            COALESCE(id.branch_tax, 0) AS branch_tax,
            COALESCE(id.gross_income, 0) - COALESCE(tpd.tutor_income, 0) - COALESCE(id.branch_tax, 0) AS branch_net
          FROM invoice_data id
          LEFT JOIN tutor_pay_data tpd ON id.service_id = tpd.service_id
          ORDER BY id.gross_income DESC
        `;
        break;

      case 'subject-categories':
      case 'qualification-levels':
        // Placeholder - these may need additional data structures
        query = `
          SELECT 
            'No Data Available' AS category_name,
            0 AS gross_income,
            0 AS tutor_income,
            0 AS affiliate_commission,
            0 AS branch_tax,
            0 AS branch_net
        `;
        params = []; // No parameters needed for this query
        break;

      default:
        return res.status(400).json({
          error: `Invalid breakdownType: ${breakdownType}`
        });
    }

    const { rows } = await locationPool.query(query, params);

    // Calculate totals
    const totals = rows.reduce((acc, row) => {
      acc.gross_income += parseFloat(row.gross_income || 0);
      acc.tutor_income += parseFloat(row.tutor_income || 0);
      acc.affiliate_commission += parseFloat(row.affiliate_commission || 0);
      acc.branch_tax += parseFloat(row.branch_tax || 0);
      acc.branch_net += parseFloat(row.branch_net || 0);
      return acc;
    }, {
      gross_income: 0,
      tutor_income: 0,
      affiliate_commission: 0,
      branch_tax: 0,
      branch_net: 0
    });

    res.json({
      breakdownType,
      data: rows,
      totals,
      dateRange: { startDate, endDate }
    });
  } catch (error) {
    logger.error({ err: error }, 'Error fetching income breakdown:');
    res.status(500).json({
      error: 'Failed to fetch income breakdown',
      details: error.message
    });
  }
}));

module.exports = router;

