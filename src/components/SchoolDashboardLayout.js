import React, { useState, useEffect, useCallback } from 'react';
import { Outlet, useSearchParams, useNavigate, useLocation } from 'react-router-dom';
import axios from 'axios';
import { formatCurrency } from '../utils/formatters';
import {
  Box,
  Card,
  CardContent,
  Typography,
  TextField,
  Chip,
  Grid,
  FormControl,
  InputLabel,
  Select,
  MenuItem,
  ToggleButton,
  ToggleButtonGroup,
} from '@mui/material';
import { MagnifyingGlassIcon, AcademicCapIcon, CurrencyDollarIcon, DocumentTextIcon } from '@heroicons/react/24/outline';
import { CheckCircleIcon } from '@heroicons/react/24/solid';

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

export default function SchoolDashboardLayout() {
  const [searchParams, setSearchParams] = useSearchParams();
  const navigate = useNavigate();
  const location = useLocation();
  
  // Detect if we're on the new /schools/* routes (Operations Hub)
  const isOperationsHubRoute = location.pathname.startsWith('/schools/');
  
  // Don't show filters/KPI on school detail pages
  const isSchoolDetailPage = location.pathname.includes('/school-dashboard/school/') || 
                              location.pathname.includes('/schools/dashboard/school/');
  
  // Don't show location tabs and filters on child pages (only show on index route)
  const isChildPage = location.pathname !== '/school-dashboard' && 
    location.pathname !== '/school-dashboard/' &&
    location.pathname !== '/schools/dashboard' &&
    location.pathname !== '/schools/dashboard/' &&
    !isSchoolDetailPage;
  
  // Detect current subdomain/environment
  const getCurrentLocation = () => {
    if (typeof window === 'undefined') return null;
    const hostname = window.location.hostname;
    if (hostname.includes('eastside')) {
      return 'Eastside';
    } else if (hostname.includes('westside')) {
      return 'Westside';
    }
    return null;
  };

  const currentLocation = getCurrentLocation();
  const defaultLocationTab = currentLocation || 'all';

  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [summary, setSummary] = useState(null);
  const [allLocationsSummary, setAllLocationsSummary] = useState(null);
  const [allTerms, setAllTerms] = useState([]);
  const [schools, setSchools] = useState([]);
  const [activeSchools, setActiveSchools] = useState([]);
  
  // Initialize filters from URL params
  const [locationTab, setLocationTab] = useState(searchParams.get('location') || defaultLocationTab);
  const [searchQuery, setSearchQuery] = useState(searchParams.get('search') || '');
  const [termFilter, setTermFilter] = useState(searchParams.get('term') || '');
  const [healthFilter, setHealthFilter] = useState(searchParams.get('health') || 'all');
  const [paymentFilter, setPaymentFilter] = useState(searchParams.get('payment') || 'all');
  const [paymentMethodFilter, setPaymentMethodFilter] = useState(searchParams.get('paymentMethod') || 'all');

  const fetchData = useCallback(async () => {
    try {
      setLoading(true);
      setError(null);

      // Handle dormant tab - it's a special filter, not a location
      const locationParam = locationTab === 'all' || locationTab === 'dormant'
        ? (locationTab === 'dormant' ? '?location=dormant' : '')
        : `?location=${locationTab}`;
      const apiUrl = `/api/schools/dashboard${locationParam}`;

      const response = await axios.get(apiUrl, { withCredentials: true });
      const data = response.data;

      setSummary(data.summary || {});
      setSchools(data.schools || []);
      setActiveSchools(data.activeSchools || []);
      
      // Always fetch all locations summary for tab counts (unless already loaded)
      if (!allLocationsSummary || locationTab === 'all' || locationTab === 'dormant') {
        axiosInstance.get('/api/schools/dashboard').then(allResponse => {
          setAllLocationsSummary(allResponse.data.summary || {});
        }).catch(err => {
          console.error('Error fetching all locations summary:', err);
        });
      }

      // Extract unique terms from schools
      const terms = new Set();
      if (data.schools) {
        data.schools.forEach(school => {
          if (school.jobs) {
            school.jobs.forEach(job => {
              if (job.termSeason) {
                terms.add(job.termSeason);
              }
            });
          }
        });
      }
      setAllTerms(Array.from(terms).sort());

    } catch (err) {
      console.error('Error fetching school dashboard data:', err);
      let errorMessage = 'Failed to load school dashboard data';
      if (err.response?.data) {
        const errorData = err.response.data;
        errorMessage = errorData.error || errorData.details || errorData.message || errorMessage;
      } else if (err.message) {
        errorMessage = err.message;
      }
      setError(errorMessage);
    } finally {
      setLoading(false);
    }
  }, [locationTab]);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  // Update URL params when filters change
  useEffect(() => {
    const params = new URLSearchParams();
    if (locationTab && locationTab !== 'all') params.set('location', locationTab);
    if (searchQuery) params.set('search', searchQuery);
    if (termFilter) params.set('term', termFilter);
    // Health, Payment, and Payment Method filters removed - using default 'all' values
    // Health filter still works via card clicks and URL params
    
    setSearchParams(params, { replace: true });
  }, [locationTab, searchQuery, termFilter, setSearchParams]);


  // Quick Links Component - Tab Style
  const QuickLinks = () => {
    const currentPath = location.pathname;
    const tabs = [
      { label: 'School Dashboard', path: '/school-dashboard', isIndex: true },
      { label: 'Invoice Fulfillment', path: '/school-dashboard/invoice-fulfillment' },
      { label: 'Pricing Models', path: '/school-dashboard/pricing-models' },
      { label: 'Billing', path: '/school-dashboard/billing' },
    ];

    return (
      <Box sx={{ borderBottom: 1, borderColor: 'divider', mb: 3 }}>
        <Box display="flex" gap={3}>
          {tabs.map((tab) => {
            const isActive = tab.isIndex 
              ? currentPath === '/school-dashboard' || currentPath === '/school-dashboard/'
              : currentPath === tab.path;
            return (
              <Box
                key={tab.path}
                onClick={() => navigate(tab.path)}
                sx={{
                  cursor: 'pointer',
                  pb: 1.5,
                  position: 'relative',
                  '&:hover': {
                    opacity: 0.8,
                  },
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
    );
  };

  return (
    <Box sx={{ 
      maxWidth: isOperationsHubRoute ? '100%' : '1400px', 
      mx: 'auto', 
      p: isOperationsHubRoute ? 0 : { xs: 2, sm: 3 },
      width: '100%'
    }}>
      {/* Header - Hidden on Operations Hub routes (they have their own header) */}
      {!isOperationsHubRoute && (
        <Box sx={{ mb: 4 }}>
          <Typography variant="h4" component="h1" fontWeight="bold" gutterBottom>
            School Partnerships Dashboard
          </Typography>
          {!isSchoolDetailPage && <QuickLinks />}
        </Box>
      )}

      {/* Location Tabs, Filters, and KPI Cards - Hidden on school detail pages and child pages */}
      {!isSchoolDetailPage && !isChildPage && (
        <>
          {/* Wrap in white card for Operations Hub routes */}
          {isOperationsHubRoute ? (
            <Card sx={{ bgcolor: 'background.paper', boxShadow: 1, mb: 3, borderRadius: 2 }}>
              <CardContent sx={{ p: { xs: 2, sm: 3 } }}>
                {/* Location Tabs */}
                <Box sx={{ borderBottom: 1, borderColor: 'divider', mb: 3, pb: 2 }}>
                  <ToggleButtonGroup
                    value={locationTab || 'all'}
                    exclusive
                    onChange={(e, newValue) => {
                      if (newValue !== null) {
                        setLocationTab(newValue);
                      }
                    }}
                    aria-label="location filter"
                    size="small"
                    sx={{
                      flexWrap: 'wrap',
                      gap: 1,
                      '& .MuiToggleButton-root': {
                        border: `1px solid ${brandColors.purple}40`,
                        color: brandColors.purple,
                        textTransform: 'none',
                        fontWeight: 500,
                        minHeight: '30.75px',
                        padding: '4px 10px',
                        fontSize: '0.8125rem',
                        '&.Mui-selected': {
                          bgcolor: brandColors.purple,
                          color: 'white',
                          '&:hover': {
                            bgcolor: brandColors.navy,
                          },
                        },
                        '&:hover': {
                          bgcolor: `${brandColors.purple}15`,
                        },
                      },
                    }}
                  >
                    {!currentLocation && (
                      <>
                        <ToggleButton value="all" aria-label="all">
                          All Active ({allLocationsSummary?.activeSchools || summary?.activeSchools || 0})
                        </ToggleButton>
                        <ToggleButton value="NYC" aria-label="nyc">
                          NYC ({allLocationsSummary?.byLocationActive?.NYC || summary?.byLocationActive?.NYC || 0})
                        </ToggleButton>
                        <ToggleButton value="LA" aria-label="la">
                          LA ({allLocationsSummary?.byLocationActive?.LA || summary?.byLocationActive?.LA || 0})
                        </ToggleButton>
                        <ToggleButton value="SF" aria-label="sf">
                          SF ({allLocationsSummary?.byLocationActive?.SF || summary?.byLocationActive?.SF || 0})
                        </ToggleButton>
                        <ToggleButton value="Hamptons" aria-label="hamptons">
                          Hamptons ({allLocationsSummary?.byLocationActive?.Hamptons || summary?.byLocationActive?.Hamptons || 0})
                        </ToggleButton>
                        <ToggleButton value="dormant" aria-label="dormant">
                          Dormant ({allLocationsSummary?.inactiveSchools || summary?.inactiveSchools || 0})
                        </ToggleButton>
                      </>
                    )}
                    {currentLocation === 'Eastside' && (
                      <ToggleButton value="Eastside" aria-label="eastside">
                        Eastside ({summary?.byLocation?.['Eastside'] || 0})
                      </ToggleButton>
                    )}
                    {currentLocation === 'Westside' && (
                      <ToggleButton value="Westside" aria-label="westside">
                        Westside ({summary?.byLocation?.['Westside'] || 0})
                      </ToggleButton>
                    )}
                  </ToggleButtonGroup>
                </Box>

                {/* Quick Filters */}
                <Grid container spacing={2} alignItems="center">
                  <Grid item xs={12} sm={6} md={3}>
                    <TextField
                      fullWidth
                      size="small"
                      label="Search Schools"
                      value={searchQuery}
                      onChange={(e) => setSearchQuery(e.target.value)}
                      InputProps={{
                        startAdornment: <MagnifyingGlassIcon className="h-5 w-5" style={{ marginRight: 8, color: 'rgba(0,0,0,0.54)' }} />,
                      }}
                      placeholder="School name, email..."
                    />
                  </Grid>
                  <Grid item xs={12} sm={6} md={2}>
                    <FormControl fullWidth size="small">
                      <InputLabel>Term</InputLabel>
                      <Select
                        value={termFilter}
                        onChange={(e) => setTermFilter(e.target.value)}
                        label="Term"
                      >
                        <MenuItem value="">All Terms</MenuItem>
                        {allTerms.map(term => (
                          <MenuItem key={term} value={term}>{term}</MenuItem>
                        ))}
                      </Select>
                    </FormControl>
                  </Grid>
                </Grid>
              </CardContent>
            </Card>
          ) : (
            <>
              {/* Location Tabs */}
              <Box sx={{ borderBottom: 1, borderColor: 'divider', mb: 3, pb: 2 }}>
                <ToggleButtonGroup
                  value={locationTab || 'all'}
                  exclusive
                  onChange={(e, newValue) => {
                    if (newValue !== null) {
                      setLocationTab(newValue);
                    }
                  }}
                  aria-label="location filter"
                  size="small"
                  sx={{
                    flexWrap: 'wrap',
                    gap: 1,
                    '& .MuiToggleButton-root': {
                      border: `1px solid ${brandColors.purple}40`,
                      color: brandColors.purple,
                      textTransform: 'none',
                      fontWeight: 500,
                      minHeight: '30.75px',
                      padding: '4px 10px',
                      fontSize: '0.8125rem',
                      '&.Mui-selected': {
                        bgcolor: brandColors.purple,
                        color: 'white',
                        '&:hover': {
                          bgcolor: brandColors.navy,
                        },
                      },
                      '&:hover': {
                        bgcolor: `${brandColors.purple}15`,
                      },
                    },
                  }}
                >
                  {!currentLocation && (
                    <>
                      <ToggleButton value="all" aria-label="all">
                        All Active ({allLocationsSummary?.activeSchools || summary?.activeSchools || 0})
                      </ToggleButton>
                      <ToggleButton value="NYC" aria-label="nyc">
                        NYC ({allLocationsSummary?.byLocationActive?.NYC || summary?.byLocationActive?.NYC || 0})
                      </ToggleButton>
                      <ToggleButton value="LA" aria-label="la">
                        LA ({allLocationsSummary?.byLocationActive?.LA || summary?.byLocationActive?.LA || 0})
                      </ToggleButton>
                      <ToggleButton value="SF" aria-label="sf">
                        SF ({allLocationsSummary?.byLocationActive?.SF || summary?.byLocationActive?.SF || 0})
                      </ToggleButton>
                      <ToggleButton value="Hamptons" aria-label="hamptons">
                        Hamptons ({allLocationsSummary?.byLocationActive?.Hamptons || summary?.byLocationActive?.Hamptons || 0})
                      </ToggleButton>
                      <ToggleButton value="dormant" aria-label="dormant">
                        Dormant ({allLocationsSummary?.inactiveSchools || summary?.inactiveSchools || 0})
                      </ToggleButton>
                    </>
                  )}
                  {currentLocation === 'Eastside' && (
                    <ToggleButton value="Eastside" aria-label="eastside">
                      Eastside ({summary?.byLocation?.['Eastside'] || 0})
                    </ToggleButton>
                  )}
                  {currentLocation === 'Westside' && (
                    <ToggleButton value="Westside" aria-label="westside">
                      Westside ({summary?.byLocation?.['Westside'] || 0})
                    </ToggleButton>
                  )}
                </ToggleButtonGroup>
              </Box>

              {/* Quick Filters */}
              <Card sx={{ bgcolor: 'background.paper', boxShadow: 1, mb: 3 }}>
                <CardContent>
                  <Grid container spacing={2} alignItems="center">
                    <Grid item xs={12} sm={6} md={3}>
                      <TextField
                        fullWidth
                        size="small"
                        label="Search Schools"
                        value={searchQuery}
                        onChange={(e) => setSearchQuery(e.target.value)}
                        InputProps={{
                          startAdornment: <MagnifyingGlassIcon className="h-5 w-5" style={{ marginRight: 8, color: 'rgba(0,0,0,0.54)' }} />,
                        }}
                        placeholder="School name, email..."
                      />
                    </Grid>
                    <Grid item xs={12} sm={6} md={2}>
                      <FormControl fullWidth size="small">
                        <InputLabel>Term</InputLabel>
                        <Select
                          value={termFilter}
                          onChange={(e) => setTermFilter(e.target.value)}
                          label="Term"
                        >
                          <MenuItem value="">All Terms</MenuItem>
                          {allTerms.map(term => (
                            <MenuItem key={term} value={term}>{term}</MenuItem>
                          ))}
                        </Select>
                      </FormControl>
                    </Grid>
                  </Grid>
                </CardContent>
              </Card>
            </>
          )}
        </>
      )}

      {/* Child Route Content */}
      <Outlet context={{ 
        summary, 
        allLocationsSummary,
        locationTab,
        searchQuery,
        termFilter,
        healthFilter: healthFilter, // Still passed for card-based filtering
        paymentFilter: 'all', // Default to 'all' since filter removed
        paymentMethodFilter: 'all', // Default to 'all' since filter removed
        allTerms,
        schools,
        activeSchools,
        loading,
        error,
        refetch: fetchData
      }} />
    </Box>
  );
}
