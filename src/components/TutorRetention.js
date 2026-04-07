import React, { useEffect, useState, useCallback } from "react";
import {
  Box,
  Button,
  CircularProgress,
  TextField,
  Typography,
} from "@mui/material";
import { useToast } from '../hooks/useToast';
import RetentionReportModal from "./RetentionReportModal";
import {
  Autocomplete,
  Dialog,
  DialogActions,
  DialogTitle,
  DialogContent,
  FormControlLabel,
  Checkbox,
} from "@mui/material";

import {
  DataGrid,
  GridToolbar,
  GridToolbarContainer,
  GridToolbarExport,
} from "@mui/x-data-grid";
import HeadlessModal from "./ui/Modal";

import axios from "axios";
import { DatePicker } from "@mui/x-date-pickers";
import { LocalizationProvider } from "@mui/x-date-pickers/LocalizationProvider";
import { AdapterDayjs } from "@mui/x-date-pickers/AdapterDayjs";
import dayjs from "dayjs";
import { darken, lighten, styled } from "@mui/material/styles";
import utc from "dayjs/plugin/utc";
import timezone from "dayjs/plugin/timezone";

dayjs.extend(utc);
dayjs.extend(timezone);
const getBackgroundColor = (color, theme, coefficient) => ({
  backgroundColor: darken(color, coefficient),
  ...theme.applyStyles("light", {
    backgroundColor: lighten(color, coefficient),
  }),
});
const StyledDataGrid = styled(DataGrid)(({ theme }) => ({
  "& .super-app-theme--Approved": {
    ...getBackgroundColor(theme.palette.success.main, theme, 0.6),
    "&:hover": {
      ...getBackgroundColor(theme.palette.success.main, theme, 0.5),
    },
  },
  "& .super-app-theme--Rejected, & .super-app-theme--Dormant": {
    ...getBackgroundColor(theme.palette.error.main, theme, 0.6),
    "&:hover": {
      ...getBackgroundColor(theme.palette.error.main, theme, 0.5),
    },
  },
}));
const getRowClassName = (params) => {
  const status = params.row.tutor_status?.toLowerCase();
  if (status === "approved") return "super-app-theme--Approved";
  if (status === "rejected" || status === "dormant")
    return "super-app-theme--Rejected";
  return "";
};

