import React, { useEffect, useState } from "react";
import {
  Box,
  Button,
  Typography,
  Dialog,
  DialogTitle,
  DialogContent,
  DialogContentText,
  DialogActions,
  TextField,
} from "@mui/material";
import { DataGrid } from "@mui/x-data-grid";
import { useNavigate } from "react-router-dom";
import { useToast } from "../hooks/useToast";

export default function TemplateList() {
  const [templates, setTemplates] = useState([]);
  const [deleteId, setDeleteId] = useState(null);
  const [openDelete, setOpenDelete] = useState(false);

  const [testId, setTestId] = useState(null);
  const [openTest, setOpenTest] = useState(false);
  const [testEmail, setTestEmail] = useState("");
  const [sending, setSending] = useState(false);

  const navigate = useNavigate();
  const toast = useToast();

  const fetchTemplates = () => {
    fetch("/api/templates", {
      credentials: 'include',
      headers: {
        'Content-Type': 'application/json'
      }
    })
      .then((res) => res.json())
      .then(setTemplates)
      .catch((err) => {
        console.error('Failed to fetch templates:', err);
        setTemplates([]);
      });
  };

  useEffect(() => {
    fetchTemplates();
  }, []);

  const handleDeleteClick = (id) => {
    setDeleteId(id);
    setOpenDelete(true);
  };

  const handleConfirmDelete = () => {
    fetch(`/api/templates/${deleteId}`, {
      method: "DELETE",
      credentials: 'include',
      headers: {
        'Content-Type': 'application/json'
      }
    })
      .then(async (res) => {
        if (!res.ok) {
          const data = await res.json();
          throw new Error(data.error || "Delete failed");
        }
        return res.json();
      })
      .then(() => {
        setOpenDelete(false);
        setDeleteId(null);
        fetchTemplates();
      })
      .catch((err) => {
        toast.error(err.message);
        setOpenDelete(false);
        setDeleteId(null);
      });
  };

  const handleDuplicate = (id) => {
    fetch(`/api/templates/${id}`, {
      credentials: 'include',
      headers: {
        'Content-Type': 'application/json'
      }
    })
      .then((res) => res.json())
      .then((tpl) =>
        navigate("/client-reports/templates/new", {
          state: {
            design: tpl.design,
            template_name: `${tpl.template_name} Copy`,
          },
        })
      )
      .catch(console.error);
  };

  const handleSendTestClick = (id) => {
    setTestId(id);
    setTestEmail("");
    setOpenTest(true);
  };

  const handleSendTest = () => {
    if (!testEmail) return;
    
    setSending(true);
    fetch(`/api/templates/${testId}/send-test`, {
      method: "POST",
      credentials: 'include',
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({ email: testEmail }),
    })
      .then((res) => {
        if (!res.ok) throw new Error("Send failed");
        return res.json();
      })
      .then(() => {
        toast.success("Test email sent!");
        setOpenTest(false);
      })
      .catch((err) => toast.error(err.message))
      .finally(() => setSending(false));
  };

  const columns = [
    { field: "id", headerName: "ID", width: 70 },
    { field: "template_name", headerName: "Name", flex: 1 },
    {
      field: "actions",
      headerName: "Actions",
      width: 400,
      renderCell: ({ row }) => (
        <>
          <Button
            size="small"
            variant="outlined"
            onClick={() => navigate(`/client-reports/templates/${row.id}`)}
            sx={{ mr: 1 }}
          >
            Edit
          </Button>
          <Button
            size="small"
            variant="contained"
            color="primary"
            onClick={() => handleSendTestClick(row.id)}
            sx={{ mr: 1 }}
          >
            Send Test
          </Button>
          <Button
            size="small"
            variant="contained"
            color="warning"
            onClick={() => handleDuplicate(row.id)}
            sx={{ mr: 1 }}
          >
            Duplicate
          </Button>
          <Button
            size="small"
            variant="contained"
            color="error"
            onClick={() => handleDeleteClick(row.id)}
          >
            Delete
          </Button>
        </>
      ),
    },
  ];

  return (
    <Box className="mx-auto p-6">
      <Box
        display="flex"
        justifyContent="space-between"
        alignItems="center"
        mb={2}
      >
        <Button
          variant="outlined"
          onClick={() => navigate("/client-reports")}
        >
          Back to Lesson Reports
        </Button>
        <Button
          variant="contained"
          onClick={() => navigate("/client-reports/templates/new")}
        >
          Add New Template
        </Button>
      </Box>

      <Box
        sx={{
          height: 500,
          bgcolor: "background.paper",
          boxShadow: 1,
          borderRadius: 1,
        }}
      >
        <DataGrid
          rows={templates || []}
          columns={columns}
          pageSize={10}
          rowsPerPageOptions={[10, 25]}
          getRowId={(row) => row.id}
        />
      </Box>

      <Dialog open={openDelete} onClose={() => setOpenDelete(false)}>
        <DialogTitle>Confirm Delete</DialogTitle>
        <DialogContent>
          <DialogContentText>
            Are you sure you want to permanently delete this template?
          </DialogContentText>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setOpenDelete(false)}>Cancel</Button>
          <Button color="error" onClick={handleConfirmDelete}>
            Delete
          </Button>
        </DialogActions>
      </Dialog>

      <Dialog open={openTest} onClose={() => setOpenTest(false)}>
        <DialogTitle>Send Test Email</DialogTitle>
        <DialogContent>
          <DialogContentText>
            Enter an email address to send a test of this template:
          </DialogContentText>
          <TextField
            autoFocus
            margin="dense"
            label="Email Address"
            type="email"
            fullWidth
            value={testEmail}
            onChange={(e) => setTestEmail(e.target.value)}
          />
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setOpenTest(false)} disabled={sending}>
            Cancel
          </Button>
          <Button
            onClick={handleSendTest}
            disabled={sending || !testEmail}
            variant="contained"
            color="primary"
          >
            {sending ? "Sending…" : "Send"}
          </Button>
        </DialogActions>
      </Dialog>
    </Box>
  );
}
