/**
 * Term Billing API Routes
 * Handles term billing configuration, enrollment, and management
 */

const express = require('express');
const { tableExists } = require('../utils/schema-cache');
const {
  pool,
  tutorCruncherAPI,
  auth,
  stripe
} = global;

const router = express.Router();
const subscriptionBillingService = require('../services/subscription-billing-service');
const { asyncHandler } = require('../middleware/error-handler');
const { logger } = require('../utils/logger');

/**
 * POST /api/term-billing/create-config
 * Create term billing configuration for a Job/Service
 */
router.post('/create-config', auth, asyncHandler(async (req, res) => {
  try {
    // Use location-specific database connection
    const locationPool = req.locationPool || pool;
    
    const {
      serviceId,
      termName,
      ratePerLesson,
      termDiscountPercent,
      classDates, // Array of ISO date strings
      familyDiscountPercent,
      monthlySubscriptionEnabled // Optional - stored but not used in config creation
    } = req.body;

    // Validation
    if (!serviceId || !termName || !ratePerLesson || !classDates || !Array.isArray(classDates)) {
      return res.status(400).json({
        error: 'Missing required fields: serviceId, termName, ratePerLesson, classDates (array)',
        received: {
          serviceId: !!serviceId,
          termName: !!termName,
          ratePerLesson: !!ratePerLesson,
          classDates: Array.isArray(classDates) ? `array with ${classDates.length} items` : typeof classDates
        }
      });
    }

    if (classDates.length === 0) {
      return res.status(400).json({
        error: 'At least one class date must be provided'
      });
    }

    // Validate ratePerLesson is a valid number
    const parsedRate = parseFloat(ratePerLesson);
    if (isNaN(parsedRate) || parsedRate <= 0) {
      return res.status(400).json({
        error: `Invalid ratePerLesson: ${ratePerLesson}. Must be a positive number.`
      });
    }

    // Validate dates
    const validDates = [];
    for (const dateStr of classDates) {
      const date = new Date(dateStr);
      if (isNaN(date.getTime())) {
        return res.status(400).json({
          error: `Invalid date format: ${dateStr}. Use ISO format (YYYY-MM-DD)`
        });
      }
      validDates.push(date.toISOString().split('T')[0]);
    }

    // Sort dates
    validDates.sort();

    // Check if table exists first
    const tbcExists = await tableExists(locationPool, 'term_billing_configs');

    if (!tbcExists) {
      return res.status(500).json({
        error: 'Term billing configs table does not exist. Please run the migration.',
        hint: 'Run: node scripts/run-term-billing-migration.js [environment]',
        code: 'TABLE_NOT_FOUND'
      });
    }

    // Calculate totals and distribution
    const totals = subscriptionBillingService.calculateTermTotals(
      validDates,
      parseFloat(ratePerLesson),
      termDiscountPercent ? parseFloat(termDiscountPercent) : null
    );
    const distribution = subscriptionBillingService.calculateMonthlyDistribution(validDates);

    // Get final class date
    const finalDate = new Date(validDates[validDates.length - 1]);

    // Verify service exists in Services table (for foreign key constraint)
    try {
      const serviceCheck = await locationPool.query(
        'SELECT "serviceId" FROM "Services" WHERE "serviceId" = $1 LIMIT 1',
        [serviceId]
      );
      
      if (serviceCheck.rows.length === 0) {
        return res.status(400).json({
          error: `Service ID ${serviceId} does not exist in the Services table. Please ensure the service exists before creating a term billing config.`,
          code: 'SERVICE_NOT_FOUND'
        });
      }
    } catch (serviceCheckError) {
      // If Services table doesn't exist or query fails, log but continue (foreign key will catch it)
      logger.warn({ data: serviceCheckError.message }, 'Could not verify service existence:');
    }

    // Check if config already exists for this service
    const existingCheck = await locationPool.query(
      'SELECT id FROM term_billing_configs WHERE service_id = $1 AND is_active = true',
      [serviceId]
    );

    if (existingCheck.rows.length > 0) {
      return res.status(400).json({
        error: 'Active term billing config already exists for this service. Update existing config or deactivate it first.'
      });
    }

    // Insert config
    const result = await locationPool.query(
      `INSERT INTO term_billing_configs (
        service_id, term_name, rate_per_lesson, term_discount_percent,
        class_dates, total_lessons, term_total, discounted_term_total,
        lessons_per_month, family_discount_percent, monthly_subscription_enabled
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)
      RETURNING *`,
      [
        serviceId,
        termName,
        parseFloat(ratePerLesson),
        termDiscountPercent ? parseFloat(termDiscountPercent) : null,
        JSON.stringify(validDates),
        totals.totalLessons,
        totals.termTotal,
        totals.discountedTermTotal,
        JSON.stringify(distribution),
        familyDiscountPercent ? parseFloat(familyDiscountPercent) : null,
        monthlySubscriptionEnabled === true || monthlySubscriptionEnabled === 'true'
      ]
    );

    const config = result.rows[0];
    
    // Parse JSONB fields for response (only if they're strings, PostgreSQL JSONB is already parsed)
    if (typeof config.class_dates === 'string') {
      try {
    config.class_dates = JSON.parse(config.class_dates);
      } catch (e) {
        logger.warn({ data: e.message }, 'Failed to parse class_dates:');
        config.class_dates = [];
      }
    }
    // If it's already an object/array, keep it as is
    
    if (typeof config.lessons_per_month === 'string') {
      try {
    config.lessons_per_month = JSON.parse(config.lessons_per_month);
      } catch (e) {
        logger.warn({ data: e.message }, 'Failed to parse lessons_per_month:');
        config.lessons_per_month = {};
      }
    }
    // If it's already an object, keep it as is

    res.json({
      success: true,
      config,
      preview: {
        monthlyDistribution: distribution,
        totals,
        finalClassDate: finalDate.toISOString().split('T')[0]
      }
    });
  } catch (error) {
    logger.error({ err: error }, 'Error creating term billing config:');
    logger.error({ data: error.stack }, 'Error stack:');
    logger.error({ data: {
      message: error.message,
      detail: error.detail,
      code: error.code,
      hint: error.hint,
      serviceId: req.body?.serviceId,
      classDates: req.body?.classDates ? (Array.isArray(req.body.classDates) ? `${req.body.classDates.length} dates` : typeof req.body.classDates) : 'missing',
      ratePerLesson: req.body?.ratePerLesson
    } }, 'Error details:');
    
    // Check if table doesn't exist
    if (error.code === '42P01' || error.message?.includes('does not exist') || error.message?.includes('relation')) {
      return res.status(500).json({
        error: 'Term billing configs table does not exist. Please run the migration.',
        hint: 'Run: node scripts/run-term-billing-migration.js [environment]',
        code: error.code
      });
    }
    
    // Check for foreign key constraint violation
    if (error.code === '23503' || error.message?.includes('foreign key') || error.message?.includes('violates foreign key constraint')) {
      return res.status(400).json({
        error: `Service ID ${req.body?.serviceId} does not exist in the Services table. Please ensure the service exists before creating a term billing config.`,
        code: error.code,
        hint: error.hint || 'The service must exist in the Services table before creating a term billing configuration.'
      });
    }
    
    // Check for null constraint violation
    if (error.code === '23502' || error.message?.includes('null value') || error.message?.includes('violates not-null constraint')) {
      return res.status(400).json({
        error: 'Required field is missing or null. Please check that all required fields are provided.',
        code: error.code,
        detail: error.detail,
        hint: error.hint
      });
    }
    
    res.status(500).json({
      error: 'Failed to create term billing config',
      message: error.message,
      details: error.detail,
      code: error.code,
      hint: error.hint,
      debug: {
        serviceId: req.body?.serviceId,
        classDatesProvided: req.body?.classDates ? (Array.isArray(req.body.classDates) ? `${req.body.classDates.length} dates` : typeof req.body.classDates) : 'missing',
        ratePerLesson: req.body?.ratePerLesson
      }
    });
  }
}));

