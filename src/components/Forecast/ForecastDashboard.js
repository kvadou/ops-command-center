import React, { useState, useEffect, useMemo, useCallback, useRef } from 'react';
import { useToast } from '../../hooks/useToast';
import { DateTime } from 'luxon';
import DateRangePicker from '../DateRangePicker';
import ForecastTimeline from './ForecastTimeline';
import StaleJobsList from './StaleJobsList';
import TargetConfigModal from './TargetConfigModal';
import ForecastTargetsModal from './ForecastTargetsModal';
import CompletionRatesDeepDive from './CompletionRatesDeepDive';
import ForecastKPIModal from './ForecastKPIModal';
import Tooltip from '@mui/material/Tooltip';
import {
  ExclamationTriangleIcon,
  Cog6ToothIcon,
  ArrowPathIcon,
  ChevronDownIcon,
} from '@heroicons/react/24/outline';

// Channel tabs - matches AnalyticsDashboard pattern
const CHANNEL_TABS = ['All', 'Home', 'Online', 'Clubs', 'Schools'];

// Scenario options
const SCENARIOS = [
  { id: 'realistic', label: 'Realistic', description: 'Based on 6-month historical completion rates per channel' },
  { id: 'best_case', label: 'Best Case', description: 'Based on peak monthly completion rates per channel' },
  { id: 'worst_case', label: 'Worst Case', description: 'Based on recent 4-week completion rates per channel' },
];

// Note: Projected tab removed - showing only scheduled data for now

// Forecast-specific date range presets (forward-looking)
const FORECAST_PRESETS = [
  { group: 'Pay Cycle', presets: ['currentPayCycle', 'nextPayCycle'] },
  { group: 'Weekly', presets: ['thisWeek', 'nextWeek'] },
  { group: 'Monthly', presets: ['thisMonth', 'next30Days', 'next90Days'] },
  { group: 'Quarterly', presets: ['currentQuarter', 'nextQuarter'] },
  { group: 'Yearly', presets: ['thisYear', 'nextYear'] },
  { group: 'Custom', presets: ['custom'] },
];

function classNames(...classes) {
  return classes.filter(Boolean).join(' ');
}

// Section component - matches AnalyticsDashboard
function Section({ title, children, actions }) {
  return (
    <section className="bg-white border border-neutral-200 rounded-xl shadow-sm">
      <div className="flex items-center justify-between px-4 sm:px-6 py-3 border-b border-neutral-100">
        <h3 className="text-base sm:text-lg font-semibold text-brand-navy font-heading">{title}</h3>
        {actions}
      </div>
      <div className="p-4 sm:p-6">{children}</div>
    </section>
  );
}

// KPI Card component - matches AnalyticsDashboard
function KPICard({ label, value, target, variance, onClick, subtitle, isProjected, tooltip, scenarioLabel }) {
  const hasVariance = typeof variance === 'number';
  const positive = hasVariance && variance >= 0;
  const varianceText = hasVariance ? `${positive ? '+' : ''}${variance.toFixed(1)}% vs Target` : undefined;

  const card = (
    <button
      onClick={onClick}
      className="group w-full text-left bg-white border border-neutral-200 rounded-xl p-4 sm:p-5 shadow-sm hover:shadow transition-shadow focus:outline-none"
    >
      <div className="flex items-center justify-between">
        <div className="text-xs text-neutral-500">{label}</div>
        {scenarioLabel && (
          <span className="text-[10px] px-1.5 py-0.5 rounded bg-purple-50 text-purple-600 font-medium">
            {scenarioLabel}
          </span>
        )}
        {isProjected && !scenarioLabel && (
          <span className="text-[10px] px-1.5 py-0.5 rounded bg-amber-50 text-amber-700 font-medium">
            Projected
          </span>
        )}
      </div>
      <div className="mt-1 flex items-baseline gap-2">
        <div className="text-2xl sm:text-3xl font-semibold text-brand-navy">{value}</div>
        {varianceText && (
          <span
            className={classNames(
              'text-xs px-1.5 py-0.5 rounded-md',
              positive ? 'bg-green-50 text-green-700' : 'bg-red-50 text-red-700'
            )}
          >
            {varianceText}
          </span>
        )}
      </div>
      {target && (
        <div className="mt-1 text-xs text-neutral-500">
          Target: {target}
        </div>
      )}
      {subtitle && <div className="mt-1 text-xs text-neutral-500">{subtitle}</div>}
    </button>
  );

  if (tooltip) {
    return (
      <Tooltip title={tooltip} arrow placement="top" enterDelay={300}>
        <div>{card}</div>
      </Tooltip>
    );
  }
  return card;
}

// Progress KPI Card - shows stacked breakdown of completed + pending + scheduled + projected
function ProgressKPICard({ label, completed, pending, scheduled, projected, target, onClick, formatValue, tooltip, realisticTotal, scenarioLabel }) {
  const rawTotal = completed + (pending || 0) + scheduled + (projected || 0);
  const displayTotal = realisticTotal != null ? realisticTotal : rawTotal;
  const completedPct = target ? (completed / target) * 100 : 0;
  const pendingPct = target && pending ? (pending / target) * 100 : 0;
  const scheduledPct = target ? (scheduled / target) * 100 : 0;
  const projectedPct = target && projected ? (projected / target) * 100 : 0;
  const usedPct = Math.min(completedPct + pendingPct, 100);

  const format = formatValue || ((v) => v.toLocaleString());

  const card = (
    <button
      onClick={onClick}
      className="group w-full text-left bg-white border border-neutral-200 rounded-xl p-4 sm:p-5 shadow-sm hover:shadow transition-shadow focus:outline-none"
    >
      <div className="flex items-center justify-between mb-1">
        <div className="text-xs text-neutral-500">{label}</div>
        {scenarioLabel && (
          <span className="text-[10px] px-1.5 py-0.5 rounded bg-purple-50 text-purple-600 font-medium">
            {scenarioLabel}
          </span>
        )}
      </div>
      <div className="flex items-baseline gap-2">
        <div className="text-2xl sm:text-3xl font-semibold text-brand-navy">
          {format(displayTotal)}
        </div>
        {target && (
          <span className="text-sm text-neutral-400">
            / {format(target)}
          </span>
        )}
      </div>

      {/* Progress bar */}
      {target && (
        <div className="h-2 bg-neutral-100 rounded-full mt-3 overflow-hidden">
          <div className="h-full flex">
            <div
              className="bg-green-500 transition-all duration-300"
              style={{ width: `${Math.min(completedPct, 100)}%` }}
            />
            {pending > 0 && (
              <div
                className="bg-amber-400 transition-all duration-300"
                style={{ width: `${Math.min(pendingPct, 100 - Math.min(completedPct, 100))}%` }}
              />
            )}
            <div
              className="bg-blue-500 transition-all duration-300"
              style={{ width: `${Math.min(scheduledPct, 100 - usedPct)}%` }}
            />
            {projected > 0 && (
              <div
                className="bg-purple-300 transition-all duration-300"
                style={{ width: `${Math.min(projectedPct, 100 - Math.min(usedPct + scheduledPct, 100))}%` }}
              />
            )}
          </div>
        </div>
      )}

      {/* Legend */}
      <div className="flex flex-wrap gap-3 mt-2 text-xs text-neutral-500">
        <span className="flex items-center gap-1.5">
          <span className="w-2 h-2 bg-green-500 rounded-full" />
          Completed: {format(completed)}
        </span>
        {pending > 0 && (
          <span className="flex items-center gap-1.5">
            <span className="w-2 h-2 bg-amber-400 rounded-full" />
            Pending: {format(pending)}
          </span>
        )}
        <span className="flex items-center gap-1.5">
          <span className="w-2 h-2 bg-blue-500 rounded-full" />
          Scheduled: {format(scheduled)}
        </span>
        {projected > 0 && (
          <span className="flex items-center gap-1.5">
            <span className="w-2 h-2 bg-purple-300 rounded-full" />
            Projected: {format(projected)}
          </span>
        )}
      </div>
    </button>
  );

  if (tooltip) {
    return (
      <Tooltip title={tooltip} arrow placement="top" enterDelay={300}>
        <div>{card}</div>
      </Tooltip>
    );
  }
  return card;
}

// Pace Indicator - shows progress through period vs progress toward target
function PaceIndicator({ pace }) {
  if (!pace || pace.status === 'unknown') return null;

  const { days_elapsed, total_days, time_percent, revenue_percent, status, delta } = pace;

  const statusConfig = {
    ahead: {
      bg: 'bg-green-50',
      border: 'border-green-200',
      text: 'text-green-800',
      badge: 'bg-green-100 text-green-800',
      label: 'Ahead of pace'
    },
    on_track: {
      bg: 'bg-blue-50',
      border: 'border-blue-200',
      text: 'text-blue-800',
      badge: 'bg-blue-100 text-blue-800',
      label: 'On track'
    },
    behind: {
      bg: 'bg-red-50',
      border: 'border-red-200',
      text: 'text-red-800',
      badge: 'bg-red-100 text-red-800',
      label: 'Behind pace'
    }
  };

  const config = statusConfig[status] || statusConfig.on_track;

  return (
    <div className={classNames(
      'px-4 py-3 rounded-lg border',
      config.bg,
      config.border
    )}>
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2">
        <div className={classNames('flex items-center gap-4 text-sm', config.text)}>
          <span className="font-medium">
            {days_elapsed} of {total_days} days ({time_percent}%)
          </span>
          {revenue_percent !== null && (
            <span>
              {revenue_percent}% of revenue target achieved
            </span>
          )}
        </div>
        <span className={classNames(
          'px-2.5 py-1 rounded text-xs font-medium self-start sm:self-auto',
          config.badge
        )}>
          {config.label} {delta !== null && `(${delta >= 0 ? '+' : ''}${delta}%)`}
        </span>
      </div>
    </div>
  );
}

