
import React, { useEffect, useMemo, useState } from "react";
import ConfirmationModal from '../../components/ConfirmationModal';
import {
  AppBar,
  Box,
  Button,
  Chip,
  CircularProgress,
  Dialog,
  DialogActions,
  DialogContent,
  DialogTitle,
  Divider,
  IconButton,
  InputAdornment,
  LinearProgress,
  Paper,
  Popover,
  Snackbar,
  Alert,
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
import { HexColorPicker } from "react-colorful";
import { PencilSquareIcon, TrashIcon, PlusIcon, MagnifyingGlassIcon, ArrowPathIcon, XMarkIcon } from '@heroicons/react/24/outline';
import axios from "axios";



const isValidHex = (v) => /^#([0-9A-Fa-f]{6})$/.test(v?.trim());
const contrastText = (hex) => {
  try {
    const c = hex.replace('#','');
    const r = parseInt(c.substr(0,2),16);
    const g = parseInt(c.substr(2,2),16);
    const b = parseInt(c.substr(4,2),16);
    // luminance (WCAG-ish)
    const yiq = (r*299 + g*587 + b*114)/1000;
    return yiq >= 150 ? '#111' : '#fff';
  } catch { return '#111'; }
};

const DEFAULT_SWATCHES = [
  "#0ea5e9","#22c55e","#ef4444","#f59e0b","#a78bfa","#14b8a6","#f43f5e","#65a30d",
  "#3b82f6","#10b981","#f97316","#e11d48","#06b6d4","#84cc16","#7c3aed","#f59e0b"
];


export default function SubjectsManager() {
  const [groups, setGroups] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  const [query, setQuery] = useState("");

  // Create / Edit dialog state
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editing, setEditing] = useState(null); // null=create, object=edit
  const [name, setName] = useState("");
  const [color, setColor] = useState("#3b82f6");

  const [anchorEl, setAnchorEl] = useState(null); 

  const [snack, setSnack] = useState({ open: false, severity: 'success', msg: '' });
  const [confirmState, setConfirmState] = useState({ isOpen: false, action: null, title: '', message: '' });

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return groups;
    return groups.filter(g =>
      g.name?.toLowerCase().includes(q) || g.color?.toLowerCase().includes(q)
    );
  }, [groups, query]);

  const fetchGroups = async () => {
    setLoading(true);
    setError("");
    try {
      const { data } = await axios.get("/api/colour-groups");
      setGroups(Array.isArray(data) ? data : []);
    } catch (e) {
      setError(e?.response?.data?.message || e?.message || "Failed to load subjects");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { fetchGroups(); }, []);

  // —— Dialog helpers ——
  const openCreate = () => {
    setEditing(null);
    setName("");
    setColor("#3b82f6");
    setDialogOpen(true);
  };
  const openEdit = (g) => {
    setEditing(g);
    setName(g.name || "");
    setColor(g.color || "#3b82f6");
    setDialogOpen(true);
  };
  const closeDialog = () => {
    setDialogOpen(false);
    setAnchorEl(null);
  };

  const handleSave = async () => {
    if (!name.trim()) {
      setSnack({ open: true, severity: 'warning', msg: 'Please enter a subject name' });
      return;
    }
    if (!isValidHex(color)) {
      setSnack({ open: true, severity: 'warning', msg: 'Please enter a valid HEX color like #1A2B3C' });
      return;
    }

    try {
      if (editing) {
        await axios.put(`/api/colour-groups/${editing.id}`, { name: name.trim(), color });
        setSnack({ open: true, severity: 'success', msg: 'Subject updated' });
      } else {
        await axios.post(`/api/colour-groups`, { name: name.trim(), color });
        setSnack({ open: true, severity: 'success', msg: 'Subject added' });
      }
      closeDialog();
      fetchGroups();
    } catch (e) {
      setSnack({ open: true, severity: 'error', msg: e?.response?.data?.message || 'Something went wrong' });
    }
  };

  const handleDelete = (g) => {
    setConfirmState({
      isOpen: true,
      title: 'Delete Subject',
      message: `Delete "${g.name}"? This cannot be undone.`,
      action: async () => {
        try {
          await axios.delete(`/api/colour-groups/${g.id}`);
          setSnack({ open: true, severity: 'success', msg: 'Subject deleted' });
          fetchGroups();
        } catch (e) {
          setSnack({ open: true, severity: 'error', msg: e?.response?.data?.message || 'Delete failed' });
        }
      },
    });
  };

  
  return (
    <Box>
      {}
      <AppBar position="static" color="transparent" elevation={0} sx={{ mb: 2 }}>
        <Toolbar disableGutters sx={{ gap: 1, justifyContent: 'space-between' }}>
          <Typography variant="h6" fontWeight={700}>Subjects</Typography>
          <Stack direction={{ xs: 'column', sm: 'row' }} spacing={1} alignItems={{ xs: 'stretch', sm: 'center' }}>
            <TextField
              size="small"
              placeholder="Search by name or color"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              InputProps={{ startAdornment: (
                <InputAdornment position="start"><MagnifyingGlassIcon className="h-4 w-4" /></InputAdornment>
              )}}
            />
            <Tooltip title="Refresh">
              <IconButton onClick={fetchGroups}><ArrowPathIcon className="h-5 w-5" /></IconButton>
            </Tooltip>
            <Button variant="contained" startIcon={<PlusIcon className="h-5 w-5" />} onClick={openCreate}>
              Add Subject
            </Button>
          </Stack>
        </Toolbar>
        {loading && <LinearProgress />}
      </AppBar>

      {error && (
        <Alert severity="error" sx={{ mb: 2 }}>{error}</Alert>
      )}

      {}
      <TableContainer component={Paper}>
        <Table size="small">
          <TableHead>
            <TableRow>
              <TableCell width={56}>Color</TableCell>
              <TableCell>Name</TableCell>
              <TableCell>HEX</TableCell>
              <TableCell align="right">Actions</TableCell>
            </TableRow>
          </TableHead>
          <TableBody>
            {filtered.map((g) => (
              <TableRow key={g.id} hover>
                <TableCell>
                  <Chip
                    size="small"
                    label=" "
                    sx={{
                      width: 28,
                      height: 24,
                      borderRadius: 1,
                      bgcolor: g.color,
                      color: contrastText(g.color || '#000'),
                    }}
                  />
                </TableCell>
                <TableCell>
                  <Typography fontWeight={600}>{g.name}</Typography>
                </TableCell>
                <TableCell>
                  <Typography variant="body2" sx={{ fontFamily: 'ui-monospace, SFMono-Regular, Menlo, monospace' }}>
                    {g.color}
                  </Typography>
                </TableCell>
                <TableCell align="right">
                  <Tooltip title="Edit">
                    <IconButton onClick={() => openEdit(g)}><PencilSquareIcon className="h-5 w-5" /></IconButton>
                  </Tooltip>
                  <Tooltip title="Delete">
                    <IconButton onClick={() => handleDelete(g)}><TrashIcon className="h-5 w-5" /></IconButton>
                  </Tooltip>
                </TableCell>
              </TableRow>
            ))}

            {!loading && filtered.length === 0 && (
              <TableRow>
                <TableCell colSpan={4} align="center">
                  <Stack alignItems="center" spacing={1} sx={{ py: 6 }}>
                    <Typography variant="body1">No subjects found</Typography>
                    <Button variant="outlined" onClick={openCreate} startIcon={<PlusIcon className="h-5 w-5" />}>Create your first subject</Button>
                  </Stack>
                </TableCell>
              </TableRow>
            )}

            {loading && (
              <TableRow>
                <TableCell colSpan={4} align="center">
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
        <DialogTitle>
          {editing ? `Edit “${editing.name}”` : 'Add Subject'}
        </DialogTitle>
        <DialogContent dividers>
          <Stack spacing={2}>
            <TextField
              label="Subject name"
              value={name}
              onChange={(e) => setName(e.target.value)}
              autoFocus
              fullWidth
            />

            <Stack direction="row" spacing={2} alignItems="center">
              <TextField
                label="HEX color"
                value={color}
                onChange={(e) => setColor(e.target.value)}
                error={!!color && !isValidHex(color)}
                helperText={!color || isValidHex(color) ? ' ' : 'Use format #RRGGBB'}
                sx={{ flex: 1 }}
                InputProps={{
                  endAdornment: (
                    <InputAdornment position="end">
                      <Chip
                        label={isValidHex(color) ? color.toUpperCase() : 'Pick'}
                        onClick={(e) => setAnchorEl(e.currentTarget)}
                        sx={{ bgcolor: isValidHex(color) ? color : '#e5e7eb', color: contrastText(color), cursor: 'pointer' }}
                      />
                    </InputAdornment>
                  )
                }}
              />
            </Stack>

            {}
            <Stack direction="row" spacing={1} flexWrap="wrap">
              {DEFAULT_SWATCHES.map((c) => (
                <Chip key={c} size="small" label=" " onClick={() => setColor(c)} sx={{ bgcolor: c, width: 24, height: 24 }} />
              ))}
            </Stack>

            <Divider />
            <Typography variant="overline" color="text.secondary">Preview</Typography>
            <Stack direction="row" spacing={1} alignItems="center">
              <Chip label={name || 'Subject'} sx={{ bgcolor: isValidHex(color) ? color : '#e5e7eb', color: contrastText(color) }} />
            </Stack>
          </Stack>
        </DialogContent>
        <DialogActions>
          <Button startIcon={<XMarkIcon className="h-5 w-5" />} onClick={closeDialog}>Cancel</Button>
          <Button variant="contained" onClick={handleSave}>Save</Button>
        </DialogActions>
      </Dialog>

      {}
      <Popover
        open={Boolean(anchorEl)}
        anchorEl={anchorEl}
        onClose={() => setAnchorEl(null)}
        anchorOrigin={{ vertical: 'bottom', horizontal: 'right' }}
        transformOrigin={{ vertical: 'top', horizontal: 'right' }}
        PaperProps={{ sx: { p: 2 } }}
      >
        <HexColorPicker color={isValidHex(color) ? color : '#3b82f6'} onChange={setColor} />
      </Popover>

      {}
      <Snackbar
        open={snack.open}
        autoHideDuration={3000}
        onClose={() => setSnack((s) => ({ ...s, open: false }))}
        anchorOrigin={{ vertical: 'bottom', horizontal: 'center' }}
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