/**
 * GET /api/term-billing/config/:serviceId
 * Get term billing config for a service (public endpoint for booking forms)
 */
router.get('/config/:serviceId', asyncHandler(async (req, res) => {
  try {
    // Use location-specific database connection
    const locationPool = req.locationPool || pool;
    
    const { serviceId } = req.params;

    const result = await locationPool.query(
      `SELECT * FROM term_billing_configs 
       WHERE service_id = $1 AND is_active = true
       ORDER BY created_at DESC
       LIMIT 1`,
      [serviceId]
    );

    if (result.rows.length === 0) {
      return res.status(200).json({
        config: null
      });
    }

    const config = result.rows[0];
    
    // Safely parse JSONB fields
    try {
      if (config.class_dates) {
        if (typeof config.class_dates === 'string') {
          config.class_dates = JSON.parse(config.class_dates);
        }
        // If it's already an object/array, keep it as is
      } else {
        config.class_dates = [];
      }
    } catch (e) {
      logger.warn({ data: e.message }, 'Failed to parse class_dates:');
      config.class_dates = [];
    }
    
    try {
      if (config.lessons_per_month) {
        if (typeof config.lessons_per_month === 'string') {
          config.lessons_per_month = JSON.parse(config.lessons_per_month);
        }
        // If it's already an object, keep it as is
      } else {
        config.lessons_per_month = {};
      }
    } catch (e) {
      logger.warn({ data: e.message }, 'Failed to parse lessons_per_month:');
      config.lessons_per_month = {};
    }

    res.json({ config });
  } catch (error) {
    logger.error({ err: error }, 'Error fetching term billing config:');
    logger.error({ data: {
      message: error.message,
      detail: error.detail,
      code: error.code,
      hint: error.hint,
      stack: error.stack
    } }, 'Error details:');
    
    // Check if table doesn't exist
    if (error.code === '42P01' || error.message?.includes('does not exist') || error.message?.includes('relation')) {
      return res.status(500).json({
        error: 'Term billing configs table does not exist. Please run the migration.',
        hint: 'Run: node scripts/run-term-billing-migration.js [environment]',
        code: error.code
      });
    }
    
    res.status(500).json({
      error: 'Failed to fetch term billing config',
      message: error.message,
      details: error.detail,
      code: error.code
    });
  }
}));

