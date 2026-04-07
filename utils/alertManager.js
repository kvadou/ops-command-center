const { logger } = require('./logger');
const { getInstance: getEmailSender } = require('./brevo-email-sender');

/**
 * Send critical error alert email
 * @param {string} errorType - Type of error (e.g., 'client_creation_failed', 'auto_charge_update_failed')
 * @param {Object} errorData - Error details and context
 * @param {string} submissionId - Submission ID if applicable
 * @param {string} clientId - Client ID if applicable
 */
const sendCriticalErrorAlert = async (errorType, errorData, submissionId = null, clientId = null) => {
  try {
    const timestamp = new Date().toISOString();
    const errorId = `ERR-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
    
    // Prepare error details for email
    const errorDetails = {
      errorId,
      timestamp,
      errorType,
      submissionId,
      clientId,
      message: errorData.message || 'Unknown error',
      stack: errorData.stack || null,
      context: errorData.context || {},
      retryAttempts: errorData.retryAttempts || 0,
      maxRetries: errorData.maxRetries || 0
    };

    // Generate email content
    const emailContent = generateErrorEmailContent(errorDetails);
    
    const mailOptions = {
      from: '"Acme Operations System" <support@acmeops.com>',
      to: 'eve@one1.digital, doug@acmeops.com, tech@acmeops.com',
      subject: `🚨 CRITICAL ERROR: ${errorType} - ${errorId}`,
      html: emailContent,
      text: generateErrorEmailText(errorDetails)
    };

    const emailSender = getEmailSender();
    if (emailSender) {
      await emailSender.sendEmail({
        to: mailOptions.to,
        subject: mailOptions.subject,
        html: mailOptions.html,
        text: mailOptions.text,
        tags: ['critical-error-alert'],
      });
    } else {
      logger.warn(`⚠️ Brevo email sender not available — critical error alert not sent for ${errorType}`);
    }
    logger.info(`✅ Critical error alert sent for ${errorType} (${errorId})`);
    
    // Log to database
    await logErrorToDatabase(errorDetails);
    
    // Also create DevOps alert for submission-related failures
    if (submissionId || errorType.includes('submission') || errorType.includes('payment') || errorType.includes('client_creation')) {
      try {
        const { Pool } = require('pg');

        // Handle local development database connection
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

        const environment = process.env.NODE_ENV === 'production' ? 
          (process.env.APP_NAME?.includes('westside') ? 'westside' : 
           process.env.APP_NAME?.includes('eastside') ? 'eastside' : 'main') : 'development';

        // Determine severity and alert type based on error type
        let severity = 'high';
        let alertType = 'error';
        let failureStep = 'unknown';

        if (errorType.includes('payment') || errorType.includes('credit_request')) {
          severity = 'critical';
          alertType = 'payment_failure';
          failureStep = 'payment';
        } else if (errorType.includes('client_creation')) {
          severity = 'critical';
          alertType = 'error';
          failureStep = 'submission';
        } else if (errorType.includes('submission')) {
          severity = 'high';
          alertType = 'error';
          failureStep = 'submission';
        }

        await pool.query(`
          INSERT INTO devops_alerts
            (environment, alert_type, severity, title, message, context, source, status)
          VALUES ($1, $2, $3, $4, $5, $6, 'application', 'open')
        `, [
          environment,
          alertType,
          severity,
          `${errorType.replace(/_/g, ' ').replace(/\b\w/g, l => l.toUpperCase())}`,
          errorData.message || 'Unknown error',
          JSON.stringify({
            errorId,
            errorType,
            submissionId,
            clientId,
            step: failureStep,
            ...errorData.context,
            stack: errorData.stack
          })
        ]);

        await pool.end();
        logger.info(`✅ Created DevOps alert for ${errorType}`);
      } catch (devopsError) {
        logger.error({ error: devopsError.message }, `⚠️ Failed to create DevOps alert for ${errorType}:`);
        // Don't fail the whole operation if DevOps alert creation fails
      }
    }
    
  } catch (emailError) {
    logger.error({ error: emailError.message }, '❌ Failed to send critical error alert:');
    // Fallback: log to console with high visibility
    logger.error('🚨🚨🚨 CRITICAL ERROR ALERT FAILED 🚨🚨🚨');
    logger.error({ data: errorType }, 'Error Type:');
    logger.error({ data: errorData }, 'Error Data:');
    logger.error({ data: submissionId }, 'Submission ID:');
    logger.error({ data: clientId }, 'Client ID:');
    logger.error('🚨🚨🚨 END CRITICAL ERROR ALERT 🚨🚨🚨');
  }
};

/**
 * Send system health alert
 * @param {string} alertType - Type of alert (e.g., 'high_error_rate', 'duplicate_clients_detected')
 * @param {Object} alertData - Alert details
 */
const sendSystemHealthAlert = async (alertType, alertData) => {
  try {
    const timestamp = new Date().toISOString();
    const alertId = `ALERT-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
    
    const alertDetails = {
      alertId,
      timestamp,
      alertType,
      data: alertData
    };

    const emailContent = generateHealthAlertEmailContent(alertDetails);
    
    const mailOptions = {
      from: '"Acme Operations System" <support@acmeops.com>',
      to: 'eve@one1.digital, doug@acmeops.com, tech@acmeops.com',
      subject: `⚠️ SYSTEM ALERT: ${alertType} - ${alertId}`,
      html: emailContent,
      text: generateHealthAlertEmailText(alertDetails)
    };

    const emailSender = getEmailSender();
    if (emailSender) {
      await emailSender.sendEmail({
        to: mailOptions.to,
        subject: mailOptions.subject,
        html: mailOptions.html,
        text: mailOptions.text,
        tags: ['system-health-alert'],
      });
    } else {
      logger.warn(`⚠️ Brevo email sender not available — system health alert not sent for ${alertType}`);
    }
    logger.info(`✅ System health alert sent for ${alertType} (${alertId})`);
    
  } catch (emailError) {
    logger.error({ error: emailError.message }, '❌ Failed to send system health alert:');
  }
};

