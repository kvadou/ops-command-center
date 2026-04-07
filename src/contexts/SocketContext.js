/**
 * SocketContext - React Context for WebSocket Connection
 * 
 * Provides real-time communication capabilities throughout the app.
 * Handles connection management, room subscriptions, and event handling.
 * 
 * Usage:
 *   const { socket, isConnected, subscribe, unsubscribe, on, off } = useSocket();
 */

import React, { createContext, useContext, useEffect, useState, useCallback, useRef, useMemo } from 'react';
import { io } from 'socket.io-client';

const SocketContext = createContext(null);

// Socket.io connection options
const SOCKET_OPTIONS = {
  autoConnect: false,
  reconnection: true,
  reconnectionAttempts: 10,
  reconnectionDelay: 1000,
  reconnectionDelayMax: 5000,
  timeout: 20000,
  transports: ['websocket', 'polling']
};

export function SocketProvider({ children }) {
  const [socket, setSocket] = useState(null);
  const [isConnected, setIsConnected] = useState(false);
  const [connectionError, setConnectionError] = useState(null);
  const subscribedRooms = useRef(new Set());
  const eventHandlers = useRef(new Map());

  // Initialize socket connection
  useEffect(() => {
    // Determine socket URL based on environment
    // Socket.io server runs on the backend (port 5001), not the Vite dev server (port 3001)
    const socketUrl = window.location.hostname === 'localhost'
      ? 'http://localhost:5001'
      : window.location.origin;

    const newSocket = io(socketUrl, {
      ...SOCKET_OPTIONS,
      withCredentials: true, // send httpOnly cookies with WebSocket handshake
    });

    // Connection event handlers
    newSocket.on('connect', () => {
      console.log('[Socket] Connected:', newSocket.id);
      setIsConnected(true);
      setConnectionError(null);

      // Re-subscribe to rooms after reconnection
      subscribedRooms.current.forEach(room => {
        newSocket.emit('subscribe', room);
      });
    });

    newSocket.on('disconnect', (reason) => {
      console.log('[Socket] Disconnected:', reason);
      setIsConnected(false);
    });

    newSocket.on('connect_error', (error) => {
      console.error('[Socket] Connection error:', error.message);
      setConnectionError(error.message);
      setIsConnected(false);
    });

    newSocket.on('reconnect_attempt', (attempt) => {
      console.log('[Socket] Reconnection attempt:', attempt);
    });

    newSocket.on('reconnect', (attempt) => {
      console.log('[Socket] Reconnected after', attempt, 'attempts');
    });

    // Connect the socket
    newSocket.connect();
    setSocket(newSocket);

    // Cleanup on unmount
    return () => {
      console.log('[Socket] Cleaning up connection');
      newSocket.disconnect();
    };
  }, []);

  /**
   * Subscribe to a room
   */
  const subscribe = useCallback((rooms) => {
    if (!socket) return;

    const roomList = Array.isArray(rooms) ? rooms : [rooms];
    roomList.forEach(room => {
      if (!subscribedRooms.current.has(room)) {
        subscribedRooms.current.add(room);
        socket.emit('subscribe', room);
        console.log('[Socket] Subscribed to:', room);
      }
    });
  }, [socket]);

  /**
   * Unsubscribe from a room
   */
  const unsubscribe = useCallback((rooms) => {
    if (!socket) return;

    const roomList = Array.isArray(rooms) ? rooms : [rooms];
    roomList.forEach(room => {
      subscribedRooms.current.delete(room);
      socket.emit('unsubscribe', room);
      console.log('[Socket] Unsubscribed from:', room);
    });
  }, [socket]);

  /**
   * Register an event handler
   */
  const on = useCallback((event, handler) => {
    if (!socket) return () => {};

    // Store handler reference for cleanup
    if (!eventHandlers.current.has(event)) {
      eventHandlers.current.set(event, new Set());
    }
    eventHandlers.current.get(event).add(handler);

    socket.on(event, handler);

    // Return cleanup function
    return () => {
      socket.off(event, handler);
      eventHandlers.current.get(event)?.delete(handler);
    };
  }, [socket]);

  /**
   * Remove an event handler
   */
  const off = useCallback((event, handler) => {
    if (!socket) return;

    socket.off(event, handler);
    eventHandlers.current.get(event)?.delete(handler);
  }, [socket]);

  /**
   * Emit an event
   */
  const emit = useCallback((event, data) => {
    if (!socket || !isConnected) {
      console.warn('[Socket] Cannot emit - not connected');
      return;
    }
    socket.emit(event, data);
  }, [socket, isConnected]);

  /**
   * Send typing indicator
   */
  const sendTyping = useCallback((postId, isTyping) => {
    emit('typing', { postId, isTyping });
  }, [emit]);

  const contextValue = useMemo(() => ({
    socket,
    isConnected,
    connectionError,
    subscribe,
    unsubscribe,
    on,
    off,
    emit,
    sendTyping,
    subscribedRooms: subscribedRooms.current
  }), [socket, isConnected, connectionError, subscribe, unsubscribe, on, off, emit, sendTyping]);

  return (
    <SocketContext.Provider value={contextValue}>
      {children}
    </SocketContext.Provider>
  );
}

