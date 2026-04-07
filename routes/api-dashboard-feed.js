const express = require('express');
const router = express.Router();
const { asyncHandler } = require('../middleware/error-handler');
const { requireAuth } = require('../middleware/auth');
const { getLocationPool } = require('../utils/pool');
const dashboardFeedService = require('../services/dashboard-feed-service');

const auth = global.auth || requireAuth;

// GET /api/dashboard-feed — all dashboard sections in one call
router.get('/', auth, asyncHandler(async (req, res) => {
  const pool = getLocationPool(req);
  const feed = await dashboardFeedService.getDashboardFeed(pool);
  res.json(feed);
}));

module.exports = router;
