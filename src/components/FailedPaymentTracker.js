import React, { useState, useEffect } from 'react';
import axios from 'axios';
import { useToast } from '../hooks/useToast';
import KpiCard from './ui/KpiCard';
import { formatCurrency, formatDate, formatDateTime } from '../utils/formatters';
import {
  Box,
  Card,
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
  TableSortLabel,
} from '@mui/material';
import {
  PhoneIcon,
  EnvelopeIcon,
  DocumentTextIcon,
  ArrowPathIcon,
  ArrowTopRightOnSquareIcon,
  XMarkIcon,
  BoltIcon,
  MagnifyingGlassIcon,
  PencilSquareIcon,
  TrashIcon,
  CheckIcon,
} from '@heroicons/react/24/outline';
import { CheckCircleIcon as CheckCircleSolidIcon } from '@heroicons/react/24/solid';

const ASSIGNEE_OPTIONS = ['All', 'Stephanie', 'Nicholas', 'Harlan'];

const ISSUE_CONFIG = {
  no_card: { label: 'No Card', color: 'error' },
  card_declined: { label: 'Declined', color: 'warning' },
  insufficient_funds: { label: 'Insufficient Funds', color: 'warning' },
  card_inactive: { label: 'Card Inactive', color: 'default' },
  pays_ach: { label: 'ACH', color: 'info' },
  other: { label: 'Other', color: 'default' },
};

const OUTCOME_OPTIONS = [
  'Connected',
  'Voicemail',
  'No Answer',
  'Callback Requested',
  'Email Sent',
  'Resolved',
  'Other',
];

const ACTIVITY_TYPE_ICONS = {
  call: PhoneIcon,
  email: EnvelopeIcon,
  note: DocumentTextIcon,
  auto: BoltIcon,
};

function getDaysOpen(openedAt) {
  if (!openedAt) return 0;
  const opened = new Date(openedAt);
  const now = new Date();
  return Math.floor((now - opened) / (1000 * 60 * 60 * 24));
}

function DaysOpenBadge({ days }) {
  let color = 'success.main';
  let bgColor = 'success.light';
  if (days > 14) {
    color = 'error.main';
    bgColor = 'error.light';
  } else if (days >= 7) {
    color = 'warning.main';
    bgColor = 'warning.light';
  }
  return (
    <Chip
      label={`${days}d`}
      size="small"
      sx={{
        bgcolor: bgColor,
        color,
        fontWeight: 600,
        fontSize: '0.75rem',
      }}
    />
  );
}

function IssueChip({ issueType }) {
  const config = ISSUE_CONFIG[issueType] || ISSUE_CONFIG.other;
  return <Chip label={config.label} color={config.color} size="small" />;
}

