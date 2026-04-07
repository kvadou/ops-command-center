
import React, { useState } from "react";
import { Tabs, Tab, Box, Paper, Typography } from "@mui/material";
import SubjectsManager from "./settings/SubjectsManager";
import LocationsManager from "./settings/LocationsManager";
import ImagesManager from "./settings/ImagesManager";

function TabPanel({ value, index, children }) {
  return (
    <div role="tabpanel" hidden={value !== index}>
      {value === index && <Box sx={{ pt: 2 }}>{children}</Box>}
    </div>
  );
}

export default function CalendarSettingsPage() {
  const [tab, setTab] = useState(0);

  return (
    <Box className="p-6">
    
      <Paper>
        <Tabs
          value={tab}
          onChange={(_, v) => setTab(v)}
          variant="scrollable"
          scrollButtons="auto"
        >
          <Tab label="Subjects" />
          <Tab label="Locations" />
          <Tab label="Images" />
        </Tabs>
      </Paper>

      <TabPanel value={tab} index={0}>
        <SubjectsManager />
      </TabPanel>
      <TabPanel value={tab} index={1}>
        <LocationsManager />
      </TabPanel>
      <TabPanel value={tab} index={2}>
        <ImagesManager />
      </TabPanel>
    </Box>
  );
}
