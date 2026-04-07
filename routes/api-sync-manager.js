const express = require('express');
const router = express.Router();
const { exec } = require('child_process');
const { promisify } = require('util');
const { asyncHandler } = require('../middleware/error-handler');
const { logger } = require('../utils/logger');
const execAsync = promisify(exec);

const STEP_CONFIG = {
  clients: {
    fn: 'syncClientsComplete',
    description: 'Syncing ALL clients with full details (status, pipeline stage, labels)'
  },
  services: {
    fn: 'syncServices',
    description: 'Syncing services/lesson types'
  },
  appointments: {
    fn: 'syncAppointments',
    description: 'Syncing appointments/lessons'
  },
  invoices: {
    fn: 'syncInvoices',
    description: 'Syncing invoices'
  },
  paymentOrders: {
    fn: 'syncPaymentOrders',
    description: 'Syncing payment orders'
  },
  adhocCharges: {
    fn: 'syncAdhocCharges',
    description: 'Syncing adhoc charges'
  },
  adhocChargeCategories: {
    fn: 'syncAdhocChargeCategories',
    description: 'Syncing adhoc charge categories'
  },
  contractors: {
    fn: 'syncContractors',
    description: 'Syncing contractors/tutors'
  },
  proformaInvoices: {
    fn: 'syncProformaInvoices',
    description: 'Syncing proforma invoices'
  },
  recipients: {
    fn: 'syncRecipients',
    description: 'Syncing recipients/students'
  },
  reviews: {
    fn: 'syncReviews',
    description: 'Syncing reviews'
  }
};

const ALL_STEPS = Object.keys(STEP_CONFIG);

function createDefaultStepState(message = 'Not run yet') {
  const steps = {};
  ALL_STEPS.forEach((step) => {
    steps[step] = {
      status: 'pending',
      message,
      startTime: null,
      endTime: null,
      lastSuccessfulSync: null
    };
  });
  return steps;
}

function createInitialStatus() {
  return {
    isRunning: false,
    startTime: null,
    endTime: null,
    currentStep: null,
    steps: createDefaultStepState(),
    includedSteps: ALL_STEPS,
    runType: null,
    error: null,
    logs: []
  };
}

function buildRunStepState(selectedSteps) {
  const steps = {};
  ALL_STEPS.forEach((step) => {
    const existingStep = syncStatus.steps?.[step];
    if (selectedSteps.includes(step)) {
      steps[step] = {
        status: 'pending',
        message: 'Waiting to start...',
        startTime: null,
        endTime: null,
        lastSuccessfulSync: existingStep?.lastSuccessfulSync || null
      };
    } else {
      steps[step] = {
        status: 'idle',
        message: 'Not scheduled for this run',
        startTime: null,
        endTime: null,
        lastSuccessfulSync: existingStep?.lastSuccessfulSync || null
      };
    }
  });
  return steps;
}

// In-memory sync status (in production, you might want to use Redis or database)
let syncStatus = createInitialStatus();

// Helper to add log entry
function addLog(message, level = 'info') {
  const timestamp = new Date().toISOString();
  syncStatus.logs.push({ timestamp, level, message });
  // Keep only last 100 logs
  if (syncStatus.logs.length > 100) {
    syncStatus.logs = syncStatus.logs.slice(-100);
  }
  logger.info(`[${level.toUpperCase()}] ${message}`);
}

// Get current sync status
router.get('/sync/status', asyncHandler(async (req, res) => {
  try {
    res.json({
      ...syncStatus,
      progress: calculateProgress(syncStatus)
    });
  } catch (error) {
    logger.error({ err: error }, 'Error getting sync status:');
    res.status(500).json({ error: 'Failed to get sync status' });
  }
}));

// Calculate overall progress percentage
function calculateProgress(status) {
  const relevantSteps = Array.isArray(status.includedSteps) && status.includedSteps.length > 0
    ? status.includedSteps
    : ALL_STEPS;

  if (!status.isRunning && !status.endTime) {
    return 0;
  }
  if (status.endTime) {
    return 100;
  }

  const completedSteps = relevantSteps.filter((step) => status.steps[step]?.status === 'completed').length;
  return Math.round((completedSteps / relevantSteps.length) * 100);
}

function prepareSyncStatus(selectedSteps, runType) {
  const stepsToRun = selectedSteps.length > 0 ? selectedSteps : ALL_STEPS;
  syncStatus = {
    isRunning: true,
    startTime: new Date().toISOString(),
    endTime: null,
    currentStep: null,
    steps: buildRunStepState(stepsToRun),
    includedSteps: stepsToRun,
    runType,
    error: null,
    logs: []
  };
}

// Start a new sync
router.post('/sync/start', asyncHandler(async (req, res) => {
  try {
    // Check if sync is already running
    if (syncStatus.isRunning) {
      return res.status(409).json({ 
        error: 'Sync is already running',
        status: syncStatus 
      });
    }

    prepareSyncStatus(ALL_STEPS, 'full');

    addLog('🚀 Starting full TutorCruncher sync...', 'info');

    // Start sync in background
    runSyncProcess(ALL_STEPS).catch(error => {
      logger.error({ err: error }, 'Sync process failed:');
      syncStatus.isRunning = false;
      syncStatus.error = error.message;
      syncStatus.endTime = new Date().toISOString();
      addLog(`❌ Sync failed: ${error.message}`, 'error');
    });

    res.json({ 
      message: 'Sync started successfully',
      status: syncStatus 
    });
  } catch (error) {
    logger.error({ err: error }, 'Error starting sync:');
    res.status(500).json({ error: 'Failed to start sync' });
  }
}));

