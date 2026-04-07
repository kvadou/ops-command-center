import React, { useCallback, useEffect, useState } from "react";
import {
  Box,
  Card,
  CardContent,
  CircularProgress,
  FormControl,
  Grid,
  InputLabel,
  MenuItem,
  Select,
  Stack,
  Tab,
  Tabs,
  Typography,
} from "@mui/material";
import {
  BarChart, Bar, LineChart, Line, PieChart, Pie, Cell,
  AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip, 
  Legend, ResponsiveContainer
} from "recharts";
import {
  ArrowTrendingUpIcon,
  DevicePhoneMobileIcon,
  GlobeAltIcon,
  ClockIcon,
} from "@heroicons/react/24/outline";
import axios from "axios";

const COLORS = ['#6A469D', '#50C8DF', '#34B256', '#F79A30', '#DA2E72', '#2D2F8E', '#FACC29', '#888'];

/**
 * QR Code Detailed Analytics Component
 * 
 * Displays comprehensive analytics with charts for scans, devices, 
 * locations, and time patterns
 */
export default function QRCodeDetailedAnalytics({ qrCodeId }) {
  const [analytics, setAnalytics] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [activeTab, setActiveTab] = useState(0);
  const [dateRange, setDateRange] = useState('30');
  const [groupBy, setGroupBy] = useState('day');

  const fetchAnalytics = useCallback(async () => {
    if (!qrCodeId) return;
    
    try {
      setLoading(true);
      const endDate = new Date().toISOString();
      const startDate = new Date(Date.now() - parseInt(dateRange) * 24 * 60 * 60 * 1000).toISOString();
      
      const response = await axios.get(`/api/qr-codes/${qrCodeId}/analytics/detailed`, {
        params: { start_date: startDate, end_date: endDate, group_by: groupBy }
      });
      setAnalytics(response.data);
      setError(null);
    } catch (err) {
      console.error('Error fetching analytics:', err);
      setError('Failed to load analytics');
    } finally {
      setLoading(false);
    }
  }, [qrCodeId, dateRange, groupBy]);

  useEffect(() => {
    fetchAnalytics();
  }, [fetchAnalytics]);

  if (loading) {
    return (
      <Box sx={{ display: 'flex', justifyContent: 'center', p: 4 }}>
        <CircularProgress />
      </Box>
    );
  }

  if (error || !analytics) {
    return (
      <Typography color="error" sx={{ p: 2 }}>{error || 'No data available'}</Typography>
    );
  }

  const { summary, time_series, devices, browsers, operating_systems, countries, cities, hourly_pattern, weekday_pattern, utm_sources } = analytics;

  // Format time series data for chart
  const timeSeriesData = time_series.map(item => ({
    date: new Date(item.period).toLocaleDateString('en-US', { month: 'short', day: 'numeric' }),
    total: parseInt(item.total_scans),
    unique: parseInt(item.unique_scans),
  }));

  // Format hourly data
  const hourlyData = hourly_pattern?.map(item => ({
    hour: `${item.hour}:00`,
    scans: parseInt(item.count),
  })) || [];

  // Format weekday data
  const weekdayData = weekday_pattern?.map(item => ({
    day: item.day_name?.trim(),
    scans: parseInt(item.count),
  })) || [];

  return (
    <Box>
      {/* Filters */}
      <Stack direction="row" spacing={2} sx={{ mb: 3 }}>
        <FormControl size="small" sx={{ minWidth: 120 }}>
          <InputLabel>Time Range</InputLabel>
          <Select value={dateRange} label="Time Range" onChange={(e) => setDateRange(e.target.value)}>
            <MenuItem value="7">Last 7 days</MenuItem>
            <MenuItem value="30">Last 30 days</MenuItem>
            <MenuItem value="90">Last 90 days</MenuItem>
            <MenuItem value="365">Last year</MenuItem>
          </Select>
        </FormControl>
        <FormControl size="small" sx={{ minWidth: 120 }}>
          <InputLabel>Group By</InputLabel>
          <Select value={groupBy} label="Group By" onChange={(e) => setGroupBy(e.target.value)}>
            <MenuItem value="hour">Hour</MenuItem>
            <MenuItem value="day">Day</MenuItem>
            <MenuItem value="week">Week</MenuItem>
          </Select>
        </FormControl>
      </Stack>

      {/* Summary Cards */}
      <Grid container spacing={2} sx={{ mb: 3 }}>
        <Grid item xs={6} md={3}>
          <Card>
            <CardContent sx={{ textAlign: 'center' }}>
              <Typography variant="h4" color="primary" fontWeight="bold">
                {summary?.total_scans || 0}
              </Typography>
              <Typography variant="body2" color="text.secondary">Total Scans</Typography>
            </CardContent>
          </Card>
        </Grid>
        <Grid item xs={6} md={3}>
          <Card>
            <CardContent sx={{ textAlign: 'center' }}>
              <Typography variant="h4" color="secondary" fontWeight="bold">
                {summary?.unique_scans || 0}
              </Typography>
              <Typography variant="body2" color="text.secondary">Unique Scans</Typography>
            </CardContent>
          </Card>
        </Grid>
        <Grid item xs={6} md={3}>
          <Card>
            <CardContent sx={{ textAlign: 'center' }}>
              <Typography variant="h4" color="success.main" fontWeight="bold">
                {summary?.countries_reached || 0}
              </Typography>
              <Typography variant="body2" color="text.secondary">Countries</Typography>
            </CardContent>
          </Card>
        </Grid>
        <Grid item xs={6} md={3}>
          <Card>
            <CardContent sx={{ textAlign: 'center' }}>
              <Typography variant="h4" color="warning.main" fontWeight="bold">
                {summary?.cities_reached || 0}
              </Typography>
              <Typography variant="body2" color="text.secondary">Cities</Typography>
            </CardContent>
          </Card>
        </Grid>
      </Grid>

      {/* Tabs */}
      <Tabs value={activeTab} onChange={(e, v) => setActiveTab(v)} sx={{ mb: 2 }}>
        <Tab icon={<ArrowTrendingUpIcon className="h-5 w-5" />} label="Trends" iconPosition="start" />
        <Tab icon={<DevicePhoneMobileIcon className="h-5 w-5" />} label="Devices" iconPosition="start" />
        <Tab icon={<GlobeAltIcon className="h-5 w-5" />} label="Locations" iconPosition="start" />
        <Tab icon={<ClockIcon className="h-5 w-5" />} label="Timing" iconPosition="start" />
      </Tabs>

      {/* Trends Tab */}
      {activeTab === 0 && (
        <Card>
          <CardContent>
            <Typography variant="subtitle1" fontWeight="bold" gutterBottom>Scans Over Time</Typography>
            <ResponsiveContainer width="100%" height={300}>
              <AreaChart data={timeSeriesData}>
                <CartesianGrid strokeDasharray="3 3" />
                <XAxis dataKey="date" />
                <YAxis />
                <Tooltip />
                <Legend />
                <Area type="monotone" dataKey="total" name="Total Scans" stroke="#6A469D" fill="#6A469D" fillOpacity={0.3} />
                <Area type="monotone" dataKey="unique" name="Unique Scans" stroke="#50C8DF" fill="#50C8DF" fillOpacity={0.3} />
              </AreaChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>
      )}

      {/* Devices Tab */}
      {activeTab === 1 && (
        <Grid container spacing={2}>
          <Grid item xs={12} md={4}>
            <Card>
              <CardContent>
                <Typography variant="subtitle1" fontWeight="bold" gutterBottom>Device Types</Typography>
                <ResponsiveContainer width="100%" height={250}>
                  <PieChart>
                    <Pie
                      data={devices}
                      dataKey="count"
                      nameKey="device_type"
                      cx="50%"
                      cy="50%"
                      outerRadius={80}
                      label={({ device_type, percentage }) => `${device_type} ${percentage}%`}
                    >
                      {devices.map((entry, index) => (
                        <Cell key={index} fill={COLORS[index % COLORS.length]} />
                      ))}
                    </Pie>
                    <Tooltip />
                  </PieChart>
                </ResponsiveContainer>
              </CardContent>
            </Card>
          </Grid>
          <Grid item xs={12} md={4}>
            <Card>
              <CardContent>
                <Typography variant="subtitle1" fontWeight="bold" gutterBottom>Browsers</Typography>
                <ResponsiveContainer width="100%" height={250}>
                  <BarChart data={browsers?.slice(0, 5)} layout="vertical">
                    <CartesianGrid strokeDasharray="3 3" />
                    <XAxis type="number" />
                    <YAxis type="category" dataKey="browser" width={80} />
                    <Tooltip />
                    <Bar dataKey="count" fill="#6A469D" />
                  </BarChart>
                </ResponsiveContainer>
              </CardContent>
            </Card>
          </Grid>
          <Grid item xs={12} md={4}>
            <Card>
              <CardContent>
                <Typography variant="subtitle1" fontWeight="bold" gutterBottom>Operating Systems</Typography>
                <ResponsiveContainer width="100%" height={250}>
                  <BarChart data={operating_systems?.slice(0, 5)} layout="vertical">
                    <CartesianGrid strokeDasharray="3 3" />
                    <XAxis type="number" />
                    <YAxis type="category" dataKey="os" width={80} />
                    <Tooltip />
                    <Bar dataKey="count" fill="#50C8DF" />
                  </BarChart>
                </ResponsiveContainer>
              </CardContent>
            </Card>
          </Grid>
        </Grid>
      )}

      {/* Locations Tab */}
      {activeTab === 2 && (
        <Grid container spacing={2}>
          <Grid item xs={12} md={6}>
            <Card>
              <CardContent>
                <Typography variant="subtitle1" fontWeight="bold" gutterBottom>Top Countries</Typography>
                <ResponsiveContainer width="100%" height={300}>
                  <BarChart data={countries?.slice(0, 10)}>
                    <CartesianGrid strokeDasharray="3 3" />
                    <XAxis dataKey="country" />
                    <YAxis />
                    <Tooltip />
                    <Bar dataKey="count" fill="#34B256" />
                  </BarChart>
                </ResponsiveContainer>
              </CardContent>
            </Card>
          </Grid>
          <Grid item xs={12} md={6}>
            <Card>
              <CardContent>
                <Typography variant="subtitle1" fontWeight="bold" gutterBottom>Top Cities</Typography>
                <ResponsiveContainer width="100%" height={300}>
                  <BarChart data={cities?.slice(0, 10)}>
                    <CartesianGrid strokeDasharray="3 3" />
                    <XAxis dataKey="city" />
                    <YAxis />
                    <Tooltip />
                    <Bar dataKey="count" fill="#F79A30" />
                  </BarChart>
                </ResponsiveContainer>
              </CardContent>
            </Card>
          </Grid>
        </Grid>
      )}

      {/* Timing Tab */}
      {activeTab === 3 && (
        <Grid container spacing={2}>
          <Grid item xs={12} md={6}>
            <Card>
              <CardContent>
                <Typography variant="subtitle1" fontWeight="bold" gutterBottom>Scans by Hour</Typography>
                <ResponsiveContainer width="100%" height={300}>
                  <BarChart data={hourlyData}>
                    <CartesianGrid strokeDasharray="3 3" />
                    <XAxis dataKey="hour" />
                    <YAxis />
                    <Tooltip />
                    <Bar dataKey="scans" fill="#6A469D" />
                  </BarChart>
                </ResponsiveContainer>
              </CardContent>
            </Card>
          </Grid>
          <Grid item xs={12} md={6}>
            <Card>
              <CardContent>
                <Typography variant="subtitle1" fontWeight="bold" gutterBottom>Scans by Day of Week</Typography>
                <ResponsiveContainer width="100%" height={300}>
                  <BarChart data={weekdayData}>
                    <CartesianGrid strokeDasharray="3 3" />
                    <XAxis dataKey="day" />
                    <YAxis />
                    <Tooltip />
                    <Bar dataKey="scans" fill="#DA2E72" />
                  </BarChart>
                </ResponsiveContainer>
              </CardContent>
            </Card>
          </Grid>
        </Grid>
      )}

      {/* UTM Sources */}
      {utm_sources && utm_sources.length > 0 && (
        <Card sx={{ mt: 2 }}>
          <CardContent>
            <Typography variant="subtitle1" fontWeight="bold" gutterBottom>Traffic Sources (UTM)</Typography>
            <ResponsiveContainer width="100%" height={200}>
              <BarChart data={utm_sources.slice(0, 10)}>
                <CartesianGrid strokeDasharray="3 3" />
                <XAxis dataKey="utm_source" />
                <YAxis />
                <Tooltip />
                <Bar dataKey="count" fill="#2D2F8E" />
              </BarChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>
      )}
    </Box>
  );
}
