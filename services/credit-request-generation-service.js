/**
 * Credit Request Generation Service
 * Automatically generates credit requests when client balance is low
 * Mirrors TutorCruncher's auto-credit-request functionality
 */

const { logger } = require('../utils/logger');
const BalanceCalculationService = require('./balance-calculation-service');

class CreditRequestGenerationService {
  constructor(pool) {
    this.pool = pool;
    this.balanceService = new BalanceCalculationService(pool);
  }

  /**
   * Check if client needs a credit request based on balance and upcoming lessons
   * @param {number} clientId - Client ID
   * @param {Object} options - Options
   * @param {number} options.minimumBalance - Minimum balance threshold (default: 0)
   * @param {number} options.lookaheadDays - Days to look ahead for upcoming lessons (default: 30)
   * @returns {Promise<Object>} Result with needsCreditRequest flag and suggested amount
   */
  async checkIfCreditRequestNeeded(clientId, options = {}) {
    const { minimumBalance = 0, lookaheadDays = 30 } = options;
    
    try {
      // Get current balance
      const balance = await this.balanceService.getCurrentBalance(clientId);
      
      if (!balance) {
        // No balance record means no transactions yet - no credit request needed
        return {
          needsCreditRequest: false,
          currentBalance: 0,
          suggestedAmount: 0,
          reason: 'No balance history'
        };
      }

      // In TutorCruncher model: negative available_balance = prepaid credit
      // So -100 means $100 credit available
      const availableCredit = Math.abs(parseFloat(balance.available_balance) || 0);
      const invoiceBalance = Math.abs(parseFloat(balance.invoice_balance) || 0);

      // Check upcoming lessons in the next N days
      const lookaheadDate = new Date();
      lookaheadDate.setDate(lookaheadDate.getDate() + lookaheadDays);

      const { rows: upcomingLessons } = await this.pool.query(
        `SELECT 
          a.appointment_id,
          a.start,
          a.units,
          ar.charge_rate,
          s.dft_charge_type
        FROM appointments a
        INNER JOIN appointment_recipients ar ON a.appointment_id = ar.appointment_id
        LEFT JOIN services s ON a.service_id = s.service_id
        WHERE CAST(ar.paying_client_id AS VARCHAR) = $1
          AND a.start >= NOW()
          AND a.start <= $2
          AND a.status NOT IN ('cancelled', 'completed', 'complete')
          AND ar.status <> 'missed'
        ORDER BY a.start ASC`,
        [String(clientId), lookaheadDate]
      );

      // Calculate total expected charges for upcoming lessons
      let expectedCharges = 0;
      for (const lesson of upcomingLessons) {
        let chargeAmount = 0;
        if (lesson.dft_charge_type === 'hourly' || lesson.dft_charge_type === 'hourly-split') {
          chargeAmount = parseFloat(lesson.charge_rate || 0) * parseFloat(lesson.units || 0);
        } else {
          chargeAmount = parseFloat(lesson.charge_rate || 0);
        }
        expectedCharges += chargeAmount;
      }

      // Calculate total needed (current invoice balance + expected charges)
      const totalNeeded = invoiceBalance + expectedCharges;
      
      // Check if available credit is below minimum threshold
      const needsCreditRequest = availableCredit < minimumBalance || 
                                 (totalNeeded > 0 && availableCredit < totalNeeded * 0.5); // Need at least 50% coverage

      // Suggested amount: enough to cover expected charges + buffer
      const suggestedAmount = needsCreditRequest 
        ? Math.max(totalNeeded * 1.2 - availableCredit, minimumBalance) // 20% buffer
        : 0;

      return {
        needsCreditRequest,
        currentBalance: {
          available_balance: balance.available_balance,
          invoice_balance: balance.invoice_balance,
          availableCredit,
          invoiceBalance
        },
        upcomingLessons: upcomingLessons.length,
        expectedCharges,
        totalNeeded,
        suggestedAmount: Math.ceil(suggestedAmount), // Round up to nearest dollar
        reason: needsCreditRequest 
          ? `Low credit balance (${availableCredit.toFixed(2)} available, ${totalNeeded.toFixed(2)} needed)`
          : 'Sufficient credit balance'
      };
    } catch (error) {
      logger.error({
        msg: 'Error checking if credit request needed',
        clientId,
        error: error.message,
        stack: error.stack
      });
      throw error;
    }
  }

