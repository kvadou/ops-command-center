import React, { useState, useEffect } from 'react';
import {
  Box,
  Popover,
  Typography,
  Button,
  IconButton,
  CircularProgress,
  Chip,
  Stack,
  Divider,
  Tooltip,
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions,
  Alert,
} from '@mui/material';
import {
  QrCodeIcon,
  ArrowDownTrayIcon,
  ChartBarIcon,
  ClipboardDocumentIcon,
  ArrowTopRightOnSquareIcon,
  Cog6ToothIcon,
  ArrowPathIcon,
} from '@heroicons/react/24/outline';
import { CheckCircleIcon } from '@heroicons/react/24/solid';
import axios from 'axios';

/**
 * QRCodePopover - A reusable component for displaying QR codes with analytics
 * 
 * @param {Object} props
 * @param {string} props.serviceId - The service ID to fetch/generate QR code for (optional)
 * @param {string} props.bookingTypeId - The booking type ID for forms without a service (optional)
 * @param {string} props.serviceName - The service/form name for display
 * @param {Object} props.qrCode - Optional pre-loaded QR code data
 * @param {boolean} props.showIcon - Whether to show the QR icon trigger (default: true)
 * @param {boolean} props.iconOnly - Show only icon without text
 * @param {string} props.size - Size of the QR display: 'small', 'medium', 'large'
 * @param {function} props.onQRCodeGenerated - Callback when a QR code is generated
 * @param {function} props.onAnalyticsClick - Callback for analytics click
 * @param {boolean} props.autoGenerate - Auto-generate QR code if not exists
 */
