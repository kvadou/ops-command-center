import React, { useEffect, useState, useRef } from "react";
import { useToast } from '../hooks/useToast';
import { Link as RouterLink } from "react-router-dom";
import {
  Box,
  Typography,
  Grid,
  Paper,
  Divider,
  List,
  ListItem,
  ListItemText,
  Chip,
  Button,
  Dialog,
  DialogTitle,
  Link,
  Tab,
  Tabs,
  DialogContent,
  DialogActions,
  useMediaQuery,
  useTheme,
  Card,
  CardContent,
  Menu,
  MenuItem,
  IconButton,
  TextField,
  InputAdornment,
  Tooltip,
  Select,
  FormControl,
  InputLabel,
  Checkbox,
  ListItemIcon,
  ListItemText as MuiListItemText,
} from "@mui/material";

import {
  CheckCircleIcon as CheckCircleOutlineIcon,
  XMarkIcon as CloseIcon,
  TrashIcon as DeleteIcon,
  ArrowUpIcon as ArrowUpwardIcon,
  ArrowDownIcon as ArrowDownwardIcon,
  ChevronLeftIcon,
  ChevronRightIcon,
  PlusIcon as AddIcon,
  Cog6ToothIcon as SettingsIcon,
  FunnelIcon as FilterListIcon,
  ListBulletIcon as FormatListBulletedIcon,
  MagnifyingGlassIcon as SearchIcon,
  CalendarIcon as EventIcon,
  EllipsisVerticalIcon as MoreVertIcon,
  ViewColumnsIcon as ViewColumnIcon,
  TableCellsIcon as TableChartIcon,
} from "@heroicons/react/24/outline";

import { DataGrid, GridToolbar } from "@mui/x-data-grid";
import { DateTime } from "luxon";

const safeParseJson = (v) => {
  if (!v) return {};
  if (typeof v === "object") return v;
  if (typeof v === "string") {
    try { return JSON.parse(v); } catch { return {}; }
  }
  return {};
};

const getLandingUrl = (d) =>
  d?.landing_url || d?.landingUrl || d?.attribution?.landing_url || "";

const getReferrer = (d) =>
  d?.referrer || d?.attribution?.referrer || "";



const utmKeyLabel = (k = "") =>
  k.replace(/^utm_/, "")
   .replace(/_/g, " ")
   .replace(/\b\w/g, (c) => c.toUpperCase());


const truncate = (val, n = 80) => {
  const s = typeof val === "string" ? val : String(val ?? "");
  return s.length > n ? s.slice(0, n - 1) + "…" : s;
};


const getUtmFromDetail = (d) => {
  const flat = safeParseJson(d?.utm);
  const nested = safeParseJson(d?.attribution?.utm);
  return Object.keys(flat).length ? flat : nested;
};


