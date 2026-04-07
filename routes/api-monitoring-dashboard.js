const express = require('express');
const { tableExists: schemaTableExists } = require('../utils/schema-cache');
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
const { getPool, getAllPoolStats } = require('../database-connections');
const { asyncHandler } = require('../middleware/error-handler');
const { logger } = require('../utils/logger');

// Performance thresholds
const PERFORMANCE_THRESHOLDS = {
  query_time: {
    excellent: 100,    // < 100ms
    good: 500,         // < 500ms
    warning: 1000,     // < 1000ms
    critical: 2000     // > 2000ms
  },
  connection_utilization: {
    low: 30,           // < 30%
    normal: 70,        // < 70%
    high: 85,          // < 85%
    critical: 95       // > 95%
  },
  error_rate: {
    excellent: 0.1,    // < 0.1%
    good: 1.0,         // < 1%
    warning: 5.0,      // < 5%
    critical: 10.0     // > 10%
  }
};

// Get comprehensive dashboard data
router.get('/dashboard', asyncHandler(async (req, res) => {
  try {
    const environment = req.query.env || 'production';
    const pool = getPool(environment);
    
    logger.info(`📊 Generating monitoring dashboard for ${environment}...`);
    
    // Get all monitoring data in parallel
    const [
      poolStats,
      performanceMetrics,
      indexStats,
      tableStats,
      recentErrors,
      healthStatus
    ] = await Promise.all([
      getAllPoolStats(),
      getPerformanceMetrics(pool),
      getIndexUsageStats(pool),
      getTableStatistics(pool),
      getRecentErrors(pool),
      getHealthStatus(pool)
    ]);
    
    // Calculate overall health score
    const healthScore = calculateHealthScore(performanceMetrics, poolStats, recentErrors);
    
    // Generate alerts
    const alerts = generateAlerts(performanceMetrics, poolStats, recentErrors);
    
    const dashboardData = {
      timestamp: new Date().toISOString(),
      environment,
      health: {
        score: healthScore,
        status: getHealthStatus(healthScore),
        details: healthStatus
      },
      performance: performanceMetrics,
      connections: poolStats,
      indexes: indexStats,
      tables: tableStats,
      errors: recentErrors,
      alerts,
      thresholds: PERFORMANCE_THRESHOLDS
    };
    
    res.json(dashboardData);
    
  } catch (error) {
    logger.error({ err: error }, '❌ Error generating monitoring dashboard:');
    res.status(500).json({
      error: 'Failed to generate monitoring dashboard',
      message: error.message,
      timestamp: new Date().toISOString()
    });
  }
}));

// Get performance metrics
async function getPerformanceMetrics(pool) {
  const startTime = Date.now();
  
  try {
    // Test complex query performance
    const queryStart = Date.now();
    const testQuery = `
      SELECT COUNT(*) as appointment_count
      FROM appointments a
      JOIN appointment_recipients ar ON ar.appointment_id = a.appointment_id
      JOIN services s ON a.service_id = s.service_id
      WHERE a.start >= NOW() - INTERVAL '30 days'
        AND a.status IN ('complete', 'cancelled-chargeable')
        AND ar.status <> 'missed';
    `;
    
    const result = await pool.query(testQuery);
    const queryDuration = Date.now() - queryStart;
    
    // Get database size
    const dbSizeResult = await pool.query(`
      SELECT 
        pg_size_pretty(pg_database_size(current_database())) as "Database Size",
        pg_size_pretty(pg_total_relation_size('appointments')) as "Appointments Size",
        pg_size_pretty(pg_total_relation_size('appointment_recipients')) as "Recipients Size",
        pg_size_pretty(pg_total_relation_size('services')) as "Services Size"
    `);
    
    // Get active connections
    const connectionsResult = await pool.query(`
      SELECT 
        count(*) as total_connections,
        count(*) FILTER (WHERE state = 'active') as active_connections,
        count(*) FILTER (WHERE state = 'idle') as idle_connections,
        count(*) FILTER (WHERE state = 'idle in transaction') as idle_in_transaction
      FROM pg_stat_activity 
      WHERE datname = current_database();
    `);
    
    const totalTime = Date.now() - startTime;
    
    return {
      query_performance: {
        duration_ms: queryDuration,
        status: getPerformanceStatus(queryDuration, PERFORMANCE_THRESHOLDS.query_time),
        appointments_found: parseInt(result.rows[0].appointment_count)
      },
      database_size: dbSizeResult.rows[0],
      connections: connectionsResult.rows[0],
      total_metrics_time_ms: totalTime
    };
    
  } catch (error) {
    logger.error({ err: error }, 'Error getting performance metrics:');
    return {
      error: error.message,
      total_metrics_time_ms: Date.now() - startTime
    };
  }
}

