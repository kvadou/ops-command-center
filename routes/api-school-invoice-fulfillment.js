const express = require('express');
const router = express.Router();
const { requireAuth } = require('../middleware/auth');
const auth = global.auth || requireAuth;

const { getLocationPool: getPool } = require('../utils/pool');
const { asyncHandler } = require('../middleware/error-handler');
const { logger } = require('../utils/logger');
const { getOrSet, generateKey } = require('../utils/cache');

/**
 * Cached school client lookup — avoids the expensive 4-CTE chain
 * (service_paying_clients → school_services → service_labels → school_clients)
 * that scans ALL appointments. Result cached for 5 minutes.
 *
 * Returns: [{ client_id, school_name, email, school_label }]
 */
async function getSchoolClients(pool, schoolLabels, useSchoolNameGrouping = false) {
  const cacheKey = generateKey('school-clients', { labels: schoolLabels, grouping: useSchoolNameGrouping });
  return getOrSet(cacheKey, async () => {
    const query = `
      WITH service_paying_clients AS (
        SELECT DISTINCT ON (a.service_id)
          a.service_id,
          ar.paying_client_id::text AS paying_client_id
        FROM appointments a
        JOIN appointment_recipients ar ON a.appointment_id = ar.appointment_id
        WHERE ar.paying_client_id IS NOT NULL
        ORDER BY a.service_id, a.appointment_id
      ),
      school_services AS (
        SELECT
          s.service_id,
          s.name AS service_name,
          s.labels AS service_labels,
          spc.paying_client_id,
          CASE
            WHEN s.name ~* '(fall|spring|summer|winter|autumn)\\s+\\d{4}'
            THEN (regexp_match(s.name, '((?:fall|spring|summer|winter|autumn)\\s+\\d{4})', 'i'))[1]
            ELSE NULL
          END AS term_season
        FROM services s
        LEFT JOIN service_paying_clients spc ON spc.service_id = s.service_id
        WHERE s.labels::text LIKE '%School - %'
          AND (
            EXISTS (
              SELECT 1 FROM jsonb_array_elements(s.labels) AS label
              WHERE label->>'name' = ANY($1::text[])
            )
            OR EXISTS (
              SELECT 1 FROM jsonb_array_elements_text(s.labels) AS label
              WHERE label = ANY($1::text[])
            )
          )
          AND s.is_deleted IS NOT TRUE
      ),
      service_labels AS (
        SELECT DISTINCT ON (ss.service_id)
          ss.service_id,
          ss.paying_client_id,
          COALESCE(
            (SELECT label->>'name' FROM jsonb_array_elements(ss.service_labels) AS label WHERE label->>'name' LIKE 'School - %' LIMIT 1),
            (SELECT label::text FROM jsonb_array_elements_text(ss.service_labels) AS label WHERE label LIKE 'School - %' LIMIT 1)
          ) AS school_label
        FROM school_services ss
      ),
      school_clients AS (
        ${useSchoolNameGrouping ? `
        SELECT DISTINCT ON (school_name)
          SPLIT_PART(ss.service_name, ' // ', 1) AS school_name,
          COALESCE(ss.paying_client_id, 'SCHOOL_' || MD5(SPLIT_PART(ss.service_name, ' // ', 1))::text) AS client_id,
          NULL::text AS email,
          sl.school_label
        FROM school_services ss
        LEFT JOIN service_labels sl ON sl.service_id = ss.service_id
        ORDER BY school_name, ss.paying_client_id NULLS LAST
        ` : `
        SELECT DISTINCT
          c.client_id,
          c.first_name || ' ' || COALESCE(c.last_name, '') AS school_name,
          c.email,
          sl.school_label
        FROM clients c
        JOIN (SELECT DISTINCT paying_client_id FROM school_services WHERE paying_client_id IS NOT NULL) sp
          ON sp.paying_client_id = c.client_id::text
        LEFT JOIN LATERAL (
          SELECT sl2.school_label
          FROM service_labels sl2
          WHERE sl2.paying_client_id = c.client_id::text
          LIMIT 1
        ) sl ON true
        `}
      ),
      active_service_clients AS (
        SELECT DISTINCT ${useSchoolNameGrouping ? `SPLIT_PART(ss.service_name, ' // ', 1) AS match_key` : `ss.paying_client_id AS match_key`}
        FROM school_services ss
        JOIN services s2 ON s2.service_id = ss.service_id
        WHERE NOT EXISTS (
          SELECT 1 FROM jsonb_array_elements(s2.labels) AS label
          WHERE label->>'name' ILIKE '%Job Finished%'
        )
        AND EXISTS (
          SELECT 1 FROM appointments a2
          WHERE a2.service_id = ss.service_id
            AND a2.start > NOW() - INTERVAL '90 days'
            AND a2.status NOT IN ('cancelled', 'cancelled-no-charge')
        )
      )
      SELECT
        sc.client_id,
        sc.school_name,
        sc.email,
        sc.school_label,
        (asc2.match_key IS NOT NULL) AS is_active
      FROM school_clients sc
      LEFT JOIN active_service_clients asc2 ON asc2.match_key = ${useSchoolNameGrouping ? 'sc.school_name' : 'sc.client_id::text'}
      WHERE asc2.match_key IS NOT NULL
      ORDER BY sc.school_name
    `;
    const result = await pool.query(query, [schoolLabels]);
    return result.rows;
  }, 300); // 5 minute cache
}

