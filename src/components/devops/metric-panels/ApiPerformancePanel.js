import React from 'react';
import { Paper, Typography, Box, Grid, Chip } from '@mui/material';
import { BoltIcon } from '@heroicons/react/24/outline';
import { LineChart, Line, AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip as RechartsTooltip, ResponsiveContainer, ReferenceLine, Legend } from 'recharts';
import MetricCard from '../MetricCard';

/**
 * ApiPerformancePanel - Shows API latency (p50/p90/p99), timeouts, throughput
 */
export default function ApiPerformancePanel({
  latency = { p50: 120, p90: 250, p99: 500 },
  trends = [],
  throughput = 0,
  timeouts = 0,
  errorRate = 0.1,
  isLoading = false
}) {
  // Generate mock trend data if none provided
  const latencyTrends = trends.length > 0 ? trends : Array.from({ length: 24 }, (_, i) => ({
    time: `${i}:00`,
    p50: Math.random() * 50 + 100,
    p90: Math.random() * 100 + 200,
    p99: Math.random() * 200 + 400,
    requests: Math.floor(Math.random() * 1000 + 5000)
  }));

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
        <BoltIcon className="h-6 w-6 text-primary-500" />
        <Typography variant="h6" sx={{ fontWeight: 600 }}>
          API Performance
        </Typography>
      </Box>

      {isLoading ? (
        <Box sx={{ display: 'flex', justifyContent: 'center', p: 4 }}>
          <Typography color="text.secondary">Loading API performance metrics...</Typography>
        </Box>
      ) : (
        <>
          {/* Key Metrics */}
          <Grid container spacing={2} sx={{ mb: 3 }}>
            <Grid item xs={12} sm={4}>
              <MetricCard
                title="P50 Latency"
                value={latency.p50 || 0}
                sparklineData={latencyTrends.map(t => ({ time: t.time, value: t.p50 }))}
                status={latency.p50 < 200 ? 'success' : latency.p50 < 500 ? 'warning' : 'error'}
                trend={{ direction: 'down', percentage: 5.2, period: 'vs 1h ago' }}
                formatValue={(v) => {
                  const num = typeof v === 'number' ? v : (typeof v === 'string' ? parseFloat(v) || 0 : 0);
                  return `${Math.round(num)}ms`;
                }}
              />
            </Grid>
            <Grid item xs={12} sm={4}>
              <MetricCard
                title="P90 Latency"
                value={latency.p90 || 0}
                sparklineData={latencyTrends.map(t => ({ time: t.time, value: t.p90 }))}
                status={latency.p90 < 500 ? 'success' : latency.p90 < 1000 ? 'warning' : 'error'}
                trend={{ direction: 'down', percentage: 3.1, period: 'vs 1h ago' }}
                formatValue={(v) => {
                  const num = typeof v === 'number' ? v : (typeof v === 'string' ? parseFloat(v) || 0 : 0);
                  return `${Math.round(num)}ms`;
                }}
              />
            </Grid>
            <Grid item xs={12} sm={4}>
              <MetricCard
                title="P99 Latency"
                value={latency.p99 || 0}
                sparklineData={latencyTrends.map(t => ({ time: t.time, value: t.p99 }))}
                status={latency.p99 < 1000 ? 'success' : latency.p99 < 2000 ? 'warning' : 'error'}
                trend={{ direction: 'up', percentage: 2.5, period: 'vs 1h ago' }}
                formatValue={(v) => {
                  const num = typeof v === 'number' ? v : (typeof v === 'string' ? parseFloat(v) || 0 : 0);
                  return `${Math.round(num)}ms`;
                }}
              />
            </Grid>
          </Grid>

          {/* Latency Trend Chart */}
          <Box sx={{ mb: 3, height: 250 }}>
            <Typography variant="subtitle2" sx={{ mb: 1, color: 'text.secondary' }}>
              Latency Percentiles (Last 24h)
            </Typography>
            <ResponsiveContainer width="100%" height="100%">
              <AreaChart data={latencyTrends}>
                <defs>
                  <linearGradient id="colorP50" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor="#10b981" stopOpacity={0.3}/>
                    <stop offset="95%" stopColor="#10b981" stopOpacity={0}/>
                  </linearGradient>
                  <linearGradient id="colorP90" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor="#f59e0b" stopOpacity={0.3}/>
                    <stop offset="95%" stopColor="#f59e0b" stopOpacity={0}/>
                  </linearGradient>
                  <linearGradient id="colorP99" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor="#ef4444" stopOpacity={0.3}/>
                    <stop offset="95%" stopColor="#ef4444" stopOpacity={0}/>
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
                  label={{ value: 'ms', angle: -90, position: 'insideLeft' }}
                />
                <RechartsTooltip />
                <Legend />
                <Area 
                  type="monotone" 
                  dataKey="p50" 
                  stroke="#10b981" 
                  fillOpacity={1} 
                  fill="url(#colorP50)"
                  name="P50"
                />
                <Area 
                  type="monotone" 
                  dataKey="p90" 
                  stroke="#f59e0b" 
                  fillOpacity={1} 
                  fill="url(#colorP90)"
                  name="P90"
                />
                <Area 
                  type="monotone" 
                  dataKey="p99" 
                  stroke="#ef4444" 
                  fillOpacity={1} 
                  fill="url(#colorP99)"
                  name="P99"
                />
                <ReferenceLine y={500} stroke="#ef4444" strokeDasharray="3 3" label="P99 Target" />
              </AreaChart>
            </ResponsiveContainer>
          </Box>

          {/* Throughput and Error Rate */}
          <Grid container spacing={2}>
            <Grid item xs={12} sm={6}>
              <Paper sx={{ p: 2, bgcolor: 'grey.50', borderRadius: 1 }}>
                <Typography variant="caption" sx={{ color: 'text.secondary', fontSize: '0.7rem' }}>
                  Throughput
                </Typography>
                <Typography variant="h5" sx={{ fontWeight: 600, mt: 0.5 }}>
                  {(throughput / 1000).toFixed(1)}k req/min
                </Typography>
              </Paper>
            </Grid>
            <Grid item xs={12} sm={6}>
              <Paper sx={{ p: 2, bgcolor: errorRate > 1 ? 'error.light' : 'grey.50', borderRadius: 1 }}>
                <Typography variant="caption" sx={{ color: 'text.secondary', fontSize: '0.7rem' }}>
                  Error Rate
                </Typography>
                <Typography 
                  variant="h5" 
                  sx={{ 
                    fontWeight: 600, 
                    mt: 0.5,
                    color: errorRate > 1 ? 'error.main' : 'text.primary'
                  }}
                >
                  {errorRate.toFixed(2)}%
                </Typography>
                {timeouts > 0 && (
                  <Chip
                    label={`${timeouts} timeouts`}
                    size="small"
                    color="error"
                    sx={{ mt: 1 }}
                  />
                )}
              </Paper>
            </Grid>
          </Grid>
        </>
      )}
    </Paper>
  );
}

