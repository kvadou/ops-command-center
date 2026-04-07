const express = require('express');
const router = express.Router();
const { asyncHandler } = require('../middleware/error-handler');
const { requireAuth } = require('../middleware/auth');
const { getLocationPool } = require('../utils/pool');
const { getPool } = require('../database-connections');
const { logger } = require('../utils/logger');
const dataCenterService = require('../services/data-center-service');

const auth = global.auth || requireAuth;

// Valid markets for the market toggle
const VALID_MARKETS = ['production', 'westside', 'eastside'];

// Resolve pool — supports ?market= override for multi-market Data Center
function resolvePool(req) {
  const { market } = req.query;
  if (market && VALID_MARKETS.includes(market)) {
    return getPool(market);
  }
  return getLocationPool(req);
}

// GET /api/data-center/markets
router.get('/markets', auth, asyncHandler(async (req, res) => {
  res.json(VALID_MARKETS.map(m => ({
    key: m,
    label: m === 'production' ? 'Main' : m.charAt(0).toUpperCase() + m.slice(1),
  })));
}));

// GET /api/data-center/health
router.get('/health', auth, asyncHandler(async (req, res) => {
  const pool = resolvePool(req);
  const health = await dataCenterService.getHealth(pool);
  res.json(health);
}));

// GET /api/data-center/entities
router.get('/entities', auth, asyncHandler(async (req, res) => {
  res.json(dataCenterService.getEntityList());
}));

// GET /api/data-center/quality
router.get('/quality', auth, asyncHandler(async (req, res) => {
  const pool = resolvePool(req);
  const quality = await dataCenterService.getDataQuality(pool);
  res.json(quality);
}));

// GET /api/data-center/search
router.get('/search', auth, asyncHandler(async (req, res) => {
  const pool = resolvePool(req);
  const { q } = req.query;
  const results = await dataCenterService.globalSearch(pool, q);
  res.json(results);
}));

// GET /api/data-center/:entity/export
router.get('/:entity/export', auth, asyncHandler(async (req, res) => {
  const pool = resolvePool(req);
  const { entity } = req.params;
  const { search, dateFrom, dateTo } = req.query;

  logger.info({ entity, search, dateFrom, dateTo }, 'Data Center CSV export');

  const csv = await dataCenterService.exportEntityCsv(pool, entity, {
    search, dateFrom, dateTo,
  });

  const config = dataCenterService.ENTITY_CONFIG[entity];
  const filename = `${config ? config.label.toLowerCase().replace(/\s+/g, '-') : entity}-export.csv`;

  res.setHeader('Content-Type', 'text/csv');
  res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
  res.send(csv);
}));

// GET /api/data-center/:entity
router.get('/:entity', auth, asyncHandler(async (req, res) => {
  const pool = resolvePool(req);
  const { entity } = req.params;
  const { page, pageSize, sortBy, sortDir, search, dateFrom, dateTo } = req.query;

  const data = await dataCenterService.getEntityData(pool, entity, {
    page: parseInt(page) || 1,
    pageSize: Math.min(parseInt(pageSize) || 50, 200),
    sortBy,
    sortDir,
    search,
    dateFrom,
    dateTo,
  });

  res.json(data);
}));

module.exports = router;
