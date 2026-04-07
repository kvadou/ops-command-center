import React, { useState, useEffect, useCallback } from 'react';
import { Outlet, useSearchParams, useNavigate, useLocation } from 'react-router-dom';
import axios from 'axios';
import {
  Box,
  Typography,
  ToggleButton,
  ToggleButtonGroup,
  Grid,
} from '@mui/material';
import { FunnelIcon } from '@heroicons/react/24/outline';
import KpiCard from '../ui/KpiCard';

const brandColors = {
  green: '#34B256',
  pink: '#DA2E72',
  orange: '#F79A30',
  purple: '#6A469D',
  navy: '#2D2F8E',
  cyan: '#50C8DF',
  yellow: '#FACC29',
  light: '#E8FBFF',
};

export default function SchoolPartnersLayout() {
  const [searchParams, setSearchParams] = useSearchParams();
  const navigate = useNavigate();
  const location = useLocation();

  // State
  const [loading, setLoading] = useState(true);
  const [summary, setSummary] = useState(null);
  const [locationTab, setLocationTab] = useState(searchParams.get('location') || 'all');
  const [healthFilter, setHealthFilter] = useState(searchParams.get('health') || '');

  // Fetch summary data for counts
  const fetchSummary = useCallback(async () => {
    try {
      setLoading(true);
      const response = await axios.get('/api/schools/dashboard', {
        withCredentials: true,
      });
      setSummary(response.data.summary || {});
    } catch (err) {
      console.error('Error fetching school summary:', err);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchSummary();
  }, [fetchSummary]);

  // Update URL params when filters change
  useEffect(() => {
    const newParams = new URLSearchParams(searchParams);

    if (locationTab && locationTab !== 'all') {
      newParams.set('location', locationTab);
    } else {
      newParams.delete('location');
    }

    if (healthFilter) {
      newParams.set('health', healthFilter);
    } else {
      newParams.delete('health');
    }

    setSearchParams(newParams, { replace: true });
  }, [locationTab, healthFilter]);

  // Handle location change
  const handleLocationChange = (e, newValue) => {
    if (newValue !== null) {
      setLocationTab(newValue);
    }
  };

  // Handle health card click
  const handleHealthClick = (health) => {
    setHealthFilter(healthFilter === health ? '' : health);
  };

  // Navigation tabs
  const tabs = [
    { label: 'School Dashboard', path: '/school-partners', isIndex: true },
    { label: 'Invoice Fulfillment', path: '/school-partners/invoice-fulfillment' },
    { label: 'Pricing Models', path: '/school-partners/pricing-models' },
    { label: 'Billing', path: '/school-partners/billing' },
  ];

  const currentPath = location.pathname;
  const isIndexPage = currentPath === '/school-partners' || currentPath === '/school-partners/';
  const isDetailPage = currentPath.match(/\/school-partners\/[^/]+$/) &&
                       !currentPath.includes('invoice-fulfillment') &&
                       !currentPath.includes('pricing-models') &&
                       !currentPath.includes('billing');

  // Calculate health counts - use direct keys from API response
  const healthyCounts = {
    active: summary?.activeSchools || 0,
    healthy: summary?.healthySchools || 0,
    needs_attention: summary?.needsAttentionSchools || 0,
    unhealthy: summary?.unhealthySchools || 0,
  };

  return (
    <div className="w-full p-4 sm:p-6 lg:p-8">
      {/* Page Title */}
      <Typography variant="h4" component="h1" fontWeight="bold" gutterBottom sx={{ mb: 2 }}>
        School Partnerships Dashboard
      </Typography>

      {/* Top Navigation Tabs */}
      {!isDetailPage && (
        <Box sx={{ borderBottom: 1, borderColor: 'divider', mb: 3 }}>
          <Box display="flex" gap={3}>
            {tabs.map((tab) => {
              const isActive = tab.isIndex
                ? isIndexPage
                : currentPath === tab.path;
              return (
                <Box
                  key={tab.path}
                  onClick={() => navigate(tab.path)}
                  sx={{
                    cursor: 'pointer',
                    pb: 1.5,
                    position: 'relative',
                    '&:hover': { opacity: 0.8 },
                  }}
                >
                  <Typography
                    variant="body1"
                    sx={{
                      textTransform: 'uppercase',
                      fontWeight: isActive ? 600 : 400,
                      color: isActive ? brandColors.purple : 'text.secondary',
                      fontSize: '0.875rem',
                      letterSpacing: '0.5px',
                    }}
                  >
                    {tab.label}
                  </Typography>
                  {isActive && (
                    <Box
                      sx={{
                        position: 'absolute',
                        bottom: -1,
                        left: 0,
                        right: 0,
                        height: '3px',
                        bgcolor: brandColors.purple,
                        borderRadius: '3px 3px 0 0',
                      }}
                    />
                  )}
                </Box>
              );
            })}
          </Box>
        </Box>
      )}

      {/* Health Metric Cards - Only on index page */}
      {isIndexPage && (
        <Grid container spacing={2} sx={{ mb: 4 }}>
          <Grid item xs={6} sm={3}>
            <KpiCard
              title="Active Schools"
              value={healthyCounts.active}
              subtitle="Total active schools"
              tone="default"
              onClick={() => handleHealthClick('')}
              filterIcon={<FunnelIcon className="h-5 w-5" />}
            />
          </Grid>
          <Grid item xs={6} sm={3}>
            <KpiCard
              title="Healthy Schools"
              value={healthyCounts.healthy}
              subtitle="Health status: Healthy"
              helperText="Margin > 20%, no late invoices, unpaid < $500, has enrollment"
              tone="success"
              onClick={() => handleHealthClick('healthy')}
              filterIcon={healthFilter === 'healthy' ? <FunnelIcon className="h-5 w-5" /> : null}
            />
          </Grid>
          <Grid item xs={6} sm={3}>
            <KpiCard
              title="Needs Attention"
              value={healthyCounts.needs_attention}
              subtitle="Health status: Needs attention"
              helperText="Margin 10-20% or has activity but no revenue data"
              tone="warning"
              onClick={() => handleHealthClick('needs_attention')}
              filterIcon={healthFilter === 'needs_attention' ? <FunnelIcon className="h-5 w-5" /> : null}
            />
          </Grid>
          <Grid item xs={6} sm={3}>
            <KpiCard
              title="Unhealthy"
              value={healthyCounts.unhealthy}
              subtitle="Health status: Unhealthy"
              helperText="Late invoices (>30 days), unpaid >30 days old, or margin < 10%"
              tone="danger"
              onClick={() => handleHealthClick('unhealthy')}
              filterIcon={healthFilter === 'unhealthy' ? <FunnelIcon className="h-5 w-5" /> : null}
            />
          </Grid>
        </Grid>
      )}

      {/* Child Routes */}
      <Outlet context={{
        locationTab,
        healthFilter,
        summary,
        loading,
        setLocationTab,
        setHealthFilter,
      }} />
    </div>
  );
}
