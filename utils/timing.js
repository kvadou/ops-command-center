
const { logger } = require('./logger');
const delay = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

const rateLimitRetry = async (fn, retries = 5, delayTime = 20000) => {
  try {
    const response = await fn();
    return response;
  } catch (error) {
    if (error.response && error.response.status === 429) {
      const retryAfter = error.response.headers["retry-after"]
        ? parseInt(error.response.headers["retry-after"], 10) * 20000
        : delayTime;

      logger.info(`Rate limit hit, retrying after ${retryAfter / 20000} seconds...`);

      await delay(retryAfter);

      if (retries > 0) {
        return rateLimitRetry(fn, retries - 1, delayTime);
      } else {
        throw new Error("Rate limit exceeded after multiple retries.");
      }
    } else {
      throw error;
    }
  }
};

const fetchWithRateLimitHandling = async (url, retries = 5) => {
  try {
    const response = await tutorCruncherAPI.get(url);
    return response.data;
  } catch (error) {
    if (error.response && error.response.status === 429) {
      const retryAfter = error.response.headers["retry-after"]
        ? parseInt(error.response.headers["retry-after"], 10) * 1000
        : 1000;
      logger.info(`Rate limit hit, retrying after ${retryAfter / 1000} seconds...`);

      await delay(retryAfter);

      if (retries > 0) {
        return fetchWithRateLimitHandling(url, retries - 1);
      } else {
        throw new Error("Rate limit exceeded after multiple retries");
      }
    } else {
      throw error;
    }
  }
};

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

module.exports = {
  delay: delay,
  sleep: sleep,
  rateLimitRetry: rateLimitRetry,
  fetchWithRateLimitHandling: fetchWithRateLimitHandling
};