// Get invoice fulfillment data for schools in a specific month
router.get('/fulfillment', asyncHandler(async (req, res) => {
  logger.info('📊 Invoice fulfillment endpoint hit');
  try {
    const pool = getPool(req);
    const { month, term, clientId } = req.query; // month format: '2025-09', term: 'Fall 2025', clientId: optional filter
    
    if (!pool) {
      logger.error('❌ Database pool not available');
      throw new Error('Database pool not available');
    }
    
    // Parse month (format: '2025-09' or '2025-09-01')
    let billingMonth = null;
    if (month) {
      const monthParts = month.split('-');
      if (monthParts.length >= 2) {
        billingMonth = `${monthParts[0]}-${monthParts[1].padStart(2, '0')}-01`;
      }
    }
    
    // Detect location from hostname
    const hostname = req.get('host') || req.hostname || '';
    let detectedLocation = null;
    if (hostname.includes('eastside')) {
      detectedLocation = 'Eastside';
    } else if (hostname.includes('westside')) {
      detectedLocation = 'Westside';
    }
    
    const queryLocation = req.query.location;
    const locationFilter = queryLocation || (detectedLocation && !queryLocation ? detectedLocation : 'all');
    const validLocations = ['NYC', 'LA', 'SF', 'Hamptons', 'Eastside', 'Westside'];
    
    let schoolLabels = ['School - NYC', 'School - LA', 'School - SF', 'School - Hamptons', 'School - Eastside', 'School - Westside'];
    if (locationFilter !== 'all' && validLocations.includes(locationFilter)) {
      schoolLabels = [`School - ${locationFilter}`];
    }
    
    const useSchoolNameGrouping = detectedLocation === 'Eastside' || detectedLocation === 'Westside';

    // Step 1: Get cached school clients (skips expensive 4-CTE chain on cache hit)
    const schoolClients = await getSchoolClients(pool, schoolLabels, useSchoolNameGrouping);

    if (!schoolClients.length) {
      return res.json({ month: billingMonth, term: term || null, schools: [], summary: { totalSchools: 0 } });
    }

    // Step 2: Fetch invoices for these school clients (fast — just invoice table + small joins)
    const clientIds = schoolClients.filter(sc => !sc.client_id.startsWith('SCHOOL_')).map(sc => sc.client_id);

    const params = [clientIds];
    let paramIdx = 2;
    if (billingMonth) { params.push(billingMonth); }
    const monthParamIdx = billingMonth ? paramIdx++ : null;
    if (term) { params.push(term); }
    const termParamIdx = term ? paramIdx++ : null;
    if (clientId) { params.push(clientId); }
    const clientIdParamIdx = clientId ? paramIdx++ : null;

    const invoiceQuery = `
      WITH reminder_agg AS (
        SELECT invoice_id, COUNT(*) AS cnt, MAX(reminder_sent_at) AS last_sent
        FROM invoice_reminders
        GROUP BY invoice_id
      )
      SELECT
        i.id AS invoice_id,
        i.display_id,
        i.date_sent,
        i.date_paid,
        i.gross AS invoice_amount,
        i.status AS invoice_status,
        i.url AS invoice_url,
        i.client_id::text,
        CASE WHEN i.status = 'paid' THEN i.gross ELSE 0 END AS amount_collected,
        CASE WHEN i.status = 'payment-pending' THEN i.gross ELSE 0 END AS amount_pending,
        CASE WHEN i.status = 'unpaid' AND i.date_sent IS NOT NULL AND i.date_sent < NOW() - INTERVAL '30 days' THEN i.gross ELSE 0 END AS amount_outstanding,
        CASE WHEN i.status = 'unpaid' AND (i.date_sent IS NULL OR i.date_sent >= NOW() - INTERVAL '30 days') THEN i.gross ELSE 0 END AS amount_within_terms,
        CASE WHEN i.status NOT IN ('paid', 'payment-pending', 'unpaid') THEN i.gross ELSE 0 END AS amount_other_status,
        CASE WHEN LOWER(i.status) IN ('cancelled', 'void', 'voided', 'refund', 'refunded') THEN i.gross ELSE 0 END AS amount_excluded,
        CASE WHEN i.status = 'unpaid' AND i.date_sent IS NOT NULL THEN GREATEST(0, EXTRACT(EPOCH FROM (NOW() - i.date_sent)) / 86400 - 30) ELSE 0 END AS days_outstanding,
        COALESCE(ra.cnt, 0) AS reminder_count,
        ra.last_sent AS last_reminder_sent_at,
        COALESCE(
          ifs.fulfillment_status,
          CASE
            WHEN i.status = 'paid' THEN 'fulfilled'
            WHEN i.status = 'unpaid' AND i.date_sent < NOW() - INTERVAL '30 days' THEN 'overdue'
            WHEN i.status = 'unpaid' AND i.date_sent IS NOT NULL THEN 'sent'
            ELSE 'pending'
          END
        ) AS fulfillment_status,
        COALESCE(ifs.is_fulfilled, i.status = 'paid') AS is_fulfilled,
        COALESCE(ifs.billing_month, DATE_TRUNC('month', i.date_sent)::date) AS billing_month,
        ifs.term_season
      FROM invoices i
      LEFT JOIN reminder_agg ra ON ra.invoice_id = i.id
      LEFT JOIN invoice_fulfillment_status ifs ON ifs.invoice_id = i.id
      WHERE i.client_id::text = ANY($1::text[])
        ${monthParamIdx ? `AND (DATE_TRUNC('month', i.date_sent)::date = $${monthParamIdx}::date OR ifs.billing_month = $${monthParamIdx}::date)` : ''}
        ${termParamIdx ? `AND ifs.term_season = $${termParamIdx}` : ''}
        ${clientIdParamIdx ? `AND i.client_id::text = $${clientIdParamIdx}::text` : ''}
      ORDER BY i.date_sent DESC NULLS LAST
    `;

    logger.info({ clientCount: clientIds.length, billingMonth, term, clientId }, 'Invoice fulfillment query (cached school clients)');

    let result;
    try {
      const invoiceResult = await pool.query(invoiceQuery, params);

      // Build a map of client_id → invoice rows
      const invoicesByClient = {};
      for (const row of invoiceResult.rows) {
        const cid = row.client_id;
        if (!invoicesByClient[cid]) invoicesByClient[cid] = [];
        invoicesByClient[cid].push(row);
      }

      // Merge cached school client info with invoice data
      result = { rows: schoolClients.map(sc => {
        const invRows = invoicesByClient[sc.client_id] || [];
        const paidCount = invRows.filter(r => r.invoice_status === 'paid').length;
        const unpaidCount = invRows.filter(r => r.invoice_status === 'unpaid').length;
        const pendingCount = invRows.filter(r => r.invoice_status === 'payment-pending').length;
        return {
          client_id: sc.client_id,
          school_name: sc.school_name,
          email: sc.email,
          school_label: sc.school_label,
          is_active: sc.is_active,
          paid_invoice_count: paidCount,
          unpaid_invoice_count: unpaidCount,
          pending_invoice_count: pendingCount,
          total_collected: invRows.reduce((s, r) => s + parseFloat(r.amount_collected || 0), 0),
          total_pending: invRows.reduce((s, r) => s + parseFloat(r.amount_pending || 0), 0),
          total_outstanding: invRows.reduce((s, r) => s + parseFloat(r.amount_outstanding || 0), 0),
          total_within_terms: invRows.reduce((s, r) => s + parseFloat(r.amount_within_terms || 0), 0),
          total_other_status: invRows.reduce((s, r) => s + parseFloat(r.amount_other_status || 0), 0),
          total_excluded: invRows.reduce((s, r) => s + parseFloat(r.amount_excluded || 0), 0),
          total_invoiced: invRows.filter(r => !['cancelled', 'void', 'voided', 'refund', 'refunded'].includes((r.invoice_status || '').toLowerCase())).reduce((s, r) => s + parseFloat(r.invoice_amount || 0), 0),
          fulfilled_invoice_count: invRows.filter(r => r.is_fulfilled).length,
          unfulfilled_invoice_count: invRows.filter(r => !r.is_fulfilled).length,
          invoices: invRows.length > 0 ? invRows.map(r => ({
            invoice_id: r.invoice_id,
            display_id: r.display_id,
            date_sent: r.date_sent,
            date_paid: r.date_paid,
            amount: parseFloat(r.invoice_amount || 0),
            status: r.invoice_status,
            url: r.invoice_url,
            tutorcruncher_url: `https://account.acmeops.com/accounting/invoices/${r.invoice_id}/`,
            amount_collected: parseFloat(r.amount_collected || 0),
            amount_outstanding: parseFloat(r.amount_outstanding || 0),
            amount_within_terms: parseFloat(r.amount_within_terms || 0),
            days_outstanding: parseFloat(r.days_outstanding || 0),
            fulfillment_status: r.fulfillment_status,
            is_fulfilled: r.is_fulfilled,
            reminder_count: parseInt(r.reminder_count || 0),
            last_reminder_sent_at: r.last_reminder_sent_at,
            billing_month: r.billing_month,
            term_season: r.term_season,
          })) : null,
        };
      })};
    } catch (queryError) {
      logger.error({ err: queryError }, 'SQL Query Error in fulfillment');
      throw queryError;
    }
    
    const schools = result.rows.map(row => {
      // Extract unique excluded statuses from invoice details
      const excludedStatusesSet = new Set();
      if (row.invoices && Array.isArray(row.invoices)) {
        row.invoices.forEach(inv => {
          if (inv.status && 
              !['paid', 'payment-pending', 'unpaid'].includes(inv.status.toLowerCase()) &&
              ['cancelled', 'void', 'voided', 'refund', 'refunded'].includes(inv.status.toLowerCase())) {
            excludedStatusesSet.add(inv.status);
          }
        });
      }
      
      return {
        clientId: row.client_id,
        name: row.school_name,
        email: row.email,
        schoolLabel: row.school_label,
        location: row.school_label ? row.school_label.replace('School - ', '') : 'Unknown',
        isActive: row.is_active,
        invoiceSummary: {
          paidCount: parseInt(row.paid_invoice_count || 0),
          unpaidCount: parseInt(row.unpaid_invoice_count || 0),
          pendingCount: parseInt(row.pending_invoice_count || 0),
          totalCollected: parseFloat(row.total_collected || 0),
          totalPending: parseFloat(row.total_pending || 0),
          totalOutstanding: parseFloat(row.total_outstanding || 0),
          totalWithinTerms: parseFloat(row.total_within_terms || 0),
          totalOtherStatus: parseFloat(row.total_other_status || 0),
          totalExcluded: parseFloat(row.total_excluded || 0),
          totalInvoiced: parseFloat(row.total_invoiced || 0),
          excludedStatuses: Array.from(excludedStatusesSet),
          fulfilledCount: parseInt(row.fulfilled_invoice_count || 0),
          unfulfilledCount: parseInt(row.unfulfilled_invoice_count || 0),
        },
        invoices: row.invoices || []
      };
    });
    
    res.json({
      month: billingMonth,
      term: term || null,
      schools,
      summary: {
        totalSchools: schools.length,
        totalCollected: schools.reduce((sum, s) => sum + s.invoiceSummary.totalCollected, 0),
        totalPending: schools.reduce((sum, s) => sum + s.invoiceSummary.totalPending, 0),
        totalOutstanding: schools.reduce((sum, s) => sum + s.invoiceSummary.totalOutstanding, 0),
        totalWithinTerms: schools.reduce((sum, s) => sum + s.invoiceSummary.totalWithinTerms, 0),
        totalOtherStatus: schools.reduce((sum, s) => sum + s.invoiceSummary.totalOtherStatus, 0),
        totalExcluded: schools.reduce((sum, s) => sum + s.invoiceSummary.totalExcluded, 0),
        totalInvoiced: schools.reduce((sum, s) => sum + s.invoiceSummary.totalInvoiced, 0),
        totalFulfilled: schools.reduce((sum, s) => sum + s.invoiceSummary.fulfilledCount, 0),
        totalUnfulfilled: schools.reduce((sum, s) => sum + s.invoiceSummary.unfulfilledCount, 0),
        excludedStatuses: [...new Set(schools.flatMap(s => s.invoiceSummary.excludedStatuses || []))],
      }
    });
    
  } catch (error) {
    logger.error({ err: error }, 'Error fetching invoice fulfillment data:');
    res.status(500).json({ 
      error: 'Failed to fetch invoice fulfillment data', 
      details: error.message
    });
  }
}));

