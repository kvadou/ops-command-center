const express = require('express');
const router = express.Router();
const crypto = require('crypto');
const { asyncHandler } = require('../middleware/error-handler');
const { logger } = require('../utils/logger');

// Use the global pool from deps (which is environment-aware)
const {
  pool,
  axios,
  auth,
  tutorCruncherAPI,
} = global;

// Middleware to get location-aware pool
router.use((req, res, next) => {
  // Get location from subdomain or default to production
  const hostname = req.get('host') || '';
  let location = 'production';
  
  if (hostname.includes('eastside')) {
    location = 'eastside';
  } else if (hostname.includes('westside')) {
    location = 'westside';
  }
  
  // Set location-aware pool
  req.location = location;
  req.locationPool = pool; // Use global pool (it's already location-aware via deps)
  
  next();
});

// Get Brevo email sender
const { getInstance: getBrevoEmailSender } = require('../utils/brevo-email-sender');

// Get current environment/location
const getCurrentLocation = (req) => {
  const location = req.location || 'production';
  return location;
};

// Generate unique form token
const generateFormToken = () => {
  return crypto.randomBytes(32).toString('hex');
};

// Test endpoint to verify route is working
router.get('/test', (req, res) => {
  res.json({ message: 'School student import API is working', timestamp: new Date().toISOString() });
});

// GET /api/school-student-import/:schoolClientId/prospects - Get prospect students
router.get('/:schoolClientId/prospects', auth, asyncHandler(async (req, res) => {
  try {
    const { schoolClientId } = req.params;
    const { status } = req.query;
    const locationPool = req.locationPool || pool;
    
    let query = `
      SELECT * FROM school_student_prospects 
      WHERE school_client_id = $1
    `;
    const params = [schoolClientId];
    
    if (status) {
      query += ` AND status = $2`;
      params.push(status);
    }
    
    query += ` ORDER BY created_at DESC`;
    
    const result = await locationPool.query(query, params);
    
    res.json({ prospects: result.rows });
  } catch (error) {
    logger.error({ err: error }, 'Error fetching prospect students:');
    logger.error({ data: error.stack }, 'Error stack:');
    res.status(500).json({ 
      error: 'Failed to fetch prospects', 
      details: error.message,
      stack: process.env.NODE_ENV === 'development' ? error.stack : undefined
    });
  }
}));

