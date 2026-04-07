/**
 * TermBillingSetup Component
 * Admin interface for creating and managing term billing configurations
 * Allows admins to:
 * - Select specific class dates (skip holidays)
 * - Set rate per lesson
 * - Configure term and family discounts
 * - Preview monthly distribution
 * - Generate booking forms
 */

import React, { useState, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import axios from 'axios';
import { formatCurrency } from '../utils/formatters';
import {
  Box,
  Button,
  Card,
  CardContent,
  TextField,
  Typography,
  Alert,
  CircularProgress,
  Divider,
  Chip,
  Grid,
  Paper,
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TableRow,
  IconButton,
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions,
  FormControl,
  InputLabel,
  Select,
  MenuItem,
  FormHelperText,
  InputAdornment,
  TableSortLabel,
  Pagination,
  Stack,
} from '@mui/material';
import { MagnifyingGlassIcon, TrashIcon, EyeIcon, CalendarDaysIcon, ArrowUpIcon, ArrowDownIcon } from '@heroicons/react/24/outline';
import { CheckCircleIcon } from '@heroicons/react/24/solid';
import LessonDatesCalendar from './LessonDatesCalendar';

// Helper to get authenticated axios instance
const getAuthenticatedAxios = () => {
  return axios.create({
    withCredentials: true,
  });
};

export default function TermBillingSetup() {
  const { serviceId } = useParams();
  const navigate = useNavigate();
  
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState(null);
  const [success, setSuccess] = useState(null);
  
  // List view state (when no serviceId)
  const [services, setServices] = useState([]);
  const [allServices, setAllServices] = useState([]); // Store all services for filtering
  const [configs, setConfigs] = useState([]);
  const [loadingList, setLoadingList] = useState(true);
  const [selectedService, setSelectedService] = useState(null);
  const [searchQuery, setSearchQuery] = useState('');
  const [sortColumn, setSortColumn] = useState('status'); // Default sort by status
  const [sortDirection, setSortDirection] = useState('asc');
  const [page, setPage] = useState(1);
  const [pageSize] = useState(50);
  
  // Form state
  const [termName, setTermName] = useState('');
  const [ratePerLesson, setRatePerLesson] = useState('');
  const [termDiscountPercent, setTermDiscountPercent] = useState('');
  const [familyDiscountPercent, setFamilyDiscountPercent] = useState('');
  const [classDates, setClassDates] = useState([]);
  
  // Preview state
  const [preview, setPreview] = useState(null);
  const [previewDialogOpen, setPreviewDialogOpen] = useState(false);
  
  // Existing config
  const [existingConfig, setExistingConfig] = useState(null);
  const [isEditing, setIsEditing] = useState(false);
  const [serviceName, setServiceName] = useState(null);

  // Load services and configs if no serviceId provided
  useEffect(() => {
    if (!serviceId) {
      loadServicesAndConfigs();
    }
  }, [serviceId]);

  // Status priority order: in-progress → pending → finished → gone cold → others
  const getStatusPriority = (status) => {
    const statusLower = (status || '').toLowerCase();
    if (statusLower === 'in-progress') return 1;
    if (statusLower === 'pending') return 2;
    if (statusLower === 'finished' || statusLower === 'completed') return 3;
    if (statusLower === 'gone-cold' || statusLower === 'gone_cold') return 4;
    return 5; // Other statuses
  };

  // Sort services function
  const sortServices = (servicesToSort, column, direction, configMap = {}) => {
    return [...servicesToSort].sort((a, b) => {
      let aValue, bValue;
      
      if (column === 'name') {
        aValue = (a.name || '').toLowerCase();
        bValue = (b.name || '').toLowerCase();
      } else if (column === 'service_id') {
        aValue = String(a.service_id || '');
        bValue = String(b.service_id || '');
      } else if (column === 'status') {
        // Custom status sorting with priority
        const aPriority = getStatusPriority(a.status);
        const bPriority = getStatusPriority(b.status);
        if (aPriority !== bPriority) {
          return direction === 'asc' ? aPriority - bPriority : bPriority - aPriority;
        }
        // If same priority, sort alphabetically
        aValue = (a.status || '').toLowerCase();
        bValue = (b.status || '').toLowerCase();
      } else if (column === 'term_billing_config') {
        // Prioritize services with configs at the top
        const aHasConfig = !!configMap[a.service_id];
        const bHasConfig = !!configMap[b.service_id];
        
        if (aHasConfig !== bHasConfig) {
          // Services with configs come first (ascending) or last (descending)
          if (direction === 'asc') {
            return aHasConfig ? -1 : 1; // Configs first
          } else {
            return aHasConfig ? 1 : -1; // Configs last
          }
        }
        
        // If both have configs or both don't, sort by term name (if config exists)
        if (aHasConfig && bHasConfig) {
          const aConfig = configMap[a.service_id];
          const bConfig = configMap[b.service_id];
          aValue = (aConfig.term_name || '').toLowerCase();
          bValue = (bConfig.term_name || '').toLowerCase();
        } else {
          // Both don't have configs, sort by service name
          aValue = (a.name || '').toLowerCase();
          bValue = (b.name || '').toLowerCase();
        }
      } else if (column === 'public_visible') {
        aValue = a.public_visible || false;
        bValue = b.public_visible || false;
      } else {
        // Default: sort by name
        aValue = (a.name || '').toLowerCase();
        bValue = (b.name || '').toLowerCase();
      }
      
      // Handle boolean values
      if (typeof aValue === 'boolean' && typeof bValue === 'boolean') {
        if (direction === 'asc') {
          return aValue === bValue ? 0 : aValue ? -1 : 1;
        } else {
          return aValue === bValue ? 0 : aValue ? 1 : -1;
        }
      }
      
      // String/number comparison
      if (aValue < bValue) return direction === 'asc' ? -1 : 1;
      if (aValue > bValue) return direction === 'asc' ? 1 : -1;
      return 0;
    });
  };

  // Filter and sort services based on search query and sorting
  useEffect(() => {
    // Create config map for filtering and sorting
    const configMapForFilter = {};
    configs.forEach(config => {
      configMapForFilter[config.service_id] = config;
    });
    
    // Filter: Only show services that have term billing enabled (have a config)
    let filtered = allServices.filter(service => {
      return !!configMapForFilter[service.service_id];
    });
    
    // Apply search filter
    if (searchQuery.trim()) {
      const query = searchQuery.toLowerCase().trim();
      filtered = filtered.filter(service => {
        const name = (service.name || '').toLowerCase();
        const serviceId = String(service.service_id || '').toLowerCase();
        return name.includes(query) || serviceId.includes(query);
      });
    }
    
    // Apply sorting (pass configMap for term_billing_config sorting)
    const sorted = sortServices(filtered, sortColumn, sortDirection, configMapForFilter);
    
    // Apply pagination
    const startIndex = (page - 1) * pageSize;
    const endIndex = startIndex + pageSize;
    const paginated = sorted.slice(startIndex, endIndex);
    
    setServices(paginated);
  }, [searchQuery, allServices, sortColumn, sortDirection, page, pageSize, configs]);

  // Reset to page 1 when search or sort changes
  useEffect(() => {
    setPage(1);
  }, [searchQuery, sortColumn, sortDirection]);

  const handleSort = (column) => {
    if (sortColumn === column) {
      setSortDirection(sortDirection === 'asc' ? 'desc' : 'asc');
    } else {
      setSortColumn(column);
      setSortDirection('asc');
    }
  };

  // Load existing config if serviceId provided
  useEffect(() => {
    if (serviceId) {
      loadExistingConfig();
    }
  }, [serviceId]);

  const loadServicesAndConfigs = async () => {
    try {
      setLoadingList(true);
      const api = getAuthenticatedAxios();
      
      // Load services
      const servicesResponse = await api.get('/api/entity-lists/jobs?limit=1000');
      const loadedServices = servicesResponse.data.data || servicesResponse.data.jobs || [];
      setAllServices(loadedServices);
      // Initial sorting will be handled by useEffect with default sortColumn='status' and sortDirection='asc'
      
      // Load all term billing configs
      try {
        const configsResponse = await api.get('/api/term-billing/configs');
        setConfigs(configsResponse.data.configs || []);
      } catch (err) {
        // Endpoint might not exist, that's okay
        console.warn('Could not load configs:', err);
        setConfigs([]);
      }
    } catch (error) {
      console.error('Error loading services:', error);
      setError('Failed to load services');
    } finally {
      setLoadingList(false);
    }
  };

  const loadExistingConfig = async () => {
    try {
      setLoading(true);
      const api = getAuthenticatedAxios();
      
      // Try to load service name
      try {
        const serviceResponse = await api.get(`/api/entity-lists/jobs?search=${serviceId}&limit=1`);
        const services = serviceResponse.data.data || serviceResponse.data.jobs || [];
        if (services.length > 0) {
          const service = services.find(s => s.service_id === serviceId) || services[0];
          setServiceName(service.name);
        }
      } catch (err) {
        console.warn('Could not load service name:', err);
      }
      
      // Load config if it exists
      try {
        const response = await api.get(`/api/term-billing/config/${serviceId}`);
        
        if (!response.data?.config) {
          // Config doesn't exist yet - try to load future appointment dates as defaults
          try {
            const futureDatesResponse = await api.get(`/api/term-billing/future-dates/${serviceId}`);
            if (futureDatesResponse.data.dates && futureDatesResponse.data.dates.length > 0) {
              setClassDates(futureDatesResponse.data.dates);
            }
          } catch (futureDatesErr) {
            // If we can't load future dates, that's okay - user can select manually
            console.warn('Could not load future dates:', futureDatesErr);
          }
          return;
        }
        
        if (response.data.config) {
          const config = response.data.config;
          setExistingConfig(config);
          setIsEditing(true);
          setTermName(config.term_name);
          setRatePerLesson(config.rate_per_lesson);
          setTermDiscountPercent(config.term_discount_percent || '');
          setFamilyDiscountPercent(config.family_discount_percent || '');
          // Ensure class_dates is an array and properly formatted
          let dates = config.class_dates || [];
          if (typeof dates === 'string') {
            try {
              dates = JSON.parse(dates);
            } catch (e) {
              console.warn('Failed to parse class_dates string:', e);
              dates = [];
            }
          }
          // Ensure dates are in YYYY-MM-DD format
          dates = dates.map(date => {
            if (typeof date === 'string') {
              // If already in YYYY-MM-DD format, return as is
              if (/^\d{4}-\d{2}-\d{2}$/.test(date)) {
                return date;
              }
              // Otherwise, parse and reformat
              const d = new Date(date);
              return d.toISOString().split('T')[0];
            }
            return date;
          }).filter(Boolean).sort();
          setClassDates(dates);
        }
      } catch (err) {
        // Only log non-404 errors
        if (err.response?.status !== 404 && err.response?.status !== undefined) {
          console.error('Error loading config:', err);
        }
        // Config doesn't exist yet or other error - that's fine
      }
    } catch (error) {
      console.error('Error loading data:', error);
      setError('Failed to load service information');
    } finally {
      setLoading(false);
    }
  };

  const handleDatesChange = (result) => {
    // LessonDatesCalendar returns { dates: [], startTime: null, endTime: null }
    // or just an array of dates (for backward compatibility)
    if (Array.isArray(result)) {
      setClassDates(result.sort());
    } else if (result && result.dates) {
      setClassDates(result.dates.sort());
    }
    setError(null);
  };


  const handlePreview = async () => {
    if (!ratePerLesson || classDates.length === 0) {
      setError('Please provide rate per lesson and at least one class date');
      return;
    }
    
    try {
      setLoading(true);
      const api = getAuthenticatedAxios();
      const response = await api.post('/api/term-billing/preview', {
        ratePerLesson: parseFloat(ratePerLesson),
        termDiscountPercent: termDiscountPercent ? parseFloat(termDiscountPercent) : null,
        classDates: classDates,
      });
      
      setPreview(response.data.preview);
      setPreviewDialogOpen(true);
      setError(null);
    } catch (error) {
      console.error('Error generating preview:', error);
      setError(error.response?.data?.error || 'Failed to generate preview');
    } finally {
      setLoading(false);
    }
  };

  const handleSave = async () => {
    if (!serviceId) {
      setError('Service ID is required');
      return;
    }
    
    if (!termName || !ratePerLesson || classDates.length === 0) {
      setError('Please fill in all required fields');
      return;
    }
    
    try {
      setSaving(true);
      setError(null);
      const api = getAuthenticatedAxios();
      
      const payload = {
        serviceId,
        termName,
        ratePerLesson: parseFloat(ratePerLesson),
        termDiscountPercent: termDiscountPercent ? parseFloat(termDiscountPercent) : null,
        familyDiscountPercent: familyDiscountPercent ? parseFloat(familyDiscountPercent) : null,
        classDates: classDates,
      };
      
      const response = await api.post('/api/term-billing/create-config', payload);
      
      setSuccess('Term billing configuration created successfully!');
      setExistingConfig(response.data.config);
      setIsEditing(true);
      
      // Clear form after short delay
      setTimeout(() => {
        setSuccess(null);
      }, 3000);
    } catch (error) {
      console.error('Error saving config:', error);
      setError(error.response?.data?.error || 'Failed to save configuration');
    } finally {
      setSaving(false);
    }
  };


  const formatDate = (dateStr) => {
    return new Date(dateStr).toLocaleDateString('en-US', {
      weekday: 'short',
      year: 'numeric',
      month: 'short',
      day: 'numeric',
    });
  };

  // Show list view when no serviceId provided
  if (!serviceId) {
    if (loadingList) {
      return (
        <Box display="flex" justifyContent="center" alignItems="center" minHeight="400px">
          <CircularProgress />
        </Box>
      );
    }

    // Create a map of service_id to config
    const configMap = {};
    configs.forEach(config => {
      configMap[config.service_id] = config;
    });

    return (
      <Box>

        {error && (
          <Alert severity="error" sx={{ mb: 3 }} onClose={() => setError(null)}>
            {error}
          </Alert>
        )}

        <Card>
          <CardContent>
            <Box sx={{ mb: 3, display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 2 }}>
              <Typography variant="h6">
                Services
              </Typography>
              <TextField
                placeholder="Search by name or service ID..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                size="small"
                sx={{ minWidth: 300 }}
                InputProps={{
                  startAdornment: (
                    <InputAdornment position="start">
                      <MagnifyingGlassIcon className="h-5 w-5" />
                    </InputAdornment>
                  ),
                }}
              />
            </Box>
            
            {/* Calculate total filtered services for pagination */}
            {(() => {
              // Create config map for filtering
              const configMapForFilter = {};
              configs.forEach(config => {
                configMapForFilter[config.service_id] = config;
              });
              
              // Filter: Only show services that have term billing enabled (have a config)
              let filtered = allServices.filter(service => {
                return !!configMapForFilter[service.service_id];
              });
              
              // Apply search filter
              if (searchQuery.trim()) {
                    const query = searchQuery.toLowerCase().trim();
                filtered = filtered.filter(service => {
                    const name = (service.name || '').toLowerCase();
                    const serviceId = String(service.service_id || '').toLowerCase();
                    return name.includes(query) || serviceId.includes(query);
                });
              }
              
              const totalFiltered = filtered.length;
              const totalPages = Math.ceil(totalFiltered / pageSize);
              
              return (
                <>
                  {services.length === 0 ? (
                    <Alert severity="info">
                      {searchQuery.trim() 
                        ? `No term billing services found matching "${searchQuery}". Try a different search term.`
                        : 'No term billing services found. Enable term billing for a service in Service Configuration to see it here.'}
                    </Alert>
                  ) : (
                    <>
                      <TableContainer component={Paper} variant="outlined">
                        <Table>
                          <TableHead>
                            <TableRow>
                              <TableCell>
                                <TableSortLabel
                                  active={sortColumn === 'name'}
                                  direction={sortColumn === 'name' ? sortDirection : 'asc'}
                                  onClick={() => handleSort('name')}
                                  sx={{ fontWeight: 'bold' }}
                                >
                                  Service Name
                                </TableSortLabel>
                              </TableCell>
                              <TableCell>
                                <TableSortLabel
                                  active={sortColumn === 'service_id'}
                                  direction={sortColumn === 'service_id' ? sortDirection : 'asc'}
                                  onClick={() => handleSort('service_id')}
                                  sx={{ fontWeight: 'bold' }}
                                >
                                  Service ID
                                </TableSortLabel>
                              </TableCell>
                              <TableCell>
                                <TableSortLabel
                                  active={sortColumn === 'status'}
                                  direction={sortColumn === 'status' ? sortDirection : 'asc'}
                                  onClick={() => handleSort('status')}
                                  sx={{ fontWeight: 'bold' }}
                                >
                                  Status
                                </TableSortLabel>
                              </TableCell>
                              <TableCell>
                                <TableSortLabel
                                  active={sortColumn === 'term_billing_config'}
                                  direction={sortColumn === 'term_billing_config' ? sortDirection : 'asc'}
                                  onClick={() => handleSort('term_billing_config')}
                                  sx={{ fontWeight: 'bold' }}
                                >
                                  Term Billing Config
                                </TableSortLabel>
                              </TableCell>
                              <TableCell align="right"><strong>Actions</strong></TableCell>
                            </TableRow>
                          </TableHead>
                          <TableBody>
                            {services.map((service) => {
                              const config = configMap[service.service_id];
                              const isPublicVisible = service.public_visible || false;
                              return (
                        <TableRow 
                          key={service.service_id} 
                          hover
                          sx={{
                            backgroundColor: isPublicVisible ? 'rgba(106, 70, 157, 0.04)' : 'inherit',
                            '&:hover': {
                              backgroundColor: isPublicVisible ? 'rgba(106, 70, 157, 0.08)' : undefined,
                            }
                          }}
                        >
                          <TableCell>
                            <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                              {service.name || '—'}
                              {isPublicVisible && (
                                <Chip 
                                  label="Public" 
                                  size="small" 
                                  color="primary"
                                  sx={{ height: 20, fontSize: '0.7rem' }}
                                />
                              )}
                            </Box>
                          </TableCell>
                          <TableCell>{service.service_id}</TableCell>
                          <TableCell>
                            <Chip 
                              label={service.status || '—'} 
                              size="small"
                              color={service.status === 'active' ? 'success' : 'default'}
                            />
                          </TableCell>
                          <TableCell>
                            {config ? (
                              <Box>
                                <Typography variant="body2" fontWeight="medium">
                                  {config.term_name}
                                </Typography>
                                <Typography variant="caption" color="text.secondary">
                                  {config.total_lessons} lessons • ${parseFloat(config.rate_per_lesson).toFixed(2)}/lesson
                                </Typography>
                              </Box>
                            ) : (
                              <Typography variant="body2" color="text.secondary">
                                No config
                              </Typography>
                            )}
                          </TableCell>
                          <TableCell align="right">
                            <Button
                              variant={config ? "outlined" : "contained"}
                              size="small"
                              onClick={() => navigate(`/school-dashboard/term-billing-setup/${service.service_id}`)}
                              sx={{ mr: 1 }}
                            >
                              {config ? 'Edit' : 'Create'}
                            </Button>
                          </TableCell>
                        </TableRow>
                              );
                            })}
                          </TableBody>
                      </Table>
                    </TableContainer>
                    
                    {/* Pagination */}
                    {totalPages > 1 && (
                      <Box sx={{ display: 'flex', justifyContent: 'center', mt: 3 }}>
                        <Stack spacing={2} alignItems="center">
                          <Typography variant="body2" color="text.secondary" sx={{ mb: 1 }}>
                            Showing {((page - 1) * pageSize) + 1} - {Math.min(page * pageSize, totalFiltered)} of {totalFiltered} services
                          </Typography>
                          <Pagination
                            count={totalPages}
                            page={page}
                            onChange={(event, value) => setPage(value)}
                            color="primary"
                            size="large"
                            showFirstButton
                            showLastButton
                          />
                        </Stack>
                      </Box>
                    )}
                  </>
                )}
                </>
              );
            })()}
          </CardContent>
        </Card>
      </Box>
    );
  }

  if (loading && !existingConfig) {
    return (
      <Box display="flex" justifyContent="center" alignItems="center" minHeight="400px">
        <CircularProgress />
      </Box>
    );
  }

  return (
    <Box>
      <Box sx={{ mb: 3, display: 'flex', alignItems: 'center', gap: 2 }}>
        <Button
          variant="outlined"
          onClick={() => navigate('/school-dashboard/term-billing-setup')}
          sx={{ mb: 0 }}
        >
          ← Back to Services
        </Button>
        <Alert severity="info" sx={{ flex: 1 }}>
          {serviceName ? (
            <>Setting up term billing for <strong>{serviceName}</strong> (ID: {serviceId})</>
          ) : (
            <>Setting up term billing for Service ID: <strong>{serviceId}</strong></>
          )}
        </Alert>
      </Box>

      {error && (
        <Alert severity="error" sx={{ mb: 3 }} onClose={() => setError(null)}>
          {error}
        </Alert>
      )}

      {success && (
        <Alert severity="success" sx={{ mb: 3 }} onClose={() => setSuccess(null)}>
          {success}
        </Alert>
      )}

      <Card sx={{ mb: 3 }}>
        <CardContent>
          <Typography variant="h6" gutterBottom sx={{ mb: 2, display: 'flex', alignItems: 'center', gap: 1 }}>
            <CalendarDaysIcon className="h-5 w-5" /> Term Information
          </Typography>
          
          <Grid container spacing={3}>
            <Grid item xs={12} md={6}>
              <TextField
                fullWidth
                label="Term Name"
                value={termName}
                onChange={(e) => setTermName(e.target.value)}
                placeholder="e.g., Fall 2025"
                required
                disabled={isEditing}
              />
            </Grid>
            
            <Grid item xs={12} md={6}>
              <TextField
                fullWidth
                label="Rate per Lesson"
                type="number"
                value={ratePerLesson}
                onChange={(e) => setRatePerLesson(e.target.value)}
                placeholder="25.00"
                required
                InputProps={{
                  startAdornment: <Typography sx={{ mr: 1 }}>$</Typography>,
                }}
              />
            </Grid>
            
            <Grid item xs={12} md={6}>
              <TextField
                fullWidth
                label="Term Discount % (Optional)"
                type="number"
                value={termDiscountPercent}
                onChange={(e) => setTermDiscountPercent(e.target.value)}
                placeholder="10"
                helperText="Discount for full-term upfront payment"
                inputProps={{ min: 0, max: 100, step: 0.1 }}
              />
            </Grid>
            
            <Grid item xs={12} md={6}>
              <TextField
                fullWidth
                label="Family Discount % (Optional)"
                type="number"
                value={familyDiscountPercent}
                onChange={(e) => setFamilyDiscountPercent(e.target.value)}
                placeholder="5"
                helperText="Discount when multiple children enrolled"
                inputProps={{ min: 0, max: 100, step: 0.1 }}
              />
            </Grid>
          </Grid>
        </CardContent>
      </Card>

      <Card sx={{ mb: 3 }}>
        <CardContent>
          <Typography variant="h6" gutterBottom sx={{ mb: 2, display: 'flex', alignItems: 'center', gap: 1 }}>
            <CalendarDaysIcon className="h-5 w-5" /> Class Dates
          </Typography>
          
          <Typography variant="body2" color="text.secondary" sx={{ mb: 2 }}>
            Select each specific class date. Skip holidays and breaks - only select dates when classes actually occur.
          </Typography>
          
          <LessonDatesCalendar
            selectedDates={classDates}
            onChange={handleDatesChange}
            label="Add Lesson Dates"
          />
          
          {/* Display selected dates summary */}
          {classDates.length > 0 && (
            <Box sx={{ mt: 2 }}>
              <Typography variant="body2" color="text.secondary" sx={{ mb: 1 }}>
                <strong>{classDates.length}</strong> class date{classDates.length !== 1 ? 's' : ''} selected:
              </Typography>
              <Box sx={{ display: 'flex', flexWrap: 'wrap', gap: 1 }}>
                {[...classDates].sort().map((dateStr) => (
                  <Chip
                    key={dateStr}
                    label={formatDate(dateStr)}
                    size="small"
                    color="primary"
                    variant="outlined"
                  />
                ))}
              </Box>
            </Box>
          )}
          
          {/* Old date picker code removed - replaced with LessonDatesCalendar above */}
          {/* <Box sx={{ mb: 2, display: 'flex', gap: 2, alignItems: 'flex-start' }}>
            <LocalizationProvider dateAdapter={AdapterDateFns}>
              <DatePicker
                label="Select Class Date"
                value={selectedDate}
                onChange={setSelectedDate}
                slotProps={{
                  textField: {
                    sx: { flex: 1 },
                  },
                }}
              />
            </LocalizationProvider>
            <Button
              variant="contained"
              startIcon={<AddIcon />}
              onClick={handleAddDate}
              disabled={!selectedDate}
            >
              Add Date
            </Button>
          </Box>
          
          {classDates.length > 0 && (
            <TableContainer component={Paper} variant="outlined">
              <Table size="small">
                <TableHead>
                  <TableRow>
                    <TableCell>Date</TableCell>
                    <TableCell align="right">Actions</TableCell>
                  </TableRow>
                </TableHead>
                <TableBody>
                  {classDates.map((dateStr) => (
                    <TableRow key={dateStr}>
                      <TableCell>{formatDate(dateStr)}</TableCell>
                      <TableCell align="right">
                        <IconButton
                          size="small"
                          color="error"
                          onClick={() => handleRemoveDate(dateStr)}
                        >
                          <DeleteIcon fontSize="small" />
                        </IconButton>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </TableContainer>
          )}
          
          */}
        </CardContent>
      </Card>

      {classDates.length > 0 && ratePerLesson && (
        <Card sx={{ mb: 3 }}>
          <CardContent>
            <Typography variant="h6" gutterBottom>
              Quick Summary
            </Typography>
            <Grid container spacing={2}>
              <Grid item xs={6} md={3}>
                <Typography variant="body2" color="text.secondary">
                  Total Lessons
                </Typography>
                <Typography variant="h6">{classDates.length}</Typography>
              </Grid>
              <Grid item xs={6} md={3}>
                <Typography variant="body2" color="text.secondary">
                  Term Total
                </Typography>
                <Typography variant="h6">
                  {formatCurrency(classDates.length * parseFloat(ratePerLesson || 0))}
                </Typography>
              </Grid>
              {termDiscountPercent && (
                <Grid item xs={6} md={3}>
                  <Typography variant="body2" color="text.secondary">
                    With {termDiscountPercent}% Discount
                  </Typography>
                  <Typography variant="h6" color="success.main">
                    {formatCurrency(
                      (classDates.length * parseFloat(ratePerLesson || 0)) *
                      (1 - parseFloat(termDiscountPercent) / 100)
                    )}
                  </Typography>
                </Grid>
              )}
            </Grid>
          </CardContent>
        </Card>
      )}

      <Box sx={{ display: 'flex', gap: 2, justifyContent: 'flex-end' }}>
        <Button
          variant="outlined"
          startIcon={<EyeIcon className="h-5 w-5" />}
          onClick={handlePreview}
          disabled={!ratePerLesson || classDates.length === 0 || loading}
        >
          Preview
        </Button>
        
        {!isEditing && (
          <Button
            variant="contained"
            startIcon={<CheckCircleIcon className="h-5 w-5" />}
            onClick={handleSave}
            disabled={!serviceId || !termName || !ratePerLesson || classDates.length === 0 || saving}
          >
            {saving ? <CircularProgress size={20} /> : 'Create Configuration'}
          </Button>
        )}
        
        {isEditing && (
          <Alert severity="success" sx={{ flex: 1 }}>
            Configuration already exists for this service. You can update it by modifying the dates above.
          </Alert>
        )}
      </Box>

      {/* Preview Dialog */}
      <Dialog
        open={previewDialogOpen}
        onClose={() => setPreviewDialogOpen(false)}
        maxWidth="md"
        fullWidth
      >
        <DialogTitle>Billing Preview</DialogTitle>
        <DialogContent>
          {preview && (
            <Box>
              <Typography variant="h6" gutterBottom>
                Term Totals
              </Typography>
              <Grid container spacing={2} sx={{ mb: 3 }}>
                <Grid item xs={4}>
                  <Typography variant="body2" color="text.secondary">
                    Total Lessons
                  </Typography>
                  <Typography variant="h6">{preview.totals.totalLessons}</Typography>
                </Grid>
                <Grid item xs={4}>
                  <Typography variant="body2" color="text.secondary">
                    Term Total
                  </Typography>
                  <Typography variant="h6">
                    {formatCurrency(preview.totals.termTotal)}
                  </Typography>
                </Grid>
                {preview.totals.discountedTermTotal && (
                  <Grid item xs={4}>
                    <Typography variant="body2" color="text.secondary">
                      With Discount
                    </Typography>
                    <Typography variant="h6" color="success.main">
                      {formatCurrency(preview.totals.discountedTermTotal)}
                    </Typography>
                  </Grid>
                )}
              </Grid>
              
              <Divider sx={{ my: 2 }} />
              
              <Typography variant="h6" gutterBottom>
                Monthly Distribution
              </Typography>
              <TableContainer>
                <Table size="small">
                  <TableHead>
                    <TableRow>
                      <TableCell>Month</TableCell>
                      <TableCell align="right">Lessons</TableCell>
                      <TableCell align="right">Amount</TableCell>
                    </TableRow>
                  </TableHead>
                  <TableBody>
                    {Object.entries(preview.monthlyDistribution)
                      .sort(([a], [b]) => a.localeCompare(b))
                      .map(([month, count]) => (
                        <TableRow key={month}>
                          <TableCell>
                            {new Date(month + '-01').toLocaleDateString('en-US', {
                              month: 'long',
                              year: 'numeric',
                            })}
                          </TableCell>
                          <TableCell align="right">{count}</TableCell>
                          <TableCell align="right">
                            {formatCurrency(count * parseFloat(ratePerLesson || 0))}
                          </TableCell>
                        </TableRow>
                      ))}
                  </TableBody>
                </Table>
              </TableContainer>
              
              {preview.finalClassDate && (
                <Box sx={{ mt: 2 }}>
                  <Typography variant="body2" color="text.secondary">
                    Final Class Date: {formatDate(preview.finalClassDate)}
                  </Typography>
                </Box>
              )}
            </Box>
          )}
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setPreviewDialogOpen(false)}>Close</Button>
        </DialogActions>
      </Dialog>
    </Box>
  );
}



