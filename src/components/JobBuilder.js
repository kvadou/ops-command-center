import React, { useState, useEffect, useMemo, useRef } from "react";
import axios from "axios";
import { useNavigate, useSearchParams } from "react-router-dom";
import {
  Accordion,
  AccordionDetails,
  AccordionSummary,
  Alert,
  Autocomplete,
  Avatar,
  Box,
  Button,
  Chip,
  CircularProgress,
  Dialog,
  DialogActions,
  DialogContent,
  DialogTitle,
  Divider,
  FormControl,
  FormControlLabel,
  FormHelperText,
  Grid,
  IconButton,
  InputLabel,
  MenuItem,
  Paper,
  Select,
  Snackbar,
  Step,
  StepLabel,
  Stepper,
  Switch,
  Tab,
  Tabs,
  TextField,
  Typography,
} from "@mui/material";
import {
  ChevronDownIcon,
  PlusIcon,
  TrashIcon,
  UserPlusIcon,
  ArrowPathIcon,
  PencilSquareIcon,
  ClockIcon,
  WrenchIcon,
} from '@heroicons/react/24/outline';
import BrickPreview from "./BrickPreview";
import LessonDatesCalendar from "./LessonDatesCalendar";
import DayTimeRangePicker from "./DayTimeRangePicker";

const JobBuilderHistory = React.lazy(() => import("./JobBuilderHistory"));

// Helper function to calculate contrast color (white or black) based on background color
const getContrastColor = (color) => {
  if (!color) return '#000000';
  
  // Handle named colors (CSS color names)
  const colorLower = String(color).toLowerCase().trim();
  const lightColors = ['yellow', 'gold', 'lightgreen', 'lightgray', 'lightgrey', 'blanchedalmond', 'white', '#ffffff', '#d3d3d3', '#ffebcd'];
  
  if (lightColors.includes(colorLower) || lightColors.includes(color)) {
    return '#000000'; // Use black text on light colors
  }
  
  // Handle hex colors
  if (color.startsWith('#')) {
    const hex = color.replace('#', '');
    
    // Handle short hex (3 digits)
    if (hex.length === 3) {
      const r = parseInt(hex[0] + hex[0], 16);
      const g = parseInt(hex[1] + hex[1], 16);
      const b = parseInt(hex[2] + hex[2], 16);
      const luminance = (0.299 * r + 0.587 * g + 0.114 * b) / 255;
      return luminance > 0.5 ? '#000000' : '#ffffff';
    }
    
    // Handle full hex (6 digits)
    if (hex.length === 6) {
      const r = parseInt(hex.substring(0, 2), 16);
      const g = parseInt(hex.substring(2, 4), 16);
      const b = parseInt(hex.substring(4, 6), 16);
      const luminance = (0.299 * r + 0.587 * g + 0.114 * b) / 255;
      return luminance > 0.5 ? '#000000' : '#ffffff';
    }
  }
  
  // Default to white text for unknown/named colors (assume dark background)
  return '#ffffff';
};

// Helper function to get axios instance (auth via httpOnly cookie)
const getAuthenticatedAxios = () => {
  return axios.create();
};

const steps = ["Select Template", "Fill Job Details", "Preview & Confirm"];

// Helper function to generate term/semester options
const generateTermOptions = () => {
  const options = [];
  const now = new Date();
  const currentYear = now.getFullYear();
  const currentMonth = now.getMonth(); // 0-11 (Jan = 0)
  
  // We're currently in Fall 2025, so start from Fall 2025
  // Generate terms starting from Fall 2025 and going forward
  const seasons = ["Fall", "Winter", "Spring", "Summer"];
  
  // Start from Fall 2025, then continue with Winter 2026, Spring 2026, etc.
  // Generate for 2025 (Fall only), 2026 (all seasons), 2027 (all seasons), 2028 (all seasons)
  const startYear = 2025;
  const endYear = currentYear + 3; // Show 3 years ahead
  
  for (let year = startYear; year <= endYear; year++) {
    for (const season of seasons) {
      // For 2025, only include Fall (current term)
      if (year === 2025 && season !== "Fall") {
        continue;
      }
      
      options.push(`${season} ${year}`);
    }
  }
  
  // Remove duplicates and sort chronologically by actual time period
  // Fall = Oct-Dec, Winter = Jan-Mar, Spring = Apr-Jun, Summer = Jul-Sep
  return [...new Set(options)].sort((a, b) => {
    const getYear = (term) => {
      const match = term.match(/(\d{4})/);
      return match ? parseInt(match[1]) : 0;
    };
    
    // Get the start month for chronological ordering
    // Fall (Oct-Dec) starts in month 10, Winter (Jan-Mar) starts in month 1, etc.
    const getStartMonth = (term) => {
      if (term.startsWith("Fall")) return 10; // October
      if (term.startsWith("Winter")) return 1; // January
      if (term.startsWith("Spring")) return 4; // April
      if (term.startsWith("Summer")) return 7; // July
      return 0;
    };
    
    const yearA = getYear(a);
    const yearB = getYear(b);
    const monthA = getStartMonth(a);
    const monthB = getStartMonth(b);
    
    // Create a comparable date value: year * 12 + month
    // This allows chronological sorting across years
    const dateValueA = yearA * 12 + monthA;
    const dateValueB = yearB * 12 + monthB;
    
    return dateValueA - dateValueB;
  });
};

const tutorPermissionOptions = [
  { value: "complete", label: "Tutor can only mark Lessons Complete or Cancelled" },
  { value: "edit", label: "Tutor can edit Lessons" },
  { value: "add-edit", label: "Tutor can add and edit Lessons" },
  { value: "add-edit-complete", label: "Tutor can add and edit Lessons, and change the Job status to finished" },
];

const ALLOWED_TUTOR_PERMISSIONS = new Set(tutorPermissionOptions.map((option) => option.value));

const statusOptions = [
  { value: "pending", label: "Pending" },
  { value: "available", label: "Available" },
  { value: "in-progress", label: "In Progress" },
  { value: "finished", label: "Finished" },
  { value: "gone-cold", label: "Gone Cold" },
];

