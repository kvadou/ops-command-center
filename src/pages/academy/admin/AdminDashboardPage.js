import React, { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import {
  AcademicCapIcon,
  DocumentTextIcon,
  UserGroupIcon,
  ChatBubbleLeftRightIcon,
  TrophyIcon,
  ChartBarIcon,
  ArrowTrendingUpIcon,
  ClockIcon,
  CheckCircleIcon,
} from '@heroicons/react/24/outline';
import FranchiseAcademyLayout from '../../../components/academy/layout/FranchiseAcademyLayout';
import AcademySidebar from '../../../components/academy/layout/AcademySidebar';

/**
 * Academy Admin Dashboard - Overview of academy usage and content
 *
 * Main branch only - shows:
 * - Franchisee progress overview
 * - Content stats (documents, modules)
 * - AI Coach usage
 * - Quick actions
 */
export default function AdminDashboardPage() {
  const [loading, setLoading] = useState(true);
  const [stats, setStats] = useState(null);
  const [franchisees, setFranchisees] = useState([]);
  const [recentActivity, setRecentActivity] = useState([]);

  useEffect(() => {
    fetchData();
  }, []);

  const fetchData = async () => {
    try {
      setLoading(true);

      const [statsRes, franchiseesRes, activityRes] = await Promise.all([
        fetch('/api/academy/admin/stats'),
        fetch('/api/academy/admin/franchisees?limit=5'),
        fetch('/api/academy/admin/recent-activity?limit=10'),
      ]);

      if (statsRes.ok) {
        const data = await statsRes.json();
        setStats(data);
      }

      if (franchiseesRes.ok) {
        const data = await franchiseesRes.json();
        setFranchisees(data);
      }

      if (activityRes.ok) {
        const data = await activityRes.json();
        setRecentActivity(data);
      }
    } catch (error) {
      console.error('Error fetching admin data:', error);
    } finally {
      setLoading(false);
    }
  };

  if (loading) {
    return (
      <FranchiseAcademyLayout
        sidebar={<AcademySidebar isMainBranch={true} />}
        progress={100}
      >
        <div className="flex items-center justify-center min-h-[400px]">
          <div className="flex flex-col items-center gap-4">
            <div className="animate-spin rounded-full h-12 w-12 border-4 border-brand-navy/20 border-t-brand-navy" />
            <p className="text-neutral-500 font-medium">Loading Admin Dashboard...</p>
          </div>
        </div>
      </FranchiseAcademyLayout>
    );
  }

  return (
    <FranchiseAcademyLayout
      sidebar={<AcademySidebar isMainBranch={true} />}
      progress={100}
    >
      <div className="space-y-6">
        {/* Header */}
        <div>
          <h1 className="text-2xl font-bold text-neutral-900">Academy Admin</h1>
          <p className="text-neutral-600 mt-1">
            Manage content and monitor franchisee progress
          </p>
        </div>

        {/* Quick Stats */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          <StatCard
            icon={UserGroupIcon}
            label="Active Franchisees"
            value={stats?.active_franchisees || 0}
            color="blue"
          />
          <StatCard
            icon={DocumentTextIcon}
            label="Documents"
            value={stats?.total_documents || 0}
            color="purple"
          />
          <StatCard
            icon={AcademicCapIcon}
            label="Modules"
            value={stats?.total_modules || 0}
            color="green"
          />
          <StatCard
            icon={ChatBubbleLeftRightIcon}
            label="Coach Messages"
            value={stats?.coach_messages_this_week || 0}
            subLabel="this week"
            color="amber"
          />
        </div>

        {/* Quick Actions */}
        <div className="bg-white rounded-xl border border-neutral-200 p-4">
          <h2 className="text-sm font-semibold text-neutral-700 mb-3">Quick Actions</h2>
          <div className="flex flex-wrap gap-2">
            <Link
              to="/academy/admin/curriculum"
              className="inline-flex items-center gap-2 px-4 py-2 bg-brand-navy text-white
                       font-medium rounded-lg hover:bg-primary-600 transition-colors text-sm"
            >
              <DocumentTextIcon className="h-4 w-4" />
              Content Manager
            </Link>
            <Link
              to="/academy/admin/franchisees"
              className="inline-flex items-center gap-2 px-4 py-2 bg-neutral-100 text-neutral-700
                       font-medium rounded-lg hover:bg-neutral-200 transition-colors text-sm"
            >
              <UserGroupIcon className="h-4 w-4" />
              View All Franchisees
            </Link>
            <Link
              to="/academy/admin/badges"
              className="inline-flex items-center gap-2 px-4 py-2 bg-neutral-100 text-neutral-700
                       font-medium rounded-lg hover:bg-neutral-200 transition-colors text-sm"
            >
              <TrophyIcon className="h-4 w-4" />
              Manage Badges
            </Link>
          </div>
        </div>

        <div className="grid lg:grid-cols-2 gap-6">
          {/* Franchisee Progress */}
          <div className="bg-white rounded-xl border border-neutral-200 p-4">
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-sm font-semibold text-neutral-700">Franchisee Progress</h2>
              <Link
                to="/academy/admin/franchisees"
                className="text-xs text-brand-navy hover:underline"
              >
                View All
              </Link>
            </div>

            {franchisees.length === 0 ? (
              <p className="text-sm text-neutral-500 text-center py-8">
                No franchisees enrolled yet
              </p>
            ) : (
              <div className="space-y-3">
                {franchisees.map((f) => (
                  <FranchiseeProgressRow key={f.franchise_id} franchisee={f} />
                ))}
              </div>
            )}
          </div>

          {/* Recent Activity */}
          <div className="bg-white rounded-xl border border-neutral-200 p-4">
            <h2 className="text-sm font-semibold text-neutral-700 mb-4">Recent Activity</h2>

            {recentActivity.length === 0 ? (
              <p className="text-sm text-neutral-500 text-center py-8">
                No recent activity
              </p>
            ) : (
              <div className="space-y-3">
                {recentActivity.map((activity, idx) => (
                  <ActivityRow key={idx} activity={activity} />
                ))}
              </div>
            )}
          </div>
        </div>

        {/* Coach Usage */}
        {stats?.coach_usage && (
          <div className="bg-white rounded-xl border border-neutral-200 p-4">
            <h2 className="text-sm font-semibold text-neutral-700 mb-4">AI Coach Usage</h2>
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
              <div className="text-center">
                <p className="text-2xl font-bold text-neutral-900">
                  {stats.coach_usage.total_conversations || 0}
                </p>
                <p className="text-xs text-neutral-500">Total Conversations</p>
              </div>
              <div className="text-center">
                <p className="text-2xl font-bold text-neutral-900">
                  {stats.coach_usage.total_messages || 0}
                </p>
                <p className="text-xs text-neutral-500">Total Messages</p>
              </div>
              <div className="text-center">
                <p className="text-2xl font-bold text-amber-600">
                  ${(stats.coach_usage.weekly_spend || 0).toFixed(2)}
                </p>
                <p className="text-xs text-neutral-500">Weekly Spend</p>
              </div>
              <div className="text-center">
                <p className="text-2xl font-bold text-green-600">
                  ${(stats.coach_usage.budget_remaining || 0).toFixed(2)}
                </p>
                <p className="text-xs text-neutral-500">Budget Remaining</p>
              </div>
            </div>
          </div>
        )}
      </div>
    </FranchiseAcademyLayout>
  );
}

/**
 * Stat Card Component
 */
function StatCard({ icon: Icon, label, value, subLabel, color }) {
  const colorClasses = {
    blue: 'bg-blue-50 text-blue-600',
    purple: 'bg-purple-50 text-purple-600',
    green: 'bg-green-50 text-green-600',
    amber: 'bg-amber-50 text-amber-600',
  };

  return (
    <div className="bg-white rounded-xl border border-neutral-200 p-4">
      <div className="flex items-center gap-3">
        <div className={`p-2 rounded-lg ${colorClasses[color]}`}>
          <Icon className="h-5 w-5" />
        </div>
        <div>
          <p className="text-2xl font-bold text-neutral-900">{value}</p>
          <p className="text-xs text-neutral-500">
            {label}
            {subLabel && <span className="text-neutral-400"> {subLabel}</span>}
          </p>
        </div>
      </div>
    </div>
  );
}

/**
 * Franchisee Progress Row
 */
function FranchiseeProgressRow({ franchisee }) {
  const progress = franchisee.completion_percentage || 0;

  return (
    <div className="flex items-center gap-3 p-2 rounded-lg hover:bg-neutral-50">
      <div className="flex-1 min-w-0">
        <p className="text-sm font-medium text-neutral-900 capitalize">
          {franchisee.franchise_id}
        </p>
        <p className="text-xs text-neutral-500">
          Phase {franchisee.current_phase} • Day {franchisee.current_day || 0}
        </p>
      </div>
      <div className="flex items-center gap-2">
        <div className="w-24 h-2 bg-neutral-100 rounded-full overflow-hidden">
          <div
            className="h-full bg-brand-navy rounded-full transition-all"
            style={{ width: `${progress}%` }}
          />
        </div>
        <span className="text-xs font-medium text-neutral-600 w-10 text-right">
          {progress}%
        </span>
      </div>
    </div>
  );
}

/**
 * Activity Row
 */
function ActivityRow({ activity }) {
  const icons = {
    module_completed: CheckCircleIcon,
    checklist_completed: CheckCircleIcon,
    badge_earned: TrophyIcon,
    coach_message: ChatBubbleLeftRightIcon,
    progress_started: ArrowTrendingUpIcon,
  };

  const Icon = icons[activity.type] || ClockIcon;

  return (
    <div className="flex items-start gap-3 p-2">
      <div className="p-1.5 bg-neutral-100 rounded-lg">
        <Icon className="h-4 w-4 text-neutral-500" />
      </div>
      <div className="flex-1 min-w-0">
        <p className="text-sm text-neutral-700">{activity.description}</p>
        <p className="text-xs text-neutral-400 mt-0.5">
          {activity.franchise_id} • {new Date(activity.created_at).toLocaleDateString()}
        </p>
      </div>
    </div>
  );
}
