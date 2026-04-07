/**
 * Marketing Notification Service
 *
 * Sends notifications for marketing alerts via:
 * - Slack (webhook)
 * - Email (Brevo)
 */

const axios = require('axios');
const { logger } = require('../utils/logger');
const brevoEmailSender = require('../utils/brevo-email-sender');

class MarketingNotificationService {
  constructor() {
    this.slackWebhookUrl = process.env.MARKETING_SLACK_WEBHOOK_URL;
    this.alertEmailRecipient = process.env.MARKETING_ALERT_EMAIL || 'doug@acmeops.com';
  }

  /**
   * Send notification for a marketing alert
   */
  async notifyAlert(alert) {
    const { alertType, title, message, platform } = alert;

    // Determine notification level
    const isCritical = alertType === 'critical';
    const isWarning = alertType === 'warning';

    const results = {
      slack: null,
      email: null
    };

    // Always send to Slack
    try {
      results.slack = await this.sendSlackNotification(alert);
    } catch (err) {
      logger.error({
        msg: 'Marketing notification: Slack failed',
        error: err.message,
        alertId: alert.id
      });
      results.slack = { success: false, error: err.message };
    }

    // Send email for critical alerts only
    if (isCritical) {
      try {
        results.email = await this.sendEmailNotification(alert);
      } catch (err) {
        logger.error({
          msg: 'Marketing notification: Email failed',
          error: err.message,
          alertId: alert.id
        });
        results.email = { success: false, error: err.message };
      }
    }

    return results;
  }

  /**
   * Send Slack notification
   */
  async sendSlackNotification(alert) {
    if (!this.slackWebhookUrl) {
      logger.warn({ msg: 'Marketing notification: Slack webhook not configured' });
      return { success: false, error: 'Webhook not configured' };
    }

    const { alertType, title, message, platform } = alert;

    // Color and emoji based on alert type
    const config = {
      critical: { color: '#dc2626', emoji: '🚨', mention: '<!channel> ' },
      warning: { color: '#f59e0b', emoji: '⚠️', mention: '' },
      positive: { color: '#10b981', emoji: '✅', mention: '' }
    };

    const { color, emoji, mention } = config[alertType] || config.warning;

    const payload = {
      text: `${mention}${emoji} Marketing Alert: ${title}`,
      attachments: [
        {
          color,
          blocks: [
            {
              type: 'section',
              text: {
                type: 'mrkdwn',
                text: `*${title}*\n${message}`
              }
            },
            {
              type: 'context',
              elements: [
                {
                  type: 'mrkdwn',
                  text: `*Type:* ${alertType.toUpperCase()}${platform ? ` • *Platform:* ${platform}` : ''} • *Time:* <!date^${Math.floor(Date.now() / 1000)}^{date_short_pretty} at {time}|${new Date().toISOString()}>`
                }
              ]
            },
            {
              type: 'actions',
              elements: [
                {
                  type: 'button',
                  text: {
                    type: 'plain_text',
                    text: 'View in Dashboard'
                  },
                  url: `${process.env.APP_URL || 'https://join.acmeops.com'}/marketing`,
                  style: alertType === 'critical' ? 'danger' : 'primary'
                }
              ]
            }
          ]
        }
      ]
    };

    const response = await axios.post(this.slackWebhookUrl, payload, {
      headers: { 'Content-Type': 'application/json' },
      timeout: 5000
    });

    logger.info({
      msg: 'Marketing notification: Slack sent',
      alertType,
      title
    });

    return { success: true };
  }

  /**
   * Send email notification (critical alerts only)
   */
  async sendEmailNotification(alert) {
    const emailSender = brevoEmailSender.getInstance();
    if (!emailSender) {
      logger.warn({ msg: 'Marketing notification: Brevo not configured' });
      return { success: false, error: 'Brevo not configured' };
    }

    const { alertType, title, message, platform } = alert;

    const html = `
      <!DOCTYPE html>
      <html>
      <head>
        <style>
          body { font-family: Arial, sans-serif; line-height: 1.6; color: #333; }
          .container { max-width: 600px; margin: 0 auto; padding: 20px; }
          .header { background: #dc2626; color: white; padding: 20px; border-radius: 8px 8px 0 0; }
          .header h1 { margin: 0; font-size: 20px; }
          .content { background: #f9fafb; padding: 20px; border: 1px solid #e5e7eb; border-top: none; }
          .alert-box { background: white; padding: 15px; border-radius: 8px; border-left: 4px solid #dc2626; margin: 15px 0; }
          .meta { color: #6b7280; font-size: 14px; margin-top: 15px; }
          .button { display: inline-block; background: #6A469D; color: white; padding: 12px 24px; text-decoration: none; border-radius: 6px; margin-top: 15px; }
          .footer { text-align: center; color: #9ca3af; font-size: 12px; margin-top: 20px; }
        </style>
      </head>
      <body>
        <div class="container">
          <div class="header">
            <h1>🚨 Critical Marketing Alert</h1>
          </div>
          <div class="content">
            <div class="alert-box">
              <strong>${title}</strong>
              <p>${message}</p>
            </div>
            <div class="meta">
              <p><strong>Alert Type:</strong> ${alertType.toUpperCase()}</p>
              ${platform ? `<p><strong>Platform:</strong> ${platform}</p>` : ''}
              <p><strong>Time:</strong> ${new Date().toLocaleString('en-US', { timeZone: 'America/New_York' })} ET</p>
            </div>
            <a href="${process.env.APP_URL || 'https://join.acmeops.com'}/marketing" class="button">
              View in Dashboard
            </a>
          </div>
          <div class="footer">
            <p>Acme Operations Marketing Hub</p>
          </div>
        </div>
      </body>
      </html>
    `;

    const result = await emailSender.sendEmail({
      to: this.alertEmailRecipient,
      subject: `🚨 Critical Marketing Alert: ${title}`,
      html,
      from: 'alerts@acmeops.com'
    });

    if (result.success) {
      logger.info({
        msg: 'Marketing notification: Email sent',
        to: this.alertEmailRecipient,
        title
      });
    }

    return result;
  }

