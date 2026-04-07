import React from 'react';

/**
 * SegmentCard Component
 * Displays a business segment (Home, Online, Schools, Club) with metrics
 * across three time periods with actual date ranges as column headers
 * YoY shown inline below each value when enabled
 */
const SegmentCard = ({
  title,
  icon,
  segment,
  reportData,
  periodLabels,
  metrics,
  onMetricClick,
  includeYoY = false
}) => {
  if (!reportData) return null;

  const { currentPeriod, previousPeriod, twoPeriodsAgo, categoryData, segmentMetrics } = reportData;

  // Extract days-in-period for normalization of flow metrics (revenue, pay, etc.)
  const currentDays = reportData.currentPeriod?.daysInPeriod;
  const previousDays = reportData.previousPeriod?.daysInPeriod;
  const twoAgoDays = reportData.twoPeriodsAgo?.daysInPeriod;
  const shouldNormalize = !!reportData.dayNormalized;

  // Flow metrics accumulate over time and need day-normalization for fair comparison
  const flowMetrics = new Set(['revenue', 'tutorPay', 'profit', 'adhocPay', 'totalRevenue', 'totalTutorPay', 'totalProfit', 'totalAdhocPay']);

  // Get segment data from segmentMetrics first, then categoryData, then totals
  const getSegmentData = (period, category, periodType) => {
    if (!period) return {};

    // Map segment names to keys
    const segmentKeyMap = {
      home: 'home',
      online: 'online',
      school: 'schools',
      schools: 'schools',
      club: 'club'
    };

    const segmentKey = segmentKeyMap[category] || category;

    // First, try segmentMetrics (new detailed metrics)
    if (segmentMetrics) {
      let segmentData = null;
      if (periodType === 'current' && segmentMetrics.current) {
        segmentData = segmentMetrics.current[segmentKey];
      } else if (periodType === 'previous' && segmentMetrics.previous) {
        segmentData = segmentMetrics.previous[segmentKey];
      } else if (periodType === 'twoAgo' && segmentMetrics.twoPeriodsAgo) {
        segmentData = segmentMetrics.twoPeriodsAgo[segmentKey];
      } else if (periodType === 'yoyCurrent' && segmentMetrics.yoyCurrent) {
        segmentData = segmentMetrics.yoyCurrent[segmentKey];
      } else if (periodType === 'yoyPrevious' && segmentMetrics.yoyPrevious) {
        segmentData = segmentMetrics.yoyPrevious[segmentKey];
      } else if (periodType === 'yoyTwoAgo' && segmentMetrics.yoyTwoPeriodsAgo) {
        segmentData = segmentMetrics.yoyTwoPeriodsAgo[segmentKey];
      }

      if (segmentData) {
        // Merge with categoryData if available for additional metrics
        const categoryName = category.charAt(0).toUpperCase() + category.slice(1);
        let catData = {};
        if (categoryData && categoryData[categoryName]) {
          if (periodType === 'current' && categoryData[categoryName].current) {
            catData = categoryData[categoryName].current;
          } else if (periodType === 'previous' && categoryData[categoryName].previous) {
            catData = categoryData[categoryName].previous;
          } else if (periodType === 'twoAgo' && categoryData[categoryName].twoPeriodsAgo) {
            catData = categoryData[categoryName].twoPeriodsAgo;
          }
        }
        return { ...catData, ...segmentData };
      }
    }

    // Fallback to categoryData
    const categoryName = category.charAt(0).toUpperCase() + category.slice(1);
    if (categoryData && categoryData[categoryName]) {
      const catData = categoryData[categoryName];
      if (periodType === 'current' && catData.current) {
        return catData.current;
      } else if (periodType === 'previous' && catData.previous) {
        return catData.previous;
      } else if (periodType === 'twoAgo' && catData.twoPeriodsAgo) {
        return catData.twoPeriodsAgo;
      }
    }

    // Final fallback to totals
    return period.totals || period.analytics || {};
  };

  const currentData = getSegmentData(currentPeriod, segment, 'current');
  const previousData = getSegmentData(previousPeriod, segment, 'previous');
  const twoAgoData = getSegmentData(twoPeriodsAgo, segment, 'twoAgo');

  // Get YoY data for all three periods
  const yoyCurrentData = includeYoY ? getSegmentData(null, segment, 'yoyCurrent') : null;
  const yoyPreviousData = includeYoY ? getSegmentData(null, segment, 'yoyPrevious') : null;
  const yoyTwoAgoData = includeYoY ? getSegmentData(null, segment, 'yoyTwoAgo') : null;

  const formatValue = (value, format) => {
    if (value === undefined || value === null) return '-';

    if (format === 'currency') {
      return new Intl.NumberFormat('en-US', {
        style: 'currency',
        currency: 'USD',
        minimumFractionDigits: 0,
        maximumFractionDigits: 0,
      }).format(value);
    }

    if (format === 'percent') {
      return `${value.toFixed(1)}%`;
    }

    return new Intl.NumberFormat('en-US').format(Math.round(value));
  };

  const calculateDelta = (current, previous, metricKey, curDays, prevDays) => {
    if (!previous || previous === 0) {
      return current > 0 ? 100 : 0;
    }
    // Normalize flow metrics by daily rate when periods have different lengths
    if (shouldNormalize && metricKey && flowMetrics.has(metricKey) && curDays && prevDays && curDays !== prevDays) {
      const currentDaily = current / curDays;
      const previousDaily = previous / prevDays;
      if (previousDaily === 0) return currentDaily > 0 ? 100 : 0;
      return ((currentDaily - previousDaily) / previousDaily) * 100;
    }
    return ((current - previous) / previous) * 100;
  };

  const getDeltaColor = (delta) => {
    if (delta > 0.5) return 'text-green-600';
    if (delta < -0.5) return 'text-red-600';
    return 'text-neutral-500';
  };

  const getDeltaArrow = (delta) => {
    if (delta > 0.5) return '↑';
    if (delta < -0.5) return '↓';
    return '→';
  };

  const formatPercent = (value) => {
    const sign = value >= 0 ? '+' : '';
    return `${sign}${value.toFixed(1)}%`;
  };

  // Format YoY delta for inline display (compact)
  const formatYoYInline = (delta) => {
    if (delta === null || delta === undefined) return null;
    const sign = delta >= 0 ? '+' : '';
    return `${sign}${delta.toFixed(0)}%`;
  };

  // Format YoY prior year actual value (shown in parentheses)
  const formatYoYActual = (value, format) => {
    if (value === undefined || value === null) return null;
    return formatValue(value, format);
  };

  // Map metric keys to data keys (handle different naming conventions)
  const getMetricValue = (data, key) => {
    // Direct match
    if (data[key] !== undefined) return data[key];

    // Common aliases for backward compatibility
    const aliases = {
      // New names -> old names
      activeStudents: ['studentsTaught', 'students', 'totalStudents', 'uniqueStudents'],
      activeTutors: ['tutors', 'totalTutors'],
      tutorPay: ['pay', 'totalTutorPay'],
      lessonsCompleted: ['classesHeld', 'totalLessons', 'lessonCount'],
      revenue: ['totalRevenue'],
      newLeads: ['leads', 'leadCount'],
      trialLessons: ['trials', 'trialCount', 'totalTrials'],
      firstPaidLessons: ['firstLessons', 'firstLessonCount'],
      thirdLessons: ['thirdLessonCount'],
      activeSchools: ['schoolCount', 'uniqueSchools'],
      campSessions: ['camps', 'campCount'],
      campDays: ['campDaysCount'],
      campStudents: ['campKids', 'campKidsCount'],
      classPackPurchases: ['trialsConverted', 'trialsToClassPack', 'convertedTrials'],
      // Old names -> new names (for backward compatibility)
      studentsTaught: ['activeStudents'],
      leads: ['newLeads'],
      trials: ['trialLessons'],
      firstLessons: ['firstPaidLessons'],
      classesHeld: ['lessonsCompleted'],
      camps: ['campSessions'],
      campKids: ['campStudents'],
      trialsConverted: ['classPackPurchases']
    };

    if (aliases[key]) {
      for (const alias of aliases[key]) {
        if (data[alias] !== undefined) return data[alias];
      }
    }

    return undefined;
  };

  return (
    <div className="bg-white rounded-xl shadow-sm border border-neutral-200 overflow-hidden">
      {/* Header */}
      <div className="bg-neutral-50 border-b border-neutral-200 px-6 py-4">
        <h3 className="text-lg font-semibold text-neutral-900 flex items-center gap-2">
          <span className="text-xl">{icon}</span>
          {title}
          {includeYoY && <span className="text-sm font-normal text-neutral-500 ml-2">(with YoY)</span>}
        </h3>
      </div>

      {/* Metrics Table */}
      <div className="overflow-x-auto">
        <table className="w-full">
          <thead>
            <tr className="bg-neutral-50 border-b border-neutral-200">
              <th className="text-left px-6 py-3 text-xs font-semibold text-neutral-600 uppercase tracking-wider w-1/4">
                Metric
              </th>
              <th className="text-center px-4 py-3 text-xs font-semibold text-neutral-600 uppercase tracking-wider">
                {periodLabels.twoAgo || '2 Periods Ago'}
              </th>
              <th className="text-center px-4 py-3 text-xs font-semibold text-neutral-600 uppercase tracking-wider">
                {periodLabels.previous || 'Previous'}
              </th>
              <th className="text-center px-4 py-3 text-xs font-semibold text-neutral-600 uppercase tracking-wider bg-purple-50">
                {periodLabels.current || 'Current'}
              </th>
              <th className="text-center px-4 py-3 text-xs font-semibold text-neutral-600 uppercase tracking-wider">
                Change
                {shouldNormalize && <div className="text-[10px] font-normal normal-case tracking-normal text-neutral-400">(daily avg)</div>}
              </th>
            </tr>
          </thead>
          <tbody className="divide-y divide-neutral-100">
            {metrics.map((metric, index) => {
              const currentValue = getMetricValue(currentData, metric.key);
              const previousValue = getMetricValue(previousData, metric.key);
              const twoAgoValue = getMetricValue(twoAgoData, metric.key);
              const delta = calculateDelta(currentValue, previousValue, metric.key, currentDays, previousDays);

              // Get YoY values and calculate deltas
              const yoyCurrentValue = yoyCurrentData ? getMetricValue(yoyCurrentData, metric.key) : undefined;
              const yoyPreviousValue = yoyPreviousData ? getMetricValue(yoyPreviousData, metric.key) : undefined;
              const yoyTwoAgoValue = yoyTwoAgoData ? getMetricValue(yoyTwoAgoData, metric.key) : undefined;

              const yoyCurrentDelta = includeYoY && yoyCurrentValue !== undefined ? calculateDelta(currentValue, yoyCurrentValue) : null;
              const yoyPreviousDelta = includeYoY && yoyPreviousValue !== undefined ? calculateDelta(previousValue, yoyPreviousValue) : null;
              const yoyTwoAgoDelta = includeYoY && yoyTwoAgoValue !== undefined ? calculateDelta(twoAgoValue, yoyTwoAgoValue) : null;

              return (
                <React.Fragment key={metric.key}>
                  {metric.divider && (
                    <tr>
                      <td colSpan={5} className="px-6 py-1 bg-neutral-50">
                        <div className="border-t border-neutral-200"></div>
                      </td>
                    </tr>
                  )}
                  <tr className="hover:bg-neutral-50 transition-colors">
                    <td className="px-6 py-3">
                      <span className="text-sm font-medium text-neutral-700">{metric.label}</span>
                    </td>
                    {/* Two Periods Ago */}
                    <td className="px-4 py-3 text-center">
                      <span
                        className={`text-sm ${
                          onMetricClick && twoAgoValue !== undefined && twoAgoValue !== null
                            ? 'text-neutral-600 cursor-pointer hover:text-purple-700 hover:underline'
                            : 'text-neutral-600'
                        }`}
                        onClick={() => {
                          if (onMetricClick && twoAgoValue !== undefined && twoAgoValue !== null) {
                            onMetricClick(metric.key, metric.label, twoAgoValue, 'twoAgo');
                          }
                        }}
                        title={onMetricClick ? 'Click to view details' : undefined}
                      >
                        {formatValue(twoAgoValue, metric.format)}
                      </span>
                      {metric.showMargin && twoAgoData.marginPct !== undefined && (
                        <div className="text-xs text-neutral-400 mt-0.5">
                          ({twoAgoData.marginPct.toFixed(1)}%)
                        </div>
                      )}
                      {includeYoY && yoyTwoAgoDelta !== null && (
                        <div className={`text-xs mt-0.5 ${getDeltaColor(yoyTwoAgoDelta)}`}>
                          YoY: {getDeltaArrow(yoyTwoAgoDelta)} {formatYoYInline(yoyTwoAgoDelta)}
                          {formatYoYActual(yoyTwoAgoValue, metric.format) && (
                            <span className="text-neutral-400 ml-0.5">({formatYoYActual(yoyTwoAgoValue, metric.format)})</span>
                          )}
                        </div>
                      )}
                    </td>
                    {/* Previous */}
                    <td className="px-4 py-3 text-center">
                      <span
                        className={`text-sm ${
                          onMetricClick && previousValue !== undefined && previousValue !== null
                            ? 'text-neutral-600 cursor-pointer hover:text-purple-700 hover:underline'
                            : 'text-neutral-600'
                        }`}
                        onClick={() => {
                          if (onMetricClick && previousValue !== undefined && previousValue !== null) {
                            onMetricClick(metric.key, metric.label, previousValue, 'previous');
                          }
                        }}
                        title={onMetricClick ? 'Click to view details' : undefined}
                      >
                        {formatValue(previousValue, metric.format)}
                      </span>
                      {metric.showMargin && previousData.marginPct !== undefined && (
                        <div className="text-xs text-neutral-400 mt-0.5">
                          ({previousData.marginPct.toFixed(1)}%)
                        </div>
                      )}
                      {includeYoY && yoyPreviousDelta !== null && (
                        <div className={`text-xs mt-0.5 ${getDeltaColor(yoyPreviousDelta)}`}>
                          YoY: {getDeltaArrow(yoyPreviousDelta)} {formatYoYInline(yoyPreviousDelta)}
                          {formatYoYActual(yoyPreviousValue, metric.format) && (
                            <span className="text-neutral-400 ml-0.5">({formatYoYActual(yoyPreviousValue, metric.format)})</span>
                          )}
                        </div>
                      )}
                    </td>
                    {/* Current */}
                    <td className="px-4 py-3 text-center bg-purple-50/50">
                      <span
                        className={`text-sm font-semibold ${
                          onMetricClick && currentValue !== undefined && currentValue !== null
                            ? 'text-purple-700 cursor-pointer hover:text-purple-900 hover:underline'
                            : 'text-neutral-900'
                        }`}
                        onClick={() => {
                          if (onMetricClick && currentValue !== undefined && currentValue !== null) {
                            onMetricClick(metric.key, metric.label, currentValue, 'current');
                          }
                        }}
                        title={onMetricClick ? 'Click to view details' : undefined}
                      >
                        {formatValue(currentValue, metric.format)}
                      </span>
                      {metric.showMargin && currentData.marginPct !== undefined && (
                        <div className="text-xs text-neutral-500 mt-0.5">
                          (Margin: {currentData.marginPct.toFixed(1)}%)
                        </div>
                      )}
                      {includeYoY && yoyCurrentDelta !== null && (
                        <div className={`text-xs mt-0.5 ${getDeltaColor(yoyCurrentDelta)}`}>
                          YoY: {getDeltaArrow(yoyCurrentDelta)} {formatYoYInline(yoyCurrentDelta)}
                          {formatYoYActual(yoyCurrentValue, metric.format) && (
                            <span className="text-neutral-400 ml-0.5">({formatYoYActual(yoyCurrentValue, metric.format)})</span>
                          )}
                        </div>
                      )}
                    </td>
                    {/* Change */}
                    <td className="px-4 py-3 text-center">
                      <span className={`text-sm font-medium ${getDeltaColor(delta)}`}>
                        {getDeltaArrow(delta)} {formatPercent(delta)}
                      </span>
                    </td>
                  </tr>
                </React.Fragment>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
};

export default SegmentCard;
