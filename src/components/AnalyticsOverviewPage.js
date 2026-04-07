import React from 'react';
import AnalyticsDashboard from './AnalyticsDashboard';

/**
 * AnalyticsOverviewPage - Wrapper for AnalyticsDashboard in Operations Hub theme
 * This provides the same analytics dashboard but within the Operations Hub layout
 */
export default function AnalyticsOverviewPage() {
  return (
      <div className="max-w-7xl mx-auto w-full">
        <div className="bg-white rounded-xl shadow-sm border border-neutral-200 p-6">
          <h1 className="text-2xl font-bold text-neutral-900 mb-6">Overview</h1>
          <AnalyticsDashboard />
        </div>
      </div>
  );
}

