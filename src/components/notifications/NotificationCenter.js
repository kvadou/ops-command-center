/**
 * NotificationCenter - In-app notification dropdown
 * 
 * Displays notifications in a dropdown from the bell icon.
 * Integrates with WebSocket for real-time updates.
 */

import React, { useState, useEffect, useRef, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { useNotificationSocket } from '../../contexts/SocketContext';
import {
  BellIcon,
  CheckIcon,
  TrashIcon,
  ChatBubbleLeftIcon,
  AtSymbolIcon,
  HeartIcon,
  MegaphoneIcon,
  CheckCircleIcon,
  XCircleIcon,
  UserGroupIcon,
} from '@heroicons/react/24/outline';
import { BellIcon as BellIconSolid } from '@heroicons/react/24/solid';

// Notification type icons
const TYPE_ICONS = {
  mention: AtSymbolIcon,
  comment: ChatBubbleLeftIcon,
  reply: ChatBubbleLeftIcon,
  reaction: HeartIcon,
  post_approved: CheckCircleIcon,
  post_rejected: XCircleIcon,
  announcement: MegaphoneIcon,
  franchisee_post: UserGroupIcon,
};

// Notification type colors
const TYPE_COLORS = {
  mention: 'text-blue-500 bg-blue-50',
  comment: 'text-green-500 bg-green-50',
  reply: 'text-green-500 bg-green-50',
  reaction: 'text-pink-500 bg-pink-50',
  post_approved: 'text-emerald-500 bg-emerald-50',
  post_rejected: 'text-red-500 bg-red-50',
  announcement: 'text-purple-500 bg-purple-50',
  franchisee_post: 'text-indigo-500 bg-indigo-50',
};

const NotificationItem = ({ notification, onRead, onDelete, onClick }) => {
  const Icon = TYPE_ICONS[notification.type] || BellIcon;
  const colorClass = TYPE_COLORS[notification.type] || 'text-neutral-500 bg-neutral-50';
  const isUnread = !notification.read_at;

  const formatTime = (dateString) => {
    const date = new Date(dateString);
    const now = new Date();
    const diffMs = now - date;
    const diffMins = Math.floor(diffMs / 60000);
    const diffHours = Math.floor(diffMs / 3600000);
    const diffDays = Math.floor(diffMs / 86400000);

    if (diffMins < 1) return 'just now';
    if (diffMins < 60) return `${diffMins}m ago`;
    if (diffHours < 24) return `${diffHours}h ago`;
    if (diffDays < 7) return `${diffDays}d ago`;
    return date.toLocaleDateString();
  };

  return (
    <div
      className={`flex items-start gap-3 p-3 hover:bg-neutral-50 cursor-pointer transition-colors ${
        isUnread ? 'bg-brand-purple/5' : ''
      }`}
      onClick={() => onClick(notification)}
    >
      <div className={`p-2 rounded-full ${colorClass}`}>
        <Icon className="h-4 w-4" />
      </div>
      
      <div className="flex-1 min-w-0">
        <div className="flex items-start justify-between gap-2">
          <div>
            <p className={`text-sm ${isUnread ? 'font-semibold' : 'font-medium'} text-neutral-900`}>
              {notification.title}
            </p>
            {notification.body && (
              <p className="text-xs text-neutral-600 mt-0.5 line-clamp-2">
                {notification.body}
              </p>
            )}
          </div>
          {isUnread && (
            <div className="w-2 h-2 rounded-full bg-brand-purple flex-shrink-0 mt-1" />
          )}
        </div>
        <p className="text-xs text-neutral-400 mt-1">
          {formatTime(notification.created_at)}
        </p>
      </div>

      <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
        {isUnread && (
          <button
            onClick={(e) => {
              e.stopPropagation();
              onRead(notification.id);
            }}
            className="p-1 rounded hover:bg-neutral-100 text-neutral-400 hover:text-neutral-600"
            title="Mark as read"
          >
            <CheckIcon className="h-4 w-4" />
          </button>
        )}
        <button
          onClick={(e) => {
            e.stopPropagation();
            onDelete(notification.id);
          }}
          className="p-1 rounded hover:bg-neutral-100 text-neutral-400 hover:text-red-500"
          title="Delete"
        >
          <TrashIcon className="h-4 w-4" />
        </button>
      </div>
    </div>
  );
};

const NotificationCenter = ({ className = '' }) => {
  const [isOpen, setIsOpen] = useState(false);
  const [notifications, setNotifications] = useState([]);
  const [unreadCount, setUnreadCount] = useState(0);
  const [loading, setLoading] = useState(false);
  const [hasMore, setHasMore] = useState(true);
  const [page, setPage] = useState(1);
  const dropdownRef = useRef(null);
  const navigate = useNavigate();

  // WebSocket real-time notifications
  const { 
    notifications: realtimeNotifications, 
    unreadCount: realtimeUnreadCount,
    setUnreadCount: setRealtimeUnreadCount 
  } = useNotificationSocket();

  // Fetch notifications from API
  const fetchNotifications = useCallback(async (pageNum = 1, append = false) => {
    try {
      setLoading(true);
      const response = await fetch(`/api/notifications?page=${pageNum}&limit=20`, {
        credentials: 'include',
      });

      if (response.ok) {
        const data = await response.json();
        if (append) {
          setNotifications(prev => [...prev, ...data.notifications]);
        } else {
          setNotifications(data.notifications);
        }
        setHasMore(data.page < data.pages);
        setUnreadCount(data.notifications.filter(n => !n.read_at).length);
      }
    } catch (error) {
      console.error('Error fetching notifications:', error);
    } finally {
      setLoading(false);
    }
  }, []);

  // Fetch unread count
  const fetchUnreadCount = useCallback(async () => {
    try {
      const response = await fetch('/api/notifications/count', {
        credentials: 'include',
      });

      if (response.ok) {
        const data = await response.json();
        setUnreadCount(data.count);
      }
    } catch (error) {
      console.error('Error fetching unread count:', error);
    }
  }, []);

  // Initial fetch
  useEffect(() => {
    fetchUnreadCount();
  }, [fetchUnreadCount]);

  // Fetch notifications when dropdown opens
  useEffect(() => {
    if (isOpen) {
      setPage(1);
      fetchNotifications(1, false);
    }
  }, [isOpen, fetchNotifications]);

  // Handle real-time notifications
  useEffect(() => {
    if (realtimeNotifications.length > 0) {
      const newNotification = realtimeNotifications[0];
      setNotifications(prev => [newNotification, ...prev]);
      setUnreadCount(prev => prev + 1);
    }
  }, [realtimeNotifications]);

  // Update count from WebSocket
  useEffect(() => {
    if (realtimeUnreadCount !== undefined) {
      setUnreadCount(realtimeUnreadCount);
    }
  }, [realtimeUnreadCount]);

  // Close dropdown when clicking outside
  useEffect(() => {
    const handleClickOutside = (event) => {
      if (dropdownRef.current && !dropdownRef.current.contains(event.target)) {
        setIsOpen(false);
      }
    };

    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  // Mark notification as read
  const handleMarkAsRead = async (notificationId) => {
    try {
      const response = await fetch(`/api/notifications/${notificationId}/read`, {
        method: 'PATCH',
        credentials: 'include',
      });

      if (response.ok) {
        setNotifications(prev =>
          prev.map(n =>
            n.id === notificationId ? { ...n, read_at: new Date().toISOString() } : n
          )
        );
        setUnreadCount(prev => Math.max(0, prev - 1));
      }
    } catch (error) {
      console.error('Error marking notification as read:', error);
    }
  };

  // Mark all as read
  const handleMarkAllAsRead = async () => {
    try {
      const response = await fetch('/api/notifications/mark-all-read', {
        method: 'POST',
        credentials: 'include',
      });

      if (response.ok) {
        setNotifications(prev =>
          prev.map(n => ({ ...n, read_at: n.read_at || new Date().toISOString() }))
        );
        setUnreadCount(0);
      }
    } catch (error) {
      console.error('Error marking all as read:', error);
    }
  };

  // Delete notification
  const handleDelete = async (notificationId) => {
    try {
      const response = await fetch(`/api/notifications/${notificationId}`, {
        method: 'DELETE',
        credentials: 'include',
      });

      if (response.ok) {
        const notification = notifications.find(n => n.id === notificationId);
        setNotifications(prev => prev.filter(n => n.id !== notificationId));
        if (notification && !notification.read_at) {
          setUnreadCount(prev => Math.max(0, prev - 1));
        }
      }
    } catch (error) {
      console.error('Error deleting notification:', error);
    }
  };

  // Handle notification click - navigate to related content
  const handleNotificationClick = (notification) => {
    // Mark as read
    if (!notification.read_at) {
      handleMarkAsRead(notification.id);
    }

    // Navigate based on notification type
    if (notification.post_id) {
      navigate(`/home/news?post=${notification.post_id}`);
    }

    setIsOpen(false);
  };

  // Load more notifications
  const handleLoadMore = () => {
    const nextPage = page + 1;
    setPage(nextPage);
    fetchNotifications(nextPage, true);
  };

  return (
    <div className={`relative ${className}`} ref={dropdownRef}>
      {/* Bell Button */}
      <button
        onClick={() => setIsOpen(!isOpen)}
        className="p-2 rounded-lg bg-white/10 hover:bg-white/20 backdrop-blur-sm transition-colors duration-200 relative"
        title="Notifications"
      >
        {unreadCount > 0 ? (
          <BellIconSolid className="h-5 w-5 text-white" />
        ) : (
          <BellIcon className="h-5 w-5 text-white" />
        )}
        
        {/* Unread Badge */}
        {unreadCount > 0 && (
          <span className="absolute -top-1 -right-1 flex items-center justify-center min-w-[18px] h-[18px] px-1 text-xs font-bold text-white bg-red-500 rounded-full">
            {unreadCount > 99 ? '99+' : unreadCount}
          </span>
        )}
      </button>

      {/* Dropdown */}
      {isOpen && (
        <div className="absolute right-0 mt-2 w-80 sm:w-96 bg-white rounded-xl shadow-lg border border-neutral-200 overflow-hidden z-50">
          {/* Header */}
          <div className="flex items-center justify-between px-4 py-3 border-b border-neutral-100">
            <h3 className="font-semibold text-neutral-900">Notifications</h3>
            {unreadCount > 0 && (
              <button
                onClick={handleMarkAllAsRead}
                className="text-xs text-brand-purple hover:text-brand-navy font-medium"
              >
                Mark all as read
              </button>
            )}
          </div>

          {/* Notification List */}
          <div className="max-h-[400px] overflow-y-auto">
            {loading && notifications.length === 0 ? (
              <div className="p-8 text-center">
                <div className="animate-spin rounded-full h-8 w-8 border-2 border-brand-purple border-t-transparent mx-auto" />
                <p className="mt-2 text-sm text-neutral-500">Loading...</p>
              </div>
            ) : notifications.length === 0 ? (
              <div className="p-8 text-center">
                <BellIcon className="h-12 w-12 text-neutral-300 mx-auto mb-3" />
                <p className="text-sm text-neutral-500">No notifications yet</p>
                <p className="text-xs text-neutral-400 mt-1">
                  You'll see updates when someone mentions you or interacts with your posts
                </p>
              </div>
            ) : (
              <>
                <div className="divide-y divide-neutral-100">
                  {notifications.map((notification) => (
                    <div key={notification.id} className="group">
                      <NotificationItem
                        notification={notification}
                        onRead={handleMarkAsRead}
                        onDelete={handleDelete}
                        onClick={handleNotificationClick}
                      />
                    </div>
                  ))}
                </div>

                {/* Load More */}
                {hasMore && (
                  <div className="p-3 border-t border-neutral-100">
                    <button
                      onClick={handleLoadMore}
                      disabled={loading}
                      className="w-full py-2 text-sm text-brand-purple hover:text-brand-navy font-medium disabled:opacity-50"
                    >
                      {loading ? 'Loading...' : 'Load more'}
                    </button>
                  </div>
                )}
              </>
            )}
          </div>

          {/* Footer */}
          <div className="border-t border-neutral-100 p-2">
            <button
              onClick={() => {
                navigate('/home/notifications');
                setIsOpen(false);
              }}
              className="w-full py-2 text-sm text-center text-neutral-600 hover:text-neutral-900 hover:bg-neutral-50 rounded-lg transition-colors"
            >
              View all notifications
            </button>
          </div>
        </div>
      )}
    </div>
  );
};

export default NotificationCenter;

