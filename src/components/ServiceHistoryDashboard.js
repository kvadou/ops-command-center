import React, { useState, useEffect } from "react";
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
  Typography,
  Card,
  CardContent,
  Chip,
  Box,
  IconButton,
  Tooltip,
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions,
  CircularProgress,
  Snackbar,
  Alert,
} from "@mui/material";
import { ArchiveBoxArrowDownIcon, ArrowLeftIcon } from '@heroicons/react/24/outline';
import {
  DataGrid,
  GridToolbarContainer,
  GridToolbarColumnsButton,
  GridToolbarFilterButton,
  GridToolbarDensitySelector,
  GridToolbarExport,
  GridToolbarQuickFilter,
} from "@mui/x-data-grid";
// Removed MUI X Date Pickers due to dependency issues
import axios from "axios";
import {
  ArrowTrendingUpIcon,
  UsersIcon,
  CurrencyDollarIcon,
  CalendarIcon,
} from "@heroicons/react/24/outline";
import { useNavigate } from "react-router-dom";

// Helper function to get axios instance (auth via httpOnly cookie)
const getAuthenticatedAxios = () => {
  return axios.create();
};

function CustomToolbar() {
  return (
    <GridToolbarContainer sx={{ 
      px: 1, 
      py: 0.5,
      gap: 0.5,
      flexWrap: 'wrap',
      minHeight: '40px',
      alignItems: 'center',
      '& .MuiButton-root': {
        minWidth: 'auto',
        padding: '4px 8px',
        fontSize: '0.75rem',
        textTransform: 'none',
      }
    }}>
      <Box sx={{ display: 'flex', gap: 0.25, alignItems: 'center' }}>
        <Tooltip title="Columns" arrow placement="top">
          <span>
            <GridToolbarColumnsButton 
              sx={{ 
                '& .MuiButton-text': { 
                  padding: '4px 8px',
                  minWidth: 'auto',
                  '& > span:not(.MuiButton-startIcon)': { display: 'none' }
                }
              }}
            />
          </span>
        </Tooltip>
        <Tooltip title="Filters" arrow placement="top">
          <span>
            <GridToolbarFilterButton 
              sx={{ 
                '& .MuiButton-text': { 
                  padding: '4px 8px',
                  minWidth: 'auto',
                  '& > span:not(.MuiButton-startIcon)': { display: 'none' }
                }
              }}
            />
          </span>
        </Tooltip>
        <Tooltip title="Density" arrow placement="top">
          <span>
            <GridToolbarDensitySelector 
              sx={{ 
                '& .MuiButton-text': { 
                  padding: '4px 8px',
                  minWidth: 'auto',
                  '& > span:not(.MuiButton-startIcon)': { display: 'none' }
                }
              }}
            />
          </span>
        </Tooltip>
        <Tooltip title="Export" arrow placement="top">
          <span>
            <GridToolbarExport 
              sx={{ 
                '& .MuiButton-text': { 
                  padding: '4px 8px',
                  minWidth: 'auto',
                  '& > span:not(.MuiButton-startIcon)': { display: 'none' }
                }
              }}
            />
          </span>
        </Tooltip>
      </Box>

      <Box sx={{ flex: 1, minWidth: 8 }} />

      {/* Compact search */}
      <Box sx={{ 
        display: 'flex', 
        alignItems: 'center', 
        bgcolor: 'action.hover',
        borderRadius: 1,
        px: 1,
        py: 0.5,
        minWidth: 200,
        maxWidth: 300,
        flex: '0 1 auto',
        height: '36px',
        overflow: 'visible'
      }}>
        <GridToolbarQuickFilter 
          quickFilterParser={(val) => val.split(/\s+/).filter(Boolean)}
          sx={{
            width: '100%',
            '& .MuiInputBase-input': {
              fontSize: '0.875rem',
              py: 0.75,
              px: 1,
              height: 'auto',
              '&::placeholder': {
                fontSize: '0.75rem',
                opacity: 0.6
              }
            },
            '& .MuiInputBase-root': {
              border: 'none',
              bgcolor: 'transparent',
              height: 'auto',
              minHeight: 'auto',
              '&:before': { display: 'none' },
              '&:after': { display: 'none' },
              '&:hover': { border: 'none', bgcolor: 'transparent' },
              '& .MuiInputAdornment-root': {
                marginLeft: 0,
                marginRight: 0.5,
              }
            }
          }}
        />
      </Box>
    </GridToolbarContainer>
  );
}

