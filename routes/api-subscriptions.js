/**
 * Subscription API Routes
 * Handles Stripe subscription creation, management, and enrollment
 */

const express = require('express');
const {
  pool,
  tutorCruncherAPI,
  auth,
  stripe
} = global;

const router = express.Router();
const cache = require('../utils/cache');
const subscriptionBillingService = require('../services/subscription-billing-service');
const subscriptionNotificationService = require('../services/subscription-notification-service');
const { asyncHandler } = require('../middleware/error-handler');
const { logger } = require('../utils/logger');
const { getTutorCruncherCountryId } = require('../utils/tutorcruncherCountry');

/**
 * POST /api/subscriptions/create
 * Create Stripe subscription for monthly billing
 */
router.post('/create', asyncHandler(async (req, res) => {
  try {
    const {
      serviceId,
      clientId, // TutorCruncher client ID (optional, can be created)
      recipientId, // TutorCruncher recipient/student ID (optional)
      parentEmail,
      parentName,
      parentPhone,
      paymentMethodId, // Stripe payment method ID (optional, will create SetupIntent if not provided)
      stripeCustomerId, // Stripe customer ID (optional, for retry after SetupIntent)
      enrollmentDate, // ISO date string
      submissionId, // Booking submission ID (optional)
      bookingData, // Additional booking data for TutorCruncher integration (optional)
      isOwnerBooking,
      isStaffBooking
    } = req.body;
    
    const options = { bookingData }; // For use in notification service

    // Validation
    if (!serviceId || !parentEmail || !enrollmentDate) {
      return res.status(400).json({
        error: 'Missing required fields: serviceId, parentEmail, enrollmentDate'
      });
    }

    // Get term billing config
    const configResult = await pool.query(
      'SELECT * FROM term_billing_configs WHERE service_id = $1 AND is_active = true',
      [serviceId]
    );

    if (configResult.rows.length === 0) {
      return res.status(404).json({
        error: 'No active term billing config found for this service'
      });
    }

    const config = configResult.rows[0];
    // Handle JSONB fields - might be string or already parsed
    if (typeof config.class_dates === 'string') {
      try {
        config.class_dates = JSON.parse(config.class_dates);
      } catch (e) {
        logger.error({ err: e }, 'Error parsing class_dates:');
        config.class_dates = [];
      }
    } else if (!Array.isArray(config.class_dates)) {
      config.class_dates = [];
    }
    
    if (typeof config.lessons_per_month === 'string') {
      try {
        config.lessons_per_month = JSON.parse(config.lessons_per_month);
      } catch (e) {
        logger.error({ err: e }, 'Error parsing lessons_per_month:');
        config.lessons_per_month = {};
      }
    } else if (typeof config.lessons_per_month !== 'object' || config.lessons_per_month === null) {
      config.lessons_per_month = {};
    }

    // Convert rate_per_lesson to number (comes from DB as string)
    config.rate_per_lesson = Number(config.rate_per_lesson) || 0;

    // Look up owner/staff discount config from Services table
    let effectiveRatePerLesson = Number(config.rate_per_lesson) || 0;
    let appliedDiscountType = null;
    let appliedDiscountPercent = 0;

    if (isOwnerBooking || isStaffBooking) {
      try {
        const serviceDiscountResult = await pool.query(
          `SELECT "ownerDiscountEnabled", "ownerDiscountPercentMonthly", "ownerDiscountPercentTerm",
                  "staffDiscountEnabled", "staffDiscountPercentMonthly", "staffDiscountPercentTerm"
           FROM public."Services" WHERE "serviceId" = $1`,
          [String(serviceId)]
        );

        if (serviceDiscountResult.rows.length > 0) {
          const svc = serviceDiscountResult.rows[0];

          if (isOwnerBooking && svc.ownerDiscountEnabled) {
            appliedDiscountPercent = Number(svc.ownerDiscountPercentMonthly) || 0;
            appliedDiscountType = 'owner';
          } else if (isStaffBooking && svc.staffDiscountEnabled) {
            appliedDiscountPercent = Number(svc.staffDiscountPercentMonthly) || 0;
            appliedDiscountType = 'staff';
          }

          if (appliedDiscountPercent > 0) {
            effectiveRatePerLesson = parseFloat((effectiveRatePerLesson * (1 - appliedDiscountPercent / 100)).toFixed(2));
            logger.info({ serviceId, appliedDiscountType, appliedDiscountPercent, originalRate: Number(config.rate_per_lesson), effectiveRate: effectiveRatePerLesson },
              `💰 ${appliedDiscountType} discount applied: $${Number(config.rate_per_lesson)} → $${effectiveRatePerLesson} (${appliedDiscountPercent}% off)`);
          }
        }
      } catch (discountErr) {
        logger.error({ err: discountErr.message, serviceId }, '⚠️ Failed to look up discount config, using full rate');
      }
    }

    // Convert term_discount_percent to number if it exists
    if (config.term_discount_percent !== null && config.term_discount_percent !== undefined) {
      config.term_discount_percent = Number(config.term_discount_percent) || 0;
    }

    // Get or create Stripe customer
    // stripeCustomerId may be provided from req.body (for retry after SetupIntent)
    let finalStripeCustomerId = stripeCustomerId || null;
    
    if (!finalStripeCustomerId && clientId) {
      const customerCheck = await pool.query(
        'SELECT stripe_customer_id FROM clients WHERE id = $1',
        [clientId]
      );

      if (customerCheck.rows.length > 0 && customerCheck.rows[0].stripe_customer_id) {
        finalStripeCustomerId = customerCheck.rows[0].stripe_customer_id;
      }
    }
    
    if (!finalStripeCustomerId) {
      // Create Stripe customer
      const customer = await stripe.customers.create({
        email: parentEmail,
        name: parentName,
        phone: parentPhone,
        metadata: {
          tutorcruncher_client_id: clientId || 'pending',
          service_id: serviceId,
          submission_id: submissionId || 'none'
        }
      });
      finalStripeCustomerId = customer.id;

      // Save to database (if clients table exists and clientId provided)
      if (clientId) {
        try {
          await pool.query(
            'UPDATE clients SET stripe_customer_id = $1 WHERE id = $2',
            [finalStripeCustomerId, clientId]
          );
        } catch (err) {
          logger.warn({ error: err.message }, 'Could not update clients table with stripe_customer_id:');
        }
      }
    }

    // TutorCruncher Integration: Create/update client
    // For monthly billing with payment method collection, we'll create the client AFTER payment is confirmed
    // For immediate subscriptions (payment method provided), create client now
    let tutorcruncherClientId = clientId;
    // Only create client now if payment method is provided (immediate subscription)
    // If payment method collection is needed, defer client creation to /complete-setup endpoint
    if (!tutorcruncherClientId && bookingData && paymentMethodId) {
      try {
        // First, check if client already exists by email (for repeat bookings)
        let existingClient = null;
        try {
          const normalizedEmail = parentEmail.toLowerCase().trim();
          const lookupResponse = await tutorCruncherAPI.get('/clients/', {
            params: { 
              user__email: normalizedEmail
            }
          });
          
          if (lookupResponse.data.results && lookupResponse.data.results.length > 0) {
            existingClient = lookupResponse.data.results[0];
            logger.info(`♻️ Found existing TutorCruncher client: ${existingClient.id} for email ${normalizedEmail}`);
          }
        } catch (lookupError) {
          logger.warn({ data: lookupError.message }, '⚠️ Could not lookup existing client by email, will attempt to create:');
          // Continue to creation attempt
        }
        
        if (existingClient) {
          // Use existing client ID
          tutorcruncherClientId = existingClient.id;
          logger.info(`✅ Using existing TutorCruncher client: ${tutorcruncherClientId}`);
          
          // Optionally update client info if address changed
          try {
            const updatePayload = {
              phone: parentPhone || existingClient.phone || '',
              street: bookingData.address?.street || existingClient.street || '',
              town: bookingData.address?.city || existingClient.town || '',
              state: bookingData.address?.state || existingClient.state || '',
              country: bookingData.address?.country
                ? getTutorCruncherCountryId(bookingData.address.country)
                : (existingClient.country || null),
              postcode: bookingData.address?.zip || existingClient.postcode || '',
              timezone: bookingData.timezone || existingClient.timezone || 'America/New_York',
              status: 'live' // Ensure client is active
            };
            
            await tutorCruncherAPI.post(`/clients/${tutorcruncherClientId}/`, updatePayload);
            logger.info(`✅ Updated existing client ${tutorcruncherClientId} with latest booking info`);
          } catch (updateError) {
            logger.warn({ data: updateError.message }, `⚠️ Could not update existing client ${tutorcruncherClientId}:`);
            // Continue even if update fails - we have the client ID
          }
        } else {
          // Create new TutorCruncher client
          const clientPayload = {
            first_name: parentName.split(' ')[0] || parentName,
            last_name: parentName.split(' ').slice(1).join(' ') || '',
            email: parentEmail,
            phone: parentPhone || '',
            street: bookingData.address?.street || '',
            town: bookingData.address?.city || '',
            state: bookingData.address?.state || '',
            country: getTutorCruncherCountryId(bookingData.address?.country),
            postcode: bookingData.address?.zip || '',
            timezone: bookingData.timezone || 'America/New_York',
            status: 'live',
            received_notifications: [
              'invoice_reminders',
              'invoices',
              'apt_reminders',
              'pfi_reminders',
              'credit-requests',
              'broadcasts',
              'lesson_scheduled'
            ],
            send_emails: false // We'll send our own enrollment confirmation
          };
          
          try {
            const clientResponse = await tutorCruncherAPI.post('clients/', clientPayload);
            tutorcruncherClientId = clientResponse.data.id;
            logger.info(`✅ Created new TutorCruncher client: ${tutorcruncherClientId}`);
          } catch (createError) {
            // Handle 409 duplicate error - client was created between lookup and creation
            if (createError.response?.status === 409 || 
                (createError.response?.data?.email && createError.response.data.email.includes('already has a Client'))) {
              logger.info('⚠️ Client creation failed with duplicate error, looking up existing client...');
              
              // Lookup the existing client
              try {
                const normalizedEmail = parentEmail.toLowerCase().trim();
                const retryLookup = await tutorCruncherAPI.get('/clients/', {
                  params: { 
                    user__email: normalizedEmail
                  }
                });
                
                if (retryLookup.data.results && retryLookup.data.results.length > 0) {
                  tutorcruncherClientId = retryLookup.data.results[0].id;
                  logger.info(`✅ Found existing client after duplicate error: ${tutorcruncherClientId}`);
                } else {
                  throw createError; // Re-throw if we still can't find it
                }
              } catch (retryError) {
                throw createError; // Re-throw original error if lookup fails
              }
            } else {
              throw createError; // Re-throw if it's not a duplicate error
            }
          }
        }
        
        // Update submission with TutorCruncher client ID if submissionId exists
        if (submissionId && tutorcruncherClientId) {
          try {
            await pool.query(
              `UPDATE booking_submissions SET tc_client_id = $1 WHERE id = $2`,
              [tutorcruncherClientId, submissionId]
            );
            logger.info(`✅ Updated submission ${submissionId} with TutorCruncher client ID`);
          } catch (updateError) {
            logger.error({ data: updateError.message }, `⚠️ Could not update submission ${submissionId} with client ID:`);
          }
        }
      } catch (tcError) {
        logger.error({ data: tcError.response?.data || tcError.message }, '❌ Error creating/retrieving TutorCruncher client:');
        // For subscription flows, TutorCruncher sync is critical - fail if it doesn't work
        // But allow it to continue if we don't have bookingData (manual subscription creation)
        if (bookingData) {
          throw new Error(`TutorCruncher client creation failed: ${tcError.response?.data?.error || tcError.message}`);
        } else {
          logger.warn('⚠️ No bookingData provided, skipping TutorCruncher client creation');
        }
      }
    }

    // If payment method not provided, create Checkout Session in payment mode (like term payments)
    // This uses Stripe's hosted checkout page instead of custom page
    if (!paymentMethodId) {
      // Calculate payment details
      const enrollDate = new Date(enrollmentDate);
      const initialCharge = subscriptionBillingService.calculateInitialCharge(
        { enrollment_date: enrollmentDate },
        config,
        enrollDate
      );
      const nextBillingDate = subscriptionBillingService.getNextBillingDate(enrollDate);
      
      // Create Checkout Session in payment mode with initial charge
      // Stripe's hosted checkout will handle payment collection and subscription setup via webhook
      const baseUrl = process.env.FRONTEND_URL || 'https://join.acmeops.com';
      const unitAmount = Math.round(initialCharge.amount * 100); // Convert to cents
      
      const checkoutSession = await stripe.checkout.sessions.create({
        customer: finalStripeCustomerId,
        mode: 'payment', // Use payment mode instead of setup mode
        payment_method_types: ['card'],
        line_items: [
          {
            price_data: {
              currency: 'usd',
              product_data: {
                name: config.term_name || 'Monthly Billing Enrollment',
                description: `Initial payment: $${initialCharge.amount.toFixed(2)} for ${initialCharge.lessons} lesson${initialCharge.lessons !== 1 ? 's' : ''} this month. Future billing: $${(Number(config.rate_per_lesson) || 0).toFixed(2)} per lesson starting ${nextBillingDate.toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' })}.`
              },
              unit_amount: unitAmount,
            },
            quantity: 1,
          },
        ],
        payment_intent_data: {
          setup_future_usage: 'off_session', // Save payment method for future use
        },
        success_url: `${baseUrl}/booking-forms/success?${submissionId ? `submission_id=${submissionId}&` : ''}setup=success&session_id={CHECKOUT_SESSION_ID}`,
        cancel_url: `${baseUrl}/booking-forms/frontend?serviceId=${serviceId}&canceled=true`,
        metadata: {
          service_id: serviceId,
          enrollment_type: 'monthly',
          submission_id: submissionId || 'none',
          initial_charge_amount: initialCharge.amount.toFixed(2),
          initial_charge_lessons: initialCharge.lessons.toString(),
          rate_per_lesson: (Number(config.rate_per_lesson) || 0).toFixed(2),
          total_lessons: config.class_dates.length.toString(),
          term_name: config.term_name,
          client_id: tutorcruncherClientId || clientId || 'none',
          parent_email: parentEmail,
          parent_name: parentName || '',
          enrollment_date: enrollmentDate
        }
      });

      return res.json({
        success: false,
        requiresPaymentMethod: true,
        checkoutSessionId: checkoutSession.id,
        checkoutSessionUrl: checkoutSession.url, // Redirect directly to Stripe's hosted checkout
        stripeCustomerId: finalStripeCustomerId,
        clientId: tutorcruncherClientId || clientId || null,
        message: 'Redirecting to payment'
      });
    }

    // Attach payment method to customer
    try {
      await stripe.paymentMethods.attach(paymentMethodId, {
        customer: finalStripeCustomerId
      });
    } catch (err) {
      // Payment method might already be attached
      if (!err.message.includes('already been attached')) {
        throw err;
      }
    }

    // Set as default payment method
    await stripe.customers.update(finalStripeCustomerId, {
      invoice_settings: {
        default_payment_method: paymentMethodId
      }
    });

    // Calculate initial charge (remaining lessons in current month)
    const enrollDate = new Date(enrollmentDate);
    const initialCharge = subscriptionBillingService.calculateInitialCharge(
      { enrollment_date: enrollmentDate },
      config,
      enrollDate
    );

    // Get next billing date (1st of next month)
    const nextBillingDate = subscriptionBillingService.getNextBillingDate(enrollDate);
    const firstOfNextMonth = subscriptionBillingService.getFirstOfMonth(nextBillingDate);

    // Get final class date
    const sortedDates = config.class_dates.map(d => new Date(d)).sort((a, b) => a - b);
    const finalClassDate = sortedDates[sortedDates.length - 1];

    // TutorCruncher Integration: Add (student) recipient to service/appointments
    // IMPORTANT: TutorCruncher "recipient" is NOT the same as "client"
    let tutorcruncherRecipientId = recipientId || null;

    // NOTE: Keep manual-subscription fallback reachable by only entering the main block
    // when we have (or can reasonably derive) student/recipient context.
    const hasRecipientContext =
      !!tutorcruncherRecipientId || !!bookingData?.students?.[0] || !!submissionId;

    if (tutorcruncherClientId && serviceId && hasRecipientContext) {
      try {
        // Resolve student data (prefer request body; fallback to submission record)
        let students = Array.isArray(bookingData?.students) ? bookingData.students : null;
        if ((!students || students.length === 0) && submissionId) {
          try {
            const { rows } = await pool.query(
              `SELECT students FROM booking_submissions WHERE id = $1`,
              [submissionId]
            );
            if (rows.length && Array.isArray(rows[0].students)) {
              students = rows[0].students;
            }
          } catch (e) {
            logger.warn({ data: e.message }, `⚠️ Could not load students from submission ${submissionId}:`);
          }
        }

        // Ensure we have a real TutorCruncher recipient (student) ID
        if (!tutorcruncherRecipientId && students && students.length > 0) {
          const student = students[0];

          // Look up existing recipients for this client (match by name)
          let existingRecipients = [];
          try {
            const recipientsResponse = await tutorCruncherAPI.get(`/clients/${tutorcruncherClientId}/recipients/`);
            existingRecipients = recipientsResponse.data.results || [];
          } catch (e) {
            logger.warn({ data: e.message }, `⚠️ Could not fetch existing recipients for client ${tutorcruncherClientId}:`);
          }

          const match = existingRecipients.find((r) => {
            const ef = (r.first_name || '').toLowerCase().trim();
            const el = (r.last_name || '').toLowerCase().trim();
            const sf = (student.first || '').toLowerCase().trim();
            const sl = (student.last || '').toLowerCase().trim();
            return ef && el && sf && sl && ef === sf && el === sl;
          });

          if (match?.id) {
            tutorcruncherRecipientId = match.id;
            logger.info(`♻️ Using existing TutorCruncher recipient ${tutorcruncherRecipientId} for ${student.first} ${student.last}`);
          } else {
            const recipientCreatePayload = {
              first_name: (student.first || '').trim() || 'Student',
              last_name: (student.last || '').trim() || 'Unknown',
              paying_client: tutorcruncherClientId,
              date_of_birth: student.dob || null,
              extra_attrs: {
                notes: student.notes || '',
                current_school: student.school || ''
              }
            };

            const recipientCreateResp = await tutorCruncherAPI.post('/recipients/', recipientCreatePayload);
            tutorcruncherRecipientId = recipientCreateResp.data.id;
            logger.info(`✅ Created TutorCruncher recipient ${tutorcruncherRecipientId} for ${student.first} ${student.last}`);
          }
        }

        if (!tutorcruncherRecipientId) {
          logger.warn('⚠️ No TutorCruncher recipient ID available; skipping service/appointment recipient linking (service ${serviceId})');
        } else {
          const addToServicePayload = {
            recipient: tutorcruncherRecipientId,
            charge_rate: effectiveRatePerLesson // TutorCruncher expects dollars
          };

          // Retry logic: newly created recipients/clients can take a moment to propagate
          let recipientResponse = null;
          let lastRecipientError = null;
          const maxRecipientRetries = 5;
          const baseRetryDelay = 1500; // 1.5 seconds initial delay

          for (let retryAttempt = 0; retryAttempt < maxRecipientRetries; retryAttempt++) {
            try {
              if (retryAttempt > 0) {
                logger.info(`   🔄 Retry attempt ${retryAttempt}/${maxRecipientRetries - 1} to add recipient to service...`);
              }

              recipientResponse = await tutorCruncherAPI.post(
                `services/${serviceId}/recipient/add/`,
                addToServicePayload
              );

              lastRecipientError = null;
              break;
            } catch (retryError) {
              lastRecipientError = retryError;
              const errorData = retryError.response?.data;
              const errorMsg = typeof errorData === 'string' ? errorData : JSON.stringify(errorData);
              const isNotFound = errorMsg.includes('object does not exist') || errorMsg.includes('Invalid pk') || errorMsg.includes('does not exist');

              if (isNotFound && retryAttempt < maxRecipientRetries - 1) {
                const waitTime = baseRetryDelay * Math.pow(1.5, retryAttempt);
                logger.info(`   ⏳ Recipient/client not yet available, waiting ${Math.round(waitTime / 1000)}s before retry...`);
                await new Promise(resolve => setTimeout(resolve, waitTime));
              } else if (!isNotFound) {
                break;
              }
            }
          }

          if (lastRecipientError) throw lastRecipientError;

          // Keep our known recipient id; response may include it but don't fall back to client id
          const respRecipientId = recipientResponse?.data?.recipient;
          if (respRecipientId && respRecipientId !== tutorcruncherRecipientId) {
            tutorcruncherRecipientId = respRecipientId;
          }

          logger.info(`✅ Added recipient ${tutorcruncherRecipientId} to TutorCruncher service: ${serviceId}`);
        }
        
        // Update submission with TutorCruncher service ID if submissionId exists
        if (submissionId) {
          try {
            await pool.query(
              `UPDATE booking_submissions SET tc_service_id = $1 WHERE id = $2`,
              [serviceId, submissionId]
            );
            logger.info(`✅ Updated submission ${submissionId} with TutorCruncher service ID`);
          } catch (updateError) {
            logger.error({ data: updateError.message }, `⚠️ Could not update submission ${submissionId} with service ID:`);
          }
        }
        
        // Add recipient to appointments for this service (same as term billing)
        // For monthly billing, add recipient to all future appointments matching class dates
        if (config.class_dates && config.class_dates.length > 0 && tutorcruncherRecipientId) {
          try {
            logger.info(`👨‍🎓 Adding recipient ${tutorcruncherRecipientId} to appointments for service ${serviceId}`);
            
            // Get future appointments for this service
            const appointmentsResponse = await tutorCruncherAPI.get('/appointments/', {
              params: {
                service: serviceId,
                start__gte: new Date().toISOString().split('T')[0]
              }
            });

            const appointments = appointmentsResponse.data.results || [];
            logger.info(`   Found ${appointments.length} future appointment(s) for service ${serviceId}`);

            // Filter appointments to only those matching class dates (same logic as term billing)
            const classDatesArray = Array.isArray(config.class_dates) ? config.class_dates : [];
            
            for (const appointment of appointments) {
              // Check if appointment date matches a class date
              const appointmentDate = new Date(appointment.start).toISOString().split('T')[0];
              const isInTerm = classDatesArray.some(date => {
                const termDate = new Date(date).toISOString().split('T')[0];
                return termDate === appointmentDate;
              });
              
              if (isInTerm) {
                try {
                  await tutorCruncherAPI.post(
                    `/appointments/${appointment.id}/recipient/add/`,
                    { recipient: tutorcruncherRecipientId }
                  );
                  logger.info(`   ✅ Added recipient ${tutorcruncherRecipientId} to appointment ${appointment.id} (${appointmentDate})`);
                  await new Promise(resolve => setTimeout(resolve, 200)); // Rate limiting
                } catch (error) {
                  const errorMsg = error.response?.data?.error || error.message;
                  // Ignore "already exists" errors
                  if (!/already|exists|duplicate/i.test(errorMsg)) {
                    logger.error({ data: errorMsg }, `   ⚠️ Failed to add recipient to appointment ${appointment.id}:`);
                  } else {
                    logger.info(`   ℹ️  Recipient already in appointment ${appointment.id}`);
                  }
                }
              }
            }
          } catch (apptError) {
            logger.error({ data: apptError.message }, '⚠️ Error adding recipient to appointments:');
            // Don't fail enrollment if appointment addition fails - recipient is already added to service
          }
        }
      } catch (recipientError) {
        logger.error({ data: recipientError.response?.data || recipientError.message }, '❌ Error adding recipient to service:');
        // Recipient addition failure is non-critical - enrollment can still be created
        // The recipient can be added manually later or via a separate process
        // Log the error but don't fail the entire enrollment creation
        logger.warn('⚠️ Recipient addition failed, but continuing with enrollment creation. Recipient can be added manually later.');
        // Don't throw error - enrollment creation should succeed even if recipient addition fails
      }
    } else if (tutorcruncherClientId && serviceId && (!bookingData || !bookingData.students)) {
      // Manual subscriptions without bookingData: fallback to an unambiguous existing recipient
      // (previous behavior tried to add the client as a recipient; instead we pick a real recipient if possible).
      try {
        const recipientsResponse = await tutorCruncherAPI.get(`/clients/${tutorcruncherClientId}/recipients/`);
        const existingRecipients = recipientsResponse.data.results || [];

        if (existingRecipients.length === 1) {
          tutorcruncherRecipientId = existingRecipients[0].id;
          logger.info(`♻️ Manual subscription fallback: using sole recipient ${tutorcruncherRecipientId} for client ${tutorcruncherClientId}`);

          await tutorCruncherAPI.post(
            `services/${serviceId}/recipient/add/`,
            {
              recipient: tutorcruncherRecipientId,
              charge_rate: effectiveRatePerLesson
            }
          );

          logger.info(`✅ Manual subscription fallback: added recipient ${tutorcruncherRecipientId} to service ${serviceId}`);
        } else if (existingRecipients.length > 1) {
          logger.warn({ tutorcruncherClientId, serviceId }, '⚠️ Manual subscription fallback: client has multiple recipients; cannot infer which to add. Provide recipientId or bookingData.students.');
        } else {
          logger.warn({ tutorcruncherClientId, serviceId }, '⚠️ Manual subscription fallback: client has no recipients; cannot add without student info.');
        }
      } catch (err) {
        logger.warn({ data: err.response?.data || err.message }, `⚠️ Manual subscription fallback failed for service ${serviceId}:`);
      }
    }

    // Build detailed description for subscription
    const formatDate = (date) => {
      return date.toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' });
    };
    
    const nextBillingDateFormatted = formatDate(nextBillingDate);
    const finalClassDateFormatted = formatDate(finalClassDate);
    const totalLessons = config.class_dates.length;
    const ratePerLesson = Number(config.rate_per_lesson) || 0;
    const termDiscountPercent = Number(config.term_discount_percent) || 0;

    // Owner/staff discount replaces term discount (use whichever is higher)
    const finalDiscountPercent = Math.max(termDiscountPercent, appliedDiscountPercent);
    const finalEffectiveRate = finalDiscountPercent > 0
      ? parseFloat((ratePerLesson * (1 - finalDiscountPercent / 100)).toFixed(2))
      : ratePerLesson;

    // Calculate future monthly charges for description
    const monthlyDistribution = subscriptionBillingService.calculateMonthlyDistribution(config.class_dates);
    const futureMonths = Object.keys(monthlyDistribution).filter(monthKey => {
      const [year, month] = monthKey.split('-').map(Number);
      const monthDate = new Date(year, month - 1, 1);
      return monthDate >= firstOfNextMonth;
    });

    const discountNote = finalDiscountPercent > 0
      ? `\n• ${finalDiscountPercent}% ${appliedDiscountType || 'term'} discount applied ($${ratePerLesson.toFixed(2)} → $${finalEffectiveRate.toFixed(2)} per lesson)`
      : '';

    const subscriptionDescription = `Monthly subscription for ${config.term_name}

PAYING TODAY: $${initialCharge.amount.toFixed(2)} for ${initialCharge.lessons} lesson${initialCharge.lessons !== 1 ? 's' : ''} this month

FUTURE PAYMENTS:
• Starting ${nextBillingDateFormatted}, you'll be charged monthly on the 1st of each month
• Amount varies by month based on number of lessons ($${finalEffectiveRate.toFixed(2)} per lesson)${discountNote}
• Future months: ${futureMonths.length} month${futureMonths.length !== 1 ? 's' : ''} remaining
• Total term: ${totalLessons} lessons ending ${finalClassDateFormatted}
• Only charged for actual class dates (holidays skipped automatically)

You can cancel anytime - billing stops at the end of the current month.`;

    // Create Stripe product and price for the subscription
    // Note: Stripe subscriptions require a price ID, not inline price_data with product_data
    const product = await stripe.products.create({
      name: `${config.term_name} - Monthly Subscription`,
      description: subscriptionDescription,
      metadata: {
        service_id: serviceId,
        term_name: config.term_name,
      }
    });

    const price = await stripe.prices.create({
      currency: 'usd',
      product: product.id,
      recurring: {
        interval: 'month',
      },
      unit_amount: Math.round(finalEffectiveRate * 100), // Use discounted rate if owner/staff/term discount applies
    });

    // Create Stripe subscription using the price ID
    // IMPORTANT: Set proration_behavior to 'none' to prevent Stripe from automatically
    // prorating charges when billing_cycle_anchor is in the future. We handle initial
    // charges manually via a separate invoice.
    const subscription = await stripe.subscriptions.create({
      customer: finalStripeCustomerId,
      items: [{
        price: price.id,
      }],
      billing_cycle_anchor: Math.floor(nextBillingDate.getTime() / 1000), // Unix timestamp
      proration_behavior: 'none', // Prevent automatic proration - we handle initial charge separately
      metadata: {
        service_id: serviceId,
        term_name: config.term_name,
        tutorcruncher_client_id: tutorcruncherClientId || clientId || '',
        recipient_id: tutorcruncherRecipientId || recipientId || '',
        enrollment_date: enrollmentDate,
        initial_charge_amount: initialCharge.amount.toFixed(2),
        initial_charge_lessons: initialCharge.lessons.toString(),
        rate_per_lesson: ratePerLesson.toFixed(2),
        total_lessons: totalLessons.toString(),
        next_billing_date: nextBillingDateFormatted,
        final_class_date: finalClassDateFormatted
      },
      collection_method: 'charge_automatically',
      payment_behavior: 'default_incomplete',
    });

    // Charge immediately for current month (if there are remaining lessons)
    if (initialCharge.lessons > 0) {
      const invoiceDescription = `Initial charge: $${initialCharge.amount.toFixed(2)} for ${initialCharge.lessons} lesson${initialCharge.lessons !== 1 ? 's' : ''} this month (${formatDate(enrollDate)} - ${formatDate(new Date(enrollDate.getFullYear(), enrollDate.getMonth() + 1, 0))})

Future payments: Starting ${nextBillingDateFormatted}, billed monthly on the 1st at $${ratePerLesson.toFixed(2)} per lesson for remaining ${totalLessons - initialCharge.lessons} lessons.`;
      
      await stripe.invoices.create({
        customer: finalStripeCustomerId,
        subscription: subscription.id,
        description: invoiceDescription,
        auto_advance: true, // Automatically finalize and attempt payment
      });
    }

    // Check if enrollment record already exists (pre-created during submission)
    let enrollment = null;
    if (submissionId) {
      const existingEnrollmentResult = await pool.query(
        `SELECT * FROM subscription_enrollments 
        WHERE metadata->>'submissionId' = $1 
        AND status = 'pending'
        ORDER BY created_at DESC
        LIMIT 1`,
        [submissionId.toString()]
      );
      
      if (existingEnrollmentResult.rows.length > 0) {
        enrollment = existingEnrollmentResult.rows[0];
        logger.info(`✅ Found existing pending enrollment ${enrollment.id} for submission ${submissionId}`);
        
        // Update existing enrollment record
        const updateResult = await pool.query(
          `UPDATE subscription_enrollments SET
            client_id = $1,
            recipient_id = $2,
            stripe_customer_id = $3,
            stripe_subscription_id = $4,
            first_billing_date = $5,
            final_class_date = $6,
            current_month_lessons = $7,
            total_lessons_remaining = $8,
            status = $9,
            metadata = $10::jsonb
          WHERE id = $11
          RETURNING *`,
          [
            tutorcruncherClientId || clientId || enrollment.client_id,
            tutorcruncherRecipientId || recipientId || enrollment.recipient_id,
            finalStripeCustomerId,
            subscription.id,
            nextBillingDate.toISOString().split('T')[0],
            finalClassDate.toISOString().split('T')[0],
            initialCharge.lessons,
            config.class_dates.length,
            'active',
            JSON.stringify({
              ...(typeof enrollment.metadata === 'object' ? enrollment.metadata : {}),
              initialCharge,
              ratePerLesson: Number(config.rate_per_lesson) || 0,
              tutorcruncherClientId: tutorcruncherClientId || clientId,
              tutorcruncherRecipientId: tutorcruncherRecipientId || recipientId,
              submissionId: submissionId || null,
              parentEmail: parentEmail,
              parentName: parentName,
              parentPhone: parentPhone,
              completedAt: new Date().toISOString()
            })
          ]
        );
        
        enrollment = updateResult.rows[0];
        logger.info(`✅ Updated enrollment ${enrollment.id} to active status`);
      }
    }
    
    // Create enrollment record if it doesn't exist
    if (!enrollment) {
      const enrollmentResult = await pool.query(
        `INSERT INTO subscription_enrollments (
          service_id, client_id, recipient_id, stripe_customer_id, stripe_subscription_id,
          payment_type, enrollment_date, first_billing_date, final_class_date,
          current_month_lessons, total_lessons_remaining, status, metadata
        ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13)
        RETURNING *`,
        [
          serviceId,
          tutorcruncherClientId || clientId,
          tutorcruncherRecipientId || recipientId || null,
          finalStripeCustomerId,
          subscription.id,
          'monthly',
          enrollmentDate,
          nextBillingDate.toISOString().split('T')[0],
          finalClassDate.toISOString().split('T')[0],
          initialCharge.lessons,
          config.class_dates.length,
          'active',
          JSON.stringify({
            initialCharge,
            ratePerLesson: Number(config.rate_per_lesson) || 0,
            tutorcruncherClientId: tutorcruncherClientId || clientId,
            tutorcruncherRecipientId: tutorcruncherRecipientId || recipientId,
            submissionId: submissionId || null,
            parentEmail: parentEmail,
            parentName: parentName,
            parentPhone: parentPhone
          })
        ]
      );

      enrollment = enrollmentResult.rows[0];
    }

    // Create initial billing history record
    if (initialCharge.lessons > 0) {
      await pool.query(
        `INSERT INTO subscription_billing_history (
          enrollment_id, billing_month, lessons_count, amount_charged, status
        ) VALUES ($1, $2, $3, $4, $5)`,
        [
          enrollment.id,
          subscriptionBillingService.getFirstOfMonth(enrollDate).toISOString().split('T')[0],
          initialCharge.lessons,
          initialCharge.amount,
          'pending'
        ]
      );
    }

    // Send enrollment confirmation email
    try {
      const studentName = bookingData?.students?.[0] ? 
        `${bookingData.students[0].first} ${bookingData.students[0].last}` : 
        'Student';
      
      await subscriptionNotificationService.sendEnrollmentConfirmation(
        enrollment,
        config,
        {
          parentName: parentName,
          parentEmail: parentEmail,
          studentName: studentName,
          paymentPlan: 'monthly'
        }
      );
    } catch (notifError) {
      logger.error({ data: notifError }, 'Error sending enrollment confirmation:');
      // Don't fail enrollment if email fails
    }

    // Clear subscription caches
    await cache.clearCacheByPrefix('subscriptions');

    res.json({
      success: true,
      enrollment: {
        id: enrollment.id,
        serviceId: enrollment.service_id,
        subscriptionId: subscription.id,
        status: enrollment.status,
        nextBillingDate: nextBillingDate.toISOString().split('T')[0],
        initialCharge
      }
    });
  } catch (error) {
    logger.error({ err: error }, '❌ Error creating subscription:');
    logger.error({ data: error.stack }, '   Stack trace:');
    
    // Safely access variables that may not be defined if error occurs early
    // Use try-catch to safely access req.body if destructuring failed
    let safeServiceId, safeParentEmail, safeSubmissionId, safeClientId, safeStripeCustomerId, safeTutorcruncherClientId;
    try {
      safeServiceId = serviceId || req.body?.serviceId || null;
      safeParentEmail = parentEmail || req.body?.parentEmail || null;
      safeSubmissionId = submissionId || req.body?.submissionId || null;
      safeClientId = clientId || req.body?.clientId || null;
      safeStripeCustomerId = finalStripeCustomerId || req.body?.stripeCustomerId || null;
      safeTutorcruncherClientId = tutorcruncherClientId || safeClientId || null;
    } catch (e) {
      // If even accessing req.body fails, use null values
      safeServiceId = null;
      safeParentEmail = null;
      safeSubmissionId = null;
      safeClientId = null;
      safeStripeCustomerId = null;
      safeTutorcruncherClientId = null;
    }
    
    // Log detailed error information
    const errorDetails = {
      type: 'subscription_creation_failed',
      error: error.message,
      timestamp: new Date().toISOString(),
      serviceId: safeServiceId,
      stripeCustomerId: safeStripeCustomerId,
      submissionId: safeSubmissionId,
      parentEmail: safeParentEmail,
      tutorcruncherClientId: safeTutorcruncherClientId,
      stripeError: error.stripeError || null,
      responseData: error.response?.data || null
    };
    
    logger.error({ data: JSON.stringify(errorDetails, null, 2) }, '   Error details:');
    
    // Store error in submission if submissionId exists
    if (safeSubmissionId) {
      try {
        await pool.query(
          `UPDATE booking_submissions 
          SET payment_errors = COALESCE(payment_errors, '[]'::jsonb) || $2::jsonb
          WHERE id = $1`,
          [safeSubmissionId, JSON.stringify([errorDetails])]
        );
        logger.info(`✅ Stored error in submission ${safeSubmissionId} for review`);
      } catch (dbError) {
        logger.error({ data: dbError.message }, '⚠️ Could not store error in database:');
      }
    }
    
    // Store error in a dedicated table for monitoring (if table exists)
    if (safeServiceId) {
      try {
        await pool.query(
          `INSERT INTO subscription_creation_errors (
            service_id, stripe_customer_id, submission_id, parent_email,
            error_message, error_details, created_at
          ) VALUES ($1, $2, $3, $4, $5, $6, NOW())
          ON CONFLICT DO NOTHING`,
          [
            safeServiceId,
            safeStripeCustomerId,
            safeSubmissionId,
            safeParentEmail,
            error.message,
            JSON.stringify(errorDetails)
          ]
        );
      } catch (monitoringError) {
        // Table might not exist, that's okay
        console.debug('Could not log to monitoring table (may not exist):', monitoringError.message);
      }
    }
    
    res.status(500).json({
      error: 'Failed to create subscription',
      message: error.message,
      stripeError: error.stripeError || null,
      errorId: errorDetails.timestamp // Use timestamp as error ID for tracking
    });
  }
}));

