/**
 * Payment Order Generation Service
 * Automatically generates payment orders for tutors from completed lessons
 */

const { logger } = require('../utils/logger');

class PaymentOrderGenerationService {
  constructor(pool) {
    this.pool = pool;
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
   * Generate payment orders from completed lessons for a date range
   * @param {Object} options - Generation options
   * @param {Date} options.startDate - Start date for lessons
   * @param {Date} options.endDate - End date for lessons
   * @param {boolean} options.regenerate - If true, regenerate payment orders for lessons that already have payment orders
   * @param {boolean} options.forceGenerate - Force generation even if feature flag is disabled (for testing)
   * @returns {Promise<Object>} Generation result
   */
  async generatePaymentOrdersFromLessons(options = {}) {
    const {
      startDate,
      endDate,
      regenerate = false,
      forceGenerate = false
    } = options;

    // Check feature flag unless forceGenerate is true
    if (!forceGenerate && !this.isStandaloneAccountingEnabled()) {
      logger.warn({
        msg: 'Standalone accounting payment order generation is disabled',
        reason: 'STANDALONE_ACCOUNTING_ENABLED is not set to true'
      });
      throw new Error('Standalone accounting is not enabled. Set STANDALONE_ACCOUNTING_ENABLED=true to enable automatic payment order generation.');
    }

    const client = await this.pool.connect();
    try {
      await client.query('BEGIN');

      // Build query to find tutors who have completed appointments
      let query = `
        SELECT DISTINCT
          ac.contractor_id,
          c.first_name as contractor_first_name,
          c.last_name as contractor_last_name,
          c.email as contractor_email
        FROM appointments a
        INNER JOIN appointment_contractors ac ON a.appointment_id = ac.appointment_id
        LEFT JOIN contractors c ON ac.contractor_id = c.contractor_id
        WHERE a.status IN ('complete', 'completed', 'cancelled-chargeable')
          AND a.is_deleted IS NOT TRUE
          AND ac.status <> 'missed'
          AND ac.contractor_id IS NOT NULL
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
        // Exclude appointments that already have payment orders
        query += `
          AND NOT EXISTS (
            SELECT 1 FROM payment_order_items poi
            WHERE poi.appointment_id = a.appointment_id
          )
        `;
      }

      query += ` ORDER BY ac.contractor_id`;

      const { rows: tutorGroups } = await client.query(query, params);

      const results = {
        paymentOrdersCreated: 0,
        paymentOrdersUpdated: 0,
        errors: [],
        paymentOrderIds: []
      };

      // Generate payment order for each tutor
      for (const tutorGroup of tutorGroups) {
        try {
          const poResult = await this.generatePaymentOrderForTutor(
            client,
            tutorGroup.contractor_id,
            {
              startDate,
              endDate,
              regenerate
            }
          );

          if (poResult.created) {
            results.paymentOrdersCreated++;
          } else if (poResult.updated) {
            results.paymentOrdersUpdated++;
          }

          if (poResult.paymentOrderId) {
            results.paymentOrderIds.push(poResult.paymentOrderId);
          }
        } catch (error) {
          // Only log errors, don't be verbose
          logger.error({
            msg: 'Error generating payment order for tutor',
            contractorId: tutorGroup.contractor_id,
            error: error.message
          });
          results.errors.push({
            contractorId: tutorGroup.contractor_id,
            error: error.message
          });
        }
      }

      await client.query('COMMIT');

      // Only log if there are errors or significant results
      if (results.errors.length > 0 || results.paymentOrdersCreated > 0 || results.paymentOrdersUpdated > 0) {
        logger.info({
          msg: 'Payment order generation completed',
          paymentOrdersCreated: results.paymentOrdersCreated,
          paymentOrdersUpdated: results.paymentOrdersUpdated,
          errors: results.errors.length
        });
      }

      return results;
    } catch (error) {
      await client.query('ROLLBACK');
      logger.error({
        msg: 'Error generating payment orders from lessons',
        error: error.message
      });
      throw error;
    } finally {
      client.release();
    }
  }

  /**
   * Generate payment order for a specific tutor
   * @param {Object} client - Database client connection
   * @param {number} contractorId - Contractor/Tutor ID
   * @param {Object} options - Generation options
   * @returns {Promise<Object>} Payment order generation result
   */
  async generatePaymentOrderForTutor(client, contractorId, options = {}) {
    const { startDate, endDate, regenerate = false, specificAppointmentIds = null } = options;

    // Fetch completed appointments for this tutor
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
        ac.pay_rate,
        s.dft_contractor_rate,
        ar.charge_rate,
        ar.recipient_name
      FROM appointments a
      INNER JOIN appointment_contractors ac ON a.appointment_id = ac.appointment_id
      LEFT JOIN services s ON a.service_id = s.service_id
      LEFT JOIN appointment_recipients ar ON a.appointment_id = ar.appointment_id
      WHERE a.status IN ('complete', 'completed', 'cancelled-chargeable')
        AND (a.is_deleted IS NULL OR a.is_deleted IS FALSE)
        AND ac.status <> 'missed'
        AND ac.contractor_id = $1
    `;

    const params = [contractorId];
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
            SELECT 1 FROM payment_order_charges poc
            WHERE poc.appointment_id = a.appointment_id
              AND poc.payment_order_id IN (
                SELECT id FROM payment_orders WHERE payee_id = $1 AND status = 'draft'
              )
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
        paymentOrderId: null,
        message: 'No appointments found for payment order'
      };
    }

    // Get tutor info
    const { rows: tutorRows } = await client.query(
      `SELECT first_name, last_name, email FROM contractors WHERE contractor_id = $1`,
      [contractorId]
    );

    const tutorInfo = tutorRows[0] || {};

    // Calculate totals
    let totalToPayTutor = 0;
    let totalTax = 0;
    const items = [];

    for (const apt of appointments) {
      // Calculate tutor pay
      let tutorPay = 0;
      const tutorRate = parseFloat(apt.pay_rate || apt.dft_contractor_rate || 0);
      
      if (apt.dft_charge_type === 'hourly' || apt.dft_charge_type === 'hourly-split') {
        tutorPay = tutorRate * parseFloat(apt.units || 0);
      } else {
        tutorPay = tutorRate;
      }

      totalToPayTutor += tutorPay;

      items.push({
        appointment_id: apt.appointment_id,
        description: apt.topic || apt.service_name || 'Lesson',
        item_date: apt.start,
        units: parseFloat(apt.units || 1),
        rate: tutorRate,
        amount: tutorPay,
        tax_amount: 0,
        sales_code: apt.dft_charge_type || 'hourly',
        payer: apt.recipient_name || 'Client'
      });
    }

    // Check if payment order already exists for this tutor and date range
    const { rows: existingPOs } = await client.query(
      `SELECT id FROM payment_orders 
       WHERE payee_id = $1 
         AND status = 'draft'
         AND date_created >= $2
         AND date_created <= $3
       ORDER BY date_created DESC
       LIMIT 1`,
      [contractorId, startDate || new Date(Date.now() - 30 * 24 * 60 * 60 * 1000), endDate || new Date()]
    );

    let paymentOrderId;
    let isNew = false;

    if (existingPOs.length > 0 && !regenerate) {
      // Update existing draft payment order
      paymentOrderId = existingPOs[0].id;
      await client.query(
        `UPDATE payment_orders 
         SET amount = $1,
             total_to_pay_tutor = $2,
             total_tax = $3,
             items = $4
         WHERE id = $5`,
        [
          totalToPayTutor,
          totalToPayTutor,
          totalTax,
          JSON.stringify(items),
          paymentOrderId
        ]
      );

      // Delete old charges and create new ones
      await client.query(`DELETE FROM payment_order_charges WHERE payment_order_id = $1`, [paymentOrderId]);
    } else {
      // Generate payment order ID (negative for local-only, positive for TutorCruncher)
      // Check if this is a local-only contractor (negative contractor_id)
      const isLocalOnly = parseInt(contractorId) < 0;
      
      if (isLocalOnly) {
        // Generate negative ID for local-only payment orders
        const maxLocalIdResult = await client.query(`
          SELECT MIN(id) as min_id 
          FROM payment_orders 
          WHERE id < 0
        `);
        const minLocalId = maxLocalIdResult.rows[0]?.min_id ?? -1000000;
        paymentOrderId = minLocalId - 1;
      } else {
        // For TutorCruncher contractors, try to use a sequence or generate positive ID
        // First check if there's a sequence
        const sequenceCheck = await client.query(`
          SELECT EXISTS (
            SELECT 1 FROM pg_sequences WHERE sequencename = 'payment_orders_id_seq'
          )
        `);
        
        if (sequenceCheck.rows[0].exists) {
          // Use sequence
          const seqResult = await client.query(`SELECT nextval('payment_orders_id_seq') as next_id`);
          paymentOrderId = parseInt(seqResult.rows[0].next_id);
        } else {
          // Generate positive ID based on max existing ID
          const maxIdResult = await client.query(`SELECT MAX(id) as max_id FROM payment_orders WHERE id > 0`);
          const maxId = maxIdResult.rows[0]?.max_id ?? 0;
          paymentOrderId = maxId + 1;
        }
      }

      // Create new payment order with explicit ID
      await client.query(
        `INSERT INTO payment_orders (
          id,
          display_id,
          payment_order_number,
          payee_id,
          payee_first,
          payee_last,
          payee_email,
          amount,
          total_to_pay_tutor,
          total_tax,
          total_to_charge_client,
          status,
          date_sent,
          date_created,
          url,
          items
        ) VALUES (
          $1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, 'draft', NOW(), NOW(), '', $12
        )`,
        [
          paymentOrderId,
          `PO-${Date.now()}`,
          null, // Will be set by update
          contractorId,
          tutorInfo.first_name || '',
          tutorInfo.last_name || '',
          tutorInfo.email || '',
          totalToPayTutor,
          totalToPayTutor,
          totalTax,
          0,
          JSON.stringify(items)
        ]
      );

      // Generate payment order number
      const paymentOrderNumber = `PO-${paymentOrderId}`;
      await client.query(
        `UPDATE payment_orders SET payment_order_number = $1 WHERE id = $2`,
        [paymentOrderNumber, paymentOrderId]
      );

      isNew = true;
    }

    // Insert payment order charges (using payment_order_charges table)
    for (let index = 0; index < items.length; index++) {
      const item = items[index];
      await client.query(
        `INSERT INTO payment_order_charges (
          payment_order_id,
          appointment_id,
          date,
          charge_index,
          units,
          rate,
          amount,
          tax_amount,
          sales_code,
          payer,
          payee_id
        ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)`,
        [
          paymentOrderId,
          item.appointment_id,
          item.item_date || new Date(),
          index,
          item.units,
          item.rate,
          item.amount,
          item.tax_amount,
          item.sales_code,
          item.payer || 'Client',
          contractorId // payee_id is the contractor/tutor being paid
        ]
      );
    }

    return {
      created: isNew,
      updated: !isNew,
      paymentOrderId,
      totalToPayTutor,
      totalTax,
      itemCount: items.length
    };
  }

