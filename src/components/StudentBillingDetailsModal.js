import React, { useState, useEffect } from 'react';
import { formatCurrency, formatDate } from '../utils/formatters';
import {
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions,
  Button,
  Typography,
  Box,
  Chip,
  Divider,
  CircularProgress,
  Alert,
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TableRow,
  Paper,
  Grid,
} from '@mui/material';
import { XMarkIcon, ClockIcon, BuildingLibraryIcon, CreditCardIcon, CalendarDaysIcon } from '@heroicons/react/24/outline';
import { CheckCircleIcon } from '@heroicons/react/24/solid';
import axios from 'axios';

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

export default function StudentBillingDetailsModal({ open, onClose, studentId, serviceId, studentName, paymentMethod }) {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [billingData, setBillingData] = useState(null);

  useEffect(() => {
    if (open && studentId && serviceId) {
      fetchBillingDetails();
    } else {
      setBillingData(null);
      setError(null);
    }
  }, [open, studentId, serviceId]);

  const fetchBillingDetails = async () => {
    try {
      setLoading(true);
      setError(null);

      const response = await axios.get(`/api/subscriptions/student-billing/${studentId}/${serviceId}`, {
        withCredentials: true,
      });
      setBillingData(response.data);
    } catch (err) {
      console.error('Error fetching billing details:', err);
      setError(err.response?.data?.error || 'Failed to load billing details');
    } finally {
      setLoading(false);
    }
  };



  const formatDateTime = (dateString) => {
    if (!dateString) return 'N/A';
    const date = new Date(dateString);
    return date.toLocaleString('en-US', {
      month: 'short',
      day: 'numeric',
      year: 'numeric',
      hour: 'numeric',
      minute: '2-digit'
    });
  };

  const renderTermBillingDetails = () => {
    if (!billingData?.termBillingDetails) return null;

    const details = billingData.termBillingDetails;
    const enrollment = billingData.enrollment;
    const classDates = enrollment?.classDates || [];

    return (
      <Box>
        <Typography variant="h6" gutterBottom sx={{ fontWeight: 600, mb: 2 }}>
          Term Billing Details
        </Typography>

        <Grid container spacing={2} sx={{ mb: 3 }}>
          <Grid item xs={12} sm={6}>
            <Box sx={{ p: 2, bgcolor: 'grey.50', borderRadius: 2 }}>
              <Typography variant="body2" color="text.secondary">Total Paid</Typography>
              <Typography variant="h6" sx={{ fontWeight: 600, color: brandColors.green }}>
                {formatCurrency(details.totalPaid)}
              </Typography>
            </Box>
          </Grid>
          <Grid item xs={12} sm={6}>
            <Box sx={{ p: 2, bgcolor: 'grey.50', borderRadius: 2 }}>
              <Typography variant="body2" color="text.secondary">Remaining Balance</Typography>
              <Typography variant="h6" sx={{ fontWeight: 600, color: brandColors.purple }}>
                {formatCurrency(details.remainingBalance)}
              </Typography>
            </Box>
          </Grid>
          <Grid item xs={12} sm={6}>
            <Box sx={{ p: 2, bgcolor: 'grey.50', borderRadius: 2 }}>
              <Typography variant="body2" color="text.secondary">Lessons Paid For</Typography>
              <Typography variant="h6" sx={{ fontWeight: 600 }}>
                {details.lessonsPaidFor} of {details.totalLessons}
              </Typography>
            </Box>
          </Grid>
          <Grid item xs={12} sm={6}>
            <Box sx={{ p: 2, bgcolor: 'grey.50', borderRadius: 2 }}>
              <Typography variant="body2" color="text.secondary">Rate Per Lesson</Typography>
              <Typography variant="h6" sx={{ fontWeight: 600 }}>
                {formatCurrency(details.discountedRate)}
                {details.discountPercent > 0 && (
                  <Chip 
                    label={`${details.discountPercent}% discount`}
                    size="small"
                    sx={{ ml: 1, bgcolor: brandColors.orange, color: 'white', fontSize: '0.7rem' }}
                  />
                )}
              </Typography>
            </Box>
          </Grid>
        </Grid>

        {classDates.length > 0 && (
          <Box sx={{ mt: 3 }}>
            <Typography variant="subtitle1" gutterBottom sx={{ fontWeight: 600 }}>
              Lesson Schedule
            </Typography>
            <TableContainer component={Paper} variant="outlined" sx={{ maxHeight: 300 }}>
              <Table size="small" stickyHeader>
                <TableHead>
                  <TableRow>
                    <TableCell sx={{ fontWeight: 600 }}>Lesson #</TableCell>
                    <TableCell sx={{ fontWeight: 600 }}>Date</TableCell>
                    <TableCell align="center" sx={{ fontWeight: 600 }}>Status</TableCell>
                    <TableCell align="right" sx={{ fontWeight: 600 }}>Charge</TableCell>
                  </TableRow>
                </TableHead>
                <TableBody>
                  {classDates.map((date, index) => {
                    const lessonDate = new Date(date);
                    const isPast = lessonDate < new Date();
                    const isPaid = index < details.lessonsPaidFor;
                    const appointment = billingData.upcomingAppointments?.find(apt => {
                      const aptDate = new Date(apt.start).toISOString().split('T')[0];
                      return aptDate === date;
                    });

                    return (
                      <TableRow key={index}>
                        <TableCell>{index + 1}</TableCell>
                        <TableCell>{formatDate(date)}</TableCell>
                        <TableCell align="center">
                          {isPaid ? (
                            <Chip 
                              label="Paid" 
                              size="small" 
                              sx={{ bgcolor: brandColors.green, color: 'white', fontSize: '0.7rem' }}
                            />
                          ) : isPast ? (
                            <Chip 
                              label="Pending" 
                              size="small" 
                              sx={{ bgcolor: brandColors.orange, color: 'white', fontSize: '0.7rem' }}
                            />
                          ) : (
                            <Chip 
                              label="Upcoming" 
                              size="small" 
                              sx={{ bgcolor: brandColors.cyan, color: 'white', fontSize: '0.7rem' }}
                            />
                          )}
                        </TableCell>
                        <TableCell align="right">
                          {formatCurrency(details.discountedRate)}
                        </TableCell>
                      </TableRow>
                    );
                  })}
                </TableBody>
              </Table>
            </TableContainer>
          </Box>
        )}

        {billingData.billingHistory && billingData.billingHistory.length > 0 && (
          <Box sx={{ mt: 3 }}>
            <Typography variant="subtitle1" gutterBottom sx={{ fontWeight: 600 }}>
              Payment History
            </Typography>
            <TableContainer component={Paper} variant="outlined">
              <Table size="small">
                <TableHead>
                  <TableRow>
                    <TableCell sx={{ fontWeight: 600 }}>Date</TableCell>
                    <TableCell sx={{ fontWeight: 600 }}>Lessons</TableCell>
                    <TableCell align="right" sx={{ fontWeight: 600 }}>Amount</TableCell>
                    <TableCell align="center" sx={{ fontWeight: 600 }}>Status</TableCell>
                  </TableRow>
                </TableHead>
                <TableBody>
                  {billingData.billingHistory.map((payment, index) => (
                    <TableRow key={index}>
                      <TableCell>{formatDate(payment.billed_at)}</TableCell>
                      <TableCell>{payment.lessons_count}</TableCell>
                      <TableCell align="right">{formatCurrency(payment.amount_charged)}</TableCell>
                      <TableCell align="center">
                        <Chip 
                          label={payment.status === 'succeeded' ? 'Paid' : 'Pending'}
                          size="small"
                          sx={{ 
                            bgcolor: payment.status === 'succeeded' ? brandColors.green : brandColors.orange,
                            color: 'white',
                            fontSize: '0.7rem'
                          }}
                        />
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </TableContainer>
          </Box>
        )}
      </Box>
    );
  };

  const renderMonthlyBillingDetails = () => {
    if (!billingData?.monthlyBillingDetails) return null;

    const details = billingData.monthlyBillingDetails;

    return (
      <Box>
        <Typography variant="h6" gutterBottom sx={{ fontWeight: 600, mb: 2 }}>
          Monthly Billing Details
        </Typography>

        <Grid container spacing={2} sx={{ mb: 3 }}>
          <Grid item xs={12} sm={6}>
            <Box sx={{ p: 2, bgcolor: 'grey.50', borderRadius: 2 }}>
              <Typography variant="body2" color="text.secondary">Total Paid</Typography>
              <Typography variant="h6" sx={{ fontWeight: 600, color: brandColors.green }}>
                {formatCurrency(details.totalPaid)}
              </Typography>
            </Box>
          </Grid>
          <Grid item xs={12} sm={6}>
            <Box sx={{ p: 2, bgcolor: 'grey.50', borderRadius: 2 }}>
              <Typography variant="body2" color="text.secondary">Rate Per Lesson</Typography>
              <Typography variant="h6" sx={{ fontWeight: 600 }}>
                {formatCurrency(details.ratePerLesson)}
              </Typography>
            </Box>
          </Grid>
          {details.nextChargeDate && (
            <>
              <Grid item xs={12} sm={6}>
                <Box sx={{ p: 2, bgcolor: brandColors.light, borderRadius: 2, border: `2px solid ${brandColors.cyan}` }}>
                  <Typography variant="body2" color="text.secondary">Next Charge Date</Typography>
                  <Typography variant="h6" sx={{ fontWeight: 600, color: brandColors.navy }}>
                    {formatDate(details.nextChargeDate)}
                  </Typography>
                </Box>
              </Grid>
              <Grid item xs={12} sm={6}>
                <Box sx={{ p: 2, bgcolor: brandColors.light, borderRadius: 2, border: `2px solid ${brandColors.cyan}` }}>
                  <Typography variant="body2" color="text.secondary">Next Charge Amount</Typography>
                  <Typography variant="h6" sx={{ fontWeight: 600, color: brandColors.navy }}>
                    {formatCurrency(details.nextChargeAmount)}
                  </Typography>
                  <Typography variant="body2" color="text.secondary" sx={{ mt: 0.5 }}>
                    ({details.lessonsInNextCharge} lesson{details.lessonsInNextCharge !== 1 ? 's' : ''})
                  </Typography>
                </Box>
              </Grid>
            </>
          )}
        </Grid>

        {billingData.upcomingAppointments && billingData.upcomingAppointments.length > 0 && (
          <Box sx={{ mt: 3 }}>
            <Typography variant="subtitle1" gutterBottom sx={{ fontWeight: 600 }}>
              Upcoming Lessons
            </Typography>
            <TableContainer component={Paper} variant="outlined" sx={{ maxHeight: 300 }}>
              <Table size="small" stickyHeader>
                <TableHead>
                  <TableRow>
                    <TableCell sx={{ fontWeight: 600 }}>Date & Time</TableCell>
                    <TableCell align="right" sx={{ fontWeight: 600 }}>Charge</TableCell>
                    <TableCell align="center" sx={{ fontWeight: 600 }}>Status</TableCell>
                  </TableRow>
                </TableHead>
                <TableBody>
                  {billingData.upcomingAppointments.map((appointment) => (
                    <TableRow key={appointment.id}>
                      <TableCell>{formatDateTime(appointment.start)}</TableCell>
                      <TableCell align="right">
                        {formatCurrency(appointment.charge_rate || details.ratePerLesson)}
                      </TableCell>
                      <TableCell align="center">
                        <Chip 
                          label={appointment.status || 'Scheduled'}
                          size="small"
                          sx={{ 
                            bgcolor: appointment.status === 'complete' ? brandColors.green : brandColors.cyan,
                            color: 'white',
                            fontSize: '0.7rem'
                          }}
                        />
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </TableContainer>
          </Box>
        )}

        {billingData.billingHistory && billingData.billingHistory.length > 0 && (
          <Box sx={{ mt: 3 }}>
            <Typography variant="subtitle1" gutterBottom sx={{ fontWeight: 600 }}>
              Payment History
            </Typography>
            <TableContainer component={Paper} variant="outlined">
              <Table size="small">
                <TableHead>
                  <TableRow>
                    <TableCell sx={{ fontWeight: 600 }}>Date</TableCell>
                    <TableCell sx={{ fontWeight: 600 }}>Lessons</TableCell>
                    <TableCell align="right" sx={{ fontWeight: 600 }}>Amount</TableCell>
                    <TableCell align="center" sx={{ fontWeight: 600 }}>Status</TableCell>
                  </TableRow>
                </TableHead>
                <TableBody>
                  {billingData.billingHistory.map((payment, index) => (
                    <TableRow key={index}>
                      <TableCell>{formatDate(payment.billed_at)}</TableCell>
                      <TableCell>{payment.lessons_count}</TableCell>
                      <TableCell align="right">{formatCurrency(payment.amount_charged)}</TableCell>
                      <TableCell align="center">
                        <Chip 
                          label={payment.status === 'succeeded' ? 'Paid' : 'Pending'}
                          size="small"
                          sx={{ 
                            bgcolor: payment.status === 'succeeded' ? brandColors.green : brandColors.orange,
                            color: 'white',
                            fontSize: '0.7rem'
                          }}
                        />
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </TableContainer>
          </Box>
        )}
      </Box>
    );
  };

  const renderPerLessonDetails = () => {
    return (
      <Box>
        <Typography variant="h6" gutterBottom sx={{ fontWeight: 600, mb: 2 }}>
          Per Lesson Billing
        </Typography>

        {billingData?.clientInfo && (
          <Box sx={{ mb: 3 }}>
            <Grid container spacing={2}>
              <Grid item xs={12} sm={6}>
                <Box sx={{ p: 2, bgcolor: 'grey.50', borderRadius: 2 }}>
                  <Typography variant="body2" color="text.secondary">Current Balance</Typography>
                  <Typography variant="h6" sx={{ fontWeight: 600 }}>
                    {formatCurrency(billingData.clientInfo.balance)}
                  </Typography>
                </Box>
              </Grid>
              <Grid item xs={12} sm={6}>
                <Box sx={{ p: 2, bgcolor: 'grey.50', borderRadius: 2 }}>
                  <Typography variant="body2" color="text.secondary">Auto-Invoicing</Typography>
                  <Typography variant="h6" sx={{ fontWeight: 600 }}>
                    {billingData.clientInfo.auto_charge === 0 || billingData.clientInfo.auto_charge === 1 ? (
                      <Chip 
                        label="Enabled" 
                        size="small" 
                        sx={{ bgcolor: brandColors.green, color: 'white' }}
                      />
                    ) : (
                      <Chip 
                        label="Disabled" 
                        size="small" 
                        sx={{ bgcolor: brandColors.orange, color: 'white' }}
                      />
                    )}
                  </Typography>
                </Box>
              </Grid>
            </Grid>
          </Box>
        )}

        {billingData?.appointments && billingData.appointments.length > 0 ? (
          <Box>
            <Typography variant="subtitle1" gutterBottom sx={{ fontWeight: 600 }}>
              Enrolled Lessons
            </Typography>
            <TableContainer component={Paper} variant="outlined" sx={{ maxHeight: 400 }}>
              <Table size="small" stickyHeader>
                <TableHead>
                  <TableRow>
                    <TableCell sx={{ fontWeight: 600 }}>Date & Time</TableCell>
                    <TableCell align="right" sx={{ fontWeight: 600 }}>Charge Rate</TableCell>
                    <TableCell align="center" sx={{ fontWeight: 600 }}>Status</TableCell>
                  </TableRow>
                </TableHead>
                <TableBody>
                  {[...billingData.appointments]
                    .sort((a, b) => new Date(a.start) - new Date(b.start))
                    .map((appointment) => (
                    <TableRow key={appointment.id}>
                      <TableCell>{formatDateTime(appointment.start)}</TableCell>
                      <TableCell align="right">
                        {formatCurrency(appointment.charge_rate)}
                      </TableCell>
                      <TableCell align="center">
                        <Chip 
                          label={appointment.status || 'Scheduled'}
                          size="small"
                          sx={{ 
                            bgcolor: appointment.status === 'complete' ? brandColors.green : brandColors.cyan,
                            color: 'white',
                            fontSize: '0.7rem'
                          }}
                        />
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </TableContainer>
          </Box>
        ) : (
          <Alert severity="info">No upcoming lessons found for this student.</Alert>
        )}

        {billingData?.clientInfo && billingData.clientInfo.auto_charge !== 0 && billingData.clientInfo.auto_charge !== 1 && (
          <Alert severity="warning" sx={{ mt: 2 }}>
            Auto-invoicing is disabled for this client. Payments will need to be collected manually or invoices sent separately.
          </Alert>
        )}
      </Box>
    );
  };

  return (
    <Dialog 
      open={open} 
      onClose={onClose} 
      maxWidth="md" 
      fullWidth
      PaperProps={{
        sx: {
          borderRadius: '12px',
          maxHeight: '90vh'
        }
      }}
    >
      <DialogTitle sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', pb: 1 }}>
        <Box>
          <Typography variant="h6" sx={{ fontWeight: 600 }}>
            {studentName || `Student ${studentId}`}
          </Typography>
          <Typography variant="body2" color="text.secondary">
            Billing Details
          </Typography>
        </Box>
        <Button onClick={onClose} sx={{ minWidth: 'auto', p: 1 }}>
          <XMarkIcon className="h-5 w-5" />
        </Button>
      </DialogTitle>

      <DialogContent dividers>
        {loading && (
          <Box sx={{ display: 'flex', justifyContent: 'center', alignItems: 'center', minHeight: 200 }}>
            <CircularProgress />
          </Box>
        )}

        {error && (
          <Alert severity="error" sx={{ mb: 2 }}>
            {error}
          </Alert>
        )}

        {!loading && !error && billingData && (
          <Box>
            {billingData.paymentType === 'term' && renderTermBillingDetails()}
            {billingData.paymentType === 'monthly' && renderMonthlyBillingDetails()}
            {billingData.paymentType === 'per_lesson' && renderPerLessonDetails()}
          </Box>
        )}
      </DialogContent>

      <DialogActions sx={{ p: 2 }}>
        <Button onClick={onClose} variant="contained" sx={{ bgcolor: brandColors.purple }}>
          Close
        </Button>
      </DialogActions>
    </Dialog>
  );
}
