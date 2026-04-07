import React, { useState } from 'react';
import {
  Drawer,
  Box,
  Typography,
  IconButton,
  Chip,
  Divider,
  Paper,
  Button,
  TextField,
  Accordion,
  AccordionSummary,
  AccordionDetails,
  List,
  ListItem,
  ListItemText
} from '@mui/material';
import {
  XMarkIcon,
  ChevronDownIcon,
  EyeIcon,
  PencilSquareIcon,
  ClockIcon,
  ExclamationTriangleIcon,
  ExclamationCircleIcon,
  InformationCircleIcon
} from '@heroicons/react/24/outline';
import { CheckCircleIcon } from '@heroicons/react/24/solid';

/**
 * AlertDetailsSidebar - Right-hand collapsible sidebar for alert details
 * Similar to Linear's issue detail panel
 */
export default function AlertDetailsSidebar({
  alert,
  open,
  onClose,
  onUpdate,
  isLoading = false
}) {
  const [resolutionNotes, setResolutionNotes] = useState('');
  
  if (!alert) return null;

  const handleUpdate = (status) => {
    if (onUpdate) {
      onUpdate(alert.id, status, resolutionNotes);
      if (status === 'resolved') {
        setResolutionNotes(''); // Clear notes after resolving
      }
    }
  };

  const getSeverityIcon = () => {
    switch (alert.severity) {
      case 'critical': return <ExclamationCircleIcon className="h-5 w-5 text-red-600" />;
      case 'high': return <ExclamationTriangleIcon className="h-5 w-5 text-amber-500" />;
      case 'medium': return <InformationCircleIcon className="h-5 w-5 text-blue-500" />;
      default: return <CheckCircleIcon className="h-5 w-5 text-green-600" />;
    }
  };

  const getStatusColor = (status) => {
    switch (status) {
      case 'open': return 'error';
      case 'acknowledged': return 'warning';
      case 'resolved': return 'success';
      default: return 'default';
    }
  };

  return (
    <Drawer
      anchor="right"
      open={open}
      onClose={onClose}
      PaperProps={{
        sx: {
          width: { xs: '100%', sm: 480, md: 600 },
          bgcolor: 'background.paper',
          borderLeft: '1px solid',
          borderColor: 'divider'
        }
      }}
    >
      <Box sx={{ display: 'flex', flexDirection: 'column', height: '100%' }}>
        {/* Header */}
        <Box
          sx={{
            p: 2,
            borderBottom: '1px solid',
            borderColor: 'divider',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            bgcolor: 'background.paper',
            position: 'sticky',
            top: 0,
            zIndex: 1
          }}
        >
          <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, flex: 1, minWidth: 0 }}>
            {getSeverityIcon()}
            <Typography variant="h6" sx={{ fontWeight: 600, flex: 1, overflow: 'hidden', textOverflow: 'ellipsis' }}>
              {alert.title || 'Alert Details'}
            </Typography>
          </Box>
          <IconButton onClick={onClose} size="small">
            <XMarkIcon className="h-5 w-5" />
          </IconButton>
        </Box>

        {/* Content */}
        <Box sx={{ flex: 1, overflowY: 'auto', p: 2 }}>
          {isLoading ? (
            <Box sx={{ display: 'flex', justifyContent: 'center', p: 4 }}>
              <Typography color="text.secondary">Loading...</Typography>
            </Box>
          ) : (
            <>
              {/* Status and Severity */}
              <Box sx={{ display: 'flex', gap: 1, mb: 2, flexWrap: 'wrap' }}>
                <Chip
                  label={alert.severity?.toUpperCase()}
                  color={alert.severity === 'critical' ? 'error' : 
                         alert.severity === 'high' ? 'warning' : 'default'}
                  size="small"
                  sx={{ fontWeight: 600 }}
                />
                <Chip
                  label={alert.status?.toUpperCase()}
                  color={getStatusColor(alert.status)}
                  size="small"
                  variant="outlined"
                />
                <Chip
                  label={alert.environment}
                  size="small"
                  variant="outlined"
                />
                <Chip
                  label={alert.alert_type}
                  size="small"
                  variant="outlined"
                />
              </Box>

              {/* Message */}
              <Paper sx={{ p: 2, mb: 2, bgcolor: 'grey.50' }}>
                <Typography variant="subtitle2" sx={{ mb: 1, fontWeight: 600 }}>
                  Message
                </Typography>
                <Typography variant="body2" sx={{ whiteSpace: 'pre-wrap' }}>
                  {alert.message || 'No message provided'}
                </Typography>
              </Paper>

              {/* Details Accordion */}
              <Accordion defaultExpanded>
                <AccordionSummary expandIcon={<ChevronDownIcon className="h-5 w-5" />}>
                  <Typography variant="subtitle2" sx={{ fontWeight: 600 }}>
                    Details
                  </Typography>
                </AccordionSummary>
                <AccordionDetails>
                  <List dense>
                    <ListItem>
                      <ListItemText
                        primary="Environment"
                        secondary={alert.environment || 'N/A'}
                      />
                    </ListItem>
                    <ListItem>
                      <ListItemText
                        primary="Source"
                        secondary={alert.source || 'N/A'}
                      />
                    </ListItem>
                    <ListItem>
                      <ListItemText
                        primary="Created"
                        secondary={alert.created_at ? new Date(alert.created_at).toLocaleString() : 'N/A'}
                      />
                    </ListItem>
                    {alert.resolved_at && (
                      <ListItem>
                        <ListItemText
                          primary="Resolved"
                          secondary={new Date(alert.resolved_at).toLocaleString()}
                        />
                      </ListItem>
                    )}
                    {alert.resolved_by && (
                      <ListItem>
                        <ListItemText
                          primary="Resolved By"
                          secondary={alert.resolved_by}
                        />
                      </ListItem>
                    )}
                  </List>
                </AccordionDetails>
              </Accordion>

              {/* Log Entry */}
              {alert.log_entry && (
                <Accordion>
                  <AccordionSummary expandIcon={<ChevronDownIcon className="h-5 w-5" />}>
                    <Typography variant="subtitle2" sx={{ fontWeight: 600 }}>
                      Log Entry
                    </Typography>
                  </AccordionSummary>
                  <AccordionDetails>
                    <Paper
                      sx={{
                        p: 2,
                        bgcolor: 'grey.900',
                        color: 'grey.100',
                        fontFamily: 'monospace',
                        fontSize: '0.75rem',
                        borderRadius: 1,
                        overflow: 'auto',
                        maxHeight: 200
                      }}
                    >
                      {alert.log_entry}
                    </Paper>
                  </AccordionDetails>
                </Accordion>
              )}

              {/* Context */}
              {alert.context && (
                <Accordion>
                  <AccordionSummary expandIcon={<ChevronDownIcon className="h-5 w-5" />}>
                    <Typography variant="subtitle2" sx={{ fontWeight: 600 }}>
                      Context
                    </Typography>
                  </AccordionSummary>
                  <AccordionDetails>
                    <Paper
                      sx={{
                        p: 2,
                        bgcolor: 'grey.50',
                        borderRadius: 1,
                        maxHeight: 300,
                        overflow: 'auto'
                      }}
                    >
                      <pre style={{ margin: 0, fontSize: '0.75rem', whiteSpace: 'pre-wrap' }}>
                        {JSON.stringify(alert.context, null, 2)}
                      </pre>
                    </Paper>
                  </AccordionDetails>
                </Accordion>
              )}

              {/* Resolution Notes - Show existing notes */}
              {alert.resolution_notes && (
                <Accordion>
                  <AccordionSummary expandIcon={<ChevronDownIcon className="h-5 w-5" />}>
                    <Typography variant="subtitle2" sx={{ fontWeight: 600 }}>
                      Resolution Notes
                    </Typography>
                  </AccordionSummary>
                  <AccordionDetails>
                    <Paper sx={{ p: 2, bgcolor: 'success.light', borderRadius: 1 }}>
                      <Typography variant="body2" sx={{ whiteSpace: 'pre-wrap' }}>
                        {alert.resolution_notes}
                      </Typography>
                    </Paper>
                  </AccordionDetails>
                </Accordion>
              )}

              {/* Resolution Notes Input - Only show for open/acknowledged alerts */}
              {(alert.status === 'open' || alert.status === 'acknowledged') && !alert.resolution_notes && (
                <Accordion defaultExpanded>
                  <AccordionSummary expandIcon={<ChevronDownIcon className="h-5 w-5" />}>
                    <Typography variant="subtitle2" sx={{ fontWeight: 600 }}>
                      Resolution Notes (optional)
                    </Typography>
                  </AccordionSummary>
                  <AccordionDetails>
                    <TextField
                      fullWidth
                      multiline
                      rows={4}
                      placeholder="Add notes about how this alert was resolved..."
                      value={resolutionNotes}
                      onChange={(e) => setResolutionNotes(e.target.value)}
                      variant="outlined"
                      sx={{ mt: 1 }}
                    />
                  </AccordionDetails>
                </Accordion>
              )}
            </>
          )}
        </Box>

        {/* Footer Actions */}
        {(alert.status === 'open' || alert.status === 'acknowledged') && (
          <Box
            sx={{
              p: 2,
              borderTop: '1px solid',
              borderColor: 'divider',
              bgcolor: 'background.paper',
              position: 'sticky',
              bottom: 0
            }}
          >
            <Box sx={{ display: 'flex', gap: 1 }}>
              {alert.status === 'open' && (
                <Button
                  variant="outlined"
                  color="warning"
                  fullWidth
                  onClick={() => handleUpdate('acknowledged')}
                  disabled={isLoading}
                >
                  Acknowledge
                </Button>
              )}
              <Button
                variant="contained"
                color="success"
                fullWidth
                onClick={() => handleUpdate('resolved')}
                disabled={isLoading}
              >
                Resolve
              </Button>
            </Box>
          </Box>
        )}
      </Box>
    </Drawer>
  );
}

