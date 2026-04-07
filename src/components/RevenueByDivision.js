import React, { useEffect, useState, useMemo } from "react";
import {
  Box,
  Button,
  CircularProgress,
  ToggleButton,
  ToggleButtonGroup,
  Typography,
} from "@mui/material";
import dayjs from "dayjs";
import utc from "dayjs/plugin/utc";
import timezone from "dayjs/plugin/timezone";
import axios from "axios";
import StatisticCard from "./StatisticCard";
import {
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions,
} from "@mui/material";

import {
  DataGrid,
  GridToolbarContainer,
  GridToolbarExport,
} from "@mui/x-data-grid";

import EnhancedBarChart from "./EnhancedBarChart";

dayjs.extend(utc);
dayjs.extend(timezone);
dayjs.tz.setDefault("America/New_York");

const COLORS = [
  "#6a469d",
  "#7ed9ed",
  "#1c1f20",
  "#18556b",
  "#269e9d",
  "#34b256",
  "#f79a30",
  "#3b92b6",
  "#da2e72",
  "#daad3b",
];

const numberFormatter = new Intl.NumberFormat("en-US", {
  style: "currency",
  currency: "USD",
  minimumFractionDigits: 2,
});

const monthKeys = [
  "jan",
  "feb",
  "mar",
  "apr",
  "may",
  "jun",
  "jul",
  "aug",
  "sep",
  "oct",
  "nov",
  "dec",
];

const currentMonthKey = monthKeys[dayjs().month()];

function ExportToolbar() {
  return (
    <GridToolbarContainer>
      <GridToolbarExport
        csvOptions={{
          fileName: "exported-data",
          utf8WithBom: true,
        }}
      />
    </GridToolbarContainer>
  );
}

