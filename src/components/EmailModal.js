import React, { useState, useEffect } from "react";
import {
  TextField,
  Button,
  Dialog,
  DialogActions,
  DialogContent,
  DialogTitle,
  MenuItem,
  CircularProgress,
} from "@mui/material";
import axios from "axios";
import DOMPurify from "dompurify";
import { useToast } from "../hooks/useToast";

const EmailModal = ({ open, onClose, onSend, defaultTutorId }) => {
  const toast = useToast();
  const [email, setEmail] = useState("");
  const [tutorId, setTutorId] = useState(defaultTutorId || "");
  const [message, setMessage] = useState("");
  const [subject, setSubject] = useState("");
  const [selectedSignature, setSelectedSignature] = useState("Jessica");

  const [templates, setTemplates] = useState([]);
  const [selectedTemplate, setSelectedTemplate] = useState("");
  const [loadingTemplates, setLoadingTemplates] = useState(true);
  const [loadingEmail, setLoadingEmail] = useState(false);

  useEffect(() => {
    if (open) {
      setTutorId(defaultTutorId || "");
      fetchTemplates();
    }
  }, [open, defaultTutorId]);

  const fetchTemplates = async () => {
    setLoadingTemplates(true);
    try {
      const response = await axios.get("/api/email-templates");
      setTemplates(response.data);
    } catch (error) {
      console.error("Failed to fetch templates:", error);
    } finally {
      setLoadingTemplates(false);
    }
  };

  const fetchTutorEmail = async () => {
    if (!tutorId) {
      toast.error("Please provide a tutor ID.");
      return;
    }

    setLoadingEmail(true);
    try {
      const response = await axios.get(`/api/contractors?tutor_id=${tutorId}`);
      if (response.data?.email) {
        setEmail(response.data.email);
      } else {
        toast.error("No email found for the given tutor ID.");
      }
    } catch (error) {
      console.error("Failed to fetch tutor email:", error);
      toast.error("Error fetching tutor email. Please try again.");
    } finally {
      setLoadingEmail(false);
    }
  };

  const emailSignatures = {
    Jessica: `<img src="https://i.imgur.com/WNQUlmV.jpeg" alt="Jessica" style="width: 70%; height: auto; display: block; margin: 0 auto;" />`,
    Caitlin: `<img src="https://i.imgur.com/GYEU1tf.jpeg" alt="Caitlin" style="width: 70%; height: auto; display: block; margin: 0 auto;" />`,
  };

  const handleTemplateChange = (templateId) => {
    const template = templates.find((t) => t.id === templateId);
    setSelectedTemplate(templateId);
    setMessage(template ? template.content : "");
    setSubject(template ? template.subject : "");
  };

  const handleSend = () => {
    if (!email || !subject || !message) {
      toast.error("Email, subject, and message are required.");
      return;
    }

    console.log("Sending email with:", {
      email,
      subject,
      message,
      selectedSignature,
    });
    onSend(email, subject, message, selectedSignature);
    onClose();
  };

  return (
    <Dialog open={open} onClose={onClose}>
      <DialogTitle>Email Report</DialogTitle>
      <DialogContent>
        <Button
          onClick={fetchTutorEmail}
          variant="contained"
          color="primary"
          sx={{ margin: "10px 0" }}
          disabled={loadingEmail}
        >
          {loadingEmail
            ? "Fetching..."
            : "Fetch Tutor's Email Address from TutorCruncher"}
        </Button>

        <TextField
          label="Recipient Email"
          type="email"
          fullWidth
          margin="dense"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
        />

        {loadingTemplates ? (
          <CircularProgress
            size={24}
            sx={{ display: "block", margin: "10px auto" }}
          />
        ) : (
          <TextField
            label="Select Template"
            select
            fullWidth
            margin="dense"
            value={selectedTemplate}
            onChange={(e) => handleTemplateChange(e.target.value)}
          >
            <MenuItem value="">
              <em>None</em>
            </MenuItem>
            {templates.map((template) => (
              <MenuItem key={template.id} value={template.id}>
                {template.name}
              </MenuItem>
            ))}
          </TextField>
        )}

        <TextField
          label="Select Email Signature"
          select
          fullWidth
          margin="dense"
          value={selectedSignature}
          onChange={(e) => setSelectedSignature(e.target.value)}
        >
          {Object.keys(emailSignatures).map((key) => (
            <MenuItem key={key} value={key}>
              {key}
            </MenuItem>
          ))}
        </TextField>

        <div style={{ marginTop: 10, textAlign: "center" }}>
          <strong>Signature Preview:</strong>
          <div
            dangerouslySetInnerHTML={{
              __html: DOMPurify.sanitize(emailSignatures[selectedSignature]),
            }}
          />
        </div>

        <TextField
          label="Subject"
          type="text"
          fullWidth
          margin="dense"
          value={subject}
          onChange={(e) => setSubject(e.target.value)}
        />

        <TextField
          label="Custom Message"
          multiline
          rows={4}
          fullWidth
          margin="dense"
          value={message}
          onChange={(e) => setMessage(e.target.value)}
        />
      </DialogContent>
      <DialogActions>
        <Button onClick={onClose} color="secondary">
          Cancel
        </Button>
        <Button onClick={handleSend} color="primary">
          Send
        </Button>
      </DialogActions>
    </Dialog>
  );
};

export default EmailModal;
