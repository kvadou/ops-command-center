/**
 * CCT Notification Service
 *
 * Handles creating and managing notifications for the Client Conversion Tracker (CCT).
 * Notifications have per-user read state (each user dismisses independently).
 *
 * Notification Types:
 * - auto_won: Client auto-moved to Won (first paid lesson completed)
 * - auto_lost_14_day: Client auto-moved to Lost (14 days in Waiting for Response)
 * - auto_lost_30_day_building: Client auto-moved to Lost (30 days in Building)
 * - auto_lost_30_day_trial: Client auto-moved to Lost (30 days after trial with no conversion)
 * - manual_won: Client manually marked as Won
 * - manual_lost: Client manually marked as Lost
 * - restored: Client restored from Won/Lost to previous stage
 */

// Notification type configurations

const { logger } = require('../utils/logger');
const CCT_NOTIFICATION_TYPES = {
  auto_won: {
    title: '{clientName} converted to Won',
    body: 'Completed first paid lesson after trial',
    priority: 'high',
    style: 'success'
  },
  auto_lost_14_day: {
    title: '{clientName} moved to Lost',
    body: '14 days in Waiting for Response with no progress',
    priority: 'medium',
    style: 'warning'
  },
  auto_lost_30_day_building: {
    title: '{clientName} moved to Lost',
    body: '30 days in Building status with no progress',
    priority: 'medium',
    style: 'warning'
  },
  auto_lost_30_day_trial: {
    title: '{clientName} moved to Lost',
    body: '30 days after trial with no conversion',
    priority: 'medium',
    style: 'warning'
  },
  manual_won: {
    title: '{clientName} marked as Won',
    body: 'Manually moved to Won by {actor}',
    priority: 'low',
    style: 'success'
  },
  manual_lost: {
    title: '{clientName} marked as Lost',
    body: 'Manually moved to Lost by {actor}',
    priority: 'low',
    style: 'warning'
  },
  restored: {
    title: '{clientName} restored',
    body: 'Restored to {previousStatus} by {actor}',
    priority: 'low',
    style: 'info'
  }
};

class CCTNotificationService {
  constructor(pool) {
    this.pool = pool;
  }

  /**
   * Create a CCT notification
   */
  async createNotification({
    type,
    title,
    body,
    clientId,
    clientName,
    clientEmail,
    automationTrigger = null,
    previousPipelineStageId = null,
    previousProspectStatus = null,
    data = {}
  }) {
    try {
      const query = `
        INSERT INTO cct_notifications (
          type, title, body, client_id, client_name, client_email,
          automation_trigger, previous_pipeline_stage_id, previous_prospect_status, data
        )
        VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10::jsonb)
        RETURNING *
      `;

      const { rows } = await this.pool.query(query, [
        type,
        title,
        body,
        clientId,
        clientName,
        clientEmail,
        automationTrigger,
        previousPipelineStageId,
        previousProspectStatus,
        JSON.stringify(data)
      ]);

      const notification = rows[0];
      logger.info(`[CCTNotification] Created notification: ${type} for client ${clientId}`);

      // Send real-time notification via WebSocket
      this.sendRealtimeNotification(notification);

      return notification;
    } catch (error) {
      logger.error({ err: error }, '[CCTNotificationService] Error creating notification:');
      throw error;
    }
  }

  /**
   * Check for duplicate notification to prevent spam
   * Returns true if a notification with same client_id and trigger exists within withinHours
   */
  async isDuplicateNotification(clientId, automationTrigger, withinHours = 24) {
    try {
      const query = `
        SELECT id FROM cct_notifications
        WHERE client_id = $1
        AND automation_trigger = $2
        AND created_at > NOW() - INTERVAL '${withinHours} hours'
        LIMIT 1
      `;

      const { rows } = await this.pool.query(query, [clientId, automationTrigger]);
      return rows.length > 0;
    } catch (error) {
      logger.error({ err: error }, '[CCTNotificationService] Error checking duplicate:');
      return false;
    }
  }

  /**
   * Get unread notification count for a specific user
   */
  async getUnreadCount(userId) {
    try {
      const query = `
        SELECT COUNT(*)::INTEGER as count
        FROM cct_notifications n
        WHERE NOT EXISTS (
          SELECT 1 FROM cct_notification_user_reads r
          WHERE r.notification_id = n.id AND r.user_id = $1
        )
      `;

      const { rows } = await this.pool.query(query, [userId]);
      return rows[0].count;
    } catch (error) {
      logger.error({ err: error }, '[CCTNotificationService] Error getting unread count:');
      return 0;
    }
  }

