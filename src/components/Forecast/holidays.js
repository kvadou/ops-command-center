import { DateTime } from 'luxon';
import { HOLIDAY_COLORS } from '../../utils/chartTheme';

/**
 * Get US holiday ranges for the given year(s)
 * Returns array of holiday objects with start, end dates and styling
 */
export const getHolidayRanges = (year = DateTime.now().year) => {
  const holidays = [];
  
  // Thanksgiving Week (Mon-Sun containing 4th Thursday of November)
  // Find 4th Thursday of November
  const nov1 = DateTime.fromObject({ year, month: 11, day: 1 });
  const firstThursday = nov1.plus({ days: (3 - nov1.weekday + 7) % 7 });
  const fourthThursday = firstThursday.plus({ days: 21 });
  const thanksgivingMonday = fourthThursday.minus({ days: 3 });
  const thanksgivingSunday = fourthThursday.plus({ days: 3 });
  
  holidays.push({
    name: "Thanksgiving Week",
    start: thanksgivingMonday.startOf('day'),
    end: thanksgivingSunday.endOf('day'),
    color: HOLIDAY_COLORS.yellow.light
  });
  
  // Christmas Break (Dec 20 - Jan 3 of next year)
  const christmasStart = DateTime.fromObject({ year, month: 12, day: 20 }).startOf('day');
  const christmasEnd = DateTime.fromObject({ year, month: 12, day: 31 }).endOf('day');
  
  holidays.push({
    name: "Christmas Break",
    start: christmasStart,
    end: christmasEnd,
    color: HOLIDAY_COLORS.yellow.medium
  });
  
  // New Year's Week (Jan 1-7)
  const newYearStart = DateTime.fromObject({ year: year + 1, month: 1, day: 1 }).startOf('day');
  const newYearEnd = DateTime.fromObject({ year: year + 1, month: 1, day: 7 }).endOf('day');
  
  holidays.push({
    name: "New Year's Week",
    start: newYearStart,
    end: newYearEnd,
    color: HOLIDAY_COLORS.yellow.strong
  });
  
  // July 4th Week (July 1-7)
  const july4Start = DateTime.fromObject({ year, month: 7, day: 1 }).startOf('day');
  const july4End = DateTime.fromObject({ year, month: 7, day: 7 }).endOf('day');
  
  holidays.push({
    name: "July 4th Week",
    start: july4Start,
    end: july4End,
    color: HOLIDAY_COLORS.red.light
  });
  
  return holidays;
};

/**
 * Check if a date falls within any holiday period
 */
export const isHolidayDate = (date, holidays) => {
  const checkDate = DateTime.fromISO(date);
  return holidays.some(
    holiday =>
      checkDate >= holiday.start.startOf('day') &&
      checkDate <= holiday.end.endOf('day')
  );
};

