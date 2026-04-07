const express = require('express');
const router = express.Router();
const { tableExists, columnExists } = require('../utils/schema-cache');
const { pool, auth, stripe, puppeteer } = global;
const { logger } = require('../utils/logger');

// Import services
// Use PDFKit for faster, more reliable PDF generation (no browser dependencies)
const PDFKitGenerationService = require('../services/pdfkit-generation-service');
const AccountingEmailService = require('../services/accounting-email-service');
const AccountingPaymentService = require('../services/accounting-payment-service');
const InvoiceGenerationService = require('../services/invoice-generation-service');
const PaymentOrderGenerationService = require('../services/payment-order-generation-service');
const BalanceCalculationService = require('../services/balance-calculation-service');
const cache = require('../utils/cache');
const { asyncHandler } = require('../middleware/error-handler');

// Initialize services
const pdfService = new PDFKitGenerationService(pool);
const emailService = new AccountingEmailService(pool, puppeteer);
const paymentService = new AccountingPaymentService(pool, stripe);
const invoiceGenService = new InvoiceGenerationService(pool);
const paymentOrderGenService = new PaymentOrderGenerationService(pool);
const balanceService = new BalanceCalculationService(pool);

// Get credit requests
router.get('/credit-requests', auth, asyncHandler(async (req, res) => {
  try {
    const locationPool = req.locationPool || pool;
    const { status, search, startDate, endDate, sortBy = 'date_sent', sortOrder = 'DESC', page = '1' } = req.query;

    // Build cache key including query params
    const cacheKey = `accounting:credit-requests:${status}:${search}:${startDate}:${endDate}:${sortBy}:${sortOrder}:${page}`;

    const creditRequests = await cache.getOrSet(cacheKey, async () => {
      // Check if credit_requests table exists (cached)
      const crExists = await tableExists(locationPool, 'credit_requests');

      if (!crExists) {
        return [];
      }

      let query = `
        SELECT
          cr.*,
          cr.date_raised as date_sent,
          cr.date_approved as date_paid,
          c.first_name as client_first_name,
          c.last_name as client_last_name,
          c.email as client_email
        FROM credit_requests cr
        LEFT JOIN clients c ON cr.client_id::text = c.client_id::text
        WHERE 1=1
      `;
      const params = [];
      let paramCount = 0;

      // Status filtering
      if (status === 'unpaid') {
        query += ` AND (cr.status = 'raised' OR cr.status = 'unpaid' OR cr.status IS NULL)`;
      } else if (status === 'paid') {
        query += ` AND (cr.status = 'paid' OR cr.status = 'approved')`;
        // Add date filtering for paid credit requests (use date_approved)
        if (startDate && endDate) {
          paramCount++;
          query += ` AND cr.date_approved >= $${paramCount}`;
          params.push(startDate);
          paramCount++;
          query += ` AND cr.date_approved <= $${paramCount}`;
          params.push(endDate);
        }
      } else if (status) {
        paramCount++;
        params.push(status);
        query += ` AND cr.status = $${paramCount}`;
      }

      // Search functionality
      if (search) {
        paramCount++;
        query += ` AND (
          cr.display_id ILIKE $${paramCount} OR
          c.first_name ILIKE $${paramCount} OR
          c.last_name ILIKE $${paramCount} OR
          c.email ILIKE $${paramCount}
        )`;
        params.push(`%${search}%`);
      }

      // Sorting - credit_requests table has date_raised, date_approved, date_created (not date_sent or date_paid)
      // Map frontend column names to actual database columns
      const columnMapping = {
        'date_sent': 'date_raised',
        'date_paid': 'date_approved'
      };
      const actualSortBy = columnMapping[sortBy] || sortBy;
      const validSortColumns = ['date_created', 'date_raised', 'date_approved', 'status', 'id', 'amount'];
      const sortColumn = validSortColumns.includes(actualSortBy) ? actualSortBy : (status === 'paid' ? 'date_approved' : 'date_raised');
      const sortDirection = sortOrder.toUpperCase() === 'ASC' ? 'ASC' : 'DESC';
      query += ` ORDER BY cr.${sortColumn} ${sortDirection} NULLS LAST`;

      const result = await locationPool.query(query, params);
      return result.rows;
    }, 30); // 30 seconds

    res.json({ credit_requests: creditRequests });
  } catch (error) {
    logger.error({ err: error }, 'Error fetching credit requests');
    res.status(500).json({ error: 'Failed to fetch credit requests', details: error.message });
  }
}));

// Get credit requests summary
router.get('/credit-requests/summary', auth, asyncHandler(async (req, res) => {
  try {
    const locationPool = req.locationPool || pool;
    
    const { rows } = await locationPool.query(`
      SELECT 
        status,
        COUNT(*) as count,
        SUM(amount) as total_amount
      FROM credit_requests
      GROUP BY status
      ORDER BY status
    `);

    res.json({ summary: rows });
  } catch (error) {
    logger.error({ msg: 'Error fetching credit requests summary', error: error.message });
    res.status(500).json({ error: 'Failed to fetch summary', details: error.message });
  }
}));

// Get payment orders with status filter
router.get('/payment-orders', auth, asyncHandler(async (req, res) => {
  try {
    const locationPool = req.locationPool || pool;
    const { status, search, startDate, endDate, sortBy = 'date_sent', sortOrder = 'DESC' } = req.query;

    // Check if payment_orders table exists (cached)
    const poExists = await tableExists(locationPool, 'payment_orders');

    if (!poExists) {
      return res.json({ payment_orders: [] });
    }

    // Check if date_paid column exists (cached)
    const hasDatePaidColumn = await columnExists(locationPool, 'payment_orders', 'date_paid');

    let query = `
      SELECT 
        po.*,
        po.payee_first as payee_first,
        po.payee_last as payee_last,
        po.payee_email as payee_email
      FROM payment_orders po
      WHERE 1=1
    `;
    const params = [];
    let paramCount = 0;

    // Status filtering
    if (status === 'all' || !status) {
      // No status filter - show all payment orders
    } else if (status === 'unpaid') {
      query += ` AND (po.status = 'sent' OR po.status = 'unpaid' OR po.status IS NULL)`;
    } else if (status === 'paid') {
      query += ` AND po.status = 'paid'`;
    } else if (status === 'in_pay_run') {
      query += ` AND po.status = 'in_pay_run'`;
    } else if (status === 'void') {
      query += ` AND po.status = 'void'`;
    } else {
      paramCount++;
      params.push(status);
      query += ` AND po.status = $${paramCount}`;
    }

    // Search functionality
    if (search) {
      paramCount++;
      query += ` AND (
        po.display_id ILIKE $${paramCount} OR
        po.payee_first ILIKE $${paramCount} OR
        po.payee_last ILIKE $${paramCount} OR
        po.payee_email ILIKE $${paramCount}
      )`;
      params.push(`%${search}%`);
    }

    // Sorting (only use date_paid if column exists)
    const validSortColumns = hasDatePaidColumn 
      ? ['date_sent', 'date_paid', 'status', 'id', 'amount']
      : ['date_sent', 'status', 'id', 'amount'];
    const defaultSortColumn = status === 'paid' && hasDatePaidColumn ? 'date_paid' : 'date_sent';
    const sortColumn = validSortColumns.includes(sortBy) ? sortBy : defaultSortColumn;
    const sortDirection = sortOrder.toUpperCase() === 'ASC' ? 'ASC' : 'DESC';
    query += ` ORDER BY po.${sortColumn} ${sortDirection} NULLS LAST`;

    const result = await locationPool.query(query, params);
    res.json({ payment_orders: result.rows });
  } catch (error) {
    logger.error({ msg: 'Error fetching payment orders', error: error.message, stack: error.stack });
    res.status(500).json({ error: 'Failed to fetch payment orders', details: error.message });
  }
}));

// Get payment orders summary
router.get('/payment-orders/summary', auth, asyncHandler(async (req, res) => {
  try {
    const locationPool = req.locationPool || pool;
    
    const { rows } = await locationPool.query(`
      SELECT 
        status,
        COUNT(*) as count,
        SUM(amount) as total_amount
      FROM payment_orders
      GROUP BY status
      ORDER BY status
    `);

    res.json({ summary: rows });
  } catch (error) {
    logger.error({ msg: 'Error fetching payment orders summary', error: error.message });
    res.status(500).json({ error: 'Failed to fetch summary', details: error.message });
  }
}));

// Get balance updates
router.get('/balance-updates', auth, asyncHandler(async (req, res) => {
  try {
    const locationPool = req.locationPool || pool;
    const { client_id, update_type, limit = 100 } = req.query;

    // Check if balance_updates table exists (cached)
    const buExists = await tableExists(locationPool, 'balance_updates');

    if (!buExists) {
      return res.json({ balance_updates: [] });
    }

    let query = `
      SELECT 
        bu.*,
        c.first_name as client_first_name,
        c.last_name as client_last_name
      FROM balance_updates bu
      LEFT JOIN clients c ON bu.client_id::text = c.client_id::text
      WHERE 1=1
    `;
    const params = [];

    if (client_id) {
      params.push(client_id);
      query += ` AND bu.client_id = $${params.length}`;
    }

    if (update_type) {
      params.push(update_type);
      query += ` AND bu.update_type = $${params.length}`;
    }

    query += ` ORDER BY bu.created_at DESC LIMIT $${params.length + 1}`;
    params.push(parseInt(limit));

    const result = await locationPool.query(query, params);
    res.json({ balance_updates: result.rows });
  } catch (error) {
    logger.error({ err: error }, 'Error fetching balance updates');
    res.status(500).json({ error: 'Failed to fetch balance updates', details: error.message });
  }
}));

