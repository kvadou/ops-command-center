import React, { useState, useEffect } from 'react';
import {
  Box,
  Button,
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions,
  TextField,
  Radio,
  RadioGroup,
  FormControlLabel,
  Typography,
  Divider,
  IconButton,
  MenuItem,
  Select,
  FormControl,
  InputLabel,
} from '@mui/material';
import { DateTime } from 'luxon';
import { XMarkIcon, CalendarIcon, ChevronLeftIcon, ChevronRightIcon } from '@heroicons/react/24/outline';

// Default presets for historical analytics
const DEFAULT_PRESETS = [
  { group: 'Daily', presets: ['today', 'yesterday'] },
  { group: 'Weekly', presets: ['thisWeek', 'lastWeek'] },
  { group: 'Monthly', presets: ['thisMonth', 'lastMonth', 'last3Months', 'last6Months'] },
  { group: 'Yearly', presets: ['thisYear', 'lastYear'] },
  { group: 'Custom', presets: ['custom'] },
];

// Preset labels
const PRESET_LABELS = {
  today: 'Today',
  yesterday: 'Yesterday',
  thisWeek: 'This week',
  lastWeek: 'Last week',
  nextWeek: 'Next week',
  thisMonth: 'This month',
  lastMonth: 'Last month',
  last3Months: 'Last 3 months',
  last6Months: 'Last 6 months',
  next30Days: 'Next 30 days',
  next90Days: 'Next 90 days',
  thisYear: 'This year',
  lastYear: 'Last year',
  nextYear: 'Next year',
  custom: 'Custom range',
  // Fiscal year quarters (Q3=Jan-Mar, Q4=Apr-Jun, Q1=Jul-Sep, Q2=Oct-Dec)
  currentQuarter: 'This Quarter',
  lastQuarter: 'Last Quarter',
  nextQuarter: 'Next Quarter',
  // Pay cycles (1st-15th and 16th-end of month)
  currentPayCycle: 'Current Cycle',
  nextPayCycle: 'Next Cycle',
};

// Helper to get pay cycle info (1st-15th or 16th-end of month)
const getPayCycleInfo = (date) => {
  const day = date.day;
  const year = date.year;
  const month = date.month;

  if (day <= 15) {
    // First half: 1st - 15th
    return {
      start: date.set({ day: 1 }).startOf('day'),
      end: date.set({ day: 15 }).endOf('day'),
      label: `${month}/1 - ${month}/15`
    };
  } else {
    // Second half: 16th - end of month
    const endOfMonth = date.endOf('month').day;
    return {
      start: date.set({ day: 16 }).startOf('day'),
      end: date.endOf('month'),
      label: `${month}/16 - ${month}/${endOfMonth}`
    };
  }
};

// Helper to get fiscal quarter info
// FY runs Jul-Jun, so: Q1=Jul-Sep, Q2=Oct-Dec, Q3=Jan-Mar, Q4=Apr-Jun
const getFiscalQuarterInfo = (date) => {
  const month = date.month; // 1-12
  let fiscalQuarter, fiscalYear, quarterStart, quarterEnd;

  if (month >= 1 && month <= 3) {
    // Q3 FY (Jan-Mar)
    fiscalQuarter = 3;
    fiscalYear = date.year; // FY26 for Jan 2026
    quarterStart = date.set({ month: 1, day: 1 });
    quarterEnd = date.set({ month: 3, day: 31 });
  } else if (month >= 4 && month <= 6) {
    // Q4 FY (Apr-Jun)
    fiscalQuarter = 4;
    fiscalYear = date.year;
    quarterStart = date.set({ month: 4, day: 1 });
    quarterEnd = date.set({ month: 6, day: 30 });
  } else if (month >= 7 && month <= 9) {
    // Q1 FY (Jul-Sep)
    fiscalQuarter = 1;
    fiscalYear = date.year + 1; // FY27 for Jul 2026
    quarterStart = date.set({ month: 7, day: 1 });
    quarterEnd = date.set({ month: 9, day: 30 });
  } else {
    // Q2 FY (Oct-Dec)
    fiscalQuarter = 2;
    fiscalYear = date.year + 1;
    quarterStart = date.set({ month: 10, day: 1 });
    quarterEnd = date.set({ month: 12, day: 31 });
  }

  return { fiscalQuarter, fiscalYear, quarterStart, quarterEnd };
};

// Get quarter label like "Q3 FY26"
const getQuarterLabel = (fiscalQuarter, fiscalYear) => {
  const fyShort = String(fiscalYear).slice(-2);
  return `Q${fiscalQuarter} FY${fyShort}`;
};

