import React, { forwardRef } from 'react';

/**
 * Button - Unified button component for Acme Operations
 *
 * Design System Compliant:
 * - Uses Tailwind design tokens
 * - Consistent sizing and spacing
 * - Accessible focus states
 * - Loading and icon support
 *
 * @param {string} variant - 'primary' | 'secondary' | 'outline' | 'ghost' | 'danger' | 'success'
 * @param {string} size - 'xs' | 'sm' | 'md' | 'lg' | 'xl'
 * @param {boolean} fullWidth - Make button full width
 * @param {boolean} loading - Show loading spinner
 * @param {boolean} disabled - Disable the button
 * @param {React.ReactNode} leftIcon - Icon component to show on left
 * @param {React.ReactNode} rightIcon - Icon component to show on right
 * @param {React.ReactNode} children - Button content
 * @param {string} className - Additional classes
 * @param {string} as - Render as different element ('button' | 'a' | 'Link')
 */
const Button = forwardRef(({
  variant = 'primary',
  size = 'md',
  fullWidth = false,
  loading = false,
  disabled = false,
  leftIcon,
  rightIcon,
  children,
  className = '',
  as: Component = 'button',
  ...props
}, ref) => {
  // Base styles - consistent across all variants
  const baseStyles = `
    inline-flex items-center justify-center gap-2
    font-medium
    rounded-button
    transition-all duration-200 ease-smooth
    focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-offset-2
    disabled:opacity-50 disabled:cursor-not-allowed disabled:pointer-events-none
    select-none
  `.replace(/\s+/g, ' ').trim();

  // Variant styles
  const variants = {
    primary: `
      bg-primary-500 text-white
      hover:bg-primary-600 active:bg-primary-700
      focus-visible:ring-primary-500
      shadow-button hover:shadow-button-hover
    `,
    secondary: `
      bg-neutral-100 text-neutral-700
      hover:bg-neutral-200 active:bg-neutral-300
      focus-visible:ring-neutral-400
      border border-neutral-200
    `,
    outline: `
      bg-transparent text-primary-500
      border-2 border-primary-500
      hover:bg-primary-50 active:bg-primary-100
      focus-visible:ring-primary-500
    `,
    ghost: `
      bg-transparent text-neutral-600
      hover:bg-neutral-100 active:bg-neutral-200
      focus-visible:ring-neutral-400
    `,
    danger: `
      bg-error text-white
      hover:bg-error-dark active:bg-error-dark
      focus-visible:ring-error
      shadow-button hover:shadow-error
    `,
    success: `
      bg-success text-white
      hover:bg-success-dark active:bg-success-dark
      focus-visible:ring-success
      shadow-button hover:shadow-success
    `,
    // Legacy alias for backwards compatibility
    purple: `
      bg-primary-500 text-white
      hover:bg-primary-600 active:bg-primary-700
      focus-visible:ring-primary-500
      shadow-button hover:shadow-button-hover
    `,
  };

  // Size styles with consistent touch targets
  const sizes = {
    xs: 'h-7 px-2.5 text-xs gap-1.5',      // 28px height
    sm: 'h-8 px-3 text-sm gap-1.5',         // 32px height
    md: 'h-10 px-4 text-sm gap-2',          // 40px height
    lg: 'h-11 px-5 text-base gap-2',        // 44px height - touch target
    xl: 'h-12 px-6 text-base gap-2.5',      // 48px height
  };

  // Icon sizes matched to button sizes
  const iconSizes = {
    xs: 'h-3.5 w-3.5',
    sm: 'h-4 w-4',
    md: 'h-4 w-4',
    lg: 'h-5 w-5',
    xl: 'h-5 w-5',
  };

  // Loading spinner
  const LoadingSpinner = () => (
    <svg
      className={`animate-spin ${iconSizes[size]}`}
      xmlns="http://www.w3.org/2000/svg"
      fill="none"
      viewBox="0 0 24 24"
    >
      <circle
        className="opacity-25"
        cx="12"
        cy="12"
        r="10"
        stroke="currentColor"
        strokeWidth="4"
      />
      <path
        className="opacity-75"
        fill="currentColor"
        d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"
      />
    </svg>
  );

  // Clone icon with proper sizing
  const renderIcon = (icon) => {
    if (!icon) return null;
    return React.cloneElement(icon, {
      className: `${iconSizes[size]} ${icon.props.className || ''}`.trim(),
    });
  };

  const buttonClasses = `
    ${baseStyles}
    ${variants[variant] || variants.primary}
    ${sizes[size]}
    ${fullWidth ? 'w-full' : ''}
    ${className}
  `.replace(/\s+/g, ' ').trim();

  const content = (
    <>
      {loading ? <LoadingSpinner /> : renderIcon(leftIcon)}
      {children && <span className={loading ? 'opacity-0' : ''}>{children}</span>}
      {!loading && renderIcon(rightIcon)}
      {loading && children && (
        <span className="absolute inset-0 flex items-center justify-center">
          <LoadingSpinner />
        </span>
      )}
    </>
  );

  return (
    <Component
      ref={ref}
      className={buttonClasses}
      disabled={disabled || loading}
      {...props}
    >
      {content}
    </Component>
  );
});

Button.displayName = 'Button';

/**
 * IconButton - For icon-only buttons
 */
export const IconButton = forwardRef(({
  variant = 'ghost',
  size = 'md',
  icon,
  label,
  className = '',
  ...props
}, ref) => {
  const sizes = {
    xs: 'h-7 w-7',
    sm: 'h-8 w-8',
    md: 'h-10 w-10',
    lg: 'h-11 w-11',
    xl: 'h-12 w-12',
  };

  const iconSizes = {
    xs: 'h-3.5 w-3.5',
    sm: 'h-4 w-4',
    md: 'h-5 w-5',
    lg: 'h-5 w-5',
    xl: 'h-6 w-6',
  };

  return (
    <Button
      ref={ref}
      variant={variant}
      size={size}
      className={`!p-0 ${sizes[size]} ${className}`}
      aria-label={label}
      title={label}
      {...props}
    >
      {icon && React.cloneElement(icon, {
        className: `${iconSizes[size]} ${icon.props.className || ''}`.trim(),
      })}
    </Button>
  );
});

IconButton.displayName = 'IconButton';

/**
 * ButtonGroup - For grouping related buttons
 */
export const ButtonGroup = ({ children, className = '' }) => {
  return (
    <div
      className={`inline-flex items-center rounded-button overflow-hidden border border-neutral-200 ${className}`}
      role="group"
    >
      {React.Children.map(children, (child, index) => {
        if (!React.isValidElement(child)) return child;
        return React.cloneElement(child, {
          className: `
            ${child.props.className || ''}
            !rounded-none !shadow-none !border-0
            ${index > 0 ? 'border-l border-neutral-200' : ''}
          `.trim(),
          variant: child.props.variant || 'secondary',
        });
      })}
    </div>
  );
};

export default Button;
