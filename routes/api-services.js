const express = require('express');
const multer = require('multer');
const { getPool } = require('../database-connections');
const { columnExists } = require('../utils/schema-cache');
const { asyncHandler } = require('../middleware/error-handler');
const { logger } = require('../utils/logger');
const router = express.Router();

// Helper function to get the correct database connection based on subdomain
function getLocationPool(req) {
  const hostname = req.get('host') || req.hostname;
  let location = 'production'; // default
  
  // Check if we're running locally
  if (hostname && (hostname.includes('localhost') || hostname.includes('127.0.0.1') || hostname.includes(':3001') || hostname.includes(':5001'))) {
    location = 'local';
  } else if (hostname) {
    const subdomain = hostname.split('.')[0];
    switch (subdomain) {
      case 'eastside':
        location = 'eastside';
        break;
      case 'westside':
        location = 'westside';
        break;
      case 'join':
        location = 'production';
        break;
      default:
        location = 'production';
    }
  }
  
  return getPool(location);
}

// Configure multer for file uploads
const upload = multer({
  storage: multer.memoryStorage(),
  limits: {
    fileSize: 10 * 1024 * 1024 // 10MB limit
  }
});
const {
  Appointment,
  auth,
  axios,
  cloudinary,
  ColourGroup,
  db,
  delay,
  GRAVITY_FORMS_API_BASE_URL,
  jwt,
  KLAVIYO_API_KEY,
  LABEL_ID,
  limitedGet,
  Location,
  pool,
  rateLimitRetry,
  sequelize,
  Service,
  stripe,
  transporter,
  TUTORCRUNCHER_API_BASE,
  tutorCruncherAPI
} = global;

