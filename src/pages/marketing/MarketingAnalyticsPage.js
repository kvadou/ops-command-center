import React, { useState } from 'react';
import BookingFormAnalytics from '../../components/BookingFormAnalytics';
import LearningLoopDashboard from '../../components/marketing/LearningLoopDashboard';
import { ChartBarIcon, AcademicCapIcon } from '@heroicons/react/24/outline';

/**
 * MarketingAnalyticsPage - Analytics page within Marketing Hub
 *
 * Provides tabbed access to:
 * 1. Performance Analytics - BookingFormAnalytics with realized revenue, AROAS, drilldowns
 * 2. AI Learning - Learning Loop Dashboard for AI-driven marketing insights
 */
export default function MarketingAnalyticsPage() {
  const [activeTab, setActiveTab] = useState('performance');

  const tabs = [
    { id: 'performance', label: 'Performance', icon: ChartBarIcon },
    { id: 'learning', label: 'AI Learning', icon: AcademicCapIcon }
  ];

  return (
    <>
      {/* Tab Navigation */}
      <div className="border-b border-neutral-200 mb-6">
        <nav className="-mb-px flex space-x-8" role="tablist" aria-label="Analytics Tabs">
          {tabs.map((tab) => {
            const Icon = tab.icon;
            const isActive = activeTab === tab.id;
            return (
              <button
                key={tab.id}
                id={`${tab.id}-tab`}
                role="tab"
                aria-selected={isActive}
                aria-controls={`${tab.id}-panel`}
                onClick={() => setActiveTab(tab.id)}
                className={`
                  group inline-flex items-center py-4 px-1 border-b-2 font-medium text-sm
                  ${isActive
                    ? 'border-brand-purple text-brand-purple'
                    : 'border-transparent text-neutral-500 hover:text-neutral-700 hover:border-neutral-300'
                  }
                  transition-colors duration-200
                `}
              >
                <Icon
                  className={`
                    -ml-0.5 mr-2 h-5 w-5
                    ${isActive ? 'text-brand-purple' : 'text-neutral-400 group-hover:text-neutral-500'}
                  `}
                />
                {tab.label}
              </button>
            );
          })}
        </nav>
      </div>

      {/* Tab Content */}
      {activeTab === 'performance' && (
        <div
          id="performance-panel"
          role="tabpanel"
          aria-labelledby="performance-tab"
          className="-mx-4 sm:-mx-6 lg:-mx-8"
        >
          <BookingFormAnalytics />
        </div>
      )}

      {activeTab === 'learning' && (
        <div
          id="learning-panel"
          role="tabpanel"
          aria-labelledby="learning-tab"
          className="-mx-4 sm:-mx-6 lg:-mx-8"
        >
          <LearningLoopDashboard />
        </div>
      )}
    </>
  );
}
