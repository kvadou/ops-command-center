import React, { useState, useEffect, useCallback } from 'react';
import { DateTime } from 'luxon';
import { formatCurrency } from '../../utils/formatters';
import {
  UserGroupIcon,
  AcademicCapIcon,
  CalendarDaysIcon,
  ExclamationTriangleIcon,
  ClipboardDocumentCheckIcon,
  CalendarIcon,
  CreditCardIcon,
  UserPlusIcon,
  SunIcon,
  ChevronLeftIcon,
  ChevronRightIcon,
  XMarkIcon,
} from '@heroicons/react/24/outline';

export default function ClubAnalyticsContent() {
  const [viewMode, setViewMode] = useState('week'); // 'week' or 'month'
  const [currentDate, setCurrentDate] = useState(() =>
    DateTime.now().setZone('America/New_York').startOf('week')
  );
  const [analyticsData, setAnalyticsData] = useState(null);
  const [loading, setLoading] = useState(false);

  // Drill-down state
  const [drilldownOpen, setDrilldownOpen] = useState(false);
  const [drilldownData, setDrilldownData] = useState(null);
  const [drilldownLoading, setDrilldownLoading] = useState(false);
  const [selectedMetric, setSelectedMetric] = useState(null);

  // Calculate date range based on view mode
  const getDateRange = useCallback(() => {
    if (viewMode === 'week') {
      const startDate = currentDate.startOf('week');
      const endDate = currentDate.endOf('week');
      return { startDate, endDate };
    } else {
      const startDate = currentDate.startOf('month');
      const endDate = currentDate.endOf('month');
      return { startDate, endDate };
    }
  }, [currentDate, viewMode]);

  // Navigate to previous/next period
  const navigatePeriod = (direction) => {
    if (viewMode === 'week') {
      setCurrentDate(prev => direction === 'prev' ? prev.minus({ weeks: 1 }) : prev.plus({ weeks: 1 }));
    } else {
      setCurrentDate(prev => direction === 'prev' ? prev.minus({ months: 1 }) : prev.plus({ months: 1 }));
    }
  };

  // Go to current week/month
  const goToCurrentPeriod = () => {
    setCurrentDate(DateTime.now().setZone('America/New_York'));
  };

  // Fetch analytics data
  const fetchAnalyticsData = useCallback(async () => {
    try {
      setLoading(true);
      const { startDate, endDate } = getDateRange();
      const response = await fetch(
        `/api/clubs/analytics?startDate=${startDate.toISODate()}&endDate=${endDate.toISODate()}`,
        { credentials: 'include' }
      );
      if (response.ok) {
        const data = await response.json();
        setAnalyticsData(data);
      } else {
        console.error('Failed to fetch analytics data');
      }
    } catch (error) {
      console.error('Error fetching analytics data:', error);
    } finally {
      setLoading(false);
    }
  }, [getDateRange]);

  // Fetch drill-down data for a specific metric
  const fetchDrilldownData = async (metricKey, metricLabel) => {
    try {
      setDrilldownLoading(true);
      setDrilldownOpen(true);
      setSelectedMetric({ key: metricKey, label: metricLabel });

      const { startDate, endDate } = getDateRange();
      const response = await fetch(
        `/api/clubs/analytics/drilldown/${metricKey}?startDate=${startDate.toISODate()}&endDate=${endDate.toISODate()}`,
        { credentials: 'include' }
      );
      if (response.ok) {
        const data = await response.json();
        setDrilldownData(data);
      } else {
        console.error('Failed to fetch drilldown data');
        setDrilldownData({ error: 'Failed to load data' });
      }
    } catch (error) {
      console.error('Error fetching drilldown data:', error);
      setDrilldownData({ error: error.message });
    } finally {
      setDrilldownLoading(false);
    }
  };

  // Close drill-down modal
  const closeDrilldown = () => {
    setDrilldownOpen(false);
    setDrilldownData(null);
    setSelectedMetric(null);
  };

  // Fetch data when date changes
  useEffect(() => {
    fetchAnalyticsData();
  }, [fetchAnalyticsData]);

  // Format the period label
  const getPeriodLabel = () => {
    const { startDate, endDate } = getDateRange();
    if (viewMode === 'week') {
      return `${startDate.toFormat('MMM d')} - ${endDate.toFormat('MMM d, yyyy')}`;
    } else {
      return currentDate.toFormat('MMMM yyyy');
    }
  };

  // Check if we're viewing the current period
  const isCurrentPeriod = () => {
    const now = DateTime.now().setZone('America/New_York');
    if (viewMode === 'week') {
      return currentDate.startOf('week').hasSame(now.startOf('week'), 'day');
    } else {
      return currentDate.startOf('month').hasSame(now.startOf('month'), 'day');
    }
  };

  // Format date for display
  const formatDate = (dateStr) => {
    if (!dateStr) return '-';
    return DateTime.fromISO(dateStr).setZone('America/New_York').toFormat('MMM d, yyyy h:mm a');
  };


  // Render drill-down table based on metric type
  const renderDrilldownTable = () => {
    if (!drilldownData || !drilldownData.data) return null;

    const { data } = drilldownData;
    const metricKey = selectedMetric?.key;

    // Different table layouts for different metrics
    if (['psTotalStudents', 'psCampKids', 'psClassKids'].includes(metricKey)) {
      return (
        <table className="min-w-full divide-y divide-neutral-200">
          <thead className="bg-neutral-50">
            <tr>
              <th className="px-4 py-3 text-left text-xs font-medium text-neutral-500 uppercase">Name</th>
              <th className="px-4 py-3 text-left text-xs font-medium text-neutral-500 uppercase">Email</th>
              <th className="px-4 py-3 text-left text-xs font-medium text-neutral-500 uppercase">Lessons</th>
            </tr>
          </thead>
          <tbody className="bg-white divide-y divide-neutral-200">
            {data.map((row, idx) => (
              <tr key={idx} className="hover:bg-neutral-50">
                <td className="px-4 py-3 text-sm text-neutral-900">{row.first_name} {row.last_name}</td>
                <td className="px-4 py-3 text-sm text-neutral-600">{row.email || '-'}</td>
                <td className="px-4 py-3 text-sm text-neutral-900">{row.lesson_count}</td>
              </tr>
            ))}
          </tbody>
        </table>
      );
    }

    if (metricKey === 'psClasses') {
      return (
        <table className="min-w-full divide-y divide-neutral-200">
          <thead className="bg-neutral-50">
            <tr>
              <th className="px-4 py-3 text-left text-xs font-medium text-neutral-500 uppercase">Date</th>
              <th className="px-4 py-3 text-left text-xs font-medium text-neutral-500 uppercase">Service</th>
              <th className="px-4 py-3 text-left text-xs font-medium text-neutral-500 uppercase">Tutor</th>
              <th className="px-4 py-3 text-left text-xs font-medium text-neutral-500 uppercase">Students</th>
            </tr>
          </thead>
          <tbody className="bg-white divide-y divide-neutral-200">
            {data.map((row, idx) => (
              <tr key={idx} className="hover:bg-neutral-50">
                <td className="px-4 py-3 text-sm text-neutral-900">{formatDate(row.start)}</td>
                <td className="px-4 py-3 text-sm text-neutral-600">{row.service_name}</td>
                <td className="px-4 py-3 text-sm text-neutral-600">{row.tutor_first} {row.tutor_last}</td>
                <td className="px-4 py-3 text-sm text-neutral-900">{row.student_count}</td>
              </tr>
            ))}
          </tbody>
        </table>
      );
    }

    if (metricKey === 'psClassesOperateLoss') {
      return (
        <table className="min-w-full divide-y divide-neutral-200">
          <thead className="bg-neutral-50">
            <tr>
              <th className="px-4 py-3 text-left text-xs font-medium text-neutral-500 uppercase">Date</th>
              <th className="px-4 py-3 text-left text-xs font-medium text-neutral-500 uppercase">Service</th>
              <th className="px-4 py-3 text-left text-xs font-medium text-neutral-500 uppercase">Students</th>
              <th className="px-4 py-3 text-left text-xs font-medium text-neutral-500 uppercase">Revenue</th>
              <th className="px-4 py-3 text-left text-xs font-medium text-neutral-500 uppercase">Tutor Pay</th>
              <th className="px-4 py-3 text-left text-xs font-medium text-neutral-500 uppercase">Loss</th>
            </tr>
          </thead>
          <tbody className="bg-white divide-y divide-neutral-200">
            {data.map((row, idx) => (
              <tr key={idx} className="hover:bg-neutral-50">
                <td className="px-4 py-3 text-sm text-neutral-900">{formatDate(row.start)}</td>
                <td className="px-4 py-3 text-sm text-neutral-600">{row.service_name}</td>
                <td className="px-4 py-3 text-sm text-neutral-900">{row.student_count}</td>
                <td className="px-4 py-3 text-sm text-neutral-600">{formatCurrency(row.revenue)}</td>
                <td className="px-4 py-3 text-sm text-neutral-600">{formatCurrency(row.tutor_pay)}</td>
                <td className="px-4 py-3 text-sm text-red-600 font-medium">{formatCurrency(row.loss_amount)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      );
    }

    if (['psTrials', 'psLeads', 'summerCampRegistration', 'totalSummerCampRegistrations'].includes(metricKey)) {
      return (
        <table className="min-w-full divide-y divide-neutral-200">
          <thead className="bg-neutral-50">
            <tr>
              <th className="px-4 py-3 text-left text-xs font-medium text-neutral-500 uppercase">Date</th>
              <th className="px-4 py-3 text-left text-xs font-medium text-neutral-500 uppercase">Name</th>
              <th className="px-4 py-3 text-left text-xs font-medium text-neutral-500 uppercase">Email</th>
              <th className="px-4 py-3 text-left text-xs font-medium text-neutral-500 uppercase">Type</th>
              <th className="px-4 py-3 text-left text-xs font-medium text-neutral-500 uppercase">Price</th>
            </tr>
          </thead>
          <tbody className="bg-white divide-y divide-neutral-200">
            {data.map((row, idx) => (
              <tr key={idx} className="hover:bg-neutral-50">
                <td className="px-4 py-3 text-sm text-neutral-900">{formatDate(row.created_at)}</td>
                <td className="px-4 py-3 text-sm text-neutral-900">{row.parent_first} {row.parent_last}</td>
                <td className="px-4 py-3 text-sm text-neutral-600">{row.email || '-'}</td>
                <td className="px-4 py-3 text-sm text-neutral-600">{row.booking_type}</td>
                <td className="px-4 py-3 text-sm text-neutral-900">{formatCurrency(row.actual_price)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      );
    }

    if (metricKey === 'events') {
      return (
        <table className="min-w-full divide-y divide-neutral-200">
          <thead className="bg-neutral-50">
            <tr>
              <th className="px-4 py-3 text-left text-xs font-medium text-neutral-500 uppercase">Date</th>
              <th className="px-4 py-3 text-left text-xs font-medium text-neutral-500 uppercase">Type</th>
              <th className="px-4 py-3 text-left text-xs font-medium text-neutral-500 uppercase">Name</th>
              <th className="px-4 py-3 text-left text-xs font-medium text-neutral-500 uppercase">Email</th>
              <th className="px-4 py-3 text-left text-xs font-medium text-neutral-500 uppercase">Event Date</th>
            </tr>
          </thead>
          <tbody className="bg-white divide-y divide-neutral-200">
            {data.map((row, idx) => (
              <tr key={idx} className="hover:bg-neutral-50">
                <td className="px-4 py-3 text-sm text-neutral-900">{formatDate(row.created_at)}</td>
                <td className="px-4 py-3 text-sm text-neutral-600">{row.event_type}</td>
                <td className="px-4 py-3 text-sm text-neutral-900">{row.name}</td>
                <td className="px-4 py-3 text-sm text-neutral-600">{row.email || '-'}</td>
                <td className="px-4 py-3 text-sm text-neutral-600">{row.event_date || '-'}</td>
              </tr>
            ))}
          </tbody>
        </table>
      );
    }

    if (metricKey === 'psClassPackBought') {
      return (
        <table className="min-w-full divide-y divide-neutral-200">
          <thead className="bg-neutral-50">
            <tr>
              <th className="px-4 py-3 text-left text-xs font-medium text-neutral-500 uppercase">Date Paid</th>
              <th className="px-4 py-3 text-left text-xs font-medium text-neutral-500 uppercase">Name</th>
              <th className="px-4 py-3 text-left text-xs font-medium text-neutral-500 uppercase">Description</th>
              <th className="px-4 py-3 text-left text-xs font-medium text-neutral-500 uppercase">Amount</th>
            </tr>
          </thead>
          <tbody className="bg-white divide-y divide-neutral-200">
            {data.map((row, idx) => (
              <tr key={idx} className="hover:bg-neutral-50">
                <td className="px-4 py-3 text-sm text-neutral-900">{formatDate(row.date_paid)}</td>
                <td className="px-4 py-3 text-sm text-neutral-900">{row.first_name} {row.last_name}</td>
                <td className="px-4 py-3 text-sm text-neutral-600 max-w-xs truncate">{row.description}</td>
                <td className="px-4 py-3 text-sm text-neutral-900">{formatCurrency(row.amount)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      );
    }

    // Default table for unknown metrics
    return (
      <pre className="text-xs bg-neutral-50 p-4 rounded overflow-auto">
        {JSON.stringify(data, null, 2)}
      </pre>
    );
  };

  // Metric cards configuration
  const metricCards = [
    {
      key: 'psTotalStudents',
      label: 'PS Total Students',
      icon: UserGroupIcon,
      color: 'purple',
      bgColor: 'bg-purple-50',
      textColor: 'text-purple-700',
      iconColor: 'text-purple-600',
    },
    {
      key: 'psCampKids',
      label: 'PS Camp Kids',
      icon: SunIcon,
      color: 'amber',
      bgColor: 'bg-amber-50',
      textColor: 'text-amber-700',
      iconColor: 'text-amber-600',
    },
    {
      key: 'psClassKids',
      label: 'PS Class Kids',
      icon: AcademicCapIcon,
      color: 'blue',
      bgColor: 'bg-blue-50',
      textColor: 'text-blue-700',
      iconColor: 'text-blue-600',
    },
    {
      key: 'psClasses',
      label: 'PS Classes',
      icon: CalendarDaysIcon,
      color: 'green',
      bgColor: 'bg-green-50',
      textColor: 'text-green-700',
      iconColor: 'text-green-600',
    },
    {
      key: 'psClassesOperateLoss',
      label: 'PS Classes Operate Loss',
      icon: ExclamationTriangleIcon,
      color: 'red',
      bgColor: 'bg-red-50',
      textColor: 'text-red-700',
      iconColor: 'text-red-600',
    },
    {
      key: 'psTrials',
      label: 'PS Trials',
      icon: ClipboardDocumentCheckIcon,
      color: 'cyan',
      bgColor: 'bg-cyan-50',
      textColor: 'text-cyan-700',
      iconColor: 'text-cyan-600',
    },
    {
      key: 'events',
      label: 'Events',
      icon: CalendarIcon,
      color: 'indigo',
      bgColor: 'bg-indigo-50',
      textColor: 'text-indigo-700',
      iconColor: 'text-indigo-600',
    },
    {
      key: 'psClassPackBought',
      label: 'PS Class Pack Bought',
      icon: CreditCardIcon,
      color: 'emerald',
      bgColor: 'bg-emerald-50',
      textColor: 'text-emerald-700',
      iconColor: 'text-emerald-600',
    },
    {
      key: 'psLeads',
      label: 'PS Leads',
      icon: UserPlusIcon,
      color: 'orange',
      bgColor: 'bg-orange-50',
      textColor: 'text-orange-700',
      iconColor: 'text-orange-600',
    },
    {
      key: 'summerCampRegistration',
      label: 'Summer Camp Registration',
      icon: SunIcon,
      color: 'yellow',
      bgColor: 'bg-yellow-50',
      textColor: 'text-yellow-700',
      iconColor: 'text-yellow-600',
    },
    {
      key: 'totalSummerCampRegistrations',
      label: 'Total Summer Camp Registrations',
      icon: SunIcon,
      color: 'rose',
      bgColor: 'bg-rose-50',
      textColor: 'text-rose-700',
      iconColor: 'text-rose-600',
    },
  ];

  return (
    <div className="space-y-6">
      {/* Header with Period Selector */}
      <div className="bg-white rounded-xl shadow-sm border border-neutral-200 p-6">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div>
            <h2 className="text-xl font-semibold text-neutral-900">Club Analytics</h2>
            <p className="text-sm text-neutral-500 mt-1">Key performance metrics for Park Slope</p>
          </div>

          {/* Period Selector */}
          <div className="flex items-center gap-3">
            {/* View Mode Toggle */}
            <div className="inline-flex rounded-lg border border-neutral-200 p-1 bg-neutral-50">
              <button
                onClick={() => setViewMode('week')}
                className={`px-3 py-1.5 text-sm font-medium rounded-md transition-colors ${
                  viewMode === 'week'
                    ? 'bg-white shadow-sm text-brand-purple'
                    : 'text-neutral-600 hover:text-neutral-900'
                }`}
              >
                Week
              </button>
              <button
                onClick={() => setViewMode('month')}
                className={`px-3 py-1.5 text-sm font-medium rounded-md transition-colors ${
                  viewMode === 'month'
                    ? 'bg-white shadow-sm text-brand-purple'
                    : 'text-neutral-600 hover:text-neutral-900'
                }`}
              >
                Month
              </button>
            </div>

            {/* Period Navigation */}
            <div className="flex items-center gap-2">
              <button
                onClick={() => navigatePeriod('prev')}
                className="p-2 hover:bg-neutral-100 rounded-lg transition-colors"
                title={`Previous ${viewMode}`}
              >
                <ChevronLeftIcon className="h-5 w-5 text-neutral-600" />
              </button>

              <div className="min-w-[180px] text-center">
                <span className="text-sm font-medium text-neutral-900">{getPeriodLabel()}</span>
              </div>

              <button
                onClick={() => navigatePeriod('next')}
                className="p-2 hover:bg-neutral-100 rounded-lg transition-colors"
                title={`Next ${viewMode}`}
                disabled={isCurrentPeriod()}
              >
                <ChevronRightIcon className={`h-5 w-5 ${isCurrentPeriod() ? 'text-neutral-300' : 'text-neutral-600'}`} />
              </button>
            </div>

            {/* Today Button */}
            {!isCurrentPeriod() && (
              <button
                onClick={goToCurrentPeriod}
                className="px-3 py-1.5 text-sm font-medium text-brand-purple hover:bg-purple-50 rounded-lg transition-colors"
              >
                Today
              </button>
            )}
          </div>
        </div>
      </div>

      {/* Period Summary */}
      {analyticsData && (
        <div className="bg-gradient-to-r from-brand-purple to-brand-navy rounded-xl shadow-sm p-6 text-white">
          <h3 className="text-lg font-semibold mb-2">Period Summary</h3>
          <p className="text-sm text-white/80">
            {viewMode === 'week' ? 'Weekly' : 'Monthly'} snapshot for {getPeriodLabel()}
          </p>
          <div className="mt-4 grid grid-cols-2 md:grid-cols-4 gap-4">
            <div className="bg-white/10 rounded-lg p-3">
              <p className="text-xs text-white/70">Total Students</p>
              <p className="text-xl font-bold">{analyticsData.metrics?.psTotalStudents ?? 0}</p>
            </div>
            <div className="bg-white/10 rounded-lg p-3">
              <p className="text-xs text-white/70">Classes Run</p>
              <p className="text-xl font-bold">{analyticsData.metrics?.psClasses ?? 0}</p>
            </div>
            <div className="bg-white/10 rounded-lg p-3">
              <p className="text-xs text-white/70">New Leads</p>
              <p className="text-xl font-bold">{analyticsData.metrics?.psLeads ?? 0}</p>
            </div>
            <div className="bg-white/10 rounded-lg p-3">
              <p className="text-xs text-white/70">Trials</p>
              <p className="text-xl font-bold">{analyticsData.metrics?.psTrials ?? 0}</p>
            </div>
          </div>
        </div>
      )}

      {/* Metrics List */}
      <div className="bg-white rounded-xl shadow-sm border border-neutral-200 p-6">
        <h3 className="text-lg font-semibold text-neutral-900 mb-4">Detailed Metrics</h3>
        <p className="text-sm text-neutral-500 mb-4">Click any metric to see the underlying data</p>
        {loading ? (
          <div className="flex items-center justify-center py-12">
            <div className="text-neutral-500">Loading analytics data...</div>
          </div>
        ) : analyticsData ? (
          <div className="flex flex-col gap-3">
            {metricCards.map((card) => {
              const Icon = card.icon;
              const value = analyticsData.metrics?.[card.key] ?? 0;

              return (
                <button
                  key={card.key}
                  onClick={() => fetchDrilldownData(card.key, card.label)}
                  className={`${card.bgColor} rounded-lg p-4 transition-all hover:shadow-md hover:scale-[1.01] flex items-center justify-between cursor-pointer text-left w-full`}
                >
                  <div className="flex items-center gap-3">
                    <Icon className={`h-5 w-5 ${card.iconColor}`} />
                    <span className="text-sm font-medium text-neutral-700">{card.label}</span>
                  </div>
                  <div className="flex items-center gap-2">
                    <p className={`text-2xl font-bold ${card.textColor}`}>{value}</p>
                    <ChevronRightIcon className="h-5 w-5 text-neutral-400" />
                  </div>
                </button>
              );
            })}
          </div>
        ) : (
          <div className="text-center py-12 text-neutral-500">
            <CalendarDaysIcon className="h-12 w-12 mx-auto mb-4 text-neutral-300" />
            <p className="text-sm">No analytics data available</p>
          </div>
        )}
      </div>

      {/* Drill-down Modal */}
      {drilldownOpen && (
        <div className="fixed inset-0 z-50 overflow-y-auto">
          <div className="flex min-h-full items-end justify-center p-4 text-center sm:items-center sm:p-0">
            <div className="fixed inset-0 bg-neutral-500 bg-opacity-75 transition-opacity" onClick={closeDrilldown} />

            <div className="relative transform overflow-hidden rounded-lg bg-white text-left shadow-xl transition-all sm:my-8 sm:w-full sm:max-w-4xl">
              {/* Modal Header */}
              <div className="bg-gradient-to-r from-brand-purple to-brand-navy px-6 py-4 flex items-center justify-between">
                <div>
                  <h3 className="text-lg font-semibold text-white">
                    {selectedMetric?.label || 'Details'}
                  </h3>
                  <p className="text-sm text-white/70">{getPeriodLabel()}</p>
                </div>
                <button
                  onClick={closeDrilldown}
                  className="text-white/80 hover:text-white transition-colors"
                >
                  <XMarkIcon className="h-6 w-6" />
                </button>
              </div>

              {/* Modal Body */}
              <div className="px-6 py-4 max-h-[60vh] overflow-y-auto">
                {drilldownLoading ? (
                  <div className="flex items-center justify-center py-12">
                    <div className="text-neutral-500">Loading details...</div>
                  </div>
                ) : drilldownData?.error ? (
                  <div className="text-center py-12 text-red-500">
                    <p>Error: {drilldownData.error}</p>
                  </div>
                ) : drilldownData?.data?.length === 0 ? (
                  <div className="text-center py-12 text-neutral-500">
                    <p>No records found for this period</p>
                  </div>
                ) : (
                  <div className="overflow-x-auto">
                    {renderDrilldownTable()}
                  </div>
                )}
              </div>

              {/* Modal Footer */}
              <div className="bg-neutral-50 px-6 py-3 flex justify-between items-center">
                <span className="text-sm text-neutral-500">
                  {drilldownData?.count ?? 0} records found
                </span>
                <button
                  onClick={closeDrilldown}
                  className="px-4 py-2 text-sm font-medium text-neutral-700 bg-white border border-neutral-300 rounded-md hover:bg-neutral-50 transition-colors"
                >
                  Close
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