// Get client balances
router.get('/client-balances', auth, asyncHandler(async (req, res) => {
  try {
    const locationPool = req.locationPool || pool;
    const { search, sort_by = 'invoice_balance', sort_order = 'DESC' } = req.query;

    let query = `
      SELECT 
        c.id,
        c.client_id,
        c.first_name,
        c.last_name,
        c.email,
        COALESCE(cb.invoice_balance, 0) as invoice_balance,
        COALESCE(cb.available_balance, 0) as available_balance,
        COUNT(DISTINCT i.id) as invoice_count,
        COUNT(DISTINCT CASE WHEN i.status IN ('unpaid', 'pending', 'raised') THEN i.id END) as unpaid_invoice_count
      FROM clients c
      LEFT JOIN client_balances cb ON CAST(c.client_id AS TEXT) = CAST(cb.client_id AS TEXT)
      LEFT JOIN invoices i ON CAST(c.client_id AS TEXT) = CAST(i.client_id AS TEXT)
      WHERE 1=1
    `;
    const params = [];

    if (search) {
      params.push(`%${search}%`);
      query += ` AND (
        c.first_name ILIKE $${params.length} OR
        c.last_name ILIKE $${params.length} OR
        c.email ILIKE $${params.length}
      )`;
    }

    query += ` GROUP BY c.id, c.client_id, c.first_name, c.last_name, c.email, 
              cb.invoice_balance, cb.available_balance`;

    // Sort by balance
    if (sort_by === 'invoice_balance') {
      query += ` ORDER BY COALESCE(cb.invoice_balance, 0) ${sort_order === 'ASC' ? 'ASC' : 'DESC'}`;
    } else if (sort_by === 'available_balance') {
      query += ` ORDER BY COALESCE(cb.available_balance, 0) ${sort_order === 'ASC' ? 'ASC' : 'DESC'}`;
    } else {
      query += ` ORDER BY c.last_name ASC`;
    }

    const result = await locationPool.query(query, params);
    res.json({ clients: result.rows });
  } catch (error) {
    logger.error({ msg: 'Error fetching client balances', error: error.message });
    res.status(500).json({ error: 'Failed to fetch client balances', details: error.message });
  }
}));

// ============================================================================
// CREDIT REQUESTS ENDPOINTS
// ============================================================================

// Get credit request by ID (checks both credit_requests and proforma_invoices tables)
router.get('/credit-requests/:id', auth, asyncHandler(async (req, res) => {
  try {
    const locationPool = req.locationPool || pool;
    const { id } = req.params;

    // First try credit_requests table
    let { rows } = await locationPool.query(
      `SELECT 
        cr.*,
        c.first_name as client_first_name,
        c.last_name as client_last_name,
        c.email as client_email
      FROM credit_requests cr
      LEFT JOIN clients c ON cr.client_id::text = c.client_id::text
      WHERE cr.id = $1`,
      [id]
    );

    let items = [];
    let balanceUpdates = [];
    let activities = [];
    if (rows.length > 0) {
      const creditRequest = rows[0];
      
      // Fetch items from credit_request_items table with appointment details
      const { rows: itemsRows } = await locationPool.query(
        `SELECT 
          cri.*,
          a.start as appointment_start,
          a.finish as appointment_finish,
          a.topic as appointment_topic,
          s.name as service_name
        FROM credit_request_items cri
        LEFT JOIN appointments a ON cri.appointment_id = a.appointment_id
        LEFT JOIN services s ON a.service_id = s.service_id
        WHERE cri.credit_request_id = $1 
        ORDER BY cri.created_at ASC`,
        [id]
      );
      
      // If no items exist, create a single item from the main description
      if (itemsRows.length === 0 && (creditRequest.description || creditRequest.reason)) {
        items = [{
          id: null,
          description: creditRequest.description || creditRequest.reason,
          amount: parseFloat(creditRequest.amount) || 0,
          units: 1,
          reason: null,
          appointment_id: null,
          appointment_topic: null,
          service_name: null
        }];
      } else {
        items = itemsRows;
      }

      // Fetch balance updates related to this credit request
      const { rows: balanceRows } = await locationPool.query(
        `SELECT 
          bu.*,
          c.first_name as client_first_name,
          c.last_name as client_last_name,
          c.email as client_email
        FROM balance_updates bu
        LEFT JOIN clients c ON bu.client_id::text = c.client_id::text
        WHERE bu.client_id = $1 
          AND (bu.description LIKE '%credit%' OR bu.description LIKE '%Credit%' OR bu.related_credit_request_id = $2)
        ORDER BY bu.created_at DESC`,
        [creditRequest.client_id, id]
      );
      balanceUpdates = balanceRows;

      // Fetch activity log
      const { rows: activityRows } = await locationPool.query(
        `SELECT 
          aal.*,
          u.first_name || ' ' || u.last_name as performed_by_name
        FROM accounting_activity_log aal
        LEFT JOIN users u ON aal.performed_by = u.email
        WHERE aal.document_type = 'credit_request' AND aal.document_id = $1 
        ORDER BY aal.created_at DESC`,
        [id]
      );
      activities = activityRows;

    } else {
      // Try proforma_invoices table (TutorCruncher credit requests)
      const { rows: piRows } = await locationPool.query(
        `SELECT 
          pi.*,
          c.first_name as client_first_name,
          c.last_name as client_last_name,
          c.email as client_email
        FROM proforma_invoices pi
        LEFT JOIN clients c ON pi.client_id::text = c.client_id::text
        WHERE pi.id = $1`,
        [id]
      );

      if (piRows.length === 0) {
        return res.status(404).json({ error: 'Credit request not found' });
      }

      rows = piRows;
      const proformaInvoice = rows[0];

      // Parse items from JSONB column
      if (proformaInvoice.items && typeof proformaInvoice.items === 'string') {
        try {
          items = JSON.parse(proformaInvoice.items);
        } catch (e) {
          items = [];
        }
      } else if (Array.isArray(proformaInvoice.items)) {
        items = proformaInvoice.items;
      }

      // Fetch balance updates
      const { rows: balanceRows } = await locationPool.query(
        `SELECT 
          bu.*,
          c.first_name as client_first_name,
          c.last_name as client_last_name,
          c.email as client_email
        FROM balance_updates bu
        LEFT JOIN clients c ON bu.client_id::text = c.client_id::text
        WHERE bu.client_id = $1 
          AND (bu.description LIKE '%credit%' OR bu.description LIKE '%Credit%' OR bu.description LIKE '%PFI%')
        ORDER BY bu.created_at DESC`,
        [proformaInvoice.client_id]
      );
      balanceUpdates = balanceRows;

      // Fetch activity log (proforma invoices might not have activity log entries)
      const { rows: activityRows } = await locationPool.query(
        `SELECT 
          aal.*,
          u.first_name || ' ' || u.last_name as performed_by_name
        FROM accounting_activity_log aal
        LEFT JOIN users u ON aal.performed_by = u.email
        WHERE aal.document_type = 'credit_request' AND aal.document_id = $1 
        ORDER BY aal.created_at DESC`,
        [id]
      );
      activities = activityRows;

    }

    res.json({
      credit_request: rows[0],
      items: items,
      balanceUpdates: balanceUpdates,
      activities: activities
    });
  } catch (error) {
    logger.error({ msg: 'Error fetching credit request', id, error: error.message });
    res.status(500).json({ error: 'Failed to fetch credit request', details: error.message });
  }
}));

// Create draft credit request
router.post('/credit-requests', auth, asyncHandler(async (req, res) => {
  try {
    const locationPool = req.locationPool || pool;
    const { client_id, amount, reason, description, items } = req.body;

    if (!client_id || !amount) {
      return res.status(400).json({ error: 'client_id and amount are required' });
    }

    // Get client info
    const { rows: clientRows } = await locationPool.query(
      `SELECT first_name, last_name, email FROM clients WHERE client_id = $1`,
      [client_id]
    );

    if (clientRows.length === 0) {
      return res.status(404).json({ error: 'Client not found' });
    }

    const clientInfo = clientRows[0];

    // Create credit request
    const { rows: crRows } = await locationPool.query(
      `INSERT INTO credit_requests (
        display_id,
        client_id,
        client_first_name,
        client_last_name,
        client_email,
        amount,
        reason,
        description,
        status,
        date_created,
        items
      ) VALUES (
        $1, $2, $3, $4, $5, $6, $7, $8, 'draft', NOW(), $9
      ) RETURNING *`,
      [
        `PFI-${Date.now()}`,
        client_id,
        clientInfo.first_name,
        clientInfo.last_name,
        clientInfo.email,
        amount,
        reason,
        description,
        JSON.stringify(items || [])
      ]
    );

    const creditRequest = crRows[0];

    // Generate credit request number
    const creditRequestNumber = `PFI-${creditRequest.id}`;
    await locationPool.query(
      `UPDATE credit_requests SET credit_request_number = $1 WHERE id = $2`,
      [creditRequestNumber, creditRequest.id]
    );

    // Insert items if provided
    if (items && items.length > 0) {
      for (const item of items) {
        await locationPool.query(
          `INSERT INTO credit_request_items (
            credit_request_id,
            invoice_id,
            appointment_id,
            description,
            reason,
            amount
          ) VALUES ($1, $2, $3, $4, $5, $6)`,
          [
            creditRequest.id,
            item.invoice_id || null,
            item.appointment_id || null,
            item.description,
            item.reason,
            item.amount
          ]
        );
      }
    }

    // Log activity
    await locationPool.query(
      `INSERT INTO accounting_activity_log (document_type, document_id, action, performed_by, details, created_at)
       VALUES ('credit_request', $1, 'created', $2, $3, NOW())`,
      [
        creditRequest.id,
        req.user?.username || 'system',
        JSON.stringify({ amount, reason })
      ]
    );

    // Clear cache for credit requests
    await cache.clearCacheByPrefix('accounting:credit-requests');

    res.status(201).json({
      credit_request: {
        ...creditRequest,
        credit_request_number: creditRequestNumber
      }
    });
  } catch (error) {
    logger.error({ msg: 'Error creating credit request', error: error.message });
    res.status(500).json({ error: 'Failed to create credit request', details: error.message });
  }
}));

