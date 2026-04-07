import React, { useCallback, useEffect, useState } from "react";
import {
  Alert,
  Box,
  Button,
  Chip,
  CircularProgress,
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
import { BellIcon, EnvelopeIcon, LinkIcon } from '@heroicons/react/24/outline';
import axios from "axios";

/**
 * QR Code Notification Settings Component
 * 
 * Manages notification preferences for a QR code including
 * email alerts, webhooks, and milestone notifications
 */
export default function QRCodeNotificationSettings({ qrCodeId, onSave }) {
  const [settings, setSettings] = useState(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  const fetchSettings = useCallback(async () => {
    if (!qrCodeId) return;
    
    try {
      setLoading(true);
      const response = await axios.get(`/api/qr-codes/${qrCodeId}/notifications`);
      setSettings(response.data);
    } catch (err) {
      console.error('Error fetching notification settings:', err);
    } finally {
      setLoading(false);
    }
  }, [qrCodeId]);

  useEffect(() => {
    fetchSettings();
  }, [fetchSettings]);

  const handleChange = (field, value) => {
    setSettings(prev => ({ ...prev, [field]: value }));
  };

  const handleSave = async () => {
    try {
      setSaving(true);
      await axios.put(`/api/qr-codes/${qrCodeId}/notifications`, settings);
      onSave?.();
    } catch (err) {
      console.error('Error saving notification settings:', err);
    } finally {
      setSaving(false);
    }
  };

  if (loading) {
    return (
      <Box sx={{ display: 'flex', justifyContent: 'center', p: 3 }}>
        <CircularProgress size={24} />
      </Box>
    );
  }

  if (!settings) {
    return (
      <Alert severity="error">Failed to load notification settings</Alert>
    );
  }

  return (
    <Box>
      <Stack direction="row" alignItems="center" spacing={1} sx={{ mb: 2 }}>
        <BellIcon className="h-5 w-5" style={{ color: '#1976d2' }} />
        <Typography variant="h6">Notification Settings</Typography>
      </Stack>

      {/* Scan Notifications */}
      <Box sx={{ mb: 3 }}>
        <Typography variant="subtitle2" fontWeight="bold" gutterBottom>
          Scan Alerts
        </Typography>
        <Stack spacing={2}>
          <FormControlLabel
            control={
              <Switch
                checked={settings.notify_on_scan || false}
                onChange={(e) => handleChange('notify_on_scan', e.target.checked)}
              />
            }
            label="Notify on every scan"
          />
          <FormControlLabel
            control={
              <Switch
                checked={settings.notify_on_milestone || false}
                onChange={(e) => handleChange('notify_on_milestone', e.target.checked)}
              />
            }
            label="Notify on milestones"
          />
          
          {settings.notify_on_milestone && (
            <Box sx={{ pl: 4 }}>
              <Typography variant="caption" color="text.secondary" sx={{ display: 'block', mb: 1 }}>
                Notify when scan count reaches:
              </Typography>
              <Stack direction="row" spacing={1} flexWrap="wrap">
                {(settings.milestone_thresholds || [10, 50, 100, 500, 1000]).map((threshold, i) => (
                  <Chip 
                    key={i} 
                    label={`${threshold} scans`} 
                    size="small"
                    color="primary"
                    variant="outlined"
                  />
                ))}
              </Stack>
            </Box>
          )}
        </Stack>
      </Box>

      <Divider sx={{ my: 2 }} />

      {/* Email Notifications */}
      <Box sx={{ mb: 3 }}>
        <Stack direction="row" alignItems="center" spacing={1} sx={{ mb: 2 }}>
          <EnvelopeIcon className="h-5 w-5" style={{ color: '#1976d2' }} />
          <Typography variant="subtitle2" fontWeight="bold">
            Email Notifications
          </Typography>
        </Stack>
        
        <Stack spacing={2}>
          <FormControlLabel
            control={
              <Switch
                checked={settings.email_enabled || false}
                onChange={(e) => handleChange('email_enabled', e.target.checked)}
              />
            }
            label="Enable email notifications"
          />

          {settings.email_enabled && (
            <>
              <TextField
                label="Email Addresses"
                value={(settings.email_addresses || []).join(', ')}
                onChange={(e) => handleChange('email_addresses', e.target.value.split(',').map(s => s.trim()).filter(Boolean))}
                fullWidth
                size="small"
                placeholder="email1@example.com, email2@example.com"
                helperText="Comma-separated list of emails"
              />

              <FormControl fullWidth size="small">
                <InputLabel>Frequency</InputLabel>
                <Select
                  value={settings.email_frequency || 'instant'}
                  label="Frequency"
                  onChange={(e) => handleChange('email_frequency', e.target.value)}
                >
                  <MenuItem value="instant">Instant (every scan)</MenuItem>
                  <MenuItem value="daily">Daily digest</MenuItem>
                  <MenuItem value="weekly">Weekly digest</MenuItem>
                </Select>
              </FormControl>
            </>
          )}
        </Stack>
      </Box>

      <Divider sx={{ my: 2 }} />

      {/* Daily Digest */}
      <Box sx={{ mb: 3 }}>
        <Typography variant="subtitle2" fontWeight="bold" gutterBottom>
          Daily Analytics Digest
        </Typography>
        
        <Stack spacing={2}>
          <FormControlLabel
            control={
              <Switch
                checked={settings.daily_digest_enabled || false}
                onChange={(e) => handleChange('daily_digest_enabled', e.target.checked)}
              />
            }
            label="Send daily analytics summary"
          />

          {settings.daily_digest_enabled && (
            <Grid container spacing={2}>
              <Grid item xs={6}>
                <TextField
                  label="Send Time"
                  type="time"
                  value={settings.daily_digest_time || '09:00'}
                  onChange={(e) => handleChange('daily_digest_time', e.target.value)}
                  fullWidth
                  size="small"
                  InputLabelProps={{ shrink: true }}
                />
              </Grid>
              <Grid item xs={6}>
                <FormControl fullWidth size="small">
                  <InputLabel>Timezone</InputLabel>
                  <Select
                    value={settings.daily_digest_timezone || 'America/New_York'}
                    label="Timezone"
                    onChange={(e) => handleChange('daily_digest_timezone', e.target.value)}
                  >
                    <MenuItem value="America/New_York">Eastern Time</MenuItem>
                    <MenuItem value="America/Chicago">Central Time</MenuItem>
                    <MenuItem value="America/Denver">Mountain Time</MenuItem>
                    <MenuItem value="America/Los_Angeles">Pacific Time</MenuItem>
                    <MenuItem value="UTC">UTC</MenuItem>
                  </Select>
                </FormControl>
              </Grid>
            </Grid>
          )}
        </Stack>
      </Box>

      <Divider sx={{ my: 2 }} />

      {/* Webhook Notifications */}
      <Box sx={{ mb: 3 }}>
        <Stack direction="row" alignItems="center" spacing={1} sx={{ mb: 2 }}>
          <LinkIcon className="h-5 w-5" style={{ color: '#1976d2' }} />
          <Typography variant="subtitle2" fontWeight="bold">
            Webhook Notifications
          </Typography>
        </Stack>
        
        <Stack spacing={2}>
          <FormControlLabel
            control={
              <Switch
                checked={settings.webhook_enabled || false}
                onChange={(e) => handleChange('webhook_enabled', e.target.checked)}
              />
            }
            label="Enable webhook notifications"
          />

          {settings.webhook_enabled && (
            <>
              <TextField
                label="Webhook URL"
                value={settings.webhook_url || ''}
                onChange={(e) => handleChange('webhook_url', e.target.value)}
                fullWidth
                size="small"
                placeholder="https://your-server.com/webhook"
              />
              <TextField
                label="Webhook Secret (Optional)"
                value={settings.webhook_secret || ''}
                onChange={(e) => handleChange('webhook_secret', e.target.value)}
                fullWidth
                size="small"
                type="password"
                placeholder="Secret for HMAC signature verification"
              />
              <Alert severity="info" sx={{ fontSize: '0.75rem' }}>
                We'll send a POST request with scan data to your webhook URL. 
                Include a secret for HMAC-SHA256 signature verification.
              </Alert>
            </>
          )}
        </Stack>
      </Box>

      {/* Save Button */}
      <Button 
        variant="contained" 
        onClick={handleSave} 
        disabled={saving}
        fullWidth
        size="large"
      >
        {saving ? 'Saving...' : 'Save Notification Settings'}
      </Button>
    </Box>
  );
}
