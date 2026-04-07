/**
 * Slack Alert System for Performance Monitoring
 * 
 * Sends alerts to Slack when performance thresholds are exceeded
 */

const axios = require('axios');
const { logger } = require('./logger');

class SlackAlerts {
  constructor() {
    this.webhookUrl = process.env.SLACK_WEBHOOK_URL;
    this.channel = process.env.SLACK_ALERT_CHANNEL || '#alerts';
    this.enabled = !!this.webhookUrl;
    
    if (!this.enabled) {
      logger.warn('⚠️  Slack alerts disabled - SLACK_WEBHOOK_URL not configured');
    }
  }

  /**
   * Send performance alert to Slack
   * Supports two formats:
   * 1. Alert format: { type, category, message, fields, title, etc. }
   * 2. Metric format: { type, current, previous, threshold, value, unit }
   */
  async sendPerformanceAlert(alertOrMetric) {
    if (!this.enabled) return;

    // Detect if this is a metric format (has defined 'current' and 'previous') or alert format (has 'category' or 'fields')
    // Check for metric format: must have both current AND previous defined (not undefined)
    const isMetricFormat = alertOrMetric.hasOwnProperty('current') && 
                           alertOrMetric.hasOwnProperty('previous') &&
                           alertOrMetric.current !== undefined && 
                           alertOrMetric.previous !== undefined;
    
    if (isMetricFormat) {
      // Handle performance degradation metric format
      const metric = alertOrMetric;
      const { type, value, threshold, current, previous } = metric;
      const color = value > threshold * 1.5 ? 'danger' : value > threshold ? 'warning' : 'good';
      const emoji = value > threshold * 1.5 ? ':rotating_light:' : value > threshold ? ':warning:' : ':chart_with_upwards_trend:';
      
      const payload = {
        channel: this.channel,
        username: 'Acme Education Performance',
        icon_emoji: emoji,
        attachments: [
          {
            color: color,
            title: `${emoji} Performance Degradation Alert`,
            fields: [
              {
                title: 'Metric',
                value: type || 'unknown',
                short: true
              },
              {
                title: 'Current Value',
                value: current !== undefined ? `${current}${metric.unit || ''}` : 'N/A',
                short: true
              },
              {
                title: 'Previous Value',
                value: previous !== undefined ? `${previous}${metric.unit || ''}` : 'N/A',
                short: true
              },
              {
                title: 'Threshold',
                value: threshold !== undefined ? `${threshold}${metric.unit || ''}` : 'N/A',
                short: true
              },
              {
                title: 'Change',
                value: (current !== undefined && previous !== undefined && previous !== 0) 
                  ? `${((current - previous) / previous * 100).toFixed(1)}%` 
                  : 'N/A',
                short: true
              },
              {
                title: 'Environment',
                value: process.env.NODE_ENV || 'production',
                short: true
              },
              {
                title: 'Timestamp',
                value: new Date().toLocaleString(),
                short: false
              }
            ],
            footer: 'Acme Education Performance Monitoring',
            ts: Math.floor(Date.now() / 1000)
          }
        ]
      };

      try {
        await axios.post(this.webhookUrl, payload, {
          headers: { 'Content-Type': 'application/json' },
          timeout: 10000
        });
        logger.info(`✅ Performance alert sent: ${type} - ${current}${metric.unit || ''}`);
      } catch (error) {
        logger.error({ error: error.message }, '❌ Failed to send performance alert:');
      }
    } else {
      // Handle alert format (lesson reports, etc.)
      const alert = alertOrMetric;
      const color = alert.color || this.getAlertColor(alert.type);
      const emoji = alert.emoji || this.getAlertEmoji(alert.type);
      
      // Use custom fields if provided, otherwise use default fields
      const fields = alert.fields || [
        {
          title: 'Alert Type',
          value: alert.type ? alert.type.toUpperCase() : 'ALERT',
          short: true
        },
        {
          title: 'Category',
          value: alert.category || 'general',
          short: true
        },
        {
          title: 'Message',
          value: alert.message || 'No message provided',
          short: false
        },
        {
          title: 'Threshold',
          value: alert.threshold || 'N/A',
          short: true
        },
        {
          title: 'Environment',
          value: alert.environment || 'Unknown',
          short: true
        },
        {
          title: 'Timestamp',
          value: new Date().toLocaleString(),
          short: false
        }
      ];
      
      const payload = {
        channel: this.channel,
        username: 'Acme Education Monitor',
        icon_emoji: ':chart_with_upwards_trend:',
        attachments: [
          {
            color: color,
            title: alert.title || `${emoji} Performance Alert - ${alert.category ? alert.category.toUpperCase() : 'ALERT'}`,
            fields: fields,
            footer: 'Acme Education Monitoring',
            ts: Math.floor(Date.now() / 1000)
          }
        ]
      };

      try {
        await axios.post(this.webhookUrl, payload, {
          headers: { 'Content-Type': 'application/json' },
          timeout: 10000
        });
        
        logger.info(`✅ Slack alert sent: ${alert.type || 'alert'} - ${alert.category || 'general'}`);
      } catch (error) {
        logger.error({ error: error.message }, '❌ Failed to send Slack alert:');
      }
    }
  }

