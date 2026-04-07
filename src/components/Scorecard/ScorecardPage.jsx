import React, { useState, useEffect } from 'react';
import {
  ArrowPathIcon,
  Cog6ToothIcon,
  TableCellsIcon,
  PlusIcon,
} from '@heroicons/react/24/outline';
import ScorecardConfigModal from './ScorecardConfigModal';

const CATEGORIES = ['Revenue', 'Sales', 'Operations', 'Quality', 'Platform'];

function formatValue(value, format) {
  if (value == null || value === undefined) return '\u2014';
  if (format === 'currency') return `$${Number(value).toLocaleString()}`;
  if (format === 'percent') return `${Number(value).toFixed(1)}%`;
  return Number(value).toLocaleString();
}

function formatWeekHeader(dateStr) {
  if (!dateStr) return '';
  const d = new Date(dateStr + 'T00:00:00');
  return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
}

function cellColor(value, goal, direction) {
  if (value == null || value === undefined || goal == null || goal === undefined) {
    return '';
  }
  const num = Number(value);
  const goalNum = Number(goal);
  const isOnTrack = direction === 'below' ? num <= goalNum : num >= goalNum;
  if (isOnTrack) return 'bg-[#E8F8ED] text-[#2A9147] font-medium';
  return 'bg-[#FCE8F0] text-[#AE255B] font-medium';
}

function LoadingSkeleton() {
  return (
    <div className="bg-white rounded-xl border border-neutral-200 shadow-sm overflow-hidden">
      <div className="px-6 py-4 border-b border-neutral-200">
        <div className="h-5 w-40 bg-neutral-200 rounded animate-pulse" />
      </div>
      <div className="p-4 space-y-2">
        {Array.from({ length: 10 }).map((_, i) => (
          <div key={i} className="flex gap-3 items-center">
            <div className="h-8 w-44 bg-neutral-100 rounded animate-pulse" />
            <div className="h-8 w-16 bg-neutral-100 rounded animate-pulse" />
            <div className="h-8 w-16 bg-neutral-100 rounded animate-pulse" />
            {Array.from({ length: 8 }).map((_, j) => (
              <div key={j} className="h-8 w-14 bg-neutral-100 rounded animate-pulse" />
            ))}
          </div>
        ))}
      </div>
    </div>
  );
}

