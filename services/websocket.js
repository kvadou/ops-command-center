/**
 * WebSocket Service for News Feed Real-Time Updates
 * 
 * Uses Socket.io for real-time communication between server and clients.
 * Supports room-based architecture for branch-specific feeds.
 * 
 * Rooms:
 *   - feed:main - Main/HQ feed updates
 *   - feed:eastside - Eastside franchise feed
 *   - feed:westside - Westside franchise feed
 *   - feed:tutors - Tutor community feed
 *   - user:{userId} - Personal notifications
 * 
 * Events:
 *   - new_post - New post created
 *   - post_updated - Post edited/moderated
 *   - post_deleted - Post removed
 *   - new_comment - Comment added
 *   - new_reaction - Reaction added/removed
 *   - notification - Personal notification
 *   - typing - User typing indicator
 */

const { Server } = require('socket.io');
const jwt = require('jsonwebtoken');
const { logger } = require('../utils/logger');

let io = null;

/**
 * Initialize Socket.io server
 * @param {object} httpServer - HTTP server instance
 * @returns {Server} Socket.io server instance
 */
function initializeWebSocket(httpServer) {
  io = new Server(httpServer, {
    cors: {
      origin: [
        'http://localhost:3000',
        'http://localhost:3001',  // Vite dev server
        'http://localhost:5173',
        'https://acme-ops-main.herokuapp.com',
        'https://story-time-staging.herokuapp.com',
        'https://acmeops-westside.herokuapp.com',
        'https://acmeops-eastside.herokuapp.com',
        /\.acmeops\.com$/
      ],
      methods: ['GET', 'POST'],
      credentials: true
    },
    pingTimeout: 60000,
    pingInterval: 25000
  });

  // Authentication middleware — supports cookie, auth object, or query param
  io.use((socket, next) => {
    // Extract token from cookie header (httpOnly cookies come through handshake headers)
    const cookieHeader = socket.handshake.headers?.cookie || '';
    const tokenFromCookie = cookieHeader.split(';').map(c => c.trim()).find(c => c.startsWith('token='))?.split('=')[1];
    const token = tokenFromCookie || socket.handshake.auth.token || socket.handshake.query.token;
    
    if (!token) {
      // Allow anonymous connections for public feeds
      socket.user = { id: 'anonymous', role: 'guest' };
      return next();
    }

    try {
      const decoded = jwt.verify(token, process.env.JWT_SECRET || 'acme-ops-secret');
      socket.user = decoded;
      next();
    } catch (err) {
      // Invalid token, but allow connection as guest
      socket.user = { id: 'anonymous', role: 'guest' };
      next();
    }
  });

  // Connection handler
  io.on('connection', (socket) => {
    const userId = socket.user?.id || socket.user?.email || 'anonymous';
    logger.info(`[WebSocket] User connected: ${userId}, Socket: ${socket.id}`);

    // Join personal room for notifications
    if (userId !== 'anonymous') {
      socket.join(`user:${userId}`);
    }

    // Handle room subscriptions
    socket.on('subscribe', (rooms) => {
      const roomList = Array.isArray(rooms) ? rooms : [rooms];
      roomList.forEach(room => {
        if (isValidRoom(room, socket.user)) {
          socket.join(room);
          logger.info(`[WebSocket] ${userId} joined room: ${room}`);
        }
      });
    });

    socket.on('unsubscribe', (rooms) => {
      const roomList = Array.isArray(rooms) ? rooms : [rooms];
      roomList.forEach(room => {
        socket.leave(room);
        logger.info(`[WebSocket] ${userId} left room: ${room}`);
      });
    });

    // Handle typing indicators
    socket.on('typing', (data) => {
      const { postId, isTyping } = data;
      socket.to(`post:${postId}`).emit('user_typing', {
        userId,
        userName: socket.user?.name || socket.user?.email?.split('@')[0] || 'Someone',
        postId,
        isTyping
      });
    });

    // Handle disconnect
    socket.on('disconnect', (reason) => {
      logger.info(`[WebSocket] User disconnected: ${userId}, Reason: ${reason}`);
    });

    // Handle errors
    socket.on('error', (error) => {
      logger.error({ err: error }, `[WebSocket] Socket error for ${userId}:`);
    });
  });

  logger.info('[WebSocket] Socket.io server initialized');
  return io;
}

/**
 * Validate if user can join a room
 */