  /**
   * Send budget recommendation notification
   */
  async notifyBudgetRecommendation(recommendation) {
    if (!this.slackWebhookUrl) {
      return { success: false, error: 'Webhook not configured' };
    }

    const { id, recommendation_type, rationale, confidence_score, projected_improvement } = recommendation;

    const confidencePercent = Math.round((confidence_score || 0) * 100);
    const cplChange = projected_improvement?.cpl_change_percent;
    const roasChange = projected_improvement?.roas_change_percent;

    let impactText = '';
    if (cplChange) impactText += `CPL: ${cplChange > 0 ? '+' : ''}${cplChange}% `;
    if (roasChange) impactText += `ROAS: ${roasChange > 0 ? '+' : ''}${roasChange}%`;

    const payload = {
      text: `💰 New Budget Recommendation Ready for Review`,
      attachments: [
        {
          color: '#6A469D',
          blocks: [
            {
              type: 'section',
              text: {
                type: 'mrkdwn',
                text: `*Budget ${recommendation_type.charAt(0).toUpperCase() + recommendation_type.slice(1)} Recommendation*\n${rationale}`
              }
            },
            {
              type: 'section',
              fields: [
                {
                  type: 'mrkdwn',
                  text: `*Confidence:* ${confidencePercent}%`
                },
                {
                  type: 'mrkdwn',
                  text: `*Projected Impact:* ${impactText || 'N/A'}`
                }
              ]
            },
            {
              type: 'actions',
              elements: [
                {
                  type: 'button',
                  text: {
                    type: 'plain_text',
                    text: 'Review & Approve'
                  },
                  url: `${process.env.APP_URL || 'https://join.acmeops.com'}/marketing`,
                  style: 'primary'
                }
              ]
            }
          ]
        }
      ]
    };

    try {
      await axios.post(this.slackWebhookUrl, payload, {
        headers: { 'Content-Type': 'application/json' },
        timeout: 5000
      });

      logger.info({
        msg: 'Marketing notification: Budget recommendation sent to Slack',
        recommendationId: id
      });

      return { success: true };
    } catch (err) {
      logger.error({
        msg: 'Marketing notification: Budget recommendation Slack failed',
        error: err.message,
        recommendationId: id
      });
      return { success: false, error: err.message };
    }
  }

  /**
   * Send daily digest (summary of all warnings)
   */
  async sendDailyDigest(alerts) {
    if (!alerts || alerts.length === 0) {
      return { success: true, message: 'No alerts to digest' };
    }

    const critical = alerts.filter(a => a.alert_type === 'critical');
    const warnings = alerts.filter(a => a.alert_type === 'warning');

    // Slack summary
    if (this.slackWebhookUrl) {
      const payload = {
        text: `📊 Marketing Daily Digest: ${critical.length} critical, ${warnings.length} warnings`,
        attachments: [
          {
            color: critical.length > 0 ? '#dc2626' : '#f59e0b',
            blocks: [
              {
                type: 'section',
                text: {
                  type: 'mrkdwn',
                  text: `*Daily Marketing Alert Summary*\n\n` +
                    `🚨 *Critical:* ${critical.length}\n` +
                    `⚠️ *Warnings:* ${warnings.length}\n\n` +
                    (critical.length > 0 ? `*Critical Alerts:*\n${critical.map(a => `• ${a.title}`).join('\n')}\n\n` : '') +
                    (warnings.length > 0 ? `*Warnings:*\n${warnings.slice(0, 5).map(a => `• ${a.title}`).join('\n')}${warnings.length > 5 ? `\n_...and ${warnings.length - 5} more_` : ''}` : '')
                }
              },
              {
                type: 'actions',
                elements: [
                  {
                    type: 'button',
                    text: {
                      type: 'plain_text',
                      text: 'View All Alerts'
                    },
                    url: `${process.env.APP_URL || 'https://join.acmeops.com'}/marketing`
                  }
                ]
              }
            ]
          }
        ]
      };

      try {
        await axios.post(this.slackWebhookUrl, payload, {
          headers: { 'Content-Type': 'application/json' },
          timeout: 5000
        });
        logger.info({ msg: 'Marketing notification: Daily digest sent to Slack' });
      } catch (err) {
        logger.error({ msg: 'Marketing notification: Daily digest Slack failed', error: err.message });
      }
    }

    return { success: true };
  }
}

module.exports = MarketingNotificationService;
