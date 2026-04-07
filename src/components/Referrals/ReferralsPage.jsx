import React, { useState, useEffect, useCallback } from 'react';
import {
  GiftIcon,
  MagnifyingGlassIcon,
  FunnelIcon,
  ArrowPathIcon,
  CheckCircleIcon,
  XCircleIcon,
  ClockIcon,
  ExclamationCircleIcon,
} from '@heroicons/react/24/outline';
import ReferralDetailPanel from './ReferralDetailPanel';
import MatchModal from './MatchModal';

const STATUS_OPTIONS = [
  { value: '', label: 'All Statuses' },
  { value: 'submitted', label: 'Submitted' },
  { value: 'pending_review', label: 'Pending Review' },
  { value: 'tracking', label: 'Tracking' },
  { value: 'converted', label: 'Converted' },
  { value: 'rejected', label: 'Rejected' },
];

const STATUS_BADGE = {
  submitted: { bg: 'bg-neutral-100 text-neutral-600', icon: ClockIcon, label: 'Submitted' },
  pending_review: { bg: 'bg-amber-100 text-amber-700', icon: ExclamationCircleIcon, label: 'Pending Review' },
  tracking: { bg: 'bg-brand-cyan/10 text-brand-cyan', icon: ArrowPathIcon, label: 'Tracking' },
  converted: { bg: 'bg-brand-green/10 text-brand-green', icon: CheckCircleIcon, label: 'Converted' },
  rejected: { bg: 'bg-brand-pink/10 text-brand-pink', icon: XCircleIcon, label: 'Rejected' },
};

