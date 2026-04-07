import React, { useState, useEffect } from 'react';
import { formatCurrency, formatDateTime } from '../../utils/formatters';
import {
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions,
  Button,
  Box,
  Typography,
  Paper,
  Divider,
  Chip,
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TableRow,
  CircularProgress,
  Alert,
  Accordion,
  AccordionSummary,
  AccordionDetails,
  Grid,
  Link
} from '@mui/material';
import {
  XMarkIcon,
  ExclamationCircleIcon,
  UserIcon,
  EnvelopeIcon,
  PhoneIcon,
  CurrencyDollarIcon,
  CreditCardIcon,
  AcademicCapIcon,
  CalendarDaysIcon,
  MapPinIcon,
  LinkIcon,
  ChevronDownIcon,
  ExclamationTriangleIcon,
  InformationCircleIcon
} from '@heroicons/react/24/outline';

/**
 * SubmissionDetailsModal - Comprehensive modal showing detailed submission failure information
 */
export default function SubmissionDetailsModal({
  open,
  onClose,
  submissionId,
  failureData = null
}) {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [details, setDetails] = useState(null);

  useEffect(() => {
    if (open && submissionId) {
      fetchSubmissionDetails();
    }
  }, [open, submissionId]);

  const fetchSubmissionDetails = async () => {
    if (!submissionId) return;
    
    setLoading(true);
    setError(null);
    try {
      const response = await fetch(`/api/devops/metrics/registration-failures/submission/${submissionId}`);
      if (!response.ok) {
        throw new Error(`Failed to fetch submission details: ${response.statusText}`);
      }
      const data = await response.json();
      setDetails(data);
    } catch (err) {
      console.error('Error fetching submission details:', err);
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  const getSeverityColor = (severity) => {
    switch (severity) {
      case 'critical': return 'error';
      case 'high': return 'error';
      case 'medium': return 'warning';
      case 'low': return 'info';
      default: return 'default';
    }
  };


  const formatDate = formatDateTime;

  if (!open) return null;

  return (
    <Dialog
      open={open}
      onClose={onClose}
      maxWidth="lg"
      fullWidth
      PaperProps={{
        sx: {
          borderRadius: 2,
          maxHeight: '90vh'
        }
      }}
    >
      <DialogTitle sx={{
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        borderBottom: '1px solid',
        borderColor: 'divider',
        pb: 2
      }}>
        <Box sx={{ display: 'flex', alignItems: 'center', gap: 2 }}>
          <ExclamationCircleIcon className="h-7 w-7 text-red-500" />
          <Box>
            <Typography variant="h6" sx={{ fontWeight: 600 }}>
              Registration Failure Details
            </Typography>
            <Typography variant="caption" color="text.secondary">
              Submission ID: {submissionId}
            </Typography>
          </Box>
        </Box>
        <Button
          onClick={onClose}
          sx={{ minWidth: 'auto', p: 1 }}
        >
          <XMarkIcon className="h-5 w-5" />
        </Button>
      </DialogTitle>

      <DialogContent sx={{ p: 3, overflowY: 'auto' }}>
        {loading ? (
          <Box sx={{ display: 'flex', justifyContent: 'center', alignItems: 'center', py: 8 }}>
            <CircularProgress />
            <Typography sx={{ ml: 2 }}>Loading submission details...</Typography>
          </Box>
        ) : error ? (
          <Alert severity="error" sx={{ mb: 2 }}>
            {error}
          </Alert>
        ) : details ? (
          <>
            {/* Failure Summary */}
            <Paper sx={{ p: 2, mb: 3, bgcolor: 'error.light', borderRadius: 1 }}>
              <Box sx={{ display: 'flex', alignItems: 'start', gap: 2 }}>
                <ExclamationCircleIcon className="h-5 w-5 text-red-500 mt-0.5" />
                <Box sx={{ flex: 1 }}>
                  <Typography variant="subtitle1" sx={{ fontWeight: 600, mb: 1 }}>
                    Failure Summary
                  </Typography>
                  <Typography variant="body2" component="div" sx={{ mb: 1 }}>
                    <strong>Step:</strong> <Chip label={details.failureStep || 'unknown'} size="small" color="error" sx={{ ml: 1 }} />
                  </Typography>
                  <Typography variant="body2" component="div" sx={{ mb: 1 }}>
                    <strong>Reason:</strong> {details.failureReason || 'Unknown error'}
                  </Typography>
                  <Typography variant="body2" component="div">
                    <strong>Created:</strong> {formatDate(details.submission.createdAt)}
                  </Typography>
                </Box>
              </Box>
            </Paper>

            {/* Parent Information */}
            <Accordion defaultExpanded>
              <AccordionSummary expandIcon={<ChevronDownIcon className="h-5 w-5" />}>
                <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                  <UserIcon className="h-5 w-5" />
                  <Typography variant="subtitle1" sx={{ fontWeight: 600 }}>
                    Parent Information
                  </Typography>
                </Box>
              </AccordionSummary>
              <AccordionDetails>
                <Grid container spacing={2}>
                  <Grid item xs={12} sm={6}>
                    <Typography variant="body2" color="text.secondary">Name</Typography>
                    <Typography variant="body1" sx={{ fontWeight: 500, mb: 2 }}>
                      {details.submission.parentFirst} {details.submission.parentLast}
                    </Typography>
                  </Grid>
                  <Grid item xs={12} sm={6}>
                    <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, mb: 2 }}>
                      <EnvelopeIcon className="h-5 w-5 text-neutral-500" />
                      <Typography variant="body2" color="text.secondary">Email</Typography>
                    </Box>
                    <Typography variant="body1" sx={{ fontWeight: 500 }}>
                      {details.submission.parentEmail || 'N/A'}
                    </Typography>
                  </Grid>
                  <Grid item xs={12} sm={6}>
                    <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, mb: 2 }}>
                      <PhoneIcon className="h-5 w-5 text-neutral-500" />
                      <Typography variant="body2" color="text.secondary">Phone</Typography>
                    </Box>
                    <Typography variant="body1" sx={{ fontWeight: 500 }}>
                      {details.submission.parentPhone || 'N/A'}
                    </Typography>
                  </Grid>
                  {details.submission.address && (
                    <Grid item xs={12} sm={6}>
                      <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, mb: 2 }}>
                        <MapPinIcon className="h-5 w-5 text-neutral-500" />
                        <Typography variant="body2" color="text.secondary">Address</Typography>
                      </Box>
                      <Typography variant="body1" sx={{ fontWeight: 500 }}>
                        {details.submission.address.street && `${details.submission.address.street}, `}
                        {details.submission.address.city && `${details.submission.address.city}, `}
                        {details.submission.address.state && details.submission.address.state}
                        {details.submission.address.zip && ` ${details.submission.address.zip}`}
                      </Typography>
                    </Grid>
                  )}
                </Grid>
              </AccordionDetails>
            </Accordion>

            {/* Submission Details */}
            <Accordion defaultExpanded>
              <AccordionSummary expandIcon={<ChevronDownIcon className="h-5 w-5" />}>
                <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                  <InformationCircleIcon className="h-5 w-5" />
                  <Typography variant="subtitle1" sx={{ fontWeight: 600 }}>
                    Submission Details
                  </Typography>
                </Box>
              </AccordionSummary>
              <AccordionDetails>
                <Grid container spacing={2}>
                  <Grid item xs={12} sm={6}>
                    <Typography variant="body2" color="text.secondary">Booking Type</Typography>
                    <Typography variant="body1" sx={{ fontWeight: 500, mb: 2 }}>
                      {details.submission.bookingType || 'N/A'}
                    </Typography>
                  </Grid>
                  <Grid item xs={12} sm={6}>
                    <Typography variant="body2" color="text.secondary">Status</Typography>
                    <Chip 
                      label={details.submission.status || 'unknown'} 
                      size="small" 
                      color={details.submission.status === 'completed' ? 'success' : 'error'}
                      sx={{ mb: 2 }}
                    />
                  </Grid>
                  <Grid item xs={12} sm={6}>
                    <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, mb: 1 }}>
                      <CurrencyDollarIcon className="h-5 w-5 text-neutral-500" />
                      <Typography variant="body2" color="text.secondary">Price</Typography>
                    </Box>
                    <Typography variant="body1" sx={{ fontWeight: 500, mb: 2 }}>
                      {formatCurrency(details.submission.actualPrice)} 
                      {details.submission.originalPrice !== details.submission.actualPrice && 
                        ` (Original: ${formatCurrency(details.submission.originalPrice)})`
                      }
                    </Typography>
                  </Grid>
                  <Grid item xs={12} sm={6}>
                    <Typography variant="body2" color="text.secondary">Payment Status</Typography>
                    <Chip 
                      label={details.submission.paymentStatus || 'N/A'} 
                      size="small" 
                      color={details.submission.paymentStatus === 'paid' ? 'success' : 'error'}
                      sx={{ mb: 2 }}
                    />
                  </Grid>
                  {details.submission.heardAbout && (
                    <Grid item xs={12}>
                      <Typography variant="body2" color="text.secondary">Heard About</Typography>
                      <Typography variant="body1" sx={{ fontWeight: 500 }}>
                        {details.submission.heardAbout}
                      </Typography>
                    </Grid>
                  )}
                  {details.submission.students && Array.isArray(details.submission.students) && details.submission.students.length > 0 && (
                    <Grid item xs={12}>
                      <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, mb: 1 }}>
                        <AcademicCapIcon className="h-5 w-5 text-neutral-500" />
                        <Typography variant="body2" color="text.secondary">Students ({details.submission.students.length})</Typography>
                      </Box>
                      {details.submission.students.map((student, idx) => (
                        <Typography key={idx} variant="body2" sx={{ mb: 0.5 }}>
                          • {student.firstName} {student.lastName} 
                          {student.age && `, Age: ${student.age}`}
                          {student.grade && `, Grade: ${student.grade}`}
                        </Typography>
                      ))}
                    </Grid>
                  )}
                  {details.submission.slots && Array.isArray(details.submission.slots) && details.submission.slots.length > 0 && (
                    <Grid item xs={12}>
                      <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, mb: 1 }}>
                        <CalendarDaysIcon className="h-5 w-5 text-neutral-500" />
                        <Typography variant="body2" color="text.secondary">Time Slots ({details.submission.slots.length})</Typography>
                      </Box>
                      {details.submission.slots.map((slot, idx) => (
                        <Typography key={idx} variant="body2" sx={{ mb: 0.5 }}>
                          • {slot.date || 'No date'} - {slot.dayOfWeek || 'N/A'}, {slot.start || 'N/A'} - {slot.end || 'N/A'}
                        </Typography>
                      ))}
                    </Grid>
                  )}
                </Grid>
              </AccordionDetails>
            </Accordion>

            {/* Payment Information */}
            {(details.submission.stripeSessionId || details.submission.stripeCustomerId || details.submission.creditRequestError) && (
              <Accordion>
                <AccordionSummary expandIcon={<ChevronDownIcon className="h-5 w-5" />}>
                  <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                    <CreditCardIcon className="h-5 w-5" />
                    <Typography variant="subtitle1" sx={{ fontWeight: 600 }}>
                      Payment Information
                    </Typography>
                    {details.submission.creditRequestError && (
                      <Chip label="Payment Error" size="small" color="error" sx={{ ml: 1 }} />
                    )}
                  </Box>
                </AccordionSummary>
                <AccordionDetails>
                  <Grid container spacing={2}>
                    {details.submission.stripeSessionId && (
                      <Grid item xs={12} sm={6}>
                        <Typography variant="body2" color="text.secondary">Stripe Session ID</Typography>
                        <Typography variant="body2" sx={{ fontFamily: 'monospace', mt: 0.5 }}>
                          {details.submission.stripeSessionId}
                        </Typography>
                      </Grid>
                    )}
                    {details.submission.stripeCustomerId && (
                      <Grid item xs={12} sm={6}>
                        <Typography variant="body2" color="text.secondary">Stripe Customer ID</Typography>
                        <Typography variant="body2" sx={{ fontFamily: 'monospace', mt: 0.5 }}>
                          {details.submission.stripeCustomerId}
                        </Typography>
                      </Grid>
                    )}
                    {details.submission.creditRequestError && (
                      <Grid item xs={12}>
                        <Alert severity="error" sx={{ mt: 1 }}>
                          <Box>
                            <Typography variant="subtitle2" component="div" sx={{ fontWeight: 600, mb: 0.5 }}>
                              Credit Request Error
                            </Typography>
                            <Typography variant="body2" component="div">
                              {details.submission.creditRequestErrorMessage || 'Unknown payment error'}
                            </Typography>
                          </Box>
                        </Alert>
                      </Grid>
                    )}
                    {details.stripePayments && details.stripePayments.length > 0 && (
                      <Grid item xs={12}>
                        <Typography variant="subtitle2" sx={{ fontWeight: 600, mb: 1 }}>
                          Related Stripe Payment Failures
                        </Typography>
                        {details.stripePayments.map((payment, idx) => (
                          <Alert key={idx} severity={getSeverityColor(payment.severity)} sx={{ mb: 1 }}>
                            <Box>
                              <Typography variant="body2" component="div" sx={{ fontWeight: 500 }}>
                                {payment.title}
                              </Typography>
                              <Typography variant="body2" component="div" sx={{ fontSize: '0.75rem', mt: 0.5 }}>
                                {payment.message}
                              </Typography>
                              {payment.context && (
                                <Box component="pre" sx={{ mt: 1, fontSize: '0.75rem', whiteSpace: 'pre-wrap', fontFamily: 'monospace' }}>
                                  {JSON.stringify(payment.context, null, 2)}
                                </Box>
                              )}
                            </Box>
                          </Alert>
                        ))}
                      </Grid>
                    )}
                  </Grid>
                </AccordionDetails>
              </Accordion>
            )}

            {/* Error Logs */}
            {details.errorLogs && details.errorLogs.length > 0 && (
              <Accordion>
                <AccordionSummary expandIcon={<ChevronDownIcon className="h-5 w-5" />}>
                  <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                    <ExclamationTriangleIcon className="h-5 w-5" />
                    <Typography variant="subtitle1" sx={{ fontWeight: 600 }}>
                      Error Logs ({details.errorLogs.length})
                    </Typography>
                  </Box>
                </AccordionSummary>
                <AccordionDetails>
                  <TableContainer>
                    <Table size="small">
                      <TableHead>
                        <TableRow>
                          <TableCell>Date</TableCell>
                          <TableCell>Type</TableCell>
                          <TableCell>Error Message</TableCell>
                          <TableCell>Status</TableCell>
                        </TableRow>
                      </TableHead>
                      <TableBody>
                        {details.errorLogs.map((log) => (
                          <TableRow key={log.id}>
                            <TableCell>{formatDate(log.createdAt)}</TableCell>
                            <TableCell>
                              <Chip label={log.errorType} size="small" />
                            </TableCell>
                            <TableCell>
                              <Typography variant="body2" component="div" sx={{ maxWidth: 400 }}>
                                {log.errorMessage}
                              </Typography>
                              {log.errorData && (
                                <Typography variant="caption" component="div" color="text.secondary" sx={{ display: 'block', mt: 0.5, fontFamily: 'monospace' }}>
                                  {JSON.stringify(log.errorData, null, 2)}
                                </Typography>
                              )}
                            </TableCell>
                            <TableCell>
                              <Chip 
                                label={log.resolved ? 'Resolved' : 'Open'} 
                                size="small" 
                                color={log.resolved ? 'success' : 'error'}
                              />
                            </TableCell>
                          </TableRow>
                        ))}
                      </TableBody>
                    </Table>
                  </TableContainer>
                </AccordionDetails>
              </Accordion>
            )}

            {/* Related Alerts */}
            {details.alerts && details.alerts.length > 0 && (
              <Accordion>
                <AccordionSummary expandIcon={<ChevronDownIcon className="h-5 w-5" />}>
                  <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                    <ExclamationCircleIcon className="h-5 w-5" />
                    <Typography variant="subtitle1" sx={{ fontWeight: 600 }}>
                      Related DevOps Alerts ({details.alerts.length})
                    </Typography>
                  </Box>
                </AccordionSummary>
                <AccordionDetails>
                  {details.alerts.map((alert, idx) => (
                    <Alert
                      key={idx}
                      severity={getSeverityColor(alert.severity)}
                      sx={{ mb: 2 }}
                      icon={<ExclamationCircleIcon className="h-5 w-5" />}
                    >
                      <Box>
                        <Typography variant="subtitle2" component="div" sx={{ fontWeight: 600, mb: 0.5 }}>
                          {alert.title}
                        </Typography>
                        <Typography variant="body2" component="div" sx={{ mb: 1 }}>
                          {alert.message}
                        </Typography>
                        <Box sx={{ display: 'flex', gap: 1, flexWrap: 'wrap', mt: 1 }}>
                          <Chip label={alert.severity} size="small" color={getSeverityColor(alert.severity)} />
                          <Chip label={alert.status || 'open'} size="small" />
                          <Typography variant="caption" component="span" color="text.secondary">
                            {formatDate(alert.createdAt)}
                          </Typography>
                        </Box>
                      </Box>
                    </Alert>
                  ))}
                </AccordionDetails>
              </Accordion>
            )}

            {/* Attribution */}
            {details.submission.utm && Object.keys(details.submission.utm).length > 0 && (
              <Accordion>
                <AccordionSummary expandIcon={<ChevronDownIcon className="h-5 w-5" />}>
                  <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                    <LinkIcon className="h-5 w-5" />
                    <Typography variant="subtitle1" sx={{ fontWeight: 600 }}>
                      Attribution & Tracking
                    </Typography>
                  </Box>
                </AccordionSummary>
                <AccordionDetails>
                  <Grid container spacing={2}>
                    {details.submission.utm.utm_source && (
                      <Grid item xs={12} sm={6}>
                        <Typography variant="body2" color="text.secondary">UTM Source</Typography>
                        <Typography variant="body1" sx={{ fontWeight: 500 }}>
                          {details.submission.utm.utm_source}
                        </Typography>
                      </Grid>
                    )}
                    {details.submission.utm.utm_campaign && (
                      <Grid item xs={12} sm={6}>
                        <Typography variant="body2" color="text.secondary">UTM Campaign</Typography>
                        <Typography variant="body1" sx={{ fontWeight: 500 }}>
                          {details.submission.utm.utm_campaign}
                        </Typography>
                      </Grid>
                    )}
                    {details.submission.landingUrl && (
                      <Grid item xs={12}>
                        <Typography variant="body2" color="text.secondary">Landing URL</Typography>
                        <Link href={details.submission.landingUrl} target="_blank" rel="noopener">
                          {details.submission.landingUrl}
                        </Link>
                      </Grid>
                    )}
                    {details.submission.referrer && (
                      <Grid item xs={12}>
                        <Typography variant="body2" color="text.secondary">Referrer</Typography>
                        <Typography variant="body1">{details.submission.referrer}</Typography>
                      </Grid>
                    )}
                  </Grid>
                </AccordionDetails>
              </Accordion>
            )}

            {/* TutorCruncher Integration */}
            {(details.submission.tcClientId || details.submission.tcServiceId) && (
              <Accordion>
                <AccordionSummary expandIcon={<ChevronDownIcon className="h-5 w-5" />}>
                  <Typography variant="subtitle1" sx={{ fontWeight: 600 }}>
                    TutorCruncher Integration
                  </Typography>
                </AccordionSummary>
                <AccordionDetails>
                  <Grid container spacing={2}>
                    {details.submission.tcClientId && (
                      <Grid item xs={12} sm={6}>
                        <Typography variant="body2" color="text.secondary">Client ID</Typography>
                        <Link 
                          href={`https://account.acmeops.com/cal/client/${details.submission.tcClientId}/`}
                          target="_blank"
                          rel="noopener"
                        >
                          {details.submission.tcClientId}
                        </Link>
                      </Grid>
                    )}
                    {details.submission.tcServiceId && (
                      <Grid item xs={12} sm={6}>
                        <Typography variant="body2" color="text.secondary">Service ID</Typography>
                        <Link 
                          href={`https://account.acmeops.com/cal/service/${details.submission.tcServiceId}/`}
                          target="_blank"
                          rel="noopener"
                        >
                          {details.submission.tcServiceId}
                        </Link>
                      </Grid>
                    )}
                  </Grid>
                </AccordionDetails>
              </Accordion>
            )}
          </>
        ) : null}
      </DialogContent>

      <DialogActions sx={{ px: 3, py: 2, borderTop: '1px solid', borderColor: 'divider' }}>
        {details?.submission?.id && (
          <Button
            variant="outlined"
            startIcon={<LinkIcon className="h-5 w-5" />}
            href={`/booking-forms/submissions?submissionId=${details.submission.id}`}
            target="_blank"
          >
            View Full Submission
          </Button>
        )}
        <Button onClick={onClose} variant="contained">
          Close
        </Button>
      </DialogActions>
    </Dialog>
  );
}

