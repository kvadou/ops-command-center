import React, { useEffect, useState, useMemo } from "react";
import { useToast } from "../hooks/useToast";
import { formatCurrency } from '../utils/formatters';
import { useBookingFormData } from "../hooks/useBookingFormData";
import { useBookingFormFilters } from "../hooks/useBookingFormFilters";
import { useBookingFormUI } from "../hooks/useBookingFormUI";
import {
  Box,
  Typography,
  Grid,
  Paper,
  Card,
  CardContent,
  CircularProgress,
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TableRow,
  Chip,
  TextField,
  MenuItem,
  Tabs,
  Tab,
  Alert,
  Button,
  Dialog,
  DialogTitle,
  DialogContent,
  IconButton,
  Toolbar,
  DialogActions,
  FormControlLabel,
  Switch,
  Tooltip as MuiTooltip,
} from "@mui/material";
import useMediaQuery from "@mui/material/useMediaQuery";
import { useTheme } from "@mui/material/styles";
import {
  XMarkIcon,
  ArrowLeftIcon,
  CheckCircleIcon,
  TrashIcon,
  Cog6ToothIcon,
  InformationCircleIcon,
  ArrowUpIcon,
  ArrowDownIcon,
  ArrowTrendingUpIcon,
  ArrowTrendingDownIcon,
} from '@heroicons/react/24/outline';
import Link from "@mui/material/Link";
import { useHeaderActions } from "../contexts/HeaderActionsContext";
import {
  BarChart,
  Bar,
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
  ResponsiveContainer,
  PieChart,
  Pie,
  Cell,
} from "recharts";
import { DateTime } from "luxon";
import DateRangePicker from "./DateRangePicker";
import {
  CoreFunnelSection,
  RevenueSection,
  ConversionSection,
  EfficiencySection,
  StrategicSection
} from "./EnterpriseAnalyticsSections";

const COLORS = ["#0088FE", "#00C49F", "#FFBB28", "#FF8042", "#8884d8"];
const SERIES_COLORS = {
  primary: '#6366F1',
  secondary: '#0EA5E9',
  tertiary: '#F97316',
  quaternary: '#22C55E',
  projected: '#A855F7',
};

// Helper function to get consistent KPI card styling (matching Analytics/Overview KPICard style)
const getKPICardStyle = (borderLeftColor) => ({
  height: '100%',
  bgcolor: 'white',
  border: '1px solid',
  borderColor: 'grey.200',
  borderLeft: '4px solid',
  borderLeftColor: borderLeftColor,
  borderRadius: '12px',
  p: { xs: 2, sm: 2.5 },
  boxShadow: '0 1px 3px 0 rgba(0, 0, 0, 0.1), 0 1px 2px 0 rgba(0, 0, 0, 0.06)',
  transition: 'box-shadow 0.2s',
  cursor: 'pointer',
  '&:hover': {
    boxShadow: '0 10px 15px -3px rgba(0, 0, 0, 0.1), 0 4px 6px -2px rgba(0, 0, 0, 0.05)'
  }
});

// Helper function to get consistent label typography (matching Analytics/Overview)
const getLabelTypography = () => ({
  color: 'text.secondary',
  fontSize: '0.75rem',
  mb: 0.5
});

// Helper function to get consistent value typography (matching Analytics/Overview)
const getValueTypography = () => ({
  color: 'text.primary',
  fontWeight: 600,
  fontSize: { xs: '1.5rem', sm: '1.875rem' },
  lineHeight: 1.2
});

function BookingFormAnalytics() {
  const { setActions } = useHeaderActions();
  const toast = useToast();

  // Custom hooks for organized state management
  const dataState = useBookingFormData();
  const {
    loading, setLoading,
    data, setData,
    error, setError,
    revenueTrendData, setRevenueTrendData,
    roasSummary, setRoasSummary,
    enterpriseData, setEnterpriseData,
    enterpriseTrendsData, setEnterpriseTrendsData,
    historicalMonthlyData, setHistoricalMonthlyData,
    googleData, setGoogleData,
    googleLoading, setGoogleLoading,
    googleError, setGoogleError,
    googleSyncLoading, setGoogleSyncLoading,
    klaviyoData, setKlaviyoData,
    klaviyoLoading, setKlaviyoLoading,
    klaviyoError, setKlaviyoError,
    klaviyoSyncLoading, setKlaviyoSyncLoading,
    klaviyoSyncStatus, setKlaviyoSyncStatus,
  } = dataState;

  const uiState = useBookingFormUI();
  const {
    activeTab, setActiveTab, handleTabChange,
    modalOpen, setModalOpen,
    modalData, setModalData,
    modalLoading, setModalLoading,
    modalSubmissions, setModalSubmissions,
    modalDetailView, setModalDetailView,
    modalDetailData, setModalDetailData,
    modalDetailLoading, setModalDetailLoading,
    enterpriseModalOpen, setEnterpriseModalOpen,
    enterpriseModalData, setEnterpriseModalData,
    realizedRevenueModalOpen, setRealizedRevenueModalOpen,
    realizedRevenueDetailView, setRealizedRevenueDetailView,
    realizedRevenueDetailData, setRealizedRevenueDetailData,
    googleRealizedRevenueModalOpen, setGoogleRealizedRevenueModalOpen,
    googleRealizedRevenueDetailView, setGoogleRealizedRevenueDetailView,
    googleRealizedRevenueDetailData, setGoogleRealizedRevenueDetailData,
    falseStartsModalOpen, setFalseStartsModalOpen,
    falseStartsDetailView, setFalseStartsDetailView,
    falseStartsDetailData, setFalseStartsDetailData,
    aroasModalOpen, setAroasModalOpen,
    aroasModalLoading, setAroasModalLoading,
    aroasModalData, setAroasModalData,
    fullClientConversionModalOpen, setFullClientConversionModalOpen,
    fullClientConversionSource, setFullClientConversionSource,
    deleteConfirmOpen, setDeleteConfirmOpen,
    deleting, setDeleting,
    backfillDialogOpen, setBackfillDialogOpen,
    metricDetailDialogOpen, setMetricDetailDialogOpen,
    trendsLoading, setTrendsLoading,
    historicalMonthlyLoading, setHistoricalMonthlyLoading,
    realizedRevenueLoading, setRealizedRevenueLoading,
    realizedRevenueDetailLoading, setRealizedRevenueDetailLoading,
    googleRealizedRevenueLoading, setGoogleRealizedRevenueLoading,
    googleRealizedRevenueDetailLoading, setGoogleRealizedRevenueDetailLoading,
    falseStartsLoading, setFalseStartsLoading,
    falseStartsDetailLoading, setFalseStartsDetailLoading,
    fullClientConversionLoading, setFullClientConversionLoading,
  } = uiState;

  const filterState = useBookingFormFilters();
  const {
    dateRangeValue, setDateRangeValue,
    backfillStartDate, setBackfillStartDate,
    backfillEndDate, setBackfillEndDate,
    metricDetailType, setMetricDetailType,
    selectedCampaign, setSelectedCampaign,
    ltvConfigOpen, setLtvConfigOpen,
    ltvMetric, setLtvMetric,
    configTab, setConfigTab,
    realizedRevenueData, setRealizedRevenueData,
    googleRealizedRevenueData, setGoogleRealizedRevenueData,
    falseStartsData, setFalseStartsData,
    fullClientConversionData, setFullClientConversionData,
    metaFullClientConversionData, setMetaFullClientConversionData,
    googleFullClientConversionData, setGoogleFullClientConversionData,
    klaviyoFullClientConversionData, setKlaviyoFullClientConversionData,
  } = filterState;

  // Additional local state
  const [campaignDetailDialogOpen, setCampaignDetailDialogOpen] = useState(false);
  const [realizedRevenueSortField, setRealizedRevenueSortField] = useState(null);
  const [realizedRevenueSortDirection, setRealizedRevenueSortDirection] = useState('desc'); // 'asc' or 'desc'
  const [googleRealizedRevenueSortField, setGoogleRealizedRevenueSortField] = useState(null);
  const [googleRealizedRevenueSortDirection, setGoogleRealizedRevenueSortDirection] = useState('desc'); // 'asc' or 'desc'

  const theme = useTheme();
  const isXsDown = useMediaQuery(theme.breakpoints.down("sm"));
  const isMdDown = useMediaQuery(theme.breakpoints.down("md"));
  const detailScrollSx = useMemo(
    () => ({
      maxHeight: { xs: "auto", sm: "70vh" },
      overflowY: { xs: "visible", sm: "auto" },
    }),
    []
  );
  
  const analyticsWindowEnd = useMemo(() => {
    const endCandidate = dateRangeValue?.endDate
      ? DateTime.fromISO(dateRangeValue.endDate, { zone: 'America/New_York' })
      : DateTime.now().setZone('America/New_York');
    return endCandidate?.isValid ? endCandidate.endOf('month') : DateTime.now().setZone('America/New_York').endOf('month');
  }, [dateRangeValue]);

  // Get default visible metrics
  const getDefaultVisibleMetrics = () => ({
    // Overall Metrics
    'total_form_views': true,
    'total_leads': true,
    'total_registrations': true,
    'total_revenue': true,
    'full_client_conversion_rate': true,
    // Meta Ads Performance
    'meta_form_views': true,
    'meta_leads': true,
    'meta_registrations': true,
    'meta_revenue': true,
    // Meta Ad Performance KPIs
    'ad_impressions': true,
    'ad_clicks': true,
    'ad_spend': true,
    'roas': true,
    'realized_revenue': true,
    'false_starts': true,
    'actual_roas': true,
    'cpl': true,
    'cpr': true,
    'meta_full_client_conversion_rate': true,
    'google_full_client_conversion_rate': true,
    'klaviyo_full_client_conversion_rate': true,
    // Enterprise Analytics Sections
    'enterprise_core_funnel': true,
    'enterprise_revenue': true,
    'enterprise_conversion': true,
    'enterprise_efficiency': true,
    'enterprise_strategic': true,
  });
  // Metric visibility state - will be loaded from API or localStorage
  const [visibleMetrics, setVisibleMetrics] = useState(getDefaultVisibleMetrics());
  const [preferencesLoading, setPreferencesLoading] = useState(true);
  const [ltvByLabel, setLtvByLabel] = useState(null);
  const [ltvLoading, setLtvLoading] = useState(false);
  // Fetch user preferences from API
  const fetchUserPreferences = async () => {
    setPreferencesLoading(true);
    try {
      const response = await fetch('/api/submissions/analytics/preferences', {
        credentials: 'include'
      });

      if (response.ok) {
        const data = await response.json();
        if (data.visibleMetrics) {
          // Ensure full_client_conversion_rate is always enabled (merge with defaults)
          const defaultMetrics = getDefaultVisibleMetrics();
          const mergedMetrics = {
            ...defaultMetrics,
            ...data.visibleMetrics,
            // Force enable full_client_conversion_rate and its variants
            'full_client_conversion_rate': true,
            'meta_full_client_conversion_rate': true,
            'google_full_client_conversion_rate': true,
            'klaviyo_full_client_conversion_rate': true
          };
          setVisibleMetrics(mergedMetrics);
          // Also save to localStorage as backup
          try {
            if (typeof window !== 'undefined' && window.localStorage) {
              localStorage.setItem('marketingAnalyticsVisibleMetrics', JSON.stringify(mergedMetrics));
            }
          } catch (e) {
            console.warn('Error saving preferences to localStorage:', e);
          }
        }
      } else if (response.status === 401) {
        // Not authenticated, try loading from localStorage as fallback
        try {
          if (typeof window !== 'undefined' && window.localStorage) {
            const saved = localStorage.getItem('marketingAnalyticsVisibleMetrics');
            if (saved) {
              const parsed = JSON.parse(saved);
              // Ensure full_client_conversion_rate is always enabled
              const defaultMetrics = getDefaultVisibleMetrics();
              const mergedMetrics = {
                ...defaultMetrics,
                ...parsed,
                'full_client_conversion_rate': true,
                'meta_full_client_conversion_rate': true,
                'google_full_client_conversion_rate': true,
                'klaviyo_full_client_conversion_rate': true
              };
              setVisibleMetrics(mergedMetrics);
            }
          }
        } catch (e) {
          console.warn('Error loading preferences from localStorage:', e);
        }
      }
    } catch (err) {
      console.warn('Error fetching user preferences:', err);
      // Fallback to localStorage
      try {
        if (typeof window !== 'undefined' && window.localStorage) {
          const saved = localStorage.getItem('marketingAnalyticsVisibleMetrics');
          if (saved) {
            const parsed = JSON.parse(saved);
            // Ensure full_client_conversion_rate is always enabled
            const defaultMetrics = getDefaultVisibleMetrics();
            const mergedMetrics = {
              ...defaultMetrics,
              ...parsed,
              'full_client_conversion_rate': true,
              'meta_full_client_conversion_rate': true,
              'google_full_client_conversion_rate': true,
              'klaviyo_full_client_conversion_rate': true
            };
            setVisibleMetrics(mergedMetrics);
          }
        }
      } catch (e) {
        console.warn('Error loading preferences from localStorage:', e);
      }
    } finally {
      setPreferencesLoading(false);
    }
  };

  // Set config button in header
  useEffect(() => {
    const handleConfigClick = () => setLtvConfigOpen(true);
    
    setActions(
      <button
        onClick={handleConfigClick}
        className="p-2 text-neutral-600 hover:text-brand-purple hover:bg-neutral-100 rounded-md transition-colors"
        title="Configure Marketing Analytics"
        aria-label="Configure Marketing Analytics"
      >
        <Cog6ToothIcon className="h-5 w-5" />
      </button>
    );
    
    // Cleanup: clear actions when component unmounts
    return () => setActions(null);
  }, [setActions]);

  // Initialize date range to current month and load preferences
  useEffect(() => {
    if (!dateRangeValue) {
      const now = DateTime.now().setZone("America/New_York");
      setDateRangeValue({
        startDate: now.startOf("month").toISODate(),
        endDate: now.endOf("month").toISODate(),
        preset: 'thisMonth'
      });
    }
    
    // Load LTV metric preference from localStorage (safe access)
    try {
      if (typeof window !== 'undefined' && window.localStorage) {
    const savedMetric = localStorage.getItem('ltvMetric');
    if (savedMetric && (savedMetric === 'average' || savedMetric === 'median')) {
      setLtvMetric(savedMetric);
        }
      }
    } catch (e) {
      console.warn('Error accessing localStorage for LTV metric:', e);
    }

    // Load user preferences from API
    fetchUserPreferences();
  }, []);

  const handleDateRangeChange = (startDate, endDate, preset) => {
    setDateRangeValue({
      startDate,
      endDate,
      preset
    });
    setError(null);
  };

  const fetchAnalytics = async () => {
    if (!dateRangeValue || !dateRangeValue.startDate || !dateRangeValue.endDate) {
      return;
    }

    setLoading(true);
    setError(null);
    try {
      const params = new URLSearchParams({
        startDate: dateRangeValue.startDate,
        endDate: dateRangeValue.endDate,
        ltvMetric: ltvMetric // Pass LTV metric preference
      });

      const response = await fetch(`/api/submissions/analytics/metrics?${params}`);
      if (!response.ok) {
        const errorData = await response.json().catch(() => ({ error: 'Unknown error' }));
        console.error('Analytics API error:', {
          status: response.status,
          statusText: response.statusText,
          error: errorData
        });
        throw new Error(errorData.error || errorData.details || `HTTP ${response.status}: ${response.statusText}`);
      }
      const result = await response.json();
      setData(result);
    } catch (err) {
      console.error("Error fetching analytics:", err);
      setError(err.message || "Failed to load analytics data");
    } finally {
      setLoading(false);
    }
  };

  const fetchLTVByLabel = async () => {
    setLtvLoading(true);
    try {
      const response = await fetch('/api/submissions/analytics/ltv-by-label');
      if (!response.ok) {
        console.error('LTV by label API error');
        return;
      }
      const result = await response.json();
      setLtvByLabel(result);
    } catch (err) {
      console.error("Error fetching LTV by label:", err);
    } finally {
      setLtvLoading(false);
    }
  };
  const fetchEnterpriseAnalytics = async () => {
    if (!dateRangeValue || !dateRangeValue.startDate || !dateRangeValue.endDate) {
      return;
    }

    try {
      const params = new URLSearchParams({
        startDate: dateRangeValue.startDate,
        endDate: dateRangeValue.endDate,
        ltvMetric: ltvMetric // Pass LTV metric preference
      });

      const response = await fetch(`/api/submissions/analytics/enterprise?${params}`);
      if (!response.ok) {
        console.error('Enterprise analytics API error');
        return;
      }
      const result = await response.json();
      setEnterpriseData(result);
    } catch (err) {
      console.error("Error fetching enterprise analytics:", err);
    }
  };
  const fetchRevenueTrend = async () => {
    try {
      // Always fetch current month + previous 3 months (exactly 4 months total)
      const now = DateTime.now().setZone('America/New_York');
      const threeMonthsAgo = now.minus({ months: 3 });
      const startDate = threeMonthsAgo.startOf("month").toISODate();
      const endDate = now.endOf("month").toISODate();

      const params = new URLSearchParams({
        startDate,
        endDate,
        groupBy: "monthly",
        ltvMetric: ltvMetric // Pass LTV metric preference
      });

      const response = await fetch(`/api/submissions/analytics/metrics?${params}`);
      if (!response.ok) {
        console.error("Failed to fetch revenue trend data");
        return;
      }
      const result = await response.json();
      
      // Prepare revenue trend chart data (always monthly for 4-month view)
      let trendData = (result.monthly || [])
        .map((month) => {
          // Parse month_start in UTC first, then convert to ET for display
          // PostgreSQL DATE_TRUNC returns timestamps, we need to handle timezone correctly
          const monthDateUTC = DateTime.fromISO(month.month_start, { zone: 'utc' });
          const monthDateET = monthDateUTC.setZone('America/New_York');
          const monthLabel = monthDateET.toFormat("MMM yyyy");
          
          return {
            month: monthLabel,
            "Revenue": Number(month.revenue) || 0,
          };
        })
        .reverse();
      
      // Generate array of exactly 4 months (current + previous 3)
      const monthsToShow = [];
      for (let i = 3; i >= 0; i--) {
        const monthDate = now.minus({ months: i }).startOf("month");
        const monthLabel = monthDate.toFormat("MMM yyyy");
        
        // Find matching data by comparing month labels (already converted to ET)
        const existingData = trendData.find(m => m.month === monthLabel);
        const revenue = existingData ? Number(existingData["Revenue"]) : 0;
        
        monthsToShow.push({
          month: monthLabel,
          "Revenue": revenue
        });
      }
      
      // Ensure current month is included in the data array
      const currentMonthLabel = now.toFormat("MMM yyyy");
      const currentMonthIndex = monthsToShow.findIndex(m => m.month === currentMonthLabel);
      
      // Add projected value for current month
      if (monthsToShow.length > 0 && currentMonthIndex >= 0) {
        const currentMonth = monthsToShow[currentMonthIndex];
        
        // First, add projected values to all previous months (so line connects smoothly)
        for (let i = 0; i < currentMonthIndex; i++) {
          monthsToShow[i] = {
            ...monthsToShow[i],
            "RevenueProjected": Number(monthsToShow[i]["Revenue"]) || 0
          };
        }
        
        // Now calculate projected value for current month
        if (currentMonthIndex > 0) {
          const previousMonth = monthsToShow[currentMonthIndex - 1];
          
          // Calculate day of month (1-31)
          const dayOfMonth = now.day;
          const daysInMonth = now.daysInMonth;
          const daysRemaining = daysInMonth - dayOfMonth;
          
          // Growth target: 20% increase
          const growthTarget = 1.20;
          const previousRevenue = Number(previousMonth["Revenue"]) || 0;
          const currentRevenue = Number(currentMonth["Revenue"]) || 0;
          
          // Projected end-of-month value = previous month * growth target
          const projectedEndOfMonth = previousRevenue * growthTarget;
          
          // If we have current progress, project forward from there
          // Otherwise, use linear projection from previous month
          let projectedValue;
          if (currentRevenue > 0 && dayOfMonth > 1) {
            // We have some data, project forward based on remaining days
            const dailyRate = currentRevenue / dayOfMonth;
            projectedValue = currentRevenue + (dailyRate * daysRemaining * (growthTarget / 1.0));
          } else {
            // No data yet, project from previous month with growth target
            projectedValue = projectedEndOfMonth;
          }
          
          monthsToShow[currentMonthIndex] = {
            ...currentMonth,
            "RevenueProjected": Math.max(0, projectedValue)
          };
        } else if (currentMonthIndex === 0 && monthsToShow.length > 1) {
          // Current month is the first month, use the next month as reference
          const nextMonth = monthsToShow[1];
          const projectedValue = (nextMonth["Revenue"] || 0) * 1.20;
          monthsToShow[currentMonthIndex] = {
            ...currentMonth,
            "RevenueProjected": Math.max(0, projectedValue)
          };
        } else {
          // Edge case: only one month or no previous data
          monthsToShow[currentMonthIndex] = {
            ...currentMonth,
            "RevenueProjected": currentMonth["Revenue"] || 0
          };
        }
      }
      
      setRevenueTrendData(monthsToShow);
    } catch (err) {
      console.error("Error fetching revenue trend:", err);
    }
  };

  // Fetch enterprise trends on component mount
  useEffect(() => {
    fetchEnterpriseTrends();
  }, []);

  const fetchRealizedRevenue = async () => {
    if (!dateRangeValue || !dateRangeValue.startDate || !dateRangeValue.endDate) {
      return;
    }

    try {
      const params = new URLSearchParams({
        startDate: dateRangeValue.startDate,
        endDate: dateRangeValue.endDate,
      });

      const response = await fetch(
        `/api/submissions/analytics/realized-revenue?${params}`,
        { cache: 'no-store' }
      );
      if (!response.ok) {
        console.error('Realized revenue API error');
        return;
      }
      const result = await response.json();
      setRealizedRevenueData(result);
    } catch (err) {
      console.error("Error fetching realized revenue:", err);
    }
  };

  const fetchFalseStarts = async () => {
    if (!dateRangeValue || !dateRangeValue.startDate || !dateRangeValue.endDate) {
      return;
    }

    try {
      const params = new URLSearchParams({
        startDate: dateRangeValue.startDate,
        endDate: dateRangeValue.endDate,
      });

      const response = await fetch(`/api/submissions/analytics/false-starts?${params}`);
      if (!response.ok) {
        const errorText = await response.text();
        console.error('False starts API error:', response.status, errorText);
        return;
      }
      const result = await response.json();
      setFalseStartsData(result);
    } catch (err) {
      console.error("Error fetching false starts:", err);
    }
  };

  const fetchFullClientConversion = async (source = null) => {
    if (!dateRangeValue || !dateRangeValue.startDate || !dateRangeValue.endDate) {
      return;
    }

    try {
      if (!source) {
        setFullClientConversionLoading(true);
      }
      const params = new URLSearchParams({
        startDate: dateRangeValue.startDate,
        endDate: dateRangeValue.endDate,
      });
      if (source) {
        params.append('source', source);
      }

      const response = await fetch(`/api/submissions/analytics/full-client-conversion?${params}`);
      if (!response.ok) {
        const errorData = await response.json().catch(() => ({ error: 'Unknown error' }));
        console.error('Full client conversion API error:', response.status, errorData);
        if (!source) {
          setFullClientConversionLoading(false);
        }
        return;
      }
      const result = await response.json();
      
      if (source === 'meta') {
        setMetaFullClientConversionData(result);
      } else if (source === 'google') {
        setGoogleFullClientConversionData(result);
      } else if (source === 'klaviyo') {
        setKlaviyoFullClientConversionData(result);
      } else {
        setFullClientConversionData(result);
        setFullClientConversionLoading(false);
      }
    } catch (err) {
      console.error("Error fetching full client conversion:", err);
      if (!source) {
        setFullClientConversionLoading(false);
      }
    }
  };
  const fetchGoogleAnalytics = async () => {
    if (!dateRangeValue || !dateRangeValue.startDate || !dateRangeValue.endDate) {
      return;
    }

    setGoogleLoading(true);
    setGoogleError(null);
    try {
      const params = new URLSearchParams({
        startDate: dateRangeValue.startDate,
        endDate: dateRangeValue.endDate,
      });

      const response = await fetch(`/api/submissions/analytics/google?${params}`);
      if (!response.ok) {
        const errorData = await response.json().catch(() => ({ error: 'Unknown error' }));
        throw new Error(errorData.error || `HTTP ${response.status}: ${response.statusText}`);
      }
      const result = await response.json();
      setGoogleData(result);
    } catch (err) {
      console.error("Error fetching Google analytics:", err);
      setGoogleError(err.message || "Failed to load Google analytics");
    } finally {
      setGoogleLoading(false);
    }
  };

  const handleGoogleSync = async () => {
    if (!dateRangeValue || !dateRangeValue.startDate || !dateRangeValue.endDate) {
      toast.warn('Please select a date range first');
      return;
    }

    setGoogleSyncLoading(true);
    try {
      // First, test the connection
      console.log('Testing Google Ads API connection...');
      const testResponse = await fetch('/api/ad-sync/test-google', {
        method: 'GET',
        headers: {
          'Content-Type': 'application/json',
        },
      });

      if (!testResponse.ok) {
        const testError = await testResponse.json().catch(() => ({ error: 'Unknown error' }));
        const errorMsg = testError.error || testError.message || `Connection test failed: ${testResponse.status}`;
        const suggestion = testError.suggestion ? `\n\nSuggestion: ${testError.suggestion}` : '';
        throw new Error(`${errorMsg}${suggestion}`);
      }

      const testResult = await testResponse.json();
      console.log('Google Ads API connection test:', testResult);

      // If test passes, proceed with sync
      const response = await fetch('/api/ad-sync/sync', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          startDate: dateRangeValue.startDate,
          endDate: dateRangeValue.endDate,
          platform: 'google',
        }),
      });

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({ error: 'Unknown error' }));
        throw new Error(errorData.error || `HTTP ${response.status}: ${response.statusText}`);
      }

      const result = await response.json();
      
      // Check if sync was successful
      if (result.results && result.results.google) {
        const googleResult = result.results.google;
        
        if (googleResult.errors && googleResult.errors.length > 0) {
          // Sync had errors
          const errorMsg = googleResult.errors.join('\n');
          toast.error('Google Ads sync encountered errors. Please check your credentials and try again.');
        } else if (googleResult.synced > 0) {
          // Sync successful
          toast.success(`Google Ads sync completed! Synced ${googleResult.synced} record(s). Refreshing data...`);
          fetchGoogleAnalytics();
        } else {
          // No data synced (might be no campaigns in date range)
          toast.info('Google Ads sync completed, but no data was found for the selected date range. Refreshing data...');
          fetchGoogleAnalytics();
        }
      } else {
        // Unexpected response format
        toast.success(`Google Ads sync completed! ${result.message || 'Check server logs for details.'}`);
        fetchGoogleAnalytics();
      }
    } catch (err) {
      console.error("Error starting Google Ads sync:", err);
      toast.error(`Failed to sync Google Ads: ${err.message}`);
    } finally {
      setGoogleSyncLoading(false);
    }
  };

  const fetchKlaviyoAnalytics = async () => {
    if (!dateRangeValue || !dateRangeValue.startDate || !dateRangeValue.endDate) {
      return;
    }

    setKlaviyoLoading(true);
    setKlaviyoError(null);
    try {
      const params = new URLSearchParams({
        startDate: dateRangeValue.startDate,
        endDate: dateRangeValue.endDate,
      });

      const response = await fetch(`/api/submissions/analytics/klaviyo?${params}`);
      if (!response.ok) {
        const errorData = await response.json().catch(() => ({ error: 'Unknown error' }));
        throw new Error(errorData.error || `HTTP ${response.status}: ${response.statusText}`);
      }
      const result = await response.json();
      setKlaviyoData(result);
    } catch (err) {
      console.error("Error fetching Klaviyo analytics:", err);
      setKlaviyoError(err.message || "Failed to load Klaviyo analytics");
    } finally {
      setKlaviyoLoading(false);
    }
  };

  // Helper function to create clickable metric card
  const MetricCard = ({ title, value, subtitle, color, metricType, onClick }) => (
    <Card 
      sx={{ 
        height: '100%', 
        borderLeft: '4px solid', 
        borderColor: `${color}.main`,
        cursor: 'pointer',
        transition: 'all 0.2s',
        '&:hover': { boxShadow: 4, transform: 'translateY(-2px)' }
      }}
      onClick={() => {
        setMetricDetailType(metricType);
        setMetricDetailDialogOpen(true);
      }}
    >
      <CardContent sx={{ p: 3, position: 'relative' }}>
        <IconButton
          size="small"
          sx={{ position: 'absolute', top: 8, right: 8, opacity: 0.6 }}
          onClick={(e) => {
            e.stopPropagation();
            setMetricDetailType(metricType);
            setMetricDetailDialogOpen(true);
          }}
        >
          <InformationCircleIcon className="h-4 w-4" />
        </IconButton>
        <Typography variant="body2" sx={{ color: 'text.secondary', fontWeight: 500, fontSize: '0.75rem', textTransform: 'uppercase', mb: 1.5 }}>
          {title}
        </Typography>
        <Typography variant="h4" sx={{ color: `${color}.main`, fontWeight: 700, fontSize: '2rem', mb: 1 }}>
          {value}
        </Typography>
        <Typography variant="caption" sx={{ color: 'text.secondary', fontSize: '0.75rem' }}>
          {subtitle}
        </Typography>
      </CardContent>
    </Card>
  );

  const fetchKlaviyoSyncStatus = async () => {
    try {
      const response = await fetch('/api/submissions/analytics/klaviyo/sync/status?limit=5');
      if (response.ok) {
        const result = await response.json();
        setKlaviyoSyncStatus(result);
        
        // Log database counts for debugging
        if (result.database) {
          console.log('📊 Klaviyo Database Status:', result.database);
        }
      }
    } catch (err) {
      console.error("Error fetching Klaviyo sync status:", err);
    }
  };
  const handleKlaviyoBackfill = async () => {
    if (!backfillStartDate) {
      toast.warn('Please select a start date for backfill');
      return;
    }

    setKlaviyoSyncLoading(true);
    try {
      const response = await fetch('/api/submissions/analytics/klaviyo/sync', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          backfill: true,
          startDate: backfillStartDate,
          endDate: backfillEndDate || new Date().toISOString().split('T')[0],
        }),
      });

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({ error: 'Unknown error' }));
        throw new Error(errorData.error || `HTTP ${response.status}: ${response.statusText}`);
      }

      const result = await response.json();
      const dbInfo = result.database || result.environment ? ` (Target: ${result.database || result.environment} database)` : '';
      toast.success(`Backfill started! ${result.message}${dbInfo}`);
      setBackfillDialogOpen(false);
      
      // Refresh sync status after a delay
      setTimeout(() => {
        fetchKlaviyoSyncStatus();
      }, 2000);
    } catch (err) {
      console.error("Error starting Klaviyo backfill:", err);
      toast.error(`Failed to start backfill: ${err.message}`);
    } finally {
      setKlaviyoSyncLoading(false);
    }
  };

  const handleKlaviyoSync = async () => {
    setKlaviyoSyncLoading(true);
    try {
      const response = await fetch('/api/submissions/analytics/klaviyo/sync', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          entity: 'all',
          force: true,
        }),
      });

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({ error: 'Unknown error' }));
        throw new Error(errorData.error || `HTTP ${response.status}: ${response.statusText}`);
      }

      const result = await response.json();
      const dbInfo = result.database || result.environment ? ` (Target: ${result.database || result.environment} database)` : '';
      toast.success(`Sync started! ${result.message}${dbInfo}`);
      
      // Refresh sync status after a delay
      setTimeout(() => {
        fetchKlaviyoSyncStatus();
      }, 2000);
    } catch (err) {
      console.error("Error starting Klaviyo sync:", err);
      toast.error(`Failed to start sync: ${err.message}`);
    } finally {
      setKlaviyoSyncLoading(false);
    }
  };
  useEffect(() => {
    if (dateRangeValue && dateRangeValue.startDate && dateRangeValue.endDate) {
      // Always fetch overall full client conversion
      fetchFullClientConversion();
      
      if (activeTab === 0) {
        // Meta tab - fetch existing analytics
        fetchAnalytics();
        fetchEnterpriseAnalytics();
        fetchRealizedRevenue();
        fetchFalseStarts();
        fetchFullClientConversion('meta');
      } else if (activeTab === 1) {
        // Google tab - fetch Google analytics
        // Set main loading to false since we use googleLoading for this tab
        setLoading(false);
        fetchGoogleAnalytics();
        fetchFullClientConversion('google');
      } else if (activeTab === 2) {
        // Klaviyo tab - fetch Klaviyo analytics
        // Set main loading to false since we use klaviyoLoading for this tab
        setLoading(false);
        fetchKlaviyoAnalytics();
        fetchKlaviyoSyncStatus();
        fetchFullClientConversion('klaviyo');
      }
    }
  }, [dateRangeValue, activeTab, ltvMetric]); // Re-fetch when LTV metric changes

  // Fetch LTV data when config modal opens
  useEffect(() => {
    if (ltvConfigOpen) {
      fetchLTVByLabel();
    }
  }, [ltvConfigOpen]);

  // Fetch revenue trend on component mount and keep it updated
  useEffect(() => {
    fetchRevenueTrend();
  }, [ltvMetric]); // Re-fetch when LTV metric changes

  // Fetch enterprise trends on component mount and when LTV metric changes
  useEffect(() => {
    fetchEnterpriseTrends();
  }, [ltvMetric]); // Re-fetch when LTV metric changes

  const fetchEnterpriseTrends = async () => {
    setTrendsLoading(true);
    try {
      const params = new URLSearchParams({
        ltvMetric: ltvMetric // Pass LTV metric preference
      });
      const response = await fetch(`/api/submissions/analytics/enterprise-trends?${params}`);
      if (!response.ok) {
        const errorText = await response.text();
        console.error('Enterprise trends API error:', response.status, errorText);
        return;
      }
      const result = await response.json();
      
      // Add projected values for current month
      if (result.monthlyData && result.monthlyData.length > 0) {
        const enrichedData = addProjectedGoals(result.monthlyData);
        setEnterpriseTrendsData({ ...result, monthlyData: enrichedData });
      } else {
        setEnterpriseTrendsData(result);
      }
    } catch (err) {
      console.error("Error fetching enterprise trends:", err);
    } finally {
      setTrendsLoading(false);
    }
  };
  // Helper function to add projected goals for the current month
  const addProjectedGoals = (monthlyData) => {
    if (!monthlyData || monthlyData.length < 2) return monthlyData;
    
    const now = DateTime.now().setZone('America/New_York');
    const currentMonthLabel = now.toFormat('MMM yyyy');
    
    // Find the current month and previous month
    const currentMonthIndex = monthlyData.findIndex(m => m.month === currentMonthLabel);
    const previousMonthIndex = currentMonthIndex > 0 ? currentMonthIndex - 1 : null;
    
    // If we're not in the current month or don't have previous data, return as-is
    if (currentMonthIndex === -1 || previousMonthIndex === null) return monthlyData;
    
    const currentMonth = monthlyData[currentMonthIndex];
    const previousMonth = monthlyData[previousMonthIndex];
    
    // Calculate day of month (1-31)
    const dayOfMonth = now.day;
    const daysInMonth = now.daysInMonth;
    const daysRemaining = daysInMonth - dayOfMonth;
    
    // Growth targets (adjust these percentages as needed)
    const growthTargets = {
      roas: 1.15, // 15% increase
      trialRoas: 1.10,
      blendedRoas: 1.12,
      metaSpend: 1.20, // 20% increase
      totalSpend: 1.20,
      facebookRevenue: 1.25,
      facebookLtvRevenue: 1.25,
      facebookFormStarts: 1.30,
      facebookFormCompletions: 1.30,
      formStarts: 1.25,
      formCompletions: 1.25,
      cpl: 0.95, // 5% decrease (better efficiency)
      cpr: 0.95,
      cac: 0.95,
      conversionRate: 1.10,
      facebookConversionRate: 1.10,
      ctr: 1.05,
      metaImpressions: 1.20,
      metaClicks: 1.25,
      formViews: 1.25,
    };
    
    // Create enriched data with projected values
    // For previous months: projected = actual (so line continues smoothly)
    // For current month: projected = calculated goal based on growth target
    const enrichedData = monthlyData.map((month, index) => {
      const enrichedMonth = { ...month };
      
      if (index < currentMonthIndex) {
        // For previous months, projected = actual (so dotted line tracks solid line)
        Object.keys(growthTargets).forEach(key => {
          enrichedMonth[`${key}Projected`] = month[key] || 0;
        });
      } else if (index === currentMonthIndex) {
        // For current month, calculate projected goal
        Object.keys(growthTargets).forEach(key => {
          const previousValue = previousMonth[key] || 0;
          const currentValue = month[key] || 0;
          const growthTarget = growthTargets[key];
          
          // Projected end-of-month value = previous month * growth target
          const projectedEndOfMonth = previousValue * growthTarget;
          
          // If we have current progress, project forward from there
          // Otherwise, use linear projection from previous month
          if (currentValue > 0 && dayOfMonth > 1) {
            // We have some data, project forward based on remaining days
            const dailyRate = currentValue / dayOfMonth;
            // Project forward assuming we maintain current daily rate * growth factor
            const projectedValue = currentValue + (dailyRate * daysRemaining * (growthTarget / 1.0));
            enrichedMonth[`${key}Projected`] = Math.max(0, projectedValue);
          } else {
            // No data yet, project from previous month with growth target
            const projectedValue = previousValue * growthTarget;
            enrichedMonth[`${key}Projected`] = Math.max(0, projectedValue);
          }
        });
      } else {
        // For future months, no projected values
        Object.keys(growthTargets).forEach(key => {
          enrichedMonth[`${key}Projected`] = undefined;
        });
      }
      
      return enrichedMonth;
    });
    
    return enrichedData;
  };

  // Calculate max revenue for the trend chart (must be before any early returns)
  const maxRevenue = useMemo(() => {
    if (!revenueTrendData || revenueTrendData.length === 0) return 0;
    const revenues = revenueTrendData.map(d => Number(d["Revenue"]) || 0);
    const projectedRevenues = revenueTrendData.map(d => Number(d["RevenueProjected"]) || 0);
    const allRevenues = [...revenues, ...projectedRevenues];
    return Math.max(...allRevenues, 0);
  }, [revenueTrendData]);

  // Calculate Y-axis max with padding - ensure at least $12K or 50% padding
  const yAxisMax = useMemo(() => {
    if (maxRevenue === 0) return 12000; // Default to 12K if no data
    // Add 50% padding at the top, or ensure minimum of $12K, whichever is greater
    const paddedMax = Math.max(maxRevenue * 1.5, maxRevenue + 2000);
    return Math.max(paddedMax, 12000); // Always show at least $12K
  }, [maxRevenue]);


  const formatPercent = (value) => {
    const numValue = typeof value === 'string' ? parseFloat(value) : Number(value || 0);
    if (isNaN(numValue)) return '0.0%';
    return `${numValue.toFixed(1)}%`;
  };
  const formatDate = (dateString) => {
    if (!dateString) return '—';
    try {
      // Handle both ISO date strings with time and date-only strings (YYYY-MM-DD)
      const date = DateTime.fromISO(dateString);
      if (!date.isValid) {
        // Try parsing as just a date string
        const dateOnly = dateString.split('T')[0]; // Remove time component if present
        const parsed = DateTime.fromISO(dateOnly);
        if (parsed.isValid) {
          return parsed.toFormat("MMM d, yyyy");
        }
        return dateString; // Return original if can't parse
      }
      return date.toFormat("MMM d, yyyy");
    } catch (err) {
      console.error('Error formatting date:', dateString, err);
      return dateString || '—';
    }
  };

  const normalizeCardType = (cardType) => {
    if (!cardType) return null;
    const key = String(cardType).toLowerCase();
    const aliasMap = {
      total_form_views: 'form_views',
      form_views: 'form_views',
      formview: 'form_views',
      total_leads: 'form_starts',
      leads: 'form_starts',
      total_registrations: 'form_completions',
      registrations: 'form_completions',
      total_revenue: 'revenue',
      'total revenue from booking forms': 'revenue',
      revenue: 'revenue',
      meta_form_view: 'facebook_form_views',
      meta_form_views: 'facebook_form_views',
      'meta form views': 'facebook_form_views',
      meta_leads: 'facebook_form_starts',
      meta_registrations: 'facebook_form_completions',
      meta_revenue: 'facebook_revenue',
      'total revenue from meta booking forms': 'facebook_revenue',
      ad_impressions: 'ad_impressions',
      impressions: 'ad_impressions',
      ad_clicks: 'ad_clicks',
      clicks: 'ad_clicks',
      ad_spend: 'ad_spend',
      spend: 'ad_spend',
      roas: 'roas',
      actual_roas: 'actual_roas',
      aroas: 'actual_roas',
      cpl: 'cpl',
      'cost per lead': 'cpl',
      cpr: 'cpr',
      'cost per registration': 'cpr',
      reach: 'reach',
      ctr: 'ctr',
      cpc: 'cpc',
      trial_conversion_rate: 'trial_conversion_rate',
      trial_roas: 'trial_roas',
    };
    return aliasMap[key] || key;
  };
  const formatDisplayValue = (value, type = 'number', options = {}) => {
    if (value === null || value === undefined || Number.isNaN(value)) {
      return '—';
    }
    const decimals = options.decimals ?? (type === 'percent' ? 1 : type === 'multiple' ? 2 : 0);
    switch (type) {
      case 'currency':
        return formatCurrency(value);
      case 'percent':
        return `${parseFloat(value).toFixed(decimals)}%`;
      case 'multiple':
        return `${parseFloat(value).toFixed(decimals)}x`;
      case 'number':
      default: {
        if (options.compact && Math.abs(value) >= 1000) {
          return new Intl.NumberFormat('en-US', {
            notation: 'compact',
            maximumFractionDigits: options.decimals ?? 1,
          }).format(value);
        }
        const maximumFractionDigits = options.decimals ?? (Number.isInteger(value) ? 0 : 2);
        return Number(value).toLocaleString('en-US', {
          minimumFractionDigits: options.decimals ?? 0,
          maximumFractionDigits,
        });
      }
    }
  };

  const computeDelta = (current, previous) => {
    if (current === null || current === undefined || previous === null || previous === undefined) {
      return null;
    }
    const absolute = current - previous;
    const percent = previous === 0 ? null : (absolute / previous) * 100;
    if (!Number.isFinite(absolute) && (percent === null || !Number.isFinite(percent))) {
      return null;
    }
    return { absolute, percent };
  };

  const selectedDayCount = useMemo(() => {
    if (!dateRangeValue?.startDate || !dateRangeValue?.endDate) return null;
    const start = DateTime.fromISO(dateRangeValue.startDate);
    const end = DateTime.fromISO(dateRangeValue.endDate);
    if (!start.isValid || !end.isValid) return null;
    const duration = end.endOf('day').diff(start.startOf('day'), 'days').days;
    return Math.max(1, Math.floor(duration) + 1);
  }, [dateRangeValue]);

  const generalMonthlySeries = useMemo(() => {
    const source = (historicalMonthlyData && historicalMonthlyData.length > 0)
      ? historicalMonthlyData
      : (data?.monthly || []);
    if (!source || source.length === 0) return [];
    const mapped = source
      .map((row) => {
        const rawMonth = row.month_start || row.monthStart || row.month;
        let monthDate = null;
        if (rawMonth) {
          const parsed = DateTime.fromISO(rawMonth, { zone: 'utc' });
          if (parsed.isValid) {
            monthDate = parsed.setZone('America/New_York');
          }
        }
        const label = monthDate?.isValid ? monthDate.toFormat('MMM yyyy') : (typeof row.month === 'string' ? row.month : '—');
        return {
          month: label,
          monthDate: monthDate?.isValid ? monthDate : null,
          formViews: Number(row.form_views ?? 0),
          formStarts: Number(row.form_starts ?? 0),
          formCompletions: Number(row.form_completions ?? 0),
          revenue: Number(row.revenue ?? 0),
        };
      })
      .sort((a, b) => {
        if (!a.monthDate || !b.monthDate) return 0;
        return a.monthDate.toMillis() - b.monthDate.toMillis();
      });

    const monthMap = new Map(mapped.map((item) => [item.month, item]));
    const end = analyticsWindowEnd ?? DateTime.now().setZone('America/New_York').endOf('month');
    const filled = [];
    for (let i = 5; i >= 0; i -= 1) {
      const dt = end.minus({ months: i }).startOf('month');
      const label = dt.toFormat('MMM yyyy');
      const existing = monthMap.get(label);
      filled.push(existing ?? {
        month: label,
        monthDate: dt,
        formViews: 0,
        formStarts: 0,
        formCompletions: 0,
        revenue: 0,
      });
    }

    return filled;
  }, [analyticsWindowEnd, data, historicalMonthlyData]);

  const generalMonthlyLastSix = useMemo(() => generalMonthlySeries.slice(-6), [generalMonthlySeries]);

  const enterpriseMonthlySeries = useMemo(() => {
    if (!enterpriseTrendsData?.monthlyData) return [];
    return enterpriseTrendsData.monthlyData
      .map((row) => {
        const monthDate = row.monthStart
          ? DateTime.fromISO(row.monthStart, { zone: 'utc' }).setZone('America/New_York')
          : DateTime.fromFormat(row.month || '', 'MMM yyyy', { zone: 'America/New_York' });
        const label = monthDate?.isValid ? monthDate.toFormat('MMM yyyy') : row.month || '—';
        return {
          ...row,
          month: label,
          monthDate: monthDate?.isValid ? monthDate : null,
          formViews: Number(row.formViews ?? 0),
          facebookFormViews: Number(row.facebookFormViews ?? 0),
          formStarts: Number(row.formStarts ?? 0),
          formCompletions: Number(row.formCompletions ?? 0),
          facebookFormStarts: Number(row.facebookFormStarts ?? 0),
          facebookFormCompletions: Number(row.facebookFormCompletions ?? 0),
          facebookRevenue: Number(row.facebookRevenue ?? 0),
          facebookLtvRevenue: Number(row.facebookLtvRevenue ?? 0),
          metaImpressions: Number(row.metaImpressions ?? 0),
          metaClicks: Number(row.metaClicks ?? 0),
          metaSpend: Number(row.metaSpend ?? 0),
          totalImpressions: Number(row.totalImpressions ?? 0),
          totalClicks: Number(row.totalClicks ?? 0),
          totalSpend: Number(row.totalSpend ?? 0),
          roas: Number(row.roas ?? 0),
          trialRoas: Number(row.trialRoas ?? 0),
          blendedRoas: Number(row.blendedRoas ?? 0),
          cpl: Number(row.cpl ?? 0),
          cpr: Number(row.cpr ?? 0),
          cac: Number(row.cac ?? 0),
          conversionRate: Number(row.conversionRate ?? 0),
          facebookConversionRate: Number(row.facebookConversionRate ?? 0),
          ctr: Number(row.ctr ?? 0),
          cpc: Number(row.cpc ?? 0),
        };
      })
      .sort((a, b) => {
        if (!a.monthDate || !b.monthDate) return 0;
        return a.monthDate.toMillis() - b.monthDate.toMillis();
      });
  }, [enterpriseTrendsData]);
  const enterpriseMonthlyLastSix = useMemo(() => enterpriseMonthlySeries.slice(-6), [enterpriseMonthlySeries]);

  const coreMonthlySeries = useMemo(() => {
    if (!generalMonthlyLastSix.length && !enterpriseMonthlyLastSix.length) return [];

    const pickValue = (primary, fallback) => {
      if (primary === null || primary === undefined) return fallback ?? 0;
      if (typeof primary === 'number' && primary === 0 && typeof fallback === 'number' && fallback > 0) {
        return fallback;
      }
      return primary;
    };

    const labelSet = new Set();
    generalMonthlyLastSix.forEach((item) => item?.month && labelSet.add(item.month));
    enterpriseMonthlyLastSix.forEach((item) => item?.month && labelSet.add(item.month));

    const labels = Array.from(labelSet).map((label) => {
      const dt = generalMonthlyLastSix.find((item) => item.month === label)?.monthDate
        || enterpriseMonthlyLastSix.find((item) => item.month === label)?.monthDate
        || DateTime.fromFormat(label, 'MMM yyyy', { zone: 'America/New_York' });
      return { label, monthDate: dt?.isValid ? dt : null };
    }).sort((a, b) => {
      if (!a.monthDate || !b.monthDate) return a.label.localeCompare(b.label);
      return a.monthDate.toMillis() - b.monthDate.toMillis();
    });

    return labels.map(({ label, monthDate }) => {
      const primary = generalMonthlyLastSix.find((item) => item.month === label);
      const fallback = enterpriseMonthlyLastSix.find((item) => item.month === label);
      const keys = new Set([
        ...Object.keys(primary || {}),
        ...Object.keys(fallback || {}),
      ]);
      keys.delete('month');
      keys.delete('monthDate');

      const combined = {
        month: label,
        monthDate,
      };

      keys.forEach((key) => {
        combined[key] = pickValue(primary?.[key], fallback?.[key]);
      });

      return combined;
    });
  }, [enterpriseMonthlyLastSix, generalMonthlyLastSix]);

  const createMetricAnalytics = ({
    key,
    title,
    description,
    overallValue,
    overallType = 'number',
    series = [],
    valueKey,
    seriesValueType,
    secondarySummary = [],
    breakdownLabel,
    footnote,
  }) => {
    const validSeries = Array.isArray(series) ? series.filter(Boolean) : [];
    const hasSeries = validSeries.length > 0 && valueKey;
    const currentFromSeries = hasSeries ? Number(validSeries[validSeries.length - 1][valueKey] ?? 0) : null;
    const previousFromSeries = hasSeries && validSeries.length > 1 ? Number(validSeries[validSeries.length - 2][valueKey] ?? 0) : null;

    const summaryItems = [
      {
        label: title,
        value: overallValue != null ? Number(overallValue) : (currentFromSeries ?? 0),
        type: overallType,
        delta: hasSeries ? computeDelta(currentFromSeries ?? 0, previousFromSeries) : null,
      },
      ...secondarySummary.filter(Boolean),
    ];

    const trend = hasSeries ? {
      data: validSeries.map((item) => ({
        month: item.month,
        actual: Number(item[valueKey] ?? 0),
        goal: item[`${valueKey}Projected`] !== undefined ? Number(item[`${valueKey}Projected`] ?? 0) : undefined,
      })),
      series: [
        {
          name: 'Actual',
          dataKey: 'actual',
          color: SERIES_COLORS.primary,
          chartType: 'line',
          strokeWidth: 2.5,
          valueType: seriesValueType || overallType,
        },
        ...(validSeries.some((item) => item[`${valueKey}Projected`] !== undefined)
          ? [{
              name: 'Goal',
              dataKey: 'goal',
              color: SERIES_COLORS.projected,
              chartType: 'line',
              strokeDasharray: '4 4',
              strokeWidth: 2,
              valueType: seriesValueType || overallType,
            }]
          : []),
      ],
      valueType: seriesValueType || overallType,
      footnote,
    } : null;

    const breakdown = hasSeries ? {
      columns: [
        { id: 'month', label: 'Month', align: 'left' },
        { id: 'value', label: breakdownLabel || title, align: 'right', type: overallType },
        { id: 'delta', label: 'vs prior month', align: 'right', type: 'delta' },
      ],
      rows: validSeries.map((item, idx) => {
        const prev = idx > 0 ? validSeries[idx - 1] : null;
        return {
          month: item.month,
          value: Number(item[valueKey] ?? 0),
          delta: prev ? computeDelta(Number(item[valueKey] ?? 0), Number(prev[valueKey] ?? 0)) : null,
        };
      }),
      footnote,
    } : null;

    return {
      key,
      title,
      description,
      summary: summaryItems,
      trend,
      breakdown,
    };
  };
  const metricAnalyticsMap = useMemo(() => {
    const map = {};
    const overall = data?.overall || {};
    const overallMonthlySeries = coreMonthlySeries.length > 0
      ? coreMonthlySeries
      : generalMonthlyLastSix.length > 0
        ? generalMonthlyLastSix
        : enterpriseMonthlyLastSix;

    const addMetric = (key, analytics) => {
      if (key && analytics) {
        map[key] = analytics;
      }
    };

    // Overall Booking Funnel Metrics
    const formViewSummaryExtras = [];
    if (Number(overall.form_starts || 0) > 0) {
      formViewSummaryExtras.push({
        label: 'Leads generated',
        value: Number(overall.form_starts || 0),
        type: 'number',
      });
    }
    if (Number(overall.form_views || 0) > 0 && Number(overall.form_starts || 0) > 0) {
      formViewSummaryExtras.push({
        label: 'Lead conversion',
        value: (Number(overall.form_starts || 0) / Number(overall.form_views || 1)) * 100,
        type: 'percent',
        helperText: 'Leads ÷ Views',
      });
    }
    if (selectedDayCount) {
      formViewSummaryExtras.push({
        label: 'Daily average',
        value: Number(overall.form_views || 0) / selectedDayCount,
        type: 'number',
        helperText: `Average per day (${selectedDayCount} days)`,
      });
    }
    if (Number(overall.unique_view_sessions || 0) > 0) {
      formViewSummaryExtras.push({
        label: 'Unique sessions',
        value: Number(overall.unique_view_sessions || 0),
        type: 'number',
      });
    }
    addMetric('form_views', createMetricAnalytics({
      key: 'form_views',
      title: 'Total Form Views',
      description: 'Visits to Acme Operations booking forms within the selected date range.',
      overallValue: Number(overall.form_views || 0),
      overallType: 'number',
      series: overallMonthlySeries,
      valueKey: 'formViews',
      seriesValueType: 'number',
      secondarySummary: formViewSummaryExtras,
      breakdownLabel: 'Form Views',
      footnote: 'Form view tracking begins in Nov 2024; earlier months display zero.',
    }));

    const leadSummaryExtras = [];
    if (Number(overall.form_completions || 0) > 0) {
      leadSummaryExtras.push({
        label: 'Registrations',
        value: Number(overall.form_completions || 0),
        type: 'number',
      });
    }
    if (Number(overall.form_starts || 0) > 0) {
      leadSummaryExtras.push({
        label: 'Conversion to registration',
        value: (Number(overall.form_completions || 0) / Number(overall.form_starts || 1)) * 100,
        type: 'percent',
        helperText: 'Registrations ÷ Leads',
      });
    }
    if (selectedDayCount) {
      leadSummaryExtras.push({
        label: 'Daily average',
        value: Number(overall.form_starts || 0) / selectedDayCount,
        type: 'number',
        helperText: `Average per day (${selectedDayCount} days)`,
      });
    }
    addMetric('form_starts', createMetricAnalytics({
      key: 'form_starts',
      title: 'Total Leads',
      description: 'Families who began a booking form and provided contact information.',
      overallValue: Number(overall.form_starts || 0),
      overallType: 'number',
      series: overallMonthlySeries,
      valueKey: 'formStarts',
      seriesValueType: 'number',
      secondarySummary: leadSummaryExtras,
      breakdownLabel: 'Leads',
    }));

    const registrationSummaryExtras = [];
    if (Number(overall.payments || 0) > 0) {
      registrationSummaryExtras.push({
        label: 'Payments',
        value: Number(overall.payments || 0),
        type: 'number',
      });
    }
    if (overall.form_completion_rate !== undefined && overall.form_completion_rate !== null) {
      registrationSummaryExtras.push({
        label: 'Lead-to-paid rate',
        value: Number(overall.form_completion_rate || 0),
        type: 'percent',
        helperText: 'Paid/Verified registrations ÷ Leads',
      });
    }
    if (selectedDayCount) {
      registrationSummaryExtras.push({
        label: 'Daily average',
        value: Number(overall.form_completions || 0) / selectedDayCount,
        type: 'number',
        helperText: `Average per day (${selectedDayCount} days)`,
      });
    }
    addMetric('form_completions', createMetricAnalytics({
      key: 'form_completions',
      title: 'Total Registrations',
      description: 'Families who completed the booking form (paid or verified).',
      overallValue: Number(overall.form_completions || 0),
      overallType: 'number',
      series: overallMonthlySeries,
      valueKey: 'formCompletions',
      seriesValueType: 'number',
      secondarySummary: registrationSummaryExtras,
      breakdownLabel: 'Registrations',
    }));

    const revenueSummaryExtras = [];
    if (Number(overall.form_completions || 0) > 0) {
      revenueSummaryExtras.push({
        label: 'Avg revenue / registration',
        value: Number(overall.revenue || 0) / Number(overall.form_completions || 1),
        type: 'currency',
      });
    }
    if (Number(overall.payments || 0) > 0) {
      revenueSummaryExtras.push({
        label: 'Payments',
        value: Number(overall.payments || 0),
        type: 'number',
      });
    }
    addMetric('revenue', createMetricAnalytics({
      key: 'revenue',
      title: 'Total Revenue from Booking Forms',
      description: 'Collected revenue from paid submissions in the selected period.',
      overallValue: Number(overall.revenue || 0),
      overallType: 'currency',
      series: overallMonthlySeries,
      valueKey: 'revenue',
      seriesValueType: 'currency',
      secondarySummary: revenueSummaryExtras,
      breakdownLabel: 'Revenue',
    }));

    // Meta Attribution Metrics
    const metaFormViewExtras = [];
    if (Number(overall.form_views || 0) > 0) {
      metaFormViewExtras.push({
        label: 'Share of total views',
        value: (Number(overall.facebook_form_views || 0) / Number(overall.form_views || 1)) * 100,
        type: 'percent',
      });
    }
    addMetric('facebook_form_views', createMetricAnalytics({
      key: 'facebook_form_views',
      title: 'Meta Form Views',
      description: 'Booking form sessions attributed to Meta campaigns.',
      overallValue: Number(overall.facebook_form_views || 0),
      overallType: 'number',
      series: enterpriseMonthlyLastSix,
      valueKey: 'facebookFormViews',
      seriesValueType: 'number',
      secondarySummary: metaFormViewExtras,
      breakdownLabel: 'Meta Form Views',
    }));

    const metaLeadExtras = [];
    if (Number(overall.form_starts || 0) > 0) {
      metaLeadExtras.push({
        label: 'Share of total leads',
        value: (Number(overall.facebook_form_starts || 0) / Number(overall.form_starts || 1)) * 100,
        type: 'percent',
      });
    }
    addMetric('facebook_form_starts', createMetricAnalytics({
      key: 'facebook_form_starts',
      title: 'Meta Leads',
      description: 'Meta-attributed families who began a booking form.',
      overallValue: Number(overall.facebook_form_starts || 0),
      overallType: 'number',
      series: enterpriseMonthlyLastSix,
      valueKey: 'facebookFormStarts',
      seriesValueType: 'number',
      secondarySummary: metaLeadExtras,
      breakdownLabel: 'Meta Leads',
    }));

    const metaRegistrationExtras = [];
    if (overall.facebook_completion_rate !== undefined && overall.facebook_completion_rate !== null) {
      metaRegistrationExtras.push({
        label: 'Completion rate',
        value: Number(overall.facebook_completion_rate || 0),
        type: 'percent',
      });
    }
    if (Number(overall.form_completions || 0) > 0) {
      metaRegistrationExtras.push({
        label: 'Share of total registrations',
        value: (Number(overall.facebook_form_completions || 0) / Number(overall.form_completions || 1)) * 100,
        type: 'percent',
      });
    }
    addMetric('facebook_form_completions', createMetricAnalytics({
      key: 'facebook_form_completions',
      title: 'Meta Registrations',
      description: 'Meta-attributed registrations (paid or verified).',
      overallValue: Number(overall.facebook_form_completions || 0),
      overallType: 'number',
      series: enterpriseMonthlyLastSix,
      valueKey: 'facebookFormCompletions',
      seriesValueType: 'number',
      secondarySummary: metaRegistrationExtras,
      breakdownLabel: 'Meta Registrations',
    }));

    const metaRevenueExtras = [];
    if (Number(overall.revenue || 0) > 0) {
      metaRevenueExtras.push({
        label: 'Share of total revenue',
        value: (Number(overall.facebook_revenue || 0) / Number(overall.revenue || 1)) * 100,
        type: 'percent',
      });
    }
    if (Number(overall.facebook_form_completions || 0) > 0) {
      metaRevenueExtras.push({
        label: 'Avg revenue / Meta registration',
        value: Number(overall.facebook_revenue || 0) / Number(overall.facebook_form_completions || 1),
        type: 'currency',
      });
    }
    addMetric('facebook_revenue', createMetricAnalytics({
      key: 'facebook_revenue',
      title: 'Total Revenue from Meta Booking Forms',
      description: 'Paid revenue generated by Meta-attributed bookings.',
      overallValue: Number(overall.facebook_revenue || 0),
      overallType: 'currency',
      series: enterpriseMonthlyLastSix,
      valueKey: 'facebookRevenue',
      seriesValueType: 'currency',
      secondarySummary: metaRevenueExtras,
      breakdownLabel: 'Meta Revenue',
    }));

    // Meta Ad KPIs
    const impressionsSummaryExtras = [];
    if (Number(overall.meta_clicks || 0) > 0) {
      impressionsSummaryExtras.push({
        label: 'Clicks',
        value: Number(overall.meta_clicks || 0),
        type: 'number',
      });
    }
    if (overall.ad_ctr !== undefined && overall.ad_ctr !== null) {
      impressionsSummaryExtras.push({
        label: 'Click-through rate',
        value: Number(overall.ad_ctr || 0),
        type: 'percent',
      });
    }
    addMetric('ad_impressions', createMetricAnalytics({
      key: 'ad_impressions',
      title: 'Meta Ad Impressions',
      description: 'An impression is counted each time a Meta ad is served on screen.',
      overallValue: Number(overall.ad_impressions || overall.meta_impressions || 0),
      overallType: 'number',
      series: enterpriseMonthlyLastSix,
      valueKey: 'metaImpressions',
      seriesValueType: 'number',
      secondarySummary: impressionsSummaryExtras,
      breakdownLabel: 'Impressions',
    }));

    const clicksSummaryExtras = [];
    if (overall.ad_ctr !== undefined && overall.ad_ctr !== null) {
      clicksSummaryExtras.push({
        label: 'Click-through rate',
        value: Number(overall.ad_ctr || 0),
        type: 'percent',
      });
    }
    if (overall.ad_cpc !== undefined && overall.ad_cpc !== null) {
      clicksSummaryExtras.push({
        label: 'Avg CPC',
        value: Number(overall.ad_cpc || 0),
        type: 'currency',
      });
    }
    addMetric('ad_clicks', createMetricAnalytics({
      key: 'ad_clicks',
      title: 'Meta Ad Clicks',
      description: 'Clicks occur when someone taps a Meta ad to visit the booking form.',
      overallValue: Number(overall.ad_clicks || overall.meta_clicks || 0),
      overallType: 'number',
      series: enterpriseMonthlyLastSix,
      valueKey: 'metaClicks',
      seriesValueType: 'number',
      secondarySummary: clicksSummaryExtras,
      breakdownLabel: 'Clicks',
    }));

    const spendSummaryExtras = [];
    if (overall.ad_cpc !== undefined && overall.ad_cpc !== null) {
      spendSummaryExtras.push({
        label: 'Avg CPC',
        value: Number(overall.ad_cpc || 0),
        type: 'currency',
      });
    }
    if (overall.ad_cpm !== undefined && overall.ad_cpm !== null) {
      spendSummaryExtras.push({
        label: 'Avg CPM',
        value: Number(overall.ad_cpm || 0),
        type: 'currency',
      });
    }
    addMetric('ad_spend', createMetricAnalytics({
      key: 'ad_spend',
      title: 'Meta Ad Spend',
      description: 'Total Meta advertising spend captured for this period.',
      overallValue: Number(overall.meta_spend || 0),
      overallType: 'currency',
      series: enterpriseMonthlyLastSix,
      valueKey: 'metaSpend',
      seriesValueType: 'currency',
      secondarySummary: spendSummaryExtras,
      breakdownLabel: 'Ad Spend',
    }));

    const roasSummaryExtras = [];
    if (roasSummary?.totalLtv !== undefined && roasSummary?.totalLtv !== null) {
      roasSummaryExtras.push({
        label: 'Total LTV',
        value: Number(roasSummary.totalLtv || 0),
        type: 'currency',
      });
    } else if (overall.facebook_revenue !== undefined) {
      roasSummaryExtras.push({
        label: 'Meta revenue',
        value: Number(overall.facebook_revenue || 0),
        type: 'currency',
      });
    }
    if (roasSummary?.totalAdSpend !== undefined && roasSummary?.totalAdSpend !== null) {
      roasSummaryExtras.push({
        label: 'Ad spend',
        value: Number(roasSummary.totalAdSpend || 0),
        type: 'currency',
      });
    } else {
      roasSummaryExtras.push({
        label: 'Ad spend',
        value: Number(overall.meta_spend || 0),
        type: 'currency',
      });
    }
    if (roasSummary?.totalCompletions !== undefined && roasSummary?.totalCompletions !== null) {
      roasSummaryExtras.push({
        label: 'Registrations',
        value: Number(roasSummary.totalCompletions || 0),
        type: 'number',
      });
    }
    addMetric('roas', createMetricAnalytics({
      key: 'roas',
      title: 'ROAS (Return on Ad Spend)',
      description: 'Return on ad spend using the selected LTV metric for Meta-attributed clients.',
      overallValue: Number(overall.roas || roasSummary?.roas || 0),
      overallType: 'multiple',
      series: enterpriseMonthlyLastSix,
      valueKey: 'roas',
      seriesValueType: 'multiple',
      secondarySummary: roasSummaryExtras,
      breakdownLabel: 'ROAS',
    }));

    const cplSummaryExtras = [];
    if (Number(overall.facebook_form_starts || 0) > 0) {
      cplSummaryExtras.push({
        label: 'Meta leads',
        value: Number(overall.facebook_form_starts || 0),
        type: 'number',
      });
    }
    cplSummaryExtras.push({
      label: 'Meta ad spend',
      value: Number(overall.meta_spend || 0),
      type: 'currency',
    });
    addMetric('cpl', createMetricAnalytics({
      key: 'cpl',
      title: 'Cost per Lead (CPL)',
      description: 'Meta ad spend divided by Meta-attributed leads.',
      overallValue: Number(overall.cpl || 0),
      overallType: 'currency',
      series: enterpriseMonthlyLastSix,
      valueKey: 'cpl',
      seriesValueType: 'currency',
      secondarySummary: cplSummaryExtras,
      breakdownLabel: 'CPL',
    }));

    const cprSummaryExtras = [];
    if (Number(overall.facebook_form_completions || 0) > 0) {
      cprSummaryExtras.push({
        label: 'Meta registrations',
        value: Number(overall.facebook_form_completions || 0),
        type: 'number',
      });
    }
    cprSummaryExtras.push({
      label: 'Meta ad spend',
      value: Number(overall.meta_spend || 0),
      type: 'currency',
    });
    addMetric('cpr', createMetricAnalytics({
      key: 'cpr',
      title: 'Cost per Registration (CPR)',
      description: 'Meta ad spend divided by Meta-attributed registrations.',
      overallValue: Number(overall.cpr || 0),
      overallType: 'currency',
      series: enterpriseMonthlyLastSix,
      valueKey: 'cpr',
      seriesValueType: 'currency',
      secondarySummary: cprSummaryExtras,
      breakdownLabel: 'CPR',
    }));

    return map;
  }, [data, generalMonthlyLastSix, enterpriseMonthlyLastSix, roasSummary, selectedDayCount]);

  const modalCardKey = useMemo(() => normalizeCardType(modalData?.cardType), [modalData]);
  const modalAnalytics = useMemo(() => {
    if (!modalCardKey) return null;
    return metricAnalyticsMap[modalCardKey] || null;
  }, [metricAnalyticsMap, modalCardKey]);

  const formatDeltaValue = (delta, baseType) => {
    if (!delta) return '—';
    if (delta.percent !== null && delta.percent !== undefined && Number.isFinite(delta.percent)) {
      const sign = delta.percent >= 0 ? '+' : '';
      return `${sign}${delta.percent.toFixed(1)}%`;
    }
    if (delta.absolute !== null && delta.absolute !== undefined && Number.isFinite(delta.absolute)) {
      const sign = delta.absolute >= 0 ? '+' : '';
      const typeForAbsolute = baseType === 'currency' ? 'currency' : baseType === 'multiple' ? 'multiple' : 'number';
      const formatted = formatDisplayValue(Math.abs(delta.absolute), typeForAbsolute, { decimals: typeForAbsolute === 'number' ? 0 : undefined });
      return `${sign}${formatted}`;
    }
    return '—';
  };

  const renderDeltaIndicator = (delta, type) => {
    if (!delta) return null;
    const comparison = delta.percent !== null && delta.percent !== undefined && Number.isFinite(delta.percent)
      ? delta.percent
      : delta.absolute;
    if (comparison === null || comparison === undefined || !Number.isFinite(comparison) || comparison === 0) {
      return null;
    }
    const isPositive = comparison >= 0;
    const color = isPositive ? 'success.main' : 'error.main';
    return (
      <Box sx={{ display: 'flex', alignItems: 'center', mt: 0.75, gap: 0.75 }}>
        {isPositive ? <ArrowTrendingUpIcon className="h-[18px] w-[18px]" style={{ color }} /> : <ArrowTrendingDownIcon className="h-[18px] w-[18px]" style={{ color }} />}
        <Typography variant="caption" sx={{ color }}>
          {formatDeltaValue(delta, type)} vs prior month
        </Typography>
      </Box>
    );
  };

  const renderSummarySection = (summary, description) => {
    if (!summary || summary.length === 0) return null;
    return (
      <Box sx={{ mb: 4, p: { xs: 2, md: 3 }, borderRadius: 2, border: '1px solid', borderColor: 'divider', bgcolor: 'background.paper' }}>
        <Typography variant="subtitle1" sx={{ mb: description ? 1 : 2, fontWeight: 600 }}>
          Summary
        </Typography>
        {description && (
          <Typography variant="body2" color="text.secondary" sx={{ mb: 2, maxWidth: 640 }}>
            {description}
          </Typography>
        )}
        <Grid container spacing={2}>
          {summary.map((stat, idx) => (
            <Grid item xs={12} sm={6} md={3} key={`${stat.label}-${idx}`}>
              <Typography variant="body2" color="text.secondary" sx={{ mb: 0.5, fontWeight: 500 }}>
                {stat.label}
              </Typography>
              <Typography variant="h5" sx={{ fontWeight: 700 }}>
                {formatDisplayValue(stat.value, stat.type)}
              </Typography>
              {renderDeltaIndicator(stat.delta, stat.type)}
              {stat.helperText && (
                <Typography variant="caption" color="text.secondary" sx={{ display: 'block', mt: 0.5 }}>
                  {stat.helperText}
                </Typography>
              )}
            </Grid>
          ))}
        </Grid>
      </Box>
    );
  };

  const renderTrendSection = (trend) => {
    if (!trend || !trend.data || trend.data.length === 0) return null;
    return (
      <Box sx={{ mb: 4, p: { xs: 2, md: 3 }, borderRadius: 2, border: '1px solid', borderColor: 'divider', bgcolor: 'background.paper' }}>
        <Typography variant="subtitle1" sx={{ mb: 2, fontWeight: 600 }}>
          Progression Over Time
        </Typography>
        <ResponsiveContainer width="100%" height={320}>
          <LineChart data={trend.data} margin={{ top: 10, right: 20, left: 0, bottom: 0 }}>
            <CartesianGrid strokeDasharray="3 3" stroke="#E5E7EB" />
            <XAxis dataKey="month" tick={{ fontSize: 12 }} />
            <YAxis
              tick={{ fontSize: 12 }}
              tickFormatter={(value) => formatDisplayValue(value, trend.valueType || 'number', { compact: true })}
            />
            <Tooltip
              cursor={{ strokeDasharray: '3 3' }}
              formatter={(value, name) => {
                const seriesConfig = trend.series.find((series) => series.name === name);
                const valueType = seriesConfig?.valueType || trend.valueType || 'number';
                return [formatDisplayValue(value, valueType), name];
              }}
            />
            {trend.series.length > 1 && <Legend />}
            {trend.series.map((series) =>
              series.chartType === 'bar' ? (
                <Bar key={series.name} dataKey={series.dataKey} fill={series.color} />
              ) : (
                <Line
                  key={series.name}
                  type="monotone"
                  dataKey={series.dataKey}
                  stroke={series.color}
                  strokeWidth={series.strokeWidth || 2}
                  strokeDasharray={series.strokeDasharray}
                  dot={{ strokeWidth: 1.5 }}
                  activeDot={{ r: 6 }}
                  connectNulls
                />
              )
            )}
          </LineChart>
        </ResponsiveContainer>
        {trend.footnote && (
          <Typography variant="caption" color="text.secondary" sx={{ mt: 2, display: 'block' }}>
            {trend.footnote}
          </Typography>
        )}
      </Box>
    );
  };

  const renderBreakdownSection = (breakdown, baseType) => {
    if (!breakdown || !breakdown.rows || breakdown.rows.length === 0) return null;
    return (
      <Box sx={{ mb: 4, p: { xs: 2, md: 3 }, borderRadius: 2, border: '1px solid', borderColor: 'divider', bgcolor: 'background.paper' }}>
        <Typography variant="subtitle1" sx={{ mb: 2, fontWeight: 600 }}>
          Monthly Performance
        </Typography>
        <TableContainer>
          <Table size="small">
            <TableHead>
              <TableRow>
                {breakdown.columns.map((col) => (
                  <TableCell key={col.id} align={col.align || 'left'}>{col.label}</TableCell>
                ))}
              </TableRow>
            </TableHead>
            <TableBody>
              {breakdown.rows.map((row) => (
                <TableRow key={row.month}>
                  {breakdown.columns.map((col) => {
                    if (col.id === 'month') {
                      return <TableCell key={col.id}>{row.month}</TableCell>;
                    }
                    if (col.id === 'value') {
                      return (
                        <TableCell key={col.id} align={col.align || 'right'} sx={{ fontWeight: 600 }}>
                          {formatDisplayValue(row.value, col.type || baseType || 'number')}
                        </TableCell>
                      );
                    }
                    if (col.id === 'delta') {
                      const diff = row.delta && ((row.delta.percent !== null && row.delta.percent !== undefined) ? row.delta.percent : row.delta.absolute);
                      return (
                        <TableCell
                          key={col.id}
                          align={col.align || 'right'}
                          sx={{ color: diff !== undefined && diff !== null && diff >= 0 ? 'success.main' : 'error.main' }}
                        >
                          {formatDeltaValue(row.delta, baseType)}
                        </TableCell>
                      );
                    }
                    return (
                      <TableCell key={col.id} align={col.align || 'right'}>
                        {row[col.id] ?? '—'}
                      </TableCell>
                    );
                  })}
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </TableContainer>
        {breakdown.footnote && (
          <Typography variant="caption" color="text.secondary" sx={{ mt: 2, display: 'block' }}>
            {breakdown.footnote}
          </Typography>
        )}
      </Box>
    );
  };

  const renderLocationBreakdown = (submissions) => {
    if (!submissions || submissions.length === 0) return null;

    // Calculate location breakdown from ad spend data
    const locationMap = {};
    let totalSpend = 0;
    
    submissions.forEach(submission => {
      // Get location from submission (ad spend data should have location field)
      const location = submission.location || 'Unknown';
      const spend = parseFloat(submission.spend || submission.adSpend || 0);
      
      if (!locationMap[location]) {
        locationMap[location] = {
          location: location,
          spend: 0,
          impressions: 0,
          clicks: 0
        };
      }
      locationMap[location].spend += spend;
      locationMap[location].impressions += parseInt(submission.impressions || 0);
      locationMap[location].clicks += parseInt(submission.clicks || 0);
      totalSpend += spend;
    });

    const locations = Object.values(locationMap)
      .filter(loc => loc.location && loc.spend > 0)
      .sort((a, b) => b.spend - a.spend);

    if (locations.length === 0) return null;

    return (
      <Box sx={{ mb: 4, p: { xs: 2, md: 3 }, borderRadius: 2, border: '1px solid', borderColor: 'divider', bgcolor: 'background.paper' }}>
        <Typography variant="subtitle1" sx={{ mb: 2, fontWeight: 600 }}>
          Location Breakdown
        </Typography>
        <TableContainer>
          <Table size="small">
            <TableHead>
              <TableRow>
                <TableCell>Location</TableCell>
                <TableCell align="right">Ad Spend</TableCell>
                <TableCell align="right">Share of Total</TableCell>
                <TableCell align="right">Impressions</TableCell>
                <TableCell align="right">Clicks</TableCell>
                <TableCell align="right">CTR</TableCell>
              </TableRow>
            </TableHead>
            <TableBody>
              {locations.map((loc, idx) => {
                const share = totalSpend > 0 ? (loc.spend / totalSpend) * 100 : 0;
                const ctr = loc.impressions > 0 ? (loc.clicks / loc.impressions) * 100 : 0;
                // Show location name as-is (could be standardized like "NY" or raw like "Some Custom Location")
                const displayLocation = loc.location || 'Unknown';
                return (
                  <TableRow key={idx}>
                    <TableCell>
                      {displayLocation}
                      {displayLocation !== 'Unknown' && !['NY', 'Online', 'LA', 'SF', 'Park Slope Club', 'UES'].includes(displayLocation) && (
                        <Typography variant="caption" sx={{ display: 'block', color: 'text.secondary', fontStyle: 'italic' }}>
                          (Review naming convention)
                        </Typography>
                      )}
                    </TableCell>
                    <TableCell align="right" sx={{ fontWeight: 600 }}>
                      {formatCurrency(loc.spend)}
                    </TableCell>
                    <TableCell align="right">
                      {formatPercent(share)}
                    </TableCell>
                    <TableCell align="right">
                      {loc.impressions.toLocaleString()}
                    </TableCell>
                    <TableCell align="right">
                      {loc.clicks.toLocaleString()}
                    </TableCell>
                    <TableCell align="right">
                      {formatPercent(ctr)}
                    </TableCell>
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
        </TableContainer>
      </Box>
    );
  };

  const renderBookingTypeBreakdown = (submissions) => {
    if (!submissions || submissions.length === 0) return null;

    // Calculate booking type breakdown with location correlation
    const bookingTypeMap = {};
    const locationSpendMap = {}; // Track spend by location for correlation
    
    submissions.forEach(submission => {
      // Handle both camelCase and snake_case field names
      const bookingType = submission.bookingType || submission.booking_type || 'Unknown';
      if (!bookingTypeMap[bookingType]) {
        bookingTypeMap[bookingType] = {
          booking_type: bookingType,
          count: 0,
          total_revenue: 0,
          locations: {} // Track registrations by location
        };
      }
      bookingTypeMap[bookingType].count += 1;
      
      // Handle different revenue field names (amount, actualPrice, price, actual_price)
      const revenue = parseFloat(
        submission.amount || 
        submission.actualPrice || 
        submission.actual_price ||
        submission.price || 
        0
      );
      bookingTypeMap[bookingType].total_revenue += revenue;
      
      // Track location if available (from UTM campaign matching with ad spend data)
      // We'll need to fetch location from ad spend data based on UTM campaign
      const utmCampaign = submission.utmCampaign || submission.utm_campaign;
      if (utmCampaign) {
        // Location will be populated from ad spend data join
        const location = submission.location || null;
        if (location) {
          if (!bookingTypeMap[bookingType].locations[location]) {
            bookingTypeMap[bookingType].locations[location] = 0;
          }
          bookingTypeMap[bookingType].locations[location] += 1;
        }
      }
    });

    const bookingTypes = Object.values(bookingTypeMap).sort((a, b) => b.count - a.count);
    const totalCount = submissions.length;

    if (bookingTypes.length === 0) return null;

    return (
      <Box sx={{ mb: 4, p: { xs: 2, md: 3 }, borderRadius: 2, border: '1px solid', borderColor: 'divider', bgcolor: 'background.paper' }}>
        <Typography variant="subtitle1" sx={{ mb: 2, fontWeight: 600 }}>
          Booking Type Breakdown
        </Typography>
        <TableContainer>
          <Table size="small">
            <TableHead>
              <TableRow>
                <TableCell>Booking Type</TableCell>
                <TableCell align="right">Meta Registrations</TableCell>
                <TableCell align="right">Share of Total</TableCell>
                <TableCell align="right">Total Revenue</TableCell>
                <TableCell align="right">Avg Revenue</TableCell>
                <TableCell>Locations</TableCell>
              </TableRow>
            </TableHead>
            <TableBody>
              {bookingTypes.map((type, idx) => {
                const share = totalCount > 0 ? (type.count / totalCount) * 100 : 0;
                const avgRevenue = type.count > 0 ? type.total_revenue / type.count : 0;
                const locationCounts = Object.entries(type.locations)
                  .sort((a, b) => b[1] - a[1])
                  .map(([loc, count]) => `${loc} (${count})`)
                  .join(', ') || '—';
                
                return (
                  <TableRow key={idx}>
                    <TableCell>{type.booking_type}</TableCell>
                    <TableCell align="right" sx={{ fontWeight: 600 }}>
                      {type.count}
                    </TableCell>
                    <TableCell align="right">
                      {formatPercent(share)}
                    </TableCell>
                    <TableCell align="right">
                      {formatCurrency(type.total_revenue)}
                    </TableCell>
                    <TableCell align="right">
                      {formatCurrency(avgRevenue)}
                    </TableCell>
                    <TableCell sx={{ fontSize: '0.875rem', color: 'text.secondary' }}>
                      {locationCounts}
                    </TableCell>
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
        </TableContainer>
      </Box>
    );
  };

  const renderAnalyticsContent = (analytics) => {
    if (!analytics) return null;
    return (
      <Box sx={{ mb: 4 }}>
        {renderSummarySection(analytics.summary, analytics.description)}
        {renderTrendSection(analytics.trend)}
        {renderBreakdownSection(analytics.breakdown, analytics.summary?.[0]?.type)}
      </Box>
    );
  };
  const handleCardClick = async (cardType, filters = {}) => {
    // Handle realized revenue separately
    if (cardType === 'realizedRevenue') {
      await handleRealizedRevenueClick();
      return;
    }
    // Handle full client conversion separately
    if (cardType === 'fullClientConversion' || cardType === 'meta_full_client_conversion' || cardType === 'google_full_client_conversion' || cardType === 'klaviyo_full_client_conversion') {
      await handleFullClientConversionClick(cardType);
      return;
    }

    setModalData({ cardType, filters });
    setModalOpen(true);
    setModalLoading(true);
    setModalSubmissions([]);
    setError(null); // Clear any previous errors

    try {
      // Get the current date range
      let startDate, endDate;
      if (dateRangeValue && dateRangeValue.startDate && dateRangeValue.endDate) {
        startDate = dateRangeValue.startDate;
        endDate = dateRangeValue.endDate;
      } else {
        // Fallback to current month if no date range set
        const now = DateTime.now().setZone("America/New_York");
        startDate = now.startOf("month").toISODate();
        endDate = now.endOf("month").toISODate();
      }

      const params = new URLSearchParams({
        startDate,
        endDate,
        cardType,
        ...filters,
      });

      // Include ltvMetric parameter for ROAS calculations
      if (cardType === 'roas') {
        params.append('ltvMetric', ltvMetric);
      }

      const response = await fetch(`/api/submissions/analytics/details?${params}`);
      if (!response.ok) {
        const errorData = await response.json().catch(() => ({ error: 'Unknown error' }));
        console.error('API Error:', errorData);
        throw new Error(errorData.error || `HTTP ${response.status}: ${response.statusText}`);
      }
      const result = await response.json();
      
      // Handle ROAS response which includes summary in response object
      if (cardType === 'roas' && result.summary) {
        setModalSubmissions(result.submissions || []);
        setRoasSummary(result.summary);
      } else {
        setModalSubmissions(result.submissions || []);
        setRoasSummary(null);
      }
    } catch (err) {
      console.error("Error fetching submission details:", err);
      setModalSubmissions([]);
      // Show error alert in modal
      setError(err.message || "Failed to load submission details");
    } finally {
      setModalLoading(false);
    }
  };

  const handleRealizedRevenueClick = async () => {
    setRealizedRevenueModalOpen(true);
    setRealizedRevenueLoading(true);
    setRealizedRevenueData(null);
    setRealizedRevenueDetailView(false);
    setRealizedRevenueDetailData(null);
    setError(null);

    try {
      // Get the current date range
      let startDate, endDate;
      if (dateRangeValue && dateRangeValue.startDate && dateRangeValue.endDate) {
        startDate = dateRangeValue.startDate;
        endDate = dateRangeValue.endDate;
      } else {
        // Fallback to current month if no date range set
        const now = DateTime.now().setZone("America/New_York");
        startDate = now.startOf("month").toISODate();
        endDate = now.endOf("month").toISODate();
      }

      const params = new URLSearchParams({
        startDate,
        endDate,
      });

      const response = await fetch(
        `/api/submissions/analytics/realized-revenue?${params}`,
        { cache: 'no-store' }
      );
      if (!response.ok) {
        const errorData = await response.json().catch(() => ({ error: 'Unknown error' }));
        console.error('API Error:', errorData);
        throw new Error(errorData.error || `HTTP ${response.status}: ${response.statusText}`);
      }
      const result = await response.json();
      setRealizedRevenueData(result);
    } catch (err) {
      console.error("Error fetching realized revenue:", err);
      setError(err.message || "Failed to load realized revenue data");
    } finally {
      setRealizedRevenueLoading(false);
    }
  };

  const handleGoogleRealizedRevenueClick = async () => {
    setGoogleRealizedRevenueModalOpen(true);
    setGoogleRealizedRevenueLoading(true);
    setGoogleRealizedRevenueData(null);
    setGoogleRealizedRevenueDetailView(false);
    setGoogleRealizedRevenueDetailData(null);
    setError(null);

    try {
      // Get the current date range
      let startDate, endDate;
      if (dateRangeValue && dateRangeValue.startDate && dateRangeValue.endDate) {
        startDate = dateRangeValue.startDate;
        endDate = dateRangeValue.endDate;
      } else {
        // Fallback to current month if no date range set
        const now = DateTime.now().setZone("America/New_York");
        startDate = now.startOf("month").toISODate();
        endDate = now.endOf("month").toISODate();
      }

      const params = new URLSearchParams({
        startDate,
        endDate,
      });

      const response = await fetch(
        `/api/submissions/analytics/realized-revenue-google?${params}`,
        { cache: 'no-store' }
      );
      if (!response.ok) {
        const errorData = await response.json().catch(() => ({ error: 'Unknown error' }));
        console.error('API Error:', errorData);
        throw new Error(errorData.error || `HTTP ${response.status}: ${response.statusText}`);
      }
      const result = await response.json();
      setGoogleRealizedRevenueData(result);
    } catch (err) {
      console.error("Error fetching Google realized revenue:", err);
      setError(err.message || "Failed to load Google realized revenue data");
    } finally {
      setGoogleRealizedRevenueLoading(false);
    }
  };

  const handleFalseStartsClick = () => {
    // Open the false starts modal - data is already fetched in fetchFalseStarts()
    setFalseStartsModalOpen(true);
    setFalseStartsDetailView(false);
    setFalseStartsDetailData(null);
  };

  const handleFullClientConversionClick = async (cardType) => {
    setFullClientConversionModalOpen(true);
    setFullClientConversionLoading(true);
    setError(null);

    try {
      // Get the current date range
      let startDate, endDate;
      if (dateRangeValue && dateRangeValue.startDate && dateRangeValue.endDate) {
        startDate = dateRangeValue.startDate;
        endDate = dateRangeValue.endDate;
      } else {
        // Fallback to current month if no date range set
        const now = DateTime.now().setZone("America/New_York");
        startDate = now.startOf("month").toISODate();
        endDate = now.endOf("month").toISODate();
      }

      // Determine source based on cardType
      let source = null;
      if (cardType === 'meta_full_client_conversion' || cardType === 'metaFullClientConversion') {
        source = 'meta';
      } else if (cardType === 'google_full_client_conversion') {
        source = 'google';
      } else if (cardType === 'klaviyo_full_client_conversion') {
        source = 'klaviyo';
      }

      const params = new URLSearchParams({
        startDate,
        endDate,
      });
      if (source) {
        params.append('source', source);
      }

      const response = await fetch(`/api/submissions/analytics/full-client-conversion?${params}`);
      if (!response.ok) {
        const errorData = await response.json().catch(() => ({ error: 'Unknown error' }));
        throw new Error(errorData.error || `HTTP ${response.status}: ${response.statusText}`);
      }
      const result = await response.json();
      setFullClientConversionSource(source);
      
      // Set the appropriate data state based on source
      if (source === 'meta') {
        setMetaFullClientConversionData(result);
        setFullClientConversionData(result);
      } else if (source === 'google') {
        setGoogleFullClientConversionData(result);
        setFullClientConversionData(result);
      } else if (source === 'klaviyo') {
        setKlaviyoFullClientConversionData(result);
        setFullClientConversionData(result);
      } else {
        setFullClientConversionData(result);
      }
    } catch (err) {
      console.error("Error fetching full client conversion:", err);
      setError(err.message || "Failed to load full client conversion data");
    } finally {
      setFullClientConversionLoading(false);
    }
  };
  // Metric display names
  const metricDisplayNames = {
    'total_form_views': 'Total Form Views',
    'total_leads': 'Total Leads',
    'total_registrations': 'Total Registrations',
    'total_revenue': 'Total Revenue from Booking Forms',
    'full_client_conversion_rate': 'Full Client Conversion Rate',
    'meta_form_views': 'Meta Form Views',
    'meta_leads': 'Meta Leads',
    'meta_registrations': 'Meta Registrations',
    'meta_revenue': 'Meta Revenue',
    'ad_impressions': 'Ad Impressions',
    'ad_clicks': 'Ad Clicks',
    'ad_spend': 'Ad Spend',
    'roas': 'ROAS',
    'realized_revenue': 'Realized Revenue',
    'false_starts': 'False Starts',
    'actual_roas': 'Actual ROAS (AROAS)',
    'cpl': 'Cost Per Lead (CPL)',
    'cpr': 'Cost Per Registration (CPR)',
    'meta_full_client_conversion_rate': 'Meta Full Client Conversion Rate',
    'google_full_client_conversion_rate': 'Google Full Client Conversion Rate',
    'klaviyo_full_client_conversion_rate': 'Klaviyo Full Client Conversion Rate',
    'enterprise_core_funnel': 'Ad Funnel Performance',
    'enterprise_revenue': 'Revenue & Return Performance',
    'enterprise_conversion': 'Conversion & User Behavior',
    'enterprise_efficiency': 'Efficiency & Spend Distribution',
    'enterprise_strategic': 'Advanced Growth & Forecasting',
    // Google metrics
    'google_form_views': 'Google Form Views',
    'google_form_starts': 'Google Leads',
    'google_form_completions': 'Google Registrations',
    'google_revenue': 'Google Revenue',
    'google_impressions': 'Google Ad Impressions',
    'google_clicks': 'Google Ad Clicks',
    'google_spend': 'Google Ad Spend',
    'google_roas': 'Google ROAS',
    'google_cpl': 'Google Cost Per Lead (CPL)',
    'google_cpr': 'Google Cost Per Registration (CPR)',
    'google_ltv_roas': 'Google LTV ROAS',
    'google_conversions': 'Google Conversions',
  };
  // Metric descriptions
  const metricDescriptions = {
    'total_form_views': 'Total number of times the booking form page was viewed',
    'total_leads': 'Total number of users who started filling out the form',
    'total_registrations': 'Total number of completed and paid registrations',
    'total_revenue': 'Total revenue from all booking form submissions',
    'meta_form_views': 'Number of form views attributed to Meta (Facebook/Instagram) ads',
    'meta_leads': 'Number of form starts attributed to Meta ads',
    'meta_registrations': 'Number of completed registrations from Meta ads',
    'meta_revenue': 'Total revenue from Meta-attributed registrations',
    'ad_impressions': 'Total number of ad impressions served',
    'ad_clicks': 'Total number of clicks on ads',
    'ad_spend': 'Total amount spent on advertising',
    'roas': 'Return on Ad Spend - revenue generated per dollar spent',
    'realized_revenue': 'Actual revenue generated by Meta-acquired clients over time',
    'false_starts': 'Meta-acquired clients with no completed lessons and dormant status',
    'actual_roas': 'ROAS based on realized revenue (actual post-trial revenue)',
    'cpl': 'Cost Per Lead - average cost to acquire one form start',
    'cpr': 'Cost Per Registration - average cost to acquire one completed registration',
    'enterprise_core_funnel': 'Complete customer acquisition funnel metrics (reach, CTR, conversion rates)',
    'enterprise_revenue': 'Comprehensive revenue metrics and profitability analysis',
    'enterprise_conversion': 'User engagement and conversion behavior metrics',
    'enterprise_efficiency': 'Cost efficiency and spend allocation metrics',
    'enterprise_strategic': 'Strategic KPIs for long-term growth planning and forecasting',
    // Google metric descriptions
    'google_form_views': 'Number of form views attributed to Google Ads. Tracks users who viewed the booking form after clicking a Google ad, identified by UTM parameters (utm_source=google) or gclid.',
    'google_form_starts': 'Number of form starts attributed to Google Ads. These are users who began filling out the booking form after clicking a Google ad. Click to see detailed lead information and customer attribution.',
    'google_form_completions': 'Number of completed registrations from Google Ads. These are paid/verified bookings from users who clicked Google ads. Click to see conversion details and customer information.',
    'google_revenue': 'Total revenue from Google-attributed registrations. This is the sum of all paid bookings from users who came through Google Ads. Click to see detailed revenue breakdown by customer.',
    'google_impressions': 'Total number of Google ad impressions served. This is how many times your Google ads were displayed to users. Click to see impression data by campaign and date.',
    'google_clicks': 'Total number of clicks on Google ads. This tracks when users clicked on your Google ads. Click to see click data by campaign and date.',
    'google_spend': 'Total amount spent on Google Ads. This is your advertising cost for Google campaigns. Click to see spend breakdown by campaign and date.',
    'google_roas': 'Google Return on Ad Spend - revenue generated per dollar spent on Google Ads. Calculated as Google Revenue / Google Ad Spend. Click to see ROAS breakdown by campaign.',
    'google_cpl': 'Google Cost Per Lead - average cost to acquire one form start from Google Ads. Calculated as Google Ad Spend / Google Leads. Click to see CPL by campaign.',
    'google_cpr': 'Google Cost Per Registration - average cost to acquire one completed registration from Google Ads. Calculated as Google Ad Spend / Google Registrations. Click to see CPR by campaign.',
    'google_ltv_roas': 'Google Lifetime Value ROAS - revenue generated per dollar spent, based on customer lifetime value. This accounts for long-term customer value, not just initial booking revenue. Click to see LTV ROAS breakdown.',
    'google_conversions': 'Number of conversions tracked by Google Ads API. These are actions Google considers conversions (e.g., form submissions, purchases). Click to see conversion details and tie them to specific customers.',
  };
  // Category definitions with their metrics
  const metricCategories = {
    'overall': {
      label: 'Overall Metrics',
      metrics: ['total_form_views', 'total_leads', 'total_registrations', 'total_revenue'],
      color: 'primary.main'
    },
    'meta_ads': {
      label: 'Meta Ads Performance',
      metrics: ['meta_form_views', 'meta_leads', 'meta_registrations', 'meta_revenue'],
      color: 'secondary.main'
    },
    'meta_kpis': {
      label: 'Meta Ad Performance KPIs',
      metrics: ['ad_impressions', 'ad_clicks', 'ad_spend', 'roas', 'realized_revenue', 'false_starts', 'actual_roas', 'cpl', 'cpr'],
      color: 'info.main'
    },
    'enterprise': {
      label: 'Enterprise Analytics Sections',
      metrics: ['enterprise_core_funnel', 'enterprise_revenue', 'enterprise_conversion', 'enterprise_efficiency', 'enterprise_strategic'],
      color: 'success.main'
    }
  };

  const handleMetricVisibilityToggle = async (metricKey) => {
    const updated = {
      ...visibleMetrics,
      [metricKey]: !visibleMetrics[metricKey]
    };
    setVisibleMetrics(updated);
    
    // Save to localStorage as immediate backup
    try {
      if (typeof window !== 'undefined' && window.localStorage) {
        localStorage.setItem('marketingAnalyticsVisibleMetrics', JSON.stringify(updated));
      }
    } catch (e) {
      console.warn('Error saving visible metrics to localStorage:', e);
    }

    // Save to database via API
    try {
      const response = await fetch('/api/submissions/analytics/preferences', {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json'
        },
        credentials: 'include',
        body: JSON.stringify({
          visibleMetrics: updated
        })
      });

      if (!response.ok) {
        console.warn('Failed to save preferences to database, using localStorage backup');
        // Preferences are already saved to localStorage, so user can still continue
      }
    } catch (err) {
      console.warn('Error saving preferences to database:', err);
      // Preferences are already saved to localStorage, so user can still continue
    }
  };

  // Toggle entire category on/off
  const handleCategoryToggle = async (categoryKey) => {
    const category = metricCategories[categoryKey];
    if (!category) return;

    // Check if all metrics in category are currently visible
    const allVisible = category.metrics.every(metric => visibleMetrics[metric]);
    const newValue = !allVisible;

    // Update all metrics in the category
    const updated = { ...visibleMetrics };
    category.metrics.forEach(metric => {
      updated[metric] = newValue;
    });

    setVisibleMetrics(updated);

    // Save to localStorage as immediate backup
    try {
      if (typeof window !== 'undefined' && window.localStorage) {
        localStorage.setItem('marketingAnalyticsVisibleMetrics', JSON.stringify(updated));
      }
    } catch (e) {
      console.warn('Error saving visible metrics to localStorage:', e);
    }

    // Save to database via API
    try {
      const response = await fetch('/api/submissions/analytics/preferences', {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json'
        },
        credentials: 'include',
        body: JSON.stringify({
          visibleMetrics: updated
        })
      });

      if (!response.ok) {
        console.warn('Failed to save preferences to database, using localStorage backup');
      }
    } catch (err) {
      console.warn('Error saving preferences to database:', err);
    }
  };
  const handleAroasClick = async () => {
    setAroasModalOpen(true);
    setAroasModalLoading(true);
    setAroasModalData(null);
    setError(null);

    try {
      const now = DateTime.now().setZone("America/New_York");
      const selectedStartMonth = dateRangeValue?.startDate
        ? DateTime.fromISO(dateRangeValue.startDate, { zone: "America/New_York" }).startOf("month")
        : now.startOf("month");

      // Look back up to 6 months prior to the selected start month for additional context
      const fetchStartMonth = selectedStartMonth.minus({ months: 6 }).startOf("month");
      const startDate = fetchStartMonth.toISODate();
      const endDate = now.endOf("month").toISODate();

      // Fetch historical realized revenue data
      const realizedRevenueParams = new URLSearchParams({
        startDate,
        endDate,
      });

      const realizedRevenueResponse = await fetch(`/api/submissions/analytics/realized-revenue?${realizedRevenueParams}`);
      if (!realizedRevenueResponse.ok) {
        throw new Error('Failed to fetch realized revenue data');
      }
      const realizedRevenueResult = await realizedRevenueResponse.json();

      // Get monthly realized revenue data
      const monthlyRealizedRevenue = realizedRevenueResult.monthly || [];
      const cohortMonthlyRaw = realizedRevenueResult.cohortMonthly || [];
      
      // Use enterpriseTrendsData if available, otherwise fetch it
      let monthlyAdSpendData = [];
      if (enterpriseTrendsData && enterpriseTrendsData.monthlyData) {
        monthlyAdSpendData = enterpriseTrendsData.monthlyData;
      } else {
        // Fetch enterprise trends if not already loaded
        const trendsResponse = await fetch('/api/submissions/analytics/enterprise-trends');
        if (trendsResponse.ok) {
          const trendsResult = await trendsResponse.json();
          monthlyAdSpendData = trendsResult.monthlyData || [];
        }
      }

      // Create a map of month -> ad spend for quick lookup
      const adSpendByMonth = new Map();
      monthlyAdSpendData.forEach(month => {
        // month field is in format "MMM yyyy" (e.g., "Jan 2025")
        if (month.month && month.metaSpend) {
          adSpendByMonth.set(month.month, parseFloat(month.metaSpend) || 0);
        }
      });

      // Combine realized revenue with ad spend to calculate AROAS
      const aroasData = monthlyRealizedRevenue
        .map(month => {
          // Parse the period - it's a PostgreSQL timestamp converted to text
          // Could be in format: "2025-01-01 00:00:00+00" or ISO format
          let monthLabel = '';
          let periodDate = null;
          
          if (month.period) {
            try {
              let periodStr = month.period;
              
              // PostgreSQL DATE_TRUNC returns timestamps like "2025-01-01 00:00:00" or "2025-01-01 00:00:00+00"
              // Convert SQL timestamp format to ISO if needed
              if (periodStr.includes(' ') && !periodStr.includes('T')) {
                // Replace space with T to make it ISO-like: "2025-01-01T00:00:00"
                periodStr = periodStr.replace(' ', 'T');
              }
              
              // Try parsing as ISO first
              periodDate = DateTime.fromISO(periodStr);
              
              // If that fails, try parsing as regular date string (JavaScript Date is more forgiving)
              if (!periodDate.isValid) {
                const jsDate = new Date(month.period);
                if (!isNaN(jsDate.getTime())) {
                  periodDate = DateTime.fromJSDate(jsDate);
                }
              }
              
              if (periodDate.isValid) {
                monthLabel = periodDate.toFormat('MMM yyyy');
              } else {
                // Last resort: try to extract YYYY-MM-DD pattern and parse just the date part
                const dateMatch = month.period.match(/(\d{4}-\d{2}-\d{2})/);
                if (dateMatch) {
                  periodDate = DateTime.fromISO(dateMatch[1]);
                  if (periodDate.isValid) {
                    monthLabel = periodDate.toFormat('MMM yyyy');
                  } else {
                    monthLabel = month.period;
                    console.warn('Could not parse period:', month.period);
                  }
                } else {
                  monthLabel = month.period;
                  console.warn('Could not parse period:', month.period);
                }
              }
            } catch (e) {
              console.error('Error parsing period:', month.period, e);
              monthLabel = month.period || 'Unknown';
            }
          } else {
            monthLabel = 'Unknown';
          }

          const realizedRevenue = parseFloat(month.total_revenue || 0);
          
          // Try to match with ad spend by month label
          let adSpend = adSpendByMonth.get(monthLabel) || 0;
          
          // If no match found, try matching by actual date if we have periodDate
          if (adSpend === 0 && periodDate && periodDate.isValid) {
            // Try matching with different month formats
            const altFormats = [
              periodDate.toFormat('MMM yyyy'),
              periodDate.toFormat('MMMM yyyy'),
              periodDate.toFormat('MM/yyyy'),
            ];
            
            for (const altFormat of altFormats) {
              const matched = adSpendByMonth.get(altFormat);
              if (matched) {
                adSpend = matched;
                monthLabel = altFormat; // Use the matched format
                break;
              }
            }
          }
          
          const aroas = adSpend > 0 ? (realizedRevenue / adSpend) : 0;
          const cumulativeRevenue = parseFloat(month.cumulative_revenue || 0);

          return {
            month: monthLabel,
            period: month.period,
            periodDate: periodDate?.isValid ? periodDate.toMillis() : null, // Store for sorting
            realizedRevenue,
            adSpend,
            aroas: parseFloat(aroas.toFixed(2)),
            activeClients: month.active_clients || 0,
            cumulativeRevenue,
            breakEven: 1.0 // Constant line for break-even reference
          };
        })
        .filter(item => item.month && item.month !== 'Unknown') // Filter out items without valid month labels
        .sort((a, b) => {
          // Sort by periodDate if available, otherwise by month string
          if (a.periodDate && b.periodDate) {
            return a.periodDate - b.periodDate;
          }
          
          // Fallback to parsing month string
          try {
            const dateA = DateTime.fromFormat(a.month, 'MMM yyyy');
            const dateB = DateTime.fromFormat(b.month, 'MMM yyyy');
            if (dateA.isValid && dateB.isValid) {
              return dateA.toMillis() - dateB.toMillis();
            }
          } catch (e) {
            // Ignore parsing errors
          }
          
          return a.month.localeCompare(b.month);
        });

      // Calculate summary metrics using months up to the latest realized revenue
      let summarySeries = aroasData;
      for (let i = aroasData.length - 1; i >= 0; i -= 1) {
        if ((aroasData[i].realizedRevenue || 0) > 0) {
          summarySeries = aroasData.slice(0, i + 1);
          break;
        }
      }

      const currentEntry = summarySeries.length > 0 ? summarySeries[summarySeries.length - 1] : null;
      const previousEntry = summarySeries.length > 1 ? summarySeries[summarySeries.length - 2] : null;

      const currentAroas = currentEntry ? currentEntry.aroas : 0;
      const previousAroas = previousEntry ? previousEntry.aroas : 0;
      const aroasChange = previousAroas > 0 ? ((currentAroas - previousAroas) / previousAroas) * 100 : 0;
      const totalRealizedRevenue = summarySeries.reduce((sum, m) => sum + m.realizedRevenue, 0);
      const totalAdSpend = summarySeries.reduce((sum, m) => sum + m.adSpend, 0);
      const overallAroas = totalAdSpend > 0 ? (totalRealizedRevenue / totalAdSpend) : 0;
      const breakEvenPoint = aroasData.findIndex(m => m.aroas >= 1.0); // First month where AROAS >= 1.0

      // Cohort (selected month) analysis
      const cohortMonthIso = selectedStartMonth.toISODate();
      const cohortLabel = selectedStartMonth.toFormat('MMM yyyy');
      const cohortAdSpend = adSpendByMonth.get(cohortLabel) || 0;

      const cohortTimeline = cohortMonthlyRaw
        .filter(entry => {
          if (!entry?.cohort_month) return false;
          const entryMonth = DateTime.fromISO(entry.cohort_month, { zone: "UTC" }).startOf('month');
          return entryMonth.isValid && entryMonth.toISODate() === cohortMonthIso;
        })
        .map(entry => {
          const revenueMonthDate = entry.revenue_month
            ? DateTime.fromISO(entry.revenue_month, { zone: "UTC" }).setZone("America/New_York").startOf('month')
            : null;
          const monthLabel = revenueMonthDate?.isValid ? revenueMonthDate.toFormat('MMM yyyy') : 'No revenue yet';
          // Use monthly_revenue from API (shows revenue for that specific month, not cumulative)
          const monthlyRevenue = parseFloat(entry.monthly_revenue || entry.total_revenue || 0);
          // For cohort analysis, we show monthly revenue, not cumulative
          // cumulative_revenue is kept for backward compatibility but equals monthly_revenue
          const cumulativeRevenue = parseFloat(entry.monthly_revenue || entry.cumulative_revenue || entry.total_revenue || 0);
          const monthsSinceAcquisition = revenueMonthDate?.isValid
            ? Math.max(0, Math.round(revenueMonthDate.diff(selectedStartMonth, 'months').months))
            : null;
          return {
            month: monthLabel,
            revenueMonthDate,
            monthlyRevenue,
            cumulativeRevenue: monthlyRevenue, // Use monthly revenue for cohort analysis
            activeClients: entry.active_clients || 0,
            monthsSinceAcquisition,
          };
        })
        .sort((a, b) => {
          if (a.revenueMonthDate && b.revenueMonthDate) {
            return a.revenueMonthDate.toMillis() - b.revenueMonthDate.toMillis();
          }
          if (a.revenueMonthDate) return -1;
          if (b.revenueMonthDate) return 1;
          return 0;
        });

      // For cohort chart, show monthly revenue per month (not cumulative)
      // Calculate running total separately for break-even analysis
      let runningTotal = 0;
      const cohortTimelineChart = cohortTimeline.map(item => {
        return {
          month: item.month,
          monthlyRevenue: item.monthlyRevenue,
          cumulativeRevenue: (runningTotal += item.monthlyRevenue), // Running total for reference
          adSpend: cohortAdSpend,
        };
      });

      const cohortClientsRaw = (realizedRevenueResult.clients || []).filter(client => {
        if (!client?.acquisition_date) return false;
        const acquisition = DateTime.fromISO(client.acquisition_date, { zone: "UTC" }).setZone("America/New_York").startOf('month');
        return acquisition.isValid && acquisition.toISODate() === cohortMonthIso;
      });

      const cohortClients = cohortClientsRaw.map(client => ({
        submissionId: client.submission_id,
        parentName: client.parent_name || '—',
        parentEmail: client.parent_email || '—',
        bookingType: client.booking_type || '—',
        totalRevenue: parseFloat(client.total_revenue || 0),
        invoiceCount: client.invoice_count || 0,
        firstPaymentDate: client.first_payment_date,
        lastPaymentDate: client.last_payment_date,
      }));

      // Calculate total revenue by summing all monthly revenues (not using cumulative)
      const cohortCumulativeRevenue = cohortTimeline.length > 0
        ? cohortTimeline.reduce((sum, entry) => sum + entry.monthlyRevenue, 0)
        : cohortClients.reduce((sum, client) => sum + client.totalRevenue, 0);

      const cohortCurrentAroas = cohortAdSpend > 0 ? (cohortCumulativeRevenue / cohortAdSpend) : 0;
      // Calculate running total for break-even analysis
      let breakEvenRunningTotal = 0;
      const cohortBreakEvenEntry = cohortTimeline.find(entry => {
        breakEvenRunningTotal += entry.monthlyRevenue;
        return breakEvenRunningTotal >= cohortAdSpend;
      });
      const cohortBreakEvenMonth = cohortBreakEvenEntry?.month || null;
      const cohortMonthsToBreakEven = cohortBreakEvenEntry?.revenueMonthDate
        ? Math.max(0, Math.round(cohortBreakEvenEntry.revenueMonthDate.diff(selectedStartMonth, 'months').months))
        : null;
      const cohortMonthsTracked = cohortTimeline.length > 0
        ? Math.max(1, Math.round((cohortTimeline[cohortTimeline.length - 1]?.revenueMonthDate || selectedStartMonth).diff(selectedStartMonth, 'months').months) + 1)
        : 0;

      const cohortData = {
        label: cohortLabel,
        monthIso: cohortMonthIso,
        adSpend: cohortAdSpend,
        totalRevenue: cohortCumulativeRevenue,
        currentAroas: cohortCurrentAroas,
        breakEvenMonth: cohortBreakEvenMonth,
        monthsToBreakEven: cohortMonthsToBreakEven,
        monthsTracked: cohortMonthsTracked,
        monthsSinceAcquisition: Math.max(0, Math.round(now.diff(selectedStartMonth, 'months').months)),
        timeline: cohortTimelineChart,
        timelineRaw: cohortTimeline,
        clients: cohortClients,
        clientCount: cohortClients.length,
      };

      setAroasModalData({
        monthly: aroasData,
        summary: {
          currentAroas,
          previousAroas,
          aroasChange,
          totalRealizedRevenue,
          totalAdSpend,
          overallAroas,
          breakEvenMonth: breakEvenPoint >= 0 ? aroasData[breakEvenPoint]?.month : null,
          monthsTracked: summarySeries.length
        },
        cohort: cohortData
      });
    } catch (err) {
      console.error("Error fetching AROAS data:", err);
      setError(err.message || "Failed to load AROAS data");
    } finally {
      setAroasModalLoading(false);
    }
  };
  const handleCloseModal = () => {
    setModalOpen(false);
    setModalData(null);
    setModalSubmissions([]);
    setModalDetailView(false);
    setModalDetailData(null);
    setDeleteConfirmOpen(false);
    setRoasSummary(null);
    setError(null); // Clear error when closing
  };
  const handleEnterpriseKpiClick = (kpiKey) => {
    if (!enterpriseData || !enterpriseData.metrics) return;
    
    // Get the metric value and calculation details
    let metricValue = null;
    let calculation = null;
    let rawData = null;
    
    // Find the metric value across all sections
    const allMetrics = {
      ...enterpriseData.metrics.coreFunnel,
      ...enterpriseData.metrics.revenue,
      ...enterpriseData.metrics.conversion,
      ...enterpriseData.metrics.efficiency,
      ...enterpriseData.metrics.strategic
    };
    
    metricValue = allMetrics[kpiKey];
    
    // Handle special cases where metricValue is an object (roasByMarket, roasByChannel)
    // These are already displayed as breakdowns below, so we'll show a summary instead
    if (kpiKey === 'roasByMarket' || kpiKey === 'roasByChannel') {
      const breakdownData = metricValue || {};
      const markets = Object.keys(breakdownData);
      if (markets.length === 0) {
        // No data available
        setEnterpriseModalData({
          title: kpiKey === 'roasByMarket' ? 'ROAS by Market' : 'ROAS by Channel',
          kpiKey,
          calculation: {
            formula: 'Breakdown by ' + (kpiKey === 'roasByMarket' ? 'geographic market' : 'marketing channel'),
            inputs: {},
            result: 'No data available'
          }
        });
        setEnterpriseModalOpen(true);
        return;
      }
      
      // Calculate average ROAS
      const values = Object.values(breakdownData).filter(v => typeof v === 'number');
      const avgRoas = values.length > 0 
        ? values.reduce((sum, val) => sum + val, 0) / values.length 
        : 0;
      
      setEnterpriseModalData({
        title: kpiKey === 'roasByMarket' ? 'ROAS by Market' : 'ROAS by Channel',
        kpiKey,
        calculation: {
          formula: kpiKey === 'roasByMarket' 
            ? 'ROAS by Market = LTV Revenue by Market ÷ Ad Spend by Market'
            : 'ROAS by Channel = LTV Revenue by Channel ÷ Ad Spend by Channel',
          inputs: Object.entries(breakdownData).reduce((acc, [key, value]) => {
            acc[key] = value;
            return acc;
          }, {}),
          result: avgRoas
        }
      });
      setEnterpriseModalOpen(true);
      return;
    }
    
    // Define calculation breakdowns for each KPI
    const calculations = {
      reach: {
        formula: 'Reach = Meta Impressions (approximate unique users)',
        inputs: {
          'Meta Impressions': enterpriseData.raw?.meta_impressions || 0
        },
        result: metricValue
      },
      ctr: {
        formula: 'CTR = (Clicks ÷ Impressions) × 100',
        inputs: {
          'Total Clicks': enterpriseData.raw?.total_clicks || 0,
          'Total Impressions': enterpriseData.raw?.total_impressions || 0
        },
        result: metricValue
      },
      cpc: {
        formula: 'CPC = Ad Spend ÷ Clicks',
        inputs: {
          'Total Ad Spend': enterpriseData.raw?.total_spend || 0,
          'Total Clicks': enterpriseData.raw?.total_clicks || 0
        },
        result: metricValue
      },
      cpl: {
        formula: 'CPL = Meta Spend ÷ Leads',
        inputs: {
          'Meta Spend': enterpriseData.raw?.meta_spend || 0,
          'Meta Leads': enterpriseData.raw?.facebook_form_starts || 0
        },
        result: metricValue
      },
      cpr: {
        formula: 'CPR = Meta Spend ÷ Registrations',
        inputs: {
          'Meta Spend': enterpriseData.raw?.meta_spend || 0,
          'Meta Registrations': enterpriseData.raw?.facebook_form_completions || 0
        },
        result: metricValue
      },
      trialRoas: {
        formula: 'Trial ROAS = Trial Revenue ÷ Ad Spend',
        inputs: {
          'Trial Revenue': enterpriseData.raw?.facebook_revenue || 0,
          'Meta Ad Spend': enterpriseData.raw?.meta_spend || 0
        },
        result: metricValue
      },
      lifetimeRoas: {
        formula: 'Lifetime ROAS = (LTV Revenue) ÷ Ad Spend',
        inputs: {
          'LTV Revenue': enterpriseData.raw?.facebookLtvRevenue || 0,
          'Meta Ad Spend': enterpriseData.raw?.meta_spend || 0
        },
        result: metricValue
      },
      aov: {
        formula: 'AOV = Total Revenue ÷ Number of Payments',
        inputs: {
          'Total Revenue': enterpriseData.raw?.revenue || 0,
          'Total Payments': enterpriseData.raw?.payments || 0
        },
        result: metricValue
      },
      cac: {
        formula: 'CAC = Total Ad Spend ÷ Registrations',
        inputs: {
          'Total Ad Spend': enterpriseData.raw?.total_spend || 0,
          'Registrations': enterpriseData.raw?.form_completions || 0
        },
        result: metricValue
      },
      grossMargin: {
        formula: 'Gross Margin = ((Trial Revenue + Lifetime Revenue) × 0.43) ÷ (Trial Revenue + Lifetime Revenue) × 100',
        inputs: {
          'Trial Revenue': enterpriseData.raw?.facebook_revenue || 0,
          'Lifetime Revenue': enterpriseData.raw?.facebookLtvRevenue || 0,
          'Margin Rate': 0.43
        },
        result: (() => {
          // Recalculate to ensure accuracy - explicitly convert to numbers
          const trialRevenue = Number(enterpriseData.raw?.facebook_revenue) || 0;
          const lifetimeRevenue = Number(enterpriseData.raw?.facebookLtvRevenue) || 0;
          const totalRevenue = trialRevenue + lifetimeRevenue;
          if (totalRevenue > 0) {
            return parseFloat(((totalRevenue * 0.43) / totalRevenue * 100).toFixed(2));
          }
          return metricValue || 0;
        })()
      },
      ltvCacRatio: {
        formula: 'LTV:CAC Ratio = Average LTV ÷ CAC',
        inputs: {
          'Average LTV': enterpriseData.metrics.revenue?.avgLtv || 0,
          'CAC': enterpriseData.metrics.efficiency?.cac || 0
        },
        result: metricValue
      },
      formViews: {
        formula: 'Form Views = Total number of booking form page views',
        inputs: {
          'Total Form Views': enterpriseData.raw?.form_views || 0
        },
        result: metricValue
      },
      formStarts: {
        formula: 'Leads = Number of users who began filling the form',
        inputs: {
          'Total Leads': enterpriseData.raw?.form_starts || 0
        },
        result: metricValue
      },
      formCompletions: {
        formula: 'Registrations = Paid/Verified registrations',
        inputs: {
          'Total Registrations': enterpriseData.raw?.form_completions || 0
        },
        result: metricValue
      },
      trialConversionRate: {
        formula: 'Trial Conversion Rate = (Registrations ÷ Leads) × 100',
        inputs: {
          'Registrations': enterpriseData.raw?.form_completions || 0,
          'Leads': enterpriseData.raw?.form_starts || 0
        },
        result: metricValue
      },
      bounceRate: {
        formula: 'Bounce Rate = ((Form Views - Leads) ÷ Form Views) × 100',
        inputs: {
          'Form Views': enterpriseData.raw?.form_views || 0,
          'Leads': enterpriseData.raw?.form_starts || 0
        },
        result: metricValue
      },
      conversionRate: {
        formula: 'Conversion Rate = (Registrations ÷ Leads) × 100',
        inputs: {
          'Registrations': enterpriseData.raw?.form_completions || 0,
          'Leads': enterpriseData.raw?.form_starts || 0
        },
        result: metricValue
      },
      formAbandonmentRate: {
        formula: 'Form Abandonment Rate = ((Leads - Registrations) ÷ Leads) × 100',
        inputs: {
          'Leads': enterpriseData.raw?.form_starts || 0,
          'Registrations': enterpriseData.raw?.form_completions || 0
        },
        result: metricValue
      },
      frequency: {
        formula: 'Frequency = Impressions ÷ Unique Sessions',
        inputs: {
          'Meta Impressions': enterpriseData.raw?.meta_impressions || 0,
          'Unique View Sessions': enterpriseData.raw?.unique_view_sessions || 0
        },
        result: metricValue
      },
      cpm: {
        formula: 'CPM = (Ad Spend ÷ Impressions) × 1,000',
        inputs: {
          'Total Ad Spend': enterpriseData.raw?.total_spend || 0,
          'Total Impressions': enterpriseData.raw?.total_impressions || 0
        },
        result: metricValue
      },
      shortTermRoas: {
        formula: 'Short-Term ROAS = Trial Revenue ÷ Ad Spend',
        inputs: {
          'Trial Revenue': enterpriseData.raw?.facebook_revenue || 0,
          'Meta Ad Spend': enterpriseData.raw?.meta_spend || 0
        },
        result: metricValue
      },
      blendedRoas: {
        formula: 'Blended ROAS = (Trial Revenue + Lifetime Revenue) ÷ Ad Spend',
        inputs: {
          'Trial Revenue': enterpriseData.raw?.facebook_revenue || 0,
          'Lifetime Revenue': enterpriseData.raw?.facebookLtvRevenue || 0,
          'Meta Ad Spend': enterpriseData.raw?.meta_spend || 0
        },
        result: (() => {
          // Recalculate to ensure accuracy - explicitly convert to numbers
          const trialRevenue = Number(enterpriseData.raw?.facebook_revenue) || 0;
          const lifetimeRevenue = Number(enterpriseData.raw?.facebookLtvRevenue) || 0;
          const adSpend = Number(enterpriseData.raw?.meta_spend) || 0;
          if (adSpend > 0 && (trialRevenue + lifetimeRevenue) > 0) {
            return parseFloat(((trialRevenue + lifetimeRevenue) / adSpend).toFixed(2));
          }
          return metricValue || 0;
        })()
      },
      poas: {
        formula: 'POAS = ((Trial Revenue + Lifetime Revenue × Net Margin) - Ad Spend) ÷ Ad Spend',
        inputs: {
          'Trial Revenue': enterpriseData.raw?.facebook_revenue || 0,
          'Lifetime Revenue': enterpriseData.raw?.facebookLtvRevenue || 0,
          'Net Margin': 0.43379676,
          'Meta Ad Spend': enterpriseData.raw?.meta_spend || 0
        },
        result: (() => {
          // Recalculate to ensure accuracy - explicitly convert to numbers
          const trialRevenue = Number(enterpriseData.raw?.facebook_revenue) || 0;
          const lifetimeRevenue = Number(enterpriseData.raw?.facebookLtvRevenue) || 0;
          const netMargin = 0.43379676;
          const adSpend = Number(enterpriseData.raw?.meta_spend) || 0;
          if (adSpend > 0 && (trialRevenue + lifetimeRevenue) > 0) {
            const profit = (trialRevenue + (lifetimeRevenue * netMargin)) - adSpend;
            return parseFloat((profit / adSpend).toFixed(2));
          }
          return metricValue || 0;
        })()
      },
      netMarginAfterAdSpend: {
        formula: 'Net Margin = (((Trial Revenue + Lifetime Revenue) × 0.43) - Ad Spend) ÷ (Trial Revenue + Lifetime Revenue) × 100',
        inputs: {
          'Trial Revenue': enterpriseData.raw?.facebook_revenue || 0,
          'Lifetime Revenue': enterpriseData.raw?.facebookLtvRevenue || 0,
          'Margin Rate': 0.43,
          'Meta Ad Spend': enterpriseData.raw?.meta_spend || 0
        },
        result: (() => {
          // Recalculate to ensure accuracy - explicitly convert to numbers
          const trialRevenue = Number(enterpriseData.raw?.facebook_revenue) || 0;
          const lifetimeRevenue = Number(enterpriseData.raw?.facebookLtvRevenue) || 0;
          const adSpend = Number(enterpriseData.raw?.meta_spend) || 0;
          const totalRevenue = trialRevenue + lifetimeRevenue;
          if (totalRevenue > 0) {
            return parseFloat(((totalRevenue * 0.43 - adSpend) / totalRevenue * 100).toFixed(2));
          }
          return metricValue || 0;
        })()
      },
      totalAdAttributedRevenue: {
        formula: 'Total Ad Revenue = Sum of all paid trial revenue from Meta ads',
        inputs: {
          'Meta Trial Revenue': enterpriseData.raw?.facebook_revenue || 0
        },
        result: metricValue
      },
      avgLtv: {
        formula: 'Average LTV = Average lifetime value across all client labels',
        inputs: {
          'Average LTV': metricValue
        },
        result: metricValue
      },
      predictedLtv: {
        formula: 'Predicted LTV = Sum of (Average Revenue per Lesson × Retention Probability) for lessons 1-20',
        inputs: (() => {
          // Get retention data from backend
          const retentionData = enterpriseData.raw?.predictedLTVData?.retentionData || {};
          const predictedLTVByLabel = enterpriseData.raw?.predictedLTVData?.predictedLTVByLabel || {};
          
          // Calculate summary statistics
          const labels = Object.keys(retentionData);
          if (labels.length === 0) {
            return {
              'Calculation Method': 'Historical Average (insufficient retention data)',
              'Average LTV': enterpriseData.metrics.revenue?.avgLtv || 0
            };
          }
          
          // Get average retention rates across all labels
          const avgRetentionRate1To2 = labels.length > 0
            ? labels.reduce((sum, label) => sum + (retentionData[label].retentionRate1To2 || 0), 0) / labels.length
            : 0;
          const avgRetentionRate2To3 = labels.length > 0
            ? labels.reduce((sum, label) => sum + (retentionData[label].retentionRate2To3 || 0), 0) / labels.length
            : 0;
          const avgRevenuePerLesson = labels.length > 0
            ? labels.reduce((sum, label) => sum + (retentionData[label].avgRevenuePerLesson || 0), 0) / labels.length
            : 0;
          
          // Calculate overall predicted LTV
          const overallPredictedLTV = labels.length > 0
            ? labels.reduce((sum, label) => sum + (predictedLTVByLabel[label] || 0), 0) / labels.length
            : 0;
          
          return {
            'Number of Labels Analyzed': labels.length,
            'Average Revenue per Lesson': parseFloat(avgRevenuePerLesson.toFixed(2)),
            'Retention Rate (1→2 lessons)': parseFloat(avgRetentionRate1To2.toFixed(2)) + '%',
            'Retention Rate (2→3 lessons)': parseFloat(avgRetentionRate2To3.toFixed(2)) + '%',
            'Predicted Average LTV': parseFloat(overallPredictedLTV.toFixed(2))
          };
        })(),
        result: metricValue
      },
      incrementalRevenuePerDollar: {
        formula: 'Incremental Revenue = LTV Revenue ÷ Total Ad Spend',
        inputs: {
          'LTV Revenue': enterpriseData.raw?.facebookLtvRevenue || 0,
          'Total Ad Spend': enterpriseData.raw?.total_spend || 0
        },
        result: metricValue
      },
      revenuePerImpression: {
        formula: 'Revenue per Impression = Total Revenue ÷ Impressions',
        inputs: {
          'Total Revenue': enterpriseData.raw?.revenue || 0,
          'Total Impressions': enterpriseData.raw?.total_impressions || 0
        },
        result: metricValue
      },
      multiTouchRoas: {
        formula: 'Multi-Touch ROAS = LTV Revenue ÷ Ad Spend (accounts for all touchpoints)',
        inputs: {
          'LTV Revenue': enterpriseData.raw?.facebookLtvRevenue || 0,
          'Meta Ad Spend': enterpriseData.raw?.meta_spend || 0
        },
        result: metricValue
      }
    };
    calculation = calculations[kpiKey] || {
      formula: 'Calculation details not available',
      inputs: {},
      result: metricValue
    };
    
    setEnterpriseModalData({
      kpiKey,
      title: kpiKey.charAt(0).toUpperCase() + kpiKey.slice(1).replace(/([A-Z])/g, ' $1'),
      calculation,
      metricValue
    });
    setEnterpriseModalOpen(true);
  };
  // Get current user from localStorage
  const getCurrentUser = () => {
    try {
      const userData = localStorage.getItem("user");
      if (userData && userData !== "undefined") {
        return JSON.parse(userData);
      }
    } catch (error) {
      console.error("Error parsing user data:", error);
    }
    return null;
  };

  const isAdmin = () => {
    const user = getCurrentUser();
    const isAdminUser = user?.role === "admin";
    return isAdminUser;
  };

  const handleDeleteSubmission = async () => {
    if (!modalDetailData?.id) return;

    setDeleting(true);
    try {
      const response = await fetch(`/api/submissions/${modalDetailData.id}`, {
        method: "DELETE",
        credentials: 'include',
        headers: {
          "Content-Type": "application/json",
        },
      });

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({ error: 'Failed to delete submission' }));
        throw new Error(errorData.error || 'Failed to delete submission');
      }

      // Remove the deleted submission from the list if we're viewing a list
      if (modalSubmissions.length > 0) {
        setModalSubmissions((prev) => prev.filter((s) => s.id !== modalDetailData.id));
      }

      // Close both dialogs and return to list view
      setDeleteConfirmOpen(false);
      setModalDetailView(false);
      setModalDetailData(null);
    } catch (err) {
      console.error("Error deleting submission:", err);
      toast.error(`Failed to delete submission: ${err.message}`);
    } finally {
      setDeleting(false);
    }
  };

  const handleDeleteClick = () => {
    setDeleteConfirmOpen(true);
  };
  const handleCloseDeleteConfirm = () => {
    setDeleteConfirmOpen(false);
  };

  const handleSubmissionIdClick = async (submissionId) => {
    setModalDetailLoading(true);
    setModalDetailView(true);
    setError(null);
    try {
      const response = await fetch(`/api/submissions/${submissionId}`);
      if (!response.ok) {
        throw new Error('Failed to fetch submission details');
      }
      const detailData = await response.json();
      setModalDetailData(detailData);
    } catch (err) {
      console.error("Error fetching submission detail:", err);
      setError(err.message || "Failed to load submission details");
      setModalDetailView(false);
    } finally {
      setModalDetailLoading(false);
    }
  };

  const handleBackToList = () => {
    setModalDetailView(false);
    setModalDetailData(null);
  };

  const handleRealizedRevenueSubmissionClick = async (submissionId) => {
    setRealizedRevenueDetailLoading(true);
    setRealizedRevenueDetailView(true);
    setError(null);
    try {
      const response = await fetch(`/api/submissions/${submissionId}`);
      if (!response.ok) {
        throw new Error('Failed to fetch submission details');
      }
      const detailData = await response.json();
      setRealizedRevenueDetailData(detailData);
    } catch (err) {
      console.error("Error fetching submission detail:", err);
      setError(err.message || "Failed to load submission details");
      setRealizedRevenueDetailView(false);
    } finally {
      setRealizedRevenueDetailLoading(false);
    }
  };

  const handleBackToRealizedRevenue = () => {
    setRealizedRevenueDetailView(false);
    setRealizedRevenueDetailData(null);
  };

  const handleGoogleRealizedRevenueSubmissionClick = async (submissionId) => {
    setGoogleRealizedRevenueDetailLoading(true);
    setGoogleRealizedRevenueDetailView(true);
    setError(null);
    try {
      const response = await fetch(`/api/submissions/${submissionId}`);
      if (!response.ok) {
        throw new Error('Failed to fetch submission details');
      }
      const detailData = await response.json();
      setGoogleRealizedRevenueDetailData(detailData);
    } catch (err) {
      console.error("Error fetching submission detail:", err);
      setError(err.message || "Failed to load submission details");
      setGoogleRealizedRevenueDetailView(false);
    } finally {
      setGoogleRealizedRevenueDetailLoading(false);
    }
  };

  const handleBackToGoogleRealizedRevenue = () => {
    setGoogleRealizedRevenueDetailView(false);
    setGoogleRealizedRevenueDetailData(null);
  };

  const handleFalseStartsSubmissionClick = async (submissionId) => {
    setFalseStartsDetailLoading(true);
    setFalseStartsDetailView(true);
    setError(null);
    try {
      const response = await fetch(`/api/submissions/${submissionId}`);
      if (!response.ok) {
        throw new Error('Failed to fetch submission details');
      }
      const detailData = await response.json();
      setFalseStartsDetailData(detailData);
    } catch (err) {
      console.error("Error fetching submission detail:", err);
      setError(err.message || "Failed to load submission details");
      setFalseStartsDetailView(false);
    } finally {
      setFalseStartsDetailLoading(false);
    }
  };

  const handleBackToFalseStarts = () => {
    setFalseStartsDetailView(false);
    setFalseStartsDetailData(null);
  };

  // Helper functions for detail view
  const safeParseJson = (val) => {
    if (!val) return {};
    if (typeof val === 'string') {
      try {
        return JSON.parse(val);
      } catch {
        return {};
      }
    }
    return val || {};
  };

  const getUtmFromDetail = (d) => {
    const parsed = safeParseJson(d?.utm);
    return parsed;
  };

  const utmKeyLabel = (k = "") => {
    const map = {
      utm_source: "Source",
      utm_medium: "Medium",
      utm_campaign: "Campaign",
      utm_term: "Term",
      utm_content: "Content",
    };
    return map[k] || k.replace("utm_", "").replace(/_/g, " ");
  };

  const getLandingUrl = (d) => d?.landing_url || d?.landingUrl || "";

  const truncate = (val, n = 80) => {
    if (!val) return "";
    return val.length > n ? val.slice(0, n) + "..." : val;
  };

  const fmtShortDate = (d) => {
    if (!d) return "—";
    const dt = new Date(d);
    return `${(dt.getMonth() + 1).toString().padStart(2, "0")}/${dt
      .getDate()
      .toString()
      .padStart(2, "0")}/${dt.getFullYear()}`;
  };

  const getAge = (dob) => {
    if (!dob) return "";
    return Math.floor(
      (Date.now() - new Date(dob)) / (1000 * 60 * 60 * 24 * 365)
    );
  };

  const ratioMap = {
    "One Student": "1:1",
    "Two Students": "1:2",
    "Small Group (3+ Students)": "1:3",
  };

  // Show loading only if we're actually fetching
  // Check the appropriate loading state based on active tab
  const isActuallyLoading = dateRangeValue && dateRangeValue.startDate && dateRangeValue.endDate && (
    (activeTab === 0 && loading) ||
    (activeTab === 1 && googleLoading) ||
    (activeTab === 2 && klaviyoLoading)
  );
  // Show error only if it's a real error
  const showError = error;

  if (isActuallyLoading) {
    return (
      <Box display="flex" justifyContent="center" alignItems="center" minHeight="400px">
        <CircularProgress />
      </Box>
    );
  }
  // Don't return early - always show tabs and date range picker
  // We'll handle errors and no-data states within the tab content
  const { overall, campaigns, bookingTypes } = data || {};
  // Prepare campaign pie chart data (only if campaigns exist)
  const campaignChartData = (campaigns || [])
    .slice(0, 5)
    .map((campaign) => ({
      name: campaign.source === "direct" ? "Direct" : `${campaign.source} - ${campaign.campaign}`,
      value: campaign.form_starts || 0,
      revenue: campaign.revenue || 0,
    }));
  return (
    <Box sx={{ 
      p: { xs: 1, sm: 1.5, md: 2 },
      pt: { xs: 0.5, sm: 1, md: 1.5 },
      width: '100%',
      overflowX: 'hidden',
    }}>
      {/* Date Range Picker */}
      <Box 
        className="marketing-date-range-picker-container"
        sx={{ 
          mb: { xs: 1.5, sm: 2 }, 
          mt: { xs: 0.5, sm: 1 },
          display: "flex", 
          justifyContent: "center",
          alignItems: "center",
        }}
      >
        <DateRangePicker
          value={dateRangeValue}
          onChange={handleDateRangeChange}
          label="Date Range"
        />
      </Box>

      {/* Total Performance KPIs */}
      {overall && (
        <>
          <Typography 
            variant="h6" 
          sx={{
              mb: { xs: 2, sm: 2.5 }, 
              fontWeight: 600,
              color: 'text.primary',
              fontSize: { xs: '1rem', sm: '1.25rem' }
            }}
          >
            Total Performance KPIs
          </Typography>
      <Grid container spacing={{ xs: 2, sm: 3 }} sx={{ mb: { xs: 3, sm: 4 } }}>
        {visibleMetrics.total_form_views && (
        <Grid item xs={12} sm={6} md={3}>
          <Card 
            onClick={() => handleCardClick('form_views')}
            sx={{ 
              height: '100%',
              bgcolor: 'white',
              border: '1px solid',
              borderColor: 'grey.200',
              borderLeft: '4px solid',
              borderLeftColor: 'secondary.main',
              borderRadius: '12px',
              p: { xs: 2, sm: 2.5 },
              boxShadow: '0 1px 3px 0 rgba(0, 0, 0, 0.1), 0 1px 2px 0 rgba(0, 0, 0, 0.06)',
              transition: 'box-shadow 0.2s',
              cursor: 'pointer',
              '&:hover': {
                boxShadow: '0 10px 15px -3px rgba(0, 0, 0, 0.1), 0 4px 6px -2px rgba(0, 0, 0, 0.05)'
              }
            }}
          >
            <Typography 
              variant="body2" 
              sx={{ 
                color: 'text.secondary', 
                fontSize: '0.75rem',
                mb: 0.5
              }}
            >
              Total Form Views
            </Typography>
            <Box sx={{ mt: 0.5, display: 'flex', alignItems: 'baseline', gap: 1 }}>
              <Typography 
                variant="h4" 
                sx={{ 
                  color: 'text.primary',
                  fontWeight: 600,
                  fontSize: { xs: '1.5rem', sm: '1.875rem' },
                  lineHeight: 1.2
                }}
              >
                {(overall.form_views || 0).toLocaleString()}
              </Typography>
            </Box>
            <Typography 
              variant="caption" 
              sx={{ 
                color: 'text.secondary',
                fontSize: '0.75rem',
                display: 'block',
                mt: 0.5
              }}
            >
              {(overall.unique_view_sessions || 0).toLocaleString()} unique sessions
            </Typography>
          </Card>
        </Grid>
        )}
        {visibleMetrics.total_leads && (
        <Grid item xs={12} sm={6} md={3}>
          <Card 
            onClick={() => handleCardClick('form_starts')}
            sx={getKPICardStyle('primary.main')}
          >
            <Typography 
              variant="body2" 
              sx={getLabelTypography()}
            >
              Total Leads
            </Typography>
            <Box sx={{ mt: 0.5, display: 'flex', alignItems: 'baseline', gap: 1 }}>
              <Typography 
                variant="h4" 
                sx={getValueTypography()}
              >
                {(overall.form_starts || 0).toLocaleString()}
              </Typography>
            </Box>
            <Typography 
              variant="caption" 
              sx={{ 
                color: 'text.secondary',
                fontSize: '0.75rem',
                display: 'block',
                mt: 0.5
              }}
            >
              {overall.form_views > 0
                ? formatPercent(((overall.form_starts || 0) / overall.form_views) * 100)
                : '0.0%'}{' '}
              start rate
            </Typography>
          </Card>
        </Grid>
        )}
        {visibleMetrics.total_registrations && (
        <Grid item xs={12} sm={6} md={3}>
          <Card 
            onClick={() => handleCardClick('form_completions', { payment_status: 'paid,verified' })}
            sx={getKPICardStyle('success.main')}
          >
            <Typography 
              variant="body2" 
              sx={getLabelTypography()}
            >
              Total Registrations
            </Typography>
            <Box sx={{ mt: 0.5, display: 'flex', alignItems: 'baseline', gap: 1 }}>
              <Typography 
                variant="h4" 
                sx={getValueTypography()}
              >
                {(overall.form_completions || 0).toLocaleString()}
              </Typography>
            </Box>
            <Typography 
              variant="caption" 
              sx={{ 
                color: 'text.secondary',
                fontSize: '0.75rem',
                display: 'block',
                mt: 0.5
              }}
            >
              {formatPercent(overall.form_completion_rate || 0)} completion rate
              <br />
              <span style={{ fontSize: '0.7rem' }}>(Paid/Verified registrations)</span>
            </Typography>
          </Card>
        </Grid>
        )}
        {visibleMetrics.total_revenue && (
        <Grid item xs={12} sm={6} md={3}>
          <Card 
            onClick={() => handleCardClick('revenue', { payment_status: 'paid' })}
            sx={getKPICardStyle('info.main')}
          >
            <Typography 
              variant="body2" 
              sx={getLabelTypography()}
            >
              Total Revenue from Booking Forms
            </Typography>
            <Box sx={{ mt: 0.5, display: 'flex', alignItems: 'baseline', gap: 1 }}>
              <Typography 
                variant="h4" 
                sx={getValueTypography()}
              >
                {formatCurrency(overall.revenue || 0)}
              </Typography>
            </Box>
            <Typography 
              variant="caption" 
              sx={{ 
                color: 'text.secondary',
                fontSize: '0.75rem',
                display: 'block',
                mt: 0.5
              }}
            >
              {overall.payments > 0
                ? formatCurrency((overall.revenue || 0) / overall.payments)
                : "$0"}{" "}
              avg order value
            </Typography>
          </Card>
        </Grid>
        )}
            {visibleMetrics.full_client_conversion_rate && (
            <Grid item xs={12} sm={6} md={3}>
              <Card 
                onClick={() => handleCardClick('fullClientConversion')}
                sx={getKPICardStyle('success.main')}
              >
                <Typography 
                  variant="body2" 
                  sx={getLabelTypography()}
                >
                  Full Client Conversion Rate
                </Typography>
                <Box sx={{ mt: 0.5, display: 'flex', alignItems: 'baseline', gap: 1 }}>
                  <Typography 
                    variant="h4" 
                    sx={getValueTypography()}
                  >
                    {fullClientConversionData?.summary?.conversion_rate !== undefined
                      ? `${parseFloat(fullClientConversionData.summary.conversion_rate || 0).toFixed(1)}%`
                      : fullClientConversionLoading ? 'Loading...' : '0.0%'}
                  </Typography>
                </Box>
                <Typography 
                  variant="caption" 
                  sx={{ 
                    color: 'text.secondary',
                    fontSize: '0.75rem',
                    display: 'block',
                    mt: 0.5
                  }}
                >
                  {fullClientConversionData?.summary?.fully_converted_registrations || 0} of {fullClientConversionData?.summary?.total_registrations || 0} registrations
                </Typography>
              </Card>
      </Grid>
            )}
          </Grid>
        </>
      )}

      {/* Tab Navigation */}
      <Box sx={{ borderBottom: 1, borderColor: 'divider', mb: 2 }}>
        <Tabs 
          value={activeTab} 
          onChange={handleTabChange}
          variant={isXsDown ? 'scrollable' : 'standard'}
          scrollButtons={isXsDown ? 'auto' : false}
          allowScrollButtonsMobile
          sx={{
            '& .MuiTabs-scrollButtons.Mui-disabled': {
              opacity: 0.3,
            },
            '& .MuiTab-root': {
              fontSize: { xs: '0.875rem', sm: '1rem' },
              fontWeight: 600,
              textTransform: 'none',
              minHeight: '48px',
              px: { xs: 1.5, sm: 3 },
            }
          }}
        >
          <Tab label="Meta" />
          <Tab label="Google" />
          <Tab label="Klaviyo" />
        </Tabs>
      </Box>

      {/* Meta Tab Content */}
      {activeTab === 0 && (
      <React.Fragment>
      {showError && (
        <Alert severity="error" sx={{ mb: 3 }}>
          {error}
        </Alert>
      )}
      {!data || !overall ? (
        <Alert severity="info" sx={{ mb: 3 }}>
          No data available for the selected period. Please select a date range or try a different period.
        </Alert>
      ) : (
      <>
      {/* Meta Ads Metrics */}
      {(visibleMetrics.meta_form_views || visibleMetrics.meta_leads || visibleMetrics.meta_registrations || visibleMetrics.meta_revenue) && (
      <Grid container spacing={{ xs: 2, sm: 3 }} sx={{ mb: { xs: 3, sm: 4 } }}>
        <Grid item xs={12}>
          <Typography variant="h6" sx={{ mb: { xs: 2, sm: 3 }, fontWeight: 600, color: 'text.primary', fontSize: { xs: '1rem', sm: '1.25rem' } }}>
            Meta Ads Performance
          </Typography>
        </Grid>
        {visibleMetrics.meta_form_views && (
        <Grid item xs={12} sm={6} md={3}>
          <Card 
            onClick={() => handleCardClick('facebook_form_views', { utm_source: 'facebook' })}
            sx={getKPICardStyle('secondary.main')}
          >
            <Typography 
              variant="body2" 
              sx={getLabelTypography()}
            >
              Meta Form Views
            </Typography>
            <Box sx={{ mt: 0.5, display: 'flex', alignItems: 'baseline', gap: 1 }}>
              <Typography 
                variant="h4" 
                sx={getValueTypography()}
              >
                {(overall.facebook_form_views || 0).toLocaleString()}
              </Typography>
            </Box>
            <Typography 
              variant="caption" 
              sx={{ 
                color: 'text.secondary',
                fontSize: '0.75rem',
                display: 'block',
                mt: 0.5
              }}
            >
              {overall.form_views > 0
                ? formatPercent(((overall.facebook_form_views || 0) / overall.form_views) * 100)
                : '0.0%'}{' '}
              of total views
            </Typography>
          </Card>
        </Grid>
        )}
        {visibleMetrics.meta_leads && (
        <Grid item xs={12} sm={6} md={3}>
          <Card 
            onClick={() => handleCardClick('facebook_form_starts', { utm_source: 'facebook' })}
            sx={getKPICardStyle('primary.main')}
          >
            <Typography 
              variant="body2" 
              sx={getLabelTypography()}
            >
              Meta Leads
            </Typography>
            <Box sx={{ mt: 0.5, display: 'flex', alignItems: 'baseline', gap: 1 }}>
              <Typography 
                variant="h4" 
                sx={getValueTypography()}
              >
                {(overall.facebook_form_starts || 0).toLocaleString()}
              </Typography>
            </Box>
            <Typography 
              variant="caption" 
              sx={{ 
                color: 'text.secondary',
                fontSize: '0.75rem',
                display: 'block',
                mt: 0.5
              }}
            >
              {overall.form_starts > 0
                ? formatPercent(((overall.facebook_form_starts || 0) / overall.form_starts) * 100)
                : '0.0%'}{' '}
              of total starts
            </Typography>
          </Card>
        </Grid>
        )}
        {visibleMetrics.meta_registrations && (
        <Grid item xs={12} sm={6} md={3}>
          <Card 
            onClick={() => handleCardClick('facebook_form_completions', { utm_source: 'facebook', payment_status: 'paid,verified' })}
            sx={getKPICardStyle('success.main')}
          >
            <Typography 
              variant="body2" 
              sx={getLabelTypography()}
            >
              Meta Registrations
            </Typography>
            <Box sx={{ mt: 0.5, display: 'flex', alignItems: 'baseline', gap: 1 }}>
              <Typography 
                variant="h4" 
                sx={getValueTypography()}
              >
                {(overall.facebook_form_completions || 0).toLocaleString()}
              </Typography>
            </Box>
            <Typography 
              variant="caption" 
              sx={{ 
                color: 'text.secondary',
                fontSize: '0.75rem',
                display: 'block',
                mt: 0.5
              }}
            >
              {formatPercent(overall.facebook_completion_rate || 0)} completion rate
              <br />
              {overall.form_completions > 0
                ? formatPercent(((overall.facebook_form_completions || 0) / overall.form_completions) * 100)
                : '0.0%'}{' '}
              of total completions
            </Typography>
          </Card>
        </Grid>
        )}
        {visibleMetrics.meta_revenue && (
        <Grid item xs={12} sm={6} md={3}>
          <Card 
            onClick={() => handleCardClick('facebook_revenue', { utm_source: 'facebook', payment_status: 'paid' })}
            sx={getKPICardStyle('info.main')}
          >
            <Typography 
              variant="body2" 
              sx={getLabelTypography()}
            >
              Total Revenue from Meta Booking Forms
            </Typography>
            <Box sx={{ mt: 0.5, display: 'flex', alignItems: 'baseline', gap: 1 }}>
              <Typography 
                variant="h4" 
                sx={getValueTypography()}
              >
                {formatCurrency(overall.facebook_revenue || 0)}
              </Typography>
            </Box>
            <Typography 
              variant="caption" 
              sx={{ 
                color: 'text.secondary',
                fontSize: '0.75rem',
                display: 'block',
                mt: 0.5
              }}
            >
              {overall.revenue > 0
                ? formatPercent(((overall.facebook_revenue || 0) / overall.revenue) * 100)
                : '0.0%'}{' '}
              of total revenue
            </Typography>
          </Card>
        </Grid>
        )}
      </Grid>
      )}
      {/* Meta Ad Performance KPIs */}
      {(overall.meta_impressions > 0 || overall.meta_spend > 0) && (
        (visibleMetrics.ad_impressions || visibleMetrics.ad_clicks || visibleMetrics.ad_spend || visibleMetrics.roas || visibleMetrics.realized_revenue || visibleMetrics.false_starts || visibleMetrics.actual_roas || visibleMetrics.cpl || visibleMetrics.cpr) && (
        <Grid container spacing={{ xs: 2, sm: 3 }} sx={{ mb: { xs: 3, sm: 4 } }}>
          <Grid item xs={12}>
            <Typography variant="h6" sx={{ mb: { xs: 2, sm: 3 }, fontWeight: 600, color: 'text.primary', fontSize: { xs: '1rem', sm: '1.25rem' } }}>
              Meta Ad Performance KPIs
            </Typography>
          </Grid>
          
          {/* Top Row: Primary Ad Metrics */}
          {visibleMetrics.ad_impressions && (
          <Grid item xs={12} sm={6} md={3}>
            <Card 
              onClick={() => handleCardClick('ad_impressions')}
              sx={getKPICardStyle('info.main')}
            >
              <Typography 
                variant="body2" 
                sx={getLabelTypography()}
              >
                Ad Impressions
              </Typography>
              <Box sx={{ mt: 0.5, display: 'flex', alignItems: 'baseline', gap: 1 }}>
                <Typography 
                  variant="h4" 
                  sx={getValueTypography()}
                >
                  {Number(overall.ad_impressions || 0).toLocaleString()}
                </Typography>
              </Box>
              <Typography 
                variant="caption" 
                sx={{ 
                  color: 'text.secondary',
                  fontSize: '0.75rem',
                  display: 'block',
                  mt: 0.5
                }}
              >
                Meta: {Number(overall.meta_impressions || 0).toLocaleString()} | Google: {Number(overall.google_impressions || 0).toLocaleString()}
              </Typography>
            </Card>
          </Grid>
          )}

          {visibleMetrics.ad_clicks && (
          <Grid item xs={12} sm={6} md={3}>
            <Card 
              onClick={() => handleCardClick('ad_clicks')}
              sx={getKPICardStyle('warning.main')}
            >
              <Typography 
                variant="body2" 
                sx={getLabelTypography()}
              >
                Ad Clicks
              </Typography>
              <Box sx={{ mt: 0.5, display: 'flex', alignItems: 'baseline', gap: 1 }}>
                <Typography 
                  variant="h4" 
                  sx={getValueTypography()}
                >
                  {(overall.ad_clicks || 0).toLocaleString()}
                </Typography>
              </Box>
              <Typography 
                variant="caption" 
                sx={{ 
                  color: 'text.secondary',
                  fontSize: '0.75rem',
                  display: 'block',
                  mt: 0.5
                }}
              >
                {formatPercent(overall.ad_ctr || 0)} CTR
              </Typography>
            </Card>
          </Grid>
          )}
          {visibleMetrics.ad_spend && (
          <Grid item xs={12} sm={6} md={3}>
            <Card 
              onClick={() => handleCardClick('ad_spend')}
              sx={getKPICardStyle('error.main')}
            >
              <Typography 
                variant="body2" 
                sx={getLabelTypography()}
              >
                Ad Spend
              </Typography>
              <Box sx={{ mt: 0.5, display: 'flex', alignItems: 'baseline', gap: 1 }}>
                <Typography 
                  variant="h4" 
                  sx={getValueTypography()}
                >
                  {formatCurrency(overall.meta_spend || 0)}
                </Typography>
              </Box>
              <Typography 
                variant="caption" 
                sx={{ 
                  color: 'text.secondary',
                  fontSize: '0.75rem',
                  display: 'block',
                  mt: 0.5
                }}
              >
                ${parseFloat(overall.ad_cpc || 0).toFixed(2)} avg CPC
              </Typography>
            </Card>
          </Grid>
          )}

          {visibleMetrics.roas && (
          <Grid item xs={12} sm={6} md={3}>
            <Card 
              onClick={() => handleCardClick('roas')}
              sx={getKPICardStyle('success.main')}
            >
              <Typography 
                variant="body2" 
                sx={getLabelTypography()}
              >
                ROAS
              </Typography>
              <Box sx={{ mt: 0.5, display: 'flex', alignItems: 'baseline', gap: 1 }}>
                <Typography 
                  variant="h4" 
                  sx={getValueTypography()}
                >
                  {(() => {
                    const baseRoas = parseFloat(overall.roas || 0);
                    const conversionRate = parseFloat(
                      metaFullClientConversionData?.lastTwelveMonths?.conversion_rate || 
                      metaFullClientConversionData?.summary?.conversion_rate || 
                      0
                    );
                    // Adjusted ROAS = ROAS × Conversion Rate (as decimal)
                    const adjustedRoas = baseRoas * (conversionRate / 100);
                    return adjustedRoas.toFixed(2);
                  })()}x
                </Typography>
              </Box>
              <Typography 
                variant="caption" 
                sx={{ 
                  color: 'text.secondary',
                  fontSize: '0.75rem',
                  display: 'block',
                  mt: 0.5
                }}
              >
                ROAS × Meta Conversion Rate
              </Typography>
            </Card>
          </Grid>
          )}

          {/* Realized Revenue Card */}
          {visibleMetrics.realized_revenue && (
          <Grid item xs={12} sm={6} md={3}>
            <Card
              onClick={() => handleCardClick('realizedRevenue')}
              sx={getKPICardStyle('info.main')}
            >
              <Typography
                variant="body2"
                sx={getLabelTypography()}
              >
                Realized Revenue
              </Typography>
              <Box sx={{ mt: 0.5, display: 'flex', alignItems: 'baseline', gap: 1 }}>
                <Typography
                  variant="h4"
                  sx={getValueTypography()}
                >
                  {realizedRevenueData?.summary?.total_revenue
                    ? `$${parseFloat(realizedRevenueData.summary.total_revenue).toLocaleString('en-US', { maximumFractionDigits: 0 })}`
                    : '$0'}
                </Typography>
              </Box>
              <Typography
                variant="caption"
                sx={{
                  color: 'text.secondary',
                  fontSize: '0.75rem',
                  display: 'block',
                  mt: 0.5
                }}
              >
                {realizedRevenueData?.summary?.total_clients
                  ? `${realizedRevenueData.summary.total_clients} clients`
                  : 'Click to load data'}
              </Typography>
            </Card>
          </Grid>
          )}
          {/* False Starts Card */}
          {visibleMetrics.false_starts && (
          <Grid item xs={12} sm={6} md={3}>
            <Card 
              onClick={() => handleFalseStartsClick()}
              sx={getKPICardStyle('error.main')}
            >
              <Typography 
                variant="body2" 
                sx={getLabelTypography()}
              >
                False Starts
              </Typography>
              <Box sx={{ mt: 0.5, display: 'flex', alignItems: 'baseline', gap: 1 }}>
                <Typography 
                  variant="h4" 
                  sx={getValueTypography()}
                >
                  {falseStartsData?.summary?.total_false_starts || 0}
                </Typography>
              </Box>
              <Typography 
                variant="caption" 
                sx={{ 
                  color: 'text.secondary',
                  fontSize: '0.75rem',
                  display: 'block',
                  mt: 0.5
                }}
              >
                {falseStartsData?.summary?.false_start_percentage 
                  ? `${falseStartsData.summary.false_start_percentage}% of Meta registrations`
                  : 'No completed lessons, status dormant'}
              </Typography>
            </Card>
          </Grid>
          )}

          {/* Actual ROAS (AROAS) Card */}
          {visibleMetrics.actual_roas && (
          <Grid item xs={12} sm={6} md={3}>
            <Card 
              onClick={() => handleAroasClick()}
              sx={getKPICardStyle('warning.main')}
            >
              <Typography 
                variant="body2" 
                sx={getLabelTypography()}
              >
                Actual ROAS (AROAS)
              </Typography>
              <Box sx={{ mt: 0.5, display: 'flex', alignItems: 'baseline', gap: 1 }}>
                <Typography 
                  variant="h4" 
                  sx={getValueTypography()}
                >
                  {(() => {
                    const realizedRevenue = parseFloat(realizedRevenueData?.summary?.total_revenue || 0);
                    const metaAdSpend = parseFloat(enterpriseData?.raw?.meta_spend || 0);
                    if (metaAdSpend > 0) {
                      return `${(realizedRevenue / metaAdSpend).toFixed(2)}x`;
                    }
                    return '0.00x';
                  })()}
                </Typography>
              </Box>
              <Typography 
                variant="caption" 
                sx={{ 
                  color: 'text.secondary',
                  fontSize: '0.75rem',
                  display: 'block',
                  mt: 0.5
                }}
              >
                Realized Revenue / Meta Ad Spend
              </Typography>
            </Card>
          </Grid>
          )}
          {/* Bottom Row: Cost Metrics */}
          {visibleMetrics.cpl && (
          <Grid item xs={12} sm={6} md={3}>
            <Card 
              onClick={() => handleCardClick('cpl')}
              sx={getKPICardStyle('primary.main')}
            >
              <Typography 
                variant="body2" 
                sx={getLabelTypography()}
              >
                Cost Per Lead (CPL)
              </Typography>
              <Box sx={{ mt: 0.5, display: 'flex', alignItems: 'baseline', gap: 1 }}>
                <Typography 
                  variant="h4" 
                  sx={getValueTypography()}
                >
                  ${parseFloat(overall.cpl || 0).toFixed(2)}
                </Typography>
              </Box>
              <Typography 
                variant="caption" 
                sx={{ 
                  color: 'text.secondary',
                  fontSize: '0.75rem',
                  display: 'block',
                  mt: 0.5
                }}
              >
                Meta spend / Meta leads
              </Typography>
            </Card>
          </Grid>
          )}
          {visibleMetrics.cpr && (
          <Grid item xs={12} sm={6} md={3}>
            <Card 
              onClick={() => handleCardClick('cpr')}
              sx={getKPICardStyle('success.main')}
            >
              <Typography 
                variant="body2" 
                sx={getLabelTypography()}
              >
                Cost Per Registration (CPR)
              </Typography>
              <Box sx={{ mt: 0.5, display: 'flex', alignItems: 'baseline', gap: 1 }}>
                <Typography 
                  variant="h4" 
                  sx={getValueTypography()}
                >
                  ${parseFloat(overall.cpr || 0).toFixed(2)}
                </Typography>
              </Box>
              <Typography 
                variant="caption" 
                sx={{ 
                  color: 'text.secondary',
                  fontSize: '0.75rem',
                  display: 'block',
                  mt: 0.5
                }}
              >
                Meta spend / Meta completions
              </Typography>
            </Card>
          </Grid>
          )}
          {visibleMetrics.meta_full_client_conversion_rate && (
          <Grid item xs={12} sm={6} md={3}>
            <Card 
              onClick={() => handleCardClick('meta_full_client_conversion')}
              sx={getKPICardStyle('success.main')}
            >
              <Typography 
                variant="body2" 
                sx={getLabelTypography()}
              >
                Meta Full Client Conversion Rate
              </Typography>
              <Box sx={{ mt: 0.5, display: 'flex', alignItems: 'baseline', gap: 1 }}>
                <Typography 
                  variant="h4" 
                  sx={getValueTypography()}
                >
                  {metaFullClientConversionData?.summary?.conversion_rate !== undefined
                    ? `${parseFloat(metaFullClientConversionData.summary.conversion_rate || 0).toFixed(1)}%`
                    : '—'}
                </Typography>
              </Box>
              <Typography 
                variant="caption" 
                sx={{ 
                  color: 'text.secondary',
                  fontSize: '0.75rem',
                  display: 'block',
                  mt: 0.5
                }}
              >
                {metaFullClientConversionData?.summary?.fully_converted_registrations || 0} of {metaFullClientConversionData?.summary?.total_registrations || 0} Meta registrations
              </Typography>
            </Card>
          </Grid>
          )}
        </Grid>
        )
      )}

      {/* Enterprise Marketing Performance Suite */}
      {enterpriseData && enterpriseData.metrics && (
        <>
          {/* Core Funnel Metrics */}
          {visibleMetrics.enterprise_core_funnel && (
          <CoreFunnelSection metrics={enterpriseData.metrics.coreFunnel} onCardClick={handleEnterpriseKpiClick} />
          )}

          {/* Revenue & Value Metrics */}
          {visibleMetrics.enterprise_revenue && (
          <RevenueSection metrics={enterpriseData.metrics.revenue} onCardClick={handleEnterpriseKpiClick} />
          )}

          {/* Conversion & Behavior Metrics */}
          {visibleMetrics.enterprise_conversion && (
          <ConversionSection metrics={enterpriseData.metrics.conversion} onCardClick={handleEnterpriseKpiClick} />
          )}

          {/* Cost & Efficiency Metrics */}
          {visibleMetrics.enterprise_efficiency && (
          <EfficiencySection metrics={enterpriseData.metrics.efficiency} onCardClick={handleEnterpriseKpiClick} />
          )}

          {/* Strategic & Advanced KPIs */}
          {visibleMetrics.enterprise_strategic && (
          <StrategicSection metrics={enterpriseData.metrics.strategic} onCardClick={handleEnterpriseKpiClick} />
          )}
        </>
      )}
      {/* Enterprise Performance Trends Over Time */}
      {enterpriseTrendsData && enterpriseTrendsData.monthlyData && enterpriseTrendsData.monthlyData.length > 0 ? (
        <>
          <Typography variant="h5" sx={{ mt: 4, mb: 3, fontWeight: 600, fontSize: { xs: '1.25rem', sm: '1.5rem' } }}>
            Performance Trends Over Time
          </Typography>
          <Typography variant="body2" color="text.secondary" sx={{ mb: 3 }}>
            Monthly performance metrics from August 2025 to present
          </Typography>
          
          {/* Debug info in development */}
          {process.env.NODE_ENV === 'development' && (
            <Typography variant="caption" color="text.secondary" sx={{ mb: 2, display: 'block' }}>
              Debug: {enterpriseTrendsData.monthlyData.length} months loaded. 
              Sample: {JSON.stringify(enterpriseTrendsData.monthlyData[0])}
            </Typography>
          )}

          {/* ROAS Trends */}
          <Grid container spacing={{ xs: 2, sm: 3 }} sx={{ mb: { xs: 2, sm: 3 } }}>
            <Grid item xs={12}>
              <Paper sx={{ p: { xs: 2, sm: 3 } }}>
                <Typography variant="h6" gutterBottom sx={{ fontSize: { xs: '1rem', sm: '1.25rem' } }}>
                  ROAS Trends
                </Typography>
                <Box sx={{ width: '100%', height: { xs: 300, sm: 400 } }}>
                  <ResponsiveContainer width="100%" height="100%">
                    <LineChart data={enterpriseTrendsData.monthlyData}>
                      <CartesianGrid strokeDasharray="3 3" />
                      <XAxis dataKey="month" />
                      <YAxis domain={[0, (dataMax) => Math.max(dataMax || 1, 1)]} />
                      <Tooltip 
                        formatter={(value, name) => {
                          if (name === 'Lifetime ROAS' || name === 'Trial ROAS' || name === 'Blended ROAS') {
                            return `${parseFloat(value || 0).toFixed(2)}x`;
                          }
                          return value;
                        }}
                      />
                      <Legend />
                      <Line type="monotone" dataKey="roas" stroke={SERIES_COLORS.primary} strokeWidth={2} name="Lifetime ROAS" dot={{ r: 4 }} />
                      <Line type="monotone" dataKey="trialRoas" stroke={SERIES_COLORS.secondary} strokeWidth={2} name="Trial ROAS" dot={{ r: 4 }} />
                      <Line type="monotone" dataKey="blendedRoas" stroke={SERIES_COLORS.tertiary} strokeWidth={2} name="Blended ROAS" dot={{ r: 4 }} />
                      <Line type="monotone" dataKey="roasProjected" stroke={SERIES_COLORS.primary} strokeWidth={2} strokeDasharray="5 5" name="Lifetime ROAS (Projected)" dot={{ r: 0 }} />
                      <Line type="monotone" dataKey="trialRoasProjected" stroke={SERIES_COLORS.secondary} strokeWidth={2} strokeDasharray="5 5" name="Trial ROAS (Projected)" dot={{ r: 0 }} />
                      <Line type="monotone" dataKey="blendedRoasProjected" stroke={SERIES_COLORS.tertiary} strokeWidth={2} strokeDasharray="5 5" name="Blended ROAS (Projected)" dot={{ r: 0 }} />
                    </LineChart>
                  </ResponsiveContainer>
                </Box>
              </Paper>
            </Grid>
          </Grid>

          {/* Ad Spend vs Revenue */}
          <Grid container spacing={{ xs: 2, sm: 3 }} sx={{ mb: { xs: 2, sm: 3 } }}>
            <Grid item xs={12}>
              <Paper sx={{ p: { xs: 2, sm: 3 } }}>
                <Typography variant="h6" gutterBottom sx={{ fontSize: { xs: '1rem', sm: '1.25rem' } }}>
                  Ad Spend vs Revenue
                </Typography>
                <Box sx={{ width: '100%', height: { xs: 300, sm: 400 } }}>
                  <ResponsiveContainer width="100%" height="100%">
                    <LineChart data={enterpriseTrendsData.monthlyData}>
                      <CartesianGrid strokeDasharray="3 3" />
                      <XAxis dataKey="month" />
                      <YAxis yAxisId="left" tickFormatter={(value) => `$${value.toLocaleString()}`} />
                      <YAxis yAxisId="right" orientation="right" tickFormatter={(value) => `$${value.toLocaleString()}`} />
                      <Tooltip 
                        formatter={(value) => `$${parseFloat(value).toLocaleString()}`}
                      />
                      <Legend />
                      <Line yAxisId="left" type="monotone" dataKey="metaSpend" stroke={SERIES_COLORS.primary} strokeWidth={2} name="Meta Ad Spend" dot={{ r: 4 }} />
                      <Line yAxisId="left" type="monotone" dataKey="totalSpend" stroke={SERIES_COLORS.secondary} strokeWidth={2} name="Total Ad Spend" dot={{ r: 4 }} />
                      <Line yAxisId="right" type="monotone" dataKey="facebookRevenue" stroke={SERIES_COLORS.tertiary} strokeWidth={2} name="Trial Revenue" dot={{ r: 4 }} />
                      <Line yAxisId="right" type="monotone" dataKey="facebookLtvRevenue" stroke={SERIES_COLORS.quaternary} strokeWidth={2} name="Lifetime Revenue" dot={{ r: 4 }} />
                      <Line yAxisId="left" type="monotone" dataKey="metaSpendProjected" stroke={SERIES_COLORS.primary} strokeWidth={2} strokeDasharray="5 5" name="Meta Ad Spend (Projected)" dot={{ r: 0 }} />
                      <Line yAxisId="left" type="monotone" dataKey="totalSpendProjected" stroke={SERIES_COLORS.secondary} strokeWidth={2} strokeDasharray="5 5" name="Total Ad Spend (Projected)" dot={{ r: 0 }} />
                      <Line yAxisId="right" type="monotone" dataKey="facebookRevenueProjected" stroke={SERIES_COLORS.tertiary} strokeWidth={2} strokeDasharray="5 5" name="Trial Revenue (Projected)" dot={{ r: 0 }} />
                      <Line yAxisId="right" type="monotone" dataKey="facebookLtvRevenueProjected" stroke={SERIES_COLORS.quaternary} strokeWidth={2} strokeDasharray="5 5" name="Lifetime Revenue (Projected)" dot={{ r: 0 }} />
                    </LineChart>
                  </ResponsiveContainer>
                </Box>
              </Paper>
            </Grid>
          </Grid>
          {/* Leads & Registrations */}
          <Grid container spacing={{ xs: 2, sm: 3 }} sx={{ mb: { xs: 2, sm: 3 } }}>
            <Grid item xs={12} md={6}>
              <Paper sx={{ p: { xs: 2, sm: 3 } }}>
                <Typography variant="h6" gutterBottom sx={{ fontSize: { xs: '1rem', sm: '1.25rem' } }}>
                  Leads & Registrations
                </Typography>
                <Box sx={{ width: '100%', height: { xs: 300, sm: 350 } }}>
                  <ResponsiveContainer width="100%" height="100%">
                    <LineChart data={enterpriseTrendsData.monthlyData}>
                      <CartesianGrid strokeDasharray="3 3" />
                      <XAxis dataKey="month" />
                      <YAxis />
                      <Tooltip />
                      <Legend />
                      <Line type="monotone" dataKey="facebookFormStarts" stroke={SERIES_COLORS.primary} strokeWidth={2} name="Meta Leads" dot={{ r: 4 }} />
                      <Line type="monotone" dataKey="facebookFormCompletions" stroke={SERIES_COLORS.secondary} strokeWidth={2} name="Meta Registrations" dot={{ r: 4 }} />
                      <Line type="monotone" dataKey="formStarts" stroke={SERIES_COLORS.tertiary} strokeWidth={2} name="Total Leads" dot={{ r: 4 }} />
                      <Line type="monotone" dataKey="formCompletions" stroke={SERIES_COLORS.quaternary} strokeWidth={2} name="Total Registrations" dot={{ r: 4 }} />
                      <Line type="monotone" dataKey="facebookFormStartsProjected" stroke={SERIES_COLORS.primary} strokeWidth={2} strokeDasharray="5 5" name="Meta Leads (Projected)" dot={{ r: 0 }} />
                      <Line type="monotone" dataKey="facebookFormCompletionsProjected" stroke={SERIES_COLORS.secondary} strokeWidth={2} strokeDasharray="5 5" name="Meta Registrations (Projected)" dot={{ r: 0 }} />
                      <Line type="monotone" dataKey="formStartsProjected" stroke={SERIES_COLORS.tertiary} strokeWidth={2} strokeDasharray="5 5" name="Total Leads (Projected)" dot={{ r: 0 }} />
                      <Line type="monotone" dataKey="formCompletionsProjected" stroke={SERIES_COLORS.quaternary} strokeWidth={2} strokeDasharray="5 5" name="Total Registrations (Projected)" dot={{ r: 0 }} />
                    </LineChart>
                  </ResponsiveContainer>
                </Box>
              </Paper>
            </Grid>

            {/* CPL & CPR Trends */}
            <Grid item xs={12} md={6}>
              <Paper sx={{ p: { xs: 2, sm: 3 } }}>
                <Typography variant="h6" gutterBottom sx={{ fontSize: { xs: '1rem', sm: '1.25rem' } }}>
                  Cost Per Lead & Registration
                </Typography>
                <Box sx={{ width: '100%', height: { xs: 300, sm: 350 } }}>
                  <ResponsiveContainer width="100%" height="100%">
                    <LineChart data={enterpriseTrendsData.monthlyData}>
                      <CartesianGrid strokeDasharray="3 3" />
                      <XAxis dataKey="month" />
                      <YAxis tickFormatter={(value) => `$${value.toFixed(0)}`} />
                      <Tooltip formatter={(value) => `$${parseFloat(value).toFixed(2)}`} />
                      <Legend />
                      <Line type="monotone" dataKey="cpl" stroke={SERIES_COLORS.primary} strokeWidth={2} name="CPL" dot={{ r: 4 }} />
                      <Line type="monotone" dataKey="cpr" stroke={SERIES_COLORS.secondary} strokeWidth={2} name="CPR" dot={{ r: 4 }} />
                      <Line type="monotone" dataKey="cac" stroke={SERIES_COLORS.tertiary} strokeWidth={2} name="CAC" dot={{ r: 4 }} />
                      <Line type="monotone" dataKey="cplProjected" stroke={SERIES_COLORS.primary} strokeWidth={2} strokeDasharray="5 5" name="CPL (Projected)" dot={{ r: 0 }} />
                      <Line type="monotone" dataKey="cprProjected" stroke={SERIES_COLORS.secondary} strokeWidth={2} strokeDasharray="5 5" name="CPR (Projected)" dot={{ r: 0 }} />
                      <Line type="monotone" dataKey="cacProjected" stroke={SERIES_COLORS.tertiary} strokeWidth={2} strokeDasharray="5 5" name="CAC (Projected)" dot={{ r: 0 }} />
                    </LineChart>
                  </ResponsiveContainer>
                </Box>
              </Paper>
            </Grid>
          </Grid>

          {/* Conversion Rates */}
          <Grid container spacing={{ xs: 2, sm: 3 }} sx={{ mb: { xs: 2, sm: 3 } }}>
            <Grid item xs={12} md={6}>
              <Paper sx={{ p: { xs: 2, sm: 3 } }}>
                <Typography variant="h6" gutterBottom sx={{ fontSize: { xs: '1rem', sm: '1.25rem' } }}>
                  Conversion Rates
                </Typography>
                <Box sx={{ width: '100%', height: { xs: 300, sm: 350 } }}>
                  <ResponsiveContainer width="100%" height="100%">
                    <LineChart data={enterpriseTrendsData.monthlyData}>
                      <CartesianGrid strokeDasharray="3 3" />
                      <XAxis dataKey="month" />
                      <YAxis tickFormatter={(value) => `${value}%`} />
                      <Tooltip formatter={(value) => `${parseFloat(value).toFixed(2)}%`} />
                      <Legend />
                      <Line type="monotone" dataKey="conversionRate" stroke={SERIES_COLORS.primary} strokeWidth={2} name="Total Conversion Rate" dot={{ r: 4 }} />
                      <Line type="monotone" dataKey="facebookConversionRate" stroke={SERIES_COLORS.secondary} strokeWidth={2} name="Meta Conversion Rate" dot={{ r: 4 }} />
                      <Line type="monotone" dataKey="ctr" stroke={SERIES_COLORS.tertiary} strokeWidth={2} name="CTR" dot={{ r: 4 }} />
                      <Line type="monotone" dataKey="conversionRateProjected" stroke={SERIES_COLORS.primary} strokeWidth={2} strokeDasharray="5 5" name="Total Conversion Rate (Projected)" dot={{ r: 0 }} />
                      <Line type="monotone" dataKey="facebookConversionRateProjected" stroke={SERIES_COLORS.secondary} strokeWidth={2} strokeDasharray="5 5" name="Meta Conversion Rate (Projected)" dot={{ r: 0 }} />
                      <Line type="monotone" dataKey="ctrProjected" stroke={SERIES_COLORS.tertiary} strokeWidth={2} strokeDasharray="5 5" name="CTR (Projected)" dot={{ r: 0 }} />
                    </LineChart>
                  </ResponsiveContainer>
                </Box>
              </Paper>
            </Grid>

            {/* Engagement Metrics */}
            <Grid item xs={12} md={6}>
              <Paper sx={{ p: { xs: 2, sm: 3 } }}>
                <Typography variant="h6" gutterBottom sx={{ fontSize: { xs: '1rem', sm: '1.25rem' } }}>
                  Engagement Metrics
                </Typography>
                <Box sx={{ width: '100%', height: { xs: 300, sm: 350 } }}>
                  <ResponsiveContainer width="100%" height="100%">
                    <LineChart data={enterpriseTrendsData.monthlyData}>
                      <CartesianGrid strokeDasharray="3 3" />
                      <XAxis dataKey="month" />
                      <YAxis />
                      <Tooltip formatter={(value) => value.toLocaleString()} />
                      <Legend />
                      <Line type="monotone" dataKey="metaImpressions" stroke={SERIES_COLORS.primary} strokeWidth={2} name="Meta Impressions" dot={{ r: 4 }} />
                      <Line type="monotone" dataKey="metaClicks" stroke={SERIES_COLORS.secondary} strokeWidth={2} name="Meta Clicks" dot={{ r: 4 }} />
                      <Line type="monotone" dataKey="formViews" stroke={SERIES_COLORS.tertiary} strokeWidth={2} name="Form Views" dot={{ r: 4 }} />
                      <Line type="monotone" dataKey="metaImpressionsProjected" stroke={SERIES_COLORS.primary} strokeWidth={2} strokeDasharray="5 5" name="Meta Impressions (Projected)" dot={{ r: 0 }} />
                      <Line type="monotone" dataKey="metaClicksProjected" stroke={SERIES_COLORS.secondary} strokeWidth={2} strokeDasharray="5 5" name="Meta Clicks (Projected)" dot={{ r: 0 }} />
                      <Line type="monotone" dataKey="formViewsProjected" stroke={SERIES_COLORS.tertiary} strokeWidth={2} strokeDasharray="5 5" name="Form Views (Projected)" dot={{ r: 0 }} />
                    </LineChart>
                  </ResponsiveContainer>
                </Box>
              </Paper>
            </Grid>
          </Grid>
        </>
      ) : (
        <Typography variant="body2" color="text.secondary" sx={{ mt: 4, mb: 3 }}>
          {trendsLoading ? 'Loading trends data...' : 'No trends data available'}
        </Typography>
      )}
      {/* Revenue Chart - Always shows last 4 months */}
      <Paper sx={{ p: { xs: 2, sm: 3 }, mb: { xs: 2, sm: 3 }, overflowX: 'auto' }}>
        <Typography variant="h6" gutterBottom sx={{ fontSize: { xs: '1rem', sm: '1.25rem' } }}>
          Revenue Trend (Last 4 Months)
        </Typography>
        <Box sx={{ width: '100%', minWidth: { xs: '500px', sm: '100%' }, height: { xs: 300, sm: 350 } }}>
          <ResponsiveContainer width="100%" height="100%">
          {revenueTrendData && revenueTrendData.length > 0 ? (
            <LineChart 
              data={revenueTrendData} 
              margin={{ top: 30, right: 30, left: 20, bottom: 20 }}
            >
              <CartesianGrid strokeDasharray="3 3" />
              <XAxis dataKey="month" />
              <YAxis 
                domain={[0, yAxisMax]}
                tickFormatter={(value) => formatCurrency(value)}
              />
              <Tooltip 
                formatter={(value, name) => {
                  const numValue = Number(value) || 0;
                  return formatCurrency(numValue);
                }}
                labelFormatter={(label) => label}
              />
              <Legend />
              <Line 
                type="monotone" 
                dataKey="Revenue" 
                stroke={SERIES_COLORS.primary} 
                strokeWidth={2} 
                name="Revenue" 
                dot={{ r: 4 }}
                connectNulls={false}
                isAnimationActive={true}
              />
              <Line 
                type="monotone" 
                dataKey="RevenueProjected" 
                stroke={SERIES_COLORS.projected} 
                strokeWidth={2} 
                strokeDasharray="5 5" 
                name="Revenue (Projected)" 
                dot={{ r: 0 }}
                connectNulls={false}
                isAnimationActive={true}
              />
            </LineChart>
          ) : (
            <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: '100%' }}>
              <Typography variant="body2" color="text.secondary">
                Loading revenue trend data...
              </Typography>
            </Box>
          )}
        </ResponsiveContainer>
        </Box>
      </Paper>
      {/* Campaign Performance */}
      <Grid container spacing={{ xs: 2, sm: 3 }} sx={{ mb: { xs: 2, sm: 3 } }}>
        <Grid item xs={12} md={6}>
          <Paper sx={{ p: { xs: 2, sm: 3 }, overflowX: 'auto' }}>
            <Typography variant="h6" gutterBottom sx={{ fontSize: { xs: '1rem', sm: '1.25rem' } }}>
              Top Campaigns by Leads
            </Typography>
            <TableContainer sx={{ maxWidth: '100%', overflowX: 'auto' }}>
              <Table size="small" sx={{ minWidth: { xs: '600px', sm: 'auto' } }}>
                <TableHead>
                  <TableRow>
                    <TableCell sx={{ fontSize: { xs: '0.75rem', sm: '0.875rem' }, padding: { xs: '8px', sm: '16px' } }}>Source</TableCell>
                    <TableCell sx={{ fontSize: { xs: '0.75rem', sm: '0.875rem' }, padding: { xs: '8px', sm: '16px' } }}>Campaign</TableCell>
                    <TableCell align="right" sx={{ fontSize: { xs: '0.75rem', sm: '0.875rem' }, padding: { xs: '8px', sm: '16px' } }}>Starts</TableCell>
                    <TableCell align="right" sx={{ fontSize: { xs: '0.75rem', sm: '0.875rem' }, padding: { xs: '8px', sm: '16px' } }}>Registrations</TableCell>
                    <TableCell align="right" sx={{ fontSize: { xs: '0.75rem', sm: '0.875rem' }, padding: { xs: '8px', sm: '16px' } }}>Payments</TableCell>
                    <TableCell align="right" sx={{ fontSize: { xs: '0.75rem', sm: '0.875rem' }, padding: { xs: '8px', sm: '16px' } }}>Revenue</TableCell>
                    <TableCell align="right" sx={{ fontSize: { xs: '0.75rem', sm: '0.875rem' }, padding: { xs: '8px', sm: '16px' } }}>Conversion</TableCell>
                  </TableRow>
                </TableHead>
                <TableBody>
                  {campaigns.slice(0, 10).map((campaign, idx) => (
                    <TableRow key={idx}>
                      <TableCell sx={{ fontSize: { xs: '0.75rem', sm: '0.875rem' }, padding: { xs: '8px', sm: '16px' } }}>{campaign.source || "direct"}</TableCell>
                      <TableCell sx={{ fontSize: { xs: '0.75rem', sm: '0.875rem' }, padding: { xs: '8px', sm: '16px' } }}>{campaign.campaign || "none"}</TableCell>
                      <TableCell align="right" sx={{ fontSize: { xs: '0.75rem', sm: '0.875rem' }, padding: { xs: '8px', sm: '16px' } }}>{campaign.form_starts || 0}</TableCell>
                      <TableCell align="right" sx={{ fontSize: { xs: '0.75rem', sm: '0.875rem' }, padding: { xs: '8px', sm: '16px' } }}>{campaign.form_completions || 0}</TableCell>
                      <TableCell align="right" sx={{ fontSize: { xs: '0.75rem', sm: '0.875rem' }, padding: { xs: '8px', sm: '16px' } }}>{campaign.payments || 0}</TableCell>
                      <TableCell align="right" sx={{ fontSize: { xs: '0.75rem', sm: '0.875rem' }, padding: { xs: '8px', sm: '16px' } }}>{formatCurrency(campaign.revenue || 0)}</TableCell>
                      <TableCell align="right" sx={{ fontSize: { xs: '0.75rem', sm: '0.875rem' }, padding: { xs: '8px', sm: '16px' } }}>
                        <Chip
                          label={formatPercent(campaign.overall_conversion_rate || 0)}
                          size="small"
                          sx={{ fontSize: { xs: '0.65rem', sm: '0.75rem' } }}
                          color={
                            (campaign.overall_conversion_rate || 0) > 10 ? "success" : "default"
                          }
                        />
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </TableContainer>
          </Paper>
        </Grid>
        <Grid item xs={12} md={6}>
          <Paper sx={{ p: { xs: 2, sm: 3 }, overflowX: 'auto' }}>
            <Typography variant="h6" gutterBottom sx={{ fontSize: { xs: '1rem', sm: '1.25rem' } }}>
              Campaign Distribution
            </Typography>
            {campaignChartData.length > 0 ? (
              <Box sx={{ width: '100%', minWidth: { xs: '300px', sm: '100%' }, height: { xs: 250, sm: 300 } }}>
                <ResponsiveContainer width="100%" height="100%">
                <PieChart>
                  <Pie
                    data={campaignChartData}
                    cx="50%"
                    cy="50%"
                    labelLine={false}
                    label={({ name, percent }) => `${name}: ${(percent * 100).toFixed(0)}%`}
                    outerRadius={80}
                    fill="#8884d8"
                    dataKey="value"
                  >
                    {campaignChartData.map((entry, index) => (
                      <Cell key={`cell-${index}`} fill={COLORS[index % COLORS.length]} />
                    ))}
                  </Pie>
                  <Tooltip />
                </PieChart>
              </ResponsiveContainer>
              </Box>
            ) : (
              <Typography variant="body2" color="textSecondary" align="center" sx={{ mt: 4 }}>
                No campaign data available
              </Typography>
            )}
          </Paper>
        </Grid>
      </Grid>

      {/* Booking Type Performance */}
      <Paper sx={{ p: { xs: 2, sm: 3 }, overflowX: 'auto' }}>
        <Typography variant="h6" gutterBottom sx={{ fontSize: { xs: '1rem', sm: '1.25rem' } }}>
          Booking Type Performance
        </Typography>
        <TableContainer sx={{ maxWidth: '100%', overflowX: 'auto' }}>
          <Table sx={{ minWidth: { xs: '800px', sm: 'auto' } }}>
            <TableHead>
              <TableRow>
                <TableCell sx={{ fontSize: { xs: '0.75rem', sm: '0.875rem' }, padding: { xs: '8px', sm: '16px' } }}>Booking Type</TableCell>
                <TableCell align="right" sx={{ fontSize: { xs: '0.75rem', sm: '0.875rem' }, padding: { xs: '8px', sm: '16px' } }}>Leads</TableCell>
                <TableCell align="right" sx={{ fontSize: { xs: '0.75rem', sm: '0.875rem' }, padding: { xs: '8px', sm: '16px' } }}>Registrations</TableCell>
                <TableCell align="right" sx={{ fontSize: { xs: '0.75rem', sm: '0.875rem' }, padding: { xs: '8px', sm: '16px' } }}>Payments</TableCell>
                <TableCell align="right" sx={{ fontSize: { xs: '0.75rem', sm: '0.875rem' }, padding: { xs: '8px', sm: '16px' } }}>Revenue</TableCell>
                <TableCell align="right" sx={{ fontSize: { xs: '0.75rem', sm: '0.875rem' }, padding: { xs: '8px', sm: '16px' } }}>Avg Order Value</TableCell>
                <TableCell align="right" sx={{ fontSize: { xs: '0.75rem', sm: '0.875rem' }, padding: { xs: '8px', sm: '16px' } }}>Completion Rate</TableCell>
                <TableCell align="right" sx={{ fontSize: { xs: '0.75rem', sm: '0.875rem' }, padding: { xs: '8px', sm: '16px' } }}>Payment Rate</TableCell>
              </TableRow>
            </TableHead>
            <TableBody>
              {bookingTypes.map((type, idx) => (
                <TableRow key={idx}>
                  <TableCell sx={{ fontSize: { xs: '0.75rem', sm: '0.875rem' }, padding: { xs: '8px', sm: '16px' } }}>{type.booking_type || "Unknown"}</TableCell>
                  <TableCell align="right" sx={{ fontSize: { xs: '0.75rem', sm: '0.875rem' }, padding: { xs: '8px', sm: '16px' } }}>{type.form_starts || 0}</TableCell>
                  <TableCell align="right" sx={{ fontSize: { xs: '0.75rem', sm: '0.875rem' }, padding: { xs: '8px', sm: '16px' } }}>{type.form_completions || 0}</TableCell>
                  <TableCell align="right" sx={{ fontSize: { xs: '0.75rem', sm: '0.875rem' }, padding: { xs: '8px', sm: '16px' } }}>{type.payments || 0}</TableCell>
                  <TableCell align="right" sx={{ fontSize: { xs: '0.75rem', sm: '0.875rem' }, padding: { xs: '8px', sm: '16px' } }}>{formatCurrency(type.revenue || 0)}</TableCell>
                  <TableCell align="right" sx={{ fontSize: { xs: '0.75rem', sm: '0.875rem' }, padding: { xs: '8px', sm: '16px' } }}>{formatCurrency(type.avg_order_value || 0)}</TableCell>
                  <TableCell align="right" sx={{ fontSize: { xs: '0.75rem', sm: '0.875rem' }, padding: { xs: '8px', sm: '16px' } }}>
                    <Chip
                      label={formatPercent(type.form_completion_rate || 0)}
                      size="small"
                      sx={{ fontSize: { xs: '0.65rem', sm: '0.75rem' } }}
                      color={
                        (type.form_completion_rate || 0) > 50 ? "success" : "default"
                      }
                    />
                  </TableCell>
                  <TableCell align="right" sx={{ fontSize: { xs: '0.75rem', sm: '0.875rem' }, padding: { xs: '8px', sm: '16px' } }}>
                    <Chip
                      label={formatPercent(type.payment_rate || 0)}
                      size="small"
                      sx={{ fontSize: { xs: '0.65rem', sm: '0.75rem' } }}
                      color={(type.payment_rate || 0) > 80 ? "success" : "default"}
                    />
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </TableContainer>
      </Paper>
        </>
      )}
      </React.Fragment>
      )}
      {/* Google Tab Content */}
      {activeTab === 1 && (
        <>
          <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mb: 3 }}>
            <Typography variant="h6" sx={{ fontWeight: 600 }}>
            Google Ads Performance
          </Typography>
          </Box>
          {googleLoading ? (
            <Box sx={{ display: 'flex', justifyContent: 'center', alignItems: 'center', minHeight: '400px' }}>
              <CircularProgress />
            </Box>
          ) : googleError ? (
            <Alert severity="error" sx={{ mb: 3 }}>
              {googleError}
            </Alert>
          ) : !googleData ? (
            <Alert severity="info" sx={{ mb: 3 }}>
              No Google Ads data available. Data is synced automatically overnight. Please check back tomorrow or contact support if data is missing.
            </Alert>
          ) : (
            <>
              {/* Overall Metrics Cards */}
              <Grid container spacing={{ xs: 2, sm: 3 }} sx={{ mb: { xs: 3, sm: 4 } }}>
                <Grid item xs={12} sm={6} md={3}>
                  <Card 
                    onClick={() => handleCardClick('google_form_views', { utm_source: 'google' })}
                    sx={getKPICardStyle('secondary.main')}
                  >
                    <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.5, mb: 0.5 }}>
                      <Typography 
                        variant="body2" 
                        sx={getLabelTypography()}
                      >
                        Google Form Views
                      </Typography>
                      <MuiTooltip title={metricDescriptions['google_form_views'] || 'Click to see detailed breakdown'} arrow>
                        <InformationCircleIcon className="h-3.5 w-3.5 text-gray-500 cursor-help" />
                      </MuiTooltip>
                    </Box>
                    <Box sx={{ mt: 0.5, display: 'flex', alignItems: 'baseline', gap: 1 }}>
                      <Typography 
                        variant="h4" 
                        sx={getValueTypography()}
                      >
                        {(googleData.overall?.google_form_views || 0).toLocaleString()}
                      </Typography>
                    </Box>
                    <Typography 
                      variant="caption" 
                      sx={{ 
                        color: 'text.secondary',
                        fontSize: '0.75rem',
                        display: 'block',
                        mt: 0.5
                      }}
                    >
                      {(googleData.overall?.google_unique_view_sessions || 0).toLocaleString()} unique sessions
                    </Typography>
                  </Card>
                </Grid>
                <Grid item xs={12} sm={6} md={3}>
                  <Card 
                    onClick={() => handleCardClick('google_form_starts', { utm_source: 'google' })}
                    sx={getKPICardStyle('primary.main')}
                  >
                    <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.5, mb: 0.5 }}>
                      <Typography 
                        variant="body2" 
                        sx={getLabelTypography()}
                      >
                        Google Leads
                      </Typography>
                      <MuiTooltip title={metricDescriptions['google_form_starts'] || 'Click to see detailed breakdown'} arrow>
                        <InformationCircleIcon className="h-3.5 w-3.5 text-gray-500 cursor-help" />
                      </MuiTooltip>
                    </Box>
                    <Box sx={{ mt: 0.5, display: 'flex', alignItems: 'baseline', gap: 1 }}>
                      <Typography 
                        variant="h4" 
                        sx={getValueTypography()}
                      >
                        {(googleData.overall?.google_form_starts || 0).toLocaleString()}
                      </Typography>
                    </Box>
                    <Typography 
                      variant="caption" 
                      sx={{ 
                        color: 'text.secondary',
                        fontSize: '0.75rem',
                        display: 'block',
                        mt: 0.5
                      }}
                    >
                      {googleData.overall?.google_form_views > 0
                        ? formatPercent(((googleData.overall?.google_form_starts || 0) / googleData.overall.google_form_views) * 100)
                        : '0.0%'}{' '}
                      start rate
                    </Typography>
                  </Card>
                </Grid>
                <Grid item xs={12} sm={6} md={3}>
                  <Card 
                    onClick={() => handleCardClick('google_form_completions', { utm_source: 'google', payment_status: 'paid,verified' })}
                    sx={getKPICardStyle('success.main')}
                  >
                    <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.5, mb: 0.5 }}>
                      <Typography 
                        variant="body2" 
                        sx={getLabelTypography()}
                      >
                        Google Registrations
                      </Typography>
                      <MuiTooltip title={metricDescriptions['google_form_completions'] || 'Click to see detailed breakdown'} arrow>
                        <InformationCircleIcon className="h-3.5 w-3.5 text-gray-500 cursor-help" />
                      </MuiTooltip>
                    </Box>
                    <Box sx={{ mt: 0.5, display: 'flex', alignItems: 'baseline', gap: 1 }}>
                      <Typography 
                        variant="h4" 
                        sx={getValueTypography()}
                      >
                        {(googleData.overall?.google_form_completions || 0).toLocaleString()}
                      </Typography>
                    </Box>
                    <Typography 
                      variant="caption" 
                      sx={{ 
                        color: 'text.secondary',
                        fontSize: '0.75rem',
                        display: 'block',
                        mt: 0.5
                      }}
                    >
                      {formatPercent(googleData.overall?.google_form_completion_rate || 0)} completion rate
                    </Typography>
                  </Card>
                </Grid>
                <Grid item xs={12} sm={6} md={3}>
                  <Card 
                    onClick={() => handleCardClick('google_revenue', { utm_source: 'google', payment_status: 'paid' })}
                    sx={getKPICardStyle('info.main')}
                  >
                    <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.5, mb: 0.5 }}>
                      <Typography 
                        variant="body2" 
                        sx={getLabelTypography()}
                      >
                        Google Revenue
                      </Typography>
                      <MuiTooltip title={metricDescriptions['google_revenue'] || 'Click to see detailed breakdown'} arrow>
                        <InformationCircleIcon className="h-3.5 w-3.5 text-gray-500 cursor-help" />
                      </MuiTooltip>
                    </Box>
                    <Box sx={{ mt: 0.5, display: 'flex', alignItems: 'baseline', gap: 1 }}>
                      <Typography 
                        variant="h4" 
                        sx={getValueTypography()}
                      >
                        {formatCurrency(googleData.overall?.google_revenue || 0)}
                      </Typography>
                    </Box>
                    <Typography 
                      variant="caption" 
                      sx={{ 
                        color: 'text.secondary',
                        fontSize: '0.75rem',
                        display: 'block',
                        mt: 0.5
                      }}
                    >
                      {googleData.overall?.google_payments > 0
                        ? formatCurrency((googleData.overall?.google_revenue || 0) / googleData.overall.google_payments)
                        : "$0"}{" "}
                      avg order value
                    </Typography>
                  </Card>
                </Grid>
              </Grid>

              {/* Google Ads Performance KPIs */}
              {(googleData.overall?.google_impressions > 0 || googleData.overall?.google_spend > 0) && (
          <Grid container spacing={{ xs: 2, sm: 3 }} sx={{ mb: { xs: 3, sm: 4 } }}>
                  <Grid item xs={12}>
                    <Typography variant="h6" sx={{ mb: { xs: 2, sm: 3 }, fontWeight: 600, color: 'text.primary', fontSize: { xs: '1rem', sm: '1.25rem' } }}>
                      Google Ads Performance KPIs
                    </Typography>
                  </Grid>
                  
                  {/* Top Row: Primary Ad Metrics */}
            <Grid item xs={12} sm={6} md={3}>
                    <Card 
                      onClick={() => handleCardClick('google_impressions')}
                      sx={getKPICardStyle('info.main')}
                    >
                      <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.5, mb: 0.5 }}>
                        <Typography 
                          variant="body2" 
                          sx={getLabelTypography()}
                        >
                          Ad Impressions
                        </Typography>
                        <MuiTooltip title={metricDescriptions['google_impressions'] || 'Click to see detailed breakdown'} arrow>
                          <InformationCircleIcon className="h-3.5 w-3.5 text-gray-500 cursor-help" />
                        </MuiTooltip>
                      </Box>
                      <Box sx={{ mt: 0.5, display: 'flex', alignItems: 'baseline', gap: 1 }}>
                        <Typography 
                          variant="h4" 
                          sx={getValueTypography()}
                        >
                          {Number(googleData.overall?.google_impressions || 0).toLocaleString()}
                        </Typography>
                      </Box>
                      <Typography 
                        variant="caption" 
                        sx={{ 
                          color: 'text.secondary',
                          fontSize: '0.75rem',
                          display: 'block',
                          mt: 0.5
                        }}
                      >
                        {formatPercent(googleData.overall?.google_ctr || 0)} CTR
                      </Typography>
                    </Card>
            </Grid>

            <Grid item xs={12} sm={6} md={3}>
                    <Card 
                      onClick={() => handleCardClick('google_clicks')}
                      sx={getKPICardStyle('warning.main')}
                    >
                      <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.5, mb: 0.5 }}>
                        <Typography 
                          variant="body2" 
                          sx={getLabelTypography()}
                        >
                          Ad Clicks
                        </Typography>
                        <MuiTooltip title={metricDescriptions['google_clicks'] || 'Click to see detailed breakdown'} arrow>
                          <InformationCircleIcon className="h-3.5 w-3.5 text-gray-500 cursor-help" />
                        </MuiTooltip>
                      </Box>
                      <Box sx={{ mt: 0.5, display: 'flex', alignItems: 'baseline', gap: 1 }}>
                        <Typography 
                          variant="h4" 
                          sx={getValueTypography()}
                        >
                          {(googleData.overall?.google_clicks || 0).toLocaleString()}
                        </Typography>
                      </Box>
                      <Typography 
                        variant="caption" 
                        sx={{ 
                          color: 'text.secondary',
                          fontSize: '0.75rem',
                          display: 'block',
                          mt: 0.5
                        }}
                      >
                        ${parseFloat(googleData.overall?.google_cpc || 0).toFixed(2)} avg CPC
                      </Typography>
                    </Card>
            </Grid>
            <Grid item xs={12} sm={6} md={3}>
                    <Card 
                      onClick={() => handleCardClick('google_spend')}
                      sx={getKPICardStyle('error.main')}
                    >
                      <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.5, mb: 0.5 }}>
                        <Typography 
                          variant="body2" 
                          sx={getLabelTypography()}
                        >
                          Ad Spend
                        </Typography>
                        <MuiTooltip title={metricDescriptions['google_spend'] || 'Click to see detailed breakdown'} arrow>
                          <InformationCircleIcon className="h-3.5 w-3.5 text-gray-500 cursor-help" />
                        </MuiTooltip>
                      </Box>
                      <Box sx={{ mt: 0.5, display: 'flex', alignItems: 'baseline', gap: 1 }}>
                        <Typography 
                          variant="h4" 
                          sx={getValueTypography()}
                        >
                          {formatCurrency(googleData.overall?.google_spend || 0)}
                        </Typography>
                      </Box>
                      <Typography 
                        variant="caption" 
                        sx={{ 
                          color: 'text.secondary',
                          fontSize: '0.75rem',
                          display: 'block',
                          mt: 0.5
                        }}
                      >
                        Historical payment data
                      </Typography>
                    </Card>
            </Grid>

            <Grid item xs={12} sm={6} md={3}>
                    <Card 
                      onClick={() => handleCardClick('google_roas', { utm_source: 'google' })}
                      sx={getKPICardStyle('success.main')}
                    >
                      <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.5, mb: 0.5 }}>
                        <Typography 
                          variant="body2" 
                          sx={getLabelTypography()}
                        >
                          ROAS
                        </Typography>
                        <MuiTooltip title={metricDescriptions['google_roas'] || 'Click to see detailed breakdown'} arrow>
                          <InformationCircleIcon className="h-3.5 w-3.5 text-gray-500 cursor-help" />
                        </MuiTooltip>
                      </Box>
                      <Box sx={{ mt: 0.5, display: 'flex', alignItems: 'baseline', gap: 1 }}>
                        <Typography 
                          variant="h4" 
                          sx={getValueTypography()}
                        >
                          {parseFloat(googleData.overall?.google_roas || 0).toFixed(2)}x
                        </Typography>
                      </Box>
                      <Typography 
                        variant="caption" 
                        sx={{ 
                          color: 'text.secondary',
                          fontSize: '0.75rem',
                          display: 'block',
                          mt: 0.5
                        }}
                      >
                        Trial revenue / Ad spend
                      </Typography>
                    </Card>
            </Grid>

                  {/* Row 2: Revenue & ROI Metrics */}
                  {/* Google Realized Revenue Card */}
                  <Grid item xs={12} sm={6} md={3}>
                    <Card
                      onClick={handleGoogleRealizedRevenueClick}
                      sx={getKPICardStyle('info.main')}
                    >
                      <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.5, mb: 0.5 }}>
                        <Typography
                          variant="body2"
                          sx={getLabelTypography()}
                        >
                          Realized Revenue
                        </Typography>
                        <MuiTooltip title="Track actual revenue generated over time by Google-acquired clients. Click to see detailed breakdown and ROI analysis." arrow>
                          <InformationCircleIcon className="h-3.5 w-3.5 text-gray-500 cursor-help" />
                        </MuiTooltip>
                      </Box>
                      <Box sx={{ mt: 0.5, display: 'flex', alignItems: 'baseline', gap: 1 }}>
                        <Typography
                          variant="h4"
                          sx={getValueTypography()}
                        >
                          {googleRealizedRevenueData?.summary?.total_revenue
                            ? formatCurrency(parseFloat(googleRealizedRevenueData.summary.total_revenue))
                            : '—'}
                        </Typography>
                      </Box>
                      <Typography
                        variant="caption"
                        sx={{
                          color: 'text.secondary',
                          fontSize: '0.75rem',
                          display: 'block',
                          mt: 0.5
                        }}
                      >
                        {googleRealizedRevenueData?.summary?.total_clients
                          ? `${googleRealizedRevenueData.summary.total_clients} clients`
                          : 'Click to load data'}
                      </Typography>
                    </Card>
                  </Grid>

                  {/* Google Actual ROAS (AROAS) Card */}
                  <Grid item xs={12} sm={6} md={3}>
                    <Card
                      onClick={handleGoogleRealizedRevenueClick}
                      sx={getKPICardStyle('warning.main')}
                    >
                      <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.5, mb: 0.5 }}>
                        <Typography
                          variant="body2"
                          sx={getLabelTypography()}
                        >
                          Actual ROAS (AROAS)
                        </Typography>
                        <MuiTooltip title="Realized Revenue divided by Google Ad Spend - the true return on your Google advertising investment" arrow>
                          <InformationCircleIcon className="h-3.5 w-3.5 text-gray-500 cursor-help" />
                        </MuiTooltip>
                      </Box>
                      <Box sx={{ mt: 0.5, display: 'flex', alignItems: 'baseline', gap: 1 }}>
                        <Typography
                          variant="h4"
                          sx={getValueTypography()}
                        >
                          {(() => {
                            const realizedRevenue = parseFloat(googleRealizedRevenueData?.summary?.total_revenue || 0);
                            const googleAdSpend = parseFloat(googleData.overall?.google_spend || 0);
                            if (googleAdSpend > 0) {
                              return `${(realizedRevenue / googleAdSpend).toFixed(2)}x`;
                            }
                            return '—';
                          })()}
                        </Typography>
                      </Box>
                      <Typography
                        variant="caption"
                        sx={{
                          color: 'text.secondary',
                          fontSize: '0.75rem',
                          display: 'block',
                          mt: 0.5
                        }}
                      >
                        Realized Revenue / Google Ad Spend
                      </Typography>
                    </Card>
                  </Grid>

                  {/* Cost Per Lead (CPL) */}
                  <Grid item xs={12} sm={6} md={3}>
                    <Card
                      onClick={() => handleCardClick('google_cpl', { utm_source: 'google' })}
                      sx={getKPICardStyle('primary.main')}
                    >
                      <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.5, mb: 0.5 }}>
                        <Typography
                          variant="body2"
                          sx={getLabelTypography()}
                        >
                          Cost Per Lead (CPL)
                        </Typography>
                        <MuiTooltip title={metricDescriptions['google_cpl'] || 'Click to see detailed breakdown'} arrow>
                          <InformationCircleIcon className="h-3.5 w-3.5 text-gray-500 cursor-help" />
                        </MuiTooltip>
                      </Box>
                      <Box sx={{ mt: 0.5, display: 'flex', alignItems: 'baseline', gap: 1 }}>
                        <Typography
                          variant="h4"
                          sx={getValueTypography()}
                        >
                          ${parseFloat(googleData.overall?.google_cpl || 0).toFixed(2)}
                        </Typography>
                      </Box>
                      <Typography
                        variant="caption"
                        sx={{
                          color: 'text.secondary',
                          fontSize: '0.75rem',
                          display: 'block',
                          mt: 0.5
                        }}
                      >
                        Google spend / Google leads
                      </Typography>
                    </Card>
                  </Grid>

                  {/* Cost Per Registration (CPR) */}
                  <Grid item xs={12} sm={6} md={3}>
                    <Card
                      onClick={() => handleCardClick('google_cpr', { utm_source: 'google' })}
                      sx={getKPICardStyle('success.main')}
                    >
                      <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.5, mb: 0.5 }}>
                        <Typography
                          variant="body2"
                          sx={getLabelTypography()}
                        >
                          Cost Per Registration (CPR)
                        </Typography>
                        <MuiTooltip title={metricDescriptions['google_cpr'] || 'Click to see detailed breakdown'} arrow>
                          <InformationCircleIcon className="h-3.5 w-3.5 text-gray-500 cursor-help" />
                        </MuiTooltip>
                      </Box>
                      <Box sx={{ mt: 0.5, display: 'flex', alignItems: 'baseline', gap: 1 }}>
                        <Typography
                          variant="h4"
                          sx={getValueTypography()}
                        >
                          ${parseFloat(googleData.overall?.google_cpr || 0).toFixed(2)}
                        </Typography>
                      </Box>
                      <Typography
                        variant="caption"
                        sx={{
                          color: 'text.secondary',
                          fontSize: '0.75rem',
                          display: 'block',
                          mt: 0.5
                        }}
                      >
                        Google spend / Google completions
                      </Typography>
                    </Card>
                  </Grid>

                  {/* Row 3: Conversion Metrics */}
                  {visibleMetrics.google_full_client_conversion_rate && (
                  <Grid item xs={12} sm={6} md={3}>
                    <Card
                      onClick={() => handleCardClick('google_full_client_conversion')}
                      sx={getKPICardStyle('success.main')}
                    >
                      <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.5, mb: 0.5 }}>
                        <Typography
                          variant="body2"
                          sx={getLabelTypography()}
                        >
                          Google Full Client Conversion Rate
                        </Typography>
                        <MuiTooltip title="Percentage of Google registrations that become fully converted clients (trial + first lesson paid)" arrow>
                          <InformationCircleIcon className="h-3.5 w-3.5 text-gray-500 cursor-help" />
                        </MuiTooltip>
                      </Box>
                      <Box sx={{ mt: 0.5, display: 'flex', alignItems: 'baseline', gap: 1 }}>
                        <Typography
                          variant="h4"
                          sx={getValueTypography()}
                        >
                          {googleFullClientConversionData?.summary?.conversion_rate !== undefined
                            ? `${parseFloat(googleFullClientConversionData.summary.conversion_rate || 0).toFixed(1)}%`
                            : '—'}
                        </Typography>
                      </Box>
                      <Typography
                        variant="caption"
                        sx={{
                          color: 'text.secondary',
                          fontSize: '0.75rem',
                          display: 'block',
                          mt: 0.5
                        }}
                      >
                        {googleFullClientConversionData?.summary?.fully_converted_registrations || 0} of {googleFullClientConversionData?.summary?.total_registrations || 0} Google registrations
                      </Typography>
                    </Card>
                  </Grid>
                  )}

                  <Grid item xs={12} sm={6} md={3}>
                    <Card
                      onClick={() => handleCardClick('google_ltv_roas', { utm_source: 'google' })}
                      sx={getKPICardStyle('info.main')}
                    >
                      <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.5, mb: 0.5 }}>
                        <Typography
                          variant="body2"
                          sx={getLabelTypography()}
                        >
                          LTV ROAS
                        </Typography>
                        <MuiTooltip title={metricDescriptions['google_ltv_roas'] || 'Click to see detailed breakdown'} arrow>
                          <InformationCircleIcon className="h-3.5 w-3.5 text-gray-500 cursor-help" />
                        </MuiTooltip>
                      </Box>
                      <Box sx={{ mt: 0.5, display: 'flex', alignItems: 'baseline', gap: 1 }}>
                        <Typography
                          variant="h4"
                          sx={getValueTypography()}
                        >
                          {parseFloat(googleData.overall?.google_ltv_roas || 0).toFixed(2)}x
                        </Typography>
                      </Box>
                      <Typography
                        variant="caption"
                        sx={{
                          color: 'text.secondary',
                          fontSize: '0.75rem',
                          display: 'block',
                          mt: 0.5
                        }}
                      >
                        LTV-based revenue / Ad spend
                      </Typography>
                    </Card>
                  </Grid>

                  <Grid item xs={12} sm={6} md={3}>
                    <Card
                      onClick={() => handleCardClick('google_conversions', { utm_source: 'google' })}
                      sx={getKPICardStyle('warning.main')}
                    >
                      <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.5, mb: 0.5 }}>
                        <Typography
                          variant="body2"
                          sx={getLabelTypography()}
                        >
                          Conversions
                        </Typography>
                        <MuiTooltip title={metricDescriptions['google_conversions'] || 'Click to see detailed breakdown'} arrow>
                          <InformationCircleIcon className="h-3.5 w-3.5 text-gray-500 cursor-help" />
                        </MuiTooltip>
                      </Box>
                      <Box sx={{ mt: 0.5, display: 'flex', alignItems: 'baseline', gap: 1 }}>
                        <Typography
                          variant="h4"
                          sx={getValueTypography()}
                        >
                          {(googleData.overall?.google_conversions || 0).toLocaleString()}
                        </Typography>
                      </Box>
                      <Typography
                        variant="caption"
                        sx={{
                          color: 'text.secondary',
                          fontSize: '0.75rem',
                          display: 'block',
                          mt: 0.5
                        }}
                      >
                        {formatPercent(googleData.overall?.google_conversion_rate || 0)} conversion rate
                      </Typography>
                    </Card>
                  </Grid>
                </Grid>
              )}
              {/* Daily Performance Chart */}
              {googleData.daily && googleData.daily.length > 0 && (
                <Paper sx={{ p: { xs: 2, sm: 3 }, mb: { xs: 2, sm: 3 } }}>
                  <Typography variant="h6" gutterBottom sx={{ fontSize: { xs: '1rem', sm: '1.25rem' } }}>
                    Daily Performance Trends
                  </Typography>
                  <Box sx={{ width: '100%', height: { xs: 300, sm: 400 } }}>
                    <ResponsiveContainer width="100%" height="100%">
                      <LineChart data={googleData.daily}>
                        <CartesianGrid strokeDasharray="3 3" />
                        <XAxis 
                          dataKey="date" 
                          tickFormatter={(value) => {
                            const date = DateTime.fromISO(value);
                            return date.toFormat('MMM d');
                          }}
                        />
                        <YAxis yAxisId="left" />
                        <YAxis yAxisId="right" orientation="right" />
                        <Tooltip 
                          formatter={(value, name) => {
                            if (name === 'spend' || name === 'revenue') {
                              return formatCurrency(value);
                            }
                            return value.toLocaleString();
                          }}
                          labelFormatter={(label) => {
                            const date = DateTime.fromISO(label);
                            return date.toFormat('MMM d, yyyy');
                          }}
                        />
                        <Legend />
                        <Line yAxisId="left" type="monotone" dataKey="impressions" stroke="#2196f3" strokeWidth={2} name="Impressions" dot={{ r: 3 }} />
                        <Line yAxisId="left" type="monotone" dataKey="clicks" stroke="#ff9800" strokeWidth={2} name="Clicks" dot={{ r: 3 }} />
                        <Line yAxisId="right" type="monotone" dataKey="spend" stroke="#f44336" strokeWidth={2} name="Ad Spend" dot={{ r: 3 }} />
                        <Line yAxisId="right" type="monotone" dataKey="revenue" stroke="#4caf50" strokeWidth={2} name="Revenue" dot={{ r: 3 }} />
                      </LineChart>
                    </ResponsiveContainer>
        </Box>
                </Paper>
              )}

              {/* Campaign Performance Table */}
              {googleData.campaigns && googleData.campaigns.length > 0 && (
                <Paper sx={{ p: { xs: 2, sm: 3 }, mb: { xs: 2, sm: 3 }, overflowX: 'auto' }}>
                  <Typography variant="h6" gutterBottom sx={{ fontSize: { xs: '1rem', sm: '1.25rem' } }}>
                    Campaign Performance
                  </Typography>
                  <TableContainer>
                    <Table size="small">
                      <TableHead>
                        <TableRow>
                          <TableCell>Campaign</TableCell>
                          <TableCell align="right">Impressions</TableCell>
                          <TableCell align="right">Clicks</TableCell>
                          <TableCell align="right">Spend</TableCell>
                          <TableCell align="right">CTR</TableCell>
                          <TableCell align="right">CPC</TableCell>
                          <TableCell align="right">Leads</TableCell>
                          <TableCell align="right">Registrations</TableCell>
                          <TableCell align="right">Revenue</TableCell>
                          <TableCell align="right">ROAS</TableCell>
                          <TableCell align="right">LTV ROAS</TableCell>
                        </TableRow>
                      </TableHead>
                      <TableBody>
                        {googleData.campaigns.map((campaign, idx) => (
                          <TableRow key={idx}>
                            <TableCell>{campaign.campaign_name || campaign.utm_campaign || 'Unknown'}</TableCell>
                            <TableCell align="right">{(campaign.impressions || 0).toLocaleString()}</TableCell>
                            <TableCell align="right">{(campaign.clicks || 0).toLocaleString()}</TableCell>
                            <TableCell align="right">{formatCurrency(campaign.spend || 0)}</TableCell>
                            <TableCell align="right">{formatPercent(campaign.ctr || 0)}</TableCell>
                            <TableCell align="right">{formatCurrency(campaign.cpc || 0)}</TableCell>
                            <TableCell align="right">{(campaign.form_starts || 0).toLocaleString()}</TableCell>
                            <TableCell align="right">{(campaign.form_completions || 0).toLocaleString()}</TableCell>
                            <TableCell align="right">{formatCurrency(campaign.revenue || 0)}</TableCell>
                            <TableCell align="right">
                              <Chip
                                label={`${parseFloat(campaign.roas || 0).toFixed(2)}x`}
                                size="small"
                                color={campaign.roas > 2 ? "success" : campaign.roas > 1 ? "warning" : "default"}
                              />
                            </TableCell>
                            <TableCell align="right">
                              <Chip
                                label={`${parseFloat(campaign.ltv_roas || 0).toFixed(2)}x`}
                                size="small"
                                color={campaign.ltv_roas > 3 ? "success" : campaign.ltv_roas > 2 ? "warning" : "default"}
                              />
                            </TableCell>
                          </TableRow>
                        ))}
                      </TableBody>
                    </Table>
                  </TableContainer>
                </Paper>
              )}
              {/* Campaign Spend vs Revenue Chart */}
              {googleData.campaigns && googleData.campaigns.length > 0 && (
                <Paper sx={{ p: { xs: 2, sm: 3 }, mb: { xs: 2, sm: 3 } }}>
                  <Typography variant="h6" gutterBottom sx={{ fontSize: { xs: '1rem', sm: '1.25rem' } }}>
                    Campaign Performance: Spend vs Revenue
                  </Typography>
                  <Box sx={{ width: '100%', height: { xs: 300, sm: 400 } }}>
                    <ResponsiveContainer width="100%" height="100%">
                      <BarChart data={googleData.campaigns.slice(0, 10)}>
                        <CartesianGrid strokeDasharray="3 3" />
                        <XAxis 
                          dataKey="campaign_name" 
                          angle={-45}
                          textAnchor="end"
                          height={100}
                          tick={{ fontSize: 12 }}
                        />
                        <YAxis yAxisId="left" />
                        <YAxis yAxisId="right" orientation="right" />
                        <Tooltip 
                          formatter={(value) => formatCurrency(value)}
                        />
                        <Legend />
                        <Bar yAxisId="left" dataKey="spend" fill="#f44336" name="Ad Spend" />
                        <Bar yAxisId="right" dataKey="revenue" fill="#4caf50" name="Revenue" />
                      </BarChart>
                    </ResponsiveContainer>
                  </Box>
                </Paper>
              )}
            </>
          )}
        </>
      )}

      {/* Klaviyo Tab Content */}
      {activeTab === 2 && (
        <Box>
          <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mb: 3 }}>
            <Typography variant="h6" sx={{ fontWeight: 600 }}>
              Klaviyo Email Marketing Performance
            </Typography>
          </Box>

          {klaviyoLoading ? (
            <Box sx={{ display: 'flex', justifyContent: 'center', alignItems: 'center', minHeight: '400px' }}>
              <CircularProgress />
            </Box>
          ) : klaviyoError ? (
            <Alert severity="error" sx={{ mb: 3 }}>
              {klaviyoError}
            </Alert>
          ) : klaviyoData ? (
            <>
            <Grid container spacing={{ xs: 2, sm: 3 }}>
              {/* Klaviyo Metrics Cards */}
              <Grid item xs={12} sm={6} md={3}>
                <Card 
                  sx={{ 
                    height: '100%', 
                    borderLeft: '4px solid', 
                    borderColor: 'primary.main',
                    cursor: 'pointer',
                    transition: 'all 0.2s',
                    '&:hover': { boxShadow: 4, transform: 'translateY(-2px)' }
                  }}
                  onClick={() => {
                    setMetricDetailType('subscribers');
                    setMetricDetailDialogOpen(true);
                  }}
                >
                  <CardContent sx={{ p: 3, position: 'relative' }}>
                    <IconButton
                      size="small"
                      sx={{ position: 'absolute', top: 8, right: 8, opacity: 0.6 }}
                      onClick={(e) => {
                        e.stopPropagation();
                        setMetricDetailType('subscribers');
                        setMetricDetailDialogOpen(true);
                      }}
                    >
                      <InformationCircleIcon className="h-4 w-4" />
                    </IconButton>
                    <Typography variant="body2" sx={{ color: 'text.secondary', fontWeight: 500, fontSize: '0.75rem', textTransform: 'uppercase', mb: 1.5 }}>
                      Total Subscribers
                    </Typography>
                    <Typography variant="h4" sx={{ color: 'primary.main', fontWeight: 700, fontSize: '2rem', mb: 1 }}>
                      {(klaviyoData.summary?.total_subscribers || 0).toLocaleString()}
                    </Typography>
                    <Typography variant="caption" sx={{ color: 'text.secondary', fontSize: '0.75rem' }}>
                      Active email subscribers
                    </Typography>
                  </CardContent>
                </Card>
              </Grid>
              <Grid item xs={12} sm={6} md={3}>
                <MetricCard
                  title="Emails Sent"
                  value={(klaviyoData.summary?.emails_sent || 0).toLocaleString()}
                  subtitle={`${(klaviyoData.summary?.campaign_emails_sent || 0).toLocaleString()} campaigns + ${(klaviyoData.summary?.flow_emails_sent || 0).toLocaleString()} flows`}
                  color="info"
                  metricType="emails_sent"
                />
              </Grid>
              <Grid item xs={12} sm={6} md={3}>
                <MetricCard
                  title="Open Rate"
                  value={formatPercent(klaviyoData.summary?.open_rate || 0)}
                  subtitle={`${(klaviyoData.summary?.unique_opens || 0).toLocaleString()} unique opens`}
                  color="success"
                  metricType="open_rate"
                />
              </Grid>
              <Grid item xs={12} sm={6} md={3}>
                <MetricCard
                  title="Click Rate"
                  value={formatPercent(klaviyoData.summary?.click_rate || 0)}
                  subtitle={`${(klaviyoData.summary?.unique_clicks || 0).toLocaleString()} unique clicks`}
                  color="warning"
                  metricType="click_rate"
                />
              </Grid>
              <Grid item xs={12} sm={6} md={3}>
                <MetricCard
                  title="Conversions"
                  value={(klaviyoData.summary?.conversions || 0).toLocaleString()}
                  subtitle={`${formatPercent(klaviyoData.summary?.conversion_rate || 0)} conversion rate`}
                  color="secondary"
                  metricType="conversions"
                />
              </Grid>
              <Grid item xs={12} sm={6} md={3}>
                <MetricCard
                  title="Revenue Generated"
                  value={formatCurrency(klaviyoData.summary?.revenue || 0)}
                  subtitle={`${formatCurrency(klaviyoData.summary?.klaviyo_client_revenue || 0)} from ${klaviyoData.summary?.klaviyo_acquired_clients || 0} clients`}
                  color="error"
                  metricType="revenue"
                />
              </Grid>
              <Grid item xs={12} sm={6} md={3}>
                <MetricCard
                  title="Revenue per Email"
                  value={formatCurrency(klaviyoData.summary?.revenue_per_email || 0)}
                  subtitle="Average revenue per sent email"
                  color="success"
                  metricType="revenue_per_email"
                />
              </Grid>
              <Grid item xs={12} sm={6} md={3}>
                <MetricCard
                  title="Unsubscribes"
                  value={(klaviyoData.summary?.unsubscribes || 0).toLocaleString()}
                  subtitle={`${formatPercent(klaviyoData.summary?.unsubscribe_rate || 0)} unsubscribe rate`}
                  color="info"
                  metricType="unsubscribes"
                />
              </Grid>
              {visibleMetrics.klaviyo_full_client_conversion_rate && (
              <Grid item xs={12} sm={6} md={3}>
                <Card 
                  onClick={() => handleCardClick('klaviyo_full_client_conversion')}
                  sx={getKPICardStyle('success.main')}
                >
                  <Typography 
                    variant="body2" 
                    sx={getLabelTypography()}
                  >
                    Klaviyo Full Client Conversion Rate
                  </Typography>
                  <Box sx={{ mt: 0.5, display: 'flex', alignItems: 'baseline', gap: 1 }}>
                    <Typography 
                      variant="h4" 
                      sx={getValueTypography()}
                    >
                      {klaviyoFullClientConversionData?.summary?.conversion_rate !== undefined
                        ? `${parseFloat(klaviyoFullClientConversionData.summary.conversion_rate || 0).toFixed(1)}%`
                        : '—'}
                    </Typography>
                  </Box>
                  <Typography 
                    variant="caption" 
                    sx={{ 
                      color: 'text.secondary',
                      fontSize: '0.75rem',
                      display: 'block',
                      mt: 0.5
                    }}
                  >
                    {klaviyoFullClientConversionData?.summary?.fully_converted_registrations || 0} of {klaviyoFullClientConversionData?.summary?.total_registrations || 0} Klaviyo registrations
                  </Typography>
                </Card>
              </Grid>
              )}
            </Grid>

            {/* Revenue Breakdown by Campaign */}
            {klaviyoData.campaigns && klaviyoData.campaigns.length > 0 && (
              <Box sx={{ mt: 4 }}>
                <Typography variant="h6" sx={{ mb: 2, fontWeight: 600 }}>
                  Revenue Breakdown by Campaign
                </Typography>
                <Card>
                  <CardContent>
                    <ResponsiveContainer width="100%" height={300}>
                      <BarChart data={klaviyoData.campaigns
                        .filter(c => c.revenue > 0)
                        .sort((a, b) => b.revenue - a.revenue)
                        .slice(0, 10)
                        .map(c => ({
                          name: c.name?.substring(0, 30) || 'Untitled',
                          revenue: c.revenue || 0,
                          emails: c.emails_sent || 0,
                        }))}>
                        <CartesianGrid strokeDasharray="3 3" />
                        <XAxis dataKey="name" angle={-45} textAnchor="end" height={100} />
                        <YAxis />
                        <Tooltip formatter={(value) => formatCurrency(value)} />
                        <Legend />
                        <Bar dataKey="revenue" fill="#ef4444" name="Revenue" />
                      </BarChart>
                    </ResponsiveContainer>
                  </CardContent>
                </Card>
              </Box>
            )}

            {/* Campaign Performance Table */}
            {klaviyoData.campaigns && klaviyoData.campaigns.length > 0 && (
              <Box sx={{ mt: 4 }}>
                <Typography variant="h6" sx={{ mb: 2, fontWeight: 600 }}>
                  Campaign Performance
                </Typography>
                <TableContainer component={Paper}>
                  <Table>
                    <TableHead>
                      <TableRow>
                        <TableCell><strong>Campaign Name</strong></TableCell>
                        <TableCell><strong>UTM Campaign</strong></TableCell>
                        <TableCell><strong>Status</strong></TableCell>
                        <TableCell><strong>Subject</strong></TableCell>
                        <TableCell><strong>Sent</strong></TableCell>
                        <TableCell><strong>Opens</strong></TableCell>
                        <TableCell><strong>Clicks</strong></TableCell>
                        <TableCell><strong>Revenue</strong></TableCell>
                        <TableCell><strong>Sent Date</strong></TableCell>
                      </TableRow>
                    </TableHead>
                    <TableBody>
                      {klaviyoData.campaigns.slice(0, 50).map((campaign) => (
                        <TableRow 
                          key={campaign.id}
                          sx={{ 
                            cursor: 'pointer',
                            '&:hover': { backgroundColor: 'action.hover' }
                          }}
                          onClick={() => {
                            setSelectedCampaign(campaign);
                            setCampaignDetailDialogOpen(true);
                          }}
                        >
                          <TableCell><strong>{campaign.name || 'Untitled Campaign'}</strong></TableCell>
                          <TableCell>
                            {campaign.utm_campaign ? (
                              <Box>
                                <Typography variant="body2" sx={{ fontWeight: 600 }}>
                                  {campaign.utm_campaign}
                                </Typography>
                                {campaign.utm_source && (
                                  <Typography variant="caption" sx={{ color: 'text.secondary', display: 'block' }}>
                                    Source: {campaign.utm_source}
                                  </Typography>
                                )}
                              </Box>
                            ) : (
                              <Typography variant="body2" sx={{ color: 'text.secondary', fontStyle: 'italic' }}>
                                No UTM
                              </Typography>
                            )}
                          </TableCell>
                          <TableCell>
                            <Chip
                              label={campaign.status || 'unknown'}
                              size="small"
                              color={
                                campaign.status === 'sent' ? 'success' :
                                campaign.status === 'scheduled' ? 'info' :
                                campaign.status === 'draft' ? 'default' : 'warning'
                              }
                            />
                          </TableCell>
                          <TableCell>{campaign.subject || '-'}</TableCell>
                          <TableCell>{(campaign.emails_sent || 0).toLocaleString()}</TableCell>
                          <TableCell>
                            {formatPercent(campaign.open_rate || 0)}<br />
                            <Typography variant="caption" sx={{ color: 'text.secondary' }}>
                              {(campaign.unique_opens || 0).toLocaleString()} unique
                            </Typography>
                          </TableCell>
                          <TableCell>
                            {formatPercent(campaign.click_rate || 0)}<br />
                            <Typography variant="caption" sx={{ color: 'text.secondary' }}>
                              {(campaign.unique_clicks || 0).toLocaleString()} unique
                            </Typography>
                          </TableCell>
                          <TableCell>
                            <strong>{formatCurrency(campaign.revenue || 0)}</strong><br />
                            <Typography variant="caption" sx={{ color: 'text.secondary' }}>
                              {formatCurrency(campaign.revenue_per_email || 0)}/email
                            </Typography>
                          </TableCell>
                          <TableCell>
                            {campaign.sent_at
                              ? new Date(campaign.sent_at).toLocaleDateString()
                              : campaign.created_at
                              ? new Date(campaign.created_at).toLocaleDateString()
                              : '-'}
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </TableContainer>
                {klaviyoData.campaigns.length > 50 && (
                  <Typography variant="caption" sx={{ mt: 1, display: 'block', color: 'text.secondary' }}>
                    Showing first 50 of {klaviyoData.campaigns.length} campaigns. Click any row for details.
                  </Typography>
                )}
              </Box>
            )}

            {/* Customer Data Table */}
            {klaviyoData.customers && klaviyoData.customers.length > 0 && (
              <Box sx={{ mt: 4 }}>
                <Typography variant="h6" sx={{ mb: 2, fontWeight: 600 }}>
                  Klaviyo-Acquired Customers ({klaviyoData.customers.length})
                </Typography>
                <TableContainer component={Paper}>
                  <Table>
                    <TableHead>
                      <TableRow>
                        <TableCell><strong>Customer Name</strong></TableCell>
                        <TableCell><strong>Email</strong></TableCell>
                        <TableCell><strong>Location</strong></TableCell>
                        <TableCell><strong>Campaign</strong></TableCell>
                        <TableCell><strong>Acquisition Date</strong></TableCell>
                        <TableCell><strong>Initial Revenue</strong></TableCell>
                        <TableCell><strong>Total Revenue</strong></TableCell>
                      </TableRow>
                    </TableHead>
                    <TableBody>
                      {klaviyoData.customers.slice(0, 100).map((customer, idx) => (
                        <TableRow key={`klaviyo-customer-${customer.client_id || 'unknown'}-${customer.email || ''}-${idx}`}>
                          <TableCell>{customer.name || '-'}</TableCell>
                          <TableCell>{customer.email || '-'}</TableCell>
                          <TableCell>{customer.location || '-'}</TableCell>
                          <TableCell>{customer.campaign || '-'}</TableCell>
                          <TableCell>
                            {customer.acquisition_date
                              ? new Date(customer.acquisition_date).toLocaleDateString()
                              : '-'}
                          </TableCell>
                          <TableCell>{formatCurrency(customer.initial_revenue || 0)}</TableCell>
                          <TableCell>
                            <strong>{formatCurrency(customer.total_revenue || 0)}</strong>
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </TableContainer>
                {klaviyoData.customers.length > 100 && (
                  <Typography variant="caption" sx={{ mt: 1, display: 'block', color: 'text.secondary' }}>
                    Showing first 100 of {klaviyoData.customers.length} customers
                  </Typography>
                )}
              </Box>
            )}
            </>
          ) : (
            <Alert severity="info" sx={{ mb: 3 }}>
              Loading Klaviyo analytics...
            </Alert>
          )}
        </Box>
      )}
      {/* Backfill Dialog */}
      <Dialog
        open={backfillDialogOpen}
        onClose={() => setBackfillDialogOpen(false)}
        maxWidth="sm"
        fullWidth
        fullScreen={isXsDown}
        PaperProps={{
          sx: {
            m: { xs: 0, sm: 3 },
            borderRadius: { xs: 0, sm: 2 },
          },
        }}
      >
        <DialogTitle>
          Backfill Historical Klaviyo Data
        </DialogTitle>
        <DialogContent sx={{ px: { xs: 2, sm: 3 } }}>
          <Typography variant="body2" sx={{ mb: 3, color: 'text.secondary' }}>
            Pull historical metrics from Klaviyo for the selected date range. This process runs in the background and may take several minutes.
          </Typography>
          <TextField
            fullWidth
            label="Start Date"
            type="date"
            value={backfillStartDate}
            onChange={(e) => setBackfillStartDate(e.target.value)}
            InputLabelProps={{ shrink: true }}
            sx={{ mb: 2 }}
          />
          <TextField
            fullWidth
            label="End Date (optional, defaults to today)"
            type="date"
            value={backfillEndDate}
            onChange={(e) => setBackfillEndDate(e.target.value)}
            InputLabelProps={{ shrink: true }}
          />
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setBackfillDialogOpen(false)}>
            Cancel
          </Button>
          <Button
            onClick={handleKlaviyoBackfill}
            variant="contained"
            disabled={klaviyoSyncLoading || !backfillStartDate}
          >
            {klaviyoSyncLoading ? 'Starting...' : 'Start Backfill'}
          </Button>
        </DialogActions>
      </Dialog>

      {/* Metric Detail Dialog */}
      <Dialog
        open={metricDetailDialogOpen}
        onClose={() => setMetricDetailDialogOpen(false)}
        maxWidth="md"
        fullWidth
        fullScreen={isXsDown}
        PaperProps={{
          sx: {
            m: { xs: 0, sm: 3 },
            borderRadius: { xs: 0, sm: 2 },
            maxHeight: { xs: '100vh', sm: '90vh' }
          },
        }}
      >
        <DialogTitle>
          <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <Typography variant="h6">
              {metricDetailType === 'subscribers' && 'Total Subscribers Details'}
              {metricDetailType === 'emails_sent' && 'Emails Sent Details'}
              {metricDetailType === 'open_rate' && 'Open Rate Details'}
              {metricDetailType === 'click_rate' && 'Click Rate Details'}
              {metricDetailType === 'conversions' && 'Conversions Details'}
              {metricDetailType === 'revenue' && 'Revenue Generated Details'}
              {metricDetailType === 'revenue_per_email' && 'Revenue per Email Details'}
              {metricDetailType === 'unsubscribes' && 'Unsubscribes Details'}
            </Typography>
            <IconButton onClick={() => setMetricDetailDialogOpen(false)}>
              <XMarkIcon className="h-5 w-5" />
            </IconButton>
          </Box>
        </DialogTitle>
        <DialogContent dividers sx={detailScrollSx}>
          {klaviyoData && (
            <Box>
              {metricDetailType === 'subscribers' && (
                <>
                  <Typography variant="h6" sx={{ mb: 2 }}>Subscriber Breakdown</Typography>
                  <Grid container spacing={2} sx={{ mb: 3 }}>
                    <Grid item xs={12} sm={6}>
                      <Card>
                        <CardContent>
                          <Typography variant="body2" color="text.secondary">Total Subscribers</Typography>
                          <Typography variant="h4">{(klaviyoData.summary?.total_subscribers || 0).toLocaleString()}</Typography>
                        </CardContent>
                      </Card>
                    </Grid>
                    <Grid item xs={12} sm={6}>
                      <Card>
                        <CardContent>
                          <Typography variant="body2" color="text.secondary">Klaviyo-Acquired Clients</Typography>
                          <Typography variant="h4">{(klaviyoData.summary?.klaviyo_acquired_clients || 0).toLocaleString()}</Typography>
                        </CardContent>
                      </Card>
                    </Grid>
                  </Grid>
                  {klaviyoData.profiles && klaviyoData.profiles.length > 0 && (
                    <>
                      <Typography variant="h6" sx={{ mb: 2 }}>Recent Subscribers</Typography>
                      <TableContainer>
                        <Table size="small">
                          <TableHead>
                            <TableRow>
                              <TableCell><strong>Email</strong></TableCell>
                              <TableCell><strong>Name</strong></TableCell>
                              <TableCell><strong>Created</strong></TableCell>
                              <TableCell><strong>Subscribed</strong></TableCell>
                            </TableRow>
                          </TableHead>
                          <TableBody>
                            {klaviyoData.profiles.slice(0, 20).map((profile) => (
                              <TableRow key={profile.id}>
                                <TableCell>{profile.email || '-'}</TableCell>
                                <TableCell>{profile.first_name && profile.last_name ? `${profile.first_name} ${profile.last_name}` : '-'}</TableCell>
                                <TableCell>{profile.created ? new Date(profile.created).toLocaleDateString() : '-'}</TableCell>
                                <TableCell>
                                  <Chip label={profile.subscribed ? 'Yes' : 'No'} size="small" color={profile.subscribed ? 'success' : 'default'} />
                                </TableCell>
                              </TableRow>
                            ))}
                          </TableBody>
                        </Table>
                      </TableContainer>
                    </>
                  )}
                </>
              )}
              {metricDetailType === 'revenue' && (
                <>
                  <Typography variant="h6" sx={{ mb: 2 }}>Revenue Breakdown</Typography>
                  <Grid container spacing={2} sx={{ mb: 3 }}>
                    <Grid item xs={12} sm={4}>
                      <Card>
                        <CardContent>
                          <Typography variant="body2" color="text.secondary">Total Revenue</Typography>
                          <Typography variant="h4">{formatCurrency(klaviyoData.summary?.revenue || 0)}</Typography>
                        </CardContent>
                      </Card>
                    </Grid>
                    <Grid item xs={12} sm={4}>
                      <Card>
                        <CardContent>
                          <Typography variant="body2" color="text.secondary">From Clients</Typography>
                          <Typography variant="h4">{formatCurrency(klaviyoData.summary?.klaviyo_client_revenue || 0)}</Typography>
                          <Typography variant="caption">{(klaviyoData.summary?.klaviyo_acquired_clients || 0)} clients</Typography>
                        </CardContent>
                      </Card>
                    </Grid>
                    <Grid item xs={12} sm={4}>
                      <Card>
                        <CardContent>
                          <Typography variant="body2" color="text.secondary">Revenue per Email</Typography>
                          <Typography variant="h4">{formatCurrency(klaviyoData.summary?.revenue_per_email || 0)}</Typography>
                        </CardContent>
                      </Card>
                    </Grid>
                  </Grid>
                  {klaviyoData.campaigns && klaviyoData.campaigns.filter(c => c.revenue > 0).length > 0 && (
                    <>
                      <Typography variant="h6" sx={{ mb: 2 }}>Top Revenue-Generating Campaigns</Typography>
                      <TableContainer>
                        <Table size="small">
                          <TableHead>
                            <TableRow>
                              <TableCell><strong>Campaign</strong></TableCell>
                              <TableCell><strong>Revenue</strong></TableCell>
                              <TableCell><strong>Emails Sent</strong></TableCell>
                              <TableCell><strong>Revenue/Email</strong></TableCell>
                            </TableRow>
                          </TableHead>
                          <TableBody>
                            {klaviyoData.campaigns
                              .filter(c => c.revenue > 0)
                              .sort((a, b) => b.revenue - a.revenue)
                              .slice(0, 10)
                              .map((campaign) => (
                                <TableRow key={campaign.id}>
                                  <TableCell>{campaign.name || 'Untitled'}</TableCell>
                                  <TableCell><strong>{formatCurrency(campaign.revenue || 0)}</strong></TableCell>
                                  <TableCell>{(campaign.emails_sent || 0).toLocaleString()}</TableCell>
                                  <TableCell>{formatCurrency(campaign.revenue_per_email || 0)}</TableCell>
                                </TableRow>
                              ))}
                          </TableBody>
                        </Table>
                      </TableContainer>
                    </>
                  )}
                </>
              )}
              {metricDetailType === 'emails_sent' && (
                <>
                  <Typography variant="h6" sx={{ mb: 2 }}>Email Sending Breakdown</Typography>
                  <Grid container spacing={2} sx={{ mb: 3 }}>
                    <Grid item xs={12} sm={4}>
                      <Card>
                        <CardContent>
                          <Typography variant="body2" color="text.secondary">Total Emails Sent</Typography>
                          <Typography variant="h4">{(klaviyoData.summary?.emails_sent || 0).toLocaleString()}</Typography>
                        </CardContent>
                      </Card>
                    </Grid>
                    <Grid item xs={12} sm={4}>
                      <Card>
                        <CardContent>
                          <Typography variant="body2" color="text.secondary">From Campaigns</Typography>
                          <Typography variant="h4">{(klaviyoData.summary?.campaign_emails_sent || 0).toLocaleString()}</Typography>
                        </CardContent>
                      </Card>
                    </Grid>
                    <Grid item xs={12} sm={4}>
                      <Card>
                        <CardContent>
                          <Typography variant="body2" color="text.secondary">From Flows</Typography>
                          <Typography variant="h4">{(klaviyoData.summary?.flow_emails_sent || 0).toLocaleString()}</Typography>
                        </CardContent>
                      </Card>
                    </Grid>
                  </Grid>
                </>
              )}
              {['open_rate', 'click_rate', 'conversions', 'revenue_per_email', 'unsubscribes'].includes(metricDetailType) && (
                <Box>
                  <Typography variant="body1" sx={{ mb: 2 }}>
                    Detailed breakdown and insights for this metric will be displayed here.
                  </Typography>
                  <Typography variant="body2" color="text.secondary">
                    Summary: {JSON.stringify(klaviyoData.summary, null, 2)}
                  </Typography>
                </Box>
              )}
            </Box>
          )}
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setMetricDetailDialogOpen(false)}>Close</Button>
        </DialogActions>
      </Dialog>

      {/* Campaign Detail Dialog */}
      <Dialog
        open={campaignDetailDialogOpen}
        onClose={() => setCampaignDetailDialogOpen(false)}
        maxWidth="lg"
        fullWidth
        fullScreen={isMdDown}
        PaperProps={{
          sx: {
            m: { xs: 0, sm: 3 },
            borderRadius: { xs: 0, sm: 2 },
            maxHeight: { xs: '100vh', sm: '90vh' }
          },
        }}
      >
        <DialogTitle>
          <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <Typography variant="h6">
              {selectedCampaign?.name || 'Campaign Details'}
            </Typography>
            <IconButton onClick={() => setCampaignDetailDialogOpen(false)}>
              <XMarkIcon className="h-5 w-5" />
            </IconButton>
          </Box>
        </DialogTitle>
        <DialogContent dividers sx={detailScrollSx}>
          {selectedCampaign && (
            <Box>
              <Grid container spacing={3} sx={{ mb: 3 }}>
                <Grid item xs={12} sm={6} md={3}>
                  <Card>
                    <CardContent>
                      <Typography variant="body2" color="text.secondary">Emails Sent</Typography>
                      <Typography variant="h5">{(selectedCampaign.emails_sent || 0).toLocaleString()}</Typography>
                    </CardContent>
                  </Card>
                </Grid>
                <Grid item xs={12} sm={6} md={3}>
                  <Card>
                    <CardContent>
                      <Typography variant="body2" color="text.secondary">Open Rate</Typography>
                      <Typography variant="h5">{formatPercent(selectedCampaign.open_rate || 0)}</Typography>
                      <Typography variant="caption">{(selectedCampaign.unique_opens || 0).toLocaleString()} unique</Typography>
                    </CardContent>
                  </Card>
                </Grid>
                <Grid item xs={12} sm={6} md={3}>
                  <Card>
                    <CardContent>
                      <Typography variant="body2" color="text.secondary">Click Rate</Typography>
                      <Typography variant="h5">{formatPercent(selectedCampaign.click_rate || 0)}</Typography>
                      <Typography variant="caption">{(selectedCampaign.unique_clicks || 0).toLocaleString()} unique</Typography>
                    </CardContent>
                  </Card>
                </Grid>
                <Grid item xs={12} sm={6} md={3}>
                  <Card>
                    <CardContent>
                      <Typography variant="body2" color="text.secondary">Revenue</Typography>
                      <Typography variant="h5">{formatCurrency(selectedCampaign.revenue || 0)}</Typography>
                      <Typography variant="caption">{formatCurrency(selectedCampaign.revenue_per_email || 0)}/email</Typography>
                    </CardContent>
                  </Card>
                </Grid>
              </Grid>
              
              <Typography variant="h6" sx={{ mb: 2 }}>Campaign Information</Typography>
              <TableContainer>
                <Table size="small">
                  <TableBody>
                    <TableRow>
                      <TableCell><strong>Subject</strong></TableCell>
                      <TableCell>{selectedCampaign.subject || '-'}</TableCell>
                    </TableRow>
                    <TableRow>
                      <TableCell><strong>Status</strong></TableCell>
                      <TableCell>
                        <Chip
                          label={selectedCampaign.status || 'unknown'}
                          size="small"
                          color={
                            selectedCampaign.status === 'sent' ? 'success' :
                            selectedCampaign.status === 'scheduled' ? 'info' :
                            selectedCampaign.status === 'draft' ? 'default' : 'warning'
                          }
                        />
                      </TableCell>
                    </TableRow>
                    <TableRow>
                      <TableCell><strong>From</strong></TableCell>
                      <TableCell>{selectedCampaign.from_name || selectedCampaign.from_email || '-'}</TableCell>
                    </TableRow>
                    <TableRow>
                      <TableCell><strong>Sent Date</strong></TableCell>
                      <TableCell>
                        {selectedCampaign.sent_at
                          ? new Date(selectedCampaign.sent_at).toLocaleString()
                          : selectedCampaign.created_at
                          ? new Date(selectedCampaign.created_at).toLocaleString()
                          : '-'}
                      </TableCell>
                    </TableRow>
                    <TableRow>
                      <TableCell><strong>Message Type</strong></TableCell>
                      <TableCell>{selectedCampaign.message_type || '-'}</TableCell>
                    </TableRow>
                    {(selectedCampaign.utm_campaign || selectedCampaign.utm_source) && (
                      <>
                        <TableRow>
                          <TableCell><strong>UTM Parameters</strong></TableCell>
                          <TableCell>
                            <Box>
                              {selectedCampaign.utm_campaign && (
                                <Typography variant="body2"><strong>Campaign:</strong> {selectedCampaign.utm_campaign}</Typography>
                              )}
                              {selectedCampaign.utm_source && (
                                <Typography variant="body2"><strong>Source:</strong> {selectedCampaign.utm_source}</Typography>
                              )}
                              {selectedCampaign.utm_medium && (
                                <Typography variant="body2"><strong>Medium:</strong> {selectedCampaign.utm_medium}</Typography>
                              )}
                              {selectedCampaign.utm_content && (
                                <Typography variant="body2"><strong>Content:</strong> {selectedCampaign.utm_content}</Typography>
                              )}
                              {selectedCampaign.utm_term && (
                                <Typography variant="body2"><strong>Term:</strong> {selectedCampaign.utm_term}</Typography>
                              )}
                            </Box>
                          </TableCell>
                        </TableRow>
                      </>
                    )}
                    <TableRow>
                      <TableCell><strong>Conversions</strong></TableCell>
                      <TableCell>{(selectedCampaign.conversions || 0).toLocaleString()} ({formatPercent(selectedCampaign.conversion_rate || 0)})</TableCell>
                    </TableRow>
                    <TableRow>
                      <TableCell><strong>Bounces</strong></TableCell>
                      <TableCell>{(selectedCampaign.bounces || 0).toLocaleString()}</TableCell>
                    </TableRow>
                    <TableRow>
                      <TableCell><strong>Unsubscribes</strong></TableCell>
                      <TableCell>{(selectedCampaign.unsubscribes || 0).toLocaleString()}</TableCell>
                    </TableRow>
                  </TableBody>
                </Table>
              </TableContainer>
            </Box>
          )}
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setCampaignDetailDialogOpen(false)}>Close</Button>
        </DialogActions>
      </Dialog>

      {/* Submission Details Modal */}
      <Dialog 
        open={modalOpen} 
        onClose={handleCloseModal}
        maxWidth="lg"
        fullWidth
        fullScreen={isMdDown}
        disableScrollLock={true}
        PaperProps={{
          sx: {
            maxHeight: { xs: '100vh', md: '90vh' },
            width: { xs: '100%', md: '90%' },
            m: { xs: 0, md: 3 },
            borderRadius: { xs: 0, md: 2 },
            display: 'flex',
            flexDirection: 'column'
          }
        }}
      >
        <DialogTitle>
          <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
              {modalDetailView && (
                <IconButton
                  onClick={handleBackToList}
                  sx={{ mr: 1 }}
                  aria-label="back to list"
                >
                  <ArrowLeftIcon className="h-5 w-5" />
                </IconButton>
              )}
              <Typography variant="h6" component="div">
                {modalDetailView ? (
                  `Submission #${modalDetailData?.id || ''}`
                ) : (
                  <>
                    {modalData?.cardType === 'form_views' && 'Form Views Details'}
                    {modalData?.cardType === 'form_starts' && 'Leads Details'}
                    {modalData?.cardType === 'form_completions' && 'Registrations Details'}
                    {modalData?.cardType === 'revenue' && 'Revenue Details'}
                    {modalData?.cardType === 'facebook_form_views' && 'Meta Form Views Details'}
                    {modalData?.cardType === 'facebook_form_starts' && 'Meta Leads Details'}
                    {modalData?.cardType === 'facebook_form_completions' && 'Meta Registrations Details'}
                    {modalData?.cardType === 'facebook_revenue' && 'Meta Revenue Details'}
                    {modalData?.cardType === 'ad_impressions' && 'Ad Impressions Details'}
                    {modalData?.cardType === 'ad_clicks' && 'Ad Clicks Details'}
                    {modalData?.cardType === 'ad_spend' && 'Ad Spend Details'}
                    {modalData?.cardType === 'roas' && 'ROAS (Return on Ad Spend) Details'}
                    {modalData?.cardType === 'cpl' && 'Cost Per Lead (CPL) Details'}
                    {modalData?.cardType === 'cpr' && 'Cost Per Registration (CPR) Details'}
                    {/* Google card types */}
                    {modalData?.cardType === 'google_form_views' && 'Google Form Views Details'}
                    {modalData?.cardType === 'google_form_starts' && 'Google Leads Details'}
                    {modalData?.cardType === 'google_form_completions' && 'Google Registrations Details'}
                    {modalData?.cardType === 'google_revenue' && 'Google Revenue Details'}
                    {modalData?.cardType === 'google_impressions' && 'Google Ad Impressions Details'}
                    {modalData?.cardType === 'google_clicks' && 'Google Ad Clicks Details'}
                    {modalData?.cardType === 'google_spend' && 'Google Ad Spend Details'}
                    {modalData?.cardType === 'google_roas' && 'Google ROAS (Return on Ad Spend) Details'}
                    {modalData?.cardType === 'google_cpl' && 'Google Cost Per Lead (CPL) Details'}
                    {modalData?.cardType === 'google_cpr' && 'Google Cost Per Registration (CPR) Details'}
                    {modalData?.cardType === 'google_ltv_roas' && 'Google LTV ROAS Details'}
                    {modalData?.cardType === 'google_conversions' && 'Google Conversions Details'}
                  </>
                )}
              </Typography>
            </Box>
            <IconButton
              aria-label="close"
              onClick={handleCloseModal}
              sx={{
                color: (theme) => theme.palette.grey[500],
              }}
            >
              <XMarkIcon className="h-5 w-5" />
            </IconButton>
          </Box>
        </DialogTitle>
        <DialogContent dividers sx={{ px: { xs: 2, sm: 3 }, overflowY: 'auto' }}>
          {modalDetailView ? (
            // Submission Detail View
            modalDetailLoading ? (
              <Box display="flex" justifyContent="center" alignItems="center" minHeight="200px">
                <CircularProgress />
              </Box>
            ) : modalDetailData && modalDetailData.conversion && modalDetailData.matchingSubmissions ? (
              // Google Conversion Detail View
              <Box sx={{ ...detailScrollSx, pr: { xs: 0, sm: 1 } }}>
                {/* Conversion Info */}
                <Paper sx={{ p: 2, mb: 2 }}>
                  <Typography variant="h6" gutterBottom>Google Conversion Details</Typography>
                  <Grid container spacing={2}>
                    <Grid item xs={6}>
                      <Typography variant="body2" color="text.secondary">Date:</Typography>
                      <Typography variant="body2">{formatDate(modalDetailData.conversion.date)}</Typography>
                    </Grid>
                    <Grid item xs={6}>
                      <Typography variant="body2" color="text.secondary">Campaign:</Typography>
                      <Typography variant="body2">{modalDetailData.conversion.campaignName || modalDetailData.conversion.utmCampaign || '—'}</Typography>
                    </Grid>
                    <Grid item xs={6}>
                      <Typography variant="body2" color="text.secondary">Conversions:</Typography>
                      <Typography variant="body2" sx={{ fontWeight: 600 }}>{modalDetailData.conversion.conversions || 0}</Typography>
                    </Grid>
                    <Grid item xs={6}>
                      <Typography variant="body2" color="text.secondary">Clicks:</Typography>
                      <Typography variant="body2">{(modalDetailData.conversion.clicks || 0).toLocaleString()}</Typography>
                    </Grid>
                    <Grid item xs={6}>
                      <Typography variant="body2" color="text.secondary">Spend:</Typography>
                      <Typography variant="body2">{formatCurrency(modalDetailData.conversion.spend || 0)}</Typography>
                    </Grid>
                    <Grid item xs={6}>
                      <Typography variant="body2" color="text.secondary">Matching Customers:</Typography>
                      <Typography variant="body2" sx={{ fontWeight: 600, color: 'success.main' }}>
                        {modalDetailData.matchingSubmissions.length}
                      </Typography>
                    </Grid>
                  </Grid>
                </Paper>
                
                {/* Matching Customer Submissions */}
                <Paper sx={{ p: 2 }}>
                  <Typography variant="h6" gutterBottom>
                    Matching Customer Submissions ({modalDetailData.matchingSubmissions.length})
                  </Typography>
                  <Typography variant="body2" color="text.secondary" sx={{ mb: 2 }}>
                    These booking form submissions match this Google conversion by campaign and date. Click on a submission ID to see full details.
                  </Typography>
                  <TableContainer>
                    <Table size="small">
                      <TableHead>
                        <TableRow>
                          <TableCell>ID</TableCell>
                          <TableCell>Parent Name</TableCell>
                          <TableCell>Email</TableCell>
                          <TableCell>Phone</TableCell>
                          <TableCell>Booking Type</TableCell>
                          <TableCell align="right">Price</TableCell>
                          <TableCell>Payment Status</TableCell>
                          <TableCell>TutorCruncher Client ID</TableCell>
                        </TableRow>
                      </TableHead>
                      <TableBody>
                        {modalDetailData.matchingSubmissions.map((submission, idx) => (
                          <TableRow key={idx} hover>
                            <TableCell>
                              <Link
                                component="button"
                                variant="body2"
                                onClick={() => handleSubmissionIdClick(submission.id)}
                                sx={{
                                  cursor: 'pointer',
                                  color: 'primary.main',
                                  textDecoration: 'underline',
                                  '&:hover': {
                                    color: 'primary.dark',
                                  },
                                }}
                              >
                                {submission.id}
                              </Link>
                            </TableCell>
                            <TableCell>{submission.parentName || '—'}</TableCell>
                            <TableCell>{submission.parentEmail || '—'}</TableCell>
                            <TableCell>{submission.parentPhone || '—'}</TableCell>
                            <TableCell>{submission.bookingType || '—'}</TableCell>
                            <TableCell align="right">{formatCurrency(submission.price || 0)}</TableCell>
                            <TableCell>
                              <Chip
                                label={(submission.paymentStatus || 'unknown').toUpperCase()}
                                size="small"
                                color={
                                  submission.paymentStatus === 'paid' ? 'success' :
                                  submission.paymentStatus === 'verified' ? 'info' :
                                  'default'
                                }
                              />
                            </TableCell>
                            <TableCell>
                              {submission.tcClientId ? (
                                <Link href={`https://account.acmeops.com/clients/${submission.tcClientId}/`} target="_blank">
                                  {submission.tcClientId}
                                </Link>
                              ) : (
                                '—'
                              )}
                            </TableCell>
                          </TableRow>
                        ))}
                      </TableBody>
                    </Table>
                  </TableContainer>
                </Paper>
              </Box>
            ) : modalDetailData ? (
              <Box sx={{ ...detailScrollSx, pr: { xs: 0, sm: 1 } }}>
                {/* Parent Info */}
                <Paper sx={{ p: 2, mb: 2 }}>
                  <Typography variant="h6" gutterBottom>Parent Info</Typography>
                  <Grid container spacing={2}>
                    <Grid item xs={6}>
                      <Typography variant="body2" color="text.secondary">TutorCruncher ID:</Typography>
                      {modalDetailData.tcClientId ? (
                        <Link href={`https://account.acmeops.com/clients/${modalDetailData.tcClientId}/`} target="_blank">
                          {modalDetailData.tcClientId}
                        </Link>
                      ) : (
                        <Typography variant="body2">—</Typography>
                      )}
                    </Grid>
                    <Grid item xs={6}>
                      <Typography variant="body2" color="text.secondary">Name:</Typography>
                      <Typography variant="body2">{modalDetailData.parentFirst} {modalDetailData.parentLast}</Typography>
                    </Grid>
                    <Grid item xs={6}>
                      <Typography variant="body2" color="text.secondary">Email:</Typography>
                      <Typography variant="body2">{modalDetailData.parentEmail}</Typography>
                    </Grid>
                    <Grid item xs={6}>
                      <Typography variant="body2" color="text.secondary">Phone:</Typography>
                      <Typography variant="body2">{modalDetailData.parentPhone || '—'}</Typography>
                    </Grid>
                  </Grid>
                </Paper>

                {/* Booking & Pricing */}
                <Paper sx={{ p: 2, mb: 2 }}>
                  <Typography variant="h6" gutterBottom>Booking & Pricing</Typography>
                  <Grid container spacing={2}>
                    <Grid item xs={6}>
                      <Typography variant="body2" color="text.secondary">Payment Status:</Typography>
                      <Chip
                        label={(modalDetailData.paymentStatus || modalDetailData.payment_status || 'unknown').toUpperCase()}
                        size="small"
                        color={
                          (modalDetailData.paymentStatus || modalDetailData.payment_status) === 'paid' ? 'success' :
                          (modalDetailData.paymentStatus || modalDetailData.payment_status) === 'verified' ? 'info' :
                          (modalDetailData.paymentStatus || modalDetailData.payment_status) === 'pending' ? 'warning' :
                          'default'
                        }
                      />
                    </Grid>
                    <Grid item xs={6}>
                      <Typography variant="body2" color="text.secondary">Booking Type:</Typography>
                      <Typography variant="body2">{modalDetailData.bookingType || '—'}</Typography>
                    </Grid>
                    <Grid item xs={6}>
                      <Typography variant="body2" color="text.secondary">Price:</Typography>
                      <Typography variant="body2">${modalDetailData.actualPrice || 0}</Typography>
                    </Grid>
                    <Grid item xs={6}>
                      <Typography variant="body2" color="text.secondary">Trial:</Typography>
                      <Typography variant="body2">{modalDetailData.is_trial ? 'Yes' : 'No'}</Typography>
                    </Grid>
                  </Grid>
                </Paper>

                {/* TutorCruncher Info */}
                {modalDetailData.tcServiceId && (
                  <Paper sx={{ p: 2, mb: 2 }}>
                    <Typography variant="h6" gutterBottom>TutorCruncher Info</Typography>
                    <Grid container spacing={2}>
                      <Grid item xs={6}>
                        <Typography variant="body2" color="text.secondary">Job ID:</Typography>
                        <Link href={`https://account.acmeops.com/cal/service/${modalDetailData.tcServiceId}/`} target="_blank">
                          {modalDetailData.tcServiceId}
                        </Link>
                      </Grid>
                      <Grid item xs={6}>
                        <Typography variant="body2" color="text.secondary">Label:</Typography>
                        <Typography variant="body2">{modalDetailData.labelName || '—'}</Typography>
                      </Grid>
                      <Grid item xs={12}>
                        <Typography variant="body2" color="text.secondary">Job Name:</Typography>
                        <Typography variant="body2">
                          {[modalDetailData.parentFirst, modalDetailData.parentLast, 'Chess', modalDetailData.lessonType || 'Home', `${ratioMap[modalDetailData.studentType] || ''} (${(modalDetailData.students || []).map(s => s.first).join(', ')})`].join(' – ')}
                        </Typography>
                      </Grid>
                      {modalDetailData.address && (
                        <Grid item xs={12}>
                          <Typography variant="body2" color="text.secondary">Address:</Typography>
                          <Typography variant="body2">
                            {[modalDetailData.address.street, modalDetailData.address.city, modalDetailData.address.state, modalDetailData.address.zip, modalDetailData.address.country].filter(Boolean).join(', ')}
                          </Typography>
                        </Grid>
                      )}
                    </Grid>
                  </Paper>
                )}
                {/* Lesson Details */}
                {modalDetailData.bookingType && (
                  <Paper sx={{ p: 2, mb: 2 }}>
                    <Typography variant="h6" gutterBottom>
                      {modalDetailData.bookingType} – Lesson Details – Chess
                      {modalDetailData.is_trial && <Chip label="TRIAL" size="small" color="warning" sx={{ ml: 1 }} />}
                    </Typography>
                    <Grid container spacing={2}>
                      <Grid item xs={6}>
                        <Typography variant="body2" color="text.secondary">Duration:</Typography>
                        <Typography variant="body2">45–60 Minutes</Typography>
                      </Grid>
                      <Grid item xs={6}>
                        <Typography variant="body2" color="text.secondary">Lesson Type:</Typography>
                        <Typography variant="body2">Private {ratioMap[modalDetailData.studentType] || ''}</Typography>
                      </Grid>
                      <Grid item xs={6}>
                        <Typography variant="body2" color="text.secondary">Parent:</Typography>
                        <Typography variant="body2">{modalDetailData.parentFirst} {modalDetailData.parentLast}</Typography>
                      </Grid>
                      <Grid item xs={6}>
                        <Typography variant="body2" color="text.secondary">Timezone:</Typography>
                        <Typography variant="body2">{modalDetailData.timezone || '—'}</Typography>
                      </Grid>
                      {modalDetailData.slots && modalDetailData.slots[0]?.date && (
                        <Grid item xs={6}>
                          <Typography variant="body2" color="text.secondary">Start Date:</Typography>
                          <Typography variant="body2">{fmtShortDate(modalDetailData.slots[0].date)}</Typography>
                        </Grid>
                      )}
                      <Grid item xs={6}>
                        <Typography variant="body2" color="text.secondary">Lesson Dates:</Typography>
                        <Typography variant="body2">Weekly Ongoing Post Trial</Typography>
                      </Grid>
                      {modalDetailData.slots && modalDetailData.slots.length > 0 && (
                        <Grid item xs={12}>
                          <Typography variant="body2" color="text.secondary" gutterBottom>Day & Time (Pick One):</Typography>
                          <Box sx={{ display: 'flex', flexWrap: 'wrap', gap: 1 }}>
                            {modalDetailData.slots.filter(s => s.start && s.end).map((slot, i) => (
                              <Chip
                                key={i}
                                label={`Option ${i + 1}: ${slot.dayOfWeek} ${slot.start} – ${slot.end}`}
                                variant="outlined"
                                size="small"
                              />
                            ))}
                          </Box>
                        </Grid>
                      )}
                    </Grid>
                  </Paper>
                )}

                {/* Students */}
                {modalDetailData.students && modalDetailData.students.length > 0 && (
                  <Paper sx={{ p: 2, mb: 2 }}>
                    <Typography variant="h6" gutterBottom>Students ({modalDetailData.studentType})</Typography>
                    <Grid container spacing={2}>
                      {modalDetailData.students.map((student, i) => (
                        <Grid item xs={12} sm={6} key={i}>
                          <Paper variant="outlined" sx={{ p: 1.5 }}>
                            <Typography variant="subtitle2">{student.first} {student.last}</Typography>
                            <Typography variant="body2" color="text.secondary">
                              {student.school || 'No school provided'}
                              <br />
                              Level: {student.experience}
                              <br />
                              DOB: {student.dob}
                              {student.dob && ` (Age: ${getAge(student.dob)})`}
                            </Typography>
                            {student.notes && (
                              <Typography variant="body2" sx={{ mt: 1 }}>
                                <strong>Notes:</strong> {student.notes}
                              </Typography>
                            )}
                          </Paper>
                        </Grid>
                      ))}
                    </Grid>
                  </Paper>
                )}
                {/* Attribution */}
                <Paper sx={{ p: 2 }}>
                  <Typography variant="h6" gutterBottom>Attribution</Typography>
                  <Grid container spacing={2}>
                    <Grid item xs={12}>
                      <Typography variant="body2" color="text.secondary" gutterBottom>UTM Parameters:</Typography>
                      {(() => {
                        const utm = getUtmFromDetail(modalDetailData);
                        const entries = Object.entries(utm).filter(([_, v]) => v != null && String(v).trim() !== "");
                        return entries.length ? (
                          <Box sx={{ display: 'flex', flexWrap: 'wrap', gap: 1 }}>
                            {entries.map(([k, v]) => (
                              <Chip
                                key={k}
                                size="small"
                                variant="outlined"
                                label={`${utmKeyLabel(k)}: ${v}`}
                              />
                            ))}
                          </Box>
                        ) : (
                          <Typography variant="body2">—</Typography>
                        );
                      })()}
                    </Grid>
                    <Grid item xs={12}>
                      <Typography variant="body2" color="text.secondary" gutterBottom>Landing Page URL:</Typography>
                      {getLandingUrl(modalDetailData) ? (
                        <Link href={getLandingUrl(modalDetailData)} target="_blank" rel="noopener noreferrer">
                          {truncate(getLandingUrl(modalDetailData))}
                        </Link>
                      ) : (
                        <Typography variant="body2">—</Typography>
                      )}
                    </Grid>
                  </Grid>
                </Paper>
                {/* Address & Agreements */}
                <Paper sx={{ p: 2, mb: 2 }}>
                  <Typography variant="h6" gutterBottom>Address & Agreements</Typography>
                  <Grid container spacing={2}>
                    <Grid item xs={6}>
                      <Typography variant="body2" color="text.secondary">How did you hear about us?</Typography>
                      <Typography variant="body2">{modalDetailData.heardAbout || '—'}</Typography>
                    </Grid>
                    {modalDetailData.address && (
                      <Grid item xs={6}>
                        <Typography variant="body2" color="text.secondary">Address</Typography>
                        <Typography variant="body2">
                          {[modalDetailData.address.street, modalDetailData.address.city, modalDetailData.address.state, modalDetailData.address.zip, modalDetailData.address.country].filter(Boolean).join(', ')}
                        </Typography>
                      </Grid>
                    )}
                    <Grid item xs={12}>
                      <Typography variant="body2" color="text.secondary" gutterBottom>Agreements:</Typography>
                      <Box sx={{ display: 'flex', flexWrap: 'wrap', gap: 1 }}>
                        {modalDetailData.agreeCancel && (
                          <Chip label="Cancellation Policy" size="small" sx={{ bgcolor: 'success.light', color: 'success.dark' }} />
                        )}
                        {modalDetailData.agreeService && (
                          <Chip label="Service Agreement" size="small" sx={{ bgcolor: 'info.light', color: 'info.dark' }} />
                        )}
                        {modalDetailData.agreePhoto && (
                          <Chip label="Photo Release" size="small" sx={{ bgcolor: 'secondary.light', color: 'secondary.dark' }} />
                        )}
                        {!modalDetailData.agreeCancel && !modalDetailData.agreeService && !modalDetailData.agreePhoto && (
                          <Typography variant="body2" color="text.secondary">—</Typography>
                        )}
                      </Box>
                    </Grid>
                    {modalDetailData.signature && (
                      <Grid item xs={12}>
                        <Typography variant="body2" color="text.secondary" gutterBottom>Signature:</Typography>
                        <Box
                          component="img"
                          src={modalDetailData.signature}
                          alt="Signature"
                          sx={{
                            width: '100%',
                            maxWidth: 400,
                            height: 'auto',
                            border: '1px solid',
                            borderColor: 'divider',
                            borderRadius: 1,
                          }}
                        />
                      </Grid>
                    )}
                  </Grid>
                </Paper>
              </Box>
            ) : (
              <Alert severity="error">Failed to load submission details</Alert>
            )
          ) : modalLoading ? (
            <Box display="flex" justifyContent="center" alignItems="center" minHeight="200px">
              <CircularProgress />
            </Box>
          ) : error && error.includes("submission details") ? (
            <Alert severity="error">{error}</Alert>
          ) : (
            <>
              {modalAnalytics && modalData?.cardType !== 'roas' && renderAnalyticsContent(modalAnalytics)}
              {(modalData?.cardType === 'ad_spend' || modalData?.cardType === 'adSpend') && modalSubmissions.length > 0 && renderLocationBreakdown(modalSubmissions)}
              {modalData?.cardType === 'facebook_form_completions' && modalSubmissions.length > 0 && renderBookingTypeBreakdown(modalSubmissions)}
              {modalSubmissions.length === 0 ? (
            <Alert severity="info">No submissions found for the selected criteria.</Alert>
          ) : modalData?.cardType === 'google_conversions' ? (
            <>
              {/* Google Conversions Summary */}
              {modalSubmissions.length > 0 && modalSubmissions[0].totalConversions !== undefined && (
                <Box sx={{ mb: 3, p: 2, bgcolor: 'background.paper', borderRadius: 1, border: '1px solid', borderColor: 'divider' }}>
                  <Typography variant="h6" gutterBottom sx={{ fontWeight: 600 }}>
                    Google Conversions Summary
                  </Typography>
                  <Grid container spacing={2}>
                    <Grid item xs={6} sm={3}>
                      <Typography variant="body2" color="text.secondary">Total Conversions</Typography>
                      <Typography variant="h6">{modalSubmissions[0].totalConversions || 0}</Typography>
                    </Grid>
                    <Grid item xs={6} sm={3}>
                      <Typography variant="body2" color="text.secondary">Matching Submissions</Typography>
                      <Typography variant="h6" sx={{ color: 'success.main' }}>
                        {modalSubmissions[0].totalMatchingSubmissions || 0}
                      </Typography>
                    </Grid>
                    <Grid item xs={12}>
                      <Typography variant="caption" color="text.secondary">
                        Conversions are matched to booking form submissions by campaign and date. Click on a conversion to see matching customer details.
                      </Typography>
                    </Grid>
                  </Grid>
                </Box>
              )}
              
              {/* Conversions Table */}
              <TableContainer sx={{ maxHeight: '60vh', overflowX: 'auto' }}>
                <Table stickyHeader size="small" sx={{ minWidth: { xs: '600px', sm: 'auto' } }}>
                  <TableHead>
                    <TableRow>
                      <TableCell>Date</TableCell>
                      <TableCell>Campaign Name</TableCell>
                      <TableCell>UTM Campaign</TableCell>
                      <TableCell align="right">Conversions</TableCell>
                      <TableCell align="right">Clicks</TableCell>
                      <TableCell align="right">Spend</TableCell>
                      <TableCell align="right">Matching Customers</TableCell>
                    </TableRow>
                  </TableHead>
                  <TableBody>
                    {modalSubmissions.map((conversion, idx) => (
                      <TableRow key={idx} hover>
                        <TableCell>{formatDate(conversion.date)}</TableCell>
                        <TableCell sx={{ maxWidth: 200, overflow: 'hidden', textOverflow: 'ellipsis' }} title={conversion.campaignName}>
                          {conversion.campaignName || '—'}
                        </TableCell>
                        <TableCell>{conversion.utmCampaign || '—'}</TableCell>
                        <TableCell align="right" sx={{ fontWeight: 600 }}>
                          {conversion.conversions || 0}
                        </TableCell>
                        <TableCell align="right">{(conversion.clicks || 0).toLocaleString()}</TableCell>
                        <TableCell align="right">{formatCurrency(conversion.spend || 0)}</TableCell>
                        <TableCell align="right">
                          {conversion.matchingSubmissions && conversion.matchingSubmissions.length > 0 ? (
                            <Chip 
                              label={`${conversion.matchingSubmissions.length} customer(s)`}
                              size="small"
                              color="success"
                              onClick={() => {
                                // Show matching submissions in a nested view
                                setModalDetailView(true);
                                setModalDetailData({
                                  conversion: conversion,
                                  matchingSubmissions: conversion.matchingSubmissions
                                });
                              }}
                              sx={{ cursor: 'pointer' }}
                            />
                          ) : (
                            <Typography variant="body2" color="text.secondary">No matches</Typography>
                          )}
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </TableContainer>
            </>
          ) : modalData?.cardType === 'roas' && roasSummary ? (
            <>
              {/* Adjusted ROAS Calculation - Top Banner */}
              {(() => {
                const baseRoas = parseFloat(roasSummary.roas || 0);
                const conversionRate = parseFloat(
                  metaFullClientConversionData?.lastTwelveMonths?.conversion_rate || 
                  metaFullClientConversionData?.summary?.conversion_rate || 
                  0
                );
                const adjustedRoas = baseRoas * (conversionRate / 100);
                
                return (
                  <Box sx={{ mb: 3, p: 2.5, bgcolor: 'info.light', borderRadius: 1, border: '1px solid', borderColor: 'info.main' }}>
                    <Typography variant="h6" gutterBottom sx={{ fontWeight: 600, color: 'info.dark' }}>
                      Adjusted ROAS Calculation
                </Typography>
                <Typography variant="body2" color="text.secondary" sx={{ mb: 2 }}>
                      To get a true reflection of return on investment, we multiply the base ROAS by the Meta Full Client Conversion Rate. 
                      This accounts for the percentage of registrations that become fully converted clients (trial + first lesson paid).
                </Typography>
                    <Box sx={{ p: 2, bgcolor: 'background.paper', borderRadius: 1, mb: 2 }}>
                      <Grid container spacing={2} alignItems="center">
                        <Grid item xs={12} sm={4}>
                          <Typography variant="body2" color="text.secondary">Base ROAS</Typography>
                          <Typography variant="h6" sx={{ fontWeight: 700 }}>
                            {baseRoas.toFixed(2)}x
                    </Typography>
                  </Grid>
                        <Grid item xs={12} sm={1} sx={{ textAlign: 'center' }}>
                          <Typography variant="h5" sx={{ fontWeight: 700, color: 'text.secondary' }}>×</Typography>
                        </Grid>
                        <Grid item xs={12} sm={3}>
                          <Typography variant="body2" color="text.secondary">Meta Conversion Rate</Typography>
                          <Typography variant="h6" sx={{ fontWeight: 700 }}>
                            {conversionRate > 0 ? `${conversionRate.toFixed(1)}%` : '—'}
                    </Typography>
                  </Grid>
                        <Grid item xs={12} sm={1} sx={{ textAlign: 'center' }}>
                          <Typography variant="h5" sx={{ fontWeight: 700, color: 'text.secondary' }}>=</Typography>
                  </Grid>
                        <Grid item xs={12} sm={3}>
                          <Typography variant="body2" color="text.secondary" sx={{ fontWeight: 600 }}>Adjusted ROAS</Typography>
                          <Typography variant="h5" sx={{ fontWeight: 700, color: adjustedRoas >= 1 ? 'success.main' : 'warning.main' }}>
                            {conversionRate > 0 ? `${adjustedRoas.toFixed(2)}x` : '—'}
                          </Typography>
                  </Grid>
                </Grid>
              </Box>
                    {conversionRate === 0 && (
                      <Alert severity="info" sx={{ mt: 1 }}>
                        Meta Full Client Conversion Rate data is loading. The adjusted ROAS will be calculated once the conversion rate is available.
                      </Alert>
                    )}
                </Box>
                );
              })()}

              {/* Adjusted ROAS Trend Over Time */}
              {(() => {
                // Get monthly ROAS data from enterpriseTrendsData
                const monthlyRoasData = enterpriseTrendsData?.monthlyData || [];
                // Get monthly conversion rate data
                const monthlyConversionData = metaFullClientConversionData?.monthly || [];
                
                // Combine and calculate Adjusted ROAS for each month
                const adjustedRoasData = monthlyRoasData
                  .slice(-5) // Last 5 months
                  .map(month => {
                    // Find matching conversion rate for this month
                    const monthDate = DateTime.fromFormat(month.month, 'MMM yyyy', { zone: 'America/New_York' });
                    const conversionMonth = monthlyConversionData.find(c => {
                      if (!c.registration_month) return false;
                      const convDate = DateTime.fromISO(c.registration_month, { zone: 'America/New_York' });
                      return convDate.hasSame(monthDate, 'month');
                    });
                    
                    const baseRoas = parseFloat(month.roas || 0);
                    const conversionRate = parseFloat(conversionMonth?.conversion_rate || 
                      metaFullClientConversionData?.lastTwelveMonths?.conversion_rate || 
                      metaFullClientConversionData?.summary?.conversion_rate || 
                      0);
                    const adjustedRoas = baseRoas * (conversionRate / 100);
                    
                    return {
                      month: month.month,
                      baseRoas,
                      conversionRate,
                      adjustedRoas
                    };
                  })
                  .filter(m => m.month); // Filter out invalid months
                
                if (adjustedRoasData.length === 0) return null;
                
                return (
                  <>
                    {/* Line Chart */}
                    <Box sx={{ mb: 3, p: 2, bgcolor: 'background.paper', borderRadius: 1, border: '1px solid', borderColor: 'divider' }}>
                      <Typography variant="subtitle1" sx={{ mb: 2, fontWeight: 600 }}>
                        Adjusted ROAS Trend (Last {adjustedRoasData.length} Months)
                      </Typography>
                      <ResponsiveContainer width="100%" height={300}>
                        <LineChart data={adjustedRoasData} margin={{ top: 10, right: 20, left: 0, bottom: 0 }}>
                          <CartesianGrid strokeDasharray="3 3" stroke="#E5E7EB" />
                          <XAxis dataKey="month" tick={{ fontSize: 12 }} />
                          <YAxis
                            tick={{ fontSize: 12 }}
                            domain={[0, 'dataMax + 0.5']}
                            tickFormatter={(value) => `${value.toFixed(2)}x`}
                            label={{ value: 'Adjusted ROAS', angle: -90, position: 'insideLeft' }}
                          />
                          <Tooltip
                            cursor={{ strokeDasharray: '3 3' }}
                            formatter={(value, name) => {
                              if (name === 'adjustedRoas') {
                                return [`${parseFloat(value).toFixed(2)}x`, 'Adjusted ROAS'];
                              } else if (name === 'baseRoas') {
                                return [`${parseFloat(value).toFixed(2)}x`, 'Base ROAS'];
                              }
                              return [value, name];
                            }}
                            labelFormatter={(label) => `Month: ${label}`}
                          />
                          <Legend />
                          <Line
                            type="monotone"
                            dataKey="adjustedRoas"
                            stroke="#26a69a"
                            strokeWidth={3}
                            dot={{ r: 5, fill: '#26a69a' }}
                            activeDot={{ r: 7 }}
                            name="Adjusted ROAS"
                            connectNulls
                          />
                          <Line
                            type="monotone"
                            dataKey="baseRoas"
                            stroke="#6366F1"
                            strokeWidth={2}
                            strokeDasharray="5 5"
                            dot={{ r: 4, fill: '#6366F1' }}
                            activeDot={{ r: 6 }}
                            name="Base ROAS"
                            connectNulls
                          />
                        </LineChart>
                      </ResponsiveContainer>
                    </Box>

                    {/* Monthly Performance Table */}
                    <Box sx={{ mb: 3, p: 2, bgcolor: 'background.paper', borderRadius: 1, border: '1px solid', borderColor: 'divider' }}>
                      <Typography variant="subtitle1" sx={{ mb: 2, fontWeight: 600 }}>
                        Monthly Adjusted ROAS Performance
                      </Typography>
                      <TableContainer>
                        <Table size="small">
                          <TableHead>
                            <TableRow>
                              <TableCell>Month</TableCell>
                              <TableCell align="right">Base ROAS</TableCell>
                              <TableCell align="right">Conversion Rate</TableCell>
                              <TableCell align="right">Adjusted ROAS</TableCell>
                              <TableCell align="right">vs prior month</TableCell>
                            </TableRow>
                          </TableHead>
                          <TableBody>
                            {adjustedRoasData.map((month, idx) => {
                              const prevMonth = idx > 0 ? adjustedRoasData[idx - 1] : null;
                              const adjustedRoasChange = prevMonth ? (month.adjustedRoas - prevMonth.adjustedRoas) : null;
                              const adjustedRoasPercentChange = prevMonth && prevMonth.adjustedRoas > 0 
                                ? ((month.adjustedRoas - prevMonth.adjustedRoas) / prevMonth.adjustedRoas) * 100 
                                : null;
                              
                              return (
                                <TableRow key={month.month}>
                                  <TableCell>{month.month}</TableCell>
                                  <TableCell align="right" sx={{ fontWeight: 600 }}>
                                    {month.baseRoas.toFixed(2)}x
                                  </TableCell>
                                  <TableCell align="right">
                                    {month.conversionRate > 0 ? `${month.conversionRate.toFixed(1)}%` : '—'}
                                  </TableCell>
                                  <TableCell align="right" sx={{ fontWeight: 700, color: month.adjustedRoas >= 1 ? 'success.main' : 'warning.main' }}>
                                    {month.adjustedRoas.toFixed(2)}x
                                  </TableCell>
                                  <TableCell 
                                    align="right"
                                    sx={{ 
                                      color: adjustedRoasChange !== null && adjustedRoasChange >= 0 ? 'success.main' : adjustedRoasChange !== null ? 'error.main' : 'text.secondary',
                                      fontWeight: adjustedRoasChange !== null ? 600 : 400
                                    }}
                                  >
                                    {adjustedRoasPercentChange !== null ? (
                                      adjustedRoasPercentChange >= 0 ? `+${adjustedRoasPercentChange.toFixed(1)}%` : `${adjustedRoasPercentChange.toFixed(1)}%`
                                    ) : '—'}
                                  </TableCell>
                                </TableRow>
                              );
                            })}
                          </TableBody>
                        </Table>
                      </TableContainer>
                    </Box>
                  </>
                );
              })()}
              
              {/* Registrations Table */}
              <TableContainer sx={{ maxHeight: '60vh', overflowX: 'auto' }}>
                <Table stickyHeader size="small" sx={{ minWidth: { xs: '600px', sm: 'auto' } }}>
                  <TableHead>
                    <TableRow>
                      <TableCell>ID</TableCell>
                      <TableCell>Date</TableCell>
                      <TableCell>Parent Name</TableCell>
                      <TableCell>Email</TableCell>
                      <TableCell>Booking Type</TableCell>
                      <TableCell>Label</TableCell>
                      <TableCell align="right">Trial Price</TableCell>
                      <TableCell align="right">LTV</TableCell>
                    </TableRow>
                  </TableHead>
                  <TableBody>
                    {modalSubmissions.map((submission, idx) => (
                      <TableRow key={submission.id || idx} hover>
                        <TableCell>
                          <Link
                            component="button"
                            variant="body2"
                            onClick={() => handleSubmissionIdClick(submission.id)}
                            sx={{
                              cursor: 'pointer',
                              color: 'primary.main',
                              textDecoration: 'underline',
                              '&:hover': {
                                color: 'primary.dark',
                              },
                            }}
                          >
                            {submission.id}
                          </Link>
                        </TableCell>
                        <TableCell>{formatDate(submission.date)}</TableCell>
                        <TableCell>{submission.parentName || '—'}</TableCell>
                        <TableCell>{submission.email || '—'}</TableCell>
                        <TableCell>{submission.bookingType || '—'}</TableCell>
                        <TableCell>{submission.labelName || '—'}</TableCell>
                        <TableCell align="right">{formatCurrency(submission.amount || 0)}</TableCell>
                        <TableCell align="right" sx={{ fontWeight: 600, color: 'success.main' }}>
                          {formatCurrency(submission.ltv || 0)}
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </TableContainer>
            </>
          ) : (
            <TableContainer sx={{ maxHeight: '60vh', overflowX: 'auto' }}>
              <Table stickyHeader size="small" sx={{ minWidth: { xs: '600px', sm: 'auto' } }}>
                <TableHead>
                  <TableRow>
                    {modalData?.cardType === 'form_views' || modalData?.cardType === 'facebook_form_views' ? (
                      <>
                        <TableCell>Date</TableCell>
                        <TableCell>Session ID</TableCell>
                        <TableCell>UTM Source</TableCell>
                        <TableCell>UTM Campaign</TableCell>
                        <TableCell>Landing URL</TableCell>
                      </>
                    ) : modalData?.cardType === 'ad_impressions' || modalData?.cardType === 'ad_clicks' || modalData?.cardType === 'ad_spend' ||
                        modalData?.cardType === 'google_impressions' || modalData?.cardType === 'google_clicks' || modalData?.cardType === 'google_spend' ? (
                      <>
                        <TableCell>Date</TableCell>
                        <TableCell>Platform</TableCell>
                        <TableCell>Campaign Name</TableCell>
                        <TableCell>UTM Campaign</TableCell>
                        <TableCell align="right">Impressions</TableCell>
                        <TableCell align="right">Clicks</TableCell>
                        <TableCell align="right">Spend</TableCell>
                        <TableCell align="right">CTR</TableCell>
                        <TableCell align="right">CPC</TableCell>
                        {(modalData?.cardType === 'google_impressions' || modalData?.cardType === 'google_clicks' || modalData?.cardType === 'google_spend') && (
                          <TableCell align="right">Conversions</TableCell>
                        )}
                      </>
                    ) : modalData?.cardType === 'google_roas' || modalData?.cardType === 'google_ltv_roas' ? (
                      <>
                        <TableCell>ID</TableCell>
                        <TableCell>Date</TableCell>
                        <TableCell>Parent Name</TableCell>
                        <TableCell>Email</TableCell>
                        <TableCell>Booking Type</TableCell>
                        <TableCell>Label</TableCell>
                        <TableCell align="right">Trial Price</TableCell>
                        <TableCell align="right">LTV</TableCell>
                        <TableCell>Campaign</TableCell>
                      </>
                    ) : modalData?.cardType === 'google_cpl' || modalData?.cardType === 'google_cpr' ? (
                      <>
                        <TableCell>ID</TableCell>
                        <TableCell>Date</TableCell>
                        <TableCell>Parent Name</TableCell>
                        <TableCell>Email</TableCell>
                        <TableCell>Phone</TableCell>
                        <TableCell>Booking Type</TableCell>
                        <TableCell align="right">Price</TableCell>
                        <TableCell>Campaign</TableCell>
                        <TableCell>GCLID</TableCell>
                      </>
                    ) : modalData?.cardType === 'roas' ? (
                      <>
                        <TableCell>ID</TableCell>
                        <TableCell>Date</TableCell>
                        <TableCell>Parent Name</TableCell>
                        <TableCell>Email</TableCell>
                        <TableCell>Booking Type</TableCell>
                        <TableCell>Label</TableCell>
                        <TableCell align="right">Trial Price</TableCell>
                        <TableCell align="right">LTV</TableCell>
                      </>
                    ) : modalData?.cardType === 'cpl' || modalData?.cardType === 'cpr' ? (
                      <>
                        <TableCell>Date</TableCell>
                        <TableCell>Platform</TableCell>
                        <TableCell>Campaign Name</TableCell>
                        <TableCell>UTM Campaign</TableCell>
                        <TableCell align="right">Ad Spend</TableCell>
                        <TableCell align="right">Leads</TableCell>
                        <TableCell align="right">Registrations</TableCell>
                        <TableCell align="right">Revenue</TableCell>
                        <TableCell align="right">
                          {modalData?.cardType === 'cpl' ? 'CPL' : 'CPR'}
                        </TableCell>
                      </>
                    ) : (
                      <>
                        <TableCell>ID</TableCell>
                        <TableCell>Date</TableCell>
                        <TableCell>Parent Name</TableCell>
                        <TableCell>Email</TableCell>
                        <TableCell>Payment Status</TableCell>
                        <TableCell align="right">Amount</TableCell>
                        <TableCell>Booking Type</TableCell>
                      </>
                    )}
                  </TableRow>
                </TableHead>
                <TableBody>
                  {modalSubmissions.map((submission, idx) => (
                    <TableRow key={submission.id || idx} hover>
                      {modalData?.cardType === 'form_views' || modalData?.cardType === 'facebook_form_views' ? (
                        <>
                          <TableCell>{formatDate(submission.createdAt)}</TableCell>
                          <TableCell sx={{ fontFamily: 'monospace', fontSize: '0.75rem' }}>{submission.sessionId}</TableCell>
                          <TableCell>{submission.utmSource || '—'}</TableCell>
                          <TableCell>{submission.utmCampaign || '—'}</TableCell>
                          <TableCell sx={{ maxWidth: 250, overflow: 'hidden', textOverflow: 'ellipsis' }} title={submission.landingUrl}>
                            {submission.landingUrl || '—'}
                          </TableCell>
                        </>
                      ) : modalData?.cardType === 'ad_impressions' || modalData?.cardType === 'ad_clicks' || modalData?.cardType === 'ad_spend' ||
                          modalData?.cardType === 'google_impressions' || modalData?.cardType === 'google_clicks' || modalData?.cardType === 'google_spend' ? (
                        <>
                          <TableCell>{formatDate(submission.date)}</TableCell>
                          <TableCell>
                            <Chip 
                              label={submission.platform === 'meta' ? 'Meta' : submission.platform === 'google' ? 'Google' : submission.platform || 'Unknown'} 
                              size="small" 
                              color={submission.platform === 'meta' ? 'primary' : submission.platform === 'google' ? 'success' : 'default'}
                            />
                          </TableCell>
                          <TableCell sx={{ maxWidth: 200, overflow: 'hidden', textOverflow: 'ellipsis' }} title={submission.campaignName}>
                            {submission.campaignName || '—'}
                          </TableCell>
                          <TableCell>{submission.utmCampaign || '—'}</TableCell>
                          <TableCell align="right">{(submission.impressions || 0).toLocaleString()}</TableCell>
                          <TableCell align="right">{(submission.clicks || 0).toLocaleString()}</TableCell>
                          <TableCell align="right">{formatCurrency(submission.spend || 0)}</TableCell>
                          <TableCell align="right">{formatPercent(submission.ctr || 0)}</TableCell>
                          <TableCell align="right">${parseFloat(submission.cpc || 0).toFixed(2)}</TableCell>
                          {(modalData?.cardType === 'google_impressions' || modalData?.cardType === 'google_clicks' || modalData?.cardType === 'google_spend') && (
                            <TableCell align="right">{(submission.conversions || 0).toLocaleString()}</TableCell>
                          )}
                        </>
                      ) : modalData?.cardType === 'google_roas' || modalData?.cardType === 'google_ltv_roas' ? (
                        <>
                          <TableCell>
                            <Link
                              component="button"
                              variant="body2"
                              onClick={() => handleSubmissionIdClick(submission.id)}
                              sx={{
                                cursor: 'pointer',
                                color: 'primary.main',
                                textDecoration: 'underline',
                                '&:hover': {
                                  color: 'primary.dark',
                                },
                              }}
                            >
                              {submission.id}
                            </Link>
                          </TableCell>
                          <TableCell>{formatDate(submission.createdAt)}</TableCell>
                          <TableCell>{submission.parentName || '—'}</TableCell>
                          <TableCell>{submission.parentEmail || '—'}</TableCell>
                          <TableCell>{submission.bookingType || '—'}</TableCell>
                          <TableCell>{submission.label || '—'}</TableCell>
                          <TableCell align="right">{formatCurrency(submission.price || 0)}</TableCell>
                          <TableCell align="right" sx={{ fontWeight: 600, color: 'success.main' }}>
                            {formatCurrency(submission.ltv || 0)}
                          </TableCell>
                          <TableCell>{submission.utmCampaign || '—'}</TableCell>
                        </>
                      ) : modalData?.cardType === 'google_cpl' || modalData?.cardType === 'google_cpr' ? (
                        <>
                          <TableCell>
                            <Link
                              component="button"
                              variant="body2"
                              onClick={() => handleSubmissionIdClick(submission.id)}
                              sx={{
                                cursor: 'pointer',
                                color: 'primary.main',
                                textDecoration: 'underline',
                                '&:hover': {
                                  color: 'primary.dark',
                                },
                              }}
                            >
                              {submission.id}
                            </Link>
                          </TableCell>
                          <TableCell>{formatDate(submission.createdAt)}</TableCell>
                          <TableCell>{submission.parentName || '—'}</TableCell>
                          <TableCell>{submission.parentEmail || '—'}</TableCell>
                          <TableCell>{submission.parentPhone || '—'}</TableCell>
                          <TableCell>{submission.bookingType || '—'}</TableCell>
                          <TableCell align="right">{formatCurrency(submission.price || 0)}</TableCell>
                          <TableCell>{submission.utmCampaign || '—'}</TableCell>
                          <TableCell sx={{ fontFamily: 'monospace', fontSize: '0.75rem' }}>
                            {submission.gclid ? submission.gclid.substring(0, 20) + '...' : '—'}
                          </TableCell>
                        </>
                      ) : modalData?.cardType === 'cpl' || modalData?.cardType === 'cpr' ? (
                        <>
                          <TableCell>{formatDate(submission.date)}</TableCell>
                          <TableCell>
                            <Chip 
                              label={submission.platform === 'meta' ? 'Meta' : submission.platform === 'google' ? 'Google' : submission.platform || 'Unknown'} 
                              size="small" 
                              color={submission.platform === 'meta' ? 'primary' : submission.platform === 'google' ? 'success' : 'default'}
                            />
                          </TableCell>
                          <TableCell sx={{ maxWidth: 200, overflow: 'hidden', textOverflow: 'ellipsis' }} title={submission.campaignName}>
                            {submission.campaignName || '—'}
                          </TableCell>
                          <TableCell>{submission.utmCampaign || '—'}</TableCell>
                          <TableCell align="right">{formatCurrency(submission.adSpend || 0)}</TableCell>
                          <TableCell align="right">{(submission.formStarts || 0).toLocaleString()}</TableCell>
                          <TableCell align="right">{(submission.formCompletions || 0).toLocaleString()}</TableCell>
                          <TableCell align="right">{formatCurrency(submission.revenue || 0)}</TableCell>
                          <TableCell align="right">
                            {modalData?.cardType === 'cpl'
                              ? formatCurrency(submission.cpl || 0)
                              : formatCurrency(submission.cpr || 0)
                            }
                          </TableCell>
                        </>
                      ) : (
                        <>
                          <TableCell>
                            <Link
                              component="button"
                              variant="body2"
                              onClick={() => handleSubmissionIdClick(submission.id)}
                              sx={{
                                cursor: 'pointer',
                                color: 'primary.main',
                                textDecoration: 'underline',
                                '&:hover': {
                                  color: 'primary.dark',
                                },
                              }}
                            >
                              {submission.id}
                            </Link>
                          </TableCell>
                          <TableCell>{formatDate(submission.createdAt)}</TableCell>
                          <TableCell>{submission.parentFirst} {submission.parentLast}</TableCell>
                          <TableCell>{submission.parentEmail}</TableCell>
                          <TableCell>
                            <Chip
                              label={submission.payment_status || 'N/A'}
                              size="small"
                              color={
                                submission.payment_status === 'paid' ? 'success' :
                                submission.payment_status === 'verified' ? 'info' :
                                'default'
                              }
                            />
                          </TableCell>
                          <TableCell align="right">
                            {submission.actualPrice ? formatCurrency(submission.actualPrice) : '—'}
                          </TableCell>
                          <TableCell>{submission.bookingType}</TableCell>
                        </>
                      )}
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </TableContainer>
              )}
            </>
          )}
        </DialogContent>
        <DialogActions sx={{ px: { xs: 2, sm: 3 }, py: 2, borderTop: (theme) => `1px solid ${theme.palette.divider}`, display: modalDetailView && modalDetailData ? 'flex' : 'none' }}>
            <Button
              variant="outlined"
              color="error"
              startIcon={<TrashIcon className="h-5 w-5" />}
              onClick={handleDeleteClick}
              sx={{ mr: 'auto' }}
            >
              Delete Submission
            </Button>
            <Button
              variant="contained"
              color="primary"
              onClick={handleCloseModal}
              sx={{ ml: 'auto' }}
            >
              Close
            </Button>
          </DialogActions>
      </Dialog>

      {/* Delete Confirmation Dialog */}
      <Dialog
        open={deleteConfirmOpen}
        onClose={handleCloseDeleteConfirm}
        maxWidth="sm"
        fullWidth
        fullScreen={isXsDown}
        PaperProps={{
          sx: {
            m: { xs: 0, sm: 3 },
            borderRadius: { xs: 0, sm: 2 }
          }
        }}
      >
        <DialogTitle>Confirm Delete</DialogTitle>
        <DialogContent sx={{ px: { xs: 2, sm: 3 } }}>
          <Typography>
            Are you sure you want to delete submission #{modalDetailData?.id}? This action cannot be undone.
            {modalDetailData?.parentFirst && modalDetailData?.parentLast && (
              <>
                <br />
                <br />
                <strong>Parent:</strong> {modalDetailData.parentFirst} {modalDetailData.parentLast}
              </>
            )}
            {modalDetailData?.parentEmail && (
              <>
                <br />
                <strong>Email:</strong> {modalDetailData.parentEmail}
              </>
            )}
          </Typography>
        </DialogContent>
        <DialogActions>
          <Button onClick={handleCloseDeleteConfirm} disabled={deleting}>
            Cancel
          </Button>
          <Button
            onClick={handleDeleteSubmission}
            variant="contained"
            color="error"
            disabled={deleting}
          >
            {deleting ? "Deleting..." : "Delete"}
          </Button>
        </DialogActions>
      </Dialog>

      {/* Enterprise KPI Breakdown Modal */}
      <Dialog
        open={enterpriseModalOpen}
        onClose={() => setEnterpriseModalOpen(false)}
        maxWidth="md"
        fullWidth
        fullScreen={isMdDown}
        PaperProps={{
          sx: {
            maxHeight: { xs: '100vh', md: '90vh' },
            display: 'flex',
            flexDirection: 'column',
            m: { xs: 0, md: 3 },
            borderRadius: { xs: 0, md: 2 }
          }
        }}
      >
        <DialogTitle>
          <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <Typography variant="h6">
              {enterpriseModalData?.title || 'KPI Calculation Breakdown'}
            </Typography>
            <IconButton onClick={() => setEnterpriseModalOpen(false)} size="small">
              <XMarkIcon className="h-5 w-5" />
            </IconButton>
          </Box>
        </DialogTitle>
        <DialogContent sx={{ flex: 1, overflowY: 'auto', px: { xs: 2, sm: 3 } }}>
          {enterpriseModalData && enterpriseModalData.calculation && (
            <Box>
              {/* Formula */}
              <Box sx={{ mb: 3, p: 2, bgcolor: 'background.paper', borderRadius: 1, border: '1px solid', borderColor: 'divider' }}>
                <Typography variant="subtitle2" sx={{ mb: 1, fontWeight: 600, color: 'text.secondary' }}>
                  Formula
                </Typography>
                <Typography variant="body1" sx={{ fontFamily: 'monospace', fontSize: '1rem' }}>
                  {enterpriseModalData.calculation.formula}
                </Typography>
              </Box>

              {/* Input Values */}
              <Box sx={{ mb: 3 }}>
                <Typography variant="subtitle2" sx={{ mb: 2, fontWeight: 600 }}>
                  Input Values
                </Typography>
                <TableContainer>
                  <Table size="small">
                    <TableHead>
                      <TableRow>
                        <TableCell>Metric</TableCell>
                        <TableCell align="right">Value</TableCell>
                      </TableRow>
                    </TableHead>
                    <TableBody>
                      {Object.entries(enterpriseModalData.calculation.inputs || {}).map(([key, value]) => (
                        <TableRow key={key}>
                          <TableCell>{key}</TableCell>
                          <TableCell align="right">
                            {(() => {
                              if (typeof value !== 'number') return value;
                              
                              // Check if the key suggests it's a currency value
                              const isCurrency = key.toLowerCase().includes('spend') || 
                                                key.toLowerCase().includes('revenue') || 
                                                key.toLowerCase().includes('cost') || 
                                                key.toLowerCase().includes('ltv') || 
                                                key.toLowerCase().includes('aov') || 
                                                key.toLowerCase().includes('cac') || 
                                                key.toLowerCase().includes('cpl') || 
                                                key.toLowerCase().includes('cpr') || 
                                                key.toLowerCase().includes('cpc') || 
                                                key.toLowerCase().includes('cpm');
                              
                              // Check if the key suggests it's a percentage
                              const isPercentage = key.toLowerCase().includes('rate') || 
                                                    key.toLowerCase().includes('ctr') || 
                                                    key.toLowerCase().includes('margin');
                              
                              if (isPercentage) {
                                return `${value.toFixed(2)}%`;
                              }
                              if (isCurrency) {
                                return formatCurrency(value);
                              }
                              
                              // For regular numbers (impressions, clicks, etc.), use locale string for >= 1000
                              if (value >= 1000) {
                                return value.toLocaleString('en-US');
                              }
                              
                              // For decimals < 1 (like conversion rates)
                              if (value < 1 && value > 0) {
                                return value.toFixed(4);
                              }
                              
                              // Default: format as integer
                              return value.toLocaleString('en-US');
                            })()}
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </TableContainer>
              </Box>

              {/* Result */}
              <Box sx={{ p: 2, bgcolor: 'primary.main', borderRadius: 1, color: 'white' }}>
                <Typography variant="subtitle2" sx={{ mb: 1, fontWeight: 600, opacity: 0.9 }}>
                  Calculated Result
                </Typography>
                <Typography variant="h4" sx={{ fontWeight: 700 }}>
                  {(() => {
                    const result = enterpriseModalData.calculation.result;
                    const kpiKey = enterpriseModalData.kpiKey || '';
                    
                    if (typeof result !== 'number') return result;
                    
                    // Format based on KPI type
                    if (kpiKey.includes('roas') || kpiKey.includes('Roas')) {
                      return `${result.toFixed(2)}x`;
                    }
                    if (kpiKey.includes('margin') || kpiKey.includes('rate') || kpiKey.includes('Rate') || kpiKey.includes('ctr')) {
                      return `${result.toFixed(2)}%`;
                    }
                    if (kpiKey.includes('cpc') || kpiKey.includes('cpl') || kpiKey.includes('cpr') || kpiKey.includes('cac') || kpiKey.includes('cpm') || kpiKey.includes('revenue') || kpiKey.includes('aov') || kpiKey.includes('ltv')) {
                      return formatCurrency(result);
                    }
                    // Default: format as number
                    return result >= 1000 ? result.toLocaleString() : result.toFixed(2);
                  })()}
                </Typography>
              </Box>
            </Box>
          )}
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setEnterpriseModalOpen(false)} variant="contained" color="primary">
            Close
          </Button>
        </DialogActions>
      </Dialog>

      {/* Realized Revenue Modal */}
      <Dialog
        open={realizedRevenueModalOpen}
        onClose={() => setRealizedRevenueModalOpen(false)}
        maxWidth="lg"
        fullWidth
        fullScreen={isMdDown}
        disableScrollLock
        PaperProps={{
          sx: {
            maxHeight: { xs: '100vh', md: '90vh' },
            display: 'flex',
            flexDirection: 'column',
            m: { xs: 0, md: 3 },
            borderRadius: { xs: 0, md: 2 }
          }
        }}
      >
        <DialogTitle>
          <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
              {realizedRevenueDetailView && (
                <IconButton
                  onClick={handleBackToRealizedRevenue}
                  sx={{ mr: 1 }}
                  aria-label="back to list"
                >
                  <ArrowLeftIcon className="h-5 w-5" />
                </IconButton>
              )}
              <Typography variant="h6">
                {realizedRevenueDetailView 
                  ? `Submission #${realizedRevenueDetailData?.id || ''}`
                  : 'Realized Revenue - Meta-Acquired Clients'}
              </Typography>
            </Box>
            <IconButton onClick={() => {
              setRealizedRevenueModalOpen(false);
              setRealizedRevenueDetailView(false);
              setRealizedRevenueDetailData(null);
            }} size="small">
              <XMarkIcon className="h-5 w-5" />
            </IconButton>
          </Box>
        </DialogTitle>
        <DialogContent
          dividers
          sx={{
            flex: 1,
            display: 'flex',
            flexDirection: 'column',
            overflowY: 'auto',
            px: { xs: 2, sm: 3 }
          }}
        >
          {realizedRevenueDetailView ? (
            // Submission Detail View
            realizedRevenueDetailLoading ? (
              <Box display="flex" justifyContent="center" alignItems="center" minHeight="200px">
                <CircularProgress />
              </Box>
            ) : realizedRevenueDetailData ? (
              <Box sx={{ ...detailScrollSx, pr: { xs: 0, sm: 1 } }}>
                {/* Parent Info */}
                <Paper sx={{ p: 2, mb: 2 }}>
                  <Typography variant="h6" gutterBottom>Parent Info</Typography>
                  <Grid container spacing={2}>
                    <Grid item xs={6}>
                      <Typography variant="body2" color="text.secondary">TutorCruncher ID:</Typography>
                      {realizedRevenueDetailData.tcClientId ? (
                        <Link href={`https://account.acmeops.com/clients/${realizedRevenueDetailData.tcClientId}/`} target="_blank">
                          {realizedRevenueDetailData.tcClientId}
                        </Link>
                      ) : (
                        <Typography variant="body2">—</Typography>
                      )}
                    </Grid>
                    <Grid item xs={6}>
                      <Typography variant="body2" color="text.secondary">Name:</Typography>
                      <Typography variant="body2">{realizedRevenueDetailData.parentFirst} {realizedRevenueDetailData.parentLast}</Typography>
                    </Grid>
                    <Grid item xs={6}>
                      <Typography variant="body2" color="text.secondary">Email:</Typography>
                      <Typography variant="body2">{realizedRevenueDetailData.parentEmail}</Typography>
                    </Grid>
                    <Grid item xs={6}>
                      <Typography variant="body2" color="text.secondary">Phone:</Typography>
                      <Typography variant="body2">{realizedRevenueDetailData.parentPhone || '—'}</Typography>
                    </Grid>
                  </Grid>
                </Paper>

                {/* Booking & Pricing */}
                <Paper sx={{ p: 2, mb: 2 }}>
                  <Typography variant="h6" gutterBottom>Booking & Pricing</Typography>
                  <Grid container spacing={2}>
                    <Grid item xs={6}>
                      <Typography variant="body2" color="text.secondary">Booking Type:</Typography>
                      <Typography variant="body2">{realizedRevenueDetailData.bookingType || '—'}</Typography>
                    </Grid>
                    <Grid item xs={6}>
                      <Typography variant="body2" color="text.secondary">Status:</Typography>
                      <Typography variant="body2">{realizedRevenueDetailData.paymentStatus || '—'}</Typography>
                    </Grid>
                    <Grid item xs={6}>
                      <Typography variant="body2" color="text.secondary">Actual Price:</Typography>
                      <Typography variant="body2">{formatCurrency(realizedRevenueDetailData.actualPrice || 0)}</Typography>
                    </Grid>
                    <Grid item xs={6}>
                      <Typography variant="body2" color="text.secondary">Created At:</Typography>
                      <Typography variant="body2">{formatDate(realizedRevenueDetailData.createdAt)}</Typography>
                    </Grid>
                  </Grid>
                </Paper>

                {/* Students */}
                {realizedRevenueDetailData.students && realizedRevenueDetailData.students.length > 0 && (
                  <Paper sx={{ p: 2, mb: 2 }}>
                    <Typography variant="h6" gutterBottom>Students</Typography>
                    <TableContainer>
                      <Table size="small">
                        <TableHead>
                          <TableRow>
                            <TableCell>First Name</TableCell>
                            <TableCell>Last Name</TableCell>
                            <TableCell>Age</TableCell>
                          </TableRow>
                        </TableHead>
                        <TableBody>
                          {realizedRevenueDetailData.students.map((student, idx) => (
                            <TableRow key={idx}>
                              <TableCell>{student.first || '—'}</TableCell>
                              <TableCell>{student.last || '—'}</TableCell>
                              <TableCell>{student.dob ? getAge(student.dob) : '—'}</TableCell>
                            </TableRow>
                          ))}
                        </TableBody>
                      </Table>
                    </TableContainer>
                  </Paper>
                )}

                {/* UTM Data */}
                {(() => {
                  const utmData = getUtmFromDetail(realizedRevenueDetailData);
                  return utmData && Object.keys(utmData).length > 0 ? (
                    <Paper sx={{ p: 2, mb: 2 }}>
                      <Typography variant="h6" gutterBottom>UTM Parameters</Typography>
                      <Grid container spacing={2}>
                        {Object.entries(utmData).map(([key, value]) => (
                          <Grid item xs={6} key={key}>
                            <Typography variant="body2" color="text.secondary">{utmKeyLabel(key)}:</Typography>
                            <Typography variant="body2">{value || '—'}</Typography>
                          </Grid>
                        ))}
                      </Grid>
                    </Paper>
                  ) : null;
                })()}

                {/* Address */}
                {realizedRevenueDetailData.address && (
                  <Paper sx={{ p: 2, mb: 2 }}>
                    <Typography variant="h6" gutterBottom>Address</Typography>
                    <Typography variant="body2">
                      {[
                        realizedRevenueDetailData.address.street,
                        realizedRevenueDetailData.address.city,
                        realizedRevenueDetailData.address.state,
                        realizedRevenueDetailData.address.zip,
                        realizedRevenueDetailData.address.country
                      ].filter(Boolean).join(', ') || '—'}
                    </Typography>
                  </Paper>
                )}
              </Box>
            ) : (
              <Typography color="text.secondary">Failed to load submission details</Typography>
            )
          ) : realizedRevenueLoading ? (
            <Box sx={{ display: 'flex', justifyContent: 'center', alignItems: 'center', py: 4 }}>
              <CircularProgress />
            </Box>
          ) : error ? (
            <Alert severity="error" sx={{ mb: 2 }}>
              {error}
            </Alert>
          ) : (
            <>
              {realizedRevenueData ? (
                <>
                  <Grid container spacing={2} sx={{ mb: 3 }}>
                    <Grid item xs={12} sm={6} md={3}>
                      <Paper sx={{ p: 2 }}>
                        <Typography variant="overline" display="block" color="text.secondary">
                          Total Meta Clients
                        </Typography>
                        <Typography variant="h5" sx={{ fontWeight: 700 }}>
                          {realizedRevenueData.summary?.total_clients ?? 0}
                        </Typography>
                      </Paper>
                    </Grid>
                    <Grid item xs={12} sm={6} md={3}>
                      <Paper sx={{ p: 2 }}>
                        <Typography variant="overline" display="block" color="text.secondary">
                          Clients With Revenue
                        </Typography>
                        <Typography variant="h5" sx={{ fontWeight: 700, color: 'success.main' }}>
                          {realizedRevenueData.summary?.clients_with_revenue ?? 0}
                        </Typography>
                      </Paper>
                    </Grid>
                    <Grid item xs={12} sm={6} md={3}>
                      <Paper sx={{ p: 2 }}>
                        <Typography variant="overline" display="block" color="text.secondary">
                          Total Realized Revenue
                        </Typography>
                        <Typography variant="h5" sx={{ fontWeight: 700 }}>
                          {formatCurrency(parseFloat(realizedRevenueData.summary?.total_revenue || 0))}
                        </Typography>
                      </Paper>
                    </Grid>
                    <Grid item xs={12} sm={6} md={3}>
                      <Paper sx={{ p: 2 }}>
                        <Typography variant="overline" display="block" color="text.secondary">
                          Avg Revenue / Client
                        </Typography>
                        <Typography variant="h5" sx={{ fontWeight: 700 }}>
                          {formatCurrency(parseFloat(realizedRevenueData.summary?.avg_revenue_per_client || 0))}
                        </Typography>
                      </Paper>
                    </Grid>
                  </Grid>

                  {Array.isArray(realizedRevenueData.monthly) && realizedRevenueData.monthly.length > 0 && (
                    <Box sx={{ mb: 3 }}>
                      <Typography variant="subtitle1" sx={{ fontWeight: 600, mb: 1 }}>
                        Monthly Revenue Trend
                      </Typography>
                      <TableContainer sx={{ maxHeight: 240 }}>
                        <Table size="small" stickyHeader>
                          <TableHead>
                            <TableRow>
                              <TableCell>Month</TableCell>
                              <TableCell align="right">Active Clients</TableCell>
                              <TableCell align="right">Revenue</TableCell>
                              <TableCell align="right">Monthly Revenue</TableCell>
                            </TableRow>
                          </TableHead>
                          <TableBody>
                            {realizedRevenueData.monthly.map((month, idx) => (
                              <TableRow key={idx}>
                                <TableCell>
                                  {(() => {
                                    if (month?.period) {
                                      const parsed = DateTime.fromISO(month.period, { zone: 'utc' });
                                      if (parsed.isValid) {
                                        return parsed.setZone('America/New_York').toFormat('LLL yyyy');
                                      }
                                      if (month.period.length === 7) {
                                        const fallback = DateTime.fromFormat(month.period, 'yyyy-LL', { zone: 'America/New_York' });
                                        if (fallback.isValid) {
                                          return fallback.toFormat('LLL yyyy');
                                        }
                                      }
                                    }
                                    if (month?.revenue_month) {
                                      const monthTimestamp = DateTime.fromISO(month.revenue_month, { zone: 'utc' });
                                      if (monthTimestamp.isValid) {
                                        return monthTimestamp.setZone('America/New_York').toFormat('LLL yyyy');
                                      }
                                    }
                                    const inferenceKey = month?.period?.slice(0, 7);
                                    const acquisitions = realizedRevenueData.clients
                                      ?.filter((c) => c.acquisition_date?.startsWith(inferenceKey || ''))
                                      ?.map((c) => DateTime.fromISO(c.acquisition_date))
                                      ?.filter((d) => d.isValid);
                                    if (acquisitions && acquisitions.length > 0) {
                                      const sample = acquisitions[0].setZone('America/New_York');
                                      return sample.toFormat('LLL yyyy');
                                    }
                                    const synthetic = inferenceKey
                                      ? DateTime.fromFormat(inferenceKey, 'yyyy-LL', { zone: 'America/New_York' })
                                      : null;
                                    if (synthetic?.isValid) {
                                      return synthetic.toFormat('LLL yyyy');
                                    }
                                    return 'Month not available';
                                  })()}
                                </TableCell>
                                <TableCell align="right">{month?.active_clients ?? 0}</TableCell>
                                <TableCell align="right">{formatCurrency(parseFloat(month?.total_revenue || 0))}</TableCell>
                                <TableCell align="right">{formatCurrency(parseFloat(month?.cumulative_revenue || 0))}</TableCell>
                              </TableRow>
                            ))}
                          </TableBody>
                        </Table>
                      </TableContainer>
                    </Box>
                  )}

                  <Typography variant="subtitle1" sx={{ fontWeight: 600, mb: 1 }}>
                    Client Revenue Detail
                  </Typography>
                  {Array.isArray(realizedRevenueData.clients) && realizedRevenueData.clients.length > 0 ? (
                    (() => {
                      // Sort clients by total_revenue if sort field is set
                      const sortedClients = realizedRevenueSortField === 'total_revenue' 
                        ? [...realizedRevenueData.clients].sort((a, b) => {
                            const revenueA = parseFloat(a.total_revenue || 0);
                            const revenueB = parseFloat(b.total_revenue || 0);
                            if (realizedRevenueSortDirection === 'desc') {
                              return revenueB - revenueA; // Highest to lowest
                            } else {
                              return revenueA - revenueB; // Lowest to highest
                            }
                          })
                        : realizedRevenueData.clients; // No sorting if field not set
                      
                      return (
                        <TableContainer sx={{ maxHeight: '60vh', overflowX: 'auto' }}>
                          <Table size="small" stickyHeader sx={{ minWidth: 900 }}>
                            <TableHead>
                              <TableRow>
                                <TableCell>Submission ID</TableCell>
                                <TableCell>Acquisition Date</TableCell>
                                <TableCell>Parent Name</TableCell>
                                <TableCell>Email</TableCell>
                                <TableCell>Booking Type</TableCell>
                                <TableCell>Label</TableCell>
                                <TableCell>UTM Campaign</TableCell>
                                <TableCell align="right">Invoices</TableCell>
                                <TableCell 
                                  align="right"
                                  sx={{ 
                                    cursor: 'pointer',
                                    userSelect: 'none',
                                    '&:hover': { backgroundColor: 'action.hover' }
                                  }}
                                  onClick={() => {
                                    if (realizedRevenueSortField === 'total_revenue') {
                                      // Toggle direction
                                      setRealizedRevenueSortDirection(prev => prev === 'desc' ? 'asc' : 'desc');
                                    } else {
                                      // Set to total_revenue and default to desc (highest first)
                                      setRealizedRevenueSortField('total_revenue');
                                      setRealizedRevenueSortDirection('desc');
                                    }
                                  }}
                                >
                                  <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'flex-end', gap: 0.5 }}>
                                    Total Revenue
                                    {realizedRevenueSortField === 'total_revenue' && (
                                      realizedRevenueSortDirection === 'desc' ? (
                                        <ArrowDownIcon className="h-4 w-4" />
                                      ) : (
                                        <ArrowUpIcon className="h-4 w-4" />
                                      )
                                    )}
                                  </Box>
                                </TableCell>
                                <TableCell>First Payment</TableCell>
                                <TableCell>Last Payment</TableCell>
                              </TableRow>
                            </TableHead>
                            <TableBody>
                              {sortedClients.map((client, idx) => (
                                <TableRow key={client.submission_id || idx} hover>
                              <TableCell>
                                <Link
                                  component="button"
                                  variant="body2"
                                  onClick={() => handleRealizedRevenueSubmissionClick(client.submission_id)}
                                  sx={{
                                    cursor: 'pointer',
                                    color: 'primary.main',
                                    textDecoration: 'underline',
                                    '&:hover': { color: 'primary.dark' }
                                  }}
                                >
                                  {client.submission_id}
                                </Link>
                              </TableCell>
                              <TableCell>{client.acquisition_date ? DateTime.fromISO(client.acquisition_date).toFormat('LLL d, yyyy') : '—'}</TableCell>
                              <TableCell>{client.parent_name || '—'}</TableCell>
                              <TableCell>{client.parent_email || '—'}</TableCell>
                              <TableCell>{client.booking_type || '—'}</TableCell>
                              <TableCell>{client.label_name || '—'}</TableCell>
                              <TableCell>{client.utm_campaign || '—'}</TableCell>
                              <TableCell align="right">{client.invoice_count ?? 0}</TableCell>
                              <TableCell align="right">{formatCurrency(parseFloat(client.total_revenue || 0))}</TableCell>
                              <TableCell>{client.first_payment_date ? DateTime.fromISO(client.first_payment_date).toFormat('LLL d, yyyy') : '—'}</TableCell>
                              <TableCell>{client.last_payment_date ? DateTime.fromISO(client.last_payment_date).toFormat('LLL d, yyyy') : '—'}</TableCell>
                                </TableRow>
                              ))}
                            </TableBody>
                          </Table>
                        </TableContainer>
                      );
                    })()
                  ) : (
                    <Alert severity="info">No submissions found for the selected criteria.</Alert>
                  )}
                </>
              ) : (
                <Alert severity="info">No submissions found for the selected criteria.</Alert>
              )}
            </>
          )}
        </DialogContent>
        <DialogActions sx={{ px: 3, py: 2 }}>
          <Button 
            onClick={() => {
              setRealizedRevenueModalOpen(false);
              setRealizedRevenueDetailView(false);
              setRealizedRevenueDetailData(null);
            }}
          >
            Close
          </Button>
        </DialogActions>
      </Dialog>

      {/* Google Realized Revenue Modal */}
      <Dialog
        open={googleRealizedRevenueModalOpen}
        onClose={() => setGoogleRealizedRevenueModalOpen(false)}
        maxWidth="lg"
        fullWidth
        fullScreen={isMdDown}
        disableScrollLock
        PaperProps={{
          sx: {
            maxHeight: { xs: '100vh', md: '90vh' },
            display: 'flex',
            flexDirection: 'column',
            m: { xs: 0, md: 3 },
            borderRadius: { xs: 0, md: 2 }
          }
        }}
      >
        <DialogTitle>
          <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
              {googleRealizedRevenueDetailView && (
                <IconButton
                  onClick={handleBackToGoogleRealizedRevenue}
                  sx={{ mr: 1 }}
                  aria-label="back to list"
                >
                  <ArrowLeftIcon className="h-5 w-5" />
                </IconButton>
              )}
              <Typography variant="h6">
                {googleRealizedRevenueDetailView
                  ? `Submission #${googleRealizedRevenueDetailData?.id || ''}`
                  : 'Realized Revenue - Google-Acquired Clients'}
              </Typography>
            </Box>
            <IconButton onClick={() => {
              setGoogleRealizedRevenueModalOpen(false);
              setGoogleRealizedRevenueDetailView(false);
              setGoogleRealizedRevenueDetailData(null);
            }} size="small">
              <XMarkIcon className="h-5 w-5" />
            </IconButton>
          </Box>
        </DialogTitle>
        <DialogContent
          dividers
          sx={{
            flex: 1,
            display: 'flex',
            flexDirection: 'column',
            overflowY: 'auto',
            px: { xs: 2, sm: 3 }
          }}
        >
          {googleRealizedRevenueDetailView ? (
            // Submission Detail View
            googleRealizedRevenueDetailLoading ? (
              <Box display="flex" justifyContent="center" alignItems="center" minHeight="200px">
                <CircularProgress />
              </Box>
            ) : googleRealizedRevenueDetailData ? (
              <Box sx={{ ...detailScrollSx, pr: { xs: 0, sm: 1 } }}>
                {/* Parent Info */}
                <Paper sx={{ p: 2, mb: 2 }}>
                  <Typography variant="h6" gutterBottom>Parent Info</Typography>
                  <Grid container spacing={2}>
                    <Grid item xs={6}>
                      <Typography variant="body2" color="text.secondary">TutorCruncher ID:</Typography>
                      {googleRealizedRevenueDetailData.tcClientId ? (
                        <Link href={`https://account.acmeops.com/clients/${googleRealizedRevenueDetailData.tcClientId}/`} target="_blank">
                          {googleRealizedRevenueDetailData.tcClientId}
                        </Link>
                      ) : (
                        <Typography variant="body2">—</Typography>
                      )}
                    </Grid>
                    <Grid item xs={6}>
                      <Typography variant="body2" color="text.secondary">Name:</Typography>
                      <Typography variant="body2">{googleRealizedRevenueDetailData.parentFirst} {googleRealizedRevenueDetailData.parentLast}</Typography>
                    </Grid>
                    <Grid item xs={6}>
                      <Typography variant="body2" color="text.secondary">Email:</Typography>
                      <Typography variant="body2">{googleRealizedRevenueDetailData.parentEmail}</Typography>
                    </Grid>
                    <Grid item xs={6}>
                      <Typography variant="body2" color="text.secondary">Phone:</Typography>
                      <Typography variant="body2">{googleRealizedRevenueDetailData.parentPhone || '—'}</Typography>
                    </Grid>
                  </Grid>
                </Paper>

                {/* Booking & Pricing */}
                <Paper sx={{ p: 2, mb: 2 }}>
                  <Typography variant="h6" gutterBottom>Booking & Pricing</Typography>
                  <Grid container spacing={2}>
                    <Grid item xs={6}>
                      <Typography variant="body2" color="text.secondary">Booking Type:</Typography>
                      <Typography variant="body2">{googleRealizedRevenueDetailData.bookingType || '—'}</Typography>
                    </Grid>
                    <Grid item xs={6}>
                      <Typography variant="body2" color="text.secondary">Status:</Typography>
                      <Typography variant="body2">{googleRealizedRevenueDetailData.paymentStatus || '—'}</Typography>
                    </Grid>
                    <Grid item xs={6}>
                      <Typography variant="body2" color="text.secondary">Actual Price:</Typography>
                      <Typography variant="body2">{formatCurrency(googleRealizedRevenueDetailData.actualPrice || 0)}</Typography>
                    </Grid>
                    <Grid item xs={6}>
                      <Typography variant="body2" color="text.secondary">Created At:</Typography>
                      <Typography variant="body2">{formatDate(googleRealizedRevenueDetailData.createdAt)}</Typography>
                    </Grid>
                  </Grid>
                </Paper>

                {/* Students */}
                {googleRealizedRevenueDetailData.students && googleRealizedRevenueDetailData.students.length > 0 && (
                  <Paper sx={{ p: 2, mb: 2 }}>
                    <Typography variant="h6" gutterBottom>Students</Typography>
                    <TableContainer>
                      <Table size="small">
                        <TableHead>
                          <TableRow>
                            <TableCell>First Name</TableCell>
                            <TableCell>Last Name</TableCell>
                            <TableCell>Age</TableCell>
                          </TableRow>
                        </TableHead>
                        <TableBody>
                          {googleRealizedRevenueDetailData.students.map((student, idx) => (
                            <TableRow key={idx}>
                              <TableCell>{student.first || '—'}</TableCell>
                              <TableCell>{student.last || '—'}</TableCell>
                              <TableCell>{student.dob ? getAge(student.dob) : '—'}</TableCell>
                            </TableRow>
                          ))}
                        </TableBody>
                      </Table>
                    </TableContainer>
                  </Paper>
                )}

                {/* UTM Data */}
                {(() => {
                  const utmData = getUtmFromDetail(googleRealizedRevenueDetailData);
                  return utmData && Object.keys(utmData).length > 0 ? (
                    <Paper sx={{ p: 2, mb: 2 }}>
                      <Typography variant="h6" gutterBottom>UTM Parameters</Typography>
                      <Grid container spacing={2}>
                        {Object.entries(utmData).map(([key, value]) => (
                          <Grid item xs={6} key={key}>
                            <Typography variant="body2" color="text.secondary">{utmKeyLabel(key)}:</Typography>
                            <Typography variant="body2">{value || '—'}</Typography>
                          </Grid>
                        ))}
                      </Grid>
                    </Paper>
                  ) : null;
                })()}

                {/* Address */}
                {googleRealizedRevenueDetailData.address && (
                  <Paper sx={{ p: 2, mb: 2 }}>
                    <Typography variant="h6" gutterBottom>Address</Typography>
                    <Typography variant="body2">
                      {[
                        googleRealizedRevenueDetailData.address.street,
                        googleRealizedRevenueDetailData.address.city,
                        googleRealizedRevenueDetailData.address.state,
                        googleRealizedRevenueDetailData.address.zip,
                        googleRealizedRevenueDetailData.address.country
                      ].filter(Boolean).join(', ') || '—'}
                    </Typography>
                  </Paper>
                )}
              </Box>
            ) : (
              <Typography color="text.secondary">Failed to load submission details</Typography>
            )
          ) : googleRealizedRevenueLoading ? (
            <Box sx={{ display: 'flex', justifyContent: 'center', alignItems: 'center', py: 4 }}>
              <CircularProgress />
            </Box>
          ) : error ? (
            <Alert severity="error" sx={{ mb: 2 }}>
              {error}
            </Alert>
          ) : (
            <>
              {googleRealizedRevenueData ? (
                <>
                  <Grid container spacing={2} sx={{ mb: 3 }}>
                    <Grid item xs={12} sm={6} md={3}>
                      <Paper sx={{ p: 2 }}>
                        <Typography variant="overline" display="block" color="text.secondary">
                          Total Google Clients
                        </Typography>
                        <Typography variant="h5" sx={{ fontWeight: 700 }}>
                          {googleRealizedRevenueData.summary?.total_clients ?? 0}
                        </Typography>
                      </Paper>
                    </Grid>
                    <Grid item xs={12} sm={6} md={3}>
                      <Paper sx={{ p: 2 }}>
                        <Typography variant="overline" display="block" color="text.secondary">
                          Clients With Revenue
                        </Typography>
                        <Typography variant="h5" sx={{ fontWeight: 700, color: 'success.main' }}>
                          {googleRealizedRevenueData.summary?.clients_with_revenue ?? 0}
                        </Typography>
                      </Paper>
                    </Grid>
                    <Grid item xs={12} sm={6} md={3}>
                      <Paper sx={{ p: 2 }}>
                        <Typography variant="overline" display="block" color="text.secondary">
                          Total Realized Revenue
                        </Typography>
                        <Typography variant="h5" sx={{ fontWeight: 700 }}>
                          {formatCurrency(parseFloat(googleRealizedRevenueData.summary?.total_revenue || 0))}
                        </Typography>
                      </Paper>
                    </Grid>
                    <Grid item xs={12} sm={6} md={3}>
                      <Paper sx={{ p: 2 }}>
                        <Typography variant="overline" display="block" color="text.secondary">
                          Avg Revenue / Client
                        </Typography>
                        <Typography variant="h5" sx={{ fontWeight: 700 }}>
                          {formatCurrency(parseFloat(googleRealizedRevenueData.summary?.avg_revenue_per_client || 0))}
                        </Typography>
                      </Paper>
                    </Grid>
                  </Grid>

                  {Array.isArray(googleRealizedRevenueData.monthly) && googleRealizedRevenueData.monthly.length > 0 && (
                    <Box sx={{ mb: 3 }}>
                      <Typography variant="subtitle1" sx={{ fontWeight: 600, mb: 1 }}>
                        Monthly Revenue Trend
                      </Typography>
                      <TableContainer sx={{ maxHeight: 240 }}>
                        <Table size="small" stickyHeader>
                          <TableHead>
                            <TableRow>
                              <TableCell>Month</TableCell>
                              <TableCell align="right">Active Clients</TableCell>
                              <TableCell align="right">Revenue</TableCell>
                              <TableCell align="right">Cumulative Revenue</TableCell>
                            </TableRow>
                          </TableHead>
                          <TableBody>
                            {googleRealizedRevenueData.monthly.map((month, idx) => (
                              <TableRow key={idx}>
                                <TableCell>
                                  {(() => {
                                    if (month?.period) {
                                      // Try ISO format first
                                      const parsed = DateTime.fromISO(month.period, { zone: 'utc' });
                                      if (parsed.isValid) {
                                        return parsed.setZone('America/New_York').toFormat('LLL yyyy');
                                      }
                                      // Try yyyy-LL format
                                      if (month.period.length === 7) {
                                        const fallback = DateTime.fromFormat(month.period, 'yyyy-LL', { zone: 'America/New_York' });
                                        if (fallback.isValid) {
                                          return fallback.toFormat('LLL yyyy');
                                        }
                                      }
                                      // Try SQL timestamp format (e.g., "2025-12-01 00:00:00+00")
                                      const sqlParsed = DateTime.fromSQL(month.period.replace('+00', ''), { zone: 'utc' });
                                      if (sqlParsed.isValid) {
                                        return sqlParsed.setZone('America/New_York').toFormat('LLL yyyy');
                                      }
                                    }
                                    return '—';
                                  })()}
                                </TableCell>
                                <TableCell align="right">{month.active_clients ?? 0}</TableCell>
                                <TableCell align="right">{formatCurrency(parseFloat(month.total_revenue || 0))}</TableCell>
                                <TableCell align="right">{formatCurrency(parseFloat(month.cumulative_revenue || 0))}</TableCell>
                              </TableRow>
                            ))}
                          </TableBody>
                        </Table>
                      </TableContainer>
                    </Box>
                  )}

                  {/* Client Details Table */}
                  <Typography variant="subtitle1" sx={{ fontWeight: 600, mb: 1 }}>
                    Google-Acquired Clients
                  </Typography>
                  {googleRealizedRevenueData.clients && googleRealizedRevenueData.clients.length > 0 ? (
                    (() => {
                      // Sort clients
                      let sortedClients = [...googleRealizedRevenueData.clients];
                      if (googleRealizedRevenueSortField) {
                        sortedClients.sort((a, b) => {
                          const aVal = parseFloat(a[googleRealizedRevenueSortField] || 0);
                          const bVal = parseFloat(b[googleRealizedRevenueSortField] || 0);
                          return googleRealizedRevenueSortDirection === 'desc' ? bVal - aVal : aVal - bVal;
                        });
                      }
                      return (
                        <TableContainer sx={{ maxHeight: 400 }}>
                          <Table size="small" stickyHeader>
                            <TableHead>
                              <TableRow>
                                <TableCell>ID</TableCell>
                                <TableCell>Acquisition Date</TableCell>
                                <TableCell>Name</TableCell>
                                <TableCell>Email</TableCell>
                                <TableCell>Booking Type</TableCell>
                                <TableCell>Label</TableCell>
                                <TableCell>Campaign</TableCell>
                                <TableCell align="right">Invoices</TableCell>
                                <TableCell
                                  align="right"
                                  sx={{ cursor: 'pointer', userSelect: 'none' }}
                                  onClick={() => {
                                    if (googleRealizedRevenueSortField === 'total_revenue') {
                                      setGoogleRealizedRevenueSortDirection(prev => prev === 'desc' ? 'asc' : 'desc');
                                    } else {
                                      setGoogleRealizedRevenueSortField('total_revenue');
                                      setGoogleRealizedRevenueSortDirection('desc');
                                    }
                                  }}
                                >
                                  Revenue {googleRealizedRevenueSortField === 'total_revenue' ? (googleRealizedRevenueSortDirection === 'desc' ? '▼' : '▲') : ''}
                                </TableCell>
                                <TableCell>First Payment</TableCell>
                                <TableCell>Last Payment</TableCell>
                              </TableRow>
                            </TableHead>
                            <TableBody>
                              {sortedClients.map((client, idx) => (
                                <TableRow key={idx}>
                                  <TableCell>
                                    <Link
                                      component="button"
                                      onClick={() => handleGoogleRealizedRevenueSubmissionClick(client.submission_id)}
                                      sx={{
                                        cursor: 'pointer',
                                        color: 'primary.main',
                                        textDecoration: 'underline',
                                        '&:hover': { color: 'primary.dark' }
                                      }}
                                    >
                                      {client.submission_id}
                                    </Link>
                                  </TableCell>
                                  <TableCell>{client.acquisition_date ? DateTime.fromISO(client.acquisition_date).toFormat('LLL d, yyyy') : '—'}</TableCell>
                                  <TableCell>{client.parent_name || '—'}</TableCell>
                                  <TableCell>{client.parent_email || '—'}</TableCell>
                                  <TableCell>{client.booking_type || '—'}</TableCell>
                                  <TableCell>{client.label_name || '—'}</TableCell>
                                  <TableCell>{client.utm_campaign || '—'}</TableCell>
                                  <TableCell align="right">{client.invoice_count ?? 0}</TableCell>
                                  <TableCell align="right">{formatCurrency(parseFloat(client.total_revenue || 0))}</TableCell>
                                  <TableCell>{client.first_payment_date ? DateTime.fromISO(client.first_payment_date).toFormat('LLL d, yyyy') : '—'}</TableCell>
                                  <TableCell>{client.last_payment_date ? DateTime.fromISO(client.last_payment_date).toFormat('LLL d, yyyy') : '—'}</TableCell>
                                </TableRow>
                              ))}
                            </TableBody>
                          </Table>
                        </TableContainer>
                      );
                    })()
                  ) : (
                    <Alert severity="info">No Google-acquired clients found for the selected criteria.</Alert>
                  )}
                </>
              ) : (
                <Alert severity="info">No submissions found for the selected criteria.</Alert>
              )}
            </>
          )}
        </DialogContent>
        <DialogActions sx={{ px: 3, py: 2 }}>
          <Button
            onClick={() => {
              setGoogleRealizedRevenueModalOpen(false);
              setGoogleRealizedRevenueDetailView(false);
              setGoogleRealizedRevenueDetailData(null);
            }}
          >
            Close
          </Button>
        </DialogActions>
      </Dialog>

      {/* Full Client Conversion Modal */}
      <Dialog
        open={fullClientConversionModalOpen}
        onClose={() => setFullClientConversionModalOpen(false)}
        maxWidth="md"
        fullWidth
        fullScreen={isMdDown}
        disableScrollLock
        PaperProps={{
          sx: {
            maxHeight: { xs: '100vh', md: '90vh' },
            display: 'flex',
            flexDirection: 'column',
            m: { xs: 0, md: 3 },
            borderRadius: { xs: 0, md: 2 }
          }
        }}
      >
        <DialogTitle>
          <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <Typography variant="h6">
              {fullClientConversionSource === 'meta' ? 'Meta Full Client Conversion Rate' :
               fullClientConversionSource === 'google' ? 'Google Full Client Conversion Rate' :
               fullClientConversionSource === 'klaviyo' ? 'Klaviyo Full Client Conversion Rate' :
               'Full Client Conversion Rate'}
            </Typography>
            <IconButton
              onClick={() => setFullClientConversionModalOpen(false)}
              size="small"
            >
              <XMarkIcon className="h-5 w-5" />
            </IconButton>
          </Box>
        </DialogTitle>
        <DialogContent
          sx={{
            flex: 1,
            display: 'flex',
            flexDirection: 'column',
            overflowY: 'auto',
            px: { xs: 2, sm: 3 }
          }}
        >
          {fullClientConversionLoading ? (
            <Box sx={{ display: 'flex', justifyContent: 'center', alignItems: 'center', py: 4 }}>
              <CircularProgress />
            </Box>
          ) : error ? (
            <Alert severity="error" sx={{ mb: 2 }}>
              {error}
            </Alert>
          ) : (
            <>
              {fullClientConversionData ? (
                <>
                  {/* Summary Cards */}
                  <Grid container spacing={2} sx={{ mb: 3 }}>
                    <Grid item xs={12} sm={4}>
                      <Paper sx={{ p: 2 }}>
                        <Typography variant="overline" display="block" color="text.secondary">
                          Total Registrations
                        </Typography>
                        <Typography variant="h5" sx={{ fontWeight: 700 }}>
                          {fullClientConversionData.summary?.total_registrations ?? 0}
                        </Typography>
                      </Paper>
                    </Grid>
                    <Grid item xs={12} sm={4}>
                      <Paper sx={{ p: 2 }}>
                        <Typography variant="overline" display="block" color="text.secondary">
                          Fully Converted
                        </Typography>
                        <Typography variant="h5" sx={{ fontWeight: 700, color: 'success.main' }}>
                          {fullClientConversionData.summary?.fully_converted_registrations ?? 0}
                        </Typography>
                      </Paper>
                    </Grid>
                    <Grid item xs={12} sm={4}>
                      <Paper sx={{ p: 2 }}>
                        <Typography variant="overline" display="block" color="text.secondary">
                          Lifetime Conversion Rate
                        </Typography>
                        <Typography variant="h5" sx={{ fontWeight: 700, color: 'success.main' }}>
                          {fullClientConversionData.summary?.conversion_rate !== undefined
                            ? `${parseFloat(fullClientConversionData.summary.conversion_rate || 0).toFixed(1)}%`
                            : '0.0%'}
                        </Typography>
                      </Paper>
                    </Grid>
                  </Grid>

                  {/* Past 12 Months Aggregate */}
                  {fullClientConversionData.lastTwelveMonths && (
                    <Box sx={{ mb: 3, p: 2, bgcolor: 'background.paper', borderRadius: 1, border: '1px solid', borderColor: 'divider' }}>
                      <Typography variant="subtitle1" sx={{ fontWeight: 600, mb: 1 }}>
                        Past 12 Months Aggregate
                      </Typography>
                      <Grid container spacing={2}>
                        <Grid item xs={12} sm={4}>
                          <Typography variant="body2" color="text.secondary">
                            Total Registrations (Last 12 Months)
                          </Typography>
                          <Typography variant="h6" sx={{ fontWeight: 700 }}>
                            {fullClientConversionData.lastTwelveMonths.total_registrations ?? 0}
                          </Typography>
                        </Grid>
                        <Grid item xs={12} sm={4}>
                          <Typography variant="body2" color="text.secondary">
                            Fully Converted (Last 12 Months)
                          </Typography>
                          <Typography variant="h6" sx={{ fontWeight: 700, color: 'success.main' }}>
                            {fullClientConversionData.lastTwelveMonths.fully_converted_registrations ?? 0}
                          </Typography>
                        </Grid>
                        <Grid item xs={12} sm={4}>
                          <Typography variant="body2" color="text.secondary">
                            Aggregate Conversion Rate (Last 12 Months)
                          </Typography>
                          <Typography variant="h6" sx={{ fontWeight: 700, color: 'success.main' }}>
                            {fullClientConversionData.lastTwelveMonths.conversion_rate !== undefined
                              ? `${parseFloat(fullClientConversionData.lastTwelveMonths.conversion_rate || 0).toFixed(1)}%`
                              : '0.0%'}
                          </Typography>
                        </Grid>
                      </Grid>
                    </Box>
                  )}

                  {/* ROAS Calculation for Ad Partners */}
                  {fullClientConversionSource && (() => {
                    let roas = 0;
                    let adSpend = 0;
                    let sourceName = '';
                    
                    if (fullClientConversionSource === 'meta') {
                      roas = parseFloat(enterpriseData?.metrics?.strategic?.roasByChannel?.meta || data?.overall?.roas || roasSummary?.roas || 0);
                      adSpend = parseFloat(enterpriseData?.raw?.meta_spend || data?.overall?.meta_spend || 0);
                      sourceName = 'Meta';
                    } else if (fullClientConversionSource === 'google') {
                      roas = parseFloat(googleData?.overall?.google_roas || 0);
                      adSpend = parseFloat(googleData?.overall?.google_spend || 0);
                      sourceName = 'Google';
                    } else if (fullClientConversionSource === 'klaviyo') {
                      // Klaviyo uses fixed monthly cost of $669.59
                      const monthsInRange = 12; // Past 12 months
                      adSpend = 669.59 * monthsInRange;
                      // Calculate ROAS based on Klaviyo revenue if available
                      roas = 0; // Would need Klaviyo revenue data
                      sourceName = 'Klaviyo';
                    }
                    
                    const conversionRate = parseFloat(fullClientConversionData.lastTwelveMonths?.conversion_rate || fullClientConversionData.summary?.conversion_rate || 0);
                    const adjustedRoas = (conversionRate / 100) * roas;
                    
                    return (
                      <Box sx={{ mb: 3, p: 2, bgcolor: 'info.light', borderRadius: 1, border: '1px solid', borderColor: 'info.main' }}>
                        <Typography variant="subtitle1" sx={{ fontWeight: 600, mb: 1 }}>
                          {sourceName} ROI Analysis
                        </Typography>
                        <Grid container spacing={2}>
                          <Grid item xs={12} sm={4}>
                            <Typography variant="body2" color="text.secondary">
                              Conversion Rate
                            </Typography>
                            <Typography variant="h6" sx={{ fontWeight: 700 }}>
                              {conversionRate.toFixed(1)}%
                            </Typography>
                          </Grid>
                          <Grid item xs={12} sm={4}>
                            <Typography variant="body2" color="text.secondary">
                              ROAS
                            </Typography>
                            <Typography variant="h6" sx={{ fontWeight: 700 }}>
                              {roas.toFixed(2)}x
                            </Typography>
                          </Grid>
                          <Grid item xs={12} sm={4}>
                            <Typography variant="body2" color="text.secondary">
                              Adjusted ROAS (Conversion Rate × ROAS)
                            </Typography>
                            <Typography variant="h6" sx={{ fontWeight: 700, color: adjustedRoas >= 1 ? 'success.main' : 'warning.main' }}>
                              {adjustedRoas.toFixed(2)}x
                            </Typography>
                            <Typography variant="caption" color="text.secondary">
                              Expected return accounting for conversion rate
                            </Typography>
                          </Grid>
                        </Grid>
                        {fullClientConversionSource === 'klaviyo' && (
                          <Box sx={{ mt: 2, p: 1.5, bgcolor: 'background.paper', borderRadius: 1 }}>
                            <Typography variant="caption" color="text.secondary">
                              Klaviyo monthly cost: $669.59 × {12} months = {formatCurrency(adSpend)}
                            </Typography>
                          </Box>
                        )}
                      </Box>
                    );
                  })()}

                  {/* Line Chart */}
                  {Array.isArray(fullClientConversionData.monthly) && fullClientConversionData.monthly.length > 0 ? (
                    <Box sx={{ mb: 3, p: 2, bgcolor: 'background.paper', borderRadius: 1, border: '1px solid', borderColor: 'divider' }}>
                      <Typography variant="subtitle1" sx={{ fontWeight: 600, mb: 2 }}>
                        Conversion Rate Trend (Past 12 Months)
                      </Typography>
                      <ResponsiveContainer width="100%" height={300}>
                        <LineChart data={fullClientConversionData.monthly}>
                          <CartesianGrid strokeDasharray="3 3" />
                          <XAxis 
                            dataKey="registration_month" 
                            tick={{ fontSize: 12 }}
                            tickFormatter={(value) => {
                              if (!value) return '';
                              const date = DateTime.fromISO(value, { zone: 'America/New_York' });
                              return date.isValid ? date.toFormat('LLL yyyy') : value;
                            }}
                          />
                          <YAxis 
                            tick={{ fontSize: 12 }}
                            domain={[0, 100]}
                            label={{ value: 'Conversion Rate (%)', angle: -90, position: 'insideLeft' }}
                          />
                          <Tooltip
                            formatter={(value) => `${parseFloat(value || 0).toFixed(1)}%`}
                            labelFormatter={(label) => {
                              if (!label) return '';
                              const date = DateTime.fromISO(label, { zone: 'America/New_York' });
                              return date.isValid ? date.toFormat('LLLL yyyy') : label;
                            }}
                          />
                          <Line
                            type="monotone"
                            dataKey="conversion_rate"
                            stroke="#26a69a"
                            strokeWidth={3}
                            dot={{ r: 5, fill: '#26a69a' }}
                            activeDot={{ r: 7 }}
                            name="Conversion Rate"
                          />
                        </LineChart>
                      </ResponsiveContainer>
                    </Box>
                  ) : null}

                  {/* Monthly Table */}
                  {Array.isArray(fullClientConversionData.monthly) && fullClientConversionData.monthly.length > 0 ? (
                    <Box sx={{ mb: 3 }}>
                      <Typography variant="subtitle1" sx={{ fontWeight: 600, mb: 1 }}>
                        Monthly Conversion Rate by Registration Month
                      </Typography>
                      <TableContainer sx={{ maxHeight: 400 }}>
                        <Table size="small" stickyHeader>
                          <TableHead>
                            <TableRow>
                              <TableCell>Registration Month</TableCell>
                              <TableCell align="right">Total Registrations</TableCell>
                              <TableCell align="right">Fully Converted</TableCell>
                              <TableCell align="right">Conversion Rate</TableCell>
                            </TableRow>
                          </TableHead>
                          <TableBody>
                            {fullClientConversionData.monthly
                              .slice()
                              .reverse() // Reverse to show most recent first
                              .map((month, idx) => {
                                // Fix date display - registration_month is now a date (YYYY-MM-DD)
                                let monthLabel = '—';
                                if (month.registration_month) {
                                  const dateStr = month.registration_month;
                                  // Parse as date string (YYYY-MM-DD) in ET timezone
                                  const date = DateTime.fromISO(dateStr, { zone: 'America/New_York' });
                                  monthLabel = date.isValid ? date.toFormat('LLLL yyyy') : dateStr;
                                }
                                
                                return (
                                  <TableRow key={idx}>
                                    <TableCell>{monthLabel}</TableCell>
                                    <TableCell align="right">{month.total_registrations || 0}</TableCell>
                                    <TableCell align="right">{month.fully_converted_registrations || 0}</TableCell>
                                    <TableCell align="right" sx={{ fontWeight: 600, color: 'success.main' }}>
                                      {month.conversion_rate !== undefined
                                        ? `${parseFloat(month.conversion_rate || 0).toFixed(1)}%`
                                        : '0.0%'}
                                    </TableCell>
                                  </TableRow>
                                );
                              })}
                          </TableBody>
                        </Table>
                      </TableContainer>
                    </Box>
                  ) : (
                    <Alert severity="info">No monthly data available for the selected period.</Alert>
                  )}
                </>
              ) : (
                <Alert severity="info">No data available for the selected criteria.</Alert>
              )}
            </>
          )}
        </DialogContent>
        <DialogActions sx={{ px: 3, py: 2 }}>
          <Button 
            onClick={() => {
              setFullClientConversionModalOpen(false);
            }}
          >
            Close
          </Button>
        </DialogActions>
      </Dialog>
      {/* AROAS Modal */}
      <Dialog
        open={aroasModalOpen}
        onClose={() => setAroasModalOpen(false)}
        maxWidth="lg"
        fullWidth
        fullScreen={isMdDown}
        disableScrollLock
        PaperProps={{
          sx: {
            maxHeight: { xs: '100vh', md: '90vh' },
            display: 'flex',
            flexDirection: 'column',
            m: { xs: 0, md: 3 },
            borderRadius: { xs: 0, md: 2 }
          }
        }}
      >
        <DialogTitle>
          <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <Typography variant="h6">
              Actual ROAS (AROAS) - Historical Trend
            </Typography>
            <IconButton onClick={() => setAroasModalOpen(false)} size="small">
              <XMarkIcon className="h-5 w-5" />
            </IconButton>
          </Box>
        </DialogTitle>
        <DialogContent dividers sx={{ flex: 1, overflowY: 'auto', px: { xs: 2, sm: 3 } }}>
          {aroasModalLoading ? (
            <Box sx={{ display: 'flex', justifyContent: 'center', alignItems: 'center', py: 4 }}>
              <CircularProgress />
            </Box>
          ) : error ? (
            <Alert severity="error" sx={{ mb: 2 }}>
              {error}
            </Alert>
          ) : aroasModalData ? (
            <>
              {/* Cohort Spotlight */}
              {aroasModalData.cohort && (() => {
                const cohort = aroasModalData.cohort;
                const hasTimeline = Array.isArray(cohort.timeline) && cohort.timeline.length > 0;
                const hasClients = Array.isArray(cohort.clients) && cohort.clients.length > 0;
                return (
                  <Box sx={{ mb: 4 }}>
                    <Typography variant="subtitle1" sx={{ mb: 1, fontWeight: 600 }}>
                      Cohort Spotlight: {cohort.label}
                    </Typography>
                    <Typography variant="body2" color="text.secondary" sx={{ mb: 2 }}>
                      Realized revenue journey for Meta-acquired families that started in {cohort.label}. Track how long this cohort takes to break even on ad spend and move into profitability.
                    </Typography>
                    <Grid container spacing={2} sx={{ mb: 3 }}>
                      <Grid item xs={12} sm={6} md={4} lg={3}>
                        <Paper sx={{ p: 2, height: '100%' }}>
                          <Typography variant="overline" display="block" color="text.secondary">
                            Meta Ad Spend
                          </Typography>
                          <Typography variant="h6" sx={{ fontWeight: 700 }}>
                            {formatCurrency(cohort.adSpend)}
                          </Typography>
                        </Paper>
                      </Grid>
                      <Grid item xs={12} sm={6} md={4} lg={3}>
                        <Paper sx={{ p: 2, height: '100%' }}>
                          <Typography variant="overline" display="block" color="text.secondary">
                            Realized Revenue To Date
                          </Typography>
                          <Typography variant="h6" sx={{ fontWeight: 700, color: 'success.main' }}>
                            {formatCurrency(cohort.totalRevenue)}
                          </Typography>
                        </Paper>
                      </Grid>
                      <Grid item xs={12} sm={6} md={4} lg={3}>
                        <Paper sx={{ p: 2, height: '100%' }}>
                          <Typography variant="overline" display="block" color="text.secondary">
                            Cohort AROAS
                          </Typography>
                          <Typography variant="h6" sx={{ fontWeight: 700, color: cohort.currentAroas >= 1 ? 'success.main' : 'warning.main' }}>
                            {cohort.currentAroas.toFixed(2)}x
                          </Typography>
                        </Paper>
                      </Grid>
                      <Grid item xs={12} sm={6} md={4} lg={3}>
                        <Paper sx={{ p: 2, height: '100%' }}>
                          <Typography variant="overline" display="block" color="text.secondary">
                            Clients Acquired
                          </Typography>
                          <Typography variant="h6" sx={{ fontWeight: 700 }}>
                            {cohort.clientCount}
                          </Typography>
                        </Paper>
                      </Grid>
                      <Grid item xs={12} sm={6} md={4} lg={3}>
                        <Paper sx={{ p: 2, height: '100%' }}>
                          <Typography variant="overline" display="block" color="text.secondary">
                            Break-Even Status
                          </Typography>
                          <Typography variant="h6" sx={{ fontWeight: 700, color: cohort.breakEvenMonth ? 'success.main' : 'text.secondary' }}>
                            {cohort.breakEvenMonth || 'Not yet'}
                          </Typography>
                          {cohort.breakEvenMonth && cohort.monthsToBreakEven != null && (
                            <Typography variant="caption" color="text.secondary">
                              Reached in {cohort.monthsToBreakEven} {cohort.monthsToBreakEven === 1 ? 'month' : 'months'}
                            </Typography>
                          )}
                        </Paper>
                      </Grid>
                      <Grid item xs={12} sm={6} md={4} lg={3}>
                        <Paper sx={{ p: 2, height: '100%' }}>
                          <Typography variant="overline" display="block" color="text.secondary">
                            Months Since Acquisition
                          </Typography>
                          <Typography variant="h6" sx={{ fontWeight: 700 }}>
                            {cohort.monthsSinceAcquisition}
                          </Typography>
                        </Paper>
                      </Grid>
                    </Grid>

                    <Box sx={{ mb: 3 }}>
                      <Typography variant="subtitle2" sx={{ mb: 1.5, fontWeight: 600 }}>
                        Revenue vs Meta Ad Spend (Cohort Cumulative)
                      </Typography>
                      {hasTimeline ? (
                        <ResponsiveContainer width="100%" height={320}>
                          <LineChart data={cohort.timeline} margin={{ top: 5, right: 30, left: 20, bottom: 5 }}>
                            <CartesianGrid strokeDasharray="3 3" />
                            <XAxis
                              dataKey="month"
                              angle={-45}
                              textAnchor="end"
                              height={70}
                            />
                            <YAxis
                              tickFormatter={(value) => `$${(value / 1000).toFixed(0)}k`}
                              label={{ value: 'Monthly Revenue ($)', angle: -90, position: 'insideLeft' }}
                            />
                            <Tooltip
                              formatter={(value, name) => {
                                if (name === 'Monthly Revenue') {
                                  return `$${parseFloat(value || 0).toLocaleString('en-US', { maximumFractionDigits: 0 })}`;
                                }
                                return `$${parseFloat(value || 0).toLocaleString('en-US', { maximumFractionDigits: 0 })}`;
                              }}
                              labelFormatter={(label) => `Month: ${label}`}
                              contentStyle={{ backgroundColor: 'rgba(255, 255, 255, 0.95)' }}
                            />
                            <Legend />
                            <Line
                              type="monotone"
                              dataKey="monthlyRevenue"
                              stroke="#26a69a"
                              strokeWidth={3}
                              name="Monthly Revenue"
                              dot={{ r: 4, fill: '#26a69a' }}
                              activeDot={{ r: 6 }}
                            />
                            <Line
                              type="monotone"
                              dataKey="adSpend"
                              stroke="#ef5350"
                              strokeWidth={2}
                              name="Meta Ad Spend"
                              dot={false}
                              strokeDasharray="5 3"
                            />
                          </LineChart>
                        </ResponsiveContainer>
                      ) : (
                        <Alert severity="info">
                          No realized revenue recorded yet for clients acquired in {cohort.label}.
                        </Alert>
                      )}
                    </Box>

                    <Typography variant="subtitle2" sx={{ mb: 1.5, fontWeight: 600 }}>
                      Cohort Clients
                    </Typography>
                    {hasClients ? (
                      <TableContainer sx={{ maxHeight: 320, overflowX: 'auto', mb: 2 }}>
                        <Table size="small" stickyHeader sx={{ minWidth: 900 }}>
                          <TableHead>
                            <TableRow>
                              <TableCell>Submission ID</TableCell>
                              <TableCell>Parent Name</TableCell>
                              <TableCell>Email</TableCell>
                              <TableCell>Booking Type</TableCell>
                              <TableCell align="right">Invoices</TableCell>
                              <TableCell align="right">Revenue</TableCell>
                              <TableCell>First Payment</TableCell>
                              <TableCell>Last Payment</TableCell>
                            </TableRow>
                          </TableHead>
                          <TableBody>
                            {cohort.clients.map((client, idx) => (
                              <TableRow key={`${client.submissionId}-${idx}`}>
                                <TableCell>
                                  {client.submissionId ? (
                                    <Link
                                      component="button"
                                      variant="body2"
                                      onClick={() => handleRealizedRevenueSubmissionClick(client.submissionId)}
                                      sx={{ cursor: 'pointer', color: 'primary.main', textDecoration: 'underline' }}
                                    >
                                      {client.submissionId}
                                    </Link>
                                  ) : '—'}
                                </TableCell>
                                <TableCell>{client.parentName}</TableCell>
                                <TableCell>{client.parentEmail}</TableCell>
                                <TableCell>{client.bookingType}</TableCell>
                                <TableCell align="right">{client.invoiceCount}</TableCell>
                                <TableCell align="right">{formatCurrency(client.totalRevenue)}</TableCell>
                                <TableCell>{client.firstPaymentDate ? DateTime.fromISO(client.firstPaymentDate).toFormat('LLL d, yyyy') : '—'}</TableCell>
                                <TableCell>{client.lastPaymentDate ? DateTime.fromISO(client.lastPaymentDate).toFormat('LLL d, yyyy') : '—'}</TableCell>
                              </TableRow>
                            ))}
                          </TableBody>
                        </Table>
                      </TableContainer>
                    ) : (
                      <Alert severity="info">
                        No Meta-acquired clients matched the cohort for {cohort.label}.
                      </Alert>
                    )}
                  </Box>
                );
              })()}

              {/* Summary Section */}
              {aroasModalData.summary && (
                <Box sx={{ mb: 4, p: 2, bgcolor: 'background.paper', borderRadius: 1, border: '1px solid', borderColor: 'divider' }}>
                  <Typography variant="subtitle1" sx={{ mb: 2, fontWeight: 600 }}>
                    Summary Metrics
                  </Typography>
                  <Grid container spacing={3}>
                    <Grid item xs={6} sm={3}>
                      <Typography variant="body2" color="text.secondary">Current AROAS</Typography>
                      <Typography variant="h6" sx={{ color: aroasModalData.summary.currentAroas >= 1.0 ? 'success.main' : 'error.main', fontWeight: 700 }}>
                        {aroasModalData.summary.currentAroas.toFixed(2)}x
                      </Typography>
                    </Grid>
                    <Grid item xs={6} sm={3}>
                      <Typography variant="body2" color="text.secondary">Month-over-Month</Typography>
                      <Typography variant="h6" sx={{ 
                        color: aroasModalData.summary.aroasChange >= 0 ? 'success.main' : 'error.main',
                        fontWeight: 700
                      }}>
                        {aroasModalData.summary.aroasChange >= 0 ? '+' : ''}{aroasModalData.summary.aroasChange.toFixed(1)}%
                      </Typography>
                    </Grid>
                    <Grid item xs={6} sm={3}>
                      <Typography variant="body2" color="text.secondary">Overall AROAS</Typography>
                      <Typography variant="h6" sx={{ fontWeight: 700 }}>
                        {aroasModalData.summary.overallAroas.toFixed(2)}x
                      </Typography>
                    </Grid>
                    <Grid item xs={6} sm={3}>
                      <Typography variant="body2" color="text.secondary">Total Realized Revenue</Typography>
                      <Typography variant="h6" sx={{ color: 'success.main', fontWeight: 700 }}>
                        ${aroasModalData.summary.totalRealizedRevenue.toLocaleString('en-US', { maximumFractionDigits: 0 })}
                      </Typography>
                    </Grid>
                    <Grid item xs={6} sm={3}>
                      <Typography variant="body2" color="text.secondary">Total Meta Ad Spend</Typography>
                      <Typography variant="h6">
                        ${aroasModalData.summary.totalAdSpend.toLocaleString('en-US', { maximumFractionDigits: 0 })}
                      </Typography>
                    </Grid>
                    <Grid item xs={6} sm={3}>
                      <Typography variant="body2" color="text.secondary">Break-Even Month</Typography>
                      <Typography variant="h6" sx={{ color: aroasModalData.summary.breakEvenMonth ? 'success.main' : 'text.secondary' }}>
                        {aroasModalData.summary.breakEvenMonth || 'Not yet'}
                      </Typography>
                    </Grid>
                    <Grid item xs={6} sm={3}>
                      <Typography variant="body2" color="text.secondary">Months Tracked</Typography>
                      <Typography variant="h6">
                        {aroasModalData.summary.monthsTracked}
                      </Typography>
                    </Grid>
                    <Grid item xs={6} sm={3}>
                      <Typography variant="body2" color="text.secondary">Net Return</Typography>
                      <Typography variant="h6" sx={{ 
                        color: (aroasModalData.summary.totalRealizedRevenue - aroasModalData.summary.totalAdSpend) >= 0 ? 'success.main' : 'error.main',
                        fontWeight: 700
                      }}>
                        ${(aroasModalData.summary.totalRealizedRevenue - aroasModalData.summary.totalAdSpend).toLocaleString('en-US', { maximumFractionDigits: 0 })}
                      </Typography>
                    </Grid>
                  </Grid>
                </Box>
              )}

              {/* AROAS Trend Chart */}
              {aroasModalData.monthly && aroasModalData.monthly.length > 0 ? (
                <Box sx={{ mb: 4 }}>
                  <Typography variant="subtitle1" sx={{ mb: 2, fontWeight: 600 }}>
                    AROAS Trend Over Time
                  </Typography>
                  <ResponsiveContainer width="100%" height={400}>
                    <LineChart data={aroasModalData.monthly} margin={{ top: 5, right: 30, left: 20, bottom: 5 }}>
                      <CartesianGrid strokeDasharray="3 3" />
                      <XAxis 
                        dataKey="month" 
                        angle={-45}
                        textAnchor="end"
                        height={80}
                      />
                      <YAxis 
                        domain={[0, 'dataMax']}
                        label={{ value: 'AROAS (x)', angle: -90, position: 'insideLeft' }}
                      />
                      <Tooltip 
                        formatter={(value, name) => {
                          if (name === 'AROAS') {
                            return `${parseFloat(value || 0).toFixed(2)}x`;
                          }
                          if (name === 'Realized Revenue' || name === 'Ad Spend') {
                            return `$${parseFloat(value || 0).toLocaleString('en-US', { maximumFractionDigits: 0 })}`;
                          }
                          return value;
                        }}
                        labelFormatter={(label) => `Month: ${label}`}
                        contentStyle={{ backgroundColor: 'rgba(255, 255, 255, 0.95)' }}
                      />
                      <Legend />
                      {/* Reference line at 1.0x for break-even */}
                      <Line 
                        type="monotone" 
                        dataKey="breakEven" 
                        stroke="#ff6b6b" 
                        strokeWidth={2} 
                        strokeDasharray="5 5" 
                        name="Break-Even (1.0x)"
                        dot={false}
                      />
                      <Line 
                        type="monotone" 
                        dataKey="aroas" 
                        stroke="#ff9800" 
                        strokeWidth={3} 
                        name="AROAS"
                        dot={{ r: 5, fill: '#ff9800' }}
                        activeDot={{ r: 7 }}
                      />
                    </LineChart>
                  </ResponsiveContainer>
                  <Typography variant="caption" color="text.secondary" sx={{ mt: 1, display: 'block', textAlign: 'center' }}>
                    AROAS = Realized Revenue from Meta-Acquired Clients ÷ Meta Ad Spend
                  </Typography>
                </Box>
              ) : (
                <Alert severity="info">No historical AROAS data available</Alert>
              )}

              {/* Supporting Charts: Revenue vs Ad Spend */}
              {aroasModalData.monthly && aroasModalData.monthly.length > 0 && (
                <Box sx={{ mb: 4 }}>
                  <Typography variant="subtitle1" sx={{ mb: 2, fontWeight: 600 }}>
                    Realized Revenue vs Meta Ad Spend
                  </Typography>
                  <ResponsiveContainer width="100%" height={350}>
                    <LineChart data={aroasModalData.monthly} margin={{ top: 5, right: 30, left: 20, bottom: 5 }}>
                      <CartesianGrid strokeDasharray="3 3" />
                      <XAxis 
                        dataKey="month" 
                        angle={-45}
                        textAnchor="end"
                        height={80}
                      />
                      <YAxis 
                        yAxisId="left"
                        tickFormatter={(value) => `$${(value / 1000).toFixed(0)}k`}
                        label={{ value: 'Revenue / Spend ($)', angle: -90, position: 'insideLeft' }}
                      />
                      <Tooltip 
                        formatter={(value) => `$${parseFloat(value || 0).toLocaleString('en-US', { maximumFractionDigits: 0 })}`}
                        labelFormatter={(label) => `Month: ${label}`}
                        contentStyle={{ backgroundColor: 'rgba(255, 255, 255, 0.95)' }}
                      />
                      <Legend />
                      <Line 
                        yAxisId="left"
                        type="monotone" 
                        dataKey="realizedRevenue" 
                        stroke="#26a69a" 
                        strokeWidth={2} 
                        name="Realized Revenue"
                        dot={{ r: 4 }}
                      />
                      <Line 
                        yAxisId="left"
                        type="monotone" 
                        dataKey="adSpend" 
                        stroke="#ef5350" 
                        strokeWidth={2} 
                        name="Meta Ad Spend"
                        dot={{ r: 4 }}
                      />
                    </LineChart>
                  </ResponsiveContainer>
                  <Typography variant="caption" color="text.secondary" sx={{ mt: 1, display: 'block', textAlign: 'center' }}>
                    When the green line (Realized Revenue) crosses above the red line (Ad Spend), you've reached break-even
                  </Typography>
                </Box>
              )}
              {/* Monthly Breakdown Table */}
              {aroasModalData.monthly && aroasModalData.monthly.length > 0 && (
                <Box>
                  <Typography variant="subtitle1" sx={{ mb: 2, fontWeight: 600 }}>
                    Monthly Breakdown
                  </Typography>
                  <TableContainer sx={{ maxHeight: 400, overflow: 'auto' }}>
                    <Table size="small" stickyHeader>
                      <TableHead>
                        <TableRow>
                          <TableCell>Month</TableCell>
                          <TableCell align="right">Realized Revenue</TableCell>
                          <TableCell align="right">Meta Ad Spend</TableCell>
                          <TableCell align="right">AROAS</TableCell>
                          <TableCell align="right">Active Clients</TableCell>
                          <TableCell align="right">Cumulative Revenue</TableCell>
                        </TableRow>
                      </TableHead>
                      <TableBody>
                        {aroasModalData.monthly.map((month, idx) => (
                          <TableRow 
                            key={idx}
                            sx={{
                              bgcolor: aroasModalData.cohort && month.month === aroasModalData.cohort.label
                                ? 'info.50'
                                : month.aroas >= 1.0
                                  ? 'success.50'
                                  : month.aroas >= 0.5
                                    ? 'warning.50'
                                    : 'transparent'
                            }}
                          >
                            <TableCell>{month.month}</TableCell>
                            <TableCell align="right">
                              ${month.realizedRevenue.toLocaleString('en-US', { maximumFractionDigits: 0 })}
                            </TableCell>
                            <TableCell align="right">
                              ${month.adSpend.toLocaleString('en-US', { maximumFractionDigits: 0 })}
                            </TableCell>
                            <TableCell align="right">
                              <Typography 
                                sx={{ 
                                  fontWeight: 600,
                                  color: month.aroas >= 1.0 ? 'success.main' : month.aroas >= 0.5 ? 'warning.main' : 'error.main'
                                }}
                              >
                                {month.aroas.toFixed(2)}x
                              </Typography>
                            </TableCell>
                            <TableCell align="right">{month.activeClients}</TableCell>
                            <TableCell align="right">
                              ${month.cumulativeRevenue.toLocaleString('en-US', { maximumFractionDigits: 0 })}
                            </TableCell>
                          </TableRow>
                        ))}
                      </TableBody>
                    </Table>
                  </TableContainer>
                </Box>
              )}
            </>
          ) : (
            <Alert severity="info">No data available</Alert>
          )}
        </DialogContent>
        <DialogActions sx={{ px: 3, py: 2 }}>
          <Button onClick={() => setAroasModalOpen(false)}>
            Close
          </Button>
        </DialogActions>
      </Dialog>

      {/* False Starts Modal */}
      <Dialog
        open={falseStartsModalOpen}
        onClose={() => {
          setFalseStartsModalOpen(false);
          setFalseStartsDetailView(false);
          setFalseStartsDetailData(null);
        }}
        maxWidth="lg"
        fullWidth
        fullScreen={isMdDown}
        disableScrollLock
        PaperProps={{
          sx: {
            maxHeight: { xs: '100vh', md: '90vh' },
            display: 'flex',
            flexDirection: 'column',
            m: { xs: 0, md: 3 },
            borderRadius: { xs: 0, md: 2 }
          }
        }}
      >
        <DialogTitle>
          <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <Typography variant="h6">
              False Starts - Dormant Trial Clients
            </Typography>
            <IconButton onClick={() => {
              setFalseStartsModalOpen(false);
              setFalseStartsDetailView(false);
              setFalseStartsDetailData(null);
            }} size="small">
              <XMarkIcon className="h-5 w-5" />
            </IconButton>
          </Box>
        </DialogTitle>
        <DialogContent
          dividers
          sx={{
            flex: 1,
            display: 'flex',
            flexDirection: 'column',
            overflowY: 'auto',
            px: { xs: 2, sm: 3 }
          }}
        >
          {falseStartsDetailView ? (
            // Submission Detail View
            falseStartsDetailLoading ? (
              <Box display="flex" justifyContent="center" alignItems="center" minHeight="200px">
                <CircularProgress />
              </Box>
            ) : falseStartsDetailData ? (
              <Box sx={{ ...detailScrollSx, pr: { xs: 0, sm: 1 } }}>
                {/* Parent Info */}
                <Paper sx={{ p: 2, mb: 2 }}>
                  <Typography variant="h6" gutterBottom>Parent Info</Typography>
                  <Grid container spacing={2}>
                    <Grid item xs={6}>
                      <Typography variant="body2" color="text.secondary">TutorCruncher ID:</Typography>
                      {falseStartsDetailData.tcClientId ? (
                        <Link href={`https://account.acmeops.com/clients/${falseStartsDetailData.tcClientId}/`} target="_blank">
                          {falseStartsDetailData.tcClientId}
                        </Link>
                      ) : (
                        <Typography variant="body2">—</Typography>
                      )}
                    </Grid>
                    <Grid item xs={6}>
                      <Typography variant="body2" color="text.secondary">Name:</Typography>
                      <Typography variant="body2">{falseStartsDetailData.parentFirst} {falseStartsDetailData.parentLast}</Typography>
                    </Grid>
                    <Grid item xs={6}>
                      <Typography variant="body2" color="text.secondary">Email:</Typography>
                      <Typography variant="body2">{falseStartsDetailData.parentEmail}</Typography>
                    </Grid>
                    <Grid item xs={6}>
                      <Typography variant="body2" color="text.secondary">Phone:</Typography>
                      <Typography variant="body2">{falseStartsDetailData.parentPhone || '—'}</Typography>
                    </Grid>
                  </Grid>
                </Paper>

                {/* Booking & Pricing */}
                <Paper sx={{ p: 2, mb: 2 }}>
                  <Typography variant="h6" gutterBottom>Booking & Pricing</Typography>
                  <Grid container spacing={2}>
                    <Grid item xs={6}>
                      <Typography variant="body2" color="text.secondary">Booking Type:</Typography>
                      <Typography variant="body2">{falseStartsDetailData.bookingType || '—'}</Typography>
                    </Grid>
                    <Grid item xs={6}>
                      <Typography variant="body2" color="text.secondary">Status:</Typography>
                      <Typography variant="body2">{falseStartsDetailData.paymentStatus || '—'}</Typography>
                    </Grid>
                    <Grid item xs={6}>
                      <Typography variant="body2" color="text.secondary">Actual Price:</Typography>
                      <Typography variant="body2">{formatCurrency(falseStartsDetailData.actualPrice || 0)}</Typography>
                    </Grid>
                    <Grid item xs={6}>
                      <Typography variant="body2" color="text.secondary">Created At:</Typography>
                      <Typography variant="body2">{formatDate(falseStartsDetailData.createdAt)}</Typography>
                    </Grid>
                  </Grid>
                </Paper>

                {/* Students */}
                {falseStartsDetailData.students && falseStartsDetailData.students.length > 0 && (
                  <Paper sx={{ p: 2, mb: 2 }}>
                    <Typography variant="h6" gutterBottom>Students</Typography>
                    <TableContainer>
                      <Table size="small">
                        <TableHead>
                          <TableRow>
                            <TableCell>First Name</TableCell>
                            <TableCell>Last Name</TableCell>
                            <TableCell>Age</TableCell>
                          </TableRow>
                        </TableHead>
                        <TableBody>
                          {falseStartsDetailData.students.map((student, idx) => (
                            <TableRow key={idx}>
                              <TableCell>{student.first || '—'}</TableCell>
                              <TableCell>{student.last || '—'}</TableCell>
                              <TableCell>{student.dob ? getAge(student.dob) : '—'}</TableCell>
                            </TableRow>
                          ))}
                        </TableBody>
                      </Table>
                    </TableContainer>
                  </Paper>
                )}

                {/* UTM Data */}
                {(() => {
                  const utmData = getUtmFromDetail(falseStartsDetailData);
                  return utmData && Object.keys(utmData).length > 0 ? (
                    <Paper sx={{ p: 2, mb: 2 }}>
                      <Typography variant="h6" gutterBottom>UTM Parameters</Typography>
                      <Grid container spacing={2}>
                        {Object.entries(utmData).map(([key, value]) => (
                          <Grid item xs={6} key={key}>
                            <Typography variant="body2" color="text.secondary">{utmKeyLabel(key)}:</Typography>
                            <Typography variant="body2">{value || '—'}</Typography>
                          </Grid>
                        ))}
                      </Grid>
                    </Paper>
                  ) : null;
                })()}

                {/* Address */}
                {falseStartsDetailData.address && (
                  <Paper sx={{ p: 2, mb: 2 }}>
                    <Typography variant="h6" gutterBottom>Address</Typography>
                    <Typography variant="body2">
                      {[
                        falseStartsDetailData.address.street,
                        falseStartsDetailData.address.city,
                        falseStartsDetailData.address.state,
                        falseStartsDetailData.address.zip,
                        falseStartsDetailData.address.country
                      ].filter(Boolean).join(', ') || '—'}
                    </Typography>
                  </Paper>
                )}

                <Box sx={{ mt: 2 }}>
                  <Button onClick={handleBackToFalseStarts} variant="outlined">
                    Back to False Starts List
                  </Button>
                </Box>
              </Box>
            ) : (
              <Typography color="text.secondary">Failed to load submission details</Typography>
            )
          ) : falseStartsLoading ? (
            <Box sx={{ display: 'flex', justifyContent: 'center', alignItems: 'center', py: 4 }}>
              <CircularProgress />
            </Box>
          ) : error ? (
            <Alert severity="error" sx={{ mb: 2 }}>
              {error}
            </Alert>
          ) : (
            <>
              {falseStartsData ? (
                <>
                  <Grid container spacing={2} sx={{ mb: 3 }}>
                    <Grid item xs={12} sm={6} md={3}>
                      <Paper sx={{ p: 2 }}>
                        <Typography variant="overline" display="block" color="text.secondary">
                          Total False Starts
                        </Typography>
                        <Typography variant="h5" sx={{ fontWeight: 700 }}>
                          {falseStartsData.summary?.total_false_starts ?? 0}
                        </Typography>
                      </Paper>
                    </Grid>
                    <Grid item xs={12} sm={6} md={3}>
                      <Paper sx={{ p: 2 }}>
                        <Typography variant="overline" display="block" color="text.secondary">
                          Dormant Clients
                        </Typography>
                        <Typography variant="h5" sx={{ fontWeight: 700, color: 'warning.main' }}>
                          {falseStartsData.summary?.dormant_clients ?? 0}
                        </Typography>
                      </Paper>
                    </Grid>
                    <Grid item xs={12} sm={6} md={3}>
                      <Paper sx={{ p: 2 }}>
                        <Typography variant="overline" display="block" color="text.secondary">
                          Total Meta Registrations
                        </Typography>
                        <Typography variant="h5" sx={{ fontWeight: 700 }}>
                          {falseStartsData.summary?.total_meta_registrations ?? 0}
                        </Typography>
                      </Paper>
                    </Grid>
                    <Grid item xs={12} sm={6} md={3}>
                      <Paper sx={{ p: 2 }}>
                        <Typography variant="overline" display="block" color="text.secondary">
                          False Start Percentage
                        </Typography>
                        <Typography variant="h5" sx={{ fontWeight: 700, color: 'error.main' }}>
                          {falseStartsData.summary?.false_start_percentage 
                            ? `${falseStartsData.summary.false_start_percentage}%`
                            : '0%'}
                        </Typography>
                      </Paper>
                    </Grid>
                  </Grid>

                  <Typography variant="subtitle1" sx={{ fontWeight: 600, mb: 1 }}>
                    False Start Clients Detail
                  </Typography>
                  {Array.isArray(falseStartsData.clients) && falseStartsData.clients.length > 0 ? (
                    <TableContainer sx={{ maxHeight: '60vh', overflowX: 'auto' }}>
                      <Table size="small" stickyHeader sx={{ minWidth: 900 }}>
                        <TableHead>
                          <TableRow>
                            <TableCell>Submission ID</TableCell>
                            <TableCell>Acquisition Date</TableCell>
                            <TableCell>Parent Name</TableCell>
                            <TableCell>Email</TableCell>
                            <TableCell>Booking Type</TableCell>
                            <TableCell>Label</TableCell>
                            <TableCell>UTM Campaign</TableCell>
                            <TableCell>Client Status</TableCell>
                            <TableCell>TutorCruncher ID</TableCell>
                          </TableRow>
                        </TableHead>
                        <TableBody>
                          {falseStartsData.clients.map((client, idx) => (
                            <TableRow key={client.submission_id || idx} hover>
                              <TableCell>
                                <Link
                                  component="button"
                                  variant="body2"
                                  onClick={() => handleFalseStartsSubmissionClick(client.submission_id)}
                                  sx={{
                                    cursor: 'pointer',
                                    color: 'primary.main',
                                    textDecoration: 'underline',
                                    '&:hover': { color: 'primary.dark' }
                                  }}
                                >
                                  {client.submission_id}
                                </Link>
                              </TableCell>
                              <TableCell>{client.acquisition_date ? DateTime.fromISO(client.acquisition_date).toFormat('LLL d, yyyy') : '—'}</TableCell>
                              <TableCell>{client.parent_name || '—'}</TableCell>
                              <TableCell>{client.parent_email || '—'}</TableCell>
                              <TableCell>{client.booking_type || '—'}</TableCell>
                              <TableCell>{client.label_name || '—'}</TableCell>
                              <TableCell>{client.utm_campaign || '—'}</TableCell>
                              <TableCell>
                                <Chip 
                                  label={client.client_status || 'Unknown'} 
                                  size="small" 
                                  color={client.client_status === 'dormant' ? 'warning' : 'default'}
                                />
                              </TableCell>
                              <TableCell>
                                {client.tc_client_id ? (
                                  <Link 
                                    href={`https://account.acmeops.com/clients/${client.tc_client_id}/`} 
                                    target="_blank"
                                    sx={{ color: 'primary.main' }}
                                  >
                                    {client.tc_client_id}
                                  </Link>
                                ) : '—'}
                              </TableCell>
                            </TableRow>
                          ))}
                        </TableBody>
                      </Table>
                    </TableContainer>
                  ) : (
                    <Alert severity="info">No false starts found for the selected criteria.</Alert>
                  )}
                </>
              ) : (
                <Alert severity="info">No false starts data available.</Alert>
              )}
            </>
          )}
        </DialogContent>
        <DialogActions sx={{ px: 3, py: 2 }}>
          <Button 
            onClick={() => {
              setFalseStartsModalOpen(false);
              setFalseStartsDetailView(false);
              setFalseStartsDetailData(null);
            }}
          >
            Close
          </Button>
        </DialogActions>
      </Dialog>

      {/* Configuration Modal */}
      <Dialog
        open={ltvConfigOpen}
        onClose={() => {
          setLtvConfigOpen(false);
          setConfigTab(0); // Reset to first tab when closing
        }}
        maxWidth="md"
        fullWidth
        fullScreen={isMdDown}
        disableScrollLock
        PaperProps={{
          sx: {
            maxHeight: { xs: '100vh', md: '90vh' },
            display: 'flex',
            flexDirection: 'column',
            m: { xs: 0, md: 3 },
            borderRadius: { xs: 0, md: 2 }
          }
        }}
      >
        <DialogTitle>
          <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <Typography variant="h6" fontWeight="bold">
              Marketing Analytics Configuration
            </Typography>
            <IconButton onClick={() => {
              setLtvConfigOpen(false);
              setConfigTab(0);
            }} size="small">
              <XMarkIcon className="h-5 w-5" />
            </IconButton>
          </Box>
        </DialogTitle>

        {/* Tabs */}
        <Box sx={{ borderBottom: 1, borderColor: 'divider', px: { xs: 2, sm: 3 } }}>
          <Tabs value={configTab} onChange={(e, newValue) => setConfigTab(newValue)}>
            <Tab label="Metric Visibility" />
            <Tab label="ROAS Configuration" />
          </Tabs>
        </Box>

        <DialogContent sx={{ flex: 1, overflowY: 'auto', px: { xs: 2, sm: 3 } }}>
          {/* Tab 1: Metric Visibility */}
          {configTab === 0 && (
            <Box sx={{ mt: 2 }}>
              <Typography variant="body2" color="text.secondary" sx={{ mb: 3 }}>
                Toggle visibility of metric cards on the marketing analytics page. Cards are grouped in the same order as displayed on the page.
              </Typography>

              {/* Overall Metrics Section */}
              <Box sx={{ mb: 4 }}>
                <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mb: 2, pb: 1, borderBottom: '2px solid', borderColor: 'primary.main' }}>
                  <Typography variant="subtitle1" fontWeight="bold">
                    Overall Metrics
                  </Typography>
                  <FormControlLabel
                    control={
                      <Switch
                        checked={metricCategories.overall.metrics.every(metric => visibleMetrics[metric])}
                        onChange={() => handleCategoryToggle('overall')}
                        size="small"
                      />
                    }
                    label={
                      <Typography variant="caption" sx={{ fontSize: '0.75rem' }}>
                        Toggle All
                      </Typography>
                    }
                    sx={{ m: 0 }}
                  />
                </Box>
                <Box sx={{ display: 'flex', flexDirection: 'column', gap: 1.5 }}>
                  {metricCategories.overall.metrics.map(metricKey => (
                    <Box key={metricKey} sx={{ pl: 1 }}>
                      <FormControlLabel
                        control={
                          <Switch
                            checked={visibleMetrics[metricKey] || false}
                            onChange={() => handleMetricVisibilityToggle(metricKey)}
                            size="small"
                          />
                        }
                        label={
                          <Box>
                            <Typography variant="body2" fontWeight="medium">
                              {metricDisplayNames[metricKey] || metricKey.split('_').map(w => w.charAt(0).toUpperCase() + w.slice(1)).join(' ')}
                            </Typography>
                            <Typography variant="caption" color="text.secondary" sx={{ fontSize: '0.7rem', display: 'block', mt: 0.25 }}>
                              {metricDescriptions[metricKey]}
                            </Typography>
                          </Box>
                        }
                        sx={{ alignItems: 'flex-start' }}
                      />
                    </Box>
                  ))}
                </Box>
              </Box>
              {/* Meta Ads Performance Section */}
              <Box sx={{ mb: 4 }}>
                <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mb: 2, pb: 1, borderBottom: '2px solid', borderColor: 'secondary.main' }}>
                  <Typography variant="subtitle1" fontWeight="bold">
                    Meta Ads Performance
                  </Typography>
                  <FormControlLabel
                    control={
                      <Switch
                        checked={metricCategories.meta_ads.metrics.every(metric => visibleMetrics[metric])}
                        onChange={() => handleCategoryToggle('meta_ads')}
                        size="small"
                      />
                    }
                    label={
                      <Typography variant="caption" sx={{ fontSize: '0.75rem' }}>
                        Toggle All
                      </Typography>
                    }
                    sx={{ m: 0 }}
                  />
                </Box>
                <Box sx={{ display: 'flex', flexDirection: 'column', gap: 1.5 }}>
                  {metricCategories.meta_ads.metrics.map(metricKey => (
                    <Box key={metricKey} sx={{ pl: 1 }}>
                      <FormControlLabel
                        control={
                          <Switch
                            checked={visibleMetrics[metricKey] || false}
                            onChange={() => handleMetricVisibilityToggle(metricKey)}
                            size="small"
                          />
                        }
                        label={
                          <Box>
                            <Typography variant="body2" fontWeight="medium">
                              {metricDisplayNames[metricKey] || metricKey.split('_').map(w => w.charAt(0).toUpperCase() + w.slice(1)).join(' ')}
                            </Typography>
                            <Typography variant="caption" color="text.secondary" sx={{ fontSize: '0.7rem', display: 'block', mt: 0.25 }}>
                              {metricDescriptions[metricKey]}
                            </Typography>
                          </Box>
                        }
                        sx={{ alignItems: 'flex-start' }}
                      />
                    </Box>
                  ))}
                </Box>
              </Box>

              {/* Meta Ad Performance KPIs Section */}
              <Box sx={{ mb: 4 }}>
                <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mb: 2, pb: 1, borderBottom: '2px solid', borderColor: 'info.main' }}>
                  <Typography variant="subtitle1" fontWeight="bold">
                    Meta Ad Performance KPIs
                  </Typography>
                  <FormControlLabel
                    control={
                      <Switch
                        checked={metricCategories.meta_kpis.metrics.every(metric => visibleMetrics[metric])}
                        onChange={() => handleCategoryToggle('meta_kpis')}
                        size="small"
                      />
                    }
                    label={
                      <Typography variant="caption" sx={{ fontSize: '0.75rem' }}>
                        Toggle All
                      </Typography>
                    }
                    sx={{ m: 0 }}
                  />
                </Box>
                <Box sx={{ display: 'flex', flexDirection: 'column', gap: 1.5 }}>
                  {metricCategories.meta_kpis.metrics.map(metricKey => (
                    <Box key={metricKey} sx={{ pl: 1 }}>
                      <FormControlLabel
                        control={
                          <Switch
                            checked={visibleMetrics[metricKey] || false}
                            onChange={() => handleMetricVisibilityToggle(metricKey)}
                            size="small"
                          />
                        }
                        label={
                          <Box>
                            <Typography variant="body2" fontWeight="medium">
                              {metricDisplayNames[metricKey] || metricKey.split('_').map(w => w.charAt(0).toUpperCase() + w.slice(1)).join(' ')}
                            </Typography>
                            <Typography variant="caption" color="text.secondary" sx={{ fontSize: '0.7rem', display: 'block', mt: 0.25 }}>
                              {metricDescriptions[metricKey]}
                            </Typography>
                          </Box>
                        }
                        sx={{ alignItems: 'flex-start' }}
                      />
                    </Box>
                  ))}
                </Box>
              </Box>

              {/* Enterprise Analytics Sections */}
              <Box sx={{ mb: 4 }}>
                <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mb: 2, pb: 1, borderBottom: '2px solid', borderColor: 'success.main' }}>
                  <Typography variant="subtitle1" fontWeight="bold">
                    Enterprise Analytics Sections
                  </Typography>
                  <FormControlLabel
                    control={
                      <Switch
                        checked={metricCategories.enterprise.metrics.every(metric => visibleMetrics[metric])}
                        onChange={() => handleCategoryToggle('enterprise')}
                        size="small"
                      />
                    }
                    label={
                      <Typography variant="caption" sx={{ fontSize: '0.75rem' }}>
                        Toggle All
                      </Typography>
                    }
                    sx={{ m: 0 }}
                  />
                </Box>
                <Box sx={{ display: 'flex', flexDirection: 'column', gap: 1.5 }}>
                  {metricCategories.enterprise.metrics.map(metricKey => (
                    <Box key={metricKey} sx={{ pl: 1 }}>
                      <FormControlLabel
                        control={
                          <Switch
                            checked={visibleMetrics[metricKey] || false}
                            onChange={() => handleMetricVisibilityToggle(metricKey)}
                            size="small"
                          />
                        }
                        label={
                          <Box>
                            <Typography variant="body2" fontWeight="medium">
                              {metricDisplayNames[metricKey] || metricKey.split('_').map(w => w.charAt(0).toUpperCase() + w.slice(1)).join(' ')}
                            </Typography>
                            <Typography variant="caption" color="text.secondary" sx={{ fontSize: '0.7rem', display: 'block', mt: 0.25 }}>
                              {metricDescriptions[metricKey]}
                            </Typography>
                          </Box>
                        }
                        sx={{ alignItems: 'flex-start' }}
                      />
                    </Box>
                  ))}
                </Box>
              </Box>
            </Box>
          )}

          {/* Tab 2: ROAS Configuration */}
          {configTab === 1 && (
            <Box sx={{ mt: 2 }}>
          <Typography variant="body2" color="text.secondary" sx={{ mb: 3 }}>
            Choose how to calculate Lifetime Value (LTV) for ROAS calculations. This affects all Meta KPIs including ROAS, CPL, and CPR.
          </Typography>

          <Box sx={{ mb: 3 }}>
            <FormControlLabel
              control={
                <Switch
                  checked={ltvMetric === 'median'}
                  onChange={(e) => {
                    const newMetric = e.target.checked ? 'median' : 'average';
                    setLtvMetric(newMetric);
                        try {
                          if (typeof window !== 'undefined' && window.localStorage) {
                    localStorage.setItem('ltvMetric', newMetric);
                          }
                        } catch (storageError) {
                          console.warn('Error saving LTV metric:', storageError);
                        }
                  }}
                />
              }
              label={
                <Box>
                  <Typography variant="body1" fontWeight="bold">
                    Use Median LTV
                  </Typography>
                  <Typography variant="body2" color="text.secondary">
                    {ltvMetric === 'median' 
                      ? 'Currently using Median LTV (more conservative, less affected by outliers)'
                      : 'Currently using Average LTV (includes all clients, may be skewed by high-value clients)'}
                  </Typography>
                </Box>
              }
            />
          </Box>

          {ltvLoading ? (
            <Box sx={{ display: 'flex', justifyContent: 'center', py: 4 }}>
              <CircularProgress />
            </Box>
          ) : ltvByLabel ? (
            <Box>
              <Typography variant="subtitle1" fontWeight="bold" sx={{ mb: 2 }}>
                LTV by Booking Form Label
              </Typography>
              <TableContainer component={Paper} variant="outlined">
                <Table>
                  <TableHead>
                    <TableRow>
                      <TableCell>Booking Form Label</TableCell>
                      <TableCell align="right">Average LTV</TableCell>
                      <TableCell align="right">Median LTV</TableCell>
                      <TableCell align="center">Current Selection</TableCell>
                    </TableRow>
                  </TableHead>
                  <TableBody>
                    {Object.entries(ltvByLabel).map(([label, data]) => (
                      <TableRow key={label}>
                        <TableCell>{label}</TableCell>
                            <TableCell align="right">{formatCurrency(data.average || 0)}</TableCell>
                            <TableCell align="right">{formatCurrency(data.median || 0)}</TableCell>
                        <TableCell align="center">
                          <Chip
                            label={ltvMetric === 'median' ? 'Median' : 'Average'}
                            color={ltvMetric === 'median' ? 'primary' : 'default'}
                            size="small"
                          />
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </TableContainer>
              
              {ltvByLabel && Object.keys(ltvByLabel).length > 0 && (
                <Box sx={{ mt: 3, p: 2, bgcolor: 'info.light', borderRadius: 1 }}>
                  <Typography variant="body2" fontWeight="bold" gutterBottom>
                    Note:
                  </Typography>
                  <Typography variant="body2">
                    When you change the LTV metric, all ROAS calculations will automatically update. 
                    The selected metric ({ltvMetric === 'median' ? 'Median' : 'Average'}) will be used 
                    for all booking form labels shown above.
                  </Typography>
                </Box>
              )}
            </Box>
          ) : (
            <Alert severity="info">No LTV data available</Alert>
              )}
            </Box>
          )}
        </DialogContent>
        <DialogActions sx={{ px: 3, py: 2 }}>
          <Button
            onClick={() => {
            setLtvConfigOpen(false);
            setConfigTab(0);
            }}
            variant="contained"
          >
            Close
          </Button>
        </DialogActions>
      </Dialog>
    </Box>
  );
}

export default BookingFormAnalytics;