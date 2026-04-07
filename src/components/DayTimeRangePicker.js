/**
 * DayTimeRangePicker Component
 * Fast, accessible, keyboard-first day and time range selector
 * Optimized for power users scheduling multiple entries
 * 
 * Keyboard Navigation Flow:
 * 1. Tab → Day selector (type first letters, arrow keys, Enter to select)
 * 2. Tab → Start Hour (type 1-12, auto-advances to minute)
 * 3. Tab → Start Minute (type 00-59, rounds to 5-min increments, auto-advances to AM/PM)
 * 4. Tab → Start AM/PM (type A/P or use arrow keys)
 * 5. Tab → End Hour
 * 6. Tab → End Minute
 * 7. Tab → End AM/PM
 */

import React, { useState, useRef, useEffect } from 'react';
import {
  Box,
  TextField,
  FormControl,
  Select,
  MenuItem,
  Typography,
  InputLabel,
  IconButton,
  Popover,
} from '@mui/material';
import { ChevronDownIcon } from '@heroicons/react/24/outline';

const DAYS = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday'];
const MINUTE_OPTIONS = [0, 5, 10, 15, 20, 25, 30, 35, 40, 45, 50, 55];

/**
 * DayTimeRangePicker Component
 * @param {Object} props
 * @param {string} props.day - Selected day (Monday-Sunday)
 * @param {string} props.startTime - Start time in HH:mm format (24-hour)
 * @param {string} props.endTime - End time in HH:mm format (24-hour)
 * @param {Function} props.onChange - Callback (day, startTime, endTime) => void
 * @param {boolean} props.disabled - Disable all inputs
 */
