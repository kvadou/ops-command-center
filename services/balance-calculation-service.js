/**
 * Balance Calculation Service
 * Maintains accurate client balances and transaction history
 */

const { logger } = require('../utils/logger');

class BalanceCalculationService {
  constructor(pool) {
    this.pool = pool;
  }

  /**
   * Calculate current balance for a client from all transactions
   * @param {number} clientId - Client ID
   * @returns {Promise<Object>} Balance object with invoice_balance and available_balance
   */
  async calculateClientBalance(clientId) {
    const client = await this.pool.connect();
    try {
      await client.query('BEGIN');

      // Get all balance updates for this client
      const { rows: updates } = await client.query(
        `SELECT 
          update_type,
          change_amount,
          balance_type
        FROM balance_updates
        WHERE client_id = $1
        ORDER BY created_at ASC`,
        [clientId]
      );

      let invoiceBalance = 0;
      let availableBalance = 0;

      // Calculate balances from all transactions
      for (const update of updates) {
        if (update.balance_type === 'invoice_balance') {
          invoiceBalance += parseFloat(update.change_amount) || 0;
        } else if (update.balance_type === 'available_balance') {
          availableBalance += parseFloat(update.change_amount) || 0;
        }
      }

      // Update or insert client balance record
      await client.query(
        `INSERT INTO client_balances (client_id, invoice_balance, available_balance, last_calculated_at, last_updated_at)
         VALUES ($1, $2, $3, NOW(), NOW())
         ON CONFLICT (client_id) DO UPDATE SET
           invoice_balance = EXCLUDED.invoice_balance,
           available_balance = EXCLUDED.available_balance,
           last_calculated_at = NOW(),
           last_updated_at = NOW()`,
        [clientId, invoiceBalance, availableBalance]
      );

      await client.query('COMMIT');

      logger.info({
        msg: 'Client balance calculated',
        clientId,
        invoiceBalance,
        availableBalance
      });

      return {
        client_id: clientId,
        invoice_balance: invoiceBalance,
        available_balance: availableBalance,
        last_calculated_at: new Date()
      };
    } catch (error) {
      await client.query('ROLLBACK');
      logger.error({
        msg: 'Error calculating client balance',
        clientId,
        error: error.message,
        stack: error.stack
      });
      throw error;
    } finally {
      client.release();
    }
  }

