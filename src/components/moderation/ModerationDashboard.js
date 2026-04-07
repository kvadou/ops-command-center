/**
 * ModerationDashboard - Admin moderation interface
 * 
 * Features:
 * - Pending posts queue
 * - Approve/Reject workflow
 * - Reports review
 * - Audit log
 * - Shadow ban management
 */

import React, { useState, useEffect, useCallback } from 'react';
import { RoleProvider, useRole } from '../../contexts/RoleContext';
import { BranchProvider, useBranch } from '../../contexts/BranchContext';
import PromptDialog from '../ui/PromptDialog';
import {
  ShieldCheckIcon,
  ClockIcon,
  CheckCircleIcon,
  XCircleIcon,
  FlagIcon,
  DocumentTextIcon,
  EyeSlashIcon,
  MagnifyingGlassIcon,
  FunnelIcon,
  ArrowPathIcon,
} from '@heroicons/react/24/outline';

// Tab components
const TABS = [
  { id: 'pending', label: 'Pending', icon: ClockIcon },
  { id: 'reports', label: 'Reports', icon: FlagIcon },
  { id: 'audit', label: 'Audit Log', icon: DocumentTextIcon },
];

// Pending posts queue
const PendingQueue = () => {
  const [posts, setPosts] = useState([]);
  const [loading, setLoading] = useState(true);
  const [page, setPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);
  const [processingId, setProcessingId] = useState(null);
  const [promptState, setPromptState] = useState({ isOpen: false, title: '', defaultValue: '' });

  const fetchPosts = useCallback(async () => {
    try {
      setLoading(true);
      const response = await fetch(`/api/news-feed/moderation/queue?status=pending&page=${page}&limit=10`, {
        credentials: 'include',
      });

      if (response.ok) {
        const data = await response.json();
        setPosts(data.posts || []);
        setTotalPages(data.pagination?.pages || 1);
      }
    } catch (error) {
      console.error('Error fetching pending posts:', error);
    } finally {
      setLoading(false);
    }
  }, [page]);

  useEffect(() => {
    fetchPosts();
  }, [fetchPosts]);

  const handleApprove = async (postId) => {
    setProcessingId(postId);
    try {
      const response = await fetch(`/api/news-feed/moderation/${postId}/approve`, {
        method: 'POST',
        credentials: 'include',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({ notes: 'Approved by moderator' })
      });

      if (response.ok) {
        setPosts(posts.filter(p => p.id !== postId));
      }
    } catch (error) {
      console.error('Error approving post:', error);
    } finally {
      setProcessingId(null);
    }
  };

  const executeReject = async (postId, reason) => {
    setProcessingId(postId);
    try {
      const response = await fetch(`/api/news-feed/moderation/${postId}/reject`, {
        method: 'POST',
        credentials: 'include',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({ reason })
      });

      if (response.ok) {
        setPosts(posts.filter(p => p.id !== postId));
      }
    } catch (error) {
      console.error('Error rejecting post:', error);
    } finally {
      setProcessingId(null);
    }
  };

  const handleReject = (postId, reason) => {
    if (reason) {
      executeReject(postId, reason);
      return;
    }
    setPromptState({
      isOpen: true,
      title: 'Reject Post',
      message: 'Please provide a reason for rejection:',
      defaultValue: '',
      placeholder: 'Reason...',
      onSubmit: (val) => {
        if (val) executeReject(postId, val);
      },
    });
  };

  const getAuthorName = (post) => {
    if (post.author_first_name && post.author_last_name) {
      return `${post.author_first_name} ${post.author_last_name}`;
    }
    return post.author_email?.split('@')[0] || 'Unknown';
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center py-12">
        <div className="animate-spin rounded-full h-8 w-8 border-2 border-brand-purple border-t-transparent" />
      </div>
    );
  }

  if (posts.length === 0) {
    return (
      <div className="text-center py-12">
        <CheckCircleIcon className="h-12 w-12 text-green-500 mx-auto mb-4" />
        <h3 className="text-lg font-semibold text-neutral-900">All caught up!</h3>
        <p className="text-neutral-600 mt-1">No posts pending moderation</p>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {posts.map((post) => (
        <div
          key={post.id}
          className="bg-white rounded-lg border border-neutral-200 p-4"
        >
          {/* Header */}
          <div className="flex items-start justify-between mb-3">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-full bg-brand-purple/20 flex items-center justify-center text-brand-purple font-semibold">
                {getAuthorName(post)[0].toUpperCase()}
              </div>
              <div>
                <p className="font-semibold text-neutral-900">{getAuthorName(post)}</p>
                <p className="text-xs text-neutral-500">
                  {new Date(post.created_at).toLocaleString()}
                  {post.branch_id && ` • ${post.branch_id}`}
                </p>
              </div>
            </div>
            <span className="px-2 py-1 text-xs font-medium rounded-full bg-yellow-100 text-yellow-700">
              {post.visibility_level}
            </span>
          </div>

          {/* Content Preview */}
          <div className="bg-neutral-50 rounded-lg p-3 mb-3">
            <p className="text-sm text-neutral-700 line-clamp-4">
              {post.content || post.content_html?.replace(/<[^>]*>/g, '') || 'No text content'}
            </p>
            {post.media_urls && post.media_urls.length > 0 && (
              <p className="text-xs text-neutral-500 mt-2">
                📎 {post.media_urls.length} attachment(s)
              </p>
            )}
            {post.poll_data && (
              <p className="text-xs text-neutral-500 mt-2">
                📊 Contains poll
              </p>
            )}
          </div>

          {/* Actions */}
          <div className="flex items-center gap-3">
            <button
              onClick={() => handleApprove(post.id)}
              disabled={processingId === post.id}
              className="flex items-center gap-1.5 px-4 py-2 bg-green-600 text-white rounded-lg hover:bg-green-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors text-sm font-medium"
            >
              <CheckCircleIcon className="h-4 w-4" />
              Approve
            </button>
            <button
              onClick={() => handleReject(post.id)}
              disabled={processingId === post.id}
              className="flex items-center gap-1.5 px-4 py-2 bg-red-600 text-white rounded-lg hover:bg-red-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors text-sm font-medium"
            >
              <XCircleIcon className="h-4 w-4" />
              Reject
            </button>
            <button
              onClick={() => window.open(`/home/news?post=${post.id}`, '_blank')}
              className="flex items-center gap-1.5 px-4 py-2 text-neutral-600 hover:text-neutral-900 hover:bg-neutral-100 rounded-lg transition-colors text-sm font-medium"
            >
              View Full Post
            </button>
          </div>
        </div>
      ))}

      {/* Pagination */}
      {totalPages > 1 && (
        <div className="flex items-center justify-center gap-2 pt-4">
          <button
            onClick={() => setPage(p => Math.max(1, p - 1))}
            disabled={page === 1}
            className="px-3 py-1 rounded border border-neutral-200 text-sm disabled:opacity-50"
          >
            Previous
          </button>
          <span className="text-sm text-neutral-600">
            Page {page} of {totalPages}
          </span>
          <button
            onClick={() => setPage(p => Math.min(totalPages, p + 1))}
            disabled={page === totalPages}
            className="px-3 py-1 rounded border border-neutral-200 text-sm disabled:opacity-50"
          >
            Next
          </button>
        </div>
      )}
      <PromptDialog
        isOpen={promptState.isOpen}
        onClose={() => setPromptState(s => ({ ...s, isOpen: false }))}
        onSubmit={(val) => promptState.onSubmit?.(val)}
        title={promptState.title}
        message={promptState.message}
        placeholder={promptState.placeholder}
        defaultValue={promptState.defaultValue || ''}
      />
    </div>
  );
};

