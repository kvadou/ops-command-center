import React, { useState, useEffect, useMemo } from 'react';
import { useOutletContext, useNavigate, useSearchParams, useLocation } from 'react-router-dom';
import axios from 'axios';
import KpiCard from './ui/KpiCard';
import { useToast } from '../hooks/useToast';
import MetricChip from './ui/MetricChip';
import { formatCurrency } from '../utils/formatters';
import {
  Box,
  Card,
  CardContent,
  Typography,
  Button,
  Chip,
  Grid,
  CircularProgress,
  Alert,
  IconButton,
  Tooltip,
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions,
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TableRow,
  Paper,
  Pagination,
} from '@mui/material';
import { ExclamationTriangleIcon, ExclamationCircleIcon, ArrowDownTrayIcon, XMarkIcon, FunnelIcon, ArrowTopRightOnSquareIcon } from '@heroicons/react/24/outline';
import { CheckCircleIcon } from '@heroicons/react/24/solid';

// SchoolCard component - Compact high-density design
function SchoolCard({ 
  school, 
  expanded, 
  onExpand, 
  onViewDetails,
  onViewInvoices,
  brandColors,
  formatCurrency,
  formatPercent,
  getHealthStatusColor,
  getHealthStatusIcon,
  paymentMethodInfo,
  labelColors = {},
  navigate,
  isDormantView = false,
}) {
  const marginPercent = school.totalMarginPercent || 0;
  const marginTone = marginPercent >= 20 ? 'success' : marginPercent >= 10 ? 'warning' : 'danger';
  const healthTone = school.healthStatus === 'healthy' ? 'success' : 
                     school.healthStatus === 'needs_attention' ? 'warning' : 
                     school.healthStatus === 'unhealthy' ? 'danger' : 'default';

  // Determine which metrics trigger the health status
  const determineProblematicMetrics = () => {
    const problems = {
      margin: false,
      unpaid: false,
      late: false,
      noRevenue: false,
    };
    
    if (school.healthStatus === 'healthy') {
      return problems; // No problems if healthy
    }
    
    const unpaidAmount = school.invoices?.unpaidAmount || 0;
    const lateCount = school.invoices?.lateCount || 0;
    const lateAmount = school.invoices?.lateAmount || 0;
    const maxDaysOutstandingUnpaid = school.invoices?.maxDaysOutstandingUnpaid || 0;
    const totalRevenue = school.totalRevenue || 0;
    const totalLessons = school.totalLessons || 0;
    const hasRevenueData = totalRevenue > 0;
    const hasRecentActivity = totalLessons > 0;
    
    if (school.healthStatus === 'unhealthy') {
      // Unhealthy triggers:
      // - Late invoices (over 30 days old)
      if (lateCount > 0 || lateAmount > 0 || maxDaysOutstandingUnpaid > 30) {
        problems.late = true;
        // If unpaid invoices are over 30 days old, highlight unpaid chip
        if (maxDaysOutstandingUnpaid > 30 && unpaidAmount > 0) {
          problems.unpaid = true;
        }
      }
      // - Low margin (< 10%)
      if (hasRevenueData && marginPercent < 10) {
        problems.margin = true;
      }
    } else if (school.healthStatus === 'needs_attention') {
      // Needs attention triggers:
      // - Margin 10-20% (with revenue data)
      if (hasRevenueData && marginPercent >= 10 && marginPercent <= 20) {
        problems.margin = true;
      }
      // - Has activity but no revenue data
      // Note: Unpaid invoices under 30 days old do NOT trigger needs_attention
      if (hasRecentActivity && !hasRevenueData) {
        problems.noRevenue = true;
      }
    }
    
    return problems;
  };
  
  const problematicMetrics = determineProblematicMetrics();

  const handleCardClick = (e) => {
    // Don't navigate if clicking on buttons, margin chip link, or invoice chip links
    if (e.target.closest('button') || 
        e.target.closest('[data-margin-link]') || 
        e.target.closest('[data-invoice-link]')) {
      return;
    }
    onViewDetails();
  };

  const handleMarginClick = (e) => {
    e.stopPropagation(); // Prevent card click
    navigate('/school-dashboard/pricing-models');
  };

  const handleInvoiceClick = (e, schoolId) => {
    e.stopPropagation(); // Prevent card click
    navigate(`/school-dashboard/school/${schoolId}?tab=invoices`);
  };

  // Format metadata line
  const metadataParts = [];
  if (school.email) metadataParts.push(school.email);
  if (school.totalLessons > 0) metadataParts.push(`${school.totalLessons} lessons`);
  if (school.totalEnrollment > 0) metadataParts.push(`${school.totalEnrollment} students`);
  const metadataLine = metadataParts.join(' • ');

  // Billing model chips (schools can be mixed: monthly + term + per lesson)
  const bm = school.billingModelBreakdown || {};
  const hasMultipleModels =
    (bm.invoice_school_paid ? 1 : 0) +
      (bm.monthly_billing ? 1 : 0) +
      (bm.term_billing ? 1 : 0) +
      (bm.per_lesson ? 1 : 0) >
    1;
  const billingChips = [
    { key: 'invoice_school_paid', label: 'School Invoice', count: bm.invoice_school_paid || 0, color: brandColors.navy },
    { key: 'monthly_billing', label: 'Monthly Billing', count: bm.monthly_billing || 0, color: brandColors.green },
    { key: 'term_billing', label: 'Term Billing', count: bm.term_billing || 0, color: brandColors.purple },
    { key: 'per_lesson', label: 'Per Lesson', count: bm.per_lesson || 0, color: brandColors.cyan },
  ].filter((c) => c.count > 0);

  return (
    <Card
      onClick={handleCardClick}
      sx={{
        borderRadius: '12px',
        border: '1px solid',
        borderColor: 'grey.200',
        boxShadow: '0 1px 3px 0 rgba(0, 0, 0, 0.1)',
        transition: 'all 0.2s',
        cursor: 'pointer',
        '&:hover': {
          boxShadow: '0 4px 6px -1px rgba(0, 0, 0, 0.1), 0 2px 4px -1px rgba(0, 0, 0, 0.06)',
          bgcolor: 'rgba(248, 250, 252, 0.4)', // gray-50/40
        },
      }}
    >
      <CardContent sx={{ p: 2, '&:last-child': { pb: 2 } }}>
        {/* Row 1: School name + badges */}
        <Box 
          display="flex" 
          alignItems="center" 
          justifyContent="space-between"
          sx={{ mb: 0.5 }}
        >
          <Typography 
            variant="h6" 
            sx={{ 
              fontSize: '1.125rem',
              fontWeight: 600,
              overflow: 'hidden',
              textOverflow: 'ellipsis',
              whiteSpace: 'nowrap',
              flex: 1,
              minWidth: 0,
              mr: 1,
            }}
          >
            {school.name}
          </Typography>
          <Box 
            display="flex" 
            alignItems="center" 
            gap={1} 
            flexShrink={0}
            sx={{ pr: 2 }}
          >
            {/* Region badge */}
            {school.schoolLabel && (
              <Chip
                label={school.schoolLabel}
                size="small"
                sx={{
                  bgcolor: labelColors[school.schoolLabel] || 'grey.100',
                  color: labelColors[school.schoolLabel] ? 'white' : 'text.primary',
                  fontWeight: 500,
                  fontSize: '0.7rem',
                  height: '20px',
                }}
              />
            )}
            {/* Health badge - only show for active schools */}
            {!isDormantView && (
              <Chip
                icon={getHealthStatusIcon(school.healthStatus)}
                label={school.healthStatus.replace('_', ' ')}
                size="small"
                sx={{
                  bgcolor: getHealthStatusColor(school.healthStatus),
                  color: 'white',
                  fontWeight: 500,
                  fontSize: '0.7rem',
                  height: '20px',
                  '& .MuiChip-icon': { color: 'white', fontSize: '0.875rem' }
                }}
              />
            )}
          </Box>
        </Box>

        {/* Row 2: Metadata line */}
        {metadataLine && (
          <Typography 
            variant="caption" 
            sx={{ 
              fontSize: '0.8125rem',
              color: 'text.secondary',
              display: 'block',
              overflow: 'hidden',
              textOverflow: 'ellipsis',
              whiteSpace: 'nowrap',
              mt: 0.5,
              mb: 0.5,
            }}
          >
            {metadataLine}
          </Typography>
        )}

        {/* Divider between metadata and financial block */}
        <Box 
          sx={{ 
            height: '1px',
            bgcolor: 'grey.100',
            my: 0.75,
          }}
        />

        {/* Financial + Payment metrics container */}
        <Box 
          sx={{ 
            mt: 0.75,
            display: 'flex',
            flexDirection: 'column',
            gap: 1.5,
          }}
        >
          {/* Row 3: Financial metrics */}
          <Box 
            sx={{ 
              display: 'flex',
              justifyContent: 'space-between',
              alignItems: 'flex-start',
              gap: 1.5,
              fontSize: '0.875rem',
            }}
          >
            <Box
              sx={{
                display: 'flex',
                flexWrap: 'wrap',
                gap: 1.5,
                flex: '1 1 auto',
                minWidth: 0,
              }}
            >
              <MetricChip 
                label="Revenue" 
                value={formatCurrency(school.totalRevenue || 0)} 
                tone="default"
              />
              <MetricChip 
                label="Cost" 
                value={formatCurrency(school.totalTutorCost || 0)} 
                tone="default"
              />
              <Box
                data-margin-link={problematicMetrics.margin ? 'true' : undefined}
                onClick={problematicMetrics.margin ? handleMarginClick : undefined}
                sx={{
                  position: 'relative',
                  display: 'inline-block',
                  ...(problematicMetrics.margin && {
                    '@keyframes highlightPulse': {
                      '0%, 100%': {
                        transform: 'scale(1)',
                        opacity: 1,
                      },
                      '50%': {
                        transform: 'scale(1.05)',
                        opacity: 0.9,
                      },
                    },
                    animation: 'highlightPulse 1.5s ease-in-out infinite',
                    cursor: 'pointer',
                    '&:hover': {
                      '& > *': {
                        opacity: 0.9,
                      },
                    },
                  }),
                }}
              >
                <MetricChip 
                  label="Margin" 
                  value={`${formatCurrency(school.totalMargin || 0)} (${formatPercent(marginPercent)})`}
                  tone={marginTone}
                  sx={problematicMetrics.margin ? {
                    border: '3px solid',
                    borderColor: school.healthStatus === 'unhealthy' ? brandColors.pink : brandColors.orange,
                    boxShadow: `0 0 0 4px ${school.healthStatus === 'unhealthy' ? 'rgba(218, 46, 114, 0.3)' : 'rgba(247, 154, 48, 0.3)'}`,
                    fontWeight: 700,
                    transform: 'scale(1.02)',
                    transition: 'all 0.2s',
                    '&:hover': {
                      transform: 'scale(1.05)',
                      boxShadow: `0 0 0 6px ${school.healthStatus === 'unhealthy' ? 'rgba(218, 46, 114, 0.4)' : 'rgba(247, 154, 48, 0.4)'}`,
                    },
                  } : {}}
                />
              </Box>
              <MetricChip 
                label="Enrollment" 
                value={`${school.totalEnrollment || 0} students`}
                tone="default"
              />
              {problematicMetrics.noRevenue && (
                <Chip
                  label="No Revenue Data"
                  size="small"
                  sx={{
                    bgcolor: brandColors.orange,
                    color: 'white',
                    fontWeight: 600,
                    fontSize: '0.75rem',
                    height: '24px',
                    animation: 'pulse 2s ease-in-out infinite',
                    '@keyframes pulse': {
                      '0%, 100%': {
                        opacity: 1,
                      },
                      '50%': {
                        opacity: 0.7,
                      },
                    },
                  }}
                />
              )}
            </Box>

            {/* Payment model chips (top-right of the metrics block) */}
            {billingChips.length > 0 && (
              <Box sx={{ display: 'flex', flexWrap: 'wrap', gap: 0.75, justifyContent: 'flex-end', flexShrink: 0 }}>
                {/* Show "Mixed" tag if school has multiple billing models */}
                {school.billingModel === 'mixed' || hasMultipleModels ? (
                  <Chip
                    label="Mixed"
                    size="small"
                    sx={{
                      bgcolor: brandColors.orange,
                      color: 'white',
                      fontWeight: 600,
                      fontSize: '0.7rem',
                      height: '20px',
                    }}
                  />
                ) : (
                  // Show individual chips if not mixed
                  billingChips.map((c) => (
                    <Chip
                      key={c.key}
                      label={c.label}
                      size="small"
                      sx={{
                        bgcolor: c.color,
                        color: 'white',
                        fontWeight: 600,
                        fontSize: '0.7rem',
                        height: '20px',
                      }}
                    />
                  ))
                )}
              </Box>
            )}
          </Box>

          {/* Row 4: Payment metrics */}
          <Box 
            sx={{ 
              display: 'flex', 
              flexWrap: 'wrap', 
              gap: 1.5,
              mt: 0,
              mb: 0,
              fontSize: '0.875rem',
            }}
          >
            <MetricChip 
              label="Paid" 
              value={formatCurrency(school.invoices?.paidAmount || 0)} 
              tone="success"
            />
            <Box
              data-invoice-link={problematicMetrics.unpaid ? 'true' : undefined}
              onClick={problematicMetrics.unpaid ? (e) => handleInvoiceClick(e, school.clientId) : undefined}
              sx={{
                position: 'relative',
                display: 'inline-block',
                ...(problematicMetrics.unpaid && {
                  '@keyframes highlightPulse': {
                    '0%, 100%': {
                      transform: 'scale(1)',
                      opacity: 1,
                    },
                    '50%': {
                      transform: 'scale(1.05)',
                      opacity: 0.9,
                    },
                  },
                  animation: 'highlightPulse 1.5s ease-in-out infinite',
                  cursor: 'pointer',
                  '&:hover': {
                    '& > *': {
                      opacity: 0.9,
                    },
                  },
                }),
              }}
            >
              <MetricChip 
                label="Unpaid" 
                value={formatCurrency(school.invoices?.unpaidAmount || 0)} 
                tone="warning"
                sx={problematicMetrics.unpaid ? {
                  border: '3px solid',
                  borderColor: school.healthStatus === 'unhealthy' ? brandColors.pink : brandColors.orange,
                  boxShadow: `0 0 0 4px ${school.healthStatus === 'unhealthy' ? 'rgba(218, 46, 114, 0.3)' : 'rgba(247, 154, 48, 0.3)'}`,
                  fontWeight: 700,
                  transform: 'scale(1.02)',
                  transition: 'all 0.2s',
                  '&:hover': {
                    transform: 'scale(1.05)',
                    boxShadow: `0 0 0 6px ${school.healthStatus === 'unhealthy' ? 'rgba(218, 46, 114, 0.4)' : 'rgba(247, 154, 48, 0.4)'}`,
                  },
                } : {}}
              />
            </Box>
            <Box
              data-invoice-link={problematicMetrics.late ? 'true' : undefined}
              onClick={problematicMetrics.late ? (e) => handleInvoiceClick(e, school.clientId) : undefined}
              sx={{
                position: 'relative',
                display: 'inline-block',
                ...(problematicMetrics.late && {
                  '@keyframes highlightPulse': {
                    '0%, 100%': {
                      transform: 'scale(1)',
                      opacity: 1,
                    },
                    '50%': {
                      transform: 'scale(1.05)',
                      opacity: 0.9,
                    },
                  },
                  animation: 'highlightPulse 1.5s ease-in-out infinite',
                  cursor: 'pointer',
                  '&:hover': {
                    '& > *': {
                      opacity: 0.9,
                    },
                  },
                }),
              }}
            >
              <MetricChip 
                label="Late" 
                value={formatCurrency(school.invoices?.lateAmount || 0)} 
                tone="danger"
                sx={problematicMetrics.late ? {
                  border: '3px solid',
                  borderColor: brandColors.pink,
                  boxShadow: '0 0 0 4px rgba(218, 46, 114, 0.3)',
                  fontWeight: 700,
                  transform: 'scale(1.02)',
                  transition: 'all 0.2s',
                  '&:hover': {
                    transform: 'scale(1.05)',
                    boxShadow: '0 0 0 6px rgba(218, 46, 114, 0.4)',
                  },
                } : {}}
              />
            </Box>
          </Box>
        </Box>
      </CardContent>
    </Card>
  );
}