export default function ServiceHistoryDashboard() {
  const navigate = useNavigate();
  const [serviceHistory, setServiceHistory] = useState([]);
  const [filteredHistory, setFilteredHistory] = useState([]);
  const [loading, setLoading] = useState(false);
  const [dateRange, setDateRange] = useState({
    start: null,
    end: null,
  });
  const [serviceFilter, setServiceFilter] = useState("");
  const [locationFilter, setLocationFilter] = useState("");
  const [typeFilter, setTypeFilter] = useState("");
  const [statusFilter, setStatusFilter] = useState("");
  const [studentDetailsOpen, setStudentDetailsOpen] = useState(false);
  const [selectedService, setSelectedService] = useState(null);
  const [studentDetails, setStudentDetails] = useState([]);
  const [loadingStudents, setLoadingStudents] = useState(false);
  const [snackbar, setSnackbar] = useState({ open: false, message: '', severity: 'success' });

  // Column width persistence
  const [columnWidthModel, setColumnWidthModel] = useState(() => {
    try {
      const stored = localStorage.getItem('service-history-column-widths');
      return stored ? JSON.parse(stored) : {};
    } catch (error) {
      console.error('Error loading column widths:', error);
      return {};
    }
  });

  // Summary statistics
  const [summaryStats, setSummaryStats] = useState({
    totalRevenue: 0,
    totalStudents: 0,
    totalServices: 0,
    averageRevenuePerService: 0,
  });

  useEffect(() => {
    fetchServiceHistory();
  }, []);

  useEffect(() => {
    applyFilters();
  }, [serviceHistory, dateRange, serviceFilter, locationFilter, typeFilter, statusFilter]);

  const fetchServiceHistory = async () => {
    setLoading(true);
    try {
      const authAxios = getAuthenticatedAxios();
      // Fetch both historical appointment data and archived services
      const [historyResponse, archivedResponse] = await Promise.all([
        authAxios.get("/api/services/history"),
        authAxios.get("/api/services/archived").catch(() => ({ data: [] })) // Gracefully handle if endpoint doesn't exist yet
      ]);
      
      // Combine historical data with archived services
      const archivedServices = (archivedResponse.data || []).map(service => ({
        ...service,
        serviceName: service.name,
        totalAppointments: 0,
        totalStudents: 0,
        totalRevenue: 0,
        firstAppointment: null,
        lastAppointment: service.archivedAt,
        date: service.archivedAt,
        status: 'archived',
        isArchived: true
      }));
      
      const combinedHistory = [...historyResponse.data, ...archivedServices];
      setServiceHistory(combinedHistory);
      calculateSummaryStats(combinedHistory);
    } catch (error) {
      console.error("Error fetching service history:", error);
    } finally {
      setLoading(false);
    }
  };

  const fetchStudentDetails = async (serviceId) => {
    setLoadingStudents(true);
    try {
      const authAxios = getAuthenticatedAxios();
      const response = await authAxios.get(`/api/services/${serviceId}/students`);
      setStudentDetails(response.data.students || []);
    } catch (error) {
      console.error("Error fetching student details:", error);
      setStudentDetails([]);
    } finally {
      setLoadingStudents(false);
    }
  };

  const handleStudentCountClick = (service) => {
    setSelectedService(service);
    setStudentDetailsOpen(true);
    fetchStudentDetails(service.serviceId);
  };

  const handleUnarchive = async (service) => {
    try {
      const authAxios = getAuthenticatedAxios();
      const response = await authAxios.post(`/api/services/${service.serviceId}/unarchive`);
      
      setSnackbar({
        open: true,
        message: `Service "${response.data.serviceName}" has been unarchived successfully`,
        severity: 'success'
      });
      
      // Refresh service history after unarchiving
      await fetchServiceHistory();
    } catch (error) {
      console.error('Error unarchiving service:', error);
      setSnackbar({
        open: true,
        message: error.response?.data?.error || 'Failed to unarchive service',
        severity: 'error'
      });
    }
  };

  const calculateSummaryStats = (data) => {
    const totalRevenue = data.reduce((sum, item) => sum + (item.revenue || 0), 0);
    const totalStudents = data.reduce((sum, item) => sum + (item.studentCount || 0), 0);
    const totalServices = new Set(data.map(item => item.serviceId)).size;
    const averageRevenuePerService = totalServices > 0 ? totalRevenue / totalServices : 0;

    setSummaryStats({
      totalRevenue,
      totalStudents,
      totalServices,
      averageRevenuePerService,
    });
  };

  const applyFilters = () => {
    let filtered = [...serviceHistory];

    // Date range filter
    if (dateRange.start && dateRange.end) {
      filtered = filtered.filter(item => {
        const itemDate = new Date(item.date);
        return itemDate >= dateRange.start && itemDate <= dateRange.end;
      });
    }

    // Service filter
    if (serviceFilter) {
      filtered = filtered.filter(item => 
        item.serviceName?.toLowerCase().includes(serviceFilter.toLowerCase()) ||
        item.serviceId?.toLowerCase().includes(serviceFilter.toLowerCase())
      );
    }

    // Location filter
    if (locationFilter) {
      filtered = filtered.filter(item => item.location === locationFilter);
    }

    // Type filter
    if (typeFilter) {
      filtered = filtered.filter(item => item.type === typeFilter);
    }

    // Status filter
    if (statusFilter) {
      filtered = filtered.filter(item => item.status === statusFilter);
    }

    setFilteredHistory(filtered);
    calculateSummaryStats(filtered);
  };

  // Handle column width change
  const handleColumnWidthChange = (params) => {
    const newWidths = {
      ...columnWidthModel,
      [params.colDef.field]: params.width,
    };
    setColumnWidthModel(newWidths);
    try {
      localStorage.setItem('service-history-column-widths', JSON.stringify(newWidths));
    } catch (error) {
      console.error('Error saving column widths:', error);
    }
  };

  const columns = [
    {
      field: "serviceId",
      headerName: "Service ID",
      width: 100,
      renderCell: (params) => (
        <Typography 
          variant="body2" 
          sx={{ 
            fontFamily: 'monospace',
            fontSize: '0.75rem',
            color: 'primary.main',
            cursor: 'pointer',
            textDecoration: 'underline',
            '&:hover': { color: 'primary.dark' },
            textAlign: 'left'
          }}
          onClick={() => window.open(`https://account.acmeops.com/cal/service/${params.value}/`, '_blank')}
        >
          {params.value}
        </Typography>
      ),
    },
    {
      field: "serviceName",
      headerName: "Service Name",
      flex: 2,
      minWidth: 180,
      renderCell: (params) => (
        <Typography variant="body2" sx={{ textAlign: 'left' }}>
          {params.value}
        </Typography>
      ),
    },
    {
      field: "location",
      headerName: "Location",
      width: 120,
      renderCell: (params) => (
        <Typography variant="body2" sx={{ textAlign: 'left' }}>
          {params.value}
        </Typography>
      ),
    },
    {
      field: "type",
      headerName: "Type",
      width: 100,
      renderCell: (params) => (
        <Chip
          label={params.value}
          size="small"
          color={params.value === "Event" ? "primary" : "default"}
          sx={{ height: '24px', fontSize: '0.75rem' }}
        />
      ),
    },
    {
      field: "studentCount",
      headerName: "Students",
      width: 90,
      type: "number",
      headerAlign: 'left',
      align: 'left',
      renderCell: (params) => (
        <Typography 
          variant="body2" 
          sx={{ 
            fontWeight: 600,
            color: 'primary.main',
            cursor: 'pointer',
            '&:hover': { color: 'primary.dark' }
          }}
          onClick={() => handleStudentCountClick(params.row)}
        >
          {params.value}
        </Typography>
      ),
    },
    {
      field: "revenue",
      headerName: "Revenue",
      width: 110,
      type: "number",
      headerAlign: 'left',
      align: 'left',
      renderCell: (params) => (
        <Typography variant="body2" sx={{ fontWeight: 600, color: 'success.main' }}>
          ${params.value?.toFixed(2) || "0.00"}
        </Typography>
      ),
    },
    {
      field: "date",
      headerName: "Date",
      width: 100,
      renderCell: (params) => (
        <Typography variant="body2">
          {new Date(params.value).toLocaleDateString()}
        </Typography>
      ),
    },
    {
      field: "status",
      headerName: "Status",
      width: 100,
      renderCell: (params) => (
        <Chip
          label={params.value}
          size="small"
          color={params.value === "complete" ? "success" : "default"}
          sx={{ height: '24px', fontSize: '0.75rem' }}
        />
      ),
    },
    {
      field: "clientDetails",
      headerName: "Client",
      flex: 1,
      minWidth: 150,
      renderCell: (params) => (
        <Typography variant="body2" sx={{ fontWeight: 500 }}>
          {params.row.clientName || 'N/A'}
        </Typography>
      ),
    },
    {
      field: "actions",
      headerName: "Actions",
      width: 120,
      sortable: false,
      renderCell: (params) => {
        const isArchived = params.row.status === 'archived' || params.row.isArchived;
        if (!isArchived) {
          return null;
        }
        return (
          <Tooltip title="Unarchive Service" arrow>
            <IconButton
              size="small"
              onClick={() => handleUnarchive(params.row)}
              sx={{ 
                color: 'primary.main',
                '&:hover': { 
                  backgroundColor: 'primary.light',
                  color: 'primary.dark'
                }
              }}
            >
              <ArchiveBoxArrowDownIcon className="h-5 w-5" />
            </IconButton>
          </Tooltip>
        );
      },
    },
  ];

  const StatCard = ({ title, value, icon: Icon, color = "primary" }) => {
    const colorMap = {
      green: { bg: "#e8f5e9", icon: "#4caf50" },
      blue: { bg: "#e3f2fd", icon: "#2196f3" },
      purple: { bg: "#f3e5f5", icon: "#9c27b0" },
      orange: { bg: "#fff3e0", icon: "#ff9800" },
    };
    const colors = colorMap[color] || colorMap.blue;
    
    return (
      <Card sx={{ height: '100%' }}>
        <CardContent sx={{ p: 2, '&:last-child': { pb: 2 } }}>
          <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
            <Box>
              <Typography variant="h6" sx={{ fontWeight: 600, color: 'text.primary', mb: 0.5 }}>
                {value}
              </Typography>
              <Typography variant="body2" sx={{ color: 'text.secondary' }}>
                {title}
              </Typography>
            </Box>
            <Box sx={{ 
              p: 1.5, 
              borderRadius: '50%', 
              bgcolor: colors.bg,
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center'
            }}>
              <Icon style={{ height: 24, width: 24, color: colors.icon }} />
            </Box>
          </Box>
        </CardContent>
      </Card>
    );
  };

  return (
    <Box sx={{ p: 1.5 }}>
      <Box sx={{ mb: 1.5 }}>
        <Typography variant="h4" sx={{ fontWeight: 600, mb: 1, color: 'text.primary' }}>
          Service History Dashboard
        </Typography>
        <Typography variant="body1" sx={{ color: 'text.secondary', mb: 1 }}>
          Historical performance data for all services, events, and programs
        </Typography>
        <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
          <Button
            variant="outlined"
            size="small"
            startIcon={<ArrowLeftIcon className="h-5 w-5" />}
            onClick={() => navigate('/manage-services')}
            sx={{ textTransform: 'none' }}
          >
            Back to Service Catalog
          </Button>
        </Box>
      </Box>

      {/* Summary Statistics */}
      <Grid container spacing={1.5} sx={{ mb: 1.5 }}>
        <Grid item xs={12} sm={6} md={3}>
          <StatCard
            title="Total Revenue"
            value={`$${summaryStats.totalRevenue.toLocaleString()}`}
            icon={CurrencyDollarIcon}
            color="green"
          />
        </Grid>
        <Grid item xs={12} sm={6} md={3}>
          <StatCard
            title="Total Students"
            value={summaryStats.totalStudents.toLocaleString()}
            icon={UsersIcon}
            color="blue"
          />
        </Grid>
        <Grid item xs={12} sm={6} md={3}>
          <StatCard
            title="Unique Services"
            value={summaryStats.totalServices.toLocaleString()}
            icon={ArrowTrendingUpIcon}
            color="purple"
          />
        </Grid>
        <Grid item xs={12} sm={6} md={3}>
          <StatCard
            title="Avg Revenue/Service"
            value={`$${summaryStats.averageRevenuePerService.toFixed(2)}`}
            icon={CalendarIcon}
            color="orange"
          />
        </Grid>
      </Grid>

      {/* Filters */}
      <Card sx={{ mb: 1.5 }}>
        <CardContent sx={{ p: 1.5, '&:last-child': { pb: 1.5 } }}>
          <Typography variant="subtitle2" sx={{ mb: 1.5, fontWeight: 600, color: 'text.secondary' }}>
            FILTERS
          </Typography>
          <Grid container spacing={1.5}>
            <Grid item xs={12} sm={6} md={3}>
              <TextField
                label="Start Date"
                type="date"
                value={dateRange.start ? dateRange.start.toISOString().split('T')[0] : ''}
                onChange={(e) => setDateRange(prev => ({ ...prev, start: e.target.value ? new Date(e.target.value) : null }))}
                fullWidth
                size="small"
                InputLabelProps={{ shrink: true }}
              />
            </Grid>
            <Grid item xs={12} sm={6} md={3}>
              <TextField
                label="End Date"
                type="date"
                value={dateRange.end ? dateRange.end.toISOString().split('T')[0] : ''}
                onChange={(e) => setDateRange(prev => ({ ...prev, end: e.target.value ? new Date(e.target.value) : null }))}
                fullWidth
                size="small"
                InputLabelProps={{ shrink: true }}
              />
            </Grid>
            <Grid item xs={12} sm={6} md={3}>
              <FormControl fullWidth size="small">
                <InputLabel>Service</InputLabel>
                <Select
                  value={serviceFilter}
                  onChange={(e) => setServiceFilter(e.target.value)}
                  label="Service"
                >
                  <MenuItem value="">
                    <em>All Services</em>
                  </MenuItem>
                  {[...new Set(serviceHistory.map(item => item.serviceName))].map(service => (
                    <MenuItem key={service} value={service}>
                      {service}
                    </MenuItem>
                  ))}
                </Select>
              </FormControl>
            </Grid>
            <Grid item xs={12} sm={6} md={3}>
              <FormControl fullWidth size="small">
                <InputLabel>Location</InputLabel>
                <Select
                  value={locationFilter}
                  onChange={(e) => setLocationFilter(e.target.value)}
                  label="Location"
                >
                  <MenuItem value="">
                    <em>All Locations</em>
                  </MenuItem>
                  {[...new Set(serviceHistory.map(item => item.location))].map(location => (
                    <MenuItem key={location} value={location}>
                      {location}
                    </MenuItem>
                  ))}
                </Select>
              </FormControl>
            </Grid>
            <Grid item xs={12} sm={6} md={3}>
              <FormControl fullWidth size="small">
                <InputLabel>Type</InputLabel>
                <Select
                  value={typeFilter}
                  onChange={(e) => setTypeFilter(e.target.value)}
                  label="Type"
                >
                  <MenuItem value="">
                    <em>All Types</em>
                  </MenuItem>
                  {[...new Set(serviceHistory.map(item => item.type))].map(type => (
                    <MenuItem key={type} value={type}>
                      {type}
                    </MenuItem>
                  ))}
                </Select>
              </FormControl>
            </Grid>
            <Grid item xs={12} sm={6} md={3}>
              <FormControl fullWidth size="small">
                <InputLabel>Status</InputLabel>
                <Select
                  value={statusFilter}
                  onChange={(e) => setStatusFilter(e.target.value)}
                  label="Status"
                >
                  <MenuItem value="">
                    <em>All Statuses</em>
                  </MenuItem>
                  <MenuItem value="complete">Complete</MenuItem>
                  <MenuItem value="pending">Pending</MenuItem>
                  <MenuItem value="cancelled">Cancelled</MenuItem>
                </Select>
              </FormControl>
            </Grid>
          </Grid>
        </CardContent>
      </Card>

      {/* Data Grid */}
      <Card>
        <CardContent sx={{ p: 0.5, '&:last-child': { pb: 0.5 } }}>
          <Box sx={{ width: '100%', position: 'relative' }}>
            <DataGrid
              rows={filteredHistory}
              columns={columns.map(col => ({
                ...col,
                width: columnWidthModel[col.field] || col.width || col.minWidth || 150,
                resizable: col.resizable !== false,
              }))}
              initialState={{
                pagination: {
                  paginationModel: { pageSize: 25, page: 0 },
                },
              }}
              pageSizeOptions={[25, 50, 100]}
              density="standard"
              slots={{ toolbar: CustomToolbar }}
              loading={loading}
              disableRowSelectionOnClick
              columnWidthModel={Object.keys(columnWidthModel).length > 0 ? columnWidthModel : undefined}
              onColumnWidthChange={handleColumnWidthChange}
              getRowId={(row) => `${row.serviceId}-${row.date}-${row.clientId}`}
              autoHeight
              sx={{
                '& .MuiDataGrid-columnHeader': {
                  paddingLeft: '8px',
                  paddingRight: '8px',
                  paddingTop: '6px',
                  paddingBottom: '6px',
                },
                '& .MuiDataGrid-cell': {
                  paddingLeft: '8px',
                  paddingRight: '8px',
                  paddingTop: '6px !important',
                  paddingBottom: '6px !important',
                  display: 'flex !important',
                  alignItems: 'center !important',
                  justifyContent: 'flex-start',
                },
                '& .MuiDataGrid-columnSeparator': { 
                  display: 'flex !important',
                  cursor: 'col-resize',
                  '&:hover': {
                    backgroundColor: 'action.hover',
                  },
                  '& .MuiDataGrid-iconSeparator': {
                    color: 'text.secondary',
                    '&:hover': {
                      color: 'primary.main',
                    },
                  },
                },
                '& .MuiDataGrid-columnHeaders': { 
                  borderBottom: '1px solid #e5e7eb',
                  minHeight: '40px !important',
                  '& .MuiDataGrid-columnHeader': {
                    minHeight: '40px !important'
                  }
                },
                '& .MuiDataGrid-row': {
                  minHeight: '44px !important',
                  maxHeight: '44px !important',
                  '&:hover': {
                    backgroundColor: 'action.hover',
                  },
                  '&:not(:last-child) .MuiDataGrid-cell': {
                    borderBottom: '1px solid #e8e8e8',
                  },
                },
                // Compact toolbar styling
                '& .MuiDataGrid-toolbarContainer': {
                  minHeight: '36px',
                  padding: '4px 8px',
                },
                '& .MuiDataGrid-toolbarContainer .MuiButton-root': {
                  minWidth: 'auto',
                  padding: '4px 8px',
                  fontSize: '0.75rem',
                  textTransform: 'none',
                },
              }}
            />
          </Box>
        </CardContent>
      </Card>

      {/* Student Details Dialog */}
      <Dialog 
        open={studentDetailsOpen} 
        onClose={() => setStudentDetailsOpen(false)}
        maxWidth="md"
        fullWidth
      >
        <DialogTitle sx={{ pb: 1.5 }}>
          Student Details - {selectedService?.serviceName}
        </DialogTitle>
        <DialogContent sx={{ pt: 1.5 }}>
          {loadingStudents ? (
            <Box display="flex" justifyContent="center" p={3}>
              <CircularProgress />
            </Box>
          ) : (
            <Box>
              <Typography variant="h6" gutterBottom sx={{ mb: 1 }}>
                Service: {selectedService?.serviceName}
              </Typography>
              <Typography variant="body2" color="text.secondary" gutterBottom sx={{ mb: 2 }}>
                Total Students: {studentDetails.length} | Total Revenue: ${selectedService?.revenue?.toFixed(2) || '0.00'}
              </Typography>
              
              <TableContainer component={Paper}>
                <Table>
                  <TableHead>
                    <TableRow>
                      <TableCell sx={{ fontWeight: 600 }}>Student Name</TableCell>
                      <TableCell sx={{ fontWeight: 600 }}>Lessons Attended</TableCell>
                      <TableCell align="right" sx={{ fontWeight: 600 }}>Revenue</TableCell>
                    </TableRow>
                  </TableHead>
                  <TableBody>
                    {studentDetails.map((student, index) => (
                      <TableRow key={index} sx={{ '&:hover': { bgcolor: 'action.hover' } }}>
                        <TableCell>{student.student_name || 'N/A'}</TableCell>
                        <TableCell>
                          <Typography variant="body2" sx={{ fontWeight: 500, color: 'primary.main' }}>
                            {student.lessons_attended || 1}
                          </Typography>
                        </TableCell>
                        <TableCell align="right">
                          <Typography variant="body2" sx={{ fontWeight: 600, color: 'success.main' }}>
                            ${student.revenue?.toFixed(2) || '0.00'}
                          </Typography>
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </TableContainer>
            </Box>
          )}
        </DialogContent>
        <DialogActions sx={{ p: 2, pt: 1 }}>
          <Button onClick={() => setStudentDetailsOpen(false)} color="primary" variant="contained">
            Close
          </Button>
        </DialogActions>
      </Dialog>

      {/* Snackbar for notifications */}
      <Snackbar
        open={snackbar.open}
        autoHideDuration={6000}
        onClose={() => setSnackbar({ ...snackbar, open: false })}
        anchorOrigin={{ vertical: 'bottom', horizontal: 'right' }}
      >
        <Alert 
          onClose={() => setSnackbar({ ...snackbar, open: false })} 
          severity={snackbar.severity}
          sx={{ width: '100%' }}
        >
          {snackbar.message}
        </Alert>
      </Snackbar>
    </Box>
  );
}