/**
 * Send daily error summary
 * @param {Array} errors - Array of errors from the day
 */
const sendDailyErrorSummary = async (errors) => {
  try {
    const timestamp = new Date().toISOString();
    const summaryId = `SUMMARY-${Date.now()}`;
    
    const summaryData = {
      summaryId,
      timestamp,
      totalErrors: errors.length,
      errorsByType: errors.reduce((acc, error) => {
        acc[error.error_type] = (acc[error.error_type] || 0) + 1;
        return acc;
      }, {}),
      errors: errors.slice(0, 20) // Limit to first 20 errors
    };

    const emailContent = generateDailySummaryEmailContent(summaryData);
    
    const mailOptions = {
      from: '"Acme Operations System" <support@acmeops.com>',
      to: 'eve@one1.digital, doug@acmeops.com, tech@acmeops.com',
      subject: `📊 Daily Error Summary - ${errors.length} errors - ${summaryId}`,
      html: emailContent,
      text: generateDailySummaryEmailText(summaryData)
    };

    const emailSender = getEmailSender();
    if (emailSender) {
      await emailSender.sendEmail({
        to: mailOptions.to,
        subject: mailOptions.subject,
        html: mailOptions.html,
        text: mailOptions.text,
        tags: ['daily-error-summary'],
      });
    } else {
      logger.warn('⚠️ Brevo email sender not available — daily error summary not sent');
    }
    logger.info(`✅ Daily error summary sent (${errors.length} errors)`);
    
  } catch (emailError) {
    logger.error({ error: emailError.message }, '❌ Failed to send daily error summary:');
  }
};

/**
 * Generate HTML email content for critical errors
 */
