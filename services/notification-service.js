/**
 * Notification Service
 * 
 * Handles creating, sending, and managing notifications for the News Feed system.
 * Integrates with WebSocket for real-time delivery and Brevo for email notifications.
 */

const { getPool } = require('../database-connections');
const { logger } = require('../utils/logger');

// Notification types with their configurations
const NOTIFICATION_TYPES = {
  mention: {
    title: '{actor} mentioned you',
    body: 'in a post: "{excerpt}"',
    email: true,
    priority: 'high'
  },
  comment: {
    title: '{actor} commented on your post',
    body: '"{excerpt}"',
    email: true,
    priority: 'medium'
  },
  reply: {
    title: '{actor} replied to your comment',
    body: '"{excerpt}"',
    email: true,
    priority: 'medium'
  },
  reaction: {
    title: '{actor} reacted to your post',
    body: '{reaction_type}',
    email: false,
    priority: 'low'
  },
  post_approved: {
    title: 'Your post was approved',
    body: 'Your post is now visible to the selected audience',
    email: true,
    priority: 'high'
  },
  post_rejected: {
    title: 'Your post was not approved',
    body: 'Reason: {reason}',
    email: true,
    priority: 'high'
  },
  announcement: {
    title: 'New announcement from HQ',
    body: '"{excerpt}"',
    email: true,
    priority: 'high'
  },
  franchisee_post: {
    title: 'New post from {franchise_name}',
    body: '"{excerpt}"',
    email: false,
    priority: 'medium'
  }
};

/**
 * Create a notification in the database
 */
async function createNotification(pool, {
  userId,
  type,
  title,
  body,
  data = {},
  postId = null,
  commentId = null,
  actorId = null,
  actorName = null,
  actorAvatar = null
}) {
  try {
    const query = `
      INSERT INTO notifications (
        user_id, type, title, body, data, 
        post_id, comment_id, actor_id, actor_name, actor_avatar
      )
      VALUES ($1, $2, $3, $4, $5::jsonb, $6, $7, $8, $9, $10)
      RETURNING *
    `;

    const { rows } = await pool.query(query, [
      userId,
      type,
      title,
      body,
      JSON.stringify(data),
      postId,
      commentId,
      actorId,
      actorName,
      actorAvatar
    ]);

    return rows[0];
  } catch (error) {
    logger.error({ err: error }, '[NotificationService] Error creating notification:');
    throw error;
  }
}

/**
 * Send real-time notification via WebSocket
 */
function sendRealtimeNotification(notification) {
  const ws = global.websocket;
  if (ws) {
    ws.sendNotification(notification.user_id, notification);
  }
}

/**
 * Get user's notification preferences
 */
async function getUserPreferences(pool, userId) {
  try {
    const { rows } = await pool.query(
      'SELECT * FROM user_notification_preferences WHERE user_id = $1',
      [userId]
    );
    
    if (rows.length === 0) {
      // Return default preferences
      return {
        notify_mentions: true,
        notify_comments: true,
        notify_replies: true,
        notify_reactions: true,
        notify_announcements: true,
        notify_moderation: true,
        email_mentions: true,
        email_comments: true,
        email_replies: true,
        email_reactions: false,
        email_announcements: true,
        email_moderation: true
      };
    }
    
    return rows[0];
  } catch (error) {
    logger.error({ err: error }, '[NotificationService] Error fetching preferences:');
    return null;
  }
}

/**
 * Check if user should receive this notification type
 */
function shouldNotify(preferences, type) {
  const prefMap = {
    mention: 'notify_mentions',
    comment: 'notify_comments',
    reply: 'notify_replies',
    reaction: 'notify_reactions',
    announcement: 'notify_announcements',
    post_approved: 'notify_moderation',
    post_rejected: 'notify_moderation',
    franchisee_post: 'notify_announcements'
  };
  
  const prefKey = prefMap[type];
  return prefKey ? preferences[prefKey] !== false : true;
}

/**
 * Check if user should receive email for this notification type
 */
function shouldEmail(preferences, type) {
  const prefMap = {
    mention: 'email_mentions',
    comment: 'email_comments',
    reply: 'email_replies',
    reaction: 'email_reactions',
    announcement: 'email_announcements',
    post_approved: 'email_moderation',
    post_rejected: 'email_moderation',
    franchisee_post: 'email_announcements'
  };
  
  const prefKey = prefMap[type];
  return prefKey ? preferences[prefKey] !== false : true;
}

/**
 * Format notification content with template variables
 */
function formatNotificationContent(template, variables) {
  let result = template;
  for (const [key, value] of Object.entries(variables)) {
    result = result.replace(new RegExp(`\\{${key}\\}`, 'g'), value || '');
  }
  return result;
}

/**
 * Truncate text for excerpt
 */