  /**
   * Get notifications with pagination (per-user read state)
   */
  async getNotifications({ page = 1, limit = 20, unreadOnly = false, userId }) {
    try {
      const offset = (page - 1) * limit;

      // Build WHERE clause for unread filter using per-user reads table
      let whereClause = '';
      let queryParams = [userId, limit, offset];
      if (unreadOnly) {
        whereClause = `WHERE NOT EXISTS (
          SELECT 1 FROM cct_notification_user_reads r
          WHERE r.notification_id = n.id AND r.user_id = $1
        )`;
      }

      const query = `
        SELECT
          n.*,
          ps.name as previous_stage_name,
          ur.read_at as user_read_at
        FROM cct_notifications n
        LEFT JOIN pipeline_stages ps ON n.previous_pipeline_stage_id = ps.id
        LEFT JOIN cct_notification_user_reads ur ON n.id = ur.notification_id AND ur.user_id = $1
        ${whereClause}
        ORDER BY n.created_at DESC
        LIMIT $2 OFFSET $3
      `;

      const { rows: notifications } = await this.pool.query(query, queryParams);

      // Map user_read_at to read_at for frontend compatibility
      const mappedNotifications = notifications.map(n => ({
        ...n,
        read_at: n.user_read_at || null  // Use per-user read state
      }));

      // Get total count with same filter
      let countWhereClause = '';
      let countParams = [userId];
      if (unreadOnly) {
        countWhereClause = `WHERE NOT EXISTS (
          SELECT 1 FROM cct_notification_user_reads r
          WHERE r.notification_id = n.id AND r.user_id = $1
        )`;
      }

      const countQuery = `
        SELECT COUNT(*)::INTEGER as total
        FROM cct_notifications n
        ${countWhereClause}
      `;

      const { rows: countResult } = await this.pool.query(countQuery, unreadOnly ? countParams : []);
      const total = countResult[0].total;

      return {
        notifications: mappedNotifications,
        pagination: {
          page,
          limit,
          total,
          totalPages: Math.ceil(total / limit),
          hasMore: offset + mappedNotifications.length < total
        }
      };
    } catch (error) {
      logger.error({ err: error }, '[CCTNotificationService] Error getting notifications:');
      return { notifications: [], pagination: { page: 1, limit: 20, total: 0, totalPages: 0, hasMore: false } };
    }
  }

  /**
   * Get a notification by ID
   */
  async getNotificationById(notificationId) {
    try {
      const query = `
        SELECT
          n.*,
          ps.name as previous_stage_name
        FROM cct_notifications n
        LEFT JOIN pipeline_stages ps ON n.previous_pipeline_stage_id = ps.id
        WHERE n.id = $1
      `;

      const { rows } = await this.pool.query(query, [notificationId]);
      return rows[0] || null;
    } catch (error) {
      logger.error({ err: error }, '[CCTNotificationService] Error getting notification:');
      return null;
    }
  }

  /**
   * Mark a notification as read for a specific user
   */
  async markAsRead(notificationId, userId) {
    try {
      // Insert into per-user reads table (ON CONFLICT DO NOTHING if already read)
      const query = `
        INSERT INTO cct_notification_user_reads (notification_id, user_id)
        VALUES ($1, $2)
        ON CONFLICT (notification_id, user_id) DO NOTHING
        RETURNING *
      `;

      const { rows } = await this.pool.query(query, [notificationId, userId]);

      if (rows.length > 0) {
        logger.info(`[CCTNotification] Marked notification ${notificationId} as read by ${userId}`);
      }

      // Also update the original table for audit trail (first reader)
      await this.pool.query(`
        UPDATE cct_notifications
        SET read_at = COALESCE(read_at, NOW()), read_by = COALESCE(read_by, $2)
        WHERE id = $1
      `, [notificationId, userId]);

      // Return the notification for API response
      const notificationResult = await this.pool.query(
        'SELECT * FROM cct_notifications WHERE id = $1',
        [notificationId]
      );

      return notificationResult.rows[0] || null;
    } catch (error) {
      logger.error({ err: error }, '[CCTNotificationService] Error marking as read:');
      throw error;
    }
  }

  /**
   * Mark all notifications as read for a specific user
   */
  async markAllAsRead(userId) {
    try {
      // Insert all unread notifications for this user into the reads table
      const query = `
        INSERT INTO cct_notification_user_reads (notification_id, user_id)
        SELECT n.id, $1::varchar
        FROM cct_notifications n
        WHERE NOT EXISTS (
          SELECT 1 FROM cct_notification_user_reads r
          WHERE r.notification_id = n.id AND r.user_id = $1::varchar
        )
        ON CONFLICT DO NOTHING
        RETURNING notification_id
      `;

      const { rows } = await this.pool.query(query, [userId]);
      logger.info(`[CCTNotification] Marked ${rows.length} notifications as read by ${userId}`);

      return rows.length;
    } catch (error) {
      logger.error({ err: error }, '[CCTNotificationService] Error marking all as read:');
      throw error;
    }
  }

