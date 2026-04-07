import React, { useState, useEffect, useRef } from "react";
import {
  TextField,
  Button,
  FormControl,
  InputLabel,
  Select,
  MenuItem,
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TableRow,
  Paper,
  Grid,
  Dialog,
  Typography,
  DialogTitle,
  DialogContent,
  DialogActions,
  Tooltip,
  IconButton,
  FormControlLabel,
  Switch,
  Box,
  Card,
  CardContent,
  Menu,
  Divider,
  InputAdornment,
  Avatar,
  Chip,
} from "@mui/material";
import { Autocomplete } from "@mui/material";
import Snackbar from "@mui/material/Snackbar";
import { Link, useNavigate } from "react-router-dom";
import { DataGrid } from "@mui/x-data-grid";
import StandardDataGridLayout from "../components/StandardDataGridLayout";
import { useColumnConfig } from "../hooks/useColumnConfig";
import MuiAlert from "@mui/material/Alert";
import { HexColorPicker } from "react-colorful";
import ConfirmationModal from "../components/ConfirmationModal";
import {
  TrashIcon,
  PencilSquareIcon,
  ArrowPathIcon,
  EllipsisVerticalIcon,
  PlusIcon,
  ArchiveBoxIcon,
  MapPinIcon,
  TagIcon,
  ClockIcon,
  CalendarIcon,
  ChevronLeftIcon,
  ChevronRightIcon,
  MagnifyingGlassIcon,
  ArrowUpTrayIcon,
  PhotoIcon,
} from "@heroicons/react/24/outline";
import CircularProgress from "@mui/material/CircularProgress";
import ReactQuillWrapper from "../components/ReactQuillWrapper";
import LessonDatesCalendar from "../components/LessonDatesCalendar";
import BookingFormStepPreview from "../components/BookingFormStepPreview";
import QRCodePopover from "../components/QRCodePopover";
import axios from "axios";

// Helper function to get authenticated axios instance
const getAuthenticatedAxios = () => {
  return axios.create({
    withCredentials: true,
  });
};

const Alert = React.forwardRef(function Alert(props, ref) {
  return <MuiAlert elevation={6} ref={ref} variant="filled" {...props} />;
});

