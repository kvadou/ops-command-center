/**
 * Accounting Payment Webhook Routes
 * Handles Stripe webhooks for accounting payments
 */

const express = require('express');
const router = express.Router();
const { pool, stripe } = global;
const AccountingPaymentService = require('../services/accounting-payment-service');
const { logger } = require('../utils/logger');
const { asyncHandler } = require('../middleware/error-handler');

const paymentService = new AccountingPaymentService(pool, stripe);

// Stripe webhook endpoint for accounting payments
router.post('/webhook', express.raw({ type: 'application/json' }), asyncHandler(async (req, res) => {
  const sig = req.headers['stripe-signature'];
  const webhookSecret = process.env.STRIPE_WEBHOOK_SECRET_ACCOUNTING || process.env.STRIPE_WEBHOOK_SECRET;

  if (!webhookSecret) {
    logger.warn({ msg: 'Stripe webhook secret not configured for accounting payments' });
    return res.status(400).json({ error: 'Webhook secret not configured' });
  }

  let event;

  try {
    event = stripe.webhooks.constructEvent(req.body, sig, webhookSecret);
  } catch (err) {
    logger.error({
      msg: 'Webhook signature verification failed',
      error: err.message
    });
    return res.status(400).json({ error: `Webhook Error: ${err.message}` });
  }

  try {
    // Handle the event
    const result = await paymentService.handleStripeWebhook(event);

    logger.info({
      msg: 'Stripe webhook processed',
      eventType: event.type,
      eventId: event.id
    });

    res.json({ received: true, handled: result.handled });
  } catch (error) {
    logger.error({
      msg: 'Error processing Stripe webhook',
      eventType: event.type,
      eventId: event.id,
      error: error.message,
      stack: error.stack
    });
    res.status(500).json({ error: 'Webhook processing failed', details: error.message });
  }
}));

module.exports = router;