// Run a single sync step on demand
router.post('/sync/run-step', asyncHandler(async (req, res) => {
  try {
    const { step } = req.body || {};
    if (!step || !STEP_CONFIG[step]) {
      return res.status(400).json({ error: 'Invalid or missing sync step' });
    }

    if (syncStatus.isRunning) {
      return res.status(409).json({
        error: 'Sync is already running',
        status: syncStatus
      });
    }

    prepareSyncStatus([step], 'single');
    addLog(`🚀 Starting ${STEP_CONFIG[step].description.toLowerCase()}...`, 'info');

    runSyncProcess([step]).catch((error) => {
      logger.error({ err: error }, 'Sync process failed:');
      syncStatus.isRunning = false;
      syncStatus.error = error.message;
      syncStatus.endTime = new Date().toISOString();
      addLog(`❌ Sync failed: ${error.message}`, 'error');
    });

    res.json({
      message: `Sync for ${step} started successfully`,
      status: syncStatus
    });
  } catch (error) {
    logger.error({ err: error }, 'Error running single sync step:');
    res.status(500).json({ error: 'Failed to start sync step' });
  }
}));

// Stop/cancel a running sync
router.post('/sync/stop', asyncHandler(async (req, res) => {
  try {
    if (!syncStatus.isRunning) {
      return res.status(400).json({ error: 'No sync is currently running' });
    }

    // Note: Stopping mid-sync might leave data in inconsistent state
    // This is a simple implementation - you might want to implement graceful shutdown
    syncStatus.isRunning = false;
    syncStatus.error = 'Sync was manually stopped';
    syncStatus.endTime = new Date().toISOString();
    addLog('🛑 Sync was manually stopped by user', 'warning');

    res.json({ 
      message: 'Sync stopped',
      status: syncStatus 
    });
  } catch (error) {
    logger.error({ err: error }, 'Error stopping sync:');
    res.status(500).json({ error: 'Failed to stop sync' });
  }
}));

// Actually run the sync process
async function runSyncProcess(selectedSteps) {
  const jobModule = require('../jobs/sync.service.js');

  for (const stepName of selectedSteps) {
    const stepConfig = STEP_CONFIG[stepName];
    if (!stepConfig) {
      addLog(`⚠️ Unknown sync step requested: ${stepName}`, 'warning');
      continue;
    }

    if (!syncStatus.isRunning) {
      addLog('Sync stopped by user', 'warning');
      break;
    }

    syncStatus.currentStep = stepName;
    syncStatus.steps[stepName].status = 'running';
    syncStatus.steps[stepName].startTime = new Date().toISOString();
    syncStatus.steps[stepName].message = stepConfig.description;
    
    addLog(`▶️  Starting ${stepConfig.description}...`, 'info');
    addLog(`📋 Step: ${stepName} | Function: ${stepConfig.fn}`, 'info');

    try {
      if (typeof jobModule[stepConfig.fn] !== 'function') {
        throw new Error(`Sync function ${stepConfig.fn} not available`);
      }

      const startTime = Date.now();
      await jobModule[stepConfig.fn]();
      const duration = ((Date.now() - startTime) / 1000).toFixed(2);
      addLog(`⏱️  ${stepConfig.description} completed in ${duration}s`, 'info');
      
      const completedTime = new Date().toISOString();
      syncStatus.steps[stepName].status = 'completed';
      syncStatus.steps[stepName].endTime = completedTime;
      syncStatus.steps[stepName].lastSuccessfulSync = completedTime;
      syncStatus.steps[stepName].message = 'Completed successfully';
      
      addLog(`✅ ${stepConfig.description} completed`, 'success');
    } catch (error) {
      syncStatus.steps[stepName].status = 'failed';
      syncStatus.steps[stepName].endTime = new Date().toISOString();
      syncStatus.steps[stepName].message = `Error: ${error.message}`;
      
      addLog(`❌ ${stepConfig.description} failed: ${error.message}`, 'error');
      throw error; // Stop sync on first error
    }
  }

  syncStatus.isRunning = false;
  syncStatus.endTime = new Date().toISOString();
  syncStatus.currentStep = null;

  // Reset non-selected steps back to pending for future runs
  ALL_STEPS.forEach((stepName) => {
    if (!selectedSteps.includes(stepName) && syncStatus.steps[stepName].status === 'idle') {
      const existingStep = syncStatus.steps[stepName];
      syncStatus.steps[stepName] = {
        status: 'pending',
        message: 'Not run during last job',
        startTime: null,
        endTime: null,
        lastSuccessfulSync: existingStep?.lastSuccessfulSync || null
      };
    }
  });

  addLog('🎉 Sync finished', 'success');
}

// Get recent sync logs
router.get('/sync/logs', asyncHandler(async (req, res) => {
  try {
    const limit = parseInt(req.query.limit) || 50;
    res.json({
      logs: syncStatus.logs.slice(-limit)
    });
  } catch (error) {
    logger.error({ err: error }, 'Error getting sync logs:');
    res.status(500).json({ error: 'Failed to get sync logs' });
  }
}));

module.exports = router;