  /**
   * Send health status summary to Slack
   */
  async sendHealthSummary(healthData) {
    if (!this.enabled) return;

    const { health, performance, alerts } = healthData;
    const color = this.getHealthColor(health.status);
    const emoji = this.getHealthEmoji(health.status);
    
    const payload = {
      channel: this.channel,
      username: 'Acme Education Monitor',
      icon_emoji: ':white_check_mark:',
      attachments: [
        {
          color: color,
          title: `${emoji} Health Summary - ${healthData.environment}`,
          fields: [
            {
              title: 'Overall Health',
              value: `${health.status.toUpperCase()} (${health.score}/100)`,
              short: true
            },
            {
              title: 'Query Performance',
              value: `${performance.query_performance?.duration_ms || 'N/A'}ms`,
              short: true
            },
            {
              title: 'Database Size',
              value: performance.database_size?.['Database Size'] || 'N/A',
              short: true
            },
            {
              title: 'Active Alerts',
              value: alerts.length.toString(),
              short: true
            },
            {
              title: 'Timestamp',
              value: new Date().toLocaleString(),
              short: false
            }
          ],
          footer: 'Acme Education Monitoring',
          ts: Math.floor(Date.now() / 1000)
        }
      ]
    };

    // Add alert details if there are any
    if (alerts.length > 0) {
      const alertText = alerts.map(alert => 
        `• ${alert.type.toUpperCase()}: ${alert.message}`
      ).join('\n');
      
      payload.attachments.push({
        color: 'danger',
        title: 'Active Alerts',
        text: alertText,
        footer: 'Acme Education Monitoring'
      });
    }

    try {
      await axios.post(this.webhookUrl, payload, {
        headers: { 'Content-Type': 'application/json' },
        timeout: 10000
      });
      
      logger.info(`✅ Health summary sent to Slack for ${healthData.environment}`);
    } catch (error) {
      logger.error({ error: error.message }, '❌ Failed to send health summary to Slack:');
    }
  }

  /**
   * Send deployment notification
   */
  async sendDeploymentNotification(environment, changes) {
    if (!this.enabled) return;

    const payload = {
      channel: this.channel,
      username: 'Acme Education Deploy',
      icon_emoji: ':rocket:',
      attachments: [
        {
          color: 'good',
          title: '🚀 Performance Optimization Deployed',
          fields: [
            {
              title: 'Environment',
              value: environment,
              short: true
            },
            {
              title: 'Changes',
              value: changes.join('\n'),
              short: false
            },
            {
              title: 'Deployed By',
              value: process.env.USER || 'System',
              short: true
            },
            {
              title: 'Timestamp',
              value: new Date().toLocaleString(),
              short: true
            }
          ],
          footer: 'Acme Education Deployment',
          ts: Math.floor(Date.now() / 1000)
        }
      ]
    };

    try {
      await axios.post(this.webhookUrl, payload, {
        headers: { 'Content-Type': 'application/json' },
        timeout: 10000
      });
      
      logger.info(`✅ Deployment notification sent for ${environment}`);
    } catch (error) {
      logger.error({ error: error.message }, '❌ Failed to send deployment notification:');
    }
  }

  /**
   * Send database optimization results
   */
  async sendOptimizationResults(environment, results) {
    if (!this.enabled) return;

    const payload = {
      channel: this.channel,
      username: 'Acme Education Database',
      icon_emoji: ':database:',
      attachments: [
        {
          color: 'good',
          title: '📊 Database Optimization Results',
          fields: [
            {
              title: 'Environment',
              value: environment,
              short: true
            },
            {
              title: 'Indexes Created',
              value: results.indexes_created?.toString() || '0',
              short: true
            },
            {
              title: 'Query Performance',
              value: `${results.query_time_ms || 'N/A'}ms`,
              short: true
            },
            {
              title: 'Database Size',
              value: results.database_size || 'N/A',
              short: true
            },
            {
              title: 'Status',
              value: results.status || 'Completed',
              short: true
            },
            {
              title: 'Timestamp',
              value: new Date().toLocaleString(),
              short: true
            }
          ],
          footer: 'Acme Education Database Optimization',
          ts: Math.floor(Date.now() / 1000)
        }
      ]
    };

    try {
      await axios.post(this.webhookUrl, payload, {
        headers: { 'Content-Type': 'application/json' },
        timeout: 10000
      });
      
      logger.info(`✅ Optimization results sent for ${environment}`);
    } catch (error) {
      logger.error({ error: error.message }, '❌ Failed to send optimization results:');
    }
  }

  /**
   * Get alert color based on type
   */
  getAlertColor(type) {
    switch (type) {
      case 'critical': return 'danger';
      case 'warning': return 'warning';
      case 'info': return 'good';
      default: return '#36a64f';
    }
  }

  /**
   * Get alert emoji based on type
   */
  getAlertEmoji(type) {
    switch (type) {
      case 'critical': return ':rotating_light:';
      case 'warning': return ':warning:';
      case 'info': return ':information_source:';
      default: return ':bell:';
    }
  }

