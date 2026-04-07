import React, { forwardRef } from 'react';

/**
 * Card - Unified card component for Acme Operations
 *
 * Design System Compliant:
 * - Consistent border radius, shadows, and spacing
 * - Multiple variants for different contexts
 * - Hover states and transitions
 * - Composable with CardHeader, CardBody, CardFooter
 *
 * @param {string} variant - 'elevated' | 'outlined' | 'flat' | 'ghost'
 * @param {string} padding - 'none' | 'sm' | 'md' | 'lg'
 * @param {boolean} hoverable - Add hover effect
 * @param {boolean} clickable - Make card appear clickable
 * @param {React.ReactNode} children
 * @param {string} className
 */
const Card = forwardRef(({
  variant = 'elevated',
  padding = 'md',
  hoverable = false,
  clickable = false,
  children,
  className = '',
  ...props
}, ref) => {
  // Base styles
  const baseStyles = 'rounded-card bg-white transition-all duration-200';

  // Variant styles
  const variants = {
    elevated: 'shadow-card border border-neutral-100',
    outlined: 'border border-neutral-200 shadow-none',
    flat: 'bg-neutral-50 border-0 shadow-none',
    ghost: 'bg-transparent border-0 shadow-none',
  };

  // Padding scale
  const paddings = {
    none: '',
    sm: 'p-4',
    md: 'p-6',
    lg: 'p-8',
  };

  // Hover effects
  const hoverStyles = hoverable || clickable
    ? 'hover:shadow-card-hover hover:border-primary-200/40'
    : '';

  // Clickable cursor
  const clickableStyles = clickable
    ? 'cursor-pointer active:scale-[0.99]'
    : '';

  const cardClasses = `
    ${baseStyles}
    ${variants[variant] || variants.elevated}
    ${paddings[padding]}
    ${hoverStyles}
    ${clickableStyles}
    ${className}
  `.replace(/\s+/g, ' ').trim();

  return (
    <div ref={ref} className={cardClasses} {...props}>
      {children}
    </div>
  );
});

Card.displayName = 'Card';

/**
 * CardHeader - Header section of a card
 */
export const CardHeader = forwardRef(({
  title,
  subtitle,
  action,
  icon,
  children,
  className = '',
  ...props
}, ref) => {
  // If children are provided, render them directly
  if (children) {
    return (
      <div
        ref={ref}
        className={`flex items-start justify-between gap-4 mb-4 ${className}`}
        {...props}
      >
        {children}
      </div>
    );
  }

  return (
    <div
      ref={ref}
      className={`flex items-start justify-between gap-4 mb-4 ${className}`}
      {...props}
    >
      <div className="flex items-start gap-3 min-w-0">
        {icon && (
          <div className="flex-shrink-0 p-2 bg-primary-50 rounded-lg text-primary-500">
            {React.cloneElement(icon, {
              className: 'h-5 w-5',
            })}
          </div>
        )}
        <div className="min-w-0">
          {title && (
            <h3 className="text-heading-sm text-neutral-900 font-semibold truncate">
              {title}
            </h3>
          )}
          {subtitle && (
            <p className="text-body-sm text-neutral-500 mt-0.5">
              {subtitle}
            </p>
          )}
        </div>
      </div>
      {action && (
        <div className="flex-shrink-0">
          {action}
        </div>
      )}
    </div>
  );
});

CardHeader.displayName = 'CardHeader';

/**
 * CardBody - Main content area of a card
 */
export const CardBody = forwardRef(({
  children,
  className = '',
  ...props
}, ref) => {
  return (
    <div ref={ref} className={`${className}`} {...props}>
      {children}
    </div>
  );
});

CardBody.displayName = 'CardBody';

/**
 * CardFooter - Footer section of a card
 */
export const CardFooter = forwardRef(({
  children,
  justify = 'end',
  className = '',
  ...props
}, ref) => {
  const justifyStyles = {
    start: 'justify-start',
    center: 'justify-center',
    end: 'justify-end',
    between: 'justify-between',
  };

  return (
    <div
      ref={ref}
      className={`flex items-center gap-3 mt-6 pt-4 border-t border-neutral-100 ${justifyStyles[justify]} ${className}`}
      {...props}
    >
      {children}
    </div>
  );
});

CardFooter.displayName = 'CardFooter';

/**
 * CardDivider - Visual divider within a card
 */
export const CardDivider = ({ className = '' }) => (
  <hr className={`border-t border-neutral-100 my-4 ${className}`} />
);

/**
 * CardGrid - Grid layout for cards
 */
export const CardGrid = ({
  children,
  columns = 3,
  gap = 'md',
  className = '',
  ...props
}) => {
  const columnStyles = {
    1: 'grid-cols-1',
    2: 'grid-cols-1 sm:grid-cols-2',
    3: 'grid-cols-1 sm:grid-cols-2 lg:grid-cols-3',
    4: 'grid-cols-1 sm:grid-cols-2 lg:grid-cols-4',
    5: 'grid-cols-2 sm:grid-cols-3 lg:grid-cols-5',
    6: 'grid-cols-2 sm:grid-cols-3 lg:grid-cols-6',
  };

  const gapStyles = {
    sm: 'gap-3',
    md: 'gap-4 sm:gap-6',
    lg: 'gap-6 sm:gap-8',
  };

  return (
    <div
      className={`grid ${columnStyles[columns]} ${gapStyles[gap]} ${className}`}
      {...props}
    >
      {children}
    </div>
  );
};

/**
 * StatsCard - Specialized card for displaying metrics
 */
export const StatsCard = forwardRef(({
  title,
  value,
  change,
  changeType = 'neutral', // 'positive' | 'negative' | 'neutral'
  icon,
  trend,
  loading = false,
  className = '',
  ...props
}, ref) => {
  const changeColors = {
    positive: 'text-success bg-success-light',
    negative: 'text-error bg-error-light',
    neutral: 'text-neutral-500 bg-neutral-100',
  };

  if (loading) {
    return (
      <Card ref={ref} className={className} {...props}>
        <div className="animate-pulse">
          <div className="h-4 bg-neutral-200 rounded w-1/2 mb-3" />
          <div className="h-8 bg-neutral-200 rounded w-3/4 mb-2" />
          <div className="h-4 bg-neutral-200 rounded w-1/3" />
        </div>
      </Card>
    );
  }

  return (
    <Card ref={ref} className={className} {...props}>
      <div className="flex items-start justify-between gap-4">
        <div className="min-w-0 flex-1">
          <p className="text-body-sm text-neutral-500 font-medium truncate">
            {title}
          </p>
          <p className="text-display text-neutral-900 mt-1 truncate">
            {value}
          </p>
          {change && (
            <div className="flex items-center gap-2 mt-2">
              <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-caption font-medium ${changeColors[changeType]}`}>
                {changeType === 'positive' && '+'}{change}
              </span>
              {trend && (
                <span className="text-body-sm text-neutral-400">{trend}</span>
              )}
            </div>
          )}
        </div>
        {icon && (
          <div className="flex-shrink-0 p-3 bg-primary-50 rounded-xl text-primary-500">
            {React.cloneElement(icon, {
              className: 'h-6 w-6',
            })}
          </div>
        )}
      </div>
    </Card>
  );
});

StatsCard.displayName = 'StatsCard';

export default Card;