  /**
   * Generate payment order for a single completed lesson/appointment
   * Called automatically when lesson is marked complete
   * @param {number|string} appointmentId - Appointment ID (can be string for local-only lessons)
   * @param {boolean} forceGenerate - Force generation even if feature flag is disabled (for local-only lessons)
   * @returns {Promise<Object>} Payment order generation result
   */
  async generatePaymentOrderForCompletedLesson(appointmentId, forceGenerate = false) {
    // Check feature flag unless forceGenerate is true (for local-only lessons)
    if (!forceGenerate && !this.isStandaloneAccountingEnabled()) {
      logger.warn({
        msg: 'Standalone accounting payment order generation is disabled',
        reason: 'STANDALONE_ACCOUNTING_ENABLED is not set to true',
        appointmentId
      });
      // For local-only lessons, we still want to generate payment orders even if flag is not set
      // This allows testing in local environment
      const isLocalOnly = typeof appointmentId === 'string' && appointmentId.startsWith('-');
      if (!isLocalOnly) {
        throw new Error('Standalone accounting is not enabled. Set STANDALONE_ACCOUNTING_ENABLED=true to enable automatic payment order generation.');
      }
    }

    const client = await this.pool.connect();
    try {
      await client.query('BEGIN');

      // Get appointment with all contractors (tutors)
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
          ac.contractor_id,
          ac.pay_rate,
          ac.contractor_name,
          ac.status as contractor_status,
          c.first_name as contractor_first_name,
          c.last_name as contractor_last_name,
          c.email as contractor_email
        FROM appointments a
        INNER JOIN appointment_contractors ac ON a.appointment_id = ac.appointment_id
        LEFT JOIN services s ON a.service_id = s.service_id
        LEFT JOIN contractors c ON ac.contractor_id::text = c.contractor_id::text
        WHERE a.appointment_id = $1
          AND ac.status <> 'missed'
          AND ac.contractor_id IS NOT NULL`,
        [appointmentId]
      );

      if (appointmentRows.length === 0) {
        await client.query('COMMIT');
        return {
          created: false,
          updated: false,
          paymentOrderIds: [],
          message: 'No valid contractors found for this appointment'
        };
      }

      // Group by contractor_id (each tutor gets their own payment order)
      const contractorGroups = {};
      for (const row of appointmentRows) {
        const contractorId = row.contractor_id;
        if (!contractorGroups[contractorId]) {
          contractorGroups[contractorId] = {
            contractor_id: contractorId,
            contractor_first_name: row.contractor_first_name || row.contractor_name?.split(' ')[0] || '',
            contractor_last_name: row.contractor_last_name || row.contractor_name?.split(' ').slice(1).join(' ') || '',
            contractor_email: row.contractor_email || '',
            appointments: []
          };
        }
        contractorGroups[contractorId].appointments.push(row);
      }

      const results = {
        created: false,
        updated: false,
        paymentOrderIds: [],
        errors: []
      };

      // Generate payment order for each contractor
      for (const [contractorId, contractorGroup] of Object.entries(contractorGroups)) {
        try {
          // Use existing generatePaymentOrderForTutor method with single appointment
          const poResult = await this.generatePaymentOrderForTutor(
            client,
            contractorId,
            {
              startDate: null,
              endDate: null,
              regenerate: false,
              specificAppointmentIds: [appointmentId] // Only include this appointment
            }
          );

          if (poResult.created) {
            results.created = true;
          } else if (poResult.updated) {
            results.updated = true;
          }

          if (poResult.paymentOrderId) {
            results.paymentOrderIds.push(poResult.paymentOrderId);
          }
        } catch (error) {
          // Only log errors, don't include stack trace unless critical
          logger.error({
            msg: 'Error generating payment order for completed lesson',
            appointmentId,
            contractorId,
            error: error.message
          });
          results.errors.push({
            contractorId,
            error: error.message
          });
          // Don't throw - continue processing other contractors
        }
      }

      await client.query('COMMIT');
      return results;
    } catch (error) {
      await client.query('ROLLBACK');
      logger.error({
        msg: 'Error generating payment order for completed lesson',
        appointmentId,
        error: error.message
      });
      throw error;
    } finally {
      client.release();
    }
  }
}

module.exports = PaymentOrderGenerationService;
