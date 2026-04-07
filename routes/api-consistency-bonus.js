const express = require('express');
const { asyncHandler } = require('../middleware/error-handler');
const { logger } = require('../utils/logger');
const router = express.Router();
const { tutorCruncherAPI } = global;

// Get consistency bonus status for a tutor in a period
router.get('/consistency-bonus/status', asyncHandler(async (req, res) => {
  const pool = req.locationPool || global.pool;
  const client = await pool.connect();
  try {
    const { contractorId, periodStart, periodEnd, bucketName } = req.query;
    
    if (!contractorId || !periodStart || !periodEnd || !bucketName) {
      return res.status(400).json({ error: 'contractorId, periodStart, periodEnd, and bucketName are required' });
    }

    // Check if consistency bonus has been applied
    const { rows } = await client.query(
      `SELECT 
        id,
        contractor_id,
        contractor_name,
        bonus_amount,
        period_start,
        period_end,
        hours_worked,
        bucket_name,
        adhoc_charge_id,
        tutorcruncher_charge_id,
        applied_by,
        applied_at
      FROM consistency_bonuses
      WHERE contractor_id = $1 
        AND period_start = $2 
        AND period_end = $3 
        AND bucket_name = $4`,
      [contractorId, periodStart, periodEnd, bucketName]
    );

    if (rows.length > 0) {
      return res.json({
        applied: true,
        bonus: rows[0]
      });
    }

    res.json({
      applied: false,
      bonus: null
    });

  } catch (error) {
    logger.error({ err: error }, 'Error checking consistency bonus status:');
    res.status(500).json({ error: 'Internal server error', details: error.message });
  } finally {
    client.release();
  }
}));

