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
router.get('/bookings', asyncHandler(async (req, res) => {
  const {
    startDate,
    endDate
  } = req.query;
  try {
    let query = 'SELECT * FROM gravity_bookings WHERE payment_successful IN ($1, $2)';
    const params = ['true', 'true - send'];
    if (startDate && endDate) {
      query += ' AND date_created BETWEEN $3 AND $4';
      params.push(startDate, endDate);
    }
    const dbEntries = await pool.query(query, params);
    res.json(dbEntries.rows);
  } catch (error) {
    console.error('Error fetching booking data from DB:', error);
    res.status(500).send('Error fetching booking data');
  }
}));
router.get('/fetch-bookings', asyncHandler(async (req, res) => {
  const formId = 1;
  const axiosInstance = createAxiosInstance();
  try {
    const allEntries = await fetchAllFormEntries(formId, axiosInstance);
    console.log('First 5 Gravity Forms entries:', JSON.stringify(allEntries.slice(0, 5), null, 2));
    await saveEntriesToDB(allEntries, formId);
    const dbEntries = await pool.query('SELECT * FROM gravity_bookings');
    res.json(dbEntries.rows);
  } catch (error) {
    console.error('Error fetching/saving Booking Form data:', error);
    res.status(500).send('Error processing Booking Form data');
  }
}));
module.exports = router;