// Lightweight single-school data for modal (skips heavy CTE chain)
router.get('/school/:clientId/detail', asyncHandler(async (req, res) => {
  const pool = getPool(req);
  const { clientId } = req.params;

  // Parallel: client info + invoices + reminders
  const [clientResult, invoiceResult] = await Promise.all([
    pool.query(
      `SELECT c.client_id, c.first_name || ' ' || COALESCE(c.last_name, '') AS school_name, c.email,
        (SELECT label FROM (
          SELECT CASE WHEN jsonb_typeof(s.labels) = 'array' THEN
            COALESCE(
              (SELECT el->>'name' FROM jsonb_array_elements(s.labels) el WHERE el->>'name' LIKE 'School - %' LIMIT 1),
              (SELECT el::text FROM jsonb_array_elements_text(s.labels) el WHERE el LIKE 'School - %' LIMIT 1)
            )
          END AS label
          FROM services s
          JOIN appointments a ON a.service_id = s.service_id
          JOIN appointment_recipients ar ON ar.appointment_id = a.appointment_id
          WHERE ar.paying_client_id::text = $1
            AND s.labels::text LIKE '%School - %'
          LIMIT 1
        ) sub) AS school_label,
        EXISTS (
          SELECT 1 FROM services s
          JOIN appointments a ON a.service_id = s.service_id
          JOIN appointment_recipients ar ON ar.appointment_id = a.appointment_id
          WHERE ar.paying_client_id::text = $1
            AND s.labels::text LIKE '%School - %'
            AND a.start > NOW() - INTERVAL '90 days'
            AND a.status NOT IN ('cancelled', 'cancelled-no-charge')
        ) AS is_active
       FROM clients c WHERE c.client_id::text = $1`,
      [clientId]
    ),
    pool.query(
      `SELECT i.id AS invoice_id, i.display_id, i.date_sent, i.date_paid,
        i.gross AS amount, i.status, i.url,
        CASE WHEN i.status = 'paid' THEN i.gross ELSE 0 END AS amount_collected,
        CASE WHEN i.status = 'unpaid' AND i.date_sent IS NOT NULL AND i.date_sent < NOW() - INTERVAL '30 days'
          THEN i.gross ELSE 0 END AS amount_outstanding,
        CASE WHEN i.status = 'unpaid' AND (i.date_sent IS NULL OR i.date_sent >= NOW() - INTERVAL '30 days')
          THEN i.gross ELSE 0 END AS amount_within_terms,
        CASE WHEN i.status = 'unpaid' AND i.date_sent IS NOT NULL
          THEN GREATEST(0, EXTRACT(EPOCH FROM (NOW() - i.date_sent)) / 86400 - 30) ELSE 0 END AS days_outstanding,
        COALESCE(ifs.fulfillment_status,
          CASE WHEN i.status = 'paid' THEN 'fulfilled'
               WHEN i.status = 'unpaid' AND i.date_sent < NOW() - INTERVAL '30 days' THEN 'overdue'
               WHEN i.status = 'unpaid' AND i.date_sent IS NOT NULL THEN 'sent'
               ELSE 'pending' END
        ) AS fulfillment_status,
        COALESCE(ifs.is_fulfilled, i.status = 'paid') AS is_fulfilled,
        COALESCE(ifs.billing_month, DATE_TRUNC('month', i.date_sent)::date) AS billing_month,
        COALESCE(r.cnt, 0) AS reminder_count,
        r.last_sent AS last_reminder_sent_at
       FROM invoices i
       LEFT JOIN invoice_fulfillment_status ifs ON ifs.invoice_id = i.id
       LEFT JOIN (SELECT invoice_id, COUNT(*) AS cnt, MAX(reminder_sent_at) AS last_sent FROM invoice_reminders GROUP BY invoice_id) r ON r.invoice_id = i.id
       WHERE i.client_id::text = $1
       ORDER BY i.date_sent DESC NULLS LAST`,
      [clientId]
    )
  ]);

  if (!clientResult.rows[0]) {
    return res.status(404).json({ error: 'School not found' });
  }

  const client = clientResult.rows[0];
  const invoices = invoiceResult.rows;

  const validInvoices = invoices.filter(inv =>
    !['cancelled', 'void', 'voided', 'refund', 'refunded'].includes(inv.status?.toLowerCase())
  );

  res.json({
    school: {
      clientId: client.client_id,
      name: client.school_name,
      email: client.email,
      schoolLabel: client.school_label,
      location: client.school_label ? client.school_label.replace('School - ', '') : 'Unknown',
      isActive: client.is_active,
      invoiceSummary: {
        paidCount: validInvoices.filter(i => i.status === 'paid').length,
        unpaidCount: validInvoices.filter(i => i.status === 'unpaid').length,
        pendingCount: validInvoices.filter(i => i.status === 'payment-pending').length,
        totalCollected: validInvoices.filter(i => i.status === 'paid').reduce((s, i) => s + parseFloat(i.amount || 0), 0),
        totalPending: validInvoices.filter(i => i.status === 'payment-pending').reduce((s, i) => s + parseFloat(i.amount || 0), 0),
        totalOutstanding: validInvoices.reduce((s, i) => s + parseFloat(i.amount_outstanding || 0), 0),
        totalWithinTerms: validInvoices.reduce((s, i) => s + parseFloat(i.amount_within_terms || 0), 0),
        totalInvoiced: validInvoices.reduce((s, i) => s + parseFloat(i.amount || 0), 0),
      },
      invoices: invoices.map(inv => ({
        invoice_id: inv.invoice_id,
        display_id: inv.display_id,
        date_sent: inv.date_sent,
        date_paid: inv.date_paid,
        amount: parseFloat(inv.amount || 0),
        status: inv.status,
        url: inv.url,
        tutorcruncher_url: `https://account.acmeops.com/accounting/invoices/${inv.invoice_id}/`,
        amount_collected: parseFloat(inv.amount_collected || 0),
        amount_outstanding: parseFloat(inv.amount_outstanding || 0),
        amount_within_terms: parseFloat(inv.amount_within_terms || 0),
        days_outstanding: parseFloat(inv.days_outstanding || 0),
        fulfillment_status: inv.fulfillment_status,
        is_fulfilled: inv.is_fulfilled,
        reminder_count: parseInt(inv.reminder_count || 0),
        last_reminder_sent_at: inv.last_reminder_sent_at,
        billing_month: inv.billing_month,
      }))
    }
  });
}));

// Get reminders for a specific invoice
router.get('/invoice/:invoiceId/reminders', asyncHandler(async (req, res) => {
  try {
    const pool = getPool(req);
    const { invoiceId } = req.params;

    const result = await pool.query(
      `SELECT
        id,
        invoice_id,
        client_id,
        reminder_type,
        reminder_method,
        reminder_message,
        reminder_notes,
        email_subject,
        reminder_sent_at AS sent_at,
        created_at
       FROM invoice_reminders
       WHERE invoice_id = $1
       ORDER BY reminder_sent_at DESC NULLS LAST, created_at DESC`,
      [invoiceId]
    );

    res.json({ reminders: result.rows, count: result.rows.length });
  } catch (error) {
    logger.error({ err: error }, 'Error fetching invoice reminders:');
    res.status(500).json({
      error: 'Failed to fetch invoice reminders',
      details: error.message
    });
  }
}));

// Create a reminder for an invoice
router.post('/invoice/:invoiceId/reminders', asyncHandler(async (req, res) => {
  try {
    const pool = getPool(req);
    const { invoiceId } = req.params;
    const { 
      reminder_type, 
      reminder_method, 
      reminder_message, 
      reminder_notes,
      email_subject,
      email_message_id
    } = req.body;
    
    // Get client_id from invoice
    const invoiceResult = await pool.query(
      `SELECT client_id FROM invoices WHERE id = $1`,
      [invoiceId]
    );
    
    if (invoiceResult.rows.length === 0) {
      return res.status(404).json({ error: 'Invoice not found' });
    }
    
    const clientId = invoiceResult.rows[0].client_id;
    
    // Insert reminder
    const insertResult = await pool.query(
      `INSERT INTO invoice_reminders (
        invoice_id, client_id, reminder_type, reminder_method, 
        reminder_message, reminder_notes, email_subject, email_message_id
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
      RETURNING *`,
      [invoiceId, clientId, reminder_type, reminder_method || 'email', 
       reminder_message, reminder_notes, email_subject, email_message_id]
    );
    
    // Update fulfillment status reminder count
    await pool.query(
      `INSERT INTO invoice_fulfillment_status (
        invoice_id, client_id, invoice_amount, invoice_status, 
        reminder_count, last_reminder_sent_at, amount_outstanding
      )
      SELECT 
        $1, client_id, gross, status, 
        (SELECT COUNT(*) FROM invoice_reminders WHERE invoice_id = $1),
        NOW(),
        CASE WHEN status = 'unpaid' THEN gross ELSE 0 END
      FROM invoices WHERE id = $1
      ON CONFLICT (invoice_id) 
      DO UPDATE SET 
        reminder_count = (SELECT COUNT(*) FROM invoice_reminders WHERE invoice_id = $1),
        last_reminder_sent_at = NOW(),
        updated_at = NOW()`,
      [invoiceId]
    );
    
    res.json(insertResult.rows[0]);
  } catch (error) {
    logger.error({ err: error }, 'Error creating invoice reminder:');
    res.status(500).json({ 
      error: 'Failed to create invoice reminder', 
      details: error.message
    });
  }
}));