export default function FormSubmissions() {
  const toast = useToast();
  const theme = useTheme();
  const isMobile = useMediaQuery(theme.breakpoints.down('sm'));
  
  const [rows, setRows] = useState([]);
  const [detail, setDetail] = useState(null);
  const [deleteConfirmOpen, setDeleteConfirmOpen] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");
  const [columnMenuAnchor, setColumnMenuAnchor] = useState(null);
  const [selectedColumnField, setSelectedColumnField] = useState(null);
  const [columnsMenuAnchor, setColumnsMenuAnchor] = useState(null);
  const [breakdownMenuAnchor, setBreakdownMenuAnchor] = useState(null);
  const [moreMenuAnchor, setMoreMenuAnchor] = useState(null);
  const [loading, setLoading] = useState(false);
  const [rowCount, setRowCount] = useState(0);
  const [totalPages, setTotalPages] = useState(0);
  const pageSizeOptions = [25, 50, 100];
  const [paginationModel, setPaginationModel] = useState({
    page: 0,
    pageSize: 25,
  });
  
  // Column width persistence state
  const [columnWidthModel, setColumnWidthModel] = useState(() => {
    try {
      const saved = localStorage.getItem('columnConfig_/booking-forms/submissions');
      if (saved) {
        const parsed = JSON.parse(saved);
        return parsed.columnWidths || {};
      }
    } catch (error) {
      console.error('Error loading column widths:', error);
    }
    return {};
  });
  
  // Initialize tab from localStorage or default to "all"
  const [tab, setTab] = useState(() => {
    const savedTab = localStorage.getItem('formSubmissionsTab');
    // If saved tab is "analytics", redirect to default "all" since analytics tab is removed
    return savedTab && savedTab !== 'analytics' ? savedTab : 'all';
  });

  // Get current user from localStorage
  const getCurrentUser = () => {
    try {
      const userData = localStorage.getItem("user");
      if (userData && userData !== "undefined") {
        return JSON.parse(userData);
      }
    } catch (error) {
      console.error("Error parsing user data:", error);
    }
    return null;
  };

  const isAdmin = () => {
    const user = getCurrentUser();
    return user?.role === "admin";
  };

  // Save tab to localStorage whenever it changes
  useEffect(() => {
    localStorage.setItem('formSubmissionsTab', tab);
  }, [tab]);

  // Fetch submissions with pagination
  const fetchSubmissions = async (page = 0, pageSize = 25, paymentStatus = 'all') => {
    setLoading(true);
    try {
      const params = new URLSearchParams({
        page: String(page + 1), // Backend uses 1-based pagination
        limit: String(pageSize),
      });
      
      // Add filters based on tab
      if (paymentStatus === 'photo_release') {
        params.append('photo_release', 'true');
      } else if (paymentStatus && paymentStatus !== 'all') {
        params.append('payment_status', paymentStatus);
      }
      
      const response = await fetch(`/api/submissions?${params.toString()}`);
      const result = await response.json();
      
      // Handle both old format (array) and new format (paginated response)
      if (Array.isArray(result)) {
        const total = result.length;
        const totalPagesValue = Math.max(1, Math.ceil(total / pageSize));
        setRows(result);
        setRowCount(total);
        setTotalPages(totalPagesValue);
      } else if (result.data && result.pagination) {
        const total = typeof result.pagination.total === 'number'
          ? result.pagination.total
          : result.data.length;
        const totalPagesValue = result.pagination.totalPages
          ? Math.max(1, result.pagination.totalPages)
          : Math.max(1, Math.ceil(total / pageSize));
        setRows(result.data);
        setRowCount(total);
        setTotalPages(totalPagesValue);
      } else {
        console.error('Unexpected API response format:', result);
        setRows([]);
        setRowCount(0);
        setTotalPages(1);
      }
    } catch (err) {
      console.error('Failed to fetch submissions:', err);
      setRows([]);
      setRowCount(0);
      setTotalPages(1);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    setPaginationModel((prev) => {
      if (prev.page === 0) {
        return prev;
      }
      return { ...prev, page: 0 };
    });
  }, [tab]);

  useEffect(() => {
    fetchSubmissions(paginationModel.page, paginationModel.pageSize, tab);
  }, [paginationModel.page, paginationModel.pageSize, tab]);

  const handleDeleteSubmission = async () => {
    if (!detail?.id) return;
    
    setDeleting(true);
    try {
      const response = await fetch(`/api/submissions/${detail.id}`, {
        method: "DELETE",
        credentials: 'include',
        headers: {
          "Content-Type": "application/json",
        },
      });

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({ error: 'Failed to delete submission' }));
        throw new Error(errorData.error || 'Failed to delete submission');
      }

      // Refresh the submissions list after deletion
      fetchSubmissions(paginationModel.page, paginationModel.pageSize, tab);
      
      // Close both dialogs
      setDeleteConfirmOpen(false);
      setDetail(null);
    } catch (err) {
      console.error("Error deleting submission:", err);
      toast.error(`Failed to delete submission: ${err.message}`);
    } finally {
      setDeleting(false);
    }
  };

  const handleDeleteClick = () => {
    setDeleteConfirmOpen(true);
  };

  const handleCloseDeleteConfirm = () => {
    setDeleteConfirmOpen(false);
  };

  // Custom column header with menu (Facebook Ads Manager style)
  const renderColumnHeader = (params) => {
    const handleMenuOpen = (event, field) => {
      event.stopPropagation();
      setColumnMenuAnchor(event.currentTarget);
      setSelectedColumnField(field);
    };

    const handleMenuClose = () => {
      setColumnMenuAnchor(null);
      setSelectedColumnField(null);
    };

    const handleSortAsc = () => {
      // Sort logic would be handled by DataGrid
      handleMenuClose();
    };

    const handleSortDesc = () => {
      // Sort logic would be handled by DataGrid
      handleMenuClose();
    };

    return (
      <Box
        sx={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          width: '100%',
          height: '100%',
          padding: '0 8px',
          '&:hover .column-menu-button': {
            opacity: 1,
          },
        }}
      >
        <Typography
          variant="body2"
          sx={{
            fontWeight: 500,
            fontSize: '0.875rem',
            color: 'text.primary',
            flex: 1,
          }}
        >
          {params.colDef.headerName}
        </Typography>
        <IconButton
          size="small"
          className="column-menu-button"
          onClick={(e) => handleMenuOpen(e, params.field)}
          sx={{
            opacity: 0,
            transition: 'opacity 0.2s',
            padding: '4px',
            '&:hover': {
              backgroundColor: 'action.hover',
            },
          }}
        >
          <MoreVertIcon className="h-4 w-4" />
        </IconButton>
      </Box>
    );
  };

  const columns = [
    {
      field: "actions",
      headerName: "Actions",
      width: 85,
      disableColumnMenu: true,
      renderCell: ({ row }) => (
        <Button
          size="small"
          variant="outlined"
          sx={{ 
            fontSize: '0.75rem', 
            minWidth: '65px', 
            padding: '4px 8px',
            height: '28px'
          }}
          onClick={() => {
            fetch(`/api/submissions/${row.id}`)
              .then((r) => r.json())
              .then((data) => {
                setDetail(data);
              })
              .catch((error) => {
                console.error("Error fetching submission details:", error);
              });
          }}
        >
          VIEW
        </Button>
      ),
    },
    { 
      field: "id", 
      headerName: "ID", 
      width: 60,
      renderHeader: renderColumnHeader,
    },
    {
      field: "status",
      headerName: "Status",
      width: 100,
      renderHeader: renderColumnHeader,
      renderCell: (params) => {
        const status = params?.row?.status;
        return status === "draft" ? (
          <Chip
            size="small"
            label="Partial"
            variant="outlined"
            color="warning"
            sx={{ fontWeight: 500, fontSize: '0.75rem' }}
          />
        ) : (
          <Chip
            size="small"
            label="Complete"
            variant="outlined"
            color="success"
            sx={{ fontWeight: 500, fontSize: '0.75rem' }}
          />
        );
      },
    },
    {
      field: "createdAt",
      headerName: "Submitted At",
      width: 160,
      renderHeader: renderColumnHeader,
      renderCell: (params) => {
        const rawDate = params?.row?.createdAt;
        if (!rawDate) return "—";

        const dt = DateTime.fromISO(rawDate);
        if (!dt.isValid) return "—";

        // Format as "Monday 9/8/25"
        const dayOfWeek = dt.toFormat("cccc");
        const shortDate = dt.toFormat("M/d/yy");
        
        return `${dayOfWeek} ${shortDate}`;
      },
    },

    { 
      field: "bookingType", 
      headerName: "Booking Type", 
      width: 160,
      renderHeader: renderColumnHeader,
      renderCell: (params) => {
        const value = params.value || "—";
        return (
          <div title={value} style={{ 
            overflow: 'hidden', 
            textOverflow: 'ellipsis', 
            whiteSpace: 'nowrap',
            fontSize: '0.875rem'
          }}>
            {value}
          </div>
        );
      },
    },
    { 
      field: "parentFirst", 
      headerName: "First", 
      width: 110,
      renderHeader: renderColumnHeader,
      renderCell: (params) => (
        <div style={{ fontSize: '0.875rem' }}>{params.value || "—"}</div>
      ),
    },
    { 
      field: "parentLast", 
      headerName: "Last", 
      width: 105,
      renderHeader: renderColumnHeader,
      renderCell: (params) => (
        <div style={{ fontSize: '0.875rem' }}>{params.value || "—"}</div>
      ),
    },
    { 
      field: "parentEmail", 
      headerName: "Email", 
      width: 160,
      renderHeader: renderColumnHeader,
      renderCell: (params) => {
        const value = params.value || "—";
        return (
          <div title={value} style={{ 
            overflow: 'hidden', 
            textOverflow: 'ellipsis', 
            whiteSpace: 'nowrap',
            fontSize: '0.875rem'
          }}>
            {value}
          </div>
        );
      },
    },
    {
      field: "labelName",
      headerName: "Label",
      width: 105,
      renderHeader: renderColumnHeader,
      renderCell: (params) => {
        const value = params.value || "—";
        return (
          <div title={value} style={{ 
            fontSize: '0.875rem',
            overflow: 'hidden', 
            textOverflow: 'ellipsis', 
            whiteSpace: 'nowrap'
          }}>
            {value}
          </div>
        );
      },
    },
    {
      field: "payment_status",
      headerName: "Payment Status",
      width: 110,
      renderHeader: renderColumnHeader,
      renderCell: (params) => {
        const raw = params.row.payment_status;

        const status = typeof raw === "string" ? raw : "unknown";

        let color = "default";
        if (status === "paid") color = "success";
        if (status === "pending") color = "warning";
        if (status === "verified") color = "info";
        if (status === "failed") color = "error";

        return <Chip size="small" label={status.toUpperCase()} color={color} sx={{ fontSize: '0.7rem', height: '20px' }} />;
      },
    },
    {
      field: "heardAbout",
      headerName: "How Did You Hear?",
      width: 120,
      renderHeader: renderColumnHeader,
      renderCell: (params) => {
        const value = params.value || "—";
        return (
          <div title={value} style={{ 
            overflow: 'hidden', 
            textOverflow: 'ellipsis', 
            whiteSpace: 'nowrap',
            fontSize: '0.875rem'
          }}>
            {value}
          </div>
        );
      },
    },
    {
      field: "utmSource",
      headerName: "Source",
      width: 80,
      sortable: false,
      renderHeader: renderColumnHeader,
      renderCell: (params) => {
        const row = params?.row ?? {};
        const utm = safeParseJson(row.utm) || safeParseJson(row.attribution?.utm);
        const source =
          utm?.utm_source ??
          row.utm_source ??   
          row.utmSource ??    
          "—";
        return <span style={{ fontSize: '0.875rem' }}>{source}</span>;
      },
    },
    {
      field: "utmCampaign",
      headerName: "Campaign",
      width: 140,
      sortable: false,
      renderHeader: renderColumnHeader,
      renderCell: (params) => {
        const row = params?.row ?? {};
        const utm = safeParseJson(row.utm) || safeParseJson(row.attribution?.utm);
        const campaign =
          utm?.utm_campaign ??
          row.utm_campaign ??   
          row.utmCampaign ??    
          "—";
        
        // Format campaign for display (e.g., "Campaign: PH | PRS | Leads | Creative Testing | Sept 6th")
        const formattedCampaign = campaign !== "—" ? `Campaign: ${campaign}` : "—";
        
        return (
          <div title={formattedCampaign} style={{ 
            fontSize: '0.875rem',
            overflow: 'hidden', 
            textOverflow: 'ellipsis', 
            whiteSpace: 'nowrap'
          }}>
            {formattedCampaign}
          </div>
        );
      },
    },
  ];

  const ratioMap = {
    "One Student": "1:1",
    "Two Students": "1:2",
    "Small Group (3+ Students)": "1:3",
  };

  function fmtShortDate(d) {
    if (!d) return "—";
    const dt = new Date(d);
    return `${(dt.getMonth() + 1).toString().padStart(2, "0")}/${dt
      .getDate()
      .toString()
      .padStart(2, "0")}/${dt.getFullYear()}`;
  }

  function fmtDateTime(d) {
    if (!d) return "—";
    const dt = new Date(d);
    const month = (dt.getMonth() + 1).toString().padStart(2, "0");
    const day = dt.getDate().toString().padStart(2, "0");
    const year = dt.getFullYear();
    let hours = dt.getHours();
    const minutes = dt.getMinutes().toString().padStart(2, "0");
    const ampm = hours >= 12 ? "pm" : "am";
    hours = hours % 12;
    hours = hours ? hours : 12; // the hour '0' should be '12'
    return `${month}/${day}/${year} ${hours}:${minutes} ${ampm}`;
  }

  function getAge(dob) {
    if (!dob) return "";
    return Math.floor(
      (Date.now() - new Date(dob)) / (1000 * 60 * 60 * 24 * 365)
    );
  }

  function renderJobDesc(detail) {
    const kids = detail.students
      .map(
        (s) =>
          `• ${s.first} - Chess Level: ${s.experience} - (Age: ${getAge(
            s.dob
          )}) - Notes: ${s.notes || "No notes provided"}`
      )
      .join("\n");

    const slots = detail.slots
      .filter((s) => s.date)
      .map((s) => {
        const day = new Date(s.date).toLocaleDateString(undefined, {
          weekday: "long",
        });
        return `• ${day}: ${s.start} - ${s.end}`;
      })
      .join("\n");

    const ratio = ratioMap[detail.studentType];
    const trialLabel = detail.is_trial ? "TRIAL" : " ";
    const startDate = fmtShortDate(detail.slots[0]?.date);

    return `
${detail.parentLast}
Address: ${[
      detail.address.street,
      detail.address.city,
      detail.address.state,
      detail.address.zip,
      detail.address.country,
    ]
      .filter(Boolean)
      .join(", ")}

Home Lesson Details - ${detail.bookingType} - ${trialLabel}
Duration: 45-60 Minutes
Lesson Type: Private ${ratio}
Parent: ${detail.parentFirst} ${detail.parentLast}
Children:
${kids}

Timezone: ${detail.timezone || "—"}
Day and Time: (pick one)
${slots}

Start Date: ${startDate}
Lesson dates: Weekly Ongoing Post Trial
Client Notes:
`.trim();
  }

  // Tab filtering is now server-side - the backend filters by payment_status

  // Handle column width change
  const handleColumnWidthChange = (params) => {
    const newWidths = {
      ...columnWidthModel,
      [params.colDef.field]: params.width,
    };
    setColumnWidthModel(newWidths);
    
    // Persist to localStorage
    try {
      const storageKey = 'columnConfig_/booking-forms/submissions';
      const existing = localStorage.getItem(storageKey);
      const config = existing ? JSON.parse(existing) : {};
      config.columnWidths = newWidths;
      config.timestamp = new Date().toISOString();
      localStorage.setItem(storageKey, JSON.stringify(config));
    } catch (error) {
      console.error('Error saving column widths:', error);
    }
  };

  const handlePageSizeChange = (event) => {
    const newSize = Number(event.target.value);
    setPaginationModel((prev) => {
      if (prev.pageSize === newSize) {
        return prev;
      }
      return { page: 0, pageSize: newSize };
    });
  };

  const goToPreviousPage = () => {
    setPaginationModel((prev) => {
      if (prev.page <= 0) {
        return prev;
      }
      return { ...prev, page: prev.page - 1 };
    });
  };

  const goToNextPage = () => {
    setPaginationModel((prev) => {
      const maxPageIndex = (totalPages > 0 ? totalPages : 1) - 1;
      if (prev.page >= maxPageIndex) {
        return prev;
      }
      return { ...prev, page: prev.page + 1 };
    });
  };

  const PaginationControls = ({ position }) => {
    const effectiveTotalPages = totalPages > 0 ? totalPages : 1;
    const isPrevDisabled = paginationModel.page === 0 || rowCount === 0;
    const isNextDisabled =
      rowCount === 0 || paginationModel.page >= effectiveTotalPages - 1;
    const startItem = rowCount === 0 ? 0 : paginationModel.page * paginationModel.pageSize + 1;
    const endItem = rowCount === 0 ? 0 : Math.min(rowCount, (paginationModel.page + 1) * paginationModel.pageSize);
    const labelText = rowCount > 0
      ? `Showing ${startItem}-${endItem} of ${rowCount} submissions (Page ${Math.min(paginationModel.page + 1, effectiveTotalPages)} of ${effectiveTotalPages})`
      : 'No submissions to display';

    return (
      <Box
        sx={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          flexWrap: 'wrap',
          gap: 1.5,
          px: 2,
          py: 1,
          bgcolor: 'white',
          borderBottom: position === 'top' ? '1px solid #e4e6eb' : 'none',
          borderTop: position === 'bottom' ? '1px solid #e4e6eb' : 'none',
        }}
      >
        <Typography variant="body2" color="text.secondary">
          {labelText}
        </Typography>
        <Box sx={{ display: 'flex', alignItems: 'center', gap: 1.5, flexWrap: 'wrap' }}>
          <FormControl size="small" sx={{ minWidth: 110 }}>
            <InputLabel id={`page-size-select-${position}`}>Rows</InputLabel>
            <Select
              labelId={`page-size-select-${position}`}
              value={paginationModel.pageSize}
              label="Rows"
              onChange={handlePageSizeChange}
            >
              {pageSizeOptions.map((size) => (
                <MenuItem key={size} value={size}>
                  {size} / page
                </MenuItem>
              ))}
            </Select>
          </FormControl>
          <IconButton
            size="small"
            onClick={goToPreviousPage}
            disabled={isPrevDisabled}
            aria-label="Previous page"
          >
            <ChevronLeftIcon className="h-4 w-4" />
          </IconButton>
          <IconButton
            size="small"
            onClick={goToNextPage}
            disabled={isNextDisabled}
            aria-label="Next page"
          >
            <ChevronRightIcon className="h-4 w-4" />
          </IconButton>
        </Box>
      </Box>
    );
  };

  return (
    <Box sx={{ 
      p: 0,
      bgcolor: '#f5f6f8',
      minHeight: '100vh',
    }}>
      {/* Top Bar - Facebook Ads Manager Style */}
      <Box sx={{ 
        bgcolor: 'white',
        borderBottom: '1px solid #e4e6eb',
        px: 2,
        py: 1.5,
      }}>
        {/* Search Bar */}
        <TextField
          placeholder="Search to filter by: name, ID or metrics"
          value={searchQuery || ''}
          onChange={(e) => {
            setSearchQuery(e.target.value);
          }}
          onKeyDown={(e) => {
            if (e.key === 'Enter') {
              e.preventDefault();
              // Prevent any form submission
            }
          }}
          size="small"
          fullWidth
          sx={{ mb: 1.5, maxWidth: 400 }}
          InputProps={{
            startAdornment: (
              <InputAdornment position="start">
                <SearchIcon className="h-4 w-4 text-neutral-400" />
              </InputAdornment>
            ),
          }}
        />

        {/* Tabs and Date Range */}
        <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', mb: 1 }}>
          <Tabs
            value={tab}
            onChange={(e, newValue) => setTab(newValue)}
            aria-label="Payment status tabs"
            sx={{
              minHeight: '40px',
              '& .MuiTab-root': {
                minWidth: '80px',
                fontSize: '0.875rem',
                padding: '8px 16px',
                textTransform: 'none',
                fontWeight: 500,
              },
              '& .Mui-selected': {
                color: '#1877f2',
              },
            }}
            indicatorColor="primary"
          >
            <Tab label="All" value="all" />
            <Tab label="Paid" value="paid" />
            <Tab label="Pending" value="pending" />
            <Tab label="Verified" value="verified" />
            <Tab label="Photo Release" value="photo_release" />
          </Tabs>

        </Box>
      </Box>

      {/* Action Buttons Bar - Mobile-friendly */}
      <Box sx={{ 
        bgcolor: 'white',
        borderBottom: '1px solid #e4e6eb',
        px: { xs: 1, sm: 2 },
        py: 1.5,
        display: 'flex',
        alignItems: 'center',
        gap: 1,
        flexWrap: 'wrap',
      }}>
        <Button
          variant="contained"
          component={RouterLink}
          to="/booking-forms/config"
          sx={{ 
            textTransform: 'none', 
            fontWeight: 500,
            bgcolor: 'primary.main',
            '&:hover': { bgcolor: 'primary.dark' },
            fontSize: { xs: '0.75rem', sm: '0.875rem' },
            px: { xs: 1.5, sm: 2 },
            py: { xs: 0.75, sm: 1 },
          }}
        >
          <SettingsIcon className="h-4 w-4 sm:h-5 sm:w-5 mr-1" />
          <Box component="span" sx={{ display: { xs: 'none', sm: 'inline' } }}>
            Form Config
          </Box>
        </Button>

        <Box sx={{ flex: 1, display: { xs: 'none', sm: 'block' } }} />

        {/* Column Configuration - Hidden on mobile, shown in toolbar */}
        <Box sx={{ display: { xs: 'none', md: 'flex' }, gap: 1 }}>
          <Button
            variant="outlined"
            startIcon={<ViewColumnIcon className="h-5 w-5" />}
            onClick={(e) => setColumnsMenuAnchor(e.currentTarget)}
            sx={{ 
              textTransform: 'none', 
              fontWeight: 500,
              fontSize: '0.875rem',
              borderColor: 'divider',
              '&:hover': { borderColor: 'primary.main', bgcolor: 'action.hover' },
            }}
          >
            Columns
          </Button>
          <Button
            variant="outlined"
            startIcon={<TableChartIcon className="h-5 w-5" />}
            onClick={(e) => setBreakdownMenuAnchor(e.currentTarget)}
            sx={{ 
              textTransform: 'none', 
              fontWeight: 500,
              fontSize: '0.875rem',
              borderColor: 'divider',
              '&:hover': { borderColor: 'primary.main', bgcolor: 'action.hover' },
            }}
          >
            Breakdown
          </Button>
        </Box>
      </Box>

      {/* DataGrid */}
      <Box sx={{ bgcolor: 'white', mx: 2, my: 2, borderRadius: 1, overflow: 'hidden' }}>
        <>
          <PaginationControls position="top" />
            <DataGrid
              rows={rows.filter((row) => {
                if (!searchQuery.trim()) return true;
                const query = searchQuery.toLowerCase();
                return (
                  String(row.id).toLowerCase().includes(query) ||
                  `${row.parentFirst || ''} ${row.parentLast || ''}`.toLowerCase().includes(query) ||
                  (row.parentEmail || '').toLowerCase().includes(query) ||
                  (row.bookingType || '').toLowerCase().includes(query) ||
                  (row.labelName || '').toLowerCase().includes(query)
                );
              })}
              columns={columns.map((col) => ({
                ...col,
                width: columnWidthModel[col.field] || col.width || col.minWidth || 150,
              }))}
              getRowId={(row) => row.id}
              paginationMode="server"
              rowCount={rowCount}
              paginationModel={paginationModel}
              onPaginationModelChange={setPaginationModel}
              pageSizeOptions={pageSizeOptions}
              loading={loading}
              hideFooterPagination
              hideFooterSelectedRowCount
              columnWidthModel={Object.keys(columnWidthModel).length > 0 ? columnWidthModel : undefined}
              onColumnWidthChange={handleColumnWidthChange}
              disableRowSelectionOnClick
              slots={{ toolbar: GridToolbar }}
              slotProps={{
                toolbar: {
                  showQuickFilter: false, // We have custom search above
                  csvOptions: {
                    fileName: `form_submissions_${new Date().toISOString().split('T')[0]}`,
                    utf8WithBom: true,
                  },
                  printOptions: {
                    hideFooter: true,
                    hideToolbar: true,
                  },
                },
              }}
              sx={{
                "& .error-row": {
                  bgcolor: (theme) => theme.palette.error.light,
                  "&:hover": { bgcolor: (theme) => theme.palette.error.main },
                },
                '& .MuiDataGrid-toolbarContainer': {
                  bgcolor: 'background.paper',
                  borderBottom: '1px solid',
                  borderColor: 'divider',
                  px: { xs: 1, sm: 2 },
                  py: 1,
                  '& .MuiButton-root': {
                    textTransform: 'none',
                    fontWeight: 500,
                    fontSize: { xs: '0.75rem', sm: '0.875rem' },
                    px: { xs: 1, sm: 1.5 },
                    minWidth: { xs: 'auto', sm: '64px' },
                    color: 'text.primary',
                    '&:hover': {
                      bgcolor: 'action.hover',
                    },
                  },
                  // Hide density button on very small screens
                  '& button[aria-label*="Density"]': {
                    display: { xs: 'none', sm: 'inline-flex' },
                  },
                },
                "& .MuiDataGrid-scrollbar": {
                  "&[aria-hidden='true']": {
                    "& *": {
                      tabIndex: "-1 !important",
                    },
                  },
                },
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
                },
                '& .MuiDataGrid-columnHeaders': {
                  bgcolor: 'rgba(250,250,250,0.5)',
                  borderTop: '1px solid #e5e5e5',
                  borderBottom: '1px solid #e5e5e5',
                  minHeight: '40px !important',
                  '& .MuiDataGrid-columnHeader': {
                    minHeight: '40px !important',
                  },
                },
                '& .MuiDataGrid-columnHeaderTitle': {
                  fontSize: '11px',
                  fontWeight: 500,
                  color: '#737373',
                  textTransform: 'uppercase',
                  letterSpacing: '0.05em',
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
              }}
            />
            <PaginationControls position="bottom" />
        </>
        </Box>

      <Dialog
        open={!!detail}
        onClose={() => setDetail(null)}
        fullWidth
        maxWidth="md"
        fullScreen={isMobile}
        disableScrollLock={true}
        PaperProps={{
          sx: {
            borderRadius: { xs: 0, sm: 2 },
            overflow: "hidden",
            maxHeight: { xs: '100vh', sm: '90vh' },
            m: { xs: 0, sm: 2 },
          },
        }}
      >
        {}
        <Box
          sx={{
            bgcolor: (theme) => theme.palette.primary.main,
            color: "common.white",
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
            gap: 1.5,
            px: { xs: 2, sm: 3 },
            py: { xs: 1.5, sm: 2 },
            position: 'relative',
          }}
        >
          <Box sx={{ display: "flex", alignItems: "center", gap: 1.5 }}>
            <CheckCircleOutlineIcon className="h-7 w-7" />
            <Typography variant="h6" sx={{ fontSize: { xs: '1rem', sm: '1.25rem' } }}>
              Submission #{detail?.id}
            </Typography>
          </Box>
          <IconButton
            onClick={() => setDetail(null)}
            sx={{
              color: "common.white",
              p: { xs: 1, sm: 0.5 },
              minWidth: { xs: '44px', sm: 'auto' },
              minHeight: { xs: '44px', sm: 'auto' },
            }}
            aria-label="close"
          >
            <CloseIcon className="h-5 w-5" />
          </IconButton>
        </Box>

        {}
        <DialogContent
          dividers
          sx={{
            maxHeight: { xs: "calc(100vh - 180px)", sm: "70vh" },
            bgcolor: (theme) => theme.palette.background.default,
            px: { xs: 2, sm: 3 },
            py: { xs: 2, sm: 3 },
            "&::-webkit-scrollbar": { width: 6 },
            "&::-webkit-scrollbar-thumb": {
              backgroundColor: "#ccc",
              borderRadius: 3,
            },
          }}
        >
          {detail && (
            <Box sx={{ space: { xs: 3, sm: 4 } }}>
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                      {}
                      <div className="bg-white border border-neutral-200 rounded-xl shadow-sm p-6 space-y-3">
                        <h3 className="text-lg font-semibold text-neutral-900 mb-4">
                          Parent Info
                        </h3>

                        <div className="text-sm text-neutral-700 space-y-2">
                          <div className="flex justify-between">
                            <span className="font-medium text-neutral-500">
                              TutorCruncher ID:
                            </span>
                            {detail.tcClientId ? (
                              <Link
                                href={`https://account.acmeops.com/clients/${detail.tcClientId}/`}
                                target="_blank"
                                rel="noopener noreferrer"
                                className="text-primary-500 hover:text-primary-700 transition-colors"
                              >
                                {detail.tcClientId}
                              </Link>
                            ) : (
                              <span className="text-neutral-400">—</span>
                            )}
                          </div>

                          <div className="flex justify-between">
                            <span className="font-medium text-neutral-500">
                              Name:
                            </span>
                            <span>
                              {detail.parentFirst} {detail.parentLast}
                            </span>
                          </div>

                          <div className="flex justify-between">
                            <span className="font-medium text-neutral-500">
                              Email:
                            </span>
                            <span>{detail.parentEmail}</span>
                          </div>

                          <div className="flex justify-between">
                            <span className="font-medium text-neutral-500">
                              Phone:
                            </span>
                            <span>{detail.parentPhone}</span>
                          </div>
                        </div>
                      </div>

                      {}
                      <div className="bg-white border border-neutral-200 rounded-xl shadow-sm p-6 space-y-3">
                        <h3 className="text-lg font-semibold text-neutral-900 mb-4">
                          Booking & Pricing
                        </h3>

                        <div className="text-sm text-neutral-700 space-y-2">
                          <div className="flex justify-between items-center">
                            <span className="font-medium text-neutral-500">
                              Payment Status:
                            </span>
                            {(() => {
                              const raw =
                                detail?.paymentStatus || detail?.payment_status;
                              const status =
                                typeof raw === "string" ? raw : "unknown";
                              let color = "default";
                              if (status === "paid") color = "success";
                              if (status === "pending") color = "warning";
                              if (status === "verified") color = "info";
                              if (status === "failed") color = "error";
                              return (
                                <Chip
                                  size="small"
                                  label={status.toUpperCase()}
                                  color={color}
                                />
                              );
                            })()}
                          </div>

                          <div className="flex justify-between">
                            <span className="font-medium text-neutral-500">
                              Booking Type:
                            </span>
                            <span>{detail.bookingType}</span>
                          </div>

                          <div className="flex justify-between">
                            <span className="font-medium text-neutral-500">
                              Price:
                            </span>
                            <span>${detail.actualPrice}</span>
                          </div>

                          <div className="flex justify-between">
                            <span className="font-medium text-neutral-500">
                              Trial:
                            </span>
                            <span>{detail.is_trial ? "Yes" : "No"}</span>
                          </div>

                          {detail.preferredTutorName && (
                            <div className="flex justify-between items-center">
                              <span className="font-medium text-neutral-500">
                                Preferred Tutor:
                              </span>
                              <span className="font-medium text-brand-purple">
                                {detail.preferredTutorName}
                              </span>
                            </div>
                          )}
                        </div>
                      </div>
                    </div>
                    <div className="bg-white border border-neutral-200 rounded-xl shadow-sm p-6">
                      <h3 className="text-lg font-semibold text-neutral-900 mb-4">
                        TutorCruncher Info
                      </h3>

                      {detail.lessonType === "Club" &&
                      detail.selectedSessions?.length ? (
                        <div className="space-y-4">
                          <h4 className="text-sm font-medium text-neutral-600 uppercase tracking-wide">
                            Club Appointments
                          </h4>
                          <div className="flex flex-wrap gap-2">
                            {detail.selectedSessions.map((id, i) => (
                              <Chip
                                key={i}
                                label={`Lesson #${id}`}
                                component="a"
                                href={`https://account.acmeops.com/cal/appointments/${id}/`}
                                target="_blank"
                                rel="noopener noreferrer"
                                clickable
                                variant="outlined"
                                color="primary"
                              />
                            ))}
                          </div>
                        </div>
                      ) : (
                        <div className="space-y-6 text-sm text-neutral-900">
                          {}
                          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                            <div>
                              <p className="text-xs font-medium text-neutral-500 uppercase mb-1">
                                Job ID
                              </p>
                              {detail.tcServiceId ? (
                                <Link
                                  href={`https://account.acmeops.com/cal/service/${detail.tcServiceId}/`}
                                  target="_blank"
                                  rel="noopener noreferrer"
                                  className="text-primary-500 hover:text-primary-700 transition-colors"
                                >
                                  {detail.tcServiceId}
                                </Link>
                              ) : (
                                <span className="text-neutral-400">—</span>
                              )}
                            </div>

                            <div>
                              <p className="text-xs font-medium text-neutral-500 uppercase mb-1">
                                Job Name
                              </p>
                              <p>
                                {[
                                  `${detail.parentFirst} ${detail.parentLast}`,
                                  "Chess",
                                  detail.lessonType || "Home",
                                  `${
                                    ratioMap[detail.studentType]
                                  } (${detail.students
                                    .map((s) => s.first)
                                    .join(", ")})`,
                                ].join(" – ")}
                              </p>
                            </div>

                            <div>
                              <p className="text-xs font-medium text-neutral-500 uppercase mb-1">
                                Label
                              </p>
                              <p>{detail.labelName || "—"}</p>
                            </div>

                            <div>
                              <p className="text-xs font-medium text-neutral-500 uppercase mb-1">
                                Address
                              </p>
                              <p>
                                {[
                                  detail.address.street,
                                  detail.address.city,
                                  detail.address.state,
                                  detail.address.zip,
                                  detail.address.country,
                                ]
                                  .filter(Boolean)
                                  .join(", ")}
                              </p>
                            </div>
                          </div>

                          {}
                          <div>
                            <h4 className="text-base font-semibold mb-3">
                              {detail.bookingType} – Lesson Details – Chess{" "}
                              {detail.is_trial && (
                                <span className="text-xs text-[#C77A26] font-semibold ml-1">
                                  TRIAL
                                </span>
                              )}
                            </h4>

                            <div className="grid grid-cols-1 sm:grid-cols-2 gap-y-2 gap-x-6 text-sm">
                              <p>
                                <strong>Duration:</strong> 45–60 Minutes
                              </p>
                              <p>
                                <strong>Lesson Type:</strong> Private{" "}
                                {ratioMap[detail.studentType]}
                              </p>
                              <p>
                                <strong>Parent:</strong> {detail.parentFirst}{" "}
                                {detail.parentLast}
                              </p>
                              <p>
                                <strong>Children:</strong>{" "}
                                {detail.students
                                  .map(
                                    (s) =>
                                      `${s.first} – ${s.experience} (${getAge(
                                        s.dob
                                      )}y)`
                                  )
                                  .join(", ")}
                              </p>
                              <p>
                                <strong>Timezone:</strong>{" "}
                                {detail.timezone || "—"}
                              </p>
                              <p>
                                <strong>Start Date:</strong>{" "}
                                {fmtShortDate(detail.slots[0]?.date)}
                              </p>
                              <p>
                                <strong>Lesson Dates:</strong> Weekly Ongoing
                                Post Trial
                              </p>
                            </div>

                            {}
                            <div className="mt-4">
                              <p className="mb-4">
                                <strong>Day &amp; Time (Pick One):</strong>
                              </p>
                              <div className="mt-4">
                                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                                  {detail.slots
                                    .filter((s) => s.start && s.end)
                                    .map((s, i) => {
                                      const day = s.dayOfWeek;
                                      return (
                                        <div
                                          key={i}
                                          className="bg-neutral-50 border border-neutral-200 rounded-md p-3"
                                        >
                                          <p className="text-sm font-medium text-neutral-700">
                                            Option {i + 1}
                                          </p>
                                          <p className="text-sm text-neutral-500">
                                            <span className="font-semibold">
                                              {day}:
                                            </span>{" "}
                                            {s.start} – {s.end}
                                          </p>
                                        </div>
                                      );
                                    })}
                                </div>
                              </div>
                            </div>

                            {}
                            {detail.clientNotes && (
                              <div className="mt-4">
                                <p className="font-medium">Client Notes:</p>
                                <p className="text-neutral-700">
                                  {detail.clientNotes}
                                </p>
                              </div>
                            )}
                          </div>
                        </div>
                      )}
                    </div>

                    {}
                    <div className="bg-white border border-neutral-200 rounded-xl shadow-sm p-6">
                      <h3 className="text-lg font-semibold text-neutral-900 mb-4">
                        Students ({(() => {
                          const studentCount = detail.students?.length || 0;
                          if (studentCount === 1) return 'One Student';
                          if (studentCount === 2) return 'Two Students';
                          if (studentCount >= 3) return `Small Group (${studentCount} Students)`;
                          return detail.studentType || 'No Students';
                        })()})
                      </h3>
                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                        {detail.students.map((s, i) => (
                          <div
                            key={i}
                            className="bg-neutral-50 border border-neutral-100 rounded-md p-4 shadow-sm"
                          >
                            <p className="text-sm font-semibold text-neutral-900">
                              {s.first} {s.last}
                            </p>
                            <p className="text-sm text-neutral-600 mt-1">
                              {s.school || "No school provided"}
                              <br />
                              Level: {s.experience} <br />
                              DOB: {s.dob}
                            </p>
                            <div className="mt-2">
                              <strong>Notes:</strong>
                              <p className="text-sm text-neutral-700">
                                {s.notes || "No notes provided"}
                              </p>
                            </div>
                          </div>
                        ))}
                      </div>
                    </div>

                    <div>
                          {}
                          <div className="bg-white border border-neutral-200 rounded-xl shadow-sm p-6 mt-6">
                            <h3 className="text-lg font-semibold text-neutral-900 mb-4">
                              Attribution
                            </h3>

                            {}
                            <div className="mb-4">
  <p className="text-xs font-medium text-neutral-500 uppercase mb-2">
    UTM Parameters
  </p>
  {(() => {
    const utm = getUtmFromDetail(detail);
    const entries = Object.entries(utm).filter(([_, v]) => v != null && String(v).trim() !== "");
    return entries.length ? (
      <div className="flex flex-wrap gap-2">
        {entries.map(([k, v]) => (
          <Chip
            key={k}
            size="small"
            variant="outlined"
            label={`${utmKeyLabel(k)}: ${v}`}
            sx={{ mr: 0.5 }}
          />
        ))}
      </div>
    ) : (
      <span className="text-neutral-400">—</span>
    );
  })()}
</div>

<p className="text-xs font-medium text-neutral-500 uppercase mb-2">
    Landing Page URL
  </p>
{getLandingUrl(detail) ? (
  <Link
    href={getLandingUrl(detail)}
    target="_blank"
    rel="noopener noreferrer"
    className="text-primary-500 hover:text-primary-700 transition-colors break-all"
  >
    {truncate(getLandingUrl(detail))}
  </Link>
) : (
  <span className="text-neutral-400">—</span>
)}
                          </div>
                        </div>

                    {}
                    <div className="bg-white border border-neutral-200 rounded-xl shadow-sm p-6">
                      <h3 className="text-lg font-semibold text-neutral-900 mb-4">
                        Address & Agreements
                      </h3>

                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 text-sm text-neutral-700">
                        

                        <div>
                          <p className="text-xs font-medium text-neutral-500 uppercase mb-1">
                            How did you hear about us?
                          </p>
                          <p>{detail.heardAbout || "—"}</p>
                        </div>

                        <div>
                          <p className="text-xs font-medium text-neutral-500 uppercase mb-1">
                            Address
                          </p>
                          <p>
                            {[
                              detail.address.street,
                              detail.address.city,
                              detail.address.state,
                              detail.address.zip,
                              detail.address.country,
                            ]
                              .filter(Boolean)
                              .join(", ")}
                          </p>
                        </div>
                      </div>

                      {}
                      <div className="mt-4">
                        <p className="text-xs font-medium text-neutral-500 uppercase mb-1">
                          Agreements
                        </p>
                        <div className="flex flex-wrap gap-2">
                          {detail.agreeCancel && (
                            <span className="px-2 py-1 bg-[#E8F8ED] text-[#2A9147] rounded-full text-xs">
                              Cancellation Policy
                            </span>
                          )}
                          {detail.agreeService && (
                            <span className="px-2 py-1 bg-[#E8FBFF] text-[#3BA8BD] rounded-full text-xs">
                              Service Agreement
                            </span>
                          )}
                          {detail.agreePhoto && (
                            <span className="px-2 py-1 bg-primary-50 text-primary-700 rounded-full text-xs">
                              Photo Release
                            </span>
                          )}
                        </div>
                      </div>

                      {}
                      <div className="mt-4">
                        <p className="text-xs font-medium text-neutral-500 uppercase mb-1">
                          Signature
                        </p>
                        {detail.signature ? (
                          <img
                            src={detail.signature}
                            alt="Signature"
                            style={{
                              width: "100%",
                              maxWidth: "400px",
                              height: "auto",
                            }}
                          />
                        ) : (
                          "No signature available"
                        )}
                      </div>
                    </div>

                    {/* Booking Experience Tracking Section */}
                    {detail.formEvents && detail.formEvents.length > 0 && (
                      <div className="bg-white border border-neutral-200 rounded-xl shadow-sm p-6 mt-6">
                        <h3 className="text-lg font-semibold text-neutral-900 mb-4">
                          Booking Experience Timeline
                        </h3>
                        
                        <div className="space-y-3">
                          {detail.formEvents.map((event, idx) => {
                            const eventTime = new Date(event.createdAt);
                            const duration = event.durationMs ? `${Math.round(event.durationMs / 1000)}s` : null;
                            
                            let eventIcon = '📋';
                            let eventColor = 'bg-neutral-100';
                            let eventText = event.eventType;
                            
                            if (event.eventType === 'form_view') {
                              eventIcon = '👁️';
                              eventColor = 'bg-[#E8FBFF]';
                              eventText = 'Form Viewed';
                            } else if (event.eventType === 'form_start') {
                              eventIcon = '🚀';
                              eventColor = 'bg-[#E8F8ED]';
                              eventText = 'Form Started';
                            } else if (event.eventType === 'step_completed') {
                              eventIcon = '✅';
                              eventColor = 'bg-[#E8F8ED]';
                              eventText = `Step Completed: ${event.stepName || `Step ${event.stepNumber + 1}`}`;
                            } else if (event.eventType === 'stripe_checkout_created') {
                              eventIcon = '💳';
                              eventColor = 'bg-primary-50';
                              eventText = 'Stripe Checkout Created';
                            } else if (event.eventType === 'stripe_checkout_abandoned') {
                              eventIcon = '⚠️';
                              eventColor = 'bg-[#FEF4E8]';
                              eventText = 'Stripe Checkout Abandoned';
                            } else if (event.eventType === 'payment_completed') {
                              eventIcon = '💰';
                              eventColor = 'bg-[#E8F8ED]';
                              eventText = 'Payment Completed';
                            } else if (event.eventType === 'form_abandoned') {
                              eventIcon = '❌';
                              eventColor = 'bg-[#FCE8F0]';
                              eventText = 'Form Abandoned';
                            }
                            
                            return (
                              <div key={idx} className={`${eventColor} border border-neutral-200 rounded-lg p-4`}>
                                <div className="flex items-start justify-between">
                                  <div className="flex items-start gap-3 flex-1">
                                    <span className="text-2xl">{eventIcon}</span>
                                    <div className="flex-1">
                                      <p className="font-medium text-neutral-900">{eventText}</p>
                                      <p className="text-sm text-neutral-600 mt-1">
                                        {eventTime.toLocaleString()}
                                        {duration && ` • Time on previous step: ${duration}`}
                                      </p>
                                      {event.metadata && Object.keys(event.metadata).length > 0 && (
                                        <div className="mt-2 text-xs text-neutral-500">
                                          {event.metadata.stripeSessionId && (
                                            <p>Stripe Session: {event.metadata.stripeSessionId}</p>
                                          )}
                                          {event.metadata.price && (
                                            <p>Price: ${event.metadata.price}</p>
                                          )}
                                          {event.metadata.bookingType && (
                                            <p>Booking Type: {event.metadata.bookingType}</p>
                                          )}
                                        </div>
                                      )}
                                    </div>
                                  </div>
                                </div>
                              </div>
                            );
                          })}
                        </div>
                        
                        {/* Abandonment Analysis */}
                        {(() => {
                          const hasStripeCheckout = detail.formEvents.some(e => e.eventType === 'stripe_checkout_created');
                          const hasPaymentCompleted = detail.formEvents.some(e => e.eventType === 'payment_completed');
                          const lastEvent = detail.formEvents[detail.formEvents.length - 1];
                          const isAbandoned = !hasPaymentCompleted && (hasStripeCheckout || lastEvent?.eventType !== 'payment_completed');
                          
                          if (isAbandoned) {
                            let abandonmentPoint = 'Unknown';
                            let abandonmentReason = 'User did not complete payment';
                            
                            if (hasStripeCheckout && !hasPaymentCompleted) {
                              abandonmentPoint = 'Stripe Checkout';
                              abandonmentReason = 'User reached Stripe checkout but did not complete payment';
                            } else if (lastEvent?.eventType === 'step_completed') {
                              abandonmentPoint = lastEvent.stepName || `Step ${lastEvent.stepNumber + 1}`;
                              abandonmentReason = `User completed ${abandonmentPoint} but did not proceed to payment`;
                            } else if (lastEvent?.eventType === 'form_start') {
                              abandonmentPoint = 'Form Start';
                              abandonmentReason = 'User started the form but did not complete it';
                            }
                            
                            return (
                              <div className="mt-4 p-4 bg-[#FEF4E8] border border-[#C77A26]/20 rounded-lg">
                                <h4 className="font-semibold text-[#C77A26] mb-2">⚠️ Abandonment Detected</h4>
                                <p className="text-sm text-[#C77A26]">
                                  <strong>Abandonment Point:</strong> {abandonmentPoint}
                                </p>
                                <p className="text-sm text-[#C77A26] mt-1">
                                  <strong>Reason:</strong> {abandonmentReason}
                                </p>
                                {lastEvent && (
                                  <p className="text-xs text-[#C77A26] mt-2">
                                    Last activity: {new Date(lastEvent.createdAt).toLocaleString()}
                                  </p>
                                )}
                              </div>
                            );
                          }
                          return null;
                        })()}
                      </div>
                    )}

                    {/* Error Tracking & Recommendations Section */}
                    {detail.analysis && (detail.analysis.hasErrors || detail.analysis.hasRecommendations) && (
                      <div className="bg-white border border-neutral-200 rounded-xl shadow-sm p-6 mt-6">
                        <h3 className="text-lg font-semibold text-neutral-900 mb-4 flex items-center gap-2">
                          {detail.analysis.priority === 'high' ? (
                            <span className="text-[#AE255B]">⚠️</span>
                          ) : detail.analysis.priority === 'medium' ? (
                            <span className="text-[#C77A26]">ℹ️</span>
                          ) : (
                            <span className="text-[#3BA8BD]">💡</span>
                          )}
                          Booking Experience Analysis
                        </h3>

                        {/* Summary */}
                        <div className={`mb-4 p-3 rounded-lg ${
                          detail.analysis.priority === 'high' 
                            ? 'bg-[#FCE8F0] border border-[#AE255B]/20' 
                            : detail.analysis.priority === 'medium'
                            ? 'bg-[#FEF4E8] border border-[#C77A26]/20'
                            : 'bg-[#E8FBFF] border border-[#3BA8BD]/20'
                        }`}>
                          <p className={`text-sm font-medium ${
                            detail.analysis.priority === 'high' 
                              ? 'text-[#AE255B]' 
                              : detail.analysis.priority === 'medium'
                              ? 'text-[#C77A26]'
                              : 'text-[#3BA8BD]'
                          }`}>
                            {detail.analysis.summary}
                          </p>
                        </div>

                        {/* Errors */}
                        {detail.analysis.errors && detail.analysis.errors.length > 0 && (
                          <div className="mb-4">
                            <h4 className="text-sm font-semibold text-neutral-700 mb-2">Errors Detected:</h4>
                            <div className="space-y-2">
                              {detail.analysis.errors.map((error, idx) => (
                                <div key={idx} className="bg-[#FCE8F0] border border-[#AE255B]/20 rounded p-3">
                                  <div className="flex items-start justify-between">
                                    <div className="flex-1">
                                      <p className="text-sm font-medium text-[#AE255B]">
                                        {error.type || 'Unknown Error'}
                                      </p>
                                      <p className="text-sm text-[#AE255B] mt-1">
                                        {error.message}
                                      </p>
                                      {error.timestamp && (
                                        <p className="text-xs text-[#AE255B] mt-1">
                                          {new Date(error.timestamp).toLocaleString()}
                                        </p>
                                      )}
                                    </div>
                                    {error.severity === 'high' && (
                                      <span className="px-2 py-1 bg-[#DA2E72] text-white text-xs rounded">
                                        HIGH
                                      </span>
                                    )}
                                  </div>
                                </div>
                              ))}
                            </div>
                          </div>
                        )}

                        {/* Recommendations */}
                        {detail.analysis.recommendations && detail.analysis.recommendations.length > 0 && (
                          <div>
                            <h4 className="text-sm font-semibold text-neutral-700 mb-3">Recommendations for Improvement:</h4>
                            <div className="space-y-4">
                              {detail.analysis.recommendations.map((rec, idx) => (
                                <div 
                                  key={idx} 
                                  className={`border rounded-lg p-4 ${
                                    rec.priority === 'high'
                                      ? 'border-[#AE255B]/30 bg-[#FCE8F0]'
                                      : rec.priority === 'medium'
                                      ? 'border-[#C77A26]/30 bg-[#FEF4E8]'
                                      : 'border-[#3BA8BD]/30 bg-[#E8FBFF]'
                                  }`}
                                >
                                  <div className="flex items-start justify-between mb-2">
                                    <h5 className={`font-semibold text-sm ${
                                      rec.priority === 'high'
                                        ? 'text-[#AE255B]'
                                        : rec.priority === 'medium'
                                        ? 'text-[#C77A26]'
                                        : 'text-[#3BA8BD]'
                                    }`}>
                                      {rec.title}
                                    </h5>
                                    <span className={`px-2 py-1 text-xs rounded ${
                                      rec.priority === 'high'
                                        ? 'bg-[#DA2E72] text-white'
                                        : rec.priority === 'medium'
                                        ? 'bg-[#F79A30] text-white'
                                        : 'bg-[#50C8DF] text-white'
                                    }`}>
                                      {rec.priority.toUpperCase()}
                                    </span>
                                  </div>
                                  <p className="text-sm text-neutral-700 mb-3">
                                    {rec.description}
                                  </p>
                                  {rec.impact && (
                                    <p className="text-xs font-medium text-neutral-600 mb-2">
                                      Impact: <span className="text-neutral-900">{rec.impact}</span>
                                    </p>
                                  )}
                                  {rec.actions && rec.actions.length > 0 && (
                                    <div>
                                      <p className="text-xs font-medium text-neutral-600 mb-2">Recommended Actions:</p>
                                      <ul className="list-disc list-inside space-y-1">
                                        {rec.actions.map((action, actionIdx) => (
                                          <li key={actionIdx} className="text-xs text-neutral-700">
                                            {action}
                                          </li>
                                        ))}
                                      </ul>
                                    </div>
                                  )}
                                </div>
                              ))}
                            </div>
                          </div>
                        )}
                      </div>
                    )}
            </Box>
          )}
        </DialogContent>

        {}
        <DialogActions
          sx={{
            px: { xs: 2, sm: 3 },
            py: { xs: 1.5, sm: 2 },
            display: "flex",
            justifyContent: "space-between",
            alignItems: "center",
            flexDirection: { xs: 'column-reverse', sm: 'row' },
            gap: { xs: 1, sm: 0 },
            borderTop: (theme) => `1px solid ${theme.palette.divider}`,
          }}
        >
          {/* Delete button - only visible to admin - positioned on the left */}
          {isAdmin() && (
            <Button
              variant="outlined"
              color="error"
              startIcon={<DeleteIcon className="h-5 w-5" />}
              onClick={handleDeleteClick}
              fullWidth={isMobile}
              sx={{
                minHeight: { xs: '44px', sm: 'auto' },
                fontSize: { xs: '0.875rem', sm: '0.875rem' },
              }}
            >
              Delete Submission
            </Button>
          )}
          {/* Close button - positioned on the right */}
          <Button
            variant="contained"
            color="primary"
            onClick={() => setDetail(null)}
            fullWidth={isMobile}
            sx={{
              ml: { xs: 0, sm: 'auto' },
              minHeight: { xs: '44px', sm: 'auto' },
              fontSize: { xs: '0.875rem', sm: '0.875rem' },
            }}
          >
            Close
          </Button>
        </DialogActions>
      </Dialog>

      {/* Delete Confirmation Dialog */}
      <Dialog
        open={deleteConfirmOpen}
        onClose={handleCloseDeleteConfirm}
        maxWidth="sm"
        fullWidth
      >
        <DialogTitle>Confirm Delete</DialogTitle>
        <DialogContent>
          <Typography>
            Are you sure you want to delete submission #{detail?.id}? This action cannot be undone.
            {detail?.parentFirst && detail?.parentLast && (
              <>
                <br />
                <br />
                <strong>Parent:</strong> {detail.parentFirst} {detail.parentLast}
              </>
            )}
            {detail?.parentEmail && (
              <>
                <br />
                <strong>Email:</strong> {detail.parentEmail}
              </>
            )}
          </Typography>
        </DialogContent>
        <DialogActions>
          <Button onClick={handleCloseDeleteConfirm} disabled={deleting}>
            Cancel
          </Button>
          <Button
            onClick={handleDeleteSubmission}
            variant="contained"
            color="error"
            disabled={deleting}
          >
            {deleting ? "Deleting..." : "Delete"}
          </Button>
        </DialogActions>
      </Dialog>

      {/* Column Header Menu */}
      <Menu
        anchorEl={columnMenuAnchor}
        open={Boolean(columnMenuAnchor)}
        onClose={() => setColumnMenuAnchor(null)}
        PaperProps={{
          sx: {
            minWidth: 200,
            mt: 0.5,
          },
        }}
      >
        <MenuItem onClick={() => setColumnMenuAnchor(null)}>
          <ListItemIcon>
            <ArrowUpwardIcon className="h-4 w-4" />
          </ListItemIcon>
          <MuiListItemText>Sort lowest to highest</MuiListItemText>
        </MenuItem>
        <MenuItem onClick={() => setColumnMenuAnchor(null)}>
          <ListItemIcon>
            <ArrowDownwardIcon className="h-4 w-4" />
          </ListItemIcon>
          <MuiListItemText>Sort highest to lowest</MuiListItemText>
        </MenuItem>
        <Divider />
        <MenuItem onClick={() => setColumnMenuAnchor(null)}>
          <ListItemIcon>
            <ChevronLeftIcon className="h-4 w-4" />
          </ListItemIcon>
          <MuiListItemText>Move left</MuiListItemText>
        </MenuItem>
        <MenuItem onClick={() => setColumnMenuAnchor(null)}>
          <ListItemIcon>
            <ChevronRightIcon className="h-4 w-4" />
          </ListItemIcon>
          <MuiListItemText>Move right</MuiListItemText>
        </MenuItem>
        <Divider />
        <MenuItem onClick={() => setColumnMenuAnchor(null)}>
          <ListItemIcon>
            <AddIcon className="h-4 w-4" />
          </ListItemIcon>
          <MuiListItemText>Add column after</MuiListItemText>
        </MenuItem>
        <MenuItem onClick={() => setColumnMenuAnchor(null)}>
          <ListItemIcon>
            <DeleteIcon className="h-4 w-4" />
          </ListItemIcon>
          <MuiListItemText>Remove column</MuiListItemText>
        </MenuItem>
        <Divider />
        <MenuItem onClick={() => setColumnMenuAnchor(null)}>
          <ListItemIcon>
            <SettingsIcon className="h-4 w-4" />
          </ListItemIcon>
          <MuiListItemText>Customize columns</MuiListItemText>
        </MenuItem>
        <MenuItem onClick={() => setColumnMenuAnchor(null)}>
          <ListItemIcon>
            <FilterListIcon className="h-4 w-4" />
          </ListItemIcon>
          <MuiListItemText>Filters</MuiListItemText>
        </MenuItem>
        <MenuItem onClick={() => setColumnMenuAnchor(null)}>
          <ListItemIcon>
            <FormatListBulletedIcon className="h-4 w-4" />
          </ListItemIcon>
          <MuiListItemText>Conditional formatting</MuiListItemText>
        </MenuItem>
      </Menu>

      {/* Columns Menu */}
      <Menu
        anchorEl={columnsMenuAnchor}
        open={Boolean(columnsMenuAnchor)}
        onClose={() => setColumnsMenuAnchor(null)}
        PaperProps={{
          sx: {
            mt: 1,
            minWidth: 200,
            boxShadow: '0 4px 6px -1px rgba(0, 0, 0, 0.1), 0 2px 4px -1px rgba(0, 0, 0, 0.06)',
          },
        }}
      >
        <MenuItem 
          onClick={() => setColumnsMenuAnchor(null)}
          sx={{ fontSize: '0.875rem', py: 1.5 }}
        >
          <ListItemIcon>
            <ViewColumnIcon className="h-4 w-4 text-neutral-400" />
          </ListItemIcon>
          <ListItemText primary="Default View" secondary="All standard columns" />
        </MenuItem>
        <MenuItem 
          onClick={() => setColumnsMenuAnchor(null)}
          sx={{ fontSize: '0.875rem', py: 1.5 }}
        >
          <ListItemIcon>
            <ArrowUpwardIcon className="h-4 w-4 text-neutral-400" />
          </ListItemIcon>
          <ListItemText primary="Performance View" secondary="Focus on conversion metrics" />
        </MenuItem>
        <MenuItem 
          onClick={() => setColumnsMenuAnchor(null)}
          sx={{ fontSize: '0.875rem', py: 1.5 }}
        >
          <ListItemIcon>
            <SettingsIcon className="h-4 w-4 text-neutral-400" />
          </ListItemIcon>
          <ListItemText primary="Custom View" secondary="Configure your own columns" />
        </MenuItem>
      </Menu>

      {/* Breakdown Menu */}
      <Menu
        anchorEl={breakdownMenuAnchor}
        open={Boolean(breakdownMenuAnchor)}
        onClose={() => setBreakdownMenuAnchor(null)}
        PaperProps={{
          sx: {
            mt: 1,
            minWidth: 200,
            boxShadow: '0 4px 6px -1px rgba(0, 0, 0, 0.1), 0 2px 4px -1px rgba(0, 0, 0, 0.06)',
          },
        }}
      >
        <MenuItem 
          onClick={() => setBreakdownMenuAnchor(null)}
          sx={{ fontSize: '0.875rem', py: 1.5 }}
        >
          <ListItemIcon>
            <TableChartIcon className="h-4 w-4 text-neutral-400" />
          </ListItemIcon>
          <ListItemText primary="No Breakdown" secondary="View all submissions together" />
        </MenuItem>
        <MenuItem 
          onClick={() => setBreakdownMenuAnchor(null)}
          sx={{ fontSize: '0.875rem', py: 1.5 }}
        >
          <ListItemIcon>
            <EventIcon className="h-4 w-4 text-neutral-400" />
          </ListItemIcon>
          <ListItemText primary="Breakdown by Time" secondary="Group by day, week, or month" />
        </MenuItem>
        <MenuItem 
          onClick={() => setBreakdownMenuAnchor(null)}
          sx={{ fontSize: '0.875rem', py: 1.5 }}
        >
          <ListItemIcon>
            <FilterListIcon className="h-4 w-4 text-neutral-400" />
          </ListItemIcon>
          <ListItemText primary="Breakdown by Location" secondary="Group by label or region" />
        </MenuItem>
      </Menu>

    </Box>
  );
}