const generateErrorEmailContent = (errorDetails) => {
  return `
    <!DOCTYPE html>
    <html>
    <head>
      <meta charset="utf-8">
      <title>Critical Error Alert</title>
      <style>
        body { font-family: Arial, sans-serif; line-height: 1.6; color: #333; background-color: #f9f9f9; padding: 20px; }
        .container { max-width: 800px; margin: 0 auto; background: #fff; padding: 20px; border-radius: 8px; box-shadow: 0 2px 4px rgba(0,0,0,0.1); }
        .header { background-color: #dc3545; color: white; padding: 15px; text-align: center; border-radius: 6px; margin-bottom: 20px; }
        .error-details { background-color: #f8f9fa; padding: 15px; border-radius: 6px; margin: 15px 0; }
        .error-details h3 { margin-top: 0; color: #dc3545; }
        .error-details pre { background-color: #e9ecef; padding: 10px; border-radius: 4px; overflow-x: auto; font-size: 12px; }
        .context-table { width: 100%; border-collapse: collapse; margin: 15px 0; }
        .context-table th, .context-table td { padding: 10px; border: 1px solid #ddd; text-align: left; }
        .context-table th { background-color: #f8f9fa; font-weight: bold; }
        .footer { background-color: #6a469d; color: white; text-align: center; padding: 10px; border-radius: 6px; margin-top: 20px; }
        .urgent { color: #dc3545; font-weight: bold; }
        .info { color: #17a2b8; }
      </style>
    </head>
    <body>
      <div class="container">
        <div class="header">
          <h1>🚨 CRITICAL ERROR ALERT</h1>
          <p>Acme Operations System</p>
        </div>
        
        <div class="error-details">
          <h3>Error Information</h3>
          <table class="context-table">
            <tr><th>Error ID</th><td>${errorDetails.errorId}</td></tr>
            <tr><th>Timestamp</th><td>${errorDetails.timestamp}</td></tr>
            <tr><th>Error Type</th><td class="urgent">${errorDetails.errorType}</td></tr>
            <tr><th>Submission ID</th><td>${errorDetails.submissionId || 'N/A'}</td></tr>
            <tr><th>Client ID</th><td>${errorDetails.clientId || 'N/A'}</td></tr>
            <tr><th>Retry Attempts</th><td>${errorDetails.retryAttempts}/${errorDetails.maxRetries}</td></tr>
          </table>
        </div>
        
        <div class="error-details">
          <h3>Error Message</h3>
          <p class="urgent">${errorDetails.message}</p>
        </div>
        
        ${errorDetails.context && Object.keys(errorDetails.context).length > 0 ? `
        <div class="error-details">
          <h3>Context Information</h3>
          <pre>${JSON.stringify(errorDetails.context, null, 2)}</pre>
        </div>
        ` : ''}
        
        ${errorDetails.stack ? `
        <div class="error-details">
          <h3>Stack Trace</h3>
          <pre>${errorDetails.stack}</pre>
        </div>
        ` : ''}
        
        <div class="error-details">
          <h3>Action Required</h3>
          <p class="urgent">This error requires immediate attention. Please:</p>
          <ul>
            <li>Check the system logs for additional context</li>
            <li>Verify TutorCruncher API status</li>
            <li>Review the error details above</li>
            <li>Take appropriate corrective action</li>
          </ul>
        </div>
        
        <div class="footer">
          <p>🔧 Acme Operations System - Automated Error Alert</p>
          <p>Error ID: ${errorDetails.errorId}</p>
        </div>
      </div>
    </body>
    </html>
  `;
};

/**
 * Generate text email content for critical errors
 */
const generateErrorEmailText = (errorDetails) => {
  return `
CRITICAL ERROR ALERT - Acme Operations System

Error ID: ${errorDetails.errorId}
Timestamp: ${errorDetails.timestamp}
Error Type: ${errorDetails.errorType}
Submission ID: ${errorDetails.submissionId || 'N/A'}
Client ID: ${errorDetails.clientId || 'N/A'}
Retry Attempts: ${errorDetails.retryAttempts}/${errorDetails.maxRetries}

Error Message: ${errorDetails.message}

${errorDetails.context && Object.keys(errorDetails.context).length > 0 ? `
Context Information:
${JSON.stringify(errorDetails.context, null, 2)}
` : ''}

${errorDetails.stack ? `
Stack Trace:
${errorDetails.stack}
` : ''}

Action Required:
This error requires immediate attention. Please check the system logs, verify TutorCruncher API status, and take appropriate corrective action.

---
Acme Operations System - Automated Error Alert
Error ID: ${errorDetails.errorId}
  `;
};

