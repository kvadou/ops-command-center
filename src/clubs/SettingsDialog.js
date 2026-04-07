import React from "react";
import { useNavigate } from "react-router-dom";
import { IconButton } from "@mui/material";
import { Cog6ToothIcon } from '@heroicons/react/24/outline';

export default function SettingsDialog() {
  const navigate = useNavigate();

  const handleClickOpen = () => {
    navigate("/manage-services");
  };

  return (
    <div>
      <IconButton
        color="inherit"
        onClick={handleClickOpen}
        style={{ position: "absolute", right: 20, top: 10 }}
      >
        <Cog6ToothIcon className="h-5 w-5" />
      </IconButton>
    </div>
  );
}