// POST /api/school-student-import/:schoolClientId/prospects - Create prospect student
router.post('/:schoolClientId/prospects', auth, asyncHandler(async (req, res) => {
  try {
    const { schoolClientId } = req.params;
    const locationPool = req.locationPool || pool;
    const {
      student_first_name,
      student_last_name,
      parent_first_name,
      parent_last_name,
      parent_email,
      parent_phone,
      add_to_current_job,
      add_to_future_lessons,
      target_job_service_id,
      notes
    } = req.body;
    
    // Get school name - try multiple sources
    let schoolName = req.body.school_name || 'Unknown School';
    try {
      const schoolResult = await locationPool.query(
        'SELECT school_name FROM school_email_contacts WHERE school_client_id = $1 LIMIT 1',
        [schoolClientId]
      );
      if (schoolResult.rows.length > 0) {
        schoolName = schoolResult.rows[0].school_name;
      }
    } catch (err) {
      // If school_email_contacts table doesn't exist or query fails, use fallback
      logger.warn({ error: err.message }, 'Could not fetch school name from school_email_contacts:');
    }
    
    // Generate form token
    const formToken = generateFormToken();
    
    // Insert prospect
    const result = await locationPool.query(
      `INSERT INTO school_student_prospects (
        school_client_id, school_name, student_first_name, student_last_name,
        parent_first_name, parent_last_name, parent_email, parent_phone,
        add_to_current_job, add_to_future_lessons, target_job_service_id,
        form_token, source, created_by, notes
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15)
      RETURNING *`,
      [
        schoolClientId,
        schoolName,
        student_first_name,
        student_last_name || '',
        parent_first_name || '',
        parent_last_name || '',
        parent_email,
        parent_phone || '',
        add_to_current_job || false,
        add_to_future_lessons || false,
        target_job_service_id || null,
        formToken,
        'manual',
        req.user?.email || 'system',
        notes || ''
      ]
    );
    
    const prospect = result.rows[0];
    
    // If auto-add to current job is enabled, try to add them
    if (add_to_current_job && target_job_service_id) {
      // This will be handled by the enrollment endpoint
    }
    
    // Trigger email campaign if enabled
    if (add_to_future_lessons) {
      try {
        const location = getCurrentLocation(req);
        const brevoEmailSender = getBrevoEmailSender();
        
        if (brevoEmailSender) {
          // Get enrollment reminder template
          const templateResult = await locationPool.query(
            'SELECT * FROM school_email_campaign_templates WHERE campaign_type = $1',
            ['enrollment_reminder']
          );
          
          if (templateResult.rows.length > 0) {
            const template = templateResult.rows[0];
            
            // Replace template variables
            let subject = template.subject_template || 'Enroll in Acme Operations';
            let body = template.body_template || '';
            
            subject = subject.replace(/\{\{school_name\}\}/g, schoolName);
            subject = subject.replace(/\{\{contact_name\}\}/g, parent_first_name || parent_email);
            body = body.replace(/\{\{school_name\}\}/g, schoolName);
            body = body.replace(/\{\{contact_name\}\}/g, parent_first_name || parent_email);
            
            // Send email
            await brevoEmailSender.sendEmail({
              to: parent_email,
              subject: subject,
              html: body,
              from: template.from_email || 'support@acmeops.com',
              location: location
            });
            
            // Update prospect with email sent status
            await locationPool.query(
              `UPDATE school_student_prospects SET
                email_campaign_sent = TRUE,
                email_campaign_sent_at = NOW(),
                email_campaign_type = 'enrollment_reminder'
              WHERE id = $1`,
              [prospect.id]
            );
          }
        }
      } catch (emailError) {
        logger.error({ data: emailError }, 'Error sending enrollment email:');
        // Don't fail the request if email fails
      }
    }
    
    res.json({ prospect: prospect });
  } catch (error) {
    logger.error({ err: error }, 'Error creating prospect student:');
    res.status(500).json({ error: 'Failed to create prospect', details: error.message });
  }
}));

