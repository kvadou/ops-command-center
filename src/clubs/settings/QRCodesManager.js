import React, { useCallback, useEffect, useMemo, useState } from "react";
import ConfirmationModal from '../../components/ConfirmationModal';
import {
  Alert,
  Box,
  Button,
  Fab,
  Chip,
  CircularProgress,
  Dialog,
  DialogActions,
  DialogContent,
  DialogTitle,
  Divider,
  Drawer,
  FormControl,
  Grid,
  IconButton,
  InputAdornment,
  InputLabel,
  LinearProgress,
  Menu,
  MenuItem,
  Paper,
  Select,
  Snackbar,
  Stack,
  Tab,
  Tabs,
  TextField,
  Tooltip,
  Typography,
} from "@mui/material";
import {
  PlusIcon as AddIcon,
  TrashIcon as DeleteIcon,
  ArrowDownTrayIcon as DownloadIcon,
  PencilSquareIcon as EditIcon,
  LinkIcon,
  EllipsisVerticalIcon as MoreVertIcon,
  QrCodeIcon,
  ArrowPathIcon as RefreshIcon,
  MagnifyingGlassIcon as SearchIcon,
  EyeIcon as VisibilityIcon,
  ChartBarIcon as BarChartIcon,
  ArrowLeftIcon as ArrowBackIcon,
  ClipboardDocumentIcon as ContentCopyIcon,
  XCircleIcon as CancelIcon,
  CloudArrowUpIcon as CloudSyncIcon,
  HomeIcon,
  ClockIcon as HistoryIcon,
  LinkSlashIcon as LinkOffIcon,
  Bars3Icon as MenuOpenIcon,
  TagIcon as LocalOfferIcon,
  Cog6ToothIcon as SettingsIcon,
  BellIcon as NotificationsIcon,
  ArrowUpTrayIcon as FileUploadIcon,
} from '@heroicons/react/24/outline';
import { CheckCircleIcon } from '@heroicons/react/24/solid';
import axios from "axios";
import QRCodeDesigner from "./QRCodeDesigner";
import QRCodeTemplatePicker from "./QRCodeTemplatePicker";
import QRCodeFolderTree from "./QRCodeFolderTree";
import QRCodeTagManager from "./QRCodeTagManager";
import QRCodeAdvancedSettings from "./QRCodeAdvancedSettings";
import QRCodeNotificationSettings from "./QRCodeNotificationSettings";
import QRCodeDetailedAnalytics from "./QRCodeDetailedAnalytics";

// Category options
const CATEGORY_OPTIONS = [
  { value: 'marketing', label: 'Marketing' },
  { value: 'booking_forms', label: 'Booking Forms' },
  { value: 'events', label: 'Events' },
  { value: 'products', label: 'Products' },
  { value: 'internal', label: 'Internal' },
  { value: 'social', label: 'Social Media' },
  { value: 'other', label: 'Other' },
];

// Default form data for new self-hosted QR codes
const DEFAULT_FORM_DATA = {
  name: '',
  description: '',
  destination_url: '',
  category: 'marketing',
  foreground_color: '#000000',
  background_color: '#FFFFFF',
  linked_entity_type: '',
  linked_entity_id: '',
  auto_generated: false,
  tags: [],
};

// Tab Panel Component
function TabPanel({ children, value, index, ...other }) {
  return (
    <div
      role="tabpanel"
      hidden={value !== index}
      id={`qr-tabpanel-${index}`}
      aria-labelledby={`qr-tab-${index}`}
      {...other}
    >
      {value === index && <Box sx={{ pt: 3 }}>{children}</Box>}
    </div>
  );
}

// QR Code Card Component - defined outside main component to prevent recreation on every render
function QRCodeCard({ qrCode, isExternal = false, onMenuOpen, onViewDetails }) {
  return (
    <Paper
      sx={{
        p: 2,
        height: '100%',
        display: 'flex',
        flexDirection: 'column',
        position: 'relative',
        opacity: qrCode.is_active ? 1 : 0.6,
        border: qrCode.is_active ? '1px solid transparent' : '1px solid #ff9800',
      }}
    >
      {/* Status badges */}
      <Stack direction="row" spacing={0.5} sx={{ position: 'absolute', top: 8, left: 8 }}>
        {!qrCode.is_active && (
          <Chip size="small" label="Inactive" color="warning" />
        )}
        {isExternal && (
          <Chip size="small" label="External" color="info" variant="outlined" />
        )}
        {qrCode.tracking_url && (
          <Chip size="small" label="Tracked" color="success" variant="outlined" />
        )}
      </Stack>

      {/* Menu button */}
      <IconButton
        size="small"
        onClick={(e) => {
          e.stopPropagation();
          onMenuOpen(e, qrCode);
        }}
        sx={{ position: 'absolute', top: 8, right: 8 }}
      >
        <MoreVertIcon className="h-4 w-4" />
      </IconButton>

      {/* QR Code Image */}
      <Box
        sx={{
          display: 'flex',
          justifyContent: 'center',
          alignItems: 'center',
          py: 2,
          pt: 4,
          cursor: 'pointer',
        }}
        onClick={() => onViewDetails(qrCode)}
      >
        {qrCode.qr_code_image_url ? (
          <img
            src={qrCode.qr_code_image_url}
            alt={qrCode.name}
            style={{ maxWidth: 120, maxHeight: 120, borderRadius: 4 }}
          />
        ) : (
          <Box
            sx={{
              width: 120,
              height: 120,
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              bgcolor: 'grey.100',
              borderRadius: 1,
            }}
          >
            <QrCodeIcon className="h-12 w-12 text-gray-400" />
          </Box>
        )}
      </Box>

      {/* Info */}
      <Typography variant="subtitle2" fontWeight="bold" noWrap>
        {qrCode.name}
      </Typography>
      <Typography
        variant="caption"
        color="text.secondary"
        noWrap
        sx={{ mb: 1 }}
      >
        {qrCode.destination_url}
      </Typography>

      {/* Stats */}
      <Stack direction="row" spacing={1} sx={{ mt: 'auto' }} flexWrap="wrap">
        {qrCode.category && (
          <Chip size="small" label={qrCode.category} variant="outlined" />
        )}
        {(qrCode.total_scans > 0 || qrCode.tracking_url) && (
          <Chip
            size="small"
            icon={<BarChartIcon className="h-4 w-4" />}
            label={`${qrCode.total_scans || 0} scans`}
            color="primary"
            variant="outlined"
          />
        )}
        {qrCode.linked_entity_type && (
          <Chip
            size="small"
            icon={<LinkIcon className="h-4 w-4" />}
            label={qrCode.linked_entity_type}
            color="secondary"
            variant="outlined"
          />
        )}
      </Stack>
    </Paper>
  );
}

