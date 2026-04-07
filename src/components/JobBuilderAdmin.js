import React, { useState, useEffect, useRef } from "react";
import axios from "axios";
import { useNavigate } from "react-router-dom";
import ConfirmationModal from './ConfirmationModal';
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
  FormHelperText,
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
  Card,
  CardContent,
  CardActions,
  CardMedia,
  Divider,
  Tooltip,
  Badge,
  List,
  ListItem,
  ListItemIcon,
  ListItemText,
  ListItemSecondaryAction,
  Checkbox,
  FormGroup,
  InputAdornment,
  ToggleButton,
  ToggleButtonGroup,
  Stack,
  Autocomplete,
  Slider,
  Rating,
  Avatar,
  Fab,
  Zoom,
  Link,
} from "@mui/material";
import {
  PlusIcon as AddIcon,
  PencilIcon as EditIcon,
  TrashIcon as DeleteIcon,
  DocumentDuplicateIcon as CopyIcon,
  ChevronDownIcon as ExpandMoreIcon,
  CheckIcon as SaveIcon,
  ListBulletIcon as ListViewIcon,
  Squares2X2Icon as GridViewIcon,
  Bars3Icon as DragIcon,
  EyeIcon as PreviewIcon,
  Cog6ToothIcon as SettingsIcon,
  WrenchIcon as BuildIcon,
  HomeIcon,
  AcademicCapIcon as SchoolIcon,
  UserGroupIcon as GroupIcon,
  GlobeAltIcon as PublicIcon,
  ComputerDesktopIcon as ComputerIcon,
  BuildingOfficeIcon as BusinessIcon,
  XMarkIcon as CloseIcon,
  MagnifyingGlassIcon as SearchIcon,
  FunnelIcon as FilterIcon,
  BarsArrowDownIcon as SortIcon,
  EllipsisVerticalIcon as MoreIcon,
  ClipboardDocumentIcon as DuplicateIcon,
  ArchiveBoxIcon as ArchiveIcon,
  ArrowPathIcon as RestoreIcon,
  CloudArrowUpIcon as ImportIcon,
  CloudArrowDownIcon as ExportIcon,
} from "@heroicons/react/24/outline";
import BrickPreview from "./BrickPreview";

// Helper function to get axios instance (auth via httpOnly cookie)
const getAuthenticatedAxios = () => {
  return axios.create();
};

// Field types for drag and drop
const FIELD_TYPES = {
  text: {
    id: "text",
    name: "Single Line Text",
    icon: "A",
    description: "Single line text input",
    category: "basic",
  },
  textarea: {
    id: "textarea",
    name: "Paragraph Text",
    icon: "¶",
    description: "Multi-line text input",
    category: "basic",
  },
  select: {
    id: "select",
    name: "Dropdown",
    icon: "▼",
    description: "Dropdown selection",
    category: "basic",
  },
  number: {
    id: "number",
    name: "Number",
    icon: "123",
    description: "Numeric input",
    category: "basic",
  },
  checkbox: {
    id: "checkbox",
    name: "Checkbox",
    icon: "☑",
    description: "Checkbox input",
    category: "basic",
  },
  radio: {
    id: "radio",
    name: "Radio Buttons",
    icon: "●",
    description: "Radio button selection",
    category: "basic",
  },
  email: {
    id: "email",
    name: "Email",
    icon: "✉",
    description: "Email input with validation",
    category: "advanced",
  },
  phone: {
    id: "phone",
    name: "Phone",
    icon: "📞",
    description: "Phone number input",
    category: "advanced",
  },
  date: {
    id: "date",
    name: "Date",
    icon: "📅",
    description: "Date picker",
    category: "advanced",
  },
  time: {
    id: "time",
    name: "Time",
    icon: "🕐",
    description: "Time picker",
    category: "advanced",
  },
  file: {
    id: "file",
    name: "File Upload",
    icon: "📁",
    description: "File upload field",
    category: "advanced",
  },
  address: {
    id: "address",
    name: "Address",
    icon: "📍",
    description: "Address input",
    category: "advanced",
  },
  website: {
    id: "website",
    name: "Website",
    icon: "🌐",
    description: "Website URL input",
    category: "advanced",
  },
};

// Brick variables for drag and drop
const BRICK_VARIABLES = {
  client_first_name: { label: "Client First Name", category: "client" },
  client_last_name: { label: "Client Last Name", category: "client" },
  client_full_name: { label: "Client Full Name", category: "client" },
  address: { label: "Address", category: "location" },
  subject: { label: "Subject", category: "lesson" },
  booking_type: { label: "Booking Type", category: "lesson" },
  timezone: { label: "Timezone", category: "location" },
  student_name: { label: "Student Name", category: "student" },
  start_date: { label: "Start Date", category: "schedule" },
  lesson_dates: { label: "Lesson Dates", category: "schedule" },
  age_group: { label: "Age Group", category: "student" },
  availability: { label: "Availability", category: "schedule" },
  duration: { label: "Duration", category: "lesson" },
  lesson_type: { label: "Lesson Type", category: "lesson" },
  parent_name: { label: "Parent Name", category: "client" },
  children_info: { label: "Children Info", category: "student" },
  client_notes: { label: "Client Notes", category: "notes" },
  teaching_notes: { label: "Teaching Notes", category: "notes" },
  tutors: { label: "Tutors", category: "lesson" },
  contact: { label: "Contact", category: "school" },
  school_name: { label: "School Name", category: "school" },
  class_name: { label: "Class Name", category: "school" },
  semester: { label: "Semester", category: "school" },
  section: { label: "Section", category: "school" },
  day_of_week: { label: "Day of Week", category: "schedule" },
  time: { label: "Time", category: "schedule" },
  location: { label: "Location", category: "location" },
  number_of_students: { label: "Number of Students", category: "student" },
  custom_field: { label: "Custom Field", category: "custom" },
};

// Pre-made templates
const PREMADE_TEMPLATES = [
  {
    id: "home-trial",
    name: "Home Trial Lesson",
    description: "Template for home trial chess lessons",
    category: "Home",
    icon: <HomeIcon />,
    color: "#4CAF50",
    fields: ["client_name", "student_name", "subject", "address", "is_trial"],
  },
  {
    id: "home-regular",
    name: "Home Regular Lesson",
    description: "Template for regular home chess lessons",
    category: "Home",
    icon: <HomeIcon />,
    color: "#4CAF50",
    fields: ["client_name", "student_name", "subject", "address"],
  },
  {
    id: "club-session",
    name: "Club Session",
    description: "Template for chess club sessions",
    category: "Club",
    icon: <GroupIcon />,
    color: "#2196F3",
    fields: ["class_name", "location", "day_of_week", "time", "subject"],
  },
  {
    id: "school-class",
    name: "School Class",
    description: "Template for school chess classes",
    category: "School",
    icon: <SchoolIcon />,
    color: "#FF9800",
    fields: ["school_name", "subject", "semester", "section"],
  },
  {
    id: "community-program",
    name: "Community Program",
    description: "Template for community chess programs",
    category: "Community",
    icon: <PublicIcon />,
    color: "#9C27B0",
    fields: ["location", "subject", "semester", "section"],
  },
  {
    id: "online-trial",
    name: "Online Trial",
    description: "Template for online trial lessons",
    category: "Online",
    icon: <ComputerIcon />,
    color: "#607D8B",
    fields: ["client_name", "student_name", "subject", "timezone", "is_trial"],
  },
];

const CHARGE_TYPE_OPTIONS = [
  { value: "hourly", label: "Per hour, for each student" },
  { value: "one-off", label: "Per lesson, for each student" },
  { value: "hourly-split", label: "Per hour, split between students" },
  { value: "one-off-split", label: "Per lesson, split between students" },
];

const ALLOWED_CHARGE_TYPES = new Set(CHARGE_TYPE_OPTIONS.map((option) => option.value));

const TUTOR_PERMISSION_OPTIONS = [
  { value: "complete", label: "Tutor can only mark Lessons Complete or Cancelled" },
  { value: "edit", label: "Tutor can edit Lessons" },
  { value: "add-edit", label: "Tutor can add and edit Lessons" },
  { value: "add-edit-complete", label: "Tutor can add and edit Lessons, and change the Job status to finished" },
];

const ALLOWED_TUTOR_PERMISSIONS = new Set(TUTOR_PERMISSION_OPTIONS.map((option) => option.value));

const sanitizeChargeType = (value) => (ALLOWED_CHARGE_TYPES.has(value) ? value : "hourly");

const sanitizeTutorPermission = (value) =>
  ALLOWED_TUTOR_PERMISSIONS.has(value) ? value : "add-edit-complete";

const sanitizeTemplateConfig = (config = {}) => {
  // Normalize status values: convert "in_progress" to "in-progress" for Select component
  let normalizedStatus = config.status;
  if (normalizedStatus === "in_progress") {
    normalizedStatus = "in-progress";
  }
  
  return {
    ...config,
    status: normalizedStatus,
    dft_charge_type: sanitizeChargeType(config.dft_charge_type),
    dft_contractor_permissions: sanitizeTutorPermission(config.dft_contractor_permissions),
  };
};

function TabPanel({ children, value, index }) {
  return (
    <div hidden={value !== index}>
      {value === index && <Box sx={{ p: 3 }}>{children}</Box>}
    </div>
  );
}

