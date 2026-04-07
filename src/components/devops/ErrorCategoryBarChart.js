import React, { useMemo } from 'react';
import { Box, Typography, Paper } from '@mui/material';
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer } from 'recharts';

/**
 * ErrorCategoryBarChart - Bar chart showing error categories distribution
 */
export default function ErrorCategoryBarChart({ alerts, timeRange = '24h' }) {
  const data = useMemo(() => {
    if (!alerts || alerts.length === 0) return [];

    // Group alerts by type and severity
    const categoryMap = {};
    
    alerts.forEach(alert => {
      const category = alert.alert_type || 'unknown';
      if (!categoryMap[category]) {
        categoryMap[category] = {
          category,
          critical: 0,
          high: 0,
          medium: 0,
          low: 0,
          total: 0
        };
      }
      
      const severity = alert.severity || 'low';
      if (categoryMap[category][severity] !== undefined) {
        categoryMap[category][severity]++;
      }
      categoryMap[category].total++;
    });

    // Convert to array and format category names
    return Object.values(categoryMap)
      .sort((a, b) => b.total - a.total)
      .map(item => ({
        ...item,
        category: item.category
          .replace(/_/g, ' ')
          .replace(/\b\w/g, l => l.toUpperCase())
      }));
  }, [alerts]);

  const CustomTooltip = ({ active, payload }) => {
    if (active && payload && payload.length) {
      const data = payload[0].payload;
      return (
        <Paper sx={{ p: 2, bgcolor: 'rgba(255,255,255,0.95)', boxShadow: 2 }}>
          <Typography variant="body2" sx={{ fontWeight: 600, mb: 1 }}>
            {data.category}
          </Typography>
          <Typography variant="caption" color="error" sx={{ display: 'block' }}>
            Critical: {data.critical}
          </Typography>
          <Typography variant="caption" color="warning.main" sx={{ display: 'block' }}>
            High: {data.high}
          </Typography>
          <Typography variant="caption" color="info.main" sx={{ display: 'block' }}>
            Medium: {data.medium}
          </Typography>
          <Typography variant="caption" color="text.secondary" sx={{ display: 'block' }}>
            Low: {data.low}
          </Typography>
          <Typography variant="caption" sx={{ display: 'block', mt: 0.5, fontWeight: 600 }}>
            Total: {data.total}
          </Typography>
        </Paper>
      );
    }
    return null;
  };

  if (data.length === 0) {
    return (
      <Paper sx={{ p: 3, textAlign: 'center', bgcolor: 'grey.50' }}>
        <Typography variant="body2" color="text.secondary">
          No error category data available
        </Typography>
      </Paper>
    );
  }

  return (
    <Paper sx={{ p: 2, bgcolor: 'white', borderRadius: 2 }}>
      <Typography variant="h6" sx={{ mb: 2, fontWeight: 600 }}>
        Error Categories by Severity
      </Typography>
      <ResponsiveContainer width="100%" height={300}>
        <BarChart
          data={data}
          margin={{ top: 5, right: 30, left: 20, bottom: 60 }}
        >
          <CartesianGrid strokeDasharray="3 3" opacity={0.3} />
          <XAxis 
            dataKey="category" 
            angle={-45}
            textAnchor="end"
            height={80}
            interval={0}
            tick={{ fontSize: 12 }}
          />
          <YAxis tick={{ fontSize: 12 }} />
          <Tooltip content={<CustomTooltip />} />
          <Legend />
          <Bar dataKey="critical" stackId="a" fill="#ef4444" name="Critical" />
          <Bar dataKey="high" stackId="a" fill="#f59e0b" name="High" />
          <Bar dataKey="medium" stackId="a" fill="#3b82f6" name="Medium" />
          <Bar dataKey="low" stackId="a" fill="#9ca3af" name="Low" />
        </BarChart>
      </ResponsiveContainer>
    </Paper>
  );
}