const ClientRetention = () => {
  const toast = useToast();
  const [loading, setLoading] = useState(false);
  const [reviewCount, setReviewCount] = useState(0);
  const [startDate, setStartDate] = useState(
    dayjs().tz("America/New_York").subtract(1, "week").startOf("week")
  );
  const [endDate, setEndDate] = useState(
    dayjs().tz("America/New_York").subtract(1, "week").endOf("week")
  );
  const [filteredLessons, setFilteredLessons] = useState([]);
  const [lessonsData, setLessonsData] = useState([]);
  const [studentsData, setStudentsData] = useState([]);
  const [selectedTutorName, setSelectedTutorName] = useState(null);

  const [isLessonsModalOpen, setIsLessonsModalOpen] = useState(false);

  const LessonDetailsModal = ({ open, onClose, lessons, tutorName }) => {
    const totalHours = lessons
      .reduce((sum, lesson) => sum + parseFloat(lesson.durationHours || lesson.duration_hours || 0), 0)
      .toFixed(2);
    const totalLessons = lessons.length;
    
    const formatDate = (dateString) => {
      if (!dateString) return 'N/A';
      return dayjs(dateString).tz("America/New_York").format("MM/DD/YYYY HH:mm");
    };
    
    const formatLabels = (labels) => {
      if (!labels) return 'N/A';
      if (Array.isArray(labels)) return labels.join(', ');
      if (typeof labels === 'string') {
        try {
          const parsed = JSON.parse(labels);
          return Array.isArray(parsed) ? parsed.join(', ') : labels;
        } catch {
          return labels;
        }
      }
      return 'N/A';
    };
    
    return (
      <Dialog open={open} onClose={onClose} fullWidth maxWidth="lg" disableScrollLock={true}>
        <DialogTitle>
          Lesson Hours Calculation Breakdown for {tutorName}
          <Typography variant="body2" color="text.secondary" sx={{ mt: 1 }}>
            Total: {totalLessons} lessons • {totalHours} hours
          </Typography>
        </DialogTitle>

        <DialogContent>
          {lessons.length > 0 ? (
            <StyledDataGrid
              rows={lessons.map((lesson) => ({
                ...lesson,
                id: lesson.lesson_id || lesson.appointmentId,
                formattedStart: formatDate(lesson.start),
                formattedFinish: formatDate(lesson.finish),
                formattedLabels: formatLabels(lesson.labels),
                studentsList: lesson.students ? lesson.students.map(s => s.student_name).join(', ') : 'N/A',
              }))}
              columns={[
                { 
                  field: "lesson_id", 
                  headerName: "Lesson ID", 
                  width: 120,
                  renderCell: (params) => (
                    <a
                      href={`https://account.acmeops.com/cal/appointments/${params.value}/`}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="text-blue-600 underline"
                    >
                      {params.value}
                    </a>
                  )
                },
                { 
                  field: "formattedStart", 
                  headerName: "Start Time", 
                  width: 180 
                },
                { 
                  field: "formattedFinish", 
                  headerName: "Finish Time", 
                  width: 180 
                },
                {
                  field: "rawDurationHours",
                  headerName: "Raw Duration",
                  width: 120,
                  renderCell: (params) => {
                    const raw = parseFloat(params.value || 0);
                    return `${raw.toFixed(2)}h`;
                  }
                },
                {
                  field: "durationHours",
                  headerName: "Calculated Hours",
                  width: 150,
                  renderCell: (params) => {
                    const hours = parseFloat(params.value || params.row.duration_hours || 0);
                    const raw = parseFloat(params.row.rawDurationHours || params.row.raw_duration_hours || 0);
                    const isAdjusted = raw < 1 && hours === 1.0;
                    return (
                      <Box>
                        <Typography variant="body2" fontWeight="bold">
                          {hours.toFixed(2)}h
                        </Typography>
                        {isAdjusted && (
                          <Typography variant="caption" color="warning.main">
                            (min 1.0h)
                          </Typography>
                        )}
                      </Box>
                    );
                  }
                },
                { 
                  field: "serviceName", 
                  headerName: "Service", 
                  width: 200 
                },
                { 
                  field: "formattedLabels", 
                  headerName: "Labels", 
                  width: 200 
                },
                { 
                  field: "studentsList", 
                  headerName: "Students", 
                  width: 250 
                },
              ]}
              getRowId={(row) => row.id}
              autoHeight
              pageSizeOptions={[10, 25, 50, 100]}
              paginationModel={{ page: 0, pageSize: 25 }}
              slots={{
                toolbar: GridToolbar,
                footer: () => (
                  <Box
                    sx={{
                      display: "flex",
                      justifyContent: "space-between",
                      padding: "10px",
                      backgroundColor: "#f1f1f1",
                      fontWeight: "bold",
                    }}
                  >
                    <Typography>Total Lessons: {totalLessons}</Typography>
                    <Typography>
                      Total Hours: {totalHours}
                    </Typography>
                  </Box>
                ),
              }}
            />
          ) : (
            <Typography>
              No lessons found for this tutor in the selected date range.
            </Typography>
          )}
        </DialogContent>

        <DialogActions>
          <Button onClick={onClose} color="secondary">
            Close
          </Button>
        </DialogActions>
      </Dialog>
    );
  };

  const [lessons, setLessons] = useState([]);
  const [totalLessons, setTotalLessons] = useState(0);

  const [hoursData, setHoursData] = useState([]);
  const [selectedReportMonth, setSelectedReportMonth] = useState(
    dayjs().startOf("month").format("YYYY-MM")
  );
  const [tempExcludedTutors, setTempExcludedTutors] = useState([]);
  const [tutorData, setTutorData] = useState([]);
  const [activeTab, setActiveTab] = useState(0);
  const [reviews, setReviews] = useState([]);
  const [selectedClient, setSelectedClient] = useState(null);
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [fetchTriggered, setFetchTriggered] = useState(false);
  const [excludedTutors, setExcludedTutors] = useState([]);
  const [openExclusionModal, setOpenExclusionModal] = useState(false);

  const [dataFetched, setDataFetched] = useState(false);

  const handleFetchData = async () => {
    setLoading(true);
    setFetchTriggered(true);
    setDataFetched(false);

    try {
      await fetchTutorData();
      setDataFetched(true);
    } catch (err) {
      console.error("Error fetching data or in post-processing:", err);
    } finally {
      setLoading(false);
    }
  };

  // Remove the automatic fetchLessons call since it needs a tutorId
  // useEffect(() => {
  //   fetchLessons();
  // }, []);

  const fetchLessons = async (tutorId) => {
    console.log("fetchLessons called with tutorId:", tutorId);

    if (!tutorId) {
      console.error("tutorId is undefined, cannot fetch lessons.");
      return;
    }

    try {
      const payload = JSON.stringify({ startDate, endDate, tutorId });
      console.log("Payload for /tutor-lessons:", payload);

      const response = await fetch("/tutor-lessons", {
        method: "POST",
        body: payload,
        headers: { "Content-Type": "application/json" },
      });

      console.log("Response status:", response.status);

      const data = await response.json();
      console.log("Lessons data received:", data);
      setLessons(data.lessons || []);
      setTotalLessons(data.totalLessons || 0);
    } catch (error) {
      console.error("❌ Error fetching lessons:", {
        message: error.message,
        response: error.response?.data,
        status: error.response?.status
      });
    }
  };

  useEffect(() => {
    const fetchExcludedTutors = async () => {
      try {
        const response = await axios.get("/api/excluded-tutors");
        setExcludedTutors(response.data);
      } catch (error) {
        console.error("❌ Error fetching excluded tutors:", {
          message: error.message,
          response: error.response?.data,
          status: error.response?.status
        });
      }
    };
    fetchExcludedTutors();
  }, []);

  const handleExclusionChange = async (tutorId) => {
    try {
      if (excludedTutors.includes(tutorId)) {
        await axios.delete(`/api/exclude-tutor/${tutorId}`);
        setExcludedTutors((prev) => prev.filter((id) => id !== tutorId));
      } else {
        await axios.post(
          "/api/exclude-tutor",
          { tutorId }
        );
        setExcludedTutors((prev) => [...prev, tutorId]);
      }
    } catch (error) {
      console.error("❌ Error updating exclusion list:", {
        message: error.message,
        response: error.response?.data,
        status: error.response?.status
      });
    }
  };

  const renderExclusionModal = () => (
    <Dialog
      open={openExclusionModal}
      onClose={() => setOpenExclusionModal(false)}
    >
      <DialogTitle>Exclude Tutors from Group Bonus</DialogTitle>
      <DialogContent>
        <Autocomplete
          multiple
          options={tutorData}
          getOptionLabel={(option) => option.tutor_name || "Unknown Tutor"}
          value={tutorData.filter((tutor) =>
            excludedTutors.includes(tutor.tutor_id)
          )}
          onChange={async (event, newValue) => {
            const updatedExcludedTutors = newValue.map(
              (tutor) => tutor.tutor_id
            );

            setExcludedTutors(updatedExcludedTutors);

            try {
              await axios.post(
                "/api/update-excluded-tutors",
                {
                  tutorIds: updatedExcludedTutors,
                }
              );
            } catch (error) {
              console.error("❌ Error updating exclusion list:", {
                message: error.message,
                response: error.response?.data,
                status: error.response?.status
              });
            }
          }}
          renderInput={(params) => (
            <TextField {...params} label="Excluded Tutors" />
          )}
        />
      </DialogContent>
      <DialogActions>
        <Button onClick={() => setOpenExclusionModal(false)} color="secondary">
          Close
        </Button>
      </DialogActions>
    </Dialog>
  );

  const handleStartDateChange = (newValue) => {
    setStartDate(dayjs(newValue).tz("America/New_York").startOf("day"));
    setFetchTriggered(false);
    setDataFetched(false);
  };

  const handleEndDateChange = (newValue) => {
    setEndDate(dayjs(newValue).tz("America/New_York").endOf("day"));
    setFetchTriggered(false);
    setDataFetched(false);
  };

  const [retentionRates, setRetentionRates] = useState({
    monthly: 0,
    annual: 0,
    avgMonthly: 0,
    avgAnnual: 0,
    avgMonthlyAllTutors: 0,
  });

  const [expandedRows, setExpandedRows] = useState({});
  const [selectedTutor, setSelectedTutor] = useState(null);
  const [selectedMonth, setSelectedMonth] = useState(
    dayjs().startOf("month").format("YYYY-MM")
  );
  const [isReportModalOpen, setIsReportModalOpen] = useState(false);
  const [retentionReport, setRetentionReport] = useState(null);
  const calculateConsistencyBonus = (totalHours) => {
    if (totalHours >= 80) return 600;
    if (totalHours >= 60) return 400;
    if (totalHours >= 40) return 200;
    return 0;
  };

  const calculateGroupBonus = (students) => {
    if (students >= 5) return 40;
    if (students >= 4) return 30;
    if (students >= 3) return 20;
    if (students >= 2) return 10;
    return 0;
  };

  const openRetentionReportModal = async (tutor) => {
    setLoading(true);
    setSelectedTutor(tutor);
    setIsReportModalOpen(true);

    try {
      const currentStartDate = startDate;
      const currentEndDate = endDate;

      if (process.env.NODE_ENV === 'development') {
        console.log("🟢 Opening Retention Report Modal");
        console.log("🕒 Report Date Ranges:", {
          currentStartDate: currentStartDate.format("YYYY-MM-DD"),
          currentEndDate: currentEndDate.format("YYYY-MM-DD"),
        });
      }

      if (process.env.NODE_ENV === 'development') {
        console.log("📡 Fetching tutor overview for:", tutor.tutor_id);
      }

      // Fetch leaderboard data using the same API and date ranges as the main table
      // This ensures the leaderboard matches exactly what's shown in the main table
      if (process.env.NODE_ENV === 'development') {
        console.log("📡 Fetching leaderboard data with correct date ranges...");
      }
      const leaderboardResponse = await axios.post(
        "/api/tutor-overview",
        {
          startDate: dayjs(currentStartDate)
            .tz("America/New_York")
            .startOf("day")
            .toISOString(),
          endDate: dayjs(currentEndDate)
            .tz("America/New_York")
            .endOf("day")
            .toISOString(),
          previousStartDate: dayjs(currentStartDate)
            .tz("America/New_York")
            .startOf("day")
            .subtract(1, "month")
            .toISOString(),
          previousEndDate: dayjs(currentEndDate)
            .tz("America/New_York")
            .endOf("day")
            .subtract(1, "month")
            .toISOString(),
        }
      );

      if (process.env.NODE_ENV === 'development') {
        console.log("📊 Leaderboard Response:", {
          tutorCount: leaderboardResponse.data.tutorOverview?.length || 0,
          hasData: !!leaderboardResponse.data.tutorOverview
        });
      }

      // Generate leaderboard from the API response (same query as main table)
      const allTutors = leaderboardResponse.data.tutorOverview || [];
      
      if (process.env.NODE_ENV === 'development') {
        console.log("📊 All tutors before filtering:", allTutors.length);
        
        // Log top 10 tutors before filtering for debugging
        const tutorsSorted = allTutors
          .map((entry) => ({
            tutorName: entry.tutor_name || "N/A",
            tutorId: entry.tutor_id,
            tutorStatus: entry.tutor_status,
            completedLessons: entry.total_complete_appointments_period || 0,
            totalHours: parseFloat(entry.tutor_total_hours_period || 0).toFixed(2),
          }))
          .sort((a, b) => parseFloat(b.totalHours) - parseFloat(a.totalHours));
        
        console.log("📊 Top 10 tutors by totalHours:", tutorsSorted.slice(0, 10).map(t => `${t.tutorName}: ${t.totalHours}`).join(", "));
      }
      
      const tutorsSorted = allTutors
        .map((entry) => ({
          tutorName: entry.tutor_name || "N/A",
          tutorId: entry.tutor_id,
          tutorStatus: entry.tutor_status,
          completedLessons: entry.total_complete_appointments_period || 0,
          totalHours: parseFloat(entry.tutor_total_hours_period || 0).toFixed(2),
        }))
        .sort((a, b) => parseFloat(b.totalHours) - parseFloat(a.totalHours));
      
      // Include all tutors except rejected and dormant (include approved, pending, and null/undefined)
      // This ensures the leaderboard shows the top performers regardless of approval status
      const leaderboard = allTutors
        .filter((entry) => {
          const status = entry.tutor_status?.toLowerCase();
          // Exclude only rejected and dormant tutors
          return status !== "rejected" && status !== "dormant";
        })
        .map((entry) => ({
          tutorName: entry.tutor_name || "N/A",
          totalHours: parseFloat(entry.tutor_total_hours_period || 0).toFixed(
            2
          ),
          completedLessons: entry.total_complete_appointments_period || 0,
        }))
        .sort((a, b) => parseFloat(b.totalHours) - parseFloat(a.totalHours))
        .slice(0, 5);

      if (process.env.NODE_ENV === 'development') {
        console.log("🏆 Leaderboard tutors:", leaderboard.map(l => `${l.tutorName}: ${l.totalHours || l.completedLessons}`).join(", "));
      }

      // Then get data for the specific tutor
      const tutorOverviewResponse = await axios.post(
        "/api/tutor-overview",
        {
          startDate: dayjs(currentStartDate)
            .tz("America/New_York")
            .startOf("day")
            .toISOString(),
          endDate: dayjs(currentEndDate)
            .tz("America/New_York")
            .endOf("day")
            .toISOString(),
          previousStartDate: dayjs(currentStartDate)
            .tz("America/New_York")
            .startOf("day")
            .subtract(1, "month")
            .toISOString(),
          previousEndDate: dayjs(currentEndDate)
            .tz("America/New_York")
            .endOf("day")
            .subtract(1, "month")
            .toISOString(),
          tutorId: tutor.tutor_id,
        }
      );

      if (process.env.NODE_ENV === 'development') {
        console.log("📊 Tutor Overview Response:", {
          tutorCount: tutorOverviewResponse.data?.tutorOverview?.length || 0
        });
      }

      // Use optimized batch endpoint to fetch all report data in one request
      if (process.env.NODE_ENV === 'development') {
        console.log("📡 Fetching tutor report data (optimized batch endpoint)...");
      }
      
      const reportResponse = await axios.post(
        "/api/tutor-report",
        {
          tutorId: tutor.tutor_id,
          startDate: dayjs(currentStartDate)
            .tz("America/New_York")
            .startOf("day")
            .toISOString(),
          endDate: dayjs(currentEndDate)
            .tz("America/New_York")
            .endOf("day")
            .toISOString(),
          previousStartDate: dayjs(currentStartDate)
            .tz("America/New_York")
            .startOf("day")
            .subtract(1, "month")
            .toISOString(),
          previousEndDate: dayjs(currentEndDate)
            .tz("America/New_York")
            .endOf("day")
            .subtract(1, "month")
            .toISOString(),
        }
      );

      if (process.env.NODE_ENV === 'development') {
        console.log("📊 Report Response:", {
          hasTutor: !!reportResponse.data.tutor,
          groupSessionsCount: reportResponse.data.groupSessions?.length || 0,
          reviewsCount: reportResponse.data.reviews?.length || 0
        });
      }

      const tutorData = reportResponse.data.tutor || tutor;
      const groupSessionData = reportResponse.data.groupSessions || [];
      const allReviews = reportResponse.data.reviews || [];

      if (process.env.NODE_ENV === 'development') {
        console.log("🟢 Group Session Data:", `${groupSessionData.length} sessions`);
      }
      
      // Calculate total counted students from all group sessions
      const totalCountedStudents = groupSessionData.reduce(
        (sum, session) => sum + Number(session.counted_students || 0),
        0
      );

      // Reviews are already filtered by date in the backend
      if (process.env.NODE_ENV === 'development') {
        console.log("📝 Reviews Count:", allReviews.length);
      }
      
      const filteredReviews = allReviews; // Backend already filters by date

      // Handle PostgreSQL array format - it might be a string or already parsed
      let lostClients = [];
      if (tutorData.lost_clients_details) {
        if (Array.isArray(tutorData.lost_clients_details)) {
          lostClients = tutorData.lost_clients_details;
        } else if (typeof tutorData.lost_clients_details === 'string') {
          try {
            lostClients = JSON.parse(tutorData.lost_clients_details);
          } catch (e) {
            console.warn("Failed to parse lost_clients_details:", e);
            lostClients = [];
          }
        }
      }

      if (process.env.NODE_ENV === 'development') {
        console.log("🛑 Lost Clients Count:", lostClients.length);
      }
      const consistencyBonus = calculateConsistencyBonus(
        tutorData.tutor_total_hours_period || tutor.tutor_total_hours_period || 0
      );

      if (process.env.NODE_ENV === 'development') {
        console.log("🟣 Consistency Bonus:", consistencyBonus);
      }
      // Calculate group bonus per session and sum them up (same logic as RetentionReportModal)
      const groupBonus = groupSessionData.reduce((sum, session) => {
        return sum + calculateGroupBonus(Number(session.counted_students) || 0);
      }, 0);

      if (process.env.NODE_ENV === 'development') {
        console.log("🟡 Group Bonus:", groupBonus);
        console.log("🟠 Additional Students:", additionalStudents);
        console.log("🔵 Total Counted Students:", totalCountedStudents);
        console.log("🔍 Total Hours:", tutorData.tutor_total_hours_period || tutor.tutor_total_hours_period);
      }
      
      const additionalStudents = totalCountedStudents;

      setRetentionReport({
        tutorName: tutorData?.tutor_name || tutor?.tutor_name || "Unknown Tutor",
        month: currentStartDate.format("MMMM YYYY"),
        leaderboard,
        lessons: {
          total: tutorData.total_complete_appointments_period || tutor.total_complete_appointments_period || 0,
          totalHours: parseFloat(tutorData.tutor_total_hours_period || tutor.tutor_total_hours_period || 0).toFixed(2),
          consistencyBonus,
          additionalStudents,
          groupBonus,
        },

        groupSessionData: groupSessionData,

        reviews: filteredReviews.map((review) => ({
          reviewerName: review.client_name || "Anonymous",
          text: review.extra_attrs_value || "No review text available",
          rating: review.star_rating_value || 0,
        })),
        retentionRates: {
          monthly: tutorData.period_retention_rate || tutor.period_retention_rate || 0,
          annual: tutorData.all_time_retention_rate || tutor.all_time_retention_rate || 0,
          avgMonthlyAllTutors: retentionRates.avgMonthlyAllTutors || 0,
        },
        lost_clients_details: lostClients.map((client) => ({
          client_name: client.client_name || "N/A",
          last_lesson_date: client.last_lesson_date || "N/A",
          total_lesson_count: client.total_lesson_count || 0,
        })),
      });

      if (process.env.NODE_ENV === 'development') {
        console.log("✅ Retention Report Successfully Set");
      }
    } catch (error) {
      console.error(
        "❌ Error fetching retention report:",
        error
      );
      console.error("Error details:", {
        message: error.message,
        response: error.response?.data,
        status: error.response?.status,
        stack: error.stack
      });
      toast.error(`Failed to fetch the retention report: ${error.message || 'Unknown error'}. Please try again.`);
    } finally {
      setLoading(false);
      if (process.env.NODE_ENV === 'development') {
        console.log("🔄 Loading finished.");
      }
    }
  };

  const closeRetentionReportModal = () => {
    setIsReportModalOpen(false);
    setRetentionReport(null);
  };

  const toggleRowExpansion = (rowLabel) => {
    setExpandedRows((prevExpandedRows) => ({
      ...prevExpandedRows,
      [rowLabel]: !prevExpandedRows[rowLabel],
    }));
  };

  const [weeklyStats, setWeeklyStats] = useState({
    totalLessons: 0,
    totalOtherDivisionLessons: 0,
    periodBeforeLessons: 0,
    fourPeriodAvgLessons: 0,
    totalStudents: 0,
    totalHours: 0,
    avgStudentsPerLesson: 0.0,
    avgHoursPerLesson: 0.0,
    detailedLessons: [],
  });

  useEffect(() => {
    if (
      Array.isArray(weeklyStats.detailedLessons) ||
      Array.isArray(lessonsData)
    ) {
      const combinedLessons = [
        ...(Array.isArray(weeklyStats.detailedLessons)
          ? weeklyStats.detailedLessons
          : []),
        ...(Array.isArray(lessonsData) ? lessonsData : []),
      ];

      const updatedFilteredLessons = combinedLessons.filter((lesson) => {
        const lessonDate = dayjs(lesson.start || lesson.lessonStart).tz(
          "America/New_York"
        );
        return lessonDate.isBetween(startDate, endDate, null, "[]");
      });

      setFilteredLessons(updatedFilteredLessons);
    }
  }, [weeklyStats.detailedLessons, lessonsData, startDate, endDate]);

  const [clientCounts, setClientCounts] = useState({
    total: 0,
    active: 0,
    inactive: 0,
    ancient: 0,
    archived: 0,
    dead: 0,
    activeClients30Days: 0,
    activeClientsPreviousPeriod: 0,
  });

  useEffect(() => {
    const updatedFilteredLessons = weeklyStats.detailedLessons.filter(
      (lesson) => {
        const lessonStart = dayjs(lesson.lessonStart).tz("America/New_York");
        return lessonStart.isBetween(startDate, endDate, null, "[]");
      }
    );
    setFilteredLessons(updatedFilteredLessons);
  }, [weeklyStats.detailedLessons, startDate, endDate]);

  const ReviewModal = ({ open, onClose, reviews, tutorName }) => (
    <HeadlessModal isOpen={open} onClose={onClose} title={`Reviews for ${tutorName}`} size="md">
      {Array.isArray(reviews) && reviews.length > 0 ? (
        reviews.map((review) => {
          const dateCreated = review.date_created
            ? dayjs(review.date_created)
                .tz("America/New_York")
                .format("MMMM D, YYYY h:mm A")
            : "Unknown Date";

          return (
            <div key={review.review_id} className="mb-4 pb-4 border-b border-neutral-100 last:border-0">
              <p className="text-sm text-neutral-800">
                <span className="font-medium">Client:</span> {review.client_name || "Unknown"}
              </p>
              <p className="text-sm text-neutral-800">
                <span className="font-medium">Date:</span> {dateCreated}
              </p>
              <p className="text-sm text-neutral-800">
                <span className="font-medium">Rating:</span> {review.star_rating_value || "N/A"}
              </p>
              <p className="text-sm text-neutral-600 mt-1">
                {review.extra_attrs_value || "No review text available."}
              </p>
            </div>
          );
        })
      ) : (
        <p className="text-sm text-neutral-500">No reviews available for the selected period.</p>
      )}
    </HeadlessModal>
  );

  const fetchLabelsForAllTutors = async () => {
    try {
      const contractorIds = tutorData.map((tutor) => tutor.tutor_id);
      const response = await axios.post(
        "/api/tutor-labels/bulk",
        { contractorIds }
      );

      const { results } = response.data;

      console.log("Fetched Labels:", results);

      const updatedTutorData = tutorData.map((tutor) => {
        const fetchedTutor = results.find(
          (result) => result.contractorId === tutor.tutor_id
        );
        return fetchedTutor
          ? {
              ...tutor,
              labels: fetchedTutor.labels
                ? fetchedTutor.labels.split(",").map((label) => label.trim())
                : [],
            }
          : tutor;
      });

      console.log("Updated Tutor Data with Labels:", updatedTutorData);

      setTutorData(updatedTutorData);
    } catch (error) {
      console.error("Error fetching labels:", error.message);
    }
  };

  const fetchClientReviews = async (tutorId, tutorName, startDate, endDate) => {
    setLoading(true);
    try {
      const response = await axios.get(`/api/reviews`, {
        params: {
          tutor_id: tutorId,
          start_date: startDate.format("YYYY-MM-DD"),
          end_date: endDate.format("YYYY-MM-DD"),
        },
      });

      const { reviews, count } = response.data;

      setReviews(reviews || []);
      setReviewCount(count || 0);
      setSelectedTutorName(tutorName);
      setIsModalOpen(true);
    } catch (error) {
      console.error("❌ Error fetching reviews:", {
        message: error.message,
        response: error.response?.data,
        status: error.response?.status
      });
      setReviews([]);
    } finally {
      setLoading(false);
    }
  };

  const fetchAllReviews = async () => {
    setLoading(true);
    try {
      const response = await axios.get("/fetch-reviews");
      console.log("Fetch reviews response:", response.data);

      toast.success("All reviews fetched and stored successfully!");
    } catch (error) {
      console.error(
        "Error fetching all reviews:",
        error.response || error.message
      );
      toast.error("Failed to fetch reviews. Please check the logs for details.");
    } finally {
      setLoading(false);
    }
  };

  const [paginationModel, setPaginationModel] = useState({
    pageSize: 10,
    page: 0,
  });

  const [detailedClientData, setDetailedClientData] = useState({
    newClientsList: [],
    clientsLostList: [],
  });

  const setThisWeek = () => {
    setStartDate(dayjs().tz("America/New_York").startOf("week"));
    setEndDate(dayjs().tz("America/New_York").endOf("week"));
    setFetchTriggered(false);
    setDataFetched(false);
  };

  const setLastWeek = () => {
    setStartDate(
      dayjs().subtract(1, "week").tz("America/New_York").startOf("week")
    );
    setEndDate(
      dayjs().subtract(1, "week").tz("America/New_York").endOf("week")
    );
    setFetchTriggered(false);
    setDataFetched(false);
  };

  const setThisMonth = () => {
    setStartDate(dayjs().tz("America/New_York").startOf("month"));
    setEndDate(dayjs().tz("America/New_York").endOf("month"));
    setFetchTriggered(false);
    setDataFetched(false);
  };

  const setLastMonth = () => {
    setStartDate(
      dayjs().subtract(1, "month").tz("America/New_York").startOf("month")
    );
    setEndDate(
      dayjs().subtract(1, "month").tz("America/New_York").endOf("month")
    );
    setFetchTriggered(false);
    setDataFetched(false);
  };

  const setThisYear = () => {
    setStartDate(dayjs().startOf("year"));
    setEndDate(dayjs());
    setFetchTriggered(false);
    setDataFetched(false);
  };

  const setLastYear = () => {
    setStartDate(dayjs().subtract(1, "year").startOf("year"));
    setEndDate(dayjs().subtract(1, "year").endOf("year"));
    setFetchTriggered(false);
    setDataFetched(false);
  };

  const setQ1 = () => {
    setStartDate(dayjs().startOf("year"));
    setEndDate(dayjs().startOf("year").add(2, "month").endOf("month"));
    setFetchTriggered(false);
    setDataFetched(false);
  };

  const setQ2 = () => {
    setStartDate(dayjs().startOf("year").add(3, "month"));
    setEndDate(dayjs().startOf("year").add(5, "month").endOf("month"));
    setFetchTriggered(false);
    setDataFetched(false);
  };

  const setQ3 = () => {
    setStartDate(dayjs().startOf("year").add(6, "month"));
    setEndDate(dayjs().startOf("year").add(8, "month").endOf("month"));
    setFetchTriggered(false);
    setDataFetched(false);
  };

  const setQ4 = () => {
    setStartDate(dayjs().startOf("year").add(9, "month"));
    setEndDate(dayjs().startOf("year").add(11, "month").endOf("month"));
    setFetchTriggered(false);
    setDataFetched(false);
  };

  const handleWeekSelection = (date) => {
    const startOfWeek = dayjs(date).startOf("week");
    const endOfWeek = dayjs(date).endOf("week");
    setFetchTriggered(false);
    setDataFetched(false);
    setStartDate(startOfWeek);
    setEndDate(endOfWeek);
  };

  const CustomToolbar = () => {
    return (
      <GridToolbarContainer>
        <GridToolbarExport csvOptions={{ fileName: "LessonDetails" }} />
      </GridToolbarContainer>
    );
  };

  const handleTabChange = (event, newValue) => {
    setActiveTab(newValue);
  };

  const fetchTutorLessonsForTutor = async (tutorId, tutorName) => {
    setLoading(true);
    try {
      const startDateFormatted = dayjs(startDate)
        .tz("America/New_York")
        .startOf("day")
        .toISOString();
      const endDateFormatted = dayjs(endDate)
        .tz("America/New_York")
        .endOf("day")
        .toISOString();

      const response = await axios.post(
        "/tutor-lessons",
        {
          startDate: startDateFormatted,
          endDate: endDateFormatted,
          tutorId,
        }
      );

      console.log(` Unique Lessons for ${tutorName}:`, response.data);
      setLessonsData(response.data.lessons || []);
      setSelectedTutorName(tutorName);
      setIsLessonsModalOpen(true);
    } catch (error) {
      console.error("❌ Error fetching unique lesson data:", {
        message: error.message,
        response: error.response?.data,
        status: error.response?.status
      });
      toast.error(`Failed to fetch unique lesson data: ${error.response?.data?.error || error.message}`);
    } finally {
      setLoading(false);
    }
  };

  const fetchTutorLabels = async () => {
    setLoading(true);
    try {
      const response = await axios.get("/api/tutor-labels");
      const { labels } = response.data;

      const updatedTutorData = tutorData.map((tutor) => {
        const labelEntry = labels.find(
          (entry) => entry.contractor_id === tutor.tutor_id
        );
        return {
          ...tutor,
          labels: labelEntry
            ? labelEntry.labels.split(",").map((label) => ({
                label_name: label.trim(),
              }))
            : [],
        };
      });

      setTutorData(updatedTutorData);
    } catch (error) {
      console.error("Error fetching tutor labels:", error.message);
      toast.error("Failed to fetch tutor labels.");
    } finally {
      setLoading(false);
    }
  };

  const fetchTutorData = useCallback(async () => {
    setLoading(true);
    try {
      const tutorOverviewResponse = await axios.post(
        "/api/tutor-overview",
        {
          startDate: dayjs(startDate)
            .tz("America/New_York")
            .startOf("day")
            .toISOString(),
          endDate: dayjs(endDate)
            .tz("America/New_York")
            .endOf("day")
            .toISOString(),
          previousStartDate: dayjs(startDate)
            .tz("America/New_York")
            .startOf("day")
            .subtract(1, "month")
            .toISOString(),
          previousEndDate: dayjs(endDate)
            .tz("America/New_York")
            .endOf("day")
            .subtract(1, "month")
            .toISOString(),
        }
      );

      const { tutorOverview, allTutorsAvgMonthlyRetention } =
        tutorOverviewResponse.data;

      if (tutorOverview) {
        // Filter out null/invalid tutors before processing
        const validTutors = tutorOverview.filter(tutor => tutor && tutor.tutor_id && tutor.tutor_name);
        
        if (process.env.NODE_ENV === 'development') {
          console.log("📊 Tutor Overview - Checking Lessons Count Per Tutor:");
          validTutors.forEach((tutor) => {
            console.log(
              `🔹 Tutor: ${tutor.tutor_name} (ID: ${tutor.tutor_id}) - Lessons: ${tutor.total_complete_appointments_period}`
            );
          });
        }

        // Process tutors in batches to prevent connection exhaustion
        const BATCH_SIZE = 5; // Process 5 tutors at a time
        const tutorDataWithReviews = [];
        
        for (let i = 0; i < validTutors.length; i += BATCH_SIZE) {
          const batch = validTutors.slice(i, i + BATCH_SIZE);
          
          const batchResults = await Promise.all(
            batch.map(async (tutor) => {
              try {
                const reviewsResponse = await axios.get(`/api/reviews`, {
                  params: {
                    tutor_id: tutor.tutor_id,
                    start_date: startDate.format("YYYY-MM-DD"),
                    end_date: endDate.format("YYYY-MM-DD"),
                  },
                });

                return {
                  ...tutor,
                  review_count: reviewsResponse.data.count || 0,
                };
              } catch (error) {
                console.error(
                  `❌ Error fetching reviews for Tutor ${tutor.tutor_id}:`,
                  {
                    message: error.message,
                    response: error.response?.data,
                    status: error.response?.status
                  }
                );
                return { ...tutor, review_count: 0 };
              }
            })
          );
          
          tutorDataWithReviews.push(...batchResults);
          
          // Add delay between batches to prevent overwhelming the database
          if (i + BATCH_SIZE < tutorOverview.length) {
            await new Promise(resolve => setTimeout(resolve, 100));
          }
        }

        if (process.env.NODE_ENV === 'development') {
          console.log(
            "✅ Processed Tutor Data:",
            `${tutorDataWithReviews.length} tutors processed`
          );
        }

        setTutorData(tutorDataWithReviews);

        setRetentionRates((prev) => ({
          ...prev,
          avgMonthlyAllTutors: parseFloat(allTutorsAvgMonthlyRetention) || 0,
        }));
      } else {
        console.error(" No tutorOverview returned from API.");
      }
    } catch (error) {
      console.error("❌ Error fetching tutor overview data:", {
        message: error.message,
        response: error.response?.data,
        status: error.response?.status,
        statusText: error.response?.statusText,
        stack: error.stack
      });
      // Show user-friendly error message
      if (error.response?.status === 504) {
        toast.error("The request timed out. Please try a shorter date range.");
      } else if (error.response?.status >= 500) {
        toast.error("Server error. Please try again later.");
      } else if (error.response?.status >= 400) {
        toast.error(error.response?.data?.error || error.message);
      }
    } finally {
      setLoading(false);
    }
  }, [startDate, endDate]);

  const fetchTutorStatus = async (contractorId, rowIndex) => {
    try {
      const response = await axios.get(
        `https://secure.tutorcruncher.com/api/contractors/${contractorId}/`
      );

      const status = response.data.status;

      setTutorData((prevData) =>
        prevData.map((row, index) =>
          index === rowIndex ? { ...row, tutor_status: status } : row
        )
      );

      return status;
    } catch (error) {
      console.error(
        `Error fetching tutor status for ID ${contractorId}:`,
        error
      );
      return "Error";
    }
  };

  const tutorColumns = [
    {
      field: "tutor_name",
      headerName: "Tutor",
      width: 200,
      pinned: "left",
    },
    {
      field: "tutor_status",
      headerName: "Status",
      width: 200,
    },

    {
      field: "labels",
      headerName: "Labels",
      width: 300,
    },

    {
      field: "tutor_id",
      headerName: "Tutor ID",
      width: 200,
      renderCell: (params) => (
        <a
          href={`https://secure.tutorcruncher.com/contractors/${params.value}/`}
          target="_blank"
          rel="noopener noreferrer"
          className="text-blue-600 no-underline"
        >
          {params.value}
        </a>
      ),
    },

    {
      field: "monthlyRetentionReport",
      headerName: "Monthly Report",
      width: 200,
      renderCell: (params) => (
        <Button
          variant="contained"
          color="primary"
          size="small"
          onClick={() => openRetentionReportModal(params.row)}
        >
          View Report
        </Button>
      ),
    },

    {
      field: "review_count",
      headerName: "Review Count",
      width: 150,
      renderCell: (params) => {
        return (
          <Box
            sx={{
              display: "flex",
              justifyContent: "center",
              alignItems: "center",
              height: "100%",
            }}
          >
            {params.row.review_count || 0}
          </Box>
        );
      },
    },

    {
      field: "reviews",
      headerName: "Reviews",
      width: 150,
      renderCell: (params) => (
        <Box
          sx={{
            display: "flex",
            justifyContent: "center",
            alignItems: "center",
            height: "100%",
          }}
        >
          <Button
            variant="contained"
            color="primary"
            size="small"
            onClick={() =>
              fetchClientReviews(
                params.row.tutor_id,
                params.row.tutor_name,
                startDate,
                endDate
              )
            }
          >
            View Reviews
          </Button>
        </Box>
      ),
    },

    {
      field: "total_complete_appointments_period",
      headerName: "Total Lessons (Unique / Period)",
      width: 250,
      type: "number",
      // Numeric operators are available by default in free version
    },
    {
      field: "tutor_total_hours_period",
      headerName: "Total Hours (Unique / Period)",
      width: 250,
      type: "number",
      renderCell: (params) => (
        <Box
          sx={{
            display: "flex",
            justifyContent: "center",
            alignItems: "center",
            width: "100%",
            height: "100%",
            gap: 1,
          }}
        >
          {params.value}
          <Button
            variant="contained"
            color="primary"
            size="small"
            sx={{ minWidth: "120px" }}
            onClick={() =>
              fetchTutorLessonsForTutor(
                params.row.tutor_id,
                params.row.tutor_name
              )
            }
          >
            View Lessons
          </Button>
        </Box>
      ),
    },

    {
      field: "total_cancelled_appointments_period",
      headerName: "Cancelled (Period)",
      width: 200,
      type: "number",
      // Numeric operators are available by default in free version
    },
    {
      field: "total_chargeable_cancelled_appointments_period",
      headerName: "CBC (Period)",
      width: 200,
      type: "number",
      // Numeric operators are available by default in free version
    },

    {
      field: "clients_worked_with",
      headerName: "Clients Worked With (All Time)",
      width: 200,
      type: "number",
      // Numeric operators are available by default in free version
    },
    {
      field: "clients_active_30_days",
      headerName: "Clients Active (Last 30 Days)",
      width: 200,
      type: "number",
      // Numeric operators are available by default in free version
    },
    {
      field: "all_time_retention_rate",
      headerName: "All-Time Retention Rate (%)",
      width: 200,
      type: "number",
      // Numeric operators are available by default in free version
    },
    {
      field: "period_retention_rate",
      headerName: "Period Retention Rate (%)",
      width: 200,
      type: "number",
      // Numeric operators are available by default in free version
    },

    {
      field: "new_clients_period",
      headerName: "New Clients (Period)",
      width: 200,
      type: "number",
      // Numeric operators are available by default in free version
    },
    {
      field: "retained_clients_period",
      headerName: "Retained Clients (Period)",
      width: 200,
      type: "number",
      // Numeric operators are available by default in free version
    },
    {
      field: "lost_clients_period",
      headerName: "Lost Clients (Period)",
      width: 200,
      type: "number",
      // Numeric operators are available by default in free version
    },
    {
      field: "total_complete_appointments_all_time",
      headerName: "Total Lessons (All Time)",
      width: 200,
      type: "number",
      // Numeric operators are available by default in free version
    },
    {
      field: "tutor_total_hours_all_time",
      headerName: "Total Hours (All Time)",
      width: 200,
      type: "number",
      // Numeric operators are available by default in free version
    },
    {
      field: "total_cancelled_appointments_all_time",
      headerName: "Cancelled (All Time)",
      width: 200,
      type: "number",
      // Numeric operators are available by default in free version
    },
    {
      field: "total_chargeable_cancelled_appointments_all_time",
      headerName: "CBC (All Time)",
      width: 200,
      type: "number",
      // Numeric operators are available by default in free version
    },
  ];

  const updateAllTutorStatuses = async () => {
    setLoading(true);
    try {
      const response = await axios.post(
        "/update-all-tutors-status",
        {}
      );

      if (response.data.updates) {
        const updatedTutorData = tutorData.map((tutor) => {
          const update = response.data.updates.find(
            (u) => u.contractorId === tutor.tutor_id
          );
          if (update) {
            return { ...tutor, tutor_status: update.status };
          }
          return tutor;
        });

        setTutorData(updatedTutorData);
      }
      console.log("All tutor statuses updated successfully.");
    } catch (error) {
      console.error("Error updating all tutor statuses:", error.message);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (fetchTriggered) {
      console.log("Fetching data for updated date range.");
      fetchTutorData();
    }
  }, [fetchTriggered]);

  useEffect(() => {
    console.log("Updated weeklyStats state:", weeklyStats);
  }, [weeklyStats]);

  return (
    <LocalizationProvider dateAdapter={AdapterDayjs}>
      <Box sx={{ width: "100%" }}>
        <Box sx={{ mb: 2, display: "flex", gap: 2 }}>
          <DatePicker
            label="Start Date"
            value={startDate}
            onChange={handleStartDateChange}
            slotProps={{ textField: { variant: 'outlined' } }}
          />
          <DatePicker
            label="End Date"
            value={endDate}
            onChange={handleEndDateChange}
            slotProps={{ textField: { variant: 'outlined' } }}
          />
        </Box>

        <Box sx={{ mb: 2 }}>
          {dataFetched ? (
            <Typography variant="subtitle2" color="textSecondary">
              Data has been fetched for the selected range.
            </Typography>
          ) : (
            <Typography variant="subtitle2" color="error">
              Data is not fetched yet. Click 'Fetch Data' to load *once* and
              then wait for this red text to dissapear.
            </Typography>
          )}
        </Box>

        <Box sx={{ mb: 2, display: "flex", gap: 2 }}>
          <Button
            variant="contained"
            color="primary"
            onClick={handleFetchData}
            disabled={loading}
          >
            {loading ? <CircularProgress size={24} /> : "Fetch Data"}
          </Button>
        </Box>

        <Box sx={{ mb: 2 }}>
          <Button variant="outlined" onClick={setThisWeek} sx={{ mr: 1 }}>
            This Week
          </Button>
          <Button variant="outlined" onClick={setLastWeek} sx={{ mr: 1 }}>
            Last Week
          </Button>
          <Button variant="outlined" onClick={setThisMonth} sx={{ mr: 1 }}>
            This Month
          </Button>
          <Button variant="outlined" onClick={setLastMonth} sx={{ mr: 1 }}>
            Last Month
          </Button>
          <Button variant="outlined" onClick={setThisYear} sx={{ mr: 1 }}>
            This Year
          </Button>
          <Button variant="outlined" onClick={setLastYear} sx={{ mr: 1 }}>
            Last Year
          </Button>

          <Button variant="outlined" onClick={setQ1} sx={{ mr: 1 }}>
            Q1
          </Button>
          <Button variant="outlined" onClick={setQ2} sx={{ mr: 1 }}>
            Q2
          </Button>
          <Button variant="outlined" onClick={setQ3} sx={{ mr: 1 }}>
            Q3
          </Button>
          <Button variant="outlined" onClick={setQ4}>
            Q4
          </Button>
        </Box>

        <Box sx={{ mb: 2, display: "flex", gap: 2 }}>
          <Button
            variant="contained"
            color="primary"
            onClick={updateAllTutorStatuses}
            disabled={loading}
          >
            {loading ? "Updating..." : "Update All Tutors Statuses"}
          </Button>

          <Button variant="outlined" size="medium" onClick={fetchAllReviews}>
            Fetch Reviews
          </Button>
          <Button
            variant="contained"
            color="secondary"
            onClick={fetchLabelsForAllTutors}
            disabled={loading}
          >
            {loading ? <CircularProgress size={20} /> : "Fetch Labels"}
          </Button>

          <Button
            variant="outlined"
            onClick={() => setOpenExclusionModal(true)}
          >
            Exclude Tutors from Group Bonus
          </Button>
          {renderExclusionModal()}
        </Box>

        <Box>
          <StyledDataGrid
            pagination
            rows={tutorData.filter(
              (row) => row.tutor_id !== null && row.tutor_id !== undefined
            )}
            columns={tutorColumns}
            getRowId={(row) => row.tutor_id}
            loading={loading}
            pageSizeOptions={[5, 10, 25, 50, 100]}
            paginationModel={paginationModel}
            onPaginationModelChange={(newModel) => setPaginationModel(newModel)}
            autoHeight={false}
            disableRowSelectionOnClick
            {...tutorColumns}
            slots={{
              toolbar: GridToolbar,
            }}
            sx={{
              width: "100%",
              maxWidth: "85vw",
            }}
            initialState={{ pinnedColumns: { left: ["tutor_name"] } }}
            getRowClassName={getRowClassName}
          />
          <ReviewModal
            open={isModalOpen}
            onClose={() => setIsModalOpen(false)}
            reviews={reviews}
            tutorName={selectedTutorName}
          />

          <LessonDetailsModal
            open={isLessonsModalOpen}
            onClose={() => setIsLessonsModalOpen(false)}
            lessons={lessonsData}
            tutorName={selectedTutorName}
          />

          {isReportModalOpen && (
            <RetentionReportModal
              open={isReportModalOpen}
              onClose={closeRetentionReportModal}
              reportData={retentionReport}
              tutorId={selectedTutor?.tutor_id}
              tutorData={tutorData}
              loading={loading}
              excludedTutors={excludedTutors}
            />
          )}
        </Box>
      </Box>
    </LocalizationProvider>
  );
};

export default ClientRetention;
