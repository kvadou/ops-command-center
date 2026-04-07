import React, { useState, useEffect, useRef, lazy, Suspense } from 'react';
import { useNavigate } from 'react-router-dom';
import { formatCurrency } from '../utils/formatters';
import {
  Box,
  Card,
  CardContent,
  Typography,
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
  Divider,
  CircularProgress,
  Alert,
} from '@mui/material';
import {
  MagnifyingGlassIcon,
  FunnelIcon,
  UserIcon,
  EnvelopeIcon,
  PhoneIcon,
  MapPinIcon,
  CurrencyDollarIcon,
  AcademicCapIcon,
  TagIcon,
  XMarkIcon,
  XCircleIcon,
  ClockIcon,
  NoSymbolIcon,
  PencilSquareIcon,
  PlusIcon,
  StarIcon,
  DocumentTextIcon,
  ExclamationTriangleIcon,
  ArrowUpIcon,
  ArrowDownIcon,
  ChartBarIcon,
  CreditCardIcon,
  UserGroupIcon,
  ArrowTrendingUpIcon,
  ChartPieIcon,
  ViewColumnsIcon,
  ChevronLeftIcon,
  ChevronRightIcon,
} from '@heroicons/react/24/outline';
import { StarIcon as StarSolidIcon, CheckCircleIcon as CheckCircleSolidIcon } from '@heroicons/react/24/solid';
import axios from 'axios';
import FailedCheckoutsTab from './FailedCheckoutsTab';
const TutorRetention = lazy(() => import('./TutorRetention'));

