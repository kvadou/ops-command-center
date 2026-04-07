import React, { useState } from "react";
import {
  Accordion,
  AccordionDetails,
  AccordionSummary,
  Alert,
  Box,
  Button,
  Chip,
  Divider,
  FormControl,
  FormControlLabel,
  Grid,
  InputLabel,
  MenuItem,
  Select,
  Stack,
  Switch,
  TextField,
  Typography,
} from "@mui/material";
import { ChevronDownIcon, ClockIcon, LockClosedIcon, AdjustmentsHorizontalIcon } from '@heroicons/react/24/outline';
import axios from "axios";

/**
 * QR Code Advanced Settings Component
 * 
 * Manages advanced settings like expiration, password protection, 
 * scheduled URLs, and scan restrictions
 */
export default function QRCodeAdvancedSettings({ 
  qrCodeId,
  settings = {},
  onChange,
  onSave 
}) {
  const [saving, setSaving] = useState(false);
  const [expanded, setExpanded] = useState(false);

  const handleChange = (field, value) => {
    onChange?.({ ...settings, [field]: value });
  };

  const handleSave = async () => {
    if (!qrCodeId) return;
    
    try {
      setSaving(true);
      await axios.put(`/api/qr-codes/${qrCodeId}/advanced-settings`, settings);
      onSave?.();
    } catch (err) {
      console.error('Error saving advanced settings:', err);
    } finally {
      setSaving(false);
    }
  };

  return (
    <Box>
      <Typography variant="subtitle2" fontWeight="bold" color="primary" gutterBottom>
        Advanced Settings
      </Typography>

      {/* Dynamic URL Settings */}
      <Accordion 
        expanded={expanded === 'dynamic'} 
        onChange={() => setExpanded(expanded === 'dynamic' ? false : 'dynamic')}
        sx={{ mb: 1 }}
      >
        <AccordionSummary expandIcon={<ChevronDownIcon className="h-5 w-5" />}>
          <Stack direction="row" alignItems="center" spacing={1}>
            <AdjustmentsHorizontalIcon className="h-5 w-5" style={{ color: '#1976d2' }} />
            <Typography variant="body2" fontWeight="medium">Dynamic URL</Typography>
            {settings.is_dynamic && <Chip label="Enabled" size="small" color="success" />}
          </Stack>
        </AccordionSummary>
        <AccordionDetails>
          <Stack spacing={2}>
            <FormControlLabel
              control={
                <Switch
                  checked={settings.is_dynamic || false}
                  onChange={(e) => handleChange('is_dynamic', e.target.checked)}
                />
              }
              label="Enable dynamic URL (can change destination without regenerating QR code)"
            />

            {settings.is_dynamic && (
              <>
                <FormControl fullWidth size="small">
                  <InputLabel>Redirect Type</InputLabel>
                  <Select
                    value={settings.redirect_type || 'permanent'}
                    label="Redirect Type"
                    onChange={(e) => handleChange('redirect_type', e.target.value)}
                  >
                    <MenuItem value="permanent">Permanent (always use main URL)</MenuItem>
                    <MenuItem value="scheduled">Scheduled (switch URL at specific times)</MenuItem>
                  </Select>
                </FormControl>

                {settings.redirect_type === 'scheduled' && (
                  <>
                    <TextField
                      label="Scheduled URL"
                      value={settings.scheduled_url || ''}
                      onChange={(e) => handleChange('scheduled_url', e.target.value)}
                      fullWidth
                      size="small"
                      placeholder="https://example.com/promo"
                      helperText="URL to use during scheduled period"
                    />
                    <Grid container spacing={2}>
                      <Grid item xs={6}>
                        <TextField
                          label="Start Date/Time"
                          type="datetime-local"
                          value={settings.schedule_start_at?.slice(0, 16) || ''}
                          onChange={(e) => handleChange('schedule_start_at', e.target.value)}
                          fullWidth
                          size="small"
                          InputLabelProps={{ shrink: true }}
                        />
                      </Grid>
                      <Grid item xs={6}>
                        <TextField
                          label="End Date/Time"
                          type="datetime-local"
                          value={settings.schedule_end_at?.slice(0, 16) || ''}
                          onChange={(e) => handleChange('schedule_end_at', e.target.value)}
                          fullWidth
                          size="small"
                          InputLabelProps={{ shrink: true }}
                        />
                      </Grid>
                    </Grid>
                    <TextField
                      label="Fallback URL"
                      value={settings.fallback_url || ''}
                      onChange={(e) => handleChange('fallback_url', e.target.value)}
                      fullWidth
                      size="small"
                      placeholder="https://example.com"
                      helperText="URL to use after scheduled period ends"
                    />
                  </>
                )}
              </>
            )}
          </Stack>
        </AccordionDetails>
      </Accordion>

      {/* Expiration Settings */}
      <Accordion 
        expanded={expanded === 'expiration'} 
        onChange={() => setExpanded(expanded === 'expiration' ? false : 'expiration')}
        sx={{ mb: 1 }}
      >
        <AccordionSummary expandIcon={<ChevronDownIcon className="h-5 w-5" />}>
          <Stack direction="row" alignItems="center" spacing={1}>
            <ClockIcon className="h-5 w-5" style={{ color: '#1976d2' }} />
            <Typography variant="body2" fontWeight="medium">Expiration & Limits</Typography>
            {(settings.expires_at || settings.max_scans) && <Chip label="Set" size="small" color="warning" />}
          </Stack>
        </AccordionSummary>
        <AccordionDetails>
          <Stack spacing={2}>
            <TextField
              label="Expiration Date"
              type="datetime-local"
              value={settings.expires_at?.slice(0, 16) || ''}
              onChange={(e) => handleChange('expires_at', e.target.value || null)}
              fullWidth
              size="small"
              InputLabelProps={{ shrink: true }}
              helperText="QR code will stop working after this date"
            />

            <FormControl fullWidth size="small">
              <InputLabel>Expiration Action</InputLabel>
              <Select
                value={settings.expiration_action || 'deactivate'}
                label="Expiration Action"
                onChange={(e) => handleChange('expiration_action', e.target.value)}
              >
                <MenuItem value="deactivate">Deactivate (show error)</MenuItem>
                <MenuItem value="redirect_fallback">Redirect to fallback URL</MenuItem>
                <MenuItem value="show_message">Show custom message</MenuItem>
              </Select>
            </FormControl>

            {settings.expiration_action === 'show_message' && (
              <TextField
                label="Expiration Message"
                value={settings.expiration_message || ''}
                onChange={(e) => handleChange('expiration_message', e.target.value)}
                fullWidth
                size="small"
                multiline
                rows={2}
                placeholder="This QR code has expired."
              />
            )}

            <Divider />

            <Grid container spacing={2}>
              <Grid item xs={6}>
                <TextField
                  label="Max Total Scans"
                  type="number"
                  value={settings.max_scans || ''}
                  onChange={(e) => handleChange('max_scans', e.target.value ? parseInt(e.target.value) : null)}
                  fullWidth
                  size="small"
                  placeholder="Unlimited"
                  helperText="Stop after X total scans"
                />
              </Grid>
              <Grid item xs={6}>
                <TextField
                  label="Max Unique Scans"
                  type="number"
                  value={settings.max_unique_scans || ''}
                  onChange={(e) => handleChange('max_unique_scans', e.target.value ? parseInt(e.target.value) : null)}
                  fullWidth
                  size="small"
                  placeholder="Unlimited"
                  helperText="Stop after X unique users"
                />
              </Grid>
            </Grid>
          </Stack>
        </AccordionDetails>
      </Accordion>

      {/* Password Protection */}
      <Accordion 
        expanded={expanded === 'password'} 
        onChange={() => setExpanded(expanded === 'password' ? false : 'password')}
        sx={{ mb: 1 }}
      >
        <AccordionSummary expandIcon={<ChevronDownIcon className="h-5 w-5" />}>
          <Stack direction="row" alignItems="center" spacing={1}>
            <LockClosedIcon className="h-5 w-5" style={{ color: '#1976d2' }} />
            <Typography variant="body2" fontWeight="medium">Password Protection</Typography>
            {settings.is_password_protected && <Chip label="Protected" size="small" color="error" />}
          </Stack>
        </AccordionSummary>
        <AccordionDetails>
          <Stack spacing={2}>
            <FormControlLabel
              control={
                <Switch
                  checked={settings.is_password_protected || false}
                  onChange={(e) => handleChange('is_password_protected', e.target.checked)}
                />
              }
              label="Require password to access destination"
            />

            {settings.is_password_protected && (
              <>
                <TextField
                  label="Password"
                  type="password"
                  value={settings.password || ''}
                  onChange={(e) => handleChange('password', e.target.value)}
                  fullWidth
                  size="small"
                  placeholder="Enter a password"
                />
                <TextField
                  label="Password Hint (Optional)"
                  value={settings.password_hint || ''}
                  onChange={(e) => handleChange('password_hint', e.target.value)}
                  fullWidth
                  size="small"
                  placeholder="e.g., Company name"
                />
                <Alert severity="info" sx={{ fontSize: '0.75rem' }}>
                  Users will see a password prompt before being redirected to the destination.
                </Alert>
              </>
            )}
          </Stack>
        </AccordionDetails>
      </Accordion>

      {/* Scan Schedule */}
      <Accordion 
        expanded={expanded === 'schedule'} 
        onChange={() => setExpanded(expanded === 'schedule' ? false : 'schedule')}
        sx={{ mb: 1 }}
      >
        <AccordionSummary expandIcon={<ChevronDownIcon className="h-5 w-5" />}>
          <Stack direction="row" alignItems="center" spacing={1}>
            <ClockIcon className="h-5 w-5" style={{ color: '#1976d2' }} />
            <Typography variant="body2" fontWeight="medium">Scan Schedule</Typography>
            {settings.scan_schedule_enabled && <Chip label="Active" size="small" color="info" />}
          </Stack>
        </AccordionSummary>
        <AccordionDetails>
          <Stack spacing={2}>
            <FormControlLabel
              control={
                <Switch
                  checked={settings.scan_schedule_enabled || false}
                  onChange={(e) => handleChange('scan_schedule_enabled', e.target.checked)}
                />
              }
              label="Restrict scans to specific hours"
            />

            {settings.scan_schedule_enabled && (
              <>
                <Alert severity="info" sx={{ fontSize: '0.75rem' }}>
                  QR code will only work during specified hours. Useful for business hours, events, etc.
                </Alert>
                
                <FormControl fullWidth size="small">
                  <InputLabel>Timezone</InputLabel>
                  <Select
                    value={settings.scan_schedule_timezone || 'America/New_York'}
                    label="Timezone"
                    onChange={(e) => handleChange('scan_schedule_timezone', e.target.value)}
                  >
                    <MenuItem value="America/New_York">Eastern Time</MenuItem>
                    <MenuItem value="America/Chicago">Central Time</MenuItem>
                    <MenuItem value="America/Denver">Mountain Time</MenuItem>
                    <MenuItem value="America/Los_Angeles">Pacific Time</MenuItem>
                    <MenuItem value="UTC">UTC</MenuItem>
                  </Select>
                </FormControl>

                <FormControl fullWidth size="small">
                  <InputLabel>Outside Hours Action</InputLabel>
                  <Select
                    value={settings.outside_schedule_action || 'show_message'}
                    label="Outside Hours Action"
                    onChange={(e) => handleChange('outside_schedule_action', e.target.value)}
                  >
                    <MenuItem value="show_message">Show custom message</MenuItem>
                    <MenuItem value="redirect_fallback">Redirect to fallback URL</MenuItem>
                    <MenuItem value="block">Block access</MenuItem>
                  </Select>
                </FormControl>

                {settings.outside_schedule_action === 'show_message' && (
                  <TextField
                    label="Outside Hours Message"
                    value={settings.outside_schedule_message || ''}
                    onChange={(e) => handleChange('outside_schedule_message', e.target.value)}
                    fullWidth
                    size="small"
                    multiline
                    rows={2}
                    placeholder="This QR code is only available during business hours."
                  />
                )}
              </>
            )}
          </Stack>
        </AccordionDetails>
      </Accordion>

      {/* Save Button */}
      {qrCodeId && (
        <Box sx={{ mt: 2 }}>
          <Button 
            variant="contained" 
            onClick={handleSave} 
            disabled={saving}
            fullWidth
          >
            {saving ? 'Saving...' : 'Save Advanced Settings'}
          </Button>
        </Box>
      )}
    </Box>
  );
}