// Update credit request
router.put('/credit-requests/:id', auth, asyncHandler(async (req, res) => {
  try {
    const locationPool = req.locationPool || pool;
    const { id } = req.params;
    const { amount, reason, description, items, status } = req.body;

    const updates = [];
    const params = [];
    let paramIndex = 1;

    if (amount !== undefined) {
      params.push(amount);
      updates.push(`amount = $${paramIndex}`);
      paramIndex++;
    }

    if (reason !== undefined) {
      params.push(reason);
      updates.push(`reason = $${paramIndex}`);
      paramIndex++;
    }

    if (description !== undefined) {
      params.push(description);
      updates.push(`description = $${paramIndex}`);
      paramIndex++;
    }

    if (items !== undefined) {
      params.push(JSON.stringify(items));
      updates.push(`items = $${paramIndex}`);
      paramIndex++;
    }

    if (status !== undefined) {
      params.push(status);
      updates.push(`status = $${paramIndex}`);
      // If marking as paid, also set date_paid
      if (status === 'paid') {
        updates.push(`date_paid = NOW()`);
      }
      paramIndex++;
    }

    if (updates.length === 0) {
      return res.status(400).json({ error: 'No fields to update' });
    }

    params.push(id);
    updates.push(`updated_at = NOW()`);

    // Get credit request before update to check if we need to record balance update
    const { rows: beforeRows } = await locationPool.query(
      `SELECT client_id, amount, status FROM credit_requests WHERE id = $1`,
      [id]
    );
    const beforeStatus = beforeRows.length > 0 ? beforeRows[0].status : null;
    const creditRequestBefore = beforeRows[0];

    await locationPool.query(
      `UPDATE credit_requests SET ${updates.join(', ')} WHERE id = $${paramIndex}`,
      params
    );

    // If status changed to 'paid', record balance update
    if (status === 'paid' && beforeStatus !== 'paid' && creditRequestBefore) {
      try {
        await balanceService.recordCreditRequestPayment(
          id,
          creditRequestBefore.client_id,
          parseFloat(creditRequestBefore.amount || 0),
          'manual', // Payment method unknown from PUT request
          null, // No Stripe transaction ID
          req.user?.username || 'system'
        );
      } catch (balanceError) {
        logger.error({
          msg: 'Error recording credit request payment balance update',
          id,
          error: balanceError.message
        });
        // Don't fail the request if balance update fails
      }
    }

    // Update items if provided
    if (items && Array.isArray(items)) {
      await locationPool.query(`DELETE FROM credit_request_items WHERE credit_request_id = $1`, [id]);
      for (const item of items) {
        await locationPool.query(
          `INSERT INTO credit_request_items (
            credit_request_id,
            invoice_id,
            appointment_id,
            description,
            reason,
            amount
          ) VALUES ($1, $2, $3, $4, $5, $6)`,
          [
            id,
            item.invoice_id || null,
            item.appointment_id || null,
            item.description,
            item.reason,
            item.amount
          ]
        );
      }
    }

    // Log activity
    await locationPool.query(
      `INSERT INTO accounting_activity_log (document_type, document_id, action, performed_by, details, created_at)
       VALUES ('credit_request', $1, 'updated', $2, $3, NOW())`,
      [
        id,
        req.user?.username || 'system',
        JSON.stringify({ updates })
      ]
    );

    // Clear cache for credit requests
    await cache.clearCacheByPrefix('accounting:credit-requests');

    const { rows } = await locationPool.query(`SELECT * FROM credit_requests WHERE id = $1`, [id]);
    res.json({ credit_request: rows[0] });
  } catch (error) {
    logger.error({ msg: 'Error updating credit request', id, error: error.message });
    res.status(500).json({ error: 'Failed to update credit request', details: error.message });
  }
}));

// Confirm credit request (move to confirmed state)
router.post('/credit-requests/:id/confirm', auth, asyncHandler(async (req, res) => {
  try {
    const locationPool = req.locationPool || pool;
    const { id } = req.params;

    await locationPool.query(
      `UPDATE credit_requests SET status = 'confirmed', updated_at = NOW() WHERE id = $1 AND status = 'draft'`,
      [id]
    );

    // Log activity
    await locationPool.query(
      `INSERT INTO accounting_activity_log (document_type, document_id, action, performed_by, created_at)
       VALUES ('credit_request', $1, 'confirmed', $2, NOW())`,
      [id, req.user?.username || 'system']
    );

    // Clear cache for credit requests
    await cache.clearCacheByPrefix('accounting:credit-requests');

    const { rows } = await locationPool.query(`SELECT * FROM credit_requests WHERE id = $1`, [id]);
    res.json({ credit_request: rows[0] });
  } catch (error) {
    logger.error({ msg: 'Error confirming credit request', id, error: error.message });
    res.status(500).json({ error: 'Failed to confirm credit request', details: error.message });
  }
}));

// Batch confirm credit requests (move multiple from draft to confirmed)
router.post('/credit-requests/batch-confirm', auth, asyncHandler(async (req, res) => {
  try {
    const locationPool = req.locationPool || pool;
    const { creditRequestIds } = req.body;

    if (!creditRequestIds || !Array.isArray(creditRequestIds) || creditRequestIds.length === 0) {
      return res.status(400).json({ error: 'creditRequestIds array is required' });
    }

    const { rows } = await locationPool.query(
      `UPDATE credit_requests 
       SET status = 'confirmed', 
           updated_at = NOW() 
       WHERE id = ANY($1) AND status = 'draft'
       RETURNING *`,
      [creditRequestIds]
    );

    // Log activity for each confirmed credit request
    for (const cr of rows) {
      await locationPool.query(
        `INSERT INTO accounting_activity_log (document_type, document_id, action, performed_by, created_at)
         VALUES ('credit_request', $1, 'confirmed', $2, NOW())`,
        [cr.id, req.user?.username || 'system']
      );
    }

    // Clear cache for credit requests
    await cache.clearCacheByPrefix('accounting:credit-requests');

    res.json({
      confirmed: rows.length,
      credit_requests: rows
    });
  } catch (error) {
    logger.error({ msg: 'Error batch confirming credit requests', error: error.message });
    res.status(500).json({ error: 'Failed to confirm credit requests', details: error.message });
  }
}));

// Raise credit request (move to raised state and send notifications)
router.post('/credit-requests/:id/raise', auth, asyncHandler(async (req, res) => {
  try {
    const locationPool = req.locationPool || pool;
    const { id } = req.params;

    const { rows: crRows } = await locationPool.query(
      `SELECT * FROM credit_requests WHERE id = $1`,
      [id]
    );

    if (crRows.length === 0) {
      return res.status(404).json({ error: 'Credit request not found' });
    }

    const creditRequest = crRows[0];

    await locationPool.query(
      `UPDATE credit_requests 
       SET status = 'raised', 
           date_raised = NOW(), 
           updated_at = NOW() 
       WHERE id = $1`,
      [id]
    );

    // Record balance update
    await balanceService.recordCreditRequestRaised(
      id,
      creditRequest.client_id,
      parseFloat(creditRequest.amount),
      req.user?.username || 'system'
    );

    // Send email notification
    try {
      await emailService.sendCreditRequestEmail(parseInt(id, 10), null, false);
    } catch (emailError) {
      logger.warn({ 
        msg: 'Credit request raised but email failed', 
        id, 
        error: emailError.message 
      });
      // Don't fail the request if email fails
    }

    // Log activity
    await locationPool.query(
      `INSERT INTO accounting_activity_log (document_type, document_id, action, performed_by, created_at)
       VALUES ('credit_request', $1, 'raised', $2, NOW())`,
      [id, req.user?.username || 'system']
    );

    // Clear cache for credit requests
    await cache.clearCacheByPrefix('accounting:credit-requests');

    const { rows } = await locationPool.query(`SELECT * FROM credit_requests WHERE id = $1`, [id]);
    res.json({ credit_request: rows[0] });
  } catch (error) {
    logger.error({ msg: 'Error raising credit request', id, error: error.message });
    res.status(500).json({ error: 'Failed to raise credit request', details: error.message });
  }
}));

// Batch raise confirmed credit requests (send notifications)
router.post('/credit-requests/batch-raise', auth, asyncHandler(async (req, res) => {
  try {
    const locationPool = req.locationPool || pool;
    const { creditRequestIds } = req.body;

    if (!creditRequestIds || !Array.isArray(creditRequestIds) || creditRequestIds.length === 0) {
      return res.status(400).json({ error: 'creditRequestIds array is required' });
    }

    // Update status to raised
    const { rows } = await locationPool.query(
      `UPDATE credit_requests 
       SET status = 'raised', 
           date_raised = NOW(), 
           updated_at = NOW() 
       WHERE id = ANY($1) AND status = 'confirmed'
       RETURNING *`,
      [creditRequestIds]
    );

    // Send email notifications and record balance updates
    const emailResults = [];
    for (const cr of rows) {
      try {
        await balanceService.recordCreditRequestRaised(
          cr.id,
          cr.client_id,
          parseFloat(cr.amount),
          req.user?.username || 'system'
        );
        await emailService.sendCreditRequestEmail(parseInt(cr.id, 10), null, false);
        emailResults.push({ id: cr.id, emailSent: true });
      } catch (emailError) {
        logger.warn({ 
          msg: 'Credit request raised but email failed', 
          id: cr.id, 
          error: emailError.message 
        });
        emailResults.push({ id: cr.id, emailSent: false, error: emailError.message });
      }

      // Log activity
      await locationPool.query(
        `INSERT INTO accounting_activity_log (document_type, document_id, action, performed_by, created_at)
         VALUES ('credit_request', $1, 'raised', $2, NOW())`,
        [cr.id, req.user?.username || 'system']
      );
    }

    res.json({ 
      raised: rows.length,
      credit_requests: rows,
      email_results: emailResults
    });
  } catch (error) {
    logger.error({ msg: 'Error batch raising credit requests', error: error.message });
    res.status(500).json({ error: 'Failed to raise credit requests', details: error.message });
  }
}));

// Process credit request payment/refund
router.post('/credit-requests/:id/pay', auth, asyncHandler(async (req, res) => {
  try {
    const { id } = req.params;
    const { payment_intent_id } = req.body;

    const result = await paymentService.processCreditRequestRefund(id, payment_intent_id);

    res.json(result);
  } catch (error) {
    logger.error({ msg: 'Error processing credit request payment', id, error: error.message });
    res.status(500).json({ error: 'Failed to process payment', details: error.message });
  }
}));

// Generate credit requests for clients with low balances (batch)
router.post('/credit-requests/generate-batch', auth, asyncHandler(async (req, res) => {
  try {
    const locationPool = req.locationPool || pool;
    const { clientIds, minimumBalance } = req.body;

    const CreditRequestGenerationService = require('../services/credit-request-generation-service');
    const creditRequestService = new CreditRequestGenerationService(locationPool);

    const result = await creditRequestService.generateCreditRequestsForLowBalanceClients({
      clientIds: clientIds || null,
      minimumBalance: minimumBalance || 0
    });

    res.json(result);
  } catch (error) {
    logger.error({ msg: 'Error generating batch credit requests', error: error.message });
    res.status(500).json({ error: 'Failed to generate credit requests', details: error.message });
  }
}));