/**
 * Generate HTML email content for system health alerts
 */
const generateHealthAlertEmailContent = (alertDetails) => {
  return `
    <!DOCTYPE html>
    <html>
    <head>
      <meta charset="utf-8">
      <title>System Health Alert</title>
      <style>
        body { font-family: Arial, sans-serif; line-height: 1.6; color: #333; background-color: #f9f9f9; padding: 20px; }
        .container { max-width: 800px; margin: 0 auto; background: #fff; padding: 20px; border-radius: 8px; box-shadow: 0 2px 4px rgba(0,0,0,0.1); }
        .header { background-color: #ffc107; color: #212529; padding: 15px; text-align: center; border-radius: 6px; margin-bottom: 20px; }
        .alert-details { background-color: #f8f9fa; padding: 15px; border-radius: 6px; margin: 15px 0; }
        .alert-details h3 { margin-top: 0; color: #ffc107; }
        .context-table { width: 100%; border-collapse: collapse; margin: 15px 0; }
        .context-table th, .context-table td { padding: 10px; border: 1px solid #ddd; text-align: left; }
        .context-table th { background-color: #f8f9fa; font-weight: bold; }
        .footer { background-color: #6a469d; color: white; text-align: center; padding: 10px; border-radius: 6px; margin-top: 20px; }
        .warning { color: #ffc107; font-weight: bold; }
      </style>
    </head>
    <body>
      <div class="container">
        <div class="header">
          <h1>⚠️ SYSTEM HEALTH ALERT</h1>
          <p>Acme Operations System</p>
        </div>
        
        <div class="alert-details">
          <h3>Alert Information</h3>
          <table class="context-table">
            <tr><th>Alert ID</th><td>${alertDetails.alertId}</td></tr>
            <tr><th>Timestamp</th><td>${alertDetails.timestamp}</td></tr>
            <tr><th>Alert Type</th><td class="warning">${alertDetails.alertType}</td></tr>
          </table>
        </div>
        
        <div class="alert-details">
          <h3>Alert Data</h3>
          <pre>${JSON.stringify(alertDetails.data, null, 2)}</pre>
        </div>
        
        <div class="footer">
          <p>🔧 Acme Operations System - Automated Health Alert</p>
          <p>Alert ID: ${alertDetails.alertId}</p>
        </div>
      </div>
    </body>
    </html>
  `;
};

/**
 * Generate text email content for system health alerts
 */
const generateHealthAlertEmailText = (alertDetails) => {
  return `
SYSTEM HEALTH ALERT - Acme Operations System

Alert ID: ${alertDetails.alertId}
Timestamp: ${alertDetails.timestamp}
Alert Type: ${alertDetails.alertType}

Alert Data:
${JSON.stringify(alertDetails.data, null, 2)}

---
Acme Operations System - Automated Health Alert
Alert ID: ${alertDetails.alertId}
  `;
};

/**
 * Generate HTML email content for daily error summary
 */
