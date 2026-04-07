import React from 'react';
import OptimizationTracker from '../../components/marketing/OptimizationTracker';

/**
 * OptimizationResultsPage - Track optimization actions and their results
 *
 * Shows executed actions from the AI Advisor with before/after states
 * and performance tracking over time.
 */
export default function OptimizationResultsPage() {
  return (
    <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-6">
      <OptimizationTracker />
    </div>
  );
}
