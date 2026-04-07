/**
 * LessonDatesCalendar Component
 * Multi-date calendar picker for selecting lesson dates
 * Allows easy selection of multiple dates and skipping over holiday weeks
 */

import React, { useState, useMemo, useEffect } from 'react';
import DatePicker from 'react-datepicker';
import 'react-datepicker/dist/react-datepicker.css';
import {
  Box,
  Button,
  Chip,
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions,
  Typography,
  IconButton,
  Paper,
  Grid,
  TextField,
} from '@mui/material';
import { MenuItem, Select, FormControl } from '@mui/material';
import { CalendarDaysIcon, XMarkIcon, ChevronLeftIcon, ChevronRightIcon } from '@heroicons/react/24/outline';
import { CheckCircleIcon } from '@heroicons/react/24/solid';

// Generate time slots like the booking form (8 AM to 8 PM, 15-minute intervals)
const generateTimeSlots = () => {
  const times = [];
  const startHour = 8;
  const endHour = 20;
  for (let h = startHour; h <= endHour; h++) {
    for (let m = 0; m < 60; m += 15) {
      const hour12 = h % 12 || 12;
      const amPm = h < 12 ? "AM" : "PM";
      const formattedTime = `${String(hour12).padStart(2, "0")}:${String(
        m
      ).padStart(2, "0")} ${amPm}`;
      times.push(formattedTime);
    }
  }
  return times;
};

// Convert 12-hour time string to 24-hour format (HH:mm)
const convertTimeTo24Hour = (timeStr) => {
  if (!timeStr || timeStr === '-') return null;
  const [time, period] = timeStr.split(' ');
  const [hour, minute] = time.split(':');
  let h24 = parseInt(hour);
  if (period === 'PM' && h24 !== 12) h24 += 12;
  if (period === 'AM' && h24 === 12) h24 = 0;
  return `${String(h24).padStart(2, '0')}:${minute}`;
};

// Get available end times based on start time (minimum 30 minutes later)
const getAvailableEndTimes = (startTime, timeSlots) => {
  if (!startTime || startTime === '-') return timeSlots;
  const startIndex = timeSlots.indexOf(startTime);
  if (startIndex === -1) return timeSlots;
  // Return times starting 2 slots (30 minutes) after the start time
  return timeSlots.slice(startIndex + 2);
};