export default function JobBuilderAdmin() {
  const navigate = useNavigate();
  const [templates, setTemplates] = useState([]);
  const [archivedTemplates, setArchivedTemplates] = useState([]);
  const [loading, setLoading] = useState(true);
  const [loadingArchived, setLoadingArchived] = useState(false);
  const [showArchived, setShowArchived] = useState(false); // Toggle between active and archived
  const [authErrorShown, setAuthErrorShown] = useState(false);
  const authErrorShownRef = useRef(false); // Ref for synchronous access
  const [currentTab, setCurrentTab] = useState(0);
  const [viewMode, setViewMode] = useState("grid"); // grid or list
  const [searchTerm, setSearchTerm] = useState("");
  const [filterCategory, setFilterCategory] = useState("all");
  const [sortBy, setSortBy] = useState("name");
  const [confirmState, setConfirmState] = useState({ isOpen: false, action: null, title: '', message: '', isDestructive: false });

  // Template creation/editing state
  const [createDialogOpen, setCreateDialogOpen] = useState(false);
  const [editingTemplate, setEditingTemplate] = useState(null);
  const [templateFormData, setTemplateFormData] = useState({
    name: "",
    description: "",
    category: "Home",
    visibleToRoles: ["admin", "staff"],
    brickEnabled: true,
      templateConfig: {
        job_name_template: "",
        job_type: "Home",
        subject: "Chess",
        lesson_type: "",
        lesson_dates: "Weekly Ongoing",
        colour: "",
        dft_charge_type: "hourly",
        dft_charge_rate: null,
        dft_contractor_rate: null,
        sr_premium: null,
        dft_max_srs: 10,
        duration: "45 - 60 minutes",
        dft_contractor_permissions: "add-edit-complete",
        auto_invoice: true,
        require_rcr: true,
        require_con_job: true,
        status: "in_progress",
        // Additional TutorCruncher Service fields
        allow_proposed_rates: false,
        branch: null,
        branch_tax_setup: "Default Company Tax (20%)",
        cap: null,
        contractor_tax_setup: "Default Tutor Tax (no tax)",
        dft_location: null,
        extra_attrs: [],
        extra_fee_per_apt: null,
        inactivity_time: 60,
        is_bookable: false,
        labels: [],
        net_gross: "gross",
        review_units: 5,
        sales_codes: null,
      },
    fieldConfig: {},
    brickLayout: [],
    formattingOptions: {},
    variableMappings: {},
  });
  
  // Field builder state
  const [draggedField, setDraggedField] = useState(null);
  const [draggedBrickVar, setDraggedBrickVar] = useState(null);
  const [formFields, setFormFields] = useState([]);
  const [brickElements, setBrickElements] = useState([]);
  const [previewData, setPreviewData] = useState({});
  
  // Brick element reordering state
  const [draggedElement, setDraggedElement] = useState(null);
  const [dragOverIndex, setDragOverIndex] = useState(null);
  
  // Snackbar
  const [snackbar, setSnackbar] = useState({ open: false, message: "", severity: "success" });
  
  // Labels state for TutorCruncher labels
  const [labels, setLabels] = useState([]);
  // Colours state for TutorCruncher calendar colours
  const [colours, setColours] = useState([]);
  // State to control Labels Select dropdown open/close
  const [labelsSelectOpen, setLabelsSelectOpen] = useState(false);
  const [duplicateDialogOpen, setDuplicateDialogOpen] = useState(false);
  const [duplicateTemplateId, setDuplicateTemplateId] = useState(null);
  const [duplicateTemplateName, setDuplicateTemplateName] = useState('');

  const categories = ["all", "Home", "Club", "School", "Community", "Online"];

  useEffect(() => {
    fetchTemplates();
    fetchLabels();
    fetchColours();
  }, []);

  const fetchLabels = async () => {
    try {
      const api = getAuthenticatedAxios();
      const response = await api.get("/api/tutorcruncher-data/labels");
      setLabels(response.data.labels || []);
    } catch (error) {
      console.error("Error fetching labels:", error);
    }
  };

  const fetchColours = async () => {
    try {
      const api = getAuthenticatedAxios();
      const response = await api.get("/api/tutorcruncher-data/colours");
      setColours(response.data.colours || []);
    } catch (error) {
      console.error("Error fetching colours:", error);
    }
  };

  useEffect(() => {
    if (showArchived && !authErrorShown && !authErrorShownRef.current) {
      fetchArchivedTemplates();
    }
  }, [showArchived, authErrorShown]);

  const fetchTemplates = async () => {
    try {
      setLoading(true);
      const api = getAuthenticatedAxios();
      const response = await api.get("/api/job-templates");
      console.log("Fetched templates:", response.data.length, "templates");
      console.log("Template names:", response.data.map(t => t.name));
      console.log("Template details:", response.data.map(t => ({
        id: t.id,
        name: t.name,
        category: t.category,
        is_active: t.is_active,
        is_archived: t.is_archived,
        environment: t.environment,
        visible_to_roles: t.visible_to_roles
      })));
      setTemplates(response.data);
    } catch (error) {
      console.error("Error fetching templates:", error);
      console.error("Error response:", error.response?.data);
      showSnackbar("Failed to load templates", "error");
    } finally {
      setLoading(false);
    }
  };

  const fetchArchivedTemplates = async () => {
    // Prevent API calls if we've already encountered an auth error
    if (authErrorShown || authErrorShownRef.current) {
      setArchivedTemplates([]);
      return;
    }


    try {
      setLoadingArchived(true);
      const api = getAuthenticatedAxios();
      const response = await api.get("/api/job-templates/archived");
      setArchivedTemplates(response.data);
      // Reset auth error flag on successful call
      setAuthErrorShown(false);
      authErrorShownRef.current = false;
    } catch (error) {
      const errorMessage = error.response?.data?.error || error.message || "Unknown error";
      const errorDetails = error.response?.data || {};
      const status = error.response?.status;
      
      // Handle authentication errors
      if (status === 401) {
        if (!authErrorShown && !authErrorShownRef.current) {
          console.error("Authentication failed - token may be expired or invalid");
          console.error("Error details:", JSON.stringify(errorDetails, null, 2));
          showSnackbar(
            "Authentication required. Please refresh the page and log in again.",
            "error"
          );
          setAuthErrorShown(true);
          authErrorShownRef.current = true;
        }
        setArchivedTemplates([]);
        return;
      }
      
      // Handle permission errors gracefully
      if (status === 403) {
        console.warn("Admin access required to view archived templates");
        showSnackbar("Admin access required to view archived templates", "warning");
        setArchivedTemplates([]);
        return;
      }
      
      // Log other errors with full details
      console.error("Error fetching archived templates:");
      console.error("Message:", errorMessage);
      console.error("Status:", status);
      console.error("Response data:", JSON.stringify(errorDetails, null, 2));
      console.error("Full error:", error);
      
      showSnackbar(`Failed to load archived templates: ${errorMessage}`, "error");
      
      // Set empty array on error so UI doesn't break
      setArchivedTemplates([]);
    } finally {
      setLoadingArchived(false);
    }
  };

  const showSnackbar = (message, severity = "success") => {
    setSnackbar({ open: true, message, severity });
  };

  const handleCloseSnackbar = () => {
    setSnackbar({ ...snackbar, open: false });
  };

  const handleCreateFromTemplate = (template) => {
    setEditingTemplate(null);
    const config = template.template_config || {};
    setTemplateFormData({
      name: `${template.name} (Copy)`,
      description: template.description,
      category: template.category,
      visibleToRoles: template.visible_to_roles || ["admin", "staff"],
      brickEnabled: template.brick_enabled !== false,
      templateConfig: {
        job_name_template: config.job_name_template || "",
        job_type: config.job_type || template.category,
        subject: config.subject || "Chess",
        lesson_type: config.lesson_type || "",
        lesson_dates: config.lesson_dates || "Weekly Ongoing",
        duration: config.duration || "45 - 60 minutes",
        colour: config.colour || "Khaki",
        dft_charge_type: config.dft_charge_type || "hourly",
        dft_charge_rate: config.dft_charge_rate ?? null,
        dft_contractor_rate: config.dft_contractor_rate ?? null,
        sr_premium: config.sr_premium ?? null,
        dft_max_srs: config.dft_max_srs ?? 10,
        dft_contractor_permissions: config.dft_contractor_permissions || "add-edit-complete",
        auto_invoice: config.auto_invoice ?? false,
        require_rcr: config.require_rcr ?? true,
        require_con_job: config.require_con_job ?? true,
        status: config.status || "in_progress",
        // Additional TutorCruncher Service fields
        allow_proposed_rates: config.allow_proposed_rates ?? false,
        branch: config.branch ?? null,
        branch_tax_setup: config.branch_tax_setup || "Default Company Tax (20%)",
        cap: config.cap ?? null,
        contractor_tax_setup: config.contractor_tax_setup || "Default Tutor Tax (no tax)",
        dft_location: config.dft_location ?? null,
        extra_attrs: config.extra_attrs || [],
        extra_fee_per_apt: config.extra_fee_per_apt ?? null,
        inactivity_time: config.inactivity_time ?? 60,
        is_bookable: config.is_bookable ?? false,
        labels: config.labels || [],
        net_gross: config.net_gross || "gross",
        review_units: config.review_units ?? 5,
        sales_codes: config.sales_codes ?? null,
      },
      fieldConfig: template.field_config || {},
      brickLayout: template.brick_layout || [],
      variableMappings: template.variable_mappings || {},
    });
    // Initialize brick elements from template layout
    setBrickElements(template.brick_layout || []);
    // Initialize form fields from template field config
    setFormFields(Object.values(template.field_config || {}));
    setCurrentTab(1); // Switch to field builder tab
    setCreateDialogOpen(true);
  };

  const handleCreateBlank = () => {
    setEditingTemplate(null);
    setTemplateFormData({
      name: "",
      description: "",
      category: "Home",
      visibleToRoles: ["admin", "staff"],
      brickEnabled: true,
      templateConfig: {
        job_name_template: "",
        job_type: "Home",
        subject: "Chess",
        lesson_type: "",
        lesson_dates: "Weekly Ongoing",
        duration: "45 - 60 minutes",
        colour: "",
        dft_charge_type: "hourly",
        dft_charge_rate: null,
        dft_contractor_rate: null,
        sr_premium: null,
        dft_max_srs: 10,
        dft_contractor_permissions: "add-edit-complete",
        auto_invoice: true,
        require_rcr: true,
        require_con_job: true,
        status: "in_progress",
        // Additional TutorCruncher Service fields
        allow_proposed_rates: false,
        branch: null,
        branch_tax_setup: "Default Company Tax (20%)",
        cap: null,
        contractor_tax_setup: "Default Tutor Tax (no tax)",
        dft_location: null,
        extra_attrs: [],
        extra_fee_per_apt: null,
        inactivity_time: 60,
        is_bookable: false,
        labels: [],
        net_gross: "gross",
        review_units: 5,
        sales_codes: null,
      },
      fieldConfig: {},
      brickLayout: [],
      formattingOptions: {},
      variableMappings: {},
    });
    // Reset brick elements and form fields for new template
    setBrickElements([]);
    setFormFields([]);
    setCurrentTab(0); // Start on Basic Settings tab
    setCreateDialogOpen(true);
  };

  const handleEditTemplate = (template) => {
    setEditingTemplate(template);
    setTemplateFormData({
      name: template.name,
      description: template.description || "",
      category: template.category,
      visibleToRoles: template.visible_to_roles || ["admin", "staff"],
      brickEnabled: template.brick_enabled,
      templateConfig: sanitizeTemplateConfig(template.template_config || {}),
      fieldConfig: template.field_config || {},
      brickLayout: template.brick_layout || [],
      variableMappings: template.variable_mappings || {},
    });
    // Initialize brick elements from saved layout so they appear in the brick builder
    setBrickElements(template.brick_layout || []);
    // Initialize form fields from saved field config
    setFormFields(Object.values(template.field_config || {}));
    setCreateDialogOpen(true);
  };

  const handleSaveTemplate = async () => {
    try {
      const api = getAuthenticatedAxios();
      
      // Prepare data for saving - convert "in-progress" back to "in_progress" for database
      const dataToSave = {
        ...templateFormData,
        templateConfig: {
          ...templateFormData.templateConfig,
          status: templateFormData.templateConfig.status === "in-progress" 
            ? "in_progress" 
            : templateFormData.templateConfig.status,
        },
      };
      
      console.log("Saving template with data:", {
        name: dataToSave.name,
        category: dataToSave.category,
        hasTemplateConfig: !!dataToSave.templateConfig,
        templateConfigKeys: dataToSave.templateConfig ? Object.keys(dataToSave.templateConfig) : [],
        brickEnabled: dataToSave.brickEnabled,
        hasBrickLayout: !!dataToSave.brickLayout,
      });
      console.log("Full dataToSave:", JSON.stringify(dataToSave, null, 2));
      
      if (editingTemplate) {
        await api.put(`/api/job-templates/${editingTemplate.id}`, dataToSave);
        showSnackbar("Template updated successfully");
      } else {
        const response = await api.post("/api/job-templates", dataToSave);
        console.log("Template created:", response.data);
        showSnackbar("Template created successfully");
      }
      
      setCreateDialogOpen(false);
      // Reset form data
      setEditingTemplate(null);
      setTemplateFormData({
        name: "",
        description: "",
        category: "Home",
        visibleToRoles: ["admin", "staff"],
        brickEnabled: true,
        templateConfig: {
          job_name_template: "",
          job_type: "Home",
          subject: "Chess",
          lesson_type: "",
          lesson_dates: "Weekly Ongoing",
          colour: "",
          dft_charge_type: "hourly",
          dft_charge_rate: null,
          dft_contractor_rate: null,
          sr_premium: null,
          dft_max_srs: 10,
          duration: "45 - 60 minutes",
          dft_contractor_permissions: "add-edit-complete",
          auto_invoice: true,
          require_rcr: true,
          require_con_job: true,
          status: "in_progress",
          allow_proposed_rates: false,
          branch: null,
          branch_tax_setup: "Default Company Tax (20%)",
          cap: null,
          contractor_tax_setup: "Default Tutor Tax (no tax)",
          dft_location: null,
          extra_attrs: [],
          extra_fee_per_apt: null,
          inactivity_time: 60,
          is_bookable: false,
          labels: [],
          net_gross: "gross",
          review_units: 5,
          sales_codes: null
        },
        fieldConfig: {},
        brickLayout: [],
        formattingOptions: {},
        variableMappings: {},
      });
      
      // Fetch templates after creation - use a longer delay to ensure transaction commits
      // Also force a refresh by clearing and re-fetching
      setTimeout(async () => {
        console.log("Refreshing templates after creation...");
        await fetchTemplates();
        // Also check if we need to wait a bit more
        setTimeout(() => {
          console.log("Second refresh attempt...");
          fetchTemplates();
        }, 500);
      }, 500);
    } catch (error) {
      console.error("Error saving template:", error);
      console.error("Error response:", error.response?.data);
      console.error("Error status:", error.response?.status);
      const errorMessage = error.response?.data?.error || error.response?.data?.detail || error.message || "Failed to save template";
      console.error("Error message:", errorMessage);
      showSnackbar(errorMessage, "error");
    }
  };

  const handleDeleteTemplate = async (templateId) => {
    setConfirmState({
      isOpen: true,
      title: 'Archive Template',
      message: 'Are you sure you want to archive this template?',
      isDestructive: false,
      action: async () => {
        try {
          const api = getAuthenticatedAxios();
          await api.delete(`/api/job-templates/${templateId}`);
          showSnackbar("Template archived successfully");
          fetchTemplates();
          if (showArchived) {
            fetchArchivedTemplates();
          }
        } catch (error) {
          console.error("Error deleting template:", error);
          showSnackbar("Failed to archive template", "error");
        }
      },
    });
  };

  const handleRestoreTemplate = async (templateId) => {
    setConfirmState({
      isOpen: true,
      title: 'Restore Template',
      message: 'Are you sure you want to restore this template?',
      isDestructive: false,
      action: async () => {
        try {
          const api = getAuthenticatedAxios();
          await api.post(`/api/job-templates/${templateId}/unarchive`);
          showSnackbar("Template restored successfully");
          fetchArchivedTemplates();
          if (!showArchived) {
            fetchTemplates();
          }
        } catch (error) {
          console.error("Error restoring template:", error);
          showSnackbar("Failed to restore template", "error");
        }
      },
    });
  };

  const handleDuplicateTemplate = async (templateId) => {
    setDuplicateTemplateId(templateId);
    setDuplicateTemplateName('');
    setDuplicateDialogOpen(true);
  };

  const handleDuplicateConfirm = async () => {
    if (!duplicateTemplateName.trim()) {
      showSnackbar("Please enter a template name", "error");
      return;
    }

    try {
      const api = getAuthenticatedAxios();
      await api.post(`/api/job-templates/${duplicateTemplateId}/duplicate`, { 
        newName: duplicateTemplateName.trim() 
      });
      showSnackbar("Template duplicated successfully");
      fetchTemplates();
      setDuplicateDialogOpen(false);
      setDuplicateTemplateName('');
      setDuplicateTemplateId(null);
    } catch (error) {
      console.error("Error duplicating template:", error);
      showSnackbar("Failed to duplicate template", "error");
    }
  };

  const handleFormChange = (field, value) => {
    setTemplateFormData((prev) => ({
      ...prev,
      [field]: value,
    }));
  };

  const handleTemplateConfigChange = (field, value) => {
    const nextValue = field === "dft_charge_type" ? sanitizeChargeType(value) : value;
    setTemplateFormData((prev) => ({
      ...prev,
      templateConfig: {
        ...prev.templateConfig,
        [field]: nextValue,
      },
    }));
  };

  // Filter and sort templates
  const templatesToDisplay = showArchived ? archivedTemplates : templates;
  const filteredTemplates = templatesToDisplay
    .filter((template) => {
      const matchesSearch = template.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
                           template.description?.toLowerCase().includes(searchTerm.toLowerCase());
      const matchesCategory = filterCategory === "all" || template.category === filterCategory;
      return matchesSearch && matchesCategory;
    })
    .sort((a, b) => {
      switch (sortBy) {
        case "name":
          return a.name.localeCompare(b.name);
        case "category":
          return a.category.localeCompare(b.category);
        case "created":
          return new Date(b.created_at) - new Date(a.created_at);
        default:
          return 0;
      }
    });

  const renderTemplateGallery = () => (
    <Box>
      {/* Header with search and filters */}
      <Box sx={{ display: "flex", justifyContent: "space-between", alignItems: "center", mb: 3 }}>
        <Box sx={{ display: "flex", alignItems: "center", gap: 2 }}>
          <Button
            variant="outlined"
            onClick={() => navigate('/job-builder')}
          >
            Back to Job Builder
          </Button>
          <ToggleButtonGroup
            value={showArchived ? "archived" : "active"}
            exclusive
            onChange={(e, newValue) => {
              if (newValue !== null) {
                setShowArchived(newValue === "archived");
              }
            }}
            size="small"
          >
            <ToggleButton value="active">
              Active Templates
            </ToggleButton>
            <ToggleButton value="archived">
              <Badge badgeContent={archivedTemplates.length > 0 ? archivedTemplates.length : 0} color="secondary" showZero={false}>
                <Box component="span">Archived</Box>
              </Badge>
            </ToggleButton>
          </ToggleButtonGroup>
        </Box>
        {!showArchived && (
          <Button
            variant="contained"
            color="primary"
            startIcon={<AddIcon />}
            onClick={handleCreateBlank}
            sx={{ ml: 2 }}
          >
            Create Template
          </Button>
        )}
      </Box>

      {/* Search and filter bar */}
      <Paper sx={{ p: 2, mb: 3 }}>
        <Grid container spacing={2} alignItems="center">
          <Grid item xs={12} md={4}>
            <TextField
              fullWidth
              placeholder="Search templates..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              InputProps={{
                startAdornment: (
                  <InputAdornment position="start">
                    <SearchIcon />
                  </InputAdornment>
                ),
              }}
            />
          </Grid>
          <Grid item xs={12} md={3}>
            <FormControl fullWidth>
              <InputLabel>Category</InputLabel>
              <Select
                value={filterCategory}
                onChange={(e) => setFilterCategory(e.target.value)}
              >
                {categories.map((category) => (
                  <MenuItem key={category} value={category}>
                    {category === "all" ? "All Categories" : category}
                  </MenuItem>
                ))}
              </Select>
            </FormControl>
          </Grid>
          <Grid item xs={12} md={3}>
            <FormControl fullWidth>
              <InputLabel>Sort By</InputLabel>
              <Select
                value={sortBy}
                onChange={(e) => setSortBy(e.target.value)}
              >
                <MenuItem value="name">Name</MenuItem>
                <MenuItem value="category">Category</MenuItem>
                <MenuItem value="created">Date Created</MenuItem>
              </Select>
            </FormControl>
          </Grid>
          <Grid item xs={12} md={2}>
            <ToggleButtonGroup
              value={viewMode}
              exclusive
              onChange={(e, newMode) => newMode && setViewMode(newMode)}
              fullWidth
            >
              <ToggleButton value="grid">
                <GridViewIcon />
              </ToggleButton>
              <ToggleButton value="list">
                <ListViewIcon />
              </ToggleButton>
            </ToggleButtonGroup>
          </Grid>
        </Grid>
      </Paper>

      {/* Pre-made templates section */}
      <Box sx={{ mb: 4 }}>
        <Typography variant="h6" gutterBottom>
          Pre-made Templates
        </Typography>
        <Typography variant="body2" color="textSecondary" sx={{ mb: 2 }}>
          Start with a pre-designed template and customize it for your needs
        </Typography>
        
        <Grid container spacing={2}>
          {PREMADE_TEMPLATES.map((template) => (
            <Grid item xs={12} sm={6} md={4} lg={3} key={template.id}>
              <Card
                sx={{
                  height: "100%",
                  cursor: "pointer",
                  transition: "all 0.2s ease-in-out",
                  "&:hover": {
                    transform: "translateY(-4px)",
                    boxShadow: 4,
                  },
                }}
                onClick={() => handleCreateFromTemplate(template)}
              >
                <CardContent sx={{ textAlign: "center", pb: 1 }}>
                  <Avatar
                    sx={{
                      width: 48,
                      height: 48,
                      mx: "auto",
                      mb: 2,
                      bgcolor: template.color,
                    }}
                  >
                    {template.icon}
                  </Avatar>
                  <Typography variant="h6" gutterBottom>
                    {template.name}
                  </Typography>
                  <Typography variant="body2" color="textSecondary" sx={{ mb: 2 }}>
                    {template.description}
                  </Typography>
                  <Chip label={template.category} size="small" />
                </CardContent>
              </Card>
            </Grid>
          ))}
        </Grid>
      </Box>

      <Divider sx={{ my: 3 }} />

      {/* Existing templates section */}
      <Box>
        <Typography variant="h6" gutterBottom>
          {showArchived ? "Archived Templates" : "Your Templates"} ({filteredTemplates.length})
        </Typography>
        
        {(loading || (showArchived && loadingArchived)) ? (
          <Box sx={{ display: "flex", justifyContent: "center", p: 4 }}>
            <CircularProgress />
          </Box>
        ) : viewMode === "grid" ? (
          <Grid container spacing={2}>
            {filteredTemplates.map((template) => (
              <Grid item xs={12} sm={6} md={4} lg={3} key={template.id}>
                <Card
                  sx={{
                    height: "100%",
                    position: "relative",
                    opacity: showArchived ? 0.8 : 1,
                    border: showArchived ? "1px dashed" : "none",
                    borderColor: showArchived ? "text.secondary" : "transparent",
                  }}
                >
                  <CardContent>
                    <Box sx={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", mb: 2 }}>
                      <Chip label={template.category} size="small" />
                      {showArchived && (
                        <Chip label="Archived" size="small" color="default" variant="outlined" />
                      )}
                    </Box>
                    
                    <Typography variant="h6" gutterBottom>
                      {template.name}
                    </Typography>
                    
                    <Typography variant="body2" color="textSecondary" sx={{ mb: 2 }}>
                      {template.description}
                    </Typography>
                    
                    <Box sx={{ display: "flex", gap: 1, mb: 2 }}>
                      {template.brick_enabled && (
                        <Chip label="Brick Enabled" size="small" color="primary" />
                      )}
                      <Chip label={`v${template.version}`} size="small" variant="outlined" />
                    </Box>
                    {showArchived && (
                      <Typography variant="caption" color="textSecondary">
                        Archived: {new Date(template.updated_at).toLocaleDateString()}
                      </Typography>
                    )}
                  </CardContent>
                  
                  <CardActions sx={{ justifyContent: "space-between" }}>
                    {showArchived ? (
                      <Button
                        size="small"
                        color="primary"
                        startIcon={<RestoreIcon />}
                        onClick={() => handleRestoreTemplate(template.id)}
                        fullWidth
                      >
                        Restore
                      </Button>
                    ) : (
                      <>
                        <Button
                          size="small"
                          startIcon={<EditIcon />}
                          onClick={() => handleEditTemplate(template)}
                        >
                          Edit
                        </Button>
                        <Box>
                          <IconButton
                            size="small"
                            onClick={() => handleDuplicateTemplate(template.id)}
                          >
                            <DuplicateIcon />
                          </IconButton>
                          <IconButton
                            size="small"
                            onClick={() => handleDeleteTemplate(template.id)}
                          >
                            <ArchiveIcon />
                          </IconButton>
                        </Box>
                      </>
                    )}
                  </CardActions>
                </Card>
              </Grid>
            ))}
          </Grid>
        ) : (
          <TableContainer component={Paper}>
            <Table>
              <TableHead>
                <TableRow>
                  <TableCell>Name</TableCell>
                  <TableCell>Category</TableCell>
                  <TableCell>Description</TableCell>
                  <TableCell>Version</TableCell>
                  <TableCell>Brick Enabled</TableCell>
                  <TableCell>{showArchived ? "Archived" : "Created"}</TableCell>
                  <TableCell>Actions</TableCell>
                </TableRow>
              </TableHead>
              <TableBody>
                {filteredTemplates.map((template) => (
                  <TableRow key={template.id}>
                    <TableCell>
                      <Typography variant="subtitle2">{template.name}</Typography>
                    </TableCell>
                    <TableCell>
                      <Chip label={template.category} size="small" />
                    </TableCell>
                    <TableCell>{template.description}</TableCell>
                    <TableCell>v{template.version}</TableCell>
                    <TableCell>
                      {template.brick_enabled ? (
                        <Chip label="Yes" color="primary" size="small" />
                      ) : (
                        <Chip label="No" size="small" />
                      )}
                    </TableCell>
                    <TableCell>
                      {showArchived 
                        ? new Date(template.updated_at).toLocaleDateString()
                        : new Date(template.created_at).toLocaleDateString()
                      }
                    </TableCell>
                    <TableCell>
                      {showArchived ? (
                        <IconButton 
                          size="small" 
                          onClick={() => handleRestoreTemplate(template.id)}
                          color="primary"
                          title="Restore template"
                        >
                          <RestoreIcon />
                        </IconButton>
                      ) : (
                        <>
                          <IconButton size="small" onClick={() => handleEditTemplate(template)}>
                            <EditIcon />
                          </IconButton>
                          <IconButton size="small" onClick={() => handleDuplicateTemplate(template.id)}>
                            <DuplicateIcon />
                          </IconButton>
                          <IconButton size="small" onClick={() => handleDeleteTemplate(template.id)}>
                            <ArchiveIcon />
                          </IconButton>
                        </>
                      )}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </TableContainer>
        )}
      </Box>
    </Box>
  );

  const handleFieldDrop = (fieldType) => {
    const newField = {
      id: `field_${Date.now()}`,
      type: fieldType.id,
      label: fieldType.name,
      required: false,
      placeholder: "",
      options: fieldType.id === "select" || fieldType.id === "radio" ? ["Option 1", "Option 2"] : [],
      defaultValue: "",
    };
    
    setFormFields([...formFields, newField]);
    handleFormChange("fieldConfig", {
      ...templateFormData.fieldConfig,
      [newField.id]: newField,
    });
  };

  const handleRemoveField = (fieldId) => {
    const updatedFields = formFields.filter(field => field.id !== fieldId);
    setFormFields(updatedFields);
    
    const updatedFieldConfig = { ...templateFormData.fieldConfig };
    delete updatedFieldConfig[fieldId];
    handleFormChange("fieldConfig", updatedFieldConfig);
  };

  const handleFieldUpdate = (fieldId, updates) => {
    const updatedFields = formFields.map(field => 
      field.id === fieldId ? { ...field, ...updates } : field
    );
    setFormFields(updatedFields);
    
    const updatedFieldConfig = { ...templateFormData.fieldConfig };
    updatedFieldConfig[fieldId] = { ...updatedFieldConfig[fieldId], ...updates };
    handleFormChange("fieldConfig", updatedFieldConfig);
  };

  const renderFieldBuilder = () => (
    <Box>
      <Typography variant="h6" gutterBottom>
        Field Builder
      </Typography>
      <Typography variant="body2" color="textSecondary" sx={{ mb: 3 }}>
        Drag fields from the sidebar to build your form. Click on fields to configure them.
      </Typography>
      
      <Grid container spacing={3}>
        {/* Field types sidebar */}
        <Grid item xs={12} md={4}>
          <Paper sx={{ p: 2, maxHeight: 600, overflow: "auto" }}>
            <Typography variant="subtitle1" gutterBottom>
              Field Types
            </Typography>
            
            <Accordion defaultExpanded>
              <AccordionSummary expandIcon={<ExpandMoreIcon />}>
                <Typography>Basic Fields</Typography>
              </AccordionSummary>
              <AccordionDetails>
                <List dense>
                  {Object.values(FIELD_TYPES)
                    .filter((field) => field.category === "basic")
                    .map((field) => (
                      <ListItem
                        key={field.id}
                        sx={{
                          cursor: "grab",
                          border: "1px solid #e0e0e0",
                          borderRadius: 1,
                          mb: 1,
                          "&:hover": { bgcolor: "action.hover" },
                          "&:active": { cursor: "grabbing" },
                        }}
                        draggable
                        onDragStart={(e) => setDraggedField(field)}
                        onDragEnd={() => setDraggedField(null)}
                      >
                        <ListItemIcon>
                          <DragIcon />
                        </ListItemIcon>
                        <ListItemText
                          primary={field.name}
                          secondary={field.description}
                        />
                      </ListItem>
                    ))}
                </List>
              </AccordionDetails>
            </Accordion>
            
            <Accordion>
              <AccordionSummary expandIcon={<ExpandMoreIcon />}>
                <Typography>Advanced Fields</Typography>
              </AccordionSummary>
              <AccordionDetails>
                <List dense>
                  {Object.values(FIELD_TYPES)
                    .filter((field) => field.category === "advanced")
                    .map((field) => (
                      <ListItem
                        key={field.id}
                        sx={{
                          cursor: "grab",
                          border: "1px solid #e0e0e0",
                          borderRadius: 1,
                          mb: 1,
                          "&:hover": { bgcolor: "action.hover" },
                          "&:active": { cursor: "grabbing" },
                        }}
                        draggable
                        onDragStart={(e) => setDraggedField(field)}
                        onDragEnd={() => setDraggedField(null)}
                      >
                        <ListItemIcon>
                          <DragIcon />
                        </ListItemIcon>
                        <ListItemText
                          primary={field.name}
                          secondary={field.description}
                        />
                      </ListItem>
                    ))}
                </List>
              </AccordionDetails>
            </Accordion>
          </Paper>
        </Grid>
        
        {/* Form builder area */}
        <Grid item xs={12} md={8}>
          <Paper
            sx={{
              p: 3,
              minHeight: 500,
              border: formFields.length === 0 ? "2px dashed #ccc" : "1px solid #e0e0e0",
              bgcolor: formFields.length === 0 ? "#fafafa" : "white",
            }}
            onDragOver={(e) => {
              e.preventDefault();
              e.currentTarget.style.borderColor = "#1976d2";
              e.currentTarget.style.backgroundColor = "#f3f9ff";
            }}
            onDragLeave={(e) => {
              e.currentTarget.style.borderColor = formFields.length === 0 ? "#ccc" : "#e0e0e0";
              e.currentTarget.style.backgroundColor = formFields.length === 0 ? "#fafafa" : "white";
            }}
            onDrop={(e) => {
              e.preventDefault();
              e.currentTarget.style.borderColor = formFields.length === 0 ? "#ccc" : "#e0e0e0";
              e.currentTarget.style.backgroundColor = formFields.length === 0 ? "#fafafa" : "white";
              
              if (draggedField) {
                handleFieldDrop(draggedField);
              }
            }}
          >
            {formFields.length === 0 ? (
              <Box sx={{ 
                display: "flex", 
                alignItems: "center", 
                justifyContent: "center",
                height: 300,
                flexDirection: "column",
                textAlign: "center"
              }}>
                <DragIcon className="h-12 w-12 text-neutral-300 mb-2" />
                <Typography variant="h6" color="textSecondary" gutterBottom>
                  Drag fields here to build your form
                </Typography>
                <Typography variant="body2" color="textSecondary">
                  Choose from the field types on the left to get started
                </Typography>
              </Box>
            ) : (
              <Box>
                <Typography variant="subtitle1" gutterBottom>
                  Form Fields ({formFields.length})
                </Typography>
                {formFields.map((field, index) => (
                  <Paper
                    key={field.id}
                    sx={{
                      p: 2,
                      mb: 2,
                      border: "1px solid #e0e0e0",
                      position: "relative",
                      "&:hover": {
                        borderColor: "#1976d2",
                        boxShadow: 1,
                      },
                    }}
                  >
                    <Box sx={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start" }}>
                      <Box sx={{ flexGrow: 1, mr: 2 }}>
                        <Typography variant="subtitle2" gutterBottom>
                          {field.label}
                        </Typography>
                        <Typography variant="caption" color="textSecondary">
                          {FIELD_TYPES[field.type]?.name} • {field.required ? "Required" : "Optional"}
                        </Typography>
                      </Box>
                      <IconButton
                        size="small"
                        onClick={() => handleRemoveField(field.id)}
                        sx={{ color: "error.main" }}
                      >
                        <DeleteIcon />
                      </IconButton>
                    </Box>
                    
                    {/* Field configuration */}
                    <Box sx={{ mt: 2 }}>
                      <TextField
                        fullWidth
                        size="small"
                        label="Field Label"
                        value={field.label}
                        onChange={(e) => handleFieldUpdate(field.id, { label: e.target.value })}
                        sx={{ mb: 1 }}
                      />
                      <FormControlLabel
                        control={
                          <Checkbox
                            checked={field.required}
                            onChange={(e) => handleFieldUpdate(field.id, { required: e.target.checked })}
                          />
                        }
                        label="Required field"
                      />
                    </Box>
                  </Paper>
                ))}
              </Box>
            )}
          </Paper>
        </Grid>
      </Grid>
    </Box>
  );

  const handleBrickElementDrop = (variable) => {
    const newElement = {
      id: `brick_${Date.now()}`,
      type: "variable",
      key: variable.key,
      label: variable.label,
      format: "text",
      bold: false,
      caps: false,
      bulletPoints: false,
      prefix: variable.key === "custom_field" ? "" : `${variable.label}: `,
      suffix: "",
      show_if_true: false,
      customText: variable.key === "custom_field" ? "" : undefined,
    };
    
    setBrickElements([...brickElements, newElement]);
    handleFormChange("brickLayout", [...brickElements, newElement]);
  };

  const handleRemoveBrickElement = (elementId) => {
    const updatedElements = brickElements.filter(element => element.id !== elementId);
    setBrickElements(updatedElements);
    handleFormChange("brickLayout", updatedElements);
  };

  const handleBrickElementUpdate = (elementId, updates) => {
    const updatedElements = brickElements.map(element =>
      element.id === elementId ? { ...element, ...updates } : element
    );
    setBrickElements(updatedElements);
    handleFormChange("brickLayout", updatedElements);
  };

  const handleBrickElementReorder = (dragIndex, hoverIndex) => {
    const draggedItem = brickElements[dragIndex];
    const newElements = [...brickElements];
    newElements.splice(dragIndex, 1);
    newElements.splice(hoverIndex, 0, draggedItem);
    setBrickElements(newElements);
    handleFormChange("brickLayout", newElements);
  };

  const handleBrickElementDragStart = (e, elementId, index) => {
    // Only allow dragging from the header area, not from form inputs
    if (e.target.tagName === 'INPUT' || e.target.tagName === 'TEXTAREA' || e.target.tagName === 'SELECT') {
      e.preventDefault();
      return;
    }
    
    setDraggedElement({ id: elementId, index });
    e.dataTransfer.effectAllowed = 'move';
    e.dataTransfer.setData('text/html', e.target.outerHTML);
  };

  const handleBrickElementDragOver = (e, index) => {
    e.preventDefault();
    e.dataTransfer.dropEffect = 'move';
    setDragOverIndex(index);
  };

  const handleBrickElementDragLeave = () => {
    setDragOverIndex(null);
  };

  const handleBrickElementReorderDrop = (e, dropIndex) => {
    e.preventDefault();
    setDragOverIndex(null);
    
    if (draggedElement && draggedElement.index !== dropIndex) {
      handleBrickElementReorder(draggedElement.index, dropIndex);
    }
    setDraggedElement(null);
  };

  const handleBrickElementDragEnd = () => {
    setDraggedElement(null);
    setDragOverIndex(null);
  };

  const generateBrickPreview = () => {
    if (brickElements.length === 0) return "";
    
    const lines = [];
    let isFirstContentElement = true; // Track if this is the first content element (not a label)
    
    brickElements.forEach((element) => {
      if (element.type === "label") {
        let text = element.text || "";
        if (element.bold) text = `**${text}**`;
        if (element.caps) text = text.toUpperCase();
        
        if (element.bulletPoints) {
          const textLines = text.split('\n');
          textLines.forEach(line => {
            if (line.trim()) {
              lines.push(`• ${line}`);
            }
          });
        } else {
          lines.push(text);
        }
        // Labels don't count as first content element
      } else if (element.type === "variable") {
        const sampleData = {
          client_first_name: "John",
          client_last_name: "Doe",
          client_full_name: "John Doe",
          address: "123 Main St, New York, NY 10001",
          subject: "Sample Subject",
          student_name: "Sample Student",
          start_date: "MM/DD/YYYY",
          duration: "Sample Duration",
          lesson_type: "Sample Lesson Type",
          parent_name: "John Doe",
          children_info: "Jane – Chess Level: Beginner – (Age: 8)",
          client_notes: "Jane is excited to learn chess and loves puzzles.",
          teaching_notes: "Focus on basic piece movements and simple tactics.",
          tutors: "Sarah Johnson, Mike Chen",
          contact: "Jane Smith - Afterschool Director - (555) 123-4567",
          custom_field: element.customText || "[Custom Text]",
        };
        
        let value = sampleData[element.key] || `[${element.label}]`;
        
        if (element.format === "conditional_text" && element.show_if_true) {
          if (element.key === "is_trial" && value === true) {
            let text = element.label || "TRIAL";
            if (element.style === "bold_caps") text = `**${text.toUpperCase()}**`;
            lines.push(text);
            return;
          }
        }
        
        if (value) {
          // Special handling: for client_full_name at the top, show only the value without label/prefix
          const isClientFullNameAtTop = element.key === "client_full_name" && isFirstContentElement && value;
          
          let prefix = element.prefix || "";
          let suffix = element.suffix || "";
          
          // If it's client_full_name at the top, show only the value (no prefix, no label)
          if (isClientFullNameAtTop) {
            // Just show the value, no prefix/suffix
            prefix = "";
            suffix = "";
          }
          
          let text = `${prefix}${value}${suffix}`;
          
          // Apply formatting
          if (element.bold) text = `**${text}**`;
          if (element.caps) text = text.toUpperCase();
          
          // Handle bullet points
          if (element.bulletPoints) {
            // Split text by newlines for multi-line content
            const textLines = text.split('\n');
            textLines.forEach(line => {
              if (line.trim()) {
                lines.push(`• ${line}`);
              }
            });
          } else {
            lines.push(text);
          }
          
          // Mark that we've processed the first content element
          if (isFirstContentElement && value) {
            isFirstContentElement = false;
          }
        }
      }
    });
    
    return lines.join("\n");
  };

  const renderBrickBuilder = () => (
    <Box>
      <Typography variant="h6" gutterBottom>
        Brick Builder
      </Typography>
      <Typography variant="body2" color="textSecondary" sx={{ mb: 3 }}>
        Design how the job description (Brick) will be formatted. Drag variables to create the layout.
      </Typography>
      
      <Grid container spacing={3}>
        {/* Brick variables sidebar - Left */}
        <Grid item xs={12} md={4}>
          <Paper sx={{ p: 2, maxHeight: 600, overflow: "auto" }}>
            <Typography variant="subtitle1" gutterBottom>
              Brick Variables
            </Typography>
            
            {Object.entries(
              Object.entries(BRICK_VARIABLES).reduce((acc, [key, variable]) => {
                if (!acc[variable.category]) {
                  acc[variable.category] = [];
                }
                acc[variable.category].push({ key, ...variable });
                return acc;
              }, {})
            ).map(([category, variables]) => (
              <Accordion key={category} defaultExpanded>
                <AccordionSummary expandIcon={<ExpandMoreIcon />}>
                  <Typography variant="subtitle2">{category.charAt(0).toUpperCase() + category.slice(1)}</Typography>
                </AccordionSummary>
                <AccordionDetails sx={{ p: 1 }}>
                  <Grid container spacing={1}>
                    {variables.map((variable) => (
                      <Grid item xs={12} key={variable.key}>
                        <Paper
                          sx={{
                            p: 1,
                            cursor: "grab",
                            border: "1px solid #e0e0e0",
                            borderRadius: 1,
                            "&:hover": { 
                              bgcolor: "action.hover",
                              borderColor: "#1976d2",
                              boxShadow: 1
                            },
                            "&:active": { cursor: "grabbing" },
                          }}
                          draggable
                          onDragStart={(e) => setDraggedBrickVar(variable)}
                          onDragEnd={() => setDraggedBrickVar(null)}
                        >
                          <Box sx={{ display: "flex", alignItems: "center", gap: 1 }}>
                            <DragIcon className="h-4 w-4 text-neutral-500" />
                            <Box sx={{ flexGrow: 1, minWidth: 0 }}>
                              <Typography variant="caption" sx={{ fontWeight: 500, display: "block", lineHeight: 1.2 }}>
                                {variable.label}
                              </Typography>
                              <Typography variant="caption" color="text.secondary" sx={{ fontSize: "0.7rem" }}>
                                ={variable.key}
                              </Typography>
                            </Box>
                          </Box>
                        </Paper>
                      </Grid>
                    ))}
                  </Grid>
                </AccordionDetails>
              </Accordion>
            ))}
          </Paper>
        </Grid>
        
        {/* Brick layout builder - Middle */}
        <Grid item xs={12} md={5}>
          <Paper
            sx={{
              p: 2,
              minHeight: 500,
              maxHeight: 650,
              overflowY: "auto",
              border: brickElements.length === 0 ? "2px dashed #ccc" : "1px solid #e0e0e0",
              bgcolor: brickElements.length === 0 ? "#fafafa" : "white",
            }}
            onDragOver={(e) => {
              e.preventDefault();
              e.currentTarget.style.borderColor = "#1976d2";
              e.currentTarget.style.backgroundColor = "#f3f9ff";
            }}
            onDragLeave={(e) => {
              e.currentTarget.style.borderColor = brickElements.length === 0 ? "#ccc" : "#e0e0e0";
              e.currentTarget.style.backgroundColor = brickElements.length === 0 ? "#fafafa" : "white";
            }}
            onDrop={(e) => {
              e.preventDefault();
              e.currentTarget.style.borderColor = brickElements.length === 0 ? "#ccc" : "#e0e0e0";
              e.currentTarget.style.backgroundColor = brickElements.length === 0 ? "#fafafa" : "white";
              
              if (draggedBrickVar) {
                handleBrickElementDrop(draggedBrickVar);
              }
            }}
          >
            {brickElements.length === 0 ? (
              <Box sx={{ 
                display: "flex", 
                alignItems: "center", 
                justifyContent: "center",
                height: 300,
                flexDirection: "column",
                textAlign: "center"
              }}>
                <DragIcon className="h-12 w-12 text-neutral-300 mb-2" />
                <Typography variant="h6" color="textSecondary" gutterBottom>
                  Drag variables here to build your Brick
                </Typography>
                <Typography variant="body2" color="textSecondary">
                  Variables will appear in the job description when jobs are created
                </Typography>
              </Box>
            ) : (
              <Box>
                <Typography variant="subtitle1" gutterBottom>
                  Brick Layout ({brickElements.length} elements)
                </Typography>
                    {brickElements.map((element, index) => (
                      <Paper
                        key={element.id}
                        sx={{
                          p: 1.5,
                          mb: 1.5,
                          border: dragOverIndex === index ? "2px dashed #1976d2" : "1px solid #e0e0e0",
                          position: "relative",
                          opacity: draggedElement?.id === element.id ? 0.5 : 1,
                          transform: draggedElement?.id === element.id ? "rotate(2deg)" : "none",
                          transition: "all 0.2s ease",
                          "&:hover": {
                            borderColor: "#1976d2",
                            boxShadow: 1,
                          },
                        }}
                        draggable
                        onDragStart={(e) => handleBrickElementDragStart(e, element.id, index)}
                        onDragOver={(e) => handleBrickElementDragOver(e, index)}
                        onDragLeave={handleBrickElementDragLeave}
                        onDrop={(e) => handleBrickElementReorderDrop(e, index)}
                        onDragEnd={handleBrickElementDragEnd}
                      >
                    <Box sx={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start" }}>
                      <Box sx={{ display: "flex", alignItems: "center", gap: 1, flexGrow: 1, mr: 2 }}>
                        <DragIcon className="h-4 w-4 text-neutral-500 cursor-grab" />
                        <Box>
                          <Typography variant="subtitle2" gutterBottom>
                            {element.label}
                          </Typography>
                          <Typography variant="caption" color="textSecondary">
                            Variable: ={element.key}
                          </Typography>
                        </Box>
                      </Box>
                      <IconButton
                        size="small"
                        onClick={(e) => {
                          e.stopPropagation();
                          handleRemoveBrickElement(element.id);
                        }}
                        sx={{ color: "error.main" }}
                      >
                        <DeleteIcon />
                      </IconButton>
                    </Box>
                    
                        {/* Element configuration */}
                        <Box sx={{ mt: 1.5 }}>
                          <Grid container spacing={1.5}>
                        {element.key === "custom_field" && (
                          <Grid item xs={12}>
                            <TextField
                              fullWidth
                              size="small"
                              label="Custom Text"
                              value={element.customText || ""}
                              onChange={(e) => handleBrickElementUpdate(element.id, { customText: e.target.value })}
                              placeholder="Enter custom text to display"
                              multiline
                              rows={2}
                            />
                          </Grid>
                        )}
                        <Grid item xs={6}>
                          <TextField
                            fullWidth
                            size="small"
                            label="Prefix"
                            value={element.prefix}
                            onChange={(e) => handleBrickElementUpdate(element.id, { prefix: e.target.value })}
                          />
                        </Grid>
                        <Grid item xs={6}>
                          <TextField
                            fullWidth
                            size="small"
                            label="Suffix"
                            value={element.suffix}
                            onChange={(e) => handleBrickElementUpdate(element.id, { suffix: e.target.value })}
                          />
                        </Grid>
                            <Grid item xs={12}>
                              <FormGroup row sx={{ gap: 1 }}>
                                <FormControlLabel
                                  control={
                                    <Checkbox
                                      size="small"
                                      checked={element.bold}
                                      onChange={(e) => handleBrickElementUpdate(element.id, { bold: e.target.checked })}
                                    />
                                  }
                                  label="Bold"
                                  sx={{ m: 0 }}
                                />
                                <FormControlLabel
                                  control={
                                    <Checkbox
                                      size="small"
                                      checked={element.caps}
                                      onChange={(e) => handleBrickElementUpdate(element.id, { caps: e.target.checked })}
                                    />
                                  }
                                  label="Uppercase"
                                  sx={{ m: 0 }}
                                />
                                <FormControlLabel
                                  control={
                                    <Checkbox
                                      size="small"
                                      checked={element.bulletPoints}
                                      onChange={(e) => handleBrickElementUpdate(element.id, { bulletPoints: e.target.checked })}
                                    />
                                  }
                                  label="Bullet Points"
                                  sx={{ m: 0 }}
                                />
                              </FormGroup>
                            </Grid>
                      </Grid>
                    </Box>
                  </Paper>
                ))}
              </Box>
            )}
          </Paper>
        </Grid>
        
        {/* Brick preview - Right */}
        <Grid item xs={12} md={3}>
          <Paper sx={{ p: 2, maxHeight: 600, overflow: "auto" }}>
            <Typography variant="subtitle1" gutterBottom>
              Live Preview
            </Typography>
            <BrickPreview 
              description={generateBrickPreview()} 
              title="Brick Preview"
            />
          </Paper>
        </Grid>
      </Grid>
    </Box>
  );

  const renderBasicSettings = () => (
    <Grid container spacing={2}>
      <Grid item xs={12}>
        <TextField
          fullWidth
          label="Template Name"
          value={templateFormData.name}
          onChange={(e) => handleFormChange("name", e.target.value)}
          required
        />
      </Grid>
      <Grid item xs={12}>
        <TextField
          fullWidth
          label="Description"
          value={templateFormData.description}
          onChange={(e) => handleFormChange("description", e.target.value)}
          multiline
          rows={2}
        />
      </Grid>
      <Grid item xs={12} md={6}>
        <FormControl fullWidth>
          <InputLabel>Category</InputLabel>
          <Select
            value={templateFormData.category}
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
              checked={templateFormData.brickEnabled}
              onChange={(e) => handleFormChange("brickEnabled", e.target.checked)}
            />
          }
          label="Enable Brick Generation"
        />
      </Grid>
    </Grid>
  );

  // Generate a preview of what the Job Builder form will look like
  const renderJobBuilderPreview = () => {
    const config = templateFormData.templateConfig || {};
    const category = templateFormData.category || "Home";
    
    // Sample data for preview
    const sampleData = {
      client_name: "John Smith",
      client_first_name: "John",
      client_last_name: "Smith",
      student_name: "Emma Smith",
      address: "123 Main St, New York, NY 10001",
      school_name: "PS 123 - The Future School",
    };
    
    // Generate sample job name from template
    const generateSampleJobName = () => {
      if (!config.job_name_template) return "[Auto-generated job name]";
      let name = config.job_name_template;
      name = name.replace(/Client First Name/g, sampleData.client_first_name);
      name = name.replace(/Client Last Name/g, sampleData.client_last_name);
      name = name.replace(/Client Name/g, sampleData.client_name);
      name = name.replace(/Student First Name/g, sampleData.student_name.split(" ")[0]);
      name = name.replace(/\(Student First Name\)/g, `(${sampleData.student_name.split(" ")[0]})`);
      return name;
    };

    return (
      <Paper sx={{ p: 2, bgcolor: "#fafafa", height: "100%", overflow: "auto" }}>
        <Typography variant="subtitle1" gutterBottom sx={{ fontWeight: 600, color: "primary.main", mb: 2 }}>
          📋 Job Builder Preview
        </Typography>
        <Typography variant="caption" color="textSecondary" sx={{ display: "block", mb: 2 }}>
          Preview of what staff will see when creating a job from this template.
        </Typography>
        
        {/* Category Badge */}
        <Box sx={{ mb: 2 }}>
          <Chip 
            label={category} 
            size="small" 
            sx={{ 
              bgcolor: category === "Home" ? "#4CAF50" : 
                      category === "School" ? "#FF9800" : 
                      category === "Club" ? "#2196F3" : 
                      category === "Online" ? "#607D8B" : "#9C27B0",
              color: "white",
              fontWeight: 500
            }} 
          />
        </Box>

        {/* Job Name Preview */}
        <Box sx={{ mb: 2, p: 1.5, bgcolor: "white", borderRadius: 1, border: "1px solid #e0e0e0" }}>
          <Typography variant="caption" color="textSecondary">Job Name (auto-generated)</Typography>
          <Typography variant="body2" sx={{ fontWeight: 500 }}>
            {generateSampleJobName()}
          </Typography>
        </Box>

        {/* Form Fields Preview */}
        <Typography variant="subtitle2" gutterBottom sx={{ mt: 2, mb: 1 }}>
          Form Fields Shown:
        </Typography>
        
        <Box sx={{ display: "flex", flexDirection: "column", gap: 1 }}>
          {/* Client Selection - Always shown */}
          <Box sx={{ p: 1, bgcolor: "white", borderRadius: 1, border: "1px solid #e0e0e0" }}>
            <Typography variant="caption" color="textSecondary">Client *</Typography>
            <Typography variant="body2">{category === "School" ? sampleData.school_name : sampleData.client_name}</Typography>
          </Box>

          {/* Students - For Home/Online */}
          {(category === "Home" || category === "Online") && (
            <Box sx={{ p: 1, bgcolor: "white", borderRadius: 1, border: "1px solid #e0e0e0" }}>
              <Typography variant="caption" color="textSecondary">Students</Typography>
              <Typography variant="body2">{sampleData.student_name}</Typography>
            </Box>
          )}

          {/* Subject - if default set */}
          <Box sx={{ p: 1, bgcolor: "white", borderRadius: 1, border: "1px solid #e0e0e0" }}>
            <Typography variant="caption" color="textSecondary">Subject</Typography>
            <Typography variant="body2">{config.subject || "Chess"}</Typography>
            {config.subject && <Chip label="Pre-filled" size="small" sx={{ ml: 1, height: 18, fontSize: "0.65rem" }} />}
          </Box>

          {/* Lesson Type - if default set */}
          {config.lesson_type && (
            <Box sx={{ p: 1, bgcolor: "white", borderRadius: 1, border: "1px solid #e0e0e0" }}>
              <Typography variant="caption" color="textSecondary">Lesson Type</Typography>
              <Typography variant="body2">{config.lesson_type}</Typography>
              <Chip label="Pre-filled" size="small" sx={{ ml: 1, height: 18, fontSize: "0.65rem" }} />
            </Box>
          )}

          {/* Duration - if default set */}
          {config.duration && (
            <Box sx={{ p: 1, bgcolor: "white", borderRadius: 1, border: "1px solid #e0e0e0" }}>
              <Typography variant="caption" color="textSecondary">Duration</Typography>
              <Typography variant="body2">{config.duration}</Typography>
              <Chip label="Pre-filled" size="small" sx={{ ml: 1, height: 18, fontSize: "0.65rem" }} />
            </Box>
          )}

          {/* Lesson Dates - if default set */}
          {config.lesson_dates && (
            <Box sx={{ p: 1, bgcolor: "white", borderRadius: 1, border: "1px solid #e0e0e0" }}>
              <Typography variant="caption" color="textSecondary">Lesson Dates</Typography>
              <Typography variant="body2">{config.lesson_dates}</Typography>
              <Chip label="Pre-filled" size="small" sx={{ ml: 1, height: 18, fontSize: "0.65rem" }} />
            </Box>
          )}

          {/* Day & Time */}
          <Box sx={{ p: 1, bgcolor: "white", borderRadius: 1, border: "1px solid #e0e0e0" }}>
            <Typography variant="caption" color="textSecondary">Day & Time</Typography>
            <Typography variant="body2">Monday 3:00 PM - 4:00 PM</Typography>
          </Box>

          {/* Address - For Home/School */}
          {(category === "Home" || category === "School") && (
            <Box sx={{ p: 1, bgcolor: "white", borderRadius: 1, border: "1px solid #e0e0e0" }}>
              <Typography variant="caption" color="textSecondary">Address</Typography>
              <Typography variant="body2">{sampleData.address}</Typography>
            </Box>
          )}

          {/* Timezone - For Online */}
          {category === "Online" && (
            <Box sx={{ p: 1, bgcolor: "white", borderRadius: 1, border: "1px solid #e0e0e0" }}>
              <Typography variant="caption" color="textSecondary">Timezone</Typography>
              <Typography variant="body2">America/New_York</Typography>
            </Box>
          )}
        </Box>

        {/* Pricing Preview */}
        <Typography variant="subtitle2" gutterBottom sx={{ mt: 3, mb: 1 }}>
          Default Pricing:
        </Typography>
        <Box sx={{ display: "flex", flexDirection: "column", gap: 1 }}>
          {config.dft_charge_rate && (
            <Box sx={{ p: 1, bgcolor: "white", borderRadius: 1, border: "1px solid #e0e0e0" }}>
              <Typography variant="caption" color="textSecondary">Charge Rate</Typography>
              <Typography variant="body2" sx={{ fontWeight: 500 }}>${config.dft_charge_rate}/hr</Typography>
            </Box>
          )}
          {config.dft_contractor_rate && (
            <Box sx={{ p: 1, bgcolor: "white", borderRadius: 1, border: "1px solid #e0e0e0" }}>
              <Typography variant="caption" color="textSecondary">Tutor Rate</Typography>
              <Typography variant="body2" sx={{ fontWeight: 500 }}>${config.dft_contractor_rate}/hr</Typography>
            </Box>
          )}
          {!config.dft_charge_rate && !config.dft_contractor_rate && (
            <Typography variant="body2" color="textSecondary" sx={{ fontStyle: "italic" }}>
              No default rates configured
            </Typography>
          )}
        </Box>

        {/* Labels Preview */}
        {config.labels && config.labels.length > 0 && (
          <>
            <Typography variant="subtitle2" gutterBottom sx={{ mt: 3, mb: 1 }}>
              Auto-Applied Labels:
            </Typography>
            <Box sx={{ display: "flex", flexWrap: "wrap", gap: 0.5 }}>
              {config.labels.map((labelId) => {
                const label = labels.find((l) => l.id === labelId);
                return (
                  <Chip
                    key={labelId}
                    label={label?.name || labelId}
                    size="small"
                    sx={{
                      bgcolor: label?.colour || "#e0e0e0",
                      color: label?.colour ? "white" : "inherit",
                      fontSize: "0.7rem",
                    }}
                  />
                );
              })}
            </Box>
          </>
        )}

        {/* Calendar Colour Preview */}
        {config.colour && (
          <>
            <Typography variant="subtitle2" gutterBottom sx={{ mt: 3, mb: 1 }}>
              Calendar Colour:
            </Typography>
            <Box sx={{ display: "flex", alignItems: "center", gap: 1 }}>
              <Box
                sx={{
                  width: 24,
                  height: 24,
                  borderRadius: "50%",
                  border: "2px solid rgba(0,0,0,0.2)",
                  backgroundColor: colours.find(c => c.value === config.colour)?.colorValue || config.colour,
                }}
              />
              <Typography variant="body2">{config.colour}</Typography>
            </Box>
          </>
        )}
      </Paper>
    );
  };

  const renderTutorCruncherSettings = () => (
    <Grid container spacing={2}>
      {/* Left side - Settings */}
      <Grid item xs={12} md={8}>
        <Grid container spacing={2}>
          {/* Basic Service Settings */}
          <Grid item xs={12}>
            <Typography variant="h6" gutterBottom sx={{ mt: 2 }}>
              Basic Service Settings
            </Typography>
          </Grid>
          
          <Grid item xs={12}>
            <TextField
              fullWidth
              label="Job Name Template"
              value={templateFormData.templateConfig.job_name_template || ""}
              onChange={(e) => handleTemplateConfigChange("job_name_template", e.target.value)}
              helperText="Pattern for auto-generating job names. Use placeholders: Client First Name, Client Last Name, Client Name, Student First Name, (Student First Name). Example: 'Client First Name_Client Last Name - Chess - Home - 1:1 (Student First Name)'"
              placeholder="Client First Name_Client Last Name - Chess - Home - 1:1 (Student First Name)"
            />
          </Grid>
      
          <Grid item xs={12} md={6}>
            <FormControl fullWidth>
              <InputLabel>Calendar Colour</InputLabel>
          <Select
            value={templateFormData.templateConfig.colour || ""}
            onChange={(e) => handleTemplateConfigChange("colour", e.target.value)}
            label="Calendar Colour"
            renderValue={(selected) => {
              if (!selected) {
                return <Typography variant="body2" color="textSecondary">Select a colour...</Typography>;
              }
              // Find the colour option that matches the selected value
              const selectedColour = colours.find((c) => c.value === selected);
              if (selectedColour) {
                return (
                  <Box sx={{ display: "flex", alignItems: "center", gap: 1 }}>
                    <Box
                      sx={{
                        width: 16,
                        height: 16,
                        borderRadius: "50%",
                        border: "1px solid rgba(0,0,0,0.2)",
                        backgroundColor: selectedColour.value,
                      }}
                    />
                    <Typography variant="body2">
                      {selectedColour.label}
                      {selectedColour.machineName ? ` (${selectedColour.machineName})` : ""}
                    </Typography>
                  </Box>
                );
              }
              // Fallback for legacy color names
              const colorMap = {
                "mediumorchid": "Medium Orchid",
                "Gold": "Gold",
                "DodgerBlue": "Dodger Blue",
                "LightGreen": "Light Green",
                "blanchedalmond": "Blanched Almond",
                "Khaki": "Khaki",
                "Red": "Red",
                "Blue": "Blue",
                "Green": "Green",
                "Yellow": "Yellow",
                "Orange": "Orange",
                "Purple": "Purple",
                "Pink": "Pink",
                "Teal": "Teal",
                "Brown": "Brown",
                "Gray": "Gray",
                "SlateGray": "Slate Gray",
              };
              return colorMap[selected] || selected || "";
            }}
          >
            {colours.length > 0 ? (
              colours.map((colour) => (
                <MenuItem key={`${colour.value}-${colour.label}`} value={colour.value}>
                  <Box sx={{ display: "flex", alignItems: "center", gap: 1 }}>
                    <Box
                      sx={{
                        width: 16,
                        height: 16,
                        borderRadius: "50%",
                        border: "1px solid rgba(0,0,0,0.2)",
                        backgroundColor: colour.value,
                      }}
                    />
                    <Typography variant="body2">
                      {colour.label}
                      {colour.machineName ? ` (${colour.machineName})` : ""}
                      {colour.isLegacy ? " (legacy)" : ""}
                    </Typography>
                  </Box>
                </MenuItem>
              ))
            ) : (
              // Fallback to basic colors if colours haven't loaded yet
              <>
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
                <MenuItem value="SlateGray">Slate Gray</MenuItem>
                <MenuItem value="mediumorchid">Medium Orchid</MenuItem>
                <MenuItem value="Gold">Gold</MenuItem>
                <MenuItem value="DodgerBlue">Dodger Blue</MenuItem>
                <MenuItem value="LightGreen">Light Green</MenuItem>
                <MenuItem value="blanchedalmond">Blanched Almond</MenuItem>
              </>
            )}
          </Select>
          <FormHelperText>
            Select the calendar colour associated with this Job label so it matches TutorCruncher.
          </FormHelperText>
        </FormControl>
      </Grid>
      
      <Grid item xs={12} md={6}>
        <FormControl fullWidth>
          <InputLabel>Service Status</InputLabel>
          <Select
            value={templateFormData.templateConfig.status === "in_progress" ? "in-progress" : (templateFormData.templateConfig.status || "pending")}
            onChange={(e) => {
              // Convert "in-progress" back to "in_progress" for database storage
              const dbValue = e.target.value === "in-progress" ? "in_progress" : e.target.value;
              handleTemplateConfigChange("status", dbValue);
            }}
          >
            <MenuItem value="pending">Pending</MenuItem>
            <MenuItem value="available">Available</MenuItem>
            <MenuItem value="in-progress">In Progress</MenuItem>
            <MenuItem value="finished">Finished</MenuItem>
            <MenuItem value="gone-cold">Gone Cold</MenuItem>
          </Select>
        </FormControl>
      </Grid>
      
      <Grid item xs={12} md={6}>
        <TextField
          fullWidth
          label="Subject (Default)"
          value={templateFormData.templateConfig.subject || ""}
          onChange={(e) => handleTemplateConfigChange("subject", e.target.value)}
          helperText="Default subject for jobs created from this template"
          placeholder="Chess"
        />
      </Grid>
      
      <Grid item xs={12} md={6}>
        <TextField
          fullWidth
          label="Lesson Type (Default)"
          value={templateFormData.templateConfig.lesson_type || ""}
          onChange={(e) => handleTemplateConfigChange("lesson_type", e.target.value)}
          helperText="Default lesson type (e.g., Private 1:1, Group 1:, Sib Split)"
          placeholder="Private 1:1"
        />
      </Grid>
      
      <Grid item xs={12} md={6}>
        <TextField
          fullWidth
          label="Lesson Dates (Default)"
          value={templateFormData.templateConfig.lesson_dates || ""}
          onChange={(e) => handleTemplateConfigChange("lesson_dates", e.target.value)}
          helperText="Default lesson dates pattern"
          placeholder="Weekly Ongoing"
        />
      </Grid>
      
      <Grid item xs={12} md={6}>
        <TextField
          fullWidth
          label="Duration (Default)"
          value={templateFormData.templateConfig.duration || ""}
          onChange={(e) => handleTemplateConfigChange("duration", e.target.value)}
          helperText="Default duration (e.g., 45-60, 90)"
          placeholder="45-60"
        />
      </Grid>
      
      <Grid item xs={12} md={6}>
        <TextField
          fullWidth
          label="Job Type"
          value={templateFormData.templateConfig.job_type || ""}
          onChange={(e) => handleTemplateConfigChange("job_type", e.target.value)}
          helperText="Job type/location (e.g., New York, LA, Online, Club)"
          placeholder="New York"
        />
      </Grid>
      
      <Grid item xs={12} md={6}>
        <FormControl fullWidth>
          <InputLabel>Labels</InputLabel>
          <Select
            multiple
            open={labelsSelectOpen}
            onOpen={() => setLabelsSelectOpen(true)}
            onClose={() => setLabelsSelectOpen(false)}
            value={templateFormData.templateConfig.labels || []}
            onChange={(e) => {
              const newValue = e.target.value;
              handleTemplateConfigChange("labels", newValue);
              // Close the dropdown after selection to show feedback
              setTimeout(() => {
                setLabelsSelectOpen(false);
              }, 100);
            }}
            label="Labels"
            renderValue={(selected) => {
              if (!selected || selected.length === 0) {
                return <Typography variant="body2" color="textSecondary">Select labels...</Typography>;
              }
              return selected
                .map((labelId) => {
                  const label = labels.find((l) => l.id === labelId);
                  return label ? label.name : labelId;
                })
                .join(", ");
            }}
          >
            {labels
              .filter((label) => {
                // Filter to only show labels that apply to Jobs or Services
                const appliesTo = label.applies_to || [];
                return (
                  appliesTo.includes("Job") ||
                  appliesTo.includes("Service") ||
                  appliesTo.length === 0 // Include labels with no applies_to restriction
                );
              })
              .sort((a, b) => {
                // Sort alphabetically by label name
                const nameA = (a.name || "").toLowerCase();
                const nameB = (b.name || "").toLowerCase();
                return nameA.localeCompare(nameB);
              })
              .map((label) => (
                <MenuItem key={label.id} value={label.id}>
                  <Box sx={{ display: "flex", alignItems: "center", gap: 1 }}>
                    {label.colour && (
                      <Box
                        sx={{
                          width: 16,
                          height: 16,
                          borderRadius: "50%",
                          border: "1px solid rgba(0,0,0,0.2)",
                          backgroundColor: label.colour,
                        }}
                      />
                    )}
                    <Typography variant="body2">{label.name}</Typography>
                  </Box>
                </MenuItem>
              ))}
          </Select>
          <FormHelperText>
            Select labels that will be automatically applied to jobs created from this template
          </FormHelperText>
        </FormControl>
      </Grid>

      {/* Pricing & Rates */}
      <Grid item xs={12}>
        <Typography variant="h6" gutterBottom sx={{ mt: 2 }}>
          Pricing & Rates
        </Typography>
      </Grid>
      
      <Grid item xs={12} md={6}>
        <FormControl fullWidth>
          <InputLabel>Charge Type</InputLabel>
          <Select
            value={templateFormData.templateConfig.dft_charge_type || "hourly"}
            onChange={(e) => handleTemplateConfigChange("dft_charge_type", e.target.value)}
          >
            {CHARGE_TYPE_OPTIONS.map((option) => (
              <MenuItem key={option.value} value={option.value}>
                {option.label}
              </MenuItem>
            ))}
          </Select>
        </FormControl>
      </Grid>
      
      {/* Pricing fields in 3 columns - same row */}
      <Grid item xs={12} md={4}>
        <TextField
          fullWidth
          type="number"
          label="Default Charge Rate"
          value={templateFormData.templateConfig.dft_charge_rate || ""}
          onChange={(e) => handleTemplateConfigChange("dft_charge_rate", parseFloat(e.target.value) || null)}
          helperText={
            <>
              The amount the Student&apos;s paying Client will be charged per hour or lesson. Not sure how much you
              should be charging?{" "}
              <Link
                href="https://www.tutorcruncher.com/tutoring-rates-calculator/"
                target="_blank"
                rel="noopener noreferrer"
              >
                Try our tutoring rates calculator
              </Link>{" "}
              to see what the average rates are.
            </>
          }
        />
      </Grid>
      <Grid item xs={12} md={4}>
        <TextField
          fullWidth
          type="number"
          label="Default Tutor Rate"
          value={templateFormData.templateConfig.dft_contractor_rate || ""}
          onChange={(e) => handleTemplateConfigChange("dft_contractor_rate", parseFloat(e.target.value) || null)}
          helperText={
            <>
              The amount the Tutor will be paid per hour or lesson. Not sure how much you should be charging?{" "}
              <Link
                href="https://www.tutorcruncher.com/tutoring-rates-calculator/"
                target="_blank"
                rel="noopener noreferrer"
              >
                Try our tutoring rates calculator
              </Link>{" "}
              to see what the average rates are.
            </>
          }
        />
      </Grid>
      <Grid item xs={12} md={4}>
        <TextField
          fullWidth
          type="number"
          label="Student Premium"
          value={templateFormData.templateConfig.sr_premium || ""}
          onChange={(e) => handleTemplateConfigChange("sr_premium", parseFloat(e.target.value) || null)}
          helperText="An extra amount paid to each Tutor per Student per unit (eg. hour)."
        />
      </Grid>
      
      <Grid item xs={12} md={6}>
        <TextField
          fullWidth
          type="number"
          label="Added fee per Lesson"
          value={templateFormData.templateConfig.extra_fee_per_apt || ""}
          onChange={(e) => handleTemplateConfigChange("extra_fee_per_apt", parseFloat(e.target.value) || null)}
          helperText="A fixed amount that will be added for each completed Lesson."
        />
      </Grid>
      
      <Grid item xs={12} md={6}>
        <TextField
          fullWidth
          label="Sales Codes"
          value={templateFormData.templateConfig.sales_codes || ""}
          onChange={(e) => handleTemplateConfigChange("sales_codes", e.target.value)}
          helperText="Leave blank to use Branch default."
        />
      </Grid>

      {/* Capacity & Limits */}
      <Grid item xs={12}>
        <Typography variant="h6" gutterBottom sx={{ mt: 2 }}>
          Capacity & Limits
        </Typography>
      </Grid>
      
      <Grid item xs={12} md={6}>
        <TextField
          fullWidth
          type="number"
          label="Max Students"
          value={templateFormData.templateConfig.dft_max_srs || ""}
          onChange={(e) => handleTemplateConfigChange("dft_max_srs", parseInt(e.target.value) || null)}
          helperText="Maximum Students on a lesson, can be overridden on each Lesson – leave blank for no maximum."
        />
      </Grid>
      
      <Grid item xs={12} md={6}>
        <TextField
          fullWidth
          type="number"
          label="Cap"
          value={templateFormData.templateConfig.cap || ""}
          onChange={(e) => handleTemplateConfigChange("cap", parseInt(e.target.value) || null)}
          helperText="Maximum number of units, see Charge Type."
        />
      </Grid>
      
      <Grid item xs={12} md={6}>
        <TextField
          fullWidth
          type="number"
          label="Job Inactivity Time"
          value={templateFormData.templateConfig.inactivity_time || ""}
          onChange={(e) => handleTemplateConfigChange("inactivity_time", parseInt(e.target.value) || null)}
          helperText='Time (in days) of inactivity on the Job before it is marked as "Gone Cold"'
        />
      </Grid>
      
      <Grid item xs={12} md={6}>
        <TextField
          fullWidth
          type="number"
          label="Review Units"
          value={templateFormData.templateConfig.review_units || ""}
          onChange={(e) => handleTemplateConfigChange("review_units", parseInt(e.target.value) || null)}
          helperText="The amount of hours before an automatic review request is sent. The default is 5."
        />
      </Grid>

      {/* Permissions & Requirements */}
      <Grid item xs={12}>
        <Typography variant="h6" gutterBottom sx={{ mt: 2 }}>
          Permissions & Requirements
        </Typography>
      </Grid>
      
      <Grid item xs={12} md={6}>
        <FormControl fullWidth>
          <InputLabel>Default Tutor Permissions</InputLabel>
          <Select
            value={templateFormData.templateConfig.dft_contractor_permissions || "add-edit-complete"}
            onChange={(e) => handleTemplateConfigChange("dft_contractor_permissions", e.target.value)}
          >
            {TUTOR_PERMISSION_OPTIONS.map((option) => (
              <MenuItem key={option.value} value={option.value}>
                {option.label}
              </MenuItem>
            ))}
          </Select>
        </FormControl>
      </Grid>

      {/* Tax Settings */}
      <Grid item xs={12}>
        <Typography variant="h6" gutterBottom sx={{ mt: 2 }}>
          Tax Settings
        </Typography>
      </Grid>
      
      <Grid item xs={12} md={6}>
        <FormControl fullWidth>
          <InputLabel>Branch Tax Setup</InputLabel>
          <Select
            value={templateFormData.templateConfig.branch_tax_setup || "Default Company Tax (20%)"}
            onChange={(e) => handleTemplateConfigChange("branch_tax_setup", e.target.value)}
          >
            <MenuItem value="Default Company Tax (20%)">Default Company Tax (20%)</MenuItem>
            <MenuItem value="No Tax">No Tax</MenuItem>
            <MenuItem value="Custom Tax Setup">Custom Tax Setup</MenuItem>
          </Select>
        </FormControl>
      </Grid>
      
      <Grid item xs={12} md={6}>
        <FormControl fullWidth>
          <InputLabel>Contractor Tax Setup</InputLabel>
          <Select
            value={templateFormData.templateConfig.contractor_tax_setup || "Default Tutor Tax (no tax)"}
            onChange={(e) => handleTemplateConfigChange("contractor_tax_setup", e.target.value)}
          >
            <MenuItem value="Default Tutor Tax (no tax)">Default Tutor Tax (no tax)</MenuItem>
            <MenuItem value="Standard Tax">Standard Tax</MenuItem>
            <MenuItem value="No Tax">No Tax</MenuItem>
          </Select>
        </FormControl>
      </Grid>

      {/* Booking & Automation */}
      <Grid item xs={12}>
        <Typography variant="h6" gutterBottom sx={{ mt: 2 }}>
          Booking & Automation
        </Typography>
      </Grid>
      
      <Grid item xs={12}>
        <FormControlLabel
          control={
            <Switch
              checked={templateFormData.templateConfig.allow_proposed_rates || false}
              onChange={(e) => handleTemplateConfigChange("allow_proposed_rates", e.target.checked)}
            />
          }
          label="Allow Proposed Rates"
        />
      </Grid>
      
      <Grid item xs={12}>
        <FormControlLabel
          control={
            <Switch
              checked={templateFormData.templateConfig.is_bookable || false}
              onChange={(e) => handleTemplateConfigChange("is_bookable", e.target.checked)}
            />
          }
          label="Is Bookable by Clients"
        />
      </Grid>
      
      <Grid item xs={12} md={6}>
        <FormControl component="fieldset" variant="standard">
          <FormControlLabel
            control={
              <Switch
                checked={templateFormData.templateConfig.require_rcr || false}
                onChange={(e) => handleTemplateConfigChange("require_rcr", e.target.checked)}
              />
            }
            label="Require Student"
          />
          <FormHelperText>Require Student to be attached before Lesson can be completed.</FormHelperText>
        </FormControl>
      </Grid>
      
      <Grid item xs={12} md={6}>
        <FormControl component="fieldset" variant="standard">
          <FormControlLabel
            control={
              <Switch
                checked={templateFormData.templateConfig.require_con_job || false}
                onChange={(e) => handleTemplateConfigChange("require_con_job", e.target.checked)}
              />
            }
            label="Require Tutor"
          />
          <FormHelperText>Require Tutor to be attached before Lesson can be completed.</FormHelperText>
        </FormControl>
      </Grid>
      
      <Grid item xs={12}>
        <FormControl component="fieldset" variant="standard">
          <FormControlLabel
            control={
              <Switch
                checked={templateFormData.templateConfig.auto_invoice || false}
                onChange={(e) => handleTemplateConfigChange("auto_invoice", e.target.checked)}
              />
            }
            label="Auto Invoice"
          />
          <FormHelperText>
            If checked, invoices and reports will be sent immediately after a lesson is marked complete. This overrides
            the lesson reports required setting.
          </FormHelperText>
        </FormControl>
      </Grid>

      {/* Custom Fields */}
      <Grid item xs={12}>
        <Typography variant="h6" gutterBottom sx={{ mt: 2 }}>
          Custom Fields
        </Typography>
      </Grid>
      
      <Grid item xs={12}>
        <TextField
          fullWidth
          label="Custom Attributes (JSON)"
          value={JSON.stringify(templateFormData.templateConfig.extra_attrs || [], null, 2)}
          onChange={(e) => {
            try {
              const parsed = JSON.parse(e.target.value);
              handleTemplateConfigChange("extra_attrs", parsed);
            } catch (error) {
              // Invalid JSON, don't update
            }
          }}
          multiline
          rows={4}
          placeholder='{"custom_field_1": "value1", "custom_field_2": "value2"}'
        />
      </Grid>
        </Grid>
      </Grid>
      
      {/* Right side - Live Preview */}
      <Grid item xs={12} md={4}>
        {renderJobBuilderPreview()}
      </Grid>
    </Grid>
  );

  return (
    <Box sx={{ p: 3 }}>
      {renderTemplateGallery()}

      {/* Create/Edit Dialog */}
      <Dialog 
        open={createDialogOpen} 
        onClose={() => setCreateDialogOpen(false)} 
        maxWidth="xl" 
        fullWidth
        PaperProps={{
          sx: { height: '90vh' }
        }}
      >
        <DialogTitle>
          <Box sx={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
            <Typography variant="h6">
              {editingTemplate ? "Edit Template" : "Create New Template"}
            </Typography>
            <IconButton onClick={() => setCreateDialogOpen(false)}>
              <CloseIcon />
            </IconButton>
          </Box>
        </DialogTitle>
        <DialogContent sx={{ p: 0 }}>
          <Box sx={{ borderBottom: 1, borderColor: "divider" }}>
            <Tabs value={currentTab} onChange={(e, v) => setCurrentTab(v)}>
              <Tab label="Basic Settings" />
              <Tab label="TutorCruncher Settings" />
              <Tab label="Brick Builder" />
            </Tabs>
          </Box>

          <TabPanel value={currentTab} index={0}>
            {renderBasicSettings()}
          </TabPanel>

          <TabPanel value={currentTab} index={1}>
            {renderTutorCruncherSettings()}
          </TabPanel>

          <TabPanel value={currentTab} index={2}>
            {renderBrickBuilder()}
          </TabPanel>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setCreateDialogOpen(false)}>Cancel</Button>
          <Button
            onClick={handleSaveTemplate}
            variant="contained"
            color="primary"
            startIcon={<SaveIcon />}
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

      {/* Duplicate Template Dialog */}
      <Dialog
        open={duplicateDialogOpen}
        onClose={() => {
          setDuplicateDialogOpen(false);
          setDuplicateTemplateName('');
          setDuplicateTemplateId(null);
        }}
        maxWidth="sm"
        fullWidth
      >
        <DialogTitle>Duplicate Template</DialogTitle>
        <DialogContent>
          <TextField
            autoFocus
            margin="dense"
            label="Template Name"
            fullWidth
            variant="outlined"
            value={duplicateTemplateName}
            onChange={(e) => setDuplicateTemplateName(e.target.value)}
            onKeyPress={(e) => {
              if (e.key === 'Enter') {
                handleDuplicateConfirm();
              }
            }}
            sx={{ mt: 1 }}
          />
        </DialogContent>
        <DialogActions>
          <Button
            onClick={() => {
              setDuplicateDialogOpen(false);
              setDuplicateTemplateName('');
              setDuplicateTemplateId(null);
            }}
          >
            Cancel
          </Button>
          <Button
            onClick={handleDuplicateConfirm}
            variant="contained"
            color="primary"
            disabled={!duplicateTemplateName.trim()}
          >
            Duplicate
          </Button>
        </DialogActions>
      </Dialog>

      <ConfirmationModal
        isOpen={confirmState.isOpen}
        onClose={() => setConfirmState(prev => ({ ...prev, isOpen: false }))}
        onConfirm={async () => {
          if (confirmState.action) await confirmState.action();
          setConfirmState(prev => ({ ...prev, isOpen: false }));
        }}
        title={confirmState.title}
        message={confirmState.message}
        confirmText={confirmState.title === 'Archive Template' ? 'Archive' : 'Restore'}
        isDestructive={confirmState.isDestructive}
      />
    </Box>
  );
}