/**
 * POST /api/subscriptions/create-term-payment
 * Create one-time payment for full term (with discount)
 */
router.post('/create-term-payment', asyncHandler(async (req, res) => {
  try {
    const {
      serviceId,
      clientId,
      recipientId,
      parentEmail,
      parentName,
      parentPhone,
      paymentMethodId,
      enrollmentDate,
      submissionId,
      bookingData,
      isOwnerBooking,
      isStaffBooking
    } = req.body;

    // Validation
    if (!serviceId || !parentEmail || !enrollmentDate) {
      return res.status(400).json({
        error: 'Missing required fields: serviceId, parentEmail, enrollmentDate'
      });
    }

    // Get term billing config
    const configResult = await pool.query(
      'SELECT * FROM term_billing_configs WHERE service_id = $1 AND is_active = true',
      [serviceId]
    );

    if (configResult.rows.length === 0) {
      return res.status(404).json({
        error: 'No active term billing config found for this service'
      });
    }

    const config = configResult.rows[0];
    // Handle JSONB field - might be string or already parsed
    if (typeof config.class_dates === 'string') {
      try {
        // Trim whitespace and check if it's valid JSON
        const trimmed = config.class_dates.trim();
        if (trimmed.startsWith('[') || trimmed.startsWith('{')) {
          config.class_dates = JSON.parse(trimmed);
        } else {
          logger.error({ data: trimmed.substring(0, 50) }, 'Invalid JSON format for class_dates:');
          return res.status(500).json({
            error: 'Invalid class_dates format in config',
            message: 'Expected JSON array but got: ' + trimmed.substring(0, 50)
          });
        }
      } catch (e) {
        logger.error({ err: e }, 'Error parsing class_dates:');
        logger.error({ data: config.class_dates }, 'Raw class_dates value:');
        return res.status(500).json({
          error: 'Invalid class_dates format in config',
          message: e.message
        });
      }
    } else if (!Array.isArray(config.class_dates)) {
      config.class_dates = [];
    }

    // Convert rate_per_lesson to number (comes from DB as string)
    config.rate_per_lesson = Number(config.rate_per_lesson) || 0;
    
    // Convert term_discount_percent to number if it exists
    if (config.term_discount_percent !== null && config.term_discount_percent !== undefined) {
      config.term_discount_percent = Number(config.term_discount_percent) || 0;
    }

    // Look up owner/staff discount config from Services table
    let appliedDiscountType = null;
    let appliedDiscountPercent = 0;

    if (isOwnerBooking || isStaffBooking) {
      try {
        const serviceDiscountResult = await pool.query(
          `SELECT "ownerDiscountEnabled", "ownerDiscountPercentMonthly", "ownerDiscountPercentTerm",
                  "staffDiscountEnabled", "staffDiscountPercentMonthly", "staffDiscountPercentTerm"
           FROM public."Services" WHERE "serviceId" = $1`,
          [String(serviceId)]
        );

        if (serviceDiscountResult.rows.length > 0) {
          const svc = serviceDiscountResult.rows[0];

          if (isOwnerBooking && svc.ownerDiscountEnabled) {
            appliedDiscountPercent = Number(svc.ownerDiscountPercentTerm) || 0;
            appliedDiscountType = 'owner';
          } else if (isStaffBooking && svc.staffDiscountEnabled) {
            appliedDiscountPercent = Number(svc.staffDiscountPercentTerm) || 0;
            appliedDiscountType = 'staff';
          }

          if (appliedDiscountPercent > 0) {
            logger.info({ serviceId, appliedDiscountType, appliedDiscountPercent },
              `💰 Term payment: ${appliedDiscountType} discount detected (${appliedDiscountPercent}% off)`);
          }
        }
      } catch (discountErr) {
        logger.error({ err: discountErr.message, serviceId }, '⚠️ Failed to look up discount config, using full rate');
      }
    }

    // TutorCruncher Integration: Create/update client
    let tutorcruncherClientId = clientId;
    
    try {
      if (!tutorcruncherClientId && bookingData) {
        // Create TutorCruncher client
        const clientPayload = {
          first_name: parentName.split(' ')[0] || parentName,
          last_name: parentName.split(' ').slice(1).join(' ') || '',
          email: parentEmail,
          phone: parentPhone || '',
          street: bookingData.address?.street || '',
          town: bookingData.address?.city || '',
          state: bookingData.address?.state || '',
          country: getTutorCruncherCountryId(bookingData.address?.country),
          postcode: bookingData.address?.zip || '',
          timezone: bookingData.timezone || 'America/New_York',
          status: 'live',
          received_notifications: [
            'invoice_reminders',
            'invoices',
            'apt_reminders',
            'pfi_reminders',
            'credit-requests',
            'broadcasts',
            'lesson_scheduled'
          ],
          send_emails: false
        };
        
        const clientResponse = await tutorCruncherAPI.post('clients/', clientPayload);
        tutorcruncherClientId = clientResponse.data.id;
        logger.info(`✅ Created TutorCruncher client: ${tutorcruncherClientId}`);
      }
    } catch (tcError) {
      logger.error({ data: tcError.response?.data || tcError.message }, 'Error with TutorCruncher integration:');
      // Continue with enrollment even if TutorCruncher integration fails
    }

    // Calculate prorated term payment
    // Owner/staff discount replaces term discount (use whichever is higher)
    const effectiveTermDiscount = Math.max(
      config.term_discount_percent ? parseFloat(config.term_discount_percent) : 0,
      appliedDiscountPercent
    ) || null;
    const enrollDate = new Date(enrollmentDate);
    const proratedPayment = subscriptionBillingService.calculateProratedTermPayment(
      config.class_dates,
      enrollDate,
      parseFloat(config.rate_per_lesson),
      effectiveTermDiscount
    );

    // Use discounted amount if available, otherwise regular amount
    const amountToCharge = proratedPayment.discountedAmount || proratedPayment.amount;

    // Get or create Stripe customer
    let stripeCustomerId;
    
    if (clientId) {
      const customerCheck = await pool.query(
        'SELECT stripe_customer_id FROM clients WHERE id = $1',
        [clientId]
      );

      if (customerCheck.rows.length > 0 && customerCheck.rows[0].stripe_customer_id) {
        stripeCustomerId = customerCheck.rows[0].stripe_customer_id;
      }
    }
    
    if (!stripeCustomerId) {
      const customer = await stripe.customers.create({
        email: parentEmail,
        name: parentName,
        phone: parentPhone,
        metadata: {
          tutorcruncher_client_id: clientId || 'pending',
          service_id: serviceId,
          submission_id: submissionId || 'none'
        }
      });
      stripeCustomerId = customer.id;

      if (clientId) {
        try {
          await pool.query(
            'UPDATE clients SET stripe_customer_id = $1 WHERE id = $2',
            [stripeCustomerId, clientId]
          );
        } catch (err) {
          logger.warn({ error: err.message }, 'Could not update clients table:');
        }
      }
    }

    // If payment method not provided, create Stripe Checkout Session for one-time payment
    if (!paymentMethodId) {
      const formatDate = (date) => {
        return date.toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' });
      };
      const sortedDates = config.class_dates.map(d => new Date(d)).sort((a, b) => a - b);
      const finalClassDate = sortedDates[sortedDates.length - 1];
      const amountToChargeForSetup = proratedPayment.discountedAmount || proratedPayment.amount;
      
      // Build description for checkout with lesson dates
      const lessonDates = sortedDates.slice(0, proratedPayment.lessons); // Get only the lessons being paid for
      const formattedDates = lessonDates.map(date => formatDate(date));
      
      let checkoutDescription = `Full Term Payment: ${proratedPayment.lessons} lesson${proratedPayment.lessons !== 1 ? 's' : ''}`;
      if (config.term_discount_percent > 0) {
        checkoutDescription += ` (${config.term_discount_percent}% discount applied)`;
      }
      
      // Add lesson dates - format as numbered list with each date on its own line
      if (formattedDates.length > 0) {
        checkoutDescription += ` Lesson Dates:`;
        formattedDates.forEach((date, index) => {
          checkoutDescription += `\n${index + 1}. ${date}`;
        });
      }
      
      // Determine success/cancel URLs — MUST use the originating app's hostname
      // so franchise apps (Eastside, 'Westside') redirect back to themselves, not the main app
      const baseUrl = `${req.protocol}://${req.get('host')}`;
      const successUrl = `${baseUrl}/booking-forms/success?submission_id=${submissionId || ''}&session_id={CHECKOUT_SESSION_ID}&type=term_payment`;
      const cancelUrl = `${baseUrl}/booking-forms/frontend?serviceId=${serviceId}&cancelled=true`;
      
      // Create Stripe Checkout Session for one-time payment
      const checkoutSession = await stripe.checkout.sessions.create({
        customer: stripeCustomerId,
        mode: 'payment',
        payment_method_types: ['card'],
        line_items: [{
          price_data: {
            currency: 'usd',
            product_data: {
              name: config.term_name || 'Full Term Payment',
              description: checkoutDescription,
            },
            unit_amount: Math.round(amountToChargeForSetup * 100), // Convert to cents
          },
          quantity: 1,
        }],
        success_url: successUrl,
        cancel_url: cancelUrl,
        metadata: {
          service_id: serviceId,
          enrollment_type: 'term',
          submission_id: submissionId || 'none',
          tutorcruncher_client_id: tutorcruncherClientId || clientId || 'pending',
          enrollment_date: enrollmentDate,
          amount_charged: amountToChargeForSetup.toFixed(2),
          lessons: proratedPayment.lessons.toString(),
          total_lessons: config.class_dates.length.toString(),
          discount_percent: (config.term_discount_percent || 0).toString(),
          term_name: config.term_name,
          final_class_date: finalClassDate.toISOString().split('T')[0],
          location: req.location || 'production', // Track originating app for webhook DB routing
          booking_data: bookingData ? JSON.stringify(bookingData).substring(0, 500) : '' // Truncate to fit metadata limit
        },
        payment_intent_data: {
          description: `Full Term Payment for ${config.term_name}`,
          metadata: {
            service_id: serviceId,
            enrollment_type: 'term',
            submission_id: submissionId || 'none',
            lessons: proratedPayment.lessons.toString(),
            discount_percent: (config.term_discount_percent || 0).toString()
          }
        }
      });

      logger.info(`✅ Created Stripe Checkout Session for term payment: ${checkoutSession.id}`);

      return res.json({
        success: false,
        requiresPaymentMethod: true,
        checkoutSessionUrl: checkoutSession.url,
        checkoutSessionId: checkoutSession.id,
        stripeCustomerId: stripeCustomerId,
        message: 'Payment method required',
        paymentDetails: {
          amount: amountToChargeForSetup,
          lessons: proratedPayment.lessons,
          totalLessons: config.class_dates.length,
          discountPercent: config.term_discount_percent || 0,
          termName: config.term_name,
          finalClassDate: formatDate(finalClassDate),
          description: `One-time payment of $${amountToChargeForSetup.toFixed(2)} for ${proratedPayment.lessons} lesson${proratedPayment.lessons !== 1 ? 's' : ''}${config.term_discount_percent > 0 ? ` (${config.term_discount_percent}% discount applied)` : ''}`
        }
      });
    }

    // Attach payment method
    try {
      await stripe.paymentMethods.attach(paymentMethodId, {
        customer: stripeCustomerId
      });
    } catch (err) {
      if (!err.message.includes('already been attached')) {
        throw err;
      }
    }

    // Build description for term payment
    const formatDate = (date) => {
      return date.toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' });
    };
    
    const enrollDateFormatted = formatDate(new Date(enrollmentDate));
    const finalClassDateFormatted = formatDate(finalClassDate);
    const totalLessons = config.class_dates.length;
    
    let paymentDescription = `Full Term Payment: $${amountToCharge.toFixed(2)} for ${proratedPayment.lessons} lesson${proratedPayment.lessons !== 1 ? 's' : ''}`;
    
    if (proratedPayment.lessons < totalLessons) {
      paymentDescription += ` (prorated - joining mid-term)`;
    }
    
    paymentDescription += `\n\nTerm: ${config.term_name}`;
    paymentDescription += `\nLessons: ${proratedPayment.lessons} of ${totalLessons} total lessons`;
    paymentDescription += `\nEnrollment: ${enrollDateFormatted}`;
    paymentDescription += `\nFinal class: ${finalClassDateFormatted}`;
    
    if (config.term_discount_percent > 0) {
      const regularPrice = proratedPayment.lessons * Number(config.rate_per_lesson);
      const savings = regularPrice - amountToCharge;
      paymentDescription += `\n\nDiscount: ${config.term_discount_percent}% off`;
      paymentDescription += `\nRegular price: $${regularPrice.toFixed(2)}`;
      paymentDescription += `\nYou save: $${savings.toFixed(2)}`;
    }
    
    paymentDescription += `\n\nThis is a one-time payment covering all lessons for the term. No future charges will be made.`;

    // Create payment intent
    const paymentIntent = await stripe.paymentIntents.create({
      amount: Math.round(amountToCharge * 100), // Convert to cents
      currency: 'usd',
      customer: stripeCustomerId,
      payment_method: paymentMethodId,
      confirm: true,
      description: paymentDescription,
      metadata: {
        service_id: serviceId,
        term_name: config.term_name,
        tutorcruncher_client_id: clientId,
        recipient_id: recipientId || '',
        enrollment_date: enrollmentDate,
        payment_type: 'term',
        lessons: proratedPayment.lessons,
        discount_applied: config.term_discount_percent || 0
      }
    });

    // Get final class date
    const sortedDates = config.class_dates.map(d => new Date(d)).sort((a, b) => a - b);
    const finalClassDate = sortedDates[sortedDates.length - 1];

    // Create enrollment record (no subscription for term payments)
    const enrollmentResult = await pool.query(
      `INSERT INTO subscription_enrollments (
        service_id, client_id, recipient_id, stripe_customer_id,
        payment_type, enrollment_date, first_billing_date, final_class_date,
        total_lessons_remaining, status, metadata
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)
      RETURNING *`,
      [
        serviceId,
        tutorcruncherClientId || clientId,
        recipientId || null,
        stripeCustomerId,
        'term',
        enrollmentDate,
        enrollmentDate, // First billing = enrollment date for term payments
        finalClassDate.toISOString().split('T')[0],
        proratedPayment.lessons,
        'active',
        JSON.stringify({
          paymentIntentId: paymentIntent.id,
          amountCharged: amountToCharge,
          discountApplied: effectiveTermDiscount || 0,
          discountType: appliedDiscountType || 'term',
          lessons: proratedPayment.lessons,
          tutorcruncherClientId: tutorcruncherClientId || clientId,
          recipientId: finalRecipientId || recipientId || null,
          discountedRatePerLesson: discountedRatePerLesson,
          creditRequestId: creditRequestId || null
        })
      ]
    );

    const enrollment = enrollmentResult.rows[0];

    // Calculate discounted rate per lesson (for setting on recipients/appointments)
    const ratePerLesson = Number(config.rate_per_lesson) || 0;
    const termDiscountPercent = Number(config.term_discount_percent) || 0;

    // Owner/staff discount replaces term discount (use whichever is higher)
    const finalDiscountPercent = Math.max(termDiscountPercent, appliedDiscountPercent);
    const discountedRatePerLesson = finalDiscountPercent > 0
      ? parseFloat((ratePerLesson * (1 - finalDiscountPercent / 100)).toFixed(2))
      : ratePerLesson;

    if (appliedDiscountPercent > 0) {
      logger.info({ serviceId, appliedDiscountType, termDiscountPercent, appliedDiscountPercent, finalDiscountPercent, ratePerLesson, discountedRatePerLesson },
        `💰 Term payment: using ${appliedDiscountType} discount (${appliedDiscountPercent}%) over term discount (${termDiscountPercent}%)`);
    }

    // Create credit request (proforma invoice) in TutorCruncher for the discounted term total
    // This credits the client's account so lessons can charge against it
    let creditRequestId = null;
    if (tutorcruncherClientId && amountToCharge > 0 && paymentIntent.status === 'succeeded') {
      try {
        logger.info(`💳 Creating credit request for client ${tutorcruncherClientId}: $${amountToCharge}`);
        const creditRequestPayload = {
          amount: parseFloat(amountToCharge.toFixed(2)),
          client: parseInt(tutorcruncherClientId),
          send_pfi: false, // Don't auto-raise — Stripe already collected payment, just create the accounting record
          description: `Term Payment: ${proratedPayment.lessons} lesson${proratedPayment.lessons !== 1 ? 's' : ''} for ${config.term_name || 'Term'}${finalDiscountPercent > 0 ? ` (${finalDiscountPercent}% ${appliedDiscountType || 'term'} discount applied)` : ''}`
        };

        logger.info({ data: JSON.stringify(creditRequestPayload, null, 2) }, '📋 Credit request payload:');
        const creditResponse = await tutorCruncherAPI.post('/proforma-invoices/', creditRequestPayload);
        creditRequestId = creditResponse.data.id;
        const creditRequestStatus = creditResponse.data.status;
        logger.info(`✅ Created credit request (proforma invoice) ID: ${creditRequestId}, Status: ${creditRequestStatus}`);

        // Wait for credit request to be fully created
        await new Promise(resolve => setTimeout(resolve, 1500));

        // Mark credit as paid immediately (payment already processed via Stripe)
        try {
          await tutorCruncherAPI.post(`/proforma-invoices/${creditRequestId}/take_payment/`, {
            amount: parseFloat(amountToCharge.toFixed(2)),
            method: 'cash', // Record as externally paid — Stripe already collected the payment
            send_receipt: false
          });
          logger.info(`✅ Marked credit request ${creditRequestId} as paid: $${amountToCharge}`);
        } catch (paymentError) {
          logger.error({ data: paymentError.response?.data || paymentError.message }, '⚠️ Failed to mark credit request as paid:');
          logger.error(`🚨 MANUAL ACTION REQUIRED: Credit request ${creditRequestId} created but not marked as paid for client ${tutorcruncherClientId}`);
          // Don't fail enrollment if credit payment marking fails - credit still exists
        }
      } catch (creditError) {
        logger.error({ data: creditError.response?.data || creditError.message }, '❌ Failed to create credit request:');
        // Don't fail enrollment if credit creation fails - log error but continue
      }
    }

    // Create recipients from bookingData.students if available and recipientId not provided
    let finalRecipientId = recipientId;
    if (!finalRecipientId && tutorcruncherClientId && bookingData?.students?.[0] && paymentIntent.status === 'succeeded') {
      try {
        const { createOrUpdateRecipient } = require('../utils/clientManager');
        
        // Get existing recipients for this client
        let existingRecipients = [];
        try {
          const recipientsResponse = await tutorCruncherAPI.get(`/clients/${tutorcruncherClientId}/recipients/`);
          existingRecipients = recipientsResponse.data.results || [];
        } catch (error) {
          logger.info(`⚠️ Could not fetch existing recipients: ${error.message}`);
        }

        // Create/update recipient from first student
        const student = bookingData.students[0];
        if (student) {
          // Normalize student object - handle both formats (first/last/dob OR first_name/last_name/date_of_birth)
          const normalizedStudent = {
            first: student.first || student.first_name || '',
            last: student.last || student.last_name || '',
            dob: student.dob || student.date_of_birth || '',
            school: student.school || student.current_school || '',
            notes: student.notes || ''
          };
          
          if (normalizedStudent.first && normalizedStudent.last) {
            const recipientResult = await createOrUpdateRecipient(
              normalizedStudent,
              tutorcruncherClientId,
              existingRecipients,
              bookingData.colour || '#6A469D'
            );
            finalRecipientId = recipientResult.recipientId;
            logger.info(`✅ Created/updated recipient ${finalRecipientId} - ${normalizedStudent.first} ${normalizedStudent.last}`);
          } else {
            logger.warn({ data: student }, '⚠️ Skipping recipient creation - missing first or last name:');
          }
        }
      } catch (recipientCreateError) {
        logger.error({ data: recipientCreateError.message }, '⚠️ Failed to create recipient:');
        // Continue even if recipient creation fails
      }
    }

    // Add recipient to service with discounted charge rate (if recipient exists)
    if (tutorcruncherClientId && finalRecipientId && serviceId && paymentIntent.status === 'succeeded') {
      try {
        const addToServicePayload = {
          recipient: finalRecipientId,
          charge_rate: discountedRatePerLesson // Use discounted rate, not full rate
        };

        await tutorCruncherAPI.post(`services/${serviceId}/recipient/add/`, addToServicePayload);
        logger.info(`✅ Added recipient ${finalRecipientId} to service ${serviceId} with discounted charge rate $${discountedRatePerLesson}`);
      } catch (recipientError) {
        const errorMsg = recipientError.response?.data?.error || recipientError.message;
        if (!/already|exists|duplicate/i.test(errorMsg)) {
          logger.error({ data: errorMsg }, '⚠️ Failed to add recipient to service:');
        } else {
          logger.info('ℹ️  Recipient already in service, updating charge rate if needed');
        }
      }
    }

    // Add recipient to appointments with discounted charge rate
    if (tutorcruncherClientId && finalRecipientId && serviceId && config.class_dates && config.class_dates.length > 0 && paymentIntent.status === 'succeeded') {
      try {
        logger.info(`👨‍🎓 Adding recipient ${finalRecipientId} to appointments for service ${serviceId} with discounted rate $${discountedRatePerLesson}`);

        // Get future appointments for this service
        const appointmentsResponse = await tutorCruncherAPI.get('/appointments/', {
          params: {
            service: serviceId,
            start__gte: new Date().toISOString().split('T')[0]
          }
        });

        const appointments = appointmentsResponse.data.results || [];
        const classDates = config.class_dates.map(d => new Date(d).toISOString().split('T')[0]);

        for (const appointment of appointments) {
          const appointmentDate = new Date(appointment.start).toISOString().split('T')[0];
          const isInTerm = classDates.some(date => {
            const termDate = new Date(date).toISOString().split('T')[0];
            return termDate === appointmentDate;
          });

          if (isInTerm) {
            try {
              // Add recipient to appointment with discounted charge rate
              const recipientPayload = {
                recipient: finalRecipientId,
                charge_rate: discountedRatePerLesson.toFixed(2)
              };

              await tutorCruncherAPI.post(`/appointments/${appointment.id}/recipient/add/`, recipientPayload);
              logger.info(`   ✅ Added recipient ${finalRecipientId} to appointment ${appointment.id} with discounted rate $${discountedRatePerLesson}`);
              await new Promise(resolve => setTimeout(resolve, 200)); // Rate limiting
            } catch (error) {
              const errorMsg = error.response?.data?.error || error.message;
              if (!/already|exists|duplicate/i.test(errorMsg)) {
                logger.error({ data: errorMsg }, `   ⚠️ Failed to add recipient to appointment ${appointment.id}:`);
              } else {
                logger.info(`   ℹ️  Recipient already in appointment ${appointment.id}`);
              }
            }
          }
        }
      } catch (apptError) {
        logger.error({ data: apptError.message }, '⚠️ Error adding recipient to appointments:');
        // Don't fail enrollment if appointment addition fails
      }
    }

    // Update enrollment metadata with credit request ID
    if (creditRequestId) {
      const updatedMetadata = JSON.parse(enrollment.metadata || '{}');
      updatedMetadata.creditRequestId = creditRequestId;
      updatedMetadata.discountedRatePerLesson = discountedRatePerLesson;
      
      await pool.query(
        `UPDATE subscription_enrollments SET metadata = $1 WHERE id = $2`,
        [JSON.stringify(updatedMetadata), enrollment.id]
      );
    }

    // Create billing history record
    await pool.query(
      `INSERT INTO subscription_billing_history (
        enrollment_id, billing_month, lessons_count, amount_charged,
        stripe_payment_intent_id, status, billed_at
      ) VALUES ($1, $2, $3, $4, $5, $6, NOW())`,
      [
        enrollment.id,
        subscriptionBillingService.getFirstOfMonth(enrollDate).toISOString().split('T')[0],
        proratedPayment.lessons,
        amountToCharge,
        paymentIntent.id,
        paymentIntent.status === 'succeeded' ? 'succeeded' : 'pending'
      ]
    );

    // Send enrollment confirmation email
    try {
      const studentName = bookingData?.students?.[0] ? 
        `${bookingData.students[0].first} ${bookingData.students[0].last}` : 
        'Student';
      
      await subscriptionNotificationService.sendEnrollmentConfirmation(
        enrollment,
        config,
        {
          parentName: parentName,
          parentEmail: parentEmail,
          studentName: studentName,
          paymentPlan: 'term'
        }
      );
    } catch (notifError) {
      logger.error({ data: notifError }, 'Error sending enrollment confirmation:');
      // Don't fail enrollment if email fails
    }

    // Clear subscription caches
    await cache.clearCacheByPrefix('subscriptions');

    res.json({
      success: true,
      enrollment: {
        id: enrollment.id,
        serviceId: enrollment.service_id,
        paymentIntentId: paymentIntent.id,
        status: paymentIntent.status,
        amountCharged: amountToCharge,
        lessons: proratedPayment.lessons
      }
    });
  } catch (error) {
    logger.error({ err: error }, 'Error creating term payment:');
    res.status(500).json({
      error: 'Failed to create term payment',
      message: error.message,
      stripeError: error.stripeError || null
    });
  }
}));