/**
 * GET /api/term-billing/future-dates/:serviceId
 * Get future appointment dates for a service (for pre-populating class dates)
 */
router.get('/future-dates/:serviceId', auth, asyncHandler(async (req, res) => {
  try {
    // Use location-specific database connection
    const locationPool = req.locationPool || pool;
    
    const { serviceId } = req.params;
    
    // Check if appointments table exists (cached)
    const apptExists = await tableExists(locationPool, 'appointments');

    if (!apptExists) {
      return res.json({ dates: [] });
    }
    
    // Query future appointments for this service
    const result = await locationPool.query(
      `SELECT DISTINCT DATE(start) as appointment_date
       FROM appointments
       WHERE service_id = $1
         AND start >= CURRENT_DATE
         AND status NOT IN ('cancelled', 'cancelled-no-charge')
       ORDER BY appointment_date ASC`,
      [serviceId]
    );
    
    // Extract dates and format as YYYY-MM-DD
    const dates = result.rows.map(row => {
      const date = new Date(row.appointment_date);
      return date.toISOString().split('T')[0];
    });
    
    res.json({ dates });
  } catch (error) {
    logger.error({ err: error }, 'Error fetching future dates:');
    res.status(500).json({
      error: 'Failed to fetch future dates',
      message: error.message
    });
  }
}));

/**
 * PUT /api/term-billing/config/:configId
 * Update term billing config (e.g., when new lessons added to job)
 */
