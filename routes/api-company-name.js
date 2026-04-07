const express = require('express');
const router = express.Router();
const { logger } = require('../utils/logger');

router.get('/', (req, res) => {
  try {
    // Get the hostname from the request
    const hostname = req.get('host') || req.hostname || '';
    
    // Extract subdomain from hostname
    let companyName = 'Acme Operations (Main Branch)'; // Default to HQ
    
    if (hostname) {
      const subdomain = hostname.split('.')[0];
      
      switch (subdomain) {
        case 'eastside':
          companyName = 'Acme Operations Eastside';
          break;
        case 'westside':
          companyName = 'Acme Operations Westside';
          break;
        case 'join':
          companyName = 'Acme Operations (Main Branch)';
          break;
        default:
          // For localhost or other domains, check environment variable
          companyName = process.env.COMPANY_NAME || 'Acme Operations (Main Branch)';
      }
    } else {
      // Fallback to environment variable if hostname is not available
      companyName = process.env.COMPANY_NAME || 'Acme Operations (Main Branch)';
    }
    
    // Ensure response is sent properly
    if (!res.headersSent) {
      res.json({ companyName });
    }
  } catch (error) {
    logger.error({ err: error }, 'Error in company-name route');
    // Always return a valid JSON response, even on error
    if (!res.headersSent) {
      res.status(200).json({ 
        companyName: process.env.COMPANY_NAME || 'Acme Operations (Main Branch)',
        error: 'Failed to determine company name'
      });
    }
  }
});

module.exports = router;