/**
 * GET /api/subscriptions
 * List all subscriptions with optional filtering
 */
router.get('/', auth, asyncHandler(async (req, res) => {
  try {
    // Use location-specific database connection
    const locationPool = req.locationPool || pool;

    const {
      status,
      serviceId,
      clientId,
      paymentType,
      search,
      startDate,
      endDate,
      minAmount,
      maxAmount,
      limit = 50,
      offset = 0
    } = req.query;

    // Build cache key from query params
    const cacheKey = `subscriptions:list:${status || 'all'}:${serviceId || 'all'}:${clientId || 'all'}:${paymentType || 'all'}:${search || 'none'}:${startDate || 'none'}:${endDate || 'none'}:${minAmount || 'none'}:${maxAmount || 'none'}:${limit}:${offset}`;

    const cachedData = await cache.getOrSet(cacheKey, async () => {

    // Build query
    let query = `
      SELECT 
        se.*,
        tbc.term_name,
        tbc.rate_per_lesson,
        s.name as service_name,
        c.first_name as client_first_name,
        c.last_name as client_last_name,
        COALESCE(TRIM(CONCAT(c.first_name, ' ', c.last_name)), 'Client ' || se.client_id) as client_name
      FROM subscription_enrollments se
      LEFT JOIN term_billing_configs tbc ON se.service_id = tbc.service_id AND tbc.is_active = true
      LEFT JOIN "Services" s ON se.service_id::text = s."serviceId"::text
      LEFT JOIN clients c ON se.client_id::text = c.client_id::text
      WHERE 1=1
    `;
    const params = [];
    let paramCount = 0;

    // Apply filters
    if (status && status !== 'all') {
      paramCount++;
      query += ` AND se.status = $${paramCount}`;
      params.push(status);
    }

    if (serviceId) {
      paramCount++;
      query += ` AND se.service_id = $${paramCount}`;
      params.push(serviceId);
    }

    if (clientId) {
      paramCount++;
      query += ` AND se.client_id::text = $${paramCount}`;
      params.push(clientId);
    }

    if (paymentType && paymentType !== 'all') {
      paramCount++;
      query += ` AND se.payment_type = $${paramCount}`;
      params.push(paymentType);
    }

    if (startDate) {
      paramCount++;
      query += ` AND se.enrollment_date >= $${paramCount}`;
      params.push(startDate);
    }

    if (endDate) {
      paramCount++;
      query += ` AND se.enrollment_date <= $${paramCount}`;
      params.push(endDate);
    }

    if (search) {
      paramCount++;
      query += ` AND (
        se.client_id::text ILIKE $${paramCount} OR
        se.recipient_id::text ILIKE $${paramCount} OR
        tbc.term_name ILIKE $${paramCount} OR
        s.name ILIKE $${paramCount} OR
        c.first_name ILIKE $${paramCount} OR
        c.last_name ILIKE $${paramCount}
      )`;
      params.push(`%${search}%`);
    }

    // Order by most recent first
    query += ` ORDER BY se.created_at DESC`;

    // Add pagination
    paramCount++;
    query += ` LIMIT $${paramCount}`;
    params.push(parseInt(limit));

    paramCount++;
    query += ` OFFSET $${paramCount}`;
    params.push(parseInt(offset));

    const result = await locationPool.query(query, params);

    // Get total count for pagination
    let countQuery = `
      SELECT COUNT(*) as total
      FROM subscription_enrollments se
      LEFT JOIN term_billing_configs tbc ON se.service_id = tbc.service_id AND tbc.is_active = true
      LEFT JOIN "Services" s ON se.service_id::text = s."serviceId"::text
      LEFT JOIN clients c ON se.client_id::text = c.client_id::text
      WHERE 1=1
    `;
    const countParams = [];
    let countParamCount = 0;

    if (status && status !== 'all') {
      countParamCount++;
      countQuery += ` AND se.status = $${countParamCount}`;
      countParams.push(status);
    }

    if (serviceId) {
      countParamCount++;
      countQuery += ` AND se.service_id = $${countParamCount}`;
      countParams.push(serviceId);
    }

    if (clientId) {
      countParamCount++;
      countQuery += ` AND se.client_id::text = $${countParamCount}`;
      countParams.push(clientId);
    }

    if (paymentType && paymentType !== 'all') {
      countParamCount++;
      countQuery += ` AND se.payment_type = $${countParamCount}`;
      countParams.push(paymentType);
    }

    if (startDate) {
      countParamCount++;
      countQuery += ` AND se.enrollment_date >= $${countParamCount}`;
      countParams.push(startDate);
    }

    if (endDate) {
      countParamCount++;
      countQuery += ` AND se.enrollment_date <= $${countParamCount}`;
      countParams.push(endDate);
    }

    if (search) {
      countParamCount++;
      countQuery += ` AND (
        se.client_id::text ILIKE $${countParamCount} OR
        se.recipient_id::text ILIKE $${countParamCount} OR
        tbc.term_name ILIKE $${countParamCount} OR
        s.name ILIKE $${countParamCount} OR
        c.first_name ILIKE $${countParamCount} OR
        c.last_name ILIKE $${countParamCount}
      )`;
      countParams.push(`%${search}%`);
    }

    const countResult = await locationPool.query(countQuery, countParams);
    const total = parseInt(countResult.rows[0].total);

    // Get billing history and booking submission data for each enrollment
    const enrollmentsWithHistory = await Promise.all(
      result.rows.map(async (enrollment) => {
        // Parse JSON fields first
        if (enrollment.metadata) {
          try {
            enrollment.metadata = typeof enrollment.metadata === 'string'
              ? JSON.parse(enrollment.metadata)
              : enrollment.metadata;
          } catch (e) {
            enrollment.metadata = {};
          }
        }

        const submissionId = enrollment.metadata?.submissionId;

        // Parallelize all independent queries
        const queries = [
          locationPool.query(
            `SELECT * FROM subscription_billing_history
             WHERE enrollment_id = $1
             ORDER BY billing_month DESC
             LIMIT 10`,
            [enrollment.id]
          ),
          locationPool.query(
            `SELECT SUM(amount_charged) as total_charged
             FROM subscription_billing_history
             WHERE enrollment_id = $1 AND status = 'succeeded'`,
            [enrollment.id]
          )
        ];

        // Add submission query if needed
        if (submissionId && submissionId !== 'none') {
          queries.push(
            locationPool.query(
              `SELECT
                id, parent_first, parent_last, parent_email, parent_phone,
                students, address, booking_type, actual_price, created_at,
                stripe_customer_id, tc_client_id
              FROM booking_submissions
              WHERE id = $1`,
              [submissionId]
            )
          );
        }

        // Add paid lessons query for monthly subscriptions
        if (enrollment.payment_type === 'monthly') {
          queries.push(
            locationPool.query(
              `SELECT SUM(lessons_count) as total_paid_lessons
               FROM subscription_billing_history
               WHERE enrollment_id = $1 AND status IN ('succeeded', 'pending')`,
              [enrollment.id]
            )
          );
        }

        const results = await Promise.all(queries);

        const historyResult = results[0];
        const totalChargedResult = results[1];
        const totalCharged = parseFloat(totalChargedResult.rows[0]?.total_charged || 0);

        // Apply amount filters if specified
        if (minAmount && totalCharged < parseFloat(minAmount)) {
          return null;
        }
        if (maxAmount && totalCharged > parseFloat(maxAmount)) {
          return null;
        }

        // Process submission result if it exists
        let bookingData = null;
        if (submissionId && submissionId !== 'none') {
          const submissionResult = results[2];
          if (submissionResult?.rows.length > 0) {
            const submission = submissionResult.rows[0];
            bookingData = {
              submissionId: submission.id,
              parentName: `${submission.parent_first || ''} ${submission.parent_last || ''}`.trim(),
              parentEmail: submission.parent_email,
              parentPhone: submission.parent_phone,
              students: typeof submission.students === 'string'
                ? JSON.parse(submission.students)
                : submission.students || [],
              address: typeof submission.address === 'string'
                ? JSON.parse(submission.address)
                : submission.address || {},
              bookingType: submission.booking_type,
              actualPrice: parseFloat(submission.actual_price || 0),
              createdAt: submission.created_at,
              stripeCustomerId: submission.stripe_customer_id,
              tutorcruncherClientId: submission.tc_client_id
            };
          }
        }

        // Calculate future paid lessons
        let futurePaidLessons = 0;
        if (enrollment.payment_type === 'monthly') {
          const paidLessonsResultIndex = submissionId && submissionId !== 'none' ? 3 : 2;
          const paidLessonsResult = results[paidLessonsResultIndex];
          futurePaidLessons = parseInt(paidLessonsResult?.rows[0]?.total_paid_lessons || 0);
        } else {
          // Term payment - all lessons are paid upfront
          futurePaidLessons = enrollment.total_lessons_remaining || 0;
        }

        // Build client_name with fallback to booking submission data
        const resolvedClientName = (enrollment.client_first_name && enrollment.client_last_name)
          ? `${enrollment.client_first_name} ${enrollment.client_last_name}`.trim()
          : (bookingData?.parentName || `Client ${enrollment.client_id}`);

        return {
          ...enrollment,
          client_name: resolvedClientName,
          totalCharged,
          futurePaidLessons,
          bookingData,
          billingHistory: historyResult.rows.map(bh => ({
            ...bh,
            billing_month: bh.billing_month,
            amount_charged: parseFloat(bh.amount_charged || 0),
            lessons_count: parseInt(bh.lessons_count || 0),
            status: bh.status
          }))
        };
      })
    );

    // Filter out nulls (from amount filtering)
    const filteredEnrollments = enrollmentsWithHistory.filter(e => e !== null);

    // Recalculate total after amount filtering
    const filteredTotal = filteredEnrollments.length;

    return {
      subscriptions: filteredEnrollments,
      pagination: {
        total: filteredTotal,
        limit: parseInt(limit),
        offset: parseInt(offset),
        hasMore: (parseInt(offset) + parseInt(limit)) < filteredTotal
      }
    };
    }, 60); // 60 second TTL

    res.json(cachedData);
  } catch (error) {
    logger.error({ err: error }, 'Error listing subscriptions:');
    logger.error({ data: error.stack }, 'Error stack:');
    logger.error({ data: req.query }, 'Query params:');
    res.status(500).json({
      error: 'Failed to list subscriptions',
      message: error.message,
      details: process.env.NODE_ENV === 'development' ? error.stack : undefined
    });
  }
}));