// Tab Switcher component - matches AnalyticsDashboard
function TabSwitcher({ activeTab, onChange }) {
  return (
    <div className="flex flex-wrap gap-2">
      {CHANNEL_TABS.map((tab) => (
        <button
          key={tab}
          onClick={() => onChange(tab)}
          className={classNames(
            'px-3 py-2 sm:px-3 sm:py-1.5 rounded-md text-sm font-medium transition-colors touch-manipulation',
            'min-h-[44px] sm:min-h-0',
            activeTab === tab
              ? 'bg-brand-purple text-white shadow-sm'
              : 'bg-white text-neutral-700 hover:bg-neutral-50 active:bg-neutral-100 border border-neutral-200'
          )}
        >
          {tab}
        </button>
      ))}
    </div>
  );
}

// Scenario Selector dropdown
function ScenarioSelector({ value, onChange }) {
  const [open, setOpen] = useState(false);
  const selected = SCENARIOS.find(s => s.id === value) || SCENARIOS[0];

  return (
    <div className="relative">
      <button
        onClick={() => setOpen(!open)}
        className="flex items-center gap-2 px-3 py-2 rounded-md text-sm font-medium bg-white border border-neutral-200 hover:bg-neutral-50 min-h-[44px] sm:min-h-0"
      >
        <span>{selected.label}</span>
        <ChevronDownIcon className={classNames('h-4 w-4 transition-transform', open && 'rotate-180')} />
      </button>
      {open && (
        <>
          <div className="fixed inset-0 z-10" onClick={() => setOpen(false)} />
          <div className="absolute right-0 mt-1 w-64 bg-white rounded-lg shadow-lg border border-neutral-200 z-20">
            {SCENARIOS.map((scenario) => (
              <button
                key={scenario.id}
                onClick={() => {
                  onChange(scenario.id);
                  setOpen(false);
                }}
                className={classNames(
                  'w-full text-left px-4 py-3 hover:bg-neutral-50 first:rounded-t-lg last:rounded-b-lg',
                  value === scenario.id && 'bg-brand-purple/5'
                )}
              >
                <div className="font-medium text-sm">{scenario.label}</div>
                <div className="text-xs text-neutral-500">{scenario.description}</div>
              </button>
            ))}
          </div>
        </>
      )}
    </div>
  );
}

// Forecast Tab Switcher (Scheduled vs Projected)
// ForecastTabSwitcher removed - showing only scheduled data

// Drilldown Modal for KPI cards with server-side pagination
const DRILLDOWN_PAGE_SIZE = 100;

