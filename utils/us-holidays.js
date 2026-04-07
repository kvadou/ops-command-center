'use strict';

/**
 * US Holiday Calendar for anomaly classification and forward-looking planning.
 * Used to identify expected dips in completion rates during holidays/breaks.
 *
 * Includes:
 * - US federal/public holidays
 * - Market-specific public school break calendars (NYC, LA, SF)
 */

/**
 * Get the Nth weekday of a given month/year.
 * @param {number} year
 * @param {number} month - 0-indexed (0=Jan, 11=Dec)
 * @param {number} dayOfWeek - 0=Sun, 1=Mon, ... 6=Sat
 * @param {number} nth - 1-based (1=first, 2=second, etc.)
 * @returns {Date}
 */
function nthWeekday(year, month, dayOfWeek, nth) {
  const first = new Date(Date.UTC(year, month, 1));
  let dayOffset = (dayOfWeek - first.getUTCDay() + 7) % 7;
  const day = 1 + dayOffset + (nth - 1) * 7;
  return new Date(Date.UTC(year, month, day));
}

/**
 * Get the last weekday of a given month/year.
 * @param {number} year
 * @param {number} month - 0-indexed
 * @param {number} dayOfWeek - 0=Sun, 1=Mon, ... 6=Sat
 * @returns {Date}
 */
function lastWeekday(year, month, dayOfWeek) {
  const lastDay = new Date(Date.UTC(year, month + 1, 0));
  let diff = (lastDay.getUTCDay() - dayOfWeek + 7) % 7;
  return new Date(Date.UTC(year, month, lastDay.getUTCDate() - diff));
}

/**
 * Get all US holiday/break ranges for a given year.
 * Ranges are intentionally broad (week-level) since we compare against weekly buckets.
 * @param {number} year
 * @returns {Array<{name: string, start: Date, end: Date}>}
 */
function getUSHolidayRanges(year) {
  const ranges = [];

  // New Year's Week (Jan 1-7)
  ranges.push({
    name: "New Year's Week",
    start: new Date(Date.UTC(year, 0, 1)),
    end: new Date(Date.UTC(year, 0, 7)),
  });

  // MLK Day week (3rd Monday of January, +/- 3 days)
  const mlk = nthWeekday(year, 0, 1, 3); // 3rd Monday of Jan
  ranges.push({
    name: 'MLK Day Week',
    start: new Date(Date.UTC(year, 0, mlk.getUTCDate() - 3)),
    end: new Date(Date.UTC(year, 0, mlk.getUTCDate() + 3)),
  });

  // Presidents Day week (3rd Monday of February, +/- 3 days)
  const pres = nthWeekday(year, 1, 1, 3); // 3rd Monday of Feb
  ranges.push({
    name: "Presidents' Day Week",
    start: new Date(Date.UTC(year, 1, pres.getUTCDate() - 3)),
    end: new Date(Date.UTC(year, 1, pres.getUTCDate() + 3)),
  });

  // Spring Break (Mar 15 - Apr 5)
  ranges.push({
    name: 'Spring Break',
    start: new Date(Date.UTC(year, 2, 15)),
    end: new Date(Date.UTC(year, 3, 5)),
  });

  // Memorial Day week (last Monday of May, +/- 3 days)
  const memorial = lastWeekday(year, 4, 1); // last Monday of May
  ranges.push({
    name: 'Memorial Day Week',
    start: new Date(Date.UTC(year, 4, memorial.getUTCDate() - 3)),
    end: new Date(Date.UTC(year, 4, memorial.getUTCDate() + 3)),
  });

  // Summer Break (Jun 15 - Aug 31)
  ranges.push({
    name: 'Summer Break',
    start: new Date(Date.UTC(year, 5, 15)),
    end: new Date(Date.UTC(year, 7, 31)),
  });

  // July 4th Week (Jul 1-7)
  ranges.push({
    name: 'July 4th Week',
    start: new Date(Date.UTC(year, 6, 1)),
    end: new Date(Date.UTC(year, 6, 7)),
  });

  // Labor Day week (1st Monday of September, +/- 3 days)
  const labor = nthWeekday(year, 8, 1, 1); // 1st Monday of Sep
  ranges.push({
    name: 'Labor Day Week',
    start: new Date(Date.UTC(year, 8, labor.getUTCDate() - 3)),
    end: new Date(Date.UTC(year, 8, labor.getUTCDate() + 3)),
  });

  // Thanksgiving week (4th Thursday of November, Thu-Sun + travel days)
  const thanksgiving = nthWeekday(year, 10, 4, 4); // 4th Thursday of Nov
  ranges.push({
    name: 'Thanksgiving Week',
    start: new Date(Date.UTC(year, 10, thanksgiving.getUTCDate() - 3)),
    end: new Date(Date.UTC(year, 10, thanksgiving.getUTCDate() + 3)),
  });

  // Winter Break (Dec 20 - Jan 3 of next year)
  ranges.push({
    name: 'Winter Break',
    start: new Date(Date.UTC(year, 11, 20)),
    end: new Date(Date.UTC(year + 1, 0, 3)),
  });

  return ranges;
}