/**
 * POST /api/subscriptions/cancel/:enrollmentId
 * Cancel a subscription (monthly only - term payments are already paid)
 */
router.post('/cancel/:enrollmentId', auth, asyncHandler(async (req, res) => {
  try {
    const { enrollmentId } = req.params;
    const { reason } = req.body;

    // Use location-specific database connection
    const locationPool = req.locationPool || pool;

    // Get enrollment
    const enrollmentResult = await locationPool.query(
      'SELECT * FROM subscription_enrollments WHERE id = $1',
      [enrollmentId]
    );

    if (enrollmentResult.rows.length === 0) {
      return res.status(404).json({
        error: 'Enrollment not found'
      });
    }

    const enrollment = enrollmentResult.rows[0];

    if (enrollment.payment_type === 'term') {
      return res.status(400).json({
        error: 'Term payments cannot be cancelled (already paid in full)'
      });
    }

    if (enrollment.status !== 'active') {
      return res.status(400).json({
        error: `Enrollment is already ${enrollment.status}`
      });
    }

    // Cancel Stripe subscription (if configured and available)
    let stripeCancelled = false;
    if (enrollment.stripe_subscription_id) {
      try {
        await stripe.subscriptions.cancel(enrollment.stripe_subscription_id);
        stripeCancelled = true;
      } catch (stripeError) {
        logger.warn({ data: stripeError.message }, `Could not cancel Stripe subscription ${enrollment.stripe_subscription_id}:`);
        // Continue with database cancellation even if Stripe fails
        // This allows cancellation to work even with invalid/missing Stripe keys (e.g., local dev)
      }
    }

    // Update enrollment status in database
    await locationPool.query(
      `UPDATE subscription_enrollments
       SET status = 'cancelled',
           metadata = jsonb_set(COALESCE(metadata, '{}'), '{cancellation_reason}', $1),
           updated_at = NOW()
       WHERE id = $2`,
      [JSON.stringify(reason || 'Cancelled by user'), enrollmentId]
    );

    // Clear subscription caches
    await cache.clearCacheByPrefix('subscriptions');

    res.json({
      success: true,
      message: stripeCancelled
        ? 'Subscription cancelled. Billing will stop next month.'
        : 'Subscription cancelled in database. Stripe subscription may need manual cancellation.'
    });
  } catch (error) {
    logger.error({ err: error }, 'Error cancelling subscription:');
    res.status(500).json({
      error: 'Failed to cancel subscription',
      message: error.message
    });
  }
}));

/**
 * DELETE /api/subscriptions/:enrollmentId
 * Permanently delete a subscription enrollment (for test/cleanup purposes)
 */
router.delete('/:enrollmentId', auth, asyncHandler(async (req, res) => {
  try {
    const { enrollmentId } = req.params;

    // Use location-specific database connection
    const locationPool = req.locationPool || pool;

    // Get enrollment
    const enrollmentResult = await locationPool.query(
      'SELECT * FROM subscription_enrollments WHERE id = $1',
      [enrollmentId]
    );

    if (enrollmentResult.rows.length === 0) {
      return res.status(404).json({
        error: 'Enrollment not found'
      });
    }

    const enrollment = enrollmentResult.rows[0];

    // Only allow deletion of cancelled or failed subscriptions for safety
    // Active subscriptions should be cancelled first (unless in local dev with invalid Stripe key)
    const isLocalDev = process.env.NODE_ENV !== 'production' || 
                       !process.env.STRIPE_SECRET_KEY || 
                       process.env.STRIPE_SECRET_KEY.includes('your_stripe');
    
    if (enrollment.status === 'active' && !isLocalDev) {
      return res.status(400).json({
        error: 'Cannot delete active subscription. Please cancel it first.'
      });
    }
    
    // In local dev, warn but allow deletion of active subscriptions
    if (enrollment.status === 'active' && isLocalDev) {
      logger.warn(`⚠️ Deleting active subscription ${enrollmentId} in local development mode`);
    }

    // Cancel Stripe subscription if it exists and is still active
    if (enrollment.stripe_subscription_id) {
      try {
        const stripeSubscription = await stripe.subscriptions.retrieve(enrollment.stripe_subscription_id);
        if (stripeSubscription.status === 'active' || stripeSubscription.status === 'trialing') {
          try {
            await stripe.subscriptions.cancel(enrollment.stripe_subscription_id);
          } catch (cancelError) {
            logger.warn({ data: cancelError.message }, `Could not cancel Stripe subscription ${enrollment.stripe_subscription_id}:`);
            // Continue with deletion even if Stripe cancellation fails (e.g., invalid API key in local dev)
          }
        }
      } catch (stripeError) {
        logger.warn({ data: stripeError.message }, `Could not retrieve Stripe subscription ${enrollment.stripe_subscription_id}:`);
        // Continue with deletion even if Stripe retrieval fails (e.g., invalid API key in local dev)
      }
    }

    // Delete enrollment record
    await locationPool.query(
      'DELETE FROM subscription_enrollments WHERE id = $1',
      [enrollmentId]
    );

    logger.info(`🗑️ Deleted subscription enrollment ${enrollmentId}`);

    // Clear subscription caches
    await cache.clearCacheByPrefix('subscriptions');

    res.json({
      success: true,
      message: 'Subscription deleted successfully'
    });
  } catch (error) {
    logger.error({ err: error }, 'Error deleting subscription:');
    res.status(500).json({
      error: 'Failed to delete subscription',
      message: error.message
    });
  }
}));

/**
 * POST /api/subscriptions/pause/:enrollmentId
 * Pause a subscription (temporarily stop billing, can be resumed)
 */
router.post('/pause/:enrollmentId', auth, asyncHandler(async (req, res) => {
  try {
    const { enrollmentId } = req.params;
    const { reason } = req.body;

    // Use location-specific database connection
    const locationPool = req.locationPool || pool;

    // Get enrollment
    const enrollmentResult = await locationPool.query(
      'SELECT * FROM subscription_enrollments WHERE id = $1',
      [enrollmentId]
    );

    if (enrollmentResult.rows.length === 0) {
      return res.status(404).json({
        error: 'Enrollment not found'
      });
    }

    const enrollment = enrollmentResult.rows[0];

    if (enrollment.payment_type === 'term') {
      return res.status(400).json({
        error: 'Term payments cannot be paused (already paid in full)'
      });
    }

    if (enrollment.status !== 'active') {
      return res.status(400).json({
        error: `Cannot pause enrollment with status: ${enrollment.status}`
      });
    }

    // Pause Stripe subscription
    if (enrollment.stripe_subscription_id) {
      await stripe.subscriptions.update(enrollment.stripe_subscription_id, {
        pause_collection: {
          behavior: 'keep_as_draft'
        }
      });
    }

    // Update enrollment status
    await locationPool.query(
      `UPDATE subscription_enrollments
       SET status = 'suspended',
           metadata = jsonb_set(
             COALESCE(metadata, '{}'),
             '{pause_reason}',
             $1
           ),
           updated_at = NOW()
       WHERE id = $2`,
      [JSON.stringify(reason || 'Paused by admin'), enrollmentId]
    );

    // Clear subscription caches
    await cache.clearCacheByPrefix('subscriptions');

    res.json({
      success: true,
      message: 'Subscription paused. Billing will resume when reactivated.'
    });
  } catch (error) {
    logger.error({ err: error }, 'Error pausing subscription:');
    res.status(500).json({
      error: 'Failed to pause subscription',
      message: error.message
    });
  }
}));

/**
 * POST /api/subscriptions/resume/:enrollmentId
 * Resume a paused subscription
 */
router.post('/resume/:enrollmentId', auth, asyncHandler(async (req, res) => {
  try {
    const { enrollmentId } = req.params;

    // Use location-specific database connection
    const locationPool = req.locationPool || pool;

    // Get enrollment
    const enrollmentResult = await locationPool.query(
      'SELECT * FROM subscription_enrollments WHERE id = $1',
      [enrollmentId]
    );

    if (enrollmentResult.rows.length === 0) {
      return res.status(404).json({
        error: 'Enrollment not found'
      });
    }

    const enrollment = enrollmentResult.rows[0];

    if (enrollment.status !== 'suspended') {
      return res.status(400).json({
        error: `Cannot resume enrollment with status: ${enrollment.status}`
      });
    }

    // Resume Stripe subscription
    if (enrollment.stripe_subscription_id) {
      await stripe.subscriptions.update(enrollment.stripe_subscription_id, {
        pause_collection: null
      });
    }

    // Update enrollment status
    await locationPool.query(
      `UPDATE subscription_enrollments
       SET status = 'active',
           updated_at = NOW()
       WHERE id = $1`,
      [enrollmentId]
    );

    // Clear subscription caches
    await cache.clearCacheByPrefix('subscriptions');

    res.json({
      success: true,
      message: 'Subscription resumed. Billing will continue as normal.'
    });
  } catch (error) {
    logger.error({ err: error }, 'Error resuming subscription:');
    res.status(500).json({
      error: 'Failed to resume subscription',
      message: error.message
    });
  }
}));

/**
 * POST /api/subscriptions/refund/:enrollmentId
 * Refund a subscription payment
 */
router.post('/refund/:enrollmentId', auth, asyncHandler(async (req, res) => {
  try {
    const { enrollmentId } = req.params;
    const { amount, reason, billingHistoryId } = req.body;

    // Use location-specific database connection
    const locationPool = req.locationPool || pool;

    // Get enrollment
    const enrollmentResult = await locationPool.query(
      'SELECT * FROM subscription_enrollments WHERE id = $1',
      [enrollmentId]
    );

    if (enrollmentResult.rows.length === 0) {
      return res.status(404).json({
        error: 'Enrollment not found'
      });
    }

    const enrollment = enrollmentResult.rows[0];

    // Get billing history entry to refund
    let billingHistory = null;
    if (billingHistoryId) {
      const billingResult = await locationPool.query(
        'SELECT * FROM subscription_billing_history WHERE id = $1 AND enrollment_id = $2',
        [billingHistoryId, enrollmentId]
      );
      if (billingResult.rows.length === 0) {
        return res.status(404).json({
          error: 'Billing history entry not found'
        });
      }
      billingHistory = billingResult.rows[0];
    } else {
      // Get most recent successful payment
      const billingResult = await locationPool.query(
        `SELECT * FROM subscription_billing_history 
         WHERE enrollment_id = $1 AND status = 'succeeded'
         ORDER BY billing_month DESC 
         LIMIT 1`,
        [enrollmentId]
      );
      if (billingResult.rows.length === 0) {
        return res.status(400).json({
          error: 'No successful payments found to refund'
        });
      }
      billingHistory = billingResult.rows[0];
    }

    const refundAmount = amount || parseFloat(billingHistory.amount_charged || 0);
    const paymentIntentId = billingHistory.stripe_payment_intent_id;

    if (!paymentIntentId) {
      return res.status(400).json({
        error: 'No Stripe payment intent found for this billing entry'
      });
    }

    // Create refund in Stripe
    const refund = await stripe.refunds.create({
      payment_intent: paymentIntentId,
      amount: Math.round(refundAmount * 100), // Convert to cents
      reason: reason || 'requested_by_customer',
      metadata: {
        enrollment_id: enrollmentId.toString(),
        billing_history_id: billingHistory.id.toString(),
        refunded_by: 'admin'
      }
    });

    // Update billing history status
    await locationPool.query(
      `UPDATE subscription_billing_history 
       SET status = 'refunded',
           metadata = jsonb_set(
             COALESCE(metadata, '{}'),
             '{refund}',
             $1::jsonb
           ),
           updated_at = NOW()
       WHERE id = $2`,
      [
        JSON.stringify({
          refund_id: refund.id,
          refund_amount: refundAmount,
          refund_reason: reason || 'requested_by_customer',
          refunded_at: new Date().toISOString()
        }),
        billingHistory.id
      ]
    );

    // Clear subscription caches
    await cache.clearCacheByPrefix('subscriptions');

    res.json({
      success: true,
      message: `Refund of $${refundAmount.toFixed(2)} processed successfully`,
      refund: {
        id: refund.id,
        amount: refundAmount,
        status: refund.status
      }
    });
  } catch (error) {
    logger.error({ err: error }, 'Error processing refund:');
    res.status(500).json({
      error: 'Failed to process refund',
      message: error.message
    });
  }
}));

/**
 * GET /api/subscriptions/enrollment/:enrollmentId
 * Get enrollment details
 */
router.get('/enrollment/:enrollmentId', auth, asyncHandler(async (req, res) => {
  try {
    const { enrollmentId } = req.params;

    const cacheKey = `subscriptions:enrollment:${enrollmentId}`;

    const enrollment = await cache.getOrSet(cacheKey, async () => {
      // Parallelize independent queries
      const [enrollmentResult, historyResult] = await Promise.all([
        pool.query(
          `SELECT e.*, tbc.term_name, tbc.rate_per_lesson
           FROM subscription_enrollments e
           LEFT JOIN term_billing_configs tbc ON e.service_id = tbc.service_id AND tbc.is_active = true
           WHERE e.id = $1`,
          [enrollmentId]
        ),
        pool.query(
          `SELECT * FROM subscription_billing_history
           WHERE enrollment_id = $1
           ORDER BY billing_month DESC`,
          [enrollmentId]
        )
      ]);

      if (enrollmentResult.rows.length === 0) {
        return null;
      }

      const enrollmentData = enrollmentResult.rows[0];
      enrollmentData.metadata = enrollmentData.metadata ? JSON.parse(enrollmentData.metadata) : {};
      enrollmentData.billingHistory = historyResult.rows;

      return enrollmentData;
    }, 60); // 60 second TTL

    if (!enrollment) {
      return res.status(404).json({
        error: 'Enrollment not found'
      });
    }

    res.json({ enrollment });
  } catch (error) {
    logger.error({ err: error }, 'Error fetching enrollment:');
    res.status(500).json({
      error: 'Failed to fetch enrollment',
      message: error.message
    });
  }
}));

/**
 * POST /api/subscriptions/retry-payment/:enrollmentId
 * Retry payment for a failed subscription
 */
router.post('/retry-payment/:enrollmentId', auth, asyncHandler(async (req, res) => {
  try {
    const { enrollmentId } = req.params;

    // Get enrollment
    const enrollmentResult = await pool.query(
      'SELECT * FROM subscription_enrollments WHERE id = $1',
      [enrollmentId]
    );

    if (enrollmentResult.rows.length === 0) {
      return res.status(404).json({
        error: 'Enrollment not found'
      });
    }

    const enrollment = enrollmentResult.rows[0];

    if (enrollment.status !== 'failed') {
      return res.status(400).json({
        error: 'Can only retry payments for failed subscriptions'
      });
    }

    if (!enrollment.stripe_subscription_id) {
      return res.status(400).json({
        error: 'No Stripe subscription found for this enrollment'
      });
    }

    // Get the latest failed invoice
    const invoices = await stripe.invoices.list({
      subscription: enrollment.stripe_subscription_id,
      limit: 1,
      status: 'open',
    });

    if (invoices.data.length === 0) {
      return res.status(404).json({
        error: 'No open invoice found to retry'
      });
    }

    const invoice = invoices.data[0];

    // Attempt to pay the invoice
    const paidInvoice = await stripe.invoices.pay(invoice.id);

    if (paidInvoice.status === 'paid') {
      // Update enrollment status back to active
      await pool.query(
        `UPDATE subscription_enrollments 
         SET status = 'active', updated_at = NOW()
         WHERE id = $1`,
        [enrollmentId]
      );

      // Update billing history
      await pool.query(
        `UPDATE subscription_billing_history
         SET status = 'succeeded',
             stripe_payment_intent_id = $1,
             billed_at = NOW(),
             updated_at = NOW()
         WHERE enrollment_id = $2
           AND stripe_invoice_id = $3
           AND status = 'failed'`,
        [paidInvoice.payment_intent, enrollmentId, invoice.id]
      );

      // Clear subscription caches
      await cache.clearCacheByPrefix('subscriptions');

      res.json({
        success: true,
        message: 'Payment retried successfully',
        invoice: {
          id: paidInvoice.id,
          status: paidInvoice.status,
          amount_paid: paidInvoice.amount_paid / 100,
        }
      });
    } else {
      res.status(400).json({
        error: 'Payment retry failed',
        invoice: {
          id: paidInvoice.id,
          status: paidInvoice.status,
        }
      });
    }
  } catch (error) {
    logger.error({ err: error }, 'Error retrying payment:');
    res.status(500).json({
      error: 'Failed to retry payment',
      message: error.message,
      stripeError: error.stripeError || null
    });
  }
}));

/**
 * POST /api/subscriptions/bulk-cancel
 * Cancel multiple subscriptions at once
 */
