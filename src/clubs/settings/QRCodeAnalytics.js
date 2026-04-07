import React, { useCallback, useEffect, useState } from "react";
import {
  Box,
  Card,
  CardContent,
  Chip,
  CircularProgress,
  FormControl,
  Grid,
  InputLabel,
  MenuItem,
  Paper,
  Select,
  Stack,
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TableRow,
  Typography,
} from "@mui/material";
import {
  BarChart,
  Bar,
  LineChart,
  Line,
  PieChart,
  Pie,
  Cell,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
  ResponsiveContainer,
} from "recharts";
import {
  ArrowTrendingUpIcon,
  DevicePhoneMobileIcon,
  GlobeAltIcon,
  ClockIcon,
  ComputerDesktopIcon,
  DeviceTabletIcon,
} from "@heroicons/react/24/outline";
import axios from "axios";

// Chart colors matching brand
const COLORS = ['#6A469D', '#50C8DF', '#34B256', '#FACC29', '#F79A30', '#DA2E72', '#2D2F8E'];

// Device icons
const DEVICE_ICONS = {
  mobile: DevicePhoneMobileIcon,
  desktop: ComputerDesktopIcon,
  tablet: DeviceTabletIcon,
};

/**
 * QR Code Analytics Component
 * 
 * Displays comprehensive analytics for a QR code including:
 * - Total and unique scans over time
 * - Device type breakdown
 * - Browser breakdown
 * - Geographic distribution
 * - Hourly scan heatmap
 * - Recent scan history
 */
