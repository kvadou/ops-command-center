import React, { useState, useEffect } from 'react';
import axios from 'axios';
import {
  Box,
  Button,
  Card,
  CardContent,
  Typography,
  LinearProgress,
  Alert,
  AlertTitle,
  Chip,
  Stack,
  Paper,
  List,
  ListItem,
  ListItemText,
  Divider,
  CircularProgress,
  Dialog,
  DialogTitle,
  DialogContent,
  DialogContentText,
  DialogActions,
  Snackbar
} from '@mui/material';
import { ArrowPathIcon, ExclamationCircleIcon, ClockIcon, PlayIcon, StopIcon } from '@heroicons/react/24/outline';
import { CheckCircleIcon } from '@heroicons/react/24/solid';

const SyncManager = () => {
  const [syncStatus, setSyncStatus] = useState(null);
  const [loading, setLoading] = useState(false);
  const [stepLoading, setStepLoading] = useState(null);
  const [error, setError] = useState(null);
  const [autoRefresh, setAutoRefresh] = useState(false);
  const [confirmDialog, setConfirmDialog] = useState({ open: false, step: null, message: '' });
  const [successSnackbar, setSuccessSnackbar] = useState({ open: false, message: '' });

  const SYNC_ACTIONS = [
    {
      key: 'clients',
      label: 'Sync Clients',
      confirm: 'Sync clients from TutorCruncher? This updates your application database with client and pipeline data from TutorCruncher.',
      description: 'Syncs TutorCruncher clients and pipeline information to your application database'
    },
    {
      key: 'services',
      label: 'Sync Jobs',
      confirm: 'Sync jobs from TutorCruncher? This updates lesson types and availability.',
      description: 'Syncs lesson types and availability'
    },
    {
      key: 'appointments',
      label: 'Sync Lessons',
      confirm: 'Sync lessons from TutorCruncher? This updates lesson records.',
      description: 'Syncs lessons/appointments'
    },
    {
      key: 'invoices',
      label: 'Sync Invoices',
      confirm: 'Sync invoices from TutorCruncher? This updates invoice records.',
      description: 'Syncs invoice data'
    },
    {
      key: 'paymentOrders',
      label: 'Sync Payment Orders',
      confirm: 'Sync payment orders from TutorCruncher? This updates payment order records.',
      description: 'Syncs payment orders'
    },
    {
      key: 'adhocCharges',
      label: 'Sync Adhoc Charges',
      confirm: 'Sync adhoc charges from TutorCruncher? This updates adhoc charge records.',
      description: 'Syncs adhoc charges'
    },
    {
      key: 'adhocChargeCategories',
      label: 'Sync Adhoc Charge Categories',
      confirm: 'Sync adhoc charge categories from TutorCruncher? This updates category definitions.',
      description: 'Syncs adhoc charge categories'
    },
    {
      key: 'contractors',
      label: 'Sync Tutors',
      confirm: 'Sync tutors from TutorCruncher? This updates tutor records.',
      description: 'Syncs tutors'
    },
    {
      key: 'proformaInvoices',
      label: 'Sync Proforma Invoices',
      confirm: 'Sync proforma invoices from TutorCruncher? This updates proforma invoice records.',
      description: 'Syncs proforma invoices'
    }
  ];

  // Map step names to user-friendly display names
  const getStepDisplayName = (stepName) => {
    const nameMap = {
      'services': 'Jobs',
      'appointments': 'Lessons',
      'contractors': 'Tutors',
      'clients': 'Clients',
      'invoices': 'Invoices',
      'paymentOrders': 'Payment Orders',
      'adhocCharges': 'Adhoc Charges',
      'adhocChargeCategories': 'Adhoc Charge Categories',
      'proformaInvoices': 'Proforma Invoices'
    };
    
    // Convert camelCase to display format
    const formatted = nameMap[stepName] || stepName.charAt(0).toUpperCase() + stepName.slice(1).replace(/([A-Z])/g, ' $1');
    return formatted;
  };

  // Fetch sync status
  const fetchStatus = async () => {
    try {
      const response = await axios.get('/api/sync/status');
      setSyncStatus(response.data);
      
      // Auto-refresh while sync is running
      if (response.data.isRunning && !autoRefresh) {
        setAutoRefresh(true);
      } else if (!response.data.isRunning && autoRefresh) {
        setAutoRefresh(false);
      }
    } catch (err) {
      console.error('Error fetching sync status:', err);
      setError(err.message);
    }
  };

  // Auto-refresh when sync is running
  useEffect(() => {
    if (autoRefresh) {
      const interval = setInterval(fetchStatus, 2000); // Refresh every 2 seconds
      return () => clearInterval(interval);
    }
  }, [autoRefresh]);

  // Auto-scroll logs to bottom when new logs are added
  const logsEndRef = React.useRef(null);
  useEffect(() => {
    if (syncStatus?.isRunning && logsEndRef.current) {
      logsEndRef.current.scrollIntoView({ behavior: 'smooth' });
    }
  }, [syncStatus?.logs, syncStatus?.isRunning]);

  // Initial fetch
  useEffect(() => {
    fetchStatus();
  }, []);

  // Start sync
  const handleStartSync = () => {
    setConfirmDialog({
      open: true,
      step: null,
      message: 'This will sync all data from TutorCruncher. This may take several minutes. Continue?'
    });
  };

  const handleConfirmStartSync = async () => {
    setConfirmDialog({ open: false, step: null, message: '' });
    setLoading(true);
    setError(null);

    try {
      const response = await axios.post('/api/sync/start');
      setSuccessSnackbar({ 
        open: true, 
        message: response.data.message || 'Sync started successfully! Check the logs below for progress.' 
      });
      await fetchStatus();
      setAutoRefresh(true);
    } catch (err) {
      console.error('Error starting sync:', err);
      setError(err.response?.data?.error || err.message);
    } finally {
      setLoading(false);
    }
  };

  const handleRunStep = (stepConfig) => {
    if (!stepConfig) return;
    setConfirmDialog({
      open: true,
      step: stepConfig,
      message: stepConfig.confirm
    });
  };

  const handleConfirmRunStep = async () => {
    const stepConfig = confirmDialog.step;
    setConfirmDialog({ open: false, step: null, message: '' });
    
    if (!stepConfig) return;

    setStepLoading(stepConfig.key);
    setError(null);

    try {
      const response = await axios.post('/api/sync/run-step', { step: stepConfig.key });
      setSuccessSnackbar({ 
        open: true, 
        message: response.data.message || `${stepConfig.label} started successfully! Check the logs below for progress.` 
      });
      await fetchStatus();
      setAutoRefresh(true);
    } catch (err) {
      console.error('Error running sync step:', err);
      setError(err.response?.data?.error || err.message);
    } finally {
      setStepLoading(null);
    }
  };

  // Stop sync
  const handleStopSync = () => {
    setConfirmDialog({
      open: true,
      step: 'stop',
      message: 'Are you sure you want to stop the sync? This may leave data in an inconsistent state.'
    });
  };

  const handleConfirmStopSync = async () => {
    setConfirmDialog({ open: false, step: null, message: '' });

    try {
      await axios.post('/api/sync/stop');
      await fetchStatus();
    } catch (err) {
      console.error('Error stopping sync:', err);
      setError(err.response?.data?.error || err.message);
    }
  };

  // Get step status icon
  const getStepIcon = (status) => {
    switch (status) {
      case 'completed':
        return <CheckCircleIcon className="h-6 w-6" style={{ color: '#2e7d32' }} />;
      case 'running':
        return <CircularProgress size={24} />;
      case 'failed':
        return <ExclamationCircleIcon className="h-6 w-6" style={{ color: '#d32f2f' }} />;
      case 'idle':
        return <ClockIcon className="h-6 w-6" style={{ color: '#bdbdbd' }} />;
      default:
        return <ClockIcon className="h-6 w-6" style={{ color: '#bdbdbd' }} />;
    }
  };

  // Get step status color
  const getStepColor = (status) => {
    switch (status) {
      case 'completed':
        return 'success';
      case 'running':
        return 'primary';
      case 'failed':
        return 'error';
      case 'idle':
        return 'default';
      default:
        return 'default';
    }
  };

  // Format duration
  const formatDuration = (startTime, endTime) => {
    if (!startTime) return null;
    const start = new Date(startTime);
    const end = endTime ? new Date(endTime) : new Date();
    const diffMs = end - start;
    const diffSec = Math.floor(diffMs / 1000);
    const diffMin = Math.floor(diffSec / 60);
    const sec = diffSec % 60;
    
    if (diffMin > 0) {
      return `${diffMin}m ${sec}s`;
    }
    return `${sec}s`;
  };

  if (!syncStatus) {
    return (
      <Card>
        <CardContent>
          <Box display="flex" justifyContent="center" alignItems="center" minHeight={200}>
            <CircularProgress />
          </Box>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card>
      <CardContent>
        <Box display="flex" justifyContent="space-between" alignItems="center" mb={3}>
          <Typography variant="h5" component="h2">
            <ArrowPathIcon className="h-5 w-5" style={{ verticalAlign: 'middle', marginRight: 8, display: 'inline-block' }} />
            TutorCruncher Sync Manager
          </Typography>
          
          <Stack direction="row" spacing={2} flexWrap="wrap" useFlexGap>
            <Button
              variant="contained"
              color="primary"
              startIcon={<PlayIcon className="h-5 w-5" />}
              onClick={handleStartSync}
              disabled={syncStatus.isRunning || loading || Boolean(stepLoading)}
            >
              {loading ? 'Starting...' : 'Start Full Sync'}
            </Button>
            
            {syncStatus.isRunning && (
              <Button
                variant="outlined"
                color="error"
                startIcon={<StopIcon className="h-5 w-5" />}
                onClick={handleStopSync}
              >
                Stop Sync
              </Button>
            )}
          </Stack>
        </Box>

        {error && (
          <Alert severity="error" sx={{ mb: 2 }} onClose={() => setError(null)}>
            <AlertTitle>Error</AlertTitle>
            {error}
          </Alert>
        )}

        {syncStatus.error && (
          <Alert severity="error" sx={{ mb: 2 }}>
            <AlertTitle>Sync Failed</AlertTitle>
            {syncStatus.error}
          </Alert>
        )}

        {/* Overall Progress */}
        <Paper elevation={1} sx={{ p: 2, mb: 3 }}>
          <Typography variant="subtitle2" gutterBottom>
            Overall Progress: {syncStatus.progress}%
          </Typography>
          <LinearProgress 
            variant="determinate" 
            value={syncStatus.progress} 
            sx={{ height: 10, borderRadius: 5, mb: 1 }}
          />
          
          <Box display="flex" justifyContent="space-between" alignItems="center" mt={2}>
            <Chip 
              label={syncStatus.isRunning ? 'Syncing...' : syncStatus.endTime ? 'Completed' : 'Ready'}
              color={syncStatus.isRunning ? 'primary' : syncStatus.endTime ? 'success' : 'default'}
              size="small"
            />

          {syncStatus.runType && (
            <Chip 
              label={syncStatus.runType === 'full' ? 'Full Sync' : 'Single Step'}
              size="small"
              variant="outlined"
            />
          )}
            
            {syncStatus.startTime && (
              <Typography variant="caption" color="text.secondary">
                Duration: {formatDuration(syncStatus.startTime, syncStatus.endTime)}
              </Typography>
            )}
          </Box>
        </Paper>

        {/* Sync Steps */}
        <Typography variant="h6" gutterBottom>
          Sync Steps
        </Typography>
        
        <List>
          {Object.entries(syncStatus.steps).map(([stepName, step], index) => {
            const actionConfig = SYNC_ACTIONS.find(a => a.key === stepName);
            return (
              <React.Fragment key={stepName}>
                {index > 0 && <Divider />}
                <ListItem>
                  <Box display="flex" alignItems="center" width="100%" justifyContent="space-between">
                    <Box display="flex" alignItems="center" flex={1}>
                      <Box mr={2}>
                        {getStepIcon(step.status)}
                      </Box>
                      
                      <ListItemText
                        primary={
                          <Box display="flex" alignItems="center" gap={1} flexWrap="wrap">
                            <Typography variant="subtitle1">
                              {getStepDisplayName(stepName)}
                            </Typography>
                            <Chip 
                              label={step.status} 
                              size="small" 
                              color={getStepColor(step.status)}
                            />
                            {step.status === 'running' && (
                              <Box sx={{ width: 150, ml: 1 }}>
                                <LinearProgress size="small" />
                              </Box>
                            )}
                            {step.status === 'running' && syncStatus.currentStep === stepName && (
                              <Chip 
                                label="In Progress"
                                size="small"
                                color="primary"
                                sx={{ ml: 1 }}
                              />
                            )}
                          </Box>
                        }
                        secondaryTypographyProps={{ component: 'div' }}
                        secondary={
                          <>
                            <Typography variant="body2" color="text.secondary" component="div">
                              {step.message}
                            </Typography>
                            <Box component="div" sx={{ display: 'flex', gap: 2, mt: 0.5, flexWrap: 'wrap' }}>
                              {step.startTime && (
                                <Typography variant="caption" color="text.secondary" component="span">
                                  Duration: {formatDuration(step.startTime, step.endTime)}
                                </Typography>
                              )}
                              {step.lastSuccessfulSync && (
                                <Typography variant="caption" color="text.secondary" component="span">
                                  Last sync: {new Date(step.lastSuccessfulSync).toLocaleString()}
                                </Typography>
                              )}
                              {!step.lastSuccessfulSync && step.status !== 'running' && step.status !== 'pending' && (
                                <Typography variant="caption" color="text.secondary" component="span" sx={{ fontStyle: 'italic' }}>
                                  Never synced successfully
                                </Typography>
                              )}
                            </Box>
                          </>
                        }
                      />
                    </Box>
                    
                    {actionConfig && !syncStatus.isRunning && (
                      <Box ml={2}>
                        <Button
                          variant="outlined"
                          size="small"
                          onClick={() => handleRunStep(actionConfig)}
                          disabled={Boolean(stepLoading) || loading}
                          startIcon={<ArrowPathIcon className="h-5 w-5" />}
                        >
                          {stepLoading === actionConfig.key ? 'Syncing...' : actionConfig.label}
                        </Button>
                      </Box>
                    )}
                  </Box>
                </ListItem>
              </React.Fragment>
            );
          })}
        </List>

        {/* Recent Logs - Always show when sync is running or has logs */}
        {(syncStatus.isRunning || (syncStatus.logs && syncStatus.logs.length > 0)) && (
          <Box mt={3}>
            <Box display="flex" justifyContent="space-between" alignItems="center" mb={1}>
              <Typography variant="h6" gutterBottom>
                Sync Logs {syncStatus.isRunning && <CircularProgress size={16} sx={{ ml: 1, verticalAlign: 'middle' }} />}
              </Typography>
              {syncStatus.logs && syncStatus.logs.length > 0 && (
                <Chip 
                  label={`${syncStatus.logs.length} log${syncStatus.logs.length !== 1 ? 's' : ''}`}
                  size="small"
                  variant="outlined"
                />
              )}
            </Box>
            <Paper 
              elevation={0} 
              sx={{ 
                p: 2, 
                bgcolor: syncStatus.isRunning ? 'info.light' : 'grey.100',
                maxHeight: 400, 
                overflow: 'auto',
                fontFamily: 'monospace',
                fontSize: '0.875rem',
                border: syncStatus.isRunning ? '2px solid' : '1px solid',
                borderColor: syncStatus.isRunning ? 'primary.main' : 'grey.300'
              }}
            >
              {syncStatus.logs && syncStatus.logs.length > 0 ? (
                <>
                  {syncStatus.logs.slice(-50).map((log, index) => (
                    <Typography 
                      key={index}
                      variant="body2" 
                      sx={{ 
                        color: log.level === 'error' ? 'error.main' : 
                               log.level === 'warning' ? 'warning.main' :
                               log.level === 'success' ? 'success.main' : 
                               log.level === 'info' ? 'info.main' : 'text.primary',
                        mb: 0.5,
                        whiteSpace: 'pre-wrap',
                        wordBreak: 'break-word'
                      }}
                    >
                      [{new Date(log.timestamp).toLocaleTimeString()}] {log.message}
                    </Typography>
                  ))}
                  <div ref={logsEndRef} />
                </>
              ) : (
                <Typography variant="body2" color="text.secondary" sx={{ fontStyle: 'italic' }}>
                  Waiting for sync to start... Logs will appear here once the sync begins.
                </Typography>
              )}
            </Paper>
          </Box>
        )}

        {/* Info Box */}
        <Alert severity="info" sx={{ mt: 3 }}>
          <AlertTitle>About TutorCruncher Sync</AlertTitle>
          This sync pulls all data from TutorCruncher including jobs, lessons, invoices, 
          and payment orders. The sync typically takes 5-10 minutes depending on data volume. 
          Your analytics dashboard will reflect the updated data immediately after sync completes.
        </Alert>

        {/* Confirmation Dialog */}
        <Dialog
          open={confirmDialog.open}
          onClose={() => setConfirmDialog({ open: false, step: null, message: '' })}
          aria-labelledby="confirm-dialog-title"
          aria-describedby="confirm-dialog-description"
        >
          <DialogTitle id="confirm-dialog-title">
            Confirm Sync Action
          </DialogTitle>
          <DialogContent>
            <DialogContentText id="confirm-dialog-description">
              {confirmDialog.message}
            </DialogContentText>
          </DialogContent>
          <DialogActions>
            <Button onClick={() => setConfirmDialog({ open: false, step: null, message: '' })}>
              Cancel
            </Button>
            <Button 
              onClick={() => {
                if (confirmDialog.step === 'stop') {
                  handleConfirmStopSync();
                } else if (confirmDialog.step) {
                  handleConfirmRunStep();
                } else {
                  handleConfirmStartSync();
                }
              }}
              variant="contained"
              color="primary"
              autoFocus
            >
              Confirm
            </Button>
          </DialogActions>
        </Dialog>

        {/* Success Snackbar */}
        <Snackbar
          open={successSnackbar.open}
          autoHideDuration={6000}
          onClose={() => setSuccessSnackbar({ open: false, message: '' })}
          anchorOrigin={{ vertical: 'top', horizontal: 'center' }}
        >
          <Alert 
            onClose={() => setSuccessSnackbar({ open: false, message: '' })}
            severity="success"
            sx={{ width: '100%' }}
          >
            {successSnackbar.message}
          </Alert>
        </Snackbar>
      </CardContent>
    </Card>
  );
};

export default SyncManager;

