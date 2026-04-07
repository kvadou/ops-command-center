import React, { useState, useEffect, useRef } from "react";
import {
  Box,
  Button,
  TextField,
  Typography,
  Stack,
  Snackbar,
  Alert,
} from "@mui/material";
import { useNavigate, useParams, useLocation } from "react-router-dom";
import EmailEditor from "react-email-editor";

export default function TemplateBuilder() {
  const { id } = useParams();
  const location = useLocation();
  const isNewRoute = location.pathname.endsWith("/new");
  const navigate = useNavigate();
  const editorRef = useRef(null);

  const [templateName, setTemplateName] = useState("");
  const [editorReady, setEditorReady] = useState(false);
  const [toastOpen, setToastOpen] = useState(false);
  const [toastMessage, setToastMessage] = useState("");
  const [toastSeverity, setToastSeverity] = useState("success");

  useEffect(() => {
    if (!editorReady) return;

    if (!isNewRoute && id) {
      fetch(`/api/templates/${id}`)
        .then((res) => res.json())
        .then((tpl) => {
          setTemplateName(tpl.template_name);
          editorRef.current.editor.loadDesign(tpl.design);
        })
        .catch(console.error);
    } else {
      const { design, template_name } = location.state || {};
      setTemplateName(template_name || "");
      editorRef.current.editor.loadDesign(design || {});
    }
  }, [id, isNewRoute, editorReady, location.state]);

  const handleSave = () => {
    if (!editorReady) return;

    editorRef.current.editor.exportHtml(({ design, html }) => {
      const payload = { template_name: templateName, design, html };
      const url = isNewRoute || !id ? "/api/templates" : `/api/templates/${id}`;
      const method = isNewRoute || !id ? "POST" : "PUT";

      fetch(url, {
        method,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      })
        .then((res) => {
          if (!res.ok) throw new Error("Save failed");
          return res.json();
        })
        .then(() => {
          setToastSeverity("success");
          setToastMessage("Template saved successfully!");
          setToastOpen(true);
          setTimeout(() => navigate("/client-reports/templates"), 1500);
        })
        .catch((err) => {
          setToastSeverity("error");
          setToastMessage(err.message);
          setToastOpen(true);
        });
    });
  };

  return (
    <Box className="mx-auto">
      <Stack
        direction="row"
        justifyContent="space-between"
        alignItems="center"
        mb={2}
      >
        {/* <Typography variant="h5">
          {id && !isNewRoute ? "Edit Template" : "Add New Template"}
        </Typography> */}
        <Button
          variant="text"
          onClick={() => navigate("/client-reports/templates")}
        >
          Back
        </Button>
      </Stack>

      <TextField
        fullWidth
        label="Template Name"
        margin="normal"
        value={templateName}
        onChange={(e) => setTemplateName(e.target.value)}
      />

      <Box my={4} sx={{ height: 800, border: "1px solid #ddd", "& > div": { height: "100% !important" } }}>
        <EmailEditor
          ref={editorRef}
          onLoad={() => setEditorReady(true)}
          options={{
            mergeTags: [
              { name: "Tutor Feedback", value: "{{{feedback}}}" },
              { name: "Tutor Name", value: "{{tutorName}}" },
              { name: "Student Name", value: "{{studentName}}" },
              { name: "Client Name", value: "{{clientName}}" },
            ],
          }}
        />
      </Box>

      <Stack direction="row" spacing={2}>
        <Button
          variant="contained"
          color="primary"
          disabled={!templateName || !editorReady}
          onClick={handleSave}
        >
          Save
        </Button>
        <Button
          variant="outlined"
          onClick={() => navigate("/client-reports/templates")}
        >
          Cancel
        </Button>
      </Stack>

      <Snackbar
        open={toastOpen}
        autoHideDuration={3000}
        onClose={() => setToastOpen(false)}
        anchorOrigin={{ vertical: "bottom", horizontal: "center" }}
      >
        <Alert
          onClose={() => setToastOpen(false)}
          severity={toastSeverity}
          sx={{ width: "100%" }}
        >
          {toastMessage}
        </Alert>
      </Snackbar>
    </Box>
  );
}