export default function JobBuilder() {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const clientIdFromUrl = searchParams.get('client_id');
  const studentIdsFromUrl = searchParams.get('student_ids');
  
  const [activeStep, setActiveStep] = useState(0);
  const [templates, setTemplates] = useState([]);
  const [selectedTemplate, setSelectedTemplate] = useState(null);
  const [loading, setLoading] = useState(true);
  const [creating, setCreating] = useState(false);
  
  // Form data state
  const [formData, setFormData] = useState({
    localOnly: false // Create locally without TutorCruncher sync (for testing)
  });
  
  // Autocomplete data
  const [clients, setClients] = useState([]);
  const [recipients, setRecipients] = useState([]);
  const [contractors, setContractors] = useState([]);
  const [labels, setLabels] = useState([]);
  // State to control Labels Select dropdown open/close
  const [labelsSelectOpen, setLabelsSelectOpen] = useState(false);
  const [colours, setColours] = useState([]);
  const [loadingClients, setLoadingClients] = useState(false);
  const [loadingRecipients, setLoadingRecipients] = useState(false);
  const [loadingContractors, setLoadingContractors] = useState(false);
  
  // Preview data
  const [previewData, setPreviewData] = useState(null);
  
  // Confirmation dialog
  const [confirmDialogOpen, setConfirmDialogOpen] = useState(false);
  const [successDialogOpen, setSuccessDialogOpen] = useState(false);
  const [createdJob, setCreatedJob] = useState(null);
  
  // Snackbar
  const [snackbar, setSnackbar] = useState({ open: false, message: "", severity: "success" });

  // Add Sibling Modal
  const [addSiblingDialogOpen, setAddSiblingDialogOpen] = useState(false);
  const [addSiblingForm, setAddSiblingForm] = useState({ first_name: "", last_name: "", dob: "" });
  const [addingSibling, setAddingSibling] = useState(false);

  // Multi-client support for group lessons (different families taking group lessons together)
  const [clientStudentPairs, setClientStudentPairs] = useState([
    { client: null, students: [], recipients: [], loadingRecipients: false }
  ]);

  // Track authentication state to prevent repeated error logs and API calls
  const [authErrorShown, setAuthErrorShown] = useState(false);
  const authErrorShownRef = useRef(false); // Ref for synchronous access in timeouts

  // Track if user has manually edited the job name (to prevent auto-overwriting)
  const [isJobNameManuallyEdited, setIsJobNameManuallyEdited] = useState(false);
  
  // Debounce timer for client search
  const clientSearchTimeoutRef = useRef(null);
  
  // Debounce timer for preview generation
  const previewTimeoutRef = useRef(null);
  
  // Track if preview is currently being generated to prevent duplicate calls
  const isGeneratingPreviewRef = useRef(false);


  const colourOptions = useMemo(() => {
    const seen = new Set();
    const options = [];

    (colours || []).forEach((colour) => {
      if (!colour || (!colour.value && !colour.label)) {
        return;
      }
      // API now returns: { label: name, value: name, colorValue: displayColour, machineName }
      // Use label name as unique identifier instead of color value
      // This allows multiple labels with the same color (e.g., School - NYC, LA, SF all use orange)
      const labelName = colour.label || colour.name || colour.value;
      const uniqueKey = labelName;
      if (seen.has(uniqueKey)) {
        return;
      }
      seen.add(uniqueKey);
      options.push({
        label: labelName,
        value: labelName, // Use label name as value (API already does this)
        colorValue: colour.colorValue || colour.value, // Use colorValue from API, fallback to value for legacy
        machineName: colour.machineName || null,
        uniqueKey, // Store unique key for reference
      });
    });

    // Check if current colour exists in options by comparing with any option's value or label
    const currentColourExists = options.some(opt => 
      opt.value === formData.colour || opt.label === formData.colour
    );
    
    if (formData.colour && !currentColourExists) {
      options.push({
        label: formData.colour,
        value: formData.colour,
        colorValue: formData.colour, // Assume it's a color if legacy
        machineName: null,
        isLegacy: true,
      });
    }

    return options;
  }, [colours, formData.colour]);

  useEffect(() => {
    fetchTemplates();
    fetchLabels();
    fetchColours();
    
    // Pre-fill client if client_id is in URL
    if (clientIdFromUrl) {
      fetch(`/api/entity-details/clients/${clientIdFromUrl}`)
        .then(res => res.json())
        .then(data => {
          if (data.client) {
            const client = data.client;
            const clientOption = {
              id: client.client_id,
              name: `${client.first_name} ${client.last_name}`.trim(),
              first_name: client.first_name,
              last_name: client.last_name,
              email: client.email,
              timezone: client.timezone,
              address: [client.street, client.town, client.state, client.postcode, client.country]
                .filter(Boolean)
                .join(', ')
            };
            handleFormChange("client", clientOption);
            handleFormChange("client_name", clientOption.name);
            handleFormChange("client_full_name", clientOption.name);
            handleFormChange("client_first_name", client.first_name || "");
            handleFormChange("client_last_name", client.last_name || "");
            handleFormChange("parent_name", clientOption.name);
            handleFormChange("address", clientOption.address);
            if (client.timezone) {
              handleFormChange("timezone", client.timezone);
            }
            setClients([clientOption]);

            // Pre-fill students if student_ids are in URL
            if (studentIdsFromUrl && data.relatedStudents) {
              const studentIdArray = studentIdsFromUrl.split(',');
              const selectedStudents = data.relatedStudents.filter(student => 
                studentIdArray.includes(String(student.recipient_id))
              );
              
              if (selectedStudents.length > 0) {
                // Pre-fill first student as primary recipient
                const firstStudent = selectedStudents[0];
                handleFormChange("recipient", {
                  id: firstStudent.recipient_id,
                  name: firstStudent.recipient_name || '',
                  paying_client_id: firstStudent.paying_client_id
                });
                handleFormChange("recipient_name", firstStudent.recipient_name || "");
                setRecipients(selectedStudents.map(s => ({
                  id: s.recipient_id,
                  name: s.recipient_name || '',
                  paying_client_id: s.paying_client_id
                })));
              }
            }
          }
        })
        .catch(err => {
          console.error('Error fetching client from URL:', err);
        });
    }
    
    // Cleanup timeouts on unmount
    return () => {
      if (clientSearchTimeoutRef.current) {
        clearTimeout(clientSearchTimeoutRef.current);
      }
      if (previewTimeoutRef.current) {
        clearTimeout(previewTimeoutRef.current);
      }
    };
  }, [clientIdFromUrl, studentIdsFromUrl]);

  useEffect(() => {
    if (!selectedTemplate) return;
    if (!colourOptions.length) return;
    if (formData.colour) return;

    const firstAvailable = colourOptions.find((colour) => !colour.isLegacy) || colourOptions[0];
    if (firstAvailable) {
      setFormData((prev) => ({
        ...prev,
        colour: firstAvailable.value,
      }));
    }
  }, [colourOptions, selectedTemplate, formData.colour]);

  // Auto-select template based on client labels when templates and client are loaded
  useEffect(() => {
    if (!clientIdFromUrl || !templates.length || selectedTemplate) return;
    
    fetch(`/api/entity-details/clients/${clientIdFromUrl}`)
      .then(res => res.json())
      .then(data => {
        if (data.client && data.client.labels && Array.isArray(data.client.labels)) {
          const labelNames = data.client.labels.map(l => typeof l === 'string' ? l : (l.name || l.machine_name || '')).join(' ').toLowerCase();
          
          // Suggest job type based on labels
          if (labelNames.includes('home')) {
            const homeTemplate = templates.find(t => t.category === 'Home');
            if (homeTemplate) {
              setSelectedTemplate(homeTemplate);
            }
          } else if (labelNames.includes('online')) {
            const onlineTemplate = templates.find(t => t.category === 'Online');
            if (onlineTemplate) {
              setSelectedTemplate(onlineTemplate);
            }
          } else if (labelNames.includes('school')) {
            const schoolTemplate = templates.find(t => t.category === 'School');
            if (schoolTemplate) {
              setSelectedTemplate(schoolTemplate);
            }
          } else if (labelNames.includes('club')) {
            const clubTemplate = templates.find(t => t.category === 'Club');
            if (clubTemplate) {
              setSelectedTemplate(clubTemplate);
            }
          }
        }
      })
      .catch(err => {
        console.error('Error fetching client for template selection:', err);
      });
  }, [clientIdFromUrl, templates, selectedTemplate]);


  // Auto-set start_date from first lesson date for School category
  useEffect(() => {
    if (selectedTemplate?.category === "School" && formData.lesson_dates && Array.isArray(formData.lesson_dates) && formData.lesson_dates.length > 0) {
      const firstDate = formData.lesson_dates[0];
      if (firstDate && formData.start_date !== firstDate) {
        handleFormChange("start_date", firstDate);
      }
    }
  }, [formData.lesson_dates, selectedTemplate?.category, formData.start_date]);

  // Regenerate job title for School category when relevant fields change
  // Only auto-regenerate if user hasn't manually edited the name
  useEffect(() => {
    if (selectedTemplate?.category === "School" && selectedTemplate && formData.client && !isJobNameManuallyEdited) {
      const generatedJobName = generateJobNameFromTemplate(selectedTemplate, formData.client);
      if (generatedJobName && generatedJobName !== formData.job_title) {
        handleFormChange("job_title", generatedJobName);
      }
    }
  }, [formData.subject, formData.day_time_entries, formData.semester, formData.school_name, formData.client, selectedTemplate, isJobNameManuallyEdited]);

  // Auto-preview when form data changes (debounced to avoid too many calls)
  useEffect(() => {
    if (!selectedTemplate || activeStep !== 1) return;
    
    // Don't generate preview if we've already encountered an auth error
    if (authErrorShown || authErrorShownRef.current) {
      // Clear any pending timeout
      if (previewTimeoutRef.current) {
        clearTimeout(previewTimeoutRef.current);
        previewTimeoutRef.current = null;
      }
      return;
    }
    
    // Don't generate preview if form is empty (just selected template)
    if (!formData.job_title && Object.keys(formData).length <= 2) {
      return;
    }
    
    // Don't generate preview if one is already in progress
    if (isGeneratingPreviewRef.current) {
      return;
    }
    
    // Clear any existing timeout
    if (previewTimeoutRef.current) {
      clearTimeout(previewTimeoutRef.current);
    }
    
    // Debounce preview generation to avoid excessive API calls
    previewTimeoutRef.current = setTimeout(() => {
      // Check again inside timeout callback (refs are synchronous)
      if (authErrorShownRef.current || isGeneratingPreviewRef.current) {
        previewTimeoutRef.current = null;
        return;
      }
      
      generatePreview();
      previewTimeoutRef.current = null;
    }, 500); // Wait 500ms after user stops typing
    
    return () => {
      if (previewTimeoutRef.current) {
        clearTimeout(previewTimeoutRef.current);
        previewTimeoutRef.current = null;
      }
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [formData, selectedTemplate, activeStep, authErrorShown]);

  const fetchTemplates = async () => {
    try {
      setLoading(true);
      const api = getAuthenticatedAxios();
      const response = await api.get("/api/job-templates");
      setTemplates(response.data);
    } catch (error) {
      const errorMessage = error.response?.data?.error || error.message || "Unknown error";
      console.error("Error fetching templates:", {
        message: errorMessage,
        status: error.response?.status,
        data: error.response?.data,
        stack: error.stack
      });
      showSnackbar(`Failed to load templates: ${errorMessage}`, "error");
    } finally {
      setLoading(false);
    }
  };

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

  const searchClients = async (searchTerm) => {
    if (!searchTerm || searchTerm.length < 2) {
      setClients([]);
      return;
    }
    
    // Prevent API calls if we've already encountered an auth error
    if (authErrorShown || authErrorShownRef.current) {
      setClients([]);
      return;
    }
    
    try {
      setLoadingClients(true);
      const api = getAuthenticatedAxios();
      const response = await api.get(`/api/tutorcruncher-data/db/clients?search=${encodeURIComponent(searchTerm)}`);
      setClients(response.data.clients || []);
      // Reset auth error flag on successful call
      setAuthErrorShown(false);
      authErrorShownRef.current = false;
    } catch (error) {
      const errorMessage = error.response?.data?.error || error.message || "Unknown error";
      const status = error.response?.status;
      
      // Handle authentication errors silently after first occurrence
      if (status === 401) {
        if (!authErrorShown && !authErrorShownRef.current) {
          showSnackbar(
            "Authentication required. Please refresh the page and log in again.",
            "error"
          );
          setAuthErrorShown(true);
          authErrorShownRef.current = true;
        }
        setClients([]);
        return;
      }
      
      // Only log non-auth errors
      console.error("Error searching clients:");
      console.error("Message:", errorMessage);
      console.error("Status:", status);
      console.error("Response data:", JSON.stringify(error.response?.data || {}, null, 2));
      
      setClients([]);
      showSnackbar(`Failed to search clients: ${errorMessage}`, "error");
    } finally {
      setLoadingClients(false);
    }
  };

  const searchRecipients = async (clientId, searchTerm = "") => {
    if (!clientId) {
      setRecipients([]);
      return;
    }
    
    // Prevent API calls if we've already encountered an auth error
    if (authErrorShown || authErrorShownRef.current) {
      setRecipients([]);
      return;
    }
    
    try {
      setLoadingRecipients(true);
      const api = getAuthenticatedAxios();
      const url = `/api/tutorcruncher-data/db/clients/${clientId}/recipients${searchTerm ? `?search=${encodeURIComponent(searchTerm)}` : ""}`;
      const response = await api.get(url);
      setRecipients(response.data.recipients || []);
      // Reset auth error flag on successful call
      setAuthErrorShown(false);
      authErrorShownRef.current = false;
    } catch (error) {
      const errorMessage = error.response?.data?.error || error.message || "Unknown error";
      const errorDetails = error.response?.data || {};
      const status = error.response?.status;
      
      // Handle authentication errors silently after first occurrence
      if (status === 401) {
        if (!authErrorShown && !authErrorShownRef.current) {
          showSnackbar(
            "Authentication required. Please refresh the page and log in again.",
            "error"
          );
          setAuthErrorShown(true);
          authErrorShownRef.current = true;
        }
        setRecipients([]);
        return;
      }
      
      // Only log non-auth errors with detailed information
      console.error("Error searching recipients:");
      console.error("Message:", errorMessage);
      console.error("Status:", status);
      console.error("Response data:", JSON.stringify(errorDetails, null, 2));
      console.error("Full error:", error);
      
      setRecipients([]);
      showSnackbar(`Failed to search recipients: ${errorMessage}`, "error");
    } finally {
      setLoadingRecipients(false);
    }
  };

  // Check if template is a group template that supports multiple clients
  const isGroupTemplate = (template) => {
    if (!template) return false;
    const config = template.template_config || {};
    return config.lesson_type === "Group";
  };

  // Fetch recipients for a specific client in a client-student pair
  const searchRecipientsForPair = async (pairIndex, clientId, searchTerm = "") => {
    if (!clientId) {
      setClientStudentPairs(prev => {
        const updated = [...prev];
        updated[pairIndex] = { ...updated[pairIndex], recipients: [] };
        return updated;
      });
      return;
    }

    try {
      setClientStudentPairs(prev => {
        const updated = [...prev];
        updated[pairIndex] = { ...updated[pairIndex], loadingRecipients: true };
        return updated;
      });

      const api = getAuthenticatedAxios();
      const url = `/api/tutorcruncher-data/db/clients/${clientId}/recipients${searchTerm ? `?search=${encodeURIComponent(searchTerm)}` : ""}`;
      const response = await api.get(url);

      setClientStudentPairs(prev => {
        const updated = [...prev];
        updated[pairIndex] = {
          ...updated[pairIndex],
          recipients: response.data.recipients || [],
          loadingRecipients: false
        };
        return updated;
      });
    } catch (error) {
      console.error("Error fetching recipients for pair:", error);
      setClientStudentPairs(prev => {
        const updated = [...prev];
        updated[pairIndex] = { ...updated[pairIndex], recipients: [], loadingRecipients: false };
        return updated;
      });
    }
  };

  // Add a new client-student pair
  const addClientStudentPair = () => {
    const maxClients = selectedTemplate?.template_config?.dft_max_srs || 10;
    if (clientStudentPairs.length >= maxClients) {
      showSnackbar(`Maximum of ${maxClients} clients allowed for this template`, "warning");
      return;
    }
    setClientStudentPairs(prev => [...prev, { client: null, students: [], recipients: [], loadingRecipients: false }]);
  };

  // Remove a client-student pair
  const removeClientStudentPair = (index) => {
    if (clientStudentPairs.length <= 1) return; // Keep at least one
    // Compute the updated pairs immediately to avoid state timing issues
    const updatedPairs = clientStudentPairs.filter((_, i) => i !== index);
    setClientStudentPairs(updatedPairs);
    // Update formData with consolidated recipients using the new pairs
    setTimeout(() => updateFormDataFromPairs(updatedPairs), 0);
  };

  // Update a specific client-student pair's client
  const updatePairClient = (index, client) => {
    // Compute the updated pairs immediately to avoid state timing issues
    const updatedPairs = [...clientStudentPairs];
    updatedPairs[index] = { ...updatedPairs[index], client, students: [], recipients: [] };
    setClientStudentPairs(updatedPairs);

    // Fetch recipients for this client
    if (client?.id) {
      searchRecipientsForPair(index, client.id);
    }

    // Update job title with all client names using the new pairs
    setTimeout(() => updateJobTitleFromPairs(updatedPairs), 0);
  };

  // Update a specific client-student pair's students
  const updatePairStudents = (index, students) => {
    // Compute the updated pairs immediately so we can pass them to updateFormDataFromPairs
    const updatedPairs = [...clientStudentPairs];
    updatedPairs[index] = { ...updatedPairs[index], students };

    setClientStudentPairs(updatedPairs);

    // Update formData with the new pairs data directly (don't rely on state)
    setTimeout(() => updateFormDataFromPairs(updatedPairs), 0);
  };

  // Update formData.recipients from all client-student pairs
  // Accepts optional pairs parameter to avoid React state timing issues
  const updateFormDataFromPairs = (pairs = null) => {
    const pairsToUse = pairs || clientStudentPairs;
    const allStudents = pairsToUse.flatMap(pair => pair.students);
    handleFormChange("recipients", allStudents);

    // Update student_name field
    const studentNames = allStudents.map(s => s.name).join(", ");
    handleFormChange("student_name", studentNames);

    // Set client_name from all parent names (for group lessons)
    const clientNames = pairsToUse
      .filter(pair => pair.client?.name)
      .map(pair => pair.client.name)
      .join(", ");
    handleFormChange("client_name", clientNames);
    handleFormChange("parent_name", clientNames);
    handleFormChange("client_full_name", clientNames);

    // Set address from first client with address
    const firstClientWithAddress = pairsToUse.find(pair => pair.client?.address);
    if (firstClientWithAddress) {
      handleFormChange("address", firstClientWithAddress.client.address);
    }

    // Set children_info with names and ages
    const calculateAge = (dob) => {
      if (!dob) return null;
      try {
        const birthDate = new Date(dob);
        if (isNaN(birthDate.getTime())) return null;
        const today = new Date();
        let age = today.getFullYear() - birthDate.getFullYear();
        const monthDiff = today.getMonth() - birthDate.getMonth();
        if (monthDiff < 0 || (monthDiff === 0 && today.getDate() < birthDate.getDate())) {
          age--;
        }
        return age;
      } catch (e) {
        return null;
      }
    };
    const childrenInfo = allStudents
      .map(s => {
        const age = s.dob ? calculateAge(s.dob) : (s.age ? parseInt(s.age) : null);
        return age ? `${s.name} - (Age: ${age})` : s.name;
      })
      .join(", ");
    handleFormChange("children_info", childrenInfo);

    // Update job title
    updateJobTitleFromPairs(pairsToUse);
  };

  // Update job title to include all client last names
  // Only auto-update if user hasn't manually edited the name
  // Accepts optional pairs parameter to avoid React state timing issues
  const updateJobTitleFromPairs = (pairs = null) => {
    if (!selectedTemplate || !isGroupTemplate(selectedTemplate)) return;
    if (isJobNameManuallyEdited) return; // Don't override manual edits

    const pairsToUse = pairs || clientStudentPairs;
    const clientsWithData = pairsToUse.filter(pair => pair.client?.last_name);
    if (clientsWithData.length === 0) return;

    const config = selectedTemplate.template_config || {};
    const category = selectedTemplate.category;
    const subject = config.subject || formData.subject || "Chess";

    // Build job title: "LastName1 / LastName2 - Subject - Category - Group"
    const allLastNames = clientsWithData
      .map(pair => pair.client.last_name)
      .join(" / ");

    // Add TRIAL prefix if is_trial is true
    const trialPrefix = formData.is_trial ? "TRIAL - " : "";
    const jobTitle = `${trialPrefix}${allLastNames} - ${subject} - ${category} - Group`;
    handleFormChange("job_title", jobTitle);
  };

  // Reset client-student pairs when template changes
  const resetClientStudentPairs = () => {
    setClientStudentPairs([{ client: null, students: [], recipients: [], loadingRecipients: false }]);
  };

  const searchContractors = async (searchTerm) => {
    if (!searchTerm || searchTerm.length < 2) return;
    
    // Prevent API calls if we've already encountered an auth error
    if (authErrorShown || authErrorShownRef.current) {
      setContractors([]);
      return;
    }
    
    try {
      setLoadingContractors(true);
      const api = getAuthenticatedAxios();
      const response = await api.get(`/api/tutorcruncher-data/contractors?search=${searchTerm}`);
      setContractors(response.data.contractors || []);
      // Reset auth error flag on successful call
      setAuthErrorShown(false);
      authErrorShownRef.current = false;
    } catch (error) {
      const status = error.response?.status;
      
      // Handle authentication errors silently after first occurrence
      if (status === 401) {
        if (!authErrorShown && !authErrorShownRef.current) {
          showSnackbar(
            "Authentication required. Please refresh the page and log in again.",
            "error"
          );
          setAuthErrorShown(true);
          authErrorShownRef.current = true;
        }
        setContractors([]);
        return;
      }
      
      // Only log non-auth errors
      console.error("Error searching contractors:", error);
      setContractors([]);
    } finally {
      setLoadingContractors(false);
    }
  };

  const generatePreview = async () => {
    if (!selectedTemplate) return;

    // Prevent API calls if we've already encountered an auth error
    if (authErrorShown || authErrorShownRef.current) {
      return;
    }

    // Prevent duplicate concurrent calls
    if (isGeneratingPreviewRef.current) {
      return;
    }

    // Mark as generating to prevent duplicate calls
    isGeneratingPreviewRef.current = true;

    try {
      const api = getAuthenticatedAxios();
      const response = await api.post("/api/job-builder/preview", {
        templateId: selectedTemplate.id,
        formData,
      });
      setPreviewData(response.data);
      // Reset auth error flag on successful call
      setAuthErrorShown(false);
      authErrorShownRef.current = false;
    } catch (error) {
      // Log detailed error information
      const errorMessage = error.response?.data?.error || error.message || "Unknown error";
      const errorDetails = error.response?.data || {};
      const status = error.response?.status;
      
      // Handle authentication errors
      if (status === 401) {
        if (!authErrorShown && !authErrorShownRef.current) {
          console.error("Authentication failed - token may be expired or invalid");
          showSnackbar(
            "Authentication required. Please refresh the page and log in again.",
            "error"
          );
          setAuthErrorShown(true);
          authErrorShownRef.current = true;
          
          // Clear any pending preview timeouts to prevent further API calls
          if (previewTimeoutRef.current) {
            clearTimeout(previewTimeoutRef.current);
            previewTimeoutRef.current = null;
          }
        }
        // Don't retry preview generation if auth failed
        return;
      }
      
      // Only log non-auth errors
      console.error("Error generating preview:");
      console.error("Message:", errorMessage);
      console.error("Status:", status);
      console.error("Response data:", JSON.stringify(errorDetails, null, 2));
      
      // Only show error if it's not a validation error (those are expected during form filling)
      if (status !== 400) {
        showSnackbar(
          `Failed to generate preview: ${errorMessage}`,
          "error"
        );
      }
    } finally {
      // Always reset the generating flag
      isGeneratingPreviewRef.current = false;
    }
  };

  const showSnackbar = (message, severity = "success") => {
    setSnackbar({ open: true, message, severity });
  };

  const handleCloseSnackbar = () => {
    setSnackbar({ ...snackbar, open: false });
  };

  // Handle adding a new sibling
  const handleAddSibling = async () => {
    if (!formData.client?.id) {
      showSnackbar("Please select a client first", "error");
      return;
    }

    if (!addSiblingForm.first_name.trim() || !addSiblingForm.last_name.trim()) {
      showSnackbar("First name and last name are required", "error");
      return;
    }

    setAddingSibling(true);
    try {
      const response = await fetch("/api/entity-lists/students", {
        method: "POST",
        credentials: 'include',
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          first_name: addSiblingForm.first_name.trim(),
          last_name: addSiblingForm.last_name.trim(),
          date_of_birth: addSiblingForm.dob || "",
          client_id: formData.client.id,
          calendar_colour: "#D2B48C",
          receive_sms: true,
          received_notifications: JSON.stringify(["broadcasts", "apt_reminders", "lesson_scheduled"]),
        }),
      });

      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.error || data.details || "Failed to create student");
      }

      // Close dialog and reset form
      setAddSiblingDialogOpen(false);
      setAddSiblingForm({ first_name: "", last_name: "", dob: "" });
      showSnackbar(`Student "${addSiblingForm.first_name} ${addSiblingForm.last_name}" added successfully!`, "success");

      // Refresh recipients list and auto-select the new student
      if (formData.client?.id) {
        await searchRecipients(formData.client.id);

        // Wait a moment for the recipients to update, then auto-select the new sibling
        setTimeout(() => {
          setRecipients((currentRecipients) => {
            const newSibling = currentRecipients.find(
              (r) =>
                r.first_name?.toLowerCase() === addSiblingForm.first_name.trim().toLowerCase() &&
                r.last_name?.toLowerCase() === addSiblingForm.last_name.trim().toLowerCase()
            );
            if (newSibling) {
              const currentRecipientsList = formData.recipients || [];
              const updatedRecipients = [...currentRecipientsList, newSibling];
              handleFormChange("recipients", updatedRecipients);
              const studentNames = updatedRecipients.map((r) => r.name).join(", ");
              handleFormChange("student_name", studentNames);
            }
            return currentRecipients;
          });
        }, 500);
      }
    } catch (error) {
      console.error("Error adding sibling:", error);
      showSnackbar(error.message || "Failed to add student", "error");
    } finally {
      setAddingSibling(false);
    }
  };

  const validateJobForm = () => {
    const errors = [];
    // Job Name and Label validation removed - these fields are auto-populated from template

    // Validation for group templates with multiple clients
    if (isGroupTemplate(selectedTemplate)) {
      const hasStudents = clientStudentPairs.some(pair => pair.students.length > 0);
      if (!hasStudents) {
        errors.push("Please select at least one client and student for the group lesson.");
      }

      // Consolidate clientStudentPairs into formData for submission
      const allStudents = clientStudentPairs.flatMap(pair => pair.students);
      const firstClientWithData = clientStudentPairs.find(pair => pair.client);

      if (firstClientWithData) {
        handleFormChange("client", firstClientWithData.client);
      }
      handleFormChange("recipients", allStudents);

      // Update student_name for preview/title
      const studentNames = allStudents.map(s => s.name).join(", ");
      handleFormChange("student_name", studentNames);
    }

    return errors;
  };

  // Function to generate job name from template pattern
  const generateJobNameFromTemplate = (template, client, studentNameOverride = null) => {
    const config = template.template_config || {};
    const jobNameTemplate = config.job_name_template || config.job_title || "";
    const category = template.category;
    
    // For School category without template pattern or client, use dynamic generation
    if (category === "School" && (!jobNameTemplate || !client)) {
      return generateJobTitleForSchool(formData);
    }
    
    if (!jobNameTemplate || !client) {
      return config.job_title || template.name || "";
    }

    // Extract student first name if available
    // Use override parameter if provided, otherwise use formData.student_name
    const studentNameToUse = studentNameOverride !== null ? studentNameOverride : formData.student_name;
    let studentFirstName = "";
    if (studentNameToUse) {
      // Handle comma-separated names (multiple students) - take first student's first name
      const firstStudent = studentNameToUse.split(",")[0].trim();
      studentFirstName = firstStudent.split(/\s+/)[0]; // Get first name only
    }

    // Check if this is a siblings template (don't add student name for siblings)
    const isSiblingsTemplate = jobNameTemplate.toLowerCase().includes("siblings") ||
                               (template.name && template.name.toLowerCase().includes("siblings"));

    // Replace placeholders in the template pattern
    // First normalize underscores to spaces for consistent matching
    let jobName = jobNameTemplate.replace(/_/g, " ");

    jobName = jobName
      .replace(/Client First Name/gi, client.first_name || "")
      .replace(/Client Last Name/gi, client.last_name || "")
      .replace(/Client Name/gi, client.name || `${client.first_name || ""} ${client.last_name || ""}`.trim())
      .replace(/Student First Name/gi, isSiblingsTemplate ? "" : (studentFirstName || ""))
      .replace(/\(Student First Name\)/gi, isSiblingsTemplate ? "" : (studentFirstName ? `(${studentFirstName})` : ""));

    // For School category, replace Subject, Term, and Day Time placeholders
    if (category === "School") {
      // Replace Subject placeholder
      const subject = formData.subject || "";
      jobName = jobName.replace(/Subject/gi, subject);
      
      // Replace Term placeholder (use semester field)
      const term = formData.semester || formData.term || "";
      jobName = jobName.replace(/Term/gi, term);
      
      // Replace Day Time placeholder with formatted day/time
      let dayTimeStr = "";
      if (formData.day_time_entries && Array.isArray(formData.day_time_entries) && formData.day_time_entries.length > 0) {
        const dayTimeEntry = formData.day_time_entries.find(entry => entry.day && entry.start_time);
        if (dayTimeEntry) {
          // Format start time from 24-hour to 12-hour format
          const formatTime = (timeStr) => {
            if (!timeStr) return "";
            const [hours, minutes] = timeStr.split(":");
            const hour = parseInt(hours, 10);
            const hour12 = hour % 12 || 12;
            const amPm = hour < 12 ? "AM" : "PM";
            return `${hour12}:${minutes} ${amPm}`;
          };
          
          // Convert day name to plural (e.g., "Monday" -> "Mondays")
          const pluralizeDay = (day) => {
            if (!day) return "";
            const dayMap = {
              "Monday": "Mondays",
              "Tuesday": "Tuesdays",
              "Wednesday": "Wednesdays",
              "Thursday": "Thursdays",
              "Friday": "Fridays",
              "Saturday": "Saturdays",
              "Sunday": "Sundays"
            };
            return dayMap[day] || `${day}s`;
          };
          
          const startTime = formatTime(dayTimeEntry.start_time);
          const pluralDay = pluralizeDay(dayTimeEntry.day);
          dayTimeStr = `${pluralDay} ${startTime}`;
        }
      } else if (formData.day_of_week && formData.time) {
        dayTimeStr = formData.time;
      }
      jobName = jobName.replace(/Day Time/gi, dayTimeStr);
    }

    // Clean up any double spaces
    jobName = jobName.replace(/\s+/g, " ").trim();

    // Handle empty parentheses () - replace with student name if available (but NOT for siblings templates)
    if (studentFirstName && !isSiblingsTemplate && jobName.includes("()")) {
      jobName = jobName.replace("()", `(${studentFirstName})`);
    }

    // If template doesn't include student name placeholder but student is available,
    // append it in parentheses (backward compatibility) - but NOT for siblings templates
    if (studentFirstName && !isSiblingsTemplate && !jobName.includes(`(${studentFirstName})`) && !jobNameTemplate.includes("Student First Name") && !jobNameTemplate.includes("()")) {
      jobName = `${jobName} (${studentFirstName})`;
    }

    return jobName || config.job_title || template.name || "";
  };

  // Helper function to generate job title for School category (used when no template pattern)
  const generateJobTitleForSchool = (formData) => {
    // Format day and time from day_time_entries if available
    let dayTimeStr = "";
    if (formData.day_time_entries && Array.isArray(formData.day_time_entries) && formData.day_time_entries.length > 0) {
      const dayTimeEntry = formData.day_time_entries.find(entry => entry.day && entry.start_time);
      if (dayTimeEntry) {
        // Format start time from 24-hour to 12-hour format
        const formatTime = (timeStr) => {
          if (!timeStr) return "";
          const [hours, minutes] = timeStr.split(":");
          const hour = parseInt(hours, 10);
          const hour12 = hour % 12 || 12;
          const amPm = hour < 12 ? "AM" : "PM";
          return `${hour12}:${minutes} ${amPm}`;
        };
        
        // Convert day name to plural (e.g., "Monday" -> "Mondays")
        const pluralizeDay = (day) => {
          if (!day) return "";
          const dayMap = {
            "Monday": "Mondays",
            "Tuesday": "Tuesdays",
            "Wednesday": "Wednesdays",
            "Thursday": "Thursdays",
            "Friday": "Fridays",
            "Saturday": "Saturdays",
            "Sunday": "Sundays"
          };
          return dayMap[day] || `${day}s`;
        };
        
        const startTime = formatTime(dayTimeEntry.start_time);
        const pluralDay = pluralizeDay(dayTimeEntry.day);
        dayTimeStr = `${pluralDay} ${startTime}`;
      }
    } else if (formData.day_of_week && formData.time) {
      dayTimeStr = formData.time;
    }
    
    return `${formData.school_name || ""} // ${formData.subject || "Subject"} // ${formData.semester || ""} // ${dayTimeStr || "Day Time"}`;
  };

  const handleSelectTemplate = (template) => {
    setSelectedTemplate(template);
    const config = template.template_config || {};

    // Reset manual job name edit flag when switching templates
    setIsJobNameManuallyEdited(false);

    // Reset multi-client state when changing templates
    resetClientStudentPairs();
    const autoInvoiceEnabled = config.auto_invoice ?? false;

    // Map template color to TutorCruncher label value
    // Template stores color names like "Gold", "mediumorchid", etc.
    // TutorCruncher labels have displayColour values (from job-labels.json) that need to match
    // The colours array contains { label, value, machineName } where value is the displayColour
    let mappedColour = config.colour || "";
    if (mappedColour && colours && colours.length > 0) {
      const templateColorLower = mappedColour.toLowerCase().trim();
      
      // Try to find a matching TutorCruncher label by color value (case-insensitive)
      // The value field contains the displayColour from job-labels.json (can be hex or color name)
      const matchingColour = colours.find((c) => {
        if (!c.value) return false;
        const labelColorLower = c.value.toLowerCase().trim();
        
        // Direct match (case-insensitive)
        if (labelColorLower === templateColorLower) return true;
        
        // Match with # prefix
        if (labelColorLower === `#${templateColorLower}` || templateColorLower === `#${labelColorLower}`) return true;
        
        // Common color name variations
        const colorVariations = {
          "gold": ["gold", "#ffd700", "#ffd700"],
          "mediumorchid": ["mediumorchid", "medium orchid", "#ba55d3"],
          "dodgerblue": ["dodgerblue", "dodger blue", "#1e90ff"],
          "lightgreen": ["lightgreen", "light green", "#90ee90"],
          "blanchedalmond": ["blanchedalmond", "blanched almond", "#ffebcd"],
        };
        
        const variations = colorVariations[templateColorLower];
        if (variations && variations.some(v => labelColorLower === v.toLowerCase())) {
          return true;
        }
        
        return false;
      });
      
      if (matchingColour && matchingColour.value) {
        mappedColour = matchingColour.value;
      }
      // If no match found, keep the original value (it will show as legacy in the dropdown)
    }

    setFormData({
      job_title: config.job_title || template.name || "",
      job_name_template: config.job_name_template || config.job_title || "", // Store template pattern
      colour: mappedColour,
      dft_charge_rate: config.dft_charge_rate ?? "",
      dft_charge_type: config.dft_charge_type || "hourly",
      dft_contractor_rate: config.dft_contractor_rate ?? "",
      dft_max_srs: config.dft_max_srs ?? "",
      duration: config.duration ?? "",
      lesson_type: config.lesson_type ?? "",
      subject: config.subject || "", // Auto-populate subject from template
      timezone: config.timezone || "America/New_York", // Default to EST
      dft_contractor_permissions: ALLOWED_TUTOR_PERMISSIONS.has(config.dft_contractor_permissions)
        ? config.dft_contractor_permissions
        : "add-edit-complete",
      cap: config.cap ?? "",
      extra_fee_per_apt: config.extra_fee_per_apt ?? "",
      require_rcr: config.require_rcr ?? false,
      require_con_job: config.require_con_job ?? false,
      inactivity_time: config.inactivity_time ?? "",
      review_units: config.review_units ?? "",
      report_required: autoInvoiceEnabled ? true : (config.report_required ?? true),
      net_gross: config.net_gross || "gross",
      sales_codes: config.sales_codes ?? "",
      branch_tax_setup: config.branch_tax_setup || "Default Company Tax (no tax)",
      contractor_tax_setup: config.contractor_tax_setup || "Default Tutor Tax (no tax)",
      auto_invoice: autoInvoiceEnabled,
      status: "in-progress",
      labels: config.labels || [], // Auto-populate labels from template
      day_time_entries: [{ day: "", start_time: "", end_time: "" }], // Initialize day/time entries
      lesson_dates: [], // Initialize lesson dates array
    });
    setActiveStep(1);
  };

  const handleNext = () => {
    if (activeStep === 1) {
      const errors = validateJobForm();
      if (errors.length > 0) {
        showSnackbar(errors.join(" "), "error");
        return;
      }
      generatePreview();
    }
    setActiveStep((prev) => prev + 1);
  };

  const handleBack = () => {
    setActiveStep((prev) => prev - 1);
  };

  const handleFormChange = (field, value) => {
    setFormData((prev) => ({
      ...prev,
      [field]: value,
    }));
  };

  const handleCreateJob = async () => {
    setConfirmDialogOpen(false);
    setCreating(true);

    try {
      // Log form data before sending to debug colour and auto_invoice issues
      console.log('[JobBuilder] Submitting job with formData:', {
        colour: formData.colour,
        auto_invoice: formData.auto_invoice,
        hasColour: formData.hasOwnProperty('colour'),
        hasAutoInvoice: formData.hasOwnProperty('auto_invoice'),
        allKeys: Object.keys(formData)
      });
      
      const api = getAuthenticatedAxios();
      const response = await api.post("/api/job-builder/create", {
        templateId: selectedTemplate.id,
        formData,
      });

      setCreatedJob(response.data);
      setSuccessDialogOpen(true);
      const successMessage = formData.localOnly 
        ? "Job created successfully (local only)!" 
        : "Job created successfully in TutorCruncher!";
      showSnackbar(successMessage, "success");
      
      // Auto-open the job in TutorCruncher in a new tab (only if not local-only)
      if (!formData.localOnly && response.data?.service?.id) {
        const jobUrl = `https://account.acmeops.com/cal/service/${response.data.service.id}/`;
        setTimeout(() => {
          window.open(jobUrl, '_blank', 'noopener,noreferrer');
        }, 500); // Small delay to ensure dialog is visible first
      }
      
      // Reset form
      setTimeout(() => {
        setActiveStep(0);
        setSelectedTemplate(null);
        setFormData({});
        setPreviewData(null);
      }, 2000);
    } catch (error) {
      const errorMessage = error.response?.data?.error || error.message || "Unknown error";
      const errorCode = error.response?.data?.code || error.code;
      const errorDetails = error.response?.data?.details || error.details;
      
      // Log detailed error information
      console.error("Error creating job:", errorMessage);
      console.error("Error details:", JSON.stringify({
        message: errorMessage,
        code: errorCode,
        status: error.response?.status,
        statusText: error.response?.statusText,
        data: error.response?.data,
        details: errorDetails,
        stack: error.stack
      }, null, 2));
      
      // Also log the raw error object for debugging
      console.error("Raw error object:", error);
      if (error.response) {
        console.error("Response data:", error.response.data);
        console.error("Response status:", error.response.status);
      }
      
      // Show user-friendly error message with validation details
      let displayMessage = errorMessage;
      
      // Include TutorCruncher validation errors if available
      if (errorDetails && typeof errorDetails === 'object') {
        // Format field-specific errors
        const fieldErrors = Object.entries(errorDetails)
          .filter(([key]) => key !== 'detail' && key !== 'error')
          .map(([field, errors]) => {
            const errorText = Array.isArray(errors) ? errors.join(', ') : String(errors);
            return `${field}: ${errorText}`;
          });
        
        if (fieldErrors.length > 0) {
          displayMessage = `${errorMessage}\n\nValidation errors:\n${fieldErrors.join('\n')}`;
        } else if (errorDetails.non_field_errors) {
          const nonFieldErrors = Array.isArray(errorDetails.non_field_errors) 
            ? errorDetails.non_field_errors.join(', ')
            : errorDetails.non_field_errors;
          displayMessage = `${errorMessage}\n\n${nonFieldErrors}`;
        }
      }
      
      if (errorCode && !displayMessage.includes(errorCode)) {
        displayMessage = `${displayMessage} (${errorCode})`;
      }
      
      showSnackbar(
        displayMessage || "Failed to create job. Please try again.",
        "error"
      );
      
      // Offer to save as draft
      if (error.response?.data?.shouldSaveDraft) {
        handleSaveDraft();
      }
    } finally {
      setCreating(false);
    }
  };

  const handleSaveDraft = async () => {
    try {
      const api = getAuthenticatedAxios();
      await api.post("/api/job-builder/save-draft", {
        templateId: selectedTemplate.id,
        formData,
        jobTitle: previewData?.jobTitle,
        jobDescription: previewData?.jobDescription,
      });
      showSnackbar("Draft saved successfully", "info");
    } catch (error) {
      const errorMessage = error.response?.data?.error || error.message || "Unknown error";
      console.error("Error saving draft:", {
        message: errorMessage,
        status: error.response?.status,
        data: error.response?.data,
        stack: error.stack
      });
      showSnackbar(`Failed to save draft: ${errorMessage}`, "error");
    }
  };

  const renderTemplateSelection = () => (
    <Box>
      <Box sx={{ mb: 3 }}>
        <Typography variant="h6" gutterBottom>
          Select a Job Template
        </Typography>
        <Typography variant="body2" color="textSecondary">
          Choose a template to quickly create a new job with pre-configured settings
        </Typography>
      </Box>
      
      {loading ? (
        <Box sx={{ display: "flex", justifyContent: "center", p: 4 }}>
          <CircularProgress />
        </Box>
      ) : templates.length === 0 ? (
        <Alert severity="info">
          No templates available. Please contact your administrator to create job templates.
        </Alert>
      ) : (
        <Grid container spacing={3}>
          {templates.map((template) => (
            <Grid item xs={12} sm={6} md={4} lg={3} key={template.id}>
              <Paper
                sx={{
                  p: 3,
                  cursor: "pointer",
                  border: "2px solid transparent",
                  transition: "all 0.2s ease-in-out",
                  height: "100%",
                  display: "flex",
                  flexDirection: "column",
                  "&:hover": {
                    border: "2px solid #1976d2",
                    boxShadow: 4,
                    transform: "translateY(-2px)",
                  },
                }}
                onClick={() => handleSelectTemplate(template)}
              >
                <Box sx={{ flexGrow: 1 }}>
                  <Box sx={{ display: "flex", alignItems: "center", mb: 2 }}>
                    <Avatar
                      sx={{
                        width: 40,
                        height: 40,
                        mr: 2,
                        bgcolor: getCategoryColor(template.category),
                      }}
                    >
                      {getCategoryIcon(template.category)}
                    </Avatar>
                    <Box>
                      <Typography variant="h6" sx={{ fontSize: "1.1rem" }}>
                        {template.name}
                      </Typography>
                      <Typography variant="caption" color="textSecondary">
                        v{template.version}
                      </Typography>
                    </Box>
                  </Box>
                  
                  <Typography variant="body2" color="textSecondary" sx={{ mb: 2, minHeight: 40 }}>
                    {template.description || "No description available"}
                  </Typography>
                  
                  <Box sx={{ display: "flex", flexWrap: "wrap", gap: 1 }}>
                    <Chip 
                      label={template.category} 
                      size="small" 
                      color="primary" 
                      variant="outlined"
                    />
                    {template.brick_enabled && (
                      <Chip 
                        label="Brick Enabled" 
                        size="small" 
                        color="success"
                        variant="outlined"
                      />
                    )}
                  </Box>
                </Box>
              </Paper>
            </Grid>
          ))}
        </Grid>
      )}
    </Box>
  );

  const getCategoryColor = (category) => {
    const colors = {
      Home: "#4CAF50",
      Club: "#2196F3", 
      School: "#FF9800",
      Community: "#9C27B0",
      Online: "#607D8B",
    };
    return colors[category] || "#757575";
  };

  const getCategoryIcon = (category) => {
    const icons = {
      Home: "🏠",
      Club: "👥",
      School: "🏫",
      Community: "🌍",
      Online: "💻",
    };
    return icons[category] || "📋";
  };

  // Extract unique variables from brick layout to generate form fields
  const getFieldsFromBrickLayout = (brickLayout) => {
    if (!brickLayout || !Array.isArray(brickLayout)) return [];
    
    const fieldMap = new Map();
    const category = selectedTemplate?.category;
    
    brickLayout.forEach((element) => {
      if (element.type === "variable" && element.key) {
        // Handle custom_field - but skip address-related ones for Online category
        if (element.key === "custom_field") {
          if (element.customText) {
            // For Online category, skip address-related custom fields
            if (category === "Online" && element.customText.toLowerCase().includes("address")) {
              return; // Skip address custom fields for Online lessons
            }
            
            // Custom field with text - create a field for it
            if (!fieldMap.has("custom_field")) {
              fieldMap.set("custom_field", {
                key: "custom_field",
                label: "Custom Field",
                type: "text",
                defaultValue: element.customText,
                required: false,
              });
            }
          }
          return;
        }
        
        // For Online category, skip address variable
        if (category === "Online" && element.key === "address") {
          return;
        }
        
        // Map brick variable to form field
        if (!fieldMap.has(element.key)) {
          const variableInfo = {
            key: element.key,
            label: element.label || element.key,
            type: "text", // Default to text
            required: false,
            prefix: element.prefix,
            suffix: element.suffix,
          };
          
          // Determine field type based on variable key
          if (element.key.includes("date")) {
            variableInfo.type = "date";
          } else if (element.key === "timezone") {
            variableInfo.type = "timezone";
          } else if (element.key === "day_of_week") {
            variableInfo.type = "day_of_week";
          } else if (element.key === "time") {
            variableInfo.type = "time";
          } else if (element.key.includes("time") && element.key !== "timezone") {
            variableInfo.type = "time";
          } else if (element.key === "number_of_students") {
            variableInfo.type = "number";
          }
          
          fieldMap.set(element.key, variableInfo);
        }
      }
    });
    
    return Array.from(fieldMap.values());
  };


  // Day name matching for autocomplete
  const dayNames = [
    "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday", "Sunday"
  ];
  const dayAbbreviations = {
    "mon": "Monday", "tue": "Tuesday", "wed": "Wednesday", "thu": "Thursday",
    "fri": "Friday", "sat": "Saturday", "sun": "Sunday",
    "m": "Monday", "t": "Tuesday", "w": "Wednesday", "th": "Thursday",
    "f": "Friday", "s": "Saturday", "su": "Sunday"
  };

  // Parse bulk entry like "Mon 3:30 PM" or "Monday 3:30 PM"
  const parseBulkEntry = (text) => {
    if (!text) return { day: "", time: "" };
    const trimmed = text.trim();
    
    // Try to match day name or abbreviation at start
    let day = "";
    let timeStr = trimmed;
    
    for (const [abbr, fullDay] of Object.entries(dayAbbreviations)) {
      if (trimmed.toLowerCase().startsWith(abbr.toLowerCase())) {
        day = fullDay;
        timeStr = trimmed.substring(abbr.length).trim();
        break;
      }
    }
    
    // If no day found, check if it starts with a day name
    if (!day) {
      for (const dayName of dayNames) {
        if (trimmed.toLowerCase().startsWith(dayName.toLowerCase())) {
          day = dayName;
          timeStr = trimmed.substring(dayName.length).trim();
          break;
        }
      }
    }
    
    return { day, time: timeStr };
  };

  // Convert 24-hour time (HH:mm) to 12-hour format (hh:mm AM/PM)
  const formatTime12 = (time24) => {
    if (!time24) return "";
    const [hours, minutes] = time24.split(':').map(Number);
    const hour12 = hours % 12 || 12;
    const amPm = hours < 12 ? 'AM' : 'PM';
    return `${String(hour12).padStart(2, '0')}:${String(minutes).padStart(2, '0')} ${amPm}`;
  };

  // Parse 12-hour time (hh:mm AM/PM) to 24-hour format (HH:mm)
  const parseTime12 = (time12) => {
    if (!time12) return "";
    const match = time12.match(/(\d{1,2}):(\d{2})\s*(AM|PM)/i);
    if (!match) return "";
    let [, hour, minute, period] = match;
    let hour24 = parseInt(hour, 10);
    if (period.toUpperCase() === 'PM' && hour24 !== 12) hour24 += 12;
    if (period.toUpperCase() === 'AM' && hour24 === 12) hour24 = 0;
    // Round minute to nearest 5-minute increment
    const minuteNum = parseInt(minute, 10);
    const roundedMinute = Math.round(minuteNum / 5) * 5;
    return `${String(hour24).padStart(2, '0')}:${String(roundedMinute).padStart(2, '0')}`;
  };

  // Generate time slots like LessonDatesCalendar (5-minute increments, 12:00 AM to 11:55 PM)
  const generateTimeSlots = () => {
    const times = [];
    // Generate all 24 hours in 5-minute increments
    for (let h = 0; h < 24; h++) {
      for (let m = 0; m < 60; m += 5) {
        const hour12 = h % 12 || 12;
        const amPm = h < 12 ? "AM" : "PM";
        const formattedTime = `${String(hour12).padStart(2, "0")}:${String(m).padStart(2, "0")} ${amPm}`;
        times.push(formattedTime);
      }
    }
    return times;
  };

  const timeSlots = useMemo(() => generateTimeSlots(), []);
  
  // Convert 12-hour time string to 24-hour format (HH:mm)
  const convertTimeTo24Hour = (timeStr) => {
    if (!timeStr || timeStr === '-') return null;
    const [time, period] = timeStr.split(' ');
    const [hour, minute] = time.split(':');
    let h24 = parseInt(hour);
    if (period === 'PM' && h24 !== 12) h24 += 12;
    if (period === 'AM' && h24 === 12) h24 = 0;
    return `${String(h24).padStart(2, '0')}:${minute}`;
  };
  
  // Convert 24-hour format to 12-hour format for display
  const convert24To12Hour = (time24) => {
    if (!time24) return '';
    const [hours, minutes] = time24.split(':').map(Number);
    const hour12 = hours % 12 || 12;
    const amPm = hours < 12 ? 'AM' : 'PM';
    return `${String(hour12).padStart(2, '0')}:${String(minutes).padStart(2, '0')} ${amPm}`;
  };
  
  // Get available end times based on start time (minimum 5 minutes later)
  const getAvailableEndTimes = (startTime, slots) => {
    if (!startTime || startTime === '-') return slots;
    const startIndex = slots.indexOf(startTime);
    if (startIndex === -1) return slots;
    // Return times starting 1 slot (5 minutes) after the start time
    return slots.slice(startIndex + 1);
  };

  // Time Selector Component - Using native HTML5 time input
  const TimeSelector = ({ startValue, endValue, onStartChange, onEndChange, index }) => {
    const handleStartChange = (e) => {
      const time24 = e.target.value; // Already in HH:mm format
      if (time24) {
        onStartChange(time24);
        // Reset end time if it's before the new start time
        if (endValue) {
          const [endHours, endMinutes] = endValue.split(':').map(Number);
          const [startHours, startMinutes] = time24.split(':').map(Number);
          const endTotal = endHours * 60 + endMinutes;
          const startTotal = startHours * 60 + startMinutes;
          if (endTotal <= startTotal) {
            onEndChange('');
          }
        }
      } else {
        onStartChange('');
      }
    };

    const handleEndChange = (e) => {
      const time24 = e.target.value; // Already in HH:mm format
      if (time24) {
        onEndChange(time24);
      } else {
        onEndChange('');
      }
    };

    return (
      <Box sx={{ display: 'flex', gap: 2, alignItems: 'center', flexWrap: 'wrap' }}>
        <TextField
          label="Start Time"
          type="time"
          value={startValue || ''}
          onChange={handleStartChange}
          size="small"
          sx={{ minWidth: 160 }}
          InputLabelProps={{ shrink: true }}
          inputProps={{
            step: 300, // 5 minutes in seconds
          }}
        />

        <Typography variant="body2" sx={{ color: 'text.secondary' }}>to</Typography>

        <TextField
          label="End Time"
          type="time"
          value={endValue || ''}
          onChange={handleEndChange}
          disabled={!startValue}
          size="small"
          sx={{ minWidth: 160 }}
          InputLabelProps={{ shrink: true }}
          inputProps={{
            step: 300, // 5 minutes in seconds
          }}
        />
      </Box>
    );
  };

  // Reusable function to render the Day & Time picker (always shown for all categories)
  const renderDayTimePicker = (category) => {
    const dayTimeEntries = formData.day_time_entries || [{ day: "", start_time: "", end_time: "" }];
    const lessonDates = formData.lesson_dates || [];
    
    const handleDayTimeChange = (index, fieldName, value) => {
      const updated = [...dayTimeEntries];
      updated[index] = { ...updated[index], [fieldName]: value };
      handleFormChange("day_time_entries", updated);
      // Also update individual fields for backward compatibility
      if (fieldName === "day") {
        handleFormChange("day_of_week", value);
      }
      // For backward compatibility, also set time to start_time
      if (fieldName === "start_time") {
        handleFormChange("time", value);
      }
    };

    const handleBulkEntry = (index, text) => {
      const parsed = parseBulkEntry(text);
      if (parsed.day) {
        handleDayTimeChange(index, "day", parsed.day);
      }
      if (parsed.time) {
        const time24 = parseTime12(parsed.time);
        if (time24) {
          handleDayTimeChange(index, "start_time", time24);
        }
      }
    };
    
    const handleAddDayTime = () => {
      if (dayTimeEntries.length < 5) {
        handleFormChange("day_time_entries", [...dayTimeEntries, { day: "", start_time: "", end_time: "" }]);
      }
    };
    
    const handleRemoveDayTime = (index) => {
      const updated = dayTimeEntries.filter((_, i) => i !== index);
      if (updated.length === 0) {
        updated.push({ day: "", start_time: "", end_time: "" });
      }
      handleFormChange("day_time_entries", updated);
    };
    
    const handleLessonDatesChange = (data) => {
      // Handle new format with dates and optional times
      if (data && typeof data === 'object' && Array.isArray(data.dates)) {
        // New format: { dates: [...], startTime: 'HH:mm', endTime: 'HH:mm' }
        handleFormChange("lesson_dates", data.dates);
        // Auto-set start_date from first lesson date
        if (data.dates && data.dates.length > 0) {
          handleFormChange("start_date", data.dates[0]);
        }
        if (data.startTime) {
          handleFormChange("lesson_start_time", data.startTime);
        }
        if (data.endTime) {
          handleFormChange("lesson_end_time", data.endTime);
        }
      } else if (Array.isArray(data)) {
        // Legacy format: just array of dates
        handleFormChange("lesson_dates", data);
        // Auto-set start_date from first lesson date
        if (data && data.length > 0) {
          handleFormChange("start_date", data[0]);
        }
      }
    };
    
    return (
      <>
        <Grid item xs={12} key="day-time-entries">
          <Box sx={{ mb: 2 }}>
            <Typography variant="subtitle2" gutterBottom sx={{ mb: 2, fontWeight: 500 }}>
              Day & Time {dayTimeEntries.length > 0 && `(${dayTimeEntries.length}/5)`}
            </Typography>
            {dayTimeEntries.map((entry, index) => (
              <Box 
                key={index} 
                sx={{ 
                  mb: 2, 
                  p: 2, 
                  border: "1px solid #e0e0e0", 
                  borderRadius: 1,
                  backgroundColor: "#fafafa"
                }}
              >
                <Grid container spacing={2} alignItems="flex-start">
                  <Grid item xs={12} sm={12}>
                    <DayTimeRangePicker
                      day={entry.day || ""}
                      startTime={entry.start_time || ""}
                      endTime={entry.end_time || ""}
                      onChange={(newDay, newStartTime, newEndTime) => {
                        // Update all fields at once to avoid stale state issues
                        const updated = [...dayTimeEntries];
                        updated[index] = { 
                          ...updated[index], 
                          day: newDay, 
                          start_time: newStartTime, 
                          end_time: newEndTime 
                        };
                        handleFormChange("day_time_entries", updated);
                        // Also update individual fields for backward compatibility
                        if (newDay) handleFormChange("day_of_week", newDay);
                        if (newStartTime) handleFormChange("time", newStartTime);
                      }}
                    />
                  </Grid>
                  {dayTimeEntries.length > 1 && (
                    <Grid item xs={12} sm={12}>
                      <Box sx={{ display: "flex", justifyContent: "flex-end", alignItems: "center" }}>
                        <IconButton
                          size="small"
                          onClick={() => handleRemoveDayTime(index)}
                          color="error"
                          title="Remove this day & time"
                        >
                          <TrashIcon className="h-5 w-5" />
                        </IconButton>
                      </Box>
                    </Grid>
                  )}
                </Grid>
              </Box>
            ))}
            {dayTimeEntries.length < 5 && (
              <Button
                variant="outlined"
                startIcon={<PlusIcon className="h-5 w-5" />}
                onClick={handleAddDayTime}
                sx={{ mt: 1 }}
                fullWidth
              >
                Add Another Day & Time ({dayTimeEntries.length}/5)
              </Button>
            )}
          </Box>
        </Grid>
        
        {/* Lesson Dates Calendar Picker */}
        <Grid item xs={12} key="lesson-dates-calendar">
          <LessonDatesCalendar
            selectedDates={lessonDates}
            onChange={handleLessonDatesChange}
            label="Add Lesson Dates"
            defaultStartTime={dayTimeEntries[0]?.start_time || formData.lesson_start_time || null}
            defaultEndTime={dayTimeEntries[0]?.end_time || formData.lesson_end_time || null}
          />
        </Grid>
      </>
    );
  };

  // Reusable function to render brick fields for all categories
  const renderBrickFields = (brickFields, category) => {
    return brickFields.map((field) => {
      // Skip fields that are already rendered (client, student, subject, etc.)
      // Also skip day_of_week and time since we always show the day & time picker separately
      const skipFields = ["client", "client_name", "client_full_name", "client_first_name", "client_last_name", "parent_name", "address", "student_name", "recipients", "subject", "is_trial", "day_of_week", "time"];
      if (skipFields.includes(field.key)) return null;
      
      // For School category, skip start_date and lesson_dates fields
      // start_date is auto-set from first lesson date, lesson_dates is determined by day/time picker
      if (category === "School" && (field.key === "start_date" || field.key === "lesson_dates")) {
        return null;
      }
      
      // Skip fields that are auto-filled from client/student
      const autoFilledFields = ["client_full_name", "client_first_name", "client_last_name", "parent_name", "address"];
      if (autoFilledFields.includes(field.key)) return null;
      
      // For Online category, skip address field since online lessons don't need physical addresses
      if (category === "Online" && (field.key === "address" || field.label?.toLowerCase().includes("address"))) {
        return null;
      }
      
      // Skip custom_field if it's labeled as "Address" for Online category
      if (category === "Online" && field.key === "custom_field" && (field.defaultValue?.toLowerCase().includes("address") || field.label?.toLowerCase().includes("address"))) {
        return null;
      }
      
      // Special handling for timezone field
      if (field.key === "timezone" || field.type === "timezone") {
        const timezoneOptions = [
          // US Timezones (prioritized)
          { value: "America/New_York", label: "Eastern Time (EST/EDT)" },
          { value: "America/Chicago", label: "Central Time (CST/CDT)" },
          { value: "America/Denver", label: "Mountain Time (MST/MDT)" },
          { value: "America/Los_Angeles", label: "Pacific Time (PST/PDT)" },
          { value: "America/Anchorage", label: "Alaska Time (AKST/AKDT)" },
          { value: "Pacific/Honolulu", label: "Hawaii Time (HST)" },
          // Other common timezones
          { value: "America/Phoenix", label: "Arizona Time (MST - No DST)" },
          { value: "America/Indiana/Indianapolis", label: "Indiana Time (EST/EDT)" },
          { value: "America/Detroit", label: "Detroit Time (EST/EDT)" },
        ];
        
        // Remove duplicates
        const uniqueTimezones = Array.from(
          new Map(timezoneOptions.map(tz => [tz.value, tz])).values()
        );
        
        return (
          <Grid item xs={12} md={6} key={field.key}>
            <FormControl fullWidth>
              <InputLabel>{field.label}</InputLabel>
              <Select
                value={formData[field.key] || "America/New_York"}
                onChange={(e) => handleFormChange(field.key, e.target.value)}
                label={field.label}
              >
                {uniqueTimezones.map((tz) => (
                  <MenuItem key={tz.value} value={tz.value}>
                    {tz.label}
                  </MenuItem>
                ))}
              </Select>
              {field.prefix || field.suffix ? (
                <FormHelperText>{`${field.prefix || ""}${field.suffix || ""}`.trim()}</FormHelperText>
              ) : null}
            </FormControl>
          </Grid>
        );
      }
      
      // Skip day_of_week and time fields - they're handled by the always-visible day & time picker
      // No need to render them here since we always show renderDayTimePicker() for all categories
      
      // Special handling for date fields
      if (field.type === "date") {
        return (
          <Grid item xs={12} md={6} key={field.key}>
            <TextField
              fullWidth
              label={field.label}
              type="date"
              value={formData[field.key] || field.defaultValue || ""}
              onChange={(e) => handleFormChange(field.key, e.target.value)}
              InputLabelProps={{
                shrink: true,
              }}
              inputProps={{
                placeholder: "mm/dd/yyyy",
              }}
              helperText={field.prefix || field.suffix ? `${field.prefix || ""}${field.suffix || ""}`.trim() : undefined}
            />
          </Grid>
        );
      }
      
      return (
        <Grid item xs={12} md={6} key={field.key}>
          <TextField
            fullWidth
            label={field.label}
            value={formData[field.key] || field.defaultValue || ""}
            onChange={(e) => handleFormChange(field.key, e.target.value)}
            type={field.type === "number" ? "number" : field.type === "time" ? "time" : "text"}
            multiline={field.key.includes("notes") || field.key.includes("info")}
            rows={field.key.includes("notes") || field.key.includes("info") ? 3 : 1}
            helperText={field.prefix || field.suffix ? `${field.prefix || ""}${field.suffix || ""}`.trim() : undefined}
          />
        </Grid>
      );
    }).filter(Boolean); // Remove null entries
  };

  // Render multi-client selection section for group templates
  const renderMultiClientSection = () => {
    if (!selectedTemplate || !isGroupTemplate(selectedTemplate)) return null;

    return (
      <Box sx={{ mb: 3 }}>
        <Typography variant="subtitle1" sx={{ mb: 2, fontWeight: 600, color: "primary.main" }}>
          Clients & Students (Group Lesson)
        </Typography>
        <Typography variant="body2" color="text.secondary" sx={{ mb: 2 }}>
          Add multiple clients from different families for this group lesson.
        </Typography>

        {clientStudentPairs.map((pair, index) => (
          <Paper
            key={index}
            variant="outlined"
            sx={{
              p: 2,
              mb: 2,
              borderColor: pair.client ? "primary.light" : "divider",
              bgcolor: pair.client ? "primary.50" : "background.paper"
            }}
          >
            <Box sx={{ display: "flex", alignItems: "flex-start", gap: 2 }}>
              <Box sx={{ flex: 1, display: "flex", flexDirection: { xs: "column", md: "row" }, gap: 2 }}>
                {/* Client Selection */}
                <Autocomplete
                  options={clients}
                  getOptionLabel={(option) => option.name || ""}
                  loading={loadingClients}
                  filterOptions={(options) => options}
                  value={pair.client}
                  onInputChange={(e, value, reason) => {
                    if (reason === "input" && value && value.length >= 2) {
                      if (clientSearchTimeoutRef.current) {
                        clearTimeout(clientSearchTimeoutRef.current);
                      }
                      clientSearchTimeoutRef.current = setTimeout(() => {
                        searchClients(value);
                      }, 300);
                    } else if (reason === "clear" || !value) {
                      if (clientSearchTimeoutRef.current) {
                        clearTimeout(clientSearchTimeoutRef.current);
                      }
                      setClients([]);
                    }
                  }}
                  onChange={(e, value) => {
                    updatePairClient(index, value);
                  }}
                  sx={{ flex: 1, minWidth: 200 }}
                  renderInput={(params) => (
                    <TextField
                      {...params}
                      label={`Client ${index + 1}`}
                      placeholder="Search for client..."
                      size="small"
                    />
                  )}
                />

                {/* Students Selection for this client */}
                <Autocomplete
                  multiple
                  options={pair.recipients}
                  getOptionLabel={(option) => option.name || ""}
                  loading={pair.loadingRecipients}
                  disabled={!pair.client?.id}
                  value={pair.students}
                  onInputChange={(e, value) => {
                    if (pair.client?.id) {
                      searchRecipientsForPair(index, pair.client.id, value);
                    }
                  }}
                  onChange={(e, value) => {
                    updatePairStudents(index, value);
                  }}
                  sx={{ flex: 1, minWidth: 200 }}
                  renderInput={(params) => (
                    <TextField
                      {...params}
                      label="Select Students"
                      placeholder={pair.client?.id ? "Select students..." : "Select client first"}
                      size="small"
                    />
                  )}
                />
              </Box>

              {/* Remove button */}
              {clientStudentPairs.length > 1 && (
                <IconButton
                  onClick={() => removeClientStudentPair(index)}
                  color="error"
                  size="small"
                  title="Remove this client"
                  sx={{ mt: 0.5 }}
                >
                  <TrashIcon className="h-5 w-5" />
                </IconButton>
              )}
            </Box>

            {/* Show selected student names */}
            {pair.students.length > 0 && (
              <Box sx={{ mt: 1, display: "flex", flexWrap: "wrap", gap: 0.5 }}>
                {pair.students.map((student, sIdx) => (
                  <Chip
                    key={sIdx}
                    label={student.name}
                    size="small"
                    color="primary"
                    variant="outlined"
                  />
                ))}
              </Box>
            )}
          </Paper>
        ))}

        {/* Add Another Client Button */}
        <Button
          startIcon={<PlusIcon className="h-5 w-5" />}
          onClick={addClientStudentPair}
          variant="outlined"
          size="small"
          sx={{ mt: 1 }}
        >
          Add Another Client
        </Button>
      </Box>
    );
  };

  const renderFormFields = () => {
    if (!selectedTemplate) return null;

    const category = selectedTemplate.category;
    const brickLayout = selectedTemplate.brick_layout || [];
    
    // Get fields from brick layout
    const brickFields = getFieldsFromBrickLayout(brickLayout);
    
    // Always include client and student fields for Home/Online categories
    const needsClientField = ["Home", "Online"].includes(category);
    const needsStudentField = ["Home", "Online"].includes(category);

    const renderCategoryFields = () => {
      switch (category) {
        case "Home":
          // Check if this is a group template that supports multiple clients
          if (isGroupTemplate(selectedTemplate)) {
            return (
              <>
                {/* Multi-client section for group lessons */}
                <Grid item xs={12}>
                  {renderMultiClientSection()}
                </Grid>
                <Grid item xs={12} md={6}>
                  <TextField
                    fullWidth
                    label="Subject *"
                    value={formData.subject || ""}
                    onChange={(e) => handleFormChange("subject", e.target.value)}
                    required
                    InputProps={{
                      readOnly: true,
                    }}
                    helperText="Automatically set from template"
                  />
                </Grid>
                <Grid item xs={12} md={3}>
                  <FormControlLabel
                    control={
                      <Switch
                        checked={Boolean(formData.is_trial)}
                        onChange={(e) => {
                          handleFormChange("is_trial", e.target.checked);
                          // Trigger job title update for group templates
                          setTimeout(() => updateJobTitleFromPairs(), 0);
                        }}
                      />
                    }
                    label="Trial"
                  />
                </Grid>

                {/* Day & Time Picker - always shown */}
                {renderDayTimePicker(category)}

                {/* Render additional fields from brick layout */}
                {renderBrickFields(brickFields, category)}
              </>
            );
          }

          // Standard single-client Home template
          return (
            <>
              <Grid item xs={12} md={6}>
                <Autocomplete
                  options={clients}
                  getOptionLabel={(option) => option.name || ""}
                  loading={loadingClients}
                  filterOptions={(options) => options} // Disable client-side filtering - API handles it
                  onInputChange={(e, value, reason) => {
                    // Only search if user is typing (not clearing or selecting)
                    if (reason === "input" && value && value.length >= 2) {
                      // Clear previous timeout
                      if (clientSearchTimeoutRef.current) {
                        clearTimeout(clientSearchTimeoutRef.current);
                      }
                      // Debounce the search to avoid excessive API calls
                      clientSearchTimeoutRef.current = setTimeout(() => {
                        searchClients(value);
                      }, 300); // Wait 300ms after user stops typing
                    } else if (reason === "clear" || !value) {
                      // Clear timeout if user clears the field
                      if (clientSearchTimeoutRef.current) {
                        clearTimeout(clientSearchTimeoutRef.current);
                      }
                      setClients([]);
                    }
                  }}
                  onChange={(e, value) => {
                    handleFormChange("client", value);
                    handleFormChange("client_name", value?.name);
                    // Set brick variable fields for client - prefill all related fields
                    handleFormChange("client_full_name", value?.name || "");
                    handleFormChange("client_first_name", value?.first_name || "");
                    handleFormChange("client_last_name", value?.last_name || "");
                    handleFormChange("parent_name", value?.name || "");
                    handleFormChange("address", value?.address || "");

                    // Prefill timezone from client profile if available
                    if (value?.timezone) {
                      handleFormChange("timezone", value.timezone);
                    }

                    // Prefill any other client-related fields from brick layout
                    if (value && brickFields.length > 0) {
                      brickFields.forEach((field) => {
                        // Map client data to brick variables
                        if (field.key === "client_full_name" && !formData[field.key]) {
                          handleFormChange(field.key, value.name || "");
                        } else if (field.key === "client_first_name" && !formData[field.key]) {
                          handleFormChange(field.key, value.first_name || "");
                        } else if (field.key === "client_last_name" && !formData[field.key]) {
                          handleFormChange(field.key, value.last_name || "");
                        } else if (field.key === "parent_name" && !formData[field.key]) {
                          handleFormChange(field.key, value.name || "");
                        } else if (field.key === "address" && !formData[field.key]) {
                          handleFormChange(field.key, value.address || "");
                        } else if (field.key === "timezone" && value.timezone && !formData[field.key]) {
                          handleFormChange(field.key, value.timezone);
                        }
                      });
                    }

                    // Auto-generate job name from template pattern when client is selected
                    // Only auto-generate if user hasn't manually edited the name
                    if (value && selectedTemplate && !isJobNameManuallyEdited) {
                      const generatedJobName = generateJobNameFromTemplate(selectedTemplate, value);
                      handleFormChange("job_title", generatedJobName);
                    }

                    // Fetch recipients when client is selected
                    if (value?.id) {
                      searchRecipients(value.id);
                    } else {
                      setRecipients([]);
                    }
                  }}
                  renderInput={(params) => (
                    <TextField {...params} label="Client Name *" required />
                  )}
                />
              </Grid>
              <Grid item xs={12} md={6}>
                <TextField
                  fullWidth
                  label="Subject *"
                  value={formData.subject || ""}
                  onChange={(e) => handleFormChange("subject", e.target.value)}
                  required
                  InputProps={{
                    readOnly: true,
                  }}
                  helperText="Automatically set from template"
                />
              </Grid>
              <Grid item xs={12} md={6}>
                <Box sx={{ display: "flex", gap: 1, alignItems: "flex-start" }}>
                  <Autocomplete
                    multiple
                    options={recipients}
                    getOptionLabel={(option) => option.name || ""}
                    loading={loadingRecipients}
                    disabled={!formData.client?.id}
                    onInputChange={(e, value) => {
                      if (formData.client?.id) {
                        searchRecipients(formData.client.id, value);
                      }
                    }}
                    onChange={(e, value) => {
                      handleFormChange("recipients", value);
                      const studentNames = value.map(r => r.name).join(", ");
                      handleFormChange("student_name", studentNames);

                      // Prefill student-related fields from brick layout
                      // Always update children_info when recipients change (not just on first selection)
                      if (brickFields.length > 0) {
                        brickFields.forEach((field) => {
                          if (field.key === "student_name") {
                            handleFormChange(field.key, studentNames);
                          } else if (field.key === "children_info") {
                            // Build children info string matching preview format: "Name – Chess Level: Level – (Age: X)"
                            const calculateAge = (dob) => {
                              if (!dob) return null;
                              try {
                                const birthDate = new Date(dob);
                                if (isNaN(birthDate.getTime())) return null;
                                const today = new Date();
                                let age = today.getFullYear() - birthDate.getFullYear();
                                const monthDiff = today.getMonth() - birthDate.getMonth();
                                if (monthDiff < 0 || (monthDiff === 0 && today.getDate() < birthDate.getDate())) {
                                  age--;
                                }
                                return age;
                              } catch (e) {
                                return null;
                              }
                            };

                            const childrenInfo = value.map(r => {
                              const name = r.first_name || r.name || "";
                              const chessLevel = r.chess_level || r.experience || null;
                              const age = r.dob ? calculateAge(r.dob) : (r.age ? parseInt(r.age) : null);

                              let info = name;
                              if (chessLevel) {
                                info += ` – Chess Level: ${chessLevel}`;
                              }
                              if (age !== null && !isNaN(age)) {
                                info += ` – (Age: ${age})`;
                              }

                              return info;
                            }).join(", ");
                            handleFormChange(field.key, childrenInfo);
                          }
                        });
                      }

                      // Update job title to include student first name in parentheses
                      // Pass studentNames directly since formData hasn't updated yet
                      // Only auto-generate if user hasn't manually edited the name
                      if (formData.client && selectedTemplate && !isJobNameManuallyEdited) {
                        const generatedJobName = generateJobNameFromTemplate(selectedTemplate, formData.client, studentNames);
                        handleFormChange("job_title", generatedJobName);
                      }
                    }}
                    value={formData.recipients || []}
                    sx={{ flex: 1 }}
                    renderInput={(params) => (
                      <TextField
                        {...params}
                        label="Select Students"
                        helperText={!formData.client?.id ? "Please select a client first" : ""}
                      />
                    )}
                  />
                  <IconButton
                    onClick={() => setAddSiblingDialogOpen(true)}
                    disabled={!formData.client?.id}
                    color="primary"
                    title="Add Sibling"
                    sx={{
                      mt: 1,
                      bgcolor: formData.client?.id ? "primary.light" : "grey.200",
                      "&:hover": { bgcolor: formData.client?.id ? "primary.main" : "grey.300" },
                      "& .MuiSvgIcon-root": { color: formData.client?.id ? "white" : "grey.500" }
                    }}
                  >
                    <UserPlusIcon className="h-5 w-5" />
                  </IconButton>
                </Box>
              </Grid>
              <Grid item xs={12} md={3}>
                <FormControlLabel
                  control={
                    <Switch
                      checked={Boolean(formData.is_trial)}
                      onChange={(e) => handleFormChange("is_trial", e.target.checked)}
                    />
                  }
                  label="Trial"
                />
              </Grid>

              {/* Day & Time Picker - always shown */}
              {renderDayTimePicker(category)}

              {/* Render additional fields from brick layout */}
              {renderBrickFields(brickFields, category)}
            </>
          );
        case "Club":
          return (
            <>
              <Grid item xs={12} md={6}>
                <Autocomplete
                  options={clients}
                  getOptionLabel={(option) => option.name || ""}
                  loading={loadingClients}
                  filterOptions={(options) => options}
                  onInputChange={(e, value, reason) => {
                    if (reason === "input" && value && value.length >= 2) {
                      if (clientSearchTimeoutRef.current) {
                        clearTimeout(clientSearchTimeoutRef.current);
                      }
                      clientSearchTimeoutRef.current = setTimeout(() => {
                        searchClients(value);
                      }, 300);
                    } else if (reason === "clear" || !value) {
                      if (clientSearchTimeoutRef.current) {
                        clearTimeout(clientSearchTimeoutRef.current);
                      }
                      setClients([]);
                    }
                  }}
                  onChange={(e, value) => {
                    handleFormChange("client", value);
                    handleFormChange("client_name", value?.name);
                    // Set brick variable fields for client
                    handleFormChange("client_full_name", value?.name);
                    handleFormChange("client_first_name", value?.first_name);
                    handleFormChange("client_last_name", value?.last_name);
                    handleFormChange("parent_name", value?.name);
                    // Prefill timezone from client profile if available
                    if (value?.timezone) {
                      handleFormChange("timezone", value.timezone);
                    }
                    // Only auto-generate if user hasn't manually edited the name
                    if (value && selectedTemplate && !isJobNameManuallyEdited) {
                      const generatedJobName = generateJobNameFromTemplate(selectedTemplate, value);
                      handleFormChange("job_title", generatedJobName);
                    }
                    if (value?.id) {
                      searchRecipients(value.id);
                    } else {
                      setRecipients([]);
                    }
                  }}
                  renderInput={(params) => (
                    <TextField {...params} label="Client/Parent Name" helperText="Optional - search for parent/client" />
                  )}
                />
              </Grid>
              <Grid item xs={12} md={6}>
                <Box sx={{ display: "flex", gap: 1, alignItems: "flex-start" }}>
                  <Autocomplete
                    multiple
                    options={recipients}
                    getOptionLabel={(option) => option.name || ""}
                    loading={loadingRecipients}
                    disabled={!formData.client?.id}
                    onInputChange={(e, value) => {
                      if (formData.client?.id) {
                        searchRecipients(formData.client.id, value);
                      }
                    }}
                    onChange={(e, value) => {
                      handleFormChange("recipients", value);
                      const studentNames = value.map(r => r.name).join(", ");
                      handleFormChange("student_name", studentNames);
                      // Only auto-generate if user hasn't manually edited the name
                      if (formData.client && selectedTemplate && !isJobNameManuallyEdited) {
                        const generatedJobName = generateJobNameFromTemplate(selectedTemplate, formData.client, studentNames);
                        handleFormChange("job_title", generatedJobName);
                      }
                    }}
                    value={formData.recipients || []}
                    sx={{ flex: 1 }}
                    renderInput={(params) => (
                      <TextField
                        {...params}
                        label="Select Students"
                        helperText={!formData.client?.id ? "Select a client first (optional)" : "Optional - select students"}
                      />
                    )}
                  />
                  <IconButton
                    onClick={() => setAddSiblingDialogOpen(true)}
                    disabled={!formData.client?.id}
                    color="primary"
                    title="Add Sibling"
                    sx={{
                      mt: 1,
                      bgcolor: formData.client?.id ? "primary.light" : "grey.200",
                      "&:hover": { bgcolor: formData.client?.id ? "primary.main" : "grey.300" },
                      "& .MuiSvgIcon-root": { color: formData.client?.id ? "white" : "grey.500" }
                    }}
                  >
                    <UserPlusIcon className="h-5 w-5" />
                  </IconButton>
                </Box>
              </Grid>
              <Grid item xs={12} md={6}>
                <TextField
                  fullWidth
                  label="Class Name"
                  value={formData.class_name || ""}
                  onChange={(e) => handleFormChange("class_name", e.target.value)}
                  required
                />
              </Grid>
              <Grid item xs={12} md={6}>
                <TextField
                  fullWidth
                  label="Location"
                  value={formData.location || ""}
                  onChange={(e) => handleFormChange("location", e.target.value)}
                  required
                />
              </Grid>
              <Grid item xs={12} md={6}>
                <TextField
                  fullWidth
                  label="Subject *"
                  value={formData.subject || ""}
                  onChange={(e) => handleFormChange("subject", e.target.value)}
                  required
                  InputProps={{
                    readOnly: true,
                  }}
                  helperText="Automatically set from template"
                />
              </Grid>
              <Grid item xs={12} md={6}>
                <TextField
                  fullWidth
                  label="Term/Year (Optional)"
                  value={formData.term || formData.semester || ""}
                  onChange={(e) => {
                    handleFormChange("term", e.target.value);
                    handleFormChange("semester", e.target.value); // Also update semester for compatibility
                  }}
                  placeholder="e.g., 2025-26 or 25-26"
                  helperText="Optional - Add academic year/term (e.g., 2025-26)"
                />
              </Grid>
              
              {/* Day & Time Picker - always shown */}
              {renderDayTimePicker(category)}
              
              {/* Render additional fields from brick layout */}
              {renderBrickFields(brickFields, category)}
            </>
          );
        case "School":
          return (
            <>
              <Grid item xs={12} md={6}>
                <Autocomplete
                  options={clients}
                  getOptionLabel={(option) => option.name || ""}
                  loading={loadingClients}
                  filterOptions={(options) => options}
                  onInputChange={(e, value, reason) => {
                    if (reason === "input" && value && value.length >= 2) {
                      if (clientSearchTimeoutRef.current) {
                        clearTimeout(clientSearchTimeoutRef.current);
                      }
                      clientSearchTimeoutRef.current = setTimeout(() => {
                        searchClients(value);
                      }, 300);
                    } else if (reason === "clear" || !value) {
                      if (clientSearchTimeoutRef.current) {
                        clearTimeout(clientSearchTimeoutRef.current);
                      }
                      setClients([]);
                    }
                  }}
                  onChange={(e, value) => {
                    handleFormChange("client", value);
                    handleFormChange("client_name", value?.name);
                    // Set brick variable fields for client
                    handleFormChange("client_full_name", value?.name);
                    handleFormChange("client_first_name", value?.first_name);
                    handleFormChange("client_last_name", value?.last_name);
                    handleFormChange("parent_name", value?.name);
                    // For School category, sync school_name with client name
                    handleFormChange("school_name", value?.name);
                    // Populate address from client record
                    handleFormChange("address", value?.address || "");
                    // Prefill timezone from client profile if available
                    if (value?.timezone) {
                      handleFormChange("timezone", value.timezone);
                    }
                    // Only auto-generate if user hasn't manually edited the name
                    if (value && selectedTemplate && !isJobNameManuallyEdited) {
                      const generatedJobName = generateJobNameFromTemplate(selectedTemplate, value);
                      handleFormChange("job_title", generatedJobName);
                    }
                    if (value?.id) {
                      searchRecipients(value.id);
                    } else {
                      setRecipients([]);
                    }
                  }}
                  renderInput={(params) => (
                    <TextField {...params} label="School Name" helperText="Optional - search for school/client" />
                  )}
                />
              </Grid>
              <Grid item xs={12} md={6}>
                <Box sx={{ display: "flex", gap: 1, alignItems: "flex-start" }}>
                  <Autocomplete
                    multiple
                    options={recipients}
                    getOptionLabel={(option) => option.name || ""}
                    loading={loadingRecipients}
                    disabled={!formData.client?.id}
                    onInputChange={(e, value) => {
                      if (formData.client?.id) {
                        searchRecipients(formData.client.id, value);
                      }
                    }}
                    onChange={(e, value) => {
                      handleFormChange("recipients", value);
                      const studentNames = value.map(r => r.name).join(", ");
                      handleFormChange("student_name", studentNames);
                      // Only auto-generate if user hasn't manually edited the name
                      if (formData.client && selectedTemplate && !isJobNameManuallyEdited) {
                        const generatedJobName = generateJobNameFromTemplate(selectedTemplate, formData.client, studentNames);
                        handleFormChange("job_title", generatedJobName);
                      }
                    }}
                    value={formData.recipients || []}
                    sx={{ flex: 1 }}
                    renderInput={(params) => (
                      <TextField
                        {...params}
                        label="Select Students"
                        helperText={!formData.client?.id ? "Select a client first (optional)" : "Optional - select students"}
                      />
                    )}
                  />
                  <IconButton
                    onClick={() => setAddSiblingDialogOpen(true)}
                    disabled={!formData.client?.id}
                    color="primary"
                    title="Add Sibling"
                    sx={{
                      mt: 1,
                      bgcolor: formData.client?.id ? "primary.light" : "grey.200",
                      "&:hover": { bgcolor: formData.client?.id ? "primary.main" : "grey.300" },
                      "& .MuiSvgIcon-root": { color: formData.client?.id ? "white" : "grey.500" }
                    }}
                  >
                    <UserPlusIcon className="h-5 w-5" />
                  </IconButton>
                </Box>
              </Grid>
              <Grid item xs={12} md={6}>
                <TextField
                  fullWidth
                  label="Subject *"
                  value={formData.subject || ""}
                  onChange={(e) => handleFormChange("subject", e.target.value)}
                  required
                  InputProps={{
                    readOnly: true,
                  }}
                  helperText="Automatically set from template"
                />
              </Grid>
              <Grid item xs={12} md={6}>
                <FormControl fullWidth required>
                  <InputLabel>Term</InputLabel>
                  <Select
                    value={formData.semester || ""}
                    label="Term"
                    onChange={(e) => handleFormChange("semester", e.target.value)}
                  >
                    {generateTermOptions().map((term) => (
                      <MenuItem key={term} value={term}>
                        {term}
                      </MenuItem>
                    ))}
                  </Select>
                  <FormHelperText>Select the academic term for this program</FormHelperText>
                </FormControl>
              </Grid>

              {/* Day & Time Picker - always shown */}
              {renderDayTimePicker(category)}

              {/* Render additional fields from brick layout */}
              {renderBrickFields(brickFields, category)}
            </>
          );
        case "Community":
          return (
            <>
              <Grid item xs={12} md={6}>
                <Autocomplete
                  options={clients}
                  getOptionLabel={(option) => option.name || ""}
                  loading={loadingClients}
                  filterOptions={(options) => options}
                  onInputChange={(e, value, reason) => {
                    if (reason === "input" && value && value.length >= 2) {
                      if (clientSearchTimeoutRef.current) {
                        clearTimeout(clientSearchTimeoutRef.current);
                      }
                      clientSearchTimeoutRef.current = setTimeout(() => {
                        searchClients(value);
                      }, 300);
                    } else if (reason === "clear" || !value) {
                      if (clientSearchTimeoutRef.current) {
                        clearTimeout(clientSearchTimeoutRef.current);
                      }
                      setClients([]);
                    }
                  }}
                  onChange={(e, value) => {
                    handleFormChange("client", value);
                    handleFormChange("client_name", value?.name);
                    // Set brick variable fields for client
                    handleFormChange("client_full_name", value?.name);
                    handleFormChange("client_first_name", value?.first_name);
                    handleFormChange("client_last_name", value?.last_name);
                    handleFormChange("parent_name", value?.name);
                    // Prefill timezone from client profile if available
                    if (value?.timezone) {
                      handleFormChange("timezone", value.timezone);
                    }
                    // Only auto-generate if user hasn't manually edited the name
                    if (value && selectedTemplate && !isJobNameManuallyEdited) {
                      const generatedJobName = generateJobNameFromTemplate(selectedTemplate, value);
                      handleFormChange("job_title", generatedJobName);
                    }
                    if (value?.id) {
                      searchRecipients(value.id);
                    } else {
                      setRecipients([]);
                    }
                  }}
                  renderInput={(params) => (
                    <TextField {...params} label="Client/Parent Name" helperText="Optional - search for parent/client" />
                  )}
                />
              </Grid>
              <Grid item xs={12} md={6}>
                <Box sx={{ display: "flex", gap: 1, alignItems: "flex-start" }}>
                  <Autocomplete
                    multiple
                    options={recipients}
                    getOptionLabel={(option) => option.name || ""}
                    loading={loadingRecipients}
                    disabled={!formData.client?.id}
                    onInputChange={(e, value) => {
                      if (formData.client?.id) {
                        searchRecipients(formData.client.id, value);
                      }
                    }}
                    onChange={(e, value) => {
                      handleFormChange("recipients", value);
                      const studentNames = value.map(r => r.name).join(", ");
                      handleFormChange("student_name", studentNames);
                      // Only auto-generate if user hasn't manually edited the name
                      if (formData.client && selectedTemplate && !isJobNameManuallyEdited) {
                        const generatedJobName = generateJobNameFromTemplate(selectedTemplate, formData.client, studentNames);
                        handleFormChange("job_title", generatedJobName);
                      }
                    }}
                    value={formData.recipients || []}
                    sx={{ flex: 1 }}
                    renderInput={(params) => (
                      <TextField
                        {...params}
                        label="Select Students"
                        helperText={!formData.client?.id ? "Select a client first (optional)" : "Optional - select students"}
                      />
                    )}
                  />
                  <IconButton
                    onClick={() => setAddSiblingDialogOpen(true)}
                    disabled={!formData.client?.id}
                    color="primary"
                    title="Add Sibling"
                    sx={{
                      mt: 1,
                      bgcolor: formData.client?.id ? "primary.light" : "grey.200",
                      "&:hover": { bgcolor: formData.client?.id ? "primary.main" : "grey.300" },
                      "& .MuiSvgIcon-root": { color: formData.client?.id ? "white" : "grey.500" }
                    }}
                  >
                    <UserPlusIcon className="h-5 w-5" />
                  </IconButton>
                </Box>
              </Grid>
              <Grid item xs={12} md={6}>
                <TextField
                  fullWidth
                  label="Location"
                  value={formData.location || ""}
                  onChange={(e) => handleFormChange("location", e.target.value)}
                  required
                />
              </Grid>
              <Grid item xs={12} md={6}>
                <TextField
                  fullWidth
                  label="Subject *"
                  value={formData.subject || ""}
                  onChange={(e) => handleFormChange("subject", e.target.value)}
                  required
                  InputProps={{
                    readOnly: true,
                  }}
                  helperText="Automatically set from template"
                />
              </Grid>

              {/* Day & Time Picker - always shown */}
              {renderDayTimePicker(category)}

              {/* Render additional fields from brick layout */}
              {renderBrickFields(brickFields, category)}
            </>
          );
        case "Online":
          // Check if this is a group template that supports multiple clients
          if (isGroupTemplate(selectedTemplate)) {
            return (
              <>
                {/* Multi-client section for group lessons */}
                <Grid item xs={12}>
                  {renderMultiClientSection()}
                </Grid>
                <Grid item xs={12} md={6}>
                  <TextField
                    fullWidth
                    label="Subject *"
                    value={formData.subject || ""}
                    onChange={(e) => handleFormChange("subject", e.target.value)}
                    required
                    InputProps={{
                      readOnly: true,
                    }}
                    helperText="Automatically set from template"
                  />
                </Grid>
                <Grid item xs={12} md={3}>
                  <FormControlLabel
                    control={
                      <Switch
                        checked={Boolean(formData.is_trial)}
                        onChange={(e) => {
                          handleFormChange("is_trial", e.target.checked);
                          // Trigger job title update for group templates
                          setTimeout(() => updateJobTitleFromPairs(), 0);
                        }}
                      />
                    }
                    label="Trial"
                  />
                </Grid>

                {/* Day & Time Picker - always shown */}
                {renderDayTimePicker(category)}

                {/* Render additional fields from brick layout */}
                {renderBrickFields(brickFields, category)}
              </>
            );
          }

          // Standard single-client Online template
          return (
            <>
              <Grid item xs={12} md={6}>
                <Autocomplete
                  options={clients}
                  getOptionLabel={(option) => option.name || ""}
                  loading={loadingClients}
                  filterOptions={(options) => options}
                  onInputChange={(e, value, reason) => {
                    if (reason === "input" && value && value.length >= 2) {
                      if (clientSearchTimeoutRef.current) {
                        clearTimeout(clientSearchTimeoutRef.current);
                      }
                      clientSearchTimeoutRef.current = setTimeout(() => {
                        searchClients(value);
                      }, 300);
                    } else if (reason === "clear" || !value) {
                      if (clientSearchTimeoutRef.current) {
                        clearTimeout(clientSearchTimeoutRef.current);
                      }
                      setClients([]);
                    }
                  }}
                  onChange={(e, value) => {
                    handleFormChange("client", value);
                    handleFormChange("client_name", value?.name);
                    // Set brick variable fields for client
                    handleFormChange("client_full_name", value?.name);
                    handleFormChange("client_first_name", value?.first_name);
                    handleFormChange("client_last_name", value?.last_name);
                    handleFormChange("parent_name", value?.name);
                    handleFormChange("address", value?.address);
                    // Prefill timezone from client profile if available
                    if (value?.timezone) {
                      handleFormChange("timezone", value.timezone);
                    }
                    // Only auto-generate if user hasn't manually edited the name
                    if (value && selectedTemplate && !isJobNameManuallyEdited) {
                      const generatedJobName = generateJobNameFromTemplate(selectedTemplate, value);
                      handleFormChange("job_title", generatedJobName);
                    }
                    if (value?.id) {
                      searchRecipients(value.id);
                    } else {
                      setRecipients([]);
                    }
                  }}
                  renderInput={(params) => (
                    <TextField {...params} label="Client Name *" required />
                  )}
                />
              </Grid>
              <Grid item xs={12} md={6}>
                <TextField
                  fullWidth
                  label="Subject *"
                  value={formData.subject || ""}
                  onChange={(e) => handleFormChange("subject", e.target.value)}
                  required
                  InputProps={{
                    readOnly: true,
                  }}
                  helperText="Automatically set from template"
                />
              </Grid>
              <Grid item xs={12} md={6}>
                <Box sx={{ display: "flex", gap: 1, alignItems: "flex-start" }}>
                  <Autocomplete
                    multiple
                    options={recipients}
                    getOptionLabel={(option) => option.name || ""}
                    loading={loadingRecipients}
                    disabled={!formData.client?.id}
                    onInputChange={(e, value) => {
                      if (formData.client?.id) {
                        searchRecipients(formData.client.id, value);
                      }
                    }}
                    onChange={(e, value) => {
                      handleFormChange("recipients", value);
                      const studentNames = value.map(r => r.name).join(", ");
                      handleFormChange("student_name", studentNames);
                      // Only auto-generate if user hasn't manually edited the name
                      if (formData.client && selectedTemplate && !isJobNameManuallyEdited) {
                        const generatedJobName = generateJobNameFromTemplate(selectedTemplate, formData.client, studentNames);
                        handleFormChange("job_title", generatedJobName);
                      }
                    }}
                    value={formData.recipients || []}
                    sx={{ flex: 1 }}
                    renderInput={(params) => (
                      <TextField
                        {...params}
                        label="Select Students"
                        helperText={!formData.client?.id ? "Please select a client first" : ""}
                      />
                    )}
                  />
                  <IconButton
                    onClick={() => setAddSiblingDialogOpen(true)}
                    disabled={!formData.client?.id}
                    color="primary"
                    title="Add Sibling"
                    sx={{
                      mt: 1,
                      bgcolor: formData.client?.id ? "primary.light" : "grey.200",
                      "&:hover": { bgcolor: formData.client?.id ? "primary.main" : "grey.300" },
                      "& .MuiSvgIcon-root": { color: formData.client?.id ? "white" : "grey.500" }
                    }}
                  >
                    <UserPlusIcon className="h-5 w-5" />
                  </IconButton>
                </Box>
              </Grid>
              <Grid item xs={12} md={3}>
                <FormControlLabel
                  control={
                    <Switch
                      checked={Boolean(formData.is_trial)}
                      onChange={(e) => handleFormChange("is_trial", e.target.checked)}
                    />
                  }
                  label="Trial"
                />
              </Grid>

              {/* Day & Time Picker - always shown */}
              {renderDayTimePicker(category)}

              {/* Render additional fields from brick layout */}
              {renderBrickFields(brickFields, category)}
            </>
          );
        default:
          // Default case: show client and student fields for any category
          return (
            <>
              <Grid item xs={12} md={6}>
                <Autocomplete
                  options={clients}
                  getOptionLabel={(option) => option.name || ""}
                  loading={loadingClients}
                  filterOptions={(options) => options}
                  onInputChange={(e, value, reason) => {
                    if (reason === "input" && value && value.length >= 2) {
                      if (clientSearchTimeoutRef.current) {
                        clearTimeout(clientSearchTimeoutRef.current);
                      }
                      clientSearchTimeoutRef.current = setTimeout(() => {
                        searchClients(value);
                      }, 300);
                    } else if (reason === "clear" || !value) {
                      if (clientSearchTimeoutRef.current) {
                        clearTimeout(clientSearchTimeoutRef.current);
                      }
                      setClients([]);
                    }
                  }}
                  onChange={(e, value) => {
                    handleFormChange("client", value);
                    handleFormChange("client_name", value?.name);
                    // Set brick variable fields for client
                    handleFormChange("client_full_name", value?.name);
                    handleFormChange("client_first_name", value?.first_name);
                    handleFormChange("client_last_name", value?.last_name);
                    handleFormChange("parent_name", value?.name);
                    // Prefill timezone from client profile if available
                    if (value?.timezone) {
                      handleFormChange("timezone", value.timezone);
                    }
                    // Only auto-generate if user hasn't manually edited the name
                    if (value && selectedTemplate && !isJobNameManuallyEdited) {
                      const generatedJobName = generateJobNameFromTemplate(selectedTemplate, value);
                      handleFormChange("job_title", generatedJobName);
                    }
                    if (value?.id) {
                      searchRecipients(value.id);
                    } else {
                      setRecipients([]);
                    }
                  }}
                  renderInput={(params) => (
                    <TextField {...params} label="Client/Parent Name" helperText="Optional - search for parent/client" />
                  )}
                />
              </Grid>
              <Grid item xs={12} md={6}>
                <Autocomplete
                  multiple
                  options={recipients}
                  getOptionLabel={(option) => option.name || ""}
                  loading={loadingRecipients}
                  disabled={!formData.client?.id}
                  onInputChange={(e, value) => {
                    if (formData.client?.id) {
                      searchRecipients(formData.client.id, value);
                    }
                  }}
                  onChange={(e, value) => {
                    handleFormChange("recipients", value);
                    const studentNames = value.map(r => r.name).join(", ");
                    handleFormChange("student_name", studentNames);
                    // Only auto-generate if user hasn't manually edited the name
                    if (formData.client && selectedTemplate && !isJobNameManuallyEdited) {
                      const generatedJobName = generateJobNameFromTemplate(selectedTemplate, formData.client, studentNames);
                      handleFormChange("job_title", generatedJobName);
                    }
                  }}
                  value={formData.recipients || []}
                  renderInput={(params) => (
                    <TextField
                      {...params}
                      label="Select Students"
                      helperText={!formData.client?.id ? "Select a client first (optional)" : "Optional - select students"}
                    />
                  )}
                />
              </Grid>
              <Grid item xs={12} md={6}>
                <TextField
                  fullWidth
                  label="Subject *"
                  value={formData.subject || ""}
                  onChange={(e) => handleFormChange("subject", e.target.value)}
                  required
                  InputProps={{
                    readOnly: true,
                  }}
                  helperText="Automatically set from template"
                />
              </Grid>
            </>
          );
      }
    };

    return (
      <Box>
        <Typography variant="h6" gutterBottom>
          Job Details - {selectedTemplate.name}
        </Typography>

        {/* Editable Job Name */}
        <Paper
          sx={{
            p: 2,
            mb: 3,
            backgroundColor: isJobNameManuallyEdited ? 'warning.50' : 'primary.50',
            border: '1px solid',
            borderColor: isJobNameManuallyEdited ? 'warning.300' : 'primary.200'
          }}
          elevation={0}
        >
          <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', mb: 1 }}>
            <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
              <Typography variant="subtitle2" color="text.secondary">
                Job Name {isJobNameManuallyEdited ? '(Customized)' : '(Auto-generated)'}
              </Typography>
              <PencilSquareIcon className="h-4 w-4 text-gray-500" />
            </Box>
            {isJobNameManuallyEdited && (
              <Button
                size="small"
                startIcon={<ArrowPathIcon className="h-5 w-5" />}
                onClick={() => {
                  setIsJobNameManuallyEdited(false);
                  // Regenerate the job name from template
                  const generatedJobName = generateJobNameFromTemplate(selectedTemplate, formData.client);
                  if (generatedJobName) {
                    handleFormChange("job_title", generatedJobName);
                  }
                }}
                sx={{ textTransform: 'none' }}
              >
                Reset to auto-generated
              </Button>
            )}
          </Box>
          <TextField
            fullWidth
            variant="outlined"
            size="small"
            value={formData.job_title || ''}
            placeholder="Fill in the fields below to generate the job name..."
            onChange={(e) => {
              setIsJobNameManuallyEdited(true);
              handleFormChange("job_title", e.target.value);
            }}
            sx={{
              '& .MuiOutlinedInput-root': {
                backgroundColor: 'white',
                '& input': {
                  fontWeight: 500,
                  fontSize: '1.1rem'
                }
              }
            }}
          />
          <Typography variant="caption" color="text.secondary" sx={{ mt: 1, display: 'block' }}>
            Edit the job name above if needed. This name will be used in TutorCruncher.
          </Typography>
        </Paper>

        <Grid container spacing={3} sx={{ mb: 2 }}>
          {renderCategoryFields()}
        </Grid>

        {/* TutorCruncher Service Setup section removed - all fields auto-populate from template */}
      </Box>
    );
  };

  const renderPreviewAndConfirm = () => (
    <Box>
      <Typography variant="h6" gutterBottom>
        Review Job Details
      </Typography>
      
      <Paper sx={{ p: 3, mb: 3 }}>
        <Typography variant="subtitle1" gutterBottom>
          <strong>Job Title:</strong>
        </Typography>
        <Typography variant="body1" sx={{ mb: 2 }}>
          {previewData?.jobTitle}
        </Typography>

        <Divider sx={{ my: 2 }} />

        <Typography variant="subtitle1" gutterBottom>
          <strong>Job Description (Brick):</strong>
        </Typography>
        <BrickPreview description={previewData?.jobDescription} />
      </Paper>

      <Alert severity="info">
        Please review all details carefully before creating the job in TutorCruncher.
      </Alert>
    </Box>
  );

  const [mainTab, setMainTab] = useState(0);

  return (
    <Box sx={{ p: 3 }}>
      <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mb: 2 }}>
        <Tabs value={mainTab} onChange={(_, v) => setMainTab(v)}>
          <Tab icon={<WrenchIcon className="h-5 w-5" />} iconPosition="start" label="Create Job" />
          <Tab icon={<ClockIcon className="h-5 w-5" />} iconPosition="start" label="History" />
        </Tabs>
        <Button
          variant="outlined"
          onClick={() => navigate('/job-builder-admin')}
        >
          Manage Templates
        </Button>
      </Box>

      {mainTab === 1 && (
        <React.Suspense fallback={<Box sx={{ display: "flex", justifyContent: "center", p: 4 }}><CircularProgress /></Box>}>
          <JobBuilderHistory />
        </React.Suspense>
      )}

      {mainTab === 0 && <Paper sx={{ p: 3 }}>
        <Stepper activeStep={activeStep} sx={{ mb: 4 }}>
          {steps.map((label) => (
            <Step key={label}>
              <StepLabel>{label}</StepLabel>
            </Step>
          ))}
        </Stepper>

        {loading ? (
          <Box sx={{ display: "flex", justifyContent: "center", p: 4 }}>
            <CircularProgress />
          </Box>
        ) : (
          <>
            {activeStep === 0 && renderTemplateSelection()}
            {activeStep === 1 && renderFormFields()}
            {activeStep === 2 && renderPreviewAndConfirm()}

            <Box sx={{ display: "flex", justifyContent: "space-between", mt: 4 }}>
              <Button disabled={activeStep === 0} onClick={handleBack}>
                Back
              </Button>
              <Box>
                {activeStep === steps.length - 1 ? (
                  <Button
                    variant="contained"
                    color="primary"
                    onClick={() => setConfirmDialogOpen(true)}
                    disabled={creating}
                  >
                    {creating ? <CircularProgress size={24} /> : "Create Job"}
                  </Button>
                ) : (
                  <Button variant="contained" color="primary" onClick={handleNext}>
                    Next
                  </Button>
                )}
              </Box>
            </Box>
          </>
        )}
      </Paper>}

      {/* Confirmation Dialog */}
      <Dialog open={confirmDialogOpen} onClose={() => setConfirmDialogOpen(false)}>
        <DialogTitle>Confirm Job Creation</DialogTitle>
        <DialogContent>
          <Typography>
            Are you sure you want to create this job in TutorCruncher?
          </Typography>
          <Typography variant="body2" color="textSecondary" sx={{ mt: 2 }}>
            This action will immediately create a new service in TutorCruncher.
          </Typography>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setConfirmDialogOpen(false)}>Cancel</Button>
          <Button onClick={handleCreateJob} variant="contained" color="primary">
            Confirm
          </Button>
        </DialogActions>
      </Dialog>

      {/* Success Dialog */}
      <Dialog open={successDialogOpen} onClose={() => setSuccessDialogOpen(false)} maxWidth="sm" fullWidth>
        <DialogTitle>Job Created Successfully!</DialogTitle>
        <DialogContent>
          <Alert severity="success" sx={{ mb: 2 }}>
            <Typography variant="body1" gutterBottom>
              {createdJob?.localOnly 
                ? "Your job has been successfully created locally (not synced to TutorCruncher)."
                : "Your job has been successfully created in TutorCruncher."}
            </Typography>
            {createdJob?.service?.id && !createdJob?.localOnly && (
              <Box sx={{ mt: 2 }}>
                <Typography variant="body2" color="text.secondary" gutterBottom>
                  <strong>Job ID:</strong> {createdJob.service.id}
              </Typography>
                <Box sx={{ mt: 2, display: 'flex', gap: 1, flexWrap: 'wrap' }}>
                  <Button
                    variant="contained"
                    color="primary"
                    href={`https://account.acmeops.com/cal/service/${createdJob.service.id}/`}
                    target="_blank"
                    rel="noopener noreferrer"
                  >
                    View Job in TutorCruncher
                  </Button>
                  <Button
                    variant="outlined"
                    onClick={() => {
                      navigator.clipboard.writeText(`https://account.acmeops.com/cal/service/${createdJob.service.id}/`);
                      showSnackbar("Link copied to clipboard!", "success");
                    }}
                  >
                    Copy Link
                  </Button>
                </Box>
              </Box>
            )}
            {createdJob?.localOnly && createdJob?.service?.id && (
              <Box sx={{ mt: 2 }}>
                <Typography variant="body2" color="text.secondary" gutterBottom>
                  <strong>Local Job ID:</strong> {createdJob.service.id}
                </Typography>
              </Box>
            )}
          </Alert>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setSuccessDialogOpen(false)} variant="contained">
            Close
          </Button>
        </DialogActions>
      </Dialog>

      {/* Add Sibling Dialog */}
      <Dialog
        open={addSiblingDialogOpen}
        onClose={() => {
          setAddSiblingDialogOpen(false);
          setAddSiblingForm({ first_name: "", last_name: "", dob: "" });
        }}
        maxWidth="sm"
        fullWidth
      >
        <DialogTitle>
          <Box sx={{ display: "flex", alignItems: "center", gap: 1 }}>
            <UserPlusIcon className="h-5 w-5 text-brand-purple" />
            Add Sibling / Student
          </Box>
        </DialogTitle>
        <DialogContent>
          <Typography variant="body2" color="text.secondary" sx={{ mb: 3 }}>
            Add a new student to {formData.client?.name || "this client"}'s family.
          </Typography>
          <Grid container spacing={2}>
            <Grid item xs={12} md={6}>
              <TextField
                fullWidth
                label="First Name"
                value={addSiblingForm.first_name}
                onChange={(e) => setAddSiblingForm({ ...addSiblingForm, first_name: e.target.value })}
                required
                autoFocus
              />
            </Grid>
            <Grid item xs={12} md={6}>
              <TextField
                fullWidth
                label="Last Name"
                value={addSiblingForm.last_name}
                onChange={(e) => setAddSiblingForm({ ...addSiblingForm, last_name: e.target.value })}
                required
              />
            </Grid>
            <Grid item xs={12}>
              <TextField
                fullWidth
                label="Date of Birth"
                type="date"
                value={addSiblingForm.dob}
                onChange={(e) => setAddSiblingForm({ ...addSiblingForm, dob: e.target.value })}
                InputLabelProps={{ shrink: true }}
                helperText="Optional - helps calculate age"
              />
            </Grid>
          </Grid>
        </DialogContent>
        <DialogActions>
          <Button
            onClick={() => {
              setAddSiblingDialogOpen(false);
              setAddSiblingForm({ first_name: "", last_name: "", dob: "" });
            }}
          >
            Cancel
          </Button>
          <Button
            onClick={handleAddSibling}
            variant="contained"
            color="primary"
            disabled={addingSibling || !addSiblingForm.first_name.trim() || !addSiblingForm.last_name.trim()}
            startIcon={addingSibling ? <CircularProgress size={16} /> : <UserPlusIcon className="h-5 w-5" />}
          >
            {addingSibling ? "Adding..." : "Add Student"}
          </Button>
        </DialogActions>
      </Dialog>

      {/* Snackbar */}
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
    </Box>
  );
}

