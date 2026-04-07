const { tutorCruncherAPI, pool } = global;
const { sendCriticalErrorAlert, sendSystemHealthAlert } = require('./alertManager');
const { retryTutorCruncherCall } = require('./tutorCruncherRetry');
const { logger } = require('./logger');

// Cross-browser compatible date parsing
const parseDateSafely = (dateString) => {
  try {
    // Handle different date formats that browsers might send
    const parts = dateString.split('-');
    if (parts.length !== 3) return null;
    
    const year = parseInt(parts[0]);
    const month = parseInt(parts[1]);
    const day = parseInt(parts[2]);
    
    // Validate individual components
    if (isNaN(year) || isNaN(month) || isNaN(day)) return null;
    if (month < 1 || month > 12) return null;
    if (day < 1 || day > 31) return null;
    
    // Create date using constructor (more reliable across browsers)
    const date = new Date(year, month - 1, day);
    
    // Verify the date is valid (handles invalid dates like Feb 30)
    if (date.getFullYear() !== year || 
        date.getMonth() !== month - 1 || 
        date.getDate() !== day) {
      return null;
    }
    
    return date;
  } catch (error) {
    return null;
  }
};

// Cross-browser compatible future date check
const isDateInFuture = (date) => {
  const today = new Date();
  // Reset time to start of day for accurate comparison
  const todayStart = new Date(today.getFullYear(), today.getMonth(), today.getDate());
  const dateStart = new Date(date.getFullYear(), date.getMonth(), date.getDate());
  
  return dateStart > todayStart;
};

// Cross-browser compatible age calculation
const calculateAge = (birthDate) => {
  const today = new Date();
  let age = today.getFullYear() - birthDate.getFullYear();
  const monthDiff = today.getMonth() - birthDate.getMonth();
  
  // Adjust age if birthday hasn't occurred this year
  if (monthDiff < 0 || (monthDiff === 0 && today.getDate() < birthDate.getDate())) {
    age--;
  }
  
  return age;
};

/**
 * Enhanced client lookup with robust duplicate detection
 * @param {string} email - Client email address
 * @returns {Object|null} - Existing client or null if not found
 */
const findExistingClient = async (email) => {
  try {
    const normalizedEmail = email.toLowerCase().trim();
    logger.info(`🔍 Looking up existing client for email: ${normalizedEmail}`);
    
    // SIMPLIFIED: Direct email lookup - emails are unique so there should only be one result
    // Note: This is called from within retryTutorCruncherCall, so no need to wrap again
    const listRes = await tutorCruncherAPI.get('/clients/', {
      params: { 
        user__email: normalizedEmail
      }
    });
    
    logger.info(`📊 API returned count: ${listRes.data.count}, results: ${listRes.data.results?.length || 0}`);
    
    // Since emails are unique, there should be at most 1 result
    if (listRes.data.results && listRes.data.results.length > 0) {
      const client = listRes.data.results[0];
      logger.info(`✅ Found existing client: ID ${client.id}, Email: ${client.email}`);
      return client;
    }
    
    logger.info(`❌ No existing client found for email: ${email}`);
    return null;
    
  } catch (error) {
    logger.error({ error: error.response?.data || error.message }, '❌ Error in client lookup:');
    return null;
  }
};

/**
 * Create or update client with duplicate prevention
 * @param {Object} clientPayload - Client data
 * @param {string} email - Client email for duplicate check
 * @returns {Object} - Client ID and creation status
 */