const DayTimeRangePicker = ({ 
  day = '', 
  startTime = '', 
  endTime = '', 
  onChange, 
  disabled = false 
}) => {
  // Parse times into components (12-hour format for display)
  const parseTime = (time24) => {
    if (!time24) return { hour: '', minute: '', period: '' };
    const [hours, minutes] = time24.split(':').map(Number);
    const hour12 = hours % 12 || 12;
    const period = hours < 12 ? 'AM' : 'PM';
    return {
      hour: String(hour12),
      minute: String(minutes).padStart(2, '0'),
      period
    };
  };

  // Format hour/minute/period back to 24-hour format
  const formatTime24 = (hour, minute, period) => {
    if (!hour || !minute || !period) return '';
    let hour24 = parseInt(hour, 10);
    if (period === 'PM' && hour24 !== 12) hour24 += 12;
    if (period === 'AM' && hour24 === 12) hour24 = 0;
    return `${String(hour24).padStart(2, '0')}:${String(minute).padStart(2, '0')}`;
  };

  // Local state to track intermediate values while typing
  const [startHourLocal, setStartHourLocal] = useState('');
  const [startMinuteLocal, setStartMinuteLocal] = useState('');
  const [startPeriodLocal, setStartPeriodLocal] = useState('');
  const [endHourLocal, setEndHourLocal] = useState('');
  const [endMinuteLocal, setEndMinuteLocal] = useState('');
  const [endPeriodLocal, setEndPeriodLocal] = useState('');

  // Parse times from props
  const startParsed = parseTime(startTime);
  const endParsed = parseTime(endTime);

  // Use local state for display, fallback to parsed props
  const displayStartHour = startHourLocal !== '' ? startHourLocal : startParsed.hour;
  const displayStartMinute = startMinuteLocal !== '' ? startMinuteLocal : startParsed.minute;
  const displayStartPeriod = startPeriodLocal !== '' ? startPeriodLocal : startParsed.period;
  const displayEndHour = endHourLocal !== '' ? endHourLocal : endParsed.hour;
  const displayEndMinute = endMinuteLocal !== '' ? endMinuteLocal : endParsed.minute;
  const displayEndPeriod = endPeriodLocal !== '' ? endPeriodLocal : endParsed.period;

  // Sync local state from props when they change
  useEffect(() => {
    const parsed = parseTime(startTime);
    // If prop is cleared (empty string), clear local state
    if (!startTime) {
      setStartHourLocal('');
      setStartMinuteLocal('');
      setStartPeriodLocal('');
    } 
    // If prop has value and local state is empty, sync from props
    else if ((!startHourLocal && !startMinuteLocal && !startPeriodLocal) && (parsed.hour || parsed.minute || parsed.period)) {
      setStartHourLocal(parsed.hour);
      setStartMinuteLocal(parsed.minute);
      setStartPeriodLocal(parsed.period);
    }
  }, [startTime]);

  useEffect(() => {
    const parsed = parseTime(endTime);
    // If prop is cleared (empty string), clear local state
    if (!endTime) {
      setEndHourLocal('');
      setEndMinuteLocal('');
      setEndPeriodLocal('');
    }
    // If prop has value and local state is empty, sync from props
    else if ((!endHourLocal && !endMinuteLocal && !endPeriodLocal) && (parsed.hour || parsed.minute || parsed.period)) {
      setEndHourLocal(parsed.hour);
      setEndMinuteLocal(parsed.minute);
      setEndPeriodLocal(parsed.period);
    }
  }, [endTime]);

  // Refs for auto-focus advancement
  const startHourRef = useRef(null);
  const startMinuteRef = useRef(null);
  const startPeriodRef = useRef(null);
  const endHourRef = useRef(null);
  const endMinuteRef = useRef(null);
  const endPeriodRef = useRef(null);

  // Popover anchors for dropdowns
  const [startHourAnchor, setStartHourAnchor] = useState(null);
  const [startMinuteAnchor, setStartMinuteAnchor] = useState(null);
  const [endHourAnchor, setEndHourAnchor] = useState(null);
  const [endMinuteAnchor, setEndMinuteAnchor] = useState(null);
  
  // Track focus state for day selector to properly handle label
  const [dayFocused, setDayFocused] = useState(false);
  
  // Track typed keys for day selector keyboard shortcuts
  const [dayTypeBuffer, setDayTypeBuffer] = useState('');
  const dayTypeTimeoutRef = useRef(null);

  // Handle day change
  const handleDayChange = (newDay) => {
    if (onChange) {
      onChange(newDay, startTime, endTime);
    }
  };

  // Handle keyboard input for day selector
  // M = Monday, TU = Tuesday, W = Wednesday, TH = Thursday, F = Friday, SA = Saturday, SU = Sunday
  const handleDayKeyDown = (e) => {
    const key = e.key.toUpperCase();
    
    // Only handle letter keys
    if (!/^[A-Z]$/.test(key)) {
      return;
    }
    
    e.preventDefault();
    e.stopPropagation();
    
    // Clear any existing timeout
    if (dayTypeTimeoutRef.current) {
      clearTimeout(dayTypeTimeoutRef.current);
    }
    
    // Add key to buffer
    const newBuffer = dayTypeBuffer + key;
    setDayTypeBuffer(newBuffer);
    
    // Match day based on typed letters
    let matchedDay = null;
    
    if (newBuffer === 'M') {
      matchedDay = 'Monday';
    } else if (newBuffer === 'TU') {
      matchedDay = 'Tuesday';
    } else if (newBuffer === 'W') {
      matchedDay = 'Wednesday';
    } else if (newBuffer === 'TH') {
      matchedDay = 'Thursday';
    } else if (newBuffer === 'F') {
      matchedDay = 'Friday';
    } else if (newBuffer === 'SA') {
      matchedDay = 'Saturday';
    } else if (newBuffer === 'SU') {
      matchedDay = 'Sunday';
    } else if (newBuffer === 'T') {
      // Wait for second letter (TU or TH)
      matchedDay = null;
    } else if (newBuffer === 'S') {
      // Wait for second letter (SA or SU)
      matchedDay = null;
    }
    
    if (matchedDay) {
      handleDayChange(matchedDay);
      setDayTypeBuffer('');
    } else {
      // Clear buffer after 1 second of no typing
      dayTypeTimeoutRef.current = setTimeout(() => {
        setDayTypeBuffer('');
      }, 1000);
    }
  };

  // Handle blur to validate and format times
  const handleHourBlur = (isStart) => {
    const hour = isStart ? displayStartHour : displayEndHour;
    const hourNum = parseInt(hour, 10);
    if (!isNaN(hourNum)) {
      if (hourNum < 1) {
        handleTimeChange('hour', '1', isStart);
      } else if (hourNum > 12) {
        handleTimeChange('hour', '12', isStart);
      } else {
        handleTimeChange('hour', String(hourNum), isStart);
      }
    } else {
      // Clear local state if invalid
      if (isStart) {
        setStartHourLocal('');
      } else {
        setEndHourLocal('');
      }
    }
  };

  const handleMinuteBlur = (isStart) => {
    const minute = isStart ? displayStartMinute : displayEndMinute;
    const minuteNum = parseInt(minute, 10);
    if (!isNaN(minuteNum)) {
      const rounded = Math.round(minuteNum / 5) * 5;
      const formatted = String(Math.min(59, Math.max(0, rounded))).padStart(2, '0');
      handleTimeChange('minute', formatted, isStart);
    } else if (minute && minute.length === 1) {
      // Single digit - pad it
      const padded = minute.padStart(2, '0');
      const minuteNum = parseInt(padded, 10);
      if (!isNaN(minuteNum)) {
        const rounded = Math.round(minuteNum / 5) * 5;
        const formatted = String(Math.min(59, Math.max(0, rounded))).padStart(2, '0');
        handleTimeChange('minute', formatted, isStart);
      }
    } else {
      // Clear local state if invalid
      if (isStart) {
        setStartMinuteLocal('');
      } else {
        setEndMinuteLocal('');
      }
    }
  };

  // Handle time component change (no auto-advance - user must tab manually)
  const handleTimeChange = (field, value, isStart, skipAutoAdvance = false) => {
    if (isStart) {
      if (field === 'hour') {
        setStartHourLocal(value);
        // Close popover if open when valid hour entered
        const hourNum = parseInt(value, 10);
        if (!isNaN(hourNum) && hourNum >= 1 && hourNum <= 12) {
          setStartHourAnchor(null);
        }
        // Update parent only if we have complete time
        const newTime24 = formatTime24(value, displayStartMinute, displayStartPeriod);
        if (newTime24 && onChange) {
          onChange(day, newTime24, endTime);
        }
      } else if (field === 'minute') {
        setStartMinuteLocal(value);
        // Round to nearest 5-minute increment when we have a valid number
        const minuteNum = parseInt(value, 10);
        if (!isNaN(minuteNum) && value.length >= 2) {
          const rounded = Math.round(minuteNum / 5) * 5;
          const roundedValue = String(Math.min(59, Math.max(0, rounded))).padStart(2, '0');
          setStartMinuteLocal(roundedValue);
          // Close popover if open
          setStartMinuteAnchor(null);
          // Update parent with rounded value
          const newTime24 = formatTime24(displayStartHour, roundedValue, displayStartPeriod);
          if (newTime24 && onChange) {
            onChange(day, newTime24, endTime);
          }
        } else {
          // Update parent only if we have complete time
          const newTime24 = formatTime24(displayStartHour, value, displayStartPeriod);
          if (newTime24 && onChange) {
            onChange(day, newTime24, endTime);
          }
        }
      } else if (field === 'period') {
        setStartPeriodLocal(value);
        // Update parent
        const newTime24 = formatTime24(displayStartHour, displayStartMinute, value);
        if (newTime24 && onChange) {
          onChange(day, newTime24, endTime);
        }
      }
    } else {
      if (field === 'hour') {
        setEndHourLocal(value);
        // Close popover if open when valid hour entered
        const hourNum = parseInt(value, 10);
        if (!isNaN(hourNum) && hourNum >= 1 && hourNum <= 12) {
          setEndHourAnchor(null);
        }
        // Update parent only if we have complete time
        const newTime24 = formatTime24(value, displayEndMinute, displayEndPeriod);
        if (newTime24 && onChange) {
          onChange(day, startTime, newTime24);
        }
      } else if (field === 'minute') {
        setEndMinuteLocal(value);
        // Round to nearest 5-minute increment when we have a valid number
        const minuteNum = parseInt(value, 10);
        if (!isNaN(minuteNum) && value.length >= 2) {
          const rounded = Math.round(minuteNum / 5) * 5;
          const roundedValue = String(Math.min(59, Math.max(0, rounded))).padStart(2, '0');
          setEndMinuteLocal(roundedValue);
          // Close popover if open
          setEndMinuteAnchor(null);
          // Update parent with rounded value
          const newTime24 = formatTime24(displayEndHour, roundedValue, displayEndPeriod);
          if (newTime24 && onChange) {
            onChange(day, startTime, newTime24);
          }
        } else {
          // Update parent only if we have complete time
          const newTime24 = formatTime24(displayEndHour, value, displayEndPeriod);
          if (newTime24 && onChange) {
            onChange(day, startTime, newTime24);
          }
        }
      } else if (field === 'period') {
        setEndPeriodLocal(value);
        // Update parent
        const newTime24 = formatTime24(displayEndHour, displayEndMinute, value);
        if (newTime24 && onChange) {
          onChange(day, startTime, newTime24);
        }
      }
    }
  };

  // Handle keyboard input for hour (type 1-12, arrow up/down to increment/decrement)
  const handleHourKeyDown = (e, isStart) => {
    const currentHour = isStart ? displayStartHour : displayEndHour;
    const hourNum = parseInt(currentHour, 10) || 0;
    
    if (e.key === 'ArrowUp') {
      e.preventDefault();
      // Increment hour (wrap 12 -> 1) - skip auto-advance
      const newHour = hourNum >= 12 ? 1 : hourNum + 1;
      handleTimeChange('hour', String(newHour), isStart, true);
    } else if (e.key === 'ArrowDown') {
      e.preventDefault();
      // Decrement hour (wrap 1 -> 12) - skip auto-advance
      const newHour = hourNum <= 1 ? 12 : hourNum - 1;
      handleTimeChange('hour', String(newHour), isStart, true);
    } else if (/[0-9]/.test(e.key) || ['Backspace', 'Delete', 'ArrowLeft', 'ArrowRight', 'Tab'].includes(e.key)) {
      return; // Allow typing and navigation
    } else {
      e.preventDefault();
    }
  };

  // Handle keyboard input for minute (type 0-59, arrow up/down by 5-min increments)
  const handleMinuteKeyDown = (e, isStart) => {
    const currentMinute = isStart ? displayStartMinute : displayEndMinute;
    const minuteNum = parseInt(currentMinute, 10) || 0;
    
    if (e.key === 'ArrowUp') {
      e.preventDefault();
      // Increment by 5 (wrap 55 -> 0)
      const newMinute = minuteNum >= 55 ? 0 : minuteNum + 5;
      handleTimeChange('minute', String(newMinute).padStart(2, '0'), isStart);
    } else if (e.key === 'ArrowDown') {
      e.preventDefault();
      // Decrement by 5 (wrap 0 -> 55)
      const newMinute = minuteNum <= 0 ? 55 : minuteNum - 5;
      handleTimeChange('minute', String(newMinute).padStart(2, '0'), isStart);
    } else if (/[0-9]/.test(e.key) || ['Backspace', 'Delete', 'ArrowLeft', 'ArrowRight', 'Tab'].includes(e.key)) {
      return; // Allow typing and navigation
    } else {
      e.preventDefault();
    }
  };

  // Handle keyboard input for AM/PM (type A or P, arrow up/down to toggle)
  const handlePeriodKeyDown = (e, isStart) => {
    const currentPeriod = isStart ? displayStartPeriod : displayEndPeriod;
    const upperKey = e.key.toUpperCase();
    
    if (upperKey === 'A') {
      e.preventDefault();
      handleTimeChange('period', 'AM', isStart);
    } else if (upperKey === 'P') {
      e.preventDefault();
      handleTimeChange('period', 'PM', isStart);
    } else if (e.key === 'ArrowUp' || e.key === 'ArrowDown') {
      e.preventDefault();
      // Toggle between AM and PM
      const newPeriod = currentPeriod === 'AM' ? 'PM' : 'AM';
      handleTimeChange('period', newPeriod, isStart);
    } else if (!['Backspace', 'Delete', 'ArrowLeft', 'ArrowRight', 'Tab'].includes(e.key)) {
      e.preventDefault();
    }
  };

  return (
    <Box sx={{ display: 'flex', gap: 2, alignItems: 'center', flexWrap: 'wrap' }}>
      {/* Day Selector - Keyboard navigable */}
      <FormControl 
        size="small" 
        sx={{ minWidth: 180 }}
        onKeyDownCapture={handleDayKeyDown}
      >
        <InputLabel id="day-label" shrink={Boolean(day) || dayFocused}>Day</InputLabel>
        <Select
          labelId="day-label"
          value={day}
          onChange={(e) => {
            handleDayChange(e.target.value);
            setDayFocused(false);
          }}
          label="Day"
          displayEmpty
          disabled={disabled}
          onOpen={() => setDayFocused(true)}
          onClose={() => setDayFocused(Boolean(day))}
          onFocus={() => setDayFocused(true)}
          onBlur={() => {
            setDayFocused(Boolean(day));
            setDayTypeBuffer(''); // Clear buffer on blur
          }}
          inputProps={{
            'aria-label': 'Day of week (M=Mon, TU=Tue, W=Wed, TH=Thu, F=Fri, SA=Sat, SU=Sun)',
            role: 'combobox',
          }}
          notched={Boolean(day) || dayFocused}
          renderValue={(selected) => {
            if (!selected) {
              // Only show placeholder when label is shrunk (focused or has value)
              if (dayFocused || Boolean(day)) {
                return <em style={{ color: 'rgba(0, 0, 0, 0.6)' }}>Select Day</em>;
              }
              return '';
            }
            return selected;
          }}
        >
          <MenuItem value="">
            <em>Select Day</em>
          </MenuItem>
          {DAYS.map((d) => (
            <MenuItem key={d} value={d}>
              {d}
            </MenuItem>
          ))}
        </Select>
      </FormControl>

      {/* Start Time Group - Keyboard-first with typeable inputs */}
      <Box sx={{ display: 'flex', gap: 1, alignItems: 'center' }}>
        <Typography variant="body2" sx={{ fontWeight: 500, minWidth: 50 }}>Start:</Typography>
        
        {/* Start Hour - Typeable numeric input (1-12) with dropdown */}
        <Box sx={{ position: 'relative', display: 'inline-flex', alignItems: 'center' }}>
          <TextField
            inputRef={startHourRef}
            value={displayStartHour}
            onChange={(e) => {
              const value = e.target.value;
              // Allow digits, max 2 characters - don't restrict validation here, let handleTimeChange do it
              if (value === '' || /^\d{0,2}$/.test(value)) {
                handleTimeChange('hour', value, true);
              }
            }}
            onKeyDown={(e) => handleHourKeyDown(e, true)}
            onBlur={() => handleHourBlur(true)}
            placeholder="12"
            size="small"
            disabled={disabled}
            sx={{ width: 80 }}
            InputProps={{
              endAdornment: (
                <IconButton
                  size="small"
                  onClick={(e) => {
                    e.stopPropagation();
                    setStartHourAnchor(e.currentTarget);
                  }}
                  onMouseDown={(e) => {
                    e.preventDefault(); // Prevent input focus loss
                    setStartHourAnchor(e.currentTarget);
                  }}
                  disabled={disabled}
                  sx={{ p: 0.5 }}
                  tabIndex={-1}
                >
                  <ChevronDownIcon className="h-5 w-5" />
                </IconButton>
              ),
            }}
            inputProps={{
              'aria-label': 'Start hour (1-12), use arrow keys to increment/decrement',
              inputMode: 'numeric',
              pattern: '[1-9]|1[0-2]',
              maxLength: 2,
              style: { textAlign: 'center' },
            }}
          />
          <Popover
            open={Boolean(startHourAnchor)}
            anchorEl={startHourAnchor}
            onClose={() => setStartHourAnchor(null)}
            anchorOrigin={{ vertical: 'bottom', horizontal: 'left' }}
            transformOrigin={{ vertical: 'top', horizontal: 'left' }}
          >
            <Box sx={{ maxHeight: 200, overflow: 'auto', p: 0.5 }}>
              {[1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12].map((h) => (
                <MenuItem
                  key={h}
                  onClick={() => {
                    handleTimeChange('hour', String(h), true);
                    setStartHourAnchor(null);
                  }}
                  selected={displayStartHour === String(h)}
                  sx={{ py: 0.5, minWidth: 50 }}
                >
                  {String(h).padStart(2, '0')}
                </MenuItem>
              ))}
            </Box>
          </Popover>
        </Box>

        <Typography variant="body2" sx={{ color: 'text.secondary' }}>:</Typography>

        {/* Start Minute - Typeable with 5-minute rounding, dropdown shows only 5-min increments */}
        <Box sx={{ position: 'relative', display: 'inline-flex', alignItems: 'center' }}>
          <TextField
            inputRef={startMinuteRef}
            value={displayStartMinute}
            onChange={(e) => {
              const value = e.target.value;
              // Allow digits, max 2 characters
              if (value === '' || /^\d{1,2}$/.test(value)) {
                handleTimeChange('minute', value, true);
              }
            }}
            onKeyDown={(e) => handleMinuteKeyDown(e, true)}
            onBlur={() => handleMinuteBlur(true)}
            placeholder="00"
            size="small"
            disabled={disabled}
            sx={{ width: 80 }}
            InputProps={{
              endAdornment: (
                <IconButton
                  size="small"
                  onClick={(e) => {
                    e.stopPropagation();
                    setStartMinuteAnchor(e.currentTarget);
                  }}
                  onMouseDown={(e) => {
                    e.preventDefault(); // Prevent input focus loss
                    setStartMinuteAnchor(e.currentTarget);
                  }}
                  disabled={disabled}
                  sx={{ p: 0.5 }}
                  tabIndex={-1}
                >
                  <ChevronDownIcon className="h-5 w-5" />
                </IconButton>
              ),
            }}
            inputProps={{
              'aria-label': 'Start minute, use arrow keys to change by 5 minutes',
              inputMode: 'numeric',
              pattern: '[0-5][0-9]',
              maxLength: 2,
              style: { textAlign: 'center' },
            }}
          />
          <Popover
            open={Boolean(startMinuteAnchor)}
            anchorEl={startMinuteAnchor}
            onClose={() => setStartMinuteAnchor(null)}
            anchorOrigin={{ vertical: 'bottom', horizontal: 'left' }}
            transformOrigin={{ vertical: 'top', horizontal: 'left' }}
          >
            <Box sx={{ maxHeight: 200, overflow: 'auto', p: 0.5 }}>
              {MINUTE_OPTIONS.map((m) => (
                <MenuItem
                  key={m}
                  onClick={() => {
                    handleTimeChange('minute', String(m).padStart(2, '0'), true);
                    setStartMinuteAnchor(null);
                  }}
                  selected={displayStartMinute === String(m).padStart(2, '0')}
                  sx={{ py: 0.5, minWidth: 50 }}
                >
                  {String(m).padStart(2, '0')}
                </MenuItem>
              ))}
            </Box>
          </Popover>
        </Box>

        {/* Start AM/PM - Toggle via typing A/P or arrow keys */}
        <FormControl 
          size="small" 
          sx={{ minWidth: 70 }}
          onKeyDownCapture={(e) => {
            const upperKey = e.key.toUpperCase();
            if (upperKey === 'A') {
              e.preventDefault();
              e.stopPropagation();
              handleTimeChange('period', 'AM', true);
            } else if (upperKey === 'P') {
              e.preventDefault();
              e.stopPropagation();
              handleTimeChange('period', 'PM', true);
            } else if (e.key === 'ArrowUp' || e.key === 'ArrowDown') {
              e.preventDefault();
              e.stopPropagation();
              const newPeriod = displayStartPeriod === 'AM' ? 'PM' : 'AM';
              handleTimeChange('period', newPeriod, true);
            }
          }}
        >
          <Select
            inputRef={startPeriodRef}
            value={displayStartPeriod}
            onChange={(e) => handleTimeChange('period', e.target.value, true)}
            displayEmpty
            disabled={disabled}
            inputProps={{
              'aria-label': 'Start period (AM/PM), type A for AM or P for PM',
            }}
          >
            <MenuItem value="">--</MenuItem>
            <MenuItem value="AM">AM</MenuItem>
            <MenuItem value="PM">PM</MenuItem>
          </Select>
        </FormControl>
      </Box>

      <Typography variant="body2" sx={{ color: 'text.secondary', mx: 1 }}>to</Typography>

      {/* End Time Group - Keyboard-first with typeable inputs */}
      <Box sx={{ display: 'flex', gap: 1, alignItems: 'center' }}>
        <Typography variant="body2" sx={{ fontWeight: 500, minWidth: 50 }}>End:</Typography>
        
        {/* End Hour - Typeable numeric input (1-12) with dropdown */}
        <Box sx={{ position: 'relative', display: 'inline-flex', alignItems: 'center' }}>
          <TextField
            inputRef={endHourRef}
            value={displayEndHour}
            onChange={(e) => {
              const value = e.target.value;
              // Allow digits, max 2 characters - don't restrict validation here, let handleTimeChange do it
              if (value === '' || /^\d{0,2}$/.test(value)) {
                handleTimeChange('hour', value, false);
              }
            }}
            onKeyDown={(e) => handleHourKeyDown(e, false)}
            onBlur={() => handleHourBlur(false)}
            placeholder="12"
            size="small"
            disabled={disabled || !startTime}
            sx={{ width: 80 }}
            InputProps={{
              endAdornment: (
                <IconButton
                  size="small"
                  onClick={(e) => {
                    e.stopPropagation();
                    setEndHourAnchor(e.currentTarget);
                  }}
                  onMouseDown={(e) => {
                    e.preventDefault(); // Prevent input focus loss
                    setEndHourAnchor(e.currentTarget);
                  }}
                  disabled={disabled || !startTime}
                  sx={{ p: 0.5 }}
                  tabIndex={-1}
                >
                  <ChevronDownIcon className="h-5 w-5" />
                </IconButton>
              ),
            }}
            inputProps={{
              'aria-label': 'End hour (1-12), use arrow keys to increment/decrement',
              inputMode: 'numeric',
              pattern: '[1-9]|1[0-2]',
              maxLength: 2,
              style: { textAlign: 'center' },
            }}
          />
          <Popover
            open={Boolean(endHourAnchor)}
            anchorEl={endHourAnchor}
            onClose={() => setEndHourAnchor(null)}
            anchorOrigin={{ vertical: 'bottom', horizontal: 'left' }}
            transformOrigin={{ vertical: 'top', horizontal: 'left' }}
          >
            <Box sx={{ maxHeight: 200, overflow: 'auto', p: 0.5 }}>
              {[1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12].map((h) => (
                <MenuItem
                  key={h}
                  onClick={() => {
                    handleTimeChange('hour', String(h), false);
                    setEndHourAnchor(null);
                  }}
                  selected={displayEndHour === String(h)}
                  sx={{ py: 0.5, minWidth: 50 }}
                >
                  {String(h).padStart(2, '0')}
                </MenuItem>
              ))}
            </Box>
          </Popover>
        </Box>

        <Typography variant="body2" sx={{ color: 'text.secondary' }}>:</Typography>

        {/* End Minute - Typeable with 5-minute rounding, dropdown shows only 5-min increments */}
        <Box sx={{ position: 'relative', display: 'inline-flex', alignItems: 'center' }}>
          <TextField
            inputRef={endMinuteRef}
            value={displayEndMinute}
            onChange={(e) => {
              const value = e.target.value;
              // Allow digits, max 2 characters
              if (value === '' || /^\d{1,2}$/.test(value)) {
                handleTimeChange('minute', value, false);
              }
            }}
            onKeyDown={(e) => handleMinuteKeyDown(e, false)}
            onBlur={() => handleMinuteBlur(false)}
            placeholder="00"
            size="small"
            disabled={disabled || !startTime}
            sx={{ width: 80 }}
            InputProps={{
              endAdornment: (
                <IconButton
                  size="small"
                  onClick={(e) => {
                    e.stopPropagation();
                    setEndMinuteAnchor(e.currentTarget);
                  }}
                  onMouseDown={(e) => {
                    e.preventDefault(); // Prevent input focus loss
                    setEndMinuteAnchor(e.currentTarget);
                  }}
                  disabled={disabled || !startTime}
                  sx={{ p: 0.5 }}
                  tabIndex={-1}
                >
                  <ChevronDownIcon className="h-5 w-5" />
                </IconButton>
              ),
            }}
            inputProps={{
              'aria-label': 'End minute, use arrow keys to change by 5 minutes',
              inputMode: 'numeric',
              pattern: '[0-5][0-9]',
              maxLength: 2,
              style: { textAlign: 'center' },
            }}
          />
          <Popover
            open={Boolean(endMinuteAnchor)}
            anchorEl={endMinuteAnchor}
            onClose={() => setEndMinuteAnchor(null)}
            anchorOrigin={{ vertical: 'bottom', horizontal: 'left' }}
            transformOrigin={{ vertical: 'top', horizontal: 'left' }}
          >
            <Box sx={{ maxHeight: 200, overflow: 'auto', p: 0.5 }}>
              {MINUTE_OPTIONS.map((m) => (
                <MenuItem
                  key={m}
                  onClick={() => {
                    handleTimeChange('minute', String(m).padStart(2, '0'), false);
                    setEndMinuteAnchor(null);
                  }}
                  selected={displayEndMinute === String(m).padStart(2, '0')}
                  sx={{ py: 0.5, minWidth: 50 }}
                >
                  {String(m).padStart(2, '0')}
                </MenuItem>
              ))}
            </Box>
          </Popover>
        </Box>

        {/* End AM/PM - Toggle via typing A/P or arrow keys */}
        <FormControl 
          size="small" 
          sx={{ minWidth: 70 }}
          onKeyDownCapture={(e) => {
            const upperKey = e.key.toUpperCase();
            if (upperKey === 'A') {
              e.preventDefault();
              e.stopPropagation();
              handleTimeChange('period', 'AM', false);
            } else if (upperKey === 'P') {
              e.preventDefault();
              e.stopPropagation();
              handleTimeChange('period', 'PM', false);
            } else if (e.key === 'ArrowUp' || e.key === 'ArrowDown') {
              e.preventDefault();
              e.stopPropagation();
              const newPeriod = displayEndPeriod === 'AM' ? 'PM' : 'AM';
              handleTimeChange('period', newPeriod, false);
            }
          }}
        >
          <Select
            inputRef={endPeriodRef}
            value={displayEndPeriod}
            onChange={(e) => handleTimeChange('period', e.target.value, false)}
            displayEmpty
            disabled={disabled || !startTime}
            inputProps={{
              'aria-label': 'End period (AM/PM), type A for AM or P for PM',
            }}
          >
            <MenuItem value="">--</MenuItem>
            <MenuItem value="AM">AM</MenuItem>
            <MenuItem value="PM">PM</MenuItem>
          </Select>
        </FormControl>
      </Box>
    </Box>
  );
};

export default DayTimeRangePicker;
