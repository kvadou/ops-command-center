import React, { useState, useEffect } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import axios from 'axios';
import { useToast } from '../hooks/useToast';
import KpiCard from './ui/KpiCard';
import { formatCurrency, formatDate } from '../utils/formatters';
import {
  Box,
  Card,
  CardContent,
  Typography,
  Button,
  Chip,
  Tabs,
  Tab,
  Grid,
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TableRow,
  Paper,
  CircularProgress,
  Alert,
  IconButton,
  Tooltip,
  Link as MuiLink,
  TextField,
  MenuItem,
  Select,
  FormControl,
  InputLabel,
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions,
  Checkbox,
  FormControlLabel,
  Divider,
  Stack,
  Badge,
} from '@mui/material';
import {
  AcademicCapIcon,
  CurrencyDollarIcon,
  DocumentTextIcon,
  ExclamationTriangleIcon,
  ExclamationCircleIcon,
  PaperAirplaneIcon,
  CalendarDaysIcon,
  ArrowTrendingUpIcon,
  MagnifyingGlassIcon,
  ArrowPathIcon,
  ArrowTopRightOnSquareIcon,
  XMarkIcon,
  ChevronDownIcon,
  FunnelIcon,
  EnvelopeIcon,
  PhoneIcon,
  MapPinIcon,
  Squares2X2Icon,
  ListBulletIcon,
} from '@heroicons/react/24/outline';
import { CheckCircleIcon as CheckCircleSolidIcon } from '@heroicons/react/24/solid';
import {
  PieChart,
  Pie,
  Cell,
  ResponsiveContainer,
  Tooltip as RechartsTooltip,
  Legend,
} from 'recharts';

