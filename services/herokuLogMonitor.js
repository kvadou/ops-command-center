/**
 * Heroku Log Monitoring Service
 * Fetches and analyzes logs from Heroku apps to detect issues
 */

const axios = require('axios');
const { logger } = require('../utils/logger');

const APP_CONFIGS = {
  main: {
    appName: 'acme-ops-main',
    environment: 'production',
    displayName: 'Main Production'
  },
  'westside': {
    appName: 'acmeops-westside',
    environment: 'production',
    displayName: Westside
  },
  'eastside': {
    appName: 'acmeops-eastside',
    environment: 'production',
    displayName: Eastside
  }
};

class HerokuLogMonitor {
  constructor(pool, slackAlerts) {
    this.pool = pool;
    this.slackAlerts = slackAlerts;
    this.lastCheckTimes = {};
  }

  /**
   * Fetch recent logs from a Heroku app using the Heroku API
   */
  async fetchLogs(appName, numLines = 100) {
    try {
      const apiToken = process.env.HEROKU_API_TOKEN;
      
      if (!apiToken) {
        logger.warn(`⚠️  HEROKU_API_TOKEN not set. Cannot fetch logs from ${appName}.`);
        return '';
      }

      // Create a log session using Heroku API
      const response = await axios.post(
        `https://api.heroku.com/apps/${appName}/log-sessions`,
        {
          lines: numLines,
          source: 'app',
          tail: false
        },
        {
          headers: {
            'Authorization': `Bearer ${apiToken}`,
            'Accept': 'application/vnd.heroku+json; version=3',
            'Content-Type': 'application/json'
          },
          timeout: 30000
        }
      );

      // The log-session response contains a logplex_url that we need to fetch
      if (response.data && response.data.logplex_url) {
        const logResponse = await axios.get(response.data.logplex_url, {
          timeout: 30000
        });
        return logResponse.data || '';
      }

      return '';
    } catch (error) {
      // If API token is not available or other error, try using exec as fallback
      // (This will work if running locally, not on Heroku)
      if (!process.env.HEROKU_API_TOKEN && process.env.NODE_ENV !== 'production') {
        try {
          const { exec } = require('child_process');
          const { promisify } = require('util');
          const execAsync = promisify(exec);
          const { stdout } = await execAsync(
            `heroku logs --app ${appName} --num ${numLines} --source app`,
            { timeout: 30000 }
          );
          return stdout;
        } catch (execError) {
          logger.error({ error: execError.message }, `Error fetching logs from ${appName} via CLI:`);
        }
      }
      
      logger.error({ error: error.message }, `Error fetching logs from ${appName}:`);
      // Return empty if we can't fetch logs (app might be sleeping, etc.)
      return '';
    }
  }

