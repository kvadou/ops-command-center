/**
 * Lesson Billing Service
 *
 * Core billing orchestration for lesson completion → invoice → payment flow.
 * Replaces TutorCruncher's billing functionality.
 *
 * SAFETY: All operations are gated by feature flags in config/billing-flags.js
 * By default, this service does NOTHING until explicitly enabled.
 *
 * Entry point: processLessonBilling(appointment)
 * - Called from server-fns.js when APPOINTMENT_STATUS_CHANGED webhook fires with status='completed'
 *
 * Payment flow:
 * 1. Check available_balance (prepaid credit)
 * 2. If sufficient → deduct from balance → done
 * 3. If partial/none → charge Stripe for remaining
 * 4. If Stripe fails → schedule retry in 3 days
 */

const { logger } = require('../utils/logger');
const billingFlags = require('../config/billing-flags');
const idempotencyService = require('./idempotency');
const BalanceCalculationService = require('./balance-calculation-service');

class LessonBillingService {
  constructor(pool) {
    this.pool = pool;
    this.balanceService = new BalanceCalculationService(pool);
  }

  /**
   * Main entry point - process billing for a completed lesson
   *
   * @param {Object} appointment - Completed appointment data
   * @param {number} appointment.id - Appointment ID
   * @param {number} appointment.client_id - Client ID
   * @param {number} appointment.charge_rate - Amount to charge
   * @param {string} appointment.service_id - Service/Job ID
   * @returns {Promise<Object>} Billing result
   */
  async processLessonBilling(appointment) {
    // Safety check: early exit if billing system is disabled
    if (!billingFlags.isActive()) {
      logger.debug({
        msg: 'Lesson billing skipped - system disabled',
        appointmentId: appointment.id
      });
      return { skipped: true, reason: 'billing_system_disabled' };
    }

    // Safety check: only process if STC is the invoice source
    if (!billingFlags.isSTCBilling()) {
      logger.debug({
        msg: 'Lesson billing skipped - TutorCruncher is invoice source',
        appointmentId: appointment.id
      });
      return { skipped: true, reason: 'tutorcruncher_is_invoice_source' };
    }

    // Idempotency: prevent duplicate processing
    const idempotencyKey = `lesson_billing:apt_${appointment.id}`;

    return await idempotencyService.executeOnce(idempotencyKey, async () => {
      // Route to shadow mode or real mode
      if (billingFlags.isShadowMode()) {
        return await this._shadowModeBilling(appointment);
      } else {
        return await this._realModeBilling(appointment);
      }
    });
  }

  /**
   * Shadow mode: log what WOULD happen without executing
   * Used for testing and reconciliation
   */
  async _shadowModeBilling(appointment) {
    const clientId = appointment.client_id;
    const chargeAmount = parseFloat(appointment.charge_rate) || 0;

    // Get current balance
    const balance = await this._getClientBalance(clientId);
    const availableBalance = balance?.available_balance || 0;

    // Calculate what would happen
    let wouldDeductFromBalance = 0;
    let wouldChargeStripe = 0;
    let paymentMethod = 'none';

    if (availableBalance >= chargeAmount) {
      wouldDeductFromBalance = chargeAmount;
      paymentMethod = 'balance_only';
    } else if (availableBalance > 0) {
      wouldDeductFromBalance = availableBalance;
      wouldChargeStripe = chargeAmount - availableBalance;
      paymentMethod = 'balance_plus_stripe';
    } else {
      wouldChargeStripe = chargeAmount;
      paymentMethod = 'stripe_only';
    }

    // Check if Stripe charge would succeed
    const stripeCustomerId = balance?.stripe_customer_id;
    const wouldSucceed = paymentMethod === 'balance_only' ||
                         (stripeCustomerId && wouldChargeStripe > 0);

    // Log to shadow_billing_logs table
    await this._logShadowBilling({
      appointmentId: appointment.id,
      clientId,
      lessonCharge: chargeAmount,
      currentAvailableBalance: availableBalance,
      wouldDeductFromBalance,
      wouldChargeStripe,
      paymentMethod,
      wouldSucceed,
      notes: wouldSucceed ? null : 'No Stripe customer ID on file'
    });

    logger.info({
      msg: '🔍 Shadow billing logged',
      appointmentId: appointment.id,
      clientId,
      chargeAmount,
      paymentMethod,
      wouldSucceed
    });

    return {
      shadowMode: true,
      appointmentId: appointment.id,
      wouldDeductFromBalance,
      wouldChargeStripe,
      paymentMethod,
      wouldSucceed
    };
  }

