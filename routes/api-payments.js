const express = require("express");
const router = express.Router();
const { 
  createOrUpdateClient, 
  processPaymentWithTransaction,
  updateAutoChargeWithRetry 
} = require('../utils/clientManager');
const { retryTutorCruncherCall } = require('../utils/tutorCruncherRetry');
const { syncSingleClient } = require('../jobs/sync.service');
const { tutorCruncherAPI } = global;

// Import shared duplicate email prevention utility
const { checkAndMarkEmailSent } = require('../utils/email-duplicate-prevention');

// Import payment/pipeline logic utilities (extracted for testability)
const {
  claimProcessingLock,
  releaseProcessingLock,
  determinePipelineStage,
  determineMarket,
  determineConversionStatus
} = require('../utils/payment-logic');
const { asyncHandler } = require('../middleware/error-handler');
const { logger } = require('../utils/logger');
const {
  getTutorCruncherCountryId,
  getTutorCruncherCountryName,
} = require('../utils/tutorcruncherCountry');

/**
 * Set pipeline stage and create conversion tracking for a client
 * @param {number} clientId - TutorCruncher client ID
 * @param {number} clientLocalId - Local database client ID
 * @param {string} bookingType - Booking type
 * @param {string} lessonType - Lesson type
 * @param {string} labelName - Label name
 * @param {Object} pool - Database pool
 * @returns {Promise<Object>} Result with pipelineStageId and conversionTrackingId
 */
async function setupPipelineTracking(clientId, clientLocalId, bookingType, lessonType, labelName, pool) {
  const result = {
    pipelineStageId: null,
    conversionTrackingId: null,
    errors: []
  };

  try {
    // Determine pipeline stage (passes labelName to skip tournaments and service catalog forms)
    const pipelineStageId = await determinePipelineStage(bookingType, lessonType, labelName, pool);

    if (pipelineStageId) {
      // Get pipeline stage name and current client status
      const stageResult = await pool.query(
        `SELECT name FROM pipeline_stages WHERE id = $1`,
        [pipelineStageId]
      );
      const pipelineStageName = stageResult.rows.length > 0 ? stageResult.rows[0].name : null;

      // Check current client status - only set to prospect if dormant (don't demote live clients)
      const clientStatusResult = await pool.query(
        `SELECT status FROM clients WHERE id = $1`,
        [clientLocalId]
      );
      const currentStatus = clientStatusResult.rows.length > 0 ? clientStatusResult.rows[0].status : null;
      const shouldSetProspect = currentStatus === 'dormant';

      // Update client with pipeline stage, only change status if dormant
      if (shouldSetProspect) {
        await pool.query(
          `UPDATE clients SET pipeline_stage_id = $1, status = 'prospect', updated_at = NOW() WHERE id = $2`,
          [pipelineStageId, clientLocalId]
        );
        logger.info(`✅ Set pipeline stage ${pipelineStageId} (${pipelineStageName}) and status=prospect for client ${clientId} (was dormant)`);
      } else {
        await pool.query(
          `UPDATE clients SET pipeline_stage_id = $1, updated_at = NOW() WHERE id = $2`,
          [pipelineStageId, clientLocalId]
        );
        logger.info(`✅ Set pipeline stage ${pipelineStageId} (${pipelineStageName}) for client ${clientId} (preserved status: ${currentStatus})`);
      }

      // Try to update in TutorCruncher (non-blocking)
      // Only set status to prospect if client was dormant
      try {
        const tcPayload = { pipeline_stage: pipelineStageId };
        if (shouldSetProspect) {
          tcPayload.status = "prospect";
        }
        await tutorCruncherAPI.post(`/clients/${clientId}/`, tcPayload);
        logger.info({ clientId, shouldSetProspect }, '✅ Updated pipeline stage in TutorCruncher');
      } catch (tcError) {
        logger.warn({ data: tcError.message }, `⚠️ Failed to update pipeline stage/status in TutorCruncher for client ${clientId}:`);
        // Continue even if TutorCruncher update fails
      }

      result.pipelineStageId = pipelineStageId;

      // Create conversion tracking entry
      const market = determineMarket(labelName);
      const leadType = 'New Lead'; // Default for new bookings
      const conversionStatus = determineConversionStatus(pipelineStageName, bookingType);

      // Check if conversion tracking already exists
      const existingTracking = await pool.query(
        `SELECT id FROM client_conversion_tracking WHERE client_id = $1`,
        [clientLocalId]
      );

      if (existingTracking.rows.length === 0) {
        const insertResult = await pool.query(
          `INSERT INTO client_conversion_tracking (
            client_id,
            lead_type,
            market,
            conversion_status,
            created_at,
            updated_at
          ) VALUES ($1, $2, $3, $4, NOW(), NOW())
          RETURNING id`,
          [clientLocalId, leadType, market, conversionStatus]
        );

        if (insertResult.rows.length > 0) {
          result.conversionTrackingId = insertResult.rows[0].id;
          logger.info(`✅ Created conversion tracking entry for client ${clientId} (${market}, ${leadType}, ${conversionStatus})`);
        }
      } else {
        logger.info(`ℹ️ Conversion tracking already exists for client ${clientId}, skipping creation`);
        result.conversionTrackingId = existingTracking.rows[0].id;
      }
    } else {
      logger.warn(`⚠️ Could not determine pipeline stage for booking type "${bookingType}", lesson type "${lessonType}"`);
      result.errors.push('Could not determine pipeline stage');
    }
  } catch (error) {
    logger.error({ error: error.message }, `❌ Error setting up pipeline tracking for client ${clientId}:`);
    result.errors.push(error.message);
    // Don't throw - pipeline tracking is not critical for payment processing
  }

  return result;
}

// NOTE: Processing lock is now database-backed (job_processing_claimed_at column)
// No periodic cleanup needed - once a job is created, the lock stays in place
// This is intentional to prevent duplicate job creation across dynos

// Use JSON parsing just for this router
router.use(express.json());

