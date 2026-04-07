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
router.post('/bulk', asyncHandler(async (req, res) => {
  const {
    contractorIds
  } = req.body;
  if (!Array.isArray(contractorIds) || contractorIds.length === 0) {
    return res.status(400).json({
      error: 'Contractor IDs are required.'
    });
  }
  const results = [];
  const failedRequests = [];
  const delay = ms => new Promise(resolve => setTimeout(resolve, ms));
  try {
    logger.info('ðŸ”¹ Checking which contractors already have labels...');
    const {
      rows: existingLabels
    } = await pool.query(`
      SELECT contractor_id FROM tutor_labels
      WHERE labels IS NOT NULL AND labels <> ''
      AND contractor_id = ANY($1);
      `, [contractorIds]);
    const existingContractorIds = existingLabels.map(row => row.contractor_id);
    const contractorsWithoutLabels = contractorIds.filter(id => !existingContractorIds.includes(id));
    logger.info(`ðŸŸ¡ ${contractorsWithoutLabels.length} contractors are missing labels and will be processed first.`);
    const orderedContractorIds = [...contractorsWithoutLabels, ...existingContractorIds];
    for (const contractorId of orderedContractorIds) {
      try {
        logger.info(`ðŸ”¹ Fetching labels for contractor ${contractorId}...`);
        const response = await tutorCruncherAPI.get(`/contractors/${contractorId}/`);
        const labels = response.data.labels || [];
        const labelNames = labels.map(label => label.name).join(', ');
        const updatedAt = new Date();
        await pool.query(`
          INSERT INTO tutor_labels (contractor_id, labels, updated_at)
          VALUES ($1, $2, $3)
          ON CONFLICT (contractor_id)
          DO UPDATE SET labels = $2, updated_at = $3;
          `, [contractorId, labelNames, updatedAt]);
        logger.info(`âœ… Processed contractor ${contractorId}`);
        results.push({
          contractorId,
          labels: labels.map(label => label.name)
        });
      } catch (error) {
        logger.error({ error: error.message }, `âŒ Error processing contractor ${contractorId}:`);
        failedRequests.push({
          contractorId,
          error: error.message
        });
      }
      await delay(1000);
    }
    logger.info('âœ… Bulk label fetch completed.');
    res.status(200).json({
      message: 'Labels fetched and saved successfully.',
      results,
      failedRequests
    });
  } catch (error) {
    logger.error({ error: error.message }, 'âŒ Error during bulk label fetch:');
    res.status(500).json({
      error: 'Failed to fetch tutor labels in bulk.'
    });
  }
}));
module.exports = router;