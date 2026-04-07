import React from "react";
import { Box, Button, Typography } from "@mui/material";
import { useNavigate } from "react-router-dom";
import AllClientReports from "./AllClientReports";

export default function ClientReports() {
  const navigate = useNavigate();

  return <AllClientReports />;
}
