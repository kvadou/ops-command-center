import React, { useState, useEffect } from "react";
import ConfirmationModal from './ConfirmationModal';
import AlertDialog from './ui/AlertDialog';
import { useToast } from '../hooks/useToast';
import { DataGrid } from "@mui/x-data-grid";
import {
  Dialog,
  DialogActions,
  DialogContent,
  DialogTitle,
  Button,
  TextField,
  MenuItem,
  Box,
  Card,
  CardContent,
  Typography,
  Chip,
  Avatar,
  IconButton,
  Tooltip,
  Paper,
  InputAdornment,
  Grid,
  Alert,
  Stack,
  FormControl,
  FormLabel,
  FormGroup,
  FormControlLabel,
  Checkbox,
} from "@mui/material";
import {
  UserIcon,
  EnvelopeIcon,
  ShieldCheckIcon,
  GlobeAltIcon,
  PencilSquareIcon,
  TrashIcon,
  KeyIcon,
  PlusIcon,
  MagnifyingGlassIcon,
  MapPinIcon,
  ShieldExclamationIcon,
  CloudIcon,
  BuildingOfficeIcon,
  CheckCircleIcon,
  XCircleIcon,
} from "@heroicons/react/24/outline";
import axios from "axios";

const OWNER_USER_ID = 71;

// Function to determine market access from user preferences or email
const getMarketAccess = (user) => {
  // Support both user object and email string for backward compatibility
  const email = typeof user === 'string' ? user : user?.email;
  const preferences = typeof user === 'object' ? user?.preferences : null;
  
  if (!email) return { markets: [], type: 'unknown' };
  
  // First, check if market access is explicitly set in preferences
  if (preferences?.marketAccess && Array.isArray(preferences.marketAccess) && preferences.marketAccess.length > 0) {
    const markets = preferences.marketAccess;
    const type = markets.length === 3 && markets.includes('Production') && markets.includes('Eastside') && markets.includes('Westside')
      ? 'production'
      : 'restricted';
    return { markets, type };
  }
  
  // Fallback to email pattern detection
  const lowerEmail = email.toLowerCase();
  const emailParts = lowerEmail.split('@');
  const emailLocal = emailParts[0] || '';
  const emailDomain = emailParts[1] || '';
  
  const markets = [];
  let type = 'production'; // Default: can access all markets
  
  // Check for Eastside
  if (emailLocal === 'eastside' || emailDomain.includes('eastside')) {
    markets.push('Eastside');
    type = 'restricted';
  }
  
  // Check for Westside
  if (emailLocal === 'westside' || emailDomain.includes('westside')) {
    markets.push('Westside');
    type = 'restricted';
  }
  
  // If no restrictions found, user has access to all markets (production)
  if (markets.length === 0) {
    markets.push('Production', 'Eastside', 'Westside');
    type = 'production';
  }
  
  return { markets, type };
};

// Market color mapping
const marketColors = {
  Production: { bg: '#e3f2fd', color: '#1976d2', icon: CloudIcon },
  Eastside: { bg: '#fff3e0', color: '#f57c00', icon: MapPinIcon },
  Westside: { bg: '#f3e5f5', color: '#7b1fa2', icon: BuildingOfficeIcon },
};

