const express = require('express');
const crypto = require('crypto');
const router = express.Router();
const { buildDeps } = require('../config/deps');
const Handlebars = require('handlebars');
const { markdownToHtml, stripMarkdown } = require('../utils/formatting');
const { getAllColumns } = require('../utils/schema-cache');
const { logger } = require('../utils/logger');

/**
 * Get or create an unsubscribe token for an email address.
 * Tokens are deterministic (SHA-256 of email) so the same email always gets the same token.
 */
function getUnsubscribeToken(email) {
  return crypto.createHash('sha256').update(email.toLowerCase().trim()).digest('base64url').slice(0, 32);
}

/**
 * Build the unsubscribe footer HTML to append after template content.
 */
function buildUnsubscribeFooter(unsubscribeUrl) {
  return `
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="margin-top: 0;">
      <tr>
        <td align="center" style="padding: 20px 20px 30px 20px;">
          <p style="margin: 0; font-size: 12px; line-height: 18px; color: #999999; font-family: Arial, sans-serif;">
            Don't want to receive lesson reports?
            <a href="${unsubscribeUrl}" style="color: #999999; text-decoration: underline;">Unsubscribe</a>
          </p>
        </td>
      </tr>
    </table>`;
}

// Function to decode HTML entities in text
function decodeHtmlEntities(text) {
  if (!text || typeof text !== 'string') return text;
  
  return text
    .replace(/&#x27;/g, "'")
    .replace(/&#39;/g, "'")
    .replace(/&quot;/g, '"')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&#x2F;/g, '/')
    .replace(/&#x60;/g, '`')
    .replace(/&#x3D;/g, '=')
    .replace(/&#x2B;/g, '+')
    .replace(/&#x2D;/g, '-')
    .replace(/&#x5F;/g, '_')
    .replace(/&#x2E;/g, '.')
    .replace(/&#x3A;/g, ':')
    .replace(/&#x3B;/g, ';')
    .replace(/&#x21;/g, '!')
    .replace(/&#x3F;/g, '?')
    .replace(/&#x28;/g, '(')
    .replace(/&#x29;/g, ')')
    .replace(/&#x5B;/g, '[')
    .replace(/&#x5D;/g, ']')
    .replace(/&#x7B;/g, '{')
    .replace(/&#x7D;/g, '}')
    .replace(/&#x24;/g, '$')
    .replace(/&#x25;/g, '%')
    .replace(/&#x40;/g, '@')
    .replace(/&#x23;/g, '#')
    .replace(/&#x5E;/g, '^')
    .replace(/&#x7E;/g, '~')
    .replace(/&#x7C;/g, '|')
    .replace(/&#x5C;/g, '\\')
    .replace(/&#x2C;/g, ',');
}

// Get the pool and transporter from the deps
const { pool, transporter } = buildDeps();

// Import Brevo API email sender
const { getInstance: getBrevoEmailSender } = require('../utils/brevo-email-sender');
const { asyncHandler } = require('../middleware/error-handler');

// GET /api/client-reports - Fetch all client reports
router.get('/', asyncHandler(async (req, res) => {
  try {
    // Check which columns exist in the client_reports table (cached)
    const columnSet = await getAllColumns(pool, 'client_reports');
    const availableColumns = Array.from(columnSet);
    
    // Build ORDER BY clause based on available columns
    let orderByClause = 'ORDER BY ';
    const orderByParts = [];
    
    // Try to order by email_delivered_at if it exists
    if (availableColumns.includes('email_delivered_at')) {
      orderByParts.push('email_delivered_at DESC NULLS LAST');
    }
    
    // Try to order by sent_at if it exists
    if (availableColumns.includes('sent_at')) {
      orderByParts.push('sent_at DESC NULLS LAST');
    }
    
    // Fallback to date_sent (should always exist)
    if (availableColumns.includes('date_sent')) {
      orderByParts.push('date_sent DESC NULLS LAST');
    }
    
    // If no ordering columns exist, just order by id
    if (orderByParts.length === 0) {
      orderByParts.push('id DESC');
    }
    
    orderByClause += orderByParts.join(', ');
    
    // Join with appointments + services to get the service name for tooltip display
    const query = `
      SELECT cr.*, s.name AS service_name
      FROM client_reports cr
      LEFT JOIN appointments a ON cr.appointment_id = a.appointment_id
      LEFT JOIN services s ON a.service_id = s.service_id
      ${orderByClause}
    `;

    const { rows } = await pool.query(query);
    res.json(rows);
  } catch (err) {
    logger.error({ err: err }, 'Error fetching client reports:');
    res.status(500).json({
      error: 'Failed to fetch reports',
      details: err.message,
      stack: process.env.NODE_ENV === 'development' ? err.stack : undefined
    });
  }
}));

// POST /api/client-reports - Create new client report
router.post('/', asyncHandler(async (req, res) => {
  const {
    dateSent,
    tutorName,
    clientName,
    studentName,
    clientEmail,
    templateName,
    tutorFeedback,
    status = 'pending'
  } = req.body;
  
  try {
    const { rows } = await pool.query(`INSERT INTO client_reports
         (date_sent, tutor_name, client_name,
          student_name, client_email, template_name,
          tutor_feedback, status)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8)
       RETURNING *`, [dateSent, tutorName, clientName, studentName, clientEmail, templateName, tutorFeedback, status]);
    res.status(201).json(rows[0]);
  } catch (err) {
    logger.error({ err: err }, 'Failed to create report:');
    res.status(500).json({
      error: 'Failed to create report'
    });
  }
}));

// GET /api/client-reports/:id/preview - Preview client report
router.get('/:id/preview', asyncHandler(async (req, res) => {
  const { id } = req.params;
  try {
    // Use LEFT JOIN so we can still show previews even if template is missing
    const { rows } = await pool.query(`
      SELECT
        tpl.html           AS "rawHtml",
        cr.client_name     AS "clientName",
        cr.student_name    AS "studentName",
        cr.tutor_name      AS "tutorName",
        cr.tutor_feedback  AS "feedback",
        cr.template_name   AS "templateName"
      FROM client_reports cr
      LEFT JOIN templates tpl
        ON cr.template_name = tpl.template_name
      WHERE cr.id = $1
      `, [id]);
    if (!rows.length) {
      return res.status(404).send('No report found');
    }
    const { rawHtml, clientName, studentName, tutorName, feedback, templateName } = rows[0];

    // If template HTML exists, use it; otherwise render a fallback preview
    if (rawHtml) {
      const decodedFeedback = decodeHtmlEntities(feedback);
      // Add tutor signature after feedback (first name only), but only when there are actual notes
      // Templates use {{#if feedback}} to hide the notes section — passing empty string keeps it hidden
      const tutorFirstName = (tutorName || '').split(' ')[0];
      const hasNotes = decodedFeedback && decodedFeedback.trim().length > 0 && decodedFeedback.trim().toLowerCase() !== 'null';
      const feedbackWithSignature = (hasNotes && tutorFirstName)
        ? `${decodedFeedback}<p style="margin-top: 16px; margin-bottom: 0; font-style: italic; padding-left: 0;">- ${tutorFirstName}</p>`
        : (hasNotes ? decodedFeedback : '');
      const html = Handlebars.compile(rawHtml)({
        clientName,
        studentName,
        tutorName,
        feedback: feedbackWithSignature
      });
      res.send(html);
    } else {
      // Fallback preview when template doesn't exist in templates table
      const fallbackHtml = `
        <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 20px;">
          <div style="background: #fff3cd; border: 1px solid #ffc107; border-radius: 4px; padding: 12px; margin-bottom: 20px;">
            <strong>Note:</strong> Template "${templateName || 'Unknown'}" not found. Showing feedback only.
          </div>
          <h2 style="color: #333; margin-bottom: 10px;">Lesson Report</h2>
          <p style="margin-bottom: 5px;"><strong>Student:</strong> ${studentName || 'N/A'}</p>
          <p style="margin-bottom: 5px;"><strong>Client:</strong> ${clientName || 'N/A'}</p>
          <p style="margin-bottom: 15px;"><strong>Tutor:</strong> ${tutorName || 'N/A'}</p>
          <hr style="border: none; border-top: 1px solid #ddd; margin: 15px 0;">
          <h3 style="color: #333; margin-bottom: 10px;">Feedback</h3>
          <div style="white-space: pre-wrap; line-height: 1.6;">${decodeHtmlEntities(feedback) || 'No feedback provided.'}</div>
        </div>
      `;
      res.send(fallbackHtml);
    }
  } catch (err) {
    logger.error({ err: err }, 'Preview error:');
    res.status(500).send('Failed to render preview');
  }
}));

// DELETE /api/client-reports/bulk - Bulk delete multiple reports
router.delete('/bulk', asyncHandler(async (req, res) => {
  logger.info('🔥 BULK DELETE ENDPOINT CALLED!');
  const { ids } = req.body;
  
  if (!ids || !Array.isArray(ids) || ids.length === 0) {
    return res.status(400).json({ error: 'No report IDs provided' });
  }
  
  if (ids.length > 100) {
    return res.status(400).json({ error: 'Cannot delete more than 100 reports at once' });
  }
  
  try {
    logger.info({ data: ids }, '🗑️ Bulk deleting ${ids.length} reports:');
    
    // First, check that all reports exist and are not sent
    // Convert array to comma-separated string for IN clause
    const placeholders = ids.map((_, index) => `$${index + 1}`).join(',');
    const query = `SELECT id, status FROM client_reports WHERE id IN (${placeholders})`;
    
    logger.info({ data: query }, 'Query:');
    logger.info({ data: ids }, 'Parameters:');
    
    const { rows: existingReports } = await pool.query(query, ids);
    
    if (existingReports.length !== ids.length) {
      return res.status(400).json({ 
        error: 'Some reports not found',
        found: existingReports.length,
        requested: ids.length
      });
    }
    
    // Check if any are sent (cannot delete sent reports)
    const sentReports = existingReports.filter(report => report.status === 'sent');
    if (sentReports.length > 0) {
      return res.status(400).json({ 
        error: 'Cannot delete sent reports',
        sentReportIds: sentReports.map(r => r.id)
      });
    }
    
    // Delete all reports
    const deletePlaceholders = ids.map((_, index) => `$${index + 1}`).join(',');
    const deleteQuery = `DELETE FROM client_reports WHERE id IN (${deletePlaceholders})`;
    
    logger.info({ data: deleteQuery }, 'Delete Query:');
    
    const { rowCount } = await pool.query(deleteQuery, ids);
    
    logger.info('✅ Successfully deleted ${rowCount} reports');
    
    res.json({ 
      success: true, 
      deletedCount: rowCount,
      deletedIds: ids
    });
    
  } catch (err) {
    logger.error({ err: err, errorDetails: { code: err.code, detail: err.detail } }, 'Bulk delete error');
    res.status(500).json({ 
      error: 'Failed to delete reports',
      details: err.message 
    });
  }
}));

// DELETE /api/client-reports/:id - Delete client report
router.delete('/:id', asyncHandler(async (req, res) => {
  const { id } = req.params;
  try {
    const { rowCount } = await pool.query(`DELETE FROM client_reports WHERE id = $1`, [id]);
    if (!rowCount) return res.status(404).json({ error: 'Not found' });
    res.json({ success: true });
  } catch (err) {
    logger.error({ err }, 'Error deleting report');
    res.status(500).json({ error: 'Failed to delete report' });
  }
}));

// POST /api/client-reports/:id/send - Send client report
router.post('/:id/send', asyncHandler(async (req, res) => {
  const { id } = req.params;
  const { customEmail } = req.body; // Optional custom email for testing
  
  try {
    // Check if lesson reports sending is enabled
    let lessonReportsEnabled = true;
    try {
      const { rows: settingRows } = await pool.query(
        'SELECT setting_value FROM app_settings WHERE setting_key = $1',
        ['lesson_reports_enabled']
      );
      if (settingRows.length > 0 && settingRows[0].setting_value && typeof settingRows[0].setting_value.enabled === 'boolean') {
        lessonReportsEnabled = settingRows[0].setting_value.enabled;
      }
    } catch (settingError) {
      logger.error({ err: settingError }, 'Error checking lesson reports setting:');
      // Default to enabled if check fails
    }
    
    if (!lessonReportsEnabled) {
      return res.status(403).json({ 
        error: 'Lesson reports sending is currently disabled',
        message: 'Please enable lesson reports sending in the settings to send reports.'
      });
    }
    // First get the report details with appointment data and service labels
    const { rows: reportRows } = await pool.query(`
      SELECT 
        cr.*,
        a.start as appointment_start,
        s.labels as service_labels,
        s.location as service_location,
        ar.paying_client_id as client_id
      FROM client_reports cr
      LEFT JOIN appointments a ON cr.appointment_id = a.appointment_id
      LEFT JOIN services s ON a.service_id = s.service_id
      LEFT JOIN appointment_recipients ar ON a.appointment_id = ar.appointment_id
      WHERE cr.id = $1
    `, [id]);
    
    if (!reportRows.length) {
      return res.status(404).json({ error: 'Report not found' });
    }
    
    const report = reportRows[0];
    
    // Fetch client timezone from TutorCruncher API
    let clientTimezone = null;
    if (report.client_id) {
      try {
        logger.info('🔍 Fetching client timezone for client ID: ${report.client_id}');
        const { tutorCruncherAPI } = global;
        const clientResponse = await tutorCruncherAPI.get(`clients/${report.client_id}/`);
        const clientData = clientResponse.data;
        
        if (clientData && clientData.timezone) {
          clientTimezone = clientData.timezone;
          logger.info('✅ Found client timezone: ${clientTimezone} for client ${report.client_name}');
        } else {
          logger.info('ℹ️ No timezone found for client ${report.client_id} (${report.client_name}), will use service labels');
        }
      } catch (error) {
        logger.error({ error: error.response?.data || error.message }, '❌ Failed to fetch client timezone for ${report.client_id}:');
        logger.info('🔄 Will use service labels for timezone detection');
      }
    }
    
    // Use custom email if provided, otherwise use the original client email
    const emailToUse = customEmail || report.client_email;

    // Check if this email has unsubscribed from lesson reports
    const unsubToken = getUnsubscribeToken(emailToUse);
    const { rows: unsubRows } = await pool.query(
      'SELECT id FROM report_unsubscribes WHERE token = $1',
      [unsubToken]
    );
    if (unsubRows.length > 0) {
      logger.info({ email: emailToUse }, 'Skipping lesson report - recipient has unsubscribed');
      return res.status(400).json({
        error: 'Recipient has unsubscribed',
        message: `${emailToUse} has unsubscribed from lesson reports.`
      });
    }

    // Failsafe: Skip sending "Only Notes" template if there are no notes
    if (report.template_name === 'Only Notes') {
      const hasNotes = report.tutor_feedback && report.tutor_feedback.trim().length > 0;
      if (!hasNotes) {
        logger.info('🚫 Skipping "Only Notes" template - no notes provided for report ${id}');
        return res.status(400).json({ 
          error: 'Cannot send "Only Notes" template without notes',
          message: 'The "Only Notes" template requires tutor feedback/notes to be present.'
        });
      }
    }
    
    // Update the report status
    const { rows } = await pool.query(`
      UPDATE client_reports
      SET status = 'sent', date_sent = NOW()
      WHERE id = $1
      RETURNING *
    `, [id]);

    // Auto-track student progress for curriculum lessons
    try {
      if (report.template_name && report.template_name.startsWith('Chess Module')) {
        await pool.query(`
          INSERT INTO student_progress (recipient_id, curriculum_lesson_id, completed_at, appointment_id, client_report_id, tutor_name)
          SELECT
            ar.recipient_id,
            cl.id,
            COALESCE(a.start, NOW()),
            $1,
            $2,
            $3
          FROM curriculum_lessons cl
          JOIN appointment_recipients ar ON ar.appointment_id = $1
          LEFT JOIN appointments a ON a.appointment_id = $1
          WHERE cl.template_name = $4
          ON CONFLICT (recipient_id, curriculum_lesson_id) DO NOTHING
        `, [report.appointment_id, id, report.tutor_name, report.template_name]);
      }
    } catch (progressError) {
      // Don't fail the send if progress tracking fails - log and continue
      logger.error({ err: progressError, reportId: id }, 'Failed to auto-track student progress');
    }

    // Declare emailSubject and sentEmails outside try block so they're accessible in the response
    let emailSubject = 'Acme Operations Lesson Report'; // Default fallback
    const sentEmails = []; // Track all emails that were sent
    
    // Send the actual email using Brevo
    try {
      // Get the template HTML
      const { rows: templateRows } = await pool.query(
        'SELECT html FROM templates WHERE template_name = $1',
        [report.template_name]
      );
      
      if (templateRows.length === 0) {
        throw new Error(`Template not found: ${report.template_name}`);
      }
      
      // Compile the template with data
      const template = Handlebars.compile(templateRows[0].html);
      // Decode HTML entities and convert markdown to HTML for feedback
      let decodedFeedback = decodeHtmlEntities(report.tutor_feedback || '');
      // Normalize literal <br> tags to line breaks (will be converted to HTML <br> by markdownToHtml)
      decodedFeedback = decodedFeedback.replace(/<br\s*\/?>/gi, '\n');
      const feedbackHtml = markdownToHtml(decodedFeedback);
      // Add tutor signature after feedback (first name only)
      const tutorFirstName = (report.tutor_name || '').split(' ')[0];
      const feedbackWithSignature = tutorFirstName
        ? `${feedbackHtml}<p style="margin-top: 16px; margin-bottom: 0; font-style: italic; padding-left: 0;">- ${tutorFirstName}</p>`
        : feedbackHtml;
      let htmlContent = template({
        clientName: report.client_name,
        studentName: report.student_name,
        tutorName: report.tutor_name,
        feedback: feedbackWithSignature
      });

      // Append unsubscribe footer
      const baseUrl = `${req.protocol}://${req.get('host')}`;
      const unsubscribeUrl = `${baseUrl}/api/client-reports/unsubscribe/${unsubToken}?email=${encodeURIComponent(emailToUse)}`;
      // Insert before closing </body> if present, otherwise append
      if (htmlContent.includes('</body>')) {
        htmlContent = htmlContent.replace('</body>', `${buildUnsubscribeFooter(unsubscribeUrl)}</body>`);
      } else {
        htmlContent += buildUnsubscribeFooter(unsubscribeUrl);
      }

      // Format the email subject with appointment date/time
      if (report.appointment_start) {
        try {
          // Get timezone using client timezone, service labels and location
          const { getTimezoneForService } = require('../utils/timezone-mapping');
          const timezone = getTimezoneForService(clientTimezone, report.service_labels, report.service_location);
          
          // Parse the appointment start time and format it
          const appointmentDate = new Date(report.appointment_start);
          const options = {
            timeZone: timezone,
            month: 'numeric',
            day: 'numeric',
            year: '2-digit',
            hour: 'numeric',
            minute: '2-digit',
            hour12: true
          };
          const formattedDateTime = appointmentDate.toLocaleString('en-US', options);
          emailSubject = `Acme Operations Lesson Report - ${formattedDateTime}`;
        } catch (dateError) {
          logger.error({ err: dateError }, 'Error formatting appointment date:');
          // Keep the default subject if date formatting fails
        }
      } else {
        // Fallback to current date/time when no appointment data is available
        try {
          const { getTimezoneForService } = require('../utils/timezone-mapping');
          const timezone = getTimezoneForService(clientTimezone, report.service_labels, report.service_location);
          
          const currentDate = new Date();
          const options = {
            timeZone: timezone,
            month: 'numeric',
            day: 'numeric',
            year: '2-digit',
            hour: 'numeric',
            minute: '2-digit',
            hour12: true
          };
          const formattedDateTime = currentDate.toLocaleString('en-US', options);
          emailSubject = `Acme Operations Lesson Report - ${formattedDateTime}`;
        } catch (dateError) {
          logger.error({ err: dateError }, 'Error formatting current date:');
          // Keep the default subject if date formatting fails
        }
      }
      
      // Determine location for email sender
      const { getCurrentEnvironment } = require('../config/environments');
      const envConfig = getCurrentEnvironment();
      const location = envConfig.name; // 'eastside', 'westside', 'production', etc.

      const feedbackText = report.tutor_feedback ? stripMarkdown(decodeHtmlEntities(report.tutor_feedback)) : 'No feedback provided';
      const brevoEmailSender = getBrevoEmailSender();
      
      // Helper function to send an email
      const sendEmailToRecipient = async (email, studentName, emailType) => {
        if (!email || !email.trim()) {
          logger.info('ℹ️ No email provided for ${studentName || \'recipient\'}, skipping');
          return { success: false, error: 'No email provided' };
        }
        
        const emailData = {
          to: email,
          subject: emailSubject,
          html: htmlContent,
          text: `Lesson Report for ${report.student_name}\n\nTutor: ${report.tutor_name}\nFeedback: ${feedbackText}`,
          location: location
        };
        
        try {
          const result = brevoEmailSender ? await brevoEmailSender.sendEmail(emailData) : { success: false, error: 'Brevo email sender not available' };
          
          if (result.success) {
            logger.info('📧 Email sent successfully via Brevo API to ${emailType}: ${email} (${studentName || \'N/A\'}) with message ID: ${result.messageId}');
            sentEmails.push({
              email: email,
              studentName: studentName || report.student_name,
              type: emailType,
              success: true,
              messageId: result.messageId
            });
            return { success: true, messageId: result.messageId };
          } else {
            // Properly stringify error for logging
            const errorMessage = typeof result.error === 'object' 
              ? JSON.stringify(result.error) 
              : String(result.error || 'Unknown error');
            logger.error({ err: errorMessage }, '❌ Brevo API email sending to ${emailType} failed:');
            // Fallback to SMTP if Brevo API fails
            const mailOptions = {
              from: '"Acme Operations" <support@acmeops.com>',
              to: email,
              subject: emailSubject,
              html: htmlContent,
              text: `Lesson Report for ${report.student_name}\n\nTutor: ${report.tutor_name}\nFeedback: ${feedbackText}`
            };
            
            const smtpResult = await transporter.sendMail(mailOptions);
            logger.info('📧 Email sent via SMTP fallback to ${emailType}: ${email}');
            sentEmails.push({
              email: email,
              studentName: studentName || report.student_name,
              type: emailType,
              success: true,
              messageId: smtpResult.messageId
            });
            return { success: true, messageId: smtpResult.messageId };
          }
        } catch (error) {
          // Properly stringify error to avoid "[object Object]"
          const errorMessage = error.message || (typeof error === 'object' ? JSON.stringify(error) : String(error || 'Unknown error'));
          logger.error({ err: errorMessage }, '❌ Error sending email to ${emailType} ${email}:');
          if (error.response?.data && typeof error.response.data === 'object') {
            logger.error({ error: JSON.stringify(error.response.data, null, 2) }, '   Full error details:');
          }
          sentEmails.push({
            email: email,
            studentName: studentName || report.student_name,
            type: emailType,
            success: false,
            error: errorMessage
          });
          return { success: false, error: errorMessage };
        }
      };
      
      // 1. Send email to client/organization
      const clientResult = await sendEmailToRecipient(emailToUse, report.client_name, 'client');
      
      // Store the first message ID as the primary brevo_message_id for webhook tracking
      // Only store if it's a valid Brevo message ID (not SMTP fallback)
      if (clientResult.success && clientResult.messageId) {
        // Check if this is a Brevo message ID (Brevo IDs are typically UUIDs or long strings)
        // SMTP message IDs usually have a different format
        const isBrevoMessageId = clientResult.messageId && 
          typeof clientResult.messageId === 'string' && 
          clientResult.messageId.length > 10; // Brevo IDs are typically longer
        
        if (isBrevoMessageId) {
          await pool.query(
            'UPDATE client_reports SET brevo_message_id = $1 WHERE id = $2',
            [clientResult.messageId, id]
          );
          logger.info('✅ Stored Brevo message ID ${clientResult.messageId} for report ${id}');
        } else {
          logger.info('⚠️ Skipping brevo_message_id storage for report ${id} - appears to be SMTP message ID: ${clientResult.messageId}');
          logger.info('   (Length: ${clientResult.messageId ? clientResult.messageId.length : 0}, Type: ${typeof clientResult.messageId})');
        }
      } else if (clientResult.success && !clientResult.messageId) {
        logger.warn('⚠️ Email sent successfully but no messageId returned for report ${id}');
      }
      
      // 2. Fetch all students for this appointment and send to each parent
      if (report.appointment_id) {
        try {
          // Get all recipients (students) for this appointment
          const { rows: recipientsRows } = await pool.query(`
            SELECT DISTINCT
              ar.recipient_id,
              ar.recipient_name,
              ar.status
            FROM appointment_recipients ar
            WHERE ar.appointment_id = $1
              AND ar.status IN ('attended', 'did not attend - chargeable')
            ORDER BY ar.recipient_name
          `, [report.appointment_id]);
          
          logger.info('📋 Found ${recipientsRows.length} students for appointment ${report.appointment_id}');
          
          // Get email for each student from recipients table or TutorCruncher API
          const { tutorCruncherAPI } = global;
          for (const recipientRow of recipientsRows) {
            const recipientId = recipientRow.recipient_id;
            const recipientName = recipientRow.recipient_name;
            
            let studentEmail = null;
            
            // Try to get email from local recipients table first
            try {
              const { rows: recipientEmailRows } = await pool.query(`
                SELECT email 
                FROM recipients 
                WHERE recipient_id::text = $1 OR recipient_id = $1
                LIMIT 1
              `, [recipientId]);
              
              if (recipientEmailRows.length > 0 && recipientEmailRows[0].email) {
                studentEmail = recipientEmailRows[0].email.trim();
                logger.info('✅ Found email for ${recipientName} from local database: ${studentEmail}');
              }
            } catch (dbError) {
              logger.info('ℹ️ Could not fetch email from local database for ${recipientName}, will try API');
            }
            
            // If no email from local DB, try TutorCruncher API
            if (!studentEmail && tutorCruncherAPI && recipientId) {
              try {
                logger.info('🔍 Fetching email from TutorCruncher API for recipient ${recipientId} (${recipientName})');
                const recipientResponse = await tutorCruncherAPI.get(`recipients/${recipientId}/`);
                const recipientData = recipientResponse.data;
                
                // Recipient email is typically in recipient.user.email
                if (recipientData && recipientData.user && recipientData.user.email) {
                  studentEmail = recipientData.user.email.trim();
                  logger.info('✅ Found email for ${recipientName} from TutorCruncher API: ${studentEmail}');
                } else {
                  logger.info('⚠️ No email found in TutorCruncher API for recipient ${recipientId} (${recipientName})');
                }
              } catch (apiError) {
                logger.error({ error: apiError.response?.data || apiError.message }, '❌ Error fetching recipient ${recipientId} from TutorCruncher API:');
              }
            }
            
            // Send email to student's parent if we have an email
            if (studentEmail && studentEmail.length > 0) {
              // Check if student email has unsubscribed
              const studentUnsubToken = getUnsubscribeToken(studentEmail);
              const { rows: studentUnsubRows } = await pool.query(
                'SELECT id FROM report_unsubscribes WHERE token = $1',
                [studentUnsubToken]
              );
              if (studentUnsubRows.length > 0) {
                logger.info({ email: studentEmail, recipientName }, 'Skipping student report - recipient has unsubscribed');
                sentEmails.push({ email: studentEmail, studentName: recipientName, type: 'student', success: false, error: 'Unsubscribed' });
              } else if (studentEmail.toLowerCase() !== emailToUse.toLowerCase()) {
                await sendEmailToRecipient(studentEmail, recipientName, 'student');
              } else {
                logger.info('⏭️ Skipping ${recipientName} - email matches client email (already sent)');
              }
            } else {
              logger.info('⚠️ No email available for student ${recipientName}, skipping');
              sentEmails.push({
                email: null,
                studentName: recipientName,
                type: 'student',
                success: false,
                error: 'No email found'
              });
            }
          }
        } catch (appointmentError) {
          logger.error({ err: appointmentError }, '❌ Error fetching students for appointment:');
          // Continue even if we can't fetch all students
        }
      } else {
        logger.info('ℹ️ No appointment_id for report ${id}, skipping student email sends');
      }
      
      // Store all sent emails in the database
      if (sentEmails.length > 0) {
        try {
          await pool.query(
            'UPDATE client_reports SET sent_emails = $1 WHERE id = $2',
            [JSON.stringify(sentEmails), id]
          );
          logger.info('✅ Stored ${sentEmails.length} sent email records in database');
        } catch (updateError) {
          logger.error({ err: updateError }, '❌ Error storing sent_emails:');
          // Don't fail the request if we can't store the tracking data
        }
      }
      
    } catch (emailError) {
      logger.error({ err: emailError }, '❌ Email sending failed:');
      // Don't fail the request, just log the error
      logger.info('📧 Email sending failed, but report marked as sent in database');
    }
    
    // Get the final sent_emails from database in case it was updated
    const { rows: finalReportRows } = await pool.query(
      'SELECT sent_emails FROM client_reports WHERE id = $1',
      [id]
    );
    
    const finalSentEmails = finalReportRows.length > 0 && finalReportRows[0].sent_emails 
      ? finalReportRows[0].sent_emails 
      : sentEmails;
    
    res.json({ 
      success: true, 
      report: rows[0],
      emailSent: emailToUse,
      studentEmailSent: report.student_email || null,
      customEmailUsed: !!customEmail,
      emailSubject: emailSubject,
      sentEmails: finalSentEmails || sentEmails,
      totalEmailsSent: sentEmails.filter(e => e.success).length,
      totalEmailsFailed: sentEmails.filter(e => !e.success).length
    });
  } catch (err) {
    logger.error({ err: err }, 'Send error:');
    res.status(500).json({ error: 'Failed to send report' });
  }
}));

// GET /api/client-reports/:id/tracking - Get email tracking data for a report
router.get('/:id/tracking', asyncHandler(async (req, res) => {
  try {
    const { id } = req.params;
    
    const emailSender = require('../utils/email-sender');
    const result = await emailSender.getEngagementSummary(pool, id);
    
    if (result.success) {
      res.json(result);
    } else {
      res.status(404).json({ error: result.error });
    }
    
  } catch (err) {
    logger.error({ err: err }, 'Tracking data error:');
    res.status(500).json({ error: 'Failed to fetch tracking data' });
  }
}));

// ── Public Unsubscribe Routes (no auth required) ────────────────────────────

// GET /api/client-reports/unsubscribe/:token - Show unsubscribe confirmation page
router.get('/unsubscribe/:token', asyncHandler(async (req, res) => {
  const { token } = req.params;
  const email = req.query?.email || '';
  const { pool } = buildDeps();

  // Check if already unsubscribed
  const { rows } = await pool.query(
    'SELECT email FROM report_unsubscribes WHERE token = $1',
    [token]
  );
  const alreadyUnsubscribed = rows.length > 0;

  res.send(`<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Unsubscribe - Acme Operations</title>
  <style>
    body { font-family: Arial, sans-serif; background: #f5f5f5; margin: 0; padding: 40px 20px; }
    .card { max-width: 480px; margin: 0 auto; background: #fff; border-radius: 12px; padding: 40px; box-shadow: 0 2px 8px rgba(0,0,0,0.1); text-align: center; }
    .logo { font-size: 24px; font-weight: bold; color: #2D2F8E; margin-bottom: 24px; }
    h1 { font-size: 20px; color: #333; margin-bottom: 12px; }
    p { font-size: 14px; color: #666; line-height: 1.6; }
    .btn { display: inline-block; padding: 12px 32px; background: #2D2F8E; color: #fff; border: none; border-radius: 8px; font-size: 14px; cursor: pointer; text-decoration: none; margin-top: 16px; }
    .btn:hover { background: #1e2070; }
    .btn:disabled { background: #ccc; cursor: default; }
    .success { color: #34B256; }
  </style>
</head>
<body>
  <div class="card">
    <div class="logo">Acme Operations</div>
    ${alreadyUnsubscribed
      ? `<h1 class="success">You're already unsubscribed</h1>
         <p>You won't receive any more lesson reports at this email address.</p>`
      : `<h1>Unsubscribe from Lesson Reports</h1>
         <p>Click the button below to stop receiving lesson reports from Acme Operations.</p>
         <form method="POST" action="/api/client-reports/unsubscribe/${token}">
           <input type="hidden" name="email" value="${email.replace(/"/g, '&quot;')}" />
           <button type="submit" class="btn">Unsubscribe</button>
         </form>`
    }
  </div>
</body>
</html>`);
}));

// POST /api/client-reports/unsubscribe/:token - Process unsubscribe
router.post('/unsubscribe/:token', asyncHandler(async (req, res) => {
  const { token } = req.params;
  const { pool } = buildDeps();
  const email = req.body?.email || req.query?.email || null;

  // Check if already unsubscribed
  const { rows: existing } = await pool.query(
    'SELECT id FROM report_unsubscribes WHERE token = $1',
    [token]
  );

  if (existing.length === 0) {
    await pool.query(
      `INSERT INTO report_unsubscribes (email, token, unsubscribed_at)
       VALUES ($1, $2, NOW())
       ON CONFLICT (token) DO NOTHING`,
      [email, token]
    );
  }

  logger.info({ token }, 'Client unsubscribed from lesson reports');

  res.send(`<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Unsubscribed - Acme Operations</title>
  <style>
    body { font-family: Arial, sans-serif; background: #f5f5f5; margin: 0; padding: 40px 20px; }
    .card { max-width: 480px; margin: 0 auto; background: #fff; border-radius: 12px; padding: 40px; box-shadow: 0 2px 8px rgba(0,0,0,0.1); text-align: center; }
    .logo { font-size: 24px; font-weight: bold; color: #2D2F8E; margin-bottom: 24px; }
    h1 { font-size: 20px; color: #34B256; margin-bottom: 12px; }
    p { font-size: 14px; color: #666; line-height: 1.6; }
  </style>
</head>
<body>
  <div class="card">
    <div class="logo">Acme Operations</div>
    <h1>You've been unsubscribed</h1>
    <p>You won't receive any more lesson reports from Acme Operations. If you change your mind, please contact us.</p>
  </div>
</body>
</html>`);
}));

module.exports = router;
