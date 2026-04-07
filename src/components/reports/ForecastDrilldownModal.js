import React, { useState, useEffect, useMemo } from 'react';
import { XMarkIcon, ArrowDownTrayIcon, MagnifyingGlassIcon, ChevronUpIcon, ChevronDownIcon } from '@heroicons/react/24/outline';
import axios from 'axios';
import { DateTime } from 'luxon';

const fmtCurrency = (val) => {
  if (val == null) return '$0';
  return '$' + Math.round(val).toLocaleString();
};

/**
 * ForecastDrilldownModal
 * Shows scheduled lessons for a forecast period, with search, sort, and CSV export.
 * Reuses the existing /api/forecast/drilldown-list endpoint.
 */
export default function ForecastDrilldownModal({
  open,
  onClose,
  metricKey,
  metricLabel,
  channel,
  dateRange,
  currentValue,
  completionRate
}) {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [lessons, setLessons] = useState([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(0);
  const [hasMore, setHasMore] = useState(false);
  const [searchTerm, setSearchTerm] = useState('');
  const [searchInput, setSearchInput] = useState('');
  const [sortKey, setSortKey] = useState('date');
  const [sortDir, setSortDir] = useState('asc');

  useEffect(() => {
    if (!open) {
      setLessons([]);
      setError(null);
      setSearchTerm('');
      setSearchInput('');
      setPage(0);
      setSortKey('date');
      setSortDir('asc');
    }
  }, [open]);

  useEffect(() => {
    if (open && dateRange) {
      setLessons([]);
      setPage(0);
      fetchData(0);
    }
  }, [open, dateRange, channel, searchTerm]);

  const fetchData = async (pageNum) => {
    setLoading(true);
    setError(null);

    try {
      const params = {
        start_date: dateRange.start,
        end_date: dateRange.end,
        page: pageNum,
        limit: 200,
        include_completed: 'true'
      };
      if (channel && channel !== 'all') params.channel = channel;
      if (searchTerm) params.search = searchTerm;

      const response = await axios.get('/api/forecast/drilldown-list', {
        params,
        withCredentials: true
      });

      const result = response.data;
      if (pageNum === 0) {
        setLessons(result.lessons || []);
      } else {
        setLessons(prev => [...prev, ...(result.lessons || [])]);
      }
      setTotal(result.pagination?.total || 0);
      setHasMore(result.pagination?.has_more || false);
      setPage(pageNum);
    } catch (err) {
      console.error('Error fetching forecast drilldown:', err);
      setError(err.response?.data?.error || err.message || 'Failed to load data');
    } finally {
      setLoading(false);
    }
  };

  const handleSearch = (e) => {
    e.preventDefault();
    setSearchTerm(searchInput);
  };

  const handleLoadMore = () => {
    fetchData(page + 1);
  };

  const handleSort = (key) => {
    if (sortKey === key) {
      setSortDir(prev => prev === 'asc' ? 'desc' : 'asc');
    } else {
      setSortKey(key);
      setSortDir(key === 'date' ? 'asc' : 'desc');
    }
  };

  const SortIcon = ({ columnKey }) => {
    if (sortKey !== columnKey) return <ChevronUpIcon className="h-3 w-3 text-neutral-300 ml-0.5 inline" />;
    return sortDir === 'asc'
      ? <ChevronUpIcon className="h-3 w-3 text-purple-600 ml-0.5 inline" />
      : <ChevronDownIcon className="h-3 w-3 text-purple-600 ml-0.5 inline" />;
  };

  // Sorted lessons
  const sortedLessons = useMemo(() => {
    const sorted = [...lessons];
    const dir = sortDir === 'asc' ? 1 : -1;

    sorted.sort((a, b) => {
      switch (sortKey) {
        case 'date': {
          const da = String(a.date || '').slice(0, 10);
          const db = String(b.date || '').slice(0, 10);
          return da.localeCompare(db) * dir;
        }
        case 'status':
          return (a.source_type || '').localeCompare(b.source_type || '') * dir;
        case 'job':
          return (a.job_name || '').localeCompare(b.job_name || '') * dir;
        case 'tutor':
          return (a.contractor_name || '').localeCompare(b.contractor_name || '') * dir;
        case 'client':
          return ((a.paying_client_name || a.recipient_name || '')).localeCompare((b.paying_client_name || b.recipient_name || '')) * dir;
        case 'channel':
          return (a.channel || '').localeCompare(b.channel || '') * dir;
        case 'revenue':
          return ((a.expected_revenue || 0) - (b.expected_revenue || 0)) * dir;
        case 'pay':
          return ((a.expected_tutor_pay || 0) - (b.expected_tutor_pay || 0)) * dir;
        case 'profit': {
          const pa = (a.expected_revenue || 0) - (a.expected_tutor_pay || 0);
          const pb = (b.expected_revenue || 0) - (b.expected_tutor_pay || 0);
          return (pa - pb) * dir;
        }
        default:
          return 0;
      }
    });
    return sorted;
  }, [lessons, sortKey, sortDir]);

  const channelLabel = {
    home: 'Home',
    digital: 'Online',
    schools: 'Schools',
    clubs: 'Clubs',
    all: 'All Channels'
  };

  // Compute raw totals from the data
  const rawTotals = useMemo(() => {
    const rev = lessons.reduce((s, l) => s + (l.expected_revenue || 0), 0);
    const pay = lessons.reduce((s, l) => s + (l.expected_tutor_pay || 0), 0);
    return { revenue: rev, tutorPay: pay, lessons: lessons.length, profit: rev - pay };
  }, [lessons]);

  // Export all lessons to CSV
  const exportToCSV = async () => {
    try {
      const params = {
        start_date: dateRange.start,
        end_date: dateRange.end,
        page: 0,
        limit: 500,
        include_completed: 'true'
      };
      if (channel && channel !== 'all') params.channel = channel;
      if (searchTerm) params.search = searchTerm;

      let allLessons = [];
      let currentPage = 0;
      let more = true;

      while (more) {
        const response = await axios.get('/api/forecast/drilldown-list', {
          params: { ...params, page: currentPage },
          withCredentials: true
        });
        allLessons = allLessons.concat(response.data.lessons || []);
        more = response.data.pagination?.has_more || false;
        currentPage++;
        if (currentPage > 20) break;
      }

      const headers = ['Date', 'Status', 'Job Name', 'Tutor', 'Client', 'Channel', 'Revenue', 'Tutor Pay', 'Profit', 'Appointment ID'];
      const rows = allLessons.map(l => {
        const dateStr = l.date instanceof Date ? l.date.toISOString().slice(0, 10) : String(l.date || '').slice(0, 10);
        const profit = (l.expected_revenue || 0) - (l.expected_tutor_pay || 0);
        return [
          dateStr,
          l.source_type || '',
          `"${(l.job_name || '').replace(/"/g, '""')}"`,
          `"${(l.contractor_name || '').replace(/"/g, '""')}"`,
          `"${(l.paying_client_name || '').replace(/"/g, '""')}"`,
          l.channel || '',
          (l.expected_revenue || 0).toFixed(2),
          (l.expected_tutor_pay || 0).toFixed(2),
          profit.toFixed(2),
          l.appointment_id || ''
        ];
      });

      const csvContent = [headers, ...rows].map(r => r.join(',')).join('\n');
      const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
      const link = document.createElement('a');
      link.href = URL.createObjectURL(blob);
      link.download = `forecast_${metricKey}_${channel || 'all'}_${dateRange.start}_to_${dateRange.end}.csv`;
      link.style.visibility = 'hidden';
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
    } catch (err) {
      console.error('CSV export error:', err);
    }
  };

  if (!open) return null;

  const thClass = 'px-2 py-2 text-xs font-semibold text-neutral-600 uppercase cursor-pointer hover:text-purple-600 select-none whitespace-nowrap';

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-lg shadow-xl max-w-5xl w-full max-h-[90vh] min-h-[500px] flex flex-col">
        {/* Header */}
        <div className="flex items-center justify-between px-5 py-4 border-b border-neutral-200 flex-shrink-0">
          <div className="min-w-0">
            <h2 className="text-lg font-semibold text-neutral-900 truncate">
              {metricLabel}
            </h2>
            <p className="text-xs text-neutral-500 mt-0.5">
              {dateRange.start} to {dateRange.end}
              {currentValue !== undefined && (
                <span className="ml-2 text-purple-600 font-medium">
                  (Forecast: {typeof currentValue === 'number'
                    ? (metricKey === 'lessons' ? currentValue.toLocaleString() : fmtCurrency(currentValue))
                    : currentValue})
                </span>
              )}
              {completionRate && (
                <span className="ml-1 text-neutral-400">
                  at {Math.round(completionRate * 100)}% completion
                </span>
              )}
            </p>
          </div>
          <button
            onClick={onClose}
            className="text-neutral-400 hover:text-neutral-600 transition-colors ml-4 flex-shrink-0"
          >
            <XMarkIcon className="h-6 w-6" />
          </button>
        </div>

        {/* Search and Export */}
        <div className="flex items-center justify-between px-5 py-3 border-b border-neutral-100 flex-shrink-0">
          <form onSubmit={handleSearch} className="relative flex-1 max-w-sm">
            <MagnifyingGlassIcon className="absolute left-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-neutral-400" />
            <input
              type="text"
              placeholder="Search job, tutor, or ID..."
              value={searchInput}
              onChange={(e) => setSearchInput(e.target.value)}
              onBlur={() => { if (searchInput !== searchTerm) setSearchTerm(searchInput); }}
              className="w-full pl-9 pr-3 py-1.5 border border-neutral-300 rounded-lg focus:ring-2 focus:ring-purple-500 focus:border-purple-500 text-sm"
            />
          </form>
          <button
            onClick={exportToCSV}
            className="flex items-center space-x-1.5 px-3 py-1.5 bg-purple-600 text-white rounded-lg hover:bg-purple-700 transition-colors ml-3 text-sm"
          >
            <ArrowDownTrayIcon className="h-4 w-4" />
            <span className="font-medium">CSV</span>
          </button>
        </div>

        {/* Content */}
        <div className="flex-1 overflow-y-auto px-5 py-4">
          {loading && lessons.length === 0 ? (
            <div className="flex items-center justify-center py-12">
              <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-purple-600"></div>
              <span className="ml-3 text-neutral-600">Loading scheduled lessons...</span>
            </div>
          ) : error ? (
            <div className="bg-red-50 border border-red-200 rounded-lg p-4">
              <p className="text-red-800">{error}</p>
            </div>
          ) : sortedLessons.length === 0 ? (
            <div className="text-center py-12">
              <div className="text-neutral-500">
                {searchTerm ? 'No results match your search.' : 'No scheduled lessons found for this period.'}
              </div>
            </div>
          ) : (
            <>
              {/* Summary bar */}
              <div className="flex flex-wrap items-center gap-4 mb-3 text-xs">
                <span className="text-neutral-500">
                  Scheduled: <span className="font-semibold text-neutral-800">{total.toLocaleString()}</span>
                </span>
                <span className="text-neutral-500">
                  Rev: <span className="font-semibold text-neutral-800">{fmtCurrency(rawTotals.revenue)}</span>
                </span>
                <span className="text-neutral-500">
                  Pay: <span className="font-semibold text-neutral-800">{fmtCurrency(rawTotals.tutorPay)}</span>
                </span>
                <span className="text-neutral-500">
                  Profit: <span className="font-semibold text-neutral-800">{fmtCurrency(rawTotals.profit)}</span>
                </span>
              </div>

              <table className="w-full text-sm">
                <thead>
                  <tr className="bg-neutral-50 border-b border-neutral-200">
                    <th className={`${thClass} text-left`} onClick={() => handleSort('date')}>
                      Date <SortIcon columnKey="date" />
                    </th>
                    <th className={`${thClass} text-left`} onClick={() => handleSort('status')}>
                      Status <SortIcon columnKey="status" />
                    </th>
                    <th className={`${thClass} text-left`} onClick={() => handleSort('job')}>
                      Job <SortIcon columnKey="job" />
                    </th>
                    <th className={`${thClass} text-left`} onClick={() => handleSort('tutor')}>
                      Tutor <SortIcon columnKey="tutor" />
                    </th>
                    <th className={`${thClass} text-left`} onClick={() => handleSort('client')}>
                      Client <SortIcon columnKey="client" />
                    </th>
                    <th className={`${thClass} text-left`} onClick={() => handleSort('channel')}>
                      Ch <SortIcon columnKey="channel" />
                    </th>
                    <th className={`${thClass} text-right`} onClick={() => handleSort('revenue')}>
                      Rev <SortIcon columnKey="revenue" />
                    </th>
                    <th className={`${thClass} text-right`} onClick={() => handleSort('pay')}>
                      Pay <SortIcon columnKey="pay" />
                    </th>
                    <th className={`${thClass} text-right`} onClick={() => handleSort('profit')}>
                      Profit <SortIcon columnKey="profit" />
                    </th>
                    <th className={`${thClass} text-center`}>TC</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-neutral-100">
                  {sortedLessons.map((lesson, idx) => {
                    const dateStr = lesson.date instanceof Date ? lesson.date.toISOString().slice(0, 10) : String(lesson.date || '').slice(0, 10);
                    const profit = (lesson.expected_revenue || 0) - (lesson.expected_tutor_pay || 0);
                    const statusColors = {
                      scheduled: 'bg-blue-50 text-blue-700',
                      pending: 'bg-amber-50 text-amber-700',
                      completed: 'bg-green-50 text-green-700'
                    };
                    return (
                      <tr key={`${lesson.appointment_id}-${idx}`} className="hover:bg-neutral-50 transition-colors">
                        <td className="px-2 py-1.5 text-neutral-700 whitespace-nowrap">{dateStr}</td>
                        <td className="px-2 py-1.5 whitespace-nowrap">
                          <span className={`px-1.5 py-0.5 text-xs font-medium rounded-full ${statusColors[lesson.source_type] || 'bg-neutral-100 text-neutral-600'}`}>
                            {lesson.source_type}
                          </span>
                        </td>
                        <td className="px-2 py-1.5 text-neutral-700 max-w-[140px] truncate" title={lesson.job_name}>{lesson.job_name}</td>
                        <td className="px-2 py-1.5 text-neutral-700 max-w-[100px] truncate" title={lesson.contractor_name}>{lesson.contractor_name || '-'}</td>
                        <td className="px-2 py-1.5 text-neutral-700 max-w-[120px] truncate" title={lesson.paying_client_name || lesson.recipient_name}>{lesson.paying_client_name || lesson.recipient_name || '-'}</td>
                        <td className="px-2 py-1.5 text-neutral-500 whitespace-nowrap">{channelLabel[lesson.channel] || lesson.channel}</td>
                        <td className="px-2 py-1.5 text-right text-neutral-700 whitespace-nowrap">{fmtCurrency(lesson.expected_revenue)}</td>
                        <td className="px-2 py-1.5 text-right text-neutral-700 whitespace-nowrap">{fmtCurrency(lesson.expected_tutor_pay)}</td>
                        <td className="px-2 py-1.5 text-right text-neutral-700 whitespace-nowrap">{fmtCurrency(profit)}</td>
                        <td className="px-2 py-1.5 text-center whitespace-nowrap">
                          <a
                            href={`https://account.acmeops.com/cal/appointments/${lesson.appointment_id}/`}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="text-purple-600 hover:text-purple-700 hover:underline text-xs"
                          >
                            View
                          </a>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>

              {/* Load More */}
              {hasMore && (
                <div className="flex justify-center mt-4">
                  <button
                    onClick={handleLoadMore}
                    disabled={loading}
                    className="px-4 py-2 text-sm font-medium text-purple-700 bg-purple-50 rounded-lg hover:bg-purple-100 disabled:opacity-50 transition-colors"
                  >
                    {loading ? 'Loading...' : `Load More (${sortedLessons.length} of ${total})`}
                  </button>
                </div>
              )}
            </>
          )}
        </div>

        {/* Footer */}
        <div className="flex items-center justify-between px-5 py-3 border-t border-neutral-200 bg-neutral-50 flex-shrink-0">
          <div className="text-xs text-neutral-500">
            {sortedLessons.length} of {total} lessons · Sorted by {sortKey} {sortDir === 'asc' ? '↑' : '↓'}
          </div>
          <button
            onClick={onClose}
            className="px-4 py-1.5 bg-neutral-200 text-neutral-700 rounded-lg hover:bg-neutral-300 transition-colors text-sm font-medium"
          >
            Close
          </button>
        </div>
      </div>
    </div>
  );
}
