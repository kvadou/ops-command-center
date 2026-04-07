import React, { useState, useEffect } from 'react';
import {
  Box,
  Typography,
  Card,
  CardContent,
  Grid,
  Chip,
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TableRow,
  Paper,
  Alert,
  CircularProgress,
  Tooltip,
  IconButton
} from '@mui/material';
import { ArrowPathIcon, InformationCircleIcon } from '@heroicons/react/24/outline';

/**
 * DynoRestartsPanel - Display Heroku dyno restart information
 */
export default function DynoRestartsPanel({ environment, timeRange = '24h' }) {
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  const fetchDynoRestarts = async () => {
    try {
      setLoading(true);
      setError(null);
      const params = new URLSearchParams();
      if (environment) params.append('environment', environment);
      params.append('range', timeRange);
      params.append('limit', '50');

      const response = await fetch(`/api/devops/metrics/dyno-restarts?${params.toString()}`);
      if (!response.ok) {
        throw new Error('Failed to fetch dyno restarts');
      }
      const result = await response.json();
      setData(result);
    } catch (err) {
      console.error('Error fetching dyno restarts:', err);
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchDynoRestarts();
    // Refresh every 60 seconds
    const interval = setInterval(fetchDynoRestarts, 60000);
    return () => clearInterval(interval);
  }, [environment, timeRange]);

  const getReasonColor = (reason) => {
    switch (reason) {
      case 'crash_restart':
        return 'error';
      case 'manual_restart':
        return 'warning';
      case 'automatic_restart':
        return 'info';
      default:
        return 'default';
    }
  };

  const getReasonLabel = (reason) => {
    switch (reason) {
      case 'crash_restart':
        return 'Crash';
      case 'manual_restart':
        return 'Manual';
      case 'automatic_restart':
        return 'Auto';
      case 'possible_restart':
        return 'Possible';
      default:
        return reason || 'Unknown';
    }
  };

  if (loading && !data) {
    return (
      <Card sx={{ height: '100%' }}>
        <CardContent>
          <Box sx={{ display: 'flex', justifyContent: 'center', p: 3 }}>
            <CircularProgress />
          </Box>
        </CardContent>
      </Card>
    );
  }

  if (error) {
    return (
      <Card sx={{ height: '100%' }}>
        <CardContent>
          <Alert severity="error">{error}</Alert>
        </CardContent>
      </Card>
    );
  }

  const restarts = data?.restarts || [];
  const byApp = data?.byApp || [];
  const summary = data?.summary || [];

  return (
    <Card sx={{ height: '100%' }}>
      <CardContent>
        <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mb: 2 }}>
          <Typography variant="h6" sx={{ fontWeight: 600, display: 'flex', alignItems: 'center', gap: 1 }}>
            <ArrowPathIcon className="h-5 w-5 text-primary-500" />
            Dyno Restarts
          </Typography>
          <IconButton size="small" onClick={fetchDynoRestarts}>
            <ArrowPathIcon className="h-4 w-4" />
          </IconButton>
        </Box>

        {summary.length > 0 && (
          <Grid container spacing={2} sx={{ mb: 3 }}>
            {summary.map((stat, idx) => (
              <Grid item xs={12} sm={6} md={4} key={idx}>
                <Paper sx={{ p: 2, bgcolor: 'grey.50', borderRadius: 1 }}>
                  <Typography variant="body2" color="text.secondary" gutterBottom>
                    {stat.appName}
                  </Typography>
                  <Typography variant="h5" sx={{ fontWeight: 600 }}>
                    {stat.totalRestarts}
                  </Typography>
                  <Typography variant="caption" color="text.secondary">
                    {stat.uniqueDynos} unique dyno{stat.uniqueDynos !== 1 ? 's' : ''}
                  </Typography>
                  {stat.lastRestart && (
                    <Typography variant="caption" color="text.secondary" sx={{ display: 'block', mt: 0.5 }}>
                      Last: {new Date(stat.lastRestart).toLocaleString()}
                    </Typography>
                  )}
                </Paper>
              </Grid>
            ))}
          </Grid>
        )}

        {restarts.length === 0 ? (
          <Alert severity="success" sx={{ borderRadius: 2 }}>
            No dyno restarts detected in the last {timeRange}
          </Alert>
        ) : (
          <TableContainer component={Paper} sx={{ maxHeight: 400, overflow: 'auto' }}>
            <Table stickyHeader size="small">
              <TableHead>
                <TableRow>
                  <TableCell sx={{ fontWeight: 600 }}>Time</TableCell>
                  <TableCell sx={{ fontWeight: 600 }}>App</TableCell>
                  <TableCell sx={{ fontWeight: 600 }}>Dyno</TableCell>
                  <TableCell sx={{ fontWeight: 600 }}>Reason</TableCell>
                  <TableCell sx={{ fontWeight: 600 }}>Details</TableCell>
                </TableRow>
              </TableHead>
              <TableBody>
                {restarts.map((restart) => (
                  <TableRow key={restart.id} hover>
                    <TableCell>
                      <Typography variant="body2">
                        {new Date(restart.detectedAt).toLocaleString()}
                      </Typography>
                    </TableCell>
                    <TableCell>
                      <Chip 
                        label={restart.appName} 
                        size="small"
                        variant="outlined"
                      />
                    </TableCell>
                    <TableCell>
                      <Typography variant="body2" sx={{ fontFamily: 'monospace' }}>
                        {restart.dynoName || 'unknown'}
                      </Typography>
                    </TableCell>
                    <TableCell>
                      <Chip
                        label={getReasonLabel(restart.reason)}
                        size="small"
                        color={getReasonColor(restart.reason)}
                      />
                    </TableCell>
                    <TableCell>
                      {restart.context?.state && (
                        <Tooltip title={`State: ${restart.context.state}, Size: ${restart.context.size || 'N/A'}`}>
                          <InformationCircleIcon className="h-4 w-4 text-neutral-500" />
                        </Tooltip>
                      )}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </TableContainer>
        )}

        {restarts.length > 0 && (
          <Alert severity="warning" sx={{ mt: 2, borderRadius: 2 }}>
            <Typography variant="body2">
              <strong>{restarts.length}</strong> dyno restart{restarts.length !== 1 ? 's' : ''} detected. 
              Monitor for patterns indicating infrastructure issues.
            </Typography>
          </Alert>
        )}
      </CardContent>
    </Card>
  );
}

