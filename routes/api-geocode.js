const express = require('express');
const router = express.Router();
const { requireAuth } = require('../middleware/auth');
const auth = global.auth || requireAuth;
const axios = require('axios');
const cache = require('../utils/cache');
const { asyncHandler } = require('../middleware/error-handler');
const { logger } = require('../utils/logger');

// POST /api/geocode/save - Save geocoded coordinates to database
// This endpoint is called by the frontend after geocoding an address
router.post('/save', auth, asyncHandler(async (req, res) => {
  try {
    const { entityType, entityId, lat, lng, address } = req.body;
    
    if (!entityType || !entityId || !lat || !lng) {
      return res.status(400).json({ error: 'Missing required fields: entityType, entityId, lat, lng' });
    }

    const pool = req.locationPool || global.pool;
    if (!pool) {
      return res.status(500).json({ error: 'Database connection not available' });
    }

    let updateQuery = '';
    let params = [];

    switch (entityType) {
      case 'tutors':
        updateQuery = `UPDATE contractors SET latitude = $1, longitude = $2 WHERE contractor_id = $3`;
        params = [parseFloat(lat), parseFloat(lng), parseInt(entityId)];
        break;
      case 'clients':
        updateQuery = `UPDATE clients SET latitude = $1, longitude = $2 WHERE client_id = $3`;
        params = [parseFloat(lat), parseFloat(lng), parseInt(entityId)];
        break;
      case 'students':
        updateQuery = `UPDATE recipients SET latitude = $1, longitude = $2 WHERE recipient_id = $3`;
        params = [parseFloat(lat), parseFloat(lng), parseInt(entityId)];
        break;
      case 'affiliates':
        updateQuery = `UPDATE affiliates SET latitude = $1, longitude = $2 WHERE id = $3`;
        params = [parseFloat(lat), parseFloat(lng), parseInt(entityId)];
        break;
      default:
        return res.status(400).json({ error: 'Invalid entityType' });
    }

    await pool.query(updateQuery, params);

    // Invalidate caches for the affected entity type
    if (entityType === 'tutors') {
      await cache.clearCacheByPrefix('contractors');
    }

    res.json({ success: true, message: 'Coordinates saved' });
  } catch (error) {
    logger.error({ err: error }, 'Error saving geocoded coordinates:');
    res.status(500).json({ error: 'Failed to save coordinates', details: error.message });
  }
}));

module.exports = router;