// POST /api/services - Create or update a service
router.post('/', upload.single('image'), asyncHandler(async (req, res) => {
  let {
    serviceId,
    name,
    description,
    location,
    price,
    selectedImage,
    type,
    colourGroup,
    labelId,
    labelName,
    publicVisible,
    studentDiscountEnabled,
    studentDiscountPercent,
    staffDiscountEnabled,
    staffDiscountPercentMonthly,
    staffDiscountPercentTerm,
    ownerDiscountEnabled,
    ownerDiscountPercentMonthly,
    ownerDiscountPercentTerm
  } = req.body;
  
  const { localOnly } = req.body;
  
  try {
    // Debug: Log the received data
      logger.info({ data: {
      serviceId,
      name,
      description,
      location,
      price,
      type,
      colourGroup,
      labelId,
      labelName,
      publicVisible,
        studentDiscountEnabled,
        studentDiscountPercent,
      selectedImage,
      hasFile: !!req.file,
      localOnly,
      bodyKeys: Object.keys(req.body || {})
    } }, 'POST /api/services - Received data:');
    
    // If serviceId is not provided, this is a new service creation
    // We'll create it in TutorCruncher first (unless localOnly), then save locally
    // Normalize serviceId: convert empty string to undefined, trim whitespace
    if (serviceId === '' || serviceId === null) {
      serviceId = undefined;
    } else if (typeof serviceId === 'string') {
      serviceId = serviceId.trim();
      if (serviceId === '') {
        serviceId = undefined;
      }
    }
    const isNewService = !serviceId;
    
    let imageUrl = selectedImage;
    if (req.file) {
      const result = await new Promise((resolve, reject) => {
        const stream = cloudinary.uploader.upload_stream((error, result) => {
          if (error) return reject(error);
          resolve(result);
        });
        stream.end(req.file.buffer);
      });
      imageUrl = result.secure_url;
    }
    
    // Use location-specific database connection
    const locationPool = req.locationPool || pool;
    
    // If creating a new service, create it in TutorCruncher first (unless localOnly)
    if (isNewService) {
      if (!localOnly) {
        // Extract TutorCruncher-compatible fields from request body
        const {
          dft_charge_type,
          dft_charge_rate,
          dft_contractor_rate,
          sr_premium,
          dft_max_srs,
          dft_contractor_permissions,
          require_sr,
          require_con,
          review_units,
          cap,
          added_fee_per_lesson,
          job_inactivity_time,
          lesson_reports_required,
          auto_invoice,
          sales_codes,
          client_id,
          student_ids
        } = req.body;

        // Build TutorCruncher service payload
        const tcPayload = {
          name: name,
          description: description || '',
          dft_charge_type: dft_charge_type || 'hourly',
          dft_charge_rate: parseFloat(dft_charge_rate) || 0,
          dft_contractor_rate: parseFloat(dft_contractor_rate) || 0,
          sr_premium: sr_premium ? parseFloat(sr_premium) : 0,
          dft_max_srs: dft_max_srs ? parseInt(dft_max_srs) : 10,
          dft_contractor_permissions: dft_contractor_permissions || 'add-edit-complete',
          require_rcr: require_sr || false,
          require_con_job: require_con !== false,
          review_units: review_units ? parseInt(review_units) : 0,
          cap: cap ? parseFloat(cap) : null,
          extra_fee_per_apt: added_fee_per_lesson ? parseFloat(added_fee_per_lesson) : null,
          inactivity_time: job_inactivity_time ? parseInt(job_inactivity_time) : null,
          report_required: lesson_reports_required || false,
          auto_invoice: auto_invoice !== false,
          sales_codes: sales_codes || null,
          status: 'pending',
          colour: req.body.colour || 'Khaki',
          net_gross: 'gross'
        };

        // Add recipients (rcrs) if student_ids provided
        if (student_ids && Array.isArray(student_ids) && student_ids.length > 0) {
          tcPayload.rcrs = student_ids.map(id => ({
            recipient: parseInt(id, 10),
            charge_rate: parseFloat(dft_charge_rate) || 0
          }));
        }

        // Create service in TutorCruncher
        try {
          const tcResponse = await tutorCruncherAPI.post('/services/', tcPayload);
          serviceId = tcResponse.data.id;
          logger.info(`✅ Created new service in TutorCruncher: ${serviceId}`);
        } catch (tcError) {
          logger.error({ data: tcError.response?.data || tcError.message }, '❌ Error creating service in TutorCruncher:');
          return res.status(500).json({
            error: 'Failed to create service in TutorCruncher',
            details: tcError.response?.data || tcError.message
          });
        }
      } else {
        // Local-only mode: Generate a local service ID (negative number to avoid conflicts)
        try {
          const { rows: maxIdRows } = await locationPool.query(`
            SELECT MIN(CAST("serviceId" AS INTEGER)) as min_id 
            FROM public."Services" 
            WHERE "serviceId" ~ '^-?[0-9]+$' AND CAST("serviceId" AS INTEGER) < 0
          `);
          const minLocalId = maxIdRows[0]?.min_id ?? -1000000;
          serviceId = (minLocalId - 1).toString();
          logger.info(`✅ Using local-only service ID: ${serviceId}`);
        } catch (idError) {
          // Fallback: use a simple negative ID
          logger.warn({ data: idError.message }, '⚠️ Error generating local ID, using fallback:');
          serviceId = '-1000001';
        }
      }
    }
    
    // Convert empty strings to null for database compatibility
    // Handle both labelId (integer) and labelName (string) cases
    let dbLabelId = null;
    let dbLabelName = null;
    
    if (labelId && labelId.trim() !== '') {
      const parsedLabelId = parseInt(labelId);
      if (!isNaN(parsedLabelId)) {
        // Valid integer ID provided
        dbLabelId = parsedLabelId;
        dbLabelName = labelName && labelName.trim() !== '' ? labelName : null;
      } else {
        // String provided instead of ID - look up the ID from the label name
        const { rows: labelRows } = await locationPool.query(
          'SELECT id, name FROM labels WHERE name = $1 AND active = true',
          [labelId.trim()]
        );
        
        if (labelRows.length > 0) {
          dbLabelId = labelRows[0].id;
          dbLabelName = labelRows[0].name;
        } else {
          // Label not found, but still store the name for reference
          dbLabelId = null;
          dbLabelName = labelId.trim();
        }
      }
    } else if (labelName && labelName.trim() !== '') {
      // Only labelName provided - look up the ID
      const { rows: labelRows } = await locationPool.query(
        'SELECT id, name FROM labels WHERE name = $1 AND active = true',
        [labelName.trim()]
      );
      
      if (labelRows.length > 0) {
        dbLabelId = labelRows[0].id;
        dbLabelName = labelRows[0].name;
      } else {
        // Label not found, but still store the name for reference
        dbLabelId = null;
        dbLabelName = labelName.trim();
      }
    }
    
    // Validate serviceId exists for updates
    if (!isNewService && (!serviceId || serviceId === '')) {
      return res.status(400).json({
        error: 'Service ID is required for updating an existing service',
        details: 'Please provide a valid serviceId in the request body'
      });
    }
    
    // Ensure serviceId is a string for database queries
    // For new services, serviceId will be set by TutorCruncher or generated locally
    // For existing services, serviceId must be provided
    if (!isNewService && serviceId) {
      serviceId = String(serviceId).trim();
    }
    
    // Check if service exists using raw SQL (only for updates)
    let existingServices = [];
    if (!isNewService && serviceId) {
      const result = await locationPool.query(
        'SELECT * FROM public."Services" WHERE "serviceId" = $1',
        [serviceId]
      );
      existingServices = result.rows;
    }
    
    if (existingServices.length > 0) {
      // Update existing service
      // Ensure serviceId is defined and is a string
      if (!serviceId) {
        return res.status(400).json({
          error: 'Service ID is required for updating an existing service',
          details: 'serviceId is missing or invalid'
        });
      }
      const serviceIdStr = String(serviceId);
      
      const { rows: updatedServices } = await locationPool.query(
        `UPDATE public."Services"
         SET name = $1, description = $2, location = $3, price = $4, type = $5,
            "colourGroup" = $6, "labelId" = $7, "labelName" = $8, image = $9, "publicVisible" = $10,
            "studentDiscountEnabled" = $11, "studentDiscountPercent" = $12,
            "staffDiscountEnabled" = $13, "staffDiscountPercentMonthly" = $14, "staffDiscountPercentTerm" = $15,
            "ownerDiscountEnabled" = $16, "ownerDiscountPercentMonthly" = $17, "ownerDiscountPercentTerm" = $18,
            "updatedAt" = NOW()
         WHERE "serviceId" = $19
         RETURNING *`,
        [name, description, location, price, type, colourGroup, dbLabelId, dbLabelName,
         imageUrl || existingServices[0].image, publicVisible === 'true' || publicVisible === true,
         (typeof studentDiscountEnabled === 'string' ? studentDiscountEnabled === 'true' : !!studentDiscountEnabled),
         studentDiscountPercent !== undefined && studentDiscountPercent !== '' ? Number(studentDiscountPercent) : null,
         (typeof staffDiscountEnabled === 'string' ? staffDiscountEnabled === 'true' : !!staffDiscountEnabled),
         staffDiscountPercentMonthly !== undefined && staffDiscountPercentMonthly !== '' ? Number(staffDiscountPercentMonthly) : null,
         staffDiscountPercentTerm !== undefined && staffDiscountPercentTerm !== '' ? Number(staffDiscountPercentTerm) : null,
         (typeof ownerDiscountEnabled === 'string' ? ownerDiscountEnabled === 'true' : !!ownerDiscountEnabled),
         ownerDiscountPercentMonthly !== undefined && ownerDiscountPercentMonthly !== '' ? Number(ownerDiscountPercentMonthly) : null,
         ownerDiscountPercentTerm !== undefined && ownerDiscountPercentTerm !== '' ? Number(ownerDiscountPercentTerm) : null,
         serviceIdStr]
      );
      
      // Sync to booking_types table for frontend forms
    try {
      // Check if service already exists in booking_types
      const { rows: existingBookingTypes } = await locationPool.query(
        'SELECT id, label_name FROM booking_types WHERE service_id = $1',
        [serviceIdStr]
      );
      
      if (existingBookingTypes.length > 0) {
        // Get existing label_name to preserve location info
        const existingLabelName = existingBookingTypes[0].label_name;
        const preserveLocationLabel = existingLabelName && 
          (existingLabelName.includes('Eastside') || existingLabelName.includes('Westside') || existingLabelName.includes('Location'));
        
        const finalLabelName = preserveLocationLabel ? existingLabelName : dbLabelName;
        
        // Update existing record
        await locationPool.query(
          `UPDATE booking_types 
           SET name = $1, description = $2, original_price = $3, actual_price = $3, 
               image_url = $4, category = $5, label_id = $6, label_name = $7
           WHERE service_id = $8`,
          [name, description, price, imageUrl || existingServices[0].image, location, dbLabelId, finalLabelName, serviceIdStr]
        );
        logger.info(`✅ Updated service ${serviceIdStr} in booking_types table`);
      } else {
        // Insert new record
        await locationPool.query(
          `INSERT INTO booking_types 
           (name, description, original_price, actual_price, image_url, category, 
            public_internal, lesson_type, dft_charge_type, dft_charge_rate,
            colour, label_id, label_name, service_id)
           VALUES ($1, $2, $3, $3, $4, $5, 'public', 'Club', 'Hourly', $3, $6, $7, $8, $9)`,
          [name, description, price, imageUrl, location, colourGroup || 'dodgerblue', dbLabelId, dbLabelName, serviceIdStr]
        );
        logger.info(`✅ Created service ${serviceId} in booking_types table`);
      }
    } catch (syncError) {
      logger.warn({ data: syncError.message }, `⚠️ Failed to sync service ${serviceId} to booking_types:`);
    }
      
      // Invalidate services cache after update
      const hostname = req.get('host') || req.hostname;
      let dbLocation = 'production';
      if (hostname && (hostname.includes('localhost') || hostname.includes('127.0.0.1') || hostname.includes(':3001') || hostname.includes(':5001'))) {
        dbLocation = 'local';
      } else if (hostname) {
        const subdomain = hostname.split('.')[0];
        switch (subdomain) {
          case 'eastside': dbLocation = 'eastside'; break;
          case 'westside': dbLocation = 'westside'; break;
          case 'join': dbLocation = 'production'; break;
          default: dbLocation = 'production';
        }
      }
      // Clear all services-related caches
      await cache.clearCacheByPrefix('services');
      logger.info(`✅ Cleared all services caches for location: ${dbLocation}`);

      res.status(201).json(updatedServices[0]);
    } else {
      // Create new service
      // First, insert into the raw services table (used by jobs list)
      const {
        dft_charge_type,
        dft_charge_rate,
        dft_contractor_rate,
        sr_premium,
        dft_max_srs,
        dft_contractor_permissions,
        require_sr,
        require_con,
        review_units,
        cap,
        added_fee_per_lesson,
        job_inactivity_time,
        lesson_reports_required,
        auto_invoice,
        sales_codes
      } = req.body;

      // Ensure serviceId is set for new services
      if (!serviceId) {
        return res.status(500).json({
          error: 'Failed to create service',
          details: 'Service ID was not generated. Please try again.'
        });
      }
      const serviceIdStr = String(serviceId);
      
      try {
        await locationPool.query(
          `INSERT INTO services 
           (service_id, name, description, dft_charge_type, dft_charge_rate, dft_contractor_rate,
            sr_premium, status, colour, labels, created_at, updated_at)
           VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, NOW(), NOW())
           ON CONFLICT (service_id) DO UPDATE
           SET name = EXCLUDED.name,
               description = EXCLUDED.description,
               dft_charge_type = EXCLUDED.dft_charge_type,
               dft_charge_rate = EXCLUDED.dft_charge_rate,
               dft_contractor_rate = EXCLUDED.dft_contractor_rate,
               sr_premium = EXCLUDED.sr_premium,
               status = COALESCE(NULLIF(services.status, ''), EXCLUDED.status),
               colour = EXCLUDED.colour,
               labels = CASE
                 WHEN services.labels IS NOT NULL
                   AND services.labels::text != '[]'
                   AND services.labels::text != 'null'
                 THEN services.labels
                 ELSE EXCLUDED.labels
               END,
               updated_at = NOW()`,
          [
            serviceIdStr,
            name,
            description || '',
            dft_charge_type || 'hourly',
            parseFloat(dft_charge_rate) || 0,
            parseFloat(dft_contractor_rate) || 0,
            sr_premium ? parseFloat(sr_premium) : 0,
            'pending', // Default status for new services
            req.body.colour || 'Khaki',
            dbLabelName ? JSON.stringify([{ name: dbLabelName, id: dbLabelId }]) : null
          ]
        );
        logger.info(`✅ Created service ${serviceIdStr} in services table`);
      } catch (servicesError) {
        logger.warn({ data: servicesError.message }, `⚠️ Failed to create service ${serviceId} in services table:`);
        // Continue even if this fails
      }

      // Then insert into the curated Services table
      const { rows: newServices } = await locationPool.query(
        `INSERT INTO public."Services"
         ("serviceId", name, description, location, price, type, "colourGroup", "labelId", "labelName", "publicVisible", image, "studentDiscountEnabled", "studentDiscountPercent", "staffDiscountEnabled", "staffDiscountPercentMonthly", "staffDiscountPercentTerm", "ownerDiscountEnabled", "ownerDiscountPercentMonthly", "ownerDiscountPercentTerm", "createdAt", "updatedAt")
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17, $18, $19, NOW(), NOW())
         RETURNING *`,
        [serviceIdStr, name, description, location, price, type, colourGroup, dbLabelId, dbLabelName, publicVisible === 'true' || publicVisible === true, imageUrl,
         (typeof studentDiscountEnabled === 'string' ? studentDiscountEnabled === 'true' : !!studentDiscountEnabled),
         studentDiscountPercent !== undefined && studentDiscountPercent !== '' ? Number(studentDiscountPercent) : null,
         (typeof staffDiscountEnabled === 'string' ? staffDiscountEnabled === 'true' : !!staffDiscountEnabled),
         staffDiscountPercentMonthly !== undefined && staffDiscountPercentMonthly !== '' ? Number(staffDiscountPercentMonthly) : null,
         staffDiscountPercentTerm !== undefined && staffDiscountPercentTerm !== '' ? Number(staffDiscountPercentTerm) : null,
         (typeof ownerDiscountEnabled === 'string' ? ownerDiscountEnabled === 'true' : !!ownerDiscountEnabled),
         ownerDiscountPercentMonthly !== undefined && ownerDiscountPercentMonthly !== '' ? Number(ownerDiscountPercentMonthly) : null,
         ownerDiscountPercentTerm !== undefined && ownerDiscountPercentTerm !== '' ? Number(ownerDiscountPercentTerm) : null]
      );
      
      // Sync to booking_types table for frontend forms
      try {
        await locationPool.query(
          `INSERT INTO booking_types 
           (name, description, original_price, actual_price, image_url, category, 
            public_internal, lesson_type, dft_charge_type, dft_charge_rate, 
            colour, label_id, label_name, service_id)
           VALUES ($1, $2, $3, $3, $4, $5, 'public', 'Club', 'Hourly', $3, $6, $7, $8, $9)`,
          [name, description, price, imageUrl, location, colourGroup || 'dodgerblue', dbLabelId, dbLabelName, serviceIdStr]
        );
        logger.info(`✅ Created and synced service ${serviceIdStr} to booking_types table`);
      } catch (syncError) {
        logger.warn({ data: syncError.message }, `⚠️ Failed to sync new service ${serviceId} to booking_types:`);
      }
      
      // Invalidate services cache after create
      const hostname = req.get('host') || req.hostname;
      let dbLocation = 'production';
      if (hostname && (hostname.includes('localhost') || hostname.includes('127.0.0.1') || hostname.includes(':3001') || hostname.includes(':5001'))) {
        dbLocation = 'local';
      } else if (hostname) {
        const subdomain = hostname.split('.')[0];
        switch (subdomain) {
          case 'eastside': dbLocation = 'eastside'; break;
          case 'westside': dbLocation = 'westside'; break;
          case 'join': dbLocation = 'production'; break;
          default: dbLocation = 'production';
        }
      }
      // Clear all services-related caches
      await cache.clearCacheByPrefix('services');
      logger.info(`✅ Cleared all services caches for location: ${dbLocation}`);

      // Return service in format expected by frontend
      res.status(201).json({
        ...newServices[0],
        service_id: newServices[0].serviceId,
        id: newServices[0].serviceId,
        service: {
          id: newServices[0].serviceId,
          name: newServices[0].name
        }
      });
    }
    
  } catch (error) {
    logger.error({ err: error }, 'Error adding/updating service:');
    res.status(500).json({
      error: 'Internal server error',
      details: error.message
    });
  }
}));
router.put('/:serviceId/update-counts', asyncHandler(async (req, res) => {
  const {
    serviceId
  } = req.params;
  try {
    // Use location-specific database connection
    const locationPool = req.locationPool || pool;
    
    // Ensure proper URL construction - remove trailing slash from base and add proper path
    const baseUrl = TUTORCRUNCHER_API_BASE.endsWith('/') 
      ? TUTORCRUNCHER_API_BASE.slice(0, -1) 
      : TUTORCRUNCHER_API_BASE;
    const url = `${baseUrl}/services/${serviceId}`;
    
    const response = await axios.get(url, {
      headers: {
        Authorization: `Token ${TUTORCRUNCHER_API_TOKEN}`
      },
      timeout: 30000 // 30 second timeout
    });
    const {
      dft_max_srs = 0,
      rcrs = []
    } = response.data;
    
    // Use raw query with location-specific pool instead of Sequelize
    const updateResult = await locationPool.query(
      `UPDATE "Services" 
       SET "dft_max_srs" = $1, 
           rcrs = $2
       WHERE "serviceId" = $3
       RETURNING *`,
      [
        dft_max_srs !== null ? dft_max_srs : 0,
        Array.isArray(rcrs) ? rcrs.length : 0,
        serviceId.toString()
      ]
    );
    
    if (updateResult.rows.length > 0) {
      res.json({
        message: 'Service counts updated successfully',
        service: updateResult.rows[0]
      });
    } else {
      res.status(404).json({
        message: 'Service not found'
      });
    }
  } catch (error) {
    logger.error({ err: error }, 'Error fetching or updating service counts:');
    logger.error({ data: serviceId }, 'Service ID:');
    logger.error({ data: error.response?.status }, 'Error response status:');
    logger.error({ data: error.response?.data }, 'Error response data:');
    logger.error({ error: error.message }, 'Error message:');
    
    // Provide more helpful error messages
    let errorMessage = 'Failed to update service counts';
    let errorDetails = error.message;
    
    if (error.response) {
      // API returned an error response
      errorDetails = error.response.data || `HTTP ${error.response.status}`;
      if (error.response.status === 401) {
        errorMessage = 'Authentication failed - check API token';
      } else if (error.response.status === 404) {
        errorMessage = 'Service not found in TutorCruncher';
      } else if (error.response.status === 403) {
        errorMessage = 'Access forbidden - check API permissions';
      }
    } else if (error.request) {
      // Request was made but no response received
      errorMessage = 'No response from TutorCruncher API';
      errorDetails = 'Network error or timeout';
    }
    
    res.status(500).json({
      error: errorMessage,
      details: errorDetails,
      serviceId: serviceId
    });
  }
}));

// DELETE route - Must be defined early and before GET routes with parameters
// Route order matters: specific routes (like /appointments/count) should come before parameterized routes
const { parsePagination, createPaginatedResponse } = require('../utils/pagination');

