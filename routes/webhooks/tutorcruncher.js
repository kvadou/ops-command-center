const express = require('express');
const router = express.Router();

const {
  pool,
  axios,
  tutorCruncherAPI,
  transporter,
  delay,
  rateLimitRetry
} = global;

const cache = require('../../utils/cache');
const { columnExists, tableExists } = require('../../utils/schema-cache');

// Import market mapping utility
const { getMarketFromLabels } = require('../../utils/market-mapping');
// Import markdown formatting utility
const { markdownToHtml, stripMarkdown } = require('../../utils/formatting');

// Import structured logger and webhook idempotency utilities
const { logger, logError } = require('../../utils/logger');
const TcPhotoImportService = require('../../services/tc-photo-import-service');
const {
  isEventProcessed,
  claimEvent,
  markEventCompleted,
  markEventFailed,
  generateTCEventId
} = require('../../utils/webhook-idempotency');

router.post('/', async (req, res) => {
  // Verify webhook authenticity via shared secret query parameter
  const webhookSecret = process.env.TUTORCRUNCHER_WEBHOOK_SECRET;
  if (!webhookSecret) {
    logger.error('TUTORCRUNCHER_WEBHOOK_SECRET not configured — rejecting webhook. Set this env var and update the TC webhook URL to include ?secret=YOUR_SECRET');
    return res.status(500).json({ error: 'Webhook secret not configured' });
  }
  if (req.query.secret !== webhookSecret) {
    logger.warn({ ip: req.ip, url: req.originalUrl }, 'TutorCruncher webhook rejected: invalid or missing secret');
    return res.status(401).json({ error: 'Unauthorized' });
  }

  // Respond immediately to prevent TutorCruncher timeout
  res.status(200).send('Webhook received');

  // Use location-aware database pool (set by locationDbMiddleware)
  // This ensures Westside/Eastside webhooks write to their respective databases
  const pool = req.locationPool || global.pool;
  const location = req.location || 'production';

  logger.info({ location, hostname: req.get('host') || req.hostname }, 'Processing TutorCruncher webhook');

  try {
    const events = req.body.events;
    if (!events || !Array.isArray(events)) {
      logger.warn({ location }, 'Invalid webhook payload: no events array');
      return;
    }

    // Process events asynchronously after responding
    for (const event of events) {
      // Generate unique event ID for idempotency
      const eventId = generateTCEventId(event);

      try {
        const action = event.action;
        const model = event.subject?.model;

        // Check if event was already processed (idempotency)
        if (eventId && await isEventProcessed(pool, eventId, 'tutorcruncher')) {
          logger.info({ eventId, action, model }, 'Skipping duplicate TutorCruncher event');
          continue;
        }

        // Claim the event for processing
        if (eventId) {
          const claimed = await claimEvent(pool, eventId, 'tutorcruncher', action, { model, location });
          if (!claimed) {
            logger.info({ eventId }, 'Event already claimed by another process');
            continue;
          }
        }

        logger.info({ action, model, location, eventId }, 'Processing TutorCruncher webhook event');
    if (model === 'Job') {
      const serviceData = event.subject;
      if (action === 'CHANGED_SERVICE_STATUS' && serviceData.status === 'gone-cold') {
        logger.info('Processing job gone-cold event for client status update');
        if (serviceData.rcrs && Array.isArray(serviceData.rcrs)) {
          const validRecipients = serviceData.rcrs.filter(r => r.paying_client);
          // Process recipients in parallel batches of 3 to respect TC rate limits
          const BATCH_SIZE = 3;
          for (let i = 0; i < validRecipients.length; i += BATCH_SIZE) {
            const batch = validRecipients.slice(i, i + BATCH_SIZE);
            await Promise.allSettled(batch.map(async (recipient) => {
              const clientId = recipient.paying_client;
              try {
                const clientResponse = await tutorCruncherAPI.get(`clients/${clientId}/`);
                const clientData = clientResponse.data;
                if (clientData.status !== 'dormant') {
                  const updatePayload = {
                    user: {
                      email: clientData.email,
                      last_name: clientData.last_name
                    },
                    status: 'dormant'
                  };
                  await tutorCruncherAPI.post('clients/', updatePayload);
                  logger.info({ clientEmail: clientData.user.email }, 'Updated client status to dormant due to job gone-cold');
                } else {
                  logger.info({ clientEmail: clientData.user.email }, 'Client is already dormant; no update needed');
                }
              } catch (error) {
                logger.error({ clientId, error: error.response?.data || error.message }, 'Error processing client for job gone-cold');
              }
            }));
          }
        }
      }
      switch (action) {
        case 'CREATED_A_SERVICE':
          await createOrUpdateService(serviceData, true);
          break;
        case 'EDITED_A_SERVICE':
        case 'CHANGED_SERVICE_STATUS':
        case 'ADDED_A_LABEL_TO_A_SERVICE':
        case 'CREATED_SERVICE':
        case 'EDITED_SERVICE':
          await createOrUpdateService(serviceData, false);
          break;
        case 'REMOVED_A_LABEL_FROM_A_SERVICE':
          await removeLabelFromService(serviceData);
          break;
        case 'DELETED_A_SERVICE':
        case 'CANCELLED_A_SERVICE':
          // Mark service as deleted or cancelled in database if needed
          logger.info('Service ${serviceData.id} was ${action.toLowerCase()}');
          // Note: We may want to mark as deleted in database, but services table may not have is_deleted column
          break;
        default:
          logger.info('Unhandled action type for service: ${action}');
      }

      // Clear services cache so manage-services page reflects changes immediately
      try {
        await cache.clearCacheByPrefix('services');
        logger.info({ serviceId: serviceData.id, action }, 'Cleared services cache after webhook');
      } catch (cacheErr) {
        logger.error({ serviceId: serviceData.id, error: cacheErr.message }, 'Failed to clear services cache after webhook');
      }
    } else if (model === 'Report') {
      logger.info('Processing Report model with action: ${action}');
      if (action === 'CREATED_REPORT') {
        await handleCreatedReport(event);
      } else if (action === 'EDITED_A_REPORT' || action === 'EDITED_REPORT') {
        // Reports can be edited - re-process to update client reports
        logger.info('Report ${event.subject?.id || \'unknown\'} was edited, re-processing...');
        await handleCreatedReport(event);
      } else if (action === 'DELETED_A_REPORT' || action === 'DELETED_REPORT') {
        // Mark report as deleted in database if needed
        logger.info('Report ${event.subject?.id || \'unknown\'} was deleted');
        // Note: client_reports table may need is_deleted column if we want to track deletions
      } else {
        logger.info('Unhandled action type for Report: ${action}');
      }
    } else if (model === 'Lesson') {
      const lesson = JSON.parse(JSON.stringify(event.subject));
      
      // Handle all appointment lifecycle events
      if (action === 'CREATED_AN_APPOINTMENT' || action === 'EDITED_AN_APPOINTMENT' || 
          action === 'CREATED_APPOINTMENT' || action === 'EDITED_APPOINTMENT' ||
          action === 'CANCELLED_AN_APPOINTMENT' || action === 'CANCELLED_APPOINTMENT') {
        await handleAppointmentWebhook(event);
      } else if (action === 'DELETED_AN_APPOINTMENT' || action === 'DELETED_APPOINTMENT') {
        // Mark appointment as deleted in database
        try {
          const appointmentId = lesson.id;
          if (appointmentId) {
            await pool.query(
              `UPDATE appointments SET is_deleted = TRUE, updated_at = NOW() WHERE appointment_id = $1`,
              [appointmentId]
            );
            logger.info('✅ Marked appointment ${appointmentId} as deleted');
          }
        } catch (error) {
          logger.error({ error: error.message }, '❌ Error marking appointment as deleted:');
        }
      } else {
        // For other actions, still call handleAppointmentWebhook to ensure data is synced
        await handleAppointmentWebhook(event);
      }
      
      if (action === 'MARKED_AN_APPOINTMENT_AS_COMPLETE') {
        logger.info('📋 Processing lesson complete event for appointment ${lesson.id} - checking for first paid lesson completion');
        
        // ============================================================================
        // AUTOMATIC ACCOUNTING GENERATION (Event-Driven Architecture)
        // ============================================================================
        // When a lesson is marked complete, automatically:
        // 1. Generate invoice for each paying client
        // 2. Generate payment order for each tutor
        // 3. Apply credit balance if available
        // 4. Check if credit requests needed (if auto-credit mode enabled)
        try {
          const InvoiceGenerationService = require('../../services/invoice-generation-service');
          const PaymentOrderGenerationService = require('../../services/payment-order-generation-service');
          const BalanceCalculationService = require('../../services/balance-calculation-service');
          const CreditRequestGenerationService = require('../../services/credit-request-generation-service');
          
          const invoiceService = new InvoiceGenerationService(pool);
          const paymentOrderService = new PaymentOrderGenerationService(pool);
          const balanceService = new BalanceCalculationService(pool);
          const creditRequestService = new CreditRequestGenerationService(pool);

          // Generate invoices for this completed lesson
          const invoiceResult = await invoiceService.generateInvoiceForCompletedLesson(lesson.id);
          logger.info({ lessonId: lesson.id, created: invoiceResult.created, updated: invoiceResult.updated, invoiceIds: invoiceResult.invoiceIds, errors: invoiceResult.errors }, '✅ Generated invoices for lesson');

          // Generate payment orders for this completed lesson
          const poResult = await paymentOrderService.generatePaymentOrderForCompletedLesson(lesson.id);
          logger.info({ lessonId: lesson.id, created: poResult.created, updated: poResult.updated, paymentOrderIds: poResult.paymentOrderIds, errors: poResult.errors }, '✅ Generated payment orders for lesson');

          // Apply credit balance to newly created invoices
          if (invoiceResult.invoiceIds && invoiceResult.invoiceIds.length > 0) {
            // Hoist settings query: fetch auto_credit_requests_enabled once before loop
            let autoCreditEnabled = false;
            try {
              const { rows: settingRows } = await pool.query(
                `SELECT setting_value FROM app_settings WHERE setting_key = $1`,
                ['auto_credit_requests_enabled']
              );
              autoCreditEnabled = settingRows.length > 0 &&
                settingRows[0].setting_value &&
                settingRows[0].setting_value.enabled === true;
            } catch (settingsError) {
              logger.error({ error: settingsError }, 'Error fetching auto_credit_requests_enabled setting');
            }

            const processedClientIds = new Set();

            // Process all invoices in parallel
            const creditResults = await Promise.allSettled(
              invoiceResult.invoiceIds.map(async (invoiceId) => {
                // Get invoice details
                const { rows: invoiceRows } = await pool.query(
                  `SELECT client_id, gross FROM invoices WHERE id = $1`,
                  [invoiceId]
                );

                if (invoiceRows.length > 0) {
                  const invoice = invoiceRows[0];
                  const clientId = invoice.client_id;

                  // Apply credit balance
                  const creditResult = await balanceService.deductCreditForInvoice(
                    invoiceId,
                    clientId,
                    invoice.gross,
                    'system'
                  );

                  if (creditResult.success) {
                    logger.info({ invoiceId, creditResult }, 'Applied credit to invoice');
                  }

                  return { invoiceId, clientId };
                }
                return null;
              })
            );

            // After all credits applied, process auto-credit requests sequentially per unique client
            // (dedup must be preserved since multiple invoices can belong to same client)
            if (autoCreditEnabled) {
              for (const result of creditResults) {
                if (result.status === 'fulfilled' && result.value) {
                  const { invoiceId, clientId } = result.value;
                  if (!processedClientIds.has(clientId)) {
                    processedClientIds.add(clientId);
                    try {
                      const checkResult = await creditRequestService.checkIfCreditRequestNeeded(clientId);
                      if (checkResult.needsCreditRequest) {
                        const crResult = await creditRequestService.generateCreditRequestForClient(clientId, {
                          createdBy: 'system'
                        });
                        if (crResult.created) {
                          logger.info({ creditRequestId: crResult.creditRequestId, clientId }, 'Auto-generated credit request');
                        }
                      }
                    } catch (autoCreditError) {
                      logger.error({ clientId, error: autoCreditError }, 'Error checking/generating auto credit request');
                      // Don't fail the webhook if auto-credit check fails
                    }
                  }
                } else if (result.status === 'rejected') {
                  logger.error({ error: result.reason }, 'Error applying credit to invoice');
                  // Don't fail the webhook if credit application fails
                }
              }
            } else {
              // Still log any rejected credit applications even when auto-credit is disabled
              for (const result of creditResults) {
                if (result.status === 'rejected') {
                  logger.error({ error: result.reason }, 'Error applying credit to invoice');
                }
              }
            }
          }
        } catch (accountingError) {
          logger.error({ err: accountingError }, 'Error in automatic accounting generation for lesson ${lesson.id}:');
          // Don't fail the webhook if accounting generation fails - log and continue
        }
        
        // Check if auto-sending is enabled for this environment
        const { getCurrentEnvironment } = require('../../config/environments');
        const envConfig = getCurrentEnvironment();

        // Also check database setting for lesson reports enabled
        let lessonReportsEnabled = true;
        try {
          const { rows: settingRows } = await pool.query(
            'SELECT setting_value FROM app_settings WHERE setting_key = $1',
            ['lesson_reports_enabled']
          );
          if (settingRows.length > 0 && settingRows[0].setting_value && typeof settingRows[0].setting_value.enabled === 'boolean') {
            lessonReportsEnabled = settingRows[0].setting_value.enabled;
          }
        } catch (settingError) {
          logger.error({ err: settingError }, 'Error checking lesson reports setting:');
          // Default to enabled if check fails
        }

        if (envConfig.autoSendClientReports && lessonReportsEnabled) {
          logger.info('✅ Auto-sending client reports is ENABLED for this environment');
          // Auto-send any pending client reports for this completed lesson
          try {
            await autoSendClientReportsForAppointment(lesson.id);
          } catch (error) {
            logger.error({ err: error }, 'Error auto-sending client reports for appointment ${lesson.id}:');
            // Don't fail the webhook if auto-sending fails
          }
        } else {
          if (!envConfig.autoSendClientReports) {
            logger.info('⏸️ Auto-sending client reports is DISABLED for this environment');
          } else if (!lessonReportsEnabled) {
            logger.info('⏸️ Auto-sending client reports is DISABLED via app settings toggle');
          }
        }
        
        if (lesson.rcras && Array.isArray(lesson.rcras)) {
          const validRecipients = lesson.rcras.filter(r => r.paying_client);

          // Process a single recipient's lesson-completion logic
          const processRecipient = async (recipient) => {
            const clientId = recipient.paying_client;
            try {
              const clientResponse = await tutorCruncherAPI.get(`clients/${clientId}/`);
              const clientData = clientResponse.data;
              if (clientData.status === 'dormant') {
                const updatePayload = {
                  user: {
                    email: clientData.email,
                    last_name: clientData.last_name
                  },
                  status: 'prospect'
                };
                await tutorCruncherAPI.post('clients/', updatePayload);
                logger.info({ clientEmail: clientData.user.email }, 'Updated client status to live due to lesson completion');
              } else {
                logger.info({ clientEmail: clientData.user.email, currentStatus: clientData.status }, 'Client status unchanged; no update required');
              }

              // Check if this is the first paid lesson completion after trial
              try {
                // Get client from local database
                const clientCheck = await pool.query(
                  `SELECT id, client_id, date_trial_first_lesson, first_paid_lesson_completed
                   FROM clients
                   WHERE client_id = $1`,
                  [clientId]
                );

                if (clientCheck.rows.length > 0) {
                  const client = clientCheck.rows[0];

                  // Only process if:
                  // 1. Client has completed trial (date_trial_first_lesson is set)
                  // 2. First paid lesson not already marked as completed
                  if (client.date_trial_first_lesson && !client.first_paid_lesson_completed) {
                    // Check if this is a trial lesson
                    const topic = lesson.topic || '';
                    const serviceLabels = lesson.service?.labels || [];
                    const labelNames = Array.isArray(serviceLabels) ? serviceLabels.map(l => l.name || l) : [];
                    const isTrialTopic = /trial/i.test(topic) || labelNames.some(label => /trial/i.test(label));

                    // Get charge rate for this client
                    const clientChargeRate = recipient.charge_rate ? parseFloat(recipient.charge_rate) : 0;
                    const { TRIAL_PRICE } = require('../../config/constants');
                    const isTrialPrice = clientChargeRate > 0 && clientChargeRate <= TRIAL_PRICE; // Trial lessons are at or below the trial promo price

                    // Skip if this is a trial lesson
                    if (!isTrialTopic && !isTrialPrice) {
                      // Wait a moment for appointment to be synced to database by handleAppointmentWebhook
                      await new Promise(resolve => setTimeout(resolve, 500));

                      // Count completed paid appointments after trial date for this client
                      // Exclude trial lessons by checking charge_rate > TRIAL_PRICE
                      // Include the current appointment in the count since it's now complete
                      const completedPaidLessons = await pool.query(
                        `SELECT COUNT(DISTINCT a.appointment_id) as count
                         FROM appointments a
                         JOIN appointment_recipients ar ON a.appointment_id = ar.appointment_id
                         WHERE CAST(ar.paying_client_id AS VARCHAR) = $1
                         AND a.start >= $2::timestamp
                         AND a.status IN ('complete', 'cancelled - chargeable')
                         AND (ar.charge_rate IS NULL OR ar.charge_rate::numeric > ${TRIAL_PRICE})`,
                        [String(clientId), client.date_trial_first_lesson]
                      );

                      const paidLessonCount = parseInt(completedPaidLessons.rows[0]?.count || 0);

                      // If this is their first paid lesson completion (count = 1 means this is the first)
                      if (paidLessonCount === 1) {
                        await pool.query(
                          `UPDATE clients
                           SET first_paid_lesson_completed = true, updated_at = NOW()
                           WHERE client_id = $1`,
                          [clientId]
                        );
                        logger.info({ clientId, clientEmail: clientData.email }, 'First paid lesson completed detected - updated first_paid_lesson_completed to true');

                        // Update prospect status to "Won" when first paid lesson is completed
                        try {
                          const ClientConversionService = require('../../services/client-conversion-service');
                          const service = new ClientConversionService(pool);

                          // Get client local ID
                          const clientLocalResult = await pool.query(
                            'SELECT id FROM clients WHERE client_id = $1',
                            [clientId]
                          );

                          if (clientLocalResult.rows.length > 0) {
                            const localClientId = clientLocalResult.rows[0].id;
                            await service.updateProspectStatus(
                              localClientId,
                              'Won',
                              'system',
                              'paid_lesson_completed',
                              'First paid lesson completed after trial'
                            );

                            // Archive the client (move to Won tab) - cached check
                            const hasArchivedAt = await columnExists(pool, 'clients', 'archived_at');

                            if (hasArchivedAt) {
                              await pool.query(
                                `UPDATE clients
                                 SET archived_at = NOW(), status = 'archived', updated_at = NOW()
                                 WHERE id = $1`,
                                [localClientId]
                              );
                              logger.info({ clientId }, 'Archived client after marking as Won');
                            }

                            logger.info({ clientId }, 'Updated prospect status to Won');
                          }
                        } catch (statusError) {
                          logger.error({ clientId, error: statusError.message }, 'Error updating prospect status');
                          // Don't fail the webhook if status update fails
                        }
                      } else if (paidLessonCount > 1) {
                        logger.info({ clientId, paidLessonCount }, 'Client already has completed paid lessons after trial - skipping first_paid_lesson_completed update');
                      } else {
                        logger.warn({ clientId }, 'No completed paid lessons found - appointment may not be synced yet');
                      }
                    } else {
                      // This is a trial lesson - check if trial was just completed
                      logger.info({ clientId, topic, clientChargeRate }, 'This appears to be a trial lesson');

                      // Check if this is the trial lesson completion (date matches date_trial_first_lesson)
                      if (client.date_trial_first_lesson) {
                        const trialDate = new Date(client.date_trial_first_lesson);
                        const lessonDate = new Date(lesson.start);
                        trialDate.setHours(0, 0, 0, 0);
                        lessonDate.setHours(0, 0, 0, 0);

                        // If this lesson date matches the trial date, update status to Trial Follow-Up
                        if (trialDate.getTime() === lessonDate.getTime()) {
                          try {
                            const ClientConversionService = require('../../services/client-conversion-service');
                            const service = new ClientConversionService(pool);

                            const localClientId = client.id;
                            const currentStatus = await pool.query(
                              'SELECT prospect_status FROM clients WHERE id = $1',
                              [localClientId]
                            );

                            const status = currentStatus.rows[0]?.prospect_status;

                            // Only update if currently in "Waiting for Trial" status
                            if (status === 'Waiting for Trial') {
                              await service.updateProspectStatus(
                                localClientId,
                                'Trial Follow-Up',
                                'system',
                                'trial_completed',
                                'Trial lesson completed - follow-up required'
                              );
                              logger.info({ clientId }, 'Updated prospect status to Trial Follow-Up after trial completion');
                            }
                          } catch (statusError) {
                            logger.error({ clientId, error: statusError.message }, 'Error updating prospect status');
                            // Don't fail the webhook if status update fails
                          }
                        }
                      }
                    }
                  } else {
                    if (!client.date_trial_first_lesson) {
                      logger.info({ clientId }, 'Skipping first paid lesson check - trial not yet completed');
                    } else if (client.first_paid_lesson_completed) {
                      logger.info({ clientId }, 'Skipping first paid lesson check - already marked as completed');
                    }
                  }
                }
              } catch (firstPaidError) {
                logger.error({ clientId, error: firstPaidError.message }, 'Error checking first paid lesson completion');
                // Don't fail the webhook if this check fails
              }
            } catch (error) {
              logger.error({ clientId, error: error.response?.data || error.message }, 'Error processing client for complete lesson');
            }
          };

          // Process recipients in parallel batches of 3 to respect TC rate limits
          const TC_BATCH_SIZE = 3;
          for (let i = 0; i < validRecipients.length; i += TC_BATCH_SIZE) {
            const batch = validRecipients.slice(i, i + TC_BATCH_SIZE);
            await Promise.allSettled(batch.map(processRecipient));
          }
        }
        if (lesson.service && lesson.service.id) {
          try {
            const serviceResponse = await tutorCruncherAPI.get(`services/${lesson.service.id}/`);
            const serviceData = serviceResponse.data;
            if (serviceData.status === 'gone-cold') {
              const updatePayload = {
                name: serviceData.name,
                dft_charge_rate: serviceData.dft_charge_rate,
                dft_contractor_rate: serviceData.dft_contractor_rate,
                status: 'in-progress'
              };
              await tutorCruncherAPI.put(`services/${lesson.service.id}/`, updatePayload);
              logger.info('Updated service ${lesson.service.id} status to in-progress due to lesson completion');
            }
          } catch (error) {
            logger.error({ error: error.response?.data || error.message }, 'Error updating service ${lesson.service?.id}:');
          }
        }
      }
      if (action === 'REMOVED_SR_FROM_APPOINTMENT') {
        logger.info('Processing removal of student from appointment');
        const appointmentId = lesson.id;
        const removedStudentId = lesson.removed_student_id;
        if (!appointmentId || !removedStudentId) {
          logger.error('Missing appointment or student ID');
          continue;
        }
        if (lesson.rcras && Array.isArray(lesson.rcras)) {
          lesson.rcras = lesson.rcras.filter(recipient => recipient.paying_client !== removedStudentId);
          try {
            await tutorCruncherAPI.put(`lessons/${appointmentId}/`, lesson);
            logger.info('Successfully removed student ${removedStudentId} from appointment ${appointmentId}');
          } catch (error) {
            logger.error({ error: error.response?.data || error.message }, 'Error updating appointment ${appointmentId}:');
          }
        }
      }
    } else if (model === 'Client') {
      const client = event.subject;
      const labels = client.labels || [];
      const nameIncludesSchool = /(School|Escuela|PS198|Foothill)/i.test(`${client.first_name || ''} ${client.last_name || ''}`);
      const applyClientSettings = async type => {
        let received_notifications = [];
        if (type === 'school') {
          received_notifications = ['invoice_reminders', 'invoices', 'apt_reminders', 'pfi_reminders', 'credit-requests', 'broadcasts', 'lesson_scheduled'];
        } else if (type === 'club') {
          received_notifications = ['invoice_reminders', 'apt_reminders', 'pfi_reminders', 'broadcasts', 'lesson_scheduled', 'low_balance_reminders'];
        } else {
          received_notifications = ['invoice_reminders', 'lesson_scheduled', 'pfi_reminders', 'broadcasts', 'apt_reminders'];
        }
        if (!client || !client.email) {
          logger.warn('Client ${client?.id ?? \'(unknown)\'} missing email; skipping notification settings');
          return;
        }
        const payload = {
          user: {
            email: client.email,
            last_name: client.last_name
          },
          received_notifications
        };
        try {
          await tutorCruncherAPI.post(`clients/${client.id}/`, payload);
          logger.info('âœ… Applied ${type} settings to client ID ${client.id} â€" matched label & name');
        } catch (err) {
          logger.error({ error: err.response?.data || err.message }, 'âŒ Failed to apply ${type} settings to client ID ${client.id}:');
        }
      };
      const labelIds = labels.map(l => l.id);
      const isSchool = labelIds.includes(289432) || labelIds.includes(289433) || labelIds.includes(289434);
      const isClub = labelIds.includes(277110) || labelIds.includes(277109);
      if (action === 'CREATED_A_CLIENT') {
        // Store client data in local database
        try {
          logger.info('💾 Storing new client ${client.id} in local database');
          logger.info({ data: JSON.stringify(client, null, 2) }, '🔍 Webhook payload for new client ${client.id}:');

          // Fetch complete client data from TutorCruncher API since webhook payload doesn't include labels
          // This matches the pattern used in EDITED_A_CLIENT handler
          logger.info('🔄 Fetching complete client data from TutorCruncher API for ${client.id}');
          const fullClientResponse = await tutorCruncherAPI.get(`clients/${client.id}/`);
          const fullClient = fullClientResponse.data;
          logger.info({ data: JSON.stringify(fullClient, null, 2) }, '📋 Complete client data for ${client.id}:');

          // Use full client data instead of webhook payload (which lacks labels, phone, etc.)
          // Fall back to webhook data if API call returns incomplete data
          const clientData = {
            ...client,
            ...fullClient,
            // Preserve webhook ID in case API returns different format
            id: client.id
          };

          // Calculate market from labels (now using full client data with labels)
          const market = getMarketFromLabels(clientData.labels || []);

          // Use location-aware pool (already set at top of handler)
          await pool.query(`
            INSERT INTO clients (
              client_id, title, first_name, last_name, email, mobile, phone,
              street, town, state, country, postcode, latitude, longitude,
              status, is_taxable, charge_via_branch, invoices_count, payment_pending, auto_charge,
              associated_admin_id, calendar_colour, invoice_balance, available_balance,
              pipeline_stage_id, pipeline_stage_name, pipeline_stage_colour, pipeline_stage_sort_index,
              timezone, photo, received_notifications, paid_recipients, labels, extra_attrs,
              associated_agent_id, associated_agent_name,
              market, tc_created_at, remote_last_updated, lead_type, created_at, updated_at
            )
            VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17, $18, $19, $20, $21, $22, $23, $24, $25, $26, $27, $28, $29, $30, $31, $32, $33, $34, $35, $36, $37, $38, $39, $40, NOW(), NOW())
            ON CONFLICT (client_id) DO UPDATE SET
              title = EXCLUDED.title,
              first_name = EXCLUDED.first_name,
              last_name = EXCLUDED.last_name,
              email = EXCLUDED.email,
              mobile = EXCLUDED.mobile,
              phone = EXCLUDED.phone,
              street = EXCLUDED.street,
              town = EXCLUDED.town,
              state = EXCLUDED.state,
              country = EXCLUDED.country,
              postcode = EXCLUDED.postcode,
              latitude = EXCLUDED.latitude,
              longitude = EXCLUDED.longitude,
              status = EXCLUDED.status,
              is_taxable = EXCLUDED.is_taxable,
              charge_via_branch = EXCLUDED.charge_via_branch,
              invoices_count = EXCLUDED.invoices_count,
              payment_pending = EXCLUDED.payment_pending,
              auto_charge = EXCLUDED.auto_charge,
              associated_admin_id = EXCLUDED.associated_admin_id,
              calendar_colour = EXCLUDED.calendar_colour,
              invoice_balance = EXCLUDED.invoice_balance,
              available_balance = EXCLUDED.available_balance,
              pipeline_stage_id = EXCLUDED.pipeline_stage_id,
              pipeline_stage_name = EXCLUDED.pipeline_stage_name,
              pipeline_stage_colour = EXCLUDED.pipeline_stage_colour,
              pipeline_stage_sort_index = EXCLUDED.pipeline_stage_sort_index,
              timezone = EXCLUDED.timezone,
              photo = EXCLUDED.photo,
              received_notifications = EXCLUDED.received_notifications,
              paid_recipients = EXCLUDED.paid_recipients,
              labels = EXCLUDED.labels,
              extra_attrs = EXCLUDED.extra_attrs,
              associated_agent_id = EXCLUDED.associated_agent_id,
              associated_agent_name = EXCLUDED.associated_agent_name,
              market = EXCLUDED.market,
              tc_created_at = EXCLUDED.tc_created_at,
              remote_last_updated = EXCLUDED.remote_last_updated,
              lead_type = COALESCE(clients.lead_type, EXCLUDED.lead_type),
              updated_at = NOW()
          `, [
            clientData.id,
            clientData.title || null,
            clientData.first_name,
            clientData.last_name,
            clientData.email,
            clientData.mobile || null,
            clientData.phone || null,
            clientData.street || null,
            clientData.town || null,
            clientData.state || null,
            clientData.country || null,
            clientData.postcode || null,
            clientData.latitude || null,
            clientData.longitude || null,
            'prospect', // Set new clients to prospect status
            clientData.is_taxable || false,
            clientData.charge_via_branch || false,
            clientData.invoices_count || 0,
            clientData.payment_pending || 0,
            clientData.auto_charge || false,
            clientData.associated_admin?.id || null,
            clientData.calendar_colour || null,
            clientData.invoice_balance || 0,
            clientData.available_balance || 0,
            clientData.pipeline_stage?.id || null,
            clientData.pipeline_stage?.name || null,
            clientData.pipeline_stage?.colour || null,
            clientData.pipeline_stage?.sort_index || null,
            clientData.timezone || null,
            clientData.photo || null,
            JSON.stringify(clientData.received_notifications || []),
            clientData.paid_recipients ? JSON.stringify(clientData.paid_recipients) : null,
            JSON.stringify(clientData.labels || []),
            JSON.stringify(clientData.extra_attrs || []),
            clientData.associated_agent?.id || null,
            clientData.associated_agent ? `${clientData.associated_agent.first_name} ${clientData.associated_agent.last_name}` : null,
            market,
            clientData.date_created || null,
            clientData.last_updated || null,
            'New Lead' // Default lead_type for all new clients
          ]);
          logger.info('✅ Stored client ${clientData.id} (${clientData.first_name} ${clientData.last_name}) in local database with ${(clientData.labels || []).length} labels');

          // Check for referral match suggestions (fire-and-forget, non-blocking)
          try {
            const ReferralService = require('../../services/referral-service');
            const referralService = new ReferralService(pool);
            const clientName = `${clientData.first_name || ''} ${clientData.last_name || ''}`.trim();
            const matches = await referralService.checkNewClientForMatch(
              String(clientData.id), clientName, clientData.email, clientData.mobile || clientData.phone
            );
            if (matches.length > 0) {
              logger.info({ clientId: clientData.id, matches: matches.length }, 'Referral auto-match suggestions found for new client');
            }
          } catch (refErr) {
            logger.warn({ error: refErr.message, clientId: clientData.id }, 'Non-critical: referral match check failed');
          }

          // Re-check school/club labels using full client data (webhook payload may have been empty)
          const fullLabelIds = (clientData.labels || []).map(l => l.id);
          const isSchoolFull = fullLabelIds.includes(289432) || fullLabelIds.includes(289433) || fullLabelIds.includes(289434);
          const isClubFull = fullLabelIds.includes(277110) || fullLabelIds.includes(277109);
          const clientNameLower = `${clientData.first_name} ${clientData.last_name}`.toLowerCase();
          const nameIncludesSchoolFull = clientNameLower.includes('school') || clientNameLower.includes('ps ') || clientNameLower.includes('elementary');

          if (isSchoolFull && nameIncludesSchoolFull) {
            await applyClientSettings('school');
          } else if (isClubFull) {
            await applyClientSettings('club');
          } else {
            await applyClientSettings('everyone');
          }
        } catch (error) {
          logger.error({ error: error.message }, '❌ Failed to store client ${client.id} in local database:');

          // Still try to apply settings using webhook data as fallback
          if (isSchool && nameIncludesSchool) {
            await applyClientSettings('school');
          } else if (isClub) {
            await applyClientSettings('club');
          } else {
            await applyClientSettings('everyone');
          }
        }
      }
      if (action === 'EDITED_A_CLIENT') {
        // Update client data in local database
        try {
          logger.info('💾 Updating client ${client.id} in local database');
          logger.info({ data: JSON.stringify(client, null, 2) }, '🔍 Webhook payload for client ${client.id}:');
          
          // Fetch complete client data from TutorCruncher API since webhook payload is incomplete
          logger.info('🔄 Fetching complete client data from TutorCruncher API for ${client.id}');
          const fullClientResponse = await tutorCruncherAPI.get(`clients/${client.id}/`);
          const fullClient = fullClientResponse.data;
          logger.info({ data: JSON.stringify(fullClient, null, 2) }, '📋 Complete client data for ${client.id}:');

          // Calculate market from labels
          const market = getMarketFromLabels(fullClient.labels || []);

          // Use location-aware pool (already set at top of handler)
          await pool.query(`
            INSERT INTO clients (
              client_id, title, first_name, last_name, email, mobile, phone,
              street, town, state, country, postcode, latitude, longitude,
              status, is_taxable, charge_via_branch, invoices_count, payment_pending, auto_charge,
              associated_admin_id, calendar_colour, invoice_balance, available_balance,
              pipeline_stage_id, pipeline_stage_name, pipeline_stage_colour, pipeline_stage_sort_index,
              timezone, photo, received_notifications, paid_recipients, labels, extra_attrs,
              associated_agent_id, associated_agent_name,
              market, tc_created_at, remote_last_updated, lead_type, created_at, updated_at
            )
            VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17, $18, $19, $20, $21, $22, $23, $24, $25, $26, $27, $28, $29, $30, $31, $32, $33, $34, $35, $36, $37, $38, $39, $40, NOW(), NOW())
            ON CONFLICT (client_id) DO UPDATE SET
              title = EXCLUDED.title,
              first_name = EXCLUDED.first_name,
              last_name = EXCLUDED.last_name,
              email = EXCLUDED.email,
              mobile = EXCLUDED.mobile,
              phone = EXCLUDED.phone,
              street = EXCLUDED.street,
              town = EXCLUDED.town,
              state = EXCLUDED.state,
              country = EXCLUDED.country,
              postcode = EXCLUDED.postcode,
              latitude = EXCLUDED.latitude,
              longitude = EXCLUDED.longitude,
              status = EXCLUDED.status,
              is_taxable = EXCLUDED.is_taxable,
              charge_via_branch = EXCLUDED.charge_via_branch,
              invoices_count = EXCLUDED.invoices_count,
              payment_pending = EXCLUDED.payment_pending,
              auto_charge = EXCLUDED.auto_charge,
              associated_admin_id = EXCLUDED.associated_admin_id,
              calendar_colour = EXCLUDED.calendar_colour,
              invoice_balance = EXCLUDED.invoice_balance,
              available_balance = EXCLUDED.available_balance,
              pipeline_stage_id = EXCLUDED.pipeline_stage_id,
              pipeline_stage_name = EXCLUDED.pipeline_stage_name,
              pipeline_stage_colour = EXCLUDED.pipeline_stage_colour,
              pipeline_stage_sort_index = EXCLUDED.pipeline_stage_sort_index,
              timezone = EXCLUDED.timezone,
              photo = EXCLUDED.photo,
              received_notifications = EXCLUDED.received_notifications,
              paid_recipients = EXCLUDED.paid_recipients,
              labels = EXCLUDED.labels,
              extra_attrs = EXCLUDED.extra_attrs,
              associated_agent_id = EXCLUDED.associated_agent_id,
              associated_agent_name = EXCLUDED.associated_agent_name,
              market = EXCLUDED.market,
              tc_created_at = EXCLUDED.tc_created_at,
              remote_last_updated = EXCLUDED.remote_last_updated,
              lead_type = COALESCE(clients.lead_type, EXCLUDED.lead_type),
              updated_at = NOW()
          `, [
            fullClient.id,
            fullClient.title || null,
            fullClient.first_name,
            fullClient.last_name,
            fullClient.email,
            fullClient.mobile || null,
            fullClient.phone || null,
            fullClient.street || null,
            fullClient.town || null,
            fullClient.state || null,
            fullClient.country || null,
            fullClient.postcode || null,
            fullClient.latitude || null,
            fullClient.longitude || null,
            fullClient.status || 'prospect', // Default to prospect if no status
            fullClient.is_taxable || false,
            fullClient.charge_via_branch || false,
            fullClient.invoices_count || 0,
            fullClient.payment_pending || 0,
            fullClient.auto_charge || false,
            fullClient.associated_admin?.id || null,
            fullClient.calendar_colour || null,
            fullClient.invoice_balance || 0,
            fullClient.available_balance || 0,
            fullClient.pipeline_stage?.id || null,
            fullClient.pipeline_stage?.name || null,
            fullClient.pipeline_stage?.colour || null,
            fullClient.pipeline_stage?.sort_index || null,
            fullClient.timezone || null,
            fullClient.photo || null,
            JSON.stringify(fullClient.received_notifications || []),
            fullClient.paid_recipients ? JSON.stringify(fullClient.paid_recipients) : null,
            JSON.stringify(fullClient.labels || []),
            JSON.stringify(fullClient.extra_attrs || []),
            fullClient.associated_agent?.id || null,
            fullClient.associated_agent ? `${fullClient.associated_agent.first_name} ${fullClient.associated_agent.last_name}` : null,
            market,
            fullClient.date_created || null,
            fullClient.last_updated || null,
            'New Lead' // Default lead_type for new clients (existing values preserved via COALESCE)
          ]);
          logger.info('✅ Updated client ${fullClient.id} (${fullClient.first_name} ${fullClient.last_name}) in local database');
        } catch (error) {
          logger.error({ error: error.message }, '❌ Failed to update client ${client.id} in local database:');
        }
      }
      if (action === 'DELETED_A_CLIENT') {
        // Remove client from local database
        try {
          logger.info('🗑️ Deleting client ${client.id} from local database');
          // Use location-aware pool (already set at top of handler)
          const result = await pool.query('DELETE FROM clients WHERE client_id = $1', [client.id]);
          if (result.rowCount > 0) {
            logger.info('✅ Deleted client ${client.id} (${client.first_name} ${client.last_name}) from local database');
          } else {
            logger.info('⚠️ Client ${client.id} not found in local database');
          }
        } catch (error) {
          logger.error({ error: error.message }, '❌ Failed to delete client ${client.id} from local database:');
        }
      }
      if (action === 'MOVED_PIPELINE_STAGE') {
        // Update client pipeline stage and status in local database
        try {
          logger.info('🔄 Pipeline stage moved for client ${client.id}: ${event.extra_msg}');
          logger.info({ data: JSON.stringify(client.pipeline_stage, null, 2) }, '🔍 Pipeline stage data:');
          
          // Fetch complete client data from TutorCruncher API to get current status
          logger.info('🔄 Fetching complete client data from TutorCruncher API for ${client.id}');
          const fullClientResponse = await tutorCruncherAPI.get(`clients/${client.id}/`);
          const fullClient = fullClientResponse.data;
          logger.info('📋 Client ${client.id} current status: ${fullClient.status}');
          
          // Calculate market from labels
          const market = getMarketFromLabels(fullClient.labels || []);
          
          // Use location-aware pool (already set at top of handler)
          await pool.query(`
            UPDATE clients 
            SET 
              pipeline_stage_id = $1,
              pipeline_stage_name = $2,
              pipeline_stage_colour = $3,
              pipeline_stage_sort_index = $4,
              status = $5,
              market = $6,
              remote_last_updated = $7,
              updated_at = NOW()
            WHERE client_id = $8
          `, [
            fullClient.pipeline_stage?.id || null,
            fullClient.pipeline_stage?.name || null,
            fullClient.pipeline_stage?.colour || null,
            fullClient.pipeline_stage?.sort_index || null,
            fullClient.status || 'prospect',
            market,
            fullClient.last_updated || null,
            client.id
          ]);
          
          logger.info('✅ Updated pipeline stage and status for client ${client.id} (${fullClient.first_name} ${fullClient.last_name}) to stage ${fullClient.pipeline_stage?.id} (${fullClient.pipeline_stage?.name}), status: ${fullClient.status}');
        } catch (error) {
          logger.error({ error: error.message }, '❌ Failed to update pipeline stage for client ${client.id}:');
        }
      }
      if (action === 'ADDED_A_LABEL_TO_A_USER') {
        // Update labels, status, and pipeline_stage in local database
        // (status and pipeline_stage can change when labels are added)
        try {
          logger.info('🏷️ Label added to client ${client.id}, updating local database');
          const fullClientResponse = await tutorCruncherAPI.get(`clients/${client.id}/`);
          const fullClient = fullClientResponse.data;
          const market = getMarketFromLabels(fullClient.labels || []);
          
          await pool.query(`
            UPDATE clients 
            SET 
              labels = $1,
              market = $2,
              status = $3,
              pipeline_stage_id = $4,
              pipeline_stage_name = $5,
              pipeline_stage_colour = $6,
              pipeline_stage_sort_index = $7,
              remote_last_updated = $8,
              updated_at = NOW()
            WHERE client_id = $9
          `, [
            JSON.stringify(fullClient.labels || []),
            market,
            fullClient.status || 'prospect',
            fullClient.pipeline_stage?.id || null,
            fullClient.pipeline_stage?.name || null,
            fullClient.pipeline_stage?.colour || null,
            fullClient.pipeline_stage?.sort_index || null,
            fullClient.last_updated || null,
            client.id
          ]);
          logger.info('✅ Updated labels, status, and pipeline_stage for client ${client.id}');
        } catch (err) {
          logger.error({ error: err.message }, '❌ Failed to update labels for client ${client.id}:');
        }
        
        if (isSchool && nameIncludesSchool) {
          await applyClientSettings('school');
        } else if (isClub) {
          await applyClientSettings('club');
        } else {
          logger.info('⚠️ Skipped applying school settings for client ${client.id} — label or name condition not met');
        }
      }
      if (action === 'REMOVED_A_LABEL_FROM_A_USER') {
        const clientId = client.id;
        try {
          const freshClient = await tutorCruncherAPI.get(`clients/${clientId}/`);
          const labelIds = freshClient.data.labels.map(l => l.id);
          const isStillSchool = labelIds.some(id => [289432, 289433, 289434].includes(id));
          const isStillClub = labelIds.some(id => [277110, 277109].includes(id));
          
          // Update labels, status, and pipeline_stage in local database
          // (status and pipeline_stage can change when labels are removed)
          const market = getMarketFromLabels(freshClient.data.labels || []);
          await pool.query(`
            UPDATE clients 
            SET 
              labels = $1,
              market = $2,
              status = $3,
              pipeline_stage_id = $4,
              pipeline_stage_name = $5,
              pipeline_stage_colour = $6,
              pipeline_stage_sort_index = $7,
              remote_last_updated = $8,
              updated_at = NOW()
            WHERE client_id = $9
          `, [
            JSON.stringify(freshClient.data.labels || []),
            market,
            freshClient.data.status || 'prospect',
            freshClient.data.pipeline_stage?.id || null,
            freshClient.data.pipeline_stage?.name || null,
            freshClient.data.pipeline_stage?.colour || null,
            freshClient.data.pipeline_stage?.sort_index || null,
            freshClient.data.last_updated || null,
            clientId
          ]);
          logger.info('✅ Updated labels, status, and pipeline_stage for client ${clientId} after label removal');
          
          if (!isStillSchool && !isStillClub) {
            await applyClientSettings('everyone');
            logger.info('🧹 Client ${clientId} has no school/club labels after removal — reverted to default notifications');
          } else {
            logger.info('🟡 Client ${clientId} still has school/club labels — no fallback applied');
          }
        } catch (err) {
          logger.error({ error: err.response?.data || err.message }, '❌ Failed to refetch client ${clientId}:');
        }
      }

      // Balance Adjustment handler — captures credits/corrections for tracking
      if (action === 'BALANCE_ADJUSTMENT') {
        const extraMsg = event.extra_msg || '';
        const amountMatch = extraMsg.match(/\$?([\d,]+\.?\d*)/);
        const amount = amountMatch ? parseFloat(amountMatch[1].replace(',', '')) : 0;
        const tcType = extraMsg.toLowerCase().includes('bonus credit') ? 'bonus_credit' : 'balance_correction';

        try {
          const hasTable = await tableExists('client_balance_adjustments');
          if (hasTable) {
            await pool.query(`
              INSERT INTO client_balance_adjustments
                (client_id, client_first_name, client_last_name, amount, tc_type, description, actor_name, actor_id, tc_webhook_timestamp)
              VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
            `, [
              client.id,
              client.first_name,
              client.last_name,
              amount,
              tcType,
              extraMsg,
              event.actor?.name,
              event.actor?.id,
              event.timestamp
            ]);
            logger.info({ clientId: client.id, amount, tcType }, '💰 Recorded balance adjustment for client ${client.first_name} ${client.last_name}');
          }
        } catch (err) {
          logger.error({ error: err.message, clientId: client.id }, '❌ Failed to record balance adjustment');
        }
      }

    } else if (model === 'Contractor' || model === 'Tutor') {
      logger.info('Processing Contractor/Tutor model with action: ${action}');
      const contractor = event.subject;
      
      if (action === 'CREATED_A_CONTRACTOR') {
        logger.info('🆕 New contractor created: ${contractor.first_name} ${contractor.last_name} (ID: ${contractor.id})');
        try {
          // Fetch complete contractor data from TutorCruncher API
          const response = await tutorCruncherAPI.get(`/contractors/${contractor.id}/`);
          const fullContractor = response.data;
          
          // Insert contractor into local database
          await pool.query(`
            INSERT INTO contractors (
              contractor_id, latitude, longitude, date_created, first_name, last_name,
              email, mobile, phone, street, state, town, country, postcode, timezone,
              title, photo, status, default_rate, qualifications, skills, institutions,
              received_notifications, review_rating, review_duration, calendar_colour,
              labels, extra_attrs, work_done_details, created_at, updated_at
            )
            VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17, $18, $19, $20, $21, $22, $23, $24, $25, $26, $27, $28, $29, NOW(), NOW())
            ON CONFLICT (contractor_id) DO UPDATE SET
              latitude = EXCLUDED.latitude,
              longitude = EXCLUDED.longitude,
              date_created = EXCLUDED.date_created,
              first_name = EXCLUDED.first_name,
              last_name = EXCLUDED.last_name,
              email = EXCLUDED.email,
              mobile = EXCLUDED.mobile,
              phone = EXCLUDED.phone,
              street = EXCLUDED.street,
              state = EXCLUDED.state,
              town = EXCLUDED.town,
              country = EXCLUDED.country,
              postcode = EXCLUDED.postcode,
              timezone = EXCLUDED.timezone,
              title = EXCLUDED.title,
              photo = EXCLUDED.photo,
              status = EXCLUDED.status,
              default_rate = EXCLUDED.default_rate,
              qualifications = EXCLUDED.qualifications,
              skills = EXCLUDED.skills,
              institutions = EXCLUDED.institutions,
              received_notifications = EXCLUDED.received_notifications,
              review_rating = EXCLUDED.review_rating,
              review_duration = EXCLUDED.review_duration,
              calendar_colour = EXCLUDED.calendar_colour,
              labels = EXCLUDED.labels,
              extra_attrs = EXCLUDED.extra_attrs,
              work_done_details = EXCLUDED.work_done_details,
              updated_at = NOW()
          `, [
            fullContractor.id,
            fullContractor.latitude ? parseFloat(fullContractor.latitude) : null,
            fullContractor.longitude ? parseFloat(fullContractor.longitude) : null,
            fullContractor.date_created ? new Date(fullContractor.date_created) : null,
            fullContractor.first_name,
            fullContractor.last_name,
            fullContractor.email,
            fullContractor.mobile,
            fullContractor.phone,
            fullContractor.street,
            fullContractor.state,
            fullContractor.town,
            fullContractor.country,
            fullContractor.postcode,
            fullContractor.timezone,
            fullContractor.title,
            fullContractor.photo,
            fullContractor.status,
            fullContractor.default_rate ? parseFloat(fullContractor.default_rate) : null,
            JSON.stringify(fullContractor.qualifications || []),
            JSON.stringify(fullContractor.skills || []),
            JSON.stringify(fullContractor.institutions || []),
            JSON.stringify(fullContractor.received_notifications || []),
            fullContractor.review_rating ? parseFloat(fullContractor.review_rating) : null,
            fullContractor.review_duration || null,
            fullContractor.calendar_colour,
            JSON.stringify(fullContractor.labels || []),
            JSON.stringify(fullContractor.extra_attrs || []),
            JSON.stringify(fullContractor.work_done_details || {})
          ]);

          // Invalidate contractor caches
          await cache.clearCacheByPrefix('contractors');

          logger.info('✅ Successfully added contractor ${fullContractor.first_name} ${fullContractor.last_name} to local database');

          // Auto-import TC photo to Cloudinary (fire-and-forget)
          if (fullContractor.photo) {
            const photoService = new TcPhotoImportService(pool);
            photoService.importPhoto(fullContractor.id, fullContractor.photo, {
              firstName: fullContractor.first_name,
              lastName: fullContractor.last_name,
            }).catch(err => {
              logger.warn({ contractorId: fullContractor.id, error: err.message }, 'TC photo auto-import failed (non-blocking)');
            });
          }
        } catch (error) {
          logger.error({ error: error.message }, '❌ Failed to add contractor ${contractor.id} to local database:');
        }
      } else if (action === 'EDITED_A_CONTRACTOR' || action === 'CHANGED_CONTRACTOR_STATUS' || action === 'ADDED_A_LABEL_TO_A_CONTRACTOR' || action === 'REMOVED_A_LABEL_FROM_A_CONTRACTOR') {
        logger.info('✏️ Contractor updated: ${contractor.first_name} ${contractor.last_name} (ID: ${contractor.id}) - Action: ${action}');
        try {
          // Fetch complete contractor data from TutorCruncher API
          const response = await tutorCruncherAPI.get(`/contractors/${contractor.id}/`);
          const fullContractor = response.data;
          
          // Update contractor in local database
          await pool.query(`
            INSERT INTO contractors (
              contractor_id, latitude, longitude, date_created, first_name, last_name,
              email, mobile, phone, street, state, town, country, postcode, timezone,
              title, photo, status, default_rate, qualifications, skills, institutions,
              received_notifications, review_rating, review_duration, calendar_colour,
              labels, extra_attrs, work_done_details, created_at, updated_at
            )
            VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17, $18, $19, $20, $21, $22, $23, $24, $25, $26, $27, $28, $29, NOW(), NOW())
            ON CONFLICT (contractor_id) DO UPDATE SET
              latitude = EXCLUDED.latitude,
              longitude = EXCLUDED.longitude,
              date_created = EXCLUDED.date_created,
              first_name = EXCLUDED.first_name,
              last_name = EXCLUDED.last_name,
              email = EXCLUDED.email,
              mobile = EXCLUDED.mobile,
              phone = EXCLUDED.phone,
              street = EXCLUDED.street,
              state = EXCLUDED.state,
              town = EXCLUDED.town,
              country = EXCLUDED.country,
              postcode = EXCLUDED.postcode,
              timezone = EXCLUDED.timezone,
              title = EXCLUDED.title,
              photo = EXCLUDED.photo,
              status = EXCLUDED.status,
              default_rate = EXCLUDED.default_rate,
              qualifications = EXCLUDED.qualifications,
              skills = EXCLUDED.skills,
              institutions = EXCLUDED.institutions,
              received_notifications = EXCLUDED.received_notifications,
              review_rating = EXCLUDED.review_rating,
              review_duration = EXCLUDED.review_duration,
              calendar_colour = EXCLUDED.calendar_colour,
              labels = EXCLUDED.labels,
              extra_attrs = EXCLUDED.extra_attrs,
              work_done_details = EXCLUDED.work_done_details,
              updated_at = NOW()
          `, [
            fullContractor.id,
            fullContractor.latitude ? parseFloat(fullContractor.latitude) : null,
            fullContractor.longitude ? parseFloat(fullContractor.longitude) : null,
            fullContractor.date_created ? new Date(fullContractor.date_created) : null,
            fullContractor.first_name,
            fullContractor.last_name,
            fullContractor.email,
            fullContractor.mobile,
            fullContractor.phone,
            fullContractor.street,
            fullContractor.state,
            fullContractor.town,
            fullContractor.country,
            fullContractor.postcode,
            fullContractor.timezone,
            fullContractor.title,
            fullContractor.photo,
            fullContractor.status,
            fullContractor.default_rate ? parseFloat(fullContractor.default_rate) : null,
            JSON.stringify(fullContractor.qualifications || []),
            JSON.stringify(fullContractor.skills || []),
            JSON.stringify(fullContractor.institutions || []),
            JSON.stringify(fullContractor.received_notifications || []),
            fullContractor.review_rating ? parseFloat(fullContractor.review_rating) : null,
            fullContractor.review_duration || null,
            fullContractor.calendar_colour,
            JSON.stringify(fullContractor.labels || []),
            JSON.stringify(fullContractor.extra_attrs || []),
            JSON.stringify(fullContractor.work_done_details || {})
          ]);

          // Invalidate contractor caches
          await cache.clearCacheByPrefix('contractors');

          logger.info('✅ Successfully updated contractor ${fullContractor.first_name} ${fullContractor.last_name} in local database');

          // Auto-import TC photo to Cloudinary (fire-and-forget)
          if (fullContractor.photo) {
            const photoService = new TcPhotoImportService(pool);
            photoService.importPhoto(fullContractor.id, fullContractor.photo, {
              firstName: fullContractor.first_name,
              lastName: fullContractor.last_name,
            }).catch(err => {
              logger.warn({ contractorId: fullContractor.id, error: err.message }, 'TC photo auto-import failed (non-blocking)');
            });
          }
        } catch (error) {
          logger.error({ error: error.message }, '❌ Failed to update contractor ${contractor.id} in local database:');
        }
      } else if (action === 'DELETED_A_CONTRACTOR' || action === 'DELETED_CONTRACTOR') {
        // Mark contractor as deleted in database
        try {
          const contractorId = contractor.id;
          if (contractorId) {
            await pool.query(
              `UPDATE contractors SET status = 'deleted', updated_at = NOW() WHERE contractor_id = $1`,
              [contractorId]
            );

            // Invalidate contractor caches
            await cache.clearCacheByPrefix('contractors');

            logger.info('✅ Marked contractor ${contractorId} as deleted');
          }
        } catch (error) {
          logger.error({ error: error.message }, '❌ Error marking contractor as deleted:');
        }
      } else {
        logger.info('Unhandled contractor action: ${action}');
      }
    } else if (model === 'AdhocCharge' || model === 'Ad Hoc Charge') {
      logger.info('📥 Webhook received: Processing AdhocCharge model with action: ${action}');
      logger.info('   Charge ID: ${event.subject?.id || \'unknown\'}');
      logger.info('   Description: ${event.subject?.description || \'N/A\'}');
      
      // Check if this is a manual charge for a subscription enrollment
      const charge = event.subject;
      if (charge && charge.client && charge.amount && (action === 'CREATED_AN_ADHOC_CHARGE' || action === 'CREATED_ADHOC_CHARGE')) {
        try {
          // Find active subscription enrollments for this client
          const enrollmentResult = await pool.query(
            `SELECT * FROM subscription_enrollments 
             WHERE client_id = $1 
               AND status = 'active'
               AND payment_type = 'monthly'`,
            [charge.client]
          );
          
          if (enrollmentResult.rows.length > 0) {
            // This is a manual charge for a subscription client
            // Credit this amount to next month's subscription bill
            for (const enrollment of enrollmentResult.rows) {
              const chargeAmount = parseFloat(charge.amount) || 0;
              
              // Store manual charge credit in metadata
              const metadata = enrollment.metadata ? (typeof enrollment.metadata === 'string' ? JSON.parse(enrollment.metadata) : enrollment.metadata) : {};
              if (!metadata.manualChargeCredits) {
                metadata.manualChargeCredits = [];
              }
              
              metadata.manualChargeCredits.push({
                chargeId: charge.id,
                amount: chargeAmount,
                date: new Date().toISOString(),
                description: charge.description || 'Manual charge credit'
              });
              
              // Update enrollment metadata
              await pool.query(
                `UPDATE subscription_enrollments 
                 SET metadata = $1, updated_at = NOW()
                 WHERE id = $2`,
                [JSON.stringify(metadata), enrollment.id]
              );
              
              logger.info('✅ Credited manual charge ${charge.id} ($${chargeAmount}) to subscription enrollment ${enrollment.id}');
              
              // Note: The monthly processor will apply this credit when calculating next month's bill
            }
          }
        } catch (syncError) {
          logger.error({ err: syncError }, 'Error syncing manual charge to subscription:');
          // Don't fail webhook if sync fails
        }
      }
      
      if (action === 'CREATED_AN_ADHOC_CHARGE' || action === 'EDITED_AN_ADHOC_CHARGE' || action === 'CREATED_ADHOC_CHARGE' || action === 'EDITED_ADHOC_CHARGE') {
        await handleAdhocChargeWebhook(event);
      } else if (action === 'DELETED_AN_ADHOC_CHARGE' || action === 'DELETED_ADHOC_CHARGE' || action === 'VOIDED_AN_ADHOC_CHARGE' || action === 'VOIDED_ADHOC_CHARGE') {
        // Remove or mark adhoc charge as deleted/voided
        try {
          const chargeId = event.subject?.id;
          if (chargeId) {
            await pool.query(
              `DELETE FROM adhoc_charges WHERE id = $1`,
              [chargeId]
            );
            logger.info('✅ Deleted adhoc charge ${chargeId} from database');
          }
        } catch (error) {
          logger.error({ error: error.message }, '❌ Error deleting adhoc charge:');
        }
      } else {
        logger.info('⚠️ Unhandled action type for AdhocCharge: ${action}');
      }
    } else if (model === 'Invoice') {
      logger.info('Processing Invoice model with action: ${action}');
      if (action === 'CREATED_AN_INVOICE' || action === 'EDITED_AN_INVOICE' || action === 'CHANGED_INVOICE_STATUS' || 
          action === 'CREATED_INVOICE' || action === 'EDITED_INVOICE' || action === 'CLIENT_PAID_INVOICE' || 
          action === 'CLIENT_PAID_AN_INVOICE' || action === 'PAID_AN_INVOICE' || action === 'PAID_INVOICE' ||
          action === 'MARKED_AS_PAID' || action === 'MARKED_INVOICE_AS_PAID' ||
          action === 'ACCOUNTING_ITEM_AUTOCHARGED' || action === 'VOIDED_AN_INVOICE' || action === 'VOIDED_INVOICE' ||
          action === 'REFUNDED_AN_INVOICE' || action === 'REFUNDED_INVOICE' ||
          action === 'SENT_AN_INVOICE' || action === 'SENT_INVOICE' || action === 'EMAILED_AN_INVOICE' || action === 'EMAILED_INVOICE') {
        await handleInvoiceWebhook(event);
      } else if (action === 'DELETED_AN_INVOICE' || action === 'DELETED_INVOICE') {
        // Remove invoice from database
        try {
          const invoiceId = event.subject?.id;
          if (invoiceId) {
            await pool.query(
              `DELETE FROM invoices WHERE id = $1`,
              [invoiceId]
            );
            logger.info('✅ Deleted invoice ${invoiceId} from database');
          }
        } catch (error) {
          logger.error({ error: error.message }, '❌ Error deleting invoice:');
        }
      } else {
        // Catch-all: if it's an invoice-related event we haven't explicitly handled,
        // still process it as it might be a status change
        logger.info('⚠️ Unhandled action type for Invoice: ${action} - Processing anyway to catch status changes');
        await handleInvoiceWebhook(event);
      }
    } else if (model === 'ProformaInvoice' || model === 'Proforma Invoice') {
      logger.info('Processing ProformaInvoice model with action: ${action}');
      if (action === 'CREATED_A_PROFORMA_INVOICE' || action === 'EDITED_A_PROFORMA_INVOICE' || action === 'CHANGED_PROFORMA_INVOICE_STATUS' || 
          action === 'CREATED_PROFORMA_INVOICE' || action === 'EDITED_PROFORMA_INVOICE' || action === 'VOIDED_A_PROFORMA_INVOICE' || 
          action === 'VOIDED_PROFORMA_INVOICE') {
        await handleProformaInvoiceWebhook(event);
      } else if (action === 'DELETED_A_PROFORMA_INVOICE' || action === 'DELETED_PROFORMA_INVOICE') {
        // Remove proforma invoice from database
        try {
          const proformaInvoiceId = event.subject?.id;
          if (proformaInvoiceId) {
            await pool.query(
              `DELETE FROM proforma_invoices WHERE id = $1`,
              [proformaInvoiceId]
            );
            logger.info('✅ Deleted proforma invoice ${proformaInvoiceId} from database');
          }
        } catch (error) {
          logger.error({ error: error.message }, '❌ Error deleting proforma invoice:');
        }
      } else {
        logger.info('Unhandled action type for ProformaInvoice: ${action}');
      }
    } else if (model === 'PaymentOrder' || model === 'Payment Order') {
      logger.info('Processing PaymentOrder model with action: ${action}');
      if (action === 'CREATED_A_PAYMENT_ORDER' || action === 'EDITED_A_PAYMENT_ORDER' || action === 'CHANGED_PAYMENT_ORDER_STATUS' || 
          action === 'CREATED_PAYMENT_ORDER' || action === 'EDITED_PAYMENT_ORDER' || action === 'VOIDED_A_PAYMENT_ORDER' || 
          action === 'VOIDED_PAYMENT_ORDER') {
        await handlePaymentOrderWebhook(event);
      } else if (action === 'DELETED_A_PAYMENT_ORDER' || action === 'DELETED_PAYMENT_ORDER') {
        // Remove payment order from database
        try {
          const paymentOrderId = event.subject?.id;
          if (paymentOrderId) {
            await pool.query(
              `DELETE FROM payment_orders WHERE id = $1`,
              [paymentOrderId]
            );
            logger.info('✅ Deleted payment order ${paymentOrderId} from database');
          }
        } catch (error) {
          logger.error({ error: error.message }, '❌ Error deleting payment order:');
        }
      } else {
        logger.info('Unhandled action type for PaymentOrder: ${action}');
      }
    } else if (model === 'Label') {
      logger.info('Processing Label model with action: ${action}');
      if (action === 'CREATED_A_LABEL' || action === 'EDITED_A_LABEL' || action === 'CHANGED_LABEL_STATUS' || 
          action === 'CREATED_LABEL' || action === 'EDITED_LABEL' || action === 'DELETED_A_LABEL' || action === 'DELETED_LABEL') {
        await handleLabelWebhook(event);
      } else {
        logger.info('Unhandled action type for Label: ${action}');
      }
    } else if (model === 'PipelineStage' || model === 'Pipeline Stage') {
      logger.info('Processing PipelineStage model with action: ${action}');
      if (action === 'CREATED_A_PIPELINE_STAGE' || action === 'EDITED_A_PIPELINE_STAGE' || action === 'CHANGED_PIPELINE_STAGE_STATUS' || 
          action === 'CREATED_PIPELINE_STAGE' || action === 'EDITED_PIPELINE_STAGE' || action === 'DELETED_A_PIPELINE_STAGE' || 
          action === 'DELETED_PIPELINE_STAGE') {
        await handlePipelineStageWebhook(event);
      } else {
        logger.info('Unhandled action type for PipelineStage: ${action}');
      }
    } else if (model === 'Package') {
      logger.info('Processing Package model with action: ${action}');
      if (action === 'CLIENT_PURCHASED_PACKAGE') {
        await handlePackagePurchaseWebhook(event);
      } else if (action === 'CREATED_A_PACKAGE' || action === 'EDITED_A_PACKAGE') {
        await handlePackageWebhook(event, pool);
      } else if (action === 'DELETED_A_PACKAGE') {
        // Remove package from database
        try {
          const packageId = event.subject?.id;
          if (packageId) {
            await pool.query(
              `DELETE FROM packages WHERE id = $1`,
              [packageId]
            );
            logger.info('✅ Deleted package ${packageId} from database');
          }
        } catch (error) {
          logger.error({ error: error.message }, '❌ Error deleting package:');
        }
      } else {
        logger.info('Unhandled action type for Package: ${action}');
      }
    } else if (model === 'Affiliate' || model === 'affiliate' || model === 'Agent' || model === 'agent') {
      logger.info('Processing Agent/Affiliate model with action: ${action}');
      const agent = event.subject;
      
      if (action === 'CREATED_AN_AGENT' || action === 'CREATED_AGENT' ||
          action === 'CREATED_AN_AFFILIATE' || action === 'CREATED_AFFILIATE' || 
          action === 'EDITED_AN_AGENT' || action === 'EDITED_AGENT' ||
          action === 'EDITED_AN_AFFILIATE' || action === 'EDITED_AFFILIATE') {
        try {
          // Fetch complete agent data from TutorCruncher API if needed
          let agentData = agent;
          if (agent.id) {
            try {
              const response = await tutorCruncherAPI.get(`/agents/${agent.id}/`);
              agentData = response.data;
            } catch (apiError) {
              logger.info('⚠️  Could not fetch full agent data, using webhook data: ${apiError.message}');
            }
          }
          
          // Agent data structure from TutorCruncher
          const agentName = agentData.name || 
                           `${agentData.first_name || ''} ${agentData.last_name || ''}`.trim() || 
                           'Unknown';
          const agentEmail = agentData.email || null;
          const agentPhone = agentData.phone || agentData.mobile || null;
          const agentStatus = agentData.status || (agentData.is_active !== false ? 'active' : 'inactive');
          const agentDateCreated = agentData.date_created ? new Date(agentData.date_created) : new Date();
          
          // Agent data structure from TutorCruncher
          const agentId = agentData.id || null;
          
          // Build comprehensive affiliate data
          const affiliateData = {
            name: agentName,
            first_name: agentData.first_name || null,
            last_name: agentData.last_name || null,
            email: agentEmail,
            phone: agentPhone,
            mobile: agentData.mobile || null,
            street: agentData.street || null,
            town: agentData.town || null,
            state: agentData.state || null,
            country: agentData.country || null,
            postcode: agentData.postcode || null,
            timezone: agentData.timezone || null,
            title: agentData.title || null,
            photo: agentData.photo || null,
            status: agentStatus,
            calendar_colour: agentData.calendar_colour || null,
            received_notifications: agentData.received_notifications ? JSON.stringify(agentData.received_notifications) : null,
            labels: agentData.labels ? JSON.stringify(agentData.labels) : null,
            extra_attrs: agentData.extra_attrs ? JSON.stringify(agentData.extra_attrs) : null,
            agent_id: agentId,
            date_created: agentDateCreated
          };
          
          // Use agent_id as unique identifier if available, otherwise use email
          // First try to update by agent_id if it exists
          if (agentId) {
            // Check if affiliate with this agent_id already exists
            const existingCheck = await pool.query(
              `SELECT id FROM affiliates WHERE agent_id = $1`,
              [agentId]
            );
            
            if (existingCheck.rows.length > 0) {
              // Update existing affiliate
              await pool.query(`
                UPDATE affiliates SET
                  name = $1,
                  first_name = $2,
                  last_name = $3,
                  email = COALESCE($4, email),
                  phone = $5,
                  mobile = $6,
                  street = $7,
                  town = $8,
                  state = $9,
                  country = $10,
                  postcode = $11,
                  timezone = $12,
                  title = $13,
                  photo = $14,
                  status = $15,
                  calendar_colour = $16,
                  received_notifications = $17,
                  labels = $18,
                  extra_attrs = $19,
                  updated_at = NOW()
                WHERE agent_id = $20
              `, [
                affiliateData.name,
                affiliateData.first_name,
                affiliateData.last_name,
                affiliateData.email,
                affiliateData.phone,
                affiliateData.mobile,
                affiliateData.street,
                affiliateData.town,
                affiliateData.state,
                affiliateData.country,
                affiliateData.postcode,
                affiliateData.timezone,
                affiliateData.title,
                affiliateData.photo,
                affiliateData.status,
                affiliateData.calendar_colour,
                affiliateData.received_notifications,
                affiliateData.labels,
                affiliateData.extra_attrs,
                agentId
              ]);
            } else {
              // Insert new affiliate
              await pool.query(`
                INSERT INTO affiliates (
                  name, first_name, last_name, email, phone, mobile, street, town, state, country, postcode,
                  timezone, title, photo, status, calendar_colour, received_notifications, labels, extra_attrs,
                  agent_id, date_created, created_at, updated_at
                )
                VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17, $18, $19, $20, $21, NOW(), NOW())
              `, [
                affiliateData.name,
                affiliateData.first_name,
                affiliateData.last_name,
                affiliateData.email,
                affiliateData.phone,
                affiliateData.mobile,
                affiliateData.street,
                affiliateData.town,
                affiliateData.state,
                affiliateData.country,
                affiliateData.postcode,
                affiliateData.timezone,
                affiliateData.title,
                affiliateData.photo,
                affiliateData.status,
                affiliateData.calendar_colour,
                affiliateData.received_notifications,
                affiliateData.labels,
                affiliateData.extra_attrs,
                affiliateData.agent_id,
                affiliateData.date_created
              ]);
            }
          } else if (agentEmail) {
            // Fallback to email as unique identifier
            await pool.query(`
              INSERT INTO affiliates (
                name, first_name, last_name, email, phone, mobile, street, town, state, country, postcode,
                timezone, title, photo, status, calendar_colour, received_notifications, labels, extra_attrs,
                agent_id, date_created, created_at, updated_at
              )
              VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17, $18, $19, $20, $21, NOW(), NOW())
              ON CONFLICT (email) DO UPDATE SET
                name = EXCLUDED.name,
                first_name = EXCLUDED.first_name,
                last_name = EXCLUDED.last_name,
                email = COALESCE(EXCLUDED.email, affiliates.email),
                phone = EXCLUDED.phone,
                mobile = EXCLUDED.mobile,
                street = EXCLUDED.street,
                town = EXCLUDED.town,
                state = EXCLUDED.state,
                country = EXCLUDED.country,
                postcode = EXCLUDED.postcode,
                timezone = EXCLUDED.timezone,
                title = EXCLUDED.title,
                photo = EXCLUDED.photo,
                status = EXCLUDED.status,
                calendar_colour = EXCLUDED.calendar_colour,
                received_notifications = EXCLUDED.received_notifications,
                labels = EXCLUDED.labels,
                extra_attrs = EXCLUDED.extra_attrs,
                updated_at = NOW()
            `, [
              affiliateData.name,
              affiliateData.first_name,
              affiliateData.last_name,
              affiliateData.email,
              affiliateData.phone,
              affiliateData.mobile,
              affiliateData.street,
              affiliateData.town,
              affiliateData.state,
              affiliateData.country,
              affiliateData.postcode,
              affiliateData.timezone,
              affiliateData.title,
              affiliateData.photo,
              affiliateData.status,
              affiliateData.calendar_colour,
              affiliateData.received_notifications,
              affiliateData.labels,
              affiliateData.extra_attrs,
              affiliateData.agent_id,
              affiliateData.date_created
            ]);
          } else if (agentEmail) {
            // Fallback to email as unique identifier
            await pool.query(`
              INSERT INTO affiliates (
                name, first_name, last_name, email, phone, mobile, street, town, state, country, postcode,
                timezone, title, photo, status, calendar_colour, received_notifications, labels, extra_attrs,
                agent_id, date_created, created_at, updated_at
              )
              VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17, $18, $19, $20, $21, NOW(), NOW())
              ON CONFLICT (email) DO UPDATE SET
                name = EXCLUDED.name,
                first_name = EXCLUDED.first_name,
                last_name = EXCLUDED.last_name,
                phone = EXCLUDED.phone,
                mobile = EXCLUDED.mobile,
                street = EXCLUDED.street,
                town = EXCLUDED.town,
                state = EXCLUDED.state,
                country = EXCLUDED.country,
                postcode = EXCLUDED.postcode,
                timezone = EXCLUDED.timezone,
                title = EXCLUDED.title,
                photo = EXCLUDED.photo,
                status = EXCLUDED.status,
                calendar_colour = EXCLUDED.calendar_colour,
                received_notifications = EXCLUDED.received_notifications,
                labels = EXCLUDED.labels,
                extra_attrs = EXCLUDED.extra_attrs,
                agent_id = COALESCE(EXCLUDED.agent_id, affiliates.agent_id),
                updated_at = NOW()
            `, [
              affiliateData.name,
              affiliateData.first_name,
              affiliateData.last_name,
              affiliateData.email,
              affiliateData.phone,
              affiliateData.mobile,
              affiliateData.street,
              affiliateData.town,
              affiliateData.state,
              affiliateData.country,
              affiliateData.postcode,
              affiliateData.timezone,
              affiliateData.title,
              affiliateData.photo,
              affiliateData.status,
              affiliateData.calendar_colour,
              affiliateData.received_notifications,
              affiliateData.labels,
              affiliateData.extra_attrs,
              affiliateData.agent_id,
              affiliateData.date_created
            ]);
          } else {
            // If no agent_id or email, just insert (will create new record each time)
            await pool.query(`
              INSERT INTO affiliates (
                name, first_name, last_name, email, phone, mobile, street, town, state, country, postcode,
                timezone, title, photo, status, calendar_colour, received_notifications, labels, extra_attrs,
                agent_id, date_created, created_at, updated_at
              )
              VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17, $18, $19, $20, $21, NOW(), NOW())
            `, [
              affiliateData.name,
              affiliateData.first_name,
              affiliateData.last_name,
              null,
              affiliateData.phone,
              affiliateData.mobile,
              affiliateData.street,
              affiliateData.town,
              affiliateData.state,
              affiliateData.country,
              affiliateData.postcode,
              affiliateData.timezone,
              affiliateData.title,
              affiliateData.photo,
              affiliateData.status,
              affiliateData.calendar_colour,
              affiliateData.received_notifications,
              affiliateData.labels,
              affiliateData.extra_attrs,
              affiliateData.agent_id,
              affiliateData.date_created
            ]);
          }
          
          logger.info('✅ Synced agent/affiliate ${agentName} (${agentEmail || agentData.id}) from webhook with extra_attrs and calendar_colour');
        } catch (error) {
          logger.error({ error: error.message }, '❌ Error syncing agent/affiliate from webhook:');
        }
      } else if (action === 'DELETED_AN_AGENT' || action === 'DELETED_AGENT' ||
                 action === 'DELETED_AN_AFFILIATE' || action === 'DELETED_AFFILIATE') {
        try {
          const agentId = agent.id;
          const agentEmail = agent.email;
          if (agentId || agentEmail) {
            await pool.query(
              `UPDATE affiliates SET status = 'inactive', updated_at = NOW() WHERE email = $1 OR (email IS NULL AND id = $2)`,
              [agentEmail, agentId]
            );
            logger.info('✅ Marked agent/affiliate ${agentId || agentEmail} as inactive');
          }
        } catch (error) {
          logger.error({ error: error.message }, '❌ Error marking agent/affiliate as inactive:');
        }
      } else {
        logger.info('⚠️  Unhandled action type for Agent/Affiliate: ${action}');
      }
    } else if (model === 'Administrator' || model === 'Admin' || model === 'administrator' || model === 'admin') {
      logger.info('Processing Administrator model with action: ${action}');
      const admin = event.subject;
      
      if (action === 'CREATED_AN_ADMINISTRATOR' || action === 'CREATED_ADMINISTRATOR' ||
          action === 'CREATED_AN_ADMIN' || action === 'CREATED_ADMIN' ||
          action === 'EDITED_AN_ADMINISTRATOR' || action === 'EDITED_ADMINISTRATOR' ||
          action === 'EDITED_AN_ADMIN' || action === 'EDITED_ADMIN' ||
          action === 'CHANGED_ADMIN_STATUS' || action === 'CHANGED_ADMINISTRATOR_STATUS') {
        try {
          // Fetch complete administrator data from TutorCruncher API if needed
          let adminData = admin;
          if (admin.id) {
            try {
              const response = await tutorCruncherAPI.get(`/admins/${admin.id}/`);
              adminData = response.data;
            } catch (apiError) {
              logger.info('⚠️  Could not fetch full admin data, using webhook data: ${apiError.message}');
            }
          }
          
          await pool.query(`
            INSERT INTO administrators (first_name, last_name, email, role, status, last_login, created_at, updated_at)
            VALUES ($1, $2, $3, $4, $5, $6, NOW(), NOW())
            ON CONFLICT (email) DO UPDATE SET
              first_name = EXCLUDED.first_name,
              last_name = EXCLUDED.last_name,
              role = EXCLUDED.role,
              status = EXCLUDED.status,
              last_login = EXCLUDED.last_login,
              updated_at = NOW()
          `, [
            adminData.first_name || null,
            adminData.last_name || null,
            adminData.email || null,
            adminData.role || 'admin',
            adminData.status || (adminData.is_active !== false ? 'active' : 'inactive'),
            adminData.last_login ? new Date(adminData.last_login) : null
          ]);
          
          logger.info('✅ Synced administrator ${adminData.email || adminData.id} from webhook');
        } catch (error) {
          logger.error({ error: error.message }, '❌ Error syncing administrator from webhook:');
        }
      } else if (action === 'DELETED_AN_ADMINISTRATOR' || action === 'DELETED_ADMINISTRATOR' ||
                 action === 'DELETED_AN_ADMIN' || action === 'DELETED_ADMIN') {
        try {
          const adminId = admin.id;
          const adminEmail = admin.email;
          if (adminId || adminEmail) {
            await pool.query(
              `UPDATE administrators SET status = 'inactive', updated_at = NOW() WHERE id = $1 OR email = $2`,
              [adminId, adminEmail]
            );
            logger.info('✅ Marked administrator ${adminId || adminEmail} as inactive');
          }
        } catch (error) {
          logger.error({ error: error.message }, '❌ Error marking administrator as inactive:');
        }
      } else {
        logger.info('⚠️  Unhandled action type for Administrator: ${action}');
      }
    } else if (model === 'Tender' || model === 'tender' || model === 'JobApplication' || model === 'Job Application') {
      logger.info('📥 Webhook received: Processing Tender/JobApplication model with action: ${action}');
      logger.info('   Tender ID: ${event.subject?.id || \'unknown\'}');
      
      if (action === 'CREATED_A_TENDER' || action === 'CREATED_TENDER' ||
          action === 'EDITED_A_TENDER' || action === 'EDITED_TENDER' ||
          action === 'CHANGED_TENDER_STATUS' || action === 'ACCEPTED_A_TENDER' || action === 'REJECTED_A_TENDER' ||
          action === 'WITHDREW_A_TENDER' || action === 'REQUESTED_A_TENDER') {
        await handleTenderWebhook(event, pool);
      } else if (action === 'DELETED_A_TENDER' || action === 'DELETED_TENDER') {
        // Remove tender from database
        try {
          const tenderId = event.subject?.id;
          if (tenderId) {
            await pool.query(
              `DELETE FROM job_applications WHERE id = $1`,
              [tenderId]
            );
            logger.info('✅ Deleted job application ${tenderId} from database');
          }
        } catch (error) {
          logger.error({ error: error.message }, '❌ Error deleting job application:');
        }
      } else {
        logger.info('⚠️  Unhandled action type for Tender: ${action}');
      }
    } else if (model === 'Review' || model === 'review') {
      logger.info('📥 Webhook received: Processing Review model with action: ${action}');
      logger.info('   Review ID: ${event.subject?.id || \'unknown\'}');
      
      if (action === 'CREATED_A_REVIEW' || action === 'CREATED_REVIEW' ||
          action === 'EDITED_A_REVIEW' || action === 'EDITED_REVIEW') {
        await handleReviewWebhook(event, pool);
      } else if (action === 'DELETED_A_REVIEW' || action === 'DELETED_REVIEW') {
        // Remove review from database
        try {
          const reviewId = event.subject?.id;
          if (reviewId) {
            await pool.query(
              `DELETE FROM reviews WHERE review_id = $1`,
              [reviewId]
            );
            logger.info('✅ Deleted review ${reviewId} from database');
          }
        } catch (error) {
          logger.error({ error: error.message }, '❌ Error deleting review:');
        }
      } else {
        logger.info('⚠️  Unhandled action type for Review: ${action}');
      }
    } else if (model === 'Recipient' || model === 'SR' || model === 'Student' || model === 'recipient' || model === 'sr') {
      logger.info('📥 Webhook received: Processing Recipient model with action: ${action}');
      const recipient = event.subject;
      const recipientId = recipient?.id;
      
      if (action === 'CREATED_A_RECIPIENT' || action === 'CREATED_RECIPIENT' ||
          action === 'CREATED_A_SR' || action === 'CREATED_SR' ||
          action === 'EDITED_A_RECIPIENT' || action === 'EDITED_RECIPIENT' ||
          action === 'EDITED_A_SR' || action === 'EDITED_SR') {
        try {
          logger.info('💾 Storing/updating recipient ${recipientId} in local database');
          
          // Fetch complete recipient data from TutorCruncher API
          let fullRecipient;
          try {
            const response = await tutorCruncherAPI.get(`/recipients/${recipientId}/`);
            fullRecipient = response.data;
          } catch (apiError) {
            logger.warn('⚠️  Could not fetch full recipient data, using webhook data: ${apiError.message}');
            fullRecipient = recipient;
          }
          
          // Extract date of birth from extra_attrs
          let date_of_birth = null;
          if (fullRecipient.extra_attrs && Array.isArray(fullRecipient.extra_attrs)) {
            const dobAttr = fullRecipient.extra_attrs.find(attr => attr.machine_name === 'sr_dob' && attr.value);
            if (dobAttr && dobAttr.value) {
              try {
                const dob = new Date(dobAttr.value);
                if (!isNaN(dob.getTime())) {
                  date_of_birth = dob;
                }
              } catch (e) {
                // Invalid date, skip
              }
            }
          }
          
          await pool.query(`
            INSERT INTO recipients (
              recipient_id, first_name, last_name, email, mobile, phone, street, state, town, country, postcode, 
              latitude, longitude, timezone, title, photo, default_rate, academic_year, calendar_colour,
              date_of_birth, labels, extra_attrs, paying_client_id, associated_clients, date_created, updated_at
            ) VALUES (
              $1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17, $18, $19, $20, $21, $22, $23, $24, $25, NOW()
            )
            ON CONFLICT (recipient_id) DO UPDATE 
            SET 
              first_name = EXCLUDED.first_name, 
              last_name = EXCLUDED.last_name, 
              email = EXCLUDED.email,
              mobile = EXCLUDED.mobile,
              phone = EXCLUDED.phone,
              street = EXCLUDED.street,
              state = EXCLUDED.state,
              town = EXCLUDED.town, 
              country = EXCLUDED.country, 
              postcode = EXCLUDED.postcode,
              latitude = EXCLUDED.latitude,
              longitude = EXCLUDED.longitude,
              timezone = EXCLUDED.timezone,
              title = EXCLUDED.title,
              photo = EXCLUDED.photo,
              default_rate = EXCLUDED.default_rate,
              academic_year = EXCLUDED.academic_year,
              calendar_colour = EXCLUDED.calendar_colour,
              date_of_birth = EXCLUDED.date_of_birth,
              labels = EXCLUDED.labels,
              extra_attrs = EXCLUDED.extra_attrs,
              paying_client_id = EXCLUDED.paying_client_id,
              associated_clients = EXCLUDED.associated_clients,
              date_created = EXCLUDED.date_created,
              updated_at = NOW()
          `, [
            fullRecipient.id,
            fullRecipient.first_name || null,
            fullRecipient.last_name || null,
            fullRecipient.email || null,
            fullRecipient.mobile || null,
            fullRecipient.phone || null,
            fullRecipient.street || null,
            fullRecipient.state || null,
            fullRecipient.town || null,
            fullRecipient.country || null,
            fullRecipient.postcode || null,
            fullRecipient.latitude ? parseFloat(fullRecipient.latitude) : null,
            fullRecipient.longitude ? parseFloat(fullRecipient.longitude) : null,
            fullRecipient.timezone || null,
            fullRecipient.title || null,
            fullRecipient.photo || null,
            fullRecipient.default_rate ? parseFloat(fullRecipient.default_rate) : null,
            fullRecipient.academic_year || null,
            fullRecipient.calendar_colour || null,
            date_of_birth,
            fullRecipient.labels ? JSON.stringify(fullRecipient.labels) : null,
            fullRecipient.extra_attrs ? JSON.stringify(fullRecipient.extra_attrs) : null,
            fullRecipient.paying_client?.id || null,
            fullRecipient.associated_clients ? JSON.stringify(fullRecipient.associated_clients) : null,
            fullRecipient.date_created ? new Date(fullRecipient.date_created) : null,
          ]);
          
          const name = `${fullRecipient.first_name || ''} ${fullRecipient.last_name || ''}`.trim() || `ID ${recipientId}`;
          logger.info('✅ Stored/updated recipient ${recipientId} (${name}) in local database');
        } catch (error) {
          logger.error({ err: error }, '❌ Failed to store/update recipient in local database');
        }
      } else if (action === 'DELETED_A_RECIPIENT' || action === 'DELETED_RECIPIENT' ||
                 action === 'DELETED_A_SR' || action === 'DELETED_SR') {
        // Remove recipient from database
        try {
          const recipientId = recipient?.id;
          if (recipientId) {
            await pool.query(
              `DELETE FROM recipients WHERE recipient_id = $1`,
              [recipientId]
            );
            logger.info('✅ Deleted recipient ${recipientId} from database');
          }
        } catch (error) {
          logger.error({ error: error.message }, '❌ Error deleting recipient:');
        }
      } else {
        logger.info('⚠️  Unhandled action type for Recipient: ${action}');
      }
    } else {
      logger.warn({ model, action }, `Unhandled model type: ${model}`);
    }

        // Mark event as successfully processed
        if (eventId) {
          await markEventCompleted(pool, eventId, 'tutorcruncher');
        }
      } catch (eventError) {
        logger.error({
          error: eventError.message,
          stack: eventError.stack,
          action,
          model,
          eventId
        }, `Error processing webhook event ${action} for model ${model}`);

        // Mark event as failed
        if (eventId) {
          await markEventFailed(pool, eventId, 'tutorcruncher', eventError.message);
        }
        // Continue processing other events even if one fails
      }
    }
    logger.info({ location }, 'Finished processing all TutorCruncher webhook events');
  } catch (error) {
    logger.error({
      error: error.message,
      stack: error.stack,
      location
    }, 'Fatal error processing TutorCruncher webhook');
  }
});

