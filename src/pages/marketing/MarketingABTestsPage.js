import React from 'react';
import MarketingABTests from '../../components/marketing/MarketingABTests';

/**
 * MarketingABTestsPage - A/B Tests page within Marketing Hub
 *
 * Wraps the existing MarketingABTests component with the new layout
 */
export default function MarketingABTestsPage() {
  return (
    <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-6 space-y-6">
        {/* Page Header */}
        <div>
          <h1 className="text-2xl font-bold text-neutral-900">A/B Tests</h1>
          <p className="mt-1 text-sm text-neutral-500">
            Run and analyze marketing experiments to optimize campaigns
          </p>
        </div>

        {/* A/B Tests Component */}
        <div className="-mx-4 sm:-mx-6 lg:-mx-8 xl:-mx-12">
          <MarketingABTests />
        </div>
      </div>
  );
}
