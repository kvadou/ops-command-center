import React from 'react';
import Sparkline from './Sparkline';
import { formatCurrency } from '../../utils/formatters';

/**
 * Reusable Category Comparison Card Component
 * Displays category metrics with 3-period comparison and sparklines
 */
const CategoryCompareCard = ({
  category,
  categoryData,
  reportType,
  daysInPeriod
}) => {
  if (!categoryData) {
    return (
      <div className="bg-white rounded-lg border border-neutral-200 p-6 shadow-sm">
        <div className="text-lg font-semibold text-neutral-900 mb-4">{category}</div>
        <div className="text-center text-neutral-500 py-8">No data available</div>
      </div>
    );
  }
  
  const periodLabels = reportType === 'weekly' 
    ? { current: 'CW', previous: 'PW', twoAgo: '2W' }
    : { current: 'CM', previous: 'PM', twoAgo: '2M' };
  
  const { current, previous, twoPeriodsAgo } = categoryData;
  
  const flowMetrics = new Set(['revenue', 'profit', 'lessons', 'hours']);
  const shouldNormalize = (reportType === 'monthly' || reportType === 'quarterly') && daysInPeriod;

  const calculateDelta = (curr, prev, metricKey = null) => {
    if (prev === 0) return curr > 0 ? 100 : 0;
    if (shouldNormalize && metricKey && flowMetrics.has(metricKey)) {
      const currDaily = curr / daysInPeriod.current;
      const prevDaily = prev / daysInPeriod.previous;
      if (prevDaily === 0) return currDaily > 0 ? 100 : 0;
      return ((currDaily - prevDaily) / prevDaily) * 100;
    }
    return ((curr - prev) / prev) * 100;
  };
  
  
  const formatNumber = (value) => {
    return new Intl.NumberFormat('en-US').format(Math.round(value));
  };
  
  const formatPercent = (value) => {
    const sign = value >= 0 ? '+' : '';
    return `${sign}${value.toFixed(1)}%`;
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
  
  const revenueDelta = calculateDelta(current.revenue, previous.revenue, 'revenue');
  const profitDelta = calculateDelta(current.profit, previous.profit, 'profit');
  const lessonsDelta = calculateDelta(current.lessons, previous.lessons, 'lessons');
  const hoursDelta = calculateDelta(current.hours, previous.hours, 'hours');
  
  // Prepare sparkline data (3 points)
  const revenueSparkline = [twoPeriodsAgo.revenue, previous.revenue, current.revenue];
  const profitSparkline = [twoPeriodsAgo.profit, previous.profit, current.profit];
  
  return (
    <div className="bg-white rounded-lg border border-neutral-200 p-6 shadow-sm hover:shadow-md transition-shadow">
      <div className="text-lg font-semibold text-neutral-900 mb-4">{category}</div>
      
      <div className="space-y-3">
        {/* Lessons */}
        <div className="flex justify-between items-center">
          <span className="text-sm text-neutral-600">Lessons</span>
          <div className="flex items-center gap-3">
            <span className="text-sm font-semibold text-neutral-900">{formatNumber(current.lessons)}</span>
            <span className={`text-xs font-medium ${getDeltaColor(lessonsDelta)}`}>
              {getDeltaArrow(lessonsDelta)} {formatPercent(lessonsDelta)}
            </span>
          </div>
        </div>
        
        {/* Hours */}
        <div className="flex justify-between items-center">
          <span className="text-sm text-neutral-600">Hours</span>
          <div className="flex items-center gap-3">
            <span className="text-sm font-semibold text-neutral-900">{formatNumber(current.hours)}</span>
            <span className={`text-xs font-medium ${getDeltaColor(hoursDelta)}`}>
              {getDeltaArrow(hoursDelta)} {formatPercent(hoursDelta)}
            </span>
          </div>
        </div>
        
        {/* Revenue */}
        <div className="flex justify-between items-center">
          <span className="text-sm text-neutral-600">Revenue</span>
          <div className="flex items-center gap-3">
            <span className="text-sm font-semibold text-neutral-900">{formatCurrency(current.revenue)}</span>
            <span className={`text-xs font-medium ${getDeltaColor(revenueDelta)}`}>
              {getDeltaArrow(revenueDelta)} {formatPercent(revenueDelta)}
            </span>
          </div>
        </div>
        
        {/* Profit */}
        <div className="flex justify-between items-center">
          <span className="text-sm text-neutral-600">Profit</span>
          <div className="flex items-center gap-3">
            <span className="text-sm font-semibold text-neutral-900">{formatCurrency(current.profit)}</span>
            <span className={`text-xs font-medium ${getDeltaColor(profitDelta)}`}>
              {getDeltaArrow(profitDelta)} {formatPercent(profitDelta)}
            </span>
          </div>
        </div>
      </div>
      
      {/* Sparklines */}
      <div className="mt-4 pt-4 border-t border-neutral-200">
        <div className="flex items-center justify-between mb-2">
          <div className="flex items-center gap-2">
            <Sparkline data={revenueSparkline} color="#7C3AED" />
            <span className="text-xs text-neutral-600">Revenue</span>
          </div>
          <div className="flex items-center gap-2">
            <Sparkline data={profitSparkline} color="#10B981" />
            <span className="text-xs text-neutral-600">Profit</span>
          </div>
        </div>
      </div>
    </div>
  );
};

export default CategoryCompareCard;