router.put('/config/:configId', auth, asyncHandler(async (req, res) => {
  try {
    // Use location-specific database connection
    const locationPool = req.locationPool || pool;
    
    const { configId } = req.params;
    const { classDates, monthlySubscriptionEnabled, termDiscountPercent } = req.body;

    // Get existing config first
    const existingResult = await locationPool.query(
      'SELECT * FROM term_billing_configs WHERE id = $1',
      [configId]
    );

    if (existingResult.rows.length === 0) {
      return res.status(404).json({
        error: 'Term billing config not found'
      });
    }

    const existingConfig = existingResult.rows[0];
    
    // classDates is optional - if not provided, keep existing dates
    // monthlySubscriptionEnabled can be updated independently
    let validDates = null;
    let totals = null;
    let distribution = null;
    let finalClassDate = null;
    
    if (classDates !== undefined) {
      if (!Array.isArray(classDates) || classDates.length === 0) {
        return res.status(400).json({
          error: 'classDates must be a non-empty array if provided'
        });
      }

      // Validate and sort dates
      validDates = [];
      for (const dateStr of classDates) {
        const date = new Date(dateStr);
        if (isNaN(date.getTime())) {
          return res.status(400).json({
            error: `Invalid date format: ${dateStr}`
          });
        }
        validDates.push(date.toISOString().split('T')[0]);
      }
      validDates.sort();
      
      // Recalculate totals if dates changed
    const ratePerLesson = parseFloat(existingConfig.rate_per_lesson);
    // Use new discount if provided, otherwise use existing
    let discountPercent = termDiscountPercent !== undefined 
      ? (termDiscountPercent !== null && termDiscountPercent !== '' ? parseFloat(termDiscountPercent) : null)
      : (existingConfig.term_discount_percent ? parseFloat(existingConfig.term_discount_percent) : null);

      totals = subscriptionBillingService.calculateTermTotals(
        validDates,
        ratePerLesson,
        discountPercent
      );
      distribution = subscriptionBillingService.calculateMonthlyDistribution(validDates);
      
      // Find latest class date
      const sortedDates = validDates.map(d => new Date(d)).sort((a, b) => a - b);
      finalClassDate = sortedDates[sortedDates.length - 1];
    }
    
    // Handle termDiscountPercent update - if provided but dates weren't, recalculate totals with existing dates
    let discountToUse = termDiscountPercent !== undefined 
      ? (termDiscountPercent !== null && termDiscountPercent !== '' ? parseFloat(termDiscountPercent) : null)
      : (existingConfig.term_discount_percent ? parseFloat(existingConfig.term_discount_percent) : null);
    
    if (termDiscountPercent !== undefined && !validDates) {
      // If discount changed but dates weren't provided, recalculate totals with existing dates
      if (existingConfig.class_dates) {
        // Parse existing dates if they're a string
        let existingDates = existingConfig.class_dates;
        if (typeof existingDates === 'string') {
          try {
            existingDates = JSON.parse(existingDates);
          } catch (e) {
            logger.warn({ data: e.message }, 'Failed to parse existing class_dates:');
            existingDates = [];
          }
        }
        
        if (Array.isArray(existingDates) && existingDates.length > 0) {
          validDates = existingDates.map(d => new Date(d).toISOString().split('T')[0]).sort();
          const ratePerLesson = parseFloat(existingConfig.rate_per_lesson);
          
          totals = subscriptionBillingService.calculateTermTotals(
            validDates,
            ratePerLesson,
            discountToUse
          );
          distribution = subscriptionBillingService.calculateMonthlyDistribution(validDates);
          
          const sortedDates = validDates.map(d => new Date(d)).sort((a, b) => a - b);
          finalClassDate = sortedDates[sortedDates.length - 1];
        }
      } else if (validDates) {
        // If we already have validDates from above, just recalculate with new discount
        const ratePerLesson = parseFloat(existingConfig.rate_per_lesson);
        totals = subscriptionBillingService.calculateTermTotals(
          validDates,
          ratePerLesson,
          discountToUse
        );
      }
    }
    
    // Build update query dynamically based on what's being updated
    const updateFields = [];
    const updateParts = [];
    let paramIndex = 1;
    
    // Update dates and totals if provided
    if (validDates !== null && totals !== null && distribution !== null) {
      updateParts.push(`class_dates = $${paramIndex++}`);
      updateFields.push(JSON.stringify(validDates));
      
      updateParts.push(`total_lessons = $${paramIndex++}`);
      updateFields.push(totals.totalLessons);
      
      updateParts.push(`term_total = $${paramIndex++}`);
      updateFields.push(totals.termTotal);
      
      updateParts.push(`discounted_term_total = $${paramIndex++}`);
      updateFields.push(totals.discountedTermTotal);
      
      updateParts.push(`lessons_per_month = $${paramIndex++}`);
      updateFields.push(JSON.stringify(distribution));
      
      // Update enrollments' final_class_date if dates changed
      if (finalClassDate) {
        try {
          await locationPool.query(
            `UPDATE subscription_enrollments 
             SET final_class_date = $1,
                 updated_at = NOW()
             WHERE service_id = $2 
               AND status = 'active'`,
            [finalClassDate.toISOString().split('T')[0], existingConfig.service_id]
          );
        } catch (enrollmentError) {
          // Table might not exist yet, that's okay - just log and continue
          logger.warn({ data: enrollmentError.message }, 'Could not update subscription enrollments:');
        }
      }
    }
    
    // Update term_discount_percent if provided
    if (termDiscountPercent !== undefined) {
      updateParts.push(`term_discount_percent = $${paramIndex++}`);
      updateFields.push(discountToUse);
    }
    
    // Update monthly_subscription_enabled if provided
    if (monthlySubscriptionEnabled !== undefined) {
      updateParts.push(`monthly_subscription_enabled = $${paramIndex++}`);
      updateFields.push(monthlySubscriptionEnabled === true || monthlySubscriptionEnabled === 'true');
    }
    
    // Only update if there are fields to update
    if (updateParts.length === 0) {
      return res.status(400).json({
        error: 'No fields provided to update. Provide classDates, termDiscountPercent, and/or monthlySubscriptionEnabled.'
      });
    }
    
    updateParts.push(`updated_at = NOW()`);
    updateFields.push(configId); // For WHERE clause
    
    const updateQuery = `UPDATE term_billing_configs 
         SET ${updateParts.join(', ')}
         WHERE id = $${paramIndex}
         RETURNING *`;
    
    const updateResult = await locationPool.query(updateQuery, updateFields);
    const updatedConfig = updateResult.rows[0];

    // Safely parse JSONB fields (only if they're strings)
    if (typeof updatedConfig.class_dates === 'string') {
      try {
    updatedConfig.class_dates = JSON.parse(updatedConfig.class_dates);
      } catch (e) {
        logger.warn({ data: e.message }, 'Failed to parse class_dates:');
        updatedConfig.class_dates = [];
      }
    }
    
    if (typeof updatedConfig.lessons_per_month === 'string') {
      try {
    updatedConfig.lessons_per_month = JSON.parse(updatedConfig.lessons_per_month);
      } catch (e) {
        logger.warn({ data: e.message }, 'Failed to parse lessons_per_month:');
        updatedConfig.lessons_per_month = {};
      }
    }

    res.json({
      success: true,
      config: updatedConfig,
      message: 'Term config updated. Active enrollments final_class_date also updated.'
    });
  } catch (error) {
    logger.error({ err: error }, 'Error updating term billing config:');
    res.status(500).json({
      error: 'Failed to update term billing config',
      message: error.message
    });
  }
}));

