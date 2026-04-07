/**
 * Pagination Utilities
 * Provides pagination parsing and response formatting
 */

/**
 * Parse pagination parameters from request
 * @param {Object} req - Express request object
 * @param {number} defaultLimit - Default items per page
 * @param {number} maxLimit - Maximum items per page
 * @returns {Object} Pagination object with page, limit, offset
 */
function parsePagination(req, defaultLimit = 50, maxLimit = 200) {
  const page = Math.max(1, parseInt(req.query.page || req.query.page_num || '1', 10) || 1);
  const limit = Math.min(maxLimit, Math.max(1, parseInt(req.query.limit || req.query.per_page || String(defaultLimit), 10) || defaultLimit));
  const offset = (page - 1) * limit;

  return {
    page,
    limit,
    offset,
    totalPages: 0, // Will be calculated after getting total count
  };
}

/**
 * Create a paginated response object
 * @param {Array} data - Array of items for current page
 * @param {Object} pagination - Pagination object from parsePagination
 * @param {number} total - Total number of items across all pages
 * @returns {Object} Paginated response object
 */
function createPaginatedResponse(data, pagination, total) {
  const totalPages = Math.ceil(total / pagination.limit);
  const hasNext = pagination.page < totalPages;
  const hasPrev = pagination.page > 1;

  return {
    data,
    pagination: {
      page: pagination.page,
      limit: pagination.limit,
      total,
      totalPages,
      hasNext,
      hasPrev,
      nextPage: hasNext ? pagination.page + 1 : null,
      prevPage: hasPrev ? pagination.page - 1 : null,
    },
  };
}

module.exports = {
  parsePagination,
  createPaginatedResponse,
};

