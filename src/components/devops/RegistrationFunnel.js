import React from 'react';
import {
  Box,
  Typography,
  Paper,
  Grid,
  Chip,
  LinearProgress,
  Tooltip
} from '@mui/material';
import { ArrowTrendingDownIcon, ArrowTrendingUpIcon, ExclamationCircleIcon } from '@heroicons/react/24/outline';
import { CheckCircleIcon } from '@heroicons/react/24/solid';

/**
 * RegistrationFunnel - Visual funnel showing step-by-step progression with drop-off points
 */
export default function RegistrationFunnel({ funnelSteps = [], isLoading = false }) {
  if (isLoading) {
    return (
      <Paper sx={{ p: 3, textAlign: 'center' }}>
        <Typography color="text.secondary">Loading funnel data...</Typography>
      </Paper>
    );
  }

  if (!funnelSteps || funnelSteps.length === 0) {
    return (
      <Paper sx={{ p: 3, textAlign: 'center', bgcolor: 'grey.50' }}>
        <Typography variant="body2" color="text.secondary">
          No funnel data available
        </Typography>
      </Paper>
    );
  }

  // Find the maximum value for percentage calculations
  const maxValue = Math.max(...funnelSteps.map(step => step.views || step.starts || 0));

  const getStepLabel = (stepName) => {
    if (!stepName) return 'Unknown';
    return stepName
      .replace(/_/g, ' ')
      .replace(/\b\w/g, l => l.toUpperCase())
      .replace('Step ', '');
  };

  const getStepColor = (step, index) => {
    if (step.errors > 0) return 'error';
    if (step.dropOff > 50) return 'warning';
    if (step.completionRate > 80) return 'success';
    return 'info';
  };

  return (
    <Paper sx={{ p: 3, bgcolor: 'white', borderRadius: 2 }}>
      <Typography variant="h6" sx={{ mb: 3, fontWeight: 600 }}>
        Registration Funnel Analysis
      </Typography>

      <Box sx={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
        {funnelSteps.map((step, index) => {
          const widthPercent = maxValue > 0 
            ? ((step.views || step.starts || 0) / maxValue * 100)
            : 0;
          
          const completionPercent = step.views > 0 
            ? ((step.completes || 0) / step.views * 100)
            : 0;

          const color = getStepColor(step, index);
          const isLast = index === funnelSteps.length - 1;
          const previousStep = index > 0 ? funnelSteps[index - 1] : null;
          const previousCompletes = previousStep?.completes || previousStep?.views || 0;
          const currentStarts = step.starts || step.views || 0;
          const dropped = previousCompletes - currentStarts;

          return (
            <Box key={index}>
              {/* Step Header */}
              <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', mb: 1 }}>
                <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                  <Chip
                    label={`Step ${step.stepNumber || index + 1}`}
                    size="small"
                    color={color}
                    variant="outlined"
                  />
                  <Typography variant="subtitle2" sx={{ fontWeight: 600 }}>
                    {getStepLabel(step.stepName)}
                  </Typography>
                </Box>
                <Box sx={{ display: 'flex', alignItems: 'center', gap: 2 }}>
                  {step.errors > 0 && (
                    <Tooltip title={`${step.errors} error${step.errors !== 1 ? 's' : ''} detected`}>
                      <Chip
                        icon={<ExclamationCircleIcon className="h-4 w-4" />}
                        label={step.errors}
                        size="small"
                        color="error"
                      />
                    </Tooltip>
                  )}
                  {step.avgDuration > 0 && (
                    <Typography variant="caption" color="text.secondary">
                      Avg: {step.avgDuration}ms
                    </Typography>
                  )}
                </Box>
              </Box>

              {/* Funnel Bar */}
              <Box
                sx={{
                  position: 'relative',
                  bgcolor: 'grey.100',
                  borderRadius: 1,
                  overflow: 'hidden',
                  height: 60,
                  border: `2px solid`,
                  borderColor: color === 'error' ? 'error.main' : 
                              color === 'warning' ? 'warning.main' : 
                              color === 'success' ? 'success.main' : 'divider'
                }}
              >
                {/* Completion fill */}
                <Box
                  sx={{
                    position: 'absolute',
                    left: 0,
                    top: 0,
                    height: '100%',
                    width: `${completionPercent}%`,
                    bgcolor: color === 'error' ? 'error.light' : 
                            color === 'warning' ? 'warning.light' : 
                            color === 'success' ? 'success.light' : 'info.light',
                    transition: 'width 0.3s ease'
                  }}
                />
                
                {/* Width representation */}
                <Box
                  sx={{
                    position: 'absolute',
                    left: 0,
                    top: 0,
                    height: '100%',
                    width: `${widthPercent}%`,
                    bgcolor: 'rgba(99, 102, 241, 0.2)',
                    borderRight: '2px dashed',
                    borderColor: 'primary.main',
                    transition: 'width 0.3s ease'
                  }}
                />

                {/* Metrics overlay */}
                <Box
                  sx={{
                    position: 'absolute',
                    left: 0,
                    top: 0,
                    width: '100%',
                    height: '100%',
                    display: 'flex',
                    alignItems: 'center',
                    px: 2,
                    zIndex: 1
                  }}
                >
                  <Box sx={{ flex: 1 }}>
                    <Typography variant="body2" sx={{ fontWeight: 600 }}>
                      {step.views || step.starts || 0} views
                    </Typography>
                    <Typography variant="caption" color="text.secondary">
                      {step.completes || 0} completed ({completionPercent.toFixed(1)}%)
                    </Typography>
                  </Box>
                  {!isLast && previousCompletes > 0 && (
                    <Box sx={{ textAlign: 'right' }}>
                      {dropped > 0 && (
                        <Tooltip title={`${dropped} users dropped off (${step.dropOff.toFixed(1)}%)`}>
                          <Chip
                            icon={<ArrowTrendingDownIcon className="h-4 w-4" />}
                            label={`-${dropped} (${step.dropOff.toFixed(1)}%)`}
                            size="small"
                            color={step.dropOff > 30 ? 'error' : step.dropOff > 15 ? 'warning' : 'default'}
                            sx={{ mb: 0.5 }}
                          />
                        </Tooltip>
                      )}
                    </Box>
                  )}
                </Box>
              </Box>

              {/* Drop-off indicator arrow */}
              {!isLast && (
                <Box sx={{ display: 'flex', justifyContent: 'center', my: -0.5 }}>
                  <ArrowTrendingDownIcon
                    className="h-5 w-5"
                    style={{
                      color: step.dropOff > 30 ? '#d32f2f' : step.dropOff > 15 ? '#ed6c02' : 'rgba(0,0,0,0.54)',
                      transform: 'scaleY(1.5)'
                    }}
                  />
                </Box>
              )}
            </Box>
          );
        })}
      </Box>

      {/* Summary Stats */}
      {funnelSteps.length > 0 && (
        <Box sx={{ mt: 3, p: 2, bgcolor: 'grey.50', borderRadius: 1 }}>
          <Grid container spacing={2}>
            <Grid item xs={12} sm={4}>
              <Typography variant="caption" color="text.secondary">
                Total Funnel Entries
              </Typography>
              <Typography variant="h6" sx={{ fontWeight: 600 }}>
                {funnelSteps[0]?.views || 0}
              </Typography>
            </Grid>
            <Grid item xs={12} sm={4}>
              <Typography variant="caption" color="text.secondary">
                Final Completions
              </Typography>
              <Typography variant="h6" sx={{ fontWeight: 600, color: 'success.main' }}>
                {funnelSteps[funnelSteps.length - 1]?.completes || 0}
              </Typography>
            </Grid>
            <Grid item xs={12} sm={4}>
              <Typography variant="caption" color="text.secondary">
                Overall Conversion Rate
              </Typography>
              <Typography variant="h6" sx={{ fontWeight: 600 }}>
                {funnelSteps.length > 0 && funnelSteps[0].views > 0
                  ? ((funnelSteps[funnelSteps.length - 1]?.completes || 0) / funnelSteps[0].views * 100).toFixed(1)
                  : 0}%
              </Typography>
            </Grid>
          </Grid>
        </Box>
      )}
    </Paper>
  );
}