// Get index usage statistics
async function getIndexUsageStats(pool) {
  try {
    const result = await pool.query(`
      SELECT 
        schemaname,
        relname as tablename,
        indexrelname as indexname,
        idx_tup_read as index_reads,
        idx_tup_fetch as index_fetches,
        CASE 
          WHEN idx_tup_read > 0 
          THEN ROUND((idx_tup_fetch::numeric / idx_tup_read::numeric) * 100, 2)
          ELSE 0 
        END as hit_ratio_percent,
        pg_size_pretty(pg_relation_size(indexrelid)) as index_size
      FROM pg_stat_user_indexes 
      WHERE schemaname = 'public'
        AND idx_tup_read > 0
      ORDER BY idx_tup_read DESC
      LIMIT 20;
    `);
    
    return {
      top_indexes: result.rows,
      total_indexes: result.rows.length
    };
    
  } catch (error) {
    logger.error({ err: error }, 'Error getting index stats:');
    return { error: error.message };
  }
}

// Get table statistics
async function getTableStatistics(pool) {
  try {
    const result = await pool.query(`
      SELECT 
        schemaname,
        relname as tablename,
        n_live_tup as live_tuples,
        n_dead_tup as dead_tuples,
        n_tup_ins as inserts,
        n_tup_upd as updates,
        n_tup_del as deletes,
        last_autovacuum,
        last_autoanalyze,
        pg_size_pretty(pg_total_relation_size(relid)) as table_size
      FROM pg_stat_user_tables 
      WHERE schemaname = 'public'
      ORDER BY n_live_tup DESC
      LIMIT 15;
    `);
    
    return {
      top_tables: result.rows,
      total_tables: result.rows.length
    };
    
  } catch (error) {
    logger.error({ err: error }, 'Error getting table stats:');
    return { error: error.message };
  }
}

// Get recent errors
async function getRecentErrors(pool) {
  try {
    // Check if error_logs table exists (cached)
    const errorLogsExists = await schemaTableExists(pool, 'error_logs');

    if (errorLogsExists) {
      const result = await pool.query(`
        SELECT 
          error_type,
          COUNT(*) as error_count,
          MAX(created_at) as last_error
        FROM error_logs 
        WHERE created_at >= NOW() - INTERVAL '24 hours'
        GROUP BY error_type
        ORDER BY error_count DESC
        LIMIT 10;
      `);
      
      return {
        recent_errors: result.rows,
        total_error_types: result.rows.length
      };
    } else {
      return {
        recent_errors: [],
        total_error_types: 0,
        note: 'error_logs table not found'
      };
    }
    
  } catch (error) {
    logger.error({ err: error }, 'Error getting recent errors:');
    return { error: error.message };
  }
}

// Get health status
async function getHealthStatus(pool) {
  try {
    const checks = await Promise.allSettled([
      // Database connectivity
      pool.query('SELECT 1 as health_check'),
      
      // Check for long-running queries
      pool.query(`
        SELECT count(*) as long_queries
        FROM pg_stat_activity 
        WHERE state = 'active' 
        AND query_start < NOW() - INTERVAL '30 seconds'
        AND datname = current_database();
      `),
      
      // Check for locks
      pool.query(`
        SELECT count(*) as blocked_queries
        FROM pg_stat_activity 
        WHERE wait_event_type = 'Lock'
        AND datname = current_database();
      `)
    ]);
    
    const [connectivity, longQueries, blockedQueries] = checks;
    
    return {
      database_connectivity: connectivity.status === 'fulfilled' ? 'healthy' : 'unhealthy',
      long_running_queries: longQueries.status === 'fulfilled' ? parseInt(longQueries.value.rows[0].long_queries) : 'unknown',
      blocked_queries: blockedQueries.status === 'fulfilled' ? parseInt(blockedQueries.value.rows[0].blocked_queries) : 'unknown',
      timestamp: new Date().toISOString()
    };
    
  } catch (error) {
    logger.error({ err: error }, 'Error getting health status:');
    return {
      database_connectivity: 'error',
      error: error.message,
      timestamp: new Date().toISOString()
    };
  }
}

