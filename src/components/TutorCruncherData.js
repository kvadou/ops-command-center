import { useEffect, useState } from "react";
import {
  Tabs,
  Tab,
  Button,
  Box,
  CircularProgress,
  Paper,
  Stack,
  Typography,
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions,
} from "@mui/material";
import { useToast } from '../hooks/useToast';

import { DataGrid } from "@mui/x-data-grid";
import axios from "axios";

const fetchData = async (endpoint) => {
  try {
    const response = await axios.get(`/${endpoint}`);
    console.log("API Response for", endpoint, response.data);
    return response.data;
  } catch (error) {
    console.error("Error fetching data:", error);
    return [];
  }
};

const ServiceDetailsModal = ({ open, onClose, recipients, contractors }) => (
  <Dialog open={open} onClose={onClose} fullWidth maxWidth="md">
    <DialogTitle>Service Details</DialogTitle>
    <DialogContent>
      <Typography variant="h6">Recipients</Typography>
      <DataGrid
        density="compact"
        columns={[{ field: "name", headerName: "Recipient Name", flex: 1 }]}
        rows={
          recipients.length > 0
            ? recipients.map((recipient, index) => ({
                id: `recipient-${index}`,
                name: recipient.recipient_name,
              }))
            : []
        }
        autoHeight
        hideFooter
      />

      <Typography variant="h6" sx={{ mt: 3 }}>
        Contractors
      </Typography>
      <DataGrid
        density="compact"
        columns={[{ field: "name", headerName: "Contractor Name", flex: 1 }]}
        rows={
          contractors.length > 0
            ? contractors.map((contractor, index) => ({
                id: `contractor-${index}`,
                name: contractor.contractor_name,
              }))
            : []
        }
        autoHeight
        hideFooter
      />
    </DialogContent>
    <DialogActions>
      <Button onClick={onClose} color="primary">
        Close
      </Button>
    </DialogActions>
  </Dialog>
);

const AppointmentDetailsModal = ({
  open,
  onClose,
  recipients,
  contractors,
}) => (
  <Dialog open={open} onClose={onClose} fullWidth maxWidth="md">
    <DialogTitle>Appointment Details</DialogTitle>
    <DialogContent>
      <Typography variant="h6">Recipients</Typography>
      <DataGrid
        density="compact"
        columns={[
          { field: "name", headerName: "Recipient Name", flex: 1 },
          { field: "status", headerName: "Status", flex: 1 },
          {
            field: "charge_rate",
            headerName: "Charge Rate",
            type: "number",
            width: 150,
          },
        ]}
        rows={
          recipients.length > 0
            ? recipients.map((recipient, index) => ({
                id: `recipient-${index}`,
                name: recipient.recipient_name,
                status: recipient.recipient_status,
                charge_rate: recipient.recipient_charge_rate,
              }))
            : []
        }
        autoHeight
        hideFooter
      />

      <Typography variant="h6" sx={{ mt: 3 }}>
        Contractors
      </Typography>
      <DataGrid
        density="compact"
        columns={[
          { field: "name", headerName: "Contractor Name", flex: 1 },
          {
            field: "pay_rate",
            headerName: "Pay Rate",
            type: "number",
            width: 150,
          },
        ]}
        rows={
          contractors.length > 0
            ? contractors.map((contractor, index) => ({
                id: `contractor-${index}`,
                name: contractor.contractor_name,
                pay_rate: contractor.contractor_pay_rate,
              }))
            : []
        }
        autoHeight
        hideFooter
      />
    </DialogContent>
    <DialogActions>
      <Button onClick={onClose} color="primary">
        Close
      </Button>
    </DialogActions>
  </Dialog>
);