  /**
   * Generate credit request for a client if balance is low
   * @param {number} clientId - Client ID
   * @param {Object} options - Options
   * @param {number} options.amount - Specific amount (if not provided, will calculate)
   * @param {string} options.reason - Reason for credit request
   * @param {string} options.description - Description
   * @param {string} options.createdBy - User who created this (default: 'system')
   * @returns {Promise<Object>} Credit request creation result
   */
  async generateCreditRequestForClient(clientId, options = {}) {
    const { amount, reason, description, createdBy = 'system' } = options;
    
    const client = await this.pool.connect();
    try {
      await client.query('BEGIN');

      // Get client info
      const { rows: clientRows } = await client.query(
        `SELECT first_name, last_name, email FROM clients WHERE client_id = $1`,
        [clientId]
      );

      if (clientRows.length === 0) {
        throw new Error(`Client ${clientId} not found`);
      }

      const clientInfo = clientRows[0];

      // Determine amount if not provided
      let creditRequestAmount = amount;
      if (!creditRequestAmount) {
        const checkResult = await this.checkIfCreditRequestNeeded(clientId);
        if (!checkResult.needsCreditRequest) {
          await client.query('COMMIT');
          return {
            created: false,
            creditRequestId: null,
            message: 'Credit request not needed - sufficient balance',
            checkResult
          };
        }
        creditRequestAmount = checkResult.suggestedAmount;
        reason = reason || checkResult.reason;
      }

      // Check if there's already a draft or raised credit request for this client
      const { rows: existingCRs } = await client.query(
        `SELECT id, amount, status FROM credit_requests 
         WHERE client_id = $1 
           AND status IN ('draft', 'raised', 'confirmed')
           AND date_created >= NOW() - INTERVAL '7 days'
         ORDER BY date_created DESC
         LIMIT 1`,
        [clientId]
      );

      if (existingCRs.length > 0) {
        const existingCR = existingCRs[0];
        logger.info({
          msg: 'Credit request already exists for client',
          clientId,
          existingCreditRequestId: existingCR.id,
          status: existingCR.status
        });
        await client.query('COMMIT');
        return {
          created: false,
          creditRequestId: existingCR.id,
          message: `Credit request ${existingCR.id} already exists (status: ${existingCR.status})`,
          existingCreditRequest: existingCR
        };
      }

      // Generate a unique ID for the credit request
      // Since credit_requests.id is BIGINT without SERIAL, we need to generate it
      // Use timestamp-based ID to avoid conflicts
      const creditRequestId = Date.now();

      // Create credit request
      const { rows: crRows } = await client.query(
        `INSERT INTO credit_requests (
          id,
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
          $1, $2, $3, $4, $5, $6, $7, $8, $9, 'draft', NOW(), $10
        ) RETURNING *`,
        [
          creditRequestId,
          `PFI-${creditRequestId}`,
          clientId,
          clientInfo.first_name,
          clientInfo.last_name,
          clientInfo.email,
          creditRequestAmount,
          reason || 'Auto-generated: Low balance',
          description || `Credit request for prepaid balance`,
          JSON.stringify([])
        ]
      );

      const creditRequest = crRows[0];

      // Generate credit request number
      const creditRequestNumber = `PFI-${creditRequest.id}`;
      await client.query(
        `UPDATE credit_requests SET credit_request_number = $1 WHERE id = $2`,
        [creditRequestNumber, creditRequest.id]
      );

      // Log activity
      await client.query(
        `INSERT INTO accounting_activity_log (document_type, document_id, action, performed_by, details, created_at)
         VALUES ('credit_request', $1, 'created', $2, $3, NOW())`,
        [
          creditRequest.id,
          createdBy,
          JSON.stringify({ 
            amount: creditRequestAmount, 
            reason: reason || 'Auto-generated',
            auto_generated: true
          })
        ]
      );

      await client.query('COMMIT');

      logger.info({
        msg: 'Credit request auto-generated for client',
        clientId,
        creditRequestId: creditRequest.id,
        amount: creditRequestAmount
      });

      return {
        created: true,
        creditRequestId: creditRequest.id,
        creditRequest: {
          ...creditRequest,
          credit_request_number: creditRequestNumber
        },
        amount: creditRequestAmount
      };
    } catch (error) {
      await client.query('ROLLBACK');
      logger.error({
        msg: 'Error generating credit request for client',
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
   * Check all clients and generate credit requests for those with low balances
   * @param {Object} options - Options
   * @param {number} options.minimumBalance - Minimum balance threshold
   * @param {Array<number>} options.clientIds - Specific client IDs to check (optional)
   * @returns {Promise<Object>} Summary of credit request generation
   */
  async generateCreditRequestsForLowBalanceClients(options = {}) {
    const { minimumBalance = 0, clientIds = null } = options;
    
    try {
      let query = `SELECT DISTINCT client_id FROM clients WHERE client_id IS NOT NULL`;
      const params = [];

      if (clientIds && clientIds.length > 0) {
        query += ` AND client_id = ANY($1)`;
        params.push(clientIds);
      }

      const { rows } = await this.pool.query(query, params);
      const allClientIds = rows.map(r => r.client_id);

      let generatedCount = 0;
      let skippedCount = 0;
      let errorCount = 0;
      const errors = [];
      const generated = [];

      for (const clientId of allClientIds) {
        try {
          const result = await this.generateCreditRequestForClient(clientId, {
            createdBy: 'system'
          });

          if (result.created) {
            generatedCount++;
            generated.push({
              clientId,
              creditRequestId: result.creditRequestId,
              amount: result.amount
            });
          } else {
            skippedCount++;
          }
        } catch (error) {
          errorCount++;
          errors.push({
            clientId,
            error: error.message
          });
        }
      }

      logger.info({
        msg: 'Credit request generation batch completed',
        totalClients: allClientIds.length,
        generatedCount,
        skippedCount,
        errorCount
      });

      return {
        totalClients: allClientIds.length,
        generatedCount,
        skippedCount,
        errorCount,
        generated,
        errors
      };
    } catch (error) {
      logger.error({
        msg: 'Error in batch credit request generation',
        error: error.message,
        stack: error.stack
      });
      throw error;
    }
  }
}

module.exports = CreditRequestGenerationService;