// Tutor Management Component
const TutorManagement = () => {
  const navigate = useNavigate();
  // State management
  const [tutors, setTutors] = useState([]);
  const [loading, setLoading] = useState(false);
  const [searchTerm, setSearchTerm] = useState('');
  const [selectedTutor, setSelectedTutor] = useState(null);
  const [tutorDialogOpen, setTutorDialogOpen] = useState(false);
  const [statusFilter, setStatusFilter] = useState('approved');
  const [page, setPage] = useState(0);
  const [rowsPerPage, setRowsPerPage] = useState(25);
  const [error, setError] = useState(null);
  const [tutorReviews, setTutorReviews] = useState([]);
  const [reviewsLoading, setReviewsLoading] = useState(false);
  const [sortBy, setSortBy] = useState(null);
  const [sortOrder, setSortOrder] = useState('asc'); // 'asc' or 'desc'
  const [tutorDetailsLoading, setTutorDetailsLoading] = useState(false);
  const [tutorDetailsData, setTutorDetailsData] = useState(null);
  const [currentTab, setCurrentTab] = useState(0);
  const [mainTab, setMainTab] = useState(0); // 0 = Tutors, 1 = Analytics
  const [analyticsData, setAnalyticsData] = useState(null);
  const [analyticsLoading, setAnalyticsLoading] = useState(false);
  const [analyticsError, setAnalyticsError] = useState(null);
  const [filters, setFilters] = useState({
    labels: [],
    dateRange: { start: '', end: '' }
  });
  const [metricDetailOpen, setMetricDetailOpen] = useState(false);
  const [selectedMetric, setSelectedMetric] = useState(null);
  const [selectedContractorId, setSelectedContractorId] = useState(null);
  const [metricDetailData, setMetricDetailData] = useState([]);
  const [metricDetailLoading, setMetricDetailLoading] = useState(false);
  const [metricDetailError, setMetricDetailError] = useState(null);

  // Column visibility state
  const [visibleColumns, setVisibleColumns] = useState({
    tutor: true, id: true, status: true, rate: true,
    location: true, phone: true, labels: false,
  });
  const [columnsMenuAnchor, setColumnsMenuAnchor] = useState(null);

  // Status counts
  const [statusCounts, setStatusCounts] = useState({
    all: 0, approved: 0, pending: 0, dormant: 0,
  });

  // Resizable columns state - persisted in localStorage
  const colStorageKey = 'columnWidths_tutors';
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

  // Fetch tutors data
  const fetchTutors = async () => {
    setLoading(true);
    setError(null);
    try {
      const response = await axios.get('/api/contractors', {
        params: {
          status: statusFilter,
          search: searchTerm || undefined,
          limit: 1000 // Get all tutors for current status
        },
        withCredentials: true,
      });

      setTutors(response.data || []);
    } catch (error) {
      console.error('Error fetching tutors:', error);
      setError('Failed to fetch tutors. Please try again.');
    } finally {
      setLoading(false);
    }
  };

  // Fetch all status counts
  const fetchStatusCounts = async () => {
    try {
      const [allRes, approvedRes, pendingRes, dormantRes] = await Promise.all([
        axios.get('/api/contractors', { params: { limit: 1 }, withCredentials: true }),
        axios.get('/api/contractors', { params: { status: 'approved', limit: 1 }, withCredentials: true }),
        axios.get('/api/contractors', { params: { status: 'pending', limit: 1 }, withCredentials: true }),
        axios.get('/api/contractors', { params: { status: 'dormant', limit: 1 }, withCredentials: true }),
      ]);
      setStatusCounts({
        all: Array.isArray(allRes.data) ? allRes.data.length : 0,
        approved: Array.isArray(approvedRes.data) ? approvedRes.data.length : 0,
        pending: Array.isArray(pendingRes.data) ? pendingRes.data.length : 0,
        dormant: Array.isArray(dormantRes.data) ? dormantRes.data.length : 0,
      });
    } catch (err) {
      console.error('Error fetching status counts:', err);
    }
  };

  // Fetch detailed tutor information
  const fetchTutorDetails = async (contractorId) => {
    setTutorDetailsLoading(true);
    try {
      const response = await axios.get(`/api/crm/tutors/${contractorId}`, {
        withCredentials: true,
      });

      const { tutor, summary, lessons, paymentOrders, paymentHistory, clients } = response.data;

      setSelectedTutor(tutor || { contractor_id: contractorId });
      setTutorDetailsData({
        tutor: tutor || { contractor_id: contractorId },
        summary: summary || {},
        lessons: lessons || [],
        paymentOrders: paymentOrders || [],
        paymentHistory: paymentHistory || [],
        clients: clients || []
      });

      setTutorDialogOpen(true);
      setCurrentTab(0);

      await fetchTutorReviews(contractorId);
    } catch (error) {
      console.error('Error fetching tutor details:', error);

      const tutor = tutors.find(t => String(t.contractor_id) === String(contractorId));
      if (tutor) {
        setSelectedTutor(tutor);
        setTutorDetailsData({
          tutor: tutor,
          summary: {},
          lessons: [],
          paymentOrders: [],
          paymentHistory: [],
          clients: []
        });
        setTutorDialogOpen(true);
      } else {
        setError('Failed to fetch tutor details. Please try again.');
      }
    } finally {
      setTutorDetailsLoading(false);
    }
  };

  // Fetch reviews for a specific tutor
  const fetchTutorReviews = async (contractorId) => {
    setReviewsLoading(true);
    try {
      const response = await axios.get(`/api/contractors/${contractorId}/reviews?limit=10`, {
        withCredentials: true,
      });
      setTutorReviews(response.data || []);
    } catch (error) {
      console.error('Error fetching tutor reviews:', error);
      setTutorReviews([]);
    } finally {
      setReviewsLoading(false);
    }
  };

  useEffect(() => {
    fetchTutors();
  }, [statusFilter]);

  useEffect(() => {
    fetchStatusCounts();
  }, []);

  // Fetch analytics when mainTab changes to Analytics
  useEffect(() => {
    if (mainTab === 1) {
      fetchAnalytics();
    }
  }, [mainTab, filters.labels, filters.dateRange]);

  // Filter tutors based on search
  const filteredTutors = tutors.filter(tutor => {
    if (!searchTerm) return true;
    const searchLower = searchTerm.toLowerCase();
    return (
      tutor.first_name?.toLowerCase().includes(searchLower) ||
      tutor.last_name?.toLowerCase().includes(searchLower) ||
      tutor.email?.toLowerCase().includes(searchLower)
    );
  });

  // Handle column sorting
  const handleSort = (column) => {
    if (sortBy === column) {
      setSortOrder(sortOrder === 'asc' ? 'desc' : 'asc');
    } else {
      setSortBy(column);
      setSortOrder(column === 'rate' ? 'desc' : 'asc');
    }
    setPage(0);
  };

  // Sort filtered tutors
  const sortedTutors = [...filteredTutors].sort((a, b) => {
    if (!sortBy) return 0;

    let aValue, bValue;

    if (sortBy === 'name') {
      const aName = `${a.first_name || ''} ${a.last_name || ''}`.trim().toLowerCase();
      const bName = `${b.first_name || ''} ${b.last_name || ''}`.trim().toLowerCase();
      aValue = aName;
      bValue = bName;
    } else if (sortBy === 'rate') {
      aValue = a.tier_rate ? parseFloat(a.tier_rate) : (a.default_rate ? parseFloat(a.default_rate) : 0);
      bValue = b.tier_rate ? parseFloat(b.tier_rate) : (b.default_rate ? parseFloat(b.default_rate) : 0);
    } else if (sortBy === 'review_rating') {
      aValue = parseFloat(a.review_rating || 0);
      bValue = parseFloat(b.review_rating || 0);
    } else {
      return 0;
    }

    if (aValue < bValue) return sortOrder === 'asc' ? -1 : 1;
    if (aValue > bValue) return sortOrder === 'asc' ? 1 : -1;
    return 0;
  });

  // Get status badge classes
  const getStatusBadgeClasses = (status) => {
    switch (status) {
      case 'approved':
        return 'bg-success-light text-success-dark';
      case 'pending':
        return 'bg-warning-light text-warning-dark';
      case 'rejected':
        return 'bg-error-light text-error-dark';
      case 'dormant':
        return 'bg-neutral-100 text-neutral-600';
      default:
        return 'bg-neutral-100 text-neutral-600';
    }
  };

  // Get status icon
  const getStatusIcon = (status) => {
    switch (status) {
      case 'approved':
        return <CheckCircleSolidIcon className="h-5 w-5" />;
      case 'pending':
        return <ClockIcon className="h-5 w-5" />;
      case 'rejected':
        return <XCircleIcon className="h-5 w-5" />;
      case 'dormant':
        return <NoSymbolIcon className="h-5 w-5" />;
      default:
        return <UserIcon className="h-5 w-5" />;
    }
  };

  // Get status color (for MUI Chip in detail dialogs)
  const getStatusColor = (status) => {
    switch (status) {
      case 'approved': return 'success';
      case 'pending': return 'warning';
      case 'rejected': return 'error';
      case 'dormant': return 'default';
      default: return 'default';
    }
  };

  // Format phone number
  const formatPhoneNumber = (phone) => {
    if (!phone) return 'N/A';
    const cleaned = phone.replace(/\D/g, '');
    if (cleaned.length === 10) {
      return `(${cleaned.slice(0, 3)}) ${cleaned.slice(3, 6)}-${cleaned.slice(6)}`;
    }
    return phone;
  };

  // Fetch analytics data
  const fetchAnalytics = async () => {
    setAnalyticsLoading(true);
    setAnalyticsError(null);
    try {
      const requestBody = {
        labels: filters.labels || [],
        dateRange: filters.dateRange || { start: '', end: '' }
      };

      const response = await axios.post('/api/crm/analytics/tutor-metrics', requestBody, {
        withCredentials: true,
        timeout: 60000
      });

      setAnalyticsData(response.data);
      setAnalyticsError(null);
    } catch (error) {
      console.error('Error fetching tutor analytics:', error);
      const errorMessage = error.response?.data?.error || error.message || 'Failed to fetch analytics data';
      setAnalyticsError(errorMessage);
      setAnalyticsData(null);
    } finally {
      setAnalyticsLoading(false);
    }
  };

  // Handle metric cell click
  const handleMetricClick = async (contractorId, metric, metricName) => {
    setSelectedMetric(metric);
    setSelectedContractorId(contractorId);
    setMetricDetailOpen(true);
    setMetricDetailLoading(true);
    setMetricDetailError(null);
    setMetricDetailData([]);

    try {
      const response = await axios.post('/api/crm/analytics/tutor-metrics/detail', {
        contractorId,
        metric,
        labels: filters.labels || [],
        dateRange: filters.dateRange || { start: '', end: '' }
      }, {
        withCredentials: true,
      });

      setMetricDetailData(response.data.rows || []);
    } catch (error) {
      console.error('Error fetching metric detail:', error);
      setMetricDetailError(error.response?.data?.error || 'Failed to load metric details');
    } finally {
      setMetricDetailLoading(false);
    }
  };

  // Get metric column headers based on metric type
  const getMetricColumns = (metric) => {
    switch (metric) {
      case 'total_revenue':
        return [
          { id: 'start', label: 'Date', format: (value) => value ? new Date(value).toLocaleDateString() : 'N/A' },
          { id: 'service_name', label: 'Service' },
          { id: 'client_name', label: 'Client' },
          { id: 'student_name', label: 'Student' },
          { id: 'revenue', label: 'Revenue', format: formatCurrency, align: 'right' },
          { id: 'units', label: 'Hours', format: (value) => parseFloat(value || 0).toFixed(2), align: 'right' },
          { id: 'status', label: 'Status' }
        ];
      case 'avg_client_ltv':
        return [
          { id: 'client_name', label: 'Client' },
          { id: 'email', label: 'Email' },
          { id: 'client_ltv', label: 'Client LTV', format: formatCurrency, align: 'right' },
          { id: 'lesson_count', label: 'Lessons', align: 'right' },
          { id: 'student_count', label: 'Students', align: 'right' },
          { id: 'first_lesson_date', label: 'First Lesson', format: (value) => value ? new Date(value).toLocaleDateString() : 'N/A' },
          { id: 'last_lesson_date', label: 'Last Lesson', format: (value) => value ? new Date(value).toLocaleDateString() : 'N/A' }
        ];
      case 'total_lessons':
        return [
          { id: 'start', label: 'Date', format: (value) => value ? new Date(value).toLocaleDateString() : 'N/A' },
          { id: 'service_name', label: 'Service' },
          { id: 'client_name', label: 'Client' },
          { id: 'student_name', label: 'Student' },
          { id: 'duration_hours', label: 'Hours', format: (value) => parseFloat(value || 0).toFixed(2), align: 'right' },
          { id: 'status', label: 'Status' },
          { id: 'location', label: 'Location' }
        ];
      case 'unique_clients':
        return [
          { id: 'client_name', label: 'Client' },
          { id: 'email', label: 'Email' },
          { id: 'lesson_count', label: 'Lessons', align: 'right' },
          { id: 'student_count', label: 'Students', align: 'right' },
          { id: 'first_lesson_date', label: 'First Lesson', format: (value) => value ? new Date(value).toLocaleDateString() : 'N/A' },
          { id: 'last_lesson_date', label: 'Last Lesson', format: (value) => value ? new Date(value).toLocaleDateString() : 'N/A' }
        ];
      case 'active_clients_30d':
        return [
          { id: 'client_name', label: 'Client' },
          { id: 'email', label: 'Email' },
          { id: 'lesson_count_30d', label: 'Lessons (30d)', align: 'right' },
          { id: 'student_count', label: 'Students', align: 'right' },
          { id: 'last_lesson_date', label: 'Last Lesson', format: (value) => value ? new Date(value).toLocaleDateString() : 'N/A' }
        ];
      case 'trial_conversion':
        return [
          { id: 'client_name', label: 'Client' },
          { id: 'email', label: 'Email' },
          { id: 'lesson_count', label: 'Lessons', align: 'right' },
          { id: 'status', label: 'Status' },
          { id: 'student_count', label: 'Students', align: 'right' },
          { id: 'first_lesson_date', label: 'First Lesson', format: (value) => value ? new Date(value).toLocaleDateString() : 'N/A' },
          { id: 'last_lesson_date', label: 'Last Lesson', format: (value) => value ? new Date(value).toLocaleDateString() : 'N/A' }
        ];
      case 'ramped_up':
        return [
          { id: 'first_lesson_date', label: 'First Lesson', format: (value) => value ? new Date(value).toLocaleDateString() : 'N/A' },
          { id: 'lessons_first_30_days', label: 'Lessons (30d)', align: 'right' },
          { id: 'lessons_first_60_days', label: 'Lessons (60d)', align: 'right' },
          { id: 'lessons_first_90_days', label: 'Lessons (90d)', align: 'right' },
          { id: 'ramp_status', label: 'Ramp Status' }
        ];
      default:
        return [];
    }
  };

  // Render tutor details dialog (kept as-is for detail view)
  const renderTutorDetails = () => {
    if (!selectedTutor) return null;

    return (
      <Dialog
        open={tutorDialogOpen}
        onClose={() => setTutorDialogOpen(false)}
        maxWidth="lg"
        fullWidth
        PaperProps={{
          sx: { maxHeight: '90vh' }
        }}
      >
        <DialogTitle>
          <Box display="flex" justifyContent="space-between" alignItems="center">
            <Typography variant="h6" component="div">
              {selectedTutor?.first_name} {selectedTutor?.last_name}
            </Typography>
            <IconButton onClick={() => setTutorDialogOpen(false)} size="small">
              <XMarkIcon className="h-5 w-5" />
            </IconButton>
          </Box>
        </DialogTitle>
        <DialogContent dividers sx={{ p: 0 }}>
          {tutorDetailsLoading ? (
            <Box sx={{ p: 3, display: 'flex', justifyContent: 'center' }}>
              <CircularProgress />
            </Box>
          ) : (
            <>
              <Tabs value={currentTab} onChange={(e, v) => setCurrentTab(v)} sx={{ borderBottom: 1, borderColor: 'divider', px: 2 }}>
                <Tab label="Overview" icon={<UserIcon className="h-5 w-5" />} iconPosition="start" />
                <Tab label={`Lessons (${tutorDetailsData?.lessons?.length || 0})`} icon={<AcademicCapIcon className="h-5 w-5" />} iconPosition="start" />
                <Tab label={`Payment Orders (${tutorDetailsData?.paymentOrders?.length || 0})`} icon={<CreditCardIcon className="h-5 w-5" />} iconPosition="start" />
                <Tab label={`Payment History (${tutorDetailsData?.paymentHistory?.length || 0})`} icon={<ClockIcon className="h-5 w-5" />} iconPosition="start" />
                <Tab label={`Clients (${tutorDetailsData?.clients?.length || 0})`} icon={<UserGroupIcon className="h-5 w-5" />} iconPosition="start" />
              </Tabs>
              <Box sx={{ p: 2 }}>
                {currentTab === 0 && renderOverviewTab()}
                {currentTab === 1 && renderLessonsTab()}
                {currentTab === 2 && renderPaymentOrdersTab()}
                {currentTab === 3 && renderPaymentHistoryTab()}
                {currentTab === 4 && renderClientsTab()}
              </Box>
            </>
          )}
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setTutorDialogOpen(false)}>Close</Button>
          <Button variant="contained" startIcon={<PencilSquareIcon className="h-5 w-5" />} disabled>
            Edit (Coming Soon)
          </Button>
        </DialogActions>
      </Dialog>
    );
  };

  // Render Overview Tab
  const renderOverviewTab = () => {
    if (!selectedTutor || !tutorDetailsData) return null;
    const tutor = selectedTutor;
    const extraAttrs = tutor.extra_attrs || {};
    const summary = tutorDetailsData.summary || {};

    return (
      <Box mt={2}>
        <Grid container spacing={3}>
          {/* Summary Cards */}
          <Grid item xs={12} md={3}>
            <Card>
              <CardContent>
                <Typography variant="body2" color="text.secondary">Total Lessons</Typography>
                <Typography variant="h4">{summary.total_lessons || 0}</Typography>
              </CardContent>
            </Card>
          </Grid>
          <Grid item xs={12} md={3}>
            <Card>
              <CardContent>
                <Typography variant="body2" color="text.secondary">Total Hours</Typography>
                <Typography variant="h4">{summary.total_hours || 0}</Typography>
              </CardContent>
            </Card>
          </Grid>
          <Grid item xs={12} md={3}>
            <Card>
              <CardContent>
                <Typography variant="body2" color="text.secondary">Total Revenue</Typography>
                <Typography variant="h4" color="primary">{formatCurrency(summary.total_revenue || 0)}</Typography>
              </CardContent>
            </Card>
          </Grid>
          <Grid item xs={12} md={3}>
            <Card>
              <CardContent>
                <Typography variant="body2" color="text.secondary">Unique Clients</Typography>
                <Typography variant="h4">{summary.unique_clients || 0}</Typography>
              </CardContent>
            </Card>
          </Grid>

          {/* Basic Information */}
          <Grid item xs={12} md={6}>
            <Card>
              <CardContent>
                <Typography variant="h6" gutterBottom>Basic Information</Typography>
                <Divider sx={{ mb: 2 }} />
                <Grid container spacing={2}>
                  <Grid item xs={12} sm={6}>
                    <Typography variant="caption" color="text.secondary">Full Name</Typography>
                    <Typography variant="body1">{tutor.first_name} {tutor.last_name}</Typography>
                  </Grid>
                  <Grid item xs={12} sm={6}>
                    <Typography variant="caption" color="text.secondary">Status</Typography>
                    <Box mt={0.5}>
                      <Chip
                        icon={getStatusIcon(tutor.status)}
                        label={tutor.status?.toUpperCase() || 'UNKNOWN'}
                        color={getStatusColor(tutor.status)}
                        size="small"
                      />
                    </Box>
                  </Grid>
                  <Grid item xs={12} sm={6}>
                    <Typography variant="caption" color="text.secondary">TutorCruncher ID</Typography>
                    <Box mt={0.5}>
                      <Typography
                        component="a"
                        href={`https://account.acmeops.com/contractors/${tutor.contractor_id || tutor.id}/`}
                        target="_blank"
                        rel="noopener noreferrer"
                        variant="body1"
                        sx={{
                          color: 'primary.main',
                          textDecoration: 'none',
                          '&:hover': { textDecoration: 'underline' }
                        }}
                      >
                        {tutor.contractor_id || tutor.id}
                      </Typography>
                    </Box>
                  </Grid>
                  <Grid item xs={12} sm={6}>
                    <Typography variant="caption" color="text.secondary">Email</Typography>
                    <Box display="flex" alignItems="center" mt={0.5}>
                      <EnvelopeIcon className="h-4 w-4 mr-2 text-neutral-500" />
                      <Typography variant="body1">{tutor.email || 'N/A'}</Typography>
                    </Box>
                  </Grid>
                  <Grid item xs={12} sm={6}>
                    <Typography variant="caption" color="text.secondary">Phone</Typography>
                    <Box display="flex" alignItems="center" mt={0.5}>
                      <PhoneIcon className="h-4 w-4 mr-2 text-neutral-500" />
                      <Typography variant="body1">{formatPhoneNumber(tutor.mobile || tutor.phone)}</Typography>
                    </Box>
                  </Grid>
                  {(tutor.tier_rate || tutor.default_rate) && (
                    <Grid item xs={12} sm={6}>
                      <Typography variant="caption" color="text.secondary">Tier Rate</Typography>
                      <Typography variant="body1">
                        ${parseFloat(tutor.tier_rate || tutor.default_rate).toFixed(2)}/hour
                      </Typography>
                    </Grid>
                  )}
                  {tutor.labels && tutor.labels.length > 0 && (
                    <Grid item xs={12}>
                      <Typography variant="caption" color="text.secondary">Labels</Typography>
                      <Box display="flex" flexWrap="wrap" gap={0.5} mt={0.5}>
                        {tutor.labels.map((label, index) => (
                          <Chip
                            key={index}
                            label={typeof label === 'object' ? label.name || label.id : label}
                            size="small"
                            color="primary"
                            variant="outlined"
                          />
                        ))}
                      </Box>
                    </Grid>
                  )}
                </Grid>
              </CardContent>
            </Card>
          </Grid>

          {/* Address & Additional Info */}
          <Grid item xs={12} md={6}>
            <Card>
              <CardContent>
                <Typography variant="h6" gutterBottom>Address</Typography>
                <Divider sx={{ mb: 2 }} />
                {(tutor.street || tutor.town || tutor.state) ? (
                  <Grid container spacing={2}>
                    {tutor.street && (
                      <Grid item xs={12}>
                        <Typography variant="body2">{tutor.street}</Typography>
                      </Grid>
                    )}
                    {(tutor.town || tutor.state || tutor.postcode) && (
                      <Grid item xs={12}>
                        <Typography variant="body2">
                          {[tutor.town, tutor.state, tutor.postcode].filter(Boolean).join(', ')}
                        </Typography>
                      </Grid>
                    )}
                    {tutor.country && (
                      <Grid item xs={12}>
                        <Typography variant="body2">{tutor.country}</Typography>
                      </Grid>
                    )}
                    {tutor.timezone && (
                      <Grid item xs={12}>
                        <Typography variant="body2">Timezone: {tutor.timezone}</Typography>
                      </Grid>
                    )}
                  </Grid>
                ) : (
                  <Typography variant="body2" color="text.secondary">No address information</Typography>
                )}
              </CardContent>
            </Card>
          </Grid>
        </Grid>
      </Box>
    );
  };

  // Render Lessons Tab
  const renderLessonsTab = () => {
    if (!tutorDetailsData?.lessons) return null;
    const lessons = tutorDetailsData.lessons || [];

    return (
      <Box mt={2}>
        <Typography variant="h6" gutterBottom>
          Lesson History ({lessons.length} lessons)
        </Typography>
        {lessons.length > 0 ? (
          <TableContainer component={Paper}>
            <Table>
              <TableHead>
                <TableRow>
                  <TableCell>Date & Time</TableCell>
                  <TableCell>Service</TableCell>
                  <TableCell>Students</TableCell>
                  <TableCell>Duration</TableCell>
                  <TableCell>Status</TableCell>
                  <TableCell>Revenue</TableCell>
                </TableRow>
              </TableHead>
              <TableBody>
                {lessons.slice(0, 100).map((lesson) => (
                  <TableRow key={lesson.appointment_id}>
                    <TableCell>
                      <Typography variant="body2">
                        {lesson.start ? new Date(lesson.start).toLocaleDateString('en-US', {
                          year: 'numeric',
                          month: 'short',
                          day: 'numeric'
                        }) : 'N/A'}
                      </Typography>
                      {lesson.start && (
                        <Typography variant="caption" color="text.secondary">
                          {new Date(lesson.start).toLocaleTimeString('en-US', {
                            hour: '2-digit',
                            minute: '2-digit'
                          })}
                        </Typography>
                      )}
                    </TableCell>
                    <TableCell>
                      <Typography variant="body2">{lesson.service_name || 'N/A'}</Typography>
                    </TableCell>
                    <TableCell>
                      {lesson.recipients && lesson.recipients.length > 0 ? (
                        <Typography variant="body2">
                          {lesson.recipients.map(r => r.recipient_name).join(', ')}
                        </Typography>
                      ) : (
                        <Typography variant="body2" color="text.secondary">N/A</Typography>
                      )}
                    </TableCell>
                    <TableCell>
                      <Typography variant="body2">{parseFloat(lesson.units || 0).toFixed(2)} hours</Typography>
                    </TableCell>
                    <TableCell>
                      <Chip
                        label={lesson.status || 'unknown'}
                        size="small"
                        color={
                          lesson.status === 'complete' ? 'success' :
                          lesson.status === 'cancelled-chargeable' ? 'warning' :
                          lesson.status === 'cancelled' ? 'error' :
                          'default'
                        }
                      />
                    </TableCell>
                    <TableCell>
                      <Typography variant="body2">{formatCurrency(lesson.total_revenue || 0)}</Typography>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </TableContainer>
        ) : (
          <Box textAlign="center" py={4}>
            <Typography variant="body2" color="text.secondary">
              No lessons found for this tutor
            </Typography>
          </Box>
        )}
      </Box>
    );
  };

  // Render Payment Orders Tab
  const renderPaymentOrdersTab = () => {
    if (!tutorDetailsData?.paymentOrders) return null;
    const paymentOrders = tutorDetailsData.paymentOrders || [];

    return (
      <Box mt={2}>
        <Typography variant="h6" gutterBottom>
          Payment Orders ({paymentOrders.length} orders)
        </Typography>
        {paymentOrders.length > 0 ? (
          <TableContainer component={Paper}>
            <Table>
              <TableHead>
                <TableRow>
                  <TableCell>Order ID</TableCell>
                  <TableCell>Date Sent</TableCell>
                  <TableCell>Date Paid</TableCell>
                  <TableCell>Amount</TableCell>
                  <TableCell>Status</TableCell>
                  <TableCell>Appointments</TableCell>
                  <TableCell>Link</TableCell>
                </TableRow>
              </TableHead>
              <TableBody>
                {paymentOrders.map((order) => (
                  <TableRow key={order.id}>
                    <TableCell>
                      <Typography variant="body2" fontWeight="medium">
                        {order.display_id || order.id}
                      </Typography>
                    </TableCell>
                    <TableCell>
                      <Typography variant="body2">
                        {order.date_sent ? new Date(order.date_sent).toLocaleDateString('en-US', {
                          year: 'numeric',
                          month: 'short',
                          day: 'numeric'
                        }) : 'N/A'}
                      </Typography>
                    </TableCell>
                    <TableCell>
                      <Typography variant="body2">
                        {order.date_paid ? new Date(order.date_paid).toLocaleDateString('en-US', {
                          year: 'numeric',
                          month: 'short',
                          day: 'numeric'
                        }) : 'Not paid'}
                      </Typography>
                    </TableCell>
                    <TableCell>
                      <Typography variant="body2" fontWeight="medium">
                        {formatCurrency(order.amount || 0)}
                      </Typography>
                    </TableCell>
                    <TableCell>
                      <Chip
                        label={order.status || 'unknown'}
                        size="small"
                        color={
                          order.status === 'paid' ? 'success' :
                          order.status === 'unpaid' ? 'error' :
                          'default'
                        }
                      />
                    </TableCell>
                    <TableCell>
                      <Typography variant="body2">
                        {order.appointment_count || 0} appointments
                      </Typography>
                    </TableCell>
                    <TableCell>
                      {order.url ? (
                        <Button
                          size="small"
                          href={order.url}
                          target="_blank"
                          rel="noopener noreferrer"
                        >
                          View
                        </Button>
                      ) : (
                        <Typography variant="body2" color="text.secondary">N/A</Typography>
                      )}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </TableContainer>
        ) : (
          <Box textAlign="center" py={4}>
            <Typography variant="body2" color="text.secondary">
              No payment orders found for this tutor
            </Typography>
          </Box>
        )}
      </Box>
    );
  };

  // Render Payment History Tab
  const renderPaymentHistoryTab = () => {
    if (!tutorDetailsData?.paymentHistory) return null;
    const paymentHistory = tutorDetailsData.paymentHistory || [];

    return (
      <Box mt={2}>
        <Typography variant="h6" gutterBottom>
          Payment History ({paymentHistory.length} charges)
        </Typography>
        {paymentHistory.length > 0 ? (
          <TableContainer component={Paper}>
            <Table>
              <TableHead>
                <TableRow>
                  <TableCell>Date</TableCell>
                  <TableCell>Service</TableCell>
                  <TableCell>Amount</TableCell>
                  <TableCell>Rate</TableCell>
                  <TableCell>Units</TableCell>
                  <TableCell>Payment Order</TableCell>
                </TableRow>
              </TableHead>
              <TableBody>
                {paymentHistory.slice(0, 200).map((charge, index) => (
                  <TableRow key={`${charge.payment_order_id}-${charge.charge_index}-${index}`}>
                    <TableCell>
                      <Typography variant="body2">
                        {charge.date ? new Date(charge.date).toLocaleDateString('en-US', {
                          year: 'numeric',
                          month: 'short',
                          day: 'numeric'
                        }) : 'N/A'}
                      </Typography>
                    </TableCell>
                    <TableCell>
                      <Typography variant="body2">{charge.service_name || 'N/A'}</Typography>
                    </TableCell>
                    <TableCell>
                      <Typography variant="body2" fontWeight="medium">
                        {formatCurrency(charge.amount || 0)}
                      </Typography>
                    </TableCell>
                    <TableCell>
                      <Typography variant="body2">{formatCurrency(charge.rate || 0)}</Typography>
                    </TableCell>
                    <TableCell>
                      <Typography variant="body2">{parseFloat(charge.units || 0).toFixed(2)}</Typography>
                    </TableCell>
                    <TableCell>
                      <Typography variant="body2" color="primary">
                        {charge.payment_order_display_id || charge.payment_order_id}
                      </Typography>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </TableContainer>
        ) : (
          <Box textAlign="center" py={4}>
            <Typography variant="body2" color="text.secondary">
              No payment history found for this tutor
            </Typography>
          </Box>
        )}
      </Box>
    );
  };

  // Render Clients Tab
  const renderClientsTab = () => {
    if (!tutorDetailsData?.clients) return null;
    const clients = tutorDetailsData.clients || [];

    return (
      <Box mt={2}>
        <Typography variant="h6" gutterBottom>
          Clients Worked With ({clients.length} clients)
        </Typography>
        {clients.length > 0 ? (
          <TableContainer component={Paper}>
            <Table>
              <TableHead>
                <TableRow>
                  <TableCell>Client Name</TableCell>
                  <TableCell>Email</TableCell>
                  <TableCell>Lessons</TableCell>
                  <TableCell>Students</TableCell>
                  <TableCell>Total Revenue</TableCell>
                  <TableCell>First Lesson</TableCell>
                  <TableCell>Last Lesson</TableCell>
                </TableRow>
              </TableHead>
              <TableBody>
                {clients.map((client) => (
                  <TableRow key={client.client_id}>
                    <TableCell>
                      <Typography variant="body2" fontWeight="medium">
                        {client.client_name || `${client.first_name || ''} ${client.last_name || ''}`.trim() || 'N/A'}
                      </Typography>
                    </TableCell>
                    <TableCell>
                      <Typography variant="body2">{client.email || 'N/A'}</Typography>
                    </TableCell>
                    <TableCell>
                      <Typography variant="body2">{client.lesson_count || 0}</Typography>
                    </TableCell>
                    <TableCell>
                      <Typography variant="body2">{client.student_count || 0}</Typography>
                    </TableCell>
                    <TableCell>
                      <Typography variant="body2" fontWeight="medium" color="primary">
                        {formatCurrency(client.total_revenue || 0)}
                      </Typography>
                    </TableCell>
                    <TableCell>
                      <Typography variant="body2" color="text.secondary">
                        {client.first_lesson_date ? new Date(client.first_lesson_date).toLocaleDateString('en-US', {
                          year: 'numeric',
                          month: 'short',
                          day: 'numeric'
                        }) : 'N/A'}
                      </Typography>
                    </TableCell>
                    <TableCell>
                      <Typography variant="body2" color="text.secondary">
                        {client.last_lesson_date ? new Date(client.last_lesson_date).toLocaleDateString('en-US', {
                          year: 'numeric',
                          month: 'short',
                          day: 'numeric'
                        }) : 'N/A'}
                      </Typography>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </TableContainer>
        ) : (
          <Box textAlign="center" py={4}>
            <Typography variant="body2" color="text.secondary">
              No clients found for this tutor
            </Typography>
          </Box>
        )}
      </Box>
    );
  };

  // Render Analytics Tab
  const renderAnalyticsTab = () => {
    if (analyticsLoading) {
      return (
        <Box sx={{ p: 3, display: 'flex', justifyContent: 'center', alignItems: 'center', minHeight: '400px' }}>
          <Box textAlign="center">
            <CircularProgress />
            <Typography variant="h6" gutterBottom sx={{ mt: 2 }}>Loading Analytics...</Typography>
            <Typography variant="body2" color="text.secondary">
              Fetching tutor metrics and insights
            </Typography>
          </Box>
        </Box>
      );
    }

    if (analyticsError) {
      return (
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
      );
    }

    if (!analyticsData || !analyticsData.metrics) {
      return (
        <Box sx={{ p: 3, textAlign: 'center' }}>
          <Typography variant="h6" gutterBottom>No Analytics Data</Typography>
          <Typography variant="body2" color="text.secondary">
            Analytics data will appear here once loaded
          </Typography>
        </Box>
      );
    }

    const { metrics, aggregates } = analyticsData;

    return (
      <Box>
        {/* KPI Cards */}
        <Grid container spacing={3} mb={3}>
          <Grid item xs={12} sm={6} md={3}>
            <Card>
              <CardContent>
                <Typography variant="body2" color="text.secondary" gutterBottom>
                  Total Tutors
                </Typography>
                <Typography variant="h4" fontWeight="bold" color="primary.main">
                  {aggregates.total_tutors.toLocaleString()}
                </Typography>
              </CardContent>
            </Card>
          </Grid>
          <Grid item xs={12} sm={6} md={3}>
            <Card>
              <CardContent>
                <Typography variant="body2" color="text.secondary" gutterBottom>
                  Total Revenue Generated
                </Typography>
                <Typography variant="h4" fontWeight="bold" color="success.main">
                  {formatCurrency(aggregates.total_revenue)}
                </Typography>
                <Typography variant="caption" color="text.secondary" mt={1}>
                  Avg: {formatCurrency(aggregates.avg_revenue_per_tutor)} per tutor
                </Typography>
              </CardContent>
            </Card>
          </Grid>
          <Grid item xs={12} sm={6} md={3}>
            <Card>
              <CardContent>
                <Typography variant="body2" color="text.secondary" gutterBottom>
                  Average Client LTV
                </Typography>
                <Typography variant="h4" fontWeight="bold" color="info.main">
                  {formatCurrency(aggregates.avg_ltv_per_tutor)}
                </Typography>
                <Typography variant="caption" color="text.secondary" mt={1}>
                  Median LTV per tutor
                </Typography>
              </CardContent>
            </Card>
          </Grid>
          <Grid item xs={12} sm={6} md={3}>
            <Card>
              <CardContent>
                <Typography variant="body2" color="text.secondary" gutterBottom>
                  Ramped Up Tutors
                </Typography>
                <Typography variant="h4" fontWeight="bold" color="warning.main">
                  {aggregates.ramped_up_count}
                </Typography>
                <Typography variant="caption" color="text.secondary" mt={1}>
                  {aggregates.ramped_up_percentage.toFixed(1)}% of total tutors
                </Typography>
              </CardContent>
            </Card>
          </Grid>
        </Grid>

        {/* Top Performers Table */}
        <Card sx={{ mb: 3 }}>
          <CardContent>
            <Typography variant="h6" gutterBottom>
              Top Performing Tutors
            </Typography>
            <TableContainer>
              <Table>
                <TableHead>
                  <TableRow>
                    <TableCell>Tutor Name</TableCell>
                    <TableCell align="right">Total Revenue</TableCell>
                    <TableCell align="right">Avg Client LTV</TableCell>
                    <TableCell align="right">Total Lessons</TableCell>
                    <TableCell align="right">Unique Clients</TableCell>
                    <TableCell align="right">Active (30d)</TableCell>
                    <TableCell align="right">Trial Conversion</TableCell>
                    <TableCell align="right">Ramped Up</TableCell>
                  </TableRow>
                </TableHead>
                <TableBody>
                  {metrics.slice(0, 50).map((tutor) => (
                    <TableRow key={tutor.contractor_id} hover>
                      <TableCell>
                        <Typography variant="body2" fontWeight="medium">
                          {tutor.contractor_name || `Tutor ${tutor.contractor_id}`}
                        </Typography>
                      </TableCell>
                      <TableCell align="right">
                        <Typography
                          variant="body2"
                          fontWeight="bold"
                          color="primary.main"
                          sx={{
                            cursor: 'pointer',
                            '&:hover': { textDecoration: 'underline' }
                          }}
                          onClick={() => handleMetricClick(tutor.contractor_id, 'total_revenue', 'Total Revenue')}
                        >
                          {formatCurrency(tutor.total_revenue)}
                        </Typography>
                      </TableCell>
                      <TableCell align="right">
                        <Typography
                          variant="body2"
                          sx={{
                            cursor: 'pointer',
                            '&:hover': { textDecoration: 'underline' }
                          }}
                          onClick={() => handleMetricClick(tutor.contractor_id, 'avg_client_ltv', 'Avg Client LTV')}
                        >
                          {formatCurrency(tutor.avg_client_ltv)}
                        </Typography>
                      </TableCell>
                      <TableCell align="right">
                        <Typography
                          variant="body2"
                          sx={{
                            cursor: 'pointer',
                            '&:hover': { textDecoration: 'underline' }
                          }}
                          onClick={() => handleMetricClick(tutor.contractor_id, 'total_lessons', 'Total Lessons')}
                        >
                          {tutor.total_lessons || 0}
                        </Typography>
                      </TableCell>
                      <TableCell align="right">
                        <Typography
                          variant="body2"
                          sx={{
                            cursor: 'pointer',
                            '&:hover': { textDecoration: 'underline' }
                          }}
                          onClick={() => handleMetricClick(tutor.contractor_id, 'unique_clients', 'Unique Clients')}
                        >
                          {tutor.unique_clients || 0}
                        </Typography>
                      </TableCell>
                      <TableCell align="right">
                        <Typography
                          variant="body2"
                          sx={{
                            cursor: 'pointer',
                            '&:hover': { textDecoration: 'underline' }
                          }}
                          onClick={() => handleMetricClick(tutor.contractor_id, 'active_clients_30d', 'Active Clients (30d)')}
                        >
                          {tutor.active_clients_30d || 0}
                        </Typography>
                      </TableCell>
                      <TableCell align="right">
                        <Chip
                          label={`${tutor.trial_conversion_rate.toFixed(1)}%`}
                          size="small"
                          color={tutor.trial_conversion_rate >= 50 ? 'success' : tutor.trial_conversion_rate >= 30 ? 'warning' : 'default'}
                          onClick={() => handleMetricClick(tutor.contractor_id, 'trial_conversion', 'Trial Conversion')}
                          sx={{ cursor: 'pointer' }}
                        />
                      </TableCell>
                      <TableCell align="right">
                        <Chip
                          label={tutor.ramped_up_60_days ? 'Yes' : 'No'}
                          size="small"
                          color={tutor.ramped_up_60_days ? 'success' : 'default'}
                          onClick={() => handleMetricClick(tutor.contractor_id, 'ramped_up', 'Ramped Up')}
                          sx={{ cursor: 'pointer' }}
                        />
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </TableContainer>
          </CardContent>
        </Card>
      </Box>
    );
  };

  // Render Metric Detail Modal
  const renderMetricDetailModal = () => {
    const columns = getMetricColumns(selectedMetric || '');
    const tutorName = analyticsData?.metrics?.find(m => m.contractor_id === selectedContractorId)?.contractor_name || `Tutor ${selectedContractorId}`;

    const metricDisplayNames = {
      'total_revenue': 'Total Revenue',
      'avg_client_ltv': 'Avg Client LTV',
      'total_lessons': 'Total Lessons',
      'unique_clients': 'Unique Clients',
      'active_clients_30d': 'Active Clients (30d)',
      'trial_conversion': 'Trial Conversion',
      'ramped_up': 'Ramped Up'
    };
    const displayName = metricDisplayNames[selectedMetric] || selectedMetric;

    return (
      <Dialog
        open={metricDetailOpen}
        onClose={() => setMetricDetailOpen(false)}
        maxWidth="lg"
        fullWidth
        PaperProps={{
          sx: { maxHeight: '90vh' }
        }}
      >
        <DialogTitle>
          <Box display="flex" justifyContent="space-between" alignItems="center">
            <Box>
              <Typography variant="h6">
                {displayName} - {tutorName}
              </Typography>
              <Typography variant="body2" color="text.secondary" mt={0.5}>
                Detailed breakdown ({metricDetailData.length} records)
              </Typography>
            </Box>
            <IconButton onClick={() => setMetricDetailOpen(false)} size="small">
              <XMarkIcon className="h-5 w-5" />
            </IconButton>
          </Box>
        </DialogTitle>
        <DialogContent dividers>
          {metricDetailLoading ? (
            <Box sx={{ p: 3, display: 'flex', justifyContent: 'center' }}>
              <CircularProgress />
            </Box>
          ) : metricDetailError ? (
            <Alert severity="error" sx={{ mb: 2 }}>
              {metricDetailError}
            </Alert>
          ) : metricDetailData.length === 0 ? (
            <Box sx={{ p: 3, textAlign: 'center' }}>
              <Typography variant="body2" color="text.secondary">
                No data available for this metric
              </Typography>
            </Box>
          ) : (
            <TableContainer component={Paper} sx={{ maxHeight: '60vh' }}>
              <Table stickyHeader>
                <TableHead>
                  <TableRow>
                    {columns.map((col) => (
                      <TableCell
                        key={col.id}
                        align={col.align || 'left'}
                        sx={{ fontWeight: 'bold' }}
                      >
                        {col.label}
                      </TableCell>
                    ))}
                  </TableRow>
                </TableHead>
                <TableBody>
                  {metricDetailData.map((row, index) => (
                    <TableRow key={row.appointment_id || row.client_id || index} hover>
                      {columns.map((col) => {
                        const value = row[col.id];
                        const displayValue = col.format ? col.format(value) : (value ?? 'N/A');
                        return (
                          <TableCell key={col.id} align={col.align || 'left'}>
                            {col.id === 'status' && typeof value === 'string' ? (
                              <Chip
                                label={value}
                                size="small"
                                color={
                                  value === 'Converted' || value === 'Ramped (30d)' || value === 'Ramped (60d)' ? 'success' :
                                  value === 'Trial' || value === 'Not Ramped' ? 'default' :
                                  value === 'complete' ? 'success' :
                                  value === 'cancelled-chargeable' ? 'warning' :
                                  'default'
                                }
                              />
                            ) : (
                              <Typography variant="body2">{displayValue}</Typography>
                            )}
                          </TableCell>
                        );
                      })}
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </TableContainer>
          )}
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setMetricDetailOpen(false)}>Close</Button>
        </DialogActions>
      </Dialog>
    );
  };

  // Column definitions for the tutor list table
  const tutorColumns = [
    { key: 'tutor', label: 'Tutor', sortable: true, sortField: 'name' },
    { key: 'id', label: 'ID', sortable: false },
    { key: 'status', label: 'Status', sortable: false },
    { key: 'rate', label: 'Rate', sortable: true, sortField: 'rate' },
    { key: 'location', label: 'Location', sortable: false },
    { key: 'phone', label: 'Phone', sortable: false },
    { key: 'labels', label: 'Labels', sortable: false },
  ];

  // Sort indicator for column headers
  const renderSortIndicator = (col) => {
    if (!col.sortable) return null;
    const field = col.sortField || col.key;
    if (sortBy === field) {
      return <span className="ml-1 text-primary-500">{sortOrder === 'asc' ? '\u2191' : '\u2193'}</span>;
    }
    return <span className="ml-1 text-neutral-300">{'\u2195'}</span>;
  };

  // Get tutor display name
  const getTutorDisplayName = (tutor) => {
    if (tutor.first_name || tutor.last_name) {
      return `${tutor.first_name || ''} ${tutor.last_name || ''}`.trim();
    }
    return tutor.email || 'Unknown Tutor';
  };

  // Get label display name
  const getLabelName = (label) => {
    if (!label) return '';
    if (typeof label === 'string') return label;
    if (typeof label === 'object' && label.name) return label.name;
    return String(label);
  };

  // Render tutor row
  const renderTutorRow = (tutor) => (
    <tr
      key={tutor.contractor_id}
      className="hover:bg-neutral-50 transition-colors cursor-pointer border-b border-neutral-100"
      onClick={() => navigate(`/tutors/${tutor.contractor_id}`)}
    >
      {visibleColumns.tutor && (
        <td className="px-3 py-2.5">
          <div className="flex items-center">
            <div className="flex-shrink-0 w-8 h-8 rounded-full bg-primary-100 text-primary-700 flex items-center justify-center text-xs font-semibold mr-3">
              {getTutorDisplayName(tutor)?.[0] || 'T'}
            </div>
            <div>
              <div className="text-sm font-medium text-neutral-900">
                {getTutorDisplayName(tutor)}
              </div>
            </div>
          </div>
        </td>
      )}
      {visibleColumns.id && (
        <td className="px-3 py-2.5">
          <a
            href={`https://account.acmeops.com/contractors/${tutor.contractor_id}/`}
            target="_blank"
            rel="noopener noreferrer"
            onClick={(e) => e.stopPropagation()}
            className="text-sm text-primary-500 hover:underline"
          >
            {tutor.contractor_id}
          </a>
        </td>
      )}
      {visibleColumns.status && (
        <td className="px-3 py-2.5">
          <span className={`inline-flex items-center rounded-full px-2 py-0.5 text-[11px] font-medium ${getStatusBadgeClasses(tutor.status)}`}>
            {tutor.status ? tutor.status.charAt(0).toUpperCase() + tutor.status.slice(1) : 'Unknown'}
          </span>
        </td>
      )}
      {visibleColumns.rate && (
        <td className="px-3 py-2.5">
          <span className="text-sm font-semibold text-primary-500">
            {tutor.tier_rate ? `$${parseFloat(tutor.tier_rate).toFixed(2)}` : tutor.default_rate ? `$${parseFloat(tutor.default_rate).toFixed(2)}` : '--'}
          </span>
        </td>
      )}
      {visibleColumns.location && (
        <td className="px-3 py-2.5 text-sm text-neutral-700">
          {[tutor.town, tutor.state].filter(Boolean).join(', ') || '--'}
        </td>
      )}
      {visibleColumns.phone && (
        <td className="px-3 py-2.5 text-sm text-neutral-700">
          {formatPhoneNumber(tutor.mobile || tutor.phone) !== 'N/A' ? formatPhoneNumber(tutor.mobile || tutor.phone) : '--'}
        </td>
      )}
      {visibleColumns.labels && (
        <td className="px-3 py-2.5">
          <div className="flex flex-wrap gap-1">
            {tutor.labels && Array.isArray(tutor.labels) && tutor.labels.length > 0 ? (
              tutor.labels.slice(0, 2).map((label, index) => {
                const labelName = getLabelName(label);
                return (
                  <span
                    key={index}
                    className="inline-flex items-center rounded-full px-2 py-0.5 text-[11px] font-medium bg-primary-100 text-primary-700"
                  >
                    {labelName}
                  </span>
                );
              })
            ) : (
              <span className="text-sm text-neutral-400">--</span>
            )}
            {tutor.labels && tutor.labels.length > 2 && (
              <span className="inline-flex items-center rounded-full px-2 py-0.5 text-[11px] font-medium bg-neutral-100 text-neutral-600">
                +{tutor.labels.length - 2}
              </span>
            )}
          </div>
        </td>
      )}
    </tr>
  );

  if (loading && tutors.length === 0) {
    return (
      <Box sx={{ p: 3, display: 'flex', justifyContent: 'center', alignItems: 'center', minHeight: '400px' }}>
        <Box textAlign="center">
          <CircularProgress />
          <Typography variant="h6" gutterBottom sx={{ mt: 2 }}>Loading Tutors...</Typography>
          <Typography variant="body2" color="text.secondary">
            Fetching tutor data from database
          </Typography>
        </Box>
      </Box>
    );
  }

  // Pagination
  const paginatedTutors = sortedTutors.slice(
    page * rowsPerPage,
    page * rowsPerPage + rowsPerPage
  );

  const PAGE_TABS = [
    { id: 0, label: 'Tutors' },
    { id: 1, label: 'Analytics' },
    { id: 2, label: 'Failed Checkouts' },
    { id: 3, label: 'Tutor Reports' },
  ];

  const STATUS_TABS = [
    { key: 'approved', label: 'Approved', count: statusCounts.approved },
    { key: 'pending', label: 'Pending', count: statusCounts.pending },
    { key: 'dormant', label: 'Dormant', count: statusCounts.dormant },
  ];

  return (
    <div>
      {/* Top-level page tabs -- matches ClientManagement / Jobs Dashboard */}
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

      {mainTab === 2 && (
        <FailedCheckoutsTab />
      )}

      {mainTab === 3 && (
        <Suspense fallback={<div className="flex justify-center p-12"><CircularProgress /></div>}>
          <TutorRetention />
        </Suspense>
      )}

      {mainTab === 1 && (
        <>
          {renderAnalyticsTab()}
          {renderMetricDetailModal()}
        </>
      )}

      {mainTab === 0 && (
        <div className="px-4 sm:px-6 lg:px-8 pt-4">
          {/* Status filter sub-tabs -- matches ClientManagement status tabs */}
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
                  placeholder="Search tutors..."
                  value={searchTerm}
                  onChange={(e) => { setSearchTerm(e.target.value); setPage(0); }}
                  className="w-full pl-8 pr-3 py-1.5 text-sm border border-neutral-300 rounded-md focus:outline-none focus:ring-2 focus:ring-primary-500 focus:border-primary-500"
                />
              </div>

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
                {sortedTutors.length.toLocaleString()} results
              </span>
            </div>

            {/* Error alert */}
            {error && (
              <div className="px-4 pb-3">
                <Alert severity="error" onClose={() => setError(null)}>
                  {error}
                </Alert>
              </div>
            )}

            {/* Tutors Table */}
            <div className="overflow-x-auto">
              <table className="w-full text-left table-fixed">
                <thead>
                  <tr className="border-t border-b border-neutral-200 bg-neutral-50/50">
                    {tutorColumns.filter(col => visibleColumns[col.key]).map((col) => {
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
                  </tr>
                </thead>
                <tbody>
                  {paginatedTutors.length > 0 ? (
                    paginatedTutors.map(renderTutorRow)
                  ) : (
                    <tr>
                      <td colSpan={Object.values(visibleColumns).filter(Boolean).length} className="px-3 py-12 text-center text-sm text-neutral-500">
                        {loading ? 'Loading tutors...' : 'No tutors found'}
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>

            {/* Pagination */}
            <div className="flex flex-wrap items-center justify-between px-4 py-3 border-t border-neutral-200">
              <span className="text-sm text-neutral-500">
                Showing {sortedTutors.length === 0 ? 0 : page * rowsPerPage + 1}--{Math.min((page + 1) * rowsPerPage, sortedTutors.length)} of {sortedTutors.length.toLocaleString()}
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
                  const totalPages = Math.ceil(sortedTutors.length / rowsPerPage);
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
                {tutorColumns.map((col) => (
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

          {renderTutorDetails()}
          {renderMetricDetailModal()}
        </div>
      )}
    </div>
  );
};

export default TutorManagement;