router.delete('/:serviceId', auth, asyncHandler(async (req, res) => {
  const {
    serviceId
  } = req.params;
  try {
    // Use location-specific database connection
    const locationPool = getLocationPool(req);
    
    if (!locationPool) {
      return res.status(500).json({ error: 'Database pool not available' });
    }
    
    const hostname = req.get('host') || req.hostname;
    logger.info(`🗑️ DELETE /api/services/${serviceId} - Attempting to delete service`);
    logger.info(`   Location: ${hostname}, ServiceId type: ${typeof serviceId}, Value: ${serviceId}`);
    
    // Check if service exists - try both string and number formats
    const serviceIdStr = serviceId.toString();
    // Try to parse as number for comparison
    const serviceIdNum = isNaN(serviceIdStr) ? null : parseInt(serviceIdStr, 10);
    
    let query = 'SELECT * FROM public."Services" WHERE "serviceId" = $1';
    let params = [serviceIdStr];
    
    // If it's a valid number, also try numeric comparison
    if (serviceIdNum !== null) {
      query = 'SELECT * FROM public."Services" WHERE "serviceId" = $1 OR "serviceId" = $2';
      params = [serviceIdStr, serviceIdNum];
    }
    
    const { rows: existingServices } = await locationPool.query(query, params);
    
    if (existingServices.length === 0) {
      // Check if service exists in raw services table (synced from TutorCruncher but not yet curated)
      // Try both numeric and string comparisons with proper type casting
      // Always cast service_id to text for comparison to avoid type mismatch errors
      let rawServiceQuery = 'SELECT service_id, name FROM services WHERE service_id::text = $1';
      let rawParams = [serviceIdStr];
      if (serviceIdNum !== null) {
        // Compare as text for both cases - cast the integer parameter to text
        rawServiceQuery = 'SELECT service_id, name FROM services WHERE service_id::text = $1 OR service_id::text = $2::text';
        rawParams = [serviceIdStr, serviceIdNum.toString()];
      }
      const { rows: rawServices } = await locationPool.query(rawServiceQuery, rawParams);
      
      if (rawServices.length > 0) {
        // Service exists in raw table but not in curated table
        // Allow deletion from raw table - user can delete uncurated services
        const serviceName = rawServices[0].name || 'Unknown';
        logger.info(`⚠️ Service ${serviceId} exists in raw services table but not in curated Services table`);
        logger.info(`   Service name: ${serviceName}`);
        logger.info('   Deleting from raw services table...');
        
        // Delete from raw services table
        try {
          // First check if there are appointments referencing this service
          // Always cast service_id to text for comparison to avoid type mismatch
          let appointmentCheckQuery = 'SELECT COUNT(*) as count FROM appointments WHERE service_id::text = $1';
          let appointmentCheckParams = [serviceIdStr];
          if (serviceIdNum !== null) {
            // Check both string and numeric formats
            appointmentCheckQuery = 'SELECT COUNT(*) as count FROM appointments WHERE service_id::text = $1 OR service_id = $2';
            appointmentCheckParams = [serviceIdStr, serviceIdNum];
          }
          const { rows: appointmentCheck } = await locationPool.query(appointmentCheckQuery, appointmentCheckParams);
          const appointmentCount = parseInt(appointmentCheck[0]?.count || 0);
          
          if (appointmentCount > 0) {
            // There are appointments - need to delete related records first, then appointments
            try {
              // First, get the appointment IDs to delete related records
              let getAppointmentsQuery = 'SELECT appointment_id FROM appointments WHERE service_id::text = $1';
              let getAppointmentsParams = [serviceIdStr];
              if (serviceIdNum !== null) {
                getAppointmentsQuery = 'SELECT appointment_id FROM appointments WHERE service_id::text = $1 OR service_id = $2';
                getAppointmentsParams = [serviceIdStr, serviceIdNum];
              }
              const { rows: appointments } = await locationPool.query(getAppointmentsQuery, getAppointmentsParams);
              
              // Delete related records for each appointment
              for (const appointment of appointments) {
                const appointmentId = appointment.appointment_id;
                try {
                  // Delete appointment_recipients
                  await locationPool.query(
                    'DELETE FROM appointment_recipients WHERE appointment_id = $1',
                    [appointmentId]
                  );
                } catch (recipientError) {
                  logger.info({ data: recipientError.message }, `   Note: Could not delete appointment_recipients for appointment ${appointmentId}:`);
                }
                
                try {
                  // Delete appointment_contractors
                  await locationPool.query(
                    'DELETE FROM appointment_contractors WHERE appointment_id = $1',
                    [appointmentId]
                  );
                } catch (contractorError) {
                  logger.info({ data: contractorError.message }, `   Note: Could not delete appointment_contractors for appointment ${appointmentId}:`);
                }
              }
              
              // Now delete the appointments themselves
              let deleteAppointmentsQuery = 'DELETE FROM appointments WHERE service_id::text = $1';
              let deleteAppointmentsParams = [serviceIdStr];
              if (serviceIdNum !== null) {
                deleteAppointmentsQuery = 'DELETE FROM appointments WHERE service_id::text = $1 OR service_id = $2';
                deleteAppointmentsParams = [serviceIdStr, serviceIdNum];
              }
              await locationPool.query(deleteAppointmentsQuery, deleteAppointmentsParams);
              logger.info(`   Deleted ${appointmentCount} appointment(s) and related records associated with this service`);
            } catch (apptDeleteError) {
              // If we can't delete appointments, return a helpful error
              logger.error({ data: apptDeleteError }, 'Error deleting appointments:');
              return res.status(400).json({
                error: 'Cannot delete service with appointments',
                message: `Service "${serviceName}" (ID: ${serviceId}) has ${appointmentCount} appointment(s) associated with it. Failed to delete appointments: ${apptDeleteError.message}. Please delete or reassign the appointments first, or delete the service from TutorCruncher.`,
                serviceId: serviceIdStr,
                serviceName: serviceName,
                appointmentCount: appointmentCount
              });
            }
          }
          
          const deleteRawQuery = 'DELETE FROM services WHERE service_id::text = $1 OR service_id = $2 RETURNING service_id, name';
          const deleteRawParams = serviceIdNum !== null 
            ? [serviceIdStr, serviceIdNum] 
            : [serviceIdStr];
          const deleteRawResult = await locationPool.query(deleteRawQuery, deleteRawParams);
          
          if (deleteRawResult.rows.length > 0) {
            // Also delete from booking_types if it exists
            try {
              await locationPool.query(
                'DELETE FROM booking_types WHERE service_id = $1 OR service_id::text = $1 RETURNING id',
                [serviceIdStr]
              );
            } catch (bookingTypeError) {
              logger.info({ data: bookingTypeError.message }, 'Note: Could not delete from booking_types:');
            }
            
            // Invalidate cache
            const hostname = req.get('host') || req.hostname;
            let dbLocation = 'production';
            if (hostname && (hostname.includes('localhost') || hostname.includes('127.0.0.1') || hostname.includes(':3001') || hostname.includes(':5001'))) {
              dbLocation = 'local';
            } else if (hostname) {
              const subdomain = hostname.split('.')[0];
              switch (subdomain) {
                case 'eastside': dbLocation = 'eastside'; break;
                case 'westside': dbLocation = 'westside'; break;
                case 'join': dbLocation = 'production'; break;
                default: dbLocation = 'production';
              }
            }
            // Clear all services-related caches
            await cache.clearCacheByPrefix('services');
            logger.info(`✅ Cleared all services caches for location: ${dbLocation}`);

            logger.info(`✅ Successfully deleted raw service ${serviceIdStr} (${serviceName})`);
            return res.json({
              message: 'Raw service deleted successfully. Note: This service may be re-synced from TutorCruncher if it still exists there.',
              serviceId: serviceIdStr,
              serviceName: serviceName,
              wasRawService: true
            });
          }
        } catch (deleteError) {
          logger.error({ data: deleteError }, '❌ Error deleting raw service:');
          return res.status(500).json({
            error: 'Error deleting raw service',
            details: deleteError.message,
            serviceId: serviceIdStr
          });
        }
      }
      
      // Service doesn't exist in either table
      const { rows: altCheck } = await locationPool.query(
        'SELECT "serviceId" FROM public."Services" LIMIT 5'
      );
      const totalCount = await locationPool.query('SELECT COUNT(*) as count FROM public."Services"');
      logger.info(`❌ Service ${serviceId} not found in database`);
      logger.info(`   Location: ${hostname}`);
      logger.info(`   Query used: ${query}`);
      logger.info(`   Params: ${JSON.stringify(params)}`);
      logger.info(`   Total services in DB: ${totalCount.rows[0]?.count || 0}`);
      logger.info({ data: altCheck.map(r => r.serviceId) }, '   Sample serviceIds in DB:');
      return res.status(404).json({
        error: 'Service not found',
        message: `Service with ID ${serviceId} was not found in the database. It may have already been deleted or may not exist in this location.`,
        serviceId: serviceIdStr
      });
    }
    
    const serviceName = existingServices[0].name || 'Unknown';
    logger.info(`   Found service: ${serviceName} (${serviceIdStr})`);
    
    // Delete from Services table (curated services)
    let deleteQuery = 'DELETE FROM public."Services" WHERE "serviceId" = $1 RETURNING "serviceId"';
    let deleteParams = [serviceIdStr];
    
    if (serviceIdNum !== null) {
      deleteQuery = 'DELETE FROM public."Services" WHERE "serviceId" = $1 OR "serviceId" = $2 RETURNING "serviceId"';
      deleteParams = [serviceIdStr, serviceIdNum];
    }
    
    const deleteResult = await locationPool.query(deleteQuery, deleteParams);
    
    if (deleteResult.rows.length === 0) {
      logger.info(`⚠️ Delete query returned 0 rows for serviceId: ${serviceIdStr}`);
    }
    
    // Also delete from booking_types table if it exists
    try {
      const bookingTypeResult = await locationPool.query(
        'DELETE FROM booking_types WHERE service_id = $1 OR service_id::text = $1 RETURNING id',
        [serviceIdStr]
      );
      if (bookingTypeResult.rows.length > 0) {
        logger.info(`   Deleted ${bookingTypeResult.rows.length} booking type(s)`);
      }
    } catch (bookingTypeError) {
      // Ignore if booking_types table doesn't exist or service_id doesn't exist
      logger.info({ data: bookingTypeError.message }, 'Note: Could not delete from booking_types:');
    }
    
    logger.info(`✅ Successfully deleted service ${serviceIdStr} (${serviceName})`);
    res.json({
      message: 'Service and associated booking types deleted successfully',
      serviceId: serviceIdStr,
      serviceName: serviceName
    });
  } catch (error) {
    const errorDetails = {
      message: error.message,
      stack: error.stack,
      serviceId: serviceId,
      serviceIdType: typeof serviceId
    };
    logger.error({ data: JSON.stringify(errorDetails, null, 2) }, '❌ Error deleting service:');
    res.status(500).json({
      error: 'Error deleting service',
      details: error.message,
      serviceId: serviceId.toString()
    });
  }
}));

