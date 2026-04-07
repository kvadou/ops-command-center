/**
 * TermBillingSubscriptions Component
 * Displays all term billing subscriptions for schools
 * Shows services with term billing enrollments and allows clicking to see all purchasers
 */

import React, { useState, useEffect } from 'react';
import { useSearchParams } from 'react-router-dom';
import axios from 'axios';
import { formatCurrency, formatDate } from '../utils/formatters';
import {
  Box,
  Card,
  CardContent,
  Typography,
  TextField,
  Chip,
  Grid,
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TableRow,
  TablePagination,
  IconButton,
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions,
  Button,
  Alert,
  CircularProgress,
  Tooltip,
  Link,
  Paper,
  Divider,
} from '@mui/material';
import { MagnifyingGlassIcon, CurrencyDollarIcon, UserIcon, AcademicCapIcon } from '@heroicons/react/24/outline';
import { CheckCircleIcon } from '@heroicons/react/24/solid';

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

// Helper to get authenticated axios instance
const getAuthenticatedAxios = () => {
  return axios.create({
    withCredentials: true,
  });
};

export default function TermBillingSubscriptions() {
  const [searchParams, setSearchParams] = useSearchParams();
  
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [subscriptions, setSubscriptions] = useState([]);
  const [pagination, setPagination] = useState({
    total: 0,
    limit: 25,
    offset: 0,
    hasMore: false,
  });
  
  const [searchQuery, setSearchQuery] = useState(searchParams.get('search') || '');
  const [serviceFilter, setServiceFilter] = useState(searchParams.get('serviceId') || 'all');
  
  // Service detail modal
  const [selectedService, setSelectedService] = useState(null);
  const [serviceEnrollments, setServiceEnrollments] = useState([]);
  const [serviceDetailOpen, setServiceDetailOpen] = useState(false);
  const [loadingServiceDetail, setLoadingServiceDetail] = useState(false);
  
  useEffect(() => {
    loadSubscriptions();
  }, [searchQuery, serviceFilter, pagination.offset]);

  useEffect(() => {
    const params = new URLSearchParams();
    if (searchQuery) params.set('search', searchQuery);
    if (serviceFilter !== 'all') params.set('serviceId', serviceFilter);
    setSearchParams(params, { replace: true });
  }, [searchQuery, serviceFilter, setSearchParams]);

  const loadSubscriptions = async () => {
    try {
      setLoading(true);
      setError(null);
      
      const api = getAuthenticatedAxios();
      const params = new URLSearchParams({
        limit: pagination.limit.toString(),
        offset: pagination.offset.toString(),
        paymentType: 'term', // Only term billing
      });
      
      if (serviceFilter !== 'all') {
        params.append('serviceId', serviceFilter);
      }
      
      if (searchQuery) {
        params.append('search', searchQuery);
      }
      
      const response = await api.get(`/api/subscriptions?${params.toString()}`);
      
      // Group by service_id to show unique services
      const enrollments = response.data.subscriptions || [];
      const serviceMap = new Map();
      
      enrollments.forEach(enrollment => {
        const serviceId = enrollment.service_id;
        if (!serviceId) return; // Skip if no service_id
        
        if (!serviceMap.has(serviceId)) {
          serviceMap.set(serviceId, {
            service_id: serviceId,
            service_name: enrollment.service_name || `Service ${serviceId}`,
            term_name: enrollment.term_name,
            enrollment_count: 0,
            total_revenue: 0,
            enrollments: []
          });
        }
        
        const service = serviceMap.get(serviceId);
        service.enrollment_count++;
        service.enrollments.push(enrollment);
        
        // Extract total amount paid from metadata or billing history
        const metadata = enrollment.metadata || {};
        let amountCharged = parseFloat(metadata.amountCharged || 0);
        
        // If no amount in metadata, check billing history
        if (amountCharged === 0 && enrollment.billingHistory && enrollment.billingHistory.length > 0) {
          amountCharged = enrollment.billingHistory.reduce((sum, bill) => 
            sum + (parseFloat(bill.amount_charged) || 0), 0
          );
        }
        
        // If still no amount, try to calculate from lessons and rate
        if (amountCharged === 0 && enrollment.total_lessons_remaining && enrollment.rate_per_lesson) {
          // This is approximate - actual amount should be in metadata
          amountCharged = enrollment.total_lessons_remaining * parseFloat(enrollment.rate_per_lesson || 0);
        }
        
        service.total_revenue += amountCharged;
      });
      
      // Convert to array and sort by total revenue (descending)
      const servicesArray = Array.from(serviceMap.values()).sort((a, b) => b.total_revenue - a.total_revenue);
      setSubscriptions(servicesArray);
      setPagination(response.data.pagination || pagination);
      
    } catch (err) {
      console.error('Error loading term billing subscriptions:', err);
      
      if (err.response?.status === 401) {
        setError('Authentication required. Please log in again.');
        localStorage.removeItem('token');
        localStorage.removeItem('user');
        setTimeout(() => {
          window.location.href = '/login';
        }, 2000);
        return;
      }
      
      setError(err.response?.data?.error || 'Failed to load term billing subscriptions');
    } finally {
      setLoading(false);
    }
  };

  const handleServiceClick = async (service) => {
    setSelectedService(service);
    setServiceDetailOpen(true);
    setLoadingServiceDetail(true);
    
    try {
      const api = getAuthenticatedAxios();
      const response = await api.get(`/api/subscriptions?paymentType=term&serviceId=${service.service_id}&limit=1000`);
      
      // Enrich enrollments with payment details
      const enrollments = (response.data.subscriptions || []).map(enrollment => {
        const metadata = enrollment.metadata || {};
        let amountCharged = parseFloat(metadata.amountCharged || 0);
        const discountApplied = parseFloat(metadata.discountApplied || 0);
        const lessons = parseInt(metadata.lessons || enrollment.total_lessons_remaining || 0);
        
        // If no amount in metadata, check billing history
        if (amountCharged === 0 && enrollment.billingHistory && enrollment.billingHistory.length > 0) {
          amountCharged = enrollment.billingHistory.reduce((sum, bill) => 
            sum + (parseFloat(bill.amount_charged) || 0), 0
          );
        }
        
        // Calculate original amount before discount
        let originalAmount = amountCharged;
        if (discountApplied > 0 && amountCharged > 0) {
          originalAmount = amountCharged / (1 - discountApplied / 100);
        }
        
        return {
          ...enrollment,
          amountPaid: amountCharged || 0,
          originalAmount: originalAmount,
          discountPercent: discountApplied,
          lessonsPaid: lessons
        };
      });
      
      setServiceEnrollments(enrollments);
    } catch (err) {
      console.error('Error loading service enrollments:', err);
      setError('Failed to load enrollment details');
    } finally {
      setLoadingServiceDetail(false);
    }
  };

  const handleSearchChange = (event) => {
    setSearchQuery(event.target.value);
    setPagination(prev => ({ ...prev, offset: 0 }));
  };

  const handlePageChange = (event, newPage) => {
    setPagination(prev => ({
      ...prev,
      offset: newPage * prev.limit,
    }));
  };

  const handleRowsPerPageChange = (event) => {
    const newLimit = parseInt(event.target.value, 10);
    setPagination(prev => ({
      ...prev,
      limit: newLimit,
      offset: 0,
    }));
  };



  if (loading && subscriptions.length === 0) {
    return (
      <Box display="flex" justifyContent="center" alignItems="center" minHeight="400px">
        <CircularProgress />
      </Box>
    );
  }

  return (
    <Box sx={{
      bgcolor: '#f5f6f8',
      minHeight: '100vh',
      p: { xs: 2, sm: 3 },
    }}>
      {/* Error Alert */}
      {error && (
        <Alert severity="error" sx={{ mb: 3 }} onClose={() => setError(null)}>
          {error}
        </Alert>
      )}

      {/* Filters */}
      <Card sx={{ 
        mb: 3,
        bgcolor: 'white',
        borderRadius: 2,
        boxShadow: '0 1px 3px rgba(0,0,0,0.1)',
        border: '1px solid #e4e6eb',
      }}>
        <CardContent sx={{ p: 3 }}>
          <Grid container spacing={2} alignItems="center">
            <Grid item xs={12} md={6}>
              <TextField
                fullWidth
                size="small"
                placeholder="Search by service name or term..."
                value={searchQuery}
                onChange={handleSearchChange}
                InputProps={{
                  startAdornment: <MagnifyingGlassIcon className="h-5 w-5" style={{ marginRight: 8, color: 'rgba(0,0,0,0.54)' }} />,
                }}
              />
            </Grid>
          </Grid>
        </CardContent>
      </Card>

      {/* Services Table */}
      <Card sx={{
        bgcolor: 'white',
        borderRadius: 2,
        boxShadow: '0 1px 3px rgba(0,0,0,0.1)',
        border: '1px solid #e4e6eb',
        overflow: 'hidden',
      }}>
        <TableContainer>
          <Table>
            <TableHead>
              <TableRow sx={{
                bgcolor: '#f5f6f8',
                '& .MuiTableCell-head': {
                  fontWeight: 600,
                  fontSize: '0.875rem',
                  color: '#1c1e21',
                  borderBottom: '2px solid #e4e6eb',
                  py: 1.5,
                },
              }}>
                <TableCell>Service/Term</TableCell>
                <TableCell>Enrollments</TableCell>
                <TableCell>Total Revenue</TableCell>
                <TableCell>Actions</TableCell>
              </TableRow>
            </TableHead>
            <TableBody>
              {subscriptions.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={4} align="center" sx={{ py: 4 }}>
                    <Typography variant="body2" color="text.secondary">
                      No term billing subscriptions found
                    </Typography>
                  </TableCell>
                </TableRow>
              ) : (
                subscriptions.map((service) => (
                  <TableRow 
                    key={service.service_id} 
                    hover
                    sx={{
                      '&:hover': {
                        bgcolor: '#f5f6f8',
                      },
                      '& .MuiTableCell-root': {
                        borderBottom: '1px solid #e4e6eb',
                        py: 1.5,
                      },
                    }}
                  >
                    <TableCell>
                      <Box>
                        {service.service_id ? (
                          <Typography 
                            variant="body2" 
                            fontWeight="medium" 
                            sx={{ 
                              color: '#1877f2',
                              cursor: 'pointer',
                              '&:hover': {
                                textDecoration: 'underline',
                                color: '#166fe5',
                              },
                            }}
                            onClick={() => handleServiceClick(service)}
                          >
                            {service.service_name}
                          </Typography>
                        ) : (
                          <Typography variant="body2" fontWeight="medium">
                            {service.service_name}
                          </Typography>
                        )}
                        {service.term_name && (
                          <Typography variant="caption" color="text.secondary" display="block">
                            {service.term_name}
                          </Typography>
                        )}
                      </Box>
                    </TableCell>
                    <TableCell>
                      <Typography variant="body2">
                        {service.enrollment_count}
                      </Typography>
                    </TableCell>
                    <TableCell>
                      <Typography variant="body2" fontWeight="medium" color="success.main">
                        {formatCurrency(service.total_revenue)}
                      </Typography>
                    </TableCell>
                    <TableCell>
                      <Button
                        size="small"
                        variant="outlined"
                        onClick={() => handleServiceClick(service)}
                        sx={{
                          fontSize: '0.75rem',
                          minWidth: '100px',
                          padding: '4px 8px',
                          height: '28px',
                          textTransform: 'none',
                        }}
                      >
                        View Purchasers
                      </Button>
                    </TableCell>
                  </TableRow>
                ))
              )}
            </TableBody>
          </Table>
        </TableContainer>
        <Box sx={{
          borderTop: '1px solid #e4e6eb',
          bgcolor: '#f5f6f8',
          px: 2,
          py: 1.5,
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          flexWrap: 'wrap',
          gap: 2,
        }}>
          <Typography variant="body2" color="text.secondary">
            Showing {subscriptions.length === 0 ? 0 : pagination.offset + 1}-{Math.min(pagination.offset + pagination.limit, pagination.total)} of {pagination.total} services
          </Typography>
          <Box sx={{ display: 'flex', alignItems: 'center', gap: 2 }}>
            <TablePagination
              component="div"
              count={pagination.total}
              page={Math.floor(pagination.offset / pagination.limit)}
              onPageChange={handlePageChange}
              rowsPerPage={pagination.limit}
              onRowsPerPageChange={handleRowsPerPageChange}
              rowsPerPageOptions={[10, 25, 50, 100]}
            />
          </Box>
        </Box>
      </Card>

      {/* Service Detail Dialog */}
      <Dialog
        open={serviceDetailOpen}
        onClose={() => setServiceDetailOpen(false)}
        maxWidth="md"
        fullWidth
      >
        <DialogTitle>
          <Box display="flex" justifyContent="space-between" alignItems="center">
            <Box>
              <Typography variant="h6">
                {selectedService?.service_name || 'Service Details'}
              </Typography>
              {selectedService?.term_name && (
                <Typography variant="body2" color="text.secondary">
                  {selectedService.term_name}
                </Typography>
              )}
            </Box>
            <Button onClick={() => setServiceDetailOpen(false)}>Close</Button>
          </Box>
        </DialogTitle>
        <DialogContent>
          {loadingServiceDetail ? (
            <Box display="flex" justifyContent="center" p={4}>
              <CircularProgress />
            </Box>
          ) : (
            <Box>
              <Typography variant="subtitle2" sx={{ mb: 2, fontWeight: 600 }}>
                Term Billing Purchasers ({serviceEnrollments.length})
              </Typography>
              
              <TableContainer component={Paper} variant="outlined">
                <Table size="small">
                  <TableHead>
                    <TableRow>
                      <TableCell>Client</TableCell>
                      <TableCell>Email</TableCell>
                      <TableCell>Lessons</TableCell>
                      <TableCell>Original Amount</TableCell>
                      <TableCell>Discount</TableCell>
                      <TableCell align="right">Amount Paid</TableCell>
                    </TableRow>
                  </TableHead>
                  <TableBody>
                    {serviceEnrollments.length === 0 ? (
                      <TableRow>
                        <TableCell colSpan={6} align="center" sx={{ py: 2 }}>
                          <Typography variant="body2" color="text.secondary">
                            No enrollments found
                          </Typography>
                        </TableCell>
                      </TableRow>
                    ) : (
                      serviceEnrollments.map((enrollment, idx) => (
                        <TableRow key={enrollment.id || idx}>
                          <TableCell>
                            {enrollment.bookingData?.parentName ? (
                              <Link
                                href={`https://account.acmeops.com/clients/${enrollment.client_id}/`}
                                target="_blank"
                                rel="noopener noreferrer"
                                sx={{
                                  textDecoration: 'none',
                                  color: '#1877f2',
                                  '&:hover': {
                                    textDecoration: 'underline',
                                  },
                                }}
                              >
                                <Typography variant="body2" sx={{ color: '#1877f2' }}>
                                  {enrollment.bookingData.parentName}
                                </Typography>
                              </Link>
                            ) : (
                              <Typography variant="body2" fontFamily="monospace">
                                ID: {enrollment.client_id || '—'}
                              </Typography>
                            )}
                          </TableCell>
                          <TableCell>
                            <Typography variant="body2">
                              {enrollment.bookingData?.parentEmail || '—'}
                            </Typography>
                          </TableCell>
                          <TableCell>
                            <Typography variant="body2">
                              {enrollment.lessonsPaid || enrollment.total_lessons_remaining || 0}
                            </Typography>
                          </TableCell>
                          <TableCell>
                            <Typography variant="body2">
                              {enrollment.discountPercent > 0 ? formatCurrency(enrollment.originalAmount) : '—'}
                            </Typography>
                          </TableCell>
                          <TableCell>
                            {enrollment.discountPercent > 0 ? (
                              <Chip
                                label={`${enrollment.discountPercent}%`}
                                size="small"
                                color="success"
                              />
                            ) : (
                              <Typography variant="body2" color="text.secondary">
                                —
                              </Typography>
                            )}
                          </TableCell>
                          <TableCell align="right">
                            <Typography variant="body2" fontWeight="medium" color="success.main">
                              {formatCurrency(enrollment.amountPaid)}
                            </Typography>
                          </TableCell>
                        </TableRow>
                      ))
                    )}
                  </TableBody>
                </Table>
              </TableContainer>
              
              {serviceEnrollments.length > 0 && (
                <Box sx={{ mt: 3, p: 2, bgcolor: 'grey.50', borderRadius: 1 }}>
                  <Grid container spacing={2}>
                    <Grid item xs={6}>
                      <Typography variant="caption" color="text.secondary">
                        Total Enrollments
                      </Typography>
                      <Typography variant="h6">
                        {serviceEnrollments.length}
                      </Typography>
                    </Grid>
                    <Grid item xs={6}>
                      <Typography variant="caption" color="text.secondary">
                        Total Revenue
                      </Typography>
                      <Typography variant="h6" color="success.main">
                        {formatCurrency(
                          serviceEnrollments.reduce((sum, e) => sum + (e.amountPaid || 0), 0)
                        )}
                      </Typography>
                    </Grid>
                  </Grid>
                </Box>
              )}
            </Box>
          )}
        </DialogContent>
      </Dialog>
    </Box>
  );
}