  /**
   * Parse log lines and extract relevant information
   * Handles multiline JSON logs by combining consecutive lines that are part of the same JSON object
   */
  parseLogLines(logContent) {
    if (!logContent) return [];

    const lines = logContent.split('\n');
    const parsedLogs = [];
    let currentLog = null;
    let jsonBuffer = '';
    let jsonLineCount = 0;
    const MAX_JSON_LINES = 50; // Prevent infinite buffering

    for (let i = 0; i < lines.length; i++) {
      const line = lines[i];
      const nextLine = i < lines.length - 1 ? lines[i + 1] : null;
      
      // Skip empty lines
      if (!line.trim()) {
        // Empty line might indicate end of multiline JSON
        if (currentLog && jsonBuffer) {
          // Try to parse what we have so far
          try {
            JSON.parse(jsonBuffer.trim());
            // Valid JSON, save it
            currentLog.message = jsonBuffer.trim();
            parsedLogs.push(currentLog);
          } catch (e) {
            // Invalid JSON, save as-is
            currentLog.message = jsonBuffer.trim();
            parsedLogs.push(currentLog);
          }
          currentLog = null;
          jsonBuffer = '';
          jsonLineCount = 0;
        }
        continue;
      }

      // Parse Heroku log format: timestamp source[dyno]: message
      const match = line.match(/^(\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}.\d+Z)\s+(\w+)\[(\w+)\]:\s+(.+)$/);
      
      if (match) {
        const [, timestamp, source, dyno, message] = match;
        const trimmedMessage = message.trim();
        
        // Check if this looks like JSON (starts with { or contains structured log fields)
        const looksLikeJson = trimmedMessage.startsWith('{') || 
                             (trimmedMessage.startsWith('"') && trimmedMessage.includes('"level":')) ||
                             (trimmedMessage.startsWith('"') && trimmedMessage.includes('"severity":')) ||
                             (trimmedMessage.startsWith('"') && trimmedMessage.includes('"event":'));
        
        // Check if it's a continuation line (indented or continues JSON)
        const isContinuation = currentLog && jsonBuffer && (
          trimmedMessage.startsWith('  ') || 
          trimmedMessage.startsWith('    ') ||
          trimmedMessage.match(/^\s*["}]/) ||
          (!trimmedMessage.includes(':') && jsonLineCount > 0)
        );

        if (looksLikeJson || isContinuation) {
          // This is part of a JSON log
          if (!currentLog) {
            // Start a new JSON log
            currentLog = {
              timestamp: new Date(timestamp),
              source,
              dyno,
              message: trimmedMessage,
              raw: line
            };
            jsonBuffer = trimmedMessage;
            jsonLineCount = 1;
          } else {
            // Continuation of existing JSON log
            jsonBuffer += '\n' + trimmedMessage;
            currentLog.raw += '\n' + line;
            jsonLineCount++;
            
            // Check if this completes the JSON (has closing brace)
            if (trimmedMessage.includes('}')) {
              try {
                const fullJson = jsonBuffer.trim();
                JSON.parse(fullJson);
                // Valid complete JSON
                currentLog.message = fullJson;
                parsedLogs.push(currentLog);
                currentLog = null;
                jsonBuffer = '';
                jsonLineCount = 0;
              } catch (e) {
                // Might be nested JSON, continue buffering if within limit
                if (jsonLineCount >= MAX_JSON_LINES) {
                  // Too many lines, save what we have
                  currentLog.message = jsonBuffer.trim();
                  parsedLogs.push(currentLog);
                  currentLog = null;
                  jsonBuffer = '';
                  jsonLineCount = 0;
                }
              }
            } else if (jsonLineCount >= MAX_JSON_LINES) {
              // Too many lines without completion, save what we have
              currentLog.message = jsonBuffer.trim();
              parsedLogs.push(currentLog);
              currentLog = null;
              jsonBuffer = '';
              jsonLineCount = 0;
            }
          }
        } else {
          // Not JSON - save any buffered JSON first
          if (currentLog && jsonBuffer) {
            currentLog.message = jsonBuffer.trim();
            parsedLogs.push(currentLog);
            currentLog = null;
            jsonBuffer = '';
            jsonLineCount = 0;
          }
          
          // Regular single-line log
          parsedLogs.push({
            timestamp: new Date(timestamp),
            source,
            dyno,
            message: trimmedMessage,
            raw: line
          });
        }
      } else {
        // Line doesn't match Heroku format
        if (currentLog && jsonBuffer) {
          // Might be continuation of JSON
          const trimmed = line.trim();
          if (trimmed.startsWith('  ') || trimmed.startsWith('"') || trimmed.match(/^[\s}]/)) {
            jsonBuffer += '\n' + trimmed;
            currentLog.raw += '\n' + line;
            jsonLineCount++;
            
            // Check for completion
            if (trimmed.includes('}')) {
              try {
                const fullJson = jsonBuffer.trim();
                JSON.parse(fullJson);
                currentLog.message = fullJson;
                parsedLogs.push(currentLog);
                currentLog = null;
                jsonBuffer = '';
                jsonLineCount = 0;
              } catch (e) {
                // Keep buffering
              }
            }
          } else {
            // Not part of JSON, save buffered log
            currentLog.message = jsonBuffer.trim();
            parsedLogs.push(currentLog);
            currentLog = null;
            jsonBuffer = '';
            jsonLineCount = 0;
            
            // Save this line as separate entry
            parsedLogs.push({
              timestamp: new Date(),
              source: 'unknown',
              dyno: 'unknown',
              message: line.trim(),
              raw: line
            });
          }
        } else {
          // Standalone line
          parsedLogs.push({
            timestamp: new Date(),
            source: 'unknown',
            dyno: 'unknown',
            message: line.trim(),
            raw: line
          });
        }
      }
    }

    // Save any remaining buffered JSON log
    if (currentLog && jsonBuffer) {
      currentLog.message = jsonBuffer.trim();
      parsedLogs.push(currentLog);
    }

    return parsedLogs;
  }

