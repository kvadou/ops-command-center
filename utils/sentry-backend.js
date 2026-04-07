const Sentry = require('@sentry/node');
const { logger } = require('./logger');

// Track if Sentry was successfully initialized
let sentryInitialized = false;

// Try to load profiling integration (optional - may not be installed or compatible)
let nodeProfilingIntegration = null;
try {
  const profilingModule = require('@sentry/profiling-node');
  nodeProfilingIntegration = profilingModule.nodeProfilingIntegration;
} catch (e) {
  // Profiling module not available, that's fine
}

/**
 * Validate that a DSN looks correct (basic validation)
 */
function isValidDsn(dsn) {
  if (!dsn) return false;
  // Check for placeholder values
  if (dsn.includes('your-') || dsn.includes('YOUR_') || dsn.includes('xxx')) return false;
  // Basic format check: should be https://something@something.sentry.io/number
  const dsnPattern = /^https:\/\/[a-f0-9]+@[a-z0-9]+\.ingest\.(us\.|de\.|)?sentry\.io\/\d+$/i;
  const legacyPattern = /^https:\/\/[a-f0-9]+@o\d+\.ingest\.sentry\.io\/\d+$/i;
  return dsnPattern.test(dsn) || legacyPattern.test(dsn) || dsn.includes('.sentry.io/');
}

/**
 * Initialize Sentry for backend error tracking and performance monitoring
 * Set SENTRY_DSN_BACKEND environment variable with your Sentry DSN
 */
function initSentry(app) {
  const dsn = process.env.SENTRY_DSN_BACKEND;

  if (!dsn) {
    logger.warn('⚠️  Sentry DSN not found. Error tracking is disabled.');
    logger.warn('   Set SENTRY_DSN_BACKEND environment variable to enable Sentry.');
    return;
  }

  if (!isValidDsn(dsn)) {
    logger.warn('⚠️  Invalid Sentry DSN detected. Error tracking is disabled.');
    logger.warn('   Please set a valid SENTRY_DSN_BACKEND environment variable.');
    logger.warn(`   Current value appears to be a placeholder: ${dsn.substring(0, 30)}...`);
    return;
  }

  const environment = process.env.NODE_ENV || 'development';
  const release = process.env.HEROKU_SLUG_COMMIT || process.env.npm_package_version || 'unknown';

  // Build integrations list
  const integrations = [];
  
  // Add profiling if available (uses new functional API)
  if (nodeProfilingIntegration) {
    integrations.push(nodeProfilingIntegration());
  }

  try {
    Sentry.init({
      dsn,
      environment,
      release,

      // Performance Monitoring
      tracesSampleRate: environment === 'production' ? 0.1 : 1.0,

      // Profiling (only if profiling integration is available)
      profilesSampleRate: nodeProfilingIntegration ? (environment === 'production' ? 0.1 : 1.0) : 0,
      integrations,

      // Filter out sensitive data
      beforeSend(event, hint) {
        // Remove sensitive headers
        if (event.request?.headers) {
          delete event.request.headers.authorization;
          delete event.request.headers.cookie;
        }

        // Remove sensitive query params
        if (event.request?.query_string) {
          const queryParams = new URLSearchParams(event.request.query_string);
          if (queryParams.has('token')) queryParams.delete('token');
          if (queryParams.has('password')) queryParams.delete('password');
          event.request.query_string = queryParams.toString();
        }

        return event;
      },

      // Ignore certain errors
      ignoreErrors: [
        // Browser errors
        'ResizeObserver loop limit exceeded',
        'Non-Error promise rejection captured',
        // Network errors
        'Network request failed',
        'NetworkError',
        // Common bot errors
        'Cannot read property of undefined',
      ],
    });

    sentryInitialized = true;
    logger.info(`✅ Sentry initialized for ${environment} environment`);
    logger.info(`   Release: ${release}`);
  } catch (error) {
    logger.warn(`⚠️  Failed to initialize Sentry: ${error.message}`);
    logger.warn('   Error tracking is disabled.');
  }
}

/**
 * No-op middleware for when Sentry is not initialized
 */
function noopMiddleware(req, res, next) {
  next();
}

/**
 * No-op error middleware for when Sentry is not initialized
 */
function noopErrorMiddleware(err, req, res, next) {
  next(err);
}

/**
 * Express middleware for Sentry request handling
 * Use before your routes
 */
function sentryRequestHandler() {
  if (!sentryInitialized) {
    return noopMiddleware;
  }
  // Sentry v8+ uses setupExpressErrorHandler or the middleware is auto-configured
  // For compatibility, check if Handlers exists
  if (Sentry.Handlers?.requestHandler) {
    return Sentry.Handlers.requestHandler();
  }
  // v8+ doesn't need explicit request handler - it's auto-configured
  return noopMiddleware;
}

/**
 * Express middleware for Sentry tracing
 * Use before your routes
 */
function sentryTracingHandler() {
  if (!sentryInitialized) {
    return noopMiddleware;
  }
  // Sentry v8+ uses auto-instrumentation
  if (Sentry.Handlers?.tracingHandler) {
    return Sentry.Handlers.tracingHandler();
  }
  // v8+ doesn't need explicit tracing handler - it's auto-configured
  return noopMiddleware;
}

/**
 * Express error handler for Sentry
 * Use after your routes
 */
function sentryErrorHandler() {
  if (!sentryInitialized) {
    return noopErrorMiddleware;
  }
  // Sentry v8+ uses setupExpressErrorHandler
  if (Sentry.Handlers?.errorHandler) {
    return Sentry.Handlers.errorHandler({
      shouldHandleError(error) {
        // Capture all errors with status code >= 500
        return error.status >= 500;
      },
    });
  }
  // v8+ - use setupExpressErrorHandler if available, otherwise noop
  return noopErrorMiddleware;
}

/**
 * Manually capture an exception
 */
function captureException(error, context = {}) {
  Sentry.captureException(error, {
    extra: context,
  });
}

/**
 * Manually capture a message
 */
function captureMessage(message, level = 'info', context = {}) {
  Sentry.captureMessage(message, {
    level,
    extra: context,
  });
}

/**
 * Add user context to Sentry events
 */
function setUser(user) {
  Sentry.setUser(user);
}

/**
 * Add custom context to Sentry events
 */
function setContext(name, context) {
  Sentry.setContext(name, context);
}

module.exports = {
  initSentry,
  sentryRequestHandler,
  sentryTracingHandler,
  sentryErrorHandler,
  captureException,
  captureMessage,
  setUser,
  setContext,
  Sentry,
};