function StatusBadge({ status }) {
  const cfg = STATUS_BADGE[status] || STATUS_BADGE.submitted;
  const Icon = cfg.icon;
  return (
    <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium ${cfg.bg}`}>
      <Icon className="h-3.5 w-3.5" />
      {cfg.label}
    </span>
  );
}

function PointsBar({ earned, threshold }) {
  const pct = Math.min(100, Math.round((earned / threshold) * 100));
  return (
    <div className="flex items-center gap-2">
      <div className="flex-1 h-1.5 bg-neutral-200 rounded-full overflow-hidden">
        <div
          className="h-full bg-brand-green rounded-full transition-all"
          style={{ width: `${pct}%` }}
        />
      </div>
      <span className="text-xs text-neutral-500 whitespace-nowrap">{earned}/{threshold}</span>
    </div>
  );
}

function formatDate(dateStr) {
  if (!dateStr) return '\u2014';
  return new Date(dateStr).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
}

export default function ReferralsPage() {
  const [referrals, setReferrals] = useState([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [statusFilter, setStatusFilter] = useState('');
  const [search, setSearch] = useState('');
  const [selectedId, setSelectedId] = useState(null);
  const [pendingCount, setPendingCount] = useState(0);
  const [showMatchModal, setShowMatchModal] = useState(null); // referral id
  const [refreshKey, setRefreshKey] = useState(0);

  const fetchReferrals = useCallback(async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams();
      if (statusFilter) params.set('status', statusFilter);
      params.set('limit', '200');
      const res = await fetch(`/api/referrals?${params}`, { credentials: 'include' });
      const data = await res.json();
      setReferrals(data.referrals || []);
      setTotal(data.total || 0);
    } catch (err) {
      console.error('Failed to load referrals', err);
    } finally {
      setLoading(false);
    }
  }, [statusFilter]);

  const fetchPendingCount = useCallback(async () => {
    try {
      const res = await fetch('/api/referrals/pending-count', { credentials: 'include' });
      const data = await res.json();
      setPendingCount(data.count || 0);
    } catch {
      // non-critical
    }
  }, []);

  useEffect(() => {
    fetchReferrals();
    fetchPendingCount();
  }, [fetchReferrals, fetchPendingCount, refreshKey]);

  function handleRefresh() {
    setRefreshKey(k => k + 1);
  }

  function handleAction() {
    setSelectedId(null);
    setShowMatchModal(null);
    handleRefresh();
  }

  // Filter by search text (client-side)
  const filtered = referrals.filter(r => {
    if (!search) return true;
    const q = search.toLowerCase();
    return (
      r.referred_name?.toLowerCase().includes(q) ||
      r.referred_email?.toLowerCase().includes(q) ||
      r.referred_phone?.includes(q) ||
      r.tutor_first_name?.toLowerCase().includes(q) ||
      r.tutor_last_name?.toLowerCase().includes(q) ||
      r.matched_client_name?.toLowerCase().includes(q)
    );
  });

  const selected = selectedId ? referrals.find(r => r.id === selectedId) : null;

  return (
    <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-6">
      {/* Header */}
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold text-neutral-900">Referrals</h1>
          <p className="text-sm text-neutral-500 mt-0.5">
            Tutor referral tracking &middot; {total} total
          </p>
        </div>
        <button
          onClick={handleRefresh}
          className="inline-flex items-center gap-1.5 px-3 py-2 text-sm font-medium text-white bg-brand-purple rounded-lg hover:bg-brand-navy transition-colors"
        >
          <ArrowPathIcon className="h-4 w-4" />
          Refresh
        </button>
      </div>

      {/* Pending review alert */}
      {pendingCount > 0 && (
        <div className="mb-4 flex items-center gap-3 rounded-lg border border-amber-200 bg-amber-50 px-4 py-3">
          <ExclamationCircleIcon className="h-5 w-5 text-amber-600 shrink-0" />
          <p className="text-sm text-amber-800">
            <span className="font-semibold">{pendingCount} referral{pendingCount > 1 ? 's' : ''}</span> pending review — auto-match suggestions found
          </p>
          <button
            onClick={() => setStatusFilter('pending_review')}
            className="ml-auto text-sm font-medium text-amber-700 hover:text-amber-900 transition-colors"
          >
            View
          </button>
        </div>
      )}

      {/* Filters */}
      <div className="flex flex-wrap items-center gap-3 mb-4">
        <div className="relative flex-1 min-w-[200px] max-w-sm">
          <MagnifyingGlassIcon className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-neutral-400" />
          <input
            type="text"
            placeholder="Search referrals..."
            value={search}
            onChange={e => setSearch(e.target.value)}
            className="w-full pl-9 pr-3 py-2 text-sm border border-neutral-300 rounded-lg focus:ring-2 focus:ring-brand-purple/50 focus:border-brand-purple outline-none transition-colors"
          />
        </div>
        <div className="flex items-center gap-1.5">
          <FunnelIcon className="h-4 w-4 text-neutral-400" />
          <select
            value={statusFilter}
            onChange={e => setStatusFilter(e.target.value)}
            className="text-sm border border-neutral-300 rounded-lg px-3 py-2 bg-white focus:ring-2 focus:ring-brand-purple/50 focus:border-brand-purple outline-none transition-colors"
          >
            {STATUS_OPTIONS.map(opt => (
              <option key={opt.value} value={opt.value}>{opt.label}</option>
            ))}
          </select>
        </div>
      </div>

      {/* Table */}
      {loading ? (
        <div className="space-y-2">
          {Array.from({ length: 8 }).map((_, i) => (
            <div key={i} className="h-12 bg-neutral-100 rounded-lg animate-pulse" />
          ))}
        </div>
      ) : filtered.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-16 text-center">
          <GiftIcon className="h-10 w-10 text-neutral-300 mb-3" />
          <p className="text-neutral-500 text-sm">
            {referrals.length === 0 ? 'No referrals yet. Tutors can submit referrals from their dashboard.' : 'No referrals match your filters.'}
          </p>
        </div>
      ) : (
        <div className="border border-neutral-200 rounded-lg overflow-hidden">
          <table className="w-full">
            <thead>
              <tr className="bg-neutral-50 border-b border-neutral-200">
                <th className="px-4 py-3 text-left text-xs font-semibold text-neutral-500 uppercase tracking-wider">Referred Person</th>
                <th className="px-4 py-3 text-left text-xs font-semibold text-neutral-500 uppercase tracking-wider">Tutor</th>
                <th className="px-4 py-3 text-left text-xs font-semibold text-neutral-500 uppercase tracking-wider">Type</th>
                <th className="px-4 py-3 text-left text-xs font-semibold text-neutral-500 uppercase tracking-wider">Status</th>
                <th className="px-4 py-3 text-left text-xs font-semibold text-neutral-500 uppercase tracking-wider">Points</th>
                <th className="px-4 py-3 text-left text-xs font-semibold text-neutral-500 uppercase tracking-wider">Submitted</th>
              </tr>
            </thead>
            <tbody>
              {filtered.map(ref => (
                <tr
                  key={ref.id}
                  onClick={() => setSelectedId(ref.id)}
                  className={`border-b border-neutral-100 cursor-pointer transition-colors ${
                    selectedId === ref.id ? 'bg-brand-purple/5' : 'hover:bg-neutral-50'
                  }`}
                >
                  <td className="px-4 py-3">
                    <div className="text-sm font-medium text-neutral-900">{ref.referred_name}</div>
                    <div className="text-xs text-neutral-500">{ref.referred_email || ref.referred_phone}</div>
                  </td>
                  <td className="px-4 py-3 text-sm text-neutral-700">
                    {ref.tutor_first_name} {ref.tutor_last_name}
                  </td>
                  <td className="px-4 py-3 text-sm text-neutral-600 capitalize">
                    {(ref.referral_type || '').replace(/_/g, ' ')}
                  </td>
                  <td className="px-4 py-3">
                    <StatusBadge status={ref.status} />
                  </td>
                  <td className="px-4 py-3 w-36">
                    {ref.status === 'tracking' || ref.status === 'converted' ? (
                      <PointsBar earned={Number(ref.points_earned)} threshold={Number(ref.points_threshold)} />
                    ) : (
                      <span className="text-xs text-neutral-400">&mdash;</span>
                    )}
                  </td>
                  <td className="px-4 py-3 text-sm text-neutral-500">{formatDate(ref.submitted_at)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {/* Detail Panel */}
      {selected && (
        <ReferralDetailPanel
          referral={selected}
          onClose={() => setSelectedId(null)}
          onMatch={() => setShowMatchModal(selected.id)}
          onReject={handleAction}
          onRefresh={handleAction}
        />
      )}

      {/* Match Modal */}
      {showMatchModal && (
        <MatchModal
          referralId={showMatchModal}
          onClose={() => setShowMatchModal(null)}
          onMatched={handleAction}
        />
      )}
    </div>
  );
}
