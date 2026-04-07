import React, { useState } from 'react';
import {
  Box,
  TextField,
  Chip,
  Autocomplete,
  Paper,
  Button,
  IconButton,
  Tooltip,
  Menu,
  MenuItem
} from '@mui/material';
import { FunnelIcon, XMarkIcon, MagnifyingGlassIcon } from '@heroicons/react/24/outline';
import { CheckCircleIcon } from '@heroicons/react/24/solid';

/**
 * EnhancedFilters - Datadog-style multiselect filters with chips
 */
export default function EnhancedFilters({
  filters = {},
  onFiltersChange,
  options = {
    status: ['open', 'acknowledged', 'resolved', 'dismissed'],
    severity: ['critical', 'high', 'medium', 'low'],
    environment: ['main', 'westside', 'eastside'],
    alert_type: ['error', 'payment_failure', 'performance', 'warning'],
    source: []
  },
  searchPlaceholder = 'Search alerts...',
  showSearch = true
}) {
  const [searchQuery, setSearchQuery] = useState('');
  const [timeRangeMenu, setTimeRangeMenu] = useState(null);

  const timeRanges = [
    { label: 'Last 24 hours', value: '24h' },
    { label: 'Last 7 days', value: '7d' },
    { label: 'Last 30 days', value: '30d' },
    { label: 'Last 90 days', value: '90d' },
    { label: 'All time', value: 'all' }
  ];

  const handleFilterChange = (key, values) => {
    onFiltersChange({
      ...filters,
      [key]: values
    });
  };

  const removeFilter = (key, value) => {
    const current = filters[key] || [];
    handleFilterChange(key, current.filter(v => v !== value));
  };

  const clearAllFilters = () => {
    const cleared = {};
    Object.keys(filters).forEach(key => {
      cleared[key] = [];
    });
    onFiltersChange(cleared);
    setSearchQuery('');
  };

  const getActiveFilterCount = () => {
    return Object.values(filters).reduce((sum, arr) => sum + (Array.isArray(arr) ? arr.length : 0), 0);
  };

  const hasActiveFilters = getActiveFilterCount() > 0 || searchQuery;

  return (
    <Paper
      elevation={0}
      sx={{
        p: 2,
        mb: 2,
        border: '1px solid',
        borderColor: 'divider',
        borderRadius: 2,
        background: 'white'
      }}
    >
      <Box sx={{ display: 'flex', flexWrap: 'wrap', gap: 2, alignItems: 'center' }}>
        {showSearch && (
          <TextField
            placeholder={searchPlaceholder}
            value={searchQuery}
            onChange={(e) => {
              setSearchQuery(e.target.value);
              onFiltersChange({ ...filters, search: e.target.value });
            }}
            size="small"
            sx={{ 
              minWidth: 250,
              '& .MuiOutlinedInput-root': {
                borderRadius: 1.5
              }
            }}
            InputProps={{
              startAdornment: <MagnifyingGlassIcon className="h-5 w-5" style={{ marginRight: 8, color: 'rgba(0,0,0,0.54)' }} />
            }}
          />
        )}

        {Object.entries(options).map(([key, optionList]) => {
          if (!optionList || optionList.length === 0) return null;
          
          const selected = filters[key] || [];
          
          return (
            <Autocomplete
              key={key}
              multiple
              options={optionList}
              value={selected}
              onChange={(event, newValue) => handleFilterChange(key, newValue)}
              renderInput={(params) => (
                <TextField
                  {...params}
                  label={key.replace(/_/g, ' ').replace(/\b\w/g, l => l.toUpperCase())}
                  size="small"
                  sx={{ 
                    minWidth: 150,
                    '& .MuiOutlinedInput-root': {
                      borderRadius: 1.5
                    }
                  }}
                />
              )}
              renderTags={(value, getTagProps) =>
                value.map((option, index) => (
                  <Chip
                    {...getTagProps({ index })}
                    key={option}
                    label={option}
                    size="small"
                    sx={{ borderRadius: 1 }}
                  />
                ))
              }
              renderOption={(props, option) => (
                <MenuItem
                  {...props}
                  key={option}
                  selected={selected.includes(option)}
                >
                  <CheckCircleIcon
                    className="h-4 w-4"
                    style={{
                      marginRight: 8,
                      opacity: selected.includes(option) ? 1 : 0
                    }}
                  />
                  {option}
                </MenuItem>
              )}
            />
          );
        })}

        <Button
          onClick={(e) => setTimeRangeMenu(e.currentTarget)}
          size="small"
          startIcon={<FunnelIcon className="h-5 w-5" />}
          sx={{ 
            borderRadius: 1.5,
            textTransform: 'none',
            px: 2
          }}
        >
          Time Range
        </Button>

        {hasActiveFilters && (
          <Tooltip title="Clear all filters">
            <IconButton
              onClick={clearAllFilters}
              size="small"
              sx={{ 
                borderRadius: 1,
                border: '1px solid',
                borderColor: 'divider'
              }}
            >
              <XMarkIcon className="h-5 w-5" />
            </IconButton>
          </Tooltip>
        )}

        {hasActiveFilters && (
          <Chip
            label={`${getActiveFilterCount()} filter${getActiveFilterCount() !== 1 ? 's' : ''}`}
            size="small"
            color="primary"
            sx={{ borderRadius: 1 }}
          />
        )}
      </Box>

      {/* Active filter chips */}
      {hasActiveFilters && (
        <Box sx={{ display: 'flex', flexWrap: 'wrap', gap: 1, mt: 2 }}>
          {Object.entries(filters).map(([key, values]) => {
            if (!Array.isArray(values) || values.length === 0) return null;
            return values.map((value) => (
              <Chip
                key={`${key}-${value}`}
                label={`${key.replace(/_/g, ' ')}: ${value}`}
                onDelete={() => removeFilter(key, value)}
                size="small"
                sx={{ borderRadius: 1 }}
              />
            ));
          })}
          {searchQuery && (
            <Chip
              label={`Search: ${searchQuery}`}
              onDelete={() => {
                setSearchQuery('');
                onFiltersChange({ ...filters, search: '' });
              }}
              size="small"
              sx={{ borderRadius: 1 }}
            />
          )}
        </Box>
      )}

      {/* Time range menu */}
      <Menu
        anchorEl={timeRangeMenu}
        open={Boolean(timeRangeMenu)}
        onClose={() => setTimeRangeMenu(null)}
      >
        {timeRanges.map((range) => (
          <MenuItem
            key={range.value}
            onClick={() => {
              onFiltersChange({ ...filters, timeRange: range.value });
              setTimeRangeMenu(null);
            }}
            selected={filters.timeRange === range.value}
          >
            {range.label}
          </MenuItem>
        ))}
      </Menu>
    </Paper>
  );
}

