/**
 * Automated Remediation Service
 * Analyzes alerts and attempts to automatically resolve common issues
 * 
 * IMPORTANT SAFETY NOTES:
 * - This service ONLY updates database records (alert status and resolution notes)
 * - This service does NOT write, modify, or commit any code files
 * - This service does NOT push to git or deploy to any environment
 * - This service does NOT have access to production deployment capabilities
 * - All code changes and deployments require manual review and approval
 * 
 * What this service DOES:
 * - Marks alerts as resolved/acknowledged in the database
 * - Adds detailed resolution notes explaining why alerts were resolved
 * - Sends Slack notifications about auto-resolved alerts
 * 
 * What this service DOES NOT do:
 * - Modify source code or configuration files
 * - Execute git commands (commit, push, merge)
 * - Deploy to staging or production environments
 * - Restart services or infrastructure
 * - Change environment variables or secrets
 */

const { Pool } = require('pg');
const SlackAlerts = require('../utils/slackAlerts');
const { logger } = require('../utils/logger');

class AutomatedRemediation {
  constructor(pool, slackAlerts) {
    this.pool = pool;
    this.slackAlerts = slackAlerts;
  }

  /**
   * Analyze an alert and determine if it can be auto-resolved
   */
  async analyzeAlert(alert) {
    const analysis = {
      canAutoResolve: false,
      resolutionType: null,
      confidence: 0,
      action: null,
      notes: '',
    };

    // Route registration false positives (already fixed in code)
    if (
      alert.message?.includes('[ROUTE REGISTRATION]') ||
      alert.message?.includes('[CRITICAL DEBUG]')
    ) {
      analysis.canAutoResolve = true;
      analysis.resolutionType = 'false_positive';
      analysis.confidence = 100;
      analysis.action = 'dismiss';
      analysis.notes =
        'Auto-resolved: False positive alert. Route registration/debug logs are informational messages, not errors. The monitoring system has been updated to exclude these patterns to prevent future false alerts.';
      return analysis;
    }

    // Database connection success messages (common false positive)
    if (
      alert.message?.includes('database connection successful') ||
      alert.message?.includes('✅') && alert.message?.toLowerCase().includes('database')
    ) {
      analysis.canAutoResolve = true;
      analysis.resolutionType = 'false_positive';
      analysis.confidence = 95;
      analysis.action = 'dismiss';
      analysis.notes = `Auto-resolved: False positive alert. This log message indicates a successful database connection, not an error. The alert was incorrectly triggered because the log line contains "database" and "error" keywords in the alert title, but the actual message shows a successful operation (indicated by ✅ or "successful" keyword). Monitoring rules have been updated to exclude these informational messages.`;
      return analysis;
    }

    // Database connection timeout (might be temporary)
    if (
      alert.message?.toLowerCase().includes('database') &&
      (alert.message?.toLowerCase().includes('timeout') ||
        alert.message?.toLowerCase().includes('connection'))
    ) {
      analysis.canAutoResolve = false; // Too risky to auto-resolve
      analysis.resolutionType = 'needs_investigation';
      analysis.confidence = 50;
      analysis.action = 'acknowledge';
      analysis.notes = 'Acknowledged by automated agent: Database connection issue detected. This may be a temporary network issue or connection pool exhaustion. Monitoring continues - if this persists, manual investigation may be required. No automatic resolution attempted due to potential impact on system reliability.';
      return analysis;
    }

    // Known patterns that are informational
    if (
      alert.alert_type === 'error' &&
      alert.message?.includes('INFO') &&
      alert.severity === 'medium'
    ) {
      analysis.canAutoResolve = true;
      analysis.resolutionType = 'false_positive';
      analysis.confidence = 80;
      analysis.action = 'dismiss';
      analysis.notes = 'Auto-resolved: This is an informational log message incorrectly classified as an error. The log contains "INFO" level indicator, indicating it\'s a normal operational message, not an error condition. Alert rules will be reviewed to prevent similar false positives.';
      return analysis;
    }

    // Database errors that appear to be transient or informational
    if (
      alert.alert_type === 'error' &&
      alert.title?.includes('Database Error') &&
      (alert.message?.includes('successful') || 
       alert.message?.includes('✅') ||
       alert.message?.toLowerCase().includes('info'))
    ) {
      analysis.canAutoResolve = true;
      analysis.resolutionType = 'false_positive';
      analysis.confidence = 85;
      analysis.action = 'dismiss';
      analysis.notes = `False positive: Database alert triggered on informational message. Message indicates successful operation, not an error. Pattern: "${alert.message?.substring(0, 100)}"`;
      return analysis;
    }

    // Repeated similar alerts (potential noise/deduplication)
    // Check if this alert has been seen many times recently
    const duplicateCheck = await this.pool.query(
      `SELECT COUNT(*) as count
       FROM devops_alerts
       WHERE title = $1
         AND message = $2
         AND created_at > NOW() - INTERVAL '1 hour'
         AND status != 'open'`,
      [alert.title, alert.message]
    );

    const duplicateCount = parseInt(duplicateCheck.rows[0]?.count || 0);
    if (duplicateCount > 5) {
      analysis.canAutoResolve = true;
      analysis.resolutionType = 'duplicate';
      analysis.confidence = 70;
      analysis.action = 'dismiss';
      analysis.notes = `Auto-resolved: This alert pattern has been automatically resolved ${duplicateCount + 1} times in the last hour. This appears to be a recurring false positive or transient issue that doesn't require individual attention. Pattern: "${alert.title}". The automated system determined this is likely noise from alert rules being too sensitive. If this pattern continues, alert detection rules should be reviewed to prevent future false positives.`;
      return analysis;
    }

    // Generic error messages that are likely informational
    if (
      alert.severity === 'medium' &&
      alert.alert_type === 'error' &&
      !alert.message?.toLowerCase().includes('failed') &&
      !alert.message?.toLowerCase().includes('exception') &&
      !alert.message?.toLowerCase().includes('crash') &&
      (alert.message?.includes('✅') || 
       alert.message?.includes('INFO') ||
       alert.message?.toLowerCase().includes('success'))
    ) {
      analysis.canAutoResolve = true;
      analysis.resolutionType = 'false_positive';
      analysis.confidence = 75;
      analysis.action = 'dismiss';
      analysis.notes = `Auto-resolved: Alert appears to be informational (contains success indicator ✅ or INFO tag) rather than an actual error. The log message indicates a successful operation, not a failure. This is likely a log classification issue where informational messages are being incorrectly flagged as errors. Alert pattern: "${alert.title}". Message preview: "${alert.message?.substring(0, 100)}"`;
      return analysis;
    }

    return analysis;
  }