export default function QRCodeAnalytics({ qrCodeId, qrCodeName }) {
  const [analytics, setAnalytics] = useState(null);
  const [scans, setScans] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [timeRange, setTimeRange] = useState(30); // days

  // Fetch analytics data
  const fetchAnalytics = useCallback(async () => {
    if (!qrCodeId) return;
    
    setLoading(true);
    setError(null);
    
    try {
      const [analyticsRes, scansRes] = await Promise.all([
        axios.get(`/api/qr-codes/${qrCodeId}/analytics?days=${timeRange}`),
        axios.get(`/api/qr-codes/${qrCodeId}/scans?limit=50`)
      ]);
      
      setAnalytics(analyticsRes.data);
      setScans(scansRes.data.scans || []);
    } catch (e) {
      setError(e?.response?.data?.error || e?.message || 'Failed to load analytics');
    } finally {
      setLoading(false);
    }
  }, [qrCodeId, timeRange]);

  useEffect(() => {
    fetchAnalytics();
  }, [fetchAnalytics]);

  if (loading) {
    return (
      <Box sx={{ display: 'flex', justifyContent: 'center', alignItems: 'center', py: 8 }}>
        <CircularProgress />
      </Box>
    );
  }

  if (error) {
    return (
      <Box sx={{ textAlign: 'center', py: 4 }}>
        <Typography color="error">{error}</Typography>
      </Box>
    );
  }

  if (!analytics) {
    return (
      <Box sx={{ textAlign: 'center', py: 4 }}>
        <Typography color="text.secondary">No analytics data available</Typography>
      </Box>
    );
  }

  const { summary, dailyScans, deviceBreakdown, topCountries, recentScans } = analytics;
  const totalScans = parseInt(summary?.total_scans || 0);
  const uniqueScans = parseInt(summary?.unique_scans || 0);

  // Prepare chart data
  const dailyChartData = (dailyScans || []).map(day => ({
    date: new Date(day.date).toLocaleDateString('en-US', { month: 'short', day: 'numeric' }),
    scans: parseInt(day.scans),
    unique: parseInt(day.unique_scans),
  }));

  const deviceChartData = (deviceBreakdown || []).map(d => ({
    name: d.device_type || 'Unknown',
    value: parseInt(d.count),
  }));

  const countryChartData = (topCountries || []).map(c => ({
    name: c.country || 'Unknown',
    scans: parseInt(c.count),
  }));

  return (
    <Box>
      {/* Header with time range selector */}
      <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mb: 3 }}>
        <Typography variant="h6" fontWeight="bold">
          {qrCodeName ? `Analytics: ${qrCodeName}` : 'QR Code Analytics'}
        </Typography>
        <FormControl size="small" sx={{ minWidth: 150 }}>
          <InputLabel>Time Range</InputLabel>
          <Select
            value={timeRange}
            label="Time Range"
            onChange={(e) => setTimeRange(e.target.value)}
          >
            <MenuItem value={7}>Last 7 days</MenuItem>
            <MenuItem value={30}>Last 30 days</MenuItem>
            <MenuItem value={90}>Last 90 days</MenuItem>
            <MenuItem value={365}>Last year</MenuItem>
          </Select>
        </FormControl>
      </Box>

      {/* Summary Cards */}
      <Grid container spacing={2} sx={{ mb: 4 }}>
        <Grid item xs={6} sm={3}>
          <Card sx={{ height: '100%' }}>
            <CardContent sx={{ textAlign: 'center' }}>
              <ArrowTrendingUpIcon className="h-8 w-8" style={{ color: '#6A469D', marginBottom: 8 }} />
              <Typography variant="h4" fontWeight="bold" color="primary">
                {totalScans.toLocaleString()}
              </Typography>
              <Typography variant="body2" color="text.secondary">
                Total Scans
              </Typography>
            </CardContent>
          </Card>
        </Grid>
        <Grid item xs={6} sm={3}>
          <Card sx={{ height: '100%' }}>
            <CardContent sx={{ textAlign: 'center' }}>
              <DevicePhoneMobileIcon className="h-8 w-8" style={{ color: '#9c27b0', marginBottom: 8 }} />
              <Typography variant="h4" fontWeight="bold" color="secondary">
                {uniqueScans.toLocaleString()}
              </Typography>
              <Typography variant="body2" color="text.secondary">
                Unique Visitors
              </Typography>
            </CardContent>
          </Card>
        </Grid>
        <Grid item xs={6} sm={3}>
          <Card sx={{ height: '100%' }}>
            <CardContent sx={{ textAlign: 'center' }}>
              <GlobeAltIcon className="h-8 w-8" style={{ color: '#2e7d32', marginBottom: 8 }} />
              <Typography variant="h4" fontWeight="bold" color="success.main">
                {summary?.countries || 0}
              </Typography>
              <Typography variant="body2" color="text.secondary">
                Countries
              </Typography>
            </CardContent>
          </Card>
        </Grid>
        <Grid item xs={6} sm={3}>
          <Card sx={{ height: '100%' }}>
            <CardContent sx={{ textAlign: 'center' }}>
              <ClockIcon className="h-8 w-8" style={{ color: '#0288d1', marginBottom: 8 }} />
              <Typography variant="body1" fontWeight="bold" color="info.main">
                {summary?.last_scan
                  ? new Date(summary.last_scan).toLocaleDateString()
                  : 'Never'}
              </Typography>
              <Typography variant="body2" color="text.secondary">
                Last Scanned
              </Typography>
            </CardContent>
          </Card>
        </Grid>
      </Grid>

      {totalScans === 0 ? (
        <Paper sx={{ p: 4, textAlign: 'center' }}>
          <Typography variant="h6" color="text.secondary" gutterBottom>
            No Scans Yet
          </Typography>
          <Typography variant="body2" color="text.secondary">
            Share your QR code to start collecting analytics data.
            We'll track scans, device types, locations, and more.
          </Typography>
        </Paper>
      ) : (
        <>
          {/* Scans Over Time Chart */}
          {dailyChartData.length > 0 && (
            <Paper sx={{ p: 3, mb: 3 }}>
              <Typography variant="subtitle1" fontWeight="bold" gutterBottom>
                Scans Over Time
              </Typography>
              <ResponsiveContainer width="100%" height={300}>
                <LineChart data={dailyChartData}>
                  <CartesianGrid strokeDasharray="3 3" />
                  <XAxis dataKey="date" fontSize={12} />
                  <YAxis fontSize={12} />
                  <Tooltip />
                  <Legend />
                  <Line
                    type="monotone"
                    dataKey="scans"
                    name="Total Scans"
                    stroke="#6A469D"
                    strokeWidth={2}
                    dot={{ r: 3 }}
                  />
                  <Line
                    type="monotone"
                    dataKey="unique"
                    name="Unique Scans"
                    stroke="#50C8DF"
                    strokeWidth={2}
                    dot={{ r: 3 }}
                  />
                </LineChart>
              </ResponsiveContainer>
            </Paper>
          )}

          <Grid container spacing={3}>
            {/* Device Breakdown */}
            {deviceChartData.length > 0 && (
              <Grid item xs={12} md={6}>
                <Paper sx={{ p: 3, height: '100%' }}>
                  <Typography variant="subtitle1" fontWeight="bold" gutterBottom>
                    Device Breakdown
                  </Typography>
                  <Box sx={{ display: 'flex', alignItems: 'center' }}>
                    <ResponsiveContainer width="60%" height={200}>
                      <PieChart>
                        <Pie
                          data={deviceChartData}
                          cx="50%"
                          cy="50%"
                          innerRadius={40}
                          outerRadius={80}
                          paddingAngle={2}
                          dataKey="value"
                        >
                          {deviceChartData.map((entry, index) => (
                            <Cell key={`cell-${index}`} fill={COLORS[index % COLORS.length]} />
                          ))}
                        </Pie>
                        <Tooltip />
                      </PieChart>
                    </ResponsiveContainer>
                    <Box sx={{ width: '40%' }}>
                      <Stack spacing={1}>
                        {deviceChartData.map((device, index) => {
                          const IconComponent = DEVICE_ICONS[device.name.toLowerCase()] || DevicePhoneMobileIcon;
                          const percentage = totalScans > 0 
                            ? ((device.value / totalScans) * 100).toFixed(1) 
                            : 0;
                          return (
                            <Box key={device.name} sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                              <Box
                                sx={{
                                  width: 12,
                                  height: 12,
                                  borderRadius: '50%',
                                  bgcolor: COLORS[index % COLORS.length],
                                }}
                              />
                              <IconComponent className="h-4 w-4 text-gray-500" />
                              <Typography variant="body2" sx={{ flex: 1 }}>
                                {device.name}
                              </Typography>
                              <Typography variant="body2" fontWeight="bold">
                                {percentage}%
                              </Typography>
                            </Box>
                          );
                        })}
                      </Stack>
                    </Box>
                  </Box>
                </Paper>
              </Grid>
            )}

            {/* Top Countries */}
            {countryChartData.length > 0 && (
              <Grid item xs={12} md={6}>
                <Paper sx={{ p: 3, height: '100%' }}>
                  <Typography variant="subtitle1" fontWeight="bold" gutterBottom>
                    Top Countries
                  </Typography>
                  <ResponsiveContainer width="100%" height={200}>
                    <BarChart data={countryChartData} layout="vertical">
                      <CartesianGrid strokeDasharray="3 3" />
                      <XAxis type="number" fontSize={12} />
                      <YAxis dataKey="name" type="category" fontSize={12} width={80} />
                      <Tooltip />
                      <Bar dataKey="scans" fill="#6A469D" radius={[0, 4, 4, 0]} />
                    </BarChart>
                  </ResponsiveContainer>
                </Paper>
              </Grid>
            )}
          </Grid>

          {/* Recent Scans Table */}
          {scans.length > 0 && (
            <Paper sx={{ mt: 3 }}>
              <Box sx={{ p: 2 }}>
                <Typography variant="subtitle1" fontWeight="bold">
                  Recent Scans
                </Typography>
              </Box>
              <TableContainer>
                <Table size="small">
                  <TableHead>
                    <TableRow>
                      <TableCell>Date & Time</TableCell>
                      <TableCell>Device</TableCell>
                      <TableCell>Browser</TableCell>
                      <TableCell>Location</TableCell>
                      <TableCell>Type</TableCell>
                    </TableRow>
                  </TableHead>
                  <TableBody>
                    {scans.slice(0, 10).map((scan) => (
                      <TableRow key={scan.id}>
                        <TableCell>
                          {new Date(scan.scanned_at).toLocaleString('en-US', {
                            month: 'short',
                            day: 'numeric',
                            hour: '2-digit',
                            minute: '2-digit',
                          })}
                        </TableCell>
                        <TableCell>
                          <Stack direction="row" spacing={0.5} alignItems="center">
                            {(() => {
                              const IconComponent = DEVICE_ICONS[scan.device_type?.toLowerCase()] || DevicePhoneMobileIcon;
                              return <IconComponent className="h-4 w-4 text-gray-500" />;
                            })()}
                            <span>{scan.device_type || 'Unknown'}</span>
                          </Stack>
                        </TableCell>
                        <TableCell>{scan.browser || 'Unknown'}</TableCell>
                        <TableCell>
                          {[scan.city, scan.country].filter(Boolean).join(', ') || 'Unknown'}
                        </TableCell>
                        <TableCell>
                          <Chip
                            size="small"
                            label={scan.is_unique_scan ? 'New' : 'Return'}
                            color={scan.is_unique_scan ? 'success' : 'default'}
                            variant="outlined"
                          />
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </TableContainer>
              {scans.length > 10 && (
                <Box sx={{ p: 2, textAlign: 'center' }}>
                  <Typography variant="caption" color="text.secondary">
                    Showing 10 of {scans.length} recent scans
                  </Typography>
                </Box>
              )}
            </Paper>
          )}
        </>
      )}
    </Box>
  );
}
