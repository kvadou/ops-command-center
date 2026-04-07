import React, { useState, useEffect, useCallback } from 'react';
import axios from 'axios';
import { DateTime } from 'luxon';
import SegmentCard from './SegmentCard';
import SummaryGenerator from './SummaryGenerator';
import TotalBusinessOverview from './TotalBusinessOverview';

/**
 * Enhanced Report Preview Component
 * Displays weekly or monthly report with segment-first layout and actual date ranges
 */
const ReportPreview = ({ reportType = 'weekly', weekOffset = 0, monthOffset = 0 }) => {
  const [loading, setLoading] = useState(true);
  const [multiPeriodData, setMultiPeriodData] = useState(null);
  const [error, setError] = useState(null);

  // Format date range for display
  const formatDateRange = useCallback((startDate, endDate, type) => {
    if (!startDate || !endDate) return '';
    const start = DateTime.fromISO(startDate);
    const end = DateTime.fromISO(endDate);

    if (type === 'monthly') {
      return start.toFormat('MMMM yyyy');
    }

    // Weekly format: "Jan 6-12" or "Dec 30 - Jan 5"
    if (start.month === end.month) {
      return `${start.toFormat('MMM d')}-${end.toFormat('d')}`;
    }
    return `${start.toFormat('MMM d')} - ${end.toFormat('MMM d')}`;
  }, []);

  useEffect(() => {
    const fetchData = async () => {
      setLoading(true);
      setError(null);
      try {
        const params = reportType === 'weekly'
          ? { weekOffset }
          : { monthOffset };

        const response = await axios.get(`/api/reports/multi-period/${reportType}`, {
          params,
          withCredentials: true
        });
        setMultiPeriodData(response.data);
      } catch (err) {
        console.error('Error fetching report data:', err);
        setError(err.response?.data?.error || err.message || 'Failed to load report data');
      } finally {
        setLoading(false);
      }
    };

    fetchData();
  }, [reportType, weekOffset, monthOffset]);

  if (loading) {
    return (
      <div className="flex items-center justify-center py-12">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-purple-600"></div>
        <span className="ml-4 text-neutral-600">Loading report data...</span>
      </div>
    );
  }

  if (error) {
    return (
      <div className="bg-red-50 border border-red-200 rounded-lg p-4">
        <p className="text-red-800">Error: {error}</p>
      </div>
    );
  }

  if (!multiPeriodData) {
    return (
      <div className="bg-neutral-50 border border-neutral-200 rounded-lg p-4">
        <p className="text-neutral-600">No data available</p>
      </div>
    );
  }

  const { currentPeriod, previousPeriod, twoPeriodsAgo } = multiPeriodData;

  // Get period labels for column headers
  const getPeriodLabels = () => {
    return {
      current: currentPeriod?.dateRange
        ? formatDateRange(currentPeriod.dateRange.start, currentPeriod.dateRange.end, reportType)
        : '',
      previous: previousPeriod?.dateRange
        ? formatDateRange(previousPeriod.dateRange.start, previousPeriod.dateRange.end, reportType)
        : '',
      twoAgo: twoPeriodsAgo?.dateRange
        ? formatDateRange(twoPeriodsAgo.dateRange.start, twoPeriodsAgo.dateRange.end, reportType)
        : ''
    };
  };

  const periodLabels = getPeriodLabels();

  // Format period label for header
  const formatPeriodLabel = () => {
    if (!currentPeriod || !currentPeriod.dateRange) return '';

    try {
      const startDate = new Date(currentPeriod.dateRange.start);
      const endDate = new Date(currentPeriod.dateRange.end);

      if (reportType === 'weekly') {
        const startStr = startDate.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
        const endStr = endDate.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
        return `${startStr} - ${endStr}`;
      } else {
        return startDate.toLocaleDateString('en-US', { month: 'long', year: 'numeric' });
      }
    } catch (e) {
      return '';
    }
  };

  const periodLabel = formatPeriodLabel();

  // Define metrics for each segment (matching ExecutiveReports.js)
  const homeMetrics = [
    { key: 'revenue', label: 'Revenue', format: 'currency' },
    { key: 'tutorPay', label: 'Tutor Pay', format: 'currency', showMargin: true },
    { key: 'activeTutors', label: 'Active Tutors', format: 'number' },
    { key: 'activeStudents', label: 'Active Students', format: 'number' },
    { key: 'newLeads', label: 'New Leads', format: 'number', divider: true },
    { key: 'trialLessons', label: 'Trial Lessons', format: 'number' },
    { key: 'firstPaidLessons', label: 'First Paid Lessons', format: 'number' },
    { key: 'thirdLessons', label: '3rd Lessons', format: 'number' },
  ];

  const onlineMetrics = [
    { key: 'revenue', label: 'Revenue', format: 'currency' },
    { key: 'tutorPay', label: 'Tutor Pay', format: 'currency', showMargin: true },
    { key: 'activeTutors', label: 'Active Tutors', format: 'number' },
    { key: 'activeStudents', label: 'Active Students', format: 'number' },
    { key: 'newLeads', label: 'New Leads', format: 'number', divider: true },
    { key: 'trialLessons', label: 'Trial Lessons', format: 'number' },
    { key: 'firstPaidLessons', label: 'First Paid Lessons', format: 'number' },
    { key: 'thirdLessons', label: '3rd Lessons', format: 'number' },
  ];

  const schoolsMetrics = [
    { key: 'revenue', label: 'Revenue', format: 'currency' },
    { key: 'tutorPay', label: 'Tutor Pay', format: 'currency', showMargin: true },
    { key: 'activeTutors', label: 'Active Tutors', format: 'number' },
    { key: 'activeSchools', label: 'Active Schools', format: 'number' },
    { key: 'lessonsCompleted', label: 'Lessons Completed', format: 'number' },
  ];

  const clubMetrics = [
    { key: 'revenue', label: 'Revenue', format: 'currency' },
    { key: 'tutorPay', label: 'Tutor Pay', format: 'currency', showMargin: true },
    { key: 'activeTutors', label: 'Active Tutors', format: 'number' },
    { key: 'lessonsCompleted', label: 'Lessons Completed', format: 'number' },
    { key: 'activeStudents', label: 'Active Students', format: 'number' },
    { key: 'campSessions', label: 'Camp Sessions', format: 'number', divider: true },
    { key: 'campDays', label: 'Camp Days', format: 'number' },
    { key: 'campStudents', label: 'Camp Students', format: 'number' },
    { key: 'newLeads', label: 'New Leads', format: 'number', divider: true },
    { key: 'trialLessons', label: 'Trial Lessons', format: 'number' },
    { key: 'classPackPurchases', label: 'Class Pack Purchases', format: 'number' },
  ];

  return (
    <div className="bg-white rounded-lg shadow-lg overflow-hidden">
      {/* Header */}
      <div className="bg-gradient-to-r from-purple-600 to-purple-800 text-white p-6">
        <h1 className="text-2xl font-bold mb-2">Analytics Dashboard</h1>
        <p className="text-purple-100">
          {reportType === 'weekly' ? 'Weekly' : 'Monthly'} Report - {periodLabel}
        </p>
      </div>

      <div className="p-6">
        {/* Summary */}
        <SummaryGenerator multiPeriodData={multiPeriodData} reportType={reportType} />

        {/* Period Timeline */}
        <div className="bg-white rounded-xl shadow-sm border border-neutral-200 p-6 mb-6">
          <h2 className="text-sm font-semibold text-neutral-600 mb-4">
            {reportType === 'weekly' ? '3-Week' : '3-Month'} Comparison
          </h2>
          <div className="flex items-center justify-center gap-4">
            <div className="text-center px-4 py-2 bg-neutral-50 rounded-lg">
              <div className="text-xs text-neutral-500 mb-1">2 {reportType === 'weekly' ? 'Weeks' : 'Months'} Ago</div>
              <div className="text-sm font-semibold text-neutral-700">{periodLabels.twoAgo}</div>
            </div>
            <div className="text-neutral-400">→</div>
            <div className="text-center px-4 py-2 bg-neutral-50 rounded-lg">
              <div className="text-xs text-neutral-500 mb-1">Previous</div>
              <div className="text-sm font-semibold text-neutral-700">{periodLabels.previous}</div>
            </div>
            <div className="text-neutral-400">→</div>
            <div className="text-center px-4 py-2 bg-purple-50 border-2 border-purple-200 rounded-lg">
              <div className="text-xs text-purple-600 mb-1">Current ★</div>
              <div className="text-sm font-semibold text-purple-700">{periodLabels.current}</div>
            </div>
          </div>
        </div>

        {/* Total Business Overview */}
        {multiPeriodData && multiPeriodData.totalBusinessMetrics && (
          <TotalBusinessOverview
            totalBusinessMetrics={multiPeriodData.totalBusinessMetrics}
            periodLabels={periodLabels}
            reportType={reportType}
          />
        )}

        {/* Business Segments */}
        <div className="space-y-6">
          {/* Home Lessons */}
          <SegmentCard
            title="Home Lessons"
            icon="🏠"
            segment="home"
            reportData={multiPeriodData}
            periodLabels={periodLabels}
            metrics={homeMetrics}
          />

          {/* Online Lessons */}
          <SegmentCard
            title="Online Lessons"
            icon="💻"
            segment="online"
            reportData={multiPeriodData}
            periodLabels={periodLabels}
            metrics={onlineMetrics}
          />

          {/* Schools */}
          <SegmentCard
            title="Schools"
            icon="🏫"
            segment="schools"
            reportData={multiPeriodData}
            periodLabels={periodLabels}
            metrics={schoolsMetrics}
          />

          {/* Club */}
          <SegmentCard
            title="Club"
            icon="♟️"
            segment="club"
            reportData={multiPeriodData}
            periodLabels={periodLabels}
            metrics={clubMetrics}
          />
        </div>
      </div>
    </div>
  );
};

export default ReportPreview;