// Get revenue over time for a school
router.get('/school/:clientId/revenue-over-time', asyncHandler(async (req, res) => {
  try {
    const pool = getPool(req);
    const { clientId } = req.params;
    const { months = 12 } = req.query;
    
    const result = await pool.query(
      `SELECT * FROM school_revenue_over_time 
       WHERE school_client_id = $1 
       ORDER BY revenue_month DESC 
       LIMIT $2`,
      [clientId, months]
    );
    
    res.json(result.rows);
  } catch (error) {
    logger.error({ err: error }, 'Error fetching revenue over time:');
    res.status(500).json({ 
      error: 'Failed to fetch revenue over time', 
      details: error.message
    });
  }
}));

// Get revenue by term for a school
router.get('/school/:clientId/revenue-by-term', asyncHandler(async (req, res) => {
  try {
    const pool = getPool(req);
    const { clientId } = req.params;
    const { term } = req.query;
    
    let query = `SELECT * FROM school_revenue_by_term WHERE school_client_id = $1`;
    const params = [clientId];
    
    if (term) {
      query += ` AND term_season = $2`;
      params.push(term);
    }
    
    query += ` ORDER BY term_start_date DESC NULLS LAST, term_season DESC`;
    
    const result = await pool.query(query, params);
    
    res.json(result.rows);
  } catch (error) {
    logger.error({ err: error }, 'Error fetching revenue by term:');
    res.status(500).json({ 
      error: 'Failed to fetch revenue by term', 
      details: error.message
    });
  }
}));

// Sync reminders from TutorCruncher for an invoice
router.post('/invoice/:invoiceId/sync-reminders', asyncHandler(async (req, res) => {
  try {
    const pool = getPool(req);
    const { invoiceId } = req.params;
    
    // Get invoice details from database
    const invoiceResult = await pool.query(
      `SELECT id, client_id, display_id, date_sent, gross, status FROM invoices WHERE id = $1`,
      [invoiceId]
    );
    
    if (invoiceResult.rows.length === 0) {
      return res.status(404).json({ error: 'Invoice not found' });
    }
    
    const invoice = invoiceResult.rows[0];
    
    // Note: TutorCruncher API doesn't have a direct endpoint to get invoice reminders
    // We'll need to check if there's an email activity log or use webhooks
    // For now, we'll return the reminders we have in our database
    const remindersResult = await pool.query(
      `SELECT * FROM invoice_reminders WHERE invoice_id = $1 ORDER BY reminder_sent_at DESC`,
      [invoiceId]
    );
    
    res.json({
      invoiceId,
      reminders: remindersResult.rows,
      count: remindersResult.rows.length
    });
  } catch (error) {
    logger.error({ err: error }, 'Error syncing reminders:');
    res.status(500).json({ 
      error: 'Failed to sync reminders', 
      details: error.message
    });
  }
}));

// Send invoice reminder via TutorCruncher API
router.post('/invoice/:invoiceId/send-reminder', asyncHandler(async (req, res) => {
  try {
    const pool = getPool(req);
    const { invoiceId } = req.params;
    const {
      reminder_type = 'manual',
      reminder_notes
    } = req.body;

    // Get invoice details
    const invoiceResult = await pool.query(
      `SELECT id, client_id, display_id, date_sent, gross, status, url FROM invoices WHERE id = $1`,
      [invoiceId]
    );

    if (invoiceResult.rows.length === 0) {
      return res.status(404).json({ error: 'Invoice not found' });
    }

    const invoice = invoiceResult.rows[0];

    // Call TutorCruncher API to send reminder
    let tcResponse = null;
    let tcSuccess = false;

    if (global.tutorCruncherAPI) {
      try {
        logger.info(`📧 Sending invoice reminder via TutorCruncher API for invoice ${invoiceId}`);
        tcResponse = await global.tutorCruncherAPI.post(`/invoices/${invoiceId}/send_reminder/`);
        tcSuccess = true;
        logger.info('✅ Invoice reminder sent successfully via TutorCruncher');
      } catch (apiError) {
        logger.error({ data: apiError.response?.data || apiError.message }, 'Error sending reminder via TutorCruncher API:');
        // Still track locally even if TC API fails
      }
    }

    // Create reminder record in database
    const insertResult = await pool.query(
      `INSERT INTO invoice_reminders (
        invoice_id, client_id, reminder_type, reminder_method,
        reminder_message, reminder_notes, email_subject
      ) VALUES ($1, $2, $3, $4, $5, $6, $7)
      RETURNING *`,
      [invoiceId, invoice.client_id, reminder_type, 'email',
       tcSuccess ? 'Sent via TutorCruncher' : 'TC API failed - tracked locally',
       reminder_notes, `Invoice Reminder - ${invoice.display_id}`]
    );

    // Update fulfillment status reminder count
    await pool.query(
      `INSERT INTO invoice_fulfillment_status (
        invoice_id, client_id, invoice_amount, invoice_status,
        reminder_count, last_reminder_sent_at, amount_outstanding,
        invoice_display_id, invoice_date_sent
      )
      SELECT
        $1, client_id, gross, status,
        (SELECT COUNT(*) FROM invoice_reminders WHERE invoice_id = $1),
        NOW(),
        CASE WHEN status = 'unpaid' THEN gross ELSE 0 END,
        display_id, date_sent
      FROM invoices WHERE id = $1
      ON CONFLICT (invoice_id)
      DO UPDATE SET
        reminder_count = (SELECT COUNT(*) FROM invoice_reminders WHERE invoice_id = $1),
        last_reminder_sent_at = NOW(),
        updated_at = NOW()`,
      [invoiceId]
    );

    res.json({
      success: true,
      tcSuccess,
      reminder: insertResult.rows[0],
      message: tcSuccess
        ? 'Reminder sent successfully via TutorCruncher'
        : 'Reminder tracked locally. TutorCruncher API call failed - please send manually.'
    });
  } catch (error) {
    logger.error({ err: error }, 'Error sending invoice reminder:');
    res.status(500).json({
      error: 'Failed to send invoice reminder',
      details: error.message
    });
  }
}));

// Take payment on invoice via TutorCruncher API
router.post('/invoice/:invoiceId/take-payment', asyncHandler(async (req, res) => {
  try {
    const pool = getPool(req);
    const { invoiceId } = req.params;
    const {
      amount,
      method, // 'cash', 'cheque', 'bank_transfer', 'manual'
      send_receipt = false,
      check_number,
      check_date
    } = req.body;

    // Validate required fields
    if (!amount || !method) {
      return res.status(400).json({ error: 'Amount and payment method are required' });
    }

    // Validate payment method
    const validMethods = ['cash', 'cheque', 'bank_transfer', 'manual'];
    if (!validMethods.includes(method)) {
      return res.status(400).json({
        error: 'Invalid payment method',
        validMethods
      });
    }

    // Get invoice details first
    const invoiceResult = await pool.query(
      `SELECT id, client_id, display_id, date_sent, gross, status FROM invoices WHERE id = $1`,
      [invoiceId]
    );

    if (invoiceResult.rows.length === 0) {
      return res.status(404).json({ error: 'Invoice not found' });
    }

    const invoice = invoiceResult.rows[0];

    // Call TutorCruncher API to take payment
    if (!global.tutorCruncherAPI) {
      return res.status(500).json({ error: 'TutorCruncher API not available' });
    }

    try {
      logger.info(`💳 Taking payment via TutorCruncher API for invoice ${invoiceId}: $${amount} via ${method}`);

      const tcResponse = await global.tutorCruncherAPI.post(`/invoices/${invoiceId}/take_payment/`, {
        amount: parseFloat(amount),
        method: method,
        send_receipt: send_receipt
      });

      logger.info({ data: tcResponse.data }, '✅ Payment recorded successfully via TutorCruncher:');

      // Update local invoice record with correct column names
      const stillToPay = parseFloat(tcResponse.data?.still_to_pay || 0);
      await pool.query(
        `UPDATE invoices
         SET status = CASE WHEN $1 <= 0 THEN 'paid' ELSE status END,
             still_to_pay = $1,
             payment_method = $2,
             date_paid = CASE WHEN $1 <= 0 THEN NOW() ELSE date_paid END
         WHERE id = $3`,
        [stillToPay, method, invoiceId]
      );

      // Record check details as a timeline note + create check record if provided
      if (method === 'cheque') {
        const noteParts = ['Payment received via check'];
        if (check_number) noteParts.push(`#${check_number}`);
        if (check_date) noteParts.push(`dated ${check_date}`);
        noteParts.push(`for $${parseFloat(amount).toFixed(2)}`);

        await pool.query(
          `INSERT INTO invoice_notes (invoice_id, note, created_by, created_at)
           VALUES ($1, $2, $3, NOW())`,
          [invoiceId, noteParts.join(' '), req.user?.email || 'system']
        );

        // Auto-create check record for reconciliation tracking
        try {
          const invoiceDetail = await pool.query('SELECT client_id FROM invoices WHERE id = $1', [invoiceId]);
          const clientId = invoiceDetail.rows[0]?.client_id;
          await pool.query(
            `INSERT INTO invoice_checks (invoice_id, client_id, check_number, amount, date_received, created_by)
             VALUES ($1, $2, $3, $4, $5, $6)`,
            [invoiceId, clientId, check_number || null, parseFloat(amount),
             check_date || new Date().toISOString().split('T')[0], req.user?.email || 'system']
          );
        } catch (checkErr) {
          logger.warn({ err: checkErr }, 'Failed to auto-create check record (non-blocking)');
        }
      }

      res.json({
        success: true,
        message: 'Payment recorded successfully',
        amount_paid: tcResponse.data?.amount_paid || amount,
        still_to_pay: tcResponse.data?.still_to_pay,
        paid: tcResponse.data?.paid || false,
        invoice_id: invoiceId
      });

    } catch (apiError) {
      logger.error({ data: apiError.response?.data || apiError.message }, 'Error taking payment via TutorCruncher API:');
      return res.status(500).json({
        error: 'Failed to record payment in TutorCruncher',
        details: apiError.response?.data?.message || apiError.message
      });
    }

  } catch (error) {
    logger.error({ err: error }, 'Error taking invoice payment:');
    res.status(500).json({
      error: 'Failed to take invoice payment',
      details: error.message
    });
  }
}));

