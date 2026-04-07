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

// Cache for labels to avoid repeated API calls
let labelsCache = {
  data: null,
  lastUpdated: null,
  ttl: 5 * 60 * 1000 // 5 minutes TTL
};

// Get all available labels from TutorCruncher (optimized with caching)
router.get('/', asyncHandler(async (req, res) => {
  try {
    const now = Date.now();
    
    // Check if we have valid cached data
    if (labelsCache.data && labelsCache.lastUpdated && 
        (now - labelsCache.lastUpdated) < labelsCache.ttl) {
      logger.info('📋 Using cached labels data');
      return res.json({
        success: true,
        labels: labelsCache.data,
        total: labelsCache.data.length,
        last_updated: new Date(labelsCache.lastUpdated).toISOString(),
        cached: true
      });
    }

    logger.info('🔄 Fetching fresh labels from TutorCruncher...');
    
    // Use the local database approach for better performance
    // This avoids the expensive API calls to deleted labels
    const locationPool = req.locationPool || pool;
    
    // Get labels from the labels table (proper integer IDs)
    const { rows } = await locationPool.query(`
      SELECT 
        l.id,
        l.name,
        l.color,
        l.active,
        COALESCE(usage_counts.usage_count, 0) as usage_count
      FROM labels l
      LEFT JOIN (
        SELECT 
          label_name,
          COUNT(*) as usage_count
        FROM (
          SELECT jsonb_array_elements_text(labels::jsonb) as label_name 
          FROM services 
          WHERE labels IS NOT NULL AND labels::text != '[]' AND labels::text != 'null'
        ) AS all_labels
        WHERE label_name IS NOT NULL AND label_name != ''
        GROUP BY label_name
      ) usage_counts ON LOWER(l.name) = LOWER(usage_counts.label_name)
      WHERE l.active = true
      ORDER BY usage_count DESC, l.name ASC
    `);
    
    const labelsWithCounts = rows.map(row => ({
      id: row.id, // Use integer ID from labels table
      name: row.name,
      description: `Label: ${row.name}`,
      color: row.color || '#1976d2',
      usage_count: parseInt(row.usage_count),
      is_local: true
    }));

    // Update cache
    labelsCache.data = labelsWithCounts;
    labelsCache.lastUpdated = now;

    logger.info(`✅ Successfully fetched ${labelsWithCounts.length} labels from local database`);
    
    res.json({
      success: true,
      labels: labelsWithCounts,
      total: labelsWithCounts.length,
      last_updated: new Date().toISOString(),
      cached: false
    });

  } catch (error) {
    logger.error({ err: error }, 'Error fetching labels:');
    
    // Fallback to hardcoded labels if everything fails
    const fallbackLabels = [
      { id: 277110, name: 'Club - Park Slope', description: 'Park Slope club location', color: '#4caf50', usage_count: 0 },
      { id: 291870, name: 'Club - UES', description: 'Upper East Side club location', color: '#4caf50', usage_count: 0 },
      { id: 261479, name: 'Home - NYC', description: 'New York City home lessons', color: '#2196f3', usage_count: 0 },
      { id: 262368, name: 'Online', description: 'Online lessons and activities', color: '#00bcd4', usage_count: 0 },
      { id: 276463, name: 'Sync to Website', description: 'Items synced to website', color: '#009688', usage_count: 0 }
    ];

    res.json({
      success: false,
      labels: fallbackLabels,
      total: fallbackLabels.length,
      last_updated: new Date().toISOString(),
      error: 'Using fallback labels due to error',
      api_error: error.message
    });
  }
}));

// Get user's label preferences
router.get('/preferences/:userId', asyncHandler(async (req, res) => {
  try {
    const { userId } = req.params;
    
    // In a real implementation, you'd fetch from a database
    // For now, we'll use localStorage on the frontend
    res.json({
      success: true,
      preferences: {
        visibleLabels: [],
        showAll: true,
        lastUpdated: null
      }
    });
  } catch (error) {
    logger.error({ err: error }, 'Error fetching label preferences:');
    res.status(500).json({
      success: false,
      error: 'Failed to fetch label preferences'
    });
  }
}));

// Save user's label preferences
router.post('/preferences/:userId', asyncHandler(async (req, res) => {
  try {
    const { userId } = req.params;
    const { visibleLabels, showAll } = req.body;
    
    // In a real implementation, you'd save to a database
    // For now, we'll handle this on the frontend with localStorage
    
    res.json({
      success: true,
      message: 'Label preferences saved successfully'
    });
  } catch (error) {
    logger.error({ err: error }, 'Error saving label preferences:');
    res.status(500).json({
      success: false,
      error: 'Failed to save label preferences'
    });
  }
}));

// Force refresh labels cache (admin endpoint)
router.post('/refresh', asyncHandler(async (req, res) => {
  try {
    logger.info('🔄 Force refreshing labels cache...');
    
    // Clear the cache
    labelsCache.data = null;
    labelsCache.lastUpdated = null;
    
    res.json({
      success: true,
      message: 'Labels cache cleared. Next request will fetch fresh data.',
      timestamp: new Date().toISOString()
    });
  } catch (error) {
    logger.error({ err: error }, 'Error refreshing labels cache:');
    res.status(500).json({
      success: false,
      error: 'Failed to refresh labels cache'
    });
  }
}));

// Get local/cached labels (for faster access)
router.get('/local', asyncHandler(async (req, res) => {
  try {
    logger.info('Fetching local labels from database...');
    
    // Use location-specific database connection
    const locationPool = req.locationPool || pool;
    
    // Query the local database for labels
    // Note: Only services table has labels column, appointments table doesn't
    const { rows } = await locationPool.query(`
      SELECT 
        l.id,
        l.name,
        l.color,
        l.active,
        COALESCE(usage_counts.usage_count, 0) as usage_count
      FROM labels l
      LEFT JOIN (
        SELECT 
          label_name,
          COUNT(*) as usage_count
        FROM (
          SELECT jsonb_array_elements_text(labels::jsonb) as label_name 
          FROM services 
          WHERE labels IS NOT NULL AND labels::text != '[]' AND labels::text != 'null'
        ) AS all_labels
        WHERE label_name IS NOT NULL AND label_name != ''
        GROUP BY label_name
      ) usage_counts ON LOWER(l.name) = LOWER(usage_counts.label_name)
      WHERE l.active = true
      ORDER BY usage_count DESC, l.name ASC
    `);
    
    const localLabels = rows.map(row => ({
      id: row.id, // Use integer ID from labels table
      name: row.name,
      description: `Local label: ${row.name}`,
      color: row.color || '#1976d2',
      usage_count: parseInt(row.usage_count),
      is_local: true
    }));
    
    logger.info(`Successfully fetched ${localLabels.length} local labels from database`);
    
    res.json({
      success: true,
      labels: localLabels,
      total: localLabels.length,
      last_updated: new Date().toISOString(),
      source: 'local_database'
    });

  } catch (error) {
    logger.error({ err: error }, 'Error fetching local labels:');
    
    res.status(500).json({
      success: false,
      error: 'Failed to fetch local labels',
      message: error.message
    });
  }
}));

module.exports = router;