  /**
   * Update client balance when a transaction occurs
   * @param {Object} transaction - Transaction details
   * @param {number} transaction.clientId - Client ID
   * @param {string} transaction.updateType - Type: 'invoice', 'payment', 'credit', 'refund', 'adjustment'
   * @param {number} transaction.changeAmount - Amount of change (positive or negative)
   * @param {string} transaction.balanceType - 'invoice_balance' or 'available_balance'
   * @param {string} transaction.description - Description of the transaction
   * @param {Object} transaction.related - Related document info (invoice_id, credit_request_id, etc.)
   * @param {string} transaction.createdBy - User who created the transaction
   * @param {string} transaction.paymentMethod - Payment method (optional)
   * @param {string} transaction.stripeTransactionId - Stripe transaction ID (optional)
   * @returns {Promise<Object>} Balance update record
   */
  async updateClientBalance(transaction) {
    const {
      clientId,
      updateType,
      changeAmount,
      balanceType = 'invoice_balance',
      description,
      related = {},
      createdBy,
      paymentMethod,
      stripeTransactionId
    } = transaction;

    const client = await this.pool.connect();
    try {
      await client.query('BEGIN');

      // Get current balance
      const { rows: currentBalanceRows } = await client.query(
        `SELECT invoice_balance, available_balance
         FROM client_balances
         WHERE client_id = $1`,
        [clientId]
      );

      let previousBalance = 0;
      if (currentBalanceRows.length > 0) {
        previousBalance = balanceType === 'invoice_balance'
          ? parseFloat(currentBalanceRows[0].invoice_balance) || 0
          : parseFloat(currentBalanceRows[0].available_balance) || 0;
      }

      const newBalance = previousBalance + parseFloat(changeAmount);

      // Get client info for balance update record
      const { rows: clientRows } = await client.query(
        `SELECT first_name, last_name, email
         FROM clients
         WHERE client_id = $1`,
        [clientId]
      );

      const clientInfo = clientRows[0] || {};

      // Create balance update record
      const { rows: updateRows } = await client.query(
        `INSERT INTO balance_updates (
          client_id,
          client_first_name,
          client_last_name,
          update_type,
          related_id,
          related_type,
          previous_balance,
          change_amount,
          new_balance,
          balance_type,
          description,
          created_by,
          payment_method,
          stripe_transaction_id,
          related_invoice_id,
          related_credit_request_id,
          related_payment_order_id,
          created_at
        ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17, NOW())
        RETURNING *`,
        [
          clientId,
          clientInfo.first_name,
          clientInfo.last_name,
          updateType,
          related.related_id || null,
          related.related_type || null,
          previousBalance,
          changeAmount,
          newBalance,
          balanceType,
          description,
          createdBy,
          paymentMethod,
          stripeTransactionId,
          related.invoice_id || null,
          related.credit_request_id || null,
          related.payment_order_id || null
        ]
      );

      // Update client balance record
      if (balanceType === 'invoice_balance') {
        await client.query(
          `INSERT INTO client_balances (client_id, invoice_balance, available_balance, last_updated_at)
           VALUES ($1, $2, COALESCE((SELECT available_balance FROM client_balances WHERE client_id = $1), 0), NOW())
           ON CONFLICT (client_id) DO UPDATE SET
             invoice_balance = EXCLUDED.invoice_balance,
             last_updated_at = NOW()`,
          [clientId, newBalance]
        );
      } else {
        await client.query(
          `INSERT INTO client_balances (client_id, invoice_balance, available_balance, last_updated_at)
           VALUES ($1, COALESCE((SELECT invoice_balance FROM client_balances WHERE client_id = $1), 0), $2, NOW())
           ON CONFLICT (client_id) DO UPDATE SET
             available_balance = EXCLUDED.available_balance,
             last_updated_at = NOW()`,
          [clientId, newBalance]
        );
      }

      await client.query('COMMIT');

      logger.info({
        msg: 'Client balance updated',
        clientId,
        updateType,
        changeAmount,
        balanceType,
        previousBalance,
        newBalance
      });

      return updateRows[0];
    } catch (error) {
      await client.query('ROLLBACK');
      logger.error({
        msg: 'Error updating client balance',
        clientId,
        updateType,
        error: error.message,
        stack: error.stack
      });
      throw error;
    } finally {
      client.release();
    }
  }

  /**
   * Get balance history for a client
   * @param {number} clientId - Client ID
   * @param {Object} options - Query options
   * @param {number} options.limit - Number of records to return
   * @param {number} options.offset - Offset for pagination
   * @param {string} options.updateType - Filter by update type
   * @returns {Promise<Object>} Balance history with records and totals
   */
  async getBalanceHistory(clientId, options = {}) {
    const { limit = 100, offset = 0, updateType } = options;

    try {
      let query = `
        SELECT 
          bu.*,
          i.invoice_number,
          cr.credit_request_number,
          po.payment_order_number
        FROM balance_updates bu
        LEFT JOIN invoices i ON bu.related_invoice_id = i.id
        LEFT JOIN credit_requests cr ON bu.related_credit_request_id = cr.id
        LEFT JOIN payment_orders po ON bu.related_payment_order_id = po.id
        WHERE bu.client_id = $1
      `;
      const params = [clientId];

      if (updateType) {
        params.push(updateType);
        query += ` AND bu.update_type = $${params.length}`;
      }

      query += ` ORDER BY bu.created_at DESC LIMIT $${params.length + 1} OFFSET $${params.length + 2}`;
      params.push(limit, offset);

      const { rows } = await this.pool.query(query, params);

      // Get total count
      let countQuery = `SELECT COUNT(*) as total FROM balance_updates WHERE client_id = $1`;
      const countParams = [clientId];
      if (updateType) {
        countParams.push(updateType);
        countQuery += ` AND update_type = $2`;
      }
      const { rows: countRows } = await this.pool.query(countQuery, countParams);

      return {
        records: rows,
        total: parseInt(countRows[0].total, 10),
        limit,
        offset
      };
    } catch (error) {
      logger.error({
        msg: 'Error getting balance history',
        clientId,
        error: error.message,
        stack: error.stack
      });
      throw error;
    }
  }