// ============================================
// INVOICE NOTES ENDPOINTS
// ============================================

/**
 * GET /api/school-invoice-fulfillment/invoice/:invoiceId/notes
 * Get all notes for an invoice
 */
router.get('/invoice/:invoiceId/notes', auth, asyncHandler(async (req, res) => {
  try {
    const pool = getPool(req);
    const { invoiceId } = req.params;

    const result = await pool.query(
      `SELECT id, invoice_id as "invoiceId", client_id as "clientId", note, created_by as "createdBy",
              created_at as "createdAt", updated_at as "updatedAt"
       FROM invoice_notes
       WHERE invoice_id = $1
       ORDER BY created_at DESC`,
      [invoiceId]
    );

    res.json(result.rows);
  } catch (error) {
    if (error.code === '42P01') { // undefined_table
      return res.json([]);
    }
    logger.error({ err: error }, 'Error fetching invoice notes:');
    res.status(500).json({ error: 'Failed to fetch notes', details: error.message });
  }
}));

/**
 * POST /api/school-invoice-fulfillment/invoice/:invoiceId/notes
 * Create a new note for an invoice
 */
router.post('/invoice/:invoiceId/notes', auth, asyncHandler(async (req, res) => {
  try {
    const pool = getPool(req);
    const { invoiceId } = req.params;
    const { note, clientId } = req.body;
    const createdBy = req.user?.name || req.user?.email || 'Unknown';

    if (!note || !note.trim()) {
      return res.status(400).json({ error: 'Note content is required' });
    }

    const result = await pool.query(
      `INSERT INTO invoice_notes (invoice_id, client_id, note, created_by)
       VALUES ($1, $2, $3, $4)
       RETURNING id, invoice_id as "invoiceId", client_id as "clientId", note, created_by as "createdBy",
                 created_at as "createdAt", updated_at as "updatedAt"`,
      [invoiceId, clientId || null, note.trim(), createdBy]
    );

    // Dual-write to school_activity for unified CRM view
    const resolvedClientId = clientId || (await pool.query('SELECT client_id FROM invoices WHERE id = $1', [invoiceId])).rows[0]?.client_id;
    if (resolvedClientId) {
      try {
        await pool.query(
          `INSERT INTO school_activity
           (client_id, activity_type, description, invoice_id, source, created_by)
           VALUES ($1, 'note', $2, $3, 'invoice_fulfillment', $4)`,
          [resolvedClientId.toString(), note.trim(), invoiceId, createdBy]
        );
      } catch (dualWriteErr) {
        logger.warn({ err: dualWriteErr }, 'Dual-write to school_activity failed (non-blocking)');
      }
    }

    res.json(result.rows[0]);
  } catch (error) {
    if (error.code === '42P01') { // undefined_table
      return res.status(503).json({ error: 'Notes table not yet created. Run migration: 20260310_fix_invoice_notes_client_id.sql' });
    }
    logger.error({ err: error }, 'Error creating invoice note:');
    res.status(500).json({ error: 'Failed to create note', details: error.message });
  }
}));

/**
 * PUT /api/school-invoice-fulfillment/notes/:noteId
 * Update an invoice note
 */
router.put('/notes/:noteId', auth, asyncHandler(async (req, res) => {
  try {
    const pool = getPool(req);
    const { noteId } = req.params;
    const { note } = req.body;
    const userName = req.user?.name || req.user?.email || '';
    const userEmail = req.user?.email || '';

    if (!note || !note.trim()) {
      return res.status(400).json({ error: 'Note content is required' });
    }

    // Only the note creator can update — match on name or email
    const result = await pool.query(
      `UPDATE invoice_notes
       SET note = $1, updated_at = NOW()
       WHERE id = $2 AND (created_by = $3 OR created_by = $4)
       RETURNING id, invoice_id as "invoiceId", client_id as "clientId", note, created_by as "createdBy",
                 created_at as "createdAt", updated_at as "updatedAt"`,
      [note.trim(), noteId, userName, userEmail]
    );

    if (result.rows.length === 0) {
      // Check if note exists but belongs to someone else
      const exists = await pool.query('SELECT id FROM invoice_notes WHERE id = $1', [noteId]);
      if (exists.rows.length > 0) {
        return res.status(403).json({ error: 'You can only edit your own notes' });
      }
      return res.status(404).json({ error: 'Note not found' });
    }

    res.json(result.rows[0]);
  } catch (error) {
    logger.error({ err: error }, 'Error updating invoice note:');
    res.status(500).json({ error: 'Failed to update note', details: error.message });
  }
}));

/**
 * DELETE /api/school-invoice-fulfillment/notes/:noteId
 * Delete an invoice note
 */
router.delete('/notes/:noteId', auth, asyncHandler(async (req, res) => {
  try {
    const pool = getPool(req);
    const { noteId } = req.params;
    const userName = req.user?.name || req.user?.email || '';
    const userEmail = req.user?.email || '';

    // Only the note creator can delete — match on name or email
    const result = await pool.query(
      `DELETE FROM invoice_notes WHERE id = $1 AND (created_by = $2 OR created_by = $3) RETURNING id`,
      [noteId, userName, userEmail]
    );

    if (result.rows.length === 0) {
      const exists = await pool.query('SELECT id FROM invoice_notes WHERE id = $1', [noteId]);
      if (exists.rows.length > 0) {
        return res.status(403).json({ error: 'You can only delete your own notes' });
      }
      return res.status(404).json({ error: 'Note not found' });
    }

    res.json({ success: true, id: noteId });
  } catch (error) {
    logger.error({ err: error }, 'Error deleting invoice note:');
    res.status(500).json({ error: 'Failed to delete note', details: error.message });
  }
}));

// ============================================
// INVOICE ACTIVITY LOG ENDPOINTS
// ============================================

/**
 * GET /api/school-invoice-fulfillment/invoice/:invoiceId/activity
 * Get activity log for an invoice
 */
router.get('/invoice/:invoiceId/activity', auth, asyncHandler(async (req, res) => {
  try {
    const pool = getPool(req);
    const { invoiceId } = req.params;

    const result = await pool.query(
      `SELECT id, invoice_id as "invoiceId", client_id as "clientId", activity_type as "activityType",
              description, notes, source, contact_method as "contactMethod", contact_person as "contactPerson",
              outcome, follow_up_date as "followUpDate", created_by as "createdBy", created_at as "createdAt"
       FROM invoice_activity_log
       WHERE invoice_id = $1
       ORDER BY created_at DESC`,
      [invoiceId]
    );

    res.json(result.rows);
  } catch (error) {
    logger.error({ err: error }, 'Error fetching invoice activity:');
    res.status(500).json({ error: 'Failed to fetch activity', details: error.message });
  }
}));

/**
 * POST /api/school-invoice-fulfillment/invoice/:invoiceId/activity
 * Log a new activity for an invoice
 */