  /**
   * Get health color based on status
   */
  getHealthColor(status) {
    switch (status) {
      case 'excellent': return 'good';
      case 'good': return 'good';
      case 'warning': return 'warning';
      case 'critical': return 'danger';
      default: return '#36a64f';
    }
  }

  /**
   * Get health emoji based on status
   */
  getHealthEmoji(status) {
    switch (status) {
      case 'excellent': return ':green_heart:';
      case 'good': return ':white_check_mark:';
      case 'warning': return ':yellow_heart:';
      case 'critical': return ':red_circle:';
      default: return ':question:';
    }
  }

  /**
   * Send production error alert
   */
  async sendProductionError(error, context = {}) {
    if (!this.enabled) return;
    
    const severity = error.severity || 'high';
    const color = severity === 'critical' ? 'danger' : 'warning';
    const emoji = severity === 'critical' ? ':rotating_light:' : ':warning:';
    
    const payload = {
      channel: this.channel,
      username: 'Acme Education Alerts',
      icon_emoji: emoji,
      attachments: [
        {
          color: color,
          title: `${emoji} Production Error - ${severity.toUpperCase()}`,
          fields: [
            {
              title: 'Error Message',
              value: error.message || 'Unknown error',
              short: false
            },
            {
              title: 'Error Type',
              value: error.type || 'Unknown',
              short: true
            },
            {
              title: 'Environment',
              value: context.environment || process.env.NODE_ENV || 'production',
              short: true
            },
            {
              title: 'Route',
              value: context.route || 'Unknown',
              short: true
            },
            {
              title: 'User',
              value: context.user || 'Unknown',
              short: true
            },
            {
              title: 'Timestamp',
              value: new Date().toLocaleString(),
              short: false
            }
          ],
          footer: 'Acme Education Error Monitoring',
          ts: Math.floor(Date.now() / 1000)
        }
      ]
    };

    // Add DevOps Hub link as a field - include alertId if available
    const baseUrl = process.env.APP_URL || 'https://analytics.chessat3.com';
    const alertId = context.alertId;
    const devopsUrl = alertId 
      ? `${baseUrl}/devops?tab=alerts&alertId=${alertId}`
      : `${baseUrl}/devops?tab=alerts`;
    payload.attachments[0].fields.push({
      title: 'DevOps Hub',
      value: `<${devopsUrl}|View Alert Details & Manage Action Items>`,
      short: false
    });

    // Add stack trace if available (truncated)
    if (error.stack) {
      const stackPreview = error.stack.split('\n').slice(0, 5).join('\n');
      payload.attachments[0].fields.push({
        title: 'Stack Trace (Preview)',
        value: `\`\`\`${stackPreview}\`\`\``,
        short: false
      });
    }

    try {
      await axios.post(this.webhookUrl, payload, {
        headers: { 'Content-Type': 'application/json' },
        timeout: 10000
      });
      logger.info(`✅ Production error alert sent: ${severity} - ${error.type || 'unknown'}`);
    } catch (err) {
      logger.error({ error: err.message }, '❌ Failed to send production error alert:');
    }
  }

  /**
   * Send deployment notification
   */
  async sendDeploymentNotification(deployment) {
    if (!this.enabled) return;

    const { environment, version, status, user, changes } = deployment;
    const color = status === 'success' ? 'good' : status === 'failed' ? 'danger' : 'warning';
    const emoji = status === 'success' ? ':rocket:' : status === 'failed' ? ':x:' : ':hourglass:';
    
    const payload = {
      channel: this.channel,
      username: 'Acme Education Deploy',
      icon_emoji: emoji,
      attachments: [
        {
          color: color,
          title: `${emoji} Deployment ${status.toUpperCase()} - ${environment.toUpperCase()}`,
          fields: [
            {
              title: 'Environment',
              value: environment,
              short: true
            },
            {
              title: 'Status',
              value: status.toUpperCase(),
              short: true
            },
            {
              title: 'Version',
              value: version || 'Unknown',
              short: true
            },
            {
              title: 'Deployed By',
              value: user || process.env.USER || 'System',
              short: true
            },
            {
              title: 'Changes',
              value: changes || 'No changes specified',
              short: false
            },
            {
              title: 'Timestamp',
              value: new Date().toLocaleString(),
              short: false
            }
          ],
          footer: 'Acme Education Deployment',
          ts: Math.floor(Date.now() / 1000)
        }
      ]
    };

    try {
      await axios.post(this.webhookUrl, payload, {
        headers: { 'Content-Type': 'application/json' },
        timeout: 10000
      });
      logger.info(`✅ Deployment notification sent for ${environment}`);
    } catch (error) {
      logger.error({ error: error.message }, '❌ Failed to send deployment notification:');
    }
  }