// Archive service endpoint
router.post('/:serviceId/archive', auth, asyncHandler(async (req, res) => {
  const { serviceId } = req.params;
  try {
    // Use location-specific database connection
    const locationPool = getLocationPool(req);
    
    if (!locationPool) {
      return res.status(500).json({ error: 'Database pool not available' });
    }
    
    const serviceIdStr = serviceId.toString();
    const serviceIdNum = isNaN(serviceIdStr) ? null : parseInt(serviceIdStr, 10);
    
    // Check if service exists in curated Services table (including archived ones for archiving)
    let query = 'SELECT * FROM public."Services" WHERE "serviceId" = $1';
    let params = [serviceIdStr];
    
    if (serviceIdNum !== null) {
      query = 'SELECT * FROM public."Services" WHERE "serviceId" = $1 OR "serviceId" = $2';
      params = [serviceIdStr, serviceIdNum];
    }
    
    const { rows: existingServices } = await locationPool.query(query, params);
    
    if (existingServices.length === 0) {
      // Check if service exists in raw services table
      let rawServiceQuery = 'SELECT service_id, name FROM services WHERE service_id::text = $1';
      let rawParams = [serviceIdStr];
      if (serviceIdNum !== null) {
        rawServiceQuery = 'SELECT service_id, name FROM services WHERE service_id::text = $1 OR service_id::text = $2::text';
        rawParams = [serviceIdStr, serviceIdNum.toString()];
      }
      const { rows: rawServices } = await locationPool.query(rawServiceQuery, rawParams);
      
      if (rawServices.length === 0) {
        return res.status(404).json({
          error: 'Service not found',
          message: `Service with ID ${serviceId} was not found in the database.`,
          serviceId: serviceIdStr
        });
      }
      
      // Archive raw service
      const serviceName = rawServices[0].name || 'Unknown';
      
      // Check if archived column exists, if not, add it first (cached check)
      const hasArchivedRaw = await columnExists(locationPool, 'services', 'archived');
      if (!hasArchivedRaw) {
        try {
          await locationPool.query(`ALTER TABLE services ADD COLUMN IF NOT EXISTS archived BOOLEAN DEFAULT false`);
          await locationPool.query(`ALTER TABLE services ADD COLUMN IF NOT EXISTS archived_at TIMESTAMP WITH TIME ZONE`);
        } catch (alterError) {
          logger.info({ data: alterError.message }, 'Note: Could not add archived column (may already exist):');
        }
      }

      const archiveQuery = 'UPDATE services SET archived = true, archived_at = NOW() WHERE service_id::text = $1 OR service_id = $2';
      const archiveParams = serviceIdNum !== null ? [serviceIdStr, serviceIdNum] : [serviceIdStr];
      await locationPool.query(archiveQuery, archiveParams);
      
      // Invalidate cache
      const hostname = req.get('host') || req.hostname;
      let dbLocation = 'production';
      if (hostname && (hostname.includes('localhost') || hostname.includes('127.0.0.1') || hostname.includes(':3001') || hostname.includes(':5001'))) {
        dbLocation = 'local';
      } else if (hostname) {
        const subdomain = hostname.split('.')[0];
        switch (subdomain) {
          case 'eastside': dbLocation = 'eastside'; break;
          case 'westside': dbLocation = 'westside'; break;
          case 'join': dbLocation = 'production'; break;
          default: dbLocation = 'production';
        }
      }
      // Clear all services-related caches
      await cache.clearCacheByPrefix('services');

      return res.json({
        message: 'Raw service archived successfully',
        serviceId: serviceIdStr,
        serviceName: serviceName,
        wasRawService: true
      });
    }
    
    // Archive curated service
    const serviceName = existingServices[0].name || 'Unknown';
    
    // Check if archived column exists, if not, add it first (cached check)
    const hasArchivedCurated = await columnExists(locationPool, 'Services', 'archived');
    if (!hasArchivedCurated) {
      try {
        await locationPool.query(`ALTER TABLE public."Services" ADD COLUMN IF NOT EXISTS "archived" BOOLEAN DEFAULT false`);
        await locationPool.query(`ALTER TABLE public."Services" ADD COLUMN IF NOT EXISTS "archivedAt" TIMESTAMP WITH TIME ZONE`);
      } catch (alterError) {
        logger.info({ data: alterError.message }, 'Note: Could not add archived column (may already exist):');
      }
    }

    const archiveQuery = 'UPDATE public."Services" SET archived = true, "archivedAt" = NOW() WHERE "serviceId" = $1';
    const archiveParams = [serviceIdStr];
    
    if (serviceIdNum !== null) {
      const archiveQueryWithNum = 'UPDATE public."Services" SET archived = true, "archivedAt" = NOW() WHERE "serviceId" = $1 OR "serviceId" = $2';
      await locationPool.query(archiveQueryWithNum, [serviceIdStr, serviceIdNum]);
    } else {
      await locationPool.query(archiveQuery, archiveParams);
    }
    
    // Also archive in raw services table if it exists
    try {
      const archiveRawQuery = 'UPDATE services SET archived = true, archived_at = NOW() WHERE service_id::text = $1';
      await locationPool.query(archiveRawQuery, [serviceIdStr]);
    } catch (rawError) {
      logger.info({ data: rawError.message }, 'Note: Could not archive in raw services table:');
    }
    
    // Invalidate cache
    const hostname = req.get('host') || req.hostname;
    let dbLocation = 'production';
    if (hostname && (hostname.includes('localhost') || hostname.includes('127.0.0.1') || hostname.includes(':3001') || hostname.includes(':5001'))) {
      dbLocation = 'local';
    } else if (hostname) {
      const subdomain = hostname.split('.')[0];
      switch (subdomain) {
        case 'eastside': dbLocation = 'eastside'; break;
        case 'westside': dbLocation = 'westside'; break;
        case 'join': dbLocation = 'production'; break;
        default: dbLocation = 'production';
      }
    }
    // Clear all services-related caches
    await cache.clearCacheByPrefix('services');

    res.json({
      message: 'Service archived successfully',
      serviceId: serviceIdStr,
      serviceName: serviceName
    });
  } catch (error) {
    logger.error({ err: error }, '❌ Error archiving service:');
    res.status(500).json({
      error: 'Error archiving service',
      details: error.message,
      serviceId: serviceId.toString()
    });
  }
}));

// Unarchive service endpoint
router.post('/:serviceId/unarchive', auth, asyncHandler(async (req, res) => {
  const { serviceId } = req.params;
  try {
    const locationPool = getLocationPool(req);
    
    if (!locationPool) {
      return res.status(500).json({ error: 'Database pool not available' });
    }
    
    const serviceIdStr = serviceId.toString();
    const serviceIdNum = isNaN(serviceIdStr) ? null : parseInt(serviceIdStr, 10);
    
    // Check if service exists in curated Services table
    let query = 'SELECT * FROM public."Services" WHERE "serviceId" = $1';
    let params = [serviceIdStr];
    
    if (serviceIdNum !== null) {
      query = 'SELECT * FROM public."Services" WHERE "serviceId" = $1 OR "serviceId" = $2';
      params = [serviceIdStr, serviceIdNum];
    }
    
    const { rows: existingServices } = await locationPool.query(query, params);
    
    let serviceName = 'Unknown';
    let updatedCurated = false;
    let updatedRaw = false;
    
    if (existingServices.length > 0) {
      serviceName = existingServices[0].name || serviceName;
      // Unarchive in curated table
      const unarchiveQuery = 'UPDATE public."Services" SET "archived" = FALSE, "archivedAt" = NULL WHERE "serviceId" = $1';
      const unarchiveParams = [serviceIdStr];
      
      if (serviceIdNum !== null) {
        const unarchiveQueryWithNum = 'UPDATE public."Services" SET "archived" = FALSE, "archivedAt" = NULL WHERE "serviceId" = $1 OR "serviceId" = $2';
        await locationPool.query(unarchiveQueryWithNum, [serviceIdStr, serviceIdNum]);
      } else {
        await locationPool.query(unarchiveQuery, unarchiveParams);
      }
      updatedCurated = true;
      logger.info(`✅ Unarchived service ${serviceIdStr} (${serviceName}) from curated Services table`);
    }
    
    // Also unarchive in raw services table if it exists
    try {
      let rawServiceQuery = 'SELECT service_id, name FROM services WHERE service_id::text = $1';
      let rawParams = [serviceIdStr];
      if (serviceIdNum !== null) {
        rawServiceQuery = 'SELECT service_id, name FROM services WHERE service_id::text = $1 OR service_id = $2';
        rawParams = [serviceIdStr, serviceIdNum];
      }
      const { rows: existingRaw } = await locationPool.query(rawServiceQuery, rawParams);
      
      if (existingRaw.length > 0) {
        serviceName = existingRaw[0].name || serviceName;
        // Update query should also handle both string and numeric IDs
        let rawUpdateQuery = 'UPDATE services SET archived = FALSE, archived_at = NULL WHERE service_id::text = $1';
        let rawUpdateParams = [serviceIdStr];
        if (serviceIdNum !== null) {
          rawUpdateQuery = 'UPDATE services SET archived = FALSE, archived_at = NULL WHERE service_id::text = $1 OR service_id = $2';
          rawUpdateParams = [serviceIdStr, serviceIdNum];
        }
        await locationPool.query(rawUpdateQuery, rawUpdateParams);
        updatedRaw = true;
        logger.info(`✅ Unarchived service ${serviceIdStr} (${serviceName}) from raw services table`);
      }
    } catch (rawError) {
      logger.info({ data: rawError.message }, 'Note: Could not unarchive in raw services table:');
    }
    
    if (!updatedCurated && !updatedRaw) {
      return res.status(404).json({
        error: 'Service not found',
        message: `Service with ID ${serviceId} was not found in any service table.`,
        serviceId: serviceIdStr
      });
    }
    
    // Invalidate cache
    const hostname = req.get('host') || req.hostname;
    let dbLocation = 'production';
    if (hostname && (hostname.includes('localhost') || hostname.includes('127.0.0.1') || hostname.includes(':3001') || hostname.includes(':5001'))) {
      dbLocation = 'local';
    } else if (hostname) {
      const subdomain = hostname.split('.')[0];
      switch (subdomain) {
        case 'eastside': dbLocation = 'eastside'; break;
        case 'westside': dbLocation = 'westside'; break;
        case 'join': dbLocation = 'production'; break;
        default: dbLocation = 'production';
      }
    }
    // Clear all services-related caches
    await cache.clearCacheByPrefix('services');
    logger.info(`✅ Cleared all services caches for location: ${dbLocation}`);

    res.json({
      message: 'Service unarchived successfully',
      serviceId: serviceIdStr,
      serviceName: serviceName
    });
  } catch (error) {
    logger.error({ err: error }, '❌ Error unarchiving service:');
    res.status(500).json({
      error: 'Error unarchiving service',
      details: error.message,
      serviceId: serviceId.toString()
    });
  }
}));

// Resync a single service from TutorCruncher (useful when webhooks fail)
router.post('/:serviceId/resync', auth, asyncHandler(async (req, res) => {
  const { serviceId } = req.params;
  const locationPool = getLocationPool(req);

  if (!locationPool) {
    return res.status(500).json({ error: 'Database pool not available' });
  }

  // Determine location for cache invalidation
  const hostname = req.get('host') || req.hostname;
  let dbLocation = 'production';
  if (hostname && (hostname.includes('localhost') || hostname.includes('127.0.0.1') || hostname.includes(':3001') || hostname.includes(':5001'))) {
    dbLocation = 'local';
  } else if (hostname) {
    const subdomain = hostname.split('.')[0];
    switch (subdomain) {
      case 'eastside': dbLocation = 'eastside'; break;
      case 'westside': dbLocation = 'westside'; break;
      case 'join': dbLocation = 'production'; break;
      default: dbLocation = 'production';
    }
  }

  try {
    logger.info(`🔄 Resyncing service ${serviceId} from TutorCruncher for ${dbLocation}...`);

    // Fetch full service details from TutorCruncher
    const { data: detail } = await rateLimitRetry(() => limitedGet(`/services/${serviceId}/`));

    if (!detail || !detail.id) {
      return res.status(404).json({ error: `Service ${serviceId} not found in TutorCruncher` });
    }

    // Extract labels as array of objects
    const labels = (detail.labels || []).map((l) => ({ id: l.id, name: l.name }));
    const labelNames = labels.map(l => l.name);
    const srPremium = detail.sr_premium != null ? parseFloat(detail.sr_premium) : null;
    const locationName = detail?.dft_location?.name || null;

    // Update the services table (lowercase - raw synced data)
    await locationPool.query(`
      INSERT INTO services
        (service_id, name, description, dft_charge_type, dft_charge_rate, dft_contractor_rate, status, labels, sr_premium, location, created_at, updated_at)
      VALUES
        ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, NOW(), NOW())
      ON CONFLICT (service_id) DO UPDATE SET
        name = EXCLUDED.name,
        description = EXCLUDED.description,
        dft_charge_type = EXCLUDED.dft_charge_type,
        dft_charge_rate = EXCLUDED.dft_charge_rate,
        dft_contractor_rate = EXCLUDED.dft_contractor_rate,
        status = EXCLUDED.status,
        labels = EXCLUDED.labels,
        sr_premium = EXCLUDED.sr_premium,
        location = COALESCE(EXCLUDED.location, services.location),
        updated_at = NOW();
    `, [
      detail.id,
      detail.name,
      detail.description || null,
      detail.dft_charge_type,
      parseFloat(detail.dft_charge_rate) || 0,
      parseFloat(detail.dft_contractor_rate) || 0,
      detail.status,
      JSON.stringify(labelNames),
      srPremium,
      locationName
    ]);

    logger.info({ serviceId, labels: labelNames }, '✅ Updated services table with labels');

    // Clear all services-related caches so the service shows up immediately
    await cache.clearCacheByPrefix('services');
    logger.info(`✅ Cleared all services caches for location: ${dbLocation}`);

    // Check if service has "Sync to Website" label
    const hasSyncToWebsite = labelNames.some(name =>
      name.toLowerCase() === 'sync to website'
    );

    res.json({
      message: 'Service resynced successfully',
      serviceId: String(detail.id),
      name: detail.name,
      labels: labelNames,
      hasSyncToWebsite,
      location: dbLocation
    });
  } catch (error) {
    logger.error({ err: error }, `❌ Error resyncing service ${serviceId}:`);
    res.status(500).json({
      error: 'Failed to resync service from TutorCruncher',
      details: error.message,
      serviceId
    });
  }
}));

