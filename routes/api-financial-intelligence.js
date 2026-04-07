const express = require('express');
const multer = require('multer');
const router = express.Router();
const RampService = require('../services/ramp-service');
const PayrollService = require('../services/payroll-service');
const StripeFinancialService = require('../services/stripe-financial-service');
const EbitdaService = require('../services/ebitda-service');
const FinancialRollupService = require('../services/financial-rollup-service');
const { asyncHandler } = require('../middleware/error-handler');

// Configure multer for CSV uploads
const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 10 * 1024 * 1024 } // 10MB
});

const { getLocationPool: getPool } = require('../utils/pool');

// ============================================================================
// STRIPE ENDPOINTS
// ============================================================================

/**
 * GET /api/financial/stripe/accounts
 * List all Stripe accounts
 */
router.get('/stripe/accounts', asyncHandler(async (req, res) => {
  const pool = getPool(req);
  const result = await pool.query(
    'SELECT id, stripe_account_id, display_name, api_key_env_var, active, created_at, updated_at FROM stripe_accounts ORDER BY display_name'
  );
  res.json(result.rows);
}));

/**
 * POST /api/financial/stripe/accounts
 * Add new Stripe account
 */
router.post('/stripe/accounts', asyncHandler(async (req, res) => {
  const { stripe_account_id, display_name, api_key_env_var, active = true } = req.body;
  const pool = getPool(req);
  
  const result = await pool.query(
    `INSERT INTO stripe_accounts (stripe_account_id, display_name, api_key_env_var, active)
     VALUES ($1, $2, $3, $4)
     RETURNING id, stripe_account_id, display_name, api_key_env_var, active, created_at`,
    [stripe_account_id, display_name, api_key_env_var, active]
  );
  
  res.status(201).json(result.rows[0]);
}));

/**
 * PUT /api/financial/stripe/accounts/:id
 * Update Stripe account
 */
router.put('/stripe/accounts/:id', asyncHandler(async (req, res) => {
  const { id } = req.params;
  const { display_name, api_key_env_var, active } = req.body;
  const pool = getPool(req);
  
  const result = await pool.query(
    `UPDATE stripe_accounts
     SET display_name = COALESCE($1, display_name),
         api_key_env_var = COALESCE($2, api_key_env_var),
         active = COALESCE($3, active),
         updated_at = NOW()
     WHERE id = $4
     RETURNING id, stripe_account_id, display_name, api_key_env_var, active, updated_at`,
    [display_name, api_key_env_var, active, id]
  );
  
  if (result.rows.length === 0) {
    return res.status(404).json({ error: 'Stripe account not found' });
  }
  
  res.json(result.rows[0]);
}));

/**
 * POST /api/financial/stripe/sync/:accountId
 * Manual sync for a specific Stripe account
 */
router.post('/stripe/sync/:accountId', asyncHandler(async (req, res) => {
  const { accountId } = req.params;
  const pool = getPool(req);
  const service = new StripeFinancialService(pool);
  
  const result = await service.syncAccountTransactions(parseInt(accountId));
  res.json(result);
}));

/**
 * GET /api/financial/stripe/revenue
 * Get revenue (query: accountId, startDate, endDate, combined)
 */
router.get('/stripe/revenue', asyncHandler(async (req, res) => {
  const { accountId, startDate, endDate, combined } = req.query;
  const pool = getPool(req);
  const service = new StripeFinancialService(pool);
  
  if (combined === 'true') {
    const revenue = await service.getCombinedRevenue(startDate, endDate);
    res.json(revenue);
  } else if (accountId) {
    const revenue = await service.getAccountRevenue(parseInt(accountId), startDate, endDate);
    res.json(revenue);
  } else {
    res.status(400).json({ error: 'Either accountId or combined=true required' });
  }
}));

// ============================================================================
// RAMP ENDPOINTS
// ============================================================================

/**
 * POST /api/financial/ramp/sync
 * Trigger full Ramp sync
 */
