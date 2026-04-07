import React, { useState, useEffect, useMemo } from 'react';
import { useSearchParams } from 'react-router-dom';
import { formatCurrency, formatDateTime } from '../utils/formatters';
import {
  ArrowDownTrayIcon,
  ChevronUpIcon,
  ChevronDownIcon,
  ArrowPathIcon,
  CalendarIcon,
  DocumentTextIcon,
  CurrencyDollarIcon,
  ClockIcon,
  FunnelIcon,
} from '@heroicons/react/24/outline';
import {
  AcademicCapIcon,
  BanknotesIcon,
} from '@heroicons/react/24/solid';

const ACTIVITY_TYPES = [
  { value: 'all', label: 'All Activities', icon: ClockIcon },
  { value: 'lesson_completed', label: 'Completed Lessons', icon: AcademicCapIcon },
  { value: 'report_created', label: 'Reports', icon: DocumentTextIcon },
  { value: 'invoice', label: 'Invoices', icon: DocumentTextIcon },
  { value: 'payment_order', label: 'Payment Orders', icon: BanknotesIcon },
];

function ActivityPage() {
  const [searchParams, setSearchParams] = useSearchParams();
  const [startDate, setStartDate] = useState(
    searchParams.get('startDate') ||
    new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString().split('T')[0]
  );
  const [endDate, setEndDate] = useState(
    searchParams.get('endDate') ||
    new Date().toISOString().split('T')[0]
  );
  const [activityType, setActivityType] = useState(
    searchParams.get('activityType') || 'all'
  );
  const [activities, setActivities] = useState([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [page, setPage] = useState(1);
  const [hasMore, setHasMore] = useState(false);
  const limit = 50;

  useEffect(() => {
    fetchActivities();
  }, [startDate, endDate, activityType, page]);

  const fetchActivities = async () => {
    setLoading(true);
    setError(null);
    try {
      const params = new URLSearchParams({
        startDate,
        endDate,
        limit: limit.toString(),
        offset: ((page - 1) * limit).toString(),
      });

      if (activityType && activityType !== 'all') {
        params.set('activityType', activityType);
      }

      const response = await fetch(`/api/activity/feed?${params}`, {
        credentials: 'include',
      });

      if (!response.ok) {
        throw new Error('Failed to fetch activity feed');
      }

      const result = await response.json();
      
      if (page === 1) {
        setActivities(result.activities || []);
      } else {
        setActivities(prev => [...prev, ...(result.activities || [])]);
      }
      
      setTotal(result.total || 0);
      setHasMore(result.hasMore || false);

      // Update URL params
      const newParams = new URLSearchParams(searchParams);
      newParams.set('startDate', startDate);
      newParams.set('endDate', endDate);
      newParams.set('activityType', activityType);
      setSearchParams(newParams, { replace: true });
    } catch (err) {
      console.error('Error fetching activity feed:', err);
      setError(err.message);
      setActivities([]);
      setTotal(0);
    } finally {
      setLoading(false);
    }
  };

  const handleReset = () => {
    setStartDate(new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString().split('T')[0]);
    setEndDate(new Date().toISOString().split('T')[0]);
    setActivityType('all');
    setPage(1);
  };

  const handleLoadMore = () => {
    setPage(prev => prev + 1);
  };

  const handleActivityTypeChange = (type) => {
    setActivityType(type);
    setPage(1);
  };

  const formatDate = formatDateTime;


  const getActivityIcon = (type) => {
    const activityType = ACTIVITY_TYPES.find(t => t.value === type);
    return activityType ? activityType.icon : ClockIcon;
  };

  const getActivityColor = (type) => {
    switch (type) {
      case 'appointment':
        return 'bg-blue-100 text-blue-800';
      case 'invoice':
        return 'bg-green-100 text-green-800';
      case 'payment_order':
        return 'bg-purple-100 text-purple-800';
      default:
        return 'bg-neutral-100 text-neutral-800';
    }
  };

  const getStatusColor = (status) => {
    if (!status) return 'bg-neutral-100 text-neutral-800';
    const statusLower = status.toLowerCase();
    if (statusLower.includes('paid') || statusLower.includes('complete')) {
      return 'bg-green-100 text-green-800';
    } else if (statusLower.includes('unpaid') || statusLower.includes('pending')) {
      return 'bg-yellow-100 text-yellow-800';
    } else if (statusLower.includes('cancelled') || statusLower.includes('failed')) {
      return 'bg-red-100 text-red-800';
    }
    return 'bg-neutral-100 text-neutral-800';
  };

  const handleExportCSV = () => {
    if (!activities.length) return;

    const headers = ['Date', 'Type', 'Title', 'Description', 'Status', 'Amount'];

    const rows = activities.map((activity) => [
      formatDate(activity.timestamp),
      activity.activity_type,
      activity.title || 'N/A',
      activity.description || 'N/A',
      activity.status || 'N/A',
      activity.amount ? formatCurrency(activity.amount) : '$0.00',
    ]);

    const csvContent = [
      headers.join(','),
      ...rows.map((row) => row.map(cell => `"${cell}"`).join(',')),
    ].join('\n');

    const blob = new Blob([csvContent], { type: 'text/csv' });
    const url = window.URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `activity-feed-${startDate}-to-${endDate}.csv`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    window.URL.revokeObjectURL(url);
  };


  // Group activities by date
  const groupedActivities = useMemo(() => {
    const groups = {};
    activities.forEach((activity) => {
      const dateKey = new Date(activity.timestamp).toLocaleDateString('en-US', {
        year: 'numeric',
        month: 'long',
        day: 'numeric'
      });
      if (!groups[dateKey]) {
        groups[dateKey] = [];
      }
      groups[dateKey].push(activity);
    });
    return groups;
  }, [activities]);

  return (
      <div className="max-w-7xl mx-auto w-full">
        <div className="bg-white rounded-xl shadow-sm border border-neutral-200 p-6">
          {/* Header */}
          <div className="mb-6">
            <h1 className="text-2xl font-bold text-neutral-900 mb-4">Activity Feed</h1>
            
            {/* Filters */}
            <div className="flex flex-wrap items-center gap-4 mb-4">
              <div className="flex items-center gap-2">
                <CalendarIcon className="h-5 w-5 text-neutral-400" />
                <input
                  type="date"
                  value={startDate}
                  onChange={(e) => {
                    setStartDate(e.target.value);
                    setPage(1);
                  }}
                  className="border border-neutral-300 rounded-md px-3 py-1.5 text-sm"
                />
                <span className="text-neutral-500">-</span>
                <input
                  type="date"
                  value={endDate}
                  onChange={(e) => {
                    setEndDate(e.target.value);
                    setPage(1);
                  }}
                  className="border border-neutral-300 rounded-md px-3 py-1.5 text-sm"
                />
              </div>

              <div className="flex items-center gap-2">
                <FunnelIcon className="h-5 w-5 text-neutral-400" />
                <select
                  value={activityType}
                  onChange={(e) => handleActivityTypeChange(e.target.value)}
                  className="border border-neutral-300 rounded-md px-3 py-1.5 text-sm"
                >
                  {ACTIVITY_TYPES.map((type) => (
                    <option key={type.value} value={type.value}>
                      {type.label}
                    </option>
                  ))}
                </select>
              </div>

              <button
                onClick={handleReset}
                className="flex items-center gap-2 px-4 py-2 text-sm font-medium text-neutral-700 bg-white border border-neutral-300 rounded-md hover:bg-neutral-50 transition-colors"
              >
                <ArrowPathIcon className="h-4 w-4" />
                Reset
              </button>

              <button
                onClick={fetchActivities}
                className="px-4 py-2 text-sm font-medium text-white bg-brand-purple rounded-md hover:bg-brand-navy transition-colors"
              >
                Refresh
              </button>

              <div className="ml-auto">
                <button
                  onClick={handleExportCSV}
                  className="flex items-center gap-2 px-4 py-2 text-sm font-medium text-neutral-700 bg-white border border-neutral-300 rounded-md hover:bg-neutral-50 transition-colors"
                >
                  <ArrowDownTrayIcon className="h-5 w-5" />
                  Export CSV
                </button>
              </div>
            </div>

            {/* Summary */}
            <div className="flex items-center gap-4 text-sm text-neutral-600">
              <span>Total Activities: <strong className="text-neutral-900">{total.toLocaleString()}</strong></span>
              <span>Showing: <strong className="text-neutral-900">{activities.length.toLocaleString()}</strong></span>
            </div>
          </div>

          {loading && activities.length === 0 && (
            <div className="text-center py-12">
              <div className="inline-block animate-spin rounded-full h-8 w-8 border-b-2 border-brand-purple"></div>
              <p className="mt-2 text-neutral-500">Loading activities...</p>
            </div>
          )}

          {error && (
            <div className="bg-red-50 border border-red-200 rounded-lg p-4 mb-6">
              <p className="text-red-800">{error}</p>
            </div>
          )}

          {!loading && !error && activities.length === 0 && (
            <div className="text-center py-12">
              <ClockIcon className="h-12 w-12 text-neutral-400 mx-auto mb-4" />
              <p className="text-neutral-600">No activities found for the selected date range.</p>
            </div>
          )}

          {!loading && !error && activities.length > 0 && (
            <div className="space-y-6">
              {Object.entries(groupedActivities).map(([dateKey, dateActivities]) => (
                <div key={dateKey} className="border-l-2 border-neutral-200 pl-4">
                  <h3 className="text-lg font-semibold text-neutral-900 mb-3 sticky top-0 bg-white py-2">
                    {dateKey}
                  </h3>
                  <div className="space-y-3">
                    {dateActivities.map((activity) => {
                      const Icon = getActivityIcon(activity.activity_type);
                      return (
                        <div
                          key={`${activity.activity_type}-${activity.id}`}
                          className="bg-neutral-50 rounded-lg p-4 hover:bg-neutral-100 transition-colors"
                        >
                          <div className="flex items-start gap-4">
                            <div className={`flex-shrink-0 p-2 rounded-lg ${getActivityColor(activity.activity_type)}`}>
                              <Icon className="h-5 w-5" />
                            </div>
                            <div className="flex-1 min-w-0">
                              <div className="flex items-start justify-between gap-4">
                                <div className="flex-1">
                                  <div className="flex items-center gap-2 mb-1">
                                    {activity.actor_name && (
                                      <span className="text-sm font-semibold text-neutral-900">
                                        {activity.actor_name} •
                                      </span>
                                    )}
                                    <h4 className="text-sm font-semibold text-neutral-900">
                                      {activity.title}
                                    </h4>
                                    <span className={`px-2 py-0.5 rounded text-xs font-medium ${getActivityColor(activity.activity_type)}`}>
                                      {activity.activity_type.replace('_', ' ')}
                                    </span>
                                  </div>
                                  <p className="text-sm text-neutral-600 mb-2">
                                    {activity.description}
                                  </p>
                                  <div className="flex items-center gap-4 text-xs text-neutral-500">
                                    <span>{formatDate(activity.timestamp)}</span>
                                    {activity.status && (
                                      <span className={`px-2 py-0.5 rounded ${getStatusColor(activity.status)}`}>
                                        {activity.status}
                                      </span>
                                    )}
                                    {activity.amount && (
                                      <span className="font-medium text-neutral-900">
                                        {formatCurrency(activity.amount)}
                                      </span>
                                    )}
                                  </div>
                                </div>
                              </div>
                            </div>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </div>
              ))}

              {/* Load More Button */}
              {hasMore && (
                <div className="text-center pt-4">
                  <button
                    onClick={handleLoadMore}
                    disabled={loading}
                    className="px-6 py-2 text-sm font-medium text-brand-purple bg-white border border-brand-purple rounded-md hover:bg-brand-purple hover:text-white transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                  >
                    {loading ? 'Loading...' : 'Load More'}
                  </button>
                </div>
              )}
            </div>
          )}
        </div>
      </div>
  );
}

export default ActivityPage;