router.post('/invoice/:invoiceId/activity', auth, asyncHandler(async (req, res) => {
  try {
    const pool = getPool(req);
    const { invoiceId } = req.params;
    const {
      activityType, description, notes, clientId,
      contactMethod, contactPerson, outcome, followUpDate
    } = req.body;
    const createdBy = req.user?.name || req.user?.email || 'Unknown';

    if (!activityType || !description) {
      return res.status(400).json({ error: 'Activity type and description are required' });
    }

    const result = await pool.query(
      `INSERT INTO invoice_activity_log
       (invoice_id, client_id, activity_type, description, notes, source, contact_method, contact_person, outcome, follow_up_date, created_by)
       VALUES ($1, $2, $3, $4, $5, 'manual', $6, $7, $8, $9, $10)
       RETURNING id, invoice_id as "invoiceId", client_id as "clientId", activity_type as "activityType",
                 description, notes, source, contact_method as "contactMethod", contact_person as "contactPerson",
                 outcome, follow_up_date as "followUpDate", created_by as "createdBy", created_at as "createdAt"`,
      [invoiceId, clientId || null, activityType, description, notes || null,
       contactMethod || null, contactPerson || null, outcome || null, followUpDate || null, createdBy]
    );

    // Dual-write to school_activity for unified CRM view
    const resolvedClientId = clientId || (await pool.query('SELECT client_id FROM invoices WHERE id = $1', [invoiceId])).rows[0]?.client_id;
    if (resolvedClientId) {
      try {
        await pool.query(
          `INSERT INTO school_activity
           (client_id, activity_type, subject, description, contact_person, outcome, follow_up_date, invoice_id, source, created_by)
           VALUES ($1, $2, $3, $4, $5, $6, $7, $8, 'invoice_fulfillment', $9)`,
          [resolvedClientId.toString(), activityType, null, description,
           contactPerson || null, outcome || null, followUpDate || null, invoiceId, createdBy]
        );
      } catch (dualWriteErr) {
        logger.warn({ err: dualWriteErr }, 'Dual-write to school_activity failed (non-blocking)');
      }
    }

    res.json(result.rows[0]);
  } catch (error) {
    logger.error({ err: error }, 'Error logging invoice activity:');
    res.status(500).json({ error: 'Failed to log activity', details: error.message });
  }
}));

/**
 * GET /api/school-invoice-fulfillment/invoice/:invoiceId/timeline
 * Get combined timeline of notes + activity + reminders
 */
router.get('/invoice/:invoiceId/timeline', auth, asyncHandler(async (req, res) => {
  try {
    const pool = getPool(req);
    const { invoiceId } = req.params;

    const result = await pool.query(
      `SELECT 'note' as type, id, note as content, null as "activityType", null as outcome,
              null as "contactMethod", null as source, created_by as "createdBy", created_at as "createdAt"
       FROM invoice_notes WHERE invoice_id = $1
       UNION ALL
       SELECT 'activity' as type, id, description as content, activity_type as "activityType", outcome,
              contact_method as "contactMethod", source, created_by as "createdBy", created_at as "createdAt"
       FROM invoice_activity_log WHERE invoice_id = $1
       UNION ALL
       SELECT 'reminder' as type, id, COALESCE(reminder_message, 'Reminder sent') as content,
              reminder_type as "activityType", null as outcome, reminder_method as "contactMethod",
              'tc_webhook' as source,
              COALESCE(reminder_sent_by, 'TutorCruncher') as "createdBy",
              reminder_sent_at as "createdAt"
       FROM invoice_reminders WHERE invoice_id = $1
       ORDER BY "createdAt" DESC`,
      [invoiceId]
    );

    res.json(result.rows);
  } catch (error) {
    if (error.code === '42P01') { // undefined_table
      return res.json([]);
    }
    logger.error({ err: error }, 'Error fetching invoice timeline:');
    res.status(500).json({ error: 'Failed to fetch timeline', details: error.message });
  }
}));

/**
 * GET /api/school-invoice-fulfillment/activity/follow-ups
 * Get activities with upcoming follow-up dates
 */
router.get('/activity/follow-ups', auth, asyncHandler(async (req, res) => {
  try {
    const pool = getPool(req);
    const includeCompleted = req.query.includeCompleted === 'true';

    const result = await pool.query(
      `SELECT a.id, a.invoice_id, a.client_id, a.activity_type, a.description,
              a.notes, a.outcome, a.follow_up_date, a.follow_up_completed,
              a.created_by, a.created_at,
              i.display_id, i.gross as amount, i.status as invoice_status,
              c.first_name || ' ' || COALESCE(c.last_name, '') as school_name
       FROM invoice_activity_log a
       LEFT JOIN invoices i ON a.invoice_id = i.id
       LEFT JOIN clients c ON a.client_id::text = c.client_id::text
       WHERE a.follow_up_date IS NOT NULL
         AND a.follow_up_date <= CURRENT_DATE + INTERVAL '7 days'
         ${includeCompleted ? '' : 'AND (a.follow_up_completed = FALSE OR a.follow_up_completed IS NULL)'}
       ORDER BY a.follow_up_date ASC`,
      []
    );

    // Categorize into overdue and due today/upcoming
    const now = new Date();
    const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    const overdue = [];
    const dueToday = [];
    const upcoming = [];

    for (const row of result.rows) {
      const followUpDate = new Date(row.follow_up_date);
      const followUpDay = new Date(followUpDate.getFullYear(), followUpDate.getMonth(), followUpDate.getDate());
      if (followUpDay < today) {
        overdue.push(row);
      } else if (followUpDay.getTime() === today.getTime()) {
        dueToday.push(row);
      } else {
        upcoming.push(row);
      }
    }

    res.json({ overdue, dueToday, upcoming, total: result.rows.length });
  } catch (error) {
    logger.error({ err: error }, 'Error fetching follow-ups:');
    res.status(500).json({ error: 'Failed to fetch follow-ups', details: error.message });
  }
}));

/**
 * PUT /api/school-invoice-fulfillment/activity/:activityId/complete-followup
 * Mark a follow-up as completed
 */
router.put('/activity/:activityId/complete-followup', auth, asyncHandler(async (req, res) => {
  try {
    const pool = getPool(req);
    const { activityId } = req.params;

    const result = await pool.query(
      `UPDATE invoice_activity_log
       SET follow_up_completed = TRUE
       WHERE id = $1
       RETURNING id, invoice_id, follow_up_date, follow_up_completed`,
      [activityId]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Activity not found' });
    }

    res.json({ success: true, activity: result.rows[0] });
  } catch (error) {
    logger.error({ err: error }, 'Error completing follow-up:');
    res.status(500).json({ error: 'Failed to complete follow-up', details: error.message });
  }
}));

// ============================================
// FLAT INVOICE LIST WITH PAGINATION/SORTING/FILTERING
// ============================================

/**
 * GET /api/school-invoice-fulfillment/invoices
 * Returns a flat list of invoices (not grouped by school) with server-side
 * pagination, sorting, filtering, and a cross-page summary.
 *
 * Query params:
 *   page (default 1), pageSize (default 50)
 *   sort (default days_outstanding_desc)
 *   status (all|unpaid|pending|past_due|past_due_30|paid)
 *   search (school name or display_id)
 *   month (YYYY-MM)
 *   location (NYC|LA|SF|Hamptons|Eastside|Westside)
 */