  /**
   * Send database connection alert
   */
  async sendDatabaseAlert(alert) {
    if (!this.enabled) return;

    const { type, message, connectionPool, error } = alert;
    const color = type === 'connection_failed' ? 'danger' : type === 'pool_exhausted' ? 'warning' : 'warning';
    const emoji = type === 'connection_failed' ? ':rotating_light:' : ':warning:';
    
    const payload = {
      channel: this.channel,
      username: 'Acme Education Database',
      icon_emoji: emoji,
      attachments: [
        {
          color: color,
          title: `${emoji} Database Alert - ${type.toUpperCase()}`,
          fields: [
            {
              title: 'Alert Type',
              value: type,
              short: true
            },
            {
              title: 'Message',
              value: message,
              short: false
            },
            {
              title: 'Connection Pool',
              value: connectionPool ? `Active: ${connectionPool.active}, Idle: ${connectionPool.idle}, Total: ${connectionPool.total}` : 'N/A',
              short: false
            },
            {
              title: 'Environment',
              value: process.env.NODE_ENV || 'production',
              short: true
            },
            {
              title: 'Timestamp',
              value: new Date().toLocaleString(),
              short: false
            }
          ],
          footer: 'Acme Education Database Monitoring',
          ts: Math.floor(Date.now() / 1000)
        }
      ]
    };

    if (error) {
      payload.attachments[0].fields.push({
        title: 'Error Details',
        value: error.message || String(error),
        short: false
      });
    }

    try {
      await axios.post(this.webhookUrl, payload, {
        headers: { 'Content-Type': 'application/json' },
        timeout: 10000
      });
      logger.info(`✅ Database alert sent: ${type}`);
    } catch (err) {
      logger.error({ error: err.message }, '❌ Failed to send database alert:');
    }
  }

  /**
   * Send API rate limit warning
   */
  async sendRateLimitAlert(service, usage) {
    if (!this.enabled) return;

    const { current, limit, resetTime, percentage } = usage;
    const color = percentage > 90 ? 'danger' : percentage > 75 ? 'warning' : 'good';
    const emoji = percentage > 90 ? ':rotating_light:' : percentage > 75 ? ':warning:' : ':information_source:';
    
    const payload = {
      channel: this.channel,
      username: 'Acme Education API Monitor',
      icon_emoji: emoji,
      attachments: [
        {
          color: color,
          title: `${emoji} API Rate Limit Warning - ${service}`,
          fields: [
            {
              title: 'Service',
              value: service,
              short: true
            },
            {
              title: 'Current Usage',
              value: `${current}/${limit} (${percentage}%)`,
              short: true
            },
            {
              title: 'Reset Time',
              value: resetTime ? new Date(resetTime).toLocaleString() : 'N/A',
              short: true
            },
            {
              title: 'Status',
              value: percentage > 90 ? 'CRITICAL - Near limit' : percentage > 75 ? 'WARNING - High usage' : 'OK',
              short: true
            },
            {
              title: 'Environment',
              value: process.env.NODE_ENV || 'production',
              short: true
            },
            {
              title: 'Timestamp',
              value: new Date().toLocaleString(),
              short: false
            }
          ],
          footer: 'Acme Education API Monitoring',
          ts: Math.floor(Date.now() / 1000)
        }
      ]
    };

    try {
      await axios.post(this.webhookUrl, payload, {
        headers: { 'Content-Type': 'application/json' },
        timeout: 10000
      });
      logger.info(`✅ Rate limit alert sent: ${service} - ${percentage}%`);
    } catch (error) {
      logger.error({ error: error.message }, '❌ Failed to send rate limit alert:');
    }
  }

  /**
   * Send booking form completion notification
   * Notifies when a new client completes a booking form
   */
  async sendBookingFormNotification(submissionData) {
    if (!this.enabled) return;

    const {
      submissionId,
      clientId,
      clientName,
      email,
      status,
      bookingType,
      labelName,
      price,
      studentCount,
      isNewClient,
      createdAt
    } = submissionData;

    // Determine status emoji and color
    const statusEmoji = status === 'prospect' ? '✅' : status === 'live' ? '⚠️' : '❌';
    const statusColor = status === 'prospect' ? 'good' : status === 'live' ? 'warning' : 'danger';
    
    const baseUrl = 'https://join.acmeops.com';
    const submissionUrl = `${baseUrl}/booking-forms/submissions?id=${submissionId}`;
    const clientUrl = `https://account.acmeops.com/clients/${clientId}/`;

    const payload = {
      channel: this.channel,
      username: 'Booking Form Monitor',
      icon_emoji: ':tada:',
      attachments: [
        {
          color: statusColor,
          title: `${statusEmoji} New Booking Form Completed`,
          fields: [
            {
              title: 'Client Name',
              value: clientName || 'Unknown',
              short: true
            },
            {
              title: 'Email',
              value: email || 'Unknown',
              short: true
            },
            {
              title: 'Client Status',
              value: status ? status.toUpperCase() : 'UNKNOWN',
              short: true
            },
            {
              title: 'Client Type',
              value: isNewClient ? '🆕 NEW CLIENT' : '♻️ EXISTING CLIENT',
              short: true
            },
            {
              title: 'Submission ID',
              value: `#${submissionId}`,
              short: true
            },
            {
              title: 'TutorCruncher Client ID',
              value: clientId ? String(clientId) : 'N/A',
              short: true
            },
            {
              title: 'Booking Type',
              value: bookingType || 'Unknown',
              short: true
            },
            {
              title: 'Label',
              value: labelName || 'None',
              short: true
            },
            {
              title: 'Price',
              value: price ? `$${Number(price).toFixed(2)}` : 'N/A',
              short: true
            },
            {
              title: 'Students',
              value: studentCount ? String(studentCount) : '1',
              short: true
            },
            {
              title: 'Created At',
              value: createdAt ? new Date(createdAt).toLocaleString() : 'Unknown',
              short: true
            },
            {
              title: 'Links',
              value: `<${submissionUrl}|View Submission> | <${clientUrl}|View Client>`,
              short: false
            }
          ],
          footer: 'Acme Operations - Booking Form Monitor',
          ts: Math.floor(Date.now() / 1000)
        }
      ]
    };

    // Add warning if status is not prospect
    if (status !== 'prospect') {
      payload.attachments.push({
        color: 'warning',
        title: '⚠️ Status Check Required',
        text: `Client was created with status "${status}" instead of "prospect". Please verify they entered the pipeline correctly.`,
        footer: 'Action Required'
      });
    }

    try {
      await axios.post(this.webhookUrl, payload, {
        headers: { 'Content-Type': 'application/json' },
        timeout: 10000
      });
      logger.info(`✅ Booking form notification sent for submission ${submissionId}`);
    } catch (error) {
      logger.error({ error: error.message }, '❌ Failed to send booking form notification:');
      // Don't throw - notification failure shouldn't break the booking flow
    }
  }

