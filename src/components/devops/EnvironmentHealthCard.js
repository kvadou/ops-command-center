import React from 'react';
import { Card, CardContent, Box, Typography, Chip, LinearProgress } from '@mui/material';
// Status indicator uses a styled div instead of MUI Circle icon
import { PieChart, Pie, Cell, ResponsiveContainer, Legend, Tooltip } from 'recharts';

/**
 * EnvironmentHealthCard - Shows health status for an environment (main/westside/eastside)
 * Similar to Vercel's deployment health indicators
 */
export default function EnvironmentHealthCard({
  environment,
  status = 'healthy', // 'healthy' | 'degraded' | 'down' | 'unknown'
  metrics = {
    uptime: 99.9,
    alerts: 0,
    criticalAlerts: 0,
    responseTime: 120,
    errorRate: 0.1
  },
  onClick,
  isLoading = false
}) {
  const getStatusColor = () => {
    switch (status) {
      case 'healthy': return '#10b981';
      case 'degraded': return '#f59e0b';
      case 'down': return '#ef4444';
      default: return '#6b7280';
    }
  };

  const getStatusLabel = () => {
    switch (status) {
      case 'healthy': return 'Healthy';
      case 'degraded': return 'Degraded';
      case 'down': return 'Down';
      default: return 'Unknown';
    }
  };

  const pieData = [
    { name: 'Healthy', value: metrics.uptime || 0 },
    { name: 'Issues', value: 100 - (metrics.uptime || 0) }
  ];

  const COLORS = [getStatusColor(), '#ef4444'];

  return (
    <Card
      onClick={onClick}
      sx={{
        height: '100%',
        cursor: onClick ? 'pointer' : 'default',
        border: '1px solid',
        borderColor: 'divider',
        borderRadius: 2,
        boxShadow: '0 1px 3px rgba(0,0,0,0.05)',
        transition: 'all 0.2s ease',
        background: 'white',
        '&:hover': onClick ? {
          boxShadow: '0 4px 12px rgba(0,0,0,0.1)',
          transform: 'translateY(-2px)',
        } : {},
      }}
    >
      <CardContent sx={{ p: 2.5 }}>
        <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mb: 2 }}>
          <Typography variant="h6" sx={{ fontWeight: 600, fontSize: '1.1rem' }}>
            {environment.charAt(0).toUpperCase() + environment.slice(1)}
          </Typography>
          <Chip
            icon={<span className="inline-block w-2 h-2 rounded-full" style={{ backgroundColor: getStatusColor() }} />}
            label={getStatusLabel()}
            size="small"
            sx={{
              bgcolor: getStatusColor() + '15',
              color: getStatusColor(),
              fontWeight: 500,
              border: `1px solid ${getStatusColor()}40`
            }}
          />
        </Box>

        {isLoading ? (
          <Box sx={{ display: 'flex', justifyContent: 'center', alignItems: 'center', height: 120 }}>
            <Typography variant="body2" color="text.secondary">Loading...</Typography>
          </Box>
        ) : (
          <>
            <Box sx={{ display: 'flex', gap: 2, mb: 2 }}>
              <Box sx={{ flex: 1 }}>
                <Typography variant="caption" sx={{ color: 'text.secondary', fontSize: '0.75rem' }}>
                  Uptime
                </Typography>
                <Typography variant="h5" sx={{ fontWeight: 600, mt: 0.5 }}>
                  {metrics.uptime?.toFixed(2) || '0.00'}%
                </Typography>
                <LinearProgress
                  variant="determinate"
                  value={metrics.uptime || 0}
                  sx={{
                    mt: 1,
                    height: 6,
                    borderRadius: 3,
                    bgcolor: '#e5e7eb',
                    '& .MuiLinearProgress-bar': {
                      bgcolor: getStatusColor(),
                      borderRadius: 3
                    }
                  }}
                />
              </Box>
              <Box sx={{ width: 80, height: 80 }}>
                <ResponsiveContainer width="100%" height="100%">
                  <PieChart>
                    <Pie
                      data={pieData}
                      cx="50%"
                      cy="50%"
                      innerRadius={20}
                      outerRadius={35}
                      paddingAngle={2}
                      dataKey="value"
                    >
                      {pieData.map((entry, index) => (
                        <Cell key={`cell-${index}`} fill={COLORS[index % COLORS.length]} />
                      ))}
                    </Pie>
                    <Tooltip />
                  </PieChart>
                </ResponsiveContainer>
              </Box>
            </Box>

            <Box sx={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 1.5, mt: 2 }}>
              <Box>
                <Typography variant="caption" sx={{ color: 'text.secondary', fontSize: '0.7rem' }}>
                  Active Alerts
                </Typography>
                <Typography variant="h6" sx={{ fontWeight: 600, mt: 0.5 }}>
                  {metrics.alerts || 0}
                </Typography>
                {metrics.criticalAlerts > 0 && (
                  <Chip
                    label={`${metrics.criticalAlerts} critical`}
                    size="small"
                    color="error"
                    sx={{ mt: 0.5, height: 20, fontSize: '0.65rem' }}
                  />
                )}
              </Box>
              <Box>
                <Typography variant="caption" sx={{ color: 'text.secondary', fontSize: '0.7rem' }}>
                  Avg Response
                </Typography>
                <Typography variant="h6" sx={{ fontWeight: 600, mt: 0.5 }}>
                  {metrics.responseTime || 0}ms
                </Typography>
                <Typography variant="caption" sx={{ color: 'text.secondary', fontSize: '0.65rem', mt: 0.5, display: 'block' }}>
                  {metrics.errorRate?.toFixed(2) || '0.00'}% errors
                </Typography>
              </Box>
            </Box>
          </>
        )}
      </CardContent>
    </Card>
  );
}