router.get('/invoices', asyncHandler(async (req, res) => {
  const pool = getPool(req);

  // --- pagination ---
  const page = Math.max(1, parseInt(req.query.page) || 1);
  const pageSize = Math.min(200, Math.max(1, parseInt(req.query.pageSize) || 50));
  const offset = (page - 1) * pageSize;

  // --- sort ---
  const sortParam = req.query.sort || 'days_outstanding_desc';
  const SORT_MAP = {
    days_outstanding_desc: 'status_priority DESC, days_outstanding DESC, inv_amount DESC',
    days_outstanding_asc:  'days_outstanding ASC, inv_amount ASC',
    amount_desc:           'inv_amount DESC, days_outstanding DESC',
    amount_asc:            'inv_amount ASC',
    date_sent_desc:        'date_sent DESC NULLS LAST',
    date_sent_asc:         'date_sent ASC NULLS LAST',
    school_name_asc:       'school_name ASC, days_outstanding DESC',
    school_name_desc:      'school_name DESC, days_outstanding DESC',
    display_id_desc:       'display_id DESC',
    display_id_asc:        'display_id ASC',
    location_desc:         'location DESC, days_outstanding DESC',
    location_asc:          'location ASC, days_outstanding DESC',
    priority_desc:         'priority_score DESC, days_outstanding DESC',
    priority_asc:          'priority_score ASC',
  };
  const orderClause = SORT_MAP[sortParam] || SORT_MAP.days_outstanding_desc;

  // --- filters ---
  const statusFilter = req.query.status || 'all';
  const search = (req.query.search || '').trim();
  const monthFilter = req.query.month || null; // YYYY-MM

  // --- location ---
  const hostname = req.get('host') || req.hostname || '';
  let detectedLocation = null;
  if (hostname.includes('eastside')) detectedLocation = 'Eastside';
  else if (hostname.includes('westside')) detectedLocation = 'Westside';

  const queryLocation = req.query.location;
  const locationFilter = queryLocation || (detectedLocation && !queryLocation ? detectedLocation : 'all');
  const validLocations = ['NYC', 'LA', 'SF', 'Hamptons', 'Eastside', 'Westside'];

  let schoolLabels = validLocations.map(l => `School - ${l}`);
  if (locationFilter !== 'all' && validLocations.includes(locationFilter)) {
    schoolLabels = [`School - ${locationFilter}`];
  }

  // Step 1: Get cached school clients (skips expensive 4-CTE chain on cache hit)
  const schoolClients = await getSchoolClients(pool, schoolLabels);

  if (!schoolClients.length) {
    return res.json({ invoices: [], pagination: { page, pageSize, totalCount: 0, totalPages: 0 }, summary: {} });
  }

  // Build a lookup map for school info
  const schoolMap = {};
  for (const sc of schoolClients) {
    schoolMap[sc.client_id] = sc;
  }
  const clientIds = schoolClients.filter(sc => !sc.client_id.startsWith('SCHOOL_')).map(sc => sc.client_id);

  // Step 2: Build parameterized invoice query
  const params = [clientIds]; // $1
  let paramIdx = 2;

  let billingMonth = null;
  if (monthFilter) {
    const parts = monthFilter.split('-');
    if (parts.length >= 2) {
      billingMonth = `${parts[0]}-${parts[1].padStart(2, '0')}-01`;
      params.push(billingMonth);
    }
  }
  const monthParamIdx = billingMonth ? paramIdx++ : null;

  let searchParamIdx = null;
  if (search) {
    params.push(`%${search}%`);
    searchParamIdx = paramIdx++;
  }

  params.push(pageSize);
  const limitParamIdx = paramIdx++;
  params.push(offset);
  const offsetParamIdx = paramIdx++;

  // --- status WHERE clause ---
  let statusWhere = '';
  switch (statusFilter) {
    case 'unpaid':
      statusWhere = `AND i.status = 'unpaid'`;
      break;
    case 'pending':
      statusWhere = `AND i.status = 'payment-pending'`;
      break;
    case 'past_due':
      statusWhere = `AND i.status = 'unpaid' AND i.date_sent < NOW() - INTERVAL '30 days'`;
      break;
    case 'past_due_30':
      statusWhere = `AND i.status = 'unpaid' AND i.date_sent < NOW() - INTERVAL '60 days'`;
      break;
    case 'paid':
      statusWhere = `AND i.status = 'paid'`;
      break;
  }

  // Step 3: Run summary + page query in parallel
  // Summary uses cached client IDs directly — no CTE chain needed
  const summaryQuery = `
    SELECT
      COALESCE(SUM(CASE WHEN i.status = 'unpaid' AND i.date_sent < NOW() - INTERVAL '30 days' THEN i.gross ELSE 0 END), 0) AS total_outstanding,
      COALESCE(SUM(CASE WHEN i.status = 'unpaid' AND i.date_sent < NOW() - INTERVAL '30 days' THEN 1 ELSE 0 END), 0) AS total_outstanding_count,
      COALESCE(SUM(CASE WHEN i.status = 'payment-pending' THEN i.gross ELSE 0 END), 0) AS total_pending,
      COALESCE(SUM(CASE WHEN i.status = 'payment-pending' THEN 1 ELSE 0 END), 0) AS total_pending_count,
      COALESCE(SUM(CASE WHEN i.status = 'unpaid' AND i.date_sent < NOW() - INTERVAL '30 days' THEN i.gross ELSE 0 END), 0) AS total_past_due,
      COALESCE(SUM(CASE WHEN i.status = 'unpaid' AND i.date_sent < NOW() - INTERVAL '30 days' THEN 1 ELSE 0 END), 0) AS total_past_due_count,
      COALESCE(SUM(CASE WHEN i.status = 'unpaid' AND i.date_sent < NOW() - INTERVAL '60 days' THEN i.gross ELSE 0 END), 0) AS total_past_due_30,
      COALESCE(SUM(CASE WHEN i.status = 'unpaid' AND i.date_sent < NOW() - INTERVAL '60 days' THEN 1 ELSE 0 END), 0) AS total_past_due_30_count,
      COALESCE(SUM(CASE WHEN i.status = 'unpaid' AND i.date_sent < NOW() - INTERVAL '44 days' THEN 1 ELSE 0 END), 0) AS over_14_days,
      COALESCE(SUM(CASE WHEN i.status = 'unpaid' AND i.date_sent < NOW() - INTERVAL '60 days' THEN 1 ELSE 0 END), 0) AS over_30_days
    FROM invoices i
    WHERE i.client_id::text = ANY($1::text[])
      AND LOWER(i.status) NOT IN ('cancelled', 'void', 'voided', 'refund', 'refunded')
  `;

  const pageQuery = `
    WITH reminder_agg AS (
      SELECT invoice_id, COUNT(*) AS cnt, MAX(reminder_sent_at) AS last_sent
      FROM invoice_reminders
      GROUP BY invoice_id
    ),
    latest_notes AS (
      SELECT DISTINCT ON (invoice_id)
        invoice_id, note, created_at
      FROM invoice_notes
      ORDER BY invoice_id, created_at DESC
    ),
    last_contact AS (
      SELECT invoice_id, MAX(contact_date) AS last_contact_date
      FROM (
        SELECT invoice_id, created_at AS contact_date FROM invoice_notes
        UNION ALL
        SELECT invoice_id, created_at AS contact_date FROM invoice_activity_log
      ) all_contacts
      GROUP BY invoice_id
    ),
    base_invoices AS (
      SELECT
        i.id AS invoice_id,
        i.display_id,
        i.client_id::text AS school_client_id,
        i.gross AS inv_amount,
        CASE WHEN i.status = 'paid' THEN 0 ELSE COALESCE(i.gross, 0) END AS amount_outstanding,
        i.status AS invoice_status,
        i.date_sent,
        i.date_paid,
        CASE
          WHEN i.status = 'unpaid' AND i.date_sent IS NOT NULL
          THEN GREATEST(0, EXTRACT(EPOCH FROM (NOW() - i.date_sent)) / 86400 - 30)
          ELSE 0
        END AS days_outstanding,
        COALESCE(ra.cnt, 0) AS reminder_count,
        ra.last_sent AS last_reminder_sent_at,
        ln.note AS last_note,
        ln.created_at AS last_note_date,
        lc.last_contact_date,
        i.flag,
        i.flag_note,
        i.flagged_at,
        CASE i.status
          WHEN 'unpaid' THEN
            CASE WHEN i.date_sent IS NOT NULL AND i.date_sent < NOW() - INTERVAL '30 days' THEN 4 ELSE 3 END
          WHEN 'payment-pending' THEN 2
          WHEN 'paid' THEN 1
          ELSE 0
        END AS status_priority
      FROM invoices i
      LEFT JOIN reminder_agg ra ON ra.invoice_id = i.id
      LEFT JOIN latest_notes ln ON ln.invoice_id = i.id
      LEFT JOIN last_contact lc ON lc.invoice_id = i.id
      WHERE i.client_id::text = ANY($1::text[])
        AND LOWER(i.status) NOT IN ('cancelled', 'void', 'voided', 'refund', 'refunded')
        ${statusWhere}
        ${monthParamIdx ? `AND DATE_TRUNC('month', i.date_sent)::date = $${monthParamIdx}::date` : ''}
        ${searchParamIdx ? `AND (i.display_id ILIKE $${searchParamIdx})` : ''}
    ),
    enriched AS (
      SELECT
        bi.*,
        bi.inv_amount * GREATEST(bi.days_outstanding, 0) AS priority_score,
        CASE
          WHEN bi.days_outstanding > 45 OR bi.inv_amount > 2000 THEN 'critical'
          WHEN bi.days_outstanding > 30 OR bi.inv_amount > 1000 THEN 'high'
          WHEN bi.days_outstanding > 14 THEN 'medium'
          ELSE 'low'
        END AS priority_level,
        COUNT(*) OVER() AS total_count
      FROM base_invoices bi
    )
    SELECT * FROM enriched e
    ORDER BY ${orderClause}
    LIMIT $${limitParamIdx} OFFSET $${offsetParamIdx}
  `;

  logger.info({ page, pageSize, sort: sortParam, statusFilter, search: search || null, location: locationFilter, clientCount: clientIds.length }, 'Invoices list query (cached school clients)');

  const [summaryResult, pageResult] = await Promise.all([
    pool.query(summaryQuery, [clientIds]),
    pool.query(pageQuery, params),
  ]);

  // If search includes school name, do client-side filtering on the page result
  // (school names come from cache, not DB, so we handle name search here)
  let filteredRows = pageResult.rows;
  if (search && !searchParamIdx) {
    // This shouldn't happen, but safety net
    filteredRows = pageResult.rows;
  }

  // Enrich rows with school info from cache
  const invoices = filteredRows.map(row => {
    const sc = schoolMap[row.school_client_id] || {};
    return {
      invoice_id: row.invoice_id,
      display_id: row.display_id,
      school_name: sc.school_name || 'Unknown',
      school_client_id: row.school_client_id,
      school_email: sc.email || null,
      location: (sc.school_label || 'Unknown').replace('School - ', ''),
      amount: parseFloat(row.inv_amount || 0),
      amount_outstanding: parseFloat(row.amount_outstanding || 0),
      status: row.invoice_status,
      date_sent: row.date_sent,
      date_paid: row.date_paid,
      days_outstanding: Math.round(parseFloat(row.days_outstanding || 0)),
      priority_score: Math.round(parseFloat(row.priority_score || 0)),
      priority_level: row.priority_level,
      reminder_count: parseInt(row.reminder_count || 0),
      last_reminder_sent_at: row.last_reminder_sent_at || null,
      last_note: row.last_note || null,
      last_note_date: row.last_note_date || null,
      last_contact_date: row.last_contact_date || null,
      flag: row.flag || null,
      flag_note: row.flag_note || null,
      flagged_at: row.flagged_at || null,
    };
  });

  // If searching by school name, filter the results and adjust counts
  let finalInvoices = invoices;
  let totalCount = parseInt(filteredRows[0]?.total_count || 0);
  if (search) {
    const searchLower = search.toLowerCase();
    finalInvoices = invoices.filter(inv =>
      inv.school_name.toLowerCase().includes(searchLower) ||
      (inv.display_id || '').toLowerCase().includes(searchLower)
    );
    totalCount = finalInvoices.length;
  }

  const totalPages = Math.ceil(totalCount / pageSize);
  const summaryRaw = summaryResult.rows[0] || {};

  res.json({
    invoices: search ? finalInvoices : invoices,
    pagination: { page, pageSize, totalCount, totalPages },
    summary: {
      totalOutstanding: parseFloat(summaryRaw.total_outstanding || 0),
      totalOutstandingCount: parseInt(summaryRaw.total_outstanding_count || 0),
      totalPending: parseFloat(summaryRaw.total_pending || 0),
      totalPendingCount: parseInt(summaryRaw.total_pending_count || 0),
      totalPastDue: parseFloat(summaryRaw.total_past_due || 0),
      totalPastDueCount: parseInt(summaryRaw.total_past_due_count || 0),
      totalPastDue30: parseFloat(summaryRaw.total_past_due_30 || 0),
      totalPastDue30Count: parseInt(summaryRaw.total_past_due_30_count || 0),
      collectionsQueue: {
        over30Days: parseInt(summaryRaw.over_30_days || 0),
        over14Days: parseInt(summaryRaw.over_14_days || 0),
        totalPastDueAmount: parseFloat(summaryRaw.total_past_due || 0),
      },
    },
  });
}));