  /**
   * Send booking form start notification
   * Notifies when someone starts filling out a booking form
   */
  async sendBookingFormStartNotification(eventData) {
    if (!this.enabled) return;

    const {
      sessionId,
      stepName,
      stepNumber,
      metadata = {}
    } = eventData;

    const baseUrl = process.env.APP_URL || 'https://analytics.chessat3.com';
    const utmSource = metadata.utm?.utm_source || 'Unknown';
    const utmCampaign = metadata.utm?.utm_campaign || 'None';
    const landingUrl = metadata.landing_url || 'N/A';

    const payload = {
      channel: this.channel,
      username: 'Booking Form Monitor',
      icon_emoji: ':writing_hand:',
      attachments: [
        {
          color: 'good',
          title: '📝 Someone Started Filling Out Booking Form',
          fields: [
            {
              title: 'Session ID',
              value: sessionId || 'Unknown',
              short: true
            },
            {
              title: 'Step',
              value: stepName ? `${stepName} (Step ${stepNumber || 1})` : 'Step 1',
              short: true
            },
            {
              title: 'UTM Source',
              value: utmSource,
              short: true
            },
            {
              title: 'UTM Campaign',
              value: utmCampaign,
              short: true
            },
            {
              title: 'Landing URL',
              value: landingUrl.length > 50 ? `${landingUrl.substring(0, 47)}...` : landingUrl,
              short: false
            },
            {
              title: 'Timestamp',
              value: new Date().toLocaleString(),
              short: true
            }
          ],
          footer: 'Acme Operations - Booking Form Monitor',
          ts: Math.floor(Date.now() / 1000)
        }
      ]
    };

    try {
      await axios.post(this.webhookUrl, payload, {
        headers: { 'Content-Type': 'application/json' },
        timeout: 10000
      });
      logger.info(`✅ Booking form start notification sent for session ${sessionId}`);
    } catch (error) {
      logger.error({ error: error.message }, '❌ Failed to send booking form start notification:');
      // Don't throw - notification failure shouldn't break the tracking flow
    }
  }

