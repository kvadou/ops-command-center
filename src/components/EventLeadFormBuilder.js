import React, { useState, useEffect } from "react";
import {
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions,
  Button,
  TextField,
  FormControl,
  InputLabel,
  Select,
  MenuItem,
  FormControlLabel,
  Switch,
  Box,
  Typography,
  Alert,
  CircularProgress,
  Divider,
  IconButton,
  Tooltip,
} from "@mui/material";
import { XMarkIcon, ClipboardDocumentIcon, ArrowTopRightOnSquareIcon } from '@heroicons/react/24/outline';
import { CheckCircleIcon } from '@heroicons/react/24/solid';

export default function EventLeadFormBuilder({ open, onClose, onSuccess, eventToEdit = null }) {
  const [loading, setLoading] = useState(false);
  const [labels, setLabels] = useState([]);
  const [loadingLabels, setLoadingLabels] = useState(true);
  const [error, setError] = useState(null);
  const [success, setSuccess] = useState(null);
  const [copied, setCopied] = useState(false);

  const isEditMode = !!eventToEdit;

  // Form state
  const [formData, setFormData] = useState({
    eventName: "",
    internalName: "",
    labelId: "",
    labelName: "",
    headerText: "",
    thankYouText: "",
    collectStudentInfo: true,
    collectNotes: true,
  });

  // Fetch labels and populate form on open
  useEffect(() => {
    if (open) {
      fetchLabels();
      if (eventToEdit) {
        // Populate form with existing data for editing
        populateFormForEdit();
      } else {
        resetForm();
      }
    }
  }, [open, eventToEdit]);

  const populateFormForEdit = async () => {
    if (!eventToEdit?.event_id) return;

    try {
      // Fetch the full booking_type data
      const response = await fetch(`/api/booking-types/${eventToEdit.event_id}`, {
        credentials: 'include',
      });

      if (response.ok) {
        const data = await response.json();
        setFormData({
          eventName: data.eventName || data.event_name || eventToEdit.event_name || "",
          internalName: data.name || "",
          labelId: data.labelId || data.label_id || "",
          labelName: data.labelName || data.label_name || "",
          headerText: data.description || "",
          thankYouText: "",
          collectStudentInfo: true,
          collectNotes: true,
        });
      } else {
        // Fallback to data we have
        setFormData({
          eventName: eventToEdit.event_name || "",
          internalName: "",
          labelId: "",
          labelName: "",
          headerText: "",
          thankYouText: "",
          collectStudentInfo: true,
          collectNotes: true,
        });
      }
    } catch (err) {
      console.error("Error fetching event form data:", err);
      // Fallback
      setFormData({
        eventName: eventToEdit.event_name || "",
        internalName: "",
        labelId: "",
        labelName: "",
        headerText: "",
        thankYouText: "",
        collectStudentInfo: true,
        collectNotes: true,
      });
    }
  };

  const fetchLabels = async () => {
    setLoadingLabels(true);
    try {
      const response = await fetch("/api/labels/", {
        credentials: 'include',
      });
      const data = await response.json();
      setLabels(data?.labels || data || []);
    } catch (err) {
      console.error("Error fetching labels:", err);
      setLabels([]);
    } finally {
      setLoadingLabels(false);
    }
  };

  const resetForm = () => {
    setFormData({
      eventName: "",
      internalName: "",
      labelId: "",
      labelName: "",
      headerText: "",
      thankYouText: "",
      collectStudentInfo: true,
      collectNotes: true,
    });
    setError(null);
    setSuccess(null);
    setCopied(false);
  };

  const handleChange = (field) => (event) => {
    const value = event.target.type === "checkbox" ? event.target.checked : event.target.value;
    setFormData((prev) => ({ ...prev, [field]: value }));
    setError(null);
  };

  const handleLabelChange = (event) => {
    const labelId = event.target.value;
    const label = labels.find((l) => String(l.id) === String(labelId));
    setFormData((prev) => ({
      ...prev,
      labelId: labelId,
      labelName: label?.name || "",
    }));
    setError(null);
  };

  const generateEventId = (name) => {
    return name
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-|-$/g, "")
      .slice(0, 50) + "-" + Date.now().toString(36);
  };

  const handleSubmit = async () => {
    // Validation
    if (!formData.eventName.trim()) {
      setError("Event name is required");
      return;
    }
    if (!isEditMode && !formData.internalName.trim()) {
      setError("Internal name is required");
      return;
    }

    setLoading(true);
    setError(null);

    try {
      if (isEditMode) {
        // Update existing booking type
        const response = await fetch(`/api/booking-types/${eventToEdit.event_id}`, {
          method: "PUT",
          credentials: 'include',
          headers: {
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            name: formData.internalName || formData.eventName,
            description: formData.headerText || `Event lead capture form for ${formData.eventName}`,
            labelId: formData.labelId || null,
            labelName: formData.labelName || "",
            eventName: formData.eventName,
          }),
        });

        if (!response.ok) {
          const errorData = await response.json();
          throw new Error(errorData.error || "Failed to update event form");
        }

        // Generate the form URL for display
        const baseUrl = window.location.origin;
        const formUrl = `${baseUrl}/booking-forms/event-lead?eventId=${encodeURIComponent(eventToEdit.event_id)}&eventName=${encodeURIComponent(formData.eventName)}`;

        setSuccess({
          message: "Event form updated successfully!",
          formUrl,
          eventId: eventToEdit.event_id,
          eventName: formData.eventName,
        });
      } else {
        // Create new booking type
        const eventId = generateEventId(formData.eventName);

        const response = await fetch("/api/booking-types", {
          method: "POST",
          credentials: 'include',
          headers: {
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            name: formData.internalName,
            description: formData.headerText || `Event lead capture form for ${formData.eventName}`,
            originalPrice: 0,
            actualPrice: 0,
            is_trial: false,
            category: "event-lead",
            publicInternal: "public",
            lessonType: "Event",
            labelId: formData.labelId || null,
            labelName: formData.labelName || "",
            hideDayTimeOptions: true,
            hideOriginalPrice: true,
            hideAllPricing: true,
            isEventLeadCapture: true,
            eventName: formData.eventName,
          }),
        });

        if (!response.ok) {
          const errorData = await response.json();
          throw new Error(errorData.error || "Failed to create event form");
        }

        const createdForm = await response.json();

        // Generate the form URL
        const baseUrl = window.location.origin;
        const formUrl = `${baseUrl}/booking-forms/event-lead?eventId=${encodeURIComponent(createdForm.id)}&eventName=${encodeURIComponent(formData.eventName)}`;

        setSuccess({
          message: "Event form created successfully!",
          formUrl,
          eventId: createdForm.id,
          eventName: formData.eventName,
        });
      }
    } catch (err) {
      console.error(`Error ${isEditMode ? 'updating' : 'creating'} event form:`, err);
      setError(err.message || `Failed to ${isEditMode ? 'update' : 'create'} event form`);
    } finally {
      setLoading(false);
    }
  };

  const copyToClipboard = (text) => {
    navigator.clipboard.writeText(text);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const handleClose = () => {
    if (success) {
      onSuccess?.();
    }
    onClose();
  };

  return (
    <Dialog
      open={open}
      onClose={handleClose}
      maxWidth="sm"
      fullWidth
      PaperProps={{
        sx: { borderRadius: 2 },
      }}
    >
      <DialogTitle sx={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
        <Typography variant="h6" component="span">
          {success
            ? (isEditMode ? "Event Form Updated" : "Event Form Created")
            : (isEditMode ? "Edit Event Form" : "Create Event Lead Form")}
        </Typography>
        <IconButton onClick={handleClose} size="small">
          <XMarkIcon className="h-5 w-5" />
        </IconButton>
      </DialogTitle>

      <DialogContent dividers>
        {success ? (
          <Box sx={{ textAlign: "center", py: 2 }}>
            <CheckCircleIcon className="h-16 w-16" style={{ color: '#2e7d32', marginBottom: 16 }} />
            <Typography variant="h6" gutterBottom>
              {success.message}
            </Typography>
            <Typography variant="body2" color="text.secondary" sx={{ mb: 3 }}>
              Share this URL with your event attendees to collect their information.
            </Typography>

            <Box
              sx={{
                bgcolor: "#f5f5f5",
                p: 2,
                borderRadius: 1,
                display: "flex",
                alignItems: "center",
                gap: 1,
              }}
            >
              <TextField
                fullWidth
                value={success.formUrl}
                InputProps={{
                  readOnly: true,
                  sx: { fontSize: "0.875rem", bgcolor: "white" },
                }}
                size="small"
              />
              <Tooltip title={copied ? "Copied!" : "Copy URL"}>
                <IconButton onClick={() => copyToClipboard(success.formUrl)} color={copied ? "success" : "default"}>
                  <ClipboardDocumentIcon className="h-5 w-5" />
                </IconButton>
              </Tooltip>
              <Tooltip title="Open form">
                <IconButton component="a" href={success.formUrl} target="_blank">
                  <ArrowTopRightOnSquareIcon className="h-5 w-5" />
                </IconButton>
              </Tooltip>
            </Box>

            <Typography variant="caption" color="text.secondary" sx={{ mt: 2, display: "block" }}>
              Event ID: {success.eventId}
            </Typography>
          </Box>
        ) : (
          <Box sx={{ py: 1 }}>
            {error && (
              <Alert severity="error" sx={{ mb: 2 }}>
                {error}
              </Alert>
            )}

            <Typography variant="subtitle2" color="text.secondary" sx={{ mb: 2 }}>
              {isEditMode
                ? "Update your event lead capture form settings."
                : "Create a simple lead capture form for events, demos, or marketing activities."}
            </Typography>

            <TextField
              fullWidth
              label="Event Name"
              placeholder="e.g., Chess Demo at Central Park"
              value={formData.eventName}
              onChange={handleChange("eventName")}
              required
              sx={{ mb: 2 }}
              helperText="This is what users will see on the form"
            />

            {!isEditMode && (
              <TextField
                fullWidth
                label="Internal Name"
                placeholder="e.g., central-park-demo-jan-2025"
                value={formData.internalName}
                onChange={handleChange("internalName")}
                required
                sx={{ mb: 2 }}
                helperText="For your reference in the admin dashboard"
              />
            )}

            <FormControl fullWidth sx={{ mb: 2 }}>
              <InputLabel id="label-select-label">TutorCruncher Label (Optional)</InputLabel>
              <Select
                labelId="label-select-label"
                value={formData.labelId}
                onChange={handleLabelChange}
                label="TutorCruncher Label (Optional)"
                disabled={loadingLabels}
              >
                <MenuItem value="">
                  <em>None</em>
                </MenuItem>
                {labels.map((label) => (
                  <MenuItem key={label.id} value={label.id}>
                    {label.name}
                  </MenuItem>
                ))}
              </Select>
              <Typography variant="caption" color="text.secondary" sx={{ mt: 0.5, ml: 1.5 }}>
                Leads will be tagged with this label in TutorCruncher
              </Typography>
            </FormControl>

            <Divider sx={{ my: 2 }} />

            <Typography variant="subtitle2" sx={{ mb: 1.5 }}>
              Optional Customizations
            </Typography>

            <TextField
              fullWidth
              label="Custom Header Text"
              placeholder="e.g., Sign up to learn more about our chess programs!"
              value={formData.headerText}
              onChange={handleChange("headerText")}
              sx={{ mb: 2 }}
              multiline
              rows={2}
            />

            <TextField
              fullWidth
              label="Custom Thank You Message"
              placeholder="e.g., Thanks for your interest! We'll be in touch soon."
              value={formData.thankYouText}
              onChange={handleChange("thankYouText")}
              sx={{ mb: 2 }}
              multiline
              rows={2}
            />

            <Divider sx={{ my: 2 }} />

            <Typography variant="subtitle2" sx={{ mb: 1.5 }}>
              Form Fields
            </Typography>

            <FormControlLabel
              control={
                <Switch
                  checked={formData.collectStudentInfo}
                  onChange={handleChange("collectStudentInfo")}
                />
              }
              label="Collect student information (name)"
              sx={{ display: "block", mb: 1 }}
            />

            <FormControlLabel
              control={
                <Switch
                  checked={formData.collectNotes}
                  onChange={handleChange("collectNotes")}
                />
              }
              label="Include notes/questions field"
              sx={{ display: "block" }}
            />
          </Box>
        )}
      </DialogContent>

      <DialogActions sx={{ px: 3, py: 2 }}>
        {success ? (
          <Button variant="contained" onClick={handleClose}>
            Done
          </Button>
        ) : (
          <>
            <Button onClick={handleClose} disabled={loading}>
              Cancel
            </Button>
            <Button
              variant="contained"
              onClick={handleSubmit}
              disabled={loading}
              startIcon={loading ? <CircularProgress size={20} /> : null}
            >
              {loading
                ? (isEditMode ? "Saving..." : "Creating...")
                : (isEditMode ? "Save Changes" : "Create Form")}
            </Button>
          </>
        )}
      </DialogActions>
    </Dialog>
  );
}
