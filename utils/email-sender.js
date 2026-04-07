/**
 * Enhanced Email Sender with Brevo Tracking
 * Provides functions to send emails with tracking parameters
 */

const brevoTracking = require('./brevo-tracking');
const { logger } = require('./logger');
const { getInstance: getEmailSender } = require('./brevo-email-sender');

class EmailSender {
  /**
   * Send lesson report email with tracking
   * @param {Object} options - Email options
   * @param {string} options.to - Recipient email
   * @param {string} options.subject - Email subject
   * @param {string} options.html - HTML content
   * @param {string} options.text - Plain text content
   * @param {Object} options.reportData - Report data for tracking
   * @returns {Object} Email sending result with message ID
   */
  async sendLessonReportEmail(options) {
    const { to, subject, html, text, reportData } = options;
    
    try {
      // Generate unique tracking parameters
      const trackingParams = this.generateTrackingParams(reportData);
      
      // Add tracking pixels and links to HTML
      const trackedHtml = this.addTrackingToHtml(html, trackingParams);
      
      // Send via Brevo HTTP API (tags replace SMTP headers for tracking)
      const emailSender = getEmailSender();
      if (!emailSender) {
        logger.warn('⚠️ Brevo email sender not available — lesson report email not sent');
        return { success: false, error: 'Email service unavailable' };
      }

      const result = await emailSender.sendEmail({
        to,
        subject,
        html: trackedHtml,
        text,
        tags: ['lesson-reports'],
      });

      logger.info(`📧 Email sent with tracking ID: ${trackingParams.trackingId}`);

      return {
        success: result.success,
        messageId: result.messageId,
        trackingId: trackingParams.trackingId,
        result
      };
      
    } catch (error) {
      logger.error({ err: error }, '❌ Error sending tracked email:');
      return {
        success: false,
        error: error.message
      };
    }
  }

  /**
   * Generate unique tracking parameters
   * @param {Object} reportData - Report data
   * @returns {Object} Tracking parameters
   */
  generateTrackingParams(reportData) {
    const timestamp = Date.now();
    const randomId = Math.random().toString(36).substr(2, 9);
    const trackingId = `stc_${reportData.reportId}_${timestamp}_${randomId}`;
    
    return {
      trackingId,
      reportId: reportData.reportId,
      appointmentId: reportData.appointmentId,
      studentName: reportData.studentName,
      clientName: reportData.clientName,
      timestamp
    };
  }

  /**
   * Add tracking elements to HTML content
   * @param {string} html - Original HTML content
   * @param {Object} trackingParams - Tracking parameters
   * @returns {string} HTML with tracking elements
   */
  addTrackingToHtml(html, trackingParams) {
    // Create tracking pixel URL
    const trackingPixelUrl = `${process.env.APP_URL || 'https://analytics.chessat3.com'}/api/tracking/pixel/${trackingParams.trackingId}`;
    
    // Create click tracking URL
    const clickTrackingUrl = `${process.env.APP_URL || 'https://analytics.chessat3.com'}/api/tracking/click/${trackingParams.trackingId}`;
    
    // Add tracking pixel (invisible image)
    const trackingPixel = `<img src="${trackingPixelUrl}" width="1" height="1" style="display:none;" alt="" />`;
    
    // Wrap links with click tracking
    const trackedHtml = html.replace(
      /<a\s+([^>]*?)href=["']([^"']*?)["']([^>]*?)>/gi,
      (match, beforeHref, url, afterHref) => {
        // Skip if already has tracking or is a mailto link
        if (url.includes('/api/tracking/') || url.startsWith('mailto:')) {
          return match;
        }
        
        const encodedUrl = encodeURIComponent(url);
        const trackedUrl = `${clickTrackingUrl}?url=${encodedUrl}`;
        return `<a ${beforeHref}href="${trackedUrl}"${afterHref}>`;
      }
    );
    
    // Add tracking pixel at the end of the body
    return trackedHtml.replace(
      /<\/body>/i,
      `${trackingPixel}</body>`
    );
  }

  /**
   * Update client report with email tracking info
   * @param {Object} pool - Database connection pool
   * @param {number} reportId - Report ID
   * @param {string} messageId - Brevo message ID
   * @param {string} trackingId - Custom tracking ID
   */
  async updateReportWithTrackingInfo(pool, reportId, messageId, trackingId) {
    try {
      await pool.query(`
        UPDATE client_reports SET
          status = 'sent',
          date_sent = NOW(),
          brevo_message_id = $1,
          brevo_events = '[]'
        WHERE id = $2
      `, [messageId, reportId]);
      
      logger.info(`✅ Updated report ${reportId} with tracking info (messageId: ${messageId})`);
      
    } catch (error) {
      logger.error({ err: error }, `❌ Error updating report ${reportId} with tracking info:`);
      throw error;
    }
  }

  /**
   * Get email engagement summary for a report
   * @param {Object} pool - Database connection pool
   * @param {number} reportId - Report ID
   * @returns {Object} Engagement summary
   */
  async getEngagementSummary(pool, reportId) {
    try {
      const { rows } = await pool.query(`
        SELECT 
          id,
          brevo_message_id,
          email_opened_at,
          email_opened_count,
          email_clicked_at,
          email_clicked_count,
          email_clicked_urls,
          email_delivered_at,
          email_bounced_at,
          email_complained_at,
          email_unsubscribed_at,
          engagement_score,
          last_engagement_at,
          brevo_events
        FROM client_reports 
        WHERE id = $1
      `, [reportId]);

      if (rows.length === 0) {
        return { success: false, error: 'Report not found' };
      }

      const report = rows[0];
      
      // Get fresh data from Brevo API if message ID exists
      let brevoData = null;
      if (report.brevo_message_id) {
        const brevoResult = await brevoTracking.getEmailStats(report.brevo_message_id);
        if (brevoResult.success) {
          brevoData = brevoResult.data;
        }
      }

      return {
        success: true,
        data: {
          reportId: report.id,
          messageId: report.brevo_message_id,
          delivered: !!report.email_delivered_at,
          deliveredAt: report.email_delivered_at,
          opened: !!report.email_opened_at,
          openedAt: report.email_opened_at,
          openedCount: report.email_opened_count || 0,
          clicked: !!report.email_clicked_at,
          clickedAt: report.email_clicked_at,
          clickedCount: report.email_clicked_count || 0,
          clickedUrls: report.email_clicked_urls || [],
          bounced: !!report.email_bounced_at,
          bouncedAt: report.email_bounced_at,
          complained: !!report.email_complained_at,
          complainedAt: report.email_complained_at,
          unsubscribed: !!report.email_unsubscribed_at,
          unsubscribedAt: report.email_unsubscribed_at,
          engagementScore: report.engagement_score || 0,
          lastEngagementAt: report.last_engagement_at,
          events: report.brevo_events || [],
          brevoData // Fresh data from Brevo API
        }
      };
      
    } catch (error) {
      logger.error({ err: error }, `❌ Error getting engagement summary for report ${reportId}:`);
      return {
        success: false,
        error: error.message
      };
    }
  }
}

module.exports = new EmailSender();
