import React, { useEffect, useState } from "react";
import {
  Box,
  Button,
  Alert,
  Typography,
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions,
  TextField,
  Tabs,
  Tab,
  useMediaQuery,
  useTheme,
  IconButton,
  Tooltip,
  FormControlLabel,
  Switch,
  Divider,
  Chip,
} from "@mui/material";
import { DataGrid } from "@mui/x-data-grid";
import { TrashIcon, PlusIcon } from '@heroicons/react/24/outline';
import AcademyRichTextEditor from './academy/editor/AcademyRichTextEditor';
import DOMPurify from 'dompurify';
import axios from "axios";

export default function PoliciesManager() {
  const [rows, setRows] = useState([]);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");

  // Edit/Create modal state
  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState(null);
  const [activeTab, setActiveTab] = useState(0); // 0 = Content, 1 = Form Settings, 2 = Preview

  // Delete confirmation state
  const [deleteConfirmOpen, setDeleteConfirmOpen] = useState(false);
  const [policyToDelete, setPolicyToDelete] = useState(null);
  const [deleting, setDeleting] = useState(false);

  const theme = useTheme();
  const isMobile = useMediaQuery(theme.breakpoints.down('md'));

  const fetchPolicies = async () => {
    setLoading(true);
    setError("");
    try {
      const { data } = await axios.get("/api/policies");
      const rows = (Array.isArray(data) ? data : []).map((p) => ({
        id: p.slug,
        ...p,
      }));
      setRows(rows);
    } catch (e) {
      setError(e?.response?.data?.error || e.message || "Failed to load policies");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchPolicies();
  }, []);

  // Auto-dismiss success messages
  useEffect(() => {
    if (success) {
      const timer = setTimeout(() => setSuccess(""), 3000);
      return () => clearTimeout(timer);
    }
  }, [success]);

  const columns = [
    { field: "slug", headerName: "Slug", width: 100 },
    { field: "label", headerName: "Policy Name", flex: 1, minWidth: 180 },
    {
      field: "show_on_form",
      headerName: "Visible",
      width: 80,
      renderCell: ({ row }) => (
        row.show_on_form ? (
          <Chip label="Yes" size="small" color="success" variant="outlined" />
        ) : (
          <Chip label="No" size="small" variant="outlined" />
        )
      ),
    },
    {
      field: "checkbox_group",
      headerName: "Group",
      width: 100,
      renderCell: ({ row }) => row.checkbox_group || "—",
    },
    {
      field: "preview",
      headerName: "Content Preview",
      flex: 1,
      minWidth: 200,
      sortable: false,
      valueGetter: (...args) => {
        const maybeParams = args[0];
        const maybeRowFromV6 = args[1];
        const row = maybeRowFromV6 ?? maybeParams?.row ?? {};
        const html = row.content_html || "";
        const tmp = document.createElement("div");
        tmp.innerHTML = html;
        const txt = (tmp.textContent || tmp.innerText || "").trim();
        return txt.length > 80 ? txt.slice(0, 80) + "…" : txt || "—";
      },
    },
    {
      field: "actions",
      headerName: "Actions",
      width: 130,
      sortable: false,
      renderCell: ({ row }) => (
        <Box sx={{ display: 'flex', gap: 1 }}>
          <Button
            size="small"
            onClick={() => {
              setEditing({
                slug: row.slug,
                label: row.label || "",
                content_html: row.content_html || "",
                show_on_form: row.show_on_form || false,
                checkbox_group: row.checkbox_group || "",
                checkbox_label: row.checkbox_label || "",
                link_text: row.link_text || "",
                isNew: false,
              });
              setOpen(true);
            }}
          >
            Edit
          </Button>
          <Tooltip title="Delete policy">
            <IconButton
              size="small"
              color="error"
              onClick={() => {
                setPolicyToDelete(row);
                setDeleteConfirmOpen(true);
              }}
            >
              <TrashIcon className="h-5 w-5" />
            </IconButton>
          </Tooltip>
        </Box>
      ),
    },
  ];

  const handleClose = () => {
    setOpen(false);
    setEditing(null);
    setActiveTab(0);
  };

  const handleSave = async () => {
    if (!editing) return;

    // Validation
    if (!editing.label?.trim()) {
      setError("Policy name is required");
      return;
    }
    if (editing.isNew && !editing.slug?.trim()) {
      setError("Slug is required for new policies");
      return;
    }
    if (editing.show_on_form && !editing.checkbox_group?.trim()) {
      setError("Checkbox group is required when showing on form");
      return;
    }
    if (editing.show_on_form && !editing.checkbox_label?.trim()) {
      setError("Checkbox label is required when showing on form");
      return;
    }
    if (editing.show_on_form && !editing.link_text?.trim()) {
      setError("Link text is required when showing on form");
      return;
    }

    setSaving(true);
    setError("");
    try {
      const payload = {
        label: editing.label.trim(),
        content_html: editing.content_html || "",
        show_on_form: editing.show_on_form || false,
        checkbox_group: editing.checkbox_group?.trim() || null,
        checkbox_label: editing.checkbox_label?.trim() || null,
        link_text: editing.link_text?.trim() || null,
      };

      if (editing.isNew) {
        await axios.post("/api/policies", {
          slug: editing.slug.trim().toLowerCase(),
          ...payload,
        });
        setSuccess("Policy created successfully");
      } else {
        await axios.put(`/api/policies/${editing.slug}`, payload);
        setSuccess("Policy saved successfully");
      }
      handleClose();
      await fetchPolicies();
    } catch (e) {
      setError(e?.response?.data?.error || e.message || "Failed to save policy");
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async () => {
    if (!policyToDelete) return;
    setDeleting(true);
    setError("");
    try {
      await axios.delete(`/api/policies/${policyToDelete.slug}`);
      setSuccess(`Policy "${policyToDelete.label}" deleted`);
      setDeleteConfirmOpen(false);
      setPolicyToDelete(null);
      await fetchPolicies();
    } catch (e) {
      setError(e?.response?.data?.error || e.message || "Failed to delete policy");
    } finally {
      setDeleting(false);
    }
  };

  const handleCreateNew = () => {
    setEditing({
      slug: "",
      label: "",
      content_html: "",
      show_on_form: false,
      checkbox_group: "",
      checkbox_label: "",
      link_text: "",
      isNew: true,
    });
    setOpen(true);
  };

  // Generate slug from label
  const generateSlug = (label) => {
    return label
      .toLowerCase()
      .replace(/[^a-z0-9\s-]/g, '')
      .replace(/\s+/g, '-')
      .replace(/-+/g, '-')
      .trim();
  };

  return (
    <Box sx={{ p: 2 }}>
      {/* Header with Create button */}
      <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mb: 2 }}>
        <Typography variant="h6">Manage Policies</Typography>
        <Button
          variant="contained"
          startIcon={<PlusIcon className="h-5 w-5" />}
          onClick={handleCreateNew}
        >
          Create Policy
        </Button>
      </Box>

      {/* Success/Error alerts */}
      {error && (
        <Alert severity="error" sx={{ mb: 2 }} onClose={() => setError("")}>
          {error}
        </Alert>
      )}
      {success && (
        <Alert severity="success" sx={{ mb: 2 }} onClose={() => setSuccess("")}>
          {success}
        </Alert>
      )}

      <div style={{ height: 480 }}>
        <DataGrid
          rows={rows}
          columns={columns}
          loading={loading}
          disableRowSelectionOnClick
          density="comfortable"
          getRowId={(r) => r.id}
        />
      </div>

      {/* Edit/Create Dialog */}
      <Dialog
        open={open}
        onClose={saving ? undefined : handleClose}
        maxWidth="lg"
        fullWidth
        fullScreen={isMobile}
        PaperProps={{
          sx: {
            minHeight: { xs: '100vh', md: '80vh' },
            maxHeight: { xs: '100vh', md: '90vh' },
          }
        }}
      >
        <DialogTitle sx={{ pb: 0 }}>
          {editing?.isNew ? "Create New Policy" : "Edit Policy"}
        </DialogTitle>
        <DialogContent dividers sx={{ display: 'flex', flexDirection: 'column', p: 0 }}>
          {editing && (
            <Box sx={{ display: 'flex', flexDirection: 'column', height: '100%' }}>
              {/* Basic fields */}
              <Box sx={{ px: 3, pt: 2, pb: 1, display: 'flex', gap: 2, flexWrap: 'wrap' }}>
                {editing.isNew && (
                  <TextField
                    label="Slug (URL identifier)"
                    value={editing.slug}
                    onChange={(e) => setEditing({ ...editing, slug: e.target.value.toLowerCase().replace(/[^a-z0-9-]/g, '') })}
                    size="small"
                    sx={{ minWidth: 200 }}
                    helperText="e.g., service-agreement"
                  />
                )}
                <TextField
                  label="Policy Name"
                  value={editing.label}
                  onChange={(e) => {
                    const newLabel = e.target.value;
                    const updates = { ...editing, label: newLabel };
                    if (editing.isNew && !editing.slug) {
                      updates.slug = generateSlug(newLabel);
                    }
                    setEditing(updates);
                  }}
                  size="small"
                  sx={{ flex: 1, minWidth: 200 }}
                  placeholder="e.g., Service Agreement"
                />
              </Box>

              {/* Tabs */}
              <Box sx={{ borderBottom: 1, borderColor: 'divider', px: 3 }}>
                <Tabs
                  value={activeTab}
                  onChange={(e, newValue) => setActiveTab(newValue)}
                  aria-label="policy editor tabs"
                >
                  <Tab label="Content" />
                  <Tab label="Form Settings" />
                  <Tab label="Preview" />
                </Tabs>
              </Box>

              {/* Tab Content */}
              <Box sx={{ flex: 1, overflow: 'auto', minHeight: 400 }}>
                {/* Content Tab */}
                {activeTab === 0 && (
                  <Box sx={{ p: 2, height: '100%' }}>
                    <AcademyRichTextEditor
                      content={editing.content_html || ''}
                      onChange={(html) => setEditing({ ...editing, content_html: html })}
                      placeholder="Start writing your policy..."
                      minHeight="400px"
                    />
                  </Box>
                )}

                {/* Form Settings Tab */}
                {activeTab === 1 && (
                  <Box sx={{ p: 3 }}>
                    <Typography variant="subtitle1" gutterBottom fontWeight={600}>
                      Booking Form Display Settings
                    </Typography>
                    <Typography variant="body2" color="text.secondary" sx={{ mb: 3 }}>
                      Configure how this policy appears on booking forms. Policies with the same "Checkbox Group" will be grouped under a single checkbox.
                    </Typography>

                    <FormControlLabel
                      control={
                        <Switch
                          checked={editing.show_on_form || false}
                          onChange={(e) => setEditing({ ...editing, show_on_form: e.target.checked })}
                        />
                      }
                      label="Show on booking form"
                      sx={{ mb: 3 }}
                    />

                    {editing.show_on_form && (
                      <Box sx={{ display: 'flex', flexDirection: 'column', gap: 2, ml: 2 }}>
                        <TextField
                          label="Checkbox Group"
                          value={editing.checkbox_group || ""}
                          onChange={(e) => setEditing({ ...editing, checkbox_group: e.target.value.toLowerCase().replace(/[^a-z0-9-]/g, '') })}
                          size="small"
                          fullWidth
                          helperText="Policies with the same group share one checkbox. Examples: 'cancel', 'service'"
                          placeholder="e.g., service"
                        />
                        <TextField
                          label="Checkbox Label"
                          value={editing.checkbox_label || ""}
                          onChange={(e) => setEditing({ ...editing, checkbox_label: e.target.value })}
                          size="small"
                          fullWidth
                          helperText="The 'I agree to...' text shown next to the checkbox"
                          placeholder="e.g., I agree to the Service Agreement"
                        />
                        <TextField
                          label="Link Text"
                          value={editing.link_text || ""}
                          onChange={(e) => setEditing({ ...editing, link_text: e.target.value })}
                          size="small"
                          fullWidth
                          helperText="The clickable link text below the checkbox"
                          placeholder="e.g., Read Service Agreement"
                        />

                        <Divider sx={{ my: 2 }} />

                        <Typography variant="subtitle2" color="text.secondary">
                          Preview of how it will appear:
                        </Typography>
                        <Box sx={{
                          p: 2,
                          bgcolor: 'grey.50',
                          borderRadius: 1,
                          border: '1px solid',
                          borderColor: 'grey.200'
                        }}>
                          <Box sx={{ display: 'flex', alignItems: 'flex-start', gap: 1 }}>
                            <input type="checkbox" disabled style={{ marginTop: 4 }} />
                            <Box>
                              <Typography variant="body1" fontWeight={500}>
                                {editing.checkbox_label || "I agree to the [Policy]"}
                              </Typography>
                              <Typography
                                variant="body2"
                                sx={{ color: 'primary.main', textDecoration: 'underline', mt: 0.5 }}
                              >
                                {editing.link_text || "Read [Policy]"}
                              </Typography>
                            </Box>
                          </Box>
                        </Box>
                      </Box>
                    )}

                    {!editing.show_on_form && (
                      <Typography variant="body2" color="text.secondary" sx={{ ml: 2 }}>
                        This policy will only appear in the "Jump to" navigation when viewing other policies.
                      </Typography>
                    )}
                  </Box>
                )}

                {/* Preview Tab */}
                {activeTab === 2 && (
                  <Box
                    sx={{
                      p: 3,
                      bgcolor: '#fff',
                      minHeight: 400,
                      '& .policy-preview': {
                        fontFamily: 'Arial, sans-serif',
                        color: '#333',
                        lineHeight: 1.6,
                        '& h1': { fontSize: '1.5rem', margin: '1rem 0 0.5rem', fontWeight: 'bold', color: '#111' },
                        '& h2': { fontSize: '1.25rem', margin: '0.75rem 0 0.5rem', fontWeight: 600, color: '#444' },
                        '& h3': { fontSize: '1.1rem', margin: '0.5rem 0 0.5rem', fontWeight: 600, color: '#555' },
                        '& p': { margin: '0.5rem 0' },
                        '& ul': { margin: '0.5rem 0 1rem 1.5rem', paddingLeft: '1.25rem', listStyleType: 'disc' },
                        '& ol': { margin: '0.5rem 0 1rem 1.5rem', paddingLeft: '1.25rem', listStyleType: 'decimal' },
                        '& li': { margin: '0.25rem 0' },
                        '& strong': { fontWeight: 'bold' },
                        '& a': { color: '#2D2F8E', textDecoration: 'underline' },
                        '& blockquote': { borderLeft: '3px solid #2D2F8E', paddingLeft: '1rem', margin: '1rem 0', fontStyle: 'italic', color: '#64748b' },
                      }
                    }}
                  >
                    <Typography variant="subtitle2" color="text.secondary" sx={{ mb: 2 }}>
                      Content Preview (how users will see this policy):
                    </Typography>
                    <Typography variant="h6" gutterBottom>
                      {editing.label || 'Untitled Policy'}
                    </Typography>
                    <Box
                      className="policy-preview"
                      dangerouslySetInnerHTML={{
                        __html: DOMPurify.sanitize(editing.content_html || '<p><em>No content yet</em></p>')
                      }}
                    />
                  </Box>
                )}
              </Box>
            </Box>
          )}
        </DialogContent>
        <DialogActions sx={{ px: 3, py: 2 }}>
          <Button onClick={handleClose} disabled={saving}>
            Cancel
          </Button>
          <Button onClick={handleSave} variant="contained" disabled={saving}>
            {saving ? "Saving..." : editing?.isNew ? "Create" : "Save"}
          </Button>
        </DialogActions>
      </Dialog>

      {/* Delete Confirmation Dialog */}
      <Dialog
        open={deleteConfirmOpen}
        onClose={() => !deleting && setDeleteConfirmOpen(false)}
        maxWidth="sm"
        fullWidth
      >
        <DialogTitle>Delete Policy?</DialogTitle>
        <DialogContent>
          <Typography>
            Are you sure you want to delete <strong>"{policyToDelete?.label}"</strong>?
          </Typography>
          <Typography color="error" sx={{ mt: 2 }}>
            This action cannot be undone. The policy will be permanently removed.
          </Typography>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setDeleteConfirmOpen(false)} disabled={deleting}>
            Cancel
          </Button>
          <Button
            onClick={handleDelete}
            variant="contained"
            color="error"
            disabled={deleting}
          >
            {deleting ? "Deleting..." : "Delete"}
          </Button>
        </DialogActions>
      </Dialog>
    </Box>
  );
}
