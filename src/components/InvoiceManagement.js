import React, { useState, useEffect, useCallback } from 'react';
import axios from 'axios';
import { formatCurrency, formatDate } from '../utils/formatters';
import {
  Box,
  Typography,
  Button,
  Card,
  CardContent,
  CircularProgress,
  Alert,
  Chip,
} from '@mui/material';
import {
  CurrencyDollarIcon,
  ExclamationTriangleIcon,
  ArrowPathIcon,
  CheckCircleIcon,
} from '@heroicons/react/24/outline';
import { DateTime } from 'luxon';
import StandardDataGridLayout from './StandardDataGridLayout';

export default function InvoiceManagement() {
  const [invoices, setInvoices] = useState([]);
  const [summary, setSummary] = useState({ 
    unpaidCount: 0, 
    unpaidAmount: 0,
    paidCount: 0,
    paidAmount: 0
  });
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [searchQuery, setSearchQuery] = useState("");
  const [activeTab, setActiveTab] = useState('unpaid');
  
  // Date range for paid invoices filtering - default to last week (Sunday to Saturday)
  const [dateRange, setDateRange] = useState(() => {
    const now = DateTime.now().setZone("America/New_York");
    // Last week: Sunday to Saturday
    // Luxon's startOf('week') is Monday, so we adjust to Sunday
    const lastWeekSunday = now.minus({ weeks: 1 }).startOf('week').minus({ days: 1 });
    const start = lastWeekSunday.startOf('day');
    const end = lastWeekSunday.plus({ days: 6 }).endOf('day');
    return {
      startDate: start.toISODate(),
      endDate: end.toISODate(),
      preset: 'lastWeek'
    };
  });

  const fetchData = useCallback(async (status = 'unpaid', startDate = null, endDate = null) => {
    try {
      setLoading(true);
      setError(null);

      const axiosInstance = axios.create({
        withCredentials: true,
      });

      // Build query params
      const params = { status };

      // Add date filtering for paid invoices
      if (status === 'paid' && startDate && endDate) {
        params.startDate = startDate;
        params.endDate = endDate;
      }

      // Fetch invoices from API
      const invoicesResponse = await axiosInstance.get('/api/invoices', { params });
      setInvoices(invoicesResponse.data.invoices || []);

      // Fetch summary from API
      const summaryResponse = await axiosInstance.get('/api/invoices/summary');
      const summaryData = summaryResponse.data;
      
      // Transform API response to match component expectations
      const unpaidSummary = summaryData.summary?.find(s => s.status === 'unpaid') || {};
      const paidSummary = summaryData.summary?.find(s => s.status === 'paid') || {};
      
      setSummary({
        unpaidCount: unpaidSummary.count || 0,
        unpaidAmount: unpaidSummary.total_gross || 0,
        paidCount: paidSummary.count || 0,
        paidAmount: paidSummary.total_gross || 0
      });

    } catch (err) {
      console.error('Error fetching data:', err);
      setError(err.response?.data?.error || 'Failed to load invoices');
    } finally {
      setLoading(false);
    }
  }, []);

  // Fetch data when tab or date range changes
  useEffect(() => {
    if (activeTab === 'paid' && dateRange?.startDate && dateRange?.endDate) {
      fetchData('paid', dateRange.startDate, dateRange.endDate);
    } else if (activeTab === 'unpaid') {
      fetchData('unpaid');
    }
  }, [activeTab, dateRange?.startDate, dateRange?.endDate, fetchData]);

  const handleTabChange = (event, newValue) => {
    if (newValue) {
      setActiveTab(newValue);
    }
  };

  const handleDateRangeChange = (startDate, endDate, preset) => {
    const newRange = {
      startDate,
      endDate,
      preset
    };
    setDateRange(newRange);
  };



  const getDaysOutstanding = (dateString) => {
    if (!dateString) return 0;
    const date = new Date(dateString);
    const today = new Date();
    const diffTime = Math.abs(today - date);
    return Math.ceil(diffTime / (1000 * 60 * 60 * 24));
  };

  const getStatusColor = (days) => {
    if (days >= 60) return 'error';
    if (days >= 30) return 'warning';
    return 'info';
  };

  // Filter invoices by search query
  const filteredInvoices = searchQuery
    ? invoices.filter((invoice) => {
        const query = searchQuery.toLowerCase();
        return (
          invoice.display_id?.toLowerCase().includes(query) ||
          invoice.id?.toString().includes(query) ||
          invoice.client_first_name?.toLowerCase().includes(query) ||
          invoice.client_last_name?.toLowerCase().includes(query) ||
          invoice.client_email?.toLowerCase().includes(query) ||
          formatCurrency(invoice.gross).toLowerCase().includes(query)
        );
      })
    : invoices;

  // Render column header
  const renderColumnHeader = (params) => {
    return (
      <Box
        sx={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          width: '100%',
          fontWeight: 600,
          fontSize: '0.875rem',
        }}
      >
        <span>{params.colDef.headerName}</span>
      </Box>
    );
  };

  // Helper function to get the correct TutorCruncher URL for an invoice
  const getInvoiceUrl = (invoice) => {
    const displayId = invoice.display_id || '';
    // Proforma invoices start with "PFI-"
    const isProforma = displayId.startsWith('PFI-');
    if (isProforma) {
      return `https://account.acmeops.com/accounting/proforma-invoices/${invoice.id}/`;
    }
    return `https://account.acmeops.com/accounting/invoices/${invoice.id}/`;
  };

  // Unpaid invoices columns
  const unpaidColumns = [
    {
      field: 'invoice',
      headerName: 'Invoice',
      width: 200,
      renderHeader: renderColumnHeader,
      renderCell: (params) => {
        const invoice = params.row;
        const displayId = invoice.display_id || `INV-${invoice.id}`;
        const showId = !displayId.includes(`INV-${invoice.id}`) && !displayId.includes(invoice.id.toString());
        const invoiceUrl = getInvoiceUrl(invoice);
        
        return (
          <Box>
            <Typography
              component="a"
              href={invoiceUrl}
              target="_blank"
              rel="noopener noreferrer"
              sx={{
                color: '#7c3aed',
                textDecoration: 'none',
                fontSize: '0.875rem',
                fontWeight: 600,
                '&:hover': { textDecoration: 'underline' },
                display: 'block',
                mb: 0.5,
              }}
            >
              {displayId}
            </Typography>
            {showId && (
              <Typography
                component="a"
                href={invoiceUrl}
                target="_blank"
                rel="noopener noreferrer"
                sx={{
                  color: 'text.secondary',
                  textDecoration: 'none',
                  fontSize: '0.75rem',
                  '&:hover': { textDecoration: 'underline' },
                }}
              >
                ID: {invoice.id}
              </Typography>
            )}
          </Box>
        );
      },
    },
    {
      field: 'client',
      headerName: 'Client',
      width: 250,
      renderHeader: renderColumnHeader,
      renderCell: (params) => {
        const invoice = params.row;
        return (
          <Box>
            <Typography variant="body2" sx={{ fontWeight: 600, fontSize: '0.875rem' }}>
              {invoice.client_first_name} {invoice.client_last_name}
            </Typography>
            <Typography variant="body2" sx={{ color: 'text.secondary', fontSize: '0.875rem' }}>
              {invoice.client_email}
            </Typography>
          </Box>
        );
      },
    },
    {
      field: 'date_sent',
      headerName: 'Date Sent',
      width: 150,
      renderHeader: renderColumnHeader,
      renderCell: (params) => (
        <Typography variant="body2" sx={{ fontSize: '0.875rem' }}>
          {formatDate(params.value)}
        </Typography>
      ),
    },
    {
      field: 'days_outstanding',
      headerName: 'Days Outstanding',
      width: 180,
      renderHeader: renderColumnHeader,
      renderCell: (params) => {
        const days = getDaysOutstanding(params.row.date_sent);
        const color = getStatusColor(days);
        return (
          <Chip
            label={`${days} days`}
            size="small"
            sx={{
              fontSize: '0.75rem',
              fontWeight: 600,
              height: 24,
              color: color === 'error' ? '#d32f2f' : color === 'warning' ? '#ed6c02' : '#0288d1',
              bgcolor: color === 'error' ? '#ffebee' : color === 'warning' ? '#fff3e0' : '#e3f2fd',
            }}
          />
        );
      },
    },
    {
      field: 'gross',
      headerName: 'Amount',
      width: 150,
      align: 'right',
      headerAlign: 'right',
      renderHeader: renderColumnHeader,
      renderCell: (params) => (
        <Typography variant="body2" sx={{ fontWeight: 600, fontSize: '0.875rem' }}>
          {formatCurrency(params.value)}
        </Typography>
      ),
    },
  ];

  // Paid invoices columns (includes date_paid)
  const paidColumns = [
    {
      field: 'invoice',
      headerName: 'Invoice',
      width: 200,
      renderHeader: renderColumnHeader,
      renderCell: (params) => {
        const invoice = params.row;
        const displayId = invoice.display_id || `INV-${invoice.id}`;
        const showId = !displayId.includes(`INV-${invoice.id}`) && !displayId.includes(invoice.id.toString());
        const invoiceUrl = getInvoiceUrl(invoice);
        
        return (
          <Box>
            <Typography
              component="a"
              href={invoiceUrl}
              target="_blank"
              rel="noopener noreferrer"
              sx={{
                color: '#7c3aed',
                textDecoration: 'none',
                fontSize: '0.875rem',
                fontWeight: 600,
                '&:hover': { textDecoration: 'underline' },
                display: 'block',
                mb: 0.5,
              }}
            >
              {displayId}
            </Typography>
            {showId && (
              <Typography
                component="a"
                href={invoiceUrl}
                target="_blank"
                rel="noopener noreferrer"
                sx={{
                  color: 'text.secondary',
                  textDecoration: 'none',
                  fontSize: '0.75rem',
                  '&:hover': { textDecoration: 'underline' },
                }}
              >
                ID: {invoice.id}
              </Typography>
            )}
          </Box>
        );
      },
    },
    {
      field: 'client',
      headerName: 'Client',
      width: 250,
      renderHeader: renderColumnHeader,
      renderCell: (params) => {
        const invoice = params.row;
        return (
          <Box>
            <Typography variant="body2" sx={{ fontWeight: 600, fontSize: '0.875rem' }}>
              {invoice.client_first_name} {invoice.client_last_name}
            </Typography>
            <Typography variant="body2" sx={{ color: 'text.secondary', fontSize: '0.875rem' }}>
              {invoice.client_email}
            </Typography>
          </Box>
        );
      },
    },
    {
      field: 'date_sent',
      headerName: 'Date Sent',
      width: 150,
      renderHeader: renderColumnHeader,
      renderCell: (params) => (
        <Typography variant="body2" sx={{ fontSize: '0.875rem' }}>
          {formatDate(params.value)}
        </Typography>
      ),
    },
    {
      field: 'date_paid',
      headerName: 'Date Paid',
      width: 150,
      renderHeader: renderColumnHeader,
      renderCell: (params) => {
        const datePaid = params.value || params.row.date_paid;
        return (
          <Typography variant="body2" sx={{ fontSize: '0.875rem', color: datePaid ? '#2e7d32' : 'text.secondary', fontWeight: datePaid ? 500 : 400 }}>
            {formatDate(datePaid)}
          </Typography>
        );
      },
    },
    {
      field: 'payment_method',
      headerName: 'Payment Method',
      width: 150,
      renderHeader: renderColumnHeader,
      renderCell: (params) => {
        const method = params.value || 'N/A';
        const getMethodColor = (method) => {
          if (!method || method === 'N/A') return 'text.secondary';
          const methodLower = method.toLowerCase();
          if (methodLower.includes('stripe')) return '#635bff';
          if (methodLower.includes('gocardless')) return '#00b3b0';
          if (methodLower.includes('manual')) return '#ff6b35';
          return 'text.primary';
        };
        return (
          <Typography variant="body2" sx={{ fontSize: '0.875rem', color: getMethodColor(method), fontWeight: 500 }}>
            {method}
          </Typography>
        );
      },
    },
    {
      field: 'gross',
      headerName: 'Amount',
      width: 150,
      align: 'right',
      headerAlign: 'right',
      renderHeader: renderColumnHeader,
      renderCell: (params) => (
        <Typography variant="body2" sx={{ fontWeight: 600, fontSize: '0.875rem', color: '#2e7d32' }}>
          {formatCurrency(params.value)}
        </Typography>
      ),
    },
  ];

  // Use appropriate columns based on active tab
  const columns = activeTab === 'paid' ? paidColumns : unpaidColumns;

  // Prepare rows with calculated fields
  const rows = filteredInvoices.map((invoice) => ({
    id: invoice.id,
    ...invoice,
    days_outstanding: getDaysOutstanding(invoice.date_sent),
  }));

  // Action buttons
  const actionButtons = [
    {
      label: 'Refresh',
      onClick: () => {
        if (activeTab === 'paid' && dateRange?.startDate && dateRange?.endDate) {
          fetchData('paid', dateRange.startDate, dateRange.endDate);
        } else {
          fetchData('unpaid');
        }
      },
      variant: 'outlined',
      startIcon: <ArrowPathIcon className="h-4 w-4" />,
    },
  ];

  // Tabs configuration
  const tabs = [
    { label: 'Unpaid Invoices', value: 'unpaid' },
    { label: 'Paid Invoices', value: 'paid' },
  ];

  if (loading && invoices.length === 0 && !error) {
    return (
      <Box display="flex" justifyContent="center" alignItems="center" minHeight="100vh">
        <Box textAlign="center">
          <CircularProgress sx={{ mb: 2 }} />
          <Typography variant="body1" color="text.secondary">
            Loading {activeTab === 'paid' ? 'paid' : 'unpaid'} invoices...
          </Typography>
        </Box>
      </Box>
    );
  }

  // Calculate summary for current date range (paid invoices only)
  const currentRangeSummary = activeTab === 'paid' && filteredInvoices.length > 0
    ? filteredInvoices.reduce((acc, inv) => ({
        count: acc.count + 1,
        total: acc.total + (parseFloat(inv.gross) || 0)
      }), { count: 0, total: 0 })
    : { count: 0, total: 0 };

  return (
    <Box>
      {/* Summary Cards */}
      <Box sx={{ 
        p: 2, 
        display: 'flex', 
        gap: 2, 
        mb: 0,
        bgcolor: '#f5f6f8',
      }}>
        {activeTab === 'unpaid' ? (
          <>
            <Card sx={{ flex: 1, boxShadow: 1 }}>
              <CardContent sx={{ p: 2, '&:last-child': { pb: 2 } }}>
                <Box display="flex" alignItems="center">
                  <ExclamationTriangleIcon
                    className="h-8 w-8 text-red-700 mr-4 flex-shrink-0"
                  />
                  <Box>
                    <Typography variant="body2" color="text.secondary" sx={{ mb: 0.5 }}>
                      Unpaid Invoices
                    </Typography>
                    <Typography variant="h5" fontWeight={600} sx={{ lineHeight: 1.2 }}>
                      {summary.unpaidCount}
                    </Typography>
                  </Box>
                </Box>
              </CardContent>
            </Card>
            <Card sx={{ flex: 1, boxShadow: 1 }}>
              <CardContent sx={{ p: 2, '&:last-child': { pb: 2 } }}>
                <Box display="flex" alignItems="center">
                  <CurrencyDollarIcon 
                    className="h-8 w-8 text-green-700 mr-4 flex-shrink-0" 
                  />
                  <Box>
                    <Typography variant="body2" color="text.secondary" sx={{ mb: 0.5 }}>
                      Total Outstanding
                    </Typography>
                    <Typography variant="h5" fontWeight={600} sx={{ lineHeight: 1.2 }}>
                      {formatCurrency(summary.unpaidAmount)}
                    </Typography>
                  </Box>
                </Box>
              </CardContent>
            </Card>
          </>
        ) : (
          <>
            <Card sx={{ flex: 1, boxShadow: 1 }}>
              <CardContent sx={{ p: 2, '&:last-child': { pb: 2 } }}>
                <Box display="flex" alignItems="center">
                  <CheckCircleIcon 
                    className="h-8 w-8 text-green-700 mr-4 flex-shrink-0" 
                  />
                  <Box>
                    <Typography variant="body2" color="text.secondary" sx={{ mb: 0.5 }}>
                      Paid Invoices (Selected Period)
                    </Typography>
                    <Typography variant="h5" fontWeight={600} sx={{ lineHeight: 1.2 }}>
                      {currentRangeSummary.count}
                    </Typography>
                  </Box>
                </Box>
              </CardContent>
            </Card>
            <Card sx={{ flex: 1, boxShadow: 1 }}>
              <CardContent sx={{ p: 2, '&:last-child': { pb: 2 } }}>
                <Box display="flex" alignItems="center">
                  <CurrencyDollarIcon 
                    className="h-8 w-8 text-green-700 mr-4 flex-shrink-0" 
                  />
                  <Box>
                    <Typography variant="body2" color="text.secondary" sx={{ mb: 0.5 }}>
                      Total Paid (Selected Period)
                    </Typography>
                    <Typography variant="h5" fontWeight={600} sx={{ lineHeight: 1.2 }}>
                      {formatCurrency(currentRangeSummary.total)}
                    </Typography>
                  </Box>
                </Box>
              </CardContent>
            </Card>
          </>
        )}
      </Box>

      {/* Error Message */}
      {error && (
        <Box sx={{ px: 2, pt: 2, mb: 0 }}>
          <Alert severity="error" onClose={() => setError(null)}>
            {error}
          </Alert>
        </Box>
      )}

      {/* Standardized DataGrid with Tabs */}
      <StandardDataGridLayout
        title=""
        columns={columns}
        rows={rows}
        tabs={tabs}
        activeTab={activeTab}
        onTabChange={handleTabChange}
        searchQuery={searchQuery}
        onSearchChange={(value) => setSearchQuery(value)}
        dateRange={activeTab === 'paid' ? dateRange : null}
        onDateRangeChange={activeTab === 'paid' ? handleDateRangeChange : null}
        actionButtons={actionButtons}
        getRowId={(row) => row.id}
        pagePath="/invoice-management"
        dataGridProps={{
          initialState: {
            pagination: { paginationModel: { pageSize: 25, page: 0 } },
            sorting: {
              sortModel: [{ field: activeTab === 'paid' ? 'date_paid' : 'gross', sort: 'desc' }],
            },
          },
          autoHeight: true,
          sx: {
            '& .MuiDataGrid-columnSeparator': { display: 'none' },
            // Remove any fixed height to allow autoHeight to work properly
            '& .MuiDataGrid-root': {
              height: 'auto !important',
            },
            '& .MuiDataGrid-main': {
              height: 'auto !important',
            },
            '& .MuiDataGrid-virtualScroller': {
              // Disable virtual scrolling to show all rows
              overflow: 'visible !important',
              height: 'auto !important',
            },
            '& .MuiDataGrid-virtualScrollerContent': {
              height: 'auto !important',
            },
            '& .MuiDataGrid-virtualScrollerRenderZone': {
              overflow: 'visible',
              height: 'auto !important',
            },
          },
        }}
      />
    </Box>
  );
}
