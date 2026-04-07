/**
 * SchoolBilling Component — Simplified billing dashboard
 * Health bar + search/filters + enrollment table with expandable row detail
 */

import React, { useState, useEffect, useMemo, useCallback } from 'react';
import { useLocation } from 'react-router-dom';
import axios from 'axios';
import { formatCurrency, formatDate } from '../utils/formatters';
import {
  Box,
  Card,
  CardContent,
  Typography,
  TextField,
  Chip,
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TableRow,
  IconButton,
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions,
  Button,
  Alert,
  CircularProgress,
  Tooltip,
  Collapse,
  FormControl,
  InputLabel,
  Select,
  MenuItem,
} from '@mui/material';
import {
  MagnifyingGlassIcon as Search,
  ArrowPathIcon as Refresh,
  CheckCircleIcon as CheckCircle,
  ExclamationTriangleIcon as Warning,
  ExclamationCircleIcon as ErrorIcon,
  CurrencyDollarIcon as AttachMoney,
  ChevronDownIcon as ExpandMore,
  ChevronUpIcon as ExpandLess,
  ArrowUturnLeftIcon as Replay,
  PlusIcon as AddIcon,
  CreditCardIcon as CreditCard,
  XMarkIcon as CloseIcon,
} from '@heroicons/react/24/outline';

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

const getAuthenticatedAxios = () => {
  return axios.create({
    withCredentials: true,
  });
};