// ============================================
// FLAG ISSUE ENDPOINT
// ============================================

/**
 * POST /api/school-invoice-fulfillment/invoice/:invoiceId/flag
 * Flag an invoice with an issue type and optional note
 */
router.post('/invoice/:invoiceId/flag', auth, asyncHandler(async (req, res) => {
  try {
    const pool = getPool(req);
    const { invoiceId } = req.params;
    const { flag, note } = req.body;
    const flaggedBy = req.user?.name || req.user?.email || 'Unknown';

    const validFlags = ['voided_check', 'check_lost', 'check_issue', 'dispute', 'other'];
    if (!flag || !validFlags.includes(flag)) {
      return res.status(400).json({ error: `Invalid flag type. Must be one of: ${validFlags.join(', ')}` });
    }

    const result = await pool.query(
      `UPDATE invoices
       SET flag = $1, flag_note = $2, flagged_at = NOW(), flagged_by = $3
       WHERE id = $4
       RETURNING id, flag, flag_note, flagged_at, flagged_by`,
      [flag, note || null, flaggedBy, invoiceId]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Invoice not found' });
    }

    // Log as activity
    const clientRow = await pool.query('SELECT client_id FROM invoices WHERE id = $1', [invoiceId]);
    const clientId = clientRow.rows[0]?.client_id;
    const flagLabels = { voided_check: 'Voided Check', check_lost: 'Check Lost in Mail', check_issue: 'Check Issue', dispute: 'Dispute', other: 'Other Issue' };

    await pool.query(
      `INSERT INTO invoice_activity_log
       (invoice_id, client_id, activity_type, description, notes, source, created_by)
       VALUES ($1, $2, 'flag_issue', $3, $4, 'manual', $5)`,
      [invoiceId, clientId, `Flagged: ${flagLabels[flag] || flag}`, note || null, flaggedBy]
    );

    res.json({ success: true, invoice: result.rows[0] });
  } catch (error) {
    logger.error({ err: error }, 'Error flagging invoice:');
    res.status(500).json({ error: 'Failed to flag invoice', details: error.message });
  }
}));

/**
 * DELETE /api/school-invoice-fulfillment/invoice/:invoiceId/flag
 * Clear a flag from an invoice
 */
router.delete('/invoice/:invoiceId/flag', auth, asyncHandler(async (req, res) => {
  try {
    const pool = getPool(req);
    const { invoiceId } = req.params;

    await pool.query(
      `UPDATE invoices SET flag = NULL, flag_note = NULL, flagged_at = NULL, flagged_by = NULL WHERE id = $1`,
      [invoiceId]
    );

    res.json({ success: true });
  } catch (error) {
    logger.error({ err: error }, 'Error clearing invoice flag:');
    res.status(500).json({ error: 'Failed to clear flag', details: error.message });
  }
}));

// ============================================
// CHECK RECONCILIATION ENDPOINTS
// ============================================

/**
 * GET /api/school-invoice-fulfillment/checks
 * List all checks with optional filters
 */
router.get('/checks', auth, asyncHandler(async (req, res) => {
  try {
    const pool = getPool(req);
    const { deposited, flagged } = req.query;

    let where = 'WHERE 1=1';
    const params = [];

    if (deposited === 'true') {
      where += ' AND c.deposited = TRUE';
    } else if (deposited === 'false') {
      where += ' AND c.deposited = FALSE';
    }

    if (flagged === 'true') {
      where += ' AND c.flagged_reason IS NOT NULL';
    }

    const result = await pool.query(
      `SELECT c.*, i.display_id, i.status as invoice_status
       FROM invoice_checks c
       LEFT JOIN invoices i ON c.invoice_id = i.id
       ${where}
       ORDER BY c.deposited ASC, c.created_at DESC`,
      params
    );

    // Summary
    const summaryResult = await pool.query(
      `SELECT
         COUNT(*) FILTER (WHERE deposited = FALSE AND flagged_reason IS NULL) AS pending_count,
         COALESCE(SUM(amount) FILTER (WHERE deposited = FALSE AND flagged_reason IS NULL), 0) AS pending_amount,
         COUNT(*) FILTER (WHERE deposited = TRUE) AS deposited_count,
         COUNT(*) FILTER (WHERE flagged_reason IS NOT NULL) AS flagged_count
       FROM invoice_checks`
    );

    res.json({
      checks: result.rows,
      summary: summaryResult.rows[0] || {},
    });
  } catch (error) {
    if (error.code === '42P01') return res.json({ checks: [], summary: {} });
    logger.error({ err: error }, 'Error fetching checks:');
    res.status(500).json({ error: 'Failed to fetch checks', details: error.message });
  }
}));

/**
 * POST /api/school-invoice-fulfillment/checks
 * Create a check record manually
 */
router.post('/checks', auth, asyncHandler(async (req, res) => {
  try {
    const pool = getPool(req);
    const { invoice_id, client_id, school_name, check_number, amount, date_received, notes } = req.body;
    const createdBy = req.user?.name || req.user?.email || 'Unknown';

    if (!invoice_id || !amount) {
      return res.status(400).json({ error: 'invoice_id and amount are required' });
    }

    const result = await pool.query(
      `INSERT INTO invoice_checks (invoice_id, client_id, school_name, check_number, amount, date_received, notes, created_by)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
       RETURNING *`,
      [invoice_id, client_id || null, school_name || null, check_number || null,
       parseFloat(amount), date_received || null, notes || null, createdBy]
    );

    res.json({ success: true, check: result.rows[0] });
  } catch (error) {
    logger.error({ err: error }, 'Error creating check record:');
    res.status(500).json({ error: 'Failed to create check', details: error.message });
  }
}));

/**
 * PUT /api/school-invoice-fulfillment/checks/:checkId/deposit
 * Mark a check as deposited
 */
router.put('/checks/:checkId/deposit', auth, asyncHandler(async (req, res) => {
  try {
    const pool = getPool(req);
    const { checkId } = req.params;

    const result = await pool.query(
      `UPDATE invoice_checks SET deposited = TRUE, deposited_at = NOW() WHERE id = $1 RETURNING *`,
      [checkId]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Check not found' });
    }

    res.json({ success: true, check: result.rows[0] });
  } catch (error) {
    logger.error({ err: error }, 'Error marking check deposited:');
    res.status(500).json({ error: 'Failed to mark deposited', details: error.message });
  }
}));

/**
 * PUT /api/school-invoice-fulfillment/checks/:checkId/flag
 * Flag a check with an issue
 */
router.put('/checks/:checkId/flag', auth, asyncHandler(async (req, res) => {
  try {
    const pool = getPool(req);
    const { checkId } = req.params;
    const { reason, notes } = req.body;

    const validReasons = ['voided', 'lost', 'issue'];
    if (!reason || !validReasons.includes(reason)) {
      return res.status(400).json({ error: `Invalid reason. Must be one of: ${validReasons.join(', ')}` });
    }

    const result = await pool.query(
      `UPDATE invoice_checks SET flagged_reason = $1, notes = COALESCE($2, notes) WHERE id = $3 RETURNING *`,
      [reason, notes || null, checkId]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Check not found' });
    }

    res.json({ success: true, check: result.rows[0] });
  } catch (error) {
    logger.error({ err: error }, 'Error flagging check:');
    res.status(500).json({ error: 'Failed to flag check', details: error.message });
  }
}));

module.exports = router;

