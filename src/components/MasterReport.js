import React, { useState, useEffect } from "react";
import {
  Box,
  Typography,
  ToggleButton,
  ToggleButtonGroup,
  Button,
  IconButton,
  Dialog,
  DialogTitle,
  Tab,
  Tabs,
  DialogContent,
  DialogActions,
} from "@mui/material";
import { InformationCircleIcon, LightBulbIcon } from '@heroicons/react/24/outline';
import dayjs from "dayjs";
import utc from "dayjs/plugin/utc";
import timezone from "dayjs/plugin/timezone";
import {
  DataGrid,
  GridToolbar,
  GridToolbarContainer,
  GridToolbarExport,
} from "@mui/x-data-grid";
import axios from "axios";
import * as XLSX from "xlsx";
import { saveAs } from "file-saver";

dayjs.extend(utc);
dayjs.extend(timezone);

const explanations = {
  lessons:
    "Total count of completed or chargeable lessons in the period, excluding non‑teaching/support work.",
  hours:
    "Sum of all lesson unit durations (hours) for completed or chargeable lessons, excluding non‑teaching/support work.",
  students:
    "Count of student‑appointments (duplicates allowed) across all completed or chargeable lessons.",
  revenue:
    "Expected revenue per month: ∑ (sum of) (charge_rate × units) for every appointment_recipient on completed/chargeable lessons.",
  paidRevenue:
    "Actual revenue collected per month: ∑ (sum of) invoice.net for all invoices marked “paid” in the period.",
  tutorPay:
    "Total teaching tutor pay per month: ∑ (sum of) payment_orders.amount for paid orders (excluding adhoc charges).",
  tutorAdhocPay:
    "Total adhoc tutor payouts per month: ∑ (sum of) payment_order_charges.amount where adhoc_charge_id IS NOT NULL.",
  grossProfitMargin:
    "EXCLUDES CURRENT MONTH IN YTD AVG: Gross profit margin (%) = (paidRevenue – teaching tutor pay) / paidRevenue × 100.",
  netProfitMargin:
    "EXCLUDES CURRENT MONTH IN YTD AVG: Net profit margin (%) = (paidRevenue – total payouts) / paidRevenue × 100.",
  home: "Total lesson hours at clients’ homes per month: ∑ (sum of) units for lessons labeled “Home.”",
  homeRevenue:
    "Expected revenue from home lessons per month: ∑ (sum of) (charge_rate × units) for lessons labeled “Home.”",
  online:
    "Total lesson hours delivered online per month: ∑ (sum of) units for lessons labeled “Online.”",
  onlineRevenue:
    "Expected revenue from online lessons per month: ∑ (sum of) (charge_rate × units) for lessons labeled “Online.”",
  totalLeads:
    "Total new client leads per month: count of distinct client registrations.",
  convertedLeads:
    "Converted leads per month: of leads created in that month, count those with ≥1 paid invoice in the period.",
  unconvertedLeads:
    "Unconverted leads per month: leads with appointments but no paid invoices in the period.",
  lessonsPlaced:
    "Lessons placed per month: count of trial/first lessons (Home or Online) that had a tutor attached.",
  trialFirstLessons:
    "Trial/first lesson completions per month: clients whose very first completed lesson falls in the month.",
  convertedNotContinued:
    "Converted-but‑not‑continued per month: clients whose first paid lesson was in the month and did not take a second paid lesson within 30 days.",
  threeFullLessons:
    "Clients reaching their 3rd completed/chargeable lesson in the month.",
  sevenFullLessons:
    "Clients reaching their 7th completed/chargeable lesson in the month.",
  activeTutors:
    "Active tutors per month: count of distinct tutors who taught ≥1 completed/chargeable lesson.",
  inactiveTutors:
    "Inactive tutors per month: approved tutors who taught no lessons that month (0 if no lessons overall).",
  tutorsTaught0_19:
    "Tutors with total teaching hours between 0.5–19.9 hrs in a month.",
  tutorsTaught20_39:
    "Tutors with total teaching hours between 20–39.9 hrs in a month.",
  tutorsTaught40_59:
    "Tutors with total teaching hours between 40–59.9 hrs in a month.",
  tutorsTaught60_79:
    "Tutors with total teaching hours between 60–79.9 hrs in a month.",
  tutorTaught80Plus: "Tutors with total teaching hours ≥ 80 hrs in a month.",
  consistencyBonusPayout:
    "Consistency bonus per month: tiered payout of 200/400/600 for 40/60/80+ hours taught.",
  groupLessonCount:
    "Group‑lesson student count per month: ∑ (sum of) participants for lessons with ≥2 students.",
  groupLessonBonusPayout:
    "Group‑lesson bonus per month: tiered bonus of 10/20/30/40 based on student count per session.",
  expectedTutorPay:
    "Estimated tutor pay based on expected completed and chargeable sessions: ∑ (sum of) (pay_rate × units).",
};

