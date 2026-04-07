import { useState, useEffect, useRef } from 'react';
import { ChevronRightIcon } from '@heroicons/react/24/outline';

/**
 * CollapsibleSidebarSection - A collapsible section for the sidebar
 * Premium design with smooth animations and proper color tokens
 */
export default function CollapsibleSidebarSection({
  title,
  icon: Icon,
  children,
  defaultExpanded = false,
  badge = null,
  hasActiveChild = false
}) {
  // Initialize expanded state: true if defaultExpanded is true OR hasActiveChild is true
  const [isExpanded, setIsExpanded] = useState(defaultExpanded || hasActiveChild);
  const prevDefaultExpanded = useRef(defaultExpanded);
  const prevHasActiveChild = useRef(hasActiveChild);
  const isActive = isExpanded || hasActiveChild;

  // Update expanded state when defaultExpanded changes from false to true
  // (e.g., when clicking from collapsed view)
  useEffect(() => {
    if (defaultExpanded && !prevDefaultExpanded.current) {
      setIsExpanded(true);
    }
    prevDefaultExpanded.current = defaultExpanded;
  }, [defaultExpanded]);

  // Keep section expanded if it has an active child (e.g., when on accounting routes)
  // This ensures the section stays open when navigating between accounting pages
  useEffect(() => {
    if (hasActiveChild) {
      setIsExpanded(true);
    }
    prevHasActiveChild.current = hasActiveChild;
  }, [hasActiveChild]);

  return (
    <div className="mb-1">
      <button
        onClick={() => setIsExpanded(!isExpanded)}
        className={`
          group w-full flex items-center px-3 py-2 text-sm rounded-lg
          transition-all duration-200
          ${isActive
            ? 'bg-primary-50/50'
            : 'hover:bg-neutral-50'
          }
        `}
      >
        <div className="flex items-center gap-2.5 flex-1 min-w-0">
          {/* Chevron indicator */}
          <div
            className="flex-shrink-0 transition-transform duration-200 ease-out"
            style={{ transform: isExpanded ? 'rotate(90deg)' : 'rotate(0deg)' }}
          >
            <ChevronRightIcon className={`h-3.5 w-3.5 ${
              isActive ? 'text-primary-400' : 'text-neutral-400'
            }`} strokeWidth={2.5} />
          </div>

          {/* Section icon */}
          {Icon && (
            <Icon className={`h-5 w-5 flex-shrink-0 transition-colors duration-200 ${
              isActive ? 'text-primary-600' : 'text-neutral-500 group-hover:text-neutral-600'
            }`} />
          )}

          {/* Section title */}
          <span className={`flex-1 text-left truncate transition-colors duration-200 ${
            isActive ? 'text-primary-700 font-semibold' : 'text-neutral-700 font-medium group-hover:text-neutral-900'
          }`}>
            {title}
          </span>

          {/* Optional badge */}
          {badge && (
            <span className="ml-auto px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide bg-success-light text-success-dark rounded-full flex-shrink-0">
              {badge}
            </span>
          )}
        </div>
      </button>

      {/* Expandable content with smooth height transition */}
      <div
        className={`
          overflow-hidden transition-all duration-200 ease-out
          ${isExpanded ? 'opacity-100' : 'opacity-0 max-h-0'}
        `}
        style={{
          maxHeight: isExpanded ? '1000px' : '0px',
        }}
      >
        <div className="pl-6 py-1 space-y-0.5">
          {children}
        </div>
      </div>
    </div>
  );
}
