import React, { useState, useEffect } from 'react';
import { Bar } from 'react-chartjs-2';
import { Chart as ChartJS, CategoryScale, LinearScale, BarElement, Title, Tooltip, Legend } from 'chart.js';

ChartJS.register(
  CategoryScale,
  LinearScale,
  BarElement,
  Title,
  Tooltip,
  Legend
);

function Analytics() {
  const [data, setData] = useState({
    totalLessons: 100,
    totalStudents: 50,
    totalRevenue: 5000,
    lessonsByType: {
      labels: ['In-Home', 'Club', 'Online', 'Schools'],
      datasets: [
        {
          label: 'Total Lessons',
          data: [30, 20, 25, 25],
          backgroundColor: 'rgba(75, 192, 192, 0.6)',
        },
      ],
    },
  });

  return (
    <div>
      <h2>Analytics Dashboard</h2>

     
      <div>
        <h3>Total Lessons by Type</h3>
        <Bar data={data.lessonsByType} />
      </div>
    </div>
  );
}

export default Analytics;
