const express = require('express');
const router = express.Router();
const ForecastService = require('../services/forecast-service');
const { asyncHandler } = require('../middleware/error-handler');
const { logger } = require('../utils/logger');

// Initialize service with dependency injection
// Pool is injected via req.locationPool middleware
function getForecastService(req) {
  const pool = req.locationPool || req.pool;
  if (!pool) {
    throw new Error('Database pool not available');
  }
  return new ForecastService(pool);
}

/**
 * POST /api/forecast/run
 * Trigger forecast training and generation
 */
router.post('/run', asyncHandler(async (req, res) => {
  const { horizonDays = 90, segment } = req.body;
  const service = getForecastService(req);
  const result = await service.runForecast(horizonDays, segment);
  res.json(result);
}));

/**
 * GET /api/forecast/current
 * Get current forecast (latest run) with metrics
 */
router.get('/current', asyncHandler(async (req, res) => {
  try {
    const { segment, market, lesson_type } = req.query;
    const service = getForecastService(req);
    const result = await service.getCurrentForecast(segment, market, lesson_type);
    res.json(result);
  } catch (error) {
    // If service creation fails or any other error, return empty forecast
    logger.error({ error: error.message }, 'Forecast endpoint error:');
    res.json({
      run_id: null,
      run_at: null,
      metrics: { mape: 0, wape: 0, coverage_p80: 0 },
      blend_weight: 0.7,
      forecasts: []
    });
  }
}));

/**
 * GET /api/forecast/drilldown
 * Get drilldown for a specific forecast date
 */
router.get('/drilldown', asyncHandler(async (req, res) => {
  const { date, segment, market, lesson_type } = req.query;
  const service = getForecastService(req);
  const result = await service.getDrilldown(date, segment, market, lesson_type);
  res.json(result);
}));

/**
 * GET /api/forecast/training/status
 * Check if training is currently running
 */
router.get('/training/status', asyncHandler(async (req, res) => {
  const service = getForecastService(req);
  const result = await service.getTrainingStatus();
  res.json(result);
}));

/**
 * GET /api/forecast/actuals
 * Get historical actuals (last 6 months) for chart overlay
 */
router.get('/actuals', asyncHandler(async (req, res) => {
  const { market, lesson_type } = req.query;
  const service = getForecastService(req);
  const result = await service.getActuals(market, lesson_type);
  res.json(result);
}));

// ==========================================================================
// ENHANCED FORECAST ENDPOINTS
// ==========================================================================

/**
 * GET /api/forecast/scenarios
 * Get both optimistic (100%) and realistic (historical rate) forecast scenarios
 * Main endpoint for the forecast dashboard
 */
router.get('/scenarios', asyncHandler(async (req, res) => {
  const { start_date, end_date, channel, market, tutor_label } = req.query;
  const service = getForecastService(req);
  const result = await service.getScenarios({
    startDate: start_date,
    endDate: end_date,
    channel: channel || null,
    market: market || null,
    tutorLabel: tutor_label || null
  });
  res.json(result);
}));

/**
 * GET /api/forecast/scheduled
 * DISABLED - This endpoint returned individual lesson objects causing memory exhaustion.
 * Use /api/forecast/drilldown-list for paginated data or /api/forecast/scenarios for aggregates.
 */
router.get('/scheduled', (req, res) => {
  res.status(410).json({
    error: 'This endpoint has been disabled due to memory constraints.',
    alternative: 'Use /api/forecast/drilldown-list for paginated data or /api/forecast/scenarios for aggregated data.'
  });
});

/**
 * GET /api/forecast/projected
 * DISABLED - This endpoint returned individual lesson objects causing memory exhaustion.
 * Use /api/forecast/scenarios for aggregated data instead.
 */
router.get('/projected', (req, res) => {
  res.status(410).json({
    error: 'This endpoint has been disabled due to memory constraints.',
    alternative: 'Use /api/forecast/scenarios for aggregated forecast data.'
  });
});

/**
 * GET /api/forecast/drilldown/:date
 * Get drilldown for a specific date showing scheduled vs projected lessons
 */
router.get('/drilldown/:date', asyncHandler(async (req, res) => {
  const { date } = req.params;
  const { channel, market } = req.query;
  const service = getForecastService(req);
  const result = await service.getForecastDrilldown({
    date,
    channel: channel || null,
    market: market || null
  });
  res.json(result);
}));

/**
 * GET /api/forecast/drilldown-list
 * Get paginated list of lessons for drilldown modal
 * Returns scheduled lessons with server-side pagination to avoid memory issues
 * Supports search by job name, tutor name, or appointment ID
 */
router.get('/drilldown-list', asyncHandler(async (req, res) => {
  const { start_date, end_date, channel, market, tutor_label, page = '0', limit = '100', search, include_completed } = req.query;
  const service = getForecastService(req);
  const result = await service.getDrilldownList({
    startDate: start_date,
    endDate: end_date,
    channel: channel || null,
    market: market || null,
    tutorLabel: tutor_label || null,
    page: parseInt(page, 10),
    limit: Math.min(parseInt(limit, 10), 500), // Cap at 500 to prevent abuse
    search: search || null,
    includeCompleted: include_completed === 'true'
  });
  res.json(result);
}));

