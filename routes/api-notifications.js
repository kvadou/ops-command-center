/**
 * Notifications API Routes
 * 
 * Handles fetching, reading, and managing user notifications.
 */

const express = require('express');
const router = express.Router();
const { requireAuth } = require('../middleware/auth');
const { getPool: getPoolByEnv } = require('../database-connections');
const notificationService = require('../services/notification-service');
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
 * Get notifications for current user
 */
router.get('/', requireAuth, asyncHandler(async (req, res) => {
  try {
    const pool = getPool(req);
    const userId = req.user?.id?.toString() || req.user?.email;
    const { page = 1, limit = 20, unread_only = 'false' } = req.query;
    
    const result = await notificationService.getNotifications(pool, userId, {
      page: parseInt(page),
      limit: parseInt(limit),
      unreadOnly: unread_only === 'true'
    });
    
    res.json(result);
  } catch (error) {
    logger.error({ err: error }, 'Error fetching notifications:');
    res.status(500).json({ error: 'Failed to fetch notifications' });
  }
}));

/**
 * Get unread notification count
 */
router.get('/count', requireAuth, asyncHandler(async (req, res) => {
  try {
    const pool = getPool(req);
    const userId = req.user?.id?.toString() || req.user?.email;
    
    const count = await notificationService.getUnreadCount(pool, userId);
    
    res.json({ count });
  } catch (error) {
    logger.error({ err: error }, 'Error fetching notification count:');
    res.status(500).json({ error: 'Failed to fetch notification count' });
  }
}));

/**
 * Mark a notification as read
 */
router.patch('/:id/read', requireAuth, asyncHandler(async (req, res) => {
  try {
    const pool = getPool(req);
    const { id } = req.params;
    const userId = req.user?.id?.toString() || req.user?.email;
    
    const notification = await notificationService.markAsRead(pool, id, userId);
    
    if (!notification) {
      return res.status(404).json({ error: 'Notification not found' });
    }
    
    // Update real-time count
    const ws = global.websocket;
    if (ws) {
      const count = await notificationService.getUnreadCount(pool, userId);
      ws.broadcastNotificationCount(userId, count);
    }
    
    res.json({ success: true, notification });
  } catch (error) {
    logger.error({ err: error }, 'Error marking notification as read:');
    res.status(500).json({ error: 'Failed to mark notification as read' });
  }
}));

/**
 * Mark all notifications as read
 */
router.post('/mark-all-read', requireAuth, asyncHandler(async (req, res) => {
  try {
    const pool = getPool(req);
    const userId = req.user?.id?.toString() || req.user?.email;
    
    const count = await notificationService.markAllAsRead(pool, userId);
    
    // Update real-time count
    const ws = global.websocket;
    if (ws) {
      ws.broadcastNotificationCount(userId, 0);
    }
    
    res.json({ success: true, marked_count: count });
  } catch (error) {
    logger.error({ err: error }, 'Error marking all notifications as read:');
    res.status(500).json({ error: 'Failed to mark notifications as read' });
  }
}));

/**
 * Get notification preferences
 */
router.get('/preferences', requireAuth, asyncHandler(async (req, res) => {
  try {
    const pool = getPool(req);
    const userId = req.user?.id?.toString() || req.user?.email;
    
    const preferences = await notificationService.getUserPreferences(pool, userId);
    
    res.json({ preferences });
  } catch (error) {
    logger.error({ err: error }, 'Error fetching notification preferences:');
    res.status(500).json({ error: 'Failed to fetch preferences' });
  }
}));

/**
 * Update notification preferences
 */
router.put('/preferences', requireAuth, asyncHandler(async (req, res) => {
  try {
    const pool = getPool(req);
    const userId = req.user?.id?.toString() || req.user?.email;
    const preferences = req.body;
    
    // Build update query dynamically based on provided fields
    const allowedFields = [
      'notify_mentions', 'notify_comments', 'notify_replies', 'notify_reactions',
      'notify_announcements', 'notify_moderation',
      'email_mentions', 'email_comments', 'email_replies', 'email_reactions',
      'email_announcements', 'email_moderation', 'email_digest', 'email_digest_frequency'
    ];
    
    const updates = [];
    const values = [userId];
    let paramCount = 1;
    
    for (const field of allowedFields) {
      if (preferences[field] !== undefined) {
        paramCount++;
        updates.push(`${field} = $${paramCount}`);
        values.push(preferences[field]);
      }
    }
    
    if (updates.length === 0) {
      return res.status(400).json({ error: 'No valid preferences provided' });
    }
    
    // Use UPSERT to create or update preferences
    const query = `
      INSERT INTO user_notification_preferences (user_id, ${allowedFields.filter(f => preferences[f] !== undefined).join(', ')})
      VALUES ($1, ${updates.map((_, i) => `$${i + 2}`).join(', ')})
      ON CONFLICT (user_id)
      DO UPDATE SET ${updates.join(', ')}, updated_at = NOW()
      RETURNING *
    `;
    
    const { rows } = await pool.query(query, values);
    
    res.json({ success: true, preferences: rows[0] });
  } catch (error) {
    logger.error({ err: error }, 'Error updating notification preferences:');
    res.status(500).json({ error: 'Failed to update preferences' });
  }
}));

/**
 * Delete a notification
 */
router.delete('/:id', requireAuth, asyncHandler(async (req, res) => {
  try {
    const pool = getPool(req);
    const { id } = req.params;
    const userId = req.user?.id?.toString() || req.user?.email;
    
    const { rowCount } = await pool.query(
      'DELETE FROM notifications WHERE id = $1 AND user_id = $2',
      [id, userId]
    );
    
    if (rowCount === 0) {
      return res.status(404).json({ error: 'Notification not found' });
    }
    
    res.json({ success: true });
  } catch (error) {
    logger.error({ err: error }, 'Error deleting notification:');
    res.status(500).json({ error: 'Failed to delete notification' });
  }
}));

module.exports = router;

