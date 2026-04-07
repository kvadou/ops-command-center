import React from 'react';
import { Paper, Typography, Box, Table, TableBody, TableCell, TableContainer, TableHead, TableRow, Chip, Tooltip } from '@mui/material';
import { CreditCardIcon, CheckCircleIcon } from '@heroicons/react/24/outline';
import { LineChart, Line, BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip as RechartsTooltip, ResponsiveContainer, Legend } from 'recharts';

/**
 * PaymentFailuresPanel - Shows Stripe payment failures and trends
 */
export default function PaymentFailuresPanel({
  failures = [],
  trends = [],
  isLoading = false
}) {
  const failureCounts = failures.length || 0;
  const recentFailures = failures.slice(0, 10);

  // Group failures by reason
  const failureReasons = failures.reduce((acc, failure) => {
    const reason = failure.reason || 'unknown';
    acc[reason] = (acc[reason] || 0) + 1;
    return acc;
  }, {});

  const reasonData = Object.entries(failureReasons).map(([reason, count]) => ({
    reason,
    count
  })).sort((a, b) => b.count - a.count);

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
        <CreditCardIcon className="h-6 w-6 text-error-500" />
        <Typography variant="h6" sx={{ fontWeight: 600 }}>
          Payment Failures
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
          <Typography color="text.secondary">Loading payment failures...</Typography>
        </Box>
      ) : (
        <>
          {/* Trend Chart */}
          {trends.length > 0 && (
            <Box sx={{ mb: 3, height: 200 }}>
              <Typography variant="subtitle2" sx={{ mb: 1, color: 'text.secondary' }}>
                Failure Rate Trend (Last 24h)
              </Typography>
              <ResponsiveContainer width="100%" height="100%">
                <LineChart data={trends}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#e5e7eb" />
                  <XAxis 
                    dataKey="time" 
                    stroke="#6b7280"
                    fontSize={12}
                  />
                  <YAxis 
                    stroke="#6b7280"
                    fontSize={12}
                    label={{ value: 'Failures', angle: -90, position: 'insideLeft' }}
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

          {/* Failure Reasons Chart */}
          {reasonData.length > 0 && (
            <Box sx={{ mb: 3, height: 150 }}>
              <Typography variant="subtitle2" sx={{ mb: 1, color: 'text.secondary' }}>
                Failures by Reason
              </Typography>
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={reasonData}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#e5e7eb" />
                  <XAxis 
                    dataKey="reason" 
                    stroke="#6b7280"
                    fontSize={11}
                    angle={-45}
                    textAnchor="end"
                    height={60}
                  />
                  <YAxis 
                    stroke="#6b7280"
                    fontSize={12}
                  />
                  <RechartsTooltip />
                  <Bar dataKey="count" fill="#ef4444" radius={[4, 4, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
            </Box>
          )}

          {/* Recent Failures Table */}
          {recentFailures.length > 0 ? (
            <TableContainer>
              <Table size="small">
                <TableHead>
                  <TableRow>
                    <TableCell>Time</TableCell>
                    <TableCell>Customer</TableCell>
                    <TableCell>Amount</TableCell>
                    <TableCell>Reason</TableCell>
                    <TableCell>Status</TableCell>
                  </TableRow>
                </TableHead>
                <TableBody>
                  {recentFailures.map((failure, index) => (
                    <TableRow key={index} hover>
                      <TableCell>{failure.timestamp ? new Date(failure.timestamp).toLocaleString() : 'N/A'}</TableCell>
                      <TableCell>{failure.customerId || failure.email || 'Unknown'}</TableCell>
                      <TableCell>${(failure.amount / 100).toFixed(2)}</TableCell>
                      <TableCell>
                        <Chip
                          label={failure.reason || 'unknown'}
                          size="small"
                          color="error"
                          variant="outlined"
                        />
                      </TableCell>
                      <TableCell>{failure.status || 'failed'}</TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </TableContainer>
          ) : (
            <Box sx={{ textAlign: 'center', py: 4 }}>
              <CheckCircleIcon className="h-12 w-12 text-success-500 mb-1" />
              <Typography variant="body2" color="text.secondary">
                No payment failures in the last 24 hours
              </Typography>
            </Box>
          )}
        </>
      )}
    </Paper>
  );
}