/**
 * POST /api/forecast/compute-patterns
 * Recalculate job lesson patterns (admin action)
 */
router.post('/compute-patterns', asyncHandler(async (req, res) => {
  const service = getForecastService(req);
  const result = await service.computeJobPatterns();
  res.json(result);
}));

/**
 * GET /api/forecast/completion-rates
 * Without dimension param: returns 3-tier rates for scenario info bar
 * With dimension param: returns breakdown by dimension for deep dive modal
 */
router.get('/completion-rates', asyncHandler(async (req, res) => {
  const { dimension, lookback_days, min_appointments } = req.query;
  const service = getForecastService(req);

  // If dimension is provided, use the deep dive handler
  if (dimension) {
    const result = await service.getCompletionRatesByDimension({
      dimension,
      lookbackDays: parseInt(lookback_days) || 90,
      minAppointments: parseInt(min_appointments) || 10
    });
    return res.json(result);
  }

  // Default: return 3-tier rates for scenario info bar
  const result = await service.getHistoricalCompletionRates();
  res.json({ rates: result });
}));

/**
 * GET /api/forecast/pattern-insights
 * Get pattern insights showing which jobs are projecting lessons
 * Used by the Projected drilldown in the forecast dashboard
 */
router.get('/pattern-insights', asyncHandler(async (req, res) => {
  const { start_date, end_date, channel, market } = req.query;
  const service = getForecastService(req);
  const result = await service.getPatternInsights({
    startDate: start_date,
    endDate: end_date,
    channel: channel || null,
    market: market || null
  });
  res.json(result);
}));

// ==========================================================================
// HISTORICAL KPI ENDPOINTS (For Executive Summary Modals)
// ==========================================================================

/**
 * GET /api/forecast/historical-kpis
 * Get historical KPI data aggregated by week for executive summary charts
 * Returns last 3 months actuals + next 3 months forecast + targets
 */
router.get('/historical-kpis', asyncHandler(async (req, res) => {
  const { lookback_months = 3, forecast_months = 3, channel, metric, period_start, period_end } = req.query;
  const service = getForecastService(req);
  const result = await service.getHistoricalKPIs({
    lookbackMonths: parseInt(lookback_months),
    forecastMonths: parseInt(forecast_months),
    channel: channel || null,
    metric: metric || 'all',
    periodStart: period_start || null,
    periodEnd: period_end || null,
  });
  res.json(result);
}));

/**
 * GET /api/forecast/monthly-kpi-trend
 * Get monthly KPI trend for a specific metric
 * Simpler endpoint for single-metric charts
 */
router.get('/monthly-kpi-trend', asyncHandler(async (req, res) => {
  const { metric, channel, lookback_months = 6 } = req.query;

  if (!metric) {
    return res.status(400).json({
      error: 'metric parameter is required',
      valid_metrics: ['lessons', 'hours', 'revenue', 'tutor_pay', 'profit', 'students', 'tutors']
    });
  }

  const service = getForecastService(req);
  const result = await service.getMonthlyKPITrend({
    metric,
    channel: channel || null,
    lookbackMonths: parseInt(lookback_months)
  });
  res.json(result);
}));

// ==========================================================================
// STALE JOBS ENDPOINTS
// ==========================================================================

/**
 * GET /api/forecast/stale-jobs
 * Get jobs marked "in progress" with no lessons in 45+ days
 */
router.get('/stale-jobs', asyncHandler(async (req, res) => {
  const { channel, market } = req.query;
  const service = getForecastService(req);
  const result = await service.getStaleJobs({
    channel: channel || null,
    market: market || null
  });
  res.json(result);
}));

// ==========================================================================
// TARGETS CRUD ENDPOINTS
// ==========================================================================

/**
 * GET /api/forecast/targets
 * Get all forecast targets for the current year (or specified year)
 */
router.get('/targets', asyncHandler(async (req, res) => {
  const { year } = req.query;
  const service = getForecastService(req);
  const result = await service.getTargets({
    year: year ? parseInt(year) : null
  });
  res.json({ targets: result });
}));

/**
 * POST /api/forecast/targets
 * Create a new target
 */
router.post('/targets', asyncHandler(async (req, res) => {
  const { target_type, channel, market, target_value, quarter, year } = req.body;

  // Validation
  if (!target_type || !target_value || !year) {
    return res.status(400).json({ error: 'target_type, target_value, and year are required' });
  }

  const service = getForecastService(req);
  const result = await service.createTarget({
    target_type,
    channel: channel || null,
    market: market || null,
    target_value: parseFloat(target_value),
    quarter: quarter ? parseInt(quarter) : null,
    year: parseInt(year),
    created_by: req.user?.email || 'admin'
  });
  res.json(result);
}));

/**
 * PUT /api/forecast/targets/:id
 * Update an existing target
 */
router.put('/targets/:id', asyncHandler(async (req, res) => {
  const { id } = req.params;
  const { target_value, effective_to } = req.body;

  const service = getForecastService(req);
  const result = await service.updateTarget(parseInt(id), {
    target_value: target_value !== undefined ? parseFloat(target_value) : undefined,
    effective_to: effective_to || undefined
  });

  if (!result) {
    return res.status(404).json({ error: 'Target not found' });
  }
  res.json(result);
}));

