import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import axios from 'axios';
import {
  Box,
  Card,
  CardContent,
  Typography,
  Button,
  Grid,
  CircularProgress,
  Alert
} from '@mui/material';
import { ArrowLeftIcon, ChartBarIcon, AcademicCapIcon } from '@heroicons/react/24/outline';
const StudentsAnalytics = () => {
  const navigate = useNavigate();
  const [analyticsData, setAnalyticsData] = useState(null);
  const [analyticsLoading, setAnalyticsLoading] = useState(false);
  const [analyticsError, setAnalyticsError] = useState(null);

  useEffect(() => {
    fetchAnalytics();
  }, []);

  const fetchAnalytics = async () => {
    setAnalyticsLoading(true);
    setAnalyticsError(null);
    try {
      const response = await axios.get('/api/entity-analytics/students', {
        withCredentials: true,
      });
      setAnalyticsData(response.data);
    } catch (error) {
      console.error('Error fetching student analytics:', error);
      setAnalyticsError(error.message || 'Failed to fetch analytics');
    } finally {
      setAnalyticsLoading(false);
    }
  };

  if (analyticsLoading) {
    return (
        <div className="max-w-7xl mx-auto w-full px-4 sm:px-6 lg:px-8 py-4 sm:py-6 bg-white min-h-screen">
          <Box sx={{ p: 3, display: 'flex', justifyContent: 'center', alignItems: 'center', minHeight: '400px' }}>
            <Box textAlign="center">
              <CircularProgress />
              <Typography variant="h6" gutterBottom sx={{ mt: 2, color: '#000000' }}>Loading Analytics...</Typography>
            </Box>
          </Box>
        </div>
    );
  }

  if (analyticsError) {
    return (
        <div className="max-w-7xl mx-auto w-full px-4 sm:px-6 lg:px-8 py-4 sm:py-6 bg-white min-h-screen">
          <Box sx={{ p: 3, textAlign: 'center' }}>
            <Typography variant="h6" gutterBottom color="error">
              Error Loading Analytics
            </Typography>
            <Typography variant="body2" sx={{ color: '#333333' }} mb={2}>
              {analyticsError}
            </Typography>
            <Button variant="contained" onClick={fetchAnalytics}>
              Retry
            </Button>
          </Box>
        </div>
    );
  }

  return (
      <div className="max-w-7xl mx-auto w-full px-4 sm:px-6 lg:px-8 py-4 sm:py-6 bg-white min-h-screen">
        {/* Header */}
        <div className="mb-6">
          <Button
            startIcon={<ArrowLeftIcon className="h-5 w-5" />}
            onClick={() => navigate('/students')}
            sx={{ mb: 2 }}
          >
            Back to Students
          </Button>
          <Typography variant="h4" fontWeight="bold" gutterBottom sx={{ color: '#000000' }}>
            Student Analytics
          </Typography>
          <Typography variant="body2" sx={{ color: '#333333' }}>
            Comprehensive insights into student engagement and performance
          </Typography>
        </div>

        {/* Coming Soon Message */}
        <Card>
          <CardContent>
            <Box sx={{ textAlign: 'center', py: 6 }}>
              <AcademicCapIcon className="h-16 w-16" style={{ color: 'rgba(0,0,0,0.6)', marginBottom: 16 }} />
              <Typography variant="h5" gutterBottom sx={{ color: '#000000' }}>
                Student Analytics Coming Soon
              </Typography>
              <Typography variant="body2" sx={{ color: '#333333' }}>
                We're building comprehensive analytics for student data. This will include engagement metrics,
                lesson completion rates, progress tracking, and more.
              </Typography>
            </Box>
          </CardContent>
        </Card>
      </div>
  );
};

export default StudentsAnalytics;

