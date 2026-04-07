const express = require('express');
const router = express.Router();
const { tableExists } = require('../utils/schema-cache');
const { tutorCruncherAPI, limitedGet } = global;

const { getLocationPool } = require('../utils/pool');
const { asyncHandler } = require('../middleware/error-handler');
const { logger } = require('../utils/logger');

// POST /api/packages - Create a new package
router.post('/', asyncHandler(async (req, res) => {
  try {
    const pool = getLocationPool(req);
    if (!pool) {
      return res.status(500).json({ error: 'Database connection not available' });
    }

    const {
      name,
      description,
      cost,
      bonus_credit,
      icon,
      icon_colour,
      sort_index,
      active
    } = req.body;

    // Validate required fields
    if (!name || cost === undefined || bonus_credit === undefined) {
      return res.status(400).json({ 
        error: 'Missing required fields',
        details: 'Name, cost, and bonus_credit are required'
      });
    }

    // Check if packages table exists (cached)
    const pkgExists = await tableExists(pool, 'packages');

    if (!pkgExists) {
      // Try to create package via TutorCruncher API
      try {
        if (!tutorCruncherAPI) {
          return res.status(500).json({ error: 'TutorCruncher API not available' });
        }

        const packageData = {
          name,
          description: description || '',
          cost: parseFloat(cost),
          bonus_credit: parseFloat(bonus_credit) || 0,
          icon: icon || '',
          icon_colour: icon_colour || '#000000',
          sort_index: parseInt(sort_index) || 0,
          active: active !== undefined ? active : true
        };

        const response = await tutorCruncherAPI.post('/packages/', packageData);
        return res.status(201).json({ package: response.data });
      } catch (apiError) {
        logger.error({ data: apiError.message }, 'Error creating package via API:');
        return res.status(500).json({
          error: 'Failed to create package',
          details: apiError.message
        });
      }
    }

    // Calculate total value
    const totalValue = parseFloat(cost) + (parseFloat(bonus_credit) || 0);

    // Insert into database
    const insertQuery = `
      INSERT INTO packages (
        name, description, cost, bonus_credit, total_value,
        icon, icon_colour, sort_index, active, date_created, last_updated
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, NOW(), NOW())
      RETURNING *
    `;

    const { rows } = await pool.query(insertQuery, [
      name,
      description || '',
      parseFloat(cost),
      parseFloat(bonus_credit) || 0,
      totalValue,
      icon || '',
      icon_colour || '#000000',
      parseInt(sort_index) || 0,
      active !== undefined ? active : true
    ]);

    res.status(201).json({ package: rows[0] });
  } catch (error) {
    logger.error({ err: error }, 'Error creating package:');
    res.status(500).json({
      error: 'Failed to create package',
      details: error.message,
      stack: process.env.NODE_ENV === 'development' ? error.stack : undefined
    });
  }
}));

// PUT /api/packages/:id - Update an existing package
router.put('/:id', asyncHandler(async (req, res) => {
  try {
    const pool = getLocationPool(req);
    if (!pool) {
      return res.status(500).json({ error: 'Database connection not available' });
    }

    const packageId = req.params.id;
    const {
      name,
      description,
      cost,
      bonus_credit,
      icon,
      icon_colour,
      sort_index,
      active
    } = req.body;

    // Validate required fields
    if (!name || cost === undefined || bonus_credit === undefined) {
      return res.status(400).json({ 
        error: 'Missing required fields',
        details: 'Name, cost, and bonus_credit are required'
      });
    }

    // Check if packages table exists (cached)
    const pkgExists = await tableExists(pool, 'packages');

    if (!pkgExists) {
      // Try to update package via TutorCruncher API
      try {
        if (!tutorCruncherAPI) {
          return res.status(500).json({ error: 'TutorCruncher API not available' });
        }

        const packageData = {
          name,
          description: description || '',
          cost: parseFloat(cost),
          bonus_credit: parseFloat(bonus_credit) || 0,
          icon: icon || '',
          icon_colour: icon_colour || '#000000',
          sort_index: parseInt(sort_index) || 0,
          active: active !== undefined ? active : true
        };

        const response = await tutorCruncherAPI.put(`/packages/${packageId}/`, packageData);
        return res.json({ package: response.data });
      } catch (apiError) {
        logger.error({ data: apiError.message }, 'Error updating package via API:');
        return res.status(500).json({
          error: 'Failed to update package',
          details: apiError.message
        });
      }
    }

    // Calculate total value
    const totalValue = parseFloat(cost) + (parseFloat(bonus_credit) || 0);

    // Update in database
    const updateQuery = `
      UPDATE packages SET
        name = $1,
        description = $2,
        cost = $3,
        bonus_credit = $4,
        total_value = $5,
        icon = $6,
        icon_colour = $7,
        sort_index = $8,
        active = $9,
        last_updated = NOW()
      WHERE id = $10
      RETURNING *
    `;

    const { rows } = await pool.query(updateQuery, [
      name,
      description || '',
      parseFloat(cost),
      parseFloat(bonus_credit) || 0,
      totalValue,
      icon || '',
      icon_colour || '#000000',
      parseInt(sort_index) || 0,
      active !== undefined ? active : true,
      packageId
    ]);

    if (rows.length === 0) {
      return res.status(404).json({ error: 'Package not found' });
    }

    res.json({ package: rows[0] });
  } catch (error) {
    logger.error({ err: error }, 'Error updating package:');
    res.status(500).json({
      error: 'Failed to update package',
      details: error.message,
      stack: process.env.NODE_ENV === 'development' ? error.stack : undefined
    });
  }
}));

// GET /api/packages/:id - Get a single package
router.get('/:id', asyncHandler(async (req, res) => {
  try {
    const pool = getLocationPool(req);
    if (!pool) {
      return res.status(500).json({ error: 'Database connection not available' });
    }

    const packageId = req.params.id;

    // Check if packages table exists (cached)
    const pkgExists = await tableExists(pool, 'packages');

    if (!pkgExists) {
      return res.status(404).json({ error: 'Packages table does not exist' });
    }

    const { rows } = await pool.query(
      'SELECT * FROM packages WHERE id = $1',
      [packageId]
    );

    if (rows.length === 0) {
      return res.status(404).json({ error: 'Package not found' });
    }

    res.json({ package: rows[0] });
  } catch (error) {
    logger.error({ err: error }, 'Error fetching package:');
    res.status(500).json({
      error: 'Failed to fetch package',
      details: error.message
    });
  }
}));

module.exports = router;