/**
 * DELETE /api/term-billing/config/:configId
 * Deactivate term billing config
 */
router.delete('/config/:configId', auth, asyncHandler(async (req, res) => {
  try {
    // Use location-specific database connection
    const locationPool = req.locationPool || pool;
    
    const { configId } = req.params;

    const result = await locationPool.query(
      `UPDATE term_billing_configs 
       SET is_active = false, updated_at = NOW()
       WHERE id = $1
       RETURNING *`,
      [configId]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({
        error: 'Term billing config not found'
      });
    }

    res.json({
      success: true,
      message: 'Term billing config deactivated'
    });
  } catch (error) {
    logger.error({ err: error }, 'Error deactivating term billing config:');
    res.status(500).json({
      error: 'Failed to deactivate term billing config',
      message: error.message
    });
  }
}));

/**
 * DELETE /api/term-billing/config-by-service/:serviceId
 * Delete term billing config by serviceId (alternative endpoint)
 */
router.delete('/config-by-service/:serviceId', auth, asyncHandler(async (req, res) => {
  try {
    // Use location-specific database connection
    const locationPool = req.locationPool || pool;
    
    const { serviceId } = req.params;

    // First, find the config by serviceId
    const findResult = await locationPool.query(
      `SELECT id FROM term_billing_configs 
       WHERE service_id = $1 AND is_active = true
       ORDER BY created_at DESC
       LIMIT 1`,
      [serviceId]
    );

    if (findResult.rows.length === 0) {
      return res.status(404).json({
        error: 'No active term billing config found for this service'
      });
    }

    const configId = findResult.rows[0].id;

    // Deactivate the config
    const result = await locationPool.query(
      `UPDATE term_billing_configs 
       SET is_active = false, updated_at = NOW()
       WHERE id = $1
       RETURNING *`,
      [configId]
    );

    res.json({
      success: true,
      message: 'Term billing config deactivated'
    });
  } catch (error) {
    logger.error({ err: error }, 'Error deactivating term billing config by serviceId:');
    res.status(500).json({
      error: 'Failed to deactivate term billing config',
      message: error.message
    });
  }
}));

