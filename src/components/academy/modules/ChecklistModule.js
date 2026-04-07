import React from 'react';
import {
  CheckCircleIcon,
  SparklesIcon,
  InformationCircleIcon,
  ArrowTopRightOnSquareIcon,
} from '@heroicons/react/24/outline';
import { CheckCircleIcon as CheckCircleSolidIcon } from '@heroicons/react/24/solid';
import Tooltip from '@mui/material/Tooltip';

/**
 * ChecklistModule - Interactive checklist component for academy modules
 *
 * Features:
 * - Interactive checkbox toggling with visual feedback
 * - Points display per item
 * - Help text and links
 * - Due day indicators
 * - Completion state management
 */
export default function ChecklistModule({ items, progress, onToggle, isModuleCompleted }) {
  if (!items || items.length === 0) {
    return (
      <div className="p-8 text-center">
        <p className="text-neutral-500">No checklist items available.</p>
      </div>
    );
  }

  return (
    <div className="divide-y divide-neutral-100">
      {items.map((item, index) => {
        const itemProgress = progress[item.id];
        const isCompleted = itemProgress?.is_completed || false;

        return (
          <div
            key={item.id}
            className={`
              p-4 sm:p-5 transition-colors duration-200
              ${isCompleted
                ? 'bg-emerald-50/50'
                : 'hover:bg-neutral-50'
              }
            `}
          >
            <div className="flex items-start gap-3 sm:gap-4">
              {/* Checkbox */}
              <button
                onClick={() => !isModuleCompleted && onToggle(item.id)}
                disabled={isModuleCompleted}
                className={`
                  flex-shrink-0 w-6 h-6 rounded-md border-2 flex items-center justify-center
                  transition-all duration-200
                  ${isModuleCompleted
                    ? 'cursor-not-allowed'
                    : 'cursor-pointer'
                  }
                  ${isCompleted
                    ? 'bg-emerald-500 border-emerald-500 text-white'
                    : 'border-neutral-300 hover:border-brand-navy bg-white'
                  }
                `}
              >
                {isCompleted && (
                  <svg
                    className="w-4 h-4"
                    fill="none"
                    viewBox="0 0 24 24"
                    stroke="currentColor"
                    strokeWidth={3}
                  >
                    <path
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      d="M5 13l4 4L19 7"
                    />
                  </svg>
                )}
              </button>

              {/* Content */}
              <div className="flex-1 min-w-0">
                <div className="flex items-start justify-between gap-2">
                  <div className="flex-1">
                    <div className="flex items-center gap-2 flex-wrap">
                      <h4
                        className={`
                          font-medium text-sm sm:text-base
                          ${isCompleted ? 'text-neutral-500 line-through' : 'text-neutral-900'}
                        `}
                      >
                        {item.title}
                      </h4>
                      {item.is_required && (
                        <span className="px-1.5 py-0.5 text-[10px] font-semibold rounded bg-brand-navy/10 text-brand-navy">
                          Required
                        </span>
                      )}
                    </div>

                    {item.description && (
                      <p className={`
                        mt-1 text-sm
                        ${isCompleted ? 'text-neutral-400' : 'text-neutral-600'}
                      `}>
                        {item.description}
                      </p>
                    )}

                    {/* Help text and link */}
                    {(item.help_text || item.help_link) && (
                      <div className="mt-2 flex items-center gap-2 flex-wrap">
                        {item.help_text && (
                          <Tooltip
                            title={item.help_text}
                            arrow
                            placement="top"
                          >
                            <button className="inline-flex items-center gap-1 text-xs text-neutral-400 hover:text-brand-navy transition-colors">
                              <InformationCircleIcon className="h-4 w-4" />
                              <span>Tip</span>
                            </button>
                          </Tooltip>
                        )}
                        {item.help_link && (
                          <a
                            href={item.help_link}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="inline-flex items-center gap-1 text-xs text-brand-navy hover:text-indigo-500 transition-colors"
                          >
                            <ArrowTopRightOnSquareIcon className="h-3.5 w-3.5" />
                            <span>Learn More</span>
                          </a>
                        )}
                      </div>
                    )}

                    {/* Completion info */}
                    {isCompleted && itemProgress?.completed_at && (
                      <p className="mt-2 text-xs text-emerald-600">
                        Completed {new Date(itemProgress.completed_at).toLocaleDateString()}
                        {itemProgress.completed_by_name && (
                          <span> by {itemProgress.completed_by_name}</span>
                        )}
                      </p>
                    )}
                  </div>

                  {/* Points and due day */}
                  <div className="flex flex-col items-end gap-1 flex-shrink-0">
                    {item.points_value > 0 && (
                      <div className={`
                        flex items-center gap-1 text-xs
                        ${isCompleted ? 'text-emerald-600' : 'text-neutral-400'}
                      `}>
                        <SparklesIcon className="h-3.5 w-3.5" />
                        <span>{isCompleted ? '+' : ''}{item.points_value} pts</span>
                      </div>
                    )}
                    {item.due_day && (
                      <span className="text-xs text-neutral-400">
                        Day {item.due_day}
                      </span>
                    )}
                  </div>
                </div>
              </div>
            </div>
          </div>
        );
      })}

      {/* Summary footer */}
      <div className="p-4 bg-neutral-50">
        <div className="flex items-center justify-between text-sm">
          <span className="text-neutral-600">
            {items.filter(i => progress[i.id]?.is_completed).length} of {items.length} items completed
          </span>
          <span className="font-medium text-brand-navy">
            {items.reduce((acc, item) => {
              return acc + (progress[item.id]?.is_completed ? (item.points_value || 0) : 0);
            }, 0)} points earned
          </span>
        </div>
      </div>
    </div>
  );
}
