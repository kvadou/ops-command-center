import React, { useState, useEffect } from 'react';
import { useToast } from '../hooks/useToast';
import {
  Box,
  Card,
  Typography,
  Button,
  TextField,
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TableRow,
  Paper,
  Chip,
  IconButton,
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions,
  Grid,
  FormControl,
  InputLabel,
  Select,
  MenuItem,
  Switch,
  FormControlLabel,
  Alert,
  CircularProgress,
  Tabs,
  Tab,
} from '@mui/material';
import { PencilSquareIcon, XCircleIcon, EnvelopeIcon, Cog6ToothIcon } from '@heroicons/react/24/outline';
import { CheckIcon } from '@heroicons/react/24/outline';
import ReactQuill from 'react-quill';
import 'react-quill/dist/quill.snow.css';
import axios from 'axios';

const brandColors = {
  purple: '#6A469D',
  navy: '#2D2F8E',
  cyan: '#50C8DF',
  green: '#34B256',
  orange: '#F79A30',
  pink: '#DA2E72',
};

export default function SchoolEmailTemplateManager() {
  const toast = useToast();
  const [templates, setTemplates] = useState([]);
  const [loading, setLoading] = useState(false);
  const [editingTemplate, setEditingTemplate] = useState(null);
  const [templateForm, setTemplateForm] = useState({
    campaign_type: '',
    campaign_name: '',
    description: '',
    subject_template: '',
    body_template: '',
    from_name: 'Acme Operations',
    from_email: 'support@acmeops.com',
    default_days_after_trigger: 0,
    default_send_time: '09:00:00',
    is_active: true,
    requires_approval: false,
  });
  const [dialogOpen, setDialogOpen] = useState(false);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    fetchTemplates();
  }, []);

  const fetchTemplates = async () => {
    setLoading(true);
    try {
      // Fetch all templates including inactive ones for admin management
      const response = await axios.get('/api/school-email-campaigns/templates?include_inactive=true', {
        withCredentials: true,
      });
      setTemplates(response.data.templates || []);
    } catch (error) {
      console.error('Error fetching templates:', error);
      toast.error(`Failed to fetch templates: ${error.response?.data?.error || error.message}`);
    } finally {
      setLoading(false);
    }
  };

  const handleEditTemplate = (template) => {
    setEditingTemplate(template);
    setTemplateForm({
      campaign_type: template.campaign_type || '',
      campaign_name: template.campaign_name || '',
      description: template.description || '',
      subject_template: template.subject_template || '',
      body_template: template.body_template || '',
      from_name: template.from_name || 'Acme Operations',
      from_email: template.from_email || 'support@acmeops.com',
      default_days_after_trigger: template.default_days_after_trigger || 0,
      default_send_time: template.default_send_time || '09:00:00',
      is_active: template.is_active !== false,
      requires_approval: template.requires_approval || false,
    });
    setDialogOpen(true);
  };

  const handleSaveTemplate = async () => {
    if (!templateForm.campaign_type || !templateForm.campaign_name || !templateForm.subject_template || !templateForm.body_template) {
      toast.error('Please fill in all required fields (Campaign Type, Name, Subject, and Body).');
      return;
    }

    setSaving(true);
    try {
      if (editingTemplate) {
        // Update existing template
        await axios.put(`/api/school-email-campaigns/templates/${editingTemplate.id}`, templateForm, { withCredentials: true });
      } else {
        // Create new template
        await axios.post('/api/school-email-campaigns/templates', templateForm, { withCredentials: true });
      }

      setDialogOpen(false);
      setEditingTemplate(null);
      fetchTemplates();
      toast.success('Template saved successfully!');
    } catch (error) {
      console.error('Error saving template:', error);
      toast.error(`Failed to save template: ${error.response?.data?.error || error.message}`);
    } finally {
      setSaving(false);
    }
  };

  const handleCancel = () => {
    setDialogOpen(false);
    setEditingTemplate(null);
    setTemplateForm({
      campaign_type: '',
      campaign_name: '',
      description: '',
      subject_template: '',
      body_template: '',
      from_name: 'Acme Operations',
      from_email: 'support@acmeops.com',
      default_days_after_trigger: 0,
      default_send_time: '09:00:00',
      is_active: true,
      requires_approval: false,
    });
  };

  if (loading) {
    return (
      <Box display="flex" justifyContent="center" alignItems="center" minHeight={400}>
        <CircularProgress />
      </Box>
    );
  }

  return (
    <Box>
      <Box display="flex" justifyContent="space-between" alignItems="center" mb={3}>
        <Typography variant="h5">Email Template Management</Typography>
        <Button
          variant="contained"
          startIcon={<EnvelopeIcon className="h-5 w-5" />}
          onClick={() => {
            setEditingTemplate(null);
            setTemplateForm({
              campaign_type: '',
              campaign_name: '',
              description: '',
              subject_template: '',
              body_template: '',
              from_name: 'Acme Operations',
              from_email: 'support@acmeops.com',
              default_days_after_trigger: 0,
              default_send_time: '09:00:00',
              is_active: true,
              requires_approval: false,
            });
            setDialogOpen(true);
          }}
          sx={{ bgcolor: brandColors.purple, '&:hover': { bgcolor: brandColors.navy } }}
        >
          Add Template
        </Button>
      </Box>

      <Alert severity="info" sx={{ mb: 3 }}>
        <Typography variant="subtitle2" gutterBottom>Template Variables:</Typography>
        <Box component="ul" sx={{ m: 0, pl: 2 }}>
          <li><code>{'{{school_name}}'}</code> - Will be replaced with the school name</li>
          <li><code>{'{{contact_name}}'}</code> - Will be replaced with the contact's name</li>
        </Box>
      </Alert>

      <TableContainer component={Paper} variant="outlined">
        <Table>
          <TableHead>
            <TableRow>
              <TableCell>Campaign Name</TableCell>
              <TableCell>Type</TableCell>
              <TableCell>Description</TableCell>
              <TableCell>Subject Template</TableCell>
              <TableCell align="center">Status</TableCell>
              <TableCell align="center">Actions</TableCell>
            </TableRow>
          </TableHead>
          <TableBody>
            {templates.length === 0 ? (
              <TableRow>
                <TableCell colSpan={6} align="center">
                  <Typography variant="body2" color="textSecondary" sx={{ py: 3 }}>
                    No templates found. Create your first template to get started.
                  </Typography>
                </TableCell>
              </TableRow>
            ) : (
              templates.map((template) => (
                <TableRow key={template.id}>
                  <TableCell>
                    <Typography variant="body2" fontWeight="medium">
                      {template.campaign_name}
                    </Typography>
                  </TableCell>
                  <TableCell>
                    <Chip label={template.campaign_type} size="small" />
                  </TableCell>
                  <TableCell>
                    <Typography variant="body2" color="textSecondary">
                      {template.description || '—'}
                    </Typography>
                  </TableCell>
                  <TableCell>
                    <Typography variant="body2" noWrap sx={{ maxWidth: 300 }}>
                      {template.subject_template || '—'}
                    </Typography>
                  </TableCell>
                  <TableCell align="center">
                    <Chip
                      label={template.is_active ? 'Active' : 'Inactive'}
                      size="small"
                      color={template.is_active ? 'success' : 'default'}
                    />
                  </TableCell>
                  <TableCell align="center">
                    <IconButton
                      size="small"
                      onClick={() => handleEditTemplate(template)}
                      sx={{ color: brandColors.purple }}
                    >
                      <PencilSquareIcon className="h-5 w-5" />
                    </IconButton>
                  </TableCell>
                </TableRow>
              ))
            )}
          </TableBody>
        </Table>
      </TableContainer>

      {/* Edit/Create Template Dialog */}
      <Dialog
        open={dialogOpen}
        onClose={handleCancel}
        maxWidth="lg"
        fullWidth
        PaperProps={{
          sx: { height: '90vh' }
        }}
      >
        <DialogTitle>
          {editingTemplate ? 'Edit Email Template' : 'Create Email Template'}
        </DialogTitle>
        <DialogContent dividers>
          <Grid container spacing={3} sx={{ mt: 1 }}>
            <Grid item xs={12} sm={6}>
              <TextField
                fullWidth
                label="Campaign Type *"
                value={templateForm.campaign_type}
                onChange={(e) => setTemplateForm({ ...templateForm, campaign_type: e.target.value })}
                disabled={!!editingTemplate}
                helperText={editingTemplate ? 'Campaign type cannot be changed' : 'Unique identifier (e.g., demo_day, follow_up)'}
                required
              />
            </Grid>
            <Grid item xs={12} sm={6}>
              <TextField
                fullWidth
                label="Campaign Name *"
                value={templateForm.campaign_name}
                onChange={(e) => setTemplateForm({ ...templateForm, campaign_name: e.target.value })}
                required
              />
            </Grid>
            <Grid item xs={12}>
              <TextField
                fullWidth
                label="Description"
                value={templateForm.description}
                onChange={(e) => setTemplateForm({ ...templateForm, description: e.target.value })}
                multiline
                rows={2}
              />
            </Grid>
            <Grid item xs={12} sm={6}>
              <TextField
                fullWidth
                label="From Name"
                value={templateForm.from_name}
                onChange={(e) => setTemplateForm({ ...templateForm, from_name: e.target.value })}
              />
            </Grid>
            <Grid item xs={12} sm={6}>
              <TextField
                fullWidth
                label="From Email"
                type="email"
                value={templateForm.from_email}
                onChange={(e) => setTemplateForm({ ...templateForm, from_email: e.target.value })}
              />
            </Grid>
            <Grid item xs={12} sm={6}>
              <TextField
                fullWidth
                label="Default Days After Trigger"
                type="number"
                value={templateForm.default_days_after_trigger}
                onChange={(e) => setTemplateForm({ ...templateForm, default_days_after_trigger: parseInt(e.target.value) || 0 })}
              />
            </Grid>
            <Grid item xs={12} sm={6}>
              <TextField
                fullWidth
                label="Default Send Time"
                type="time"
                value={templateForm.default_send_time}
                onChange={(e) => setTemplateForm({ ...templateForm, default_send_time: e.target.value })}
                InputLabelProps={{ shrink: true }}
              />
            </Grid>
            <Grid item xs={12}>
              <TextField
                fullWidth
                label="Subject Template *"
                value={templateForm.subject_template}
                onChange={(e) => setTemplateForm({ ...templateForm, subject_template: e.target.value })}
                placeholder="Use {{school_name}} and {{contact_name}} as placeholders"
                required
              />
            </Grid>
            <Grid item xs={12}>
              <Typography variant="subtitle2" gutterBottom>
                Body Template (HTML) *
              </Typography>
              <ReactQuill
                theme="snow"
                value={templateForm.body_template}
                onChange={(value) => setTemplateForm({ ...templateForm, body_template: value })}
                modules={{
                  toolbar: [
                    [{ 'header': [1, 2, 3, false] }],
                    ['bold', 'italic', 'underline', 'strike'],
                    [{ 'list': 'ordered'}, { 'list': 'bullet' }],
                    [{ 'color': [] }, { 'background': [] }],
                    ['link'],
                    ['clean']
                  ],
                }}
                style={{ height: '400px', marginBottom: '50px' }}
              />
            </Grid>
            <Grid item xs={12} sm={6}>
              <FormControlLabel
                control={
                  <Switch
                    checked={templateForm.is_active}
                    onChange={(e) => setTemplateForm({ ...templateForm, is_active: e.target.checked })}
                  />
                }
                label="Active"
              />
            </Grid>
            <Grid item xs={12} sm={6}>
              <FormControlLabel
                control={
                  <Switch
                    checked={templateForm.requires_approval}
                    onChange={(e) => setTemplateForm({ ...templateForm, requires_approval: e.target.checked })}
                  />
                }
                label="Requires Approval"
              />
            </Grid>
          </Grid>
        </DialogContent>
        <DialogActions>
          <Button onClick={handleCancel} startIcon={<XCircleIcon className="h-5 w-5" />}>
            Cancel
          </Button>
          <Button
            onClick={handleSaveTemplate}
            variant="contained"
            disabled={saving}
            startIcon={saving ? <CircularProgress size={16} /> : <CheckIcon className="h-5 w-5" />}
            sx={{ bgcolor: brandColors.purple, '&:hover': { bgcolor: brandColors.navy } }}
          >
            {saving ? 'Saving...' : 'Save Template'}
          </Button>
        </DialogActions>
      </Dialog>
    </Box>
  );
}