/**
 * DELETE /api/forecast/targets/:id
 * Delete a target
 */
router.delete('/targets/:id', asyncHandler(async (req, res) => {
  const { id } = req.params;
  const service = getForecastService(req);
  const result = await service.deleteTarget(parseInt(id));

  if (!result) {
    return res.status(404).json({ error: 'Target not found' });
  }
  res.json({ deleted: true, target: result });
}));

// ==========================================================================
// QUARTERLY TARGET PLANNING ENDPOINTS
// ==========================================================================

/**
 * GET /api/forecast/targets/quarterly
 * Get quarterly targets with derived metrics for current + next 3 quarters
 */
router.get('/targets/quarterly', asyncHandler(async (req, res) => {
  const service = getForecastService(req);
  const result = await service.getQuarterlyTargets();
  res.json(result);
}));

/**
 * POST /api/forecast/targets/quarterly
 * Save a quarterly revenue target with auto-derived weekly breakdowns
 */
router.post('/targets/quarterly', asyncHandler(async (req, res) => {
  const { year, quarter, revenue, margin_percent, channel_mix } = req.body;

  if (!year || !quarter || revenue === undefined) {
    return res.status(400).json({
      error: 'year, quarter, and revenue are required'
    });
  }

  const service = getForecastService(req);
  const result = await service.saveQuarterlyTargets({
    year: parseInt(year),
    quarter: parseInt(quarter),
    revenue: parseFloat(revenue),
    margin_percent: margin_percent !== undefined ? parseInt(margin_percent) : 50,
    channel_mix: channel_mix || null,
    created_by: req.user?.email || 'system'
  });

  res.json(result);
}));

/**
 * GET /api/forecast/historical-averages
 * Get historical averages for target planning (avg revenue per lesson, channel mix)
 */
router.get('/historical-averages', asyncHandler(async (req, res) => {
  const { lookback_months = 6 } = req.query;
  const service = getForecastService(req);
  const result = await service.getHistoricalAverages({
    lookbackMonths: parseInt(lookback_months)
  });
  res.json(result);
}));

// ==========================================================================
// COMPLETION RATE ANALYTICS ENDPOINTS
// ==========================================================================

// NOTE: completion-rates GET handler is defined above (merged simple + dimension modes)

/**
 * GET /api/forecast/completion-rates/trend
 * Get completion rate trend over time for a specific dimension
 */
router.get('/completion-rates/trend', asyncHandler(async (req, res) => {
  const { dimension = 'channel', dimension_value, granularity = 'week', lookback_days = 90 } = req.query;
  const service = getForecastService(req);
  const result = await service.getCompletionRateTrend({
    dimension,
    dimensionValue: dimension_value || null,
    granularity,
    lookbackDays: parseInt(lookback_days)
  });
  res.json(result);
}));

/**
 * GET /api/forecast/completion-rates/anomalies/computed
 * Compute anomalies on-the-fly from weekly trend data (no DB tables needed)
 */
router.get('/completion-rates/anomalies/computed', asyncHandler(async (req, res) => {
  const { dimension = 'channel', dimension_value, lookback_days = 180 } = req.query;
  const service = getForecastService(req);
  const result = await service.computeCompletionRateAnomalies({
    dimension,
    dimensionValue: dimension_value || null,
    lookbackDays: Math.max(parseInt(lookback_days) || 180, 180),
  });
  res.json(result);
}));

/**
 * GET /api/forecast/completion-rates/holidays
 * Get combined holiday calendar with past completion rate impact and forward-looking dates.
 * Used by the Holidays tab in the Completion Rates Deep Dive modal.
 */