// Send credit request email
router.post('/credit-requests/:id/send', auth, asyncHandler(async (req, res) => {
  try {
    const { id } = req.params;
    const { recipientEmail, forceSend } = req.body;

    // Allow forceSend for manual testing, but log it
    if (forceSend) {
      logger.warn({
        msg: 'Credit request email sending forced (bypassing feature flag)',
        creditRequestId: id,
        userId: req.user?.id,
        username: req.user?.username
      });
    }

    const result = await emailService.sendCreditRequestEmail(parseInt(id, 10), recipientEmail, forceSend || false);

    if (result.success) {
      res.json(result);
    } else {
      res.status(500).json(result);
    }
  } catch (error) {
    logger.error({ msg: 'Error sending credit request email', id, error: error.message });
    res.status(500).json({ error: 'Failed to send email', details: error.message });
  }
}));

// Generate credit request PDF
router.get('/credit-requests/:id/pdf', auth, asyncHandler(async (req, res) => {
  try {
    const { id } = req.params;
    const pdfBuffer = await pdfService.generateCreditRequestPDF(parseInt(id, 10));

    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', `attachment; filename="CreditRequest_${id}.pdf"`);
    res.send(pdfBuffer);
  } catch (error) {
    logger.error({ msg: 'Error generating credit request PDF', id, error: error.message });
    res.status(500).json({ error: 'Failed to generate PDF', details: error.message });
  }
}));

// Auto-generate draft credit requests from removed students
router.post('/credit-requests/generate-drafts', auth, asyncHandler(async (req, res) => {
  try {
    // This would query for students removed from lessons and create credit requests
    // Implementation depends on how student removals are tracked
    res.json({ message: 'Feature to be implemented based on student removal tracking' });
  } catch (error) {
    logger.error({ msg: 'Error generating draft credit requests', error: error.message });
    res.status(500).json({ error: 'Failed to generate drafts', details: error.message });
  }
}));

// ============================================================================
// INVOICES ENDPOINTS
// ============================================================================

// Get invoice by ID
router.get('/invoices/:id', auth, asyncHandler(async (req, res) => {
  try {
    const locationPool = req.locationPool || pool;
    const { id } = req.params;

    const { rows } = await locationPool.query(
      `SELECT 
        i.*,
        c.first_name as client_first_name,
        c.last_name as client_last_name,
        c.email as client_email
      FROM invoices i
      LEFT JOIN clients c ON i.client_id::text = c.client_id::text
      WHERE i.id = $1`,
      [id]
    );

    if (rows.length === 0) {
      return res.status(404).json({ error: 'Invoice not found' });
    }

    const invoice = rows[0];

    // Fetch items with appointment details
    let items = [];
    try {
      const { rows: itemsRows } = await locationPool.query(
        `SELECT 
          ii.*,
          a.start as appointment_start,
          a.finish as appointment_finish,
          a.topic as appointment_topic,
          s.name as service_name
        FROM invoice_items ii
        LEFT JOIN appointments a ON ii.appointment_id = a.appointment_id
        LEFT JOIN services s ON ii.service_id = s.service_id
        WHERE ii.invoice_id = $1 
        ORDER BY COALESCE(a.start, ii.item_date) ASC`,
        [id]
      );
      items = itemsRows;
    } catch (itemsError) {
      logger.warn({ msg: 'Error fetching invoice items', id, error: itemsError.message });
      items = [];
    }

    // Fetch balance updates related to this invoice
    let balanceUpdates = [];
    if (invoice.client_id) {
      try {
        const { rows: balanceRows } = await locationPool.query(
          `SELECT 
            bu.*,
            c.first_name as client_first_name,
            c.last_name as client_last_name,
            c.email as client_email
          FROM balance_updates bu
          LEFT JOIN clients c ON bu.client_id::text = c.client_id::text
          WHERE bu.client_id = $1 
            AND (bu.description LIKE '%invoice%' OR bu.description LIKE '%Invoice%' OR bu.related_invoice_id = $2)
          ORDER BY bu.created_at DESC`,
          [invoice.client_id, id]
        );
        balanceUpdates = balanceRows;
      } catch (balanceError) {
        logger.warn({ msg: 'Error fetching balance updates', id, error: balanceError.message });
        balanceUpdates = [];
      }
    }

    // Fetch activity log
    let activities = [];
    try {
      const { rows: activityRows } = await locationPool.query(
        `SELECT 
          aal.*,
          u.first_name || ' ' || u.last_name as performed_by_name
        FROM accounting_activity_log aal
        LEFT JOIN users u ON aal.performed_by = u.email
        WHERE aal.document_type = 'invoice' AND aal.document_id = $1 
        ORDER BY aal.created_at DESC`,
        [id]
      );
      activities = activityRows;
    } catch (activityError) {
      logger.warn({ msg: 'Error fetching activities', id, error: activityError.message });
      activities = [];
    }

    res.json({
      invoice: invoice,
      items: items,
      activities: activities,
      balanceUpdates: balanceUpdates
    });
  } catch (error) {
    logger.error({ msg: 'Error fetching invoice', id, error: error.message });
    res.status(500).json({ error: 'Failed to fetch invoice', details: error.message });
  }
}));

// Create draft invoice (manual)
router.post('/invoices', auth, asyncHandler(async (req, res) => {
  try {
    const locationPool = req.locationPool || pool;
    const { client_id, items, description } = req.body;

    if (!client_id || !items || items.length === 0) {
      return res.status(400).json({ error: 'client_id and items are required' });
    }

    // Get client info
    const { rows: clientRows } = await locationPool.query(
      `SELECT first_name, last_name, email FROM clients WHERE client_id = $1`,
      [client_id]
    );

    if (clientRows.length === 0) {
      return res.status(404).json({ error: 'Client not found' });
    }

    const clientInfo = clientRows[0];

    // Calculate totals
    let grossTotal = 0;
    let tutorTotal = 0;

    for (const item of items) {
      const amount = parseFloat(item.amount || 0);
      grossTotal += amount;
      tutorTotal += parseFloat(item.tutor_amount || 0);
    }

    const branchNet = grossTotal - tutorTotal;
    const tax = 0;

    // Create invoice
    const { rows: invoiceRows } = await locationPool.query(
      `INSERT INTO invoices (
        display_id,
        client_id,
        client_first_name,
        client_last_name,
        client_email,
        gross,
        net,
        tax,
        tutor_amount,
        branch_net_amount,
        status,
        date_created,
        items,
        description
      ) VALUES (
        $1, $2, $3, $4, $5, $6, $7, $8, $9, $10, 'draft', NOW(), $11, $12
      ) RETURNING *`,
      [
        `INV-${Date.now()}`,
        client_id,
        clientInfo.first_name,
        clientInfo.last_name,
        clientInfo.email,
        grossTotal,
        grossTotal - tax,
        tax,
        tutorTotal,
        branchNet,
        JSON.stringify(items),
        description
      ]
    );

    const invoice = invoiceRows[0];

    // Generate invoice number
    const invoiceNumber = `INV-${invoice.id}`;
    await locationPool.query(
      `UPDATE invoices SET invoice_number = $1 WHERE id = $2`,
      [invoiceNumber, invoice.id]
    );

    // Insert invoice items
    for (const item of items) {
      await locationPool.query(
        `INSERT INTO invoice_items (
          invoice_id,
          appointment_id,
          service_id,
          description,
          item_date,
          units,
          unit_price,
          amount,
          tax_amount,
          student_names,
          tutor_id,
          tutor_name
        ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12)`,
        [
          invoice.id,
          item.appointment_id || null,
          item.service_id || null,
          item.description,
          item.item_date || new Date(),
          item.units || 1,
          item.unit_price || item.amount,
          item.amount,
          item.tax_amount || 0,
          item.student_names || [],
          item.tutor_id || null,
          item.tutor_name || null
        ]
      );
    }

    // Log activity
    await locationPool.query(
      `INSERT INTO accounting_activity_log (document_type, document_id, action, performed_by, details, created_at)
       VALUES ('invoice', $1, 'created', $2, $3, NOW())`,
      [
        invoice.id,
        req.user?.username || 'system',
        JSON.stringify({ grossTotal, itemCount: items.length })
      ]
    );

    res.status(201).json({
      invoice: {
        ...invoice,
        invoice_number: invoiceNumber
      }
    });
  } catch (error) {
    logger.error({ msg: 'Error creating invoice', error: error.message });
    res.status(500).json({ error: 'Failed to create invoice', details: error.message });
  }
}));