export default function SchoolDashboardOverviewAndSchools() {
  const toast = useToast();
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();
  const location = useLocation();
  const context = useOutletContext();
  
  // Detect if we're on the new /schools/* routes (Operations Hub)
  const isOperationsHubRoute = location.pathname.startsWith('/schools/');
  const {
    summary,
    allLocationsSummary,
    locationTab,
    searchQuery,
    termFilter,
    healthFilter: contextHealthFilter,
    paymentFilter,
    paymentMethodFilter,
    allTerms,
    schools: contextSchools = [],
    activeSchools: contextActiveSchools = [],
    loading: contextLoading,
    error: contextError,
    refetch
  } = context || {};

  // Local health filter state (can override context filter when clicking cards)
  const [localHealthFilter, setLocalHealthFilter] = useState(contextHealthFilter || 'all');
  const [exporting, setExporting] = useState(false);
  const [expandedSchool, setExpandedSchool] = useState(null);
  const [sortConfig, setSortConfig] = useState({ key: 'revenue', direction: 'desc' }); // Default sort by revenue desc
  const [schoolPaymentMethods, setSchoolPaymentMethods] = useState({});
  const [labelColors, setLabelColors] = useState({});
  
  // Dormant view filters and modals
  const [dormantRevenueFilter, setDormantRevenueFilter] = useState(false);
  const [dormantModalOpen, setDormantModalOpen] = useState(false);
  const [dormantModalType, setDormantModalType] = useState(null); // 'revenue' or 'lessons'
  
  // Use schools from context instead of fetching
  const schools = contextSchools;
  const activeSchools = contextActiveSchools;
  
  // Determine if we're viewing dormant schools
  const isDormantView = locationTab === 'dormant';
  
  // Pagination for dormant schools - default to showing all paginated when on dormant tab
  const [dormantPage, setDormantPage] = useState(1);
  const dormantPageSize = 50;
  
  // When on dormant tab, always show paginated results (showAllDormant is always true for dormant view)
  const showAllDormant = isDormantView;
  
  // Reset filters and pagination when switching to dormant tab or clicking "Total Dormant Schools"
  useEffect(() => {
    if (isDormantView) {
      setDormantPage(1);
    }
  }, [isDormantView]);
  
  // For dormant view, use all schools (which will be filtered to inactive by backend)
  // For active views, use activeSchools
  const schoolsToDisplay = isDormantView ? schools : activeSchools;
  
  // Calculate dormant school metrics
  const totalHistoricalRevenue = useMemo(() => {
    if (!isDormantView) return 0;
    return schools.reduce((sum, s) => sum + (s.totalRevenue || 0), 0);
  }, [schools, isDormantView]);
  
  const totalPastLessons = useMemo(() => {
    if (!isDormantView) return 0;
    return schools.reduce((sum, s) => sum + (s.totalLessons || 0), 0);
  }, [schools, isDormantView]);
  
  const totalPastJobs = useMemo(() => {
    if (!isDormantView) return 0;
    return schools.reduce((sum, s) => sum + (s.jobs?.length || 0), 0);
  }, [schools, isDormantView]);
  
  const schoolsWithRevenue = useMemo(() => {
    if (!isDormantView) return 0;
    return schools.filter(s => (s.totalRevenue || 0) > 0).length;
  }, [schools, isDormantView]);
  
  // Aliases for consistency with component usage
  const totalDormantRevenue = totalHistoricalRevenue;
  const totalDormantLessons = totalPastLessons;
  
  // Fetch label colors
  useEffect(() => {
    const fetchLabelColors = async () => {
      try {
        const response = await axios.get('/api/crm/labels', {
          withCredentials: true,
        });
        
        if (response.data && response.data.labels) {
          const colorMap = {};
          response.data.labels.forEach(label => {
            if (label.name && label.colour) {
              colorMap[label.name] = label.colour;
            }
          });
          setLabelColors(colorMap);
        }
      } catch (err) {
        console.error('Error fetching label colors:', err);
      }
    };
    
    fetchLabelColors();
  }, []);
  
  // Use local health filter, fallback to context
  const healthFilter = localHealthFilter || contextHealthFilter || 'all';
  
  // Sync local health filter with context when context changes (but not when we set it locally)
  useEffect(() => {
    if (contextHealthFilter && !searchParams.get('health')) {
      setLocalHealthFilter(contextHealthFilter);
    }
  }, [contextHealthFilter]);

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

  // No need to fetch - data comes from context


  const formatPercent = (value) => {
    return `${value >= 0 ? '+' : ''}${value.toFixed(1)}%`;
  };

  const getHealthStatusColor = (status) => {
    switch (status) {
      case 'healthy':
        return brandColors.green;
      case 'unhealthy':
        return brandColors.pink;
      case 'needs_attention':
        return brandColors.orange;
      default:
        return '#9e9e9e';
    }
  };

  const getHealthStatusIcon = (status) => {
    switch (status) {
      case 'healthy':
        return <CheckCircleIcon className="h-4 w-4" />;
      case 'unhealthy':
        return <ExclamationCircleIcon className="h-4 w-4" />;
      case 'needs_attention':
        return <ExclamationTriangleIcon className="h-4 w-4" />;
      default:
        return null;
    }
  };

  // Handle health card clicks - update filter and URL params
  const handleHealthCardClick = (filterValue) => {
    setLocalHealthFilter(filterValue);
    const params = new URLSearchParams(searchParams);
    if (filterValue === 'all') {
      params.delete('health');
    } else {
      params.set('health', filterValue);
    }
    setSearchParams(params, { replace: true });
  };
  
  // Handle dormant card clicks
  const handleDormantCardClick = (type) => {
    if (type === 'schoolsWithRevenue') {
      // Toggle filter to show only schools with revenue
      const newFilterState = !dormantRevenueFilter;
      setDormantRevenueFilter(newFilterState);
      // Reset to page 1 when toggling filter
      setDormantPage(1);
    } else if (type === 'revenue' || type === 'lessons') {
      // Open modal with breakdown
      setDormantModalType(type);
      setDormantModalOpen(true);
    } else if (type === 'showAllDormant') {
      // Reset filters and show all dormant schools
      setDormantRevenueFilter(false);
      setDormantPage(1);
    }
  };
  
  // Handle filter icon click for health cards
  const handleFilterIconClick = (filterValue, e) => {
    e.stopPropagation();
    handleHealthCardClick(filterValue);
  };
  
  // Prepare modal data for revenue or lessons breakdown
  const getDormantModalData = () => {
    if (!dormantModalType) return [];
    
    const data = schools
      .filter(school => {
        if (dormantModalType === 'revenue') {
          return (school.totalRevenue || 0) > 0;
        } else if (dormantModalType === 'lessons') {
          return (school.totalLessons || 0) > 0;
        }
        return true;
      })
      .map(school => ({
        schoolName: school.name,
        schoolEmail: school.email,
        schoolLocation: school.location,
        revenue: school.totalRevenue || 0,
        lessons: school.totalLessons || 0,
        jobs: school.jobs?.length || 0,
        students: school.totalStudents || 0,
      }))
      .sort((a, b) => {
        if (dormantModalType === 'revenue') {
          return b.revenue - a.revenue;
        } else {
          return b.lessons - a.lessons;
        }
      });
    
    return data;
  };


  // Filter and sort schools using context filters + local health filter
  const filterAndSortSchools = (schoolList) => {
    let filtered = schoolList.filter(school => {
      // Search filter
      if (searchQuery) {
        const query = searchQuery.toLowerCase();
        const matchesSearch = 
          school.name.toLowerCase().includes(query) ||
          school.email?.toLowerCase().includes(query) ||
          school.location?.toLowerCase().includes(query) ||
          (school.jobs && school.jobs.some(job => job.serviceName?.toLowerCase().includes(query)));
        if (!matchesSearch) return false;
      }

      // Term filter
      if (termFilter) {
        const matchesTerm = school.jobs && school.jobs.some(job => 
          job.termSeason?.toLowerCase().includes(termFilter.toLowerCase())
        );
        if (!matchesTerm) return false;
      }

      // Health filter (use local state)
      if (healthFilter !== 'all') {
        if (school.healthStatus !== healthFilter) return false;
      }

      // Payment filter
      if (paymentFilter !== 'all') {
        if (paymentFilter === 'unpaid' && (!school.invoices || school.invoices.unpaidCount === 0)) return false;
        if (paymentFilter === 'late' && (!school.invoices || school.invoices.lateCount === 0)) return false;
        if (paymentFilter === 'paid' && school.invoices && school.invoices.unpaidCount > 0) return false;
      }

      // Payment method filter
      if (paymentMethodFilter !== 'all') {
        const paymentInfo = schoolPaymentMethods[school.clientId];
        if (paymentMethodFilter === 'subscription') {
          if (!paymentInfo || !paymentInfo.hasSubscription) return false;
        } else if (paymentMethodFilter === 'per_lesson') {
          if (paymentInfo && paymentInfo.hasSubscription) return false;
        }
      }
      
      // Dormant revenue filter (only applies in dormant view)
      if (isDormantView && dormantRevenueFilter) {
        if ((school.totalRevenue || 0) === 0) return false;
      }

      return true;
    });

    // Default sort: revenue descending, then by health status (for active schools)
    // For dormant schools, sort by revenue only
    filtered.sort((a, b) => {
      // First sort by revenue (descending)
      const aRevenue = parseFloat(a.totalRevenue) || 0;
      const bRevenue = parseFloat(b.totalRevenue) || 0;
      if (aRevenue !== bRevenue) {
        return bRevenue - aRevenue;
      }
      
      // For active schools, then sort by health status (healthy > needs_attention > unhealthy)
      if (!isDormantView) {
        const healthOrder = { 'healthy': 0, 'needs_attention': 1, 'unhealthy': 2 };
        const aHealth = healthOrder[a.healthStatus] ?? 3;
        const bHealth = healthOrder[b.healthStatus] ?? 3;
        return aHealth - bHealth;
      }
      
      // For dormant schools, sort by name if revenue is equal
      return (a.name || '').localeCompare(b.name || '');
    });

    return filtered;
  };

  const displayedSchools = useMemo(() => {
    const filtered = filterAndSortSchools(schoolsToDisplay);
    // Deduplicate schools by clientId (keep first occurrence)
    const seen = new Set();
    const unique = filtered.filter(school => {
      if (seen.has(school.clientId)) {
        console.warn(`Duplicate school found: ${school.clientId} - ${school.name}`);
        return false;
      }
      seen.add(school.clientId);
      return true;
    });
    
    // Apply pagination for dormant schools when showing all
    if (isDormantView && showAllDormant) {
      const startIndex = (dormantPage - 1) * dormantPageSize;
      const endIndex = startIndex + dormantPageSize;
      return unique.slice(startIndex, endIndex);
    }
    
    // If not showing all dormant, return limited results (or all if not dormant view)
    return unique;
  }, [schoolsToDisplay, searchQuery, termFilter, localHealthFilter, paymentFilter, paymentMethodFilter, isDormantView, dormantRevenueFilter, schoolPaymentMethods, showAllDormant, dormantPage]);
  
  // Calculate total pages for dormant schools
  const totalDormantSchools = useMemo(() => {
    if (!isDormantView) return 0;
    const filtered = filterAndSortSchools(schoolsToDisplay);
    const seen = new Set();
    const unique = filtered.filter(school => {
      if (seen.has(school.clientId)) return false;
      seen.add(school.clientId);
      return true;
    });
    return unique.length;
  }, [schoolsToDisplay, searchQuery, termFilter, localHealthFilter, paymentFilter, paymentMethodFilter, isDormantView, dormantRevenueFilter, schoolPaymentMethods]);
  
  const totalDormantPages = Math.ceil(totalDormantSchools / dormantPageSize);

  // Calculate health metrics
  const activeSchoolsCount = activeSchools.length;
  const healthySchoolsCount = activeSchools.filter(s => s.healthStatus === 'healthy').length;
  const needsAttentionSchoolsCount = activeSchools.filter(s => s.healthStatus === 'needs_attention').length;
  const unhealthySchoolsCount = activeSchools.filter(s => s.healthStatus === 'unhealthy').length;

  // Calculate financial metrics from displayed schools (current filter context)

  // Export CSV function
  const exportAllLessonsToCSV = async () => {
    try {
      setExporting(true);
      const axiosInstance = axios.create({
        withCredentials: true,
      });

      const allLessons = [];
      
      for (const school of schools) {
        if (!school.jobs || school.jobs.length === 0) continue;
        
        for (const job of school.jobs) {
          if (!job.serviceId) continue;
          
          try {
            const response = await axiosInstance.get(`/api/schools/service/${job.serviceId}/lessons`);
            const lessonDetails = response.data;
            
            if (lessonDetails?.lessons?.length > 0) {
              lessonDetails.lessons.forEach(lesson => {
                allLessons.push({
                  ...lesson,
                  schoolName: school.name
                });
              });
            }
          } catch (err) {
            console.warn(`Failed to fetch lessons for service ${job.serviceId}:`, err);
          }
        }
      }

      if (allLessons.length === 0) {
        toast.warn('No lessons found to export.');
        return;
      }

      const headers = [
        'School',
        'Month',
        'Date',
        'Revenue',
        'Tutor Cost',
        'Margin',
        'Notes for TC'
      ];

      const rows = allLessons.map(lesson => {
        const startDate = lesson.start ? new Date(lesson.start) : null;
        const monthAbbr = startDate 
          ? startDate.toLocaleDateString('en-US', { month: 'short' })
          : '';
        const year = startDate 
          ? String(startDate.getFullYear()).slice(-2)
          : '';
        const month = startDate ? `${monthAbbr}-${year}` : '';
        const date = startDate 
          ? `${String(startDate.getMonth() + 1).padStart(2, '0')}/${String(startDate.getDate()).padStart(2, '0')}/${String(startDate.getFullYear()).slice(-2)}`
          : '';
        const revenue = lesson.revenue 
          ? `$ ${lesson.revenue.toFixed(2)}`
          : '$ -';
        const tutorCost = lesson.tutorCost && lesson.tutorCost > 0
          ? `$ ${lesson.tutorCost.toFixed(2)}`
          : '$ -';
        let margin;
        if (lesson.margin > 0) {
          margin = `$ ${lesson.margin.toFixed(2)}`;
        } else if (lesson.margin < 0) {
          margin = `$ (${Math.abs(lesson.margin).toFixed(2)})`;
        } else {
          margin = '$ -';
        }
        const notes = '';

        return [
          lesson.schoolName || '',
          month,
          date,
          revenue,
          tutorCost,
          margin,
          notes
        ];
      });

      const csvContent = [
        headers.join(','),
        ...rows.map(row => row.map(cell => {
          const cellStr = String(cell || '');
          if (cellStr.includes(',') || cellStr.includes('"') || cellStr.includes('\n')) {
            return `"${cellStr.replace(/"/g, '""')}"`;
          }
          return cellStr;
        }).join(','))
      ].join('\n');

      const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
      const link = document.createElement('a');
      const url = URL.createObjectURL(blob);
      link.setAttribute('href', url);
      const dateStr = new Date().toISOString().split('T')[0];
      link.setAttribute('download', `PNL_All_Schools_${dateStr}.csv`);
      link.style.visibility = 'hidden';
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
    } catch (err) {
      console.error('Error exporting lessons:', err);
      toast.error('Failed to export lessons. Please try again.');
    } finally {
      setExporting(false);
    }
  };

  // Show loading if context is not available yet, or if layout is loading
  if (!context || contextLoading) {
    return (
      <Box display="flex" justifyContent="center" alignItems="center" minHeight="400px">
        <CircularProgress sx={{ color: brandColors.purple }} />
      </Box>
    );
  }

  if (contextError) {
    return (
      <Alert severity="error" sx={{ mb: 2 }}>
        {contextError}
      </Alert>
    );
  }

  return (
    <Box>
      {/* Row 1: Health Cards (for active schools) or Dormant Metrics (for dormant schools) */}
      {!isDormantView ? (
        isOperationsHubRoute ? (
          <Card sx={{ bgcolor: 'background.paper', boxShadow: 1, mb: 3, borderRadius: 2 }}>
            <CardContent sx={{ p: { xs: 2, sm: 3 } }}>
              <Grid container spacing={{ xs: 1.5, sm: 2 }}>
                <Grid item xs={6} sm={6} md={3}>
                  <KpiCard
                    title="Active Schools"
                    value={activeSchoolsCount.toLocaleString()}
                    subtitle="Total active schools"
                    tone="default"
                    onClick={() => handleHealthCardClick('all')}
                    filterIcon={<FunnelIcon className="h-4 w-4" />}
                    onFilterClick={() => handleHealthCardClick('all')}
                  />
                </Grid>
                <Grid item xs={6} sm={6} md={3}>
                  <KpiCard
                    title="Healthy Schools"
                    value={healthySchoolsCount.toLocaleString()}
                    subtitle="Health status: Healthy"
                    helperText="Margin > 20%, no late invoices, unpaid < $500, has enrollment"
                    tone="success"
                    onClick={() => handleHealthCardClick('healthy')}
                    filterIcon={<FunnelIcon className="h-4 w-4" />}
                    onFilterClick={() => handleHealthCardClick('healthy')}
                  />
                </Grid>
                <Grid item xs={6} sm={6} md={3}>
                  <KpiCard
                    title="Needs Attention"
                    value={needsAttentionSchoolsCount.toLocaleString()}
                    subtitle="Health status: Needs attention"
                    helperText="Margin 10-20% or has activity but no revenue data"
                    tone="warning"
                    onClick={() => handleHealthCardClick('needs_attention')}
                    filterIcon={<FunnelIcon className="h-4 w-4" />}
                    onFilterClick={() => handleHealthCardClick('needs_attention')}
                  />
                </Grid>
                <Grid item xs={6} sm={6} md={3}>
                  <KpiCard
                    title="Unhealthy"
                    value={unhealthySchoolsCount.toLocaleString()}
                    subtitle="Health status: Unhealthy"
                    helperText="Late invoices (>30 days), unpaid >30 days old, or margin < 10%"
                    tone="danger"
                    onClick={() => handleHealthCardClick('unhealthy')}
                    filterIcon={<FunnelIcon className="h-4 w-4" />}
                    onFilterClick={() => handleHealthCardClick('unhealthy')}
                  />
                </Grid>
              </Grid>
            </CardContent>
          </Card>
        ) : (
          <Grid container spacing={{ xs: 1.5, sm: 2 }} sx={{ mb: { xs: 2, sm: 3 } }}>
          <Grid item xs={6} sm={6} md={3}>
            <KpiCard
              title="Active Schools"
              value={activeSchoolsCount.toLocaleString()}
              subtitle="Total active schools"
              tone="default"
              onClick={() => handleHealthCardClick('all')}
              filterIcon={<FunnelIcon className="h-4 w-4" />}
              onFilterClick={() => handleHealthCardClick('all')}
            />
          </Grid>
          <Grid item xs={6} sm={6} md={3}>
            <KpiCard
              title="Healthy Schools"
              value={healthySchoolsCount.toLocaleString()}
              subtitle="Health status: Healthy"
              helperText="Margin > 20%, no late invoices, unpaid < $500, has enrollment"
              tone="success"
              onClick={() => handleHealthCardClick('healthy')}
              filterIcon={<FunnelIcon className="h-4 w-4" />}
              onFilterClick={() => handleHealthCardClick('healthy')}
            />
          </Grid>
          <Grid item xs={6} sm={6} md={3}>
            <KpiCard
              title="Needs Attention"
              value={needsAttentionSchoolsCount.toLocaleString()}
              subtitle="Health status: Needs attention"
              helperText="Margin 10-20% or has activity but no revenue data"
              tone="warning"
              onClick={() => handleHealthCardClick('needs_attention')}
              filterIcon={<FunnelIcon className="h-4 w-4" />}
              onFilterClick={() => handleHealthCardClick('needs_attention')}
            />
          </Grid>
          <Grid item xs={6} sm={6} md={3}>
            <KpiCard
              title="Unhealthy"
              value={unhealthySchoolsCount.toLocaleString()}
              subtitle="Health status: Unhealthy"
              helperText="Late invoices (>30 days), unpaid >30 days old, or margin < 10%"
              tone="danger"
              onClick={() => handleHealthCardClick('unhealthy')}
              filterIcon={<FunnelIcon className="h-4 w-4" />}
              onFilterClick={() => handleHealthCardClick('unhealthy')}
            />
            </Grid>
          </Grid>
        )
      ) : (
        isOperationsHubRoute ? (
          <Card sx={{ bgcolor: 'background.paper', boxShadow: 1, mb: 3, borderRadius: 2 }}>
            <CardContent sx={{ p: { xs: 2, sm: 3 } }}>
              <Grid container spacing={{ xs: 1.5, sm: 2 }}>
                <Grid item xs={6} sm={6} md={3}>
                  <KpiCard
                    title="Total Dormant Schools"
                    value={schools.length.toLocaleString()}
                    subtitle="Schools with no recent activity"
                    tone={dormantRevenueFilter ? 'default' : 'default'}
                    onClick={() => handleDormantCardClick('showAllDormant')}
                    filterIcon={<FunnelIcon className="h-4 w-4" />}
                    onFilterClick={() => handleDormantCardClick('showAllDormant')}
                  />
                </Grid>
                <Grid item xs={6} sm={6} md={3}>
                  <KpiCard
                    title="Schools with Revenue"
                    value={schoolsWithRevenue.toLocaleString()}
                    subtitle="Previously generated revenue"
                    helperText="Schools that had revenue in the past"
                    tone={dormantRevenueFilter ? 'success' : 'success'}
                    onClick={() => handleDormantCardClick('schoolsWithRevenue')}
                    filterIcon={<FunnelIcon className="h-4 w-4" />}
                    onFilterClick={() => handleDormantCardClick('schoolsWithRevenue')}
                  />
                </Grid>
                <Grid item xs={6} sm={6} md={3}>
                  <KpiCard
                    title="Total Revenue"
                    value={formatCurrency(totalDormantRevenue)}
                    subtitle="From dormant schools"
                    helperText="Total revenue from all dormant schools"
                    tone="default"
                    onClick={() => handleDormantCardClick('revenue')}
                    filterIcon={<FunnelIcon className="h-4 w-4" />}
                    onFilterClick={() => handleDormantCardClick('revenue')}
                  />
                </Grid>
                <Grid item xs={6} sm={6} md={3}>
                  <KpiCard
                    title="Total Lessons"
                    value={totalDormantLessons.toLocaleString()}
                    subtitle="From dormant schools"
                    helperText="Total lessons from all dormant schools"
                    tone="default"
                    onClick={() => handleDormantCardClick('lessons')}
                    filterIcon={<FunnelIcon className="h-4 w-4" />}
                    onFilterClick={() => handleDormantCardClick('lessons')}
                  />
                </Grid>
              </Grid>
            </CardContent>
          </Card>
        ) : (
          <Grid container spacing={{ xs: 1.5, sm: 2 }} sx={{ mb: { xs: 2, sm: 3 } }}>
          <Grid item xs={6} sm={6} md={3}>
            <KpiCard
              title="Total Dormant Schools"
              value={schools.length.toLocaleString()}
              subtitle="Schools with no recent activity"
              tone={dormantRevenueFilter ? 'default' : 'default'}
              onClick={() => handleDormantCardClick('showAllDormant')}
              filterIcon={<FunnelIcon className="h-4 w-4" />}
              onFilterClick={() => handleDormantCardClick('showAllDormant')}
            />
          </Grid>
          <Grid item xs={6} sm={6} md={3}>
            <KpiCard
              title="Schools with Revenue"
              value={schoolsWithRevenue.toLocaleString()}
              subtitle="Previously generated revenue"
              helperText="Schools that had revenue in the past"
              tone={dormantRevenueFilter ? 'success' : 'success'}
              onClick={() => handleDormantCardClick('schoolsWithRevenue')}
              filterIcon={<FunnelIcon className="h-4 w-4" />}
              onFilterClick={() => handleDormantCardClick('schoolsWithRevenue')}
            />
          </Grid>
          <Grid item xs={6} sm={6} md={3}>
            <KpiCard
              title="Total Historical Revenue"
              value={formatCurrency(totalHistoricalRevenue)}
              subtitle="All-time revenue from dormant schools"
              helperText="Total revenue generated before becoming dormant"
              tone="default"
              onClick={() => handleDormantCardClick('revenue')}
              modalIcon={<ArrowTopRightOnSquareIcon className="h-4 w-4" />}
            />
          </Grid>
          <Grid item xs={6} sm={6} md={3}>
            <KpiCard
              title="Total Past Lessons"
              value={totalPastLessons.toLocaleString()}
              subtitle="Lessons completed historically"
              helperText="Total lessons delivered before becoming dormant"
              tone="default"
              onClick={() => handleDormantCardClick('lessons')}
              modalIcon={<ArrowTopRightOnSquareIcon className="h-4 w-4" />}
            />
          </Grid>
        </Grid>
        )
      )}

      {/* Export Button and School List Section */}
      <Box sx={{ mb: 3 }}>
        <Box 
          display="flex" 
          alignItems="center" 
          justifyContent="space-between" 
          mb={2}
          sx={{
            ...(isOperationsHubRoute && {
              bgcolor: 'background.paper',
              p: { xs: 2, sm: 3 },
              borderRadius: 2,
              boxShadow: 1,
              border: '1px solid',
              borderColor: 'divider',
            })
          }}
        >
          <Box>
            <Typography variant="h6" fontWeight="bold" gutterBottom>
              {isDormantView ? (showAllDormant ? 'All Dormant Schools' : 'Dormant Schools') : 'Schools'}
            </Typography>
            <Typography 
              variant="body2" 
              color="textSecondary" 
              sx={{ 
                fontSize: '0.8125rem',
                color: isOperationsHubRoute ? '#000000' : undefined // Black text for Operations Hub routes
              }}
            >
              {isDormantView 
                ? dormantRevenueFilter
                  ? `Showing ${displayedSchools.length} of ${schoolsWithRevenue} schools with revenue (Page ${dormantPage} of ${Math.ceil(schoolsWithRevenue / dormantPageSize)})`
                  : `Showing ${displayedSchools.length} of ${totalDormantSchools} schools (Page ${dormantPage} of ${totalDormantPages})`
                : 'Sorted by: Health > Revenue (High → Low)'}
            </Typography>
          </Box>
          <Box display="flex" gap={1} alignItems="center">
            {isDormantView && dormantRevenueFilter && (
              <Tooltip title="Clear filter - Show all dormant schools">
                <IconButton
                  size="small"
                  onClick={() => {
                    setDormantRevenueFilter(false);
                    setDormantPage(1);
                  }}
                  sx={{
                    color: brandColors.purple,
                    '&:hover': {
                      bgcolor: `${brandColors.purple}10`,
                    },
                  }}
                >
                  <FunnelIcon className="h-5 w-5" />
                </IconButton>
              </Tooltip>
            )}
            <Tooltip title="Export All Lessons">
              <span>
                <IconButton
                  onClick={exportAllLessonsToCSV}
                  disabled={exporting || contextLoading || schools.length === 0}
                  size="small"
                  sx={{
                    color: brandColors.purple,
                    '&:hover': {
                      bgcolor: `${brandColors.purple}10`,
                    },
                    '&.Mui-disabled': {
                      color: 'text.disabled',
                    },
                  }}
                >
                  <ArrowDownTrayIcon className="h-5 w-5" />
                </IconButton>
              </span>
            </Tooltip>
          </Box>
        </Box>
        
        {/* Pagination for dormant schools - always show when on dormant tab */}
        {isDormantView && (
          <Box display="flex" justifyContent="center" mb={2}>
            <Pagination
              count={dormantRevenueFilter ? Math.ceil(schoolsWithRevenue / dormantPageSize) : totalDormantPages}
              page={dormantPage}
              onChange={(e, value) => setDormantPage(value)}
              color="primary"
              size="small"
              showFirstButton
              showLastButton
            />
          </Box>
        )}

        {displayedSchools.length === 0 ? (
          <Alert severity="info">No schools found matching your filters.</Alert>
        ) : (
          <Grid container spacing={{ xs: 1.5, sm: 2 }}>
            {displayedSchools.map((school, index) => (
              <Grid item xs={12} key={school.id ? `school-${school.id}` : school.clientId ? `client-${school.clientId}` : `school-${index}-${school.name}`}>
                <SchoolCard
                  school={school}
                  expanded={expandedSchool === school.clientId}
                  onExpand={() => setExpandedSchool(expandedSchool === school.clientId ? null : school.clientId)}
                  onViewDetails={() => navigate(`/school-dashboard/school/${school.clientId}`)}
                  onViewInvoices={() => navigate('/school-dashboard/invoice-fulfillment', { 
                    state: { clientId: school.clientId },
                    replace: false 
                  })}
                  brandColors={brandColors}
                  formatCurrency={formatCurrency}
                  formatPercent={formatPercent}
                  getHealthStatusColor={getHealthStatusColor}
                  getHealthStatusIcon={getHealthStatusIcon}
                  paymentMethodInfo={schoolPaymentMethods[school.clientId]}
                  labelColors={labelColors}
                  navigate={navigate}
                  isDormantView={isDormantView}
                />
              </Grid>
            ))}
          </Grid>
        )}
      </Box>

      {/* Dormant Breakdown Modal */}
      <Dialog
        open={dormantModalOpen}
        onClose={() => setDormantModalOpen(false)}
        maxWidth="md"
        fullWidth
      >
        <DialogTitle>
          <Box display="flex" justifyContent="space-between" alignItems="center">
            <Typography variant="h5">
              {dormantModalType === 'revenue' && 'Historical Revenue Breakdown'}
              {dormantModalType === 'lessons' && 'Past Lessons Breakdown'}
            </Typography>
            <IconButton onClick={() => setDormantModalOpen(false)} size="small">
              <XMarkIcon className="h-5 w-5" />
            </IconButton>
          </Box>
        </DialogTitle>
        <DialogContent>
          {getDormantModalData().length === 0 ? (
            <Alert severity="info">No data available.</Alert>
          ) : (
            <TableContainer component={Paper} variant="outlined" sx={{ mt: 2 }}>
              <Table size="small">
                <TableHead>
                  <TableRow>
                    <TableCell><strong>School Name</strong></TableCell>
                    <TableCell><strong>Location</strong></TableCell>
                    {dormantModalType === 'revenue' && (
                      <>
                        <TableCell align="right"><strong>Historical Revenue</strong></TableCell>
                        <TableCell align="right"><strong>Past Lessons</strong></TableCell>
                        <TableCell align="right"><strong>Past Jobs</strong></TableCell>
                      </>
                    )}
                    {dormantModalType === 'lessons' && (
                      <>
                        <TableCell align="right"><strong>Past Lessons</strong></TableCell>
                        <TableCell align="right"><strong>Historical Revenue</strong></TableCell>
                        <TableCell align="right"><strong>Students</strong></TableCell>
                      </>
                    )}
                  </TableRow>
                </TableHead>
                <TableBody>
                  {getDormantModalData().map((item, index) => (
                    <TableRow key={index} hover>
                      <TableCell>{item.schoolName}</TableCell>
                      <TableCell>{item.schoolLocation}</TableCell>
                      {dormantModalType === 'revenue' && (
                        <>
                          <TableCell align="right">{formatCurrency(item.revenue)}</TableCell>
                          <TableCell align="right">{item.lessons.toLocaleString()}</TableCell>
                          <TableCell align="right">{item.jobs.toLocaleString()}</TableCell>
                        </>
                      )}
                      {dormantModalType === 'lessons' && (
                        <>
                          <TableCell align="right">{item.lessons.toLocaleString()}</TableCell>
                          <TableCell align="right">{formatCurrency(item.revenue)}</TableCell>
                          <TableCell align="right">{item.students.toLocaleString()}</TableCell>
                        </>
                      )}
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </TableContainer>
          )}
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setDormantModalOpen(false)}>Close</Button>
        </DialogActions>
      </Dialog>

    </Box>
  );
}