// Get dynamic preset label (for quarterly and pay cycle presets)
const getDynamicPresetLabel = (presetKey) => {
  // Simple labels without dates - the selected range shows in the picker
  if (presetKey === 'currentQuarter') {
    return 'This Quarter';
  } else if (presetKey === 'lastQuarter') {
    return 'Last Quarter';
  } else if (presetKey === 'nextQuarter') {
    return 'Next Quarter';
  } else if (presetKey === 'currentPayCycle') {
    return 'Current Cycle';
  } else if (presetKey === 'nextPayCycle') {
    return 'Next Cycle';
  }
  return PRESET_LABELS[presetKey] || presetKey;
};

const DateRangePicker = ({ value, onChange, label = "Date Range", presets = DEFAULT_PRESETS }) => {
  const [open, setOpen] = useState(false);
  const [selectedPreset, setSelectedPreset] = useState('thisMonth');
  const [customStartDate, setCustomStartDate] = useState('');
  const [customEndDate, setCustomEndDate] = useState('');
  const [currentMonth, setCurrentMonth] = useState(DateTime.now().setZone("America/New_York"));
  const [nextMonth, setNextMonth] = useState(DateTime.now().setZone("America/New_York").plus({ months: 1 }));

  // Initialize calendar months based on current selection
  useEffect(() => {
    if (value && value.startDate && value.endDate) {
      const start = DateTime.fromISO(value.startDate);
      const end = DateTime.fromISO(value.endDate);
      
      // Set calendar to show the start date month and the next month
      setCurrentMonth(start.startOf('month'));
      // If end date is in a different month, show that month next, otherwise show next month
      if (end.month !== start.month || end.year !== start.year) {
        setNextMonth(end.startOf('month'));
      } else {
        setNextMonth(start.plus({ months: 1 }).startOf('month'));
      }
    } else {
      // Default to current month and next month
      const now = DateTime.now().setZone("America/New_York");
      setCurrentMonth(now.startOf('month'));
      setNextMonth(now.plus({ months: 1 }).startOf('month'));
    }
  }, [value, open]);

  // Calculate date ranges for presets
  const getPresetDates = (preset) => {
    const now = DateTime.now().setZone("America/New_York");
    let start, end;

    switch (preset) {
      case 'today':
        start = now.startOf('day');
        end = now.endOf('day');
        break;
      case 'yesterday':
        start = now.minus({ days: 1 }).startOf('day');
        end = now.minus({ days: 1 }).endOf('day');
        break;
      case 'todayYesterday':
        start = now.minus({ days: 1 }).startOf('day');
        end = now.endOf('day');
        break;
      case 'last7days':
        start = now.minus({ days: 6 }).startOf('day');
        end = now.endOf('day');
        break;
      case 'last14days':
        start = now.minus({ days: 13 }).startOf('day');
        end = now.endOf('day');
        break;
      case 'last28days':
        start = now.minus({ days: 27 }).startOf('day');
        end = now.endOf('day');
        break;
      case 'last30days':
        start = now.minus({ days: 29 }).startOf('day');
        end = now.endOf('day');
        break;
      case 'thisWeek':
        // This week: Sunday to Saturday
        // Luxon's startOf('week') is Monday, so we adjust to Sunday
        const thisWeekSunday = now.startOf('week').minus({ days: 1 });
        start = thisWeekSunday.startOf('day');
        end = thisWeekSunday.plus({ days: 6 }).endOf('day');
        break;
      case 'lastWeek':
        // Last week: Sunday to Saturday
        const lastWeekSunday = now.minus({ weeks: 1 }).startOf('week').minus({ days: 1 });
        start = lastWeekSunday.startOf('day');
        end = lastWeekSunday.plus({ days: 6 }).endOf('day');
        break;
      case 'nextWeek':
        // Next week: Sunday to Saturday
        const nextWeekSunday = now.plus({ weeks: 1 }).startOf('week').minus({ days: 1 });
        start = nextWeekSunday.startOf('day');
        end = nextWeekSunday.plus({ days: 6 }).endOf('day');
        break;
      case 'thisMonth':
        start = now.startOf('month');
        end = now.endOf('month');
        break;
      case 'lastMonth':
        start = now.minus({ months: 1 }).startOf('month');
        end = now.minus({ months: 1 }).endOf('month');
        break;
      case 'last3Months':
        start = now.minus({ months: 3 }).startOf('month');
        end = now.endOf('month');
        break;
      case 'last6Months':
        start = now.minus({ months: 6 }).startOf('month');
        end = now.endOf('month');
        break;
      case 'thisYear':
        start = now.startOf('year');
        end = now.endOf('year');
        break;
      case 'lastYear':
        start = now.minus({ years: 1 }).startOf('year');
        end = now.minus({ years: 1 }).endOf('year');
        break;
      case 'nextYear':
        start = now.plus({ years: 1 }).startOf('year');
        end = now.plus({ years: 1 }).endOf('year');
        break;
      case 'next30Days':
        // Tomorrow + 30 days (for forecasting, don't include today)
        start = now.plus({ days: 1 }).startOf('day');
        end = now.plus({ days: 30 }).endOf('day');
        break;
      case 'next90Days':
        // Tomorrow + 90 days (for forecasting, don't include today)
        start = now.plus({ days: 1 }).startOf('day');
        end = now.plus({ days: 90 }).endOf('day');
        break;
      case 'lifetime':
        start = now.minus({ years: 10 }).startOf('day');
        end = now.endOf('day');
        break;
      case 'currentQuarter': {
        // Current fiscal quarter - includes all dates from quarter start to quarter end
        // This captures both historical actuals AND future projections
        const currentQ = getFiscalQuarterInfo(now);
        start = currentQ.quarterStart.startOf('day');
        end = currentQ.quarterEnd.endOf('day');
        break;
      }
      case 'nextQuarter': {
        // Next fiscal quarter
        const currentQ = getFiscalQuarterInfo(now);
        // Move to first day of next quarter
        const nextQStart = currentQ.quarterEnd.plus({ days: 1 });
        const nextQ = getFiscalQuarterInfo(nextQStart);
        start = nextQ.quarterStart.startOf('day');
        end = nextQ.quarterEnd.endOf('day');
        break;
      }
      case 'lastQuarter': {
        // Previous fiscal quarter
        const currentQ = getFiscalQuarterInfo(now);
        // Move to last day of previous quarter
        const lastQEnd = currentQ.quarterStart.minus({ days: 1 });
        const lastQ = getFiscalQuarterInfo(lastQEnd);
        start = lastQ.quarterStart.startOf('day');
        end = lastQ.quarterEnd.endOf('day');
        break;
      }
      case 'currentPayCycle': {
        // Current pay cycle (1st-15th or 16th-end of month)
        const currentPC = getPayCycleInfo(now);
        start = currentPC.start;
        end = currentPC.end;
        break;
      }
      case 'nextPayCycle': {
        // Next pay cycle
        if (now.day <= 15) {
          // Currently in 1-15, next is 16-end of this month
          start = now.set({ day: 16 }).startOf('day');
          end = now.endOf('month');
        } else {
          // Currently in 16-end, next is 1-15 of next month
          const nextMonth = now.plus({ months: 1 });
          start = nextMonth.set({ day: 1 }).startOf('day');
          end = nextMonth.set({ day: 15 }).endOf('day');
        }
        break;
      }
      case 'previousPayCycle': {
        // Previous pay cycle
        if (now.day <= 15) {
          // Currently in 1-15, previous is 16-end of last month
          const lastMonth = now.minus({ months: 1 });
          start = lastMonth.set({ day: 16 }).startOf('day');
          end = lastMonth.endOf('month');
        } else {
          // Currently in 16-end, previous is 1-15 of this month
          start = now.set({ day: 1 }).startOf('day');
          end = now.set({ day: 15 }).endOf('day');
        }
        break;
      }
      case 'custom':
        // Custom dates are handled separately
        return null;
      default:
        start = now.startOf('month');
        end = now.endOf('month');
    }

    return {
      start: start.toISODate(),
      end: end.toISODate(),
      startDateTime: start,
      endDateTime: end,
    };
  };

  // Parse current value to determine preset
  useEffect(() => {
    if (value && value.startDate && value.endDate) {
      const start = DateTime.fromISO(value.startDate);
      const end = DateTime.fromISO(value.endDate);

      // Check if it matches any preset (daily, weekly, monthly, quarterly, yearly, and forward-looking presets)
      const allPresets = ['today', 'yesterday', 'thisWeek', 'lastWeek', 'nextWeek', 'thisMonth', 'lastMonth', 'last3Months', 'last6Months', 'next30Days', 'next90Days', 'currentQuarter', 'nextQuarter', 'lastQuarter', 'thisYear', 'lastYear', 'nextYear'];

      for (const preset of allPresets) {
        const presetDates = getPresetDates(preset);
        if (presetDates && presetDates.start === value.startDate && presetDates.end === value.endDate) {
          setSelectedPreset(preset);
          return;
        }
      }

      // If no match, it's custom
      setSelectedPreset('custom');
      setCustomStartDate(value.startDate);
      setCustomEndDate(value.endDate);
    }
  }, [value]);

  const handlePresetChange = (preset) => {
    setSelectedPreset(preset);
    if (preset !== 'custom') {
      const dates = getPresetDates(preset);
      if (dates) {
        onChange(dates.start, dates.end, preset);
        setOpen(false);
      }
    } else {
      // When switching to custom, preserve existing dates if available
      if (value && value.startDate && value.endDate) {
        setCustomStartDate(value.startDate);
        setCustomEndDate(value.endDate);
      }
    }
  };

  const handleCustomDateChange = (field, dateValue) => {
    if (field === 'start') {
      setCustomStartDate(dateValue);
    } else {
      setCustomEndDate(dateValue);
    }
  };

  const handleApplyCustom = () => {
    if (customStartDate && customEndDate) {
      if (DateTime.fromISO(customStartDate) <= DateTime.fromISO(customEndDate)) {
        onChange(customStartDate, customEndDate, 'custom');
        setOpen(false);
      }
    }
  };

  const handleNavigateMonth = (direction) => {
    if (!value || !value.startDate || !value.endDate) return;

    const start = DateTime.fromISO(value.startDate);
    const end = DateTime.fromISO(value.endDate);
    const currentPreset = value.preset || selectedPreset;

    // Determine navigation based on preset type
    let newStart, newEnd;

    if (['today', 'yesterday'].includes(currentPreset)) {
      // Daily presets: navigate by days
      newStart = direction === 'prev'
        ? start.minus({ days: 1 })
        : start.plus({ days: 1 });
      newEnd = direction === 'prev'
        ? end.minus({ days: 1 })
        : end.plus({ days: 1 });
    } else if (['thisWeek', 'lastWeek', 'nextWeek'].includes(currentPreset)) {
      // Weekly presets: navigate by weeks
      newStart = direction === 'prev'
        ? start.minus({ weeks: 1 })
        : start.plus({ weeks: 1 });
      newEnd = direction === 'prev'
        ? end.minus({ weeks: 1 })
        : end.plus({ weeks: 1 });
    } else if (['next30Days', 'next90Days'].includes(currentPreset)) {
      // Fixed day range presets: shift by the same number of days
      const daysDiff = Math.round(end.diff(start, 'days').days);
      newStart = direction === 'prev'
        ? start.minus({ days: daysDiff })
        : start.plus({ days: daysDiff });
      newEnd = direction === 'prev'
        ? end.minus({ days: daysDiff })
        : end.plus({ days: daysDiff });
    } else if (['currentQuarter', 'nextQuarter', 'lastQuarter'].includes(currentPreset)) {
      // Quarterly presets: navigate by fiscal quarters
      if (direction === 'prev') {
        // Move to previous quarter
        const prevQEnd = start.minus({ days: 1 });
        const prevQ = getFiscalQuarterInfo(prevQEnd);
        newStart = prevQ.quarterStart;
        newEnd = prevQ.quarterEnd;
      } else {
        // Move to next quarter
        const nextQStart = end.plus({ days: 1 });
        const nextQ = getFiscalQuarterInfo(nextQStart);
        newStart = nextQ.quarterStart;
        newEnd = nextQ.quarterEnd;
      }
    } else if (['thisMonth', 'lastMonth', 'last3Months', 'last6Months'].includes(currentPreset)) {
      // Monthly presets: navigate by months
      const isFullMonth = start.day === 1 &&
                         start.month === end.month &&
                         start.year === end.year &&
                         end.day === end.endOf('month').day;

      if (isFullMonth) {
        // Full month: navigate to previous/next full month
        newStart = direction === 'prev'
          ? start.minus({ months: 1 }).startOf('month')
          : start.plus({ months: 1 }).startOf('month');
        newEnd = newStart.endOf('month');
      } else {
        // Multi-month ranges: shift by months
        const daysDiff = end.diff(start, 'days').days;
        newStart = direction === 'prev'
          ? start.minus({ months: 1 })
          : start.plus({ months: 1 });
        newEnd = newStart.plus({ days: daysDiff });
      }
    } else if (['thisYear', 'lastYear', 'nextYear'].includes(currentPreset) || (currentPreset === 'custom' && start.day === 1 && start.month === 1 && end.month === 12 && end.day === 31)) {
      // Year presets: always navigate by full years
      newStart = direction === 'prev' 
        ? start.minus({ years: 1 }).startOf('year')
        : start.plus({ years: 1 }).startOf('year');
      newEnd = newStart.endOf('year');
    } else if (currentPreset === 'custom') {
      // Custom: detect if it's a full year or full month
      const isFullYear = start.day === 1 && start.month === 1 && end.month === 12 && end.day === 31;
      const isFullMonth = start.day === 1 && 
                         start.month === end.month && 
                         start.year === end.year &&
                         end.day === end.endOf('month').day;
      
      if (isFullYear) {
        // Full year: navigate by years
        newStart = direction === 'prev' 
          ? start.minus({ years: 1 }).startOf('year')
          : start.plus({ years: 1 }).startOf('year');
        newEnd = newStart.endOf('year');
      } else if (isFullMonth) {
        // Full month: navigate by months
        newStart = direction === 'prev' 
          ? start.minus({ months: 1 }).startOf('month')
          : start.plus({ months: 1 }).startOf('month');
        newEnd = newStart.endOf('month');
      } else {
        // Partial range: check if it's a year-to-date range (Jan 1 to some date in same year)
        const isYearToDate = start.day === 1 && start.month === 1 && end.year === start.year && 
                            !(end.month === 12 && end.day === 31);
        
        if (isYearToDate) {
          // Year-to-date: navigate by full years (convert to full year)
          newStart = direction === 'prev' 
            ? start.minus({ years: 1 }).startOf('year')
            : start.plus({ years: 1 }).startOf('year');
          newEnd = newStart.endOf('year');
        } else {
          // Other custom ranges: try to detect if it's a month range, otherwise navigate by months
          const isMonthRange = start.day === 1 && start.month === end.month && start.year === end.year;
          if (isMonthRange) {
            // Month range: navigate by full months
            newStart = direction === 'prev' 
              ? start.minus({ months: 1 }).startOf('month')
              : start.plus({ months: 1 }).startOf('month');
            newEnd = newStart.endOf('month');
          } else {
            // Other ranges: navigate by months
            const daysDiff = end.diff(start, 'days').days;
            newStart = direction === 'prev' 
              ? start.minus({ months: 1 })
              : start.plus({ months: 1 });
            newEnd = newStart.plus({ days: daysDiff });
          }
        }
      }
    } else {
      // Lifetime or unknown: maintain current behavior
      const daysDiff = end.diff(start, 'days').days;
      newStart = direction === 'prev' 
        ? start.minus({ months: 1 })
        : start.plus({ months: 1 });
      newEnd = newStart.plus({ days: daysDiff });
    }
    
    // Update the date range, preserving the preset if it's not custom
    onChange(newStart.toISODate(), newEnd.toISODate(), currentPreset === 'custom' ? 'custom' : currentPreset);
  };

  const handleMonthChange = (monthOffset) => {
    setCurrentMonth(currentMonth.plus({ months: monthOffset }));
    setNextMonth(nextMonth.plus({ months: monthOffset }));
  };

  const formatDisplayDate = (startDate, endDate) => {
    if (!startDate || !endDate) return 'Select range';

    const start = DateTime.fromISO(startDate);
    const end = DateTime.fromISO(endDate);

    // Compact numeric format: "2/1/26 – 2/28/26"
    const fmt = (d) => `${d.month}/${d.day}/${d.toFormat('yy')}`;
    return `${fmt(start)} – ${fmt(end)}`;
  };

  const getPresetCategory = (preset) => {
    // Map presets to their category names
    if (['today', 'yesterday'].includes(preset)) {
      return 'Daily';
    } else if (['thisWeek', 'lastWeek', 'nextWeek'].includes(preset)) {
      return 'Weekly';
    } else if (['thisMonth', 'lastMonth', 'last3Months', 'last6Months', 'next30Days', 'next90Days'].includes(preset)) {
      return 'Monthly';
    } else if (['currentQuarter', 'nextQuarter', 'lastQuarter'].includes(preset)) {
      // For quarterly, show the actual quarter label (e.g., "Q3 FY26")
      const now = DateTime.now().setZone("America/New_York");
      const currentQ = getFiscalQuarterInfo(now);
      if (preset === 'currentQuarter') {
        return getQuarterLabel(currentQ.fiscalQuarter, currentQ.fiscalYear);
      } else if (preset === 'nextQuarter') {
        const nextQStart = currentQ.quarterEnd.plus({ days: 1 });
        const nextQ = getFiscalQuarterInfo(nextQStart);
        return getQuarterLabel(nextQ.fiscalQuarter, nextQ.fiscalYear);
      } else if (preset === 'lastQuarter') {
        const lastQEnd = currentQ.quarterStart.minus({ days: 1 });
        const lastQ = getFiscalQuarterInfo(lastQEnd);
        return getQuarterLabel(lastQ.fiscalQuarter, lastQ.fiscalYear);
      }
      return 'Quarterly';
    } else if (['thisYear', 'lastYear', 'nextYear'].includes(preset)) {
      return 'Yearly';
    } else if (preset === 'custom') {
      return 'Custom';
    }
    return '';
  };

  const getPresetLabel = (preset) => {
    // Legacy function - kept for compatibility
    // Returns the category name for consistency
    return getPresetCategory(preset);
  };

  const renderCalendar = () => {
    const daysOfWeek = ['Su', 'Mo', 'Tu', 'We', 'Th', 'Fr', 'Sa'];
    const startOfMonth = currentMonth.startOf('month');
    const endOfMonth = currentMonth.endOf('month');
    const startOfNextMonth = nextMonth.startOf('month');
    const endOfNextMonth = nextMonth.endOf('month');
    
    const startDay = startOfMonth.weekday === 7 ? 0 : startOfMonth.weekday;
    const startDayNext = startOfNextMonth.weekday === 7 ? 0 : startOfNextMonth.weekday;
    
    // Get selected dates from value (for presets) or custom dates (for custom)
    let selectedStart = null;
    let selectedEnd = null;
    
    if (selectedPreset === 'custom') {
      selectedStart = customStartDate ? DateTime.fromISO(customStartDate) : null;
      selectedEnd = customEndDate ? DateTime.fromISO(customEndDate) : null;
    } else if (value && value.startDate && value.endDate) {
      selectedStart = DateTime.fromISO(value.startDate);
      selectedEnd = DateTime.fromISO(value.endDate);
    }
    
    const isDateInRange = (date) => {
      if (!selectedStart || !selectedEnd) return false;
      return date >= selectedStart.startOf('day') && date <= selectedEnd.startOf('day');
    };
    
    const isDateSelected = (date) => {
      if (!selectedStart || !selectedEnd) return false;
      return date.toISODate() === selectedStart.toISODate() || date.toISODate() === selectedEnd.toISODate();
    };
    
    const handleDateClick = (date) => {
      if (selectedPreset === 'custom') {
        if (!customStartDate || (customStartDate && customEndDate)) {
          // Start new selection
          setCustomStartDate(date.toISODate());
          setCustomEndDate('');
        } else if (customStartDate && !customEndDate) {
          // Complete selection
          if (date < DateTime.fromISO(customStartDate)) {
            setCustomEndDate(customStartDate);
            setCustomStartDate(date.toISODate());
          } else {
            setCustomEndDate(date.toISODate());
          }
        }
      }
    };
    
    const renderMonthCalendar = (month, startDayOffset) => {
      const daysInMonth = month.daysInMonth;
      const days = [];
      
      // Empty cells for days before month starts
      for (let i = 0; i < startDayOffset; i++) {
        days.push(<Box key={`empty-${i}`} sx={{ width: '40px', height: '40px' }} />);
      }
      
      // Days of the month
      for (let day = 1; day <= daysInMonth; day++) {
        const date = month.set({ day });
        const isSelected = isDateSelected(date);
        const inRange = isDateInRange(date);
        const isToday = date.toISODate() === DateTime.now().setZone("America/New_York").toISODate();
        
        days.push(
          <Box
            key={day}
            onClick={() => handleDateClick(date)}
            sx={{
              width: '40px',
              height: '40px',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              cursor: selectedPreset === 'custom' ? 'pointer' : 'default',
              borderRadius: '4px',
              backgroundColor: isSelected ? 'primary.main' : inRange ? 'primary.light' : 'transparent',
              color: isSelected ? 'white' : 'text.primary',
              fontWeight: isSelected ? 'bold' : isToday ? 'bold' : 'normal',
              border: isToday ? '2px solid' : 'none',
              borderColor: isToday ? 'primary.main' : 'transparent',
              opacity: selectedPreset === 'custom' ? 1 : (isDateInRange(date) || isDateSelected(date) ? 1 : 0.6),
              '&:hover': {
                backgroundColor: selectedPreset === 'custom' 
                  ? (isSelected ? 'primary.dark' : 'action.hover')
                  : (isDateInRange(date) || isDateSelected(date) ? 'primary.light' : 'transparent'),
              },
            }}
          >
            {day}
          </Box>
        );
      }
      
      return days;
    };
    
    return (
      <Box sx={{ display: 'flex', flexDirection: { xs: 'column', sm: 'row' }, gap: 2 }}>
        {/* First Calendar */}
        <Box sx={{ flex: 1, minWidth: { xs: '280px', sm: 'auto' } }}>
          <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mb: 2 }}>
            <IconButton size="small" onClick={() => handleMonthChange(-1)}>
              ←
            </IconButton>
            <Typography variant="subtitle1" fontWeight="bold">
              {currentMonth.toFormat('MMMM yyyy')}
            </Typography>
            <Box sx={{ width: '40px' }} />
          </Box>
          <Box sx={{ display: 'grid', gridTemplateColumns: 'repeat(7, 1fr)', gap: 0.5, mb: 1 }}>
            {daysOfWeek.map(day => (
              <Typography key={day} variant="caption" sx={{ textAlign: 'center', fontWeight: 'bold', color: 'text.secondary' }}>
                {day}
              </Typography>
            ))}
          </Box>
          <Box sx={{ display: 'grid', gridTemplateColumns: 'repeat(7, 1fr)', gap: 0.5 }}>
            {renderMonthCalendar(currentMonth, startDay)}
          </Box>
        </Box>
        
        {/* Second Calendar */}
        <Box sx={{ flex: 1 }}>
          <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mb: 2 }}>
            <Box sx={{ width: '40px' }} />
            <Typography variant="subtitle1" fontWeight="bold">
              {nextMonth.toFormat('MMMM yyyy')}
            </Typography>
            <IconButton size="small" onClick={() => handleMonthChange(1)}>
              →
            </IconButton>
          </Box>
          <Box sx={{ display: 'grid', gridTemplateColumns: 'repeat(7, 1fr)', gap: 0.5, mb: 1 }}>
            {daysOfWeek.map(day => (
              <Typography key={day} variant="caption" sx={{ textAlign: 'center', fontWeight: 'bold', color: 'text.secondary' }}>
                {day}
              </Typography>
            ))}
          </Box>
          <Box sx={{ display: 'grid', gridTemplateColumns: 'repeat(7, 1fr)', gap: 0.5 }}>
            {renderMonthCalendar(nextMonth, startDayNext)}
          </Box>
        </Box>
      </Box>
    );
  };

  return (
    <>
      <Box sx={{ 
        display: 'flex', 
        flexDirection: { xs: 'column', sm: 'row' },
        gap: { xs: 0.5, sm: 1 },
        alignItems: 'center',
        justifyContent: 'center',
      }}>
        {/* Preset Label - inline on desktop, above on mobile */}
        {value && value.preset && value.preset !== 'custom' && (
          <Typography 
            variant="subtitle2" 
            sx={{ 
              color: '#6B7280',
              fontSize: '0.75rem',
              fontWeight: 400,
              textTransform: 'capitalize',
              whiteSpace: 'nowrap',
              order: { xs: 0, sm: -1 }, // Show first on mobile, before date picker on desktop
            }}
          >
            {getPresetCategory(value.preset)}
          </Typography>
        )}
        {/* Date Range Picker with Arrows */}
        <Box sx={{ 
          display: 'flex', 
          alignItems: 'center', 
          gap: 0.5,
        }}>
          <IconButton
            size="small"
            onClick={(e) => {
              e.stopPropagation();
              handleNavigateMonth('prev');
            }}
            disabled={!value || !value.startDate || !value.endDate || value?.preset === 'lifetime'}
            sx={{
              color: '#374151',
              padding: '4px',
              '&:hover': {
                backgroundColor: '#F9FAFB',
              },
              '&.Mui-disabled': {
                color: '#D1D5DB',
              },
            }}
          >
            <ChevronLeftIcon className="h-4 w-4" />
          </IconButton>
          <Button
            variant="outlined"
            onClick={() => setOpen(true)}
            startIcon={<CalendarIcon className="h-4 w-4" style={{ color: '#6B7280' }} />}
            sx={{
              backgroundColor: '#FFFFFF',
              borderColor: '#E5E7EB',
              color: '#374151',
              minWidth: 'auto',
              padding: '3px 10px',
              fontSize: '0.8rem',
              fontWeight: 400,
              textTransform: 'none',
              borderRadius: '6px',
              lineHeight: 1.4,
              '&:hover': {
                backgroundColor: '#F9FAFB',
                borderColor: '#E5E7EB',
              },
              '& .MuiButton-startIcon': {
                marginRight: '8px',
              },
            }}
          >
            {formatDisplayDate(value?.startDate, value?.endDate)}
          </Button>
          <IconButton
            size="small"
            onClick={(e) => {
              e.stopPropagation();
              handleNavigateMonth('next');
            }}
            disabled={!value || !value.startDate || !value.endDate || value?.preset === 'lifetime'}
            sx={{
              color: '#374151',
              padding: '4px',
              '&:hover': {
                backgroundColor: '#F9FAFB',
              },
              '&.Mui-disabled': {
                color: '#D1D5DB',
              },
            }}
          >
            <ChevronRightIcon className="h-4 w-4" />
          </IconButton>
        </Box>
      </Box>

      <Dialog
        open={open}
        onClose={() => setOpen(false)}
        maxWidth="md"
        fullWidth
        fullScreen={false}
        PaperProps={{
          sx: {
            minHeight: { xs: 'auto', sm: '500px' },
            width: { xs: '95%', sm: '90%', md: '90%' },
            margin: { xs: '8px', sm: 'auto' },
            maxHeight: { xs: '95vh', sm: '90vh' },
          }
        }}
      >
        <DialogTitle>
          <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <Typography variant="h6">Select Date Range</Typography>
            <IconButton onClick={() => setOpen(false)} size="small">
              <XMarkIcon className="h-5 w-5" />
            </IconButton>
          </Box>
        </DialogTitle>
        <DialogContent dividers sx={{ overflowX: 'auto', maxHeight: { xs: 'calc(95vh - 120px)', sm: 'calc(90vh - 120px)' } }}>
          <Box sx={{ display: 'flex', flexDirection: { xs: 'column', sm: 'row' }, gap: 2 }}>
            {/* Left Sidebar - Presets */}
            <Box sx={{ 
              width: { xs: '100%', sm: '250px' }, 
              borderRight: { xs: 'none', sm: '1px solid' }, 
              borderBottom: { xs: '1px solid', sm: 'none' },
              borderColor: 'divider', 
              pr: { xs: 0, sm: 2 },
              pb: { xs: 2, sm: 0 },
            }}>
              <Typography variant="subtitle2" sx={{ mb: 1, fontWeight: 'bold' }}>
                Presets
              </Typography>
              <RadioGroup
                value={selectedPreset}
                onChange={(e) => handlePresetChange(e.target.value)}
              >
                {presets.map((group, idx) => (
                  <React.Fragment key={group.group}>
                    <Typography variant="subtitle2" sx={{ mt: idx === 0 ? 1 : 2, mb: 0.5, fontWeight: 'bold', color: 'text.secondary' }}>
                      {group.group}
                    </Typography>
                    {group.presets.map(presetKey => (
                      <FormControlLabel
                        key={presetKey}
                        value={presetKey}
                        control={<Radio />}
                        label={getDynamicPresetLabel(presetKey)}
                      />
                    ))}
                  </React.Fragment>
                ))}
              </RadioGroup>
            </Box>

            {/* Right Side - Calendar */}
            <Box sx={{ flex: 1, pl: 2 }}>
              <Box sx={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
                {renderCalendar()}
                {selectedPreset === 'custom' && (
                  <Box sx={{ display: 'flex', gap: 2, mt: 2 }}>
                    <TextField
                      type="date"
                      label="Start Date"
                      value={customStartDate}
                      onChange={(e) => handleCustomDateChange('start', e.target.value)}
                      InputLabelProps={{ shrink: true }}
                      fullWidth
                    />
                    <TextField
                      type="date"
                      label="End Date"
                      value={customEndDate}
                      onChange={(e) => handleCustomDateChange('end', e.target.value)}
                      InputLabelProps={{ shrink: true }}
                      fullWidth
                    />
                  </Box>
                )}
                {selectedPreset !== 'custom' && value?.startDate && value?.endDate && (
                  <Box sx={{ mt: 2, p: 2, bgcolor: 'action.hover', borderRadius: 1 }}>
                    <Typography variant="subtitle2" sx={{ fontWeight: 'bold', mb: 0.5 }}>
                      Selected Range
                    </Typography>
                    <Typography variant="body2" color="text.secondary">
                      {formatDisplayDate(value.startDate, value.endDate)}
                    </Typography>
                  </Box>
                )}
              </Box>
            </Box>
          </Box>
        </DialogContent>
        <DialogActions sx={{ px: 3, py: 2 }}>
          <Button onClick={() => setOpen(false)}>Cancel</Button>
          {selectedPreset === 'custom' ? (
            <Button
              variant="contained"
              onClick={handleApplyCustom}
              disabled={!customStartDate || !customEndDate}
            >
              Apply
            </Button>
          ) : (
            <Button variant="contained" onClick={() => setOpen(false)}>
              Close
            </Button>
          )}
        </DialogActions>
      </Dialog>
    </>
  );
};

export default DateRangePicker;

