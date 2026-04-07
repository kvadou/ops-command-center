const express = require("express");
const router = express.Router();
const JobBuilderService = require('../services/job-builder-service');
const { requireStaffOrAdmin } = require('../middleware/rbac');
const { requireAuth: auth } = require('../middleware/auth');
const { asyncHandler } = require('../middleware/error-handler');
const { logger } = require('../utils/logger');

// Initialize service with dependency injection
// Jobs always use production database pool (not location-specific)
function getJobBuilderService(req) {
  // Always use global pool (production) for job creation
  // In the future, we can enable location-specific job creation for Eastside/Westside
  const pool = global.pool;
  if (!pool) {
    logger.error({ error: {
      hasGlobalPool: !!global.pool,
      location: req.location
    } }, '[job-builder] No production database pool available');
    throw new Error('Production database pool not available');
  }
  logger.info(`[job-builder] Using production pool (jobs always created in main production environment)`);
  return new JobBuilderService(pool);
}


// POST /api/job-builder/create - Create a new job in TutorCruncher
// Any authenticated user can create jobs
router.post("/create", auth, asyncHandler(async (req, res) => {
  const { templateId, formData } = req.body;

  if (!templateId || !formData) {
    return res.status(400).json({ error: "Template ID and form data are required" });
  }

  try {
    logger.info(`[job-builder] Creating job - Template: ${templateId}, Location: ${req.location || 'production'}`);
    logger.info({ data: Object.keys(formData || {}) }, `[job-builder] Form data keys:`);
    logger.info({ data: formData?.colour }, `[job-builder] Form data colour:`);
    logger.info({ data: formData?.auto_invoice }, `[job-builder] Form data auto_invoice:`);
    logger.info({ data: formData?.hasOwnProperty('colour') }, `[job-builder] Form data has colour:`);
    logger.info({ data: formData?.hasOwnProperty('auto_invoice') }, `[job-builder] Form data has auto_invoice:`);

  const service = getJobBuilderService(req);
  // Jobs always go to production environment (targetEnvironment removed for now)
  const result = await service.createJob(templateId, formData, null);

  res.status(201).json({
    message: "Job created successfully in TutorCruncher",
    ...result
  });
  } catch (error) {
    logger.error({ error: {
      message: error.message,
      stack: error.stack,
      templateId,
      location: req.location,
      hasLocationPool: !!req.locationPool,
      errorCode: error.code,
      errorStatus: error.status,
      formDataKeys: formData ? Object.keys(formData) : null,
      recipientsType: formData?.recipients ? typeof formData.recipients : null,
      recipientsIsArray: Array.isArray(formData?.recipients)
    } }, '[job-builder] Error creating job:');
    
    // Ensure error has proper status and code
    if (!error.status) {
      error.status = 500;
    }
    if (!error.code) {
      error.code = 'JOB_CREATION_ERROR';
    }
    
    throw error; // Re-throw to let asyncHandler handle it
  }
}));

// POST /api/job-builder/preview - Preview job title and brick without creating
// Any authenticated user can preview jobs
router.post("/preview", auth, asyncHandler(async (req, res) => {
  const { templateId, formData } = req.body;

  if (!templateId) {
    return res.status(400).json({ error: "Template ID is required" });
  }

  if (!formData) {
    return res.status(400).json({ error: "Form data is required" });
  }

  try {
    const service = getJobBuilderService(req);
    const result = await service.previewJob(templateId, formData);
    res.json(result);
  } catch (error) {
    logger.error({ err: error }, "Error in preview endpoint:");
    logger.error({ error: error.stack }, "Error stack:");
    res.status(error.status || 500).json({
      error: error.message || "Failed to generate preview",
      details: error.code || "UNKNOWN_ERROR"
    });
  }
}));

// POST /api/job-builder/save-draft - Save job draft locally
// Any authenticated user can save drafts
router.post("/save-draft", auth, asyncHandler(async (req, res) => {
  const { templateId, formData, jobTitle, jobDescription } = req.body;
  const userId = req.user?.id || "anonymous";

  const service = getJobBuilderService(req);
  const draft = await service.saveDraft(templateId, formData, jobTitle, jobDescription, userId);

  res.json({
    message: "Draft saved successfully",
    draft
  });
}));

// GET /api/job-builder/history - List job builder history
router.get("/history", auth, asyncHandler(async (req, res) => {
  const { limit = 50, offset = 0, status, startDate, endDate } = req.query;
  const service = getJobBuilderService(req);
  const result = await service.getHistory({
    limit: Math.min(parseInt(limit, 10) || 50, 200),
    offset: parseInt(offset, 10) || 0,
    status: status || null,
    startDate: startDate || null,
    endDate: endDate || null,
  });
  res.json(result);
}));

// GET /api/job-builder/history/:id - Get full history detail
router.get("/history/:id", auth, asyncHandler(async (req, res) => {
  const service = getJobBuilderService(req);
  const record = await service.getHistoryDetail(parseInt(req.params.id, 10));
  if (!record) {
    return res.status(404).json({ error: "History record not found" });
  }
  res.json(record);
}));

module.exports = router;