export default function ScorecardPage() {
  const [snapshotData, setSnapshotData] = useState({ metrics: [], weeks: [], data: {} });
  const [currentWeek, setCurrentWeek] = useState({ values: {}, week_start: '' });
  const [loading, setLoading] = useState(true);
  const [showConfig, setShowConfig] = useState(false);
  const [refreshing, setRefreshing] = useState(false);

  async function loadData() {
    try {
      const [snapRes, currentRes] = await Promise.all([
        fetch('/api/scorecard/data?weeks=13', { credentials: 'include' }).then(r => r.json()),
        fetch('/api/scorecard/data/current', { credentials: 'include' }).then(r => r.json()),
      ]);
      setSnapshotData(snapRes);
      setCurrentWeek(currentRes);
    } catch (err) {
      console.error('Failed to load scorecard', err);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }

  useEffect(() => {
    loadData();
  }, []);

  function handleRefresh() {
    setRefreshing(true);
    loadData();
  }

  function handleConfigSave() {
    setShowConfig(false);
    setRefreshing(true);
    loadData();
  }

  const { metrics, weeks, data } = snapshotData;

  const grouped = CATEGORIES.map(cat => ({
    category: cat,
    metrics: (metrics || [])
      .filter(m => m.category === cat)
      .sort((a, b) => (a.sort_order || 0) - (b.sort_order || 0)),
  })).filter(g => g.metrics.length > 0);

  const hasMetrics = grouped.some(g => g.metrics.length > 0);
  const weekCount = (weeks || []).length;

  return (
    <div className="space-y-4">
      {/* Toolbar */}
      <div className="bg-white rounded-xl shadow-sm border border-neutral-200">
        <div className="flex flex-wrap items-center gap-2 px-4 py-3">
          <div className="flex items-center gap-2 text-sm text-neutral-500">
            <TableCellsIcon className="h-5 w-5 text-neutral-400" />
            <span className="font-medium text-neutral-700">Weekly metrics</span>
            <span>&middot;</span>
            <span>13-week trailing</span>
          </div>

          <div className="flex-1" />

          {hasMetrics && (
            <span className="text-sm text-neutral-500 tabular-nums">
              {(metrics || []).length} measurables
            </span>
          )}

          <button
            onClick={() => setShowConfig(true)}
            className="inline-flex items-center gap-1.5 px-3 py-1.5 text-sm font-medium text-neutral-700 bg-white border border-neutral-300 rounded-lg hover:bg-neutral-50 transition-colors"
          >
            <Cog6ToothIcon className="h-4 w-4" />
            Configure
          </button>
          <button
            onClick={handleRefresh}
            disabled={refreshing}
            className="inline-flex items-center gap-1.5 px-3 py-1.5 text-sm font-medium text-white bg-[#6A469D] rounded-lg hover:bg-[#5B3C87] transition-all duration-200 disabled:opacity-50 disabled:cursor-not-allowed"
          >
            <ArrowPathIcon className={`h-4 w-4 ${refreshing ? 'animate-spin' : ''}`} />
            Refresh
          </button>
        </div>
      </div>

      {/* Content */}
      {loading ? (
        <LoadingSkeleton />
      ) : !hasMetrics ? (
        <div className="bg-white rounded-xl border border-neutral-200 shadow-sm">
          <div className="flex flex-col items-center justify-center py-16 text-center">
            <TableCellsIcon className="h-12 w-12 text-neutral-300 mb-4" />
            <h3 className="text-lg font-semibold text-neutral-600 mb-2">No measurables yet</h3>
            <p className="text-sm text-neutral-400 mb-6 max-w-sm">
              Add your weekly scorecard measurables to start tracking your EOS numbers.
            </p>
            <button
              onClick={() => setShowConfig(true)}
              className="inline-flex items-center gap-2 px-4 py-2 text-sm font-medium text-white bg-[#6A469D] rounded-lg hover:bg-[#5B3C87] transition-all duration-200"
            >
              <PlusIcon className="h-5 w-5" />
              Add Measurable
            </button>
          </div>
        </div>
      ) : (
        <div className="bg-white rounded-xl border border-neutral-200 shadow-sm overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full table-fixed min-w-[1200px]">
              <colgroup>
                <col style={{ width: 200 }} />
                <col style={{ width: 80 }} />
                <col style={{ width: 80 }} />
                <col style={{ width: 90 }} />
                {(weeks || []).map((_, i) => (
                  <col key={i} style={{ width: 76 }} />
                ))}
              </colgroup>
              <thead>
                <tr className="border-t border-b border-neutral-200 bg-neutral-50/50">
                  <th className="sticky left-0 z-20 bg-neutral-50 px-4 py-2.5 text-left text-[11px] font-medium text-neutral-500 uppercase tracking-wider whitespace-nowrap select-none">
                    Measurable
                  </th>
                  <th className="sticky left-[200px] z-20 bg-neutral-50 px-3 py-2.5 text-left text-[11px] font-medium text-neutral-500 uppercase tracking-wider whitespace-nowrap select-none">
                    Owner
                  </th>
                  <th className="sticky left-[280px] z-20 bg-neutral-50 px-3 py-2.5 text-right text-[11px] font-medium text-neutral-500 uppercase tracking-wider whitespace-nowrap select-none">
                    Goal
                  </th>
                  <th className="px-3 py-2.5 text-right bg-[#F0EAFA]">
                    <div className="text-[11px] font-semibold text-[#6A469D] uppercase tracking-wider whitespace-nowrap">This Week</div>
                    {currentWeek.week_start && (
                      <div className="text-[10px] text-neutral-400 mt-0.5 tabular-nums">{formatWeekHeader(currentWeek.week_start)}</div>
                    )}
                  </th>
                  {(weeks || []).map(w => (
                    <th key={w} className="px-2 py-2.5 text-right text-[11px] font-medium text-neutral-500 whitespace-nowrap tabular-nums select-none">
                      {formatWeekHeader(w)}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {grouped.map(group => (
                  <React.Fragment key={group.category}>
                    {/* Category header row */}
                    <tr>
                      <td
                        colSpan={4 + weekCount}
                        className="bg-neutral-100/80 px-4 py-2 text-[11px] font-semibold text-neutral-500 uppercase tracking-wider border-b border-neutral-200"
                      >
                        {group.category}
                      </td>
                    </tr>
                    {/* Metric rows */}
                    {group.metrics.map(metric => {
                      const key = metric.metric_key;
                      const metricData = data[key] || {};
                      const currentVal = currentWeek.values?.[key];
                      const ownerFirst = metric.owner ? metric.owner.split(' ')[0] : '\u2014';
                      const goalDisplay = formatValue(metric.goal_value, metric.display_format);

                      return (
                        <tr key={key} className="border-b border-neutral-100 hover:bg-neutral-50 transition-colors">
                          {/* Metric name — sticky */}
                          <td className="sticky left-0 z-10 bg-white px-4 py-2.5 text-sm font-medium text-neutral-900 truncate">
                            {metric.display_name}
                          </td>
                          {/* Owner — sticky */}
                          <td className="sticky left-[200px] z-10 bg-white px-3 py-2.5 text-xs text-neutral-500">
                            {ownerFirst}
                          </td>
                          {/* Goal — sticky */}
                          <td className="sticky left-[280px] z-10 bg-white px-3 py-2.5 text-right text-sm text-neutral-600 tabular-nums">
                            {goalDisplay}
                          </td>
                          {/* Current week — highlighted */}
                          <td className={`px-3 py-2.5 text-right text-sm tabular-nums bg-[#F0EAFA]/50 ${cellColor(currentVal, metric.goal_value, metric.goal_direction)}`}>
                            {formatValue(currentVal, metric.display_format)}
                          </td>
                          {/* Historical weeks */}
                          {(weeks || []).map(w => {
                            const snap = metricData[w];
                            const val = snap ? snap.actual_value : null;
                            const color = cellColor(val, metric.goal_value, metric.goal_direction);
                            return (
                              <td key={w} className={`px-2 py-2.5 text-right text-sm tabular-nums ${color || 'text-neutral-700'}`}>
                                {val != null ? formatValue(val, metric.display_format) : (
                                  <span className="text-neutral-300">&mdash;</span>
                                )}
                              </td>
                            );
                          })}
                        </tr>
                      );
                    })}
                  </React.Fragment>
                ))}
              </tbody>
            </table>
          </div>

          {/* Legend */}
          <div className="flex flex-wrap items-center gap-4 px-4 py-3 border-t border-neutral-200 bg-neutral-50/50">
            <div className="flex items-center gap-1.5 text-xs text-neutral-500">
              <span className="inline-block h-3 w-3 rounded bg-[#E8F8ED] ring-1 ring-[#2A9147]/30" />
              On track
            </div>
            <div className="flex items-center gap-1.5 text-xs text-neutral-500">
              <span className="inline-block h-3 w-3 rounded bg-[#FCE8F0] ring-1 ring-[#AE255B]/30" />
              Off track
            </div>
            <div className="flex items-center gap-1.5 text-xs text-neutral-500">
              <span className="inline-block h-3 w-3 rounded bg-neutral-100 ring-1 ring-neutral-300" />
              No data
            </div>
            <span className="text-xs text-neutral-400">
              &ldquo;Above&rdquo; = on track when value &ge; goal &bull; &ldquo;Below&rdquo; = on track when value &le; goal
            </span>
          </div>
        </div>
      )}

      {/* Config Modal */}
      {showConfig && (
        <ScorecardConfigModal
          open={showConfig}
          onClose={() => setShowConfig(false)}
          metrics={metrics || []}
          onSave={handleConfigSave}
        />
      )}
    </div>
  );
}