// Helper function to ensure archived columns exist
async function ensureArchivedColumnsExist(locationPool) {
  try {
    // Check if columns exist first to avoid unnecessary ALTER TABLE statements (cached)
    const hasCuratedArchived = await columnExists(locationPool, 'Services', 'archived');

    if (!hasCuratedArchived) {
      try {
        await locationPool.query(`
          ALTER TABLE public."Services" ADD COLUMN IF NOT EXISTS "archived" BOOLEAN DEFAULT false;
          ALTER TABLE public."Services" ADD COLUMN IF NOT EXISTS "archivedAt" TIMESTAMP WITH TIME ZONE;
        `);
        logger.info('Added archived columns to curated Services table');
      } catch (alterError) {
        logger.error({ data: alterError.message }, 'Could not add archived columns to curated Services table:');
        throw alterError; // Re-throw to indicate failure
      }
    }

    // Check if columns exist in raw services table (cached)
    const hasRawArchived = await columnExists(locationPool, 'services', 'archived');

    if (!hasRawArchived) {
      try {
        await locationPool.query(`
          ALTER TABLE services ADD COLUMN IF NOT EXISTS archived BOOLEAN DEFAULT false;
          ALTER TABLE services ADD COLUMN IF NOT EXISTS archived_at TIMESTAMP WITH TIME ZONE;
        `);
        logger.info('Added archived columns to raw services table');
      } catch (alterError) {
        logger.error({ data: alterError.message }, 'Could not add archived columns to raw services table:');
        // Don't throw for raw table - it's optional
      }
    }
  } catch (alterError) {
    logger.error({ data: alterError }, '❌ Error ensuring archived columns exist:');
    throw alterError; // Re-throw so caller knows it failed
  }
}

// Auto-archive services with no future appointments (2+ weeks out)
// Excludes services with "sync to website" label to prevent archiving newly synced booking forms
router.post('/auto-archive', auth, asyncHandler(async (req, res) => {
  const archivedServices = [];
  
  try {
    const locationPool = getLocationPool(req);
    
    if (!locationPool) {
      logger.warn('⚠️ Database pool not available for auto-archive');
      return res.status(200).json({ 
        message: 'Auto-archive skipped: Database pool not available',
        archivedCount: 0,
        archivedServices: [],
        cutoffDate: null
      });
    }
    
    // Ensure archived columns exist - don't fail if this errors
    try {
      await ensureArchivedColumnsExist(locationPool);
    } catch (columnError) {
      logger.warn({ data: columnError.message }, '⚠️ Could not ensure archived columns exist (columns may already exist):');
      // Continue anyway - columns might already exist
    }
    
    // Calculate the cutoff date (14 days from now)
    const cutoffDate = new Date();
    cutoffDate.setDate(cutoffDate.getDate() + 14);
    const cutoffDateStr = cutoffDate.toISOString().split('T')[0];
    
    // Find services that:
    // 1. Are not already archived
    // 2. Have no future appointments scheduled more than 14 days out
    // We check both curated "Services" table and raw "services" table
    
    // First, check curated Services table
    let curatedServicesToArchive = [];
    try {
      const curatedServicesQuery = `
        SELECT DISTINCT s."serviceId", s.name
        FROM public."Services" s
        WHERE COALESCE(s."archived", false) = false
          -- Exclude services with "sync to website" label in curated labelName (case-insensitive)
          AND COALESCE(LOWER(s."labelName"), '') NOT LIKE '%sync to website%'
          -- Also exclude services with "sync to website" label in raw services.labels JSONB
          AND NOT EXISTS (
            SELECT 1
            FROM services rs
            WHERE rs.service_id::text = s."serviceId"::text
              AND rs.labels IS NOT NULL
              AND EXISTS (
                SELECT 1
                FROM jsonb_array_elements_text(rs.labels) AS label
                WHERE LOWER(label) LIKE '%sync to website%'
              )
          )
          AND NOT EXISTS (
            SELECT 1
            FROM appointments a
            WHERE (a.service_id::text = s."serviceId"::text OR a.service_id = s."serviceId"::integer)
              AND a.status = 'planned'
              AND a.is_deleted IS NOT TRUE
              AND a.start > CURRENT_DATE + INTERVAL '14 days'
          )
      `;
      
      const result = await locationPool.query(curatedServicesQuery);
      curatedServicesToArchive = result.rows || [];
    
      for (const service of curatedServicesToArchive) {
        try {
          const serviceId = service.serviceId.toString();
          const serviceName = service.name || 'Unknown';
          
          // Archive in curated table
          await locationPool.query(
            `UPDATE public."Services" SET "archived" = TRUE, "archivedAt" = NOW() WHERE "serviceId" = $1`,
            [serviceId]
          );
          
          // Also archive in raw services table if it exists
          try {
            await locationPool.query(
              `UPDATE services SET archived = TRUE, archived_at = NOW() WHERE service_id::text = $1`,
              [serviceId]
            );
          } catch (rawError) {
            logger.info({ data: rawError.message }, `Note: Could not archive in raw services table for ${serviceId}:`);
          }
          
          archivedServices.push({
            serviceId: serviceId,
            serviceName: serviceName,
            source: 'curated'
          });
          
          logger.info(`✅ Auto-archived service ${serviceId} (${serviceName}) - no future appointments in next 14+ days`);
        } catch (serviceError) {
          logger.error({ data: serviceError.message }, `❌ Error archiving curated service ${service.serviceId}:`);
          // Continue with next service
        }
      }
    } catch (curatedError) {
      logger.error({ data: curatedError.message }, '❌ Error querying curated services:');
      // Continue with raw services query
    }
    
    // Also check raw services table for services not in curated table
    try {
      const rawServicesQuery = `
        SELECT DISTINCT s.service_id, s.name
        FROM services s
        WHERE COALESCE(s.archived, false) = false
          -- Exclude services with "sync to website" label in labels JSONB array (case-insensitive)
          AND NOT (
            s.labels IS NOT NULL 
            AND EXISTS (
              SELECT 1 
              FROM jsonb_array_elements_text(s.labels) AS label
              WHERE LOWER(label) LIKE '%sync to website%'
            )
          )
          AND NOT EXISTS (
            SELECT 1
            FROM public."Services" cs
            WHERE cs."serviceId"::text = s.service_id::text
          )
          AND NOT EXISTS (
            SELECT 1
            FROM appointments a
            WHERE a.service_id::text = s.service_id::text
              AND a.status = 'planned'
              AND a.is_deleted IS NOT TRUE
              AND a.start > CURRENT_DATE + INTERVAL '14 days'
          )
      `;
      
      const result = await locationPool.query(rawServicesQuery);
      const rawServicesToArchive = result.rows || [];
      
      for (const service of rawServicesToArchive) {
        try {
          const serviceId = service.service_id.toString();
          const serviceName = service.name || 'Unknown';
          
          // Archive in raw services table
          await locationPool.query(
            `UPDATE services SET archived = TRUE, archived_at = NOW() WHERE service_id::text = $1`,
            [serviceId]
          );
          
          archivedServices.push({
            serviceId: serviceId,
            serviceName: serviceName,
            source: 'raw'
          });
          
          logger.info(`✅ Auto-archived raw service ${serviceId} (${serviceName}) - no future appointments in next 14+ days`);
        } catch (serviceError) {
          logger.error({ data: serviceError.message }, `❌ Error archiving raw service ${service.service_id}:`);
          // Continue with next service
        }
      }
    } catch (rawError) {
      logger.error({ data: rawError.message }, '❌ Error querying raw services:');
      // Continue anyway
    }
    
    // Invalidate cache - don't fail if this errors
    try {
      const hostname = req.get('host') || req.hostname;
      let dbLocation = 'production';
      if (hostname && (hostname.includes('localhost') || hostname.includes('127.0.0.1') || hostname.includes(':3001') || hostname.includes(':5001'))) {
        dbLocation = 'local';
      } else if (hostname) {
        const subdomain = hostname.split('.')[0];
        switch (subdomain) {
          case 'eastside': dbLocation = 'eastside'; break;
          case 'westside': dbLocation = 'westside'; break;
          case 'join': dbLocation = 'production'; break;
          default: dbLocation = 'production';
        }
      }
      // Clear all services-related caches
      await cache.clearCacheByPrefix('services');
    } catch (cacheError) {
      logger.warn({ data: cacheError.message }, '⚠️ Could not clear cache:');
      // Continue anyway
    }
    
    // Always return success, even if some operations failed
    // This prevents the UI from showing an error when auto-archive partially succeeds
    res.status(200).json({
      message: `Auto-archive completed. Archived ${archivedServices.length} service(s) with no future appointments in next 14+ days`,
      archivedCount: archivedServices.length,
      archivedServices: archivedServices,
      cutoffDate: cutoffDateStr
    });
  } catch (error) {
    // Last resort error handling - log but don't fail
    logger.error({ err: error }, '❌ Unexpected error in auto-archive:');
    logger.error({ data: error.stack }, 'Error stack:');
    
    // Still return success to prevent UI errors
    // The error is logged for debugging
    res.status(200).json({
      message: 'Auto-archive completed with some errors (check server logs)',
      archivedCount: archivedServices.length,
      archivedServices: archivedServices,
      cutoffDate: null,
      error: error.message
    });
  }
}));

const cache = require('../utils/cache');
const { getOrSet, generateKey, clearCache } = cache;

// GET /api/services/appointments/count - Get appointment counts per service
// Must be defined BEFORE the main GET / route to ensure proper matching
router.get('/appointments/count', auth, asyncHandler(async (req, res) => {
  try {
    const locationPool = getLocationPool(req);
    const hostname = req.get('host') || req.hostname;
    let dbLocation = 'production';
    if (hostname && (hostname.includes('localhost') || hostname.includes('127.0.0.1') || hostname.includes(':3001') || hostname.includes(':5001'))) {
      dbLocation = 'local';
    } else if (hostname) {
      const subdomain = hostname.split('.')[0];
      switch (subdomain) {
        case 'eastside': dbLocation = 'eastside'; break;
        case 'westside': dbLocation = 'westside'; break;
        case 'join': dbLocation = 'production'; break;
        default: dbLocation = 'production';
      }
    }

    const cacheKey = generateKey('services:appointments:count', { location: dbLocation });
    const countsMap = await getOrSet(cacheKey, async () => {
      const sql = `
        SELECT service_id, COUNT(*) as count
        FROM appointments
        GROUP BY service_id
      `;

      const { rows } = await locationPool.query(sql);
      const map = {};
      rows.forEach(row => {
        map[row.service_id] = parseInt(row.count);
      });
      return map;
    }, 60); // 60 second TTL

    res.json(countsMap);
  } catch (error) {
    logger.error({ err: error }, '❌ Error fetching appointment counts:');
    logger.error({ data: error.stack }, 'Error stack:');
    res.status(500).json({
      error: 'Error fetching appointment counts',
      message: error.message,
      details: process.env.NODE_ENV === 'development' ? error.stack : undefined
    });
  }
}));

