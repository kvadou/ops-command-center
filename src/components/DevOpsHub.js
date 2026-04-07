import React, { useState, useEffect } from 'react';
import { useToast } from '../hooks/useToast';
import {
  Box,
  Typography,
  Card,
  CardContent,
  Grid,
  Chip,
  Button,
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TableRow,
  Paper,
  Select,
  MenuItem,
  FormControl,
  InputLabel,
  TextField,
  Alert,
  CircularProgress,
  Tabs,
  Tab,
  IconButton,
  Tooltip,
  ToggleButtonGroup,
  ToggleButton,
  Drawer,
  Divider,
  Checkbox
} from '@mui/material';
import {
  ArrowPathIcon,
  ExclamationTriangleIcon,
  ExclamationCircleIcon,
  InformationCircleIcon,
  EyeIcon,
  PencilSquareIcon,
  ClockIcon,
  SparklesIcon,
  AcademicCapIcon,
  ChartBarIcon,
  Squares2X2Icon,
  XMarkIcon,
  SunIcon,
  MoonIcon,
  CheckIcon
} from '@heroicons/react/24/outline';
import { CheckCircleIcon } from '@heroicons/react/24/solid';

// Import new enhanced components
import MetricCard from './devops/MetricCard';
import EnvironmentHealthCard from './devops/EnvironmentHealthCard';
import EnhancedFilters from './devops/EnhancedFilters';
import AlertDetailsSidebar from './devops/AlertDetailsSidebar';
import SystemHealthScore from './devops/SystemHealthScore';
import LearningCenter from './devops/LearningCenter';
import PaymentFailuresPanel from './devops/metric-panels/PaymentFailuresPanel';
import RegistrationFailuresPanel from './devops/metric-panels/RegistrationFailuresPanel';
import ApiPerformancePanel from './devops/metric-panels/ApiPerformancePanel';
import NodePerformancePanel from './devops/metric-panels/NodePerformancePanel';
import DatabasePerformancePanel from './devops/metric-panels/DatabasePerformancePanel';
import DynoRestartsPanel from './devops/metric-panels/DynoRestartsPanel';
import EnvironmentHealthDonut from './devops/EnvironmentHealthDonut';
import ErrorCategoryBarChart from './devops/ErrorCategoryBarChart';

const severityColors = {
  critical: 'error',
  high: 'warning',
  medium: 'info',
  low: 'default'
};

const statusColors = {
  open: 'error',
  acknowledged: 'warning',
  resolved: 'success',
  dismissed: 'default'
};

