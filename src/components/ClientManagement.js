import React, { useState, useEffect, useRef, lazy, Suspense } from 'react';
import { useNavigate } from 'react-router-dom';
import { formatCurrency } from '../utils/formatters';
import {
  Box,
  Card,
  CardContent,
  Typography,
  TextField,
  Button,
  Chip,
  Avatar,
  IconButton,
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions,
  Tabs,
  Tab,
  Grid,
  Paper,
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TableRow,
  TablePagination,
  FormControl,
  InputLabel,
  Select,
  MenuItem,
  InputAdornment,
  Badge,
  Tooltip,
  Divider,
  List,
  ListItem,
  ListItemText,
  ListItemAvatar,
  ListItemSecondaryAction,
  Checkbox,
  CircularProgress
} from '@mui/material';
import {
  MagnifyingGlassIcon,
  FunnelIcon,
  UserIcon,
  EnvelopeIcon,
  PhoneIcon,
  MapPinIcon,
  CurrencyDollarIcon,
  ArrowTrendingUpIcon,
  CalendarDaysIcon,
  AcademicCapIcon,
  TagIcon,
  EllipsisVerticalIcon,
  PencilSquareIcon,
  TrashIcon,
  PlusIcon,
  EyeIcon,
  StarIcon,
  XMarkIcon,
  ChartBarIcon,
  ArrowDownTrayIcon,
  ArrowTopRightOnSquareIcon,
  ChevronLeftIcon,
  ChevronRightIcon,
  ChevronDoubleLeftIcon,
  ChevronDoubleRightIcon,
  DocumentChartBarIcon,
  ViewColumnsIcon,
} from '@heroicons/react/24/outline';
import { StarIcon as StarSolidIcon } from '@heroicons/react/24/solid';
import axios from 'axios';
import { useToast } from '../hooks/useToast';
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

const FailedPaymentTracker = lazy(() => import('./FailedPaymentTracker'));
const AllClientReports = lazy(() => import('./AllClientReports'));
const ChurnRiskTab = lazy(() => import('./ChurnRiskTab'));

// ALV Distribution Analysis Component
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

// Static style constants
const linkStyle = {
  color: '#1976d2',
  textDecoration: 'none',
  cursor: 'pointer'
};

const chipStyle = {
  fontWeight: 500
};

const flexCenterStyle = {
  display: 'flex',
  alignItems: 'center'
};

const iframeStyle = {
  width: '100%',
  minHeight: '500px',
  border: 'none',
  backgroundColor: 'white'
};