router.post('/bulk-cancel', auth, asyncHandler(async (req, res) => {
  try {
    const { enrollmentIds, reason } = req.body;

    if (!enrollmentIds || !Array.isArray(enrollmentIds) || enrollmentIds.length === 0) {
      return res.status(400).json({
        error: 'enrollmentIds array is required'
      });
    }

    const results = {
      successful: [],
      failed: [],
    };

    for (const enrollmentId of enrollmentIds) {
      try {
        // Get enrollment
        const enrollmentResult = await pool.query(
          'SELECT * FROM subscription_enrollments WHERE id = $1',
          [enrollmentId]
        );

        if (enrollmentResult.rows.length === 0) {
          results.failed.push({
            id: enrollmentId,
            error: 'Enrollment not found'
          });
          continue;
        }

        const enrollment = enrollmentResult.rows[0];

        if (enrollment.payment_type === 'term') {
          results.failed.push({
            id: enrollmentId,
            error: 'Term payments cannot be cancelled'
          });
          continue;
        }

        if (enrollment.status !== 'active') {
          results.failed.push({
            id: enrollmentId,
            error: `Enrollment is already ${enrollment.status}`
          });
          continue;
        }

        // Cancel Stripe subscription
        if (enrollment.stripe_subscription_id) {
          await stripe.subscriptions.cancel(enrollment.stripe_subscription_id);
        }

        // Update enrollment status
        await pool.query(
          `UPDATE subscription_enrollments 
           SET status = 'cancelled', 
               metadata = jsonb_set(COALESCE(metadata, '{}'), '{cancellation_reason}', $1),
               updated_at = NOW()
           WHERE id = $2`,
          [JSON.stringify(reason || 'Bulk cancelled by admin'), enrollmentId]
        );

        results.successful.push(enrollmentId);
      } catch (err) {
        logger.error({ err: err }, `Error cancelling subscription ${enrollmentId}:`);
        results.failed.push({
          id: enrollmentId,
          error: err.message
        });
      }
    }

    // Clear subscription caches
    await cache.clearCacheByPrefix('subscriptions');

    res.json({
      success: true,
      results,
      summary: {
        total: enrollmentIds.length,
        successful: results.successful.length,
        failed: results.failed.length,
      }
    });
  } catch (error) {
    logger.error({ err: error }, 'Error in bulk cancel:');
    res.status(500).json({
      error: 'Failed to cancel subscriptions',
      message: error.message
    });
  }
}));

/**
 * GET /api/subscriptions/export
 * Export subscriptions to CSV (with all filters applied)
 */
router.get('/export', auth, asyncHandler(async (req, res) => {
  try {
    const {
      status,
      serviceId,
      clientId,
      paymentType,
      search,
      startDate,
      endDate,
      minAmount,
      maxAmount,
    } = req.query;

    // Build query (same as GET /api/subscriptions but without pagination)
    let query = `
      SELECT 
        se.*,
        tbc.term_name,
        tbc.rate_per_lesson,
        s.name as service_name
      FROM subscription_enrollments se
      LEFT JOIN term_billing_configs tbc ON se.service_id = tbc.service_id AND tbc.is_active = true
      LEFT JOIN "Services" s ON se.service_id = s."serviceId"
      WHERE 1=1
    `;
    const params = [];
    let paramCount = 0;

    // Apply filters (same logic as GET endpoint)
    if (status && status !== 'all') {
      paramCount++;
      query += ` AND se.status = $${paramCount}`;
      params.push(status);
    }

    if (serviceId) {
      paramCount++;
      query += ` AND se.service_id = $${paramCount}`;
      params.push(serviceId);
    }

    if (clientId) {
      paramCount++;
      query += ` AND se.client_id::text = $${paramCount}`;
      params.push(clientId);
    }

    if (paymentType && paymentType !== 'all') {
      paramCount++;
      query += ` AND se.payment_type = $${paramCount}`;
      params.push(paymentType);
    }

    if (search) {
      paramCount++;
      query += ` AND (
        se.client_id::text ILIKE $${paramCount} OR
        se.recipient_id::text ILIKE $${paramCount} OR
        tbc.term_name ILIKE $${paramCount} OR
        s.name ILIKE $${paramCount}
      )`;
      params.push(`%${search}%`);
    }

    if (startDate) {
      paramCount++;
      query += ` AND se.enrollment_date >= $${paramCount}`;
      params.push(startDate);
    }

    if (endDate) {
      paramCount++;
      query += ` AND se.enrollment_date <= $${paramCount}`;
      params.push(endDate);
    }

    query += ` ORDER BY se.created_at DESC`;

    const result = await pool.query(query, params);

    // Get billing history for each enrollment
    const enrollmentsWithHistory = await Promise.all(
      result.rows.map(async (enrollment) => {
        const historyResult = await pool.query(
          `SELECT SUM(amount_charged) as total_charged, COUNT(*) as billing_count
           FROM subscription_billing_history 
           WHERE enrollment_id = $1 AND status = 'succeeded'`,
          [enrollment.id]
        );

        const totalCharged = parseFloat(historyResult.rows[0]?.total_charged || 0);

        // Apply amount filters if specified
        if (minAmount && totalCharged < parseFloat(minAmount)) {
          return null;
        }
        if (maxAmount && totalCharged > parseFloat(maxAmount)) {
          return null;
        }

        return {
          ...enrollment,
          totalCharged,
        };
      })
    );

    // Filter out nulls (from amount filtering)
    const filteredEnrollments = enrollmentsWithHistory.filter(e => e !== null);

    // Generate CSV
    const headers = [
      'Subscription ID',
      'Service Name',
      'Term Name',
      'Client ID',
      'Payment Type',
      'Status',
      'Enrollment Date',
      'First Billing Date',
      'Final Class Date',
      'Lessons Remaining',
      'Total Charged',
      'Stripe Subscription ID',
      'Stripe Customer ID',
    ];

    const rows = filteredEnrollments.map(enrollment => [
      enrollment.id,
      enrollment.service_name || `Service ${enrollment.service_id}`,
      enrollment.term_name || '',
      enrollment.client_id || '',
      enrollment.payment_type,
      enrollment.status,
      enrollment.enrollment_date || '',
      enrollment.first_billing_date || '',
      enrollment.final_class_date || '',
      enrollment.total_lessons_remaining || 0,
      enrollment.totalCharged || 0,
      enrollment.stripe_subscription_id || '',
      enrollment.stripe_customer_id || '',
    ]);

    const csvContent = [
      headers.join(','),
      ...rows.map(row => row.map(cell => {
        const cellStr = String(cell || '');
        if (cellStr.includes(',') || cellStr.includes('"') || cellStr.includes('\n')) {
          return `"${cellStr.replace(/"/g, '""')}"`;
        }
        return cellStr;
      }).join(','))
    ].join('\n');

    res.setHeader('Content-Type', 'text/csv');
    res.setHeader('Content-Disposition', `attachment; filename=subscriptions_${new Date().toISOString().split('T')[0]}.csv`);
    res.send(csvContent);
  } catch (error) {
    logger.error({ err: error }, 'Error exporting subscriptions:');
    res.status(500).json({
      error: 'Failed to export subscriptions',
      message: error.message
    });
  }
}));

/**
 * GET /api/subscriptions/checkout-details/:sessionId
 * Get payment details for checkout page display
 */
router.get('/checkout-details/:sessionId', asyncHandler(async (req, res) => {
  try {
    const { sessionId } = req.params;
    
    // Retrieve Stripe checkout session
    const session = await stripe.checkout.sessions.retrieve(sessionId);
    
    if (!session || session.mode !== 'setup') {
      return res.status(404).json({
        error: 'Checkout session not found or invalid'
      });
    }
    
    const serviceId = session.metadata?.service_id;
    if (!serviceId) {
      return res.status(400).json({
        error: 'Service ID not found in session metadata'
      });
    }
    
    // Get term billing config
    const configResult = await pool.query(
      'SELECT * FROM term_billing_configs WHERE service_id = $1 AND is_active = true',
      [serviceId]
    );
    
    if (configResult.rows.length === 0) {
      return res.status(404).json({
        error: 'Term billing config not found'
      });
    }
    
    const config = configResult.rows[0];
    
    // Parse JSONB fields
    if (typeof config.class_dates === 'string') {
      try {
        config.class_dates = JSON.parse(config.class_dates);
      } catch (e) {
        config.class_dates = [];
      }
    }
    
    // Calculate initial charge
    const enrollmentDate = session.metadata?.enrollment_date || new Date().toISOString().split('T')[0];
    const enrollDate = new Date(enrollmentDate);
    const initialCharge = subscriptionBillingService.calculateInitialCharge(
      { enrollment_date: enrollmentDate },
      config,
      enrollDate
    );
    const nextBillingDate = subscriptionBillingService.getNextBillingDate(enrollDate);
    
    const formatDate = (date) => {
      return date.toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' });
    };
    
    // Extract customer ID (could be string or object)
    const stripeCustomerId = typeof session.customer === 'string' ? session.customer : session.customer?.id;
    
    return res.json({
      success: true,
      stripeCustomerId: stripeCustomerId,
      serviceId: serviceId,
      paymentDetails: {
        termName: config.term_name,
        payingToday: {
          amount: initialCharge.amount,
          lessons: initialCharge.lessons,
          description: `$${initialCharge.amount.toFixed(2)} for ${initialCharge.lessons} lesson${initialCharge.lessons !== 1 ? 's' : ''} this month`
        },
        futurePayments: {
          startDate: formatDate(nextBillingDate),
          ratePerLesson: Number(config.rate_per_lesson) || 0,
          totalLessons: config.class_dates.length,
          description: `Starting ${formatDate(nextBillingDate)}, billed monthly at $${(Number(config.rate_per_lesson) || 0).toFixed(2)} per lesson`
        }
      }
    });
  } catch (error) {
    logger.error({ err: error }, 'Error fetching checkout details:');
    res.status(500).json({
      error: 'Failed to fetch checkout details',
      message: error.message
    });
  }
}));

/**
 * POST /api/subscriptions/complete-setup
 * Complete payment method setup after card is entered
 */
router.post('/complete-setup', asyncHandler(async (req, res) => {
  try {
    const {
      checkoutSessionId,
      paymentMethodId,
      stripeCustomerId,
      serviceId,
      submissionId
    } = req.body;
    
    if (!checkoutSessionId || !paymentMethodId || !stripeCustomerId) {
      return res.status(400).json({
        error: 'Missing required fields: checkoutSessionId, paymentMethodId, stripeCustomerId'
      });
    }
    
    // Attach payment method to customer (handle case where it's already attached)
    try {
      await stripe.paymentMethods.attach(paymentMethodId, {
        customer: stripeCustomerId
      });
    } catch (attachError) {
      // Payment method might already be attached - check if it's attached to this customer
      if (attachError.code === 'payment_method_already_attached') {
        // Verify it's attached to the correct customer
        const pm = await stripe.paymentMethods.retrieve(paymentMethodId);
        if (pm.customer !== stripeCustomerId) {
          throw new Error('Payment method is attached to a different customer');
        }
        logger.info('Payment method already attached to customer');
      } else {
        throw attachError;
      }
    }
    
    // Set as default payment method
    await stripe.customers.update(stripeCustomerId, {
      invoice_settings: {
        default_payment_method: paymentMethodId
      }
    });
    
    // Retrieve checkout session to get metadata
    const session = await stripe.checkout.sessions.retrieve(checkoutSessionId);
    const enrollmentDate = session.metadata?.enrollment_date || new Date().toISOString().split('T')[0];
    
    // Get term billing config
    const configResult = await pool.query(
      'SELECT * FROM term_billing_configs WHERE service_id = $1 AND is_active = true',
      [serviceId || session.metadata?.service_id]
    );
    
    if (configResult.rows.length === 0) {
      return res.status(404).json({
        error: 'Term billing config not found'
      });
    }
    
    const config = configResult.rows[0];
    
    // Parse JSONB fields
    if (typeof config.class_dates === 'string') {
      try {
        config.class_dates = JSON.parse(config.class_dates);
      } catch (e) {
        config.class_dates = [];
      }
    }
    
    // Calculate initial charge
    const enrollDate = new Date(enrollmentDate);
    const initialCharge = subscriptionBillingService.calculateInitialCharge(
      { enrollment_date: enrollmentDate },
      config,
      enrollDate
    );
    
    // Now complete the subscription creation (same logic as /create endpoint after payment method attachment)
    const finalServiceId = serviceId || session.metadata?.service_id;
    const finalSubmissionId = submissionId || (session.metadata?.submission_id !== 'none' ? parseInt(session.metadata.submission_id) : null);
    const parentEmail = session.metadata?.parent_email || '';
    const parentName = session.metadata?.parent_name || '';
    const parentPhone = session.metadata?.parent_phone || '';
    
    if (!finalServiceId) {
      return res.status(400).json({
        error: 'Service ID not found in session metadata'
      });
    }
    
    // Get client ID from session metadata or find by email
    let tutorcruncherClientId = session.metadata?.client_id !== 'none' ? parseInt(session.metadata.client_id) : null;
    if (!tutorcruncherClientId && parentEmail) {
      // Try to find client by email in database
      const clientResult = await pool.query(
        'SELECT tc_client_id FROM clients WHERE email = $1 ORDER BY created_at DESC LIMIT 1',
        [parentEmail]
      );
      if (clientResult.rows.length > 0) {
        tutorcruncherClientId = clientResult.rows[0].tc_client_id;
      }
    }
    
    // Get booking data from submission if available
    let bookingData = null;
    if (finalSubmissionId) {
      const submissionResult = await pool.query(
        `SELECT students, slots, parent_first, parent_last, parent_email, parent_phone, booking_type, address, timezone
        FROM booking_submissions WHERE id = $1`,
        [finalSubmissionId]
      );
      if (submissionResult.rows.length > 0) {
        bookingData = {
          students: submissionResult.rows[0].students,
          slots: submissionResult.rows[0].slots,
          parentFirst: submissionResult.rows[0].parent_first,
          parentLast: submissionResult.rows[0].parent_last,
          parentEmail: submissionResult.rows[0].parent_email,
          parentPhone: submissionResult.rows[0].parent_phone,
          bookingType: submissionResult.rows[0].booking_type,
          address: submissionResult.rows[0].address,
          timezone: submissionResult.rows[0].timezone
        };
      }
    }
    
    // Create TutorCruncher client if it doesn't exist yet (payment is now confirmed)
    if (!tutorcruncherClientId && bookingData) {
      try {
        // First, check if client already exists by email in TutorCruncher
        let existingClient = null;
        try {
          const normalizedEmail = (parentEmail || bookingData.parentEmail).toLowerCase().trim();
          const lookupResponse = await tutorCruncherAPI.get('/clients/', {
            params: { 
              user__email: normalizedEmail
            }
          });
          
          if (lookupResponse.data.results && lookupResponse.data.results.length > 0) {
            existingClient = lookupResponse.data.results[0];
            tutorcruncherClientId = existingClient.id;
            logger.info(`♻️ Found existing TutorCruncher client: ${tutorcruncherClientId} for email ${normalizedEmail}`);
          }
        } catch (lookupError) {
          logger.warn({ data: lookupError.message }, '⚠️ Could not lookup existing client by email, will attempt to create:');
        }
        
        if (!existingClient) {
          // Create new TutorCruncher client
          const clientPayload = {
            first_name: (parentName || `${bookingData.parentFirst} ${bookingData.parentLast}`).split(' ')[0] || parentName || bookingData.parentFirst,
            last_name: (parentName || `${bookingData.parentFirst} ${bookingData.parentLast}`).split(' ').slice(1).join(' ') || bookingData.parentLast || '',
            email: parentEmail || bookingData.parentEmail,
            phone: parentPhone || bookingData.parentPhone || '',
            street: bookingData.address?.street || '',
            town: bookingData.address?.city || '',
            state: bookingData.address?.state || '',
            country: getTutorCruncherCountryId(bookingData.address?.country),
            postcode: bookingData.address?.zip || '',
            timezone: bookingData.timezone || 'America/New_York',
            status: 'live',
            received_notifications: [
              'invoice_reminders',
              'invoices',
              'apt_reminders',
              'pfi_reminders',
              'credit-requests',
              'broadcasts',
              'lesson_scheduled'
            ],
            send_emails: false
          };
          
          try {
            const clientResponse = await tutorCruncherAPI.post('clients/', clientPayload);
            tutorcruncherClientId = clientResponse.data.id;
            logger.info(`✅ Created new TutorCruncher client: ${tutorcruncherClientId}`);
          } catch (createError) {
            // Handle 409 duplicate error
            if (createError.response?.status === 409 || 
                (createError.response?.data?.email && createError.response.data.email.includes('already has a Client'))) {
              logger.info('⚠️ Client creation failed with duplicate error, looking up existing client...');
              
              try {
                const normalizedEmail = (parentEmail || bookingData.parentEmail).toLowerCase().trim();
                const retryLookup = await tutorCruncherAPI.get('/clients/', {
                  params: { 
                    user__email: normalizedEmail
                  }
                });
                
                if (retryLookup.data.results && retryLookup.data.results.length > 0) {
                  tutorcruncherClientId = retryLookup.data.results[0].id;
                  logger.info(`✅ Found existing client after duplicate error: ${tutorcruncherClientId}`);
                } else {
                  throw createError;
                }
              } catch (retryError) {
                throw createError;
              }
            } else {
              throw createError;
            }
          }
        }
        
        // Update submission with TutorCruncher client ID
        if (finalSubmissionId && tutorcruncherClientId) {
          try {
            await pool.query(
              `UPDATE booking_submissions SET tc_client_id = $1 WHERE id = $2`,
              [tutorcruncherClientId, finalSubmissionId]
            );
            logger.info(`✅ Updated submission ${finalSubmissionId} with TutorCruncher client ID`);
          } catch (updateError) {
            logger.error({ data: updateError.message }, `⚠️ Could not update submission ${finalSubmissionId} with client ID:`);
          }
        }
      } catch (tcError) {
        logger.error({ data: tcError.response?.data || tcError.message }, '❌ Error creating/retrieving TutorCruncher client:');
        // Don't fail the subscription creation if client creation fails - log and continue
        logger.warn('⚠️ Continuing subscription creation without TutorCruncher client');
      }
    }
    
    // Get next billing date (1st of next month)
    const nextBillingDate = subscriptionBillingService.getNextBillingDate(enrollDate);
    const firstOfNextMonth = subscriptionBillingService.getFirstOfMonth(nextBillingDate);
    
    // Get final class date
    const sortedDates = config.class_dates.map(d => new Date(d)).sort((a, b) => a - b);
    const finalClassDate = sortedDates[sortedDates.length - 1];
    
    // Calculate discounted rate per lesson (for setting on recipients/appointments)
    const ratePerLesson = parseFloat(config.rate_per_lesson) || 0;
    const discountPercent = parseFloat(session.metadata.discount_percent) || 0;
    const discountedRatePerLesson = discountPercent > 0
      ? parseFloat((ratePerLesson * (1 - discountPercent / 100)).toFixed(2))
      : ratePerLesson;

    // Add recipient to service if we have student data
    // CRITICAL: Never add client as recipient - always create/use proper student recipient
    let tutorcruncherRecipientId = null;
    if (tutorcruncherClientId && bookingData?.students?.[0] && finalServiceId) {
      try {
        const { createOrUpdateRecipient } = require('../utils/clientManager');
        
        // Get existing recipients for this client
        let existingRecipients = [];
        try {
          const recipientsResponse = await tutorCruncherAPI.get(`/clients/${tutorcruncherClientId}/recipients/`);
          existingRecipients = recipientsResponse.data.results || [];
        } catch (error) {
          logger.info(`⚠️ Could not fetch existing recipients: ${error.message}`);
        }
        
        // Create/update proper student recipient (not the client!)
        const student = bookingData.students[0];
        const normalizedStudent = {
          first: student.first || student.first_name || '',
          last: student.last || student.last_name || '',
          dob: student.dob || student.date_of_birth || '',
          school: student.school || student.current_school || '',
          notes: student.notes || ''
        };
        
        if (normalizedStudent.first && normalizedStudent.last) {
          const recipientResult = await createOrUpdateRecipient(
            normalizedStudent,
            tutorcruncherClientId,
            existingRecipients,
            bookingData.colour || '#6A469D'
          );
          tutorcruncherRecipientId = recipientResult.recipientId;
          logger.info(`✅ Created/updated student recipient ${tutorcruncherRecipientId} - ${normalizedStudent.first} ${normalizedStudent.last}`);
          
          // Add the STUDENT recipient (not client!) to the service with discounted charge rate
          const recipientPayload = {
            recipient: tutorcruncherRecipientId, // Use student recipient ID, not client ID!
            charge_rate: discountedRatePerLesson
          };

          await tutorCruncherAPI.post(
            `services/${finalServiceId}/recipient/add/`,
            recipientPayload
          );
          logger.info(`✅ Added student recipient ${tutorcruncherRecipientId} to service ${finalServiceId} with discounted charge rate $${discountedRatePerLesson}`);
        } else {
          logger.warn({ data: student }, '⚠️ Skipping recipient creation - missing first or last name:');
        }
      } catch (recipientError) {
        logger.error({ data: recipientError.response?.data || recipientError.message }, '❌ Error adding recipient to service:');
        // Continue even if recipient addition fails
      }
    }
    
    // Build subscription description
    const formatDate = (date) => {
      return date.toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' });
    };
    
    const nextBillingDateFormatted = formatDate(nextBillingDate);
    const finalClassDateFormatted = formatDate(finalClassDate);
    const totalLessons = config.class_dates.length;
    // ratePerLesson already declared above (line 2974), reuse it
    // const ratePerLesson = Number(config.rate_per_lesson) || 0;
    
    const monthlyDistribution = subscriptionBillingService.calculateMonthlyDistribution(config.class_dates);
    const futureMonths = Object.keys(monthlyDistribution).filter(monthKey => {
      const [year, month] = monthKey.split('-').map(Number);
      const monthDate = new Date(year, month - 1, 1);
      return monthDate >= firstOfNextMonth;
    });
    
    const checkoutDiscountNote = discountPercent > 0
      ? `\n• ${discountPercent}% discount applied ($${ratePerLesson.toFixed(2)} → $${discountedRatePerLesson.toFixed(2)} per lesson)`
      : '';

    const subscriptionDescription = `Monthly subscription for ${config.term_name}

PAYING TODAY: $${initialCharge.amount.toFixed(2)} for ${initialCharge.lessons} lesson${initialCharge.lessons !== 1 ? 's' : ''} this month

FUTURE PAYMENTS:
• Starting ${nextBillingDateFormatted}, you'll be charged monthly on the 1st of each month
• Amount varies by month based on number of lessons ($${discountedRatePerLesson.toFixed(2)} per lesson)${checkoutDiscountNote}
• Future months: ${futureMonths.length} month${futureMonths.length !== 1 ? 's' : ''} remaining
• Total term: ${totalLessons} lessons ending ${finalClassDateFormatted}
• Only charged for actual class dates (holidays skipped automatically)

You can cancel anytime - billing stops at the end of the current month.`;

    // Create Stripe Product and Price first (required for subscription creation)
    const product = await stripe.products.create({
      name: `${config.term_name} - Monthly Subscription`,
      description: subscriptionDescription
    });

    // Create subscription price using discounted rate per lesson (not initial charge amount)
    // The initial charge was already handled by the checkout session payment
    // The subscription should bill monthly at the discounted rate per lesson
    const price = await stripe.prices.create({
      currency: 'usd',
      product: product.id,
      recurring: {
        interval: 'month',
      },
      unit_amount: Math.round(discountedRatePerLesson * 100), // Use discounted rate if term discount applies
    });

    // Create Stripe subscription using the price ID
    // billing_cycle_anchor ensures no charge until next billing date
    // Initial charge was already processed via checkout session payment
    const subscription = await stripe.subscriptions.create({
      customer: stripeCustomerId,
      items: [{
        price: price.id,
      }],
      billing_cycle_anchor: Math.floor(nextBillingDate.getTime() / 1000),
      proration_behavior: 'none',
      metadata: {
        service_id: finalServiceId,
        term_name: config.term_name,
        tutorcruncher_client_id: tutorcruncherClientId || '',
        recipient_id: tutorcruncherRecipientId || '',
        enrollment_date: enrollmentDate,
        initial_charge_amount: initialCharge.amount.toFixed(2),
        initial_charge_lessons: initialCharge.lessons.toString(),
        rate_per_lesson: ratePerLesson.toFixed(2),
        total_lessons: totalLessons.toString(),
        next_billing_date: nextBillingDateFormatted,
        final_class_date: finalClassDateFormatted
      },
      collection_method: 'charge_automatically',
      payment_behavior: 'default_incomplete',
    });

    // Note: Initial charge was already processed via checkout session payment
    // The subscription will start billing automatically on nextBillingDate (billing_cycle_anchor)
    // No need to create a manual invoice - that would cause duplicate charges

    // Check if enrollment record already exists (pre-created during submission)
    let enrollment = null;
    if (finalSubmissionId) {
      const existingEnrollmentResult = await pool.query(
        `SELECT * FROM subscription_enrollments 
        WHERE metadata->>'submissionId' = $1 
        AND status = 'pending'
        ORDER BY created_at DESC
        LIMIT 1`,
        [finalSubmissionId.toString()]
      );
      
      if (existingEnrollmentResult.rows.length > 0) {
        enrollment = existingEnrollmentResult.rows[0];
        logger.info(`✅ Found existing pending enrollment ${enrollment.id} for submission ${finalSubmissionId}`);
        
        // Update existing enrollment record
        const updateResult = await pool.query(
          `UPDATE subscription_enrollments SET
            client_id = $1,
            recipient_id = $2,
            stripe_customer_id = $3,
            stripe_subscription_id = $4,
            first_billing_date = $5,
            final_class_date = $6,
            current_month_lessons = $7,
            total_lessons_remaining = $8,
            status = $9,
            metadata = $10::jsonb
          WHERE id = $11
          RETURNING *`,
          [
            tutorcruncherClientId || enrollment.client_id,
            tutorcruncherRecipientId || enrollment.recipient_id,
            stripeCustomerId,
            subscription.id,
            nextBillingDate.toISOString().split('T')[0],
            finalClassDate.toISOString().split('T')[0],
            initialCharge.lessons,
            config.class_dates.length,
            'active',
            JSON.stringify({
              ...(typeof enrollment.metadata === 'object' ? enrollment.metadata : {}),
              initialCharge,
              ratePerLesson,
              tutorcruncherClientId,
              tutorcruncherRecipientId,
              submissionId: finalSubmissionId,
              parentEmail,
              parentName,
              parentPhone,
              completedAt: new Date().toISOString()
            })
          ]
        );
        
        enrollment = updateResult.rows[0];
        logger.info(`✅ Updated enrollment ${enrollment.id} to active status`);
      }
    }
    
    // Create enrollment record if it doesn't exist
    if (!enrollment) {
      const enrollmentResult = await pool.query(
        `INSERT INTO subscription_enrollments (
          service_id, client_id, recipient_id, stripe_customer_id, stripe_subscription_id,
          payment_type, enrollment_date, first_billing_date, final_class_date,
          current_month_lessons, total_lessons_remaining, status, metadata
        ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13)
        RETURNING *`,
        [
          finalServiceId,
          tutorcruncherClientId,
          tutorcruncherRecipientId || null,
          stripeCustomerId,
          subscription.id,
          'monthly',
          enrollmentDate,
          nextBillingDate.toISOString().split('T')[0],
          finalClassDate.toISOString().split('T')[0],
          initialCharge.lessons,
          config.class_dates.length,
          'active',
          JSON.stringify({
            initialCharge,
            ratePerLesson,
            tutorcruncherClientId,
            tutorcruncherRecipientId,
            submissionId: finalSubmissionId,
            parentEmail,
            parentName,
            parentPhone
          })
        ]
      );

      enrollment = enrollmentResult.rows[0];
      logger.info(`✅ Created new enrollment ${enrollment.id}`);
    }

    // Create initial billing history record
    if (initialCharge.lessons > 0) {
      await pool.query(
        `INSERT INTO subscription_billing_history (
          enrollment_id, billing_month, lessons_count, amount_charged, status
        ) VALUES ($1, $2, $3, $4, $5)`,
        [
          enrollment.id,
          subscriptionBillingService.getFirstOfMonth(enrollDate).toISOString().split('T')[0],
          initialCharge.lessons,
          initialCharge.amount,
          'pending'
        ]
      );
    }

    // Send enrollment confirmation email
    try {
      const studentName = bookingData?.students?.[0] ? 
        `${bookingData.students[0].first} ${bookingData.students[0].last}` : 
        'Student';
      
      await subscriptionNotificationService.sendEnrollmentConfirmation(
        enrollment,
        config,
        {
          parentName: parentName,
          parentEmail: parentEmail,
          studentName: studentName,
          paymentPlan: 'monthly'
        }
      );
    } catch (notifError) {
      logger.error({ data: notifError }, 'Error sending enrollment confirmation:');
      // Don't fail enrollment if email fails
    }

    // Clear subscription caches
    await cache.clearCacheByPrefix('subscriptions');

    return res.json({
      success: true,
      message: 'Subscription created successfully',
      subscriptionId: subscription.id,
      enrollment: {
        id: enrollment.id,
        serviceId: enrollment.service_id,
        subscriptionId: subscription.id,
        status: enrollment.status,
        nextBillingDate: nextBillingDate.toISOString().split('T')[0],
        initialCharge,
        tutorcruncherClientId: tutorcruncherClientId || null
      }
    });
  } catch (error) {
    logger.error({ err: error }, '❌ Error completing setup:');
    logger.error({ data: error.stack }, '   Error stack:');
    logger.error({ data: {
      checkoutSessionId: req.body.checkoutSessionId,
      paymentMethodId: req.body.paymentMethodId ? 'present' : 'missing',
      stripeCustomerId: req.body.stripeCustomerId,
      serviceId: req.body.serviceId,
      submissionId: req.body.submissionId
    } }, '   Request body:');
    
    // Log Stripe-specific errors
    if (error.type && error.type.startsWith('Stripe')) {
      logger.error({ data: error.type }, '   Stripe error type:');
      logger.error({ data: error.code }, '   Stripe error code:');
      logger.error({ error: error.message }, '   Stripe error message:');
    }
    
    res.status(500).json({
      error: 'Failed to complete setup',
      message: error.message,
      details: process.env.NODE_ENV === 'development' ? error.stack : undefined
    });
  }
}));

