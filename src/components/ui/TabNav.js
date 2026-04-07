import React from 'react';

/**
 * Tab Navigation component following Acme Operations brand system
 * 
 * @param {Array} tabs - Array of { id, name, icon }
 * @param {string} activeTab
 * @param {function} onTabChange
 * @param {string} className
 */
export default function TabNav({ tabs = [], activeTab, onTabChange, className = '' }) {
  return (
    <div className={`bg-white border-b border-neutral-200 ${className}`}>
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-6 xl:px-8">
        <nav className="flex space-x-8 overflow-x-auto scrollbar-hide" aria-label="Tabs">
          {tabs.map((tab) => {
            const Icon = tab.icon;
            const isActive = activeTab === tab.id;
            
            return (
              <button
                key={tab.id}
                onClick={() => onTabChange(tab.id)}
                className={`
                  py-4 px-1 border-b-2 font-medium text-sm transition-colors whitespace-nowrap
                  flex items-center gap-2
                  ${isActive
                    ? 'border-brand-purple text-brand-purple'
                    : 'border-transparent text-neutral-500 hover:text-neutral-700 hover:border-neutral-300'
                  }
                `}
                aria-current={isActive ? 'page' : undefined}
              >
                {Icon && <Icon className="h-5 w-5" />}
                {tab.name}
              </button>
            );
          })}
        </nav>
      </div>
    </div>
  );
}
