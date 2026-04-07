import React from 'react';
import { getLabelColor, getContrastColor } from '../../utils/labelColors';

/**
 * Badge - Unified badge/tag component for Acme Operations
 *
 * Design System Compliant:
 * - Consistent sizing, colors, and rounded corners
 * - Semantic variants for status indicators
 * - Support for dynamic TutorCruncher labels
 * - Dot indicators and removable badges
 *
 * @param {string} variant - 'default' | 'success' | 'warning' | 'error' | 'info' | 'neutral' | 'primary' | 'label'
 * @param {string} size - 'xs' | 'sm' | 'md' | 'lg'
 * @param {string} labelName - For variant='label', uses TutorCruncher color mapping
 * @param {string} color - Custom background color (overrides variant)
 * @param {boolean} dot - Show status dot before content
 * @param {boolean} removable - Show remove button
 * @param {function} onRemove - Callback when remove is clicked
 * @param {React.ReactNode} children
 * @param {string} className
 */
export default function Badge({
  variant = 'neutral',
  size = 'sm',
  labelName,
  color,
  dot = false,
  removable = false,
  onRemove,
  children,
  className = '',
  ...props
}) {
  // Size configurations
  const sizes = {
    xs: 'px-1.5 py-0.5 text-[10px]',
    sm: 'px-2 py-0.5 text-xs',
    md: 'px-2.5 py-1 text-xs',
    lg: 'px-3 py-1.5 text-sm',
  };

  const dotSizes = {
    xs: 'h-1 w-1',
    sm: 'h-1.5 w-1.5',
    md: 'h-2 w-2',
    lg: 'h-2 w-2',
  };

  // Semantic variants using design tokens
  const variants = {
    default: 'bg-neutral-100 text-neutral-700',
    neutral: 'bg-neutral-100 text-neutral-700',
    primary: 'bg-primary-100 text-primary-700',
    success: 'bg-success-light text-success-dark',
    warning: 'bg-warning-light text-warning-dark',
    error: 'bg-error-light text-error-dark',
    info: 'bg-info-light text-info-dark',
    // Legacy mappings for backwards compatibility
    planned: 'bg-accent-yellow-light text-accent-yellow-dark',
    complete: 'bg-success-light text-success-dark',
    cancelled: 'bg-error-light text-error-dark',
    'in-progress': 'bg-info-light text-info-dark',
    editable: 'bg-accent-navy-light text-accent-navy',
  };

  // Determine styling
  let style = {};
  let variantClasses = '';

  if (color) {
    // Custom color provided
    const textColor = getContrastColor(color);
    style = {
      backgroundColor: color,
      color: textColor,
    };
  } else if (variant === 'label' && labelName) {
    // TutorCruncher label coloring
    const bgColor = getLabelColor(labelName);
    const textColor = getContrastColor(bgColor);
    style = {
      backgroundColor: bgColor,
      color: textColor,
    };
  } else {
    // Use variant classes
    variantClasses = variants[variant] || variants.neutral;
  }

  const badgeClasses = `
    inline-flex items-center gap-1.5
    rounded-full
    font-semibold
    whitespace-nowrap
    transition-colors duration-150
    ${sizes[size]}
    ${variantClasses}
    ${className}
  `.replace(/\s+/g, ' ').trim();

  return (
    <span className={badgeClasses} style={style} {...props}>
      {dot && (
        <span
          className={`${dotSizes[size]} rounded-full flex-shrink-0`}
          style={{
            backgroundColor: style.color || 'currentColor',
          }}
        />
      )}
      {children}
      {removable && onRemove && (
        <button
          type="button"
          onClick={(e) => {
            e.stopPropagation();
            onRemove();
          }}
          className="ml-0.5 -mr-1 h-4 w-4 flex items-center justify-center rounded-full hover:bg-black/10 transition-colors"
          aria-label="Remove"
        >
          <svg className="h-3 w-3" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
          </svg>
        </button>
      )}
    </span>
  );
}

/**
 * StatusBadge - Specialized badge for status indicators
 */
export function StatusBadge({
  status,
  children,
  ...props
}) {
  // Map status strings to variants
  const statusVariantMap = {
    // Active/Positive states
    active: 'success',
    approved: 'success',
    completed: 'success',
    confirmed: 'success',
    paid: 'success',
    success: 'success',
    // Warning states
    pending: 'warning',
    processing: 'warning',
    waiting: 'warning',
    draft: 'warning',
    // Error/Negative states
    cancelled: 'error',
    failed: 'error',
    rejected: 'error',
    declined: 'error',
    overdue: 'error',
    error: 'error',
    // Info/Neutral states
    new: 'info',
    scheduled: 'info',
    in_progress: 'info',
    'in-progress': 'info',
    // Default
    inactive: 'neutral',
    default: 'neutral',
  };

  const variant = statusVariantMap[status?.toLowerCase()] || 'neutral';

  return (
    <Badge variant={variant} dot {...props}>
      {children || status}
    </Badge>
  );
}

/**
 * CountBadge - Specialized badge for counts/numbers
 */
export function CountBadge({
  count,
  max = 99,
  variant = 'primary',
  size = 'xs',
  className = '',
  ...props
}) {
  const displayCount = count > max ? `${max}+` : count;

  return (
    <Badge
      variant={variant}
      size={size}
      className={`min-w-[1.25rem] text-center justify-center ${className}`}
      {...props}
    >
      {displayCount}
    </Badge>
  );
}

/**
 * BadgeGroup - Container for multiple badges
 */
export function BadgeGroup({
  children,
  max = null,
  className = '',
  ...props
}) {
  const badges = React.Children.toArray(children);
  const visibleBadges = max ? badges.slice(0, max) : badges;
  const hiddenCount = max ? badges.length - max : 0;

  return (
    <div className={`flex flex-wrap items-center gap-1.5 ${className}`} {...props}>
      {visibleBadges}
      {hiddenCount > 0 && (
        <Badge variant="neutral" size="sm">
          +{hiddenCount}
        </Badge>
      )}
    </div>
  );
}
