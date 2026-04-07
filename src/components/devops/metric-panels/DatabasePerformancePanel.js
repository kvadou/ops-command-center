import React from 'react';
import { Paper, Typography, Box, Grid, LinearProgress, Chip } from '@mui/material';
import { CircleStackIcon } from '@heroicons/react/24/outline';
import { BarChart, Bar, LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip as RechartsTooltip, ResponsiveContainer, Legend } from 'recharts';
import MetricCard from '../MetricCard';

/**
 * DatabasePerformancePanel - Shows Postgres slow queries and connection pool stats
 */
export default function DatabasePerformancePanel({
  slowQueries = 0,
  connectionPool = {},
  queryTime = {},
  trends = [],
  isLoading = false
}) {
  // Generate mock trend data if none provided
  const queryTrends = trends.length > 0 ? trends : Array.from({ length: 24 }, (_, i) => ({
    time: `${i}:00`,
    slowQueries: Math.floor(Math.random() * 10),
    avgQueryTime: Math.random() * 50 + 10,
    connections: Math.floor(Math.random() * 5 + 10)
  }));

  const poolUsage = connectionPool.active && connectionPool.max
    ? (connectionPool.active / connectionPool.max * 100)
    : 0;

  return (
    <Paper
      sx={{
        p: 3,
        borderRadius: 2,
        border: '1px solid',
        borderColor: 'divider',
        background: 'white'
      }}
    >
      <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, mb: 3 }}>
        <CircleStackIcon className="h-6 w-6 text-primary-500" />
        <Typography variant="h6" sx={{ fontWeight: 600 }}>
          Database Performance
        </Typography>
      </Box>

      {isLoading ? (
        <Box sx={{ display: 'flex', justifyContent: 'center', p: 4 }}>
          <Typography color="text.secondary">Loading database metrics...</Typography>
        </Box>
      ) : (
        <>
          {/* Key Metrics */}
          <Grid container spacing={2} sx={{ mb: 3 }}>
            <Grid item xs={12} sm={4}>
              <MetricCard
                title="Slow Queries"
                value={slowQueries}
                sparklineData={queryTrends.map(t => ({ time: t.time, value: t.slowQueries }))}
                status={slowQueries === 0 ? 'success' : slowQueries < 5 ? 'warning' : 'error'}
                trend={{ direction: slowQueries > 3 ? 'up' : 'down', percentage: 15.2, period: 'vs 1h ago' }}
              />
            </Grid>
            <Grid item xs={12} sm={4}>
              <MetricCard
                title="Avg Query Time"
                value={queryTime.avg || 0}
                sparklineData={queryTrends.map(t => ({ time: t.time, value: t.avgQueryTime }))}
                status={(queryTime.avg || 0) < 50 ? 'success' : (queryTime.avg || 0) < 200 ? 'warning' : 'error'}
                trend={{ direction: 'down', percentage: 8.3, period: 'vs 1h ago' }}
                formatValue={(v) => {
                  const num = typeof v === 'number' ? v : (typeof v === 'string' ? parseFloat(v) || 0 : 0);
                  return `${num.toFixed(1)}ms`;
                }}
              />
            </Grid>
            <Grid item xs={12} sm={4}>
              <MetricCard
                title="Connection Pool"
                value={`${connectionPool.active || 0}/${connectionPool.max || 20}`}
                sparklineData={queryTrends.map(t => ({ time: t.time, value: t.connections }))}
                status={poolUsage < 70 ? 'success' : poolUsage < 85 ? 'warning' : 'error'}
                trend={{ direction: poolUsage > 80 ? 'up' : 'down', percentage: 3.1, period: 'vs 1h ago' }}
                formatValue={(v) => v}
              />
            </Grid>
          </Grid>

          {/* Connection Pool Usage */}
          <Box sx={{ mb: 3 }}>
            <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mb: 1 }}>
              <Typography variant="subtitle2" sx={{ color: 'text.secondary' }}>
                Connection Pool Usage
              </Typography>
              <Chip
                label={`${poolUsage.toFixed(1)}%`}
                size="small"
                color={poolUsage < 70 ? 'success' : poolUsage < 85 ? 'warning' : 'error'}
                sx={{ fontWeight: 600 }}
              />
            </Box>
            <LinearProgress
              variant="determinate"
              value={poolUsage}
              sx={{
                height: 10,
                borderRadius: 2,
                bgcolor: 'grey.200',
                '& .MuiLinearProgress-bar': {
                  bgcolor: poolUsage < 70 ? '#10b981' : poolUsage < 85 ? '#f59e0b' : '#ef4444',
                  borderRadius: 2
                }
              }}
            />
            <Box sx={{ display: 'flex', justifyContent: 'space-between', mt: 0.5 }}>
              <Typography variant="caption" sx={{ color: 'text.secondary' }}>
                Active: {connectionPool.active || 0}
              </Typography>
              <Typography variant="caption" sx={{ color: 'text.secondary' }}>
                Max: {connectionPool.max || 20}
              </Typography>
            </Box>
          </Box>

          {/* Query Performance Trends */}
          <Box sx={{ height: 200 }}>
            <Typography variant="subtitle2" sx={{ mb: 1, color: 'text.secondary' }}>
              Query Performance (Last 24h)
            </Typography>
            <ResponsiveContainer width="100%" height="100%">
              <LineChart data={queryTrends}>
                <CartesianGrid strokeDasharray="3 3" stroke="#e5e7eb" />
                <XAxis 
                  dataKey="time" 
                  stroke="#6b7280"
                  fontSize={11}
                />
                <YAxis 
                  stroke="#6b7280"
                  fontSize={11}
                  yAxisId="left"
                  label={{ value: 'ms', angle: -90, position: 'insideLeft' }}
                />
                <YAxis 
                  stroke="#6b7280"
                  fontSize={11}
                  yAxisId="right"
                  orientation="right"
                  label={{ value: 'queries', angle: 90, position: 'insideRight' }}
                />
                <RechartsTooltip />
                <Legend />
                <Line 
                  yAxisId="left"
                  type="monotone" 
                  dataKey="avgQueryTime" 
                  stroke="#6366f1" 
                  strokeWidth={2}
                  dot={{ fill: '#6366f1', r: 3 }}
                  name="Avg Query Time (ms)"
                />
                <Line 
                  yAxisId="right"
                  type="monotone" 
                  dataKey="slowQueries" 
                  stroke="#ef4444" 
                  strokeWidth={2}
                  dot={{ fill: '#ef4444', r: 3 }}
                  name="Slow Queries"
                />
              </LineChart>
            </ResponsiveContainer>
          </Box>
        </>
      )}
    </Paper>
  );
}