// Update invoice
router.put('/invoices/:id', auth, asyncHandler(async (req, res) => {
  try {
    const locationPool = req.locationPool || pool;
    const { id } = req.params;
    const { items, description, status } = req.body;

    const updates = [];
    const params = [];
    let paramIndex = 1;

    if (items !== undefined && Array.isArray(items)) {
      // Recalculate totals
      let grossTotal = 0;
      let tutorTotal = 0;

      for (const item of items) {
        grossTotal += parseFloat(item.amount || 0);
        tutorTotal += parseFloat(item.tutor_amount || 0);
      }

      const branchNet = grossTotal - tutorTotal;
      params.push(grossTotal, grossTotal, 0, tutorTotal, branchNet, JSON.stringify(items));
      updates.push(`gross = $${paramIndex}`);
      paramIndex++;
      updates.push(`net = $${paramIndex}`);
      paramIndex++;
      updates.push(`tax = $${paramIndex}`);
      paramIndex++;
      updates.push(`tutor_amount = $${paramIndex}`);
      paramIndex++;
      updates.push(`branch_net_amount = $${paramIndex}`);
      paramIndex++;
      updates.push(`items = $${paramIndex}`);
      paramIndex++;

      // Update items table
      await locationPool.query(`DELETE FROM invoice_items WHERE invoice_id = $1`, [id]);
      for (const item of items) {
        await locationPool.query(
          `INSERT INTO invoice_items (
            invoice_id,
            appointment_id,
            service_id,
            description,
            item_date,
            units,
            unit_price,
            amount,
            tax_amount,
            student_names,
            tutor_id,
            tutor_name
          ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12)`,
          [
            id,
            item.appointment_id || null,
            item.service_id || null,
            item.description,
            item.item_date || new Date(),
            item.units || 1,
            item.unit_price || item.amount,
            item.amount,
            item.tax_amount || 0,
            item.student_names || [],
            item.tutor_id || null,
            item.tutor_name || null
          ]
        );
      }
    }

    if (description !== undefined) {
      params.push(description);
      updates.push(`description = $${paramIndex}`);
      paramIndex++;
    }

    if (status !== undefined) {
      params.push(status);
      updates.push(`status = $${paramIndex}`);
      paramIndex++;
    }

    if (updates.length === 0) {
      return res.status(400).json({ error: 'No fields to update' });
    }

    params.push(id);
    updates.push(`updated_at = NOW()`);

    await locationPool.query(
      `UPDATE invoices SET ${updates.join(', ')} WHERE id = $${paramIndex}`,
      params
    );

    // Log activity
    await locationPool.query(
      `INSERT INTO accounting_activity_log (document_type, document_id, action, performed_by, details, created_at)
       VALUES ('invoice', $1, 'updated', $2, $3, NOW())`,
      [
        id,
        req.user?.username || 'system',
        JSON.stringify({ updates })
      ]
    );

    const { rows } = await locationPool.query(`SELECT * FROM invoices WHERE id = $1`, [id]);
    res.json({ invoice: rows[0] });
  } catch (error) {
    logger.error({ msg: 'Error updating invoice', id, error: error.message });
    res.status(500).json({ error: 'Failed to update invoice', details: error.message });
  }
}));

// Confirm invoice (move from draft to confirmed)
router.post('/invoices/:id/confirm', auth, asyncHandler(async (req, res) => {
  try {
    const locationPool = req.locationPool || pool;
    const { id } = req.params;

    await locationPool.query(
      `UPDATE invoices 
       SET status = 'confirmed', 
           updated_at = NOW() 
       WHERE id = $1 AND status = 'draft'`,
      [id]
    );

    // Log activity
    await locationPool.query(
      `INSERT INTO accounting_activity_log (document_type, document_id, action, performed_by, created_at)
       VALUES ('invoice', $1, 'confirmed', $2, NOW())`,
      [id, req.user?.username || 'system']
    );

    const { rows } = await locationPool.query(`SELECT * FROM invoices WHERE id = $1`, [id]);
    res.json({ invoice: rows[0] });
  } catch (error) {
    logger.error({ msg: 'Error confirming invoice', id, error: error.message });
    res.status(500).json({ error: 'Failed to confirm invoice', details: error.message });
  }
}));

// Batch confirm invoices (move multiple from draft to confirmed)
router.post('/invoices/batch-confirm', auth, asyncHandler(async (req, res) => {
  try {
    const locationPool = req.locationPool || pool;
    const { invoiceIds } = req.body;

    if (!invoiceIds || !Array.isArray(invoiceIds) || invoiceIds.length === 0) {
      return res.status(400).json({ error: 'invoiceIds array is required' });
    }

    const { rows } = await locationPool.query(
      `UPDATE invoices 
       SET status = 'confirmed', 
           updated_at = NOW() 
       WHERE id = ANY($1) AND status = 'draft'
       RETURNING *`,
      [invoiceIds]
    );

    // Log activity for each confirmed invoice
    for (const inv of rows) {
      await locationPool.query(
        `INSERT INTO accounting_activity_log (document_type, document_id, action, performed_by, created_at)
         VALUES ('invoice', $1, 'confirmed', $2, NOW())`,
        [inv.id, req.user?.username || 'system']
      );
    }

    res.json({ 
      confirmed: rows.length,
      invoices: rows 
    });
  } catch (error) {
    logger.error({ msg: 'Error batch confirming invoices', error: error.message });
    res.status(500).json({ error: 'Failed to confirm invoices', details: error.message });
  }
}));

// Raise invoice (send notifications)
router.post('/invoices/:id/raise', auth, asyncHandler(async (req, res) => {
  try {
    const locationPool = req.locationPool || pool;
    const { id } = req.params;

    const { rows: invoiceRows } = await locationPool.query(
      `SELECT * FROM invoices WHERE id = $1`,
      [id]
    );

    if (invoiceRows.length === 0) {
      return res.status(404).json({ error: 'Invoice not found' });
    }

    const invoice = invoiceRows[0];

    await locationPool.query(
      `UPDATE invoices 
       SET status = 'raised', 
           date_sent = NOW(), 
           updated_at = NOW() 
       WHERE id = $1`,
      [id]
    );

    // Record balance update
    await balanceService.recordInvoiceRaised(
      id,
      invoice.client_id,
      parseFloat(invoice.gross),
      req.user?.username || 'system'
    );

    // Send email notification
    try {
      await emailService.sendInvoiceEmail(parseInt(id, 10), null, false);
    } catch (emailError) {
      logger.warn({ 
        msg: 'Invoice raised but email failed', 
        id, 
        error: emailError.message 
      });
      // Don't fail the request if email fails
    }

    // Log activity
    await locationPool.query(
      `INSERT INTO accounting_activity_log (document_type, document_id, action, performed_by, created_at)
       VALUES ('invoice', $1, 'raised', $2, NOW())`,
      [id, req.user?.username || 'system']
    );

    const { rows } = await locationPool.query(`SELECT * FROM invoices WHERE id = $1`, [id]);
    res.json({ invoice: rows[0] });
  } catch (error) {
    logger.error({ msg: 'Error raising invoice', id, error: error.message });
    res.status(500).json({ error: 'Failed to raise invoice', details: error.message });
  }
}));

// Batch raise confirmed invoices (send notifications)
router.post('/invoices/batch-raise', auth, asyncHandler(async (req, res) => {
  try {
    const locationPool = req.locationPool || pool;
    const { invoiceIds } = req.body;

    if (!invoiceIds || !Array.isArray(invoiceIds) || invoiceIds.length === 0) {
      return res.status(400).json({ error: 'invoiceIds array is required' });
    }

    // Update status to raised
    const { rows } = await locationPool.query(
      `UPDATE invoices 
       SET status = 'raised', 
           date_sent = NOW(), 
           updated_at = NOW() 
       WHERE id = ANY($1) AND status = 'confirmed'
       RETURNING *`,
      [invoiceIds]
    );

    // Send email notifications and record balance updates
    const emailResults = [];
    for (const inv of rows) {
      try {
        await balanceService.recordInvoiceRaised(
          inv.id,
          inv.client_id,
          parseFloat(inv.gross),
          req.user?.username || 'system'
        );
        await emailService.sendInvoiceEmail(parseInt(inv.id, 10), null, false);
        emailResults.push({ id: inv.id, emailSent: true });
      } catch (emailError) {
        logger.warn({ 
          msg: 'Invoice raised but email failed', 
          id: inv.id, 
          error: emailError.message 
        });
        emailResults.push({ id: inv.id, emailSent: false, error: emailError.message });
      }

      // Log activity
      await locationPool.query(
        `INSERT INTO accounting_activity_log (document_type, document_id, action, performed_by, created_at)
         VALUES ('invoice', $1, 'raised', $2, NOW())`,
        [inv.id, req.user?.username || 'system']
      );
    }

    res.json({ 
      raised: rows.length,
      invoices: rows,
      email_results: emailResults
    });
  } catch (error) {
    logger.error({ msg: 'Error batch raising invoices', error: error.message });
    res.status(500).json({ error: 'Failed to raise invoices', details: error.message });
  }
}));

// Send invoice email
router.post('/invoices/:id/send', auth, asyncHandler(async (req, res) => {
  try {
    const { id } = req.params;
    const { recipientEmail, forceSend } = req.body;

    // Allow forceSend for manual testing, but log it
    if (forceSend) {
      logger.warn({
        msg: 'Invoice email sending forced (bypassing feature flag)',
        invoiceId: id,
        userId: req.user?.id,
        username: req.user?.username
      });
    }

    const result = await emailService.sendInvoiceEmail(parseInt(id, 10), recipientEmail, forceSend || false);

    if (result.success) {
      res.json(result);
    } else {
      res.status(500).json(result);
    }
  } catch (error) {
    logger.error({ msg: 'Error sending invoice email', id, error: error.message });
    res.status(500).json({ error: 'Failed to send email', details: error.message });
  }
}));

// Process invoice payment
router.post('/invoices/:id/pay', auth, asyncHandler(async (req, res) => {
  try {
    const { id } = req.params;
    const { payment_intent_id } = req.body;

    if (payment_intent_id) {
      const result = await paymentService.processInvoicePayment(payment_intent_id);
      res.json(result);
    } else {
      // Create checkout session
      const APP_URL = process.env.APP_URL || 'https://analytics.chessat3.com';
      const result = await paymentService.createInvoiceCheckoutSession(
        parseInt(id, 10),
        `${APP_URL}/accounting/invoices/${id}/payment-success`,
        `${APP_URL}/accounting/invoices/${id}/payment-cancel`
      );
      res.json(result);
    }
  } catch (error) {
    logger.error({ msg: 'Error processing invoice payment', id, error: error.message });
    res.status(500).json({ error: 'Failed to process payment', details: error.message });
  }
}));