router.post("/create-checkout-session", express.json(), asyncHandler(async (req, res) => {
  // ----- INPUT LOGGING -----
  const { submissionId, price, bookingTypeName, parentEmail } = req.body || {};
  const APP_URL = process.env.APP_URL || "http://localhost:3000";
  logger.info({ data: {
    body: req.body,
    APP_URL,
  } }, '[STRIPE][REQ] /api/create-checkout-session');

  // ----- BASIC VALIDATION -----
  // price must be a number >= 0.50
  const numericPrice = Number(price);
  if (!Number.isFinite(numericPrice)) {
    logger.warn({ data: price }, '[STRIPE][VALIDATION] price is not a finite number:');
    return res.status(400).json({ error: "Invalid price amount." });
  }
  if (numericPrice < 0.5) {
    logger.warn({ data: numericPrice }, '[STRIPE][VALIDATION] price too low:');
    return res.status(400).json({ error: "Amount must be at least $0.50." });
  }
  if (!bookingTypeName) {
    logger.warn('[STRIPE][VALIDATION] missing bookingTypeName');
    return res.status(400).json({ error: "Booking type name is required." });
  }
  if (!submissionId) {
    logger.warn('[STRIPE][VALIDATION] missing submissionId');
    return res.status(400).json({ error: "submissionId is required." });
  }
  if (!parentEmail) {
    logger.warn('[STRIPE][VALIDATION] missing parentEmail');
    return res.status(400).json({ error: "parentEmail is required." });
  }

  try {
    // ----- PULL EXISTING CUSTOMER ID FROM DB -----
    console.time("[DB] lookup stripe_customer_id");
    const { rows } = await pool.query(
      `SELECT stripe_customer_id FROM booking_submissions WHERE id = $1`,
      [submissionId]
    );
    console.timeEnd("[DB] lookup stripe_customer_id");

    let stripeCustomerId = rows?.[0]?.stripe_customer_id || null;

    // ----- FIND EXISTING STRIPE CUSTOMER BY EMAIL -----
    if (!stripeCustomerId) {
      console.time("[STRIPE] customers.list");
      const existing = await stripe.customers.list({
        email: parentEmail,
        limit: 1,
      });
      console.timeEnd("[STRIPE] customers.list");
      if (existing?.data?.length) {
        stripeCustomerId = existing.data[0].id;
        logger.info({ data: stripeCustomerId }, '[STRIPE] found existing customer');
      }
    }

    // ----- CREATE CUSTOMER IF NOT FOUND -----
    if (!stripeCustomerId) {
      console.time("[STRIPE] customers.create");
      const customer = await stripe.customers.create({
        email: parentEmail,
        metadata: { submissionId: String(submissionId) },
      });
      console.timeEnd("[STRIPE] customers.create");
      stripeCustomerId = customer.id;

      console.time("[DB] update stripe_customer_id");
      await pool.query(
        `UPDATE booking_submissions
           SET stripe_customer_id = $2
         WHERE id = $1`,
        [submissionId, stripeCustomerId]
      );
      console.timeEnd("[DB] update stripe_customer_id");
    }

    // ----- CREATE CHECKOUT SESSION -----
    const unit_amount = Math.round(numericPrice * 100); // cents
    logger.info({ data: {
      customer: stripeCustomerId,
      unit_amount,
      bookingTypeName,
      success_url: `${APP_URL}/success?session_id={CHECKOUT_SESSION_ID}&submissionId=${submissionId}`,
      cancel_url: `${APP_URL}/canceled?submissionId=${submissionId}`,
    } }, '[STRIPE] creating checkout.session');

    console.time("[STRIPE] checkout.sessions.create");
    const session = await stripe.checkout.sessions.create({
      mode: "payment",
      customer: stripeCustomerId,
      payment_method_types: ["card"],
      line_items: [
        {
          price_data: {
            currency: "usd",
            product_data: { name: bookingTypeName },
            unit_amount,
          },
          quantity: 1,
        },
      ],
      payment_intent_data: {
        setup_future_usage: "off_session",
      },
      success_url: `${APP_URL}/success?session_id={CHECKOUT_SESSION_ID}&submissionId=${submissionId}`,
      cancel_url: `${APP_URL}/canceled?submissionId=${submissionId}`,
      metadata: { submissionId: String(submissionId) },
      custom_text: {
        submit: {
          message:
            "✅ You'll be redirected to your booking confirmation after payment.",
        },
      },
    });
    console.timeEnd("[STRIPE] checkout.sessions.create");

    logger.info({ data: {
      id: session.id,
      url: session.url,
    } }, '[STRIPE] session created');

    // ----- SAVE SESSION ID -----
    console.time("[DB] update stripe_session_id");
    await pool.query(
      `UPDATE booking_submissions
         SET stripe_session_id = $2
       WHERE id = $1`,
      [submissionId, session.id]
    );
    console.timeEnd("[DB] update stripe_session_id");

    // ----- RESPOND -----
    return res.json({ sessionId: session.id, url: session.url });
  } catch (err) {
    // Log the *exact* stripe error (including .raw if present)
    logger.error({ data: {
      message: err?.message,
      type: err?.type,
      code: err?.code,
      raw: err?.raw, // often contains validation details (e.g. invalid_url)
      stack: err?.stack,
    } }, '🚨 Stripe session creation failed:');
    
    // Track error in database
    const errorData = {
      type: 'checkout_session_creation',
      message: err?.message || "Unknown error",
      code: err?.code,
      stripeType: err?.type,
      timestamp: new Date().toISOString(),
      submissionId: submissionId
    };
    
    try {
      await pool.query(
        `UPDATE booking_submissions
         SET checkout_session_errors = COALESCE(checkout_session_errors, '[]'::jsonb) || $1::jsonb,
             last_error_at = NOW(),
             error_summary = COALESCE(error_summary || E'\\n', '') || $2
       WHERE id = $3`,
        [
          JSON.stringify([errorData]),
          `Checkout session creation failed: ${errorData.message}`,
          submissionId
        ]
      );
    } catch (dbErr) {
      logger.error({ data: dbErr }, 'Failed to save error to database:');
    }
    
    const message =
      (err?.raw && err.raw.message) || err.message || "Unknown error";
    return res.status(500).json({ error: message });
  }
}));

