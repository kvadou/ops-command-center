import React, { forwardRef } from 'react';
import { ExclamationCircleIcon, CheckCircleIcon } from '@heroicons/react/24/outline';

/**
 * Input - Unified text input component for Acme Operations
 *
 * Design System Compliant:
 * - Consistent sizing, padding, and border radius
 * - Proper focus states with brand colors
 * - Support for labels, hints, errors, and icons
 * - Accessible with proper ARIA attributes
 *
 * @param {string} label - Label text
 * @param {string} hint - Helper text below input
 * @param {string} error - Error message (shows error state)
 * @param {boolean} success - Show success state
 * @param {string} size - 'sm' | 'md' | 'lg'
 * @param {boolean} fullWidth - Make input full width
 * @param {React.ReactNode} leftIcon - Icon to show on left
 * @param {React.ReactNode} rightIcon - Icon to show on right
 * @param {React.ReactNode} leftAddon - Addon element on left (outside input)
 * @param {React.ReactNode} rightAddon - Addon element on right (outside input)
 * @param {string} className - Additional classes
 */
const Input = forwardRef(({
  label,
  hint,
  error,
  success = false,
  size = 'md',
  fullWidth = true,
  leftIcon,
  rightIcon,
  leftAddon,
  rightAddon,
  className = '',
  id,
  disabled = false,
  required = false,
  type = 'text',
  ...props
}, ref) => {
  // Generate unique ID if not provided
  const inputId = id || `input-${Math.random().toString(36).substr(2, 9)}`;

  // Size configurations
  const sizes = {
    sm: 'h-8 text-sm px-3',
    md: 'h-10 text-sm px-3',
    lg: 'h-12 text-base px-4',
  };

  const iconSizes = {
    sm: 'h-4 w-4',
    md: 'h-4 w-4',
    lg: 'h-5 w-5',
  };

  const iconPadding = {
    sm: { left: 'pl-8', right: 'pr-8' },
    md: { left: 'pl-10', right: 'pr-10' },
    lg: { left: 'pl-11', right: 'pr-11' },
  };

  // Determine border/ring color based on state
  const getStateStyles = () => {
    if (error) {
      return 'border-error focus:border-error focus:ring-error/20';
    }
    if (success) {
      return 'border-success focus:border-success focus:ring-success/20';
    }
    return 'border-neutral-300 focus:border-primary-500 focus:ring-primary-500/20';
  };

  // Base input styles
  const inputStyles = `
    w-full
    rounded-input
    border
    bg-white
    text-neutral-900
    placeholder:text-neutral-400
    transition-all duration-200
    focus:outline-none focus:ring-2
    disabled:bg-neutral-50 disabled:text-neutral-500 disabled:cursor-not-allowed
    ${sizes[size]}
    ${leftIcon ? iconPadding[size].left : ''}
    ${rightIcon || error || success ? iconPadding[size].right : ''}
    ${getStateStyles()}
  `.replace(/\s+/g, ' ').trim();

  // Determine right icon to show
  const getRightIcon = () => {
    if (error) {
      return <ExclamationCircleIcon className={`${iconSizes[size]} text-error`} />;
    }
    if (success) {
      return <CheckCircleIcon className={`${iconSizes[size]} text-success`} />;
    }
    if (rightIcon) {
      return React.cloneElement(rightIcon, {
        className: `${iconSizes[size]} text-neutral-400`,
      });
    }
    return null;
  };

  const inputElement = (
    <div className="relative">
      {/* Left Icon */}
      {leftIcon && (
        <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
          {React.cloneElement(leftIcon, {
            className: `${iconSizes[size]} text-neutral-400`,
          })}
        </div>
      )}

      {/* Input */}
      <input
        ref={ref}
        id={inputId}
        type={type}
        disabled={disabled}
        required={required}
        aria-invalid={error ? 'true' : undefined}
        aria-describedby={
          error ? `${inputId}-error` : hint ? `${inputId}-hint` : undefined
        }
        className={`${inputStyles} ${className}`}
        {...props}
      />

      {/* Right Icon */}
      {getRightIcon() && (
        <div className="absolute inset-y-0 right-0 pr-3 flex items-center pointer-events-none">
          {getRightIcon()}
        </div>
      )}
    </div>
  );

  // With addons
  const withAddons = leftAddon || rightAddon ? (
    <div className="flex">
      {leftAddon && (
        <span className="inline-flex items-center px-3 rounded-l-input border border-r-0 border-neutral-300 bg-neutral-50 text-neutral-500 text-sm">
          {leftAddon}
        </span>
      )}
      <div className={`relative flex-1 ${leftAddon ? '[&_input]:rounded-l-none' : ''} ${rightAddon ? '[&_input]:rounded-r-none' : ''}`}>
        {inputElement}
      </div>
      {rightAddon && (
        <span className="inline-flex items-center px-3 rounded-r-input border border-l-0 border-neutral-300 bg-neutral-50 text-neutral-500 text-sm">
          {rightAddon}
        </span>
      )}
    </div>
  ) : inputElement;

  return (
    <div className={fullWidth ? 'w-full' : ''}>
      {/* Label */}
      {label && (
        <label
          htmlFor={inputId}
          className="block text-sm font-medium text-neutral-700 mb-1.5"
        >
          {label}
          {required && <span className="text-error ml-1">*</span>}
        </label>
      )}

      {/* Input with potential addons */}
      {withAddons}

      {/* Hint or Error */}
      {(error || hint) && (
        <p
          id={error ? `${inputId}-error` : `${inputId}-hint`}
          className={`mt-1.5 text-sm ${error ? 'text-error' : 'text-neutral-500'}`}
        >
          {error || hint}
        </p>
      )}
    </div>
  );
});

