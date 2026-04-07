import React, { useEffect, useState, useCallback, lazy, Suspense } from "react";
import { createPortal } from "react-dom";
import DOMPurify from "dompurify";
import {
  Box,
  Button,
  Typography,
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions,
  TextField,
  FormControl,
  InputLabel,
  Select,
  MenuItem,
  CircularProgress,
  Snackbar,
  Alert,
  Chip,
  Switch,
  FormControlLabel,
  Tooltip,
} from "@mui/material";
import { useNavigate } from "react-router-dom";
import StandardDataGridLayout from "./StandardDataGridLayout";
const TemplateList = lazy(() => import("./TemplateList"));

import dayjs from "dayjs";
import timezone from "dayjs/plugin/timezone";
import utc from "dayjs/plugin/utc";

// Extend dayjs with timezone plugins
dayjs.extend(utc);
dayjs.extend(timezone);

// Kebab menu for report row actions — uses portal to escape DataGrid overflow
function ReportKebabMenu({ row, activeTab, sending, sendingId, lessonReportsEnabled, onPreview, onSend, onDelete }) {
  const [open, setOpen] = React.useState(false);
  const [menuPos, setMenuPos] = React.useState({ top: 0, left: 0 });
  const btnRef = React.useRef(null);
  const menuRef = React.useRef(null);

  // Close on outside click or scroll
  React.useEffect(() => {
    if (!open) return;
    const close = () => setOpen(false);
    const handler = (e) => {
      if (menuRef.current && !menuRef.current.contains(e.target) && !btnRef.current.contains(e.target)) {
        close();
      }
    };
    document.addEventListener('mousedown', handler);
    // Close on scroll (DataGrid virtualizes rows)
    const scrollEl = btnRef.current?.closest('.MuiDataGrid-virtualScroller');
    if (scrollEl) scrollEl.addEventListener('scroll', close);
    window.addEventListener('resize', close);
    return () => {
      document.removeEventListener('mousedown', handler);
      if (scrollEl) scrollEl.removeEventListener('scroll', close);
      window.removeEventListener('resize', close);
    };
  }, [open]);

  const handleToggle = (e) => {
    e.stopPropagation();
    if (!open && btnRef.current) {
      const rect = btnRef.current.getBoundingClientRect();
      setMenuPos({ top: rect.bottom + 4, left: rect.right - 140 });
    }
    setOpen(!open);
  };

  return (
    <>
      <button
        ref={btnRef}
        onClick={handleToggle}
        style={{
          display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
          width: 24, height: 24, borderRadius: 4,
          border: '0.5px solid #d4d4d4', background: 'transparent', cursor: 'pointer',
          padding: 0,
        }}
      >
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#737373" strokeWidth="2" strokeLinecap="round">
          <circle cx="12" cy="5" r="1" /><circle cx="12" cy="12" r="1" /><circle cx="12" cy="19" r="1" />
        </svg>
      </button>
      {open && createPortal(
        <>
          {/* Invisible backdrop to catch clicks */}
          <div style={{ position: 'fixed', inset: 0, zIndex: 9998 }} onClick={() => setOpen(false)} />
          <div
            ref={menuRef}
            style={{
              position: 'fixed', top: menuPos.top, left: menuPos.left, zIndex: 9999,
              background: 'white', borderRadius: 8, border: '1px solid #e5e5e5',
              boxShadow: '0 4px 16px rgba(0,0,0,0.12)', minWidth: 140, padding: '4px 0',
            }}
          >
            <button
              style={{ display: 'flex', alignItems: 'center', gap: 8, width: '100%', padding: '8px 12px', border: 0, background: 'transparent', cursor: 'pointer', fontSize: 13, color: '#404040', textAlign: 'left' }}
              onMouseEnter={(e) => e.currentTarget.style.background = '#fafafa'}
              onMouseLeave={(e) => e.currentTarget.style.background = 'transparent'}
              onClick={() => { onPreview(row.id); setOpen(false); }}
            >
              Preview
            </button>
            {activeTab === "unsent" && (
              <button
                style={{ display: 'flex', alignItems: 'center', gap: 8, width: '100%', padding: '8px 12px', border: 0, background: 'transparent', cursor: 'pointer', fontSize: 13, color: '#6A469D', textAlign: 'left', opacity: (sending && sendingId === row.id) || !lessonReportsEnabled ? 0.4 : 1 }}
                disabled={(sending && sendingId === row.id) || !lessonReportsEnabled}
                onMouseEnter={(e) => e.currentTarget.style.background = '#fafafa'}
                onMouseLeave={(e) => e.currentTarget.style.background = 'transparent'}
                onClick={() => { onSend(row.id); setOpen(false); }}
              >
                {sending && sendingId === row.id ? "Sending..." : "Send"}
              </button>
            )}
            <button
              style={{ display: 'flex', alignItems: 'center', gap: 8, width: '100%', padding: '8px 12px', border: 0, background: 'transparent', cursor: 'pointer', fontSize: 13, color: '#DA2E72', textAlign: 'left', opacity: row.status === 'sent' ? 0.4 : 1 }}
              disabled={row.status === 'sent'}
              onMouseEnter={(e) => e.currentTarget.style.background = '#FCE8F0'}
              onMouseLeave={(e) => e.currentTarget.style.background = 'transparent'}
              onClick={() => { onDelete(row.id); setOpen(false); }}
            >
              Delete
            </button>
          </div>
        </>,
        document.body
      )}
    </>
  );
}

