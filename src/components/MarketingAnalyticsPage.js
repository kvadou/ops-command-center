import React, { useState, useEffect, Suspense } from 'react';
import BookingFormAnalytics from './BookingFormAnalytics';
import { useHeaderActions } from '../contexts/HeaderActionsContext';

const LoadingFallback = () => (
  <div className="flex items-center justify-center min-h-screen">
    <div className="text-center">
      <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-brand-purple mx-auto"></div>
      <p className="mt-4 text-neutral-600">Loading...</p>
    </div>
  </div>
);

export default function MarketingAnalyticsPage() {
  const { actions: headerActions } = useHeaderActions();

  // Style the settings button and position DateRangePicker in header
  useEffect(() => {
    const style = document.createElement('style');
    style.textContent = `
      /* Ensure settings button has 32px padding (minimum 56x56px hit area) */
      .marketing-header-actions button {
        min-width: 56px !important;
        min-height: 56px !important;
        padding: 16px !important;
        display: flex !important;
        align-items: center !important;
        justify-content: center !important;
      }
      
      /* Position DateRangePicker in header center */
      /* The DateRangePicker container needs to be positioned relative to the marketing-analytics-container */
      .marketing-analytics-container {
        position: relative !important;
        overflow: visible !important;
      }
      
      /* Position the DateRangePicker container absolutely within the marketing-analytics-container */
      /* Align it vertically with the header row (Marketing title and config button) */
      /* Account for container padding (p-6 sm:p-8 = 24px/32px) and header row center */
      /* Header is at top (24px padding) + half of header height (~30px) = ~54px from top of container */
      .marketing-analytics-container .marketing-date-range-picker-container {
        position: absolute !important;
        top: 54px !important;
        left: 50% !important;
        transform: translateX(-50%) !important;
        z-index: 10 !important;
        margin: 0 !important;
        padding: 0 !important;
        pointer-events: auto !important;
        width: auto !important;
        height: auto !important;
        visibility: visible !important;
        opacity: 1 !important;
        display: flex !important;
        align-items: center !important;
      }
      
      /* Ensure the header container has relative positioning and enough height */
      .marketing-header-container {
        position: relative !important;
        min-height: 60px !important;
      }
      
      /* Make sure DateRangePicker content is visible and interactive */
      .marketing-date-range-picker-container * {
        pointer-events: auto !important;
      }
      
      /* Ensure the DateRangePicker is visible */
      .marketing-date-range-picker-container,
      .marketing-date-range-picker-container > * {
        visibility: visible !important;
        opacity: 1 !important;
        display: flex !important;
      }
      
      /* On mobile, position it below the header */
      @media (max-width: 1023px) {
        .marketing-analytics-container .marketing-date-range-picker-container {
          position: relative !important;
          top: auto !important;
          left: auto !important;
          transform: none !important;
          margin-top: 1rem !important;
        }
      }
    `;
    document.head.appendChild(style);
    return () => {
      if (document.head.contains(style)) {
        document.head.removeChild(style);
      }
    };
  }, []);

  return (
      <div className="max-w-7xl mx-auto w-full">
        <div className="bg-white rounded-xl shadow-sm border border-neutral-200 p-6 sm:p-8 marketing-analytics-container">
          {/* Responsive 3-part header: Left (Title) | Center (Date Range) | Right (Settings) */}
          {/* Desktop (lg: 1024px+): 3-part horizontal layout with centered date picker */}
          {/* Mobile/Tablet (< 1024px): 2-row layout (title on top, date + settings on bottom) */}
          <div className="marketing-header-container relative flex flex-col lg:flex-row lg:items-center lg:justify-between mb-3 gap-4 lg:gap-0 px-6 sm:px-8">
            {/* Left: Page Title - Pinned to far left */}
            <div className="flex-shrink-0 flex items-center order-1 lg:order-1">
              <h1 className="text-2xl font-bold text-neutral-900">Marketing</h1>
            </div>

            {/* Center: Date Range Picker - Positioned via CSS from BookingFormAnalytics */}
            <div className="flex-1 flex items-center justify-center lg:absolute lg:left-1/2 lg:-translate-x-1/2 z-10 order-3 lg:order-2 pointer-events-none">
              {/* DateRangePicker will be positioned here via CSS */}
            </div>

            {/* Right: Settings Gear Icon - Spacer maintains layout balance when no actions */}
            <div className="flex-shrink-0 lg:flex-1 flex items-center justify-end min-w-0 order-2 lg:order-3">
              {headerActions ? (
                <div className="flex items-center marketing-header-actions">
                  {headerActions}
                </div>
              ) : (
                <div className="w-14 h-14 flex-shrink-0"></div>
              )}
            </div>
          </div>

          <Suspense fallback={<LoadingFallback />}>
            <BookingFormAnalytics />
          </Suspense>
        </div>
      </div>
  );
}