export default function QRCodePopover({
  serviceId,
  bookingTypeId,
  serviceName,
  qrCode: initialQRCode,
  showIcon = true,
  iconOnly = false,
  size = 'medium',
  onQRCodeGenerated,
  onAnalyticsClick,
  autoGenerate = false,
}) {
  // Determine entity type and ID
  const entityType = serviceId ? 'service' : 'booking_type';
  const entityId = serviceId || bookingTypeId;
  const [anchorEl, setAnchorEl] = useState(null);
  const [qrCode, setQrCode] = useState(initialQRCode || null);
  const [loading, setLoading] = useState(false);
  const [generating, setGenerating] = useState(false);
  const [error, setError] = useState(null);
  const [copied, setCopied] = useState(false);
  const [analyticsDialogOpen, setAnalyticsDialogOpen] = useState(false);
  const [detailedAnalytics, setDetailedAnalytics] = useState(null);
  const [analyticsLoading, setAnalyticsLoading] = useState(false);

  const open = Boolean(anchorEl);

  // Size configurations
  const sizes = {
    small: { qr: 120, icon: 20 },
    medium: { qr: 180, icon: 24 },
    large: { qr: 250, icon: 28 },
  };
  const sizeConfig = sizes[size] || sizes.medium;

  useEffect(() => {
    if (initialQRCode) {
      setQrCode(initialQRCode);
    }
  }, [initialQRCode]);

  const fetchQRCode = async () => {
    if (!entityId) return;
    
    setLoading(true);
    setError(null);
    
    try {
      // Use appropriate endpoint based on entity type
      const endpoint = entityType === 'service'
        ? `/api/services/${entityId}/qr-code`
        : `/api/booking-types/${entityId}/qr-code`;

      const response = await axios.get(endpoint, {
        withCredentials: true,
      });
      if (response.data?.exists === false || response.status === 404) {
        // No QR code exists yet
        if (autoGenerate) {
          await generateQRCode();
        } else {
          setQrCode(null);
        }
      } else {
        setQrCode(response.data);
      }
    } catch (err) {
      setError(err.response?.data?.error || 'Failed to fetch QR code');
    } finally {
      setLoading(false);
    }
  };

  const generateQRCode = async () => {
    if (!entityId) return;
    
    setGenerating(true);
    setError(null);
    
    try {
      // Use appropriate endpoint based on entity type
      const endpoint = entityType === 'service'
        ? `/api/services/${entityId}/qr-code`
        : `/api/booking-types/${entityId}/qr-code`;

      const response = await axios.post(endpoint,
        { name: serviceName },
        { withCredentials: true }
      );
      setQrCode(response.data);
      if (onQRCodeGenerated) {
        onQRCodeGenerated(response.data);
      }
    } catch (err) {
      setError(err.response?.data?.error || 'Failed to generate QR code');
    } finally {
      setGenerating(false);
    }
  };

  const handleClick = (event) => {
    if (!entityId) return; // Don't open if no entity ID
    setAnchorEl(event.currentTarget);
    if (!qrCode && !loading) {
      fetchQRCode();
    }
  };

  const handleClose = () => {
    setAnchorEl(null);
  };

  const handleDownload = async (format = 'png') => {
    if (!qrCode) return;

    try {
      if (format === 'svg' && qrCode.qr_code_svg) {
        const blob = new Blob([qrCode.qr_code_svg], { type: 'image/svg+xml' });
        const url = URL.createObjectURL(blob);
        const link = document.createElement('a');
        link.href = url;
        link.download = `${qrCode.name || 'qr-code'}.svg`;
        link.click();
        URL.revokeObjectURL(url);
      } else if (qrCode.qr_code_image_url) {
        const response = await fetch(qrCode.qr_code_image_url);
        const blob = await response.blob();
        const url = URL.createObjectURL(blob);
        const link = document.createElement('a');
        link.href = url;
        link.download = `${qrCode.name || 'qr-code'}.png`;
        link.click();
        URL.revokeObjectURL(url);
      }
    } catch (err) {
      console.error('Download error:', err);
    }
  };

  const handleCopyLink = () => {
    if (qrCode?.destination_url) {
      navigator.clipboard.writeText(qrCode.destination_url);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    }
  };

  const handleViewAnalytics = async () => {
    if (onAnalyticsClick) {
      onAnalyticsClick(qrCode);
      return;
    }
    
    // Show analytics dialog
    setAnalyticsDialogOpen(true);
    setAnalyticsLoading(true);
    
    try {
      const response = await axios.get(`/api/qr-codes/${qrCode.id}/analytics/detailed`, {
        withCredentials: true,
        params: {
          start_date: new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString(),
          end_date: new Date().toISOString(),
          group_by: 'day'
        }
      });
      setDetailedAnalytics(response.data);
    } catch (err) {
      console.error('Failed to fetch analytics:', err);
    } finally {
      setAnalyticsLoading(false);
    }
  };

  // Render the QR icon/button trigger
  const renderTrigger = () => {
    if (!showIcon) return null;

    const hasQRCode = !!qrCode;
    const scanCount = qrCode?.total_scans || 0;

    return (
      <Tooltip title={hasQRCode ? `View QR Code (${scanCount} scans)` : 'View/Generate QR Code'}>
        <IconButton
          size="small"
          onClick={handleClick}
          sx={{
            color: hasQRCode ? 'primary.main' : 'text.secondary',
            '&:hover': { backgroundColor: 'primary.light', color: 'primary.contrastText' }
          }}
        >
          <Box sx={{ position: 'relative', display: 'flex', alignItems: 'center' }}>
            <QrCodeIcon className="h-5 w-5" />
            {hasQRCode && scanCount > 0 && (
              <Box
                sx={{
                  position: 'absolute',
                  top: -4,
                  right: -4,
                  backgroundColor: 'success.main',
                  color: 'white',
                  borderRadius: '50%',
                  width: 14,
                  height: 14,
                  fontSize: 9,
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  fontWeight: 'bold',
                }}
              >
                {scanCount > 99 ? '99+' : scanCount}
              </Box>
            )}
          </Box>
        </IconButton>
      </Tooltip>
    );
  };

  return (
    <>
      {renderTrigger()}
      
      <Popover
        open={open}
        anchorEl={anchorEl}
        onClose={handleClose}
        anchorOrigin={{
          vertical: 'bottom',
          horizontal: 'center',
        }}
        transformOrigin={{
          vertical: 'top',
          horizontal: 'center',
        }}
        PaperProps={{
          sx: { 
            p: 2, 
            maxWidth: 320,
            borderRadius: 2,
            boxShadow: '0 8px 32px rgba(0,0,0,0.12)'
          }
        }}
      >
        {loading ? (
          <Box sx={{ display: 'flex', justifyContent: 'center', p: 3 }}>
            <CircularProgress size={32} />
          </Box>
        ) : error ? (
          <Alert severity="error" sx={{ mb: 2 }}>{error}</Alert>
        ) : qrCode ? (
          <Box>
            {/* Header */}
            <Typography variant="subtitle1" fontWeight="bold" noWrap sx={{ mb: 1 }}>
              {qrCode.name || serviceName}
            </Typography>
            
            {/* QR Code Image */}
            <Box 
              sx={{ 
                display: 'flex', 
                justifyContent: 'center', 
                mb: 2,
                p: 1,
                backgroundColor: '#f5f5f5',
                borderRadius: 2
              }}
            >
              {qrCode.qr_code_image_url ? (
                <img
                  src={qrCode.qr_code_image_url}
                  alt="QR Code"
                  loading="lazy"
                  style={{ 
                    width: sizeConfig.qr, 
                    height: sizeConfig.qr,
                    borderRadius: 8
                  }}
                />
              ) : (
                <Box 
                  sx={{ 
                    width: sizeConfig.qr, 
                    height: sizeConfig.qr, 
                    display: 'flex', 
                    alignItems: 'center', 
                    justifyContent: 'center',
                    backgroundColor: '#eee',
                    borderRadius: 2
                  }}
                >
                  <QrCodeIcon className="h-12 w-12 text-gray-400" />
                </Box>
              )}
            </Box>

            {/* Analytics Summary */}
            <Stack direction="row" spacing={1} justifyContent="center" sx={{ mb: 2 }}>
              <Chip 
                size="small" 
                icon={<ChartBarIcon className="h-4 w-4" />}
                label={`${qrCode.total_scans || 0} scans`}
                color="primary"
                variant="outlined"
              />
              {qrCode.scans_today > 0 && (
                <Chip 
                  size="small" 
                  label={`${qrCode.scans_today} today`}
                  color="success"
                  variant="outlined"
                />
              )}
            </Stack>

            <Divider sx={{ mb: 2 }} />

            {/* Actions */}
            <Stack direction="row" spacing={1} flexWrap="wrap" useFlexGap>
              <Button
                size="small"
                startIcon={<ArrowDownTrayIcon className="h-5 w-5" />}
                onClick={() => handleDownload('png')}
                variant="contained"
              >
                Download
              </Button>
              
              <Tooltip title={copied ? 'Copied!' : 'Copy booking link'}>
                <IconButton size="small" onClick={handleCopyLink}>
                  {copied ? <CheckCircleIcon className="h-5 w-5 text-green-500" /> : <ClipboardDocumentIcon className="h-5 w-5" />}
                </IconButton>
              </Tooltip>
              
              <Tooltip title="View analytics">
                <IconButton size="small" onClick={handleViewAnalytics}>
                  <ChartBarIcon className="h-5 w-5" />
                </IconButton>
              </Tooltip>
              
              <Tooltip title="Open booking form">
                <IconButton 
                  size="small" 
                  onClick={() => window.open(qrCode.destination_url, '_blank')}
                >
                  <ArrowTopRightOnSquareIcon className="h-5 w-5" />
                </IconButton>
              </Tooltip>
              
              <Tooltip title="Manage in Settings">
                <IconButton 
                  size="small" 
                  onClick={() => window.location.href = `/settings?tab=qr-codes&id=${qrCode.id}`}
                >
                  <Cog6ToothIcon className="h-5 w-5" />
                </IconButton>
              </Tooltip>
            </Stack>

            {/* Last scanned info */}
            {qrCode.last_scanned_at && (
              <Typography 
                variant="caption" 
                color="text.secondary" 
                sx={{ display: 'block', mt: 1, textAlign: 'center' }}
              >
                Last scan: {new Date(qrCode.last_scanned_at).toLocaleDateString()}
              </Typography>
            )}
          </Box>
        ) : (
          <Box sx={{ textAlign: 'center', p: 2 }}>
            <QrCodeIcon className="h-12 w-12 text-gray-400 mb-2 mx-auto" />
            <Typography variant="body2" color="text.secondary" sx={{ mb: 2 }}>
              No QR code exists for this booking form yet.
            </Typography>
            <Button
              variant="contained"
              startIcon={generating ? <CircularProgress size={16} /> : <QrCodeIcon className="h-5 w-5" />}
              onClick={generateQRCode}
              disabled={generating}
            >
              {generating ? 'Generating...' : 'Generate QR Code'}
            </Button>
          </Box>
        )}
      </Popover>

      {/* Analytics Dialog */}
      <Dialog 
        open={analyticsDialogOpen} 
        onClose={() => setAnalyticsDialogOpen(false)}
        maxWidth="sm"
        fullWidth
      >
        <DialogTitle>
          QR Code Analytics - {qrCode?.name || serviceName}
        </DialogTitle>
        <DialogContent>
          {analyticsLoading ? (
            <Box sx={{ display: 'flex', justifyContent: 'center', p: 4 }}>
              <CircularProgress />
            </Box>
          ) : detailedAnalytics ? (
            <Box>
              {/* Summary Stats */}
              <Stack direction="row" spacing={2} sx={{ mb: 3 }}>
                <Box sx={{ textAlign: 'center', flex: 1, p: 2, backgroundColor: 'primary.light', borderRadius: 2 }}>
                  <Typography variant="h4" fontWeight="bold" color="primary.main">
                    {detailedAnalytics.summary?.total_scans || 0}
                  </Typography>
                  <Typography variant="caption" color="text.secondary">Total Scans</Typography>
                </Box>
                <Box sx={{ textAlign: 'center', flex: 1, p: 2, backgroundColor: 'success.light', borderRadius: 2 }}>
                  <Typography variant="h4" fontWeight="bold" color="success.main">
                    {detailedAnalytics.summary?.unique_scans || 0}
                  </Typography>
                  <Typography variant="caption" color="text.secondary">Unique Visitors</Typography>
                </Box>
              </Stack>

              {/* Device Breakdown */}
              {detailedAnalytics.devices?.length > 0 && (
                <Box sx={{ mb: 2 }}>
                  <Typography variant="subtitle2" sx={{ mb: 1 }}>Devices</Typography>
                  <Stack direction="row" spacing={1} flexWrap="wrap" useFlexGap>
                    {detailedAnalytics.devices.map((device, idx) => (
                      <Chip 
                        key={idx}
                        size="small"
                        label={`${device.device_type || 'Unknown'}: ${device.count}`}
                        variant="outlined"
                      />
                    ))}
                  </Stack>
                </Box>
              )}

              {/* Top Countries */}
              {detailedAnalytics.countries?.length > 0 && (
                <Box sx={{ mb: 2 }}>
                  <Typography variant="subtitle2" sx={{ mb: 1 }}>Top Locations</Typography>
                  <Stack direction="row" spacing={1} flexWrap="wrap" useFlexGap>
                    {detailedAnalytics.countries.slice(0, 5).map((country, idx) => (
                      <Chip 
                        key={idx}
                        size="small"
                        label={`${country.country || 'Unknown'}: ${country.count}`}
                        variant="outlined"
                      />
                    ))}
                  </Stack>
                </Box>
              )}
            </Box>
          ) : (
            <Typography color="text.secondary" sx={{ textAlign: 'center', p: 4 }}>
              No analytics data available yet
            </Typography>
          )}
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setAnalyticsDialogOpen(false)}>Close</Button>
          <Button 
            variant="contained" 
            onClick={() => window.location.href = `/settings?tab=qr-codes&id=${qrCode?.id}`}
          >
            View Full Analytics
          </Button>
        </DialogActions>
      </Dialog>
    </>
  );
}