router.patch(
  "/submissions/:id/payment-status",
  express.json(),
  asyncHandler(async (req, res) => {
    const { id } = req.params;
    const { status } = req.body;

    if (status !== "paid") {
      await pool.query(
        `UPDATE booking_submissions
         SET payment_status = $2
       WHERE id = $1`,
        [id, status]
      );
      logger.info({ id, status }, '→ Submission status updated');
      return res.sendStatus(204);
    }

    // Check if processing is already in progress to prevent duplicates (database-level lock)
    // This works across multiple Heroku dynos
    const gotLock = await claimProcessingLock(pool, id);
    if (!gotLock) {
      logger.info(`⏳ Payment processing already in progress for submission ${id}, returning 204`);
      return res.sendStatus(204);
    }

    try {
      logger.info(`→ Submission ${id}: fetching booking…`);
      const { rows } = await pool.query(
        `SELECT * FROM booking_submissions WHERE id = $1`,
        [id]
      );
      if (!rows.length) throw new Error("Booking not found");
      const raw = rows[0];

      const booking = {
        bookingType: raw.booking_type,
        actualPrice: raw.actual_price,
        originalPrice: raw.original_price,
        parentFirst: raw.parent_first,
        parentLast: raw.parent_last,
        parentEmail: raw.parent_email.toLowerCase(),
        parentPhone: raw.parent_phone,
        studentType: raw.student_type,
        students: raw.students,
        slots: raw.slots,
        address: raw.address,
        agreeCancel: raw.agree_cancel,
        agreeService: raw.agree_service,
        agreePhoto: raw.agree_photo,
        signature: raw.signature,
        labelId: raw.label_id,
        labelName: raw.label_name,
        selectedSessions: raw.selected_sessions,
        lessonType: raw.lesson_type,
        timezone: raw.timezone,
        colour: raw.colour,
        stripeSessionId: raw.stripe_session_id,
        is_trial: raw.is_trial,
      };

      booking.colour = normalizeColour(booking.colour || "#666666");
      logger.info(`→ Final booking.colour (normalized) = ${booking.colour}`);

      const isAutoRefund = booking.actualPrice < 3;

      logger.info({ data: booking }, '→ Mapped booking:');

      if (isAutoRefund) {
        logger.info('→ Price under $3, issuing refund…');
        const session = await stripe.checkout.sessions.retrieve(
          booking.stripeSessionId
        );
        const paymentIntent = await stripe.paymentIntents.retrieve(
          session.payment_intent
        );
        if (paymentIntent.amount_received < 300) {
          await stripe.refunds.create({ payment_intent: paymentIntent.id });
          logger.info(`→ Refund issued for payment intent ${paymentIntent.id}`);
        }
        await pool.query(
          `UPDATE booking_submissions
         SET payment_status = 'verified'
       WHERE id = $1`,
          [id]
        );
        logger.info({ id }, '→ Submission status updated to verified due to low payment amount');
      }

      const { rows: profileRows } = await pool.query(
        `SELECT klaviyo_id FROM booking_submissions WHERE id = $1`,
        [id]
      );

      let profileId = profileRows[0]?.klaviyo_id;

      if (!profileId) {
        logger.warn(`⚠️ No Klaviyo profile found for submission ${id}. Skipping Klaviyo list updates.`);
      } else {
        try {
          await removeFromKlaviyoList(profileId, LIST_A_ID);
          logger.info(`→ Submission ${id}: removed from Klaviyo List A`);

          await addToKlaviyoList(profileId, LIST_B_ID);
          logger.info(`→ Submission ${id}: added to Klaviyo List B for paying customers`);

          await pool.query(
            `UPDATE booking_submissions SET klaviyo_profile_created = true WHERE id = $1`,
            [id]
          );
          logger.info(`→ Profile marked as created in DB for submission ${id}`);
        } catch (klaviyoErr) {
          logger.warn({ data: klaviyoErr.response?.data || klaviyoErr.message || klaviyoErr }, '⚠️ Klaviyo list sync failed:');
        }
      }

      const DEFAULT_MANAGER_ID = 4140797;
      const managerLookup = {
        "Club Park Slope Registration": 2994361,
        "Club - Park Slope": 2994361,
        "Club Park Slope Trial": 2994361,
        "Club UES Registration": 2994327,
        "Club UES Trial": 2994327,
        "Club - UES": 2994327,
      };

      const managerId = managerLookup[booking.labelName] || DEFAULT_MANAGER_ID;

      const countryId = getTutorCruncherCountryId(booking.address.country);

      const studentNotes = booking.students
        .map((s) => `${s.first} ${s.last}: ${s.notes || "No notes provided"}`)
        .join("\n");

      logger.info({ data: studentNotes }, 'Student Notes:');

      const origin = req.get("origin") || req.get("referer") || "";
      const allowedOrigins = [
        "https://join.acmeops.com",
        "https://acme-ops-main.herokuapp.com",
      ];
      const sendAdminFields = allowedOrigins.some((url) =>
        origin.startsWith(url)
      );

      const isUSAddress = booking.address.country === "United States";

      // ✅ FIX: Convert full state name to 2-letter code for TutorCruncher API
      // TutorCruncher requires 2-letter state codes (e.g., "TN" not "Tennessee")
      const stateNameToCode = {
        'Alabama': 'AL', 'Alaska': 'AK', 'Arizona': 'AZ', 'Arkansas': 'AR',
        'California': 'CA', 'Colorado': 'CO', 'Connecticut': 'CT', 'Delaware': 'DE',
        'Florida': 'FL', 'Georgia': 'GA', 'Hawaii': 'HI', 'Idaho': 'ID',
        'Illinois': 'IL', 'Indiana': 'IN', 'Iowa': 'IA', 'Kansas': 'KS',
        'Kentucky': 'KY', 'Louisiana': 'LA', 'Maine': 'ME', 'Maryland': 'MD',
        'Massachusetts': 'MA', 'Michigan': 'MI', 'Minnesota': 'MN', 'Mississippi': 'MS',
        'Missouri': 'MO', 'Montana': 'MT', 'Nebraska': 'NE', 'Nevada': 'NV',
        'New Hampshire': 'NH', 'New Jersey': 'NJ', 'New Mexico': 'NM', 'New York': 'NY',
        'North Carolina': 'NC', 'North Dakota': 'ND', 'Ohio': 'OH', 'Oklahoma': 'OK',
        'Oregon': 'OR', 'Pennsylvania': 'PA', 'Rhode Island': 'RI', 'South Carolina': 'SC',
        'South Dakota': 'SD', 'Tennessee': 'TN', 'Texas': 'TX', 'Utah': 'UT',
        'Vermont': 'VT', 'Virginia': 'VA', 'Washington': 'WA', 'West Virginia': 'WV',
        'Wisconsin': 'WI', 'Wyoming': 'WY', 'District of Columbia': 'DC'
      };
      
      let stateCode = null;
      if (isUSAddress && booking.address.state) {
        const stateName = (booking.address.state || '').trim();
        // Check if already a 2-letter code
        if (stateName.length === 2 && /^[A-Z]{2}$/i.test(stateName)) {
          stateCode = stateName.toUpperCase();
        } else {
          // Convert full state name to code
          stateCode = stateNameToCode[stateName] || null;
          if (!stateCode) {
            logger.warn(`⚠️ Unknown state name: "${stateName}" for submission ${id}. Sending as-is.`);
            stateCode = stateName; // Fallback to original value
          }
        }
      }

      // ✅ FIX: Convert timezone to valid TutorCruncher format
      // TutorCruncher uses modern timezone names (e.g., "Asia/Kolkata" not "Asia/Calcutta")
      let timezone = booking.timezone || "America/New_York";
      const timezoneMap = {
        'Asia/Calcutta': 'Asia/Kolkata',
      };
      if (timezoneMap[timezone]) {
        timezone = timezoneMap[timezone];
        logger.info(`🔄 Converted timezone from "${booking.timezone}" to "${timezone}"`);
      }

      const clientPayload = {
        first_name: (booking.parentFirst || '').trim(),
        last_name: (booking.parentLast || '').trim(),
        email: (booking.parentEmail || '').trim().toLowerCase(),
        phone: (booking.parentPhone || '').trim(),
        street: (booking.address.street || '').trim(),
        town: (booking.address.city || '').trim(),
        country: countryId,
        postcode: (booking.address.zip || '').trim(),
        timezone: timezone,
        status: "prospect", // ✅ FIX: Create clients as "prospect" so they enter the pipeline - they'll be moved to "live" when won
        send_emails: true,
        auto_charge: 0, // 0 = follow branch settings (enables auto-charge based on branch config)
        extra_attrs: {
          cancellation_policy: booking.agreeCancel ? "1" : "0",
          service_agreement: booking.agreeService ? "1" : "0",
          photo_release: booking.agreePhoto ? "1" : "0",
          client_notes: studentNotes,
        },
        calendar_colour: booking.colour,
        ...(sendAdminFields ? { associated_admin: managerId } : {}),
        ...(isUSAddress && stateCode ? { state: stateCode } : {}), // ✅ FIX: Use 2-letter state code
      };

      logger.info({ data: clientPayload }, 'POST /clients/ payload:');
      logger.info(`→ Client payload colour = ${clientPayload.calendar_colour}`);

      // ✅ ENHANCED: Use transaction to ensure client creation and tc_client_id save are atomic
      // This prevents orphaned paid submissions where payment_status='paid' but tc_client_id is NULL
      const dbClient = await pool.connect();
      let clientId = null;
      let clientResult = null;
      
      try {
        await dbClient.query('BEGIN');
        logger.info(`🔄 Starting transaction for client creation (submission ${id})`);

        // Use enhanced client creation with duplicate prevention
        try {
          clientResult = await createOrUpdateClient(clientPayload, booking.parentEmail);
          clientId = clientResult.clientId;
          
          logger.info({ clientId, isNew: clientResult.isNew }, '→ Using clientId for client creation');
        } catch (clientError) {
          // ✅ ENHANCED: Log full error details including TutorCruncher API response
          const errorDetails = {
            type: 'client_creation_failed',
            error: clientError.message,
            tutorCruncherResponse: clientError.tutorCruncherResponse || clientError.response?.data || null,
            tutorCruncherStatus: clientError.tutorCruncherStatus || clientError.response?.status || null,
            timestamp: new Date().toISOString(),
            email: booking.parentEmail,
            parentName: `${booking.parentFirst} ${booking.parentLast}`,
            clientPayload: {
              first_name: booking.parentFirst,
              last_name: booking.parentLast,
              email: booking.parentEmail,
              phone: booking.parentPhone,
              address: booking.address
            }
          };
          
          await dbClient.query(
            `UPDATE booking_submissions 
             SET payment_errors = COALESCE(payment_errors, '[]'::jsonb) || $2::jsonb
             WHERE id = $1`,
            [id, JSON.stringify([errorDetails])]
          );
          
          logger.error({ data: clientError.message }, `❌ Client creation failed for submission ${id}:`);
          throw clientError; // Re-throw to trigger rollback
        }

        // ✅ CRITICAL: Save tc_client_id AND payment_status atomically (within transaction)
        // This prevents orphaned paid submissions where payment_status='paid' but tc_client_id is NULL
        await dbClient.query(
          `UPDATE booking_submissions 
           SET tc_client_id = $2, payment_status = 'paid'
           WHERE id = $1`,
          [id, clientId]
        );
        logger.info({ submissionId: id, clientId }, '✅ Saved tc_client_id and payment_status=paid to submission (within transaction)');

        // Commit transaction
        await dbClient.query('COMMIT');
        logger.info(`✅ Transaction committed for submission ${id}`);
        
      } catch (transactionError) {
        // Rollback transaction on any error
        await dbClient.query('ROLLBACK');
        logger.error({ data: transactionError.message }, `❌ Transaction rolled back for submission ${id}:`);
        
        // ✅ CRITICAL: Reset payment_status to 'pending' if client creation failed
        // This prevents orphaned paid submissions
        try {
          await pool.query(
            `UPDATE booking_submissions 
             SET payment_status = 'pending',
                 payment_errors = COALESCE(payment_errors, '[]'::jsonb) || $2::jsonb
             WHERE id = $1`,
            [id, JSON.stringify([{
              type: 'transaction_failed',
              error: transactionError.message,
              tutorCruncherResponse: transactionError.tutorCruncherResponse || transactionError.response?.data || null,
              tutorCruncherStatus: transactionError.tutorCruncherStatus || transactionError.response?.status || null,
              timestamp: new Date().toISOString(),
              note: 'Payment status reset to pending due to client creation failure'
            }])]
          );
          logger.info({ submissionId: id }, '✅ Reset payment_status to pending for submission after transaction failure');
        } catch (logError) {
          logger.error({ submissionId: id, error: logError.message }, '❌ Failed to reset payment_status for submission');
        }
        
        // Re-throw to prevent further processing
        throw transactionError;
      } finally {
        dbClient.release();
      }
      
      // If client creation failed, we won't reach here (error was thrown)
      // But add safety check just in case
      if (!clientResult || !clientId) {
        throw new Error(`Client creation failed but no error was thrown for submission ${id}`);
      }

      // ✅ CRITICAL: Sync the TC client to local database BEFORE pipeline tracking
      // This ensures the local clients table record exists with all fields (labels, pipeline_stage, etc.)
      // Without this, the pipeline tracking would fail because the local record doesn't exist yet
      logger.info(`🔄 Syncing TC client ${clientId} to local database...`);
      const syncResult = await syncSingleClient(clientId, pool);
      if (syncResult.success) {
        logger.info(`✅ Client ${clientId} synced to local ID ${syncResult.localId}`);
      } else {
        logger.warn(`⚠️ Failed to sync client ${clientId} to local database: ${syncResult.error}`);
        // Continue anyway - pipeline tracking will handle the missing record gracefully
      }

      // ✅ NEW: Set up pipeline tracking (pipeline stage + conversion tracking)
      // Get client's local database ID
      const clientLocalIdResult = await pool.query(
        `SELECT id FROM clients WHERE client_id = $1`,
        [clientId]
      );
      
      if (clientLocalIdResult.rows.length > 0) {
        const clientLocalId = clientLocalIdResult.rows[0].id;
        const pipelineResult = await setupPipelineTracking(
          clientId,
          clientLocalId,
          booking.bookingType,
          booking.lessonType,
          booking.labelName,
          pool
        );
        
        if (pipelineResult.errors.length > 0) {
          logger.warn({ data: pipelineResult.errors }, '⚠️ Pipeline tracking setup had errors:');
        } else {
          logger.info(`✅ Pipeline tracking setup complete for client ${clientId}`);
        }
      } else {
        logger.warn(`⚠️ Could not find local client ID for TC client ${clientId}, skipping pipeline tracking`);
      }

      // Use enhanced payment processing with transaction support
      logger.info(`📋 Processing payment for submission ${id} with ${booking.students.length} students`);
      booking.students.forEach((stu, idx) => {
        logger.info(`   Student ${idx + 1}: ${stu.first} ${stu.last}, DOB: ${stu.dob}`);
      });
      
      const paymentResult = await processPaymentWithTransaction(booking, id, clientResult);
      const recipientIds = paymentResult.recipientIds;
      
      logger.info(`✅ Payment processing completed for submission ${id}`);
      logger.info(`📊 Processed ${recipientIds.length} recipients`);
      
      if (paymentResult.errors.length > 0) {
        logger.warn({ data: paymentResult.errors }, `⚠️ Payment processing had ${paymentResult.errors.length} errors:`);
      }

      // Re-sync client from TC to capture labels that were just applied in processPaymentWithTransaction
      // This ensures the local DB has the labels immediately, rather than waiting for TC webhooks
      logger.info(`🔄 Re-syncing client ${clientId} to capture labels...`);
      try {
        const reSyncResult = await syncSingleClient(clientId, pool);
        if (reSyncResult.success) {
          logger.info(`✅ Client ${clientId} re-synced successfully with labels`);
        } else {
          logger.warn(`⚠️ Client ${clientId} re-sync failed: ${reSyncResult.error}`);
        }
      } catch (reSyncError) {
        logger.warn({ data: reSyncError.message }, `⚠️ Failed to re-sync client ${clientId} for labels:`);
        // Non-blocking - labels will sync via webhook eventually
      }

      function getAge(dob) {
        return dob
          ? Math.floor(
              (Date.now() - new Date(dob).getTime()) /
                (1000 * 60 * 60 * 24 * 365)
            )
          : "";
      }

      // ✅ Clients are created with status: "prospect" in the initial payload, so they enter the pipeline correctly
      // They will be moved to "live" status when they're won/converted through the pipeline

      logger.info({ data: booking.lessonType }, '→ Booking lessonType:');
      logger.info({ data: booking.bookingType }, '→ Booking bookingType:');

      // Handle Club bookings (check both lessonType and bookingType name to catch club trials)
      const isClubBooking = booking.lessonType === "Club" || 
                            (booking.bookingType && booking.bookingType.includes("Club"));
      
      if (isClubBooking) {
        logger.info('→ Club booking: adding recipients to selected appointments…');

        const sessionIds = booking.selectedSessions || [];
        if (!Array.isArray(sessionIds) || sessionIds.length === 0) {
          // Club trials intentionally skip session selection — parent chooses which class to attend later.
          // Non-trial club bookings with no sessions are unexpected and should be flagged.
          const isClubTrial = booking.bookingType && booking.bookingType.toLowerCase().includes('trial');

          if (isClubTrial) {
            logger.info({ submissionId: id }, '→ Club trial: no sessions selected (expected — parent chooses class later)');
          } else {
            const errorMsg = "No selected Club sessions found to add recipients to.";
            logger.error(`❌ ${errorMsg}`);
            await pool.query(
              `UPDATE booking_submissions
               SET credit_request_error = true,
                   credit_request_error_message = COALESCE(credit_request_error_message, '') || E'\\n' || $2
             WHERE id = $1`,
              [id, `Club booking error: ${errorMsg}. Recipients can be added manually.`]
            );
          }

          // Send ops notification email so team knows to add recipient manually
          raw.tc_client_id = clientId;
          const emailTag = isClubTrial ? 'club-trial-no-sessions' : 'club-no-sessions';
          if (await checkAndMarkEmailSent(id, emailTag)) {
            const sendEmail = global.sendEmail;
            if (sendEmail && typeof sendEmail === 'function') {
              await sendEmail({
                ...raw,
                landing_url: raw.landing_url || null,
                landingUrl: raw.landing_url || null,
                label_name: raw.label_name || null,
                jobDescForEmail: isClubTrial
                  ? `Club trial booking — recipient needs to be added to a session manually.`
                  : `Club booking - NO SESSIONS SELECTED. Recipients must be added manually.`,
              });
              logger.info(`📧 Club booking (no sessions) notification email sent for submission ${id}`);
            }
          }

          // Return success since client link is already saved
          return res.status(200).json({
            message: isClubTrial
              ? 'Club trial processed — recipient to be added to session manually'
              : 'Client created successfully, but no sessions selected for Club booking',
            tc_client_id: clientId,
            ...(isClubTrial ? {} : { warning: "No selected Club sessions found to add recipients to." })
          });
        }

        // tc_client_id already saved above, no need to save again

        // ✅ Client is created with status: "prospect" in the initial payload, entering the pipeline correctly
        // They will be moved to "live" status when won/converted through the pipeline

        // Auto-set pipeline stage to "Clubs" for Club bookings (they go into the Clubs column)
        try {
          // Find "Clubs" pipeline stage
          const clubsStageResult = await pool.query(
            `SELECT id FROM pipeline_stages WHERE LOWER(name) = 'clubs' LIMIT 1`
          );

          if (clubsStageResult.rows.length > 0) {
            const clubsStageId = clubsStageResult.rows[0].id;

            // Get client's local database ID
            const clientLocalIdResult = await pool.query(
              `SELECT id FROM clients WHERE client_id = $1`,
              [clientId]
            );

            if (clientLocalIdResult.rows.length > 0) {
              const clientLocalId = clientLocalIdResult.rows[0].id;

              // Update client pipeline stage in local database
              await pool.query(
                `UPDATE clients SET pipeline_stage_id = $1, updated_at = NOW() WHERE id = $2`,
                [clubsStageId, clientLocalId]
              );

              // Also update in TutorCruncher if pipeline_stages table is synced
              try {
                await tutorCruncherAPI.post(`/clients/${clientId}/`, {
                  pipeline_stage: clubsStageId
                });
                logger.info(`✅ Club booking: Set pipeline stage to "Clubs" for client ${clientId}`);
              } catch (tcError) {
                logger.warn({ data: tcError.message }, `⚠️ Failed to update pipeline stage in TutorCruncher for client ${clientId}:`);
                // Continue even if TutorCruncher update fails
              }

              // Create conversion tracking entry for Club bookings
              const market = determineMarket(booking.labelName);
              const leadType = 'New Lead';
              const conversionStatus = 'prospect'; // Club clients start as prospects in the Clubs column

              // Check if conversion tracking already exists
              const existingTracking = await pool.query(
                `SELECT id FROM client_conversion_tracking WHERE client_id = $1`,
                [clientLocalId]
              );

              if (existingTracking.rows.length === 0) {
                await pool.query(
                  `INSERT INTO client_conversion_tracking (
                    client_id,
                    lead_type,
                    market,
                    conversion_status,
                    created_at,
                    updated_at
                  ) VALUES ($1, $2, $3, $4, NOW(), NOW())`,
                  [clientLocalId, leadType, market, conversionStatus]
                );
                logger.info(`✅ Club booking: Created conversion tracking entry for client ${clientId} (${market}, ${leadType}, ${conversionStatus})`);
              } else {
                logger.info(`ℹ️ Club booking: Conversion tracking already exists for client ${clientId}, skipping creation`);
              }
            } else {
              logger.warn(`⚠️ Could not find local client ID for TC client ${clientId}, skipping pipeline tracking`);
            }
          } else {
            logger.warn('⚠️ "Clubs" pipeline stage not found in database. Club booking will not auto-set pipeline stage.');
          }
        } catch (pipelineError) {
          logger.error({ data: pipelineError.message }, '❌ Error setting pipeline stage to "Clubs" for Club booking:');
          // Don't fail the booking if pipeline stage update fails
        }

        const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

        // Calculate per-lesson discounted rate if discount was applied
        // Fix: Compare actualPrice (total paid) against calculated full price, not per-lesson originalPrice
        const numberOfSessions = (booking.selectedSessions || []).length || 1;
        const numberOfStudents = booking.students.length || 1;
        const expectedFullPrice = Number(booking.originalPrice) * numberOfSessions * numberOfStudents;
        const hasDiscount = Number(booking.actualPrice) < expectedFullPrice;
        let chargeRatePerStudent = null;

        logger.info(`📊 Club booking price check: actualPrice=$${booking.actualPrice}, originalPrice=$${booking.originalPrice}, sessions=${numberOfSessions}, students=${numberOfStudents}, expectedFullPrice=$${expectedFullPrice}, hasDiscount=${hasDiscount}`);

        if (hasDiscount) {
          // Calculate per-student, per-lesson rate from total discounted price
          chargeRatePerStudent = Number(booking.actualPrice) / numberOfSessions / numberOfStudents;
          logger.info(`💰 Discount detected: Using discounted rate $${chargeRatePerStudent.toFixed(2)} per student per lesson (total: $${booking.actualPrice}, fullPrice: $${expectedFullPrice}, sessions: ${numberOfSessions}, students: ${numberOfStudents})`);
        }

        const addRecipientToAppointment = async (
          appointmentId,
          recipientId
        ) => {
          try {
            const payload = { recipient: recipientId };
            // Set charge_rate if discount was applied
            if (hasDiscount && chargeRatePerStudent !== null) {
              payload.charge_rate = chargeRatePerStudent;
            }
            const resp = await tutorCruncherAPI.post(
              `/appointments/${appointmentId}/recipient/add/`,
              payload
            );
            logger.info({ data: resp.data?.id ? `(link id ${resp.data.id})` : "" }, `→ Added recipient ${recipientId} to appointment ${appointmentId}`);
          } catch (err) {
            const data = err.response?.data;
            const msg =
              (typeof data === "string" ? data : data?.error) ||
              err.message ||
              String(err);

            if (/already|exists|duplicate/i.test(msg)) {
              logger.info('→ Recipient ${recipientId} already on appointment ${appointmentId}; skipping');
              return;
            }

            logger.error({ data: data || msg }, ` Failed to add recipient ${recipientId} to appointment ${appointmentId}:`);

            await pool.query(
              `UPDATE booking_submissions
           SET credit_request_error = true,
               credit_request_error_message = COALESCE(credit_request_error_message, '') || E'\\n' || $2
         WHERE id = $1`,
              [
                id,
                `Add recipient failed (appt ${appointmentId}, rec ${recipientId}): ${msg}`,
              ]
            );
          }
        };

        // Look up the service (job) and first session date from the first selected appointment
        let clubServiceId = null;
        let firstSessionDate = null;
        try {
          const appointmentRow = await pool.query(
            `SELECT service_id, start FROM appointments WHERE appointment_id = $1 LIMIT 1`,
            [String(sessionIds[0])]
          );
          if (appointmentRow.rows.length > 0) {
            if (appointmentRow.rows[0].service_id) {
              clubServiceId = appointmentRow.rows[0].service_id;
              logger.info(`📋 Club booking: found service ${clubServiceId} from appointment ${sessionIds[0]}`);
            }
            if (appointmentRow.rows[0].start) {
              firstSessionDate = appointmentRow.rows[0].start;
            }
          } else {
            logger.warn(`⚠️ Club booking: could not find service_id for appointment ${sessionIds[0]} in local DB`);
          }
        } catch (lookupErr) {
          logger.warn({ err: lookupErr.message }, '⚠️ Club booking: failed to look up service_id from appointment');
        }

        // Add recipients to the service (job) first
        if (clubServiceId) {
          for (const recipientId of recipientIds) {
            try {
              const payload = { recipient: recipientId };
              if (hasDiscount && chargeRatePerStudent !== null) {
                payload.charge_rate = chargeRatePerStudent;
              }
              await tutorCruncherAPI.post(`/services/${clubServiceId}/recipient/add/`, payload);
              logger.info(`→ Added recipient ${recipientId} to service ${clubServiceId}`);
            } catch (err) {
              const msg = err.response?.data?.error || err.message || String(err);
              if (/already|exists|duplicate/i.test(msg)) {
                logger.info(`→ Recipient ${recipientId} already on service ${clubServiceId}; skipping`);
              } else {
                logger.error({ data: err.response?.data || msg }, `Failed to add recipient ${recipientId} to service ${clubServiceId}:`);
              }
            }
            await sleep(120);
          }
        }

        // Add recipients to each selected appointment
        for (const appointmentId of sessionIds) {
          for (const recipientId of recipientIds) {
            await addRecipientToAppointment(appointmentId, recipientId);
            await sleep(120);
          }
        }

        raw.tc_client_id = clientId;
        
        // Check if email was already sent to prevent duplicates
        if (await checkAndMarkEmailSent(id, 'club')) {
          // Access sendEmail from global (set by server.js from server-fns)
          const sendEmail = global.sendEmail;
          if (sendEmail && typeof sendEmail === 'function') {
            await sendEmail({
              ...raw,
              landing_url: raw.landing_url || null,
              landingUrl: raw.landing_url || null,
              label_name: raw.label_name || null,
              jobDescForEmail: `Added ${recipientIds.length} recipient(s) to ${sessionIds.length} Club appointment(s)`,
            });
            logger.info(`📧 Club booking confirmation email sent for submission ${id}`);
          } else {
            logger.error(`❌ sendEmail function not available in global scope for submission ${id}`);
          }
        } else {
          logger.info(`📧 Skipping duplicate club booking email for submission ${id}`);
        }

        // PAUSED 2026-03-20: Club confirmation emails disabled pending review with Kim.
        // These were added Feb 24 as part of the club landing page feature but Kim
        // flagged that parents weren't expecting them + date/venue issues.
        // Re-enable after reviewing template content with Kim.
        // See: club-booking-email-service.js for the email template.
        //
        // When re-enabling, ensure:
        // 1. sessionDate uses firstSessionDate (appointment date), not raw.created_at
        // 2. Show venue_address instead of/in addition to venue_name
        // 3. Review copy with Kim before going live

        logger.info(`🎉 Club recipients added to appointments for submission ${id}`);
        return res.sendStatus(204);
      }

      if (!booking.is_trial) {
        // tc_client_id already saved above, no need to save again
        // ✅ Client is already created with status: "prospect" in the initial payload

        raw.tc_client_id = clientId;
        
        // Check if email was already sent to prevent duplicates
        if (await checkAndMarkEmailSent(id, 'non-trial')) {
          // Access sendEmail from global (set by server.js from server-fns)
          const sendEmail = global.sendEmail;
          if (sendEmail && typeof sendEmail === 'function') {
            await sendEmail({
              ...raw,
              landing_url: raw.landing_url || null,
              landingUrl: raw.landing_url || null,
              label_name: raw.label_name || null,
              jobDescForEmail: "Skipped TC job creation (Non-Trial)",
            });
            logger.info(`📧 Non-trial booking confirmation email sent for submission ${id}`);
          } else {
            logger.error(`❌ sendEmail function not available in global scope for submission ${id}`);
          }
        } else {
          logger.info(`📧 Skipping duplicate non-trial booking email for submission ${id}`);
        }
        return res.sendStatus(204);
      }

      // Check if a job already exists for this submission (idempotency check)
      // This prevents duplicate job creation if someone manually creates a job via Job Builder
      const existingJobCheck = await pool.query(
        `SELECT tc_service_id FROM booking_submissions WHERE id = $1 AND tc_service_id IS NOT NULL`,
        [id]
      );

      if (existingJobCheck.rows.length > 0 && existingJobCheck.rows[0].tc_service_id) {
        const existingServiceId = existingJobCheck.rows[0].tc_service_id;
        logger.info(`⏭️ Job already exists for submission ${id} (tc_service_id: ${existingServiceId}), skipping job creation`);

        // Still send the confirmation email and update client/recipient info
        booking.is_trial = raw.is_trial;

        // Note: Trial appointments are NOT auto-created here.
        // Jena will manually schedule trials after tutor pairing via TutorCruncher.

        // Send confirmation email
        if (shouldSendEmail) {
          if (sendEmail && typeof sendEmail === 'function') {
            await sendEmail({
              ...raw,
              landing_url: raw.landing_url || null,
              landingUrl: raw.landing_url || null,
              label_name: raw.label_name || null,
              jobDescForEmail: `Job already created (ID: ${existingServiceId})`,
            });
            logger.info(`📧 Confirmation email sent for submission ${id} (existing job)`);
          }
        }

        logger.info(`🎉 TutorCruncher setup complete for submission ${id} (using existing job)`);
        return res.sendStatus(200);
      }

      const ratioMap = {
        "One Student": "1:1",
        "Two Students": "1:2",
        "Small Group (3+ Students)": "1:3",
      };
      const ratio = ratioMap[booking.studentType] || "—";
      const firstStudentName = booking.students[0]?.first || "";

      const jobName =
        [
          `${booking.parentFirst} ${booking.parentLast}`,
          "Chess",
          `${booking.lessonType}`,
          ratio,
        ].join(" – ") + (firstStudentName ? ` (${firstStudentName})` : "");

      const lines = [];

      lines.push(`**${booking.parentFirst} ${booking.parentLast}**`);
      lines.push(
        `**Address:** ${[
          booking.address.street,
          booking.address.city,
          booking.address.state,
          booking.address.zip,
          getTutorCruncherCountryName(countryId) || booking.address.country,
        ]
          .filter(Boolean)
          .join(", ")}`
      );

      lines.push(`**${booking.bookingType} – Chess**`);
      lines.push("* Duration: 45–60 Minutes");
      lines.push(`* Lesson Type: Private ${ratio}`);
      lines.push(`* Parent: ${booking.parentFirst} ${booking.parentLast}`);
      lines.push("* Children:");
      booking.students.forEach((s) =>
        lines.push(
          `* ${s.first} – Chess Level: ${s.experience} – (Age: ${getAge(
            s.dob
          )})`
        )
      );

      const timezoneForEmail = booking.timezone || "Not Provided";
      lines.push(`* Timezone: ${timezoneForEmail}`);

      lines.push("**Day & Time (pick one):**");
      booking.slots.forEach((s) => {
        if (s.start && s.end && s.dayOfWeek) {
          lines.push(`* ${s.dayOfWeek}: ${s.start} – ${s.end}`);
        }
      });

      const fmt = (d) =>
        new Date(d).toLocaleDateString(undefined, {
          month: "2-digit",
          day: "2-digit",
          year: "numeric",
        });
      lines.push(`* Start Date: ${fmt(booking.slots[0]?.date)}`);
      lines.push("* Lesson dates: Weekly Ongoing Post Trial");
      lines.push("* Client Notes:");
      lines.push(
        ...booking.students.map(
          (s) => `  - ${s.first} ${s.last}: ${s.notes || "No notes provided"}`
        )
      );

      const jobDesc = lines.join("\n");

      const jobDescForEmail = generateJobDescHtml(lines);

      logger.info({ data: jobDescForEmail }, 'Job Description for Email (Plain Text):');

      // Determine charge rate: use discounted price if discount was applied
      // BUT NOT for trials - trials should always use the full originalPrice as the job rate
      // so that when the client converts, they see the correct ongoing rate
      const numberOfSessions = (booking.selectedSessions || []).length || 1;
      const numberOfStudents = booking.students.length || 1;
      const expectedFullPrice = Number(booking.originalPrice) * numberOfSessions * numberOfStudents;
      // Only consider it a discount if NOT a trial AND actualPrice < expectedFullPrice
      const hasDiscount = !booking.is_trial && Number(booking.actualPrice) < expectedFullPrice;
      let chargeRate = Number(booking.originalPrice);

      logger.info(`📊 Booking price check: is_trial=${booking.is_trial}, actualPrice=$${booking.actualPrice}, originalPrice=$${booking.originalPrice}, sessions=${numberOfSessions}, students=${numberOfStudents}, expectedFullPrice=$${expectedFullPrice}, hasDiscount=${hasDiscount}`);

      if (hasDiscount) {
        if (numberOfSessions > 1) {
          // Per-session booking: calculate per-student, per-lesson rate
          chargeRate = Number(booking.actualPrice) / numberOfSessions / numberOfStudents;
          logger.info(`💰 Staff discount detected: Using discounted rate $${chargeRate.toFixed(2)} per student per lesson (total: $${booking.actualPrice}, fullPrice: $${expectedFullPrice}, sessions: ${numberOfSessions}, students: ${numberOfStudents})`);
        } else {
          // Regular booking: use discounted price per student
          chargeRate = Number(booking.actualPrice) / numberOfStudents;
          logger.info(`💰 Staff discount detected: Using discounted rate $${chargeRate.toFixed(2)} per student (total: $${booking.actualPrice}, fullPrice: $${expectedFullPrice}, students: ${numberOfStudents})`);
        }
      } else if (booking.is_trial) {
        logger.info(`🎓 Trial booking: Using full rate $${chargeRate.toFixed(2)} (trial pricing is promotional only, job rate reflects full session value)`);
      }

      logger.info({ data: {
        name: jobName,
        dft_charge_rate: chargeRate,
        dft_charge_type: "hourly",
        dft_contractor_rate: 0,
        description: jobDesc,
        colour: booking.colour,
        extra_attrs: { job_type_filter: booking.bookingType },
        rcrs: recipientIds.map((r) => ({ recipient: r })),
        service_manager: managerId,
      } }, 'POST /services/ payload:');

      // Check for existing job by client name pattern (prevents duplicates from manual Job Builder creation)
      const clientNamePattern = `${booking.parentFirst} ${booking.parentLast}%Chess%${booking.lessonType}%`;
      const existingJobByName = await pool.query(
        `SELECT service_id, name, dft_charge_rate FROM services
         WHERE name ILIKE $1
         AND is_deleted IS NOT TRUE
         ORDER BY created_at DESC
         LIMIT 1`,
        [clientNamePattern]
      );

      if (existingJobByName.rows.length > 0) {
        const existingJob = existingJobByName.rows[0];
        logger.info(`⚠️ Found existing job for "${booking.parentFirst} ${booking.parentLast}" - "${existingJob.name}" (TC ID: ${existingJob.service_id})`);
        logger.info(`   Using existing job instead of creating duplicate. Charge rate: $${existingJob.dft_charge_rate}`);

        // Update submission with existing job ID
        await pool.query(
          `UPDATE booking_submissions SET tc_service_id = $2 WHERE id = $1`,
          [id, existingJob.service_id]
        );

        // Add recipients to existing job if not already added
        for (const recipientId of recipientIds) {
          try {
            await tutorCruncherAPI.post(`/services/${existingJob.service_id}/recipient/add/`, {
              recipient: recipientId,
              charge_rate: chargeRate
            });
            logger.info(`   Added recipient ${recipientId} to existing job ${existingJob.service_id}`);
          } catch (addError) {
            if (addError.response?.status === 400 && addError.response?.data?.recipient?.includes('already')) {
              logger.info(`   Recipient ${recipientId} already on job ${existingJob.service_id}`);
            } else {
              logger.warn(`   Failed to add recipient ${recipientId}: ${addError.message}`);
            }
          }
        }

        // Note: Trial appointments are NOT auto-created here.
        // Jena will manually schedule trials after tutor pairing via TutorCruncher.
        booking.is_trial = raw.is_trial;

        // Add label if not present
        try {
          await tutorCruncherAPI.post(`/services/${existingJob.service_id}/add_label/`, {
            label: booking.labelId,
          });
        } catch (labelError) {
          logger.info(`   Label may already be on job: ${labelError.message}`);
        }

        logger.info(`🎉 TutorCruncher setup complete for submission ${id} (using existing job ${existingJob.service_id})`);

        // Send confirmation email
        if (shouldSendEmail) {
          if (sendEmail && typeof sendEmail === 'function') {
            await sendEmail({
              ...raw,
              landing_url: raw.landing_url || null,
              landingUrl: raw.landing_url || null,
              label_name: raw.label_name || null,
              jobDescForEmail: `Using existing job: ${existingJob.name}`,
            });
            logger.info(`📧 Confirmation email sent for submission ${id}`);
          }
        }

        return res.sendStatus(200);
      }

      // Online lessons use the pre-existing "Online" location (ID: 130643)
      const isOnlineLesson = booking.lessonType === "Online";

      const serviceRes = await retryTutorCruncherCall(
        () => tutorCruncherAPI.post("/services/", {
          name: jobName,
          dft_charge_rate: chargeRate,
          dft_charge_type: "hourly",
          dft_contractor_rate: 0,
          description: jobDesc,
          colour: booking.colour,
          extra_attrs: { job_type_filter: booking.bookingType },
          rcrs: recipientIds.map((r) => ({
            recipient: r,
            ...(hasDiscount ? { charge_rate: chargeRate } : {})
          })),
          service_manager: managerId,
          sr_premium: 10,
          // Set default location for Online lessons
          ...(isOnlineLesson ? { dft_location: 130643 } : {}),
        }),
        {
          maxRetries: 3,
          baseDelayMs: 1000,
          operationName: `Service/job creation for submission ${id}`
        }
      );

      logger.info(`→ Service payload colour = ${booking.colour}`);

      const { id: serviceId, name: serviceName } = serviceRes.data;

      await pool.query(
        `
  UPDATE booking_submissions
     SET tc_client_id  = $2,
         tc_service_id = $3
   WHERE id = $1
`,
        [id, clientId, serviceId]
      );

      logger.info(`→ Saved TC client=${clientId} and service=${serviceId} on submission ${id}`);

      booking.is_trial = raw.is_trial;

      // Note: Trial appointments are NOT auto-created here.
      // Jena will manually schedule trials after tutor pairing via TutorCruncher.

      await retryTutorCruncherCall(
        () => tutorCruncherAPI.post(`/services/${serviceId}/add_label/`, {
          label: booking.labelId,
        }),
        {
          maxRetries: 2,
          baseDelayMs: 500,
          operationName: `Add label to service ${serviceId}`
        }
      );

      logger.info(`🎉 TutorCruncher setup complete for submission ${id}`);

      if (!booking) {
        logger.error('Error: booking object is undefined');
        return res.sendStatus(500);
      }

      logger.info('→ Fetching updated booking details...');
      const { rows: updatedRows } = await pool.query(
        `SELECT * FROM booking_submissions WHERE id = $1`,
        [id]
      );
      if (!updatedRows.length) throw new Error("Booking not found");
      const updatedBooking = updatedRows[0];

      logger.info({ data: updatedBooking }, '→ Updated Booking:');

      updatedBooking.jobDescForEmail = jobDescForEmail;

      // Check if email was already sent to prevent duplicates
      if (await checkAndMarkEmailSent(id, 'trial')) {
        // Access sendEmail from global (set by server.js from server-fns)
        const sendEmail = global.sendEmail;
        if (sendEmail && typeof sendEmail === 'function') {
          await sendEmail({
            ...updatedBooking,
            landing_url: updatedBooking.landing_url || null,
            landingUrl: updatedBooking.landing_url || null,
            label_name: updatedBooking.label_name || null,
          });
          logger.info(`📧 Trial booking confirmation email sent for submission ${id}`);
        } else {
          logger.error(`❌ sendEmail function not available in global scope for submission ${id}`);
        }
      } else {
        logger.info(`📧 Skipping duplicate trial booking email for submission ${id}`);
      }

      return res.sendStatus(204);
    } catch (err) {
      logger.error({ data: err.response?.data || err.message || err }, `❌ TutorCruncher setup failed for submission ${id}:`);
      
      // ✅ ENHANCED: Log error to payment_errors field for visibility
      try {
        const errorDetails = {
          type: 'payment_processing_failed',
          error: err.message,
          response: err.response?.data || null,
          stack: err.stack,
          timestamp: new Date().toISOString()
        };
        
        await pool.query(
          `UPDATE booking_submissions 
           SET payment_errors = COALESCE(payment_errors, '[]'::jsonb) || $2::jsonb
           WHERE id = $1`,
          [id, JSON.stringify([errorDetails])]
        );
        
        logger.info(`✅ Error logged to payment_errors for submission ${id}`);
      } catch (logError) {
        logger.error({ data: logError.message }, `❌ Failed to log error for submission ${id}:`);
      }

      // NOTE: We intentionally keep the processing lock in place on errors
      // This prevents retry loops that would likely fail again
      // Admin can investigate via payment_errors field and manually retry if needed

      // Return 204 to prevent Stripe from retrying, but error is logged
      // Operations team can investigate using payment_errors field
      return res.sendStatus(204);
    }
  }
));

