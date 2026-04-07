const express = require('express');
const router = express.Router();
const { Client } = require('pg');
const { tableExists } = require('../utils/schema-cache');
const { tutorCruncherAPI, limitedGet } = global;

const { getLocationPool } = require('../utils/pool');
const { asyncHandler } = require('../middleware/error-handler');
const { logger } = require('../utils/logger');

// GET /api/adhoc-charges/categories - Get all ad hoc charge categories
router.get('/categories', asyncHandler(async (req, res) => {
  try {
    const pool = getLocationPool(req);
    if (!pool) {
      return res.status(500).json({ error: 'Database connection not available' });
    }

    // Check if adhoc_charge_categories table exists (cached)
    const adhocTableExists = await tableExists(pool, 'adhoc_charge_categories');

    if (!adhocTableExists) {
      // Try to fetch from TutorCruncher API
      try {
        if (!limitedGet) {
          logger.warn('limitedGet not available, returning empty categories');
          return res.json({ categories: [] });
        }
        const response = await limitedGet('/adhocchargecategories/');
        const categories = response.data.results || [];
        return res.json({ categories });
      } catch (apiError) {
        logger.error({ error: apiError.message }, 'Error fetching categories from API:');
        return res.json({ categories: [] });
      }
    }

    const { rows } = await pool.query(`
      SELECT id, name, description
      FROM adhoc_charge_categories
      ORDER BY name
    `);

    res.json({ categories: rows });
  } catch (error) {
    logger.error({ err: error }, 'Error fetching ad hoc charge categories:');
    res.status(500).json({ error: 'Failed to fetch categories' });
  }
}));