// Generate invoice PDF
router.get('/invoices/:id/pdf', auth, asyncHandler(async (req, res) => {
  const { id } = req.params;
  try {
    const locationPool = req.locationPool || pool;
    
    // Use location-aware pool for PDF generation
    const pdfBuffer = await pdfService.generateInvoicePDF(parseInt(id, 10), locationPool);

    // Validate PDF buffer before sending
    if (!pdfBuffer || !Buffer.isBuffer(pdfBuffer)) {
      throw new Error('Invalid PDF buffer returned from generation service');
    }

    if (pdfBuffer.length === 0) {
      throw new Error('PDF buffer is empty');
    }

    // Check PDF header (%PDF)
    const pdfHeader = pdfBuffer.slice(0, 4).toString();
    if (pdfHeader !== '%PDF') {
      logger.error({
        msg: 'Invalid PDF header detected',
        invoiceId: id,
        header: pdfHeader,
        bufferLength: pdfBuffer.length
      });
      throw new Error('Generated PDF has invalid format');
    }

    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', `inline; filename="Invoice_${id}.pdf"`);
    res.setHeader('Content-Length', pdfBuffer.length);
    res.setHeader('Cache-Control', 'no-cache');
    // CORS headers for Chrome iframe/embed support
    res.setHeader('X-Content-Type-Options', 'nosniff');
    const origin = req.get('Origin');
    if (origin && ["http://localhost:3000","https://acme-ops-main.herokuapp.com","https://acmeops-westside-cbc977fb06de.herokuapp.com","https://story-time-staging-784b74d757f2.herokuapp.com"].includes(origin)) {
      res.setHeader('Access-Control-Allow-Origin', origin);
    }
    res.setHeader('Access-Control-Allow-Methods', 'GET');
    res.send(pdfBuffer);
  } catch (error) {
    logger.error({
      msg: 'Error generating invoice PDF',
      id: id || 'unknown',
      error: error.message,
      stack: error.stack 
    });
    // Return error as JSON so frontend can handle it
    if (!res.headersSent) {
      res.status(500).json({ error: 'Failed to generate PDF', details: error.message });
    }
  }
}));

// Cancel pending payment (clear deferred payment date)
router.post('/invoices/:id/cancel-payment', auth, asyncHandler(async (req, res) => {
  try {
    const locationPool = req.locationPool || pool;
    const { id } = req.params;

    const { rows: invoiceRows } = await locationPool.query(
      `SELECT * FROM invoices WHERE id = $1`,
      [id]
    );

    if (invoiceRows.length === 0) {
      return res.status(404).json({ error: 'Invoice not found' });
    }

    const invoice = invoiceRows[0];

    // Clear deferred payment date
    await locationPool.query(
      `UPDATE invoices SET deferred_payment_date = NULL, updated_at = NOW() WHERE id = $1`,
      [id]
    );

    // Log activity
    await locationPool.query(
      `INSERT INTO accounting_activity_log (document_type, document_id, action, performed_by, details, created_at)
       VALUES ('invoice', $1, 'deferred_payment_cancelled', $2, $3, NOW())`,
      [id, req.user?.username || 'system', JSON.stringify({})]
    );

    res.json({
      success: true,
      message: 'Pending payment cancelled successfully'
    });
  } catch (error) {
    logger.error({ msg: 'Error cancelling pending payment', id, error: error.message });
    res.status(500).json({ error: 'Failed to cancel pending payment', details: error.message });
  }
}));

// Cancel invoice and create credit note
router.post('/invoices/:id/cancel', auth, asyncHandler(async (req, res) => {
  try {
    const locationPool = req.locationPool || pool;
    const { id } = req.params;
    const { reason } = req.body;

    const { rows: invoiceRows } = await locationPool.query(
      `SELECT * FROM invoices WHERE id = $1`,
      [id]
    );

    if (invoiceRows.length === 0) {
      return res.status(404).json({ error: 'Invoice not found' });
    }

    const invoice = invoiceRows[0];

    // Update invoice status
    await locationPool.query(
      `UPDATE invoices SET status = 'cancelled', updated_at = NOW() WHERE id = $1`,
      [id]
    );

    // Create credit request for the cancelled invoice
    const { rows: crRows } = await locationPool.query(
      `INSERT INTO credit_requests (
        display_id,
        client_id,
        client_first_name,
        client_last_name,
        client_email,
        amount,
        reason,
        description,
        status,
        date_created,
        items
      ) VALUES (
        $1, $2, $3, $4, $5, $6, $7, $8, 'draft', NOW(), $9
      ) RETURNING *`,
      [
        `PFI-${Date.now()}`,
        invoice.client_id,
        invoice.client_first_name,
        invoice.client_last_name,
        invoice.client_email,
        invoice.gross,
        reason || 'Invoice cancellation',
        `Credit note for cancelled invoice ${invoice.invoice_number || `INV-${id}`}`,
        JSON.stringify([])
      ]
    );

    const creditRequest = crRows[0];

    // Generate credit request number
    const creditRequestNumber = `PFI-${creditRequest.id}`;
    await locationPool.query(
      `UPDATE credit_requests SET credit_request_number = $1 WHERE id = $2`,
      [creditRequestNumber, creditRequest.id]
    );

    // Create credit request items from invoice items
    const { rows: invoiceItems } = await locationPool.query(
      `SELECT * FROM invoice_items WHERE invoice_id = $1`,
      [id]
    );

    for (const item of invoiceItems) {
      await locationPool.query(
        `INSERT INTO credit_request_items (
          credit_request_id,
          invoice_id,
          appointment_id,
          description,
          reason,
          amount
        ) VALUES ($1, $2, $3, $4, $5, $6)`,
        [
          creditRequest.id,
          id,
          item.appointment_id,
          item.description,
          reason || 'Invoice cancellation',
          item.amount
        ]
      );
    }

    // Log activities
    await locationPool.query(
      `INSERT INTO accounting_activity_log (document_type, document_id, action, performed_by, details, created_at)
       VALUES ('invoice', $1, 'cancelled', $2, $3, NOW())`,
      [id, req.user?.username || 'system', JSON.stringify({ credit_request_id: creditRequest.id })]
    );

    await locationPool.query(
      `INSERT INTO accounting_activity_log (document_type, document_id, action, performed_by, details, created_at)
       VALUES ('credit_request', $1, 'created', $2, $3, NOW())`,
      [creditRequest.id, req.user?.username || 'system', JSON.stringify({ from_invoice_id: id })]
    );

    res.json({
      invoice: { ...invoice, status: 'cancelled' },
      credit_request: { ...creditRequest, credit_request_number: creditRequestNumber }
    });
  } catch (error) {
    logger.error({ msg: 'Error cancelling invoice', id, error: error.message });
    res.status(500).json({ error: 'Failed to cancel invoice', details: error.message });
  }
}));

// Auto-generate invoices from lessons
router.post('/invoices/generate-from-lessons', auth, asyncHandler(async (req, res) => {
  try {
    const { startDate, endDate, regenerate, forceGenerate } = req.body;

    // Allow forceGenerate for manual testing, but log it
    if (forceGenerate) {
      logger.warn({
        msg: 'Invoice generation forced (bypassing feature flag)',
        userId: req.user?.id,
        username: req.user?.username
      });
    }

    const result = await invoiceGenService.generateInvoicesFromLessons({
      startDate: startDate ? new Date(startDate) : null,
      endDate: endDate ? new Date(endDate) : null,
      regenerate: regenerate || false,
      forceGenerate: forceGenerate || false
    });

    res.json(result);
  } catch (error) {
    logger.error({ msg: 'Error generating invoices from lessons', error: error.message });
    res.status(500).json({ error: 'Failed to generate invoices', details: error.message });
  }
}));

// ============================================================================
// PAYMENT ORDERS ENDPOINTS
// ============================================================================

// Get payment order by ID
router.get('/payment-orders/:id', auth, asyncHandler(async (req, res) => {
  try {
    const locationPool = req.locationPool || pool;
    const { id } = req.params;

    const { rows } = await locationPool.query(
      `SELECT * FROM payment_orders WHERE id = $1`,
      [id]
    );

    if (rows.length === 0) {
      return res.status(404).json({ error: 'Payment order not found' });
    }

    const paymentOrder = rows[0];

    // Fetch items from payment_order_charges table with appointment details
    let items = [];
    try {
      const { rows: itemsRows } = await locationPool.query(
        `SELECT 
          poc.*,
          a.start as appointment_start,
          a.finish as appointment_finish,
          a.topic as appointment_topic,
          s.name as service_name
        FROM payment_order_charges poc
        LEFT JOIN appointments a ON poc.appointment_id = a.appointment_id
        LEFT JOIN services s ON a.service_id = s.service_id
        WHERE poc.payment_order_id = $1 
        ORDER BY poc.date ASC, poc.charge_index ASC`,
        [id]
      );
      
      // Transform items to match frontend expectations
      items = itemsRows.map(item => ({
        ...item,
        item_date: item.date,
        description: item.appointment_topic || `Charge ${item.charge_index + 1}`,
        amount: parseFloat(item.amount) || 0,
        tax_amount: parseFloat(item.tax_amount) || 0,
        units: parseFloat(item.units) || 1,
        rate: parseFloat(item.rate) || 0,
      }));
    } catch (itemsError) {
      logger.warn({ msg: 'Error fetching payment order charges', id, error: itemsError.message });
      items = [];
    }

    // Fetch activity log
    let activities = [];
    try {
      const { rows: activityRows } = await locationPool.query(
        `SELECT 
          aal.*,
          u.first_name || ' ' || u.last_name as performed_by_name
        FROM accounting_activity_log aal
        LEFT JOIN users u ON aal.performed_by = u.email
        WHERE aal.document_type = 'payment_order' AND aal.document_id = $1 
        ORDER BY aal.created_at DESC`,
        [id]
      );
      activities = activityRows;
    } catch (activityError) {
      logger.warn({ msg: 'Error fetching activities', id, error: activityError.message });
      activities = [];
    }

    res.json({
      payment_order: paymentOrder,
      items: items,
      activities: activities
    });
  } catch (error) {
    logger.error({ msg: 'Error fetching payment order', id, error: error.message });
    res.status(500).json({ error: 'Failed to fetch payment order', details: error.message });
  }
}));

