import React from 'react';
import { Paper, Typography, Box, Grid } from '@mui/material';
import { CpuChipIcon } from '@heroicons/react/24/outline';
import { LineChart, Line, AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip as RechartsTooltip, ResponsiveContainer, ReferenceLine } from 'recharts';
import MetricCard from '../MetricCard';

/**
 * NodePerformancePanel - Shows Node.js event loop lag and memory spikes
 */
export default function NodePerformancePanel({
  eventLoopLag = 0,
  memory = {},
  cpu = {},
  trends = [],
  isLoading = false
}) {
  // Generate mock trend data if none provided
  const lagTrends = trends.length > 0 ? trends : Array.from({ length: 24 }, (_, i) => ({
    time: `${i}:00`,
    lag: Math.random() * 50 + 5,
    heapUsed: Math.round(Math.random() * 100000000 + 300000000),
    heapTotal: 536870912,
    cpu: Math.random() * 30 + 10
  }));

  const memoryUsage = memory.heapUsed && memory.heapTotal 
    ? (memory.heapUsed / memory.heapTotal * 100) 
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
        <CpuChipIcon className="h-6 w-6 text-primary-500" />
        <Typography variant="h6" sx={{ fontWeight: 600 }}>
          Node.js Performance
        </Typography>
      </Box>

      {isLoading ? (
        <Box sx={{ display: 'flex', justifyContent: 'center', p: 4 }}>
          <Typography color="text.secondary">Loading Node.js metrics...</Typography>
        </Box>
      ) : (
        <>
          {/* Key Metrics */}
          <Grid container spacing={2} sx={{ mb: 3 }}>
            <Grid item xs={12} sm={4}>
              <MetricCard
                title="Event Loop Lag"
                value={eventLoopLag}
                sparklineData={lagTrends.map(t => ({ time: t.time, value: t.lag }))}
                status={eventLoopLag < 50 ? 'success' : eventLoopLag < 100 ? 'warning' : 'error'}
                trend={{ direction: eventLoopLag < 10 ? 'down' : 'up', percentage: 2.1, period: 'vs 1h ago' }}
                formatValue={(v) => {
                  const num = typeof v === 'number' ? v : (typeof v === 'string' ? parseFloat(v) || 0 : 0);
                  return `${num.toFixed(1)}ms`;
                }}
              />
            </Grid>
            <Grid item xs={12} sm={4}>
              <MetricCard
                title="Heap Usage"
                value={memoryUsage}
                sparklineData={lagTrends.map(t => ({ 
                  time: t.time, 
                  value: t.heapUsed && t.heapTotal ? (t.heapUsed / t.heapTotal * 100) : 0 
                }))}
                status={memoryUsage < 70 ? 'success' : memoryUsage < 85 ? 'warning' : 'error'}
                trend={{ direction: memoryUsage > 80 ? 'up' : 'down', percentage: 1.5, period: 'vs 1h ago' }}
                formatValue={(v) => {
                  const num = typeof v === 'number' ? v : (typeof v === 'string' ? parseFloat(v) || 0 : 0);
                  return `${num.toFixed(1)}%`;
                }}
              />
            </Grid>
            <Grid item xs={12} sm={4}>
              <MetricCard
                title="CPU Usage"
                value={cpu.usage || 0}
                sparklineData={lagTrends.map(t => ({ time: t.time, value: t.cpu }))}
                status={(cpu.usage || 0) < 50 ? 'success' : (cpu.usage || 0) < 80 ? 'warning' : 'error'}
                trend={{ direction: (cpu.usage || 0) > 60 ? 'up' : 'down', percentage: 0.8, period: 'vs 1h ago' }}
                formatValue={(v) => {
                  const num = typeof v === 'number' ? v : (typeof v === 'string' ? parseFloat(v) || 0 : 0);
                  return `${num.toFixed(1)}%`;
                }}
              />
            </Grid>
          </Grid>

          {/* Memory Trend Chart */}
          <Box sx={{ mb: 3, height: 200 }}>
            <Typography variant="subtitle2" sx={{ mb: 1, color: 'text.secondary' }}>
              Memory Usage Trend (Last 24h)
            </Typography>
            <ResponsiveContainer width="100%" height="100%">
              <AreaChart data={lagTrends}>
                <defs>
                  <linearGradient id="colorMemory" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor="#6366f1" stopOpacity={0.3}/>
                    <stop offset="95%" stopColor="#6366f1" stopOpacity={0}/>
                  </linearGradient>
                </defs>
                <CartesianGrid strokeDasharray="3 3" stroke="#e5e7eb" />
                <XAxis 
                  dataKey="time" 
                  stroke="#6b7280"
                  fontSize={11}
                />
                <YAxis 
                  stroke="#6b7280"
                  fontSize={11}
                  label={{ value: 'MB', angle: -90, position: 'insideLeft' }}
                  tickFormatter={(v) => `${(v / 1024 / 1024).toFixed(0)}`}
                />
                <RechartsTooltip 
                  formatter={(value) => `${(value / 1024 / 1024).toFixed(2)} MB`}
                />
                <Area 
                  type="monotone" 
                  dataKey="heapUsed" 
                  stroke="#6366f1" 
                  fillOpacity={1} 
                  fill="url(#colorMemory)"
                  name="Heap Used"
                />
                <ReferenceLine 
                  y={memory.heapTotal || 536870912} 
                  stroke="#ef4444" 
                  strokeDasharray="3 3" 
                  label="Total Heap"
                />
              </AreaChart>
            </ResponsiveContainer>
          </Box>

          {/* Event Loop Lag Chart */}
          <Box sx={{ height: 200 }}>
            <Typography variant="subtitle2" sx={{ mb: 1, color: 'text.secondary' }}>
              Event Loop Lag (Last 24h)
            </Typography>
            <ResponsiveContainer width="100%" height="100%">
              <LineChart data={lagTrends}>
                <CartesianGrid strokeDasharray="3 3" stroke="#e5e7eb" />
                <XAxis 
                  dataKey="time" 
                  stroke="#6b7280"
                  fontSize={11}
                />
                <YAxis 
                  stroke="#6b7280"
                  fontSize={11}
                  label={{ value: 'ms', angle: -90, position: 'insideLeft' }}
                />
                <RechartsTooltip />
                <Line 
                  type="monotone" 
                  dataKey="lag" 
                  stroke="#10b981" 
                  strokeWidth={2}
                  dot={{ fill: '#10b981', r: 3 }}
                  name="Lag"
                />
                <ReferenceLine y={50} stroke="#f59e0b" strokeDasharray="3 3" label="Warning" />
                <ReferenceLine y={100} stroke="#ef4444" strokeDasharray="3 3" label="Critical" />
              </LineChart>
            </ResponsiveContainer>
          </Box>
        </>
      )}
    </Paper>
  );
}

