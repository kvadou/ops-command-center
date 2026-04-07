import React, { forwardRef } from 'react';
import { ChevronDownIcon } from '@heroicons/react/24/outline';

/**
 * Select - Unified select/dropdown component for Acme Operations
 *
 * Design System Compliant:
 * - Consistent styling with Input component
 * - Native select for accessibility and mobile friendliness
 * - Support for labels, hints, errors
 *
 * @param {string} label - Label text
 * @param {string} hint - Helper text below select
 * @param {string} error - Error message (shows error state)
 * @param {string} size - 'sm' | 'md' | 'lg'
 * @param {boolean} fullWidth - Make select full width
 * @param {string} placeholder - Placeholder option text
 * @param {Array} options - Array of options { value, label, disabled }
 * @param {string} className - Additional classes
 */
const Select = forwardRef(({
  label,
  hint,
  error,
  size = 'md',
  fullWidth = true,
  placeholder,
  options = [],
  children,
  className = '',
  id,
  disabled = false,
  required = false,
  ...props
}, ref) => {
  // Generate unique ID if not provided
  const selectId = id || `select-${Math.random().toString(36).substr(2, 9)}`;

  // Size configurations matching Input component
  const sizes = {
    sm: 'h-8 text-sm pl-3 pr-8',
    md: 'h-10 text-sm pl-3 pr-10',
    lg: 'h-12 text-base pl-4 pr-11',
  };

  const iconSizes = {
    sm: 'h-4 w-4 right-2',
    md: 'h-4 w-4 right-3',
    lg: 'h-5 w-5 right-3',
  };

  // Determine border/ring color based on state
  const getStateStyles = () => {
    if (error) {
      return 'border-error focus:border-error focus:ring-error/20';
    }
    return 'border-neutral-300 focus:border-primary-500 focus:ring-primary-500/20';
  };

  // Base select styles
  const selectStyles = `
    w-full
    rounded-input
    border
    bg-white
    text-neutral-900
    appearance-none
    cursor-pointer
    transition-all duration-200
    focus:outline-none focus:ring-2
    disabled:bg-neutral-50 disabled:text-neutral-500 disabled:cursor-not-allowed
    ${sizes[size]}
    ${getStateStyles()}
  `.replace(/\s+/g, ' ').trim();

  return (
    <div className={fullWidth ? 'w-full' : ''}>
      {/* Label */}
      {label && (
        <label
          htmlFor={selectId}
          className="block text-sm font-medium text-neutral-700 mb-1.5"
        >
          {label}
          {required && <span className="text-error ml-1">*</span>}
        </label>
      )}

      {/* Select wrapper */}
      <div className="relative">
        <select
          ref={ref}
          id={selectId}
          disabled={disabled}
          required={required}
          aria-invalid={error ? 'true' : undefined}
          aria-describedby={
            error ? `${selectId}-error` : hint ? `${selectId}-hint` : undefined
          }
          className={`${selectStyles} ${className}`}
          {...props}
        >
          {placeholder && (
            <option value="" disabled>
              {placeholder}
            </option>
          )}
          {children || options.map((option) => (
            <option
              key={option.value}
              value={option.value}
              disabled={option.disabled}
            >
              {option.label}
            </option>
          ))}
        </select>

        {/* Dropdown Icon */}
        <div className={`absolute inset-y-0 flex items-center pointer-events-none ${iconSizes[size]}`}>
          <ChevronDownIcon className={`${iconSizes[size].split(' ').slice(0, 2).join(' ')} text-neutral-400`} />
        </div>
      </div>

      {/* Hint or Error */}
      {(error || hint) && (
        <p
          id={error ? `${selectId}-error` : `${selectId}-hint`}
          className={`mt-1.5 text-sm ${error ? 'text-error' : 'text-neutral-500'}`}
        >
          {error || hint}
        </p>
      )}
    </div>
  );
});

Select.displayName = 'Select';

/**
 * SelectNative - Alias for Select (backwards compatibility)
 */
export const SelectNative = Select;

export default Select;