// Reports queue
const ReportsQueue = () => {
  const [reports, setReports] = useState([]);
  const [loading, setLoading] = useState(true);
  const [processingId, setProcessingId] = useState(null);
  const [promptState, setPromptState] = useState({ isOpen: false, title: '', defaultValue: '' });

  const fetchReports = useCallback(async () => {
    try {
      setLoading(true);
      const response = await fetch('/api/news-feed/moderation/reports?status=pending', {
        credentials: 'include',
      });

      if (response.ok) {
        const data = await response.json();
        setReports(data.reports || []);
      }
    } catch (error) {
      console.error('Error fetching reports:', error);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchReports();
  }, [fetchReports]);

  const handleReview = (reportId, status) => {
    setPromptState({
      isOpen: true,
      title: 'Resolution Notes',
      message: 'Add resolution notes (optional):',
      defaultValue: '',
      placeholder: 'Notes...',
      onSubmit: async (notes) => {
        setProcessingId(reportId);
        try {
          const response = await fetch(`/api/news-feed/moderation/reports/${reportId}/review`, {
            method: 'POST',
            credentials: 'include',
            headers: {
              'Content-Type': 'application/json'
            },
            body: JSON.stringify({ status, resolution_notes: notes })
          });

          if (response.ok) {
            setReports(reports.filter(r => r.id !== reportId));
          }
        } catch (error) {
          console.error('Error reviewing report:', error);
        } finally {
          setProcessingId(null);
        }
      },
    });
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center py-12">
        <div className="animate-spin rounded-full h-8 w-8 border-2 border-brand-purple border-t-transparent" />
      </div>
    );
  }

  if (reports.length === 0) {
    return (
      <div className="text-center py-12">
        <FlagIcon className="h-12 w-12 text-neutral-400 mx-auto mb-4" />
        <h3 className="text-lg font-semibold text-neutral-900">No pending reports</h3>
        <p className="text-neutral-600 mt-1">All reports have been reviewed</p>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {reports.map((report) => (
        <div
          key={report.id}
          className="bg-white rounded-lg border border-neutral-200 p-4"
        >
          <div className="flex items-start justify-between mb-3">
            <div>
              <span className="px-2 py-1 text-xs font-medium rounded-full bg-red-100 text-red-700">
                {report.reason}
              </span>
              <p className="text-sm text-neutral-600 mt-2">
                Reported by: {report.reporter_first_name || report.reporter_email?.split('@')[0] || 'Anonymous'}
              </p>
              <p className="text-xs text-neutral-500">
                {new Date(report.created_at).toLocaleString()}
              </p>
            </div>
            <div className="text-sm text-neutral-500">
              {report.post_id ? 'Post' : 'Comment'} Report
            </div>
          </div>

          {report.details && (
            <div className="bg-neutral-50 rounded-lg p-3 mb-3">
              <p className="text-sm text-neutral-700">{report.details}</p>
            </div>
          )}

          <div className="flex items-center gap-3">
            <button
              onClick={() => handleReview(report.id, 'resolved')}
              disabled={processingId === report.id}
              className="flex items-center gap-1.5 px-4 py-2 bg-brand-purple text-white rounded-lg hover:bg-brand-navy disabled:opacity-50 transition-colors text-sm font-medium"
            >
              Take Action
            </button>
            <button
              onClick={() => handleReview(report.id, 'dismissed')}
              disabled={processingId === report.id}
              className="flex items-center gap-1.5 px-4 py-2 text-neutral-600 hover:text-neutral-900 hover:bg-neutral-100 rounded-lg transition-colors text-sm font-medium"
            >
              Dismiss
            </button>
          </div>
        </div>
      ))}
      <PromptDialog
        isOpen={promptState.isOpen}
        onClose={() => setPromptState(s => ({ ...s, isOpen: false }))}
        onSubmit={(val) => promptState.onSubmit?.(val)}
        title={promptState.title}
        message={promptState.message}
        placeholder={promptState.placeholder}
        defaultValue={promptState.defaultValue || ''}
      />
    </div>
  );
};

// Audit log
const AuditLog = () => {
  const [logs, setLogs] = useState([]);
  const [loading, setLoading] = useState(true);

  const fetchLogs = useCallback(async () => {
    try {
      setLoading(true);
      const response = await fetch('/api/news-feed/moderation/log?limit=50', {
        credentials: 'include',
      });

      if (response.ok) {
        const data = await response.json();
        setLogs(data.log || []);
      }
    } catch (error) {
      console.error('Error fetching audit log:', error);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchLogs();
  }, [fetchLogs]);

  const getActionColor = (action) => {
    switch (action) {
      case 'approve': return 'text-green-600 bg-green-50';
      case 'reject': return 'text-red-600 bg-red-50';
      case 'delete': return 'text-red-600 bg-red-50';
      case 'pin': return 'text-blue-600 bg-blue-50';
      default: return 'text-neutral-600 bg-neutral-50';
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center py-12">
        <div className="animate-spin rounded-full h-8 w-8 border-2 border-brand-purple border-t-transparent" />
      </div>
    );
  }

  if (logs.length === 0) {
    return (
      <div className="text-center py-12">
        <DocumentTextIcon className="h-12 w-12 text-neutral-400 mx-auto mb-4" />
        <h3 className="text-lg font-semibold text-neutral-900">No audit logs</h3>
        <p className="text-neutral-600 mt-1">Moderation activity will appear here</p>
      </div>
    );
  }

  return (
    <div className="space-y-2">
      {logs.map((log) => (
        <div
          key={log.id}
          className="flex items-center gap-4 py-3 px-4 bg-white rounded-lg border border-neutral-200"
        >
          <span className={`px-2 py-1 text-xs font-medium rounded-full capitalize ${getActionColor(log.action)}`}>
            {log.action}
          </span>
          <div className="flex-1">
            <p className="text-sm text-neutral-900">
              <span className="font-medium">
                {log.actor_first_name || log.actor_email?.split('@')[0] || 'Admin'}
              </span>
              {' '}{log.action}d a post
              {log.reason && (
                <span className="text-neutral-500"> • {log.reason}</span>
              )}
            </p>
          </div>
          <span className="text-xs text-neutral-500">
            {new Date(log.created_at).toLocaleString()}
          </span>
        </div>
      ))}
    </div>
  );
};

// Main dashboard content
function ModerationDashboardContent() {
  const [activeTab, setActiveTab] = useState('pending');
  const { currentRole } = useRole();

  // Check if user has moderation access
  if (!['admin', 'staff'].includes(currentRole)) {
    return (
      <div className="text-center py-12">
        <ShieldCheckIcon className="h-12 w-12 text-neutral-400 mx-auto mb-4" />
        <h3 className="text-lg font-semibold text-neutral-900">Access Denied</h3>
        <p className="text-neutral-600 mt-1">You need admin privileges to access moderation tools</p>
      </div>
    );
  }

  return (
      <div className="max-w-5xl mx-auto">
        {/* Header */}
        <div className="mb-6">
          <div className="flex items-center gap-3">
            <div className="p-2 bg-brand-purple rounded-lg">
              <ShieldCheckIcon className="h-6 w-6 text-white" />
            </div>
            <div>
              <h1 className="text-2xl font-bold text-neutral-900">Moderation Dashboard</h1>
              <p className="text-sm text-neutral-600">Review and moderate news feed content</p>
            </div>
          </div>
        </div>

        {/* Tabs */}
        <div className="flex items-center gap-1 border-b border-neutral-200 mb-6">
          {TABS.map((tab) => {
            const Icon = tab.icon;
            return (
              <button
                key={tab.id}
                onClick={() => setActiveTab(tab.id)}
                className={`flex items-center gap-2 px-4 py-3 text-sm font-medium border-b-2 transition-colors ${
                  activeTab === tab.id
                    ? 'border-brand-purple text-brand-purple'
                    : 'border-transparent text-neutral-600 hover:text-neutral-900'
                }`}
              >
                <Icon className="h-4 w-4" />
                {tab.label}
              </button>
            );
          })}
        </div>

        {/* Tab Content */}
        <div>
          {activeTab === 'pending' && <PendingQueue />}
          {activeTab === 'reports' && <ReportsQueue />}
          {activeTab === 'audit' && <AuditLog />}
        </div>
      </div>
  );
}

// Main export with providers
export default function ModerationDashboard() {
  const [user, setUser] = useState(null);

  useEffect(() => {
    const userData = localStorage.getItem("user");
    if (userData && userData !== "undefined") {
      try {
        setUser(JSON.parse(userData));
      } catch (e) {
        console.error("Error parsing user data:", e);
      }
    }
  }, []);

  if (!user) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-neutral-50 via-white to-brand-light/20 flex items-center justify-center">
        <div className="text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-brand-purple mx-auto"></div>
          <p className="mt-4 text-neutral-600">Loading...</p>
        </div>
      </div>
    );
  }

  return (
    <RoleProvider user={user}>
      <BranchProvider user={user}>
        <ModerationDashboardContent />
      </BranchProvider>
    </RoleProvider>
  );
}