export default function UserManagement() {
  const toast = useToast();
  const [users, setUsers] = useState([]);
  const [confirmState, setConfirmState] = useState({ isOpen: false, action: null, title: '', message: '' });
  const [alertState, setAlertState] = useState({ isOpen: false, title: '', message: '' });
  const [filteredUsers, setFilteredUsers] = useState([]);
  const [formData, setFormData] = useState({
    firstName: "",
    lastName: "",
    email: "",
    role: "user",
    password: "",
    marketAccess: [],
  });
  const [open, setOpen] = useState(false);
  const [editingUserId, setEditingUserId] = useState(null);
  const [loading, setLoading] = useState(false);
  const [searchTerm, setSearchTerm] = useState("");
  const [roleFilter, setRoleFilter] = useState("all");
  const [marketFilter, setMarketFilter] = useState("all");

  useEffect(() => {
    fetchUsers();
  }, []);

  useEffect(() => {
    filterUsers();
  }, [users, searchTerm, roleFilter, marketFilter]);

  const filterUsers = () => {
    // Ensure users is always an array
    const usersArray = Array.isArray(users) ? users : [];
    let filtered = [...usersArray];

    // Search filter
    if (searchTerm) {
      const searchLower = searchTerm.toLowerCase();
      filtered = filtered.filter(
        (user) =>
          user.first_name?.toLowerCase().includes(searchLower) ||
          user.last_name?.toLowerCase().includes(searchLower) ||
          user.email?.toLowerCase().includes(searchLower)
      );
    }

    // Role filter
    if (roleFilter !== "all") {
      filtered = filtered.filter((user) => user.role === roleFilter);
    }

    // Market filter
    if (marketFilter !== "all") {
      filtered = filtered.filter((user) => {
        const { markets } = getMarketAccess(user);
        return markets.includes(marketFilter);
      });
    }

    setFilteredUsers(filtered);
  };

  const fetchUsers = async () => {
    setLoading(true);
    try {
      const response = await axios.get("/api/users");
      // Handle paginated response (data.data) or direct array (data)
      const usersData = response.data?.data || response.data || [];
      const usersArray = Array.isArray(usersData) ? usersData : [];
      setUsers(usersArray);
      setFilteredUsers(usersArray);
    } catch (error) {
      console.error("Error fetching users:", error);
      // If unauthorized, clear token and redirect to login
      if (error.response?.status === 401) {
        localStorage.removeItem("token");
        window.location.href = "/";
      }
    } finally {
      setLoading(false);
    }
  };

  const handleOpen = (user = null) => {
    if (user) {
      // Get market access from preferences or fallback to email pattern
      const { markets } = getMarketAccess(user);
      setFormData({
        firstName: user.first_name,
        lastName: user.last_name,
        email: user.email,
        role: user.role,
        password: "",
        marketAccess: markets,
      });
      setEditingUserId(user.id);
    } else {
      setFormData({
        firstName: "",
        lastName: "",
        email: "",
        role: "user",
        password: "",
        marketAccess: [],
      });
      setEditingUserId(null);
    }
    setOpen(true);
  };

  const handleClose = () => {
    setOpen(false);
    setFormData({
      firstName: "",
      lastName: "",
      email: "",
      role: "user",
      password: "",
      marketAccess: [],
    });
    setEditingUserId(null);
  };

  const handleFormSubmit = async (e) => {
    e.preventDefault();
    
    // Validate market access
    if (!formData.marketAccess || formData.marketAccess.length === 0) {
      toast.error("Please select at least one market for this user.");
      return;
    }
    
    const url = editingUserId
      ? `/api/users/${editingUserId}`
      : "/api/users";
    const method = editingUserId ? "PUT" : "POST";

    const payload = {
      first_name: formData.firstName,
      last_name: formData.lastName,
      email: formData.email,
      role: formData.role,
      ...(formData.password && { password: formData.password }),
      marketAccess: formData.marketAccess,
    };

    try {
      await axios({
        method,
        url,
        data: payload,
      });
      fetchUsers();
      handleClose();
    } catch (error) {
      if (error.response) {
        console.error("Error saving user:", error.response.data);
        toast.error(error.response.data.msg || error.response.data.error || "Failed to save user");
      } else if (error.request) {
        console.error("No response received:", error.request);
        toast.error("No response from server. Please try again.");
      } else {
        console.error("Error", error.message);
        toast.error(error.message);
      }
    }
  };

  const handleDelete = (id) => {
    setConfirmState({
      isOpen: true,
      title: 'Delete User',
      message: 'Are you sure you want to delete this user?',
      action: async () => {
        try {
          await axios.delete(`/api/users/${id}`);
          fetchUsers();
        } catch (error) {
          console.error("Error deleting user:", error);
          setAlertState({ isOpen: true, title: 'Error', message: `Error deleting user: ${error.response?.data?.msg || error.message}` });
        }
      },
    });
  };

  const [resetPasswordDialog, setResetPasswordDialog] = useState(false);
  const [resetPasswordData, setResetPasswordData] = useState({
    userId: null,
    userName: "",
    newPassword: "",
    confirmPassword: "",
  });

  const handleOpenResetPassword = (user) => {
    setResetPasswordData({
      userId: user.id,
      userName: `${user.first_name} ${user.last_name} (${user.email})`,
      newPassword: "",
      confirmPassword: "",
    });
    setResetPasswordDialog(true);
  };

  const handleCloseResetPassword = () => {
    setResetPasswordDialog(false);
    setResetPasswordData({
      userId: null,
      userName: "",
      newPassword: "",
      confirmPassword: "",
    });
  };

  const handleResetPassword = async () => {
    if (resetPasswordData.newPassword !== resetPasswordData.confirmPassword) {
      toast.error("Passwords do not match!");
      return;
    }

    if (resetPasswordData.newPassword.length < 6) {
      toast.error("Password must be at least 6 characters!");
      return;
    }

    try {
      await axios.patch(
        `/api/users/${resetPasswordData.userId}/reset-password`,
        { password: resetPasswordData.newPassword }
      );
      toast.success("Password reset successfully!");
      handleCloseResetPassword();
      fetchUsers();
    } catch (error) {
      console.error("Error resetting password:", error);
      if (error.response) {
        toast.error(error.response.data.msg || error.response.data.error || "Failed to reset password");
      } else {
        toast.error("Failed to reset password");
      }
    }
  };

  const handleToggleAppAccess = async (userId, app, currentValue) => {
    const newValue = !currentValue;
    try {
      const response = await axios.patch(
        `/api/users/${userId}/app-access`,
        { app, enabled: newValue }
      );
      // Update local state
      setUsers(prev => prev.map(u => u.id === userId ? { ...u, app_access: response.data.app_access } : u));
      toast.success(`${app} access ${newValue ? 'granted' : 'revoked'}`);
    } catch (error) {
      toast.error(error.response?.data?.msg || 'Failed to update access');
    }
  };

  // Ensure users is always an array for statistics
  const usersArray = Array.isArray(users) ? users : [];
  
  // Calculate statistics
  const stats = {
    total: usersArray.length,
    admins: usersArray.filter((u) => u.role === "admin").length,
    users: usersArray.filter((u) => u.role === "user").length,
    production: usersArray.filter((u) => getMarketAccess(u).type === "production").length,
    restricted: usersArray.filter((u) => getMarketAccess(u).type === "restricted").length,
  };

  const columns = [
    {
      field: "name",
      headerName: "Name",
      flex: 1.2,
      renderCell: (params) => {
        const { markets, type } = getMarketAccess(params.row);
        const isRestricted = type === "restricted";
        return (
          <Box sx={{ display: "flex", alignItems: "center", gap: 1.5, py: 1 }}>
            <Avatar
              sx={{
                bgcolor: isRestricted ? "#f57c00" : "#1976d2",
                width: 45,
                height: 45,
              }}
            >
              {params.row.first_name?.[0]?.toUpperCase() || "U"}
            </Avatar>
            <Box sx={{ display: "flex", flexDirection: "column", gap: 0.5 }}>
              <Typography variant="body2" fontWeight="medium" lineHeight={1.3}>
                {params.row.first_name} {params.row.last_name}
              </Typography>
              <Typography variant="caption" color="text.secondary" lineHeight={1.3}>
                {params.row.email}
              </Typography>
            </Box>
          </Box>
        );
      },
    },
    {
      field: "role",
      headerName: "Role",
      width: 120,
      renderCell: (params) => {
        const isAdmin = params.row.role === "admin";
        return (
          <Chip
            icon={isAdmin ? <ShieldExclamationIcon className="h-5 w-5" /> : <UserIcon className="h-5 w-5" />}
            label={params.row.role?.toUpperCase() || "USER"}
            color={isAdmin ? "primary" : "default"}
            size="small"
            variant={isAdmin ? "filled" : "outlined"}
          />
        );
      },
    },
    ...['main', 'staging', 'westside', 'eastside'].map(app => ({
      field: `app_${app}`,
      headerName: app.charAt(0).toUpperCase() + app.slice(1),
      width: 100,
      align: 'center',
      headerAlign: 'center',
      sortable: false,
      renderCell: (params) => {
        const appAccess = params.row.app_access || {};
        const hasAccess = appAccess[app] !== false; // default true for existing users
        const isOwner = params.row.id === OWNER_USER_ID;
        return (
          <Checkbox
            checked={hasAccess}
            disabled={isOwner}
            onChange={() => handleToggleAppAccess(params.row.id, app, hasAccess)}
            sx={{
              color: hasAccess ? '#34B256' : '#ccc',
              '&.Mui-checked': { color: '#34B256' },
              '&.Mui-disabled': { color: hasAccess ? '#34B256' : '#ccc', opacity: 0.6 },
            }}
          />
        );
      },
    })),
    {
      field: "actions",
      headerName: "Actions",
      width: 300,
      sortable: false,
      renderCell: (params) => (
        <Box sx={{ display: "flex", gap: 1 }}>
          <Tooltip title="Edit User">
            <IconButton
              size="small"
              color="primary"
              onClick={() => handleOpen(params.row)}
            >
              <PencilSquareIcon className="h-5 w-5" />
            </IconButton>
          </Tooltip>
          <Tooltip title="Reset Password">
            <IconButton
              size="small"
              color="warning"
              onClick={() => handleOpenResetPassword(params.row)}
            >
              <KeyIcon className="h-5 w-5" />
            </IconButton>
          </Tooltip>
          <Tooltip title="Delete User">
            <IconButton
              size="small"
              color="error"
              onClick={() => handleDelete(params.row.id)}
            >
              <TrashIcon className="h-5 w-5" />
            </IconButton>
          </Tooltip>
        </Box>
      ),
    },
  ];

  return (
    <Box sx={{ p: 3 }}>
      {/* Header Section */}
      <Box sx={{ mb: 3, display: "flex", justifyContent: "flex-end", alignItems: "center" }}>
        <Button
          variant="contained"
          startIcon={<PlusIcon className="h-5 w-5" />}
          onClick={() => handleOpen()}
          sx={{ borderRadius: 2 }}
        >
          Add User
        </Button>
      </Box>

      {/* Statistics Cards */}
      <Grid container spacing={2} sx={{ mb: 3 }}>
        <Grid item xs={12} sm={6} md={2.4}>
          <Card sx={{ height: "100%" }}>
            <CardContent>
              <Typography variant="caption" color="text.secondary" gutterBottom>
                Total Users
              </Typography>
              <Typography variant="h5" fontWeight="bold">
                {stats.total}
              </Typography>
            </CardContent>
          </Card>
        </Grid>
        <Grid item xs={12} sm={6} md={2.4}>
          <Card sx={{ height: "100%" }}>
            <CardContent>
              <Typography variant="caption" color="text.secondary" gutterBottom>
                Admins
              </Typography>
              <Typography variant="h5" fontWeight="bold" color="primary">
                {stats.admins}
              </Typography>
            </CardContent>
          </Card>
        </Grid>
        <Grid item xs={12} sm={6} md={2.4}>
          <Card sx={{ height: "100%" }}>
            <CardContent>
              <Typography variant="caption" color="text.secondary" gutterBottom>
                Regular Users
              </Typography>
              <Typography variant="h5" fontWeight="bold">
                {stats.users}
              </Typography>
            </CardContent>
          </Card>
        </Grid>
        <Grid item xs={12} sm={6} md={2.4}>
          <Card sx={{ height: "100%", bgcolor: "#e8f5e9" }}>
            <CardContent>
              <Typography variant="caption" color="text.secondary" gutterBottom>
                Full Access
              </Typography>
              <Typography variant="h5" fontWeight="bold" color="success.main">
                {stats.production}
              </Typography>
            </CardContent>
          </Card>
        </Grid>
        <Grid item xs={12} sm={6} md={2.4}>
          <Card sx={{ height: "100%", bgcolor: "#fff3e0" }}>
            <CardContent>
              <Typography variant="caption" color="text.secondary" gutterBottom>
                Restricted Access
              </Typography>
              <Typography variant="h5" fontWeight="bold" color="warning.main">
                {stats.restricted}
              </Typography>
            </CardContent>
          </Card>
        </Grid>
      </Grid>

      {/* Filters */}
      <Paper sx={{ p: 2, mb: 2 }}>
        <Grid container spacing={2} alignItems="center">
          <Grid item xs={12} md={4}>
            <TextField
              fullWidth
              size="small"
              placeholder="Search users..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              InputProps={{
                startAdornment: (
                  <InputAdornment position="start">
                    <MagnifyingGlassIcon className="h-5 w-5" />
                  </InputAdornment>
                ),
              }}
            />
          </Grid>
          <Grid item xs={12} md={4}>
            <TextField
              fullWidth
              size="small"
              select
              label="Filter by Role"
              value={roleFilter}
              onChange={(e) => setRoleFilter(e.target.value)}
            >
              <MenuItem value="all">All Roles</MenuItem>
              <MenuItem value="admin">Admin</MenuItem>
              <MenuItem value="user">User</MenuItem>
            </TextField>
          </Grid>
          <Grid item xs={12} md={4}>
            <TextField
              fullWidth
              size="small"
              select
              label="Filter by Market"
              value={marketFilter}
              onChange={(e) => setMarketFilter(e.target.value)}
            >
              <MenuItem value="all">All Markets</MenuItem>
              <MenuItem value="Production">Production</MenuItem>
              <MenuItem value="Eastside">Eastside</MenuItem>
              <MenuItem value="Westside">Westside</MenuItem>
            </TextField>
          </Grid>
        </Grid>
      </Paper>

      {/* Data Grid */}
      <Paper sx={{ height: 700, width: "100%" }}>
        <DataGrid
          rows={filteredUsers}
          columns={columns}
          pageSize={25}
          rowsPerPageOptions={[10, 25, 50, 100]}
          loading={loading}
          getRowId={(row) => row.id}
          disableSelectionOnClick
          sx={{
            border: 0,
            "& .MuiDataGrid-row": {
              minHeight: "80px !important",
              maxHeight: "none !important",
              "&:hover": {
                bgcolor: "#f5f5f5",
              },
            },
            "& .MuiDataGrid-cell": {
              borderBottom: "1px solid #f0f0f0",
              py: 2,
              display: "flex",
              alignItems: "center",
            },
            "& .MuiDataGrid-columnHeaders": {
              bgcolor: "#f5f5f5",
              borderBottom: "2px solid #e0e0e0",
              minHeight: "60px !important",
            },
            "& .MuiDataGrid-columnHeader": {
              py: 1.5,
            },
          }}
          getRowHeight={() => "auto"}
          getEstimatedRowHeight={() => 80}
        />
      </Paper>

      {/* Add/Edit User Dialog */}
      <Dialog open={open} onClose={handleClose} maxWidth="sm" fullWidth disableScrollLock={true}>
        <DialogTitle>
          <Box sx={{ display: "flex", alignItems: "center", gap: 1 }}>
            <UserIcon className="h-5 w-5 text-blue-600" />
            {editingUserId ? "Edit User" : "Add New User"}
          </Box>
        </DialogTitle>
        <DialogContent>
          <form onSubmit={handleFormSubmit} style={{ marginTop: 16 }}>
            <Stack spacing={3}>
              <TextField
                label="First Name"
                value={formData.firstName}
                onChange={(e) =>
                  setFormData({ ...formData, firstName: e.target.value })
                }
                fullWidth
                required
                InputProps={{
                  startAdornment: (
                    <InputAdornment position="start">
                      <UserIcon className="h-5 w-5" />
                    </InputAdornment>
                  ),
                }}
              />
              <TextField
                label="Last Name"
                value={formData.lastName}
                onChange={(e) =>
                  setFormData({ ...formData, lastName: e.target.value })
                }
                fullWidth
                required
              />
              <TextField
                label="Email"
                type="email"
                value={formData.email}
                onChange={(e) =>
                  setFormData({ ...formData, email: e.target.value })
                }
                fullWidth
                required
                InputProps={{
                  startAdornment: (
                    <InputAdornment position="start">
                      <EnvelopeIcon className="h-5 w-5" />
                    </InputAdornment>
                  ),
                }}
              />
              <FormControl component="fieldset" fullWidth>
                <FormLabel component="legend" sx={{ mb: 1, display: "flex", alignItems: "center", gap: 1 }}>
                  <GlobeAltIcon className="h-4 w-4" />
                  Market Access *
                </FormLabel>
                <FormGroup>
                  <FormControlLabel
                    control={
                      <Checkbox
                        checked={formData.marketAccess.includes("Production")}
                        onChange={(e) => {
                          if (e.target.checked) {
                            setFormData({
                              ...formData,
                              marketAccess: [...formData.marketAccess, "Production"],
                            });
                          } else {
                            setFormData({
                              ...formData,
                              marketAccess: formData.marketAccess.filter((m) => m !== "Production"),
                            });
                          }
                        }}
                      />
                    }
                    label="Production"
                  />
                  <FormControlLabel
                    control={
                      <Checkbox
                        checked={formData.marketAccess.includes("Eastside")}
                        onChange={(e) => {
                          if (e.target.checked) {
                            setFormData({
                              ...formData,
                              marketAccess: [...formData.marketAccess, "Eastside"],
                            });
                          } else {
                            setFormData({
                              ...formData,
                              marketAccess: formData.marketAccess.filter((m) => m !== "Eastside"),
                            });
                          }
                        }}
                      />
                    }
                    label="Eastside"
                  />
                  <FormControlLabel
                    control={
                      <Checkbox
                        checked={formData.marketAccess.includes("Westside")}
                        onChange={(e) => {
                          if (e.target.checked) {
                            setFormData({
                              ...formData,
                              marketAccess: [...formData.marketAccess, "Westside"],
                            });
                          } else {
                            setFormData({
                              ...formData,
                              marketAccess: formData.marketAccess.filter((m) => m !== "Westside"),
                            });
                          }
                        }}
                      />
                    }
                    label="Westside"
                  />
                </FormGroup>
                {formData.marketAccess.length === 0 && (
                  <Typography variant="caption" color="error" sx={{ mt: 1 }}>
                    Please select at least one market
                  </Typography>
                )}
                {formData.marketAccess.length > 0 && (
                  <Box sx={{ mt: 1, display: "flex", gap: 0.5, flexWrap: "wrap" }}>
                    {formData.marketAccess.map((market) => {
                      const marketConfig = marketColors[market];
                      const Icon = marketConfig?.icon || MapPinIcon;
                      return (
                        <Chip
                          key={market}
                          icon={<Icon className="h-3.5 w-3.5" />}
                          label={market}
                          size="small"
                          sx={{
                            bgcolor: marketConfig?.bg || "#f5f5f5",
                            color: marketConfig?.color || "#333",
                            fontWeight: 500,
                          }}
                        />
                      );
                    })}
                  </Box>
                )}
              </FormControl>
              <TextField
                label="Role"
                select
                value={formData.role}
                onChange={(e) =>
                  setFormData({ ...formData, role: e.target.value })
                }
                fullWidth
                required
                InputProps={{
                  startAdornment: (
                    <InputAdornment position="start">
                      <ShieldCheckIcon className="h-5 w-5" />
                    </InputAdornment>
                  ),
                }}
              >
                <MenuItem value="user">User</MenuItem>
                <MenuItem value="admin">Admin</MenuItem>
              </TextField>
              {!editingUserId && (
                <TextField
                  label="Password"
                  type="password"
                  value={formData.password}
                  onChange={(e) =>
                    setFormData({ ...formData, password: e.target.value })
                  }
                  fullWidth
                  required
                  InputProps={{
                    startAdornment: (
                      <InputAdornment position="start">
                        <KeyIcon className="h-5 w-5" />
                      </InputAdornment>
                    ),
                  }}
                  helperText="Minimum 6 characters"
                />
              )}
            </Stack>
          </form>
        </DialogContent>
        <DialogActions sx={{ p: 2 }}>
          <Button onClick={handleClose} color="secondary">
            Cancel
          </Button>
          <Button
            onClick={handleFormSubmit}
            color="primary"
            variant="contained"
          >
            {editingUserId ? "Update User" : "Add User"}
          </Button>
        </DialogActions>
      </Dialog>

      {/* Reset Password Dialog */}
      <Dialog
        open={resetPasswordDialog}
        onClose={handleCloseResetPassword}
        maxWidth="sm"
        fullWidth
      >
        <DialogTitle>
          <Box sx={{ display: "flex", alignItems: "center", gap: 1 }}>
            <KeyIcon className="h-5 w-5 text-amber-500" />
            Reset Password
          </Box>
        </DialogTitle>
        <DialogContent>
          <Box sx={{ mb: 2 }}>
            <Typography variant="body2" color="text.secondary">
              User:
            </Typography>
            <Typography variant="body1" fontWeight="medium">
              {resetPasswordData.userName}
            </Typography>
          </Box>
          <Stack spacing={2}>
            <TextField
              label="New Password"
              type="password"
              value={resetPasswordData.newPassword}
              onChange={(e) =>
                setResetPasswordData({
                  ...resetPasswordData,
                  newPassword: e.target.value,
                })
              }
              fullWidth
              required
              InputProps={{
                startAdornment: (
                  <InputAdornment position="start">
                    <KeyIcon className="h-5 w-5" />
                  </InputAdornment>
                ),
              }}
              helperText="Minimum 6 characters"
            />
            <TextField
              label="Confirm Password"
              type="password"
              value={resetPasswordData.confirmPassword}
              onChange={(e) =>
                setResetPasswordData({
                  ...resetPasswordData,
                  confirmPassword: e.target.value,
                })
              }
              fullWidth
              required
            />
          </Stack>
        </DialogContent>
        <DialogActions sx={{ p: 2 }}>
          <Button onClick={handleCloseResetPassword} color="secondary">
            Cancel
          </Button>
          <Button
            onClick={handleResetPassword}
            color="warning"
            variant="contained"
          >
            Reset Password
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
      <AlertDialog isOpen={alertState.isOpen} onClose={() => setAlertState(s => ({ ...s, isOpen: false }))} title={alertState.title} message={alertState.message} />
    </Box>
  );
}