router.get('/completion-rates/holidays', asyncHandler(async (req, res) => {
  const { lookback_days = 365, forward_days = 365 } = req.query;
  const { getUSPublicHolidays, getMarketSchoolBreaks, getUSHolidayRanges, checkWeekOverlapsHoliday } = require('../utils/us-holidays');

  const now = new Date();
  const lookbackMs = parseInt(lookback_days) * 24 * 60 * 60 * 1000;
  const forwardMs = parseInt(forward_days) * 24 * 60 * 60 * 1000;
  const rangeStart = new Date(now.getTime() - lookbackMs);
  const rangeEnd = new Date(now.getTime() + forwardMs);

  // Collect years we need
  const years = new Set();
  for (let y = rangeStart.getUTCFullYear(); y <= rangeEnd.getUTCFullYear(); y++) {
    years.add(y);
  }

  // Build all holidays
  const allPublicHolidays = [];
  const allSchoolBreaks = [];
  const allBroadRanges = [];

  for (const yr of years) {
    for (const h of getUSPublicHolidays(yr)) {
      if (h.date >= rangeStart && h.date <= rangeEnd) {
        allPublicHolidays.push({
          name: h.name,
          date: h.date.toISOString().slice(0, 10),
          type: h.type,
          is_past: h.date < now,
        });
      }
    }
    for (const b of getMarketSchoolBreaks(yr, 'all')) {
      const bEnd = b.end || b.start;
      if (bEnd >= rangeStart && b.start <= rangeEnd) {
        allSchoolBreaks.push({
          name: b.name,
          start: b.start.toISOString().slice(0, 10),
          end: bEnd.toISOString().slice(0, 10),
          market: b.market,
          type: b.type,
          is_past: bEnd < now,
        });
      }
    }
    allBroadRanges.push(...getUSHolidayRanges(yr));
  }

  // Get past completion rate impact for holiday weeks
  let holidayImpact = [];
  try {
    const service = getForecastService(req);
    const trendResult = await service.getCompletionRateTrend({
      dimension: 'channel',
      dimensionValue: null,
      granularity: 'week',
      lookbackDays: parseInt(lookback_days),
    });

    const trendData = trendResult.trend_data || [];
    if (trendData.length >= 6) {
      // Compute rolling average for context
      const WINDOW = 4;
      for (let i = WINDOW; i < trendData.length; i++) {
        const point = trendData[i];
        const window = trendData.slice(i - WINDOW, i).map(d => d.completion_rate);
        const rollingAvg = window.reduce((a, b) => a + b, 0) / window.length;

        const periodISO = typeof point.period_start === 'string'
          ? point.period_start.slice(0, 10)
          : new Date(point.period_start).toISOString().slice(0, 10);
        const { isHoliday, holidayName } = checkWeekOverlapsHoliday(periodISO, allBroadRanges);

        if (isHoliday) {
          holidayImpact.push({
            week_start: periodISO,
            holiday_name: holidayName,
            completion_rate: point.completion_rate,
            expected_rate: rollingAvg,
            deviation_pp: parseFloat(((point.completion_rate - rollingAvg) * 100).toFixed(1)),
            appointments_total: point.appointments_total,
            appointments_completed: point.appointments_completed || 0,
            appointments_cancelled: point.appointments_cancelled || 0,
            revenue_lost: point.revenue_lost || 0,
          });
        }
      }
    }
  } catch (err) {
    // Non-critical — return holidays without impact data
    const { logger } = require('../utils/logger');
    logger.warn({ err: err.message }, 'Failed to compute holiday impact data');
  }

  res.json({
    public_holidays: allPublicHolidays,
    school_breaks: allSchoolBreaks,
    holiday_impact: holidayImpact,
    markets: ['NYC', 'LA', 'SF'],
  });
}));

/**
 * POST /api/forecast/completion-rates/impact
 * Calculate revenue impact of improving completion rate
 */
router.post('/completion-rates/impact', asyncHandler(async (req, res) => {
  const { dimension, dimension_value, current_rate, target_rate, lookback_days = 90 } = req.body;

  if (!dimension || !dimension_value || current_rate === undefined || target_rate === undefined) {
    return res.status(400).json({
      error: 'dimension, dimension_value, current_rate, and target_rate are required'
    });
  }

  const service = getForecastService(req);
  const result = await service.calculateCompletionRateImpact({
    dimension,
    dimensionValue: dimension_value,
    currentRate: parseFloat(current_rate),
    targetRate: parseFloat(target_rate),
    lookbackDays: parseInt(lookback_days)
  });
  res.json(result);
}));

/**
 * POST /api/forecast/completion-rates/compute-snapshots
 * Manually trigger daily snapshot computation (admin only)
 */
router.post('/completion-rates/compute-snapshots', asyncHandler(async (req, res) => {
  const service = getForecastService(req);
  const result = await service.computeDailySnapshots();
  res.json(result);
}));

/**
 * GET /api/forecast/completion-rates/anomalies
 * Get open anomalies for review
 */
router.get('/completion-rates/anomalies', asyncHandler(async (req, res) => {
  const { dimension_type, severity, limit = 50, offset = 0 } = req.query;
  const service = getForecastService(req);
  const result = await service.getOpenAnomalies({
    dimensionType: dimension_type || null,
    severity: severity || null,
    limit: parseInt(limit),
    offset: parseInt(offset),
  });
  res.json(result);
}));

/**
 * GET /api/forecast/completion-rates/anomalies/stats
 * Get anomaly statistics summary
 */
router.get('/completion-rates/anomalies/stats', asyncHandler(async (req, res) => {
  const service = getForecastService(req);
  const result = await service.getAnomalyStats();
  res.json(result);
}));

/**
 * POST /api/forecast/completion-rates/anomalies/detect
 * Manually trigger anomaly detection (admin only)
 */
router.post('/completion-rates/anomalies/detect', asyncHandler(async (req, res) => {
  const { lookback_days = 30 } = req.body;
  const service = getForecastService(req);
  const result = await service.detectAndStoreAnomalies({
    lookbackDays: parseInt(lookback_days),
  });
  res.json(result);
}));

/**
 * PATCH /api/forecast/completion-rates/anomalies/:id
 * Update anomaly status (acknowledge, resolve, dismiss)
 */
router.patch('/completion-rates/anomalies/:id', asyncHandler(async (req, res) => {
  const { id } = req.params;
  const { status, notes } = req.body;
  const reviewedBy = req.user?.id || null;

  if (!status) {
    return res.status(400).json({ error: 'status is required' });
  }

  const service = getForecastService(req);
  const result = await service.updateAnomalyStatus({
    anomalyId: parseInt(id),
    status,
    notes,
    reviewedBy,
  });
  res.json(result);
}));

/**
 * GET /api/forecast/completion-rates/thresholds
 * Get anomaly detection thresholds
 */
