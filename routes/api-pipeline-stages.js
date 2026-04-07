const express = require('express');
const { asyncHandler } = require('../middleware/error-handler');
const { logger } = require('../utils/logger');
const router = express.Router();
const { limitedGet, pool, auth, syncPipelineStages } = global;

// Proxy TC endpoint for convenience/testing
router.get('/', asyncHandler(async (req, res) => {
  try {
    const resp = await limitedGet('pipeline-stages/');
    res.json(resp.data);
  } catch (err) {
    logger.error({ status: err.response?.status, error: err.response?.data || err.message }, 'Error fetching pipeline stages from TutorCruncher');
    res.status(err.response?.status || 500).json({ error: 'Failed to fetch pipeline stages from TutorCruncher' });
  }
}));

// Local fetch
router.get('/local', asyncHandler(async (_req, res) => {
  try {
    const { rows } = await pool.query('SELECT * FROM pipeline_stages ORDER BY pipeline NULLS LAST, order_index NULLS LAST, name');
    res.json(rows);
  } catch (err) {
    logger.error({ error: err.message }, 'Error fetching local pipeline stages');
    res.status(500).json({ error: 'Failed to fetch local pipeline stages' });
  }
}));

// Trigger sync
router.post('/sync', auth, asyncHandler(async (_req, res) => {
  try {
    await syncPipelineStages();
    const { rows } = await pool.query('SELECT COUNT(*)::int AS count FROM pipeline_stages');
    res.json({ message: 'Pipeline stages synced', count: rows[0]?.count ?? 0 });
  } catch (err) {
    logger.error({ status: err?.response?.status, error: err?.response?.data || err?.message }, 'Error syncing pipeline stages');
    res.status(500).json({ error: 'Failed to sync pipeline stages', detail: err?.message });
  }
}));

module.exports = router;