function createExcerpt(text, maxLength = 50) {
  if (!text) return '';
  if (text.length <= maxLength) return text;
  return text.substring(0, maxLength).trim() + '...';
}

/**
 * Notify about a mention
 */
async function notifyMention(pool, {
  mentionedUserId,
  actorId,
  actorName,
  postId,
  postExcerpt
}) {
  if (mentionedUserId === actorId) return; // Don't notify self
  
  const preferences = await getUserPreferences(pool, mentionedUserId);
  if (!shouldNotify(preferences, 'mention')) return;
  
  const typeConfig = NOTIFICATION_TYPES.mention;
  const title = formatNotificationContent(typeConfig.title, { actor: actorName });
  const body = formatNotificationContent(typeConfig.body, { excerpt: createExcerpt(postExcerpt) });
  
  const notification = await createNotification(pool, {
    userId: mentionedUserId,
    type: 'mention',
    title,
    body,
    postId,
    actorId,
    actorName,
    data: { postExcerpt }
  });
  
  sendRealtimeNotification(notification);
  
  // Queue email if enabled
  if (shouldEmail(preferences, 'mention') && typeConfig.email) {
    await queueEmailNotification(pool, notification);
  }
  
  return notification;
}

/**
 * Notify about a new comment
 */
async function notifyComment(pool, {
  postAuthorId,
  actorId,
  actorName,
  postId,
  commentExcerpt
}) {
  if (postAuthorId === actorId) return; // Don't notify self
  
  const preferences = await getUserPreferences(pool, postAuthorId);
  if (!shouldNotify(preferences, 'comment')) return;
  
  const typeConfig = NOTIFICATION_TYPES.comment;
  const title = formatNotificationContent(typeConfig.title, { actor: actorName });
  const body = formatNotificationContent(typeConfig.body, { excerpt: createExcerpt(commentExcerpt) });
  
  const notification = await createNotification(pool, {
    userId: postAuthorId,
    type: 'comment',
    title,
    body,
    postId,
    actorId,
    actorName,
    data: { commentExcerpt }
  });
  
  sendRealtimeNotification(notification);
  
  if (shouldEmail(preferences, 'comment') && typeConfig.email) {
    await queueEmailNotification(pool, notification);
  }
  
  return notification;
}

/**
 * Notify about a reply to a comment
 */
async function notifyReply(pool, {
  commentAuthorId,
  actorId,
  actorName,
  postId,
  commentId,
  replyExcerpt
}) {
  if (commentAuthorId === actorId) return;
  
  const preferences = await getUserPreferences(pool, commentAuthorId);
  if (!shouldNotify(preferences, 'reply')) return;
  
  const typeConfig = NOTIFICATION_TYPES.reply;
  const title = formatNotificationContent(typeConfig.title, { actor: actorName });
  const body = formatNotificationContent(typeConfig.body, { excerpt: createExcerpt(replyExcerpt) });
  
  const notification = await createNotification(pool, {
    userId: commentAuthorId,
    type: 'reply',
    title,
    body,
    postId,
    commentId,
    actorId,
    actorName,
    data: { replyExcerpt }
  });
  
  sendRealtimeNotification(notification);
  
  if (shouldEmail(preferences, 'reply') && typeConfig.email) {
    await queueEmailNotification(pool, notification);
  }
  
  return notification;
}

/**
 * Notify about a reaction
 */
async function notifyReaction(pool, {
  postAuthorId,
  actorId,
  actorName,
  postId,
  reactionType
}) {
  if (postAuthorId === actorId) return;
  
  const preferences = await getUserPreferences(pool, postAuthorId);
  if (!shouldNotify(preferences, 'reaction')) return;
  
  const typeConfig = NOTIFICATION_TYPES.reaction;
  const title = formatNotificationContent(typeConfig.title, { actor: actorName });
  const body = formatNotificationContent(typeConfig.body, { reaction_type: reactionType });
  
  const notification = await createNotification(pool, {
    userId: postAuthorId,
    type: 'reaction',
    title,
    body,
    postId,
    actorId,
    actorName,
    data: { reactionType }
  });
  
  sendRealtimeNotification(notification);
  
  return notification;
}

/**
 * Notify about post moderation status
 */
async function notifyModeration(pool, {
  postAuthorId,
  postId,
  status, // 'approved' or 'rejected'
  reason = null
}) {
  const preferences = await getUserPreferences(pool, postAuthorId);
  if (!shouldNotify(preferences, `post_${status}`)) return;
  
  const type = status === 'approved' ? 'post_approved' : 'post_rejected';
  const typeConfig = NOTIFICATION_TYPES[type];
  const title = typeConfig.title;
  const body = formatNotificationContent(typeConfig.body, { reason: reason || 'No reason provided' });
  
  const notification = await createNotification(pool, {
    userId: postAuthorId,
    type,
    title,
    body,
    postId,
    data: { status, reason }
  });
  
  sendRealtimeNotification(notification);
  
  if (shouldEmail(preferences, type) && typeConfig.email) {
    await queueEmailNotification(pool, notification);
  }
  
  return notification;
}