// Calculate overall health score
function calculateHealthScore(performance, connections, errors) {
  let score = 100;
  
  // Query performance impact
  if (performance.query_performance) {
    const queryTime = performance.query_performance.duration_ms;
    if (queryTime > PERFORMANCE_THRESHOLDS.query_time.critical) score -= 30;
    else if (queryTime > PERFORMANCE_THRESHOLDS.query_time.warning) score -= 15;
    else if (queryTime > PERFORMANCE_THRESHOLDS.query_time.good) score -= 5;
  }
  
  // Connection utilization impact
  Object.values(connections).forEach(conn => {
    if (conn && conn.utilizationPercent > PERFORMANCE_THRESHOLDS.connection_utilization.critical) score -= 25;
    else if (conn && conn.utilizationPercent > PERFORMANCE_THRESHOLDS.connection_utilization.high) score -= 10;
  });
  
  // Error impact
  if (errors.recent_errors && errors.recent_errors.length > 0) {
    const totalErrors = errors.recent_errors.reduce((sum, err) => sum + parseInt(err.error_count), 0);
    if (totalErrors > 100) score -= 20;
    else if (totalErrors > 50) score -= 10;
    else if (totalErrors > 10) score -= 5;
  }
  
  return Math.max(0, score);
}

// Get health status text
function getHealthStatus(score) {
  if (score >= 90) return 'excellent';
  if (score >= 75) return 'good';
  if (score >= 50) return 'warning';
  return 'critical';
}

// Get performance status
function getPerformanceStatus(duration, thresholds) {
  if (duration < thresholds.excellent) return 'excellent';
  if (duration < thresholds.good) return 'good';
  if (duration < thresholds.warning) return 'warning';
  return 'critical';
}

// Generate alerts
function generateAlerts(performance, connections, errors) {
  const alerts = [];
  
  // Query performance alerts
  if (performance.query_performance) {
    const queryTime = performance.query_performance.duration_ms;
    if (queryTime > PERFORMANCE_THRESHOLDS.query_time.critical) {
      alerts.push({
        type: 'critical',
        category: 'performance',
        message: `Query performance critical: ${queryTime}ms`,
        threshold: PERFORMANCE_THRESHOLDS.query_time.critical
      });
    } else if (queryTime > PERFORMANCE_THRESHOLDS.query_time.warning) {
      alerts.push({
        type: 'warning',
        category: 'performance',
        message: `Query performance degraded: ${queryTime}ms`,
        threshold: PERFORMANCE_THRESHOLDS.query_time.warning
      });
    }
  }
  
  // Connection utilization alerts
  Object.entries(connections).forEach(([env, conn]) => {
    if (conn && conn.utilizationPercent > PERFORMANCE_THRESHOLDS.connection_utilization.critical) {
      alerts.push({
        type: 'critical',
        category: 'connections',
        message: `Connection utilization critical in ${env}: ${conn.utilizationPercent}%`,
        threshold: PERFORMANCE_THRESHOLDS.connection_utilization.critical
      });
    }
  });
  
  // Error alerts
  if (errors.recent_errors && errors.recent_errors.length > 0) {
    const totalErrors = errors.recent_errors.reduce((sum, err) => sum + parseInt(err.error_count), 0);
    if (totalErrors > 100) {
      alerts.push({
        type: 'critical',
        category: 'errors',
        message: `High error rate: ${totalErrors} errors in last 24h`,
        threshold: 100
      });
    }
  }
  
  return alerts;
}

// Get quick health check
router.get('/health', asyncHandler(async (req, res) => {
  try {
    const environment = req.query.env || 'production';
    const pool = getPool(environment);
    
    const startTime = Date.now();
    const result = await pool.query('SELECT 1 as health_check, NOW() as timestamp');
    const responseTime = Date.now() - startTime;
    
    res.json({
      status: 'healthy',
      environment,
      response_time_ms: responseTime,
      timestamp: result.rows[0].timestamp,
      uptime: process.uptime()
    });
    
  } catch (error) {
    res.status(500).json({
      status: 'unhealthy',
      error: error.message,
      timestamp: new Date().toISOString()
    });
  }
}));

module.exports = router;
