const express = require('express');
const { asyncHandler } = require('../middleware/error-handler');
const { logger } = require('../utils/logger');
const {
  pool,
  axios,
  cloudinary,
  tutorCruncherAPI,
  limitedGet,
  jwt,
  stripe,
  transporter,
  db,
  sequelize,
  Service,
  Location,
  ColourGroup,
  Appointment,
  delay,
  rateLimitRetry,
  auth,
  GRAVITY_FORMS_API_BASE_URL,
  KLAVIYO_API_KEY,
  LABEL_ID,
  TUTORCRUNCHER_API_BASE
} = global;
const router = express.Router();

// Rate limiting for reviews API to prevent connection exhaustion
const reviewRequestQueue = [];
let isProcessingQueue = false;

async function processReviewQueue() {
  if (isProcessingQueue || reviewRequestQueue.length === 0) return;
  
  isProcessingQueue = true;
  
  while (reviewRequestQueue.length > 0) {
    const { req, res, next } = reviewRequestQueue.shift();
    await handleReviewRequest(req, res, next);
    
    // Add small delay between requests to prevent overwhelming the database
    await new Promise(resolve => setTimeout(resolve, 50));
  }
  
  isProcessingQueue = false;
}

async function handleReviewRequest(req, res, next) {
  const {
    client_id,
    tutor_id,
    start_date,
    end_date
  } = req.query;
  
  try {
    const query = `
      SELECT 
        review_id, client_name, contractor_name, extra_attrs_value, 
        star_rating_value, date_created
      FROM reviews
      WHERE ($1::integer IS NULL OR client_id = $1::integer)
        AND ($2::integer IS NULL OR contractor_id = $2::integer)
        AND ($3::date IS NULL OR date_created >= $3::date)
        AND ($4::date IS NULL OR date_created <= $4::date)
    `;
    const values = [client_id ? parseInt(client_id, 10) : null, tutor_id ? parseInt(tutor_id, 10) : null, start_date || null, end_date || null];
    const reviewsResult = await pool.query(query, values);
    const countQuery = `
      SELECT COUNT(*) AS review_count
      FROM reviews
      WHERE ($1::integer IS NULL OR contractor_id = $1::integer)
        AND ($2::date IS NULL OR date_created >= $2::date)
        AND ($3::date IS NULL OR date_created <= $3::date)
    `;
    const countValues = [tutor_id ? parseInt(tutor_id, 10) : null, start_date || null, end_date || null];
    const countResult = await pool.query(countQuery, countValues);
    res.json({
      reviews: reviewsResult.rows,
      count: parseInt(countResult.rows[0].review_count, 10)
    });
  } catch (error) {
    logger.error({ err: error }, 'Error fetching reviews');
    res.status(500).json({
      error: 'Failed to fetch reviews.'
    });
  }
}
router.get('/', asyncHandler(async (req, res, next) => {
  // Add request to queue for rate limiting
  reviewRequestQueue.push({ req, res, next });
  
  // Process queue if not already processing
  if (!isProcessingQueue) {
    processReviewQueue();
  }
}));
module.exports = router;