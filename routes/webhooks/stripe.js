const express = require('express');
const router = express.Router();

// Globals used by the Stripe webhook handler
const {
  axios,
  stripe,
  tutorCruncherAPI,
} = global;

// Service imports
const subscriptionNotificationService = require('../../services/subscription-notification-service');
const { createOrUpdateClient, createOrUpdateRecipient } = require('../../utils/clientManager');
const { tableExists } = require('../../utils/schema-cache');
const GoogleAdsService = require('../../services/google-ads-api');
const googleAdsService = new GoogleAdsService();

// Database pool routing for franchise locations
const { getPool } = require('../../database-connections');

// Structured logger and webhook idempotency utilities
const { logger } = require('../../utils/logger');
const {
  isEventProcessed,
  claimEvent,
  markEventCompleted,
  markEventFailed,
} = require('../../utils/webhook-idempotency');
const { getTutorCruncherCountryId } = require('../../utils/tutorcruncherCountry');

/**
 * Stripe webhook handler for checkout.session.completed events
 * This automatically processes payments even if the user doesn't reach the success page
 */
router.post('/', express.raw({ type: 'application/json' }), async (req, res) => {
  // Use location-aware database pool
  const pool = req.locationPool || global.pool;

  // Wrap entire handler in try-catch to ensure we always return a response
  try {
    const sig = req.headers['stripe-signature'];
    const webhookSecret = process.env.STRIPE_WEBHOOK_SECRET;

    logger.info({ hasSignature: !!sig, hasSecret: !!webhookSecret }, 'Stripe webhook received');

    if (!webhookSecret) {
      logger.error('STRIPE_WEBHOOK_SECRET not set — cannot verify webhook signatures. This is a server misconfiguration.');
      return res.status(500).json({ error: 'Webhook secret not configured' });
    }

    if (!sig) {
      logger.error('Stripe webhook signature header missing');
      return res.status(400).json({ error: 'Missing stripe-signature header' });
    }

    let event;

    try {
      event = stripe.webhooks.constructEvent(req.body, sig, webhookSecret);
      logger.info({ eventType: event.type, eventId: event.id }, 'Stripe webhook signature verified');
    } catch (err) {
      logger.error({
        error: err.message,
        hint: 'Check if STRIPE_WEBHOOK_SECRET matches Stripe Dashboard'
      }, 'Stripe webhook signature verification failed');

      return res.status(400).json({
        error: 'Signature verification failed'
      });
    }

    // Check for duplicate event (idempotency)
    if (await isEventProcessed(pool, event.id, 'stripe')) {
      logger.info({ eventId: event.id, eventType: event.type }, 'Skipping duplicate Stripe event');
      return res.status(200).json({ received: true, duplicate: true });
    }

    // Claim the event
    const claimed = await claimEvent(pool, event.id, 'stripe', event.type, { livemode: event.livemode });
    if (!claimed) {
      logger.info({ eventId: event.id }, 'Stripe event already claimed');
      return res.status(200).json({ received: true, duplicate: true });
    }

    // Handle payment failure events - create DevOps alerts
    if (event.type === 'payment_intent.payment_failed' ||
        event.type === 'charge.failed' ||
        event.type === 'invoice.payment_failed') {

      const paymentData = event.data.object;
      const environment = process.env.NODE_ENV === 'production' ?
        (process.env.APP_NAME?.includes('westside') ? 'westside' :
         process.env.APP_NAME?.includes('eastside') ? 'eastside' : 'main') : 'development';

      logger.error(`💳 Payment failure detected: ${event.type}`);
      logger.error(`   Payment ID: ${paymentData.id}`);
      logger.error(`   Amount: ${paymentData.amount ? (paymentData.amount / 100) : 'N/A'}`);
      logger.error(`   Customer: ${paymentData.customer || 'N/A'}`);
      logger.error(`   Reason: ${paymentData.failure_reason || paymentData.last_payment_error?.message || 'Unknown'}`);

      // Extract submission ID from metadata
      const submissionId = paymentData.metadata?.submissionId ? parseInt(paymentData.metadata.submissionId) : null;

      // Create DevOps alert for payment failure
      try {
        await pool.query(`
          INSERT INTO devops_alerts
            (environment, alert_type, severity, title, message, context, source, status)
          VALUES ($1, 'payment_failure', 'critical', $2, $3, $4, 'stripe_webhook', 'open')
        `, [
          environment,
          `Payment Failed: ${event.type}`,
          `Payment failure detected. Reason: ${paymentData.failure_reason || paymentData.last_payment_error?.message || 'Unknown'}. ${submissionId ? `Submission ID: ${submissionId}` : ''}`,
          JSON.stringify({
            eventType: event.type,
            paymentId: paymentData.id,
            amount: paymentData.amount ? (paymentData.amount / 100) : null,
            currency: paymentData.currency || 'usd',
            customerId: paymentData.customer,
            failureReason: paymentData.failure_reason || paymentData.last_payment_error?.message,
            failureCode: paymentData.failure_code || paymentData.last_payment_error?.code,
            metadata: paymentData.metadata,
            submissionId: submissionId
          })
        ]);

        // If we have a submission ID, update the submission's payment status
        if (submissionId) {
          try {
            const failureMessage = paymentData.failure_reason || paymentData.last_payment_error?.message || 'Payment processing failed';
            await pool.query(`
              UPDATE booking_submissions
              SET payment_status = 'failed',
                  credit_request_error = true,
                  credit_request_error_message = $1
              WHERE id = $2
            `, [failureMessage, submissionId]);
            logger.info(`✅ Updated submission ${submissionId} payment status to failed`);
          } catch (updateError) {
            logger.error({ error: updateError.message }, `⚠️ Failed to update submission ${submissionId}:`);
          }
        }

        logger.info(`✅ Created DevOps alert for payment failure: ${paymentData.id}`);
      } catch (alertError) {
        logger.error({ err: alertError }, 'Error creating payment failure alert:');
      }

      return res.status(200).json({ received: true, processed: true });
    }

    // Handle checkout session with failed payment
    if (event.type === 'checkout.session.completed' &&
        event.data.object.payment_status !== 'paid') {

      const session = event.data.object;
      const environment = process.env.NODE_ENV === 'production' ?
        (process.env.APP_NAME?.includes('westside') ? 'westside' :
         process.env.APP_NAME?.includes('eastside') ? 'eastside' : 'main') : 'development';

        logger.error(`💳 Checkout session completed with failed payment: ${session.id}`);
        logger.error(`   Payment Status: ${session.payment_status}`);
        logger.error(`   Submission ID: ${session.metadata?.submissionId || 'N/A'}`);

      // Create DevOps alert with submission ID properly linked
      try {
        const submissionId = session.metadata?.submissionId ? parseInt(session.metadata.submissionId) : null;

        await pool.query(`
          INSERT INTO devops_alerts
            (environment, alert_type, severity, title, message, context, source, status)
          VALUES ($1, 'payment_failure', 'critical', $2, $3, $4, 'stripe_webhook', 'open')
        `, [
          environment,
          `Checkout Session Failed: ${session.id}`,
          `Checkout session completed but payment status is '${session.payment_status}'. ${submissionId ? `Submission ID: ${submissionId}` : 'No submission ID found.'}`,
          JSON.stringify({
            sessionId: session.id,
            paymentStatus: session.payment_status,
            amountTotal: session.amount_total ? (session.amount_total / 100) : null,
            submissionId: submissionId,
            customerEmail: session.customer_email,
            customerId: session.customer,
            paymentIntentId: session.payment_intent
          })
        ]);

        // If we have a submission ID, also update the submission's payment status
        if (submissionId) {
          try {
            await pool.query(`
              UPDATE booking_submissions
              SET payment_status = $1,
                  credit_request_error = true,
                  credit_request_error_message = $2
              WHERE id = $3
            `, [
              session.payment_status === 'unpaid' ? 'failed' : session.payment_status,
              `Stripe checkout session failed: ${session.payment_status}`,
              submissionId
            ]);
            logger.info(`✅ Updated submission ${submissionId} payment status to failed`);
          } catch (updateError) {
            logger.error({ error: updateError.message }, `⚠️ Failed to update submission ${submissionId}:`);
          }
        }

        logger.info(`✅ Created DevOps alert for failed checkout session: ${session.id}`);
      } catch (alertError) {
        logger.error({ err: alertError }, 'Error creating checkout failure alert:');
      }
    }

    // Handle subscription events
    if (event.type === 'invoice.payment_succeeded') {
      const invoice = event.data.object;
      const subscriptionId = invoice.subscription;

      logger.info(`✅ Subscription invoice payment succeeded: ${invoice.id}`);
      logger.info(`   Subscription ID: ${subscriptionId}`);
      logger.info(`   Amount: $${(invoice.amount_paid / 100).toFixed(2)}`);

      if (subscriptionId) {
        try {
          // Find enrollment by subscription ID
          const enrollmentResult = await pool.query(
            'SELECT * FROM subscription_enrollments WHERE stripe_subscription_id = $1',
            [subscriptionId]
          );

          if (enrollmentResult.rows.length > 0) {
            const enrollment = enrollmentResult.rows[0];

            // Get billing period from invoice
            const billingPeriodStart = new Date(invoice.period_start * 1000);
            const billingMonth = new Date(billingPeriodStart.getFullYear(), billingPeriodStart.getMonth(), 1);
            const amountPaid = invoice.amount_paid / 100;

            // For monthly billing subscriptions, create credit request in TutorCruncher
            // This credits the client's account so lessons can charge against it
            if (enrollment.payment_type === 'monthly' && enrollment.client_id && amountPaid > 0) {
              try {
                // Get enrollment metadata to determine lessons count
                const metadata = typeof enrollment.metadata === 'string'
                  ? JSON.parse(enrollment.metadata)
                  : (enrollment.metadata || {});

                // Get billing history to determine lessons for this month
                const billingHistoryResult = await pool.query(
                  'SELECT lessons_count FROM subscription_billing_history WHERE enrollment_id = $1 AND billing_month = $2',
                  [enrollment.id, billingMonth.toISOString().split('T')[0]]
                );

                const lessonsCount = billingHistoryResult.rows[0]?.lessons_count || metadata.current_month_lessons || 1;

                logger.info(`💳 Creating credit request for monthly billing client ${enrollment.client_id}: $${amountPaid} for ${lessonsCount} lesson(s)`);

                const creditRequestPayload = {
                  amount: parseFloat(amountPaid.toFixed(2)),
                  client: parseInt(enrollment.client_id), // Ensure client ID is an integer
                  send_pfi: false, // Don't auto-raise — Stripe already collected payment, just create the accounting record
                  description: `Monthly Subscription Payment: $${amountPaid.toFixed(2)} for ${lessonsCount} lesson${lessonsCount !== 1 ? 's' : ''} (${billingMonth.toLocaleDateString('en-US', { month: 'long', year: 'numeric' })})`
                };

                logger.info({ data: creditRequestPayload }, `📋 Monthly credit request payload:`);
                const creditResponse = await tutorCruncherAPI.post('/proforma-invoices/', creditRequestPayload);
                const creditRequestId = creditResponse.data.id;
                const creditRequestStatus = creditResponse.data.status;
                logger.info(`✅ Created credit request (proforma invoice) ID: ${creditRequestId}, Status: ${creditRequestStatus}`);

                // Wait for credit request to be fully created
                await new Promise(resolve => setTimeout(resolve, 1500));

                // Mark credit as paid immediately (payment already processed via Stripe)
                try {
                  await tutorCruncherAPI.post(`/proforma-invoices/${creditRequestId}/take_payment/`, {
                    amount: parseFloat(amountPaid.toFixed(2)),
                    method: 'cash', // Record as externally paid — Stripe subscription already collected the payment
                    send_receipt: false
                  });
                  logger.info(`✅ Marked credit request ${creditRequestId} as paid: $${amountPaid}`);

                  // Update enrollment metadata with credit request ID
                  const updatedMetadata = {
                    ...metadata,
                    creditRequestIds: [...(metadata.creditRequestIds || []), {
                      creditRequestId: creditRequestId,
                      billingMonth: billingMonth.toISOString().split('T')[0],
                      amount: amountPaid,
                      lessons: lessonsCount
                    }]
                  };

                  await pool.query(
                    `UPDATE subscription_enrollments SET metadata = $1 WHERE id = $2`,
                    [JSON.stringify(updatedMetadata), enrollment.id]
                  );
                } catch (paymentError) {
                  logger.error({ error: paymentError.response?.data || paymentError.message }, `⚠️ Failed to mark credit request as paid:`);
                  logger.error(`🚨 MANUAL ACTION REQUIRED: Credit request ${creditRequestId} created but not marked as paid for client ${enrollment.client_id}`);
                  // Send payment failure alert
                  try {
                    const SlackAlerts = require('../../utils/slackAlerts');
                    const slackAlerts = new SlackAlerts();
                    await slackAlerts.sendPaymentFailureAlert({
                      failureType: 'take_payment',
                      errorMessage: paymentError.response?.data?.detail || paymentError.message || 'Unknown error',
                      clientId: enrollment.client_id,
                      amount: amountPaid,
                      creditRequestId: creditRequestId,
                      stripeSessionId: invoice.id,
                      environment: process.env.APP_NAME?.includes('westside') ? 'westside' : process.env.APP_NAME?.includes('eastside') ? 'eastside' : 'production'
                    });
                  } catch (alertErr) { logger.error({ error: alertErr.message }, '❌ Failed to send payment failure alert'); }
                }
              } catch (creditError) {
                logger.error({ error: creditError.response?.data || creditError.message }, `❌ Failed to create credit request for monthly billing:`);
                logger.error(`🚨 MANUAL ACTION REQUIRED: Monthly subscription payment received but no credit request created for client ${enrollment.client_id}`);
                // Send payment failure alert
                try {
                  const SlackAlerts = require('../../utils/slackAlerts');
                  const slackAlerts = new SlackAlerts();
                  await slackAlerts.sendPaymentFailureAlert({
                    failureType: 'credit_request_creation',
                    errorMessage: creditError.response?.data?.detail || creditError.message || 'Unknown error',
                    clientId: enrollment.client_id,
                    amount: amountPaid,
                    stripeSessionId: invoice.id,
                    environment: process.env.APP_NAME?.includes('westside') ? 'westside' : process.env.APP_NAME?.includes('eastside') ? 'eastside' : 'production'
                  });
                } catch (alertErr) { logger.error({ error: alertErr.message }, '❌ Failed to send payment failure alert'); }
              }
            }

            // Update or create billing history (will be created by monthly processor, just update here)
            // First try to update existing record
            const updateResult = await pool.query(
              `UPDATE subscription_billing_history
               SET status = $1,
                   stripe_invoice_id = $2,
                   amount_charged = $3,
                   billed_at = NOW(),
                   updated_at = NOW()
               WHERE enrollment_id = $4
                 AND billing_month = $5`,
              [
                'succeeded',
                invoice.id,
                amountPaid,
                enrollment.id,
                billingMonth.toISOString().split('T')[0]
              ]
            );

            // If no rows were updated, create a new billing history record
            if (updateResult.rowCount === 0) {
              // Get lessons count from metadata or use default
              const lessonsCount = metadata.current_month_lessons || metadata.initialCharge?.lessons || 1;
              await pool.query(
                `INSERT INTO subscription_billing_history (
                  enrollment_id, billing_month, lessons_count, amount_charged,
                  stripe_invoice_id, status, billed_at
                ) VALUES ($1, $2, $3, $4, $5, $6, NOW())`,
                [
                  enrollment.id,
                  billingMonth.toISOString().split('T')[0],
                  lessonsCount,
                  amountPaid,
                  invoice.id,
                  'succeeded'
                ]
              );
            }

            logger.info(`✅ Updated billing history for enrollment ${enrollment.id}`);

            // Send payment success notification
            try {
              const billingHistoryResult = await pool.query(
                'SELECT * FROM subscription_billing_history WHERE enrollment_id = $1 AND billing_month = $2',
                [enrollment.id, billingMonth.toISOString().split('T')[0]]
              );

              if (billingHistoryResult.rows.length > 0) {
                const billingHistory = billingHistoryResult.rows[0];

                // Get customer email from Stripe
                const customer = await stripe.customers.retrieve(invoice.customer);

                await subscriptionNotificationService.sendPaymentSuccess(
                  enrollment,
                  billingHistory,
                  {
                    parentName: customer.name || 'Parent',
                    parentEmail: customer.email
                  }
                );
              }
            } catch (notifError) {
              logger.error({ err: notifError }, 'Error sending payment success notification:');
              // Don't fail webhook if notification fails
            }
          }
        } catch (error) {
          logger.error({ err: error }, 'Error processing invoice.payment_succeeded:');
        }
      }

      return res.status(200).json({ received: true, processed: true });
    }

    if (event.type === 'invoice.payment_failed') {
      const invoice = event.data.object;
      const subscriptionId = invoice.subscription;

      logger.error(`❌ Subscription invoice payment failed: ${invoice.id}`);
      logger.error(`   Subscription ID: ${subscriptionId}`);
      logger.error(`   Amount: $${(invoice.amount_due / 100).toFixed(2)}`);
      logger.error(`   Attempt count: ${invoice.attempt_count}`);

      if (subscriptionId) {
        try {
          // Find enrollment
          const enrollmentResult = await pool.query(
            'SELECT * FROM subscription_enrollments WHERE stripe_subscription_id = $1',
            [subscriptionId]
          );

          if (enrollmentResult.rows.length > 0) {
            const enrollment = enrollmentResult.rows[0];

            // Get failure details
            const failureReason = invoice.last_payment_error?.message || 'Payment processing failed';
            const errorCode = invoice.last_payment_error?.code || 'unknown';
            const retryCount = invoice.attempt_count || 1;
            const maxRetries = 3;

            // Record payment failure
            await pool.query(
              `INSERT INTO subscription_payment_failures (
                enrollment_id, failure_reason, retry_attempt,
                stripe_error_code, stripe_error_message, amount
              ) VALUES ($1, $2, $3, $4, $5, $6)`,
              [
                enrollment.id,
                failureReason,
                retryCount,
                errorCode,
                failureReason,
                invoice.amount_due / 100
              ]
            );

            // Update billing history
            const billingPeriodStart = new Date(invoice.period_start * 1000);
            const billingMonth = new Date(billingPeriodStart.getFullYear(), billingPeriodStart.getMonth(), 1);

            await pool.query(
              `UPDATE subscription_billing_history
               SET status = 'failed', updated_at = NOW()
               WHERE enrollment_id = $1
                 AND billing_month = $2`,
              [enrollment.id, billingMonth.toISOString().split('T')[0]]
            );

            // If 3+ attempts, suspend subscription
            if (invoice.attempt_count >= 3) {
              await pool.query(
                `UPDATE subscription_enrollments
                 SET status = 'suspended', updated_at = NOW()
                 WHERE id = $1`,
                [enrollment.id]
              );

              logger.info(`⚠️ Subscription ${subscriptionId} suspended after 3 failed attempts`);
            }

            logger.info(`✅ Recorded payment failure for enrollment ${enrollment.id}`);

            // Send payment failure notification
            try {
              const customer = await stripe.customers.retrieve(invoice.customer);
              const failureRecord = {
                amount: invoice.amount_due / 100,
                error_message: invoice.last_payment_error?.message || 'Payment processing failed',
                retry_attempt: invoice.attempt_count || 1
              };

              await subscriptionNotificationService.sendPaymentFailure(
                enrollment,
                failureRecord,
                {
                  parentName: customer.name || 'Parent',
                  parentEmail: customer.email,
                  retryCount: invoice.attempt_count || 1,
                  maxRetries: 3
                }
              );
            } catch (notifError) {
              logger.error({ err: notifError }, 'Error sending payment failure notification:');
              // Don't fail webhook if notification fails
            }
          }
        } catch (error) {
          logger.error({ err: error }, 'Error processing invoice.payment_failed:');
        }
      }

      return res.status(200).json({ received: true, processed: true });
    }

    if (event.type === 'customer.subscription.deleted') {
      const subscription = event.data.object;
      const subscriptionId = subscription.id;

      logger.info(`🗑️ Subscription deleted: ${subscriptionId}`);

      if (subscriptionId) {
        try {
          // Find enrollment and mark as cancelled
          const enrollmentResult = await pool.query(
            'SELECT * FROM subscription_enrollments WHERE stripe_subscription_id = $1',
            [subscriptionId]
          );

          if (enrollmentResult.rows.length > 0) {
            const enrollment = enrollmentResult.rows[0];

            await pool.query(
              'UPDATE subscription_enrollments SET status = $1 WHERE id = $2',
              ['cancelled', enrollment.id]
            );

            logger.info(`✅ Marked enrollment ${enrollment.id} as cancelled`);

            // Send cancellation notification
            try {
              const customer = await stripe.customers.retrieve(subscription.customer);

              await subscriptionNotificationService.sendCancellationNotification(
                enrollment,
                {
                  parentName: customer.name || 'Parent',
                  parentEmail: customer.email,
                  reason: 'Subscription cancelled'
                }
              );
            } catch (notifError) {
              logger.error({ err: notifError }, 'Error sending cancellation notification:');
            }
          }
        } catch (error) {
          logger.error({ err: error }, 'Error processing customer.subscription.deleted:');
        }
      }

      return res.status(200).json({ received: true, processed: true });
    }

    if (event.type === 'invoice.upcoming') {
      const invoice = event.data.object;
      const subscriptionId = invoice.subscription;

      logger.info(`📅 Upcoming invoice: ${invoice.id} for subscription ${subscriptionId}`);

      // This event fires 3 days before billing - we can send reminder emails here
      // Implementation will be in notification service

      return res.status(200).json({ received: true, processed: true });
    }

    // Handle the event
    if (event.type === 'checkout.session.completed') {
      const session = event.data.object;

      logger.info(`✅ Stripe checkout.session.completed event received`);
      logger.info(`   Session ID: ${session.id}`);
      logger.info(`   Mode: ${session.mode}`);
      logger.info(`   Payment Status: ${session.payment_status}`);
      logger.info({ data: session.metadata }, `   Metadata:`);

      // Handle setup mode Checkout Sessions (for subscription payment method collection)
      if (session.mode === 'setup' && session.metadata?.submission_id && session.metadata?.service_id) {
        logger.info(`🔄 Processing setup mode Checkout Session for subscription setup`);

        try {
          // Retrieve the Checkout Session to get the payment method
          const fullSession = await stripe.checkout.sessions.retrieve(session.id, {
            expand: ['setup_intent.payment_method']
          });

          const setupIntent = fullSession.setup_intent;
          const paymentMethodId = typeof setupIntent === 'string'
            ? null
            : setupIntent?.payment_method;

          if (!paymentMethodId) {
            logger.error(`❌ No payment method found in setup mode Checkout Session ${session.id}`);
            return res.status(200).json({ received: true, error: 'No payment method found' });
          }

          logger.info(`✅ Payment method collected: ${paymentMethodId}`);

          // Complete subscription setup by calling the subscription creation endpoint
          // Process SYNCHRONOUSLY to ensure completion before responding to Stripe
          // This ensures enrollment exists when success page loads
          try {
            const baseUrl = process.env.APP_URL || process.env.HEROKU_APP_URL || 'http://localhost:5000';
            const subscriptionUrl = `${baseUrl}/api/subscriptions/create`;

            // Fetch booking submission data if submissionId exists
            let bookingData = null;
            const submissionId = session.metadata.submission_id !== 'none' ? parseInt(session.metadata.submission_id) : null;

            if (submissionId) {
              try {
                const { rows } = await pool.query(
                  `SELECT
                    students, slots, address, timezone, booking_type, lesson_type, label_name
                  FROM booking_submissions
                  WHERE id = $1`,
                  [submissionId]
                );

                if (rows.length > 0) {
                  const submission = rows[0];
                  bookingData = {
                    students: submission.students || [],
                    slots: submission.slots || [],
                    address: submission.address || {},
                    timezone: submission.timezone || 'America/New_York',
                    bookingType: submission.booking_type,
                    lessonType: submission.lesson_type,
                    labelName: submission.label_name
                  };
                  logger.info(`✅ Fetched booking data from submission ${submissionId}`);
                }
              } catch (submissionError) {
                logger.error({ error: submissionError.message }, `⚠️ Could not fetch submission ${submissionId} data:`);
                // Continue without bookingData - subscription creation will still work
              }
            }

            const subscriptionPayload = {
              serviceId: session.metadata.service_id,
              clientId: session.metadata.client_id !== 'none' ? session.metadata.client_id : null,
              stripeCustomerId: session.customer,
              paymentMethodId: paymentMethodId,
              enrollmentDate: session.metadata.enrollment_date,
              submissionId: submissionId,
              parentEmail: session.metadata.parent_email,
              parentName: session.metadata.parent_name,
              parentPhone: session.customer_details?.phone || '',
              bookingData: bookingData // Include booking data for TutorCruncher integration
            };

            logger.info(`🔄 Completing subscription setup with payment method...`);
            logger.info(`   Submission ID: ${submissionId}`);
            logger.info(`   Has booking data: ${!!bookingData}`);

            // Use axios which is available globally
            // Retry logic: try up to 3 times with exponential backoff
            let lastError = null;
            let retryCount = 0;
            const maxRetries = 3;

            while (retryCount < maxRetries) {
              try {
                const response = await axios.post(subscriptionUrl, subscriptionPayload, {
                  headers: {
                    'Content-Type': 'application/json',
                  },
                  timeout: 30000,
                });

                if (response.status >= 200 && response.status < 300 && response.data.success) {
                  logger.info(`✅ Subscription setup completed successfully via webhook`);
                  logger.info(`   Enrollment ID: ${response.data.enrollment?.id}`);
                  logger.info(`   Subscription ID: ${response.data.enrollment?.subscriptionId}`);

                  // Update submission with enrollment info if submissionId exists
                  if (submissionId) {
                    try {
                      await pool.query(
                        `UPDATE booking_submissions
                        SET stripe_customer_id = $1,
                            payment_status = 'paid',
                            status = 'completed'
                        WHERE id = $2`,
                        [session.customer, submissionId]
                      );
                      logger.info(`✅ Updated submission ${submissionId} with customer ID and payment status`);

                      // Send payment completed Slack notification
                      try {
                        const SlackAlerts = require('../../utils/slackAlerts');
                        const slackAlerts = new SlackAlerts();
                        await slackAlerts.sendBookingPaymentCompletedNotification({
                          submissionId,
                          parentFirst: bookingData?.parentFirst || session.customer_details?.name?.split(' ')[0],
                          parentLast: bookingData?.parentLast || session.customer_details?.name?.split(' ').slice(1).join(' '),
                          parentEmail: bookingData?.parentEmail || session.customer_details?.email,
                          bookingType: bookingData?.bookingType,
                          labelName: bookingData?.labelName,
                          price: session.amount_total ? session.amount_total / 100 : null,
                          studentCount: bookingData?.students?.length || 1,
                          tcClientId: response.data.enrollment?.tutorcruncherClientId,
                          stripeCustomerId: session.customer,
                          stripeSessionId: session.id,
                          serviceId: session.metadata?.service_id
                        });
                      } catch (slackError) {
                        logger.error({ error: slackError.message }, `⚠️ Could not send payment completed Slack notification:`);
                      }
                    } catch (updateError) {
                      logger.error({ error: updateError.message }, `⚠️ Could not update submission ${submissionId}:`);
                    }
                  }

                  // Success - break out of retry loop
                  break;
                } else {
                  lastError = new Error(`Subscription setup failed: ${response.status} - ${JSON.stringify(response.data)}`);
                  logger.error({ error: response.data }, `❌ Subscription setup failed: ${response.status}`);
                }
              } catch (error) {
                lastError = error;
                logger.error({ error: error.message }, `❌ Error completing subscription setup via webhook (attempt ${retryCount + 1}/${maxRetries}):`);
                if (error.response) {
                  logger.error(`   Response status: ${error.response.status}`);
                  logger.error({ error: error.response.data }, `   Response data:`);
                }
              }

              retryCount++;
              if (retryCount < maxRetries) {
                // Exponential backoff: wait 2^retryCount seconds
                const waitTime = Math.pow(2, retryCount) * 1000;
                logger.info(`⏳ Retrying in ${waitTime / 1000} seconds...`);
                await new Promise(resolve => setTimeout(resolve, waitTime));
              }
            }

            // Check if all retries failed
            if (retryCount >= maxRetries && lastError) {
              // All retries failed - log critical error
              logger.error(`❌ CRITICAL: Subscription setup failed after ${maxRetries} attempts`);
              logger.error({ error: lastError?.message || 'Unknown error' }, `   Last error:`);
              if (lastError?.stack) {
                logger.error({ error: lastError.stack }, `   Stack trace:`);
              }

              // Store error in database for manual review
              if (submissionId) {
                try {
                  await pool.query(
                    `UPDATE booking_submissions
                    SET payment_errors = COALESCE(payment_errors, '[]'::jsonb) || $2::jsonb
                    WHERE id = $1`,
                    [
                      submissionId,
                      JSON.stringify([{
                        type: 'subscription_setup_failed',
                        error: lastError?.message || 'Unknown error',
                        timestamp: new Date().toISOString(),
                        stripe_session_id: session.id,
                        stripe_customer_id: session.customer,
                        retry_count: retryCount
                      }])
                    ]
                  );
                  logger.info(`✅ Stored error in submission ${submissionId} for manual review`);
                } catch (dbError) {
                  logger.error({ error: dbError.message }, `⚠️ Could not store error in database:`);
                }
              }
              // Send payment failure alert
              try {
                const SlackAlerts = require('../../utils/slackAlerts');
                const slackAlerts = new SlackAlerts();
                await slackAlerts.sendPaymentFailureAlert({
                  failureType: 'subscription_setup',
                  errorMessage: lastError?.message || 'Unknown error',
                  amount: session.amount_total ? session.amount_total / 100 : undefined,
                  stripeSessionId: session.id,
                  stripeCustomerId: session.customer,
                  submissionId: submissionId,
                  clientEmail: session.metadata?.parent_email || session.customer_details?.email,
                  clientName: session.metadata?.parent_name,
                  serviceId: session.metadata?.service_id,
                  environment: process.env.APP_NAME?.includes('westside') ? 'westside' : process.env.APP_NAME?.includes('eastside') ? 'eastside' : 'production'
                });
              } catch (alertErr) { logger.error({ error: alertErr.message }, '❌ Failed to send payment failure alert'); }
            }

            // Respond to Stripe after subscription creation completes (or fails)
            await markEventCompleted(pool, event.id, 'stripe');
            return res.status(200).json({ received: true, completed: true });
          } catch (webhookError) {
            logger.error({ error: webhookError.message }, `❌ Error in webhook subscription setup:`);
            if (webhookError.stack) {
              logger.error({ error: webhookError.stack }, `   Stack trace:`);
            }
            // Still return 200 to prevent Stripe retries, but log the error
            await markEventFailed(pool, event.id, 'stripe', webhookError.message);
            return res.status(200).json({ received: true, error: webhookError.message });
          }
        } catch (error) {
          logger.error({ error: error.message }, `❌ Error processing setup mode Checkout Session:`);
          if (error.response) {
            logger.error(`   Response status: ${error.response.status}`);
            logger.error({ error: error.response.data }, `   Response data:`);
          }
          // Return 200 to prevent webhook retries for setup mode
          await markEventFailed(pool, event.id, 'stripe', error.message);
          return res.status(200).json({ received: true, error: error.message });
        }
      }

      // Handle term payment mode checkout sessions (from create-term-payment endpoint)
      if (session.mode === 'payment' && session.payment_status === 'paid' && session.metadata?.enrollment_type === 'term') {
        logger.info(`🔄 Processing term payment Checkout Session for enrollment creation`);

        try {
          const serviceId = session.metadata.service_id;
          const submissionId = session.metadata.submission_id !== 'none' ? parseInt(session.metadata.submission_id) : null;
          const enrollmentDate = session.metadata.enrollment_date;
          let tutorcruncherClientId = session.metadata.tutorcruncher_client_id !== 'pending' ? session.metadata.tutorcruncher_client_id : null;
          const stripeCustomerId = session.customer;
          const amountCharged = parseFloat(session.metadata.amount_charged) || 0;
          const lessons = parseInt(session.metadata.lessons) || 0;
          const totalLessons = parseInt(session.metadata.total_lessons) || 0;
          const discountPercent = parseFloat(session.metadata.discount_percent) || 0;
          const termName = session.metadata.term_name;
          const finalClassDate = session.metadata.final_class_date;

          // Use location-aware pool — franchise bookings (Eastside/Westside) store their
          // location in Stripe metadata so the webhook routes to the correct database
          // even when the webhook is received by the main app
          const metadataLocation = session.metadata.location;
          const termPool = metadataLocation && metadataLocation !== 'production'
            ? getPool(metadataLocation)
            : pool;
          if (metadataLocation && metadataLocation !== 'production') {
            logger.info(`🏢 Using ${metadataLocation} database pool for term payment processing`);
          }

          // Get term billing config to calculate discounted rate
          const termConfigResult = await termPool.query(
            `SELECT rate_per_lesson, term_discount_percent FROM term_billing_configs WHERE service_id = $1 AND is_active = true`,
            [serviceId]
          );

          let ratePerLesson = 0;
          let discountedRatePerLesson = 0;
          if (termConfigResult.rows.length > 0) {
            ratePerLesson = parseFloat(termConfigResult.rows[0].rate_per_lesson) || 0;
            const configDiscountPercent = parseFloat(termConfigResult.rows[0].term_discount_percent) || 0;
            const effectiveDiscountPercent = discountPercent > 0 ? discountPercent : configDiscountPercent;
            discountedRatePerLesson = effectiveDiscountPercent > 0
              ? parseFloat((ratePerLesson * (1 - effectiveDiscountPercent / 100)).toFixed(2))
              : ratePerLesson;
          }

          logger.info(`   Service ID: ${serviceId}`);
          logger.info(`   Submission ID: ${submissionId}`);
          logger.info(`   Stripe Customer: ${stripeCustomerId}`);
          logger.info(`   Amount: $${amountCharged}`);
          logger.info(`   Lessons: ${lessons}/${totalLessons}`);
          logger.info(`   Rate per lesson: $${ratePerLesson}, Discounted rate: $${discountedRatePerLesson}`);

          // Check if enrollment already exists for this session
          const existingEnrollment = await termPool.query(
            `SELECT id FROM subscription_enrollments
             WHERE metadata->>'checkout_session_id' = $1`,
            [session.id]
          );

          if (existingEnrollment.rows.length > 0) {
            logger.info(`⏭️ Enrollment already exists for checkout session ${session.id}, skipping`);
            await markEventCompleted(pool, event.id, 'stripe');
            return res.status(200).json({ received: true, skipped: true, reason: 'Enrollment already exists' });
          }

          // Get submission data if submissionId exists
          let submission = null;
          let recipientIds = [];

          if (submissionId) {
            const submissionResult = await termPool.query(
              `SELECT * FROM booking_submissions WHERE id = $1`,
              [submissionId]
            );

            if (submissionResult.rows.length > 0) {
              submission = submissionResult.rows[0];

              // Create TutorCruncher client if not already created
              if (!tutorcruncherClientId) {
                logger.info(`👤 Creating TutorCruncher client for submission ${submissionId}`);
                const clientPayload = {
                  first_name: submission.parent_first,
                  last_name: submission.parent_last,
                  email: submission.parent_email.toLowerCase(),
                  phone: submission.parent_phone || '',
                  street: submission.address?.street || '',
                  town: submission.address?.city || '',
                  postcode: submission.address?.zip || '',
                  country: getTutorCruncherCountryId(submission.address?.country),
                  calendar_colour: '#50C8DF'
                };

                const clientResult = await createOrUpdateClient(clientPayload, submission.parent_email);
                tutorcruncherClientId = clientResult.clientId;
                logger.info(`✅ Created/updated client ${tutorcruncherClientId}`);

                // Update client with Stripe customer ID
                if (stripeCustomerId) {
                  await termPool.query(
                    `UPDATE clients SET stripe_customer_id = $1 WHERE client_id = $2`,
                    [stripeCustomerId, tutorcruncherClientId]
                  );
                }
              }

              // Create recipients (students) and add to appointments
              if (submission.students && Array.isArray(submission.students) && submission.students.length > 0) {
                logger.info(`👨‍🎓 Creating recipients and adding to appointments`);

                // Get term billing config to get class dates
                const termConfigResult = await termPool.query(
                  `SELECT class_dates FROM term_billing_configs WHERE service_id = $1 AND is_active = true`,
                  [serviceId]
                );

                let classDates = [];
                if (termConfigResult.rows.length > 0) {
                  classDates = termConfigResult.rows[0].class_dates;
                  if (typeof classDates === 'string') {
                    classDates = JSON.parse(classDates);
                  }
                }

                // Get existing recipients for this client
                let existingRecipients = [];
                try {
                  const recipientsResponse = await tutorCruncherAPI.get(`/clients/${tutorcruncherClientId}/recipients/`);
                  existingRecipients = recipientsResponse.data.results || [];
                } catch (error) {
                  logger.info(`⚠️ Could not fetch existing recipients: ${error.message}`);
                }

                // Create recipients
                for (const student of submission.students) {
                  // Normalize student object - handle both formats (first/last/dob OR first_name/last_name/date_of_birth)
                  const normalizedStudent = {
                    first: student.first || student.first_name || '',
                    last: student.last || student.last_name || '',
                    dob: student.dob || student.date_of_birth || '',
                    school: student.school || student.current_school || '',
                    notes: student.notes || ''
                  };

                  if (!normalizedStudent.first || !normalizedStudent.last) {
                    logger.warn({ data: student }, `⚠️ Skipping student - missing first or last name:`);
                    logger.warn(`   CRITICAL: Cannot add client ${tutorcruncherClientId} as recipient - would create duplicate "Client ${tutorcruncherClientId}" entry`);
                    continue; // CRITICAL: Never add client as recipient - always skip if student data is missing
                  }

                  // createOrUpdateRecipient expects: (student, clientId, existingRecipients, colour)
                  // student object should have: first, last, dob, school properties
                  // CRITICAL: Never add client ID as recipient - always create proper student recipient
                  const recipientResult = await createOrUpdateRecipient(
                    normalizedStudent, // Pass normalized student object
                    tutorcruncherClientId,
                    existingRecipients,
                    '#6A469D' // Calendar colour
                  );

                  // Validate that recipient ID is not the same as client ID (prevents duplicate "Client {id}" entries)
                  if (recipientResult.recipientId === tutorcruncherClientId || String(recipientResult.recipientId) === String(tutorcruncherClientId)) {
                    logger.error(`❌ CRITICAL ERROR: Recipient ID (${recipientResult.recipientId}) matches client ID (${tutorcruncherClientId})`);
                    logger.error(`   This would create duplicate "Client ${tutorcruncherClientId}" entry. Skipping service/appointment addition.`);
                    continue; // Skip adding to service/appointments to prevent duplicate
                  }

                  recipientIds.push(recipientResult.recipientId);
                  logger.info(`✅ Created/updated recipient ${recipientResult.recipientId} - ${normalizedStudent.first} ${normalizedStudent.last}`);

                  // Add recipient to service with discounted charge rate
                  // CRITICAL: Only add if recipient ID is different from client ID
                  if (serviceId && discountedRatePerLesson > 0 && recipientResult.recipientId !== tutorcruncherClientId) {
                    try {
                      const addToServicePayload = {
                        recipient: recipientResult.recipientId, // Use student recipient ID, NEVER client ID
                        charge_rate: discountedRatePerLesson
                      };

                      await tutorCruncherAPI.post(`services/${serviceId}/recipient/add/`, addToServicePayload);
                      logger.info(`✅ Added student recipient ${recipientResult.recipientId} to service ${serviceId} with discounted charge rate $${discountedRatePerLesson}`);
                    } catch (serviceError) {
                      const errorMsg = serviceError.response?.data?.error || serviceError.message;
                      if (!/already|exists|duplicate/i.test(errorMsg)) {
                        logger.error({ err: errorMsg }, `⚠️ Failed to add recipient to service:`);
                      } else {
                        logger.info(`ℹ️  Recipient already in service, updating charge rate if needed`);
                        // Try to update charge rate if recipient already exists
                        try {
                          await tutorCruncherAPI.post(`services/${serviceId}/recipient/update/`, {
                            recipient: recipientResult.recipientId,
                            charge_rate: discountedRatePerLesson
                          });
                          logger.info(`✅ Updated charge rate for recipient ${recipientResult.recipientId} in service ${serviceId}`);
                        } catch (updateError) {
                          logger.warn({ data: updateError.response?.data || updateError.message }, `⚠️ Could not update charge rate:`);
                        }
                      }
                    }
                  }

                  // Add recipient to appointments for this service with discounted charge rate
                  if (classDates.length > 0) {
                    try {
                      const appointmentsResponse = await tutorCruncherAPI.get('/appointments/', {
                        params: {
                          service: serviceId,
                          start__gte: new Date().toISOString().split('T')[0]
                        }
                      });

                      const appointments = appointmentsResponse.data.results || [];

                      for (const appointment of appointments) {
                        const appointmentDate = new Date(appointment.start).toISOString().split('T')[0];
                        const isInTerm = classDates.some(date => {
                          const termDate = new Date(date).toISOString().split('T')[0];
                          return termDate === appointmentDate;
                        });

                        if (isInTerm) {
                          try {
                            const recipientPayload = {
                              recipient: recipientResult.recipientId,
                              charge_rate: discountedRatePerLesson > 0 ? discountedRatePerLesson.toFixed(2) : undefined
                            };

                            await tutorCruncherAPI.post(
                              `/appointments/${appointment.id}/recipient/add/`,
                              recipientPayload
                            );
                            logger.info(`✅ Added recipient ${recipientResult.recipientId} to appointment ${appointment.id} with charge rate $${discountedRatePerLesson}`);
                            await new Promise(resolve => setTimeout(resolve, 200)); // Rate limiting
                          } catch (error) {
                            const errorMsg = error.response?.data?.error || error.message;
                            if (!/already|exists|duplicate/i.test(errorMsg)) {
                              logger.error({ err: errorMsg }, `⚠️ Failed to add recipient to appointment ${appointment.id}:`);
                            } else {
                              // Recipient already in appointment, try to update charge rate
                              try {
                                await tutorCruncherAPI.post(`/appointments/${appointment.id}/recipient/update/`, {
                                  recipient: recipientResult.recipientId,
                                  charge_rate: discountedRatePerLesson > 0 ? discountedRatePerLesson.toFixed(2) : undefined
                                });
                                logger.info(`✅ Updated charge rate for recipient ${recipientResult.recipientId} in appointment ${appointment.id}`);
                              } catch (updateError) {
                                logger.warn({ data: updateError.response?.data || updateError.message }, `⚠️ Could not update charge rate in appointment:`);
                              }
                            }
                          }
                        }
                      }
                    } catch (appointmentError) {
                      logger.error({ error: appointmentError.message }, `⚠️ Error adding recipients to appointments:`);
                      // Don't fail enrollment if appointment addition fails
                    }
                  }
                }
              }
            }
          }

          // Create enrollment record for term payment
          // CRITICAL: Set recipient_id to prevent "Client {id}" duplicates in school dashboard
          const primaryRecipientId = recipientIds.length > 0 ? recipientIds[0] : null;

          const enrollmentResult = await termPool.query(
            `INSERT INTO subscription_enrollments (
              service_id, client_id, recipient_id, stripe_customer_id,
              payment_type, enrollment_date, first_billing_date, final_class_date,
              total_lessons_remaining, status, metadata
            ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)
            RETURNING *`,
            [
              serviceId,
              tutorcruncherClientId,
              primaryRecipientId, // CRITICAL: Set recipient_id to prevent client being shown as student
              stripeCustomerId,
              'term',
              enrollmentDate,
              enrollmentDate, // First billing = enrollment date for term payments
              finalClassDate,
              lessons,
              'active',
              JSON.stringify({
                checkout_session_id: session.id,
                payment_intent_id: session.payment_intent,
                amountCharged: amountCharged,
                discountApplied: discountPercent,
                lessons: lessons,
                totalLessons: totalLessons,
                termName: termName,
                submissionId: submissionId,
                recipientIds: recipientIds
              })
            ]
          );

          const enrollment = enrollmentResult.rows[0];
          logger.info(`✅ Created subscription enrollment ${enrollment.id} for term payment`);

          // Create credit request (proforma invoice) in TutorCruncher for the discounted term total
          // This credits the client's account so lessons can charge against it
          if (tutorcruncherClientId && amountCharged > 0) {
            try {
              logger.info(`💳 Creating credit request for client ${tutorcruncherClientId}: $${amountCharged}`);
              const creditRequestPayload = {
                amount: parseFloat(amountCharged.toFixed(2)),
                client: parseInt(tutorcruncherClientId),
                send_pfi: false, // Don't auto-raise — Stripe already collected payment, just create the accounting record
                description: `Term Payment: ${lessons} lesson${lessons !== 1 ? 's' : ''} for ${termName || 'Term'}${discountPercent > 0 ? ` (${discountPercent}% discount applied)` : ''}`
              };

              logger.info({ data: creditRequestPayload }, `📋 Credit request payload:`);
              const creditResponse = await tutorCruncherAPI.post('/proforma-invoices/', creditRequestPayload);
              const creditRequestId = creditResponse.data.id;
              const creditRequestStatus = creditResponse.data.status;
              logger.info(`✅ Created credit request (proforma invoice) ID: ${creditRequestId}, Status: ${creditRequestStatus}`);
              logger.info({ data: creditResponse.data }, `📊 Credit request response:`);

              // Wait a moment for the credit request to be fully created in TutorCruncher
              await new Promise(resolve => setTimeout(resolve, 1500));

              // Mark credit as paid immediately (payment already processed via Stripe)
              try {
                const paymentResponse = await tutorCruncherAPI.post(`/proforma-invoices/${creditRequestId}/take_payment/`, {
                  amount: parseFloat(amountCharged.toFixed(2)),
                  method: 'cash', // Record as externally paid — Stripe already collected the payment
                  send_receipt: false
                });
                logger.info(`✅ Marked credit request ${creditRequestId} as paid: $${amountCharged}`);
                logger.info({ data: paymentResponse.data }, `📊 Payment response:`);

                // Update enrollment metadata with credit request ID
                const updatedMetadata = JSON.parse(enrollment.metadata || '{}');
                updatedMetadata.creditRequestId = creditRequestId;
                updatedMetadata.discountedRatePerLesson = discountedRatePerLesson;
                updatedMetadata.creditRequestCreatedAt = new Date().toISOString();

                await termPool.query(
                  `UPDATE subscription_enrollments SET metadata = $1 WHERE id = $2`,
                  [JSON.stringify(updatedMetadata), enrollment.id]
                );
              } catch (paymentError) {
                logger.error({ error: paymentError.response?.data || paymentError.message }, `⚠️ Failed to mark credit request as paid:`);
                // Still save the credit request ID even if payment marking fails
                const updatedMetadata = JSON.parse(enrollment.metadata || '{}');
                updatedMetadata.creditRequestId = creditRequestId;
                updatedMetadata.creditRequestPaymentError = paymentError.response?.data || paymentError.message;

                await termPool.query(
                  `UPDATE subscription_enrollments SET metadata = $1 WHERE id = $2`,
                  [JSON.stringify(updatedMetadata), enrollment.id]
                );

                // Log error for manual follow-up
                logger.error(`🚨 MANUAL ACTION REQUIRED: Credit request ${creditRequestId} created but not marked as paid for client ${tutorcruncherClientId}`);
                // Send payment failure alert
                try {
                  const SlackAlerts = require('../../utils/slackAlerts');
                  const slackAlerts = new SlackAlerts();
                  await slackAlerts.sendPaymentFailureAlert({
                    failureType: 'take_payment',
                    errorMessage: paymentError.response?.data?.detail || paymentError.message || 'Unknown error',
                    clientId: tutorcruncherClientId,
                    clientName: submission ? `${submission.parent_first} ${submission.parent_last}` : undefined,
                    clientEmail: submission?.parent_email,
                    amount: amountCharged,
                    stripeSessionId: session.id,
                    stripeCustomerId: stripeCustomerId,
                    submissionId: submissionId,
                    creditRequestId: creditRequestId,
                    serviceId: serviceId,
                    environment: metadataLocation || 'production'
                  });
                } catch (alertErr) { logger.error({ error: alertErr.message }, '❌ Failed to send payment failure alert'); }
              }
            } catch (creditError) {
              logger.error({ error: creditError.response?.data || creditError.message }, `❌ Failed to create credit request:`);
              // Save error in enrollment metadata for tracking
              try {
                const updatedMetadata = JSON.parse(enrollment.metadata || '{}');
                updatedMetadata.creditRequestError = creditError.response?.data || creditError.message;
                updatedMetadata.creditRequestErrorAt = new Date().toISOString();

                await termPool.query(
                  `UPDATE subscription_enrollments SET metadata = $1 WHERE id = $2`,
                  [JSON.stringify(updatedMetadata), enrollment.id]
                );
              } catch (metaUpdateError) {
                logger.error({ error: metaUpdateError.message }, `⚠️ Could not save credit request error to metadata:`);
              }
              // Send payment failure alert
              try {
                const SlackAlerts = require('../../utils/slackAlerts');
                const slackAlerts = new SlackAlerts();
                await slackAlerts.sendPaymentFailureAlert({
                  failureType: 'credit_request_creation',
                  errorMessage: creditError.response?.data?.detail || creditError.message || 'Unknown error',
                  clientId: tutorcruncherClientId,
                  clientName: submission ? `${submission.parent_first} ${submission.parent_last}` : undefined,
                  clientEmail: submission?.parent_email,
                  amount: amountCharged,
                  stripeSessionId: session.id,
                  stripeCustomerId: stripeCustomerId,
                  submissionId: submissionId,
                  serviceId: serviceId,
                  environment: metadataLocation || 'production'
                });
              } catch (alertErr) { logger.error({ error: alertErr.message }, '❌ Failed to send payment failure alert'); }
            }
          }

          // Update submission status if submissionId exists
          if (submissionId) {
            try {
              await termPool.query(
                `UPDATE booking_submissions
                SET stripe_customer_id = $1,
                    stripe_session_id = $2,
                    tc_client_id = $3,
                    payment_status = 'paid',
                    status = 'completed'
                WHERE id = $4`,
                [stripeCustomerId, session.id, tutorcruncherClientId, submissionId]
              );
              logger.info(`✅ Updated submission ${submissionId} with payment status, customer ID, and client ID`);

              // Send payment completed Slack notification
              try {
                const SlackAlerts = require('../../utils/slackAlerts');
                const slackAlerts = new SlackAlerts();
                await slackAlerts.sendBookingPaymentCompletedNotification({
                  submissionId,
                  parentFirst: submission.parent_first,
                  parentLast: submission.parent_last,
                  parentEmail: submission.parent_email,
                  bookingType: submission.booking_type,
                  labelName: submission.label_name,
                  price: submission.total_price || session.amount_total / 100,
                  studentCount: submission.students?.length || 1,
                  tcClientId: tutorcruncherClientId,
                  stripeCustomerId,
                  stripeSessionId: session.id,
                  recipientIds,
                  serviceId
                });
              } catch (slackError) {
                logger.error({ error: slackError.message }, `⚠️ Could not send payment completed Slack notification:`);
              }

              // Send ops email notification (matching legacy flow behavior)
              try {
                const sendEmail = global.sendEmail;
                if (sendEmail && typeof sendEmail === 'function') {
                  await sendEmail({
                    ...submission,
                    tc_client_id: tutorcruncherClientId,
                    landing_url: submission.landing_url || null,
                    landingUrl: submission.landing_url || null,
                    label_name: submission.label_name || null,
                    jobDescForEmail: `Term payment: ${lessons} lesson(s) for ${termName || 'Term'}. ${recipientIds.length} recipient(s) added to appointments.`,
                  });
                  logger.info(`📧 Term payment notification email sent for submission ${submissionId}`);
                } else {
                  logger.warn(`⚠️ sendEmail function not available for term payment submission ${submissionId}`);
                }
              } catch (emailError) {
                logger.error({ error: emailError.message }, `⚠️ Could not send term payment notification email:`);
              }
            } catch (updateError) {
              logger.error({ error: updateError.message }, `⚠️ Could not update submission ${submissionId}:`);
            }
          }

          await markEventCompleted(pool, event.id, 'stripe');
          return res.status(200).json({ received: true, processed: true, enrollmentId: enrollment.id });
        } catch (termPaymentError) {
          logger.error({ error: termPaymentError.message }, `❌ Error processing term payment checkout session:`);
          logger.error({ error: termPaymentError.stack }, `   Stack trace:`);

          // Store error for manual review if submissionId exists
          const submissionId = session.metadata?.submission_id !== 'none' ? parseInt(session.metadata.submission_id) : null;
          const metaLoc = session.metadata?.location;
          const errorPool = metaLoc && metaLoc !== 'production' ? getPool(metaLoc) : pool;
          if (submissionId) {
            try {
              await errorPool.query(
                `UPDATE booking_submissions
                SET payment_errors = COALESCE(payment_errors, '[]'::jsonb) || $2::jsonb
                WHERE id = $1`,
                [
                  submissionId,
                  JSON.stringify([{
                    type: 'term_enrollment_creation_failed',
                    error: termPaymentError.message,
                    timestamp: new Date().toISOString(),
                    stripe_session_id: session.id,
                    stripe_customer_id: session.customer
                  }])
                ]
              );
            } catch (dbError) {
              logger.error({ error: dbError.message }, `⚠️ Could not store error in database:`);
            }
          }

          // Return 200 to prevent Stripe retries but log the error
          await markEventFailed(pool, event.id, 'stripe', termPaymentError.message);
          return res.status(200).json({ received: true, error: termPaymentError.message });
        }
      }

      // Handle monthly billing payment mode checkout sessions
      // TODO: Add location-aware pool routing (like term payment handler above) for franchise bookings
      if (session.mode === 'payment' && session.payment_status === 'paid' && session.metadata?.enrollment_type === 'monthly') {
        logger.info(`🔄 Processing monthly billing payment Checkout Session for subscription setup`);

        try {
          const serviceId = session.metadata.service_id;
          const submissionId = session.metadata.submission_id !== 'none' ? parseInt(session.metadata.submission_id) : null;
          const stripeCustomerId = session.customer;

          logger.info(`   Service ID: ${serviceId}`);
          logger.info(`   Submission ID: ${submissionId}`);
          logger.info(`   Stripe Customer: ${stripeCustomerId}`);

          // Check if enrollment already exists for this session
          const existingEnrollment = await pool.query(
            `SELECT id FROM subscription_enrollments
             WHERE metadata->>'checkout_session_id' = $1`,
            [session.id]
          );

          if (existingEnrollment.rows.length > 0) {
            logger.info(`⏭️ Enrollment already exists for checkout session ${session.id}, skipping`);
            await markEventCompleted(pool, event.id, 'stripe');
            return res.status(200).json({ received: true, skipped: true, reason: 'Enrollment already exists' });
          }

          // Retrieve payment intent to get payment method
          const paymentIntentId = session.payment_intent;
          if (!paymentIntentId) {
            throw new Error('No payment intent found in checkout session');
          }

          const paymentIntent = await stripe.paymentIntents.retrieve(paymentIntentId);
          const paymentMethodId = paymentIntent.payment_method;

          if (!paymentMethodId) {
            throw new Error('No payment method found in payment intent');
          }

          logger.info(`✅ Payment method found: ${paymentMethodId}`);

          // Fetch booking submission data if submissionId exists
          let bookingData = null;
          if (submissionId) {
            try {
              const { rows } = await pool.query(
                `SELECT
                  students, slots, address, timezone, booking_type, lesson_type, label_name
                FROM booking_submissions
                WHERE id = $1`,
                [submissionId]
              );

              if (rows.length > 0) {
                const submission = rows[0];
                // Parse JSON fields if they're strings
                let students = submission.students;
                let slots = submission.slots;
                let address = submission.address;

                if (typeof students === 'string') {
                  try {
                    students = JSON.parse(students);
                  } catch (e) {
                    students = [];
                  }
                }
                if (typeof slots === 'string') {
                  try {
                    slots = JSON.parse(slots);
                  } catch (e) {
                    slots = [];
                  }
                }
                if (typeof address === 'string') {
                  try {
                    address = JSON.parse(address);
                  } catch (e) {
                    address = {};
                  }
                }

                bookingData = {
                  students: students || [],
                  slots: slots || [],
                  address: address || {},
                  timezone: submission.timezone || 'America/New_York',
                  bookingType: submission.booking_type,
                  lessonType: submission.lesson_type,
                  labelName: submission.label_name,
                  parentFirst: submission.parent_first,
                  parentLast: submission.parent_last,
                  parentEmail: submission.parent_email,
                  parentPhone: submission.parent_phone
                };
                logger.info(`✅ Fetched booking data from submission ${submissionId}`);
              }
            } catch (submissionError) {
              logger.error({ error: submissionError.message }, `⚠️ Could not fetch submission ${submissionId} data:`);
            }
          }

          // Call subscription creation endpoint to complete setup
          // For internal calls, use the same Express app instance
          // In production, use HEROKU_APP_URL or construct from request
          let baseUrl = process.env.APP_URL || process.env.HEROKU_APP_URL;
          if (!baseUrl && req.get('host')) {
            // Construct from request if env vars not set
            const protocol = req.protocol || 'https';
            baseUrl = `${protocol}://${req.get('host')}`;
          }
          if (!baseUrl) {
            baseUrl = 'http://localhost:5000'; // Fallback for local development
          }
          const subscriptionUrl = `${baseUrl}/api/subscriptions/create`;

          const subscriptionPayload = {
            serviceId: serviceId,
            clientId: session.metadata.client_id !== 'none' ? session.metadata.client_id : null,
            stripeCustomerId: stripeCustomerId,
            paymentMethodId: paymentMethodId,
            enrollmentDate: session.metadata.enrollment_date,
            submissionId: submissionId,
            parentEmail: session.metadata.parent_email,
            parentName: session.metadata.parent_name,
            parentPhone: session.customer_details?.phone || '',
            bookingData: bookingData
          };

          logger.info(`🔄 Creating subscription with payment method...`);
          logger.info(`   Subscription URL: ${subscriptionUrl}`);
          logger.info({ data: {
            ...subscriptionPayload,
            bookingData: bookingData ? { ...bookingData, students: bookingData.students?.length || 0 } : null
          } }, `   Payload:`);

          let subscriptionResponse;
          try {
            subscriptionResponse = await axios.post(subscriptionUrl, subscriptionPayload, {
              timeout: 30000, // 30 second timeout
              headers: {
                'Content-Type': 'application/json'
              }
            });
          } catch (axiosError) {
            logger.error({ error: axiosError.message }, `❌ Axios error calling subscription creation endpoint:`);
            if (axiosError.response) {
              logger.error(`   Response status: ${axiosError.response.status}`);
              logger.error({ data: axiosError.response.data }, `   Response data:`);
            }
            throw new Error(`Failed to call subscription creation endpoint: ${axiosError.message}`);
          }

          if (subscriptionResponse.data.success) {
            logger.info({ data: subscriptionResponse.data.subscriptionId }, `✅ Subscription created successfully:`);

            // Update payment status and TutorCruncher client ID in booking_submissions
            if (submissionId) {
              try {
                const enrollment = subscriptionResponse.data.enrollment;
                // Get TutorCruncher client ID from enrollment response or session metadata
                let tutorcruncherClientId = enrollment?.tutorcruncherClientId || null;
                if (!tutorcruncherClientId && session.metadata?.client_id && session.metadata.client_id !== 'none') {
                  tutorcruncherClientId = parseInt(session.metadata.client_id);
                }

                // If still no client ID, try to find it from the enrollment metadata
                if (!tutorcruncherClientId && enrollment?.id) {
                  try {
                    const enrollmentResult = await pool.query(
                      `SELECT metadata FROM subscription_enrollments WHERE id = $1`,
                      [enrollment.id]
                    );
                    if (enrollmentResult.rows.length > 0) {
                      const metadata = enrollmentResult.rows[0].metadata;
                      if (metadata?.tutorcruncherClientId) {
                        tutorcruncherClientId = metadata.tutorcruncherClientId;
                      }
                    }
                  } catch (metaError) {
                    logger.warn({ data: metaError.message }, `⚠️ Could not fetch enrollment metadata:`);
                  }
                }

                // Ensure param types are deterministic (Postgres can error if it can't infer $n types)
                const tcClientIdInt = tutorcruncherClientId ? parseInt(String(tutorcruncherClientId), 10) : null;
                const stripeCustomerIdStr =
                  typeof session.customer === 'string' ? session.customer : session.customer?.id || null;

                await pool.query(
                  `UPDATE booking_submissions
                  SET payment_status = 'paid',
                      stripe_session_id = $2::text,
                      stripe_customer_id = $3::text,
                      tc_client_id = COALESCE($4::integer, tc_client_id)
                  WHERE id = $1::integer`,
                  [submissionId, session.id, stripeCustomerIdStr, tcClientIdInt]
                );

                logger.info(`✅ Updated submission ${submissionId}: payment_status=paid, stripe_session_id=${session.id}`);
                if (tutorcruncherClientId) {
                  logger.info(`✅ Updated submission ${submissionId} with TutorCruncher client ID: ${tutorcruncherClientId}`);
                }

                // Send payment completed Slack notification
                try {
                  const SlackAlerts = require('../../utils/slackAlerts');
                  const slackAlerts = new SlackAlerts();
                  await slackAlerts.sendBookingPaymentCompletedNotification({
                    submissionId,
                    parentFirst: bookingData?.parentFirst || session.metadata?.parent_name?.split(' ')[0],
                    parentLast: bookingData?.parentLast || session.metadata?.parent_name?.split(' ').slice(1).join(' '),
                    parentEmail: bookingData?.parentEmail || session.metadata?.parent_email,
                    bookingType: bookingData?.bookingType,
                    labelName: bookingData?.labelName,
                    price: session.amount_total / 100,
                    studentCount: bookingData?.students?.length || 1,
                    tcClientId: tutorcruncherClientId,
                    stripeCustomerId: stripeCustomerIdStr,
                    stripeSessionId: session.id,
                    serviceId
                  });
                } catch (slackError) {
                  logger.error({ error: slackError.message }, `⚠️ Could not send payment completed Slack notification:`);
                }
              } catch (updateError) {
                logger.error({ error: updateError.message }, `⚠️ Could not update submission ${submissionId}:`);
                // Don't fail webhook delivery (subscription likely exists), but store error for ops visibility
                try {
                  await pool.query(
                    `UPDATE booking_submissions
                     SET payment_errors = COALESCE(payment_errors, '[]'::jsonb) || $2::jsonb
                     WHERE id = $1`,
                    [
                      submissionId,
                      JSON.stringify([{
                        type: 'monthly_billing_submission_update_failed',
                        error: updateError.message,
                        timestamp: new Date().toISOString(),
                        stripe_session_id: session.id,
                        stripe_customer_id: session.customer
                      }])
                    ]
                  );
                } catch (dbError) {
                  logger.error({ error: dbError.message }, `⚠️ Could not store update failure for submission ${submissionId}:`);
                }
              }
            }

            await markEventCompleted(pool, event.id, 'stripe');
            return res.status(200).json({
              received: true,
              processed: true,
              subscriptionId: subscriptionResponse.data.subscriptionId
            });
          } else {
            throw new Error(subscriptionResponse.data.error || 'Subscription creation failed');
          }
        } catch (monthlyBillingError) {
          logger.error({ error: monthlyBillingError.message }, `❌ Error processing monthly billing checkout session:`);
          logger.error({ error: monthlyBillingError.stack }, `   Stack trace:`);

          // Store error for manual review if submissionId exists
          const submissionId = session.metadata?.submission_id !== 'none' ? parseInt(session.metadata.submission_id) : null;
          if (submissionId) {
            try {
              await pool.query(
                `UPDATE booking_submissions
                SET payment_errors = COALESCE(payment_errors, '[]'::jsonb) || $2::jsonb
                WHERE id = $1`,
                [
                  submissionId,
                  JSON.stringify([{
                    type: 'monthly_billing_subscription_creation_failed',
                    error: monthlyBillingError.message,
                    timestamp: new Date().toISOString(),
                    stripe_session_id: session.id,
                    stripe_customer_id: session.customer
                  }])
                ]
              );
            } catch (dbError) {
              logger.error({ error: dbError.message }, `⚠️ Could not store error in database:`);
            }
          }

          // Send payment failure alert
          try {
            const SlackAlerts = require('../../utils/slackAlerts');
            const slackAlerts = new SlackAlerts();
            await slackAlerts.sendPaymentFailureAlert({
              failureType: 'subscription_setup',
              errorMessage: monthlyBillingError.message || 'Unknown error',
              amount: session.amount_total ? session.amount_total / 100 : undefined,
              stripeSessionId: session.id,
              stripeCustomerId: session.customer,
              submissionId: submissionId,
              clientEmail: session.metadata?.parent_email || session.customer_details?.email,
              clientName: session.metadata?.parent_name,
              serviceId: session.metadata?.service_id,
              environment: process.env.APP_NAME?.includes('westside') ? 'westside' : process.env.APP_NAME?.includes('eastside') ? 'eastside' : 'production'
            });
          } catch (alertErr) { logger.error({ error: alertErr.message }, '❌ Failed to send payment failure alert'); }

          // Return 200 to prevent Stripe retries but log the error
          await markEventFailed(pool, event.id, 'stripe', monthlyBillingError.message);
          return res.status(200).json({ received: true, error: monthlyBillingError.message });
        }
      }

      // Only process if payment was successful (regular payment mode)
      if (session.payment_status === 'paid' && session.metadata?.submissionId) {
        const submissionId = parseInt(session.metadata.submissionId);

        // Track payment completion event
        try {
          // Get session_id from submission to link the event
          const { rows: eventRows } = await pool.query(
            `SELECT session_id FROM booking_form_events WHERE submission_id = $1 LIMIT 1`,
            [submissionId]
          );

          const formSessionId = eventRows[0]?.session_id;

          if (formSessionId) {
            await pool.query(
              `INSERT INTO booking_form_events
               (session_id, submission_id, event_type, step_name, step_number, metadata)
               VALUES ($1, $2, $3, $4, $5, $6::jsonb)`,
              [
                formSessionId,
                submissionId,
                'payment_completed',
                'payment',
                4,
                JSON.stringify({
                  stripeSessionId: session.id,
                  paymentStatus: session.payment_status,
                  amountTotal: session.amount_total,
                }),
              ]
            );
            logger.info(`✅ Payment completion event tracked for submission ${submissionId}`);
          }
        } catch (err) {
          logger.error({ err: err }, 'Error tracking payment completion event:');
          // Don't fail webhook if tracking fails
        }

        // Upload offline conversion to Google Ads using gclid captured at booking time
        // This closes the attribution loop: ad click → booking → payment
        try {
          const { rows: gclidRows } = await pool.query(
            `SELECT utm->>'gclid' AS gclid, created_at FROM booking_submissions WHERE id = $1`,
            [submissionId]
          );
          const gclid = gclidRows[0]?.gclid;
          const conversionDateTime = gclidRows[0]?.created_at || new Date();
          const conversionValue = session.amount_total ? session.amount_total / 100 : 0;

          await googleAdsService.uploadConversion(gclid, conversionValue, conversionDateTime);
        } catch (gadsErr) {
          // Never let conversion upload failure affect payment processing
          logger.error({ err: gadsErr }, 'Error during Google Ads offline conversion upload');
        }

        logger.info(`🔄 Processing payment for submission ${submissionId} via Stripe webhook`);

        // Check current payment status to avoid duplicate processing
        try {
          const { rows } = await pool.query(
            `SELECT payment_status, tc_client_id FROM booking_submissions WHERE id = $1`,
            [submissionId]
          );

          if (rows.length === 0) {
            logger.error(`❌ Submission ${submissionId} not found`);
            await markEventCompleted(pool, event.id, 'stripe');
            return res.status(200).json({ received: true, error: 'Submission not found' });
          }

          const submission = rows[0];

          // Skip if already processed
          if (submission.payment_status === 'paid' && submission.tc_client_id) {
            logger.info(`⏭️ Submission ${submissionId} already processed, skipping`);
            await markEventCompleted(pool, event.id, 'stripe');
            return res.status(200).json({ received: true, skipped: true, reason: 'Already processed' });
          }

          // Process payment synchronously to ensure completion before responding
          try {
            const baseUrl = process.env.APP_URL || process.env.HEROKU_APP_URL || 'http://localhost:3000';
            const url = `${baseUrl}/api/submissions/${submissionId}/payment-status`;

            logger.info(`🔄 Processing payment for submission ${submissionId} at ${url}`);

            const response = await axios.patch(url, { status: 'paid' }, {
              headers: {
                'Content-Type': 'application/json',
              },
              timeout: 25000, // 25s timeout (under Heroku 30s limit)
            });

            if (response.status >= 200 && response.status < 300) {
              logger.info(`✅ Payment processing completed for submission ${submissionId} via Stripe webhook`);
              await markEventCompleted(pool, event.id, 'stripe');
            } else {
              logger.error(`❌ Failed to process payment for submission ${submissionId}: ${response.status} ${response.statusText}`);
              await markEventFailed(pool, event.id, 'stripe', `Payment processing returned ${response.status}`);
            }
          } catch (processingError) {
            logger.error({ error: processingError.message }, `❌ Error processing payment for submission ${submissionId} via webhook:`);
            if (processingError.response) {
              logger.error(`   Response status: ${processingError.response.status}`);
              logger.error({ error: processingError.response.data }, `   Response data:`);
            }

            // Store error for manual review
            try {
              await pool.query(
                `UPDATE booking_submissions
                 SET payment_errors = COALESCE(payment_errors, '[]'::jsonb) || $2::jsonb
                 WHERE id = $1`,
                [
                  submissionId,
                  JSON.stringify([{
                    type: 'webhook_payment_processing_failed',
                    error: processingError.message,
                    timestamp: new Date().toISOString(),
                    stripe_session_id: session.id,
                    stripe_customer_id: session.customer
                  }])
                ]
              );
            } catch (dbError) {
              logger.error({ error: dbError.message }, `⚠️ Could not store error in database:`);
            }

            // Send payment failure alert
            try {
              const SlackAlerts = require('../../utils/slackAlerts');
              const slackAlerts = new SlackAlerts();
              await slackAlerts.sendPaymentFailureAlert({
                failureType: 'payment_processing',
                errorMessage: processingError.message || 'Unknown error',
                amount: session.amount_total ? session.amount_total / 100 : undefined,
                stripeSessionId: session.id,
                stripeCustomerId: session.customer,
                submissionId: submissionId,
                clientEmail: session.customer_details?.email,
                environment: process.env.APP_NAME?.includes('westside') ? 'westside' : process.env.APP_NAME?.includes('eastside') ? 'eastside' : 'production'
              });
            } catch (alertErr) { logger.error({ error: alertErr.message }, '❌ Failed to send payment failure alert'); }

            await markEventFailed(pool, event.id, 'stripe', processingError.message);
          }

          return res.status(200).json({ received: true, processing: true });

        } catch (error) {
          logger.error({ err: error }, `❌ Error checking submission ${submissionId}:`);
          // Return 200 - database errors shouldn't cause webhook failures
          await markEventFailed(pool, event.id, 'stripe', error.message);
          return res.status(200).json({ received: true, error: error.message });
        }
      } else {
        logger.info(`⏭️ Skipping session ${session.id} - payment_status: ${session.payment_status}, submissionId: ${session.metadata?.submissionId || 'missing'}`);
        await markEventCompleted(pool, event.id, 'stripe');
        return res.status(200).json({ received: true, skipped: true });
      }
    } else {
      logger.info({ eventType: event.type }, 'Unhandled Stripe event type');
      await markEventCompleted(pool, event.id, 'stripe');
      return res.status(200).json({ received: true, unhandled: event.type });
    }

    // Mark event as completed for all successful paths that didn't return early
    await markEventCompleted(pool, event.id, 'stripe');

  } catch (error) {
    logger.error({
      error: error.message,
      stack: error.stack,
      eventId: event?.id,
      eventType: event?.type
    }, 'Unexpected error in Stripe webhook handler');

    // Mark event as failed
    if (event?.id) {
      await markEventFailed(pool, event.id, 'stripe', error.message);
    }

    // Always return 200 to prevent Stripe from retrying
    if (!res.headersSent) {
      return res.status(200).json({
        received: true,
        error: 'Internal error processing webhook',
        message: error.message
      });
    }
  }
});