const stripSuffix = (text) =>
  typeof text === "string" ? text.replace(/_\d+$/, "") : text;

const roundValue = (value) => (value ? parseFloat(value).toFixed(2) : "0.00");

function exportFormat(metric, value) {
  const currencyMetrics = [
    "revenue",
    "paidRevenue",
    "tutorPay",
    "tutorAdhocPay",
    "homeRevenue",
    "onlineRevenue",
    "schoolRevenue",
    "clubRevenue",
    "consistencyBonusPayout",
    "groupLessonBonusPayout",
    "expectedTutorPay",
  ];

  const percentMetrics = ["grossProfitMargin", "netProfitMargin"];
  if (currencyMetrics.includes(metric)) {
    return "$" + value;
  } else if (percentMetrics.includes(metric)) {
    return value + "%";
  } else {
    return value;
  }
}

export default function MasterReport() {
  const [selectedYear, setSelectedYear] = useState(2025);
  const [reportDataAll, setReportDataAll] = useState(null);
  const [loading, setLoading] = useState(false);
  const [pageSize, setPageSize] = useState(10);
  const [paginationModel, setPaginationModel] = useState({
    page: 0,
    pageSize: 10,
  });
  const [helpOpen, setHelpOpen] = useState(false);
  const [helpKey, setHelpKey] = useState(null);
  const [detailLoading, setDetailLoading] = useState(false);
  
  // New state for calculation details modal
  const [calculationModalOpen, setCalculationModalOpen] = useState(false);
  const [calculationData, setCalculationData] = useState([]);
  const [calculationLoading, setCalculationLoading] = useState(false);
  const [calculationMetric, setCalculationMetric] = useState(null);
  const [calculationPeriod, setCalculationPeriod] = useState(null);

  const noDetailsFor = ["grossProfitMargin", "netProfitMargin"];

  const canShowDetails = !noDetailsFor.includes(helpKey);

  const [helpTab, setHelpTab] = useState(0);
  const [detailRows, setDetailRows] = useState([]);

  function CustomExportToolbar() {
    return (
      <GridToolbarContainer>
        <GridToolbarExport csvOptions={{ allColumns: true }} />
      </GridToolbarContainer>
    );
  }

  useEffect(() => {
    const fetchReportData = async () => {
      setLoading(true);
      try {
        const startDate = `${selectedYear}-01-01`;
        const endDate = `${selectedYear}-12-31`;
        const allResponse = await axios.get(
          `/api/master-report?year=${selectedYear}&startDate=${startDate}&endDate=${endDate}`
        );

        setReportDataAll(allResponse.data);
      } catch (error) {
        console.error("Error fetching report data:", error);
      } finally {
        setLoading(false);
      }
    };

    fetchReportData();
  }, [selectedYear]);

  useEffect(() => {
    if (helpOpen && helpTab > 0 && helpKey) {
      const startDate = `${selectedYear}-01-01`;
      const endDate = `${selectedYear}-12-31`;
      setDetailLoading(true);

      axios
        .get("/api/master-report-details", {
          params: { metric: helpKey, startDate, endDate },
        })
        .then((res) => {
          const withIds = (res.data.rows || []).map((row, idx) => ({
            ...row,
            id: `${row.lesson_id || row.appointment_id || row.invoice_id || 'detail'}-${idx}-${Date.now()}`,
          }));
          setDetailRows(withIds);
        })
        .catch(() => {
          setDetailRows([]);
        })
        .finally(() => {
          setDetailLoading(false);
        });
    }
  }, [helpTab, helpKey, helpOpen, selectedYear]);

  // Handler for clicking on calculation numbers
  const handleCalculationClick = async (metricKey, period) => {
    try {
      if (!metricKey || !period) {
        console.warn("Invalid metricKey or period:", { metricKey, period });
        return;
      }

      setCalculationMetric(metricKey);
      setCalculationPeriod(period);
      setCalculationModalOpen(true);
      setCalculationLoading(true);
      
      const startDate = `${selectedYear}-01-01`;
      const endDate = `${selectedYear}-12-31`;
      
      let params = { metric: metricKey, startDate, endDate };
      
      // If period is not 'ytd', add month filter
      if (period !== 'ytd') {
        const monthIndex = monthKeys.indexOf(period);
        if (monthIndex !== -1) {
          const monthStart = `${selectedYear}-${String(monthIndex + 1).padStart(2, '0')}-01`;
          const nextMonth = monthIndex === 11 ? 1 : monthIndex + 2;
          const nextYear = monthIndex === 11 ? selectedYear + 1 : selectedYear;
          const monthEnd = `${nextYear}-${String(nextMonth).padStart(2, '0')}-01`;
          params = { ...params, monthStart, monthEnd };
        }
      }
      
      const response = await axios.get("/api/master-report-details", { params });
      console.log("API Response:", response.data);
      console.log("Number of rows:", response.data.rows?.length);
      if (response.data.rows?.length > 0) {
        console.log("Sample row:", response.data.rows[0]);
        console.log("Row keys:", Object.keys(response.data.rows[0]));
      }
      const withIds = (response.data.rows || []).map((row, idx) => ({ 
        ...row, 
        id: `${row.appointment_id || row.invoice_id || row.client_id || row.payment_order_id || 'row'}-${idx}-${Date.now()}`
      }));
      console.log("Setting calculationData with", withIds.length, "rows");
      setCalculationData(withIds);
    } catch (error) {
      console.error("Error fetching calculation details:", error);
      setCalculationData([]);
    } finally {
      setCalculationLoading(false);
    }
  };

  const dateFields = React.useMemo(() => {
    if (!detailRows || !detailRows.length || !detailRows[0]) return [];
    return Object.entries(detailRows[0])
      .filter(
        ([key, val]) =>
          typeof val === "string" && /^\d{4}-\d{2}-\d{2}T/.test(val)
      )
      .map(([key]) => key);
  }, [detailRows]);

  const dateField = dateFields.length > 0 ? dateFields[0] : null;

  // Column generation for calculation modal data
  const calculationColumnsAuto = React.useMemo(() => {
    if (!calculationData || !calculationData.length || !calculationData[0]) return [];

    return Object.keys(calculationData[0])
      .filter((field) => field !== "id")
      .map((field) => {
        const baseCol = {
          field,
          headerName: field
            .replace(/_/g, " ")
            .replace(/\b\w/g, (l) => l.toUpperCase()),
          flex: 1,
        };

        const linkStyle = {
          color: "#1976d2",
          textDecoration: "underline",
          cursor: "pointer",
        };

        // Handle date fields
        if (
          field.includes("date") ||
          field.includes("sent") ||
          field.endsWith("_start") ||
          field.endsWith("_date") ||
          (calculationData[0][field] && typeof calculationData[0][field] === "string" && /^\d{4}-\d{2}-\d{2}/.test(calculationData[0][field]))
        ) {
          return {
            ...baseCol,
            renderCell: ({ value }) => {
              if (!value) return "";
              const dt = dayjs.utc(value).tz("America/New_York");
              return dt.format("MMM D YYYY HH:mm");
            },
          };
        }

        // Handle ID fields with links
        if (field === "appointment_id") {
          return {
            ...baseCol,
            renderCell: (params) => (
              <a
                href={`https://secure.tutorcruncher.com/cal/appointments/${params.value}/`}
                target="_blank"
                rel="noopener noreferrer"
                style={linkStyle}
              >
                {params.value}
              </a>
            ),
          };
        }

        if (field === "invoice_id") {
          return {
            ...baseCol,
            renderCell: (params) => (
              <a
                href={`https://secure.tutorcruncher.com/accounting/invoices/${params.value}/`}
                target="_blank"
                rel="noopener noreferrer"
                style={linkStyle}
              >
                {params.value}
              </a>
            ),
          };
        }

        if (field === "payment_order_id") {
          return {
            ...baseCol,
            renderCell: (params) => (
              <a
                href={`https://secure.tutorcruncher.com/accounting/pos/${params.value}/`}
                target="_blank"
                rel="noopener noreferrer"
                style={linkStyle}
              >
                {params.value}
              </a>
            ),
          };
        }

        if (field === "client_id") {
          return {
            ...baseCol,
            renderCell: (params) => (
              <a
                href={`https://secure.tutorcruncher.com/clients/${params.value}/`}
                target="_blank"
                rel="noopener noreferrer"
                style={linkStyle}
              >
                {params.value}
              </a>
            ),
          };
        }

        return baseCol;
      });
  }, [calculationData]);

  const detailColumnsAuto = React.useMemo(() => {
    if (!detailRows || !detailRows.length || !detailRows[0]) return [];

    return Object.keys(detailRows[0])

      .filter((field) => field !== "id")
      .map((field) => {
        const baseCol = {
          field,
          headerName: field
            .replace(/_/g, " ")
            .replace(/\b\w/g, (l) => l.toUpperCase()),
          flex: 1,
        };

        if (dateFields.includes(field)) {
          return {
            ...baseCol,
            renderCell: ({ value }) => {
              const dt = dayjs.utc(value).tz("America/New_York");
              return dt.format("dddd D MMMM hh:mm A");
            },
          };
        }

        const linkStyle = {
          color: "#1976d2",
          textDecoration: "underline",
          cursor: "pointer",
        };

        if (
          field.endsWith("_start") ||
          field.endsWith("_date") ||
          field.includes("sent")
        ) {
          return {
            ...baseCol,
            renderCell: ({ value }) => {
              const dt = dayjs.utc(value).tz("America/New_York");
              return dt.format("dddd D MMMM hh:mm A");
            },
          };
        }

        if (field === "lesson_id" || field === "appointment_id") {
          return {
            ...baseCol,
            renderCell: (params) => (
              <a
                href={`https://secure.tutorcruncher.com/cal/appointments/${params.value}/`}
                target="_blank"
                rel="noopener noreferrer"
                style={linkStyle}
              >
                {params.value}
              </a>
            ),
          };
        }

        if (field === "invoice_id") {
          return {
            ...baseCol,
            renderCell: (params) => (
              <a
                href={`https://secure.tutorcruncher.com/accounting/invoices/${params.value}/`}
                target="_blank"
                rel="noopener noreferrer"
                style={linkStyle}
              >
                {params.value}
              </a>
            ),
          };
        }

        if (field === "payment_order_id") {
          return {
            ...baseCol,
            renderCell: (params) => (
              <a
                href={`https://secure.tutorcruncher.com/accounting/pos/${params.value}/`}
                target="_blank"
                rel="noopener noreferrer"
                style={linkStyle}
              >
                {params.value}
              </a>
            ),
          };
        }

        if (field === "client_id") {
          return {
            ...baseCol,
            renderCell: (params) => (
              <a
                href={`https://secure.tutorcruncher.com/clients/${params.value}/`}
                target="_blank"
                rel="noopener noreferrer"
                style={linkStyle}
              >
                {params.value}
              </a>
            ),
          };
        }

        if (field === "recipient_id") {
          return {
            ...baseCol,
            renderCell: (params) => (
              <a
                href={`https://secure.tutorcruncher.com/recipients/${params.value}/`}
                target="_blank"
                rel="noopener noreferrer"
                style={linkStyle}
              >
                {params.value}
              </a>
            ),
          };
        }

        if (field === "student_id") {
          return {
            ...baseCol,
            renderCell: (params) => (
              <a
                href={`https://secure.tutorcruncher.com/recipients/${params.value}/`}
                target="_blank"
                rel="noopener noreferrer"
                style={linkStyle}
              >
                {params.value}
              </a>
            ),
          };
        }

        if (field === "service_id") {
          return {
            ...baseCol,
            renderCell: (params) => (
              <a
                href={`https://secure.tutorcruncher.com/cal/service/${params.value}/`}
                target="_blank"
                rel="noopener noreferrer"
                style={linkStyle}
              >
                {params.value}
              </a>
            ),
          };
        }

        if (field === "contractor_id") {
          return {
            ...baseCol,
            renderCell: (params) => (
              <a
                href={`https://secure.tutorcruncher.com/contractors/${params.value}/`}
                target="_blank"
                rel="noopener noreferrer"
                style={linkStyle}
              >
                {params.value}
              </a>
            ),
          };
        }

        return baseCol;
      });
  }, [detailRows]);

  const detailColumns = {
    lessons: [
      { field: "lesson_id", headerName: "Lesson ID", width: 120 },
      {
        field: "lesson_start",
        headerName: "Start",
        width: 200,
        renderCell: ({ value }) =>
          dayjs.utc(value).tz().format("MMM D YYYY HH:mm"),
      },
      { field: "charge_type", headerName: "Type", width: 150 },
      { field: "units", headerName: "Units", width: 80 },
      { field: "service_name", headerName: "Service", width: 200 },
    ],
    hours: [
      { field: "appointment_id", headerName: "Lesson ID", width: 120 },
      { field: "lesson_start", headerName: "Start", width: 200 },
      { field: "lesson_hours", headerName: "Hours", width: 80 },
      { field: "service_name", headerName: "Service", width: 200 },
    ],
  };

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

  const metricMapping = {
    lessons: "Total Lessons",
    hours: "Total Lesson Hours",
    students: "Total Students",

    expectedTutorPay: "Expected Tutor Pay",
    revenue: "Expected Revenue",
    paidRevenue: "Paid Revenue",

    grossProfitMargin: "Gross Profit Margin",
    netProfitMargin: "Net Profit Margin",

    homeRevenue: "Home Revenue",
    home: "Total Home Lesson Hours",

    onlineRevenue: "Online Revenue",
    online: "Total Online Lesson Hours",

    totalLeads: "Total Leads of Specific Month",
    convertedLeads: "Total Converted Leads From Total Leads of Specific Month",
    lessonsPlaced: "Lessons Placed",
    trialFirstLessons: "Trial/First Lesson Completed this month from all time",
    unconvertedLeads: "Total Unconverted Leads this month from all time",
    convertedNotContinued:
      "Total Converted Leads that Did Not Continue this month from all time",

    threeFullLessons: "3 Full Paid Lessons",
    sevenFullLessons: "7 Full Paid Lessons",

    tutorPay: "Total Tutor Pay",
    tutorAdhocPay: "Total Tutor Adhoc Pay",

    activeTutors: "Total Active Tutors",
    inactiveTutors: "Total Inactive Tutors",

    tutorsTaught0_19: "Tutors taught 0.5 - 19.9 hours",
    tutorsTaught20_39: "Tutors taught 20 - 39.9 hours",
    tutorsTaught40_59: "Tutors taught 40 - 59.9 hours",
    tutorsTaught60_79: "Tutors taught 60 - 79.9 hours",
    tutorTaught80Plus: "Tutor taught 80+ hours",

    consistencyBonusPayout: "Consistency Bonus Payout",
    groupLessonCount: "Total Group Lesson Students",
    groupLessonBonusPayout: "Total Group Lesson Bonus Payout",
  };

  const exportMasterReport = async () => {
    const years = [2024, 2025];
    const workbook = XLSX.utils.book_new();

    for (const year of years) {
      const startDate = `${year}-01-01`;
      const endDate = `${year}-12-31`;

      const allRes = await axios.get(
        `/api/master-report?year=${year}&startDate=${startDate}&endDate=${endDate}`
      );

      const header = ["Metric", "YTD", ...monthKeys.map((key) => key)];

      const sheetData = [];
      sheetData.push([`Master Report for ${year}`]);
      sheetData.push([]);
      sheetData.push(header);

      const addSection = (sectionTitle, dataObj) => {
        sheetData.push([sectionTitle]);
        for (const metric in dataObj) {
          const metricData = dataObj[metric];
          const friendlyMetric = metricMapping[metric] || metric;

          const formattedYTD = exportFormat(metric, metricData.ytd);
          const row = [friendlyMetric, formattedYTD];
          monthKeys.forEach((key) => {
            const monthVal = metricData.months
              ? metricData.months[key] || 0
              : 0;
            row.push(exportFormat(metric, monthVal));
          });
          sheetData.push(row);
        }
        sheetData.push([]);
      };

      addSection("ALL Data", allRes.data);

      const worksheet = XLSX.utils.aoa_to_sheet(sheetData);

      XLSX.utils.book_append_sheet(workbook, worksheet, String(year));
    }

    const today = new Date();
    const month = (today.getMonth() + 1).toString().padStart(2, "0");
    const day = today.getDate().toString().padStart(2, "0");
    const year = today.getFullYear();
    const fileName = `Master_Report_${month}-${day}-${year}.xlsx`;

    const wbout = XLSX.write(workbook, { bookType: "xlsx", type: "array" });
    saveAs(new Blob([wbout]), fileName);
  };

  const metricKeys = [
    "lessons",
    "hours",
    "students",
    "revenue",
    "paidRevenue",
    "tutorPay",
    "tutorAdhocPay",
    "expectedTutorPay",
    "grossProfitMargin",
    "netProfitMargin",
    "home",
    "homeRevenue",
    "online",
    "onlineRevenue",
    "totalLeads",

    "convertedLeads",
    "unconvertedLeads",
    "lessonsPlaced",
    "trialFirstLessons",
    "convertedNotContinued",
    "threeFullLessons",
    "sevenFullLessons",
    "activeTutors",
    "inactiveTutors",
    "tutorsTaught0_19",
    "tutorsTaught20_39",
    "tutorsTaught40_59",
    "tutorsTaught60_79",
    "tutorTaught80Plus",
    "consistencyBonusPayout",
    "groupLessonCount",
    "groupLessonBonusPayout",
  ];

  const rows = metricKeys.map((key, idx) => {
    try {
      const dataObj = reportDataAll?.[key] || { ytd: 0, months: {} };
      return {
        id: idx + 1,
        metricKey: key,
        metric: metricMapping[key] || key,
        ytd: exportFormat(key, dataObj.ytd || 0),
        ...monthKeys.reduce((acc, m) => {
          try {
            acc[m] = exportFormat(key, dataObj.months?.[m] || 0);
            return acc;
          } catch (error) {
            console.error(`Error formatting month ${m} for metric ${key}:`, error);
            acc[m] = "0";
            return acc;
          }
        }, {}),
      };
    } catch (error) {
      console.error(`Error creating row for metric ${key}:`, error);
      return {
        id: idx + 1,
        metricKey: key,
        metric: metricMapping[key] || key,
        ytd: "0",
        ...monthKeys.reduce((acc, m) => {
          acc[m] = "0";
          return acc;
        }, {}),
      };
    }
  });

  const monthNameMap = {
    jan: "January",
    feb: "February",
    mar: "March",
    apr: "April",
    may: "May",
    jun: "June",
    jul: "July",
    aug: "August",
    sep: "September",
    oct: "October",
    nov: "November",
    dec: "December",
  };

  const metricColumn = {
    field: "metric",
    headerName: "Metric",
    minWidth: 250,
    flex: 1,
    renderCell: (params) => (
      <Box
        sx={{
          display: "flex",
          alignItems: "center",

          gap: 0.5,
          height: "100%",
        }}
      >
        <IconButton
          size="small"
          onClick={() => {
            setHelpKey(params.row.metricKey);
            setHelpTab(0);
            setDetailRows([]);
            setHelpOpen(true);
          }}
        >
          <InformationCircleIcon className="h-5 w-5" />
        </IconButton>
        <Typography variant="body2">{params.value}</Typography>
      </Box>
    ),
  };

  // Helper function to create clickable cell renderer
  const createClickableCell = (field) => ({
    renderCell: (params) => {
      try {
        const value = params?.value;
        const metricKey = params?.row?.metricKey;
        
        // Skip if no value or if it's a metric that shouldn't have details
        if (!value || value === "0" || value === "0.00" || value === "$0.00" || value === "0%" || noDetailsFor.includes(metricKey)) {
          return <span>{value}</span>;
        }
        
        return (
          <span
            style={{
              color: "#1976d2",
              textDecoration: "underline",
              cursor: "pointer",
            }}
            onClick={(e) => {
              try {
                e.preventDefault();
                handleCalculationClick(metricKey, field);
              } catch (error) {
                console.error("Error in click handler:", error);
              }
            }}
          >
            {value}
          </span>
        );
      } catch (error) {
        console.error("Error rendering clickable cell:", error);
        return <span>{params?.value || ""}</span>;
      }
    },
  });

  const columns = [
    metricColumn,
    { 
      field: "ytd", 
      headerName: "YTD", 
      minWidth: 120, 
      flex: 1,
      ...createClickableCell("ytd")
    },
    ...monthKeys.map((m) => ({
      field: m,
      headerName: monthNameMap[m] || m,
      minWidth: 100,
      flex: 1,
      ...createClickableCell(m)
    })),
  ];

  return (
    <Box sx={{ width: "100%", p: 2 }}>
      <Typography variant="h6" gutterBottom>
        Currently viewing report for {selectedYear}
      </Typography>

      <ToggleButtonGroup
        value={selectedYear}
        exclusive
        onChange={(event, newYear) => newYear && setSelectedYear(newYear)}
        sx={{ mb: 2 }}
      >
        <ToggleButton value={2024}>2024</ToggleButton>
        <ToggleButton value={2025}>2025</ToggleButton>
      </ToggleButtonGroup>

      <Box sx={{ display: "flex", justifyContent: "flex-end", mb: 2 }}>
        <Button
          variant="contained"
          color="primary"
          onClick={exportMasterReport}
        >
          Export Master Report
        </Button>
      </Box>

      <Box sx={{ width: "100%", overflowX: "auto" }}>
        <div style={{ minWidth: 1500 }}>
          <DataGrid
            rows={rows}
            columns={columns}
            disableRowSelectionOnClick
            slots={{ toolbar: GridToolbar }}
            loading={loading}
            getCellClassName={(params) => {
              const raw = params.formattedValue ?? params.value;

              const n = parseFloat(String(raw).replace(/[^0-9.\-]+/g, ""));
              return n === 0 ? "cell-zero" : "";
            }}
            sx={{
              "& .cell-zero": {
                bgcolor: "rgba(255,0,0,0.1)",
              },
            }}
          />
        </div>
      </Box>

      <Dialog
        open={helpOpen}
        sx={{ textAlign: "left" }}
        onClose={() => setHelpOpen(false)}
        maxWidth="xl"
        fullWidth
      >
        <DialogTitle sx={{ textAlign: "left" }}>
          What is "{helpKey}"?
          <Box component="div" sx={{ fontSize: '0.875rem', color: 'text.secondary', mt: 0.5 }}>
            Year: {selectedYear}
          </Box>
        </DialogTitle>

        <DialogContent dividers>
          <Box sx={{ display: "flex", height: 700 }}>
            <Tabs
              orientation="vertical"
              variant="scrollable"
              value={helpTab}
              onChange={(_, v) => setHelpTab(v)}
              indicatorColor="primary"
              textColor="primary"
              sx={{
                borderRight: 1,
                borderColor: "divider",
                minWidth: 140,

                "& .MuiTab-root": {
                  textAlign: "left",
                  alignItems: "flex-start",
                  paddingLeft: 2,
                },
              }}
            >
              <Tab label="Explanation" />
              {canShowDetails && <Tab label="All Year" />}
              {canShowDetails &&
                monthKeys.map((m) => <Tab key={m} label={monthNameMap[m]} />)}
            </Tabs>

            <Box sx={{ flexGrow: 1, pl: 2, overflow: "auto" }}>
              {helpTab === 0 && (
                <Box
                  sx={{
                    p: 4,
                    height: "100%",
                    display: "flex",
                    flexDirection: "column",
                    alignItems: "center",
                    justifyContent: "center",
                    textAlign: "center",
                    bgcolor: "background.paper",
                    borderRadius: 2,
                    boxShadow: 1,
                  }}
                >
                  <LightBulbIcon
                    className="h-16 w-16 text-blue-600 mb-2"
                  />

                  <Typography
                    variant="body1"
                    sx={{
                      maxWidth: 600,
                      fontSize: "20px",
                      color: "#333",
                      lineHeight: 1.5,
                    }}
                  >
                    {explanations[helpKey]}
                  </Typography>
                </Box>
              )}

              {helpTab === 1 && canShowDetails && (
                <DataGrid
                  rows={detailRows}
                  columns={detailColumnsAuto}
                  slots={{ toolbar: CustomExportToolbar }}
                  loading={detailLoading}
                  getRowId={(r) => r.id}
                  paginationModel={paginationModel}
                  onPaginationModelChange={setPaginationModel}
                  pageSizeOptions={[5, 10, 25, 50]}
                  initialState={{
                    pagination: { paginationModel: { pageSize: 10, page: 0 } },
                    columns: { columnVisibilityModel: { id: false } },
                  }}
                  disableRowSelectionOnClick
                  sx={{ height: "100%" }}
                />
              )}

              {helpTab >= 2 && canShowDetails && dateField && (
                <DataGrid
                  rows={detailRows.filter((r) => {
                    const d = dayjs(r[dateField]).tz("America/New_York");
                    return d.month() === helpTab - 2;
                  })}
                  columns={detailColumnsAuto}
                  slots={{ toolbar: CustomExportToolbar }}
                  loading={detailLoading}
                  getRowId={(r) => r.id}
                  paginationModel={paginationModel}
                  onPaginationModelChange={setPaginationModel}
                  pageSizeOptions={[5, 10, 25, 50]}
                  initialState={{
                    pagination: { paginationModel: { pageSize: 10, page: 0 } },
                    columns: { columnVisibilityModel: { id: false } },
                  }}
                  disableRowSelectionOnClick
                  sx={{ height: "100%" }}
                />
              )}
            </Box>
          </Box>
        </DialogContent>

        <DialogActions>
          <Button onClick={() => setHelpOpen(false)}>Close</Button>
        </DialogActions>
      </Dialog>

      {/* Calculation Details Modal */}
      <Dialog
        open={calculationModalOpen}
        onClose={() => setCalculationModalOpen(false)}
        maxWidth="xl"
        fullWidth
        disableScrollLock={true}
      >
        <DialogTitle>
          Calculation Details for "{metricMapping[calculationMetric] || calculationMetric}"
          <Box component="div" sx={{ fontSize: '0.875rem', color: 'text.secondary', mt: 0.5 }}>
            Period: {calculationPeriod === 'ytd' ? 'Year to Date' : monthNameMap[calculationPeriod] || calculationPeriod} {selectedYear}
          </Box>
        </DialogTitle>
        
        <DialogContent dividers>
          <Box sx={{ height: 600, width: '100%' }}>
            {calculationLoading ? (
              <Box sx={{ display: 'flex', justifyContent: 'center', alignItems: 'center', height: '100%' }}>
                <Typography>Loading calculation details...</Typography>
              </Box>
            ) : (
              <DataGrid
                rows={calculationData}
                columns={calculationColumnsAuto}
                slots={{ toolbar: CustomExportToolbar }}
                getRowId={(r) => r.id}
                paginationModel={paginationModel}
                onPaginationModelChange={setPaginationModel}
                pageSizeOptions={[5, 10, 25, 50]}
                initialState={{
                  pagination: { paginationModel: { pageSize: 10, page: 0 } },
                  columns: { columnVisibilityModel: { id: false } },
                }}
                disableRowSelectionOnClick
                sx={{ height: '100%' }}
              />
            )}
          </Box>
        </DialogContent>
        
        <DialogActions>
          <Button 
            onClick={() => {
              // Export calculation data as CSV
              if (calculationData.length > 0) {
                const headers = Object.keys(calculationData[0]).filter(key => key !== 'id');
                const csvContent = [
                  headers.join(','),
                  ...calculationData.map(row => 
                    headers.map(header => {
                      const value = row[header];
                      // Handle values that might contain commas
                      if (typeof value === 'string' && value.includes(',')) {
                        return `"${value}"`;
                      }
                      return value || '';
                    }).join(',')
                  )
                ].join('\n');
                
                const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
                const link = document.createElement('a');
                const url = URL.createObjectURL(blob);
                link.setAttribute('href', url);
                link.setAttribute('download', `calculation_details_${calculationMetric}_${calculationPeriod}_${selectedYear}.csv`);
                link.style.visibility = 'hidden';
                document.body.appendChild(link);
                link.click();
                document.body.removeChild(link);
              }
            }}
            disabled={calculationData.length === 0}
          >
            Export CSV
          </Button>
          <Button onClick={() => setCalculationModalOpen(false)}>Close</Button>
        </DialogActions>
      </Dialog>
    </Box>
  );
}
