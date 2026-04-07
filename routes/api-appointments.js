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
router.delete('/:id', asyncHandler(async (req, res) => {
  const {
    id
  } = req.params;
  try {
    const appointment = await Appointment.findByPk(id);
    if (appointment) {
      await appointment.destroy();
      res.json({
        message: 'Appointment deleted successfully'
      });
    } else {
      res.status(404).json({
        message: 'Appointment not found'
      });
    }
  } catch (error) {
    logger.error({ err: error }, 'Error deleting appointment');
    res.status(500).send('Error deleting appointment');
  }
}));
module.exports = router;