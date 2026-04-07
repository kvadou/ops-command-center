/**
 * Invoice Generation Service
 * Automatically generates invoices from completed lessons/appointments
 */

const { logger } = require('../utils/logger');
const BalanceCalculationService = require('./balance-calculation-service');

class InvoiceGenerationService {
  constructor(pool) {
    this.pool = pool;
    this.balanceService = new BalanceCalculationService(pool);
  }

  /**
   * Check if standalone accounting is enabled (feature flag)
   * @returns {boolean} True if standalone accounting is enabled
   */
  isStandaloneAccountingEnabled() {
    // Feature flag: Set STANDALONE_ACCOUNTING_ENABLED=true to enable
    // When false/undefined, all accounting operations go through TutorCruncher
    return process.env.STANDALONE_ACCOUNTING_ENABLED === 'true';
  }

  /**
   * Generate invoices from completed lessons for a date range
   * @param {Object} options - Generation options
   * @param {Date} options.startDate - Start date for lessons
   * @param {Date} options.endDate - End date for lessons
   * @param {boolean} options.regenerate - If true, regenerate invoices for lessons that already have invoices
   * @param {boolean} options.forceGenerate - Force generation even if feature flag is disabled (for testing)
   * @returns {Promise<Object>} Generation result
   */
  async generateInvoicesFromLessons(options = {}) {
    const {
      startDate,
      endDate,
      regenerate = false,
      forceGenerate = false
    } = options;

    // Check feature flag unless forceGenerate is true
    if (!forceGenerate && !this.isStandaloneAccountingEnabled()) {
      logger.warn({
        msg: 'Standalone accounting invoice generation is disabled',
        reason: 'STANDALONE_ACCOUNTING_ENABLED is not set to true'
      });
      throw new Error('Standalone accounting is not enabled. Set STANDALONE_ACCOUNTING_ENABLED=true to enable automatic invoice generation.');
    }

    const client = await this.pool.connect();
    try {
      await client.query('BEGIN');

      // Build query to find completed appointments that need invoicing
      let query = `
        SELECT DISTINCT
          ar.paying_client_id as client_id,
          c.first_name as client_first_name,
          c.last_name as client_last_name,
          c.email as client_email
        FROM appointments a
        INNER JOIN appointment_recipients ar ON a.appointment_id = ar.appointment_id
        LEFT JOIN clients c ON ar.paying_client_id::text = c.client_id::text
        WHERE a.status IN ('complete', 'completed', 'cancelled-chargeable')
          AND a.is_deleted IS NOT TRUE
          AND ar.status <> 'missed'
          AND ar.paying_client_id IS NOT NULL
      `;

      const params = [];
      let paramIndex = 1;

      if (startDate) {
        params.push(startDate);
        query += ` AND DATE(a.start) >= $${paramIndex}`;
        paramIndex++;
      }

      if (endDate) {
        params.push(endDate);
        query += ` AND DATE(a.start) <= $${paramIndex}`;
        paramIndex++;
      }

      if (!regenerate) {
        // Exclude appointments that already have invoices
        query += `
          AND NOT EXISTS (
            SELECT 1 FROM invoice_items ii
            WHERE ii.appointment_id = a.appointment_id
          )
        `;
      }

      query += ` ORDER BY ar.paying_client_id`;

      const { rows: clientGroups } = await client.query(query, params);

      const results = {
        invoicesCreated: 0,
        invoicesUpdated: 0,
        errors: [],
        invoiceIds: []
      };

      // Generate invoice for each client
      for (const clientGroup of clientGroups) {
        try {
          const invoiceResult = await this.generateInvoiceForClient(
            client,
            clientGroup.client_id,
            {
              startDate,
              endDate,
              regenerate
            }
          );

          if (invoiceResult.created) {
            results.invoicesCreated++;
          } else if (invoiceResult.updated) {
            results.invoicesUpdated++;
          }

          if (invoiceResult.invoiceId) {
            results.invoiceIds.push(invoiceResult.invoiceId);
          }
        } catch (error) {
          logger.error({
            msg: 'Error generating invoice for client',
            clientId: clientGroup.client_id,
            error: error.message
          });
          results.errors.push({
            clientId: clientGroup.client_id,
            error: error.message
          });
        }
      }

      await client.query('COMMIT');

      // Only log if there are errors or significant results
      if (results.errors.length > 0 || results.invoicesCreated > 0 || results.invoicesUpdated > 0) {
        logger.info({
          msg: 'Invoice generation completed',
          invoicesCreated: results.invoicesCreated,
          invoicesUpdated: results.invoicesUpdated,
          errors: results.errors.length
        });
      }

      return results;
    } catch (error) {
      await client.query('ROLLBACK');
      logger.error({
        msg: 'Error generating invoices from lessons',
        error: error.message
      });
      throw error;
    } finally {
      client.release();
    }
  }