  /**
   * Send booking form submission notification (for drafts and final submissions)
   * Notifies when a submission is created (draft or final)
   */
  async sendBookingFormSubmissionNotification(submissionData) {
    if (!this.enabled) return;

    const {
      submissionId,
      status, // 'draft' or 'submitted'
      parentFirst,
      parentLast,
      parentEmail,
      parentPhone,
      bookingType,
      labelName,
      price,
      studentCount,
      isDraft,
      createdAt,
      sessionId,
      tcClientId,
      tcClientStatus,
      preferredTutorName
    } = submissionData;

    const clientName = parentFirst && parentLast ? `${parentFirst} ${parentLast}` : 'Unknown';
    const baseUrl = 'https://join.acmeops.com';
    const submissionUrl = `${baseUrl}/booking-forms/submissions?id=${submissionId}`;
    
    const isDraftStatus = status === 'draft' || isDraft;
    const emoji = isDraftStatus ? '📋' : '✅';
    const title = isDraftStatus ? '📋 Draft Booking Form Created' : '✅ Booking Form Submitted';
    const color = isDraftStatus ? '#36a64f' : 'good';

    const fields = [
      {
        title: 'Submission ID',
        value: `#${submissionId}`,
        short: true
      },
      {
        title: 'Status',
        value: isDraftStatus ? '📋 DRAFT' : '✅ SUBMITTED',
        short: true
      },
      {
        title: 'Client Name',
        value: clientName,
        short: true
      },
      {
        title: 'Email',
        value: parentEmail || 'Not provided',
        short: true
      },
      {
        title: 'Phone',
        value: parentPhone || 'Not provided',
        short: true
      },
      {
        title: 'Booking Type',
        value: bookingType || 'Unknown',
        short: true
      },
      {
        title: 'Label',
        value: labelName || 'None',
        short: true
      },
      {
        title: 'Price',
        value: price ? `$${Number(price).toFixed(2)}` : 'N/A',
        short: true
      },
      {
        title: 'Students',
        value: studentCount ? String(studentCount) : '1',
        short: true
      }
    ];

    // Add preferred tutor if specified (from public profile booking)
    if (preferredTutorName) {
      fields.push({
        title: 'Preferred Tutor',
        value: `⭐ ${preferredTutorName}`,
        short: true
      });
    }

    // Add TutorCruncher client info for finalized submissions
    if (!isDraftStatus && tcClientId) {
      const clientUrl = `https://account.acmeops.com/clients/${tcClientId}/`;
      fields.push({
        title: 'TutorCruncher Client ID',
        value: tcClientId ? `<${clientUrl}|${tcClientId}>` : 'N/A',
        short: true
      });
      
      if (tcClientStatus) {
        const statusEmoji = tcClientStatus === 'prospect' ? '✅' : tcClientStatus === 'live' ? '⚠️' : '❌';
        const statusColor = tcClientStatus === 'prospect' ? 'good' : tcClientStatus === 'live' ? 'warning' : 'danger';
        fields.push({
          title: 'TutorCruncher Status',
          value: `${statusEmoji} ${tcClientStatus.toUpperCase()}`,
          short: true
        });
      }
    }

    fields.push(
      {
        title: 'Session ID',
        value: sessionId || 'N/A',
        short: true
      },
      {
        title: 'Created At',
        value: createdAt ? new Date(createdAt).toLocaleString() : 'Unknown',
        short: true
      },
      {
        title: 'View Submission',
        value: `<${submissionUrl}|View Submission #${submissionId}>`,
        short: false
      }
    );

    const payload = {
      channel: this.channel,
      username: 'Booking Form Monitor',
      icon_emoji: emoji,
      attachments: [
        {
          color: color,
          title: title,
          fields: fields,
          footer: 'Acme Operations - Booking Form Monitor',
          ts: Math.floor(Date.now() / 1000)
        }
      ]
    };

    // Add warning if TutorCruncher client status is not "prospect" for finalized submissions
    if (!isDraftStatus && tcClientStatus && tcClientStatus !== 'prospect') {
      payload.attachments.push({
        color: 'warning',
        title: '⚠️ Status Check Required',
        text: `Client was created with status "${tcClientStatus}" instead of "prospect". Please verify they entered the pipeline correctly.\n\nSubmission: #${submissionId}\nClient ID: ${tcClientId || 'N/A'}`,
        footer: 'Action Required - Verify TutorCruncher Client Status'
      });
    }

    try {
      await axios.post(this.webhookUrl, payload, {
        headers: { 'Content-Type': 'application/json' },
        timeout: 10000
      });
      logger.info(`✅ Booking form submission notification sent for submission ${submissionId} (${isDraftStatus ? 'draft' : 'submitted'})`);
    } catch (error) {
      logger.error({ error: error.message }, '❌ Failed to send booking form submission notification:');
      // Don't throw - notification failure shouldn't break the submission flow
    }
  }

  /**
   * Send payment completed notification (5th alert in booking flow)
   * Confirms payment is complete and client has been setup in TutorCruncher
   */
  async sendBookingPaymentCompletedNotification(data) {
    if (!this.enabled) return;

    const {
      submissionId,
      parentFirst,
      parentLast,
      parentEmail,
      bookingType,
      labelName,
      price,
      studentCount,
      tcClientId,
      stripeCustomerId,
      stripeSessionId,
      recipientIds = [],
      serviceId
    } = data;

    const clientName = parentFirst && parentLast ? `${parentFirst} ${parentLast}` : 'Unknown';
    const baseUrl = 'https://join.acmeops.com';
    const submissionUrl = `${baseUrl}/booking-forms/submissions?id=${submissionId}`;
    const tcClientUrl = tcClientId ? `https://account.acmeops.com/clients/${tcClientId}/` : null;

    const fields = [
      {
        title: 'Submission ID',
        value: `#${submissionId}`,
        short: true
      },
      {
        title: 'Status',
        value: '💰 PAID & SETUP COMPLETE',
        short: true
      },
      {
        title: 'Client Name',
        value: clientName,
        short: true
      },
      {
        title: 'Email',
        value: parentEmail || 'Not provided',
        short: true
      },
      {
        title: 'Booking Type',
        value: bookingType || 'Unknown',
        short: true
      },
      {
        title: 'Label',
        value: labelName || 'None',
        short: true
      },
      {
        title: 'Price',
        value: price ? `$${Number(price).toFixed(2)}` : 'N/A',
        short: true
      },
      {
        title: 'Students',
        value: studentCount ? String(studentCount) : '1',
        short: true
      }
    ];

    // Add TutorCruncher client info
    if (tcClientId) {
      fields.push({
        title: 'TutorCruncher Client',
        value: `<${tcClientUrl}|Client #${tcClientId}>`,
        short: true
      });
    }

    // Add recipients info if available
    if (recipientIds.length > 0) {
      fields.push({
        title: 'Students Added',
        value: recipientIds.length === 1 ? '1 student' : `${recipientIds.length} students`,
        short: true
      });
    }

    // Add service link if available
    if (serviceId) {
      const serviceUrl = `https://account.acmeops.com/cal/service/${serviceId}/`;
      fields.push({
        title: 'Service',
        value: `<${serviceUrl}|View Service>`,
        short: true
      });
    }

    fields.push({
      title: 'View Submission',
      value: `<${submissionUrl}|View Submission #${submissionId}>`,
      short: false
    });

    const payload = {
      channel: this.channel,
      username: 'Booking Form Monitor',
      icon_emoji: ':white_check_mark:',
      attachments: [
        {
          color: 'good',
          title: '💰 Payment Completed & TutorCruncher Setup Done',
          fields: fields,
          footer: 'Acme Operations - Booking Form Monitor',
          ts: Math.floor(Date.now() / 1000)
        }
      ]
    };

    try {
      await axios.post(this.webhookUrl, payload, {
        headers: { 'Content-Type': 'application/json' },
        timeout: 10000
      });
      logger.info(`✅ Payment completed notification sent for submission ${submissionId}`);
    } catch (error) {
      logger.error({ error: error.message }, '❌ Failed to send payment completed notification:');
      // Don't throw - notification failure shouldn't break the payment flow
    }
  }

