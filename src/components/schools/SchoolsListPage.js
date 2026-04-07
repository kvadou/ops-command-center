import React, { useState, useEffect, useMemo } from 'react';
import { useOutletContext } from 'react-router-dom';
import { Box, Typography } from '@mui/material';
import EntityListPage from '../EntityListPage';

const brandColors = {
  purple: '#6A469D',
  navy: '#2D2F8E',
};

export default function SchoolsListPage({ outletContext: propContext }) {
  // Use prop context if provided, otherwise fall back to router outlet context
  const routerContext = useOutletContext();
  const context = propContext || routerContext;
  const hasParentLayout = context !== null && context !== undefined;
  const { locationTab, healthFilter, summary, setLocationTab } = context || {};
  const [tabCounts, setTabCounts] = useState({});

  // Build external filters from parent layout context
  const externalFilters = useMemo(() => {
    const filters = {};

    // Location filter from parent toggle buttons
    if (locationTab === 'dormant') {
      // Dormant tab: show only dormant schools
      filters.status = 'dormant';
    } else if (locationTab && locationTab !== 'all') {
      // Location-specific tab (NYC, LA, etc.): show active schools in that location
      filters.location = locationTab;
      filters.status = 'active'; // Exclude dormant from location tabs
    } else {
      // 'all' tab (All Active): show all active schools, exclude dormant
      filters.status = 'active';
    }

    // Health filter from parent KPI cards
    if (healthFilter) {
      filters.health = healthFilter;
    }

    return filters;
  }, [locationTab, healthFilter]);

  useEffect(() => {
    // Fetch tab counts from the API
    fetch('/api/entity-lists/schools?limit=1')
      .then(res => res.json())
      .then(data => {
        if (data.tabCounts) {
          setTabCounts(data.tabCounts);
        } else if (data.pagination) {
          setTabCounts({
            all: data.pagination.total
          });
        }
      })
      .catch(err => console.error('Error fetching school counts:', err));
  }, []);

  const getRowData = (school) => {
    // Health status display with colored indicator
    const getHealthDisplay = (status) => {
      const statusMap = {
        healthy: { icon: '●', color: 'text-green-600', label: 'Healthy' },
        needs_attention: { icon: '●', color: 'text-yellow-600', label: 'Needs Attention' },
        unhealthy: { icon: '●', color: 'text-red-600', label: 'Unhealthy' }
      };
      const s = statusMap[status] || statusMap.healthy;
      return (
        <span className={`inline-flex items-center gap-1.5 ${s.color}`}>
          <span className="text-lg leading-none">{s.icon}</span>
          <span className="text-sm">{s.label}</span>
        </span>
      );
    };

    // Location badge display
    const getLocationBadge = (location) => {
      if (!location) return <span className="text-neutral-400">-</span>;
      const colorMap = {
        'NYC': 'bg-blue-100 text-blue-700',
        'LA': 'bg-orange-100 text-orange-700',
        'SF': 'bg-teal-100 text-teal-700',
        'Hamptons': 'bg-purple-100 text-purple-700',
        Eastside: 'bg-green-100 text-green-700',
        Westside: 'bg-pink-100 text-pink-700'
      };
      const colorClass = colorMap[location] || 'bg-neutral-100 text-neutral-700';
      return (
        <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium ${colorClass}`}>
          {location}
        </span>
      );
    };

    return {
      name: school.name || 'Unknown School',
      health: getHealthDisplay(school.healthStatus),
      tutor: (
        <span className="text-sm text-neutral-700 truncate max-w-xs block">
          {school.tutorNames || <span className="text-neutral-400">-</span>}
        </span>
      ),
      location: getLocationBadge(school.location)
    };
  };

  const tabs = [
    { key: 'all', label: 'All', filter: {}, statusKey: 'all' },
    { key: 'active', label: 'Active', filter: { status: 'active' }, statusKey: 'active' },
    { key: 'paused', label: 'Paused', filter: { status: 'paused' }, statusKey: 'paused' },
    { key: 'dormant', label: 'Dormant', filter: { status: 'dormant' }, statusKey: 'dormant' }
  ].map(tab => ({
    ...tab,
    count: tabCounts[tab.statusKey] || tabCounts[tab.key] || 0
  }));

  const filters = [
    {
      key: 'location',
      label: 'Location',
      type: 'select',
      options: [
        { value: '', label: 'All Locations' },
        { value: 'NYC', label: 'NYC' },
        { value: 'LA', label: 'LA' },
        { value: 'SF', label: 'SF' },
        { value: 'Hamptons', label: 'Hamptons' },
        { value: 'Eastside', label: 'Eastside' },
        { value: 'Westside', label: 'Westside' }
      ],
      section: 'Location'
    },
    {
      key: 'health',
      label: 'Health Status',
      type: 'select',
      options: [
        { value: '', label: 'All Health Statuses' },
        { value: 'healthy', label: 'Healthy' },
        { value: 'needs_attention', label: 'Needs Attention' },
        { value: 'unhealthy', label: 'Unhealthy' }
      ],
      section: 'Health'
    },
    {
      key: 'billing_model',
      label: 'Billing Model',
      type: 'select',
      options: [
        { value: '', label: 'All Billing Models' },
        { value: 'per_lesson', label: 'Per Lesson' },
        { value: 'per_student', label: 'Per Student' },
        { value: 'monthly_billing', label: 'Monthly' },
        { value: 'term_billing', label: 'Term' },
        { value: 'invoice_school_paid', label: 'Invoice (School Paid)' }
      ],
      section: 'Billing'
    }
  ];

  // Streamlined columns for better viewport fit - essential info only
  // Default widths are smaller to avoid wasted space; users can resize and widths persist
  const columns = [
    { key: 'name', label: 'Name', width: '250px' },
    { key: 'health', label: 'Health', width: '130px' },
    { key: 'tutor', label: 'Tutor', width: '280px' },
    { key: 'location', label: 'Location', width: '100px' }
  ];

  // Determine default tab based on external filters
  const defaultTab = externalFilters.status === 'dormant' ? 'dormant' : 'active';

  // Location tabs configuration - counts come from summary.byLocationActive
  const getLocationCount = (key) => {
    if (!summary) return 0;
    if (key === 'all') return summary.activeSchools || 0;
    if (key === 'dormant') return summary.inactiveSchools || 0;
    return summary.byLocationActive?.[key] || 0;
  };

  const locationTabs = [
    { key: 'all', label: 'All Active' },
    { key: 'NYC', label: 'NYC' },
    { key: 'LA', label: 'LA' },
    { key: 'SF', label: 'SF' },
    { key: 'Hamptons', label: 'Hamptons' },
    { key: 'dormant', label: 'Dormant' },
  ];

  const handleLocationChange = (newLocation) => {
    if (setLocationTab) {
      setLocationTab(newLocation);
    }
  };

  return (
    <Box>
      {/* White container for tabs and search */}
      <Box
        sx={{
          bgcolor: 'white',
          borderRadius: '12px',
          boxShadow: '0 1px 3px rgba(0,0,0,0.08)',
          overflow: 'hidden',
        }}
      >
        {/* Location Tabs */}
        {hasParentLayout && (
          <Box
            sx={{
              display: 'flex',
              gap: 1,
              px: 3,
              pt: 2,
              borderBottom: 1,
              borderColor: 'divider',
              pb: 0,
            }}
          >
          {locationTabs.map((tab) => {
            const isActive = locationTab === tab.key || (!locationTab && tab.key === 'all');
            const count = getLocationCount(tab.key);

            return (
              <Box
                key={tab.key}
                onClick={() => handleLocationChange(tab.key)}
                sx={{
                  cursor: 'pointer',
                  px: 2,
                  py: 1.5,
                  position: 'relative',
                  transition: 'all 0.2s',
                  '&:hover': {
                    bgcolor: 'rgba(106, 70, 157, 0.04)',
                  },
                }}
              >
                <Typography
                  variant="body2"
                  sx={{
                    fontWeight: isActive ? 600 : 400,
                    color: isActive ? brandColors.purple : 'text.secondary',
                    fontSize: '0.875rem',
                    display: 'flex',
                    alignItems: 'center',
                    gap: 0.75,
                  }}
                >
                  {tab.label}
                  <Box
                    component="span"
                    sx={{
                      bgcolor: isActive ? brandColors.purple : 'grey.200',
                      color: isActive ? 'white' : 'text.secondary',
                      px: 1,
                      py: 0.25,
                      borderRadius: '12px',
                      fontSize: '0.75rem',
                      fontWeight: 500,
                      minWidth: '24px',
                      textAlign: 'center',
                    }}
                  >
                    {count}
                  </Box>
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
      )}

      <EntityListPage
      title="Schools"
      entityType="schools"
      apiEndpoint="schools"
      getRowData={getRowData}
      columns={columns}
      searchPlaceholder="Search by school name or email..."
      tabs={hasParentLayout ? [] : tabs}
      defaultTab={defaultTab}
      filters={filters}
      externalFilters={externalFilters}
      getEntityLink={(school) => `/school-partners/${school.clientId || school.id}`}
      getEntityName={(school) => school.name}
      getEntitySubtitle={(school) => school.email || school.location || ''}
      onTabCountsUpdate={setTabCounts}
      hideTitle={true}
      hideActions={true}
      resizableColumns={true}
    />
      </Box>
    </Box>
  );
}
