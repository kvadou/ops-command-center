/**
 * DevOps Real-time Updates via Server-Sent Events (SSE)
 * Provides live streaming of alerts, metrics, and anomalies
 */

const express = require('express');
const router = express.Router();
const { Pool } = require('pg');
const { logger } = require('../utils/logger');

// Database connection setup
const isLocal = process.env.DATABASE_URL?.includes('localhost') || 
                process.env.DATABASE_URL?.includes('127.0.0.1') ||
                !process.env.DATABASE_URL?.includes('amazonaws.com');

const localDbUrl = 'postgres://user:REPLACE_ME@localhost:5432/acme_ops_demo';
const dbUrl = (isLocal && process.env.DATABASE_URL) 
  ? process.env.DATABASE_URL 
  : (process.env.DATABASE_URL || localDbUrl);

const pool = new Pool({
  connectionString: dbUrl,
  ssl: !isLocal ? { rejectUnauthorized: false } : false
});

// Store active SSE connections
const activeConnections = new Set();

/**
 * SSE endpoint for real-time alerts
 */
router.get('/alerts', (req, res) => {
  // Set SSE headers
  res.setHeader('Content-Type', 'text/event-stream');
  res.setHeader('Cache-Control', 'no-cache');
  res.setHeader('Connection', 'keep-alive');
  res.setHeader('X-Accel-Buffering', 'no'); // Disable buffering for nginx

  const connectionId = `${Date.now()}-${Math.random()}`;
  activeConnections.add(res);

  logger.info(`[SSE] New connection: ${connectionId} (total: ${activeConnections.size})`);

  // Send initial connection message
  res.write(`data: ${JSON.stringify({ type: 'connected', connectionId, timestamp: new Date().toISOString() })}\n\n`);

  // Send periodic heartbeat to keep connection alive
  const heartbeatInterval = setInterval(() => {
    try {
      res.write(`: heartbeat\n\n`);
    } catch (error) {
      clearInterval(heartbeatInterval);
      activeConnections.delete(res);
    }
  }, 30000); // Every 30 seconds

  // Clean up on client disconnect
  req.on('close', () => {
    logger.info(`[SSE] Connection closed: ${connectionId} (total: ${activeConnections.size - 1})`);
    clearInterval(heartbeatInterval);
    activeConnections.delete(res);
  });

  // Poll for new alerts every 5 seconds
  const pollInterval = setInterval(async () => {
    try {
      // Get new alerts from last 5 seconds
      const alertsResult = await pool.query(`
        SELECT 
          id,
          environment,
          alert_type,
          severity,
          title,
          message,
          status,
          context,
          created_at
        FROM devops_alerts
        WHERE created_at > NOW() - INTERVAL '5 seconds'
          AND status = 'open'
        ORDER BY created_at DESC
        LIMIT 10
      `);

      if (alertsResult.rows.length > 0) {
        const alerts = alertsResult.rows.map(row => ({
          id: row.id,
          environment: row.environment,
          alertType: row.alert_type,
          severity: row.severity,
          title: row.title,
          message: row.message,
          status: row.status,
          context: row.context,
          createdAt: row.created_at
        }));

        res.write(`data: ${JSON.stringify({ type: 'new_alerts', alerts, timestamp: new Date().toISOString() })}\n\n`);
      }

      // Check for alert status changes (acknowledged/resolved)
      const statusChangesResult = await pool.query(`
        SELECT 
          id,
          status,
          resolved_at,
          resolved_by
        FROM devops_alerts
        WHERE updated_at > NOW() - INTERVAL '5 seconds'
        ORDER BY updated_at DESC
        LIMIT 20
      `);

      if (statusChangesResult.rows.length > 0) {
        const statusChanges = statusChangesResult.rows.map(row => ({
          id: row.id,
          status: row.status,
          resolvedAt: row.resolved_at,
          resolvedBy: row.resolved_by
        }));

        res.write(`data: ${JSON.stringify({ type: 'status_changes', changes: statusChanges, timestamp: new Date().toISOString() })}\n\n`);
      }

    } catch (error) {
      logger.error({ err: error }, '[SSE] Error polling for alerts:');
      res.write(`data: ${JSON.stringify({ type: 'error', message: error.message, timestamp: new Date().toISOString() })}\n\n`);
    }
  }, 5000); // Poll every 5 seconds

  // Clean up poll interval on disconnect
  req.on('close', () => {
    clearInterval(pollInterval);
  });
});