/**
 * GET /api/term-billing/configs
 * List all term billing configs (for admin view)
 */
router.get('/configs', auth, asyncHandler(async (req, res) => {
  try {
    // Use location-specific database connection
    const locationPool = req.locationPool || pool;
    
    // Check if table exists first
    const tbcExists = await tableExists(locationPool, 'term_billing_configs');

    if (!tbcExists) {
      return res.json({ configs: [] });
    }
    
    // Try to get configs without the Services join first (more reliable)
    const result = await locationPool.query(
      `SELECT * FROM term_billing_configs 
       WHERE is_active = true
       ORDER BY created_at DESC`
    );

    // Try to enrich with service names if Services table exists
    const configs = await Promise.all(result.rows.map(async (config) => {
      let serviceName = null;
      let serviceId = config.service_id;
      
      // Try to get service name if service_id exists
      if (config.service_id) {
        try {
          // Check if Services table exists (cached)
          const [svcCuratedExists, svcRawExists] = await Promise.all([
            tableExists(locationPool, 'Services'),
            tableExists(locationPool, 'services')
          ]);

          if (svcCuratedExists || svcRawExists) {
            try {
              // Try both table name variations
              const serviceResult = await locationPool.query(
                `SELECT name, service_name, service_id 
                 FROM "Services" 
                 WHERE "serviceId" = $1::text OR "serviceId"::text = $1
                 LIMIT 1`,
                [config.service_id]
              );
              
              if (serviceResult.rows.length === 0) {
                // Try lowercase table name
                const serviceResult2 = await locationPool.query(
                  `SELECT name, service_name, service_id 
                   FROM services 
                   WHERE service_id = $1 OR service_id::text = $1
                   LIMIT 1`,
                  [config.service_id]
                );
                if (serviceResult2.rows.length > 0) {
                  serviceName = serviceResult2.rows[0].name || serviceResult2.rows[0].service_name || null;
                }
              } else {
                serviceName = serviceResult.rows[0].name || serviceResult.rows[0].service_name || null;
              }
            } catch (serviceError) {
              // Service query failed, continue without service name
              logger.warn({ data: serviceError.message }, 'Could not fetch service name:');
            }
          }
        } catch (tableCheckError) {
          // Table check failed, continue without service name
          logger.warn({ data: tableCheckError.message }, 'Could not check Services table:');
        }
      }
      
      // Safely parse JSON fields
      let classDates = [];
      let lessonsPerMonth = {};
      
      try {
        if (config.class_dates) {
          if (typeof config.class_dates === 'string') {
            classDates = JSON.parse(config.class_dates);
          } else {
            classDates = config.class_dates;
          }
        }
      } catch (e) {
        logger.warn({ configId: config.id, error: e.message }, 'Failed to parse class_dates for config');
        classDates = [];
      }
      
      try {
        if (config.lessons_per_month) {
          if (typeof config.lessons_per_month === 'string') {
            lessonsPerMonth = JSON.parse(config.lessons_per_month);
          } else {
            lessonsPerMonth = config.lessons_per_month;
          }
        }
      } catch (e) {
        logger.warn({ configId: config.id, error: e.message }, 'Failed to parse lessons_per_month for config');
        lessonsPerMonth = {};
      }
      
      return {
        ...config,
        service_name: serviceName,
        service_id: serviceId,
        class_dates: classDates,
        lessons_per_month: lessonsPerMonth
      };
    }));

    res.json({ configs });
  } catch (error) {
    logger.error({ err: error }, 'Error fetching term billing configs:');
    logger.error({ data: error.stack }, 'Error stack:');
    logger.error({ data: {
      message: error.message,
      detail: error.detail,
      code: error.code,
      hint: error.hint
    } }, 'Error details:');
    res.status(500).json({
      error: 'Failed to fetch term billing configs',
      message: error.message,
      details: error.detail,
      code: error.code,
      hint: error.hint
    });
  }
}));

