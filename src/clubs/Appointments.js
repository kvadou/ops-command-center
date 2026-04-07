import React, { useState, useEffect } from "react";
import axios from "axios";
import {
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TableRow,
  Paper,
  IconButton,
  TextField,
  Button,
} from "@mui/material";
import { TrashIcon } from '@heroicons/react/24/outline';
import ConfirmationModal from "../components/ConfirmationModal";

export default function AppointmentsPage() {
  const [appointments, setAppointments] = useState([]);
  const [services, setServices] = useState([]);
  const [searchQuery, setSearchQuery] = useState("");
  const [confirmState, setConfirmState] = useState({ isOpen: false, action: null, title: '', message: '' });

  useEffect(() => {
    fetchAppointments();
    fetchServices();
  }, []);

  const fetchAppointments = async () => {
    try {
      const response = await axios.get("/api/local-appointments");
      setAppointments(response.data);
    } catch (error) {
      console.error("Error fetching appointments:", error);
    }
  };

  const fetchServices = async () => {
    try {
      const response = await axios.get("/api/services");
      const body = response.data;
      setServices(Array.isArray(body) ? body : body.data || []);
    } catch (error) {
      console.error("Error fetching services:", error);
    }
  };

  const delay = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

  const handleUpdateAllAppointments = async () => {
    try {
      for (const appointment of appointments) {
        try {
          const response = await axios.get(
            `/api/sync-appointments/${appointment.serviceId}`
          );
          const { status } = response.data;

          if (
            status === "cancelled" ||
            status === "deleted" ||
            status === "complete"
          ) {
            await axios.delete(`/api/appointments/${appointment.id}`);
          }
        } catch (error) {
          if (error.response && error.response.status === 404) {
            await axios.delete(`/api/appointments/${appointment.id}`);
          } else {
            console.error(
              `Error updating appointment ${appointment.id}:`,
              error
            );
          }
        }

        await delay(1000);
      }

      fetchAppointments();
    } catch (error) {
      console.error("Error updating appointments:", error);
    }
  };

  const handleUpdateAllWithoutStatus = async () => {
    try {
      for (const appointment of appointments) {
        try {
          await axios.get(`/api/sync-appointments/${appointment.serviceId}`);
        } catch (error) {
          console.error(`Error updating appointment ${appointment.id}:`, error);
        }

        await delay(1000);
      }

      fetchAppointments();
    } catch (error) {
      console.error("Error updating appointments:", error);
    }
  };

  const handleDeleteNonPlanned = async () => {
    try {
      const nonPlannedAppointments = appointments.filter(
        (appointment) => appointment.status !== "planned"
      );

      for (const appointment of nonPlannedAppointments) {
        await axios.delete(`/api/appointments/${appointment.id}`);
      }

      fetchAppointments();
    } catch (error) {
      console.error("Error deleting non-planned appointments:", error);
    }
  };

  const handleDelete = async (id) => {
    setConfirmState({
      isOpen: true,
      action: async () => {
        try {
          await axios.delete(`/api/appointments/${id}`);
          setAppointments(
            appointments.filter((appointment) => appointment.id !== id)
          );
        } catch (error) {
          console.error("Error deleting appointment:", error);
        }
      },
      title: 'Delete Appointment',
      message: 'Are you sure you want to delete this appointment?',
    });
  };

  const handleSearchChange = (event) => {
    setSearchQuery(event.target.value);
  };

  const filteredAppointments = appointments.filter((appointment) => {
    const id = appointment.id ? appointment.id.toString() : "";
    return id.includes(searchQuery);
  });

  const isServiceIdInDatabase = (serviceId) => {
    return services.some((service) => service.serviceId === serviceId);
  };

  return (
    <div>
      <TextField
        label="Search"
        variant="outlined"
        fullWidth
        margin="normal"
        value={searchQuery}
        onChange={handleSearchChange}
      />

      <Button
        variant="contained"
        color="primary"
        onClick={handleUpdateAllAppointments}
        style={{ marginBottom: "20px" }}
      >
        Update All Appointments
      </Button>
      {}
      <Button
        variant="contained"
        color="primary"
        onClick={handleUpdateAllWithoutStatus}
        style={{ marginLeft: "10px", marginBottom: "20px" }}
      >
        Update All Without Status
      </Button>

      <TableContainer component={Paper}>
        <Table>
          <TableHead>
            <TableRow>
              <TableCell>ID</TableCell>
              <TableCell>Service ID</TableCell>
              <TableCell>Start Time</TableCell>
              <TableCell>End Time</TableCell>
              <TableCell>Status</TableCell>
              <TableCell>Service Exists</TableCell> {}
              <TableCell align="right">Actions</TableCell>
            </TableRow>
          </TableHead>
          <TableBody>
            {filteredAppointments.map((appointment) => (
              <TableRow key={appointment.id}>
                <TableCell>{appointment.id}</TableCell>
                <TableCell>{appointment.serviceId}</TableCell>
                <TableCell>
                  {new Date(appointment.start).toLocaleString()}
                </TableCell>
                <TableCell>
                  {new Date(appointment.end).toLocaleString()}
                </TableCell>
                <TableCell>{appointment.status || "N/A"}</TableCell>
                <TableCell>
                  {isServiceIdInDatabase(appointment.serviceId) ? "Yes" : "No"}{" "}
                  {}
                </TableCell>
                <TableCell align="right">
                  <IconButton
                    onClick={() => handleDelete(appointment.id)}
                    color="secondary"
                  >
                    <TrashIcon className="h-5 w-5" />
                  </IconButton>
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </TableContainer>
      <ConfirmationModal
        isOpen={confirmState.isOpen}
        onClose={() => setConfirmState(s => ({ ...s, isOpen: false }))}
        onConfirm={() => { confirmState.action?.(); setConfirmState(s => ({ ...s, isOpen: false })); }}
        title={confirmState.title}
        message={confirmState.message}
        isDestructive
      />
    </div>
  );
}