/**
 * Hook to access socket context
 */
export function useSocket() {
  const context = useContext(SocketContext);
  if (!context) {
    // Return a no-op version if used outside provider
    return {
      socket: null,
      isConnected: false,
      connectionError: null,
      subscribe: () => {},
      unsubscribe: () => {},
      on: () => () => {},
      off: () => {},
      emit: () => {},
      sendTyping: () => {},
      subscribedRooms: new Set()
    };
  }
  return context;
}

/**
 * Hook for subscribing to feed updates
 */
export function useFeedSubscription(feedRooms = []) {
  const { subscribe, unsubscribe, on, isConnected } = useSocket();
  const [newPosts, setNewPosts] = useState([]);
  const [updatedPosts, setUpdatedPosts] = useState([]);
  const [deletedPostIds, setDeletedPostIds] = useState([]);

  useEffect(() => {
    if (!isConnected || feedRooms.length === 0) return;

    // Subscribe to feed rooms
    subscribe(feedRooms);

    // Handle new posts
    const cleanupNewPost = on('new_post', (data) => {
      console.log('[Feed] New post received:', data);
      setNewPosts(prev => [data.post, ...prev]);
    });

    // Handle post updates
    const cleanupPostUpdate = on('post_updated', (data) => {
      console.log('[Feed] Post updated:', data);
      setUpdatedPosts(prev => [...prev, data.post]);
    });

    // Handle post deletions
    const cleanupPostDelete = on('post_deleted', (data) => {
      console.log('[Feed] Post deleted:', data);
      setDeletedPostIds(prev => [...prev, data.postId]);
    });

    return () => {
      unsubscribe(feedRooms);
      cleanupNewPost();
      cleanupPostUpdate();
      cleanupPostDelete();
    };
  }, [isConnected, feedRooms.join(','), subscribe, unsubscribe, on]);

  // Clear functions for when posts are processed
  const clearNewPosts = useCallback(() => setNewPosts([]), []);
  const clearUpdatedPosts = useCallback(() => setUpdatedPosts([]), []);
  const clearDeletedPostIds = useCallback(() => setDeletedPostIds([]), []);

  return {
    newPosts,
    updatedPosts,
    deletedPostIds,
    clearNewPosts,
    clearUpdatedPosts,
    clearDeletedPostIds
  };
}

/**
 * Hook for notification updates
 */
export function useNotificationSocket() {
  const { on, isConnected } = useSocket();
  const [notifications, setNotifications] = useState([]);
  const [unreadCount, setUnreadCount] = useState(0);

  useEffect(() => {
    if (!isConnected) return;

    // Handle new notifications
    const cleanupNotification = on('notification', (data) => {
      console.log('[Notification] New notification:', data);
      setNotifications(prev => [data.notification, ...prev]);
      setUnreadCount(prev => prev + 1);
    });

    // Handle notification count updates
    const cleanupCount = on('notification_count', (data) => {
      setUnreadCount(data.count);
    });

    return () => {
      cleanupNotification();
      cleanupCount();
    };
  }, [isConnected, on]);

  const clearNotification = useCallback((notificationId) => {
    setNotifications(prev => prev.filter(n => n.id !== notificationId));
  }, []);

  const markAsRead = useCallback(() => {
    setUnreadCount(0);
  }, []);

  return {
    notifications,
    unreadCount,
    clearNotification,
    markAsRead,
    setUnreadCount
  };
}

/**
 * Hook for comment/reaction real-time updates on a specific post
 */
export function usePostRealtimeUpdates(postId) {
  const { subscribe, unsubscribe, on, isConnected } = useSocket();
  const [newComments, setNewComments] = useState([]);
  const [reactionUpdates, setReactionUpdates] = useState(null);
  const [typingUsers, setTypingUsers] = useState([]);

  useEffect(() => {
    if (!isConnected || !postId) return;

    const room = `post:${postId}`;
    subscribe(room);

    // Handle new comments
    const cleanupComment = on('new_comment', (data) => {
      if (data.postId === postId) {
        setNewComments(prev => [...prev, data.comment]);
      }
    });

    // Handle reaction updates
    const cleanupReaction = on('reaction_updated', (data) => {
      if (data.postId === postId) {
        setReactionUpdates(data);
      }
    });

    // Handle typing indicators
    const cleanupTyping = on('user_typing', (data) => {
      if (data.postId === postId) {
        setTypingUsers(prev => {
          if (data.isTyping) {
            // Add user if not already in list
            if (!prev.find(u => u.userId === data.userId)) {
              return [...prev, { userId: data.userId, userName: data.userName }];
            }
            return prev;
          } else {
            // Remove user
            return prev.filter(u => u.userId !== data.userId);
          }
        });
      }
    });

    return () => {
      unsubscribe(room);
      cleanupComment();
      cleanupReaction();
      cleanupTyping();
    };
  }, [isConnected, postId, subscribe, unsubscribe, on]);

  const clearNewComments = useCallback(() => setNewComments([]), []);

  return {
    newComments,
    reactionUpdates,
    typingUsers,
    clearNewComments
  };
}

export default SocketContext;

