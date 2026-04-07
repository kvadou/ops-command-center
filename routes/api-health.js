/**
 * Health Check Endpoints
 * Provides health status for monitoring systems (Heroku, Papertrail, etc.)
 */

const express = require('express');
const { Pool } = require('pg');
const axios = require('axios');
const { logError, logBusinessEvent } = require('../utils/logger');
const { asyncHandler } = require('../middleware/error-handler');

const router = express.Router();

/**
 * Basic health check endpoint
 * Used by Heroku and monitoring systems
 */
router.get('/', asyncHandler(async (req, res) => {
  try {
    res.status(200).json({
      status: 'healthy',
      timestamp: new Date().toISOString(),
      uptime: process.uptime(),
      environment: process.env.NODE_ENV || 'development',
    });
  } catch (error) {
    logError(error, { route: '/api/health' });
    res.status(500).json({
      status: 'unhealthy',
      error: error.message,
      timestamp: new Date().toISOString(),
    });
  }
}));

/**
 * Detailed health check endpoint
 * Checks database, external APIs, and dependencies
 */
router.get('/detailed', asyncHandler(async (req, res) => {
  const health = {
    status: 'healthy',
    timestamp: new Date().toISOString(),
    uptime: process.uptime(),
    environment: process.env.NODE_ENV || 'development',
    checks: {
      database: { status: 'unknown', message: '', responseTime: 0 },
      tutorcruncher: { status: 'unknown', message: '', responseTime: 0 },
      memory: { status: 'unknown', message: '', usage: 0 },
    },
  };

  try {
    // Check database connection
    const dbStartTime = Date.now();
    try {
      const pool = new Pool({
        connectionString: process.env.DATABASE_URL,
        ssl: process.env.NODE_ENV === 'production' ? { rejectUnauthorized: false } : false,
        max: 1,
        idleTimeoutMillis: 5000,
      });
      
      await pool.query('SELECT NOW()');
      await pool.end();
      
      const dbResponseTime = Date.now() - dbStartTime;
      health.checks.database = {
        status: 'healthy',
        message: 'Database connection successful',
        responseTime: dbResponseTime,
      };
    } catch (dbError) {
      health.checks.database = {
        status: 'unhealthy',
        message: dbError.message,
        responseTime: Date.now() - dbStartTime,
      };
      health.status = 'degraded';
    }

    // Check TutorCruncher API (if configured)
    if (process.env.TUTORCRUNCHER_API_TOKEN && process.env.TUTORCRUNCHER_API_BASE) {
      const apiStartTime = Date.now();
      try {
        const response = await axios.get(
          `${process.env.TUTORCRUNCHER_API_BASE}services/`,
          {
            headers: {
              Authorization: `token ${process.env.TUTORCRUNCHER_API_TOKEN}`,
            },
            timeout: 5000,
          }
        );
        
        const apiResponseTime = Date.now() - apiStartTime;
        health.checks.tutorcruncher = {
          status: 'healthy',
          message: 'TutorCruncher API accessible',
          responseTime: apiResponseTime,
        };
      } catch (apiError) {
        health.checks.tutorcruncher = {
          status: 'unhealthy',
          message: apiError.message,
          responseTime: Date.now() - apiStartTime,
        };
        health.status = 'degraded';
      }
    } else {
      health.checks.tutorcruncher = {
        status: 'unknown',
        message: 'TutorCruncher API not configured',
        responseTime: 0,
      };
    }

    // Check memory usage
    const memUsage = process.memoryUsage();
    const memUsageMB = {
      rss: Math.round(memUsage.rss / 1024 / 1024),
      heapTotal: Math.round(memUsage.heapTotal / 1024 / 1024),
      heapUsed: Math.round(memUsage.heapUsed / 1024 / 1024),
      external: Math.round(memUsage.external / 1024 / 1024),
    };

    // Warn if memory usage is high (>500MB RSS)
    const memoryStatus = memUsageMB.rss > 500 ? 'warning' : 'healthy';
    if (memoryStatus === 'warning') {
      health.status = health.status === 'healthy' ? 'degraded' : health.status;
    }

    health.checks.memory = {
      status: memoryStatus,
      message: `Memory usage: ${memUsageMB.rss}MB RSS, ${memUsageMB.heapUsed}MB heap`,
      usage: memUsageMB,
    };

    // Determine overall status
    if (health.checks.database.status === 'unhealthy') {
      health.status = 'unhealthy';
    }

    // Log health check
    logBusinessEvent('health_check', {
      status: health.status,
      environment: health.environment,
      databaseStatus: health.checks.database.status,
      tutorcruncherStatus: health.checks.tutorcruncher.status,
      memoryUsage: memUsageMB.rss,
    });

    const statusCode = health.status === 'healthy' ? 200 : 
                      health.status === 'degraded' ? 200 : 503;
    
    res.status(statusCode).json(health);
  } catch (error) {
    logError(error, { route: '/api/health/detailed' });
    health.status = 'unhealthy';
    health.error = error.message;
    res.status(503).json(health);
  }
}));

/**
 * Readiness check endpoint
 * Used by Kubernetes/container orchestration
 */
router.get('/ready', asyncHandler(async (req, res) => {
  try {
    // Check if application is ready to serve traffic
    const pool = new Pool({
      connectionString: process.env.DATABASE_URL,
      ssl: process.env.NODE_ENV === 'production' ? { rejectUnauthorized: false } : false,
      max: 1,
      idleTimeoutMillis: 5000,
    });

    await pool.query('SELECT 1');
    await pool.end();

    res.status(200).json({
      status: 'ready',
      timestamp: new Date().toISOString(),
    });
  } catch (error) {
    logError(error, { route: '/api/health/ready' });
    res.status(503).json({
      status: 'not ready',
      error: error.message,
      timestamp: new Date().toISOString(),
    });
  }
}));

/**
 * Liveness check endpoint
 * Used by Kubernetes/container orchestration
 */
router.get('/live', (req, res) => {
  res.status(200).json({
    status: 'alive',
    timestamp: new Date().toISOString(),
    uptime: process.uptime(),
  });
});

module.exports = router;