/**
 * GET /api/subscriptions/session/:sessionId
 * Get subscription details from Stripe checkout session (public endpoint for success page)
 */
router.get('/session/:sessionId', asyncHandler(async (req, res) => {
  try {
    const { sessionId } = req.params;
    
    // Retrieve Stripe checkout session
    const session = await stripe.checkout.sessions.retrieve(sessionId, {
      expand: ['setup_intent.payment_method', 'customer', 'subscription']
    });
    
    if (!session) {
      return res.status(404).json({
        error: 'Checkout session not found'
      });
    }
    
    // Check if this is a setup mode session (subscription)
    if (session.mode === 'setup' && session.metadata?.service_id) {
      const serviceId = session.metadata.service_id;
      const submissionId = session.metadata.submission_id !== 'none' ? parseInt(session.metadata.submission_id) : null;
      
      // Get term billing config
      const configResult = await pool.query(
        'SELECT * FROM term_billing_configs WHERE service_id = $1 AND is_active = true',
        [serviceId]
      );
      
      if (configResult.rows.length === 0) {
        return res.status(404).json({
          error: 'Term billing config not found'
        });
      }
      
      const config = configResult.rows[0];
      
      // Parse JSONB fields
      if (typeof config.class_dates === 'string') {
        try {
          config.class_dates = JSON.parse(config.class_dates);
        } catch (e) {
          config.class_dates = [];
        }
      }
      
      // Get submission data if available
      let submissionData = null;
      if (submissionId) {
        const { rows } = await pool.query(
          `SELECT students, slots, parent_first, parent_last, parent_email, booking_type
          FROM booking_submissions WHERE id = $1`,
          [submissionId]
        );
        if (rows.length > 0) {
          submissionData = rows[0];
        }
      }
      
      // Calculate initial charge
      const enrollmentDate = session.metadata.enrollment_date || new Date().toISOString().split('T')[0];
      const enrollDate = new Date(enrollmentDate);
      const initialCharge = subscriptionBillingService.calculateInitialCharge(
        { enrollment_date: enrollmentDate },
        config,
        enrollDate
      );
      const nextBillingDate = subscriptionBillingService.getNextBillingDate(enrollDate);
      
      // Check if subscription enrollment exists (including pending status)
      let enrollment = null;
      if (session.customer) {
        const enrollmentResult = await pool.query(
          `SELECT * FROM subscription_enrollments 
          WHERE stripe_customer_id = $1 
          ORDER BY created_at DESC 
          LIMIT 1`,
          [session.customer]
        );
        if (enrollmentResult.rows.length > 0) {
          enrollment = enrollmentResult.rows[0];
        }
      }
      
      // Also check by submission_id if available (for pending enrollments)
      if (!enrollment && submissionId) {
        const enrollmentBySubmissionResult = await pool.query(
          `SELECT * FROM subscription_enrollments 
          WHERE metadata->>'submissionId' = $1 
          ORDER BY created_at DESC 
          LIMIT 1`,
          [submissionId.toString()]
        );
        if (enrollmentBySubmissionResult.rows.length > 0) {
          enrollment = enrollmentBySubmissionResult.rows[0];
        }
      }
      
      // Format dates for display
      const formatDate = (date) => {
        return date.toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' });
      };
      
      const monthlyDistribution = subscriptionBillingService.calculateMonthlyDistribution(config.class_dates);
      const futureMonths = Object.keys(monthlyDistribution).filter(monthKey => {
        const [year, month] = monthKey.split('-').map(Number);
        const monthDate = new Date(year, month - 1, 1);
        return monthDate >= subscriptionBillingService.getFirstOfMonth(nextBillingDate);
      });
      
      return res.json({
        success: true,
        type: 'subscription',
        session: {
          id: session.id,
          status: session.status,
          mode: session.mode,
          customer: session.customer
        },
        enrollment: enrollment ? {
          id: enrollment.id,
          status: enrollment.status,
          subscriptionId: enrollment.stripe_subscription_id
        } : null,
        subscription: {
          serviceId: serviceId,
          termName: config.term_name,
          ratePerLesson: parseFloat(config.rate_per_lesson) || 0,
          totalLessons: config.class_dates.length,
          enrollmentDate: enrollmentDate,
          nextBillingDate: formatDate(nextBillingDate),
          initialCharge: {
            amount: initialCharge.amount,
            lessons: initialCharge.lessons,
            description: `$${initialCharge.amount.toFixed(2)} for ${initialCharge.lessons} lesson${initialCharge.lessons !== 1 ? 's' : ''} this month`
          },
          futurePayments: {
            startDate: formatDate(nextBillingDate),
            ratePerLesson: parseFloat(config.rate_per_lesson) || 0,
            totalLessons: config.class_dates.length - initialCharge.lessons,
            monthsRemaining: futureMonths.length,
            description: `Starting ${formatDate(nextBillingDate)}, billed monthly at $${(parseFloat(config.rate_per_lesson) || 0).toFixed(2)} per lesson`
          },
          classDates: config.class_dates.map(d => formatDate(new Date(d)))
        },
        submission: submissionData ? {
          students: submissionData.students || [],
          slots: submissionData.slots || [],
          parentName: `${submissionData.parent_first} ${submissionData.parent_last}`,
          parentEmail: submissionData.parent_email,
          bookingType: submissionData.booking_type
        } : null
      });
    }
    
    // Check if this is a term payment session (one-time full term payment)
    if (session.mode === 'payment' && session.metadata?.enrollment_type === 'term') {
      const serviceId = session.metadata.service_id;
      const submissionId = session.metadata.submission_id !== 'none' ? parseInt(session.metadata.submission_id) : null;

      // Use location-aware pool for franchise bookings
      const { getPool } = require('../database-connections');
      const sessionLocation = session.metadata?.location;
      const sessionPool = sessionLocation && sessionLocation !== 'production'
        ? getPool(sessionLocation)
        : (req.locationPool || pool);

      // Get submission data if available
      let submissionData = null;
      if (submissionId) {
        const { rows } = await sessionPool.query(
          `SELECT students, slots, parent_first, parent_last, parent_email, booking_type
          FROM booking_submissions WHERE id = $1`,
          [submissionId]
        );
        if (rows.length > 0) {
          submissionData = rows[0];
        }
      }

      // Check if enrollment exists for this checkout session
      let enrollment = null;
      const enrollmentResult = await sessionPool.query(
        `SELECT * FROM subscription_enrollments
         WHERE metadata->>'checkout_session_id' = $1
         OR stripe_customer_id = $2
         ORDER BY created_at DESC
         LIMIT 1`,
        [session.id, session.customer]
      );
      if (enrollmentResult.rows.length > 0) {
        enrollment = enrollmentResult.rows[0];
      }

      // Also check by submission_id if available
      if (!enrollment && submissionId) {
        const enrollmentBySubmissionResult = await sessionPool.query(
          `SELECT * FROM subscription_enrollments
           WHERE metadata->>'submissionId' = $1
           ORDER BY created_at DESC
           LIMIT 1`,
          [submissionId.toString()]
        );
        if (enrollmentBySubmissionResult.rows.length > 0) {
          enrollment = enrollmentBySubmissionResult.rows[0];
        }
      }

      // Get lesson dates from term billing config
      let lessonDates = [];
      if (serviceId) {
        try {
          const configResult = await sessionPool.query(
            'SELECT class_dates FROM term_billing_configs WHERE service_id = $1 AND is_active = true',
            [serviceId]
          );
          if (configResult.rows.length > 0) {
            let classDates = configResult.rows[0].class_dates;
            if (typeof classDates === 'string') {
              try {
                classDates = JSON.parse(classDates);
              } catch (e) {
                classDates = [];
              }
            }
            if (Array.isArray(classDates)) {
              const numLessons = parseInt(session.metadata.lessons) || classDates.length;
              const sortedDates = classDates.map(d => new Date(d)).sort((a, b) => a - b);
              lessonDates = sortedDates.slice(0, numLessons).map(date => {
                return date.toLocaleDateString('en-US', { 
                  weekday: 'short',
                  month: 'short', 
                  day: 'numeric', 
                  year: 'numeric' 
                });
              });
            }
          }
        } catch (error) {
          logger.error({ err: error }, 'Error fetching lesson dates:');
        }
      }
      
      return res.json({
        success: true,
        type: 'term_payment',
        session: {
          id: session.id,
          status: session.status,
          mode: session.mode,
          paymentStatus: session.payment_status,
          amountTotal: session.amount_total ? session.amount_total / 100 : 0,
          currency: session.currency,
          customer: session.customer
        },
        enrollment: enrollment ? {
          id: enrollment.id,
          status: enrollment.status
        } : null,
        payment: {
          termName: session.metadata.term_name,
          amount: parseFloat(session.metadata.amount_charged) || (session.amount_total ? session.amount_total / 100 : 0),
          lessons: parseInt(session.metadata.lessons) || 0,
          totalLessons: parseInt(session.metadata.total_lessons) || 0,
          discountPercent: parseFloat(session.metadata.discount_percent) || 0,
          enrollmentDate: session.metadata.enrollment_date,
          finalClassDate: session.metadata.final_class_date,
          lessonDates: lessonDates,
          description: `One-time payment for ${session.metadata.lessons || 0} lessons with ${session.metadata.discount_percent || 0}% discount`
        },
        submission: submissionData ? {
          students: submissionData.students || [],
          slots: submissionData.slots || [],
          parentName: `${submissionData.parent_first} ${submissionData.parent_last}`,
          parentEmail: submissionData.parent_email,
          bookingType: submissionData.booking_type
        } : null
      });
    }
    
    // Regular payment session
    return res.json({
      success: true,
      type: 'payment',
      session: {
        id: session.id,
        status: session.status,
        mode: session.mode,
        amountTotal: session.amount_total ? session.amount_total / 100 : 0,
        currency: session.currency
      }
    });
  } catch (error) {
    logger.error({ err: error }, 'Error fetching subscription session details:');
    res.status(500).json({
      error: 'Failed to fetch session details',
      message: error.message
    });
  }
}));

/**
 * POST /api/subscriptions/complete-setup/:sessionId
 * Manually complete subscription setup from a checkout session (fallback if webhook fails)
 * This endpoint retrieves the payment method from the checkout session and creates the subscription
 */
router.post('/complete-setup/:sessionId', asyncHandler(async (req, res) => {
  try {
    const { sessionId } = req.params;
    
    logger.info(`🔄 Manual subscription setup completion requested for session ${sessionId}`);
    
    // Retrieve Stripe checkout session
    const session = await stripe.checkout.sessions.retrieve(sessionId, {
      expand: ['setup_intent.payment_method', 'customer']
    });
    
    if (!session) {
      return res.status(404).json({
        success: false,
        error: 'Checkout session not found'
      });
    }
    
    if (session.mode !== 'setup') {
      return res.status(400).json({
        success: false,
        error: 'Session is not in setup mode'
      });
    }
    
    // Check if enrollment already exists
    const existingEnrollment = await pool.query(
      `SELECT * FROM subscription_enrollments 
       WHERE stripe_customer_id = $1 
       ORDER BY created_at DESC 
       LIMIT 1`,
      [session.customer]
    );
    
    if (existingEnrollment.rows.length > 0) {
      logger.info(`✅ Enrollment already exists: ${existingEnrollment.rows[0].id}`);
      return res.json({
        success: true,
        enrollment: existingEnrollment.rows[0],
        message: 'Enrollment already exists'
      });
    }
    
    // Get payment method from setup intent
    const setupIntent = session.setup_intent;
    let paymentMethodId = null;
    
    if (typeof setupIntent === 'string') {
      // Setup intent is just an ID, need to retrieve it
      const retrievedIntent = await stripe.setupIntents.retrieve(setupIntent, {
        expand: ['payment_method']
      });
      paymentMethodId = typeof retrievedIntent.payment_method === 'string'
        ? retrievedIntent.payment_method
        : retrievedIntent.payment_method?.id;
    } else if (setupIntent) {
      // Setup intent is expanded
      paymentMethodId = typeof setupIntent.payment_method === 'string'
        ? setupIntent.payment_method
        : setupIntent.payment_method?.id;
    }
    
    if (!paymentMethodId) {
      return res.status(400).json({
        success: false,
        error: 'No payment method found in checkout session'
      });
    }
    
    logger.info(`✅ Payment method found: ${paymentMethodId}`);
    
    // Get service ID and other metadata
    const serviceId = session.metadata.service_id;
    const submissionId = session.metadata.submission_id !== 'none' ? parseInt(session.metadata.submission_id) : null;
    const enrollmentDate = session.metadata.enrollment_date || new Date().toISOString().split('T')[0];
    const clientId = session.metadata.client_id !== 'none' ? session.metadata.client_id : null;
    const parentEmail = session.metadata.parent_email || session.customer_details?.email;
    const parentName = session.metadata.parent_name || session.customer_details?.name || '';
    const parentPhone = session.customer_details?.phone || '';
    
    if (!serviceId) {
      return res.status(400).json({
        success: false,
        error: 'Service ID not found in session metadata'
      });
    }
    
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
          bookingData = {
            students: submission.students || [],
            slots: submission.slots || [],
            address: submission.address || {},
            timezone: submission.timezone || 'America/New_York',
            bookingType: submission.booking_type,
            lessonType: submission.lesson_type,
            labelName: submission.label_name
          };
        }
      } catch (submissionError) {
        logger.error({ data: submissionError.message }, `⚠️ Could not fetch submission ${submissionId} data:`);
      }
    }
    
    // Call the subscription creation endpoint internally
    const subscriptionPayload = {
      serviceId: serviceId,
      clientId: clientId,
      stripeCustomerId: session.customer,
      paymentMethodId: paymentMethodId,
      enrollmentDate: enrollmentDate,
      submissionId: submissionId,
      parentEmail: parentEmail,
      parentName: parentName,
      parentPhone: parentPhone,
      bookingData: bookingData
    };
    
    logger.info('🔄 Creating subscription with payment method...');
    
    // Import the subscription creation logic (we'll call it directly)
    // Since we're in the same file, we can't easily call the route handler
    // Instead, we'll make an internal HTTP call to the create endpoint
    const baseUrl = process.env.APP_URL || process.env.HEROKU_APP_URL || 'http://localhost:5000';
    const subscriptionUrl = `${baseUrl}/api/subscriptions/create`;
    
    try {
      const axios = require('axios');
      const response = await axios.post(subscriptionUrl, subscriptionPayload, {
        headers: {
          'Content-Type': 'application/json',
        },
        timeout: 30000,
      });
      
      if (response.status >= 200 && response.status < 300 && response.data.success) {
        logger.info('✅ Subscription setup completed successfully');
        return res.json({
          success: true,
          enrollment: response.data.enrollment,
          message: 'Subscription created successfully'
        });
      } else {
        return res.status(500).json({
          success: false,
          error: 'Subscription creation failed',
          details: response.data
        });
      }
    } catch (error) {
      logger.error({ error: error.message }, '❌ Error creating subscription:');
      if (error.response) {
        logger.error(`   Response status: ${error.response.status}`);
        logger.error({ data: error.response.data }, '   Response data:');
        return res.status(error.response.status).json({
          success: false,
          error: error.response.data?.error || 'Subscription creation failed',
          details: error.response.data
        });
      }
      throw error;
    }
  } catch (error) {
    logger.error({ err: error }, 'Error completing subscription setup:');
    res.status(500).json({
      success: false,
      error: 'Failed to complete subscription setup',
      message: error.message
    });
  }
}));

