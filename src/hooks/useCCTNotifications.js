/**
 * useCCTNotifications Hook
 *
 * Manages CCT notification state and API interactions.
 * CCT notifications have per-user read state (each user dismisses independently).
 */

import { useState, useCallback, useEffect, useRef } from 'react';
import axios from 'axios';

// Rate limit automation check to once per 5 minutes
const AUTOMATION_CHECK_INTERVAL = 5 * 60 * 1000;

export function useCCTNotifications() {
  const [notifications, setNotifications] = useState([]);
  const [unreadCount, setUnreadCount] = useState(0);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [pagination, setPagination] = useState({
    page: 1,
    limit: 20,
    total: 0,
    totalPages: 0,
    hasMore: false
  });

  const lastAutomationCheck = useRef(null);

  /**
   * Fetch notifications from API
   */
  const fetchNotifications = useCallback(async (page = 1, append = false) => {
    setLoading(true);
    setError(null);

    try {
      const response = await axios.get('/api/cct/notifications', {
        params: { page, limit: 20 }
      });

      const { notifications: newNotifications, pagination: newPagination } = response.data;

      if (append) {
        setNotifications(prev => [...prev, ...newNotifications]);
      } else {
        setNotifications(newNotifications);
      }

      setPagination(newPagination);
    } catch (err) {
      console.error('[CCT Notifications] Error fetching:', err);
      setError('Failed to load notifications');
    } finally {
      setLoading(false);
    }
  }, []);

  /**
   * Fetch unread count
   */
  const fetchUnreadCount = useCallback(async () => {
    try {
      const response = await axios.get('/api/cct/notifications/count');
      setUnreadCount(response.data.count);
    } catch (err) {
      console.error('[CCT Notifications] Error fetching count:', err);
    }
  }, []);

  /**
   * Mark a notification as read
   */
  const markAsRead = useCallback(async (notificationId) => {
    try {
      const response = await axios.patch(`/api/cct/notifications/${notificationId}/read`);

      // Update local state
      setNotifications(prev =>
        prev.map(n =>
          n.id === notificationId
            ? { ...n, read_at: new Date().toISOString() }
            : n
        )
      );

      setUnreadCount(response.data.unreadCount);

      return response.data;
    } catch (err) {
      console.error('[CCT Notifications] Error marking as read:', err);
      throw err;
    }
  }, []);

  /**
   * Mark all notifications as read
   */
  const markAllAsRead = useCallback(async () => {
    try {
      const response = await axios.post('/api/cct/notifications/mark-all-read');

      // Update local state
      setNotifications(prev =>
        prev.map(n => ({ ...n, read_at: n.read_at || new Date().toISOString() }))
      );

      setUnreadCount(0);

      return response.data;
    } catch (err) {
      console.error('[CCT Notifications] Error marking all as read:', err);
      throw err;
    }
  }, []);

  /**
   * Restore a client from Won/Lost back to previous stage
   */
  const restoreClient = useCallback(async (notificationId) => {
    try {
      const response = await axios.post(`/api/cct/notifications/${notificationId}/restore`);

      // Update local notification to show it's been restored
      setNotifications(prev =>
        prev.map(n =>
          n.id === notificationId
            ? { ...n, restored_at: new Date().toISOString() }
            : n
        )
      );

      // Refresh notifications to get the new "restored" notification
      await fetchNotifications(1);
      await fetchUnreadCount();

      return response.data;
    } catch (err) {
      console.error('[CCT Notifications] Error restoring client:', err);
      throw err;
    }
  }, [fetchNotifications, fetchUnreadCount]);

  /**
   * Trigger automation check (rate limited)
   */
  const triggerAutomationCheck = useCallback(async (force = false) => {
    const now = Date.now();

    // Check rate limit unless forced
    if (!force && lastAutomationCheck.current) {
      const timeSinceLastCheck = now - lastAutomationCheck.current;
      if (timeSinceLastCheck < AUTOMATION_CHECK_INTERVAL) {
        console.log('[CCT Notifications] Skipping automation check (rate limited)');
        return null;
      }
    }

    try {
      console.log('[CCT Notifications] Running automation check...');
      lastAutomationCheck.current = now;

      const response = await axios.post('/api/cct/notifications/run-automations');

      // Update unread count from response
      setUnreadCount(response.data.unreadCount);

      // If new notifications were created, refresh the list
      if (response.data.notificationsCreated > 0) {
        await fetchNotifications(1);
      }

      return response.data;
    } catch (err) {
      console.error('[CCT Notifications] Error running automations:', err);
      return null;
    }
  }, [fetchNotifications]);

  /**
   * Load more notifications (pagination)
   */
  const loadMore = useCallback(async () => {
    if (!pagination.hasMore || loading) return;

    await fetchNotifications(pagination.page + 1, true);
  }, [pagination.hasMore, pagination.page, loading, fetchNotifications]);

  /**
   * Add a new notification (for real-time updates via WebSocket)
   */
  const addNotification = useCallback((notification) => {
    setNotifications(prev => [notification, ...prev]);
    setUnreadCount(prev => prev + 1);
  }, []);

  /**
   * Update count (for WebSocket updates)
   */
  const updateCount = useCallback((count) => {
    setUnreadCount(count);
  }, []);

  return {
    // State
    notifications,
    unreadCount,
    loading,
    error,
    pagination,

    // Actions
    fetchNotifications,
    fetchUnreadCount,
    markAsRead,
    markAllAsRead,
    restoreClient,
    triggerAutomationCheck,
    loadMore,

    // For WebSocket integration
    addNotification,
    updateCount
  };
}