router.get('/completion-rates/thresholds', asyncHandler(async (req, res) => {
  const service = getForecastService(req);
  const result = await service.getThresholds();
  res.json(result);
}));

// ==========================================================================
// AI ANALYSIS ENDPOINTS
// ==========================================================================

const CompletionRateAIService = require('../services/completion-rate-ai-service');

function getAIService(req) {
  const pool = req.locationPool || req.pool;
  if (!pool) {
    throw new Error('Database pool not available');
  }
  return new CompletionRateAIService(pool);
}

/**
 * GET /api/forecast/completion-rates/ai/status
 * Get AI service status and usage statistics
 */
router.get('/completion-rates/ai/status', asyncHandler(async (req, res) => {
  const aiService = getAIService(req);
  const result = await aiService.getUsageStats();
  res.json(result);
}));

/**
 * POST /api/forecast/completion-rates/ai/analyze-individual
 * Analyze a specific tutor or client completion rate issue
 */
router.post('/completion-rates/ai/analyze-individual', asyncHandler(async (req, res) => {
  const {
    dimension_type,
    dimension_value,
    dimension_display_name,
    current_rate,
    baseline_rate,
    appointments_total,
    revenue_impact
  } = req.body;

  if (!dimension_type || !dimension_value) {
    return res.status(400).json({
      error: 'dimension_type and dimension_value are required'
    });
  }

  const aiService = getAIService(req);

  if (!aiService.isAvailable()) {
    return res.status(503).json({
      error: 'AI service not configured',
      message: 'ANTHROPIC_API_KEY environment variable not set'
    });
  }

  const result = await aiService.analyzeIndividual({
    dimensionType: dimension_type,
    dimensionValue: dimension_value,
    dimensionDisplayName: dimension_display_name,
    currentRate: parseFloat(current_rate),
    baselineRate: parseFloat(baseline_rate),
    appointmentsTotal: parseInt(appointments_total),
    revenueImpact: revenue_impact ? parseFloat(revenue_impact) : null,
    requestedBy: req.user?.id || null
  });

  res.json(result);
}));

/**
 * POST /api/forecast/completion-rates/ai/weekly-summary
 * Generate AI-powered weekly ops summary of anomalies
 */
router.post('/completion-rates/ai/weekly-summary', asyncHandler(async (req, res) => {
  const aiService = getAIService(req);

  if (!aiService.isAvailable()) {
    return res.status(503).json({
      error: 'AI service not configured',
      message: 'ANTHROPIC_API_KEY environment variable not set'
    });
  }

  const result = await aiService.generateWeeklySummary({
    requestedBy: req.user?.id || null
  });

  res.json(result);
}));

/**
 * POST /api/forecast/completion-rates/ai/revenue-opportunities
 * Analyze revenue improvement opportunities
 */
router.post('/completion-rates/ai/revenue-opportunities', asyncHandler(async (req, res) => {
  const aiService = getAIService(req);

  if (!aiService.isAvailable()) {
    return res.status(503).json({
      error: 'AI service not configured',
      message: 'ANTHROPIC_API_KEY environment variable not set'
    });
  }

  const result = await aiService.analyzeRevenueOpportunities({
    requestedBy: req.user?.id || null
  });

  res.json(result);
}));

// ==========================================================================
// EXECUTIVE FORECAST SUMMARY
// ==========================================================================

/**
 * GET /api/forecast/executive-summary
 * Quick-glance forecast for CEO - preset time periods with YoY comparison
 */