Input.displayName = 'Input';

/**
 * SearchInput - Specialized input for search
 */
export const SearchInput = forwardRef(({
  placeholder = 'Search...',
  onClear,
  value,
  ...props
}, ref) => {
  const SearchIcon = () => (
    <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
    </svg>
  );

  const ClearButton = () => (
    <button
      type="button"
      onClick={onClear}
      className="absolute inset-y-0 right-0 pr-3 flex items-center text-neutral-400 hover:text-neutral-600"
    >
      <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
      </svg>
    </button>
  );

  return (
    <div className="relative">
      <Input
        ref={ref}
        type="search"
        placeholder={placeholder}
        leftIcon={<SearchIcon />}
        value={value}
        {...props}
      />
      {value && onClear && <ClearButton />}
    </div>
  );
});

SearchInput.displayName = 'SearchInput';

/**
 * PasswordInput - Input with show/hide toggle
 */
export const PasswordInput = forwardRef((props, ref) => {
  const [showPassword, setShowPassword] = React.useState(false);

  const EyeIcon = () => (
    <button
      type="button"
      onClick={() => setShowPassword(!showPassword)}
      className="text-neutral-400 hover:text-neutral-600 focus:outline-none"
    >
      {showPassword ? (
        <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13.875 18.825A10.05 10.05 0 0112 19c-4.478 0-8.268-2.943-9.543-7a9.97 9.97 0 011.563-3.029m5.858.908a3 3 0 114.243 4.243M9.878 9.878l4.242 4.242M9.88 9.88l-3.29-3.29m7.532 7.532l3.29 3.29M3 3l3.59 3.59m0 0A9.953 9.953 0 0112 5c4.478 0 8.268 2.943 9.543 7a10.025 10.025 0 01-4.132 5.411m0 0L21 21" />
        </svg>
      ) : (
        <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z" />
        </svg>
      )}
    </button>
  );

  return (
    <div className="relative [&_input]:pr-10">
      <Input
        ref={ref}
        type={showPassword ? 'text' : 'password'}
        {...props}
      />
      <div className={`absolute inset-y-0 right-0 pr-3 flex items-center ${props.label ? 'top-7' : 'top-0'}`}>
        <EyeIcon />
      </div>
    </div>
  );
});

PasswordInput.displayName = 'PasswordInput';

export default Input;
