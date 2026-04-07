/**
 * EntityDashboardLayout - Shared layout component for entity list pages (tutors, clients, students, affiliates)
 * Provides metrics cards, filter tabs, search, and entity list display
 * Matches the design pattern from SchoolDashboardOverviewAndSchools
 */

import React, { useState, useEffect, useMemo } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import axios from 'axios';
import KpiCard from './ui/KpiCard';
import EntityListPage from './EntityListPage';
import {
  Box,
  Card,
  CardContent,
  Grid,
  CircularProgress,
  Alert,
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions,
  Button,
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TableRow,
  Paper,
  Typography,
  IconButton,
} from '@mui/material';
import { FunnelIcon, XMarkIcon } from '@heroicons/react/24/outline';

export default function EntityDashboardLayout({
  title,
  entityType, // 'tutors', 'clients', 'students', 'affiliates'
  apiEndpoint, // API endpoint for fetching entities
  metricsEndpoint, // API endpoint for fetching metrics
  getRowData,
  columns,
  tabs,
  defaultTab,
  filters,
  searchPlaceholder,
  getEntityLink,
  getEntityName,
  getEntitySubtitle,
  onTabCountsUpdate,
  customHeaderAction,
  metricsConfig, // Configuration for metrics cards
}) {
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();
  
  // State
  const [metrics, setMetrics] = useState(null);
  const [metricsLoading, setMetricsLoading] = useState(true);
  const [metricsError, setMetricsError] = useState(null);
  const [activeTab, setActiveTab] = useState(defaultTab || tabs[0]?.key || 'all');
  const [searchQuery, setSearchQuery] = useState(searchParams.get('search') || '');
  const [metricModalOpen, setMetricModalOpen] = useState(false);
  const [selectedMetric, setSelectedMetric] = useState(null);
  const [metricDetailData, setMetricDetailData] = useState([]);
  const [metricDetailLoading, setMetricDetailLoading] = useState(false);

  // Fetch metrics
  useEffect(() => {
    const fetchMetrics = async () => {
      setMetricsLoading(true);
      setMetricsError(null);
      try {
        const response = await axios.get(`/api/entity-metrics/${entityType}`, {
          withCredentials: true,
        });
        setMetrics(response.data);
      } catch (error) {
        console.error('Error fetching metrics:', error);
        setMetricsError(error.message);
      } finally {
        setMetricsLoading(false);
      }
    };

    fetchMetrics();
  }, [entityType, metricsEndpoint]);

  // Handle metric card click - open modal with details
  const handleMetricClick = async (metricKey) => {
    setSelectedMetric(metricKey);
    setMetricModalOpen(true);
    setMetricDetailLoading(true);
    setMetricDetailData([]);

    try {
      // Fetch detailed data for the metric
      // This would call a detail endpoint or filter the main list
      const params = new URLSearchParams();

      // Apply filters based on metric type
      if (metricKey === 'activeTutors' || metricKey === 'activeAffiliates') {
        params.append('status', entityType === 'tutors' ? 'approved' : 'active');
      } else if (metricKey === 'liveClients') {
        params.append('status', 'live');
      } else if (metricKey === 'needsAttention') {
        // This would need custom logic per entity type
      }

      const response = await axios.get(`/api/entity-lists/${apiEndpoint}?${params.toString()}`, {
        withCredentials: true,
      });
      
      setMetricDetailData(response.data[entityType] || response.data || []);
    } catch (error) {
      console.error('Error fetching metric details:', error);
    } finally {
      setMetricDetailLoading(false);
    }
  };

  // Handle filter icon click - filter the list
  const handleFilterClick = (metricKey) => {
    // Update active tab or search params based on metric
    const config = metricsConfig.find(m => m.key === metricKey);
    if (config?.filter) {
      // Apply filter to EntityListPage
      const newParams = new URLSearchParams(searchParams);
      Object.entries(config.filter).forEach(([key, value]) => {
        newParams.set(key, value);
      });
      setSearchParams(newParams, { replace: true });
      
      // Update active tab if applicable
      const matchingTab = tabs.find(t => {
        return Object.entries(config.filter).every(([k, v]) => t.filter?.[k] === v);
      });
      if (matchingTab) {
        setActiveTab(matchingTab.key);
      }
    }
  };

  // Get metric value
  const getMetricValue = (key) => {
    if (!metrics) return 0;
    return metrics[key] || 0;
  };

  // Render metrics cards
  const renderMetricsCards = () => {
    if (metricsLoading) {
      return (
        <Box display="flex" justifyContent="center" alignItems="center" minHeight="200px">
          <CircularProgress />
        </Box>
      );
    }

    if (metricsError) {
      return (
        <Alert severity="error" sx={{ mb: 2 }}>
          Error loading metrics: {metricsError}
        </Alert>
      );
    }

    return (
      <Card sx={{ bgcolor: 'background.paper', boxShadow: 1, mb: 3, borderRadius: 2 }}>
        <CardContent sx={{ p: { xs: 2, sm: 3 } }}>
          <Grid container spacing={{ xs: 1.5, sm: 2 }}>
            {metricsConfig.map((config) => (
              <Grid item xs={6} sm={6} md={3} key={config.key}>
                <KpiCard
                  title={config.title}
                  value={getMetricValue(config.key).toLocaleString()}
                  subtitle={config.subtitle}
                  helperText={config.helperText}
                  tone={config.tone || 'default'}
                  onClick={() => handleMetricClick(config.key)}
                  modalIcon={<FunnelIcon className="h-5 w-5" />}
                  onFilterClick={(e) => {
                    e.stopPropagation();
                    handleFilterClick(config.key);
                  }}
                />
              </Grid>
            ))}
          </Grid>
        </CardContent>
      </Card>
    );
  };

  return (
    <Box>
      {/* Metrics Cards */}
      {renderMetricsCards()}

      {/* Entity List */}
      <EntityListPage
        title={title}
        entityType={entityType}
        apiEndpoint={apiEndpoint}
        getRowData={getRowData}
        columns={columns}
        searchPlaceholder={searchPlaceholder}
        tabs={tabs}
        defaultTab={defaultTab}
        filters={filters}
        getEntityLink={getEntityLink}
        getEntityName={getEntityName}
        getEntitySubtitle={getEntitySubtitle}
        onTabCountsUpdate={onTabCountsUpdate}
        customHeaderAction={customHeaderAction}
      />

      {/* Metric Detail Modal */}
      <Dialog
        open={metricModalOpen}
        onClose={() => setMetricModalOpen(false)}
        maxWidth="md"
        fullWidth
      >
        <DialogTitle>
          {selectedMetric && metricsConfig.find(m => m.key === selectedMetric)?.title}
          <IconButton
            onClick={() => setMetricModalOpen(false)}
            sx={{ position: 'absolute', right: 8, top: 8 }}
          >
            <XMarkIcon className="h-5 w-5" />
          </IconButton>
        </DialogTitle>
        <DialogContent>
          {metricDetailLoading ? (
            <Box display="flex" justifyContent="center" p={3}>
              <CircularProgress />
            </Box>
          ) : metricDetailData.length === 0 ? (
            <Typography>No data available</Typography>
          ) : (
            <TableContainer component={Paper}>
              <Table>
                <TableHead>
                  <TableRow>
                    {columns.map((col) => (
                      <TableCell key={col.key}>{col.label}</TableCell>
                    ))}
                  </TableRow>
                </TableHead>
                <TableBody>
                  {metricDetailData.slice(0, 50).map((entity, idx) => (
                    <TableRow key={idx}>
                      {columns.map((col) => (
                        <TableCell key={col.key}>
                          {getRowData(entity)[col.key]}
                        </TableCell>
                      ))}
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </TableContainer>
          )}
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setMetricModalOpen(false)}>Close</Button>
        </DialogActions>
      </Dialog>
    </Box>
  );
}

