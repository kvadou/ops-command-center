import React, { useState, useEffect, useCallback } from "react";
import axios from "axios";
import {
  Alert,
  Box,
  Button,
  Chip,
  CircularProgress,
  Collapse,
  FormControl,
  IconButton,
  InputLabel,
  MenuItem,
  Paper,
  Select,
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TableRow,
  TablePagination,
  Tooltip,
  Typography,
} from "@mui/material";
import { ChevronDownIcon, ChevronUpIcon, ExclamationTriangleIcon, CheckCircleIcon, ExclamationCircleIcon, ArrowTopRightOnSquareIcon } from '@heroicons/react/24/outline';

const statusColors = {
  success: "success",
  partial: "warning",
  failed: "error",
};

const statusIcons = {
  success: <CheckCircleIcon className="h-4 w-4" />,
  partial: <ExclamationTriangleIcon className="h-4 w-4" />,
  failed: <ExclamationCircleIcon className="h-4 w-4" />,
};

function formatDateTime(iso) {
  if (!iso) return "—";
  const d = new Date(iso);
  return d.toLocaleString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
    hour: "numeric",
    minute: "2-digit",
    hour12: true,
  });
}

function formatTimeFromISO(iso) {
  if (!iso) return "—";
  const d = new Date(iso);
  return d.toLocaleString("en-US", {
    hour: "numeric",
    minute: "2-digit",
    hour12: true,
    timeZone: "America/New_York",
  });
}

function HistoryDetailRow({ recordId }) {
  const [detail, setDetail] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    const fetchDetail = async () => {
      try {
        const res = await axios.get(`/api/job-builder/history/${recordId}`);
        if (!cancelled) setDetail(res.data);
      } catch (err) {
        console.error("Failed to load history detail:", err);
      } finally {
        if (!cancelled) setLoading(false);
      }
    };
    fetchDetail();
    return () => { cancelled = true; };
  }, [recordId]);

  if (loading) {
    return (
      <Box sx={{ p: 3, display: "flex", justifyContent: "center" }}>
        <CircularProgress size={24} />
      </Box>
    );
  }

  if (!detail) {
    return (
      <Box sx={{ p: 2 }}>
        <Alert severity="error">Failed to load details</Alert>
      </Box>
    );
  }

  const requestPayload = detail.request_payload || {};
  const responsePayload = detail.response_payload || {};
  const appointmentPayloads = requestPayload.appointmentPayloads || [];
  const tcAppointments = responsePayload.appointments || [];
  const anomalies = detail.anomalies || [];
  const anomalyDates = new Set(anomalies.map((a) => a.lesson_date));

  return (
    <Box sx={{ p: 2, bgcolor: "grey.50" }}>
      {anomalies.length > 0 && (
        <Alert severity="warning" sx={{ mb: 2 }}>
          <Typography variant="subtitle2" gutterBottom>
            DST Anomaly Flags
          </Typography>
          {anomalies.map((a, i) => (
            <Typography key={i} variant="body2">
              {a.lesson_date}: Near DST transition ({a.transition_date}), {a.days_from_transition} days away.
              UTC offset used: {a.offset_hours}h. Expected local time: {a.expected_time}
            </Typography>
          ))}
        </Alert>
      )}

      <Typography variant="subtitle2" gutterBottom>
        Appointments ({appointmentPayloads.length} requested, {tcAppointments.length} created)
      </Typography>

      <TableContainer>
        <Table size="small">
          <TableHead>
            <TableRow>
              <TableCell>Date</TableCell>
              <TableCell>Selected Time</TableCell>
              <TableCell>UTC Sent</TableCell>
              <TableCell>ET Result</TableCell>
              <TableCell>TC Appt ID</TableCell>
              <TableCell>Status</TableCell>
            </TableRow>
          </TableHead>
          <TableBody>
            {appointmentPayloads.map((ap, idx) => {
              const tcAppt = tcAppointments[idx];
              const isAnomaly = anomalyDates.has(ap.lessonDate);
              return (
                <TableRow
                  key={idx}
                  sx={isAnomaly ? { bgcolor: "warning.50" } : undefined}
                >
                  <TableCell>
                    {ap.lessonDate}
                    {isAnomaly && (
                      <Tooltip title="Near DST transition">
                        <ExclamationTriangleIcon
                          className="h-4 w-4"
                          style={{ marginLeft: 4, verticalAlign: "middle", color: '#ed6c02' }}
                        />
                      </Tooltip>
                    )}
                  </TableCell>
                  <TableCell>{ap.localTime || "—"}</TableCell>
                  <TableCell sx={{ fontFamily: "monospace", fontSize: "0.75rem" }}>
                    {ap.startUTC || "—"}
                  </TableCell>
                  <TableCell>
                    {ap.startUTC ? formatTimeFromISO(ap.startUTC) : "—"}
                  </TableCell>
                  <TableCell>
                    {tcAppt?.id ? (
                      <a
                        href={`https://account.acmeops.com/cal/appointment/${tcAppt.id}/`}
                        target="_blank"
                        rel="noopener noreferrer"
                        style={{ display: "flex", alignItems: "center", gap: 4 }}
                      >
                        {tcAppt.id}
                        <ArrowTopRightOnSquareIcon className="h-4 w-4" />
                      </a>
                    ) : (
                      "—"
                    )}
                  </TableCell>
                  <TableCell>
                    {ap.error ? (
                      <Chip label="Failed" size="small" color="error" />
                    ) : (
                      <Chip label="Created" size="small" color="success" />
                    )}
                  </TableCell>
                </TableRow>
              );
            })}
          </TableBody>
        </Table>
      </TableContainer>

      {requestPayload.formData && (
        <Box sx={{ mt: 2 }}>
          <Typography variant="subtitle2" gutterBottom>
            Form Data
          </Typography>
          <Box
            sx={{
              p: 1,
              bgcolor: "grey.100",
              borderRadius: 1,
              maxHeight: 200,
              overflow: "auto",
              fontFamily: "monospace",
              fontSize: "0.75rem",
            }}
          >
            <pre style={{ margin: 0 }}>
              {JSON.stringify(requestPayload.formData, null, 2)}
            </pre>
          </Box>
        </Box>
      )}
    </Box>
  );
}

