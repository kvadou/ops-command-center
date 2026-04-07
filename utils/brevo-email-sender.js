/**
 * Brevo API Email Sender
 * Sends emails via Brevo API to get message IDs for webhook tracking
 */

const axios = require('axios');
const { logger } = require('./logger');

class BrevoEmailSender {
  constructor() {
    this.apiKey = process.env.BREVO_API_KEY;
    this.baseUrl = 'https://api.brevo.com/v3';
    this.stubMode = !this.apiKey;

    if (this.stubMode) {
      logger.warn('[STUB] Brevo email sender running in stub mode — emails will be logged, not sent');
    }
  }

  /**
   * Get location-specific sender email
   * @param {string} location - Environment location
   * @returns {string} Sender email address
   */
  getLocationSender(location) {
    switch (location) {
      case 'eastside':
        return 'eastside@acmeops.com';
      case 'westside':
        return 'westside@acmeops.com';
      case 'production':
      case 'staging':
      default:
        return 'support@acmeops.com';
    }
  }

  /**
   * Send email via Brevo API and return message ID
   * @param {Object} emailData - Email data
   * @param {Object} emailData.to - Recipient email address
   * @param {string} emailData.subject - Email subject
   * @param {string} emailData.html - HTML content
   * @param {string} emailData.text - Plain text content (optional)
   * @param {string} emailData.from - Sender email (optional)
   * @param {string} emailData.location - Location for sender routing (optional)
   * @param {Array} emailData.attachments - Array of attachments (optional)
   * @param {string} emailData.attachments[].content - Base64 encoded content (without data: prefix)
   * @param {string} emailData.attachments[].name - Filename with extension (e.g., 'report.png')
   * @param {number} retries - Number of retries remaining (default: 3)
   * @returns {Object} Result with message ID
   */
  async sendEmail(emailData, retries = 3) {
    try {
      const { to, subject, html, text, from, replyTo, location = 'production', attachments, tags } = emailData;

      if (!to || !subject || (!html && !text)) {
        throw new Error('Missing required email fields: to, subject, and either html or text');
      }

      // Stub mode: log the email instead of sending
      if (this.stubMode) {
        logger.info(`[STUB] Email would be sent:
  To: ${JSON.stringify(to)}
  Subject: ${subject}
  From: ${from || this.getLocationSender(location)}
  Tags: ${JSON.stringify(tags || [location])}`);
        return { success: true, messageId: `stub-${Date.now()}`, data: { messageId: `stub-${Date.now()}` } };
      }

      // Use provided from address or determine from location
      const senderEmail = from || this.getLocationSender(location);

      const payload = {
        sender: {
          name: 'Acme Operations',
          email: senderEmail
        },
        to: Array.isArray(to) ? to : [{ email: to }],
        subject: subject,
        tags: tags || [location] // Custom tags or location tag for webhook routing
      };

      // Support html-only, text-only, or both
      if (html) payload.htmlContent = html;
      if (text) {
        payload.textContent = text;
      } else if (html) {
        payload.textContent = this.stripHtml(html);
      }

      // Add replyTo if provided
      if (replyTo) {
        payload.replyTo = { email: replyTo };
      }

      // Add attachments if provided
      if (attachments && Array.isArray(attachments) && attachments.length > 0) {
        payload.attachment = attachments.map(att => ({
          content: att.content,
          name: att.name
        }));
        logger.info(`📎 Adding ${attachments.length} attachment(s) to email`);
      }

      logger.info(`📧 Sending email via Brevo API to: ${to} (Attempt ${4 - retries}/3)`);
      
      const response = await axios.post(`${this.baseUrl}/smtp/email`, payload, {
        headers: {
          'api-key': this.apiKey,
          'Content-Type': 'application/json'
        },
        timeout: 10000 // 10 second timeout
      });

      const messageId = response.data?.messageId;
      
      if (!messageId) {
        logger.error({ data: JSON.stringify(response.data, null, 2) }, `⚠️ Brevo API response missing messageId:`);
        logger.error(`   Response status: ${response.status}`);
        logger.error({ data: JSON.stringify(response.headers, null, 2) }, `   Response headers:`);
      } else {
        logger.info(`✅ Email sent successfully via Brevo API. Message ID: ${messageId}`);
      }
      
      return {
        success: true,
        messageId: messageId || null, // Explicitly set to null if missing
        data: response.data
      };
      
    } catch (error) {
      // Properly stringify error objects to avoid "[object Object]" in logs/alerts
      let errorMessage = error.message || 'Unknown error';
      if (error.response?.data) {
        if (typeof error.response.data === 'object') {
          // Try to extract meaningful error message from Brevo API response
          if (error.response.data.message) {
            errorMessage = error.response.data.message;
          } else if (error.response.data.error) {
            errorMessage = typeof error.response.data.error === 'string' 
              ? error.response.data.error 
              : JSON.stringify(error.response.data.error);
          } else {
            errorMessage = JSON.stringify(error.response.data);
          }
        } else {
          errorMessage = String(error.response.data);
        }
      }
      
      logger.error({ data: errorMessage }, `❌ Brevo API email sending failed (Attempt ${4 - retries}/3):`);
      if (error.response?.data && typeof error.response.data === 'object') {
        logger.error({ err: JSON.stringify(error.response.data, null, 2) }, '   Full error details:');
      }
      
      // Retry logic for 5xx errors or network errors (not for 4xx client errors)
      const isRetryable = !error.response || (error.response.status >= 500 && error.response.status < 600);
      
      if (retries > 0 && isRetryable) {
        logger.info(`🔄 Retrying Brevo API call in 1000ms... (${retries - 1} retries remaining)`);
        await new Promise(resolve => setTimeout(resolve, 1000));
        return this.sendEmail(emailData, retries - 1);
      }
      
      return {
        success: false,
        error: errorMessage
      };
    }
  }

  /**
   * Strip HTML tags to create plain text version
   * @param {string} html - HTML content
   * @returns {string} Plain text content
   */
  stripHtml(html) {
    if (!html) return '';
    return html
      .replace(/<[^>]*>/g, '') // Remove HTML tags
      .replace(/&nbsp;/g, ' ') // Replace &nbsp; with spaces
      .replace(/&amp;/g, '&') // Decode HTML entities
      .replace(/&lt;/g, '<')
      .replace(/&gt;/g, '>')
      .replace(/&quot;/g, '"')
      .replace(/&#x27;/g, "'")
      .replace(/&#39;/g, "'")
      .replace(/\s+/g, ' ') // Collapse multiple spaces
      .trim();
  }

  /**
   * Get email statistics for a message ID
   * @param {string} messageId - The Brevo message ID
   * @returns {Object} Email statistics
   */
  async getEmailStats(messageId) {
    if (this.stubMode) {
      return { success: true, data: { messageId, event: 'delivered', date: new Date().toISOString() } };
    }
    try {
      const response = await axios.get(`${this.baseUrl}/smtp/emails/${messageId}`, {
        headers: {
          'api-key': this.apiKey,
          'Content-Type': 'application/json'
        }
      });

      return {
        success: true,
        data: response.data
      };
    } catch (error) {
      logger.error({ error: error.response?.data || error.message }, 'Error fetching Brevo email stats:');
      return {
        success: false,
        error: error.response?.data || error.message
      };
    }
  }
}

// Lazy initialization to avoid crashing if BREVO_API_KEY is not set
let instance = null;

module.exports = {
  getInstance: () => {
    if (!instance) {
      // Always create instance — it handles stub mode internally
      instance = new BrevoEmailSender();
    }
    return instance;
  }
};