  /**
   * Real mode: actually process the billing
   * Only runs when all safety flags are enabled
   */
  async _realModeBilling(appointment) {
    const clientId = appointment.client_id;
    const chargeAmount = parseFloat(appointment.charge_rate) || 0;

    logger.info({
      msg: '💳 Processing real billing',
      appointmentId: appointment.id,
      clientId,
      chargeAmount
    });

    // Safety check: invoice creation must be enabled
    if (!billingFlags.INVOICE_CREATION_ENABLED) {
      logger.warn({
        msg: 'Real billing aborted - invoice creation disabled',
        appointmentId: appointment.id
      });
      return { skipped: true, reason: 'invoice_creation_disabled' };
    }

    // Step 1: Create invoice record
    const invoice = await this._createInvoice(appointment, chargeAmount);

    // Step 2: Process payment
    const paymentResult = await this._processPayment(invoice, appointment);

    return {
      invoiceId: invoice.id,
      appointmentId: appointment.id,
      ...paymentResult
    };
  }

  /**
   * Create an invoice record for the completed lesson
   */
  async _createInvoice(appointment, chargeAmount) {
    const { rows } = await this.pool.query(
      `INSERT INTO invoices (
        client_id,
        appointment_id,
        service_id,
        amount,
        status,
        billing_source,
        created_at
      ) VALUES ($1, $2, $3, $4, 'pending_payment', 'stc', NOW())
      RETURNING *`,
      [
        appointment.client_id,
        appointment.id,
        appointment.service_id,
        chargeAmount
      ]
    );

    logger.info({
      msg: 'Invoice created',
      invoiceId: rows[0].id,
      clientId: appointment.client_id,
      amount: chargeAmount
    });

    return rows[0];
  }

  /**
   * Process payment for an invoice
   * Balance-first, then Stripe for remaining
   */
  async _processPayment(invoice, appointment) {
    // Safety check: auto payment must be enabled
    if (!billingFlags.AUTO_PAYMENT_ENABLED) {
      logger.info({
        msg: 'Auto payment disabled - invoice left pending',
        invoiceId: invoice.id
      });
      return { status: 'pending', reason: 'auto_payment_disabled' };
    }

    const clientId = invoice.client_id;
    const chargeAmount = parseFloat(invoice.amount);

    // Get current balance
    const balance = await this._getClientBalance(clientId);
    const availableBalance = balance?.available_balance || 0;

    let deductedFromBalance = 0;
    let chargedToStripe = 0;

    // Step 1: Deduct from available balance if any
    if (availableBalance > 0) {
      deductedFromBalance = Math.min(availableBalance, chargeAmount);

      await this.balanceService.updateClientBalance({
        clientId,
        updateType: 'lesson_charge',
        changeAmount: -deductedFromBalance,
        balanceType: 'available_balance',
        description: `Lesson charge - Invoice #${invoice.id}`,
        related: { invoice_id: invoice.id, appointment_id: appointment.id },
        createdBy: 'lesson_billing_service'
      });

      logger.info({
        msg: 'Deducted from balance',
        invoiceId: invoice.id,
        deducted: deductedFromBalance,
        remainingBalance: availableBalance - deductedFromBalance
      });
    }

    // Step 2: Charge Stripe for remaining amount
    const remainingAmount = chargeAmount - deductedFromBalance;

    if (remainingAmount > 0) {
      // Safety check: Stripe charging must be enabled
      if (!billingFlags.STRIPE_CHARGING_ENABLED) {
        logger.warn({
          msg: 'Stripe charging disabled - partial payment only',
          invoiceId: invoice.id,
          remainingAmount
        });
        await this._updateInvoiceStatus(invoice.id, 'partial_payment', {
          deducted_from_balance: deductedFromBalance,
          stripe_disabled: true
        });
        return {
          status: 'partial_payment',
          deductedFromBalance,
          remainingAmount,
          reason: 'stripe_charging_disabled'
        };
      }

      // Attempt Stripe charge
      const stripeResult = await this._chargeStripe(clientId, remainingAmount, invoice.id);

      if (stripeResult.success) {
        chargedToStripe = remainingAmount;
        await this._updateInvoiceStatus(invoice.id, 'paid', {
          deducted_from_balance: deductedFromBalance,
          charged_to_stripe: chargedToStripe,
          stripe_charge_id: stripeResult.chargeId
        });

        logger.info({
          msg: '✅ Invoice fully paid',
          invoiceId: invoice.id,
          deductedFromBalance,
          chargedToStripe
        });

        // Send receipt email if enabled
        if (billingFlags.EMAIL_NOTIFICATIONS_ENABLED) {
          await this._sendReceiptEmail(clientId, invoice.id, chargeAmount);
        }

        return {
          status: 'paid',
          deductedFromBalance,
          chargedToStripe
        };
      } else {
        // Stripe failed - schedule retry
        await this._handlePaymentFailure(invoice, clientId, stripeResult.error);

        return {
          status: 'payment_failed',
          deductedFromBalance,
          error: stripeResult.error,
          retryScheduled: true
        };
      }
    }

    // Fully paid from balance
    await this._updateInvoiceStatus(invoice.id, 'paid', {
      deducted_from_balance: deductedFromBalance,
      paid_from_balance_only: true
    });

    logger.info({
      msg: '✅ Invoice paid from balance',
      invoiceId: invoice.id,
      deductedFromBalance
    });

    return {
      status: 'paid',
      deductedFromBalance,
      chargedToStripe: 0
    };
  }

