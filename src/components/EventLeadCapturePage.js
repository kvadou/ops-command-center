import React, { useState, useEffect } from "react";
import { useSearchParams } from "react-router-dom";
import { Box, Typography, Alert, CircularProgress } from "@mui/material";
import EventLeadCaptureForm from "./EventLeadCaptureForm";

export default function EventLeadCapturePage() {
  const [searchParams] = useSearchParams();
  const [eventData, setEventData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  const eventId = searchParams.get("eventId");
  const eventName = searchParams.get("eventName");

  useEffect(() => {
    // If we have eventId, we could fetch additional event data from the API
    // For now, we'll just use the URL parameters
    if (eventId) {
      setEventData({
        id: eventId,
        name: eventName || "Event Registration"
      });
    } else {
      setError("Event ID is required");
    }
    setLoading(false);
  }, [eventId, eventName]);

  const handleSuccess = (result) => {
    console.log("Event lead captured successfully:", result);
    // Could show additional success message or redirect
  };

  if (loading) {
    return (
      <Box display="flex" justifyContent="center" alignItems="center" minHeight="400px">
        <CircularProgress />
      </Box>
    );
  }

  if (error) {
    return (
      <Box sx={{ maxWidth: 600, mx: "auto", mt: 4 }}>
        <Alert severity="error">
          {error}
        </Alert>
      </Box>
    );
  }

  return (
    <Box
      sx={{
        minHeight: "100vh",
        py: 6,
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        justifyContent: "flex-start",
        backgroundImage:
          "url('https://cdn.prod.website-files.com/64d4e8b883dfdc36c02531c1/673cb1a1775d0cc1d68e4599_C%403Webbackground.jpg')",
        backgroundSize: "cover",
        backgroundPosition: "center",
      }}
    >
      <EventLeadCaptureForm
        eventName={eventData?.name}
        eventId={eventData?.id}
        onSuccess={handleSuccess}
      />
    </Box>
  );
}
