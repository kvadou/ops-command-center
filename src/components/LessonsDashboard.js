import React, { useState, useEffect, useMemo, useCallback } from 'react';
import { useSearchParams, Link } from 'react-router-dom';
import { DateTime } from 'luxon';
import axios from 'axios';
import {
  CalendarDaysIcon,
  ExclamationTriangleIcon,
  ArrowPathIcon,
  ChevronUpIcon,
  ChevronDownIcon,
  UserIcon,
  AcademicCapIcon,
  XMarkIcon,
  TagIcon,
  FunnelIcon,
  MagnifyingGlassIcon,
  ChevronLeftIcon,
  ChevronRightIcon,
} from '@heroicons/react/24/outline';

function classNames(...classes) {
  return classes.filter(Boolean).join(' ');
}

// === Design system badges ===

function StatusBadge({ status }) {
  const styles = {
    planned: 'bg-[#E8FBFF] text-[#3BA8BD]',
    complete: 'bg-[#E8F8ED] text-[#2A9147]',
    cancelled: 'bg-[#FCE8F0] text-[#AE255B]',
    'cancelled-chargeable': 'bg-[#FEF4E8] text-[#C77A26]',
    'awaiting-report': 'bg-primary-50 text-primary-700',
  };
  const labels = {
    planned: 'Planned',
    complete: 'Complete',
    cancelled: 'Cancelled',
    'cancelled-chargeable': 'Cancelled (Charged)',
    'awaiting-report': 'Awaiting Report',
  };
  return (
    <span className={classNames('inline-flex items-center px-2 py-0.5 rounded-sm text-xs font-medium whitespace-nowrap', styles[status] || 'bg-neutral-100 text-neutral-600')}>
      {labels[status] || status}
    </span>
  );
}

function CancelledByBadge({ cancelledBy }) {
  if (!cancelledBy || cancelledBy === 'unknown') {
    return (
      <span className="inline-flex items-center px-2 py-0.5 rounded-sm text-xs font-medium bg-[#FACC29]/10 text-[#C77A26] whitespace-nowrap">
        Untagged
      </span>
    );
  }
  const styles = {
    client: 'bg-[#FCE8F0] text-[#AE255B]',
    tutor: 'bg-[#FEF4E8] text-[#C77A26]',
    admin: 'bg-neutral-100 text-neutral-600',
  };
  const labels = { client: 'Client', tutor: 'Tutor', admin: 'Admin' };
  return (
    <span className={classNames('inline-flex items-center px-2 py-0.5 rounded-sm text-xs font-medium whitespace-nowrap', styles[cancelledBy] || 'bg-neutral-100 text-neutral-600')}>
      {labels[cancelledBy] || cancelledBy}
    </span>
  );
}

function ReasonLabel({ reason }) {
  if (!reason) return <span className="text-neutral-400 text-xs">—</span>;
  const labels = {
    rescheduled: 'Rescheduled',
    no_show: 'No Show',
    sick: 'Sick',
    schedule_conflict: 'Schedule Conflict',
    weather: 'Weather',
    other: 'Other',
  };
  return <span className="text-xs text-neutral-700">{labels[reason] || reason}</span>;
}

// === KPI Card (matches JobsDashboard) ===

function KPICard({ label, value, subtitle, icon: Icon, accent }) {
  return (
    <div className="bg-white border border-neutral-200 rounded-xl p-4 sm:p-5 shadow-sm">
      <div className="flex items-center gap-2 mb-1">
        {Icon && <Icon className={classNames('h-4 w-4', accent || 'text-neutral-400')} />}
        <div className="text-xs text-neutral-500">{label}</div>
      </div>
      <div className="text-2xl font-bold text-neutral-900 tabular-nums">{value}</div>
      {subtitle && <div className="text-xs text-neutral-500 mt-1">{subtitle}</div>}
    </div>
  );
}

// === Tagging Modal ===

const CANCELLED_BY_OPTIONS = [
  { value: 'client', label: 'Client', icon: UserIcon, desc: 'Client initiated the cancellation' },
  { value: 'tutor', label: 'Tutor', icon: AcademicCapIcon, desc: 'Tutor initiated the cancellation' },
  { value: 'admin', label: 'Admin', icon: TagIcon, desc: 'Admin/ops cancelled the lesson' },
];