router.post('/ramp/sync', asyncHandler(async (req, res) => {
  const pool = getPool(req);
  const clientId = process.env.RAMP_CLIENT_ID;
  const clientSecret = process.env.RAMP_CLIENT_SECRET;

  if (!clientId || !clientSecret) {
    return res.status(500).json({ error: 'RAMP_CLIENT_ID and RAMP_CLIENT_SECRET must be configured' });
  }

  const service = new RampService(clientId, clientSecret, pool);
  
  // Sync all data
  const [transactions, vendors, categories, cards, reimbursements] = await Promise.all([
    service.syncAllTransactions(),
    service.syncVendors(),
    service.syncCategories(),
    service.syncCards(),
    service.syncReimbursements()
  ]);
  
  // Detect outliers
  const outliers = await service.detectReimbursementOutliers();
  
  res.json({
    transactions,
    vendors,
    categories,
    cards,
    reimbursements,
    outliers
  });
}));

/**
 * GET /api/financial/ramp/transactions
 * Get transactions (query: startDate, endDate, category)
 */
router.get('/ramp/transactions', asyncHandler(async (req, res) => {
  const { startDate, endDate, category } = req.query;
  const pool = getPool(req);
  
  let query = 'SELECT * FROM ramp_transactions WHERE 1=1';
  const params = [];
  let paramCount = 1;
  
  if (startDate) {
    query += ` AND transaction_date >= $${paramCount++}`;
    params.push(startDate);
  }
  if (endDate) {
    query += ` AND transaction_date <= $${paramCount++}`;
    params.push(endDate);
  }
  if (category) {
    query += ` AND category = $${paramCount++}`;
    params.push(category);
  }
  
  query += ' ORDER BY transaction_date DESC LIMIT 1000';
  
  const result = await pool.query(query, params);
  res.json(result.rows);
}));

/**
 * GET /api/financial/ramp/vendors
 * Get vendors
 */
router.get('/ramp/vendors', asyncHandler(async (req, res) => {
  const pool = getPool(req);
  const result = await pool.query('SELECT * FROM ramp_vendors ORDER BY name');
  res.json(result.rows);
}));

/**
 * GET /api/financial/ramp/reimbursements
 * Get reimbursements (query: outlierOnly)
 */
router.get('/ramp/reimbursements', asyncHandler(async (req, res) => {
  const { outlierOnly } = req.query;
  const pool = getPool(req);
  
  let query = 'SELECT * FROM ramp_reimbursements';
  if (outlierOnly === 'true') {
    query += ' WHERE is_outlier = TRUE';
  }
  query += ' ORDER BY receipt_date DESC LIMIT 500';
  
  const result = await pool.query(query);
  res.json(result.rows);
}));

/**
 * GET /api/financial/ramp/monthly-aggregates
 * Get monthly aggregates
 */
router.get('/ramp/monthly-aggregates', asyncHandler(async (req, res) => {
  const { startDate, endDate } = req.query;
  const pool = getPool(req);
  const clientId = process.env.RAMP_CLIENT_ID;
  const clientSecret = process.env.RAMP_CLIENT_SECRET;

  if (!clientId || !clientSecret) {
    return res.status(500).json({ error: 'RAMP_CLIENT_ID and RAMP_CLIENT_SECRET must be configured' });
  }

  const service = new RampService(clientId, clientSecret, pool);
  const aggregates = await service.getMonthlyAggregates(startDate, endDate);
  res.json(aggregates);
}));

// ============================================================================
// PAYROLL ENDPOINTS
// ============================================================================

/**
 * POST /api/financial/payroll/upload
 * Upload payroll CSV
 */
router.post('/payroll/upload', upload.single('file'), asyncHandler(async (req, res) => {
  if (!req.file) {
    return res.status(400).json({ error: 'No file uploaded' });
  }
  
  const { providerId } = req.body;
  const uploadedBy = req.user?.email || req.user?.name || 'unknown';
  const pool = getPool(req);
  const service = new PayrollService(pool);
  
  const result = await service.uploadPayroll(req.file, parseInt(providerId), uploadedBy);
  res.json(result);
}));

/**
 * GET /api/financial/payroll/providers
 * List providers
 */
router.get('/payroll/providers', asyncHandler(async (req, res) => {
  const pool = getPool(req);
  const result = await pool.query('SELECT * FROM payroll_providers ORDER BY name');
  res.json(result.rows);
}));

/**
 * GET /api/financial/payroll/monthly
 * Get monthly payroll (query: startDate, endDate)
 */
