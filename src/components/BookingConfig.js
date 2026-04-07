import React, { useEffect, useState, useRef, useCallback } from "react";
import { Link as RouterLink } from "react-router-dom";
import {
  Box,
  Button,
  Typography,
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions,
  TextField,
  FormControlLabel,
  Checkbox,
  MenuItem,
  Tooltip,
  Select,
  FormControl,
  InputLabel,
} from "@mui/material";
import StandardDataGridLayout from "./StandardDataGridLayout";
import { useToast } from '../hooks/useToast';
import { PlusIcon, ClipboardDocumentIcon, BeakerIcon } from '@heroicons/react/24/outline';
import QRCodePopover from "./QRCodePopover";
import ReactQuillWrapper from './ReactQuillWrapper';

const CATEGORY_OPTIONS = ["New York", "Other"];
const LESSON_TYPE_OPTIONS = [
  "Home",
  "Online",
  "School",
  "Club",
  "Club - Private",
  "Auction",
  "Event",
  "Other",
];
const LESSON_DATES_OPTIONS = ["Weekly Ongoing", "Club", "Other"];
const CHARGE_TYPE_OPTIONS = ["Hourly", "Other"];

export default function BookingConfig() {
  const toast = useToast();
  const [rows, setRows] = useState([]);
  const [categories, setCategories] = useState([]);

  const defaultEditing = {
    name: "",
    description: "",
    publicInternal: "public",
    lessonType: LESSON_TYPE_OPTIONS[0],
    lessonDates: LESSON_DATES_OPTIONS[0],
    dftChargeType: CHARGE_TYPE_OPTIONS[0],
    dftChargeRate: 0,
    colour: "dodgerblue",
    jobDescription: "",
    originalPrice: 0,
    actualPrice: 0,
    image_url: "",
    is_trial: false,
    category: "",
    hideDayTimeOptions: false,
    hideOriginalPrice: false,
    hideAllPricing: false,
    allowInternationalAddresses: false,
    isEventLeadCapture: false,
    eventName: "",
  };
  const [editing, setEditing] = useState(defaultEditing);
  const [labels, setLabels] = useState([]);
  const quillEditorRef = useRef(null);

  const insertEmoji = useCallback((emoji) => {
    const quillComponent = quillEditorRef.current;
    if (!quillComponent) return;
    const editor = quillComponent.getEditor ? quillComponent.getEditor() : null;
    if (!editor) return;
    const range = editor.getSelection(true);
    if (range) {
      editor.insertText(range.index, emoji);
      editor.setSelection(range.index + emoji.length);
    } else {
      // No selection — append at end
      const len = editor.getLength();
      editor.insertText(len - 1, emoji);
      editor.setSelection(len - 1 + emoji.length);
    }
  }, []);

  const [openForm, setOpenForm] = useState(false);
  const [openDelete, setOpenDelete] = useState(false);
  const [openDuplicate, setOpenDuplicate] = useState(false);
  const [selectedFormToDuplicate, setSelectedFormToDuplicate] = useState('');

  const fetchRows = () => {
    fetch("/api/booking-types")
      .then((r) => r.json())
      .then((raw) => {
        setRows(
          raw.map((r) => ({
            ...r,
            hideOriginalPrice: r.hideOriginalPrice ?? r.hide_original_price,
            hideAllPricing: r.hideAllPricing ?? r.hide_all_pricing,
            allowInternationalAddresses: r.allowInternationalAddresses ?? r.allow_international_addresses ?? false,
            publicInternal: r.publicInternal ?? r.public_internal,
            lessonType: r.lessonType ?? r.lesson_type,
            lessonDates: r.lessonDates ?? r.lesson_dates,
            dftChargeType: r.dftChargeType ?? r.dft_charge_type,
            dftChargeRate: r.dftChargeRate ?? r.dft_charge_rate,
            colour: r.colour,
            jobDescription: r.jobDescription ?? r.job_description,
            originalPrice: r.originalPrice ?? r.original_price,
            actualPrice: r.actualPrice ?? r.actual_price,
            hideDayTimeOptions: r.hideDayTimeOptions ?? r.hide_day_time_options,
            isEventLeadCapture: r.isEventLeadCapture ?? r.is_event_lead_capture ?? false,
            eventName: r.eventName ?? r.event_name ?? "",
          }))
        );

        const uniqueCategories = [...new Set((raw || []).map((r) => r.category))];
        setCategories(uniqueCategories);
      })
      .catch((err) => {
        console.error('Failed to fetch booking config:', err);
        setRows([]);
        setCategories([]);
      });
  };

  useEffect(() => {
    fetch("/api/labels")
      .then((r) => {
        if (!r.ok) throw new Error("Labels fetch failed");
        return r.json();
      })
      .then((data) => {
        console.log("Fetched Labels:", data);
        if (Array.isArray(data.labels)) {
          setLabels(data.labels);
        } else {
          console.error("Fetched labels is not an array:", data);
        }
      })
      .catch((err) => {
        console.error("Error fetching labels:", err);
      });
  }, []);

  useEffect(fetchRows, []);

  const handleOpenForm = (row = null) => {
    if (row) {
      console.log("Row data on open:", row);
      setEditing({
        ...defaultEditing,
        ...row,
        dftChargeRate: row.dftChargeRate ?? row.actualPrice,
        colour: row.colour || defaultEditing.colour,
        labelId: row.labelId ?? null,
        labelName: row.labelName ?? "",
      });
    } else {
      setEditing(defaultEditing);
    }
    setOpenForm(true);
  };

  const handleSave = () => {
    console.log("Saving with the following data:", editing);

    const method = editing?.id ? "PUT" : "POST";
    const url = editing?.id
      ? `/api/booking-types/${editing?.id}`
      : "/api/booking-types";

    fetch(url, {
      method,
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(editing),
    })
      .then((res) => {
        if (!res.ok) throw new Error(`${method} failed`);
        return res.json();
      })
      .then(() => {
        setOpenForm(false);
        fetchRows();
      })
      .catch((err) => {
        toast.error(err.message);
      });
  };

  const handleDelete = () => {
    fetch(`/api/booking-types/${editing?.id}`, {
      method: "DELETE",
    })
      .then((res) => {
        if (!res.ok) throw new Error("Delete failed");
        return res.json();
      })
      .then(() => {
        setOpenDelete(false);
        fetchRows();
      })
      .catch((err) => {
        toast.error(err.message);
      });
  };

  const handleDuplicate = async () => {
    if (!selectedFormToDuplicate) {
      toast.error('Please select a form to duplicate');
      return;
    }

    try {
      const formToDuplicate = rows.find(r => r.id === parseInt(selectedFormToDuplicate));
      if (!formToDuplicate) {
        toast.error('Form not found');
        return;
      }

      // Create a copy of the form
      const duplicateData = {
        ...formToDuplicate,
        name: `${formToDuplicate.name} (Copy)`,
        id: undefined, // Remove ID so it creates a new form
      };

      const response = await fetch("/api/booking-types", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(duplicateData),
      });

      if (!response.ok) throw new Error("Duplicate failed");
      
      setOpenDuplicate(false);
      setSelectedFormToDuplicate('');
      fetchRows();
    } catch (err) {
      toast.error(err.message || 'Failed to duplicate form');
    }
  };

  const [searchQuery, setSearchQuery] = useState("");

  const columns = [
    {
      field: "actions",
      headerName: "Actions",
      width: 200,
      disableColumnMenu: true,
      renderCell: ({ row }) => (
        <>
          <Button
            size="small"
            onClick={() => handleOpenForm(row)}
            sx={{ mr: 1 }}
            disabled={[
              "Per Session Special",
              "Per Session",
              "one-off",
            ].includes(row.lessonDates)}
          >
            Edit
          </Button>
          <Button
            size="small"
            color="error"
            onClick={() => {
              setEditing(row);
              setOpenDelete(true);
            }}
          >
            Delete
          </Button>
        </>
      ),
    },
    { field: "id", headerName: "ID", width: 70 },
    { 
      field: "name", 
      headerName: "Name", 
      flex: 1, 
      minWidth: 150,
      renderCell: (params) => {
        const hasNoLabel = !params.row.labelId;
        const content = (
          <Typography variant="body2" sx={{ width: '100%' }}>
            {params.value || ''}
          </Typography>
        );
        
        if (hasNoLabel) {
          return (
            <Tooltip 
              title="⚠️ Missing TutorCruncher Label - Click Edit to assign a label" 
              arrow
              placement="top"
            >
              {content}
            </Tooltip>
          );
        }
        return content;
      },
    },
    {
      field: "goToForm",
      headerName: "Form",
      width: 160,
      sortable: false,
      filterable: false,
      renderCell: ({ row }) => {
        if (row.isEventLeadCapture) {
          return (
            <Button 
              size="small" 
              variant="outlined" 
              component={RouterLink} 
              to={`/booking-forms/event-lead?eventId=${row.id}&eventName=${encodeURIComponent(row.eventName || 'Event')}`}
            >
              Event Form
            </Button>
          );
        } else {
          const to = row.serviceId
            ? `/booking-forms/frontend?serviceId=${row.serviceId}`
            : `/booking-forms/frontend?bookingTypeId=${row.id}`;
          return (
            <Button size="small" variant="outlined" component={RouterLink} to={to}>
              Go to Form
            </Button>
          );
        }
      },
    },
    {
      field: "qrCode",
      headerName: "QR",
      width: 60,
      sortable: false,
      filterable: false,
      renderCell: ({ row }) => {
        // Support both serviceId-linked and standalone booking types
        return (
          <QRCodePopover
            serviceId={row.serviceId}
            bookingTypeId={row.id}
            serviceName={row.name}
            size="small"
            autoGenerate={false}
          />
        );
      },
    },
    {
      field: "originalPrice",
      headerName: "Original $",
      width: 110,
    },
    {
      field: "actualPrice",
      headerName: "Actual $",
      width: 110,
    },
    {
      field: "labelName",
      headerName: "Label",
      minWidth: 100,
      renderCell: (params) => {
        const hasNoLabel = !params.row.labelId;
        const content = (
          <Typography variant="body2" sx={{ color: hasNoLabel ? 'error.main' : 'text.primary', width: '100%' }}>
            {params.value || (hasNoLabel ? '⚠️ No Label' : '—')}
          </Typography>
        );
        
        if (hasNoLabel) {
          return (
            <Tooltip 
              title="⚠️ Missing TutorCruncher Label - Click Edit to assign a label" 
              arrow
              placement="top"
            >
              <Box sx={{ width: '100%', cursor: 'help' }}>
                {content}
              </Box>
            </Tooltip>
          );
        }
        return content;
      },
    },
    {
      field: "is_trial",
      headerName: "Trial?",
      width: 90,
      renderCell: ({ value }) => (value ? "✓" : ""),
    },
    {
      field: "isEventLeadCapture",
      headerName: "Event Lead?",
      width: 100,
      renderCell: ({ value }) => (value ? "✓" : ""),
    },
    {
      field: "eventName",
      headerName: "Event Name",
      width: 150,
      renderCell: ({ value, row }) => row.isEventLeadCapture ? value : "",
    },
    { field: "colour", headerName: "Colour", width: 120 },
  ];

  // Filter rows based on search query
  const filteredRows = rows.filter(row => {
    if (!searchQuery) return true;
    const query = searchQuery.toLowerCase();
    return (
      String(row.id).toLowerCase().includes(query) ||
      (row.name && row.name.toLowerCase().includes(query)) ||
      (row.labelName && row.labelName.toLowerCase().includes(query)) ||
      (row.eventName && row.eventName.toLowerCase().includes(query))
    );
  });

  return (
    <>
      <StandardDataGridLayout
        title="Booking Configuration"
        columns={columns}
        rows={filteredRows}
        searchQuery={searchQuery}
        onSearchChange={setSearchQuery}
        getRowId={(row) => row.id}
        pagePath="/booking-forms/config"
        actionButtons={[
          {
            label: "Create",
            variant: "contained",
            startIcon: <PlusIcon className="h-5 w-5" />,
            onClick: () => handleOpenForm(),
            sx: {
              bgcolor: '#42b72a',
              '&:hover': { bgcolor: '#36a420' },
            },
          },
          {
            label: "Duplicate",
            variant: "outlined",
            startIcon: <ClipboardDocumentIcon className="h-5 w-5" />,
            onClick: () => setOpenDuplicate(true),
          },
          {
            label: "A/B test",
            variant: "outlined",
            startIcon: <BeakerIcon className="h-5 w-5" />,
            component: RouterLink,
            to: "/booking-forms/ab-test",
          },
          {
            label: "Submissions",
            variant: "outlined",
            component: RouterLink,
            to: "/booking-forms/submissions",
          },
        ]}
        dataGridProps={{
          getRowClassName: (params) => (!params.row.labelId ? "no-label" : ""),
          sx: {
            "& .no-label": {
              backgroundColor: "#ffcccc",
            },
          },
        }}
      />

      <Dialog
        open={openForm}
        onClose={() => setOpenForm(false)}
        fullWidth
        maxWidth="sm"
        disableEnforceFocus
        disableRestoreFocus
        keepMounted
      >
        <DialogTitle>{editing?.id ? "Edit" : "Add"} Booking Type</DialogTitle>
        <DialogContent dividers>
          <TextField
            margin="dense"
            label="Name"
            fullWidth
            value={editing?.name}
            onChange={(e) => setEditing({ ...editing, name: e.target.value })}
          />
          <TextField
            margin="dense"
            label="Image URL"
            fullWidth
            value={editing?.image_url}
            onChange={(e) =>
              setEditing({ ...editing, image_url: e.target.value })
            }
          />
          <Box mt={2} mb={2}>
            <Typography variant="subtitle1" gutterBottom>
              Description
            </Typography>
            <ReactQuillWrapper
              ref={quillEditorRef}
              value={editing?.description || ""}
              onChange={(value) => setEditing({ ...editing, description: value })}
              modules={{
                toolbar: [
                  ['bold', 'italic', 'underline'],
                  [{ list: 'ordered' }, { list: 'bullet' }],
                  ['clean'],
                ],
              }}
              formats={['bold', 'italic', 'underline', 'list', 'bullet']}
              style={{ minHeight: 120 }}
            />
            <Box sx={{ display: 'flex', flexWrap: 'wrap', gap: 0.5, mt: 1, alignItems: 'center' }}>
              <Typography variant="caption" sx={{ color: 'text.secondary', mr: 1 }}>Insert:</Typography>
              {['✔', '✅', '⭐', '🏠', '♟️', '🎯', '📍', '👶', '💰', '📞', '⏰', '🎓'].map((emoji) => (
                <Box
                  key={emoji}
                  component="button"
                  type="button"
                  onClick={() => insertEmoji(emoji)}
                  sx={{
                    width: 32, height: 32, fontSize: 18, cursor: 'pointer',
                    background: 'none', border: '1px solid #e5e7eb', borderRadius: 1,
                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                    '&:hover': { bgcolor: '#f3f4f6', borderColor: '#d1d5db' },
                  }}
                >
                  {emoji}
                </Box>
              ))}
            </Box>
          </Box>
          <FormControlLabel
            control={
              <Checkbox
                checked={editing?.is_trial}
                onChange={(e) =>
                  setEditing({ ...editing, is_trial: e.target.checked })
                }
              />
            }
            label="Create Trial Session on TC"
          />
          <FormControlLabel
            control={
              <Checkbox
                checked={editing.hideDayTimeOptions}
                onChange={(e) =>
                  setEditing({
                    ...editing,
                    hideDayTimeOptions: e.target.checked,
                  })
                }
                disabled={editing.isEventLeadCapture} // Disable if event lead capture is enabled
              />
            }
            label="Hide Day & Time Options"
          />
          <FormControlLabel
            control={
              <Checkbox
                checked={editing.hideOriginalPrice}
                onChange={(e) =>
                  setEditing({
                    ...editing,
                    hideOriginalPrice: e.target.checked,
                  })
                }
                disabled={editing.isEventLeadCapture} // Disable if event lead capture is enabled
              />
            }
            label="Hide Original Price"
          />

          <FormControlLabel
            control={
              <Checkbox
                checked={editing.hideAllPricing}
                onChange={(e) =>
                  setEditing({
                    ...editing,
                    hideAllPricing: e.target.checked,
                  })
                }
                disabled={editing.isEventLeadCapture} // Disable if event lead capture is enabled
              />
            }
            label="Hide All Pricing"
          />

          <FormControlLabel
            control={
              <Checkbox
                checked={editing.allowInternationalAddresses}
                onChange={(e) =>
                  setEditing({
                    ...editing,
                    allowInternationalAddresses: e.target.checked,
                  })
                }
                disabled={editing.isEventLeadCapture}
              />
            }
            label="Allow International Addresses"
          />

          <FormControlLabel
            control={
              <Checkbox
                checked={editing.isEventLeadCapture}
                onChange={(e) => {
                  const isChecked = e.target.checked;
                  setEditing({
                    ...editing,
                    isEventLeadCapture: isChecked,
                    // Automatically set these to true when event lead capture is enabled
                    hideOriginalPrice: isChecked ? true : editing.hideOriginalPrice,
                    hideAllPricing: isChecked ? true : editing.hideAllPricing,
                    hideDayTimeOptions: isChecked ? true : editing.hideDayTimeOptions,
                  });
                }}
              />
            }
            label="Event Lead Capture Form"
          />

          {editing.isEventLeadCapture && (
            <TextField
              margin="dense"
              label="Event Name"
              fullWidth
              value={editing.eventName}
              onChange={(e) =>
                setEditing({ ...editing, eventName: e.target.value })
              }
              helperText="Name of the event for lead capture (e.g., 'Spring School Fair 2024')"
            />
          )}

          <TextField
            select
            margin="dense"
            label="TutorCruncher Label"
            fullWidth
            value={editing.labelId ?? ""}
            onChange={(e) => {
              const id = Number(e.target.value);
              const sel = labels.find((l) => l.id === id) || {};
              console.log("Selected label:", sel);
              setEditing({
                ...editing,
                labelId: id,
                labelName: sel.name || "",
              });
            }}
          >
            {(labels || []).map((l) => (
              <MenuItem key={l.id} value={l.id}>
                {l.name}
              </MenuItem>
            ))}
          </TextField>

          <TextField
            margin="dense"
            label="Original Price (For TutorCruncher Jobs)"
            type="number"
            fullWidth
            value={editing?.originalPrice}
            onChange={(e) =>
              setEditing({ ...editing, originalPrice: +e.target.value })
            }
          />
          <TextField
            margin="dense"
            label="Actual Price (Charged via Stripe)"
            type="number"
            fullWidth
            value={editing.actualPrice}
            onChange={(e) => {
              const actual = Number(e.target.value);
              setEditing({
                ...editing,
                actualPrice: actual,

                dftChargeRate: actual,
              });
            }}
          />

          <TextField
            select
            margin="dense"
            label="Category"
            fullWidth
            value={editing?.category || ""}
            onChange={(e) =>
              setEditing({ ...editing, category: e.target.value })
            }
          >
            {(categories || []).map((c) => (
              <MenuItem key={c} value={c}>
                {c}
              </MenuItem>
            ))}
          </TextField>

          <TextField
            select
            margin="dense"
            label="Lesson Type"
            fullWidth
            value={editing.lessonType}
            onChange={(e) =>
              setEditing({ ...editing, lessonType: e.target.value })
            }
          >
            {LESSON_TYPE_OPTIONS.map((opt) => (
              <MenuItem key={opt} value={opt}>
                {opt}
              </MenuItem>
            ))}
          </TextField>

          <TextField
            margin="dense"
            label="Colour"
            fullWidth
            value={editing.colour}
            onChange={(e) => setEditing({ ...editing, colour: e.target.value })}
            helperText="Any valid CSS color; defaults to dodgerblue"
          />
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setOpenForm(false)}>Cancel</Button>
          <Button variant="contained" onClick={handleSave}>
            {editing?.id ? "Save" : "Create"}
          </Button>
        </DialogActions>
      </Dialog>

      {/* Duplicate Dialog */}
      <Dialog
        open={openDuplicate}
        onClose={() => setOpenDuplicate(false)}
        maxWidth="sm"
        fullWidth
      >
        <DialogTitle>Duplicate Form</DialogTitle>
        <DialogContent dividers>
          <Typography variant="body2" color="text.secondary" sx={{ mb: 2 }}>
            Select a form to duplicate. This will create a copy that you can modify for testing or as a starting point for a new form.
          </Typography>
          <FormControl fullWidth>
            <InputLabel>Select Form to Duplicate</InputLabel>
            <Select
              value={selectedFormToDuplicate}
              onChange={(e) => setSelectedFormToDuplicate(e.target.value)}
              label="Select Form to Duplicate"
            >
              {rows.map((row) => (
                <MenuItem key={row.id} value={row.id}>
                  {row.name}
                </MenuItem>
              ))}
            </Select>
          </FormControl>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => {
            setOpenDuplicate(false);
            setSelectedFormToDuplicate('');
          }}>
            Cancel
          </Button>
          <Button
            variant="contained"
            onClick={handleDuplicate}
            disabled={!selectedFormToDuplicate}
          >
            Duplicate
          </Button>
        </DialogActions>
      </Dialog>

      {/* Delete Dialog */}
      <Dialog open={openDelete} onClose={() => setOpenDelete(false)} disableEnforceFocus disableRestoreFocus keepMounted>
        <DialogTitle>Delete Booking Type?</DialogTitle>
        <DialogActions>
          <Button onClick={() => setOpenDelete(false)}>No</Button>
          <Button color="error" onClick={handleDelete}>
            Yes, Delete
          </Button>
          </DialogActions>
        </Dialog>
    </>
  );
}
