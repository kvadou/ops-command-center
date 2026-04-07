import React from 'react';
import { Card, CardContent, Box, Typography, Chip, Tooltip } from '@mui/material';
import { LineChart, Line, ResponsiveContainer, Area, AreaChart, XAxis, YAxis, Tooltip as RechartsTooltip } from 'recharts';
import { ArrowTrendingUpIcon, ArrowTrendingDownIcon, ArrowRightIcon } from '@heroicons/react/24/outline';

/**
 * MetricCard - Enterprise-style metric card with sparkline and trend indicator
 * Similar to Datadog/Vercel dashboards
 */
export default function MetricCard({
  title,
  value,
  subtitle,
  trend = null, // { direction: 'up'|'down'|'flat', percentage: number, period: string }
  sparklineData = [], // Array of { time: string, value: number }
  status = 'normal', // 'normal' | 'warning' | 'error' | 'success'
  icon,
  onClick,
  height = 160,
  showSparkline = true,
  formatValue = (v) => {
    if (v === null || v === undefined) return '0';
    if (typeof v === 'string') {
      // If it's already a formatted string, return as-is
      if (v.includes('%') || v.includes('ms') || v.includes('$')) return v;
      // Otherwise try to parse as number
      const num = parseFloat(v);
      return isNaN(num) ? v : num.toLocaleString();
    }
    if (typeof v === 'number') {
      return v.toLocaleString();
    }
    return String(v);
  },
  isLoading = false
}) {
  const getTrendIcon = () => {
    if (!trend) return null;
    const Icon = trend.direction === 'up' ? ArrowTrendingUpIcon :
                 trend.direction === 'down' ? ArrowTrendingDownIcon : ArrowRightIcon;
    const color = trend.direction === 'up' ? '#10b981' :
                  trend.direction === 'down' ? '#ef4444' : '#6b7280';
    return <Icon className="h-4 w-4" style={{ color }} />;
  };

  const getStatusColor = () => {
    switch (status) {
      case 'error': return '#ef4444';
      case 'warning': return '#f59e0b';
      case 'success': return '#10b981';
      default: return '#6366f1';
    }
  };

  // Generate mock sparkline data if none provided, or enhance existing data
  const chartData = React.useMemo(() => {
    if (sparklineData.length > 0) {
      // Enhance sparkline data with smoothing and better density
      const enhanced = sparklineData.map((point, index) => {
        // Simple moving average smoothing (window of 3)
        const window = 3;
        const start = Math.max(0, index - Math.floor(window / 2));
        const end = Math.min(sparklineData.length, index + Math.ceil(window / 2));
        const slice = sparklineData.slice(start, end);
        const avg = slice.reduce((sum, p) => sum + (p.value || 0), 0) / slice.length;
        
        return {
          ...point,
          value: point.value || 0,
          smoothed: index === 0 || index === sparklineData.length - 1 
            ? (point.value || 0) 
            : avg * 0.7 + (point.value || 0) * 0.3 // Weighted average
        };
      });
      
      return enhanced;
    }
    
    // Generate mock data with better density (24 points instead of 12)
    return Array.from({ length: 24 }, (_, i) => ({ 
      time: i, 
      value: Math.random() * 100 + (value || 0) * 0.9,
      smoothed: (value || 0) * 0.9
    }));
  }, [sparklineData, value]);

  return (
    <Card
      onClick={onClick}
      sx={{
        height: height,
        minHeight: height,
        cursor: onClick ? 'pointer' : 'default',
        border: '1px solid',
        borderColor: 'divider',
        borderRadius: 2,
        boxShadow: '0 1px 3px rgba(0,0,0,0.05)',
        transition: 'all 0.2s ease',
        background: 'white',
        position: 'relative',
        overflow: 'hidden',
        display: 'flex',
        flexDirection: 'column',
        '&:hover': onClick ? {
          boxShadow: '0 4px 12px rgba(0,0,0,0.1)',
          transform: 'translateY(-2px)',
          borderColor: getStatusColor()
        } : {},
        '&::before': {
          content: '""',
          position: 'absolute',
          top: 0,
          left: 0,
          right: 0,
          height: '3px',
          background: getStatusColor(),
          opacity: status === 'normal' ? 0 : 1
        }
      }}
    >
      <CardContent sx={{ p: 2.5, pb: showSparkline ? 1.5 : 2.5, '&:last-child': { pb: showSparkline ? 1.5 : 2.5 }, height: '100%', display: 'flex', flexDirection: 'column' }}>
        <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', mb: 1.5, flex: '0 0 auto' }}>
          <Box sx={{ flex: 1, minWidth: 0 }}>
            <Typography 
              variant="caption" 
              sx={{ 
                color: 'text.secondary', 
                fontWeight: 500,
                textTransform: 'uppercase',
                letterSpacing: '0.5px',
                fontSize: '0.7rem',
                lineHeight: 1.2,
                display: 'block',
                mb: 0.5
              }}
            >
              {title}
            </Typography>
            {isLoading ? (
              <Box sx={{ height: 36, display: 'flex', alignItems: 'center' }}>
                <Typography variant="h4" sx={{ color: 'text.disabled' }}>...</Typography>
              </Box>
            ) : (
              <Typography 
                variant="h4" 
                sx={{ 
                  fontWeight: 600,
                  color: status === 'error' ? 'error.main' : 
                         status === 'warning' ? 'warning.main' : 
                         status === 'success' ? 'success.main' : 'text.primary',
                  mt: 0.5,
                  fontSize: '1.75rem',
                  lineHeight: 1.2,
                  mb: 0.5
                }}
              >
                {formatValue(value)}
              </Typography>
            )}
            {subtitle && (
              <Typography 
                variant="caption" 
                sx={{ 
                  color: 'text.secondary', 
                  fontSize: '0.75rem', 
                  mt: 0.5, 
                  display: 'block',
                  lineHeight: 1.4,
                  wordWrap: 'break-word',
                  overflow: 'visible'
                }}
              >
                {subtitle}
              </Typography>
            )}
          </Box>
          {icon && (
            <Box sx={{ ml: 1, color: 'text.secondary', opacity: 0.6 }}>
              {icon}
            </Box>
          )}
        </Box>
        
        {trend && !isLoading && (
          <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.5, mt: 1, flex: '0 0 auto' }}>
            {getTrendIcon()}
            <Typography 
              variant="caption" 
              sx={{ 
                color: trend.direction === 'up' ? '#10b981' : 
                       trend.direction === 'down' ? '#ef4444' : '#6b7280',
                fontWeight: 500,
                fontSize: '0.75rem',
                lineHeight: 1.4
              }}
            >
              {Math.abs(trend.percentage).toFixed(1)}% {trend.period || 'vs previous'}
            </Typography>
          </Box>
        )}

        {showSparkline && chartData.length > 0 && !isLoading && (
          <Box sx={{ mt: 'auto', height: 40, ml: -1.5, mr: -1.5, mb: -1.5, flex: '0 0 auto' }}>
            <ResponsiveContainer width="100%" height="100%">
              <AreaChart data={chartData} margin={{ top: 0, right: 0, left: 0, bottom: 0 }}>
                <defs>
                  <linearGradient id={`gradient-${title}`} x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor={getStatusColor()} stopOpacity={0.3}/>
                    <stop offset="95%" stopColor={getStatusColor()} stopOpacity={0}/>
                  </linearGradient>
                </defs>
                <Area
                  type="monotone"
                  dataKey="value"
                  stroke={getStatusColor()}
                  strokeWidth={2}
                  fill={`url(#gradient-${title})`}
                  dot={false}
                  isAnimationActive={true}
                  animationDuration={500}
                  activeDot={{ r: 3, fill: getStatusColor() }}
                />
              </AreaChart>
            </ResponsiveContainer>
          </Box>
        )}
      </CardContent>
    </Card>
  );
}