const REASON_OPTIONS = [
  { value: 'rescheduled', label: 'Rescheduled' },
  { value: 'no_show', label: 'No Show' },
  { value: 'sick', label: 'Sick' },
  { value: 'schedule_conflict', label: 'Schedule Conflict' },
  { value: 'weather', label: 'Weather' },
  { value: 'other', label: 'Other' },
];

function TagCancellationModal({ lesson, onClose, onSave }) {
  const [step, setStep] = useState(1);
  const [cancelledBy, setCancelledBy] = useState('');
  const [reason, setReason] = useState('');
  const [note, setNote] = useState('');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  const handleSave = async () => {
    if (!cancelledBy || !reason) return;
    setSaving(true);
    setError('');
    try {
      await onSave(lesson.appointment_id, { cancelledBy, reason, note: note.trim() || undefined });
      onClose();
    } catch (err) {
      setError(err.response?.data?.error || 'Failed to save');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center">
      <div className="fixed inset-0 bg-black/40 backdrop-blur-sm" onClick={onClose} />
      <div className="relative bg-white rounded-xl shadow-xl border border-neutral-200 w-full max-w-md mx-4 p-6">
        <div className="flex items-center justify-between mb-4">
          <h3 className="text-lg font-semibold text-neutral-900">Tag Cancellation</h3>
          <button onClick={onClose} className="p-1 rounded-md hover:bg-neutral-100 transition-colors">
            <XMarkIcon className="h-5 w-5 text-neutral-500" />
          </button>
        </div>

        {lesson && (
          <div className="bg-neutral-50 rounded-lg p-3 mb-4 text-sm">
            <div className="font-medium text-neutral-900 truncate">{lesson.topic || lesson.service_name}</div>
            <div className="text-neutral-500 text-xs mt-0.5">
              {lesson.start ? DateTime.fromISO(lesson.start).toFormat('MMM d, yyyy h:mm a') : ''}
              {lesson.client_name && ` · ${lesson.client_name}`}
            </div>
          </div>
        )}

        {error && (
          <div className="bg-[#FCE8F0] border border-[#DA2E72]/30 rounded-lg p-3 mb-4 text-sm text-[#AE255B]">
            {error}
          </div>
        )}

        {step === 1 && (
          <div>
            <p className="text-sm text-neutral-600 mb-3">Who cancelled this lesson?</p>
            <div className="space-y-2">
              {CANCELLED_BY_OPTIONS.map(opt => (
                <button
                  key={opt.value}
                  onClick={() => { setCancelledBy(opt.value); setStep(2); }}
                  className={classNames(
                    'w-full flex items-center gap-3 p-3 rounded-lg border transition-all text-left',
                    cancelledBy === opt.value
                      ? 'border-[#6A469D] bg-primary-50'
                      : 'border-neutral-200 hover:border-neutral-300 hover:bg-neutral-50'
                  )}
                >
                  <opt.icon className="h-5 w-5 text-neutral-500 flex-shrink-0" />
                  <div>
                    <div className="text-sm font-medium text-neutral-900">{opt.label}</div>
                    <div className="text-xs text-neutral-500">{opt.desc}</div>
                  </div>
                </button>
              ))}
            </div>
          </div>
        )}

        {step === 2 && (
          <div>
            <button onClick={() => setStep(1)} className="text-xs text-[#6A469D] hover:text-[#4C3271] mb-3 font-medium transition-colors">
              ← Back to who cancelled
            </button>
            <p className="text-sm text-neutral-600 mb-3">What was the reason?</p>
            <div className="grid grid-cols-2 gap-2">
              {REASON_OPTIONS.map(opt => (
                <button
                  key={opt.value}
                  onClick={() => { setReason(opt.value); setStep(3); }}
                  className={classNames(
                    'p-3 rounded-lg border text-sm font-medium transition-all text-center',
                    reason === opt.value
                      ? 'border-[#6A469D] bg-primary-50 text-[#6A469D]'
                      : 'border-neutral-200 text-neutral-700 hover:border-neutral-300 hover:bg-neutral-50'
                  )}
                >
                  {opt.label}
                </button>
              ))}
            </div>
          </div>
        )}

        {step === 3 && (
          <div>
            <button onClick={() => setStep(2)} className="text-xs text-[#6A469D] hover:text-[#4C3271] mb-3 font-medium transition-colors">
              ← Back to reason
            </button>
            <div className="flex items-center gap-2 mb-3">
              <CancelledByBadge cancelledBy={cancelledBy} />
              <ReasonLabel reason={reason} />
            </div>
            <label className="block text-sm font-medium text-neutral-700 mb-1">Note (optional)</label>
            <textarea
              value={note}
              onChange={(e) => setNote(e.target.value)}
              rows={2}
              className="w-full border border-neutral-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[#6A469D]/20 focus:border-[#6A469D] transition-colors"
              placeholder="Any additional context..."
            />
            <div className="flex justify-end gap-2 mt-4">
              <button onClick={onClose} className="px-4 py-2 text-sm font-medium text-neutral-600 hover:text-neutral-800 transition-colors">
                Cancel
              </button>
              <button
                onClick={handleSave}
                disabled={saving}
                className="px-4 py-2 text-sm font-medium bg-[#6A469D] text-white rounded-lg hover:bg-[#5B3C87] transition-colors disabled:opacity-50"
              >
                {saving ? 'Saving...' : 'Save'}
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

// === Lessons Tab ===

function LessonsTab({ searchParams }) {
  const [lessons, setLessons] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [tabCounts, setTabCounts] = useState({});
  const [pagination, setPagination] = useState({ page: 1, limit: 50, total: 0, totalPages: 0 });
  const [search, setSearch] = useState('');
  const [debouncedSearch, setDebouncedSearch] = useState('');
  const [activeTab, setActiveTab] = useState(searchParams.get('tab') || 'upcoming');
  const [sortField, setSortField] = useState('start');
  const [sortDir, setSortDir] = useState(activeTab === 'upcoming' ? 'asc' : 'desc');
  const [tagModalLesson, setTagModalLesson] = useState(null);
  const [filters, setFilters] = useState({
    cancelled_by: '',
    cancellation_reason: '',
    start_date: '',
    end_date: '',
  });

  // Debounce search
  useEffect(() => {
    const timer = setTimeout(() => setDebouncedSearch(search), 300);
    return () => clearTimeout(timer);
  }, [search]);

  const fetchLessons = useCallback(async (page = 1) => {
    setLoading(true);
    setError(null);
    try {
      const params = new URLSearchParams();
      params.set('tab', activeTab);
      params.set('page', page);
      params.set('limit', 50);
      params.set('sort', sortField);
      params.set('sort_dir', sortDir);
      if (debouncedSearch) params.set('search', debouncedSearch);
      if (filters.cancelled_by) params.set('cancelled_by', filters.cancelled_by);
      if (filters.cancellation_reason) params.set('cancellation_reason', filters.cancellation_reason);
      if (filters.start_date) params.set('start_date', filters.start_date);
      if (filters.end_date) params.set('end_date', filters.end_date);

      const { data } = await axios.get(`/api/lessons-dashboard?${params.toString()}`);
      setLessons(data.lessons || []);
      setPagination(data.pagination || { page: 1, limit: 50, total: 0, totalPages: 0 });
      if (data.tabCounts) setTabCounts(data.tabCounts);
    } catch (err) {
      setError(err.response?.data?.error || 'Failed to load lessons');
    } finally {
      setLoading(false);
    }
  }, [activeTab, sortField, sortDir, debouncedSearch, filters]);

  useEffect(() => { fetchLessons(1); }, [fetchLessons]);

  const handleTabChange = (tab) => {
    setActiveTab(tab);
    setSortDir(tab === 'upcoming' ? 'asc' : 'desc');
  };

  const handleSort = (field) => {
    if (sortField === field) {
      setSortDir(d => d === 'desc' ? 'asc' : 'desc');
    } else {
      setSortField(field);
      setSortDir('desc');
    }
  };

  const handleTagSave = async (appointmentId, tagData) => {
    await axios.patch(`/api/lessons-dashboard/${appointmentId}/cancel-reason`, tagData);
    fetchLessons(pagination.page);
  };

  const tabs = [
    { key: 'upcoming', label: 'Upcoming' },
    { key: 'completed', label: 'Completed' },
    { key: 'cancelled', label: 'Cancelled' },
    { key: 'all', label: 'All' },
  ];

  const isCancelledView = activeTab === 'cancelled';

  const SortIcon = ({ field }) => {
    if (sortField !== field) return null;
    return sortDir === 'desc'
      ? <ChevronDownIcon className="h-3 w-3 inline ml-0.5" />
      : <ChevronUpIcon className="h-3 w-3 inline ml-0.5" />;
  };

  const hasActiveFilters = filters.cancelled_by || filters.cancellation_reason || filters.start_date || filters.end_date;

  return (
    <div className="p-4 sm:p-6 lg:p-8">
      {/* Search + Filters */}
      <div className="flex flex-col sm:flex-row sm:items-center gap-3 mb-4">
        <div className="relative flex-1 max-w-md">
          <MagnifyingGlassIcon className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-neutral-400" />
          <input
            type="text"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search by topic, client, or tutor..."
            className="w-full pl-9 pr-3 py-2 text-sm border border-neutral-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-[#6A469D]/20 focus:border-[#6A469D] transition-colors"
          />
        </div>
        <div className="flex items-center gap-2 flex-wrap">
          {isCancelledView && (
            <>
              <select
                value={filters.cancelled_by}
                onChange={(e) => setFilters(f => ({ ...f, cancelled_by: e.target.value }))}
                className="text-xs border border-neutral-300 rounded-md px-2 py-1.5 bg-white text-neutral-700 focus:outline-none focus:ring-2 focus:ring-[#6A469D]/20"
              >
                <option value="">All Sources</option>
                <option value="client">Client</option>
                <option value="tutor">Tutor</option>
                <option value="admin">Admin</option>
                <option value="unknown">Untagged</option>
              </select>
              <select
                value={filters.cancellation_reason}
                onChange={(e) => setFilters(f => ({ ...f, cancellation_reason: e.target.value }))}
                className="text-xs border border-neutral-300 rounded-md px-2 py-1.5 bg-white text-neutral-700 focus:outline-none focus:ring-2 focus:ring-[#6A469D]/20"
              >
                <option value="">All Reasons</option>
                {REASON_OPTIONS.map(r => <option key={r.value} value={r.value}>{r.label}</option>)}
              </select>
            </>
          )}
          <input
            type="date"
            value={filters.start_date}
            onChange={(e) => setFilters(f => ({ ...f, start_date: e.target.value }))}
            className="text-xs border border-neutral-300 rounded-md px-2 py-1.5 bg-white text-neutral-700 focus:outline-none focus:ring-2 focus:ring-[#6A469D]/20"
            title="From date"
          />
          <input
            type="date"
            value={filters.end_date}
            onChange={(e) => setFilters(f => ({ ...f, end_date: e.target.value }))}
            className="text-xs border border-neutral-300 rounded-md px-2 py-1.5 bg-white text-neutral-700 focus:outline-none focus:ring-2 focus:ring-[#6A469D]/20"
            title="To date"
          />
          {hasActiveFilters && (
            <button
              onClick={() => setFilters({ cancelled_by: '', cancellation_reason: '', start_date: '', end_date: '' })}
              className="text-xs text-[#6A469D] hover:text-[#4C3271] font-medium flex items-center gap-1 transition-colors"
            >
              <FunnelIcon className="h-3.5 w-3.5" /> Clear
            </button>
          )}
        </div>
      </div>

      {/* Tabs */}
      <div className="border-b border-neutral-200 mb-4">
        <nav className="flex gap-4 -mb-px">
          {tabs.map(tab => (
            <button
              key={tab.key}
              onClick={() => handleTabChange(tab.key)}
              className={classNames(
                'px-1 py-2.5 text-sm font-medium border-b-2 transition-colors',
                activeTab === tab.key
                  ? 'border-[#6A469D] text-[#6A469D]'
                  : 'border-transparent text-neutral-500 hover:text-neutral-700 hover:border-neutral-300'
              )}
            >
              {tab.label}
              {tabCounts[tab.key] != null && (
                <span className="ml-1.5 text-xs bg-neutral-100 text-neutral-600 px-1.5 py-0.5 rounded-full tabular-nums">
                  {tabCounts[tab.key]?.toLocaleString()}
                </span>
              )}
            </button>
          ))}
        </nav>
      </div>

      {error && (
        <div className="bg-[#FCE8F0] border border-[#DA2E72]/30 rounded-xl p-4 mb-4 flex items-center gap-3">
          <ExclamationTriangleIcon className="h-5 w-5 text-[#DA2E72] flex-shrink-0" />
          <p className="text-sm text-[#AE255B]">{error}</p>
        </div>
      )}

      {/* Table */}
      <div className="bg-white border border-neutral-200 rounded-xl shadow-sm overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-left">
            <thead>
              <tr className="border-b border-neutral-200 bg-neutral-50">
                <th className="px-4 py-2.5 text-[11px] font-medium text-neutral-500 uppercase tracking-wider cursor-pointer select-none" onClick={() => handleSort('start')}>
                  Date/Time <SortIcon field="start" />
                </th>
                <th className="px-4 py-2.5 text-[11px] font-medium text-neutral-500 uppercase tracking-wider">Client</th>
                <th className="px-4 py-2.5 text-[11px] font-medium text-neutral-500 uppercase tracking-wider">Student(s)</th>
                <th className="px-4 py-2.5 text-[11px] font-medium text-neutral-500 uppercase tracking-wider">Tutor</th>
                <th className="px-4 py-2.5 text-[11px] font-medium text-neutral-500 uppercase tracking-wider">Service / Topic</th>
                <th className="px-4 py-2.5 text-[11px] font-medium text-neutral-500 uppercase tracking-wider">Status</th>
                {(isCancelledView || activeTab === 'all') && (
                  <>
                    <th className="px-4 py-2.5 text-[11px] font-medium text-neutral-500 uppercase tracking-wider">Cancelled By</th>
                    <th className="px-4 py-2.5 text-[11px] font-medium text-neutral-500 uppercase tracking-wider">Reason</th>
                  </>
                )}
              </tr>
            </thead>
            <tbody className="divide-y divide-neutral-100">
              {loading ? (
                Array.from({ length: 8 }).map((_, i) => (
                  <tr key={i} className="animate-pulse">
                    {Array.from({ length: isCancelledView || activeTab === 'all' ? 8 : 6 }).map((_, j) => (
                      <td key={j} className="px-4 py-3">
                        <div className="h-4 bg-neutral-200 rounded w-3/4" />
                      </td>
                    ))}
                  </tr>
                ))
              ) : lessons.length === 0 ? (
                <tr>
                  <td colSpan={isCancelledView || activeTab === 'all' ? 8 : 6} className="px-4 py-12 text-center">
                    <CalendarDaysIcon className="h-8 w-8 text-neutral-300 mx-auto mb-2" />
                    <p className="text-sm text-neutral-500">No lessons found</p>
                  </td>
                </tr>
              ) : (
                lessons.map(lesson => {
                  const dt = lesson.start ? DateTime.fromISO(lesson.start) : null;
                  const isCancelled = lesson.status === 'cancelled' || lesson.status === 'cancelled-chargeable';
                  const isUntagged = isCancelled && (!lesson.cancelled_by || lesson.cancelled_by === 'unknown');
                  return (
                    <tr
                      key={lesson.appointment_id}
                      className={classNames(
                        'hover:bg-neutral-50 transition-colors cursor-pointer',
                        isUntagged && isCancelledView ? 'bg-[#FACC29]/5' : ''
                      )}
                    >
                      <td className="px-4 py-2">
                        <Link to={`/lessons/${lesson.appointment_id}`} className="block">
                          <div className="text-sm font-medium text-neutral-900 tabular-nums">
                            {dt ? dt.toFormat('MMM d, yyyy') : '—'}
                          </div>
                          <div className="text-xs text-neutral-500 tabular-nums">
                            {dt ? dt.toFormat('h:mm a') : ''}
                          </div>
                        </Link>
                      </td>
                      <td className="px-4 py-2">
                        <Link to={`/lessons/${lesson.appointment_id}`} className="block text-sm text-neutral-700 truncate max-w-[160px]">
                          {lesson.client_name || '—'}
                        </Link>
                      </td>
                      <td className="px-4 py-2">
                        <Link to={`/lessons/${lesson.appointment_id}`} className="block text-sm text-neutral-700 truncate max-w-[180px]">
                          {lesson.student_names || '—'}
                        </Link>
                      </td>
                      <td className="px-4 py-2">
                        <Link to={`/lessons/${lesson.appointment_id}`} className="block text-sm text-neutral-700 truncate max-w-[140px]">
                          {lesson.tutor_name || '—'}
                        </Link>
                      </td>
                      <td className="px-4 py-2">
                        <Link to={`/lessons/${lesson.appointment_id}`} className="block text-sm text-neutral-700 truncate max-w-[200px]">
                          {lesson.service_name || lesson.topic || '—'}
                        </Link>
                      </td>
                      <td className="px-4 py-2">
                        <StatusBadge status={lesson.status} />
                      </td>
                      {(isCancelledView || activeTab === 'all') && (
                        <>
                          <td className="px-4 py-2">
                            {isCancelled ? (
                              isUntagged ? (
                                <button
                                  onClick={(e) => { e.preventDefault(); e.stopPropagation(); setTagModalLesson(lesson); }}
                                  className="inline-flex items-center gap-1 text-xs font-medium text-[#C77A26] hover:text-[#6A469D] transition-colors"
                                >
                                  <TagIcon className="h-3.5 w-3.5" /> Tag
                                </button>
                              ) : (
                                <CancelledByBadge cancelledBy={lesson.cancelled_by} />
                              )
                            ) : (
                              <span className="text-neutral-300 text-xs">—</span>
                            )}
                          </td>
                          <td className="px-4 py-2">
                            {isCancelled ? <ReasonLabel reason={lesson.cancellation_reason} /> : <span className="text-neutral-300 text-xs">—</span>}
                          </td>
                        </>
                      )}
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>

        {/* Pagination */}
        {pagination.totalPages > 1 && (
          <div className="flex items-center justify-between px-4 py-3 border-t border-neutral-200 bg-neutral-50">
            <div className="text-xs text-neutral-500 tabular-nums">
              Showing {((pagination.page - 1) * pagination.limit) + 1}–{Math.min(pagination.page * pagination.limit, pagination.total)} of {pagination.total.toLocaleString()}
            </div>
            <div className="flex items-center gap-1">
              <button
                onClick={() => fetchLessons(pagination.page - 1)}
                disabled={pagination.page <= 1}
                className="p-1.5 rounded-md hover:bg-neutral-200 disabled:opacity-30 disabled:cursor-not-allowed transition-colors"
              >
                <ChevronLeftIcon className="h-4 w-4" />
              </button>
              <span className="text-xs text-neutral-600 px-2 tabular-nums">
                Page {pagination.page} of {pagination.totalPages}
              </span>
              <button
                onClick={() => fetchLessons(pagination.page + 1)}
                disabled={pagination.page >= pagination.totalPages}
                className="p-1.5 rounded-md hover:bg-neutral-200 disabled:opacity-30 disabled:cursor-not-allowed transition-colors"
              >
                <ChevronRightIcon className="h-4 w-4" />
              </button>
            </div>
          </div>
        )}
      </div>

      {tagModalLesson && (
        <TagCancellationModal
          lesson={tagModalLesson}
          onClose={() => setTagModalLesson(null)}
          onSave={handleTagSave}
        />
      )}
    </div>
  );
}

// === Cancellation Report Tab ===

function CancellationReportTab() {
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [report, setReport] = useState(null);
  const [dateRange, setDateRange] = useState('90d');
  const [cancellerView, setCancellerView] = useState('client');
  const [tagModalLesson, setTagModalLesson] = useState(null);

  const dateRangeOptions = [
    { value: '30d', label: '30 days' },
    { value: '60d', label: '60 days' },
    { value: '90d', label: '90 days' },
    { value: '180d', label: '6 months' },
  ];

  const fetchReport = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const days = parseInt(dateRange);
      const startDate = DateTime.now().minus({ days }).toISODate();
      const endDate = DateTime.now().toISODate();
      const { data } = await axios.get(`/api/lessons-dashboard/cancellation-report?start_date=${startDate}&end_date=${endDate}`);
      setReport(data);
    } catch (err) {
      setError(err.response?.data?.error || 'Failed to load report');
    } finally {
      setLoading(false);
    }
  }, [dateRange]);

  useEffect(() => { fetchReport(); }, [fetchReport]);

  const handleTagSave = async (appointmentId, tagData) => {
    await axios.patch(`/api/lessons-dashboard/${appointmentId}/cancel-reason`, tagData);
    fetchReport();
  };

  const summary = report?.summary || {};
  const topCancellers = cancellerView === 'client'
    ? (report?.topCancellersByClient || [])
    : (report?.topCancellersByTutor || []);

  return (
    <div className="p-4 sm:p-6 lg:p-8 space-y-6">
      {/* Header + Date Range */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
        <p className="text-sm text-neutral-500">Cancellation patterns and attribution</p>
        <div className="flex items-center gap-2">
          {dateRangeOptions.map(opt => (
            <button
              key={opt.value}
              onClick={() => setDateRange(opt.value)}
              className={classNames(
                'px-3 py-1.5 text-xs font-medium rounded-md border transition-all',
                dateRange === opt.value
                  ? 'border-[#6A469D] bg-primary-50 text-[#6A469D]'
                  : 'border-neutral-300 text-neutral-600 hover:border-neutral-400 bg-white'
              )}
            >
              {opt.label}
            </button>
          ))}
          <button
            onClick={fetchReport}
            disabled={loading}
            className="inline-flex items-center gap-1 px-3 py-1.5 text-xs font-medium rounded-md border border-neutral-300 bg-white text-neutral-700 hover:bg-neutral-50 transition-all disabled:opacity-50"
          >
            <ArrowPathIcon className={classNames('h-3.5 w-3.5', loading && 'animate-spin')} />
          </button>
        </div>
      </div>

      {error && (
        <div className="bg-[#FCE8F0] border border-[#DA2E72]/30 rounded-xl p-4 flex items-center gap-3">
          <ExclamationTriangleIcon className="h-5 w-5 text-[#DA2E72] flex-shrink-0" />
          <p className="text-sm text-[#AE255B]">{error}</p>
        </div>
      )}

      {/* KPI Cards */}
      {loading ? (
        <div className="grid grid-cols-2 sm:grid-cols-5 gap-3">
          {Array.from({ length: 5 }).map((_, i) => (
            <div key={i} className="bg-white border border-neutral-200 rounded-xl p-5 animate-pulse">
              <div className="h-3 bg-neutral-200 rounded w-1/2 mb-3" />
              <div className="h-7 bg-neutral-200 rounded w-1/3" />
            </div>
          ))}
        </div>
      ) : (
        <div className="grid grid-cols-2 sm:grid-cols-5 gap-3">
          <KPICard label="Total Cancelled" value={summary.totalCancelled?.toLocaleString() || '0'} icon={CalendarDaysIcon} />
          <KPICard label="Cancellation Rate" value={`${(summary.cancellationRate || 0).toFixed(1)}%`} subtitle="of completed + cancelled" icon={ExclamationTriangleIcon} accent="text-[#AE255B]" />
          <KPICard label="Client-Caused" value={summary.clientCaused?.toLocaleString() || '0'} subtitle={summary.totalCancelled > 0 ? `${((summary.clientCaused / summary.totalCancelled) * 100).toFixed(0)}%` : ''} icon={UserIcon} accent="text-[#AE255B]" />
          <KPICard label="Tutor-Caused" value={summary.tutorCaused?.toLocaleString() || '0'} subtitle={summary.totalCancelled > 0 ? `${((summary.tutorCaused / summary.totalCancelled) * 100).toFixed(0)}%` : ''} icon={AcademicCapIcon} accent="text-[#C77A26]" />
          <KPICard label="Untagged" value={summary.untagged?.toLocaleString() || '0'} subtitle="Need attribution" icon={TagIcon} accent="text-[#C77A26]" />
        </div>
      )}

      {/* Top Cancellers */}
      <div className="bg-white border border-neutral-200 rounded-xl shadow-sm overflow-hidden">
        <div className="px-4 sm:px-6 py-3 border-b border-neutral-100 flex items-center justify-between">
          <h3 className="text-base font-semibold text-neutral-900">Top Cancellers</h3>
          <div className="flex items-center gap-1 bg-neutral-100 rounded-lg p-0.5">
            <button
              onClick={() => setCancellerView('client')}
              className={classNames(
                'px-3 py-1 text-xs font-medium rounded-md transition-all',
                cancellerView === 'client' ? 'bg-white text-neutral-900 shadow-sm' : 'text-neutral-500 hover:text-neutral-700'
              )}
            >
              By Client
            </button>
            <button
              onClick={() => setCancellerView('tutor')}
              className={classNames(
                'px-3 py-1 text-xs font-medium rounded-md transition-all',
                cancellerView === 'tutor' ? 'bg-white text-neutral-900 shadow-sm' : 'text-neutral-500 hover:text-neutral-700'
              )}
            >
              By Tutor
            </button>
          </div>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-left">
            <thead>
              <tr className="border-b border-neutral-200 bg-neutral-50">
                <th className="px-4 py-2.5 text-[11px] font-medium text-neutral-500 uppercase tracking-wider">Name</th>
                <th className="px-4 py-2.5 text-[11px] font-medium text-neutral-500 uppercase tracking-wider text-right">Cancelled</th>
                <th className="px-4 py-2.5 text-[11px] font-medium text-neutral-500 uppercase tracking-wider text-right">% of Lessons</th>
                <th className="px-4 py-2.5 text-[11px] font-medium text-neutral-500 uppercase tracking-wider">Most Common Reason</th>
                <th className="px-4 py-2.5 text-[11px] font-medium text-neutral-500 uppercase tracking-wider">Last Cancelled</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-neutral-100">
              {loading ? (
                Array.from({ length: 5 }).map((_, i) => (
                  <tr key={i} className="animate-pulse">
                    {Array.from({ length: 5 }).map((_, j) => (
                      <td key={j} className="px-4 py-3"><div className="h-4 bg-neutral-200 rounded w-3/4" /></td>
                    ))}
                  </tr>
                ))
              ) : topCancellers.length === 0 ? (
                <tr>
                  <td colSpan={5} className="px-4 py-8 text-center text-sm text-neutral-500">
                    No cancellation data available for this period
                  </td>
                </tr>
              ) : (
                topCancellers.map((row, i) => {
                  const linkTo = cancellerView === 'client'
                    ? `/clients/${row.client_id}`
                    : `/tutors/${row.contractor_id}`;
                  return (
                    <tr key={i} className="hover:bg-neutral-50 transition-colors">
                      <td className="px-4 py-2.5">
                        <Link to={linkTo} className="text-sm font-medium text-[#6A469D] hover:text-[#4C3271] transition-colors">
                          {row.name}
                        </Link>
                      </td>
                      <td className="px-4 py-2.5 text-sm text-neutral-900 text-right tabular-nums font-medium">
                        {row.totalCancelled}
                      </td>
                      <td className="px-4 py-2.5 text-sm text-neutral-600 text-right tabular-nums">
                        {row.percentOfLessons != null ? `${row.percentOfLessons.toFixed(1)}%` : '—'}
                      </td>
                      <td className="px-4 py-2.5">
                        <ReasonLabel reason={row.mostCommonReason} />
                      </td>
                      <td className="px-4 py-2.5 text-xs text-neutral-500 tabular-nums">
                        {row.lastCancelled ? DateTime.fromISO(row.lastCancelled).toFormat('MMM d, yyyy') : '—'}
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
      </div>

      {tagModalLesson && (
        <TagCancellationModal
          lesson={tagModalLesson}
          onClose={() => setTagModalLesson(null)}
          onSave={handleTagSave}
        />
      )}
    </div>
  );
}

// === Main Dashboard ===

const PAGE_TABS = [
  { id: 'lessons', label: 'Lessons' },
  { id: 'cancellations', label: 'Cancellation Report' },
];

export default function LessonsDashboard() {
  const [searchParams, setSearchParams] = useSearchParams();
  const initialView = searchParams.get('view') || 'lessons';
  const [activeView, setActiveView] = useState(initialView);

  const handleViewChange = (view) => {
    setActiveView(view);
    const params = new URLSearchParams(searchParams);
    if (view === 'lessons') {
      params.delete('view');
    } else {
      params.set('view', view);
    }
    setSearchParams(params, { replace: true });
  };

  return (
    <div>
      {/* View toggle tabs — identical to JobsDashboard */}
      <div className="border-b border-neutral-200 bg-white px-4 sm:px-6 lg:px-8">
        <nav className="flex gap-6 -mb-px">
          {PAGE_TABS.map(tab => (
            <button
              key={tab.id}
              onClick={() => handleViewChange(tab.id)}
              className={classNames(
                'px-1 py-3 text-sm font-medium border-b-2 transition-colors',
                activeView === tab.id
                  ? 'border-[#6A469D] text-[#6A469D]'
                  : 'border-transparent text-neutral-500 hover:text-neutral-700 hover:border-neutral-300'
              )}
            >
              {tab.label}
            </button>
          ))}
        </nav>
      </div>

      {activeView === 'lessons' && <LessonsTab searchParams={searchParams} />}
      {activeView === 'cancellations' && <CancellationReportTab />}
    </div>
  );
}
