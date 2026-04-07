import React from 'react';
import { Outlet, useNavigate, useLocation } from 'react-router-dom';
import { Box, Typography } from '@mui/material';

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

export default function ClubPartnersLayout() {
  const navigate = useNavigate();
  const location = useLocation();

  // Navigation tabs
  const tabs = [
    { label: 'Dashboard', path: '/club-dashboard/park-slope', isIndex: true },
    { label: 'Calendar', path: '/club-dashboard/park-slope/calendar' },
    { label: 'Analytics', path: '/club-dashboard/park-slope/analytics' },
    { label: 'Financials', path: '/club-dashboard/park-slope/financials' },
  ];

  const currentPath = location.pathname;
  const isIndexPage = currentPath === '/club-dashboard/park-slope' || currentPath === '/club-dashboard/park-slope/';

  return (
    <div className="max-w-7xl mx-auto w-full p-4 sm:p-6 lg:p-8">
      {/* Page Title */}
      <Typography variant="h4" component="h1" fontWeight="bold" gutterBottom sx={{ mb: 2 }}>
        Club Dashboard - Park Slope
      </Typography>

      {/* Top Navigation Tabs */}
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

      {/* Child Routes */}
      <Outlet />
    </div>
  );
}