// POST /api/school-student-import/:schoolClientId/enroll - Enroll prospect in TutorCruncher
router.post('/:schoolClientId/enroll', auth, asyncHandler(async (req, res) => {
  try {
    const { schoolClientId } = req.params;
    const { prospectId } = req.body;
    const locationPool = req.locationPool || pool;
    
    // Get prospect
    const prospectResult = await locationPool.query(
      'SELECT * FROM school_student_prospects WHERE id = $1 AND school_client_id = $2',
      [prospectId, schoolClientId]
    );
    
    if (prospectResult.rows.length === 0) {
      return res.status(404).json({ error: 'Prospect not found' });
    }
    
    const prospect = prospectResult.rows[0];
    
    // Create client in TutorCruncher
    try {
      const clientPayload = {
        first_name: prospect.parent_first_name || 'Parent',
        last_name: prospect.parent_last_name || '',
        email: prospect.parent_email,
        phone: prospect.parent_phone || '',
        status: 'live',
        send_emails: false, // Don't send welcome email yet
      };
      
      const clientResponse = await tutorCruncherAPI.post('/clients/', clientPayload);
      const clientId = clientResponse.data.id;
      
      logger.info(`✅ Created client ${clientId} in TutorCruncher for prospect ${prospectId}`);
      
      // Update prospect with TutorCruncher client ID
      await locationPool.query(
        `UPDATE school_student_prospects SET
          tutorcruncher_client_id = $1,
          status = 'enrolled',
          updated_at = NOW()
        WHERE id = $2`,
        [clientId, prospectId]
      );
      
      // If add_to_current_job is enabled, add them to the service
      if (prospect.add_to_current_job && prospect.target_job_service_id) {
        try {
          // Get service details
          const serviceResponse = await tutorCruncherAPI.get(`/services/${prospect.target_job_service_id}/`);
          const service = serviceResponse.data;
          
          // Add client to service (this creates an enrollment)
          // Note: TutorCruncher API may require different endpoint for adding clients to services
          // This is a placeholder - adjust based on actual TutorCruncher API
          logger.info(`📝 Would add client ${clientId} to service ${prospect.target_job_service_id}`);
          
        } catch (serviceError) {
          logger.error({ data: serviceError }, 'Error adding client to service:');
          // Don't fail the enrollment if service addition fails
        }
      }
      
      res.json({
        success: true,
        prospect: { ...prospect, tutorcruncher_client_id: clientId, status: 'enrolled' },
        message: 'Student enrolled successfully in TutorCruncher'
      });
      
    } catch (tcError) {
      logger.error({ data: tcError.response?.data || tcError.message }, 'Error creating client in TutorCruncher:');
      
      // Check if client already exists
      if (tcError.response?.status === 400) {
        // Try to find existing client by email
        try {
          const lookupResponse = await tutorCruncherAPI.get(`/clients/?email=${encodeURIComponent(prospect.parent_email)}`);
          const existingClients = Array.isArray(lookupResponse.data) ? lookupResponse.data : lookupResponse.data.results || [];
          
          if (existingClients.length > 0) {
            const existingClient = existingClients[0];
            
            // Update prospect with existing client ID
            await locationPool.query(
              `UPDATE school_student_prospects SET
                tutorcruncher_client_id = $1,
                status = 'enrolled',
                updated_at = NOW()
              WHERE id = $2`,
              [existingClient.id, prospectId]
            );
            
            return res.json({
              success: true,
              prospect: { ...prospect, tutorcruncher_client_id: existingClient.id, status: 'enrolled' },
              message: 'Student enrolled using existing TutorCruncher client'
            });
          }
        } catch (lookupError) {
          logger.error({ data: lookupError }, 'Error looking up existing client:');
        }
      }
      
      res.status(500).json({
        error: 'Failed to create client in TutorCruncher',
        details: tcError.response?.data || tcError.message
      });
    }
  } catch (error) {
    logger.error({ err: error }, 'Error enrolling prospect:');
    res.status(500).json({ error: 'Failed to enroll prospect', details: error.message });
  }
}));