export default function DevOpsHub() {
  const toast = useToast();
  // Core state
  const [alerts, setAlerts] = useState([]);
  const [stats, setStats] = useState(null);
  const [healthScore, setHealthScore] = useState(null);
  const [environmentHealth, setEnvironmentHealth] = useState({});
  const [metrics, setMetrics] = useState({});
  const [loading, setLoading] = useState(true);
  const [timeRange, setTimeRange] = useState('24h');
  
  // Filter state - using array format for multiselect
  const [filters, setFilters] = useState({
    status: [],
    severity: [],
    environment: [],
    alert_type: [],
    search: ''
  });
  
  // UI state
  const [selectedTab, setSelectedTab] = useState(0);
  const [selectedAlert, setSelectedAlert] = useState(null);
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [actionLoading, setActionLoading] = useState(false);
  const [darkMode, setDarkMode] = useState(false);
  
  // Bulk selection state
  const [selectedAlertIds, setSelectedAlertIds] = useState(new Set());
  const [bulkResolveLoading, setBulkResolveLoading] = useState(false);
  
  // Tab-specific state
  const [resolvedAlerts, setResolvedAlerts] = useState([]);
  const [agentActivity, setAgentActivity] = useState([]);
  const [learningData, setLearningData] = useState(null);

  // Track if we should suppress health score popup (when navigating from Slack links)
  const [suppressHealthScorePopup, setSuppressHealthScorePopup] = useState(false);

  // Check for query parameters on mount (for deep linking from Slack)
  useEffect(() => {
    const searchParams = new URLSearchParams(window.location.search);
    const tabParam = searchParams.get('tab');
    const alertIdParam = searchParams.get('alertId');

    // If coming from Slack link with alertId, suppress health score popup
    if (alertIdParam || tabParam === 'alerts') {
      setSuppressHealthScorePopup(true);
    }

    // Switch to Active Alerts tab if requested
    if (tabParam === 'alerts') {
      setSelectedTab(1);
    }

    // Store alertId to open after alerts load
    if (alertIdParam) {
      const alertId = parseInt(alertIdParam);
      
      // Clean up URL immediately (remove query params)
      window.history.replaceState({}, '', window.location.pathname);
      
      // Wait for alerts to load, then try to find it
      const openAlertWhenReady = () => {
        // Check if it's already in the alerts list
        const existingAlert = alerts.find(a => a.id === alertId);
        if (existingAlert) {
          setSelectedAlert(existingAlert);
          setSidebarOpen(true);
          setSelectedTab(1);
        } else if (!loading) {
          // If alerts have loaded and it's not in the list, fetch it directly
          fetchAndOpenAlert(alertId);
        }
      };

      // Try immediately, then after a short delay (for when alerts load)
      openAlertWhenReady();
      const timeout = setTimeout(openAlertWhenReady, 2000);
      
      return () => clearTimeout(timeout);
    }
  }, [alerts, loading]); // Re-run when alerts or loading state changes

  // Fetch a specific alert by ID and open it
  const fetchAndOpenAlert = async (alertId) => {
    try {
      const response = await fetch(`/api/devops/alerts/${alertId}`);
      if (response.ok) {
        const alert = await response.json();
        setSelectedAlert(alert);
        setSidebarOpen(true);
        // Ensure we're on the Active Alerts tab
        setSelectedTab(1);
      } else {
        console.error('Failed to fetch alert:', alertId);
      }
    } catch (error) {
      console.error('Error fetching alert:', error);
    }
  };

  // Real-time updates via Server-Sent Events
  useEffect(() => {
    // Connect to SSE for real-time alerts
    const eventSource = new EventSource('/api/devops/realtime/alerts');
    
    eventSource.onmessage = (event) => {
      try {
        const data = JSON.parse(event.data);
        
        if (data.type === 'new_alerts' && data.alerts && data.alerts.length > 0) {
          // Add new alerts to the list
          setAlerts(prev => {
            // Merge new alerts, avoiding duplicates
            const existingIds = new Set(prev.map(a => a.id));
            const newAlerts = data.alerts.filter(a => !existingIds.has(a.id));
            return [...newAlerts, ...prev];
          });
          
          // Refresh stats
          fetchStats();
          fetchHealthScore();
        } else if (data.type === 'status_changes' && data.changes) {
          // Update alert statuses
          setAlerts(prev => prev.map(alert => {
            const change = data.changes.find(c => c.id === alert.id);
            if (change) {
              return { ...alert, status: change.status, resolved_at: change.resolvedAt, resolved_by: change.resolvedBy };
            }
            return alert;
          }));
          
          // Refresh stats
          fetchStats();
          fetchHealthScore();
        }
      } catch (error) {
        console.error('Error parsing SSE message:', error);
      }
    };
    
    eventSource.onerror = (error) => {
      console.error('SSE connection error:', error);
      // SSE will automatically reconnect
    };
    
    return () => {
      eventSource.close();
    };
  }, []); // Only set up once on mount

  // Fetch all data on mount and when filters/timeRange change
  useEffect(() => {
    fetchAllData();
    const interval = setInterval(fetchAllData, 60000); // Refresh every minute (fallback)
    return () => clearInterval(interval);
  }, [filters, timeRange, selectedTab]);

  const fetchAllData = async () => {
    await Promise.all([
      fetchAlerts(),
      fetchStats(),
      fetchHealthScore(),
      fetchEnvironmentHealth(),
      fetchMetrics()
    ]);
    
    if (selectedTab === 2) {
      fetchResolvedAlerts();
    } else if (selectedTab === 3) {
      fetchAgentActivity();
    } else if (selectedTab === 4) {
      fetchLearningData();
    }
  };

  const fetchAlerts = async () => {
    try {
      setLoading(true);
      const params = new URLSearchParams();
      
      // Handle array filters - only append if they have non-empty values
      // Normalize to arrays first, then filter out empty values (null, undefined, empty strings, whitespace)
      const statusValues = Array.isArray(filters.status) 
        ? filters.status.filter(v => v != null && String(v).trim() !== '')
        : (filters.status && String(filters.status).trim() !== '' ? [String(filters.status).trim()] : []);
      statusValues.forEach(s => {
        const value = String(s).trim();
        if (value) {
          params.append('status', value);
        }
      });
      
      const severityValues = Array.isArray(filters.severity)
        ? filters.severity.filter(v => v != null && String(v).trim() !== '')
        : (filters.severity && String(filters.severity).trim() !== '' ? [String(filters.severity).trim()] : []);
      severityValues.forEach(s => {
        const value = String(s).trim();
        if (value) {
          params.append('severity', value);
        }
      });
      
      const environmentValues = Array.isArray(filters.environment)
        ? filters.environment.filter(v => v != null && String(v).trim() !== '')
        : (filters.environment && String(filters.environment).trim() !== '' ? [String(filters.environment).trim()] : []);
      environmentValues.forEach(e => {
        const value = String(e).trim();
        if (value) {
          params.append('environment', value);
        }
      });
      
      const alertTypeValues = Array.isArray(filters.alert_type)
        ? filters.alert_type.filter(v => v != null && String(v).trim() !== '')
        : (filters.alert_type && String(filters.alert_type).trim() !== '' ? [String(filters.alert_type).trim()] : []);
      alertTypeValues.forEach(t => {
        const value = String(t).trim();
        if (value) {
          params.append('alert_type', value);
        }
      });
      
      if (filters.search && typeof filters.search === 'string' && filters.search.trim() !== '') {
        params.append('search', filters.search.trim());
      }
      
      params.append('limit', 100);
      params.append('timeRange', timeRange);

      const response = await fetch(`/api/devops/alerts?${params.toString()}`);
      const data = await response.json();
      setAlerts(data.alerts || []);
    } catch (error) {
      console.error('Error fetching alerts:', error);
    } finally {
      setLoading(false);
    }
  };

  const fetchStats = async () => {
    try {
      const response = await fetch(`/api/devops/alerts/stats?range=${timeRange}`);
      const data = await response.json();
      setStats(data);
    } catch (error) {
      console.error('Error fetching stats:', error);
    }
  };

  const fetchHealthScore = async () => {
    try {
      const response = await fetch('/api/devops/metrics/system-health-score');
      if (response.ok) {
        const data = await response.json();
        setHealthScore(data);
      }
    } catch (error) {
      console.error('Error fetching health score:', error);
    }
  };

  const fetchEnvironmentHealth = async () => {
    try {
      const environments = ['main', 'westside', 'eastside'];
      const healthData = {};
      
      for (const env of environments) {
        try {
          const response = await fetch(`/api/devops/metrics/environment-health?environment=${env}`);
          if (response.ok) {
            const data = await response.json();
            healthData[env] = data;
          }
        } catch (error) {
          console.error(`Error fetching health for ${env}:`, error);
        }
      }
      
      setEnvironmentHealth(healthData);
    } catch (error) {
      console.error('Error fetching environment health:', error);
    }
  };

  const fetchMetrics = async () => {
    try {
      const [apiLatency, paymentFailures, registrationFailures, nodePerf, dbPerf] = await Promise.all([
        fetch(`/api/devops/metrics/api-latency?environment=main&range=${timeRange}`).then(r => r.ok ? r.json() : null).catch(() => null),
        fetch(`/api/devops/metrics/payment-failures?range=${timeRange}`).then(r => r.ok ? r.json() : null).catch(() => null),
        fetch(`/api/devops/metrics/registration-failures?range=${timeRange}`).then(r => r.ok ? r.json() : null).catch(() => null),
        fetch(`/api/devops/metrics/event-loop?environment=main&range=${timeRange}`).then(r => r.ok ? r.json() : null).catch(() => null),
        fetch(`/api/devops/metrics/database?environment=main&range=${timeRange}`).then(r => r.ok ? r.json() : null).catch(() => null)
      ]);

      setMetrics({
        apiLatency,
        paymentFailures,
        registrationFailures,
        nodePerf,
        dbPerf
      });
    } catch (error) {
      console.error('Error fetching metrics:', error);
    }
  };

  const fetchResolvedAlerts = async () => {
    try {
      const response = await fetch('/api/devops/alerts?status=resolved&limit=50&order_by=resolved_at&order_direction=DESC');
      const data = await response.json();
      setResolvedAlerts(data.alerts || []);
    } catch (error) {
      console.error('Error fetching resolved alerts:', error);
    }
  };

  const fetchAgentActivity = async () => {
    try {
      const response = await fetch('/api/devops/alerts?resolved_by=automated-agent&limit=50&order_by=resolved_at&order_direction=DESC');
      const data = await response.json();
      setAgentActivity(data.alerts || []);
    } catch (error) {
      console.error('Error fetching agent activity:', error);
    }
  };

  const fetchLearningData = async () => {
    try {
      // Fetch pattern analysis for learning
      const response = await fetch('/api/devops/alerts/learning');
      if (response.ok) {
        const data = await response.json();
        setLearningData(data);
      } else {
        // If endpoint doesn't exist yet, create summary from resolved alerts
        const resolvedRes = await fetch('/api/devops/alerts?status=resolved&limit=200');
        const resolvedData = await resolvedRes.json();
        
        // Analyze patterns
        const patterns = {};
        resolvedData.alerts?.forEach(alert => {
          const key = alert.title || alert.alert_type;
          if (!patterns[key]) {
            patterns[key] = {
              title: alert.title,
              type: alert.alert_type,
              count: 0,
              firstSeen: alert.created_at,
              lastSeen: alert.resolved_at,
              resolutions: []
            };
          }
          patterns[key].count++;
          if (alert.resolution_notes) {
            patterns[key].resolutions.push({
              notes: alert.resolution_notes,
              resolvedBy: alert.resolved_by,
              resolvedAt: alert.resolved_at
            });
          }
        });

        setLearningData({
          totalResolved: resolvedData.total || 0,
          patterns: Object.values(patterns).sort((a, b) => b.count - a.count),
          agentResolved: resolvedData.alerts?.filter(a => a.resolved_by?.includes('agent')).length || 0,
          manualResolved: resolvedData.alerts?.filter(a => !a.resolved_by?.includes('agent')).length || 0
        });
      }
    } catch (error) {
      console.error('Error fetching learning data:', error);
    }
  };

  const updateAlertStatus = async (alertId, status, notes = '') => {
    try {
      setActionLoading(true);
      const response = await fetch(`/api/devops/alerts/${alertId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ status, resolution_notes: notes })
      });

      if (response.ok) {
        await fetchAlerts();
        await fetchStats();
        if (status === 'resolved') {
          setSidebarOpen(false);
          setSelectedAlert(null);
          // Remove from selected set if it was selected
          setSelectedAlertIds(prev => {
            const newSet = new Set(prev);
            newSet.delete(alertId);
            return newSet;
          });
        }
        // Update the selected alert to reflect the new status
        if (selectedAlert && selectedAlert.id === alertId) {
          setSelectedAlert({ ...selectedAlert, status, resolution_notes: notes || selectedAlert.resolution_notes });
        }
      }
    } catch (error) {
      console.error('Error updating alert:', error);
    } finally {
      setActionLoading(false);
    }
  };

  // Bulk resolve selected alerts
  const handleBulkResolve = async () => {
    if (selectedAlertIds.size === 0) return;
    
    try {
      setBulkResolveLoading(true);
      const response = await fetch('/api/devops/alerts/bulk-resolve', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          alert_ids: Array.from(selectedAlertIds),
          resolution_notes: 'Bulk resolved via DevOps Hub'
        })
      });

      if (response.ok) {
        const data = await response.json();
        console.log(`✅ Bulk resolved ${data.resolved_count} alerts`);
        
        // Clear selection
        setSelectedAlertIds(new Set());
        
        // Refresh data
        await fetchAlerts();
        await fetchStats();
      } else {
        const error = await response.json();
        console.error('Error bulk resolving alerts:', error);
        toast.error(`Failed to resolve alerts: ${error.message || 'Unknown error'}`);
      }
    } catch (error) {
      console.error('Error bulk resolving alerts:', error);
      toast.error(`Failed to resolve alerts: ${error.message}`);
    } finally {
      setBulkResolveLoading(false);
    }
  };

  // Toggle selection for a single alert
  const handleToggleSelection = (alertId, event) => {
    event.stopPropagation(); // Prevent row click
    setSelectedAlertIds(prev => {
      const newSet = new Set(prev);
      if (newSet.has(alertId)) {
        newSet.delete(alertId);
      } else {
        newSet.add(alertId);
      }
      return newSet;
    });
  };

  // Toggle select all
  const handleSelectAll = (event) => {
    event.stopPropagation();
    const sortedAlerts = sortAlertsBySeverity(alerts);
    if (selectedAlertIds.size === sortedAlerts.length) {
      // Deselect all
      setSelectedAlertIds(new Set());
    } else {
      // Select all visible alerts
      setSelectedAlertIds(new Set(sortedAlerts.map(alert => alert.id)));
    }
  };

  const runMonitoring = async () => {
    try {
      setActionLoading(true);
      const response = await fetch('/api/devops/monitor/run', {
        method: 'POST'
      });
      const data = await response.json();
      if (data.success) {
        await fetchAlerts();
        await fetchStats();
      }
    } catch (error) {
      console.error('Error running monitoring:', error);
    } finally {
      setActionLoading(false);
    }
  };

  const handleAlertClick = (alert) => {
    setSelectedAlert(alert);
    setSidebarOpen(true);
  };

  const openAlerts = alerts.filter(a => a.status === 'open');
  const criticalAlerts = alerts.filter(a => a.severity === 'critical' && a.status === 'open');

  const handleTabChange = (event, newValue) => {
    setSelectedTab(newValue);
  };

  // Generate sparkline data for metrics
  const generateSparklineData = (value, count = 12) => {
    return Array.from({ length: count }, (_, i) => ({
      time: i,
      value: value * 0.9 + Math.random() * value * 0.2
    }));
  };

  // Render Dashboard Tab (Overview with all metrics)
  function renderDashboardTab() {
    return (
      <Box>
        {/* Performance Panels */}
        <Grid container spacing={3} sx={{ mb: 3 }}>
          <Grid item xs={12} lg={6}>
            <ApiPerformancePanel
              latency={metrics.apiLatency || { p50: 120, p90: 250, p99: 500 }}
              trends={metrics.apiLatency?.trends || []}
              throughput={metrics.apiLatency?.throughput || 0}
              timeouts={metrics.apiLatency?.timeouts || 0}
              errorRate={metrics.apiLatency?.errorRate || 0}
              isLoading={!metrics.apiLatency}
            />
          </Grid>
          <Grid item xs={12} lg={6}>
            <NodePerformancePanel
              eventLoopLag={metrics.nodePerf?.eventLoopLag || 0}
              memory={metrics.nodePerf?.memory || {}}
              cpu={metrics.nodePerf?.cpu || {}}
              trends={metrics.nodePerf?.trends || []}
              isLoading={!metrics.nodePerf}
            />
          </Grid>
        </Grid>

        <Grid container spacing={3} sx={{ mb: 3 }}>
          <Grid item xs={12} lg={6}>
            <DatabasePerformancePanel
              slowQueries={metrics.dbPerf?.slowQueries || 0}
              connectionPool={metrics.dbPerf?.connectionPool || {}}
              queryTime={metrics.dbPerf?.queryTime || {}}
              trends={metrics.dbPerf?.trends || []}
              isLoading={!metrics.dbPerf}
            />
          </Grid>
          <Grid item xs={12} lg={6}>
            <PaymentFailuresPanel
              failures={metrics.paymentFailures?.failures || []}
              trends={metrics.paymentFailures?.trends || []}
              isLoading={!metrics.paymentFailures}
            />
          </Grid>
        </Grid>

        <Grid container spacing={3}>
          <Grid item xs={12} lg={6}>
            <RegistrationFailuresPanel
              failures={metrics.registrationFailures?.failures || []}
              trends={metrics.registrationFailures?.trends || []}
              funnel={metrics.registrationFailures?.funnel || []}
              isLoading={!metrics.registrationFailures}
            />
          </Grid>
          <Grid item xs={12} lg={6}>
            <DynoRestartsPanel
              environment={null}
              timeRange={timeRange}
            />
          </Grid>
        </Grid>
      </Box>
    );
  }

  // Sort alerts by severity: critical > high > medium > low
  const sortAlertsBySeverity = (alertsList) => {
    const severityOrder = { critical: 0, high: 1, medium: 2, low: 3 };
    return [...alertsList].sort((a, b) => {
      const aSeverity = severityOrder[a.severity?.toLowerCase()] ?? 99;
      const bSeverity = severityOrder[b.severity?.toLowerCase()] ?? 99;
      
      // First sort by severity
      if (aSeverity !== bSeverity) {
        return aSeverity - bSeverity;
      }
      
      // If same severity, sort by created date (newest first)
      return new Date(b.created_at) - new Date(a.created_at);
    });
  };

  function renderActiveAlerts() {
    const sortedAlerts = sortAlertsBySeverity(alerts);
    const allSelected = sortedAlerts.length > 0 && selectedAlertIds.size === sortedAlerts.length;
    const someSelected = selectedAlertIds.size > 0 && selectedAlertIds.size < sortedAlerts.length;
    
    return (
      <>
      {/* Bulk Actions Toolbar */}
      {selectedAlertIds.size > 0 && (
        <Paper
          sx={{
            p: 2,
            mb: 2,
            borderRadius: 2,
            bgcolor: 'primary.light',
            border: '1px solid',
            borderColor: 'primary.main',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            flexWrap: 'wrap',
            gap: 2
          }}
        >
          <Box sx={{ display: 'flex', alignItems: 'center', gap: 2 }}>
            <Typography variant="body1" sx={{ fontWeight: 600, color: 'primary.contrastText' }}>
              {selectedAlertIds.size} alert{selectedAlertIds.size !== 1 ? 's' : ''} selected
            </Typography>
            <Button
              variant="contained"
              color="success"
              size="small"
              startIcon={<CheckIcon className="h-5 w-5" />}
              onClick={handleBulkResolve}
              disabled={bulkResolveLoading}
            >
              {bulkResolveLoading ? 'Resolving...' : `Resolve ${selectedAlertIds.size} Alert${selectedAlertIds.size !== 1 ? 's' : ''}`}
            </Button>
            <Button
              variant="outlined"
              size="small"
              onClick={() => setSelectedAlertIds(new Set())}
              sx={{ color: 'primary.contrastText', borderColor: 'primary.contrastText' }}
            >
              Clear Selection
            </Button>
          </Box>
        </Paper>
      )}

      {/* Enhanced Alerts Table */}
      {loading ? (
        <Box sx={{ display: 'flex', justifyContent: 'center', p: 4 }}>
          <CircularProgress />
        </Box>
      ) : (
        <TableContainer 
          component={Paper}
          sx={{ 
            borderRadius: 2,
            border: '1px solid',
            borderColor: 'divider',
            boxShadow: '0 1px 3px rgba(0,0,0,0.05)',
            overflowX: 'auto', // Horizontal scroll on mobile
            maxWidth: '100%'
          }}
        >
          <Table sx={{ minWidth: { xs: 650, sm: 'auto' } }}>
            <TableHead>
              <TableRow sx={{ bgcolor: 'grey.50' }}>
                <TableCell padding="checkbox" sx={{ width: 48 }}>
                  <Checkbox
                    checked={allSelected}
                    indeterminate={someSelected}
                    onChange={handleSelectAll}
                    size="small"
                  />
                </TableCell>
                <TableCell sx={{ fontWeight: 600, minWidth: { xs: 100, sm: 'auto' } }}>Severity</TableCell>
                <TableCell sx={{ fontWeight: 600, minWidth: { xs: 100, sm: 'auto' } }}>Environment</TableCell>
                <TableCell sx={{ fontWeight: 600, minWidth: { xs: 80, sm: 'auto' } }}>Type</TableCell>
                <TableCell sx={{ fontWeight: 600, minWidth: { xs: 200, sm: 'auto' } }}>Title</TableCell>
                <TableCell sx={{ fontWeight: 600, minWidth: { xs: 80, sm: 'auto' } }}>Status</TableCell>
                <TableCell sx={{ fontWeight: 600, minWidth: { xs: 120, sm: 'auto' }, display: { xs: 'none', md: 'table-cell' } }}>Created</TableCell>
                <TableCell sx={{ fontWeight: 600, minWidth: { xs: 80, sm: 'auto' } }}>Actions</TableCell>
              </TableRow>
            </TableHead>
            <TableBody>
              {sortedAlerts.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={8} align="center" sx={{ py: 4 }}>
                    <CheckCircleIcon className="h-12 w-12 text-green-500 mb-2 mx-auto" />
                    <Typography color="textSecondary">No alerts found</Typography>
                  </TableCell>
                </TableRow>
              ) : (
                sortedAlerts.map((alert) => {
                  const isSelected = selectedAlertIds.has(alert.id);
                  return (
                  <TableRow
                    key={alert.id}
                    selected={isSelected}
                    sx={{
                      backgroundColor: isSelected
                        ? 'action.selected'
                        : (alert.severity === 'critical' && alert.status === 'open' 
                            ? 'error.light' 
                            : 'inherit'),
                      cursor: 'pointer',
                      '&:hover': {
                        bgcolor: isSelected ? 'action.selected' : 'action.hover'
                      }
                    }}
                    onClick={() => handleAlertClick(alert)}
                  >
                    <TableCell padding="checkbox" onClick={(e) => handleToggleSelection(alert.id, e)}>
                      <Checkbox
                        checked={isSelected}
                        size="small"
                        onClick={(e) => handleToggleSelection(alert.id, e)}
                      />
                    </TableCell>
                    <TableCell>
                      <Chip
                        label={alert.severity}
                        color={severityColors[alert.severity] || 'default'}
                        size="small"
                        sx={{ fontWeight: 600 }}
                      />
                    </TableCell>
                    <TableCell>{alert.environment}</TableCell>
                    <TableCell>
                      <Chip
                        label={alert.alert_type}
                        size="small"
                        variant="outlined"
                      />
                    </TableCell>
                    <TableCell>
                      <Typography variant="body2" sx={{ fontWeight: 500 }}>
                        {alert.title}
                      </Typography>
                    </TableCell>
                    <TableCell>
                      <Chip
                        label={alert.status}
                        color={statusColors[alert.status] || 'default'}
                        size="small"
                      />
                    </TableCell>
                    <TableCell>
                      <Typography variant="caption" color="text.secondary">
                        {new Date(alert.created_at).toLocaleString()}
                      </Typography>
                    </TableCell>
                    <TableCell onClick={(e) => e.stopPropagation()}>
                      <Tooltip title="View Details">
                        <IconButton size="small" onClick={() => handleAlertClick(alert)}>
                          <EyeIcon className="h-4 w-4" />
                        </IconButton>
                      </Tooltip>
                    </TableCell>
                  </TableRow>
                  );
                })
              )}
            </TableBody>
          </Table>
        </TableContainer>
      )}
      </>
    );
  }

  function renderResolvedHistory() {
    return (
      <Box>
        <Typography variant="h6" sx={{ mb: 3, fontWeight: 600 }}>
          Recently Resolved Alerts
        </Typography>
        {resolvedAlerts.length === 0 ? (
          <Alert severity="info" sx={{ borderRadius: 2 }}>No resolved alerts found.</Alert>
        ) : (
          <TableContainer 
            component={Paper}
            sx={{
              borderRadius: 2,
              border: '1px solid',
              borderColor: 'divider'
            }}
          >
            <Table>
              <TableHead>
                <TableRow sx={{ bgcolor: 'grey.50' }}>
                  <TableCell sx={{ fontWeight: 600 }}>Resolved</TableCell>
                  <TableCell sx={{ fontWeight: 600 }}>Severity</TableCell>
                  <TableCell sx={{ fontWeight: 600 }}>Environment</TableCell>
                  <TableCell sx={{ fontWeight: 600 }}>Title</TableCell>
                  <TableCell sx={{ fontWeight: 600 }}>Resolved By</TableCell>
                  <TableCell sx={{ fontWeight: 600 }}>Resolution Notes</TableCell>
                  <TableCell sx={{ fontWeight: 600 }}>Actions</TableCell>
                </TableRow>
              </TableHead>
              <TableBody>
                {resolvedAlerts.map((alert) => (
                  <TableRow
                    key={alert.id}
                    sx={{ 
                      cursor: 'pointer',
                      '&:hover': {
                        bgcolor: 'action.hover'
                      }
                    }}
                    onClick={() => handleAlertClick(alert)}
                  >
                    <TableCell>
                      <Typography variant="caption" color="text.secondary">
                        {new Date(alert.resolved_at || alert.updated_at).toLocaleString()}
                      </Typography>
                    </TableCell>
                    <TableCell>
                      <Chip
                        label={alert.severity}
                        color={severityColors[alert.severity] || 'default'}
                        size="small"
                      />
                    </TableCell>
                    <TableCell>{alert.environment}</TableCell>
                    <TableCell>{alert.title}</TableCell>
                    <TableCell>
                      <Chip
                        label={alert.resolved_by?.includes('agent') || alert.resolved_by?.includes('automated') 
                          ? '🤖 Agent' 
                          : '👤 Manual'}
                        color={alert.resolved_by?.includes('agent') || alert.resolved_by?.includes('automated') 
                          ? 'primary' 
                          : 'default'}
                        size="small"
                      />
                    </TableCell>
                    <TableCell sx={{ maxWidth: 300 }}>
                      <Typography variant="body2" noWrap title={alert.resolution_notes || 'No notes'}>
                        {alert.resolution_notes || 'No notes'}
                      </Typography>
                    </TableCell>
                    <TableCell onClick={(e) => e.stopPropagation()}>
                      <Tooltip title="View Details">
                        <IconButton size="small" onClick={() => handleAlertClick(alert)}>
                          <EyeIcon className="h-5 w-5" />
                        </IconButton>
                      </Tooltip>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </TableContainer>
        )}
      </Box>
    );
  }

  function renderAgentActivity() {
    const agentAlerts = agentActivity.length > 0 
      ? agentActivity 
      : alerts.filter(a => a.resolved_by?.includes('agent') || a.resolved_by?.includes('automated'));
    
    return (
      <Box>
        <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mb: 3 }}>
          <Typography variant="h6" sx={{ fontWeight: 600 }}>
            🤖 Agent Auto-Resolution Activity
          </Typography>
          <Button
            variant="outlined"
            startIcon={<SparklesIcon className="h-5 w-5" />}
            onClick={async () => {
              setActionLoading(true);
              try {
                const response = await fetch('/api/devops/remediation/run', {
                  method: 'POST',
                  headers: { 'Content-Type': 'application/json' },
                  body: JSON.stringify({ limit: 10 })
                });
                const data = await response.json();
                if (data.success) {
                  await fetchAllData();
                }
              } catch (error) {
                console.error('Error running remediation:', error);
              } finally {
                setActionLoading(false);
              }
            }}
            disabled={actionLoading}
            size="small"
          >
            Run Auto-Remediation
          </Button>
        </Box>
        
        {agentAlerts.length === 0 ? (
          <Alert severity="info" sx={{ borderRadius: 2 }}>No agent activity yet. Agent will automatically resolve eligible alerts.</Alert>
        ) : (
          <TableContainer 
            component={Paper}
            sx={{
              borderRadius: 2,
              border: '1px solid',
              borderColor: 'divider'
            }}
          >
            <Table>
              <TableHead>
                <TableRow sx={{ bgcolor: 'grey.50' }}>
                  <TableCell sx={{ fontWeight: 600 }}>Resolved</TableCell>
                  <TableCell sx={{ fontWeight: 600 }}>Alert</TableCell>
                  <TableCell sx={{ fontWeight: 600 }}>Severity</TableCell>
                  <TableCell sx={{ fontWeight: 600 }}>Environment</TableCell>
                  <TableCell sx={{ fontWeight: 600 }}>Resolution Notes</TableCell>
                  <TableCell sx={{ fontWeight: 600 }}>Actions</TableCell>
                </TableRow>
              </TableHead>
              <TableBody>
                {agentAlerts.map((alert) => (
                  <TableRow
                    key={alert.id}
                    sx={{ 
                      cursor: 'pointer',
                      '&:hover': {
                        bgcolor: 'action.hover'
                      }
                    }}
                    onClick={() => handleAlertClick(alert)}
                  >
                    <TableCell>
                      <Typography variant="caption" color="text.secondary">
                        {new Date(alert.resolved_at || alert.updated_at).toLocaleString()}
                      </Typography>
                    </TableCell>
                    <TableCell>
                      <Typography variant="body2" sx={{ fontWeight: 500 }}>
                        {alert.title}
                      </Typography>
                      <Typography variant="caption" color="text.secondary">
                        #{alert.id}
                      </Typography>
                    </TableCell>
                    <TableCell>
                      <Chip
                        label={alert.severity}
                        color={severityColors[alert.severity] || 'default'}
                        size="small"
                      />
                    </TableCell>
                    <TableCell>{alert.environment}</TableCell>
                    <TableCell sx={{ maxWidth: 400 }}>
                      <Typography variant="body2" noWrap>
                        {alert.resolution_notes || 'Auto-resolved by agent'}
                      </Typography>
                    </TableCell>
                    <TableCell onClick={(e) => e.stopPropagation()}>
                      <Tooltip title="View Details">
                        <IconButton size="small" onClick={() => handleAlertClick(alert)}>
                          <EyeIcon className="h-5 w-5" />
                        </IconButton>
                      </Tooltip>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </TableContainer>
        )}
      </Box>
    );
  }

  function renderLearningCenter() {
    if (!learningData && selectedTab === 4) {
      fetchLearningData();
      return (
        <Box sx={{ display: 'flex', justifyContent: 'center', p: 3 }}>
          <CircularProgress />
        </Box>
      );
    }

    return (
      <LearningCenter 
        learningData={learningData} 
        onRefresh={fetchLearningData}
      />
    );
  }

  return (
    <Box sx={{ 
      p: { xs: 1, sm: 2, md: 3 }, // Responsive padding
      bgcolor: darkMode ? 'grey.900' : 'grey.50',
      minHeight: '100vh',
      transition: 'background-color 0.3s ease'
    }}>
      {/* Enhanced Header - Controls Only (title is in App.js Header component) */}
      <Box sx={{ 
        display: 'flex', 
        justifyContent: { xs: 'space-between', sm: 'flex-end' }, 
        alignItems: 'center', 
        mb: { xs: 2, sm: 3, md: 4 },
        flexWrap: 'wrap',
        gap: 1
      }}>
        <Box sx={{ display: 'flex', gap: { xs: 1, sm: 2 }, alignItems: 'center', flexWrap: 'wrap' }}>
          <ToggleButtonGroup
            value={timeRange}
            exclusive
            onChange={(e, newValue) => newValue && setTimeRange(newValue)}
            size="small"
          >
            <ToggleButton value="24h">24h</ToggleButton>
            <ToggleButton value="7d">7d</ToggleButton>
            <ToggleButton value="30d">30d</ToggleButton>
          </ToggleButtonGroup>
          <IconButton onClick={() => setDarkMode(!darkMode)} size="small">
            {darkMode ? <SunIcon className="h-5 w-5" /> : <MoonIcon className="h-5 w-5" />}
          </IconButton>
          <Button
            variant="outlined"
            startIcon={<ArrowPathIcon className="h-5 w-5" />}
            onClick={runMonitoring}
            disabled={actionLoading}
            size="small"
          >
            Run Monitoring
          </Button>
          <Button
            variant="outlined"
            startIcon={<ArrowPathIcon className="h-5 w-5" />}
            onClick={fetchAllData}
            disabled={loading}
            size="small"
          >
            Refresh
          </Button>
        </Box>
      </Box>

      {/* System Health Score */}
      {healthScore && (
        <Box sx={{ mb: 4 }}>
          <SystemHealthScore
            score={healthScore.score}
            breakdown={healthScore.breakdown}
            details={healthScore.details || {}}
            isLoading={!healthScore}
            suppressAutoPopup={suppressHealthScorePopup}
            onViewAlerts={(filters) => {
              // Navigate to alerts tab with specific filters
              setFilters(prev => ({ ...prev, ...filters }));
              setSelectedTab(1);
            }}
          />
        </Box>
      )}

      {/* Environment Health Cards */}
      <Grid container spacing={2} sx={{ mb: 4 }}>
        {['main', 'westside', 'eastside'].map((env) => (
          <Grid item xs={12} sm={6} md={4} key={env}>
            <EnvironmentHealthCard
              environment={env}
              status={environmentHealth[env]?.status || 'unknown'}
              metrics={environmentHealth[env] || {}}
              onClick={() => {
                setFilters({ ...filters, environment: [env] });
                setSelectedTab(1);
              }}
              isLoading={!environmentHealth[env]}
            />
          </Grid>
        ))}
      </Grid>

      {/* Enhanced Key Metrics Row */}
      {stats && (
        <Grid container spacing={2} sx={{ mb: 4 }}>
          <Grid item xs={12} sm={6} md={3}>
            <MetricCard
              title="Open Alerts"
              value={stats.open || 0}
              subtitle={`${stats.total || 0} total`}
              sparklineData={generateSparklineData(stats.open || 0)}
              status={stats.open === 0 ? 'success' : stats.open < 5 ? 'warning' : 'error'}
              trend={stats.open > 0 ? { direction: 'up', percentage: 12.5, period: 'vs 24h ago' } : null}
              onClick={() => setSelectedTab(1)}
            />
          </Grid>
          <Grid item xs={12} sm={6} md={3}>
            <MetricCard
              title="Critical Alerts"
              value={stats.critical || 0}
              subtitle="Require immediate attention"
              sparklineData={generateSparklineData(stats.critical || 0)}
              status={stats.critical === 0 ? 'success' : stats.critical < 2 ? 'warning' : 'error'}
              trend={stats.critical > 0 ? { direction: 'up', percentage: 25, period: 'vs 24h ago' } : null}
              onClick={() => {
                setFilters({ ...filters, severity: ['critical'] });
                setSelectedTab(1);
              }}
            />
          </Grid>
          <Grid item xs={12} sm={6} md={3}>
            <MetricCard
              title="Payment Failures"
              value={stats.payment_failures || 0}
              subtitle="Stripe errors"
              sparklineData={metrics.paymentFailures?.trends?.map(t => ({ time: t.time, value: t.failures })) || []}
              status={stats.payment_failures === 0 ? 'success' : stats.payment_failures < 3 ? 'warning' : 'error'}
              trend={stats.payment_failures > 0 ? { direction: 'down', percentage: 8.3, period: 'vs 24h ago' } : null}
              onClick={() => {
                setFilters({ ...filters, alert_type: ['payment_failure'] });
                setSelectedTab(1);
              }}
            />
          </Grid>
          <Grid item xs={12} sm={6} md={3}>
            <MetricCard
              title="Last 24 Hours"
              value={stats.last_24h || 0}
              subtitle="New alerts"
              sparklineData={generateSparklineData(stats.last_24h || 0)}
              status="normal"
              trend={{ direction: 'down', percentage: 15.2, period: 'vs previous' }}
            />
          </Grid>
        </Grid>
      )}

      {/* Charts Row - Donut and Bar Charts */}
      {selectedTab === 0 && stats && (
        <Grid container spacing={3} sx={{ mb: 4 }}>
          <Grid item xs={12} md={6}>
            <EnvironmentHealthDonut environmentHealth={environmentHealth} />
          </Grid>
          <Grid item xs={12} md={6}>
            <ErrorCategoryBarChart alerts={alerts} timeRange={timeRange} />
          </Grid>
        </Grid>
      )}

      {/* Critical Alerts Banner */}
      {criticalAlerts.length > 0 && selectedTab === 1 && (
        <Alert 
          severity="error" 
          sx={{ 
            mb: 3,
            borderRadius: 2,
            boxShadow: '0 2px 8px rgba(211,47,47,0.2)'
          }}
          icon={<ExclamationTriangleIcon className="h-7 w-7" />}
        >
          <Typography variant="h6" sx={{ fontWeight: 600 }}>
            ⚠️ {criticalAlerts.length} Critical Alert{criticalAlerts.length !== 1 ? 's' : ''} Require Immediate Attention
          </Typography>
        </Alert>
      )}

      {/* Enhanced Tabs */}
      <Box sx={{ borderBottom: 1, borderColor: 'divider', mb: 3 }}>
        <Tabs 
          value={selectedTab} 
          onChange={handleTabChange} 
          aria-label="DevOps Hub tabs"
          variant="scrollable"
          scrollButtons="auto"
        >
          <Tab 
            icon={<Squares2X2Icon className="h-5 w-5" />}
            iconPosition="start" 
            label="Dashboard" 
            sx={{ textTransform: 'none', fontWeight: 500 }}
          />
          <Tab 
            icon={<ExclamationTriangleIcon className="h-5 w-5" />}
            iconPosition="start" 
            label={`Active Alerts (${stats?.open || 0})`} 
            sx={{ textTransform: 'none', fontWeight: 500 }}
          />
          <Tab 
            icon={<ClockIcon className="h-5 w-5" />}
            iconPosition="start" 
            label="Resolved History" 
            sx={{ textTransform: 'none', fontWeight: 500 }}
          />
          <Tab 
            icon={<SparklesIcon className="h-5 w-5" />}
            iconPosition="start" 
            label="Agent Activity" 
            sx={{ textTransform: 'none', fontWeight: 500 }}
          />
          <Tab 
            icon={<AcademicCapIcon className="h-5 w-5" />} 
            iconPosition="start" 
            label="Learning Center" 
            sx={{ textTransform: 'none', fontWeight: 500 }}
          />
        </Tabs>
      </Box>

      {/* Enhanced Filters - Only show on Active Alerts tab */}
      {selectedTab === 1 && (
        <EnhancedFilters
          filters={filters}
          onFiltersChange={setFilters}
          options={{
            status: ['open', 'acknowledged', 'resolved', 'dismissed'],
            severity: ['critical', 'high', 'medium', 'low'],
            environment: ['main', 'westside', 'eastside'],
            alert_type: ['error', 'payment_failure', 'performance', 'warning']
          }}
          searchPlaceholder="Search alerts by title, message, or log entry..."
        />
      )}

      {/* Tab Panels */}
      {selectedTab === 0 && renderDashboardTab()}
      {selectedTab === 1 && renderActiveAlerts()}
      {selectedTab === 2 && renderResolvedHistory()}
      {selectedTab === 3 && renderAgentActivity()}
      {selectedTab === 4 && renderLearningCenter()}

      {/* Enhanced Alert Details Sidebar */}
      <AlertDetailsSidebar
        alert={selectedAlert}
        open={sidebarOpen}
        onClose={() => {
          setSidebarOpen(false);
          setSelectedAlert(null);
        }}
        onUpdate={updateAlertStatus}
        isLoading={false}
      />

    </Box>
  );
}
