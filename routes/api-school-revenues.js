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
router.post('/', asyncHandler(async (req, res) => {
  const {
    school_name,
    month,
    revenue
  } = req.body;
  try {
    const parsedMonth = new Date(month);
    await pool.query('INSERT INTO school_revenues (school_name, month, revenue) VALUES ($1, $2, $3)', [school_name, parsedMonth, revenue]);
    res.status(201).send('School revenue added successfully');
  } catch (error) {
    logger.error({ err: error }, 'Error adding school revenue:');
    res.status(500).send('Error adding school revenue');
  }
}));
router.put('/:id', asyncHandler(async (req, res) => {
  const {
    id
  } = req.params;
  const {
    school_name,
    month,
    revenue
  } = req.body;
  try {
    const parsedMonth = new Date(month);
    await pool.query('UPDATE school_revenues SET school_name = $1, month = $2, revenue = $3 WHERE id = $4', [school_name, parsedMonth, revenue, id]);
    res.send('School revenue updated successfully');
  } catch (error) {
    logger.error({ err: error }, 'Error updating school revenue:');
    res.status(500).send('Error updating school revenue');
  }
}));
router.get('/', asyncHandler(async (req, res) => {
  try {
    const result = await pool.query('SELECT * FROM school_revenues');
    res.json(result.rows);
  } catch (error) {
    logger.error({ err: error }, 'Error fetching school revenues:');
    res.status(500).send('Error fetching school revenues');
  }
}));
router.delete('/:id', asyncHandler(async (req, res) => {
  const {
    id
  } = req.params;
  try {
    const result = await pool.query('DELETE FROM school_revenues WHERE id = $1', [id]);
    if (result.rowCount === 0) {
      return res.status(404).send('School revenue not found.');
    }
    res.status(204).send();
  } catch (error) {
    logger.error({ err: error }, 'Error deleting school revenue:');
    res.status(500).send('Error deleting school revenue');
  }
}));
module.exports = router;