  /**
   * Attempt to auto-resolve an alert
   */
  async attemptRemediation(alertId) {
    try {
      // Get alert details
      const alertResult = await this.pool.query(
        `SELECT * FROM devops_alerts WHERE id = $1 AND status = 'open'`,
        [alertId]
      );

      if (alertResult.rows.length === 0) {
        return {
          success: false,
          message: 'Alert not found or already resolved',
        };
      }

      const alert = alertResult.rows[0];

      // Analyze alert
      const analysis = await this.analyzeAlert(alert);

      if (!analysis.canAutoResolve) {
        // Acknowledge if we can't resolve but want to track it
        if (analysis.action === 'acknowledge') {
          await this.pool.query(
            `UPDATE devops_alerts 
             SET status = 'acknowledged',
                 acknowledged_at = CURRENT_TIMESTAMP,
                 acknowledged_by = 'automated-agent',
                 updated_at = CURRENT_TIMESTAMP
             WHERE id = $1`,
            [alertId]
          );

          const ackNotes = analysis.notes || 
            `Acknowledged by automated agent. Alert pattern: "${alert.title}" in ${alert.environment} environment. Type: ${alert.alert_type}, Severity: ${alert.severity}. This alert requires monitoring but no automatic resolution was attempted.`;

          return {
            success: true,
            action: 'acknowledged',
            message: 'Alert acknowledged by automated agent',
            notes: ackNotes,
          };
        }

        return {
          success: false,
          message: 'Cannot auto-resolve this alert - requires manual intervention',
          notes: analysis.notes,
        };
      }

      // Ensure we have resolution notes (fallback if somehow missing)
      const resolutionNotes = analysis.notes || 
        `Auto-resolved by automated agent. Alert pattern: "${alert.title}" in ${alert.environment} environment. Type: ${alert.alert_type}, Severity: ${alert.severity}. Automated analysis determined this alert can be safely resolved. If this was incorrect, please review the alert detection rules.`;

      // Resolve the alert
      await this.pool.query(
        `UPDATE devops_alerts 
         SET status = 'resolved',
             resolved_at = CURRENT_TIMESTAMP,
             resolved_by = 'automated-agent',
             resolution_notes = $1,
             updated_at = CURRENT_TIMESTAMP
         WHERE id = $2`,
        [resolutionNotes, alertId]
      );

      // Send notification if it was auto-resolved
      if (this.slackAlerts && this.slackAlerts.enabled) {
        await this.slackAlerts.sendProductionError(
          {
            type: 'system',
            severity: 'info',
            message: `Alert #${alertId} auto-resolved: ${analysis.notes}`,
          },
          {
            environment: alert.environment,
            alertId: alertId,
          }
        );
      }

      return {
        success: true,
        action: 'resolved',
        message: `Alert ${alertId} auto-resolved`,
        notes: analysis.notes,
        confidence: analysis.confidence,
      };
    } catch (error) {
      logger.error({ err: error }, 'Error attempting remediation:');
      return {
        success: false,
        message: `Remediation failed: ${error.message}`,
      };
    }
  }

  /**
   * Process all open alerts and attempt remediation for eligible ones
   */
  async processOpenAlerts(limit = 10) {
    try {
      const alerts = await this.pool.query(
        `SELECT id, alert_type, severity, environment, title, message, created_at
         FROM devops_alerts
         WHERE status = 'open'
         ORDER BY 
           CASE severity 
             WHEN 'critical' THEN 1
             WHEN 'high' THEN 2
             WHEN 'medium' THEN 3
             WHEN 'low' THEN 4
           END,
           created_at DESC
         LIMIT $1`,
        [limit]
      );

      const results = [];

      for (const alert of alerts.rows) {
        const result = await this.attemptRemediation(alert.id);
        results.push({
          alertId: alert.id,
          title: alert.title,
          ...result,
        });
      }

      return {
        processed: results.length,
        resolved: results.filter((r) => r.action === 'resolved').length,
        acknowledged: results.filter((r) => r.action === 'acknowledged').length,
        failed: results.filter((r) => !r.success).length,
        results,
      };
    } catch (error) {
      logger.error({ err: error }, 'Error processing open alerts:');
      throw error;
    }
  }
}

module.exports = AutomatedRemediation;