const TutorCruncherData = () => {
  const toast = useToast();
  const [loading, setLoading] = useState(false);
  const [tabIndex, setTabIndex] = useState(0);
  const [data, setData] = useState({
    clients: [],
    services: [],
    recipients: [],
    appointments: [],
  });
  const [selectedAppointment, setSelectedAppointment] = useState(null);
  const [selectedService, setSelectedService] = useState(null);
  const [isServiceModalOpen, setIsServiceModalOpen] = useState(false);
  const [isAppointmentModalOpen, setIsAppointmentModalOpen] = useState(false);
  const [paginationModel, setPaginationModel] = useState({
    pageSize: 10,
    page: 0,
  });

  const handleFixDates = async () => {
    setLoading(true);
    try {
      const response = await axios.post("/fix-dates");
      toast.success(response.data);
    } catch (error) {
      console.error("Error fixing dates:", error);
      toast.error("Failed to fix dates");
    } finally {
      setLoading(false);
    }
  };

  const handlePaginationModelChange = (model) => {
    setPaginationModel(model);
  };

  const handleInitialDataFetch = async () => {
    setLoading(true);
    try {
      await axios.get("/update-data");

      toast.success("Data updated successfully!");
      loadData(tabIndex);
    } catch (error) {
      console.error("Error updating data:", error);
      toast.error("Failed to update data");
    } finally {
      setLoading(false);
    }
  };

  const loadData = async (tab) => {
    setLoading(true);
    const endpoints = ["clients", "recipients", "services", "appointments"];
    const result = await fetchData(endpoints[tab]);
    if (result && result.length > 0) {
      if (tab === 3) {
        const services = data.services;
        const enrichedAppointments = result.map((appointment) => {
          const service = services.find(
            (s) => s.service_id === appointment.service_id
          );
          return {
            ...appointment,
            labels: service ? service.labels : [],
          };
        });
        setData((prev) => ({
          ...prev,
          [endpoints[tab]]: enrichedAppointments,
        }));
      } else {
        setData((prev) => ({ ...prev, [endpoints[tab]]: result }));
      }
    } else {
      console.warn(`No data found for ${endpoints[tab]}`);
    }
    setLoading(false);
  };

  const handleViewServiceDetailsClick = (row) => {
    console.log("Selected Service:", row);
    setSelectedService(row);
    setIsServiceModalOpen(true);
  };

  const handleViewAppointmentDetailsClick = (row) => {
    setSelectedAppointment(row);
    setIsAppointmentModalOpen(true);
  };

  const handleCloseServiceModal = () => {
    setIsServiceModalOpen(false);
    setSelectedService(null);
  };

  const handleCloseAppointmentModal = () => {
    setIsAppointmentModalOpen(false);
    setSelectedAppointment(null);
  };

  const handleTabChange = (event, newValue) => {
    setTabIndex(newValue);
    loadData(newValue);
  };

  useEffect(() => {
    const loadAllData = async () => {
      setLoading(true);
      const services = await fetchData("services");
      const appointments = await fetchData("appointments");

      if (services.length > 0 && appointments.length > 0) {
        const enrichedAppointments = appointments.map((appointment) => {
          const service = services.find(
            (s) => s.service_id === appointment.service_id
          );
          return {
            ...appointment,
            labels: service ? service.labels : [],
          };
        });
        setData({
          clients: data.clients,
          services: services,
          recipients: data.recipients,
          appointments: enrichedAppointments,
        });
      } else {
        console.warn("No data found for services or appointments");
      }
      setLoading(false);
    };

    loadAllData();
  }, []);

  const columns = {
    clients: [
      { field: "client_id", headerName: "Client ID", width: 150 },
      { field: "first_name", headerName: "First Name", width: 200 },
      { field: "last_name", headerName: "Last Name", width: 200 },
      { field: "email", headerName: "Email", width: 250 },

      { field: "status", headerName: "Status", width: 150 },
    ],

    services: [
      { field: "service_id", headerName: "Job ID", width: 150 },
      { field: "name", headerName: "Job Name", width: 200 },

      { field: "dft_charge_type", headerName: "Charge Type", width: 150 },
      { field: "dft_charge_rate", headerName: "Charge Rate", width: 150 },
      { field: "dft_contractor_rate", headerName: "Tutor Rate", width: 150 },
      { field: "status", headerName: "Status", width: 150 },
      {
        field: "labels",
        headerName: "Labels",
        width: 250,
        renderCell: (params) => {
          const labelsArray = params.value;

          return Array.isArray(labelsArray)
            ? labelsArray.join(", ")
            : "No labels";
        },
      },
    ],

    recipients: [
      { field: "recipient_id", headerName: "Student ID", width: 150 },
      { field: "first_name", headerName: "First Name", width: 200 },
      { field: "last_name", headerName: "Last Name", width: 200 },
    ],

    appointments: [
      { field: "appointment_id", headerName: "Lesson ID", width: 150 },
      { field: "service_id", headerName: "Job ID", width: 150 },
      { field: "start", headerName: "Start", width: 200 },
      { field: "finish", headerName: "Finish", width: 200 },
      { field: "units", headerName: "Units", width: 150 },
      { field: "status", headerName: "Status", width: 150 },
      {
        field: "labels",
        headerName: "Labels",
        width: 250,
        renderCell: (params) => {
          const labelsArray = params.value;

          return Array.isArray(labelsArray)
            ? labelsArray.join(", ")
            : "No labels";
        },
      },
      {
        field: "details",
        headerName: "Details",
        renderCell: (params) => (
          <Button
            variant="outlined"
            onClick={() => handleViewAppointmentDetailsClick(params.row)}
          >
            View Details
          </Button>
        ),
        width: 150,
      },
    ],
  };

  return (
    <Box sx={{ width: "100%" }}>
      <Tabs value={tabIndex} onChange={handleTabChange}>
        <Tab label="Clients" />
        <Tab label="Students" />
        <Tab label="Jobs" />
        <Tab label="Lessons" />
      </Tabs>

      <TabPanel value={tabIndex} index={0}>
        <DataGrid
          rows={data.clients}
          columns={columns.clients}
          getRowId={(row) => row.id}
          paginationModel={paginationModel}
          onPaginationModelChange={handlePaginationModelChange}
          pageSizeOptions={[5, 10, 25, 50]}
          pagination
          autoHeight
        />
      </TabPanel>

      <TabPanel value={tabIndex} index={1}>
        <DataGrid
          rows={data.recipients}
          columns={columns.recipients}
          getRowId={(row) => row.id}
          paginationModel={paginationModel}
          onPaginationModelChange={handlePaginationModelChange}
          pageSizeOptions={[5, 10, 25, 50]}
          pagination
          autoHeight
        />
      </TabPanel>

      <TabPanel value={tabIndex} index={2}>
        <DataGrid
          rows={data.services}
          columns={columns.services}
          getRowId={(row) => row.service_id}
          paginationModel={paginationModel}
          onPaginationModelChange={handlePaginationModelChange}
          pageSizeOptions={[5, 10, 25, 50]}
          pagination
          autoHeight
        />
      </TabPanel>

      <TabPanel value={tabIndex} index={3}>
        <DataGrid
          rows={data.appointments}
          columns={columns.appointments}
          getRowId={(row) => row.appointment_id}
          paginationModel={paginationModel}
          onPaginationModelChange={handlePaginationModelChange}
          pageSizeOptions={[5, 10, 25, 50]}
          pagination
          autoHeight
        />
      </TabPanel>

      {selectedService && (
        <ServiceDetailsModal
          open={isServiceModalOpen}
          onClose={handleCloseServiceModal}
          recipients={selectedService.recipients || []}
          contractors={selectedService.contractors || []}
        />
      )}

      {selectedAppointment && (
        <AppointmentDetailsModal
          open={isAppointmentModalOpen}
          onClose={handleCloseAppointmentModal}
          recipients={selectedAppointment.recipients || []}
          contractors={selectedAppointment.contractors || []}
        />
      )}
    </Box>
  );
};

const TabPanel = (props) => {
  const { children, value, index, ...other } = props;
  return (
    <div
      role="tabpanel"
      hidden={value !== index}
      id={`tabpanel-${index}`}
      aria-labelledby={`tab-${index}`}
      {...other}
    >
      {value === index && <Box sx={{ p: 3 }}>{children}</Box>}
    </div>
  );
};

export default TutorCruncherData;
