import React, { useEffect } from "react";
import { Box, Typography, Button } from "@mui/material";
import { useSearchParams, Link as RouterLink } from "react-router-dom";

export default function CanceledPage() {
  const [search] = useSearchParams();
  const submissionId = search.get("session_id");
  const lastBookingUrl =
    sessionStorage.getItem("lastBookingUrl") || "/booking-forms/frontend";

  useEffect(() => {
    if (!submissionId) return;
    fetch(`/api/submissions/${submissionId}/payment-status`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ status: "canceled" }),
    }).catch(console.error);
  }, [submissionId]);

  return (
    <Box
      sx={{
        display: "flex",
        justifyContent: "center",
        alignItems: "center",
        textAlign: "center",
        minHeight: "100vh",
        backgroundImage: `url('https://cdn.prod.website-files.com/64d4e8b883dfdc36c02531c1/673cb1a1775d0cc1d68e4599_C%403Webbackground.jpg')`,
        backgroundSize: "cover",
        backgroundPosition: "center",
      }}
    >
      <Box>
        <Typography variant="h2" fontWeight="bold" color="white">
           Oops... Payment Canceled
        </Typography>
        <Typography color="white" mt={1}>
          Your payment didn’t go through. Feel free to try again.
        </Typography>

        <Box textAlign="center" mt={4}>
          <Button
            component={RouterLink}
            to={lastBookingUrl}
            variant="contained"
            size="large"
            sx={{ borderRadius: 3, px: 4 }}
          >
            Make another booking
          </Button>
        </Box>
      </Box>
    </Box>
  );
}