// Apply consistency bonus ad hoc charge to TutorCruncher
router.post('/consistency-bonus/apply', asyncHandler(async (req, res) => {
  const pool = req.locationPool || global.pool;
  const client = await pool.connect();
  
  try {
    const { 
      contractorId, 
      contractorName, 
      bonusAmount, 
      periodStart, 
      periodEnd, 
      hoursWorked, 
      bucketName,
      categoryId = 104064 // Default Consistency Bonus category ID (from https://account.acmeops.com/setup/ahc-cats/edit/104064/)
    } = req.body;

    if (!contractorId || !contractorName || !bonusAmount || !periodStart || !periodEnd || !hoursWorked || !bucketName) {
      return res.status(400).json({ 
        error: 'contractorId, contractorName, bonusAmount, periodStart, periodEnd, hoursWorked, and bucketName are required' 
      });
    }

    // Check if bonus has already been applied
    const existingCheck = await client.query(
      `SELECT id FROM consistency_bonuses
       WHERE contractor_id = $1 
         AND period_start = $2 
         AND period_end = $3 
         AND bucket_name = $4`,
      [contractorId, periodStart, periodEnd, bucketName]
    );

    if (existingCheck.rows.length > 0) {
      return res.status(400).json({ 
        error: 'Consistency bonus has already been applied for this tutor and period',
        bonus: existingCheck.rows[0]
      });
    }

    // Get user info from request (if available)
    const appliedBy = req.user?.email || req.user?.name || 'System';

    // Create ad hoc charge in TutorCruncher
    if (!tutorCruncherAPI) {
      return res.status(500).json({ error: 'TutorCruncher API not available' });
    }

    // Look up Consistency Bonus category ID from synced categories table, then existing ad hoc charges, then fallback
    let finalCategoryId = categoryId;
    if (!finalCategoryId) {
      try {
        // First, try to get from synced ad hoc charge categories table
        const categoryTableQuery = await client.query(
          `SELECT id FROM adhoc_charge_categories 
           WHERE name ILIKE '%consistency%bonus%' 
           LIMIT 1`
        );
        if (categoryTableQuery.rows.length > 0) {
          finalCategoryId = categoryTableQuery.rows[0].id;
          logger.info('✅ Found Consistency Bonus category ID: ${finalCategoryId} from adhoc_charge_categories table');
        } else {
          // Fallback: try to get from existing ad hoc charges
          const categoryQuery = await client.query(
            `SELECT DISTINCT category_id, category_name 
             FROM adhoc_charges 
             WHERE category_name ILIKE '%consistency%bonus%' 
             LIMIT 1`
          );
          if (categoryQuery.rows.length > 0) {
            finalCategoryId = categoryQuery.rows[0].category_id;
            logger.info('✅ Found Consistency Bonus category ID: ${finalCategoryId} from existing charges');
          } else {
            // Final fallback: try to get from environment or use default
            finalCategoryId = process.env.CONSISTENCY_BONUS_CATEGORY_ID || 104064;
            logger.info('⚠️ Using default/fallback category ID: ${finalCategoryId}');
          }
        }
      } catch (categoryError) {
        logger.warn({ data: categoryError.message }, '⚠️ Could not look up category ID, using default:');
        finalCategoryId = process.env.CONSISTENCY_BONUS_CATEGORY_ID || 104064;
      }
    }

    // Format period for description - include the month the bonus is attributed to
    const startDate = new Date(periodStart);
    const monthName = startDate.toLocaleDateString('en-US', { month: 'long' });
    const year = startDate.getFullYear();
    const description = `${monthName} ${year} Consistency Bonus`;

    logger.info({ contractorId, contractorName, bonusAmount, periodStart, periodEnd, bucketName, categoryId: finalCategoryId, description }, '💰 Creating consistency bonus ad hoc charge');

    // Create ad hoc charge via TutorCruncher API
    // TutorCruncher API requires 'category' field (not 'category_id')
    const adhocChargePayload = {
      contractor: contractorId,
      category: finalCategoryId, // Consistency Bonus category ID
      pay_contractor: parseFloat(bonusAmount),
      date_occurred: new Date().toISOString(), // Use current date
      description: description,
      net_gross: 'net' // Net amount (before tax)
    };

    let tutorcruncherChargeId;
    try {
      logger.info('📤 Sending request to TutorCruncher API: POST /adhoccharges/');
      logger.info({ data: JSON.stringify(adhocChargePayload, null, 2) }, '📦 Payload:');
      
      const tcResponse = await tutorCruncherAPI.post('/adhoccharges/', adhocChargePayload);
      tutorcruncherChargeId = tcResponse.data.id;
      logger.info('✅ Created ad hoc charge in TutorCruncher: ${tutorcruncherChargeId}');
      
      // Immediately fetch and sync the charge to database (webhook may be delayed)
      // This ensures the charge appears in the UI right away
      try {
        logger.info('🔄 Immediately syncing charge ${tutorcruncherChargeId} to database...');
        const chargeResponse = await tutorCruncherAPI.get(`/adhoccharges/${tutorcruncherChargeId}/`);
        const charge = chargeResponse.data;
        
        // Extract IDs
        const appointmentId = charge.appointment?.id || charge.appointment || null;
        const serviceId = charge.service?.id || charge.service || null;
        
        // Insert into adhoc_charges table immediately
        await client.query(
          `INSERT INTO adhoc_charges (
            id, agent_id, appointment_id, category_id, category_name,
            client_id, contractor_id, contractor_first_name, contractor_last_name, contractor_email,
            creator_id, creator_first_name, creator_last_name, creator_email,
            currency, date_occurred, description, net_gross, pay_contractor,
            service_id, tax_amount, last_updated
          ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17, $18, $19, $20, $21, NOW())
          ON CONFLICT (id) DO UPDATE SET
            agent_id = EXCLUDED.agent_id,
            appointment_id = EXCLUDED.appointment_id,
            category_id = EXCLUDED.category_id,
            category_name = EXCLUDED.category_name,
            client_id = EXCLUDED.client_id,
            contractor_id = EXCLUDED.contractor_id,
            contractor_first_name = EXCLUDED.contractor_first_name,
            contractor_last_name = EXCLUDED.contractor_last_name,
            contractor_email = EXCLUDED.contractor_email,
            creator_id = EXCLUDED.creator_id,
            creator_first_name = EXCLUDED.creator_first_name,
            creator_last_name = EXCLUDED.creator_last_name,
            creator_email = EXCLUDED.creator_email,
            currency = EXCLUDED.currency,
            date_occurred = EXCLUDED.date_occurred,
            description = EXCLUDED.description,
            net_gross = EXCLUDED.net_gross,
            pay_contractor = EXCLUDED.pay_contractor,
            service_id = EXCLUDED.service_id,
            tax_amount = EXCLUDED.tax_amount,
            last_updated = EXCLUDED.last_updated
          `,
          [
            charge.id,
            charge.agent || null,
            appointmentId,
            charge.category_id || finalCategoryId,
            charge.category_name || 'Consistency Bonus',
            charge.client || null,
            charge.contractor?.id || contractorId,
            charge.contractor?.first_name || null,
            charge.contractor?.last_name || null,
            charge.contractor?.email || null,
            charge.creator?.id || null,
            charge.creator?.first_name || null,
            charge.creator?.last_name || null,
            charge.creator?.email || null,
            charge.currency || 'USD',
            charge.date_occurred || new Date().toISOString(),
            charge.description || description,
            charge.net_gross || 'net',
            charge.pay_contractor || parseFloat(bonusAmount),
            serviceId,
            charge.tax_amount || null
          ]
        );
        logger.info('✅ Charge ${tutorcruncherChargeId} synced to database immediately');
      } catch (syncError) {
        logger.warn({ data: syncError.message }, '⚠️ Could not immediately sync charge ${tutorcruncherChargeId}:');
        logger.warn('   Webhook should sync it shortly, or run manual sync if needed');
      }
    } catch (tcError) {
      // Enhanced error logging
      const errorDetails = {
        message: tcError.message,
        status: tcError.response?.status,
        statusText: tcError.response?.statusText,
        data: tcError.response?.data,
        request: {
          url: tcError.config?.url,
          method: tcError.config?.method,
          data: tcError.config?.data
        }
      };
      
      logger.error('❌ Error creating ad hoc charge in TutorCruncher:');
      logger.error({ error: JSON.stringify(errorDetails, null, 2) }, 'Full error details:');
      logger.error({ error: tcError.stack }, 'Error stack:');
      
      // Extract user-friendly error message
      let errorMessage = 'Failed to create ad hoc charge in TutorCruncher';
      if (tcError.response?.data) {
        if (typeof tcError.response.data === 'string') {
          errorMessage = tcError.response.data;
        } else if (tcError.response.data.error) {
          errorMessage = tcError.response.data.error;
        } else if (tcError.response.data.detail) {
          errorMessage = tcError.response.data.detail;
        } else if (tcError.response.data.message) {
          errorMessage = tcError.response.data.message;
        } else if (typeof tcError.response.data === 'object') {
          // Handle validation errors like {"category": ["This field is required."]}
          const validationErrors = [];
          for (const [field, messages] of Object.entries(tcError.response.data)) {
            if (Array.isArray(messages)) {
              validationErrors.push(`${field}: ${messages.join(', ')}`);
            } else {
              validationErrors.push(`${field}: ${messages}`);
            }
          }
          if (validationErrors.length > 0) {
            errorMessage = validationErrors.join('; ');
          } else {
            errorMessage = JSON.stringify(tcError.response.data);
          }
        } else {
          errorMessage = JSON.stringify(tcError.response.data);
        }
      } else if (tcError.message) {
        errorMessage = tcError.message;
      }
      
      return res.status(500).json({ 
        error: errorMessage,
        details: errorDetails
      });
    }

    // Store consistency bonus record in database
    const insertQuery = `
      INSERT INTO consistency_bonuses (
        contractor_id,
        contractor_name,
        bonus_amount,
        period_start,
        period_end,
        hours_worked,
        bucket_name,
        tutorcruncher_charge_id,
        applied_by
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
      RETURNING *
    `;

    const { rows } = await client.query(insertQuery, [
      contractorId,
      contractorName,
      parseFloat(bonusAmount),
      periodStart,
      periodEnd,
      parseFloat(hoursWorked),
      bucketName,
      tutorcruncherChargeId,
      appliedBy
    ]);

    // Link adhoc_charge_id to consistency bonus record (charge should already be in DB from immediate sync above)
    try {
      const adhocChargeCheck = await client.query(
        `SELECT id FROM adhoc_charges WHERE id = $1`,
        [tutorcruncherChargeId]
      );
      
      if (adhocChargeCheck.rows.length > 0) {
        await client.query(
          `UPDATE consistency_bonuses SET adhoc_charge_id = $1 WHERE id = $2`,
          [tutorcruncherChargeId, rows[0].id]
        );
        logger.info('✅ Linked adhoc_charge_id ${tutorcruncherChargeId} to consistency bonus record');
      } else {
        logger.warn('⚠️ Charge ${tutorcruncherChargeId} not found in database yet - webhook should sync it shortly');
      }
    } catch (updateError) {
      logger.warn({ data: updateError.message }, '⚠️ Could not link adhoc_charge_id:');
    }

    logger.info('✅ Consistency bonus applied successfully for ${contractorName}: $${bonusAmount}');

    res.json({
      success: true,
      bonus: rows[0],
      tutorcruncherChargeId,
      message: `Consistency bonus of $${bonusAmount} applied successfully`
    });

  } catch (error) {
    logger.error({ err: error }, 'Error applying consistency bonus:');
    res.status(500).json({ error: 'Internal server error', details: error.message });
  } finally {
    client.release();
  }
}));

module.exports = router;

