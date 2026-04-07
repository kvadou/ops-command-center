const express = require('express');
const router = express.Router();
const { auth } = global;

const { getLocationPool } = require('../utils/pool');
const { asyncHandler } = require('../middleware/error-handler');
const { logger } = require('../utils/logger');

// GET /api/home-page-config - Get user's home page configuration
router.get('/', auth, asyncHandler(async (req, res) => {
  try {
    const pool = getLocationPool(req);
    const user = req.user;
    
    if (!user || !user.id) {
      return res.status(401).json({ error: 'User not authenticated' });
    }

    // Check if table exists, if not return empty config
    try {
      const { rows } = await pool.query(
        `SELECT layout_config, updated_at 
         FROM home_page_config 
         WHERE user_id = $1 OR user_email = $2 
         ORDER BY updated_at DESC 
         LIMIT 1`,
        [user.id, user.email]
      );

      if (rows.length > 0) {
        return res.json({
          config: {
            layout_config: rows[0].layout_config,
            updated_at: rows[0].updated_at,
          },
        });
      }
    } catch (tableError) {
      // Table doesn't exist yet - return empty config
      if (tableError.code === '42P01' || tableError.message.includes('does not exist')) {
        logger.info('home_page_config table does not exist yet - returning empty config');
        return res.json({
          config: {
            layout_config: [],
            updated_at: null,
          },
        });
      }
      throw tableError;
    }

    // Return empty config if none exists
    return res.json({
      config: {
        layout_config: [],
        updated_at: null,
      },
    });
  } catch (error) {
    logger.error({ err: error }, 'Error fetching home page config:');
    res.status(500).json({ error: 'Failed to fetch home page configuration', details: error.message });
  }
}));

// POST /api/home-page-config - Save user's home page configuration
router.post('/', auth, asyncHandler(async (req, res) => {
  try {
    const pool = getLocationPool(req);
    const user = req.user;
    const { layout_config } = req.body;

    if (!user || !user.id) {
      return res.status(401).json({ error: 'User not authenticated' });
    }

    if (!Array.isArray(layout_config)) {
      return res.status(400).json({ error: 'layout_config must be an array' });
    }

    // Check if table exists first
    try {
      // Upsert configuration
      await pool.query(
        `INSERT INTO home_page_config (user_id, user_email, layout_config, updated_at)
         VALUES ($1, $2, $3, CURRENT_TIMESTAMP)
         ON CONFLICT (user_id, user_email)
         DO UPDATE SET 
           layout_config = EXCLUDED.layout_config,
           updated_at = CURRENT_TIMESTAMP`,
        [user.id, user.email || '', JSON.stringify(layout_config)]
      );

      res.json({
        success: true,
        message: 'Home page configuration saved successfully',
      });
    } catch (tableError) {
      // Table doesn't exist yet
      if (tableError.code === '42P01' || tableError.message.includes('does not exist')) {
        return res.status(503).json({ 
          error: 'Database table not initialized. Please run the migration first.',
          details: 'Run: node scripts/run-home-page-config-migration.js local'
        });
      }
      throw tableError;
    }
  } catch (error) {
    logger.error({ err: error }, 'Error saving home page config:');
    res.status(500).json({ error: 'Failed to save home page configuration', details: error.message });
  }
}));

// DELETE /api/home-page-config - Reset to default (delete user's config)
router.delete('/', auth, asyncHandler(async (req, res) => {
  try {
    const pool = getLocationPool(req);
    const user = req.user;

    if (!user || !user.id) {
      return res.status(401).json({ error: 'User not authenticated' });
    }

    await pool.query(
      `DELETE FROM home_page_config 
       WHERE user_id = $1 OR user_email = $2`,
      [user.id, user.email]
    );

    res.json({
      success: true,
      message: 'Home page configuration reset to default',
    });
  } catch (error) {
    logger.error({ err: error }, 'Error resetting home page config:');
    res.status(500).json({ error: 'Failed to reset home page configuration' });
  }
}));

module.exports = router;