/**
 * POST /api/subscriptions/complete-term-payment/:sessionId
 * Manually complete term payment processing from a checkout session (fallback if webhook fails)
 * This endpoint processes the payment, creates client, recipients, adds to appointments, and creates enrollment
 */
router.post('/complete-term-payment/:sessionId', asyncHandler(async (req, res) => {
  try {
    const { sessionId } = req.params;

    logger.info(`🔄 Manual term payment completion requested for session ${sessionId}`);

    // Retrieve Stripe checkout session
    const session = await stripe.checkout.sessions.retrieve(sessionId, {
      expand: ['customer', 'payment_intent']
    });

    if (!session) {
      return res.status(404).json({
        success: false,
        error: 'Checkout session not found'
      });
    }

    if (session.mode !== 'payment' || session.metadata?.enrollment_type !== 'term') {
      return res.status(400).json({
        success: false,
        error: 'Session is not a term payment checkout session'
      });
    }

    if (session.payment_status !== 'paid') {
      return res.status(400).json({
        success: false,
        error: `Payment not completed. Status: ${session.payment_status}`
      });
    }

    // Use location-aware pool for franchise bookings
    // The locationDbMiddleware sets req.locationPool based on hostname,
    // and the Stripe metadata may also contain the originating location
    const { getPool } = require('../database-connections');
    const metadataLocation = session.metadata?.location;
    const locationPool = metadataLocation && metadataLocation !== 'production'
      ? getPool(metadataLocation)
      : (req.locationPool || pool);
    if (metadataLocation && metadataLocation !== 'production') {
      logger.info(`🏢 Using ${metadataLocation} database pool for complete-term-payment`);
    }

    // Check if enrollment already exists
    const existingEnrollment = await locationPool.query(
      `SELECT * FROM subscription_enrollments 
       WHERE metadata->>'checkout_session_id' = $1`,
      [sessionId]
    );
    
    if (existingEnrollment.rows.length > 0) {
      logger.info(`✅ Enrollment already exists: ${existingEnrollment.rows[0].id}`);
      return res.json({
        success: true,
        enrollment: existingEnrollment.rows[0],
        message: 'Enrollment already exists'
      });
    }
    
    // Get metadata
    const serviceId = session.metadata.service_id;
    const submissionId = session.metadata.submission_id !== 'none' ? parseInt(session.metadata.submission_id) : null;
    const enrollmentDate = session.metadata.enrollment_date || new Date().toISOString().split('T')[0];
    const stripeCustomerId = typeof session.customer === 'string' 
      ? session.customer 
      : session.customer?.id || session.customer;
    
    if (!serviceId) {
      return res.status(400).json({
        success: false,
        error: 'Service ID not found in session metadata'
      });
    }
    
    // Get submission data
    let submission = null;
    let recipientIds = [];
    let tutorcruncherClientId = null;
    
    if (submissionId) {
      const submissionResult = await locationPool.query(
        `SELECT * FROM booking_submissions WHERE id = $1`,
        [submissionId]
      );

      if (submissionResult.rows.length > 0) {
        submission = submissionResult.rows[0];

        // Parse students if stored as JSON string
        if (submission.students && typeof submission.students === 'string') {
          try {
            submission.students = JSON.parse(submission.students);
          } catch (e) {
            logger.error(`⚠️ Failed to parse students JSON: ${e.message}`);
          }
        }
        
        // Import client manager functions
        const { createOrUpdateClient, createOrUpdateRecipient } = require('../utils/clientManager');
        
        // Create TutorCruncher client if not already created
        tutorcruncherClientId = submission.tc_client_id;
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
        }
        
        // Create recipients (students) and add to appointments
        if (submission.students && Array.isArray(submission.students) && submission.students.length > 0) {
          logger.info('👨‍🎓 Creating recipients and adding to appointments');
          
          // Get term billing config to get class dates
          const termConfigResult = await locationPool.query(
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
              logger.warn({ data: student }, '⚠️ Skipping student - missing first or last name:');
              continue;
            }

            const recipientResult = await createOrUpdateRecipient(
              normalizedStudent, // Pass normalized student object
              tutorcruncherClientId,
              existingRecipients,
              '#6A469D'
            );
            
            recipientIds.push(recipientResult.recipientId);
            logger.info(`✅ Created/updated recipient ${recipientResult.recipientId} - ${normalizedStudent.first} ${normalizedStudent.last}`);
            
            // Add recipient to service with discounted charge rate
            try {
              const addToServicePayload = {
                recipient: recipientResult.recipientId,
                charge_rate: discountedRatePerLesson // Use discounted rate, not full rate
              };

              await tutorCruncherAPI.post(`services/${serviceId}/recipient/add/`, addToServicePayload);
              logger.info(`✅ Added recipient ${recipientResult.recipientId} to service ${serviceId} with discounted charge rate $${discountedRatePerLesson}`);
            } catch (serviceError) {
              const errorMsg = serviceError.response?.data?.error || serviceError.message;
              if (!/already|exists|duplicate/i.test(errorMsg)) {
                logger.error({ data: errorMsg }, '⚠️ Failed to add recipient to service:');
              } else {
                logger.info(`ℹ️  Recipient already in service ${serviceId}`);
              }
            }
            
            // Add recipient to appointments for this service
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
                      // Add recipient to appointment with discounted charge rate
                      // Always use discountedRatePerLesson (which equals ratePerLesson if no discount)
                      const recipientPayload = {
                        recipient: recipientResult.recipientId,
                        charge_rate: discountedRatePerLesson.toFixed(2)
                      };
                      
                      await tutorCruncherAPI.post(
                        `/appointments/${appointment.id}/recipient/add/`,
                        recipientPayload
                      );
                      logger.info({ recipientId: recipientResult.recipientId, appointmentId: appointment.id, chargeRate: discountedRatePerLesson, discountPercent }, '✅ Added recipient to appointment');
                      
                      await new Promise(resolve => setTimeout(resolve, 200)); // Rate limiting
                    } catch (error) {
                      const errorMsg = error.response?.data?.error || error.message;
                      if (!/already|exists|duplicate/i.test(errorMsg)) {
                        logger.error({ data: errorMsg }, `⚠️ Failed to add recipient to appointment ${appointment.id}:`);
                      }
                    }
                  }
                }
              } catch (appointmentError) {
                logger.error({ data: appointmentError.message }, '⚠️ Error adding recipients to appointments:');
                // Don't fail enrollment if appointment addition fails
              }
            }
          }
        }
        
        // Update submission with client ID
        await locationPool.query(
          `UPDATE booking_submissions
           SET stripe_customer_id = $1,
               stripe_session_id = $2,
               tc_client_id = $3,
               payment_status = 'paid',
               status = 'completed'
           WHERE id = $4`,
          [stripeCustomerId, sessionId, tutorcruncherClientId, submissionId]
        );
      }
    }

    // Get term config for enrollment creation
    const termConfigResult = await locationPool.query(
      `SELECT * FROM term_billing_configs WHERE service_id = $1 AND is_active = true`,
      [serviceId]
    );
    
    const termConfig = termConfigResult.rows[0] || {
      term_name: session.metadata.term_name || 'Term',
      class_dates: []
    };
    
    const finalClassDate = session.metadata.final_class_date || (termConfig.class_dates && termConfig.class_dates.length > 0 
      ? (typeof termConfig.class_dates === 'string' ? JSON.parse(termConfig.class_dates) : termConfig.class_dates)[termConfig.class_dates.length - 1]
      : null);
    const lessons = parseInt(session.metadata.lessons) || 0;
    const amountCharged = parseFloat(session.metadata.amount_charged) || (session.amount_total / 100);
    const discountPercent = parseFloat(session.metadata.discount_percent) || 0;
    const ratePerLesson = parseFloat(termConfig.rate_per_lesson) || 0;
    
    // Calculate discounted rate per lesson (for setting on appointments)
    const discountedRatePerLesson = discountPercent > 0 
      ? parseFloat((ratePerLesson * (1 - discountPercent / 100)).toFixed(2))
      : ratePerLesson;
    
    // Create credit request (proforma invoice) in TutorCruncher for the discounted term total
    // This credits the client's account so lessons can charge against it
    let creditRequestId = null;
    if (tutorcruncherClientId && amountCharged > 0) {
      try {
        logger.info(`💳 Creating credit request for client ${tutorcruncherClientId}: $${amountCharged}`);
        const creditRequestPayload = {
          amount: parseFloat(amountCharged.toFixed(2)),
          client: parseInt(tutorcruncherClientId),
          send_pfi: false, // Don't auto-raise — Stripe already collected payment, just create the accounting record
          description: `Term Payment: ${lessons} lesson${lessons !== 1 ? 's' : ''} for ${termConfig.term_name || 'Term'}${discountPercent > 0 ? ` (${discountPercent}% discount applied)` : ''}`
        };
        
        logger.info({ data: JSON.stringify(creditRequestPayload, null, 2) }, '📋 Credit request payload:');
        const creditResponse = await tutorCruncherAPI.post('/proforma-invoices/', creditRequestPayload);
        creditRequestId = creditResponse.data.id;
        const creditRequestStatus = creditResponse.data.status;
        logger.info(`✅ Created credit request (proforma invoice) ID: ${creditRequestId}, Status: ${creditRequestStatus}`);
        
        // Wait for credit request to be fully created
        await new Promise(resolve => setTimeout(resolve, 1500));
        
        // Mark credit as paid immediately (payment already processed via Stripe)
        try {
          await tutorCruncherAPI.post(`/proforma-invoices/${creditRequestId}/take_payment/`, {
            amount: parseFloat(amountCharged.toFixed(2)),
            method: 'cash', // Record as externally paid — Stripe already collected the payment
            send_receipt: false
          });
          logger.info(`✅ Marked credit request ${creditRequestId} as paid: $${amountCharged}`);
        } catch (paymentError) {
          logger.error({ data: paymentError.response?.data || paymentError.message }, '⚠️ Failed to mark credit request as paid:');
          logger.error(`🚨 MANUAL ACTION REQUIRED: Credit request ${creditRequestId} created but not marked as paid for client ${tutorcruncherClientId}`);
          // Don't fail enrollment if credit payment marking fails - credit still exists
        }
      } catch (creditError) {
        logger.error({ data: creditError.response?.data || creditError.message }, '❌ Failed to create credit request:');
        // Don't fail enrollment if credit creation fails - log error but continue
      }
    }
    
    // Create enrollment record
    // CRITICAL: Set recipient_id to prevent "Client {id}" duplicates in school dashboard
    const primaryRecipientId = recipientIds.length > 0 ? recipientIds[0] : null;
    
    const enrollmentResult = await locationPool.query(
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
        enrollmentDate,
        finalClassDate,
        lessons,
        'active',
        JSON.stringify({
          checkout_session_id: sessionId,
          payment_intent_id: session.payment_intent,
          amountCharged: amountCharged,
          discountApplied: discountPercent,
          discountedRatePerLesson: discountedRatePerLesson,
          ratePerLesson: ratePerLesson,
          lessons: lessons,
          totalLessons: parseInt(session.metadata.total_lessons) || 0,
          termName: termConfig.term_name,
          submissionId: submissionId,
          recipientIds: recipientIds,
          creditRequestId: creditRequestId
        })
      ]
    );
    
    const enrollment = enrollmentResult.rows[0];
    logger.info(`✅ Created enrollment ${enrollment.id} for term payment`);

    // Clear subscription caches
    await cache.clearCacheByPrefix('subscriptions');

    return res.json({
      success: true,
      enrollment: enrollment,
      message: 'Term payment processed successfully'
    });
  } catch (error) {
    logger.error({ err: error }, 'Error completing term payment:');
    res.status(500).json({
      success: false,
      error: 'Failed to complete term payment processing',
      message: error.message
    });
  }
}));

/**
 * GET /api/subscriptions/student-billing/:studentId/:serviceId
 * Get detailed billing information for a student
 */
router.get('/student-billing/:studentId/:serviceId', auth, asyncHandler(async (req, res) => {
  try {
    const { studentId, serviceId } = req.params;
    const locationPool = req.locationPool || pool;

    // Get enrollment for this student/service combination
    const enrollmentResult = await locationPool.query(
      `SELECT e.*, tbc.term_name, tbc.rate_per_lesson, tbc.term_discount_percent, tbc.class_dates
       FROM subscription_enrollments e
       LEFT JOIN term_billing_configs tbc ON e.service_id = tbc.service_id AND tbc.is_active = true
       WHERE (e.recipient_id = $1 OR e.client_id = $1) AND e.service_id = $2 AND e.status = 'active'
       ORDER BY e.enrollment_date DESC
       LIMIT 1`,
      [studentId, serviceId]
    );

    if (enrollmentResult.rows.length === 0) {
      // No enrollment found - this is a per-lesson student
      // Get appointments for this student/service
      try {
        const appointmentsResponse = await tutorCruncherAPI.get('/appointments/', {
          params: {
            service: serviceId,
            recipient: studentId,
            start__gte: new Date().toISOString().split('T')[0]
          }
        });

        const appointments = appointmentsResponse.data.results || [];
        
        // Get client info to check auto-invoicing
        let clientInfo = null;
        try {
          const clientId = studentId; // For per-lesson, student_id might be client_id
          const clientResponse = await tutorCruncherAPI.get(`/clients/${clientId}/`);
          clientInfo = {
            id: clientResponse.data.id,
            auto_charge: clientResponse.data.auto_charge,
            balance: clientResponse.data.balance || 0
          };
        } catch (clientError) {
          logger.warn({ data: clientError.message }, 'Could not fetch client info:');
        }

        return res.json({
          paymentType: 'per_lesson',
          studentId: studentId,
          serviceId: serviceId,
          appointments: appointments.map(apt => ({
            id: apt.id,
            start: apt.start,
            status: apt.status,
            charge_rate: apt.recipients?.find(r => r.id === parseInt(studentId))?.charge_rate || null
          })),
          clientInfo: clientInfo,
          enrollment: null
        });
      } catch (error) {
        logger.error({ err: error }, 'Error fetching per-lesson student data:');
        return res.status(500).json({
          error: 'Failed to fetch student billing data',
          message: error.message
        });
      }
    }

    const enrollment = enrollmentResult.rows[0];
    enrollment.metadata = enrollment.metadata ? JSON.parse(enrollment.metadata) : {};
    
    // Parse class_dates if it's a string
    let classDates = enrollment.class_dates;
    if (typeof classDates === 'string') {
      try {
        classDates = JSON.parse(classDates);
      } catch (e) {
        classDates = [];
      }
    }

    // Get billing history
    const historyResult = await locationPool.query(
      `SELECT * FROM subscription_billing_history 
       WHERE enrollment_id = $1 
       ORDER BY billing_month DESC`,
      [enrollment.id]
    );

    // Get upcoming appointments for this service
    let upcomingAppointments = [];
    try {
      const appointmentsResponse = await tutorCruncherAPI.get('/appointments/', {
        params: {
          service: serviceId,
          recipient: enrollment.recipient_id || studentId,
          start__gte: new Date().toISOString().split('T')[0]
        }
      });

      upcomingAppointments = appointmentsResponse.data.results || [];
    } catch (apptError) {
      logger.warn({ data: apptError.message }, 'Could not fetch appointments:');
    }

    // Get TutorCruncher client balance
    let clientBalance = 0;
    try {
      const clientResponse = await tutorCruncherAPI.get(`/clients/${enrollment.client_id}/accounting/`);
      clientBalance = parseFloat(clientResponse.data.balance || 0);
    } catch (balanceError) {
      logger.warn({ data: balanceError.message }, 'Could not fetch client balance:');
    }

    // Calculate remaining balance for term billing
    let remainingBalance = 0;
    let lessonsPaidFor = 0;
    let lessonsRemaining = 0;
    
    if (enrollment.payment_type === 'term') {
      const totalLessons = classDates ? classDates.length : enrollment.total_lessons_remaining || 0;
      const ratePerLesson = parseFloat(enrollment.rate_per_lesson) || 0;
      const discountPercent = parseFloat(enrollment.term_discount_percent) || 0;
      const discountedRate = discountPercent > 0 
        ? ratePerLesson * (1 - discountPercent / 100)
        : ratePerLesson;
      
      // Get total amount charged
      const totalCharged = historyResult.rows.reduce((sum, h) => sum + parseFloat(h.amount_charged || 0), 0);
      
      // Calculate lessons paid for based on amount charged
      lessonsPaidFor = discountedRate > 0 ? Math.floor(totalCharged / discountedRate) : 0;
      lessonsRemaining = Math.max(0, totalLessons - lessonsPaidFor);
      remainingBalance = clientBalance; // Use actual TutorCruncher balance
    }

    // For monthly billing, calculate next charge date and amount
    let nextChargeDate = null;
    let nextChargeAmount = null;
    let lessonsInNextCharge = 0;
    
    if (enrollment.payment_type === 'monthly' && enrollment.stripe_subscription_id) {
      try {
        const subscription = await stripe.subscriptions.retrieve(enrollment.stripe_subscription_id);
        if (subscription.current_period_end) {
          nextChargeDate = new Date(subscription.current_period_end * 1000);
        }
        
        // Get rate per lesson from config or metadata
        const ratePerLesson = parseFloat(enrollment.rate_per_lesson) || parseFloat(enrollment.metadata?.ratePerLesson) || 0;
        const lessonsPerMonth = enrollment.current_month_lessons || enrollment.metadata?.lessons_per_month || 0;
        nextChargeAmount = ratePerLesson * lessonsPerMonth;
        lessonsInNextCharge = lessonsPerMonth;
      } catch (stripeError) {
        logger.warn({ data: stripeError.message }, 'Could not fetch Stripe subscription:');
      }
    }

    res.json({
      paymentType: enrollment.payment_type,
      studentId: studentId,
      serviceId: serviceId,
      enrollment: {
        ...enrollment,
        classDates: classDates
      },
      billingHistory: historyResult.rows,
      upcomingAppointments: upcomingAppointments.map(apt => ({
        id: apt.id,
        start: apt.start,
        status: apt.status,
        charge_rate: apt.recipients?.find(r => r.id === parseInt(enrollment.recipient_id || studentId))?.charge_rate || null
      })),
      clientBalance: clientBalance,
      termBillingDetails: enrollment.payment_type === 'term' ? {
        totalLessons: classDates ? classDates.length : enrollment.total_lessons_remaining || 0,
        lessonsPaidFor: lessonsPaidFor,
        lessonsRemaining: lessonsRemaining,
        remainingBalance: remainingBalance,
        ratePerLesson: parseFloat(enrollment.rate_per_lesson) || 0,
        discountedRate: enrollment.metadata?.discountedRatePerLesson 
          ? parseFloat(enrollment.metadata.discountedRatePerLesson)
          : (parseFloat(enrollment.rate_per_lesson) || 0),
        discountPercent: parseFloat(enrollment.term_discount_percent) || 0,
        totalPaid: historyResult.rows.reduce((sum, h) => sum + parseFloat(h.amount_charged || 0), 0)
      } : null,
      monthlyBillingDetails: enrollment.payment_type === 'monthly' ? {
        nextChargeDate: nextChargeDate,
        nextChargeAmount: nextChargeAmount,
        lessonsInNextCharge: lessonsInNextCharge,
        ratePerLesson: parseFloat(enrollment.rate_per_lesson) || parseFloat(enrollment.metadata?.ratePerLesson) || 0,
        totalPaid: historyResult.rows.reduce((sum, h) => sum + parseFloat(h.amount_charged || 0), 0)
      } : null
    });
  } catch (error) {
    logger.error({ err: error }, 'Error fetching student billing:');
    res.status(500).json({
      error: 'Failed to fetch student billing data',
      message: error.message
    });
  }
}));

/**
 * GET /api/subscriptions/billing-overview
 * Returns summary statistics for the billing dashboard
 */
router.get('/billing-overview', auth, asyncHandler(async (req, res) => {
  try {
    const locationPool = req.locationPool || pool;

    const cacheKey = 'subscriptions:billing-overview';

    const overview = await cache.getOrSet(cacheKey, async () => {
      // Parallelize all independent queries
      const [
        activeResult,
        failedResult,
        failedPaymentsResult,
        byTypeResult
      ] = await Promise.all([
        locationPool.query(
          `SELECT COUNT(*) as count FROM subscription_enrollments WHERE status = 'active'`
        ),
        locationPool.query(
          `SELECT COUNT(*) as count FROM subscription_enrollments WHERE status = 'failed'`
        ),
        locationPool.query(
          `SELECT COUNT(*) as count FROM subscription_billing_history WHERE status = 'failed'`
        ),
        locationPool.query(
          `SELECT payment_type, COUNT(*) as count, SUM(total_lessons_remaining) as lessons_remaining
           FROM subscription_enrollments
           WHERE status = 'active'
           GROUP BY payment_type`
        )
      ]);

      // Calculate date ranges
      const currentMonth = new Date();
      currentMonth.setDate(1);
      currentMonth.setHours(0, 0, 0, 0);

      const nextMonth = new Date();
      nextMonth.setMonth(nextMonth.getMonth() + 1);
      nextMonth.setDate(1);

      const thirtyDaysAgo = new Date();
      thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);

      // Parallelize remaining queries
      const [
        creditedThisMonthResult,
        totalPaidResult,
        upcomingRevenueResult,
        recentActivityResult
      ] = await Promise.all([
        locationPool.query(
          `SELECT COALESCE(SUM(amount_charged), 0) as total
           FROM subscription_billing_history
           WHERE status = 'succeeded'
           AND billing_month >= $1`,
          [currentMonth.toISOString().split('T')[0]]
        ),
        locationPool.query(
          `SELECT COALESCE(SUM(amount_charged), 0) as total
           FROM subscription_billing_history
           WHERE status = 'succeeded'`
        ),
        locationPool.query(
          `SELECT
             COALESCE(SUM(
               CASE
                 WHEN se.payment_type = 'monthly' THEN
                   COALESCE(tbc.rate_per_lesson::numeric, 0) *
                   COALESCE(
                     (SELECT COUNT(*) FROM jsonb_array_elements_text(tbc.class_dates::jsonb) as d
                      WHERE d::date >= $1 AND d::date < $2),
                     0
                   )
                 ELSE 0
               END
             ), 0) as upcoming_revenue
           FROM subscription_enrollments se
           LEFT JOIN term_billing_configs tbc ON se.service_id = tbc.service_id AND tbc.is_active = true
           WHERE se.status = 'active' AND se.payment_type = 'monthly'`,
          [nextMonth.toISOString().split('T')[0], new Date(nextMonth.getFullYear(), nextMonth.getMonth() + 1, 1).toISOString().split('T')[0]]
        ),
        locationPool.query(
          `SELECT
             COUNT(CASE WHEN status = 'succeeded' THEN 1 END) as successful,
             COUNT(CASE WHEN status = 'failed' THEN 1 END) as failed,
             COUNT(CASE WHEN status = 'pending' THEN 1 END) as pending,
             COALESCE(SUM(CASE WHEN status = 'succeeded' THEN amount_charged ELSE 0 END), 0) as total_collected
           FROM subscription_billing_history
           WHERE created_at >= $1`,
          [thirtyDaysAgo.toISOString()]
        )
      ]);

      const byType = {};
      for (const row of byTypeResult.rows) {
        byType[row.payment_type] = {
          count: parseInt(row.count),
          lessonsRemaining: parseInt(row.lessons_remaining) || 0
        };
      }

      return {
        activeSubscriptions: parseInt(activeResult.rows[0].count),
        failedSubscriptions: parseInt(failedResult.rows[0].count),
        failedPayments: parseInt(failedPaymentsResult.rows[0].count),
        creditedThisMonth: parseFloat(creditedThisMonthResult.rows[0].total),
        totalPaidAllTime: parseFloat(totalPaidResult.rows[0].total),
        upcomingRevenue: parseFloat(upcomingRevenueResult.rows[0].upcoming_revenue),
        byPaymentType: byType,
        recentActivity: {
          successful: parseInt(recentActivityResult.rows[0].successful),
          failed: parseInt(recentActivityResult.rows[0].failed),
          pending: parseInt(recentActivityResult.rows[0].pending),
          totalCollected: parseFloat(recentActivityResult.rows[0].total_collected)
        }
      };
    }, 60); // 60 second TTL

    res.json(overview);
  } catch (error) {
    logger.error({ err: error }, 'Error fetching billing overview:');
    res.status(500).json({
      error: 'Failed to fetch billing overview',
      message: error.message
    });
  }
}));

