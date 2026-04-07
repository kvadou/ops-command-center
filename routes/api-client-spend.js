const express = require('express');
const { asyncHandler } = require('../middleware/error-handler');
const { logger } = require('../utils/logger');
const router = express.Router();

// GET /api/client-spend
// Returns client spending data with monthly/weekly/daily breakdown
// Query params: dateType (charge|payment), interval (month|week|day), startDate, endDate, clientManagerId, showAllBranches
router.get('/', asyncHandler(async (req, res) => {
  const pool = req.locationPool || global.pool;
  const client = await pool.connect();
  
  try {
    const { 
      dateType = 'charge', 
      interval = 'month', 
      startDate, 
      endDate, 
      clientManagerId,
      showAllBranches = 'false' 
    } = req.query;
    
    if (!startDate || !endDate) {
      return res.status(400).json({ error: 'startDate and endDate are required' });
    }

    const start = new Date(startDate);
    const end = new Date(endDate);
    end.setHours(23, 59, 59, 999);

    // Determine date truncation and format based on interval
    let dateTrunc, dateFormat;
    switch (interval) {
      case 'day':
        dateTrunc = 'day';
        dateFormat = 'MM/DD/YYYY';
        break;
      case 'week':
        dateTrunc = 'week';
        dateFormat = 'MM/DD/YYYY';
        break;
      case 'month':
      default:
        dateTrunc = 'month';
        dateFormat = 'MM/DD/YYYY';
        break;
    }

    let query;
    let params = [start, end];

    if (dateType === 'charge') {
      // Charge Dates: Use appointment dates
      query = `
        WITH client_charges AS (
          SELECT 
            CAST(ar.paying_client_id AS VARCHAR) AS client_id,
            COALESCE(c.first_name || ' ' || c.last_name, 'Unknown Client') AS client_name,
            DATE_TRUNC('${dateTrunc}', a.start)::date AS period_date,
            SUM(
              CASE
                WHEN s.dft_charge_type = 'hourly'
                  THEN COALESCE(ar.charge_rate * a.units, 0)
                WHEN s.dft_charge_type = 'one-off'
                  THEN COALESCE(ar.charge_rate, 0)
                WHEN s.dft_charge_type = 'one-off-split'
                  THEN COALESCE(ar.charge_rate, 0)
                WHEN s.dft_charge_type = 'hourly-split'
                  THEN COALESCE(ar.charge_rate, 0)
                ELSE
                  COALESCE(ar.charge_rate * a.units, ar.charge_rate, 0)
              END
            )::numeric AS amount
          FROM appointment_recipients ar
          JOIN appointments a ON a.appointment_id = ar.appointment_id
          JOIN services s ON a.service_id = s.service_id
          LEFT JOIN clients c ON CAST(ar.paying_client_id AS VARCHAR) = c.client_id
          WHERE a.status IN ('complete', 'cancelled-chargeable')
            AND ar.status <> 'missed'
            AND a.start >= $1 AND a.start <= $2
            ${clientManagerId ? 'AND c.associated_agent_id = $3' : ''}
          GROUP BY CAST(ar.paying_client_id AS VARCHAR), c.first_name, c.last_name, DATE_TRUNC('${dateTrunc}', a.start)::date
        )
        SELECT 
          client_id,
          MAX(client_name) AS client_name,
          SUM(amount)::numeric AS total_spend,
          jsonb_object_agg(
            TO_CHAR(period_date, '${dateFormat}'),
            amount::numeric
          ) AS period_amounts
        FROM client_charges
        GROUP BY client_id
        ORDER BY total_spend DESC
      `;
      if (clientManagerId) {
        params.push(clientManagerId);
      }
    } else {
      // Payment Dates: Use invoice dates
      query = `
        WITH client_payments AS (
          SELECT 
            CAST(i.client_id AS VARCHAR) AS client_id,
            COALESCE(c.first_name || ' ' || c.last_name, 'Unknown Client') AS client_name,
            DATE_TRUNC('${dateTrunc}', i.date_sent)::date AS period_date,
            SUM(i.gross)::numeric AS amount
          FROM invoices i
          LEFT JOIN clients c ON CAST(i.client_id AS VARCHAR) = c.client_id
          WHERE i.status IN ('paid', 'sent', 'draft')
            AND i.date_sent >= $1 AND i.date_sent <= $2
            ${clientManagerId ? 'AND c.associated_agent_id = $3' : ''}
          GROUP BY CAST(i.client_id AS VARCHAR), c.first_name, c.last_name, DATE_TRUNC('${dateTrunc}', i.date_sent)::date
        )
        SELECT 
          client_id,
          MAX(client_name) AS client_name,
          SUM(amount)::numeric AS total_spend,
          jsonb_object_agg(
            TO_CHAR(period_date, '${dateFormat}'),
            amount::numeric
          ) AS period_amounts
        FROM client_payments
        GROUP BY client_id
        ORDER BY total_spend DESC
      `;
      if (clientManagerId) {
        params.push(clientManagerId);
      }
    }

    const { rows } = await client.query(query, params);

    // Generate all periods in the date range
    const periods = [];
    const current = new Date(start);
    const endDateObj = new Date(end);
    
    while (current <= endDateObj) {
      let periodDate;
      if (interval === 'month') {
        periodDate = new Date(current.getFullYear(), current.getMonth(), 1);
      } else if (interval === 'week') {
        const dayOfWeek = current.getDay();
        const diff = current.getDate() - dayOfWeek;
        periodDate = new Date(current);
        periodDate.setDate(diff);
        periodDate.setHours(0, 0, 0, 0);
      } else {
        periodDate = new Date(current);
        periodDate.setHours(0, 0, 0, 0);
      }
      
      // Format to match SQL TO_CHAR format: MM/DD/YYYY
      const month = String(periodDate.getMonth() + 1).padStart(2, '0');
      const day = String(periodDate.getDate()).padStart(2, '0');
      const year = periodDate.getFullYear();
      const periodKey = `${month}/${day}/${year}`;
      
      if (!periods.find(p => p.key === periodKey)) {
        periods.push({ key: periodKey, date: new Date(periodDate) });
      }
      
      if (interval === 'month') {
        current.setMonth(current.getMonth() + 1);
      } else if (interval === 'week') {
        current.setDate(current.getDate() + 7);
      } else {
        current.setDate(current.getDate() + 1);
      }
    }
    
    // Sort periods by date
    periods.sort((a, b) => a.date - b.date);

    // Format data with all periods
    const formattedData = rows.map((row) => {
      const periodAmounts = row.period_amounts || {};
      const periodsData = periods.map((period) => ({
        period: period.key,
        amount: parseFloat(periodAmounts[period.key] || 0),
      }));

      return {
        client_id: row.client_id,
        client_name: row.client_name || 'Unknown Client',
        total_spend: parseFloat(row.total_spend || 0),
        periods: periodsData,
      };
    });

    res.json({
      data: formattedData,
      periods: periods.map(p => p.key),
      dateType,
      interval,
    });

  } catch (error) {
    logger.error({ err: error }, 'Error fetching client spend');
    res.status(500).json({ error: 'Internal server error', details: error.message });
  } finally {
    client.release();
  }
}));

module.exports = router;

