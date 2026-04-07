import React, { Suspense } from 'react';
import ForecastDashboard from './ForecastDashboard';

const LoadingFallback = () => (
  <div className="flex items-center justify-center min-h-[400px]">
    <div className="text-center">
      <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-brand-purple mx-auto"></div>
      <p className="mt-4 text-neutral-600">Loading forecast...</p>
    </div>
  </div>
);

export default function ForecastPage() {
  return (
    <div className="max-w-7xl mx-auto w-full">
      <div className="bg-white rounded-xl shadow-sm border border-neutral-200 p-6">
        <h1 className="text-2xl font-bold text-neutral-900 mb-6">Revenue Forecast</h1>
        <Suspense fallback={<LoadingFallback />}>
          <ForecastDashboard />
        </Suspense>
      </div>
    </div>
  );
}
