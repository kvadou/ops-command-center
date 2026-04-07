/**
 * Accounting Payment Service
 * Handles Stripe payment processing for invoices and credit request refunds
 */

const { logger } = require('../utils/logger');
const BalanceCalculationService = require('./balance-calculation-service');

class AccountingPaymentService {
  constructor(pool, stripe) {
    this.pool = pool;
    this.stripe = stripe;
    this.balanceService = new BalanceCalculationService(pool);
  }

  /**
   * Create Stripe Checkout session for invoice payment
   * @param {number} invoiceId - Invoice ID
   * @param {string} successUrl - Success redirect URL
   * @param {string} cancelUrl - Cancel redirect URL
   * @returns {Promise<Object>} Stripe checkout session
   */
  async createInvoiceCheckoutSession(invoiceId, successUrl, cancelUrl) {
    const client = await this.pool.connect();
    try {
      // Fetch invoice data
      const { rows: invoiceRows } = await client.query(
        `SELECT 
          i.*,
          c.email as client_email,
          c.first_name as client_first_name,
          c.last_name as client_last_name
        FROM invoices i
        LEFT JOIN clients c ON i.client_id::text = c.client_id::text
        WHERE i.id = $1`,
        [invoiceId]
      );

      if (invoiceRows.length === 0) {
        throw new Error(`Invoice ${invoiceId} not found`);
      }

      const invoice = invoiceRows[0];
      const amount = parseFloat(invoice.gross) || 0;
      const invoiceNumber = invoice.invoice_number || `INV-${invoice.id}`;

      if (amount <= 0) {
        throw new Error(`Invoice ${invoiceId} has invalid amount: ${amount}`);
      }

      // Get or create Stripe customer
      let stripeCustomerId = null;
      if (invoice.client_email) {
        // Try to find existing customer
        const customers = await this.stripe.customers.list({
          email: invoice.client_email,
          limit: 1
        });

        if (customers.data.length > 0) {
          stripeCustomerId = customers.data[0].id;
        } else {
          // Create new customer
          const customer = await this.stripe.customers.create({
            email: invoice.client_email,
            name: `${invoice.client_first_name || ''} ${invoice.client_last_name || ''}`.trim(),
            metadata: {
              client_id: String(invoice.client_id),
              invoice_id: String(invoiceId)
            }
          });
          stripeCustomerId = customer.id;
        }
      }

      // Create checkout session
      const session = await this.stripe.checkout.sessions.create({
        mode: 'payment',
        customer: stripeCustomerId,
        payment_method_types: ['card'],
        line_items: [
          {
            price_data: {
              currency: 'usd',
              product_data: {
                name: `Invoice ${invoiceNumber}`,
                description: `Payment for invoice ${invoiceNumber}`
              },
              unit_amount: Math.round(amount * 100) // Convert to cents
            },
            quantity: 1
          }
        ],
        success_url: successUrl,
        cancel_url: cancelUrl,
        metadata: {
          invoice_id: String(invoiceId),
          invoice_number: invoiceNumber,
          client_id: String(invoice.client_id)
        },
        payment_intent_data: {
          metadata: {
            invoice_id: String(invoiceId),
            invoice_number: invoiceNumber,
            client_id: String(invoice.client_id)
          }
        }
      });

      // Update invoice with checkout session ID
      await client.query(
        `UPDATE invoices 
         SET stripe_payment_intent_id = $1
         WHERE id = $2`,
        [session.payment_intent || session.id, invoiceId]
      );

      logger.info({
        msg: 'Invoice checkout session created',
        invoiceId,
        invoiceNumber,
        sessionId: session.id
      });

      return {
        success: true,
        sessionId: session.id,
        url: session.url,
        session
      };
    } catch (error) {
      logger.error({
        msg: 'Error creating invoice checkout session',
        invoiceId,
        error: error.message,
        stack: error.stack
      });
      throw error;
    } finally {
      client.release();
    }
  }

  /**
   * Process invoice payment (called from webhook or direct payment)
   * @param {string} paymentIntentId - Stripe payment intent ID
   * @returns {Promise<Object>} Payment processing result
   */
  async processInvoicePayment(paymentIntentId) {
    const client = await this.pool.connect();
    try {
      await client.query('BEGIN');

      // Retrieve payment intent from Stripe
      const paymentIntent = await this.stripe.paymentIntents.retrieve(paymentIntentId);
      
      if (paymentIntent.status !== 'succeeded') {
        throw new Error(`Payment intent ${paymentIntentId} is not succeeded. Status: ${paymentIntent.status}`);
      }

      const invoiceId = parseInt(paymentIntent.metadata.invoice_id, 10);
      if (!invoiceId) {
        throw new Error(`Payment intent ${paymentIntentId} missing invoice_id metadata`);
      }

      // Fetch invoice
      const { rows: invoiceRows } = await client.query(
        `SELECT * FROM invoices WHERE id = $1 FOR UPDATE`,
        [invoiceId]
      );

      if (invoiceRows.length === 0) {
        throw new Error(`Invoice ${invoiceId} not found`);
      }

      const invoice = invoiceRows[0];

      // Check if already paid
      if (invoice.status === 'paid') {
        logger.warn({
          msg: 'Invoice already paid',
          invoiceId,
          paymentIntentId
        });
        await client.query('COMMIT');
        return {
          success: true,
          alreadyPaid: true,
          invoiceId
        };
      }

      const amount = parseFloat(paymentIntent.amount) / 100; // Convert from cents
      const charge = paymentIntent.latest_charge ? 
        await this.stripe.charges.retrieve(paymentIntent.latest_charge) : null;

      // Update invoice status
      await client.query(
        `UPDATE invoices 
         SET status = 'paid',
             date_paid = NOW(),
             stripe_payment_intent_id = $1,
             stripe_invoice_id = $2
         WHERE id = $3`,
        [
          paymentIntentId,
          paymentIntent.invoice || null,
          invoiceId
        ]
      );

      // Record balance update
      await this.balanceService.recordInvoicePayment(
        invoiceId,
        invoice.client_id,
        amount,
        charge?.payment_method_details?.type || 'card',
        paymentIntentId,
        'system'
      );

      // Log activity
      await client.query(
        `INSERT INTO accounting_activity_log (document_type, document_id, action, performed_by, details, created_at)
         VALUES ('invoice', $1, 'paid', 'system', $2, NOW())`,
        [
          invoiceId,
          JSON.stringify({
            payment_intent_id: paymentIntentId,
            amount: amount,
            payment_method: charge?.payment_method_details?.type || 'card'
          })
        ]
      );

      await client.query('COMMIT');

      logger.info({
        msg: 'Invoice payment processed',
        invoiceId,
        paymentIntentId,
        amount
      });

      return {
        success: true,
        invoiceId,
        amount,
        paymentIntentId
      };
    } catch (error) {
      await client.query('ROLLBACK');
      logger.error({
        msg: 'Error processing invoice payment',
        paymentIntentId,
        error: error.message,
        stack: error.stack
      });
      throw error;
    } finally {
      client.release();
    }
  }