  /**
   * Get current balance for a client (from client_balances table)
   * @param {number} clientId - Client ID
   * @returns {Promise<Object|null>} Current balance or null if not found
   */
  async getCurrentBalance(clientId) {
    try {
      const { rows } = await this.pool.query(
        `SELECT * FROM client_balances WHERE client_id = $1`,
        [clientId]
      );

      if (rows.length === 0) {
        // Calculate balance if record doesn't exist
        return await this.calculateClientBalance(clientId);
      }

      return rows[0];
    } catch (error) {
      logger.error({
        msg: 'Error getting current balance',
        clientId,
        error: error.message,
        stack: error.stack
      });
      throw error;
    }
  }

  /**
   * Recalculate all client balances (useful for data migration or fixing inconsistencies)
   * @param {Array<number>} clientIds - Optional array of client IDs to recalculate. If not provided, recalculates all.
   * @returns {Promise<Object>} Summary of recalculation
   */
  async recalculateAllBalances(clientIds = null) {
    try {
      let query = `SELECT DISTINCT client_id FROM balance_updates`;
      const params = [];

      if (clientIds && clientIds.length > 0) {
        query += ` WHERE client_id = ANY($1)`;
        params.push(clientIds);
      }

      const { rows } = await this.pool.query(query, params);
      const clientIdsToProcess = rows.map(r => r.client_id);

      let successCount = 0;
      let errorCount = 0;
      const errors = [];

      for (const clientId of clientIdsToProcess) {
        try {
          await this.calculateClientBalance(clientId);
          successCount++;
        } catch (error) {
          errorCount++;
          errors.push({
            clientId,
            error: error.message
          });
        }
      }

      logger.info({
        msg: 'Recalculated all client balances',
        total: clientIdsToProcess.length,
        successCount,
        errorCount
      });

      return {
        total: clientIdsToProcess.length,
        successCount,
        errorCount,
        errors
      };
    } catch (error) {
      logger.error({
        msg: 'Error recalculating all balances',
        error: error.message,
        stack: error.stack
      });
      throw error;
    }
  }

  /**
   * Create balance update when invoice is raised
   * @param {number} invoiceId - Invoice ID
   * @param {number} clientId - Client ID
   * @param {number} amount - Invoice amount (will be negative for invoice_balance)
   * @param {string} createdBy - User who raised the invoice
   * @returns {Promise<Object>} Balance update record
   */
  async recordInvoiceRaised(invoiceId, clientId, amount, createdBy) {
    return await this.updateClientBalance({
      clientId,
      updateType: 'invoice',
      changeAmount: -Math.abs(amount), // Negative because it increases what client owes
      balanceType: 'invoice_balance',
      description: `Invoice raised`,
      related: {
        related_id: invoiceId,
        related_type: 'invoice',
        invoice_id: invoiceId
      },
      createdBy
    });
  }

  /**
   * Create balance update when invoice is paid
   * @param {number} invoiceId - Invoice ID
   * @param {number} clientId - Client ID
   * @param {number} amount - Payment amount (positive)
   * @param {string} paymentMethod - Payment method
   * @param {string} stripeTransactionId - Stripe transaction ID
   * @param {string} createdBy - User who processed the payment
   * @returns {Promise<Object>} Balance update record
   */
  async recordInvoicePayment(invoiceId, clientId, amount, paymentMethod, stripeTransactionId, createdBy) {
    return await this.updateClientBalance({
      clientId,
      updateType: 'payment',
      changeAmount: Math.abs(amount), // Positive because it reduces what client owes
      balanceType: 'invoice_balance',
      description: `Invoice payment received`,
      related: {
        related_id: invoiceId,
        related_type: 'invoice',
        invoice_id: invoiceId
      },
      createdBy,
      paymentMethod,
      stripeTransactionId
    });
  }

  /**
   * Create balance update when credit request is raised
   * @param {number} creditRequestId - Credit request ID
   * @param {number} clientId - Client ID
   * @param {number} amount - Credit amount (positive, reduces what client owes)
   * @param {string} createdBy - User who raised the credit
   * @returns {Promise<Object>} Balance update record
   */
  async recordCreditRequestRaised(creditRequestId, clientId, amount, createdBy) {
    return await this.updateClientBalance({
      clientId,
      updateType: 'credit',
      changeAmount: Math.abs(amount), // Positive because it reduces what client owes
      balanceType: 'invoice_balance',
      description: `Credit request raised`,
      related: {
        related_id: creditRequestId,
        related_type: 'credit_request',
        credit_request_id: creditRequestId
      },
      createdBy
    });
  }

