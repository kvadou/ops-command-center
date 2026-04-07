/**
 * DevOps Hub API Routes
 * Handles alerts, monitoring, and system health
 */

const express = require('express');
const router = express.Router();
const { Pool } = require('pg');
const { asyncHandler } = require('../middleware/error-handler');
const { logger } = require('../utils/logger');

// Handle local development database connection
const isLocal = process.env.DATABASE_URL?.includes('localhost') || 
                process.env.DATABASE_URL?.includes('127.0.0.1') ||
                !process.env.DATABASE_URL?.includes('amazonaws.com');

// For local development, use local database URL if set, otherwise fallback to local default
const localDbUrl = 'postgres://user:REPLACE_ME@localhost:5432/acme_ops_demo';
const dbUrl = (isLocal && process.env.DATABASE_URL) 
  ? process.env.DATABASE_URL 
  : (process.env.DATABASE_URL || localDbUrl);

const pool = new Pool({
  connectionString: dbUrl,
  ssl: !isLocal ? { rejectUnauthorized: false } : false
});

// Test database connection on startup
pool.on('error', (err) => {
  logger.error({ err: err }, '❌ DevOps API database pool error:');
});

// Log database connection status
pool.query('SELECT NOW()')
  .then(() => {
    logger.info(`✅ DevOps API connected to ${isLocal ? 'local' : 'production'} database`);
  })
  .catch((err) => {
    logger.error({ error: err.message }, '❌ DevOps API database connection failed:');
    if (isLocal) {
      logger.error('💡 Make sure your local PostgreSQL database is running and DATABASE_URL is set correctly');
    }
  });

/**
 * Get all alerts with filtering
 */
router.get('/alerts', asyncHandler(async (req, res) => {
  try {
    const {
      status,
      severity,
      environment,
      alert_type,
      source,
      limit = 100,
      offset = 0,
      order_by = 'created_at',
      order_direction = 'DESC'
    } = req.query;

    let query = 'SELECT * FROM devops_alerts WHERE 1=1';
    const params = [];
    let paramCount = 1;

    // Only add filters if they have non-empty values
    if (status && status.trim() !== '') {
      query += ` AND status = $${paramCount++}`;
      params.push(status);
    }

    if (severity && severity.trim() !== '') {
      query += ` AND severity = $${paramCount++}`;
      params.push(severity);
    }

    if (environment && environment.trim() !== '') {
      query += ` AND environment = $${paramCount++}`;
      params.push(environment);
    }

    if (alert_type && alert_type.trim() !== '') {
      query += ` AND alert_type = $${paramCount++}`;
      params.push(alert_type);
    }

    if (source && source.trim() !== '') {
      query += ` AND source = $${paramCount++}`;
      params.push(source);
    }

    // Validate order_by to prevent SQL injection
    const validOrderBy = ['created_at', 'updated_at', 'severity', 'environment', 'alert_type'];
    const orderBy = validOrderBy.includes(order_by) ? order_by : 'created_at';
    const orderDir = order_direction.toUpperCase() === 'ASC' ? 'ASC' : 'DESC';

    query += ` ORDER BY ${orderBy} ${orderDir}`;
    query += ` LIMIT $${paramCount++} OFFSET $${paramCount++}`;
    params.push(parseInt(limit), parseInt(offset));

    const result = await pool.query(query, params);

    // Get total count
    let countQuery = 'SELECT COUNT(*) FROM devops_alerts WHERE 1=1';
    const countParams = [];
    paramCount = 1;

    // Only add filters if they have non-empty values (same as main query)
    if (status && status.trim() !== '') {
      countQuery += ` AND status = $${paramCount++}`;
      countParams.push(status);
    }
    if (severity && severity.trim() !== '') {
      countQuery += ` AND severity = $${paramCount++}`;
      countParams.push(severity);
    }
    if (environment && environment.trim() !== '') {
      countQuery += ` AND environment = $${paramCount++}`;
      countParams.push(environment);
    }
    if (alert_type && alert_type.trim() !== '') {
      countQuery += ` AND alert_type = $${paramCount++}`;
      countParams.push(alert_type);
    }
    if (source && source.trim() !== '') {
      countQuery += ` AND source = $${paramCount++}`;
      countParams.push(source);
    }

    const countResult = await pool.query(countQuery, countParams);
    const total = parseInt(countResult.rows[0].count);

    res.json({
      alerts: result.rows,
      total,
      limit: parseInt(limit),
      offset: parseInt(offset)
    });
  } catch (error) {
    logger.error({ err: error }, 'Error fetching alerts:');
    res.status(500).json({ 
      error: 'Failed to fetch alerts',
      message: error.message,
      details: process.env.NODE_ENV === 'development' ? error.stack : undefined
    });
  }
}));