router.get('/payroll/monthly', asyncHandler(async (req, res) => {
  const { startDate, endDate } = req.query;
  const pool = getPool(req);
  const service = new PayrollService(pool);
  
  const payroll = await service.getMonthlyPayroll(startDate, endDate);
  res.json(payroll);
}));

// ============================================================================
// EBITDA ENDPOINTS
// ============================================================================

/**
 * GET /api/financial/ebitda
 * Get EBITDA (query: startDate, endDate, stripeAccountId)
 */
router.get('/ebitda', asyncHandler(async (req, res) => {
  const { startDate, endDate, stripeAccountId } = req.query;
  const pool = getPool(req);
  const service = new EbitdaService(pool);
  
  const accountId = stripeAccountId ? parseInt(stripeAccountId) : null;
  const ebitda = await service.computeEbitdaForPeriod(startDate, endDate, accountId);
  res.json(ebitda);
}));

/**
 * PUT /api/financial/ebitda/category-mapping
 * Update category mapping
 */
router.put('/ebitda/category-mapping', asyncHandler(async (req, res) => {
  const { rampCategory, ebitdaCategory } = req.body;
  const userId = req.user?.email || req.user?.name || 'unknown';
  const pool = getPool(req);
  const service = new EbitdaService(pool);
  
  const result = await service.updateCategoryMapping(rampCategory, ebitdaCategory, userId);
  res.json(result);
}));

/**
 * PUT /api/financial/ebitda/vendor-override
 * Update vendor override
 */
router.put('/ebitda/vendor-override', asyncHandler(async (req, res) => {
  const { vendorName, ebitdaCategory } = req.body;
  const userId = req.user?.email || req.user?.name || 'unknown';
  const pool = getPool(req);
  const service = new EbitdaService(pool);
  
  const result = await service.updateVendorOverride(vendorName, ebitdaCategory, userId);
  res.json(result);
}));

// ============================================================================
// ROLLUP ENDPOINTS
// ============================================================================

/**
 * GET /api/financial/rollups/monthly
 * Get monthly rollups (query: startDate, endDate, stripeAccountId)
 */
router.get('/rollups/monthly', asyncHandler(async (req, res) => {
  const { startDate, endDate, stripeAccountId } = req.query;
  const pool = getPool(req);
  
  let query = `
    SELECT mfr.*, sa.display_name AS account_name
    FROM monthly_financial_rollups mfr
    LEFT JOIN stripe_accounts sa ON mfr.stripe_account_id = sa.id
    WHERE period_month >= $1 AND period_month <= $2
  `;
  const params = [startDate, endDate];
  
  if (stripeAccountId) {
    query += ` AND mfr.stripe_account_id = $3`;
    params.push(parseInt(stripeAccountId));
  }
  
  query += ' ORDER BY period_month DESC, sa.display_name';
  
  const result = await pool.query(query, params);
  res.json(result.rows);
}));

/**
 * POST /api/financial/rollups/compute
 * Trigger rollup computation
 */
router.post('/rollups/compute', asyncHandler(async (req, res) => {
  const { startDate, endDate } = req.body;
  const pool = getPool(req);
  const service = new FinancialRollupService(pool);
  
  const results = await service.computeAllRollups(startDate, endDate);
  res.json({ computed: results.length, results });
}));

// ============================================================================
// SIMULATOR ENDPOINT
// ============================================================================

/**
 * POST /api/financial/simulator
 * Run "what if" simulation
 */