router.get('/', asyncHandler(async (req, res) => {
  try {
    // Use location-specific database connection
    const location = req.location || 'local';
    const locationPool = req.locationPool || getPool(location);
    
    if (!locationPool) {
      return res.status(500).json({ error: 'Database pool not available' });
    }
    
    logger.info({ data: location }, 'GET /api/services - Using location:');
    
    // Check if filtering by label name (e.g., "School - Eastside")
    const labelFilter = req.query.label || req.query.labelName;
    
    // If filtering by label, query services directly from the services table
    if (labelFilter) {
      logger.info(`Filtering services by label: ${labelFilter}`);
      
      const labelFilterQuery = `
        SELECT 
          s.service_id,
          s.name,
          s.description,
          s.dft_charge_rate,
          s.dft_charge_type,
          s.location,
          s.labels,
          s.status,
          s.created_at,
          s.updated_at,
          -- Extract label name from labels JSONB array
          COALESCE(
            (SELECT label->>'name'
             FROM jsonb_array_elements(s.labels) AS label 
             WHERE label->>'name' = $1
             LIMIT 1),
            (SELECT label::text
             FROM jsonb_array_elements_text(s.labels) AS label 
             WHERE label = $1
             LIMIT 1)
          ) AS matched_label_name,
          -- Get student count and names
          COUNT(DISTINCT ar.recipient_id) FILTER (WHERE ar.status <> 'missed') AS student_count,
          STRING_AGG(DISTINCT ar.recipient_name, ', ') FILTER (WHERE ar.status <> 'missed') AS student_names,
          -- Get tutor names
          STRING_AGG(DISTINCT ac.contractor_name, ', ') AS tutor_names,
          -- Get last activity date
          MAX(a.start) AS last_activity,
          -- Get appointment count
          COUNT(DISTINCT a.appointment_id) FILTER (WHERE a.is_deleted IS NOT TRUE) AS appointment_count
        FROM services s
        LEFT JOIN appointments a ON a.service_id = s.service_id 
          AND a.is_deleted IS NOT TRUE
        LEFT JOIN appointment_recipients ar ON ar.appointment_id = a.appointment_id
        LEFT JOIN appointment_contractors ac ON ac.appointment_id = a.appointment_id
        WHERE (
          EXISTS (
            SELECT 1 
            FROM jsonb_array_elements(s.labels) AS label 
            WHERE label->>'name' = $1
          )
          OR EXISTS (
            SELECT 1 
            FROM jsonb_array_elements_text(s.labels) AS label 
            WHERE label = $1
          )
        )
        AND s.is_deleted IS NOT TRUE
        AND COALESCE(s.archived, false) = false
        GROUP BY s.service_id, s.name, s.description, s.dft_charge_rate, s.dft_charge_type, 
                 s.location, s.labels, s.status, s.created_at, s.updated_at
        ORDER BY s.name
      `;
      
      const { rows: servicesWithLabel } = await locationPool.query(labelFilterQuery, [labelFilter]);
      
      logger.info(`Found ${servicesWithLabel.length} services with label "${labelFilter}"`);
      
      // Map to expected format with enhanced data
      const services = servicesWithLabel.map(row => ({
        serviceId: String(row.service_id),
        name: row.name,
        description: row.description || null,
        location: row.location || '',
        price: row.dft_charge_rate != null ? Number(row.dft_charge_rate) : 0,
        type: row.dft_charge_type || '',
        status: row.status || 'unknown',
        colourGroup: null,
        labelId: null,
        labelName: row.matched_label_name || labelFilter,
        image: '',
        dft_max_srs: null,
        rcrs: parseInt(row.student_count || 0),
        studentCount: parseInt(row.student_count || 0),
        studentNames: row.student_names || '',
        tutorNames: row.tutor_names || '',
        lastActivity: row.last_activity,
        appointmentCount: parseInt(row.appointment_count || 0),
        createdAt: row.created_at,
        updatedAt: row.updated_at,
      }));
      
      // Apply pagination if requested
      const pagination = parsePagination(req, 100, 200);
      const start = pagination.offset;
      const end = start + pagination.limit;
      const paginatedServices = services.slice(start, end);
      
      return res.json(createPaginatedResponse(paginatedServices, pagination, services.length));
    }

    // Default behavior: Cache services (30 minutes TTL) - only services with "sync to website" label
    // Allow cache bypass with ?nocache=true query parameter
    const bypassCache = req.query.nocache === 'true' || req.query.refresh === 'true';
    const cacheKey = generateKey('services', { location });
    
    // Function to fetch services (extracted for reuse)
    const fetchServicesData = async () => {
      // Primary set: curated Services (editable in Manage Services) - exclude archived
      // Use COALESCE to handle cases where archived column doesn't exist yet (defaults to false)
      const { rows: curated } = await locationPool.query('SELECT * FROM public."Services" WHERE COALESCE("archived", false) = false');
      const curatedIds = new Set(curated.map((r) => String(r.serviceId || r.service_id || r.serviceid)));

      // Secondary set: raw synced TutorCruncher services (lowercase table), includes labels - exclude archived
      // Use COALESCE to handle cases where archived column doesn't exist yet (defaults to false)
      const { rows: rawSynced } = await locationPool.query(
        `SELECT service_id, name, dft_charge_rate, labels
         FROM services
         WHERE COALESCE(archived, false) = false`
      );

      const parseLabels = (val) => {
        try {
          if (Array.isArray(val)) return val;
          if (typeof val === 'string') return JSON.parse(val);
        } catch (_) {}
        return [];
      };
      const hasSyncToWebsite = (labels) => {
        return parseLabels(labels).some((n) => {
          // Handle both string labels ("Sync to Website") and object labels ({id: 123, name: "Sync to Website"})
          const labelName = typeof n === 'object' && n !== null ? n.name : n;
          return String(labelName || '').toLowerCase() === 'sync to website';
        });
      };

      // Filter curated by the presence of the "Sync to Website" label in raw sync
      const rawById = new Map(rawSynced.map((r) => [String(r.service_id), r]));
      const curatedVisible = curated.filter((c) => {
        const r = rawById.get(String(c.serviceId || c.service_id));
        return r ? hasSyncToWebsite(r.labels) : false;
      });

      // Include raw-synced services not yet curated, but only if they have the label
      const mapped = rawSynced
        .filter((r) => !curatedIds.has(String(r.service_id)) && hasSyncToWebsite(r.labels))
        .map((r) => ({
          serviceId: String(r.service_id),
          name: r.name,
          description: null,
          location: '',
          price: r.dft_charge_rate != null ? Number(r.dft_charge_rate) : 0,
          type: '',
          colourGroup: null,
          labelId: null,
          labelName: '',
          image: '',
          dft_max_srs: null,
          rcrs: null,
        }));

      return [...curatedVisible, ...mapped];
    };
    
    let services;
    if (bypassCache) {
      // Clear cache and fetch fresh
      await clearCache(cacheKey);
      services = await fetchServicesData();
    } else {
      // Use cache (30 minutes)
      services = await getOrSet(cacheKey, fetchServicesData, 1800);
    }

    // Apply pagination if requested
    const pagination = parsePagination(req, 100, 200);
    const start = pagination.offset;
    const end = start + pagination.limit;
    const paginatedServices = services.slice(start, end);

    res.json(createPaginatedResponse(paginatedServices, pagination, services.length));
  } catch (error) {
    logger.error({ err: error }, 'Error fetching services:');
    res.status(500).json({
      error: 'Failed to fetch services',
      details: error.message
    });
  }
}));



// Get archived services
router.get('/archived', asyncHandler(async (req, res) => {
  try {
    const locationPool = getLocationPool(req);

    if (!locationPool) {
      return res.status(500).json({ error: 'Database pool not available' });
    }

    const hostname = req.get('host') || req.hostname;
    let dbLocation = 'production';
    if (hostname && (hostname.includes('localhost') || hostname.includes('127.0.0.1') || hostname.includes(':3001') || hostname.includes(':5001'))) {
      dbLocation = 'local';
    } else if (hostname) {
      const subdomain = hostname.split('.')[0];
      switch (subdomain) {
        case 'eastside': dbLocation = 'eastside'; break;
        case 'westside': dbLocation = 'westside'; break;
        case 'join': dbLocation = 'production'; break;
        default: dbLocation = 'production';
      }
    }

    const cacheKey = generateKey('services:archived', { location: dbLocation });
    const archivedServices = await getOrSet(cacheKey, async () => {
      // Parallelize both queries
      const [archivedCurated, archivedRaw] = await Promise.all([
        locationPool.query(
          'SELECT * FROM public."Services" WHERE "archived" = true ORDER BY "archivedAt" DESC'
        ),
        locationPool.query(
          'SELECT service_id, name, description, dft_charge_rate, dft_charge_type, location, labels, archived_at FROM services WHERE archived = true ORDER BY archived_at DESC'
        )
      ]);

      // Combine and format archived services
      return [
        ...archivedCurated.rows.map(s => ({
          serviceId: s.serviceId,
          name: s.name,
          description: s.description,
          location: s.location,
          price: s.price,
          type: s.type,
          archivedAt: s.archivedAt,
          wasCurated: true
        })),
        ...archivedRaw.rows.map(s => ({
          serviceId: String(s.service_id),
          name: s.name,
          description: s.description,
          location: s.location || '',
          price: s.dft_charge_rate != null ? Number(s.dft_charge_rate) : 0,
          type: s.dft_charge_type || '',
          archivedAt: s.archived_at,
          wasCurated: false
        }))
      ];
    }, 300); // 5 minute TTL - archived services change infrequently

    res.json(archivedServices);
  } catch (error) {
    logger.error({ err: error }, 'Error fetching archived services:');
    res.status(500).json({
      error: 'Failed to fetch archived services',
      details: error.message
    });
  }
}));

// Get service history with client and student details
router.get('/history', asyncHandler(async (req, res) => {
  try {
    const locationPool = getLocationPool(req);

    const hostname = req.get('host') || req.hostname;
    let dbLocation = 'production';
    if (hostname && (hostname.includes('localhost') || hostname.includes('127.0.0.1') || hostname.includes(':3001') || hostname.includes(':5001'))) {
      dbLocation = 'local';
    } else if (hostname) {
      const subdomain = hostname.split('.')[0];
      switch (subdomain) {
        case 'eastside': dbLocation = 'eastside'; break;
        case 'westside': dbLocation = 'westside'; break;
        case 'join': dbLocation = 'production'; break;
        default: dbLocation = 'production';
      }
    }

    const cacheKey = generateKey('services:history', { location: dbLocation });
    const serviceHistory = await getOrSet(cacheKey, async () => {
      // Get services that have "sync to website" label (same as manage-services page)
      const servicesQuery = `
        SELECT
          s.service_id,
          s.name as service_name,
          s.description as service_description,
          s.location,
          s.dft_charge_type as type,
          s.dft_charge_rate as price,
          s.labels
        FROM services s
        WHERE EXISTS (
          SELECT 1 FROM jsonb_array_elements_text(s.labels) AS label
          WHERE label ILIKE '%sync to website%'
        )
      `;

      const { rows: services } = await locationPool.query(servicesQuery);
      logger.info(`Found ${services.length} services with sync to website label`);

      // Parallelize all appointment queries
      const appointmentQueries = services.map(service =>
        locationPool.query(`
          SELECT
            COUNT(DISTINCT a.appointment_id) as total_appointments,
            COUNT(DISTINCT ar.recipient_id) as total_students,
            SUM(ar.charge_rate * a.units) as total_revenue,
            MIN(a.start) as first_appointment,
            MAX(a.start) as last_appointment
          FROM appointments a
          LEFT JOIN appointment_recipients ar ON a.appointment_id = ar.appointment_id
            AND ar.status IN ('attended', 'missed-chargeable')
          WHERE a.service_id = $1
            AND a.status IN ('complete', 'cancelled-chargeable')
        `, [service.service_id])
      );

      const appointmentResults = await Promise.all(appointmentQueries);

      // Build service history from results
      const history = [];
      for (let i = 0; i < services.length; i++) {
        const service = services[i];
        const data = appointmentResults[i].rows[0];

        if (data && data.total_appointments > 0) {
          history.push({
            serviceId: service.service_id,
            serviceName: service.service_name,
            serviceDescription: service.service_description || 'No description',
            location: service.location || 'No location',
            type: service.type || 'Service',
            price: parseFloat(service.price) || 0,
            labelName: 'Sync to Website',
            totalAppointments: parseInt(data.total_appointments) || 0,
            totalStudents: parseInt(data.total_students) || 0,
            totalRevenue: parseFloat(data.total_revenue) || 0,
            firstAppointment: data.first_appointment,
            lastAppointment: data.last_appointment,
            // For compatibility with existing frontend
            appointmentId: service.service_id,
            date: data.last_appointment,
            status: 'complete',
            clientId: 'service-' + service.service_id,
            clientName: service.service_name,
            clientEmail: 'service@example.com',
            clientPhone: 'N/A',
            studentCount: parseInt(data.total_students) || 0,
            revenue: parseFloat(data.total_revenue) || 0
          });
        }
      }

      // Sort by last appointment date
      history.sort((a, b) => new Date(b.lastAppointment) - new Date(a.lastAppointment));
      return history;
    }, 300); // 5 minute TTL

    res.json(serviceHistory);
  } catch (error) {
    logger.error({ err: error }, 'Error fetching service history:');
    res.status(500).json({
      error: 'Failed to fetch service history',
      details: error.message
    });
  }
}));

