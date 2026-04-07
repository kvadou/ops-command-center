
import React, { useEffect, useMemo, useState } from "react";
import ConfirmationModal from '../../components/ConfirmationModal';
import {
  AppBar,
  Alert,
  Box,
  Button,
  CircularProgress,
  Dialog,
  DialogActions,
  DialogContent,
  DialogTitle,
  IconButton,
  InputAdornment,
  LinearProgress,
  Paper,
  Snackbar,
  Stack,
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TableRow,
  TextField,
  Toolbar,
  Tooltip,
  Typography,
} from "@mui/material";
import { PencilSquareIcon, TrashIcon, PlusIcon, MagnifyingGlassIcon, ArrowPathIcon, XMarkIcon } from '@heroicons/react/24/outline';
import axios from "axios";

export default function LocationsManager() {
  const [locations, setLocations] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [query, setQuery] = useState("");

  // Dialog state
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editing, setEditing] = useState(null); // null=create
  const [name, setName] = useState("");

  const [snack, setSnack] = useState({ open: false, severity: "success", msg: "" });
  const [confirmState, setConfirmState] = useState({ isOpen: false, action: null, title: '', message: '' });

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return locations;
    return locations.filter((l) => l.name?.toLowerCase().includes(q));
  }, [locations, query]);

  const fetchLocations = async () => {
    setLoading(true);
    setError("");
    try {
      const { data } = await axios.get("/api/locations");
      setLocations(Array.isArray(data) ? data : []);
    } catch (e) {
      setError(e?.response?.data?.message || e?.message || "Failed to load locations");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { fetchLocations(); }, []);

  const openCreate = () => {
    setEditing(null);
    setName("");
    setDialogOpen(true);
  };
  const openEdit = (loc) => {
    setEditing(loc);
    setName(loc.name || "");
    setDialogOpen(true);
  };
  const closeDialog = () => setDialogOpen(false);

  const handleSave = async () => {
    const trimmed = name.trim();
    if (!trimmed) {
      setSnack({ open: true, severity: "warning", msg: "Please enter a location name" });
      return;
    }
    
    const exists = locations.some((l) => l.name?.toLowerCase() === trimmed.toLowerCase() && l.id !== editing?.id);
    if (exists) {
      setSnack({ open: true, severity: "warning", msg: "That location already exists" });
      return;
    }

    try {
      if (editing) {
        await axios.put(`/api/locations/${editing.id}`, { name: trimmed, color: "#000000" });
        setSnack({ open: true, severity: "success", msg: "Location updated" });
      } else {
        await axios.post(`/api/locations`, { name: trimmed, color: "#000000" });
        setSnack({ open: true, severity: "success", msg: "Location added" });
      }
      closeDialog();
      fetchLocations();
    } catch (e) {
      setSnack({ open: true, severity: "error", msg: e?.response?.data?.message || "Something went wrong" });
    }
  };

  const handleDelete = (loc) => {
    setConfirmState({
      isOpen: true,
      title: 'Delete Location',
      message: `Delete "${loc.name}"? This cannot be undone.`,
      action: async () => {
        try {
          await axios.delete(`/api/locations/${loc.id}`);
          setSnack({ open: true, severity: "success", msg: "Location deleted" });
          fetchLocations();
        } catch (e) {
          setSnack({ open: true, severity: "error", msg: e?.response?.data?.message || "Delete failed" });
        }
      },
    });
  };

  return (
    <Box>
      {}
      <AppBar position="static" color="transparent" elevation={0} sx={{ mb: 2 }}>
        <Toolbar disableGutters sx={{ gap: 1, justifyContent: "space-between" }}>
          <Typography variant="h6" fontWeight={700}>Locations</Typography>
          <Stack direction={{ xs: "column", sm: "row" }} spacing={1} alignItems={{ xs: "stretch", sm: "center" }}>
            <TextField
              size="small"
              placeholder="Search locations"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              InputProps={{
                startAdornment: (
                  <InputAdornment position="start"><MagnifyingGlassIcon className="h-4 w-4" /></InputAdornment>
                ),
              }}
            />
            <Tooltip title="Refresh">
              <IconButton onClick={fetchLocations}><ArrowPathIcon className="h-5 w-5" /></IconButton>
            </Tooltip>
            <Button variant="contained" startIcon={<PlusIcon className="h-5 w-5" />} onClick={openCreate}>Add Location</Button>
          </Stack>
        </Toolbar>
        {loading && <LinearProgress />}
      </AppBar>

      {error && <Alert severity="error" sx={{ mb: 2 }}>{error}</Alert>}

      {}
      <TableContainer component={Paper}>
        <Table size="small">
          <TableHead>
            <TableRow>
              <TableCell>Name</TableCell>
              <TableCell align="right">Actions</TableCell>
            </TableRow>
          </TableHead>
          <TableBody>
            {filtered.map((l) => (
              <TableRow key={l.id} hover>
                <TableCell>
                  <Typography fontWeight={600}>{l.name}</Typography>
                </TableCell>
                <TableCell align="right">
                  <Tooltip title="Edit">
                    <IconButton onClick={() => openEdit(l)}><PencilSquareIcon className="h-5 w-5" /></IconButton>
                  </Tooltip>
                  <Tooltip title="Delete">
                    <IconButton onClick={() => handleDelete(l)}><TrashIcon className="h-5 w-5" /></IconButton>
                  </Tooltip>
                </TableCell>
              </TableRow>
            ))}

            {!loading && filtered.length === 0 && (
              <TableRow>
                <TableCell colSpan={2} align="center">
                  <Stack alignItems="center" spacing={1} sx={{ py: 6 }}>
                    <Typography variant="body1">No locations found</Typography>
                    <Button variant="outlined" onClick={openCreate} startIcon={<PlusIcon className="h-5 w-5" />}>Create your first location</Button>
                  </Stack>
                </TableCell>
              </TableRow>
            )}

            {loading && (
              <TableRow>
                <TableCell colSpan={2} align="center">
                  <Stack alignItems="center" spacing={1} sx={{ py: 4 }}>
                    <CircularProgress size={24} />
                    <Typography variant="body2" color="text.secondary">Loading…</Typography>
                  </Stack>
                </TableCell>
              </TableRow>
            )}
          </TableBody>
        </Table>
      </TableContainer>

      {}
      <Dialog open={dialogOpen} onClose={closeDialog} fullWidth maxWidth="sm">
        <DialogTitle>{editing ? `Edit “${editing.name}”` : "Add Location"}</DialogTitle>
        <DialogContent dividers>
          <Stack spacing={2}>
            <TextField
              label="Location name"
              value={name}
              onChange={(e) => setName(e.target.value)}
              autoFocus
              fullWidth
            />
          </Stack>
        </DialogContent>
        <DialogActions>
          <Button startIcon={<XMarkIcon className="h-5 w-5" />} onClick={closeDialog}>Cancel</Button>
          <Button variant="contained" onClick={handleSave}>Save</Button>
        </DialogActions>
      </Dialog>

      {}
      <Snackbar
        open={snack.open}
        autoHideDuration={3000}
        onClose={() => setSnack((s) => ({ ...s, open: false }))}
        anchorOrigin={{ vertical: "bottom", horizontal: "center" }}
      >
        <Alert onClose={() => setSnack((s) => ({ ...s, open: false }))} severity={snack.severity} variant="filled">
          {snack.msg}
        </Alert>
      </Snackbar>
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