  /**
   * Send payment failure alert to dedicated Slack channel AND email
   * Fires when Stripe payment succeeds but TC credit request or take_payment fails
   *
   * @param {Object} data - Alert data
   * @param {string} data.failureType - 'credit_request_creation' | 'take_payment' | 'payment_processing' | 'subscription_setup'
   * @param {string} data.errorMessage - The error message from the failed operation
   * @param {number|string} [data.clientId] - TC client ID
   * @param {string} [data.clientName] - Parent name
   * @param {string} [data.clientEmail] - Parent email
   * @param {number} [data.amount] - Payment amount
   * @param {string} [data.stripeSessionId] - Stripe checkout session ID
   * @param {string} [data.stripeCustomerId] - Stripe customer ID
   * @param {number} [data.submissionId] - Booking submission ID
   * @param {number} [data.creditRequestId] - TC proforma invoice ID (if created)
   * @param {string} [data.serviceId] - TC service ID
   * @param {string} [data.environment] - production | staging | westside | eastside
   */
  async sendPaymentFailureAlert(data) {
    const {
      failureType,
      errorMessage,
      clientId,
      clientName,
      clientEmail,
      amount,
      stripeSessionId,
      stripeCustomerId,
      submissionId,
      creditRequestId,
      serviceId,
      environment = 'production'
    } = data;

    const failureLabels = {
      credit_request_creation: 'TC Credit Request Creation Failed',
      take_payment: 'TC take_payment Failed (Credit Created, Not Marked Paid)',
      payment_processing: 'Legacy Payment Processing Failed',
      subscription_setup: 'Subscription Setup Failed After Payment'
    };

    const failureLabel = failureLabels[failureType] || `Payment Failure: ${failureType}`;

    // Build Slack fields
    const fields = [
      { title: 'Failure Type', value: failureLabel, short: false },
      { title: 'Error', value: errorMessage || 'Unknown error', short: false }
    ];

    if (clientId) {
      const tcUrl = `https://account.acmeops.com/clients/${clientId}/accounting/`;
      fields.push({ title: 'TC Client', value: `<${tcUrl}|Client #${clientId}>${clientName ? ` — ${clientName}` : ''}`, short: true });
    }
    if (clientEmail) {
      fields.push({ title: 'Email', value: clientEmail, short: true });
    }
    if (amount) {
      fields.push({ title: 'Amount', value: `$${Number(amount).toFixed(2)}`, short: true });
    }
    if (environment) {
      fields.push({ title: 'Environment', value: environment, short: true });
    }
    if (stripeSessionId) {
      fields.push({ title: 'Stripe Session', value: stripeSessionId, short: false });
    }
    if (creditRequestId) {
      const pfiUrl = `https://account.acmeops.com/proforma-invoices/${creditRequestId}/`;
      fields.push({ title: 'Credit Request', value: `<${pfiUrl}|PFI-${creditRequestId}> (created but NOT paid)`, short: true });
    }
    if (submissionId) {
      const subUrl = `https://join.acmeops.com/booking-hub/submissions?id=${submissionId}`;
      fields.push({ title: 'Submission', value: `<${subUrl}|#${submissionId}>`, short: true });
    }
    if (serviceId) {
      const svcUrl = `https://account.acmeops.com/cal/service/${serviceId}/`;
      fields.push({ title: 'Service', value: `<${svcUrl}|View Service>`, short: true });
    }

    // === SLACK NOTIFICATION ===
    const failedPaymentsWebhookUrl = process.env.SLACK_FAILED_PAYMENTS_WEBHOOK_URL;
    if (failedPaymentsWebhookUrl) {
      try {
        const slackPayload = {
          username: 'Payment Failure Alert',
          icon_emoji: ':rotating_light:',
          attachments: [
            {
              color: 'danger',
              title: `:rotating_light: ${failureLabel}`,
              text: `Stripe payment succeeded but TC credit was NOT applied. Manual action required.`,
              fields: fields,
              footer: `Acme Operations — ${environment}`,
              ts: Math.floor(Date.now() / 1000)
            }
          ]
        };

        await axios.post(failedPaymentsWebhookUrl, slackPayload, {
          headers: { 'Content-Type': 'application/json' },
          timeout: 10000
        });
        logger.info({ clientId, failureType }, '✅ Payment failure Slack alert sent');
      } catch (slackError) {
        logger.error({ error: slackError.message }, '❌ Failed to send payment failure Slack alert');
      }
    } else {
      logger.warn('⚠️ SLACK_FAILED_PAYMENTS_WEBHOOK_URL not configured — skipping Slack payment failure alert');
    }

    // === EMAIL NOTIFICATION ===
    try {
      const BrevoEmailSender = require('./brevo-email-sender');
      const brevo = new BrevoEmailSender();

      const tcClientLink = clientId
        ? `<a href="https://account.acmeops.com/clients/${clientId}/accounting/">Client #${clientId} on TC</a>`
        : 'N/A';
      const pfiLink = creditRequestId
        ? `<a href="https://account.acmeops.com/proforma-invoices/${creditRequestId}/">PFI-${creditRequestId}</a>`
        : 'N/A';
      const submissionLink = submissionId
        ? `<a href="https://join.acmeops.com/booking-hub/submissions?id=${submissionId}">Submission #${submissionId}</a>`
        : 'N/A';

      const html = `
        <div style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; max-width: 600px; margin: 0 auto;">
          <div style="background: #dc2626; color: white; padding: 16px 24px; border-radius: 8px 8px 0 0;">
            <h2 style="margin: 0; font-size: 18px;">Payment Failure Alert</h2>
            <p style="margin: 4px 0 0; opacity: 0.9; font-size: 14px;">${failureLabel}</p>
          </div>
          <div style="border: 1px solid #e5e7eb; border-top: none; padding: 24px; border-radius: 0 0 8px 8px;">
            <p style="margin: 0 0 16px; color: #dc2626; font-weight: 600;">
              Stripe payment succeeded but TC credit was NOT applied. Manual action required.
            </p>
            <table style="width: 100%; border-collapse: collapse; font-size: 14px;">
              <tr><td style="padding: 8px 0; color: #6b7280; width: 140px;">Client</td><td style="padding: 8px 0;">${tcClientLink}${clientName ? ` — ${clientName}` : ''}</td></tr>
              <tr><td style="padding: 8px 0; color: #6b7280;">Email</td><td style="padding: 8px 0;">${clientEmail || 'N/A'}</td></tr>
              <tr><td style="padding: 8px 0; color: #6b7280;">Amount</td><td style="padding: 8px 0; font-weight: 600;">$${amount ? Number(amount).toFixed(2) : 'N/A'}</td></tr>
              <tr><td style="padding: 8px 0; color: #6b7280;">Environment</td><td style="padding: 8px 0;">${environment}</td></tr>
              <tr><td style="padding: 8px 0; color: #6b7280;">Stripe Session</td><td style="padding: 8px 0; font-family: monospace; font-size: 12px;">${stripeSessionId || 'N/A'}</td></tr>
              <tr><td style="padding: 8px 0; color: #6b7280;">Credit Request</td><td style="padding: 8px 0;">${pfiLink}</td></tr>
              <tr><td style="padding: 8px 0; color: #6b7280;">Submission</td><td style="padding: 8px 0;">${submissionLink}</td></tr>
              <tr><td style="padding: 8px 0; color: #6b7280;">Error</td><td style="padding: 8px 0; color: #dc2626;">${errorMessage || 'Unknown'}</td></tr>
            </table>
            <hr style="margin: 20px 0; border: none; border-top: 1px solid #e5e7eb;" />
            <p style="margin: 0; font-size: 13px; color: #9ca3af;">
              To fix: Create a proforma invoice for the amount on the client's TC account and mark it as paid via credit_card.
            </p>
          </div>
        </div>
      `;

      await brevo.sendEmail({
        to: 'doug.kvamme@acmeops.com',
        subject: `[PAYMENT FAILURE] ${clientName || `Client ${clientId}`} — $${amount ? Number(amount).toFixed(2) : '??'} not credited to TC`,
        html: html
      });
      logger.info({ clientId, failureType }, '✅ Payment failure email sent to doug.kvamme@acmeops.com');
    } catch (emailError) {
      logger.error({ error: emailError.message }, '❌ Failed to send payment failure email');
    }
  }

  /**
   * Test Slack integration
   */
  async testConnection() {
    if (!this.enabled) {
      return { success: false, message: 'Slack webhook URL not configured' };
    }

    try {
      const payload = {
        channel: this.channel,
        username: 'Acme Education Test',
        icon_emoji: ':test_tube:',
        text: '🧪 Slack integration test successful!'
      };

      await axios.post(this.webhookUrl, payload, {
        headers: { 'Content-Type': 'application/json' },
        timeout: 10000
      });

      return { success: true, message: 'Slack integration working correctly' };
    } catch (error) {
      return { success: false, message: `Slack integration failed: ${error.message}` };
    }
  }
}

module.exports = SlackAlerts;