// Handle CREATED_REPORT webhook events
async function handleCreatedReport(event) {
  try {
    logger.info('🚀 Starting handleCreatedReport function');
    logger.info({ data: JSON.stringify(event, null, 2) }, '📦 Full event data:');
    
    const report = event.subject;
    logger.info({ data: report ? Object.keys(report) : 'report is null/undefined' }, '📋 Report object keys:');
    logger.info({ reportId: report?.id, reportUrl: report?.url, hasExtraAttrs: !!report?.extra_attrs, appointmentId: report?.appointment?.id, clientId: report?.client?.id }, '📋 Report structure');
    const appointment = report.appointment;
    const client = report.client;
    const creator = report.creator;
    const serviceRecipient = report.service_recipient;
    
    // Log webhook structure for debugging TutorCruncher changes
    logger.info('📋 Webhook payload structure check:');
    logger.info('   - appointment: ${appointment ? `exists (id: ${appointment.id || \'none\'})` : \'null\'}');
    logger.info('   - client: ${client ? `exists (id: ${client.id || \'none\'})` : \'null\'}');
    logger.info('   - creator: ${creator ? `exists (role: ${creator.role_type || \'unknown\'})` : \'null\'}');
    logger.info('   - serviceRecipient: ${serviceRecipient ? `exists (id: ${serviceRecipient.id || \'none\'})` : \'null\'}');
    logger.info({ data: Object.keys(report) }, '   - Report keys:');
    
    // Extract report ID from URL (TutorCruncher lesson report ID)
    let lessonReportId = null;
    if (report.url) {
      logger.info('📋 Report URL: ${report.url}');
      // Remove trailing slash and split by /
      const cleanUrl = report.url.replace(/\/$/, '');
      const urlParts = cleanUrl.split('/');
      const idString = urlParts[urlParts.length - 1];
      lessonReportId = parseInt(idString);
      logger.info('📋 Extracted ID string: "${idString}", parsed: ${lessonReportId}');
      
      if (isNaN(lessonReportId)) {
        logger.info('⚠️ Failed to parse report ID from URL: ${report.url}');
        lessonReportId = null;
      }
    } else {
      logger.info('⚠️ No report URL found in webhook data');
    }
    
    // Extract lesson name and coach notes from extra_attrs
    let lessonName = null;
    let coachNotes = null;
    
    // Log the structure of extra_attrs for debugging
    logger.info('📋 extra_attrs type: ${Array.isArray(report.extra_attrs) ? \'array\' : typeof report.extra_attrs}');
    logger.info({ data: JSON.stringify(report.extra_attrs, null, 2) }, '📋 extra_attrs value:');
    
    // Also check if notes are in report.text or report.content fields (alternative formats)
    if (!report.extra_attrs || (Array.isArray(report.extra_attrs) && report.extra_attrs.length === 0)) {
      logger.info('📋 Checking alternative note fields: text=${!!report.text}, content=${!!report.content}');
      if (report.text && typeof report.text === 'string' && report.text.trim().length > 0) {
        coachNotes = report.text.trim();
        logger.info('✅ Found notes in report.text field');
      } else if (report.content && typeof report.content === 'string' && report.content.trim().length > 0) {
        coachNotes = report.content.trim();
        logger.info('✅ Found notes in report.content field');
      }
    }
    
    if (report.extra_attrs) {
      if (Array.isArray(report.extra_attrs)) {
        // Handle array format (original format)
        const lessonAttr = report.extra_attrs.find(attr => 
          attr.machine_name === 'what_lesson_did_you_teach_today'
        );
        if (lessonAttr) {
          lessonName = lessonAttr.value ? lessonAttr.value.trim() : null;
          logger.info('Found lesson name from array: ${lessonName}');
        }
        
        const notesAttr = report.extra_attrs.find(attr => 
          attr.machine_name === 'notes_from_your_chess_coach'
        );
        if (notesAttr) {
          let rawNotes = notesAttr.value && notesAttr.value.trim() ? notesAttr.value.trim() : null;
          // Filter out literal "null" string that TC sometimes sends for empty notes
          if (rawNotes && rawNotes.toLowerCase() === 'null') rawNotes = null;
          if (rawNotes) {
            // Decode HTML entities in coach notes
            coachNotes = rawNotes
              .replace(/&#x27;/g, "'")
              .replace(/&#39;/g, "'")
              .replace(/&quot;/g, '"')
              .replace(/&amp;/g, '&')
              .replace(/&lt;/g, '<')
              .replace(/&gt;/g, '>')
              .replace(/&#x2F;/g, '/')
              .replace(/&#x60;/g, '`');
            
            // Normalize literal <br> tags to line breaks (will be converted to HTML <br> by markdownToHtml)
            // Handle variations: <br>, <br >, <br/>, <br />, etc.
            coachNotes = coachNotes.replace(/<br\s*\/?>/gi, '\n');
          }
          logger.info('Found coach notes from array: ${coachNotes ? coachNotes.substring(0, 100) + \'...\' : \'No notes\'}');
        }
      } else if (typeof report.extra_attrs === 'object' && report.extra_attrs !== null) {
        // Handle object format (new format: {'machine_name': 'value'})
        if (report.extra_attrs['what_lesson_did_you_teach_today']) {
          lessonName = typeof report.extra_attrs['what_lesson_did_you_teach_today'] === 'string' 
            ? report.extra_attrs['what_lesson_did_you_teach_today'].trim() 
            : null;
          logger.info('Found lesson name from object: ${lessonName}');
        }
        
        if (report.extra_attrs['notes_from_your_chess_coach']) {
          let rawNotes = typeof report.extra_attrs['notes_from_your_chess_coach'] === 'string'
            ? report.extra_attrs['notes_from_your_chess_coach'].trim()
            : null;
          // Filter out literal "null" string that TC sometimes sends for empty notes
          if (rawNotes && rawNotes.toLowerCase() === 'null') rawNotes = null;
          if (rawNotes) {
            // Decode HTML entities in coach notes
            coachNotes = rawNotes
              .replace(/&#x27;/g, "'")
              .replace(/&#39;/g, "'")
              .replace(/&quot;/g, '"')
              .replace(/&amp;/g, '&')
              .replace(/&lt;/g, '<')
              .replace(/&gt;/g, '>')
              .replace(/&#x2F;/g, '/')
              .replace(/&#x60;/g, '`');
            
            // Normalize literal <br> tags to line breaks (will be converted to HTML <br> by markdownToHtml)
            // Handle variations: <br>, <br >, <br/>, <br />, etc.
            coachNotes = coachNotes.replace(/<br\s*\/?>/gi, '\n');
          }
          logger.info('Found coach notes from object: ${coachNotes ? coachNotes.substring(0, 100) + \'...\' : \'No notes\'}');
        }
      } else {
        logger.info('⚠️ extra_attrs is neither array nor object: ${typeof report.extra_attrs}');
      }
    } else {
      logger.info('⚠️ No extra_attrs found in report');
    }
    
    if (!lessonName) {
      logger.info('No lesson name found in report, skipping client report creation');
      return;
    }
    
    // Check if lesson name is 'No Report' - skip these
    if (lessonName === 'No Report') {
      logger.info('🚫 Skipping report with "No Report" title - no template available');
      return;
    }
    
    // Use lesson name directly as template name
    const templateName = lessonName;
    logger.info('Using lesson name as template name: "${templateName}"');
    
    // Check if template exists in the database
    try {
      const templateCheck = await pool.query(
        'SELECT id FROM templates WHERE template_name = $1',
        [templateName]
      );
      
      if (templateCheck.rows.length === 0) {
        logger.info('🚫 Skipping report - no template found for "${templateName}"');
        return;
      }
      
      logger.info('✅ Template found for "${templateName}" (ID: ${templateCheck.rows[0].id})');
    } catch (error) {
      logger.error({ err: error }, '❌ Error checking template existence for "${templateName}":');
      logger.info('🚫 Skipping report due to template check error');
      return;
    }
    
    // Get tutor/author name from creator (tutor for home/online, club name for clubs, etc.)
    let tutorName = 'Unknown Tutor';
    if (creator) {
      tutorName = creator.first_name ?
        `${creator.first_name} ${creator.last_name}`.trim() :
        creator.last_name || 'Unknown Tutor';
      logger.info('Found author from creator: ${tutorName} (role_type: ${creator.role_type})');
    } else {
      logger.info('No creator found in report, using fallback');
    }
    
    // Fetch full appointment details to get all students (rcras)
    let students = [];
    
    if (appointment && appointment.id) {
      try {
        logger.info('Fetching full appointment details for appointment ${appointment.id}');
        const appointmentResponse = await tutorCruncherAPI.get(`appointments/${appointment.id}/`);
        const fullAppointment = appointmentResponse.data;
        
        // Get all students from recipients (rcras) who attended
        if (fullAppointment.rcras && Array.isArray(fullAppointment.rcras)) {
          logger.info('Processing ${fullAppointment.rcras.length} recipients from appointment data');
          
          // Log all recipient statuses for debugging
          const statusCounts = {};
          fullAppointment.rcras.forEach(r => {
            statusCounts[r.status] = (statusCounts[r.status] || 0) + 1;
          });
          logger.info({ data: statusCounts }, 'Recipient status breakdown:');
          
          for (const recipient of fullAppointment.rcras) {
            // Only process students who attended the lesson
            if (recipient.status !== 'attended') {
              logger.info('⏭️ Skipping student ${recipient.recipient_name || recipient.recipient || \'unknown\'} - status: ${recipient.status} (not attended)');
              continue;
            }
            
            logger.info('✅ Processing student ${recipient.recipient_name || \'unknown\'} - status: ${recipient.status}');
            
            // Use recipient_name from the API response (this is the student's name)
            const studentName = recipient.recipient_name || 'Unknown Student';
            
            // Use paying_client_name from the API response (this is the client's name)
            const clientName = recipient.paying_client_name || 'Unknown Client';
            
            if (!recipient.paying_client) {
              logger.warn('⚠️ Recipient ${studentName} has no paying_client ID, skipping');
              continue;
            }
            
            students.push({
              name: studentName,
              clientName: clientName,
              clientId: recipient.paying_client,
              recipientId: recipient.recipient
            });
          }
          logger.info('Found ${students.length} students from appointment data (out of ${fullAppointment.rcras.length} total recipients)');
        } else {
          logger.warn('⚠️ No rcras found in appointment data for appointment ${appointment.id}');
          logger.info({ data: fullAppointment ? Object.keys(fullAppointment) : 'appointment is null' }, '   Appointment data keys:');
        }
      } catch (error) {
        logger.error({ error: error.message }, '❌ Error fetching appointment ${appointment.id}:');
        logger.error({ error: error.response?.data || error.stack }, '   Error details:');
        // Continue to fallback logic below
      }
    } else {
      logger.warn('⚠️ No appointment data in webhook payload (appointment: ${appointment ? \'exists but no id\' : \'null\'})');
    }
    
    // Fallback to single service recipient if no students found from appointment data
    if (students.length === 0) {
      // Check if serviceRecipient exists (TutorCruncher may have changed webhook structure)
      if (!serviceRecipient) {
        logger.error('❌ No students found from appointment data AND serviceRecipient is null. Cannot create client report.');
        logger.error('   Report ID: ${reportId || \'unknown\'}, Appointment ID: ${appointment?.id || \'unknown\'}');
        logger.error('   This may indicate a change in TutorCruncher\'s webhook payload structure.');
        return; // Exit early - cannot process without student/client data
      }
      
      const studentName = serviceRecipient.first_name ? 
        `${serviceRecipient.first_name} ${serviceRecipient.last_name}`.trim() : 
        serviceRecipient.last_name || 'Unknown Student';
      
      const clientName = client && client.first_name ? 
        `${client.first_name} ${client.last_name}`.trim() : 
        (client && client.last_name ? client.last_name : 'Unknown Client');
      
      if (!client || !client.id) {
        logger.error('❌ No client data available. Cannot create client report for student: ${studentName}');
        return; // Exit early - cannot process without client data
      }
      
      students.push({
        name: studentName,
        clientName: clientName,
        clientId: client.id,
        recipientId: serviceRecipient.id || null
      });
      logger.info('Using fallback single student: ${studentName}');
    }
    
    logger.info('Found ${students.length} students for this lesson');
    
    // Detect if this is a school/club lesson (vs home/online)
    // School/club lessons should create ONE report per appointment, home/online create per-student
    let isSchoolOrClubLesson = false;
    let serviceLabels = [];
    
    if (appointment && appointment.service) {
      // Try to get service labels from local database first
      try {
        const serviceQuery = await pool.query(`
          SELECT labels FROM services WHERE service_id = $1
        `, [appointment.service.id || appointment.service]);
        
        if (serviceQuery.rows.length > 0 && serviceQuery.rows[0].labels) {
          serviceLabels = serviceQuery.rows[0].labels;
          if (typeof serviceLabels === 'string') {
            try {
              serviceLabels = JSON.parse(serviceLabels);
            } catch (e) {
              serviceLabels = [];
            }
          }
        }
      } catch (err) {
        logger.info('ℹ️ Could not fetch service labels from local database: ${err.message}');
      }
      
      // If no labels from local DB, try TutorCruncher API
      if (serviceLabels.length === 0) {
        try {
          const serviceId = appointment.service.id || appointment.service;
          const serviceResponse = await tutorCruncherAPI.get(`services/${serviceId}/`);
          if (serviceResponse.data && serviceResponse.data.labels) {
            serviceLabels = serviceResponse.data.labels.map(l => l.name || l);
          }
        } catch (err) {
          logger.info('ℹ️ Could not fetch service labels from API: ${err.message}');
        }
      }
      
      // Check if any label indicates school or club
      const labelString = JSON.stringify(serviceLabels).toLowerCase();
      isSchoolOrClubLesson = labelString.includes('school') || labelString.includes('club');
      
      logger.info('📋 Service labels: ${JSON.stringify(serviceLabels)}');
      logger.info('📋 Is school/club lesson: ${isSchoolOrClubLesson} (${students.length} students)');
    }
    
    // ALWAYS match the webhook's serviceRecipient to an attending student
    // TutorCruncher sends SEPARATE webhooks for EACH student's report (including non-attending students)
    // We must verify the webhook is for an attending student, even with only 1 attending student
    // Without this check, a non-attending student's "did not attend" report could be sent to the attending student's parent
    let studentsToProcess = students;
    const webhookStudentId = serviceRecipient?.id;

    if (webhookStudentId) {
      const matchingStudent = students.find(s => s.recipientId === webhookStudentId);

      if (matchingStudent) {
        // Use the webhook's specific student for the report
        if (isSchoolOrClubLesson) {
          logger.info('🏫 School/Club lesson: Using webhook serviceRecipient ${matchingStudent.name} (ID: ${webhookStudentId}) for consolidated report');
        } else {
          logger.info('🏠 Home/Online lesson: Processing report for ${matchingStudent.name} (ID: ${webhookStudentId}) - matching serviceRecipient');
        }
        studentsToProcess = [matchingStudent];
      } else {
        // Webhook is for a non-attending student - skip processing entirely
        logger.info('⏭️ Webhook serviceRecipient ${serviceRecipient?.first_name || \'unknown\'} (ID: ${webhookStudentId}) is not in the attending students list');
        logger.info('   Attending student IDs: ${students.map(s => s.recipientId).join(\', \')}');
        logger.info('   Skipping this webhook to prevent applying wrong notes to attending students');
        return; // Exit early - don't process this webhook
      }
    } else if (students.length > 1) {
      // Fallback to first student only if no serviceRecipient ID available AND multiple students
      logger.info('⚠️ No serviceRecipient ID in webhook, using first attending student: ${students[0].name}');
      studentsToProcess = [students[0]];
    }

    if (isSchoolOrClubLesson && students.length > 1) {
      logger.info('🏫 School/Club lesson detected with ${students.length} students - will create ONE consolidated report');
    }
    
    // Create client report entry for each student (or ONE for school/club)
    // Track which client emails we've sent to prevent sending duplicate client emails for the same appointment
    const clientEmailsSent = new Set();

    // Store all students for school/club lessons so we can send to all of them
    const allStudentsForSchoolClub = isSchoolOrClubLesson ? students : null;

    // For school/club lessons, use an advisory lock to prevent race conditions
    // This serializes webhook processing for the same appointment
    let advisoryLockAcquired = false;
    if (isSchoolOrClubLesson && appointment && appointment.id) {
      try {
        // Try to acquire an advisory lock on the appointment_id
        // pg_try_advisory_lock returns immediately with true/false (non-blocking)
        const lockResult = await pool.query(
          'SELECT pg_try_advisory_lock($1) as locked',
          [appointment.id]
        );
        advisoryLockAcquired = lockResult.rows[0].locked;

        if (!advisoryLockAcquired) {
          // Another webhook is currently processing this appointment
          // Wait a short time and check if report already exists
          logger.info('⏳ School/club lesson: Another webhook is processing appointment ${appointment.id}, waiting...');
          await new Promise(resolve => setTimeout(resolve, 500));

          // Check if a report was created while we were waiting
          const existingReport = await pool.query(`
            SELECT id FROM client_reports WHERE appointment_id = $1 LIMIT 1
          `, [appointment.id]);

          if (existingReport.rows.length > 0) {
            logger.info('⏭️ School/club lesson: Report ${existingReport.rows[0].id} already exists for appointment ${appointment.id}, skipping this webhook');
            return; // Exit early - another webhook already created the report
          }

          // No report exists yet, try to acquire lock (blocking this time)
          await pool.query('SELECT pg_advisory_lock($1)', [appointment.id]);
          advisoryLockAcquired = true;
          logger.info('🔒 School/club lesson: Acquired lock for appointment ${appointment.id} after waiting');
        } else {
          logger.info('🔒 School/club lesson: Acquired lock for appointment ${appointment.id}');
        }
      } catch (lockError) {
        logger.error({ error: lockError.message }, '⚠️ Error acquiring advisory lock for appointment ${appointment.id}:');
        // Continue without lock - the duplicate check will still work (just with potential race condition)
      }
    }

    // Wrap processing in try-finally to ensure lock is released
    try {
    for (const student of studentsToProcess) {
      
      // Fetch client email and timezone - try local database first, then API
      let clientEmail = 'eve@one1.digital'; // Fallback to test email
      let clientTimezone = null;
      
      // First, try to get client data from local database
      try {
        logger.info('🔍 Checking local database for client ID: ${student.clientId}');
        // Use location-aware pool (already set at top of handler)
        const localClientQuery = await pool.query(`
          SELECT email, status FROM clients WHERE client_id = $1
        `, [student.clientId]);
        
        if (localClientQuery.rows.length > 0) {
          const localClient = localClientQuery.rows[0];
          if (localClient.email) {
            clientEmail = localClient.email;
            logger.info('✅ Found client email in local database: ${clientEmail} for client ${student.clientName}');
          } else {
            logger.info('⚠️ No email in local database for client ${student.clientId}, will try API');
          }
        } else {
          logger.info('ℹ️ Client ${student.clientId} not found in local database, will try API');
        }
      } catch (error) {
        logger.error({ error: error.message }, '❌ Error checking local database for client ${student.clientId}:');
      }
      
      // If no email found locally, try TutorCruncher API
      if (clientEmail === 'eve@one1.digital') {
        try {
          logger.info('🔍 Fetching client details from API for client ID: ${student.clientId}');
          const clientResponse = await tutorCruncherAPI.get(`clients/${student.clientId}/`);
          const clientData = clientResponse.data;
          
          if (clientData && clientData.email) {
            clientEmail = clientData.email;
            logger.info('✅ Found client email from API: ${clientEmail} for client ${student.clientName}');
            
            // Store this client data in local database for future use
            try {
              await pool.query(`
                INSERT INTO clients (client_id, first_name, last_name, email, phone, status, lead_type, created_at, updated_at)
                VALUES ($1, $2, $3, $4, $5, $6, $7, NOW(), NOW())
                ON CONFLICT (client_id) DO UPDATE SET
                  first_name = EXCLUDED.first_name,
                  last_name = EXCLUDED.last_name,
                  email = EXCLUDED.email,
                  phone = EXCLUDED.phone,
                  status = EXCLUDED.status,
                  lead_type = COALESCE(clients.lead_type, EXCLUDED.lead_type),
                  updated_at = NOW()
              `, [
                clientData.id,
                clientData.first_name,
                clientData.last_name,
                clientData.email,
                clientData.phone || null,
                clientData.status || 'active',
                'New Lead' // Default lead_type for new clients
              ]);
              logger.info('💾 Stored client ${clientData.id} in local database for future use');
            } catch (storeError) {
              logger.error({ error: storeError.message }, '⚠️ Failed to store client ${clientData.id} in local database:');
            }
          } else {
            logger.warn('⚠️ No email found for client ${student.clientId} (${student.clientName}), using fallback email');
          }
          
          if (clientData && clientData.timezone) {
            clientTimezone = clientData.timezone;
            logger.info('✅ Found client timezone: ${clientTimezone} for client ${student.clientName}');
          } else {
            logger.info('ℹ️ No timezone found for client ${student.clientId} (${student.clientName}), will use service labels');
          }
        } catch (error) {
          logger.error({ error: error.response?.data || error.message }, '❌ Failed to fetch client details for ${student.clientId}:');
          logger.info('🔄 Using fallback email: ${clientEmail}');
        }
      }

      // Fetch student email from recipient details
      let studentEmail = null;
      if (student.recipientId) {
        try {
          logger.info('🔍 Fetching recipient details for recipient ID: ${student.recipientId}');
          const recipientResponse = await tutorCruncherAPI.get(`recipients/${student.recipientId}/`);
          const recipientData = recipientResponse.data;
          
          if (recipientData && recipientData.email) {
            studentEmail = recipientData.email;
            logger.info('✅ Found student email: ${studentEmail} for student ${student.name}');
          } else {
            logger.info('ℹ️ No email found for recipient ${student.recipientId} (${student.name})');
          }
        } catch (error) {
          logger.error({ error: error.response?.data || error.message }, '❌ Failed to fetch recipient details for ${student.recipientId}:');
          logger.info('ℹ️ Student ${student.name} will not have email address');
        }
      }

      // Format the email subject with appointment date/time
      let emailSubject = 'Acme Operations Lesson Report'; // Default fallback
      
      if (appointment.start) {
        try {
          // Get timezone for the appointment using client timezone, service labels and location
          const { getTimezoneForAppointment } = require('../../utils/timezone-mapping');
          const timezone = getTimezoneForAppointment(appointment, appointment.service, clientTimezone);
          
          // Parse the appointment start time and format it
          const appointmentDate = new Date(appointment.start);
          const options = {
            timeZone: timezone,
            month: 'numeric',
            day: 'numeric',
            year: '2-digit',
            hour: 'numeric',
            minute: '2-digit',
            hour12: true
          };
          const formattedDateTime = appointmentDate.toLocaleString('en-US', options);
          emailSubject = `Acme Operations Lesson Report - ${formattedDateTime}`;
        } catch (dateError) {
          logger.error({ err: dateError }, 'Error formatting appointment date in webhook:');
          // Keep the default subject if date formatting fails
        }
      } else {
        // Fallback to current date/time when no appointment data is available
        try {
          const { getTimezoneForAppointment } = require('../../utils/timezone-mapping');
          const timezone = getTimezoneForAppointment(appointment, appointment.service, clientTimezone);
          
          const currentDate = new Date();
          const options = {
            timeZone: timezone,
            month: 'numeric',
            day: 'numeric',
            year: '2-digit',
            hour: 'numeric',
            minute: '2-digit',
            hour12: true
          };
          const formattedDateTime = currentDate.toLocaleString('en-US', options);
          emailSubject = `Acme Operations Lesson Report - ${formattedDateTime}`;
        } catch (dateError) {
          logger.error({ err: dateError }, 'Error formatting current date in webhook:');
          // Keep the default subject if date formatting fails
        }
      }

      const clientReportData = {
        dateSent: null, // Will be set when actually sent
        tutorName: tutorName,
        clientName: student.clientName,
        studentName: student.name,
        clientEmail: clientEmail,
        studentEmail: studentEmail,
        templateName: templateName,
        tutorFeedback: coachNotes, // Use actual coach notes from webhook, or null if blank
        lessonId: lessonReportId || null, // TutorCruncher report ID (lesson ID) - use null if parsing failed
        appointmentId: appointment.id, // Appointment ID
        emailSubject: emailSubject // Use the formatted email subject
      };
      
      // Initialize reportId - will be set by UPDATE if replacing existing report, or INSERT if creating new
      let reportId = null;
      
      // Check if report already exists for this appointment
      // This prevents duplicates when TutorCruncher sends multiple webhooks for the same lesson
      // IMPROVED: Handle race conditions where a report without notes beats a report with notes
      // For school/club lessons: check by appointment ONLY (one report per class, not per student)
      // For home/online lessons: check by appointment + student name (one report per student)
      if (appointment && appointment.id && student.name) {
        let existingReport;

        if (isSchoolOrClubLesson) {
          // School/club lessons: ONE report per appointment (regardless of student name)
          // This prevents 9 duplicate reports when TC sends 9 webhooks (one per student)
          existingReport = await pool.query(`
            SELECT id, lesson_id, status, tutor_feedback, template_name, student_name
            FROM client_reports
            WHERE appointment_id = $1
            ORDER BY id DESC
            LIMIT 1
          `, [appointment.id]);

          if (existingReport.rows.length > 0) {
            logger.info('🏫 School/club lesson: Found existing report ${existingReport.rows[0].id} for appointment ${appointment.id} (student: ${existingReport.rows[0].student_name})');
          }
        } else {
          // Home/online lessons: one report per student per appointment
          existingReport = await pool.query(`
            SELECT id, lesson_id, status, tutor_feedback, template_name
            FROM client_reports
            WHERE appointment_id = $1 AND student_name = $2
            ORDER BY id DESC
            LIMIT 1
          `, [appointment.id, student.name]);
        }
        
        if (existingReport.rows.length > 0) {
          const existing = existingReport.rows[0];
          const existingLessonId = existing.lesson_id;
          const existingStatus = existing.status;
          const existingHasNotes = existing.tutor_feedback && existing.tutor_feedback.trim().length > 0;
          const currentHasNotes = coachNotes && coachNotes.trim().length > 0;
          const isSameReport = existingLessonId === lessonReportId;
          
          // Case 1: Existing report was skipped - replace it with new one
          if (existingStatus === 'skipped') {
            logger.info('🔄 Replacing skipped report ${existing.id} (lesson_id: ${existingLessonId}) with new report (lesson_id: ${lessonReportId})');
            try {
              await pool.query(`
                UPDATE client_reports 
                SET 
                  lesson_id = $1,
                  tutor_feedback = $2,
                  template_name = $3,
                  student_name = $4,
                  tutor_name = $5,
                  status = 'pending',
                  date_sent = NOW()
                WHERE id = $6
              `, [
                lessonReportId,
                coachNotes,
                templateName,
                student.name,
                tutorName,
                existing.id
              ]);
              reportId = existing.id;
              logger.info('✅ Updated skipped report ${existing.id} with new data from report ${lessonReportId}');
              // Continue to email sending logic below (skip the INSERT)
            } catch (updateError) {
              logger.error({ error: updateError.message }, '❌ Error updating skipped report ${existing.id}:');
              // Fall through to try creating new report
            }
          }
          // Case 2: Different TutorCruncher report ID - check if we should replace
          else if (!isSameReport && existingLessonId !== null) {
            // If existing report has no notes but new one has notes, replace it
            if (!existingHasNotes && currentHasNotes) {
              logger.info('🔄 Replacing report ${existing.id} (lesson_id: ${existingLessonId}, no notes) with report ${lessonReportId} (has notes)');
              try {
                await pool.query(`
                  UPDATE client_reports 
                  SET 
                    lesson_id = $1,
                    tutor_feedback = $2,
                    template_name = $3,
                    student_name = $4,
                    tutor_name = $5,
                    status = 'pending',
                    date_sent = NOW()
                  WHERE id = $6
                `, [
                  lessonReportId,
                  coachNotes,
                  templateName,
                  student.name,
                  tutorName,
                  existing.id
                ]);
                reportId = existing.id;
                logger.info('✅ Updated report ${existing.id} with notes from report ${lessonReportId}');
                // Continue to email sending logic below (skip the INSERT)
              } catch (updateError) {
                logger.error({ error: updateError.message }, '❌ Error updating report ${existing.id}:');
                // Fall through to try creating new report
              }
            }
            // If existing report has notes but new one doesn't, skip the new one
            else if (existingHasNotes && !currentHasNotes) {
              logger.info('⏭️ Skipping report ${lessonReportId} - existing report ${existing.id} (lesson_id: ${existingLessonId}) already has notes');
              continue; // Skip to next student
            }
            // Both have notes or both don't have notes - skip duplicate
            else {
              logger.info('⏭️ Skipping duplicate report - report ${existing.id} (lesson_id: ${existingLessonId}) already exists for appointment ${appointment.id} and student ${student.name}');
              continue; // Skip to next student
            }
          }
          // Case 3: Same TutorCruncher report ID - true duplicate, skip
          else if (isSameReport) {
            logger.info('⏭️ Skipping duplicate report - report ${existing.id} already exists for TutorCruncher report ${lessonReportId} (appointment ${appointment.id}, student ${student.name})');
            continue; // Skip to next student
          }
          // Case 4: Existing report has no lesson_id but new one does - update it
          else if (!existingLessonId && lessonReportId) {
            logger.info('🔄 Updating report ${existing.id} with TutorCruncher report ID ${lessonReportId}');
            try {
              // If existing report was skipped and new one has notes, also update status
              const shouldReactivate = existingStatus === 'skipped' && currentHasNotes;
              await pool.query(`
                UPDATE client_reports 
                SET 
                  lesson_id = $1,
                  tutor_feedback = COALESCE(NULLIF($2, ''), tutor_feedback),
                  template_name = COALESCE(NULLIF($3, ''), template_name),
                  student_name = COALESCE(NULLIF($4, ''), student_name),
                  tutor_name = COALESCE(NULLIF($5, ''), tutor_name),
                  ${shouldReactivate ? "status = 'pending', date_sent = NOW()," : ''}
                  updated_at = NOW()
                WHERE id = $6
              `, [
                lessonReportId,
                coachNotes || null,
                templateName || null,
                student.name || null,
                tutorName || null,
                existing.id
              ]);
              reportId = existing.id;
              if (shouldReactivate) {
                logger.info('✅ Updated and reactivated skipped report ${existing.id} with TutorCruncher report ID ${lessonReportId} and notes');
              } else {
                logger.info('✅ Updated report ${existing.id} with TutorCruncher report ID ${lessonReportId}');
              }
              // Continue to email sending logic below (skip the INSERT)
            } catch (updateError) {
              logger.error({ error: updateError.message }, '❌ Error updating report ${existing.id}:');
              // Fall through to try creating new report
            }
          }
          // Default: Skip duplicate
          else {
            logger.info('⏭️ Skipping duplicate report - report ${existing.id} already exists for appointment ${appointment.id} and student ${student.name}');
            continue; // Skip to next student
          }
        }
      }

      // Insert into client_reports table (only if we didn't update an existing report above)
      // Wrap in try-catch to handle potential unique constraint violations from race conditions
      if (!reportId) {
        try {
          const { rows } = await pool.query(`
            INSERT INTO client_reports 
            (date_sent, tutor_name, client_name, student_name, client_email, student_email, template_name, tutor_feedback, status, lesson_id, appointment_id, email_subject)
            VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12)
            RETURNING id
          `, [
            clientReportData.dateSent,
            clientReportData.tutorName,
            clientReportData.clientName,
            clientReportData.studentName,
            clientReportData.clientEmail,
            clientReportData.studentEmail,
            clientReportData.templateName,
            clientReportData.tutorFeedback,
            'pending', // Default status
            clientReportData.lessonId,
            clientReportData.appointmentId,
            clientReportData.emailSubject
          ]);
          reportId = rows[0].id;
        } catch (insertError) {
          // Handle unique constraint violation (race condition between webhooks)
          // PostgreSQL error code 23505 = unique_violation
          // Check if it's a unique violation on client_reports table (could be our constraint or any other unique constraint)
          if (insertError.code === '23505' && 
              insertError.table === 'client_reports' &&
              (insertError.constraint === 'idx_client_reports_appointment_student_unique' ||
               insertError.constraint === 'idx_client_reports_appointment_client_unique' || 
               insertError.message && insertError.message.includes('client_reports'))) {
            logger.info('⏭️ Skipping duplicate report due to unique constraint violation - report already exists for appointment ${appointment.id} and student ${student.name}');
            continue; // Skip to next student
          }
          // Re-throw other errors
          throw insertError;
        }
      } else {
        logger.info('ℹ️ Using existing report ID ${reportId} (was updated above)');
      }
      
      logger.info('✅ Created client report with ID: ${reportId}');
      logger.info('📧 Report details: ${student.name} - ${lessonName} - Template: ${templateName} - Tutor: ${tutorName} - Client Email: ${clientEmail} - Student Email: ${studentEmail || \'None\'} - Notes: ${coachNotes ? \'Yes\' : \'None\'}');
      
      // Check if auto-sending is enabled for this environment
      const { getCurrentEnvironment } = require('../../config/environments');
      const envConfig = getCurrentEnvironment();
      
      // Also check database setting for lesson reports enabled
      let lessonReportsEnabled = true;
      try {
        const { rows: settingRows } = await pool.query(
          'SELECT setting_value FROM app_settings WHERE setting_key = $1',
          ['lesson_reports_enabled']
        );
        if (settingRows.length > 0 && settingRows[0].setting_value && typeof settingRows[0].setting_value.enabled === 'boolean') {
          lessonReportsEnabled = settingRows[0].setting_value.enabled;
        }
      } catch (settingError) {
        logger.error({ err: settingError }, 'Error checking lesson reports setting:');
        // Default to enabled if check fails
      }
      
      if (envConfig.autoSendClientReports && lessonReportsEnabled) {
        logger.info('✅ Auto-sending client reports is ENABLED - sending report immediately');
        
        // CRITICAL SAFEGUARD: Check if this email was already sent recently (prevents cross-environment duplicates)
        // This catches cases where both staging and production receive the same webhook
        if (appointment && appointment.id && clientEmail) {
          const recentSentCheck = await pool.query(`
            SELECT id, date_sent, status 
            FROM client_reports 
            WHERE appointment_id = $1 
              AND client_email = $2 
              AND status = 'sent'
              AND date_sent > NOW() - INTERVAL '5 minutes'
            ORDER BY date_sent DESC
            LIMIT 1
          `, [appointment.id, clientEmail]);
          
          if (recentSentCheck.rows.length > 0) {
            const existingReport = recentSentCheck.rows[0];
            logger.info('⏭️ SKIPPING DUPLICATE EMAIL SEND - Report ${existingReport.id} for appointment ${appointment.id} and client ${clientEmail} was already sent at ${existingReport.date_sent} (likely sent from another environment)');
            // Leave status as 'pending' - this report won't be sent but will remain in database
            // This prevents duplicate emails when both staging and production receive the same webhook
            continue; // Skip sending email
          }
        }
        
        // Failsafe: Skip sending "Only Notes" template if there are no notes
        // Check both coachNotes variable (from webhook) and tutor_feedback from database
        if (templateName === 'Only Notes') {
          // First check coachNotes from webhook extraction
          let hasNotes = coachNotes && coachNotes.trim().length > 0;
          
          // If no notes from webhook, check database tutor_feedback field as fallback
          if (!hasNotes) {
            try {
              const { rows: reportRows } = await pool.query(
                'SELECT tutor_feedback FROM client_reports WHERE id = $1',
                [reportId]
              );
              if (reportRows.length > 0 && reportRows[0].tutor_feedback) {
                const dbNotes = reportRows[0].tutor_feedback.trim();
                if (dbNotes.length > 0) {
                  hasNotes = true;
                  coachNotes = dbNotes; // Use database notes for email sending
                  logger.info('✅ Found notes in database for report ${reportId}, using them for email');
                }
              }
            } catch (dbError) {
              logger.error({ error: dbError.message }, '❌ Error checking database for notes:');
            }
          }
          
          // If still no notes, try fetching directly from TutorCruncher API
          if (!hasNotes && lessonReportId) {
            try {
              logger.info('🔍 Attempting to fetch notes from TutorCruncher API for report ${lessonReportId}');
              const reportResponse = await tutorCruncherAPI.get(`reports/${lessonReportId}/`);
              const reportData = reportResponse.data;
              
              // Try to extract notes from API response
              if (reportData.extra_attrs) {
                let apiNotes = null;
                if (Array.isArray(reportData.extra_attrs)) {
                  const notesAttr = reportData.extra_attrs.find(attr => 
                    attr.machine_name === 'notes_from_your_chess_coach'
                  );
                  if (notesAttr && notesAttr.value) {
                    apiNotes = notesAttr.value.trim();
                  }
                } else if (typeof reportData.extra_attrs === 'object' && reportData.extra_attrs['notes_from_your_chess_coach']) {
                  apiNotes = typeof reportData.extra_attrs['notes_from_your_chess_coach'] === 'string' 
                    ? reportData.extra_attrs['notes_from_your_chess_coach'].trim() 
                    : null;
                }
                
                if (apiNotes && apiNotes.length > 0) {
                  // Decode HTML entities
                  coachNotes = apiNotes
                    .replace(/&#x27;/g, "'")
                    .replace(/&#39;/g, "'")
                    .replace(/&quot;/g, '"')
                    .replace(/&amp;/g, '&')
                    .replace(/&lt;/g, '<')
                    .replace(/&gt;/g, '>')
                    .replace(/&#x2F;/g, '/')
                    .replace(/&#x60;/g, '`')
                    .replace(/<br\s*\/?>/gi, '\n');
                  
                  hasNotes = true;
                  logger.info('✅ Found notes from TutorCruncher API for report ${lessonReportId}');
                  
                  // Update database with notes we found
                  await pool.query(
                    'UPDATE client_reports SET tutor_feedback = $1 WHERE id = $2',
                    [coachNotes, reportId]
                  );
                }
              }
            } catch (apiError) {
              logger.error({ error: apiError.response?.data || apiError.message }, '❌ Error fetching notes from TutorCruncher API:');
            }
          }
          
          if (!hasNotes) {
            logger.info('🚫 Skipping "Only Notes" template - no notes found in webhook, database, or API for student ${student.name}');
            
            // Update report status to indicate it was skipped
            // IMPORTANT: Do NOT set tutor_feedback to error message - that field is displayed to customers!
            let reportUpdated = false;
            try {
              const updateResult = await pool.query(`
                UPDATE client_reports
                SET status = 'skipped',
                    date_sent = NOW()
                WHERE id = $1
                RETURNING id, template_name, lesson_id, status
              `, [reportId]);
              
              if (updateResult.rows.length > 0) {
                reportUpdated = true;
                logger.info('✅ Updated report ${reportId} status to \'skipped\'');
              } else {
                logger.warn('⚠️ Report ${reportId} not found in database - cannot update or send alert');
              }
            } catch (updateError) {
              logger.error({ error: updateError.message }, '❌ Error updating report ${reportId} status:');
            }
            
            // VALIDATION: Only send alert if report was successfully updated and validated
            if (reportUpdated) {
              try {
                // Verify the report exists and has correct template name before sending alert
                const { rows: verifyRows } = await pool.query(`
                  SELECT id, template_name, lesson_id, status, student_name, client_email
                  FROM client_reports
                  WHERE id = $1
                `, [reportId]);
                
                if (verifyRows.length === 0) {
                  logger.warn('⚠️ Cannot send alert - report ${reportId} not found in database');
                  continue;
                }
                
                const verifiedReport = verifyRows[0];
                
                // CRITICAL VALIDATION: Ensure template is actually "Only Notes"
                if (verifiedReport.template_name !== 'Only Notes') {
                  logger.warn('⚠️ Skipping alert - report ${reportId} template is "${verifiedReport.template_name}", not "Only Notes"');
                  continue;
                }
                
                // CRITICAL VALIDATION: Ensure status is actually "skipped"
                if (verifiedReport.status !== 'skipped') {
                  logger.warn('⚠️ Skipping alert - report ${reportId} status is "${verifiedReport.status}", not "skipped"');
                  continue;
                }
                
                // CRITICAL VALIDATION: Verify TutorCruncher Report ID matches if provided
                if (lessonReportId && verifiedReport.lesson_id && verifiedReport.lesson_id !== lessonReportId) {
                  logger.warn('⚠️ Skipping alert - TutorCruncher Report ID mismatch: expected ${lessonReportId}, found ${verifiedReport.lesson_id}');
                  continue;
                }
                
                // Log skipped report but don't send Slack alert (too noisy for expected behavior)
                logger.info(`ℹ️ Skipped "Only Notes" report ${verifiedReport.id} - no notes found (no Slack alert)`);
              } catch (alertError) {
                logger.error({ error: alertError.message }, '❌ Failed to send Slack alert for skipped report:');
              }
            } else {
              logger.warn('⚠️ Skipping alert - report ${reportId} was not successfully updated');
            }
            
            continue; // Skip this student and continue with the next one
          } else {
            logger.info('✅ Notes found for "Only Notes" template - proceeding with email send');
          }
        }
        
        try {
          // Import required modules for sending emails
          const Handlebars = require('handlebars');
          const { getInstance: getBrevoEmailSender } = require('../../utils/brevo-email-sender');
          
          // Get the template HTML
          const { rows: templateRows } = await pool.query(
            'SELECT html FROM templates WHERE template_name = $1',
            [templateName]
          );
          
          if (templateRows.length === 0) {
            logger.error('❌ Template not found: ${templateName}');
            return;
          }
          
          // Compile the template with data
          const template = Handlebars.compile(templateRows[0].html);
          // Convert markdown to HTML for feedback (filter out literal "null" string as safety net)
          const feedbackHtml = (coachNotes && coachNotes.toLowerCase() !== 'null') ? markdownToHtml(coachNotes) : '';
          // Add tutor signature after feedback (first name only), but only if there are actual notes
          const tutorFirstName = (tutorName || '').split(' ')[0];
          const feedbackWithSignature = (feedbackHtml && tutorFirstName)
            ? `${feedbackHtml}<p style="margin-top: 16px; margin-bottom: 0; font-style: italic; ">- ${tutorFirstName}</p>`
            : feedbackHtml;
          const htmlContent = template({
            clientName: student.clientName,
            studentName: student.name,
            tutorName: tutorName,
            feedback: feedbackWithSignature
          });
          
      // Determine location for email sender
      const { getCurrentEnvironment } = require('../../config/environments');
      const envConfig = getCurrentEnvironment();
      const location = envConfig.name; // 'eastside', 'westside', 'production', etc.

      // Get email sender instance
      const emailSender = getBrevoEmailSender();
      if (!emailSender) {
        logger.warn('⚠️  Brevo email sender not available, skipping email send');
        throw new Error('Brevo email sender not available');
      }

      // Track all emails that were sent (for sent_emails field)
      const sentEmails = [];

      // Send email to parent/client (only once per appointment, not per student)
      // Check if we've already sent to this client email for this appointment
      const clientEmailKey = `${appointment.id}-${clientEmail}`;
      const shouldSendClientEmail = !clientEmailsSent.has(clientEmailKey);
      
      const feedbackText = coachNotes ? stripMarkdown(coachNotes) : 'No feedback provided';

      // Generate PNG screenshot of the lesson report for easy sharing
      const { generateLessonReportScreenshot } = require('../../utils/lesson-report-screenshot');
      let attachments = [];
      try {
        const screenshotBase64 = await generateLessonReportScreenshot(htmlContent);
        if (screenshotBase64) {
          attachments.push({
            content: screenshotBase64,
            name: `lesson-report-${student.name.replace(/[^a-zA-Z0-9]/g, '-')}.png`
          });
          logger.info('📸 Generated lesson report screenshot for ${student.name}');
        }
      } catch (screenshotError) {
        logger.warn('⚠️ Could not generate lesson report screenshot: ${screenshotError.message}');
        // Continue without attachment - email will still be sent
      }

      if (shouldSendClientEmail) {
        // Mark this client email as sent for this appointment
        clientEmailsSent.add(clientEmailKey);

        const clientEmailResult = await emailSender.sendEmail({
          to: clientEmail,
          subject: emailSubject,
          html: htmlContent,
          text: `Lesson Report for ${student.name}\n\nTutor: ${tutorName}\nFeedback: ${feedbackText}`,
          location: location, // Pass location for sender address
          attachments: attachments.length > 0 ? attachments : undefined
        });
        
        if (clientEmailResult.success) {
          // Validate that messageId exists
          if (!clientEmailResult.messageId) {
            logger.error('⚠️ Brevo API returned success but no messageId for report ${reportId}');
            logger.error({ error: JSON.stringify(clientEmailResult.data || {}, null, 2) }, '   Response data:');
            
            // Send alert for missing message ID
            try {
              const SlackAlerts = require('../../utils/slackAlerts');
              const slackAlerts = new SlackAlerts();
              const { getCurrentEnvironment } = require('../../config/environments');
              const envConfig = getCurrentEnvironment();
              
              await slackAlerts.sendPerformanceAlert({
                type: 'warning',
                category: 'lesson_reports',
                message: `⚠️ Brevo API success but no messageId returned`,
                threshold: 'N/A',
                environment: envConfig.name,
                fields: [
                  {
                    title: 'Report ID',
                    value: reportId.toString(),
                    short: true
                  },
                  {
                    title: 'Student',
                    value: student.name,
                    short: true
                  },
                  {
                    title: 'Client Email',
                    value: clientEmail,
                    short: true
                  },
                  {
                    title: 'Brevo Response',
                    value: JSON.stringify(clientEmailResult.data || {}).substring(0, 200),
                    short: false
                  },
                  {
                    title: 'Environment',
                    value: envConfig.name,
                    short: true
                  }
                ],
                color: 'warning'
              });
            } catch (alertError) {
              logger.error({ error: alertError.message }, '❌ Failed to send Slack alert:');
            }
          }
          
          // Track successful parent email send
          sentEmails.push({
            email: clientEmail,
            studentName: student.name,
            type: 'client',
            success: true,
            messageId: clientEmailResult.messageId || null
          });
          
          // Update the report status with parent email message ID
          // Set both date_sent and sent_at to track when email was sent
          // Only set brevo_message_id if messageId exists
          if (clientEmailResult.messageId) {
            await pool.query(`
              UPDATE client_reports 
              SET status = 'sent', date_sent = NOW(), sent_at = NOW(), brevo_message_id = $1
              WHERE id = $2
            `, [clientEmailResult.messageId, reportId]);
            logger.info('✅ Auto-sent report ${reportId} to parent ${clientEmail} with subject: ${emailSubject} (Brevo ID: ${clientEmailResult.messageId})');
          } else {
            // Still mark as sent but without Brevo ID
            await pool.query(`
              UPDATE client_reports 
              SET status = 'sent', date_sent = NOW(), sent_at = NOW()
              WHERE id = $1
            `, [reportId]);
            logger.info('⚠️ Auto-sent report ${reportId} to parent ${clientEmail} but Brevo API didn\'t return messageId');
          }
        } else {
          // Track failed parent email send
          // Properly stringify error to avoid "[object Object]"
          const errorMessage = typeof clientEmailResult.error === 'object' 
            ? JSON.stringify(clientEmailResult.error) 
            : String(clientEmailResult.error || 'Unknown error');
            
            logger.error('❌ Brevo API failed for report ${reportId}, attempting SMTP fallback...');
            
            // Fallback to SMTP if Brevo API fails
            try {
              const mailOptions = {
                from: '"Acme Operations" <support@acmeops.com>',
                to: clientEmail,
                subject: emailSubject,
                html: htmlContent,
                text: `Lesson Report for ${student.name}\n\nTutor: ${tutorName}\nFeedback: ${feedbackText}`
              };
              
              const smtpResult = await transporter.sendMail(mailOptions);
              logger.info('✅ Email sent via SMTP fallback to ${clientEmail} for report ${reportId}');
              
              // Track successful SMTP send
              sentEmails.push({
                email: clientEmail,
                studentName: student.name,
                type: 'client',
                success: true,
                messageId: smtpResult.messageId,
                sentVia: 'SMTP' // Mark as SMTP fallback
              });
              
              // Update report status - mark as sent but note it was via SMTP (no Brevo ID)
              await pool.query(`
                UPDATE client_reports 
                SET status = 'sent', date_sent = NOW(), sent_at = NOW()
                WHERE id = $1
              `, [reportId]);
              
              logger.info('✅ Report ${reportId} marked as sent via SMTP fallback');
              
            } catch (smtpError) {
              // Both Brevo and SMTP failed
              const smtpErrorMessage = smtpError.message || (typeof smtpError === 'object' ? JSON.stringify(smtpError) : String(smtpError || 'Unknown error'));
              logger.error({ err: smtpErrorMessage }, '❌ SMTP fallback also failed for report ${reportId}:');
              
              sentEmails.push({
                email: clientEmail,
                studentName: student.name,
                type: 'client',
                success: false,
                error: `Brevo failed: ${errorMessage}; SMTP failed: ${smtpErrorMessage}`
              });
              
              // Send alert for complete failure
              try {
                const SlackAlerts = require('../../utils/slackAlerts');
                const slackAlerts = new SlackAlerts();
                const { getCurrentEnvironment } = require('../../config/environments');
                const envConfig = getCurrentEnvironment();
                
                await slackAlerts.sendPerformanceAlert({
                  type: 'critical',
                  category: 'lesson_reports',
                  message: `❌ Both Brevo API and SMTP failed for lesson report`,
                  threshold: 'N/A',
                  environment: envConfig.name,
                  fields: [
                    {
                      title: 'Report ID',
                      value: reportId.toString(),
                      short: true
                    },
                    {
                      title: 'Student',
                      value: student.name,
                      short: true
                    },
                    {
                      title: 'Client Email',
                      value: clientEmail,
                      short: true
                    },
                    {
                      title: 'Brevo Error',
                      value: errorMessage.substring(0, 200),
                      short: false
                    },
                    {
                      title: 'SMTP Error',
                      value: smtpErrorMessage.substring(0, 200),
                      short: false
                    },
                    {
                      title: 'Environment',
                      value: envConfig.name,
                      short: true
                    }
                  ],
                  color: 'danger'
                });
              } catch (alertError) {
                logger.error({ error: alertError.message }, '❌ Failed to send Slack alert:');
              }
              
              throw new Error(`Both Brevo and SMTP failed: Brevo: ${errorMessage}; SMTP: ${smtpErrorMessage}`);
            }
          }
        } else {
          // Client email was already sent for this appointment (sibling), skip sending again
          // But still mark THIS report as sent since the parent received the email via the sibling's report
          logger.info('ℹ️ Client email ${clientEmail} already sent for appointment ${appointment.id}, marking sibling report ${reportId} as sent');

          // Track that this was skipped (sent to sibling)
          sentEmails.push({
            email: clientEmail,
            studentName: student.name,
            type: 'client',
            success: true,
            skipped: true,
            reason: 'Already sent to sibling on same appointment'
          });

          // Update report status to 'sent' - the parent already received the email
          await pool.query(`
            UPDATE client_reports
            SET status = 'sent', date_sent = NOW(), sent_at = NOW()
            WHERE id = $1
          `, [reportId]);
          logger.info('✅ Marked sibling report ${reportId} as sent (parent already received email)');
        }

        // For school/club lessons, also send client emails to ALL OTHER parents
        // This ensures every parent in the class receives the lesson report
        if (allStudentsForSchoolClub && allStudentsForSchoolClub.length > 1) {
          logger.info('🏫 School/club lesson - sending client emails to all ${allStudentsForSchoolClub.length} parents');

          for (const otherStudent of allStudentsForSchoolClub) {
            // Skip if this is the student we already processed above
            if (otherStudent.recipientId === student.recipientId) {
              continue;
            }

            // Fetch client email for this student
            let otherClientEmail = null;
            try {
              // Try local database first
              const { rows: clientRows } = await pool.query(`
                SELECT email FROM clients WHERE client_id = $1
              `, [otherStudent.clientId]);

              if (clientRows.length > 0 && clientRows[0].email) {
                otherClientEmail = clientRows[0].email.trim();
              }
            } catch (dbErr) {
              logger.info('ℹ️ Could not fetch client email from DB for ${otherStudent.clientName}, trying API');
            }

            // Try TutorCruncher API if not found in DB
            if (!otherClientEmail && otherStudent.clientId) {
              try {
                const clientResponse = await tutorCruncherAPI.get(`clients/${otherStudent.clientId}/`);
                if (clientResponse.data && clientResponse.data.user && clientResponse.data.user.email) {
                  otherClientEmail = clientResponse.data.user.email.trim();
                }
              } catch (apiErr) {
                logger.info('ℹ️ Could not fetch client email from API for ${otherStudent.clientName}: ${apiErr.message}');
              }
            }

            if (!otherClientEmail) {
              logger.info('⚠️ No email found for client ${otherStudent.clientName}, skipping');
              sentEmails.push({
                email: null,
                studentName: otherStudent.name,
                clientName: otherStudent.clientName,
                type: 'client',
                success: false,
                error: 'No client email found'
              });
              continue;
            }

            // Check if we've already sent to this client email
            const otherClientEmailKey = `${appointment.id}-${otherClientEmail}`;
            if (clientEmailsSent.has(otherClientEmailKey)) {
              logger.info('ℹ️ Client email ${otherClientEmail} already sent for appointment ${appointment.id}, skipping');
              continue;
            }

            // Send the email
            try {
              clientEmailsSent.add(otherClientEmailKey);
              const otherClientEmailResult = await emailSender.sendEmail({
                to: otherClientEmail,
                subject: emailSubject,
                html: htmlContent,
                text: `Lesson Report for ${otherStudent.name}\n\nTutor: ${tutorName}\nFeedback: ${feedbackText}`,
                location: location,
                attachments: attachments.length > 0 ? attachments : undefined
              });

              if (otherClientEmailResult.success) {
                sentEmails.push({
                  email: otherClientEmail,
                  studentName: otherStudent.name,
                  clientName: otherStudent.clientName,
                  type: 'client',
                  success: true,
                  messageId: otherClientEmailResult.messageId || null
                });
                logger.info('✅ Sent report to additional parent ${otherClientEmail} (${otherStudent.clientName}) for student ${otherStudent.name}');
              } else {
                sentEmails.push({
                  email: otherClientEmail,
                  studentName: otherStudent.name,
                  clientName: otherStudent.clientName,
                  type: 'client',
                  success: false,
                  error: otherClientEmailResult.error
                });
                logger.error('❌ Failed to send report to ${otherClientEmail}: ${otherClientEmailResult.error}');
              }
            } catch (sendErr) {
              sentEmails.push({
                email: otherClientEmail,
                studentName: otherStudent.name,
                clientName: otherStudent.clientName,
                type: 'client',
                success: false,
                error: sendErr.message
              });
              logger.error('❌ Error sending to ${otherClientEmail}: ${sendErr.message}');
            }
          }
        }

          // For school/club lessons, send to ALL students, not just the one on the report
          // For home/online lessons, send to just the student on the report
          const studentsToEmail = allStudentsForSchoolClub || [student];
          
          logger.info('📧 Sending emails to ${studentsToEmail.length} student(s) for report ${reportId}');
          
          for (const studentToEmail of studentsToEmail) {
            // Get student email from local database or API
            let thisStudentEmail = null;
            
            // First check if this is the current student (we already have their email)
            if (studentToEmail.recipientId === student.recipientId) {
              thisStudentEmail = studentEmail;
            } else {
              // Fetch email for this student
              try {
                const { rows: recipientEmailRows } = await pool.query(`
                  SELECT email FROM recipients WHERE recipient_id = $1
                `, [studentToEmail.recipientId.toString()]);
                
                if (recipientEmailRows.length > 0 && recipientEmailRows[0].email) {
                  thisStudentEmail = recipientEmailRows[0].email.trim();
                }
              } catch (dbErr) {
                logger.info('ℹ️ Could not fetch email from DB for ${studentToEmail.name}, trying API');
              }
              
              // If no email from DB, try TutorCruncher API
              if (!thisStudentEmail && studentToEmail.recipientId) {
                try {
                  const recipientResponse = await tutorCruncherAPI.get(`recipients/${studentToEmail.recipientId}/`);
                  if (recipientResponse.data && recipientResponse.data.user && recipientResponse.data.user.email) {
                    thisStudentEmail = recipientResponse.data.user.email.trim();
                  }
                } catch (apiErr) {
                  logger.info('ℹ️ Could not fetch email from API for ${studentToEmail.name}: ${apiErr.message}');
                }
              }
            }
            
            // Send email to this student if we have their email
            if (thisStudentEmail && thisStudentEmail.trim().length > 0) {
              // Skip if this email was already sent (same as client email or duplicate)
              if (thisStudentEmail.toLowerCase() === clientEmail.toLowerCase()) {
                logger.info('⏭️ Skipping ${studentToEmail.name} - email matches client email (already sent)');
                continue;
              }
              
              try {
                const studentEmailResult = await emailSender.sendEmail({
                  to: thisStudentEmail,
                  subject: emailSubject,
                  html: htmlContent,
                  text: `Lesson Report for ${studentToEmail.name}\n\nTutor: ${tutorName}\nFeedback: ${feedbackText}`,
                  location: location,
                  attachments: attachments.length > 0 ? attachments : undefined
                });
                
                if (studentEmailResult.success) {
                  // Track successful student email send
                  sentEmails.push({
                    email: thisStudentEmail,
                    studentName: studentToEmail.name,
                    type: 'student',
                    success: true,
                    messageId: studentEmailResult.messageId
                  });
                  logger.info('✅ Auto-sent report ${reportId} to student ${thisStudentEmail} (${studentToEmail.name}) with subject: ${emailSubject}');
                } else {
                  // Track failed student email send
                  sentEmails.push({
                    email: thisStudentEmail,
                    studentName: studentToEmail.name,
                    type: 'student',
                    success: false,
                    error: studentEmailResult.error
                  });
                  logger.error({ error: studentEmailResult.error }, '⚠️ Failed to send report ${reportId} to student ${thisStudentEmail}:');
                }
              } catch (studentEmailError) {
                // Track failed student email send
                sentEmails.push({
                  email: thisStudentEmail,
                  studentName: studentToEmail.name,
                  type: 'student',
                  success: false,
                  error: studentEmailError.message
                });
                logger.error({ err: studentEmailError }, '⚠️ Error sending report ${reportId} to student ${thisStudentEmail}:');
              }
            } else {
              logger.info('ℹ️ No email available for ${studentToEmail.name}, skipping');
              sentEmails.push({
                email: null,
                studentName: studentToEmail.name,
                type: 'student',
                success: false,
                error: 'No email found'
              });
            }
          }
          
          // Store sent_emails in database (same as manual send endpoint)
          if (sentEmails.length > 0) {
            try {
              await pool.query(`
                UPDATE client_reports SET sent_emails = $1 WHERE id = $2
              `, [JSON.stringify(sentEmails), reportId]);
              logger.info('✅ Stored ${sentEmails.length} sent email record(s) for report ${reportId}');
            } catch (updateError) {
              logger.error({ err: updateError }, '❌ Error storing sent_emails:');
              // Don't fail the process if storing sent_emails fails
            }
          }
          
        } catch (emailError) {
          logger.error({ err: emailError }, '❌ Email sending failed for report ${reportId}:');
          
          // Send Slack alert for email sending failures
          try {
            const SlackAlerts = require('../../utils/slackAlerts');
            const slackAlerts = new SlackAlerts();
            const { getCurrentEnvironment } = require('../../config/environments');
            const envConfig = getCurrentEnvironment();
            
            await slackAlerts.sendPerformanceAlert({
              type: 'high',
              category: 'lesson_reports',
              message: `📧 Failed to send lesson report email for ${student.name}`,
              threshold: 'N/A',
              environment: envConfig.name,
              fields: [
                {
                  title: 'Report ID',
                  value: reportId.toString(),
                  short: true
                },
                {
                  title: 'Student',
                  value: student.name,
                  short: true
                },
                {
                  title: 'Client Email',
                  value: clientEmail,
                  short: true
                },
                {
                  title: 'Error',
                  value: typeof emailError === 'object' && emailError.message 
                    ? emailError.message 
                    : typeof emailError === 'object' 
                      ? JSON.stringify(emailError) 
                      : String(emailError || 'Unknown error'),
                  short: false
                },
                {
                  title: 'Environment',
                  value: envConfig.name,
                  short: true
                },
                {
                  title: 'Recommended Actions',
                  value: '• Check Brevo API status\n• Verify BREVO_API_KEY configuration\n• Review email sending logs',
                  short: false
                }
              ],
              color: 'warning'
            });
          } catch (alertError) {
            logger.error({ error: alertError.message }, '❌ Failed to send Slack alert for email error:');
            // Don't fail the process if alert sending fails
          }
          
          // Don't fail the entire process if one email fails
        }
      } else {
        if (!envConfig.autoSendClientReports) {
          logger.info('⏸️ Auto-sending client reports is DISABLED for this environment');
        } else if (!lessonReportsEnabled) {
          logger.info('⏸️ Auto-sending client reports is DISABLED via app settings toggle');
        }
      }
    }
    } finally {
      // Release advisory lock for school/club lessons
      if (advisoryLockAcquired && isSchoolOrClubLesson && appointment && appointment.id) {
        try {
          await pool.query('SELECT pg_advisory_unlock($1)', [appointment.id]);
          logger.info('🔓 School/club lesson: Released lock for appointment ${appointment.id}');
        } catch (unlockError) {
          logger.error({ error: unlockError.message }, '⚠️ Error releasing advisory lock for appointment ${appointment.id}:');
          // Lock will be released automatically when connection closes
        }
      }
    }

  } catch (error) {
    logger.error({ err: error }, '❌ Error processing CREATED_REPORT:');
    logger.error({ error: error.stack }, 'Error stack:');
    logger.error({ errorMessage: error.message, code: error.code, detail: error.detail }, 'Error details');
    
    // Send Slack alert for webhook processing errors
    try {
      const SlackAlerts = require('../../utils/slackAlerts');
      const slackAlerts = new SlackAlerts();
      const { getCurrentEnvironment } = require('../../config/environments');
      const envConfig = getCurrentEnvironment();
      
      await slackAlerts.sendPerformanceAlert({
        type: 'critical',
        category: 'lesson_reports',
        message: `❌ CREATED_REPORT webhook processing failed: ${error.message}`,
        threshold: 'N/A',
        environment: envConfig.name,
        fields: [
          {
            title: 'Error Type',
            value: error.name || 'Unknown',
            short: true
          },
          {
            title: 'Error Message',
            value: error.message || 'Unknown error',
            short: false
          },
          {
            title: 'Report URL',
            value: report?.url || 'N/A',
            short: false
          },
          {
            title: 'Appointment ID',
            value: appointment?.id?.toString() || 'N/A',
            short: true
          },
          {
            title: 'Environment',
            value: envConfig.name,
            short: true
          },
          {
            title: 'Recommended Actions',
            value: '• Check Heroku logs for full error details\n• Review webhook payload structure\n• Verify database connection',
            short: false
          }
        ],
        color: 'danger'
      });
    } catch (alertError) {
      logger.error({ error: alertError.message }, '❌ Failed to send Slack alert for webhook error:');
      // Don't fail the webhook if alert sending fails
    }
    
    throw error;
  }
}

// Handle adhoc charge webhook events (CREATED_AN_ADHOC_CHARGE, EDITED_AN_ADHOC_CHARGE)
async function handleAdhocChargeWebhook(event) {
  try {
    logger.info('🔄 Starting handleAdhocChargeWebhook function');
    const charge = event.subject;
    
    if (!charge || !charge.id) {
      logger.error('❌ Missing charge data or charge ID in webhook');
      return;
    }

    logger.info('📊 Processing adhoc charge ${charge.id} - Action: ${event.action}');

    // Extract appointment ID if it's an object or a number
    let appointmentId = null;
    if (charge.appointment) {
      if (typeof charge.appointment === 'object' && charge.appointment.id) {
        appointmentId = charge.appointment.id;
      } else if (typeof charge.appointment === 'number') {
        appointmentId = charge.appointment;
      }
    }

    // Extract service ID if it's an object or a number
    let serviceId = null;
    if (charge.service) {
      if (typeof charge.service === 'object' && charge.service.id) {
        serviceId = charge.service.id;
      } else if (typeof charge.service === 'number') {
        serviceId = charge.service;
      }
    }

    // Extract agent ID if it's an object or a number
    let agentId = null;
    if (charge.agent) {
      if (typeof charge.agent === 'object' && charge.agent.id) {
        agentId = charge.agent.id;
      } else if (typeof charge.agent === 'number') {
        agentId = charge.agent;
      }
    }

    // Extract client ID if it's an object or a number
    let clientId = null;
    if (charge.client) {
      if (typeof charge.client === 'object' && charge.client.id) {
        clientId = charge.client.id;
      } else if (typeof charge.client === 'number') {
        clientId = charge.client;
      }
    }

    // Extract category URL from category object
    let categoryUrl = null;
    if (charge.category && typeof charge.category === 'object') {
      categoryUrl = charge.category.url || null;
    }

    // Insert or update adhoc charge record
    const insertQuery = `
      INSERT INTO adhoc_charges (
        id, agent_id, appointment_id, category_id, category_name, category_url,
        client_id, contractor_id, contractor_first_name, contractor_last_name, contractor_email, contractor_role_type,
        creator_id, creator_first_name, creator_last_name, creator_email, creator_role_type,
        currency, currency_conversion, date_occurred, description, net_gross, pay_contractor,
        charge_client_forex, client_cost, service_id, tax_amount,
        invoices, payment_orders, last_updated
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17, $18, $19, $20, $21, $22, $23, $24, $25, $26, $27, $28, $29, NOW())
      ON CONFLICT (id) DO UPDATE SET
        agent_id = EXCLUDED.agent_id,
        appointment_id = EXCLUDED.appointment_id,
        category_id = EXCLUDED.category_id,
        category_name = EXCLUDED.category_name,
        category_url = EXCLUDED.category_url,
        client_id = EXCLUDED.client_id,
        contractor_id = EXCLUDED.contractor_id,
        contractor_first_name = EXCLUDED.contractor_first_name,
        contractor_last_name = EXCLUDED.contractor_last_name,
        contractor_email = EXCLUDED.contractor_email,
        contractor_role_type = EXCLUDED.contractor_role_type,
        creator_id = EXCLUDED.creator_id,
        creator_first_name = EXCLUDED.creator_first_name,
        creator_last_name = EXCLUDED.creator_last_name,
        creator_email = EXCLUDED.creator_email,
        creator_role_type = EXCLUDED.creator_role_type,
        currency = EXCLUDED.currency,
        currency_conversion = EXCLUDED.currency_conversion,
        date_occurred = EXCLUDED.date_occurred,
        description = EXCLUDED.description,
        net_gross = EXCLUDED.net_gross,
        pay_contractor = EXCLUDED.pay_contractor,
        charge_client_forex = EXCLUDED.charge_client_forex,
        client_cost = EXCLUDED.client_cost,
        service_id = EXCLUDED.service_id,
        tax_amount = EXCLUDED.tax_amount,
        invoices = EXCLUDED.invoices,
        payment_orders = EXCLUDED.payment_orders,
        last_updated = NOW()
    `;

    await pool.query(insertQuery, [
      charge.id,
      agentId,
      appointmentId,
      charge.category_id,
      charge.category_name,
      categoryUrl,
      clientId,
      charge.contractor?.id || null,
      charge.contractor?.first_name || null,
      charge.contractor?.last_name || null,
      charge.contractor?.email || null,
      charge.contractor?.role_type || null,
      charge.creator?.id || null,
      charge.creator?.first_name || null,
      charge.creator?.last_name || null,
      charge.creator?.email || null,
      charge.creator?.role_type || null,
      charge.currency || 'USD',
      charge.currency_conversion || null,
      charge.date_occurred,
      charge.description,
      charge.net_gross,
      charge.pay_contractor,
      charge.charge_client_forex || null,
      charge.client_cost || null,
      serviceId,
      charge.tax_amount || null,
      charge.invoices ? JSON.stringify(charge.invoices) : '[]',
      charge.payment_orders ? JSON.stringify(charge.payment_orders) : '[]'
    ]);

    logger.info('✅ Successfully stored adhoc charge ${charge.id} in database');
    
  } catch (error) {
    logger.error({ err: error }, '❌ Error processing adhoc charge webhook:');
    logger.error({ error: error.stack }, 'Error stack:');
    logger.error({ errorMessage: error.message, code: error.code, detail: error.detail }, 'Error details');
    throw error;
  }
}

// Handle Tender (Job Application) webhook events
async function handleTenderWebhook(event, pool) {
  // Use pool from parameter, or fall back to global pool
  const dbPool = pool || global.pool;
  
  if (!dbPool) {
    logger.error('❌ No database pool available for tender webhook');
    return;
  }
  
  try {
    logger.info('🔄 Starting handleTenderWebhook function');
    const tender = event.subject;
    
    if (!tender || !tender.id) {
      logger.error('❌ Missing tender data or tender ID in webhook');
      return;
    }

    logger.info('📊 Processing tender ${tender.id} - Action: ${event.action}');

    // Fetch complete tender data from TutorCruncher API to ensure we have all fields
    let fullTender = tender;
    try {
      const response = await tutorCruncherAPI.get(`/tenders/${tender.id}/`);
      fullTender = response.data;
    } catch (error) {
      logger.warn({ data: error.message }, '⚠️ Could not fetch full tender data for ${tender.id}, using webhook data:');
    }

    // Extract IDs - handle both object and ID formats
    const tenderId = fullTender.id;
    const serviceId = fullTender.service?.id || fullTender.service || null;
    const contractorId = fullTender.contractor?.id || fullTender.contractor || null;
    const creatorId = fullTender.creator?.id || fullTender.creator || null;

    // Extract creator info
    const creatorFirstName = fullTender.creator?.first_name || fullTender.creator?.user?.first_name || null;
    const creatorLastName = fullTender.creator?.last_name || fullTender.creator?.user?.last_name || null;
    const creatorEmail = fullTender.creator?.email || fullTender.creator?.user?.email || null;

    // Extract status - map TutorCruncher status to our status values
    let status = 'pending';
    if (fullTender.status) {
      const statusLower = fullTender.status.toLowerCase();
      if (['pending', 'requested', 'accepted', 'rejected', 'withdrawn'].includes(statusLower)) {
        status = statusLower;
      } else {
        // Map other statuses
        if (statusLower.includes('accept')) status = 'accepted';
        else if (statusLower.includes('reject')) status = 'rejected';
        else if (statusLower.includes('withdraw')) status = 'withdrawn';
        else if (statusLower.includes('request')) status = 'requested';
      }
    }

    // Extract description
    const description = fullTender.description || fullTender.message || null;

    // Extract dates
    const dateCreated = fullTender.date_created || fullTender.created || fullTender.created_at || new Date();
    const dateUpdated = fullTender.date_updated || fullTender.updated || fullTender.updated_at || null;

    // Insert or update job application record
    const insertQuery = `
      INSERT INTO job_applications (
        id, service_id, contractor_id, description, status,
        date_created, date_updated,
        creator_id, creator_first_name, creator_last_name, creator_email,
        last_updated, created_at
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, NOW(), COALESCE($6, NOW()))
      ON CONFLICT (id) DO UPDATE SET
        service_id = EXCLUDED.service_id,
        contractor_id = EXCLUDED.contractor_id,
        description = EXCLUDED.description,
        status = EXCLUDED.status,
        date_created = EXCLUDED.date_created,
        date_updated = EXCLUDED.date_updated,
        creator_id = EXCLUDED.creator_id,
        creator_first_name = EXCLUDED.creator_first_name,
        creator_last_name = EXCLUDED.creator_last_name,
        creator_email = EXCLUDED.creator_email,
        last_updated = NOW()
    `;

    await dbPool.query(insertQuery, [
      tenderId,
      serviceId,
      contractorId,
      description,
      status,
      dateCreated,
      dateUpdated,
      creatorId,
      creatorFirstName,
      creatorLastName,
      creatorEmail
    ]);

    logger.info('✅ Successfully stored job application ${tenderId} in database');
    
  } catch (error) {
    logger.error({ err: error }, '❌ Error processing tender webhook:');
    logger.error({ error: error.stack }, 'Error stack:');
    logger.error({ errorMessage: error.message, code: error.code, detail: error.detail }, 'Error details');
    throw error;
  }
}

// Handle Review webhook events
async function handleReviewWebhook(event, pool) {
  // Use pool from parameter, or fall back to global pool
  const dbPool = pool || global.pool;
  
  if (!dbPool) {
    logger.error('❌ No database pool available for review webhook');
    return;
  }
  
  try {
    logger.info('🔄 Starting handleReviewWebhook function');
    const review = event.subject;
    
    if (!review || !review.id) {
      logger.error('❌ Missing review data or review ID in webhook');
      return;
    }

    logger.info('📊 Processing review ${review.id} - Action: ${event.action}');

    // Fetch complete review data from TutorCruncher API to ensure we have all fields
    let fullReview = review;
    try {
      const response = await tutorCruncherAPI.get(`/reviews/${review.id}/`);
      fullReview = response.data;
    } catch (error) {
      logger.warn({ data: error.message }, '⚠️ Could not fetch full review data for ${review.id}, using webhook data:');
    }

    // Extract client and contractor info
    const reviewId = fullReview.id;
    const clientId = fullReview.client?.id || fullReview.client || null;
    const clientName = fullReview.client 
      ? `${fullReview.client.first_name || ''} ${fullReview.client.last_name || ''}`.trim() 
      : null;
    
    const contractorId = fullReview.contractor?.id || fullReview.contractor || null;
    const contractorName = fullReview.contractor 
      ? `${fullReview.contractor.first_name || ''} ${fullReview.contractor.last_name || ''}`.trim() 
      : null;

    // Extract review text and rating from extra_attrs
    let reviewTextValue = null;
    let starRatingValue = null;
    
    if (fullReview.extra_attrs && Array.isArray(fullReview.extra_attrs)) {
      const reviewTextAttr = fullReview.extra_attrs.find(attr => 
        attr.machine_name === 'review_details' || attr.name === 'Review Details'
      );
      if (reviewTextAttr && reviewTextAttr.value) {
        reviewTextValue = reviewTextAttr.value;
      }

      const starRatingAttr = fullReview.extra_attrs.find(attr => 
        attr.machine_name === 'review_stars' || attr.name === 'Review Rating'
      );
      if (starRatingAttr && starRatingAttr.value) {
        // Extract numeric value from strings like "5/5 stars" or "5"
        const match = starRatingAttr.value.match(/(\d+)/);
        if (match) {
          starRatingValue = parseFloat(match[1]);
        }
      }
    }

    // Extract date
    const dateCreated = fullReview.date_created || fullReview.created || fullReview.created_at || new Date();

    // Insert or update review record
    // Note: We store the entire extra_attrs as JSON for review_text_raw, and extract rating separately
    const insertQuery = `
      INSERT INTO reviews (
        review_id, client_id, client_name, contractor_id, contractor_name, 
        extra_attrs_value, star_rating_value, date_created
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
      ON CONFLICT (review_id) DO UPDATE SET
        client_id = EXCLUDED.client_id,
        client_name = EXCLUDED.client_name,
        contractor_id = EXCLUDED.contractor_id,
        contractor_name = EXCLUDED.contractor_name,
        extra_attrs_value = EXCLUDED.extra_attrs_value,
        star_rating_value = EXCLUDED.star_rating_value,
        date_created = EXCLUDED.date_created
    `;

    // Store extra_attrs as JSON string for review_text_raw
    const extraAttrsJson = JSON.stringify(fullReview.extra_attrs || []);

    await dbPool.query(insertQuery, [
      reviewId,
      clientId,
      clientName,
      contractorId,
      contractorName,
      extraAttrsJson,
      starRatingValue,
      dateCreated
    ]);

    logger.info('✅ Successfully stored review ${reviewId} in database');
    
  } catch (error) {
    logger.error({ err: error }, '❌ Error processing review webhook:');
    logger.error({ error: error.stack }, 'Error stack:');
    logger.error({ errorMessage: error.message, code: error.code, detail: error.detail }, 'Error details');
    throw error;
  }
}

// Handle Invoice webhook events
async function handleInvoiceWebhook(event) {
  try {
    logger.info('🔄 Starting handleInvoiceWebhook function');
    const invoice = event.subject;
    
    if (!invoice || !invoice.id) {
      logger.error('❌ Missing invoice data or invoice ID in webhook');
      return;
    }

    logger.info('📊 Processing invoice ${invoice.id} - Action: ${event.action}');
    logger.info('📋 Webhook invoice status: ${invoice.status || \'not provided\'}');

    // Get current status from database before updating
    let oldStatus = null;
    try {
      const currentStatusResult = await pool.query(
        'SELECT status FROM invoices WHERE id = $1',
        [invoice.id]
      );
      if (currentStatusResult.rows.length > 0) {
        oldStatus = currentStatusResult.rows[0].status;
        logger.info('📊 Current database status for invoice ${invoice.id}: ${oldStatus}');
      } else {
        logger.info('📊 Invoice ${invoice.id} not found in database - will be created');
      }
    } catch (statusError) {
      logger.warn('⚠️ Could not fetch current status: ${statusError.message}');
    }

    // Fetch complete invoice data from TutorCruncher API and sync all details including charges
    // Use syncInvoiceDetails helper to capture all fields: date_void, still_to_pay, charges array, etc.
    let fullInvoice = invoice;
    try {
      const { syncInvoiceDetails } = require('../../scripts/sync-invoice-details');
      const client = await pool.connect();
      try {
        const syncResult = await syncInvoiceDetails(invoice.id, client);
        if (syncResult.success) {
          logger.info('✅ Synced invoice ${invoice.id} with ${syncResult.chargesCount} charges via webhook');
          // Fetch the updated invoice from database to get all synced fields
          const dbResult = await pool.query('SELECT * FROM invoices WHERE id = $1', [invoice.id]);
          if (dbResult.rows.length > 0) {
            fullInvoice = dbResult.rows[0];
          }
        } else {
          logger.warn('⚠️ Sync failed for invoice ${invoice.id}: ${syncResult.error}');
          // Fallback to API fetch for status tracking
          const response = await tutorCruncherAPI.get(`/invoices/${invoice.id}/`);
          fullInvoice = response.data;
        }
      } finally {
        client.release();
      }
      
      // Log status change if it occurred
      if (oldStatus && oldStatus !== fullInvoice.status) {
        logger.info('🔄 STATUS CHANGE DETECTED for invoice ${invoice.id} (${fullInvoice.display_id || \'N/A\'}): ${oldStatus} → ${fullInvoice.status}');
      }
    } catch (error) {
      logger.warn({ data: error.message }, '⚠️ Could not sync invoice details for ${invoice.id}, trying API fetch:');
      try {
        const response = await tutorCruncherAPI.get(`/invoices/${invoice.id}/`);
        fullInvoice = response.data;
        logger.info('✅ Fetched full invoice data via API - Status: ${fullInvoice.status}');
      } catch (apiError) {
        logger.warn({ data: apiError.message }, '⚠️ Could not fetch full invoice data for ${invoice.id}, using webhook data:');
        // Still log status change if we have old status
        if (oldStatus && invoice.status && oldStatus !== invoice.status) {
          logger.info('🔄 STATUS CHANGE DETECTED (from webhook data) for invoice ${invoice.id}: ${oldStatus} → ${invoice.status}');
        }
      }
    }

    // Check invoice state BEFORE updating (to detect if it was previously sent)
    // This needs to happen before we update the invoice in the database
    const existingInvoiceCheck = await pool.query(
      'SELECT date_sent, status FROM invoices WHERE id = $1',
      [fullInvoice.id]
    );
    const existingRow = existingInvoiceCheck.rows[0];
    const wasPreviouslySent = existingRow?.date_sent !== null && existingRow?.date_sent !== undefined;
    const previousDateSent = existingRow?.date_sent;
    const isNewlySent = fullInvoice.date_sent && 
      (!previousDateSent || (fullInvoice.date_sent && new Date(fullInvoice.date_sent).getTime() > new Date(previousDateSent).getTime()));

    // Note: Invoice details (including charges) are already synced above via syncInvoiceDetails
    // Fetch updated invoice from database to get all synced fields
    const verifyResult = await pool.query(
      'SELECT status, date_sent FROM invoices WHERE id = $1',
      [fullInvoice.id]
    );
    const savedInvoice = verifyResult.rows[0];
    const savedStatus = savedInvoice?.status;
    const newStatus = fullInvoice.status || savedStatus;
    
    if (savedStatus && newStatus && savedStatus !== newStatus) {
      logger.error('❌ STATUS MISMATCH for invoice ${fullInvoice.id}: Expected ${newStatus}, but database has ${savedStatus}');
    } else {
      logger.info('✅ Successfully stored invoice ${fullInvoice.id} (${fullInvoice.display_id || \'N/A\'}) with status: ${newStatus || savedStatus}');
      if (oldStatus && oldStatus !== (newStatus || savedStatus)) {
        logger.info('✅ Status update confirmed: ${oldStatus} → ${newStatus || savedStatus}');
      }
    }
    
    // If invoice was sent/emailed, check if it's a reminder or initial send
    if (event.action === 'SENT_AN_INVOICE' || event.action === 'SENT_INVOICE' || 
        event.action === 'EMAILED_AN_INVOICE' || event.action === 'EMAILED_INVOICE') {
      try {
        // Check existing reminders count
        const existingReminders = await pool.query(
          `SELECT COUNT(*) as count FROM invoice_reminders WHERE invoice_id = $1`,
          [fullInvoice.id]
        );
        
        const reminderCount = parseInt(existingReminders.rows[0]?.count || 0);
        
        // Determine if this is a reminder:
        // 1. If there are already reminders, this is definitely another reminder
        // 2. If invoice was previously sent (had date_sent in DB before this update), this is a reminder
        // 3. Otherwise, if this is the first time we're seeing this invoice with date_sent, it's the initial send
        const isReminder = reminderCount > 0 || (wasPreviouslySent && fullInvoice.date_sent);
        
        if (isReminder) {
          // This is a reminder send
          const reminderType = reminderCount === 0 ? 'first' : 
                               reminderCount === 1 ? 'second' : 
                               reminderCount === 2 ? 'third' : 'final';
          
          await pool.query(
            `INSERT INTO invoice_reminders (
              invoice_id, client_id, reminder_type, reminder_method,
              reminder_message, email_subject, reminder_sent_at
            ) VALUES ($1, $2, $3, $4, $5, $6, NOW())
            ON CONFLICT DO NOTHING`,
            [
              fullInvoice.id,
              fullInvoice.client?.id || null,
              reminderType,
              'email',
              `Invoice reminder sent via TutorCruncher`,
              `Invoice Reminder: ${fullInvoice.display_id || `INV-${fullInvoice.id}`}`
            ]
          );

          // Also log to activity log for unified timeline view
          await pool.query(
            `INSERT INTO invoice_activity_log (
              invoice_id, client_id, activity_type, description,
              notes, source, created_by, created_at
            ) VALUES ($1, $2, $3, $4, $5, $6, $7, NOW())`,
            [
              fullInvoice.id,
              fullInvoice.client?.id || null,
              'reminder_sent',
              `${reminderType.charAt(0).toUpperCase() + reminderType.slice(1)} reminder sent via TutorCruncher`,
              `Invoice #${fullInvoice.display_id || fullInvoice.id} - Reminder #${reminderCount + 1}`,
              'tc_webhook',
              'TutorCruncher'
            ]
          );

          // Update fulfillment status
          await pool.query(
            `INSERT INTO invoice_fulfillment_status (
              invoice_id, client_id, invoice_amount, invoice_status,
              reminder_count, last_reminder_sent_at, amount_outstanding,
              invoice_display_id, invoice_date_sent
            )
            SELECT 
              $1, client_id, gross, status,
              (SELECT COUNT(*) FROM invoice_reminders WHERE invoice_id = $1),
              NOW(),
              CASE WHEN status = 'unpaid' THEN gross ELSE 0 END,
              display_id, date_sent
            FROM invoices WHERE id = $1
            ON CONFLICT (invoice_id) 
            DO UPDATE SET 
              reminder_count = (SELECT COUNT(*) FROM invoice_reminders WHERE invoice_id = $1),
              last_reminder_sent_at = NOW(),
              updated_at = NOW()`,
            [fullInvoice.id]
          );
          
          logger.info('📧 Tracked reminder #${reminderCount + 1} (${reminderType}) for invoice ${fullInvoice.id}');
        } else if (!wasPreviouslySent && fullInvoice.date_sent) {
          // This is the initial invoice send, not a reminder
          logger.info('📧 Invoice ${fullInvoice.id} was initially sent (not tracking as reminder)');
        }
      } catch (reminderError) {
        logger.error({ error: reminderError.message }, '⚠️ Error tracking invoice reminder:');
        // Don't throw - invoice was still saved successfully
      }
    }
    
  } catch (error) {
    logger.error({ err: error }, '❌ Error processing invoice webhook:');
    logger.error({ error: error.stack }, 'Error stack:');
    throw error;
  }
}

// Known bundles for matching proforma invoices to bundle purchases
const KNOWN_BUNDLES = [
  { 
    name: 'Buy 10 Home Lessons - Get 10% Off', 
    cost: 1071.00, 
    credit: 119.00, 
    total: 1190.00,
    keywords: ['buy 10 home', '10 home lessons', 'home lessons - get 10%'],
  },
  { 
    name: 'Buy 10 Online Lessons - Get 10% Off', 
    cost: 531.00, 
    credit: 59.00, 
    total: 590.00,
    keywords: ['buy 10 online', '10 online lessons', 'online lessons - get 10%'],
  },
  { 
    name: 'UES Club - Class Pack', 
    cost: 750.00, 
    credit: 0.00, 
    total: 750.00,
    keywords: ['ues club', 'ues club - class pack'],
  },
  { 
    name: 'Park Slope Club - Class Pack', 
    cost: 600.00, 
    credit: 0.00, 
    total: 600.00,
    keywords: ['park slope club', 'park slope club - class pack'],
  },
  { 
    name: '10% Off New Student Bundle - Home (Existing Parents Excluded)', 
    cost: 535.00, 
    credit: 60.00, 
    total: 595.00,
    keywords: ['new student bundle - home', 'new student bundle', 'home (existing parents excluded)'],
  },
  { 
    name: '10% Off New Student Bundle - Online (Existing Parents Excluded)', 
    cost: 265.00, 
    credit: 30.00, 
    total: 295.00,
    keywords: ['new student bundle - online', 'new student bundle', 'online (existing parents excluded)'],
  },
  { 
    name: 'Buy $1,000 in Credits – Get 10% Off', 
    cost: 900.00, 
    credit: 100.00, 
    total: 1000.00,
    keywords: ['buy $1,000 in credits', 'buy $1,000', '1000 in credits', '$1,000 in credits'],
  },
  { 
    name: 'Back to School Bundle', 
    cost: 900.00, 
    credit: 100.00, 
    total: 1000.00,
    keywords: ['back to school bundle', 'back to school'],
  },
  { 
    name: 'Buy $500 in Credits – Get 10% Off', 
    cost: 450.00, 
    credit: 50.00, 
    total: 500.00,
    keywords: ['buy $500 in credits', 'buy $500', '500 in credits', '$500 in credits'],
  },
  { 
    name: 'Holiday Bundle - 15% Off', 
    cost: 850.00, 
    credit: 150.00, 
    total: 1000.00,
    keywords: ['holiday bundle', 'holiday bundle - 15%', '15% off'],
  },
  { 
    name: 'HOME LESSONS — BLACK FRIDAY SPECIAL', 
    cost: 952.00, 
    credit: 238.00, 
    total: 1190.00,
    keywords: ['home lessons', 'black friday special', 'black friday', 'home lessons — black friday'],
  },
  { 
    name: 'ONLINE LESSONS — BLACK FRIDAY SPECIAL', 
    cost: 472.00, 
    credit: 118.00, 
    total: 590.00,
    keywords: ['online lessons', 'black friday special', 'black friday', 'online lessons — black friday'],
  },
  { 
    name: 'CLUB CLASSES — BLACK FRIDAY SPECIAL', 
    cost: 480.00, 
    credit: 120.00, 
    total: 600.00,
    keywords: ['club classes', 'black friday special', 'black friday', 'club classes — black friday'],
  },
];

// Match proforma invoice to a known bundle
function matchBundleFromProformaInvoice(proformaInvoice) {
  const description = (proformaInvoice.description || '').toLowerCase();
  const amount = parseFloat(proformaInvoice.amount || 0);
  
  if (amount === 0) return null;
  
  // Match by amount and description keywords
  for (const bundle of KNOWN_BUNDLES) {
    // Must match exact cost
    if (Math.abs(bundle.cost - amount) > 0.01) continue;
    
    // Check for exact bundle name match or keywords
    const bundleNameLower = bundle.name.toLowerCase();
    const hasExactName = description.includes(bundleNameLower);
    const hasKeywords = bundle.keywords.some(keyword => description.includes(keyword.toLowerCase()));
    
    if (hasExactName || hasKeywords) {
      // Exclude variations with multipliers or different formats
      const hasMultiplier = /\s*x\s*\d+|x\d+|\d+\s*x/i.test(proformaInvoice.description || '');
      if (hasMultiplier) continue;
      
      return bundle;
    }
  }
  
  return null;
}

// Create bundle purchase record from proforma invoice
async function createBundlePurchaseFromProformaInvoice(proformaInvoice) {
  try {
    const matchedBundle = matchBundleFromProformaInvoice(proformaInvoice);
    
    if (!matchedBundle) {
      // Not a bundle purchase, skip silently
      return;
    }
    
    const clientId = proformaInvoice.client?.id;
    if (!clientId) {
      logger.warn('⚠️ Proforma invoice ${proformaInvoice.id} has no client ID, skipping bundle purchase');
      return;
    }
    
    // Get local client ID
    const { rows: clientRows } = await pool.query(
      'SELECT id FROM clients WHERE client_id = $1 LIMIT 1',
      [clientId.toString()]
    );
    
    if (clientRows.length === 0) {
      logger.warn('⚠️ Client ${clientId} not found in local database for proforma invoice ${proformaInvoice.id}');
      return;
    }
    
    const localClientId = clientRows[0].id;
    
    // Use date_paid or date_sent as purchase date
    const purchaseDate = proformaInvoice.date_paid || proformaInvoice.date_sent || new Date().toISOString().split('T')[0];
    
    // Check if bundle purchase already exists
    const { rows: existing } = await pool.query(
      'SELECT id FROM client_bundle_purchases WHERE client_id = $1 AND bundle_name = $2 AND purchase_date = $3',
      [localClientId, matchedBundle.name, purchaseDate]
    );
    
    if (existing.length > 0) {
      logger.info('⚪ Bundle purchase already exists for client ${localClientId}, bundle ${matchedBundle.name} on ${purchaseDate}');
      return;
    }
    
    // Get source from client labels
    let source = 'Client';
    try {
      const { rows: clientData } = await pool.query(
        'SELECT labels FROM clients WHERE id = $1',
        [localClientId]
      );
      if (clientData[0]?.labels) {
        const labels = typeof clientData[0].labels === 'string' 
          ? JSON.parse(clientData[0].labels) 
          : clientData[0].labels;
        
        const labelNames = labels.map(l => l.name?.toLowerCase() || '');
        if (labelNames.some(n => n.includes('jena') || n.includes('sales'))) {
          source = 'Jena';
        } else if (labelNames.some(n => n.includes('nicholas'))) {
          source = 'Nicholas';
        } else if (labelNames.some(n => n.includes('caitlin'))) {
          source = 'Caitlin';
        }
      }
    } catch (error) {
      // Ignore label lookup errors
    }
    
    const discountPercentage = matchedBundle.credit > 0 
      ? Math.round((matchedBundle.credit / matchedBundle.total) * 100)
      : 0;
    
    // Insert bundle purchase record
    await pool.query(`
      INSERT INTO client_bundle_purchases (
        client_id, bundle_name, purchase_date, bundle_total, 
        discount_percentage, credit_total, source, created_by, updated_by
      )
      VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
    `, [
      localClientId,
      matchedBundle.name,
      purchaseDate,
      matchedBundle.cost,
      discountPercentage,
      matchedBundle.credit,
      source,
      'webhook',
      'webhook'
    ]);
    
    logger.info('✅ Created bundle purchase record for client ${localClientId}: ${matchedBundle.name} ($${matchedBundle.cost}) on ${purchaseDate}');

    // Auto-mark has_class_pack for club class pack purchases
    if (matchedBundle.name.toLowerCase().includes('class pack')) {
      await pool.query(
        'UPDATE clients SET has_class_pack = true, updated_at = NOW() WHERE id = $1',
        [localClientId]
      );
      logger.info('✅ Auto-marked has_class_pack=true for client ${localClientId} (purchased: ${matchedBundle.name})');
    }

  } catch (error) {
    logger.error({ error: error.message }, '❌ Error creating bundle purchase from proforma invoice ${proformaInvoice.id}:');
    // Don't throw - allow webhook to complete
  }
}

// Handle ProformaInvoice webhook events
async function handleProformaInvoiceWebhook(event) {
  try {
    logger.info('🔄 Starting handleProformaInvoiceWebhook function');
    const proformaInvoice = event.subject;
    
    if (!proformaInvoice || !proformaInvoice.id) {
      logger.error('❌ Missing proforma invoice data or invoice ID in webhook');
      return;
    }

    logger.info('📊 Processing proforma invoice ${proformaInvoice.id} - Action: ${event.action}');

    // Fetch complete proforma invoice data from TutorCruncher API
    let fullProformaInvoice = proformaInvoice;
    try {
      const response = await tutorCruncherAPI.get(`/proforma-invoices/${proformaInvoice.id}/`);
      fullProformaInvoice = response.data;
    } catch (error) {
      logger.warn({ data: error.message }, '⚠️ Could not fetch full proforma invoice data for ${proformaInvoice.id}, using webhook data:');
    }

    // Insert or update proforma invoice record
    const insertQuery = `
      INSERT INTO proforma_invoices (
        id, display_id, description, amount, date_sent, date_paid,
        client_id, client_first_name, client_last_name, client_email,
        status, still_to_pay, url, items, service_recipients, fetched_at, remote_last_updated
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, NOW(), $16)
      ON CONFLICT (id) DO UPDATE SET
        display_id = EXCLUDED.display_id,
        description = EXCLUDED.description,
        amount = EXCLUDED.amount,
        date_sent = EXCLUDED.date_sent,
        date_paid = EXCLUDED.date_paid,
        client_id = EXCLUDED.client_id,
        client_first_name = EXCLUDED.client_first_name,
        client_last_name = EXCLUDED.client_last_name,
        client_email = EXCLUDED.client_email,
        status = EXCLUDED.status,
        still_to_pay = EXCLUDED.still_to_pay,
        url = EXCLUDED.url,
        items = EXCLUDED.items,
        service_recipients = EXCLUDED.service_recipients,
        fetched_at = NOW(),
        remote_last_updated = EXCLUDED.remote_last_updated
    `;

    await pool.query(insertQuery, [
      fullProformaInvoice.id,
      fullProformaInvoice.display_id || `PFI-${fullProformaInvoice.id}`,
      fullProformaInvoice.description || null,
      fullProformaInvoice.amount ? parseFloat(fullProformaInvoice.amount) : null,
      fullProformaInvoice.date_sent || null,
      fullProformaInvoice.date_paid || null,
      fullProformaInvoice.client?.id || null,
      fullProformaInvoice.client?.first_name || null,
      fullProformaInvoice.client?.last_name || null,
      fullProformaInvoice.client?.email || null,
      fullProformaInvoice.status || null,
      fullProformaInvoice.still_to_pay ? parseFloat(fullProformaInvoice.still_to_pay) : 0,
      fullProformaInvoice.url || null,
      fullProformaInvoice.items ? JSON.stringify(fullProformaInvoice.items) : '[]',
      fullProformaInvoice.service_recipients ? JSON.stringify(fullProformaInvoice.service_recipients) : '[]',
      fullProformaInvoice.last_updated || new Date()
    ]);

    logger.info('✅ Successfully stored proforma invoice ${fullProformaInvoice.id} (${fullProformaInvoice.display_id}) in database');
    
    // If the proforma invoice is paid, check if it's a bundle purchase and create bundle purchase record
    if (fullProformaInvoice.status === 'paid' && fullProformaInvoice.client?.id) {
      await createBundlePurchaseFromProformaInvoice(fullProformaInvoice);
    }
    
  } catch (error) {
    logger.error({ err: error }, '❌ Error processing proforma invoice webhook:');
    logger.error({ error: error.stack }, 'Error stack:');
    throw error;
  }
}

// Handle Package purchase webhook events (CLIENT_PURCHASED_PACKAGE)
async function handlePackagePurchaseWebhook(event) {
  try {
    logger.info('🔄 Starting handlePackagePurchaseWebhook function');
    const packageData = event.subject;
    
    if (!packageData || !packageData.id) {
      logger.error('❌ Missing package data or package ID in webhook');
      return;
    }

    logger.info('📦 Processing package purchase - Package ID: ${packageData.id}, Action: ${event.action}');

    // Fetch complete package data from TutorCruncher API
    let fullPackage = packageData;
    try {
      const response = await tutorCruncherAPI.get(`/packages/${packageData.id}/`);
      fullPackage = response.data;
      logger.info('✅ Fetched full package data for package ${fullPackage.id}: ${fullPackage.name}');
    } catch (error) {
      logger.warn({ data: error.message }, '⚠️ Could not fetch full package data for ${packageData.id}, using webhook data:');
    }

    // Parse extra message to extract purchase details
    // Format: "Purchased {package_name} for {package_cost}. The total value of the package was {package_total_cost}."
    const extraMessage = event.extra_message || '';
    let packageCost = null;
    let packageTotalCost = null;
    
    // Try to extract from extra message
    const costMatch = extraMessage.match(/for \$?([\d,]+\.?\d*)/);
    const totalMatch = extraMessage.match(/was \$?([\d,]+\.?\d*)/);
    if (costMatch) {
      packageCost = parseFloat(costMatch[1].replace(/,/g, ''));
    }
    if (totalMatch) {
      packageTotalCost = parseFloat(totalMatch[1].replace(/,/g, ''));
    }

    // Use package data if available
    const bundleName = fullPackage.name || packageData.name || 'Unknown Package';
    const bundleTotal = packageCost || parseFloat(fullPackage.cost || 0);
    const totalValue = packageTotalCost || parseFloat(fullPackage.total_cost || fullPackage.total_package_value || 0);
    const creditTotal = totalValue - bundleTotal;
    
    // Calculate discount percentage
    let discountPercentage = 10; // Default
    if (totalValue > 0 && bundleTotal < totalValue) {
      discountPercentage = Math.round(((totalValue - bundleTotal) / totalValue) * 100);
    } else if (fullPackage.discount_percentage) {
      discountPercentage = parseInt(fullPackage.discount_percentage, 10);
    }

    // Get client ID from the webhook - check multiple possible locations
    // The webhook payload structure may vary, so check all common locations
    let clientId = null;
    
    // Log webhook structure for debugging
    logger.info({ hasEventClient: !!event.client, hasPackageDataClient: !!packageData.client, hasFullPackageClient: !!fullPackage.client }, '📋 Webhook event structure');

    // Try various locations for client ID
    if (event.client?.id) {
      clientId = event.client.id;
    } else if (packageData.client?.id) {
      clientId = packageData.client.id;
    } else if (fullPackage.client?.id) {
      clientId = fullPackage.client.id;
    } else if (event.user?.id) {
      // Sometimes client is referenced as user
      clientId = event.user.id;
    } else if (packageData.user?.id) {
      clientId = packageData.user.id;
    }

    // If still no client ID, try to fetch recent package purchases from the API
    // to find which client purchased this package
    if (!clientId) {
      logger.info('⚠️ No client ID in webhook payload, attempting to find via package purchase history...');
      try {
        // Fetch package purchase activity - this might require a different endpoint
        // For now, log the issue and skip
        logger.warn('⚠️ Could not determine client ID from webhook - package purchase may need manual entry');
        logger.info({ data: JSON.stringify(event, null, 2) }, '📋 Full webhook payload:');
        return;
      } catch (error) {
        logger.error({ error: error.message }, '❌ Error fetching package purchase history:');
        return;
      }
    }

    // Get client from local database to get our internal client ID
    const { rows: clientRows } = await pool.query(
      'SELECT id FROM clients WHERE client_id = $1 LIMIT 1',
      [clientId]
    );

    if (clientRows.length === 0) {
      logger.warn('⚠️ Client ${clientId} not found in local database, skipping bundle purchase record');
      return;
    }

    const localClientId = clientRows[0].id;

    // Use purchase date from event timestamp or package purchase date
    const purchaseDate = event.timestamp 
      ? new Date(event.timestamp).toISOString().split('T')[0]
      : (fullPackage.purchase_date || new Date().toISOString().split('T')[0]);

    // Determine source - try to get from client labels or default to 'Client'
    let source = 'Client';
    try {
      const { rows: clientData } = await pool.query(
        'SELECT labels FROM clients WHERE id = $1',
        [localClientId]
      );
      if (clientData[0]?.labels) {
        const labels = typeof clientData[0].labels === 'string' 
          ? JSON.parse(clientData[0].labels) 
          : clientData[0].labels;
        
        // Check for common source labels/names
        const labelNames = labels.map(l => l.name?.toLowerCase() || '');
        if (labelNames.some(n => n.includes('jena') || n.includes('sales'))) {
          source = 'Jena';
        } else if (labelNames.some(n => n.includes('nicholas'))) {
          source = 'Nicholas';
        } else if (labelNames.some(n => n.includes('caitlin'))) {
          source = 'Caitlin';
        }
      }
    } catch (error) {
      logger.warn({ data: error.message }, '⚠️ Could not determine source from client labels:');
    }

    // Check if bundle purchase already exists
    const { rows: existing } = await pool.query(
      'SELECT id FROM client_bundle_purchases WHERE client_id = $1 AND bundle_name = $2 AND purchase_date = $3',
      [localClientId, bundleName, purchaseDate]
    );

    if (existing.length > 0) {
      logger.info('⚪ Bundle purchase already exists for client ${localClientId}, package ${bundleName} on ${purchaseDate}');
      return;
    }

    // Insert bundle purchase record
    await pool.query(`
      INSERT INTO client_bundle_purchases (
        client_id, bundle_name, purchase_date, bundle_total, 
        discount_percentage, credit_total, source, created_by, updated_by
      )
      VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
    `, [
      localClientId,
      bundleName,
      purchaseDate,
      bundleTotal,
      discountPercentage,
      creditTotal,
      source,
      'webhook',
      'webhook'
    ]);

    logger.info('✅ Created bundle purchase record for client ${localClientId}: ${bundleName} ($${bundleTotal}) on ${purchaseDate}');

    // Auto-mark has_class_pack for club class pack purchases
    if (bundleName.toLowerCase().includes('class pack')) {
      await pool.query(
        'UPDATE clients SET has_class_pack = true, updated_at = NOW() WHERE id = $1',
        [localClientId]
      );
      logger.info('✅ Auto-marked has_class_pack=true for client ${localClientId} (purchased: ${bundleName})');
    }

  } catch (error) {
    logger.error({ err: error }, '❌ Error processing package purchase webhook:');
    logger.error({ error: error.stack }, 'Error stack:');
    // Don't throw - allow other webhooks to process
  }
}

// Handle PaymentOrder webhook events
async function handlePaymentOrderWebhook(event) {
  try {
    logger.info('🔄 Starting handlePaymentOrderWebhook function');
    const paymentOrder = event.subject;
    
    if (!paymentOrder || !paymentOrder.id) {
      logger.error('❌ Missing payment order data or payment order ID in webhook');
      return;
    }

    logger.info('📊 Processing payment order ${paymentOrder.id} - Action: ${event.action}');

    // Fetch complete payment order data from TutorCruncher API
    let fullPaymentOrder = paymentOrder;
    try {
      const response = await tutorCruncherAPI.get(`/payment-orders/${paymentOrder.id}/`);
      fullPaymentOrder = response.data;
    } catch (error) {
      logger.warn({ data: error.message }, '⚠️ Could not fetch full payment order data for ${paymentOrder.id}, using webhook data:');
    }

    // Insert or update payment order record
    const insertQuery = `
      INSERT INTO payment_orders (
        id, display_id, date_sent, amount, payee_id, payee_first, payee_last, payee_email,
        status, url, fetched_at, date_paid, remote_last_updated
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, NOW(), $11, $12)
      ON CONFLICT (id) DO UPDATE SET
        display_id = EXCLUDED.display_id,
        date_sent = EXCLUDED.date_sent,
        amount = EXCLUDED.amount,
        payee_id = EXCLUDED.payee_id,
        payee_first = EXCLUDED.payee_first,
        payee_last = EXCLUDED.payee_last,
        payee_email = EXCLUDED.payee_email,
        status = EXCLUDED.status,
        url = EXCLUDED.url,
        fetched_at = NOW(),
        date_paid = EXCLUDED.date_paid,
        remote_last_updated = EXCLUDED.remote_last_updated
    `;

    await pool.query(insertQuery, [
      fullPaymentOrder.id,
      fullPaymentOrder.display_id,
      fullPaymentOrder.date_sent,
      fullPaymentOrder.amount ? parseFloat(fullPaymentOrder.amount) : 0,
      fullPaymentOrder.payee?.id || null,
      fullPaymentOrder.payee?.first_name || null,
      fullPaymentOrder.payee?.last_name || null,
      fullPaymentOrder.payee?.email || null,
      fullPaymentOrder.status,
      fullPaymentOrder.url,
      fullPaymentOrder.date_paid || null,
      fullPaymentOrder.last_updated || new Date()
    ]);

    logger.info('✅ Successfully stored payment order ${fullPaymentOrder.id} (${fullPaymentOrder.display_id}) in database');
    
  } catch (error) {
    logger.error({ err: error }, '❌ Error processing payment order webhook:');
    logger.error({ error: error.stack }, 'Error stack:');
    throw error;
  }
}

// Handle Label webhook events
async function handleLabelWebhook(event) {
  try {
    logger.info('🔄 Starting handleLabelWebhook function');
    const label = event.subject;
    
    if (!label || !label.id) {
      logger.error('❌ Missing label data or label ID in webhook');
      return;
    }

    logger.info('📊 Processing label ${label.id} - Action: ${event.action}');

    // Insert or update label record
    const insertQuery = `
      INSERT INTO labels (
        id, name, color, active, remote_last_updated, updated_at
      ) VALUES ($1, $2, $3, $4, $5, NOW())
      ON CONFLICT (id) DO UPDATE SET
        name = EXCLUDED.name,
        color = EXCLUDED.color,
        active = EXCLUDED.active,
        remote_last_updated = EXCLUDED.remote_last_updated,
        updated_at = NOW()
    `;

    await pool.query(insertQuery, [
      label.id,
      label.name,
      label.color || null,
      label.active !== false, // Default to true if not specified
      label.last_updated || new Date()
    ]);

    logger.info('✅ Successfully stored label ${label.id} (${label.name}) in database');
    
  } catch (error) {
    logger.error({ err: error }, '❌ Error processing label webhook:');
    logger.error({ error: error.stack }, 'Error stack:');
    throw error;
  }
}

// Handle PipelineStage webhook events
async function handlePipelineStageWebhook(event) {
  try {
    logger.info('🔄 Starting handlePipelineStageWebhook function');
    const pipelineStage = event.subject;
    
    if (!pipelineStage || !pipelineStage.id) {
      logger.error('❌ Missing pipeline stage data or pipeline stage ID in webhook');
      return;
    }

    logger.info('📊 Processing pipeline stage ${pipelineStage.id} - Action: ${event.action}');

    // Insert or update pipeline stage record
    const insertQuery = `
      INSERT INTO pipeline_stages (
        id, name, pipeline, order_index, active, remote_last_updated, updated_at
      ) VALUES ($1, $2, $3, $4, $5, $6, NOW())
      ON CONFLICT (id) DO UPDATE SET
        name = EXCLUDED.name,
        pipeline = EXCLUDED.pipeline,
        order_index = EXCLUDED.order_index,
        active = EXCLUDED.active,
        remote_last_updated = EXCLUDED.remote_last_updated,
        updated_at = NOW()
    `;

    await pool.query(insertQuery, [
      pipelineStage.id,
      pipelineStage.name,
      pipelineStage.pipeline || null,
      pipelineStage.order_index || null,
      pipelineStage.active !== false, // Default to true if not specified
      pipelineStage.last_updated || new Date()
    ]);

    logger.info('✅ Successfully stored pipeline stage ${pipelineStage.id} (${pipelineStage.name}) in database');
    
  } catch (error) {
    logger.error({ err: error }, '❌ Error processing pipeline stage webhook:');
    logger.error({ error: error.stack }, 'Error stack:');
    throw error;
  }
}

// Auto-send client reports for a completed appointment
async function autoSendClientReportsForAppointment(appointmentId) {
  try {
    logger.info('🚀 Starting auto-send for appointment ${appointmentId}');
    
    // Find all pending client reports for this appointment
    // Join appointment_recipients on student_name to get the correct client_id for each report
    const { rows: pendingReports } = await pool.query(`
      SELECT 
        cr.*,
        a.start as appointment_start,
        s.labels as service_labels,
        s.location as service_location,
        ar.paying_client_id as client_id
      FROM client_reports cr
      LEFT JOIN appointments a ON cr.appointment_id = a.appointment_id
      LEFT JOIN services s ON a.service_id = s.service_id
      LEFT JOIN appointment_recipients ar ON (
        ar.appointment_id = cr.appointment_id 
        AND ar.recipient_name = cr.student_name
      )
      WHERE cr.appointment_id = $1 
        AND cr.status = 'pending'
    `, [appointmentId]);
    
    if (pendingReports.length === 0) {
      logger.info('ℹ️ No pending reports found for appointment ${appointmentId}');
      return;
    }
    
    logger.info('📧 Found ${pendingReports.length} pending reports for appointment ${appointmentId}, auto-sending...');
    
    // Import required modules
    const { tutorCruncherAPI } = global;
    const Handlebars = require('handlebars');
    const { getInstance: getBrevoEmailSender } = require('../../utils/brevo-email-sender');
    
    // Group reports by client email AND client_id to prevent cross-client consolidation
    // Use composite key: clientEmail_clientId to ensure reports from different clients
    // with same email don't get grouped together
    const reportsByClient = {};
    for (const report of pendingReports) {
      // Create composite key using both email and client_id
      // If client_id is missing, use email only (fallback for older reports)
      const clientId = report.client_id || 'unknown';
      const compositeKey = `${report.client_email}_${clientId}`;
      
      if (!reportsByClient[compositeKey]) {
        reportsByClient[compositeKey] = [];
      }
      reportsByClient[compositeKey].push(report);
    }
    
    logger.info('📊 Grouped reports into ${Object.keys(reportsByClient).length} client groups (by email + client_id)');
    
    // Process each client's reports
    for (const [clientEmail, clientReports] of Object.entries(reportsByClient)) {
      try {
        logger.info('📤 Processing ${clientReports.length} report(s) for client ${clientEmail}');
        
        // Get client timezone from the first report (all reports for same client should have same timezone)
        let clientTimezone = null;
        const firstReport = clientReports[0];
        if (firstReport.client_id) {
          try {
            const clientResponse = await tutorCruncherAPI.get(`clients/${firstReport.client_id}/`);
            const clientData = clientResponse.data;
            
            if (clientData && clientData.timezone) {
              clientTimezone = clientData.timezone;
            }
          } catch (error) {
            logger.error({ error: error.response?.data || error.message }, '❌ Failed to fetch client timezone for ${firstReport.client_id}:');
          }
        }
        
        // Update all report statuses to 'sent'
        const reportIds = clientReports.map(r => r.id);
        await pool.query(`
          UPDATE client_reports 
          SET status = 'sent', date_sent = NOW() 
          WHERE id = ANY($1) 
          RETURNING *
        `, [reportIds]);
        
        // Get email sender instance
        const emailSender = getBrevoEmailSender();
        if (!emailSender) {
          logger.warn('⚠️  Brevo email sender not available, skipping email send');
          throw new Error('Brevo email sender not available');
        }

        // Send consolidated email if multiple students, or individual email if single student
        if (clientReports.length === 1) {
          // Single student - send individual email
          await sendIndividualReportEmail(clientReports[0], clientTimezone, appointmentId, emailSender);
        } else {
          // Multiple students - send consolidated email
          await sendConsolidatedReportEmail(clientReports, clientTimezone, appointmentId, emailSender);
        }
        
      } catch (clientError) {
        logger.error({ err: clientError }, '❌ Error processing reports for client ${clientEmail}:');
        // Continue with other clients even if one fails
      }
    }
    
    logger.info('✅ Completed auto-send process for appointment ${appointmentId}');
    
  } catch (error) {
    logger.error({ err: error }, '❌ Error in autoSendClientReportsForAppointment for appointment ${appointmentId}:');
    throw error;
  }
}

// Helper function to send individual report email
async function sendIndividualReportEmail(report, clientTimezone, appointmentId, emailSender) {
  // Track all emails that were sent (for sent_emails field)
  const sentEmails = [];
  try {
    // CRITICAL: Check if report was skipped (race condition protection)
    const { rows: statusCheck } = await pool.query(
      'SELECT status FROM client_reports WHERE id = $1',
      [report.id]
    );
    if (statusCheck.length > 0 && statusCheck[0].status === 'skipped') {
      logger.info('⏭️ Report ${report.id} was marked as skipped, not sending email');
      return { sentEmails: [], skipped: true };
    }

    logger.info('📤 Sending individual report ${report.id} for student ${report.student_name}');
    
    // Get the template HTML
    const { rows: templateRows } = await pool.query(
      'SELECT html FROM templates WHERE template_name = $1',
      [report.template_name]
    );
    
    if (templateRows.length === 0) {
      throw new Error(`Template not found: ${report.template_name}`);
    }
    
    // Compile the template with data
    const Handlebars = require('handlebars');
    const template = Handlebars.compile(templateRows[0].html);
    // Decode HTML entities and convert markdown to HTML for feedback
    let decodedFeedback = '';
    let feedbackText = 'No feedback provided';
    if (report.tutor_feedback) {
      // Decode HTML entities first
      let decoded = report.tutor_feedback
        .replace(/&#x27;/g, "'")
        .replace(/&#39;/g, "'")
        .replace(/&quot;/g, '"')
        .replace(/&amp;/g, '&')
        .replace(/&lt;/g, '<')
        .replace(/&gt;/g, '>')
        .replace(/&#x2F;/g, '/')
        .replace(/&#x60;/g, '`');
      
      // Normalize literal <br> tags to line breaks (will be converted to HTML <br> by markdownToHtml)
      // Handle variations: <br>, <br >, <br/>, <br />, etc.
      decoded = decoded.replace(/<br\s*\/?>/gi, '\n');
      
      // Convert markdown to HTML for HTML email
      decodedFeedback = markdownToHtml(decoded);
      // Strip markdown for plain text email
      feedbackText = stripMarkdown(decoded);
    }
    // Add tutor signature after feedback (first name only)
    const tutorFirstName = (report.tutor_name || '').split(' ')[0];
    const feedbackWithSignature = tutorFirstName
      ? `${decodedFeedback}<p style="margin-top: 16px; margin-bottom: 0; font-style: italic; ">- ${tutorFirstName}</p>`
      : decodedFeedback;
    const htmlContent = template({
      clientName: report.client_name,
      studentName: report.student_name,
      tutorName: report.tutor_name,
      feedback: feedbackWithSignature
    });

    // Format the email subject with appointment date/time
    const emailSubject = formatEmailSubject(report, clientTimezone);

    // Determine location for email sender
    const { getCurrentEnvironment } = require('../../config/environments');
    const envConfig = getCurrentEnvironment();
    const location = envConfig.name; // 'eastside', 'westside', 'production', etc.

    // Generate PNG screenshot of the lesson report for easy sharing
    const { generateLessonReportScreenshot } = require('../../utils/lesson-report-screenshot');
    let attachments = [];
    try {
      const screenshotBase64 = await generateLessonReportScreenshot(htmlContent);
      if (screenshotBase64) {
        attachments.push({
          content: screenshotBase64,
          name: `lesson-report-${report.student_name.replace(/[^a-zA-Z0-9]/g, '-')}.png`
        });
        logger.info('📸 Generated lesson report screenshot for ${report.student_name}');
      }
    } catch (screenshotError) {
      logger.warn('⚠️ Could not generate lesson report screenshot: ${screenshotError.message}');
      // Continue without attachment - email will still be sent
    }

    // Send email to parent/client with tracking via Brevo email sender
    const clientEmailResult = await emailSender.sendEmail({
      to: report.client_email,
      subject: emailSubject,
      html: htmlContent,
      text: `Lesson Report for ${report.student_name}\n\nTutor: ${report.tutor_name}\nFeedback: ${feedbackText}`,
      location: location, // Pass location for sender address
      attachments: attachments.length > 0 ? attachments : undefined
    });
    
    if (clientEmailResult.success) {
      // Track successful parent email send
      sentEmails.push({
        email: report.client_email,
        studentName: report.student_name,
        type: 'client',
        success: true,
        messageId: clientEmailResult.messageId
      });
      
      // Update the report status with parent email message ID
      // Set both date_sent and sent_at to track when email was sent
      // Only store brevo_message_id if it's a valid Brevo message ID (not null and properly formatted)
      const isBrevoMessageId = clientEmailResult.messageId && 
        typeof clientEmailResult.messageId === 'string' && 
        clientEmailResult.messageId.length > 10; // Brevo IDs are typically longer than 10 chars
      
      if (isBrevoMessageId) {
        await pool.query(`
          UPDATE client_reports 
          SET status = 'sent', date_sent = NOW(), sent_at = NOW(), brevo_message_id = $1
          WHERE id = $2
        `, [clientEmailResult.messageId, report.id]);
        logger.info('✅ Auto-sent individual report ${report.id} to parent ${report.client_email} with Brevo message ID: ${clientEmailResult.messageId} - Subject: ${emailSubject}');
      } else {
        // Update status but don't set brevo_message_id if it's null or invalid
        await pool.query(`
          UPDATE client_reports 
          SET status = 'sent', date_sent = NOW(), sent_at = NOW()
          WHERE id = $1
        `, [report.id]);
        if (clientEmailResult.messageId) {
          logger.warn('⚠️ Auto-sent individual report ${report.id} to parent ${report.client_email} but messageId appears invalid (length: ${clientEmailResult.messageId.length}): ${clientEmailResult.messageId} - Subject: ${emailSubject}');
        } else {
          logger.warn('⚠️ Auto-sent individual report ${report.id} to parent ${report.client_email} but Brevo API returned no messageId - email may have been sent but tracking unavailable - Subject: ${emailSubject}');
        }
      }
    } else {
      // Brevo API failed - try SMTP fallback
      logger.warn({ data: clientEmailResult.error }, '⚠️ Brevo API failed for report ${report.id}, attempting SMTP fallback:');
      
      try {
        const mailOptions = {
          from: '"Acme Operations" <support@acmeops.com>',
          to: report.client_email,
          subject: emailSubject,
          html: htmlContent,
          text: `Lesson Report for ${report.student_name}\n\nTutor: ${report.tutor_name}\nFeedback: ${feedbackText}`
        };
        
        const smtpResult = await transporter.sendMail(mailOptions);
        logger.info('📧 Email sent via SMTP fallback to parent ${report.client_email} for report ${report.id}');
        
        // Track successful SMTP fallback send
        sentEmails.push({
          email: report.client_email,
          studentName: report.student_name,
          type: 'client',
          success: true,
          messageId: smtpResult.messageId,
          fallback: 'smtp'
        });
        
        // Update report status (no brevo_message_id since we used SMTP fallback)
        await pool.query(`
          UPDATE client_reports 
          SET status = 'sent', date_sent = NOW(), sent_at = NOW()
          WHERE id = $1
        `, [report.id]);
        logger.info('✅ Auto-sent individual report ${report.id} to parent ${report.client_email} via SMTP fallback - Subject: ${emailSubject}');
      } catch (smtpError) {
        // Both Brevo and SMTP failed
        logger.error({ error: smtpError.message }, '❌ Both Brevo API and SMTP fallback failed for report ${report.id}:');
        sentEmails.push({
          email: report.client_email,
          studentName: report.student_name,
          type: 'client',
          success: false,
          error: `Brevo: ${clientEmailResult.error}; SMTP: ${smtpError.message}`
        });
        throw new Error(`Email sending failed: Brevo API error: ${clientEmailResult.error}; SMTP fallback error: ${smtpError.message}`);
      }
    }
    
    // Send email to student if student email exists
    if (report.student_email && report.student_email.trim().length > 0) {
      try {
        const studentEmailResult = await emailSender.sendEmail({
          to: report.student_email,
          subject: emailSubject,
          html: htmlContent,
          text: `Lesson Report for ${report.student_name}\n\nTutor: ${report.tutor_name}\nFeedback: ${feedbackText}`,
          location: location,
          attachments: attachments.length > 0 ? attachments : undefined
        });
        
        if (studentEmailResult.success) {
          // Track successful student email send
          sentEmails.push({
            email: report.student_email,
            studentName: report.student_name,
            type: 'student',
            success: true,
            messageId: studentEmailResult.messageId
          });
          logger.info('✅ Auto-sent individual report ${report.id} to student ${report.student_email} with subject: ${emailSubject}');
        } else {
          // Track failed student email send
          sentEmails.push({
            email: report.student_email,
            studentName: report.student_name,
            type: 'student',
            success: false,
            error: studentEmailResult.error
          });
          logger.error({ error: studentEmailResult.error }, '⚠️ Failed to send report ${report.id} to student ${report.student_email}:');
          // Don't fail the entire process if student email fails
        }
      } catch (studentEmailError) {
        // Track failed student email send
        sentEmails.push({
          email: report.student_email,
          studentName: report.student_name,
          type: 'student',
          success: false,
          error: studentEmailError.message
        });
        logger.error({ err: studentEmailError }, '⚠️ Error sending report ${report.id} to student ${report.student_email}:');
        // Don't fail the entire process if student email fails
      }
    } else {
      logger.info('ℹ️ No student email available for ${report.student_name}, skipping student email send');
    }
    
    // Store sent_emails in database
    if (sentEmails.length > 0) {
      try {
        await pool.query(`
          UPDATE client_reports SET sent_emails = $1 WHERE id = $2
        `, [JSON.stringify(sentEmails), report.id]);
        logger.info('✅ Stored ${sentEmails.length} sent email record(s) for report ${report.id}');
      } catch (updateError) {
        logger.error({ err: updateError }, '❌ Error storing sent_emails:');
        // Don't fail the process if storing sent_emails fails
      }
    }
    
  } catch (emailError) {
    logger.error({ err: emailError }, '❌ Individual email sending failed for report ${report.id}:');
    throw emailError;
  }
}

// Helper function to send consolidated report email for multiple students
async function sendConsolidatedReportEmail(reports, clientTimezone, appointmentId, emailSender) {
  // Track all emails that were sent (for sent_emails field)
  const sentEmails = [];
  
  try {
    // CRITICAL: Verify all reports belong to the same client
    const firstClientEmail = reports[0].client_email;
    const firstClientId = reports[0].client_id;
    const allSameClient = reports.every(r => 
      r.client_email === firstClientEmail && 
      (r.client_id === firstClientId || (!r.client_id && !firstClientId))
    );
    
    if (!allSameClient) {
      const clientDetails = reports.map(r => ({
        student: r.student_name,
        clientEmail: r.client_email,
        clientId: r.client_id,
        clientName: r.client_name
      }));
      logger.error('❌ SECURITY ERROR: Attempted to send consolidated email with reports from different clients!');
      logger.error({ error: JSON.stringify(clientDetails, null, 2) }, '   Reports:');
      throw new Error(`Cannot send consolidated email: reports belong to different clients. This would leak student data!`);
    }
    
    logger.info('📤 Sending consolidated report for ${reports.length} students to ${reports[0].client_email} (Client ID: ${reports[0].client_id || \'N/A\'})');
    
    // Get the template HTML (use the first report's template)
    const { rows: templateRows } = await pool.query(
      'SELECT html FROM templates WHERE template_name = $1',
      [reports[0].template_name]
    );
    
    if (templateRows.length === 0) {
      throw new Error(`Template not found: ${reports[0].template_name}`);
    }
    
    // Create consolidated HTML content
    const Handlebars = require('handlebars');
    const template = Handlebars.compile(templateRows[0].html);
    
    // Build consolidated content for all students
    let consolidatedHtml = '';
    let consolidatedText = '';
    
    for (const report of reports) {
      // Process feedback: decode HTML entities, normalize <br> tags, convert markdown to HTML
      let feedbackHtml = '';
      if (report.tutor_feedback) {
        let decoded = report.tutor_feedback
          .replace(/&#x27;/g, "'")
          .replace(/&#39;/g, "'")
          .replace(/&quot;/g, '"')
          .replace(/&amp;/g, '&')
          .replace(/&lt;/g, '<')
          .replace(/&gt;/g, '>')
          .replace(/&#x2F;/g, '/')
          .replace(/&#x60;/g, '`');
        
        // Normalize literal <br> tags to line breaks (will be converted to HTML <br> by markdownToHtml)
        decoded = decoded.replace(/<br\s*\/?>/gi, '\n');
        
        // Convert markdown to HTML
        feedbackHtml = markdownToHtml(decoded);
      }

      // Add tutor signature after feedback (first name only)
      const tutorFirstName = (report.tutor_name || '').split(' ')[0];
      const feedbackWithSignature = tutorFirstName
        ? `${feedbackHtml}<p style="margin-top: 16px; margin-bottom: 0; font-style: italic; ">- ${tutorFirstName}</p>`
        : feedbackHtml;
      const htmlContent = template({
        clientName: report.client_name,
        studentName: report.student_name,
        tutorName: report.tutor_name,
        feedback: feedbackWithSignature
      });

      // Add student separator and content
      if (consolidatedHtml) {
        consolidatedHtml += '<hr style="margin: 30px 0; border: 1px solid #ddd;"><h3 style="color: #6a469d;">Next Student Report</h3>';
      }
      consolidatedHtml += htmlContent;
      
      // Add to text version
      if (consolidatedText) {
        consolidatedText += '\n\n--- NEXT STUDENT REPORT ---\n\n';
      }
      consolidatedText += `Lesson Report for ${report.student_name}\n\nTutor: ${report.tutor_name}\nFeedback: ${report.tutor_feedback || 'No feedback provided'}`;
    }
    
    // Format the email subject with appointment date/time and student count
    const emailSubject = formatEmailSubject(reports[0], clientTimezone, reports.length);

    // Determine location for email sender
    const { getCurrentEnvironment } = require('../../config/environments');
    const envConfig = getCurrentEnvironment();
    const location = envConfig.name; // 'eastside', 'westside', 'production', etc.

    // Generate PNG screenshot of the consolidated lesson report for easy sharing
    const { generateLessonReportScreenshot } = require('../../utils/lesson-report-screenshot');
    let attachments = [];
    try {
      const screenshotBase64 = await generateLessonReportScreenshot(consolidatedHtml);
      if (screenshotBase64) {
        const studentNames = reports.map(r => r.student_name.replace(/[^a-zA-Z0-9]/g, '-')).join('-');
        attachments.push({
          content: screenshotBase64,
          name: `lesson-report-${studentNames.substring(0, 50)}.png`
        });
        logger.info('📸 Generated consolidated lesson report screenshot for ${reports.length} students');
      }
    } catch (screenshotError) {
      logger.warn('⚠️ Could not generate consolidated lesson report screenshot: ${screenshotError.message}');
      // Continue without attachment - email will still be sent
    }

    // Send consolidated email with tracking via Brevo email sender
    const emailResult = await emailSender.sendEmail({
      to: reports[0].client_email,
      subject: emailSubject,
      html: consolidatedHtml,
      text: consolidatedText,
      location: location, // Pass location for sender address
      attachments: attachments.length > 0 ? attachments : undefined
    });
    
    if (emailResult.success) {
      // Track successful consolidated email send
      sentEmails.push({
        email: reports[0].client_email,
        studentName: reports.map(r => r.student_name).join(', '),
        type: 'client',
        success: true,
        messageId: emailResult.messageId,
        studentCount: reports.length
      });
      
      // Update all report statuses
      // Set both date_sent and sent_at to track when email was sent
      // Only store brevo_message_id if it's a valid Brevo message ID (not null and properly formatted)
      const isBrevoMessageId = emailResult.messageId && 
        typeof emailResult.messageId === 'string' && 
        emailResult.messageId.length > 10; // Brevo IDs are typically longer than 10 chars
      
      for (const report of reports) {
        if (isBrevoMessageId) {
          await pool.query(`
            UPDATE client_reports 
            SET status = 'sent', date_sent = NOW(), sent_at = NOW(), brevo_message_id = $1, sent_emails = $2
            WHERE id = $3
          `, [emailResult.messageId, JSON.stringify(sentEmails), report.id]);
        } else {
          // Update status but don't set brevo_message_id if it's null or invalid
          await pool.query(`
            UPDATE client_reports 
            SET status = 'sent', date_sent = NOW(), sent_at = NOW(), sent_emails = $1
            WHERE id = $2
          `, [JSON.stringify(sentEmails), report.id]);
          if (emailResult.messageId) {
            logger.warn('⚠️ Auto-sent consolidated report ${report.id} but messageId appears invalid (length: ${emailResult.messageId.length}): ${emailResult.messageId}');
          } else {
            logger.warn('⚠️ Auto-sent consolidated report ${report.id} but Brevo API returned no messageId - email may have been sent but tracking unavailable');
          }
        }
      }
      if (isBrevoMessageId) {
        logger.info('✅ Auto-sent consolidated report for ${reports.length} students to ${reports[0].client_email} with Brevo message ID: ${emailResult.messageId} - Subject: ${emailSubject}');
      } else {
        logger.info('✅ Auto-sent consolidated report for ${reports.length} students to ${reports[0].client_email} (no Brevo message ID available) - Subject: ${emailSubject}');
      }
    } else {
      // Brevo API failed - try SMTP fallback
      logger.warn({ data: emailResult.error }, '⚠️ Brevo API failed for consolidated report (${reports.length} students), attempting SMTP fallback:');
      
      try {
        const mailOptions = {
          from: '"Acme Operations" <support@acmeops.com>',
          to: reports[0].client_email,
          subject: emailSubject,
          html: consolidatedHtml,
          text: consolidatedText
        };
        
        const smtpResult = await transporter.sendMail(mailOptions);
        logger.info('📧 Consolidated email sent via SMTP fallback to ${reports[0].client_email} for ${reports.length} students');
        
        // Track successful SMTP fallback send
        sentEmails.push({
          email: reports[0].client_email,
          studentName: reports.map(r => r.student_name).join(', '),
          type: 'client',
          success: true,
          messageId: smtpResult.messageId,
          studentCount: reports.length,
          fallback: 'smtp'
        });
        
        // Update all report statuses (no brevo_message_id since we used SMTP fallback)
        for (const report of reports) {
          await pool.query(`
            UPDATE client_reports 
            SET status = 'sent', date_sent = NOW(), sent_at = NOW(), sent_emails = $1
            WHERE id = $2
          `, [JSON.stringify(sentEmails), report.id]);
        }
        logger.info('✅ Auto-sent consolidated report for ${reports.length} students to ${reports[0].client_email} via SMTP fallback - Subject: ${emailSubject}');
      } catch (smtpError) {
        // Both Brevo and SMTP failed
        logger.error({ error: smtpError.message }, '❌ Both Brevo API and SMTP fallback failed for consolidated report (${reports.length} students):');
        
        // Track failed consolidated email send
        sentEmails.push({
          email: reports[0].client_email,
          studentName: reports.map(r => r.student_name).join(', '),
          type: 'client',
          success: false,
          error: `Brevo: ${emailResult.error}; SMTP: ${smtpError.message}`,
          studentCount: reports.length
        });
        
        // Still store sent_emails even if send failed
        for (const report of reports) {
          try {
            await pool.query(`
              UPDATE client_reports SET sent_emails = $1 WHERE id = $2
            `, [JSON.stringify(sentEmails), report.id]);
          } catch (updateError) {
            logger.error({ err: updateError }, '❌ Error storing sent_emails:');
          }
        }
        
        throw new Error(`Email sending failed: Brevo API error: ${emailResult.error}; SMTP fallback error: ${smtpError.message}`);
      }
    }
    
  } catch (emailError) {
    logger.error({ err: emailError }, '❌ Consolidated email sending failed for ${reports.length} reports:');
    throw emailError;
  }
}

// Helper function to format email subject
function formatEmailSubject(report, clientTimezone, studentCount = 1) {
  let emailSubject = 'Acme Operations Lesson Report'; // Default fallback
  
  if (report.appointment_start) {
    try {
      // Get timezone using client timezone, service labels and location
      const { getTimezoneForService } = require('../../utils/timezone-mapping');
      const timezone = getTimezoneForService(clientTimezone, report.service_labels, report.service_location);
      
      // Parse the appointment start time and format it
      const appointmentDate = new Date(report.appointment_start);
      const options = {
        timeZone: timezone,
        month: 'numeric',
        day: 'numeric',
        year: '2-digit',
        hour: 'numeric',
        minute: '2-digit',
        hour12: true
      };
      const formattedDateTime = appointmentDate.toLocaleString('en-US', options);
      
      if (studentCount > 1) {
        emailSubject = `Acme Operations Lesson Reports (${studentCount} Students) - ${formattedDateTime}`;
      } else {
        emailSubject = `Acme Operations Lesson Report - ${formattedDateTime}`;
      }
    } catch (dateError) {
      logger.error({ err: dateError }, 'Error formatting appointment date:');
    }
  } else {
    // Fallback to current date/time when no appointment data is available
    try {
      const { getTimezoneForService } = require('../../utils/timezone-mapping');
      const timezone = getTimezoneForService(clientTimezone, report.service_labels, report.service_location);
      
      const currentDate = new Date();
      const options = {
        timeZone: timezone,
        month: 'numeric',
        day: 'numeric',
        year: '2-digit',
        hour: 'numeric',
        minute: '2-digit',
        hour12: true
      };
      const formattedDateTime = currentDate.toLocaleString('en-US', options);
      
      if (studentCount > 1) {
        emailSubject = `Acme Operations Lesson Reports (${studentCount} Students) - ${formattedDateTime}`;
      } else {
        emailSubject = `Acme Operations Lesson Report - ${formattedDateTime}`;
      }
    } catch (dateError) {
      logger.error({ err: dateError }, 'Error formatting current date:');
    }
  }
  
  return emailSubject;
}

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

    logger.info('📦 Processing package ${packageData.id} - Action: ${event.action}');

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
    
    logger.info('✅ Using package data from webhook for package ${fullPackage.id}: ${fullPackage.name || \'Unnamed\'}');

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

    logger.info('✅ Successfully stored package ${packageId} in database');

  } catch (error) {
    logger.error({ err: error }, '❌ Error processing package webhook:');
    logger.error({ error: error.stack }, 'Error stack:');
    logger.error({ errorMessage: error.message, code: error.code, detail: error.detail }, 'Error details');
    throw error;
  }
}

module.exports = router;
module.exports.handleCreatedReport = handleCreatedReport;