const createOrUpdateClient = async (clientPayload, email) => {
  try {
    logger.info(`🚀 Creating/updating client for email: ${email}`);
    
    // First, check if client already exists (with retry)
    const existingClient = await retryTutorCruncherCall(
      () => findExistingClient(email),
      {
        maxRetries: 3,
        baseDelayMs: 1000,
        operationName: `Client lookup for ${email}`
      }
    );
    
    if (existingClient) {
      logger.info(`♻️ Using existing client ID: ${existingClient.id} (current status: ${existingClient.status})`);

      // Update existing client with new data (with retry)
      // Only set status to "prospect" for dormant clients - don't demote live clients
      // Include address fields so returning clients get their address updated
      try {
        // Determine if we should change status: only reactivate dormant clients
        // Live clients should stay live, prospect clients stay prospect
        const shouldSetProspect = existingClient.status === 'dormant';

        const updatePayload = {
          calendar_colour: clientPayload.calendar_colour,
          // Only include status if we're reactivating a dormant client
          ...(shouldSetProspect && { status: "prospect" }),
          // Address fields - update if provided
          ...(clientPayload.street && { street: clientPayload.street }),
          ...(clientPayload.town && { town: clientPayload.town }),
          ...(clientPayload.postcode && { postcode: clientPayload.postcode }),
          ...(clientPayload.country && { country: clientPayload.country }),
          ...(clientPayload.state && { state: clientPayload.state }),
          // Only update fields that are safe to update
          ...(clientPayload.extra_attrs && { extra_attrs: clientPayload.extra_attrs })
        };

        await retryTutorCruncherCall(
          () => tutorCruncherAPI.post(`/clients/${existingClient.id}/`, updatePayload),
          {
            maxRetries: 3,
            baseDelayMs: 1000,
            operationName: `Client update for ${existingClient.id}`
          }
        );
        logger.info(`✅ Updated existing client ${existingClient.id}${shouldSetProspect ? ' with status=prospect (was dormant)' : ' (preserved status: ' + existingClient.status + ')'}`);
        
        return {
          clientId: existingClient.id,
          isNew: false,
          client: existingClient
        };
      } catch (updateError) {
        logger.warn({ data: updateError.response?.data || updateError.message }, `⚠️ Failed to update existing client ${existingClient.id}:`);
        // Still return the existing client even if update failed
        return {
          clientId: existingClient.id,
          isNew: false,
          client: existingClient
        };
      }
    }
    
    // Create new client (with retry)
    logger.info(`🆕 Creating new client for email: ${email}`);
    logger.info({ data: JSON.stringify(clientPayload, null, 2) }, `📋 Client payload:`);
    
    const { data } = await retryTutorCruncherCall(
      () => tutorCruncherAPI.post('/clients/', clientPayload),
      {
        maxRetries: 3,
        baseDelayMs: 1000,
        operationName: `Client creation for ${email}`
      }
    );
    
    logger.info(`✅ Created new client ID: ${data.id}`);
    return {
      clientId: data.id,
      isNew: true,
      client: data
    };
    
  } catch (error) {
    // ✅ ENHANCED: Capture full TutorCruncher API error response for debugging
    const errorResponse = error.response?.data || null;
    const errorStatus = error.response?.status || null;
    const errorMsg = errorResponse?.email || errorResponse?.error || errorResponse?.detail || error.message;
    
    // Log full error details for debugging
    logger.error({ data: {
      message: errorMsg,
      fullResponse: errorResponse,
      status: errorStatus,
      email: email,
      payload: clientPayload
    } }, `❌ TutorCruncher API error (status ${errorStatus}):`);
    
    // Handle specific duplicate client error (with retry)
    if (errorMsg && (errorMsg.includes('already has a Client') || errorMsg.includes('already exists'))) {
      logger.info(`🔄 Duplicate client detected, attempting lookup...`);
      
      // Try to find the existing client (with retry)
      try {
        const existingClient = await retryTutorCruncherCall(
          () => findExistingClient(email),
          {
            maxRetries: 2,
            baseDelayMs: 500,
            operationName: `Duplicate client lookup for ${email}`
          }
        );
        
        if (existingClient) {
          logger.info(`✅ Found existing client after duplicate error: ID ${existingClient.id}`);
          return {
            clientId: existingClient.id,
            isNew: false,
            client: existingClient
          };
        }
      } catch (lookupError) {
        logger.warn({ data: lookupError.message }, `⚠️ Failed to lookup existing client after duplicate error:`);
      }
    }
    
    logger.error({ data: errorMsg }, `❌ Failed to create/update client:`);
    
    // Send critical error alert with full error details
    await sendCriticalErrorAlert('client_creation_failed', {
      message: errorMsg,
      context: { 
        email, 
        clientPayload,
        tutorCruncherResponse: errorResponse,
        tutorCruncherStatus: errorStatus
      },
      stack: error.stack
    }, null, null);
    
    // ✅ ENHANCED: Include full error response in thrown error for better logging upstream
    const enhancedError = new Error(`Client creation failed: ${errorMsg}`);
    enhancedError.tutorCruncherResponse = errorResponse;
    enhancedError.tutorCruncherStatus = errorStatus;
    enhancedError.originalError = error;
    throw enhancedError;
  }
};

