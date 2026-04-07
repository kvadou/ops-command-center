import React from 'react';
import { Link } from 'react-router-dom';
import { ArrowLeftIcon, ArrowTopRightOnSquareIcon, ChevronRightIcon } from '@heroicons/react/24/outline';
import { Badge } from './ui';

/**
 * PageHeader - Reusable mobile-responsive page header component
 * 
 * Matches the design pattern from JobDetailPage with:
 * - Responsive title and badge layout
 * - Action buttons that stack on mobile
 * - Proper tap targets (44x44px minimum on mobile)
 * - Consistent styling across all Operations Hub pages
 * 
 * @param {string} title - Page title
 * @param {string|object} status - Status badge (string or {text, variant})
 * @param {string} backUrl - URL for back button
 * @param {string} backLabel - Label for back button (default: "Back")
 * @param {string} externalUrl - External link URL (e.g., TutorCruncher)
 * @param {string} externalLabel - External link label
 * @param {Array<{url, label, className?}>} extraLinks - Additional external links
 * @param {ReactNode} actions - Additional action buttons/elements
 * @param {string} className - Additional CSS classes
 */
export default function PageHeader({
  title,
  status,
  backUrl,
  backLabel = "Back",
  externalUrl,
  externalLabel = "View in TutorCruncher",
  extraLinks = [],
  actions,
  className = ""
}) {
  const getStatusBadgeVariant = (statusText) => {
    if (!statusText) return 'editable';
    const statusLower = statusText.toLowerCase();
    if (statusLower.includes('active') || statusLower.includes('in-progress') || statusLower.includes('approved')) {
      return 'in-progress';
    } else if (statusLower.includes('planned') || statusLower.includes('pending')) {
      return 'planned';
    } else if (statusLower.includes('completed') || statusLower.includes('done') || statusLower === 'complete') {
      return 'complete';
    } else if (statusLower.includes('cancelled') || statusLower.includes('error') || statusLower.includes('rejected')) {
      return 'cancelled';
    }
    return 'editable';
  };

  const statusText = typeof status === 'string' ? status : status?.text;
  const statusVariant = typeof status === 'object' && status?.variant 
    ? status.variant 
    : getStatusBadgeVariant(statusText);

  return (
    <div className={`bg-white border-b border-neutral-200 ${className}`}>
      <div className="w-full px-4 sm:px-6 lg:px-8 py-4 sm:py-6">
        {/* Breadcrumb */}
        {backUrl && (
          <nav className="flex items-center gap-1.5 text-sm mb-2" aria-label="Breadcrumb">
            <Link to={backUrl} className="text-[#6A469D] hover:text-[#2D2F8E] font-medium transition-colors">
              {backLabel?.replace('Back to ', '') || 'Back'}
            </Link>
            <ChevronRightIcon className="h-3.5 w-3.5 text-neutral-400 flex-shrink-0" />
            <span className="text-neutral-500 font-medium truncate max-w-[250px]">
              {typeof title === 'string' ? title.replace(/^(Tutor|Client|Student|Job|Lesson): /, '') : title}
            </span>
          </nav>
        )}

        {/* Mobile: Stack vertically, Desktop: Horizontal */}
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
          {/* Title Section */}
          <div className="flex-1 min-w-0">
            <h1 className="text-xl sm:text-2xl lg:text-3xl font-bold text-neutral-900 flex flex-col sm:flex-row sm:items-center gap-2 sm:gap-3">
              <span className="break-words">{title}</span>
              {statusText && (
                <Badge variant={statusVariant} className="self-start sm:self-center">
                  {statusText}
                </Badge>
              )}
            </h1>
          </div>
          {/* Action Buttons - Mobile: Full width, Desktop: Auto */}
          <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-2 sm:gap-3">
            {externalUrl && (
              <a
                href={externalUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center justify-center gap-2 px-4 py-2.5 sm:py-2 bg-brand-purple text-white rounded-md hover:bg-brand-navy transition-colors text-sm font-medium min-h-[44px] sm:min-h-0"
              >
                <span className="whitespace-nowrap">{externalLabel}</span>
                <ArrowTopRightOnSquareIcon className="h-4 w-4 flex-shrink-0" />
              </a>
            )}
            {extraLinks.map((link, i) => (
              <a
                key={i}
                href={link.url}
                target="_blank"
                rel="noopener noreferrer"
                className={link.className || "inline-flex items-center justify-center gap-2 px-4 py-2.5 sm:py-2 bg-brand-navy text-white rounded-md hover:bg-brand-purple transition-colors text-sm font-medium min-h-[44px] sm:min-h-0"}
              >
                <span className="whitespace-nowrap">{link.label}</span>
                <ArrowTopRightOnSquareIcon className="h-4 w-4 flex-shrink-0" />
              </a>
            ))}
            {actions}
          </div>
        </div>
      </div>
    </div>
  );
}