// Create event job in TutorCruncher
router.post('/create-event', asyncHandler(async (req, res) => {
  try {
    const {
      eventName,
      eventType,
      location,
      price,
      description,
      maxParticipants,
      eventDate
    } = req.body;

    // Get the correct database connection based on subdomain
    const locationPool = getLocationPool(req);
    
    // Determine environment-specific label IDs
    const hostname = req.get('host') || req.hostname;
    let eventLabelId, syncToWebsiteLabelId;
    
    if (hostname && hostname.includes('eastside')) {
      eventLabelId = 350138; // Eastside Event label
    } else if (hostname && hostname.includes('westside')) {
      eventLabelId = 350139; // Westside Event label
    } else {
      eventLabelId = 350137; // Main Acme Operations Event label
    }
    
    // Sync to website label (same across all environments)
    syncToWebsiteLabelId = 350140; // Assuming this is the sync to website label ID

    // Create the job in TutorCruncher
    const jobPayload = {
      name: eventName,
      description: description,
      dft_charge_rate: parseFloat(price),
      dft_charge_type: "hourly",
      dft_contractor_rate: 0,
      dft_max_srs: parseInt(maxParticipants) || 20,
      colour: "Orange", // Event color
      status: "pending",
      is_bookable: true,
      extra_attrs: {
        event_type: eventType,
        event_date: eventDate,
        max_participants: maxParticipants
      }
    };

    logger.info({ data: jobPayload }, 'Creating TutorCruncher job with payload:');
    
    // Create the service in TutorCruncher
    const serviceResponse = await tutorCruncherAPI.post('/services/', jobPayload);
    const { id: serviceId, name: serviceName } = serviceResponse.data;
    
    logger.info(`✅ Created TutorCruncher service ${serviceId}: ${serviceName}`);

    // Add Event label
    try {
      await tutorCruncherAPI.post(`/services/${serviceId}/add_label/`, {
        label: eventLabelId
      });
      logger.info(`✅ Added Event label ${eventLabelId} to service ${serviceId}`);
    } catch (labelError) {
      logger.warn({ data: labelError.response?.data || labelError.message }, '⚠️ Failed to add Event label:');
    }

    // Add sync to website label
    try {
      await tutorCruncherAPI.post(`/services/${serviceId}/add_label/`, {
        label: syncToWebsiteLabelId
      });
      logger.info(`✅ Added sync to website label ${syncToWebsiteLabelId} to service ${serviceId}`);
    } catch (labelError) {
      logger.warn({ data: labelError.response?.data || labelError.message }, '⚠️ Failed to add sync to website label:');
    }

    // Store in local database
    const { rows: newService } = await locationPool.query(
      `INSERT INTO public."Services" 
       ("serviceId", name, description, location, price, type, "colourGroup", "labelId", "labelName", "publicVisible", "createdAt", "updatedAt")
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, NOW(), NOW())
       RETURNING *`,
      [
        serviceId.toString(),
        eventName,
        description,
        location,
        parseFloat(price),
        'Event',
        'Orange',
        eventLabelId,
        'Event',
        true
      ]
    );

    // Sync to booking_types table for frontend forms
    try {
      await locationPool.query(
        `INSERT INTO booking_types 
         (name, description, original_price, actual_price, image_url, category, 
          public_internal, lesson_type, dft_charge_type, dft_charge_rate, 
          colour, label_id, label_name, service_id)
         VALUES ($1, $2, $3, $3, $4, $5, 'public', 'Event', 'Hourly', $3, $6, $7, $8, $9)`,
        [eventName, description, parseFloat(price), null, location, 'Orange', eventLabelId, 'Event', serviceId.toString()]
      );
      logger.info(`✅ Created service ${serviceId} in booking_types table`);
    } catch (syncError) {
      logger.warn({ data: syncError.message }, `⚠️ Failed to sync service ${serviceId} to booking_types:`);
    }

    res.status(201).json({
      success: true,
      serviceId: serviceId,
      serviceName: serviceName,
      message: 'Event job created successfully in TutorCruncher'
    });

  } catch (error) {
    logger.error({ err: error }, 'Error creating event job:');
    res.status(500).json({
      error: 'Failed to create event job',
      details: error.response?.data || error.message
    });
  }
}));

// Get student details for a specific service
router.get('/:serviceId/students', asyncHandler(async (req, res) => {
  try {
    const { serviceId } = req.params;
    const locationPool = getLocationPool(req);

    const hostname = req.get('host') || req.hostname;
    let dbLocation = 'production';
    if (hostname && (hostname.includes('localhost') || hostname.includes('127.0.0.1') || hostname.includes(':3001') || hostname.includes(':5001'))) {
      dbLocation = 'local';
    } else if (hostname) {
      const subdomain = hostname.split('.')[0];
      switch (subdomain) {
        case 'eastside': dbLocation = 'eastside'; break;
        case 'westside': dbLocation = 'westside'; break;
        case 'join': dbLocation = 'production'; break;
        default: dbLocation = 'production';
      }
    }

    logger.info(`🎯 Fetching real student details for service ${serviceId}`);

    const cacheKey = generateKey('services:students', { location: dbLocation, serviceId });
    const result = await getOrSet(cacheKey, async () => {
      // Query to get actual student data for this service
      const studentsQuery = `
        SELECT DISTINCT
          ar.recipient_name as student_name,
          '' as student_email,
          '' as student_phone,
          SUM(ar.charge_rate * a.units) as revenue,
          COUNT(DISTINCT a.appointment_id) as lessons_attended,
          MAX(a.start) as appointment_date,
          a.status as appointment_status
        FROM appointments a
        LEFT JOIN appointment_recipients ar ON a.appointment_id = ar.appointment_id
        WHERE a.service_id = $1::integer
          AND a.status IN ('complete', 'cancelled-chargeable')
          AND ar.status = 'attended'
          AND ar.recipient_name IS NOT NULL
        GROUP BY ar.recipient_id, ar.recipient_name, a.status
        ORDER BY appointment_date DESC
      `;

      const { rows: students } = await locationPool.query(studentsQuery, [parseInt(serviceId)]);

      logger.info(`🎯 Found ${students.length} real students for service ${serviceId}`);

      // Transform the data to match frontend expectations
      const transformedStudents = students.map(student => ({
        student_name: student.student_name || 'Unknown Student',
        student_email: student.student_email || 'No email',
        student_phone: student.student_phone || 'No phone',
        revenue: parseFloat(student.revenue) || 0,
        lessons_attended: parseInt(student.lessons_attended) || 1,
        appointment_date: student.appointment_date,
        appointment_status: student.appointment_status
      }));

      return {
        students: transformedStudents,
        totalCount: transformedStudents.length
      };
    }, 60); // 60 second TTL

    res.json(result);
  } catch (error) {
    logger.error({ err: error }, 'Error fetching student details:');
    res.status(500).json({
      error: 'Failed to fetch student details',
      details: error.message
    });
  }
}));

// Test endpoint to verify server is running updated code
router.get('/test', (req, res) => {
  res.json({ message: '🎯 NEW CODE: Server is running updated code!', timestamp: new Date().toISOString() });
});

// =====================================================
// QR CODE INTEGRATION FOR SERVICES/BOOKING FORMS
// =====================================================

const bookingFormQRService = require('../services/booking-form-qr-service');

/**
 * GET /api/services/qr-codes/batch - Get QR codes for multiple services
 */
router.get('/qr-codes/batch', auth, asyncHandler(async (req, res) => {
  const { service_ids } = req.query;
  const locationPool = getLocationPool(req);

  try {
    if (!service_ids) {
      return res.status(400).json({ error: 'service_ids query parameter is required' });
    }

    const ids = service_ids.split(',').map(id => id.trim());

    const hostname = req.get('host') || req.hostname;
    let dbLocation = 'production';
    if (hostname && (hostname.includes('localhost') || hostname.includes('127.0.0.1') || hostname.includes(':3001') || hostname.includes(':5001'))) {
      dbLocation = 'local';
    } else if (hostname) {
      const subdomain = hostname.split('.')[0];
      switch (subdomain) {
        case 'eastside': dbLocation = 'eastside'; break;
        case 'westside': dbLocation = 'westside'; break;
        case 'join': dbLocation = 'production'; break;
        default: dbLocation = 'production';
      }
    }

    // Use sorted IDs for consistent cache key
    const sortedIds = [...ids].sort();
    const cacheKey = generateKey('services:qr-codes:batch', { location: dbLocation, ids: sortedIds.join(',') });
    const qrCodeMap = await getOrSet(cacheKey, async () => {
      const result = await locationPool.query(`
        SELECT
          q.*,
          COALESCE(COUNT(s.id), 0)::int as total_scans,
          COALESCE(COUNT(DISTINCT s.session_id), 0)::int as unique_scans,
          MAX(s.scanned_at) as last_scanned_at,
          COALESCE(SUM(CASE WHEN s.scanned_at >= NOW() - INTERVAL '7 days' THEN 1 ELSE 0 END), 0)::int as scans_last_7_days,
          COALESCE(SUM(CASE WHEN s.scanned_at >= NOW() - INTERVAL '24 hours' THEN 1 ELSE 0 END), 0)::int as scans_today
        FROM qr_codes q
        LEFT JOIN qr_code_scans s ON s.qr_code_id = q.id
        WHERE q.linked_entity_type = 'service'
          AND q.linked_entity_id = ANY($1)
          AND q.deleted_at IS NULL
        GROUP BY q.id
      `, [ids]);

      // Create a map for easy lookup
      const map = {};
      result.rows.forEach(qr => {
        map[qr.linked_entity_id] = qr;
      });
      return map;
    }, 60); // 60 second TTL - QR analytics change frequently

    res.json(qrCodeMap);
  } catch (error) {
    logger.error({ err: error }, 'Error fetching batch service QR codes:');
    res.status(500).json({ error: 'Failed to fetch QR codes' });
  }
}));

/**
 * POST /api/services/qr-codes/generate-all - Generate QR codes for all public services
 */