export default function FailedPaymentTracker() {
  const toast = useToast();

  // Core state
  const [cases, setCases] = useState([]);
  const [resolvedCases, setResolvedCases] = useState([]);
  const [stats, setStats] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  // Tabs & filters
  const [activeTab, setActiveTab] = useState(0);
  const [search, setSearch] = useState('');
  const [assigneeFilter, setAssigneeFilter] = useState('All');
  const [sortConfig, setSortConfig] = useState({ key: 'opened_at', direction: 'desc' });

  // Detail modal
  const [detailModalOpen, setDetailModalOpen] = useState(false);
  const [selectedCase, setSelectedCase] = useState(null);
  const [activityForm, setActivityForm] = useState({
    type: 'call',
    description: '',
    contact_person: '',
    outcome: '',
    follow_up_date: '',
  });

  // Resolve dialog
  const [resolveDialogOpen, setResolveDialogOpen] = useState(false);
  const [resolveNotes, setResolveNotes] = useState('');

  // Editing activity
  const [editingActivity, setEditingActivity] = useState(null);
  const [editForm, setEditForm] = useState({ description: '', contact_person: '', outcome: '' });

  // Current user name from localStorage
  const [currentUserName, setCurrentUserName] = useState('');
  useEffect(() => {
    try {
      const userData = localStorage.getItem('user');
      if (userData && userData !== 'undefined') {
        const u = JSON.parse(userData);
        setCurrentUserName(`${u.first_name || ''} ${u.last_name || ''}`.trim() || u.email || '');
      }
    } catch { /* ignore */ }
  }, []);

  // Sync state
  const [syncing, setSyncing] = useState(false);

  const getAxios = () => {
    return axios.create({
      withCredentials: true,
    });
  };

  const handle401 = (err) => {
    if (err.response?.status === 401) {
      localStorage.removeItem('token');
      localStorage.removeItem('user');
      const currentPath = window.location.pathname;
      if (
        !currentPath.includes('/login') &&
        !currentPath.includes('/forgot-password') &&
        !currentPath.includes('/reset-password')
      ) {
        window.location.href = '/login';
        return true;
      }
    }
    return false;
  };

  // --- API calls ---

  const fetchCases = async () => {
    try {
      const params = new URLSearchParams();
      if (assigneeFilter !== 'All') params.append('assignee', assigneeFilter);
      if (search) params.append('search', search);
      const res = await getAxios().get(`/api/failed-payments?${params}`);
      setCases(res.data.cases || res.data || []);
    } catch (err) {
      if (!handle401(err)) {
        setError(err.response?.data?.error || 'Failed to fetch cases');
      }
    }
  };

  const fetchResolved = async () => {
    try {
      const res = await getAxios().get('/api/failed-payments/resolved?page=1&limit=25');
      setResolvedCases(res.data.cases || res.data || []);
    } catch (err) {
      if (!handle401(err)) {
        setError(err.response?.data?.error || 'Failed to fetch resolved cases');
      }
    }
  };

  const fetchStats = async () => {
    try {
      const res = await getAxios().get('/api/failed-payments/stats');
      setStats(res.data);
    } catch (err) {
      if (!handle401(err)) {
        // stats failure is non-critical
        console.error('Failed to fetch stats:', err);
      }
    }
  };

  const fetchCaseDetail = async (id) => {
    try {
      const res = await getAxios().get(`/api/failed-payments/${id}`);
      setSelectedCase(res.data);
    } catch (err) {
      if (!handle401(err)) {
        toast.error('Failed to fetch case details');
      }
    }
  };

  const addActivity = async (id, data) => {
    try {
      await getAxios().post(`/api/failed-payments/${id}/activity`, data);
      toast.success('Activity logged');
      await fetchCaseDetail(id);
      await fetchCases();
    } catch (err) {
      if (!handle401(err)) {
        toast.error(err.response?.data?.error || 'Failed to log activity');
      }
    }
  };

  const deleteActivity = async (activityId) => {
    if (!selectedCase) return;
    try {
      await getAxios().delete(`/api/failed-payments/activity/${activityId}`);
      toast.success('Activity deleted');
      await fetchCaseDetail(selectedCase.id);
    } catch (err) {
      if (!handle401(err)) {
        toast.error(err.response?.data?.error || 'Failed to delete activity');
      }
    }
  };

  const updateActivity = async (activityId, data) => {
    if (!selectedCase) return;
    try {
      await getAxios().patch(`/api/failed-payments/activity/${activityId}`, data);
      toast.success('Activity updated');
      setEditingActivity(null);
      await fetchCaseDetail(selectedCase.id);
    } catch (err) {
      if (!handle401(err)) {
        toast.error(err.response?.data?.error || 'Failed to update activity');
      }
    }
  };

  const updateCase = async (id, data) => {
    try {
      await getAxios().patch(`/api/failed-payments/${id}`, data);
      toast.success('Case updated');
      await fetchCaseDetail(id);
      await fetchCases();
      await fetchStats();
    } catch (err) {
      if (!handle401(err)) {
        toast.error(err.response?.data?.error || 'Failed to update case');
      }
    }
  };

  const resolveCase = async (id, data) => {
    try {
      await getAxios().patch(`/api/failed-payments/${id}/resolve`, data);
      toast.success('Case resolved');
      setResolveDialogOpen(false);
      setResolveNotes('');
      setDetailModalOpen(false);
      setSelectedCase(null);
      await Promise.all([fetchCases(), fetchResolved(), fetchStats()]);
    } catch (err) {
      if (!handle401(err)) {
        toast.error(err.response?.data?.error || 'Failed to resolve case');
      }
    }
  };

  const triggerSync = async () => {
    try {
      setSyncing(true);
      await getAxios().post('/api/failed-payments/sync');
      toast.success('Sync completed');
      await Promise.all([fetchCases(), fetchStats()]);
    } catch (err) {
      if (!handle401(err)) {
        toast.error(err.response?.data?.error || 'Sync failed');
      }
    } finally {
      setSyncing(false);
    }
  };

  // --- Effects ---

  useEffect(() => {
    const loadData = async () => {
      setLoading(true);
      setError(null);
      try {
        if (activeTab === 0) {
          await Promise.all([fetchCases(), fetchStats()]);
        } else {
          await Promise.all([fetchResolved(), fetchStats()]);
        }
      } finally {
        setLoading(false);
      }
    };
    loadData();
  }, [activeTab]);

  // Refetch current cases when filters change
  useEffect(() => {
    if (!loading && activeTab === 0) {
      fetchCases();
    }
  }, [search, assigneeFilter]);

  // --- Sorting ---

  const handleSort = (key) => {
    setSortConfig((prev) => ({
      key,
      direction: prev.key === key && prev.direction === 'asc' ? 'desc' : 'asc',
    }));
  };

  const sortedCases = [...cases].sort((a, b) => {
    const { key, direction } = sortConfig;
    if (!key) return 0;
    let aVal = a[key];
    let bVal = b[key];

    // Special handling for computed fields
    if (key === 'days_open') {
      aVal = getDaysOpen(a.opened_at);
      bVal = getDaysOpen(b.opened_at);
    }
    if (key === 'total_outstanding') {
      aVal = parseFloat(aVal) || 0;
      bVal = parseFloat(bVal) || 0;
    }

    if (aVal == null) return 1;
    if (bVal == null) return -1;
    if (typeof aVal === 'string') {
      const cmp = aVal.localeCompare(bVal, undefined, { sensitivity: 'base' });
      return direction === 'asc' ? cmp : -cmp;
    }
    return direction === 'asc' ? aVal - bVal : bVal - aVal;
  });

  // --- Modal helpers ---

  const openDetailModal = (caseItem, presetActivityType = null) => {
    fetchCaseDetail(caseItem.id);
    setDetailModalOpen(true);
    setActivityForm({
      type: presetActivityType || 'call',
      description: '',
      contact_person: '',
      outcome: '',
      follow_up_date: '',
    });
  };

  const handleActivitySubmit = () => {
    if (!selectedCase) return;
    if (!activityForm.description.trim()) {
      toast.error('Description is required');
      return;
    }
    addActivity(selectedCase.id, {
      activity_type: activityForm.type,
      description: activityForm.description,
      contact_person: activityForm.contact_person,
      outcome: activityForm.outcome,
      follow_up_date: activityForm.follow_up_date || undefined,
      created_by: currentUserName || undefined,
    });
    setActivityForm({
      type: 'call',
      description: '',
      contact_person: '',
      outcome: '',
      follow_up_date: '',
    });
  };

  const handleCaseFieldChange = (field, value) => {
    if (!selectedCase) return;
    updateCase(selectedCase.id, { [field]: value });
  };

  const handleResolveSubmit = () => {
    if (!selectedCase) return;
    resolveCase(selectedCase.id, { resolution_notes: resolveNotes });
  };

  // --- Sortable header helper ---

  const SortableHeader = ({ label, sortKey }) => (
    <TableCell sx={{ py: 1, px: 1.5 }}>
      <TableSortLabel
        active={sortConfig.key === sortKey}
        direction={sortConfig.key === sortKey ? sortConfig.direction : 'asc'}
        onClick={() => handleSort(sortKey)}
        sx={{ '& .MuiTableSortLabel-icon': { fontSize: '0.75rem' } }}
      >
        <span className="text-[11px] font-medium text-neutral-500 uppercase tracking-wider whitespace-nowrap">
          {label}
        </span>
      </TableSortLabel>
    </TableCell>
  );

  // --- Render ---

  if (loading && !cases.length && !resolvedCases.length) {
    return (
      <Box sx={{ display: 'flex', justifyContent: 'center', alignItems: 'center', minHeight: 400 }}>
        <CircularProgress />
      </Box>
    );
  }

  return (
    <div className="px-4 sm:px-6 lg:px-8 pt-4">
      {error && (
        <Alert severity="error" sx={{ mb: 2 }} onClose={() => setError(null)}>
          {error}
        </Alert>
      )}

      {/* KPI Cards — STC Design System */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 mb-4">
        <KpiCard title="Total Outstanding" value={formatCurrency(stats?.total_outstanding || 0)} tone="danger" />
        <KpiCard title="Active Cases" value={stats?.active_count ?? 0} tone="warning" />
        <KpiCard title="Avg Days Open" value={stats?.avg_days_open != null ? Math.round(stats.avg_days_open) : 0} tone="default" />
        <KpiCard title="Resolved This Month" value={stats?.resolved_this_month ?? 0} tone="success" />
      </div>

      {/* Toolbar — matches Clients tab */}
      <div className="bg-white rounded-xl shadow-sm border border-neutral-200 mb-4">
        <div className="flex flex-wrap items-center gap-2 px-4 py-3">
          <div className="relative flex-shrink-0" style={{ width: '240px' }}>
            <MagnifyingGlassIcon className="absolute left-2.5 top-1/2 -translate-y-1/2 h-4 w-4 text-neutral-400" />
            <input
              type="text"
              placeholder="Search clients..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="w-full pl-8 pr-3 py-1.5 text-sm border border-neutral-300 rounded-md focus:outline-none focus:ring-2 focus:ring-primary-500 focus:border-primary-500"
            />
          </div>
          <FormControl size="small" sx={{ minWidth: 160 }}>
            <InputLabel>Assignee</InputLabel>
            <Select value={assigneeFilter} label="Assignee" onChange={(e) => setAssigneeFilter(e.target.value)}>
              {ASSIGNEE_OPTIONS.map((opt) => (
                <MenuItem key={opt} value={opt}>{opt}</MenuItem>
              ))}
            </Select>
          </FormControl>
          <button
            onClick={triggerSync}
            disabled={syncing}
            className="inline-flex items-center gap-1.5 px-3 py-1.5 text-sm font-medium text-neutral-700 bg-white border border-neutral-300 rounded-md hover:bg-neutral-50 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
          >
            {syncing ? <CircularProgress size={14} /> : <ArrowPathIcon className="h-4 w-4" />}
            Sync
          </button>
        </div>
      </div>

      {/* Tabs — STC underline style */}
      <div className="border-b border-neutral-200 mb-4">
        <nav className="flex gap-6 -mb-px">
          {['Current', 'Resolved'].map((label, idx) => (
            <button
              key={label}
              onClick={() => setActiveTab(idx)}
              className={`px-1 py-2.5 text-sm font-medium border-b-2 transition-colors ${
                activeTab === idx
                  ? 'border-brand-purple text-brand-purple'
                  : 'border-transparent text-neutral-500 hover:text-neutral-700 hover:border-neutral-300'
              }`}
            >
              {label}
            </button>
          ))}
        </nav>
      </div>

      {/* Current Tab */}
      {activeTab === 0 && (
        <TableContainer component={Paper} variant="outlined">
          <Table size="small">
            <TableHead>
              <TableRow>
                <SortableHeader label="Client Name" sortKey="client_name" />
                <SortableHeader label="Outstanding" sortKey="total_outstanding" />
                <TableCell sx={{ py: 1, px: 1.5 }}><span className="text-[11px] font-medium text-neutral-500 uppercase tracking-wider">Card?</span></TableCell>
                <SortableHeader label="Issue" sortKey="issue_type" />
                <SortableHeader label="Opened" sortKey="opened_at" />
                <SortableHeader label="Days Open" sortKey="days_open" />
                <SortableHeader label="Assignee" sortKey="assignee" />
                <TableCell sx={{ py: 1, px: 1.5 }}><span className="text-[11px] font-medium text-neutral-500 uppercase tracking-wider">Last Outreach</span></TableCell>
                <TableCell sx={{ py: 1, px: 1.5 }}><span className="text-[11px] font-medium text-neutral-500 uppercase tracking-wider">Actions</span></TableCell>
              </TableRow>
            </TableHead>
            <TableBody>
              {sortedCases.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={9} align="center" sx={{ py: 6 }}>
                    <Typography color="text.secondary">
                      No active failed payment cases found.
                    </Typography>
                  </TableCell>
                </TableRow>
              ) : (
                sortedCases.map((c) => {
                  const daysOpen = getDaysOpen(c.opened_at);
                  const lastActivity =
                    c.last_activity_summary || c.last_outreach || null;
                  return (
                    <TableRow key={c.id} hover>
                      <TableCell>
                        <Typography
                          sx={{
                            cursor: 'pointer',
                            color: 'primary.main',
                            fontWeight: 500,
                            '&:hover': { textDecoration: 'underline' },
                          }}
                          onClick={() => openDetailModal(c)}
                        >
                          {c.client_name}
                        </Typography>
                      </TableCell>
                      <TableCell>{formatCurrency(c.total_outstanding)}</TableCell>
                      <TableCell align="center">
                        {c.card_on_file ? (
                          <CheckCircleSolidIcon style={{ height: 20, width: 20, color: '#34B256' }} />
                        ) : (
                          <XMarkIcon style={{ height: 20, width: 20, color: '#DA2E72' }} />
                        )}
                      </TableCell>
                      <TableCell>
                        <IssueChip issueType={c.issue_type} />
                      </TableCell>
                      <TableCell>{formatDate(c.opened_at)}</TableCell>
                      <TableCell>
                        <DaysOpenBadge days={daysOpen} />
                      </TableCell>
                      <TableCell>{c.assignee || '—'}</TableCell>
                      <TableCell>
                        <Typography
                          variant="body2"
                          sx={{
                            maxWidth: 180,
                            overflow: 'hidden',
                            textOverflow: 'ellipsis',
                            whiteSpace: 'nowrap',
                          }}
                        >
                          {lastActivity || '—'}
                        </Typography>
                      </TableCell>
                      <TableCell>
                        <Stack direction="row" spacing={0.5}>
                          <Tooltip title="Log Call">
                            <IconButton size="small" onClick={() => openDetailModal(c, 'call')}>
                              <PhoneIcon style={{ height: 18, width: 18 }} />
                            </IconButton>
                          </Tooltip>
                          <Tooltip title="Log Email">
                            <IconButton size="small" onClick={() => openDetailModal(c, 'email')}>
                              <EnvelopeIcon style={{ height: 18, width: 18 }} />
                            </IconButton>
                          </Tooltip>
                          <Tooltip title="Log Note">
                            <IconButton size="small" onClick={() => openDetailModal(c, 'note')}>
                              <DocumentTextIcon style={{ height: 18, width: 18 }} />
                            </IconButton>
                          </Tooltip>
                          {c.tc_link && (
                            <Tooltip title="Open in TutorCruncher">
                              <IconButton
                                size="small"
                                component="a"
                                href={c.tc_link}
                                target="_blank"
                                rel="noopener noreferrer"
                              >
                                <ArrowTopRightOnSquareIcon style={{ height: 18, width: 18 }} />
                              </IconButton>
                            </Tooltip>
                          )}
                        </Stack>
                      </TableCell>
                    </TableRow>
                  );
                })
              )}
            </TableBody>
          </Table>
        </TableContainer>
      )}

      {/* Resolved Tab */}
      {activeTab === 1 && (
        <TableContainer component={Paper} variant="outlined">
          <Table size="small">
            <TableHead>
              <TableRow>
                <TableCell sx={{ py: 1, px: 1.5 }}><span className="text-[11px] font-medium text-neutral-500 uppercase tracking-wider">Client Name</span></TableCell>
                <TableCell sx={{ py: 1, px: 1.5 }}><span className="text-[11px] font-medium text-neutral-500 uppercase tracking-wider">Outstanding</span></TableCell>
                <TableCell sx={{ py: 1, px: 1.5 }}><span className="text-[11px] font-medium text-neutral-500 uppercase tracking-wider">Issue</span></TableCell>
                <TableCell sx={{ py: 1, px: 1.5 }}><span className="text-[11px] font-medium text-neutral-500 uppercase tracking-wider">Opened</span></TableCell>
                <TableCell sx={{ py: 1, px: 1.5 }}><span className="text-[11px] font-medium text-neutral-500 uppercase tracking-wider">Resolution</span></TableCell>
                <TableCell sx={{ py: 1, px: 1.5 }}><span className="text-[11px] font-medium text-neutral-500 uppercase tracking-wider">Date Resolved</span></TableCell>
                <TableCell sx={{ py: 1, px: 1.5 }}><span className="text-[11px] font-medium text-neutral-500 uppercase tracking-wider">Days to Resolve</span></TableCell>
              </TableRow>
            </TableHead>
            <TableBody>
              {resolvedCases.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={7} align="center" sx={{ py: 6 }}>
                    <Typography color="text.secondary">
                      No resolved cases yet.
                    </Typography>
                  </TableCell>
                </TableRow>
              ) : (
                resolvedCases.map((c) => {
                  const daysToResolve =
                    c.opened_at && c.resolved_at
                      ? Math.floor(
                          (new Date(c.resolved_at) - new Date(c.opened_at)) /
                            (1000 * 60 * 60 * 24)
                        )
                      : '—';
                  return (
                    <TableRow key={c.id} hover>
                      <TableCell>
                        <Typography
                          sx={{
                            cursor: 'pointer',
                            color: 'primary.main',
                            fontWeight: 500,
                            '&:hover': { textDecoration: 'underline' },
                          }}
                          onClick={() => openDetailModal(c)}
                        >
                          {c.client_name}
                        </Typography>
                      </TableCell>
                      <TableCell>{formatCurrency(c.total_outstanding)}</TableCell>
                      <TableCell>
                        <IssueChip issueType={c.issue_type} />
                      </TableCell>
                      <TableCell>{formatDate(c.opened_at)}</TableCell>
                      <TableCell>
                        <Typography
                          variant="body2"
                          sx={{
                            maxWidth: 240,
                            overflow: 'hidden',
                            textOverflow: 'ellipsis',
                            whiteSpace: 'nowrap',
                          }}
                        >
                          {c.resolution_notes || '—'}
                        </Typography>
                      </TableCell>
                      <TableCell>{formatDate(c.resolved_at)}</TableCell>
                      <TableCell>{daysToResolve}</TableCell>
                    </TableRow>
                  );
                })
              )}
            </TableBody>
          </Table>
        </TableContainer>
      )}

      {/* Detail Modal */}
      <Dialog
        open={detailModalOpen}
        onClose={() => {
          setDetailModalOpen(false);
          setSelectedCase(null);
        }}
        fullWidth
        maxWidth="md"
      >
        {selectedCase ? (
          <>
            <DialogTitle sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <Box>
                <Typography variant="h6" component="span" sx={{ fontWeight: 700 }}>
                  {selectedCase.client_name}
                </Typography>
                <Box sx={{ display: 'flex', alignItems: 'center', gap: 1.5, mt: 0.5 }}>
                  <Typography variant="body2" color="text.secondary">
                    {formatCurrency(selectedCase.total_outstanding)} outstanding
                  </Typography>
                  <DaysOpenBadge days={getDaysOpen(selectedCase.opened_at)} />
                </Box>
              </Box>
              <Box sx={{ display: 'flex', gap: 1 }}>
                {selectedCase.tc_link && (
                  <Tooltip title="Open in TutorCruncher">
                    <IconButton
                      component="a"
                      href={selectedCase.tc_link}
                      target="_blank"
                      rel="noopener noreferrer"
                      size="small"
                    >
                      <ArrowTopRightOnSquareIcon style={{ height: 20, width: 20 }} />
                    </IconButton>
                  </Tooltip>
                )}
                <IconButton
                  onClick={() => {
                    setDetailModalOpen(false);
                    setSelectedCase(null);
                  }}
                  size="small"
                >
                  <XMarkIcon style={{ height: 20, width: 20 }} />
                </IconButton>
              </Box>
            </DialogTitle>
            <DialogContent dividers>
              {/* Editable metadata */}
              <Grid container spacing={2} sx={{ mb: 3 }}>
                <Grid item xs={12} sm={6} md={3}>
                  <FormControl fullWidth size="small">
                    <InputLabel>Issue Type</InputLabel>
                    <Select
                      value={selectedCase.issue_type || 'other'}
                      label="Issue Type"
                      onChange={(e) => handleCaseFieldChange('issue_type', e.target.value)}
                    >
                      {Object.entries(ISSUE_CONFIG).map(([key, cfg]) => (
                        <MenuItem key={key} value={key}>
                          {cfg.label}
                        </MenuItem>
                      ))}
                    </Select>
                  </FormControl>
                </Grid>
                <Grid item xs={12} sm={6} md={3}>
                  <FormControlLabel
                    control={
                      <Checkbox
                        checked={!!selectedCase.card_on_file}
                        onChange={(e) => handleCaseFieldChange('card_on_file', e.target.checked)}
                      />
                    }
                    label="Card on File"
                  />
                </Grid>
                <Grid item xs={12} sm={6} md={3}>
                  <FormControl fullWidth size="small">
                    <InputLabel>Assignee</InputLabel>
                    <Select
                      value={selectedCase.assignee || ''}
                      label="Assignee"
                      onChange={(e) => handleCaseFieldChange('assignee', e.target.value)}
                    >
                      <MenuItem value="">Unassigned</MenuItem>
                      {ASSIGNEE_OPTIONS.filter((o) => o !== 'All').map((opt) => (
                        <MenuItem key={opt} value={opt}>
                          {opt}
                        </MenuItem>
                      ))}
                    </Select>
                  </FormControl>
                </Grid>
                <Grid item xs={12} sm={6} md={3}>
                  <TextField
                    fullWidth
                    size="small"
                    label="Tutor"
                    value={selectedCase.tutor_name || ''}
                    onChange={(e) => handleCaseFieldChange('tutor_name', e.target.value)}
                  />
                </Grid>
              </Grid>

              {/* Unpaid Invoices */}
              {selectedCase.invoices?.length > 0 && (
                <>
                  <Divider sx={{ mb: 2 }} />
                  <Typography variant="subtitle2" sx={{ mb: 1.5, fontWeight: 600 }}>
                    Unpaid Invoices ({selectedCase.invoices.length})
                  </Typography>
                  <TableContainer component={Paper} variant="outlined" sx={{ mb: 3 }}>
                    <Table size="small">
                      <TableHead>
                        <TableRow>
                          <TableCell>Invoice</TableCell>
                          <TableCell>Service</TableCell>
                          <TableCell>Tutor</TableCell>
                          <TableCell>Date Sent</TableCell>
                          <TableCell align="right">Amount Due</TableCell>
                        </TableRow>
                      </TableHead>
                      <TableBody>
                        {selectedCase.invoices.map((inv) => (
                          <TableRow key={inv.invoice_id} hover>
                            <TableCell>
                              <a
                                href={`https://account.acmeops.com/accounting/invoices/${inv.invoice_id}/`}
                                target="_blank"
                                rel="noopener noreferrer"
                                style={{ color: '#6A469D', fontWeight: 500, textDecoration: 'none' }}
                              >
                                #{inv.invoice_id}
                                <ArrowTopRightOnSquareIcon style={{ height: 14, width: 14, marginLeft: 4, verticalAlign: 'middle' }} />
                              </a>
                            </TableCell>
                            <TableCell>{inv.service_name || '—'}</TableCell>
                            <TableCell>{inv.tutor_name || '—'}</TableCell>
                            <TableCell>{formatDate(inv.date_sent)}</TableCell>
                            <TableCell align="right">{formatCurrency(inv.still_to_pay)}</TableCell>
                          </TableRow>
                        ))}
                      </TableBody>
                    </Table>
                  </TableContainer>
                </>
              )}

              <Divider sx={{ mb: 2 }} />

              {/* Add Activity Form */}
              <Typography variant="subtitle2" sx={{ mb: 1.5, fontWeight: 600 }}>
                Log Activity
              </Typography>
              <Box sx={{ mb: 3, p: 2, bgcolor: 'grey.50', borderRadius: 1 }}>
                <Grid container spacing={2}>
                  <Grid item xs={12} sm={4}>
                    <FormControl fullWidth size="small">
                      <InputLabel>Type</InputLabel>
                      <Select
                        value={activityForm.type}
                        label="Type"
                        onChange={(e) =>
                          setActivityForm((prev) => ({ ...prev, type: e.target.value }))
                        }
                      >
                        <MenuItem value="call">Call</MenuItem>
                        <MenuItem value="email">Email</MenuItem>
                        <MenuItem value="note">Note</MenuItem>
                      </Select>
                    </FormControl>
                  </Grid>
                  <Grid item xs={12} sm={4}>
                    <TextField
                      fullWidth
                      size="small"
                      label="Contact Person"
                      value={activityForm.contact_person}
                      onChange={(e) =>
                        setActivityForm((prev) => ({ ...prev, contact_person: e.target.value }))
                      }
                    />
                  </Grid>
                  <Grid item xs={12} sm={4}>
                    <FormControl fullWidth size="small">
                      <InputLabel>Outcome</InputLabel>
                      <Select
                        value={activityForm.outcome}
                        label="Outcome"
                        onChange={(e) =>
                          setActivityForm((prev) => ({ ...prev, outcome: e.target.value }))
                        }
                      >
                        <MenuItem value="">—</MenuItem>
                        {OUTCOME_OPTIONS.map((opt) => (
                          <MenuItem key={opt} value={opt}>
                            {opt}
                          </MenuItem>
                        ))}
                      </Select>
                    </FormControl>
                  </Grid>
                  <Grid item xs={12}>
                    <TextField
                      fullWidth
                      size="small"
                      label="Description"
                      multiline
                      rows={2}
                      value={activityForm.description}
                      onChange={(e) =>
                        setActivityForm((prev) => ({ ...prev, description: e.target.value }))
                      }
                    />
                  </Grid>
                  <Grid item xs={12} sm={6}>
                    <TextField
                      fullWidth
                      size="small"
                      label="Follow-up Date"
                      type="date"
                      InputLabelProps={{ shrink: true }}
                      value={activityForm.follow_up_date}
                      onChange={(e) =>
                        setActivityForm((prev) => ({ ...prev, follow_up_date: e.target.value }))
                      }
                    />
                  </Grid>
                  <Grid item xs={12} sm={6} sx={{ display: 'flex', alignItems: 'flex-end' }}>
                    <Button variant="contained" size="small" onClick={handleActivitySubmit}>
                      Log Activity
                    </Button>
                  </Grid>
                </Grid>
              </Box>

              {/* Activity Timeline */}
              <Typography variant="subtitle2" sx={{ mb: 1.5, fontWeight: 600 }}>
                Activity Timeline
              </Typography>
              {selectedCase.activities?.length > 0 ? (
                <Stack spacing={1.5}>
                  {selectedCase.activities.map((activity, idx) => {
                    const actType = activity.activity_type || activity.type;
                    const isAuto = actType?.startsWith('auto');
                    const TypeIcon = ACTIVITY_TYPE_ICONS[actType] || (isAuto ? BoltIcon : DocumentTextIcon);
                    const isEditing = editingActivity === activity.id;
                    return (
                      <Card key={activity.id || idx} variant="outlined" sx={{ p: 1.5 }}>
                        <Box sx={{ display: 'flex', alignItems: 'flex-start', gap: 1.5 }}>
                          <TypeIcon
                            style={{
                              height: 20,
                              width: 20,
                              marginTop: 2,
                              color: '#6A469D',
                              flexShrink: 0,
                            }}
                          />
                          <Box sx={{ flex: 1, minWidth: 0 }}>
                            <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, mb: 0.5 }}>
                              <Chip
                                label={actType}
                                size="small"
                                sx={{ textTransform: 'capitalize', fontSize: '0.7rem' }}
                              />
                              {activity.outcome && (
                                <Typography variant="caption" color="text.secondary">
                                  {activity.outcome}
                                </Typography>
                              )}
                              <Box sx={{ ml: 'auto', display: 'flex', alignItems: 'center', gap: 0.5 }}>
                                <Typography variant="caption" color="text.secondary">
                                  {formatDateTime(activity.created_at)}
                                </Typography>
                                {!isAuto && (
                                  <>
                                    <Tooltip title="Edit">
                                      <IconButton
                                        size="small"
                                        onClick={() => {
                                          if (isEditing) {
                                            setEditingActivity(null);
                                          } else {
                                            setEditingActivity(activity.id);
                                            setEditForm({
                                              description: activity.description || '',
                                              contact_person: activity.contact_person || '',
                                              outcome: activity.outcome || '',
                                            });
                                          }
                                        }}
                                        sx={{ p: 0.25 }}
                                      >
                                        <PencilSquareIcon style={{ height: 15, width: 15 }} />
                                      </IconButton>
                                    </Tooltip>
                                    <Tooltip title="Delete">
                                      <IconButton
                                        size="small"
                                        onClick={() => deleteActivity(activity.id)}
                                        sx={{ p: 0.25 }}
                                      >
                                        <TrashIcon style={{ height: 15, width: 15, color: '#d32f2f' }} />
                                      </IconButton>
                                    </Tooltip>
                                  </>
                                )}
                              </Box>
                            </Box>
                            {isEditing ? (
                              <Box sx={{ mt: 1 }}>
                                <TextField
                                  fullWidth
                                  size="small"
                                  multiline
                                  rows={2}
                                  value={editForm.description}
                                  onChange={(e) => setEditForm(prev => ({ ...prev, description: e.target.value }))}
                                  sx={{ mb: 1 }}
                                />
                                <Box sx={{ display: 'flex', gap: 1, alignItems: 'center' }}>
                                  <TextField
                                    size="small"
                                    label="Contact"
                                    value={editForm.contact_person}
                                    onChange={(e) => setEditForm(prev => ({ ...prev, contact_person: e.target.value }))}
                                  />
                                  <FormControl size="small" sx={{ minWidth: 120 }}>
                                    <InputLabel>Outcome</InputLabel>
                                    <Select
                                      value={editForm.outcome}
                                      label="Outcome"
                                      onChange={(e) => setEditForm(prev => ({ ...prev, outcome: e.target.value }))}
                                    >
                                      <MenuItem value="">—</MenuItem>
                                      {OUTCOME_OPTIONS.map((opt) => (
                                        <MenuItem key={opt} value={opt}>{opt}</MenuItem>
                                      ))}
                                    </Select>
                                  </FormControl>
                                  <Button
                                    size="small"
                                    variant="contained"
                                    startIcon={<CheckIcon style={{ height: 16, width: 16 }} />}
                                    onClick={() => updateActivity(activity.id, editForm)}
                                  >
                                    Save
                                  </Button>
                                  <Button
                                    size="small"
                                    onClick={() => setEditingActivity(null)}
                                  >
                                    Cancel
                                  </Button>
                                </Box>
                              </Box>
                            ) : (
                              <>
                                <Typography variant="body2">{activity.description}</Typography>
                                {activity.contact_person && (
                                  <Typography variant="caption" color="text.secondary">
                                    Contact: {activity.contact_person}
                                  </Typography>
                                )}
                              </>
                            )}
                            {activity.created_by && (
                              <Typography variant="caption" color="text.secondary" sx={{ display: 'block' }}>
                                — {activity.created_by}
                              </Typography>
                            )}
                          </Box>
                        </Box>
                      </Card>
                    );
                  })}
                </Stack>
              ) : (
                <Typography variant="body2" color="text.secondary" sx={{ py: 2 }}>
                  No activity recorded yet.
                </Typography>
              )}
            </DialogContent>
            <DialogActions sx={{ justifyContent: 'space-between', px: 3, py: 2 }}>
              <Button
                variant="contained"
                color="success"
                onClick={() => setResolveDialogOpen(true)}
              >
                Mark Resolved
              </Button>
              <Button
                onClick={() => {
                  setDetailModalOpen(false);
                  setSelectedCase(null);
                }}
              >
                Close
              </Button>
            </DialogActions>
          </>
        ) : (
          <Box sx={{ display: 'flex', justifyContent: 'center', p: 6 }}>
            <CircularProgress />
          </Box>
        )}
      </Dialog>

      {/* Resolve Confirmation Dialog */}
      <Dialog
        open={resolveDialogOpen}
        onClose={() => setResolveDialogOpen(false)}
        maxWidth="sm"
        fullWidth
      >
        <DialogTitle>Resolve Case</DialogTitle>
        <DialogContent>
          <Typography variant="body2" sx={{ mb: 2 }}>
            Mark this case as resolved? Please add resolution notes below.
          </Typography>
          <TextField
            fullWidth
            multiline
            rows={3}
            label="Resolution Notes"
            value={resolveNotes}
            onChange={(e) => setResolveNotes(e.target.value)}
          />
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setResolveDialogOpen(false)}>Cancel</Button>
          <Button variant="contained" color="success" onClick={handleResolveSubmit}>
            Confirm Resolve
          </Button>
        </DialogActions>
      </Dialog>
    </div>
  );
}
