import React, { useState, useEffect, useCallback } from 'react';
import { useSearchParams } from 'react-router-dom';
import axios from 'axios';
import { Grid, Typography } from '@mui/material';
import { FunnelIcon } from '@heroicons/react/24/outline';
import SchoolsListPage from './SchoolsListPage';
import KpiCard from '../ui/KpiCard';

/**
 * SchoolsDashboardWrapper - Wraps SchoolsListPage with health stats
 * This allows the school dashboard to be accessed via /schools/dashboard routes
 * with the new school partners content
 * Includes the same health stats cards as /school-partners for consistency
 */
export default function SchoolsDashboardWrapper() {
  const [searchParams, setSearchParams] = useSearchParams();

  // Health stats state
  const [loading, setLoading] = useState(true);
  const [summary, setSummary] = useState(null);
  const [locationTab, setLocationTab] = useState(searchParams.get('tab') || 'all');
  const [healthFilter, setHealthFilter] = useState(searchParams.get('health') || '');

  // Fetch summary data for health counts
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
      newParams.set('tab', locationTab);
    } else {
      newParams.delete('tab');
    }

    if (healthFilter) {
      newParams.set('health', healthFilter);
    } else {
      newParams.delete('health');
    }

    setSearchParams(newParams, { replace: true });
  }, [locationTab, healthFilter]);

  // Handle health card click
  const handleHealthClick = (health) => {
    setHealthFilter(healthFilter === health ? '' : health);
  };

  // Calculate health counts from API response
  const healthCounts = {
    active: summary?.activeSchools || 0,
    healthy: summary?.healthySchools || 0,
    needs_attention: summary?.needsAttentionSchools || 0,
    unhealthy: summary?.unhealthySchools || 0,
  };

  // Create context object to pass to SchoolsListPage (mimics SchoolPartnersLayout)
  const outletContext = {
    locationTab,
    healthFilter,
    summary,
    loading,
    setLocationTab,
    setHealthFilter,
  };

  return (
      <div className="w-full">
        {/* Health Metric Cards - Same as /school-partners */}
        <Grid container spacing={2} sx={{ mb: 4 }}>
          <Grid item xs={6} sm={3}>
            <KpiCard
              title="Active Schools"
              value={healthCounts.active}
              subtitle="Total active schools"
              tone="default"
              onClick={() => handleHealthClick('')}
              filterIcon={<FunnelIcon className="h-5 w-5" />}
            />
          </Grid>
          <Grid item xs={6} sm={3}>
            <KpiCard
              title="Healthy Schools"
              value={healthCounts.healthy}
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
              value={healthCounts.needs_attention}
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
              value={healthCounts.unhealthy}
              subtitle="Health status: Unhealthy"
              helperText="Late invoices (>30 days), unpaid >30 days old, or margin < 10%"
              tone="danger"
              onClick={() => handleHealthClick('unhealthy')}
              filterIcon={healthFilter === 'unhealthy' ? <FunnelIcon className="h-5 w-5" /> : null}
            />
          </Grid>
        </Grid>

        {/* Schools List - Pass context for filtering */}
        <SchoolsListPageWithContext context={outletContext} />
      </div>
  );
}

/**
 * Wrapper component that provides context to SchoolsListPage
 * This mimics the Outlet context from react-router
 */
function SchoolsListPageWithContext({ context }) {
  // Override useOutletContext behavior by wrapping the component
  return <SchoolsListPage outletContext={context} />;
}