  /**
   * Detect alert-worthy issues in log entries
   */
  detectAlerts(logEntries, environment, appName) {
    const alerts = [];

    for (const entry of logEntries) {
      let message = entry.message.toLowerCase();
      let rawMessage = entry.message;
      
      // Try to parse as JSON for better handling
      let parsedJson = null;
      let originalRawMessage = rawMessage; // Keep original for checking
      
      try {
        parsedJson = JSON.parse(rawMessage);
        
        // FIRST: Check if this is normal request logging BEFORE extracting message
        // Skip normal request lifecycle logs (request_start, request_complete)
        if (parsedJson.event === 'request_start' || parsedJson.event === 'request_complete') {
          continue; // Skip normal request logging
        }
        
        // Skip info-level logs - they're observability, not errors
        if (parsedJson.level === 'info' || parsedJson.level === 'debug') {
          continue; // Skip informational logs
        }
        
        // Skip 304 Not Modified responses - cache hits
        if (parsedJson.statusCode === 304 || parsedJson.status_code === 304) {
          continue; // Skip cache hits
        }
        
        // Skip successful 2xx responses from normal logging
        if (parsedJson.statusCode >= 200 && parsedJson.statusCode < 300 && 
            (parsedJson.event === 'request_complete' || parsedJson.level === 'info')) {
          continue; // Skip successful request logs
        }
        
        // If it's a valid JSON log, extract the actual message for error detection
        if (parsedJson.msg) {
          message = parsedJson.msg.toLowerCase();
          rawMessage = parsedJson.msg;
        } else if (parsedJson.message) {
          message = parsedJson.message.toLowerCase();
          rawMessage = parsedJson.message;
        } else if (parsedJson.error) {
          message = (parsedJson.error.message || parsedJson.error).toLowerCase();
          rawMessage = parsedJson.error.message || parsedJson.error;
        }
        
        // Skip incomplete JSON fragments (only has partial fields)
        if (rawMessage.includes('severity:') && rawMessage.trim().endsWith(',')) {
          continue; // Incomplete log fragment, skip
        }
      } catch (e) {
        // Not JSON, use as-is
        parsedJson = null;
      }

      // Skip route registration messages - these are informational, not errors
      if (
        rawMessage.includes('[ROUTE REGISTRATION]') ||
        rawMessage.includes('Registering') && rawMessage.includes('route handler') ||
        rawMessage.includes('[CRITICAL DEBUG]')
      ) {
        continue; // Skip this entry entirely
      }

      // Skip incomplete JSON fragments (partial log entries that were split)
      // These are just fragments like "severity: 'FATAL'," without full context
      if (
        (rawMessage.includes('severity:') || rawMessage.includes('"severity":')) &&
        !rawMessage.includes('message') &&
        !rawMessage.includes('error') &&
        !rawMessage.includes('stack') &&
        !parsedJson &&
        rawMessage.trim().length < 200
      ) {
        continue; // Skip incomplete JSON fragments
      }

      // Skip normal request logging (request_start, request_complete) - check original message if not JSON
      // Also skip 304 Not Modified responses and successful 2xx responses from normal logging
      if (!parsedJson) {
        // For non-JSON logs, check the raw message
        const isNormalRequestLog = originalRawMessage.includes('"event":"request_start"') ||
                                   originalRawMessage.includes('"event":"request_complete"') ||
                                   originalRawMessage.includes('"level":"info"') ||
                                   originalRawMessage.includes('"statusCode":304') ||
                                   originalRawMessage.includes('"status_code":304') ||
                                   (originalRawMessage.includes('statusCode') && 
                                    originalRawMessage.match(/"statusCode":(200|201|202|204|206|207|304)/) &&
                                    (originalRawMessage.includes('request_complete') || originalRawMessage.includes('event":"request')));

        if (isNormalRequestLog) {
          continue; // Skip normal request lifecycle logs and cache hits
        }
      }
      // Note: JSON logs are already filtered above in the parsing section

      // Payment/Stripe failures (CRITICAL)
      if (
        message.includes('stripe') &&
        (message.includes('failed') ||
          message.includes('error') ||
          message.includes('❌') ||
          message.includes('signature verification failed') ||
          message.includes('payment processing failed') ||
          message.includes('checkout session creation failed'))
      ) {
        alerts.push({
          alert_type: 'payment_failure',
          severity: 'critical',
          environment,
          source: 'heroku_logs',
          title: 'Stripe/Payment Issue Detected',
          message: rawMessage,
          log_entry: entry.raw,
          context: {
            dyno: entry.dyno,
            timestamp: entry.timestamp.toISOString(),
            app: appName
          }
        });
      }

      // Database errors (HIGH)
      // Skip success messages - they contain "database" and "connection" but are not errors
      // Check for success indicators: ✅ emoji, "successful", "success", or positive connection messages
      const isDatabaseSuccess = (
        (message.includes('database') || message.includes('connection')) &&
        (message.includes('successful') || 
         message.includes('success') ||
         rawMessage.includes('✅') ||
         (rawMessage.includes('✅') && !rawMessage.includes('failed') && !rawMessage.includes('error')))
      );
      
      // Skip if this is a success message
      if (isDatabaseSuccess) {
        continue; // Skip this entry entirely
      }
      
      if (
        (message.includes('database') || message.includes('postgres') || message.includes('sql')) &&
        (message.includes('error') || message.includes('failed') || message.includes('timeout') ||
        (message.includes('connection') && (message.includes('failed') || message.includes('❌') || message.includes('error'))))
      ) {
        alerts.push({
          alert_type: 'error',
          severity: 'high',
          environment,
          source: 'heroku_logs',
          title: 'Database Error Detected',
          message: rawMessage,
          log_entry: entry.raw,
          context: {
            dyno: entry.dyno,
            timestamp: entry.timestamp.toISOString(),
            app: appName
          }
        });
      }

      // Critical errors (marked with 🚨 or ERROR/CRITICAL)
      // Note: Normal request logging has already been filtered out above
      // Exclude bad margin alerts - they're sent to support team via email, not DevOps alerts
      if (
        !message.includes('[ROUTE REGISTRATION]') &&
        !message.includes('[CRITICAL DEBUG]') &&
        !message.includes('bad margin') && // Exclude bad margin alerts
        !rawMessage.includes('Bad Margin Alert') && // Exclude bad margin alerts
        (message.includes('🚨') ||
        (message.includes('critical') && !message.includes('request')) ||
        message.includes('fatal') ||
        (message.includes('error') &&
          (message.includes('crash') ||
          message.includes('exception') ||
          message.includes('uncaught'))))
      ) {
        alerts.push({
          alert_type: 'error',
          severity: 'critical',
          environment,
          source: 'heroku_logs',
          title: 'Critical Error Detected',
          message: rawMessage,
          log_entry: entry.raw,
          context: {
            dyno: entry.dyno,
            timestamp: entry.timestamp.toISOString(),
            app: appName
          }
        });
      }

      // Payment processing failures
      if (
        message.includes('payment') &&
        (message.includes('failed') || message.includes('error') || message.includes('❌')) &&
        !message.includes('stripe')
      ) {
        alerts.push({
          alert_type: 'payment_failure',
          severity: 'high',
          environment,
          source: 'heroku_logs',
          title: 'Payment Processing Issue',
          message: rawMessage,
          log_entry: entry.raw,
          context: {
            dyno: entry.dyno,
            timestamp: entry.timestamp.toISOString(),
            app: appName
          }
        });
      }

      // Bad margin alerts are excluded - they're sent to support team via email, not DevOps alerts

      // Performance issues
      if (
        message.includes('slow') || message.includes('timeout') || message.includes('performance') ||
        message.includes('> 1000') || message.includes('degraded')
      ) {
        alerts.push({
          alert_type: 'performance',
          severity: 'medium',
          environment,
          source: 'heroku_logs',
          title: 'Performance Issue Detected',
          message: rawMessage,
          log_entry: entry.raw,
          context: {
            dyno: entry.dyno,
            timestamp: entry.timestamp.toISOString(),
            app: appName
          }
        });
      }

      // General errors (MEDIUM)
      // Note: Normal request logging has already been filtered out above
      // Only alert on actual errors, not normal info/debug logs
      const isInfoLevelLog = rawMessage.includes('"level":"info"') && 
                            (rawMessage.includes('"event":"request') || 
                             rawMessage.includes('"event":"request_'));
      
      if (
        !isInfoLevelLog &&
        !message.includes('[ROUTE REGISTRATION]') &&
        !message.includes('[CRITICAL DEBUG]') &&
        !message.includes('Registering') && // Exclude route registration messages
        (message.includes('error') || message.includes('exception') ||
        message.includes('failed') || message.includes('❌')) &&
        !alerts.some(a => a.log_entry === entry.raw)
      ) {
        // Only add if we haven't already categorized it
        alerts.push({
          alert_type: 'error',
          severity: 'medium',
          environment,
          source: 'heroku_logs',
          title: 'Error Detected',
          message: rawMessage,
          log_entry: entry.raw,
          context: {
            dyno: entry.dyno,
            timestamp: entry.timestamp.toISOString(),
            app: appName
          }
        });
      }
    }

    return alerts;
  }