export default function JobBuilderHistory() {
  const [records, setRecords] = useState([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [page, setPage] = useState(0);
  const [rowsPerPage, setRowsPerPage] = useState(25);
  const [statusFilter, setStatusFilter] = useState("");
  const [expandedRow, setExpandedRow] = useState(null);

  const fetchHistory = useCallback(async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams({
        limit: rowsPerPage,
        offset: page * rowsPerPage,
      });
      if (statusFilter) params.set("status", statusFilter);

      const res = await axios.get(`/api/job-builder/history?${params}`);
      setRecords(res.data.records || []);
      setTotal(res.data.total || 0);
    } catch (err) {
      console.error("Failed to load job builder history:", err);
    } finally {
      setLoading(false);
    }
  }, [page, rowsPerPage, statusFilter]);

  useEffect(() => {
    fetchHistory();
  }, [fetchHistory]);

  const handleToggleRow = (id) => {
    setExpandedRow(expandedRow === id ? null : id);
  };

  return (
    <Paper sx={{ p: 3 }}>
      <Box sx={{ display: "flex", justifyContent: "space-between", alignItems: "center", mb: 2 }}>
        <Typography variant="h6">Job Builder History</Typography>
        <Box sx={{ display: "flex", gap: 2, alignItems: "center" }}>
          <FormControl size="small" sx={{ minWidth: 120 }}>
            <InputLabel>Status</InputLabel>
            <Select
              value={statusFilter}
              label="Status"
              onChange={(e) => {
                setStatusFilter(e.target.value);
                setPage(0);
              }}
            >
              <MenuItem value="">All</MenuItem>
              <MenuItem value="success">Success</MenuItem>
              <MenuItem value="partial">Partial</MenuItem>
              <MenuItem value="failed">Failed</MenuItem>
            </Select>
          </FormControl>
          <Button size="small" variant="outlined" onClick={fetchHistory}>
            Refresh
          </Button>
        </Box>
      </Box>

      {loading ? (
        <Box sx={{ display: "flex", justifyContent: "center", p: 4 }}>
          <CircularProgress />
        </Box>
      ) : records.length === 0 ? (
        <Alert severity="info">
          No job builder history found. History will be recorded for all future jobs created via the Job Builder.
        </Alert>
      ) : (
        <>
          <TableContainer>
            <Table size="small">
              <TableHead>
                <TableRow>
                  <TableCell width={40} />
                  <TableCell>Created</TableCell>
                  <TableCell>Category</TableCell>
                  <TableCell>Job Title</TableCell>
                  <TableCell>TC Service</TableCell>
                  <TableCell align="center">Lessons</TableCell>
                  <TableCell align="center">Appts</TableCell>
                  <TableCell>Status</TableCell>
                  <TableCell>Flags</TableCell>
                </TableRow>
              </TableHead>
              <TableBody>
                {records.map((row) => {
                  const hasAnomalies = row.anomalies && row.anomalies.length > 0;
                  const isExpanded = expandedRow === row.id;
                  return (
                    <React.Fragment key={row.id}>
                      <TableRow
                        hover
                        onClick={() => handleToggleRow(row.id)}
                        sx={{ cursor: "pointer" }}
                      >
                        <TableCell>
                          <IconButton size="small">
                            {isExpanded ? <ChevronUpIcon className="h-5 w-5" /> : <ChevronDownIcon className="h-5 w-5" />}
                          </IconButton>
                        </TableCell>
                        <TableCell sx={{ whiteSpace: "nowrap" }}>
                          {formatDateTime(row.created_at)}
                        </TableCell>
                        <TableCell>
                          <Chip label={row.category || "—"} size="small" variant="outlined" />
                        </TableCell>
                        <TableCell sx={{ maxWidth: 300, overflow: "hidden", textOverflow: "ellipsis" }}>
                          {row.job_title || "—"}
                        </TableCell>
                        <TableCell>
                          {row.tc_service_id ? (
                            <a
                              href={`https://account.acmeops.com/cal/service/${row.tc_service_id}/`}
                              target="_blank"
                              rel="noopener noreferrer"
                              onClick={(e) => e.stopPropagation()}
                              style={{ display: "flex", alignItems: "center", gap: 4 }}
                            >
                              {row.tc_service_id}
                              <ArrowTopRightOnSquareIcon className="h-4 w-4" />
                            </a>
                          ) : (
                            "—"
                          )}
                        </TableCell>
                        <TableCell align="center">{row.lesson_count}</TableCell>
                        <TableCell align="center">{row.appointment_count}</TableCell>
                        <TableCell>
                          <Chip
                            icon={statusIcons[row.status]}
                            label={row.status}
                            size="small"
                            color={statusColors[row.status] || "default"}
                            variant="outlined"
                          />
                        </TableCell>
                        <TableCell>
                          {hasAnomalies && (
                            <Tooltip title={`${row.anomalies.length} appointment(s) near DST transition`}>
                              <Chip
                                icon={<ExclamationTriangleIcon className="h-4 w-4" />}
                                label={`${row.anomalies.length} DST`}
                                size="small"
                                color="warning"
                              />
                            </Tooltip>
                          )}
                        </TableCell>
                      </TableRow>
                      <TableRow>
                        <TableCell colSpan={9} sx={{ p: 0, border: isExpanded ? undefined : "none" }}>
                          <Collapse in={isExpanded} timeout="auto" unmountOnExit>
                            <HistoryDetailRow recordId={row.id} />
                          </Collapse>
                        </TableCell>
                      </TableRow>
                    </React.Fragment>
                  );
                })}
              </TableBody>
            </Table>
          </TableContainer>
          <TablePagination
            component="div"
            count={total}
            page={page}
            onPageChange={(_, newPage) => setPage(newPage)}
            rowsPerPage={rowsPerPage}
            onRowsPerPageChange={(e) => {
              setRowsPerPage(parseInt(e.target.value, 10));
              setPage(0);
            }}
            rowsPerPageOptions={[10, 25, 50]}
          />
        </>
      )}
    </Paper>
  );
}