  /**
   * Charge Stripe for the specified amount
   * TODO: Implement actual Stripe integration
   */
  async _chargeStripe(clientId, amount, invoiceId) {
    // Idempotency key for Stripe
    const idempotencyKey = `stripe_charge:invoice_${invoiceId}`;

    // TODO: Implement actual Stripe charge
    // const stripe = require('stripe')(process.env.STRIPE_SECRET_KEY);
    // const charge = await stripe.charges.create({
    //   amount: Math.round(amount * 100), // cents
    //   currency: 'usd',
    //   customer: stripeCustomerId,
    //   description: `Acme Operations - Invoice #${invoiceId}`,
    //   metadata: { invoice_id: invoiceId, client_id: clientId }
    // }, { idempotencyKey });

    logger.warn({
      msg: 'Stripe charging not yet implemented',
      clientId,
      amount,
      invoiceId
    });

    // Placeholder: return failure until implemented
    return {
      success: false,
      error: 'Stripe integration not yet implemented'
    };
  }

  /**
   * Handle failed payment - schedule retry and notify
   */
  async _handlePaymentFailure(invoice, clientId, error) {
    // Schedule retry for 3 days from now
    const retryDate = new Date();
    retryDate.setDate(retryDate.getDate() + 3);

    await this.pool.query(
      `INSERT INTO payment_retries (
        invoice_id,
        client_id,
        retry_attempt,
        scheduled_at,
        result,
        error_message,
        created_at
      ) VALUES ($1, $2, 1, $3, 'pending', $4, NOW())`,
      [invoice.id, clientId, retryDate, error]
    );

    await this._updateInvoiceStatus(invoice.id, 'payment_failed', {
      payment_failure_reason: error,
      retry_scheduled_at: retryDate
    });

    logger.warn({
      msg: '⚠️ Payment failed - retry scheduled',
      invoiceId: invoice.id,
      clientId,
      error,
      retryDate
    });

    // Send failure notification if enabled
    if (billingFlags.EMAIL_NOTIFICATIONS_ENABLED) {
      await this._sendPaymentFailureEmail(clientId, invoice.id, error);
    }
  }

  /**
   * Get client balance from client_balances table
   */
  async _getClientBalance(clientId) {
    const { rows } = await this.pool.query(
      `SELECT
        invoice_balance,
        available_balance,
        stripe_customer_id
      FROM client_balances
      WHERE client_id = $1`,
      [clientId]
    );
    return rows[0] || null;
  }

  /**
   * Update invoice status
   */
  async _updateInvoiceStatus(invoiceId, status, metadata = {}) {
    await this.pool.query(
      `UPDATE invoices
       SET status = $1,
           auto_payment_attempted = true,
           payment_metadata = $3,
           updated_at = NOW()
       WHERE id = $2`,
      [status, invoiceId, JSON.stringify(metadata)]
    );
  }

