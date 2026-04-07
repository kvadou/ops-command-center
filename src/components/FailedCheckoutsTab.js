import { useState, useEffect, useCallback } from 'react';
import {
  Box,
  Card,
  CardContent,
  Typography,
  Button,
  Chip,
  IconButton,
  Grid,
  Paper,
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TableRow,
  TableSortLabel,
  Checkbox,
  CircularProgress,
  Alert,
  TextField,
  Tooltip,
  Drawer,
  Divider,
  Switch,
  FormControlLabel,
  Select,
  MenuItem,
  InputLabel,
  FormControl,
  Snackbar,
  Dialog,
  DialogTitle,
  DialogContent,
} from '@mui/material';
import {
  EnvelopeIcon,
  ExclamationTriangleIcon,
  CheckCircleIcon,
  XMarkIcon,
  ArrowPathIcon,
  Cog6ToothIcon,
  FunnelIcon,
  TableCellsIcon,
} from '@heroicons/react/24/outline';
import axios from 'axios';

const STATUS_COLORS = {
  pending: { bg: '#FEF3C7', text: '#92400E', label: 'Pending' },
  soft_sent: { bg: '#DBEAFE', text: '#1E40AF', label: 'Soft Sent' },
  hard_sent: { bg: '#FEE2E2', text: '#991B1B', label: 'Hard Sent' },
  resolved: { bg: '#D1FAE5', text: '#065F46', label: 'Resolved' },
  escalated: { bg: '#F3E8FF', text: '#6B21A8', label: 'Escalated' },
};

const formatDateTime = (d) => {
  if (!d) return '—';
  return new Date(d).toLocaleDateString('en-US', {
    month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit',
  });
};

const formatHours = (h) => {
  if (h == null) return '—';
  const num = parseFloat(h);
  if (num < 24) return `${num.toFixed(0)}h`;
  const days = Math.floor(num / 24);
  const hrs = Math.round(num % 24);
  return `${days}d ${hrs}h`;
};

const StatusChip = ({ status }) => {
  const config = STATUS_COLORS[status] || STATUS_COLORS.pending;
  return (
    <Chip
      label={config.label}
      size="small"
      sx={{
        bgcolor: config.bg,
        color: config.text,
        fontWeight: 600,
        fontSize: '0.75rem',
      }}
    />
  );
};