/**
 * Get alert statistics
 */
router.get('/alerts/stats', asyncHandler(async (req, res) => {
  try {
    // Optimized query using subqueries and indexes for better performance
    // This reduces the number of full table scans needed
    const stats = await pool.query(`
      WITH base_counts AS (
        SELECT 
          COUNT(*) as total,
          COUNT(*) FILTER (WHERE status = 'open') as open,
          COUNT(*) FILTER (WHERE status = 'acknowledged') as acknowledged,
          COUNT(*) FILTER (WHERE status = 'resolved') as resolved,
          COUNT(*) FILTER (WHERE severity = 'critical') as critical_total,
          COUNT(*) FILTER (WHERE severity = 'high') as high_total,
          COUNT(*) FILTER (WHERE severity = 'medium') as medium_total,
          COUNT(*) FILTER (WHERE severity = 'low') as low_total,
          COUNT(*) FILTER (WHERE created_at > NOW() - INTERVAL '24 hours') as last_24h,
          COUNT(*) FILTER (WHERE created_at > NOW() - INTERVAL '7 days') as last_7d
        FROM devops_alerts
      ),
      open_alerts AS (
        SELECT 
          COUNT(*) FILTER (WHERE severity = 'critical') as critical,
          COUNT(*) FILTER (WHERE severity = 'high') as high,
          COUNT(*) FILTER (WHERE severity = 'medium') as medium,
          COUNT(*) FILTER (WHERE severity = 'low') as low,
          COUNT(*) FILTER (WHERE alert_type = 'payment_failure') as payment_failures,
          COUNT(*) FILTER (WHERE environment = 'main') as main_alerts,
          COUNT(*) FILTER (WHERE environment = 'westside') as westside_alerts,
          COUNT(*) FILTER (WHERE environment = 'eastside') as eastside_alerts
        FROM devops_alerts
        WHERE status = 'open'
      )
      SELECT 
        bc.total,
        bc.open,
        bc.acknowledged,
        bc.resolved,
        oa.critical,
        oa.high,
        oa.medium,
        oa.low,
        oa.payment_failures,
        oa.main_alerts,
        oa.westside_alerts,
        oa.eastside_alerts,
        bc.last_24h,
        bc.last_7d,
        bc.critical_total,
        bc.high_total,
        bc.medium_total,
        bc.low_total
      FROM base_counts bc, open_alerts oa
    `);

    res.json(stats.rows[0]);
  } catch (error) {
    logger.error({ err: error }, 'Error fetching alert stats:');
    res.status(500).json({ 
      error: 'Failed to fetch alert statistics',
      message: error.message,
      details: process.env.NODE_ENV === 'development' ? error.stack : undefined
    });
  }
}));

/**
 * Get a specific alert by ID
 */
router.get('/alerts/:id', asyncHandler(async (req, res) => {
  try {
    const { id } = req.params;
    const result = await pool.query('SELECT * FROM devops_alerts WHERE id = $1', [id]);

    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Alert not found' });
    }

    res.json(result.rows[0]);
  } catch (error) {
    logger.error({ err: error }, 'Error fetching alert:');
    res.status(500).json({ error: 'Failed to fetch alert' });
  }
}));

/**
 * Update alert status (acknowledge, resolve, dismiss)
 */
router.patch('/alerts/:id', asyncHandler(async (req, res) => {
  try {
    const { id } = req.params;
    const { status, resolution_notes } = req.body;

    const validStatuses = ['open', 'acknowledged', 'resolved', 'dismissed'];
    if (!status || !validStatuses.includes(status)) {
      return res.status(400).json({ error: 'Invalid status' });
    }

    let query = 'UPDATE devops_alerts SET status = $1';
    const params = [status];
    let paramCount = 2;

    if (status === 'acknowledged') {
      query += `, acknowledged_at = CURRENT_TIMESTAMP, acknowledged_by = $${paramCount++}`;
      params.push(req.user?.email || 'system');
    }

    if (status === 'resolved') {
      query += `, resolved_at = CURRENT_TIMESTAMP, resolved_by = $${paramCount++}`;
      params.push(req.user?.email || 'system');
      if (resolution_notes) {
        query += `, resolution_notes = $${paramCount++}`;
        params.push(resolution_notes);
      }
    }

    query += ` WHERE id = $${paramCount++}`;
    params.push(id);

    const result = await pool.query(query, params);

    if (result.rowCount === 0) {
      return res.status(404).json({ error: 'Alert not found' });
    }

    // Fetch updated alert
    const updatedAlert = await pool.query('SELECT * FROM devops_alerts WHERE id = $1', [id]);

    res.json(updatedAlert.rows[0]);
  } catch (error) {
    logger.error({ err: error }, 'Error updating alert:');
    res.status(500).json({ error: 'Failed to update alert' });
  }
}));

