import React from 'react';
import { formatCurrency } from '../../utils/formatters';

/**
 * Total Business Overview Component
 * Displays aggregate metrics across all segments with 3-period comparison
 * YoY shown inline below each value when enabled
 */
const TotalBusinessOverview = ({ totalBusinessMetrics, periodLabels, reportType, onMetricClick, includeYoY = false, daysInPeriod }) => {
  if (!totalBusinessMetrics) return null;

  const { current, previous, twoPeriodsAgo, yoyCurrent, yoyPrevious, yoyTwoPeriodsAgo } = totalBusinessMetrics;
  if (!current) return null;


  const formatNumber = (value) => {
    if (value === null || value === undefined) return '0';
    return new Intl.NumberFormat('en-US').format(Math.round(value));
  };

  const formatPercent = (value) => {
    if (value === null || value === undefined) return '0%';
    return `${value.toFixed(1)}%`;
  };

  const formatValue = (value, format) => {
    if (value === undefined || value === null) return '-';
    if (format === 'currency') return formatCurrency(value);
    if (format === 'percent') return formatPercent(value);
    return formatNumber(value);
  };

  const flowMetrics = new Set(['totalRevenue', 'totalTutorPay', 'totalProfit', 'totalAdhocPay']);
  const shouldNormalize = (reportType === 'monthly' || reportType === 'quarterly') && daysInPeriod;

  const calculateDelta = (curr, prev, metricKey = null, currDays = null, prevDays = null) => {
    if (!prev || prev === 0) return curr > 0 ? 100 : 0;
    if (shouldNormalize && metricKey && flowMetrics.has(metricKey) && currDays && prevDays) {
      const currDaily = curr / currDays;
      const prevDaily = prev / prevDays;
      if (prevDaily === 0) return currDaily > 0 ? 100 : 0;
      return ((currDaily - prevDaily) / prevDaily) * 100;
    }
    return ((curr - prev) / prev) * 100;
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

  const formatDeltaPercent = (value) => {
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

  // Define metrics based on report type
  // Weekly/monthly show tutor hour tiers and consistency bonus; quarterly/annual do not
  const baseMetrics = [
    { key: 'totalRevenue', label: 'Total Revenue', format: 'currency' },
    { key: 'totalTutorPay', label: 'Total Tutor Pay', format: 'currency', showMargin: true },
    { key: 'activeTutors', label: 'Active Tutors', format: 'number', divider: true },
  ];

  const metrics = reportType === 'weekly' ? [
    ...baseMetrics,
    { key: 'tutors10Plus', label: 'Tutors 10+ Hours', format: 'number' },
    { key: 'pctTutors10Plus', label: '% Tutors 10+ Hours', format: 'percent' },
    { key: 'uniqueStudents', label: 'Active Students', format: 'number' }
  ] : reportType === 'monthly' ? [
    ...baseMetrics,
    { key: 'tutors40_60', label: 'Tutors 40-59.99 hours', format: 'number' },
    { key: 'tutors60_80', label: 'Tutors 60-79.99 hours', format: 'number' },
    { key: 'tutors80Plus', label: 'Tutors 80+ hours', format: 'number' },
    { key: 'tutorsBonusTotal', label: 'Total Consistency Bonus', format: 'number' },
    { key: 'pctConsistencyBonus', label: '% Consistency Bonus', format: 'percent' },
    { key: 'uniqueStudents', label: 'Active Students', format: 'number' }
  ] : [
    ...baseMetrics,
    { key: 'uniqueStudents', label: 'Active Students', format: 'number' }
  ];

  return (
    <div className="bg-white rounded-xl shadow-sm border-2 border-purple-500 overflow-hidden mb-6">
      {/* Header with purple gradient */}
      <div className="bg-gradient-to-r from-purple-600 to-purple-800 px-6 py-4">
        <h2 className="text-lg font-bold text-white flex items-center gap-2">
          <span className="text-xl">📊</span>
          Total Tutoring Business Overview
          {includeYoY && <span className="text-sm font-normal text-purple-200 ml-2">(with YoY)</span>}
        </h2>
      </div>

      {/* Table */}
      <div className="overflow-x-auto">
        <table className="w-full">
          <thead>
            <tr className="bg-neutral-50 border-b border-neutral-200">
              <th className="px-4 py-3 text-left text-xs font-semibold text-neutral-500 uppercase tracking-wider w-1/4">
                Metric
              </th>
              <th className="px-4 py-3 text-center text-xs font-semibold text-neutral-500 uppercase tracking-wider">
                {periodLabels.twoAgo || '2 Periods Ago'}
              </th>
              <th className="px-4 py-3 text-center text-xs font-semibold text-neutral-500 uppercase tracking-wider">
                {periodLabels.previous || 'Previous'}
              </th>
              <th className="px-4 py-3 text-center text-xs font-semibold text-purple-600 uppercase tracking-wider bg-purple-50">
                {periodLabels.current || 'Current'} ★
              </th>
              <th className="px-4 py-3 text-center text-xs font-semibold text-neutral-500 uppercase tracking-wider">
                Change
                {shouldNormalize && <div className="text-[10px] font-normal normal-case tracking-normal text-neutral-400">(daily avg)</div>}
              </th>
            </tr>
          </thead>
          <tbody className="divide-y divide-neutral-100">
            {metrics.map((metric, index) => {
              const currentValue = current[metric.key];
              const previousValue = previous ? previous[metric.key] : undefined;
              const twoAgoValue = twoPeriodsAgo ? twoPeriodsAgo[metric.key] : undefined;
              const delta = calculateDelta(currentValue, previousValue, metric.key, daysInPeriod?.current, daysInPeriod?.previous);

              // Calculate YoY deltas for each period
              const yoyCurrentValue = yoyCurrent ? yoyCurrent[metric.key] : undefined;
              const yoyPreviousValue = yoyPrevious ? yoyPrevious[metric.key] : undefined;
              const yoyTwoAgoValue = yoyTwoPeriodsAgo ? yoyTwoPeriodsAgo[metric.key] : undefined;

              const yoyCurrentDelta = includeYoY && yoyCurrentValue !== undefined ? calculateDelta(currentValue, yoyCurrentValue) : null;
              const yoyPreviousDelta = includeYoY && yoyPreviousValue !== undefined ? calculateDelta(previousValue, yoyPreviousValue) : null;
              const yoyTwoAgoDelta = includeYoY && yoyTwoAgoValue !== undefined ? calculateDelta(twoAgoValue, yoyTwoAgoValue) : null;

              return (
                <React.Fragment key={metric.key}>
                  {metric.divider && index > 0 && (
                    <tr>
                      <td colSpan={5} className="py-1">
                        <div className="border-t border-neutral-200"></div>
                      </td>
                    </tr>
                  )}
                  <tr className="hover:bg-neutral-50">
                    <td className="px-4 py-3 text-sm font-medium text-neutral-700">
                      {metric.label}
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
                    <td className="px-4 py-3 text-center bg-purple-50">
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
                      {metric.showMargin && current.marginPct !== undefined && (
                        <div className="text-xs text-neutral-500 mt-0.5">
                          (Margin: {current.marginPct.toFixed(1)}%)
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
                    {/* Change vs Previous */}
                    <td className={`px-4 py-3 text-center text-sm font-medium ${getDeltaColor(delta)}`}>
                      {getDeltaArrow(delta)} {formatDeltaPercent(delta)}
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

export default TotalBusinessOverview;
