import React, { useEffect, useState } from "react";
import { Box, CircularProgress, Typography } from "@mui/material";
import { Bar } from "react-chartjs-2";
import {
  Chart as ChartJS,
  BarElement,
  CategoryScale,
  LinearScale,
  Title,
  Tooltip,
  Legend,
} from "chart.js";

ChartJS.register(
  BarElement,
  CategoryScale,
  LinearScale,
  Title,
  Tooltip,
  Legend
);

const EnhancedBarChart = ({ revenueData = [] }) => {
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const timer = setTimeout(() => {
      setLoading(false);
    }, 1000);
    return () => clearTimeout(timer);
  }, []);

  const safeRevenueData = Array.isArray(revenueData) ? revenueData : [];

  const sorted = [...safeRevenueData].sort((a, b) =>
    a.label.localeCompare(b.label)
  );

  const labels = sorted.map((r) => r.label);
  const expected = sorted.map((r) => r.expectedRevenue || 0);

  const chartData = {
    labels,
    datasets: [
      {
        label: "Expected Revenue",
        data: expected,
        backgroundColor: sorted.map((r) =>
          typeof r.color === "string" && r.color.startsWith("#")
            ? r.color
            : "#01579b"
        ),
      },
    ],
  };

  const options = {
    responsive: true,
    maintainAspectRatio: false,
    plugins: {
      legend: {
        position: "top",
      },
      tooltip: {
        callbacks: {
          label: (tooltipItem) =>
            `${
              tooltipItem.dataset.label
            }: $${tooltipItem.raw.toLocaleString()}`,
        },
      },
    },
    scales: {
      x: {
        type: "category",
        ticks: {
          autoSkip: false,
          maxRotation: 45,
          minRotation: 45,
        },
        grid: {
          display: false,
        },
        title: {
          display: false,
        },
      },
      y: {
        beginAtZero: true,
        ticks: {
          callback: (value) => `$${value}`,
        },
        grid: {
          display: false,
        },
      },
    },
    barThickness: "flex",
  };

  if (loading || sorted.length === 0) {
    return (
      <Box
        sx={{
          height: 400,
          display: "flex",
          flexDirection: "column",
          alignItems: "center",
          justifyContent: "center",
        }}
      >
        {loading ? <CircularProgress /> : null}
        <Typography variant="h6" sx={{ color: "text.secondary" }}>
          {loading ? "Loading..." : "No revenue data available"}
        </Typography>
      </Box>
    );
  }

  return <Bar data={chartData} options={options} />;
};

export default EnhancedBarChart;