/**
 * Get alert rules
 */
router.get('/rules', asyncHandler(async (req, res) => {
  try {
    const result = await pool.query('SELECT * FROM devops_alert_rules ORDER BY rule_name');
    res.json(result.rows);
  } catch (error) {
    logger.error({ err: error }, 'Error fetching alert rules:');
    res.status(500).json({ error: 'Failed to fetch alert rules' });
  }
}));

/**
 * Update alert rule
 */
router.patch('/rules/:id', asyncHandler(async (req, res) => {
  try {
    const { id } = req.params;
    const { enabled, slack_notify } = req.body;

    const updates = [];
    const params = [];
    let paramCount = 1;

    if (enabled !== undefined) {
      updates.push(`enabled = $${paramCount++}`);
      params.push(enabled);
    }

    if (slack_notify !== undefined) {
      updates.push(`slack_notify = $${paramCount++}`);
      params.push(slack_notify);
    }

    if (updates.length === 0) {
      return res.status(400).json({ error: 'No updates provided' });
    }

    updates.push(`updated_at = CURRENT_TIMESTAMP`);
    params.push(id);
    updates.push(`WHERE id = $${paramCount++}`);

    const query = `UPDATE devops_alert_rules SET ${updates.join(', ')}`;
    await pool.query(query, params);

    const updatedRule = await pool.query('SELECT * FROM devops_alert_rules WHERE id = $1', [id]);
    res.json(updatedRule.rows[0]);
  } catch (error) {
    logger.error({ err: error }, 'Error updating alert rule:');
    res.status(500).json({ error: 'Failed to update alert rule' });
  }
}));

/**
 * Trigger manual log monitoring
 */
router.post('/monitor/run', asyncHandler(async (req, res) => {
  try {
    const HerokuLogMonitor = require('../services/herokuLogMonitor');
    const SlackAlerts = require('../utils/slackAlerts');

    const slackAlerts = new SlackAlerts();
    const monitor = new HerokuLogMonitor(pool, slackAlerts);

    const result = await monitor.monitorAllApps();

    res.json({
      success: true,
      message: 'Monitoring completed',
      result
    });
  } catch (error) {
    logger.error({ err: error }, 'Error running monitoring:');
    res.status(500).json({ error: 'Failed to run monitoring', message: error.message });
  }
}));

/**
 * Automated remediation endpoint
 * Attempts to automatically resolve alerts that can be fixed
 */
router.post('/remediation/run', asyncHandler(async (req, res) => {
  try {
    const AutomatedRemediation = require('../services/automatedRemediation');
    const SlackAlerts = require('../utils/slackAlerts');

    const slackAlerts = new SlackAlerts();
    const remediation = new AutomatedRemediation(pool, slackAlerts);

    const limit = req.body.limit || 10;
    const result = await remediation.processOpenAlerts(limit);

    res.json({
      success: true,
      message: 'Remediation completed',
      result,
    });
  } catch (error) {
    logger.error({ err: error }, 'Error running remediation:');
    res.status(500).json({ error: 'Failed to run remediation', message: error.message });
  }
}));

/**
 * Attempt to remediate a specific alert
 */
router.post('/remediation/:id', asyncHandler(async (req, res) => {
  try {
    const { id } = req.params;
    const AutomatedRemediation = require('../services/automatedRemediation');
    const SlackAlerts = require('../utils/slackAlerts');

    const slackAlerts = new SlackAlerts();
    const remediation = new AutomatedRemediation(pool, slackAlerts);

    const result = await remediation.attemptRemediation(parseInt(id));

    res.json(result);
  } catch (error) {
    logger.error({ err: error }, 'Error remediating alert:');
    res.status(500).json({ error: 'Failed to remediate alert', message: error.message });
  }
}));

/**
 * Get learning/pattern data
 */