/**
 * Market-specific public school break calendars.
 * These are approximate dates based on typical district calendars.
 * Each entry: { name, start, end, market, type }
 * type: 'school_break' | 'public_holiday' | 'district_holiday'
 */
function getMarketSchoolBreaks(year, market) {
  const breaks = [];

  if (market === 'nyc' || market === 'all') {
    // NYC DOE Calendar
    breaks.push({
      name: 'NYC Mid-Winter Recess',
      start: new Date(Date.UTC(year, 1, 17)), // ~Feb 17
      end: new Date(Date.UTC(year, 1, 21)),   // ~Feb 21
      market: 'NYC',
      type: 'school_break',
    });
    breaks.push({
      name: 'NYC Spring Recess',
      start: new Date(Date.UTC(year, 3, 14)), // ~Apr 14
      end: new Date(Date.UTC(year, 3, 22)),   // ~Apr 22
      market: 'NYC',
      type: 'school_break',
    });
    breaks.push({
      name: 'NYC Lunar New Year',
      start: new Date(Date.UTC(year, 0, 29)), // ~Jan 29 (varies)
      end: new Date(Date.UTC(year, 0, 29)),
      market: 'NYC',
      type: 'district_holiday',
    });
    breaks.push({
      name: 'NYC Last Day of School',
      start: new Date(Date.UTC(year, 5, 26)), // ~Jun 26
      end: new Date(Date.UTC(year, 5, 26)),
      market: 'NYC',
      type: 'school_break',
    });
    breaks.push({
      name: 'NYC First Day of School',
      start: new Date(Date.UTC(year, 8, 4)),  // ~Sep 4
      end: new Date(Date.UTC(year, 8, 4)),
      market: 'NYC',
      type: 'school_break',
    });
  }

  if (market === 'la' || market === 'all') {
    // LAUSD Calendar
    breaks.push({
      name: 'LA Mid-Winter Break',
      start: new Date(Date.UTC(year, 1, 17)), // ~Feb 17
      end: new Date(Date.UTC(year, 1, 21)),
      market: 'LA',
      type: 'school_break',
    });
    breaks.push({
      name: 'LA Spring Break',
      start: new Date(Date.UTC(year, 2, 24)), // ~Mar 24
      end: new Date(Date.UTC(year, 2, 28)),
      market: 'LA',
      type: 'school_break',
    });
    breaks.push({
      name: 'LA Cesar Chavez Day',
      start: new Date(Date.UTC(year, 2, 31)), // Mar 31
      end: new Date(Date.UTC(year, 2, 31)),
      market: 'LA',
      type: 'district_holiday',
    });
    breaks.push({
      name: 'LA Winter Break',
      start: new Date(Date.UTC(year, 11, 18)), // ~Dec 18
      end: new Date(Date.UTC(year + 1, 0, 8)), // ~Jan 8
      market: 'LA',
      type: 'school_break',
    });
    breaks.push({
      name: 'LA Last Day of School',
      start: new Date(Date.UTC(year, 5, 10)), // ~Jun 10
      end: new Date(Date.UTC(year, 5, 10)),
      market: 'LA',
      type: 'school_break',
    });
  }

  if (market === 'sf' || market === 'all') {
    // SFUSD Calendar
    breaks.push({
      name: 'SF Presidents Week',
      start: new Date(Date.UTC(year, 1, 17)),
      end: new Date(Date.UTC(year, 1, 21)),
      market: 'SF',
      type: 'school_break',
    });
    breaks.push({
      name: 'SF Spring Break',
      start: new Date(Date.UTC(year, 2, 31)), // ~Mar 31
      end: new Date(Date.UTC(year, 3, 4)),    // ~Apr 4
      market: 'SF',
      type: 'school_break',
    });
    breaks.push({
      name: 'SF Winter Break',
      start: new Date(Date.UTC(year, 11, 19)), // ~Dec 19
      end: new Date(Date.UTC(year + 1, 0, 5)), // ~Jan 5
      market: 'SF',
      type: 'school_break',
    });
    breaks.push({
      name: 'SF Last Day of School',
      start: new Date(Date.UTC(year, 5, 5)),  // ~Jun 5
      end: new Date(Date.UTC(year, 5, 5)),
      market: 'SF',
      type: 'school_break',
    });
  }

  return breaks;
}

