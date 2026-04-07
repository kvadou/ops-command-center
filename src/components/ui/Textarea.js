import React, { forwardRef } from 'react';

/**
 * Textarea - Unified textarea component for Acme Operations
 *
 * Design System Compliant:
 * - Consistent styling with Input component
 * - Auto-resize option
 * - Character count support
 *
 * @param {string} label - Label text
 * @param {string} hint - Helper text below textarea
 * @param {string} error - Error message (shows error state)
 * @param {string} size - 'sm' | 'md' | 'lg'
 * @param {boolean} fullWidth - Make textarea full width
 * @param {number} rows - Number of visible rows
 * @param {boolean} resize - Allow resize ('none' | 'vertical' | 'horizontal' | 'both')
 * @param {number} maxLength - Max character count
 * @param {boolean} showCount - Show character count
 * @param {string} className - Additional classes
 */
const Textarea = forwardRef(({
  label,
  hint,
  error,
  size = 'md',
  fullWidth = true,
  rows = 4,
  resize = 'vertical',
  maxLength,
  showCount = false,
  className = '',
  id,
  disabled = false,
  required = false,
  value,
  ...props
}, ref) => {
  // Generate unique ID if not provided
  const textareaId = id || `textarea-${Math.random().toString(36).substr(2, 9)}`;

  // Size configurations
  const sizes = {
    sm: 'text-sm p-2.5',
    md: 'text-sm p-3',
    lg: 'text-base p-4',
  };

  // Resize options
  const resizeStyles = {
    none: 'resize-none',
    vertical: 'resize-y',
    horizontal: 'resize-x',
    both: 'resize',
  };

  // Determine border/ring color based on state
  const getStateStyles = () => {
    if (error) {
      return 'border-error focus:border-error focus:ring-error/20';
    }
    return 'border-neutral-300 focus:border-primary-500 focus:ring-primary-500/20';
  };

  // Base textarea styles
  const textareaStyles = `
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
    ${resizeStyles[resize]}
    ${getStateStyles()}
  `.replace(/\s+/g, ' ').trim();

  // Character count
  const charCount = typeof value === 'string' ? value.length : 0;
  const isOverLimit = maxLength && charCount > maxLength;

  return (
    <div className={fullWidth ? 'w-full' : ''}>
      {/* Label */}
      {label && (
        <label
          htmlFor={textareaId}
          className="block text-sm font-medium text-neutral-700 mb-1.5"
        >
          {label}
          {required && <span className="text-error ml-1">*</span>}
        </label>
      )}

      {/* Textarea */}
      <textarea
        ref={ref}
        id={textareaId}
        rows={rows}
        disabled={disabled}
        required={required}
        maxLength={maxLength}
        value={value}
        aria-invalid={error ? 'true' : undefined}
        aria-describedby={
          error ? `${textareaId}-error` : hint ? `${textareaId}-hint` : undefined
        }
        className={`${textareaStyles} ${className}`}
        {...props}
      />

      {/* Footer with hint/error and character count */}
      <div className="flex justify-between items-start mt-1.5 gap-4">
        {/* Hint or Error */}
        {(error || hint) ? (
          <p
            id={error ? `${textareaId}-error` : `${textareaId}-hint`}
            className={`text-sm ${error ? 'text-error' : 'text-neutral-500'}`}
          >
            {error || hint}
          </p>
        ) : (
          <span />
        )}

        {/* Character Count */}
        {(showCount || maxLength) && (
          <p
            className={`text-sm flex-shrink-0 ${
              isOverLimit ? 'text-error' : 'text-neutral-400'
            }`}
          >
            {charCount}{maxLength && `/${maxLength}`}
          </p>
        )}
      </div>
    </div>
  );
});

Textarea.displayName = 'Textarea';

export default Textarea;