export default function AllClientReports() {
  
  const navigate = useNavigate();
  const [reports, setReports] = useState([]);
  const [templates, setTemplates] = useState(() => []);
  const [openNew, setOpenNew] = useState(false);
  const [deleteId, setDeleteId] = useState(null);
  const [openDelete, setOpenDelete] = useState(false);
  const [activeTab, setActiveTab] = useState("sent"); // "unsent" or "sent"
  const [showTemplates, setShowTemplates] = useState(false);
  const [selectedRows, setSelectedRows] = useState([]);
  const [bulkSending, setBulkSending] = useState(false);
  const [bulkDeleteOpen, setBulkDeleteOpen] = useState(false);
  const [bulkDeleting, setBulkDeleting] = useState(false);
  const [trackingDialogOpen, setTrackingDialogOpen] = useState(false);
  const [trackingData, setTrackingData] = useState(null);
  const [loadingTracking, setLoadingTracking] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");
  const [sentEmailsDialogOpen, setSentEmailsDialogOpen] = useState(false);
  const [currentReportForEmails, setCurrentReportForEmails] = useState(null);
  const [previewReportId, setPreviewReportId] = useState(null);
  const [lessonReportsEnabled, setLessonReportsEnabled] = useState(true);
  const [loadingSetting, setLoadingSetting] = useState(false);

  const [form, setForm] = useState({
    dateSent: "",
    tutorName: "",
    clientName: "",
    studentName: "",
    clientEmail: "",
    templateName: "",
    tutorFeedback: "",
  });
  const [previewOpen, setPreviewOpen] = useState(false);
  const [previewHtml, setPreviewHtml] = useState("");
  const [previewLoading, setPreviewLoading] = useState(false);
  const [sendingId, setSendingId] = useState(null);
  const [sending, setSending] = useState(false);
  const [sendDialogOpen, setSendDialogOpen] = useState(false);
  const [customEmail, setCustomEmail] = useState("");
  const [reportToSend, setReportToSend] = useState(null);

  const fetchReports = useCallback(() => {
    fetch("/api/client-reports", {
      credentials: 'include',
      headers: {
        'Content-Type': 'application/json'
      }
    })
      .then((r) => r.json())
      .then((data) => {
        // Ensure we always set an array
        if (Array.isArray(data)) {
          setReports(data);
        } else {
          console.warn('Client reports API returned non-array data:', data);
          setReports([]);
        }
      })
      .catch((err) => {
        console.error('Failed to fetch reports:', err);
        setReports([]);
      });
  }, []);

  const [toast, setToast] = useState({
    open: false,
    message: "",
    severity: "success",
  });

  // Fetch lesson reports enabled setting
  const fetchLessonReportsSetting = useCallback(() => {
    fetch("/api/app-settings/lesson_reports_enabled", {
      credentials: 'include',
      headers: { 'Content-Type': 'application/json' }
    })
      .then((r) => r.json())
      .then((data) => {
        if (data && data.value && typeof data.value.enabled === 'boolean') {
          setLessonReportsEnabled(data.value.enabled);
        }
      })
      .catch((err) => {
        console.error('Failed to fetch lesson reports setting:', err);
        // Default to enabled if fetch fails
        setLessonReportsEnabled(true);
      });
  }, []);

  // Update lesson reports enabled setting
  const updateLessonReportsSetting = async (enabled) => {
    setLoadingSetting(true);

    try {
      const response = await fetch("/api/app-settings/lesson_reports_enabled", {
        method: 'PUT',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ value: { enabled } })
      });
      
      if (response.ok) {
        const data = await response.json();
        setLessonReportsEnabled(data.value.enabled);
        setToast({
          open: true,
          message: enabled ? 'Lesson reports sending enabled' : 'Lesson reports sending disabled',
          severity: 'success'
        });
      } else {
        throw new Error('Failed to update setting');
      }
    } catch (err) {
      console.error('Failed to update lesson reports setting:', err);
      setToast({
        open: true,
        message: 'Failed to update setting',
        severity: 'error'
      });
    } finally {
      setLoadingSetting(false);
    }
  };

  useEffect(() => {
    fetch("/api/client-reports", {
      credentials: 'include',
      headers: { 'Content-Type': 'application/json' }
    })
      .then((r) => r.json())
      .then((data) => {
        // Ensure we always set an array
        if (Array.isArray(data)) {
          setReports(data);
        } else {
          console.warn('Client reports API returned non-array data:', data);
          setReports([]);
        }
      })
      .catch((err) => {
        console.error('Failed to fetch reports:', err);
        setReports([]);
      });
    fetch("/api/templates")
      .then((r) => {
        if (!r.ok) {
          throw new Error(`HTTP ${r.status}: ${r.statusText}`);
        }
        return r.json();
      })
      .then((data) => {
        // Debug logging removed
        if (Array.isArray(data)) {
          setTemplates(data);
        } else {
          console.warn('Templates API returned non-array data:', data);
          setTemplates([]);
        }
      })
      .catch((err) => {
        console.error('Failed to fetch templates:', err);
        setTemplates([]);
      });
    
    // Fetch lesson reports setting
    fetchLessonReportsSetting();
  }, [fetchLessonReportsSetting]);

  const handleNewChange = (key) => (e) =>
    setForm((f) => ({ ...f, [key]: e.target.value }));

  const handleCreate = () => {
    fetch("/api/client-reports", {
      method: "POST",
      credentials: 'include',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(form),
    })
      .then((r) => r.json())
      .then(() => {
        setOpenNew(false);
        setForm({
          dateSent: "",
          tutorName: "",
          clientName: "",
          studentName: "",
          clientEmail: "",
          templateName: "",
          tutorFeedback: "",
        });
        return fetch("/api/client-reports")
          .then((r) => r.json())
          .then(setReports);
      })
      .catch(console.error);
  };

  const handleDeleteClick = (id) => {
    setDeleteId(id);
    setOpenDelete(true);
  };

  const handleViewTracking = async (row) => {
    setLoadingTracking(true);
    setTrackingDialogOpen(true);
    
    try {
      const response = await fetch(`/api/client-reports/${row.id}/tracking`, {
        credentials: 'include',
        headers: {
          'Content-Type': 'application/json'
        }
      });
      
      if (response.ok) {
        const data = await response.json();
        setTrackingData(data);
      } else {
        console.error('Failed to fetch tracking data');
        setTrackingData(null);
      }
    } catch (error) {
      console.error('Error fetching tracking data:', error);
      setTrackingData(null);
    } finally {
      setLoadingTracking(false);
    }
  };

  const handleCancelDelete = () => {
    setOpenDelete(false);
    setDeleteId(null);
  };

  const handleConfirmDelete = () => {
    fetch(`/api/client-reports/${deleteId}`, { method: "DELETE" })
      .then((r) => {
        if (!r.ok) throw new Error("Delete failed");
        return r.json();
      })
      .then(() => {
        setToast({ open: true, message: "Report deleted", severity: "info" });
        fetchReports();
      })
      .catch((err) =>
        setToast({ open: true, message: err.message, severity: "error" })
      )
      .finally(() => {
        setOpenDelete(false);
        setDeleteId(null);
      });
  };

  const handleBulkDeleteClick = () => {
    if (selectedRows.length === 0) {
      setToast({ open: true, message: "Please select reports to delete", severity: "warning" });
      return;
    }
    
    // Check if any selected reports are sent (not pending)
    const selectedReports = reports.filter(report => selectedRows.includes(report.id));
    const sentReports = selectedReports.filter(report => report.status === 'sent');
    
    if (sentReports.length > 0) {
      setToast({ 
        open: true, 
        message: `Cannot delete sent reports. Please only select unsent reports.`, 
        severity: "error" 
      });
      return;
    }
    
    setBulkDeleteOpen(true);
  };

  const handleCancelBulkDelete = () => {
    setBulkDeleteOpen(false);
  };

  const handleConfirmBulkDelete = async () => {
    setBulkDeleting(true);

    try {
      const ids = [...selectedRows];
      let totalDeleted = 0;

      // Process in batches of 100 to avoid overwhelming the server
      const batchSize = 100;
      for (let i = 0; i < ids.length; i += batchSize) {
        const batch = ids.slice(i, i + batchSize);

        // Debug logging removed

        const response = await fetch('/api/client-reports/bulk', {
          method: 'DELETE',
          credentials: 'include',
          headers: {
            'Content-Type': 'application/json'
          },
          body: JSON.stringify({ ids: batch })
        });
        
        if (!response.ok) {
          const errorData = await response.json();
          throw new Error(errorData.error || `HTTP ${response.status}`);
        }
        
        const result = await response.json();
        totalDeleted += result.deletedCount;
        
        // Small delay between batches to avoid overwhelming the server
        if (i + batchSize < ids.length) {
          await new Promise(resolve => setTimeout(resolve, 100));
        }
      }
      
      setToast({ 
        open: true, 
        message: `Successfully deleted ${totalDeleted} report(s)`, 
        severity: "success" 
      });
      
      // Clear selection and refresh data
      setSelectedRows([]);
      fetchReports();
      
    } catch (error) {
      console.error('Bulk delete error:', error);
      setToast({ 
        open: true, 
        message: `Failed to delete reports: ${error.message}`, 
        severity: "error" 
      });
    } finally {
      setBulkDeleting(false);
      setBulkDeleteOpen(false);
    }
  };

  const handlePreview = (id) => {
    setPreviewLoading(true);
    setPreviewOpen(true);
    setPreviewReportId(id);
    fetch(`/api/client-reports/${id}/preview`)
      .then((r) => r.text())
      .then((html) => setPreviewHtml(html))
      .catch(() =>
        setPreviewHtml('<p style="color:red;">Failed to load preview.</p>')
      )
      .finally(() => setPreviewLoading(false));
  };

  const handleViewSentEmails = (report) => {
    setCurrentReportForEmails(report);
    setSentEmailsDialogOpen(true);
  };

  const handleSend = (id) => {
    const report = reports.find(r => r.id === id);
    setReportToSend(report);
    setCustomEmail(""); // Reset custom email
    setSendDialogOpen(true);
  };

  const handleConfirmSend = () => {
    if (!reportToSend) return;
    
    if (!lessonReportsEnabled) {
      setToast({
        open: true,
        message: 'Lesson reports sending is currently disabled. Please enable it in the toggle above.',
        severity: "error",
      });
      setSendDialogOpen(false);
      return;
    }

    setSendingId(reportToSend.id);
    setSending(true);

    const body = customEmail ? { customEmail } : {};

    fetch(`/api/client-reports/${reportToSend.id}/send`, {
      method: "POST",
      credentials: 'include',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body)
    })
      .then((r) => {
        if (!r.ok) throw new Error("Send failed");
        return r.json();
      })
      .then((data) => {
        const sentCount = data.totalEmailsSent || 0;
        const failedCount = data.totalEmailsFailed || 0;
        
        let message;
        if (data.customEmailUsed) {
          message = `Report sent to custom email: ${data.emailSent}`;
        } else if (sentCount > 0) {
          message = `Report sent successfully to ${sentCount} email${sentCount !== 1 ? 's' : ''}${failedCount > 0 ? ` (${failedCount} failed)` : ''}!`;
        } else {
          message = "Report email sent successfully!";
        }
        
        setToast({
          open: true,
          message,
          severity: failedCount > 0 ? "warning" : "success",
        });
        fetchReports(); // Refresh the reports to update status
        
        // Show sent emails dialog if there are multiple emails
        if (data.sentEmails && data.sentEmails.length > 0) {
          const reportWithSentEmails = { ...reportToSend, sent_emails: data.sentEmails };
          setCurrentReportForEmails(reportWithSentEmails);
          setSentEmailsDialogOpen(true);
        }
        
        setSendDialogOpen(false);
      })
      .catch((err) => {
        setToast({
          open: true,
          message: err.message,
          severity: "error",
        });
      })
      .finally(() => {
        setSending(false);
        setSendingId(null);
        setReportToSend(null);
      });
  };

  const handleTabChange = (event, newValue) => {
    if (newValue !== null && newValue !== undefined) {
      setActiveTab(newValue);
      setSelectedRows([]); // Clear selection when switching tabs
    }
  };

  const handleBulkSend = async () => {
    if (selectedRows.length === 0) return;
    
    if (!lessonReportsEnabled) {
      setToast({
        open: true,
        message: 'Lesson reports sending is currently disabled. Please enable it in the toggle above.',
        severity: "error",
      });
      return;
    }

    setBulkSending(true);

    try {
      const promises = selectedRows.map(id =>
        fetch(`/api/client-reports/${id}/send`, {
          method: "POST",
          credentials: 'include',
          headers: { 'Content-Type': 'application/json' }
        })
      );

      const results = await Promise.allSettled(promises);
      const errors = results.filter(r => r.status === 'rejected' || (r.value && !r.value.ok));
      
      if (errors.length > 0) {
        // Check if errors are due to disabled setting
        const errorMessages = await Promise.all(
          errors.map(async (error) => {
            if (error.value && error.value.ok === false) {
              const data = await error.value.json().catch(() => ({}));
              return data.message || data.error || 'Unknown error';
            }
            return error.reason?.message || 'Unknown error';
          })
        );
        
        const isDisabledError = errorMessages.some(msg => 
          msg && (msg.includes('disabled') || msg.includes('Lesson reports sending'))
        );
        
        setToast({
          open: true,
          message: isDisabledError 
            ? 'Lesson reports sending is currently disabled. Please enable it in the toggle above.'
            : `Failed to send ${errors.length} of ${selectedRows.length} reports.`,
          severity: "error",
        });
      } else {
        setToast({
          open: true,
          message: `${selectedRows.length} reports sent successfully!`,
          severity: "success",
        });
      }

      setSelectedRows([]);
      fetchReports(); // Refresh the reports
    } catch (err) {
      setToast({
        open: true,
        message: "Some reports failed to send",
        severity: "error",
      });
    } finally {
      setBulkSending(false);
    }
  };

  // Filter reports based on active tab and search query
  const filteredReports = (Array.isArray(reports) ? reports : []).filter(report => {
    // Tab filter
    let matchesTab = false;
    if (activeTab === "unsent") {
      // Unsent tab - show reports that are not actually sent (no timestamp data)
      // Check date_sent (set when sending), sent_at (set by Brevo webhook), and email_delivered_at (set by Brevo webhook)
      matchesTab = !report.status || report.status === 'pending' || (report.status === 'sent' && !report.date_sent && !report.sent_at && !report.email_delivered_at);
    } else {
      // Sent tab - show reports that are actually sent (have timestamp data)
      // Check date_sent (set when sending), sent_at (set by Brevo webhook), or email_delivered_at (set by Brevo webhook)
      matchesTab = report.status === 'sent' && (report.date_sent || report.sent_at || report.email_delivered_at);
    }
    
    if (!matchesTab) return false;
    
    // Search filter
    if (searchQuery) {
      const query = searchQuery.toLowerCase();
      // Check top-level fields
      const matchesTopLevel = (
        report.tutor_name?.toLowerCase().includes(query) ||
        report.client_name?.toLowerCase().includes(query) ||
        report.student_name?.toLowerCase().includes(query) ||
        report.client_email?.toLowerCase().includes(query) ||
        report.template_name?.toLowerCase().includes(query) ||
        report.appointment_id?.toString().includes(query) ||
        report.lesson_id?.toString().includes(query)
      );
      if (matchesTopLevel) return true;

      // Also search sent_emails JSON for club/school consolidated reports
      // where emails were sent to multiple parents but only one client_email is stored
      if (report.sent_emails) {
        try {
          const emails = typeof report.sent_emails === 'string'
            ? JSON.parse(report.sent_emails)
            : report.sent_emails;
          if (Array.isArray(emails)) {
            return emails.some(e =>
              e.email?.toLowerCase().includes(query) ||
              e.studentName?.toLowerCase().includes(query) ||
              e.clientName?.toLowerCase().includes(query)
            );
          }
        } catch { /* ignore parse errors */ }
      }
      return false;
    }
    
    return true;
  });

  // Render column header with hover menu
  const renderColumnHeader = (params) => {
    return (
      <Box
        sx={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          width: '100%',
          fontWeight: 600,
          fontSize: '0.875rem',
        }}
      >
        <span>{params.colDef.headerName}</span>
      </Box>
    );
  };

  // Standardized badge component for status cells
  const StatusPill = ({ label, variant = 'neutral', onClick, title }) => {
    const variantStyles = {
      success: 'bg-success-light text-success-dark',
      warning: 'bg-warning-light text-warning-dark',
      danger: 'bg-error-light text-error-dark',
      info: 'bg-info-light text-info-dark',
      neutral: 'bg-neutral-100 text-neutral-600',
    };
    return (
      <span
        className={`inline-flex items-center rounded-full px-2 py-0.5 text-[11px] font-medium ${variantStyles[variant] || variantStyles.neutral} ${onClick ? 'cursor-pointer' : ''}`}
        onClick={onClick}
        title={title}
      >
        {label}
      </span>
    );
  };

  const columns = [
    {
      field: "sent_at",
      headerName: "Sent",
      width: 130,
      sortable: true,
      renderCell: ({ row }) => {
        const sentTime = row.sent_at || row.date_sent;
        if (!sentTime) return <span style={{ color: '#9ca3af' }}>Not sent</span>;
        try {
          return dayjs(sentTime).utc().tz('America/Chicago').format("M/D/YY h:mm A");
        } catch {
          return "—";
        }
      },
      valueGetter: (value, row) => row.sent_at || row.date_sent || null,
    },
    {
      field: "engagement",
      headerName: "Status",
      width: 140,
      renderCell: ({ row }) => {
        const isOpened = row.email_opened_at;
        const isClicked = row.email_clicked_at;
        const openCount = row.email_opened_count || 0;
        const clickCount = row.email_clicked_count || 0;
        const isBounced = row.email_bounced_at;
        const isDelivered = row.email_delivered_at;

        if (!row.date_sent && !isDelivered) {
          return <StatusPill label="Not sent" variant="neutral" />;
        }
        if (isBounced) {
          return <StatusPill label="Bounced" variant="danger" onClick={() => handleViewTracking(row)} />;
        } else if (isOpened && isClicked) {
          return <StatusPill label={`${openCount}× opened`} variant="success" onClick={() => handleViewTracking(row)} />;
        } else if (isOpened) {
          return <StatusPill label={`${openCount}× opened`} variant="info" onClick={() => handleViewTracking(row)} />;
        } else if (isClicked) {
          return <StatusPill label={`${clickCount}× clicked`} variant="info" onClick={() => handleViewTracking(row)} />;
        } else if (isDelivered) {
          return <StatusPill label="Delivered" variant="neutral" onClick={() => handleViewTracking(row)} />;
        } else {
          const sentEmails = row.sent_emails;
          const isSiblingReport = sentEmails && Array.isArray(sentEmails) &&
            sentEmails.some(e => e.skipped && e.reason?.toLowerCase().includes('sibling'));
          if (isSiblingReport) {
            return <StatusPill label="Via sibling" variant="info" title="Email was sent to parent via another sibling's report on the same lesson" />;
          }
          return <StatusPill label="Sending..." variant="warning" />;
        }
      },
    },
    {
      field: "tutor_name",
      headerName: "Tutor",
      width: 120,
    },
    {
      field: "client_name",
      headerName: "Client",
      flex: 1,
      minWidth: 130,
    },
    {
      field: "student_name",
      headerName: "Student",
      flex: 1,
      minWidth: 130,
    },
    {
      field: "template_name",
      headerName: "Template",
      flex: 1.5,
      minWidth: 150,
      renderCell: (params) => (
        <Tooltip title={params.value || ""} arrow placement="top">
          <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{params.value || "—"}</span>
        </Tooltip>
      ),
    },
    {
      field: "appointment_id",
      headerName: "Lesson",
      width: 75,
      renderCell: ({ row, value }) => {
        if (!value) return "—";
        const link = (
          <a
            href={`https://account.acmeops.com/cal/appointments/${value}/`}
            target="_blank"
            rel="noopener noreferrer"
            className="text-primary-500 underline text-[13px]"
            onClick={(e) => e.stopPropagation()}
          >
            {value}
          </a>
        );
        if (row.service_name) {
          return (
            <Tooltip title={row.service_name} arrow placement="top">
              <span>{link}</span>
            </Tooltip>
          );
        }
        return link;
      }
    },
    ...(activeTab === "sent" ? [{
      field: "sent_emails",
      headerName: "Emails",
      width: 75,
      renderCell: ({ row }) => {
        const sentEmails = row.sent_emails;
        if (!sentEmails || (Array.isArray(sentEmails) && sentEmails.length === 0)) {
          return "—";
        }
        const emails = Array.isArray(sentEmails) ? sentEmails : (typeof sentEmails === 'string' ? JSON.parse(sentEmails) : []);
        const successCount = emails.filter(e => e.success).length;
        const totalCount = emails.length;
        return (
          <button
            className="text-primary-500 hover:underline text-[13px] bg-transparent border-0 cursor-pointer p-0"
            onClick={() => handleViewSentEmails(row)}
          >
            {successCount}/{totalCount}
          </button>
        );
      },
    }] : []),
    {
      field: "actions",
      headerName: "",
      width: 48,
      sortable: false,
      filterable: false,
      renderCell: ({ row }) => (
        <ReportKebabMenu
          row={row}
          activeTab={activeTab}
          sending={sending}
          sendingId={sendingId}
          lessonReportsEnabled={lessonReportsEnabled}
          onPreview={handlePreview}
          onSend={handleSend}
          onDelete={handleDeleteClick}
        />
      ),
    },
  ];

  // Calculate tab counts
  // Match the same logic as the filter above - check date_sent, sent_at, and email_delivered_at
  const unsentCount = (Array.isArray(reports) ? reports : []).filter(r => !r.status || r.status === 'pending' || (r.status === 'sent' && !r.date_sent && !r.sent_at && !r.email_delivered_at)).length;
  const sentCount = (Array.isArray(reports) ? reports : []).filter(r => r.status === 'sent' && (r.date_sent || r.sent_at || r.email_delivered_at)).length;

  // Action buttons
  const actionButtons = [
    {
      label: showTemplates ? "Back to Reports" : "Manage Templates",
      onClick: () => setShowTemplates(!showTemplates),
      variant: "outlined",
    },
    {
      label: "Add Report",
      onClick: () => setOpenNew(true),
      variant: "contained",
      color: "primary",
    },
  ];

  // Toggle control for lesson reports — inline with toolbar
  const lessonReportsToggle = (
    <div className="flex items-center gap-2">
      <label className="relative inline-flex items-center cursor-pointer">
        <input
          type="checkbox"
          className="sr-only peer"
          checked={lessonReportsEnabled}
          onChange={(e) => updateLessonReportsSetting(e.target.checked)}
          disabled={loadingSetting}
        />
        <div className={`w-9 h-5 rounded-full transition-colors peer-focus:ring-2 peer-focus:ring-primary-200 ${
          lessonReportsEnabled ? 'bg-success' : 'bg-neutral-300'
        } after:content-[''] after:absolute after:top-0.5 after:left-[2px] after:bg-white after:rounded-full after:h-4 after:w-4 after:transition-all ${
          lessonReportsEnabled ? 'after:translate-x-full' : ''
        }`} />
      </label>
      <span className={`text-sm font-medium ${lessonReportsEnabled ? 'text-success-dark' : 'text-error'}`}>
        {lessonReportsEnabled ? 'Auto-send enabled' : 'Auto-send disabled'}
      </span>
      {!lessonReportsEnabled && (
        <span className="text-xs text-neutral-500 italic">
          Reports created but not sent
        </span>
      )}
    </div>
  );

  // Bulk actions toolbar (shown when rows are selected)
  const bulkActionsToolbar = activeTab === "unsent" && selectedRows.length > 0 ? (
    <Box display="flex" alignItems="center" gap={1}>
      <Typography variant="body2" color="text.secondary">
        {selectedRows.length} report{selectedRows.length !== 1 ? 's' : ''} selected
      </Typography>
      <Button
        variant="contained"
        color="primary"
        size="small"
        disabled={bulkSending || !lessonReportsEnabled}
        onClick={handleBulkSend}
        title={!lessonReportsEnabled ? 'Lesson reports sending is disabled' : ''}
      >
        {bulkSending ? "Sending..." : `Send ${selectedRows.length}`}
      </Button>
      <Button 
        variant="outlined" 
        color="error" 
        size="small"
        onClick={handleBulkDeleteClick}
        disabled={bulkDeleting}
      >
        {bulkDeleting ? <CircularProgress size={16} /> : `Delete`}
      </Button>
    </Box>
  ) : null;

  if (showTemplates) {
    return (
      <Box>
        <div className="flex items-center justify-between px-4 sm:px-6 py-3">
          {lessonReportsToggle}
          <button
            onClick={() => setShowTemplates(false)}
            className="inline-flex items-center gap-1.5 px-3 py-1.5 text-sm font-medium text-neutral-700 bg-white border border-neutral-300 rounded-md hover:bg-neutral-50 transition-colors"
          >
            ← Back to Reports
          </button>
        </div>
        <Suspense fallback={<Box sx={{ display: 'flex', justifyContent: 'center', p: 6 }}><CircularProgress /></Box>}>
          <TemplateList />
        </Suspense>
      </Box>
    );
  }

  // Combined toolbar: toggle + bulk actions
  const combinedToolbarActions = (
    <div className="flex items-center gap-4">
      {lessonReportsToggle}
      {bulkActionsToolbar}
    </div>
  );

  return (
    <Box>
      <StandardDataGridLayout
        title=""
        columns={columns}
        rows={filteredReports}
        tabs={[
          {
            label: `Unsent${unsentCount > 0 ? ` (${unsentCount})` : ''}`,
            value: "unsent",
          },
          {
            label: `Sent${sentCount > 0 ? ` (${sentCount})` : ''}`,
            value: "sent",
          },
        ]}
        activeTab={activeTab}
        onTabChange={handleTabChange}
        searchQuery={searchQuery}
        onSearchChange={(value) => setSearchQuery(value)}
        actionButtons={actionButtons}
        getRowId={(r) => r.id}
        pagePath="/client-reports"
        toolbarActions={combinedToolbarActions}
        dataGridProps={{
          checkboxSelection: activeTab === "unsent",
          onRowSelectionModelChange: (newSelection) => {
            setSelectedRows(newSelection);
          },
          rowSelectionModel: selectedRows,
          rowHeight: 40,
          columnHeaderHeight: 38,
          initialState: {
            pagination: { paginationModel: { pageSize: 50, page: 0 } },
            sorting: {
              sortModel: [{ field: 'sent_at', sort: 'desc' }],
            },
          },
          sx: {
            fontSize: '0.8rem',
            '& .MuiDataGrid-columnHeaders': {
              bgcolor: 'rgba(250, 250, 250, 0.5)',
              fontSize: '11px',
              fontWeight: 500,
              textTransform: 'none',
              color: '#737373',
              minHeight: '36px !important',
              maxHeight: '36px !important',
            },
            '& .MuiDataGrid-columnHeaderTitle': {
              fontWeight: 500,
              fontSize: '11px',
            },
            '& .MuiDataGrid-cell': {
              py: '6px',
              px: '12px',
              borderColor: '#f5f5f5',
            },
            '& .MuiDataGrid-row:hover': {
              bgcolor: '#fafafa',
            },
            '& .MuiDataGrid-columnSeparator': {
              display: 'flex !important',
              cursor: 'col-resize',
            },
          },
        }}
      />

        <Dialog open={openNew} onClose={() => setOpenNew(false)} fullWidth closeAfterTransition={false}>
        <DialogTitle>New Client Report</DialogTitle>
        <DialogContent>
          <TextField
            fullWidth
            margin="dense"
            label="Date Sent"
            type="date"
            value={form.dateSent}
            onChange={handleNewChange("dateSent")}
            InputLabelProps={{ shrink: true }}
            autoFocus
          />
          <TextField
            fullWidth
            margin="dense"
            label="Tutor Name"
            value={form.tutorName}
            onChange={handleNewChange("tutorName")}
          />
          <TextField
            fullWidth
            margin="dense"
            label="Client Name"
            value={form.clientName}
            onChange={handleNewChange("clientName")}
          />
          <TextField
            fullWidth
            margin="dense"
            label="Student Name"
            value={form.studentName}
            onChange={handleNewChange("studentName")}
          />
          <TextField
            fullWidth
            margin="dense"
            label="Client Email"
            type="email"
            value={form.clientEmail}
            onChange={handleNewChange("clientEmail")}
          />
          <FormControl fullWidth margin="dense">
            <InputLabel id="template-select-label">Template</InputLabel>
            <Select
              labelId="template-select-label"
              label="Template"
              value={form.templateName}
              onChange={handleNewChange("templateName")}
            >
              {(() => {
                // Multiple safety checks to handle any possible edge case
                if (!templates) {
                  return [];
                }
                
                if (typeof templates !== 'object') {
                  return [];
                }
                
                if (!Array.isArray(templates)) {
                  return [];
                }
                
                try {
                  return templates.map((tpl) => (
                    <MenuItem key={tpl.id} value={tpl.template_name}>
                      {tpl.template_name}
                    </MenuItem>
                  ));
                } catch (error) {
                  console.error('Error mapping templates:', error);
                  return [];
                }
              })()}
            </Select>
          </FormControl>
          <TextField
            fullWidth
            margin="dense"
            label="Tutor Feedback"
            multiline
            rows={3}
            value={form.tutorFeedback}
            onChange={handleNewChange("tutorFeedback")}
          />
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setOpenNew(false)}>Cancel</Button>
          <Button
            variant="contained"
            onClick={handleCreate}
            disabled={
              !form.dateSent ||
              !form.tutorName ||
              !form.clientName ||
              !form.studentName ||
              !form.clientEmail ||
              !form.templateName
            }
          >
            Create
          </Button>
        </DialogActions>
      </Dialog>

        <Dialog
          open={previewOpen}
          onClose={() => setPreviewOpen(false)}
          fullWidth
          maxWidth="md"
          closeAfterTransition={false}
        >
        <DialogTitle>Email Preview</DialogTitle>
        <DialogContent dividers>
          {previewLoading ? (
            <Box textAlign="center" py={4}>
              <CircularProgress />
            </Box>
          ) : (
            <>
              <div dangerouslySetInnerHTML={{ __html: DOMPurify.sanitize(previewHtml) }} />
              {previewReportId && (() => {
                const report = reports.find(r => r.id === previewReportId);
                if (!report || !report.sent_emails) return null;
                
                const sentEmails = Array.isArray(report.sent_emails) 
                  ? report.sent_emails 
                  : (typeof report.sent_emails === 'string' ? JSON.parse(report.sent_emails) : []);
                
                if (!sentEmails || sentEmails.length === 0) return null;
                
                const successCount = sentEmails.filter(e => e.success).length;
                
                return (
                  <Box mt={3} pt={2} borderTop="1px solid #e0e0e0">
                    <Typography variant="h6" gutterBottom>Sent Email Addresses</Typography>
                    <Typography variant="body2" color="textSecondary" gutterBottom>
                      This report was sent to {successCount} email address{successCount !== 1 ? 'es' : ''}:
                    </Typography>
                    <Box mt={1}>
                      {sentEmails.filter(e => e.success).map((emailData, index) => (
                        <Box key={index} mb={1}>
                          <Typography variant="body2">
                            <strong>{emailData.studentName || 'N/A'}</strong>: {emailData.email}
                            {' '}({emailData.type === 'client' ? 'Client' : 'Student Parent'})
                          </Typography>
                        </Box>
                      ))}
                    </Box>
                    <Box mt={2}>
                      <Button
                        size="small"
                        variant="outlined"
                        onClick={() => {
                          setPreviewOpen(false);
                          handleViewSentEmails(report);
                        }}
                      >
                        View All Sent Emails
                      </Button>
                    </Box>
                  </Box>
                );
              })()}
            </>
          )}
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setPreviewOpen(false)} autoFocus>Close</Button>
        </DialogActions>
              </Dialog>

        {/* Send Report Dialog */}
        <Dialog
          open={sendDialogOpen}
          onClose={() => setSendDialogOpen(false)}
          fullWidth
          maxWidth="sm"
          closeAfterTransition={false}
        >
        <DialogTitle>Send Report</DialogTitle>
        <DialogContent>
          {reportToSend && (
            <Box>
              <Typography variant="body2" color="textSecondary" gutterBottom>
                Report: {reportToSend.template_name}
              </Typography>
              <Typography variant="body2" color="textSecondary" gutterBottom>
                Student: {reportToSend.student_name}
              </Typography>
              <Typography variant="body2" color="textSecondary" gutterBottom>
                Client Email: {reportToSend.client_email}
              </Typography>
              <Typography variant="body2" color="textSecondary" gutterBottom>
                Student Email: {reportToSend.student_email || 'Not available'}
              </Typography>
              <Typography variant="body2" color="textSecondary" gutterBottom>
                Lesson ID: {reportToSend.lesson_id || 'Not available'}
              </Typography>
              <Typography variant="body2" color="textSecondary" gutterBottom>
                Appointment ID: {reportToSend.appointment_id || 'Not available'}
              </Typography>
              <Typography variant="body2" color="textSecondary" gutterBottom>
                Email Subject: {reportToSend.email_subject || 'Acme Operations Lesson Report'}
              </Typography>
              <TextField
                fullWidth
                label="Custom Email (for testing)"
                placeholder="Enter custom email address or leave blank to use original"
                value={customEmail}
                onChange={(e) => setCustomEmail(e.target.value)}
                margin="normal"
                helperText="Leave blank to send to the original client email"
                autoFocus
              />
            </Box>
          )}
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setSendDialogOpen(false)}>Cancel</Button>
          <Button 
            onClick={handleConfirmSend} 
            variant="contained" 
            color="primary"
            disabled={sending}
          >
            {sending ? <CircularProgress size={20} /> : 'Send Report'}
          </Button>
        </DialogActions>
        </Dialog>

        <Snackbar
        open={toast.open}
        autoHideDuration={3000}
        onClose={() => setToast((t) => ({ ...t, open: false }))}
        anchorOrigin={{ vertical: "bottom", horizontal: "center" }}
      >
        <Alert
          onClose={() => setToast((t) => ({ ...t, open: false }))}
          severity={toast.severity}
          sx={{ width: "100%" }}
        >
          {toast.message}
        </Alert>
        </Snackbar>

        <Dialog open={openDelete} onClose={handleCancelDelete} closeAfterTransition={false}>
        <DialogTitle>Delete Report?</DialogTitle>
        <DialogContent>
          <Typography>
            Are you sure you want to permanently delete this report?
          </Typography>
        </DialogContent>
        <DialogActions>
          <Button onClick={handleCancelDelete} autoFocus>Cancel</Button>
          <Button color="error" onClick={handleConfirmDelete}>
            Delete
          </Button>
        </DialogActions>
      </Dialog>

      {/* Bulk Delete Confirmation Dialog */}
      <Dialog open={bulkDeleteOpen} onClose={handleCancelBulkDelete} closeAfterTransition={false}>
        <DialogTitle>Delete Selected Reports?</DialogTitle>
        <DialogContent>
          <Typography>
            Are you sure you want to permanently delete {selectedRows.length} unsent report(s)? 
            This action cannot be undone.
          </Typography>
          {selectedRows.length > 100 && (
            <Typography variant="body2" color="textSecondary" sx={{ mt: 2 }}>
              Large deletion will be processed in batches to ensure stability.
            </Typography>
          )}
        </DialogContent>
        <DialogActions>
          <Button onClick={handleCancelBulkDelete} disabled={bulkDeleting} autoFocus>
            Cancel
          </Button>
          <Button 
            color="error" 
            onClick={handleConfirmBulkDelete}
            disabled={bulkDeleting}
          >
            {bulkDeleting ? <CircularProgress size={20} /> : `Delete ${selectedRows.length} Reports`}
          </Button>
        </DialogActions>
      </Dialog>

      {/* Email Tracking Details Dialog */}
      <Dialog open={trackingDialogOpen} onClose={() => setTrackingDialogOpen(false)} maxWidth="md" fullWidth closeAfterTransition={false}>
        <DialogTitle>Email Tracking Details</DialogTitle>
        <DialogContent>
          {loadingTracking ? (
            <Box display="flex" justifyContent="center" p={3}>
              <CircularProgress />
            </Box>
          ) : trackingData ? (
            <Box>
              {/* Engagement Summary */}
              <Box mb={3}>
                <Typography variant="h6" gutterBottom>Engagement Summary</Typography>
                <Box display="flex" gap={2} flexWrap="wrap">
                  <Chip 
                    label={`Score: ${((trackingData.data?.engagementScore || 0) * 100).toFixed(0)}%`}
                    color={trackingData.data?.engagementScore >= 0.7 ? 'success' : trackingData.data?.engagementScore >= 0.4 ? 'warning' : 'default'}
                  />
                  <Chip 
                    label={`Opened: ${trackingData.data?.openedCount || 0}x`}
                    color={trackingData.data?.opened ? 'success' : 'default'}
                  />
                  <Chip 
                    label={`Clicked: ${trackingData.data?.clickedCount || 0}x`}
                    color={trackingData.data?.clicked ? 'success' : 'default'}
                  />
                </Box>
              </Box>

              {/* Timeline */}
              <Box mb={3}>
                <Typography variant="h6" gutterBottom>Timeline</Typography>
                <Box>
                  {trackingData.data?.deliveredAt && (
                    <Box display="flex" justifyContent="space-between" mb={1}>
                      <Typography variant="body2">📧 Delivered:</Typography>
                      <Typography variant="body2">{dayjs(trackingData.data.deliveredAt).utc().tz('America/Chicago').format("M/D/YYYY h:mm A")}</Typography>
                    </Box>
                  )}
                  {trackingData.data?.openedAt && (
                    <Box display="flex" justifyContent="space-between" mb={1}>
                      <Typography variant="body2">👁️ First Opened:</Typography>
                      <Typography variant="body2">{dayjs(trackingData.data.openedAt).utc().tz('America/Chicago').format("M/D/YYYY h:mm A")}</Typography>
                    </Box>
                  )}
                  {trackingData.data?.clickedAt && (
                    <Box display="flex" justifyContent="space-between" mb={1}>
                      <Typography variant="body2">🔗 First Clicked:</Typography>
                      <Typography variant="body2">{dayjs(trackingData.data.clickedAt).utc().tz('America/Chicago').format("M/D/YYYY h:mm A")}</Typography>
                    </Box>
                  )}
                  {trackingData.data?.lastEngagementAt && (
                    <Box display="flex" justifyContent="space-between" mb={1}>
                      <Typography variant="body2">⏰ Last Activity:</Typography>
                      <Typography variant="body2">{dayjs(trackingData.data.lastEngagementAt).utc().tz('America/Chicago').format("M/D/YYYY h:mm A")}</Typography>
                    </Box>
                  )}
                </Box>
              </Box>

              {/* Clicked URLs */}
              {trackingData.data?.clickedUrls && trackingData.data.clickedUrls.length > 0 && (
                <Box mb={3}>
                  <Typography variant="h6" gutterBottom>Clicked Links</Typography>
                  <Box>
                    {trackingData.data.clickedUrls.map((url, index) => (
                      <Box key={index} mb={1}>
                        <Typography variant="body2" component="a" href={url} target="_blank" rel="noopener noreferrer" 
                          className="text-blue-600 underline break-all">
                          {url}
                        </Typography>
                      </Box>
                    ))}
                  </Box>
                </Box>
              )}

              {/* Brevo Events Timeline */}
              {trackingData.data?.events && Array.isArray(trackingData.data.events) && trackingData.data.events.length > 0 && (
                <Box mb={3}>
                  <Typography variant="h6" gutterBottom>Email Events Timeline</Typography>
                  <Box sx={{ maxHeight: '300px', overflowY: 'auto' }}>
                    {trackingData.data.events
                      .sort((a, b) => {
                        const dateA = new Date(a.date || a.timestamp || 0);
                        const dateB = new Date(b.date || b.timestamp || 0);
                        return dateB - dateA; // Most recent first
                      })
                      .map((event, index) => {
                        const eventDate = event.date || event.timestamp;
                        const eventType = event.event || 'unknown';
                        const isProxyEvent = eventType === 'loaded_by_proxy' || eventType === 'loaded-by-proxy';
                        const isNegativeEvent = ['bounced', 'complained', 'unsubscribed', 'spam'].includes(eventType);
                        
                        return (
                          <Box 
                            key={index} 
                            mb={1.5} 
                            p={1.5} 
                            sx={{ 
                              bgcolor: isProxyEvent 
                                ? 'info.light' 
                                : isNegativeEvent 
                                  ? 'error.light' 
                                  : 'grey.100',
                              borderRadius: 1,
                              borderLeft: `3px solid ${
                                isProxyEvent 
                                  ? '#1976d2' 
                                  : isNegativeEvent 
                                    ? '#d32f2f' 
                                    : '#4caf50'
                              }`
                            }}
                          >
                            <Box display="flex" justifyContent="space-between" alignItems="flex-start">
                              <Box flex={1}>
                                <Typography variant="body2" fontWeight="bold">
                                  {isProxyEvent && '🔒 '}
                                  {eventType === 'opened' || eventType === 'open' ? '📧 Opened' :
                                   eventType === 'clicked' || eventType === 'click' ? '🔗 Clicked' :
                                   eventType === 'delivered' ? '✅ Delivered' :
                                   eventType === 'sent' || eventType === 'request' ? '📤 Sent' :
                                   eventType === 'loaded_by_proxy' || eventType === 'loaded-by-proxy' ? '🔒 Loaded by Proxy (Apple Mail Privacy)' :
                                   eventType === 'bounced' ? '📧 Bounced' :
                                   eventType === 'complained' || eventType === 'spam' ? '⚠️ Marked as Spam' :
                                   eventType === 'unsubscribed' ? '🚫 Unsubscribed' :
                                   eventType.charAt(0).toUpperCase() + eventType.slice(1).replace(/_/g, ' ')}
                                </Typography>
                                {isProxyEvent && (
                                  <Typography variant="caption" color="text.secondary" sx={{ mt: 0.5, display: 'block' }}>
                                    Email opened via Apple Mail Privacy Protection or similar proxy service
                                  </Typography>
                                )}
                                {event.email && (
                                  <Typography variant="caption" color="text.secondary" sx={{ mt: 0.5, display: 'block' }}>
                                    To: {event.email}
                                  </Typography>
                                )}
                                {event.url && (
                                  <Typography variant="caption" color="text.secondary" sx={{ mt: 0.5, display: 'block' }}>
                                    URL: <a href={event.url} target="_blank" rel="noopener noreferrer" className="text-blue-600">{event.url}</a>
                                  </Typography>
                                )}
                              </Box>
                              {eventDate && (
                                <Typography variant="caption" color="text.secondary" sx={{ ml: 2 }}>
                                  {dayjs(eventDate).utc().tz('America/Chicago').format("M/D/YYYY h:mm A")}
                                </Typography>
                              )}
                            </Box>
                          </Box>
                        );
                      })}
                  </Box>
                </Box>
              )}

              {/* Brevo Message ID */}
              {trackingData.data?.messageId && (
                <Box mb={3}>
                  <Typography variant="h6" gutterBottom>Technical Details</Typography>
                  <Typography variant="body2">
                    <strong>Brevo Message ID:</strong> {trackingData.data.messageId}
                  </Typography>
                </Box>
              )}

              {/* Negative Events */}
              {(trackingData.data?.bounced || trackingData.data?.complained || trackingData.data?.unsubscribed) && (
                <Box mb={3}>
                  <Typography variant="h6" gutterBottom color="error">Issues</Typography>
                  <Box>
                    {trackingData.data.bounced && (
                      <Chip label="📧 Bounced" color="error" size="small" sx={{ mr: 1, mb: 1 }} />
                    )}
                    {trackingData.data.complained && (
                      <Chip label="⚠️ Marked as Spam" color="error" size="small" sx={{ mr: 1, mb: 1 }} />
                    )}
                    {trackingData.data.unsubscribed && (
                      <Chip label="🚫 Unsubscribed" color="error" size="small" sx={{ mr: 1, mb: 1 }} />
                    )}
                  </Box>
                </Box>
              )}
            </Box>
          ) : (
            <Typography>No tracking data available</Typography>
          )}
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setTrackingDialogOpen(false)} autoFocus>Close</Button>
        </DialogActions>
      </Dialog>

      {/* Sent Emails Dialog */}
      <Dialog 
        open={sentEmailsDialogOpen} 
        onClose={() => setSentEmailsDialogOpen(false)} 
        maxWidth="md" 
        fullWidth 
        closeAfterTransition={false}
      >
        <DialogTitle>Sent Email Addresses</DialogTitle>
        <DialogContent>
          {currentReportForEmails && (() => {
            const sentEmails = currentReportForEmails.sent_emails;
            const emails = Array.isArray(sentEmails) 
              ? sentEmails 
              : (typeof sentEmails === 'string' ? JSON.parse(sentEmails) : []);
            
            if (!emails || emails.length === 0) {
              return (
                <Typography variant="body2" color="textSecondary">
                  No email tracking information available.
                </Typography>
              );
            }
            
            const successfulEmails = emails.filter(e => e.success);
            const failedEmails = emails.filter(e => !e.success);
            
            return (
              <Box>
                <Box mb={2}>
                  <Typography variant="body2" color="textSecondary">
                    <strong>Total:</strong> {emails.length} email{emails.length !== 1 ? 's' : ''} 
                    {' '}({successfulEmails.length} successful{failedEmails.length > 0 ? `, ${failedEmails.length} failed` : ''})
                  </Typography>
                </Box>
                
                {successfulEmails.length > 0 && (
                  <Box mb={3}>
                    <Typography variant="h6" gutterBottom>✅ Successfully Sent</Typography>
                    {successfulEmails.map((emailData, index) => (
                      <Box key={index} mb={1} p={1} sx={{ bgcolor: 'success.light', borderRadius: 1 }}>
                        <Typography variant="body2">
                          <strong>{emailData.studentName || 'N/A'}</strong>
                        </Typography>
                        <Typography variant="body2" color="text.secondary">
                          {emailData.email}
                        </Typography>
                        <Typography variant="caption" color="text.secondary">
                          Type: {emailData.type === 'client' ? 'Client/Organization' : 'Student Parent'}
                        </Typography>
                      </Box>
                    ))}
                  </Box>
                )}
                
                {failedEmails.length > 0 && (
                  <Box>
                    <Typography variant="h6" gutterBottom color="error">❌ Failed to Send</Typography>
                    {failedEmails.map((emailData, index) => (
                      <Box key={index} mb={1} p={1} sx={{ bgcolor: 'error.light', borderRadius: 1 }}>
                        <Typography variant="body2">
                          <strong>{emailData.studentName || 'N/A'}</strong>
                        </Typography>
                        <Typography variant="body2" color="text.secondary">
                          {emailData.email || 'No email available'}
                        </Typography>
                        <Typography variant="caption" color="error">
                          Error: {emailData.error || 'Unknown error'}
                        </Typography>
                      </Box>
                    ))}
                  </Box>
                )}
              </Box>
            );
          })()}
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setSentEmailsDialogOpen(false)} autoFocus>Close</Button>
        </DialogActions>
      </Dialog>
    </Box>
  );
}
