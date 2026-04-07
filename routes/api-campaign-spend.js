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
const { logger } = require('../utils/logger');
const router = express.Router();
router.get('/', asyncHandler(async (req, res) => {
  try {
    const result = await pool.query(`
      SELECT id, campaign, month, year, total_cost AS "totalCost"
      FROM campaign_spend
      ORDER BY id ASC
    `);
    res.json(result.rows);
  } catch (error) {
    logger.error({ err: error }, 'Error fetching campaign spend records');
    res.status(500).send('Error fetching campaign spend records');
  }
}));
router.post('/', asyncHandler(async (req, res) => {
  const {
    campaign,
    month,
    year,
    totalCost
  } = req.body;
  if (!campaign || !month || !year) {
    return res.status(400).json({
      error: 'campaign, month, and year are required'
    });
  }
  const totalCostValue = totalCost || 0;
  try {
    const insertQuery = `
      INSERT INTO campaign_spend (campaign, month, year, total_cost)
      VALUES ($1, $2, $3, $4)
      RETURNING *;
    `;
    const insertResult = await pool.query(insertQuery, [campaign, month, year, totalCostValue]);
    res.status(201).json(insertResult.rows[0]);
  } catch (error) {
    logger.error({ err: error }, 'Error adding campaign spend record');
    res.status(500).send('Error adding campaign spend record');
  }
}));
router.put('/:id', asyncHandler(async (req, res) => {
  const {
    id
  } = req.params;
  const {
    campaign,
    month,
    year,
    totalCost
  } = req.body;
  if (!campaign || !month || !year) {
    return res.status(400).json({
      error: 'campaign, month, and year are required'
    });
  }
  const totalCostValue = totalCost || 0;
  try {
    const updateQuery = `
      UPDATE campaign_spend
      SET campaign = $1,
          month = $2,
          year = $3,
          total_cost = $4
      WHERE id = $5
      RETURNING *;
    `;
    const updateResult = await pool.query(updateQuery, [campaign, month, year, totalCostValue, id]);
    if (updateResult.rowCount === 0) {
      return res.status(404).send('Campaign spend record not found');
    }
    res.json(updateResult.rows[0]);
  } catch (error) {
    logger.error({ err: error }, 'Error updating campaign spend record');
    res.status(500).send('Error updating campaign spend record');
  }
}));
router.delete('/:id', asyncHandler(async (req, res) => {
  const {
    id
  } = req.params;
  try {
    const deleteQuery = 'DELETE FROM campaign_spend WHERE id = $1 RETURNING *;';
    const deleteResult = await pool.query(deleteQuery, [id]);
    if (deleteResult.rowCount === 0) {
      return res.status(404).send('Campaign spend record not found');
    }
    res.json({
      message: 'Campaign spend record deleted successfully'
    });
  } catch (error) {
    logger.error({ err: error }, 'Error deleting campaign spend record');
    res.status(500).send('Error deleting campaign spend record');
  }
}));
module.exports = router;