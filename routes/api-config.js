/**
 * Public Configuration API Routes
 * Provides public configuration values needed by the frontend
 */

const express = require('express');
const router = express.Router();
const { logger } = require('../utils/logger');

/**
 * GET /api/config/stripe-publishable-key
 * Returns the Stripe publishable key for frontend use
 * This is a public endpoint as publishable keys are safe to expose
 */
router.get('/stripe-publishable-key', (req, res) => {
  try {
    // Get publishable key from environment
    // Support both STRIPE_PUBLISHABLE_KEY and VITE_STRIPE_PUBLISHABLE_KEY
    const publishableKey = process.env.STRIPE_PUBLISHABLE_KEY || 
                          process.env.VITE_STRIPE_PUBLISHABLE_KEY;
    
    if (!publishableKey) {
      return res.status(500).json({
        error: 'Stripe publishable key not configured',
        message: 'STRIPE_PUBLISHABLE_KEY environment variable is not set'
      });
    }
    
    res.json({
      publishableKey: publishableKey
    });
  } catch (error) {
    logger.error({ err: error }, '[api-config] Error getting Stripe publishable key');
    res.status(500).json({
      error: 'Failed to retrieve Stripe publishable key',
      message: error.message
    });
  }
});

module.exports = router;