  /**
   * Generate invoice for a specific client
   * @param {Object} client - Database client connection
   * @param {number} clientId - Client ID
   * @param {Object} options - Generation options
   * @returns {Promise<Object>} Invoice generation result
   */
  async generateInvoiceForClient(client, clientId, options = {}) {
    const { startDate, endDate, regenerate = false, specificAppointmentIds = null } = options;

    // Fetch completed appointments for this client
    let appointmentsQuery = `
      SELECT 
        a.appointment_id,
        a.start,
        a.finish,
        a.units,
        a.topic,
        a.service_id,
        s.name as service_name,
        s.dft_charge_type,
        ar.charge_rate,
        ar.recipient_name,
        ar.recipient_id,
        ac.contractor_id,
        ac.contractor_name,
        ac.pay_rate,
        s.dft_contractor_rate,
        s.labels as service_labels
      FROM appointments a
      INNER JOIN appointment_recipients ar ON a.appointment_id = ar.appointment_id
      LEFT JOIN services s ON a.service_id = s.service_id
      LEFT JOIN appointment_contractors ac ON a.appointment_id = ac.appointment_id
      WHERE a.status IN ('complete', 'completed', 'cancelled-chargeable')
        AND (a.is_deleted IS NULL OR a.is_deleted IS FALSE)
        AND ar.status <> 'missed'
        AND ar.paying_client_id = $1
    `;

    const params = [clientId];
    let paramIndex = 2;

    if (startDate) {
      params.push(startDate);
      appointmentsQuery += ` AND DATE(a.start) >= $${paramIndex}`;
      paramIndex++;
    }

    if (endDate) {
      params.push(endDate);
      appointmentsQuery += ` AND DATE(a.start) <= $${paramIndex}`;
      paramIndex++;
    }

      if (!regenerate) {
        appointmentsQuery += `
          AND NOT EXISTS (
            SELECT 1 FROM invoice_items ii
            WHERE ii.appointment_id = a.appointment_id
          )
        `;
      }

      // If specific appointment IDs provided, only include those
      if (specificAppointmentIds && specificAppointmentIds.length > 0) {
        params.push(specificAppointmentIds);
        appointmentsQuery += ` AND a.appointment_id = ANY($${paramIndex})`;
        paramIndex++;
      }
      
      // Ensure we have valid appointments
      appointmentsQuery += ` AND a.appointment_id IS NOT NULL`;

    appointmentsQuery += ` ORDER BY a.start ASC`;

    const { rows: appointments } = await client.query(appointmentsQuery, params);

    if (appointments.length === 0) {
      return {
        created: false,
        updated: false,
        invoiceId: null,
        message: 'No appointments found for invoicing'
      };
    }

    // Calculate totals
    let grossTotal = 0;
    let tutorTotal = 0;
    const items = [];

    for (const apt of appointments) {
      // Calculate charge amount
      let chargeAmount = 0;
      if (apt.dft_charge_type === 'hourly' || apt.dft_charge_type === 'hourly-split') {
        chargeAmount = parseFloat(apt.charge_rate || 0) * parseFloat(apt.units || 0);
      } else {
        chargeAmount = parseFloat(apt.charge_rate || 0);
      }

      // Calculate tutor pay
      let tutorPay = 0;
      const tutorRate = parseFloat(apt.pay_rate || apt.dft_contractor_rate || 0);
      if (apt.dft_charge_type === 'hourly' || apt.dft_charge_type === 'hourly-split') {
        tutorPay = tutorRate * parseFloat(apt.units || 0);
      } else {
        tutorPay = tutorRate;
      }

      grossTotal += chargeAmount;
      tutorTotal += tutorPay;

      items.push({
        appointment_id: apt.appointment_id,
        service_id: apt.service_id,
        description: apt.topic || apt.service_name || 'Lesson',
        item_date: apt.start,
        units: parseFloat(apt.units || 1),
        unit_price: chargeAmount / parseFloat(apt.units || 1),
        amount: chargeAmount,
        tax_amount: 0,
        student_names: apt.recipient_name ? [apt.recipient_name] : [],
        tutor_id: apt.contractor_id,
        tutor_name: apt.contractor_name
      });
    }

    const branchNet = grossTotal - tutorTotal;
    const tax = 0; // Tax calculation can be added later if needed

    // Check if invoice already exists for this client and date range
    const { rows: existingInvoices } = await client.query(
      `SELECT id FROM invoices 
       WHERE client_id = $1 
         AND status = 'draft'
         AND date_created >= $2
         AND date_created <= $3
       ORDER BY date_created DESC
       LIMIT 1`,
      [clientId, startDate || new Date(Date.now() - 30 * 24 * 60 * 60 * 1000), endDate || new Date()]
    );

    let invoiceId;
    let isNew = false;

    if (existingInvoices.length > 0 && !regenerate) {
      // Update existing draft invoice
      invoiceId = existingInvoices[0].id;
      await client.query(
        `UPDATE invoices 
         SET gross = $1,
             net = $2,
             tax = $3,
             tutor_amount = $4,
             branch_net_amount = $5,
             items = $6
         WHERE id = $7`,
        [
          grossTotal,
          grossTotal - tax,
          tax,
          tutorTotal,
          branchNet,
          JSON.stringify(items),
          invoiceId
        ]
      );

      // Delete old items and create new ones
      await client.query(`DELETE FROM invoice_items WHERE invoice_id = $1`, [invoiceId]);
    } else {
      // Generate invoice ID (negative for local-only, positive for TutorCruncher)
      // Check if this is a local-only client (negative client_id)
      const isLocalOnly = parseInt(clientId) < 0;
      
      if (isLocalOnly) {
        // Generate negative ID for local-only invoices
        const maxLocalIdResult = await client.query(`
          SELECT MIN(id) as min_id 
          FROM invoices 
          WHERE id < 0
        `);
        const minLocalId = maxLocalIdResult.rows[0]?.min_id ?? -1000000;
        invoiceId = minLocalId - 1;
      } else {
        // For TutorCruncher clients, try to use a sequence or generate positive ID
        // First check if there's a sequence
        const sequenceCheck = await client.query(`
          SELECT EXISTS (
            SELECT 1 FROM pg_sequences WHERE sequencename = 'invoices_id_seq'
          )
        `);
        
        if (sequenceCheck.rows[0].exists) {
          // Use sequence
          const seqResult = await client.query(`SELECT nextval('invoices_id_seq') as next_id`);
          invoiceId = parseInt(seqResult.rows[0].next_id);
        } else {
          // Generate positive ID based on max existing ID
          const maxIdResult = await client.query(`SELECT MAX(id) as max_id FROM invoices WHERE id > 0`);
          const maxId = maxIdResult.rows[0]?.max_id ?? 0;
          invoiceId = maxId + 1;
        }
      }

      // Create new invoice with explicit ID
      await client.query(
        `INSERT INTO invoices (
          id,
          display_id,
          invoice_number,
          client_id,
          client_first_name,
          client_last_name,
          client_email,
          gross,
          net,
          tax,
          tutor_amount,
          branch_net_amount,
          affiliate_amount,
          branch_tax,
          status,
          date_created,
          items
        ) VALUES (
          $1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, 'draft', NOW(), $15
        )`,
        [
          invoiceId,
          `INV-${Date.now()}`,
          null, // Will be set by trigger or update
          clientId,
          appointments[0].client_first_name,
          appointments[0].client_last_name,
          appointments[0].client_email,
          grossTotal,
          grossTotal - tax,
          tax,
          tutorTotal,
          branchNet,
          0,
          0,
          JSON.stringify(items)
        ]
      );

      // Generate invoice number
      const invoiceNumber = `INV-${invoiceId}`;
      await client.query(
        `UPDATE invoices SET invoice_number = $1 WHERE id = $2`,
        [invoiceNumber, invoiceId]
      );

      isNew = true;
    }

    // Insert invoice items
    for (const item of items) {
      await client.query(
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
          invoiceId,
          item.appointment_id,
          item.service_id,
          item.description,
          item.item_date,
          item.units,
          item.unit_price,
          item.amount,
          item.tax_amount,
          item.student_names,
          item.tutor_id,
          item.tutor_name
        ]
      );
    }