const FailedCheckoutsTab = () => {
  // View state
  const [viewMode, setViewMode] = useState('active'); // active, tally, settings
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [snackbar, setSnackbar] = useState({ open: false, message: '', severity: 'success' });

  // Data
  const [stats, setStats] = useState(null);
  const [failedCheckouts, setFailedCheckouts] = useState([]);
  const [tallyData, setTallyData] = useState([]);
  const [config, setConfig] = useState(null);

  // Filters
  const [statusFilter, setStatusFilter] = useState('');
  const [dateRange, setDateRange] = useState({ start: '', end: '' });
  const [periodType, setPeriodType] = useState('biweekly');

  // Selection for bulk actions
  const [selected, setSelected] = useState(new Set());

  // Sorting
  const [orderBy, setOrderBy] = useState('lesson_date');
  const [order, setOrder] = useState('desc');

  // Tutor history drawer
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [drawerTutor, setDrawerTutor] = useState(null);
  const [tutorHistory, setTutorHistory] = useState([]);
  const [tutorHistoryLoading, setTutorHistoryLoading] = useState(false);

  // Email sending state
  const [sendingEmail, setSendingEmail] = useState(null);

  // KPI detail modal
  const [kpiModal, setKpiModal] = useState({ open: false, type: null, title: '' });
  const [kpiDetailData, setKpiDetailData] = useState([]);
  const [kpiDetailLoading, setKpiDetailLoading] = useState(false);
  const [kpiDetailSort, setKpiDetailSort] = useState({ field: '', dir: 'desc' });

  const axiosOpts = { withCredentials: true };

  // ─── Data Fetching ─────────────────────────────────────────────────

  const fetchStats = useCallback(async () => {
    try {
      const { data } = await axios.get('/api/failed-checkouts/stats', axiosOpts);
      setStats(data);
    } catch (err) {
      console.error('Error fetching stats:', err);
    }
  }, []);

  const fetchFailedCheckouts = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const params = {};
      if (statusFilter) params.status = statusFilter;
      if (dateRange.start) params.startDate = dateRange.start;
      if (dateRange.end) params.endDate = dateRange.end;

      const { data } = await axios.get('/api/failed-checkouts', { ...axiosOpts, params });
      setFailedCheckouts(data);
    } catch (err) {
      setError(err.response?.data?.error || 'Failed to load failed checkouts');
    } finally {
      setLoading(false);
    }
  }, [statusFilter, dateRange]);

  const fetchTallyData = useCallback(async () => {
    setLoading(true);
    try {
      const params = { periodType };
      if (dateRange.start) params.startDate = dateRange.start;
      if (dateRange.end) params.endDate = dateRange.end;

      const { data } = await axios.get('/api/failed-checkouts/tally', { ...axiosOpts, params });
      setTallyData(data);
    } catch (err) {
      setError(err.response?.data?.error || 'Failed to load tally data');
    } finally {
      setLoading(false);
    }
  }, [dateRange, periodType]);

  const fetchConfig = useCallback(async () => {
    try {
      const { data } = await axios.get('/api/failed-checkouts/config', axiosOpts);
      setConfig(data);
    } catch (err) {
      console.error('Error fetching config:', err);
    }
  }, []);

  useEffect(() => {
    fetchStats();
    fetchConfig();
  }, []);

  useEffect(() => {
    if (viewMode === 'active') fetchFailedCheckouts();
    if (viewMode === 'tally') fetchTallyData();
  }, [viewMode, statusFilter, dateRange, periodType]);

  // ─── Actions ───────────────────────────────────────────────────────

  const handleSendEmail = async (id, type) => {
    setSendingEmail(id);
    try {
      await axios.post(`/api/failed-checkouts/${id}/send-${type}`, {}, axiosOpts);
      setSnackbar({ open: true, message: `${type === 'soft' ? 'Soft' : 'Hard'} reminder sent`, severity: 'success' });
      fetchFailedCheckouts();
      fetchStats();
    } catch (err) {
      setSnackbar({ open: true, message: err.response?.data?.error || 'Failed to send email', severity: 'error' });
    } finally {
      setSendingEmail(null);
    }
  };

  const handleBatchEmail = async (emailType) => {
    if (selected.size === 0) return;
    try {
      await axios.post('/api/failed-checkouts/batch-email', {
        logIds: Array.from(selected),
        emailType,
      }, axiosOpts);
      setSnackbar({ open: true, message: `${emailType} emails sent to ${selected.size} tutors`, severity: 'success' });
      setSelected(new Set());
      fetchFailedCheckouts();
      fetchStats();
    } catch (err) {
      setSnackbar({ open: true, message: err.response?.data?.error || 'Batch send failed', severity: 'error' });
    }
  };

  const handleResolve = async (id) => {
    try {
      await axios.post(`/api/failed-checkouts/${id}/resolve`, { notes: 'Manually resolved from UI' }, axiosOpts);
      setSnackbar({ open: true, message: 'Marked as resolved', severity: 'success' });
      fetchFailedCheckouts();
      fetchStats();
    } catch (err) {
      setSnackbar({ open: true, message: 'Failed to resolve', severity: 'error' });
    }
  };

  const handleRunDetection = async () => {
    try {
      const { data } = await axios.post('/api/failed-checkouts/detect', {}, axiosOpts);
      setSnackbar({ open: true, message: `Detection complete: ${data.detected} new items found`, severity: 'success' });
      fetchFailedCheckouts();
      fetchStats();
    } catch (err) {
      setSnackbar({ open: true, message: 'Detection failed', severity: 'error' });
    }
  };

  const handleSaveConfig = async () => {
    try {
      await axios.put('/api/failed-checkouts/config', config, axiosOpts);
      setSnackbar({ open: true, message: 'Settings saved', severity: 'success' });
    } catch (err) {
      setSnackbar({ open: true, message: 'Failed to save settings', severity: 'error' });
    }
  };

  const openTutorHistory = async (contractorId, tutorName) => {
    setDrawerTutor({ contractorId, name: tutorName });
    setDrawerOpen(true);
    setTutorHistoryLoading(true);
    try {
      const { data } = await axios.get(`/api/failed-checkouts/tutor/${contractorId}`, axiosOpts);
      setTutorHistory(data);
    } catch (err) {
      console.error('Error fetching tutor history:', err);
      setTutorHistory([]);
    } finally {
      setTutorHistoryLoading(false);
    }
  };

  const openKpiDetail = async (type, title) => {
    setKpiModal({ open: true, type, title });
    setKpiDetailLoading(true);
    setKpiDetailSort({ field: type === 'repeat_offenders' ? 'total_offenses' : 'lesson_date', dir: 'desc' });
    try {
      const { data } = await axios.get('/api/failed-checkouts/stats/detail', { ...axiosOpts, params: { type } });
      setKpiDetailData(data);
    } catch (err) {
      console.error('Error fetching KPI detail:', err);
      setKpiDetailData([]);
    } finally {
      setKpiDetailLoading(false);
    }
  };

  const sortedKpiDetail = [...kpiDetailData].sort((a, b) => {
    let aVal = a[kpiDetailSort.field];
    let bVal = b[kpiDetailSort.field];
    if (['total_offenses', 'active_count', 'resolved_count', 'hours_late', 'resolution_hours'].includes(kpiDetailSort.field)) {
      aVal = parseFloat(aVal) || 0;
      bVal = parseFloat(bVal) || 0;
    }
    if (aVal < bVal) return kpiDetailSort.dir === 'asc' ? -1 : 1;
    if (aVal > bVal) return kpiDetailSort.dir === 'asc' ? 1 : -1;
    return 0;
  });

  const handleKpiSort = (field) => {
    setKpiDetailSort(prev => ({
      field,
      dir: prev.field === field && prev.dir === 'desc' ? 'asc' : 'desc',
    }));
  };

  // ─── Selection Helpers ─────────────────────────────────────────────

  const unresolvedItems = failedCheckouts.filter(fc => fc.status !== 'resolved');

  const handleSelectAll = (e) => {
    if (e.target.checked) {
      setSelected(new Set(unresolvedItems.map(fc => fc.id)));
    } else {
      setSelected(new Set());
    }
  };

  const handleSelect = (id) => {
    const next = new Set(selected);
    if (next.has(id)) next.delete(id);
    else next.add(id);
    setSelected(next);
  };

  // ─── Sorting ───────────────────────────────────────────────────────

  const handleSort = (property) => {
    const isAsc = orderBy === property && order === 'asc';
    setOrder(isAsc ? 'desc' : 'asc');
    setOrderBy(property);
  };

  const sortedCheckouts = [...failedCheckouts].sort((a, b) => {
    let aVal = a[orderBy];
    let bVal = b[orderBy];
    if (orderBy === 'hours_late') {
      aVal = parseFloat(aVal) || 0;
      bVal = parseFloat(bVal) || 0;
    }
    if (aVal < bVal) return order === 'asc' ? -1 : 1;
    if (aVal > bVal) return order === 'asc' ? 1 : -1;
    return 0;
  });

  // ─── Tally View Helpers ────────────────────────────────────────────

  const buildTallyGrid = () => {
    if (!tallyData.length) return { periods: [], tutors: [], grid: {} };

    const periods = [...new Set(tallyData.map(r => r.period_label))];
    const tutorMap = {};
    tallyData.forEach(r => {
      const key = r.contractor_id;
      if (!tutorMap[key]) {
        tutorMap[key] = { id: key, name: `${r.tutor_first_name || ''} ${r.tutor_last_name || ''}`.trim() };
      }
    });
    const tutors = Object.values(tutorMap).sort((a, b) => a.name.localeCompare(b.name));

    const grid = {};
    tallyData.forEach(r => {
      const key = `${r.contractor_id}:${r.period_label}`;
      grid[key] = r;
    });

    return { periods, tutors, grid };
  };

  const getTallyCellColor = (cell) => {
    if (!cell) return 'transparent';
    if (parseInt(cell.pending_count) > 0 || parseInt(cell.hard_sent_count) > 0) return '#FEE2E2';
    if (parseInt(cell.soft_sent_count) > 0) return '#FEF3C7';
    if (parseInt(cell.resolved_count) === parseInt(cell.failed_count)) return '#D1FAE5';
    return '#F3F4F6';
  };

  // ─── Render: Summary Cards ─────────────────────────────────────────

  const renderSummaryCards = () => (
    <Grid container spacing={2} sx={{ mb: 3 }}>
      <Grid item xs={6} md={3}>
        <Card
          sx={{ bgcolor: '#FEF2F2', border: '1px solid #FECACA', cursor: 'pointer', '&:hover': { boxShadow: 3 }, transition: 'box-shadow 0.2s' }}
          onClick={() => openKpiDetail('pending', 'Active Pending Checkouts')}
        >
          <CardContent sx={{ py: 2, '&:last-child': { pb: 2 } }}>
            <Typography variant="body2" color="text.secondary">Active Pending</Typography>
            <Typography variant="h4" sx={{ color: '#DC2626', fontWeight: 700 }}>
              {stats?.total_pending ?? '—'}
            </Typography>
          </CardContent>
        </Card>
      </Grid>
      <Grid item xs={6} md={3}>
        <Card
          sx={{ bgcolor: '#F0FDF4', border: '1px solid #BBF7D0', cursor: 'pointer', '&:hover': { boxShadow: 3 }, transition: 'box-shadow 0.2s' }}
          onClick={() => openKpiDetail('resolved', 'Resolved (Last 30 Days)')}
        >
          <CardContent sx={{ py: 2, '&:last-child': { pb: 2 } }}>
            <Typography variant="body2" color="text.secondary">Resolved (30d)</Typography>
            <Typography variant="h4" sx={{ color: '#16A34A', fontWeight: 700 }}>
              {stats?.resolved_last_30d ?? '—'}
            </Typography>
          </CardContent>
        </Card>
      </Grid>
      <Grid item xs={6} md={3}>
        <Card sx={{ bgcolor: '#EFF6FF', border: '1px solid #BFDBFE' }}>
          <CardContent sx={{ py: 2, '&:last-child': { pb: 2 } }}>
            <Typography variant="body2" color="text.secondary">Avg Resolution</Typography>
            <Typography variant="h4" sx={{ color: '#2563EB', fontWeight: 700 }}>
              {stats?.avg_resolution_hours ? formatHours(stats.avg_resolution_hours) : '—'}
            </Typography>
          </CardContent>
        </Card>
      </Grid>
      <Grid item xs={6} md={3}>
        <Card
          sx={{ bgcolor: '#FDF4FF', border: '1px solid #E9D5FF', cursor: 'pointer', '&:hover': { boxShadow: 3 }, transition: 'box-shadow 0.2s' }}
          onClick={() => openKpiDetail('repeat_offenders', 'Repeat Offenders (90 Days)')}
        >
          <CardContent sx={{ py: 2, '&:last-child': { pb: 2 } }}>
            <Typography variant="body2" color="text.secondary">Repeat Offenders</Typography>
            <Typography variant="h4" sx={{ color: '#9333EA', fontWeight: 700 }}>
              {stats?.repeat_offenders ?? '—'}
            </Typography>
          </CardContent>
        </Card>
      </Grid>
    </Grid>
  );

  // ─── Render: Active Table ──────────────────────────────────────────

  const renderActiveTable = () => (
    <>
      {/* Filters + Bulk Actions */}
      <Box sx={{ display: 'flex', flexWrap: 'wrap', gap: 2, mb: 2, alignItems: 'center' }}>
        <FormControl size="small" sx={{ minWidth: 140 }}>
          <InputLabel>Status</InputLabel>
          <Select value={statusFilter} label="Status" onChange={(e) => setStatusFilter(e.target.value)}>
            <MenuItem value="">All</MenuItem>
            <MenuItem value="pending">Pending</MenuItem>
            <MenuItem value="soft_sent">Soft Sent</MenuItem>
            <MenuItem value="hard_sent">Hard Sent</MenuItem>
            <MenuItem value="resolved">Resolved</MenuItem>
          </Select>
        </FormControl>
        <TextField
          size="small"
          type="date"
          label="From"
          InputLabelProps={{ shrink: true }}
          value={dateRange.start}
          onChange={(e) => setDateRange(prev => ({ ...prev, start: e.target.value }))}
        />
        <TextField
          size="small"
          type="date"
          label="To"
          InputLabelProps={{ shrink: true }}
          value={dateRange.end}
          onChange={(e) => setDateRange(prev => ({ ...prev, end: e.target.value }))}
        />
        <Box sx={{ flexGrow: 1 }} />
        {selected.size > 0 && (
          <>
            <Typography variant="body2" sx={{ alignSelf: 'center', fontWeight: 600 }}>
              {selected.size} selected
            </Typography>
            <Button
              size="small"
              variant="outlined"
              color="primary"
              startIcon={<EnvelopeIcon className="h-4 w-4" />}
              onClick={() => handleBatchEmail('soft')}
            >
              Send Soft
            </Button>
            <Button
              size="small"
              variant="outlined"
              color="error"
              startIcon={<EnvelopeIcon className="h-4 w-4" />}
              onClick={() => handleBatchEmail('hard')}
            >
              Send Hard
            </Button>
          </>
        )}
        <Tooltip title="Run detection now">
          <IconButton size="small" onClick={handleRunDetection}>
            <ArrowPathIcon className="h-5 w-5" />
          </IconButton>
        </Tooltip>
      </Box>

      {loading ? (
        <Box sx={{ display: 'flex', justifyContent: 'center', py: 6 }}>
          <CircularProgress />
        </Box>
      ) : failedCheckouts.length === 0 ? (
        <Alert severity="info">No failed checkouts found for the selected filters.</Alert>
      ) : (
        <TableContainer component={Paper} sx={{ maxHeight: 600 }}>
          <Table stickyHeader size="small">
            <TableHead>
              <TableRow>
                <TableCell padding="checkbox">
                  <Checkbox
                    indeterminate={selected.size > 0 && selected.size < unresolvedItems.length}
                    checked={unresolvedItems.length > 0 && selected.size === unresolvedItems.length}
                    onChange={handleSelectAll}
                  />
                </TableCell>
                <TableCell>
                  <TableSortLabel active={orderBy === 'tutor_first_name'} direction={orderBy === 'tutor_first_name' ? order : 'asc'} onClick={() => handleSort('tutor_first_name')}>
                    Tutor
                  </TableSortLabel>
                </TableCell>
                <TableCell>
                  <TableSortLabel active={orderBy === 'lesson_date'} direction={orderBy === 'lesson_date' ? order : 'asc'} onClick={() => handleSort('lesson_date')}>
                    Lesson Date
                  </TableSortLabel>
                </TableCell>
                <TableCell>
                  <TableSortLabel active={orderBy === 'hours_late'} direction={orderBy === 'hours_late' ? order : 'asc'} onClick={() => handleSort('hours_late')}>
                    Hours Late
                  </TableSortLabel>
                </TableCell>
                <TableCell>Student / Client</TableCell>
                <TableCell>Service</TableCell>
                <TableCell>Status</TableCell>
                <TableCell align="right">Actions</TableCell>
              </TableRow>
            </TableHead>
            <TableBody>
              {sortedCheckouts.map((fc) => {
                const tutorName = `${fc.tutor_first_name || ''} ${fc.tutor_last_name || ''}`.trim() || 'Unknown';
                return (
                  <TableRow key={fc.id} hover selected={selected.has(fc.id)}>
                    <TableCell padding="checkbox">
                      {fc.status !== 'resolved' && (
                        <Checkbox checked={selected.has(fc.id)} onChange={() => handleSelect(fc.id)} />
                      )}
                    </TableCell>
                    <TableCell>
                      <Typography
                        variant="body2"
                        sx={{ cursor: 'pointer', color: 'primary.main', fontWeight: 500, '&:hover': { textDecoration: 'underline' } }}
                        onClick={() => openTutorHistory(fc.contractor_id, tutorName)}
                      >
                        {tutorName}
                      </Typography>
                    </TableCell>
                    <TableCell>
                      <Typography variant="body2">{formatDateTime(fc.lesson_date)}</Typography>
                    </TableCell>
                    <TableCell>
                      <Typography
                        variant="body2"
                        sx={{
                          fontWeight: 600,
                          color: parseFloat(fc.hours_late) > 168 ? '#DC2626'
                            : parseFloat(fc.hours_late) > 72 ? '#D97706'
                            : '#374151',
                        }}
                      >
                        {formatHours(fc.hours_late)}
                      </Typography>
                    </TableCell>
                    <TableCell>
                      <Typography variant="body2" noWrap sx={{ maxWidth: 200 }}>
                        {fc.student_names || '—'}
                      </Typography>
                      <Typography variant="caption" color="text.secondary" noWrap sx={{ maxWidth: 200, display: 'block' }}>
                        {fc.client_names || ''}
                      </Typography>
                    </TableCell>
                    <TableCell>
                      {fc.appointment_id ? (
                        <Typography
                          component="a"
                          href={`https://account.acmeops.com/cal/appointments/${fc.appointment_id}/`}
                          target="_blank"
                          rel="noopener noreferrer"
                          variant="body2"
                          noWrap
                          sx={{ maxWidth: 180, display: 'block', color: 'primary.main', textDecoration: 'none', '&:hover': { textDecoration: 'underline' } }}
                        >
                          {fc.service_name || '—'}
                        </Typography>
                      ) : (
                        <Typography variant="body2" noWrap sx={{ maxWidth: 180 }}>
                          {fc.service_name || '—'}
                        </Typography>
                      )}
                    </TableCell>
                    <TableCell>
                      <StatusChip status={fc.status} />
                    </TableCell>
                    <TableCell align="right">
                      {fc.status !== 'resolved' && (
                        <Box sx={{ display: 'flex', gap: 0.5, justifyContent: 'flex-end' }}>
                          {!fc.soft_email_sent_at && (
                            <Tooltip title="Send soft reminder">
                              <IconButton
                                size="small"
                                color="primary"
                                onClick={() => handleSendEmail(fc.id, 'soft')}
                                disabled={sendingEmail === fc.id}
                              >
                                {sendingEmail === fc.id ? <CircularProgress size={16} /> : <EnvelopeIcon className="h-4 w-4" />}
                              </IconButton>
                            </Tooltip>
                          )}
                          {fc.soft_email_sent_at && !fc.hard_email_sent_at && (
                            <Tooltip title="Send hard reminder">
                              <IconButton
                                size="small"
                                color="error"
                                onClick={() => handleSendEmail(fc.id, 'hard')}
                                disabled={sendingEmail === fc.id}
                              >
                                {sendingEmail === fc.id ? <CircularProgress size={16} /> : <ExclamationTriangleIcon className="h-4 w-4" />}
                              </IconButton>
                            </Tooltip>
                          )}
                          <Tooltip title="Mark resolved">
                            <IconButton size="small" color="success" onClick={() => handleResolve(fc.id)}>
                              <CheckCircleIcon className="h-4 w-4" />
                            </IconButton>
                          </Tooltip>
                        </Box>
                      )}
                      {fc.status === 'resolved' && (
                        <Typography variant="caption" color="text.secondary">
                          {formatHours(fc.resolution_hours)}
                        </Typography>
                      )}
                    </TableCell>
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
        </TableContainer>
      )}
    </>
  );

  // ─── Render: Tally View ────────────────────────────────────────────

  const renderTallyView = () => {
    const { periods, tutors, grid } = buildTallyGrid();

    return (
      <>
        <Box sx={{ display: 'flex', gap: 2, mb: 2, alignItems: 'center' }}>
          <FormControl size="small" sx={{ minWidth: 140 }}>
            <InputLabel>Period</InputLabel>
            <Select value={periodType} label="Period" onChange={(e) => setPeriodType(e.target.value)}>
              <MenuItem value="weekly">Weekly</MenuItem>
              <MenuItem value="biweekly">Biweekly</MenuItem>
            </Select>
          </FormControl>
          <TextField
            size="small"
            type="date"
            label="From"
            InputLabelProps={{ shrink: true }}
            value={dateRange.start}
            onChange={(e) => setDateRange(prev => ({ ...prev, start: e.target.value }))}
          />
          <TextField
            size="small"
            type="date"
            label="To"
            InputLabelProps={{ shrink: true }}
            value={dateRange.end}
            onChange={(e) => setDateRange(prev => ({ ...prev, end: e.target.value }))}
          />
        </Box>

        {loading ? (
          <Box sx={{ display: 'flex', justifyContent: 'center', py: 6 }}>
            <CircularProgress />
          </Box>
        ) : tutors.length === 0 ? (
          <Alert severity="info">No tally data found for the selected date range.</Alert>
        ) : (
          <TableContainer component={Paper} sx={{ maxHeight: 600 }}>
            <Table stickyHeader size="small">
              <TableHead>
                <TableRow>
                  <TableCell sx={{ fontWeight: 700, minWidth: 160, position: 'sticky', left: 0, zIndex: 3, bgcolor: 'background.paper' }}>
                    Tutor
                  </TableCell>
                  {periods.map(p => (
                    <TableCell key={p} align="center" sx={{ fontWeight: 600, fontSize: '0.75rem', minWidth: 100 }}>
                      {p}
                    </TableCell>
                  ))}
                </TableRow>
              </TableHead>
              <TableBody>
                {tutors.map(tutor => (
                  <TableRow key={tutor.id} hover>
                    <TableCell sx={{ fontWeight: 500, position: 'sticky', left: 0, zIndex: 1, bgcolor: 'background.paper' }}>
                      <Typography
                        variant="body2"
                        sx={{ cursor: 'pointer', color: 'primary.main', '&:hover': { textDecoration: 'underline' } }}
                        onClick={() => openTutorHistory(tutor.id, tutor.name)}
                      >
                        {tutor.name}
                      </Typography>
                    </TableCell>
                    {periods.map(p => {
                      const cell = grid[`${tutor.id}:${p}`];
                      return (
                        <TableCell
                          key={p}
                          align="center"
                          sx={{ bgcolor: getTallyCellColor(cell), fontWeight: cell ? 600 : 400 }}
                        >
                          {cell ? cell.failed_count : ''}
                        </TableCell>
                      );
                    })}
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </TableContainer>
        )}

        {/* Legend */}
        <Box sx={{ display: 'flex', gap: 3, mt: 2 }}>
          <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
            <Box sx={{ width: 16, height: 16, borderRadius: 1, bgcolor: '#D1FAE5' }} />
            <Typography variant="caption">All Resolved</Typography>
          </Box>
          <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
            <Box sx={{ width: 16, height: 16, borderRadius: 1, bgcolor: '#FEF3C7' }} />
            <Typography variant="caption">Soft Sent</Typography>
          </Box>
          <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
            <Box sx={{ width: 16, height: 16, borderRadius: 1, bgcolor: '#FEE2E2' }} />
            <Typography variant="caption">Pending / Hard Sent</Typography>
          </Box>
        </Box>
      </>
    );
  };

  // ─── Render: Settings ──────────────────────────────────────────────

  const renderSettings = () => {
    if (!config) return <CircularProgress />;

    return (
      <Card sx={{ maxWidth: 600 }}>
        <CardContent>
          <Typography variant="h6" gutterBottom>Failed Checkout Settings</Typography>
          <Divider sx={{ mb: 3 }} />

          <Box sx={{ display: 'flex', flexDirection: 'column', gap: 3 }}>
            <FormControlLabel
              control={
                <Switch
                  checked={config.enabled ?? true}
                  onChange={(e) => setConfig({ ...config, enabled: e.target.checked })}
                />
              }
              label="Enable automated detection"
            />

            <TextField
              label="Detection Threshold (hours)"
              type="number"
              size="small"
              value={config.detection_hours ?? 24}
              onChange={(e) => setConfig({ ...config, detection_hours: parseInt(e.target.value, 10) || 24 })}
              helperText="Hours after lesson before flagging as failed checkout"
              sx={{ maxWidth: 300 }}
            />

            <TextField
              label="Escalation Recipients"
              size="small"
              value={(config.escalation_recipients || []).join(', ')}
              onChange={(e) => setConfig({
                ...config,
                escalation_recipients: e.target.value.split(',').map(s => s.trim()).filter(Boolean),
              })}
              helperText="Comma-separated email addresses"
            />

            <TextField
              label="Soft Email Subject"
              size="small"
              value={config.soft_email_subject || ''}
              onChange={(e) => setConfig({ ...config, soft_email_subject: e.target.value })}
            />

            <TextField
              label="Hard Email Subject"
              size="small"
              value={config.hard_email_subject || ''}
              onChange={(e) => setConfig({ ...config, hard_email_subject: e.target.value })}
            />

            <Button variant="contained" onClick={handleSaveConfig} sx={{ alignSelf: 'flex-start' }}>
              Save Settings
            </Button>
          </Box>
        </CardContent>
      </Card>
    );
  };

  // ─── Render: Tutor History Drawer ──────────────────────────────────

  const renderTutorDrawer = () => (
    <Drawer anchor="right" open={drawerOpen} onClose={() => setDrawerOpen(false)} PaperProps={{ sx: { width: { xs: '100%', md: 480 } } }}>
      <Box sx={{ p: 3 }}>
        <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mb: 3 }}>
          <Box>
            <Typography variant="h6">{drawerTutor?.name || 'Tutor'}</Typography>
            <Typography variant="body2" color="text.secondary">Failed Checkout History</Typography>
          </Box>
          <IconButton onClick={() => setDrawerOpen(false)}>
            <XMarkIcon className="h-5 w-5" />
          </IconButton>
        </Box>

        <Divider sx={{ mb: 2 }} />

        {tutorHistoryLoading ? (
          <Box sx={{ display: 'flex', justifyContent: 'center', py: 4 }}>
            <CircularProgress />
          </Box>
        ) : tutorHistory.length === 0 ? (
          <Alert severity="info">No failed checkout history found.</Alert>
        ) : (
          <>
            {/* Summary stats for this tutor */}
            <Grid container spacing={2} sx={{ mb: 3 }}>
              <Grid item xs={4}>
                <Typography variant="caption" color="text.secondary">Total</Typography>
                <Typography variant="h6">{tutorHistory.length}</Typography>
              </Grid>
              <Grid item xs={4}>
                <Typography variant="caption" color="text.secondary">Resolved</Typography>
                <Typography variant="h6" sx={{ color: '#16A34A' }}>
                  {tutorHistory.filter(h => h.status === 'resolved').length}
                </Typography>
              </Grid>
              <Grid item xs={4}>
                <Typography variant="caption" color="text.secondary">Avg Resolve</Typography>
                <Typography variant="h6" sx={{ color: '#2563EB' }}>
                  {(() => {
                    const resolved = tutorHistory.filter(h => h.resolution_hours);
                    if (!resolved.length) return '—';
                    const avg = resolved.reduce((sum, h) => sum + parseFloat(h.resolution_hours), 0) / resolved.length;
                    return formatHours(avg);
                  })()}
                </Typography>
              </Grid>
            </Grid>

            {/* History list */}
            {tutorHistory.map((h) => (
              <Card key={h.id} sx={{ mb: 1.5 }} variant="outlined">
                <CardContent sx={{ py: 1.5, '&:last-child': { pb: 1.5 } }}>
                  <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                    <Box>
                      <Typography variant="body2" sx={{ fontWeight: 500 }}>
                        {h.appointment_id ? (
                          <a
                            href={`https://account.acmeops.com/cal/appointments/${h.appointment_id}/`}
                            target="_blank"
                            rel="noopener noreferrer"
                            style={{ color: '#1976d2', textDecoration: 'none' }}
                            onMouseOver={(e) => e.target.style.textDecoration = 'underline'}
                            onMouseOut={(e) => e.target.style.textDecoration = 'none'}
                          >
                            {formatDateTime(h.lesson_date)}
                          </a>
                        ) : formatDateTime(h.lesson_date)}
                      </Typography>
                      <Typography variant="caption" color="text.secondary">
                        {h.service_name || 'Unknown service'} {h.student_names ? `- ${h.student_names}` : ''}
                      </Typography>
                    </Box>
                    <Box sx={{ textAlign: 'right' }}>
                      <StatusChip status={h.status} />
                      {h.resolution_hours && (
                        <Typography variant="caption" display="block" color="text.secondary">
                          Resolved in {formatHours(h.resolution_hours)}
                        </Typography>
                      )}
                    </Box>
                  </Box>
                  {h.notes && (
                    <Typography variant="caption" sx={{ mt: 1, display: 'block', color: 'text.secondary', fontStyle: 'italic' }}>
                      {h.notes}
                    </Typography>
                  )}
                </CardContent>
              </Card>
            ))}
          </>
        )}
      </Box>
    </Drawer>
  );

  // ─── Render: KPI Detail Modal ─────────────────────────────────────

  const renderKpiDetailModal = () => {
    const isRepeat = kpiModal.type === 'repeat_offenders';
    const isResolved = kpiModal.type === 'resolved';

    return (
      <Dialog
        open={kpiModal.open}
        onClose={() => setKpiModal({ open: false, type: null, title: '' })}
        maxWidth="md"
        fullWidth
      >
        <DialogTitle sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <Typography variant="h6">{kpiModal.title}</Typography>
          <IconButton onClick={() => setKpiModal({ open: false, type: null, title: '' })} size="small">
            <XMarkIcon className="h-5 w-5" />
          </IconButton>
        </DialogTitle>
        <DialogContent>
          {kpiDetailLoading ? (
            <Box sx={{ display: 'flex', justifyContent: 'center', py: 4 }}>
              <CircularProgress />
            </Box>
          ) : kpiDetailData.length === 0 ? (
            <Alert severity="info">No data found.</Alert>
          ) : isRepeat ? (
            /* ── Repeat Offenders: tutor-level aggregated table ── */
            <>
              <Typography variant="body2" color="text.secondary" sx={{ mb: 2 }}>
                Tutors with 3+ failed checkouts in the last 90 days. Click a name to view history.
              </Typography>
              <TableContainer component={Paper} sx={{ maxHeight: 500 }}>
                <Table stickyHeader size="small">
                  <TableHead>
                    <TableRow>
                      <TableCell>
                        <TableSortLabel active={kpiDetailSort.field === 'tutor_first_name'} direction={kpiDetailSort.field === 'tutor_first_name' ? kpiDetailSort.dir : 'asc'} onClick={() => handleKpiSort('tutor_first_name')}>
                          Tutor
                        </TableSortLabel>
                      </TableCell>
                      <TableCell align="center">
                        <TableSortLabel active={kpiDetailSort.field === 'total_offenses'} direction={kpiDetailSort.field === 'total_offenses' ? kpiDetailSort.dir : 'asc'} onClick={() => handleKpiSort('total_offenses')}>
                          Total
                        </TableSortLabel>
                      </TableCell>
                      <TableCell align="center">
                        <TableSortLabel active={kpiDetailSort.field === 'active_count'} direction={kpiDetailSort.field === 'active_count' ? kpiDetailSort.dir : 'asc'} onClick={() => handleKpiSort('active_count')}>
                          Active
                        </TableSortLabel>
                      </TableCell>
                      <TableCell align="center">
                        <TableSortLabel active={kpiDetailSort.field === 'resolved_count'} direction={kpiDetailSort.field === 'resolved_count' ? kpiDetailSort.dir : 'asc'} onClick={() => handleKpiSort('resolved_count')}>
                          Resolved
                        </TableSortLabel>
                      </TableCell>
                      <TableCell>
                        <TableSortLabel active={kpiDetailSort.field === 'latest_offense'} direction={kpiDetailSort.field === 'latest_offense' ? kpiDetailSort.dir : 'asc'} onClick={() => handleKpiSort('latest_offense')}>
                          Latest
                        </TableSortLabel>
                      </TableCell>
                    </TableRow>
                  </TableHead>
                  <TableBody>
                    {sortedKpiDetail.map((row) => {
                      const name = `${row.tutor_first_name || ''} ${row.tutor_last_name || ''}`.trim() || 'Unknown';
                      return (
                        <TableRow key={row.contractor_id} hover>
                          <TableCell>
                            <Typography
                              variant="body2"
                              sx={{ cursor: 'pointer', color: 'primary.main', fontWeight: 500, '&:hover': { textDecoration: 'underline' } }}
                              onClick={() => {
                                setKpiModal({ open: false, type: null, title: '' });
                                openTutorHistory(row.contractor_id, name);
                              }}
                            >
                              {name}
                            </Typography>
                          </TableCell>
                          <TableCell align="center">
                            <Typography variant="body2" sx={{ fontWeight: 700 }}>{row.total_offenses}</Typography>
                          </TableCell>
                          <TableCell align="center">
                            <Typography variant="body2" sx={{ color: parseInt(row.active_count) > 0 ? '#DC2626' : '#374151' }}>
                              {row.active_count}
                            </Typography>
                          </TableCell>
                          <TableCell align="center">
                            <Typography variant="body2" sx={{ color: '#16A34A' }}>{row.resolved_count}</Typography>
                          </TableCell>
                          <TableCell>
                            <Typography variant="body2">{formatDateTime(row.latest_offense)}</Typography>
                          </TableCell>
                        </TableRow>
                      );
                    })}
                  </TableBody>
                </Table>
              </TableContainer>
            </>
          ) : (
            /* ── Pending / Resolved: appointment-level table ── */
            <TableContainer component={Paper} sx={{ maxHeight: 500 }}>
              <Table stickyHeader size="small">
                <TableHead>
                  <TableRow>
                    <TableCell>
                      <TableSortLabel active={kpiDetailSort.field === 'tutor_first_name'} direction={kpiDetailSort.field === 'tutor_first_name' ? kpiDetailSort.dir : 'asc'} onClick={() => handleKpiSort('tutor_first_name')}>
                        Tutor
                      </TableSortLabel>
                    </TableCell>
                    <TableCell>
                      <TableSortLabel active={kpiDetailSort.field === 'lesson_date'} direction={kpiDetailSort.field === 'lesson_date' ? kpiDetailSort.dir : 'asc'} onClick={() => handleKpiSort('lesson_date')}>
                        Lesson Date
                      </TableSortLabel>
                    </TableCell>
                    <TableCell>
                      <TableSortLabel active={kpiDetailSort.field === 'hours_late'} direction={kpiDetailSort.field === 'hours_late' ? kpiDetailSort.dir : 'asc'} onClick={() => handleKpiSort('hours_late')}>
                        Hours Late
                      </TableSortLabel>
                    </TableCell>
                    <TableCell>Student</TableCell>
                    <TableCell>Service</TableCell>
                    <TableCell>Status</TableCell>
                    {isResolved && <TableCell>Resolved In</TableCell>}
                  </TableRow>
                </TableHead>
                <TableBody>
                  {sortedKpiDetail.map((row) => {
                    const name = `${row.tutor_first_name || ''} ${row.tutor_last_name || ''}`.trim() || 'Unknown';
                    return (
                      <TableRow key={row.id} hover>
                        <TableCell>
                          <Typography
                            variant="body2"
                            sx={{ cursor: 'pointer', color: 'primary.main', fontWeight: 500, '&:hover': { textDecoration: 'underline' } }}
                            onClick={() => {
                              setKpiModal({ open: false, type: null, title: '' });
                              openTutorHistory(row.contractor_id, name);
                            }}
                          >
                            {name}
                          </Typography>
                        </TableCell>
                        <TableCell>
                          <Typography variant="body2">{formatDateTime(row.lesson_date)}</Typography>
                        </TableCell>
                        <TableCell>
                          <Typography variant="body2" sx={{ fontWeight: 600 }}>{formatHours(row.hours_late)}</Typography>
                        </TableCell>
                        <TableCell>
                          <Typography variant="body2" noWrap sx={{ maxWidth: 160 }}>{row.student_names || '—'}</Typography>
                        </TableCell>
                        <TableCell>
                          {row.appointment_id ? (
                            <Typography
                              component="a"
                              href={`https://account.acmeops.com/cal/appointments/${row.appointment_id}/`}
                              target="_blank"
                              rel="noopener noreferrer"
                              variant="body2"
                              noWrap
                              sx={{ maxWidth: 160, display: 'block', color: 'primary.main', textDecoration: 'none', '&:hover': { textDecoration: 'underline' } }}
                            >
                              {row.service_name || '—'}
                            </Typography>
                          ) : (
                            <Typography variant="body2" noWrap sx={{ maxWidth: 160 }}>{row.service_name || '—'}</Typography>
                          )}
                        </TableCell>
                        <TableCell><StatusChip status={row.status} /></TableCell>
                        {isResolved && (
                          <TableCell>
                            <Typography variant="body2">{formatHours(row.resolution_hours)}</Typography>
                          </TableCell>
                        )}
                      </TableRow>
                    );
                  })}
                </TableBody>
              </Table>
            </TableContainer>
          )}
        </DialogContent>
      </Dialog>
    );
  };

  // ─── Main Render ───────────────────────────────────────────────────

  return (
    <Box>
      {error && (
        <Alert severity="error" sx={{ mb: 2 }} onClose={() => setError(null)}>
          {error}
        </Alert>
      )}

      {renderSummaryCards()}

      {/* View Toggle */}
      <Box sx={{ display: 'flex', gap: 1, mb: 2 }}>
        <Button
          size="small"
          variant={viewMode === 'active' ? 'contained' : 'outlined'}
          startIcon={<FunnelIcon className="h-4 w-4" />}
          onClick={() => setViewMode('active')}
        >
          Active Checkouts
        </Button>
        <Button
          size="small"
          variant={viewMode === 'tally' ? 'contained' : 'outlined'}
          startIcon={<TableCellsIcon className="h-4 w-4" />}
          onClick={() => setViewMode('tally')}
        >
          Tally View
        </Button>
        <Button
          size="small"
          variant={viewMode === 'settings' ? 'contained' : 'outlined'}
          startIcon={<Cog6ToothIcon className="h-4 w-4" />}
          onClick={() => setViewMode('settings')}
        >
          Settings
        </Button>
      </Box>

      {viewMode === 'active' && renderActiveTable()}
      {viewMode === 'tally' && renderTallyView()}
      {viewMode === 'settings' && renderSettings()}

      {renderTutorDrawer()}
      {renderKpiDetailModal()}

      <Snackbar
        open={snackbar.open}
        autoHideDuration={4000}
        onClose={() => setSnackbar(prev => ({ ...prev, open: false }))}
        anchorOrigin={{ vertical: 'bottom', horizontal: 'center' }}
      >
        <Alert severity={snackbar.severity} onClose={() => setSnackbar(prev => ({ ...prev, open: false }))}>
          {snackbar.message}
        </Alert>
      </Snackbar>
    </Box>
  );
};

export default FailedCheckoutsTab;
