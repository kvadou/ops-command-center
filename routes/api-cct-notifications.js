/**
 * CCT Notifications API Routes
 *
 * Handles fetching, reading, and managing CCT-specific notifications.
 * CCT notifications have per-user read state (each user dismisses independently).
 */

const express = require('express');
const router = express.Router();
const { requireAuth } = require('../middleware/auth');
const { getPool: getPoolByEnv } = require('../database-connections');
const CCTNotificationService = require('../services/cct-notification-service');
const ClientConversionService = require('../services/client-conversion-service');
const { asyncHandler } = require('../middleware/error-handler');
const { logger } = require('../utils/logger');

// Helper function to get pool from request
function getPool(req) {
  if (req.locationPool) {
    return req.locationPool;
  }

  const hostname = req.get('host') || req.hostname || '';
  let env = 'local';

  if (hostname.includes('eastside')) {
    env = 'eastside';
  } else if (hostname.includes('westside')) {
    env = 'westside';
  } else if (process.env.NODE_ENV === 'production' || hostname.includes('herokuapp.com')) {
    env = 'production';
  } else if (process.env.NODE_ENV === 'staging') {
    env = 'staging';
  }

  return getPoolByEnv(env);
}

/**
 * Get CCT notifications (per-user read state)
 */
router.get('/', requireAuth, asyncHandler(async (req, res) => {
  try {
    const pool = getPool(req);
    const service = new CCTNotificationService(pool);
    const userId = req.user?.email || req.user?.id?.toString();

    const { page = 1, limit = 20, unread_only = 'false' } = req.query;

    const result = await service.getNotifications({
      page: parseInt(page),
      limit: parseInt(limit),
      unreadOnly: unread_only === 'true',
      userId
    });

    res.json(result);
  } catch (error) {
    logger.error({ err: error }, '[CCT Notifications] Error fetching notifications');
    res.status(500).json({ error: 'Failed to fetch notifications' });
  }
}));

/**
 * Get unread CCT notification count (per-user)
 */
router.get('/count', requireAuth, asyncHandler(async (req, res) => {
  try {
    const pool = getPool(req);
    const service = new CCTNotificationService(pool);
    const userId = req.user?.email || req.user?.id?.toString();

    const count = await service.getUnreadCount(userId);

    res.json({ count });
  } catch (error) {
    logger.error({ err: error }, '[CCT Notifications] Error fetching count');
    res.status(500).json({ error: 'Failed to fetch notification count' });
  }
}));

/**
 * Mark a CCT notification as read (per-user)
 */
router.patch('/:id/read', requireAuth, asyncHandler(async (req, res) => {
  try {
    const pool = getPool(req);
    const service = new CCTNotificationService(pool);
    const { id } = req.params;
    const userId = req.user?.email || req.user?.id?.toString();

    const notification = await service.markAsRead(id, userId);

    if (!notification) {
      return res.status(404).json({ error: 'Notification not found' });
    }

    // Get updated count for THIS user
    const count = await service.getUnreadCount(userId);

    // Note: WebSocket broadcast now sends per-user - each user needs their own count
    // The broadcast here is for the current user only
    const ws = global.websocket;
    if (ws && typeof ws.broadcastToUser === 'function') {
      ws.broadcastToUser(userId, 'cct_notification_count', { count });
    }

    res.json({ success: true, notification, unreadCount: count });
  } catch (error) {
    logger.error({ err: error }, '[CCT Notifications] Error marking as read');
    res.status(500).json({ error: 'Failed to mark notification as read' });
  }
}));

/**
 * Mark all CCT notifications as read (per-user)
 */
router.post('/mark-all-read', requireAuth, asyncHandler(async (req, res) => {
  try {
    const pool = getPool(req);
    const service = new CCTNotificationService(pool);
    const userId = req.user?.email || req.user?.id?.toString();

    const markedCount = await service.markAllAsRead(userId);

    // Note: WebSocket broadcast is per-user now
    const ws = global.websocket;
    if (ws && typeof ws.broadcastToUser === 'function') {
      ws.broadcastToUser(userId, 'cct_notification_count', { count: 0 });
    }

    res.json({ success: true, markedCount, unreadCount: 0 });
  } catch (error) {
    logger.error({ err: error }, '[CCT Notifications] Error marking all as read');
    res.status(500).json({ error: 'Failed to mark all notifications as read' });
  }
}));

/**
 * Restore a client from Won/Lost back to their previous pipeline stage
 */