const generateDailySummaryEmailContent = (summaryData) => {
  const errorTypeRows = Object.entries(summaryData.errorsByType)
    .map(([type, count]) => `<tr><td>${type}</td><td>${count}</td></tr>`)
    .join('');

  const errorRows = summaryData.errors
    .map(error => `
      <tr>
        <td>${error.id}</td>
        <td>${error.error_type}</td>
        <td>${error.client_id || 'N/A'}</td>
        <td>${error.submission_id || 'N/A'}</td>
        <td>${error.created_at}</td>
      </tr>
    `)
    .join('');

  return `
    <!DOCTYPE html>
    <html>
    <head>
      <meta charset="utf-8">
      <title>Daily Error Summary</title>
      <style>
        body { font-family: Arial, sans-serif; line-height: 1.6; color: #333; background-color: #f9f9f9; padding: 20px; }
        .container { max-width: 1000px; margin: 0 auto; background: #fff; padding: 20px; border-radius: 8px; box-shadow: 0 2px 4px rgba(0,0,0,0.1); }
        .header { background-color: #17a2b8; color: white; padding: 15px; text-align: center; border-radius: 6px; margin-bottom: 20px; }
        .summary-details { background-color: #f8f9fa; padding: 15px; border-radius: 6px; margin: 15px 0; }
        .summary-details h3 { margin-top: 0; color: #17a2b8; }
        .summary-table { width: 100%; border-collapse: collapse; margin: 15px 0; }
        .summary-table th, .summary-table td { padding: 10px; border: 1px solid #ddd; text-align: left; }
        .summary-table th { background-color: #f8f9fa; font-weight: bold; }
        .footer { background-color: #6a469d; color: white; text-align: center; padding: 10px; border-radius: 6px; margin-top: 20px; }
        .info { color: #17a2b8; font-weight: bold; }
      </style>
    </head>
    <body>
      <div class="container">
        <div class="header">
          <h1>📊 Daily Error Summary</h1>
          <p>Acme Operations System - ${summaryData.totalErrors} Total Errors</p>
        </div>
        
        <div class="summary-details">
          <h3>Summary Statistics</h3>
          <table class="summary-table">
            <tr><th>Total Errors</th><td class="info">${summaryData.totalErrors}</td></tr>
            <tr><th>Summary ID</th><td>${summaryData.summaryId}</td></tr>
            <tr><th>Generated At</th><td>${summaryData.timestamp}</td></tr>
          </table>
        </div>
        
        <div class="summary-details">
          <h3>Errors by Type</h3>
          <table class="summary-table">
            <tr><th>Error Type</th><th>Count</th></tr>
            ${errorTypeRows}
          </table>
        </div>
        
        <div class="summary-details">
          <h3>Recent Errors (Last 20)</h3>
          <table class="summary-table">
            <tr>
              <th>ID</th>
              <th>Type</th>
              <th>Client ID</th>
              <th>Submission ID</th>
              <th>Created At</th>
            </tr>
            ${errorRows}
          </table>
        </div>
        
        <div class="footer">
          <p>🔧 Acme Operations System - Daily Error Summary</p>
          <p>Summary ID: ${summaryData.summaryId}</p>
        </div>
      </div>
    </body>
    </html>
  `;
};

/**
 * Generate text email content for daily error summary
 */
const generateDailySummaryEmailText = (summaryData) => {
  const errorTypeRows = Object.entries(summaryData.errorsByType)
    .map(([type, count]) => `${type}: ${count}`)
    .join('\n');

  const errorRows = summaryData.errors
    .map(error => `${error.id} | ${error.error_type} | ${error.client_id || 'N/A'} | ${error.submission_id || 'N/A'} | ${error.created_at}`)
    .join('\n');

  return `
DAILY ERROR SUMMARY - Acme Operations System

Total Errors: ${summaryData.totalErrors}
Summary ID: ${summaryData.summaryId}
Generated At: ${summaryData.timestamp}

Errors by Type:
${errorTypeRows}

Recent Errors (Last 20):
ID | Type | Client ID | Submission ID | Created At
${errorRows}

---
Acme Operations System - Daily Error Summary
Summary ID: ${summaryData.summaryId}
  `;
};

/**
 * Log error to database
 */
const logErrorToDatabase = async (errorDetails) => {
  try {
    const { pool } = global;
    await pool.query(`
      INSERT INTO error_logs (error_type, client_id, submission_id, error_message, error_data, created_at)
      VALUES ($1, $2, $3, $4, $5, NOW())
    `, [
      errorDetails.errorType,
      errorDetails.clientId,
      errorDetails.submissionId,
      errorDetails.message,
      JSON.stringify(errorDetails)
    ]);
  } catch (dbError) {
    logger.error({ error: dbError.message }, 'Failed to log error to database:');
  }
};

module.exports = {
  sendCriticalErrorAlert,
  sendSystemHealthAlert,
  sendDailyErrorSummary
};