// Handle Package webhook events (CREATED_A_PACKAGE, EDITED_A_PACKAGE)
async function handlePackageWebhook(event, pool) {
  const dbPool = pool || global.pool;

  if (!dbPool) {
    logger.error('❌ No database pool available for package webhook');
    return;
  }

  try {
    logger.info('🔄 Starting handlePackageWebhook function');
    const packageData = event.subject;

    if (!packageData || !packageData.id) {
      logger.error('❌ Missing package data or package ID in webhook');
      return;
    }

    logger.info(`📦 Processing package ${packageData.id} - Action: ${event.action}`);

    // Use webhook subject data directly (API endpoint doesn't exist)
    // The webhook payload should contain all necessary package data
    let fullPackage = packageData;

    // If webhook data is incomplete, try to get additional fields from event
    if (!fullPackage.name && event.package?.name) {
      fullPackage.name = event.package.name;
    }
    if (!fullPackage.description && event.package?.description) {
      fullPackage.description = event.package.description;
    }
    if (!fullPackage.cost && event.package?.cost) {
      fullPackage.cost = event.package.cost;
    }
    if (!fullPackage.bonus_credit && event.package?.bonus_credit) {
      fullPackage.bonus_credit = event.package.bonus_credit;
    }

    logger.info(`✅ Using package data from webhook for package ${fullPackage.id}: ${fullPackage.name || 'Unnamed'}`);

    const packageId = fullPackage.id;
    const name = fullPackage.name || '';
    const description = fullPackage.description || '';
    const cost = parseFloat(fullPackage.cost || 0);
    const bonusCredit = parseFloat(fullPackage.bonus_credit || 0);
    const totalValue = cost + bonusCredit;
    const icon = fullPackage.icon || '';
    const iconColour = fullPackage.icon_colour || fullPackage.icon_colour || '#000000';
    const sortIndex = parseInt(fullPackage.sort_index || fullPackage.sort_index || 0);
    const active = fullPackage.active !== undefined ? fullPackage.active : (fullPackage.is_active !== undefined ? fullPackage.is_active : true);
    const timesBought = parseInt(fullPackage.times_bought || fullPackage.times_bought || 0);
    const dateCreated = fullPackage.date_created || fullPackage.created || new Date();

    // Check if packages table exists (cached)
    const pkgExists = await tableExists(dbPool, 'packages');

    if (!pkgExists) {
      logger.warn('⚠️ Packages table does not exist. Run migration first.');
      return;
    }

    const insertQuery = `
      INSERT INTO packages (
        id, name, description, cost, bonus_credit, total_value,
        icon, icon_colour, sort_index, active, times_bought,
        date_created, last_updated
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, NOW())
      ON CONFLICT (id) DO UPDATE SET
        name = EXCLUDED.name,
        description = EXCLUDED.description,
        cost = EXCLUDED.cost,
        bonus_credit = EXCLUDED.bonus_credit,
        total_value = EXCLUDED.total_value,
        icon = EXCLUDED.icon,
        icon_colour = EXCLUDED.icon_colour,
        sort_index = EXCLUDED.sort_index,
        active = EXCLUDED.active,
        times_bought = EXCLUDED.times_bought,
        last_updated = NOW()
    `;

    await dbPool.query(insertQuery, [
      packageId,
      name,
      description,
      cost,
      bonusCredit,
      totalValue,
      icon,
      iconColour,
      sortIndex,
      active,
      timesBought,
      dateCreated
    ]);

    logger.info(`✅ Successfully stored package ${packageId} in database`);

  } catch (error) {
    logger.error({ err: error }, '❌ Error processing package webhook:');
    logger.error({ error: error.stack }, 'Error stack:');
    logger.error({ error: {
      message: error.message,
      code: error.code,
      detail: error.detail
    } }, 'Error details:');
    throw error;
  }
}

module.exports = router;
module.exports.handlePackageWebhook = handlePackageWebhook;
