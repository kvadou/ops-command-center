import React, { useState } from "react";
import { formatDate } from "@fullcalendar/core";
import {
  TextField,
  Select,
  MenuItem,
  InputLabel,
  FormControl,
} from "@mui/material";
import { DatePicker, LocalizationProvider } from "@mui/lab";
import AdapterDateFns from "@mui/lab/AdapterDateFns";
import { styled } from "@mui/material/styles";

const CustomFormControl = styled(FormControl)(({ theme }) => ({
  "& .MuiInputLabel-root": {
    color: "#FFFFFF",
  },
  "& .MuiOutlinedInput-root": {
    "& fieldset": {
      borderColor: "#FFFFFF",
    },
    "&:hover fieldset": {
      borderColor: "#FFFFFF",
    },
    "&.Mui-focused fieldset": {
      borderColor: "#FFFFFF",
    },
    "& .MuiSelect-select": {
      color: "#FFFFFF",
    },
  },
  "& .MuiMenuItem-root": {
    color: "#000000",
  },
}));

export default function Sidebar({
  weekendsVisible,
  handleWeekendsToggle,
  currentEvents,
  onFilterChange,
}) {
  const [fromDate, setFromDate] = useState(null);
  const [toDate, setToDate] = useState(null);
  const [location, setLocation] = useState("");

  const handleFromDateChange = (date) => {
    setFromDate(date);
    onFilterChange({ fromDate: date, toDate, location });
  };

  const handleToDateChange = (date) => {
    setToDate(date);
    onFilterChange({ fromDate, toDate: date, location });
  };

  const handleLocationChange = (event) => {
    const newLocation = event.target.value;
    setLocation(newLocation);
    onFilterChange({ fromDate, toDate, location: newLocation });
  };

  return (
    <div className="demo-app-sidebar">
      <div className="demo-app-sidebar-section">
        <svg width="48" height="48" viewBox="0 0 80 80" fill="none" xmlns="http://www.w3.org/2000/svg">
          <rect width="80" height="80" rx="20" fill="#6366f1" />
          <text x="40" y="34" textAnchor="middle" fill="white" fontSize="28" fontWeight="700" fontFamily="Poppins, sans-serif">A</text>
          <text x="40" y="56" textAnchor="middle" fill="white" fontSize="14" fontWeight="500" fontFamily="Poppins, sans-serif" opacity="0.85">OPS</text>
        </svg>
        <CustomFormControl fullWidth margin="dense">
          <InputLabel>Location</InputLabel>
          <Select
            value={location}
            onChange={handleLocationChange}
            sx={{
              "& .MuiSelect-icon": {
                color: "#FFFFFF",
              },
            }}
          >
            <MenuItem value="">All Locations</MenuItem>
            <MenuItem value="Park Slope">Park Slope</MenuItem>
            <MenuItem value="Upper East Side">Upper East Side</MenuItem>
          </Select>
        </CustomFormControl>
      </div>
      {}
      <div className="demo-app-sidebar-section">
        <h2>All Events ({currentEvents.length})</h2>
        <ul>
          {currentEvents.map((event) => (
            <SidebarEvent key={event.id} event={event} />
          ))}
        </ul>
      </div>
    </div>
  );
}

function SidebarEvent({ event }) {
  return (
    <li key={event.id}>
      <b>
        {formatDate(event.start, {
          year: "numeric",
          month: "short",
          day: "numeric",
        })}
      </b>
      <i>{event.title}</i>
    </li>
  );
}