router.get('/alerts/learning', asyncHandler(async (req, res) => {
  try {
    // Get resolved alerts for pattern analysis
    const resolvedResult = await pool.query(`
      SELECT 
        alert_type,
        title,
        severity,
        resolution_notes,
        resolved_by,
        resolved_at,
        created_at,
        environment
      FROM devops_alerts
      WHERE status = 'resolved'
      ORDER BY resolved_at DESC
      LIMIT 200
    `);

    // Analyze patterns
    const patterns = {};
    let agentResolved = 0;
    let manualResolved = 0;

    resolvedResult.rows.forEach(alert => {
      if (alert.resolved_by?.includes('agent') || alert.resolved_by?.includes('automated')) {
        agentResolved++;
      } else {
        manualResolved++;
      }

      const key = alert.title || alert.alert_type;
      if (!patterns[key]) {
        patterns[key] = {
          title: alert.title,
          type: alert.alert_type,
          count: 0,
          firstSeen: alert.created_at,
          lastSeen: alert.resolved_at,
          resolutions: []
        };
      }
      patterns[key].count++;
      if (alert.resolution_notes) {
        patterns[key].resolutions.push({
          notes: alert.resolution_notes,
          resolvedBy: alert.resolved_by,
          resolvedAt: alert.resolved_at
        });
      }
      // Keep only most recent first seen
      if (new Date(alert.created_at) < new Date(patterns[key].firstSeen)) {
        patterns[key].firstSeen = alert.created_at;
      }
      // Keep most recent last seen
      if (new Date(alert.resolved_at) > new Date(patterns[key].lastSeen)) {
        patterns[key].lastSeen = alert.resolved_at;
      }
    });

    res.json({
      totalResolved: resolvedResult.rows.length,
      agentResolved,
      manualResolved,
      patterns: Object.values(patterns).sort((a, b) => b.count - a.count)
    });
  } catch (error) {
    logger.error({ err: error }, 'Error fetching learning data:');
    res.status(500).json({ error: 'Failed to fetch learning data', message: error.message });
  }
}));

/**
 * Bulk resolve alerts by pattern (e.g., ROUTE REGISTRATION false positives)
 */
router.post('/alerts/bulk-resolve', asyncHandler(async (req, res) => {
  try {
    const { pattern, message_contains, alert_type, environment, alert_ids, resolution_notes } = req.body;
    
    // Handle alert IDs (for bulk selection)
    if (alert_ids && Array.isArray(alert_ids) && alert_ids.length > 0) {
      if (alert_ids.length > 500) {
        return res.status(400).json({ 
          error: 'Cannot resolve more than 500 alerts at once' 
        });
      }

      const placeholders = alert_ids.map((_, index) => `$${index + 4}`).join(',');
      const resolvedBy = 'system-bulk-resolve';
      const notes = resolution_notes || 'Bulk resolved via DevOps Hub';
      
      const query = `
        UPDATE devops_alerts 
        SET status = $1, 
            resolved_at = CURRENT_TIMESTAMP, 
            resolved_by = $2,
            resolution_notes = $3
        WHERE id IN (${placeholders})
          AND status IN ('open', 'acknowledged')
        RETURNING id
      `;
      
      const params = [
        'resolved',
        resolvedBy,
        notes,
        ...alert_ids.map(id => parseInt(id))
      ];

      const result = await pool.query(query, params);

      return res.json({
        success: true,
        resolved_count: result.rows.length,
        resolved_ids: result.rows.map(row => row.id),
        message: `Successfully resolved ${result.rows.length} alert(s)`
      });
    }
    
    // Legacy pattern-based bulk resolve
    if (!pattern && !message_contains) {
      return res.status(400).json({ 
        error: 'Either alert_ids, pattern, or message_contains must be provided' 
      });
    }

    let query = 'UPDATE devops_alerts SET status = $1, resolved_at = CURRENT_TIMESTAMP, resolved_by = $2';
    const params = ['resolved', 'system-bulk-resolve'];
    let paramCount = 3;

    // Build WHERE clause
    const conditions = [];
    
    if (pattern) {
      conditions.push(`title ILIKE $${paramCount++}`);
      params.push(`%${pattern}%`);
    }
    
    if (message_contains) {
      conditions.push(`(message ILIKE $${paramCount++} OR log_entry ILIKE $${paramCount})`);
      params.push(`%${message_contains}%`);
      params.push(`%${message_contains}%`);
      paramCount++;
    }
    
    if (alert_type) {
      conditions.push(`alert_type = $${paramCount++}`);
      params.push(alert_type);
    }
    
    if (environment) {
      conditions.push(`environment = $${paramCount++}`);
      params.push(environment);
    }

    // Only update open or acknowledged alerts
    conditions.push(`status IN ('open', 'acknowledged')`);

    query += ` WHERE ${conditions.join(' AND ')} RETURNING id`;

    const result = await pool.query(query, params);

    res.json({
      success: true,
      resolved_count: result.rows.length,
      resolved_ids: result.rows.map(row => row.id),
      message: `Successfully resolved ${result.rows.length} alert(s)`
    });
  } catch (error) {
    logger.error({ err: error }, 'Error bulk resolving alerts:');
    res.status(500).json({ 
      error: 'Failed to bulk resolve alerts', 
      message: error.message 
    });
  }
}));

module.exports = router;

