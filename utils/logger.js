/**
 * Structured JSON logging with Pino for production observability
 * Integrates with Papertrail for Heroku logging
 */

const pino = require('pino');
const { v4: uuidv4 } = require('uuid');

// Create base logger configuration
const createLogger = (options = {}) => {
  const isProduction = process.env.NODE_ENV === 'production';
  const isDevelopment = process.env.NODE_ENV === 'development';
  
  const baseConfig = {
    level: process.env.LOG_LEVEL || (isProduction ? 'info' : 'debug'),
    timestamp: pino.stdTimeFunctions.isoTime,
    formatters: {
      level: (label) => ({ level: label }),
      bindings: (bindings) => ({
        pid: bindings.pid,
        hostname: bindings.hostname,
        service: 'acme-ops-api'
      })
    },
    serializers: {
      req: pino.stdSerializers.req,
      res: pino.stdSerializers.res,
      err: pino.stdSerializers.err
    }
  };

  // Development: pretty print, Production: JSON for Papertrail
  if (isDevelopment && !isProduction) {
    return pino({
      ...baseConfig,
      transport: {
        target: 'pino-pretty',
        options: {
          colorize: true,
          translateTime: 'SYS:standard',
          ignore: 'pid,hostname'
        }
      }
    });
  }

  return pino(baseConfig);
};

// Create the main logger instance
const logger = createLogger();

// Enhanced logging utilities with structured fields
const createRequestLogger = (req, res, next) => {
  const requestId = uuidv4();
  const startTime = Date.now();
  const isDevelopment = process.env.NODE_ENV !== 'production';

  // Add request ID to request object for use in other middleware
  req.requestId = requestId;
  req.startTime = startTime;

  // Skip verbose logging for noisy endpoints in development
  const noisyEndpoints = ['/count', '/column-widths', '/run-automations', '/pageview', '/company-name'];
  const isNoisyEndpoint = isDevelopment && noisyEndpoints.some(e => req.url.includes(e));

  // In development, skip request_start logging entirely (only log completion)
  // In production, log full details for observability
  if (!isDevelopment) {
    logger.info({
      event: 'request_start',
      requestId,
      method: req.method,
      url: req.url,
      userAgent: req.get('User-Agent'),
      ip: req.ip || req.connection.remoteAddress,
      headers: {
        'content-type': req.get('Content-Type'),
        'authorization': req.get('Authorization') ? '[REDACTED]' : undefined
      }
    }, `${req.method} ${req.url} - Request started`);
  }

  // Override res.end to log response
  const originalEnd = res.end;
  res.end = function(chunk, encoding) {
    const duration = Date.now() - startTime;

    // Skip logging for noisy endpoints in development
    if (!isNoisyEndpoint) {
      if (isDevelopment) {
        // Simplified dev logging - just method, url, status, duration
        logger.info(`${req.method} ${req.url} - ${res.statusCode} (${duration}ms)`);
      } else {
        // Full production logging
        logger.info({
          event: 'request_complete',
          requestId,
          method: req.method,
          url: req.url,
          statusCode: res.statusCode,
          duration_ms: duration,
          contentLength: res.get('Content-Length'),
          userAgent: req.get('User-Agent'),
          ip: req.ip || req.connection.remoteAddress
        }, `${req.method} ${req.url} - ${res.statusCode} (${duration}ms)`);
      }
    }

    // Record metrics for DevOps monitoring (async, don't block response)
    if (process.env.NODE_ENV === 'production' || process.env.COLLECT_METRICS === 'true') {
      const metricsCollector = require('../services/metricsCollector');
      const environment = process.env.NODE_ENV === 'production' ? 
        (process.env.APP_NAME?.includes('westside') ? 'westside' : 
         process.env.APP_NAME?.includes('eastside') ? 'eastside' : 'main') : 'development';
      
      // Extract endpoint (remove query params)
      const endpoint = req.url.split('?')[0];
      
      // Record API latency asynchronously (don't block response)
      metricsCollector.recordApiLatency(environment, endpoint, req.method, duration, res.statusCode)
        .catch(err => console.error('Error recording API latency:', err));
    }

    originalEnd.call(this, chunk, encoding);
  };

  next();
};

// Database query logger
const createDbLogger = () => {
  return {
    query: (query, params, duration, error = null) => {
      const logData = {
        event: 'database_query',
        query: query.substring(0, 200), // Truncate long queries
        params: params ? params.slice(0, 5) : null, // Limit params
        duration_ms: duration,
        timestamp: new Date().toISOString()
      };

      if (error) {
        logger.error({
          ...logData,
          error: error.message,
          stack: error.stack,
          code: error.code
        }, 'Database query failed');
      } else if (duration > 1000) {
        logger.warn({
          ...logData
        }, 'Slow database query detected');
      } else {
        logger.debug({
          ...logData
        }, 'Database query executed');
      }
    }
  };
};

// Error logger with context
const logError = (error, context = {}) => {
  const errorId = uuidv4();
  
  logger.error({
    event: 'application_error',
    errorId,
    error: {
      message: error.message,
      stack: error.stack,
      name: error.name,
      code: error.code
    },
    context: {
      ...context,
      timestamp: new Date().toISOString()
    }
  }, `Application error: ${error.message}`);

  return errorId;
};

// Business event logger
const logBusinessEvent = (event, data = {}) => {
  logger.info({
    event: 'business_event',
    businessEvent: event,
    data,
    timestamp: new Date().toISOString()
  }, `Business event: ${event}`);
};

// Performance metrics logger
const logPerformance = (metric, value, context = {}) => {
  logger.info({
    event: 'performance_metric',
    metric,
    value,
    context,
    timestamp: new Date().toISOString()
  }, `Performance metric: ${metric} = ${value}`);
};

// API integration logger
const logApiCall = (service, endpoint, method, statusCode, duration, error = null) => {
  const logData = {
    event: 'api_call',
    service,
    endpoint,
    method,
    statusCode,
    duration_ms: duration,
    timestamp: new Date().toISOString()
  };

  if (error) {
    logger.error({
      ...logData,
      error: error.message,
      stack: error.stack
    }, `API call failed: ${service} ${endpoint}`);
  } else {
    logger.info({
      ...logData
    }, `API call: ${service} ${endpoint} (${statusCode})`);
  }
};

// Health check logger
const logHealthCheck = (component, status, details = {}) => {
  logger.info({
    event: 'health_check',
    component,
    status,
    details,
    timestamp: new Date().toISOString()
  }, `Health check: ${component} - ${status}`);
};

// Security event logger
const logSecurityEvent = (event, details = {}) => {
  logger.warn({
    event: 'security_event',
    securityEvent: event,
    details,
    timestamp: new Date().toISOString()
  }, `Security event: ${event}`);
};

module.exports = {
  logger,
  createRequestLogger,
  createDbLogger,
  logError,
  logBusinessEvent,
  logPerformance,
  logApiCall,
  logHealthCheck,
  logSecurityEvent
};
