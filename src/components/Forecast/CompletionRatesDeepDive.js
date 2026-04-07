import React, { useState, useEffect, useCallback } from 'react';
import { DateTime } from 'luxon';
import { formatCurrency } from '../../utils/formatters';
import {
  XMarkIcon,
  ArrowTrendingUpIcon,
  ArrowTrendingDownIcon,
  UserIcon,
  UsersIcon,
  MapPinIcon,
  ChartBarIcon,
  CalculatorIcon,
  ExclamationTriangleIcon,
  TableCellsIcon,
  SparklesIcon,
  CalendarDaysIcon,
  SunIcon,
} from '@heroicons/react/24/outline';
import {
  LineChart,
  Line,
  XAxis,
  YAxis,
  Tooltip,
  ResponsiveContainer,
  CartesianGrid,
  Legend,
  ReferenceLine,
  ReferenceArea,
  ComposedChart,
} from 'recharts';

function classNames(...classes) {
  return classes.filter(Boolean).join(' ');
}

// Tab options for different views
const DIMENSION_TABS = [
  { id: 'channel', label: 'By Channel', icon: ChartBarIcon },
  { id: 'tutor', label: 'By Tutor', icon: UserIcon },
  { id: 'client', label: 'By Client', icon: UsersIcon },
  { id: 'market', label: 'By Market', icon: MapPinIcon },
];

// Lookback period options
const LOOKBACK_OPTIONS = [
  { value: 30, label: '30 days' },
  { value: 60, label: '60 days' },
  { value: 90, label: '90 days' },
  { value: 180, label: '6 months' },
];

// View mode options
const VIEW_MODES = [
  { id: 'table', label: 'Table', icon: TableCellsIcon },
  { id: 'trends', label: 'Trends', icon: ArrowTrendingUpIcon },
  { id: 'anomalies', label: 'Anomalies', icon: ExclamationTriangleIcon },
  { id: 'holidays', label: 'Holidays', icon: CalendarDaysIcon },
];

// Granularity options for trend view
const GRANULARITY_OPTIONS = [
  { value: 'week', label: 'Weekly' },
  { value: 'month', label: 'Monthly' },
];

// Custom tooltip for trend chart
const TrendTooltip = ({ active, payload, label }) => {
  if (!active || !payload || payload.length === 0) return null;

  return (
    <div className="bg-white border border-neutral-200 rounded-lg shadow-lg p-3 min-w-[180px]">
      <p className="font-semibold text-neutral-800 mb-2 border-b border-neutral-200 pb-1">{label}</p>
      <div className="space-y-1.5">
        {payload.map((entry, index) => (
          <div key={index} className="flex items-center justify-between gap-3">
            <div className="flex items-center gap-2">
              <div
                className="w-3 h-3 rounded"
                style={{ backgroundColor: entry.color }}
              />
              <span className="text-sm text-neutral-600">{entry.name}</span>
            </div>
            <span className="text-sm font-semibold text-neutral-800">
              {(entry.value * 100).toFixed(1)}%
            </span>
          </div>
        ))}
      </div>
    </div>
  );
};

// Format period label for chart
function formatPeriodLabel(dateISO, granularity) {
  const d = new Date(dateISO);
  const monthNames = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

  if (granularity === 'week') {
    const month = monthNames[d.getUTCMonth()];
    const day = d.getUTCDate();
    return `${month} ${day}`;
  }
  const month = monthNames[d.getUTCMonth()];
  const year = d.getUTCFullYear().toString().slice(-2);
  return `${month} '${year}`;
}

/**
 * CompletionRatesDeepDive - Modal component for analyzing completion rates
 * Entry point: Click on "Realistic scenario applies historical completion rates:" in ForecastDashboard
 */