// GET /api/school-student-import/form/:formToken/config - Get form configuration (public)
router.get('/form/:formToken/config', asyncHandler(async (req, res) => {
  try {
    const { formToken } = req.params;
    const locationPool = req.locationPool || pool;
    
    // First, try to get the form without the Services join (more reliable)
    const formResult = await locationPool.query(
      `SELECT * FROM school_student_import_forms 
       WHERE form_token = $1 AND is_active = TRUE`,
      [formToken]
    );
    
    if (formResult.rows.length === 0) {
      return res.status(404).json({ error: 'Form not found or inactive' });
    }
    
    const form = formResult.rows[0];
    
    // Try to get service name if auto_add_to_service_id exists
    // Note: Service info is optional - if the query fails, we continue without it
    let serviceName = null;
    let serviceId = form.auto_add_to_service_id || null;
    
    // Only try to fetch service name if we have a service ID
    // This is optional and failures are handled gracefully
    if (form.auto_add_to_service_id) {
      try {
        // First try to get from local services table
        try {
          const serviceResult = await locationPool.query(
            `SELECT service_id, name as service_name
             FROM services 
             WHERE service_id = $1 
             LIMIT 1`,
            [form.auto_add_to_service_id]
          );
          if (serviceResult.rows.length > 0) {
            serviceName = serviceResult.rows[0].service_name || null;
          }
        } catch (localError) {
          // If local query fails, try TutorCruncher API
          try {
            const tcServiceResponse = await tutorCruncherAPI.get(`/services/${form.auto_add_to_service_id}/`);
            serviceName = tcServiceResponse.data.name || null;
            logger.info(`✅ Fetched service name from TutorCruncher: ${serviceName}`);
          } catch (tcError) {
            logger.warn({ data: tcError.message }, 'Could not fetch service name from TutorCruncher:');
          }
        }
      } catch (error) {
        // Just continue without service info
        logger.warn({ error: error.message }, 'Services lookup failed:');
      }
    }
    
    // Return safe form config (no sensitive data)
    res.json({
      form_name: form.form_name,
      school_name: form.school_name,
      service_name: serviceName,
      service_id: serviceId,
      require_student_name: form.require_student_name,
      require_parent_name: form.require_parent_name,
      require_email: form.require_email,
      require_phone: form.require_phone,
      allow_add_to_current_job: form.allow_add_to_current_job,
      allow_add_to_future_lessons: form.allow_add_to_future_lessons,
      default_add_to_current_job: form.default_add_to_current_job,
      default_add_to_future_lessons: form.default_add_to_future_lessons,
    });
  } catch (error) {
    logger.error({ err: error }, 'Error fetching form config:');
    logger.error({ error: error.message }, 'Error message:');
    logger.error({ data: error.code }, 'Error code:');
    logger.error({ data: error.detail }, 'Error detail:');
    logger.error({ data: error.stack }, 'Error stack:');
    
    // Provide more helpful error messages
    let errorMessage = 'Failed to fetch form configuration';
    if (error.code === '42P01') {
      errorMessage = 'Database table does not exist. Please run the migration.';
    } else if (error.code === '42703') {
      errorMessage = 'Database column does not exist. Please check the migration.';
    } else if (error.message) {
      errorMessage = error.message;
    }
    
    res.status(500).json({ 
      error: errorMessage,
      details: error.message,
      code: error.code,
      stack: process.env.NODE_ENV === 'development' ? error.stack : undefined
    });
  }
}));

// GET /api/school-student-import/:schoolClientId/forms - Get import forms for school
router.get('/:schoolClientId/forms', auth, asyncHandler(async (req, res) => {
  try {
    const { schoolClientId } = req.params;
    const locationPool = req.locationPool || pool;
    
    const result = await locationPool.query(
      'SELECT * FROM school_student_import_forms WHERE school_client_id = $1 ORDER BY created_at DESC',
      [schoolClientId]
    );
    
    res.json({ forms: result.rows });
  } catch (error) {
    logger.error({ err: error }, 'Error fetching import forms:');
    logger.error({ data: error.stack }, 'Error stack:');
    res.status(500).json({ 
      error: 'Failed to fetch forms', 
      details: error.message,
      stack: process.env.NODE_ENV === 'development' ? error.stack : undefined
    });
  }
}));