// Create draft payment order
router.post('/payment-orders', auth, asyncHandler(async (req, res) => {
  try {
    const locationPool = req.locationPool || pool;
    const { payee_id, items } = req.body;

    if (!payee_id || !items || items.length === 0) {
      return res.status(400).json({ error: 'payee_id and items are required' });
    }

    // Get tutor info
    const { rows: tutorRows } = await locationPool.query(
      `SELECT first_name, last_name, email FROM contractors WHERE contractor_id = $1`,
      [payee_id]
    );

    if (tutorRows.length === 0) {
      return res.status(404).json({ error: 'Tutor not found' });
    }

    const tutorInfo = tutorRows[0];

    // Calculate totals
    let totalToPayTutor = 0;
    let totalTax = 0;

    for (const item of items) {
      totalToPayTutor += parseFloat(item.amount || 0);
      totalTax += parseFloat(item.tax_amount || 0);
    }

    // Create payment order
    const { rows: poRows } = await locationPool.query(
      `INSERT INTO payment_orders (
        display_id,
        payee_id,
        payee_first,
        payee_last,
        payee_email,
        amount,
        total_to_pay_tutor,
        total_tax,
        total_to_charge_client,
        status,
        date_created,
        date_sent,
        url,
        items
      ) VALUES (
        $1, $2, $3, $4, $5, $6, $7, $8, $9, 'draft', NOW(), NULL, '', $10
      ) RETURNING *`,
      [
        `PO-${Date.now()}`,
        payee_id,
        tutorInfo.first_name,
        tutorInfo.last_name,
        tutorInfo.email,
        totalToPayTutor,
        totalToPayTutor,
        totalTax,
        0,
        JSON.stringify(items)
      ]
    );

    const paymentOrder = poRows[0];

    // Generate payment order number
    const paymentOrderNumber = `PO-${paymentOrder.id}`;
    await locationPool.query(
      `UPDATE payment_orders SET payment_order_number = $1 WHERE id = $2`,
      [paymentOrderNumber, paymentOrder.id]
    );

    // Insert payment order items
    for (const item of items) {
      await locationPool.query(
        `INSERT INTO payment_order_items (
          payment_order_id,
          appointment_id,
          adhoc_charge_id,
          description,
          item_date,
          units,
          rate,
          amount,
          tax_amount,
          sales_code,
          payer
        ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)`,
        [
          paymentOrder.id,
          item.appointment_id || null,
          item.adhoc_charge_id || null,
          item.description,
          item.item_date || new Date(),
          item.units || 1,
          item.rate,
          item.amount,
          item.tax_amount || 0,
          item.sales_code || 'hourly',
          item.payer || 'Client'
        ]
      );
    }

    // Log activity
    await locationPool.query(
      `INSERT INTO accounting_activity_log (document_type, document_id, action, performed_by, details, created_at)
       VALUES ('payment_order', $1, 'created', $2, $3, NOW())`,
      [
        paymentOrder.id,
        req.user?.username || 'system',
        JSON.stringify({ totalToPayTutor, itemCount: items.length })
      ]
    );

    res.status(201).json({
      payment_order: {
        ...paymentOrder,
        payment_order_number: paymentOrderNumber
      }
    });
  } catch (error) {
    logger.error({ msg: 'Error creating payment order', error: error.message });
    res.status(500).json({ error: 'Failed to create payment order', details: error.message });
  }
}));

// Update payment order
router.put('/payment-orders/:id', auth, asyncHandler(async (req, res) => {
  try {
    const locationPool = req.locationPool || pool;
    const { id } = req.params;
    const { items, status } = req.body;

    const updates = [];
    const params = [];
    let paramIndex = 1;

    if (items !== undefined && Array.isArray(items)) {
      // Recalculate totals
      let totalToPayTutor = 0;
      let totalTax = 0;

      for (const item of items) {
        totalToPayTutor += parseFloat(item.amount || 0);
        totalTax += parseFloat(item.tax_amount || 0);
      }

      params.push(totalToPayTutor, totalToPayTutor, totalTax, JSON.stringify(items));
      updates.push(`amount = $${paramIndex}`);
      paramIndex++;
      updates.push(`total_to_pay_tutor = $${paramIndex}`);
      paramIndex++;
      updates.push(`total_tax = $${paramIndex}`);
      paramIndex++;
      updates.push(`items = $${paramIndex}`);
      paramIndex++;

      // Update items table
      await locationPool.query(`DELETE FROM payment_order_items WHERE payment_order_id = $1`, [id]);
      for (const item of items) {
        await locationPool.query(
          `INSERT INTO payment_order_items (
            payment_order_id,
            appointment_id,
            adhoc_charge_id,
            description,
            item_date,
            units,
            rate,
            amount,
            tax_amount,
            sales_code,
            payer
          ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)`,
          [
            id,
            item.appointment_id || null,
            item.adhoc_charge_id || null,
            item.description,
            item.item_date || new Date(),
            item.units || 1,
            item.rate,
            item.amount,
            item.tax_amount || 0,
            item.sales_code || 'hourly',
            item.payer || 'Client'
          ]
        );
      }
    }

    if (status !== undefined) {
      params.push(status);
      updates.push(`status = $${paramIndex}`);
      paramIndex++;
    }

    if (updates.length === 0) {
      return res.status(400).json({ error: 'No fields to update' });
    }

    params.push(id);

    await locationPool.query(
      `UPDATE payment_orders SET ${updates.join(', ')} WHERE id = $${paramIndex}`,
      params
    );

    // Log activity
    await locationPool.query(
      `INSERT INTO accounting_activity_log (document_type, document_id, action, performed_by, details, created_at)
       VALUES ('payment_order', $1, 'updated', $2, $3, NOW())`,
      [
        id,
        req.user?.username || 'system',
        JSON.stringify({ updates })
      ]
    );

    const { rows } = await locationPool.query(`SELECT * FROM payment_orders WHERE id = $1`, [id]);
    res.json({ payment_order: rows[0] });
  } catch (error) {
    logger.error({ msg: 'Error updating payment order', id, error: error.message });
    res.status(500).json({ error: 'Failed to update payment order', details: error.message });
  }
}));

// Confirm payment order (move from draft to confirmed)
router.post('/payment-orders/:id/confirm', auth, asyncHandler(async (req, res) => {
  try {
    const locationPool = req.locationPool || pool;
    const { id } = req.params;

    await locationPool.query(
      `UPDATE payment_orders 
       SET status = 'confirmed' 
       WHERE id = $1 AND status = 'draft'`,
      [id]
    );

    // Log activity
    await locationPool.query(
      `INSERT INTO accounting_activity_log (document_type, document_id, action, performed_by, created_at)
       VALUES ('payment_order', $1, 'confirmed', $2, NOW())`,
      [id, req.user?.username || 'system']
    );

    const { rows } = await locationPool.query(`SELECT * FROM payment_orders WHERE id = $1`, [id]);
    res.json({ payment_order: rows[0] });
  } catch (error) {
    logger.error({ msg: 'Error confirming payment order', id, error: error.message });
    res.status(500).json({ error: 'Failed to confirm payment order', details: error.message });
  }
}));

// Batch confirm payment orders (move multiple from draft to confirmed)
router.post('/payment-orders/batch-confirm', auth, asyncHandler(async (req, res) => {
  try {
    const locationPool = req.locationPool || pool;
    const { paymentOrderIds } = req.body;

    if (!paymentOrderIds || !Array.isArray(paymentOrderIds) || paymentOrderIds.length === 0) {
      return res.status(400).json({ error: 'paymentOrderIds array is required' });
    }

    const { rows } = await locationPool.query(
      `UPDATE payment_orders 
       SET status = 'confirmed' 
       WHERE id = ANY($1) AND status = 'draft'
       RETURNING *`,
      [paymentOrderIds]
    );

    // Log activity for each confirmed payment order
    for (const po of rows) {
      await locationPool.query(
        `INSERT INTO accounting_activity_log (document_type, document_id, action, performed_by, created_at)
         VALUES ('payment_order', $1, 'confirmed', $2, NOW())`,
        [po.id, req.user?.username || 'system']
      );
    }

    res.json({ 
      confirmed: rows.length,
      payment_orders: rows 
    });
  } catch (error) {
    logger.error({ msg: 'Error batch confirming payment orders', error: error.message });
    res.status(500).json({ error: 'Failed to confirm payment orders', details: error.message });
  }
}));

// Raise payment order (send notifications)
router.post('/payment-orders/:id/raise', auth, asyncHandler(async (req, res) => {
  try {
    const locationPool = req.locationPool || pool;
    const { id } = req.params;

    await locationPool.query(
      `UPDATE payment_orders 
       SET status = 'raised', 
           date_sent = NOW() 
       WHERE id = $1`,
      [id]
    );

    // Send email notification
    try {
      await emailService.sendPaymentOrderEmail(parseInt(id, 10), null, false);
    } catch (emailError) {
      logger.warn({ 
        msg: 'Payment order raised but email failed', 
        id, 
        error: emailError.message 
      });
      // Don't fail the request if email fails
    }

    // Log activity
    await locationPool.query(
      `INSERT INTO accounting_activity_log (document_type, document_id, action, performed_by, created_at)
       VALUES ('payment_order', $1, 'raised', $2, NOW())`,
      [id, req.user?.username || 'system']
    );

    const { rows } = await locationPool.query(`SELECT * FROM payment_orders WHERE id = $1`, [id]);
    res.json({ payment_order: rows[0] });
  } catch (error) {
    logger.error({ msg: 'Error raising payment order', id, error: error.message });
    res.status(500).json({ error: 'Failed to raise payment order', details: error.message });
  }
}));

// Batch raise confirmed payment orders (send notifications)
router.post('/payment-orders/batch-raise', auth, asyncHandler(async (req, res) => {
  try {
    const locationPool = req.locationPool || pool;
    const { paymentOrderIds } = req.body;

    if (!paymentOrderIds || !Array.isArray(paymentOrderIds) || paymentOrderIds.length === 0) {
      return res.status(400).json({ error: 'paymentOrderIds array is required' });
    }

    // Update status to raised
    const { rows } = await locationPool.query(
      `UPDATE payment_orders 
       SET status = 'raised', 
           date_sent = NOW() 
       WHERE id = ANY($1) AND status = 'confirmed'
       RETURNING *`,
      [paymentOrderIds]
    );

    // Send email notifications for each raised payment order
    const emailResults = [];
    for (const po of rows) {
      try {
        await emailService.sendPaymentOrderEmail(parseInt(po.id, 10), null, false);
        emailResults.push({ id: po.id, emailSent: true });
      } catch (emailError) {
        logger.warn({ 
          msg: 'Payment order raised but email failed', 
          id: po.id, 
          error: emailError.message 
        });
        emailResults.push({ id: po.id, emailSent: false, error: emailError.message });
      }

      // Log activity
      await locationPool.query(
        `INSERT INTO accounting_activity_log (document_type, document_id, action, performed_by, created_at)
         VALUES ('payment_order', $1, 'raised', $2, NOW())`,
        [po.id, req.user?.username || 'system']
      );
    }

    res.json({ 
      raised: rows.length,
      payment_orders: rows,
      email_results: emailResults
    });
  } catch (error) {
    logger.error({ msg: 'Error batch raising payment orders', error: error.message });
    res.status(500).json({ error: 'Failed to raise payment orders', details: error.message });
  }
}));