/**
 * Update auto-charge with retry logic
 * @param {number} clientId - Client ID
 * @param {number} value - Auto-charge value (0=follow branch, 10=enabled, 20=disabled)
 * @param {number} maxRetries - Maximum retry attempts
 */
const updateAutoChargeWithRetry = async (clientId, value, maxRetries = 3) => {
  for (let attempt = 1; attempt <= maxRetries; attempt++) {
    try {
      logger.info(`🔄 Auto-charge update attempt ${attempt}/${maxRetries} for client ${clientId}`);
      
      await retryTutorCruncherCall(
        () => tutorCruncherAPI.post(`/clients/${clientId}/`, {
          auto_charge: value
        }),
        {
          maxRetries: 3,
          baseDelayMs: 1000,
          operationName: `Update auto-charge for client ${clientId}`
        }
      );
      
      logger.info(`✅ Auto-charge successfully updated to ${value} for client ${clientId}`);
      return;
      
    } catch (error) {
      const errorMsg = error.response?.data || error.message;
      logger.error({ data: errorMsg }, `❌ Auto-charge update attempt ${attempt} failed:`);
      
      if (attempt === maxRetries) {
        logger.error(`🚨 CRITICAL: Failed to update auto-charge for client ${clientId} after ${maxRetries} attempts`);
        
        // Log to database for manual review
        try {
          await pool.query(`
            INSERT INTO error_logs (error_type, client_id, error_message, created_at)
            VALUES ($1, $2, $3, NOW())
          `, ['auto_charge_update_failed', clientId, errorMsg]);
        } catch (dbError) {
          logger.error({ error: dbError.message }, 'Failed to log auto-charge error to database:');
        }
        
        // Send critical error alert
        await sendCriticalErrorAlert('auto_charge_update_failed', {
          message: errorMsg,
          context: { clientId, value, maxRetries },
          retryAttempts: maxRetries,
          maxRetries: maxRetries,
          stack: error.stack
        }, null, clientId);
        
        throw new Error(`Auto-charge update failed after ${maxRetries} attempts: ${errorMsg}`);
      }
      
      // Wait before retry with exponential backoff
      const delay = Math.min(1000 * Math.pow(2, attempt - 1), 5000);
      logger.info(`⏳ Waiting ${delay}ms before retry...`);
      await new Promise(resolve => setTimeout(resolve, delay));
    }
  }
};

/**
 * Validate student data before processing
 * @param {Object} student - Student data
 * @returns {Array} - Array of validation errors
 */
const validateStudentData = (student) => {
  const errors = [];
  
  if (!student.first || !student.last) {
    errors.push('Student name (first and last) is required');
  }
  
  
  if (!student.dob) {
    errors.push('Student date of birth is required');
  } else {
    // Enhanced DOB validation to prevent API errors
    // First check format
    if (typeof student.dob !== 'string' || student.dob.length !== 10 || !student.dob.includes('-')) {
      errors.push(`Invalid date format: ${student.dob}. Please use YYYY-MM-DD format.`);
    } else {
      const year = parseInt(student.dob.split('-')[0]);
      if (isNaN(year) || year < 1900 || year > 2030) {
        errors.push(`Invalid birth year: ${year}. Must be between 1900-2030.`);
      } else {
        // Cross-browser compatible date parsing
        const birthDate = parseDateSafely(student.dob);
        
        // Validate that the date is actually valid
        if (!birthDate) {
          errors.push(`Invalid date: ${student.dob}. Please check the date format.`);
        } else {
          // Check if date is in the future
          if (isDateInFuture(birthDate)) {
            errors.push('Date of birth cannot be in the future');
          } else {
            // Check if age is reasonable (under 100 years old)
            const age = calculateAge(birthDate);
            if (age > 100 || age < 0) {
              errors.push(`Student would be ${age} years old - please check birth year`);
            }
          }
        }
      }
    }
  }
  
  // Validate email format if provided
  if (student.email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(student.email)) {
    errors.push('Invalid email format');
  }
  
  return errors;
};

