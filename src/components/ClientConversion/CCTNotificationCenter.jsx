/**
 * CCTNotificationCenter - CCT-specific notification dropdown
 *
 * Displays notifications for automated Won/Lost pipeline changes.
 * Notifications have per-user read state (each user dismisses independently).
 *
 * Features:
 * - Bell icon with unread badge
 * - Green styling for Won, amber/red for Lost
 * - Restore button to move clients back to previous stage
 * - Per-user read state
 */

import React, { useState, useEffect, useRef, useCallback } from 'react';
import { useCCTNotifications } from '../../hooks/useCCTNotifications';
import {
  BellIcon,
  ArrowPathIcon,
} from '@heroicons/react/24/outline';
import {
  BellIcon as BellIconSolid,
  CheckCircleIcon,
  ClockIcon,
  ExclamationTriangleIcon,
  XCircleIcon,
  CheckIcon,
} from '@heroicons/react/24/solid';

// CCT Notification type configurations - using brand colors
const CCT_NOTIFICATION_TYPES = {
  auto_won: {
    icon: CheckCircleIcon,
    iconColor: 'text-brand-green',
    bgColor: 'bg-brand-green/10',
    borderColor: 'border-l-brand-green',
    labelBg: 'bg-brand-green/15 text-brand-green',
    label: 'Won'
  },
  auto_lost_14_day: {
    icon: ClockIcon,
    iconColor: 'text-brand-orange',
    bgColor: 'bg-brand-orange/10',
    borderColor: 'border-l-brand-orange',
    labelBg: 'bg-brand-orange/15 text-brand-orange',
    label: '14-Day Timeout'
  },
  auto_lost_30_day_building: {
    icon: ExclamationTriangleIcon,
    iconColor: 'text-brand-pink',
    bgColor: 'bg-brand-pink/10',
    borderColor: 'border-l-brand-pink',
    labelBg: 'bg-brand-pink/15 text-brand-pink',
    label: '30-Day Building'
  },
  auto_lost_30_day_trial: {
    icon: ExclamationTriangleIcon,
    iconColor: 'text-brand-pink',
    bgColor: 'bg-brand-pink/10',
    borderColor: 'border-l-brand-pink',
    labelBg: 'bg-brand-pink/15 text-brand-pink',
    label: '30-Day Post-Trial'
  },
  manual_won: {
    icon: CheckCircleIcon,
    iconColor: 'text-brand-green',
    bgColor: 'bg-brand-green/10',
    borderColor: 'border-l-brand-green',
    labelBg: 'bg-brand-green/15 text-brand-green',
    label: 'Won'
  },
  manual_lost: {
    icon: XCircleIcon,
    iconColor: 'text-brand-pink',
    bgColor: 'bg-brand-pink/10',
    borderColor: 'border-l-brand-pink',
    labelBg: 'bg-brand-pink/15 text-brand-pink',
    label: 'Lost'
  },
  restored: {
    icon: ArrowPathIcon,
    iconColor: 'text-brand-purple',
    bgColor: 'bg-brand-purple/10',
    borderColor: 'border-l-brand-purple',
    labelBg: 'bg-brand-purple/15 text-brand-purple',
    label: 'Restored'
  }
};

// Format relative time
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