/**
 * SSE endpoint for real-time metrics
 */
router.get('/metrics', (req, res) => {
  const { environment = 'main' } = req.query;

  res.setHeader('Content-Type', 'text/event-stream');
  res.setHeader('Cache-Control', 'no-cache');
  res.setHeader('Connection', 'keep-alive');
  res.setHeader('X-Accel-Buffering', 'no');

  const connectionId = `${Date.now()}-${Math.random()}`;
  activeConnections.add(res);

  logger.info(`[SSE Metrics] New connection: ${connectionId} for environment: ${environment}`);

  res.write(`data: ${JSON.stringify({ type: 'connected', connectionId, environment, timestamp: new Date().toISOString() })}\n\n`);

  // Send heartbeat
  const heartbeatInterval = setInterval(() => {
    try {
      res.write(`: heartbeat\n\n`);
    } catch (error) {
      clearInterval(heartbeatInterval);
      activeConnections.delete(res);
    }
  }, 30000);

  // Poll for new anomalies every 10 seconds
  const pollInterval = setInterval(async () => {
    try {
      // Get recent anomalies
      const anomaliesResult = await pool.query(`
        SELECT 
          id,
          metric_type,
          metric_name,
          current_value,
          baseline_value,
          deviation_percent,
          severity,
          detected_at
        FROM devops_anomalies
        WHERE environment = $1
          AND resolved_at IS NULL
          AND detected_at > NOW() - INTERVAL '10 seconds'
        ORDER BY detected_at DESC
        LIMIT 5
      `, [environment]);

      if (anomaliesResult.rows.length > 0) {
        const anomalies = anomaliesResult.rows.map(row => ({
          id: row.id,
          metricType: row.metric_type,
          metricName: row.metric_name,
          currentValue: parseFloat(row.current_value) || 0,
          baselineValue: parseFloat(row.baseline_value) || 0,
          deviationPercent: parseFloat(row.deviation_percent) || 0,
          severity: row.severity,
          detectedAt: row.detected_at
        }));

        res.write(`data: ${JSON.stringify({ type: 'new_anomalies', anomalies, timestamp: new Date().toISOString() })}\n\n`);
      }

    } catch (error) {
      logger.error({ err: error }, '[SSE] Error polling for metrics:');
    }
  }, 10000); // Poll every 10 seconds

  req.on('close', () => {
    logger.info(`[SSE Metrics] Connection closed: ${connectionId}`);
    clearInterval(heartbeatInterval);
    clearInterval(pollInterval);
    activeConnections.delete(res);
  });
});

/**
 * Broadcast alert update to all connected clients
 */
function broadcastAlert(alert) {
  const message = `data: ${JSON.stringify({ type: 'alert_update', alert, timestamp: new Date().toISOString() })}\n\n`;
  activeConnections.forEach(client => {
    try {
      client.write(message);
    } catch (error) {
      activeConnections.delete(client);
    }
  });
}

/**
 * Broadcast metrics update to all connected clients
 */
function broadcastMetrics(metrics) {
  const message = `data: ${JSON.stringify({ type: 'metrics_update', metrics, timestamp: new Date().toISOString() })}\n\n`;
  activeConnections.forEach(client => {
    try {
      client.write(message);
    } catch (error) {
      activeConnections.delete(client);
    }
  });
}

module.exports = { router, broadcastAlert, broadcastMetrics };