  /**
   * Store alerts in database
   */
  async storeAlerts(alerts) {
    const storedAlerts = [];

    for (const alert of alerts) {
      try {
        // Check if this alert already exists (to avoid duplicates)
        const existingCheck = await this.pool.query(
          `SELECT id FROM devops_alerts 
           WHERE alert_type = $1 
           AND severity = $2 
           AND environment = $3 
           AND message = $4 
           AND status = 'open'
           AND created_at > NOW() - INTERVAL '1 hour'`,
          [alert.alert_type, alert.severity, alert.environment, alert.message.substring(0, 500)]
        );

        if (existingCheck.rows.length > 0) {
          // Alert already exists and is still open, skip
          continue;
        }

        const result = await this.pool.query(
          `INSERT INTO devops_alerts 
           (alert_type, severity, environment, source, title, message, log_entry, context, status)
           VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
           RETURNING *`,
          [
            alert.alert_type,
            alert.severity,
            alert.environment,
            alert.source,
            alert.title,
            alert.message,
            alert.log_entry || null,
            JSON.stringify(alert.context || {}),
            'open'
          ]
        );

        storedAlerts.push(result.rows[0]);
      } catch (error) {
        logger.error({ error: error.message }, 'Error storing alert:');
      }
    }

    return storedAlerts;
  }