// Enhanced Client Management Component with Enterprise CRM Features
const ClientManagement = () => {
  const toast = useToast();
  const navigate = useNavigate();
  // State management
  const [clients, setClients] = useState([]);
  const [filteredClients, setFilteredClients] = useState([]);
  const [loading, setLoading] = useState(false);
  const [searchTerm, setSearchTerm] = useState('');
  const [page, setPage] = useState(0);
  const [rowsPerPage, setRowsPerPage] = useState(25);
  const [sortBy, setSortBy] = useState('total_revenue');
  const [sortOrder, setSortOrder] = useState('desc');
  const [statusFilter, setStatusFilter] = useState(''); // 'live', 'dormant', or '' for all
  const [filters, setFilters] = useState({
    labels: [],
    dateRange: { start: '', end: '' },
    lifetimeValue: { min: 0, max: null }
  });
  const [pendingLabels, setPendingLabels] = useState([]); // Labels selected but not yet applied
  const [availableLabels, setAvailableLabels] = useState([]);
  const [labelColors, setLabelColors] = useState({}); // Map of label name to color
  const [statusCounts, setStatusCounts] = useState({
    total: 0,
    live: 0,
    dormant: 0
  });
  const [totalCount, setTotalCount] = useState(0);
  const [moreFiltersOpen, setMoreFiltersOpen] = useState(false);
  const [mainTab, setMainTab] = useState(0); // 0 = Clients, 1 = Analytics
  const [analyticsData, setAnalyticsData] = useState(null);
  const [analyticsLoading, setAnalyticsLoading] = useState(false);
  const [analyticsError, setAnalyticsError] = useState(null);
  const [milestonesData, setMilestonesData] = useState(null);
  const [retentionData, setRetentionData] = useState(null);
  const [behaviorData, setBehaviorData] = useState(null);
  const [milestoneClientsModalOpen, setMilestoneClientsModalOpen] = useState(false);
  const [selectedMilestone, setSelectedMilestone] = useState(null);
  const [milestoneClients, setMilestoneClients] = useState([]);
  const [milestoneClientsLoading, setMilestoneClientsLoading] = useState(false);
  const [milestoneClientsPage, setMilestoneClientsPage] = useState(0);
  const [milestoneClientsTotal, setMilestoneClientsTotal] = useState(0);
  const [emailPreviewOpen, setEmailPreviewOpen] = useState(false);
  const [emailPreviewContent, setEmailPreviewContent] = useState('');
  const [emailPreviewLoading, setEmailPreviewLoading] = useState(false);
  const [emailPreviewSubject, setEmailPreviewSubject] = useState('');
  const [selectedEmailId, setSelectedEmailId] = useState(null);
  const [alvModalOpen, setAlvModalOpen] = useState(false);
  const [kebabAnchor, setKebabAnchor] = useState(null);
  const [kebabClientId, setKebabClientId] = useState(null);
  const [visibleColumns, setVisibleColumns] = useState({
    client: true, id: true, lifetime_value: true, lessons: true,
    students: true, status: true, labels: false,
  });
  const [columnsMenuAnchor, setColumnsMenuAnchor] = useState(null);

  // Resizable columns state - persisted in localStorage
  const colStorageKey = 'columnWidths_clients';
  const [columnWidths, setColumnWidths] = useState(() => {
    try {
      const saved = localStorage.getItem(colStorageKey);
      return saved ? JSON.parse(saved) : {};
    } catch { return {}; }
  });
  const [resizing, setResizing] = useState(null);

  useEffect(() => {
    if (Object.keys(columnWidths).length > 0) {
      localStorage.setItem(colStorageKey, JSON.stringify(columnWidths));
    }
  }, [columnWidths]);

  const handleResizeStart = (e, colKey) => {
    e.preventDefault();
    e.stopPropagation();
    const th = e.target.closest('th');
    setResizing({ colKey, startX: e.clientX, startWidth: th.offsetWidth });
  };

  useEffect(() => {
    if (!resizing) return;
    const handleMouseMove = (e) => {
      const diff = e.clientX - resizing.startX;
      const newWidth = Math.max(80, resizing.startWidth + diff);
      setColumnWidths(prev => ({ ...prev, [resizing.colKey]: newWidth }));
    };
    const handleMouseUp = () => setResizing(null);
    document.addEventListener('mousemove', handleMouseMove);
    document.addEventListener('mouseup', handleMouseUp);
    return () => {
      document.removeEventListener('mousemove', handleMouseMove);
      document.removeEventListener('mouseup', handleMouseUp);
    };
  }, [resizing]);

  // Fetch clients data
  const fetchClients = async () => {
    setLoading(true);
    try {
      const response = await axios.post('/api/client-overview-test', {
        page: page + 1,
        limit: rowsPerPage,
        search: searchTerm,
        labels: filters.labels || [],
        status: statusFilter || '', // Use statusFilter instead of filters.status
        dateRange: filters.dateRange || { start: '', end: '' },
        lifetimeValueMin: filters.lifetimeValue?.min || 0,
        lifetimeValueMax: filters.lifetimeValue?.max || null
      }, {
        withCredentials: true,
      });

      setClients(response.data.clientOverview || response.data);
      setFilteredClients(response.data.clientOverview || response.data);
      setTotalCount(response.data.pagination?.total || 0);
    } catch (error) {
      console.error('Error fetching clients:', error);
    } finally {
      setLoading(false);
    }
  };

  // Fetch status counts for filter buttons
  const fetchStatusCounts = async () => {
    try {
      const axiosOpts = { withCredentials: true };
      const [totalResponse, liveResponse, dormantResponse] = await Promise.all([
        axios.post('/api/client-overview-test', {
          page: 1,
          limit: 1,
          search: '',
          labels: [],
          status: ''
        }, axiosOpts),
        axios.post('/api/client-overview-test', {
          page: 1,
          limit: 1,
          search: '',
          labels: [],
          status: 'live'
        }, axiosOpts),
        axios.post('/api/client-overview-test', {
          page: 1,
          limit: 1,
          search: '',
          labels: [],
          status: 'dormant'
        }, axiosOpts)
      ]);

      setStatusCounts({
        total: totalResponse.data.pagination?.total || 0,
        live: liveResponse.data.pagination?.total || 0,
        dormant: dormantResponse.data.pagination?.total || 0
      });
    } catch (error) {
      console.error('Error fetching status counts:', error);
    }
  };

  // Get client display name
  const getClientDisplayName = (client) => {
    if (client.client_name) return client.client_name;
    if (client.first_name || client.last_name) {
      return `${client.first_name || ''} ${client.last_name || ''}`.trim();
    }
    return client.email || 'Unknown Client';
  };

  // Extract label name from label object or string
  const getLabelName = (label) => {
    if (!label) return '';
    if (typeof label === 'string') return label;
    if (typeof label === 'object' && label.name) return label.name;
    return String(label);
  };

  // Get contrasting text color for a background color
  const getContrastColor = (hexColor) => {
    if (!hexColor) return '#ffffff';
    
    // Handle named colors
    if (typeof hexColor !== 'string' || !hexColor.startsWith('#')) {
      // Common named colors that need dark text
      const darkTextColors = ['yellow', 'gold', 'lightgreen', 'lightgray', '#d3d3d3', '#ffebcd', 'BlanchedAlmond', 'white', '#ffffff'];
      const colorLower = String(hexColor).toLowerCase();
      if (darkTextColors.includes(colorLower) || darkTextColors.includes(hexColor)) {
        return '#000000';
      }
      return '#ffffff';
    }
    
    // Convert hex to RGB
    const hex = hexColor.replace('#', '');
    if (hex.length !== 6) return '#ffffff';
    
    try {
      const r = parseInt(hex.substr(0, 2), 16);
      const g = parseInt(hex.substr(2, 2), 16);
      const b = parseInt(hex.substr(4, 2), 16);
      
      // Calculate relative luminance
      const luminance = (0.299 * r + 0.587 * g + 0.114 * b) / 255;
      
      // Return black for light colors, white for dark colors
      return luminance > 0.5 ? '#000000' : '#ffffff';
    } catch (e) {
      return '#ffffff';
    }
  };

  // Fetch available labels from API
  const fetchLabels = async () => {
    // Whitelist of allowed labels for filtering (alphabetically sorted)
    const allowedLabels = [
      'Club - Park Slope',
      'Club - UES',
      'Home - Hamptons',
      'Home - LA',
      'Home - NYC',
      'Home - SF',
      'Home - Westchester',
      'No Label',
      'Non-Billable',
      'Online',
      'School - Hamptons',
      'School - LA',
      'School - NYC',
      'School - SF',
      'Tournament'
    ];
    
    try {
      // Use the tutorcruncher-data endpoint which already works
      let response;
      try {
        response = await axios.get('/api/tutorcruncher-data/labels', {
          withCredentials: true,
          timeout: 10000 // 10 second timeout
        });
      } catch (axiosError) {
        console.error('❌ Axios call failed:', axiosError);
        console.error('❌ Axios error message:', axiosError.message);
        console.error('❌ Axios error code:', axiosError.code);
        console.error('❌ Axios error response:', axiosError.response);
        throw axiosError; // Re-throw to be caught by outer catch
      }
      
      if (!response.data) {
        console.error('❌ Response data is null or undefined');
        throw new Error('Empty response from API');
      }
      
      if (response.data && response.data.labels && response.data.labels.length > 0) {
        // Filter to only client-applicable labels AND whitelisted labels
        const clientLabels = response.data.labels.filter(label => {
          const appliesTo = label.applies_to || [];
          const isClientLabel = appliesTo.includes('Client') || appliesTo.length === 0;
          const isWhitelisted = allowedLabels.includes(label.name);
          return isClientLabel && isWhitelisted;
        });
        
        // Extract label names and sort alphabetically
        const labels = clientLabels
          .map(l => l.name || l)
          .filter(name => name && allowedLabels.includes(name))
          .sort((a, b) => a.localeCompare(b));
        setAvailableLabels(labels);
        
        // Build color map - check both 'colour' and 'color' fields
        const colorMap = {};
        clientLabels.forEach(label => {
          if (label.name) {
            // Try both 'colour' (British spelling) and 'color' (American spelling)
            const color = label.colour || label.color || '#d3d3d3';
            colorMap[label.name] = color;
          }
        });
        setLabelColors(colorMap);
      } else {
        console.warn('⚠️ No labels found in API response');
        console.warn('⚠️ Response data:', response.data);
        // Fallback: extract labels from client data (with whitelist)
        const labels = new Set();
        clients.forEach(client => {
          if (client.labels && Array.isArray(client.labels)) {
            client.labels.forEach(label => {
              const labelName = getLabelName(label);
              if (labelName && allowedLabels.includes(labelName)) {
                labels.add(labelName);
              }
            });
          }
        });
        // Sort alphabetically
        setAvailableLabels(Array.from(labels).sort((a, b) => a.localeCompare(b)));
      }
    } catch (error) {
      console.error('❌ Error fetching labels:', error);
      console.error('❌ Error message:', error.message);
      console.error('❌ Error response:', error.response);
      console.error('❌ Error response data:', error.response?.data);
      console.error('❌ Error response status:', error.response?.status);
      // Fallback: extract labels from client data (with whitelist)
      const labels = new Set();
      clients.forEach(client => {
        if (client.labels && Array.isArray(client.labels)) {
          client.labels.forEach(label => {
            const labelName = getLabelName(label);
            if (labelName && allowedLabels.includes(labelName)) {
              labels.add(labelName);
            }
          });
        }
      });
      // Sort alphabetically
      setAvailableLabels(Array.from(labels).sort((a, b) => a.localeCompare(b)));
    }
  };

  // Fetch detailed client data
  const fetchClientDetails = async (clientId) => {
    try {
      // Fetch comprehensive client data from enhanced endpoint
      const response = await axios.get(`/api/crm/clients/${clientId}`, {
        withCredentials: true,
      });

      const { client, lifetimeData, activities, invoices, students, communications } = response.data;

      // Open dialog with all data
      setSelectedClient({
        client: client,
        lifetimeData: lifetimeData || {
          lifetime_value: client?.total_revenue || 0,
          total_lessons: client?.total_lessons || 0,
          total_hours: client?.total_hours || 0,
          number_of_students: client?.number_of_students || 0
        },
        activities: activities || [],
        invoices: invoices || [],
        students: students || [],
        communications: communications || []
      });

      setClientDialogOpen(true);
    } catch (error) {
      console.error('Error fetching client details:', error);
      console.error('Error details:', error.response?.data);

      // Fallback: try to open with basic client data from list
      const client = clients.find(c => String(c.client_id) === String(clientId));
      if (client) {
        setSelectedClient({
          client: client,
          lifetimeData: {
            lifetime_value: client.total_revenue,
            total_lessons: client.total_lessons,
            total_hours: client.total_hours,
            number_of_students: client.number_of_students
          },
          activities: [],
          invoices: [],
          students: [],
          communications: []
        });
        setClientDialogOpen(true);
      }
    }
  };

  // Debounced search effect
  useEffect(() => {
    const timeoutId = setTimeout(() => {
      fetchClients();
    }, 300); // 300ms delay

    return () => clearTimeout(timeoutId);
  }, [searchTerm]);

  useEffect(() => {
    fetchClients();
  }, [page, rowsPerPage, filters, sortBy, sortOrder, statusFilter]);

  // Fetch analytics data
  const fetchAnalytics = async () => {
    setAnalyticsLoading(true);
    setAnalyticsError(null);
    try {
      const requestBody = {
        labels: filters.labels || [],
        dateRange: filters.dateRange || { start: '', end: '' },
        minLessons: 1 // Only include clients with at least 1 completed lesson
      };

      // Fetch analytics sequentially to avoid connection pool exhaustion
      // Add small delays between requests to prevent overwhelming the database
      const metricsResponse = await axios.post('/api/crm/analytics/client-metrics', requestBody, {
        withCredentials: true,
        timeout: 60000
      });
      setAnalyticsData(metricsResponse.data);

      await new Promise(resolve => setTimeout(resolve, 200)); // 200ms delay between requests

      const milestonesResponse = await axios.post('/api/crm/analytics/milestones', requestBody, {
        withCredentials: true,
        timeout: 60000
      });
      setMilestonesData(milestonesResponse.data);
      
      await new Promise(resolve => setTimeout(resolve, 200)); // 200ms delay between requests
      
      const retentionResponse = await axios.post('/api/crm/analytics/retention', requestBody, {
        withCredentials: true,
        timeout: 60000
      });
      setRetentionData(retentionResponse.data);

      await new Promise(resolve => setTimeout(resolve, 200)); // 200ms delay between requests

      const behaviorResponse = await axios.post('/api/crm/analytics/behavior', requestBody, {
        withCredentials: true,
        timeout: 60000
      });
      setBehaviorData(behaviorResponse.data);

      setAnalyticsError(null);
    } catch (error) {
      console.error('❌ Error fetching analytics:', error);
      console.error('Error details:', error.response?.data || error.message);
      const errorMessage = error.response?.data?.error || error.message || 'Failed to fetch analytics data';
      setAnalyticsError(errorMessage);
      setAnalyticsData(null);
      setMilestonesData(null);
      setRetentionData(null);
      setBehaviorData(null);
    } finally {
      setAnalyticsLoading(false);
    }
  };

  // Fetch clients for a specific milestone
  const fetchMilestoneClients = async (milestone, pageNum = 0) => {
    setMilestoneClientsLoading(true);
    try {
      const response = await axios.post('/api/crm/analytics/milestones/clients', {
        milestone,
        labels: filters.labels || [],
        page: pageNum + 1,
        pageSize: 25
      }, {
        withCredentials: true,
      });

      setMilestoneClients(response.data.clients || []);
      setMilestoneClientsTotal(response.data.pagination?.total || 0);
    } catch (error) {
      console.error('Error fetching milestone clients:', error);
      setMilestoneClients([]);
      setMilestoneClientsTotal(0);
    } finally {
      setMilestoneClientsLoading(false);
    }
  };

  // Handle opening milestone clients modal
  const handleOpenMilestoneClients = async (milestone) => {
    setSelectedMilestone(milestone);
    setMilestoneClientsModalOpen(true);
    setMilestoneClientsPage(0);
    await fetchMilestoneClients(milestone, 0);
  };

  // Handle pagination change for milestone clients
  const handleMilestoneClientsPageChange = async (event, newPage) => {
    setMilestoneClientsPage(newPage);
    await fetchMilestoneClients(selectedMilestone, newPage);
  };

  // Handle first page navigation
  const handleFirstPage = async () => {
    setMilestoneClientsPage(0);
    await fetchMilestoneClients(selectedMilestone, 0);
  };

  // Handle last page navigation
  const handleLastPage = async () => {
    const totalPages = Math.ceil(milestoneClientsTotal / 25);
    const lastPage = Math.max(0, totalPages - 1);
    setMilestoneClientsPage(lastPage);
    await fetchMilestoneClients(selectedMilestone, lastPage);
  };

  // Calculate total pages for milestone clients
  const milestoneClientsTotalPages = Math.ceil(milestoneClientsTotal / 25);

  // Handle email preview
  const handleEmailPreview = async (emailId, subject) => {
    setSelectedEmailId(emailId);
    setEmailPreviewSubject(subject || 'Email Preview');
    setEmailPreviewOpen(true);
    setEmailPreviewLoading(true);
    setEmailPreviewContent('');
    
    try {
      const response = await axios.get(`/api/client-reports/${emailId}/preview`, {
        withCredentials: true,
        responseType: 'text' // Get HTML as text
      });
      
      setEmailPreviewContent(response.data);
    } catch (error) {
      console.error('Error fetching email preview:', error);
      setEmailPreviewContent('<p>Error loading email preview. Please try again.</p>');
    } finally {
      setEmailPreviewLoading(false);
    }
  };

  // Export milestone clients to CSV
  const exportMilestoneClientsToCSV = async () => {
    try {
      // Fetch all clients (not paginated) for export
      const response = await axios.post('/api/crm/analytics/milestones/clients', {
        milestone: selectedMilestone,
        labels: filters.labels || [],
        page: 1,
        pageSize: 10000 // Large number to get all
      }, {
        withCredentials: true,
      });

      const clients = response.data.clients || [];
      
      // Create CSV content
      const headers = ['Client Name', 'TutorCruncher ID', 'Total LTV', 'Lesson Count'];
      const rows = clients.map(client => [
        client.client_name || '',
        client.tutorcruncher_id || '',
        client.avg_ltv || 0,
        client.lesson_count || 0
      ]);

      const csvContent = [
        headers.join(','),
        ...rows.map(row => row.map(cell => `"${cell}"`).join(','))
      ].join('\n');

      // Create blob and download
      const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
      const link = document.createElement('a');
      const url = URL.createObjectURL(blob);
      link.setAttribute('href', url);
      link.setAttribute('download', `${selectedMilestone}_clients_${new Date().toISOString().split('T')[0]}.csv`);
      link.style.visibility = 'hidden';
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
    } catch (error) {
      console.error('Error exporting CSV:', error);
      toast.error('Failed to export CSV. Please try again.');
    }
  };

  useEffect(() => {
    fetchLabels(); // Fetch labels on mount
    fetchStatusCounts(); // Fetch status counts on mount
  }, []);

  // Sync pendingLabels with applied filters when filters change externally
  useEffect(() => {
    setPendingLabels(filters.labels);
  }, [filters.labels]);

  // Fetch analytics when mainTab changes to Analytics or applied filters change
  // Note: pendingLabels changes don't trigger fetch - need to click Apply
  useEffect(() => {
    if (mainTab === 2) { // Analytics tab
      fetchAnalytics();
    }
  }, [mainTab, filters.labels, filters.dateRange]);

  // Handle search
  const handleSearch = (event) => {
    setSearchTerm(event.target.value);
    // Reset to first page when searching
    setPage(0);
  };

  // Handle filter changes
  const handleFilterChange = (filterType, value) => {
    setFilters(prev => ({
      ...prev,
      [filterType]: value
    }));
  };

  // Apply pending labels to filters (triggers analytics fetch)
  const handleApplyLabels = () => {
    setFilters(prev => ({
      ...prev,
      labels: [...pendingLabels]
    }));
  };

  // Remove label and immediately apply (triggers analytics fetch)
  const handleRemoveLabel = (labelToRemove) => {
    const newPendingLabels = pendingLabels.filter(l => l !== labelToRemove);
    setPendingLabels(newPendingLabels);
    setFilters(prev => ({
      ...prev,
      labels: newPendingLabels
    }));
  };

  // Handle sort
  const handleSort = (field) => {
    if (sortBy === field) {
      setSortOrder(sortOrder === 'asc' ? 'desc' : 'asc');
    } else {
      setSortBy(field);
      setSortOrder('desc');
    }
  };

  // Format phone number
  const formatPhoneNumber = (phone) => {
    if (!phone) return 'N/A';
    // Remove all non-digit characters
    const cleaned = phone.replace(/\D/g, '');
    // Format as (XXX) XXX-XXXX if 10 digits
    if (cleaned.length === 10) {
      return `(${cleaned.slice(0, 3)}) ${cleaned.slice(3, 6)}-${cleaned.slice(6)}`;
    }
    // Return as-is if not 10 digits
    return phone;
  };


  // Get activity status color
  const getActivityStatusColor = (status) => {
    switch (status) {
      case 'Active': return 'success';
      case 'Recent': return 'warning';
      case 'Inactive': return 'error';
      default: return 'default';
    }
  };

  // Column definitions for sortable headers
  const clientColumns = [
    { key: 'client', label: 'Client', sortable: false, filterable: false },
    { key: 'id', label: 'ID', sortable: false, filterable: false },
    { key: 'lifetime_value', label: 'Lifetime value', sortable: true, sortField: 'total_revenue', filterable: false },
    { key: 'lessons', label: 'Lessons', sortable: true, sortField: 'total_lessons', filterable: false },
    { key: 'students', label: 'Students', sortable: false, filterable: false },
    { key: 'status', label: 'Status', sortable: false, filterable: true },
    { key: 'labels', label: 'Labels', sortable: false, filterable: true },
  ];

  // Sort indicator for column headers
  const renderSortIndicator = (col) => {
    if (!col.sortable) return null;
    const field = col.sortField || col.key;
    if (sortBy === field) {
      return <span className="ml-1 text-primary-500">{sortOrder === 'asc' ? '↑' : '↓'}</span>;
    }
    return <span className="ml-1 text-neutral-300">↕</span>;
  };

  // Get status badge variant
  const getStatusBadgeVariant = (client) => {
    if (client.total_revenue > 0) return 'success';
    return 'neutral';
  };

  const getStatusLabel = (client) => {
    if (client.total_revenue > 0) return 'Active';
    return 'Inactive';
  };

  // Render client row
  const renderClientRow = (client) => (
    <tr
      key={client.client_id}
      className="hover:bg-neutral-50 transition-colors cursor-pointer border-b border-neutral-100"
      onClick={() => navigate(`/clients/${client.client_id}`)}
    >
      {visibleColumns.client && (
        <td className="px-3 py-2.5">
          <div className="flex items-center">
            <div className="flex-shrink-0 w-8 h-8 rounded-full bg-primary-100 text-primary-700 flex items-center justify-center text-xs font-semibold mr-3">
              {getClientDisplayName(client)?.[0] || 'C'}
            </div>
            <div>
              <div className="text-sm font-medium text-neutral-900">
                {getClientDisplayName(client)}
              </div>
            </div>
          </div>
        </td>
      )}
      {visibleColumns.id && (
        <td className="px-3 py-2.5">
          <a
            href={`https://account.acmeops.com/clients/${client.client_id}/`}
            target="_blank"
            rel="noopener noreferrer"
            onClick={(e) => e.stopPropagation()}
            className="text-sm text-primary-500 hover:underline"
          >
            {client.client_id}
          </a>
        </td>
      )}
      {visibleColumns.lifetime_value && (
        <td className="px-3 py-2.5">
          <span className="text-sm font-semibold text-primary-500">
            {formatCurrency(client.total_revenue || 0)}
          </span>
        </td>
      )}
      {visibleColumns.lessons && (
        <td className="px-3 py-2.5 text-sm text-neutral-700">
          {client.total_lessons || 0}
        </td>
      )}
      {visibleColumns.students && (
        <td className="px-3 py-2.5 text-sm text-neutral-700">
          {client.number_of_students || 0}
        </td>
      )}
      {visibleColumns.status && (
        <td className="px-3 py-2.5">
          <span className={`inline-flex items-center rounded-full px-2 py-0.5 text-[11px] font-medium ${
            getStatusBadgeVariant(client) === 'success'
              ? 'bg-success-light text-success-dark'
              : 'bg-neutral-100 text-neutral-600'
          }`}>
            {getStatusLabel(client)}
          </span>
        </td>
      )}
      {visibleColumns.labels && (
        <td className="px-3 py-2.5">
          <div className="flex flex-wrap gap-1">
            {client.labels && Array.isArray(client.labels) && client.labels.length > 0 ? (
              client.labels.slice(0, 2).map((label, index) => {
                const labelName = getLabelName(label);
                const labelColor = labelColors[labelName];
                return (
                  <span
                    key={index}
                    className="inline-flex items-center rounded-full px-2 py-0.5 text-[11px] font-medium"
                    style={{
                      backgroundColor: labelColor || '#e5e5e5',
                      color: getContrastColor(labelColor || '#e5e5e5'),
                    }}
                  >
                    {labelName}
                  </span>
                );
              })
            ) : (
              <span className="inline-flex items-center rounded-full px-2 py-0.5 text-[11px] font-medium bg-neutral-100 text-neutral-600">
                {client.source || 'Direct'}
              </span>
            )}
            {client.labels && client.labels.length > 2 && (
              <span className="inline-flex items-center rounded-full px-2 py-0.5 text-[11px] font-medium bg-neutral-100 text-neutral-600">
                +{client.labels.length - 2}
              </span>
            )}
          </div>
        </td>
      )}
      {/* Kebab action menu */}
      <td className="px-3 py-2.5 text-right">
        <button
          className="inline-flex items-center justify-center w-6 h-6 rounded border border-neutral-200 bg-transparent hover:bg-neutral-100 transition-colors"
          onClick={(e) => {
            e.stopPropagation();
            setKebabAnchor(e.currentTarget);
            setKebabClientId(client.client_id);
          }}
        >
          <EllipsisVerticalIcon className="h-4 w-4 text-neutral-500" />
        </button>
      </td>
    </tr>
  );

  /* Client detail dialog removed — navigates to /clients/:id instead */
  const __DIALOG_REMOVED_MARKER__ = true; // find-and-remove marker
  /* Client detail dialog removed — navigates to /clients/:id instead */


  if (loading && clients.length === 0) {
    return (
      <Box sx={{ p: 3, display: 'flex', justifyContent: 'center', alignItems: 'center', minHeight: '400px' }}>
        <Box textAlign="center">
          <Typography variant="h6" gutterBottom>Loading Client Management...</Typography>
          <Typography variant="body2" color="text.secondary">
            Fetching client data from database
          </Typography>
        </Box>
      </Box>
    );
  }

  const PAGE_TABS = [
    { id: 0, label: 'Clients' },
    { id: 1, label: 'Lesson Reports' },
    { id: 2, label: 'Analytics' },
    { id: 3, label: 'Churn Risk' },
    { id: 4, label: 'Accounts Receivable' },
  ];

  const STATUS_TABS = [
    { key: '', label: 'All', count: statusCounts.total },
    { key: 'live', label: 'Live', count: statusCounts.live },
    { key: 'dormant', label: 'Dormant', count: statusCounts.dormant },
  ];

  return (
    <div>
      {/* Top-level page tabs — matches Jobs Dashboard */}
      <div className="border-b border-neutral-200 bg-white px-4 sm:px-6 lg:px-8">
        <nav className="flex gap-6 -mb-px">
          {PAGE_TABS.map(tab => (
            <button
              key={tab.id}
              onClick={() => setMainTab(tab.id)}
              className={`px-1 py-3 text-sm font-medium border-b-2 transition-colors ${
                mainTab === tab.id
                  ? 'border-brand-purple text-brand-purple'
                  : 'border-transparent text-neutral-500 hover:text-neutral-700 hover:border-neutral-300'
              }`}
            >
              {tab.label}
            </button>
          ))}
        </nav>
      </div>

      {mainTab === 1 ? (
        <Suspense fallback={<div className="flex justify-center p-12"><CircularProgress /></div>}>
          <AllClientReports />
        </Suspense>
      ) : mainTab === 4 ? (
        <Suspense fallback={<div className="flex justify-center p-12"><CircularProgress /></div>}>
          <FailedPaymentTracker />
        </Suspense>
      ) : mainTab === 3 ? (
        <Suspense fallback={<div className="flex justify-center p-12"><CircularProgress /></div>}>
          <ChurnRiskTab />
        </Suspense>
      ) : mainTab === 0 ? (
        <div className="px-4 sm:px-6 lg:px-8 pt-4">
          {/* Status filter sub-tabs — matches Jobs Dashboard status tabs */}
          <div className="border-b border-neutral-200 mb-4">
            <nav className="flex gap-6 -mb-px">
              {STATUS_TABS.map(tab => (
                <button
                  key={tab.key}
                  onClick={() => { setStatusFilter(tab.key); setPage(0); }}
                  className={`inline-flex items-center gap-2 px-1 py-2.5 text-sm font-medium border-b-2 transition-colors ${
                    statusFilter === tab.key
                      ? 'border-brand-purple text-brand-purple'
                      : 'border-transparent text-neutral-500 hover:text-neutral-700 hover:border-neutral-300'
                  }`}
                >
                  {tab.label}
                  <span className={`text-xs tabular-nums ${
                    statusFilter === tab.key ? 'text-brand-purple' : 'text-neutral-400'
                  }`}>
                    {tab.count.toLocaleString()}
                  </span>
                </button>
              ))}
            </nav>
          </div>

      {/* Standardized Toolbar */}
      <div className="bg-white rounded-xl shadow-sm border border-neutral-200 mb-3">
        <div className="flex flex-wrap items-center gap-2 px-4 py-3">
          {/* Search input */}
          <div className="relative flex-shrink-0" style={{ width: '260px' }}>
            <MagnifyingGlassIcon className="absolute left-2.5 top-1/2 -translate-y-1/2 h-4 w-4 text-neutral-400" />
            <input
              type="text"
              placeholder="Search clients..."
              value={searchTerm}
              onChange={handleSearch}
              className="w-full pl-8 pr-3 py-1.5 text-sm border border-neutral-300 rounded-md focus:outline-none focus:ring-2 focus:ring-primary-500 focus:border-primary-500"
            />
          </div>

          {/* Filter button */}
          <button
            className="inline-flex items-center gap-1.5 px-3 py-1.5 text-sm font-medium text-neutral-700 bg-white border border-neutral-300 rounded-md hover:bg-neutral-50 transition-colors"
            onClick={() => setMoreFiltersOpen(true)}
          >
            <FunnelIcon className="h-4 w-4" />
            Filter
            {filters.labels.length > 0 && (
              <span className="inline-flex items-center justify-center w-5 h-5 text-[10px] font-semibold text-white bg-primary-500 rounded-full">
                {filters.labels.length}
              </span>
            )}
          </button>

          {/* Columns button */}
          <button
            className="inline-flex items-center gap-1.5 px-3 py-1.5 text-sm font-medium text-neutral-700 bg-white border border-neutral-300 rounded-md hover:bg-neutral-50 transition-colors"
            onClick={(e) => setColumnsMenuAnchor(e.currentTarget)}
          >
            <ViewColumnsIcon className="h-4 w-4" />
            Columns
          </button>

          {/* Spacer */}
          <div className="flex-1" />

          {/* Row count */}
          <span className="text-sm text-neutral-500 whitespace-nowrap">
            {totalCount.toLocaleString()} results
          </span>

          {/* Primary action */}
          <button className="inline-flex items-center gap-1.5 px-4 py-1.5 text-sm font-medium text-white bg-primary-500 rounded-md hover:bg-primary-600 transition-colors">
            <PlusIcon className="h-4 w-4" />
            Add client
          </button>
        </div>

        {/* Active label filters (chips below toolbar) */}
        {filters.labels.length > 0 && (
          <div className="flex flex-wrap items-center gap-1.5 px-4 pb-3 -mt-1">
            <span className="text-xs text-neutral-500 mr-1">Labels:</span>
            {filters.labels.map((value) => {
              const labelColor = labelColors[value] || '#d3d3d3';
              return (
                <span
                  key={value}
                  className="inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[11px] font-medium"
                  style={{
                    backgroundColor: labelColor,
                    color: getContrastColor(labelColor),
                  }}
                >
                  {value}
                  <button
                    className="ml-0.5 hover:opacity-70"
                    onClick={() => handleRemoveLabel(value)}
                  >
                    <XMarkIcon className="h-3 w-3" />
                  </button>
                </span>
              );
            })}
          </div>
        )}

        {/* Clients Table */}
        <div className="overflow-x-auto">
          <table className="w-full text-left table-fixed">
            <thead>
              <tr className="border-t border-b border-neutral-200 bg-neutral-50/50">
                {clientColumns.filter(col => visibleColumns[col.key]).map((col) => {
                  const colWidth = columnWidths[col.key];
                  return (
                    <th
                      key={col.key}
                      className={`px-3 py-2 text-[11px] font-medium text-neutral-500 uppercase tracking-wider select-none relative ${
                        col.sortable ? 'cursor-pointer hover:text-neutral-800 transition-colors' : ''
                      }`}
                      style={colWidth ? { width: colWidth, minWidth: '80px' } : undefined}
                      onClick={col.sortable ? () => handleSort(col.sortField || col.key) : undefined}
                    >
                      <span className="inline-flex items-center whitespace-nowrap">
                        {col.label}
                        {renderSortIndicator(col)}
                        {col.filterable && <span className="ml-1 text-neutral-300">▾</span>}
                      </span>
                      {/* Resize handle */}
                      <div
                        className="absolute -right-1.5 top-0 bottom-0 w-3 cursor-col-resize hover:bg-brand-purple/20 group z-10"
                        onMouseDown={(e) => handleResizeStart(e, col.key)}
                        onClick={(e) => e.stopPropagation()}
                      >
                        <div className="mx-auto w-px h-full bg-neutral-200 group-hover:bg-brand-purple/40" />
                      </div>
                    </th>
                  );
                })}
                {/* Empty header for kebab column */}
                <th className="px-3 py-2 w-10" />
              </tr>
            </thead>
            <tbody>
              {filteredClients.length > 0 ? (
                filteredClients.map(renderClientRow)
              ) : (
                <tr>
                  <td colSpan={Object.values(visibleColumns).filter(Boolean).length + 1} className="px-3 py-12 text-center text-sm text-neutral-500">
                    {loading ? 'Loading clients...' : 'No clients found'}
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>

        {/* Pagination */}
        <div className="flex flex-wrap items-center justify-between px-4 py-3 border-t border-neutral-200">
          <span className="text-sm text-neutral-500">
            Showing {totalCount === 0 ? 0 : page * rowsPerPage + 1}–{Math.min((page + 1) * rowsPerPage, totalCount)} of {totalCount.toLocaleString()}
          </span>
          <div className="flex items-center gap-2">
            <div className="flex items-center gap-1 mr-4">
              <span className="text-sm text-neutral-500">Rows per page:</span>
              <select
                value={rowsPerPage}
                onChange={(e) => {
                  setRowsPerPage(parseInt(e.target.value, 10));
                  setPage(0);
                }}
                className="text-sm border border-neutral-300 rounded px-2 py-1 focus:outline-none focus:ring-2 focus:ring-primary-500"
              >
                <option value={25}>25</option>
                <option value={50}>50</option>
                <option value={100}>100</option>
              </select>
            </div>
            {(() => {
              const totalPages = Math.ceil(totalCount / rowsPerPage);
              const maxButtons = 5;
              let startPage = Math.max(0, page - Math.floor(maxButtons / 2));
              let endPage = Math.min(totalPages, startPage + maxButtons);
              if (endPage - startPage < maxButtons) {
                startPage = Math.max(0, endPage - maxButtons);
              }
              return (
                <div className="flex items-center gap-1">
                  <button
                    disabled={page === 0}
                    onClick={() => setPage(page - 1)}
                    className="px-2 py-1 text-sm rounded border border-neutral-300 disabled:opacity-40 disabled:cursor-not-allowed hover:bg-neutral-50 transition-colors"
                  >
                    <ChevronLeftIcon className="h-4 w-4" />
                  </button>
                  {Array.from({ length: endPage - startPage }, (_, i) => startPage + i).map((p) => (
                    <button
                      key={p}
                      onClick={() => setPage(p)}
                      className={`px-2.5 py-1 text-sm rounded border transition-colors ${
                        p === page
                          ? 'bg-primary-500 text-white border-primary-500'
                          : 'border-neutral-300 hover:bg-neutral-50'
                      }`}
                    >
                      {p + 1}
                    </button>
                  ))}
                  <button
                    disabled={page >= totalPages - 1}
                    onClick={() => setPage(page + 1)}
                    className="px-2 py-1 text-sm rounded border border-neutral-300 disabled:opacity-40 disabled:cursor-not-allowed hover:bg-neutral-50 transition-colors"
                  >
                    <ChevronRightIcon className="h-4 w-4" />
                  </button>
                </div>
              );
            })()}
          </div>
        </div>
      </div>

      {/* Kebab dropdown menu */}
      {kebabAnchor && (
        <>
          <div className="fixed inset-0 z-dropdown" onClick={() => { setKebabAnchor(null); setKebabClientId(null); }} />
          <div
            className="absolute z-dropdown bg-white rounded-lg shadow-dropdown border border-neutral-200 py-1 min-w-[140px]"
            style={{
              top: kebabAnchor.getBoundingClientRect().bottom + window.scrollY + 4,
              left: kebabAnchor.getBoundingClientRect().right + window.scrollX - 140,
            }}
          >
            <button
              className="w-full text-left px-3 py-2 text-sm text-neutral-700 hover:bg-neutral-50 transition-colors flex items-center gap-2"
              onClick={() => {
                navigate(`/clients/${kebabClientId}`);
                setKebabAnchor(null);
                setKebabClientId(null);
              }}
            >
              <EyeIcon className="h-4 w-4 text-neutral-400" />
              View
            </button>
            <button
              className="w-full text-left px-3 py-2 text-sm text-error hover:bg-error-light transition-colors flex items-center gap-2"
              onClick={() => {
                toast.warning('Delete not yet implemented');
                setKebabAnchor(null);
                setKebabClientId(null);
              }}
            >
              <TrashIcon className="h-4 w-4" />
              Delete
            </button>
          </div>
        </>
      )}

      {/* Columns visibility menu */}
      {columnsMenuAnchor && (
        <>
          <div className="fixed inset-0 z-dropdown" onClick={() => setColumnsMenuAnchor(null)} />
          <div
            className="absolute z-dropdown bg-white rounded-lg shadow-dropdown border border-neutral-200 py-1 min-w-[180px]"
            style={{
              top: columnsMenuAnchor.getBoundingClientRect().bottom + window.scrollY + 4,
              left: columnsMenuAnchor.getBoundingClientRect().left + window.scrollX,
            }}
          >
            {clientColumns.map((col) => (
              <label key={col.key} className="flex items-center gap-2 px-3 py-2 text-sm text-neutral-700 hover:bg-neutral-50 cursor-pointer">
                <input
                  type="checkbox"
                  checked={visibleColumns[col.key]}
                  onChange={() => setVisibleColumns(prev => ({ ...prev, [col.key]: !prev[col.key] }))}
                  className="rounded border-neutral-300 text-primary-500 focus:ring-primary-500"
                />
                {col.label}
              </label>
            ))}
          </div>
        </>
      )}
        </div>
      ) : (
        // Analytics Tab
        <Box>

          {analyticsLoading ? (
            <Box sx={{ p: 3, display: 'flex', justifyContent: 'center', alignItems: 'center', minHeight: '400px' }}>
              <Box textAlign="center">
                <Typography variant="h6" gutterBottom>Loading Analytics...</Typography>
                <Typography variant="body2" color="text.secondary">
                  Fetching client metrics and insights
                </Typography>
              </Box>
            </Box>
          ) : analyticsError ? (
            <Box sx={{ p: 3, textAlign: 'center' }}>
              <Typography variant="h6" gutterBottom color="error">
                Error Loading Analytics
              </Typography>
              <Typography variant="body2" color="text.secondary" mb={2}>
                {analyticsError}
              </Typography>
              <Button variant="contained" onClick={fetchAnalytics}>
                Retry
              </Button>
            </Box>
          ) : analyticsData && analyticsData.metrics ? (
            <div className="px-4 sm:px-6 lg:px-8 pt-4 space-y-4">
              {/* KPI Cards — STC Design System */}
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
                <div className="bg-white rounded-xl border border-neutral-200 p-5">
                  <p className="text-xs text-neutral-500 mb-1">Total Lifetime Value</p>
                  <p className="text-2xl font-bold text-primary-500 tabular-nums">{formatCurrency(analyticsData.metrics.total_lifetime_value || 0)}</p>
                  <p className="text-xs text-neutral-500 mt-1">{(analyticsData.metrics.total_active_clients || 0).toLocaleString()} active clients</p>
                </div>
                <div
                  className="bg-white rounded-xl border border-neutral-200 p-5 cursor-pointer hover:shadow-md hover:border-brand-purple/20 transition-all duration-200"
                  onClick={() => setAlvModalOpen(true)}
                >
                  <p className="text-xs text-neutral-500 mb-1">Average Lifetime Value</p>
                  <p className="text-2xl font-bold text-success tabular-nums">{formatCurrency(analyticsData.metrics.avg_lifetime_value || 0)}</p>
                  <p className="text-xs text-neutral-500 mt-1">Median: {formatCurrency(analyticsData.metrics.median_lifetime_value || 0)}</p>
                  <p className="text-xs text-primary-500 font-medium mt-1">Click to view detailed analysis →</p>
                </div>
                <div className="bg-white rounded-xl border border-neutral-200 p-5">
                  <p className="text-xs text-neutral-500 mb-1">Total Lessons Completed</p>
                  <p className="text-2xl font-bold text-neutral-900 tabular-nums">{(analyticsData.metrics.total_lessons_completed || 0).toLocaleString()}</p>
                  <p className="text-xs text-neutral-500 mt-1">Avg: {parseFloat(analyticsData.metrics.avg_lessons_per_client || 0).toFixed(1)} per client</p>
                </div>
                <div className="bg-white rounded-xl border border-neutral-200 p-5">
                  <p className="text-xs text-neutral-500 mb-1">Total Students</p>
                  <p className="text-2xl font-bold text-neutral-900 tabular-nums">{(analyticsData.metrics.total_students || 0).toLocaleString()}</p>
                  <p className="text-xs text-neutral-500 mt-1">Avg: {parseFloat(analyticsData.metrics.avg_students_per_client || 0).toFixed(1)} per client</p>
                </div>
              </div>

              {/* Secondary Metrics */}
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                <div className="bg-white rounded-xl border border-neutral-200 p-5">
                  <p className="text-xs text-neutral-500 mb-2">Percentile Metrics</p>
                  <p className="text-sm text-neutral-700">P75: {formatCurrency(analyticsData.metrics.p75_lifetime_value || 0)}</p>
                  <p className="text-sm text-neutral-700">P90: {formatCurrency(analyticsData.metrics.p90_lifetime_value || 0)}</p>
                </div>
                <div className="bg-white rounded-xl border border-neutral-200 p-5">
                  <p className="text-xs text-neutral-500 mb-2">Client Activity</p>
                  <p className="text-sm text-neutral-700">Active (30 days): {(analyticsData.metrics.active_clients_30_days || 0).toLocaleString()}</p>
                  <p className="text-sm text-neutral-700">Active (90 days): {(analyticsData.metrics.active_clients_90_days || 0).toLocaleString()}</p>
                  <p className="text-sm text-neutral-700">Avg Lifespan: {parseFloat(analyticsData.metrics.avg_client_lifespan_months || 0).toFixed(1)} months</p>
                </div>
                <div className="bg-white rounded-xl border border-neutral-200 p-5">
                  <p className="text-xs text-neutral-500 mb-1">Total Hours</p>
                  <p className="text-2xl font-bold text-neutral-900 tabular-nums">{parseFloat(analyticsData.metrics.total_hours || 0).toLocaleString('en-US', { minimumFractionDigits: 1, maximumFractionDigits: 1 })} hours</p>
                </div>
              </div>

              {/* Filter Toolbar — matches Clients tab toolbar */}
              <div className="bg-white rounded-xl shadow-sm border border-neutral-200">
                <div className="flex flex-wrap items-center gap-2 px-4 py-3">
                  <FormControl size="small" sx={{ minWidth: 260 }}>
                    <InputLabel id="analytics-filter-labels-label" shrink={pendingLabels.length > 0}>Filter by Labels</InputLabel>
                    <Select
                      labelId="analytics-filter-labels-label"
                      multiple
                      value={pendingLabels}
                      onChange={(e) => setPendingLabels(e.target.value)}
                      MenuProps={{ PaperProps: { style: { maxHeight: 400, width: 250 } } }}
                      renderValue={(selected) => (
                        <Box sx={{ display: 'flex', flexWrap: 'wrap', gap: 0.5 }}
                          onMouseDown={(e) => { e.preventDefault(); e.stopPropagation(); }}
                        >
                          {selected.map((value) => {
                            const lc = labelColors[value] || '#d3d3d3';
                            return (
                              <Chip key={value} label={value} size="small"
                                onDelete={(e) => { e.preventDefault(); e.stopPropagation(); setPendingLabels(prev => prev.filter(l => l !== value)); }}
                                onMouseDown={(e) => { e.preventDefault(); e.stopPropagation(); }}
                                style={{ backgroundColor: lc, color: getContrastColor(lc), ...chipStyle }}
                              />
                            );
                          })}
                        </Box>
                      )}
                    >
                      {availableLabels.map((label) => {
                        const isSelected = pendingLabels.includes(label);
                        return (
                          <MenuItem key={label} value={label} selected={isSelected}>
                            <Checkbox checked={isSelected} sx={{ padding: '4px' }} />
                            <span>{label}</span>
                          </MenuItem>
                        );
                      })}
                    </Select>
                  </FormControl>
                  <button
                    onClick={handleApplyLabels}
                    disabled={JSON.stringify([...pendingLabels].sort()) === JSON.stringify([...filters.labels].sort())}
                    className="inline-flex items-center gap-1.5 px-4 py-1.5 text-sm font-medium text-white bg-primary-500 rounded-md hover:bg-primary-600 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
                  >
                    Apply Filters
                  </button>
                </div>
              </div>

              {/* Lifetime Value Progression */}
              {milestonesData && milestonesData.milestones && milestonesData.milestones.length > 0 && (
                <div className="bg-white rounded-xl border border-neutral-200 p-5">
                  <h3 className="text-lg font-semibold text-neutral-900 mb-1">Lifetime Value Progression</h3>
                  <p className="text-sm text-neutral-500 mb-4">Track average LTV growth through key client milestones</p>
                  <div className="overflow-x-auto">
                    <table className="w-full text-left">
                      <thead>
                        <tr className="border-t border-b border-neutral-200 bg-neutral-50/50">
                          <th className="px-3 py-2 text-[11px] font-medium text-neutral-500 uppercase tracking-wider">Milestone</th>
                          <th className="px-3 py-2 text-[11px] font-medium text-neutral-500 uppercase tracking-wider text-right">Clients Reached</th>
                          <th className="px-3 py-2 text-[11px] font-medium text-neutral-500 uppercase tracking-wider text-right">Avg LTV</th>
                          <th className="px-3 py-2 text-[11px] font-medium text-neutral-500 uppercase tracking-wider text-right">Change vs Prev</th>
                          <th className="px-3 py-2 text-[11px] font-medium text-neutral-500 uppercase tracking-wider text-right">Retention %</th>
                        </tr>
                      </thead>
                      <tbody>
                        {milestonesData.milestones.map((milestone) => (
                          <tr key={milestone.milestone} className="border-b border-neutral-100 hover:bg-neutral-50 transition-colors">
                            <td className="px-3 py-2.5 text-sm text-neutral-700">{milestone.milestone}</td>
                            <td className="px-3 py-2.5 text-sm text-right">
                              <button className="text-primary-500 underline hover:text-primary-700" onClick={() => handleOpenMilestoneClients(milestone.milestone)}>
                                {milestone.clients_reached?.toLocaleString() || 0}
                              </button>
                            </td>
                            <td className="px-3 py-2.5 text-sm text-right font-semibold text-primary-500 tabular-nums">{formatCurrency(milestone.avg_ltv || 0)}</td>
                            <td className={`px-3 py-2.5 text-sm text-right tabular-nums ${parseFloat(milestone.change_vs_prev || 0) > 0 ? 'text-success' : 'text-neutral-700'}`}>
                              {parseFloat(milestone.change_vs_prev || 0) > 0 ? '+' : ''}{parseFloat(milestone.change_vs_prev || 0).toFixed(1)}%
                            </td>
                            <td className="px-3 py-2.5 text-sm text-right tabular-nums">{parseFloat(milestone.retention_rate || 0).toFixed(1)}%</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                  <div className="mt-4">
                    <ResponsiveContainer width="100%" height={300}>
                      <LineChart data={milestonesData.milestones}>
                        <CartesianGrid strokeDasharray="3 3" />
                        <XAxis dataKey="milestone" />
                        <YAxis />
                        <RechartsTooltip formatter={(value) => formatCurrency(value)} />
                        <Line type="monotone" dataKey="avg_ltv" stroke="#6A469D" strokeWidth={2} name="Avg LTV" />
                      </LineChart>
                    </ResponsiveContainer>
                  </div>
                </div>
              )}

              {/* Retention & Engagement */}
              {retentionData && retentionData.retention && (
                <div className="bg-white rounded-xl border border-neutral-200 p-5">
                  <h3 className="text-lg font-semibold text-neutral-900 mb-3">Client Retention & Engagement</h3>
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                    <div>
                      <p className="text-sm font-semibold text-neutral-700 mb-2">Retention Rates</p>
                      <div className="space-y-1 text-sm text-neutral-700">
                        <p>Active (30 days): {(retentionData.retention.active_clients_30d || 0).toLocaleString()}</p>
                        <p>Active (60 days): {(retentionData.retention.active_clients_60d || 0).toLocaleString()}</p>
                        <p>Active (90 days): {(retentionData.retention.active_clients_90d || 0).toLocaleString()}</p>
                        <p>Active (180 days): {(retentionData.retention.active_clients_180d || 0).toLocaleString()}</p>
                      </div>
                      <p className="text-sm text-error mt-2">Churned (&gt;60 days inactive): {(retentionData.retention.churned_clients || 0).toLocaleString()}</p>
                    </div>
                    <div>
                      <p className="text-sm font-semibold text-neutral-700 mb-2">Engagement Metrics</p>
                      <div className="space-y-1 text-sm text-neutral-700">
                        <p>Avg Lessons per Client: {parseFloat(retentionData.retention.avg_lessons_per_client || 0).toFixed(1)}</p>
                        <p>Avg Students per Client: {parseFloat(retentionData.retention.avg_students_per_client || 0).toFixed(1)}</p>
                        <p>Avg Days Between Lessons: {parseFloat(retentionData.retention.avg_days_between_lessons || 0).toFixed(1)} days</p>
                        <p>Avg Lessons per Month: {parseFloat(retentionData.retention.avg_lessons_per_month || 0).toFixed(1)}</p>
                        <p>Avg Client Lifespan: {parseFloat(retentionData.retention.avg_client_lifespan_months || 0).toFixed(1)} months</p>
                      </div>
                    </div>
                  </div>
                </div>
              )}

              {/* Behavioral Analytics */}
              {behaviorData && behaviorData.behavior && (
                <div className="bg-white rounded-xl border border-neutral-200 p-5">
                  <h3 className="text-lg font-semibold text-neutral-900 mb-3">Behavioral Analytics</h3>
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                    <div>
                      <p className="text-sm font-semibold text-neutral-700 mb-2">Client Diversity</p>
                      <div className="space-y-1 text-sm text-neutral-700">
                        <p>Clients with Multiple Students: {(behaviorData.behavior.clients_multiple_students || 0).toLocaleString()} ({parseFloat(behaviorData.behavior.pct_multiple_students || 0).toFixed(1)}%)</p>
                        <p>Cross-Enrolled Clients: {(behaviorData.behavior.clients_cross_enrolled || 0).toLocaleString()} ({parseFloat(behaviorData.behavior.pct_cross_enrolled || 0).toFixed(1)}%)</p>
                        <p>Avg Service Types per Client: {parseFloat(behaviorData.behavior.avg_service_types_per_client || 0).toFixed(1)}</p>
                        <p>Avg Tutors per Client: {parseFloat(behaviorData.behavior.avg_tutors_per_client || 0).toFixed(1)}</p>
                      </div>
                    </div>
                    <div>
                      <p className="text-sm font-semibold text-neutral-700 mb-2">Conversion Metrics</p>
                      <div className="space-y-1 text-sm text-neutral-700">
                        <p>Trial Conversion Rate: {parseFloat(behaviorData.behavior.trial_conversion_rate || 0).toFixed(1)}%</p>
                        <p>Clients Converted from Trial: {(behaviorData.behavior.clients_converted_from_trial || 0).toLocaleString()}</p>
                        <p className="text-neutral-500 mt-2">Total Clients Analyzed: {(behaviorData.behavior.total_clients || 0).toLocaleString()}</p>
                      </div>
                    </div>
                  </div>
                </div>
              )}

              {/* Charts Row */}
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div className="bg-white rounded-xl border border-neutral-200 p-5">
                  <h3 className="text-lg font-semibold text-neutral-900 mb-3">Lifetime Value Distribution</h3>
                  {analyticsData.distribution && analyticsData.distribution.length > 0 ? (
                    <ResponsiveContainer width="100%" height={300}>
                      <BarChart data={analyticsData.distribution}>
                        <CartesianGrid strokeDasharray="3 3" />
                        <XAxis dataKey="ltv_range" />
                        <YAxis />
                        <RechartsTooltip />
                        <Bar dataKey="client_count" fill="#6A469D" />
                      </BarChart>
                    </ResponsiveContainer>
                  ) : (
                    <p className="text-sm text-neutral-500 text-center py-8">No distribution data available</p>
                  )}
                </div>
                <div className="bg-white rounded-xl border border-neutral-200 p-5">
                  <h3 className="text-lg font-semibold text-neutral-900 mb-3">Cohort Analysis (Average LTV by First Lesson Month)</h3>
                  {analyticsData.cohorts && analyticsData.cohorts.length > 0 ? (
                    <ResponsiveContainer width="100%" height={300}>
                      <LineChart data={analyticsData.cohorts.map(c => ({
                        month: new Date(c.first_lesson_month).toLocaleDateString('en-US', { month: 'short', year: 'numeric' }),
                        avgLTV: parseFloat(c.avg_ltv || 0),
                        cohortSize: parseInt(c.cohort_size || 0)
                      }))}>
                        <CartesianGrid strokeDasharray="3 3" />
                        <XAxis dataKey="month" angle={-45} textAnchor="end" height={80} />
                        <YAxis />
                        <RechartsTooltip />
                        <Legend />
                        <Line type="monotone" dataKey="avgLTV" stroke="#6A469D" name="Avg LTV" />
                      </LineChart>
                    </ResponsiveContainer>
                  ) : (
                    <p className="text-sm text-neutral-500 text-center py-8">No cohort data available</p>
                  )}
                </div>
              </div>

              {/* Top Clients Table */}
              <div className="bg-white rounded-xl border border-neutral-200 overflow-hidden">
                <div className="px-5 py-4">
                  <h3 className="text-lg font-semibold text-neutral-900">Top 10 Clients by Lifetime Value</h3>
                </div>
                {analyticsData.topClients && analyticsData.topClients.length > 0 ? (
                  <table className="w-full text-left">
                    <thead>
                      <tr className="border-t border-b border-neutral-200 bg-neutral-50/50">
                        <th className="px-5 py-2 text-[11px] font-medium text-neutral-500 uppercase tracking-wider">Client Name</th>
                        <th className="px-3 py-2 text-[11px] font-medium text-neutral-500 uppercase tracking-wider">Email</th>
                        <th className="px-3 py-2 text-[11px] font-medium text-neutral-500 uppercase tracking-wider text-right">Lifetime Value</th>
                        <th className="px-3 py-2 text-[11px] font-medium text-neutral-500 uppercase tracking-wider text-right">Lessons</th>
                        <th className="px-3 py-2 text-[11px] font-medium text-neutral-500 uppercase tracking-wider text-right">Students</th>
                      </tr>
                    </thead>
                    <tbody>
                      {analyticsData.topClients.map((client) => (
                        <tr key={client.client_id} className="border-b border-neutral-100 hover:bg-neutral-50 transition-colors">
                          <td className="px-5 py-2.5 text-sm text-neutral-700">{client.client_name}</td>
                          <td className="px-3 py-2.5 text-sm text-neutral-500">{client.email}</td>
                          <td className="px-3 py-2.5 text-sm text-right font-semibold text-primary-500 tabular-nums">{formatCurrency(client.lifetime_value || 0)}</td>
                          <td className="px-3 py-2.5 text-sm text-right tabular-nums">{client.total_lessons || 0}</td>
                          <td className="px-3 py-2.5 text-sm text-right tabular-nums">{client.number_of_students || 0}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                ) : (
                  <p className="text-sm text-neutral-500 text-center py-8">No top clients data available</p>
                )}
              </div>
            </div>
          ) : (
            <div className="px-4 sm:px-6 lg:px-8 pt-8 text-center">
              <p className="text-lg font-semibold text-neutral-700">No Analytics Data</p>
              <p className="text-sm text-neutral-500 mt-1">Analytics data will appear here once loaded</p>
            </div>
          )}
        </Box>
      )}

      {/* More Filters Dialog */}
      <Dialog 
        open={moreFiltersOpen} 
        onClose={() => setMoreFiltersOpen(false)}
        maxWidth="sm"
        fullWidth
      >
        <DialogTitle>
          <Box display="flex" justifyContent="space-between" alignItems="center">
            <Typography variant="h6">More Filters</Typography>
            <IconButton onClick={() => setMoreFiltersOpen(false)} size="small">
              <XMarkIcon className="h-5 w-5" />
            </IconButton>
          </Box>
        </DialogTitle>
        <DialogContent>
          <Box sx={{ pt: 2 }}>
            <Grid container spacing={3}>
              {/* Lifetime Value Filters */}
              <Grid item xs={12}>
                <Typography variant="subtitle2" gutterBottom>
                  Lifetime Value
                </Typography>
                <Grid container spacing={2}>
                  <Grid item xs={12} sm={6}>
                    <TextField
                      fullWidth
                      label="Min Value"
                      type="number"
                      value={filters.lifetimeValue.min || ''}
                      onChange={(e) => {
                        handleFilterChange('lifetimeValue', {
                          ...filters.lifetimeValue,
                          min: e.target.value ? parseFloat(e.target.value) : 0
                        });
                        setPage(0);
                      }}
                      InputProps={{
                        startAdornment: <InputAdornment position="start">$</InputAdornment>,
                      }}
                    />
                  </Grid>
                  <Grid item xs={12} sm={6}>
                    <TextField
                      fullWidth
                      label="Max Value"
                      type="number"
                      value={filters.lifetimeValue.max || ''}
                      onChange={(e) => {
                        handleFilterChange('lifetimeValue', {
                          ...filters.lifetimeValue,
                          max: e.target.value ? parseFloat(e.target.value) : null
                        });
                        setPage(0);
                      }}
                      InputProps={{
                        startAdornment: <InputAdornment position="start">$</InputAdornment>,
                      }}
                    />
                  </Grid>
                </Grid>
              </Grid>

              {/* Clear Filters Button */}
              <Grid item xs={12}>
                <Button
                  fullWidth
                  variant="outlined"
                  color="secondary"
                  onClick={() => {
                    handleFilterChange('dateRange', { start: '', end: '' });
                    handleFilterChange('lifetimeValue', { min: 0, max: null });
                    setPage(0);
                  }}
                >
                  Clear All Filters
                </Button>
              </Grid>
            </Grid>
          </Box>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setMoreFiltersOpen(false)} variant="contained">
            Close
          </Button>
        </DialogActions>
      </Dialog>

      {/* Milestone Clients Modal */}
      <Dialog
        open={milestoneClientsModalOpen}
        onClose={() => setMilestoneClientsModalOpen(false)}
        maxWidth="lg"
        fullWidth
      >
        <DialogTitle>
          <Box display="flex" justifyContent="space-between" alignItems="center">
            <Typography variant="h6">
              Clients Reached: {selectedMilestone}
            </Typography>
            <Button
              startIcon={<ArrowDownTrayIcon className="h-5 w-5" />}
              variant="outlined"
              onClick={exportMilestoneClientsToCSV}
              disabled={milestoneClientsLoading}
            >
              Export CSV
            </Button>
          </Box>
        </DialogTitle>
        <DialogContent>
          {milestoneClientsLoading ? (
            <Box sx={{ p: 3, textAlign: 'center' }}>
              <Typography>Loading clients...</Typography>
            </Box>
          ) : (
            <TableContainer>
              <Table>
                <TableHead>
                  <TableRow>
                    <TableCell><strong>Client Name</strong></TableCell>
                    <TableCell><strong>TutorCruncher ID</strong></TableCell>
                    <TableCell align="right"><strong>Total LTV</strong></TableCell>
                    <TableCell align="right"><strong>Lessons</strong></TableCell>
                  </TableRow>
                </TableHead>
                <TableBody>
                  {milestoneClients.length === 0 ? (
                    <TableRow>
                      <TableCell colSpan={4} align="center">
                        <Typography variant="body2" color="text.secondary">
                          No clients found
                        </Typography>
                      </TableCell>
                    </TableRow>
                  ) : (
                    milestoneClients.map((client) => (
                      <TableRow key={client.client_id}>
                        <TableCell>{client.client_name || 'N/A'}</TableCell>
                        <TableCell>
                          {client.tutorcruncher_id ? (
                            <Box display="flex" alignItems="center" gap={1}>
                              <Typography variant="body2">{client.tutorcruncher_id}</Typography>
                              <a
                                href={`https://account.acmeops.com/clients/${client.tutorcruncher_id}/`}
                                target="_blank"
                                rel="noopener noreferrer"
                                style={flexCenterStyle}
                              >
                                <IconButton size="small" sx={{ p: 0.5 }}>
                                  <ArrowTopRightOnSquareIcon className="h-4 w-4" />
                                </IconButton>
                              </a>
                            </Box>
                          ) : (
                            'N/A'
                          )}
                        </TableCell>
                        <TableCell align="right">
                          <Typography fontWeight="bold" color="primary.main">
                            {formatCurrency(client.avg_ltv || 0)}
                          </Typography>
                        </TableCell>
                        <TableCell align="right">{client.lesson_count || 0}</TableCell>
                      </TableRow>
                    ))
                  )}
                </TableBody>
              </Table>
            </TableContainer>
          )}
        </DialogContent>
        <DialogActions>
          <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', width: '100%', px: 2, py: 1 }}>
            <Typography variant="body2" color="text.secondary">
              Showing {milestoneClients.length > 0 ? milestoneClientsPage * 25 + 1 : 0} - {Math.min((milestoneClientsPage + 1) * 25, milestoneClientsTotal)} of {milestoneClientsTotal.toLocaleString()} clients
            </Typography>
            <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
              <Tooltip title="First Page">
                <span>
                  <IconButton
                    onClick={handleFirstPage}
                    disabled={milestoneClientsPage === 0 || milestoneClientsLoading}
                    size="small"
                    sx={{
                      '&:disabled': {
                        opacity: 0.3
                      },
                      '&:hover:not(:disabled)': {
                        backgroundColor: 'action.hover'
                      }
                    }}
                  >
                    <ChevronDoubleLeftIcon className="h-5 w-5" />
                  </IconButton>
                </span>
              </Tooltip>
              <Tooltip title="Previous Page">
                <span>
                  <IconButton
                    onClick={(e) => handleMilestoneClientsPageChange(e, milestoneClientsPage - 1)}
                    disabled={milestoneClientsPage === 0 || milestoneClientsLoading}
                    size="small"
                    sx={{
                      '&:disabled': {
                        opacity: 0.3
                      },
                      '&:hover:not(:disabled)': {
                        backgroundColor: 'action.hover'
                      }
                    }}
                  >
                    <ChevronLeftIcon className="h-5 w-5" />
                  </IconButton>
                </span>
              </Tooltip>
              <Typography variant="body2" sx={{ minWidth: '80px', textAlign: 'center', mx: 1 }}>
                Page {milestoneClientsPage + 1} of {milestoneClientsTotalPages || 1}
              </Typography>
              <Tooltip title="Next Page">
                <span>
                  <IconButton
                    onClick={(e) => handleMilestoneClientsPageChange(e, milestoneClientsPage + 1)}
                    disabled={milestoneClientsPage >= milestoneClientsTotalPages - 1 || milestoneClientsLoading}
                    size="small"
                    sx={{
                      '&:disabled': {
                        opacity: 0.3
                      },
                      '&:hover:not(:disabled)': {
                        backgroundColor: 'action.hover'
                      }
                    }}
                  >
                    <ChevronRightIcon className="h-5 w-5" />
                  </IconButton>
                </span>
              </Tooltip>
              <Tooltip title="Last Page">
                <span>
                  <IconButton
                    onClick={handleLastPage}
                    disabled={milestoneClientsPage >= milestoneClientsTotalPages - 1 || milestoneClientsLoading}
                    size="small"
                    sx={{
                      '&:disabled': {
                        opacity: 0.3
                      },
                      '&:hover:not(:disabled)': {
                        backgroundColor: 'action.hover'
                      }
                    }}
                  >
                    <ChevronDoubleRightIcon className="h-5 w-5" />
                  </IconButton>
                </span>
              </Tooltip>
            </Box>
          </Box>
          <Button onClick={() => setMilestoneClientsModalOpen(false)} variant="contained">
            Close
          </Button>
        </DialogActions>
      </Dialog>

      {/* Email Preview Modal */}
      <Dialog
        open={emailPreviewOpen}
        onClose={() => setEmailPreviewOpen(false)}
        maxWidth="md"
        fullWidth
      >
        <DialogTitle>
          <Box display="flex" justifyContent="space-between" alignItems="center">
            <Typography variant="h6">Email Preview</Typography>
            <IconButton onClick={() => setEmailPreviewOpen(false)} size="small">
              <XMarkIcon className="h-5 w-5" />
            </IconButton>
          </Box>
          {emailPreviewSubject && (
            <Typography variant="body2" color="text.secondary" mt={1}>
              Subject: {emailPreviewSubject}
            </Typography>
          )}
        </DialogTitle>
        <DialogContent>
          {emailPreviewLoading ? (
            <Box sx={{ p: 3, textAlign: 'center' }}>
              <Typography>Loading email preview...</Typography>
            </Box>
          ) : (
            <Box
              sx={{
                border: '1px solid #e0e0e0',
                borderRadius: 1,
                p: 2,
                backgroundColor: '#fafafa',
                maxHeight: '70vh',
                overflow: 'auto'
              }}
            >
              <iframe
                srcDoc={emailPreviewContent}
                title="Email Preview"
                style={iframeStyle}
                sandbox="allow-same-origin"
              />
            </Box>
          )}
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setEmailPreviewOpen(false)} variant="contained">
            Close
          </Button>
        </DialogActions>
      </Dialog>

      {/* ALV Distribution Modal */}
      <Dialog
        open={alvModalOpen}
        onClose={() => setAlvModalOpen(false)}
        maxWidth="lg"
        fullWidth
        PaperProps={{
          sx: {
            maxHeight: '90vh',
            borderRadius: '16px',
          }
        }}
      >
        <div className="flex items-center justify-between px-6 py-4 border-b border-neutral-200">
          <div>
            <h2 className="text-lg font-semibold text-neutral-900">Average Lifetime Value - Detailed Analysis</h2>
            <p className="text-sm text-neutral-500 mt-0.5">Comprehensive distribution analysis to help determine the best metric for ROAS calculations</p>
          </div>
          <button
            onClick={() => setAlvModalOpen(false)}
            className="text-neutral-400 hover:text-neutral-600 p-1 rounded-lg hover:bg-neutral-100 transition-colors"
          >
            <XMarkIcon className="h-5 w-5" />
          </button>
        </div>
        <DialogContent sx={{ pt: 3 }}>
          {analyticsData && analyticsData.individualLTVs && analyticsData.individualLTVs.length > 0 ? (
            <ALVDistributionAnalysis
              individualLTVs={analyticsData.individualLTVs}
              metrics={analyticsData.metrics}
              formatCurrency={formatCurrency}
            />
          ) : (
            <p className="text-sm text-neutral-500 text-center py-8">No distribution data available. Please ensure analytics data has been loaded.</p>
          )}
        </DialogContent>
        <div className="flex justify-end gap-3 px-6 py-4 border-t border-neutral-100 bg-neutral-50">
          <button
            onClick={() => setAlvModalOpen(false)}
            className="inline-flex items-center px-4 py-2 text-sm font-medium text-white bg-primary-500 rounded-md hover:bg-primary-600 transition-colors"
          >
            Close
          </button>
        </div>
      </Dialog>
    </div>
  );
};

export default ClientManagement;
