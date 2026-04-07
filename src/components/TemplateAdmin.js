import React, { useState, useEffect } from "react";
import axios from "axios";
import ConfirmationModal from './ConfirmationModal';
import PromptDialog from './ui/PromptDialog';
import {
  Box,
  Button,
  Paper,
  Typography,
  TextField,
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions,
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TableRow,
  IconButton,
  FormControl,
  InputLabel,
  Select,
  MenuItem,
  Switch,
  FormControlLabel,
  Chip,
  Tabs,
  Tab,
  Grid,
  Accordion,
  AccordionSummary,
  AccordionDetails,
  Alert,
  Snackbar,
  CircularProgress,
} from "@mui/material";
import { PlusIcon, PencilSquareIcon, TrashIcon, DocumentDuplicateIcon, ChevronDownIcon, CheckIcon } from '@heroicons/react/24/outline';

// Helper function to get axios instance (auth via httpOnly cookies)
const getAuthenticatedAxios = () => {
  return axios.create({});
};

function TabPanel({ children, value, index }) {
  return (
    <div hidden={value !== index}>
      {value === index && <Box sx={{ p: 3 }}>{children}</Box>}
    </div>
  );
}

export default function TemplateAdmin() {
  const [templates, setTemplates] = useState([]);
  const [loading, setLoading] = useState(true);
  const [currentTab, setCurrentTab] = useState(0);
  const [editDialogOpen, setEditDialogOpen] = useState(false);
  const [editingTemplate, setEditingTemplate] = useState(null);
  const [snackbar, setSnackbar] = useState({ open: false, message: "", severity: "success" });
  const [confirmState, setConfirmState] = useState({ isOpen: false, action: null, title: '', message: '' });
  const [promptState, setPromptState] = useState({ isOpen: false, title: '', defaultValue: '' });

  // Template form state
  const [formData, setFormData] = useState({
    name: "",
    description: "",
    category: "Home",
    visibleToRoles: ["admin", "staff"],
    brickEnabled: true,
    templateConfig: {
      job_type: "Home",
      colour: "Khaki",
      dft_charge_type: "hourly",
      dft_charge_rate: null,
      dft_contractor_rate: null,
      sr_premium: null,
      dft_max_srs: 10,
      dft_contractor_permissions: "add-edit-complete",
      auto_invoice: false,
      require_rcr: false,
      require_con_job: false,
      status: "pending",
    },
    fieldConfig: {},
    brickLayout: [],
    variableMappings: {},
  });

  useEffect(() => {
    fetchTemplates();
  }, []);

  const fetchTemplates = async () => {
    try {
      setLoading(true);
      const api = getAuthenticatedAxios();
      const response = await api.get("/api/job-templates");
      setTemplates(response.data);
    } catch (error) {
      console.error("Error fetching templates:", error);
      showSnackbar("Failed to load templates", "error");
    } finally {
      setLoading(false);
    }
  };

  const showSnackbar = (message, severity = "success") => {
    setSnackbar({ open: true, message, severity });
  };

  const handleCloseSnackbar = () => {
    setSnackbar({ ...snackbar, open: false });
  };

  const handleOpenCreateDialog = () => {
    setEditingTemplate(null);
    setFormData({
      name: "",
      description: "",
      category: "Home",
      visibleToRoles: ["admin", "staff"],
      brickEnabled: true,
      templateConfig: {
        job_type: "Home",
        colour: "Khaki",
        dft_charge_type: "hourly",
        dft_charge_rate: null,
        dft_contractor_rate: null,
        sr_premium: null,
        dft_max_srs: 10,
        dft_contractor_permissions: "add-edit-complete",
        auto_invoice: false,
        require_rcr: false,
        require_con_job: false,
        status: "pending",
      },
      fieldConfig: {},
      brickLayout: [],
      variableMappings: {},
    });
    setEditDialogOpen(true);
  };

  const handleOpenEditDialog = (template) => {
    setEditingTemplate(template);
    setFormData({
      name: template.name,
      description: template.description || "",
      category: template.category,
      visibleToRoles: template.visible_to_roles || ["admin", "staff"],
      brickEnabled: template.brick_enabled,
      templateConfig: template.template_config || {},
      fieldConfig: template.field_config || {},
      brickLayout: template.brick_layout || [],
      variableMappings: template.variable_mappings || {},
    });
    setEditDialogOpen(true);
  };

  const handleSaveTemplate = async () => {
    try {
      const api = getAuthenticatedAxios();
      
      if (editingTemplate) {
        // Update existing template
        await api.put(`/api/job-templates/${editingTemplate.id}`, formData);
        showSnackbar("Template updated successfully");
      } else {
        // Create new template
        await api.post("/api/job-templates", formData);
        showSnackbar("Template created successfully");
      }
      
      setEditDialogOpen(false);
      fetchTemplates();
    } catch (error) {
      console.error("Error saving template:", error);
      showSnackbar("Failed to save template", "error");
    }
  };

  const handleDeleteTemplate = (templateId) => {
    setConfirmState({
      isOpen: true,
      title: 'Archive Template',
      message: 'Are you sure you want to archive this template?',
      action: async () => {
        try {
          const api = getAuthenticatedAxios();
          await api.delete(`/api/job-templates/${templateId}`);
          showSnackbar("Template archived successfully");
          fetchTemplates();
        } catch (error) {
          console.error("Error deleting template:", error);
          showSnackbar("Failed to archive template", "error");
        }
      },
    });
  };

  const handleDuplicateTemplate = (templateId) => {
    setPromptState({
      isOpen: true,
      title: 'Duplicate Template',
      message: 'Enter a name for the duplicated template:',
      defaultValue: '',
      placeholder: 'Template name...',
      onSubmit: async (newName) => {
        if (!newName) return;
        try {
          const api = getAuthenticatedAxios();
          await api.post(`/api/job-templates/${templateId}/duplicate`, { newName });
          showSnackbar("Template duplicated successfully");
          fetchTemplates();
        } catch (error) {
          console.error("Error duplicating template:", error);
          showSnackbar("Failed to duplicate template", "error");
        }
      },
    });
  };

  const handleFormChange = (field, value) => {
    setFormData((prev) => ({
      ...prev,
      [field]: value,
    }));
  };

  const handleTemplateConfigChange = (field, value) => {
    setFormData((prev) => ({
      ...prev,
      templateConfig: {
        ...prev.templateConfig,
        [field]: value,
      },
    }));
  };

  const renderTemplateList = () => (
    <TableContainer component={Paper}>
      <Table>
        <TableHead>
          <TableRow>
            <TableCell>Name</TableCell>
            <TableCell>Category</TableCell>
            <TableCell>Version</TableCell>
            <TableCell>Brick Enabled</TableCell>
            <TableCell>Actions</TableCell>
          </TableRow>
        </TableHead>
        <TableBody>
          {templates.map((template) => (
            <TableRow key={template.id}>
              <TableCell>{template.name}</TableCell>
              <TableCell>
                <Chip label={template.category} size="small" />
              </TableCell>
              <TableCell>v{template.version}</TableCell>
              <TableCell>
                {template.brick_enabled ? (
                  <Chip label="Yes" color="primary" size="small" />
                ) : (
                  <Chip label="No" size="small" />
                )}
              </TableCell>
              <TableCell>
                <IconButton size="small" onClick={() => handleOpenEditDialog(template)}>
                  <PencilSquareIcon className="h-5 w-5" />
                </IconButton>
                <IconButton size="small" onClick={() => handleDuplicateTemplate(template.id)}>
                  <DocumentDuplicateIcon className="h-5 w-5" />
                </IconButton>
                <IconButton size="small" onClick={() => handleDeleteTemplate(template.id)}>
                  <TrashIcon className="h-5 w-5" />
                </IconButton>
              </TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </TableContainer>
  );

  const renderBasicSettingsTab = () => (
    <Grid container spacing={2}>
      <Grid item xs={12}>
        <TextField
          fullWidth
          label="Template Name"
          value={formData.name}
          onChange={(e) => handleFormChange("name", e.target.value)}
          required
        />
      </Grid>
      <Grid item xs={12}>
        <TextField
          fullWidth
          label="Description"
          value={formData.description}
          onChange={(e) => handleFormChange("description", e.target.value)}
          multiline
          rows={2}
        />
      </Grid>
      <Grid item xs={12} md={6}>
        <FormControl fullWidth>
          <InputLabel>Category</InputLabel>
          <Select
            value={formData.category}
            onChange={(e) => handleFormChange("category", e.target.value)}
          >
            <MenuItem value="Home">Home</MenuItem>
            <MenuItem value="Club">Club</MenuItem>
            <MenuItem value="School">School</MenuItem>
            <MenuItem value="Community">Community</MenuItem>
            <MenuItem value="Online">Online</MenuItem>
          </Select>
        </FormControl>
      </Grid>
      <Grid item xs={12} md={6}>
        <FormControlLabel
          control={
            <Switch
              checked={formData.brickEnabled}
              onChange={(e) => handleFormChange("brickEnabled", e.target.checked)}
            />
          }
          label="Enable Brick Generation"
        />
      </Grid>
    </Grid>
  );

  const renderTutorCruncherFieldsTab = () => (
    <Grid container spacing={2}>
      <Grid item xs={12} md={6}>
        <FormControl fullWidth>
          <InputLabel>Calendar Color</InputLabel>
          <Select
            value={formData.templateConfig.colour || "Khaki"}
            onChange={(e) => handleTemplateConfigChange("colour", e.target.value)}
          >
            <MenuItem value="Khaki">Khaki</MenuItem>
            <MenuItem value="Red">Red</MenuItem>
            <MenuItem value="Blue">Blue</MenuItem>
            <MenuItem value="Green">Green</MenuItem>
            <MenuItem value="Yellow">Yellow</MenuItem>
            <MenuItem value="Orange">Orange</MenuItem>
            <MenuItem value="Purple">Purple</MenuItem>
            <MenuItem value="Pink">Pink</MenuItem>
            <MenuItem value="Teal">Teal</MenuItem>
            <MenuItem value="Brown">Brown</MenuItem>
            <MenuItem value="Gray">Gray</MenuItem>
          </Select>
        </FormControl>
      </Grid>
      <Grid item xs={12} md={6}>
        <FormControl fullWidth>
          <InputLabel>Charge Type</InputLabel>
          <Select
            value={formData.templateConfig.dft_charge_type || "hourly"}
            onChange={(e) => handleTemplateConfigChange("dft_charge_type", e.target.value)}
          >
            <MenuItem value="hourly">Hourly</MenuItem>
            <MenuItem value="flat">Flat</MenuItem>
          </Select>
        </FormControl>
      </Grid>
      <Grid item xs={12} md={4}>
        <TextField
          fullWidth
          type="number"
          label="Default Charge Rate"
          value={formData.templateConfig.dft_charge_rate || ""}
          onChange={(e) => handleTemplateConfigChange("dft_charge_rate", parseFloat(e.target.value) || null)}
        />
      </Grid>
      <Grid item xs={12} md={4}>
        <TextField
          fullWidth
          type="number"
          label="Default Tutor Rate"
          value={formData.templateConfig.dft_contractor_rate || ""}
          onChange={(e) => handleTemplateConfigChange("dft_contractor_rate", parseFloat(e.target.value) || null)}
        />
      </Grid>
      <Grid item xs={12} md={4}>
        <TextField
          fullWidth
          type="number"
          label="Student Premium"
          value={formData.templateConfig.sr_premium || ""}
          onChange={(e) => handleTemplateConfigChange("sr_premium", parseFloat(e.target.value) || null)}
        />
      </Grid>
      <Grid item xs={12} md={6}>
        <TextField
          fullWidth
          type="number"
          label="Max Students"
          value={formData.templateConfig.dft_max_srs || ""}
          onChange={(e) => handleTemplateConfigChange("dft_max_srs", parseInt(e.target.value) || null)}
        />
      </Grid>
      <Grid item xs={12} md={6}>
        <FormControl fullWidth>
          <InputLabel>Default Tutor Permissions</InputLabel>
          <Select
            value={formData.templateConfig.dft_contractor_permissions || "add-edit-complete"}
            onChange={(e) => handleTemplateConfigChange("dft_contractor_permissions", e.target.value)}
          >
            <MenuItem value="add-edit-complete">Add, Edit, Complete</MenuItem>
            <MenuItem value="view-only">View Only</MenuItem>
            <MenuItem value="edit-complete">Edit & Complete</MenuItem>
          </Select>
        </FormControl>
      </Grid>
      <Grid item xs={12}>
        <FormControlLabel
          control={
            <Switch
              checked={formData.templateConfig.auto_invoice || false}
              onChange={(e) => handleTemplateConfigChange("auto_invoice", e.target.checked)}
            />
          }
          label="Auto Invoice"
        />
      </Grid>
    </Grid>
  );

  const renderBrickBuilderTab = () => (
    <Box>
      <Alert severity="info" sx={{ mb: 2 }}>
        Brick Builder configuration coming soon. This will allow you to design the layout
        and variables that appear in the job description field.
      </Alert>
      <Typography variant="body2" color="textSecondary">
        For now, the Brick will auto-generate based on the job category and form data.
      </Typography>
    </Box>
  );

  return (
    <Box sx={{ p: 3 }}>
      <Box sx={{ display: "flex", justifyContent: "space-between", alignItems: "center", mb: 3 }}>
        <Typography variant="h4">Template Admin</Typography>
        <Button
          variant="contained"
          color="primary"
          startIcon={<PlusIcon className="h-5 w-5" />}
          onClick={handleOpenCreateDialog}
        >
          Create Template
        </Button>
      </Box>

      {loading ? (
        <Box sx={{ display: "flex", justifyContent: "center", p: 4 }}>
          <CircularProgress />
        </Box>
      ) : (
        renderTemplateList()
      )}

      {/* Edit/Create Dialog */}
      <Dialog open={editDialogOpen} onClose={() => setEditDialogOpen(false)} maxWidth="md" fullWidth>
        <DialogTitle>
          {editingTemplate ? "Edit Template" : "Create New Template"}
        </DialogTitle>
        <DialogContent>
          <Box sx={{ borderBottom: 1, borderColor: "divider", mb: 2 }}>
            <Tabs value={currentTab} onChange={(e, v) => setCurrentTab(v)}>
              <Tab label="Basic Settings" />
              <Tab label="TutorCruncher Fields" />
              <Tab label="Brick Builder" />
            </Tabs>
          </Box>

          <TabPanel value={currentTab} index={0}>
            {renderBasicSettingsTab()}
          </TabPanel>

          <TabPanel value={currentTab} index={1}>
            {renderTutorCruncherFieldsTab()}
          </TabPanel>

          <TabPanel value={currentTab} index={2}>
            {renderBrickBuilderTab()}
          </TabPanel>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setEditDialogOpen(false)}>Cancel</Button>
          <Button
            onClick={handleSaveTemplate}
            variant="contained"
            color="primary"
            startIcon={<CheckIcon className="h-5 w-5" />}
          >
            {editingTemplate ? "Update" : "Create"}
          </Button>
        </DialogActions>
      </Dialog>

      {/* Snackbar for notifications */}
      <Snackbar
        open={snackbar.open}
        autoHideDuration={6000}
        onClose={handleCloseSnackbar}
        anchorOrigin={{ vertical: "bottom", horizontal: "right" }}
      >
        <Alert onClose={handleCloseSnackbar} severity={snackbar.severity}>
          {snackbar.message}
        </Alert>
      </Snackbar>
      <ConfirmationModal
        isOpen={confirmState.isOpen}
        onClose={() => setConfirmState(s => ({ ...s, isOpen: false }))}
        onConfirm={() => { confirmState.action?.(); setConfirmState(s => ({ ...s, isOpen: false })); }}
        title={confirmState.title}
        message={confirmState.message}
      />
      <PromptDialog
        isOpen={promptState.isOpen}
        onClose={() => setPromptState(s => ({ ...s, isOpen: false }))}
        onSubmit={(val) => promptState.onSubmit?.(val)}
        title={promptState.title}
        message={promptState.message}
        placeholder={promptState.placeholder}
        defaultValue={promptState.defaultValue || ''}
      />
    </Box>
  );
}