  /**
   * Log shadow billing to database for reconciliation
   */
  async _logShadowBilling(data) {
    await this.pool.query(
      `INSERT INTO shadow_billing_logs (
        appointment_id,
        client_id,
        lesson_charge,
        current_available_balance,
        would_deduct_from_balance,
        would_charge_stripe,
        payment_method,
        would_succeed,
        notes,
        timestamp
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, NOW())`,
      [
        data.appointmentId,
        data.clientId,
        data.lessonCharge,
        data.currentAvailableBalance,
        data.wouldDeductFromBalance,
        data.wouldChargeStripe,
        data.paymentMethod,
        data.wouldSucceed,
        data.notes
      ]
    );
  }

  /**
   * Send receipt email to client
   * TODO: Implement email sending
   */
  async _sendReceiptEmail(clientId, invoiceId, amount) {
    logger.info({
      msg: 'Receipt email would be sent',
      clientId,
      invoiceId,
      amount
    });
    // TODO: Implement with email-sender utility
  }

  /**
   * Send payment failure notification
   * TODO: Implement email sending
   */
  async _sendPaymentFailureEmail(clientId, invoiceId, error) {
    logger.info({
      msg: 'Payment failure email would be sent',
      clientId,
      invoiceId,
      error
    });
    // TODO: Implement with email-sender utility
  }

  /**
   * Process scheduled payment retries (called by scheduler)
   */
  async processScheduledRetries() {
    if (!billingFlags.canProcessPayments()) {
      logger.debug({ msg: 'Payment retry processing skipped - payments disabled' });
      return { processed: 0 };
    }

    const { rows: pendingRetries } = await this.pool.query(
      `SELECT pr.*, i.client_id, i.amount
       FROM payment_retries pr
       JOIN invoices i ON pr.invoice_id = i.id
       WHERE pr.result = 'pending'
         AND pr.scheduled_at <= NOW()
       ORDER BY pr.scheduled_at ASC
       LIMIT 50`
    );

    let processed = 0;
    let succeeded = 0;
    let failed = 0;

    for (const retry of pendingRetries) {
      const result = await this._chargeStripe(
        retry.client_id,
        parseFloat(retry.amount),
        retry.invoice_id
      );

      if (result.success) {
        await this._updateInvoiceStatus(retry.invoice_id, 'paid', {
          paid_on_retry: true,
          retry_attempt: retry.retry_attempt,
          stripe_charge_id: result.chargeId
        });

        await this.pool.query(
          `UPDATE payment_retries
           SET result = 'success', executed_at = NOW()
           WHERE id = $1`,
          [retry.id]
        );

        succeeded++;
      } else {
        // Check if this was the final attempt
        if (retry.retry_attempt >= 2) {
          await this._notifyAdminsPaymentFailed(retry);
          await this.pool.query(
            `UPDATE payment_retries
             SET result = 'failed', executed_at = NOW(), error_message = $2
             WHERE id = $1`,
            [retry.id, result.error]
          );
        } else {
          // Schedule another retry
          const nextRetryDate = new Date();
          nextRetryDate.setDate(nextRetryDate.getDate() + 3);

          await this.pool.query(
            `INSERT INTO payment_retries (
              invoice_id, client_id, retry_attempt, scheduled_at, result, created_at
            ) VALUES ($1, $2, $3, $4, 'pending', NOW())`,
            [retry.invoice_id, retry.client_id, retry.retry_attempt + 1, nextRetryDate]
          );

          await this.pool.query(
            `UPDATE payment_retries
             SET result = 'failed', executed_at = NOW(), error_message = $2
             WHERE id = $1`,
            [retry.id, result.error]
          );
        }

        failed++;
      }

      processed++;
    }

    logger.info({
      msg: 'Payment retries processed',
      processed,
      succeeded,
      failed
    });

    return { processed, succeeded, failed };
  }

  /**
   * Notify admins when all retry attempts have failed
   */
  async _notifyAdminsPaymentFailed(retry) {
    // TODO: Send email to support@acmeops.com
    logger.error({
      msg: '🚨 Payment failed after all retries - admin notification required',
      invoiceId: retry.invoice_id,
      clientId: retry.client_id,
      attempts: retry.retry_attempt
    });
  }
}

module.exports = LessonBillingService;