const LessonDatesCalendar = ({ 
  selectedDates = [], 
  onChange, 
  label = "Add Lesson Dates",
  defaultStartTime: propDefaultStartTime = null,
  defaultEndTime: propDefaultEndTime = null
}) => {
  const timeSlots = useMemo(() => generateTimeSlots(), []);
  
  // Convert 24-hour format to 12-hour format for display if provided as prop
  const convert24To12Hour = (time24) => {
    if (!time24) return '';
    const [hours, minutes] = time24.split(':').map(Number);
    const hour12 = hours % 12 || 12;
    const amPm = hours < 12 ? 'AM' : 'PM';
    // Pad hour with leading zero to match timeSlots format (e.g., "01:00 PM" not "1:00 PM")
    return `${String(hour12).padStart(2, '0')}:${String(minutes).padStart(2, '0')} ${amPm}`;
  };
  
  const [defaultStartTime, setDefaultStartTime] = useState(() => {
    return propDefaultStartTime ? convert24To12Hour(propDefaultStartTime) : '';
  });
  const [defaultEndTime, setDefaultEndTime] = useState(() => {
    return propDefaultEndTime ? convert24To12Hour(propDefaultEndTime) : '';
  });
  
  // Update times when props change
  useEffect(() => {
    if (propDefaultStartTime) {
      setDefaultStartTime(convert24To12Hour(propDefaultStartTime));
    }
    if (propDefaultEndTime) {
      setDefaultEndTime(convert24To12Hour(propDefaultEndTime));
    }
  }, [propDefaultStartTime, propDefaultEndTime]);
  // Helper function to format date as YYYY-MM-DD in local timezone (not UTC)
  const formatDateToISO = (date) => {
    const year = date.getFullYear();
    const month = String(date.getMonth() + 1).padStart(2, '0');
    const day = String(date.getDate()).padStart(2, '0');
    return `${year}-${month}-${day}`;
  };

  const [open, setOpen] = useState(false);
  const [renderKey, setRenderKey] = useState(0); // Force re-render key
  const [startMonth, setStartMonth] = useState(() => {
    const today = new Date();
    return new Date(today.getFullYear(), today.getMonth(), 1);
  });
  // Store dates as ISO strings (YYYY-MM-DD) for reliable parsing
  const [tempSelectedDates, setTempSelectedDates] = useState(() => {
    // Handle case where selectedDates might be a string or invalid
    if (!selectedDates) return new Set();
    if (typeof selectedDates === 'string' && selectedDates.includes(',')) {
      // If it's a comma-separated string, split it
      const datesArray = selectedDates.split(',').map(d => d.trim()).filter(Boolean);
      return new Set(datesArray.map(d => {
        try {
          // Handle YYYY-MM-DD format directly
          if (/^\d{4}-\d{2}-\d{2}$/.test(d)) {
            return d;
          }
          const date = new Date(d);
          if (isNaN(date.getTime())) {
            return '';
          }
          date.setHours(0, 0, 0, 0);
          return formatDateToISO(date);
        } catch (e) {
          return '';
        }
      }).filter(Boolean));
    }
    if (!Array.isArray(selectedDates)) return new Set();
    
    return new Set(selectedDates.map(d => {
      try {
        // Handle YYYY-MM-DD format directly
        if (typeof d === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(d)) {
          return d;
        }
        const date = new Date(d);
        if (isNaN(date.getTime())) {
          return '';
        }
        date.setHours(0, 0, 0, 0);
        return formatDateToISO(date); // YYYY-MM-DD format in local timezone
      } catch (e) {
        return '';
      }
    }).filter(Boolean));
  });
  
  // Update tempSelectedDates when dialog opens
  useEffect(() => {
    if (open) {
      // Handle case where selectedDates might be a string or invalid
      let datesToProcess = [];
      if (!selectedDates) {
        datesToProcess = [];
      } else if (typeof selectedDates === 'string' && selectedDates.includes(',')) {
        // If it's a comma-separated string, split it
        datesToProcess = selectedDates.split(',').map(d => d.trim()).filter(Boolean);
      } else if (Array.isArray(selectedDates)) {
        datesToProcess = selectedDates;
      } else {
        datesToProcess = [];
      }
      
      const initialDates = new Set(datesToProcess.map(d => {
        try {
          // Handle YYYY-MM-DD format directly
          if (typeof d === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(d)) {
            return d;
          }
          const date = new Date(d);
          if (isNaN(date.getTime())) {
            return '';
          }
          date.setHours(0, 0, 0, 0);
          return formatDateToISO(date); // YYYY-MM-DD format in local timezone
        } catch (e) {
          return '';
        }
      }).filter(Boolean));
      setTempSelectedDates(initialDates);
      setRenderKey(0); // Reset render key when opening
      // Reset to current month when opening
      const today = new Date();
      setStartMonth(new Date(today.getFullYear(), today.getMonth(), 1));
    }
  }, [open, selectedDates]);
  

  // Format dates for display
  const formatDate = (date) => {
    try {
      // Handle YYYY-MM-DD format directly
      if (typeof date === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(date)) {
        const [year, month, day] = date.split('-').map(Number);
        const dateObj = new Date(year, month - 1, day);
        if (isNaN(dateObj.getTime())) {
          return date; // Return original string if invalid
        }
        return dateObj.toLocaleDateString('en-US', { 
          month: 'short', 
          day: 'numeric', 
          year: 'numeric' 
        });
      }
      const dateObj = new Date(date);
      if (isNaN(dateObj.getTime())) {
        return String(date); // Return string representation if invalid
      }
      return dateObj.toLocaleDateString('en-US', { 
        month: 'short', 
        day: 'numeric', 
        year: 'numeric' 
      });
    } catch (e) {
      return String(date); // Return string representation on error
    }
  };

  // Sort dates chronologically
  const sortedDates = useMemo(() => {
    // Handle case where selectedDates might be a string (comma-separated) or invalid
    if (!selectedDates || (typeof selectedDates === 'string' && selectedDates.includes(','))) {
      // If it's a comma-separated string, split it
      const datesArray = typeof selectedDates === 'string' 
        ? selectedDates.split(',').map(d => d.trim()).filter(Boolean)
        : Array.isArray(selectedDates) ? selectedDates : [];
      
      return datesArray
        .map(d => {
          try {
            // Handle YYYY-MM-DD format directly
            if (typeof d === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(d)) {
              return d;
            }
            const date = new Date(d);
            if (isNaN(date.getTime())) {
              return null;
            }
            date.setHours(0, 0, 0, 0);
            return formatDateToISO(date);
          } catch (e) {
            return null;
          }
        })
        .filter(Boolean)
        .sort();
    }
    
    // Normal case: selectedDates is an array
    if (!Array.isArray(selectedDates)) {
      return [];
    }
    
    return selectedDates
      .map(d => {
        try {
          // Handle YYYY-MM-DD format directly
          if (typeof d === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(d)) {
            return d;
          }
          const date = new Date(d);
          if (isNaN(date.getTime())) {
            return null;
          }
          date.setHours(0, 0, 0, 0);
          return formatDateToISO(date);
        } catch (e) {
          return null;
        }
      })
      .filter(Boolean)
      .sort();
  }, [selectedDates]);

  const handleDateClick = (date) => {
    // Normalize date to midnight for consistent comparison (in local timezone)
    const normalizedDate = new Date(date);
    normalizedDate.setHours(0, 0, 0, 0);
    const dateStr = formatDateToISO(normalizedDate); // YYYY-MM-DD format in local timezone
    
    // Use functional update to ensure we have the latest state
    setTempSelectedDates(prevSelected => {
      const newSelected = new Set(prevSelected);
      
      if (newSelected.has(dateStr)) {
        newSelected.delete(dateStr);
      } else {
        newSelected.add(dateStr);
      }
      
      return newSelected;
    });
    
    // Force calendar re-render by updating render key
    setRenderKey(prev => prev + 1);
  };
  
  // Calculate second month (one month after startMonth)
  const secondMonth = useMemo(() => {
    const nextMonth = new Date(startMonth);
    nextMonth.setMonth(nextMonth.getMonth() + 1);
    return nextMonth;
  }, [startMonth]);
  
  // Handle month navigation - synchronize both calendars
  const handleMonthChange = (monthsToAdd) => {
    const newStartMonth = new Date(startMonth);
    newStartMonth.setMonth(newStartMonth.getMonth() + monthsToAdd);
    setStartMonth(newStartMonth);
  };

  const handleApply = () => {
    const datesArray = Array.from(tempSelectedDates)
      .map(dateStr => {
        const date = new Date(dateStr);
        return date.toISOString().split('T')[0]; // YYYY-MM-DD format
      })
      .sort();
    
    // Include time data if provided
    const result = {
      dates: datesArray,
      startTime: convertTimeTo24Hour(defaultStartTime),
      endTime: convertTimeTo24Hour(defaultEndTime),
    };
    
    onChange(result);
    setOpen(false);
  };

  const handleClear = () => {
    setTempSelectedDates(new Set());
    onChange([]);
  };

  const handleRemoveDate = (dateToRemove) => {
    try {
      // dateToRemove is already in YYYY-MM-DD format from sortedDates
      let dateStrToRemove = '';
      if (typeof dateToRemove === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(dateToRemove)) {
        dateStrToRemove = dateToRemove;
      } else {
        const date = new Date(dateToRemove);
        if (!isNaN(date.getTime())) {
          date.setHours(0, 0, 0, 0);
          dateStrToRemove = formatDateToISO(date);
        } else {
          return; // Invalid date, can't remove
        }
      }
      
      const newSelected = new Set(tempSelectedDates);
      newSelected.delete(dateStrToRemove);
      setTempSelectedDates(newSelected);
      
      const datesArray = Array.from(newSelected)
        .map(d => {
          // d is already in YYYY-MM-DD format
          if (typeof d === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(d)) {
            return d;
          }
          try {
            const date = new Date(d);
            if (isNaN(date.getTime())) {
              return null;
            }
            date.setHours(0, 0, 0, 0);
            return formatDateToISO(date);
          } catch (e) {
            return null;
          }
        })
        .filter(Boolean)
        .sort();
      
      onChange(datesArray);
    } catch (e) {
      console.error('Error removing date:', e);
    }
  };


  return (
    <Box sx={{ mb: 2 }}>
      <Box sx={{ display: 'flex', alignItems: 'center', gap: 2, mb: 1 }}>
        <Typography variant="subtitle2" sx={{ fontWeight: 500 }}>
          {label}
        </Typography>
        <Button
          variant="outlined"
          size="small"
          startIcon={<CalendarDaysIcon className="h-5 w-5" />}
          onClick={() => {
            // Handle case where selectedDates might be a string or invalid
            let datesToProcess = [];
            if (!selectedDates) {
              datesToProcess = [];
            } else if (typeof selectedDates === 'string' && selectedDates.includes(',')) {
              // If it's a comma-separated string, split it
              datesToProcess = selectedDates.split(',').map(d => d.trim()).filter(Boolean);
            } else if (Array.isArray(selectedDates)) {
              datesToProcess = selectedDates;
            } else {
              datesToProcess = [];
            }
            
            const initialDates = new Set(datesToProcess.map(d => {
              try {
                // Handle YYYY-MM-DD format directly
                if (typeof d === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(d)) {
                  return d;
                }
                const date = new Date(d);
                if (isNaN(date.getTime())) {
                  return '';
                }
                date.setHours(0, 0, 0, 0);
                return formatDateToISO(date);
              } catch (e) {
                return '';
              }
            }).filter(Boolean));
            setTempSelectedDates(initialDates);
            setOpen(true);
          }}
        >
          {(() => {
            // Handle case where selectedDates might be a string or invalid
            let datesCount = 0;
            if (!selectedDates) {
              datesCount = 0;
            } else if (typeof selectedDates === 'string' && selectedDates.includes(',')) {
              datesCount = selectedDates.split(',').filter(d => d.trim()).length;
            } else if (Array.isArray(selectedDates)) {
              datesCount = selectedDates.length;
            }
            return datesCount > 0 ? `${datesCount} dates selected` : 'Select Dates';
          })()}
        </Button>
      </Box>

      {/* Display selected dates as chips */}
      {sortedDates.length > 0 && (
        <Box sx={{ display: 'flex', flexWrap: 'wrap', gap: 1, mt: 1 }}>
          {sortedDates.map((date) => (
            <Chip
              key={date}
              label={formatDate(date)}
              onDelete={() => handleRemoveDate(date)}
              color="primary"
              size="small"
              icon={<CheckCircleIcon className="h-4 w-4" />}
            />
          ))}
        </Box>
      )}

      <Dialog
        open={open}
        onClose={() => setOpen(false)}
        maxWidth="sm"
        fullWidth
        PaperProps={{
          sx: {
            borderRadius: 2,
          }
        }}
      >
        <DialogTitle>
          <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
            <Typography variant="h6">Select Lesson Dates</Typography>
            <IconButton size="small" onClick={() => setOpen(false)}>
              <XMarkIcon className="h-5 w-5" />
            </IconButton>
          </Box>
          <Typography variant="body2" color="text.secondary" sx={{ mt: 1 }}>
            <strong>Click dates to select multiple lesson dates.</strong> Selected dates are highlighted in purple and will be added to the job.
          </Typography>
        </DialogTitle>
        <DialogContent>
          {/* Default Time Selection - Same as booking form */}
          <Box sx={{ mb: 3, p: 2, bgcolor: '#f5f5f5', borderRadius: 2 }}>
            <Typography variant="subtitle2" sx={{ mb: 2, fontWeight: 600 }}>
              Default Lesson Time (applies to all selected dates)
            </Typography>
            <Box sx={{ display: 'flex', gap: 2, alignItems: 'center', flexWrap: 'wrap' }}>
              {/* Start Time */}
              <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                <Typography variant="body2" sx={{ fontWeight: 500 }}>Start:</Typography>
                <FormControl size="small" sx={{ minWidth: 160 }}>
                  <Select
                    value={defaultStartTime}
                    onChange={(e) => {
                      setDefaultStartTime(e.target.value);
                      // Reset end time if it's before the new start time
                      if (defaultEndTime && e.target.value !== '-') {
                        const availableEndTimes = getAvailableEndTimes(e.target.value, timeSlots);
                        if (!availableEndTimes.includes(defaultEndTime)) {
                          setDefaultEndTime('');
                        }
                      }
                    }}
                    displayEmpty
                  >
                    <MenuItem value="">Please Select</MenuItem>
                    {timeSlots.map((time) => (
                      <MenuItem key={time} value={time}>
                        {time}
                      </MenuItem>
                    ))}
                  </Select>
                </FormControl>
              </Box>

              <Typography variant="body2" sx={{ color: 'text.secondary', mx: 1 }}>to</Typography>

              {/* End Time */}
              <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                <Typography variant="body2" sx={{ fontWeight: 500 }}>End:</Typography>
                <FormControl size="small" sx={{ minWidth: 160 }}>
                  <Select
                    value={defaultEndTime}
                    onChange={(e) => setDefaultEndTime(e.target.value)}
                    displayEmpty
                  >
                    <MenuItem value="">Please Select</MenuItem>
                    {getAvailableEndTimes(defaultStartTime, timeSlots).map((time) => (
                      <MenuItem key={time} value={time}>
                        {time}
                      </MenuItem>
                    ))}
                  </Select>
                </FormControl>
              </Box>
            </Box>
          </Box>

            {/* Force re-render when selected dates change */}
            <Box key={`calendars-container-${Array.from(tempSelectedDates).sort().join(',')}-${renderKey}`} sx={{ display: 'flex', justifyContent: 'center', my: 2, flexWrap: 'wrap', gap: 3 }}>
              <Box key={`calendar-1-${renderKey}-${tempSelectedDates.size}`} sx={{ position: 'relative' }}>
                <DatePicker
                  key={`datepicker-1-${renderKey}-${tempSelectedDates.size}`}
                  selected={null}
                  openToDate={startMonth}
                  onChange={(date) => {
                    if (!date) return;
                    const today = new Date();
                    today.setHours(0, 0, 0, 0);
                    const clickDate = new Date(date);
                    clickDate.setHours(0, 0, 0, 0);
                    if (clickDate >= today) {
                      handleDateClick(clickDate);
                    }
                  }}
                  inline
                  calendarStartDay={0} // Start week on Sunday
                  minDate={new Date()} // Can't select past dates
                  dateFormat="MM/dd/yyyy"
                  dayClassName={(date) => {
                    try {
                      const normalizedDate = new Date(date);
                      normalizedDate.setHours(0, 0, 0, 0);
                      const dateStr = formatDateToISO(normalizedDate); // YYYY-MM-DD format in local timezone
                      const today = new Date();
                      today.setHours(0, 0, 0, 0);
                      const isPast = normalizedDate < today;
                      // Create a fresh check against current state
                      const isSelected = tempSelectedDates.has(dateStr);
                      
                      if (isSelected) return 'selected-date';
                      if (isPast) return 'past-date';
                      return '';
                    } catch (e) {
                      return '';
                    }
                  }}
                  onMonthChange={(date) => {
                    const newStart = new Date(date.getFullYear(), date.getMonth(), 1);
                    setStartMonth(newStart);
                  }}
                />
                {/* Custom navigation arrow - left (only show if not current month) */}
                {(() => {
                  const today = new Date();
                  const currentMonthStart = new Date(today.getFullYear(), today.getMonth(), 1);
                  const isCurrentMonth = startMonth.getTime() === currentMonthStart.getTime();
                  if (!isCurrentMonth) {
                    return (
                      <IconButton
                        onClick={() => {
                          const newStart = new Date(startMonth);
                          newStart.setMonth(newStart.getMonth() - 1);
                          setStartMonth(newStart);
                        }}
                        sx={{
                          position: 'absolute',
                          left: 8,
                          top: 8,
                          backgroundColor: 'rgba(255, 255, 255, 0.2)',
                          color: 'white',
                          '&:hover': { backgroundColor: 'rgba(255, 255, 255, 0.3)' },
                          zIndex: 10,
                        }}
                        size="small"
                      >
                        <ChevronLeftIcon className="h-5 w-5" />
                      </IconButton>
                    );
                  }
                  return null;
                })()}
              </Box>
              <Box key={`calendar-2-${renderKey}-${tempSelectedDates.size}`} sx={{ position: 'relative' }}>
                <DatePicker
                  key={`datepicker-2-${renderKey}-${tempSelectedDates.size}`}
                  selected={null}
                  openToDate={secondMonth}
                  onChange={(date) => {
                    if (!date) return;
                    const today = new Date();
                    today.setHours(0, 0, 0, 0);
                    const clickDate = new Date(date);
                    clickDate.setHours(0, 0, 0, 0);
                    if (clickDate >= today) {
                      handleDateClick(clickDate);
                    }
                  }}
                  inline
                  calendarStartDay={0} // Start week on Sunday
                  minDate={new Date()} // Can't select past dates
                  dateFormat="MM/dd/yyyy"
                  dayClassName={(date) => {
                    try {
                      const normalizedDate = new Date(date);
                      normalizedDate.setHours(0, 0, 0, 0);
                      const dateStr = formatDateToISO(normalizedDate); // YYYY-MM-DD format in local timezone
                      const today = new Date();
                      today.setHours(0, 0, 0, 0);
                      const isPast = normalizedDate < today;
                      // Create a fresh check against current state
                      const isSelected = tempSelectedDates.has(dateStr);
                      
                      if (isSelected) return 'selected-date';
                      if (isPast) return 'past-date';
                      return '';
                    } catch (e) {
                      return '';
                    }
                  }}
                  onMonthChange={(date) => {
                    // When second calendar month changes, update startMonth to keep them consecutive
                    const newStart = new Date(date.getFullYear(), date.getMonth() - 1, 1);
                    setStartMonth(newStart);
                  }}
                />
                {/* Custom navigation arrow - right (always show) */}
                <IconButton
                  onClick={() => {
                    const newStart = new Date(startMonth);
                    newStart.setMonth(newStart.getMonth() + 1);
                    setStartMonth(newStart);
                  }}
                  sx={{
                    position: 'absolute',
                    right: 8,
                    top: 8,
                    backgroundColor: 'rgba(255, 255, 255, 0.2)',
                    color: 'white',
                    '&:hover': { backgroundColor: 'rgba(255, 255, 255, 0.3)' },
                    zIndex: 10,
                  }}
                  size="small"
                >
                  <ChevronRightIcon className="h-5 w-5" />
                </IconButton>
              </Box>
            </Box>

          {/* Selected dates summary - Always show, even if empty */}
          <Paper 
            sx={{ 
              p: 2, 
              mt: 3, 
              bgcolor: tempSelectedDates.size > 0 ? '#f0f4ff' : '#fafafa',
              border: tempSelectedDates.size > 0 ? '2px solid #6A469D' : '1px solid #e0e0e0',
              borderRadius: 2
            }}
          >
            <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, mb: 1 }}>
              <CheckCircleIcon
                className="h-5 w-5"
                style={{ color: tempSelectedDates.size > 0 ? '#6A469D' : '#ccc' }}
              />
              <Typography variant="subtitle2" sx={{ fontWeight: 600 }}>
                Selected Lesson Dates ({tempSelectedDates.size}):
              </Typography>
            </Box>
            {(() => {
              const datesArray = Array.from(tempSelectedDates);
              
              if (tempSelectedDates.size > 0) {
                return (
                  <>
                    <Typography variant="body2" color="text.secondary" sx={{ mb: 1.5 }}>
                      These dates will be added to the job as future lessons:
                    </Typography>
                    <Box sx={{ display: 'flex', flexWrap: 'wrap', gap: 1 }}>
                      {datesArray
                        .map(dateStr => {
                          // dateStr is in YYYY-MM-DD format
                          try {
                            const date = new Date(dateStr + 'T00:00:00'); // Add time to ensure correct parsing
                            if (isNaN(date.getTime())) {
                              return null;
                            }
                            return { dateStr, date };
                          } catch (e) {
                            return null;
                          }
                        })
                        .filter(item => item !== null)
                        .sort((a, b) => a.date - b.date)
                        .map(({ dateStr, date }, idx) => (
                          <Chip
                            key={`${dateStr}-${idx}`}
                            label={formatDate(date)}
                            size="small"
                            color="primary"
                            icon={<CheckCircleIcon className="h-4 w-4" />}
                            onDelete={() => {
                              setTempSelectedDates(prevSelected => {
                                const newSelected = new Set(prevSelected);
                                newSelected.delete(dateStr);
                                setRenderKey(prev => prev + 1);
                                return newSelected;
                              });
                            }}
                            sx={{
                              backgroundColor: '#6A469D',
                              color: 'white',
                              '& .MuiChip-deleteIcon': {
                                color: 'white',
                                '&:hover': {
                                  color: '#ffebee',
                                }
                              }
                            }}
                          />
                        ))}
                    </Box>
                  </>
                );
              } else {
                return (
                  <Typography variant="body2" color="text.secondary" sx={{ fontStyle: 'italic' }}>
                    No dates selected yet. Click dates on the calendars above to add lesson dates.
                  </Typography>
                );
              }
            })()}
          </Paper>
        </DialogContent>
        <DialogActions sx={{ px: 3, pb: 2 }}>
          <Button onClick={handleClear} color="error" disabled={tempSelectedDates.size === 0}>
            Clear All
          </Button>
          <Box sx={{ flex: 1 }} />
          <Button onClick={() => setOpen(false)}>
            Cancel
          </Button>
          <Button
            onClick={handleApply}
            variant="contained"
            color="primary"
            disabled={tempSelectedDates.size === 0}
          >
            Apply ({tempSelectedDates.size} dates)
          </Button>
        </DialogActions>
      </Dialog>

      <style>{`
        .react-datepicker {
          font-family: 'Poppins', sans-serif;
          border: 1px solid #e0e0e0;
          border-radius: 8px;
        }
        .react-datepicker__month-container {
          padding: 8px;
        }
        .react-datepicker__header {
          background-color: #6A469D;
          border-bottom: none;
          border-radius: 8px 8px 0 0;
          position: relative;
          padding: 8px 0;
        }
        .react-datepicker__current-month {
          color: white;
          font-weight: 600;
        }
        /* Ensure day names container is visible */
        .react-datepicker__day-names {
          display: flex !important;
          justify-content: space-around !important;
          margin-bottom: 8px !important;
          visibility: visible !important;
        }
        /* Custom day name labels - show single letters */
        /* When calendar starts on Sunday (calendarStartDay={0}), the order is: S, M, T, W, T, F, S */
        .react-datepicker__day-name {
          color: white !important;
          font-weight: 600 !important;
          width: 36px !important;
          line-height: 36px !important;
          font-size: 0 !important; /* Hide original text */
          text-align: center !important;
          position: relative !important;
          visibility: visible !important;
          display: inline-block !important;
        }
        .react-datepicker__day-name::after {
          content: '';
          visibility: visible !important;
          position: absolute;
          left: 50%;
          top: 50%;
          transform: translate(-50%, -50%);
          font-size: 11px !important;
          font-weight: 600 !important;
          color: white !important;
          line-height: 1;
          display: block !important;
        }
        .react-datepicker__day-name:nth-child(1)::after {
          content: 'S';
        }
        .react-datepicker__day-name:nth-child(2)::after {
          content: 'M';
        }
        .react-datepicker__day-name:nth-child(3)::after {
          content: 'T';
        }
        .react-datepicker__day-name:nth-child(4)::after {
          content: 'W';
        }
        .react-datepicker__day-name:nth-child(5)::after {
          content: 'T';
        }
        .react-datepicker__day-name:nth-child(6)::after {
          content: 'F';
        }
        .react-datepicker__day-name:nth-child(7)::after {
          content: 'S';
        }
        /* Hide default navigation arrows */
        .react-datepicker__navigation {
          display: none !important;
        }
        .react-datepicker__day {
          border-radius: 4px;
          margin: 2px;
          transition: all 0.2s ease;
        }
        .react-datepicker__day:hover:not(.past-date) {
          border-radius: 4px;
          background-color: #e0e0e0;
        }
        .react-datepicker__day.selected-date {
          background-color: #6A469D !important;
          color: white !important;
          font-weight: bold !important;
          border: 2px solid #5a3a8d !important;
          border-radius: 4px !important;
        }
        .react-datepicker__day.selected-date:hover {
          background-color: #5a3a8d !important;
          color: white !important;
        }
        .react-datepicker__day:not(.past-date):not(.selected-date) {
          cursor: pointer;
        }
        .react-datepicker__day:not(.past-date):not(.selected-date):hover {
          background-color: #e0e0e0 !important;
          border-radius: 4px;
        }
        .react-datepicker__day--selected.selected-date,
        .react-datepicker__day--keyboard-selected.selected-date {
          background-color: #6A469D !important;
          color: white !important;
        }
        .react-datepicker__day.past-date {
          color: #ccc;
          cursor: not-allowed;
          opacity: 0.5;
        }
        .react-datepicker__day.past-date:hover {
          background-color: transparent;
        }
      `}</style>
    </Box>
  );
};

export default LessonDatesCalendar;