/**
 * Get combined US public holidays (single-day or short) for timeline display.
 * These are federal holidays that affect scheduling.
 * @param {number} year
 * @returns {Array<{name: string, date: Date, type: string}>}
 */
function getUSPublicHolidays(year) {
  const mlk = nthWeekday(year, 0, 1, 3);
  const pres = nthWeekday(year, 1, 1, 3);
  const memorial = lastWeekday(year, 4, 1);
  const labor = nthWeekday(year, 8, 1, 1);
  const thanksgiving = nthWeekday(year, 10, 4, 4);
  const columbus = nthWeekday(year, 9, 1, 2); // 2nd Monday of Oct

  return [
    { name: "New Year's Day", date: new Date(Date.UTC(year, 0, 1)), type: 'public_holiday' },
    { name: 'MLK Day', date: mlk, type: 'public_holiday' },
    { name: "Presidents' Day", date: pres, type: 'public_holiday' },
    { name: 'Memorial Day', date: memorial, type: 'public_holiday' },
    { name: 'Independence Day', date: new Date(Date.UTC(year, 6, 4)), type: 'public_holiday' },
    { name: 'Labor Day', date: labor, type: 'public_holiday' },
    { name: 'Columbus Day', date: columbus, type: 'public_holiday' },
    { name: 'Veterans Day', date: new Date(Date.UTC(year, 10, 11)), type: 'public_holiday' },
    { name: 'Thanksgiving', date: thanksgiving, type: 'public_holiday' },
    { name: 'Christmas Day', date: new Date(Date.UTC(year, 11, 25)), type: 'public_holiday' },
  ];
}

/**
 * Check if a week (starting on weekStartISO) overlaps any holiday range.
 * A "week" is treated as a 7-day window from the start date.
 * @param {string} weekStartISO - ISO date string (e.g., "2026-01-05")
 * @param {Array<{name: string, start: Date, end: Date}>} holidays - from getUSHolidayRanges
 * @returns {{isHoliday: boolean, holidayName: string|null}}
 */
function checkWeekOverlapsHoliday(weekStartISO, holidays) {
  const weekStart = new Date(weekStartISO + 'T00:00:00Z');
  const weekEnd = new Date(weekStart.getTime() + 6 * 24 * 60 * 60 * 1000);

  for (const holiday of holidays) {
    // Two ranges overlap if one starts before the other ends
    if (weekStart <= holiday.end && weekEnd >= holiday.start) {
      return { isHoliday: true, holidayName: holiday.name };
    }
  }

  return { isHoliday: false, holidayName: null };
}

module.exports = {
  getUSHolidayRanges,
  getUSPublicHolidays,
  getMarketSchoolBreaks,
  checkWeekOverlapsHoliday,
};