export default function CompletionRatesDeepDive({ isOpen, onClose }) {
  const [activeDimension, setActiveDimension] = useState('channel');
  const [lookbackDays, setLookbackDays] = useState(90);
  const [minAppointments, setMinAppointments] = useState(10);
  const [loading, setLoading] = useState(false);
  const [data, setData] = useState(null);
  const [error, setError] = useState(null);

  // View mode state
  const [viewMode, setViewMode] = useState('table');
  const [granularity, setGranularity] = useState('week');
  const [trendData, setTrendData] = useState(null);
  const [trendLoading, setTrendLoading] = useState(false);
  const [selectedTrendItem, setSelectedTrendItem] = useState(null);

  // Computed anomalies state
  const [computedAnomalies, setComputedAnomalies] = useState(null);
  const [anomaliesLoading, setAnomaliesLoading] = useState(false);
  const [anomalyFilter, setAnomalyFilter] = useState('all');

  // AI Analysis state
  const [aiStatus, setAiStatus] = useState(null);
  const [aiLoading, setAiLoading] = useState(false);
  const [aiResult, setAiResult] = useState(null);
  const [showAiResult, setShowAiResult] = useState(false);
  const [aiAnalysisType, setAiAnalysisType] = useState(null);

  // Holidays state
  const [holidayData, setHolidayData] = useState(null);
  const [holidayLoading, setHolidayLoading] = useState(false);
  const [holidayMarketFilter, setHolidayMarketFilter] = useState('all');
  const [holidayTimeView, setHolidayTimeView] = useState('upcoming'); // 'upcoming' | 'past'

  // Revenue impact calculator state
  const [showCalculator, setShowCalculator] = useState(false);
  const [selectedItem, setSelectedItem] = useState(null);
  const [targetRate, setTargetRate] = useState(0.95);
  const [impactResult, setImpactResult] = useState(null);
  const [calculatingImpact, setCalculatingImpact] = useState(false);

  // Fetch completion rates data
  const fetchData = useCallback(async () => {
    setLoading(true);
    setError(null);

    try {

      const params = new URLSearchParams({
        dimension: activeDimension,
        lookback_days: lookbackDays.toString(),
        min_appointments: minAppointments.toString(),
      });

      const response = await fetch(`/api/forecast/completion-rates?${params}`, {
        credentials: 'include',
      });

      if (!response.ok) throw new Error(`HTTP ${response.status}`);
      const result = await response.json();
      setData(result);
    } catch (err) {
      console.error('Failed to fetch completion rates:', err);
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }, [activeDimension, lookbackDays, minAppointments]);

  // Fetch data when modal opens or filters change
  useEffect(() => {
    if (isOpen) {
      fetchData();
    }
  }, [isOpen, fetchData]);

  // Fetch trend data
  const fetchTrendData = useCallback(async () => {
    setTrendLoading(true);
    try {

      const params = new URLSearchParams({
        dimension: activeDimension,
        granularity,
        lookback_days: lookbackDays.toString(),
      });

      // If a specific item is selected, filter by that dimension value
      if (selectedTrendItem) {
        params.append('dimension_value', selectedTrendItem.dimension_value);
      }

      const response = await fetch(`/api/forecast/completion-rates/trend?${params}`, {
        credentials: 'include',
      });

      if (!response.ok) throw new Error(`HTTP ${response.status}`);
      const result = await response.json();
      setTrendData(result);
    } catch (err) {
      console.error('Failed to fetch trend data:', err);
    } finally {
      setTrendLoading(false);
    }
  }, [activeDimension, granularity, lookbackDays, selectedTrendItem]);

  // Fetch trend data when in trend view
  useEffect(() => {
    if (isOpen && viewMode === 'trends') {
      fetchTrendData();
    }
  }, [isOpen, viewMode, fetchTrendData]);

  // Fetch computed anomalies
  const fetchComputedAnomalies = useCallback(async () => {
    setAnomaliesLoading(true);
    try {

      const params = new URLSearchParams({
        dimension: activeDimension,
        lookback_days: String(Math.max(lookbackDays, 180)),
      });
      if (selectedTrendItem) {
        params.append('dimension_value', selectedTrendItem.dimension_value);
      }

      const response = await fetch(`/api/forecast/completion-rates/anomalies/computed?${params}`, {
        credentials: 'include',
      });

      if (response.ok) {
        const result = await response.json();
        setComputedAnomalies(result);
      }
    } catch (err) {
      console.error('Failed to fetch computed anomalies:', err);
    } finally {
      setAnomaliesLoading(false);
    }
  }, [activeDimension, lookbackDays, selectedTrendItem]);

  // Fetch anomalies when in anomalies view
  useEffect(() => {
    if (isOpen && viewMode === 'anomalies') {
      fetchComputedAnomalies();
    }
  }, [isOpen, viewMode, fetchComputedAnomalies]);

  // Fetch holidays data
  const fetchHolidayData = useCallback(async () => {
    setHolidayLoading(true);
    try {

      const response = await fetch('/api/forecast/completion-rates/holidays?lookback_days=365&forward_days=365', {
        credentials: 'include',
      });

      if (response.ok) {
        const result = await response.json();
        setHolidayData(result);
      }
    } catch (err) {
      console.error('Failed to fetch holiday data:', err);
    } finally {
      setHolidayLoading(false);
    }
  }, []);

  // Fetch holidays when in holidays view
  useEffect(() => {
    if (isOpen && viewMode === 'holidays') {
      fetchHolidayData();
    }
  }, [isOpen, viewMode, fetchHolidayData]);

  // Calculate revenue impact
  const calculateImpact = async (item) => {
    setCalculatingImpact(true);
    try {

      const response = await fetch('/api/forecast/completion-rates/impact', {
        method: 'POST',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          dimension: activeDimension,
          dimension_value: item.dimension_value,
          current_rate: item.completion_rate,
          target_rate: targetRate,
          lookback_days: lookbackDays,
        }),
      });

      if (!response.ok) throw new Error(`HTTP ${response.status}`);
      const result = await response.json();
      setImpactResult(result);
    } catch (err) {
      console.error('Failed to calculate impact:', err);
    } finally {
      setCalculatingImpact(false);
    }
  };

  // Handle row click to show calculator
  const handleRowClick = (item) => {
    setSelectedItem(item);
    setTargetRate(Math.min(0.98, item.completion_rate + 0.05)); // Default to +5pp improvement
    setShowCalculator(true);
    setImpactResult(null);
  };

  // Fetch AI status
  const fetchAiStatus = useCallback(async () => {
    try {

      const response = await fetch('/api/forecast/completion-rates/ai/status', {
        credentials: 'include',
      });

      if (response.ok) {
        const status = await response.json();
        setAiStatus(status);
      }
    } catch (err) {
      console.error('Failed to fetch AI status:', err);
    }
  }, []);

  // Fetch AI status when modal opens
  useEffect(() => {
    if (isOpen && viewMode === 'anomalies') {
      fetchAiStatus();
    }
  }, [isOpen, viewMode, fetchAiStatus]);

  // Request AI analysis for an individual anomaly
  const analyzeIndividual = async (anomaly) => {
    setAiLoading(true);
    setAiAnalysisType('individual');
    try {

      const response = await fetch('/api/forecast/completion-rates/ai/analyze-individual', {
        method: 'POST',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          dimension_type: anomaly.dimension_type,
          dimension_value: anomaly.dimension_value,
          dimension_display_name: anomaly.dimension_display_name,
          current_rate: anomaly.current_rate,
          baseline_rate: anomaly.baseline_rate,
          appointments_total: anomaly.appointments_affected,
          revenue_impact: anomaly.revenue_impact,
        }),
      });

      const result = await response.json();
      setAiResult(result);
      setShowAiResult(true);
      fetchAiStatus(); // Refresh budget
    } catch (err) {
      console.error('AI analysis failed:', err);
      setAiResult({ success: false, error: err.message });
      setShowAiResult(true);
    } finally {
      setAiLoading(false);
    }
  };

  // Request weekly summary
  const requestWeeklySummary = async () => {
    setAiLoading(true);
    setAiAnalysisType('weekly_summary');
    try {

      const response = await fetch('/api/forecast/completion-rates/ai/weekly-summary', {
        method: 'POST',
        credentials: 'include',
      });

      const result = await response.json();
      setAiResult(result);
      setShowAiResult(true);
      fetchAiStatus();
    } catch (err) {
      console.error('Weekly summary failed:', err);
      setAiResult({ success: false, error: err.message });
      setShowAiResult(true);
    } finally {
      setAiLoading(false);
    }
  };

  // Request revenue opportunities analysis
  const requestRevenueOpportunities = async () => {
    setAiLoading(true);
    setAiAnalysisType('revenue_opportunity');
    try {

      const response = await fetch('/api/forecast/completion-rates/ai/revenue-opportunities', {
        method: 'POST',
        credentials: 'include',
      });

      const result = await response.json();
      setAiResult(result);
      setShowAiResult(true);
      fetchAiStatus();
    } catch (err) {
      console.error('Revenue opportunities failed:', err);
      setAiResult({ success: false, error: err.message });
      setShowAiResult(true);
    } finally {
      setAiLoading(false);
    }
  };


  if (!isOpen) return null;

  const getRateColor = (rate) => {
    if (rate >= 0.95) return 'text-green-700 bg-green-50';
    if (rate >= 0.90) return 'text-emerald-700 bg-emerald-50';
    if (rate >= 0.85) return 'text-yellow-700 bg-yellow-50';
    if (rate >= 0.80) return 'text-orange-700 bg-orange-50';
    return 'text-red-700 bg-red-50';
  };


  const formatPercent = (val) => {
    return `${(val * 100).toFixed(1)}%`;
  };

  return (
    <div className="fixed inset-0 z-50">
      {/* Backdrop */}
      <div className="absolute inset-0 bg-black/40" onClick={onClose} />

      {/* Modal */}
      <div className="absolute inset-4 sm:inset-8 flex items-start justify-center pt-4 sm:pt-8">
        <div className="w-full max-w-6xl bg-white rounded-xl shadow-xl border border-neutral-200 overflow-hidden max-h-[90vh] flex flex-col">
          {/* Header */}
          <div className="flex items-center justify-between px-4 sm:px-6 py-4 border-b border-neutral-100 bg-neutral-50">
            <div>
              <h2 className="text-lg sm:text-xl font-semibold text-brand-navy">Completion Rates Deep Dive</h2>
              <p className="text-sm text-neutral-500 mt-0.5">
                Analyze completion rates across tutors, clients, markets, and channels
              </p>
            </div>
            <button onClick={onClose} className="text-neutral-500 hover:text-neutral-700 p-2">
              <XMarkIcon className="h-6 w-6" />
            </button>
          </div>

          {/* Controls Bar */}
          <div className="px-4 sm:px-6 py-3 border-b border-neutral-100 flex flex-wrap items-center gap-4">
            {/* View Mode Toggle */}
            <div className="flex gap-1 bg-purple-100 p-1 rounded-lg">
              {VIEW_MODES.map((mode) => (
                <button
                  key={mode.id}
                  onClick={() => setViewMode(mode.id)}
                  className={classNames(
                    'flex items-center gap-1.5 px-3 py-1.5 rounded-md text-sm font-medium transition-colors',
                    viewMode === mode.id
                      ? 'bg-white text-brand-purple shadow-sm'
                      : 'text-purple-600 hover:text-purple-800'
                  )}
                >
                  <mode.icon className="h-4 w-4" />
                  <span>{mode.label}</span>
                </button>
              ))}
            </div>

            {viewMode !== 'holidays' && (
              <>
                <div className="w-px h-6 bg-neutral-200" />

                {/* Dimension Tabs */}
                <div className="flex gap-1 bg-neutral-100 p-1 rounded-lg">
                  {DIMENSION_TABS.map((tab) => (
                    <button
                      key={tab.id}
                      onClick={() => setActiveDimension(tab.id)}
                      className={classNames(
                        'flex items-center gap-1.5 px-3 py-1.5 rounded-md text-sm font-medium transition-colors',
                        activeDimension === tab.id
                          ? 'bg-white text-brand-navy shadow-sm'
                          : 'text-neutral-600 hover:text-neutral-900'
                      )}
                    >
                      <tab.icon className="h-4 w-4" />
                      <span className="hidden sm:inline">{tab.label}</span>
                    </button>
                  ))}
                </div>

                {/* Lookback Selector */}
                <select
                  value={lookbackDays}
                  onChange={(e) => setLookbackDays(parseInt(e.target.value))}
                  className="text-sm border border-neutral-200 rounded-md px-3 py-1.5"
                >
                  {LOOKBACK_OPTIONS.map((opt) => (
                    <option key={opt.value} value={opt.value}>
                      {opt.label}
                    </option>
                  ))}
                </select>
              </>
            )}

            {/* Granularity Selector - only in Trends view */}
            {viewMode === 'trends' && (
              <select
                value={granularity}
                onChange={(e) => setGranularity(e.target.value)}
                className="text-sm border border-neutral-200 rounded-md px-3 py-1.5"
              >
                {GRANULARITY_OPTIONS.map((opt) => (
                  <option key={opt.value} value={opt.value}>
                    {opt.label}
                  </option>
                ))}
              </select>
            )}

            {/* Min Appointments - only in Table view */}
            {viewMode === 'table' && (
              <div className="flex items-center gap-2 text-sm">
                <span className="text-neutral-500">Min appointments:</span>
                <input
                  type="number"
                  min="1"
                  max="100"
                  value={minAppointments}
                  onChange={(e) => setMinAppointments(parseInt(e.target.value) || 10)}
                  className="w-16 border border-neutral-200 rounded-md px-2 py-1 text-center"
                />
              </div>
            )}
          </div>

          {/* Summary Stats */}
          {data?.summary && (
            <div className="px-4 sm:px-6 py-3 bg-neutral-50 border-b border-neutral-100">
              <div className="flex flex-wrap gap-6 text-sm">
                <div>
                  <span className="text-neutral-500">Overall Rate:</span>
                  <span className={classNames(
                    'ml-2 px-2 py-0.5 rounded font-medium',
                    getRateColor(data.summary.overall_completion_rate)
                  )}>
                    {formatPercent(data.summary.overall_completion_rate)}
                  </span>
                </div>
                <div>
                  <span className="text-neutral-500">Total Appointments:</span>
                  <span className="ml-2 font-medium">{data.summary.total_appointments.toLocaleString()}</span>
                </div>
                <div>
                  <span className="text-neutral-500">Revenue Lost:</span>
                  <span className="ml-2 font-medium text-red-600">{formatCurrency(data.summary.total_revenue_lost)}</span>
                </div>
                <div>
                  <span className="text-neutral-500">Entries:</span>
                  <span className="ml-2 font-medium">{data.summary.total_entries}</span>
                </div>
              </div>
            </div>
          )}

          {/* Content */}
          <div className="flex-1 overflow-y-auto">
            {/* Table View */}
            {viewMode === 'table' && (
              <>
                {loading ? (
                  <div className="flex items-center justify-center py-16">
                    <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-purple-600"></div>
                    <span className="ml-3 text-neutral-600">Loading completion rates...</span>
                  </div>
                ) : error ? (
                  <div className="flex items-center justify-center py-16 text-red-600">
                    <ExclamationTriangleIcon className="h-6 w-6 mr-2" />
                    Error loading data: {error}
                  </div>
                ) : data?.breakdown?.length === 0 ? (
                  <div className="flex items-center justify-center py-16 text-neutral-500">
                    No data found for the selected filters
                  </div>
                ) : (
                  <div className="p-4 sm:p-6">
                    {/* Data Table */}
                    <table className="w-full text-sm">
                  <thead className="sticky top-0 bg-white">
                    <tr className="text-left text-neutral-600 border-b">
                      <th className="py-2 pr-4 font-medium">
                        {activeDimension === 'tutor' ? 'Tutor' :
                         activeDimension === 'client' ? 'Client/Family' :
                         activeDimension === 'market' ? 'Market' : 'Channel'}
                      </th>
                      <th className="py-2 pr-4 font-medium text-right">Total</th>
                      <th className="py-2 pr-4 font-medium text-right">Completed</th>
                      <th className="py-2 pr-4 font-medium text-right">Cancelled</th>
                      <th className="py-2 pr-4 font-medium text-right">Rate</th>
                      <th className="py-2 pr-4 font-medium text-right">Revenue Lost</th>
                      <th className="py-2 font-medium text-center">Action</th>
                    </tr>
                  </thead>
                  <tbody>
                    {data?.breakdown?.map((row, idx) => (
                      <tr
                        key={row.dimension_value || idx}
                        className="border-t border-neutral-100 hover:bg-neutral-50 cursor-pointer"
                        onClick={() => handleRowClick(row)}
                      >
                        <td className="py-3 pr-4">
                          <span className="font-medium">{row.dimension_display_name || row.dimension_value}</span>
                        </td>
                        <td className="py-3 pr-4 text-right">{row.appointments_total.toLocaleString()}</td>
                        <td className="py-3 pr-4 text-right text-green-700">{row.appointments_completed.toLocaleString()}</td>
                        <td className="py-3 pr-4 text-right text-red-600">{row.appointments_cancelled.toLocaleString()}</td>
                        <td className="py-3 pr-4 text-right">
                          <span className={classNames(
                            'px-2 py-0.5 rounded font-medium',
                            getRateColor(row.completion_rate)
                          )}>
                            {formatPercent(row.completion_rate)}
                          </span>
                        </td>
                        <td className="py-3 pr-4 text-right text-red-600 font-medium">
                          {formatCurrency(row.revenue_lost)}
                        </td>
                        <td className="py-3 text-center">
                          <button
                            onClick={(e) => {
                              e.stopPropagation();
                              handleRowClick(row);
                            }}
                            className="text-xs text-brand-purple hover:text-purple-700 font-medium"
                          >
                            Calculate Impact →
                          </button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>

                {/* Revenue Impact Calculator Panel */}
                {showCalculator && selectedItem && (
                  <div className="mt-6 p-4 bg-purple-50 border border-purple-200 rounded-lg">
                    <div className="flex items-center justify-between mb-4">
                      <h3 className="text-sm font-semibold text-purple-900 flex items-center gap-2">
                        <CalculatorIcon className="h-5 w-5" />
                        Revenue Impact Calculator
                      </h3>
                      <button
                        onClick={() => setShowCalculator(false)}
                        className="text-purple-600 hover:text-purple-800"
                      >
                        <XMarkIcon className="h-5 w-5" />
                      </button>
                    </div>

                    <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-4">
                      <div>
                        <label className="block text-xs text-purple-700 mb-1">Selected</label>
                        <div className="text-sm font-medium text-purple-900">
                          {selectedItem.dimension_display_name || selectedItem.dimension_value}
                        </div>
                      </div>
                      <div>
                        <label className="block text-xs text-purple-700 mb-1">Current Rate</label>
                        <div className="text-sm font-medium text-purple-900">
                          {formatPercent(selectedItem.completion_rate)}
                        </div>
                      </div>
                      <div>
                        <label className="block text-xs text-purple-700 mb-1">Target Rate</label>
                        <div className="flex items-center gap-2">
                          <input
                            type="range"
                            min={Math.round(selectedItem.completion_rate * 100)}
                            max="100"
                            value={Math.round(targetRate * 100)}
                            onChange={(e) => setTargetRate(parseInt(e.target.value) / 100)}
                            className="flex-1"
                          />
                          <span className="text-sm font-medium text-purple-900 w-12">
                            {formatPercent(targetRate)}
                          </span>
                        </div>
                      </div>
                    </div>

                    <button
                      onClick={() => calculateImpact(selectedItem)}
                      disabled={calculatingImpact}
                      className="px-4 py-2 bg-purple-600 text-white rounded-md text-sm font-medium hover:bg-purple-700 disabled:opacity-50"
                    >
                      {calculatingImpact ? 'Calculating...' : 'Calculate Revenue Impact'}
                    </button>

                    {/* Impact Results */}
                    {impactResult && !impactResult.error && (
                      <div className="mt-4 p-4 bg-white rounded-lg border border-purple-100">
                        <div className="grid grid-cols-2 md:grid-cols-4 gap-4 text-center">
                          <div>
                            <div className="text-xs text-neutral-500">Improvement</div>
                            <div className="text-lg font-semibold text-purple-700">
                              +{(impactResult.improvement_pp * 100).toFixed(1)}pp
                            </div>
                          </div>
                          <div>
                            <div className="text-xs text-neutral-500">Additional Lessons/Month</div>
                            <div className="text-lg font-semibold text-green-700">
                              +{impactResult.additional_completed_monthly.toFixed(1)}
                            </div>
                          </div>
                          <div>
                            <div className="text-xs text-neutral-500">Monthly Revenue Opportunity</div>
                            <div className="text-lg font-semibold text-green-700">
                              {formatCurrency(impactResult.monthly_revenue_opportunity)}
                            </div>
                          </div>
                          <div>
                            <div className="text-xs text-neutral-500">Annual Revenue Opportunity</div>
                            <div className="text-xl font-bold text-green-700">
                              {formatCurrency(impactResult.annual_revenue_opportunity)}
                            </div>
                          </div>
                        </div>
                        <div className="mt-3 text-xs text-neutral-500 text-center">
                          Based on {impactResult.appointments_in_period.toLocaleString()} appointments
                          over {lookbackDays} days, avg ${impactResult.avg_lesson_value.toFixed(2)}/lesson
                        </div>
                      </div>
                    )}
                  </div>
                )}
              </div>
            )}
            </>
            )}

            {/* Trends View */}
            {viewMode === 'trends' && (
              <div className="p-4 sm:p-6">
                {trendLoading ? (
                  <div className="flex items-center justify-center py-16">
                    <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-purple-600"></div>
                    <span className="ml-3 text-neutral-600">Loading trend data...</span>
                  </div>
                ) : !trendData?.trend_data?.length ? (
                  <div className="flex items-center justify-center py-16 text-neutral-500">
                    No trend data available for the selected period
                  </div>
                ) : (
                  <>
                    {/* Trend Filter - Click on table row to filter trends by specific item */}
                    {selectedTrendItem && (
                      <div className="mb-4 flex items-center gap-2">
                        <span className="text-sm text-neutral-600">Showing trends for:</span>
                        <span className="px-2 py-1 bg-purple-100 text-purple-800 rounded-md text-sm font-medium">
                          {selectedTrendItem.dimension_display_name || selectedTrendItem.dimension_value}
                        </span>
                        <button
                          onClick={() => setSelectedTrendItem(null)}
                          className="text-sm text-purple-600 hover:text-purple-800"
                        >
                          Clear filter
                        </button>
                      </div>
                    )}

                    {/* Trend Chart */}
                    <div className="bg-white rounded-lg border border-neutral-200 p-4">
                      <h3 className="text-sm font-semibold text-neutral-700 mb-4">
                        Completion Rate Over Time
                        {selectedTrendItem && ` — ${selectedTrendItem.dimension_display_name || selectedTrendItem.dimension_value}`}
                      </h3>
                      <div style={{ height: 300 }}>
                        <ResponsiveContainer width="100%" height="100%">
                          <LineChart
                            data={trendData.trend_data.map(d => ({
                              name: formatPeriodLabel(d.period_start, granularity),
                              completionRate: d.completion_rate,
                              appointments: d.appointments_total,
                            }))}
                            margin={{ top: 8, right: 16, left: 0, bottom: 0 }}
                          >
                            <CartesianGrid strokeDasharray="3 3" vertical={false} />
                            <XAxis
                              dataKey="name"
                              tick={{ fontSize: 12 }}
                              tickLine={false}
                              axisLine={false}
                            />
                            <YAxis
                              domain={['auto', 1]}
                              tick={{ fontSize: 12 }}
                              tickLine={false}
                              axisLine={false}
                              tickFormatter={(v) => `${(v * 100).toFixed(0)}%`}
                            />
                            <Tooltip content={<TrendTooltip />} />
                            <Legend />
                            {/* Target reference lines */}
                            <ReferenceLine y={0.95} stroke="#22c55e" strokeDasharray="5 5" label={{ value: '95% Target', fill: '#22c55e', fontSize: 11, position: 'right' }} />
                            <ReferenceLine y={0.90} stroke="#f97316" strokeDasharray="5 5" label={{ value: '90% Warning', fill: '#f97316', fontSize: 11, position: 'right' }} />
                            <Line
                              type="monotone"
                              dataKey="completionRate"
                              name="Completion Rate"
                              stroke="#6D28D9"
                              strokeWidth={2}
                              dot={{ r: 4, fill: '#6D28D9' }}
                              activeDot={{ r: 6, fill: '#6D28D9' }}
                            />
                          </LineChart>
                        </ResponsiveContainer>
                      </div>
                    </div>

                    {/* Trend Statistics Summary */}
                    {trendData.summary && (
                      <div className="mt-4 grid grid-cols-2 md:grid-cols-4 gap-4">
                        <div className="bg-neutral-50 rounded-lg p-4 text-center">
                          <div className="text-xs text-neutral-500">Average Rate</div>
                          <div className={classNames(
                            'text-xl font-bold',
                            trendData.summary.avg_rate >= 0.95 ? 'text-green-600' :
                            trendData.summary.avg_rate >= 0.90 ? 'text-yellow-600' : 'text-red-600'
                          )}>
                            {formatPercent(trendData.summary.avg_rate)}
                          </div>
                        </div>
                        <div className="bg-neutral-50 rounded-lg p-4 text-center">
                          <div className="text-xs text-neutral-500">Trend</div>
                          <div className={classNames(
                            'text-xl font-bold flex items-center justify-center gap-1',
                            trendData.summary.trend_direction === 'up' ? 'text-green-600' :
                            trendData.summary.trend_direction === 'down' ? 'text-red-600' : 'text-neutral-600'
                          )}>
                            {trendData.summary.trend_direction === 'up' && <ArrowTrendingUpIcon className="h-5 w-5" />}
                            {trendData.summary.trend_direction === 'down' && <ArrowTrendingDownIcon className="h-5 w-5" />}
                            {trendData.summary.trend_direction === 'up' ? 'Improving' :
                             trendData.summary.trend_direction === 'down' ? 'Declining' : 'Stable'}
                          </div>
                        </div>
                        <div className="bg-neutral-50 rounded-lg p-4 text-center">
                          <div className="text-xs text-neutral-500">Best Period</div>
                          <div className="text-lg font-semibold text-green-600">
                            {formatPercent(trendData.summary.max_rate)}
                          </div>
                        </div>
                        <div className="bg-neutral-50 rounded-lg p-4 text-center">
                          <div className="text-xs text-neutral-500">Worst Period</div>
                          <div className="text-lg font-semibold text-red-600">
                            {formatPercent(trendData.summary.min_rate)}
                          </div>
                        </div>
                      </div>
                    )}

                    {/* Quick Filter Buttons - show items from table to filter trends */}
                    {data?.breakdown?.length > 0 && (
                      <div className="mt-6">
                        <h4 className="text-sm font-medium text-neutral-700 mb-2">Filter by {activeDimension}:</h4>
                        <div className="flex flex-wrap gap-2">
                          {data.breakdown.slice(0, 8).map((item) => (
                            <button
                              key={item.dimension_value}
                              onClick={() => setSelectedTrendItem(
                                selectedTrendItem?.dimension_value === item.dimension_value ? null : item
                              )}
                              className={classNames(
                                'px-3 py-1.5 rounded-md text-sm font-medium transition-colors',
                                selectedTrendItem?.dimension_value === item.dimension_value
                                  ? 'bg-purple-600 text-white'
                                  : 'bg-neutral-100 text-neutral-700 hover:bg-neutral-200'
                              )}
                            >
                              {item.dimension_display_name || item.dimension_value}
                              <span className={classNames(
                                'ml-1.5 px-1.5 py-0.5 rounded text-xs',
                                getRateColor(item.completion_rate)
                              )}>
                                {formatPercent(item.completion_rate)}
                              </span>
                            </button>
                          ))}
                        </div>
                      </div>
                    )}
                  </>
                )}
              </div>
            )}

            {/* Anomalies View */}
            {viewMode === 'anomalies' && (
              <div className="p-4 sm:p-6">
                {anomaliesLoading ? (
                  <div className="flex items-center justify-center py-16">
                    <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-purple-600"></div>
                    <span className="ml-3 text-neutral-600">Computing anomalies...</span>
                  </div>
                ) : computedAnomalies ? (
                  <>
                    {/* Summary Cards */}
                    <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-6">
                      <div className="bg-red-50 border border-red-200 rounded-lg p-4 text-center">
                        <div className="text-xs text-red-600">Critical Issues</div>
                        <div className="text-2xl font-bold text-red-700">{computedAnomalies.summary.critical}</div>
                      </div>
                      <div className="bg-amber-50 border border-amber-200 rounded-lg p-4 text-center">
                        <div className="text-xs text-amber-600">Warnings</div>
                        <div className="text-2xl font-bold text-amber-700">{computedAnomalies.summary.warning}</div>
                      </div>
                      <div className="bg-yellow-50 border border-yellow-200 rounded-lg p-4 text-center">
                        <div className="text-xs text-yellow-600">Holiday Dips</div>
                        <div className="text-2xl font-bold text-yellow-700">{computedAnomalies.summary.expected}</div>
                      </div>
                      <div className="bg-green-50 border border-green-200 rounded-lg p-4 text-center">
                        <div className="text-xs text-green-600">Improvements</div>
                        <div className="text-2xl font-bold text-green-700">{computedAnomalies.summary.positive}</div>
                      </div>
                    </div>

                    {/* Anomaly Chart */}
                    {computedAnomalies.trend_data?.length > 0 && (
                      <div className="bg-white border border-neutral-200 rounded-lg p-4 mb-6">
                        <h4 className="text-sm font-medium text-neutral-700 mb-3">Completion Rate with Anomaly Detection</h4>
                        <div className="h-72">
                          <ResponsiveContainer width="100%" height="100%">
                            <ComposedChart
                              data={computedAnomalies.trend_data.map((d, idx) => {
                                const periodISO = typeof d.period_start === 'string'
                                  ? d.period_start.slice(0, 10)
                                  : new Date(d.period_start).toISOString().slice(0, 10);
                                const anomaly = computedAnomalies.anomalies.find(a => a.week_start === periodISO);
                                return {
                                  label: formatPeriodLabel(d.period_start, 'week'),
                                  rate: d.completion_rate,
                                  rollingAvg: d.rolling_avg,
                                  anomalyDot: anomaly ? d.completion_rate : null,
                                  classification: anomaly?.classification || null,
                                  idx,
                                };
                              })}
                              margin={{ top: 10, right: 20, left: 0, bottom: 5 }}
                            >
                              <CartesianGrid strokeDasharray="3 3" stroke="#e5e7eb" />
                              <XAxis dataKey="label" tick={{ fontSize: 11 }} interval="preserveStartEnd" />
                              <YAxis
                                tickFormatter={(v) => `${(v * 100).toFixed(0)}%`}
                                domain={['auto', 'auto']}
                                tick={{ fontSize: 11 }}
                              />
                              <Tooltip
                                content={({ active, payload, label }) => {
                                  if (!active || !payload || payload.length === 0) return null;
                                  const point = payload[0]?.payload;
                                  const anomaly = point?.classification
                                    ? computedAnomalies.anomalies.find(a => {
                                        const pISO = typeof computedAnomalies.trend_data[point.idx]?.period_start === 'string'
                                          ? computedAnomalies.trend_data[point.idx].period_start.slice(0, 10)
                                          : new Date(computedAnomalies.trend_data[point.idx]?.period_start).toISOString().slice(0, 10);
                                        return a.week_start === pISO;
                                      })
                                    : null;
                                  return (
                                    <div className="bg-white border border-neutral-200 rounded-lg shadow-lg p-3 min-w-[200px]">
                                      <p className="font-semibold text-neutral-800 mb-2 border-b border-neutral-200 pb-1">{label}</p>
                                      <div className="space-y-1">
                                        <div className="flex justify-between text-sm">
                                          <span className="text-neutral-600">Actual</span>
                                          <span className="font-semibold">{(point.rate * 100).toFixed(1)}%</span>
                                        </div>
                                        {point.rollingAvg != null && (
                                          <div className="flex justify-between text-sm">
                                            <span className="text-neutral-600">Rolling Avg</span>
                                            <span className="font-medium text-neutral-500">{(point.rollingAvg * 100).toFixed(1)}%</span>
                                          </div>
                                        )}
                                        {anomaly && (
                                          <>
                                            <div className="flex justify-between text-sm">
                                              <span className="text-neutral-600">Deviation</span>
                                              <span className={classNames('font-medium', anomaly.deviation_pp < 0 ? 'text-red-600' : 'text-green-600')}>
                                                {anomaly.deviation_pp > 0 ? '+' : ''}{anomaly.deviation_pp}pp
                                              </span>
                                            </div>
                                            <div className="mt-1 pt-1 border-t border-neutral-100">
                                              <span className={classNames(
                                                'px-2 py-0.5 rounded text-xs font-medium uppercase',
                                                anomaly.classification === 'critical' ? 'bg-red-200 text-red-800' :
                                                anomaly.classification === 'warning' ? 'bg-amber-200 text-amber-800' :
                                                anomaly.classification === 'expected' ? 'bg-yellow-200 text-yellow-800' :
                                                'bg-green-200 text-green-800'
                                              )}>
                                                {anomaly.classification}
                                              </span>
                                              {anomaly.holiday_name && (
                                                <span className="ml-2 text-xs text-yellow-700">{anomaly.holiday_name}</span>
                                              )}
                                            </div>
                                          </>
                                        )}
                                      </div>
                                    </div>
                                  );
                                }}
                              />
                              {/* Holiday shading bands */}
                              {(() => {
                                const trendLabels = computedAnomalies.trend_data.map(d => formatPeriodLabel(d.period_start, 'week'));
                                const holidayBands = [];
                                if (computedAnomalies.holidays) {
                                  for (const holiday of computedAnomalies.holidays) {
                                    // Find trend data points that fall within this holiday
                                    const matchingIndices = [];
                                    computedAnomalies.trend_data.forEach((d, idx) => {
                                      const pISO = typeof d.period_start === 'string'
                                        ? d.period_start.slice(0, 10)
                                        : new Date(d.period_start).toISOString().slice(0, 10);
                                      const weekStart = new Date(pISO + 'T00:00:00Z');
                                      const weekEnd = new Date(weekStart.getTime() + 6 * 24 * 60 * 60 * 1000);
                                      const hStart = new Date(holiday.start + 'T00:00:00Z');
                                      const hEnd = new Date(holiday.end + 'T00:00:00Z');
                                      if (weekStart <= hEnd && weekEnd >= hStart) {
                                        matchingIndices.push(idx);
                                      }
                                    });
                                    if (matchingIndices.length > 0) {
                                      const firstIdx = Math.max(0, matchingIndices[0]);
                                      const lastIdx = Math.min(trendLabels.length - 1, matchingIndices[matchingIndices.length - 1]);
                                      holidayBands.push(
                                        <ReferenceArea
                                          key={`${holiday.name}-${holiday.start}`}
                                          x1={trendLabels[firstIdx]}
                                          x2={trendLabels[lastIdx]}
                                          fill="#fef08a"
                                          fillOpacity={0.3}
                                          stroke="none"
                                        />
                                      );
                                    }
                                  }
                                }
                                return holidayBands;
                              })()}
                              <Line
                                type="monotone"
                                dataKey="rate"
                                stroke="#6366f1"
                                strokeWidth={2}
                                dot={false}
                                name="Completion Rate"
                              />
                              <Line
                                type="monotone"
                                dataKey="rollingAvg"
                                stroke="#a78bfa"
                                strokeWidth={1.5}
                                strokeDasharray="5 5"
                                dot={false}
                                name="4-Week Avg"
                                connectNulls
                              />
                              <Line
                                type="monotone"
                                dataKey="anomalyDot"
                                stroke="none"
                                dot={(props) => {
                                  const { cx, cy, payload } = props;
                                  if (!payload.classification || cy == null) return null;
                                  const colors = {
                                    critical: '#dc2626',
                                    warning: '#f59e0b',
                                    expected: '#eab308',
                                    positive: '#16a34a',
                                  };
                                  return (
                                    <circle
                                      key={`dot-${payload.idx}`}
                                      cx={cx}
                                      cy={cy}
                                      r={6}
                                      fill={colors[payload.classification] || '#6b7280'}
                                      stroke="#fff"
                                      strokeWidth={2}
                                    />
                                  );
                                }}
                                name="Anomaly"
                                legendType="none"
                              />
                              <Legend />
                            </ComposedChart>
                          </ResponsiveContainer>
                        </div>
                        <div className="flex items-center gap-4 mt-2 text-xs text-neutral-500">
                          <span className="flex items-center gap-1"><span className="inline-block w-3 h-3 rounded-full bg-red-600"></span> Critical</span>
                          <span className="flex items-center gap-1"><span className="inline-block w-3 h-3 rounded-full bg-amber-500"></span> Warning</span>
                          <span className="flex items-center gap-1"><span className="inline-block w-3 h-3 rounded-full bg-yellow-500"></span> Holiday (Expected)</span>
                          <span className="flex items-center gap-1"><span className="inline-block w-3 h-3 rounded-full bg-green-600"></span> Improvement</span>
                          <span className="flex items-center gap-1"><span className="inline-block w-3 h-1 bg-yellow-200 rounded"></span> Holiday Period</span>
                        </div>
                      </div>
                    )}

                    {/* Severity Filter + AI Actions */}
                    <div className="flex flex-wrap items-center justify-between gap-3 mb-4">
                      <div className="flex gap-2">
                        {[
                          { id: 'all', label: 'All', color: 'bg-neutral-700' },
                          { id: 'critical', label: 'Critical', color: 'bg-red-600' },
                          { id: 'warning', label: 'Warning', color: 'bg-amber-600' },
                          { id: 'expected', label: 'Holiday', color: 'bg-yellow-600' },
                          { id: 'positive', label: 'Improvement', color: 'bg-green-600' },
                        ].map((sev) => (
                          <button
                            key={sev.id}
                            onClick={() => setAnomalyFilter(sev.id)}
                            className={classNames(
                              'px-3 py-1.5 rounded-md text-sm font-medium transition-colors',
                              anomalyFilter === sev.id
                                ? `${sev.color} text-white`
                                : 'bg-neutral-100 text-neutral-700 hover:bg-neutral-200'
                            )}
                          >
                            {sev.label}
                            {sev.id !== 'all' && computedAnomalies.summary[sev.id] > 0 && (
                              <span className="ml-1.5 text-xs opacity-80">({computedAnomalies.summary[sev.id]})</span>
                            )}
                          </button>
                        ))}
                      </div>

                      {/* AI Analysis Buttons */}
                      {aiStatus?.is_available && (
                        <div className="flex items-center gap-2">
                          <span className="text-xs text-neutral-500">
                            AI: ${aiStatus.budget_remaining?.toFixed(2)} remaining
                          </span>
                          <button
                            onClick={requestWeeklySummary}
                            disabled={aiLoading || aiStatus.budget_remaining <= 0}
                            className={classNames(
                              'flex items-center gap-1.5 px-3 py-1.5 rounded-md text-sm font-medium transition-colors',
                              aiLoading || aiStatus.budget_remaining <= 0
                                ? 'bg-neutral-100 text-neutral-400 cursor-not-allowed'
                                : 'bg-purple-100 text-purple-700 hover:bg-purple-200'
                            )}
                          >
                            <SparklesIcon className="h-4 w-4" />
                            {aiLoading && aiAnalysisType === 'weekly_summary' ? 'Analyzing...' : 'Weekly Summary'}
                          </button>
                          <button
                            onClick={requestRevenueOpportunities}
                            disabled={aiLoading || aiStatus.budget_remaining <= 0}
                            className={classNames(
                              'flex items-center gap-1.5 px-3 py-1.5 rounded-md text-sm font-medium transition-colors',
                              aiLoading || aiStatus.budget_remaining <= 0
                                ? 'bg-neutral-100 text-neutral-400 cursor-not-allowed'
                                : 'bg-green-100 text-green-700 hover:bg-green-200'
                            )}
                          >
                            <CalculatorIcon className="h-4 w-4" />
                            {aiLoading && aiAnalysisType === 'revenue_opportunity' ? 'Analyzing...' : 'Revenue Opportunities'}
                          </button>
                        </div>
                      )}
                    </div>

                    {/* Anomalies List */}
                    {(() => {
                      const filtered = anomalyFilter === 'all'
                        ? computedAnomalies.anomalies
                        : computedAnomalies.anomalies.filter(a => a.classification === anomalyFilter);

                      if (filtered.length === 0) {
                        return (
                          <div className="text-center py-12 text-neutral-500">
                            <ExclamationTriangleIcon className="h-12 w-12 mx-auto mb-3 text-neutral-300" />
                            <p className="text-lg font-medium">
                              {anomalyFilter === 'all' ? 'No anomalies detected' : `No ${anomalyFilter} anomalies`}
                            </p>
                            <p className="text-sm mt-1">
                              {anomalyFilter === 'all'
                                ? 'All completion rates are within normal thresholds.'
                                : 'Try selecting a different filter.'}
                            </p>
                          </div>
                        );
                      }

                      return (
                        <div className="space-y-3">
                          {filtered.map((anomaly, idx) => (
                            <div
                              key={`${anomaly.week_start}-${idx}`}
                              className={classNames(
                                'border rounded-lg p-4',
                                anomaly.classification === 'critical' ? 'border-red-300 bg-red-50' :
                                anomaly.classification === 'warning' ? 'border-amber-300 bg-amber-50' :
                                anomaly.classification === 'expected' ? 'border-yellow-300 bg-yellow-50' :
                                anomaly.classification === 'positive' ? 'border-green-300 bg-green-50' :
                                'border-neutral-200 bg-neutral-50'
                              )}
                            >
                              <div className="flex items-start justify-between">
                                <div className="flex-1">
                                  <div className="flex items-center gap-2 mb-2">
                                    <span className={classNames(
                                      'px-2 py-0.5 rounded text-xs font-medium uppercase',
                                      anomaly.classification === 'critical' ? 'bg-red-200 text-red-800' :
                                      anomaly.classification === 'warning' ? 'bg-amber-200 text-amber-800' :
                                      anomaly.classification === 'expected' ? 'bg-yellow-200 text-yellow-800' :
                                      'bg-green-200 text-green-800'
                                    )}>
                                      {anomaly.classification}
                                    </span>
                                    {anomaly.is_holiday && (
                                      <span className="px-2 py-0.5 rounded bg-yellow-100 text-yellow-700 text-xs font-medium">
                                        {anomaly.holiday_name}
                                      </span>
                                    )}
                                    <span className="text-xs text-neutral-500">
                                      Week of {formatPeriodLabel(anomaly.week_start, 'week')}
                                    </span>
                                  </div>
                                  <div className="flex items-center gap-4 text-sm text-neutral-600">
                                    <span>
                                      Actual: <span className={classNames(
                                        'font-semibold',
                                        anomaly.completion_rate < 0.85 ? 'text-red-600' :
                                        anomaly.completion_rate < 0.90 ? 'text-amber-600' : 'text-green-600'
                                      )}>
                                        {(anomaly.completion_rate * 100).toFixed(1)}%
                                      </span>
                                    </span>
                                    <span>
                                      Expected: <span className="font-medium">{(anomaly.expected_rate * 100).toFixed(1)}%</span>
                                    </span>
                                    <span className={classNames(
                                      'font-medium',
                                      anomaly.deviation_pp < 0 ? 'text-red-600' : 'text-green-600'
                                    )}>
                                      {anomaly.deviation_pp > 0 ? '+' : ''}{anomaly.deviation_pp}pp
                                    </span>
                                  </div>
                                  <div className="flex items-center gap-4 mt-1 text-xs text-neutral-500">
                                    <span>{anomaly.appointments_total} appointments ({anomaly.appointments_completed} completed, {anomaly.appointments_cancelled} cancelled)</span>
                                    <span>z-score: {anomaly.z_score}</span>
                                  </div>
                                </div>
                              </div>
                            </div>
                          ))}
                        </div>
                      );
                    })()}

                    {/* AI Analysis Result Panel */}
                    {showAiResult && aiResult && (
                      <div className="mt-6 border border-purple-200 rounded-lg bg-purple-50 overflow-hidden">
                        <div className="flex items-center justify-between px-4 py-3 bg-purple-100 border-b border-purple-200">
                          <div className="flex items-center gap-2">
                            <SparklesIcon className="h-5 w-5 text-purple-600" />
                            <span className="font-medium text-purple-800">
                              {aiAnalysisType === 'individual' ? 'Individual Analysis' :
                               aiAnalysisType === 'weekly_summary' ? 'Weekly Ops Summary' :
                               'Revenue Opportunities'}
                            </span>
                          </div>
                          <button
                            onClick={() => setShowAiResult(false)}
                            className="text-purple-600 hover:text-purple-800"
                          >
                            <XMarkIcon className="h-5 w-5" />
                          </button>
                        </div>
                        <div className="p-4">
                          {aiResult.success ? (
                            <>
                              <div className="prose prose-sm max-w-none text-neutral-700 whitespace-pre-wrap">
                                {aiResult.analysis}
                              </div>
                              <div className="mt-3 pt-3 border-t border-purple-200 flex items-center gap-4 text-xs text-purple-600">
                                <span>Cost: ${aiResult.cost?.toFixed(4) || '0.00'}</span>
                                <span>Tokens: {aiResult.tokens || 0}</span>
                              </div>
                            </>
                          ) : (
                            <div className="text-red-600">
                              <p className="font-medium">Analysis failed</p>
                              <p className="text-sm mt-1">{aiResult.error || 'Unknown error'}</p>
                            </div>
                          )}
                        </div>
                      </div>
                    )}

                    {/* Total Count */}
                    {computedAnomalies.summary.total > 0 && (
                      <div className="mt-4 text-sm text-neutral-500 text-center">
                        {computedAnomalies.summary.total} anomalies detected across {computedAnomalies.trend_data?.length || 0} weeks of data
                      </div>
                    )}
                  </>
                ) : (
                  <div className="text-center py-12 text-neutral-500">
                    <ExclamationTriangleIcon className="h-12 w-12 mx-auto mb-3 text-neutral-300" />
                    <p className="text-lg font-medium">No data available</p>
                    <p className="text-sm mt-1">Unable to compute anomalies. Try adjusting your filters.</p>
                  </div>
                )}
              </div>
            )}

            {/* Holidays View */}
            {viewMode === 'holidays' && (
              <div className="p-4 sm:p-6">
                {holidayLoading ? (
                  <div className="flex items-center justify-center py-12">
                    <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-purple-600" />
                    <span className="ml-2 text-sm text-neutral-600">Loading holiday calendar...</span>
                  </div>
                ) : holidayData ? (
                  <>
                    {/* Controls */}
                    <div className="flex flex-wrap items-center gap-3 mb-5">
                      {/* Time View Toggle */}
                      <div className="flex gap-1 bg-neutral-100 p-1 rounded-lg">
                        <button
                          onClick={() => setHolidayTimeView('upcoming')}
                          className={classNames(
                            'flex items-center gap-1.5 px-3 py-1.5 rounded-md text-sm font-medium transition-colors',
                            holidayTimeView === 'upcoming'
                              ? 'bg-white text-brand-purple shadow-sm'
                              : 'text-neutral-600 hover:text-neutral-800'
                          )}
                        >
                          <SunIcon className="h-4 w-4" />
                          Upcoming
                        </button>
                        <button
                          onClick={() => setHolidayTimeView('past')}
                          className={classNames(
                            'flex items-center gap-1.5 px-3 py-1.5 rounded-md text-sm font-medium transition-colors',
                            holidayTimeView === 'past'
                              ? 'bg-white text-brand-purple shadow-sm'
                              : 'text-neutral-600 hover:text-neutral-800'
                          )}
                        >
                          <ArrowTrendingDownIcon className="h-4 w-4" />
                          Past Impact
                        </button>
                      </div>

                      {/* Market Filter */}
                      <div className="flex gap-1 bg-neutral-100 p-1 rounded-lg">
                        {['all', 'NYC', 'LA', 'SF'].map((m) => (
                          <button
                            key={m}
                            onClick={() => setHolidayMarketFilter(m)}
                            className={classNames(
                              'px-3 py-1.5 rounded-md text-sm font-medium transition-colors',
                              holidayMarketFilter === m
                                ? 'bg-white text-brand-purple shadow-sm'
                                : 'text-neutral-600 hover:text-neutral-800'
                            )}
                          >
                            {m === 'all' ? 'All Markets' : m}
                          </button>
                        ))}
                      </div>
                    </div>

                    {holidayTimeView === 'upcoming' ? (
                      (() => {
                        // Merge public holidays + school breaks into a single sorted timeline
                        const timelineItems = [];

                        // Add public holidays
                        holidayData.public_holidays
                          .filter(h => !h.is_past)
                          .forEach(h => {
                            const dt = DateTime.fromISO(h.date);
                            const daysAway = Math.ceil(dt.diffNow('days').days);
                            const pastImpact = holidayData.holiday_impact?.find(
                              imp => imp.holiday_name && h.name.toLowerCase().includes(imp.holiday_name.split(' ')[0].toLowerCase())
                            );
                            timelineItems.push({
                              sortDate: h.date,
                              dt,
                              daysAway,
                              name: h.name,
                              kind: 'public',
                              pastImpact,
                              dateLabel: dt.toFormat('EEE, MMM d'),
                            });
                          });

                        // Add school breaks
                        holidayData.school_breaks
                          .filter(b => !b.is_past)
                          .filter(b => holidayMarketFilter === 'all' || b.market === holidayMarketFilter)
                          .forEach(b => {
                            const startDt = DateTime.fromISO(b.start);
                            const endDt = DateTime.fromISO(b.end);
                            const daysAway = Math.ceil(startDt.diffNow('days').days);
                            const duration = Math.ceil(endDt.diff(startDt, 'days').days) + 1;
                            timelineItems.push({
                              sortDate: b.start,
                              dt: startDt,
                              daysAway,
                              name: b.name.replace(`${b.market} `, ''),
                              kind: 'school',
                              market: b.market,
                              duration,
                              dateLabel: duration > 1
                                ? `${startDt.toFormat('MMM d')} - ${endDt.toFormat('MMM d')}`
                                : startDt.toFormat('EEE, MMM d'),
                            });
                          });

                        timelineItems.sort((a, b) => a.sortDate.localeCompare(b.sortDate));

                        // Group by month
                        const months = {};
                        for (const item of timelineItems) {
                          const monthKey = item.dt.toFormat('yyyy-MM');
                          const monthLabel = item.dt.toFormat('MMMM yyyy');
                          if (!months[monthKey]) months[monthKey] = { label: monthLabel, items: [] };
                          months[monthKey].items.push(item);
                        }

                        const monthEntries = Object.entries(months);

                        if (timelineItems.length === 0) {
                          return (
                            <div className="text-sm text-neutral-500 py-8 text-center">
                              No upcoming holidays or school breaks in range
                            </div>
                          );
                        }

                        const marketBadgeClasses = { NYC: 'bg-blue-100 text-blue-700', LA: 'bg-orange-100 text-orange-700', SF: 'bg-green-100 text-green-700' };

                        return (
                          <div className="relative">
                            {/* Legend */}
                            <div className="flex flex-wrap gap-3 mb-5 text-xs text-neutral-500">
                              <span className="flex items-center gap-1.5"><span className="w-2.5 h-2.5 rounded-full bg-red-500" /> US Public Holiday</span>
                              <span className="flex items-center gap-1.5"><span className="w-2.5 h-2.5 rounded-full bg-amber-400" /> School Break</span>
                              <span className="flex items-center gap-1.5"><span className="w-3 h-0.5 bg-red-200 rounded" /> &lt; 2 weeks</span>
                              <span className="flex items-center gap-1.5"><span className="w-3 h-0.5 bg-amber-200 rounded" /> &lt; 30 days</span>
                            </div>

                            {monthEntries.map(([monthKey, month], mi) => (
                              <div key={monthKey} className="relative">
                                {/* Month header */}
                                <div className="flex items-center gap-3 mb-3">
                                  <div className="text-xs font-semibold text-neutral-400 uppercase tracking-wider whitespace-nowrap">
                                    {month.label}
                                  </div>
                                  <div className="flex-1 h-px bg-neutral-200" />
                                </div>

                                {/* Timeline items for this month */}
                                <div className="relative ml-4 pl-6 border-l-2 border-neutral-200 pb-6">
                                  {month.items.map((item, ii) => {
                                    const isUrgent = item.daysAway <= 14;
                                    const isSoon = item.daysAway <= 30;
                                    const dotColor = item.kind === 'public'
                                      ? (isUrgent ? 'bg-red-500' : 'bg-red-400')
                                      : (isUrgent ? 'bg-amber-500' : 'bg-amber-400');
                                    const ringColor = isUrgent ? 'ring-red-100' : isSoon ? 'ring-amber-100' : 'ring-transparent';

                                    return (
                                      <div key={`${monthKey}-${ii}`} className="relative mb-4 last:mb-0">
                                        {/* Dot on timeline */}
                                        <div className={classNames(
                                          'absolute -left-[31px] top-1.5 w-3.5 h-3.5 rounded-full border-2 border-white ring-4',
                                          dotColor,
                                          ringColor,
                                        )} />

                                        {/* Card */}
                                        <div className={classNames(
                                          'rounded-lg border px-4 py-3 transition-colors',
                                          isUrgent ? 'bg-red-50 border-red-200' :
                                          isSoon ? 'bg-amber-50 border-amber-200' :
                                          'bg-white border-neutral-200'
                                        )}>
                                          <div className="flex items-start justify-between gap-3">
                                            <div className="min-w-0">
                                              <div className="flex items-center gap-2 flex-wrap">
                                                <span className="font-medium text-sm text-neutral-800">{item.name}</span>
                                                {item.kind === 'school' && item.market && (
                                                  <span className={`text-[10px] px-1.5 py-0.5 rounded font-medium ${marketBadgeClasses[item.market] || 'bg-neutral-100 text-neutral-700'}`}>
                                                    {item.market}
                                                  </span>
                                                )}
                                                {item.kind === 'public' && (
                                                  <span className="text-[10px] px-1.5 py-0.5 rounded font-medium bg-red-100 text-red-700">
                                                    Public
                                                  </span>
                                                )}
                                                {item.duration > 1 && (
                                                  <span className="text-[10px] px-1.5 py-0.5 rounded bg-neutral-100 text-neutral-500">
                                                    {item.duration} days
                                                  </span>
                                                )}
                                              </div>
                                              <div className="text-xs text-neutral-500 mt-0.5">{item.dateLabel}</div>
                                              {item.pastImpact && (
                                                <div className="text-xs text-neutral-500 mt-1">
                                                  Last year: <span className={item.pastImpact.deviation_pp < 0 ? 'text-red-600 font-medium' : 'text-green-600 font-medium'}>
                                                    {(item.pastImpact.completion_rate * 100).toFixed(0)}% completion ({item.pastImpact.deviation_pp > 0 ? '+' : ''}{item.pastImpact.deviation_pp}pp)
                                                  </span>
                                                </div>
                                              )}
                                            </div>
                                            <div className="text-right shrink-0">
                                              <div className={classNames(
                                                'text-sm font-semibold tabular-nums',
                                                isUrgent ? 'text-red-600' : isSoon ? 'text-amber-600' : 'text-neutral-500'
                                              )}>
                                                {item.daysAway <= 0 ? 'Today' : item.daysAway === 1 ? 'Tomorrow' : `${item.daysAway}d`}
                                              </div>
                                              {item.daysAway > 1 && (
                                                <div className="text-[10px] text-neutral-400">
                                                  {item.daysAway <= 7 ? 'this week' :
                                                   item.daysAway <= 14 ? 'next week' :
                                                   item.daysAway <= 30 ? 'this month' :
                                                   `${Math.ceil(item.daysAway / 7)}w`}
                                                </div>
                                              )}
                                            </div>
                                          </div>
                                        </div>
                                      </div>
                                    );
                                  })}
                                </div>
                              </div>
                            ))}
                          </div>
                        );
                      })()
                    ) : (
                      <>
                        {/* Past Holiday Impact */}
                        <div>
                          <h3 className="text-sm font-semibold text-neutral-800 mb-3 flex items-center gap-2">
                            <ArrowTrendingDownIcon className="h-4 w-4 text-red-500" />
                            Past Holiday Completion Rate Impact
                          </h3>
                          {holidayData.holiday_impact?.length > 0 ? (
                            <div className="overflow-x-auto">
                              <table className="w-full text-sm">
                                <thead>
                                  <tr className="border-b border-neutral-200">
                                    <th className="text-left py-2 px-3 text-xs text-neutral-500 font-medium">Holiday</th>
                                    <th className="text-left py-2 px-3 text-xs text-neutral-500 font-medium">Week</th>
                                    <th className="text-right py-2 px-3 text-xs text-neutral-500 font-medium">Completion</th>
                                    <th className="text-right py-2 px-3 text-xs text-neutral-500 font-medium">Expected</th>
                                    <th className="text-right py-2 px-3 text-xs text-neutral-500 font-medium">Impact</th>
                                    <th className="text-right py-2 px-3 text-xs text-neutral-500 font-medium">Appointments</th>
                                    <th className="text-right py-2 px-3 text-xs text-neutral-500 font-medium">Revenue Lost</th>
                                  </tr>
                                </thead>
                                <tbody>
                                  {holidayData.holiday_impact
                                    .sort((a, b) => b.week_start.localeCompare(a.week_start))
                                    .map((impact, i) => {
                                      const dt = DateTime.fromISO(impact.week_start);
                                      return (
                                        <tr key={i} className="border-b border-neutral-100 hover:bg-neutral-50">
                                          <td className="py-2.5 px-3">
                                            <span className="px-2 py-0.5 rounded bg-yellow-100 text-yellow-800 text-xs font-medium">
                                              {impact.holiday_name}
                                            </span>
                                          </td>
                                          <td className="py-2.5 px-3 text-neutral-600">
                                            {dt.toFormat('MMM d, yyyy')}
                                          </td>
                                          <td className={classNames(
                                            'py-2.5 px-3 text-right font-medium',
                                            impact.completion_rate >= 0.90 ? 'text-green-600' :
                                            impact.completion_rate >= 0.80 ? 'text-yellow-600' : 'text-red-600'
                                          )}>
                                            {(impact.completion_rate * 100).toFixed(1)}%
                                          </td>
                                          <td className="py-2.5 px-3 text-right text-neutral-500">
                                            {(impact.expected_rate * 100).toFixed(1)}%
                                          </td>
                                          <td className={classNames(
                                            'py-2.5 px-3 text-right font-medium',
                                            impact.deviation_pp >= 0 ? 'text-green-600' : 'text-red-600'
                                          )}>
                                            {impact.deviation_pp > 0 ? '+' : ''}{impact.deviation_pp}pp
                                          </td>
                                          <td className="py-2.5 px-3 text-right text-neutral-600">
                                            {impact.appointments_total?.toLocaleString()}
                                          </td>
                                          <td className="py-2.5 px-3 text-right text-red-600">
                                            {impact.revenue_lost ? formatCurrency(impact.revenue_lost) : '-'}
                                          </td>
                                        </tr>
                                      );
                                    })}
                                </tbody>
                              </table>
                            </div>
                          ) : (
                            <div className="text-center py-8 text-neutral-500">
                              <CalendarDaysIcon className="h-10 w-10 mx-auto mb-2 text-neutral-300" />
                              <p>No holiday impact data available for this period</p>
                            </div>
                          )}
                        </div>

                        {/* Past School Breaks */}
                        <div className="mt-6">
                          <h3 className="text-sm font-semibold text-neutral-800 mb-3 flex items-center gap-2">
                            <SunIcon className="h-4 w-4 text-amber-500" />
                            Past School Breaks
                            {holidayMarketFilter !== 'all' && <span className="text-xs text-neutral-500 font-normal">({holidayMarketFilter})</span>}
                          </h3>
                          <div className="space-y-2">
                            {holidayData.school_breaks
                              .filter(b => b.is_past)
                              .filter(b => holidayMarketFilter === 'all' || b.market === holidayMarketFilter)
                              .sort((a, b) => b.start.localeCompare(a.start))
                              .slice(0, 20)
                              .map((b, i) => {
                                const startDt = DateTime.fromISO(b.start);
                                const endDt = DateTime.fromISO(b.end);
                                const duration = Math.ceil(endDt.diff(startDt, 'days').days) + 1;
                                // Try to find impact data overlapping this break
                                const relatedImpact = holidayData.holiday_impact?.filter(imp => {
                                  return imp.week_start >= b.start && imp.week_start <= b.end;
                                });
                                const marketColors = { NYC: 'blue', LA: 'orange', SF: 'green' };
                                const color = marketColors[b.market] || 'neutral';
                                return (
                                  <div key={i} className="flex items-center justify-between bg-neutral-50 border border-neutral-100 rounded-lg px-4 py-3">
                                    <div>
                                      <div className="flex items-center gap-2">
                                        <span className={`text-[10px] px-1.5 py-0.5 rounded font-medium bg-${color}-100 text-${color}-700`}>
                                          {b.market}
                                        </span>
                                        <span className="font-medium text-neutral-700">{b.name.replace(`${b.market} `, '')}</span>
                                      </div>
                                      <div className="text-xs text-neutral-500 mt-0.5">
                                        {startDt.toFormat('MMM d')} - {endDt.toFormat('MMM d, yyyy')}
                                        {duration > 1 && ` (${duration} days)`}
                                      </div>
                                    </div>
                                    {relatedImpact && relatedImpact.length > 0 && (
                                      <div className="text-right">
                                        <div className="text-xs text-red-600 font-medium">
                                          Avg {(relatedImpact.reduce((sum, r) => sum + r.completion_rate, 0) / relatedImpact.length * 100).toFixed(0)}% completion
                                        </div>
                                      </div>
                                    )}
                                  </div>
                                );
                              })}
                            {holidayData.school_breaks
                              .filter(b => b.is_past)
                              .filter(b => holidayMarketFilter === 'all' || b.market === holidayMarketFilter)
                              .length === 0 && (
                              <div className="text-sm text-neutral-500 py-4 text-center">No past school breaks in range</div>
                            )}
                          </div>
                        </div>
                      </>
                    )}

                    {/* Summary note */}
                    <div className="mt-6 bg-purple-50 border border-purple-100 rounded-lg px-4 py-3 text-xs text-purple-700">
                      School break dates are approximate based on typical district calendars for NYC (DOE), LA (LAUSD), and SF (SFUSD).
                      Past impact data shows actual completion rate dips during holiday weeks vs. the 4-week rolling average.
                    </div>
                  </>
                ) : (
                  <div className="text-center py-12 text-neutral-500">
                    <CalendarDaysIcon className="h-12 w-12 mx-auto mb-3 text-neutral-300" />
                    <p className="text-lg font-medium">Unable to load holiday data</p>
                    <p className="text-sm mt-1">Try refreshing.</p>
                  </div>
                )}
              </div>
            )}
          </div>

          {/* Footer */}
          <div className="px-4 sm:px-6 py-3 border-t border-neutral-100 bg-neutral-50 text-xs text-neutral-500">
            <div className="flex items-center justify-between">
              <span>
                Completion Rate = (Complete + Cancelled-Chargeable) / Total ·
                Revenue Lost = Cancelled (non-chargeable) × charge rate
              </span>
              <span>
                Data from last {lookbackDays} days
              </span>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
