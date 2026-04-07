import { useState, useEffect } from "react";
import { Box, CircularProgress, Typography, Button } from "@mui/material";
import { useNavigate } from "react-router-dom";

import axios from "axios";
import { darken, lighten, styled } from "@mui/material/styles";
import {
  DataGrid,
  GridToolbar,
  GridToolbarContainer,
  GridToolbarExport,
} from "@mui/x-data-grid";

const getBackgroundColor = (color, theme, coefficient) => ({
  backgroundColor: darken(color, coefficient),
  ...(theme.palette.mode === "light" && {
    backgroundColor: lighten(color, coefficient),
  }),
});

const StyledDataGrid = styled(DataGrid)(({ theme }) => ({
  "& .super-app-theme--High": {
    ...getBackgroundColor(theme.palette.success.main, theme, 0.6),
    "&:hover": {
      ...getBackgroundColor(theme.palette.success.main, theme, 0.5),
    },
  },
  "& .super-app-theme--Medium": {
    ...getBackgroundColor(theme.palette.warning.main, theme, 0.6),
    "&:hover": {
      ...getBackgroundColor(theme.palette.warning.main, theme, 0.5),
    },
  },
  "& .super-app-theme--Low": {
    ...getBackgroundColor(theme.palette.error.main, theme, 0.6),
    "&:hover": {
      ...getBackgroundColor(theme.palette.error.main, theme, 0.5),
    },
  },
}));

const ClientOverview = () => {
  const navigate = useNavigate();
  const [loading, setLoading] = useState(false);
  const [clientData, setClientData] = useState([]);
  const [paginationModel, setPaginationModel] = useState({
    pageSize: 10,
    page: 0,
  });

  const fetchClientOverviewData = async () => {
    setLoading(true);
    try {
      const response = await axios.post(
        "/api/client-overview",
        {}
      );

      setClientData(response.data.clientOverview || []);
    } catch (error) {
      console.error("Error fetching client overview data:", error);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchClientOverviewData();
  }, []);

  useEffect(() => {
    console.log("Client Data:", clientData);
  }, [clientData]);

  const CustomToolbar = () => {
    return (
      <GridToolbarContainer>
        <GridToolbarExport csvOptions={{ fileName: "LessonDetails" }} />
      </GridToolbarContainer>
    );
  };

  const columns = [
    { field: "client_id", headerName: "TutorCruncher ID", width: 200 },
    { field: "client_name", headerName: "Client Name", width: 200 },
    { field: "email", headerName: "Email", width: 200 },
    { field: "source", headerName: "Source (from Gravity)", width: 200 },
    {
      field: "total_revenue",
      headerName: "Total Revenue $ (All Complete & CBC)",
      width: 250,
      type: "number",

      cellClassName: (params) => {
        if (params.value > 3500) {
          return "super-app-theme--High";
        } else if (params.value > 1500) {
          return "super-app-theme--Medium";
        } else {
          return "super-app-theme--Low";
        }
      },
    },
    {
      field: "total_lessons",
      headerName: "Total Lessons",
      width: 150,
      type: "number",
    },
    {
      field: "total_hours",
      headerName: "Total Hours",
      width: 150,
      type: "number",
    },
    {
      field: "number_of_students",
      headerName: "Number of Students",
      width: 200,
      type: "number",
    },
  ];

  return (
    <Box sx={{ width: "100%", p: 3 }}>
      <Box display="flex" justifyContent="space-between" alignItems="center" mb={3}>
        <Typography variant="h4">Client Overview</Typography>
        <Button 
          variant="contained" 
          onClick={() => navigate('/client-management')}
          sx={{ ml: 2 }}
        >
          Open Full CRM
        </Button>
      </Box>
      
      {loading ? (
        <Box
          display="flex"
          justifyContent="center"
          alignItems="center"
          height="400px"
        >
          <CircularProgress />
        </Box>
      ) : (
        <StyledDataGrid
          rows={clientData}
          columns={columns}
          getRowId={(row) => row.client_id}
          paginationModel={paginationModel}
          onPaginationModelChange={setPaginationModel}
          pageSizeOptions={[5, 10, 25, 50]}
          autoHeight
          disableRowSelectionOnClick
          initialState={{
            sorting: {
              sortModel: [{ field: "total_revenue", sort: "desc" }],
            },
          }}
          slots={{
            toolbar: GridToolbar,
          }}
        />
      )}
    </Box>
  );
};

export default ClientOverview;