/**
 * Create or update recipient with enhanced error handling
 * @param {Object} student - Student data
 * @param {number} clientId - Client ID
 * @param {Array} existingRecipients - Existing recipients array
 * @param {string} colour - Calendar colour
 * @returns {Object} - Recipient ID and creation status
 */
const createOrUpdateRecipient = async (student, clientId, existingRecipients, colour) => {
  try {
    // Validate student data
    const validationErrors = validateStudentData(student);
    if (validationErrors.length > 0) {
      throw new Error(`Student validation failed: ${validationErrors.join(', ')}`);
    }
    
    const recPayload = {
      first_name: student.first.trim(),
      last_name: student.last.trim(),
      paying_client: clientId,
      extra_attrs: {
        current_school: student.school?.trim() || '',
        sr_dob: student.dob || ''
      },
      calendar_colour: colour
    };
    
    logger.info(`👤 Processing recipient: ${student.first} ${student.last}`);
    
    // Check for existing recipient with more robust matching
    const existing = existingRecipients.find(r => {
      if (!r.first_name || !r.last_name) return false;
      
      const existingFirst = r.first_name.toLowerCase().trim();
      const existingLast = r.last_name.toLowerCase().trim();
      const studentFirst = student.first.toLowerCase().trim();
      const studentLast = student.last.toLowerCase().trim();
      
      return existingFirst === studentFirst && existingLast === studentLast;
    });
    
    let recId;
    let isNew = false;
    
    if (existing) {
      recId = existing.id;
      logger.info(`♻️ Using existing recipient ID: ${recId}`);
      
      // Update existing recipient (with retry)
      try {
        await retryTutorCruncherCall(
          () => tutorCruncherAPI.post(`/recipients/${recId}/`, {
            calendar_colour: colour,
            extra_attrs: recPayload.extra_attrs
          }),
          {
            maxRetries: 3,
            baseDelayMs: 1000,
            operationName: `Recipient update for ${student.first} ${student.last}`
          }
        );
        logger.info(`✅ Updated existing recipient ${recId}`);
      } catch (updateError) {
        logger.warn({ data: updateError.response?.data || updateError.message }, `⚠️ Failed to update recipient ${recId}:`);
      }
    } else {
    logger.info(`🆕 Creating new recipient for ${student.first} ${student.last}`);
    logger.info(`📅 DOB being sent: ${student.dob}`);
    logger.info({ data: JSON.stringify(recPayload, null, 2) }, `📋 Recipient payload:`);
    
    try {
      const { data } = await retryTutorCruncherCall(
        () => tutorCruncherAPI.post('/recipients/', recPayload),
        {
          maxRetries: 3,
          baseDelayMs: 1000,
          operationName: `Recipient creation for ${student.first} ${student.last}`
        }
      );
      recId = data.id;
      isNew = true;
      
      logger.info(`✅ Created new recipient ID: ${recId}`);
    } catch (createError) {
      logger.error(`❌ CRITICAL: Failed to create recipient for ${student.first} ${student.last}`);
      logger.error(`📅 DOB: ${student.dob}`);
      logger.error({ data: JSON.stringify(recPayload, null, 2) }, `📋 Payload:`);
      logger.error({ error: createError.response?.data || createError.message }, `🔍 TutorCruncher response:`);
      
      // Add more specific error message for common issues
      if (createError.response?.status === 400) {
        const errorMsg = createError.response.data || {};
        if (JSON.stringify(errorMsg).includes('sr_dob') || JSON.stringify(errorMsg).includes('date')) {
          // Log the error for monitoring
          logger.error(`🚨 DOB Validation Error - Student: ${student.first} ${student.last}, DOB: ${student.dob}, Error: ${JSON.stringify(errorMsg)}`);
          throw new Error(`Invalid date of birth: ${student.dob}. Please check the year is correct (e.g., 2018 not 20018).`);
        }
      }
      
      throw createError; // Re-throw original error if not date-related
    }
      
      // Add to existing recipients array for future lookups
      existingRecipients.push({
        id: recId,
        first_name: student.first,
        last_name: student.last
      });
    }
    
    return {
      recipientId: recId,
      isNew,
      student: student
    };
    
  } catch (error) {
    logger.error({ error: error.message }, `❌ Failed to create/update recipient for ${student.first} ${student.last}:`);
    
    // Send critical error alert for recipient creation failures
    await sendCriticalErrorAlert('recipient_creation_failed', {
      message: error.message,
      context: { student, clientId, colour },
      stack: error.stack
    }, null, clientId);
    
    throw error;
  }
};