function isValidRoom(room, user) {
  // Public rooms anyone can join
  const publicRooms = ['feed:public'];
  if (publicRooms.includes(room)) return true;

  // Guest users can only join public rooms
  if (user.role === 'guest' || user.id === 'anonymous') {
    return publicRooms.includes(room);
  }

  // Branch-specific rooms
  if (room.startsWith('feed:')) {
    return true; // Let visibility logic handle what they see
  }

  // Personal notification room
  if (room.startsWith('user:')) {
    const roomUserId = room.replace('user:', '');
    return roomUserId === user.id || roomUserId === user.email;
  }

  // Post-specific rooms for comments
  if (room.startsWith('post:')) {
    return true;
  }

  // Marketing Command Center rooms - authenticated users only
  if (room.startsWith('marketing:')) {
    return user.id !== 'anonymous';
  }

  return false;
}

/**
 * Get the Socket.io server instance
 */
function getIO() {
  if (!io) {
    logger.warn('[WebSocket] Socket.io not initialized yet');
  }
  return io;
}

// =====================
// Broadcast Functions
// =====================

/**
 * Broadcast a new post to appropriate rooms
 */
function broadcastNewPost(post, targetRooms = []) {
  if (!io) return;

  const rooms = targetRooms.length > 0 ? targetRooms : getPostRooms(post);
  
  rooms.forEach(room => {
    io.to(room).emit('new_post', {
      type: 'new_post',
      post,
      timestamp: new Date().toISOString()
    });
  });

  logger.info(`[WebSocket] Broadcast new_post to rooms: ${rooms.join(', ')}`);
}

/**
 * Broadcast post update (edit, pin, moderation)
 */
function broadcastPostUpdate(post, action = 'updated') {
  if (!io) return;

  const rooms = getPostRooms(post);
  
  rooms.forEach(room => {
    io.to(room).emit('post_updated', {
      type: 'post_updated',
      action,
      post,
      timestamp: new Date().toISOString()
    });
  });
}

/**
 * Broadcast post deletion
 */
function broadcastPostDeleted(postId, branchId = null) {
  if (!io) return;

  const rooms = branchId ? [`feed:${branchId}`] : ['feed:main'];
  
  rooms.forEach(room => {
    io.to(room).emit('post_deleted', {
      type: 'post_deleted',
      postId,
      timestamp: new Date().toISOString()
    });
  });
}

/**
 * Broadcast new comment
 */
function broadcastNewComment(comment, post) {
  if (!io) return;

  // Notify the post room
  io.to(`post:${post.id}`).emit('new_comment', {
    type: 'new_comment',
    comment,
    postId: post.id,
    timestamp: new Date().toISOString()
  });

  // Also broadcast to feed rooms for comment count updates
  const rooms = getPostRooms(post);
  rooms.forEach(room => {
    io.to(room).emit('comment_count_updated', {
      postId: post.id,
      commentCount: (post.comment_count_cache || 0) + 1
    });
  });
}

/**
 * Broadcast new reaction
 */
function broadcastReactionUpdate(postId, reactions, userId) {
  if (!io) return;

  io.to(`post:${postId}`).emit('reaction_updated', {
    type: 'reaction_updated',
    postId,
    reactions,
    userId,
    timestamp: new Date().toISOString()
  });
}

/**
 * Send notification to specific user
 */
function sendNotification(userId, notification) {
  if (!io) return;

  io.to(`user:${userId}`).emit('notification', {
    type: 'notification',
    notification,
    timestamp: new Date().toISOString()
  });

  logger.info(`[WebSocket] Sent notification to user: ${userId}`);
}

/**
 * Broadcast notification count update
 */
function broadcastNotificationCount(userId, count) {
  if (!io) return;

  io.to(`user:${userId}`).emit('notification_count', {
    type: 'notification_count',
    count,
    timestamp: new Date().toISOString()
  });
}

/**
 * Get rooms for a post based on visibility
 */
function getPostRooms(post) {
  const rooms = [];
  
  switch (post.visibility_level) {
    case 'hq_only':
      rooms.push('feed:main');
      break;
    case 'franchisees':
      rooms.push('feed:franchisees', 'feed:main');
      break;
    case 'franchise_specific':
      if (post.branch_id) {
        rooms.push(`feed:${post.branch_id}`);
      }
      if (post.target_branches && Array.isArray(post.target_branches)) {
        post.target_branches.forEach(branch => rooms.push(`feed:${branch}`));
      }
      break;
    case 'tutors':
      rooms.push('feed:tutors');
      if (post.branch_id) {
        rooms.push(`feed:${post.branch_id}:tutors`);
      }
      break;
    case 'parents':
      if (post.branch_id) {
        rooms.push(`feed:${post.branch_id}:parents`);
      }
      break;
    case 'public':
      rooms.push('feed:public');
      break;
    case 'internal':
    default:
      rooms.push('feed:internal');
      if (post.branch_id) {
        rooms.push(`feed:${post.branch_id}`);
      }
      break;
  }

  return [...new Set(rooms)]; // Remove duplicates
}

