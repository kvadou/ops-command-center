import React from 'react';
import { Box, Typography, Paper } from '@mui/material';
import { PieChart, Pie, Cell, ResponsiveContainer, Legend, Tooltip } from 'recharts';

/**
 * EnvironmentHealthDonut - Donut chart showing environment health distribution
 */
export default function EnvironmentHealthDonut({ environmentHealth }) {
  const data = React.useMemo(() => {
    if (!environmentHealth) return [];

    return Object.entries(environmentHealth).map(([env, health]) => ({
      name: env.charAt(0).toUpperCase() + env.slice(1),
      value: health.status === 'healthy' ? 100 : health.status === 'degraded' ? 50 : 0,
      status: health.status,
      alerts: health.alerts || 0,
      criticalAlerts: health.criticalAlerts || 0
    }));
  }, [environmentHealth]);

  const COLORS = {
    healthy: '#10b981',
    degraded: '#f59e0b',
    down: '#ef4444',
    unknown: '#9ca3af'
  };

  const getColor = (status) => COLORS[status] || COLORS.unknown;

  const CustomTooltip = ({ active, payload }) => {
    if (active && payload && payload.length) {
      const data = payload[0];
      return (
        <Paper sx={{ p: 2, bgcolor: 'rgba(255,255,255,0.95)', boxShadow: 2 }}>
          <Typography variant="body2" sx={{ fontWeight: 600 }}>
            {data.name}
          </Typography>
          <Typography variant="caption" color="text.secondary">
            Status: {data.payload.status}
          </Typography>
          <Typography variant="caption" color="text.secondary" sx={{ display: 'block' }}>
            Alerts: {data.payload.alerts}
          </Typography>
          {data.payload.criticalAlerts > 0 && (
            <Typography variant="caption" color="error" sx={{ display: 'block' }}>
              Critical: {data.payload.criticalAlerts}
            </Typography>
          )}
        </Paper>
      );
    }
    return null;
  };

  if (data.length === 0) {
    return (
      <Paper sx={{ p: 3, textAlign: 'center', bgcolor: 'grey.50' }}>
        <Typography variant="body2" color="text.secondary">
          No environment health data available
        </Typography>
      </Paper>
    );
  }

  return (
    <Paper sx={{ p: 2, bgcolor: 'white', borderRadius: 2 }}>
      <Typography variant="h6" sx={{ mb: 2, fontWeight: 600 }}>
        Environment Health Overview
      </Typography>
      <ResponsiveContainer width="100%" height={300}>
        <PieChart>
          <Pie
            data={data}
            cx="50%"
            cy="50%"
            innerRadius={80}
            outerRadius={120}
            paddingAngle={5}
            dataKey="value"
          >
            {data.map((entry, index) => (
              <Cell key={`cell-${index}`} fill={getColor(entry.status)} />
            ))}
          </Pie>
          <Tooltip content={<CustomTooltip />} />
          <Legend
            verticalAlign="bottom"
            height={36}
            formatter={(value, entry) => (
              <span style={{ color: entry.color }}>
                {value} ({data.find(d => d.name === value)?.status || 'unknown'})
              </span>
            )}
          />
        </PieChart>
      </ResponsiveContainer>
      <Box sx={{ mt: 2, display: 'flex', justifyContent: 'center', gap: 2, flexWrap: 'wrap' }}>
        {data.map((entry) => (
          <Box key={entry.name} sx={{ textAlign: 'center' }}>
            <Box
              sx={{
                width: 12,
                height: 12,
                borderRadius: '50%',
                bgcolor: getColor(entry.status),
                display: 'inline-block',
                mr: 0.5
              }}
            />
            <Typography variant="caption" color="text.secondary">
              {entry.name}: {entry.status}
            </Typography>
          </Box>
        ))}
      </Box>
    </Paper>
  );
}