export default function QRCodesManager({ onBackToSettings }) {
  // Tab state
  const [activeTab, setActiveTab] = useState(0);
  
  // Internal QR codes state
  const [internalQRCodes, setInternalQRCodes] = useState([]);
  const [internalLoading, setInternalLoading] = useState(false);
  const [internalError, setInternalError] = useState("");
  
  // External/Legacy QR codes state
  const [externalQRCodes, setExternalQRCodes] = useState([]);
  const [externalLoading, setExternalLoading] = useState(false);
  const [externalError, setExternalError] = useState("");
  
  // Common state
  const [query, setQuery] = useState("");
  const [categoryFilter, setCategoryFilter] = useState("all");
  
  // Dialog states
  const [createDialogOpen, setCreateDialogOpen] = useState(false);
  const [editDialogOpen, setEditDialogOpen] = useState(false);
  const [detailDialogOpen, setDetailDialogOpen] = useState(false);
  const [analyticsDialogOpen, setAnalyticsDialogOpen] = useState(false);
  const [notificationDialogOpen, setNotificationDialogOpen] = useState(false);
  const [advancedSettingsDialogOpen, setAdvancedSettingsDialogOpen] = useState(false);
  const [selectedQRCode, setSelectedQRCode] = useState(null);
  
  // Form state
  const [formData, setFormData] = useState(DEFAULT_FORM_DATA);
  const [saving, setSaving] = useState(false);
  const [preview, setPreview] = useState(null);
  const [previewLoading, setPreviewLoading] = useState(false);
  
  // Analytics state
  const [analytics, setAnalytics] = useState(null);
  const [analyticsLoading, setAnalyticsLoading] = useState(false);
  
  // Menu state
  const [menuAnchor, setMenuAnchor] = useState(null);
  const [menuQRCode, setMenuQRCode] = useState(null);
  
  // Snackbar
  const [snack, setSnack] = useState({ open: false, severity: 'success', msg: '' });
  const [confirmState, setConfirmState] = useState({ isOpen: false, action: null, title: '', message: '' });

  // Stats
  const [stats, setStats] = useState(null);
  
  // Syncing state
  const [syncing, setSyncing] = useState(false);
  
  // Premium features state
  const [selectedFolderId, setSelectedFolderId] = useState(null);
  const [selectedTemplate, setSelectedTemplate] = useState(null);
  const [selectedTags, setSelectedTags] = useState([]);
  const [advancedSettings, setAdvancedSettings] = useState({});
  const [folderDrawerOpen, setFolderDrawerOpen] = useState(false);
  const [createStep, setCreateStep] = useState(0); // 0: basic, 1: design, 2: advanced
  const [folders, setFolders] = useState([]);

  // Fetch internal (self-hosted) QR codes
  const fetchInternalQRCodes = useCallback(async () => {
    setInternalLoading(true);
    setInternalError("");
    try {
      const params = new URLSearchParams();
      if (categoryFilter !== 'all') params.append('category', categoryFilter);
      if (query) params.append('search', query);
      if (selectedFolderId) params.append('folder_id', selectedFolderId);
      
      const { data } = await axios.get(`/api/qr-codes/internal?${params.toString()}`);
      setInternalQRCodes(Array.isArray(data.qrCodes) ? data.qrCodes : []);
    } catch (e) {
      setInternalError(e?.response?.data?.error || e?.message || "Failed to load QR codes");
    } finally {
      setInternalLoading(false);
    }
  }, [categoryFilter, query, selectedFolderId]);

  // Fetch external (synced) QR codes
  const fetchExternalQRCodes = useCallback(async () => {
    setExternalLoading(true);
    setExternalError("");
    try {
      const params = new URLSearchParams();
      if (categoryFilter !== 'all') params.append('category', categoryFilter);
      if (query) params.append('search', query);
      
      const { data } = await axios.get(`/api/qr-codes/external?${params.toString()}`);
      setExternalQRCodes(Array.isArray(data.qrCodes) ? data.qrCodes : []);
    } catch (e) {
      setExternalError(e?.response?.data?.error || e?.message || "Failed to load external QR codes");
    } finally {
      setExternalLoading(false);
    }
  }, [categoryFilter, query]);

  // Fetch stats
  const fetchStats = useCallback(async () => {
    try {
      const { data } = await axios.get("/api/qr-codes/stats/summary");
      setStats(data);
    } catch (e) {
      console.error('Failed to fetch stats:', e);
    }
  }, []);

  // Fetch folders for dropdown
  const fetchFolders = useCallback(async () => {
    try {
      const { data } = await axios.get("/api/qr-codes/folders");
      setFolders(Array.isArray(data) ? data : []);
    } catch (e) {
      console.error('Failed to fetch folders:', e);
    }
  }, []);

  // Sync from PRO account
  const syncFromRemote = async () => {
    setSyncing(true);
    try {
      const { data } = await axios.post('/api/qr-codes/sync');
      setSnack({
        open: true,
        severity: 'success',
        msg: data.message || `Synced ${data.synced} QR codes from your PRO account`
      });
      fetchExternalQRCodes();
      fetchStats();
    } catch (e) {
      console.error('Sync error:', e);
      setSnack({
        open: true,
        severity: 'error',
        msg: e?.response?.data?.error || e?.message || 'Failed to sync from PRO account'
      });
    } finally {
      setSyncing(false);
    }
  };

  useEffect(() => {
    fetchInternalQRCodes();
    fetchExternalQRCodes();
    fetchStats();
    fetchFolders();
  }, [fetchInternalQRCodes, fetchExternalQRCodes, fetchStats, fetchFolders]);

  // Generate preview for self-hosted QR codes
  const generatePreview = async () => {
    if (!formData.destination_url) return;
    
    setPreviewLoading(true);
    try {
      const { data } = await axios.post('/api/qr-codes/generate-preview', {
        destination_url: formData.destination_url,
        foreground_color: formData.foreground_color,
        background_color: formData.background_color,
      });
      setPreview(data.preview);
    } catch (e) {
      setSnack({ open: true, severity: 'error', msg: e?.response?.data?.error || 'Failed to generate preview' });
    } finally {
      setPreviewLoading(false);
    }
  };

  // Create self-hosted QR code
  const handleCreate = async () => {
    if (!formData.name || !formData.destination_url) {
      setSnack({ open: true, severity: 'error', msg: 'Name and destination URL are required' });
      return;
    }
    
    setSaving(true);
    try {
      await axios.post('/api/qr-codes/generate', formData);
      setSnack({ open: true, severity: 'success', msg: 'QR code created successfully with tracking!' });
      setCreateDialogOpen(false);
      setFormData(DEFAULT_FORM_DATA);
      setPreview(null);
      fetchInternalQRCodes();
      fetchStats();
    } catch (e) {
      setSnack({ open: true, severity: 'error', msg: e?.response?.data?.error || 'Failed to create QR code' });
    } finally {
      setSaving(false);
    }
  };

  // Update QR code
  const handleUpdate = async () => {
    if (!selectedQRCode) return;
    
    setSaving(true);
    try {
      await axios.put(`/api/qr-codes/${selectedQRCode.id}`, {
        ...formData,
        regenerate: true
      });
      setSnack({ open: true, severity: 'success', msg: 'QR code updated successfully' });
      setEditDialogOpen(false);
      setSelectedQRCode(null);
      setFormData(DEFAULT_FORM_DATA);
      setPreview(null);
      fetchInternalQRCodes();
      fetchExternalQRCodes();
    } catch (e) {
      setSnack({ open: true, severity: 'error', msg: e?.response?.data?.error || 'Failed to update QR code' });
    } finally {
      setSaving(false);
    }
  };

  // Delete QR code
  const handleDelete = (qrCode) => {
    setConfirmState({
      isOpen: true,
      title: 'Delete QR Code',
      message: `Delete "${qrCode.name}"? This cannot be undone.`,
      action: async () => {
        try {
          await axios.delete(`/api/qr-codes/${qrCode.id}`);
          setSnack({ open: true, severity: 'success', msg: 'QR code deleted' });
          fetchInternalQRCodes();
          fetchExternalQRCodes();
          fetchStats();
        } catch (e) {
          setSnack({ open: true, severity: 'error', msg: e?.response?.data?.error || 'Delete failed' });
        }
      },
    });
  };

  // Toggle active status
  const handleToggleActive = async (qrCode) => {
    try {
      await axios.post(`/api/qr-codes/${qrCode.id}/toggle`);
      setSnack({ open: true, severity: 'success', msg: `QR code ${qrCode.is_active ? 'deactivated' : 'activated'}` });
      fetchInternalQRCodes();
      fetchExternalQRCodes();
    } catch (e) {
      setSnack({ open: true, severity: 'error', msg: e?.response?.data?.error || 'Failed to toggle status' });
    }
  };

  // Download QR code
  const handleDownload = async (qrCode, format = 'png') => {
    try {
      const response = await axios.get(`/api/qr-codes/${qrCode.id}/download?format=${format}`, {
        responseType: 'blob'
      });
      
      const url = window.URL.createObjectURL(new Blob([response.data]));
      const link = document.createElement('a');
      link.href = url;
      link.download = `${qrCode.name.replace(/[^a-zA-Z0-9]/g, '-')}.${format}`;
      document.body.appendChild(link);
      link.click();
      link.remove();
      window.URL.revokeObjectURL(url);
    } catch (e) {
      setSnack({ open: true, severity: 'error', msg: 'Download failed' });
    }
  };

  // Fetch analytics
  const fetchAnalytics = async (qrCode) => {
    setAnalyticsLoading(true);
    try {
      const { data } = await axios.get(`/api/qr-codes/${qrCode.id}/analytics`);
      setAnalytics(data);
      setSelectedQRCode(qrCode);
      setAnalyticsDialogOpen(true);
    } catch (e) {
      setSnack({ open: true, severity: 'error', msg: e?.response?.data?.error || 'Failed to fetch analytics' });
    } finally {
      setAnalyticsLoading(false);
    }
  };

  // Copy URL to clipboard
  const copyToClipboard = async (text) => {
    try {
      await navigator.clipboard.writeText(text);
      setSnack({ open: true, severity: 'success', msg: 'Copied to clipboard' });
    } catch {
      setSnack({ open: true, severity: 'error', msg: 'Failed to copy' });
    }
  };

  // Open edit dialog
  const openEditDialog = (qrCode) => {
    setSelectedQRCode(qrCode);
    setFormData({
      name: qrCode.name || '',
      description: qrCode.description || '',
      destination_url: qrCode.destination_url || '',
      category: qrCode.category || 'marketing',
      foreground_color: qrCode.foreground_color || '#000000',
      background_color: qrCode.background_color || '#FFFFFF',
      linked_entity_type: qrCode.linked_entity_type || '',
      linked_entity_id: qrCode.linked_entity_id || '',
      auto_generated: qrCode.auto_generated || false,
      tags: qrCode.tags || [],
    });
    setPreview(qrCode.qr_code_image_url);
    setEditDialogOpen(true);
    closeMenu();
  };

  // Open detail dialog
  const openDetailDialog = (qrCode) => {
    setSelectedQRCode(qrCode);
    setDetailDialogOpen(true);
    closeMenu();
  };

  // Menu handlers
  const openMenu = (event, qrCode) => {
    setMenuAnchor(event.currentTarget);
    setMenuQRCode(qrCode);
  };

  const closeMenu = () => {
    setMenuAnchor(null);
    setMenuQRCode(null);
  };

  const openCreateDialog = () => {
    setFormData({ ...DEFAULT_FORM_DATA, folder_id: selectedFolderId });
    setPreview(null);
    setSelectedTemplate(null);
    setSelectedTags([]);
    setAdvancedSettings({});
    setCreateStep(0);
    setCreateDialogOpen(true);
  };

  useEffect(() => {
    const handleKeydown = (event) => {
      // Quick create shortcut: Shift + C
      if (event.shiftKey && event.key.toLowerCase() === "c") {
        const target = event.target;
        const tagName = target?.tagName?.toLowerCase?.() || "";
        const isTypingTarget =
          tagName === "input" ||
          tagName === "textarea" ||
          target?.isContentEditable;
        if (isTypingTarget) return;

        event.preventDefault();
        openCreateDialog();
      }
    };

    window.addEventListener("keydown", handleKeydown);
    return () => window.removeEventListener("keydown", handleKeydown);
  }, [selectedFolderId]);

  // Form field change handler
  const handleFormChange = (field, value) => {
    setFormData(prev => ({ ...prev, [field]: value }));
  };

  // Handle design changes from QRCodeDesigner
  const handleDesignChange = useCallback((designValues) => {
    setFormData(prev => ({
      ...prev,
      foreground_color: designValues.foreground_color,
      background_color: designValues.background_color,
      pattern_style: designValues.pattern_style,
      corner_style: designValues.corner_style,
    }));
  }, []);

  // Handle template selection
  const handleTemplateSelect = (template) => {
    setSelectedTemplate(template);
    if (template) {
      setFormData(prev => ({
        ...prev,
        foreground_color: template.foreground_color || prev.foreground_color,
        background_color: template.background_color || prev.background_color,
        pattern_style: template.dot_style || prev.pattern_style,
        corner_style: template.corner_square_style || prev.corner_style,
        template_id: template.id,
      }));
    }
  };

  // QR Code Form JSX - using a variable instead of a component to prevent remounting on every render
  const qrCodeFormContent = (
    <Box sx={{ display: 'flex', flexDirection: 'column', gap: 3 }}>
      {/* Step indicator for create dialog */}
      {createDialogOpen && (
        <Tabs value={createStep} onChange={(e, v) => setCreateStep(v)} sx={{ mb: 2 }}>
          <Tab label="1. Basic Info" />
          <Tab label="2. Design" disabled={!formData.destination_url} />
          <Tab label="3. Advanced" disabled={!formData.destination_url} />
        </Tabs>
      )}

      {/* Step 1: Basic Info */}
      {(createStep === 0 || editDialogOpen) && (
        <>
          <Typography variant="subtitle2" fontWeight="bold" color="primary">Basic Information</Typography>
          <TextField
            label="Name *"
            value={formData.name}
            onChange={(e) => handleFormChange('name', e.target.value)}
            fullWidth
            placeholder="e.g., Homepage Booking QR"
          />
          <TextField
            label="Description"
            value={formData.description}
            onChange={(e) => handleFormChange('description', e.target.value)}
            fullWidth
            multiline
            rows={2}
            placeholder="Optional description for internal reference"
          />
          <TextField
            label="Destination URL *"
            value={formData.destination_url}
            onChange={(e) => handleFormChange('destination_url', e.target.value)}
            fullWidth
            placeholder="https://acmeops.com/book"
            helperText="Where users will be redirected after scanning. We'll track all scans automatically."
          />
          <Grid container spacing={2}>
            <Grid item xs={6}>
              <FormControl fullWidth>
                <InputLabel>Category</InputLabel>
                <Select
                  value={formData.category}
                  label="Category"
                  onChange={(e) => handleFormChange('category', e.target.value)}
                >
                  {CATEGORY_OPTIONS.map(opt => (
                    <MenuItem key={opt.value} value={opt.value}>{opt.label}</MenuItem>
                  ))}
                </Select>
              </FormControl>
            </Grid>
            <Grid item xs={6}>
              <FormControl fullWidth>
                <InputLabel>Folder</InputLabel>
                <Select
                  value={formData.folder_id || ''}
                  label="Folder"
                  onChange={(e) => handleFormChange('folder_id', e.target.value || null)}
                >
                  <MenuItem value="">No Folder (Root)</MenuItem>
                  {folders.map(folder => (
                    <MenuItem key={folder.id} value={folder.id}>
                      <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                        <Box sx={{ width: 12, height: 12, borderRadius: 1, bgcolor: folder.color || '#6A469D' }} />
                        {folder.name}
                        {folder.qr_count > 0 && (
                          <Typography variant="caption" color="text.secondary" sx={{ ml: 'auto' }}>
                            ({folder.qr_count})
                          </Typography>
                        )}
                      </Box>
                    </MenuItem>
                  ))}
                </Select>
              </FormControl>
            </Grid>
          </Grid>

          {/* Tags */}
          <Box sx={{ mt: 1 }}>
            <QRCodeTagManager
              selectedTags={selectedTags}
              onTagsChange={setSelectedTags}
              mode="inline"
            />
          </Box>
        </>
      )}

      {/* Step 2: Design */}
      {(createStep === 1 || editDialogOpen) && (
        <>
          {createDialogOpen && createStep === 1 && (
            <>
              <Typography variant="subtitle2" fontWeight="bold" color="primary" gutterBottom>
                Quick Start: Choose a Template
              </Typography>
              <QRCodeTemplatePicker
                selectedTemplateId={selectedTemplate?.id}
                onSelect={handleTemplateSelect}
                compact
              />
              <Divider sx={{ my: 2 }} />
            </>
          )}
          
          <Typography variant="subtitle2" fontWeight="bold" color="primary">Custom Design</Typography>
          <QRCodeDesigner
            value={{
              foreground_color: formData.foreground_color,
              background_color: formData.background_color,
              pattern_style: formData.pattern_style,
              corner_style: formData.corner_style,
            }}
            onChange={handleDesignChange}
            destinationUrl={formData.destination_url}
            showPreview={true}
          />
        </>
      )}

      {/* Step 3: Advanced Settings */}
      {createStep === 2 && createDialogOpen && (
        <QRCodeAdvancedSettings
          settings={advancedSettings}
          onChange={setAdvancedSettings}
        />
      )}

      {/* Tracking Info (always show) */}
      <Alert severity="info" sx={{ mt: 2 }}>
        <Typography variant="body2">
          <strong>Automatic Tracking:</strong> This QR code will point to our tracking server first, 
          which logs each scan before redirecting to your destination URL. You'll see analytics for 
          total scans, unique visitors, device types, and locations.
        </Typography>
      </Alert>
    </Box>
  );

  // Empty state for internal QR codes
  const InternalEmptyState = () => (
    <Paper sx={{ p: 6, textAlign: 'center' }}>
      <QrCodeIcon className="h-16 w-16 text-brand-purple mb-2" />
      <Typography variant="h6" color="text.secondary" gutterBottom>
        No QR Codes Yet
      </Typography>
      <Typography variant="body2" color="text.secondary" sx={{ mb: 3 }}>
        Create your first self-hosted QR code with automatic scan tracking.
        Our system will track every scan before redirecting to your destination.
      </Typography>
      <Button
        variant="contained"
        startIcon={<AddIcon className="h-5 w-5" />}
        onClick={() => {
          setFormData(DEFAULT_FORM_DATA);
          setPreview(null);
          setCreateDialogOpen(true);
        }}
      >
        Create QR Code
      </Button>
    </Paper>
  );

  // Empty state for external QR codes
  const ExternalEmptyState = () => (
    <Paper sx={{ p: 6, textAlign: 'center' }}>
      <CloudSyncIcon className="h-16 w-16 text-gray-300 mb-2" />
      <Typography variant="h6" color="text.secondary" gutterBottom>
        No External QR Codes Synced
      </Typography>
      <Typography variant="body2" color="text.secondary" sx={{ mb: 3 }}>
        You have QR codes in your QR Code Generator PRO account.
        Click "Sync from Account" to import them.
      </Typography>
      <Button
        variant="outlined"
        startIcon={syncing ? <CircularProgress size={16} /> : <CloudSyncIcon className="h-5 w-5" />}
        onClick={syncFromRemote}
        disabled={syncing}
      >
        {syncing ? 'Syncing...' : 'Sync from Account'}
      </Button>
    </Paper>
  );

  return (
    <Box sx={{ width: '100%', minWidth: 0 }}>
      <Drawer
        anchor="left"
        open={folderDrawerOpen}
        onClose={() => setFolderDrawerOpen(false)}
      >
        <Box sx={{ width: 300, p: 2 }}>
          <Typography variant="subtitle1" fontWeight={700} sx={{ mb: 1 }}>
            QR Folders
          </Typography>
          <QRCodeFolderTree
            selectedFolderId={selectedFolderId}
            onSelectFolder={(folderId) => {
              setSelectedFolderId(folderId);
              setFolderDrawerOpen(false);
            }}
            onFolderChange={() => fetchInternalQRCodes()}
          />
        </Box>
      </Drawer>

      {/* Main Content */}
      <Box sx={{ flexGrow: 1, minWidth: 0 }}>
        {/* Header */}
        <Box sx={{ mb: 3, display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', flexWrap: 'wrap', gap: 2 }}>
          <Box>
            {onBackToSettings && (
              <Button
                size="small"
                variant="text"
                startIcon={<ArrowBackIcon className="h-5 w-5" />}
                onClick={onBackToSettings}
                sx={{ mb: 1, pl: 0 }}
              >
                Back to System Settings
              </Button>
            )}
            <Typography variant="h6" fontWeight={700} sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
              <QrCodeIcon className="h-5 w-5" /> QR Code Management
            </Typography>
            {stats && (
              <Typography variant="body2" color="text.secondary">
                {stats.total_qr_codes} total QR codes • {stats.active_qr_codes} active • {stats.total_scans} total scans
              </Typography>
            )}
          </Box>
          <Stack direction="row" spacing={1} alignItems="center" sx={{ flexWrap: 'wrap', justifyContent: 'flex-end' }}>
            <Button
              variant="outlined"
              startIcon={<MenuOpenIcon className="h-5 w-5" />}
              onClick={() => setFolderDrawerOpen(true)}
              sx={{ display: activeTab === 0 ? 'inline-flex' : 'none' }}
            >
              Folders
            </Button>
            <TextField
              size="small"
              placeholder="Search QR codes..."
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              InputProps={{
                startAdornment: (
                  <InputAdornment position="start"><SearchIcon className="h-4 w-4" /></InputAdornment>
                )
              }}
              sx={{ width: { xs: '100%', sm: 220 } }}
            />
            <FormControl size="small" sx={{ minWidth: 120 }}>
              <InputLabel>Category</InputLabel>
              <Select
                value={categoryFilter}
                label="Category"
                onChange={(e) => setCategoryFilter(e.target.value)}
              >
                <MenuItem value="all">All Categories</MenuItem>
                {CATEGORY_OPTIONS.map(opt => (
                  <MenuItem key={opt.value} value={opt.value}>{opt.label}</MenuItem>
                ))}
              </Select>
            </FormControl>
            <Tooltip title="Export">
              <IconButton onClick={() => window.open('/api/qr-codes/bulk/export?format=csv', '_blank')}>
                <DownloadIcon className="h-5 w-5" />
              </IconButton>
            </Tooltip>
            <Tooltip title="Refresh">
              <IconButton onClick={() => { fetchInternalQRCodes(); fetchExternalQRCodes(); }}>
                <RefreshIcon className="h-5 w-5" />
              </IconButton>
            </Tooltip>
          </Stack>
        </Box>

        {/* Tabs */}
        <Box sx={{ borderBottom: 1, borderColor: 'divider', mb: 2 }}>
          <Tabs value={activeTab} onChange={(e, v) => setActiveTab(v)}>
            <Tab 
              icon={<HomeIcon className="h-5 w-5" />}
              iconPosition="start"
              label={`Our QR Codes (${internalQRCodes.length})`}
            />
            <Tab 
              icon={<HistoryIcon className="h-5 w-5" />}
              iconPosition="start"
              label={`External (Legacy) (${externalQRCodes.length})`}
            />
          </Tabs>
        </Box>

        {/* Tab 1: Our QR Codes (Self-Hosted) */}
        <TabPanel value={activeTab} index={0}>
          <Box
            sx={{
              mb: 2,
              display: 'flex',
              justifyContent: 'space-between',
              alignItems: 'center',
              position: 'sticky',
              top: 0,
              zIndex: 5,
              py: 1,
              px: 1,
              bgcolor: 'background.paper',
              borderBottom: 1,
              borderColor: 'divider',
            }}
          >
            {selectedFolderId && (
              <Button 
                size="small" 
                onClick={() => setSelectedFolderId(null)}
                startIcon={<HomeIcon className="h-5 w-5" />}
              >
                Back to All
              </Button>
            )}
            <Box sx={{ flexGrow: 1 }} />
            <Button
              variant="contained"
              startIcon={<AddIcon className="h-5 w-5" />}
              onClick={openCreateDialog}
            >
              Create QR Code
            </Button>
          </Box>

          {internalLoading && <LinearProgress sx={{ mb: 2 }} />}
          {internalError && <Alert severity="error" sx={{ mb: 2 }}>{internalError}</Alert>}

          {/* Internal QR Codes Grid */}
          {internalQRCodes.length > 0 ? (
            <Grid container spacing={3}>
              {internalQRCodes.map((qrCode) => (
                <Grid item xs={12} sm={6} md={4} lg={3} key={qrCode.id}>
                  <QRCodeCard 
                    qrCode={qrCode} 
                    isExternal={false} 
                    onMenuOpen={openMenu}
                    onViewDetails={openDetailDialog}
                  />
                </Grid>
              ))}
            </Grid>
          ) : !internalLoading && (
            <InternalEmptyState />
          )}
        </TabPanel>

      {/* Tab 2: External QR Codes (Legacy) */}
      <TabPanel value={activeTab} index={1}>
        <Alert severity="warning" sx={{ mb: 2 }}>
          <Typography variant="body2">
            <strong>Legacy QR Codes:</strong> These QR codes are synced from your QR Code Generator PRO account.
            We recommend migrating to our self-hosted QR codes for better tracking and control.
            This section will be retired in a future update.
          </Typography>
        </Alert>

        <Box sx={{ mb: 2, display: 'flex', justifyContent: 'flex-end' }}>
          <Button
            variant="outlined"
            startIcon={syncing ? <CircularProgress size={16} /> : <CloudSyncIcon className="h-5 w-5" />}
            onClick={syncFromRemote}
            disabled={syncing}
          >
            {syncing ? 'Syncing...' : 'Sync from Account'}
          </Button>
        </Box>

        {externalLoading && <LinearProgress sx={{ mb: 2 }} />}
        {externalError && <Alert severity="error" sx={{ mb: 2 }}>{externalError}</Alert>}

        {/* External QR Codes Grid */}
        {externalQRCodes.length > 0 ? (
          <Grid container spacing={3}>
            {externalQRCodes.map((qrCode) => (
              <Grid item xs={12} sm={6} md={4} lg={3} key={qrCode.id}>
                <QRCodeCard 
                  qrCode={qrCode} 
                  isExternal={true}
                  onMenuOpen={openMenu}
                  onViewDetails={openDetailDialog}
                />
              </Grid>
            ))}
          </Grid>
        ) : !externalLoading && (
          <ExternalEmptyState />
        )}
      </TabPanel>

      {activeTab === 0 && !createDialogOpen && (
        <Tooltip title="Create QR Code (Shift+C)">
          <Fab
            color="primary"
            variant="extended"
            onClick={openCreateDialog}
            sx={{
              position: "fixed",
              right: 24,
              bottom: 24,
              zIndex: 1200,
            }}
          >
            <AddIcon className="h-5 w-5 mr-1" />
            Create QR
          </Fab>
        </Tooltip>
      )}

      {/* Context Menu */}
      <Menu 
        anchorEl={menuAnchor} 
        open={Boolean(menuAnchor)} 
        onClose={closeMenu}
        anchorOrigin={{
          vertical: 'bottom',
          horizontal: 'right',
        }}
        transformOrigin={{
          vertical: 'top',
          horizontal: 'right',
        }}
      >
        <MenuItem onClick={() => openDetailDialog(menuQRCode)}>
          <VisibilityIcon className="h-4 w-4 mr-1" /> View Details
        </MenuItem>
        <MenuItem onClick={() => openEditDialog(menuQRCode)}>
          <EditIcon className="h-4 w-4 mr-1" /> Edit
        </MenuItem>
        <MenuItem onClick={() => { fetchAnalytics(menuQRCode); closeMenu(); }}>
          <BarChartIcon className="h-4 w-4 mr-1" /> Analytics
        </MenuItem>
        <Divider />
        {menuQRCode?.source === 'internal' && (
          <>
            <MenuItem onClick={() => { setSelectedQRCode(menuQRCode); setNotificationDialogOpen(true); closeMenu(); }}>
              <NotificationsIcon className="h-4 w-4 mr-1" /> Notifications
            </MenuItem>
            <MenuItem onClick={() => { setSelectedQRCode(menuQRCode); setAdvancedSettings(menuQRCode); setAdvancedSettingsDialogOpen(true); closeMenu(); }}>
              <SettingsIcon className="h-4 w-4 mr-1" /> Advanced Settings
            </MenuItem>
            <Divider />
          </>
        )}
        {menuQRCode?.tracking_url && (
          <MenuItem onClick={() => { copyToClipboard(menuQRCode?.tracking_url); closeMenu(); }}>
            <ContentCopyIcon className="h-4 w-4 mr-1" /> Copy Tracking URL
          </MenuItem>
        )}
        <MenuItem onClick={() => { copyToClipboard(menuQRCode?.destination_url); closeMenu(); }}>
          <ContentCopyIcon className="h-4 w-4 mr-1" /> Copy Destination URL
        </MenuItem>
        <MenuItem onClick={() => { handleDownload(menuQRCode, 'png'); closeMenu(); }}>
          <DownloadIcon className="h-4 w-4 mr-1" /> Download PNG
        </MenuItem>
        <MenuItem onClick={() => { handleDownload(menuQRCode, 'svg'); closeMenu(); }}>
          <DownloadIcon className="h-4 w-4 mr-1" /> Download SVG
        </MenuItem>
        <Divider />
        <MenuItem onClick={() => { handleToggleActive(menuQRCode); closeMenu(); }}>
          {menuQRCode?.is_active ? (
            <><CancelIcon className="h-4 w-4 mr-1" /> Deactivate</>
          ) : (
            <><CheckCircleIcon className="h-4 w-4 mr-1" /> Activate</>
          )}
        </MenuItem>
        <MenuItem onClick={() => { handleDelete(menuQRCode); closeMenu(); }} sx={{ color: 'error.main' }}>
          <DeleteIcon className="h-4 w-4 mr-1" /> Delete
        </MenuItem>
      </Menu>

      {/* Create Dialog */}
      <Dialog
        open={createDialogOpen}
        onClose={() => !saving && setCreateDialogOpen(false)}
        maxWidth="md"
        fullWidth
      >
        <DialogTitle>
          <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
            <QrCodeIcon className="h-5 w-5 text-brand-purple" />
            Create New QR Code
          </Box>
        </DialogTitle>
        <DialogContent dividers>
          {qrCodeFormContent}
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setCreateDialogOpen(false)} disabled={saving}>
            Cancel
          </Button>
          <Button
            variant="contained"
            onClick={handleCreate}
            disabled={saving || !formData.name || !formData.destination_url}
            startIcon={saving ? <CircularProgress size={16} /> : <AddIcon className="h-5 w-5" />}
          >
            {saving ? 'Creating...' : 'Create QR Code'}
          </Button>
        </DialogActions>
      </Dialog>

      {/* Edit Dialog */}
      <Dialog
        open={editDialogOpen}
        onClose={() => !saving && setEditDialogOpen(false)}
        maxWidth="md"
        fullWidth
      >
        <DialogTitle>Edit QR Code</DialogTitle>
        <DialogContent dividers>
          {qrCodeFormContent}
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setEditDialogOpen(false)} disabled={saving}>
            Cancel
          </Button>
          <Button
            variant="contained"
            onClick={handleUpdate}
            disabled={saving || !formData.name || !formData.destination_url}
            startIcon={saving ? <CircularProgress size={16} /> : <EditIcon className="h-5 w-5" />}
          >
            {saving ? 'Saving...' : 'Save Changes'}
          </Button>
        </DialogActions>
      </Dialog>

      {/* Detail Dialog */}
      <Dialog
        open={detailDialogOpen}
        onClose={() => setDetailDialogOpen(false)}
        maxWidth="sm"
        fullWidth
      >
        <DialogTitle>{selectedQRCode?.name}</DialogTitle>
        <DialogContent dividers>
          {selectedQRCode && (
            <Box>
              {/* QR Code Image */}
              <Box sx={{ display: 'flex', justifyContent: 'center', mb: 3 }}>
                {selectedQRCode.qr_code_image_url ? (
                  <img
                    src={selectedQRCode.qr_code_image_url}
                    alt={selectedQRCode.name}
                    style={{ maxWidth: 250, borderRadius: 8 }}
                  />
                ) : (
                  <Box
                    sx={{
                      width: 200,
                      height: 200,
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      bgcolor: 'grey.100',
                      borderRadius: 2,
                    }}
                  >
                    <QrCodeIcon className="h-20 w-20 text-gray-400" />
                  </Box>
                )}
              </Box>

              {/* Details */}
              <Stack spacing={2}>
                {/* Tracking URL */}
                {selectedQRCode.tracking_url && (
                  <Box>
                    <Typography variant="caption" color="text.secondary">Tracking URL</Typography>
                    <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                      <Typography variant="body2" sx={{ wordBreak: 'break-all', color: 'primary.main' }}>
                        {selectedQRCode.tracking_url}
                      </Typography>
                      <IconButton size="small" onClick={() => copyToClipboard(selectedQRCode.tracking_url)}>
                        <ContentCopyIcon className="h-4 w-4" />
                      </IconButton>
                    </Box>
                  </Box>
                )}

                <Box>
                  <Typography variant="caption" color="text.secondary">Destination URL</Typography>
                  <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                    <Typography variant="body2" sx={{ wordBreak: 'break-all' }}>
                      {selectedQRCode.destination_url}
                    </Typography>
                    <IconButton size="small" onClick={() => copyToClipboard(selectedQRCode.destination_url)}>
                      <ContentCopyIcon className="h-4 w-4" />
                    </IconButton>
                  </Box>
                </Box>

                {selectedQRCode.description && (
                  <Box>
                    <Typography variant="caption" color="text.secondary">Description</Typography>
                    <Typography variant="body2">{selectedQRCode.description}</Typography>
                  </Box>
                )}

                <Box sx={{ display: 'flex', gap: 2 }}>
                  <Box>
                    <Typography variant="caption" color="text.secondary">Category</Typography>
                    <Typography variant="body2">{selectedQRCode.category || 'None'}</Typography>
                  </Box>
                  <Box>
                    <Typography variant="caption" color="text.secondary">Status</Typography>
                    <Box sx={{ mt: 0.5 }}>
                      {selectedQRCode.is_active ? (
                        <Chip size="small" color="success" label="Active" />
                      ) : (
                        <Chip size="small" color="warning" label="Inactive" />
                      )}
                    </Box>
                  </Box>
                  <Box>
                    <Typography variant="caption" color="text.secondary">Source</Typography>
                    <Box sx={{ mt: 0.5 }}>
                      <Chip 
                        size="small" 
                        color={selectedQRCode.source === 'internal' ? 'primary' : 'info'} 
                        label={selectedQRCode.source === 'internal' ? 'Self-Hosted' : 'External'} 
                        variant="outlined"
                      />
                    </Box>
                  </Box>
                </Box>

                <Box sx={{ display: 'flex', gap: 2 }}>
                  <Box>
                    <Typography variant="caption" color="text.secondary">Total Scans</Typography>
                    <Typography variant="body2" fontWeight="bold" color="primary">
                      {selectedQRCode.total_scans || 0}
                    </Typography>
                  </Box>
                  <Box>
                    <Typography variant="caption" color="text.secondary">Unique Scans</Typography>
                    <Typography variant="body2" fontWeight="bold" color="primary">
                      {selectedQRCode.unique_scans || 0}
                    </Typography>
                  </Box>
                  {selectedQRCode.last_scanned_at && (
                    <Box>
                      <Typography variant="caption" color="text.secondary">Last Scanned</Typography>
                      <Typography variant="body2">
                        {new Date(selectedQRCode.last_scanned_at).toLocaleDateString()}
                      </Typography>
                    </Box>
                  )}
                </Box>

                {selectedQRCode.linked_entity_type && (
                  <Box>
                    <Typography variant="caption" color="text.secondary">Linked To</Typography>
                    <Box sx={{ mt: 0.5 }}>
                      <Chip 
                        size="small" 
                        icon={<LinkIcon className="h-5 w-5" />}
                        label={`${selectedQRCode.linked_entity_type}: ${selectedQRCode.linked_entity_id}`}
                        color="secondary"
                        variant="outlined"
                      />
                    </Box>
                  </Box>
                )}

                <Box>
                  <Typography variant="caption" color="text.secondary">Created</Typography>
                  <Typography variant="body2">
                    {new Date(selectedQRCode.created_at).toLocaleDateString('en-US', {
                      year: 'numeric',
                      month: 'long',
                      day: 'numeric',
                      hour: '2-digit',
                      minute: '2-digit',
                    })}
                  </Typography>
                </Box>
              </Stack>
            </Box>
          )}
        </DialogContent>
        <DialogActions>
          <Button
            startIcon={<BarChartIcon className="h-5 w-5" />}
            onClick={() => { fetchAnalytics(selectedQRCode); setDetailDialogOpen(false); }}
          >
            Analytics
          </Button>
          <Button
            startIcon={<DownloadIcon className="h-5 w-5" />}
            onClick={() => handleDownload(selectedQRCode, 'png')}
          >
            Download PNG
          </Button>
          <Button onClick={() => setDetailDialogOpen(false)}>Close</Button>
        </DialogActions>
      </Dialog>

      {/* Analytics Dialog */}
      <Dialog
        open={analyticsDialogOpen}
        onClose={() => setAnalyticsDialogOpen(false)}
        maxWidth="md"
        fullWidth
      >
        <DialogTitle>
          <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
            <BarChartIcon className="h-5 w-5" />
            Analytics: {selectedQRCode?.name}
          </Box>
        </DialogTitle>
        <DialogContent dividers>
          {analyticsLoading ? (
            <Box sx={{ display: 'flex', justifyContent: 'center', py: 4 }}>
              <CircularProgress />
            </Box>
          ) : analytics ? (
            <Box>
              {/* Summary Stats */}
              <Grid container spacing={2} sx={{ mb: 3 }}>
                <Grid item xs={6} sm={3}>
                  <Paper sx={{ p: 2, textAlign: 'center' }}>
                    <Typography variant="h4" color="primary">
                      {analytics.summary?.total_scans || 0}
                    </Typography>
                    <Typography variant="caption" color="text.secondary">
                      Total Scans
                    </Typography>
                  </Paper>
                </Grid>
                <Grid item xs={6} sm={3}>
                  <Paper sx={{ p: 2, textAlign: 'center' }}>
                    <Typography variant="h4" color="primary">
                      {analytics.summary?.unique_scans || 0}
                    </Typography>
                    <Typography variant="caption" color="text.secondary">
                      Unique Scans
                    </Typography>
                  </Paper>
                </Grid>
                <Grid item xs={6} sm={3}>
                  <Paper sx={{ p: 2, textAlign: 'center' }}>
                    <Typography variant="h4" color="primary">
                      {analytics.summary?.countries || 0}
                    </Typography>
                    <Typography variant="caption" color="text.secondary">
                      Countries
                    </Typography>
                  </Paper>
                </Grid>
                <Grid item xs={6} sm={3}>
                  <Paper sx={{ p: 2, textAlign: 'center' }}>
                    <Typography variant="body2">
                      {analytics.summary?.last_scan
                        ? new Date(analytics.summary.last_scan).toLocaleDateString()
                        : 'Never'}
                    </Typography>
                    <Typography variant="caption" color="text.secondary">
                      Last Scan
                    </Typography>
                  </Paper>
                </Grid>
              </Grid>

              {/* Device Breakdown */}
              {analytics.deviceBreakdown?.length > 0 && (
                <Box sx={{ mb: 3 }}>
                  <Typography variant="subtitle2" fontWeight="bold" gutterBottom>
                    Scans by Device
                  </Typography>
                  <Stack direction="row" spacing={1} flexWrap="wrap" useFlexGap>
                    {analytics.deviceBreakdown.map((device) => (
                      <Chip
                        key={device.device_type}
                        label={`${device.device_type || 'Unknown'}: ${device.count}`}
                        variant="outlined"
                      />
                    ))}
                  </Stack>
                </Box>
              )}

              {/* Top Countries */}
              {analytics.topCountries?.length > 0 && (
                <Box sx={{ mb: 3 }}>
                  <Typography variant="subtitle2" fontWeight="bold" gutterBottom>
                    Top Countries
                  </Typography>
                  <Stack direction="row" spacing={1} flexWrap="wrap" useFlexGap>
                    {analytics.topCountries.map((country) => (
                      <Chip
                        key={country.country}
                        label={`${country.country || 'Unknown'}: ${country.count}`}
                        variant="outlined"
                      />
                    ))}
                  </Stack>
                </Box>
              )}

              {/* Recent Scans */}
              {analytics.recentScans?.length > 0 && (
                <Box>
                  <Typography variant="subtitle2" fontWeight="bold" gutterBottom>
                    Recent Scans
                  </Typography>
                  <Paper variant="outlined">
                    {analytics.recentScans.slice(0, 5).map((scan, idx) => (
                      <Box
                        key={scan.id}
                        sx={{
                          p: 1.5,
                          borderBottom: idx < Math.min(analytics.recentScans.length, 5) - 1 ? '1px solid' : 'none',
                          borderColor: 'divider',
                        }}
                      >
                        <Typography variant="body2">
                          {new Date(scan.scanned_at).toLocaleString()}
                        </Typography>
                        <Typography variant="caption" color="text.secondary">
                          {[scan.device_type, scan.browser, scan.country].filter(Boolean).join(' • ')}
                        </Typography>
                      </Box>
                    ))}
                  </Paper>
                </Box>
              )}

              {analytics.summary?.total_scans === '0' && (
                <Box sx={{ textAlign: 'center', py: 4 }}>
                  <Typography color="text.secondary">
                    No scan data available yet. Share your QR code to start tracking!
                  </Typography>
                </Box>
              )}
            </Box>
          ) : (
            <Typography color="text.secondary" sx={{ textAlign: 'center', py: 4 }}>
              No analytics data available
            </Typography>
          )}
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setAnalyticsDialogOpen(false)}>Close</Button>
        </DialogActions>
      </Dialog>

      {/* Notification Settings Dialog */}
      <Dialog
        open={notificationDialogOpen}
        onClose={() => setNotificationDialogOpen(false)}
        maxWidth="sm"
        fullWidth
      >
        <DialogTitle>
          <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
            <NotificationsIcon className="h-5 w-5 text-brand-purple" />
            Notification Settings
          </Box>
        </DialogTitle>
        <DialogContent dividers>
          {selectedQRCode && (
            <QRCodeNotificationSettings
              qrCodeId={selectedQRCode.id}
              onSave={() => {
                setNotificationDialogOpen(false);
                setSnack({ open: true, severity: 'success', msg: 'Notification settings saved' });
              }}
            />
          )}
        </DialogContent>
      </Dialog>

      {/* Advanced Settings Dialog */}
      <Dialog
        open={advancedSettingsDialogOpen}
        onClose={() => setAdvancedSettingsDialogOpen(false)}
        maxWidth="sm"
        fullWidth
      >
        <DialogTitle>
          <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
            <SettingsIcon className="h-5 w-5 text-brand-purple" />
            Advanced Settings
          </Box>
        </DialogTitle>
        <DialogContent dividers>
          {selectedQRCode && (
            <QRCodeAdvancedSettings
              qrCodeId={selectedQRCode.id}
              settings={advancedSettings}
              onChange={setAdvancedSettings}
              onSave={() => {
                setAdvancedSettingsDialogOpen(false);
                setSnack({ open: true, severity: 'success', msg: 'Advanced settings saved' });
                fetchInternalQRCodes();
              }}
            />
          )}
        </DialogContent>
      </Dialog>

      {/* Detailed Analytics Dialog */}
      <Dialog
        open={analyticsDialogOpen && selectedQRCode?.source === 'internal'}
        onClose={() => setAnalyticsDialogOpen(false)}
        maxWidth="lg"
        fullWidth
      >
        <DialogTitle>
          <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
            <BarChartIcon className="h-5 w-5 text-brand-purple" />
            Detailed Analytics: {selectedQRCode?.name}
          </Box>
        </DialogTitle>
        <DialogContent dividers>
          {selectedQRCode && (
            <QRCodeDetailedAnalytics qrCodeId={selectedQRCode.id} />
          )}
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setAnalyticsDialogOpen(false)}>Close</Button>
        </DialogActions>
      </Dialog>

      {/* Snackbar */}
      <Snackbar
        open={snack.open}
        autoHideDuration={3000}
        onClose={() => setSnack(s => ({ ...s, open: false }))}
        anchorOrigin={{ vertical: 'bottom', horizontal: 'center' }}
      >
        <Alert
          onClose={() => setSnack(s => ({ ...s, open: false }))}
          severity={snack.severity}
          variant="filled"
        >
          {snack.msg}
        </Alert>
      </Snackbar>
      <ConfirmationModal
        isOpen={confirmState.isOpen}
        onClose={() => setConfirmState(s => ({ ...s, isOpen: false }))}
        onConfirm={() => { confirmState.action?.(); setConfirmState(s => ({ ...s, isOpen: false })); }}
        title={confirmState.title}
        message={confirmState.message}
        isDestructive
      />
      </Box>
    </Box>
  );
}