export default function ServiceManagementPage() {
  const navigate = useNavigate();
  const isLocalHost =
    typeof window !== "undefined" &&
    (window.location.hostname.includes("localhost") ||
      window.location.hostname.includes("127.0.0.1"));
  const [services, setServices] = useState([]);
  const [editServiceDialogOpen, setEditServiceDialogOpen] = useState(false);
  const [editingService, setEditingService] = useState(null);
  const [confirmState, setConfirmState] = useState({ isOpen: false, action: null, title: '', message: '' });

  const [colourGroups, setColourGroups] = useState([]);
  const [colourGroup, setColourGroup] = useState("");
  const [newColourGroupName, setNewColourGroupName] = useState("");
  const [newColourGroupColor, setNewColourGroupColor] = useState("");
  const [editColourGroupDialogOpen, setEditColourGroupDialogOpen] =
    useState(false);
  const [showAddSubjectForm, setShowAddSubjectForm] = useState(false);
  const [editColourGroupId, setEditColourGroupId] = useState(null);
  const [isSaving, setIsSaving] = useState(false);

  const [editColourGroupName, setEditColourGroupName] = useState("");
  const [editColourGroupColor, setEditColourGroupColor] = useState("#000000");
  const [appointmentCounts, setAppointmentCounts] = useState({});
  const [searchQuery, setSearchQuery] = useState("");

  const [labels, setLabels] = useState([]);

  const [selectedLabel, setSelectedLabel] = useState({ id: "", name: "" });
  const [publicVisible, setPublicVisible] = useState(false);
  const [studentDiscountEnabled, setStudentDiscountEnabled] = useState(false);
  const [studentDiscountPercent, setStudentDiscountPercent] = useState(10);
  const [staffDiscountEnabled, setStaffDiscountEnabled] = useState(false);
  const [staffDiscountPercentMonthly, setStaffDiscountPercentMonthly] = useState(20);
  const [staffDiscountPercentTerm, setStaffDiscountPercentTerm] = useState(20);
  const [ownerDiscountEnabled, setOwnerDiscountEnabled] = useState(false);
  const [ownerDiscountPercentMonthly, setOwnerDiscountPercentMonthly] = useState(50);
  const [ownerDiscountPercentTerm, setOwnerDiscountPercentTerm] = useState(50);

  // Term billing state
  const [hasBookingForm, setHasBookingForm] = useState(false);
  const [termBillingEnabled, setTermBillingEnabled] = useState(false);
  const [termBillingConfig, setTermBillingConfig] = useState(null);
  // Rate per lesson state - kept for internal use but pulled from job/service pricing (not editable)
  const [ratePerLesson, setRatePerLesson] = useState('');
  const [termDiscountPercent, setTermDiscountPercent] = useState('');
  const [classDates, setClassDates] = useState([]);
  const [monthlySubscriptionEnabled, setMonthlySubscriptionEnabled] = useState(false);
  const [loadingTermBilling, setLoadingTermBilling] = useState(false);

  const [newImage, setNewImage] = useState(null);

  const [snackbar, setSnackbar] = useState({
    open: false,
    message: "",
    severity: "success",
  });

  const [isFetchingCounts, setIsFetchingCounts] = useState(false);

  const [serviceId, setServiceId] = useState("");
  const [manageImagesDialogOpen, setManageImagesDialogOpen] = useState(false);
  const [showAddLocationForm, setShowAddLocationForm] = useState(false);
  const [createEventDialogOpen, setCreateEventDialogOpen] = useState(false);
  
  // Event creation form state
  const [eventForm, setEventForm] = useState({
    eventName: '',
    eventType: '',
    location: '',
    price: '',
    description: '',
    maxParticipants: '',
    eventDate: ''
  });
  const [selectedImageId, setSelectedImageId] = useState(null);
  const [selectedImageName, setSelectedImageName] = useState("");

  // Students modal state
  const [studentsModalOpen, setStudentsModalOpen] = useState(false);
  const [selectedServiceStudents, setSelectedServiceStudents] = useState([]);
  const [selectedServiceName, setSelectedServiceName] = useState("");
  const [loadingStudents, setLoadingStudents] = useState(false);

  // Action menu state
  const [actionMenuAnchor, setActionMenuAnchor] = useState(null);
  const [selectedServiceForAction, setSelectedServiceForAction] = useState(null);

  // Sync menu state
  const [syncMenuAnchor, setSyncMenuAnchor] = useState(null);

  const [serviceName, setServiceName] = useState("");
  const [serviceDescription, setServiceDescription] = useState("");
  const [location, setLocation] = useState("");
  const [locations, setLocations] = useState([]);
  const [price, setPrice] = useState("");
  const [image, setImage] = useState(null);
  const [existingImages, setExistingImages] = useState([]);
  const [selectedImage, setSelectedImage] = useState("");
  const [imageSearchQuery, setImageSearchQuery] = useState("");
  const [imageUploading, setImageUploading] = useState(false);
  const [imageUploadFolder, setImageUploadFolder] = useState('booking-forms');
  const imageFileInputRef = useRef(null);
  const [newLocation, setNewLocation] = useState("");
  const [newLocationColor, setNewLocationColor] = useState("");
  const [searchTerm, setSearchTerm] = useState("");
  const [type, setType] = useState("one-off");
  const [editLocationDialogOpen, setEditLocationDialogOpen] = useState(false);
  const [editLocationId, setEditLocationId] = useState(null);
  const [editLocationName, setEditLocationName] = useState("");
  const [editLocationColor, setEditLocationColor] = useState("#000000");
  const [locationFilter, setLocationFilter] = useState("");
  const [colourGroupFilter, setColourGroupFilter] = useState("");
  const [typeFilter, setTypeFilter] = useState("");
  const [eventFilter, setEventFilter] = useState("");
  const [sortColumn, setSortColumn] = useState("name"); // Default alphabetical by service name
  const [sortDirection, setSortDirection] = useState("asc");

  const [rcrs, setRcrs] = useState("");
  const [dftMaxSrs, setDftMaxSrs] = useState("");

  const handleSort = (column) => {
    if (sortColumn === column) {
      setSortDirection(sortDirection === "asc" ? "desc" : "asc");
    } else {
      setSortColumn(column);
      setSortDirection("asc");
    }
  };

  useEffect(() => {
    // AUTO-ARCHIVE FEATURE DISABLED
    // Previously ran auto-archive check when component loads to clean up stale services
    // This was archiving services that have no future appointments scheduled 7+ days out
    // Disabled to prevent unintentional archiving of services
    // 
    // const runAutoArchive = async () => {
    //   try {
    //     const authAxios = getAuthenticatedAxios();
    //     const response = await authAxios.post('/api/services/auto-archive');
    //     if (response.data.archivedCount > 0) {
    //       console.log(`Auto-archived ${response.data.archivedCount} service(s) with no future appointments`);
    //     }
    //   } catch (error) {
    //     // Silently handle auto-archive errors - they're not critical
    //     // Log to console only in development
    //     if (process.env.NODE_ENV === 'development') {
    //       console.warn('⚠️ Auto-archive check failed (non-critical):', error?.message || error?.response?.data?.message || error?.message);
    //     }
    //     // Don't show error to user, don't log to console in production
    //   } finally {
    //     // Always fetch services after auto-archive check (whether it succeeded or failed)
    //     // This ensures the list is up-to-date after archiving
    //     fetchServices();
    //   }
    // };
    // 
    // Run auto-archive first, then fetch services (so archived services are removed from the list)
    // runAutoArchive();
    
    // Just fetch services directly without auto-archive
    fetchServices();
    
    // Fetch other data in parallel (these don't depend on services)
    fetchImages();
    fetchLocations();
    fetchLabels();
    fetchColourGroups();
    fetchAppointmentCounts();
  }, []);

  const fetchLabels = async () => {
    try {
      const authAxios = getAuthenticatedAxios();
      const response = await authAxios.get("/api/labels/");
      setLabels(response.data?.labels || []);
    } catch (error) {
      console.error("Error fetching labels:", error);
      setLabels([]);
    }
  };

  const fetchAppointmentCounts = async () => {
    try {
      const authAxios = getAuthenticatedAxios();
      const { data } = await authAxios.get("/api/services/appointments/count");
      const counts = {};

      if (Array.isArray(data)) {
        data.forEach((appt) => {
          const id = appt?.serviceId;
          if (id != null) {
            const k = String(id);
            counts[k] = (counts[k] || 0) + 1;
          }
        });
      } else if (data && typeof data === "object") {
        Object.entries(data).forEach(([id, val]) => {
          const k = String(id);
          if (typeof val === "number") counts[k] = val;
          else if (Array.isArray(val)) counts[k] = val.length;
          else counts[k] = 1;
        });
      }

      setAppointmentCounts(counts);
    } catch (error) {
      console.error("Error fetching appointment counts:", error);
      setAppointmentCounts({});
    }
  };

  const fetchColourGroups = async () => {
    try {
      const authAxios = getAuthenticatedAxios();
      const response = await authAxios.get("/api/colour-groups");
      setColourGroups(response.data || []);
    } catch (error) {
      console.error("Error fetching colour groups:", error);
      setColourGroups([]);
    }
  };

  const handleEditColourGroupOpen = (group) => {
    setEditColourGroupId(group.id);
    setEditColourGroupName(group.name);
    setEditColourGroupColor(group.color);
    setEditColourGroupDialogOpen(true);
  };

  const handleEditColourGroupClose = () => {
    setEditColourGroupDialogOpen(false);
    setEditColourGroupId(null);
    setEditColourGroupName("");
    setEditColourGroupColor("#000000");
    setShowAddSubjectForm(false);
    setNewColourGroupName("");
    setNewColourGroupColor("#000000");
  };

  const handleEditColourGroupSubmit = async () => {
    try {
      if (editColourGroupId !== null) {
        const authAxios = getAuthenticatedAxios();
        await authAxios.put(`/api/colour-groups/${editColourGroupId}`, {
          name: editColourGroupName,
          color: editColourGroupColor,
        });
        handleEditColourGroupClose();
        fetchColourGroups();
      }
    } catch (error) {
      console.error("Error updating colour group:", error);
    }
  };

  const handleColourGroupDelete = async (groupId) => {
    try {
      const authAxios = getAuthenticatedAxios();
      await authAxios.delete(`/api/colour-groups/${groupId}`);
      fetchColourGroups();
    } catch (error) {
      console.error("Error deleting colour group:", error);
    }
  };

  const handleNewColourGroupChange = async () => {
    try {
      if (!newColourGroupName.trim()) {
        setSnackbar({
          open: true,
          message: "Please enter a subject name",
          severity: "error",
        });
        return;
      }
      const authAxios = getAuthenticatedAxios();
      await authAxios.post("/api/colour-groups", {
        name: newColourGroupName,
        color: newColourGroupColor,
      });
      setNewColourGroupName("");
      setNewColourGroupColor("#000000");
      setShowAddSubjectForm(false);
      fetchColourGroups();
      setSnackbar({
        open: true,
        message: "Subject added successfully!",
        severity: "success",
      });
    } catch (error) {
      console.error("Error adding new colour group:", error);
      setSnackbar({
        open: true,
        message: "Failed to add subject",
        severity: "error",
      });
    }
  };

  const fetchLocations = async () => {
    try {
      const authAxios = getAuthenticatedAxios();
      const response = await authAxios.get("/api/locations");
      setLocations(response.data || []);
    } catch (error) {
      console.error("Error fetching locations:", error);
      setLocations([]);
    }
  };

  const syncServicesWithTutorCruncher = async () => {
    try {
      await axios.get("/api/sync-services");
      // Clear cache and refresh services list to show newly synced services
      await fetchServices(true); // Pass true to bypass cache
      setSnackbar({
        open: true,
        message: "Services synced from TutorCruncher successfully! Service Catalog refreshed.",
        severity: "success",
      });
    } catch (error) {
      console.error("Error syncing services with TutorCruncher:", error);
      setSnackbar({
        open: true,
        message: "Failed to sync services from TutorCruncher.",
        severity: "error",
      });
    }
  };

  const fetchServices = async (bypassCache = false) => {
    try {
      const authAxios = getAuthenticatedAxios();
      
      // Check for label filter in URL query parameters
      const urlParams = new URLSearchParams(window.location.search);
      const labelFilter = urlParams.get('label') || urlParams.get('labelName');
      
      // Build API URL with label filter if present
      let apiUrl = "/api/services";
      const queryParams = [];
      if (labelFilter) {
        queryParams.push(`label=${encodeURIComponent(labelFilter)}`);
        console.log(`Filtering services by label: ${labelFilter}`);
      }
      if (bypassCache) {
        queryParams.push('nocache=true');
      }
      if (queryParams.length > 0) {
        apiUrl += `?${queryParams.join('&')}`;
      }
      
      const response = await authAxios.get(apiUrl);
      // Handle paginated response (data.data) or direct array (data)
      const servicesData = response.data?.data || response.data || [];
      setServices(Array.isArray(servicesData) ? servicesData : []);
    } catch (error) {
      console.error("Error fetching services:", error);
      setServices([]);
    }
  };

  const fetchImages = async () => {
    try {
      const authAxios = getAuthenticatedAxios();
      const response = await authAxios.get("/api/images", {
        params: { folder: 'booking-forms' }
      });
      // Handle both old format (array of strings) and new format (array of objects)
      const images = response.data || [];
      const formattedImages = images
        .map(img => {
          if (typeof img === 'string') {
            return { url: img, folder: 'booking-forms', name: img.split('/').pop() || 'image' };
          }
          return {
            url: img.url || img,
            folder: img.folder || 'general',
            name: img.displayName || img.name || img.url?.split('/').pop() || 'image'
          };
        });
      setExistingImages(formattedImages);
    } catch (error) {
      console.error("Error fetching images:", error);
      setExistingImages([]);
    }
  };

  const fetchServiceDetails = async (serviceId) => {
    try {
      const response = await axios.get(
        `/api/tutorcruncher/services/${serviceId}`
      );
      const {
        name,
        description,
        location,
        price,
        image,
        type,
        dft_max_srs,
        rcrs,
      } = response.data;
      setServiceName(name);
      setServiceDescription(description);
      setLocation(location);
      setType(type);
      setPrice(price);
      setImage(image);
      setSelectedImage(image);
      setRcrs(rcrs);
      setDftMaxSrs(dft_max_srs);
    } catch (error) {
      console.error("Error fetching service details:", error);
    }
  };

  const fetchAndUpdateCounts = async (serviceId) => {
    try {
      const apiUrl = `/api/tutorcruncher/services/${serviceId}`;

      const response = await axios.get(apiUrl, { timeout: 30000 }); // 30 second timeout

      const { dft_max_srs, rcrs } = response.data;

      const updateUrl = `/api/services/${serviceId}/update-counts`;
      await axios.put(updateUrl, {
        dft_max_srs: dft_max_srs !== null ? dft_max_srs : 0,
        rcrs: Array.isArray(rcrs) ? rcrs.length : 0,
      }, { timeout: 10000 }); // 10 second timeout

      fetchServices();
      
      setSnackbar({
        open: true,
        message: `Successfully updated counts for service ${serviceId}`,
        severity: "success",
      });
    } catch (error) {
      // Handle 404 as a warning - service may not exist in TutorCruncher yet
      if (error.response?.status === 404) {
        console.warn(`Service ${serviceId} not found in TutorCruncher. Using local data.`);
        setSnackbar({
          open: true,
          message: `Service ${serviceId} not found in TutorCruncher. Using local data.`,
          severity: "warning",
        });
      } else {
        console.error("Error fetching or updating counts:", error);
        const errorMessage = error.response?.data?.error || error.response?.data?.details || error.message || 'Unknown error';
        setSnackbar({
          open: true,
          message: `Failed to fetch counts for service ${serviceId}: ${errorMessage}`,
          severity: "error",
        });
      }
    }
  };

  const handleFetchAllCounts = async () => {
    setIsFetchingCounts(true);
    for (const service of services) {
      await fetchAndUpdateCounts(service.serviceId);
      await new Promise((resolve) => setTimeout(resolve, 3000));
    }
    setIsFetchingCounts(false);
  };

  const handleNewLocationChange = async () => {
    try {
      if (!newLocation.trim()) {
        setSnackbar({
          open: true,
          message: "Please enter a location name",
          severity: "error",
        });
        return;
      }
      const authAxios = getAuthenticatedAxios();
      await authAxios.post("/api/locations", {
        name: newLocation,
        color: newLocationColor,
      });
      setNewLocation("");
      setNewLocationColor("#000000");
      setShowAddLocationForm(false);
      fetchLocations();
      setSnackbar({
        open: true,
        message: "Location added successfully!",
        severity: "success",
      });
    } catch (error) {
      console.error("Error adding new location:", error);
      setSnackbar({
        open: true,
        message: "Failed to add location",
        severity: "error",
      });
    }
  };

  const handleEditLocationOpen = (location) => {
    setEditLocationId(location.id);
    setEditLocationName(location.name);
    setEditLocationColor(location.color);
    setEditLocationDialogOpen(true);
  };

  const handleServiceIdChange = (e) => {
    const newServiceId = e.target.value;
    setServiceId(newServiceId);
    if (newServiceId) {
      fetchServiceDetails(newServiceId);
    } else {
      setServiceName("");
      setServiceDescription("");
      setLocation("");
      setPrice("");
      setImage(null);
      setSelectedImage("");
    }
  };

  const getColourGroupColor = (name) => {
    if (!name) return "#ccc";
    const match = colourGroups.find((group) => group.name === name);
    return match?.color || "#ccc";
  };

  const handleSyncAllBookingConfigs = async () => {
    try {
      const response = await axios.post(
        "/api/booking-types/sync-all-from-services",
        {},
        {
          headers: {
            'Content-Type': 'application/json'
          }
        }
      );
      // Clear cache and refresh services list after syncing to booking backend
      await fetchServices(true); // Pass true to bypass cache
      setSnackbar({
        open: true,
        message: `All booking configs synced successfully! Service Catalog refreshed.`,
        severity: "success",
      });
    } catch (error) {
      console.error("Bulk sync failed:", error);
      setSnackbar({
        open: true,
        message: "Failed to sync all booking configs.",
        severity: "error",
      });
    }
  };

  const handleSyncBookingConfig = async (service) => {
    try {
      await axios.post("/api/booking-types/sync-from-service", {
        serviceId: service.serviceId,
      }, {
        timeout: 15000, // 15 second timeout
        headers: {
          'Content-Type': 'application/json'
        }
      });

      setSnackbar({
        open: true,
        message: `Booking config synced for ${service.name}`,
        severity: "success",
      });
    } catch (error) {
      console.error("Error syncing booking config:", error);
      setSnackbar({
        open: true,
        message: "Failed to sync booking config",
        severity: "error",
      });
    }
  };

  const handleRefetchAppointments = async (serviceId) => {
    try {
      const authAxios = getAuthenticatedAxios();
      const apiUrl = `/api/sync-appointments/${serviceId}`;
      // Add timeout to prevent hanging
      await authAxios.get(apiUrl, { timeout: 30000 }); // 30 second timeout
      
      // Always check if there's a term billing config for this service and update it
      try {
        // Check if term billing config exists for this service
        const configResponse = await authAxios.get(`/api/term-billing/config/${serviceId}`, {
          validateStatus: (status) => status < 500,
        });
        
        if (configResponse.status === 200 && configResponse.data?.config?.id) {
          // Fetch updated future dates from synced appointments
          const futureDatesResponse = await authAxios.get(`/api/term-billing/future-dates/${serviceId}`);
          
          if (futureDatesResponse.data?.dates && futureDatesResponse.data.dates.length > 0) {
            const newDates = futureDatesResponse.data.dates;
            
            // Update term billing config with new dates
            try {
              await authAxios.put(`/api/term-billing/config/${configResponse.data.config.id}`, {
                classDates: newDates
              });
              
              // If this is the service currently being edited, update the UI state
              if (serviceId === editingService?.serviceId) {
                setClassDates(newDates);
              }
              
              setSnackbar({
                open: true,
                message: `Appointments synced and term billing config updated. ${newDates.length} lessons found.`,
                severity: "success",
              });
            } catch (updateError) {
              console.error('Error updating term billing config:', updateError);
              setSnackbar({
                open: true,
                message: `Appointments synced, but failed to update term billing config: ${updateError.response?.data?.error || updateError.message}`,
                severity: "warning",
              });
            }
          } else {
            setSnackbar({
              open: true,
              message: `Appointments synced from TutorCruncher. No future appointments found for term billing.`,
              severity: "success",
            });
          }
        } else {
          // No term billing config exists, just sync appointments
          setSnackbar({
            open: true,
            message: `Appointments synced from TutorCruncher.`,
            severity: "success",
          });
        }
      } catch (configError) {
        console.error('Error checking/updating term billing config:', configError);
        // Don't fail the whole operation if config check fails
        setSnackbar({
          open: true,
          message: `Appointments synced from TutorCruncher.`,
          severity: "success",
        });
      }
    } catch (error) {
      // Handle 404 as a warning - service may not exist in TutorCruncher yet
      if (error.response?.status === 404) {
        console.warn(`Service ${serviceId} not found in TutorCruncher. No appointments to sync.`);
        setSnackbar({
          open: true,
          message: `Service ${serviceId} not found in TutorCruncher. No appointments to sync.`,
          severity: "warning",
        });
      } else {
        // Properly serialize error for logging
        const errorDetails = {
          message: error.message,
          status: error.response?.status,
          statusText: error.response?.statusText,
          data: error.response?.data,
          serviceId: serviceId
        };
        console.error(
          `Error refetching appointments for service ${serviceId}:`,
          JSON.stringify(errorDetails, null, 2)
        );
        setSnackbar({
          open: true,
          message: `Failed to refetch appointments: ${error.response?.data?.error || error.message}`,
          severity: "error",
        });
      }
    }
  };


  const handleStudentsClick = async (serviceId, serviceName) => {
    setLoadingStudents(true);
    setSelectedServiceName(serviceName);
    setStudentsModalOpen(true);
    
    try {
      const response = await axios.get(`/api/services/${serviceId}/students`);
      setSelectedServiceStudents(response.data.students || []);
      
      if (!response.data.students || response.data.students.length === 0) {
        setSnackbar({
          open: true,
          message: "No students found for this service.",
          severity: "info",
        });
      }
    } catch (error) {
      console.error('Error fetching students:', error);
      setSelectedServiceStudents([]);
      setSnackbar({
        open: true,
        message: `Failed to fetch students: ${error.response?.data?.error || error.message}`,
        severity: "error",
      });
    } finally {
      setLoadingStudents(false);
    }
  };

  const handleTypeChange = async (newType) => {
    setType(newType || "");
    // Skip remote price fetch in local dev to avoid noisy 500s
    if (serviceId && !isLocalHost) {
      try {
        const response = await axios.get(
          `/api/tutorcruncher/services/${serviceId}`
        );
        const { price } = response.data || {};
        if (typeof price === 'number') setPrice(price);
      } catch (error) {
        console.error(
          "Error fetching service details for price adjustment:",
          error
        );
      }
    }
  };

  
const runPostSaveSyncs = async (id, name) => {
  // Skip noisy background syncs in local dev
  if (isLocalHost) {
    // Add a small delay to ensure the save is committed before refetching
    setTimeout(() => {
      fetchServices();
      fetchAppointmentCounts();
    }, 500);
    return;
  }

  // Run these operations asynchronously without blocking the UI
  Promise.allSettled([
    fetchAndUpdateCounts(id),
    handleSyncBookingConfig({ serviceId: id, name }),
    handleRefetchAppointments(id),
  ]).then((results) => {
    // Add a small delay before refetching to ensure database changes are committed
    // Cache is already invalidated on the server, so we'll get fresh data
    setTimeout(() => {
      fetchServices();
      fetchAppointmentCounts();
    }, 500); // 500ms delay to ensure DB commit
    
    // Show completion notification
    const failed = results.filter(result => result.status === 'rejected').length;
    if (failed === 0) {
      setSnackbar({
        open: true,
        message: "Background sync operations completed successfully!",
        severity: "success",
      });
    } else if (failed < results.length) {
      setSnackbar({
        open: true,
        message: `Background sync completed with ${failed} operation(s) failed.`,
        severity: "warning",
      });
    }
  }).catch(error => {
    console.error('Post-save sync operations failed:', error);
    // Still refresh data even if some operations failed, with delay
    setTimeout(() => {
      fetchServices();
      fetchAppointmentCounts();
    }, 1000);
    
    setSnackbar({
      open: true,
      message: "Background sync operations failed. Data may not be fully up to date.",
      severity: "error",
    });
  });
};


  const handleServiceSubmit = async () => {
    try {
      setIsSaving(true);
      let basePrice = Number(price) || 0;
      if (!isLocalHost) {
        try {
          const { data } = await axios.get(
            `/api/tutorcruncher/services/${serviceId}`
          );
          if (data && typeof data.price !== 'undefined') {
            basePrice = data.price;
          }
        } catch (e) {
          console.warn('Falling back to local price; TutorCruncher lookup failed:', e?.message || e);
        }
      }

      const formData = new FormData();
      formData.append("serviceId", serviceId);
      formData.append("name", serviceName);
      formData.append("description", serviceDescription);
      formData.append("location", location);
      formData.append("type", type);
      formData.append("price", basePrice);
      formData.append("colourGroup", colourGroup);
      formData.append("labelId", selectedLabel.id);
      formData.append("labelName", selectedLabel.name);
      formData.append("publicVisible", publicVisible);
      formData.append("studentDiscountEnabled", studentDiscountEnabled);
      formData.append("studentDiscountPercent", studentDiscountPercent);
      formData.append("staffDiscountEnabled", staffDiscountEnabled);
      formData.append("staffDiscountPercentMonthly", staffDiscountPercentMonthly);
      formData.append("staffDiscountPercentTerm", staffDiscountPercentTerm);
      formData.append("ownerDiscountEnabled", ownerDiscountEnabled);
      formData.append("ownerDiscountPercentMonthly", ownerDiscountPercentMonthly);
      formData.append("ownerDiscountPercentTerm", ownerDiscountPercentTerm);

      if (image) {
        formData.append("image", image);
      } else {
        formData.append("selectedImage", selectedImage);
      }

      const authAxios = getAuthenticatedAxios();
      await authAxios.post("/api/services", formData, {
        headers: { "Content-Type": "multipart/form-data" },
      });

      setSnackbar({
        open: true,
        message: "Service saved successfully! Background sync operations are running...",
        severity: "success",
      });

      const updatedService = {
        serviceId,
        name: serviceName,
        description: serviceDescription,
        location,
        type,
        price: basePrice,
        colourGroup,
        labelId: selectedLabel.id,
        labelName: selectedLabel.name,
        publicVisible: publicVisible,
        studentDiscountEnabled,
        studentDiscountPercent,
        staffDiscountEnabled,
        staffDiscountPercentMonthly,
        staffDiscountPercentTerm,
        ownerDiscountEnabled,
        ownerDiscountPercentMonthly,
        ownerDiscountPercentTerm,
        image: image ? URL.createObjectURL(image) : selectedImage,
      };

      setServices((prevServices) => {
        const index = prevServices.findIndex((s) => s.serviceId === serviceId);
        if (index > -1) {
          const newServices = [...prevServices];
          newServices[index] = updatedService;
          return newServices;
        } else {
          return [updatedService, ...prevServices];
        }
      });

      setServiceId("");
      setServiceName("");
      setServiceDescription("");
      setLocation("");
      setPrice("");
      setColourGroup("");
      setImage(null);
      setSelectedImage("");
      setSelectedLabel({ id: "", name: "" });
      setPublicVisible(false);
      setStudentDiscountEnabled(false);
      setStudentDiscountPercent(10);
      setStaffDiscountEnabled(false);
      setStaffDiscountPercentMonthly(20);
      setStaffDiscountPercentTerm(20);

      // await axios.post("/api/services", formData, {
      
      
      
      
      
      
      
      
      
  
   await runPostSaveSyncs(updatedService.serviceId, updatedService.name);
   
   // Save term billing configuration if enabled and service has booking form
   if (hasBookingForm && termBillingEnabled && serviceId) {
     // Validate that classDates is not empty
     if (!classDates || !Array.isArray(classDates) || classDates.length === 0) {
       setSnackbar({
         open: true,
         message: "Service saved, but term billing configuration requires at least one class date. Please add class dates before enabling monthly billing.",
         severity: "warning",
       });
     } else {
     try {
       const authAxios = getAuthenticatedAxios();
       
         // Check if config already exists - if so, update it instead of creating new
         let existingConfigId = null;
       try {
         const existingConfigResponse = await authAxios.get(`/api/term-billing/config/${serviceId}`, {
           validateStatus: (status) => status < 500,
         });
         if (existingConfigResponse.status === 200 && existingConfigResponse.data.config?.id) {
             existingConfigId = existingConfigResponse.data.config.id;
         }
       } catch (e) {
           // Config doesn't exist, that's fine - we'll create new
       }
       
       const termBillingPayload = {
         serviceId,
         termName: `${serviceName} Term`,
         ratePerLesson: parseFloat(price) || 0, // Pulled directly from job/service pricing
         termDiscountPercent: termDiscountPercent ? parseFloat(termDiscountPercent) : null,
         familyDiscountPercent: studentDiscountEnabled ? studentDiscountPercent : null,
         classDates: classDates,
         monthlySubscriptionEnabled: monthlySubscriptionEnabled,
       };
       
         if (existingConfigId) {
           // Update existing config
           await authAxios.put(`/api/term-billing/config/${existingConfigId}`, {
             classDates: classDates,
             termDiscountPercent: termDiscountPercent ? parseFloat(termDiscountPercent) : null,
             monthlySubscriptionEnabled: monthlySubscriptionEnabled,
           });
         } else {
           // Create new config
       await authAxios.post('/api/term-billing/create-config', termBillingPayload);
         }
     } catch (error) {
       console.error('Error saving term billing config:', error);
         console.error('Full error response:', error.response?.data);
         console.error('Error details:', {
           message: error.message,
           status: error.response?.status,
           data: error.response?.data,
           serviceId,
           classDatesCount: classDates?.length || 0,
           classDates: classDates
         });
         
       // Don't fail the entire save if term billing save fails
         const errorMessage = error.response?.data?.error || error.response?.data?.message || error.message || 'Unknown error';
         const errorDetails = error.response?.data?.details || error.response?.data?.hint || '';
         const fullErrorMessage = errorDetails ? `${errorMessage}. ${errorDetails}` : errorMessage;
         
       setSnackbar({
         open: true,
           message: `Service saved, but term billing configuration failed to save: ${fullErrorMessage}. Please check that class dates are set and try again.`,
         severity: "warning",
       });
       }
     }
   } else if (hasBookingForm && !termBillingEnabled && termBillingConfig) {
     // Delete term billing config if it was disabled
     try {
       const authAxios = getAuthenticatedAxios();
       // Try to use configId from the termBillingConfig object first
       const configId = termBillingConfig.id || termBillingConfig.configId;
       if (configId) {
         await authAxios.delete(`/api/term-billing/config/${configId}`);
       } else {
         // Fallback: use serviceId with alternative endpoint
         await authAxios.delete(`/api/term-billing/config-by-service/${serviceId}`);
       }
     } catch (error) {
       console.error('Error deleting term billing config:', error);
       // Don't fail the entire save - config might already be deleted or not exist
       // This is non-critical, so we continue with the service save
     }
   }
   
   setEditServiceDialogOpen(false);
    } catch (error) {
      console.error("Error saving service:", error);
      setSnackbar({
        open: true,
        message: "Failed to save service.",
        severity: "error",
      });
    } finally {
      setIsSaving(false);
    }
  };

  const handleServiceArchive = async (serviceId) => {
    try {
      console.log(`📦 Attempting to archive service: ${serviceId} (type: ${typeof serviceId})`);
      const authAxios = getAuthenticatedAxios();
      const response = await authAxios.post(`/api/services/${serviceId}/archive`);
      console.log('✅ Archive response:', response.data);
      fetchServices();
      setSnackbar({
        open: true,
        message: `Service archived successfully!${response.data?.serviceName ? ` (${response.data.serviceName})` : ''}. You can view archived services in Service History.`,
        severity: "success",
      });
    } catch (error) {
      // Properly serialize error for logging
      const errorDetails = {
        message: error.message,
        status: error.response?.status,
        statusText: error.response?.statusText,
        data: error.response?.data,
        serviceId: serviceId
      };
      console.error("Error archiving service:", JSON.stringify(errorDetails, null, 2));
      
      const errorData = error.response?.data || {};
      const errorMessage = errorData.error || errorData.message || errorData.details || error.message || 'Failed to archive service';
      const serviceIdInfo = errorData.serviceId ? ` (ID: ${errorData.serviceId})` : serviceId ? ` (ID: ${serviceId})` : '';
      
      setSnackbar({
        open: true,
        message: `Failed to archive service${serviceIdInfo}: ${errorMessage}`,
        severity: "error",
      });
    }
  };

  const handleServiceDelete = async (serviceId) => {
    try {
      console.log(`🗑️ Attempting to delete service: ${serviceId} (type: ${typeof serviceId})`);
      const authAxios = getAuthenticatedAxios();
      const response = await authAxios.delete(`/api/services/${serviceId}`);
      console.log('✅ Delete response:', response.data);
      fetchServices();
      setSnackbar({
        open: true,
        message: `Service deleted successfully!${response.data?.serviceName ? ` (${response.data.serviceName})` : ''}`,
        severity: "success",
      });
    } catch (error) {
      // Properly serialize error for logging
      const errorDetails = {
        message: error.message,
        status: error.response?.status,
        statusText: error.response?.statusText,
        data: error.response?.data,
        serviceId: serviceId
      };
      console.error("Error deleting service:", JSON.stringify(errorDetails, null, 2));
      
      const errorData = error.response?.data || {};
      let errorMessage = errorData.error || errorData.message || errorData.details || error.message || 'Failed to delete service';
      const serviceIdInfo = errorData.serviceId ? ` (ID: ${errorData.serviceId})` : serviceId ? ` (ID: ${serviceId})` : '';
      
      // Special handling for non-curated services
      if (errorData.isRawService || error.response?.status === 400) {
        errorMessage = errorData.message || errorMessage;
      }
      
      setSnackbar({
        open: true,
        message: `Failed to delete service${serviceIdInfo}: ${errorMessage}`,
        severity: "error",
      });
    }
  };

  const handleSearchChange = (e) => {
    setSearchTerm(e.target.value);
  };

  const handleImageChange = (e) => {
    setNewImage(e.target.files[0]);
  };

  const handleImageUpload = async () => {
    if (newImage) {
      setImageUploading(true);
      const formData = new FormData();
      formData.append("image", newImage);
      formData.append("folder", imageUploadFolder);

      try {
        const authAxios = getAuthenticatedAxios();
        const response = await authAxios.post("/api/images", formData, {
          headers: {
            "Content-Type": "multipart/form-data",
          },
        });

        setNewImage(null);
        await fetchImages();
        // Auto-select the newly uploaded image
        if (response.data?.imageUrl) {
          setSelectedImage(response.data.imageUrl);
        }
        setSnackbar({
          open: true,
          message: "Image uploaded successfully!",
          severity: "success"
        });
      } catch (error) {
        console.error("Error uploading image:", error);
        setSnackbar({
          open: true,
          message: "Failed to upload image. Please try again.",
          severity: "error"
        });
      } finally {
        setImageUploading(false);
      }
    }
  };

  // Filter images based on search query (already filtered to booking-forms folder from API)
  const filteredImages = React.useMemo(() => {
    if (!imageSearchQuery) return existingImages;
    const query = imageSearchQuery.toLowerCase();
    return existingImages.filter(img => {
      const url = img.url || img;
      const name = img.name || url.split('/').pop() || '';
      return url.toLowerCase().includes(query) || name.toLowerCase().includes(query);
    });
  }, [existingImages, imageSearchQuery]);

  const handleServiceEdit = async (service) => {
    setEditingService(service);
    setEditServiceDialogOpen(true);
    setServiceId(service.serviceId);
    setServiceName(service.name);
    setServiceDescription(service.description);
    setLocation(service.location || "");
    setType(service.type || "");
    setPrice(service.price);
    setImage(null);
    setSelectedImage(service.image);
    setColourGroup(service.colourGroup || "");
    setSelectedLabel({
      id: service.labelId || "",
      name: service.labelName || "",
    });
    setPublicVisible(service.publicVisible || false);
    setStudentDiscountEnabled(!!service.studentDiscountEnabled);
    setStudentDiscountPercent(
      typeof service.studentDiscountPercent === 'number' && !isNaN(service.studentDiscountPercent)
        ? service.studentDiscountPercent
        : 10
    );
    setStaffDiscountEnabled(!!service.staffDiscountEnabled);
    setStaffDiscountPercentMonthly(
      typeof service.staffDiscountPercentMonthly === 'number' && !isNaN(service.staffDiscountPercentMonthly)
        ? service.staffDiscountPercentMonthly
        : 20
    );
    setStaffDiscountPercentTerm(
      typeof service.staffDiscountPercentTerm === 'number' && !isNaN(service.staffDiscountPercentTerm)
        ? service.staffDiscountPercentTerm
        : 20
    );
    setOwnerDiscountEnabled(!!service.ownerDiscountEnabled);
    setOwnerDiscountPercentMonthly(
      typeof service.ownerDiscountPercentMonthly === 'number' && !isNaN(service.ownerDiscountPercentMonthly)
        ? service.ownerDiscountPercentMonthly
        : 50
    );
    setOwnerDiscountPercentTerm(
      typeof service.ownerDiscountPercentTerm === 'number' && !isNaN(service.ownerDiscountPercentTerm)
        ? service.ownerDiscountPercentTerm
        : 50
    );

    // Reset term billing state
    setTermBillingEnabled(false);
    setTermBillingConfig(null);
    // Auto-populate rate per lesson from service price
    setRatePerLesson(service.price ? String(service.price) : '');
    setTermDiscountPercent('');
    setClassDates([]);
    setMonthlySubscriptionEnabled(false);
    
    // Always allow booking form configuration for any service (even if booking type doesn't exist yet)
    // This allows users to configure options when creating a new booking form
    setHasBookingForm(true);
    
    // Check if service has booking form and load term billing config
    setLoadingTermBilling(true);
    try {
      const authAxios = getAuthenticatedAxios();
      
      // Check if booking form exists (for loading existing config, but don't hide UI if it doesn't)
      try {
        const bookingTypesResponse = await authAxios.get('/api/booking-types');
        const bookingTypes = Array.isArray(bookingTypesResponse.data) 
          ? bookingTypesResponse.data 
          : bookingTypesResponse.data.rows || [];
        const hasForm = bookingTypes.some(bt => String(bt.serviceId) === String(service.serviceId));
        // Note: We keep hasBookingForm as true to always show the UI, but we can use hasForm for other logic if needed
        
        // Try to load existing term billing config (whether booking type exists or not)
        try {
          const configResponse = await authAxios.get(`/api/term-billing/config/${service.serviceId}`, {
            validateStatus: (status) => status < 500, // Don't throw for 404
          });
          
          if (configResponse.status === 200 && configResponse.data?.config) {
            const config = configResponse.data.config;
            setTermBillingEnabled(true);
            setTermBillingConfig(config);
            // Rate per lesson is now pulled from job/service pricing, not stored in config
            setTermDiscountPercent(config.term_discount_percent || '');
            setMonthlySubscriptionEnabled(!!config.monthly_subscription_enabled);
            
            // Parse class dates
            let dates = config.class_dates || [];
            if (typeof dates === 'string') {
              try {
                dates = JSON.parse(dates);
              } catch (e) {
                dates = [];
              }
            }
            setClassDates(Array.isArray(dates) ? dates : []);
          } else {
            // No term billing config exists yet - this is normal
            setTermBillingEnabled(false);
            setTermBillingConfig(null);
            
            // Try to load future dates as defaults
            try {
              const futureDatesResponse = await authAxios.get(`/api/term-billing/future-dates/${service.serviceId}`, {
                validateStatus: (status) => status < 500,
              });
              if (futureDatesResponse.status === 200 && futureDatesResponse.data?.dates && futureDatesResponse.data.dates.length > 0) {
                setClassDates(futureDatesResponse.data.dates);
              }
            } catch (e) {
              // No future dates available, that's okay - silently handle
            }
          }
        } catch (err) {
          // Only log non-404 errors
          if (err.response?.status !== 404 && err.response?.status !== undefined) {
            console.error('Error loading term billing config:', err);
          }
          // Silently handle 404s - service just doesn't have term billing configured yet
          setTermBillingEnabled(false);
          setTermBillingConfig(null);
        }
      } catch (err) {
        console.error('Error checking booking form:', err);
        // Don't set hasBookingForm to false - keep it true so UI is always available
      }
    } finally {
      setLoadingTermBilling(false);
    }
    
    // Refresh images when dialog opens
    fetchImages();
    setImageSearchQuery("");
  };

  const handleManageImagesOpen = () => {
    setManageImagesDialogOpen(true);
  };

  const handleManageImagesClose = () => {
    setManageImagesDialogOpen(false);
  };

  const handleEventFormChange = (field, value) => {
    setEventForm(prev => ({
      ...prev,
      [field]: value
    }));
  };

  const handleCreateEvent = async () => {
    try {
      setIsSaving(true);
      
      const authAxios = getAuthenticatedAxios();
      const response = await authAxios.post('/api/services/create-event', eventForm);
      
      setSnackbar({
        open: true,
        message: `Event "${eventForm.eventName}" created successfully in TutorCruncher!`,
        severity: "success"
      });
      
      // Reset form and close dialog
      setEventForm({
        eventName: '',
        eventType: '',
        location: '',
        price: '',
        description: '',
        maxParticipants: '',
        eventDate: ''
      });
      setCreateEventDialogOpen(false);
      
      // Refresh services list
      fetchServices();
      
    } catch (error) {
      console.error('Error creating event:', error);
      setSnackbar({
        open: true,
        message: `Failed to create event: ${error.response?.data?.error || error.message}`,
        severity: "error"
      });
    } finally {
      setIsSaving(false);
    }
  };

  const handleImageDelete = async (image) => {
    try {
      const authAxios = getAuthenticatedAxios();
      const imgUrl = typeof image === 'string' ? image : image.url;
      await authAxios.delete(`/api/images`, { data: { image: imgUrl } });

      setExistingImages((prevImages) =>
        prevImages.filter((img) => {
          const url = typeof img === 'string' ? img : img.url;
          return url !== imgUrl;
        })
      );
      
      // If deleted image was selected, clear selection
      if (selectedImage === imgUrl) {
        setSelectedImage("");
      }
    } catch (error) {
      console.error("Error deleting image:", error);
    }
  };

  const handleEditLocationClose = () => {
    setEditLocationDialogOpen(false);
    setEditLocationId(null);
    setEditLocationName("");
    setEditLocationColor("#000000");
    setShowAddLocationForm(false);
    setNewLocation("");
    setNewLocationColor("#000000");
  };

  const handleEditLocationSubmit = async () => {
    try {
      if (editLocationId !== null) {
        const authAxios = getAuthenticatedAxios();
        await authAxios.put(`/api/locations/${editLocationId}`, {
          name: editLocationName,
          color: editLocationColor,
        });
        handleEditLocationClose();
        fetchLocations();
      }
    } catch (error) {
      console.error("Error updating location:", error);
    }
  };

  const handleLocationDelete = async (locationId) => {
    try {
      const authAxios = getAuthenticatedAxios();
      await authAxios.delete(`/api/locations/${locationId}`);
      fetchLocations();
    } catch (error) {
      console.error("Error deleting location:", error);
    }
  };

  // Ensure services is always an array
  const servicesArray = Array.isArray(services) ? services : [];
  
  const filteredServices = servicesArray
    .filter(
      (service) =>
        (service.serviceId || "")
          .toLowerCase()
          .includes(searchTerm.toLowerCase()) ||
        (service.name || "").toLowerCase().includes(searchTerm.toLowerCase()) ||
        (service.description || "")
          .toLowerCase()
          .includes(searchTerm.toLowerCase()) ||
        (service.location || "")
          .toLowerCase()
          .includes(searchTerm.toLowerCase())
    )
    .filter(
      (service) =>
        (!locationFilter || (locationFilter === 'No Location' ? !service.location : service.location === locationFilter)) &&
        (!colourGroupFilter || service.colourGroup === colourGroupFilter) &&
        (!typeFilter || service.type === typeFilter) &&
        (!eventFilter || 
          (eventFilter === "events" && service.labelName === "Event") ||
          (eventFilter === "sync-to-website" && service.labelName === "sync to website") ||
          (eventFilter === "both" && service.labelName === "Event" && service.labelName === "sync to website")
        )
    )

    .sort((a, b) => {
      if (!sortColumn) return 0;
      const valueA = a[sortColumn] || "";
      const valueB = b[sortColumn] || "";
      if (sortDirection === "asc") {
        return valueA.localeCompare(valueB);
      } else {
        return valueB.localeCompare(valueA);
      }
    });

  // Filter by search query
  const searchFilteredServices = searchQuery
    ? filteredServices.filter((s) => {
        const query = searchQuery.toLowerCase();
        return (
          s.name?.toLowerCase().includes(query) ||
          s.serviceId?.toString().includes(query) ||
          s.location?.toLowerCase().includes(query) ||
          s.type?.toLowerCase().includes(query) ||
          s.colourGroup?.toLowerCase().includes(query) ||
          s.labelName?.toLowerCase().includes(query)
        );
      })
    : filteredServices;

  const rows = searchFilteredServices
    .filter((s) => s && s.serviceId)
    .map((s) => ({ id: s.serviceId, ...s }));

  const toInt = (v) => {
    if (v == null) return undefined;
    if (Array.isArray(v)) return v.length;
    const n = Number(v);
    return Number.isFinite(n) ? n : undefined;
  };

  const getApptCount = (sid, map) => {
    if (sid == null) return 0;
    const a = map?.[String(sid)];
    const b = map?.[Number(sid)];
    const val = a ?? b;
    if (Array.isArray(val)) return val.length;
    const n = Number(val);
    return Number.isFinite(n) ? n : 0;
  };

  const handleActionMenuOpen = (event, service) => {
    event.stopPropagation();
    setActionMenuAnchor(event.currentTarget);
    setSelectedServiceForAction(service);
  };

  const handleActionMenuClose = () => {
    setActionMenuAnchor(null);
    setSelectedServiceForAction(null);
  };

  const handleActionClick = (action) => {
    if (!selectedServiceForAction) return;
    
    switch (action) {
      case 'edit':
        handleServiceEdit(selectedServiceForAction);
        break;
      case 'delete':
        handleServiceDelete(selectedServiceForAction.serviceId);
        break;
      case 'update-counts':
        fetchAndUpdateCounts(selectedServiceForAction.serviceId);
        break;
      case 'sync-booking':
        handleSyncBookingConfig(selectedServiceForAction);
        break;
      case 'refetch-appointments':
        handleRefetchAppointments(selectedServiceForAction.serviceId);
        break;
      case 'archive':
        handleServiceArchive(selectedServiceForAction.serviceId);
        break;
      default:
        break;
    }
    handleActionMenuClose();
  };

  // Compute location tab counts
  const locationCounts = {};
  let allCount = 0;
  const servicesForCounting = servicesArray.filter(s => s && s.serviceId);
  servicesForCounting.forEach(s => {
    allCount++;
    const loc = s.location || 'No Location';
    locationCounts[loc] = (locationCounts[loc] || 0) + 1;
  });

  const columns = [
    {
      field: "actions",
      headerName: "",
      width: 90,
      sortable: false,
      filterable: false,
      renderCell: (params) => {
        const s = params?.row;
        if (!s) return null;
        return (
          <div style={{ display: 'flex', alignItems: 'center', gap: 2 }}>
            <Tooltip title="Edit" arrow>
              <IconButton size="small" aria-label="edit" onClick={(e) => { e.stopPropagation(); handleServiceEdit(s); }} sx={{ p: 0.3 }}>
                <PencilSquareIcon className="h-4 w-4" />
              </IconButton>
            </Tooltip>
            <Tooltip title="Archive" arrow>
              <IconButton size="small" aria-label="archive" onClick={(e) => { e.stopPropagation(); handleServiceArchive(s.serviceId); }} sx={{ p: 0.3, color: 'warning.main' }}>
                <ArchiveBoxIcon className="h-4 w-4" />
              </IconButton>
            </Tooltip>
          </div>
        );
      },
      pinned: "left",
    },
    { field: "name", headerName: "Service Name", flex: 2, minWidth: 220 },
    {
      field: "serviceId",
      headerName: "ID",
      width: 80,
      renderCell: (params) => {
        const serviceId = params?.value;
        if (!serviceId) return "N/A";

        const tutorCruncherUrl = `https://account.acmeops.com/cal/service/${serviceId}/`;

        return (
          <a
            href={tutorCruncherUrl}
            target="_blank"
            rel="noopener noreferrer"
            style={{
              color: '#1976d2',
              textDecoration: 'underline',
              cursor: 'pointer',
              fontWeight: '500',
              fontSize: '0.8rem'
            }}
            onClick={(e) => e.stopPropagation()}
          >
            {serviceId}
          </a>
        );
      }
    },
    { field: "location", headerName: "Location", width: 120 },

    {
      field: "price",
      headerName: "Price",
      width: 70,
    },

    {
      field: "colourGroup",
      headerName: "Subject",
      width: 100,
      renderCell: (params) => {
        const value = params?.value;
        const color = getColourGroupColor(value);
        return (
          <div style={{ display: "flex", alignItems: "center" }}>
            <div
              style={{
                backgroundColor: color || "#ccc",
                width: 14,
                height: 14,
                marginRight: 6,
                borderRadius: 3,
              }}
            />
            <span style={{ fontSize: '0.8rem' }}>{value || "—"}</span>
          </div>
        );
      },
    },

    {
      field: "rcrs",
      headerName: "Students",
      width: 70,
      sortable: false,
      renderCell: (params) => {
        const studentCount = params?.value;
        const serviceId = params?.row?.serviceId;
        const serviceName = params?.row?.name;

        if (!studentCount || studentCount === 0) {
          return <span className="text-neutral-400">0</span>;
        }

        return (
          <span
            style={{
              color: '#1976d2',
              textDecoration: 'underline',
              cursor: 'pointer',
              fontWeight: '500'
            }}
            onClick={(e) => {
              e.stopPropagation();
              handleStudentsClick(serviceId, serviceName);
            }}
          >
            {studentCount}
          </span>
        );
      }
    },

    {
      field: "dft_max_srs",
      headerName: "Spots",
      width: 60,
      sortable: false,
    },

    {
      field: "lessons",
      headerName: "Lessons",
      width: 70,
      sortable: false,
      valueGetter: (params) => {
        const sid = params?.row?.serviceId;
        return getApptCount(sid, appointmentCounts);
      },
    },

    {
      field: "goToForm",
      headerName: "Form",
      width: 80,
      sortable: false,
      filterable: false,
      renderCell: ({ row }) => {
        const to = row.serviceId
          ? `/booking-forms/frontend?serviceId=${row.serviceId}`
          : `/booking-forms/frontend?bookingTypeId=${row.id}`;

        return (
          <Button
            size="small"
            variant="text"
            component={Link}
            to={to}
            sx={{ textTransform: "none", p: '2px 4px', fontSize: '0.75rem', minWidth: 0, color: '#1976d2' }}
          >
            Go →
          </Button>
        );
      },
    },

    {
      field: "qrCode",
      headerName: "QR",
      width: 45,
      sortable: false,
      filterable: false,
      renderCell: ({ row }) => {
        if (!row.serviceId) return null;
        return (
          <QRCodePopover
            serviceId={row.serviceId}
            serviceName={row.name}
            size="small"
            autoGenerate={false}
          />
        );
      },
    },

    { field: "labelName", headerName: "Label", width: 120 },
  ];

  // Use autoHeight to let the DataGrid grow with content
  // This eliminates the double-scroller issue where the page and table both scroll

  return (
    <Box sx={{ p: 2, bgcolor: '#f5f6f8', minHeight: '100vh' }}>
      {/* Header Row - Title + Right Actions */}
      <Box sx={{
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        mb: 1,
      }}>
        <Box sx={{ display: 'flex', alignItems: 'center', gap: 2 }}>
          <Typography variant="h5" sx={{ fontWeight: 600, color: '#1a1a2e' }}>
            Sync to Website
          </Typography>
        </Box>

        {/* Right Actions - Sync + Archive + Settings */}
        <Box sx={{ display: 'flex', gap: 1, alignItems: 'center' }}>
          <Tooltip title="Sync from TutorCruncher & update booking forms">
            <Button
              variant="contained"
              size="small"
              onClick={(e) => setSyncMenuAnchor(e.currentTarget)}
              startIcon={<ArrowPathIcon className="h-5 w-5" />}
              sx={{
                textTransform: 'none',
                bgcolor: '#1877f2',
                '&:hover': { bgcolor: '#1565c0' }
              }}
            >
              Sync
            </Button>
          </Tooltip>
          <Tooltip title="View archived services">
            <Button
              variant="outlined"
              size="small"
              onClick={() => navigate('/service-history')}
              startIcon={<ArchiveBoxIcon className="h-5 w-5" />}
              sx={{
                textTransform: 'none',
                borderColor: '#e0e0e0',
                color: '#666',
                '&:hover': { borderColor: '#1877f2', color: '#1877f2' }
              }}
            >
              Archive
            </Button>
          </Tooltip>
          <Tooltip title="Manage Locations">
            <IconButton size="small" onClick={() => setEditLocationDialogOpen(true)} sx={{ color: '#666' }}>
              <MapPinIcon className="h-5 w-5" />
            </IconButton>
          </Tooltip>
          <Tooltip title="Manage Subjects">
            <IconButton size="small" onClick={() => setEditColourGroupDialogOpen(true)} sx={{ color: '#666' }}>
              <TagIcon className="h-5 w-5" />
            </IconButton>
          </Tooltip>
        </Box>
      </Box>

      {/* Spacer */}
      <Box sx={{ mb: 1 }} />

      {/* <TableContainer component={Paper} className="mt-5 h-[60vh] overflow-auto">
        <Table>
          <TableHead>
            <TableRow>
              <TableCell onClick={() => handleSort("serviceId")}>
                Service ID
              </TableCell>
              <TableCell onClick={() => handleSort("name")}>
                Service Name
              </TableCell>
              <TableCell onClick={() => handleSort("description")}>
                Service Description
              </TableCell>
              <TableCell onClick={() => handleSort("location")}>
                Location
              </TableCell>
              <TableCell onClick={() => handleSort("type")}>Type</TableCell>
              <TableCell onClick={() => handleSort("price")}>Price</TableCell>
              <TableCell onClick={() => handleSort("colourGroup")}>
                Subject
              </TableCell>
              <TableCell onClick={() => handleSort("rcrs")}>Students</TableCell>
              <TableCell onClick={() => handleSort("dft_max_srs")}>
                Avail Spots
              </TableCell>
              <TableCell># of Lessons</TableCell> {}
              <TableCell>Image</TableCell>
              <TableCell>Label</TableCell>
              <TableCell align="right">Actions</TableCell>
            </TableRow>
          </TableHead>
          <TableBody>
            {filteredServices.map((service) => (
              <TableRow key={service.serviceId}>
                <TableCell>{service.serviceId}</TableCell>
                <TableCell>{service.name || "N/A"}</TableCell>
                <TableCell>{service.description || "N/A"}</TableCell>
                <TableCell>{service.location}</TableCell>
                <TableCell>{service.type}</TableCell>
                <TableCell>{service.price || "N/A"}</TableCell>
                <TableCell>
                  <div style={{ display: "flex", alignItems: "center" }}>
                    <div
                      style={{
                        backgroundColor: getColourGroupColor(
                          service.colourGroup
                        ),
                        width: 20,
                        height: 20,
                        marginRight: 10,
                        borderRadius: 4,
                      }}
                    />
                    {service.colourGroup || "N/A"}
                  </div>
                </TableCell>

                <TableCell>
                  {Array.isArray(service.rcrs)
                    ? service.rcrs.length
                    : typeof service.rcrs === "number"
                    ? service.rcrs
                    : "N/A"}
                </TableCell>
                <TableCell>
                  {typeof service.dft_max_srs === "number"
                    ? service.dft_max_srs
                    : Array.isArray(service.dft_max_srs)
                    ? service.dft_max_srs.length
                    : "N/A"}
                </TableCell>
                <TableCell>
                  {typeof appointmentCounts[service.serviceId] === "number"
                    ? appointmentCounts[service.serviceId]
                    : 0}
                </TableCell>

                <TableCell>
                  {service.image ? (
                    <img src={service.image} alt={service.name} width="50" loading="lazy" />
                  ) : (
                    "N/A"
                  )}
                </TableCell>
                <TableCell>{service.labelName || "—"}</TableCell>

                <TableCell align="right">
                  <IconButton
                    edge="end"
                    aria-label="edit"
                    onClick={() => handleServiceEdit(service)}
                  >
                    <PencilSquareIcon className="h-5 w-5" />
                  </IconButton>

                  <IconButton
                    edge="end"
                    aria-label="delete"
                    onClick={() => handleServiceDelete(service.serviceId)}
                  >
                    <TrashIcon className="h-5 w-5" />
                  </IconButton>
                  <IconButton
                    edge="end"
                    aria-label="update"
                    onClick={() => fetchAndUpdateCounts(service.serviceId)}
                  >
                    <ArrowPathIcon className="h-5 w-5" />
                  </IconButton>
                  <IconButton
                    edge="end"
                    aria-label="sync-booking"
                    onClick={() => handleSyncBookingConfig(service)}
                  >
                    <ArrowPathIcon className="h-5 w-5" />
                  </IconButton>

                  <IconButton
                    edge="end"
                    aria-label="sync-booking"
                    onClick={() => handleRefetchAppointments(service.serviceId)}
                  >
                    <CalendarIcon className="h-5 w-5" />
                  </IconButton>
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </TableContainer> */}

      {/* DataGrid */}
      <Box>
      <StandardDataGridLayout
        title=""
        columns={columns}
        rows={rows}
        searchQuery={searchQuery}
        onSearchChange={(value) => setSearchQuery(value)}
        pagePath="/manage-services"
        getRowId={(row) => row.id}
        dataGridProps={{
          autoHeight: true,
          rowHeight: 40,
          columnHeaderHeight: 38,
          initialState: {
            pagination: { paginationModel: { pageSize: 50, page: 0 } },
            sorting: {
              sortModel: sortColumn
                ? [{ field: sortColumn, sort: sortDirection }]
                : [],
            },
          },
          paginationMode: 'client',
          sx: {
            fontSize: '0.8rem',
            '& .MuiDataGrid-columnHeaders': {
              bgcolor: 'rgba(250,250,250,0.5)',
              borderTop: '1px solid #e5e5e5',
              borderBottom: '1px solid #e5e5e5',
            },
            '& .MuiDataGrid-columnHeaderTitle': {
              fontSize: '11px',
              fontWeight: 500,
              color: '#737373',
              textTransform: 'uppercase',
              letterSpacing: '0.05em',
            },
            '& .MuiDataGrid-cell': {
              py: 0.5,
              borderColor: '#f0f0f0',
              fontSize: '13px',
            },
            '& .MuiDataGrid-row:hover': {
              bgcolor: '#fafafa',
            },
            '& .MuiDataGrid-columnSeparator': {
              display: 'flex !important',
              cursor: 'col-resize',
            },
          },
        }}
      />

      </Box>

      {/* Sync Actions Menu */}
      <Menu
        anchorEl={syncMenuAnchor}
        open={Boolean(syncMenuAnchor)}
        onClose={() => setSyncMenuAnchor(null)}
        PaperProps={{ sx: { minWidth: 280 } }}
      >
        <MenuItem
          onClick={() => {
            syncServicesWithTutorCruncher();
            setSyncMenuAnchor(null);
          }}
        >
          <ArrowPathIcon className="h-5 w-5 mr-3" style={{ color: '#666' }} />
          <Box>
            <Typography variant="body2" sx={{ fontWeight: 500 }}>Sync from TutorCruncher</Typography>
            <Typography variant="caption" color="text.secondary">
              Pull all services from TC
            </Typography>
          </Box>
        </MenuItem>
        <MenuItem
          onClick={() => {
            handleSyncAllBookingConfigs();
            setSyncMenuAnchor(null);
          }}
        >
          <ArrowPathIcon className="h-5 w-5 mr-3" style={{ color: '#666' }} />
          <Box>
            <Typography variant="body2" sx={{ fontWeight: 500 }}>Sync to Form Backend</Typography>
            <Typography variant="caption" color="text.secondary">
              Update booking form dropdowns
            </Typography>
          </Box>
        </MenuItem>
        <MenuItem
          onClick={() => {
            handleFetchAllCounts();
            setSyncMenuAnchor(null);
          }}
          disabled={isFetchingCounts}
        >
          {isFetchingCounts ? (
            <CircularProgress size={20} sx={{ mr: 1.5 }} />
          ) : (
            <ArrowPathIcon className="h-5 w-5 mr-3" style={{ color: '#666' }} />
          )}
          <Box>
            <Typography variant="body2" sx={{ fontWeight: 500 }}>
              {isFetchingCounts ? "Fetching..." : "Fetch Student Counts"}
            </Typography>
            <Typography variant="caption" color="text.secondary">
              Refresh enrollment numbers
            </Typography>
          </Box>
        </MenuItem>
      </Menu>

      {/* Action Menu removed - inline edit/archive buttons per row */}

      <Dialog
        open={editColourGroupDialogOpen}
        onClose={handleEditColourGroupClose}
        maxWidth="md"
              fullWidth
            >
        <DialogTitle sx={{ pb: 1 }}>
          <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <Typography variant="h6" sx={{ fontWeight: 600 }}>
              Manage Subjects
            </Typography>
            {!showAddSubjectForm && (
              <Button
                variant="contained"
                startIcon={<PlusIcon className="h-5 w-5" />}
                onClick={() => {
                  setShowAddSubjectForm(true);
                  setEditColourGroupId(null);
                  setEditColourGroupName("");
                  setEditColourGroupColor("#000000");
                }}
                sx={{ textTransform: 'none' }}
              >
                Add New Subject
              </Button>
            )}
          </Box>
        </DialogTitle>
        <DialogContent sx={{ pt: 2 }}>
          {/* Add New Subject Form */}
          {showAddSubjectForm && (
            <Card sx={{ mb: 3, bgcolor: 'action.hover' }}>
              <CardContent>
                <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mb: 2 }}>
                  <Typography variant="subtitle1" sx={{ fontWeight: 600 }}>
                    Add New Subject
                  </Typography>
                  <IconButton
                    size="small"
                    onClick={() => {
                      setShowAddSubjectForm(false);
                      setNewColourGroupName("");
                      setNewColourGroupColor("#000000");
                    }}
                  >
                    <TrashIcon className="h-4 w-4" />
                  </IconButton>
                </Box>
                <Grid container spacing={2}>
                  <Grid item xs={12} sm={6}>
            <TextField
                      label="Subject Name"
                      value={newColourGroupName}
                      onChange={(e) => setNewColourGroupName(e.target.value)}
              fullWidth
                      required
                      placeholder="e.g., Chess, Math, Science"
                    />
                  </Grid>
                  <Grid item xs={12} sm={6}>
                    <TextField
                      label="Color (Hex)"
                      value={newColourGroupColor}
                      onChange={(e) => setNewColourGroupColor(e.target.value)}
                      fullWidth
                      required
                      placeholder="#000000"
                    />
                  </Grid>
                  <Grid item xs={12}>
                    <Box sx={{ mb: 2 }}>
                      <Typography variant="body2" sx={{ mb: 1, color: 'text.secondary' }}>
                        Choose Color:
                      </Typography>
                      <HexColorPicker
                        color={newColourGroupColor}
                        onChange={setNewColourGroupColor}
                      />
                    </Box>
                  </Grid>
                  <Grid item xs={12}>
                    <Box sx={{ display: 'flex', gap: 1, justifyContent: 'flex-end' }}>
          <Button
                        variant="outlined"
            onClick={() => {
                          setShowAddSubjectForm(false);
                          setNewColourGroupName("");
                          setNewColourGroupColor("#000000");
                        }}
                      >
                        Cancel
          </Button>
                      <Button
                        variant="contained"
                        onClick={handleNewColourGroupChange}
                        disabled={!newColourGroupName.trim()}
                      >
                        Add Subject
          </Button>
                    </Box>
                  </Grid>
                </Grid>
              </CardContent>
            </Card>
          )}

          {/* Edit Subject Form */}
          {editColourGroupId !== null && !showAddSubjectForm && (
            <Card sx={{ mb: 3, bgcolor: 'action.hover' }}>
              <CardContent>
                <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mb: 2 }}>
                  <Typography variant="subtitle1" sx={{ fontWeight: 600 }}>
                    Edit Subject
                  </Typography>
                  <IconButton
                    size="small"
                    onClick={() => {
                      setEditColourGroupId(null);
                      setEditColourGroupName("");
                      setEditColourGroupColor("#000000");
                    }}
                  >
                    <TrashIcon className="h-4 w-4" />
                  </IconButton>
                </Box>
                <Grid container spacing={2}>
                  <Grid item xs={12} sm={6}>
                    <TextField
                      label="Subject Name"
                      value={editColourGroupName}
                      onChange={(e) => setEditColourGroupName(e.target.value)}
                      fullWidth
                      required
                    />
                  </Grid>
                  <Grid item xs={12} sm={6}>
                    <TextField
                      label="Color (Hex)"
                      value={editColourGroupColor}
                      onChange={(e) => setEditColourGroupColor(e.target.value)}
                      fullWidth
                      required
                    />
                  </Grid>
                  <Grid item xs={12}>
                    <Box sx={{ mb: 2 }}>
                      <Typography variant="body2" sx={{ mb: 1, color: 'text.secondary' }}>
                        Choose Color:
                      </Typography>
                      <HexColorPicker
                        color={editColourGroupColor}
                        onChange={setEditColourGroupColor}
                      />
                    </Box>
                  </Grid>
                  <Grid item xs={12}>
                    <Box sx={{ display: 'flex', gap: 1, justifyContent: 'flex-end' }}>
                      <Button
                        variant="outlined"
                        onClick={() => {
                          setEditColourGroupId(null);
                          setEditColourGroupName("");
                          setEditColourGroupColor("#000000");
                        }}
                      >
                        Cancel
                      </Button>
                      <Button
                        variant="contained"
                        onClick={handleEditColourGroupSubmit}
                        disabled={!editColourGroupName.trim()}
                      >
                        Save Changes
                      </Button>
                    </Box>
                  </Grid>
                </Grid>
              </CardContent>
            </Card>
          )}

          {/* Subjects List */}
          <Box>
            <Typography variant="subtitle2" sx={{ mb: 2, fontWeight: 600, color: 'text.secondary' }}>
              Existing Subjects ({colourGroups.length})
            </Typography>
            {colourGroups.length === 0 ? (
              <Box sx={{ textAlign: 'center', py: 4 }}>
                <Typography variant="body2" color="text.secondary">
                  No subjects yet. Click "Add New Subject" to create one.
                </Typography>
              </Box>
            ) : (
              <TableContainer component={Paper} variant="outlined">
            <Table>
              <TableHead>
                    <TableRow sx={{ bgcolor: 'action.hover' }}>
                      <TableCell sx={{ fontWeight: 600 }}>Subject Name</TableCell>
                      <TableCell sx={{ fontWeight: 600 }}>Color</TableCell>
                      <TableCell align="right" sx={{ fontWeight: 600 }}>Actions</TableCell>
                </TableRow>
              </TableHead>
              <TableBody>
                {colourGroups.map((group) => (
                      <TableRow
                        key={group.id}
                        hover
                        sx={{
                          '&:last-child td, &:last-child th': { border: 0 },
                          bgcolor: editColourGroupId === group.id ? 'action.selected' : 'inherit'
                        }}
                      >
                    <TableCell>
                          <Typography variant="body2" sx={{ fontWeight: 500 }}>
                            {group.name}
                          </Typography>
                        </TableCell>
                        <TableCell>
                          <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                            <Box
                              sx={{
                                width: 32,
                                height: 32,
                                borderRadius: 1,
                          backgroundColor: group.color,
                                border: '1px solid',
                                borderColor: 'divider',
                                boxShadow: 1
                        }}
                      />
                            <Typography variant="body2" sx={{ color: 'text.secondary', fontFamily: 'monospace' }}>
                              {group.color}
                            </Typography>
                          </Box>
                    </TableCell>
                    <TableCell align="right">
                          <Box sx={{ display: 'flex', gap: 0.5, justifyContent: 'flex-end' }}>
                            <Tooltip title="Edit">
                      <IconButton
                                size="small"
                        onClick={() => handleEditColourGroupOpen(group)}
                                color="primary"
                      >
                                <PencilSquareIcon className="h-4 w-4" />
                      </IconButton>
                            </Tooltip>
                            <Tooltip title="Delete">
                      <IconButton
                                size="small"
                                onClick={() => {
                                  setConfirmState({ isOpen: true, action: () => handleColourGroupDelete(group.id), title: 'Delete Subject', message: `Are you sure you want to delete "${group.name}"?` });
                                }}
                                color="error"
                              >
                                <TrashIcon className="h-4 w-4" />
                      </IconButton>
                            </Tooltip>
                          </Box>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </TableContainer>
            )}
          </Box>
        </DialogContent>
        <DialogActions sx={{ px: 3, pb: 2 }}>
          <Button onClick={handleEditColourGroupClose} sx={{ textTransform: 'none' }}>
            Close
          </Button>
        </DialogActions>
      </Dialog>

      <Dialog
        open={editLocationDialogOpen}
        onClose={handleEditLocationClose}
        maxWidth="md"
        fullWidth
      >
        <DialogTitle sx={{ pb: 1 }}>
          <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <Typography variant="h6" sx={{ fontWeight: 600 }}>
              Manage Locations
            </Typography>
            {!showAddLocationForm && (
              <Button
                variant="contained"
                startIcon={<PlusIcon className="h-5 w-5" />}
                onClick={() => {
                  setShowAddLocationForm(true);
                  setEditLocationId(null);
                  setEditLocationName("");
                  setEditLocationColor("#000000");
                }}
                sx={{ textTransform: 'none' }}
              >
                Add New Location
              </Button>
            )}
          </Box>
        </DialogTitle>
        <DialogContent sx={{ pt: 2 }}>
          {/* Add New Location Form */}
          {showAddLocationForm && (
            <Card sx={{ mb: 3, bgcolor: 'action.hover' }}>
              <CardContent>
                <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mb: 2 }}>
                  <Typography variant="subtitle1" sx={{ fontWeight: 600 }}>
                    Add New Location
                  </Typography>
                  <IconButton
                    size="small"
                    onClick={() => {
                      setShowAddLocationForm(false);
                      setNewLocation("");
                      setNewLocationColor("#000000");
                    }}
                  >
                    <TrashIcon className="h-4 w-4" />
                  </IconButton>
                </Box>
                <Grid container spacing={2}>
                  <Grid item xs={12}>
          <TextField
                      label="Location Name"
                      value={newLocation}
                      onChange={(e) => setNewLocation(e.target.value)}
            fullWidth
                      required
                      placeholder="e.g., Park Slope, Upper East Side, Online"
                      helperText="Enter a descriptive name for the location"
                    />
                  </Grid>
                  <Grid item xs={12}>
                    <Box sx={{ display: 'flex', gap: 1, justifyContent: 'flex-end' }}>
          <Button
                        variant="outlined"
                        onClick={() => {
                          setShowAddLocationForm(false);
                          setNewLocation("");
                          setNewLocationColor("#000000");
                        }}
          >
            Cancel
          </Button>
                      <Button
                        variant="contained"
                        onClick={handleNewLocationChange}
                        disabled={!newLocation.trim()}
                      >
                        Add Location
          </Button>
                    </Box>
                  </Grid>
                </Grid>
              </CardContent>
            </Card>
          )}

          {/* Edit Location Form */}
          {editLocationId !== null && !showAddLocationForm && (
            <Card sx={{ mb: 3, bgcolor: 'action.hover' }}>
              <CardContent>
                <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mb: 2 }}>
                  <Typography variant="subtitle1" sx={{ fontWeight: 600 }}>
                    Edit Location
                  </Typography>
                  <IconButton
                    size="small"
                    onClick={() => {
                      setEditLocationId(null);
                      setEditLocationName("");
                      setEditLocationColor("#000000");
                    }}
                  >
                    <TrashIcon className="h-4 w-4" />
                  </IconButton>
                </Box>
                <Grid container spacing={2}>
                  <Grid item xs={12}>
          <TextField
                      label="Location Name"
                      value={editLocationName}
                      onChange={(e) => setEditLocationName(e.target.value)}
            fullWidth
                      required
                      helperText="Enter a descriptive name for the location"
          />
                  </Grid>
                  <Grid item xs={12}>
                    <Box sx={{ display: 'flex', gap: 1, justifyContent: 'flex-end' }}>
          <Button
                        variant="outlined"
                        onClick={() => {
                          setEditLocationId(null);
                          setEditLocationName("");
                          setEditLocationColor("#000000");
                        }}
          >
            Cancel
          </Button>
                      <Button
                        variant="contained"
                        onClick={handleEditLocationSubmit}
                        disabled={!editLocationName.trim()}
                      >
                        Save Changes
          </Button>
                    </Box>
                  </Grid>
                </Grid>
              </CardContent>
            </Card>
          )}

          {/* Locations List */}
          <Box>
            <Typography variant="subtitle2" sx={{ mb: 2, fontWeight: 600, color: 'text.secondary' }}>
              Existing Locations ({locations.length})
            </Typography>
            {locations.length === 0 ? (
              <Box sx={{ textAlign: 'center', py: 4 }}>
                <Typography variant="body2" color="text.secondary">
                  No locations yet. Click "Add New Location" to create one.
                </Typography>
              </Box>
            ) : (
              <TableContainer component={Paper} variant="outlined">
            <Table>
              <TableHead>
                    <TableRow sx={{ bgcolor: 'action.hover' }}>
                      <TableCell sx={{ fontWeight: 600 }}>Location Name</TableCell>
                      <TableCell align="right" sx={{ fontWeight: 600 }}>Actions</TableCell>
                </TableRow>
              </TableHead>
              <TableBody>
                {locations.map((location) => (
                      <TableRow
                        key={location.id}
                        hover
                        sx={{
                          '&:last-child td, &:last-child th': { border: 0 },
                          bgcolor: editLocationId === location.id ? 'action.selected' : 'inherit'
                        }}
                      >
                        <TableCell>
                          <Typography variant="body2" sx={{ fontWeight: 500 }}>
                            {location.name}
                          </Typography>
                        </TableCell>
                    <TableCell align="right">
                          <Box sx={{ display: 'flex', gap: 0.5, justifyContent: 'flex-end' }}>
                            <Tooltip title="Edit">
                      <IconButton
                                size="small"
                        onClick={() => handleEditLocationOpen(location)}
                                color="primary"
                      >
                                <PencilSquareIcon className="h-4 w-4" />
                      </IconButton>
                            </Tooltip>
                            <Tooltip title="Delete">
                      <IconButton
                                size="small"
                                onClick={() => {
                                  setConfirmState({ isOpen: true, action: () => handleLocationDelete(location.id), title: 'Delete Location', message: `Are you sure you want to delete "${location.name}"?` });
                                }}
                                color="error"
                              >
                                <TrashIcon className="h-4 w-4" />
                      </IconButton>
                            </Tooltip>
                          </Box>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </TableContainer>
            )}
          </Box>
        </DialogContent>
        <DialogActions sx={{ px: 3, pb: 2 }}>
          <Button onClick={handleEditLocationClose} sx={{ textTransform: 'none' }}>
            Close
          </Button>
        </DialogActions>
      </Dialog>

      <Dialog open={manageImagesDialogOpen} onClose={handleManageImagesClose}>
        <DialogTitle>Manage Images</DialogTitle>
        <DialogContent>
          <TableContainer component={Paper}>
            <Table>
              <TableHead>
                <TableRow>
                  <TableCell>Image</TableCell>
                  <TableCell align="right">Actions</TableCell>
                </TableRow>
              </TableHead>
              <TableBody>
                {existingImages.map((image) => (
                  <TableRow key={image}>
                    <TableCell>
                      <img src={image} alt="existing" width="100" loading="lazy" />
                    </TableCell>
                    <TableCell align="right">
                      <IconButton
                        edge="end"
                        aria-label="delete"
                        onClick={() => handleImageDelete(image)}
                      >
                        <TrashIcon className="h-5 w-5" />
                      </IconButton>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </TableContainer>

          {}
          <div style={{ marginTop: "20px" }}>
            <input
              type="file"
              onChange={handleImageChange}
              style={{ marginBottom: "10px" }}
            />
            <Button
              variant="contained"
              color="primary"
              onClick={handleImageUpload}
              disabled={!newImage}
            >
              Upload New Image
            </Button>
          </div>
        </DialogContent>
        <DialogActions>
          <Button onClick={handleManageImagesClose} color="primary">
            Close
          </Button>
        </DialogActions>
      </Dialog>

      <Dialog
        open={editServiceDialogOpen}
        onClose={() => setEditServiceDialogOpen(false)}
        disableEnforceFocus
        disableRestoreFocus
        disableScrollLock
        keepMounted
        maxWidth="xl"
        fullWidth
        PaperProps={{
          sx: {
            height: '90vh',
            maxHeight: '90vh',
          }
        }}
      >
        <DialogTitle>
          <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <Typography variant="h6">Edit Service</Typography>
            {hasBookingForm && (
              <Chip 
                label="Has Booking Form" 
                color="primary" 
                size="small"
                sx={{ ml: 2 }}
              />
            )}
          </Box>
        </DialogTitle>
        <DialogContent sx={{ p: 0, height: '100%', overflow: 'hidden' }}>
          <Box sx={{ display: 'flex', height: '100%', overflow: 'hidden' }}>
            {/* Left Side - Edit Form */}
            <Box sx={{ 
              width: hasBookingForm ? '50%' : '100%', 
              borderRight: hasBookingForm ? '1px solid' : 'none',
              borderColor: 'divider',
              overflow: 'auto',
              p: 3
            }}>
          <TextField
            label="Service ID"
            value={serviceId}
            onChange={handleServiceIdChange}
            fullWidth
            style={{ marginBottom: "20px" }}
          />
          <TextField
            label="Service Name"
            value={serviceName}
            onChange={(e) => setServiceName(e.target.value)}
            fullWidth
            style={{ marginBottom: "20px" }}
          />
          <Box sx={{ marginBottom: "20px" }}>
            <Typography variant="body2" sx={{ mb: 1, color: 'text.secondary', fontWeight: 500 }}>
              Service Description
            </Typography>
            <Box sx={{ 
              '& .quill': {
                backgroundColor: 'white',
              },
              '& .ql-container': {
                minHeight: '200px',
                fontSize: '1rem',
                fontFamily: 'inherit',
                borderBottomLeftRadius: '4px',
                borderBottomRightRadius: '4px',
              },
              '& .ql-editor': {
                minHeight: '200px',
              },
              '& .ql-toolbar': {
                borderTopLeftRadius: '4px',
                borderTopRightRadius: '4px',
                borderBottom: '1px solid rgba(0, 0, 0, 0.23)',
              }
            }}>
              <ReactQuillWrapper
                theme="snow"
                value={serviceDescription || ""}
                onChange={setServiceDescription}
                modules={{
                  toolbar: [
                    [{ 'header': [1, 2, 3, false] }],
                    ['bold', 'italic', 'underline', 'strike'],
                    [{ 'list': 'ordered'}, { 'list': 'bullet' }],
                    [{ 'indent': '-1'}, { 'indent': '+1' }],
                    [{ 'align': [] }],
                    ['link'],
                    ['clean']
                  ]
                }}
                formats={[
                  'header',
                  'bold', 'italic', 'underline', 'strike',
                  'list', 'bullet', 'indent',
                  'align',
                  'link'
                ]}
              />
            </Box>
            <Typography variant="caption" sx={{ mt: 1, display: 'block', color: 'text.secondary' }}>
              Format your description with bold, italics, bullet points, and more. This will be displayed on the public-facing school directory.
            </Typography>
          </Box>
          <FormControl fullWidth style={{ marginBottom: "20px" }}>
            <InputLabel>Assign Label</InputLabel>
            <Select
              value={selectedLabel.id}
              onChange={(e) => {
                const label = labels.find((l) => l.id === e.target.value);

                setSelectedLabel({ id: label.id, name: label.name });
              }}
            >
              <MenuItem value=""><em>None</em></MenuItem>
              {labels.map((label) => (
                <MenuItem key={label.id} value={label.id}>
                  {label.name}
                </MenuItem>
              ))}
            </Select>
          </FormControl>

          <FormControl fullWidth style={{ marginBottom: "20px" }}>
            <InputLabel>Subject</InputLabel>
            <Select
              value={colourGroup || ""}
              onChange={(e) => setColourGroup(e.target.value)}
            >
              <MenuItem value=""><em>None</em></MenuItem>
              {colourGroups.map((group) => (
                <MenuItem key={group.id} value={group.name}>
                  <div style={{ display: "flex", alignItems: "center" }}>
                    <div
                      style={{
                        backgroundColor: group.color,
                        width: 20,
                        height: 20,
                        marginRight: 10,
                      }}
                    />
                    {group.name}
                  </div>
                </MenuItem>
              ))}
            </Select>
          </FormControl>
          <FormControl fullWidth style={{ marginBottom: "20px" }}>
            <InputLabel>Type</InputLabel>
            <Select
              value={type || ""}
              onChange={(e) => handleTypeChange(e.target.value)}
            >
              <MenuItem value=""><em>None</em></MenuItem>
              <MenuItem value="one-off">Class Pack (One-off)</MenuItem>
              <MenuItem value="Per Session">Per Session</MenuItem>
              <MenuItem value="Per Session Special">
                Per Session Special
              </MenuItem>
            </Select>
          </FormControl>

          <TextField
            label="Price"
            value={price ?? ""}
            onChange={(e) => setPrice(e.target.value)}
            fullWidth
            style={{ marginBottom: "20px" }}
          />
          <FormControl fullWidth style={{ marginBottom: "20px" }}>
            <InputLabel>Location</InputLabel>
            <Select
              value={location || ""}
              onChange={(e) => setLocation(e.target.value)}
              renderValue={(selected) => {
                const selectedLocation = locations.find(
                  (loc) => loc.name === selected
                );
                return (
                  <div style={{ display: "flex", alignItems: "center" }}>
                    {}
                    {selected}
                  </div>
                );
              }}
            >
              <MenuItem value=""><em>None</em></MenuItem>
              {locations.map((loc) => (
                <MenuItem key={loc.id} value={loc.name}>
                  <div style={{ display: "flex", alignItems: "center" }}>
                    {}
                    {loc.name}
                  </div>
                </MenuItem>
              ))}
            </Select>
          </FormControl>
          
          <FormControlLabel
            control={
              <Switch
                checked={publicVisible}
                onChange={(e) => setPublicVisible(e.target.checked)}
                color="primary"
              />
            }
            label="Show on Public School Directory"
            style={{ marginBottom: "20px" }}
          />
          
          <FormControl fullWidth style={{ marginBottom: "20px" }}>
            <Box sx={{ display: 'flex', gap: 1, alignItems: 'flex-start', mb: 1 }}>
              <Tooltip title="Refresh images">
                <IconButton 
                  size="small" 
                  onClick={fetchImages}
                  sx={{ mt: 1 }}
                >
                  <ArrowPathIcon className="h-4 w-4" />
                </IconButton>
              </Tooltip>
              <Box sx={{ flex: 1 }}>
                <Autocomplete
                  options={filteredImages}
                  getOptionLabel={(option) => {
                    if (!option) return '';
                    if (typeof option === 'string') return option.split('/').pop() || option;
                    return option.name || option.url?.split('/').pop() || String(option);
                  }}
                  isOptionEqualToValue={(option, value) => {
                    if (!option || !value) return false;
                    const optionUrl = typeof option === 'string' ? option : (option?.url || option);
                    const valueUrl = typeof value === 'string' ? value : (value?.url || value);
                    return optionUrl === valueUrl;
                  }}
                  value={selectedImage ? (existingImages.find(img => {
                    const url = typeof img === 'string' ? img : (img?.url || img);
                    return url === selectedImage;
                  }) || null) : null}
                  onChange={(event, newValue) => {
                    if (newValue === null) {
                      setSelectedImage("");
                    } else {
                      const url = typeof newValue === 'string' ? newValue : (newValue?.url || newValue);
                      setSelectedImage(url || "");
                    }
                  }}
                  inputValue={imageSearchQuery}
                  onInputChange={(event, newInputValue) => {
                    setImageSearchQuery(newInputValue);
                  }}
                  renderInput={(params) => (
                    <TextField
                      {...params}
                      label="Select Image"
                      placeholder="Search images..."
                      InputProps={{
                        ...params.InputProps,
                        startAdornment: (
                          <>
                            <InputAdornment position="start">
                              <MagnifyingGlassIcon className="h-5 w-5" />
                            </InputAdornment>
                            {params.InputProps.startAdornment}
                          </>
                        ),
                      }}
                    />
                  )}
                  renderOption={(props, option) => {
                    const imgUrl = typeof option === 'string' ? option : option.url;
                    const folder = typeof option === 'string' ? 'general' : (option.folder || 'general');
                    const name = typeof option === 'string' ? option.split('/').pop() : (option.displayName || option.name || option.url?.split('/').pop() || 'image');
                    return (
                      <li {...props} key={imgUrl}>
                        <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, width: '100%' }}>
                          <Avatar
                            src={imgUrl}
                            alt={name}
                            variant="rounded"
                            sx={{ width: 50, height: 50 }}
                          />
                          <Box sx={{ flex: 1, minWidth: 0 }}>
                            <Typography variant="body2" noWrap>
                              {name}
                            </Typography>
                            <Typography variant="caption" color="text.secondary" noWrap>
                              {folder !== 'general' && folder}
                            </Typography>
                          </Box>
                        </Box>
                      </li>
                    );
                  }}
                  noOptionsText={imageSearchQuery ? `No images found matching "${imageSearchQuery}"` : "No images available"}
                  clearOnEscape
                  selectOnFocus
                />
              </Box>
            </Box>
            
            {/* Upload new image */}
            <Box sx={{ mt: 2, p: 2, border: '1px dashed', borderColor: 'divider', borderRadius: 1 }}>
              <Typography variant="caption" color="text.secondary" sx={{ mb: 1, display: 'block' }}>
                Upload New Image
              </Typography>
              <Box sx={{ display: 'flex', gap: 1, alignItems: 'center' }}>
                <input
                  ref={imageFileInputRef}
                  type="file"
                  accept="image/*"
                  onChange={handleImageChange}
                  style={{ display: 'none' }}
                />
                <Button
                  size="small"
                  variant="outlined"
                  startIcon={<ArrowUpTrayIcon className="h-5 w-5" />}
                  onClick={() => imageFileInputRef.current?.click()}
                  disabled={imageUploading}
                >
                  {imageUploading ? "Uploading..." : "Choose File"}
                </Button>
                {newImage && (
                  <>
                    <Typography variant="caption" color="text.secondary" sx={{ flex: 1 }}>
                      {newImage.name}
                    </Typography>
                    <Select
                      size="small"
                      value={imageUploadFolder}
                      onChange={(e) => setImageUploadFolder(e.target.value)}
                      sx={{ minWidth: 150 }}
                    >
                      <MenuItem value="service-images">Service Images</MenuItem>
                      <MenuItem value="booking-forms">Booking Forms</MenuItem>
                      <MenuItem value="marketing">Marketing</MenuItem>
                      <MenuItem value="general">General</MenuItem>
                    </Select>
                    <Button
                      size="small"
                      variant="contained"
                      onClick={handleImageUpload}
                      disabled={imageUploading}
                      startIcon={imageUploading ? <CircularProgress size={16} /> : <ArrowUpTrayIcon className="h-5 w-5" />}
                    >
                      {imageUploading ? "Uploading..." : "Upload"}
                    </Button>
                  </>
                )}
              </Box>
            </Box>
          </FormControl>

              {/* Term Billing Configuration Section */}
              {hasBookingForm && (
                <>
                  <Divider sx={{ my: 3 }} />
                  <Typography variant="h6" sx={{ mb: 2, fontWeight: 600 }}>
                    Booking Form Configuration
                  </Typography>
                  
                  <Box sx={{ mb: 3 }}>
                    <div style={{ marginBottom: 20 }}>
                      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                        <Typography variant="subtitle1">Offer Student Discount for 2+ Students</Typography>
                        <Switch
                          checked={studentDiscountEnabled}
                          onChange={(e) => setStudentDiscountEnabled(e.target.checked)}
                          color="primary"
                        />
                      </div>
                      {studentDiscountEnabled && (
                        <TextField
                          label="Discount Percent (%)"
                          type="number"
                          value={studentDiscountPercent}
                          onChange={(e) => setStudentDiscountPercent(Math.max(0, Math.min(100, Number(e.target.value))))}
                          fullWidth
                          inputProps={{ min: 0, max: 100 }}
                          style={{ marginTop: 12 }}
                        />
                      )}
                    </div>
                  </Box>

                  <Box sx={{ mb: 3 }}>
                    <div style={{ marginBottom: 20 }}>
                      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                        <Typography variant="subtitle1">Enable Staff Discount</Typography>
                        <Switch
                          checked={staffDiscountEnabled}
                          onChange={(e) => setStaffDiscountEnabled(e.target.checked)}
                          color="primary"
                        />
                      </div>
                      {staffDiscountEnabled && (
                        <>
                          <TextField
                            label="Staff Discount % (Monthly Billing)"
                            type="number"
                            value={staffDiscountPercentMonthly}
                            onChange={(e) => setStaffDiscountPercentMonthly(Math.max(0, Math.min(100, Number(e.target.value))))}
                            fullWidth
                            inputProps={{ min: 0, max: 100 }}
                            style={{ marginTop: 12 }}
                            helperText="Discount applied for staff bookings with monthly billing"
                          />
                          <TextField
                            label="Staff Discount % (Term Billing)"
                            type="number"
                            value={staffDiscountPercentTerm}
                            onChange={(e) => setStaffDiscountPercentTerm(Math.max(0, Math.min(100, Number(e.target.value))))}
                            fullWidth
                            inputProps={{ min: 0, max: 100 }}
                            style={{ marginTop: 12 }}
                            helperText="Discount applied for staff bookings with term billing"
                          />
                          <Box sx={{ mt: 2, p: 2, bgcolor: 'grey.50', borderRadius: 1, border: '1px solid', borderColor: 'divider' }}>
                            <Typography variant="caption" color="text.secondary" sx={{ display: 'block', mb: 1, fontWeight: 500 }}>
                              Staff Booking Form URL:
                            </Typography>
                            <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                              <code style={{ 
                                fontSize: '0.875rem', 
                                backgroundColor: '#fff', 
                                padding: '8px 12px', 
                                borderRadius: '4px',
                                border: '1px solid #e0e0e0',
                                flex: 1,
                                wordBreak: 'break-all',
                                fontFamily: 'monospace'
                              }}>
                                {typeof window !== 'undefined' ? `${window.location.origin}/booking-forms/frontend?serviceId=${serviceId}&staff=true` : `/booking-forms/frontend?serviceId=${serviceId}&staff=true`}
                              </code>
                              <Button
                                size="small"
                                variant="outlined"
                                onClick={() => {
                                  const url = typeof window !== 'undefined' 
                                    ? `${window.location.origin}/booking-forms/frontend?serviceId=${serviceId}&staff=true`
                                    : `/booking-forms/frontend?serviceId=${serviceId}&staff=true`;
                                  navigator.clipboard.writeText(url);
                                  setSnackbar({
                                    open: true,
                                    message: 'Staff booking form URL copied to clipboard!',
                                    severity: 'success',
                                  });
                                }}
                                sx={{ minWidth: 'auto', px: 2 }}
                              >
                                Copy
                              </Button>
                            </Box>
                          </Box>
                        </>
                      )}
                    </div>
                  </Box>

                  <Box sx={{ mb: 3 }}>
                    <div style={{ marginBottom: 20 }}>
                      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                        <Typography variant="subtitle1">Enable Owner Discount</Typography>
                        <Switch
                          checked={ownerDiscountEnabled}
                          onChange={(e) => setOwnerDiscountEnabled(e.target.checked)}
                          color="primary"
                        />
                      </div>
                      {ownerDiscountEnabled && (
                        <>
                          <TextField
                            label="Owner Discount % (Monthly Billing)"
                            type="number"
                            value={ownerDiscountPercentMonthly}
                            onChange={(e) => setOwnerDiscountPercentMonthly(Math.max(0, Math.min(100, Number(e.target.value))))}
                            fullWidth
                            inputProps={{ min: 0, max: 100 }}
                            style={{ marginTop: 12 }}
                            helperText="Discount applied for school owner bookings with monthly billing"
                          />
                          <TextField
                            label="Owner Discount % (Term Billing)"
                            type="number"
                            value={ownerDiscountPercentTerm}
                            onChange={(e) => setOwnerDiscountPercentTerm(Math.max(0, Math.min(100, Number(e.target.value))))}
                            fullWidth
                            inputProps={{ min: 0, max: 100 }}
                            style={{ marginTop: 12 }}
                            helperText="Discount applied for school owner bookings with term billing"
                          />
                          <Box sx={{ mt: 2, p: 2, bgcolor: 'grey.50', borderRadius: 1, border: '1px solid', borderColor: 'divider' }}>
                            <Typography variant="caption" color="text.secondary" sx={{ display: 'block', mb: 1, fontWeight: 500 }}>
                              Owner Booking Form URL:
                            </Typography>
                            <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                              <code style={{
                                fontSize: '0.875rem',
                                backgroundColor: '#fff',
                                padding: '8px 12px',
                                borderRadius: '4px',
                                border: '1px solid #e0e0e0',
                                flex: 1,
                                wordBreak: 'break-all',
                                fontFamily: 'monospace'
                              }}>
                                {typeof window !== 'undefined' ? `${window.location.origin}/booking-forms/frontend?serviceId=${serviceId}&owner=true` : `/booking-forms/frontend?serviceId=${serviceId}&owner=true`}
                              </code>
                              <Button
                                size="small"
                                variant="outlined"
                                onClick={() => {
                                  const url = typeof window !== 'undefined'
                                    ? `${window.location.origin}/booking-forms/frontend?serviceId=${serviceId}&owner=true`
                                    : `/booking-forms/frontend?serviceId=${serviceId}&owner=true`;
                                  navigator.clipboard.writeText(url);
                                  setSnackbar({
                                    open: true,
                                    message: 'Owner booking form URL copied to clipboard!',
                                    severity: 'success',
                                  });
                                }}
                                sx={{ minWidth: 'auto', px: 2 }}
                              >
                                Copy
                              </Button>
                            </Box>
                          </Box>
                        </>
                      )}
                    </div>
                  </Box>

                  <Box sx={{ mb: 3 }}>
                    <div style={{ marginBottom: 8 }}>
                      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                        <Typography variant="subtitle1">Enable Term Billing</Typography>
                        <Switch
                          checked={termBillingEnabled}
                          onChange={(e) => {
                            setTermBillingEnabled(e.target.checked);
                            if (!e.target.checked) {
                              setMonthlySubscriptionEnabled(false);
                            }
                          }}
                          color="primary"
                        />
                      </div>
                      <Typography variant="caption" color="text.secondary" sx={{ display: 'block', mt: 0.5 }}>
                        Allow customers to purchase the entire term with all scheduled lessons upfront
                      </Typography>
                    </div>
                  </Box>

                  {termBillingEnabled && (
                    <>
                      <TextField
                        label="Term Discount % (Optional)"
                        type="number"
                        value={termDiscountPercent}
                        onChange={(e) => setTermDiscountPercent(e.target.value)}
                        fullWidth
                        placeholder="10"
                        inputProps={{ min: 0, max: 100, step: 0.1 }}
                        sx={{ mb: 2 }}
                        helperText="Discount for full-term upfront payment"
                      />

                      <Box sx={{ mb: 2 }}>
                        <div style={{ marginBottom: 8 }}>
                          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                            <Typography variant="subtitle1">Enable Monthly Billing Option</Typography>
                            <Switch
                              checked={monthlySubscriptionEnabled}
                              onChange={(e) => setMonthlySubscriptionEnabled(e.target.checked)}
                              color="primary"
                              disabled={!termBillingEnabled}
                            />
                          </div>
                          <Typography variant="caption" color="text.secondary" sx={{ display: 'block', mt: 0.5 }}>
                            Allow customers to pay monthly for upcoming lessons
                          </Typography>
                        </div>
                      </Box>

                      {/* Show read-only lesson dates when term billing is enabled */}
                      <Box sx={{ mb: 2 }}>
                        <Typography variant="subtitle2" sx={{ mb: 1, fontWeight: 600 }}>
                          Current & Upcoming Lessons
                        </Typography>
                        <Typography variant="caption" color="text.secondary" sx={{ display: 'block', mb: 1 }}>
                          Lessons are automatically pulled from scheduled jobs and future appointments. Use "Refetch Appointments" in the Actions menu to sync dates from TutorCruncher.
                        </Typography>
                        {loadingTermBilling ? (
                          <Box sx={{ display: 'flex', justifyContent: 'center', p: 3 }}>
                            <CircularProgress />
                          </Box>
                        ) : classDates.length > 0 ? (
                          <Box sx={{ 
                            p: 2, 
                            bgcolor: 'grey.50', 
                            borderRadius: 1,
                            border: '1px solid',
                            borderColor: 'divider'
                          }}>
                            <Typography variant="body2" sx={{ mb: 1, fontWeight: 600 }}>
                              {classDates.length} lesson{classDates.length !== 1 ? 's' : ''} scheduled
                            </Typography>
                            <Box sx={{ 
                              mt: 1, 
                              maxHeight: '200px', 
                              overflowY: 'auto',
                              '& > *:not(:last-child)': { mb: 0.5 }
                            }}>
                              {classDates
                                .slice()
                                .sort((a, b) => new Date(a) - new Date(b))
                                .map((date, index) => {
                                  const dateObj = new Date(date);
                                  const formattedDate = dateObj.toLocaleDateString('en-US', {
                                    weekday: 'short',
                                    month: 'short',
                                    day: 'numeric',
                                    year: 'numeric'
                                  });
                                  return (
                                    <Typography 
                                      key={index} 
                                      variant="body2" 
                                      sx={{ 
                                        color: 'text.secondary',
                                        fontSize: '0.8125rem',
                                      }}
                                    >
                                      • {formattedDate}
                                    </Typography>
                                  );
                                })}
                            </Box>
                            <Typography variant="caption" color="text.secondary" sx={{ display: 'block', mt: 1.5 }}>
                              Dates are managed through job scheduling and cannot be edited here
                            </Typography>
                          </Box>
                        ) : (
                          <Typography variant="caption" color="text.secondary">
                            No upcoming lessons found. Lessons will appear here once scheduled in jobs.
                          </Typography>
                        )}
                      </Box>
                    </>
                  )}
                </>
              )}
            </Box>

            {/* Right Side - Live Preview */}
            {hasBookingForm && (
              <Box sx={{ 
                width: '50%', 
                height: '100%',
                display: 'flex',
                flexDirection: 'column',
                borderLeft: '1px solid',
                borderColor: 'divider'
              }}>
                <BookingFormStepPreview
                  serviceName={serviceName}
                  serviceDescription={serviceDescription}
                  price={price}
                  termBillingEnabled={termBillingEnabled}
                  termBillingConfig={termBillingEnabled && classDates.length > 0 ? {
                    class_dates: classDates,
                    rate_per_lesson: parseFloat(price) || 0, // Pulled directly from job/service pricing
                  } : null}
                  termDiscountPercent={termDiscountPercent ? parseFloat(termDiscountPercent) : 0}
                  monthlySubscriptionEnabled={monthlySubscriptionEnabled}
                  studentDiscountEnabled={studentDiscountEnabled}
                  studentDiscountPercent={studentDiscountPercent}
                />
              </Box>
            )}
          </Box>
        </DialogContent>
        <DialogActions sx={{ px: 3, py: 2, borderTop: '1px solid', borderColor: 'divider' }}>
          <Button
            onClick={() => setEditServiceDialogOpen(false)}
            color="primary"
          >
            Cancel
          </Button>
        <Button
          onClick={handleServiceSubmit}
          color="primary"
          variant="contained"
          disabled={isSaving}
          startIcon={isSaving ? <CircularProgress size={16} /> : null}
          sx={{ minWidth: 180 }} 
        >
          {isSaving ? "Updating, please wait" : "Save & Update"}
        </Button>
        </DialogActions>
      </Dialog>

      {/* Students Modal */}
      <Dialog
        open={studentsModalOpen}
        onClose={() => setStudentsModalOpen(false)}
        maxWidth="md"
        fullWidth
      >
        <DialogTitle>
          Students for: {selectedServiceName}
        </DialogTitle>
        <DialogContent>
          {loadingStudents ? (
            <div style={{ display: 'flex', justifyContent: 'center', padding: '20px' }}>
              <CircularProgress />
            </div>
          ) : (
            <TableContainer component={Paper}>
              <Table>
                <TableHead>
                  <TableRow>
                    <TableCell><strong>Student Name</strong></TableCell>
                    <TableCell><strong>Lessons Attended</strong></TableCell>
                    <TableCell><strong>Revenue</strong></TableCell>
                  </TableRow>
                </TableHead>
                <TableBody>
                  {selectedServiceStudents.length > 0 ? (
                    selectedServiceStudents.map((student, index) => (
                      <TableRow key={index}>
                        <TableCell>
                          <span style={{ fontWeight: '500' }}>
                            {student.student_name}
                          </span>
                        </TableCell>
                        <TableCell>
                          <span className="font-medium text-primary-500 tabular-nums">
                            {student.lessons_attended || 1}
                          </span>
                        </TableCell>
                        <TableCell>
                          <span className="font-bold text-[#2A9147] tabular-nums">
                            ${student.revenue?.toFixed(2) || '0.00'}
                          </span>
                        </TableCell>
                      </TableRow>
                    ))
                  ) : (
                    <TableRow>
                      <TableCell colSpan={3} className="text-center text-neutral-400">
                        No students found for this service
                      </TableCell>
                    </TableRow>
                  )}
                </TableBody>
              </Table>
            </TableContainer>
          )}
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setStudentsModalOpen(false)} color="primary">
            Close
          </Button>
        </DialogActions>
      </Dialog>

      <Snackbar
        anchorOrigin={{ vertical: "bottom", horizontal: "center" }}
        open={snackbar.open}
        autoHideDuration={3000}
        onClose={() => setSnackbar((s) => ({ ...s, open: false }))}
      >
        <Alert
          onClose={() => setSnackbar((s) => ({ ...s, open: false }))}
          severity={snackbar.severity}
        >
          {snackbar.message}
        </Alert>
      </Snackbar>

      {/* Create Event Dialog */}
      <Dialog 
        open={createEventDialogOpen} 
        onClose={() => setCreateEventDialogOpen(false)}
        maxWidth="md"
        fullWidth
      >
        <DialogTitle>Create Event Booking Form</DialogTitle>
        <DialogContent>
          <Typography variant="body1" className="mb-4">
            Create a new event job in TutorCruncher with "Event" and "sync to website" labels. 
            This will create a job that appears in the Service Catalog and can be used to create 
            booking forms for customers to sign up for events.
          </Typography>
          <Grid container spacing={3}>
            <Grid item xs={12} sm={6}>
              <TextField
                label="Event Name"
                fullWidth
                variant="outlined"
                placeholder="e.g., Chess Tournament, Summer Camp"
                value={eventForm.eventName}
                onChange={(e) => handleEventFormChange('eventName', e.target.value)}
                required
              />
            </Grid>
            <Grid item xs={12} sm={6}>
              <FormControl fullWidth>
                <InputLabel>Event Type</InputLabel>
                <Select
                  value={eventForm.eventType}
                  onChange={(e) => handleEventFormChange('eventType', e.target.value)}
                >
                  <MenuItem value="tournament">Tournament</MenuItem>
                  <MenuItem value="camp">Camp</MenuItem>
                  <MenuItem value="workshop">Workshop</MenuItem>
                  <MenuItem value="special-event">Special Event</MenuItem>
                </Select>
              </FormControl>
            </Grid>
            <Grid item xs={12} sm={6}>
              <FormControl fullWidth>
                <InputLabel>Location</InputLabel>
                <Select
                  value={eventForm.location}
                  onChange={(e) => handleEventFormChange('location', e.target.value)}
                >
                  {locations.map((location) => (
                    <MenuItem key={location.id} value={location.name}>
                      {location.name}
                    </MenuItem>
                  ))}
                </Select>
              </FormControl>
            </Grid>
            <Grid item xs={12} sm={6}>
              <TextField
                label="Price per Person"
                type="number"
                fullWidth
                variant="outlined"
                placeholder="0.00"
                value={eventForm.price}
                onChange={(e) => handleEventFormChange('price', e.target.value)}
                required
              />
            </Grid>
            <Grid item xs={12}>
              <TextField
                label="Event Description"
                multiline
                rows={3}
                fullWidth
                variant="outlined"
                placeholder="Describe the event, what participants will learn, etc."
                value={eventForm.description}
                onChange={(e) => handleEventFormChange('description', e.target.value)}
                required
              />
            </Grid>
            <Grid item xs={12} sm={6}>
              <TextField
                label="Max Participants"
                type="number"
                fullWidth
                variant="outlined"
                placeholder="20"
                value={eventForm.maxParticipants}
                onChange={(e) => handleEventFormChange('maxParticipants', e.target.value)}
                required
              />
            </Grid>
            <Grid item xs={12} sm={6}>
              <TextField
                label="Event Date"
                type="date"
                fullWidth
                variant="outlined"
                InputLabelProps={{ shrink: true }}
                value={eventForm.eventDate}
                onChange={(e) => handleEventFormChange('eventDate', e.target.value)}
                required
              />
            </Grid>
          </Grid>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setCreateEventDialogOpen(false)}>
            Cancel
          </Button>
          <Button 
            variant="contained" 
            color="primary"
            onClick={handleCreateEvent}
            disabled={isSaving || !eventForm.eventName || !eventForm.price || !eventForm.description}
          >
            {isSaving ? 'Creating...' : 'Create Event'}
          </Button>
        </DialogActions>
      </Dialog>

      <ConfirmationModal
        isOpen={confirmState.isOpen}
        onClose={() => setConfirmState(s => ({ ...s, isOpen: false }))}
        onConfirm={() => { confirmState.action?.(); setConfirmState(s => ({ ...s, isOpen: false })); }}
        title={confirmState.title}
        message={confirmState.message}
        isDestructive
      />
    </Box>
  );
}
// Cache bust Mon Oct 27 17:57:16 CDT 2025