router.get("/submissions/:id", asyncHandler(async (req, res) => {
  const { id } = req.params;
  try {
    const { rows } = await pool.query(
      `
      SELECT
        id,
        booking_type        AS "bookingType",
        actual_price::float AS "actualPrice",
        original_price::float AS "originalPrice",
        parent_first        AS "parentFirst",
        parent_last         AS "parentLast",
        parent_email        AS "parentEmail",
        parent_phone        AS "parentPhone",
        student_type        AS "studentType",
        students,
        slots,
        heard_about         AS "heardAbout",
        address,
        agree_cancel        AS "agreeCancel",
        agree_service       AS "agreeService",
        agree_photo         AS "agreePhoto",
        signature,
        label_id            AS "labelId",
        label_name          AS "labelName",
        payment_status      AS "paymentStatus",
        created_at          AS "createdAt",
        selected_sessions   AS "selectedSessions",
        lesson_type         AS "lessonType",
        tc_client_id        AS "tcClientId",
        tc_service_id       AS "tcServiceId",
        timezone            AS "timezone",
        colour              AS "colour",
        credit_request_error AS "creditRequestError",
        credit_request_error_message AS "creditRequestErrorMessage",

        -- Attribution (flat)
        COALESCE(utm, '{}'::jsonb)       AS "utm",
        landing_url                       AS "landing_url",
        landing_url                       AS "landingUrl",
        referrer                          AS "referrer",
        (COALESCE(utm, '{}'::jsonb)->>'utm_source') AS "utmSource",
        (COALESCE(utm, '{}'::jsonb)->>'utm_campaign') AS "utmCampaign",

        -- Attribution (nested, for your helpers)
        jsonb_build_object(
          'utm',        COALESCE(utm, '{}'::jsonb),
          'landing_url', landing_url,
          'referrer',    referrer
        ) AS "attribution"
      FROM booking_submissions
      WHERE id = $1
      `,
      [id]
    );

    if (!rows.length)
      return res.status(404).json({ error: "Submission not found" });

    const submission = rows[0];
    if (!submission.timezone) submission.timezone = "Not Provided";

    res.json(submission);
  } catch (err) {
    logger.error({ err: err }, `GET /api/submissions/${id} failed:`);
    res.status(500).json({ error: "Could not fetch submission" });
  }
}));

module.exports = router;
