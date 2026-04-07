import React, { useState } from 'react';
import { Paper, Typography, Box, Table, TableBody, TableCell, TableContainer, TableHead, TableRow, Chip, Button, IconButton, Tooltip } from '@mui/material';
import { UserPlusIcon, CheckCircleIcon, EyeIcon, InformationCircleIcon } from '@heroicons/react/24/outline';
import { BarChart, Bar, LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip as RechartsTooltip, ResponsiveContainer } from 'recharts';

/**
 * RegistrationFailuresPanel - Shows booking funnel errors
 */
import RegistrationFunnel from '../RegistrationFunnel';
import SubmissionDetailsModal from '../SubmissionDetailsModal';

export default function RegistrationFailuresPanel({
  failures = [],
  trends = [],
  funnelSteps = [],
  funnel = [],
  isLoading = false
}) {
  const [selectedSubmissionId, setSelectedSubmissionId] = useState(null);
  const [modalOpen, setModalOpen] = useState(false);
  const failureCounts = failures.length || 0;

  // Group failures by step
  const stepFailures = failures.reduce((acc, failure) => {
    const step = failure.step || 'unknown';
    acc[step] = (acc[step] || 0) + 1;
    return acc;
  }, {});

  const stepData = Object.entries(stepFailures).map(([step, count]) => ({
    step,
    count
  })).sort((a, b) => b.count - a.count);

  // Default funnel steps if not provided
  const defaultSteps = [
    { step: 'form_start', label: 'Form Start', failures: stepFailures.form_start || 0 },
    { step: 'form_progress', label: 'Form Progress', failures: stepFailures.form_progress || 0 },
    { step: 'payment', label: 'Payment', failures: stepFailures.payment || 0 },
    { step: 'submission', label: 'Submission', failures: stepFailures.submission || 0 }
  ];

  const funnelData = funnelSteps.length > 0 ? funnelSteps : defaultSteps;

  return (
    <Paper
      sx={{
        p: 3,
        borderRadius: 2,
        border: '1px solid',
        borderColor: 'divider',
        background: 'white'
      }}
    >
      <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, mb: 3 }}>
        <UserPlusIcon className="h-6 w-6 text-error-500" />
        <Typography variant="h6" sx={{ fontWeight: 600 }}>
          Registration Failures
        </Typography>
        <Chip
          label={failureCounts}
          color="error"
          size="small"
          sx={{ ml: 'auto' }}
        />
      </Box>

      {isLoading ? (
        <Box sx={{ display: 'flex', justifyContent: 'center', p: 4 }}>
          <Typography color="text.secondary">Loading registration failures...</Typography>
        </Box>
      ) : (
        <>
          {/* Enhanced Funnel Visualization */}
          {(funnel && funnel.length > 0) || funnelSteps.length > 0 ? (
            <Box sx={{ mb: 3 }}>
              <RegistrationFunnel 
                funnelSteps={funnel || funnelSteps} 
                isLoading={isLoading}
              />
            </Box>
          ) : (
            <Box sx={{ mb: 3, height: 200 }}>
              <Typography variant="subtitle2" sx={{ mb: 1, color: 'text.secondary' }}>
                Failures by Funnel Step
              </Typography>
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={funnelData} layout="vertical">
                  <CartesianGrid strokeDasharray="3 3" stroke="#e5e7eb" />
                  <XAxis type="number" stroke="#6b7280" fontSize={12} />
                  <YAxis 
                    dataKey="label" 
                    type="category" 
                    width={120}
                    stroke="#6b7280"
                    fontSize={11}
                  />
                  <RechartsTooltip />
                  <Bar dataKey="failures" fill="#ef4444" radius={[0, 4, 4, 0]} />
                </BarChart>
              </ResponsiveContainer>
            </Box>
          )}

          {/* Trend Chart */}
          {trends.length > 0 && (
            <Box sx={{ mb: 3, height: 150 }}>
              <Typography variant="subtitle2" sx={{ mb: 1, color: 'text.secondary' }}>
                Failure Rate Trend (Last 24h)
              </Typography>
              <ResponsiveContainer width="100%" height="100%">
                <LineChart data={trends}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#e5e7eb" />
                  <XAxis 
                    dataKey="time" 
                    stroke="#6b7280"
                    fontSize={11}
                  />
                  <YAxis 
                    stroke="#6b7280"
                    fontSize={12}
                  />
                  <RechartsTooltip />
                  <Line 
                    type="monotone" 
                    dataKey="failures" 
                    stroke="#ef4444" 
                    strokeWidth={2}
                    dot={{ fill: '#ef4444', r: 3 }}
                  />
                </LineChart>
              </ResponsiveContainer>
            </Box>
          )}

          {/* Recent Failures Table */}
          {failures.length > 0 ? (
            <TableContainer>
              <Table size="small">
                <TableHead>
                  <TableRow>
                    <TableCell>Time</TableCell>
                    <TableCell>Step</TableCell>
                    <TableCell>Error</TableCell>
                    <TableCell>Submission ID</TableCell>
                  </TableRow>
                </TableHead>
                <TableBody>
                  {failures.slice(0, 10).map((failure, index) => (
                    <TableRow 
                      key={index} 
                      hover
                      sx={{ cursor: failure.submissionId ? 'pointer' : 'default' }}
                      onClick={() => {
                        if (failure.submissionId) {
                          setSelectedSubmissionId(failure.submissionId);
                          setModalOpen(true);
                        }
                      }}
                    >
                      <TableCell>{failure.timestamp ? new Date(failure.timestamp).toLocaleString() : 'N/A'}</TableCell>
                      <TableCell>
                        <Chip
                          label={failure.step || 'unknown'}
                          size="small"
                          color={failure.severity === 'critical' || failure.severity === 'high' ? 'error' : 'warning'}
                          variant="outlined"
                        />
                      </TableCell>
                      <TableCell sx={{ maxWidth: 400 }}>
                        <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                          <Typography variant="body2" sx={{ 
                            overflow: 'hidden',
                            textOverflow: 'ellipsis',
                            display: '-webkit-box',
                            WebkitLineClamp: 2,
                            WebkitBoxOrient: 'vertical'
                          }}>
                            {failure.error || 'Unknown error'}
                          </Typography>
                          {failure.submissionData && (
                            <Tooltip title="Has detailed submission data">
                              <InformationCircleIcon className="h-4 w-4 text-info-500" />
                            </Tooltip>
                          )}
                        </Box>
                      </TableCell>
                      <TableCell>
                        {failure.submissionId ? (
                          <Button
                            variant="outlined"
                            size="small"
                            startIcon={<EyeIcon className="h-4 w-4" />}
                            onClick={(e) => {
                              e.stopPropagation();
                              setSelectedSubmissionId(failure.submissionId);
                              setModalOpen(true);
                            }}
                            sx={{ textTransform: 'none' }}
                          >
                            {failure.submissionId}
                          </Button>
                        ) : (
                          <Typography variant="body2" color="text.secondary">N/A</Typography>
                        )}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </TableContainer>
          ) : (
            <Box sx={{ textAlign: 'center', py: 4 }}>
              <CheckCircleIcon className="h-12 w-12 text-success-500 mb-1" />
              <Typography variant="body2" color="text.secondary">
                No registration failures in the last 24 hours
              </Typography>
            </Box>
          )}
        </>
      )}

      {/* Submission Details Modal */}
      <SubmissionDetailsModal
        open={modalOpen}
        onClose={() => {
          setModalOpen(false);
          setSelectedSubmissionId(null);
        }}
        submissionId={selectedSubmissionId}
        failureData={failures.find(f => f.submissionId === selectedSubmissionId)}
      />
    </Paper>
  );
}

