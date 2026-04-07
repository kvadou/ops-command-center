import { DateTime } from 'luxon';

/**
 * Pay Cycle Utilities
 *
 * Acme Operations pays tutors semi-monthly:
 * - 1st - 15th of each month
 * - 16th - end of month
 *
 * Tutors are paid after each period ends.
 */

/**
 * Get the current pay cycle based on today's date
 * @returns {Object} { start: DateTime, end: DateTime, label: string }
 */
export function getCurrentPayCycle() {
  const today = DateTime.now();
  const day = today.day;
  const year = today.year;
  const month = today.month;

  if (day <= 15) {
    // First half: 1st - 15th
    return {
      start: DateTime.local(year, month, 1),
      end: DateTime.local(year, month, 15),
      label: `Current Pay Cycle (${month}/1 - ${month}/15)`
    };
  } else {
    // Second half: 16th - end of month
    const endOfMonth = today.endOf('month').day;
    return {
      start: DateTime.local(year, month, 16),
      end: DateTime.local(year, month, endOfMonth),
      label: `Current Pay Cycle (${month}/16 - ${month}/${endOfMonth})`
    };
  }
}

/**
 * Get the next pay cycle after the current one
 * @returns {Object} { start: DateTime, end: DateTime, label: string }
 */
export function getNextPayCycle() {
  const today = DateTime.now();
  const day = today.day;
  const year = today.year;
  const month = today.month;

  if (day <= 15) {
    // Currently in 1-15, next is 16-end of this month
    const endOfMonth = today.endOf('month').day;
    return {
      start: DateTime.local(year, month, 16),
      end: DateTime.local(year, month, endOfMonth),
      label: `Next Pay Cycle (${month}/16 - ${month}/${endOfMonth})`
    };
  } else {
    // Currently in 16-end, next is 1-15 of next month
    const nextMonth = today.plus({ months: 1 });
    const nextMonthNum = nextMonth.month;
    const nextYear = nextMonth.year;
    return {
      start: DateTime.local(nextYear, nextMonthNum, 1),
      end: DateTime.local(nextYear, nextMonthNum, 15),
      label: `Next Pay Cycle (${nextMonthNum}/1 - ${nextMonthNum}/15)`
    };
  }
}

/**
 * Get the previous pay cycle (for historical analysis)
 * @returns {Object} { start: DateTime, end: DateTime, label: string }
 */
export function getPreviousPayCycle() {
  const today = DateTime.now();
  const day = today.day;
  const year = today.year;
  const month = today.month;

  if (day <= 15) {
    // Currently in 1-15, previous is 16-end of last month
    const lastMonth = today.minus({ months: 1 });
    const lastMonthNum = lastMonth.month;
    const lastYear = lastMonth.year;
    const endOfLastMonth = lastMonth.endOf('month').day;
    return {
      start: DateTime.local(lastYear, lastMonthNum, 16),
      end: DateTime.local(lastYear, lastMonthNum, endOfLastMonth),
      label: `Previous Pay Cycle (${lastMonthNum}/16 - ${lastMonthNum}/${endOfLastMonth})`
    };
  } else {
    // Currently in 16-end, previous is 1-15 of this month
    return {
      start: DateTime.local(year, month, 1),
      end: DateTime.local(year, month, 15),
      label: `Previous Pay Cycle (${month}/1 - ${month}/15)`
    };
  }
}

/**
 * Get all pay cycle presets for the date picker
 * @returns {Array} Array of preset objects with start, end, label
 */
export function getPayCyclePresets() {
  return [
    getCurrentPayCycle(),
    getNextPayCycle(),
    getPreviousPayCycle()
  ];
}