  /**
   * Check if alert should trigger Slack notification based on rules
   */
  async shouldNotify(alert) {
    try {
      const rules = await this.pool.query(
        `SELECT * FROM devops_alert_rules 
         WHERE enabled = TRUE 
         AND slack_notify = TRUE
         AND alert_type = $1
         AND severity = $2
         AND (environment IS NULL OR environment = $3)
         AND (source IS NULL OR source = $4)`,
        [alert.alert_type, alert.severity, alert.environment, alert.source]
      );

      return rules.rows.length > 0;
    } catch (error) {
      logger.error({ error: error.message }, 'Error checking alert rules:');
      // Default to notifying if we can't check rules
      return true;
    }
  }

  /**
   * Send Slack notification for alerts
   */
  async sendSlackNotifications(alerts) {
    for (const alert of alerts) {
      try {
        // Check if we should notify based on rules
        const shouldNotify = await this.shouldNotify(alert);

        if (!shouldNotify) {
          continue;
        }

        // Check if we've already sent notification for this alert
        if (alert.slack_notification_sent) {
          continue;
        }

        // Send to Slack
        await this.slackAlerts.sendProductionError({
          type: alert.alert_type,
          severity: alert.severity,
          message: alert.message
        }, {
          environment: alert.environment,
          route: alert.context?.dyno || 'unknown',
          alertId: alert.id
        });

        // Mark as sent
        await this.pool.query(
          `UPDATE devops_alerts 
           SET slack_notification_sent = TRUE, 
               slack_notification_sent_at = CURRENT_TIMESTAMP 
           WHERE id = $1`,
          [alert.id]
        );
      } catch (error) {
        logger.error({ error: error.message }, 'Error sending Slack notification:');
      }
    }
  }

