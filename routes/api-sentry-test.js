/**
 * Sentry Test Routes
 * Used to test Sentry error tracking and alerts
 * These routes are PUBLIC (no auth required) but have environment restrictions
 */

const express = require('express');
const router = express.Router();
const { captureException, captureMessage } = require('../utils/sentry-backend');

/**
 * GET /api/sentry-test/error
 * Triggers a test error to verify Sentry is working
 * Only works on staging or with secret key in production
 */
router.get('/error', (req, res) => {
  const isProd = process.env.NODE_ENV === 'production';
  const isMainProd = process.env.HEROKU_APP_NAME === 'acme-ops-main';
  const hasSecretKey = req.query.key === 'sentry-test-2024';
  
  // Block on main production unless secret key provided
  if (isMainProd && !hasSecretKey) {
    return res.status(403).json({ 
      error: 'Test errors disabled on main production',
      hint: 'Use staging environment or add ?key=sentry-test-2024'
    });
  }

  // Throw a test error with unique identifier
  const uniqueId = req.query.id || Date.now();
  const testError = new Error(`🧪 Sentry Test Error #${uniqueId} - This is a test to verify error tracking is working`);
  testError.name = 'SentryTestError';
  
  // Manually capture with extra context
  captureException(testError, {
    test: true,
    triggeredBy: req.query.user || 'anonymous',
    timestamp: new Date().toISOString(),
    environment: process.env.NODE_ENV,
    app: process.env.HEROKU_APP_NAME,
  });

  // Return success before throwing (so we get a response)
  res.status(500).json({
    success: true,
    message: 'Test error sent to Sentry',
    error: testError.message,
    checkSentry: 'https://acmeops.sentry.io/issues/'
  });
});

/**
 * GET /api/sentry-test/message
 * Sends a test message to Sentry (won't appear as error)
 */
router.get('/message', (req, res) => {
  const message = req.query.message || '🧪 Sentry Test Message - Verifying message capture';
  
  captureMessage(message, 'info', {
    test: true,
    triggeredBy: req.query.user || 'anonymous',
    environment: process.env.NODE_ENV,
    app: process.env.HEROKU_APP_NAME,
  });

  res.json({ 
    success: true, 
    message: 'Test message sent to Sentry',
    sentMessage: message,
    checkSentry: 'https://acmeops.sentry.io/issues/'
  });
});

/**
 * GET /api/sentry-test/status
 * Check Sentry configuration status (PUBLIC - no auth)
 */
router.get('/status', (req, res) => {
  const status = {
    backend: {
      dsnConfigured: !!process.env.SENTRY_DSN_BACKEND,
      dsnPrefix: process.env.SENTRY_DSN_BACKEND?.substring(0, 20) + '...' || 'not set',
      authTokenConfigured: !!process.env.SENTRY_AUTH_TOKEN,
      orgConfigured: !!process.env.SENTRY_ORG,
      org: process.env.SENTRY_ORG || 'not set',
      environment: process.env.NODE_ENV || 'development',
    },
    frontend: {
      dsnConfigured: !!process.env.VITE_SENTRY_DSN,
    },
    heroku: {
      slugCommit: process.env.HEROKU_SLUG_COMMIT?.substring(0, 8) || 'not available',
      appName: process.env.HEROKU_APP_NAME || 'not available',
      dynoMetadataEnabled: !!process.env.HEROKU_SLUG_COMMIT,
    },
    testEndpoints: {
      error: '/api/sentry-test/error',
      message: '/api/sentry-test/message',
      status: '/api/sentry-test/status (this endpoint)',
    }
  };

  res.json(status);
});

module.exports = router;