router.post('/simulator', asyncHandler(async (req, res) => {
  const { vendorReductions = {}, categoryReductions = {}, payrollAdjustment = 0, stripeAccountId } = req.body;
  const { startDate, endDate } = req.query;
  const pool = getPool(req);
  
  // Get base revenue
  const stripeService = new StripeFinancialService(pool);
  let revenue;
  if (stripeAccountId) {
    const revenueData = await stripeService.getAccountRevenue(parseInt(stripeAccountId), startDate, endDate);
    revenue = revenueData.reduce((sum, r) => sum + parseFloat(r.net_revenue || 0), 0);
  } else {
    const revenueData = await stripeService.getCombinedRevenue(startDate, endDate);
    revenue = revenueData.reduce((sum, r) => sum + parseFloat(r.net_revenue || 0), 0);
  }
  
  // Get base expenses
  const rampResult = await pool.query(
    `SELECT SUM(amount) AS total FROM ramp_transactions
     WHERE state = 'SETTLED' AND transaction_date >= $1 AND transaction_date <= $2`,
    [startDate, endDate]
  );
  let rampSpend = parseFloat(rampResult.rows[0]?.total || 0);
  
  // Apply vendor reductions
  for (const [vendor, reduction] of Object.entries(vendorReductions)) {
    const vendorSpend = await pool.query(
      `SELECT SUM(amount) AS total FROM ramp_transactions
       WHERE merchant_name = $1 AND state = 'SETTLED' AND transaction_date >= $2 AND transaction_date <= $3`,
      [vendor, startDate, endDate]
    );
    const reductionAmount = parseFloat(vendorSpend.rows[0]?.total || 0) * (reduction / 100);
    rampSpend -= reductionAmount;
  }
  
  // Apply category reductions
  for (const [category, reduction] of Object.entries(categoryReductions)) {
    const categorySpend = await pool.query(
      `SELECT SUM(amount) AS total FROM ramp_transactions
       WHERE category = $1 AND state = 'SETTLED' AND transaction_date >= $2 AND transaction_date <= $3`,
      [category, startDate, endDate]
    );
    const reductionAmount = parseFloat(categorySpend.rows[0]?.total || 0) * (reduction / 100);
    rampSpend -= reductionAmount;
  }
  
  // Get base payroll
  const payrollResult = await pool.query(
    `SELECT SUM(total_payroll_cost) AS total FROM payroll_periods
     WHERE pay_period_date >= $1 AND pay_period_date <= $2`,
    [startDate, endDate]
  );
  const payroll = parseFloat(payrollResult.rows[0]?.total || 0) + parseFloat(payrollAdjustment || 0);
  
  const monthlyBurn = rampSpend + payroll - revenue;
  const ebitda = revenue - rampSpend - payroll;
  const ebitdaMargin = revenue > 0 ? (ebitda / revenue) * 100 : 0;
  
  // Placeholder runway estimate (requires bank balance data)
  const runwayEstimate = null;
  
  res.json({
    monthlyBurn,
    ebitda,
    ebitdaMargin,
    runwayEstimate,
    revenue,
    expenses: rampSpend + payroll,
    rampSpend,
    payroll
  });
}));

// ============================================================================
// EXECUTIVE SNAPSHOT ENDPOINT
// ============================================================================

/**
 * GET /api/financial/snapshot
 * Get MTD snapshot (query: stripeAccountId)
 */
router.get('/snapshot', asyncHandler(async (req, res) => {
  const { stripeAccountId } = req.query;
  const pool = getPool(req);
  
  const now = new Date();
  const monthStart = new Date(now.getFullYear(), now.getMonth(), 1);
  const startDate = monthStart.toISOString().split('T')[0];
  const endDate = now.toISOString().split('T')[0];
  
  // Get MTD revenue
  const stripeService = new StripeFinancialService(pool);
  let revenueData;
  if (stripeAccountId) {
    revenueData = await stripeService.getAccountRevenue(parseInt(stripeAccountId), startDate, endDate);
  } else {
    revenueData = await stripeService.getCombinedRevenue(startDate, endDate);
  }
  const mtdRevenue = revenueData.reduce((sum, r) => sum + parseFloat(r.net_revenue || 0), 0);
  
  // Get MTD spend
  const rampResult = await pool.query(
    `SELECT SUM(amount) AS total FROM ramp_transactions
     WHERE state = 'SETTLED' AND transaction_date >= $1 AND transaction_date <= $2`,
    [startDate, endDate]
  );
  const mtdSpend = parseFloat(rampResult.rows[0]?.total || 0);
  
  // Get net burn
  const netBurn = mtdSpend - mtdRevenue;
  
  // Get rolling 3-month burn
  const threeMonthsAgo = new Date(now.getFullYear(), now.getMonth() - 3, 1);
  const threeMonthStart = threeMonthsAgo.toISOString().split('T')[0];
  const ramp3Month = await pool.query(
    `SELECT SUM(amount) AS total FROM ramp_transactions
     WHERE state = 'SETTLED' AND transaction_date >= $1 AND transaction_date <= $2`,
    [threeMonthStart, endDate]
  );
  const revenue3Month = await (stripeAccountId 
    ? stripeService.getAccountRevenue(parseInt(stripeAccountId), threeMonthStart, endDate)
    : stripeService.getCombinedRevenue(threeMonthStart, endDate));
  const totalRevenue3Month = revenue3Month.reduce((sum, r) => sum + parseFloat(r.net_revenue || 0), 0);
  const rolling3MonthBurn = parseFloat(ramp3Month.rows[0]?.total || 0) - totalRevenue3Month;
  
  // Get top cost category
  const topCategory = await pool.query(
    `SELECT category, SUM(amount) AS total
     FROM ramp_transactions
     WHERE state = 'SETTLED' AND transaction_date >= $1 AND transaction_date <= $2
     GROUP BY category
     ORDER BY total DESC
     LIMIT 1`,
    [startDate, endDate]
  );
  
  // Get top vendor
  const topVendor = await pool.query(
    `SELECT merchant_name, SUM(amount) AS total
     FROM ramp_transactions
     WHERE state = 'SETTLED' AND transaction_date >= $1 AND transaction_date <= $2
     GROUP BY merchant_name
     ORDER BY total DESC
     LIMIT 1`,
    [startDate, endDate]
  );
  
  res.json({
    mtdRevenue,
    mtdSpend,
    netBurn,
    rolling3MonthBurn,
    topCostCategory: topCategory.rows[0] || null,
    topVendor: topVendor.rows[0] || null
  });
}));

