import React, { useEffect, useState } from "react";
import {
  Box,
  Button,
  CircularProgress,
  TextField,
  MenuItem,
  Select,
  FormControl,
  InputLabel,
} from "@mui/material";
import Typography from "@mui/joy/Typography";
import { DataGrid, GridToolbar } from "@mui/x-data-grid";
import Tooltip from "@mui/material/Tooltip";
import { InformationCircleIcon, ChevronDownIcon, UserGroupIcon } from '@heroicons/react/24/outline';
import axios from "axios";
import { DatePicker } from "@mui/x-date-pickers";
import { LocalizationProvider } from "@mui/x-date-pickers/LocalizationProvider";
import { AdapterDayjs } from "@mui/x-date-pickers/AdapterDayjs";
import dayjs from "dayjs";
import utc from "dayjs/plugin/utc";
import timezone from "dayjs/plugin/timezone";
import { Accordion, AccordionSummary, AccordionDetails } from "@mui/material";
import StatisticCard from "./StatisticCard";

dayjs.extend(utc);
dayjs.extend(timezone);

const RetentionMetrics = () => {
  const [loading, setLoading] = useState(false);
  const [retainedClients, setRetainedClients] = useState([]);
  const [newlyActiveClients, setNewlyActiveClients] = useState([]);
  const [lostClients, setLostClients] = useState([]);
  const [selectedDivisions, setSelectedDivisions] = useState([]);
  const [dataFetched, setDataFetched] = useState(false);
  const [retainedClientsPreviousPeriod, setRetainedClientsPreviousPeriod] =
    useState([]);

  const [paginationModel, setPaginationModel] = useState({
    pageSize: 10,
    page: 0,
  });
  const handlePaginationModelChange = (model) => {
    setPaginationModel(model);
  };

  const formatDateTime = (dateTime) =>
    dateTime
      ? dayjs(dateTime).tz("America/New_York").format("MM/DD/YYYY, h:mm:ss A")
      : "N/A";

  const [lessonDetailsPeriod, setLessonDetailsPeriod] = useState({
    count: 0,
    lessonIds: [],
    serviceIds: [],
    startTimes: [],
  });
  const [lessonDetailsPreviousPeriod, setLessonDetailsPreviousPeriod] =
    useState({
      count: 0,
      lessonIds: [],
      serviceIds: [],
      startTimes: [],
    });

  const [metricsData, setMetricsData] = useState({
    retentionRate: 0,
    newlyActiveClientsCount: 0,
    lostClientsCount: 0,
  });

  const [startDate, setStartDate] = useState(dayjs().startOf("month"));
  const [endDate, setEndDate] = useState(dayjs());

  const [divisions, setDivisions] = useState([]);
  const [labels, setLabels] = useState([]);
  const [selectedDivision, setSelectedDivision] = useState("");
  const [filteredLabels, setFilteredLabels] = useState([]);
  const [selectedLabels, setSelectedLabels] = useState([]);

  const [isFiltersValid, setIsFiltersValid] = useState(false);

  useEffect(() => {
    fetchFilters();
  }, []);

  useEffect(() => {
    if (selectedDivision && labels[selectedDivision]) {
      setFilteredLabels(labels[selectedDivision]);
    } else {
      setFilteredLabels([]);
    }
    setSelectedLabels([]);
  }, [selectedDivision, labels]);

  useEffect(() => {
    console.log("Divisions:", divisions);
    console.log("Selected Division:", selectedDivision);
    console.log("Filtered Labels:", filteredLabels);
  }, [divisions, selectedDivision, filteredLabels]);

  useEffect(() => {
    const isValid = startDate && endDate;
    setIsFiltersValid(isValid);
  }, [startDate, endDate, selectedDivision, selectedLabels]);

  const fetchFilters = async () => {
    try {
      const response = await axios.post(
        "/api/divisions-and-labels",
        {}
      );

      const groupedData = response.data;

      console.log("Raw divisions and labels data:", groupedData);

      if (Array.isArray(groupedData)) {
        const divisions = groupedData.map((item) => item.division);
        setDivisions(divisions);
        console.log("Processed Divisions:", divisions);

        const labelsMap = groupedData.reduce((acc, item) => {
          acc[item.division] = item.labels || [];
          return acc;
        }, {});
        setLabels(labelsMap);
        console.log("Processed Labels Map:", labelsMap);
      } else {
        console.error("Unexpected response format:", groupedData);
      }
    } catch (error) {
      console.error("Error fetching filters:", error);
    }
  };

  const handleLabelChange = (event) => {
    const value = event.target.value;

    if (value.includes("All")) {
      if (selectedLabels.length === filteredLabels.length) {
        setSelectedLabels([]);
      } else {
        setSelectedLabels(filteredLabels);
      }
    } else {
      setSelectedLabels(value);
    }
  };

  const fetchRetentionMetrics = async () => {
    setLoading(true);
    try {
      const response = await axios.post(
        "/api/metrics-by-division",
        {
          startDate: startDate
            .tz("America/New_York")
            .startOf("day")
            .toISOString(),
          endDate: endDate.tz("America/New_York").endOf("day").toISOString(),

          divisions: selectedDivisions.length > 0 ? selectedDivisions : [],
          labels: selectedLabels.length > 0 ? selectedLabels.map(String) : [],
        }
      );

      console.log("Retention Metrics Response:", response.data);

      const {
        retentionRate = 0,
        retainedClients = [],
        newlyActiveClients = [],
        newlyActiveClientsCount = 0,
        retainedClientsPreviousPeriod = [],
        lostClients = [],
        lostClientsCount = 0,
        totalClientsAllTime = 0,
        activeClientsAllTime = 0,
        activeClientsPreviousPeriod = 0,
        activeClientsPeriod = 0,
        inactiveClients = 0,
        ancientClients = 0,
        archivedClients = 0,
        deadClients = 0,
        totalLessonsPeriod = 0,
        lessonsPreviousPeriod = 0,
        periodBefore = 0,
        avgLessonsFourPeriods = 0,
        totalStudents = 0,
        totalHours = 0,
        avgStudentsPerLesson = 0,
        avgHoursPerLesson = 0,
      } = response.data;

      setRetainedClientsPreviousPeriod(retainedClientsPreviousPeriod);

      setMetricsData((prevData) => ({
        ...prevData,
        retentionRate: response.data.retentionRate,
        retainedClientsPreviousPeriod:
          response.data.retainedClientsPreviousPeriod?.length || 0,

        newlyActiveClientsCount: response.data.newlyActiveClientsCount,
        lostClientsCount: response.data.lostClientsCount,
        totalClientsAllTime: response.data.totalClientsAllTime,
        activeClientsAllTime: response.data.activeClientsAllTime,
        activeClientsPreviousPeriod: response.data.activeClientsPreviousPeriod,
        activeClientsPeriod: response.data.activeClientsPeriod,
        inactiveClients: response.data.inactiveClients,
        ancientClients: response.data.ancientClients,
        archivedClients: response.data.archivedClients,
        deadClients: response.data.deadClients,
        totalLessonsPeriod: response.data.totalLessonsPeriod,
        lessonsPreviousPeriod: response.data.lessonsPreviousPeriod,
        periodBefore: response.data.periodBefore,
        avgLessonsFourPeriods: response.data.avgLessonsFourPeriods,
        totalStudents: response.data.totalStudents,
        totalHours: response.data.totalHours,
        avgStudentsPerLesson: response.data.avgStudentsPerLesson,
        avgHoursPerLesson: response.data.avgHoursPerLesson,
      }));

      setRetainedClients(retainedClients);
      setNewlyActiveClients(newlyActiveClients);
      setLostClients(lostClients);
      setDataFetched(true);
      setLessonDetailsPeriod({
        count: response.data.lessonDetailsPeriod?.count || 0,
        lessonIds: response.data.lessonDetailsPeriod?.lessonIds || [],
        serviceIds: response.data.lessonDetailsPeriod?.serviceIds || [],
        startTimes: response.data.lessonDetailsPeriod?.startTimes || [],
        jobNames: response.data.lessonDetailsPeriod?.jobNames || [],
        studentNames: response.data.lessonDetailsPeriod?.studentNames || [],
        tutorNames: response.data.lessonDetailsPeriod?.tutorNames || [],
        units: response.data.lessonDetailsPeriod?.units || [],
      });

      setLessonDetailsPreviousPeriod({
        count: response.data.lessonDetailsPreviousPeriod?.count || 0,
        lessonIds: response.data.lessonDetailsPreviousPeriod?.lessonIds || [],
        serviceIds: response.data.lessonDetailsPreviousPeriod?.serviceIds || [],
        startTimes: response.data.lessonDetailsPreviousPeriod?.startTimes || [],
        jobNames: response.data.lessonDetailsPreviousPeriod?.jobNames || [],
        studentNames:
          response.data.lessonDetailsPreviousPeriod?.studentNames || [],
        tutorNames: response.data.lessonDetailsPreviousPeriod?.tutorNames || [],
        units: response.data.lessonDetailsPreviousPeriod?.units || [],
      });
    } catch (error) {
      console.error("Error fetching retention metrics:", error);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    console.log("Metrics Data Updated:", metricsData);
  }, [metricsData]);

  useEffect(() => {
    console.log("Retained Clients Updated:", retainedClients);
    console.log("Newly Active Clients Updated:", newlyActiveClients);
    console.log("Lost Clients Updated:", lostClients);
  }, [retainedClients, newlyActiveClients, lostClients]);

  const setThisWeek = () => {
    const start = dayjs().tz("America/New_York").startOf("week");
    const end = dayjs().tz("America/New_York").endOf("week");
    setStartDate(start);
    setEndDate(end);
  };

  const setLastWeek = () => {
    const start = dayjs()
      .tz("America/New_York")
      .subtract(1, "week")
      .startOf("week");
    const end = dayjs()
      .tz("America/New_York")
      .subtract(1, "week")
      .endOf("week");
    setStartDate(start);
    setEndDate(end);
  };

  const setLast2Months = () => {
    const start = dayjs()
      .tz("America/New_York")
      .subtract(2, "month")
      .startOf("month");
    const end = dayjs()
      .tz("America/New_York")
      .subtract(1, "month")
      .endOf("month");
    setStartDate(start);
    setEndDate(end);
  };

  const setThisMonth = () => {
    const start = dayjs().tz("America/New_York").startOf("month");
    const end = dayjs().tz("America/New_York").endOf("month");
    setStartDate(start);
    setEndDate(end);
  };

  const setLastMonth = () => {
    const start = dayjs()
      .tz("America/New_York")
      .subtract(1, "month")
      .startOf("month");
    const end = dayjs()
      .tz("America/New_York")
      .subtract(1, "month")
      .endOf("month");
    setStartDate(start);
    setEndDate(end);
  };

  const setThisYear = () => {
    const start = dayjs().tz("America/New_York").startOf("year");
    const end = dayjs().tz("America/New_York").endOf("year");
    setStartDate(start);
    setEndDate(end);
  };

  const setLastYear = () => {
    const start = dayjs()
      .tz("America/New_York")
      .subtract(1, "year")
      .startOf("year");
    const end = dayjs()
      .tz("America/New_York")
      .subtract(1, "year")
      .endOf("year");
    setStartDate(start);
    setEndDate(end);
  };

  const setQuarter = (quarter) => {
    const year = dayjs().tz("America/New_York").year();
    const quarters = {
      Q1: [
        dayjs.tz(`${year}-01-01`, "America/New_York"),
        dayjs.tz(`${year}-03-31`, "America/New_York").endOf("day"),
      ],
      Q2: [
        dayjs.tz(`${year}-04-01`, "America/New_York"),
        dayjs.tz(`${year}-06-30`, "America/New_York").endOf("day"),
      ],
      Q3: [
        dayjs.tz(`${year}-07-01`, "America/New_York"),
        dayjs.tz(`${year}-09-30`, "America/New_York").endOf("day"),
      ],
      Q4: [
        dayjs.tz(`${year}-10-01`, "America/New_York"),
        dayjs.tz(`${year}-12-31`, "America/New_York").endOf("day"),
      ],
    };
    const [start, end] = quarters[quarter];
    setStartDate(start);
    setEndDate(end);
  };

  useEffect(() => {
    if (selectedDivisions.length > 0) {
      const combinedLabels = selectedDivisions.flatMap(
        (division) => labels[division] || []
      );
      const uniqueLabels = [...new Set(combinedLabels)];
      setFilteredLabels(uniqueLabels);

      setSelectedLabels((prevSelected) =>
        prevSelected.filter((label) => uniqueLabels.includes(label))
      );
    } else {
      setFilteredLabels([]);
      setSelectedLabels([]);
    }
  }, [selectedDivisions, labels]);

  return (
    <LocalizationProvider dateAdapter={AdapterDayjs}>
      <Box sx={{ width: "100%" }}>
        <Box sx={{ display: "flex", gap: 2, mb: 2 }}>
          <DatePicker
            label="Start Date"
            value={startDate}
            onChange={(newValue) => setStartDate(newValue)}
            renderInput={(params) => <TextField {...params} />}
          />
          <DatePicker
            label="End Date"
            value={endDate}
            onChange={(newValue) => setEndDate(newValue)}
            renderInput={(params) => <TextField {...params} />}
          />
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
          <Button variant="outlined" onClick={setLast2Months} sx={{ mr: 1 }}>
            Last 2 Months
          </Button>
          <Button variant="outlined" onClick={setThisYear} sx={{ mr: 1 }}>
            This Year
          </Button>
          <Button variant="outlined" onClick={setLastYear} sx={{ mr: 1 }}>
            Last Year
          </Button>
          <Button
            variant="outlined"
            onClick={() => setQuarter("Q1")}
            sx={{ mr: 1 }}
          >
            Q1
          </Button>
          <Button
            variant="outlined"
            onClick={() => setQuarter("Q2")}
            sx={{ mr: 1 }}
          >
            Q2
          </Button>
          <Button
            variant="outlined"
            onClick={() => setQuarter("Q3")}
            sx={{ mr: 1 }}
          >
            Q3
          </Button>
          <Button variant="outlined" onClick={() => setQuarter("Q4")}>
            Q4
          </Button>
        </Box>

        <Box sx={{ display: "flex", gap: 2, mb: 2 }}>
          <FormControl sx={{ minWidth: 200 }}>
            <InputLabel>Division</InputLabel>
            <Select
              multiple
              value={selectedDivisions}
              onChange={(e) => setSelectedDivisions(e.target.value)}
              renderValue={(selected) => selected.join(", ")}
            >
              {divisions.map((division) => (
                <MenuItem key={division} value={division}>
                  {division}
                </MenuItem>
              ))}
            </Select>
          </FormControl>

          <FormControl
            sx={{ minWidth: 200 }}
            disabled={selectedDivisions.length === 0}
          >
            <InputLabel>Labels</InputLabel>
            <Select
              multiple
              value={selectedLabels}
              onChange={(e) => handleLabelChange(e)}
              renderValue={(selected) => selected.join(", ")}
            >
              {filteredLabels.map((label) => (
                <MenuItem key={label} value={label}>
                  {label}
                </MenuItem>
              ))}
            </Select>
          </FormControl>
        </Box>

        <Button
          variant="contained"
          onClick={fetchRetentionMetrics}
          disabled={!isFiltersValid || loading}
        >
          {loading ? <CircularProgress size={24} /> : "Fetch Data"}
        </Button>

        {dataFetched && (
          <>
            <Typography variant="h6" gutterBottom sx={{ mt: 2 }}>
              All Time Client Metrics
            </Typography>
            <Box
              sx={{ display: "flex", gap: 3, mt: 2, mb: 4, flexWrap: "wrap" }}
            >
              <StatisticCard
                title="Total Clients (All Time)"
                subtitle="Total number of clients in the database"
                value={metricsData.totalClientsAllTime}
                hidePercentageChange
              />
              <StatisticCard
                title="Active Clients (All Time)"
                subtitle="Total number of clients in the database who have had a lesson"
                value={metricsData.activeClientsAllTime}
                hidePercentageChange
              />
              <StatisticCard
                title="Inactive Clients (All Time)"
                subtitle="Total number of clients who haven't had a lesson"
                value={metricsData.inactiveClients || 0}
                hidePercentageChange
              />
            </Box>

            <Typography variant="h6" gutterBottom>
              Active Clients and Retention Rate
            </Typography>
            <Box
              sx={{ display: "flex", gap: 3, mt: 2, mb: 4, flexWrap: "wrap" }}
            >
              <Box sx={{ backgroundColor: "#7ed9ed", p: 1, borderRadius: 2 }}>
                <StatisticCard
                  title="Active Clients (Period)"
                  subtitle="Total number of clients active this period"
                  value={metricsData.activeClientsPeriod || 0}
                  hidePercentageChange
                />
              </Box>
              <Box sx={{ backgroundColor: "#6a469d", p: 1, borderRadius: 2 }}>
                <StatisticCard
                  title="Active Clients (Previous Period)"
                  subtitle="Total number of clients active last period"
                  value={metricsData.activeClientsPreviousPeriod}
                  hidePercentageChange
                />
              </Box>
              <StatisticCard
                title={
                  <Tooltip
                    title="Retention Rate is calculated as (Number of Retained Clients in Current Period / Total Clients in Previous Period) * 100. For example, if there were 100 clients in the previous period and 75 of them are still active in the current period, the retention rate is 75%."
                    arrow
                  >
                    <span>
                      Retention Rate (Period){" "}
                      <InformationCircleIcon
                        className="h-4 w-4"
                        style={{
                          marginLeft: 4,
                          verticalAlign: "middle",
                          cursor: "help",
                          display: "inline-block",
                        }}
                      />
                    </span>
                  </Tooltip>
                }
                value={`${metricsData.retentionRate || 0}%`}
                subtitle={`Retained Clients: ${
                  retainedClients.length
                } current vs ${
                  metricsData.retainedClientsPreviousPeriod || 0
                } previous`}
                hidePercentageChange
              />
            </Box>

            <Typography variant="h6" gutterBottom>
              Retention Breakdown
            </Typography>
            <Box
              sx={{ display: "flex", gap: 3, mt: 2, mb: 4, flexWrap: "wrap" }}
            >
              <Box sx={{ backgroundColor: "#7ed9ed", p: 1, borderRadius: 2 }}>
                <StatisticCard
                  title="Retained Clients (Period)"
                  subtitle="Clients retained this period who were active last period"
                  value={
                    retainedClients.length > 0 ? retainedClients.length : "0"
                  }
                  hidePercentageChange
                />
              </Box>

              <Box sx={{ backgroundColor: "#6a469d", p: 1, borderRadius: 2 }}>
                <StatisticCard
                  title="Retained Clients (Previous Period)"
                  subtitle="Clients retained last period who were active the period before"
                  value={
                    retainedClientsPreviousPeriod.length > 0
                      ? retainedClientsPreviousPeriod.length
                      : "0"
                  }
                  hidePercentageChange
                />
              </Box>

              <Box sx={{ backgroundColor: "#7ed9ed", p: 1, borderRadius: 2 }}>
                <StatisticCard
                  title="Newly Active Clients (Period)"
                  subtitle="Clients active this period who were not active last period"
                  value={metricsData.newlyActiveClientsCount}
                  hidePercentageChange
                />
              </Box>

              <Box sx={{ backgroundColor: "#7ed9ed", p: 1, borderRadius: 2 }}>
                <StatisticCard
                  title="Lost Clients (Period)"
                  subtitle="Clients active last period who are not active this period"
                  value={metricsData.lostClientsCount}
                  hidePercentageChange
                />
              </Box>
            </Box>

            <Typography variant="h6" gutterBottom>
              Lessons, Students & Hours
            </Typography>
            <Box
              sx={{ display: "flex", gap: 3, mt: 2, mb: 4, flexWrap: "wrap" }}
            >
              <Box sx={{ backgroundColor: "#7ed9ed", p: 1, borderRadius: 2 }}>
                <StatisticCard
                  title="Total Lessons (Period)"
                  subtitle="Total number of lessons in this period"
                  value={metricsData.totalLessonsPeriod || 0}
                  hidePercentageChange
                />
              </Box>

              <Box sx={{ backgroundColor: "#6a469d", p: 1, borderRadius: 2 }}>
                <StatisticCard
                  title="Total Lessons (Previous Period)"
                  subtitle="Total number of lessons in the previous period"
                  value={metricsData.lessonsPreviousPeriod || 0}
                  hidePercentageChange
                />
              </Box>

              <Box sx={{ backgroundColor: "#7ed9ed", p: 1, borderRadius: 2 }}>
                <StatisticCard
                  title="Total Students (Period)"
                  subtitle="Total number of students reached in this period"
                  value={metricsData.totalStudents || 0}
                  hidePercentageChange
                />
              </Box>

              <Box sx={{ backgroundColor: "#7ed9ed", p: 1, borderRadius: 2 }}>
                <StatisticCard
                  title="Total Hours (Period)"
                  subtitle="Total number of hours of tutoring this period"
                  value={metricsData.totalHours || "0.00"}
                  hidePercentageChange
                />
              </Box>
            </Box>

            <Typography variant="h6" gutterBottom>
              Averages
            </Typography>
            <Box
              sx={{ display: "flex", gap: 3, mt: 2, mb: 4, flexWrap: "wrap" }}
            >
              <StatisticCard
                title="4 Period Avg (Lessons)"
                subtitle="Average number of lessons across the previous 4 periods"
                value={metricsData.avgLessonsFourPeriods || 0}
                hidePercentageChange
              />
              <StatisticCard
                title="Avg. # of Students/Lesson"
                subtitle="Average number of students per lesson"
                value={metricsData.avgStudentsPerLesson || "N/A"}
                hidePercentageChange
              />
              <StatisticCard
                title="Avg. # of Hours per Lesson"
                subtitle="Average number of hours per lesson"
                value={metricsData.avgHoursPerLesson || "N/A"}
                hidePercentageChange
              />
            </Box>
          </>
        )}

        <Accordion sx={{ mt: 4 }}>
          <AccordionSummary expandIcon={<ChevronDownIcon className="h-5 w-5" />}>
            <Typography>
              Total Lessons (Period): {lessonDetailsPeriod.count}
            </Typography>
          </AccordionSummary>
          <AccordionDetails>
            {lessonDetailsPeriod.lessonIds.length > 0 ? (
              <DataGrid
                rows={lessonDetailsPeriod.lessonIds.map((id, index) => ({
                  id,
                  lessonId: id,
                  serviceId: lessonDetailsPeriod.serviceIds[index],
                  startTime: lessonDetailsPeriod.startTimes[index],
                  jobName: lessonDetailsPeriod.jobNames?.[index] || "N/A",
                  studentName:
                    lessonDetailsPeriod.studentNames?.[index] || "N/A",
                  tutorName: lessonDetailsPeriod.tutorNames?.[index] || "N/A",
                  units: lessonDetailsPeriod.units?.[index] || "N/A",
                }))}
                columns={[
                  {
                    field: "lessonId",
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
                    field: "serviceId",
                    headerName: "Service ID",
                    width: 150,
                    renderCell: (params) => (
                      <a
                        href={`https://secure.tutorcruncher.com/cal/service/${params.value}/`}
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
                    field: "startTime",
                    headerName: "Start Time",
                    width: 200,
                    renderCell: (params) => {
                      const formattedTime = params.value
                        ? dayjs(params.value)
                            .tz("America/New_York")
                            .format("MM/DD/YYYY, h:mm:ss A")
                        : "N/A";
                      return <span>{formattedTime}</span>;
                    },
                  },
                  {
                    field: "jobName",
                    headerName: "Job Name",
                    width: 400,
                  },
                  {
                    field: "studentName",
                    headerName: "Students",
                    width: 220,
                  },
                  {
                    field: "tutorName",
                    headerName: "Tutor Name",
                    width: 150,
                  },
                  {
                    field: "units",
                    headerName: "Duration (Hours)",
                    width: 200,
                  },
                ]}
                autoHeight
                disableRowSelectionOnClick
                paginationModel={paginationModel}
                onPaginationModelChange={handlePaginationModelChange}
                pageSizeOptions={[5, 10, 25, 50]}
                slots={{ toolbar: GridToolbar }}
              />
            ) : (
              <Typography>No lessons found for this period.</Typography>
            )}
          </AccordionDetails>
        </Accordion>

        <Accordion>
          <AccordionSummary expandIcon={<ChevronDownIcon className="h-5 w-5" />}>
            <Typography>
              Total Lessons (Previous Period):{" "}
              {lessonDetailsPreviousPeriod.count}
            </Typography>
          </AccordionSummary>
          <AccordionDetails>
            {lessonDetailsPreviousPeriod.lessonIds.length > 0 ? (
              <DataGrid
                rows={lessonDetailsPreviousPeriod.lessonIds.map(
                  (id, index) => ({
                    id,
                    lessonId: id,
                    serviceId:
                      lessonDetailsPreviousPeriod.serviceIds?.[index] || "N/A",
                    startTime:
                      lessonDetailsPreviousPeriod.startTimes?.[index] || "N/A",
                    jobName:
                      lessonDetailsPreviousPeriod.jobNames?.[index] || "N/A",
                    studentName:
                      lessonDetailsPreviousPeriod.studentNames?.[index] ||
                      "N/A",
                    tutorName:
                      lessonDetailsPreviousPeriod.tutorNames?.[index] || "N/A",
                    units: lessonDetailsPreviousPeriod.units?.[index] || "N/A",
                  })
                )}
                columns={[
                  {
                    field: "lessonId",
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
                    field: "serviceId",
                    headerName: "Service ID",
                    width: 150,
                    renderCell: (params) => (
                      <a
                        href={`https://secure.tutorcruncher.com/cal/service/${params.value}/`}
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
                    field: "startTime",
                    headerName: "Start Time",
                    width: 200,
                    renderCell: (params) => {
                      const formattedTime = params.value
                        ? dayjs(params.value)
                            .tz("America/New_York")
                            .format("MM/DD/YYYY, h:mm:ss A")
                        : "N/A";
                      return <span>{formattedTime}</span>;
                    },
                  },
                  {
                    field: "jobName",
                    headerName: "Job Name",
                    width: 400,
                  },
                  {
                    field: "studentName",
                    headerName: "Students",
                    width: 220,
                  },
                  {
                    field: "tutorName",
                    headerName: "Tutor Name",
                    width: 150,
                  },
                  {
                    field: "units",
                    headerName: "Duration (Hours)",
                    width: 200,
                  },
                ]}
                autoHeight
                disableRowSelectionOnClick
                paginationModel={paginationModel}
                onPaginationModelChange={handlePaginationModelChange}
                pageSizeOptions={[5, 10, 25, 50]}
                slots={{ toolbar: GridToolbar }}
              />
            ) : (
              <Typography>No lessons found for the previous period.</Typography>
            )}
          </AccordionDetails>
        </Accordion>

        <Accordion>
          <AccordionSummary expandIcon={<ChevronDownIcon className="h-5 w-5" />}>
            <Typography>Retained Clients ({retainedClients.length})</Typography>
          </AccordionSummary>
          <AccordionDetails>
            {retainedClients.length > 0 ? (
              <DataGrid
                rows={retainedClients.map((client, index) => ({
                  id: client.client_id,
                  clientId: client.client_id,
                  clientName: client.client_name,
                }))}
                columns={[
                  {
                    field: "clientId",
                    headerName: "Client ID",
                    width: 150,
                    renderCell: (params) => (
                      <a
                        href={`https://secure.tutorcruncher.com/clients/${params.value}/`}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="text-blue-600 no-underline"
                      >
                        {params.value}
                      </a>
                    ),
                  },
                  {
                    field: "clientName",
                    headerName: "Client Name",
                    width: 200,
                  },
                ]}
                autoHeight
                disableRowSelectionOnClick
                paginationModel={paginationModel}
                onPaginationModelChange={handlePaginationModelChange}
                pageSizeOptions={[5, 10, 25, 50]}
                slots={{
                  toolbar: GridToolbar,
                }}
              />
            ) : (
              <Typography>No retained clients found.</Typography>
            )}
          </AccordionDetails>
        </Accordion>

        <Accordion>
          <AccordionSummary expandIcon={<ChevronDownIcon className="h-5 w-5" />}>
            <Typography>
              Newly Active Clients ({newlyActiveClients.length})
            </Typography>
          </AccordionSummary>
          <AccordionDetails>
            {newlyActiveClients.length > 0 ? (
              <DataGrid
                rows={newlyActiveClients.map((client, index) => ({
                  id: client.client_id,
                  clientId: client.client_id,
                  clientName: client.client_name,
                }))}
                columns={[
                  {
                    field: "clientId",
                    headerName: "Client ID",
                    width: 150,
                    renderCell: (params) => (
                      <a
                        href={`https://secure.tutorcruncher.com/clients/${params.value}/`}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="text-blue-600 no-underline"
                      >
                        {params.value}
                      </a>
                    ),
                  },
                  {
                    field: "clientName",
                    headerName: "Client Name",
                    width: 200,
                  },
                ]}
                autoHeight
                disableRowSelectionOnClick
                paginationModel={paginationModel}
                onPaginationModelChange={handlePaginationModelChange}
                pageSizeOptions={[5, 10, 25, 50]}
                slots={{
                  toolbar: GridToolbar,
                }}
              />
            ) : (
              <Typography>No newly active clients found.</Typography>
            )}
          </AccordionDetails>
        </Accordion>

        <Accordion>
          <AccordionSummary expandIcon={<ChevronDownIcon className="h-5 w-5" />}>
            <Typography>Lost Clients ({lostClients.length})</Typography>
          </AccordionSummary>
          <AccordionDetails>
            {lostClients.length > 0 ? (
              <DataGrid
                rows={lostClients.map((client, index) => ({
                  id: client.client_id,
                  clientId: client.client_id,
                  clientName: client.client_name,
                }))}
                columns={[
                  {
                    field: "clientId",
                    headerName: "Client ID",
                    width: 150,
                    renderCell: (params) => (
                      <a
                        href={`https://secure.tutorcruncher.com/clients/${params.value}/`}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="text-blue-600 no-underline"
                      >
                        {params.value}
                      </a>
                    ),
                  },
                  {
                    field: "clientName",
                    headerName: "Client Name",
                    width: 200,
                  },
                ]}
                autoHeight
                disableRowSelectionOnClick
                paginationModel={paginationModel}
                onPaginationModelChange={handlePaginationModelChange}
                pageSizeOptions={[5, 10, 25, 50]}
                slots={{
                  toolbar: GridToolbar,
                }}
              />
            ) : (
              <Typography>No lost clients found.</Typography>
            )}
          </AccordionDetails>
        </Accordion>
      </Box>
    </LocalizationProvider>
  );
};

export default RetentionMetrics;