/**
 * GET /api/subscriptions/upcoming-charges
 * Returns upcoming charges for the next 3 months with detailed breakdown
 */
router.get('/upcoming-charges', auth, asyncHandler(async (req, res) => {
  try {
    const locationPool = req.locationPool || pool;

    const cacheKey = 'subscriptions:upcoming-charges';

    const upcomingChargesData = await cache.getOrSet(cacheKey, async () => {
      // Get all active monthly subscriptions with their configs
      const enrollmentsResult = await locationPool.query(
      `SELECT 
         se.*,
         tbc.term_name,
         tbc.rate_per_lesson,
         tbc.class_dates,
         tbc.lessons_per_month,
         c.first_name as client_first_name,
         c.last_name as client_last_name,
         s.name as service_name
       FROM subscription_enrollments se
       LEFT JOIN term_billing_configs tbc ON se.service_id = tbc.service_id AND tbc.is_active = true
       LEFT JOIN clients c ON c.client_id::text = se.client_id::text
       LEFT JOIN "Services" s ON s."serviceId" = se.service_id
       WHERE se.status = 'active'
       ORDER BY se.service_id, se.client_id`
    );
    
    const upcomingCharges = [];
    const now = new Date();
    
    // Calculate charges for next 3 months
    for (let monthOffset = 0; monthOffset < 3; monthOffset++) {
      const targetMonth = new Date(now.getFullYear(), now.getMonth() + monthOffset, 1);
      const targetMonthEnd = new Date(now.getFullYear(), now.getMonth() + monthOffset + 1, 0);
      const monthKey = `${targetMonth.getFullYear()}-${String(targetMonth.getMonth() + 1).padStart(2, '0')}`;
      const chargeDate = new Date(targetMonth.getFullYear(), targetMonth.getMonth() + 1, 1); // 1st of next month
      
      // For current month (offset 0), only include if we haven't passed the 1st
      if (monthOffset === 0 && now.getDate() > 1) {
        // Skip current month if we're past the 1st
        continue;
      }
      
      const monthCharges = {
        month: monthKey,
        monthName: targetMonth.toLocaleDateString('en-US', { month: 'long', year: 'numeric' }),
        chargeDate: chargeDate.toISOString().split('T')[0],
        chargeDateFormatted: chargeDate.toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' }),
        subscriptions: [],
        totalAmount: 0,
        totalLessons: 0
      };
      
      for (const enrollment of enrollmentsResult.rows) {
        // Only include monthly subscriptions in upcoming charges
        if (enrollment.payment_type !== 'monthly') continue;
        
        // Parse class_dates
        let classDates = enrollment.class_dates;
        if (typeof classDates === 'string') {
          try {
            classDates = JSON.parse(classDates);
          } catch (e) {
            classDates = [];
          }
        }
        if (!Array.isArray(classDates)) classDates = [];
        
        // Count lessons in this month
        const lessonsInMonth = classDates.filter(dateStr => {
          const date = new Date(dateStr);
          return date >= targetMonth && date <= targetMonthEnd;
        }).length;
        
        if (lessonsInMonth === 0) continue;
        
        const ratePerLesson = parseFloat(enrollment.rate_per_lesson) || 0;
        const amount = lessonsInMonth * ratePerLesson;
        
        // Parse metadata for additional info
        let metadata = {};
        try {
          metadata = typeof enrollment.metadata === 'string' 
            ? JSON.parse(enrollment.metadata) 
            : (enrollment.metadata || {});
        } catch (e) {
          metadata = {};
        }
        
        const clientName = enrollment.client_first_name && enrollment.client_last_name
          ? `${enrollment.client_first_name} ${enrollment.client_last_name}`
          : metadata.parentName || `Client ${enrollment.client_id}`;
        
        monthCharges.subscriptions.push({
          enrollmentId: enrollment.id,
          serviceId: enrollment.service_id,
          serviceName: enrollment.service_name || enrollment.term_name || `Service ${enrollment.service_id}`,
          clientId: enrollment.client_id,
          clientName: clientName,
          clientEmail: metadata.parentEmail || null,
          lessonsCount: lessonsInMonth,
          ratePerLesson: ratePerLesson,
          amount: amount,
          stripeSubscriptionId: enrollment.stripe_subscription_id
        });
        
        monthCharges.totalAmount += amount;
        monthCharges.totalLessons += lessonsInMonth;
      }
      
      // Only add month if there are charges
      if (monthCharges.subscriptions.length > 0) {
        upcomingCharges.push(monthCharges);
      }
    }

    return {
      upcomingCharges: upcomingCharges,
      generatedAt: new Date().toISOString()
    };
    }, 60); // 60 second TTL

    res.json(upcomingChargesData);
  } catch (error) {
    logger.error({ err: error }, 'Error fetching upcoming charges:');
    res.status(500).json({
      error: 'Failed to fetch upcoming charges',
      message: error.message
    });
  }
}));

/**
 * GET /api/subscriptions/reconciliation
 * Returns payment-to-credit request mapping for reconciliation view
 */
router.get('/reconciliation', auth, asyncHandler(async (req, res) => {
  try {
    const locationPool = req.locationPool || pool;
    const { startDate, endDate, status } = req.query;

    // Default to last 60 days if no date range provided
    const defaultStartDate = new Date();
    defaultStartDate.setDate(defaultStartDate.getDate() - 60);

    const filterStartDate = startDate || defaultStartDate.toISOString().split('T')[0];
    const filterEndDate = endDate || new Date().toISOString().split('T')[0];

    const cacheKey = `subscriptions:reconciliation:${filterStartDate}:${filterEndDate}:${status || 'all'}`;

    const reconciliationData = await cache.getOrSet(cacheKey, async () => {
    
    // Get billing history with enrollment and client info
    let query = `
      SELECT 
        sbh.*,
        se.client_id,
        se.service_id,
        se.payment_type,
        se.stripe_customer_id,
        se.stripe_subscription_id,
        c.first_name as client_first_name,
        c.last_name as client_last_name,
        c.email as client_email,
        s.name as service_name,
        tbc.term_name
      FROM subscription_billing_history sbh
      JOIN subscription_enrollments se ON sbh.enrollment_id = se.id
      LEFT JOIN clients c ON c.client_id::text = se.client_id::text
      LEFT JOIN "Services" s ON s."serviceId" = se.service_id
      LEFT JOIN term_billing_configs tbc ON se.service_id = tbc.service_id AND tbc.is_active = true
      WHERE sbh.billing_month >= $1 AND sbh.billing_month <= $2
    `;
    
    const params = [filterStartDate, filterEndDate];
    
    if (status && status !== 'all') {
      query += ` AND sbh.status = $3`;
      params.push(status);
    }
    
    query += ` ORDER BY sbh.billing_month DESC, sbh.created_at DESC`;
    
    const result = await locationPool.query(query, params);
    
    // Process results to extract credit request info from metadata
    const reconciliationData = result.rows.map(row => {
      let metadata = {};
      try {
        metadata = typeof row.metadata === 'string' 
          ? JSON.parse(row.metadata) 
          : (row.metadata || {});
      } catch (e) {
        metadata = {};
      }
      
      // Check for credit request info in metadata
      const creditRequestId = metadata.creditRequestId || null;
      const creditRequestIds = metadata.creditRequestIds || [];
      
      // Get the latest credit request info if it's an array
      let latestCreditRequest = null;
      if (creditRequestIds.length > 0) {
        latestCreditRequest = creditRequestIds[creditRequestIds.length - 1];
      }
      
      const clientName = row.client_first_name && row.client_last_name
        ? `${row.client_first_name} ${row.client_last_name}`
        : `Client ${row.client_id}`;
      
      return {
        billingHistoryId: row.id,
        enrollmentId: row.enrollment_id,
        billingMonth: row.billing_month,
        lessonsCount: row.lessons_count,
        amountCharged: parseFloat(row.amount_charged),
        stripeInvoiceId: row.stripe_invoice_id,
        stripePaymentIntentId: row.stripe_payment_intent_id,
        status: row.status,
        retryAttempt: row.retry_attempt,
        billedAt: row.billed_at,
        createdAt: row.created_at,
        
        // Enrollment info
        clientId: row.client_id,
        clientName: clientName,
        clientEmail: row.client_email,
        serviceId: row.service_id,
        serviceName: row.service_name || row.term_name || `Service ${row.service_id}`,
        paymentType: row.payment_type,
        stripeCustomerId: row.stripe_customer_id,
        stripeSubscriptionId: row.stripe_subscription_id,
        
        // Credit request info
        creditRequestId: creditRequestId || (latestCreditRequest?.creditRequestId) || null,
        creditRequestStatus: creditRequestId || latestCreditRequest ? 'created' : 'missing',
        creditRequestAmount: latestCreditRequest?.amount || null,
        
        // Flag for missing credit request
        hasCreditRequest: !!(creditRequestId || latestCreditRequest),
        needsAttention: row.status === 'succeeded' && !(creditRequestId || latestCreditRequest)
      };
    });
    
      // Calculate summary stats
      const summary = {
        total: reconciliationData.length,
        succeeded: reconciliationData.filter(r => r.status === 'succeeded').length,
        failed: reconciliationData.filter(r => r.status === 'failed').length,
        pending: reconciliationData.filter(r => r.status === 'pending').length,
        withCreditRequest: reconciliationData.filter(r => r.hasCreditRequest).length,
        missingCreditRequest: reconciliationData.filter(r => r.needsAttention).length,
        totalAmount: reconciliationData.reduce((sum, r) => sum + r.amountCharged, 0)
      };

      return {
        reconciliation: reconciliationData,
        summary: summary,
        dateRange: {
          startDate: filterStartDate,
          endDate: filterEndDate
        }
      };
    }, 60); // 60 second TTL

    res.json(reconciliationData);
  } catch (error) {
    logger.error({ err: error }, 'Error fetching reconciliation data:');
    res.status(500).json({
      error: 'Failed to fetch reconciliation data',
      message: error.message
    });
  }
}));

/**
 * GET /api/subscriptions/failed-payments
 * Returns failed payments that need attention
 */
router.get('/failed-payments', auth, asyncHandler(async (req, res) => {
  try {
    const locationPool = req.locationPool || pool;
    const { resolved } = req.query;

    const cacheKey = `subscriptions:failed-payments:${resolved || 'all'}`;

    const failedPaymentsData = await cache.getOrSet(cacheKey, async () => {
      // Parallelize independent queries
      const [failedBillingResult, failureDetailsResult] = await Promise.all([
        locationPool.query(
          `SELECT
             sbh.*,
             se.client_id,
             se.service_id,
             se.payment_type,
             se.stripe_customer_id,
             se.stripe_subscription_id,
             se.status as enrollment_status,
             c.first_name as client_first_name,
             c.last_name as client_last_name,
             c.email as client_email,
             c.phone as client_phone,
             s.name as service_name,
             tbc.term_name
           FROM subscription_billing_history sbh
           JOIN subscription_enrollments se ON sbh.enrollment_id = se.id
           LEFT JOIN clients c ON c.client_id::text = se.client_id::text
           LEFT JOIN "Services" s ON s."serviceId" = se.service_id
           LEFT JOIN term_billing_configs tbc ON se.service_id = tbc.service_id AND tbc.is_active = true
           WHERE sbh.status = 'failed'
           ORDER BY sbh.created_at DESC`
        ),
        locationPool.query(
          `SELECT * FROM subscription_payment_failures
           WHERE resolved = $1
           ORDER BY created_at DESC`,
          [resolved === 'true']
        )
      ]);
    
    // Create a map of failure details by billing_history_id
    const failureDetailsMap = new Map();
    for (const failure of failureDetailsResult.rows) {
      if (failure.billing_history_id) {
        failureDetailsMap.set(failure.billing_history_id, failure);
      }
    }
    
    const failedPayments = failedBillingResult.rows.map(row => {
      let metadata = {};
      try {
        metadata = typeof row.metadata === 'string' 
          ? JSON.parse(row.metadata) 
          : (row.metadata || {});
      } catch (e) {
        metadata = {};
      }
      
      const failureDetails = failureDetailsMap.get(row.id);
      
      const clientName = row.client_first_name && row.client_last_name
        ? `${row.client_first_name} ${row.client_last_name}`
        : metadata.parentName || `Client ${row.client_id}`;
      
      return {
        billingHistoryId: row.id,
        enrollmentId: row.enrollment_id,
        billingMonth: row.billing_month,
        lessonsCount: row.lessons_count,
        amountDue: parseFloat(row.amount_charged),
        retryAttempt: row.retry_attempt || 0,
        createdAt: row.created_at,
        
        // Client info
        clientId: row.client_id,
        clientName: clientName,
        clientEmail: row.client_email || metadata.parentEmail,
        clientPhone: row.client_phone || metadata.parentPhone,
        
        // Service info
        serviceId: row.service_id,
        serviceName: row.service_name || row.term_name || `Service ${row.service_id}`,
        paymentType: row.payment_type,
        enrollmentStatus: row.enrollment_status,
        
        // Stripe info
        stripeCustomerId: row.stripe_customer_id,
        stripeSubscriptionId: row.stripe_subscription_id,
        stripeInvoiceId: row.stripe_invoice_id,
        
        // Failure details
        failureReason: failureDetails?.failure_reason || metadata.failureReason || 'Payment failed',
        stripeErrorCode: failureDetails?.stripe_error_code || metadata.stripeErrorCode,
        stripeErrorMessage: failureDetails?.stripe_error_message || metadata.stripeErrorMessage,
        resolved: failureDetails?.resolved || false,
        resolvedAt: failureDetails?.resolved_at,
        emailSent: failureDetails?.email_sent || false,
        emailSentAt: failureDetails?.email_sent_at
      };
      });

      // Summary stats
      const summary = {
        total: failedPayments.length,
        totalAmount: failedPayments.reduce((sum, p) => sum + p.amountDue, 0),
        resolved: failedPayments.filter(p => p.resolved).length,
        unresolved: failedPayments.filter(p => !p.resolved).length,
        emailsSent: failedPayments.filter(p => p.emailSent).length
      };

      return {
        failedPayments: failedPayments,
        summary: summary
      };
    }, 60); // 60 second TTL

    res.json(failedPaymentsData);
  } catch (error) {
    logger.error({ err: error }, 'Error fetching failed payments:');
    res.status(500).json({
      error: 'Failed to fetch failed payments',
      message: error.message
    });
  }
}));

/**
 * POST /api/subscriptions/create-missing-credit/:billingHistoryId
 * Manually create a credit request for a payment that's missing one
 */
router.post('/create-missing-credit/:billingHistoryId', auth, asyncHandler(async (req, res) => {
  try {
    const { billingHistoryId } = req.params;
    const locationPool = req.locationPool || pool;
    
    // Get billing history record with enrollment info
    const billingResult = await locationPool.query(
      `SELECT 
         sbh.*,
         se.client_id,
         se.service_id,
         se.payment_type,
         tbc.term_name
       FROM subscription_billing_history sbh
       JOIN subscription_enrollments se ON sbh.enrollment_id = se.id
       LEFT JOIN term_billing_configs tbc ON se.service_id = tbc.service_id AND tbc.is_active = true
       WHERE sbh.id = $1`,
      [billingHistoryId]
    );
    
    if (billingResult.rows.length === 0) {
      return res.status(404).json({ error: 'Billing history record not found' });
    }
    
    const billing = billingResult.rows[0];
    
    // Check if payment was successful
    if (billing.status !== 'succeeded') {
      return res.status(400).json({ 
        error: 'Cannot create credit request for non-successful payment',
        status: billing.status
      });
    }
    
    // Parse existing metadata
    let metadata = {};
    try {
      metadata = typeof billing.metadata === 'string' 
        ? JSON.parse(billing.metadata) 
        : (billing.metadata || {});
    } catch (e) {
      metadata = {};
    }
    
    // Check if credit request already exists
    if (metadata.creditRequestId || (metadata.creditRequestIds && metadata.creditRequestIds.length > 0)) {
      return res.status(400).json({ 
        error: 'Credit request already exists for this payment',
        creditRequestId: metadata.creditRequestId || metadata.creditRequestIds[metadata.creditRequestIds.length - 1]?.creditRequestId
      });
    }
    
    // Create credit request in TutorCruncher
    const amountCharged = parseFloat(billing.amount_charged);
    const lessonsCount = billing.lessons_count || 1;
    const billingMonthFormatted = new Date(billing.billing_month).toLocaleDateString('en-US', { month: 'long', year: 'numeric' });
    
    logger.info(`💳 Creating missing credit request for client ${billing.client_id}: $${amountCharged}`);
    
    const creditRequestPayload = {
      amount: parseFloat(amountCharged.toFixed(2)),
      client: parseInt(billing.client_id),
      send_pfi: false, // Don't auto-raise — Stripe already collected payment, just create the accounting record
      description: `${billing.payment_type === 'monthly' ? 'Monthly Subscription' : 'Term'} Payment: $${amountCharged.toFixed(2)} for ${lessonsCount} lesson${lessonsCount !== 1 ? 's' : ''} (${billingMonthFormatted}) - Manual credit creation`
    };
    
    logger.info({ data: JSON.stringify(creditRequestPayload, null, 2) }, '📋 Credit request payload:');
    
    const creditResponse = await tutorCruncherAPI.post('/proforma-invoices/', creditRequestPayload);
    const creditRequestId = creditResponse.data.id;
    const creditRequestStatus = creditResponse.data.status;
    logger.info(`✅ Created credit request (proforma invoice) ID: ${creditRequestId}, Status: ${creditRequestStatus}`);
    
    // Wait for credit request to be fully created
    await new Promise(resolve => setTimeout(resolve, 1500));
    
    // Mark credit as paid immediately
    try {
      await tutorCruncherAPI.post(`/proforma-invoices/${creditRequestId}/take_payment/`, {
        amount: parseFloat(amountCharged.toFixed(2)),
        method: 'cash', // Record as externally paid — Stripe already collected the payment
        send_receipt: false
      });
      logger.info(`✅ Marked credit request ${creditRequestId} as paid: $${amountCharged}`);
    } catch (paymentError) {
      logger.error({ data: paymentError.response?.data || paymentError.message }, '⚠️ Failed to mark credit request as paid:');
      // Continue anyway - credit was created
    }
    
    // Update billing history metadata with credit request ID
    const updatedMetadata = {
      ...metadata,
      creditRequestId: creditRequestId,
      creditRequestCreatedAt: new Date().toISOString(),
      creditRequestManuallyCreated: true
    };
    
    await locationPool.query(
      `UPDATE subscription_billing_history 
       SET metadata = $1, updated_at = NOW()
       WHERE id = $2`,
      [JSON.stringify(updatedMetadata), billingHistoryId]
    );
    
    // Clear subscription caches
    await cache.clearCacheByPrefix('subscriptions');

    res.json({
      success: true,
      creditRequestId: creditRequestId,
      amount: amountCharged,
      clientId: billing.client_id,
      message: `Credit request ${creditRequestId} created and marked as paid`
    });
  } catch (error) {
    logger.error({ err: error }, 'Error creating missing credit request:');
    res.status(500).json({
      error: 'Failed to create credit request',
      message: error.response?.data || error.message
    });
  }
}));

/**
 * POST /api/subscriptions/mark-failure-resolved/:billingHistoryId
 * Mark a failed payment as resolved (manually handled)
 */
router.post('/mark-failure-resolved/:billingHistoryId', auth, asyncHandler(async (req, res) => {
  try {
    const { billingHistoryId } = req.params;
    const { resolution, notes } = req.body;
    const locationPool = req.locationPool || pool;
    
    // Update payment_failures table if record exists
    await locationPool.query(
      `UPDATE subscription_payment_failures 
       SET resolved = true, 
           resolved_at = NOW(),
           metadata = COALESCE(metadata, '{}'::jsonb) || $1::jsonb
       WHERE billing_history_id = $2`,
      [JSON.stringify({ resolution, notes, resolvedBy: 'admin' }), billingHistoryId]
    );
    
    // Update billing history metadata
    const billingResult = await locationPool.query(
      `SELECT metadata FROM subscription_billing_history WHERE id = $1`,
      [billingHistoryId]
    );
    
    if (billingResult.rows.length > 0) {
      let metadata = {};
      try {
        metadata = typeof billingResult.rows[0].metadata === 'string' 
          ? JSON.parse(billingResult.rows[0].metadata) 
          : (billingResult.rows[0].metadata || {});
      } catch (e) {
        metadata = {};
      }
      
      const updatedMetadata = {
        ...metadata,
        failureResolved: true,
        failureResolvedAt: new Date().toISOString(),
        failureResolution: resolution,
        failureNotes: notes
      };
      
      await locationPool.query(
        `UPDATE subscription_billing_history
         SET metadata = $1, updated_at = NOW()
         WHERE id = $2`,
        [JSON.stringify(updatedMetadata), billingHistoryId]
      );
    }

    // Clear subscription caches
    await cache.clearCacheByPrefix('subscriptions');

    res.json({
      success: true,
      message: 'Payment failure marked as resolved'
    });
  } catch (error) {
    logger.error({ err: error }, 'Error marking failure as resolved:');
    res.status(500).json({
      error: 'Failed to mark failure as resolved',
      message: error.message
    });
  }
}));

module.exports = router;