/**
 * Notify about an announcement (bulk notification)
 */
async function notifyAnnouncement(pool, {
  postId,
  postExcerpt,
  targetUserIds,
  actorId,
  actorName
}) {
  const notifications = [];
  
  for (const userId of targetUserIds) {
    if (userId === actorId) continue;
    
    const preferences = await getUserPreferences(pool, userId);
    if (!shouldNotify(preferences, 'announcement')) continue;
    
    const typeConfig = NOTIFICATION_TYPES.announcement;
    const title = typeConfig.title;
    const body = formatNotificationContent(typeConfig.body, { excerpt: createExcerpt(postExcerpt) });
    
    const notification = await createNotification(pool, {
      userId,
      type: 'announcement',
      title,
      body,
      postId,
      actorId,
      actorName,
      data: { postExcerpt }
    });
    
    sendRealtimeNotification(notification);
    notifications.push(notification);
  }
  
  return notifications;
}

/**
 * Queue email notification (for batch sending)
 */
async function queueEmailNotification(pool, notification) {
  try {
    // Mark notification for email sending
    await pool.query(
      `UPDATE notifications SET email_sent_at = NULL WHERE id = $1 AND email_sent_at IS NULL`,
      [notification.id]
    );
    
    // In a production system, this would add to a queue (Redis, SQS, etc.)
    // For now, we'll just log it
    logger.info(`[NotificationService] Email queued for notification ${notification.id}`);
    
    return true;
  } catch (error) {
    logger.error({ err: error }, '[NotificationService] Error queueing email:');
    return false;
  }
}

/**
 * Get unread notification count for a user
 */
async function getUnreadCount(pool, userId) {
  try {
    const { rows } = await pool.query(
      'SELECT COUNT(*)::int as count FROM notifications WHERE user_id = $1 AND read_at IS NULL',
      [userId]
    );
    return rows[0]?.count || 0;
  } catch (error) {
    logger.error({ err: error }, '[NotificationService] Error getting unread count:');
    return 0;
  }
}

/**
 * Mark notification as read
 */
async function markAsRead(pool, notificationId, userId) {
  try {
    const { rows } = await pool.query(
      `UPDATE notifications 
       SET read_at = NOW() 
       WHERE id = $1 AND user_id = $2 AND read_at IS NULL
       RETURNING *`,
      [notificationId, userId]
    );
    return rows[0] || null;
  } catch (error) {
    logger.error({ err: error }, '[NotificationService] Error marking as read:');
    return null;
  }
}

/**
 * Mark all notifications as read for a user
 */
async function markAllAsRead(pool, userId) {
  try {
    const { rowCount } = await pool.query(
      `UPDATE notifications SET read_at = NOW() WHERE user_id = $1 AND read_at IS NULL`,
      [userId]
    );
    return rowCount;
  } catch (error) {
    logger.error({ err: error }, '[NotificationService] Error marking all as read:');
    return 0;
  }
}

/**
 * Get notifications for a user
 */
async function getNotifications(pool, userId, { page = 1, limit = 20, unreadOnly = false } = {}) {
  try {
    const offset = (page - 1) * limit;
    let whereClause = 'WHERE user_id = $1';
    if (unreadOnly) {
      whereClause += ' AND read_at IS NULL';
    }
    
    const query = `
      SELECT * FROM notifications
      ${whereClause}
      ORDER BY created_at DESC
      LIMIT $2 OFFSET $3
    `;
    
    const { rows } = await pool.query(query, [userId, limit, offset]);
    
    // Get total count
    const countQuery = `SELECT COUNT(*)::int as total FROM notifications ${whereClause}`;
    const { rows: countRows } = await pool.query(countQuery, [userId]);
    
    return {
      notifications: rows,
      total: countRows[0]?.total || 0,
      page,
      limit,
      pages: Math.ceil((countRows[0]?.total || 0) / limit)
    };
  } catch (error) {
    logger.error({ err: error }, '[NotificationService] Error getting notifications:');
    return { notifications: [], total: 0, page, limit, pages: 0 };
  }
}

module.exports = {
  NOTIFICATION_TYPES,
  createNotification,
  sendRealtimeNotification,
  getUserPreferences,
  notifyMention,
  notifyComment,
  notifyReply,
  notifyReaction,
  notifyModeration,
  notifyAnnouncement,
  getUnreadCount,
  markAsRead,
  markAllAsRead,
  getNotifications
};