function DrilldownModal({ open, onClose, title, fetchPage, initialData, initialPagination }) {
  const [query, setQuery] = useState('');
  const [page, setPage] = useState(0);
  const [data, setData] = useState(initialData || []);
  const [pagination, setPagination] = useState(initialPagination || { total: 0, total_pages: 0 });
  const [loading, setLoading] = useState(false);
  const [expandedRow, setExpandedRow] = useState(null); // Track which row is expanded

  // Reset and load initial data when modal opens
  useEffect(() => {
    if (open && initialData) {
      setData(initialData);
      setPagination(initialPagination || { total: 0, total_pages: 0 });
      setPage(0);
      setQuery('');
    }
  }, [open, initialData, initialPagination]);

  // Fetch new page when page changes
  useEffect(() => {
    if (!open || !fetchPage || page === 0) return; // Skip initial page (already loaded)

    const loadPage = async () => {
      setLoading(true);
      try {
        const result = await fetchPage(page);
        setData(result.lessons || []);
        setPagination(result.pagination || { total: 0, total_pages: 0 });
      } catch (err) {
        console.error('Failed to fetch page:', err);
      } finally {
        setLoading(false);
      }
    };
    loadPage();
  }, [page, open, fetchPage]);

  if (!open) return null;

  // Client-side search filtering (on current page data)
  const filteredData = data?.filter(row => {
    if (!query) return true;
    const searchStr = Object.values(row).join(' ').toLowerCase();
    return searchStr.includes(query.toLowerCase());
  }) || [];

  const totalPages = pagination.total_pages || Math.ceil(filteredData.length / DRILLDOWN_PAGE_SIZE);
  const paginatedData = query ? filteredData : data; // If searching, show filtered; otherwise show fetched page

  const handleExport = () => {
    if (!filteredData.length) return;

    const headers = Object.keys(filteredData[0]);
    const csvContent = [
      headers.join(','),
      ...filteredData.map(row => headers.map(h => {
        const val = row[h];
        if (typeof val === 'string' && val.includes(',')) return `"${val}"`;
        return val ?? '';
      }).join(','))
    ].join('\n');

    const blob = new Blob([csvContent], { type: 'text/csv' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `${title.replace(/[^a-zA-Z0-9]/g, '_')}.csv`;
    a.click();
  };

  // Detect if showing pattern insights vs scheduled lessons
  const isPatternView = title?.includes('Pattern');

  // Columns for scheduled lessons (TutorCruncher appointments)
  const SCHEDULED_COLUMNS = [
    { key: 'source_type', label: 'Type', width: 'w-16' },
    { key: 'date', label: 'Date', width: 'w-24' },
    { key: 'job_name', label: 'Job', width: 'w-44' },
    { key: 'recipient_name', label: 'Student', width: 'w-32' },
    { key: 'contractor_name', label: 'Tutor', width: 'w-32' },
    { key: 'expected_revenue', label: 'Revenue', width: 'w-20' },
    { key: 'expected_tutor_pay', label: 'Pay', width: 'w-20' },
    { key: 'appointment_id', label: 'TC ID', width: 'w-28' },
  ];

  // Columns for pattern insights (projections) - click row to expand details
  const PATTERN_COLUMNS = [
    { key: 'expand', label: '', width: 'w-8' },
    { key: 'job_name', label: 'Job', width: 'w-44' },
    { key: 'client_name', label: 'Client', width: 'w-32' },
    { key: 'channel', label: 'Channel', width: 'w-20' },
    { key: 'frequency', label: 'Frequency', width: 'w-24' },
    { key: 'last_lesson_date', label: 'Last Lesson', width: 'w-24' },
    { key: 'projected_lessons', label: 'Proj.', width: 'w-16' },
    { key: 'expected_revenue', label: 'Revenue', width: 'w-20' },
    { key: 'expected_tutor_pay', label: 'Pay', width: 'w-20' },
    { key: 'margin', label: 'Margin', width: 'w-20' },
  ];

  const DISPLAY_COLUMNS = isPatternView ? PATTERN_COLUMNS : SCHEDULED_COLUMNS;

  return (
    <div className="fixed inset-0 z-50">
      <div className="absolute inset-0 bg-black/30" onClick={onClose} />
      <div className="absolute inset-4 sm:inset-8 flex items-start justify-center pt-4 sm:pt-8">
        <div className="w-full max-w-6xl bg-white rounded-xl shadow-xl border border-neutral-200 overflow-hidden max-h-[85vh] flex flex-col">
          <div className="flex items-center justify-between px-4 sm:px-6 py-3 border-b border-neutral-100 bg-neutral-50">
            <h3 className="text-base sm:text-lg font-semibold text-brand-navy">{title}</h3>
            <div className="flex items-center gap-2">
              <span className="text-xs text-neutral-500">{pagination.total?.toLocaleString() || filteredData.length} total</span>
              <button
                onClick={handleExport}
                className="px-3 py-1.5 text-xs sm:text-sm bg-brand-purple text-white rounded-md hover:bg-purple-700"
              >
                Export CSV
              </button>
              <button onClick={onClose} className="text-neutral-500 hover:text-neutral-700 p-1">
                <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            </div>
          </div>
          <div className="px-4 sm:px-6 py-2 border-b border-neutral-100">
            <input
              value={query}
              onChange={(e) => { setQuery(e.target.value); setPage(0); }}
              placeholder="Search by job, student, or tutor..."
              className="w-full px-3 py-2 text-sm border border-neutral-200 rounded-md"
            />
          </div>
          <div className="flex-1 overflow-y-auto px-4 sm:px-6 py-2 relative">
            {loading && (
              <div className="absolute inset-0 bg-white/70 flex items-center justify-center z-10">
                <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-purple-600"></div>
              </div>
            )}
            {paginatedData.length === 0 && !loading ? (
              <div className="text-center text-neutral-500 py-8">No data available</div>
            ) : (
              <table className="w-full text-sm table-fixed">
                <thead className="sticky top-0 bg-white">
                  <tr className="text-left text-neutral-600 border-b">
                    {DISPLAY_COLUMNS.map(col => (
                      <th key={col.key} className={`py-2 pr-2 text-xs font-medium uppercase ${col.width}`}>
                        {col.label}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {paginatedData.map((row, idx) => {
                    const isExpanded = expandedRow === idx;
                    const revenue = Number(row.expected_revenue || 0);
                    const pay = Number(row.expected_tutor_pay || 0);
                    const margin = revenue - pay;
                    const marginPct = revenue > 0 ? (margin / revenue) * 100 : 0;
                    const isLowMargin = marginPct < 30;
                    const isNegativeMargin = marginPct <= 0;

                    return (
                      <React.Fragment key={idx}>
                        <tr
                          className={classNames(
                            'border-t border-neutral-100 hover:bg-neutral-50',
                            isPatternView && 'cursor-pointer',
                            isExpanded && 'bg-purple-50',
                            isNegativeMargin && 'bg-red-50/50'
                          )}
                          onClick={() => isPatternView && setExpandedRow(isExpanded ? null : idx)}
                        >
                          {DISPLAY_COLUMNS.map(col => {
                            const val = row[col.key];
                            return (
                              <td key={col.key} className={`py-2 pr-2 text-neutral-800 truncate ${col.width}`}>
                                {col.key === 'expand' ? (
                                  <ChevronDownIcon className={classNames(
                                    'h-4 w-4 text-neutral-400 transition-transform',
                                    isExpanded && 'rotate-180'
                                  )} />
                                ) : col.key === 'margin' ? (
                                  <span className={classNames(
                                    'font-medium text-xs',
                                    isNegativeMargin ? 'text-red-600' :
                                    isLowMargin ? 'text-amber-600' :
                                    'text-green-600'
                                  )}>
                                    {marginPct.toFixed(0)}%
                                  </span>
                                ) : col.key === 'appointment_id' && val ? (
                                  <a
                                    href={`https://account.acmeops.com/cal/appointments/${val}/`}
                                    target="_blank"
                                    rel="noreferrer"
                                    className="text-brand-purple hover:underline text-xs font-mono"
                                    title={`Open appointment ${val} in TutorCruncher`}
                                    onClick={(e) => e.stopPropagation()}
                                  >
                                    {val} →
                                  </a>
                                ) : col.key === 'source_type' ? (
                                  <span className={classNames(
                                    'px-1.5 py-0.5 rounded text-xs font-medium',
                                    val === 'scheduled' ? 'bg-green-100 text-green-700' : 'bg-amber-100 text-amber-700'
                                  )}>
                                    {val === 'scheduled' ? 'TC' : 'Proj'}
                                  </span>
                                ) : col.key.includes('revenue') || col.key.includes('pay') ? (
                                  <span className="font-medium">${Number(val || 0).toLocaleString()}</span>
                                ) : (col.key === 'date' || col.key === 'last_lesson_date') && val ? (
                                  DateTime.fromISO(val).toFormat('MMM d')
                                ) : col.key === 'projected_lessons' ? (
                                  <span className="font-medium text-amber-700">{Number(val || 0).toLocaleString()}</span>
                                ) : col.key === 'channel' ? (
                                  <span className={classNames(
                                    'px-1.5 py-0.5 rounded text-xs font-medium',
                                    val === 'Home' ? 'bg-blue-100 text-blue-700' :
                                    val === 'Online' ? 'bg-purple-100 text-purple-700' :
                                    val === 'Clubs' ? 'bg-green-100 text-green-700' :
                                    val === 'Schools' ? 'bg-orange-100 text-orange-700' :
                                    'bg-neutral-100 text-neutral-700'
                                  )}>
                                    {val || '-'}
                                  </span>
                                ) : col.key === 'frequency' ? (
                                  <span className="text-xs text-neutral-600">{val || '-'}</span>
                                ) : (
                                  <span className="truncate" title={String(val ?? '-')}>{String(val ?? '-')}</span>
                                )}
                              </td>
                            );
                          })}
                        </tr>
                        {/* Expanded row with calculation breakdown */}
                        {isExpanded && isPatternView && (
                          <tr className="bg-purple-50 border-t border-purple-100">
                            <td colSpan={DISPLAY_COLUMNS.length} className="px-4 py-3">
                              <div className="grid grid-cols-2 md:grid-cols-4 gap-4 text-xs">
                                <div className="bg-white rounded-lg p-3 border border-purple-100">
                                  <div className="text-neutral-500 uppercase text-[10px] font-medium">Per-Lesson Rate</div>
                                  <div className="mt-1 font-semibold text-neutral-900">
                                    ${(revenue / (row.projected_lessons || 1)).toFixed(2)}
                                  </div>
                                  <div className="text-neutral-500 mt-0.5">charge rate</div>
                                </div>
                                <div className="bg-white rounded-lg p-3 border border-purple-100">
                                  <div className="text-neutral-500 uppercase text-[10px] font-medium">Per-Lesson Pay</div>
                                  <div className="mt-1 font-semibold text-neutral-900">
                                    ${(pay / (row.projected_lessons || 1)).toFixed(2)}
                                  </div>
                                  <div className="text-neutral-500 mt-0.5">tutor pay</div>
                                </div>
                                <div className="bg-white rounded-lg p-3 border border-purple-100">
                                  <div className="text-neutral-500 uppercase text-[10px] font-medium">Margin Per Lesson</div>
                                  <div className={classNames(
                                    'mt-1 font-semibold',
                                    isNegativeMargin ? 'text-red-600' : isLowMargin ? 'text-amber-600' : 'text-green-600'
                                  )}>
                                    ${(margin / (row.projected_lessons || 1)).toFixed(2)}
                                  </div>
                                  <div className="text-neutral-500 mt-0.5">{marginPct.toFixed(1)}% margin</div>
                                </div>
                                <div className="bg-white rounded-lg p-3 border border-purple-100">
                                  <div className="text-neutral-500 uppercase text-[10px] font-medium">Pattern Source</div>
                                  <div className="mt-1 font-semibold text-neutral-900">
                                    {row.recent_lessons || row.lesson_count_last_90_days || '?'} lessons
                                  </div>
                                  <div className="text-neutral-500 mt-0.5">in last 90 days</div>
                                </div>
                              </div>
                              <div className="mt-3 flex items-center gap-4 text-xs text-neutral-600">
                                <span>
                                  <strong>Calculation:</strong> {row.projected_lessons} lessons × ${(revenue / (row.projected_lessons || 1)).toFixed(2)} = ${revenue.toLocaleString()} revenue
                                </span>
                                {row.service_id && (
                                  <a
                                    href={`https://account.acmeops.com/cal/service/${row.service_id}/`}
                                    target="_blank"
                                    rel="noreferrer"
                                    className="text-brand-purple hover:underline"
                                    onClick={(e) => e.stopPropagation()}
                                  >
                                    View job in TC →
                                  </a>
                                )}
                              </div>
                              {isNegativeMargin && (
                                <div className="mt-2 px-3 py-2 bg-red-100 border border-red-200 rounded-md text-red-800 text-xs">
                                  ⚠️ <strong>Zero/negative margin:</strong> Check if charge rate is set correctly for this job. Pay rate equals or exceeds charge rate.
                                </div>
                              )}
                            </td>
                          </tr>
                        )}
                      </React.Fragment>
                    );
                  })}
                </tbody>
              </table>
            )}
          </div>
          {/* Pagination */}
          {totalPages > 1 && (
            <div className="flex items-center justify-between px-6 py-3 border-t border-neutral-100 bg-neutral-50">
              <span className="text-xs text-neutral-500">
                {loading ? 'Loading...' : (
                  <>Showing {page * DRILLDOWN_PAGE_SIZE + 1} - {Math.min((page + 1) * DRILLDOWN_PAGE_SIZE, pagination.total)} of {pagination.total.toLocaleString()}</>
                )}
              </span>
              <div className="flex items-center gap-2">
                <button
                  onClick={() => setPage(0)}
                  disabled={page === 0 || loading}
                  className="px-2 py-1 text-sm border border-neutral-200 rounded hover:bg-neutral-100 disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  First
                </button>
                <button
                  onClick={() => setPage(p => Math.max(0, p - 1))}
                  disabled={page === 0 || loading}
                  className="px-2 py-1 text-sm border border-neutral-200 rounded hover:bg-neutral-100 disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  Prev
                </button>
                <span className="text-sm text-neutral-600">
                  Page {page + 1} of {totalPages}
                </span>
                <button
                  onClick={() => setPage(p => Math.min(totalPages - 1, p + 1))}
                  disabled={page >= totalPages - 1 || loading}
                  className="px-2 py-1 text-sm border border-neutral-200 rounded hover:bg-neutral-100 disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  Next
                </button>
                <button
                  onClick={() => setPage(totalPages - 1)}
                  disabled={page >= totalPages - 1 || loading}
                  className="px-2 py-1 text-sm border border-neutral-200 rounded hover:bg-neutral-100 disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  Last
                </button>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

export default function ForecastDashboard() {
  const toast = useToast();
  // State
  const [activeTab, setActiveTab] = useState('All');
  const [tutorLabel, setTutorLabel] = useState(''); // '', 'W2', '1099'
  const [scenario, setScenario] = useState('realistic');
  const [dateRange, setDateRange] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [forecastData, setForecastData] = useState(null);
  const [targets, setTargets] = useState([]);
  const [completionRates, setCompletionRates] = useState({});
  const [staleJobs, setStaleJobs] = useState([]);
  const [staleJobsLoading, setStaleJobsLoading] = useState(true);
  const [forecastTab, setForecastTab] = useState('scheduled'); // 'scheduled' or 'projected'

  // Modal state
  const [drilldownOpen, setDrilldownOpen] = useState(false);
  const [drilldownTitle, setDrilldownTitle] = useState('');
  const [drilldownData, setDrilldownData] = useState([]);
  const [drilldownPagination, setDrilldownPagination] = useState({ total: 0, total_pages: 0 });
  const [targetModalOpen, setTargetModalOpen] = useState(false);
  const [completionRatesModalOpen, setCompletionRatesModalOpen] = useState(false);

  // KPI Modal state (enhanced drilldown with executive summary)
  const [kpiModalOpen, setKpiModalOpen] = useState(false);
  const [kpiModalMetric, setKpiModalMetric] = useState(null); // 'lessons', 'hours', 'revenue', etc.
  const [kpiSearchTerm, setKpiSearchTerm] = useState('');
  const [kpiServerSearchTerm, setKpiServerSearchTerm] = useState(''); // What's been sent to server
  const [kpiPage, setKpiPage] = useState(0); // Current display page (0-indexed)
  const [kpiServerPage, setKpiServerPage] = useState(0); // Current server page loaded
  const [kpiPageLoading, setKpiPageLoading] = useState(false); // Loading state for page fetches
  const [csvDownloading, setCsvDownloading] = useState(false); // Loading state for CSV download
  const [kpiSortField, setKpiSortField] = useState(null); // Column to sort by
  const [kpiSortDirection, setKpiSortDirection] = useState('asc'); // 'asc' or 'desc'
  const searchDebounceRef = useRef(null); // Debounce timer for search
  const KPI_PAGE_SIZE = 50; // Records per display page
  const SERVER_PAGE_SIZE = DRILLDOWN_PAGE_SIZE; // Records per server fetch (100)

  // Helper to get current fiscal quarter dates
  // Fiscal year: Q1=Jul-Sep, Q2=Oct-Dec, Q3=Jan-Mar, Q4=Apr-Jun
  const getCurrentQuarterDates = (date) => {
    const month = date.month;
    let quarterStart, quarterEnd;

    if (month >= 1 && month <= 3) {
      // Q3 FY (Jan-Mar)
      quarterStart = date.set({ month: 1, day: 1 });
      quarterEnd = date.set({ month: 3, day: 31 });
    } else if (month >= 4 && month <= 6) {
      // Q4 FY (Apr-Jun)
      quarterStart = date.set({ month: 4, day: 1 });
      quarterEnd = date.set({ month: 6, day: 30 });
    } else if (month >= 7 && month <= 9) {
      // Q1 FY (Jul-Sep)
      quarterStart = date.set({ month: 7, day: 1 });
      quarterEnd = date.set({ month: 9, day: 30 });
    } else {
      // Q2 FY (Oct-Dec)
      quarterStart = date.set({ month: 10, day: 1 });
      quarterEnd = date.set({ month: 12, day: 31 });
    }

    return { quarterStart, quarterEnd };
  };

  // Initialize date range to current quarter (fiscal year based)
  useEffect(() => {
    if (!dateRange) {
      const now = DateTime.now().setZone('America/New_York');
      const { quarterStart, quarterEnd } = getCurrentQuarterDates(now);
      setDateRange({
        startDate: quarterStart.toISODate(),
        endDate: quarterEnd.toISODate(),
        preset: 'currentQuarter'
      });
    }
  }, []);

  // Map channel tab to API filter
  const getChannelFilter = useCallback(() => {
    const channelMap = {
      'All': null,
      'Home': 'home',
      'Online': 'digital',
      'Clubs': 'clubs',
      'Schools': 'schools'
    };
    return channelMap[activeTab] || null;
  }, [activeTab]);

  // Fetch forecast scenarios data
  const fetchForecast = useCallback(async () => {
    if (!dateRange?.startDate || !dateRange?.endDate) return;

    setLoading(true);
    setError(null);

    try {
      const params = new URLSearchParams({
        start_date: dateRange.startDate,
        end_date: dateRange.endDate,
      });

      const channel = getChannelFilter();
      if (channel) {
        params.append('channel', channel);
      }
      if (tutorLabel) {
        params.append('tutor_label', tutorLabel);
      }

      const response = await fetch(`/api/forecast/scenarios?${params}`, {
        credentials: 'include',
      });

      if (!response.ok) {
        throw new Error(`HTTP ${response.status}`);
      }

      const data = await response.json();
      setForecastData(data);
    } catch (err) {
      console.error('Failed to fetch forecast:', err);
      setError('Failed to load forecast data');
    } finally {
      setLoading(false);
    }
  }, [dateRange, getChannelFilter, tutorLabel]);

  // Fetch targets
  const fetchTargets = useCallback(async () => {
    try {
      const response = await fetch('/api/forecast/targets', {
        credentials: 'include',
      });

      if (response.ok) {
        const data = await response.json();
        setTargets(data.targets || []);
      }
    } catch (err) {
      console.error('Failed to fetch targets:', err);
    }
  }, []);

  // Fetch completion rates (3-tier format)
  const fetchCompletionRates = useCallback(async () => {
    try {
      const response = await fetch('/api/forecast/completion-rates', {
        credentials: 'include',
      });

      if (response.ok) {
        const data = await response.json();
        // New format: { rates: { realistic: {...}, best_case: {...}, worst_case: {...} } }
        setCompletionRates(data.rates || {});
      }
    } catch (err) {
      console.error('Failed to fetch completion rates:', err);
    }
  }, []);

  // Fetch stale jobs
  const fetchStaleJobs = useCallback(async () => {
    setStaleJobsLoading(true);
    try {
      const params = new URLSearchParams();
      const channel = getChannelFilter();
      if (channel) {
        params.append('channel', channel);
      }

      const response = await fetch(`/api/forecast/stale-jobs?${params}`, {
        credentials: 'include',
      });

      if (response.ok) {
        const data = await response.json();
        setStaleJobs(data.stale_jobs || []);
      }
    } catch (err) {
      console.error('Failed to fetch stale jobs:', err);
    } finally {
      setStaleJobsLoading(false);
    }
  }, [getChannelFilter]);

  // Initial data fetch
  useEffect(() => {
    fetchTargets();
    fetchCompletionRates();
  }, [fetchTargets, fetchCompletionRates]);

  // Fetch forecast when filters change
  useEffect(() => {
    fetchForecast();
  }, [fetchForecast]);

  // Fetch stale jobs when channel changes
  useEffect(() => {
    fetchStaleJobs();
  }, [fetchStaleJobs]);

  // Get current scenario data
  const currentScenario = useMemo(() => {
    if (!forecastData) return null;
    return forecastData[scenario] || forecastData.realistic;
  }, [forecastData, scenario]);

  // Calculate metrics from scenario
  const metrics = useMemo(() => {
    if (!currentScenario) {
      return {
        totalLessons: 0,
        totalHours: 0,
        totalRevenue: 0,
        totalTutorPay: 0,
        totalMargin: 0,
        marginPct: 0,
        uniqueStudents: 0,
        uniqueTutors: 0,
        scheduledLessons: 0,
        scheduledHours: 0,
        projectedLessons: 0,
        projectedHours: 0,
        scheduledRevenue: 0,
        rawScheduledRevenue: 0,
        projectedRevenue: 0,
        scheduledTutorPay: 0,
        projectedTutorPay: 0,
        scheduledMargin: 0,
        projectedMargin: 0,
        scheduledMarginPct: 0,
        projectedMarginPct: 0,
        fullForecastRevenue: 0,
        atRiskRevenue: 0,
        atRiskPct: 0,
        weeklyRunRate: 0,
        weeklyRevenueTarget: null,
        pacePct: null,
        weeksInPeriod: 1,
        avgCompletionRate: 0,
        realisticForecastLessons: 0,
        realisticForecastRevenue: 0,
        realisticForecastTutorPay: 0,
        realisticForecastProfit: 0,
        realisticMarginPct: 0,
        realisticCostPct: 0,
        yoyDollarChange: 0,
        yoyPctChange: 0,
        priorYearRevenue: 0,
      };
    }

    const totalLessons = currentScenario.total_lessons || 0;
    const totalHours = currentScenario.total_hours || 0;
    const totalRevenue = currentScenario.total_revenue || 0;
    const totalTutorPay = currentScenario.total_tutor_pay || 0;
    const totalMargin = totalRevenue - totalTutorPay;
    const marginPct = totalRevenue > 0 ? (totalMargin / totalRevenue) * 100 : 0;
    const uniqueStudents = currentScenario.unique_students || 0;
    const uniqueTutors = currentScenario.unique_tutors || 0;

    // Scheduled metrics
    const scheduledRevenue = currentScenario.scheduled_revenue || 0;
    const scheduledTutorPay = currentScenario.scheduled_tutor_pay || 0;
    const scheduledMargin = scheduledRevenue - scheduledTutorPay;
    const scheduledMarginPct = scheduledRevenue > 0 ? (scheduledMargin / scheduledRevenue) * 100 : 0;
    const scheduledHours = currentScenario.scheduled_hours || 0;

    // Projected metrics
    const projectedRevenue = currentScenario.projected_revenue || 0;
    const projectedTutorPay = currentScenario.projected_tutor_pay || 0;
    const projectedMargin = projectedRevenue - projectedTutorPay;
    const projectedMarginPct = projectedRevenue > 0 ? (projectedMargin / projectedRevenue) * 100 : 0;
    const projectedHours = currentScenario.projected_hours || 0;

    // Weekly run rate: will use realisticForecastRevenue (computed below)
    const totalDays = dateRange?.startDate && dateRange?.endDate
      ? DateTime.fromISO(dateRange.endDate).diff(DateTime.fromISO(dateRange.startDate), 'days').days || 1
      : 1;
    const weeksInPeriod = Math.max(totalDays / 7, 1);

    // Weekly target from configured targets
    const channelFilter = getChannelFilter();
    const revenueTarget = targets.find(t =>
      t.target_type === 'quarterly_revenue' && (!channelFilter ? !t.channel || t.channel === '' : t.channel === channelFilter)
    );
    const weeklyRevenueTarget = revenueTarget ? Number(revenueTarget.target_value) / 13 : null;

    const rawScheduledRevenue = forecastData?.progress?.scheduled_revenue || 0;

    // Completion rate (weighted average across channels)
    const completionRates = currentScenario.completion_rates || {};
    const byChannel = currentScenario.by_channel || {};
    let weightedSum = 0;
    let totalWeight = 0;
    for (const [ch, rate] of Object.entries(completionRates)) {
      const chRevenue = byChannel[ch]?.total_revenue || 0;
      weightedSum += rate * chRevenue;
      totalWeight += chRevenue;
    }
    const avgCompletionRate = totalWeight > 0 ? (weightedSum / totalWeight) * 100 : 0;

    // Revenue at Risk: scheduled + projected revenue that may not complete
    const atRiskRevenue = (rawScheduledRevenue + projectedRevenue) * (1 - avgCompletionRate / 100);
    const atRiskPct = (rawScheduledRevenue + projectedRevenue) > 0
      ? (atRiskRevenue / (rawScheduledRevenue + projectedRevenue)) * 100 : 0;

    // Realistic forecast = completed + (pending_recent × 50%) + scheduled × per-channel completion rates
    // Uses only actually-scheduled lessons (not projected/extrapolated) — matches KPI modal calculation
    const p = forecastData?.progress || {};
    let scheduledAdjustedRevenue = 0;
    let scheduledAdjustedLessons = 0;
    let scheduledAdjustedTutorPay = 0;
    if (Object.keys(byChannel).length > 0) {
      // byChannel comes from currentScenario.by_channel where scheduled_revenue
      // already has per-channel completion rates applied (in calculateScenario).
      // Do NOT multiply by rate again — that would double-apply completion rates.
      for (const [ch, chData] of Object.entries(byChannel)) {
        scheduledAdjustedRevenue += chData.scheduled_revenue || 0;
        scheduledAdjustedLessons += chData.scheduled_lessons || 0;
        scheduledAdjustedTutorPay += chData.scheduled_tutor_pay || 0;
      }
    } else {
      // Fallback: use overall scheduled × weighted avg completion rate
      const fallbackRate = avgCompletionRate > 0 ? avgCompletionRate / 100 : 0.73;
      scheduledAdjustedRevenue = (p.scheduled_revenue || 0) * fallbackRate;
      scheduledAdjustedLessons = (p.scheduled_lessons || 0) * fallbackRate;
      scheduledAdjustedTutorPay = (p.scheduled_tutor_pay || 0) * fallbackRate;
    }
    const realisticForecastLessons = (p.completed_lessons || 0)
      + (p.pending_recent_lessons || 0) * 0.5
      + scheduledAdjustedLessons;
    const realisticForecastRevenue = (p.completed_revenue || 0)
      + (p.pending_recent_revenue || 0) * 0.5
      + scheduledAdjustedRevenue;
    const realisticForecastTutorPay = (p.completed_tutor_pay || 0)
      + (p.pending_recent_tutor_pay || 0) * 0.5
      + scheduledAdjustedTutorPay;
    // Use historical adhoc pay % to subtract estimated adhoc from forecast profit
    // The forecast already has actual tutor pay from scheduled appointments —
    // we just add the adhoc adjustment on top (bonuses, background checks, etc.)
    const historicalProfitMargin = forecastData?.historical_profit_margin;
    const hasHistoricalMargin = historicalProfitMargin && historicalProfitMargin.adhoc_pay_pct > 0;
    const historicalAdhocPct = hasHistoricalMargin ? historicalProfitMargin.adhoc_pay_pct : 0;

    // Profit before adhoc adjustment (lesson-based margin only)
    const lessonBasedProfit = realisticForecastRevenue - realisticForecastTutorPay;
    // Estimated adhoc pay based on historical adhoc % of revenue
    const estimatedAdhocPay = hasHistoricalMargin
      ? realisticForecastRevenue * (historicalAdhocPct / 100)
      : 0;
    // True profit = revenue - tutor pay - estimated adhoc pay
    const realisticForecastProfit = lessonBasedProfit - estimatedAdhocPay;
    const realisticMarginPct = realisticForecastRevenue > 0
      ? (realisticForecastProfit / realisticForecastRevenue) * 100 : 0;
    const realisticCostPct = realisticForecastRevenue > 0
      ? (realisticForecastTutorPay / realisticForecastRevenue) * 100 : 0;

    // Run rate and full forecast based on realistic numbers
    const fullForecastRevenue = realisticForecastRevenue;
    const weeklyRunRate = realisticForecastRevenue / weeksInPeriod;
    const pacePct = weeklyRevenueTarget ? (weeklyRunRate / weeklyRevenueTarget) * 100 : null;

    // YoY: realistic forecast vs prior year
    const priorYearRevenue = forecastData?.prior_year?.revenue || 0;
    const yoyDollarChange = realisticForecastRevenue - priorYearRevenue;
    const yoyPctChange = priorYearRevenue > 0 ? (yoyDollarChange / priorYearRevenue) * 100 : 0;

    return {
      totalLessons,
      totalHours,
      totalRevenue,
      totalTutorPay,
      totalMargin,
      marginPct,
      uniqueStudents,
      uniqueTutors,
      scheduledLessons: currentScenario.scheduled_lessons || 0,
      scheduledHours,
      projectedLessons: currentScenario.projected_lessons || 0,
      projectedHours,
      scheduledRevenue,
      rawScheduledRevenue,
      projectedRevenue,
      scheduledTutorPay,
      projectedTutorPay,
      scheduledMargin,
      projectedMargin,
      scheduledMarginPct,
      projectedMarginPct,
      fullForecastRevenue,
      atRiskRevenue,
      atRiskPct,
      weeklyRunRate,
      weeklyRevenueTarget,
      pacePct,
      weeksInPeriod,
      avgCompletionRate,
      realisticForecastLessons,
      realisticForecastRevenue,
      realisticForecastTutorPay,
      realisticForecastProfit,
      realisticMarginPct,
      realisticCostPct,
      estimatedAdhocPay,
      historicalAdhocPct,
      hasHistoricalMargin,
      yoyDollarChange,
      yoyPctChange,
      priorYearRevenue,
    };
  }, [currentScenario, forecastData, dateRange, targets, getChannelFilter]);

  // Get relevant target for variance calculation
  const getTargetValue = useCallback((type) => {
    const channel = getChannelFilter();
    const target = targets.find(t =>
      t.target_type === type &&
      (channel ? t.channel === channel : !t.channel)
    );
    return target?.target_value || null;
  }, [targets, getChannelFilter]);

  // Calculate weekly lessons from scheduled data (for variance comparison)
  const weeklyScheduledLessons = useMemo(() => {
    if (!dateRange?.startDate || !dateRange?.endDate || !metrics.scheduledLessons) {
      return 0;
    }

    const start = DateTime.fromISO(dateRange.startDate);
    const end = DateTime.fromISO(dateRange.endDate);
    const days = end.diff(start, 'days').days || 1;
    const weeks = days / 7;

    return Math.round(metrics.scheduledLessons / weeks);
  }, [dateRange, metrics]);

  // Handle KPI card clicks - uses paginated endpoint
  const handleLessonsDrilldown = async () => {
    if (!dateRange) return;

    try {
      const params = new URLSearchParams({
        start_date: dateRange.startDate,
        end_date: dateRange.endDate,
        page: '0',
        limit: String(DRILLDOWN_PAGE_SIZE),
      });
      const channel = getChannelFilter();
      if (channel) params.append('channel', channel);

      // Fetch first page only (paginated endpoint)
      const response = await fetch(`/api/forecast/drilldown-list?${params}`, {
        credentials: 'include',
      });

      if (!response.ok) {
        throw new Error(`HTTP ${response.status}`);
      }

      const result = await response.json();

      setDrilldownTitle('Scheduled Lessons');
      setDrilldownData(result.lessons || []);
      setDrilldownPagination(result.pagination || { total: 0, total_pages: 0 });
      setDrilldownOpen(true);
    } catch (err) {
      console.error('Drilldown failed:', err);
    }
  };

  // Fetch a specific page for drilldown (supports search)
  const fetchDrilldownPage = useCallback(async (pageNum, searchTerm = null) => {
    const params = new URLSearchParams({
      start_date: dateRange.startDate,
      end_date: dateRange.endDate,
      page: String(pageNum),
      limit: String(DRILLDOWN_PAGE_SIZE),
    });
    const channel = getChannelFilter();
    if (channel) params.append('channel', channel);
    if (tutorLabel) params.append('tutor_label', tutorLabel);
    if (searchTerm) params.append('search', searchTerm);

    const response = await fetch(`/api/forecast/drilldown-list?${params}`, {
      credentials: 'include',
    });

    if (!response.ok) {
      throw new Error(`HTTP ${response.status}`);
    }

    return response.json();
  }, [dateRange, getChannelFilter, tutorLabel]);

  // Navigate to a specific display page in KPI modal, fetching server page if needed
  const handleKpiPageChange = useCallback(async (newDisplayPage, searchTerm = null) => {
    // Calculate which server page we need for this display page
    const recordsPerServerPage = SERVER_PAGE_SIZE; // 100
    const startRecord = newDisplayPage * KPI_PAGE_SIZE; // e.g., page 2 * 50 = record 100
    const neededServerPage = Math.floor(startRecord / recordsPerServerPage);

    // Determine effective search term
    const effectiveSearch = searchTerm !== null ? searchTerm : kpiServerSearchTerm;

    // If we need a different server page or search changed, fetch it
    if (neededServerPage !== kpiServerPage || searchTerm !== null) {
      setKpiPageLoading(true);
      try {
        const result = await fetchDrilldownPage(neededServerPage, effectiveSearch || null);
        setDrilldownData(result.lessons || []);
        setDrilldownPagination(result.pagination || { total: 0, total_pages: 0 });
        setKpiServerPage(neededServerPage);
      } catch (err) {
        console.error('Failed to fetch KPI page:', err);
      } finally {
        setKpiPageLoading(false);
      }
    }

    setKpiPage(newDisplayPage);
  }, [kpiServerPage, kpiServerSearchTerm, fetchDrilldownPage, KPI_PAGE_SIZE]);

  // Handle server-side search with debounce
  const handleKpiSearchChange = useCallback((value) => {
    setKpiSearchTerm(value);

    // Clear previous debounce timer
    if (searchDebounceRef.current) {
      clearTimeout(searchDebounceRef.current);
    }

    // Debounce server search by 400ms
    searchDebounceRef.current = setTimeout(async () => {
      const searchValue = value.trim();
      setKpiServerSearchTerm(searchValue);
      setKpiPage(0);
      setKpiServerPage(0);
      setKpiPageLoading(true);

      try {
        const result = await fetchDrilldownPage(0, searchValue || null);
        setDrilldownData(result.lessons || []);
        setDrilldownPagination(result.pagination || { total: 0, total_pages: 0 });
      } catch (err) {
        console.error('Failed to search:', err);
      } finally {
        setKpiPageLoading(false);
      }
    }, 400);
  }, [fetchDrilldownPage]);

  // Download all data as CSV
  const handleDownloadCSV = useCallback(async () => {
    if (!dateRange) return;

    setCsvDownloading(true);
    try {
      // Fetch all records by requesting a large limit (server caps at 500 per request)
      // We'll paginate through all pages to get complete data
      const allLessons = [];
      let page = 0;
      let hasMore = true;
      const batchSize = 500; // Max allowed by server

      const channel = getChannelFilter();

      while (hasMore) {
        const params = new URLSearchParams({
          start_date: dateRange.startDate,
          end_date: dateRange.endDate,
          page: String(page),
          limit: String(batchSize),
          include_completed: 'true',
        });
        if (channel) params.append('channel', channel);
        if (kpiServerSearchTerm) params.append('search', kpiServerSearchTerm);

        const response = await fetch(`/api/forecast/drilldown-list?${params}`, {
          credentials: 'include',
        });

        if (!response.ok) throw new Error(`HTTP ${response.status}`);
        const result = await response.json();

        allLessons.push(...(result.lessons || []));
        hasMore = result.pagination?.has_more || false;
        page++;

        // Safety limit to prevent infinite loops
        if (page > 100) break;
      }

      // Convert to CSV
      const csvHeaders = ['Date', 'Status', 'Job', 'Tutor', 'Revenue', 'Tutor Pay', 'Lesson ID'];
      const csvRows = allLessons.map(row => {
        // Use row.time (actual appointment timestamp) for accurate timezone display
        // row.date is a DATE-only value (midnight UTC) which shifts back a day in local timezones west of UTC
        const date = row.time || row.date || '';
        let formattedDate = date;
        try {
          const dt = DateTime.fromISO(date, { zone: 'utc' }).toLocal();
          if (dt.isValid) {
            formattedDate = dt.toFormat('M/d/yyyy h:mma ZZZZ');
          }
        } catch {}

        const statusLabel = row.source_type === 'completed' ? 'Completed'
          : row.source_type === 'pending' ? 'Pending'
          : 'Scheduled';

        return [
          `"${formattedDate}"`,
          statusLabel,
          `"${(row.job_name || '').replace(/"/g, '""')}"`,
          `"${(row.contractor_name || '').replace(/"/g, '""')}"`,
          (row.expected_revenue || 0).toFixed(2),
          (row.expected_tutor_pay || 0).toFixed(2),
          row.appointment_id || '',
        ].join(',');
      });

      const csvContent = [csvHeaders.join(','), ...csvRows].join('\n');

      // Download file
      const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
      const url = URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      const dateStr = DateTime.now().toFormat('yyyy-MM-dd');
      link.download = `forecast-lessons-${dateStr}.csv`;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      URL.revokeObjectURL(url);
    } catch (err) {
      console.error('CSV download failed:', err);
      toast.error('Failed to download CSV. Please try again.');
    } finally {
      setCsvDownloading(false);
    }
  }, [dateRange, getChannelFilter, kpiServerSearchTerm]);

  const handleRevenueDrilldown = () => {
    handleLessonsDrilldown(); // Same data, different view
  };

  // Handle Scheduled box click - show TutorCruncher lessons
  const handleScheduledDrilldown = async () => {
    if (!dateRange) return;

    try {
      const params = new URLSearchParams({
        start_date: dateRange.startDate,
        end_date: dateRange.endDate,
        page: '0',
        limit: String(DRILLDOWN_PAGE_SIZE),
      });
      const channel = getChannelFilter();
      if (channel) params.append('channel', channel);

      const response = await fetch(`/api/forecast/drilldown-list?${params}`, {
        credentials: 'include',
      });

      if (!response.ok) throw new Error(`HTTP ${response.status}`);
      const result = await response.json();

      setDrilldownTitle('Scheduled Lessons (TutorCruncher)');
      setDrilldownData(result.lessons || []);
      setDrilldownPagination(result.pagination || { total: 0, total_pages: 0 });
      setDrilldownOpen(true);
    } catch (err) {
      console.error('Scheduled drilldown failed:', err);
    }
  };

  // Handle Projected box click - show pattern insights
  const handleProjectedDrilldown = async () => {
    if (!dateRange) return;

    try {
      const params = new URLSearchParams({
        start_date: dateRange.startDate,
        end_date: dateRange.endDate,
      });
      const channel = getChannelFilter();
      if (channel) params.append('channel', channel);

      const response = await fetch(`/api/forecast/pattern-insights?${params}`, {
        credentials: 'include',
      });

      if (!response.ok) throw new Error(`HTTP ${response.status}`);
      const result = await response.json();

      setDrilldownTitle('Projected Lessons (Pattern Insights)');
      setDrilldownData(result.patterns || []);
      setDrilldownPagination({ total: result.patterns?.length || 0, total_pages: 1 });
      setDrilldownOpen(true);
    } catch (err) {
      console.error('Projected drilldown failed:', err);
    }
  };

  // Handle KPI card click - opens enhanced modal with executive summary
  // Aggregate metrics that don't need individual lesson drilldown
  const AGGREGATE_METRICS = ['completion_rate', 'yoy', 'run_rate', 'revenue_at_risk'];

  const handleKPIClick = async (metric) => {
    // Aggregate metrics don't need drilldown data
    if (!AGGREGATE_METRICS.includes(metric)) {
      if (forecastTab === 'scheduled') {
        await handleScheduledDrilldown();
      } else {
        await handleProjectedDrilldown();
      }
    }

    // Then open the KPI modal with the selected metric
    setKpiModalMetric(metric);
    setKpiSortField(null);
    setKpiSortDirection('asc');
    setKpiModalOpen(true);
  };

  // Close KPI modal
  const handleKPIModalClose = () => {
    setKpiModalOpen(false);
    setKpiModalMetric(null);
    setDrilldownOpen(false); // Also close underlying drilldown
    setKpiSearchTerm(''); // Reset search input
    setKpiServerSearchTerm(''); // Reset server search
    setKpiPage(0); // Reset pagination
    setKpiServerPage(0); // Reset server page tracking
    // Clear any pending search debounce
    if (searchDebounceRef.current) {
      clearTimeout(searchDebounceRef.current);
    }
  };

  // Refresh pattern computation (admin action)
  const handleRefreshPatterns = async () => {
    try {
      await fetch('/api/forecast/compute-patterns', {
        method: 'POST',
        credentials: 'include',
      });

      // Refetch forecast after patterns update
      fetchForecast();
    } catch (err) {
      console.error('Failed to refresh patterns:', err);
    }
  };

  // Calculate variance from target
  const getVariance = (actual, targetType) => {
    const target = getTargetValue(targetType);
    if (!target) return null;
    return ((actual - target) / target) * 100;
  };

  return (
    <div className="space-y-6">
      {/* Error Alert */}
      {error && (
        <div className="flex items-center gap-3 p-3 rounded-lg border bg-red-50 border-red-200 text-red-800 text-sm">
          <ExclamationTriangleIcon className="h-5 w-5" />
          {error}
        </div>
      )}

      {/* Filters and Controls */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div className="flex flex-wrap items-center gap-3">
          <TabSwitcher activeTab={activeTab} onChange={setActiveTab} />
          <select
            value={tutorLabel}
            onChange={(e) => setTutorLabel(e.target.value)}
            className="px-3 py-1.5 text-sm rounded-lg border border-neutral-200 bg-white text-neutral-700 hover:border-neutral-300 focus:outline-none focus:ring-2 focus:ring-purple-500/20 focus:border-purple-400"
          >
            <option value="">All Tutors</option>
            <option value="W2">W2 Only</option>
            <option value="1099">1099 Only</option>
          </select>
        </div>
        <div className="flex items-center gap-3">
          <ScenarioSelector value={scenario} onChange={setScenario} />
          <DateRangePicker
            value={dateRange}
            onChange={(startDate, endDate, preset) => {
              setDateRange({ startDate, endDate, preset });
            }}
            label="Forecast Range"
            presets={FORECAST_PRESETS}
          />
          <button
            onClick={() => setTargetModalOpen(true)}
            className="p-2 rounded-md border border-neutral-200 hover:bg-neutral-50 text-neutral-600"
            title="Configure Targets"
          >
            <Cog6ToothIcon className="h-5 w-5" />
          </button>
        </div>
      </div>

      {/* Yellow scenario banner removed — completion rates now shown in KPI card */}

      {/* KPI Cards */}
      <Section
        title={`${(SCENARIOS.find(s => s.id === scenario) || SCENARIOS[0]).label} Forecast Summary`}
      >
        {loading ? (
          <div className="flex items-center justify-center py-8">
            <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-purple-600"></div>
            <span className="ml-2 text-sm text-neutral-600">Loading forecast...</span>
          </div>
        ) : (
          <div className="space-y-4">
            {/* Pace Indicator */}
            {forecastData?.pace && <PaceIndicator pace={forecastData.pace} />}

            {/* Primary Metrics Row 1 - Lessons, Revenue, Tutor Pay, Profit */}
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
              {forecastData?.progress ? (
                <ProgressKPICard
                  label="Total Lessons"
                  completed={forecastData.progress.completed_lessons || 0}
                  pending={forecastData.progress.pending_completion_lessons || 0}
                  scheduled={forecastData.progress.scheduled_lessons || 0}
                  projected={metrics.projectedLessons || 0}
                  realisticTotal={Math.round(metrics.realisticForecastLessons)}
                  onClick={() => handleKPIClick('lessons')}
                  scenarioLabel={(SCENARIOS.find(s => s.id === scenario) || SCENARIOS[0]).label}
                  tooltip="Realistic forecast = completed + recent pending (×50%) + scheduled adjusted by completion rates. Click for details."
                />
              ) : (
                <KPICard
                  label="Total Lessons"
                  value={Math.round(metrics.realisticForecastLessons).toLocaleString()}
                  variance={getVariance(weeklyScheduledLessons, 'weekly_lessons')}
                  onClick={() => handleKPIClick('lessons')}
                  scenarioLabel={(SCENARIOS.find(s => s.id === scenario) || SCENARIOS[0]).label}
                  tooltip="Realistic forecast lessons adjusted by completion rates."
                />
              )}
              {forecastData?.progress ? (
                <ProgressKPICard
                  label="Total Revenue"
                  completed={forecastData.progress.completed_revenue || 0}
                  pending={forecastData.progress.pending_completion_revenue || 0}
                  scheduled={forecastData.progress.scheduled_revenue || 0}
                  projected={metrics.projectedRevenue || 0}
                  realisticTotal={Math.round(metrics.realisticForecastRevenue)}
                  onClick={() => handleKPIClick('revenue')}
                  scenarioLabel={(SCENARIOS.find(s => s.id === scenario) || SCENARIOS[0]).label}
                  formatValue={(v) => `$${v.toLocaleString('en-US', { minimumFractionDigits: 0, maximumFractionDigits: 0 })}`}
                  tooltip="Realistic forecast = completed + recent pending (×50%) + scheduled adjusted by completion rates. Click for details."
                />
              ) : (
                <KPICard
                  label="Total Revenue"
                  value={`$${Math.round(metrics.realisticForecastRevenue).toLocaleString('en-US')}`}
                  variance={getVariance(metrics.realisticForecastRevenue, 'quarterly_revenue')}
                  onClick={() => handleKPIClick('revenue')}
                  scenarioLabel={(SCENARIOS.find(s => s.id === scenario) || SCENARIOS[0]).label}
                  tooltip="Realistic forecast revenue adjusted by completion rates."
                />
              )}
              <KPICard
                label="Total Tutor Pay"
                value={`$${Math.round(metrics.realisticForecastTutorPay).toLocaleString('en-US')}`}
                subtitle={`Cost ${metrics.realisticCostPct.toFixed(1)}%`}
                onClick={() => handleKPIClick('tutor_pay')}
                scenarioLabel={(SCENARIOS.find(s => s.id === scenario) || SCENARIOS[0]).label}
                tooltip="Realistic forecast tutor pay = completed + recent pending (×50%) + scheduled adjusted by completion rates."
              />
              <KPICard
                label="Total Profit"
                value={`$${Math.round(metrics.realisticForecastProfit).toLocaleString('en-US')}`}
                subtitle={metrics.hasHistoricalMargin
                  ? `Margin ${metrics.realisticMarginPct.toFixed(1)}% · Adhoc ~$${Math.round(metrics.estimatedAdhocPay).toLocaleString()}`
                  : `Profit Margin ${metrics.realisticMarginPct.toFixed(1)}%`}
                onClick={() => handleKPIClick('profit')}
                scenarioLabel={(SCENARIOS.find(s => s.id === scenario) || SCENARIOS[0]).label}
                tooltip={metrics.hasHistoricalMargin
                  ? `Profit = forecast revenue - tutor pay - estimated adhoc pay. Tutor pay: ${metrics.realisticCostPct.toFixed(1)}% + adhoc: ~${metrics.historicalAdhocPct.toFixed(1)}% = ${(metrics.realisticCostPct + metrics.historicalAdhocPct).toFixed(1)}% total cost → ${metrics.realisticMarginPct.toFixed(1)}% profit margin. Adhoc estimate (~$${Math.round(metrics.estimatedAdhocPay).toLocaleString()}) based on 6-month historical average.`
                  : "Realistic forecast revenue minus tutor pay. Margin % based on realistic forecast values."}
              />
            </div>

            {/* Insight Metrics Row 2 - YoY, Run Rate, Completion Rate, Confidence */}
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 mt-4">
              <KPICard
                label="YoY Revenue Change"
                value={`${metrics.yoyPctChange >= 0 ? '+' : ''}${metrics.yoyPctChange.toFixed(1)}%`}
                subtitle={metrics.priorYearRevenue > 0
                  ? `$${Math.round(metrics.realisticForecastRevenue).toLocaleString('en-US')} forecast vs $${metrics.priorYearRevenue.toLocaleString('en-US', { maximumFractionDigits: 0 })} prior year`
                  : 'No prior year data'}
                onClick={() => handleKPIClick('yoy')}
                tooltip="Compares this period's realistic forecast (completed + recent pending at 50% + scheduled × channel completion rates) against the same period last year."
              />
              <KPICard
                label="Weekly Revenue Run Rate"
                value={`$${metrics.weeklyRunRate.toLocaleString('en-US', { minimumFractionDigits: 0, maximumFractionDigits: 0 })}`}
                subtitle={metrics.weeklyRevenueTarget
                  ? `Target: $${Math.round(metrics.weeklyRevenueTarget).toLocaleString()}/wk · ${metrics.pacePct.toFixed(0)}% of pace`
                  : 'Avg per week across period'}
                onClick={() => handleKPIClick('run_rate')}
                tooltip={`Realistic forecast ÷ ${Math.round(metrics.weeksInPeriod || 1)} weeks in period.${metrics.weeklyRevenueTarget ? ` Target: $${Math.round(metrics.weeklyRevenueTarget).toLocaleString()}/wk from quarterly revenue target ÷ 13 weeks.` : ''}`}
              />
              <Tooltip title="Revenue-weighted average completion rate by channel. Click for deep dive by tutor, client, market, trends & anomalies." arrow placement="top" enterDelay={300}>
                <div>
                  <button
                    onClick={() => setCompletionRatesModalOpen(true)}
                    className="group w-full text-left bg-white border border-neutral-200 rounded-xl p-4 sm:p-5 shadow-sm hover:shadow transition-shadow focus:outline-none"
                  >
                    <div className="flex items-center justify-between">
                      <div className="text-xs text-neutral-500">Completion Rate</div>
                      <span className="text-[10px] px-1.5 py-0.5 rounded bg-purple-50 text-purple-600 font-medium">
                        {(SCENARIOS.find(s => s.id === scenario) || SCENARIOS[0]).label}
                      </span>
                    </div>
                    <div className="mt-1 text-2xl sm:text-3xl font-semibold text-brand-navy">
                      {metrics.avgCompletionRate.toFixed(1)}%
                    </div>
                    <div className="flex flex-wrap gap-1.5 mt-2">
                      {currentScenario?.completion_rates && Object.entries(currentScenario.completion_rates)
                        .filter(([ch]) => ch !== 'other')
                        .map(([channel, rate]) => (
                          <span key={channel} className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded bg-neutral-100 text-[10px] text-neutral-600">
                            <span className="capitalize">{channel}</span>
                            <span className="font-semibold text-neutral-800">{(rate * 100).toFixed(0)}%</span>
                          </span>
                        ))}
                    </div>
                    <div className="mt-1.5 text-[10px] text-purple-500 opacity-0 group-hover:opacity-100 transition-opacity">
                      Click for deep dive →
                    </div>
                  </button>
                </div>
              </Tooltip>
              <KPICard
                label="Revenue at Risk"
                value={`$${Math.round(metrics.atRiskRevenue).toLocaleString('en-US')}`}
                subtitle={`${metrics.atRiskPct.toFixed(1)}% of $${Math.round(metrics.rawScheduledRevenue + metrics.projectedRevenue).toLocaleString('en-US')} scheduled may not complete`}
                onClick={() => handleKPIClick('revenue_at_risk')}
                tooltip="Dollar amount of scheduled + projected revenue that may not materialize based on historical completion rates. Higher values mean more revenue depends on lessons actually completing."
              />
            </div>
          </div>
        )}
      </Section>

      {/* Timeline Chart */}
      <Section
        title="Forecast Timeline"
        actions={
          <button
            onClick={handleRefreshPatterns}
            className="flex items-center gap-1 text-xs text-neutral-500 hover:text-neutral-700"
            title="Refresh job patterns"
          >
            <ArrowPathIcon className="h-4 w-4" />
            Refresh patterns
          </button>
        }
      >
        <ForecastTimeline
          startDate={dateRange?.startDate}
          endDate={dateRange?.endDate}
          channel={getChannelFilter()}
          scenario={scenario}
          dailyData={forecastData?.daily}
          forecastTab={forecastTab}
        />
      </Section>

      {/* Channel Breakdown */}
      {currentScenario?.by_channel && (
        <Section title="By Channel (Scheduled)">
          <div className="overflow-x-auto">
            <table className="min-w-full text-sm">
              <thead>
                <tr className="text-left text-neutral-600 border-b">
                  <th className="py-2 pr-4">Channel</th>
                  <th className="py-2 pr-4">Lessons</th>
                  <th className="py-2 pr-4">Revenue</th>
                  <th className="py-2 pr-4">Tutor Pay</th>
                  <th className="py-2 pr-4">Margin</th>
                  <th className="py-2 pr-4">Target</th>
                  <th className="py-2 pr-4">Variance</th>
                </tr>
              </thead>
              <tbody>
                {Object.entries(currentScenario.by_channel).map(([channel, data]) => {
                  const channelTarget = targets.find(t =>
                    t.target_type === 'quarterly_revenue' && t.channel === channel
                  );
                  const targetVal = channelTarget?.target_value || 0;

                  // Use scheduled data only
                  const lessons = data.scheduled_lessons;
                  const revenue = data.scheduled_revenue;
                  const tutorPay = data.scheduled_tutor_pay || 0;
                  const margin = revenue - tutorPay;
                  const marginPct = revenue > 0 ? (margin / revenue) * 100 : 0;
                  const variance = targetVal > 0 ? ((revenue - targetVal) / targetVal * 100) : 0;

                  const marginClass = marginPct >= 45 ? 'text-green-700' : marginPct >= 30 ? 'text-yellow-700' : 'text-red-700';

                  return (
                    <tr key={channel} className="border-t border-neutral-100 hover:bg-neutral-50">
                      <td className="py-3 pr-4 font-medium capitalize">{channel}</td>
                      <td className="py-3 pr-4">{lessons?.toLocaleString() || 0}</td>
                      <td className="py-3 pr-4">${revenue?.toLocaleString('en-US', { minimumFractionDigits: 0 }) || 0}</td>
                      <td className="py-3 pr-4">${tutorPay?.toLocaleString('en-US', { minimumFractionDigits: 0 }) || 0}</td>
                      <td className={classNames('py-3 pr-4 font-medium', marginClass)}>
                        {marginPct.toFixed(1)}%
                      </td>
                      <td className="py-3 pr-4">{targetVal > 0 ? `$${targetVal.toLocaleString()}` : '-'}</td>
                      <td className="py-3 pr-4">
                        {targetVal > 0 ? (
                          <span className={classNames(
                            'px-2 py-0.5 rounded text-xs font-medium',
                            variance >= 0 ? 'bg-green-100 text-green-700' : 'bg-red-100 text-red-700'
                          )}>
                            {variance >= 0 ? '+' : ''}{variance.toFixed(1)}%
                          </span>
                        ) : '-'}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </Section>
      )}

      {/* Stale Jobs */}
      <Section title={`Stale Jobs (${staleJobs.length} need attention)`}>
        <StaleJobsList
          jobs={staleJobs}
          loading={staleJobsLoading}
          onRefresh={fetchStaleJobs}
        />
      </Section>

      {/* Modals */}
      <DrilldownModal
        open={drilldownOpen && !kpiModalOpen}
        onClose={() => setDrilldownOpen(false)}
        title={drilldownTitle}
        initialData={drilldownData}
        initialPagination={drilldownPagination}
        fetchPage={fetchDrilldownPage}
      />

      {/* Enhanced KPI Modal with Executive Summary */}
      <ForecastKPIModal
        open={kpiModalOpen}
        onClose={handleKPIModalClose}
        metric={kpiModalMetric}
        channel={getChannelFilter()}
        forecastTab={forecastTab}
        targets={targets}
        onDownloadCSV={handleDownloadCSV}
        csvDownloading={csvDownloading}
        progress={forecastData?.progress}
        selectedPreset={dateRange?.preset}
        periodStart={dateRange?.startDate}
        periodEnd={dateRange?.endDate}
        completionRate={metrics.avgCompletionRate}
        completionRates={currentScenario?.completion_rates}
        byChannel={currentScenario?.by_channel}
        scenarioTotals={currentScenario}
        dashboardMetrics={metrics}
      >
        {/* Pass drilldown content as children */}
        {drilldownData && drilldownData.length > 0 && (() => {
          // Server-side search and pagination - data comes pre-filtered from API
          const serverTotal = drilldownPagination.total || drilldownData.length;
          const totalRecords = serverTotal;
          const totalPages = Math.ceil(totalRecords / KPI_PAGE_SIZE);

          // Calculate offset within current server page for display slicing
          const recordsPerServerPage = SERVER_PAGE_SIZE;
          const globalStartRecord = kpiPage * KPI_PAGE_SIZE;
          const offsetInServerPage = globalStartRecord % recordsPerServerPage;

          // Get the slice from the current data
          const startIdx = offsetInServerPage;
          const endIdx = Math.min(startIdx + KPI_PAGE_SIZE, drilldownData.length);
          const rawPageData = drilldownData.slice(startIdx, endIdx);

          // Sort page data if a sort field is selected
          const pageData = kpiSortField ? [...rawPageData].sort((a, b) => {
            let aVal, bVal;
            switch (kpiSortField) {
              case 'date':
                aVal = a.time || a.date || a.start_date || a.lesson_date || '';
                bVal = b.time || b.date || b.start_date || b.lesson_date || '';
                return kpiSortDirection === 'asc' ? aVal.localeCompare(bVal) : bVal.localeCompare(aVal);
              case 'job':
                aVal = (a.job_name || a.service_name || '').toLowerCase();
                bVal = (b.job_name || b.service_name || '').toLowerCase();
                return kpiSortDirection === 'asc' ? aVal.localeCompare(bVal) : bVal.localeCompare(aVal);
              case 'tutor':
                aVal = (a.tutor_name || a.contractor_name || '').toLowerCase();
                bVal = (b.tutor_name || b.contractor_name || '').toLowerCase();
                return kpiSortDirection === 'asc' ? aVal.localeCompare(bVal) : bVal.localeCompare(aVal);
              case 'revenue':
                aVal = a.revenue || a.expected_revenue || 0;
                bVal = b.revenue || b.expected_revenue || 0;
                return kpiSortDirection === 'asc' ? aVal - bVal : bVal - aVal;
              case 'tutor_pay':
                aVal = a.expected_tutor_pay || 0;
                bVal = b.expected_tutor_pay || 0;
                return kpiSortDirection === 'asc' ? aVal - bVal : bVal - aVal;
              default:
                return 0;
            }
          }) : rawPageData;

          // Calculate display numbers
          const displayStart = totalRecords > 0 ? globalStartRecord + 1 : 0;
          const displayEnd = Math.min(globalStartRecord + pageData.length, totalRecords);

          // Helper to format date
          const formatDate = (dateStr) => {
            if (!dateStr) return '-';
            try {
              const dt = DateTime.fromISO(dateStr, { zone: 'utc' }).toLocal();
              if (!dt.isValid) return dateStr;
              return dt.toFormat('M/d/yyyy h:mma') + ' ' + dt.toFormat('ZZZZ');
            } catch {
              return dateStr;
            }
          };

          return (
            <div className="space-y-4">
              {/* Search */}
              <div className="relative">
                <input
                  type="text"
                  placeholder="Search by job, tutor, or Lesson ID..."
                  value={kpiSearchTerm}
                  onChange={(e) => handleKpiSearchChange(e.target.value)}
                  className="w-full px-4 py-2 border border-neutral-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-purple-500"
                />
                {kpiSearchTerm && (
                  <button
                    onClick={() => handleKpiSearchChange('')}
                    className="absolute right-3 top-1/2 -translate-y-1/2 text-neutral-400 hover:text-neutral-600"
                  >
                    ×
                  </button>
                )}
              </div>

              {/* Data table */}
              <div className="max-h-96 overflow-y-auto border border-neutral-200 rounded-lg">
                <table className="min-w-full divide-y divide-neutral-200 text-sm">
                  <thead className="bg-neutral-50 sticky top-0">
                    <tr>
                      {[
                        { key: 'date', label: 'Date', align: 'text-left' },
                        { key: 'job', label: 'Job', align: 'text-left' },
                        { key: 'tutor', label: 'Tutor', align: 'text-left' },
                        { key: 'revenue', label: 'Revenue', align: 'text-right' },
                        { key: 'tutor_pay', label: 'Tutor Pay', align: 'text-right' },
                      ].map(col => (
                        <th
                          key={col.key}
                          className={`px-3 py-2 ${col.align} font-medium text-neutral-600 cursor-pointer hover:text-brand-purple select-none`}
                          onClick={() => {
                            if (kpiSortField === col.key) {
                              setKpiSortDirection(prev => prev === 'asc' ? 'desc' : 'asc');
                            } else {
                              setKpiSortField(col.key);
                              setKpiSortDirection(col.key === 'revenue' || col.key === 'tutor_pay' ? 'desc' : 'asc');
                            }
                          }}
                        >
                          <span className="inline-flex items-center gap-1">
                            {col.label}
                            {kpiSortField === col.key ? (
                              <span className="text-brand-purple text-xs">{kpiSortDirection === 'asc' ? '▲' : '▼'}</span>
                            ) : (
                              <span className="text-neutral-300 text-xs">⇅</span>
                            )}
                          </span>
                        </th>
                      ))}
                      <th className="px-3 py-2 text-center font-medium text-neutral-600">Lesson ID</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-neutral-100">
                    {pageData.map((row, idx) => (
                      <tr key={idx} className="hover:bg-neutral-50">
                        <td className="px-3 py-2 text-neutral-700 whitespace-nowrap text-xs">
                          {formatDate(row.time || row.date || row.start_date || row.lesson_date)}
                        </td>
                        <td className="px-3 py-2 text-neutral-900">
                          {row.job_name || row.service_name || '-'}
                        </td>
                        <td className="px-3 py-2 text-neutral-700">
                          {row.tutor_name || row.contractor_name || '-'}
                        </td>
                        <td className="px-3 py-2 text-right text-neutral-900">
                          ${(row.revenue || row.expected_revenue || 0).toLocaleString('en-US', { minimumFractionDigits: 2 })}
                        </td>
                        <td className="px-3 py-2 text-right text-neutral-700">
                          ${(row.expected_tutor_pay || 0).toLocaleString('en-US', { minimumFractionDigits: 2 })}
                        </td>
                        <td className="px-3 py-2 text-center">
                          {row.appointment_id ? (
                            <a
                              href={`https://account.acmeops.com/cal/appointments/${row.appointment_id}/`}
                              target="_blank"
                              rel="noopener noreferrer"
                              className="text-brand-purple hover:text-brand-navy underline"
                            >
                              {row.appointment_id}
                            </a>
                          ) : '-'}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>

              {/* Pagination controls */}
              <div className="flex items-center justify-between text-xs text-neutral-500">
                <span>
                  {kpiPageLoading ? (
                    <span className="text-purple-600">Searching...</span>
                  ) : (
                    <>
                      Showing {displayStart.toLocaleString()}-{displayEnd.toLocaleString()} of {totalRecords.toLocaleString()} records
                      {kpiServerSearchTerm && ` (filtered by "${kpiServerSearchTerm}")`}
                    </>
                  )}
                </span>
                {totalPages > 1 && (
                  <div className="flex items-center gap-2">
                    <button
                      onClick={() => handleKpiPageChange(Math.max(0, kpiPage - 1))}
                      disabled={kpiPage === 0 || kpiPageLoading}
                      className="px-2 py-1 rounded border border-neutral-300 hover:bg-neutral-100 disabled:opacity-50 disabled:cursor-not-allowed"
                    >
                      Previous
                    </button>
                    <span>Page {kpiPage + 1} of {totalPages.toLocaleString()}</span>
                    <button
                      onClick={() => handleKpiPageChange(Math.min(totalPages - 1, kpiPage + 1))}
                      disabled={kpiPage >= totalPages - 1 || kpiPageLoading}
                      className="px-2 py-1 rounded border border-neutral-300 hover:bg-neutral-100 disabled:opacity-50 disabled:cursor-not-allowed"
                    >
                      Next
                    </button>
                  </div>
                )}
              </div>
            </div>
          );
        })()}
      </ForecastKPIModal>

      <ForecastTargetsModal
        open={targetModalOpen}
        onClose={() => setTargetModalOpen(false)}
        onSave={() => {
          fetchTargets(); // Refresh from server after saving
        }}
      />

      <CompletionRatesDeepDive
        isOpen={completionRatesModalOpen}
        onClose={() => setCompletionRatesModalOpen(false)}
      />
    </div>
  );
}
