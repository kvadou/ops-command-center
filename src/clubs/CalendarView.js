import React, { useState, useEffect } from "react";
import {
  BrowserRouter as Router,
  Routes,
  Route,
  useSearchParams,
} from "react-router-dom";
import FullCalendar from "@fullcalendar/react";
import dayGridPlugin from "@fullcalendar/daygrid";
import timeGridPlugin from "@fullcalendar/timegrid";
import interactionPlugin from "@fullcalendar/interaction";
import { fetchEvents } from "./event-utils";

import listPlugin from "@fullcalendar/list";
import axios from "axios";
import tippy from "tippy.js";
import "tippy.js/dist/tippy.css";
import moment from "moment-timezone";
import { Select, MenuItem, InputLabel, FormControl } from "@mui/material";
import { styled } from "@mui/material/styles";
import ServiceManagementPage from "./ServiceManagementPage";
import AppointmentsPage from "./Appointments";

const CustomFormControl = styled(FormControl)(({ theme }) => ({
  "& .MuiInputLabel-root": {
    color: "#000",
  },
  "& .MuiOutlinedInput-root": {
    "& fieldset": {
      borderColor: "#000",
    },
    "&:hover fieldset": {
      borderColor: "#000",
    },
    "&.Mui-focused fieldset": {
      borderColor: "#000",
    },
    "& .MuiSelect-select": {
      color: "#000",
    },
  },
  "& .MuiMenuItem-root": {
    color: "#000",
  },
}));