  /**
   * Create balance update when credit request is paid/refunded
   * Credit request payment increases available_balance (prepaid credit)
   * @param {number} creditRequestId - Credit request ID
   * @param {number} clientId - Client ID
   * @param {number} amount - Payment amount (positive)
   * @param {string} paymentMethod - Payment method
   * @param {string} stripeTransactionId - Stripe payment ID
   * @param {string} createdBy - User who processed the payment
   * @returns {Promise<Object>} Balance update record
   */
  async recordCreditRequestPayment(creditRequestId, clientId, amount, paymentMethod, stripeTransactionId, createdBy) {
    // In TutorCruncher model: negative available_balance = prepaid credit
    // So we make it MORE negative (increase credit) by subtracting
    return await this.updateClientBalance({
      clientId,
      updateType: 'credit_purchase',
      changeAmount: -Math.abs(amount), // Negative because available_balance is negative = credit
      balanceType: 'available_balance',
      description: `Credit request payment received`,
      related: {
        related_id: creditRequestId,
        related_type: 'credit_request',
        credit_request_id: creditRequestId
      },
      createdBy,
      paymentMethod,
      stripeTransactionId
    });
  }

  /**
   * Deduct credit balance to pay an invoice automatically
   * If client has available_balance (prepaid credit), use it to pay invoice
   * @param {number} invoiceId - Invoice ID
   * @param {number} clientId - Client ID
   * @param {number} invoiceAmount - Invoice total amount
   * @param {string} createdBy - User/system who triggered this
   * @returns {Promise<Object>} Result with amount deducted and remaining credit
   */
  async deductCreditForInvoice(invoiceId, clientId, invoiceAmount, createdBy = 'system') {
    const client = await this.pool.connect();
    try {
      await client.query('BEGIN');

      // Get current available_balance (prepaid credit)
      // In TutorCruncher: negative = credit available
      const { rows: balanceRows } = await client.query(
        `SELECT available_balance FROM client_balances WHERE client_id = $1`,
        [clientId]
      );

      const currentAvailableBalance = balanceRows.length > 0 
        ? parseFloat(balanceRows[0].available_balance) || 0 
        : 0;

      // available_balance is negative = credit available
      // So -100 means $100 credit available
      const creditAvailable = Math.abs(currentAvailableBalance);
      const amountToDeduct = Math.min(creditAvailable, Math.abs(invoiceAmount));

      if (amountToDeduct > 0) {
        // Deduct from available_balance (make it less negative = reduce credit)
        await this.updateClientBalance({
          clientId,
          updateType: 'credit_used',
          changeAmount: amountToDeduct, // Positive because we're reducing the negative balance
          balanceType: 'available_balance',
          description: `Credit applied to invoice`,
          related: {
            related_id: invoiceId,
            related_type: 'invoice',
            invoice_id: invoiceId
          },
          createdBy
        });

        // Reduce invoice_balance (reduce debt)
        await this.updateClientBalance({
          clientId,
          updateType: 'invoice_payment',
          changeAmount: amountToDeduct, // Positive because it reduces debt
          balanceType: 'invoice_balance',
          description: `Invoice paid from credit balance`,
          related: {
            related_id: invoiceId,
            related_type: 'invoice',
            invoice_id: invoiceId
          },
          createdBy,
          paymentMethod: 'credit_balance'
        });

        // Mark invoice as paid if fully covered
        if (amountToDeduct >= Math.abs(invoiceAmount)) {
          await client.query(
            `UPDATE invoices SET status = 'paid', date_paid = NOW() WHERE id = $1`,
            [invoiceId]
          );
        }

        await client.query('COMMIT');

        return {
          success: true,
          amountDeducted: amountToDeduct,
          remainingCredit: creditAvailable - amountToDeduct,
          invoiceFullyPaid: amountToDeduct >= Math.abs(invoiceAmount)
        };
      } else {
        await client.query('COMMIT');
        return {
          success: false,
          amountDeducted: 0,
          remainingCredit: creditAvailable,
          invoiceFullyPaid: false,
          message: 'No credit available'
        };
      }
    } catch (error) {
      await client.query('ROLLBACK');
      logger.error({
        msg: 'Error deducting credit for invoice',
        invoiceId,
        clientId,
        error: error.message,
        stack: error.stack
      });
      throw error;
    } finally {
      client.release();
    }
  }
}

module.exports = BalanceCalculationService;