// POST /api/adhoc-charges - Create a new ad hoc charge
router.post('/', asyncHandler(async (req, res) => {
  const client = new Client({
    connectionString: process.env.DATABASE_URL,
    ssl: process.env.NODE_ENV === 'production' ? { rejectUnauthorized: false } : false
  });

  try {
    await client.connect();
    const pool = getLocationPool(req);

    const {
      category_id,
      description,
      date_occurred,
      client_id,
      charge_client,
      contractor_id,
      pay_contractor,
      affiliate_id,
      affiliate_commission_percentage,
      tax_setting,
      service_id,
      appointment_id,
      raise_invoice
    } = req.body;

    // Validate required fields
    if (!category_id || !description || !date_occurred) {
      return res.status(400).json({ 
        error: 'Missing required fields',
        required: ['category_id', 'description', 'date_occurred']
      });
    }

    // Get category name
    let categoryName = '';
    try {
      if (limitedGet) {
        const categoryResponse = await limitedGet(`/adhocchargecategories/${category_id}/`);
        categoryName = categoryResponse.data.name || '';
      }
    } catch (error) {
      logger.error({ error: error.message }, 'Error fetching category name:');
    }

    // Build payload for TutorCruncher API
    const adhocChargePayload = {
      category: category_id,
      description: description,
      date_occurred: date_occurred,
      tax_setting: tax_setting || 'calculate_tax_on_amount_enter_gross_values'
    };

    if (client_id) adhocChargePayload.client = parseInt(client_id);
    if (charge_client) adhocChargePayload.charge_client = parseFloat(charge_client);
    if (contractor_id) adhocChargePayload.contractor = parseInt(contractor_id);
    if (pay_contractor) adhocChargePayload.pay_contractor = parseFloat(pay_contractor);
    if (affiliate_id) adhocChargePayload.affiliate = parseInt(affiliate_id);
    if (affiliate_commission_percentage) adhocChargePayload.affiliate_commission_percentage = parseFloat(affiliate_commission_percentage);
    if (service_id) adhocChargePayload.service = parseInt(service_id);
    if (appointment_id) adhocChargePayload.appointment = parseInt(appointment_id);

    // Create in TutorCruncher
    logger.info('📤 Creating ad hoc charge in TutorCruncher...');
    const tcResponse = await tutorCruncherAPI.post('/adhoccharges/', adhocChargePayload);
    const tutorcruncherChargeId = tcResponse.data.id;
    logger.info('✅ Created ad hoc charge in TutorCruncher: ${tutorcruncherChargeId}');

    // Immediately fetch and sync the charge to database
    try {
      const chargeResponse = await tutorCruncherAPI.get(`/adhoccharges/${tutorcruncherChargeId}/`);
      const charge = chargeResponse.data;

      // Extract IDs
      const appointmentId = charge.appointment?.id || charge.appointment || null;
      const serviceId = charge.service?.id || charge.service || null;
      const contractorId = charge.contractor?.id || charge.contractor || null;
      const clientId = charge.client?.id || charge.client || null;
      const creatorId = charge.creator?.id || charge.creator || null;

      // Insert into adhoc_charges table
      await pool.query(
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
          last_updated = NOW()`,
        [
          charge.id,
          charge.agent || null,
          appointmentId,
          charge.category?.id || charge.category || null,
          charge.category?.name || categoryName || '',
          clientId,
          contractorId,
          charge.contractor?.first_name || null,
          charge.contractor?.last_name || null,
          charge.contractor?.email || null,
          creatorId,
          charge.creator?.first_name || null,
          charge.creator?.last_name || null,
          charge.creator?.email || null,
          charge.currency || 'USD',
          charge.date_occurred,
          charge.description || '',
          charge.charge_client || charge.net_gross || null,
          charge.pay_contractor || null,
          serviceId,
          charge.tax_amount || null
        ]
      );

      logger.info('✅ Synced ad hoc charge ${tutorcruncherChargeId} to database');

      // If raise_invoice is true, raise an invoice
      if (raise_invoice && charge.charge_client) {
        try {
          // TODO: Implement invoice creation logic
          logger.info('📝 Invoice creation requested for ad hoc charge ${tutorcruncherChargeId}');
        } catch (invoiceError) {
          logger.error({ error: invoiceError.message }, 'Error raising invoice:');
        }
      }

      res.json({
        success: true,
        adhocCharge: {
          id: charge.id,
          category_name: charge.category?.name || categoryName,
          description: charge.description,
          date_occurred: charge.date_occurred,
          charge_client: charge.charge_client,
          pay_contractor: charge.pay_contractor
        }
      });
    } catch (syncError) {
      logger.error({ error: syncError.message }, 'Error syncing charge to database:');
      // Still return success since it was created in TutorCruncher
      res.json({
        success: true,
        adhocCharge: {
          id: tutorcruncherChargeId,
          warning: 'Charge created in TutorCruncher but sync to database failed'
        }
      });
    }
  } catch (error) {
    logger.error({ err: error }, 'Error creating ad hoc charge:');
    res.status(500).json({ 
      error: 'Failed to create ad hoc charge',
      details: error.message 
    });
  } finally {
    await client.end();
  }
}));

// PUT /api/adhoc-charges/:id - Update an existing ad hoc charge
router.put('/:id', asyncHandler(async (req, res) => {
  const client = new Client({
    connectionString: process.env.DATABASE_URL,
    ssl: process.env.NODE_ENV === 'production' ? { rejectUnauthorized: false } : false
  });

  try {
    await client.connect();
    const pool = getLocationPool(req);
    const { id } = req.params;

    const {
      category_id,
      description,
      date_occurred,
      client_id,
      charge_client,
      contractor_id,
      pay_contractor,
      affiliate_id,
      affiliate_commission_percentage,
      tax_setting,
      service_id,
      appointment_id
    } = req.body;

    // Build payload for TutorCruncher API
    const adhocChargePayload = {};

    if (category_id) adhocChargePayload.category = parseInt(category_id);
    if (description) adhocChargePayload.description = description;
    if (date_occurred) adhocChargePayload.date_occurred = date_occurred;
    if (tax_setting) adhocChargePayload.tax_setting = tax_setting;
    if (client_id) adhocChargePayload.client = parseInt(client_id);
    if (charge_client !== undefined) adhocChargePayload.charge_client = parseFloat(charge_client);
    if (contractor_id) adhocChargePayload.contractor = parseInt(contractor_id);
    if (pay_contractor !== undefined) adhocChargePayload.pay_contractor = parseFloat(pay_contractor);
    if (affiliate_id) adhocChargePayload.affiliate = parseInt(affiliate_id);
    if (affiliate_commission_percentage) adhocChargePayload.affiliate_commission_percentage = parseFloat(affiliate_commission_percentage);
    if (service_id) adhocChargePayload.service = parseInt(service_id);
    if (appointment_id) adhocChargePayload.appointment = parseInt(appointment_id);

    // Update in TutorCruncher
    logger.info('📤 Updating ad hoc charge ${id} in TutorCruncher...');
    const tcResponse = await tutorCruncherAPI.put(`/adhoccharges/${id}/`, adhocChargePayload);
    logger.info('✅ Updated ad hoc charge ${id} in TutorCruncher');

    // Immediately fetch and sync the updated charge to database
    try {
      const chargeResponse = await tutorCruncherAPI.get(`/adhoccharges/${id}/`);
      const charge = chargeResponse.data;

      // Extract IDs
      const appointmentId = charge.appointment?.id || charge.appointment || null;
      const serviceId = charge.service?.id || charge.service || null;
      const contractorId = charge.contractor?.id || charge.contractor || null;
      const clientId = charge.client?.id || charge.client || null;
      const creatorId = charge.creator?.id || charge.creator || null;

      // Update in adhoc_charges table
      await pool.query(
        `UPDATE adhoc_charges SET
          agent_id = $2,
          appointment_id = $3,
          category_id = $4,
          category_name = $5,
          client_id = $6,
          contractor_id = $7,
          contractor_first_name = $8,
          contractor_last_name = $9,
          contractor_email = $10,
          creator_id = $11,
          creator_first_name = $12,
          creator_last_name = $13,
          creator_email = $14,
          currency = $15,
          date_occurred = $16,
          description = $17,
          net_gross = $18,
          pay_contractor = $19,
          service_id = $20,
          tax_amount = $21,
          last_updated = NOW()
        WHERE id = $1`,
        [
          charge.id,
          charge.agent || null,
          appointmentId,
          charge.category?.id || charge.category || null,
          charge.category?.name || '',
          clientId,
          contractorId,
          charge.contractor?.first_name || null,
          charge.contractor?.last_name || null,
          charge.contractor?.email || null,
          creatorId,
          charge.creator?.first_name || null,
          charge.creator?.last_name || null,
          charge.creator?.email || null,
          charge.currency || 'USD',
          charge.date_occurred,
          charge.description || '',
          charge.charge_client || charge.net_gross || null,
          charge.pay_contractor || null,
          serviceId,
          charge.tax_amount || null
        ]
      );

      logger.info('✅ Synced updated ad hoc charge ${id} to database');

      res.json({
        success: true,
        adhocCharge: {
          id: charge.id,
          category_name: charge.category?.name || '',
          description: charge.description,
          date_occurred: charge.date_occurred,
          charge_client: charge.charge_client,
          pay_contractor: charge.pay_contractor
        }
      });
    } catch (syncError) {
      logger.error({ error: syncError.message }, 'Error syncing updated charge to database:');
      res.json({
        success: true,
        adhocCharge: {
          id: id,
          warning: 'Charge updated in TutorCruncher but sync to database failed'
        }
      });
    }
  } catch (error) {
    logger.error({ err: error }, 'Error updating ad hoc charge:');
    res.status(500).json({ 
      error: 'Failed to update ad hoc charge',
      details: error.message 
    });
  } finally {
    await client.end();
  }
}));

// GET /api/adhoc-charges/:id - Get a single ad hoc charge
router.get('/:id', asyncHandler(async (req, res) => {
  try {
    const pool = getLocationPool(req);
    const { id } = req.params;

    // Try to fetch from database first
    const { rows } = await pool.query(`
      SELECT 
        ac.*,
        CONCAT(c.first_name, ' ', c.last_name) as client_name,
        CONCAT(ct.first_name, ' ', ct.last_name) as contractor_name,
        s.name as service_name
      FROM adhoc_charges ac
      LEFT JOIN clients c ON CAST(ac.client_id AS TEXT) = c.client_id
      LEFT JOIN contractors ct ON CAST(ac.contractor_id AS INTEGER) = ct.contractor_id
      LEFT JOIN services s ON CAST(ac.service_id AS INTEGER) = s.service_id
      WHERE ac.id = $1
    `, [parseInt(id)]);

    if (rows.length === 0) {
      // Try to fetch from TutorCruncher API
      try {
        const response = await tutorCruncherAPI.get(`/adhoccharges/${id}/`);
        return res.json({ adhocCharge: response.data });
      } catch (apiError) {
        return res.status(404).json({ error: 'Ad hoc charge not found' });
      }
    }

    res.json({ adhocCharge: rows[0] });
  } catch (error) {
    logger.error({ err: error }, 'Error fetching ad hoc charge:');
    res.status(500).json({ error: 'Failed to fetch ad hoc charge' });
  }
}));

module.exports = router;

