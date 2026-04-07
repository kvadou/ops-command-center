const express = require('express');
const router = express.Router();
const { asyncHandler } = require('../middleware/error-handler');
const { requireAuth } = require('../middleware/auth');
const { getLocationPool } = require('../utils/pool');
const lessonsDashboardService = require('../services/lessons-dashboard-service');

const auth = global.auth || requireAuth;

// GET /api/lessons-dashboard
router.get('/', auth, asyncHandler(async (req, res) => {
  const pool = getLocationPool(req);
  const filters = {
    search: req.query.search,
    status: req.query.status,
    cancelled_by: req.query.cancelled_by,
    cancellation_reason: req.query.cancellation_reason,
    tutor_id: req.query.tutor_id,
    client_name: req.query.client_name,
    start_date: req.query.start_date,
    end_date: req.query.end_date,
    tab: req.query.tab,
    page: req.query.page,
    limit: req.query.limit,
    sort: req.query.sort,
    sort_dir: req.query.sort_dir,
  };
  const result = await lessonsDashboardService.getLessons(pool, filters);

  // Normalize field names for frontend
  result.lessons = (result.lessons || []).map(l => ({
    ...l,
    client_name: l.paying_clients || null,
    student_names: l.recipients || null,
  }));

  res.json(result);
}));

// GET /api/lessons-dashboard/cancellation-report
router.get('/cancellation-report', auth, asyncHandler(async (req, res) => {
  const pool = getLocationPool(req);
  const filters = {
    start_date: req.query.start_date,
    end_date: req.query.end_date,
  };
  const result = await lessonsDashboardService.getCancellationReport(pool, filters);
  res.json(result);
}));

// PATCH /api/lessons-dashboard/:appointmentId/cancel-reason
router.patch('/:appointmentId/cancel-reason', auth, asyncHandler(async (req, res) => {
  const pool = getLocationPool(req);
  const { appointmentId } = req.params;
  const { cancelledBy, reason, note } = req.body;
  const result = await lessonsDashboardService.tagCancellation(pool, appointmentId, {
    cancelledBy,
    reason,
    note,
  });
  res.json(result);
}));

module.exports = router;