const RevenueByDivision = () => {
  const [selectedYear, setSelectedYear] = useState(() => dayjs().year());
  const [selectedMonth, setSelectedMonth] = useState(
    () => monthKeys[dayjs().month()]
  );

  const [viewMode, setViewMode] = useState("month");
  const [loading, setLoading] = useState(false);
  const [report, setReport] = useState(null);
  const [divisionData, setDivisionData] = useState({});
  const [labelToDivisionMap, setLabelToDivisionMap] = useState({});

  const [sessionModalOpen, setSessionModalOpen] = useState(false);
  const [selectedLabel, setSelectedLabel] = useState(null);
  const [sessions, setSessions] = useState([]);
  const [expandedSession, setExpandedSession] = useState(null);

  const appointmentSummaries = useMemo(() => {
    console.log("📝 building appointmentSummaries from sessions:", sessions);
    const map = {};
    sessions.forEach((s) => {
      if (!map[s.appointment_id]) {
        map[s.appointment_id] = {
          appointment_id: s.appointment_id,
          appointment_start: s.appointment_start,
          status: s.appointment_status,
          service_name: s.service_name,
          charge_type: s.charge_type,
          units: s.units,
          expected_revenue: s.total_expected_revenue,
          expected_tutor_pay: s.total_expected_tutor_pay,
          children: [],
        };
      }
      map[s.appointment_id].children.push(s);
    });
    return Object.values(map);
  }, [sessions]);

  const recipientColumns = [
    { field: "recipient_name", headerName: "Student", width: 180 },

    { field: "recipient_status", headerName: "Attendance", width: 120 },
    {
      field: "student_revenue",
      headerName: "Revenue",
      width: 140,
      renderCell: ({ value }) => numberFormatter.format(value),
    },
  ];

  const contractorColumns = [
    { field: "contractor_name", headerName: "Tutor", width: 180 },
    {
      field: "pay_rate",
      headerName: "Pay Rate",
      width: 140,
      renderCell: ({ value }) => numberFormatter.format(value),
    },
    {
      field: "student_tutor_pay",
      headerName: "Tutor Pay",
      width: 140,
      renderCell: ({ value }) => numberFormatter.format(value),
    },
  ];

  const parentColumns = [
    {
      field: "appointment_id",
      headerName: "Lesson ID",
      width: 150,
      renderCell: (params) => (
        <a
          href={`https://secure.tutorcruncher.com/cal/appointments/${params.value}/`}
          target="_blank"
          rel="noopener noreferrer"
          style={{
            color: "#1976d2",
            textDecoration: "none",
          }}
        >
          {params.value}
        </a>
      ),
    },

    {
      field: "appointment_start",
      headerName: "Start",
      width: 200,
      renderCell: ({ value }) => {
        const dt = dayjs.utc(value).tz();

        return <div>{dt.format("dddd D MMMM hh:mm A")}</div>;
      },
    },
    { field: "status", headerName: "Status", width: 120 },
    {
      field: "charge_type",
      headerName: "Charge Type",
      width: 150,
    },
    { field: "service_name", headerName: "Service", width: 200 },
    { field: "units", headerName: "Units", width: 80 },
    {
      field: "expected_revenue",
      headerName: "Total Expected Revenue",
      width: 160,
      renderCell: (params) => {
        return numberFormatter.format(params.value ?? 0);
      },
    },

    {
      field: "expected_tutor_pay",
      headerName: "Total Expected Tutor Pay",
      width: 180,
      renderCell: (params) => {
        return numberFormatter.format(params.value ?? 0);
      },
    },
  ];

  const buildSessionDetails = (session) => {
    if (!session || !Array.isArray(session.children)) {
      return { recipients: [], contractors: [] };
    }

    const recipients = [];
    const seenRecipients = new Set();
    session.children.forEach((child) => {
      if (!seenRecipients.has(child.recipient_id)) {
        seenRecipients.add(child.recipient_id);
        recipients.push({
          ...child,
          student_revenue: child.student_revenue,
          recipient_status: child.recipient_status,
        });
      }
    });

    const contractors = [];
    const seenContractors = new Set();
    session.children.forEach((child) => {
      if (!seenContractors.has(child.contractor_id)) {
        seenContractors.add(child.contractor_id);
        contractors.push({
          ...child,
          pay_rate: child.pay_rate,
          student_tutor_pay: child.student_tutor_pay,
        });
      }
    });

    return { recipients, contractors };
  };

  const { recipients: expandedRecipients, contractors: expandedContractors } = useMemo(
    () => buildSessionDetails(expandedSession),
    [expandedSession]
  );

  const handleViewSessions = async (label) => {
    setSelectedLabel(label);
    setSessionModalOpen(true);

    let startDate, endDate;
    if (viewMode === "ytd") {
      startDate = `${selectedYear}-01-01`;
      endDate = `${selectedYear}-12-31`;
    } else {
      const m = monthKeys.indexOf(selectedMonth) + 1;
      const mm = String(m).padStart(2, "0");
      const yyyy = selectedYear;
      startDate = `${yyyy}-${mm}-01`;
      endDate = `${yyyy}-${mm}-${dayjs(`${yyyy}-${mm}-01`).daysInMonth()}`;
    }

    
    try {
      const response = await axios.get("/api/revenue-sessions-detail", {
        params: { label, startDate, endDate },
      });
      setSessions(response.data.sessions || []);
      setExpandedSession(null);
    } catch (err) {
      console.error("Error fetching sessions:", err);
      setSessions([]);
    }
  };

  const labelColorMap = {};
  let labelColorIndex = 0;

  const getColorForLabel = (label) => {
    if (!labelColorMap[label]) {
      labelColorMap[label] = COLORS[labelColorIndex % COLORS.length];
      labelColorIndex++;
    }
    return labelColorMap[label];
  };

  const parse = (val) => {
    if (val === null || val === undefined) return 0;
    const parsed =
      typeof val === "string"
        ? parseFloat(val.replace(/[^0-9.-]+/g, ""))
        : typeof val === "number"
        ? val
        : 0;
    return isNaN(parsed) ? 0 : parsed;
  };

   useEffect(() => {
   const fetchDivisionMappings = async () => {
     
     try {

      const { data } = await axios.post(
  "/api/divisions-and-labels",
  {},
  {
    headers: {
      "Content-Type": "application/json",
    },
  }
);

      if (!Array.isArray(data)) {
        console.error("Unexpected format from /get-divisions-and-labels", data);
        return;
      }
      const map = {};
      data.forEach(({ division, labels }) =>
        labels.forEach(label => (map[label] = division))
      );
      setLabelToDivisionMap(map);
    } catch (err) {
      console.error("Failed to fetch division-label mapping:", err);
    }
   };

   fetchDivisionMappings();
 }, []);


  const fetchMasterReportForYear = async (year) => {
    setLoading(true);
    try {
      const startDate = `${year}-01-01`;
      const endDate = `${year}-12-31`;

      const response = await axios.get("/api/master-report", {
        params: { year, startDate, endDate },
      });

      console.log(
        "Labels and expected revenues:",
        response.data.revenueByLabel
      );

      setReport(response.data);
      setDivisionData(response.data.revenueByLabel || {});

      let totalFromLabelBreakdown = 0;
      Object.values(report?.labelBreakdown || {}).forEach((data) => {
        const val =
          viewMode === "ytd"
            ? data.ytdRevenue
            : data.revenueMonths?.[selectedMonth];
        totalFromLabelBreakdown += parse(val);
      });
    } catch (err) {
      console.error("Error fetching master report:", err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchMasterReportForYear(selectedYear);
  }, [selectedYear]);

  const getMetric = (path) => {
    if (!report) return 0;

    const value =
      viewMode === "ytd"
        ? report?.[path]?.ytd
        : report?.[path]?.months?.[selectedMonth];

    return parse(value);
  };

  const grossProfitAmount = getMetric("paidRevenue") - getMetric("tutorPay");
  const netProfitAmount =
    getMetric("paidRevenue") -
    getMetric("tutorPay") -
    getMetric("tutorAdhocPay");

  const getChartRows = () => {
    const revenueByLabel = report?.revenueByLabel || {};

    return Object.entries(revenueByLabel).map(([label, data]) => ({
      label,
      expectedRevenue:
        viewMode === "ytd"
          ? parse(data.ytd)
          : parse(data.months?.[selectedMonth]),
      color: getColorForLabel(label),
    }));
  };

  const getExpectedTutorPay = () => {
    if (!report) return 0;
    const monthKey = selectedMonth;
    return parse(report.expectedTutorPay?.months?.[monthKey]);
  };

  const getTableRows = () => {
    const revenueByLabel = report?.revenueByLabel || {};
    const labelBreakdown = report?.labelBreakdown || {};
    const monthKey = selectedMonth;

    return Object.keys(revenueByLabel).map((label, index) => {
      const division = labelToDivisionMap[label] || "Unassigned";

      const expectedRevenue =
        viewMode === "ytd"
          ? parse(revenueByLabel[label]?.ytd)
          : parse(revenueByLabel[label]?.months?.[monthKey]);

      const tutorPay =
        viewMode === "ytd"
          ? parse(labelBreakdown?.[label]?.ytdTutorPay)
          : parse(labelBreakdown?.[label]?.tutorPayMonths?.[monthKey]);

      const profit = expectedRevenue - tutorPay;

      return {
        id: index,
        division,
        label,
        expectedRevenue: `$${expectedRevenue.toLocaleString("en-US", {
          minimumFractionDigits: 2,
          maximumFractionDigits: 2,
        })}`,
        tutorPay: `$${tutorPay.toLocaleString("en-US", {
          minimumFractionDigits: 2,
          maximumFractionDigits: 2,
        })}`,
        profit: `$${profit.toLocaleString("en-US", {
          minimumFractionDigits: 2,
          maximumFractionDigits: 2,
        })}`,
      };
    });
  };

  const getDivisionRows = () => {
    const revenueByLabel = report?.revenueByLabel || {};
    const labelBreakdown = report?.labelBreakdown || {};
    const monthKey = selectedMonth;

    const divisionTotals = {};

    Object.keys(revenueByLabel).forEach((label) => {
      const division = labelToDivisionMap[label] || "Unassigned";

      const expectedRevenue =
        viewMode === "ytd"
          ? parse(revenueByLabel[label]?.ytd)
          : parse(revenueByLabel[label]?.months?.[monthKey]);

      const tutorPay =
        viewMode === "ytd"
          ? parse(labelBreakdown?.[label]?.ytdTutorPay)
          : parse(labelBreakdown?.[label]?.tutorPayMonths?.[monthKey]);

      const profit = expectedRevenue - tutorPay;

      if (!divisionTotals[division]) {
        divisionTotals[division] = {
          division,
          expectedRevenue: 0,
          tutorPay: 0,
          profit: 0,
        };
      }

      divisionTotals[division].expectedRevenue += expectedRevenue;
      divisionTotals[division].tutorPay += tutorPay;
      divisionTotals[division].profit += profit;
    });

    return Object.values(divisionTotals).map((d, index) => ({
      id: index,
      division: d.division,
      expectedRevenueRaw: d.expectedRevenue,
      tutorPayRaw: d.tutorPay,
      profitRaw: d.profit,
      expectedRevenue: `$${d.expectedRevenue.toLocaleString("en-US", {
        minimumFractionDigits: 2,
        maximumFractionDigits: 2,
      })}`,
      tutorPay: `$${d.tutorPay.toLocaleString("en-US", {
        minimumFractionDigits: 2,
        maximumFractionDigits: 2,
      })}`,
      profit: `$${d.profit.toLocaleString("en-US", {
        minimumFractionDigits: 2,
        maximumFractionDigits: 2,
      })}`,
    }));
  };

  const tableColumns = [
    { field: "division", headerName: "Division", width: 200 },
    { field: "label", headerName: "Label", width: 200 },
    {
      field: "expectedRevenue",
      headerName: "Expected Revenue",
      width: 200,
    },
    {
      field: "tutorPay",
      headerName: "Expected Tutor Pay",
      width: 200,
    },
    {
      field: "profit",
      headerName: "Expected Profit",
      width: 200,
    },
    {
      field: "viewSessions",
      headerName: "View Sessions",
      width: 160,
      sortable: false,
      renderCell: (params) => (
        <Button
          variant="outlined"
          size="small"
          onClick={() => handleViewSessions(params.row.label)}
        >
          View
        </Button>
      ),
    },
  ];

  const divisionTableColumns = [
    { field: "division", headerName: "Division", width: 200 },
    {
      field: "expectedRevenue",
      headerName: "Total Expected Revenue",
      width: 220,
    },
    { field: "tutorPay", headerName: "Total Expected Tutor Pay", width: 220 },
    { field: "profit", headerName: "Total Expected Profit", width: 220 },
  ];

  return (
    <Box sx={{ width: "100%", p: 2 }}>
      <Box sx={{ mb: 2, display: "flex", gap: 2, flexWrap: "wrap" }}>
        <ToggleButtonGroup
          value={selectedYear}
          exclusive
          onChange={(e, newYear) => newYear && setSelectedYear(newYear)}
        >
          <ToggleButton value={2024}>2024</ToggleButton>
          <ToggleButton value={2025}>2025</ToggleButton>
        </ToggleButtonGroup>

        <ToggleButtonGroup
          value={viewMode}
          exclusive
          onChange={(e, mode) => mode && setViewMode(mode)}
        >
          <ToggleButton value="month">Month</ToggleButton>
          <ToggleButton value="ytd">YTD</ToggleButton>
        </ToggleButtonGroup>
      </Box>

      {viewMode === "month" && (
        <Box sx={{ mb: 2, flexWrap: "wrap", display: "flex", gap: 1 }}>
          {monthKeys.map((m) => (
            <Button
              key={m}
              variant={m === selectedMonth ? "contained" : "outlined"}
              onClick={() => setSelectedMonth(m)}
            >
              {m.toUpperCase()}
            </Button>
          ))}
        </Box>
      )}

      {loading ? (
        <CircularProgress />
      ) : (
        <>
          {!(viewMode === "month" && selectedMonth === currentMonthKey) && (
            <Box
              sx={{
                display: "flex",
                flexWrap: "wrap",
                gap: 3,
                mt: 4,
                mb: 4,
              }}
            >
              <Box
                sx={{
                  flex: "1 1 300px",
                  backgroundColor: "#f79a30",
                  borderRadius: 3,
                  boxShadow: 2,
                  color: "#fff",
                  p: 3,
                  minWidth: 280,
                }}
              >
                <Typography variant="subtitle2" sx={{ opacity: 0.85 }}>
                  Gross Profit Margin
                </Typography>
                <Box
                  sx={{
                    display: "flex",
                    alignItems: "baseline",
                    gap: 2,
                    mt: 1,
                  }}
                >
                  <Typography variant="h4" sx={{ fontWeight: 700 }}>
                    {getMetric("grossProfitMargin").toFixed(1)}%
                  </Typography>
                  <Typography
                    variant="h5"
                    sx={{ fontWeight: 600, opacity: 0.95 }}
                  >
                    {numberFormatter.format(grossProfitAmount)}
                  </Typography>
                </Box>
                <Typography variant="body2" sx={{ mt: 1, opacity: 0.9 }}>
                  (Paid Revenue – Tutor Pay) ÷ Paid Revenue × 100
                </Typography>
              </Box>

              <Box
                sx={{
                  flex: "1 1 300px",
                  backgroundColor: "#34b256",
                  borderRadius: 3,
                  boxShadow: 2,
                  color: "#fff",
                  p: 3,
                  minWidth: 280,
                }}
              >
                <Typography variant="subtitle2" sx={{ opacity: 0.85 }}>
                  Net Profit Margin
                </Typography>
                <Box
                  sx={{
                    display: "flex",
                    alignItems: "baseline",
                    gap: 2,
                    mt: 1,
                  }}
                >
                  <Typography variant="h4" sx={{ fontWeight: 700 }}>
                    {getMetric("netProfitMargin").toFixed(1)}%
                  </Typography>
                  <Typography
                    variant="h5"
                    sx={{ fontWeight: 600, opacity: 0.95 }}
                  >
                    {numberFormatter.format(netProfitAmount)}
                  </Typography>
                </Box>
                <Typography variant="body2" sx={{ mt: 1, opacity: 0.9 }}>
                  (Paid Revenue – All Payouts) ÷ Paid Revenue × 100
                </Typography>
              </Box>
            </Box>
          )}

          <Box sx={{ display: "flex", gap: 3, mt: 4, mb: 4, flexWrap: "wrap" }}>
            <Box
              sx={{
                flex: "1 1 300px",
                backgroundColor: "#3b92b6",
                borderRadius: 3,
                boxShadow: 2,
                color: "#fff",
                p: 3,
                minWidth: 280,
              }}
            >
              <Typography variant="subtitle2" sx={{ opacity: 0.85 }}>
                Expected Revenue
              </Typography>
              <Typography variant="h4" sx={{ fontWeight: 700, mt: 1 }}>
                {numberFormatter.format(getMetric("revenue"))}
              </Typography>
              <Typography variant="body2" sx={{ mt: 1, opacity: 0.9 }}>
                Expected revenue from complete and chargeable sessions.
              </Typography>
            </Box>

            <Box
              sx={{
                flex: "1 1 300px",
                backgroundColor: "#6a469d",
                borderRadius: 3,
                boxShadow: 2,
                color: "#fff",
                p: 3,
                minWidth: 280,
              }}
            >
              <Typography variant="subtitle2" sx={{ opacity: 0.85 }}>
                Paid Revenue
              </Typography>
              <Typography variant="h4" sx={{ fontWeight: 700, mt: 1 }}>
                {numberFormatter.format(getMetric("paidRevenue"))}
              </Typography>
              <Typography variant="body2" sx={{ mt: 1, opacity: 0.9 }}>
                Actual revenue from paid invoices in the date range.
              </Typography>
            </Box>

            <Box
              sx={{
                flex: "1 1 300px",
                backgroundColor: "#3b92b6",
                borderRadius: 3,
                boxShadow: 2,
                color: "#fff",
                p: 3,
                minWidth: 280,
              }}
            >
              <Typography variant="subtitle2" sx={{ opacity: 0.85 }}>
                Expected Tutor Pay
              </Typography>
              <Typography variant="h4" sx={{ fontWeight: 700, mt: 1 }}>
                {numberFormatter.format(getExpectedTutorPay())}
              </Typography>
              <Typography variant="body2" sx={{ mt: 1, opacity: 0.9 }}>
                Estimated tutor pay from expected sessions.
              </Typography>
            </Box>

            <Box
              sx={{
                flex: "1 1 300px",
                backgroundColor: "#6a469d",
                borderRadius: 3,
                boxShadow: 2,
                color: "#fff",
                p: 3,
                minWidth: 280,
              }}
            >
              <Typography variant="subtitle2" sx={{ opacity: 0.85 }}>
                Paid Tutor Pay
              </Typography>
              <Typography variant="h4" sx={{ fontWeight: 700, mt: 1 }}>
                {numberFormatter.format(getMetric("tutorPay"))}
              </Typography>
              <Typography variant="body2" sx={{ mt: 1, opacity: 0.9 }}>
                Tutor pay from paid payment orders.
              </Typography>
            </Box>

            <Box
              sx={{
                flex: "1 1 300px",
                backgroundColor: "#6a469d",
                borderRadius: 3,
                boxShadow: 2,
                color: "#fff",
                p: 3,
                minWidth: 280,
              }}
            >
              <Typography variant="subtitle2" sx={{ opacity: 0.85 }}>
                Paid Tutor Adhoc Pay
              </Typography>
              <Typography variant="h4" sx={{ fontWeight: 700, mt: 1 }}>
                {numberFormatter.format(getMetric("tutorAdhocPay"))}
              </Typography>
              <Typography variant="body2" sx={{ mt: 1, opacity: 0.9 }}>
                Adhoc tutor payouts in the date range.
              </Typography>
            </Box>
          </Box>

          <Box sx={{ px: 2, mt: 4, mb: 4 }}>
            <Typography variant="h6" align="left" gutterBottom>
              Division Totals (
              {viewMode === "ytd" ? "YTD" : selectedMonth.toUpperCase()})
            </Typography>

            <div style={{ width: "100%" }}>
              <DataGrid
                rows={getDivisionRows()}
                columns={divisionTableColumns}
                initialState={{
                  sorting: {
                    sortModel: [{ field: "division", sort: "asc" }],
                  },
                  pagination: { paginationModel: { pageSize: 10, page: 0 } },
                }}
                pageSizeOptions={[10]}
                disableRowSelectionOnClick
                slots={{ toolbar: ExportToolbar }}
                slotProps={{
                  toolbar: { csvOptions: { fileName: "division-totals" } },
                }}
              />
            </div>
          </Box>

          <Box sx={{ width: "80vw", height: 300, px: 2, mb: 4 }}>
            <Typography variant="h6" align="left" gutterBottom>
              Revenue Breakdown by Label (
              {viewMode === "ytd" ? "YTD" : selectedMonth.toUpperCase()})
            </Typography>

            <EnhancedBarChart revenueData={getChartRows()} />
          </Box>

          <Box sx={{ px: 2, mt: 8, mb: 4 }}>
            <div style={{ width: "100%" }}>
              <DataGrid
                rows={getTableRows()}
                columns={tableColumns}
                initialState={{
                  sorting: {
                    sortModel: [{ field: "label", sort: "asc" }],
                  },
                  pagination: { paginationModel: { pageSize: 10, page: 0 } },
                }}
                pageSizeOptions={[10]}
                disableRowSelectionOnClick
                slots={{ toolbar: ExportToolbar }}
                slotProps={{
                  toolbar: { csvOptions: { fileName: "division-totals" } },
                }}
              />
            </div>
          </Box>

          <Dialog
            open={sessionModalOpen}
            onClose={() => {
              setSessionModalOpen(false);
              setExpandedSession(null);
            }}
            maxWidth="xl"
            fullWidth
            disableScrollLock={true}
          >
            <DialogTitle>Sessions for {selectedLabel}</DialogTitle>
            <DialogContent>
              <Box sx={{ height: 800, width: "100%" }}>
                <Typography variant="body2" sx={{ mb: 1, color: "text.secondary" }}>
                  Click a row to view student and tutor details.
                </Typography>
                <DataGrid
                  rows={appointmentSummaries}
                  columns={parentColumns}
                  getRowId={(row) => row.appointment_id}
                  slots={{ toolbar: ExportToolbar }}
                  slotProps={{
                    toolbar: {
                      csvOptions: {
                        fileName: `${selectedLabel ?? "appointments"}-export`,
                        utf8WithBom: true,
                      },
                    },
                  }}
                  initialState={{
                    sorting: {
                      sortModel: [{ field: "appointment_start", sort: "asc" }],
                    },
                    pagination: { paginationModel: { pageSize: 5, page: 0 } },
                  }}
                  pageSizeOptions={[5, 10]}
                  disableRowSelectionOnClick
                  onRowClick={(params) => setExpandedSession(params.row)}
                />
                {expandedSession && (
                  <Box sx={{ mt: 3, display: "grid", gap: 3 }}>
                    <Box sx={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                      <Typography variant="subtitle1">
                        Session Details for Appointment {expandedSession.appointment_id}
                      </Typography>
                      <Button size="small" variant="outlined" onClick={() => setExpandedSession(null)}>
                        Clear Selection
                      </Button>
                    </Box>
                    <Box>
                      <Typography variant="subtitle2" gutterBottom>
                        Students in this session
                      </Typography>
                      <DataGrid
                        rows={expandedRecipients}
                        columns={recipientColumns}
                        getRowId={(r) => r.recipient_id || `${r.recipient_name}-${r.contractor_id}`}
                        autoHeight
                        hideFooter
                        disableRowSelectionOnClick
                      />
                    </Box>
                    <Box>
                      <Typography variant="subtitle2" gutterBottom>
                        Tutors in this session
                      </Typography>
                      <DataGrid
                        rows={expandedContractors}
                        columns={contractorColumns}
                        getRowId={(r) => r.contractor_id || `${r.contractor_name}-${r.recipient_id}`}
                        autoHeight
                        hideFooter
                        disableRowSelectionOnClick
                      />
                    </Box>
                  </Box>
                )}
              </Box>
            </DialogContent>

            <DialogActions>
              <Button onClick={() => setSessionModalOpen(false)}>Close</Button>
            </DialogActions>
          </Dialog>
        </>
      )}
    </Box>
  );
};

export default RevenueByDivision;