export default function InvoiceFulfillmentTracker() {
  const navigate = useNavigate();
  const location = useLocation();
  const toast = useToast();
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [selectedMonth, setSelectedMonth] = useState(null); // null = show all outstanding invoices
  const [selectedTerm, setSelectedTerm] = useState('');
  const [searchQuery, setSearchQuery] = useState('');
  const [activeTab, setActiveTab] = useState(0); // 0 = Overview, 1 = Schools
  
  // Get clientId from navigation state if available
  const initialClientId = location.state?.clientId || null;
  const [reminderDialogOpen, setReminderDialogOpen] = useState(false);
  const [selectedInvoice, setSelectedInvoice] = useState(null);
  const [reminderType, setReminderType] = useState('first');
  const [reminderMessage, setReminderMessage] = useState('');
  const [reminderNotes, setReminderNotes] = useState('');
  const [detailModalOpen, setDetailModalOpen] = useState(false);
  const [detailModalType, setDetailModalType] = useState(null);
  const [detailModalData, setDetailModalData] = useState([]);
  const [sortConfig, setSortConfig] = useState({ key: null, direction: 'asc' });
  const [statusFilter, setStatusFilter] = useState('all'); // 'all', 'outstanding', 'fulfilled', 'no-invoices'

  // Brand colors
  const brandColors = {
    green: '#34B256',
    pink: '#DA2E72',
    orange: '#F79A30',
    purple: '#6A469D',
    navy: '#2D2F8E',
    cyan: '#50C8DF',
    yellow: '#FACC29',
    light: '#E8FBFF',
  };

  useEffect(() => {
    fetchData();
  }, [selectedMonth, selectedTerm, initialClientId]);

  const fetchData = async () => {
    try {
      setLoading(true);
      setError(null);
      const axiosInstance = axios.create({
        withCredentials: true
      });

      const params = new URLSearchParams();
      // Only add month parameter if a specific month is selected (not showing all)
      if (selectedMonth && selectedMonth !== 'all') {
        params.append('month', selectedMonth);
      }
      if (selectedTerm) params.append('term', selectedTerm);
      if (initialClientId) params.append('clientId', initialClientId);

      const response = await axiosInstance.get(
        `/api/school-invoice-fulfillment/fulfillment?${params}`
      );
      setData(response.data);
      
      // If we have an initial clientId, filter to that school
      if (initialClientId && response.data?.schools) {
        const school = response.data.schools.find(s => s.clientId === initialClientId);
        if (school) {
          setSearchQuery(school.name);
        }
      }
    } catch (err) {
      console.error('Error fetching invoice fulfillment data:', err);
      
      // Handle 401 Unauthorized (expired token)
      if (err.response?.status === 401) {
        // Clear auth state and redirect to login
        localStorage.removeItem('token');
        localStorage.removeItem('user');
        const currentPath = window.location.pathname;
        if (!currentPath.includes('/login') && 
            !currentPath.includes('/forgot-password') && 
            !currentPath.includes('/reset-password')) {
          window.location.href = '/login';
          return;
        }
      }
      
      setError(err.response?.data?.error || 'Failed to fetch invoice fulfillment data');
    } finally {
      setLoading(false);
    }
  };



  const handleSummaryCardClick = (type) => {
    if (!data) return;

    let modalData = [];

    if (type === 'outstanding') {
      data.schools.forEach(school => {
        if (school.invoices && school.invoices.length > 0) {
          school.invoices
            .filter(inv => inv.status === 'unpaid' && inv.amount_outstanding > 0)
            .forEach(invoice => {
              modalData.push({
                schoolName: school.name,
                schoolEmail: school.email,
                schoolLocation: school.location,
                invoiceId: invoice.invoice_id,
                displayId: invoice.display_id,
                amount: invoice.amount,
                amountOutstanding: invoice.amount_outstanding,
                dateSent: invoice.date_sent,
                daysOutstanding: invoice.days_outstanding,
                fulfillmentStatus: invoice.fulfillment_status,
                reminderCount: invoice.reminder_count,
                lastReminderSentAt: invoice.last_reminder_sent_at,
                tutorcruncherUrl: invoice.tutorcruncher_url,
                termSeason: invoice.term_season,
                billingMonth: invoice.billing_month,
              });
            });
        }
      });
      modalData.sort((a, b) => b.amountOutstanding - a.amountOutstanding);
    } else if (type === 'collected') {
      data.schools.forEach(school => {
        if (school.invoices && school.invoices.length > 0) {
          school.invoices
            .filter(inv => inv.status === 'paid' && inv.amount_collected > 0)
            .forEach(invoice => {
              modalData.push({
                schoolName: school.name,
                schoolEmail: school.email,
                schoolLocation: school.location,
                invoiceId: invoice.invoice_id,
                displayId: invoice.display_id,
                amount: invoice.amount,
                amountCollected: invoice.amount_collected,
                dateSent: invoice.date_sent,
                tutorcruncherUrl: invoice.tutorcruncher_url,
                termSeason: invoice.term_season,
              });
            });
        }
      });
      modalData.sort((a, b) => {
        const dateA = a.dateSent ? new Date(a.dateSent) : new Date(0);
        const dateB = b.dateSent ? new Date(b.dateSent) : new Date(0);
        return dateB - dateA;
      });
    } else if (type === 'pending') {
      data.schools.forEach(school => {
        if (school.invoices && school.invoices.length > 0) {
          school.invoices
            .filter(inv => inv.status === 'payment-pending' && inv.amount > 0)
            .forEach(invoice => {
              modalData.push({
                schoolName: school.name,
                schoolEmail: school.email,
                schoolLocation: school.location,
                invoiceId: invoice.invoice_id,
                displayId: invoice.display_id,
                amount: invoice.amount,
                amountPending: invoice.amount,
                dateSent: invoice.date_sent,
                tutorcruncherUrl: invoice.tutorcruncher_url,
                termSeason: invoice.term_season,
                billingMonth: invoice.billing_month,
              });
            });
        }
      });
      modalData.sort((a, b) => {
        const dateA = a.dateSent ? new Date(a.dateSent) : new Date(0);
        const dateB = b.dateSent ? new Date(b.dateSent) : new Date(0);
        return dateB - dateA;
      });
    } else if (type === 'invoiced') {
      data.schools.forEach(school => {
        if (school.invoices && school.invoices.length > 0) {
          school.invoices.forEach(invoice => {
            modalData.push({
              schoolName: school.name,
              schoolEmail: school.email,
              schoolLocation: school.location,
              invoiceId: invoice.invoice_id,
              displayId: invoice.display_id,
              amount: invoice.amount,
              amountCollected: invoice.amount_collected || 0,
              amountOutstanding: invoice.amount_outstanding || 0,
              dateSent: invoice.date_sent,
              status: invoice.status,
              tutorcruncherUrl: invoice.tutorcruncher_url,
              termSeason: invoice.term_season,
            });
          });
        }
      });
      modalData.sort((a, b) => {
        const dateA = a.dateSent ? new Date(a.dateSent) : new Date(0);
        const dateB = b.dateSent ? new Date(b.dateSent) : new Date(0);
        return dateB - dateA;
      });
    }

    setDetailModalData(modalData);
    setDetailModalType(type);
    setDetailModalOpen(true);
    setSortConfig({ key: null, direction: 'asc' });
  };

  const handleSort = (key) => {
    let direction = 'asc';
    if (sortConfig.key === key && sortConfig.direction === 'asc') {
      direction = 'desc';
    }

    const sortedData = [...detailModalData].sort((a, b) => {
      let aVal, bVal;

      switch (key) {
        case 'schoolName':
          aVal = (a.schoolName || a.name || '').toLowerCase();
          bVal = (b.schoolName || b.name || '').toLowerCase();
          return direction === 'asc' 
            ? aVal.localeCompare(bVal)
            : bVal.localeCompare(aVal);

        case 'location':
          aVal = (a.location || a.schoolLabel?.replace('School - ', '') || '').toLowerCase();
          bVal = (b.location || b.schoolLabel?.replace('School - ', '') || '').toLowerCase();
          return direction === 'asc' 
            ? aVal.localeCompare(bVal)
            : bVal.localeCompare(aVal);

        case 'pendingAmount':
          aVal = parseFloat(a.amountPending || a.invoiceSummary?.totalPending || 0);
          bVal = parseFloat(b.amountPending || b.invoiceSummary?.totalPending || 0);
          return direction === 'asc' ? aVal - bVal : bVal - aVal;

        case 'totalInvoiced':
          aVal = parseFloat(a.invoiceSummary?.totalInvoiced || 0);
          bVal = parseFloat(b.invoiceSummary?.totalInvoiced || 0);
          return direction === 'asc' ? aVal - bVal : bVal - aVal;

        case 'invoiceId':
          aVal = parseInt(a.invoiceId) || 0;
          bVal = parseInt(b.invoiceId) || 0;
          return direction === 'asc' ? aVal - bVal : bVal - aVal;

        case 'amount':
          aVal = parseFloat(a.amount) || 0;
          bVal = parseFloat(b.amount) || 0;
          return direction === 'asc' ? aVal - bVal : bVal - aVal;

        case 'amountOutstanding':
          aVal = parseFloat(a.amountOutstanding) || 0;
          bVal = parseFloat(b.amountOutstanding) || 0;
          return direction === 'asc' ? aVal - bVal : bVal - aVal;

        case 'amountCollected':
          aVal = parseFloat(a.amountCollected) || 0;
          bVal = parseFloat(b.amountCollected) || 0;
          return direction === 'asc' ? aVal - bVal : bVal - aVal;

        case 'reminderCount':
          aVal = parseInt(a.reminderCount) || 0;
          bVal = parseInt(b.reminderCount) || 0;
          return direction === 'asc' ? aVal - bVal : bVal - aVal;

        case 'daysOutstanding':
          aVal = parseFloat(a.daysOutstanding) || 0;
          bVal = parseFloat(b.daysOutstanding) || 0;
          return direction === 'asc' ? aVal - bVal : bVal - aVal;

        case 'termSeason':
          aVal = (a.termSeason || '').toLowerCase();
          bVal = (b.termSeason || '').toLowerCase();
          return direction === 'asc'
            ? aVal.localeCompare(bVal)
            : bVal.localeCompare(aVal);

        case 'dateSent':
          aVal = a.dateSent ? new Date(a.dateSent).getTime() : 0;
          bVal = b.dateSent ? new Date(b.dateSent).getTime() : 0;
          return direction === 'asc' ? aVal - bVal : bVal - aVal;

        default:
          return 0;
      }
    });

    setDetailModalData(sortedData);
    setSortConfig({ key, direction });
  };

  const getSortIcon = (columnKey) => {
    if (sortConfig.key !== columnKey) {
      return null;
    }
    return sortConfig.direction === 'asc' ? '↑' : '↓';
  };

  const getMonthName = (monthString) => {
    if (!monthString) return '';
    const [year, month] = monthString.split('-');
    const date = new Date(parseInt(year), parseInt(month) - 1, 1);
    return date.toLocaleDateString('en-US', { month: 'long', year: 'numeric' });
  };

  const generateMonths = () => {
    const months = [];
    const now = new Date();
    for (let i = 0; i < 24; i++) {
      const date = new Date(now.getFullYear(), now.getMonth() - i, 1);
      const value = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}`;
      const label = date.toLocaleDateString('en-US', { month: 'long', year: 'numeric' });
      months.push({ value, label });
    }
    return months;
  };

  const handleSendReminder = async () => {
    if (!selectedInvoice) return;

    try {
      const axiosInstance = axios.create({
        withCredentials: true
      });

      const response = await axiosInstance.post(
        `/api/school-invoice-fulfillment/invoice/${selectedInvoice.invoice_id}/send-reminder`,
        {
          reminder_type: reminderType,
          reminder_method: 'email',
          reminder_message: reminderMessage,
          reminder_notes: reminderNotes,
          send_via_tutorcruncher: true,
        }
      );

      await fetchData();
      
      if (detailModalOpen && detailModalType) {
        handleSummaryCardClick(detailModalType);
      }

      setReminderDialogOpen(false);
      setSelectedInvoice(null);
      setReminderMessage('');
      setReminderNotes('');
      
      toast.success('Reminder sent successfully!');
    } catch (err) {
      console.error('Error sending reminder:', err);
      setError(err.response?.data?.error || 'Failed to send reminder');
      toast.error(err.response?.data?.error || 'Failed to send reminder');
    }
  };

  const handleSyncReminders = async (invoiceId) => {
    try {
      const axiosInstance = axios.create({
        withCredentials: true
      });

      await axiosInstance.post(`/api/school-invoice-fulfillment/invoice/${invoiceId}/sync-reminders`);
      
      await fetchData();
      
      if (detailModalOpen && detailModalType) {
        handleSummaryCardClick(detailModalType);
      }
    } catch (err) {
      console.error('Error syncing reminders:', err);
      toast.error(`Error syncing reminders: ${err.response?.data?.error || err.message}`);
    }
  };

  // Filter schools based on search and status
  const filteredSchools = (data?.schools || []).filter(school => {
    // Search filter
    if (searchQuery) {
      const query = searchQuery.toLowerCase();
      const matchesSearch = (
        school.name.toLowerCase().includes(query) ||
        school.email?.toLowerCase().includes(query) ||
        school.clientId?.toLowerCase().includes(query)
      );
      if (!matchesSearch) return false;
    }

    // Status filter
    if (statusFilter === 'outstanding') {
      return school.invoiceSummary.totalOutstanding > 0;
    } else if (statusFilter === 'fulfilled') {
      return school.invoiceSummary.totalOutstanding === 0 && school.invoiceSummary.totalInvoiced > 0;
    } else if (statusFilter === 'no-invoices') {
      return school.invoiceSummary.totalInvoiced === 0;
    }

    return true;
  });

  // Group schools by status for better organization
  const outstandingSchools = filteredSchools.filter(s => s.invoiceSummary.totalOutstanding > 0);
  const pendingSchools = filteredSchools.filter(s => s.invoiceSummary.totalPending > 0);
  const fulfilledSchools = filteredSchools.filter(s => s.invoiceSummary.totalOutstanding === 0 && s.invoiceSummary.totalInvoiced > 0);
  const noInvoiceSchools = filteredSchools.filter(s => s.invoiceSummary.totalInvoiced === 0);

  // Prepare pie chart data
  const pieChartData = data ? [
    { name: 'Collected', value: data.summary.totalCollected, color: brandColors.green },
    { name: 'Pending', value: data.summary.totalPending || 0, color: brandColors.yellow },
    { name: 'Within Terms', value: data.summary.totalWithinTerms || 0, color: brandColors.orange },
    { name: 'Past Due', value: data.summary.totalOutstanding, color: '#DC2626' },
  ].filter(item => item.value > 0) : [];

  const COLORS = [brandColors.green, brandColors.yellow, brandColors.orange, '#DC2626'];

  if (loading) {
    return (
      <Box display="flex" justifyContent="center" alignItems="center" minHeight="400px">
        <CircularProgress sx={{ color: brandColors.purple }} />
      </Box>
    );
  }

  if (error && !data) {
    return (
      <Box>
        <Alert severity="error">{error}</Alert>
      </Box>
    );
  }

  return (
    <Box>
      {/* Quick Filters */}
      <Card sx={{ bgcolor: 'background.paper', boxShadow: 1 }}>
          <CardContent>
            <Grid container spacing={2} alignItems="center">
              <Grid item xs={12} sm={6} md={3}>
                <FormControl fullWidth size="small">
                  <InputLabel>Month</InputLabel>
                  <Select
                    value={selectedMonth || 'all'}
                    onChange={(e) => setSelectedMonth(e.target.value === 'all' ? null : e.target.value)}
                    label="Month"
                  >
                    <MenuItem value="all">All Outstanding Invoices</MenuItem>
                    {generateMonths().map(month => (
                      <MenuItem key={month.value} value={month.value}>
                        {month.label}
                      </MenuItem>
                    ))}
                  </Select>
                </FormControl>
              </Grid>
              <Grid item xs={12} sm={6} md={3}>
                <TextField
                  fullWidth
                  size="small"
                  label="Search Schools"
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  InputProps={{
                    startAdornment: <MagnifyingGlassIcon className="h-5 w-5 mr-2 text-gray-500" />,
                  }}
                  placeholder="School name, email..."
                />
              </Grid>
              <Grid item xs={12} sm={6} md={3}>
                <TextField
                  fullWidth
                  size="small"
                  label="Filter by Term"
                  value={selectedTerm}
                  onChange={(e) => setSelectedTerm(e.target.value)}
                  placeholder="e.g., Fall 2025"
                />
              </Grid>
              <Grid item xs={12} sm={6} md={3}>
                <FormControl fullWidth size="small">
                  <InputLabel>Status</InputLabel>
                  <Select
                    value={statusFilter}
                    onChange={(e) => setStatusFilter(e.target.value)}
                    label="Status"
                  >
                    <MenuItem value="all">All Schools</MenuItem>
                    <MenuItem value="outstanding">Outstanding Only</MenuItem>
                    <MenuItem value="fulfilled">Fulfilled Only</MenuItem>
                    <MenuItem value="no-invoices">No Invoices</MenuItem>
                  </Select>
                </FormControl>
              </Grid>
            </Grid>
          </CardContent>
        </Card>

      {/* Summary Cards - Using KpiCard */}
      <Grid container spacing={2} sx={{ mt: 3, mb: 3 }}>
        <Grid item xs={12} sm={6} md={3}>
          <KpiCard
            title="Total Invoiced"
            value={formatCurrency(data?.summary.totalInvoiced || 0)}
            subtitle={`${data?.summary.totalSchools || 0} schools`}
            tone="default"
            onClick={() => handleSummaryCardClick('invoiced')}
            modalIcon={<ArrowTopRightOnSquareIcon className="h-4 w-4" />}
          />
        </Grid>
        <Grid item xs={12} sm={6} md={3}>
          <KpiCard
            title="Total Collected"
            value={formatCurrency(data?.summary.totalCollected || 0)}
            subtitle={data?.summary.totalInvoiced > 0
              ? `${((data.summary.totalCollected / data.summary.totalInvoiced) * 100).toFixed(1)}% collected`
              : '0% collected'}
            tone="success"
            onClick={() => handleSummaryCardClick('collected')}
            modalIcon={<ArrowTopRightOnSquareIcon className="h-4 w-4" />}
          />
        </Grid>
        <Grid item xs={12} sm={6} md={3}>
          <KpiCard
            title="Total Pending"
            value={formatCurrency(data?.summary.totalPending || 0)}
            subtitle={data?.summary.totalInvoiced > 0
              ? `${((data.summary.totalPending / data.summary.totalInvoiced) * 100).toFixed(1)}% pending`
              : '0% pending'}
            tone="warning"
            onClick={() => handleSummaryCardClick('pending')}
            modalIcon={<ArrowTopRightOnSquareIcon className="h-4 w-4" />}
          />
        </Grid>
        <Grid item xs={12} sm={6} md={3}>
          <KpiCard
            title="Past Due (30+ days)"
            value={formatCurrency(data?.summary.totalOutstanding || 0)}
            subtitle={data?.summary.totalWithinTerms > 0
              ? `${formatCurrency(data.summary.totalWithinTerms)} within terms`
              : 'No invoices within terms'}
            tone="danger"
            onClick={() => handleSummaryCardClick('outstanding')}
            modalIcon={<ArrowTopRightOnSquareIcon className="h-4 w-4" />}
          />
        </Grid>
      </Grid>

      {/* Tabbed Interface */}
      <Card sx={{ mb: 3 }}>
        <Box sx={{ borderBottom: 1, borderColor: 'divider' }}>
          <Tabs value={activeTab} onChange={(e, newValue) => setActiveTab(newValue)}>
            <Tab icon={<Squares2X2Icon className="h-5 w-5" />} iconPosition="start" label="OVERVIEW" />
            <Tab icon={<ListBulletIcon className="h-5 w-5" />} iconPosition="start" label={`SCHOOLS (${filteredSchools.length})`} />
          </Tabs>
        </Box>

        {/* Overview Tab */}
        {activeTab === 0 && (
          <CardContent>
            <Grid container spacing={3}>
              {/* Pie Chart */}
              <Grid item xs={12} md={6}>
                <Box>
                  <Typography variant="h6" gutterBottom fontWeight="medium">
                    Collection Status
                  </Typography>
                  <Typography variant="body2" color="textSecondary" gutterBottom>
                    {selectedMonth ? getMonthName(selectedMonth) : 'All Outstanding Invoices'}
                  </Typography>
                  {pieChartData.length > 0 && (
                    <Box height={280} mt={2}>
                      <ResponsiveContainer width="100%" height="100%">
                        <PieChart>
                          <Pie
                            data={pieChartData}
                            cx="50%"
                            cy="50%"
                            labelLine={false}
                            label={({ name, percent }) => `${name}: ${(percent * 100).toFixed(1)}%`}
                            outerRadius={90}
                            fill={brandColors.purple}
                            dataKey="value"
                          >
                            {pieChartData.map((entry, index) => (
                              <Cell key={`cell-${index}`} fill={COLORS[index % COLORS.length]} />
                            ))}
                          </Pie>
                          <RechartsTooltip formatter={(value) => formatCurrency(value)} />
                          <Legend />
                        </PieChart>
                      </ResponsiveContainer>
                    </Box>
                  )}
                </Box>
              </Grid>

              {/* Quick Stats */}
              <Grid item xs={12} md={6}>
                <Box>
                  <Typography variant="h6" gutterBottom fontWeight="medium">
                    Quick Stats
                  </Typography>
                  <Stack spacing={2} mt={2}>
                    <Card 
                      variant="outlined" 
                      sx={{ 
                        p: 2, 
                        cursor: 'pointer',
                        transition: 'all 0.2s',
                        '&:hover': {
                          boxShadow: 2,
                          borderColor: brandColors.pink,
                        }
                      }}
                      onClick={() => {
                        setDetailModalType('outstanding');
                        setDetailModalData(outstandingSchools);
                        setDetailModalOpen(true);
                      }}
                    >
                      <Box display="flex" alignItems="center" justifyContent="space-between">
                        <Box>
                          <Typography variant="body2" color="textSecondary">
                            Schools Past Due (30+ days)
                          </Typography>
                          <Typography variant="h5" fontWeight="bold" sx={{ color: brandColors.pink }}>
                            {outstandingSchools.length}
                          </Typography>
                        </Box>
                        <ExclamationTriangleIcon className="h-10 w-10 opacity-30" style={{ color: brandColors.pink }} />
                      </Box>
                    </Card>
                    <Card 
                      variant="outlined" 
                      sx={{ 
                        p: 2, 
                        cursor: 'pointer',
                        transition: 'all 0.2s',
                        '&:hover': {
                          boxShadow: 2,
                          borderColor: brandColors.orange,
                        }
                      }}
                      onClick={() => {
                        const pendingInvoices = [];
                        pendingSchools.forEach(school => {
                          if (school.invoices && Array.isArray(school.invoices)) {
                            school.invoices
                              .filter(inv => inv.status === 'payment-pending')
                              .forEach(invoice => {
                                pendingInvoices.push({
                                  schoolName: school.name,
                                  schoolLocation: school.location,
                                  invoiceId: invoice.invoice_id,
                                  displayId: invoice.display_id,
                                  amount: invoice.amount,
                                  amountPending: invoice.amount,
                                  dateSent: invoice.date_sent,
                                  tutorcruncherUrl: invoice.tutorcruncher_url || `https://account.acmeops.com/accounting/invoices/${invoice.invoice_id}/`,
                                  termSeason: invoice.term_season || 'N/A',
                                  clientId: school.clientId,
                                });
                              });
                          }
                        });
                        setDetailModalType('pending');
                        setDetailModalData(pendingInvoices);
                        setDetailModalOpen(true);
                      }}
                    >
                      <Box display="flex" alignItems="center" justifyContent="space-between">
                        <Box>
                          <Typography variant="body2" color="textSecondary">
                            Schools with Pending Payments
                          </Typography>
                          <Typography variant="h5" fontWeight="bold" sx={{ color: brandColors.orange }}>
                            {pendingSchools.length}
                          </Typography>
                        </Box>
                        <DocumentTextIcon className="h-10 w-10 opacity-30" style={{ color: brandColors.orange }} />
                      </Box>
                    </Card>
                    <Card 
                      variant="outlined" 
                      sx={{ 
                        p: 2, 
                        cursor: 'pointer',
                        transition: 'all 0.2s',
                        '&:hover': {
                          boxShadow: 2,
                          borderColor: brandColors.green,
                        }
                      }}
                      onClick={() => {
                        setDetailModalType('fulfilled');
                        setDetailModalData(fulfilledSchools);
                        setDetailModalOpen(true);
                      }}
                    >
                      <Box display="flex" alignItems="center" justifyContent="space-between">
                        <Box>
                          <Typography variant="body2" color="textSecondary">
                            Schools Fully Paid
                          </Typography>
                          <Typography variant="h5" fontWeight="bold" sx={{ color: brandColors.green }}>
                            {fulfilledSchools.length}
                          </Typography>
                        </Box>
                        <CheckCircleSolidIcon className="h-10 w-10 opacity-30" style={{ color: brandColors.green }} />
                      </Box>
                    </Card>
                    <Card 
                      variant="outlined" 
                      sx={{ 
                        p: 2, 
                        cursor: 'pointer',
                        transition: 'all 0.2s',
                        '&:hover': {
                          boxShadow: 2,
                          borderColor: brandColors.purple,
                        }
                      }}
                      onClick={() => {
                        setDetailModalType('no-invoices');
                        setDetailModalData(noInvoiceSchools);
                        setDetailModalOpen(true);
                      }}
                    >
                      <Box display="flex" alignItems="center" justifyContent="space-between">
                        <Box>
                          <Typography variant="body2" color="textSecondary">
                            Schools with No Invoices
                          </Typography>
                          <Typography variant="h5" fontWeight="bold">
                            {noInvoiceSchools.length}
                          </Typography>
                        </Box>
                        <AcademicCapIcon className="h-10 w-10 text-gray-500 opacity-30" />
                      </Box>
                    </Card>
                  </Stack>
                </Box>
              </Grid>
            </Grid>
          </CardContent>
        )}

        {/* Schools Tab */}
        {activeTab === 1 && (
          <CardContent>
            {filteredSchools.length === 0 ? (
              <Alert severity="info">No schools found matching your filters.</Alert>
            ) : (
              <Box>
                {/* Outstanding Schools Section */}
                {outstandingSchools.length > 0 && (
                  <Box mb={4}>
                    <Box display="flex" alignItems="center" gap={1} mb={2}>
                      <ExclamationTriangleIcon className="h-5 w-5" style={{ color: brandColors.pink }} />
                      <Typography variant="h6" fontWeight="bold" sx={{ color: brandColors.pink }}>
                        Past Due - 30+ Days ({outstandingSchools.length})
                      </Typography>
                    </Box>
                    <Grid container spacing={2}>
                      {outstandingSchools.map((school) => (
                        <Grid item xs={12} key={school.clientId}>
                          <SchoolCard
                            school={school}
                            onSendReminder={(invoice) => {
                              setSelectedInvoice(invoice);
                              setReminderDialogOpen(true);
                            }}
                            onSyncReminders={handleSyncReminders}
                            onViewDetails={() => navigate(`/school-dashboard/school/${school.clientId}`)}
                            brandColors={brandColors}
                            formatCurrency={formatCurrency}
                            formatDate={formatDate}
                          />
                        </Grid>
                      ))}
                    </Grid>
                  </Box>
                )}

                {/* Fulfilled Schools Section */}
                {fulfilledSchools.length > 0 && (
                  <Box mb={4}>
                    <Box display="flex" alignItems="center" gap={1} mb={2}>
                      <CheckCircleSolidIcon className="h-5 w-5" style={{ color: brandColors.green }} />
                      <Typography variant="h6" fontWeight="bold" sx={{ color: brandColors.green }}>
                        Fully Paid ({fulfilledSchools.length})
                      </Typography>
                    </Box>
                    <Grid container spacing={2}>
                      {fulfilledSchools.map((school) => (
                        <Grid item xs={12} key={school.clientId}>
                          <SchoolCard
                            school={school}
                            onSendReminder={(invoice) => {
                              setSelectedInvoice(invoice);
                              setReminderDialogOpen(true);
                            }}
                            onSyncReminders={handleSyncReminders}
                            onViewDetails={() => navigate(`/school-dashboard/school/${school.clientId}`)}
                            brandColors={brandColors}
                            formatCurrency={formatCurrency}
                            formatDate={formatDate}
                          />
                        </Grid>
                      ))}
                    </Grid>
                  </Box>
                )}

                {/* No Invoice Schools Section */}
                {noInvoiceSchools.length > 0 && (
                  <Box>
                    <Box display="flex" alignItems="center" gap={1} mb={2}>
                      <AcademicCapIcon className="h-5 w-5 text-gray-500" />
                      <Typography variant="h6" fontWeight="bold">
                        No Invoices ({noInvoiceSchools.length})
                      </Typography>
                    </Box>
                    <Grid container spacing={2}>
                      {noInvoiceSchools.map((school) => (
                        <Grid item xs={12} sm={6} md={4} key={school.clientId}>
                          <Card variant="outlined" sx={{ p: 2 }}>
                            <Box display="flex" alignItems="center" justifyContent="space-between">
                              <Box>
                                <Typography variant="body1" fontWeight="medium">
                                  {school.name}
                                </Typography>
                                <Typography variant="caption" color="textSecondary">
                                  {school.email || 'No email'}
                                </Typography>
                              </Box>
                              <IconButton
                                size="small"
                                onClick={() => navigate(`/school-dashboard/school/${school.clientId}`)}
                              >
                                <ArrowTopRightOnSquareIcon className="h-4 w-4" />
                              </IconButton>
                            </Box>
                          </Card>
                        </Grid>
                      ))}
                    </Grid>
                  </Box>
                )}
              </Box>
            )}
          </CardContent>
        )}
      </Card>

      {/* Detail Modal */}
      <Dialog 
        open={detailModalOpen} 
        onClose={() => setDetailModalOpen(false)} 
        maxWidth="lg" 
        fullWidth
      >
        <DialogTitle>
          <Box display="flex" justifyContent="space-between" alignItems="center">
            <Box>
              <Typography variant="h5">
                {detailModalType === 'outstanding' && 'Past Due Invoices (30+ days)'}
                {detailModalType === 'pending' && 'Pending Payments'}
                {detailModalType === 'fulfilled' && 'Fully Paid Schools'}
                {detailModalType === 'no-invoices' && 'Schools with No Invoices'}
                {detailModalType === 'collected' && 'Payment Collection Details'}
                {detailModalType === 'invoiced' && 'All Invoice Details'}
              </Typography>
              {detailModalType === 'invoiced' && (
                <Typography variant="body2" sx={{ mt: 1, color: 'text.secondary', fontSize: '0.875rem' }}>
                  <strong>Total Invoiced:</strong> Sum of all invoice amounts sent to schools (excluding cancelled, voided, or refunded invoices). 
                  Includes invoices for future lessons and lessons not yet completed. This represents what has been billed, not necessarily what has been earned.
                </Typography>
              )}
              {detailModalType === 'collected' && (
                <Typography variant="body2" sx={{ mt: 1, color: 'text.secondary', fontSize: '0.875rem' }}>
                  <strong>Total Collected:</strong> Sum of all invoices with status "paid". This includes all paid invoices across all schools 
                  (unless filtered by month/term). This represents actual payments received.
                </Typography>
              )}
              {detailModalType === 'pending' && (
                <Typography variant="body2" sx={{ mt: 1, color: 'text.secondary', fontSize: '0.875rem' }}>
                  <strong>Total Pending:</strong> Sum of all invoices with status "payment-pending". These are invoices that have been sent 
                  but payment is still being processed or is in a pending state.
                </Typography>
              )}
              {detailModalType === 'outstanding' && (
                <Typography variant="body2" sx={{ mt: 1, color: 'text.secondary', fontSize: '0.875rem' }}>
                  <strong>Past Due:</strong> Unpaid invoices that are 30+ days past the sent date. Schools have 30-day payment terms,
                  so only invoices beyond that window are counted as past due.
                </Typography>
              )}
            </Box>
            <IconButton onClick={() => setDetailModalOpen(false)} size="small">
              <XMarkIcon className="h-5 w-5" />
            </IconButton>
          </Box>
        </DialogTitle>
        <DialogContent>
          {detailModalData.length === 0 ? (
            <Alert severity="info">No data available for this selection.</Alert>
          ) : (
            <TableContainer component={Paper} variant="outlined" sx={{ mt: 2 }}>
              <Table size="small">
                <TableHead>
                  <TableRow>
                    <TableCell>
                      <Box
                        display="flex"
                        alignItems="center"
                        gap={0.5}
                        sx={{ cursor: 'pointer', userSelect: 'none' }}
                        onClick={() => handleSort('schoolName')}
                      >
                        <strong>School Name</strong>
                        {getSortIcon('schoolName') && (
                          <Typography variant="caption" sx={{ color: brandColors.purple }}>
                            {getSortIcon('schoolName')}
                          </Typography>
                        )}
                      </Box>
                    </TableCell>
                    {(detailModalType === 'outstanding' || detailModalType === 'collected' || detailModalType === 'invoiced') && (
                      <>
                        <TableCell>
                          <Box
                            display="flex"
                            alignItems="center"
                            gap={0.5}
                            sx={{ cursor: 'pointer', userSelect: 'none' }}
                            onClick={() => handleSort('invoiceId')}
                          >
                            <strong>Invoice ID</strong>
                            {getSortIcon('invoiceId') && (
                              <Typography variant="caption" sx={{ color: brandColors.purple }}>
                                {getSortIcon('invoiceId')}
                              </Typography>
                            )}
                          </Box>
                        </TableCell>
                        <TableCell>
                          <Box
                            display="flex"
                            alignItems="center"
                            gap={0.5}
                            sx={{ cursor: 'pointer', userSelect: 'none' }}
                            onClick={() => handleSort('amount')}
                          >
                            <strong>Amount</strong>
                            {getSortIcon('amount') && (
                              <Typography variant="caption" sx={{ color: brandColors.purple }}>
                                {getSortIcon('amount')}
                              </Typography>
                            )}
                          </Box>
                        </TableCell>
                      </>
                    )}
                    {detailModalType === 'pending' && (
                      <>
                        <TableCell>
                          <Box
                            display="flex"
                            alignItems="center"
                            gap={0.5}
                            sx={{ cursor: 'pointer', userSelect: 'none' }}
                            onClick={() => handleSort('invoiceId')}
                          >
                            <strong>Invoice ID</strong>
                            {getSortIcon('invoiceId') && (
                              <Typography variant="caption" sx={{ color: brandColors.purple }}>
                                {getSortIcon('invoiceId')}
                              </Typography>
                            )}
                          </Box>
                        </TableCell>
                        <TableCell>
                          <Box
                            display="flex"
                            alignItems="center"
                            gap={0.5}
                            sx={{ cursor: 'pointer', userSelect: 'none' }}
                            onClick={() => handleSort('amount')}
                          >
                            <strong>Amount</strong>
                            {getSortIcon('amount') && (
                              <Typography variant="caption" sx={{ color: brandColors.purple }}>
                                {getSortIcon('amount')}
                              </Typography>
                            )}
                          </Box>
                        </TableCell>
                        <TableCell>
                          <Box
                            display="flex"
                            alignItems="center"
                            gap={0.5}
                            sx={{ cursor: 'pointer', userSelect: 'none' }}
                            onClick={() => handleSort('location')}
                          >
                            <strong>Location</strong>
                            {getSortIcon('location') && (
                              <Typography variant="caption" sx={{ color: brandColors.purple }}>
                                {getSortIcon('location')}
                              </Typography>
                            )}
                          </Box>
                        </TableCell>
                      </>
                    )}
                    {(detailModalType === 'fulfilled' || detailModalType === 'no-invoices') && (
                      <TableCell>
                        <Box
                          display="flex"
                          alignItems="center"
                          gap={0.5}
                          sx={{ cursor: 'pointer', userSelect: 'none' }}
                          onClick={() => handleSort('location')}
                        >
                          <strong>Location</strong>
                          {getSortIcon('location') && (
                            <Typography variant="caption" sx={{ color: brandColors.purple }}>
                              {getSortIcon('location')}
                            </Typography>
                          )}
                        </Box>
                      </TableCell>
                    )}
                    {detailModalType === 'pending' && (
                      <TableCell align="right">
                        <Box
                          display="flex"
                          alignItems="center"
                          justifyContent="flex-end"
                          gap={0.5}
                          sx={{ cursor: 'pointer', userSelect: 'none' }}
                          onClick={() => handleSort('pendingAmount')}
                        >
                          <strong>Pending Amount</strong>
                          {getSortIcon('pendingAmount') && (
                            <Typography variant="caption" sx={{ color: brandColors.purple }}>
                              {getSortIcon('pendingAmount')}
                            </Typography>
                          )}
                        </Box>
                      </TableCell>
                    )}
                    {detailModalType === 'fulfilled' && (
                      <TableCell align="right">
                        <Box
                          display="flex"
                          alignItems="center"
                          justifyContent="flex-end"
                          gap={0.5}
                          sx={{ cursor: 'pointer', userSelect: 'none' }}
                          onClick={() => handleSort('totalInvoiced')}
                        >
                          <strong>Total Invoiced</strong>
                          {getSortIcon('totalInvoiced') && (
                            <Typography variant="caption" sx={{ color: brandColors.purple }}>
                              {getSortIcon('totalInvoiced')}
                            </Typography>
                          )}
                        </Box>
                      </TableCell>
                    )}
                    {detailModalType === 'outstanding' && (
                      <>
                        <TableCell align="right">
                          <Box
                            display="flex"
                            alignItems="center"
                            justifyContent="flex-end"
                            gap={0.5}
                            sx={{ cursor: 'pointer', userSelect: 'none' }}
                            onClick={() => handleSort('amountOutstanding')}
                          >
                            <strong>Outstanding</strong>
                            {getSortIcon('amountOutstanding') && (
                              <Typography variant="caption" sx={{ color: brandColors.purple }}>
                                {getSortIcon('amountOutstanding')}
                              </Typography>
                            )}
                          </Box>
                        </TableCell>
                        <TableCell align="right">
                          <Box
                            display="flex"
                            alignItems="center"
                            justifyContent="flex-end"
                            gap={0.5}
                            sx={{ cursor: 'pointer', userSelect: 'none' }}
                            onClick={() => handleSort('daysOutstanding')}
                          >
                            <strong>Days Outstanding</strong>
                            {getSortIcon('daysOutstanding') && (
                              <Typography variant="caption" sx={{ color: brandColors.purple }}>
                                {getSortIcon('daysOutstanding')}
                              </Typography>
                            )}
                          </Box>
                        </TableCell>
                        <TableCell>
                          <Box
                            display="flex"
                            alignItems="center"
                            gap={0.5}
                            sx={{ cursor: 'pointer', userSelect: 'none' }}
                            onClick={() => handleSort('reminderCount')}
                          >
                            <strong>Reminders</strong>
                            {getSortIcon('reminderCount') && (
                              <Typography variant="caption" sx={{ color: brandColors.purple }}>
                                {getSortIcon('reminderCount')}
                              </Typography>
                            )}
                          </Box>
                        </TableCell>
                      </>
                    )}
                    {detailModalType === 'collected' && (
                      <>
                        <TableCell align="right">
                          <Box
                            display="flex"
                            alignItems="center"
                            justifyContent="flex-end"
                            gap={0.5}
                            sx={{ cursor: 'pointer', userSelect: 'none' }}
                            onClick={() => handleSort('amountCollected')}
                          >
                            <strong>Collected</strong>
                            {getSortIcon('amountCollected') && (
                              <Typography variant="caption" sx={{ color: brandColors.purple }}>
                                {getSortIcon('amountCollected')}
                              </Typography>
                            )}
                          </Box>
                        </TableCell>
                        <TableCell>
                          <Box
                            display="flex"
                            alignItems="center"
                            gap={0.5}
                            sx={{ cursor: 'pointer', userSelect: 'none' }}
                            onClick={() => handleSort('dateSent')}
                          >
                            <strong>Payment Date</strong>
                            {getSortIcon('dateSent') && (
                              <Typography variant="caption" sx={{ color: brandColors.purple }}>
                                {getSortIcon('dateSent')}
                              </Typography>
                            )}
                          </Box>
                        </TableCell>
                      </>
                    )}
                    {detailModalType === 'invoiced' && (
                      <>
                        <TableCell align="right">
                          <Box
                            display="flex"
                            alignItems="center"
                            justifyContent="flex-end"
                            gap={0.5}
                            sx={{ cursor: 'pointer', userSelect: 'none' }}
                            onClick={() => handleSort('amountCollected')}
                          >
                            <strong>Collected</strong>
                            {getSortIcon('amountCollected') && (
                              <Typography variant="caption" sx={{ color: brandColors.purple }}>
                                {getSortIcon('amountCollected')}
                              </Typography>
                            )}
                          </Box>
                        </TableCell>
                        <TableCell align="right">
                          <Box
                            display="flex"
                            alignItems="center"
                            justifyContent="flex-end"
                            gap={0.5}
                            sx={{ cursor: 'pointer', userSelect: 'none' }}
                            onClick={() => handleSort('amountOutstanding')}
                          >
                            <strong>Outstanding</strong>
                            {getSortIcon('amountOutstanding') && (
                              <Typography variant="caption" sx={{ color: brandColors.purple }}>
                                {getSortIcon('amountOutstanding')}
                              </Typography>
                            )}
                          </Box>
                        </TableCell>
                        <TableCell><strong>Status</strong></TableCell>
                        <TableCell>
                          <Box
                            display="flex"
                            alignItems="center"
                            gap={0.5}
                            sx={{ cursor: 'pointer', userSelect: 'none' }}
                            onClick={() => handleSort('dateSent')}
                          >
                            <strong>Date Sent</strong>
                            {getSortIcon('dateSent') && (
                              <Typography variant="caption" sx={{ color: brandColors.purple }}>
                                {getSortIcon('dateSent')}
                              </Typography>
                            )}
                          </Box>
                        </TableCell>
                      </>
                    )}
                    <TableCell>
                      <Box
                        display="flex"
                        alignItems="center"
                        gap={0.5}
                        sx={{ cursor: 'pointer', userSelect: 'none' }}
                        onClick={() => handleSort('termSeason')}
                      >
                        <strong>Term/Season</strong>
                        {getSortIcon('termSeason') && (
                          <Typography variant="caption" sx={{ color: brandColors.purple }}>
                            {getSortIcon('termSeason')}
                          </Typography>
                        )}
                      </Box>
                    </TableCell>
                    <TableCell align="center"><strong>Link</strong></TableCell>
                  </TableRow>
                </TableHead>
                <TableBody>
                  {detailModalData.map((item, idx) => (
                    <TableRow key={idx} hover>
                      <TableCell>
                        <Box>
                          <Typography variant="body2" fontWeight="medium">
                            {item.schoolName || item.name}
                          </Typography>
                          {(detailModalType === 'pending' || detailModalType === 'fulfilled' || detailModalType === 'no-invoices') && (
                            <Typography variant="caption" color="textSecondary">
                              {item.email || 'No email'}
                            </Typography>
                          )}
                          {(detailModalType === 'outstanding' || detailModalType === 'collected' || detailModalType === 'invoiced') && (
                            <Typography variant="caption" color="textSecondary">
                              {item.schoolLocation || item.location}
                            </Typography>
                          )}
                        </Box>
                      </TableCell>
                      {(detailModalType === 'outstanding' || detailModalType === 'collected' || detailModalType === 'invoiced') && (
                        <>
                          <TableCell>
                            <MuiLink
                              href={item.tutorcruncherUrl}
                              target="_blank"
                              rel="noopener noreferrer"
                              sx={{
                                color: brandColors.purple,
                                textDecoration: 'none',
                                '&:hover': { textDecoration: 'underline' },
                              }}
                            >
                              {item.displayId || `INV-${item.invoiceId}`}
                            </MuiLink>
                          </TableCell>
                          <TableCell>
                            <Typography variant="body2" fontWeight="medium">
                              {formatCurrency(item.amount)}
                            </Typography>
                          </TableCell>
                        </>
                      )}
                      {detailModalType === 'pending' && (
                        <>
                          <TableCell>
                            <MuiLink
                              href={item.tutorcruncherUrl}
                              target="_blank"
                              rel="noopener noreferrer"
                              sx={{
                                color: brandColors.purple,
                                textDecoration: 'none',
                                '&:hover': { textDecoration: 'underline' },
                              }}
                            >
                              {item.displayId || `INV-${item.invoiceId}`}
                            </MuiLink>
                          </TableCell>
                          <TableCell>
                            <Typography variant="body2" fontWeight="medium">
                              {formatCurrency(item.amount || item.amountPending || 0)}
                            </Typography>
                          </TableCell>
                          <TableCell>
                            <Typography variant="body2" color="textSecondary">
                              {item.schoolLocation || item.location || 'N/A'}
                            </Typography>
                          </TableCell>
                          <TableCell align="right">
                            <Typography variant="body2" fontWeight="medium" sx={{ color: brandColors.orange }}>
                              {formatCurrency(item.amountPending || item.amount || 0)}
                            </Typography>
                          </TableCell>
                        </>
                      )}
                      {(detailModalType === 'fulfilled' || detailModalType === 'no-invoices') && (
                        <TableCell>
                          <Typography variant="body2" color="textSecondary">
                            {item.location || item.schoolLabel?.replace('School - ', '') || 'N/A'}
                          </Typography>
                        </TableCell>
                      )}
                      {detailModalType === 'fulfilled' && (
                        <TableCell align="right">
                          <Typography variant="body2" fontWeight="medium" sx={{ color: brandColors.green }}>
                            {formatCurrency(item.invoiceSummary?.totalInvoiced || 0)}
                          </Typography>
                        </TableCell>
                      )}
                      {detailModalType === 'fulfilled' && (
                        <TableCell align="right">
                          <Typography variant="body2" fontWeight="medium" sx={{ color: brandColors.green }}>
                            {formatCurrency(item.invoiceSummary?.totalInvoiced || 0)}
                          </Typography>
                        </TableCell>
                      )}
                      {detailModalType === 'outstanding' && (
                        <>
                          <TableCell align="right">
                            <Typography variant="body2" sx={{ color: brandColors.pink, fontWeight: 'medium' }}>
                              {formatCurrency(item.amountOutstanding)}
                            </Typography>
                          </TableCell>
                          <TableCell align="right">
                            <Typography variant="body2">
                              {item.daysOutstanding ? Math.floor(item.daysOutstanding) : 0} days
                            </Typography>
                          </TableCell>
                          <TableCell>
                            <Box display="flex" alignItems="center" gap={1} flexWrap="wrap">
                              <Chip
                                label={item.reminderCount || 0}
                                size="small"
                                sx={{
                                  bgcolor: item.reminderCount > 0 ? brandColors.orange : '#e0e0e0',
                                  color: item.reminderCount > 0 ? 'white' : '#616161',
                                }}
                              />
                              {item.lastReminderSentAt && (
                                <Typography variant="caption" color="textSecondary">
                                  Last: {formatDate(item.lastReminderSentAt)}
                                </Typography>
                              )}
                              <Tooltip title="Sync Reminders from TutorCruncher">
                                <IconButton
                                  size="small"
                                  onClick={() => handleSyncReminders(item.invoiceId)}
                                  sx={{ color: brandColors.cyan }}
                                >
                                  <ArrowPathIcon className="h-4 w-4" />
                                </IconButton>
                              </Tooltip>
                              <Tooltip title="Send Reminder">
                                <IconButton
                                  size="small"
                                  onClick={() => {
                                    setSelectedInvoice({
                                      invoice_id: item.invoiceId,
                                      display_id: item.displayId,
                                      amount: item.amount,
                                      amount_outstanding: item.amountOutstanding,
                                    });
                                    setReminderDialogOpen(true);
                                  }}
                                  sx={{ color: brandColors.purple }}
                                >
                                  <PaperAirplaneIcon className="h-4 w-4" />
                                </IconButton>
                              </Tooltip>
                            </Box>
                          </TableCell>
                        </>
                      )}
                      {detailModalType === 'collected' && (
                        <>
                          <TableCell align="right">
                            <Typography variant="body2" sx={{ color: brandColors.green, fontWeight: 'medium' }}>
                              {formatCurrency(item.amountCollected)}
                            </Typography>
                          </TableCell>
                          <TableCell>
                            <Typography variant="body2">
                              {formatDate(item.dateSent)}
                            </Typography>
                          </TableCell>
                        </>
                      )}
                      {detailModalType === 'invoiced' && (
                        <>
                          <TableCell align="right">
                            <Typography variant="body2" sx={{ color: brandColors.green }}>
                              {formatCurrency(item.amountCollected)}
                            </Typography>
                          </TableCell>
                          <TableCell align="right">
                            <Typography variant="body2" sx={{ color: brandColors.pink }}>
                              {formatCurrency(item.amountOutstanding)}
                            </Typography>
                          </TableCell>
                          <TableCell>
                            <Chip
                              label={item.status === 'paid' ? 'Paid' : 'Unpaid'}
                              size="small"
                              sx={{
                                bgcolor: item.status === 'paid' ? brandColors.green : brandColors.pink,
                                color: 'white',
                              }}
                            />
                          </TableCell>
                          <TableCell>
                            <Typography variant="body2">
                              {formatDate(item.dateSent)}
                            </Typography>
                          </TableCell>
                        </>
                      )}
                      {(detailModalType === 'outstanding' || detailModalType === 'collected' || detailModalType === 'invoiced' || detailModalType === 'pending') && (
                        <TableCell>
                          <Typography variant="body2" color="textSecondary">
                            {item.termSeason || 'N/A'}
                          </Typography>
                        </TableCell>
                      )}
                      <TableCell align="center">
                        {(detailModalType === 'outstanding' || detailModalType === 'collected' || detailModalType === 'invoiced' || detailModalType === 'pending') ? (
                          <IconButton
                            size="small"
                            href={item.tutorcruncherUrl}
                            target="_blank"
                            rel="noopener noreferrer"
                            component="a"
                          >
                            <ArrowTopRightOnSquareIcon className="h-4 w-4" />
                          </IconButton>
                        ) : (
                          <IconButton
                            size="small"
                            onClick={() => {
                              setDetailModalOpen(false);
                              navigate(`/school-dashboard/school/${item.clientId}`);
                            }}
                            sx={{ color: brandColors.purple }}
                          >
                            <ArrowTopRightOnSquareIcon className="h-4 w-4" />
                          </IconButton>
                        )}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </TableContainer>
          )}
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setDetailModalOpen(false)}>Close</Button>
          <Typography variant="caption" color="textSecondary" sx={{ mr: 2 }}>
            {detailModalData.length} {detailModalData.length === 1 ? 'item' : 'items'}
          </Typography>
        </DialogActions>
      </Dialog>

      {/* Reminder Dialog */}
      <Dialog open={reminderDialogOpen} onClose={() => setReminderDialogOpen(false)} maxWidth="sm" fullWidth>
        <DialogTitle>
          <Box display="flex" justifyContent="space-between" alignItems="center">
            <Typography variant="h6">Send Invoice Reminder</Typography>
            <IconButton onClick={() => setReminderDialogOpen(false)} size="small">
              <XMarkIcon className="h-5 w-5" />
            </IconButton>
          </Box>
        </DialogTitle>
        <DialogContent>
          {selectedInvoice && (
            <Box mb={2}>
              <Typography variant="body2" color="textSecondary">Invoice:</Typography>
              <MuiLink
                href={`https://account.acmeops.com/accounting/invoices/${selectedInvoice.invoice_id}/`}
                target="_blank"
                rel="noopener noreferrer"
                sx={{
                  color: brandColors.purple,
                  textDecoration: 'none',
                  '&:hover': { textDecoration: 'underline' },
                }}
              >
                <Typography variant="body1" fontWeight="medium">
                  {selectedInvoice.display_id || `INV-${selectedInvoice.invoice_id}`}
                </Typography>
              </MuiLink>
              <Typography variant="body2" color="textSecondary">
                Amount: {formatCurrency(selectedInvoice.amount)}
              </Typography>
              <Typography variant="body2" color="textSecondary">
                Outstanding: {formatCurrency(selectedInvoice.amount_outstanding)}
              </Typography>
            </Box>
          )}
          <FormControl fullWidth sx={{ mb: 2 }}>
            <InputLabel>Reminder Type</InputLabel>
            <Select
              value={reminderType}
              onChange={(e) => setReminderType(e.target.value)}
              label="Reminder Type"
            >
              <MenuItem value="first">First Reminder</MenuItem>
              <MenuItem value="second">Second Reminder</MenuItem>
              <MenuItem value="third">Third Reminder</MenuItem>
              <MenuItem value="final">Final Reminder</MenuItem>
              <MenuItem value="custom">Custom</MenuItem>
            </Select>
          </FormControl>
          <TextField
            fullWidth
            multiline
            rows={3}
            label="Reminder Message"
            value={reminderMessage}
            onChange={(e) => setReminderMessage(e.target.value)}
            sx={{ mb: 2 }}
          />
          <TextField
            fullWidth
            multiline
            rows={2}
            label="Notes (Internal)"
            value={reminderNotes}
            onChange={(e) => setReminderNotes(e.target.value)}
          />
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setReminderDialogOpen(false)}>Cancel</Button>
          <Button
            onClick={handleSendReminder}
            variant="contained"
            sx={{ bgcolor: brandColors.purple, '&:hover': { bgcolor: brandColors.navy } }}
          >
            Send Reminder
          </Button>
        </DialogActions>
      </Dialog>
    </Box>
  );
}