/**
 * Get connected user count (for monitoring)
 */
function getConnectedUserCount() {
  if (!io) return 0;
  return io.engine.clientsCount;
}

/**
 * Get room member count
 */
async function getRoomMemberCount(room) {
  if (!io) return 0;
  const sockets = await io.in(room).allSockets();
  return sockets.size;
}

// =====================
// Marketing Command Center Real-Time Events
// =====================

/**
 * Broadcast marketing metrics update
 * Sent when ad spend data is refreshed or when significant changes occur
 */
function broadcastMarketingMetrics(metrics) {
  if (!io) return;

  io.to('marketing:dashboard').emit('metrics_update', {
    type: 'metrics_update',
    metrics,
    timestamp: new Date().toISOString()
  });

  logger.info('[WebSocket] Broadcast marketing metrics update');
}

/**
 * Broadcast new pending action
 * Sent when AI recommends a new action for approval
 */
function broadcastPendingAction(action) {
  if (!io) return;

  io.to('marketing:actions').emit('new_pending_action', {
    type: 'new_pending_action',
    action,
    timestamp: new Date().toISOString()
  });

  logger.info(`[WebSocket] Broadcast new pending action: ${action.id}`);
}

/**
 * Broadcast action status change
 * Sent when an action is approved, rejected, or executed
 */
function broadcastActionUpdate(action, status) {
  if (!io) return;

  io.to('marketing:actions').emit('action_updated', {
    type: 'action_updated',
    action,
    status,
    timestamp: new Date().toISOString()
  });

  logger.info(`[WebSocket] Broadcast action update: ${action.id} -> ${status}`);
}

/**
 * Broadcast campaign draft update
 */
function broadcastDraftUpdate(draft, action = 'updated') {
  if (!io) return;

  io.to('marketing:drafts').emit('draft_updated', {
    type: 'draft_updated',
    action,
    draft,
    timestamp: new Date().toISOString()
  });

  logger.info(`[WebSocket] Broadcast draft update: ${draft.id} -> ${action}`);
}

/**
 * Broadcast A/B test update
 */
function broadcastABTestUpdate(test, action = 'updated') {
  if (!io) return;

  io.to('marketing:ab-tests').emit('ab_test_updated', {
    type: 'ab_test_updated',
    action,
    test,
    timestamp: new Date().toISOString()
  });

  logger.info(`[WebSocket] Broadcast A/B test update: ${test.id} -> ${action}`);
}

/**
 * Broadcast report generation complete
 */
function broadcastReportReady(report) {
  if (!io) return;

  io.to('marketing:reports').emit('report_ready', {
    type: 'report_ready',
    report: {
      id: report.id,
      periodStart: report.period?.start,
      periodEnd: report.period?.end,
      generatedAt: report.generatedAt,
    },
    timestamp: new Date().toISOString()
  });

  logger.info('[WebSocket] Broadcast report ready');
}

/**
 * Broadcast real-time spend alert
 * Sent when spend exceeds threshold or anomaly detected
 */
function broadcastSpendAlert(alert) {
  if (!io) return;

  io.to('marketing:alerts').emit('spend_alert', {
    type: 'spend_alert',
    alert,
    timestamp: new Date().toISOString()
  });

  logger.info(`[WebSocket] Broadcast spend alert: ${alert.type}`);
}

module.exports = {
  initializeWebSocket,
  getIO,
  broadcastNewPost,
  broadcastPostUpdate,
  broadcastPostDeleted,
  broadcastNewComment,
  broadcastReactionUpdate,
  sendNotification,
  broadcastNotificationCount,
  getConnectedUserCount,
  getRoomMemberCount,
  // Marketing Command Center
  broadcastMarketingMetrics,
  broadcastPendingAction,
  broadcastActionUpdate,
  broadcastDraftUpdate,
  broadcastABTestUpdate,
  broadcastReportReady,
  broadcastSpendAlert,
};