  /**
   * Process credit request refund
   * @param {number} creditRequestId - Credit request ID
   * @param {string} paymentIntentId - Original Stripe payment intent ID (optional)
   * @returns {Promise<Object>} Refund processing result
   */
  async processCreditRequestRefund(creditRequestId, paymentIntentId = null) {
    const client = await this.pool.connect();
    try {
      await client.query('BEGIN');

      // Fetch credit request
      const { rows: crRows } = await client.query(
        `SELECT * FROM credit_requests WHERE id = $1 FOR UPDATE`,
        [creditRequestId]
      );

      if (crRows.length === 0) {
        throw new Error(`Credit request ${creditRequestId} not found`);
      }

      const creditRequest = crRows[0];

      if (creditRequest.status === 'paid') {
        logger.warn({
          msg: 'Credit request already paid',
          creditRequestId
        });
        await client.query('COMMIT');
        return {
          success: true,
          alreadyPaid: true,
          creditRequestId
        };
      }

      const amount = parseFloat(creditRequest.amount) || 0;
      if (amount <= 0) {
        throw new Error(`Credit request ${creditRequestId} has invalid amount: ${amount}`);
      }

      let refund = null;
      let refundId = null;

      // If payment intent ID provided, refund the original payment
      if (paymentIntentId) {
        try {
          // Get the charge from payment intent
          const paymentIntent = await this.stripe.paymentIntents.retrieve(paymentIntentId);
          const chargeId = paymentIntent.latest_charge;

          if (chargeId) {
            // Create refund
            refund = await this.stripe.refunds.create({
              charge: chargeId,
              amount: Math.round(amount * 100), // Convert to cents
              metadata: {
                credit_request_id: String(creditRequestId),
                credit_request_number: creditRequest.credit_request_number || `PFI-${creditRequestId}`
              }
            });
            refundId = refund.id;
          }
        } catch (error) {
          logger.warn({
            msg: 'Could not process Stripe refund, will record as manual refund',
            creditRequestId,
            paymentIntentId,
            error: error.message
          });
          // Continue without Stripe refund - manual processing
        }
      }

      // Update credit request status
      await client.query(
        `UPDATE credit_requests 
         SET status = 'paid',
             date_paid = NOW(),
             stripe_refund_id = $1
         WHERE id = $2`,
        [refundId, creditRequestId]
      );

      // Record balance update
      await this.balanceService.recordCreditRequestPayment(
        creditRequestId,
        creditRequest.client_id,
        amount,
        refund ? 'card' : 'manual',
        refundId,
        'system'
      );

      // Log activity
      await client.query(
        `INSERT INTO accounting_activity_log (document_type, document_id, action, performed_by, details, created_at)
         VALUES ('credit_request', $1, 'paid', 'system', $2, NOW())`,
        [
          creditRequestId,
          JSON.stringify({
            refund_id: refundId,
            amount: amount,
            payment_method: refund ? 'card' : 'manual'
          })
        ]
      );

      await client.query('COMMIT');

      logger.info({
        msg: 'Credit request refund processed',
        creditRequestId,
        refundId,
        amount
      });

      return {
        success: true,
        creditRequestId,
        amount,
        refundId,
        refund
      };
    } catch (error) {
      await client.query('ROLLBACK');
      logger.error({
        msg: 'Error processing credit request refund',
        creditRequestId,
        error: error.message,
        stack: error.stack
      });
      throw error;
    } finally {
      client.release();
    }
  }

  /**
   * Handle Stripe webhook event for accounting payments
   * @param {Object} event - Stripe webhook event
   * @returns {Promise<Object>} Processing result
   */
  async handleStripeWebhook(event) {
    try {
      switch (event.type) {
        case 'payment_intent.succeeded':
          if (event.data.object.metadata.invoice_id) {
            return await this.processInvoicePayment(event.data.object.id);
          }
          break;

        case 'charge.refunded':
          // Handle refunds if needed
          logger.info({
            msg: 'Charge refunded webhook received',
            chargeId: event.data.object.id
          });
          break;

        default:
          logger.debug({
            msg: 'Unhandled Stripe webhook event',
            type: event.type
          });
      }

      return {
        success: true,
        handled: false
      };
    } catch (error) {
      logger.error({
        msg: 'Error handling Stripe webhook',
        eventType: event.type,
        error: error.message,
        stack: error.stack
      });
      throw error;
    }
  }
}

module.exports = AccountingPaymentService;
