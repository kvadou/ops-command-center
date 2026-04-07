import React from 'react';

/**
 * Auto-generated Summary Component
 * Creates a one-sentence breakdown of performance
 */
const SummaryGenerator = ({ multiPeriodData, reportType }) => {
  if (!multiPeriodData) return null;
  
  const { currentPeriod, previousPeriod, deltas, categoryData } = multiPeriodData;
  const periodLabel = reportType === 'weekly' ? 'week' : 'month';

  // Day-normalization for monthly/quarterly comparisons
  const currentDays = multiPeriodData.currentPeriod?.daysInPeriod;
  const previousDays = multiPeriodData.previousPeriod?.daysInPeriod;
  const shouldNormalize = (reportType === 'monthly' || reportType === 'quarterly') && currentDays && previousDays;
  
  // Get revenue change
  const revenueDelta = deltas.totalRevenue?.vsPrevious || 0;
  const revenueChange = Math.abs(revenueDelta);
  
  // Find biggest category drivers
  const categoryChanges = [];
  if (categoryData) {
    Object.entries(categoryData).forEach(([category, data]) => {
      if (data && data.current && data.previous) {
        const catRevenue = data.current.revenue || 0;
        const prevRevenue = data.previous.revenue || 0;
        if (prevRevenue > 0) {
          let catDelta;
          if (shouldNormalize) {
            const currDaily = catRevenue / currentDays;
            const prevDaily = prevRevenue / previousDays;
            catDelta = prevDaily === 0 ? (currDaily > 0 ? 100 : 0) : ((currDaily - prevDaily) / prevDaily) * 100;
          } else {
            catDelta = ((catRevenue - prevRevenue) / prevRevenue) * 100;
          }
          categoryChanges.push({ category, delta: catDelta, revenue: catRevenue });
        }
      }
    });
  }
  
  // Sort by absolute change
  categoryChanges.sort((a, b) => Math.abs(b.delta) - Math.abs(a.delta));
  
  // Build summary
  const revenueDirection = revenueDelta > 0.5 ? 'increased' : revenueDelta < -0.5 ? 'decreased' : 'held steady';
  const revenueText = revenueChange > 0.5 ? `${revenueDelta > 0 ? '+' : ''}${revenueDelta.toFixed(1)}%` : 'slightly';
  
  let summary = `This ${periodLabel} revenue ${revenueDirection} ${revenueText}`;
  
  // Add category drivers
  if (categoryChanges.length > 0) {
    const drivers = [];
    const decliners = [];
    
    categoryChanges.slice(0, 3).forEach(({ category, delta }) => {
      if (Math.abs(delta) > 5) {
        if (delta < 0) {
          decliners.push(`${category} (${delta > 0 ? '+' : ''}${delta.toFixed(1)}%)`);
        } else {
          drivers.push(`${category} (+${delta.toFixed(1)}%)`);
        }
      }
    });
    
    if (decliners.length > 0 && revenueDelta < 0) {
      summary += ` primarily due to declines in ${decliners.slice(0, 2).join(' and ')}`;
      if (drivers.length > 0) {
        summary += `, while ${drivers[0]} held steady`;
      }
    } else if (drivers.length > 0 && revenueDelta > 0) {
      summary += ` mainly driven by ${drivers.slice(0, 2).join(' and ')}`;
      if (decliners.length > 0) {
        summary += `, while ${decliners[0]} dipped slightly`;
      }
    } else if (Math.abs(revenueDelta) <= 0.5) {
      summary += `, with all categories holding relatively steady`;
    }
  }
  
  // Add profit margin if available
  const margin = currentPeriod.totals.marginPct || 0;
  const prevMargin = previousPeriod.totals.marginPct || 0;
  if (margin > 0) {
    const marginChange = margin - prevMargin;
    if (Math.abs(marginChange) > 0.5) {
      summary += `. Profit margin ${marginChange > 0 ? 'improved' : 'declined'} to ${margin.toFixed(1)}%`;
    } else {
      summary += `. Profit margin was ${margin.toFixed(1)}%`;
    }
  }
  
  return (
    <div className="bg-gradient-to-r from-neutral-50 to-neutral-100 border-l-4 border-purple-600 p-4 rounded-lg mb-6">
      <p className="text-base text-neutral-800 leading-relaxed">
        {summary}.
      </p>
    </div>
  );
};

export default SummaryGenerator;