/**
 * Process payment with database transaction and error handling
 * @param {Object} booking - Booking data
 * @param {number} submissionId - Submission ID
 * @param {Object} clientResult - Client creation result
 * @returns {Object} - Processing result
 */
const processPaymentWithTransaction = async (booking, submissionId, clientResult) => {
  const client = await pool.connect();
  
  try {
    await client.query('BEGIN');
    logger.info(`🔄 Starting transaction for submission ${submissionId}`);
    
    const result = {
      clientId: clientResult.clientId,
      recipientIds: [],
      creditRequestId: null,
      errors: []
    };
    
    // Get existing recipients (with retry)
    const clientRes = await retryTutorCruncherCall(
      () => tutorCruncherAPI.get(`/clients/${clientResult.clientId}/`),
      {
        maxRetries: 3,
        baseDelayMs: 1000,
        operationName: `Fetch recipients for client ${clientResult.clientId}`
      }
    );
    let paidRecipients = clientRes.data.paid_recipients || [];
    logger.info(`📊 Client ${clientResult.clientId} has ${paidRecipients.length} existing recipients`);
    
    // Process each student
    for (const student of booking.students) {
      try {
        const recipientResult = await createOrUpdateRecipient(
          student, 
          clientResult.clientId, 
          paidRecipients, 
          booking.colour
        );
        
        result.recipientIds.push(recipientResult.recipientId);
        
        // Add label to recipient (only if labelId exists)
        if (booking.labelId) {
          try {
            await retryTutorCruncherCall(
              () => tutorCruncherAPI.post(`/recipients/${recipientResult.recipientId}/add_label/`, {
                label: booking.labelId
              }),
              {
                maxRetries: 2,
                baseDelayMs: 500,
                operationName: `Add label to recipient ${recipientResult.recipientId}`
              }
            );
            logger.info(`🏷️ Added label ${booking.labelId} to recipient ${recipientResult.recipientId}`);
          } catch (labelError) {
            logger.error({ error: labelError.message }, `❌ Failed to add label to recipient ${recipientResult.recipientId}:`);
            result.errors.push({
              type: 'recipient_label',
              recipient: `${student.first} ${student.last}`,
              error: `Failed to add label: ${labelError.message}`
            });
          }
        } else {
          logger.warn(`⚠️ No labelId provided for recipient ${recipientResult.recipientId} - skipping label application`);
        }
        
      } catch (error) {
        logger.error({ error: error.message }, `❌ Failed to process student ${student.first} ${student.last}:`);
        result.errors.push({
          student: `${student.first} ${student.last}`,
          error: error.message
        });
      }
    }
    
    // Process credit request if not auto-refund
    const isAutoRefund = booking.actualPrice < 3;
    if (!isAutoRefund) {
      try {
        const studentCount = booking.students.length;
        const totalAmount = Number(booking.actualPrice); // already reflects all students
        
        // CRITICAL: Turn off auto-charge BEFORE checking for existing credit request
        // This prevents TutorCruncher from automatically setting credit requests to "Pending" status
        // Auto-charge values: 0=follow branch, 10=enabled, 20=disabled
        logger.info(`🔒 Turning off auto-charge for client ${clientResult.clientId} BEFORE any credit request operations...`);
        try {
          await updateAutoChargeWithRetry(clientResult.clientId, 20); // 20 = explicitly disabled
          logger.info(`✅ Auto-charge successfully turned off for client ${clientResult.clientId} (set to 20)`);
          
          // Add a small delay to ensure auto-charge setting takes effect
          logger.info(`⏳ Waiting 2 seconds for auto-charge setting to take effect...`);
          await new Promise(resolve => setTimeout(resolve, 2000));
          
          // Verify auto-charge was actually turned off
          try {
            const clientResponse = await retryTutorCruncherCall(
              () => tutorCruncherAPI.get(`/clients/${clientResult.clientId}/`),
              {
                maxRetries: 2,
                baseDelayMs: 500,
                operationName: `Verify auto-charge for client ${clientResult.clientId}`
              }
            );
            const currentAutoCharge = clientResponse.data?.auto_charge;
            logger.info(`🔍 Verified auto-charge setting for client ${clientResult.clientId}: ${currentAutoCharge}`);
            
            if (currentAutoCharge === true) {
              logger.warn(`⚠️ Auto-charge is still enabled (${currentAutoCharge}) for client ${clientResult.clientId}. This may cause issues.`);
            } else {
              logger.info(`✅ Auto-charge is disabled (${currentAutoCharge}) for client ${clientResult.clientId}`);
            }
          } catch (verifyError) {
            logger.warn({ data: verifyError.message }, `⚠️ Could not verify auto-charge setting:`);
          }
          
        } catch (autoChargeError) {
          logger.error({ error: autoChargeError.message }, `❌ CRITICAL: Failed to turn off auto-charge for client ${clientResult.clientId}:`);
          
          // Send critical error email - we cannot proceed with credit request creation
          await sendCriticalErrorAlert('auto_charge_turn_off_failed', {
            message: `Failed to turn off auto-charge for client ${clientResult.clientId}. Cannot create credit request to prevent double charging.`,
            context: { 
              submissionId, 
              clientId: clientResult.clientId, 
              booking: booking.parentFirst + ' ' + booking.parentLast,
              email: booking.parentEmail,
              amount: totalAmount
            },
            stack: autoChargeError.stack
          }, submissionId, clientResult.clientId);
          
          // Do NOT create credit request - this prevents double charging
          result.errors.push({
            type: 'auto_charge_failure',
            error: `Auto-charge could not be turned off: ${autoChargeError.message}. Credit request not created to prevent double charging.`
          });
          
          // Update submission with error
          await client.query(`
            UPDATE booking_submissions 
            SET credit_request_error = true,
                credit_request_error_message = $2
            WHERE id = $1
          `, [submissionId, `Auto-charge turn-off failed: ${autoChargeError.message}. Credit request not created to prevent double charging.`]);
          
          throw new Error(`Auto-charge turn-off failed: ${autoChargeError.message}. Cannot proceed with credit request creation.`);
        }
        
        // Check for existing credit request AFTER auto-charge is turned off
        const { rows: crRows } = await client.query(`
          SELECT credit_request_id, credit_request_paid 
          FROM booking_submissions 
          WHERE id = $1 
          FOR UPDATE
        `, [submissionId]);
        
        let creditRequestId = crRows[0]?.credit_request_id;
        let creditRequestPaid = crRows[0]?.credit_request_paid;
        
        if (!creditRequestId) {
          // Create credit request only after auto-charge is successfully turned off
          const creditResponse = await retryTutorCruncherCall(
            () => tutorCruncherAPI.post('/proforma-invoices/', {
              amount: Number(totalAmount.toFixed(2)),
              client: clientResult.clientId,
              send_pfi: false,
              raise_behaviour: 'raise-no-autopayment',
              description: `Credit Request for ${booking.parentFirst} ${booking.parentLast} (${studentCount} student${studentCount > 1 ? 's' : ''})`
            }),
            {
              maxRetries: 3,
              baseDelayMs: 1000,
              operationName: `Credit request creation for client ${clientResult.clientId}`
            }
          );
          
          creditRequestId = creditResponse.data.id;
          await client.query(`
            UPDATE booking_submissions 
            SET credit_request_id = $2 
            WHERE id = $1
          `, [submissionId, creditRequestId]);
          
          logger.info(`✅ Created credit request ID: ${creditRequestId} (auto-charge already turned off)`);
        }
        
        result.creditRequestId = creditRequestId;
        
        // Process payment if not already paid
        if (!creditRequestPaid) {
          // Check credit request status before attempting payment
          logger.info(`🔍 Checking credit request ${creditRequestId} status before payment...`);
          try {
            const statusResponse = await retryTutorCruncherCall(
              () => tutorCruncherAPI.get(`/proforma-invoices/${creditRequestId}/`),
              {
                maxRetries: 2,
                baseDelayMs: 500,
                operationName: `Check credit request ${creditRequestId} status`
              }
            );
            const creditRequestStatus = statusResponse.data?.status;
            logger.info(`📊 Credit request ${creditRequestId} status: ${creditRequestStatus}`);
            
            if (creditRequestStatus && creditRequestStatus.toLowerCase() !== 'unpaid') {
              logger.warn(`⚠️ Credit request ${creditRequestId} is not in 'unpaid' status (current: ${creditRequestStatus}). Skipping payment processing.`);

              // Mark as paid in our system since it's already been processed by auto-charge
              await client.query(`
                UPDATE booking_submissions
                SET credit_request_paid = true,
                    credit_request_error_message = COALESCE(credit_request_error_message, '') || E'\\n' || $2
                WHERE id = $1
              `, [submissionId, `Credit request already processed by auto-charge (status: ${creditRequestStatus})`]);

              logger.info(`✅ Credit request ${creditRequestId} already processed by auto-charge system`);
              creditRequestPaid = true; // Skip take_payment but continue with labels + auto-charge restore
            }
          } catch (statusError) {
            logger.warn({ data: statusError.message }, `⚠️ Could not check credit request status:`);
            // Continue with payment attempt anyway
          }
          
          // Ensure amount is properly formatted (2 decimal places)
          const formattedAmount = Number(totalAmount.toFixed(2));
          
          logger.info({ data: {
            originalAmount: totalAmount,
            formattedAmount: formattedAmount,
            amountType: typeof formattedAmount,
            method: 'credit_card'
          } }, `💳 Processing payment for credit request ${creditRequestId}:`);

          try {
            await retryTutorCruncherCall(
              () => tutorCruncherAPI.post(`/proforma-invoices/${creditRequestId}/take_payment/`, {
                amount: formattedAmount,
                method: 'credit_card',
                send_receipt: false
              }),
              {
                maxRetries: 3,
                baseDelayMs: 1000,
                operationName: `Process payment for credit request ${creditRequestId}`
              }
            );
            
            await client.query(`
              UPDATE booking_submissions 
              SET credit_request_paid = true 
              WHERE id = $1
            `, [submissionId]);
            
            logger.info(`✅ Payment processed for credit request ${creditRequestId}`);
          } catch (paymentError) {
            logger.error({ data: {
              status: paymentError.response?.status,
              statusText: paymentError.response?.statusText,
              data: paymentError.response?.data,
              message: paymentError.message,
              originalAmount: totalAmount,
              formattedAmount: formattedAmount,
              method: 'credit_card'
            } }, `❌ Payment processing failed for credit request ${creditRequestId}:`);
            throw paymentError; // Re-throw to be caught by outer catch
          }
        }
        
      } catch (error) {
        logger.error({ error: error.message }, `❌ Credit request processing failed:`);
        result.errors.push({
          type: 'credit_request',
          error: error.message
        });
      }
    }
    
    // Add label to client (only if label is applicable to clients)
    if (!booking.labelId) {
      logger.warn(`⚠️ No labelId provided for submission ${submissionId} - skipping label application to client`);
      result.errors.push({
        type: 'missing_label',
        error: 'No labelId provided in booking data'
      });
    } else {
      try {
        // Check if the label is applicable to clients before applying
        const labelResponse = await retryTutorCruncherCall(
          () => tutorCruncherAPI.get(`/labels/${booking.labelId}/`),
          {
            maxRetries: 2,
            baseDelayMs: 500,
            operationName: `Check label ${booking.labelId}`
          }
        );
        const applicableRoles = labelResponse.data.applicable_role_types || [];
        
        if (applicableRoles.includes('client')) {
          await retryTutorCruncherCall(
            () => tutorCruncherAPI.post(`/clients/${clientResult.clientId}/add_label/`, {
              label: booking.labelId
            }),
            {
              maxRetries: 2,
              baseDelayMs: 500,
              operationName: `Add label to client ${clientResult.clientId}`
            }
          );
          logger.info(`🏷️ Added label ${booking.labelId} (${booking.labelName || 'unnamed'}) to client ${clientResult.clientId}`);
        } else {
          logger.info(`⚠️ Skipping label ${booking.labelId} for client ${clientResult.clientId} - not applicable to clients`);
          logger.info(`📝 Label will be applied to service when lesson is completed`);
          result.errors.push({
            type: 'label_not_applicable',
            labelId: booking.labelId,
            labelName: booking.labelName,
            error: 'Label is not applicable to clients'
          });
        }
      } catch (labelError) {
        logger.error({ error: labelError.message }, `❌ Could not check label applicability for label ${booking.labelId}:`);
        result.errors.push({
          type: 'label_check_failed',
          labelId: booking.labelId,
          error: labelError.message
        });
      }
    }
    
    // ✅ REMOVED: No longer need to update status to "prospect" since clients are created as "live"
    // Client is already created with status: "live" in the initial payload
    
    // CRITICAL: Turn auto-charge back on to follow branch settings (0)
    // After the trial payment has been processed, we want clients to follow the branch auto-charge settings
    logger.info(`🔄 Setting auto-charge to follow branch settings (0) for client ${clientResult.clientId}...`);
    try {
      await updateAutoChargeWithRetry(clientResult.clientId, 0); // 0 = follow branch settings
      logger.info(`✅ Auto-charge set to follow branch settings (0) for client ${clientResult.clientId}`);
    } catch (autoChargeError) {
      logger.error({ error: autoChargeError.message }, `❌ Failed to set auto-charge to follow branch settings for client ${clientResult.clientId}:`);
      // Log error but don't fail the entire transaction - this is a non-critical issue
      result.errors.push({
        type: 'auto_charge_re_enable',
        error: `Failed to re-enable auto-charge following branch settings: ${autoChargeError.message}`
      });
    }
    
    await client.query('COMMIT');
    logger.info(`✅ Transaction committed for submission ${submissionId}`);
    
    return result;
    
  } catch (error) {
    await client.query('ROLLBACK');
    logger.error({ error: error.message }, `❌ Transaction rolled back for submission ${submissionId}:`);
    
    // Send critical error alert for transaction failures
    await sendCriticalErrorAlert('payment_transaction_failed', {
      message: error.message,
      context: { submissionId, booking, clientResult },
      stack: error.stack
    }, submissionId, clientResult.clientId);
    
    throw error;
  } finally {
    client.release();
  }
};

module.exports = {
  findExistingClient,
  createOrUpdateClient,
  updateAutoChargeWithRetry,
  validateStudentData,
  createOrUpdateRecipient,
  processPaymentWithTransaction
};