export default function SchoolBilling() {
  const location = useLocation();
  const isOperationsHubRoute = location.pathname.startsWith('/schools/');

  // Data
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [subscriptions, setSubscriptions] = useState([]);
  const [billingOverview, setBillingOverview] = useState(null);
  const [reconciliationData, setReconciliationData] = useState([]);
  const [failedPaymentsData, setFailedPaymentsData] = useState([]);

  // Filters
  const [searchQuery, setSearchQuery] = useState('');
  const [statusFilter, setStatusFilter] = useState('all');

  // UI
  const [expandedRowId, setExpandedRowId] = useState(null);
  const [createCreditLoading, setCreateCreditLoading] = useState(null);
  const [markResolvedLoading, setMarkResolvedLoading] = useState(null);
  const [retryLoading, setRetryLoading] = useState(null);

  // Dialogs
  const [cancelDialog, setCancelDialog] = useState(null);
  const [cancelLoading, setCancelLoading] = useState(false);
  const [retryDialog, setRetryDialog] = useState(null);

  // Load all data on mount
  useEffect(() => {
    loadAllData();
  }, []);

  const loadAllData = async () => {
    try {
      setLoading(true);
      setError(null);
      const api = getAuthenticatedAxios();

      const [overviewRes, subsRes, reconcileRes, failedRes] = await Promise.all([
        api.get('/api/billing/overview').catch(() => ({ data: null })),
        api.get('/api/subscriptions?limit=1000').catch(() => ({ data: { subscriptions: [] } })),
        api.get('/api/billing/reconciliation').catch(() => ({ data: { reconciliation: [], summary: null } })),
        api.get('/api/billing/failed-payments').catch(() => ({ data: { failedPayments: [] } })),
      ]);

      if (overviewRes.data) setBillingOverview(overviewRes.data);
      setSubscriptions(subsRes.data.subscriptions || []);
      setReconciliationData(reconcileRes.data.reconciliation || []);
      setFailedPaymentsData(failedRes.data.failedPayments || []);
    } catch (err) {
      if (err.response?.status === 401) {
        setError('Authentication required. Please log in again.');
        localStorage.removeItem('token');
        localStorage.removeItem('user');
        setTimeout(() => { window.location.href = '/login'; }, 2000);
        return;
      }
      setError('Failed to load billing data');
    } finally {
      setLoading(false);
    }
  };

  // Build a lookup of reconciliation data keyed by billingHistoryId
  const reconByHistoryId = useMemo(() => {
    const map = {};
    for (const r of reconciliationData) {
      map[r.billingHistoryId] = r;
    }
    return map;
  }, [reconciliationData]);

  // Build a set of enrollment IDs with failed payments
  const failedEnrollmentIds = useMemo(() => {
    const set = new Set();
    for (const f of failedPaymentsData) {
      set.add(f.enrollmentId);
    }
    return set;
  }, [failedPaymentsData]);

  // Determine issue status for each subscription
  const getEnrollmentIssues = useCallback((sub) => {
    const issues = [];
    if (sub.status === 'failed' || failedEnrollmentIds.has(sub.id)) {
      issues.push('failed_payment');
    }
    // Check billing history for missing TC credits
    const history = sub.billingHistory || [];
    for (const h of history) {
      if (h.status === 'succeeded') {
        const recon = reconByHistoryId[h.id];
        if (recon && !recon.hasCreditRequest) {
          issues.push('missing_credit');
          break;
        }
        // Also check metadata for creditRequestId
        const meta = typeof h.metadata === 'string' ? JSON.parse(h.metadata || '{}') : (h.metadata || {});
        if (!meta.creditRequestId && !meta.creditRequestIds) {
          issues.push('missing_credit');
          break;
        }
      }
    }
    return issues;
  }, [failedEnrollmentIds, reconByHistoryId]);

  // Filter and sort subscriptions
  const filteredSubscriptions = useMemo(() => {
    let filtered = subscriptions;

    // Search
    if (searchQuery) {
      const q = searchQuery.toLowerCase();
      filtered = filtered.filter(s =>
        (s.client_name || '').toLowerCase().includes(q) ||
        (s.service_name || '').toLowerCase().includes(q)
      );
    }

    // Status filter
    if (statusFilter === 'active') {
      filtered = filtered.filter(s => s.status === 'active');
    } else if (statusFilter === 'issues') {
      filtered = filtered.filter(s => getEnrollmentIssues(s).length > 0);
    } else if (statusFilter === 'cancelled') {
      filtered = filtered.filter(s => s.status === 'cancelled');
    }

    // Sort: issues first, then by enrollment date descending
    filtered = [...filtered].sort((a, b) => {
      const aIssues = getEnrollmentIssues(a).length;
      const bIssues = getEnrollmentIssues(b).length;
      if (aIssues !== bIssues) return bIssues - aIssues;
      return new Date(b.enrollment_date || 0) - new Date(a.enrollment_date || 0);
    });

    return filtered;
  }, [subscriptions, searchQuery, statusFilter, getEnrollmentIssues]);

  // Computed health stats
  const healthStats = useMemo(() => {
    const activeCount = billingOverview?.totalActiveSubscriptions ?? subscriptions.filter(s => s.status === 'active').length;
    const failedCount = billingOverview?.failedPayments ?? failedPaymentsData.length;
    const missingCredits = reconciliationData.filter(r => r.status === 'succeeded' && !r.hasCreditRequest).length;
    const collectedThisMonth = billingOverview?.totals?.creditedThisMonth ?? 0;
    const hasIssues = failedCount > 0 || missingCredits > 0;

    return { activeCount, failedCount, missingCredits, collectedThisMonth, hasIssues };
  }, [billingOverview, subscriptions, failedPaymentsData, reconciliationData]);

  // --- Action Handlers ---

  const handleCreateMissingCredit = async (billingHistoryId) => {
    try {
      setCreateCreditLoading(billingHistoryId);
      const api = getAuthenticatedAxios();
      await api.post(`/api/billing/create-missing-credit/${billingHistoryId}`);
      // Reload reconciliation
      const res = await api.get('/api/billing/reconciliation');
      setReconciliationData(res.data.reconciliation || []);
    } catch (err) {
      setError(err.response?.data?.error || 'Failed to create credit request');
    } finally {
      setCreateCreditLoading(null);
    }
  };

  const handleMarkResolved = async (billingHistoryId) => {
    try {
      setMarkResolvedLoading(billingHistoryId);
      const api = getAuthenticatedAxios();
      await api.post(`/api/billing/mark-failure-resolved/${billingHistoryId}`, {
        resolution: 'Manually resolved',
        notes: 'Marked resolved from billing dashboard',
      });
      // Reload failed + overview
      const [failedRes, overviewRes] = await Promise.all([
        api.get('/api/billing/failed-payments'),
        api.get('/api/billing/overview'),
      ]);
      setFailedPaymentsData(failedRes.data.failedPayments || []);
      if (overviewRes.data) setBillingOverview(overviewRes.data);
    } catch (err) {
      setError(err.response?.data?.error || 'Failed to mark as resolved');
    } finally {
      setMarkResolvedLoading(null);
    }
  };

  const handleRetryPayment = async (enrollmentId) => {
    try {
      setRetryLoading(enrollmentId);
      const api = getAuthenticatedAxios();
      await api.post(`/api/subscriptions/retry-payment/${enrollmentId}`);
      setRetryDialog(null);
      await loadAllData();
    } catch (err) {
      setError(err.response?.data?.error || 'Failed to retry payment');
    } finally {
      setRetryLoading(null);
    }
  };

  const handleCancelSubscription = async (enrollmentId) => {
    try {
      setCancelLoading(true);
      const api = getAuthenticatedAxios();
      await api.post(`/api/subscriptions/cancel/${enrollmentId}`);
      setCancelDialog(null);
      await loadAllData();
    } catch (err) {
      setError(err.response?.data?.error || 'Failed to cancel subscription');
    } finally {
      setCancelLoading(false);
    }
  };

  // --- Rendering Helpers ---

  const getVerificationStatus = (sub) => {
    const history = sub.billingHistory || [];
    if (history.length === 0) return { stripe: null, tc: null };

    const latest = history[0]; // Most recent
    if (!latest) return { stripe: null, tc: null };

    const stripeOk = latest.status === 'succeeded' && latest.stripe_invoice_id;
    const meta = typeof latest.metadata === 'string' ? JSON.parse(latest.metadata || '{}') : (latest.metadata || {});
    const tcOk = !!(meta.creditRequestId || meta.creditRequestIds);

    // Also check reconciliation data
    const recon = reconByHistoryId[latest.id];
    const tcFromRecon = recon?.hasCreditRequest;

    return {
      stripe: latest.status === 'failed' ? false : (stripeOk ? true : null),
      tc: tcOk || tcFromRecon ? true : (stripeOk && !tcOk && !tcFromRecon ? false : null),
    };
  };

  const renderVerificationIcons = (sub) => {
    const v = getVerificationStatus(sub);

    if (v.stripe === true && v.tc === true) {
      return (
        <Tooltip title="Stripe paid, TC credit applied">
          <span className="flex items-center gap-0.5 text-xs font-medium" style={{ color: brandColors.green }}>
            <CheckCircle className="h-3.5 w-3.5" />S
            <CheckCircle className="h-3.5 w-3.5 ml-1" />TC
          </span>
        </Tooltip>
      );
    }
    if (v.stripe === true && v.tc === false) {
      return (
        <Tooltip title="Stripe paid, TC credit missing">
          <span className="flex items-center gap-0.5 text-xs font-medium">
            <CheckCircle className="h-3.5 w-3.5" style={{ color: brandColors.green }} />
            <span style={{ color: brandColors.green }}>S</span>
            <Warning className="h-3.5 w-3.5 ml-1" style={{ color: brandColors.orange }} />
            <span style={{ color: brandColors.orange }}>TC</span>
          </span>
        </Tooltip>
      );
    }
    if (v.stripe === false) {
      return (
        <Tooltip title="Payment failed">
          <span className="flex items-center gap-0.5 text-xs font-medium" style={{ color: brandColors.pink }}>
            <ErrorIcon className="h-3.5 w-3.5" /> Failed
          </span>
        </Tooltip>
      );
    }
    return (
      <span className="text-xs text-neutral-400">--</span>
    );
  };

  const getNextCharge = (sub) => {
    if (sub.payment_type === 'term') {
      return { label: 'Paid in Full', amount: null };
    }
    // For monthly: estimate from billing history
    const history = sub.billingHistory || [];
    if (history.length > 0) {
      const latest = history[0];
      const lastDate = new Date(latest.billing_month || latest.created_at);
      const nextDate = new Date(lastDate);
      nextDate.setMonth(nextDate.getMonth() + 1);
      return {
        label: formatDate(nextDate),
        amount: parseFloat(latest.amount_charged) || null,
      };
    }
    return { label: 'N/A', amount: null };
  };

  // --- Expanded Row Detail ---

  const renderExpandedDetail = (sub) => {
    const history = sub.billingHistory || [];
    const failedForSub = failedPaymentsData.filter(f => f.enrollmentId === sub.id);

    return (
      <Box sx={{ p: 3, bgcolor: '#fafbfc' }}>
        <Typography variant="subtitle2" fontWeight="bold" sx={{ mb: 2 }}>
          Billing Timeline
        </Typography>

        {history.length === 0 && failedForSub.length === 0 && (
          <Typography variant="body2" color="text.secondary" sx={{ py: 2 }}>
            No billing history available.
          </Typography>
        )}

        {/* Failed payment alerts for this enrollment */}
        {failedForSub.map((fp) => (
          <Box
            key={`failed-${fp.billingHistoryId}`}
            sx={{
              mb: 2,
              p: 2,
              border: `2px solid ${brandColors.pink}`,
              borderRadius: 1.5,
              bgcolor: '#FFF5F5',
            }}
          >
            <Box className="flex items-center justify-between flex-wrap gap-2">
              <Box>
                <Typography variant="body2" fontWeight="bold" color="error">
                  Failed Payment — {formatDate(fp.billingMonth)}
                </Typography>
                <Typography variant="caption" color="text.secondary">
                  {fp.failureReason} {fp.stripeErrorCode ? `(${fp.stripeErrorCode})` : ''}
                  {' | '}Attempt #{(fp.retryAttempt || 0) + 1}
                </Typography>
              </Box>
              <Box className="flex gap-2">
                <Button
                  size="small"
                  variant="contained"
                  color="primary"
                  onClick={() => setRetryDialog({ id: sub.id, ...fp })}
                  startIcon={<Replay className="h-4 w-4" />}
                  sx={{ textTransform: 'none' }}
                >
                  Retry
                </Button>
                <Button
                  size="small"
                  variant="outlined"
                  onClick={() => handleMarkResolved(fp.billingHistoryId)}
                  disabled={markResolvedLoading === fp.billingHistoryId}
                  sx={{ textTransform: 'none' }}
                >
                  {markResolvedLoading === fp.billingHistoryId ? <CircularProgress size={14} /> : 'Resolve'}
                </Button>
              </Box>
            </Box>
            <Typography variant="body2" fontWeight="medium" color="error" sx={{ mt: 1 }}>
              Amount: {formatCurrency(fp.amountDue)} — {fp.lessonsCount} lesson{fp.lessonsCount !== 1 ? 's' : ''}
            </Typography>
          </Box>
        ))}

        {/* Billing history entries */}
        {history.map((h, idx) => {
          const meta = typeof h.metadata === 'string' ? JSON.parse(h.metadata || '{}') : (h.metadata || {});
          const recon = reconByHistoryId[h.id];
          const hasTcCredit = !!(meta.creditRequestId || meta.creditRequestIds || recon?.hasCreditRequest);
          const creditId = meta.creditRequestId || (meta.creditRequestIds ? meta.creditRequestIds[0] : null) || recon?.creditRequestId;
          const stripeOk = h.status === 'succeeded';
          const stripeFailed = h.status === 'failed';
          const amountMatch = recon ? Math.abs(parseFloat(recon.amountCharged || 0) - parseFloat(h.amount_charged || 0)) < 0.01 : null;

          return (
            <Box
              key={h.id || idx}
              sx={{
                mb: 2,
                p: 2,
                border: '1px solid #e4e6eb',
                borderRadius: 1.5,
                bgcolor: 'white',
                borderLeft: stripeFailed
                  ? `4px solid ${brandColors.pink}`
                  : (!hasTcCredit && stripeOk)
                    ? `4px solid ${brandColors.orange}`
                    : `4px solid ${brandColors.green}`,
              }}
            >
              {/* Period header */}
              <Box className="flex items-center justify-between flex-wrap gap-2 mb-2">
                <Typography variant="body2" fontWeight="bold">
                  {formatDate(h.billing_month)} — {h.lessons_count || '?'} lesson{(h.lessons_count || 0) !== 1 ? 's' : ''} @ {formatCurrency(sub.rate_per_lesson || 0)}/ea = {formatCurrency(h.amount_charged)}
                </Typography>
                <Chip
                  label={h.status}
                  size="small"
                  color={stripeOk ? 'success' : stripeFailed ? 'error' : 'default'}
                />
              </Box>

              {/* Stripe line */}
              <Box className="flex items-center gap-2 text-sm mb-1" style={{ color: stripeOk ? brandColors.green : (stripeFailed ? brandColors.pink : '#666') }}>
                <CreditCard className="h-4 w-4 flex-shrink-0" />
                <span className="font-medium">Stripe:</span>
                <span>{formatCurrency(h.amount_charged)}</span>
                {h.stripe_invoice_id && (
                  <span className="text-xs text-neutral-500">
                    Inv: {h.stripe_invoice_id.substring(0, 20)}...
                  </span>
                )}
                {stripeOk && <CheckCircle className="h-4 w-4" style={{ color: brandColors.green }} />}
                {stripeFailed && <ErrorIcon className="h-4 w-4" style={{ color: brandColors.pink }} />}
              </Box>

              {/* TC Credit line */}
              <Box className="flex items-center gap-2 text-sm mb-1" style={{ color: hasTcCredit ? brandColors.green : brandColors.orange }}>
                <AttachMoney className="h-4 w-4 flex-shrink-0" />
                <span className="font-medium">TC Credit:</span>
                {hasTcCredit ? (
                  <>
                    <a
                      href={`https://account.acmeops.com/cal/proforma-invoice/${creditId}/`}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="underline"
                      style={{ color: brandColors.purple }}
                    >
                      PFI-{creditId}
                    </a>
                    <CheckCircle className="h-4 w-4" style={{ color: brandColors.green }} />
                  </>
                ) : stripeOk ? (
                  <>
                    <span style={{ color: brandColors.orange }}>Missing</span>
                    <Warning className="h-4 w-4" style={{ color: brandColors.orange }} />
                    <Button
                      size="small"
                      variant="outlined"
                      color="warning"
                      onClick={() => handleCreateMissingCredit(h.id)}
                      disabled={createCreditLoading === h.id}
                      startIcon={createCreditLoading === h.id ? <CircularProgress size={12} /> : <AddIcon className="h-3.5 w-3.5" />}
                      sx={{ ml: 1, textTransform: 'none', py: 0, minHeight: 24, fontSize: '0.75rem' }}
                    >
                      Create Credit
                    </Button>
                  </>
                ) : (
                  <span className="text-neutral-400">N/A</span>
                )}
              </Box>

              {/* Match line */}
              {stripeOk && amountMatch !== null && (
                <Box className="flex items-center gap-2 text-xs mt-1" style={{ color: amountMatch ? brandColors.green : brandColors.orange }}>
                  {amountMatch ? (
                    <><CheckCircle className="h-3.5 w-3.5" /> Stripe amount = TC credit amount</>
                  ) : (
                    <><Warning className="h-3.5 w-3.5" /> Amount mismatch</>
                  )}
                </Box>
              )}
            </Box>
          );
        })}

        {/* Cancel button */}
        {sub.status === 'active' && (
          <Box className="flex justify-end mt-3">
            <Button
              size="small"
              variant="outlined"
              color="error"
              onClick={() => setCancelDialog(sub)}
              sx={{ textTransform: 'none' }}
            >
              Cancel Enrollment
            </Button>
          </Box>
        )}
      </Box>
    );
  };

  // --- Main Render ---

  if (loading && subscriptions.length === 0) {
    return (
      <Box display="flex" justifyContent="center" alignItems="center" minHeight="400px">
        <CircularProgress />
      </Box>
    );
  }

  return (
    <Box sx={{ bgcolor: '#f5f6f8', minHeight: '100vh', p: { xs: 2, sm: 3 } }}>
      {/* Header */}
      {!isOperationsHubRoute && (
        <Box sx={{ mb: 3 }}>
          <Typography variant="h4" component="h1" fontWeight="bold" sx={{ color: '#1c1e21' }}>
            Billing Dashboard
          </Typography>
        </Box>
      )}

      {/* Error Alert */}
      {error && (
        <Alert severity="error" sx={{ mb: 2 }} onClose={() => setError(null)}>
          {error}
        </Alert>
      )}

      {/* 1. Health Status Bar */}
      <Card
        sx={{
          mb: 3,
          borderRadius: 2,
          boxShadow: '0 1px 3px rgba(0,0,0,0.1)',
          border: `1px solid ${healthStats.hasIssues ? brandColors.pink : brandColors.green}`,
          bgcolor: healthStats.hasIssues ? '#FFF9F9' : '#F6FFF8',
        }}
      >
        <CardContent sx={{ py: 1.5, px: 3, '&:last-child': { pb: 1.5 } }}>
          <Box
            className="flex items-center justify-between flex-wrap gap-3"
            sx={{ minHeight: 40 }}
          >
            {/* Active Enrollments */}
            <Box className="flex items-center gap-2">
              <CheckCircle className="h-5 w-5" style={{ color: brandColors.green }} />
              <Typography variant="body2" fontWeight="medium">
                <span style={{ fontWeight: 700, fontSize: '1.1rem', color: brandColors.green }}>
                  {healthStats.activeCount}
                </span>{' '}
                Active Enrollments
              </Typography>
            </Box>

            <Box sx={{ width: '1px', height: 24, bgcolor: '#ddd', display: { xs: 'none', sm: 'block' } }} />

            {/* Failed Payments */}
            <Box className="flex items-center gap-2">
              {healthStats.failedCount > 0 ? (
                <ErrorIcon className="h-5 w-5" style={{ color: brandColors.pink }} />
              ) : (
                <CheckCircle className="h-5 w-5" style={{ color: brandColors.green }} />
              )}
              <Typography variant="body2" fontWeight="medium">
                <span
                  style={{
                    fontWeight: 700,
                    fontSize: '1.1rem',
                    color: healthStats.failedCount > 0 ? brandColors.pink : brandColors.green,
                  }}
                >
                  {healthStats.failedCount}
                </span>{' '}
                Failed Payments
              </Typography>
            </Box>

            <Box sx={{ width: '1px', height: 24, bgcolor: '#ddd', display: { xs: 'none', sm: 'block' } }} />

            {/* Missing Credits */}
            <Box className="flex items-center gap-2">
              {healthStats.missingCredits > 0 ? (
                <Warning className="h-5 w-5" style={{ color: brandColors.orange }} />
              ) : (
                <CheckCircle className="h-5 w-5" style={{ color: brandColors.green }} />
              )}
              <Typography variant="body2" fontWeight="medium">
                <span
                  style={{
                    fontWeight: 700,
                    fontSize: '1.1rem',
                    color: healthStats.missingCredits > 0 ? brandColors.orange : brandColors.green,
                  }}
                >
                  {healthStats.missingCredits}
                </span>{' '}
                Missing Credits
              </Typography>
            </Box>

            <Box sx={{ width: '1px', height: 24, bgcolor: '#ddd', display: { xs: 'none', sm: 'block' } }} />

            {/* Collected This Month */}
            <Box className="flex items-center gap-2">
              <AttachMoney className="h-5 w-5" style={{ color: brandColors.purple }} />
              <Typography variant="body2" fontWeight="medium">
                <span style={{ fontWeight: 700, fontSize: '1.1rem', color: brandColors.purple }}>
                  {formatCurrency(healthStats.collectedThisMonth)}
                </span>{' '}
                this month
              </Typography>
            </Box>

            {/* Refresh */}
            <Tooltip title="Refresh data">
              <IconButton size="small" onClick={loadAllData} disabled={loading}>
                <Refresh className={`h-4 w-4 ${loading ? 'animate-spin' : ''}`} />
              </IconButton>
            </Tooltip>
          </Box>
        </CardContent>
      </Card>

      {/* 2. Search + Filters */}
      <Box className="flex items-center gap-3 flex-wrap mb-3">
        <TextField
          size="small"
          placeholder="Search by parent or service name..."
          value={searchQuery}
          onChange={(e) => setSearchQuery(e.target.value)}
          InputProps={{
            startAdornment: <Search className="h-4 w-4 text-neutral-400 mr-1" />,
          }}
          sx={{ minWidth: 280, flex: '1 1 280px', maxWidth: 400 }}
        />
        <FormControl size="small" sx={{ minWidth: 140 }}>
          <InputLabel>Status</InputLabel>
          <Select
            value={statusFilter}
            onChange={(e) => setStatusFilter(e.target.value)}
            label="Status"
          >
            <MenuItem value="all">All ({subscriptions.length})</MenuItem>
            <MenuItem value="active">Active</MenuItem>
            <MenuItem value="issues">
              Issues {healthStats.failedCount + healthStats.missingCredits > 0
                ? `(${healthStats.failedCount + healthStats.missingCredits})`
                : ''}
            </MenuItem>
            <MenuItem value="cancelled">Cancelled</MenuItem>
          </Select>
        </FormControl>
        <Typography variant="caption" color="text.secondary">
          {filteredSubscriptions.length} enrollment{filteredSubscriptions.length !== 1 ? 's' : ''}
        </Typography>
      </Box>

      {/* 3. Enrollment Table */}
      <Card
        sx={{
          borderRadius: 2,
          boxShadow: '0 1px 3px rgba(0,0,0,0.1)',
          border: '1px solid #e4e6eb',
          bgcolor: 'white',
          overflow: 'hidden',
        }}
      >
        {/* Desktop table */}
        <Box sx={{ display: { xs: 'none', md: 'block' } }}>
          <TableContainer>
            <Table size="small">
              <TableHead>
                <TableRow sx={{ bgcolor: '#f5f6f8' }}>
                  <TableCell width={40} />
                  <TableCell>Parent</TableCell>
                  <TableCell>Service</TableCell>
                  <TableCell align="center">Type</TableCell>
                  <TableCell align="right">Rate</TableCell>
                  <TableCell align="center">Status</TableCell>
                  <TableCell align="center">Last Payment</TableCell>
                  <TableCell align="right">Next Charge</TableCell>
                </TableRow>
              </TableHead>
              <TableBody>
                {filteredSubscriptions.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={8} align="center" sx={{ py: 6 }}>
                      <Typography variant="body2" color="text.secondary">
                        {searchQuery || statusFilter !== 'all' ? 'No enrollments match your filters.' : 'No enrollments found.'}
                      </Typography>
                    </TableCell>
                  </TableRow>
                ) : (
                  filteredSubscriptions.map((sub) => {
                    const issues = getEnrollmentIssues(sub);
                    const hasIssues = issues.length > 0;
                    const isExpanded = expandedRowId === sub.id;
                    const nextCharge = getNextCharge(sub);

                    return (
                      <React.Fragment key={sub.id}>
                        <TableRow
                          hover
                          onClick={() => setExpandedRowId(isExpanded ? null : sub.id)}
                          sx={{
                            cursor: 'pointer',
                            borderLeft: hasIssues
                              ? `4px solid ${issues.includes('failed_payment') ? brandColors.pink : brandColors.orange}`
                              : '4px solid transparent',
                            '&:hover': { bgcolor: '#f9fafb' },
                          }}
                        >
                          <TableCell sx={{ pl: 1, pr: 0 }}>
                            <IconButton size="small">
                              {isExpanded
                                ? <ExpandLess className="h-4 w-4" />
                                : <ExpandMore className="h-4 w-4" />}
                            </IconButton>
                          </TableCell>
                          <TableCell>
                            <Typography variant="body2" fontWeight="medium">
                              {sub.client_name || 'Unknown'}
                            </Typography>
                          </TableCell>
                          <TableCell>
                            <Typography variant="body2" noWrap sx={{ maxWidth: 200 }}>
                              {sub.service_name || '--'}
                            </Typography>
                          </TableCell>
                          <TableCell align="center">
                            <Chip
                              label={sub.payment_type === 'monthly' ? 'Monthly' : 'Term'}
                              size="small"
                              sx={{
                                bgcolor: sub.payment_type === 'monthly' ? `${brandColors.cyan}20` : `${brandColors.purple}20`,
                                color: sub.payment_type === 'monthly' ? brandColors.cyan : brandColors.purple,
                                fontWeight: 600,
                                fontSize: '0.7rem',
                              }}
                            />
                          </TableCell>
                          <TableCell align="right">
                            <Typography variant="body2">
                              {sub.rate_per_lesson ? `${formatCurrency(sub.rate_per_lesson)}/lesson` : '--'}
                            </Typography>
                          </TableCell>
                          <TableCell align="center">
                            <Chip
                              label={sub.status}
                              size="small"
                              color={
                                sub.status === 'active' ? 'success'
                                  : sub.status === 'failed' ? 'error'
                                    : sub.status === 'cancelled' ? 'default'
                                      : 'info'
                              }
                              sx={{ fontSize: '0.7rem', height: 22 }}
                            />
                          </TableCell>
                          <TableCell align="center">
                            {renderVerificationIcons(sub)}
                          </TableCell>
                          <TableCell align="right">
                            {nextCharge.label === 'Paid in Full' ? (
                              <Chip
                                label="Paid in Full"
                                size="small"
                                sx={{
                                  bgcolor: `${brandColors.green}15`,
                                  color: brandColors.green,
                                  fontWeight: 600,
                                  fontSize: '0.7rem',
                                }}
                              />
                            ) : (
                              <Box>
                                <Typography variant="body2" fontSize="0.8rem">
                                  {nextCharge.label}
                                </Typography>
                                {nextCharge.amount && (
                                  <Typography variant="caption" color="text.secondary">
                                    ~{formatCurrency(nextCharge.amount)}
                                  </Typography>
                                )}
                              </Box>
                            )}
                          </TableCell>
                        </TableRow>

                        {/* Expanded detail */}
                        <TableRow>
                          <TableCell colSpan={8} sx={{ p: 0, borderBottom: isExpanded ? '2px solid #e4e6eb' : 'none' }}>
                            <Collapse in={isExpanded} timeout="auto" unmountOnExit>
                              {renderExpandedDetail(sub)}
                            </Collapse>
                          </TableCell>
                        </TableRow>
                      </React.Fragment>
                    );
                  })
                )}
              </TableBody>
            </Table>
          </TableContainer>
        </Box>

        {/* Mobile card view */}
        <Box sx={{ display: { xs: 'block', md: 'none' }, p: 2 }}>
          {filteredSubscriptions.length === 0 ? (
            <Typography variant="body2" color="text.secondary" textAlign="center" py={4}>
              {searchQuery || statusFilter !== 'all' ? 'No enrollments match your filters.' : 'No enrollments found.'}
            </Typography>
          ) : (
            filteredSubscriptions.map((sub) => {
              const issues = getEnrollmentIssues(sub);
              const hasIssues = issues.length > 0;
              const isExpanded = expandedRowId === sub.id;
              const nextCharge = getNextCharge(sub);

              return (
                <Box
                  key={sub.id}
                  sx={{
                    mb: 2,
                    border: '1px solid #e4e6eb',
                    borderRadius: 1.5,
                    borderLeft: hasIssues
                      ? `4px solid ${issues.includes('failed_payment') ? brandColors.pink : brandColors.orange}`
                      : '4px solid transparent',
                    overflow: 'hidden',
                    bgcolor: 'white',
                  }}
                >
                  <Box
                    onClick={() => setExpandedRowId(isExpanded ? null : sub.id)}
                    sx={{ p: 2, cursor: 'pointer' }}
                  >
                    <Box className="flex items-center justify-between mb-1">
                      <Typography variant="body2" fontWeight="bold">
                        {sub.client_name || 'Unknown'}
                      </Typography>
                      <Box className="flex items-center gap-1">
                        <Chip
                          label={sub.payment_type === 'monthly' ? 'Monthly' : 'Term'}
                          size="small"
                          sx={{
                            bgcolor: sub.payment_type === 'monthly' ? `${brandColors.cyan}20` : `${brandColors.purple}20`,
                            color: sub.payment_type === 'monthly' ? brandColors.cyan : brandColors.purple,
                            fontWeight: 600,
                            fontSize: '0.65rem',
                            height: 20,
                          }}
                        />
                        <Chip
                          label={sub.status}
                          size="small"
                          color={sub.status === 'active' ? 'success' : sub.status === 'failed' ? 'error' : 'default'}
                          sx={{ fontSize: '0.65rem', height: 20 }}
                        />
                      </Box>
                    </Box>
                    <Typography variant="caption" color="text.secondary" noWrap>
                      {sub.service_name || '--'}
                    </Typography>
                    <Box className="flex items-center justify-between mt-2">
                      <Box className="flex items-center gap-2">
                        {renderVerificationIcons(sub)}
                        {sub.rate_per_lesson && (
                          <Typography variant="caption" color="text.secondary">
                            {formatCurrency(sub.rate_per_lesson)}/lesson
                          </Typography>
                        )}
                      </Box>
                      <Box className="flex items-center gap-1">
                        {nextCharge.label === 'Paid in Full' ? (
                          <Typography variant="caption" style={{ color: brandColors.green }} fontWeight="bold">
                            Paid in Full
                          </Typography>
                        ) : (
                          <Typography variant="caption" color="text.secondary">
                            Next: {nextCharge.label}
                          </Typography>
                        )}
                        {isExpanded
                          ? <ExpandLess className="h-4 w-4 text-neutral-400" />
                          : <ExpandMore className="h-4 w-4 text-neutral-400" />}
                      </Box>
                    </Box>
                  </Box>

                  <Collapse in={isExpanded} timeout="auto" unmountOnExit>
                    {renderExpandedDetail(sub)}
                  </Collapse>
                </Box>
              );
            })
          )}
        </Box>
      </Card>

      {/* Cancel Confirmation Dialog */}
      <Dialog
        open={!!cancelDialog}
        onClose={() => !cancelLoading && setCancelDialog(null)}
        maxWidth="xs"
        fullWidth
      >
        <DialogTitle sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          Cancel Enrollment
          <IconButton size="small" onClick={() => setCancelDialog(null)} disabled={cancelLoading}>
            <CloseIcon className="h-5 w-5" />
          </IconButton>
        </DialogTitle>
        <DialogContent>
          <Typography variant="body2" sx={{ mb: 1 }}>
            Are you sure you want to cancel the enrollment for:
          </Typography>
          <Typography variant="body1" fontWeight="bold">
            {cancelDialog?.client_name}
          </Typography>
          <Typography variant="body2" color="text.secondary">
            {cancelDialog?.service_name}
          </Typography>
          <Alert severity="warning" sx={{ mt: 2 }}>
            This will stop all future charges for this enrollment. This action cannot be undone.
          </Alert>
        </DialogContent>
        <DialogActions sx={{ px: 3, pb: 2 }}>
          <Button onClick={() => setCancelDialog(null)} disabled={cancelLoading}>
            Keep Active
          </Button>
          <Button
            variant="contained"
            color="error"
            onClick={() => handleCancelSubscription(cancelDialog?.id)}
            disabled={cancelLoading}
            startIcon={cancelLoading ? <CircularProgress size={16} /> : null}
          >
            {cancelLoading ? 'Cancelling...' : 'Cancel Enrollment'}
          </Button>
        </DialogActions>
      </Dialog>

      {/* Retry Payment Confirmation Dialog */}
      <Dialog
        open={!!retryDialog}
        onClose={() => !retryLoading && setRetryDialog(null)}
        maxWidth="xs"
        fullWidth
      >
        <DialogTitle sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          Retry Payment
          <IconButton size="small" onClick={() => setRetryDialog(null)} disabled={!!retryLoading}>
            <CloseIcon className="h-5 w-5" />
          </IconButton>
        </DialogTitle>
        <DialogContent>
          <Typography variant="body2" sx={{ mb: 1 }}>
            Retry the failed payment for:
          </Typography>
          <Typography variant="body1" fontWeight="bold">
            {retryDialog?.clientName || retryDialog?.client_name}
          </Typography>
          <Typography variant="body2" color="text.secondary">
            Amount: {formatCurrency(retryDialog?.amountDue || retryDialog?.amount_charged)}
          </Typography>
          {retryDialog?.failureReason && (
            <Alert severity="info" sx={{ mt: 2 }}>
              Previous failure: {retryDialog.failureReason}
            </Alert>
          )}
        </DialogContent>
        <DialogActions sx={{ px: 3, pb: 2 }}>
          <Button onClick={() => setRetryDialog(null)} disabled={!!retryLoading}>
            Cancel
          </Button>
          <Button
            variant="contained"
            color="primary"
            onClick={() => handleRetryPayment(retryDialog?.id || retryDialog?.enrollmentId)}
            disabled={!!retryLoading}
            startIcon={retryLoading ? <CircularProgress size={16} /> : <Replay className="h-4 w-4" />}
          >
            {retryLoading ? 'Retrying...' : 'Retry Payment'}
          </Button>
        </DialogActions>
      </Dialog>
    </Box>
  );
}
