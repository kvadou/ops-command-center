import React, { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import {
  UserGroupIcon,
  MagnifyingGlassIcon,
  ChevronRightIcon,
  TrophyIcon,
  FireIcon,
  CheckCircleIcon,
  ClockIcon,
  ArrowPathIcon,
} from '@heroicons/react/24/outline';
import FranchiseAcademyLayout from '../../../components/academy/layout/FranchiseAcademyLayout';
import AcademySidebar from '../../../components/academy/layout/AcademySidebar';

/**
 * Franchisees Admin Page - View all franchisee progress
 *
 * Shows:
 * - All franchisees with their progress
 * - Filtering by status
 * - Detailed progress view
 */
export default function FranchiseesPage() {
  const [loading, setLoading] = useState(true);
  const [franchisees, setFranchisees] = useState([]);
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState('all');
  const [selectedFranchisee, setSelectedFranchisee] = useState(null);

  useEffect(() => {
    fetchFranchisees();
  }, [statusFilter]);

  const fetchFranchisees = async () => {
    try {
      setLoading(true);
      const params = new URLSearchParams();
      if (statusFilter !== 'all') params.append('status', statusFilter);

      const res = await fetch(`/api/academy/admin/franchisees?${params}`);
      if (res.ok) {
        const data = await res.json();
        setFranchisees(data);
      }
    } catch (error) {
      console.error('Error fetching franchisees:', error);
    } finally {
      setLoading(false);
    }
  };

  const filteredFranchisees = franchisees.filter((f) =>
    f.franchise_id.toLowerCase().includes(search.toLowerCase())
  );

  const handleViewDetails = async (franchiseId) => {
    try {
      const res = await fetch(`/api/academy/admin/franchisees/${franchiseId}`);
      if (res.ok) {
        const data = await res.json();
        setSelectedFranchisee(data);
      }
    } catch (error) {
      console.error('Error fetching franchisee details:', error);
    }
  };

  return (
    <FranchiseAcademyLayout
      sidebar={<AcademySidebar isMainBranch={true} />}
      progress={100}
    >
      <div className="space-y-6">
        {/* Header */}
        <div>
          <h1 className="text-2xl font-bold text-neutral-900">Franchisee Progress</h1>
          <p className="text-neutral-600 mt-1">
            Monitor and track all franchisee academy progress
          </p>
        </div>

        {/* Filters */}
        <div className="flex flex-col sm:flex-row gap-3">
          {/* Search */}
          <div className="relative flex-1">
            <MagnifyingGlassIcon className="absolute left-3 top-1/2 -translate-y-1/2 h-5 w-5 text-neutral-400" />
            <input
              type="text"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search franchisees..."
              className="w-full pl-10 pr-4 py-2 border border-neutral-200 rounded-lg
                       focus:outline-none focus:ring-2 focus:ring-brand-navy/30 focus:border-brand-navy"
            />
          </div>

          {/* Status Filter */}
          <select
            value={statusFilter}
            onChange={(e) => setStatusFilter(e.target.value)}
            className="px-4 py-2 border border-neutral-200 rounded-lg
                     focus:outline-none focus:ring-2 focus:ring-brand-navy/30 focus:border-brand-navy
                     bg-white"
          >
            <option value="all">All Status</option>
            <option value="not_started">Not Started</option>
            <option value="in_progress">In Progress</option>
            <option value="completed">Completed</option>
          </select>

          {/* Refresh */}
          <button
            onClick={fetchFranchisees}
            className="p-2 border border-neutral-200 rounded-lg hover:bg-neutral-50"
            title="Refresh"
          >
            <ArrowPathIcon className="h-5 w-5 text-neutral-500" />
          </button>
        </div>

        {/* Summary Stats */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          <SummaryCard
            label="Total"
            value={franchisees.length}
            color="slate"
          />
          <SummaryCard
            label="In Progress"
            value={franchisees.filter((f) => f.status === 'in_progress').length}
            color="blue"
          />
          <SummaryCard
            label="Completed"
            value={franchisees.filter((f) => f.status === 'completed').length}
            color="green"
          />
          <SummaryCard
            label="Not Started"
            value={franchisees.filter((f) => f.status === 'not_started').length}
            color="amber"
          />
        </div>

        {/* Franchisees List */}
        <div className="bg-white rounded-xl border border-neutral-200 overflow-hidden">
          {loading ? (
            <div className="flex items-center justify-center py-12">
              <div className="animate-spin rounded-full h-8 w-8 border-4 border-brand-navy/20 border-t-brand-navy" />
            </div>
          ) : filteredFranchisees.length === 0 ? (
            <div className="text-center py-12">
              <UserGroupIcon className="h-12 w-12 mx-auto text-neutral-300 mb-4" />
              <p className="text-neutral-600">No franchisees found</p>
            </div>
          ) : (
            <div className="divide-y divide-neutral-100">
              {filteredFranchisees.map((f) => (
                <FranchiseeRow
                  key={f.franchise_id}
                  franchisee={f}
                  onViewDetails={() => handleViewDetails(f.franchise_id)}
                />
              ))}
            </div>
          )}
        </div>
      </div>

      {/* Detail Modal */}
      {selectedFranchisee && (
        <FranchiseeDetailModal
          franchisee={selectedFranchisee}
          onClose={() => setSelectedFranchisee(null)}
        />
      )}
    </FranchiseAcademyLayout>
  );
}

/**
 * Summary Card
 */
function SummaryCard({ label, value, color }) {
  const colors = {
    slate: 'bg-neutral-50 text-neutral-600',
    blue: 'bg-blue-50 text-blue-600',
    green: 'bg-green-50 text-green-600',
    amber: 'bg-amber-50 text-amber-600',
  };

  return (
    <div className={`rounded-xl p-4 ${colors[color]}`}>
      <p className="text-2xl font-bold">{value}</p>
      <p className="text-sm opacity-75">{label}</p>
    </div>
  );
}

/**
 * Franchisee Row
 */
function FranchiseeRow({ franchisee, onViewDetails }) {
  const progress = franchisee.completion_percentage || 0;
  const statusColors = {
    not_started: 'bg-neutral-100 text-neutral-600',
    in_progress: 'bg-blue-100 text-blue-700',
    completed: 'bg-green-100 text-green-700',
  };

  return (
    <div
      onClick={onViewDetails}
      className="flex items-center gap-4 p-4 hover:bg-neutral-50 cursor-pointer transition-colors"
    >
      {/* Franchise Info */}
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-full bg-brand-navy/10 flex items-center justify-center">
            <span className="text-sm font-bold text-brand-navy uppercase">
              {franchisee.franchise_id.substring(0, 2)}
            </span>
          </div>
          <div>
            <p className="font-semibold text-neutral-900 capitalize">
              {franchisee.franchise_id}
            </p>
            <p className="text-xs text-neutral-500">
              Phase {franchisee.current_phase} • Day {franchisee.current_day || 0} of 90
            </p>
          </div>
        </div>
      </div>

      {/* Stats */}
      <div className="hidden sm:flex items-center gap-6">
        {/* Points */}
        <div className="flex items-center gap-1 text-amber-600">
          <TrophyIcon className="h-4 w-4" />
          <span className="text-sm font-medium">{franchisee.total_points || 0}</span>
        </div>

        {/* Streak */}
        <div className="flex items-center gap-1 text-orange-600">
          <FireIcon className="h-4 w-4" />
          <span className="text-sm font-medium">{franchisee.current_streak_days || 0}d</span>
        </div>
      </div>

      {/* Progress Bar */}
      <div className="w-32 hidden md:block">
        <div className="flex items-center gap-2">
          <div className="flex-1 h-2 bg-neutral-100 rounded-full overflow-hidden">
            <div
              className="h-full bg-brand-navy rounded-full transition-all"
              style={{ width: `${progress}%` }}
            />
          </div>
          <span className="text-xs font-medium text-neutral-600 w-8 text-right">
            {progress}%
          </span>
        </div>
      </div>

      {/* Status */}
      <span className={`px-3 py-1 rounded-full text-xs font-medium ${statusColors[franchisee.status]}`}>
        {franchisee.status.replace('_', ' ')}
      </span>

      {/* Arrow */}
      <ChevronRightIcon className="h-5 w-5 text-neutral-300" />
    </div>
  );
}

/**
 * Franchisee Detail Modal
 */
function FranchiseeDetailModal({ franchisee, onClose }) {
  const progress = franchisee.progress || {};
  const modules = franchisee.module_progress || [];
  const badges = franchisee.earned_badges || [];

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-xl shadow-xl max-w-2xl w-full max-h-[90vh] flex flex-col">
        {/* Header */}
        <div className="flex items-center justify-between p-4 border-b border-neutral-200">
          <div>
            <h2 className="text-lg font-bold text-neutral-900 capitalize">
              {franchisee.franchise_id}
            </h2>
            <p className="text-sm text-neutral-500">
              Started: {progress.start_date
                ? new Date(progress.start_date).toLocaleDateString()
                : 'Not started'}
            </p>
          </div>
          <button
            onClick={onClose}
            className="text-neutral-400 hover:text-neutral-600 text-2xl"
          >
            &times;
          </button>
        </div>

        {/* Content */}
        <div className="flex-1 overflow-y-auto p-4 space-y-6">
          {/* Stats Grid */}
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
            <StatBox
              icon={ClockIcon}
              label="Day"
              value={`${progress.current_day || 0}/90`}
            />
            <StatBox
              icon={CheckCircleIcon}
              label="Progress"
              value={`${progress.completion_percentage || 0}%`}
            />
            <StatBox
              icon={TrophyIcon}
              label="Points"
              value={progress.total_points || 0}
            />
            <StatBox
              icon={FireIcon}
              label="Streak"
              value={`${progress.current_streak_days || 0}d`}
            />
          </div>

          {/* Module Progress */}
          <div>
            <h3 className="font-semibold text-neutral-900 mb-3">Module Progress</h3>
            {modules.length === 0 ? (
              <p className="text-sm text-neutral-500">No modules started yet</p>
            ) : (
              <div className="space-y-2">
                {modules.map((mod) => (
                  <div
                    key={mod.module_id}
                    className="flex items-center gap-3 p-2 bg-neutral-50 rounded-lg"
                  >
                    <div className={`w-6 h-6 rounded-full flex items-center justify-center
                      ${mod.status === 'completed' ? 'bg-green-100 text-green-600' :
                        mod.status === 'in_progress' ? 'bg-blue-100 text-blue-600' :
                        'bg-neutral-100 text-neutral-400'}`}
                    >
                      {mod.status === 'completed' ? (
                        <CheckCircleIcon className="h-4 w-4" />
                      ) : (
                        <ClockIcon className="h-4 w-4" />
                      )}
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium text-neutral-900 truncate">
                        {mod.module_title}
                      </p>
                      <p className="text-xs text-neutral-500">
                        {mod.points_earned || 0} points earned
                      </p>
                    </div>
                    <span className={`text-xs font-medium capitalize
                      ${mod.status === 'completed' ? 'text-green-600' :
                        mod.status === 'in_progress' ? 'text-blue-600' : 'text-neutral-400'}`}
                    >
                      {mod.status.replace('_', ' ')}
                    </span>
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* Badges */}
          {badges.length > 0 && (
            <div>
              <h3 className="font-semibold text-neutral-900 mb-3">Earned Badges</h3>
              <div className="flex flex-wrap gap-2">
                {badges.map((badge) => (
                  <div
                    key={badge.badge_key}
                    className="flex items-center gap-2 px-3 py-1.5 bg-amber-50 border border-amber-200 rounded-full"
                  >
                    <TrophyIcon className="h-4 w-4 text-amber-600" />
                    <span className="text-sm font-medium text-amber-800">
                      {badge.title}
                    </span>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="p-4 border-t border-neutral-200 bg-neutral-50">
          <button
            onClick={onClose}
            className="w-full px-4 py-2 bg-neutral-200 text-neutral-700 font-medium rounded-lg
                     hover:bg-neutral-300 transition-colors"
          >
            Close
          </button>
        </div>
      </div>
    </div>
  );
}

/**
 * Stat Box
 */
function StatBox({ icon: Icon, label, value }) {
  return (
    <div className="bg-neutral-50 rounded-lg p-3 text-center">
      <Icon className="h-5 w-5 mx-auto text-neutral-400 mb-1" />
      <p className="text-lg font-bold text-neutral-900">{value}</p>
      <p className="text-xs text-neutral-500">{label}</p>
    </div>
  );
}
