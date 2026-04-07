import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { formatCurrency } from '../utils/formatters';
import {
  Box,
  Card,
  CardContent,
  Typography,
  Button,
  Chip,
  Grid,
  Paper,
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TableRow,
  CircularProgress,
  Alert,
  FormControl,
  InputLabel,
  Select,
  MenuItem,
  Checkbox,
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions,
  IconButton
} from '@mui/material';
import {
  ArrowLeftIcon,
  ChartBarIcon,
  ArrowTrendingUpIcon,
  UserGroupIcon,
  CurrencyDollarIcon,
  AcademicCapIcon,
  MapPinIcon,
  TagIcon,
  XMarkIcon
} from '@heroicons/react/24/outline';
import axios from 'axios';
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
  Tooltip as RechartsTooltip,
  Legend,
  ResponsiveContainer,
  ReferenceLine
} from 'recharts';
// ALV Distribution Analysis Component (copied from ClientManagement)
const ALVDistributionAnalysis = ({ individualLTVs, metrics, formatCurrency }) => {
  // Calculate statistics
  const sortedLTVs = [...individualLTVs].sort((a, b) => a - b);
  const count = sortedLTVs.length;
  const mean = metrics.avg_lifetime_value || 0;
  const median = metrics.median_lifetime_value || 0;
  
  // Calculate standard deviation
  const variance = sortedLTVs.reduce((acc, val) => acc + Math.pow(val - mean, 2), 0) / count;
  const stdDev = Math.sqrt(variance);
  
  // Calculate percentiles
  const getPercentile = (arr, percentile) => {
    const index = Math.ceil((percentile / 100) * arr.length) - 1;
    return arr[Math.max(0, index)];
  };
  
  const p25 = getPercentile(sortedLTVs, 25);
  const p75 = getPercentile(sortedLTVs, 75);
  const p90 = metrics.p90_lifetime_value || getPercentile(sortedLTVs, 90);
  const p95 = getPercentile(sortedLTVs, 95);
  const p99 = getPercentile(sortedLTVs, 99);
  
  // Calculate min and max
  const min = sortedLTVs[0] || 0;
  const max = sortedLTVs[sortedLTVs.length - 1] || 0;
  
  // Calculate coefficient of variation (CV)
  const cv = mean > 0 ? (stdDev / mean) * 100 : 0;
  
  // Identify outliers (values beyond 3 standard deviations)
  const outliers = sortedLTVs.filter(val => Math.abs(val - mean) > 3 * stdDev);
  const outlierCount = outliers.length;
  const outlierPercentage = (outlierCount / count) * 100;
  
  // Calculate mean vs median difference
  const meanMedianDiff = mean - median;
  const meanMedianDiffPct = median > 0 ? ((mean - median) / median) * 100 : 0;
  
  // Create histogram bins
  const createBins = () => {
    const binCount = 30; // Number of bins for detailed visualization
    const binWidth = (max - min) / binCount;
    const bins = Array(binCount).fill(0).map((_, i) => ({
      min: min + i * binWidth,
      max: min + (i + 1) * binWidth,
      count: 0,
      label: formatCurrency(min + i * binWidth)
    }));
    
    sortedLTVs.forEach(ltv => {
      const binIndex = Math.min(
        Math.floor((ltv - min) / binWidth),
        binCount - 1
      );
      if (binIndex >= 0) bins[binIndex].count++;
    });
    
    return bins.map(bin => ({
      ...bin,
      mid: (bin.min + bin.max) / 2,
      range: `${formatCurrency(bin.min)} - ${formatCurrency(bin.max)}`
    }));
  };
  
  const bins = createBins();
  
  // Prepare chart data with reference lines
  const chartData = bins.map(bin => ({
    ...bin,
    value: bin.mid,
    count: bin.count
  }));
  
  // Determine recommendation
  const getRecommendation = () => {
    if (meanMedianDiffPct > 30) {
      return {
        metric: 'median',
        reason: `The mean is ${meanMedianDiffPct.toFixed(1)}% higher than the median, indicating significant skew from high-value outliers.`,
        explanation: 'Using median will provide a more representative value for ROAS calculations, as it\'s less affected by extreme values.'
      };
    } else if (meanMedianDiffPct < -10) {
      return {
        metric: 'median',
        reason: `The mean is ${Math.abs(meanMedianDiffPct).toFixed(1)}% lower than the median, indicating a long tail of low values.`,
        explanation: 'Using median will provide a more stable value that better represents typical client value.'
      };
    } else {
      return {
        metric: 'mean',
        reason: `The mean and median are relatively close (${meanMedianDiffPct.toFixed(1)}% difference), indicating a balanced distribution.`,
        explanation: 'The distribution is relatively symmetric, so the mean provides a good representation of average client value.'
      };
    }
  };
  
  const recommendation = getRecommendation();
  
  return (
    <Box>
      {/* Key Statistics Grid */}
      <Grid container spacing={3} sx={{ mb: 4 }}>
        <Grid item xs={12} sm={6} md={3}>
          <Card variant="outlined" sx={{ height: '100%' }}>
            <CardContent>
              <Typography variant="body2" color="text.secondary" gutterBottom>
                Mean (Average)
              </Typography>
              <Typography variant="h5" fontWeight="bold" color="success.main">
                {formatCurrency(mean)}
              </Typography>
              <Typography variant="caption" color="text.secondary" mt={1}>
                {count.toLocaleString()} clients
              </Typography>
            </CardContent>
          </Card>
        </Grid>
        <Grid item xs={12} sm={6} md={3}>
          <Card variant="outlined" sx={{ height: '100%' }}>
            <CardContent>
              <Typography variant="body2" color="text.secondary" gutterBottom>
                Median
              </Typography>
              <Typography variant="h5" fontWeight="bold" color="primary.main">
                {formatCurrency(median)}
              </Typography>
              <Typography variant="caption" color="text.secondary" mt={1}>
                {meanMedianDiffPct > 0 ? '+' : ''}{meanMedianDiffPct.toFixed(1)}% vs mean
              </Typography>
            </CardContent>
          </Card>
        </Grid>
        <Grid item xs={12} sm={6} md={3}>
          <Card variant="outlined" sx={{ height: '100%' }}>
            <CardContent>
              <Typography variant="body2" color="text.secondary" gutterBottom>
                Standard Deviation
              </Typography>
              <Typography variant="h5" fontWeight="bold" color="warning.main">
                {formatCurrency(stdDev)}
              </Typography>
              <Typography variant="caption" color="text.secondary" mt={1}>
                CV: {cv.toFixed(1)}%
              </Typography>
            </CardContent>
          </Card>
        </Grid>
        <Grid item xs={12} sm={6} md={3}>
          <Card variant="outlined" sx={{ height: '100%' }}>
            <CardContent>
              <Typography variant="body2" color="text.secondary" gutterBottom>
                Outliers
              </Typography>
              <Typography variant="h5" fontWeight="bold" color="error.main">
                {outlierCount}
              </Typography>
              <Typography variant="caption" color="text.secondary" mt={1}>
                {outlierPercentage.toFixed(1)}% of clients
              </Typography>
            </CardContent>
          </Card>
        </Grid>
      </Grid>

      {/* Distribution Chart */}
      <Card sx={{ mb: 3 }}>
        <CardContent>
          <Typography variant="h6" gutterBottom fontWeight="bold">
            Lifetime Value Distribution
          </Typography>
          <Typography variant="body2" color="text.secondary" sx={{ mb: 3 }}>
            Visual representation of client lifetime values with mean and median markers
          </Typography>
          <ResponsiveContainer width="100%" height={400}>
            <BarChart data={chartData} margin={{ top: 20, right: 30, left: 20, bottom: 60 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="#e0e0e0" />
              <XAxis 
                dataKey="value" 
                tickFormatter={(value) => {
                  // Show every 5th label to avoid overcrowding
                  const index = chartData.findIndex(d => d.value === value);
                  return index % 5 === 0 ? formatCurrency(value) : '';
                }}
                angle={-45}
                textAnchor="end"
                height={80}
                label={{ value: 'Lifetime Value ($)', position: 'insideBottom', offset: -10 }}
              />
              <YAxis 
                label={{ value: 'Number of Clients', angle: -90, position: 'insideLeft' }}
              />
              <RechartsTooltip 
                formatter={(value, name) => [value, 'Clients']}
                labelFormatter={(label) => {
                  const bin = chartData.find(b => b.value === label);
                  return bin ? bin.range : formatCurrency(label);
                }}
              />
              <ReferenceLine 
                x={mean} 
                stroke="#4caf50" 
                strokeWidth={2}
                strokeDasharray="5 5"
                label={{ value: `Mean: ${formatCurrency(mean)}`, position: 'top', fill: '#4caf50' }}
              />
              <ReferenceLine 
                x={median} 
                stroke="#1976d2" 
                strokeWidth={3}
                label={{ value: `Median: ${formatCurrency(median)}`, position: 'top', fill: '#1976d2', fontSize: 12, fontWeight: 'bold' }}
              />
              <Bar dataKey="count" fill="#8884d8" radius={[4, 4, 0, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </CardContent>
      </Card>

      {/* Percentiles and Insights */}
      <Grid container spacing={3}>
        <Grid item xs={12} md={6}>
          <Card>
            <CardContent>
              <Typography variant="h6" gutterBottom fontWeight="bold">
                Percentile Breakdown
              </Typography>
              <Box sx={{ mt: 2 }}>
                <Grid container spacing={2}>
                  <Grid item xs={6}>
                    <Typography variant="body2" color="text.secondary">Minimum</Typography>
                    <Typography variant="body1" fontWeight="bold">{formatCurrency(min)}</Typography>
                  </Grid>
                  <Grid item xs={6}>
                    <Typography variant="body2" color="text.secondary">P25</Typography>
                    <Typography variant="body1" fontWeight="bold">{formatCurrency(p25)}</Typography>
                  </Grid>
                  <Grid item xs={6}>
                    <Typography variant="body2" color="text.secondary">P75</Typography>
                    <Typography variant="body1" fontWeight="bold">{formatCurrency(p75)}</Typography>
                  </Grid>
                  <Grid item xs={6}>
                    <Typography variant="body2" color="text.secondary">P90</Typography>
                    <Typography variant="body1" fontWeight="bold">{formatCurrency(p90)}</Typography>
                  </Grid>
                  <Grid item xs={6}>
                    <Typography variant="body2" color="text.secondary">P95</Typography>
                    <Typography variant="body1" fontWeight="bold">{formatCurrency(p95)}</Typography>
                  </Grid>
                  <Grid item xs={6}>
                    <Typography variant="body2" color="text.secondary">P99</Typography>
                    <Typography variant="body1" fontWeight="bold">{formatCurrency(p99)}</Typography>
                  </Grid>
                  <Grid item xs={6}>
                    <Typography variant="body2" color="text.secondary">Maximum</Typography>
                    <Typography variant="body1" fontWeight="bold">{formatCurrency(max)}</Typography>
                  </Grid>
                  <Grid item xs={6}>
                    <Typography variant="body2" color="text.secondary">Range</Typography>
                    <Typography variant="body1" fontWeight="bold">{formatCurrency(max - min)}</Typography>
                  </Grid>
                </Grid>
              </Box>
            </CardContent>
          </Card>
        </Grid>
        <Grid item xs={12} md={6}>
          <Card>
            <CardContent>
              <Typography variant="h6" gutterBottom fontWeight="bold">
                Distribution Insights
              </Typography>
              <Box sx={{ mt: 2 }}>
                <Typography variant="body2" paragraph>
                  <strong>Mean vs Median:</strong> {meanMedianDiff > 0 
                    ? `The mean (${formatCurrency(mean)}) is ${formatCurrency(Math.abs(meanMedianDiff))} (${meanMedianDiffPct.toFixed(1)}%) higher than the median (${formatCurrency(median)}), showing a right-skewed distribution driven by a small group of high-value clients.`
                    : `The mean (${formatCurrency(mean)}) is ${formatCurrency(Math.abs(meanMedianDiff))} (${Math.abs(meanMedianDiffPct).toFixed(1)}%) lower than the median (${formatCurrency(median)}), indicating a left-skewed distribution.`
                  }
                </Typography>
                <Typography variant="body2" paragraph>
                  <strong>Variability:</strong> The coefficient of variation is {cv.toFixed(1)}%, indicating {
                    cv > 100 ? 'high variability' : cv > 50 ? 'moderate variability' : 'low variability'
                  } in client lifetime values.
                </Typography>
                <Typography variant="body2" paragraph>
                  <strong>Outliers:</strong> {outlierCount} client{outlierCount !== 1 ? 's' : ''} ({outlierPercentage.toFixed(1)}%) have values beyond 3 standard deviations from the mean. {
                    outlierPercentage > 5 ? 'This suggests significant skew from high-value clients.' : 'The distribution is relatively normal.'
                  }
                </Typography>
                <Typography variant="body2">
                  <strong>Spread:</strong> The range from P25 to P75 (interquartile range) is {formatCurrency(p75 - p25)}, showing {
                    (p75 - p25) / median > 1 ? 'significant spread' : 'moderate spread'
                  } in the middle 50% of clients.
                </Typography>
              </Box>
            </CardContent>
          </Card>
        </Grid>
      </Grid>

      {/* Recommendation Card */}
      <Card sx={{ mt: 3, bgcolor: recommendation.metric === 'median' ? 'info.light' : 'success.light' }}>
        <CardContent>
          <Box sx={{ display: 'flex', alignItems: 'start', gap: 2 }}>
            <Box sx={{ 
              bgcolor: recommendation.metric === 'median' ? 'info.main' : 'success.main',
              color: 'white',
              borderRadius: '50%',
              width: 48,
              height: 48,
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              flexShrink: 0
            }}>
              <Typography variant="h6" fontWeight="bold">
                {recommendation.metric === 'median' ? 'M' : 'A'}
              </Typography>
            </Box>
            <Box sx={{ flex: 1 }}>
              <Typography variant="h6" gutterBottom fontWeight="bold">
                Recommendation: Use {recommendation.metric === 'median' ? 'Median' : 'Mean'} for ROAS Calculations
              </Typography>
              <Typography variant="body2" paragraph sx={{ mt: 1 }}>
                {recommendation.reason}
              </Typography>
              <Typography variant="body2" color="text.secondary">
                {recommendation.explanation}
              </Typography>
              <Box sx={{ mt: 2, p: 2, bgcolor: 'background.paper', borderRadius: 1 }}>
                <Typography variant="body2" fontWeight="bold" gutterBottom>
                  Recommended Value:
                </Typography>
                <Typography variant="h5" fontWeight="bold" color="primary.main">
                  {formatCurrency(recommendation.metric === 'median' ? median : mean)}
                </Typography>
              </Box>
            </Box>
          </Box>
        </CardContent>
      </Card>
    </Box>
  );
};

const ClientsAnalytics = () => {
  const navigate = useNavigate();
  const [analyticsData, setAnalyticsData] = useState(null);
  const [analyticsLoading, setAnalyticsLoading] = useState(false);
  const [analyticsError, setAnalyticsError] = useState(null);
  const [filters, setFilters] = useState({
    labels: [],
    dateRange: { start: '', end: '' },
    minLessons: 1
  });
  const [pendingLabels, setPendingLabels] = useState([]);
  const [availableLabels, setAvailableLabels] = useState([]);
  const [labelColors, setLabelColors] = useState({});
  const [alvModalOpen, setAlvModalOpen] = useState(false);

  useEffect(() => {
    // Fetch available labels
    fetch('/api/labels')
      .then(res => res.json())
      .then(data => {
        if (data.labels) {
          const labels = data.labels.map(l => l.name || l.machine_name).filter(Boolean);
          setAvailableLabels(labels);
          const colors = {};
          data.labels.forEach(l => {
            const name = l.name || l.machine_name;
            if (name && l.color) {
              colors[name] = l.color;
            }
          });
          setLabelColors(colors);
        }
      })
      .catch(err => console.error('Error fetching labels:', err));

    fetchAnalytics();
  }, []);

  const fetchAnalytics = async () => {
    setAnalyticsLoading(true);
    setAnalyticsError(null);
    try {
      const response = await axios.post('/api/crm/analytics/client-metrics', {
        labels: filters.labels,
        dateRange: filters.dateRange,
        minLessons: filters.minLessons
      }, {
        withCredentials: true
      });
      setAnalyticsData(response.data);
    } catch (error) {
      console.error('Error fetching client analytics:', error);
      setAnalyticsError(error.message || 'Failed to fetch analytics');
    } finally {
      setAnalyticsLoading(false);
    }
  };

  const handleApplyLabels = () => {
    setFilters(prev => ({ ...prev, labels: pendingLabels }));
    setTimeout(() => {
      fetchAnalytics();
    }, 100);
  };


  const getContrastColor = (hexColor) => {
    if (!hexColor) return '#000000';
    const r = parseInt(hexColor.slice(1, 3), 16);
    const g = parseInt(hexColor.slice(3, 5), 16);
    const b = parseInt(hexColor.slice(5, 7), 16);
    const brightness = (r * 299 + g * 587 + b * 114) / 1000;
    return brightness > 128 ? '#000000' : '#FFFFFF';
  };

  if (analyticsLoading) {
    return (
        <div className="max-w-7xl mx-auto w-full px-4 sm:px-6 lg:px-8 py-4 sm:py-6">
          <Box sx={{ p: 3, display: 'flex', justifyContent: 'center', alignItems: 'center', minHeight: '400px' }}>
            <Box textAlign="center">
              <CircularProgress />
              <Typography variant="h6" gutterBottom sx={{ mt: 2 }}>Loading Analytics...</Typography>
              <Typography variant="body2" color="text.secondary">
                Fetching client metrics and insights
              </Typography>
            </Box>
          </Box>
        </div>
    );
  }

  if (analyticsError) {
    return (
        <div className="max-w-7xl mx-auto w-full px-4 sm:px-6 lg:px-8 py-4 sm:py-6 bg-white min-h-screen">
          <Box sx={{ p: 3, textAlign: 'center' }}>
            <Typography variant="h6" gutterBottom color="error">
              Error Loading Analytics
            </Typography>
            <Typography variant="body2" sx={{ color: '#333333' }} mb={2}>
              {analyticsError}
            </Typography>
            <Button variant="contained" onClick={fetchAnalytics}>
              Retry
            </Button>
          </Box>
        </div>
    );
  }

  if (!analyticsData || !analyticsData.metrics) {
    return (
        <div className="max-w-7xl mx-auto w-full px-4 sm:px-6 lg:px-8 py-4 sm:py-6 bg-white min-h-screen">
          <Box sx={{ p: 3, textAlign: 'center' }}>
            <Typography variant="h6" gutterBottom sx={{ color: '#000000' }}>No Analytics Data</Typography>
            <Typography variant="body2" sx={{ color: '#333333' }}>
              Analytics data will appear here once loaded
            </Typography>
          </Box>
        </div>
    );
  }

  const { metrics, topClients, distribution, cohorts, individualLTVs } = analyticsData;

  // Prepare data for charts
  const ltvProgression = cohorts?.map(cohort => ({
    month: cohort.first_lesson_month,
    avgLTV: parseFloat(cohort.avg_ltv || 0)
  })) || [];

  const ltvDistribution = distribution?.map(d => ({
    range: d.range,
    count: parseInt(d.count || 0)
  })) || [];

  const topClientsData = topClients?.slice(0, 10).map(client => ({
    name: client.client_name || 'Unknown',
    ltv: parseFloat(client.ltv || 0)
  })) || [];

  const COLORS = ['#50C8DF', '#6A469D', '#34B256', '#FACC29', '#F79A30', '#DA2E72'];

  return (
      <div className="max-w-7xl mx-auto w-full px-4 sm:px-6 lg:px-8 py-4 sm:py-6 bg-white min-h-screen">
        {/* Header */}
        <div className="mb-6">
          <Button
            startIcon={<ArrowLeftIcon className="h-5 w-5" />}
            onClick={() => navigate('/clients')}
            sx={{ mb: 2 }}
          >
            Back to Clients
          </Button>
          <Typography variant="h4" fontWeight="bold" gutterBottom sx={{ color: '#000000' }}>
            Client Analytics
          </Typography>
          <Typography variant="body2" sx={{ color: '#333333' }}>
            Comprehensive insights into client lifetime value, retention, and engagement
          </Typography>
        </div>

        {/* Filter by Labels */}
        <Card sx={{ mb: 3 }}>
          <CardContent>
            <Grid container spacing={2} alignItems="center">
              <Grid item xs={12} md={4}>
                <FormControl fullWidth>
                  <InputLabel id="analytics-filter-labels-label" shrink={pendingLabels.length > 0}>
                    Filter by Service Labels
                  </InputLabel>
                  <Select
                    labelId="analytics-filter-labels-label"
                    multiple
                    value={pendingLabels}
                    onChange={(e) => setPendingLabels(e.target.value)}
                    renderValue={(selected) => (
                      <Box sx={{ display: 'flex', flexWrap: 'wrap', gap: 0.5 }}>
                        {selected.map((value) => {
                          const labelColor = labelColors[value] || '#d3d3d3';
                          return (
                            <Chip
                              key={value}
                              label={value}
                              size="small"
                              onDelete={(e) => {
                                e.preventDefault();
                                e.stopPropagation();
                                setPendingLabels(prev => prev.filter(l => l !== value));
                              }}
                              style={{
                                backgroundColor: labelColor,
                                color: getContrastColor(labelColor),
                                fontWeight: 500
                              }}
                            />
                          );
                        })}
                      </Box>
                    )}
                  >
                    {availableLabels.map((label) => (
                      <MenuItem key={label} value={label}>
                        <Checkbox checked={pendingLabels.includes(label)} />
                        <span>{label}</span>
                      </MenuItem>
                    ))}
                  </Select>
                </FormControl>
              </Grid>
              <Grid item xs={12} md={2}>
                <Button
                  variant="contained"
                  color="primary"
                  onClick={handleApplyLabels}
                  disabled={JSON.stringify([...pendingLabels].sort()) === JSON.stringify([...filters.labels].sort())}
                  fullWidth
                >
                  Apply Filters
                </Button>
              </Grid>
            </Grid>
          </CardContent>
        </Card>

        {/* KPI Cards */}
        <Grid container spacing={3} mb={3}>
          <Grid item xs={12} sm={6} md={3}>
            <Card>
              <CardContent>
                <Typography variant="body2" color="text.secondary" gutterBottom>
                  Total Lifetime Value
                </Typography>
                <Typography variant="h4" fontWeight="bold" color="primary.main">
                  {formatCurrency(metrics.total_lifetime_value || 0)}
                </Typography>
                <Typography variant="caption" color="text.secondary" mt={1}>
                  {(metrics.total_active_clients || 0).toLocaleString()} active clients
                </Typography>
              </CardContent>
            </Card>
          </Grid>
          <Grid item xs={12} sm={6} md={3}>
            <Card
              sx={{
                cursor: 'pointer',
                transition: 'all 0.2s ease-in-out',
                '&:hover': {
                  transform: 'translateY(-2px)',
                  boxShadow: 4
                }
              }}
              onClick={() => setAlvModalOpen(true)}
            >
              <CardContent>
                <Typography variant="body2" color="text.secondary" gutterBottom>
                  Average Lifetime Value
                </Typography>
                <Typography variant="h4" fontWeight="bold" color="success.main">
                  {formatCurrency(metrics.avg_lifetime_value || 0)}
                </Typography>
                <Typography variant="caption" color="text.secondary" mt={1}>
                  Median: {formatCurrency(metrics.median_lifetime_value || 0)}
                </Typography>
                <Typography variant="caption" color="primary.main" mt={1} sx={{ display: 'block', fontWeight: 500 }}>
                  Click to view detailed analysis →
                </Typography>
              </CardContent>
            </Card>
          </Grid>
          <Grid item xs={12} sm={6} md={3}>
            <Card>
              <CardContent>
                <Typography variant="body2" color="text.secondary" gutterBottom>
                  Total Lessons Completed
                </Typography>
                <Typography variant="h4" fontWeight="bold" color="info.main">
                  {(metrics.total_lessons_completed || 0).toLocaleString()}
                </Typography>
                <Typography variant="caption" color="text.secondary" mt={1}>
                  Avg: {parseFloat(metrics.avg_lessons_per_client || 0).toFixed(1)} per client
                </Typography>
              </CardContent>
            </Card>
          </Grid>
          <Grid item xs={12} sm={6} md={3}>
            <Card>
              <CardContent>
                <Typography variant="body2" color="text.secondary" gutterBottom>
                  Total Students
                </Typography>
                <Typography variant="h4" fontWeight="bold" color="warning.main">
                  {(metrics.total_students || 0).toLocaleString()}
                </Typography>
                <Typography variant="caption" color="text.secondary" mt={1}>
                  Avg: {parseFloat(metrics.avg_students_per_client || 0).toFixed(1)} per client
                </Typography>
              </CardContent>
            </Card>
          </Grid>
        </Grid>

        {/* Charts Row */}
        <Grid container spacing={3} mb={3}>
          <Grid item xs={12} md={6}>
            <Card>
              <CardContent>
                <Typography variant="h6" gutterBottom>
                  Lifetime Value Progression
                </Typography>
                <ResponsiveContainer width="100%" height={300}>
                  <LineChart data={ltvProgression}>
                    <CartesianGrid strokeDasharray="3 3" />
                    <XAxis dataKey="month" angle={-45} textAnchor="end" height={100} />
                    <YAxis />
                    <RechartsTooltip formatter={(value) => formatCurrency(value)} />
                    <Legend />
                    <Line type="monotone" dataKey="avgLTV" stroke="#6A469D" strokeWidth={2} name="Avg LTV" />
                  </LineChart>
                </ResponsiveContainer>
              </CardContent>
            </Card>
          </Grid>
          <Grid item xs={12} md={6}>
            <Card>
              <CardContent>
                <Typography variant="h6" gutterBottom>
                  Lifetime Value Distribution
                </Typography>
                <ResponsiveContainer width="100%" height={300}>
                  <BarChart data={ltvDistribution}>
                    <CartesianGrid strokeDasharray="3 3" />
                    <XAxis dataKey="range" />
                    <YAxis />
                    <RechartsTooltip />
                    <Legend />
                    <Bar dataKey="count" fill="#6A469D" name="Client Count" />
                  </BarChart>
                </ResponsiveContainer>
              </CardContent>
            </Card>
          </Grid>
        </Grid>

        {/* Top Clients Table */}
        {topClients && topClients.length > 0 && (
          <Card sx={{ mb: 3 }}>
            <CardContent>
              <Typography variant="h6" gutterBottom>
                Top 10 Clients by Lifetime Value
              </Typography>
              <TableContainer>
                <Table>
                  <TableHead>
                    <TableRow>
                      <TableCell>Client Name</TableCell>
                      <TableCell>Email</TableCell>
                      <TableCell align="right">Lifetime Value</TableCell>
                    </TableRow>
                  </TableHead>
                  <TableBody>
                    {topClients.slice(0, 10).map((client) => (
                      <TableRow key={client.client_id} hover>
                        <TableCell>
                          <Typography variant="body2" fontWeight="medium">
                            {client.client_name || 'Unknown'}
                          </Typography>
                        </TableCell>
                        <TableCell>
                          <Typography variant="body2">
                            {client.email || 'N/A'}
                          </Typography>
                        </TableCell>
                        <TableCell align="right">
                          <Typography variant="body2" fontWeight="bold" color="primary.main">
                            {formatCurrency(client.ltv || 0)}
                          </Typography>
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </TableContainer>
            </CardContent>
          </Card>
        )}

        {/* ALV Distribution Modal */}
        <Dialog
          open={alvModalOpen}
          onClose={() => setAlvModalOpen(false)}
          maxWidth="lg"
          fullWidth
          PaperProps={{
            sx: {
              maxHeight: '90vh',
              borderRadius: 2
            }
          }}
        >
          <DialogTitle sx={{ 
            display: 'flex', 
            justifyContent: 'space-between', 
            alignItems: 'center',
            pb: 2,
            borderBottom: '1px solid',
            borderColor: 'divider'
          }}>
            <Box>
              <Typography variant="h5" fontWeight="bold">
                Average Lifetime Value - Detailed Analysis
              </Typography>
              <Typography variant="body2" color="text.secondary" mt={0.5}>
                Comprehensive distribution analysis to help determine the best metric for ROAS calculations
              </Typography>
            </Box>
            <IconButton onClick={() => setAlvModalOpen(false)} size="small">
              <XMarkIcon className="h-5 w-5" />
            </IconButton>
          </DialogTitle>
          <DialogContent sx={{ pt: 3 }}>
            {analyticsData && analyticsData.individualLTVs && analyticsData.individualLTVs.length > 0 ? (
              <ALVDistributionAnalysis 
                individualLTVs={Array.isArray(analyticsData.individualLTVs) ? analyticsData.individualLTVs : []}
                metrics={analyticsData.metrics}
                formatCurrency={formatCurrency}
              />
            ) : (
              <Box sx={{ p: 4, textAlign: 'center' }}>
                <Typography variant="body1" color="text.secondary">
                  No distribution data available. Please ensure analytics data has been loaded.
                </Typography>
              </Box>
            )}
          </DialogContent>
          <DialogActions sx={{ px: 3, py: 2, borderTop: '1px solid', borderColor: 'divider' }}>
            <Button onClick={() => setAlvModalOpen(false)} variant="contained" color="primary">
              Close
            </Button>
          </DialogActions>
        </Dialog>
      </div>
  );
};

export default ClientsAnalytics;