// POST /api/school-student-import/:schoolClientId/forms - Create import form
router.post('/:schoolClientId/forms', auth, asyncHandler(async (req, res) => {
  try {
    const { schoolClientId } = req.params;
    const locationPool = req.locationPool || pool;
    const {
      form_name,
      require_student_name,
      require_parent_name,
      require_email,
      require_phone,
      allow_add_to_current_job,
      allow_add_to_future_lessons,
      default_add_to_current_job,
      default_add_to_future_lessons,
      auto_add_to_service_id,
      auto_trigger_email_campaign,
      email_campaign_type
    } = req.body;
    
    // Get school name - try multiple sources
    let schoolName = req.body.school_name || 'Unknown School';
    try {
      const schoolResult = await locationPool.query(
        'SELECT school_name FROM school_email_contacts WHERE school_client_id = $1 LIMIT 1',
        [schoolClientId]
      );
      if (schoolResult.rows.length > 0) {
        schoolName = schoolResult.rows[0].school_name;
      }
    } catch (err) {
      // If school_email_contacts table doesn't exist or query fails, use fallback
      logger.warn({ error: err.message }, 'Could not fetch school name from school_email_contacts:');
    }
    
    // Generate form token and URL
    const formToken = generateFormToken();
    // Use join.acmeops.com for public forms (like booking forms)
    const baseUrl = process.env.JOIN_URL || 'https://join.acmeops.com';
    const formUrl = `${baseUrl}/school-student-form/${formToken}`;
    
    const result = await locationPool.query(
      `INSERT INTO school_student_import_forms (
        school_client_id, school_name, form_token, form_name, form_url,
        require_student_name, require_parent_name, require_email, require_phone,
        allow_add_to_current_job, allow_add_to_future_lessons,
        default_add_to_current_job, default_add_to_future_lessons,
        auto_add_to_service_id, auto_trigger_email_campaign, email_campaign_type,
        created_by
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17)
      RETURNING *`,
      [
        schoolClientId,
        schoolName,
        formToken,
        form_name || 'Student Registration Form',
        formUrl,
        require_student_name !== false,
        require_parent_name !== false,
        require_email !== false,
        require_phone || false,
        allow_add_to_current_job !== false,
        allow_add_to_future_lessons !== false,
        default_add_to_current_job || false,
        default_add_to_future_lessons !== false,
        auto_add_to_service_id || null,
        auto_trigger_email_campaign !== false,
        email_campaign_type || 'enrollment_reminder',
        req.user?.email || 'system'
      ]
    );
    
    res.json({ form: result.rows[0] });
  } catch (error) {
    logger.error({ err: error }, 'Error creating import form:');
    logger.error({ data: error.stack }, 'Error stack:');
    res.status(500).json({ 
      error: 'Failed to create form', 
      details: error.message,
      stack: process.env.NODE_ENV === 'development' ? error.stack : undefined
    });
  }
}));

// DELETE /api/school-student-import/:schoolClientId/forms/:formId - Delete import form
router.delete('/:schoolClientId/forms/:formId', auth, asyncHandler(async (req, res) => {
  try {
    const { schoolClientId, formId } = req.params;
    const locationPool = req.locationPool || pool;
    
    // Verify the form belongs to this school
    const formCheck = await locationPool.query(
      'SELECT id, form_name, total_submissions FROM school_student_import_forms WHERE id = $1 AND school_client_id = $2',
      [formId, schoolClientId]
    );
    
    if (formCheck.rows.length === 0) {
      return res.status(404).json({ 
        error: 'Form not found or does not belong to this school' 
      });
    }
    
    const form = formCheck.rows[0];
    
    // Delete the form (soft delete by setting is_active to false, or hard delete)
    // Using hard delete since we want to prevent reuse of old forms
    await locationPool.query(
      'DELETE FROM school_student_import_forms WHERE id = $1',
      [formId]
    );
    
    logger.info(`✅ Deleted form "${form.form_name}" (ID: ${formId}) for school ${schoolClientId}`);
    
    res.json({ 
      success: true,
      message: `Form "${form.form_name}" has been deleted successfully.`,
      deletedFormId: formId
    });
  } catch (error) {
    logger.error({ err: error }, 'Error deleting import form:');
    logger.error({ data: error.stack }, 'Error stack:');
    res.status(500).json({ 
      error: 'Failed to delete form', 
      details: error.message,
      stack: process.env.NODE_ENV === 'development' ? error.stack : undefined
    });
  }
}));

