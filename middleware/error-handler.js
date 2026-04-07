/**
 * Error Handling Middleware
 * Provides standardized error responses
 */

const { logError } = require('../utils/logger');

/**
 * Error handler middleware
 */
function errorHandler(err, req, res, next) {
  // Log the error
  const errorId = logError(err, {
    requestId: req.requestId,
    url: req.url,
    method: req.method,
    userAgent: req.get('User-Agent'),
    ip: req.ip,
  });

  // Determine status code
  const statusCode = err.statusCode || err.status || 500;

  // Determine error message
  let message = err.message || 'An unexpected error occurred';
  
  // Don't expose internal errors in production, but include error code if available
  if (process.env.NODE_ENV === 'production' && statusCode === 500) {
    // If error has a code, include it for debugging
    if (err.code) {
      message = `${message} (${err.code})`;
    } else {
    message = 'An unexpected error occurred';
    }
  }

  // Prepare response object
  const response = {
    error: message,
    errorId: errorId,
    ...(err.code && { code: err.code }),
  };

  // Include details for API errors (400, 422, etc.) - these are validation errors that users should see
  if (err.details && (statusCode === 400 || statusCode === 422 || statusCode === 404)) {
    response.details = err.details;
  }

  // Include stack and full details in development
  if (process.env.NODE_ENV !== 'production') {
    response.stack = err.stack;
    if (err.details) {
      response.details = err.details;
    }
  }

  // Send error response
  res.status(statusCode).json(response);
}

/**
 * 404 Not Found handler
 */
function notFoundHandler(req, res) {
  res.status(404).json({
    error: 'Resource not found',
    path: req.path,
    method: req.method,
  });
}

/**
 * Async handler wrapper to catch errors
 */
function asyncHandler(fn) {
  return (req, res, next) => {
    Promise.resolve(fn(req, res, next)).catch(next);
  };
}

module.exports = {
  errorHandler,
  notFoundHandler,
  asyncHandler,
};
