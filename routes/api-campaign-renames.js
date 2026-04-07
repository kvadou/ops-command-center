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
      SELECT id, campaign, label, cost
      FROM campaign_renames
      ORDER BY id ASC
    `);
    res.json(result.rows);
  } catch (error) {
    logger.error({ err: error }, 'Error fetching campaign renames');
    res.status(500).send('Error fetching campaign renames');
  }
}));
router.post('/', asyncHandler(async (req, res) => {
  const {
    campaign,
    label,
    cost
  } = req.body;
  if (!campaign || !label) {
    return res.status(400).json({
      error: 'campaign and label are required'
    });
  }
  const costValue = cost || 0;
  try {
    const insertQuery = `
      INSERT INTO campaign_renames (campaign, label, cost)
      VALUES ($1, $2, $3)
      RETURNING *;
    `;
    const insertResult = await pool.query(insertQuery, [campaign, label, costValue]);
    res.status(201).json(insertResult.rows[0]);
  } catch (error) {
    logger.error({ err: error }, 'Error adding campaign rename');
    res.status(500).send('Error adding campaign rename');
  }
}));
router.put('/:id', asyncHandler(async (req, res) => {
  const {
    id
  } = req.params;
  const {
    campaign,
    label,
    cost
  } = req.body;
  if (!campaign || !label) {
    return res.status(400).json({
      error: 'campaign and label are required'
    });
  }
  const costValue = cost || 0;
  try {
    const updateQuery = `
      UPDATE campaign_renames
      SET campaign = $1,
        label = $2,
        cost = $3
      WHERE id = $4
      RETURNING *;
    `;
    const updateResult = await pool.query(updateQuery, [campaign, label, costValue, id]);
    if (updateResult.rowCount === 0) {
      return res.status(404).send('Campaign rename not found');
    }
    res.json(updateResult.rows[0]);
  } catch (error) {
    logger.error({ err: error }, 'Error updating campaign rename');
    res.status(500).send('Error updating campaign rename');
  }
}));
router.delete('/:id', asyncHandler(async (req, res) => {
  const {
    id
  } = req.params;
  try {
    const deleteQuery = 'DELETE FROM campaign_renames WHERE id = $1 RETURNING *;';
    const deleteResult = await pool.query(deleteQuery, [id]);
    if (deleteResult.rowCount === 0) {
      return res.status(404).send('Campaign rename not found');
    }
    res.json({
      message: 'Campaign rename deleted successfully'
    });
  } catch (error) {
    logger.error({ err: error }, 'Error deleting campaign rename');
    res.status(500).send('Error deleting campaign rename');
  }
}));
module.exports = router;