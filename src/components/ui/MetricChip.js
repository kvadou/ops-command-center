import React from 'react';
import { Box, Typography } from '@mui/material';

/**
 * Compact metric chip component for displaying key-value pairs with tone-based styling
 * @param {Object} props
 * @param {string} props.label - Label text (e.g., "Revenue", "Margin")
 * @param {string|number} props.value - Value to display
 * @param {string} props.tone - Color tone: "default" | "success" | "warning" | "danger"
 */
export default function MetricChip({ label, value, tone = 'default', sx = {} }) {
  const toneStyles = {
    success: {
      bgcolor: '#d1fae5', // green-100
      color: '#065f46', // green-700
    },
    warning: {
      bgcolor: '#fef3c7', // yellow-100
      color: '#92400e', // yellow-800
    },
    danger: {
      bgcolor: '#fee2e2', // red-100
      color: '#991b1b', // red-700
    },
    default: {
      bgcolor: '#f3f4f6', // gray-100
      color: '#374151', // gray-700
    },
  };

  const styles = toneStyles[tone] || toneStyles.default;

  return (
    <Box
      sx={{
        display: 'inline-flex',
        alignItems: 'center',
        gap: 0.5,
        px: 1.5,
        py: 0.5,
        borderRadius: '6px',
        fontSize: '0.75rem',
        fontWeight: 500,
        ...styles,
        ...sx,
      }}
    >
      <Typography
        component="span"
        sx={{
          fontSize: '0.75rem',
          fontWeight: 500,
          color: 'inherit',
        }}
      >
        {label}:
      </Typography>
      <Typography
        component="span"
        sx={{
          fontSize: '0.75rem',
          fontWeight: 600,
          color: 'inherit',
        }}
      >
        {value}
      </Typography>
    </Box>
  );
}
