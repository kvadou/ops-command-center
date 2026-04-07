const express = require("express");
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
  TUTORCRUNCHER_API_BASE,
  TUTORCRUNCHER_API_TOKEN
} = global;
const router = express.Router();

// This endpoint delegates to syncServices() and guards against concurrent runs.
let SYNC_IN_PROGRESS = false;
router.get("/", asyncHandler(async (req, res) => {
  try {
    const { force } = req.query;
    if (force === "true") {
      await pool.query("UPDATE services SET remote_last_updated = NULL");
    }

    if (typeof syncServices !== "function") {
      throw new Error("syncServices not available");
    }

    if (SYNC_IN_PROGRESS) {
      return res.status(202).json({ message: "syncServices already running" });
    }
    SYNC_IN_PROGRESS = true;
    try {
      await syncServices();
      res.status(200).json({ message: "Services synchronized successfully (server-fns)" });
    } finally {
      SYNC_IN_PROGRESS = false;
    }
  } catch (error) {
    logger.error({ error: error?.message || error }, 'Error in /api/sync-services');
    res.status(500).json({ error: "Failed to synchronize services" });
  }
}));

module.exports = router;