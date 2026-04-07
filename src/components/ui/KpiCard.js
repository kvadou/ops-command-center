import React from 'react';
import { Card, Box, Typography, IconButton } from '@mui/material';
import Tooltip from '@mui/material/Tooltip';

/**
 * Shared KPI Card component matching the style used in Marketing Analytics and Master Analytics
 * 
 * @param {string} title - The label/title for the KPI card
 * @param {string|number} value - The main value to display
 * @param {string} subtitle - Optional subtitle/auxiliary info
 * @param {string} helperText - Optional helper text explaining the metric (displayed below subtitle)
 * @param {'default'|'success'|'warning'|'danger'} tone - Color tone for the left border accent
 * @param {function} onClick - Optional click handler to make the card clickable
 * @param {ReactNode} filterIcon - Optional filter icon to display in top right corner
 * @param {ReactNode} modalIcon - Optional modal/drilldown icon to display in top right corner
 * @param {function} onFilterClick - Optional handler for filter icon click (separate from card onClick)
 */
export default function KpiCard({ title, value, subtitle, helperText, tone = 'default', onClick, filterIcon, modalIcon, onFilterClick, active = false }) {
  // Map tone to MUI theme color
  const getBorderColor = () => {
    switch (tone) {
      case 'success':
        return 'success.main';
      case 'warning':
        return 'warning.main';
      case 'danger':
        return 'error.main';
      default:
        return 'primary.main';
    }
  };

  const cardStyle = {
    height: '100%',
    bgcolor: active ? 'action.selected' : 'white',
    border: active ? '2px solid' : '1px solid',
    borderColor: active ? getBorderColor() : 'grey.200',
    borderLeft: '4px solid',
    borderLeftColor: getBorderColor(),
    borderRadius: '12px',
    p: { xs: 2, sm: 2.5 },
    boxShadow: active
      ? '0 4px 12px rgba(0, 0, 0, 0.15)'
      : '0 1px 3px 0 rgba(0, 0, 0, 0.1), 0 1px 2px 0 rgba(0, 0, 0, 0.06)',
    transition: 'all 0.2s',
    cursor: onClick ? 'pointer' : 'default',
    '&:hover': onClick ? {
      boxShadow: '0 10px 15px -3px rgba(0, 0, 0, 0.1), 0 4px 6px -2px rgba(0, 0, 0, 0.05)'
    } : {}
  };

  const labelStyle = {
    color: 'text.secondary',
    fontSize: '0.75rem',
    mb: 0.5
  };

  const valueStyle = {
    color: 'text.primary',
    fontWeight: 600,
    fontSize: { xs: '1.5rem', sm: '1.875rem' },
    lineHeight: 1.2
  };

  const subtitleStyle = {
    color: 'text.secondary',
    fontSize: '0.75rem',
    display: 'block',
    mt: 0.5
  };

  return (
    <Card 
      onClick={onClick}
      sx={cardStyle}
    >
      <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', mb: 0.5 }}>
        <Typography 
          variant="body2" 
          sx={labelStyle}
        >
          {title}
        </Typography>
        {(filterIcon || modalIcon) && (
          <Box sx={{ display: 'flex', gap: 0.5 }}>
            {filterIcon && (
              <Tooltip title="Filter by this status">
                <IconButton
                  size="small"
                  onClick={(e) => {
                    e.stopPropagation();
                    if (onFilterClick) {
                      onFilterClick(e);
                    } else if (onClick) {
                      onClick();
                    }
                  }}
                  sx={{
                    p: 0.5,
                    color: 'text.secondary',
                    '&:hover': {
                      color: 'primary.main',
                      bgcolor: 'action.hover',
                    },
                  }}
                >
                  {filterIcon}
                </IconButton>
              </Tooltip>
            )}
            {modalIcon && (
              <Tooltip title="View breakdown">
                <IconButton
                  size="small"
                  onClick={(e) => {
                    e.stopPropagation();
                    if (onClick) {
                      onClick();
                    }
                  }}
                  sx={{
                    p: 0.5,
                    color: 'text.secondary',
                    '&:hover': {
                      color: 'primary.main',
                      bgcolor: 'action.hover',
                    },
                  }}
                >
                  {modalIcon}
                </IconButton>
              </Tooltip>
            )}
          </Box>
        )}
      </Box>
      <Box sx={{ mt: 0.5, display: 'flex', alignItems: 'baseline', gap: 1 }}>
        <Typography 
          variant="h4" 
          sx={valueStyle}
        >
          {value}
        </Typography>
      </Box>
      {subtitle && (
        <Typography 
          variant="caption" 
          sx={subtitleStyle}
        >
          {subtitle}
        </Typography>
      )}
      {helperText && (
        <Typography 
          variant="caption" 
          sx={{
            ...subtitleStyle,
            mt: subtitle ? 0.5 : 0.5,
            fontSize: '0.7rem',
            color: 'text.secondary',
            opacity: 0.8,
            lineHeight: 1.4
          }}
        >
          {helperText}
        </Typography>
      )}
    </Card>
  );
}