  /**
   * Restore a client from Won/Lost back to their previous pipeline stage
   */
  async restoreClient(notificationId, userId) {
    try {
      // Get the notification with client and previous stage info
      const notification = await this.getNotificationById(notificationId);

      if (!notification) {
        throw new Error('Notification not found');
      }

      if (notification.restored_at) {
        throw new Error('Client has already been restored');
      }

      const { client_id, previous_pipeline_stage_id, previous_prospect_status, client_name } = notification;

      // Get the client's current state
      const clientResult = await this.pool.query(
        'SELECT prospect_status, pipeline_stage_id FROM clients WHERE id = $1',
        [client_id]
      );

      if (clientResult.rows.length === 0) {
        throw new Error('Client not found');
      }

      // Determine restore destination
      // If no previous stage stored, default to "Waiting for Response"
      let restoreStageId = previous_pipeline_stage_id;
      let restoreStatus = previous_prospect_status || 'Waiting for Response';

      if (!restoreStageId) {
        // Get the "New Lead" stage as default
        const stageResult = await this.pool.query(
          `SELECT id FROM pipeline_stages WHERE LOWER(name) = 'new lead' LIMIT 1`
        );
        restoreStageId = stageResult.rows[0]?.id || null;
      }

      // Update the client back to previous stage
      await this.pool.query(`
        UPDATE clients
        SET
          pipeline_stage_id = $1,
          prospect_status = $2,
          status = 'prospect',
          archived_at = NULL,
          updated_at = NOW()
        WHERE id = $3
      `, [restoreStageId, restoreStatus, client_id]);

      // Mark the notification as restored
      await this.pool.query(`
        UPDATE cct_notifications
        SET restored_at = NOW(), restored_by = $2
        WHERE id = $1
      `, [notificationId, userId]);

      // Create a new "restored" notification
      const previousStageName = notification.previous_stage_name || 'previous stage';
      await this.createNotification({
        type: 'restored',
        title: `${client_name} restored`,
        body: `Restored to ${restoreStatus} by ${userId}`,
        clientId: client_id,
        clientName: client_name,
        clientEmail: notification.client_email,
        automationTrigger: 'manual',
        previousPipelineStageId: restoreStageId,
        previousProspectStatus: restoreStatus,
        data: { restoredBy: userId, fromNotificationId: notificationId }
      });

      logger.info(`[CCTNotification] Restored client ${client_id} to ${restoreStatus} by ${userId}`);

      return {
        success: true,
        clientId: client_id,
        restoredTo: restoreStatus,
        previousStage: previousStageName
      };
    } catch (error) {
      logger.error({ err: error }, '[CCTNotificationService] Error restoring client:');
      throw error;
    }
  }

  /**
   * Send real-time notification via WebSocket
   */
  sendRealtimeNotification(notification) {
    const ws = global.websocket;
    if (ws && typeof ws.broadcastCCTNotification === 'function') {
      ws.broadcastCCTNotification(notification);
    } else if (ws && typeof ws.broadcast === 'function') {
      // Fallback to generic broadcast if specific method not available
      ws.broadcast('cct_notification', { notification });
    } else {
      logger.info('[CCTNotificationService] WebSocket not available for real-time notification');
    }
  }

  /**
   * Get type configuration for a notification type
   */
  static getTypeConfig(type) {
    return CCT_NOTIFICATION_TYPES[type] || {
      title: '{clientName} status updated',
      body: 'Status has changed',
      priority: 'low',
      style: 'info'
    };
  }

  /**
   * Format notification title with variables
   */
  static formatTitle(type, variables) {
    const config = CCTNotificationService.getTypeConfig(type);
    let title = config.title;

    for (const [key, value] of Object.entries(variables)) {
      title = title.replace(`{${key}}`, value || '');
    }

    return title;
  }

  /**
   * Format notification body with variables
   */
  static formatBody(type, variables) {
    const config = CCTNotificationService.getTypeConfig(type);
    let body = config.body;

    for (const [key, value] of Object.entries(variables)) {
      body = body.replace(`{${key}}`, value || '');
    }

    return body;
  }
}

module.exports = CCTNotificationService;
module.exports.CCT_NOTIFICATION_TYPES = CCT_NOTIFICATION_TYPES;
