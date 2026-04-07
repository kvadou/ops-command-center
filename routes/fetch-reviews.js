const express = require('express');
const { asyncHandler } = require('../middleware/error-handler');
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
router.get('/', asyncHandler(async (req, res) => {
  try {
    console.log('Fetching reviews from TutorCruncher API...');
    let url = 'reviews';
    let allReviews = [];
    while (url) {
      const response = await tutorCruncherAPI.get(url);
      allReviews = [...allReviews, ...response.data.results];
      url = response.data.next;
    }
    console.log(`Fetched ${allReviews.length} reviews.`);
    const client = await pool.connect();
    try {
      console.log('Inserting/Updating reviews in the database...');
      for (const review of allReviews) {
        const reviewId = review.id;
        const clientId = review.client.id;
        const clientName = `${review.client.first_name} ${review.client.last_name}`;
        const contractorId = review.contractor.id;
        const contractorName = `${review.contractor.first_name} ${review.contractor.last_name}`;
        const dateCreated = review.date_created;
        const reviewTextAttr = review.extra_attrs.find(attr => attr.machine_name === 'review_details');
        const reviewTextValue = reviewTextAttr ? reviewTextAttr.value : null;
        const starRatingAttr = review.extra_attrs.find(attr => attr.machine_name === 'review_stars');
        const starRatingValue = starRatingAttr ? parseFloat(starRatingAttr.value.match(/^\d+/)?.[0]) : null;
        await client.query(`
        INSERT INTO reviews (
          review_id, client_id, client_name, contractor_id, contractor_name, 
          extra_attrs_value, star_rating_value, date_created
        )
        VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
        ON CONFLICT (review_id) DO UPDATE
        SET 
          client_name = $3, contractor_name = $5, 
          extra_attrs_value = $6, star_rating_value = $7, date_created = $8
        `, [reviewId, clientId, clientName, contractorId, contractorName, reviewTextValue, starRatingValue, dateCreated]);
      }
      console.log('Reviews successfully saved to the database.');
      res.status(200).json({
        message: 'Reviews fetched and stored successfully.'
      });
    } finally {
      client.release();
    }
  } catch (error) {
    console.error('Error fetching or saving reviews:', error);
    res.status(500).json({
      error: 'Failed to fetch and store reviews.'
    });
  }
}));
module.exports = router;