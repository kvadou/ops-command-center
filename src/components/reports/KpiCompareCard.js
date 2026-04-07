import React from 'react';

/**
 * Reusable KPI Comparison Card Component
 * Displays Current, Previous, and Two Periods Ago with deltas and momentum
 */
const KpiCompareCard = ({ 
  kpiName, 
  kpiKey, 
  multiPeriodData, 
  reportType,
  formatValue 
}) => {
  if (!multiPeriodData) return null;

  const { currentPeriod, previousPeriod, twoPeriodsAgo, deltas, momentum } = multiPeriodData;
  
  const periodLabels = reportType === 'weekly' 
    ? { current: 'CW', previous: 'PW', twoAgo: '2W' }
    : { current: 'CM', previous: 'PM', twoAgo: '2M' };
  
  const current = currentPeriod.totals[kpiKey] || 0;
  const previous = previousPeriod.totals[kpiKey] || 0;
  const twoAgo = twoPeriodsAgo.totals[kpiKey] || 0;
  
  const deltaVsPrev = deltas[kpiKey]?.vsPrevious || 0;
  const deltaVsTwoAgo = deltas[kpiKey]?.vsTwoPeriodsAgo || 0;
  const momentumScore = momentum[kpiKey] || 0;
  
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
  
  const getMomentumText = (score) => {
    if (score >= 2) return '↑↑ (improving both periods)';
    if (score === 1) return '↑ (improving vs previous)';
    if (score === -1) return '↓ (down vs previous)';
    if (score <= -2) return '↓↓ (declining both periods)';
    return '→ (mixed)';
  };
  
  const getMomentumColor = (score) => {
    if (score >= 1) return 'text-green-600';
    if (score <= -1) return 'text-red-600';
    return 'text-neutral-500';
  };
  
  const formatPercent = (value) => {
    const sign = value >= 0 ? '+' : '';
    return `${sign}${value.toFixed(1)}%`;
  };

  return (
    <div className="bg-white rounded-lg border border-neutral-200 p-6 shadow-sm hover:shadow-md transition-shadow">
      <div className="flex justify-between items-start mb-4">
        <h3 className="text-lg font-semibold text-neutral-900">{kpiName}</h3>
        <div className={`text-xs font-medium ${getMomentumColor(momentumScore)}`}>
          {getMomentumText(momentumScore)}
        </div>
      </div>
      
      <div className="grid grid-cols-3 gap-4">
        {/* Two Periods Ago (left - oldest) */}
        <div className="text-center">
          <div className="text-xs font-semibold text-neutral-500 uppercase mb-2">
            {periodLabels.twoAgo}
          </div>
          <div className="text-2xl font-bold text-neutral-900 mb-1">
            {formatValue(twoAgo)}
          </div>
          <div className="text-xs font-medium text-neutral-400 mb-0.5">
            vs CW:
          </div>
          <div className={`text-sm font-semibold ${getDeltaColor(deltaVsTwoAgo)}`}>
            {getDeltaArrow(deltaVsTwoAgo)} {formatPercent(deltaVsTwoAgo)}
          </div>
        </div>
        
        {/* Previous Period (middle) */}
        <div className="text-center">
          <div className="text-xs font-semibold text-neutral-500 uppercase mb-2">
            {periodLabels.previous}
          </div>
          <div className="text-2xl font-bold text-neutral-900 mb-1">
            {formatValue(previous)}
          </div>
          <div className="text-xs font-medium text-neutral-400 mb-0.5">
            vs CW:
          </div>
          <div className={`text-sm font-semibold ${getDeltaColor(deltaVsPrev)}`}>
            {getDeltaArrow(deltaVsPrev)} {formatPercent(deltaVsPrev)}
          </div>
        </div>
        
        {/* Current Period (right - newest) */}
        <div className="text-center">
          <div className="text-xs font-semibold text-neutral-500 uppercase mb-2">
            {periodLabels.current}
          </div>
          <div className="text-2xl font-bold text-neutral-900">
            {formatValue(current)}
          </div>
        </div>
      </div>
    </div>
  );
};

export default KpiCompareCard;