router.get('/executive-summary', asyncHandler(async (req, res) => {
  const { preset = 'next-3-weeks', includeYoY = 'true' } = req.query;
  const service = getForecastService(req);
  const { DateTime } = require('luxon');

  const now = DateTime.now().setZone('America/New_York');
  let startDate, endDate, label;

  switch (preset) {
    case 'this-weekend': {
      // Friday through Sunday
      const friday = now.weekday <= 5
        ? now.set({ weekday: 5 }).startOf('day')
        : now.startOf('day'); // already weekend
      const sunday = friday.set({ weekday: 7 }).endOf('day');
      startDate = friday.toISODate();
      endDate = sunday.toISODate();
      label = `This Weekend (${friday.toFormat('MMM d')}-${sunday.toFormat('d')})`;
      break;
    }
    case 'next-week': {
      const nextMon = now.plus({ weeks: 1 }).startOf('week');
      const nextSun = nextMon.endOf('week');
      startDate = nextMon.toISODate();
      endDate = nextSun.toISODate();
      label = `Next Week (${nextMon.toFormat('MMM d')}-${nextSun.toFormat('d')})`;
      break;
    }
    case 'next-3-weeks': {
      const start = now.plus({ days: 1 }).startOf('day');
      const end = now.plus({ weeks: 3 }).endOf('day');
      startDate = start.toISODate();
      endDate = end.toISODate();
      label = `Next 3 Weeks (${start.toFormat('MMM d')}-${end.toFormat('MMM d')})`;
      break;
    }
    case 'rest-of-month': {
      const start = now.plus({ days: 1 }).startOf('day');
      const end = now.endOf('month');
      startDate = start.toISODate();
      endDate = end.toISODate();
      label = `Rest of ${now.toFormat('MMMM')} (${start.toFormat('MMM d')}-${end.toFormat('d')})`;
      break;
    }
    case 'next-3-months': {
      const start = now.plus({ days: 1 }).startOf('day');
      const end = now.plus({ months: 3 }).endOf('month');
      startDate = start.toISODate();
      endDate = end.toISODate();
      label = `Next 3 Months (${start.toFormat('MMM d')}-${end.toFormat('MMM d')})`;
      break;
    }
    case 'rest-of-quarter': {
      const quarterEnd = now.endOf('quarter');
      const start = now.plus({ days: 1 }).startOf('day');
      startDate = start.toISODate();
      endDate = quarterEnd.toISODate();
      const q = Math.ceil(now.month / 3);
      label = `Rest of Q${q} (${start.toFormat('MMM d')}-${quarterEnd.toFormat('MMM d')})`;
      break;
    }
    default: {
      // Custom date range
      startDate = req.query.start_date || now.plus({ days: 1 }).toISODate();
      endDate = req.query.end_date || now.plus({ weeks: 3 }).toISODate();
      label = `${DateTime.fromISO(startDate).toFormat('MMM d')} - ${DateTime.fromISO(endDate).toFormat('MMM d')}`;
    }
  }

  // Fetch forecast data (scheduled appointments in the future period)
  const [scheduledSummary, completionRates] = await Promise.all([
    service.getScheduledSummary({ startDate, endDate }),
    service.getCompletionRatesByDimension({ dimension: 'channel', lookbackDays: 90 })
  ]);

  // Apply completion rates to get realistic forecast per channel
  const channels = ['home', 'digital', 'clubs', 'schools'];
  const byChannel = {};
  let totalRevenue = 0, totalLessons = 0, totalTutorPay = 0;

  for (const ch of channels) {
    const raw = scheduledSummary.byChannel[ch] || { lessons: 0, revenue: 0, tutor_pay: 0 };
    const rate = completionRates.realistic?.[ch] || 0.75;

    const forecastRevenue = Math.round(raw.revenue * rate * 100) / 100;
    const forecastLessons = Math.round(raw.lessons * rate);
    const forecastTutorPay = Math.round(raw.tutor_pay * rate * 100) / 100;
    const forecastProfit = Math.round((forecastRevenue - forecastTutorPay) * 100) / 100;

    byChannel[ch] = {
      forecast: { revenue: forecastRevenue, lessons: forecastLessons, tutorPay: forecastTutorPay, profit: forecastProfit },
      completionRate: rate,
      rawScheduled: { revenue: raw.revenue, lessons: raw.lessons, tutorPay: raw.tutor_pay }
    };

    totalRevenue += forecastRevenue;
    totalLessons += forecastLessons;
    totalTutorPay += forecastTutorPay;
  }

  // Handle 'other' channel if it exists
  if (scheduledSummary.byChannel.other) {
    const raw = scheduledSummary.byChannel.other;
    const rate = 0.75;
    const forecastRevenue = Math.round(raw.revenue * rate * 100) / 100;
    const forecastLessons = Math.round(raw.lessons * rate);
    const forecastTutorPay = Math.round(raw.tutor_pay * rate * 100) / 100;
    totalRevenue += forecastRevenue;
    totalLessons += forecastLessons;
    totalTutorPay += forecastTutorPay;
    byChannel.other = {
      forecast: { revenue: forecastRevenue, lessons: forecastLessons, tutorPay: forecastTutorPay, profit: Math.round((forecastRevenue - forecastTutorPay) * 100) / 100 },
      completionRate: rate,
      rawScheduled: { revenue: raw.revenue, lessons: raw.lessons, tutorPay: raw.tutor_pay }
    };
  }

  const totalProfit = Math.round((totalRevenue - totalTutorPay) * 100) / 100;

  // Blended completion rate
  const rawTotalRevenue = Object.values(scheduledSummary.byChannel).reduce((s, c) => s + (c.revenue || 0), 0);
  const blendedRate = rawTotalRevenue > 0 ? Math.round((totalRevenue / rawTotalRevenue) * 100) / 100 : 0.75;

  // YoY comparison: same period last year (actuals)
  let yoy = null;
  if (includeYoY === 'true') {
    const priorStart = DateTime.fromISO(startDate).minus({ years: 1 }).toISODate();
    const priorEnd = DateTime.fromISO(endDate).minus({ years: 1 }).toISODate();

    const priorActuals = await service.getActualsForRange({ startDate: priorStart, endDate: priorEnd });
    const priorByChannel = priorActuals.byChannel || {};

    let priorRevenue = 0, priorLessons = 0, priorTutorPay = 0;
    const yoyByChannel = {};

    for (const ch of [...channels, 'other']) {
      const prior = priorByChannel[ch] || { lessons: 0, revenue: 0, tutor_pay: 0 };
      priorRevenue += prior.revenue || 0;
      priorLessons += prior.lessons || 0;
      priorTutorPay += prior.tutor_pay || 0;

      if (byChannel[ch]) {
        yoyByChannel[ch] = {
          priorYear: { revenue: prior.revenue || 0, lessons: prior.lessons || 0, tutorPay: prior.tutor_pay || 0, profit: Math.round(((prior.revenue || 0) - (prior.tutor_pay || 0)) * 100) / 100 },
          yoyPct: {
            revenue: prior.revenue > 0 ? Math.round(((byChannel[ch].forecast.revenue - prior.revenue) / prior.revenue) * 1000) / 10 : null,
            lessons: prior.lessons > 0 ? Math.round(((byChannel[ch].forecast.lessons - prior.lessons) / prior.lessons) * 1000) / 10 : null,
            tutorPay: prior.tutor_pay > 0 ? Math.round(((byChannel[ch].forecast.tutorPay - prior.tutor_pay) / prior.tutor_pay) * 1000) / 10 : null,
            profit: (prior.revenue - prior.tutor_pay) > 0 ? Math.round(((byChannel[ch].forecast.profit - (prior.revenue - prior.tutor_pay)) / (prior.revenue - prior.tutor_pay)) * 1000) / 10 : null
          }
        };
      }
    }

    const priorProfit = Math.round((priorRevenue - priorTutorPay) * 100) / 100;

    yoy = {
      period: { start: priorStart, end: priorEnd },
      summary: {
        revenue: { priorYear: priorRevenue, yoyPct: priorRevenue > 0 ? Math.round(((totalRevenue - priorRevenue) / priorRevenue) * 1000) / 10 : null },
        lessons: { priorYear: priorLessons, yoyPct: priorLessons > 0 ? Math.round(((totalLessons - priorLessons) / priorLessons) * 1000) / 10 : null },
        tutorPay: { priorYear: priorTutorPay, yoyPct: priorTutorPay > 0 ? Math.round(((totalTutorPay - priorTutorPay) / priorTutorPay) * 1000) / 10 : null },
        profit: { priorYear: priorProfit, yoyPct: priorProfit > 0 ? Math.round(((totalProfit - priorProfit) / priorProfit) * 1000) / 10 : null }
      },
      byChannel: yoyByChannel
    };
  }

  res.json({
    period: { start: startDate, end: endDate, label },
    summary: {
      revenue: totalRevenue,
      lessons: totalLessons,
      tutorPay: totalTutorPay,
      profit: totalProfit
    },
    completionRate: blendedRate,
    byChannel,
    yoy
  });
}));

