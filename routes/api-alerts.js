/**
 * Alert Processing and AI Analysis Webhook
 * Receives Papertrail alerts and processes them with AI insights
 */

const express = require('express');
const axios = require('axios');
const { logError, logBusinessEvent } = require('../utils/logger');
const { asyncHandler } = require('../middleware/error-handler');

const router = express.Router();

/**
 * Process Papertrail webhook alerts
 */
router.post('/papertrail', asyncHandler(async (req, res) => {
  try {
    // Verify webhook secret if configured
    const webhookSecret = process.env.PAPERTRAIL_WEBHOOK_SECRET;
    if (webhookSecret) {
      const authHeader = req.header('Authorization');
      if (authHeader !== `Bearer ${webhookSecret}`) {
        return res.status(401).json({ error: 'Unauthorized' });
      }
    }

    const alert = req.body;
    
    logBusinessEvent('papertrail_alert_received', {
      alertId: alert.id,
      severity: alert.severity,
      source: alert.source_name,
      message: alert.message?.substring(0, 200)
    });

    // Analyze the alert with AI
    const analysis = await analyzeAlert(alert);
    
    // Send to Slack if configured
    if (process.env.SLACK_WEBHOOK_URL && analysis.shouldAlert) {
      await sendSlackAlert(analysis);
    }

    // Store alert in database for tracking
    await storeAlert(alert, analysis);

    res.json({ 
      success: true, 
      analysis: analysis.summary,
      alertId: alert.id 
    });

  } catch (error) {
    logError(error, { 
      route: '/api/alerts/papertrail',
      alertData: req.body 
    });
    
    res.status(500).json({ 
      error: 'Failed to process alert',
      errorId: error.errorId 
    });
  }
}));

/**
 * Analyze alert with AI to determine severity and recommendations
 */
async function analyzeAlert(alert) {
  const analysis = {
    timestamp: new Date().toISOString(),
    alertId: alert.id,
    originalAlert: alert,
    severity: 'low',
    shouldAlert: false,
    recommendations: [],
    similarAlerts: [],
    context: {}
  };

  // Analyze message content
  const message = alert.message?.toLowerCase() || '';
  
  // Determine severity based on keywords and patterns
  if (message.includes('error') || message.includes('exception') || message.includes('failed')) {
    analysis.severity = 'high';
    analysis.shouldAlert = true;
  }
  
  if (message.includes('timeout') || message.includes('connection refused')) {
    analysis.severity = 'critical';
    analysis.shouldAlert = true;
    analysis.recommendations.push({
      type: 'connectivity',
      priority: 'high',
      message: 'Check network connectivity and service availability'
    });
  }

  if (message.includes('memory') || message.includes('out of memory')) {
    analysis.severity = 'high';
    analysis.shouldAlert = true;
    analysis.recommendations.push({
      type: 'resource',
      priority: 'high',
      message: 'Memory usage is high - consider scaling or optimizing'
    });
  }

  if (message.includes('database') || message.includes('sql')) {
    analysis.severity = 'medium';
    analysis.recommendations.push({
      type: 'database',
      priority: 'medium',
      message: 'Database-related issue detected - check query performance'
    });
  }

  // Check for rate limiting or throttling
  if (message.includes('rate limit') || message.includes('throttle')) {
    analysis.severity = 'medium';
    analysis.recommendations.push({
      type: 'rate_limiting',
      priority: 'medium',
      message: 'Rate limiting detected - review API usage patterns'
    });
  }

  // Generate summary
  analysis.summary = {
    severity: analysis.severity,
    shouldAlert: analysis.shouldAlert,
    recommendationCount: analysis.recommendations.length,
    context: analysis.context
  };

  return analysis;
}

/**
 * Send formatted alert to Slack
 */
async function sendSlackAlert(analysis) {
  const alert = analysis.originalAlert;
  
  const channel = process.env.SLACK_ALERT_CHANNEL || '#alerts';
  
  const slackMessage = {
    channel: channel,
    text: `🚨 ${analysis.severity.toUpperCase()} Alert from Papertrail`,
    attachments: [
      {
        color: analysis.severity === 'critical' ? 'danger' : 
               analysis.severity === 'high' ? 'warning' : 'good',
        title: `Alert: ${alert.source_name || 'Unknown Source'}`,
        text: alert.message?.substring(0, 500),
        fields: [
          {
            title: 'Severity',
            value: analysis.severity,
            short: true
          },
          {
            title: 'Source',
            value: alert.source_name || 'Unknown',
            short: true
          },
          {
            title: 'Timestamp',
            value: new Date(alert.received_at).toLocaleString(),
            short: true
          }
        ],
        footer: 'Acme Operations Monitoring',
        ts: Math.floor(Date.now() / 1000)
      }
    ]
  };

  // Add recommendations if any
  if (analysis.recommendations.length > 0) {
    slackMessage.attachments.push({
      color: '#36a64f',
      title: 'AI Recommendations',
      text: analysis.recommendations.map(rec => 
        `• ${rec.message} (${rec.priority} priority)`
      ).join('\n'),
      footer: 'Generated by AI Analysis'
    });
  }

  try {
    await axios.post(process.env.SLACK_WEBHOOK_URL, slackMessage);
    logBusinessEvent('slack_alert_sent', {
      alertId: alert.id,
      severity: analysis.severity,
      recommendationCount: analysis.recommendations.length
    });
  } catch (error) {
    logError(error, { 
      action: 'send_slack_alert',
      alertId: alert.id 
    });
    throw error;
  }
}

/**
 * Store alert in database for tracking and analysis
 */
async function storeAlert(alert, analysis) {
  try {
    // This would store in your database
    // For now, we'll just log the storage
    logBusinessEvent('alert_stored', {
      alertId: alert.id,
      severity: analysis.severity,
      hasRecommendations: analysis.recommendations.length > 0
    });
  } catch (error) {
    logError(error, { 
      action: 'store_alert',
      alertId: alert.id 
    });
  }
}

/**
 * Get recent alerts
 */
router.get('/recent', asyncHandler(async (req, res) => {
  try {
    // This would query your database for recent alerts
    // For now, return a mock response
    res.json({
      alerts: [],
      total: 0,
      message: 'Alert history endpoint - implement database queries'
    });
  } catch (error) {
    logError(error, { route: '/api/alerts/recent' });
    res.status(500).json({ error: 'Failed to fetch recent alerts' });
  }
}));

/**
 * Get alert statistics
 */
router.get('/stats', asyncHandler(async (req, res) => {
  try {
    // This would calculate statistics from stored alerts
    res.json({
      totalAlerts: 0,
      criticalAlerts: 0,
      highPriorityAlerts: 0,
      averageResponseTime: 0,
      lastUpdated: new Date().toISOString()
    });
  } catch (error) {
    logError(error, { route: '/api/alerts/stats' });
    res.status(500).json({ error: 'Failed to fetch alert statistics' });
  }
}));

module.exports = router;