/**
 * POST /api/term-billing/preview
 * Preview billing calculation without saving (public endpoint for booking forms)
 */
router.post('/preview', asyncHandler(async (req, res) => {
  try {
    const {
      ratePerLesson,
      termDiscountPercent,
      classDates,
      enrollmentDate, // Optional - for proration preview
      familyDiscountPercent
    } = req.body;

    if (!ratePerLesson || !classDates || !Array.isArray(classDates)) {
      return res.status(400).json({
        error: 'ratePerLesson and classDates array are required'
      });
    }

    // Validate dates
    const validDates = [];
    for (const dateStr of classDates) {
      const date = new Date(dateStr);
      if (isNaN(date.getTime())) {
        return res.status(400).json({
          error: `Invalid date format: ${dateStr}`
        });
      }
      validDates.push(date.toISOString().split('T')[0]);
    }
    validDates.sort();

    // Calculate totals
    const totals = subscriptionBillingService.calculateTermTotals(
      validDates,
      parseFloat(ratePerLesson),
      termDiscountPercent ? parseFloat(termDiscountPercent) : null
    );

    // Calculate monthly distribution
    const distribution = subscriptionBillingService.calculateMonthlyDistribution(validDates);

    // If enrollment date provided, calculate proration
    let proration = null;
    if (enrollmentDate) {
      const enrollDate = new Date(enrollmentDate);
      proration = subscriptionBillingService.calculateProratedTermPayment(
        validDates,
        enrollDate,
        parseFloat(ratePerLesson),
        termDiscountPercent ? parseFloat(termDiscountPercent) : null
      );
    }

    res.json({
      preview: {
        totals,
        monthlyDistribution: distribution,
        proration,
        finalClassDate: validDates[validDates.length - 1]
      }
    });
  } catch (error) {
    logger.error({ err: error }, 'Error generating preview:');
    res.status(500).json({
      error: 'Failed to generate preview',
      message: error.message
    });
  }
}));

module.exports = router;