router.post('/qr-codes/generate-all', auth, asyncHandler(async (req, res) => {
  try {
    // Determine location from request
    const hostname = req.get('host') || req.hostname;
    let location = 'production';
    
    if (hostname && (hostname.includes('localhost') || hostname.includes('127.0.0.1'))) {
      location = 'local';
    } else if (hostname) {
      const subdomain = hostname.split('.')[0];
      switch (subdomain) {
        case 'eastside': location = 'eastside'; break;
        case 'westside': location = 'westside'; break;
        default: location = 'production';
      }
    }

    const results = await bookingFormQRService.generateQRCodesForExistingServices(location);

    // Clear QR code caches after bulk generation
    await cache.clearCacheByPrefix('services:qr');

    res.json(results);
  } catch (error) {
    logger.error({ err: error }, 'Error generating QR codes for all services:');
    res.status(500).json({ error: error.message || 'Failed to generate QR codes' });
  }
}));

/**
 * GET /api/services/:serviceId/qr-code - Get QR code for a service/booking form with analytics
 */
router.get('/:serviceId/qr-code', auth, asyncHandler(async (req, res) => {
  const { serviceId } = req.params;
  const { include_analytics = 'true' } = req.query;
  const locationPool = getLocationPool(req);

  try {
    const hostname = req.get('host') || req.hostname;
    let dbLocation = 'production';
    if (hostname && (hostname.includes('localhost') || hostname.includes('127.0.0.1') || hostname.includes(':3001') || hostname.includes(':5001'))) {
      dbLocation = 'local';
    } else if (hostname) {
      const subdomain = hostname.split('.')[0];
      switch (subdomain) {
        case 'eastside': dbLocation = 'eastside'; break;
        case 'westside': dbLocation = 'westside'; break;
        case 'join': dbLocation = 'production'; break;
        default: dbLocation = 'production';
      }
    }

    const cacheKey = generateKey('services:qr-code', { location: dbLocation, serviceId, analytics: include_analytics });
    const qrCode = await getOrSet(cacheKey, async () => {
      let query;
      if (include_analytics === 'true') {
        query = `
          SELECT
            q.*,
            COALESCE(COUNT(s.id), 0)::int as total_scans,
            COALESCE(COUNT(DISTINCT s.session_id), 0)::int as unique_scans,
            MAX(s.scanned_at) as last_scanned_at,
            COALESCE(SUM(CASE WHEN s.scanned_at >= NOW() - INTERVAL '7 days' THEN 1 ELSE 0 END), 0)::int as scans_last_7_days,
            COALESCE(SUM(CASE WHEN s.scanned_at >= NOW() - INTERVAL '24 hours' THEN 1 ELSE 0 END), 0)::int as scans_today
          FROM qr_codes q
          LEFT JOIN qr_code_scans s ON s.qr_code_id = q.id
          WHERE q.linked_entity_type = 'service'
            AND q.linked_entity_id = $1
            AND q.deleted_at IS NULL
          GROUP BY q.id
          ORDER BY q.created_at DESC
          LIMIT 1
        `;
      } else {
        query = `
          SELECT * FROM qr_codes
          WHERE linked_entity_type = 'service'
            AND linked_entity_id = $1
            AND deleted_at IS NULL
          ORDER BY created_at DESC
          LIMIT 1
        `;
      }

      const result = await locationPool.query(query, [serviceId]);
      return result.rows.length > 0 ? result.rows[0] : null;
    }, 60); // 60 second TTL - analytics change frequently

    if (!qrCode) {
      return res.json({ exists: false, service_id: serviceId });
    }

    // Prevent browser caching - analytics data changes frequently
    res.set('Cache-Control', 'no-cache, no-store, must-revalidate');
    res.set('Pragma', 'no-cache');
    res.set('Expires', '0');
    res.json(qrCode);
  } catch (error) {
    logger.error({ err: error }, 'Error fetching service QR code:');
    res.status(500).json({ error: 'Failed to fetch QR code' });
  }
}));

/**
 * POST /api/services/:serviceId/qr-code - Generate QR code for a service/booking form
 */
router.post('/:serviceId/qr-code', auth, asyncHandler(async (req, res) => {
  const { serviceId } = req.params;
  const {
    name,
    foreground_color = '#6A469D', // Brand purple as default
    background_color = '#FFFFFF',
  } = req.body;
  const locationPool = getLocationPool(req);
  
  try {
    // Get the service details
    const serviceResult = await locationPool.query(
      'SELECT name FROM "Services" WHERE "serviceId" = $1',
      [serviceId]
    );

    if (serviceResult.rows.length === 0) {
      return res.status(404).json({ error: 'Service not found' });
    }

    const service = serviceResult.rows[0];

    // Determine base URL from request hostname (for Eastside/Westside support)
    const hostname = req.get('host') || req.hostname || '';
    let baseUrl;
    if (hostname.includes('eastside')) {
      baseUrl = 'https://eastside.acmeops.com';
    } else if (hostname.includes('westside')) {
      baseUrl = 'https://westside.acmeops.com';
    } else if (hostname.includes('localhost') || hostname.includes('127.0.0.1')) {
      baseUrl = `http://${hostname}`;
    } else {
      baseUrl = process.env.BOOKING_FORM_BASE_URL || process.env.FRONTEND_URL || 'https://join.acmeops.com';
    }

    // Build destination URL with UTM parameters - points to /booking-forms/frontend
    const destinationUrl = new URL(`${baseUrl}/booking-forms/frontend`);
    destinationUrl.searchParams.set('serviceId', serviceId);
    destinationUrl.searchParams.set('utm_source', 'qr_code');
    destinationUrl.searchParams.set('utm_medium', 'scan');
    destinationUrl.searchParams.set('utm_campaign', (service.name || 'booking-form').toLowerCase().replace(/[^a-z0-9]+/g, '-'));
    
    const qrName = name || service.name;

    // Check if QR code already exists for this service
    const existingResult = await locationPool.query(`
      SELECT * FROM qr_codes
      WHERE linked_entity_type = 'service'
        AND linked_entity_id = $1
        AND deleted_at IS NULL
    `, [serviceId]);

    if (existingResult.rows.length > 0) {
      // Return the existing QR code instead of error
      return res.json(existingResult.rows[0]);
    }

    // Ensure Booking Forms folder exists
    const folderId = await bookingFormQRService.ensureBookingFormsFolder(locationPool);

    // Generate via the QR codes API
    const qrGeneratorService = require('../services/qr-code-generator-service');
    
    // Generate unique short code
    let shortCode;
    let isUnique = false;
    let attempts = 0;
    
    while (!isUnique && attempts < 10) {
      shortCode = qrGeneratorService.generateShortCode(8);
      const existing = await locationPool.query(
        'SELECT id FROM qr_codes WHERE short_code = $1',
        [shortCode]
      );
      if (existing.rows.length === 0) {
        isUnique = true;
      }
      attempts++;
    }

    if (!isUnique) {
      return res.status(500).json({ error: 'Failed to generate unique short code' });
    }

    // Build tracking URL - use same baseUrl determined from hostname
    const trackingUrl = qrGeneratorService.buildTrackingUrl(shortCode, baseUrl);

    // Generate QR code
    const qrResult = await qrGeneratorService.generateQRCode({
      content: trackingUrl,
      foregroundColor: foreground_color,
      backgroundColor: background_color,
      width: 500,
      format: 'png'
    });

    // Upload to Cloudinary
    let qr_code_image_url = null;
    try {
      const uploadResult = await new Promise((resolve, reject) => {
        const uploadStream = cloudinary.uploader.upload_stream(
          {
            folder: 'acme-ops/qr-codes',
            public_id: `qr-service-${serviceId}-${Date.now()}`,
            resource_type: 'image',
            format: 'png'
          },
          (error, result) => {
            if (error) reject(error);
            else resolve(result);
          }
        );
        uploadStream.end(qrResult.data);
      });
      qr_code_image_url = uploadResult.secure_url;
    } catch (uploadError) {
      logger.error({ data: uploadError }, 'Cloudinary upload error:');
    }

    // Generate SVG
    let qr_code_svg = null;
    try {
      const svgResult = await qrGeneratorService.generateQRCode({
        content: trackingUrl,
        foregroundColor: foreground_color,
        backgroundColor: background_color,
        format: 'svg'
      });
      qr_code_svg = svgResult.data;
    } catch (svgError) {
      logger.error({ data: svgError }, 'SVG generation error:');
    }

    // Save to database with folder
    const insertResult = await locationPool.query(`
      INSERT INTO qr_codes (
        name, description, destination_url, qr_code_image_url, qr_code_svg,
        short_code, tracking_url, source,
        linked_entity_type, linked_entity_id, auto_generated,
        foreground_color, background_color,
        category, folder_id, created_by
      ) VALUES (
        $1, $2, $3, $4, $5,
        $6, $7, 'internal',
        'service', $8, true,
        $9, $10,
        'Booking Forms', $11, $12
      )
      RETURNING *
    `, [
      qrName,
      `QR code for booking form: ${service.name}`,
      destinationUrl.toString(),
      qr_code_image_url,
      qr_code_svg,
      shortCode,
      trackingUrl,
      serviceId,
      foreground_color,
      background_color,
      folderId,
      req.user?.email || 'system'
    ]);

    // Clear QR code caches after creation
    await cache.clearCacheByPrefix('services:qr');

    res.status(201).json(insertResult.rows[0]);
  } catch (error) {
    logger.error({ err: error }, 'Error generating service QR code:');
    res.status(500).json({ error: error.message || 'Failed to generate QR code' });
  }
}));

/**
 * DELETE /api/services/:serviceId/qr-code - Unlink/delete QR code from service
 */
router.delete('/:serviceId/qr-code', auth, asyncHandler(async (req, res) => {
  const { serviceId } = req.params;
  const { delete_permanently = false } = req.query;
  const locationPool = getLocationPool(req);
  
  try {
    if (delete_permanently) {
      // Soft delete the QR code
      await locationPool.query(`
        UPDATE qr_codes
        SET deleted_at = NOW(),
            linked_entity_type = NULL,
            linked_entity_id = NULL
        WHERE linked_entity_type = 'service'
          AND linked_entity_id = $1
          AND deleted_at IS NULL
      `, [serviceId]);
    } else {
      // Just unlink it
      await locationPool.query(`
        UPDATE qr_codes
        SET linked_entity_type = NULL,
            linked_entity_id = NULL
        WHERE linked_entity_type = 'service'
          AND linked_entity_id = $1
          AND deleted_at IS NULL
      `, [serviceId]);
    }

    // Clear QR code caches after deletion/unlinking
    await cache.clearCacheByPrefix('services:qr');

    res.json({ success: true, message: 'QR code unlinked from service' });
  } catch (error) {
    logger.error({ err: error }, 'Error unlinking service QR code:');
    res.status(500).json({ error: 'Failed to unlink QR code' });
  }
}));

/**
 * POST /api/services/:serviceId/qr-code/link - Link existing QR code to service
 */
router.post('/:serviceId/qr-code/link', auth, asyncHandler(async (req, res) => {
  const { serviceId } = req.params;
  const { qr_code_id } = req.body;
  const locationPool = getLocationPool(req);
  
  if (!qr_code_id) {
    return res.status(400).json({ error: 'QR code ID is required' });
  }

  try {
    // Check if QR code exists
    const qrResult = await locationPool.query(
      'SELECT id FROM qr_codes WHERE id = $1 AND deleted_at IS NULL',
      [qr_code_id]
    );

    if (qrResult.rows.length === 0) {
      return res.status(404).json({ error: 'QR code not found' });
    }

    // Link it to the service
    await locationPool.query(`
      UPDATE qr_codes
      SET linked_entity_type = 'service',
          linked_entity_id = $1,
          updated_at = NOW()
      WHERE id = $2
    `, [serviceId, qr_code_id]);

    // Fetch updated QR code
    const updatedResult = await locationPool.query(
      'SELECT * FROM qr_codes WHERE id = $1',
      [qr_code_id]
    );

    // Clear QR code caches after linking
    await cache.clearCacheByPrefix('services:qr');

    res.json(updatedResult.rows[0]);
  } catch (error) {
    logger.error({ err: error }, 'Error linking QR code to service:');
    res.status(500).json({ error: 'Failed to link QR code' });
  }
}));

module.exports = router;