router.post('/:id/restore', requireAuth, asyncHandler(async (req, res) => {
  try {
    const pool = getPool(req);
    const service = new CCTNotificationService(pool);
    const { id } = req.params;
    const userId = req.user?.email || req.user?.id?.toString();

    const result = await service.restoreClient(id, userId);

    res.json(result);
  } catch (error) {
    logger.error({ err: error }, '[CCT Notifications] Error restoring client');

    if (error.message === 'Notification not found') {
      return res.status(404).json({ error: error.message });
    }
    if (error.message === 'Client has already been restored') {
      return res.status(400).json({ error: error.message });
    }

    res.status(500).json({ error: 'Failed to restore client' });
  }
}));

/**
 * Trigger automation check (called on CCT page load)
 * Rate limited to once per 5 minutes per session
 */
router.post('/run-automations', requireAuth, asyncHandler(async (req, res) => {
  try {
    const pool = getPool(req);
    const clientConversionService = new ClientConversionService(pool);
    const notificationService = new CCTNotificationService(pool);

    // Run all automations
    const results = await clientConversionService.runAllAutomations();

    // Create notifications for each automation result
    const notifications = [];

    // 14-day timeout notifications
    if (results.fourteenDayTimeout?.clients) {
      for (const client of results.fourteenDayTimeout.clients) {
        // Check for duplicate before creating
        const isDupe = await notificationService.isDuplicateNotification(
          client.id,
          '14_day_timeout',
          24
        );

        if (!isDupe) {
          const notification = await notificationService.createNotification({
            type: 'auto_lost_14_day',
            title: `${client.name} moved to Lost`,
            body: '14 days in Waiting for Response with no progress',
            clientId: client.id,
            clientName: client.name,
            clientEmail: client.email,
            automationTrigger: '14_day_timeout',
            previousPipelineStageId: client.previousStageId,
            previousProspectStatus: client.previousStatus
          });
          notifications.push(notification);
        }
      }
    }

    // 30-day Building timeout notifications
    if (results.thirtyDayBuilding?.clients) {
      for (const client of results.thirtyDayBuilding.clients) {
        const isDupe = await notificationService.isDuplicateNotification(
          client.id,
          '30_day_building_timeout',
          24
        );

        if (!isDupe) {
          const notification = await notificationService.createNotification({
            type: 'auto_lost_30_day_building',
            title: `${client.name} moved to Lost`,
            body: '30 days in Building status with no progress',
            clientId: client.id,
            clientName: client.name,
            clientEmail: client.email,
            automationTrigger: '30_day_building_timeout',
            previousPipelineStageId: client.previousStageId,
            previousProspectStatus: client.previousStatus
          });
          notifications.push(notification);
        }
      }
    }

    // 30-day post-trial timeout notifications
    if (results.thirtyDayTrial?.clients) {
      for (const client of results.thirtyDayTrial.clients) {
        const isDupe = await notificationService.isDuplicateNotification(
          client.id,
          '30_day_trial_timeout',
          24
        );

        if (!isDupe) {
          const notification = await notificationService.createNotification({
            type: 'auto_lost_30_day_trial',
            title: `${client.name} moved to Lost`,
            body: '30 days after trial with no conversion',
            clientId: client.id,
            clientName: client.name,
            clientEmail: client.email,
            automationTrigger: '30_day_trial_timeout',
            previousPipelineStageId: client.previousStageId,
            previousProspectStatus: client.previousStatus
          });
          notifications.push(notification);
        }
      }
    }

    // Auto-Won notifications
    if (results.autoWon?.clients) {
      for (const client of results.autoWon.clients) {
        const isDupe = await notificationService.isDuplicateNotification(
          client.id,
          'first_paid_lesson',
          24
        );

        if (!isDupe) {
          const notification = await notificationService.createNotification({
            type: 'auto_won',
            title: `${client.name} converted to Won`,
            body: 'Completed first paid lesson after trial',
            clientId: client.id,
            clientName: client.name,
            clientEmail: client.email,
            automationTrigger: 'first_paid_lesson',
            previousPipelineStageId: client.previousStageId,
            previousProspectStatus: client.previousStatus
          });
          notifications.push(notification);
        }
      }
    }

    // Get count for this user (per-user read state)
    const userId = req.user?.email || req.user?.id?.toString();
    const count = await notificationService.getUnreadCount(userId);

    // Note: For new notifications, all users will see them since they haven't dismissed yet
    // No need to broadcast - each user's count is fetched when they load the page

    res.json({
      success: true,
      processed: results.totalProcessed,
      notificationsCreated: notifications.length,
      unreadCount: count,
      details: {
        fourteenDayTimeout: results.fourteenDayTimeout?.count || 0,
        thirtyDayBuilding: results.thirtyDayBuilding?.count || 0,
        thirtyDayTrial: results.thirtyDayTrial?.count || 0,
        autoWon: results.autoWon?.count || 0
      }
    });
  } catch (error) {
    logger.error({ err: error }, '[CCT Notifications] Error running automations');
    res.status(500).json({ error: 'Failed to run automations' });
  }
}));

module.exports = router;