// ==========================================================================
// EXECUTIVE FORECAST - MULTI-PERIOD (mirrors historical multi-period layout)
// ==========================================================================

/**
 * GET /api/forecast/executive-multi-period
 * Returns 3 consecutive future periods of forecast data, matching the
 * historical executive reports layout for easy comparison.
 */
router.get('/executive-multi-period', asyncHandler(async (req, res) => {
  const { report_type = 'weekly', start_date, includeYoY = 'true' } = req.query;
  const service = getForecastService(req);
  const { DateTime } = require('luxon');

  const now = DateTime.now().setZone('America/New_York');

  // Compute the 3 periods to show
  const computePeriods = () => {
    if (report_type === 'monthly') {
      const baseMonth = start_date
        ? DateTime.fromISO(start_date).startOf('month')
        : now.plus({ months: 1 }).startOf('month');
      return [0, 1, 2].map(i => {
        const m = baseMonth.plus({ months: i });
        return {
          start: m.toISODate(),
          end: m.endOf('month').toISODate(),
          label: m.toFormat('MMMM yyyy')
        };
      });
    }
    if (report_type === 'quarterly') {
      const nextQ = now.plus({ quarters: 1 }).startOf('quarter');
      const baseQ = start_date
        ? DateTime.fromISO(start_date).startOf('quarter')
        : nextQ;
      return [0, 1, 2].map(i => {
        const q = baseQ.plus({ quarters: i });
        const qNum = Math.ceil(q.month / 3);
        return {
          start: q.toISODate(),
          end: q.endOf('quarter').toISODate(),
          label: `Q${qNum} ${q.toFormat('yyyy')}`
        };
      });
    }
    // Default: weekly
    const nextMon = start_date
      ? DateTime.fromISO(start_date).startOf('week')
      : now.plus({ weeks: 1 }).startOf('week');
    return [0, 1, 2].map(i => {
      const w = nextMon.plus({ weeks: i });
      const wEnd = w.endOf('week');
      return {
        start: w.toISODate(),
        end: wEnd.toISODate(),
        label: w.month === wEnd.month
          ? `${w.toFormat('MMM d')}-${wEnd.toFormat('d')}`
          : `${w.toFormat('MMM d')}-${wEnd.toFormat('MMM d')}`
      };
    });
  };

  const periods = computePeriods();

  // Fetch completion rates once (shared across all periods)
  // Use getHistoricalCompletionRates() to match the Analytics Dashboard calculation
  const completionRates = await service.getHistoricalCompletionRates();

  const channels = ['home', 'digital', 'clubs', 'schools'];

  // Helper: compute forecast for a single period
  const computePeriodForecast = async (period) => {
    const scheduled = await service.getScheduledSummary({
      startDate: period.start, endDate: period.end
    });

    const byChannel = {};
    let totalRevenue = 0, totalLessons = 0, totalTutorPay = 0;

    for (const ch of channels) {
      const raw = scheduled.byChannel[ch] || { lessons: 0, revenue: 0, tutor_pay: 0 };
      const rate = completionRates.realistic?.[ch] || 0.75;
      const rev = Math.round(raw.revenue * rate * 100) / 100;
      const les = Math.round(raw.lessons * rate);
      const pay = Math.round(raw.tutor_pay * rate * 100) / 100;
      byChannel[ch] = { revenue: rev, lessons: les, tutorPay: pay, profit: Math.round((rev - pay) * 100) / 100, completionRate: rate };
      totalRevenue += rev;
      totalLessons += les;
      totalTutorPay += pay;
    }

    // Handle 'other'
    if (scheduled.byChannel.other) {
      const raw = scheduled.byChannel.other;
      const rate = completionRates.realistic?.other || 0.70;
      const rev = Math.round(raw.revenue * rate * 100) / 100;
      const les = Math.round(raw.lessons * rate);
      const pay = Math.round(raw.tutor_pay * rate * 100) / 100;
      totalRevenue += rev; totalLessons += les; totalTutorPay += pay;
    }

    return {
      summary: {
        revenue: totalRevenue,
        lessons: totalLessons,
        tutorPay: totalTutorPay,
        profit: Math.round((totalRevenue - totalTutorPay) * 100) / 100
      },
      byChannel
    };
  };

  // Fetch all 3 periods in parallel
  const [p0, p1, p2] = await Promise.all(periods.map(p => computePeriodForecast(p)));

  // YoY: fetch actuals for same periods last year
  let yoy = null;
  if (includeYoY === 'true') {
    const priorPeriods = periods.map(p => ({
      start: DateTime.fromISO(p.start).minus({ years: 1 }).toISODate(),
      end: DateTime.fromISO(p.end).minus({ years: 1 }).toISODate()
    }));

    const [y0, y1, y2] = await Promise.all(
      priorPeriods.map(p => service.getActualsForRange({ startDate: p.start, endDate: p.end }))
    );

    const computeYoY = (forecast, actuals) => {
      let rev = 0, les = 0, pay = 0;
      for (const ch of [...channels, 'other']) {
        const a = actuals.byChannel?.[ch] || {};
        rev += a.revenue || 0;
        les += a.lessons || 0;
        pay += a.tutor_pay || 0;
      }
      return {
        revenue: rev, lessons: les, tutorPay: pay,
        profit: Math.round((rev - pay) * 100) / 100,
        yoyPct: {
          revenue: rev > 0 ? Math.round(((forecast.summary.revenue - rev) / rev) * 1000) / 10 : null,
          lessons: les > 0 ? Math.round(((forecast.summary.lessons - les) / les) * 1000) / 10 : null,
          tutorPay: pay > 0 ? Math.round(((forecast.summary.tutorPay - pay) / pay) * 1000) / 10 : null,
          profit: (rev - pay) > 0 ? Math.round(((forecast.summary.profit - (rev - pay)) / (rev - pay)) * 1000) / 10 : null
        }
      };
    };

    yoy = {
      periods: priorPeriods,
      data: [computeYoY(p0, y0), computeYoY(p1, y1), computeYoY(p2, y2)]
    };
  }

  // Compute change (period 2 vs period 0)
  const pctChange = (a, b) => b > 0 ? Math.round(((a - b) / b) * 1000) / 10 : null;

  // Generate available periods for dropdown
  const availablePeriods = [];
  if (report_type === 'weekly') {
    for (let i = 0; i < 12; i++) {
      const w = now.plus({ weeks: i + 1 }).startOf('week');
      const wEnd = w.endOf('week');
      availablePeriods.push({
        start: w.toISODate(),
        label: w.month === wEnd.month
          ? `${w.toFormat('MMM d')}-${wEnd.toFormat('d')}`
          : `${w.toFormat('MMM d')}-${wEnd.toFormat('MMM d')}`
      });
    }
  } else if (report_type === 'monthly') {
    for (let i = 0; i < 6; i++) {
      const m = now.plus({ months: i + 1 }).startOf('month');
      availablePeriods.push({ start: m.toISODate(), label: m.toFormat('MMMM yyyy') });
    }
  } else if (report_type === 'quarterly') {
    for (let i = 0; i < 4; i++) {
      const q = now.plus({ quarters: i + 1 }).startOf('quarter');
      const qNum = Math.ceil(q.month / 3);
      availablePeriods.push({ start: q.toISODate(), label: `Q${qNum} ${q.toFormat('yyyy')}` });
    }
  }

  // Blended completion rate
  const rawTotal = Object.values((await service.getScheduledSummary({ startDate: periods[0].start, endDate: periods[0].end })).byChannel)
    .reduce((s, c) => s + (c.revenue || 0), 0);
  const blendedRate = rawTotal > 0 ? Math.round((p0.summary.revenue / rawTotal) * 100) / 100 : 0.75;

  res.json({
    reportType: report_type,
    periods,
    availablePeriods,
    completionRate: blendedRate,
    data: [
      { ...periods[0], ...p0 },
      { ...periods[1], ...p1 },
      { ...periods[2], ...p2 }
    ],
    change: {
      revenue: pctChange(p2.summary.revenue, p0.summary.revenue),
      lessons: pctChange(p2.summary.lessons, p0.summary.lessons),
      tutorPay: pctChange(p2.summary.tutorPay, p0.summary.tutorPay),
      profit: pctChange(p2.summary.profit, p0.summary.profit)
    },
    yoy
  });
}));

module.exports = router;

