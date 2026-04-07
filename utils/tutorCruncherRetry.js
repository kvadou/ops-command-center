/**
 * Retry utility for TutorCruncher API calls
 * Handles transient failures with exponential backoff
 */

/**
 * Check if an error is transient and should be retried
 * @param {Error} error - The error to check
 * @returns {boolean} - True if error is transient
 */

const { logger } = require('./logger');
const isTransientError = (error) => {
  // Network errors (no response)
  if (!error.response) {
    // Timeout errors
    if (error.code === 'ECONNABORTED' || error.message?.includes('timeout')) {
      return true;
    }
    // Connection errors
    if (error.code === 'ECONNREFUSED' || error.code === 'ENOTFOUND' || error.code === 'ETIMEDOUT') {
      return true;
    }
    // Other network errors
    return true;
  }

  const status = error.response?.status;

  // Rate limiting (429) - always retry
  if (status === 429) {
    return true;
  }

  // Server errors (5xx) - retry
  if (status >= 500 && status < 600) {
    return true;
  }

  // Gateway timeout (504) - retry
  if (status === 504) {
    return true;
  }

  // Service unavailable (503) - retry
  if (status === 503) {
    return true;
  }

  // Bad gateway (502) - retry
  if (status === 502) {
    return true;
  }

  // Request timeout (408) - retry
  if (status === 408) {
    return true;
  }

  // Client errors (4xx) except 429 - don't retry (permanent failures)
  if (status >= 400 && status < 500) {
    return false;
  }

  // Unknown errors - don't retry by default
  return false;
};

/**
 * Calculate delay for retry with exponential backoff
 * @param {number} attempt - Current attempt number (1-indexed)
 * @param {number} baseDelayMs - Base delay in milliseconds
 * @param {number} maxDelayMs - Maximum delay in milliseconds
 * @param {number} retryAfter - Retry-After header value in seconds (for 429 errors)
 * @returns {number} - Delay in milliseconds
 */
const calculateRetryDelay = (attempt, baseDelayMs = 1000, maxDelayMs = 30000, retryAfter = null) => {
  // If Retry-After header is present (rate limiting), use it
  if (retryAfter !== null && retryAfter > 0) {
    return Math.min(retryAfter * 1000, maxDelayMs);
  }

  // Exponential backoff: baseDelay * 2^(attempt-1)
  const exponentialDelay = baseDelayMs * Math.pow(2, attempt - 1);
  
  // Add jitter (random 0-20% of delay) to prevent thundering herd
  const jitter = Math.random() * 0.2 * exponentialDelay;
  const delay = exponentialDelay + jitter;

  return Math.min(delay, maxDelayMs);
};

/**
 * Retry a TutorCruncher API call with exponential backoff
 * @param {Function} apiCall - Async function that makes the API call
 * @param {Object} options - Retry options
 * @param {number} options.maxRetries - Maximum number of retry attempts (default: 3)
 * @param {number} options.baseDelayMs - Base delay in milliseconds (default: 1000)
 * @param {number} options.maxDelayMs - Maximum delay in milliseconds (default: 30000)
 * @param {string} options.operationName - Name of the operation for logging (default: 'API call')
 * @param {Function} options.shouldRetry - Custom function to determine if error should be retried (optional)
 * @returns {Promise} - Result of the API call
 */
const retryTutorCruncherCall = async (apiCall, options = {}) => {
  const {
    maxRetries = 3,
    baseDelayMs = 1000,
    maxDelayMs = 30000,
    operationName = 'API call',
    shouldRetry = isTransientError,
  } = options;

  let lastError;
  
  for (let attempt = 1; attempt <= maxRetries + 1; attempt++) {
    try {
      const result = await apiCall();
      return result;
    } catch (error) {
      lastError = error;
      
      // Check if this is the last attempt
      const isLastAttempt = attempt > maxRetries;
      
      // Check if error should be retried
      const shouldRetryError = shouldRetry(error);
      
      if (!shouldRetryError || isLastAttempt) {
        // Don't retry - either not a transient error or out of retries
        if (isLastAttempt && shouldRetryError) {
          logger.error({ error: error.message }, `❌ ${operationName} failed after ${maxRetries} retries:`);
        }
        throw error;
      }

      // Get Retry-After header if present (for 429 errors)
      const retryAfter = error.response?.headers?.['retry-after'] 
        ? parseInt(error.response.headers['retry-after'], 10)
        : null;

      // Calculate delay
      const delay = calculateRetryDelay(attempt, baseDelayMs, maxDelayMs, retryAfter);
      
      const status = error.response?.status || error.code || 'network error';
      const delaySeconds = Math.ceil(delay / 1000);
      
      logger.warn({ data: retryAfter ? `(Rate limited, waiting ${retryAfter}s)` : `(Retrying in ${delaySeconds}s)` }, `⚠️  ${operationName} failed (attempt ${attempt}/${maxRetries + 1}): ${status}`);

      // Wait before retry
      await new Promise(resolve => setTimeout(resolve, delay));
    }
  }

  // Should never reach here, but just in case
  throw lastError;
};

/**
 * Wrapper for TutorCruncher API calls with automatic retry
 * @param {Function} apiCall - Async function that makes the API call
 * @param {Object} options - Retry options (same as retryTutorCruncherCall)
 * @returns {Promise} - Result of the API call
 */
const withRetry = (apiCall, options = {}) => {
  return retryTutorCruncherCall(apiCall, options);
};

module.exports = {
  retryTutorCruncherCall,
  withRetry,
  isTransientError,
  calculateRetryDelay,
};
