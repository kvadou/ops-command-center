import React, { useState, useEffect, useRef, useMemo } from 'react';
import { formatCurrency } from '../../utils/formatters';
import {
  TextField,
  Button,
  FormControl,
  InputLabel,
  Select,
  MenuItem,
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions,
  Tooltip,
  IconButton,
  FormControlLabel,
  Switch,
  Box,
  Typography,
  Chip,
  Divider,
  InputAdornment,
  Autocomplete,
  Avatar,
  CircularProgress,
} from '@mui/material';
import {
  PencilIcon,
  TrashIcon,
  EyeIcon,
  ArrowPathIcon,
} from '@heroicons/react/24/outline';
import ReactQuillWrapper from '../ReactQuillWrapper';
import LessonDatesCalendar from '../LessonDatesCalendar';
import BookingFormStepPreview from '../BookingFormStepPreview';
import axios from 'axios';
import ConfirmationModal from '../ConfirmationModal';

// Helper function to get authenticated axios instance
const getAuthenticatedAxios = () => {
  return axios.create({
    withCredentials: true,
  });
};

export default function EditableOnlineServicesList() {
  const [services, setServices] = useState([]);
  const [loading, setLoading] = useState(true);
  const [editDialogOpen, setEditDialogOpen] = useState(false);
  const [editingService, setEditingService] = useState(null);
  const [isSaving, setIsSaving] = useState(false);
  
  // Form state - same as EditableSchoolServicesList
  const [serviceId, setServiceId] = useState('');
  const [serviceName, setServiceName] = useState('');
  const [serviceDescription, setServiceDescription] = useState('');
  const [location, setLocation] = useState('');
  const [type, setType] = useState('');
  const [price, setPrice] = useState('');
  const [colourGroup, setColourGroup] = useState('');
  const [selectedLabel, setSelectedLabel] = useState({ id: '', name: '' });
  const [publicVisible, setPublicVisible] = useState(false);
  const [studentDiscountEnabled, setStudentDiscountEnabled] = useState(false);
  const [studentDiscountPercent, setStudentDiscountPercent] = useState(10);
  const [selectedImage, setSelectedImage] = useState('');
  const [imageSearchQuery, setImageSearchQuery] = useState('');
  const [existingImages, setExistingImages] = useState([]);
  const [newImage, setNewImage] = useState(null);
  const [imageUploading, setImageUploading] = useState(false);
  const imageFileInputRef = useRef(null);
  
  // Supporting data
  const [labels, setLabels] = useState([]);
  const [locations, setLocations] = useState([]);
  const [colourGroups, setColourGroups] = useState([]);
  const [appointmentCounts, setAppointmentCounts] = useState({});
  
  // Term billing state
  const [hasBookingForm, setHasBookingForm] = useState(false);
  const [termBillingEnabled, setTermBillingEnabled] = useState(false);
  const [termBillingConfig, setTermBillingConfig] = useState(null);
  // Rate per lesson is now pulled directly from job/service pricing - no longer editable here
  const [termDiscountPercent, setTermDiscountPercent] = useState('');
  const [classDates, setClassDates] = useState([]);
  const [monthlySubscriptionEnabled, setMonthlySubscriptionEnabled] = useState(false);
  const [loadingTermBilling, setLoadingTermBilling] = useState(false);
  
  // Confirmation modal state
  const [confirmState, setConfirmState] = useState({ isOpen: false, action: null, title: '', message: '' });

  // Snackbar
  const [snackbar, setSnackbar] = useState({ open: false, message: '', severity: 'success' });

  useEffect(() => {
    fetchServices();
    fetchLabels();
    fetchLocations();
    fetchColourGroups();
    fetchAppointmentCounts();
    fetchImages();
  }, []);

  const fetchServices = async () => {
    try {
      setLoading(true);
      const authAxios = getAuthenticatedAxios();
      
      // Filter by Online label
      const apiUrl = '/api/services?label=Online';
      
      const response = await authAxios.get(apiUrl);
      const servicesData = response.data?.data || response.data || [];
      setServices(Array.isArray(servicesData) ? servicesData : []);
    } catch (error) {
      console.error('Error fetching services:', error);
      setServices([]);
    } finally {
      setLoading(false);
    }
  };

  const fetchLabels = async () => {
    try {
      const response = await axios.get('/api/labels/');
      setLabels(response.data?.labels || []);
    } catch (error) {
      console.error('Error fetching labels:', error);
      setLabels([]);
    }
  };

  const fetchLocations = async () => {
    try {
      const authAxios = getAuthenticatedAxios();
      const response = await authAxios.get('/api/locations');
      setLocations(response.data || []);
    } catch (error) {
      console.error('Error fetching locations:', error);
      setLocations([]);
    }
  };

  const fetchColourGroups = async () => {
    try {
      const authAxios = getAuthenticatedAxios();
      const response = await authAxios.get('/api/colour-groups');
      setColourGroups(response.data || []);
    } catch (error) {
      console.error('Error fetching colour groups:', error);
      setColourGroups([]);
    }
  };

  const fetchAppointmentCounts = async () => {
    try {
      const authAxios = getAuthenticatedAxios();
      const { data } = await authAxios.get('/api/services/appointments/count');
      const counts = {};
      if (Array.isArray(data)) {
        data.forEach((appt) => {
          const id = appt?.serviceId;
          if (id != null) {
            counts[String(id)] = (counts[String(id)] || 0) + 1;
          }
        });
      } else if (data && typeof data === 'object') {
        Object.entries(data).forEach(([id, val]) => {
          counts[String(id)] = typeof val === 'number' ? val : Array.isArray(val) ? val.length : 1;
        });
      }
      setAppointmentCounts(counts);
    } catch (error) {
      console.error('Error fetching appointment counts:', error);
      setAppointmentCounts({});
    }
  };

  const fetchImages = async () => {
    try {
      const authAxios = getAuthenticatedAxios();
      const response = await authAxios.get('/api/images', { params: { folder: 'booking-forms' } });
      const images = response.data || [];
      const formattedImages = images
        .map(img => {
          if (typeof img === 'string') {
            const folder = img.includes('/tutor-photos/') ? 'tutor-photos' : 'general';
            return { url: img, folder: folder, name: img.split('/').pop() || 'image' };
          }
          return {
            url: img.url || img,
            folder: img.folder || 'general',
            name: img.displayName || img.name || img.url?.split('/').pop() || 'image'
          };
        })
        .filter(img => {
          const folder = img.folder || 'general';
          const url = img.url || img;
          return folder !== 'tutor-photos' && !url.includes('/tutor-photos/');
        });
      setExistingImages(formattedImages);
    } catch (error) {
      console.error('Error fetching images:', error);
      setExistingImages([]);
    }
  };

  const handleEdit = async (service) => {
    setEditingService(service);
    setServiceId(service.serviceId);
    setServiceName(service.name || '');
    setServiceDescription(service.description || '');
    setLocation(service.location || '');
    setType(service.type || '');
    setPrice(service.price || '');
    setColourGroup(service.colourGroup || '');
    setSelectedLabel({
      id: service.labelId || '',
      name: service.labelName || '',
    });
    setPublicVisible(service.publicVisible || false);
    setStudentDiscountEnabled(!!service.studentDiscountEnabled);
    setStudentDiscountPercent(
      typeof service.studentDiscountPercent === 'number' && !isNaN(service.studentDiscountPercent)
        ? service.studentDiscountPercent
        : 10
    );
    setSelectedImage(service.image || '');
    
    // Reset term billing state
    setTermBillingEnabled(false);
    setTermBillingConfig(null);
    setTermDiscountPercent('');
    setClassDates([]);
    setMonthlySubscriptionEnabled(false);
    
    // Check if service has booking form and load term billing config
    setLoadingTermBilling(true);
    try {
      const authAxios = getAuthenticatedAxios();
      
      try {
        const bookingTypesResponse = await authAxios.get('/api/booking-types');
        const bookingTypes = Array.isArray(bookingTypesResponse.data) 
          ? bookingTypesResponse.data 
          : bookingTypesResponse.data.rows || [];
        const hasForm = bookingTypes.some(bt => String(bt.serviceId) === String(service.serviceId));
        setHasBookingForm(hasForm);
        
        if (hasForm) {
          try {
            const configResponse = await authAxios.get(`/api/term-billing/config/${service.serviceId}`, {
              validateStatus: (status) => status < 500,
            });
            
            if (configResponse.status === 200 && configResponse.data.config) {
              const config = configResponse.data.config;
              setTermBillingEnabled(true);
              setTermBillingConfig(config);
              // Rate per lesson is now pulled from job/service pricing, not stored in config
              setTermDiscountPercent(config.term_discount_percent || '');
              setMonthlySubscriptionEnabled(!!config.monthly_subscription_enabled);
              
              let dates = config.class_dates || [];
              if (typeof dates === 'string') {
                try {
                  dates = JSON.parse(dates);
                } catch (e) {
                  dates = [];
                }
              }
              setClassDates(Array.isArray(dates) ? dates : []);
            }
          } catch (err) {
            if (err.response?.status !== 404) {
              console.error('Error loading term billing config:', err);
            }
          }
        }
      } catch (err) {
        console.error('Error checking booking form:', err);
        setHasBookingForm(false);
      }
    } finally {
      setLoadingTermBilling(false);
    }
    
    setEditDialogOpen(true);
    fetchImages();
    setImageSearchQuery('');
  };

  const handleSave = async () => {
    try {
      setIsSaving(true);
      
      const formData = new FormData();
      formData.append('serviceId', serviceId);
      formData.append('name', serviceName);
      formData.append('description', serviceDescription);
      formData.append('location', location);
      formData.append('type', type);
      formData.append('price', price);
      formData.append('colourGroup', colourGroup);
      formData.append('labelId', selectedLabel.id);
      formData.append('labelName', selectedLabel.name);
      formData.append('publicVisible', publicVisible);
      formData.append('studentDiscountEnabled', studentDiscountEnabled);
      formData.append('studentDiscountPercent', studentDiscountPercent);
      
      if (newImage) {
        formData.append('image', newImage);
      } else {
        formData.append('selectedImage', selectedImage);
      }

      await axios.post('/api/services', formData, {
        headers: { 'Content-Type': 'multipart/form-data' },
      });

      setSnackbar({
        open: true,
        message: 'Service saved successfully!',
        severity: 'success',
      });

      // Save term billing configuration if enabled
      if (hasBookingForm && termBillingEnabled && serviceId) {
        try {
          const authAxios = getAuthenticatedAxios();
          
          try {
            const existingConfigResponse = await authAxios.get(`/api/term-billing/config/${serviceId}`, {
              validateStatus: (status) => status < 500,
            });
            if (existingConfigResponse.status === 200 && existingConfigResponse.data.config?.id) {
              await authAxios.delete(`/api/term-billing/config/${existingConfigResponse.data.config.id}`);
            }
          } catch (e) {
            // Config doesn't exist, that's fine
          }
          
          const termBillingPayload = {
            serviceId,
            termName: `${serviceName} Term`,
            ratePerLesson: parseFloat(ratePerLesson) || parseFloat(price) || 0,
            termDiscountPercent: termDiscountPercent ? parseFloat(termDiscountPercent) : null,
            familyDiscountPercent: studentDiscountEnabled ? studentDiscountPercent : null,
            classDates: classDates,
            monthlySubscriptionEnabled: monthlySubscriptionEnabled,
          };
          
          await authAxios.post('/api/term-billing/create-config', termBillingPayload);
        } catch (error) {
          console.error('Error saving term billing config:', error);
          setSnackbar({
            open: true,
            message: 'Service saved, but term billing configuration failed.',
            severity: 'warning',
          });
        }
      } else if (hasBookingForm && !termBillingEnabled && termBillingConfig) {
        try {
          const authAxios = getAuthenticatedAxios();
          await authAxios.delete(`/api/term-billing/config/${serviceId}`);
        } catch (error) {
          console.error('Error deleting term billing config:', error);
        }
      }

      setEditDialogOpen(false);
      fetchServices();
      fetchAppointmentCounts();
    } catch (error) {
      console.error('Error saving service:', error);
      setSnackbar({
        open: true,
        message: 'Failed to save service.',
        severity: 'error',
      });
    } finally {
      setIsSaving(false);
    }
  };

  const handleDelete = (serviceId) => {
    setConfirmState({
      isOpen: true,
      title: 'Delete Service',
      message: 'Are you sure you want to delete this service?',
      action: async () => {
        try {
          const authAxios = getAuthenticatedAxios();
          await authAxios.delete(`/api/services/${serviceId}`);
          setSnackbar({
            open: true,
            message: 'Service deleted successfully!',
            severity: 'success',
          });
          fetchServices();
        } catch (error) {
          console.error('Error deleting service:', error);
          setSnackbar({
            open: true,
            message: 'Failed to delete service.',
            severity: 'error',
          });
        }
      },
    });
  };

  const handleImageChange = (e) => {
    setNewImage(e.target.files[0]);
  };

  const handleImageUpload = async () => {
    if (!newImage) return;
    
    setImageUploading(true);
    const formData = new FormData();
    formData.append('image', newImage);
    formData.append('folder', 'service-images');

    try {
      const authAxios = getAuthenticatedAxios();
      const response = await authAxios.post('/api/images', formData, {
        headers: { 'Content-Type': 'multipart/form-data' },
      });

      setNewImage(null);
      await fetchImages();
      if (response.data?.imageUrl) {
        setSelectedImage(response.data.imageUrl);
      }
      setSnackbar({
        open: true,
        message: 'Image uploaded successfully!',
        severity: 'success',
      });
    } catch (error) {
      console.error('Error uploading image:', error);
      setSnackbar({
        open: true,
        message: 'Failed to upload image.',
        severity: 'error',
      });
    } finally {
      setImageUploading(false);
    }
  };

  const filteredImages = useMemo(() => {
    const nonTutorImages = existingImages.filter(img => {
      const url = img.url || img;
      const folder = img.folder || 'general';
      return folder !== 'tutor-photos' && !url.includes('/tutor-photos/');
    });
    
    if (!imageSearchQuery) return nonTutorImages;
    const query = imageSearchQuery.toLowerCase();
    return nonTutorImages.filter(img => {
      const url = img.url || img;
      const folder = img.folder || 'general';
      const name = img.name || url.split('/').pop() || '';
      return url.toLowerCase().includes(query) || 
             folder.toLowerCase().includes(query) ||
             name.toLowerCase().includes(query);
    });
  }, [existingImages, imageSearchQuery]);


  const getApptCount = (sid) => {
    if (sid == null) return 0;
    const val = appointmentCounts[String(sid)];
    if (Array.isArray(val)) return val.length;
    const n = Number(val);
    return Number.isFinite(n) ? n : 0;
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center py-12">
        <CircularProgress />
        <span className="ml-3 text-neutral-600">Loading services...</span>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Services List */}
      <div className="bg-white rounded-xl shadow-sm border border-neutral-200 overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full">
            <thead className="bg-neutral-50 border-b border-neutral-200">
              <tr>
                <th className="px-6 py-3 text-left text-xs font-medium text-neutral-500 uppercase tracking-wider">
                  Service
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium text-neutral-500 uppercase tracking-wider">
                  Location
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium text-neutral-500 uppercase tracking-wider">
                  Type
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium text-neutral-500 uppercase tracking-wider">
                  Price
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium text-neutral-500 uppercase tracking-wider">
                  Lessons
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium text-neutral-500 uppercase tracking-wider">
                  Actions
                </th>
              </tr>
            </thead>
            <tbody className="bg-white divide-y divide-neutral-200">
              {services.length === 0 ? (
                <tr>
                  <td colSpan="6" className="px-6 py-12 text-center text-neutral-500">
                    No services found. Click "Add Service" to create one.
                  </td>
                </tr>
              ) : (
                services.map((service) => (
                  <tr key={service.serviceId} className="hover:bg-neutral-50 transition-colors">
                    <td className="px-6 py-4 whitespace-nowrap">
                      <div className="flex items-center">
                        {service.image && (
                          <img
                            src={service.image}
                            alt={service.name}
                            className="h-10 w-10 rounded-lg object-cover mr-3"
                          />
                        )}
                        <div>
                          <div className="text-sm font-medium text-neutral-900">
                            {service.name}
                          </div>
                          {service.labelName && (
                            <Chip
                              label={service.labelName}
                              size="small"
                              className="mt-1"
                              sx={{
                                height: 20,
                                fontSize: '0.7rem',
                                bgcolor: '#6A469D',
                                color: 'white',
                              }}
                            />
                          )}
                        </div>
                      </div>
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm text-neutral-600">
                      {service.location || '—'}
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm text-neutral-600">
                      {service.type || '—'}
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm font-medium text-neutral-900">
                      {service.price ? formatCurrency(service.price) : '—'}
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm text-neutral-600">
                      {getApptCount(service.serviceId)}
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm font-medium">
                      <div className="flex items-center gap-2">
                        <Tooltip title="Edit">
                          <button
                            onClick={() => handleEdit(service)}
                            className="p-2 text-neutral-600 hover:text-brand-purple hover:bg-neutral-50 rounded-lg transition-colors"
                          >
                            <PencilIcon className="h-4 w-4" />
                          </button>
                        </Tooltip>
                        <Tooltip title="View Form">
                          <a
                            href={`/booking-forms/frontend?serviceId=${service.serviceId}`}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="p-2 text-neutral-600 hover:text-brand-purple hover:bg-neutral-50 rounded-lg transition-colors"
                          >
                            <EyeIcon className="h-4 w-4" />
                          </a>
                        </Tooltip>
                        <Tooltip title="Delete">
                          <button
                            onClick={() => handleDelete(service.serviceId)}
                            className="p-2 text-neutral-600 hover:text-red-600 hover:bg-neutral-50 rounded-lg transition-colors"
                          >
                            <TrashIcon className="h-4 w-4" />
                          </button>
                        </Tooltip>
                      </div>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* Edit Dialog - Same structure as EditableSchoolServicesList */}
      <Dialog
        open={editDialogOpen}
        onClose={() => setEditDialogOpen(false)}
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
                onChange={(e) => setServiceId(e.target.value)}
                fullWidth
                sx={{ mb: 2 }}
              />
              <TextField
                label="Service Name"
                value={serviceName}
                onChange={(e) => setServiceName(e.target.value)}
                fullWidth
                sx={{ mb: 2 }}
              />
              <Box sx={{ mb: 2 }}>
                <Typography variant="body2" sx={{ mb: 1, color: 'text.secondary', fontWeight: 500 }}>
                  Service Description
                </Typography>
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
                />
              </Box>
              <FormControl fullWidth sx={{ mb: 2 }}>
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
              
              <Box sx={{ mb: 2 }}>
                <FormControlLabel
                  control={
                    <Switch
                      checked={studentDiscountEnabled}
                      onChange={(e) => setStudentDiscountEnabled(e.target.checked)}
                      color="primary"
                    />
                  }
                  label="Offer Student Discount for 2+ Students"
                />
                {studentDiscountEnabled && (
                  <TextField
                    label="Discount Percent (%)"
                    type="number"
                    value={studentDiscountPercent}
                    onChange={(e) => setStudentDiscountPercent(Math.max(0, Math.min(100, Number(e.target.value))))}
                    fullWidth
                    inputProps={{ min: 0, max: 100 }}
                    sx={{ mt: 1 }}
                  />
                )}
              </Box>

              <FormControl fullWidth sx={{ mb: 2 }}>
                <InputLabel>Subject</InputLabel>
                <Select
                  value={colourGroup || ""}
                  onChange={(e) => setColourGroup(e.target.value)}
                >
                  <MenuItem value=""><em>None</em></MenuItem>
                  {colourGroups.map((group) => (
                    <MenuItem key={group.id} value={group.name}>
                      <Box sx={{ display: 'flex', alignItems: 'center' }}>
                        <Box
                          sx={{
                            backgroundColor: group.color,
                            width: 20,
                            height: 20,
                            marginRight: 1,
                            borderRadius: 1,
                          }}
                        />
                        {group.name}
                      </Box>
                    </MenuItem>
                  ))}
                </Select>
              </FormControl>
              
              <FormControl fullWidth sx={{ mb: 2 }}>
                <InputLabel>Type</InputLabel>
                <Select
                  value={type || ""}
                  onChange={(e) => setType(e.target.value)}
                >
                  <MenuItem value=""><em>None</em></MenuItem>
                  <MenuItem value="one-off">Class Pack (One-off)</MenuItem>
                  <MenuItem value="Per Session">Per Session</MenuItem>
                  <MenuItem value="Per Session Special">Per Session Special</MenuItem>
                </Select>
              </FormControl>

              <TextField
                label="Price"
                value={price ?? ""}
                onChange={(e) => setPrice(e.target.value)}
                fullWidth
                sx={{ mb: 2 }}
              />
              
              <FormControl fullWidth sx={{ mb: 2 }}>
                <InputLabel>Location</InputLabel>
                <Select
                  value={location || ""}
                  onChange={(e) => setLocation(e.target.value)}
                >
                  <MenuItem value=""><em>None</em></MenuItem>
                  {locations.map((loc) => (
                    <MenuItem key={loc.id} value={loc.name}>
                      {loc.name}
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
                sx={{ mb: 2 }}
              />
              
              <FormControl fullWidth sx={{ mb: 2 }}>
                <Box sx={{ display: 'flex', gap: 1, alignItems: 'flex-start', mb: 1 }}>
                  <IconButton 
                    size="small" 
                    onClick={fetchImages}
                    sx={{ mt: 1 }}
                  >
                    <ArrowPathIcon className="h-5 w-5" />
                  </IconButton>
                  <Box sx={{ flex: 1 }}>
                    <Autocomplete
                      options={filteredImages}
                      getOptionLabel={(option) => {
                        if (!option) return '';
                        if (typeof option === 'string') return option.split('/').pop() || option;
                        return option.name || option.url?.split('/').pop() || String(option);
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
                        />
                      )}
                      renderOption={(props, option) => {
                        const imgUrl = typeof option === 'string' ? option : option.url;
                        const name = typeof option === 'string' ? option.split('/').pop() : (option.name || option.url?.split('/').pop() || 'image');
                        return (
                          <li {...props} key={imgUrl}>
                            <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, width: '100%' }}>
                              <Avatar
                                src={imgUrl}
                                alt={name}
                                variant="rounded"
                                sx={{ width: 50, height: 50 }}
                              />
                              <Typography variant="body2" noWrap>
                                {name}
                              </Typography>
                            </Box>
                          </li>
                        );
                      }}
                    />
                  </Box>
                </Box>
                
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
                      onClick={() => imageFileInputRef.current?.click()}
                      disabled={imageUploading}
                    >
                      {imageUploading ? 'Uploading...' : 'Choose File'}
                    </Button>
                    {newImage && (
                      <>
                        <Typography variant="caption" color="text.secondary" sx={{ flex: 1 }}>
                          {newImage.name}
                        </Typography>
                        <Button
                          size="small"
                          variant="contained"
                          onClick={handleImageUpload}
                          disabled={imageUploading}
                        >
                          {imageUploading ? 'Uploading...' : 'Upload'}
                        </Button>
                      </>
                    )}
                  </Box>
                </Box>
              </FormControl>

              {/* Term Billing Configuration */}
              {hasBookingForm && (
                <>
                  <Divider sx={{ my: 3 }} />
                  <Typography variant="h6" sx={{ mb: 2, fontWeight: 600 }}>
                    Booking Form Configuration
                  </Typography>
                  
                  <Box sx={{ mb: 3 }}>
                    <FormControlLabel
                      control={
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
                      }
                      label="Enable Term Billing"
                    />
                  </Box>

                  {termBillingEnabled && (
                    <>
                      <TextField
                        label="Term Discount % (Optional)"
                        type="number"
                        value={termDiscountPercent}
                        onChange={(e) => setTermDiscountPercent(e.target.value)}
                        fullWidth
                        InputProps={{
                          startAdornment: <InputAdornment position="start">%</InputAdornment>,
                        }}
                        sx={{ mb: 2 }}
                      />

                      <FormControlLabel
                        control={
                          <Switch
                            checked={monthlySubscriptionEnabled}
                            onChange={(e) => setMonthlySubscriptionEnabled(e.target.checked)}
                            color="primary"
                            disabled={!termBillingEnabled}
                          />
                        }
                        label="Enable Monthly Billing Option"
                        sx={{ mb: 2 }}
                      />

                      <Box sx={{ mb: 2 }}>
                        <Typography variant="body2" sx={{ mb: 1, fontWeight: 500 }}>
                          Class Dates
                        </Typography>
                        <LessonDatesCalendar
                          dates={classDates}
                          onChange={setClassDates}
                        />
                      </Box>
                    </>
                  )}
                </>
              )}
            </Box>

            {/* Right Side - Booking Form Preview */}
            {hasBookingForm && (
              <Box sx={{ 
                width: '50%', 
                overflow: 'auto',
                p: 3,
                bgcolor: 'grey.50'
              }}>
                <Typography variant="h6" sx={{ mb: 2, fontWeight: 600 }}>
                  Booking Form Preview
                </Typography>
                <BookingFormStepPreview
                  serviceId={serviceId}
                  serviceName={serviceName}
                  serviceDescription={serviceDescription}
                  price={price}
                  image={selectedImage}
                  termBillingEnabled={termBillingEnabled}
                  termBillingConfig={termBillingConfig}
                  termDiscountPercent={termDiscountPercent ? parseFloat(termDiscountPercent) : 0}
                  monthlySubscriptionEnabled={monthlySubscriptionEnabled}
                  studentDiscountEnabled={studentDiscountEnabled}
                  studentDiscountPercent={studentDiscountPercent}
                />
              </Box>
            )}
          </Box>
        </DialogContent>
        <DialogActions sx={{ px: 3, pb: 2 }}>
          <Button onClick={() => setEditDialogOpen(false)}>Cancel</Button>
          <Button 
            variant="contained" 
            onClick={handleSave}
            disabled={isSaving}
          >
            {isSaving ? 'Saving...' : 'Save'}
          </Button>
        </DialogActions>
      </Dialog>

      {/* Snackbar */}
      {snackbar.open && (
        <div className="fixed bottom-4 right-4 bg-white border border-neutral-200 rounded-lg shadow-lg p-4 z-50">
          <div className={`text-sm ${snackbar.severity === 'error' ? 'text-red-600' : snackbar.severity === 'warning' ? 'text-yellow-600' : 'text-green-600'}`}>
            {snackbar.message}
          </div>
        </div>
      )}

      <ConfirmationModal
        isOpen={confirmState.isOpen}
        onClose={() => setConfirmState({ isOpen: false, action: null, title: '', message: '' })}
        onConfirm={() => {
          confirmState.action?.();
          setConfirmState({ isOpen: false, action: null, title: '', message: '' });
        }}
        title={confirmState.title}
        message={confirmState.message}
        confirmText="Delete"
        isDestructive={true}
      />
    </div>
  );
}