// ============================================================================
// INVESTOR SUMMARY ENDPOINT
// ============================================================================

/**
 * GET /api/financial/investor-summary
 * Get investor-grade summary (query: startDate, endDate)
 */
router.get('/investor-summary', asyncHandler(async (req, res) => {
  const { startDate, endDate } = req.query;
  const pool = getPool(req);
  const stripeService = new StripeFinancialService(pool);
  const ebitdaService = new EbitdaService(pool);
  
  // Get revenue by account
  const accountsResult = await pool.query('SELECT id, display_name FROM stripe_accounts WHERE active = TRUE');
  const revenueByAccount = [];
  
  for (const account of accountsResult.rows) {
    const revenue = await stripeService.getAccountRevenue(account.id, startDate, endDate);
    const totalRevenue = revenue.reduce((sum, r) => sum + parseFloat(r.net_revenue || 0), 0);
    revenueByAccount.push({
      accountId: account.id,
      accountName: account.display_name,
      revenue: totalRevenue
    });
  }
  
  // Get combined revenue
  const combinedRevenue = await stripeService.getCombinedRevenue(startDate, endDate);
  const totalCombinedRevenue = combinedRevenue.reduce((sum, r) => sum + parseFloat(r.net_revenue || 0), 0);
  
  // Get EBITDA
  const ebitda = await ebitdaService.computeEbitdaForPeriod(startDate, endDate);
  
  // Get monthly rollups for burn trend
  const rollupsResult = await pool.query(
    `SELECT period_month, net_burn, ebitda_proxy, ebitda_margin
     FROM monthly_financial_rollups
     WHERE stripe_account_id IS NULL
       AND period_month >= $1 AND period_month <= $2
     ORDER BY period_month ASC`,
    [startDate, endDate]
  );
  
  // Get payroll as % of revenue
  const payrollResult = await pool.query(
    `SELECT SUM(total_payroll_cost) AS total FROM payroll_periods
     WHERE pay_period_date >= $1 AND pay_period_date <= $2`,
    [startDate, endDate]
  );
  const totalPayroll = parseFloat(payrollResult.rows[0]?.total || 0);
  const payrollAsPercentOfRevenue = totalCombinedRevenue > 0 ? (totalPayroll / totalCombinedRevenue) * 100 : 0;
  
  res.json({
    revenueByAccount,
    combinedRevenue: totalCombinedRevenue,
    ebitda: ebitda.ebitda,
    ebitdaMargin: ebitda.ebitdaMargin,
    burnTrend: rollupsResult.rows,
    payrollAsPercentOfRevenue,
    period: { startDate, endDate }
  });
}));

module.exports = router;