// School Card Component for better organization
function SchoolCard({ 
  school, 
  onSendReminder, 
  onSyncReminders, 
  onViewDetails,
  brandColors,
  formatCurrency,
  formatDate 
}) {
  const totalReminders = school.invoices?.reduce((sum, inv) => sum + (inv.reminder_count || 0), 0) || 0;
  const hasWithinTerms = (school.invoiceSummary.totalWithinTerms || 0) > 0;
  const isFulfilled = school.invoiceSummary.totalOutstanding === 0 && !hasWithinTerms && school.invoiceSummary.totalInvoiced > 0;
  const hasOutstanding = school.invoiceSummary.totalOutstanding > 0;

  return (
    <Card 
      variant="outlined"
      sx={{
        borderLeft: `4px solid ${isFulfilled ? brandColors.green : hasOutstanding ? brandColors.pink : hasWithinTerms ? brandColors.orange : '#e0e0e0'}`,
        transition: 'all 0.2s',
        '&:hover': {
          boxShadow: 2,
        },
      }}
    >
      <CardContent>
        <Box display="flex" alignItems="flex-start" justifyContent="space-between" mb={2}>
          <Box flex={1}>
            <Box display="flex" alignItems="center" gap={1} mb={1}>
              <Typography variant="h6" fontWeight="bold">
                {school.name}
              </Typography>
              <Chip
                label={isFulfilled ? 'Fulfilled' : hasOutstanding ? 'Past Due' : hasWithinTerms ? 'Within Terms' : 'No Invoices'}
                size="small"
                sx={{
                  bgcolor: isFulfilled ? brandColors.green : hasOutstanding ? brandColors.pink : hasWithinTerms ? brandColors.orange : '#e0e0e0',
                  color: 'white',
                }}
              />
            </Box>
            <Stack direction="row" spacing={2} flexWrap="wrap">
              {school.email && (
                <Box display="flex" alignItems="center" gap={0.5}>
                  <EnvelopeIcon className="h-4 w-4 text-gray-500" />
                  <Typography variant="body2" color="textSecondary">
                    {school.email}
                  </Typography>
                </Box>
              )}
              {school.location && (
                <Box display="flex" alignItems="center" gap={0.5}>
                  <MapPinIcon className="h-4 w-4 text-gray-500" />
                  <Typography variant="body2" color="textSecondary">
                    {school.location}
                  </Typography>
                </Box>
              )}
            </Stack>
          </Box>
          <Box display="flex" gap={1}>
            <Tooltip title="View Full Details">
              <IconButton size="small" onClick={onViewDetails}>
                <ArrowTopRightOnSquareIcon className="h-4 w-4" />
              </IconButton>
            </Tooltip>
          </Box>
        </Box>

        {/* Summary Stats */}
        <Grid container spacing={2} mb={2}>
          <Grid item xs={6} sm={3}>
            <Box>
              <Typography variant="caption" color="textSecondary">
                Invoiced
              </Typography>
              <Typography variant="body1" fontWeight="bold">
                {formatCurrency(school.invoiceSummary.totalInvoiced)}
              </Typography>
            </Box>
          </Grid>
          <Grid item xs={6} sm={3}>
            <Box>
              <Typography variant="caption" color="textSecondary">
                Collected
              </Typography>
              <Typography variant="body1" fontWeight="bold" sx={{ color: brandColors.green }}>
                {formatCurrency(school.invoiceSummary.totalCollected)}
              </Typography>
            </Box>
          </Grid>
          <Grid item xs={6} sm={3}>
            <Box>
              <Typography variant="caption" color="textSecondary">
                Past Due (30+ days)
              </Typography>
              <Typography variant="body1" fontWeight="bold" sx={{ color: brandColors.pink }}>
                {formatCurrency(school.invoiceSummary.totalOutstanding)}
              </Typography>
              {school.invoiceSummary.totalWithinTerms > 0 && (
                <Typography variant="caption" color="textSecondary">
                  {formatCurrency(school.invoiceSummary.totalWithinTerms)} within terms
                </Typography>
              )}
            </Box>
          </Grid>
          <Grid item xs={6} sm={3}>
            <Box>
              <Typography variant="caption" color="textSecondary">
                Reminders
              </Typography>
              <Box display="flex" alignItems="center" gap={0.5}>
                <Chip
                  label={totalReminders}
                  size="small"
                  sx={{
                    bgcolor: totalReminders > 0 ? brandColors.orange : '#e0e0e0',
                    color: totalReminders > 0 ? 'white' : '#616161',
                  }}
                />
              </Box>
            </Box>
          </Grid>
        </Grid>

        {/* Invoice Details - Always Displayed */}
        {school.invoices && school.invoices.length > 0 && (
          <Box mt={2} pt={2} borderTop="1px solid" borderColor="divider">
            <Typography variant="subtitle2" fontWeight="bold" gutterBottom>
              Invoice Details ({school.invoices.length})
            </Typography>
            <Grid container spacing={1.5}>
              {school.invoices.map((invoice) => {
                const isPaid = invoice.is_fulfilled || invoice.status === 'paid';
                const isWithinTerms = !isPaid && (invoice.amount_within_terms > 0 || invoice.days_outstanding <= 0);
                const isPastDue = !isPaid && !isWithinTerms;
                const cardColor = isPaid ? brandColors.green : isPastDue ? brandColors.pink : brandColors.orange;
                return (
                  <Grid item xs={12} sm={6} md={4} key={invoice.invoice_id}>
                    <Card
                      variant="outlined"
                      sx={{
                        bgcolor: `${cardColor}15`,
                        borderLeft: `3px solid ${cardColor}`,
                        p: 1.5,
                      }}
                    >
                      <Box display="flex" justifyContent="space-between" alignItems="flex-start" mb={1}>
                        <Box>
                          <MuiLink
                            href={invoice.tutorcruncher_url}
                            target="_blank"
                            rel="noopener noreferrer"
                            sx={{
                              color: brandColors.purple,
                              textDecoration: 'none',
                              fontWeight: 'bold',
                              fontSize: '0.875rem',
                              '&:hover': { textDecoration: 'underline' },
                            }}
                          >
                            {invoice.display_id || `INV-${invoice.invoice_id}`}
                          </MuiLink>
                          <Typography variant="body2" fontWeight="bold" sx={{ mt: 0.5 }}>
                            {formatCurrency(invoice.amount)}
                          </Typography>
                          <Typography variant="caption" color="textSecondary" display="block">
                            Sent: {formatDate(invoice.date_sent)}
                          </Typography>
                          {isPastDue && invoice.days_outstanding > 0 && (
                            <Typography variant="caption" sx={{ color: brandColors.pink }} display="block">
                              {Math.floor(invoice.days_outstanding)} days past due
                            </Typography>
                          )}
                          {isWithinTerms && (
                            <Typography variant="caption" sx={{ color: brandColors.orange }} display="block">
                              Within 30-day terms
                            </Typography>
                          )}
                        </Box>
                        <Chip
                          label={isPaid ? 'Paid' : isPastDue ? 'Past Due' : 'Within Terms'}
                          size="small"
                          sx={{
                            bgcolor: cardColor,
                            color: 'white',
                          }}
                        />
                      </Box>
                      {invoice.reminder_count > 0 && (
                        <Box display="flex" alignItems="center" gap={1} mt={1}>
                          <Chip
                            label={`${invoice.reminder_count} reminder${invoice.reminder_count > 1 ? 's' : ''}`}
                            size="small"
                            sx={{
                              bgcolor: brandColors.orange,
                              color: 'white',
                            }}
                          />
                          {invoice.last_reminder_sent_at && (
                            <Typography variant="caption" color="textSecondary">
                              Last: {formatDate(invoice.last_reminder_sent_at)}
                            </Typography>
                          )}
                        </Box>
                      )}
                      {!isPaid && (
                        <Box display="flex" gap={0.5} mt={1}>
                          <Tooltip title="Sync Reminders">
                            <IconButton
                              size="small"
                              onClick={() => onSyncReminders(invoice.invoice_id)}
                              sx={{ color: brandColors.cyan }}
                            >
                              <ArrowPathIcon className="h-4 w-4" />
                            </IconButton>
                          </Tooltip>
                          <Tooltip title="Send Reminder">
                            <IconButton
                              size="small"
                              onClick={() => onSendReminder(invoice)}
                              sx={{ color: brandColors.purple }}
                            >
                              <PaperAirplaneIcon className="h-4 w-4" />
                            </IconButton>
                          </Tooltip>
                        </Box>
                      )}
                    </Card>
                  </Grid>
                );
              })}
            </Grid>
          </Box>
        )}
      </CardContent>
    </Card>
  );
}
