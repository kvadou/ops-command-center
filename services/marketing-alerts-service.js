// services/marketing-alerts-service.js
/**
 * Marketing Alerts Service
 *
 * Manages alert creation, retrieval, and notifications.
 */

const MarketingNotificationService = require('./marketing-notification-service');
const { logger } = require('../utils/logger');

class MarketingAlertsService {
  constructor(pool) {
    this.pool = pool;
    this.notificationService = new MarketingNotificationService();
  }

  /**
   * Create an alert and send notifications
   */
  async createAlert({ insightId, draftId, alertType, title, message, platform }) {
    const result = await this.pool.query(`
      INSERT INTO marketing_alerts (insight_id, draft_id, alert_type, title, message, platform)
      VALUES ($1, $2, $3, $4, $5, $6)
      RETURNING *
    `, [insightId || null, draftId || null, alertType, title, message, platform || null]);

    const alert = result.rows[0];

    // Send notifications (don't let notification failure block alert creation)
    try {
      await this.notificationService.notifyAlert({
        id: alert.id,
        alertType,
        title,
        message,
        platform
      });
    } catch (err) {
      logger.error({
        msg: 'Failed to send alert notification',
        alertId: alert.id,
        error: err.message
      });
    }

    return alert;
  }

  /**
   * Get unread alerts
   */
  async getUnreadAlerts() {
    const result = await this.pool.query(`
      SELECT * FROM marketing_alerts
      WHERE is_read = FALSE AND is_dismissed = FALSE
      ORDER BY
        CASE alert_type
          WHEN 'critical' THEN 1
          WHEN 'warning' THEN 2
          ELSE 3
        END,
        created_at DESC
    `);
    return result.rows;
  }

  /**
   * Get all alerts with pagination
   */
  async getAlerts({ limit = 50, offset = 0, includeRead = false, alertType = null }) {
    let query = `
      SELECT * FROM marketing_alerts
      WHERE is_dismissed = FALSE
    `;
    const params = [];
    let paramIndex = 1;

    if (!includeRead) {
      query += ` AND is_read = FALSE`;
    }

    if (alertType) {
      query += ` AND alert_type = $${paramIndex++}`;
      params.push(alertType);
    }

    query += ` ORDER BY created_at DESC LIMIT $${paramIndex++} OFFSET $${paramIndex++}`;
    params.push(limit, offset);

    const result = await this.pool.query(query, params);
    return result.rows;
  }

  /**
   * Get alert counts by type
   */
  async getAlertCounts() {
    const result = await this.pool.query(`
      SELECT
        alert_type,
        COUNT(*) as count
      FROM marketing_alerts
      WHERE is_read = FALSE AND is_dismissed = FALSE
      GROUP BY alert_type
    `);

    const counts = {
      critical: 0,
      warning: 0,
      positive: 0,
      total: 0,
    };

    for (const row of result.rows) {
      counts[row.alert_type] = parseInt(row.count);
      counts.total += parseInt(row.count);
    }

    return counts;
  }

  /**
   * Mark alert as read
   */
  async markAsRead(alertId) {
    await this.pool.query(
      'UPDATE marketing_alerts SET is_read = TRUE WHERE id = $1',
      [alertId]
    );
  }

  /**
   * Mark all alerts as read
   */
  async markAllAsRead() {
    await this.pool.query(
      'UPDATE marketing_alerts SET is_read = TRUE WHERE is_read = FALSE'
    );
  }

  /**
   * Dismiss an alert
   */
  async dismissAlert(alertId) {
    await this.pool.query(
      'UPDATE marketing_alerts SET is_dismissed = TRUE WHERE id = $1',
      [alertId]
    );
  }

  /**
   * Generate alerts from insights
   */
  async generateAlertsFromInsights() {
    // Get critical and high priority insights that don't have alerts yet
    const insightsResult = await this.pool.query(`
      SELECT i.* FROM marketing_ai_insights i
      LEFT JOIN marketing_alerts a ON a.insight_id = i.id
      WHERE i.priority IN ('critical', 'high')
        AND i.status = 'pending'
        AND a.id IS NULL
    `);

    let alertsCreated = 0;

    for (const insight of insightsResult.rows) {
      const alertType = insight.priority === 'critical' ? 'critical' : 'warning';

      await this.createAlert({
        insightId: insight.id,
        alertType,
        title: insight.title,
        message: insight.recommendation,
        platform: insight.platform,
      });

      alertsCreated++;
    }

    return alertsCreated;
  }

  /**
   * Generate alerts from results tracking
   */
  async generateAlertsFromResults() {
    // Find drafts with underperforming results
    const draftsResult = await this.pool.query(`
      SELECT d.id, d.name, d.platform, d.results_summary
      FROM marketing_campaign_drafts d
      WHERE d.status = 'pushed'
        AND d.results_summary->>'status' = 'underperforming'
        AND NOT EXISTS (
          SELECT 1 FROM marketing_alerts a
          WHERE a.draft_id = d.id
            AND a.created_at > NOW() - INTERVAL '24 hours'
        )
    `);

    let alertsCreated = 0;

    for (const draft of draftsResult.rows) {
      const summary = draft.results_summary || {};
      const latestSnapshot = summary.snapshots?.day_30 || summary.snapshots?.day_14 ||
                            summary.snapshots?.day_7 || summary.snapshots?.day_1;

      let message = `Campaign "${draft.name}" is underperforming.`;
      if (latestSnapshot?.vsProjection?.cpl_variance) {
        message += ` CPL is ${latestSnapshot.vsProjection.cpl_variance}% above projection.`;
      }

      await this.createAlert({
        draftId: draft.id,
        alertType: 'warning',
        title: `Underperforming: ${draft.name}`,
        message,
        platform: draft.platform,
      });

      alertsCreated++;
    }

    return alertsCreated;
  }

  /**
   * Run alert generation
   */
  async runAlertGeneration() {
    logger.info('\n========== Alert Generation ==========');

    const fromInsights = await this.generateAlertsFromInsights();
    logger.info(`Generated ${fromInsights} alerts from insights`);

    const fromResults = await this.generateAlertsFromResults();
    logger.info(`Generated ${fromResults} alerts from results tracking`);

    logger.info('========== Alerts Complete ==========\n');

    return {
      fromInsights,
      fromResults,
      total: fromInsights + fromResults,
    };
  }
}

module.exports = MarketingAlertsService;