  /**
   * Monitor all configured Heroku apps
   */
  async monitorAllApps() {
    logger.info('🔍 Starting Heroku log monitoring...');
    const allAlerts = [];

    for (const [key, config] of Object.entries(APP_CONFIGS)) {
      try {
        logger.info(`📊 Monitoring ${config.displayName} (${config.appName})...`);
        
        // Fetch recent logs
        const logContent = await this.fetchLogs(config.appName, 200);
        
        // Parse logs
        const logEntries = this.parseLogLines(logContent);
        
        // Detect alerts
        const alerts = this.detectAlerts(logEntries, key, config.appName);
        
        if (alerts.length > 0) {
          logger.info(`   ⚠️  Found ${alerts.length} alerts in ${config.displayName}`);
          allAlerts.push(...alerts);
        } else {
          logger.info(`   ✅ No alerts found in ${config.displayName}`);
        }

        // Store last check time
        this.lastCheckTimes[key] = new Date();

      } catch (error) {
        logger.error({ error: error.message }, `❌ Error monitoring ${config.displayName}:`);
        
        // Create alert for monitoring failure
        allAlerts.push({
          alert_type: 'error',
          severity: 'high',
          environment: key,
          source: 'monitoring_system',
          title: 'Log Monitoring Failed',
          message: `Failed to fetch or parse logs from ${config.appName}: ${error.message}`,
          context: {
            app: config.appName,
            error: error.message
          }
        });
      }
    }

    // Store all alerts
    if (allAlerts.length > 0) {
      const storedAlerts = await this.storeAlerts(allAlerts);
      logger.info(`💾 Stored ${storedAlerts.length} new alerts in database`);

      // Send Slack notifications
      await this.sendSlackNotifications(storedAlerts);
    }

    logger.info(`✅ Log monitoring complete. Found ${allAlerts.length} total alerts.`);
    
    return {
      totalAlerts: allAlerts.length,
      storedAlerts: allAlerts.filter((a, i) => allAlerts.indexOf(a) === i).length
    };
  }
}

module.exports = HerokuLogMonitor;