function CalendarView() {
  const [weekendsVisible, setWeekendsVisible] = useState(true);
  const [events, setEvents] = useState([]);
  const [filteredEvents, setFilteredEvents] = useState([]);
  const [filters, setFilters] = useState({ location: "", serviceId: "" });
  const [locations, setLocations] = useState([]);
  const [searchParams, setSearchParams] = useSearchParams();
  const [loading, setLoading] = useState(false);
  const [colourGroups, setColourGroups] = useState([]);

  useEffect(() => {
    if (colourGroups.length && events.length) {
      setFilteredEvents([...events]);
    }
  }, [colourGroups]);

  const getCurrentMonthRange = () => {
    const start = moment().startOf("month").toISOString();
    const end = moment().endOf("month").toISOString();
    return { start, end };
  };

  const darkenColor = (color, percent) => {
    let colorStr = color.replace(/^#/, "");
    let r = parseInt(colorStr.substring(0, 2), 16);
    let g = parseInt(colorStr.substring(2, 4), 16);
    let b = parseInt(colorStr.substring(4, 6), 16);

    r = Math.max(0, r - (r * percent) / 100);
    g = Math.max(0, g - (g * percent) / 100);
    b = Math.max(0, b - (b * percent) / 100);

    return `#${((1 << 24) | (r << 16) | (g << 8) | b).toString(16).slice(1)}`;
  };

  const getContrastTextColor = (bgColor) => {
    const r = parseInt(bgColor.substr(1, 2), 16);
    const g = parseInt(bgColor.substr(3, 2), 16);
    const b = parseInt(bgColor.substr(5, 2), 16);

    const luminance = (0.299 * r + 0.587 * g + 0.114 * b) / 255;

    return luminance > 0.5 ? "#000" : "#fff";
  };

  const getDateRange = () => {
    const start = moment().startOf("month").toISOString();
    const end = moment().add(12, "months").endOf("month").toISOString();
    return { start, end };
  };

  const fetchAllEvents = async () => {
    setLoading(true);
    const { start, end } = getDateRange();

    const allEvents = await fetchEvents(
      start,
      end,
      filters.location,
      filters.serviceId
    );

    setEvents(allEvents);
    setLoading(false);
  };

  useEffect(() => {
    fetchAllEvents();
  }, [filters.location, filters.serviceId]);

 const extractLocation = (title) => {
  const parts = title.split(' // ');
  if (parts.length > 1) {
    return parts[parts.length - 1].trim();
  }
  
  return '';};



const locationMapping = {
  'ues': 'upper east side',  'park slope': 'park slope',
};


const normalizeLocation = (str) => {
  const normalizedStr = str.trim().toLowerCase();
  return locationMapping[normalizedStr] || normalizedStr;
};


useEffect(() => {
  const filterEvents = () => {
    let filtered = events;

    if (filters.location) {
      filtered = filtered.filter((event) => {
        const extractedLocation = extractLocation(event.title);
        const normalizedEventLocation = normalizeLocation(extractedLocation);
        const normalizedFilterLocation = normalizeLocation(filters.location);

        return normalizedEventLocation === normalizedFilterLocation;
      });
    }

    setFilteredEvents(filtered);
  };

  filterEvents();
}, [events, filters.location, filters.serviceId]);



  useEffect(() => {
    const fetchLocations = async () => {
      try {
        const response = await axios.get("/api/locations");
        setLocations(response.data);
      } catch (error) {
        console.error("Error fetching locations:", error);
      }
    };
    fetchLocations();
  }, []);

  useEffect(() => {
    const fetchColourGroups = async () => {
      try {
        const response = await axios.get("/api/colour-groups");
        setColourGroups(response.data);
      } catch (error) {
        console.error("Error fetching colour groups:", error);
      }
    };
    fetchColourGroups();
  }, []);

useEffect(() => {
  const locationParam = searchParams.get("location");
  const serviceIdParam = searchParams.get("serviceId");

  setFilters((prevFilters) => ({
    ...prevFilters,
    location: locationParam || prevFilters.location,
    serviceId: serviceIdParam || prevFilters.serviceId,
  }));
}, [searchParams]);

useEffect(() => {
  fetchAllEvents();
}, [filters.location, filters.serviceId]);


  const handleLocationChange = (event) => {
  const newLocation = event.target.value;
  setFilters((prevFilters) => ({
    ...prevFilters,
    location: newLocation,
  }));
  setSearchParams({ location: newLocation, serviceId: filters.serviceId });
};


  const handleServiceIdChange = (event) => {
    const newServiceId = event.target.value;
    setFilters((prevFilters) => ({ ...prevFilters, serviceId: newServiceId }));
    setSearchParams({ location: filters.location, serviceId: newServiceId });
  };

  const stringToColor = (str) => {
    let hash = 0;
    for (let i = 0; i < str.length; i++) {
      hash = str.charCodeAt(i) + ((hash << 5) - hash);
    }
    let color = "#";
    for (let i = 0; i < 3; i++) {
      const value = (hash >> (i * 8)) & 0xff;
      color += ("00" + value.toString(16)).substr(-2);
    }
    return color;
  };

  const renderEventContent = (eventInfo) => {
    return (
      <div className="fc-event-main">
        <div className="fc-event-title uniform-event-title">
          {eventInfo.event.title}
        </div>
      </div>
    );
  };

  const handleEventDidMount = (info) => {
    const { title, start, end, extendedProps } = info.event;
    const {
      serviceId,
      location,
      price,
      selectedImage,
      type,
      color,
      colourGroup,
      dft_max_srs,
      rcrs,
      serviceDescription,
      labelId,
    } = extendedProps;

    const startDate = moment(start);
    const endDate = moment(end);

    if (!startDate.isValid()) {
      console.error(`Invalid start date for event: ${title}`, start);
    }

    if (!endDate.isValid()) {
      console.error(`Invalid end date for event: ${title}`, end);
    }

  const backgroundColor = color || (colourGroup ? getEventBackgroundColor(colourGroup) : "#ffffff");

    const textColor = getContrastTextColor(backgroundColor);

    info.el.style.backgroundColor = backgroundColor;
    info.el.style.borderColor = backgroundColor;
    info.el.style.color = textColor;

    info.el.style.setProperty("color", textColor, "important");
    info.el.style.setProperty("background-color", backgroundColor, "important");
    info.el.style.setProperty("border-color", backgroundColor, "important");

    const inner = info.el.querySelector(".fc-event-main");
    if (inner) {
      inner.style.setProperty("background-color", backgroundColor, "important");
      inner.style.setProperty("border-color", backgroundColor, "important");
      inner.style.setProperty("color", textColor, "important");
    }

    info.el.style.boxShadow = "0 4px 6px rgba(0, 0, 0, 0.1)";

    info.el.style.borderRadius = "8px";

    info.el.onmouseover = () => {
      info.el.style.backgroundColor = darkenColor(backgroundColor, 10);
      info.el.style.color = textColor;
    };
    info.el.onmouseout = () => {
      info.el.style.backgroundColor = backgroundColor;
    };

    const buttonPrice = price;

    const displayPrice = type === "one-off" ? price * 10 : price;
    const additionalText =
      type === "one-off"
        ? `<p style="font-size: 12px; color: white;">*10 Class Pack</p>`
        : "";
    const clubSelection = `${title}`;

    const bookingUrl = `/booking-forms/frontend?serviceId=${encodeURIComponent(
      serviceId
    )}`;

    const availabilityStatus =
      rcrs >= dft_max_srs ? "Class Full" : "Class Open";

    const formattedDate = `${startDate.format("h:mma")} - ${endDate.format(
      "h:mma"
    )} ${startDate.format("Do MMM YYYY")}`;

    let bookNowButton = "";
    if (rcrs < dft_max_srs) {
      bookNowButton = `
        <a href="${bookingUrl}" target="_blank" style="
          display: inline-block;
          background-color: #FFFFFF;
          color: #000;
          border: none;
          border-radius: 5px;
          padding: 8px 16px;
          font-size: 14px;
          text-decoration: none;
          margin-top:5px;
          text-align: center;
          transition: background-color 0.3s, transform 0.2s;
          cursor: pointer;
        ">Book Now $${buttonPrice} Per Class</a>
      `;
    }

    const tooltipContent = `
      <div style="white-space: normal;">
        <img src="${selectedImage}" alt="${title}" width="100" style="border-radius: 10px;" /><br/>
        <p style="font-size: 15px;">${title}</p><br/>
        <p><strong>Time:</strong> ${formattedDate}</p>
        <p><strong>Availability:</strong> ${availabilityStatus}</p>
        ${additionalText}
        ${bookNowButton} <!-- Conditionally include the button -->
      </div>
    `;

    tippy(info.el, {
      content: tooltipContent,
      allowHTML: true,
      placement: "top",
      arrow: false,
      trigger: "click",
      maxWidth: "none",
      interactive: true,
      animation: "perspective",
      theme: "custom",
    });
  };

  const getEventBackgroundColor = (colourGroup) => {
    const match = colourGroups.find((group) => group.name === colourGroup);
    if (!match) {
      console.warn(`No colourGroup match for "${colourGroup}"`);
    }
    return match?.color || stringToColor(colourGroup);
  };

  const calendarView = window.matchMedia("(max-width: 768px)").matches
    ? "listMonth"
    : "dayGridMonth";

  const headerToolbar = window.matchMedia("(max-width: 768px)").matches
    ? {
        left: "prev,next today",
        center: "title",
        right: "listMonth",
      }
    : {
        left: "prev,next today",
        center: "title",
        right: "dayGridMonth,listMonth",
      };

  return (
    <div className="p-6 lg:p-8">
      <div className="max-w-7xl mx-auto">
        {/* Page Description */}
        <div className="mb-8">
          <p className="text-neutral-600">
            View and manage all scheduled appointments and events
          </p>
        </div>

        {/* Calendar Container */}
        <div className="bg-white rounded-lg shadow-sm border border-neutral-200 p-6">
          {loading && (
            <div className="flex items-center justify-center py-8">
              <div className="text-neutral-500">Loading events...</div>
            </div>
          )}
          
          <FullCalendar
            key={colourGroups.length}
            plugins={[dayGridPlugin, timeGridPlugin, interactionPlugin, listPlugin]}
            headerToolbar={headerToolbar}
            initialView={calendarView}
            editable={false}
            selectable={false}
            selectMirror={false}
            dayMaxEvents={true}
            weekends={weekendsVisible}
            events={filteredEvents}
            timeZone="local"
            eventContent={renderEventContent}
            eventDidMount={handleEventDidMount}
            contentHeight="auto"
            height="auto"
          />
        </div>
      </div>
    </div>
  );
}

export default CalendarView;