// Individual notification item
const CCTNotificationItem = ({ notification, onMarkAsRead, onRestore }) => {
  const typeConfig = CCT_NOTIFICATION_TYPES[notification.type] || CCT_NOTIFICATION_TYPES.manual_lost;
  const Icon = typeConfig.icon;
  const isUnread = !notification.read_at;
  const isRestored = !!notification.restored_at;
  const canRestore = notification.type.includes('lost') && !isRestored;
  const [restoring, setRestoring] = useState(false);

  const handleRestore = async (e) => {
    e.stopPropagation();
    setRestoring(true);
    try {
      await onRestore(notification.id);
    } catch (err) {
      console.error('Failed to restore:', err);
    } finally {
      setRestoring(false);
    }
  };

  const handleMarkAsRead = (e) => {
    e.stopPropagation();
    onMarkAsRead(notification.id);
  };

  return (
    <div
      className={`flex items-start gap-3 p-4 hover:bg-neutral-50/80 transition-colors border-l-4 ${typeConfig.borderColor} ${
        isUnread ? 'bg-brand-purple/5' : 'bg-white'
      }`}
    >
      {/* Icon - Using solid icons with brand colors */}
      <div className={`p-2.5 rounded-xl flex-shrink-0 ${typeConfig.bgColor}`}>
        <Icon className={`h-5 w-5 ${typeConfig.iconColor}`} />
      </div>

      {/* Content */}
      <div className="flex-1 min-w-0">
        <div className="flex items-start justify-between gap-2">
          <div>
            <p className={`text-sm ${isUnread ? 'font-semibold text-neutral-900' : 'font-medium text-neutral-700'}`}>
              {notification.title}
            </p>
            {notification.body && (
              <p className="text-xs text-neutral-500 mt-1 line-clamp-2">
                {notification.body}
              </p>
            )}
            {notification.client_email && (
              <p className="text-xs text-neutral-400 mt-0.5 font-medium">
                {notification.client_email}
              </p>
            )}
          </div>
          {isUnread && (
            <div className="w-2.5 h-2.5 rounded-full bg-brand-purple flex-shrink-0 mt-1 ring-2 ring-brand-purple/20" />
          )}
        </div>

        {/* Footer with time and actions */}
        <div className="flex items-center justify-between mt-3">
          <div className="flex items-center gap-2">
            <span className={`text-xs px-2 py-1 rounded-md font-semibold ${typeConfig.labelBg}`}>
              {typeConfig.label}
            </span>
            <span className="text-xs text-neutral-400 font-medium">
              {formatTime(notification.created_at)}
            </span>
          </div>

          {/* Action buttons - More prominent styling */}
          <div className="flex items-center gap-2">
            {canRestore && (
              <button
                onClick={handleRestore}
                disabled={restoring}
                className="text-xs px-2.5 py-1.5 rounded-lg bg-brand-purple/10 text-brand-purple hover:bg-brand-purple/20 font-semibold disabled:opacity-50 flex items-center gap-1.5 transition-colors"
                title="Restore to previous stage"
              >
                <ArrowPathIcon className={`h-3.5 w-3.5 ${restoring ? 'animate-spin' : ''}`} />
                Restore
              </button>
            )}
            {isRestored && (
              <span className="text-xs text-brand-green font-semibold flex items-center gap-1 bg-brand-green/10 px-2 py-1 rounded-md">
                <CheckIcon className="h-3.5 w-3.5" />
                Restored
              </span>
            )}
            {isUnread && (
              <button
                onClick={handleMarkAsRead}
                className="text-xs px-2.5 py-1.5 rounded-lg border-2 border-neutral-200 text-neutral-600 hover:border-brand-purple hover:text-brand-purple hover:bg-brand-purple/5 font-semibold flex items-center gap-1 transition-all"
                title="Mark as read"
              >
                <CheckIcon className="h-3.5 w-3.5" />
              </button>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};

export default function CCTNotificationCenter({ className = '', onDataChange }) {
  const [isOpen, setIsOpen] = useState(false);
  const dropdownRef = useRef(null);
  const onDataChangeRef = useRef(onDataChange);
  onDataChangeRef.current = onDataChange;

  const {
    notifications,
    unreadCount,
    loading,
    error,
    pagination,
    fetchNotifications,
    fetchUnreadCount,
    markAsRead,
    markAllAsRead,
    restoreClient,
    triggerAutomationCheck,
    loadMore
  } = useCCTNotifications();

  // Fetch count on mount and run automation check (once)
  useEffect(() => {
    const runAutomationAndRefresh = async () => {
      fetchUnreadCount();
      const result = await triggerAutomationCheck();
      if (result && result.notificationsCreated > 0 && onDataChangeRef.current) {
        console.log(`[CCT Notifications] ${result.notificationsCreated} new notifications - refreshing data`);
        onDataChangeRef.current();
      }
    };
    runAutomationAndRefresh();
  }, [fetchUnreadCount, triggerAutomationCheck]);

  // Fetch notifications when dropdown opens
  useEffect(() => {
    if (isOpen) {
      fetchNotifications(1);
    }
  }, [isOpen, fetchNotifications]);

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

  const handleMarkAsRead = async (notificationId) => {
    try {
      await markAsRead(notificationId);
    } catch (err) {
      console.error('Failed to mark as read:', err);
    }
  };

  const handleMarkAllAsRead = async () => {
    try {
      await markAllAsRead();
      // Re-verify count from server to ensure badge stays in sync
      await fetchUnreadCount();
    } catch (err) {
      console.error('Failed to mark all as read:', err);
    }
  };

  const handleRestore = async (notificationId) => {
    await restoreClient(notificationId);
    // Refresh main CCT data after restoring a client
    if (onDataChange) {
      onDataChange();
    }
  };

  const handleLoadMore = () => {
    loadMore();
  };

  return (
    <div className={`relative ${className}`} ref={dropdownRef}>
      {/* Bell Button - Prominent styling */}
      <button
        onClick={() => setIsOpen(!isOpen)}
        className={`
          p-2 rounded-lg transition-all duration-200 relative
          ${unreadCount > 0
            ? 'bg-gradient-to-br from-primary-500 to-primary-700 hover:from-primary-600 hover:to-primary-800 shadow-sm shadow-primary-200 hover:shadow-lg hover:shadow-primary-300 hover:scale-105'
            : 'bg-white border border-neutral-200 hover:border-primary-300 hover:bg-primary-50 shadow-sm hover:shadow'
          }
        `}
        title="Pipeline Alerts"
      >
        {unreadCount > 0 ? (
          <BellIconSolid className="h-5 w-5 text-white" />
        ) : (
          <BellIcon className="h-5 w-5 text-neutral-500 hover:text-primary-500" />
        )}

        {/* Unread Badge */}
        {unreadCount > 0 && (
          <span className="absolute -top-1.5 -right-1.5 flex items-center justify-center min-w-[18px] h-[18px] px-1 text-[10px] font-bold text-white bg-[#AE255B] rounded-full ring-2 ring-white shadow-sm animate-pulse">
            {unreadCount > 99 ? '99+' : unreadCount}
          </span>
        )}
      </button>

      {/* Dropdown */}
      {isOpen && (
        <div className="absolute right-0 mt-2 w-80 sm:w-[420px] bg-white rounded-2xl shadow-xl border border-neutral-200 overflow-hidden z-popover">
          {/* Header - Brand gradient accent */}
          <div className="flex items-center justify-between px-5 py-4 border-b border-neutral-100 bg-gradient-to-r from-brand-purple/5 to-brand-cyan/5">
            <div className="flex items-center gap-3">
              <div className="p-2 rounded-xl bg-brand-purple/10">
                <BellIconSolid className="h-5 w-5 text-brand-purple" />
              </div>
              <div>
                <h3 className="font-semibold text-neutral-900">Pipeline Alerts</h3>
                <p className="text-xs text-neutral-500">Automated status changes</p>
              </div>
            </div>
            {unreadCount > 0 && (
              <button
                onClick={handleMarkAllAsRead}
                className="text-xs px-3 py-1.5 rounded-lg bg-brand-purple text-white hover:bg-brand-purple/90 font-semibold transition-colors shadow-sm"
              >
                Mark all read
              </button>
            )}
          </div>

          {/* Notification List */}
          <div className="max-h-[420px] overflow-y-auto bg-white">
            {loading && notifications.length === 0 ? (
              <div className="p-10 text-center">
                <div className="animate-spin rounded-full h-10 w-10 border-3 border-brand-purple border-t-transparent mx-auto" />
                <p className="mt-3 text-sm text-neutral-500 font-medium">Loading alerts...</p>
              </div>
            ) : error ? (
              <div className="p-10 text-center">
                <div className="w-16 h-16 rounded-2xl bg-[#FCE8F0] flex items-center justify-center mx-auto mb-4">
                  <XCircleIcon className="h-8 w-8 text-[#DA2E72]" />
                </div>
                <p className="text-sm text-[#DA2E72] font-medium">{error}</p>
              </div>
            ) : notifications.filter(n => !n.read_at).length === 0 ? (
              <div className="p-10 text-center">
                <div className="w-16 h-16 rounded-2xl bg-neutral-100 flex items-center justify-center mx-auto mb-4">
                  <BellIcon className="h-8 w-8 text-neutral-400" />
                </div>
                <p className="text-sm text-neutral-600 font-medium">No unread alerts</p>
                <p className="text-xs text-neutral-400 mt-2 max-w-[200px] mx-auto">
                  You'll see alerts when prospects are automatically moved to Won or Lost
                </p>
              </div>
            ) : (
              <>
                <div className="divide-y divide-neutral-100">
                  {notifications.filter(n => !n.read_at).map((notification) => (
                    <CCTNotificationItem
                      key={notification.id}
                      notification={notification}
                      onMarkAsRead={handleMarkAsRead}
                      onRestore={handleRestore}
                    />
                  ))}
                </div>

                {/* Load More */}
                {pagination.hasMore && (
                  <div className="p-4 border-t border-neutral-100">
                    <button
                      onClick={handleLoadMore}
                      disabled={loading}
                      className="w-full py-2.5 text-sm bg-neutral-50 hover:bg-neutral-100 text-brand-purple hover:text-brand-purple/80 font-semibold rounded-lg disabled:opacity-50 transition-colors"
                    >
                      {loading ? 'Loading...' : 'Load more alerts'}
                    </button>
                  </div>
                )}
              </>
            )}
          </div>

        </div>
      )}
    </div>
  );
}
