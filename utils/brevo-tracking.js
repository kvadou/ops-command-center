/**
 * Brevo Email Tracking Integration
 * Provides functions to track email opens, clicks, and engagement metrics
 */

const axios = require('axios');
const { logger } = require('./logger');

class BrevoTracking {
  constructor() {
    this.apiKey = process.env.BREVO_API_KEY;
    this.baseUrl = 'https://api.brevo.com/v3';
    
    if (!this.apiKey) {
      logger.warn('⚠️ BREVO_API_KEY not found in environment variables');
    }
  }

  /**
   * Get email statistics for a specific message ID
   * @param {string} messageId - The Brevo message ID
   * @returns {Object} Email statistics
   */
  async getEmailStats(messageId) {
    try {
      if (!this.apiKey) {
        throw new Error('Brevo API key not configured');
      }

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

  /**
   * Get aggregated email statistics for a date range
   * @param {string} startDate - Start date (YYYY-MM-DD)
   * @param {string} endDate - End date (YYYY-MM-DD)
   * @returns {Object} Aggregated statistics
   */
  async getAggregatedStats(startDate, endDate) {
    try {
      if (!this.apiKey) {
        throw new Error('Brevo API key not configured');
      }

      const response = await axios.get(`${this.baseUrl}/smtp/statistics/aggregatedReport`, {
        headers: {
          'api-key': this.apiKey,
          'Content-Type': 'application/json'
        },
        params: {
          startDate,
          endDate,
          tag: 'lesson-reports' // Tag to filter lesson report emails
        }
      });

      return {
        success: true,
        data: response.data
      };
    } catch (error) {
      logger.error({ error: error.response?.data || error.message }, 'Error fetching Brevo aggregated stats:');
      return {
        success: false,
        error: error.response?.data || error.message
      };
    }
  }

  /**
   * Calculate engagement score based on email events
   * @param {Object} events - Email events object
   * @returns {number} Engagement score (0.00-1.00)
   */
  calculateEngagementScore(events) {
    let score = 0.0;
    
    // Base score for delivery
    if (events.delivered) score += 0.1;
    
    // Open tracking (weighted by number of opens)
    if (events.opened) {
      score += 0.3; // Base score for opening
      if (events.openCount > 1) score += 0.1; // Bonus for multiple opens
      if (events.openCount > 3) score += 0.1; // Extra bonus for high engagement
    }
    
    // Click tracking (higher weight)
    if (events.clicked) {
      score += 0.4; // Base score for clicking
      if (events.clickCount > 1) score += 0.1; // Bonus for multiple clicks
    }
    
    // Negative events
    if (events.bounced) score -= 0.2;
    if (events.complained) score -= 0.3;
    if (events.unsubscribed) score -= 0.4;
    
    // Ensure score is between 0 and 1
    return Math.max(0.0, Math.min(1.0, score));
  }

  /**
   * Update client report with tracking data
   * @param {Object} pool - Database connection pool
   * @param {number} reportId - Client report ID
   * @param {Object} trackingData - Tracking data from Brevo
   */
  async updateClientReportTracking(pool, reportId, trackingData) {
    try {
      const {
        messageId,
        opened,
        clicked,
        delivered,
        bounced,
        complained,
        unsubscribed,
        openCount = 0,
        clickCount = 0,
        clickedUrls = [],
        events = []
      } = trackingData;

      // Calculate engagement score
      const engagementScore = this.calculateEngagementScore({
        opened,
        clicked,
        delivered,
        bounced,
        complained,
        unsubscribed,
        openCount,
        clickCount
      });

      // Determine last engagement timestamp
      const timestamps = [
        opened && trackingData.openedAt,
        clicked && trackingData.clickedAt,
        delivered && trackingData.deliveredAt
      ].filter(Boolean);
      
      const lastEngagementAt = timestamps.length > 0 
        ? new Date(Math.max(...timestamps.map(t => new Date(t))))
        : null;

      // Update the database
      await pool.query(`
        UPDATE client_reports SET
          brevo_message_id = COALESCE($1, brevo_message_id),
          email_opened_at = COALESCE($2, email_opened_at),
          email_opened_count = GREATEST(email_opened_count, $3),
          email_clicked_at = COALESCE($4, email_clicked_at),
          email_clicked_count = GREATEST(email_clicked_count, $5),
          email_clicked_urls = CASE 
            WHEN $6 IS NOT NULL AND array_length($6, 1) > 0 
            THEN $6 
            ELSE email_clicked_urls 
          END,
          email_delivered_at = COALESCE($7, email_delivered_at),
          email_bounced_at = COALESCE($8, email_bounced_at),
          email_complained_at = COALESCE($9, email_complained_at),
          email_unsubscribed_at = COALESCE($10, email_unsubscribed_at),
          engagement_score = GREATEST(engagement_score, $11),
          last_engagement_at = COALESCE($12, last_engagement_at),
          brevo_events = $13
        WHERE id = $14
      `, [
        messageId,
        opened ? trackingData.openedAt : null,
        openCount,
        clicked ? trackingData.clickedAt : null,
        clickCount,
        clickedUrls.length > 0 ? clickedUrls : null,
        delivered ? trackingData.deliveredAt : null,
        bounced ? trackingData.bouncedAt : null,
        complained ? trackingData.complainedAt : null,
        unsubscribed ? trackingData.unsubscribedAt : null,
        engagementScore,
        lastEngagementAt,
        JSON.stringify(events),
        reportId
      ]);

      logger.info(`✅ Updated tracking data for report ${reportId} (engagement: ${engagementScore.toFixed(2)})`);
      
    } catch (error) {
      logger.error({ err: error }, `❌ Error updating tracking data for report ${reportId}:`);
      throw error;
    }
  }

  /**
   * Process Brevo webhook event
   * @param {Object} pool - Database connection pool
   * @param {Object} webhookData - Webhook payload from Brevo
   */
  async processWebhookEvent(pool, webhookData) {
    try {
      const { messageId, event, timestamp, email, url, reason } = webhookData;
      
      // Find the client report by Brevo message ID
      const { rows } = await pool.query(
        'SELECT id, brevo_events FROM client_reports WHERE brevo_message_id = $1',
        [messageId]
      );

      if (rows.length === 0) {
        logger.info(`⚠️ No client report found for Brevo message ID: ${messageId}`);
        return;
      }

      const reportId = rows[0].id;
      const existingEvents = rows[0].brevo_events || [];

      // Add the new event to the events array
      const newEvent = {
        event,
        timestamp,
        email,
        url,
        reason
      };
      
      const updatedEvents = [...existingEvents, newEvent];

      // Update the report based on the event type
      let updateQuery = 'UPDATE client_reports SET brevo_events = $1';
      let queryParams = [JSON.stringify(updatedEvents)];
      let paramCount = 1;

      switch (event) {
        case 'sent':
          updateQuery += `, sent_at = $${++paramCount}`;
          queryParams.push(new Date(timestamp));
          break;
          
        case 'delivered':
          updateQuery += `, email_delivered_at = $${++paramCount}`;
          queryParams.push(new Date(timestamp));
          break;
          
        case 'opened':
          updateQuery += `, email_opened_at = COALESCE(email_opened_at, $${++paramCount}), email_opened_count = email_opened_count + 1`;
          queryParams.push(new Date(timestamp));
          break;
          
        case 'clicked':
          updateQuery += `, email_clicked_at = COALESCE(email_clicked_at, $${++paramCount}), email_clicked_count = email_clicked_count + 1`;
          queryParams.push(new Date(timestamp));
          
          if (url) {
            // Add clicked URL to the array
            updateQuery += `, email_clicked_urls = array_append(email_clicked_urls, $${++paramCount})`;
            queryParams.push(url);
          }
          break;
          
        case 'bounced':
          updateQuery += `, email_bounced_at = $${++paramCount}`;
          queryParams.push(new Date(timestamp));
          break;
          
        case 'complained':
          updateQuery += `, email_complained_at = $${++paramCount}`;
          queryParams.push(new Date(timestamp));
          break;
          
        case 'unsubscribed':
          updateQuery += `, email_unsubscribed_at = $${++paramCount}`;
          queryParams.push(new Date(timestamp));
          break;
      }

      updateQuery += ` WHERE id = $${++paramCount}`;
      queryParams.push(reportId);

      await pool.query(updateQuery, queryParams);

      // Recalculate engagement score
      const { rows: updatedReport } = await pool.query(
        'SELECT * FROM client_reports WHERE id = $1',
        [reportId]
      );

      if (updatedReport.length > 0) {
        const engagementScore = this.calculateEngagementScore({
          opened: !!updatedReport[0].email_opened_at,
          clicked: !!updatedReport[0].email_clicked_at,
          delivered: !!updatedReport[0].email_delivered_at,
          bounced: !!updatedReport[0].email_bounced_at,
          complained: !!updatedReport[0].email_complained_at,
          unsubscribed: !!updatedReport[0].email_unsubscribed_at,
          openCount: updatedReport[0].email_opened_count || 0,
          clickCount: updatedReport[0].email_clicked_count || 0
        });

        await pool.query(
          'UPDATE client_reports SET engagement_score = $1, last_engagement_at = NOW() WHERE id = $2',
          [engagementScore, reportId]
        );
      }

      logger.info(`✅ Processed Brevo webhook event: ${event} for report ${reportId}`);
      
    } catch (error) {
      logger.error({ err: error }, '❌ Error processing Brevo webhook event:');
      throw error;
    }
  }
}

module.exports = new BrevoTracking();
