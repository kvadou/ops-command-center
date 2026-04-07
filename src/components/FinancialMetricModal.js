import React, { useState, useMemo } from 'react';
import { formatCurrency } from '../utils/formatters';
import {
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions,
  Button,
  Box,
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TableRow,
  Paper,
  Chip,
  TextField,
  InputAdornment,
  Typography,
  IconButton,
} from '@mui/material';
import { MagnifyingGlassIcon, XMarkIcon, ArrowTopRightOnSquareIcon, ExclamationTriangleIcon, ExclamationCircleIcon } from '@heroicons/react/24/outline';
import { CheckCircleIcon } from '@heroicons/react/24/solid';

const brandColors = {
  green: '#34B256',
  pink: '#DA2E72',
  orange: '#F79A30',
  purple: '#6A469D',
  navy: '#2D2F8E',
  cyan: '#50C8DF',
};

/**
 * Financial Metric Modal - Shows detailed breakdown of financial metrics by school
 * 
 * @param {boolean} open - Whether modal is open
 * @param {function} onClose - Close handler
 * @param {'totalRevenue'|'paidInvoices'|'outstandingInvoices'|'avgRevenue'} metric - Which metric to display
 * @param {array} schools - Array of school objects with financial data
 */
export default function FinancialMetricModal({ open, onClose, metric, schools = [] }) {
  const [searchQuery, setSearchQuery] = useState('');


  const getHealthStatusColor = (status) => {
    switch (status) {
      case 'healthy':
        return brandColors.green;
      case 'unhealthy':
        return brandColors.pink;
      case 'needs_attention':
        return brandColors.orange;
      default:
        return '#9e9e9e';
    }
  };

  const getHealthStatusIcon = (status) => {
    switch (status) {
      case 'healthy':
        return <CheckCircleIcon className="h-4 w-4" />;
      case 'unhealthy':
        return <ExclamationCircleIcon className="h-4 w-4" />;
      case 'needs_attention':
        return <ExclamationTriangleIcon className="h-4 w-4" />;
      default:
        return null;
    }
  };

  const getMetricTitle = () => {
    switch (metric) {
      case 'totalRevenue':
        return 'Total Revenue by School';
      case 'paidInvoices':
        return 'Paid Invoices by School';
      case 'outstandingInvoices':
        return 'Outstanding Invoices by School';
      case 'avgRevenue':
        return 'Average Revenue per Active School';
      default:
        return 'Financial Details';
    }
  };

  const getMetricValue = (school) => {
    switch (metric) {
      case 'totalRevenue':
        return school.totalRevenue || 0;
      case 'paidInvoices':
        return school.invoices?.paidAmount || 0;
      case 'outstandingInvoices':
        return school.invoices?.unpaidAmount || school.invoices?.unpaidCount > 0 ? (school.invoices?.unpaidAmount || 0) : 0;
      case 'avgRevenue':
        return school.totalRevenue || 0;
      default:
        return 0;
    }
  };

  // Prepare and sort data
  const tableData = useMemo(() => {
    let data = schools.map(school => ({
      ...school,
      metricValue: getMetricValue(school),
    }));

    // Filter schools based on metric - only show schools with relevant data
    if (metric === 'paidInvoices') {
      data = data.filter(school => (school.invoices?.paidAmount || 0) > 0);
    } else if (metric === 'outstandingInvoices') {
      data = data.filter(school => (school.invoices?.unpaidAmount || 0) > 0);
    } else if (metric === 'totalRevenue') {
      data = data.filter(school => (school.totalRevenue || 0) > 0);
    } else if (metric === 'avgRevenue') {
      data = data.filter(school => (school.totalRevenue || 0) > 0);
    }

    // Filter by search query
    if (searchQuery) {
      const query = searchQuery.toLowerCase();
      data = data.filter(school =>
        school.name?.toLowerCase().includes(query) ||
        school.location?.toLowerCase().includes(query) ||
        school.email?.toLowerCase().includes(query)
      );
    }

    // Sort by metric value descending
    data.sort((a, b) => b.metricValue - a.metricValue);

    return data;
  }, [schools, searchQuery, metric]);

  const handleSchoolClick = (schoolId) => {
    window.open(`/school-dashboard/school/${schoolId}`, '_blank');
  };

  return (
    <Dialog
      open={open}
      onClose={onClose}
      maxWidth="lg"
      fullWidth
    >
      <DialogTitle>
        <Box display="flex" alignItems="center" justifyContent="space-between">
          <Typography variant="h6" fontWeight="bold">
            {getMetricTitle()}
          </Typography>
          <IconButton size="small" onClick={onClose}>
            <XMarkIcon className="h-5 w-5" />
          </IconButton>
        </Box>
      </DialogTitle>
      <DialogContent dividers>
        <Box mb={2}>
          <TextField
            fullWidth
            size="small"
            placeholder="Search schools..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            InputProps={{
              startAdornment: (
                <InputAdornment position="start">
                  <MagnifyingGlassIcon className="h-5 w-5" />
                </InputAdornment>
              ),
            }}
          />
        </Box>

        {tableData.length === 0 ? (
          <Box textAlign="center" py={4}>
            <Typography color="textSecondary">
              {searchQuery ? 'No schools found matching your search.' : 'No data available.'}
            </Typography>
          </Box>
        ) : (
          <TableContainer component={Paper} variant="outlined">
            <Table>
              <TableHead>
                <TableRow>
                  <TableCell><strong>School Name</strong></TableCell>
                  <TableCell><strong>Location</strong></TableCell>
                  <TableCell align="right"><strong>
                    {metric === 'totalRevenue' && 'Revenue'}
                    {metric === 'paidInvoices' && 'Paid'}
                    {metric === 'outstandingInvoices' && 'Outstanding'}
                    {metric === 'avgRevenue' && 'Revenue'}
                  </strong></TableCell>
                  <TableCell><strong>Health Status</strong></TableCell>
                  <TableCell align="right"><strong>Actions</strong></TableCell>
                </TableRow>
              </TableHead>
              <TableBody>
                {tableData.map((school) => (
                  <TableRow key={school.clientId} hover>
                    <TableCell>
                      <Typography variant="body2" fontWeight="medium">
                        {school.name}
                      </Typography>
                    </TableCell>
                    <TableCell>
                      <Typography variant="body2" color="textSecondary">
                        {school.location || 'N/A'}
                      </Typography>
                    </TableCell>
                    <TableCell align="right">
                      <Typography variant="body2" fontWeight="medium">
                        {formatCurrency(school.metricValue)}
                      </Typography>
                    </TableCell>
                    <TableCell>
                      <Chip
                        icon={getHealthStatusIcon(school.healthStatus)}
                        label={school.healthStatus?.replace('_', ' ') || 'Unknown'}
                        size="small"
                        sx={{
                          bgcolor: getHealthStatusColor(school.healthStatus),
                          color: 'white',
                          '& .MuiChip-icon': { color: 'white' }
                        }}
                      />
                    </TableCell>
                    <TableCell align="right">
                      <Button
                        size="small"
                        startIcon={<ArrowTopRightOnSquareIcon className="h-5 w-5" />}
                        onClick={() => handleSchoolClick(school.clientId)}
                        sx={{
                          color: brandColors.purple,
                          '&:hover': {
                            bgcolor: `${brandColors.purple}08`
                          }
                        }}
                      >
                        View School
                      </Button>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </TableContainer>
        )}
      </DialogContent>
      <DialogActions>
        <Button onClick={onClose}>
          Close
        </Button>
        {(metric === 'outstandingInvoices' || metric === 'paidInvoices') && (
          <Button
            variant="contained"
            onClick={() => {
              onClose();
              window.open('/school-dashboard/invoice-fulfillment', '_blank');
            }}
            sx={{
              bgcolor: brandColors.purple,
              '&:hover': { bgcolor: brandColors.navy }
            }}
          >
            Go to Invoice Fulfillment
          </Button>
        )}
      </DialogActions>
    </Dialog>
  );
}
