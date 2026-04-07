/**
 * Centralized formatting utilities for the OpsHub frontend.
 * Replaces 60+ duplicated formatCurrency/formatDate definitions across components.
 */

/**
 * Format a numeric value as USD currency.
 *
 * @param {number|string|null|undefined} value - The amount to format
 * @param {object} [options]
 * @param {number} [options.decimals=2] - Number of decimal places (0 for whole dollars)
 * @param {string} [options.fallback='$0.00'] - Return value when input is null/undefined/NaN
 * @returns {string} Formatted currency string, e.g. "$1,234.56"
 */
export const formatCurrency = (value, { decimals = 2, fallback } = {}) => {
  if (value == null || (typeof value === 'number' && isNaN(value))) {
    // When no explicit fallback provided, default based on decimals
    if (fallback !== undefined) return fallback;
    return decimals === 0 ? '$0' : '$0.00';
  }
  const num = typeof value === 'string' ? parseFloat(value) : value;
  if (isNaN(num)) {
    return fallback !== undefined ? fallback : (decimals === 0 ? '$0' : '$0.00');
  }
  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: 'USD',
    minimumFractionDigits: decimals,
    maximumFractionDigits: decimals,
  }).format(num);
};

/**
 * Format a date string to a short readable format: "Jan 5, 2025".
 *
 * @param {string|Date|null|undefined} dateString - ISO date string or Date object
 * @param {string} [fallback='N/A'] - Return value when input is falsy or unparseable
 * @returns {string} Formatted date string
 */
export const formatDate = (dateString, fallback = 'N/A') => {
  if (!dateString) return fallback;
  try {
    const date = dateString instanceof Date ? dateString : new Date(dateString);
    if (isNaN(date.getTime())) return fallback;
    return date.toLocaleDateString('en-US', {
      month: 'short',
      day: 'numeric',
      year: 'numeric',
    });
  } catch {
    return fallback;
  }
};

/**
 * Format a date string to include time: "Jan 5, 2025, 02:30 PM".
 *
 * @param {string|Date|null|undefined} dateString - ISO date string or Date object
 * @param {string} [fallback='N/A'] - Return value when input is falsy or unparseable
 * @returns {string} Formatted date-time string
 */
export const formatDateTime = (dateString, fallback = 'N/A') => {
  if (!dateString) return fallback;
  try {
    const date = dateString instanceof Date ? dateString : new Date(dateString);
    if (isNaN(date.getTime())) return fallback;
    return date.toLocaleDateString('en-US', {
      year: 'numeric',
      month: 'short',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    });
  } catch {
    return fallback;
  }
};

/**
 * Format a decimal value as a percentage string: "45.2%".
 *
 * @param {number|null|undefined} value - The value to format (e.g. 0.452 or 45.2)
 * @param {object} [options]
 * @param {boolean} [options.isDecimal=false] - If true, multiply by 100 first (0.452 -> "45.2%")
 * @param {number} [options.decimals=1] - Number of decimal places
 * @returns {string} Formatted percentage string
 */
export const formatPercent = (value, { isDecimal = false, decimals = 1 } = {}) => {
  if (value == null || isNaN(value)) return '0%';
  const num = isDecimal ? value * 100 : value;
  return `${num.toFixed(decimals)}%`;
};

/**
 * Format a number with commas: 1234567 -> "1,234,567".
 *
 * @param {number|string|null|undefined} value - The number to format
 * @param {string} [fallback='0'] - Return value when input is null/undefined/NaN
 * @returns {string} Formatted number string
 */
export const formatNumber = (value, fallback = '0') => {
  if (value == null || (typeof value === 'number' && isNaN(value))) return fallback;
  const num = typeof value === 'string' ? parseFloat(value) : value;
  if (isNaN(num)) return fallback;
  return num.toLocaleString('en-US');
};