    return {
      created: isNew,
      updated: !isNew,
      invoiceId,
      grossTotal,
      tutorTotal,
      branchNet,
      itemCount: items.length
    };
  }

  /**
   * Generate invoice for a single completed lesson/appointment
   * Called automatically when lesson is marked complete
   * @param {number|string} appointmentId - Appointment ID (can be string for local-only lessons)
   * @param {boolean} forceGenerate - Force generation even if feature flag is disabled (for local-only lessons)
   * @returns {Promise<Object>} Invoice generation result
   */
  async generateInvoiceForCompletedLesson(appointmentId, forceGenerate = false) {
    // Check feature flag unless forceGenerate is true (for local-only lessons)
    if (!forceGenerate && !this.isStandaloneAccountingEnabled()) {
      logger.warn({
        msg: 'Standalone accounting invoice generation is disabled',
        reason: 'STANDALONE_ACCOUNTING_ENABLED is not set to true',
        appointmentId
      });
      // For local-only lessons, we still want to generate invoices even if flag is not set
      // This allows testing in local environment
      const isLocalOnly = typeof appointmentId === 'string' && appointmentId.startsWith('-');
      if (!isLocalOnly) {
        throw new Error('Standalone accounting is not enabled. Set STANDALONE_ACCOUNTING_ENABLED=true to enable automatic invoice generation.');
      }
    }

    const client = await this.pool.connect();
    try {
      await client.query('BEGIN');

      // Get appointment with all recipients (students/clients)
      const { rows: appointmentRows } = await client.query(
        `SELECT 
          a.appointment_id,
          a.start,
          a.finish,
          a.units,
          a.topic,
          a.service_id,
          a.status,
          s.name as service_name,
          s.dft_charge_type,
          ar.paying_client_id,
          ar.charge_rate,
          ar.recipient_name,
          ar.recipient_id,
          ar.status as recipient_status,
          c.first_name as client_first_name,
          c.last_name as client_last_name,
          c.email as client_email
        FROM appointments a
        INNER JOIN appointment_recipients ar ON a.appointment_id = ar.appointment_id
        LEFT JOIN services s ON a.service_id = s.service_id
        LEFT JOIN clients c ON ar.paying_client_id::text = c.client_id::text
        WHERE a.appointment_id = $1
          AND ar.status <> 'missed'
          AND ar.paying_client_id IS NOT NULL`,
        [appointmentId]
      );

      if (appointmentRows.length === 0) {
        client.release();
        return {
          created: false,
          updated: false,
          invoiceIds: [],
          message: 'No valid recipients found for this appointment'
        };
      }

      // Group by paying_client_id (each client gets their own invoice)
      const clientGroups = {};
      for (const row of appointmentRows) {
        const clientId = row.paying_client_id;
        if (!clientGroups[clientId]) {
          clientGroups[clientId] = {
            client_id: clientId,
            client_first_name: row.client_first_name,
            client_last_name: row.client_last_name,
            client_email: row.client_email,
            appointments: []
          };
        }
        clientGroups[clientId].appointments.push(row);
      }

      const results = {
        created: false,
        updated: false,
        invoiceIds: [],
        errors: []
      };

      // Generate invoice for each client
      for (const [clientId, clientGroup] of Object.entries(clientGroups)) {
        try {
          // Use existing generateInvoiceForClient method with single appointment
          const invoiceResult = await this.generateInvoiceForClient(
            client,
            clientId,
            {
              startDate: null,
              endDate: null,
              regenerate: false,
              specificAppointmentIds: [appointmentId] // Only include this appointment
            }
          );

          if (invoiceResult.created) {
            results.created = true;
          } else if (invoiceResult.updated) {
            results.updated = true;
          }

          if (invoiceResult.invoiceId) {
            results.invoiceIds.push(invoiceResult.invoiceId);
          }
        } catch (error) {
          logger.error({
            msg: 'Error generating invoice for completed lesson',
            appointmentId,
            clientId,
            error: error.message
          });
          results.errors.push({
            clientId,
            error: error.message
          });
        }
      }

      await client.query('COMMIT');
      return results;
    } catch (error) {
      await client.query('ROLLBACK');
      logger.error({
        msg: 'Error generating invoice for completed lesson',
        appointmentId,
        error: error.message,
        stack: error.stack
      });
      throw error;
    } finally {
      client.release();
    }
  }
}

module.exports = InvoiceGenerationService;