// Send payment order email
router.post('/payment-orders/:id/send', auth, asyncHandler(async (req, res) => {
  try {
    const { id } = req.params;
    const { recipientEmail, forceSend } = req.body;

    // Allow forceSend for manual testing, but log it
    if (forceSend) {
      logger.warn({
        msg: 'Payment order email sending forced (bypassing feature flag)',
        paymentOrderId: id,
        userId: req.user?.id,
        username: req.user?.username
      });
    }

    const result = await emailService.sendPaymentOrderEmail(parseInt(id, 10), recipientEmail, forceSend || false);

    if (result.success) {
      // If successful, ensure status is at least 'sent' if it was 'raised'
      const locationPool = req.locationPool || pool;
      await locationPool.query(
        `UPDATE payment_orders 
         SET status = 'sent', date_sent = COALESCE(date_sent, NOW()) 
         WHERE id = $1 AND status = 'raised'`,
        [id]
      );
      
      res.json(result);
    } else {
      res.status(500).json(result);
    }
  } catch (error) {
    logger.error({ msg: 'Error sending payment order email', paymentOrderId: req.params.id, error: error.message });
    res.status(500).json({ error: 'Failed to send email', details: error.message });
  }
}));

// Add to pay run
router.post('/payment-orders/:id/add-to-pay-run', auth, asyncHandler(async (req, res) => {
  try {
    const locationPool = req.locationPool || pool;
    const { id } = req.params;

    const { rows } = await locationPool.query(
      `UPDATE payment_orders 
       SET status = 'in_pay_run'
       WHERE id = $1
       RETURNING *`,
      [id]
    );

    if (rows.length === 0) {
      return res.status(404).json({ error: 'Payment order not found' });
    }

    // Log activity
    await locationPool.query(
      `INSERT INTO accounting_activity_log (document_type, document_id, action, performed_by, created_at)
       VALUES ('payment_order', $1, 'added_to_pay_run', $2, NOW())`,
      [id, req.user?.username || 'system']
    );

    res.json({ payment_order: rows[0] });
  } catch (error) {
    logger.error({ msg: 'Error adding payment order to pay run', paymentOrderId: req.params.id, error: error.message });
    res.status(500).json({ error: 'Failed to add to pay run', details: error.message });
  }
}));

// Mark payment order as paid
router.post('/payment-orders/:id/mark-paid', auth, asyncHandler(async (req, res) => {
  try {
    const locationPool = req.locationPool || pool;
    const { id } = req.params;

    const { rows } = await locationPool.query(
      `UPDATE payment_orders 
       SET status = 'paid', 
           date_paid = NOW(), 
           still_to_pay = 0
       WHERE id = $1
       RETURNING *`,
      [id]
    );

    if (rows.length === 0) {
      return res.status(404).json({ error: 'Payment order not found' });
    }

    // Log activity
    await locationPool.query(
      `INSERT INTO accounting_activity_log (document_type, document_id, action, performed_by, created_at)
       VALUES ('payment_order', $1, 'marked_paid', $2, NOW())`,
      [id, req.user?.username || 'system']
    );

    res.json({ payment_order: rows[0] });
  } catch (error) {
    logger.error({ msg: 'Error marking payment order as paid', paymentOrderId: req.params.id, error: error.message });
    res.status(500).json({ error: 'Failed to mark as paid', details: error.message });
  }
}));

// Mark payment order as void
router.post('/payment-orders/:id/void', auth, asyncHandler(async (req, res) => {
  try {
    const locationPool = req.locationPool || pool;
    const { id } = req.params;

    const { rows } = await locationPool.query(
      `UPDATE payment_orders 
       SET status = 'void', 
           date_void = NOW()
       WHERE id = $1
       RETURNING *`,
      [id]
    );

    if (rows.length === 0) {
      return res.status(404).json({ error: 'Payment order not found' });
    }

    // Log activity
    await locationPool.query(
      `INSERT INTO accounting_activity_log (document_type, document_id, action, performed_by, created_at)
       VALUES ('payment_order', $1, 'voided', $2, NOW())`,
      [id, req.user?.username || 'system']
    );

    res.json({ payment_order: rows[0] });
  } catch (error) {
    logger.error({ msg: 'Error voiding payment order', paymentOrderId: req.params.id, error: error.message });
    res.status(500).json({ error: 'Failed to void payment order', details: error.message });
  }
}));

// Generate payment order PDF
router.get('/payment-orders/:id/pdf', auth, asyncHandler(async (req, res) => {
  try {
    const { id } = req.params;
    const locationPool = req.locationPool || pool;
    
    // Use location-aware pool for PDF generation
    const pdfBuffer = await pdfService.generatePaymentOrderPDF(parseInt(id, 10), locationPool);

    // Validate PDF buffer before sending
    if (!pdfBuffer || !Buffer.isBuffer(pdfBuffer)) {
      throw new Error('Invalid PDF buffer returned from generation service');
    }

    if (pdfBuffer.length === 0) {
      throw new Error('PDF buffer is empty');
    }

    // Check PDF header (%PDF)
    const pdfHeader = pdfBuffer.slice(0, 4).toString();
    if (pdfHeader !== '%PDF') {
      logger.error({
        msg: 'Invalid PDF header detected',
        paymentOrderId: id,
        header: pdfHeader,
        bufferLength: pdfBuffer.length
      });
      throw new Error('Generated PDF has invalid format');
    }

    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', `inline; filename="PaymentOrder_${id}.pdf"`);
    res.setHeader('Content-Length', pdfBuffer.length);
    res.setHeader('Cache-Control', 'no-cache');
    // CORS headers for Chrome iframe/embed support
    res.setHeader('X-Content-Type-Options', 'nosniff');
    const origin = req.get('Origin');
    if (origin && ["http://localhost:3000","https://acme-ops-main.herokuapp.com","https://acmeops-westside-cbc977fb06de.herokuapp.com","https://story-time-staging-784b74d757f2.herokuapp.com"].includes(origin)) {
      res.setHeader('Access-Control-Allow-Origin', origin);
    }
    res.setHeader('Access-Control-Allow-Methods', 'GET');
    res.send(pdfBuffer);
  } catch (error) {
    logger.error({
      msg: 'Error generating payment order PDF',
      id: id || 'unknown',
      error: error.message, 
      stack: error.stack 
    });
    if (!res.headersSent) {
      res.status(500).json({ error: 'Failed to generate PDF', details: error.message });
    }
  }
}));

// Auto-generate payment orders from lessons
router.post('/payment-orders/generate-from-lessons', auth, asyncHandler(async (req, res) => {
  try {
    const { startDate, endDate, regenerate, forceGenerate } = req.body;

    // Allow forceGenerate for manual testing, but log it
    if (forceGenerate) {
      logger.warn({
        msg: 'Payment order generation forced (bypassing feature flag)',
        userId: req.user?.id,
        username: req.user?.username
      });
    }

    const result = await paymentOrderGenService.generatePaymentOrdersFromLessons({
      startDate: startDate ? new Date(startDate) : null,
      endDate: endDate ? new Date(endDate) : null,
      regenerate: regenerate || false,
      forceGenerate: forceGenerate || false
    });

    res.json(result);
  } catch (error) {
    logger.error({ msg: 'Error generating payment orders from lessons', error: error.message });
    res.status(500).json({ error: 'Failed to generate payment orders', details: error.message });
  }
}));

// ============================================================================
// BALANCE MANAGEMENT ENDPOINTS
// ============================================================================

// Get client balance by client ID
router.get('/client-balances/:clientId', auth, asyncHandler(async (req, res) => {
  try {
    const locationPool = req.locationPool || pool;
    const { clientId } = req.params;

    const balance = await balanceService.getCurrentBalance(parseInt(clientId, 10));
    const history = await balanceService.getBalanceHistory(parseInt(clientId, 10), { limit: 50 });

    res.json({
      balance: balance,
      history: history
    });
  } catch (error) {
    logger.error({ msg: 'Error fetching client balance', clientId, error: error.message });
    res.status(500).json({ error: 'Failed to fetch client balance', details: error.message });
  }
}));

// Manual balance adjustment
router.post('/balance-updates', auth, asyncHandler(async (req, res) => {
  try {
    const { clientId, updateType, changeAmount, balanceType, description } = req.body;

    if (!clientId || !updateType || changeAmount === undefined) {
      return res.status(400).json({ error: 'clientId, updateType, and changeAmount are required' });
    }

    const result = await balanceService.updateClientBalance({
      clientId: parseInt(clientId, 10),
      updateType,
      changeAmount: parseFloat(changeAmount),
      balanceType: balanceType || 'invoice_balance',
      description: description || 'Manual adjustment',
      createdBy: req.user?.username || 'system'
    });

    res.json({ balance_update: result });
  } catch (error) {
    logger.error({ msg: 'Error creating balance update', error: error.message });
    res.status(500).json({ error: 'Failed to create balance update', details: error.message });
  }
}));

// ============================================================================
// PAYMENT PROCESSING ENDPOINTS
// ============================================================================

// Process invoice payment via Stripe
router.post('/payments/process-invoice', auth, asyncHandler(async (req, res) => {
  try {
    const { payment_intent_id } = req.body;

    if (!payment_intent_id) {
      return res.status(400).json({ error: 'payment_intent_id is required' });
    }

    const result = await paymentService.processInvoicePayment(payment_intent_id);
    res.json(result);
  } catch (error) {
    logger.error({ msg: 'Error processing invoice payment', error: error.message });
    res.status(500).json({ error: 'Failed to process payment', details: error.message });
  }
}));

// Process credit request refund via Stripe
router.post('/payments/process-credit', auth, asyncHandler(async (req, res) => {
  try {
    const { credit_request_id, payment_intent_id } = req.body;

    if (!credit_request_id) {
      return res.status(400).json({ error: 'credit_request_id is required' });
    }

    const result = await paymentService.processCreditRequestRefund(
      parseInt(credit_request_id, 10),
      payment_intent_id
    );
    res.json(result);
  } catch (error) {
    logger.error({ msg: 'Error processing credit request refund', error: error.message });
    res.status(500).json({ error: 'Failed to process refund', details: error.message });
  }
}));

module.exports = router;

