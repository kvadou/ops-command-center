/**
 * Centralized chart color constants for Recharts.
 * Recharts needs raw hex values (can't use Tailwind classes).
 * Corresponding Tailwind classes are in tailwind.config.js under `chart.*`.
 */

export const CHART_COLORS = {
  lessons: '#6366f1',    // indigo
  hours: '#8b5cf6',      // violet
  students: '#06b6d4',   // cyan
  tutors: '#14b8a6',     // teal
  revenue: '#22c55e',    // green
  tutor_pay: '#f59e0b',  // amber
  adhoc_pay: '#ef4444',  // red
  profit: '#10b981',     // emerald
};

export const CHART_GRID = '#e5e7eb';
export const CHART_AXIS = '#6b7280';
export const CHART_TARGET = '#f59e0b';
export const CHART_CONNECTOR = '#9ca3af';
export const CHART_FORECAST = '#3b82f6';

export const HOLIDAY_COLORS = {
  yellow: { light: '#fef3c7', medium: '#fde68a', strong: '#fcd34d' },
  red: { light: '#fee2e2' },
};