// POST /api/school-student-import/form/:formToken - Public form submission endpoint
// Now handles multiple students and automatically creates them in TutorCruncher
router.post('/form/:formToken', asyncHandler(async (req, res) => {
  try {
    const { formToken } = req.params;
    const locationPool = req.locationPool || pool;
    const { students, service_id } = req.body;
    
    // Support both old single-student format and new multi-student format
    const studentsArray = Array.isArray(students) ? students : [{
      student_first_name: req.body.student_first_name || '',
      student_last_name: req.body.student_last_name || '',
      parent_first_name: req.body.parent_first_name || '',
      parent_last_name: req.body.parent_last_name || '',
      parent_email: req.body.parent_email || '',
    }];
    
    // Get form configuration
    const formResult = await locationPool.query(
      'SELECT * FROM school_student_import_forms WHERE form_token = $1 AND is_active = TRUE',
      [formToken]
    );
    
    if (formResult.rows.length === 0) {
      return res.status(404).json({ error: 'Form not found or inactive' });
    }
    
    const form = formResult.rows[0];
    const targetServiceId = service_id || form.auto_add_to_service_id;
    
    if (!targetServiceId) {
      return res.status(400).json({ error: 'No service/job specified. Please configure the form with a target class.' });
    }
    
    // Validate: at least one student with first name
    const validStudents = studentsArray.filter(s => s.student_first_name && s.student_first_name.trim());
    if (validStudents.length === 0) {
      return res.status(400).json({ error: 'Please enter at least one student with a first name.' });
    }
    
    // Validate emails if provided
    const invalidEmails = validStudents.filter(s => 
      s.parent_email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(s.parent_email)
    );
    if (invalidEmails.length > 0) {
      return res.status(400).json({ error: 'Please enter valid email addresses for all students.' });
    }
    
    const createdStudents = [];
    const errors = [];
    
    // Get all appointments for this service
    let appointments = [];
    try {
      const appointmentsResult = await locationPool.query(
        `SELECT appointment_id FROM appointments WHERE service_id = $1 AND is_deleted IS NOT TRUE`,
        [targetServiceId]
      );
      appointments = appointmentsResult.rows.map(row => row.appointment_id);
      logger.info(`📅 Found ${appointments.length} appointments for service ${targetServiceId}`);
    } catch (apptError) {
      logger.error({ data: apptError }, 'Error fetching appointments:');
      // Continue even if we can't fetch appointments - we'll still create the clients
    }
    
    // Process each student
    for (const student of validStudents) {
      try {
        // Create client in TutorCruncher for each student
        // Use parent info if available, otherwise use student info
        const clientPayload = {
          first_name: student.parent_first_name || student.student_first_name || 'Student',
          last_name: student.parent_last_name || student.student_last_name || '',
          email: student.parent_email || `${student.student_first_name.toLowerCase().replace(/\s+/g, '.')}@school.acmeops.com`,
          status: 'live',
          send_emails: false, // Don't send welcome emails automatically
        };
        
        let clientId;
        try {
          const clientResponse = await tutorCruncherAPI.post('/clients/', clientPayload);
          clientId = clientResponse.data.id;
          logger.info(`✅ Created client ${clientId} in TutorCruncher for student ${student.student_first_name}`);
        } catch (tcError) {
          // Try to find existing client by email
          if (student.parent_email) {
            try {
              const lookupResponse = await tutorCruncherAPI.get(`/clients/?email=${encodeURIComponent(student.parent_email)}`);
              const existingClients = Array.isArray(lookupResponse.data) 
                ? lookupResponse.data 
                : (lookupResponse.data.results || []);
              
              if (existingClients.length > 0) {
                clientId = existingClients[0].id;
                logger.info(`♻️ Using existing client ${clientId} for email ${student.parent_email}`);
              } else {
                throw tcError; // Re-throw if not found
              }
            } catch (lookupError) {
              logger.error({ data: tcError.message }, `❌ Failed to create or find client for ${student.student_first_name}:`);
              errors.push(`Failed to create student ${student.student_first_name}: ${tcError.response?.data?.error || tcError.message}`);
              continue;
            }
          } else {
            throw tcError;
          }
        }
        
        // Add client to all appointments (lessons) for this service
        let addedToAppointments = 0;
        for (const appointmentId of appointments) {
          try {
            await tutorCruncherAPI.post(`/appointments/${appointmentId}/recipient/add/`, {
              recipient: clientId
            });
            addedToAppointments++;
            // Small delay to avoid rate limiting
            await new Promise(resolve => setTimeout(resolve, 100));
          } catch (apptError) {
            const errorMsg = apptError.response?.data?.error || apptError.message;
            // Ignore "already exists" errors
            if (!/already|exists|duplicate/i.test(errorMsg)) {
              logger.warn({ data: errorMsg }, `⚠️ Failed to add client ${clientId} to appointment ${appointmentId}:`);
            }
          }
        }
        
        logger.info(`✅ Added client ${clientId} to ${addedToAppointments} appointments`);
        
        // Create prospect record for tracking
        const prospectResult = await locationPool.query(
          `INSERT INTO school_student_prospects (
            school_client_id, school_name, student_first_name, student_last_name,
            parent_first_name, parent_last_name, parent_email, parent_phone,
            add_to_current_job, add_to_future_lessons, target_job_service_id,
            tutorcruncher_client_id, status, form_token, source, notes
          ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16)
          RETURNING *`,
          [
            form.school_client_id,
            form.school_name,
            student.student_first_name || '',
            student.student_last_name || '',
            student.parent_first_name || '',
            student.parent_last_name || '',
            student.parent_email || '',
            '', // No phone number
            true, // Always add to current job
            false, // Don't add to future lessons (already added to current)
            targetServiceId,
            clientId,
            'enrolled', // Already enrolled since we created them in TC
            formToken,
            'form',
            `Submitted via public form: ${form.form_name}. Automatically enrolled in service ${targetServiceId} and ${addedToAppointments} appointments.`
          ]
        );
        
        createdStudents.push({
          studentName: `${student.student_first_name} ${student.student_last_name}`.trim(),
          clientId: clientId,
          prospectId: prospectResult.rows[0].id,
          addedToAppointments: addedToAppointments
        });
        
      } catch (studentError) {
        logger.error({ data: studentError }, `Error processing student ${student.student_first_name}:`);
        errors.push(`Failed to process ${student.student_first_name}: ${studentError.message}`);
      }
    }
    
    // Update form statistics
    await locationPool.query(
      `UPDATE school_student_import_forms SET
        total_submissions = total_submissions + ${createdStudents.length},
        last_submission_at = NOW()
      WHERE id = $1`,
      [form.id]
    );
    
    // Send success response
    res.json({
      success: true,
      message: `Successfully enrolled ${createdStudents.length} student${createdStudents.length !== 1 ? 's' : ''} in ${form.school_name}${form.service_name ? ` - ${form.service_name}` : ''}`,
      studentsCreated: createdStudents.length,
      students: createdStudents,
      errors: errors.length > 0 ? errors : undefined
    });
  } catch (error) {
    logger.error({ err: error }, 'Error processing form submission:');
    res.status(500).json({ error: 'Failed to process submission', details: error.message });
  }
}));

// GET /api/school-student-import/:schoolClientId/imports - Get import history
router.get('/:schoolClientId/imports', auth, asyncHandler(async (req, res) => {
  try {
    const { schoolClientId } = req.params;
    const locationPool = req.locationPool || pool;
    
    const result = await locationPool.query(
      'SELECT * FROM school_student_imports WHERE school_client_id = $1 ORDER BY created_at DESC LIMIT 50',
      [schoolClientId]
    );
    
    res.json({ imports: result.rows });
  } catch (error) {
    logger.error({ err: error }, 'Error fetching import history:');
    res.status(500).json({ error: 'Failed to fetch import history', details: error.message });
  }
}));

module.exports = router;

