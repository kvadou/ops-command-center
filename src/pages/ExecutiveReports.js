import React, { useState, useEffect, useCallback } from 'react';
import { useSearchParams } from 'react-router-dom';
import axios from 'axios';
import { DateTime } from 'luxon';
import { HomeIcon, ComputerDesktopIcon, BuildingLibraryIcon, PuzzlePieceIcon } from '@heroicons/react/24/outline';
import SegmentCard from '../components/reports/SegmentCard';
import MetricDrilldownModal from '../components/reports/MetricDrilldownModal';
import ForecastDrilldownModal from '../components/reports/ForecastDrilldownModal';
import TotalBusinessOverview from '../components/reports/TotalBusinessOverview';

// Format currency values
const fmtCurrency = (val) => {
  if (val == null) return '$0';
  return '$' + Math.round(val).toLocaleString();
};

// Format YoY badge
const YoYBadge = ({ pct }) => {
  if (pct == null) return <span className="text-xs text-neutral-400">N/A</span>;
  const positive = pct >= 0;
  return (
    <span className={`inline-flex items-center gap-0.5 text-xs font-semibold ${positive ? 'text-green-700' : 'text-red-600'}`}>
      {positive ? '↑' : '↓'} {Math.abs(pct).toFixed(1)}%
    </span>
  );
};

// Channel display config
const CHANNEL_CONFIG = {
  home: { label: 'Home Lessons', Icon: HomeIcon },
  digital: { label: 'Online Lessons', Icon: ComputerDesktopIcon },
  schools: { label: 'Schools', Icon: BuildingLibraryIcon },
  clubs: { label: 'Clubs', Icon: PuzzlePieceIcon },
};

/**
 * Executive Reports Page
 * Business Intelligence dashboard with weekly/monthly reports organized by segment
 * Includes Historical (backward-looking) and Forecast (forward-looking) views
 */
const ExecutiveReports = () => {
  const [searchParams, setSearchParams] = useSearchParams();
  const [viewMode, setViewMode] = useState(searchParams.get('view') || 'historical');
  const [reportType, setReportType] = useState(searchParams.get('type') || 'weekly');
  const [selectedPeriod, setSelectedPeriod] = useState(searchParams.get('period') || '');
  const [includeYoY, setIncludeYoY] = useState(searchParams.get('yoy') !== 'false'); // default true
  const [availablePeriods, setAvailablePeriods] = useState([]);
  const [reportData, setReportData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState(null);

  // Forecast-specific state
  const [forecastPreset, setForecastPreset] = useState(searchParams.get('preset') || 'next-3-weeks');
  const [forecastReportType, setForecastReportType] = useState(searchParams.get('ftype') || 'weekly');
  const [forecastPeriod, setForecastPeriod] = useState(searchParams.get('fperiod') || '');
  const [forecastData, setForecastData] = useState(null);
  const [forecastLoading, setForecastLoading] = useState(false);
  const [forecastError, setForecastError] = useState(null);

  // Drill-down modal state (historical)
  const [drilldownModal, setDrilldownModal] = useState({
    open: false,
    metricKey: null,
    metricLabel: null,
    segment: null,
    currentValue: null,
    period: 'current'
  });

  // Forecast drill-down modal state
  const [forecastDrilldown, setForecastDrilldown] = useState({
    open: false,
    metricKey: null,
    metricLabel: null,
    channel: null,
    currentValue: null,
    completionRate: null
  });

  // Format date range for display
  const formatDateRange = useCallback((startDate, endDate, type) => {
    if (!startDate || !endDate) return '';
    const start = DateTime.fromISO(startDate);
    const end = DateTime.fromISO(endDate);

    if (type === 'annually') {
      return start.toFormat('yyyy');
    }

    if (type === 'quarterly') {
      const quarter = Math.ceil(start.month / 3);
      return `Q${quarter} ${start.toFormat('yyyy')}`;
    }

    if (type === 'monthly') {
      return start.toFormat('MMMM yyyy');
    }

    // Weekly format: "Jan 6-12" or "Dec 30 - Jan 5"
    if (start.month === end.month) {
      return `${start.toFormat('MMM d')}-${end.toFormat('d')}`;
    }
    return `${start.toFormat('MMM d')} - ${end.toFormat('MMM d')}`;
  }, []);

  // ============================================================
  // HISTORICAL VIEW: Fetch available periods
  // ============================================================
  useEffect(() => {
    if (viewMode !== 'historical') return;

    const fetchAvailablePeriods = async () => {
      try {
        const response = await axios.get(`/api/reports/available-periods/${reportType}`, {
          withCredentials: true
        });
        setAvailablePeriods(response.data.periods || []);

        if (!selectedPeriod && response.data.periods?.length > 0) {
          const mostRecent = response.data.periods[0];
          setSelectedPeriod(mostRecent.start);
        }
      } catch (err) {
        console.error('Error fetching available periods:', err);
        generateLocalPeriods();
      }
    };

    const generateLocalPeriods = () => {
      const periods = [];
      const now = DateTime.now();

      if (reportType === 'weekly') {
        for (let i = 0; i < 52; i++) {
          const weekStart = now.minus({ weeks: i }).startOf('week');
          const weekEnd = weekStart.endOf('week');
          periods.push({
            start: weekStart.toISODate(),
            end: weekEnd.toISODate(),
            label: formatDateRange(weekStart.toISODate(), weekEnd.toISODate(), 'weekly')
          });
        }
      } else if (reportType === 'quarterly') {
        for (let i = 0; i < 12; i++) {
          const quarterMonth = now.minus({ months: i * 3 });
          const quarter = Math.ceil(quarterMonth.month / 3);
          const quarterStart = DateTime.fromObject({ year: quarterMonth.year, month: (quarter - 1) * 3 + 1, day: 1 });
          const quarterEnd = quarterStart.plus({ months: 3 }).minus({ days: 1 }).endOf('day');
          periods.push({
            start: quarterStart.toISODate(),
            end: quarterEnd.toISODate(),
            label: formatDateRange(quarterStart.toISODate(), quarterEnd.toISODate(), 'quarterly')
          });
        }
      } else if (reportType === 'annually') {
        for (let i = 0; i < 5; i++) {
          const yearStart = now.minus({ years: i }).startOf('year');
          const yearEnd = yearStart.endOf('year');
          periods.push({
            start: yearStart.toISODate(),
            end: yearEnd.toISODate(),
            label: formatDateRange(yearStart.toISODate(), yearEnd.toISODate(), 'annually')
          });
        }
      } else {
        for (let i = 0; i < 24; i++) {
          const monthStart = now.minus({ months: i }).startOf('month');
          const monthEnd = monthStart.endOf('month');
          periods.push({
            start: monthStart.toISODate(),
            end: monthEnd.toISODate(),
            label: formatDateRange(monthStart.toISODate(), monthEnd.toISODate(), 'monthly')
          });
        }
      }

      setAvailablePeriods(periods);
      if (!selectedPeriod && periods.length > 0) {
        setSelectedPeriod(periods[0].start);
      }
    };

    fetchAvailablePeriods();
  }, [reportType, formatDateRange, selectedPeriod, viewMode]);

  // HISTORICAL VIEW: Fetch report data
  useEffect(() => {
    if (viewMode !== 'historical') return;

    const fetchReportData = async () => {
      if (!selectedPeriod) return;

      setLoading(true);
      setError(null);

      try {
        const now = DateTime.now();
        const selected = DateTime.fromISO(selectedPeriod);

        let offset = 0;
        let params;
        if (reportType === 'weekly') {
          offset = Math.floor(now.diff(selected, 'weeks').weeks);
          params = { weekOffset: offset, includeYoY: includeYoY.toString() };
        } else if (reportType === 'quarterly') {
          offset = Math.floor(now.diff(selected, 'months').months / 3);
          params = { quarterOffset: offset, includeYoY: includeYoY.toString() };
        } else if (reportType === 'annually') {
          offset = Math.floor(now.diff(selected, 'years').years);
          params = { yearOffset: offset, includeYoY: includeYoY.toString() };
        } else {
          offset = Math.floor(now.diff(selected, 'months').months);
          params = { monthOffset: offset, includeYoY: includeYoY.toString() };
        }

        const response = await axios.get(`/api/reports/multi-period/${reportType}`, {
          params,
          withCredentials: true
        });

        setReportData(response.data);
      } catch (err) {
        console.error('Error fetching report data:', err);
        setError(err.response?.data?.error || err.message || 'Failed to load report data');
      } finally {
        setLoading(false);
      }
    };

    fetchReportData();
  }, [reportType, selectedPeriod, includeYoY, viewMode]);

  // ============================================================
  // FORECAST VIEW: Fetch forecast data (multi-period)
  // ============================================================
  useEffect(() => {
    if (viewMode !== 'forecast') return;

    const fetchForecastData = async () => {
      setForecastLoading(true);
      setForecastError(null);

      try {
        const params = {
          report_type: forecastReportType,
          includeYoY: includeYoY.toString()
        };
        if (forecastPeriod) params.start_date = forecastPeriod;

        const response = await axios.get('/api/forecast/executive-multi-period', {
          params,
          withCredentials: true
        });
        setForecastData(response.data);

        // Auto-select first available period if none set
        if (!forecastPeriod && response.data.availablePeriods?.length > 0) {
          setForecastPeriod(response.data.availablePeriods[0].start);
        }
      } catch (err) {
        console.error('Error fetching forecast data:', err);
        setForecastError(err.response?.data?.error || err.message || 'Failed to load forecast data');
      } finally {
        setForecastLoading(false);
      }
    };

    fetchForecastData();
  }, [forecastReportType, forecastPeriod, includeYoY, viewMode]);

  // Update URL params when selections change
  useEffect(() => {
    const params = new URLSearchParams();
    params.set('view', viewMode);
    if (viewMode === 'historical') {
      params.set('type', reportType);
      if (selectedPeriod) params.set('period', selectedPeriod);
    } else {
      params.set('ftype', forecastReportType);
      if (forecastPeriod) params.set('fperiod', forecastPeriod);
    }
    if (!includeYoY) params.set('yoy', 'false');
    setSearchParams(params, { replace: true });
  }, [viewMode, reportType, selectedPeriod, forecastPreset, includeYoY, setSearchParams]);

  // Quick preset handlers (historical)
  const handleThisWeek = () => {
    setReportType('weekly');
    const weekStart = DateTime.now().startOf('week');
    setSelectedPeriod(weekStart.toISODate());
  };

  const handleLastWeek = () => {
    setReportType('weekly');
    const weekStart = DateTime.now().minus({ weeks: 1 }).startOf('week');
    setSelectedPeriod(weekStart.toISODate());
  };

  const handleTwoWeeksAgo = () => {
    setReportType('weekly');
    const weekStart = DateTime.now().minus({ weeks: 2 }).startOf('week');
    setSelectedPeriod(weekStart.toISODate());
  };

  const handleThisMonth = () => {
    setReportType('monthly');
    const monthStart = DateTime.now().startOf('month');
    setSelectedPeriod(monthStart.toISODate());
  };

  const handleThisQuarter = () => {
    setReportType('quarterly');
    const now = DateTime.now();
    const quarter = Math.ceil(now.month / 3);
    const quarterStart = DateTime.fromObject({ year: now.year, month: (quarter - 1) * 3 + 1, day: 1 });
    setSelectedPeriod(quarterStart.toISODate());
  };

  const handleThisYear = () => {
    setReportType('annually');
    const yearStart = DateTime.now().startOf('year');
    setSelectedPeriod(yearStart.toISODate());
  };

  // Force refresh (historical)
  const handleRefresh = async () => {
    if (!selectedPeriod || refreshing) return;
    setRefreshing(true);
    try {
      const now = DateTime.now();
      const selected = DateTime.fromISO(selectedPeriod);
      let offset = 0;
      let params;
      if (reportType === 'weekly') {
        offset = Math.floor(now.diff(selected, 'weeks').weeks);
        params = { weekOffset: offset };
      } else if (reportType === 'quarterly') {
        offset = Math.floor(now.diff(selected, 'months').months / 3);
        params = { quarterOffset: offset };
      } else if (reportType === 'annually') {
        offset = Math.floor(now.diff(selected, 'years').years);
        params = { yearOffset: offset };
      } else {
        offset = Math.floor(now.diff(selected, 'months').months);
        params = { monthOffset: offset };
      }

      const response = await axios.post(
        `/api/reports/multi-period/${reportType}/refresh`,
        null,
        { params, withCredentials: true }
      );

      setReportData(response.data);
    } catch (err) {
      console.error('Error refreshing report:', err);
      setError('Failed to refresh report data');
    } finally {
      setRefreshing(false);
    }
  };

  // Get period labels for display (historical)
  const getPeriodLabels = () => {
    if (!reportData) return { current: '', previous: '', twoAgo: '', yoy: '' };

    const { currentPeriod, previousPeriod, twoPeriodsAgo, yoyPeriod } = reportData;

    return {
      current: currentPeriod?.dateRange
        ? formatDateRange(currentPeriod.dateRange.start, currentPeriod.dateRange.end, reportType)
        : '',
      previous: previousPeriod?.dateRange
        ? formatDateRange(previousPeriod.dateRange.start, previousPeriod.dateRange.end, reportType)
        : '',
      twoAgo: twoPeriodsAgo?.dateRange
        ? formatDateRange(twoPeriodsAgo.dateRange.start, twoPeriodsAgo.dateRange.end, reportType)
        : '',
      yoy: yoyPeriod?.dateRange
        ? formatDateRange(yoyPeriod.dateRange.start, yoyPeriod.dateRange.end, reportType)
        : ''
    };
  };

  const periodLabels = getPeriodLabels();

  const getPeriodDateRange = useCallback((period = 'current') => {
    if (!reportData) return null;

    const periodMap = {
      current: reportData.currentPeriod,
      previous: reportData.previousPeriod,
      twoAgo: reportData.twoPeriodsAgo
    };

    const periodData = periodMap[period];
    if (!periodData?.dateRange) return null;

    return {
      start: periodData.dateRange.start,
      end: periodData.dateRange.end
    };
  }, [reportData]);

  const handleMetricClick = useCallback((segment) => (metricKey, metricLabel, value, period = 'current') => {
    setDrilldownModal({
      open: true,
      metricKey,
      metricLabel,
      segment,
      currentValue: value,
      period
    });
  }, []);

  const closeDrilldownModal = useCallback(() => {
    setDrilldownModal({
      open: false,
      metricKey: null,
      metricLabel: null,
      segment: null,
      currentValue: null,
      period: 'current'
    });
  }, []);

  // ============================================================
  // FORECAST VIEW: Render (mirrors historical layout)
  // ============================================================
  const forecastQuickPresets = {
    weekly: [
      { label: 'Next Week', action: () => { setForecastReportType('weekly'); setForecastPeriod(''); } },
      { label: '+2 Weeks', action: () => { setForecastReportType('weekly'); const w = DateTime.now().plus({ weeks: 2 }).startOf('week'); setForecastPeriod(w.toISODate()); } },
      { label: '+3 Weeks', action: () => { setForecastReportType('weekly'); const w = DateTime.now().plus({ weeks: 3 }).startOf('week'); setForecastPeriod(w.toISODate()); } },
    ],
    common: [
      { label: 'Next Month', action: () => { setForecastReportType('monthly'); setForecastPeriod(''); } },
      { label: 'Next Quarter', action: () => { setForecastReportType('quarterly'); setForecastPeriod(''); } },
    ]
  };

  const FORECAST_METRICS = [
    { key: 'revenue', label: 'Forecast Revenue', format: 'currency' },
    { key: 'lessons', label: 'Forecast Lessons', format: 'number' },
    { key: 'tutorPay', label: 'Forecast Tutor Pay', format: 'currency' },
    { key: 'profit', label: 'Forecast Profit', format: 'currency' },
  ];

  const renderForecastView = () => {
    const isLoading = forecastLoading;
    const err = forecastError;
    const data = forecastData;
    const periods = data?.data || [];
    const typeLabel = forecastReportType === 'monthly' ? 'Month' : forecastReportType === 'quarterly' ? 'Quarter' : 'Week';

    return (
      <>
        {/* Period Selector (mirrors historical) */}
        <div className="bg-white rounded-xl shadow-sm border border-neutral-200 p-6">
          <div className="flex flex-wrap items-center gap-4 mb-4">
            <div>
              <label className="block text-xs font-medium text-neutral-500 mb-1">Report Type</label>
              <select
                value={forecastReportType}
                onChange={(e) => { setForecastReportType(e.target.value); setForecastPeriod(''); }}
                className="px-4 py-2 border border-neutral-300 rounded-lg focus:ring-2 focus:ring-purple-500 focus:border-purple-500 text-sm font-medium"
              >
                <option value="weekly">Weekly</option>
                <option value="monthly">Monthly</option>
                <option value="quarterly">Quarterly</option>
              </select>
            </div>

            <div className="flex-1 max-w-xs">
              <label className="block text-xs font-medium text-neutral-500 mb-1">Starting Period</label>
              <select
                value={forecastPeriod}
                onChange={(e) => setForecastPeriod(e.target.value)}
                className="w-full px-4 py-2 border border-neutral-300 rounded-lg focus:ring-2 focus:ring-purple-500 focus:border-purple-500 text-sm font-medium"
              >
                {(data?.availablePeriods || []).map((p) => (
                  <option key={p.start} value={p.start}>{p.label}</option>
                ))}
              </select>
            </div>
          </div>

          <div className="flex flex-wrap items-center justify-between gap-4">
            <div className="flex flex-wrap items-center gap-2">
              <span className="text-xs font-medium text-neutral-500">Quick:</span>
              {forecastQuickPresets.weekly.map((p) => (
                <button key={p.label} onClick={p.action} className="px-3 py-1.5 text-sm font-medium text-purple-700 bg-purple-50 rounded-lg hover:bg-purple-100 transition-colors">{p.label}</button>
              ))}
              {forecastQuickPresets.common.map((p) => (
                <button key={p.label} onClick={p.action} className="px-3 py-1.5 text-sm font-medium text-purple-700 bg-purple-50 rounded-lg hover:bg-purple-100 transition-colors">{p.label}</button>
              ))}
            </div>

            <label className="flex items-center gap-2 cursor-pointer">
              <input
                type="checkbox"
                checked={includeYoY}
                onChange={(e) => setIncludeYoY(e.target.checked)}
                className="w-4 h-4 text-purple-600 border-neutral-300 rounded focus:ring-purple-500"
              />
              <span className="text-sm font-medium text-neutral-700">Show Year-over-Year</span>
            </label>
          </div>
        </div>

        {/* 3-Period Comparison Header */}
        {data && periods.length === 3 && !isLoading && (
          <div className="bg-white rounded-xl shadow-sm border border-neutral-200 p-6">
            <h3 className="text-sm font-semibold text-neutral-700 mb-4">
              3-{typeLabel} Forecast Comparison {includeYoY ? '(with Year-over-Year)' : ''}
            </h3>
            <div className="flex items-center justify-center gap-4">
              {periods.map((p, i) => (
                <React.Fragment key={i}>
                  {i > 0 && <span className="text-neutral-300">→</span>}
                  <div className={`text-center px-4 py-2 rounded-lg ${i === 0 ? 'bg-purple-50 border-2 border-purple-200' : 'bg-neutral-50 border border-neutral-200'}`}>
                    <div className="text-xs text-neutral-500">{i === 0 ? `${typeLabel} 1 ★` : `${typeLabel} ${i + 1}`}</div>
                    <div className={`text-sm font-semibold ${i === 0 ? 'text-purple-700' : 'text-neutral-700'}`}>{p.label}</div>
                  </div>
                </React.Fragment>
              ))}
            </div>
            <p className="text-xs text-neutral-400 text-center mt-3">
              Forecast based on scheduled lessons at {Math.round((data.completionRate || 0.75) * 100)}% completion rate
              {includeYoY && ' · YoY compares forecast vs. actuals from same period last year'}
            </p>
          </div>
        )}

        {/* Loading State */}
        {isLoading && (
          <div className="flex items-center justify-center py-12">
            <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-purple-600"></div>
            <span className="ml-4 text-neutral-600">Loading forecast data...</span>
          </div>
        )}

        {err && (
          <div className="bg-red-50 border border-red-200 rounded-lg p-4">
            <p className="text-red-800">Error: {err}</p>
          </div>
        )}

        {/* Forecast Metrics Table (mirrors Total Business Overview) */}
        {data && periods.length === 3 && !isLoading && !err && (
          <div className="bg-white rounded-xl shadow-sm border border-neutral-200 overflow-hidden">
            <div className="bg-gradient-to-r from-brand-navy via-brand-purple to-brand-navy px-6 py-4">
              <h3 className="text-white font-semibold flex items-center gap-2">
                Forecast Overview {includeYoY ? '(with YoY)' : ''}
              </h3>
            </div>
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="bg-neutral-50 border-b border-neutral-200">
                    <th className="text-left px-6 py-3 text-xs font-semibold text-neutral-500 uppercase">Metric</th>
                    {periods.map((p, i) => (
                      <th key={i} className={`text-right px-4 py-3 text-xs font-semibold uppercase ${i === 0 ? 'text-purple-600' : 'text-neutral-500'}`}>
                        {p.label} {i === 0 && '★'}
                      </th>
                    ))}
                    <th className="text-right px-4 py-3 text-xs font-semibold text-neutral-500 uppercase">
                      <span title={`${typeLabel} 3 vs ${typeLabel} 1`}>{typeLabel} 3 vs 1</span>
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {FORECAST_METRICS.map((metric) => {
                    const vals = periods.map(p => p.summary[metric.key]);
                    const change = data.change?.[metric.key];
                    const fmt = (v) => metric.format === 'currency' ? fmtCurrency(v) : Math.round(v).toLocaleString();

                    return (
                      <React.Fragment key={metric.key}>
                        <tr className="border-b border-neutral-100 hover:bg-neutral-50/50">
                          <td className="px-6 py-3 font-medium text-neutral-800">{metric.label}</td>
                          {vals.map((v, i) => (
                            <td
                              key={i}
                              className={`text-right px-4 py-3 cursor-pointer hover:text-purple-600 ${i === 0 ? 'font-semibold text-purple-700' : 'text-neutral-700'}`}
                              onClick={() => setForecastDrilldown({
                                open: true,
                                metricKey: metric.key,
                                metricLabel: `${metric.label} - ${periods[i].label}`,
                                channel: 'all',
                                currentValue: v,
                                completionRate: data.completionRate,
                                dateRange: { start: periods[i].start, end: periods[i].end }
                              })}
                              title="Click to view details"
                            >
                              {fmt(v)}
                            </td>
                          ))}
                          <td className="text-right px-4 py-3">
                            {change != null && (
                              <span className={`text-sm font-semibold ${change >= 0 ? 'text-green-700' : 'text-red-600'}`}>
                                {change >= 0 ? '↑' : '↓'} {Math.abs(change).toFixed(1)}%
                              </span>
                            )}
                          </td>
                        </tr>
                        {/* YoY sub-row */}
                        {includeYoY && data.yoy && (
                          <tr className="border-b border-neutral-50 bg-neutral-50/30">
                            <td className="px-6 py-1.5 text-xs text-neutral-400 pl-10">YoY:</td>
                            {data.yoy.data.map((yoyP, i) => (
                              <td key={i} className="text-right px-4 py-1.5 text-xs text-neutral-400">
                                {fmt(yoyP[metric.key])}
                                {yoyP.yoyPct[metric.key] != null && (
                                  <span className={`ml-1 ${yoyP.yoyPct[metric.key] >= 0 ? 'text-green-600' : 'text-red-500'}`}>
                                    {yoyP.yoyPct[metric.key] >= 0 ? '↑' : '↓'}{Math.abs(yoyP.yoyPct[metric.key]).toFixed(1)}%
                                  </span>
                                )}
                              </td>
                            ))}
                            <td></td>
                          </tr>
                        )}
                      </React.Fragment>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>
        )}

        {/* Channel Breakdown for nearest period */}
        {data && periods.length > 0 && !isLoading && !err && (
          <div className="bg-white rounded-xl shadow-sm border border-neutral-200 overflow-hidden">
            <div className="px-6 py-4 border-b border-neutral-100">
              <h3 className="text-sm font-semibold text-neutral-700">Channel Breakdown — {periods[0]?.label}</h3>
            </div>
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="bg-neutral-50 border-b border-neutral-100">
                    <th className="text-left px-6 py-3 text-xs font-semibold text-neutral-500 uppercase">Channel</th>
                    <th className="text-right px-4 py-3 text-xs font-semibold text-neutral-500 uppercase">Revenue</th>
                    <th className="text-right px-4 py-3 text-xs font-semibold text-neutral-500 uppercase">Lessons</th>
                    <th className="text-right px-4 py-3 text-xs font-semibold text-neutral-500 uppercase">Tutor Pay</th>
                    <th className="text-right px-4 py-3 text-xs font-semibold text-neutral-500 uppercase">Profit</th>
                    <th className="text-center px-4 py-3 text-xs font-semibold text-neutral-500 uppercase" title="Historical completion rate applied to scheduled lessons">Completion %</th>
                  </tr>
                </thead>
                <tbody>
                  {Object.entries(CHANNEL_CONFIG).map(([ch, cfg]) => {
                    const chData = periods[0]?.byChannel?.[ch];
                    if (!chData) return null;
                    return (
                      <tr
                        key={ch}
                        className="border-b border-neutral-50 hover:bg-neutral-50/50 cursor-pointer"
                        onClick={() => setForecastDrilldown({
                          open: true,
                          metricKey: 'revenue',
                          metricLabel: `${cfg.label} Revenue`,
                          channel: ch,
                          currentValue: chData.revenue,
                          completionRate: chData.completionRate,
                          dateRange: { start: periods[0].start, end: periods[0].end }
                        })}
                        title="Click to view lesson details"
                      >
                        <td className="px-6 py-3 font-medium text-neutral-800">
                          <span className="inline-flex items-center gap-2">
                            <cfg.Icon className="h-5 w-5 text-brand-purple" />
                            {cfg.label}
                          </span>
                        </td>
                        <td className="text-right px-4 py-3 font-semibold text-neutral-900">{fmtCurrency(chData.revenue)}</td>
                        <td className="text-right px-4 py-3 font-semibold text-neutral-900">{chData.lessons.toLocaleString()}</td>
                        <td className="text-right px-4 py-3 text-neutral-700">{fmtCurrency(chData.tutorPay)}</td>
                        <td className="text-right px-4 py-3 text-neutral-700">{fmtCurrency(chData.profit)}</td>
                        <td className="text-center px-4 py-3 text-neutral-500">{Math.round(chData.completionRate * 100)}%</td>
                      </tr>
                    );
                  })}
                  <tr className="bg-neutral-50 font-semibold">
                    <td className="px-6 py-3 text-neutral-800">Total</td>
                    <td className="text-right px-4 py-3 text-neutral-900">{fmtCurrency(periods[0]?.summary?.revenue)}</td>
                    <td className="text-right px-4 py-3 text-neutral-900">{(periods[0]?.summary?.lessons || 0).toLocaleString()}</td>
                    <td className="text-right px-4 py-3 text-neutral-800">{fmtCurrency(periods[0]?.summary?.tutorPay)}</td>
                    <td className="text-right px-4 py-3 text-neutral-800">{fmtCurrency(periods[0]?.summary?.profit)}</td>
                    <td className="text-center px-4 py-3 text-neutral-500">{Math.round((data.completionRate || 0.75) * 100)}%</td>
                  </tr>
                </tbody>
              </table>
            </div>
          </div>
        )}
      </>
    );
  };

  // ============================================================
  // HISTORICAL VIEW: Render
  // ============================================================
  const renderHistoricalView = () => (
    <>
      {/* Period Selector */}
      <div className="bg-white rounded-xl shadow-sm border border-neutral-200 p-6">
        <div className="flex flex-wrap items-center gap-4 mb-4">
          {/* Report Type Dropdown */}
          <div>
            <label className="block text-xs font-medium text-neutral-500 mb-1">Report Type</label>
            <select
              value={reportType}
              onChange={(e) => setReportType(e.target.value)}
              className="px-4 py-2 border border-neutral-300 rounded-lg focus:ring-2 focus:ring-purple-500 focus:border-purple-500 text-sm font-medium"
            >
              <option value="weekly">Weekly</option>
              <option value="monthly">Monthly</option>
              <option value="quarterly">Quarterly</option>
              <option value="annually">Annually</option>
            </select>
          </div>

          {/* Period Dropdown */}
          <div className="flex-1 max-w-xs">
            <label className="block text-xs font-medium text-neutral-500 mb-1">Period</label>
            <select
              value={selectedPeriod}
              onChange={(e) => setSelectedPeriod(e.target.value)}
              className="w-full px-4 py-2 border border-neutral-300 rounded-lg focus:ring-2 focus:ring-purple-500 focus:border-purple-500 text-sm font-medium"
            >
              {availablePeriods.map((period) => (
                <option key={period.start} value={period.start}>
                  {period.label}
                </option>
              ))}
            </select>
          </div>
        </div>

        {/* Quick Presets and YoY Toggle */}
        <div className="flex flex-wrap items-center justify-between gap-4">
          <div className="flex flex-wrap items-center gap-2">
            <span className="text-xs font-medium text-neutral-500">Quick:</span>
            <button onClick={handleThisWeek} className="px-3 py-1.5 text-sm font-medium text-purple-700 bg-purple-50 rounded-lg hover:bg-purple-100 transition-colors">This Week</button>
            <button onClick={handleLastWeek} className="px-3 py-1.5 text-sm font-medium text-purple-700 bg-purple-50 rounded-lg hover:bg-purple-100 transition-colors">Last Week</button>
            <button onClick={handleTwoWeeksAgo} className="px-3 py-1.5 text-sm font-medium text-purple-700 bg-purple-50 rounded-lg hover:bg-purple-100 transition-colors">2 Weeks Ago</button>
            <button onClick={handleThisMonth} className="px-3 py-1.5 text-sm font-medium text-purple-700 bg-purple-50 rounded-lg hover:bg-purple-100 transition-colors">This Month</button>
            <button onClick={handleThisQuarter} className="px-3 py-1.5 text-sm font-medium text-purple-700 bg-purple-50 rounded-lg hover:bg-purple-100 transition-colors">This Quarter</button>
            <button onClick={handleThisYear} className="px-3 py-1.5 text-sm font-medium text-purple-700 bg-purple-50 rounded-lg hover:bg-purple-100 transition-colors">This Year</button>
          </div>

          <div className="flex items-center gap-4">
            <label className="flex items-center gap-2 cursor-pointer">
              <input
                type="checkbox"
                checked={includeYoY}
                onChange={(e) => setIncludeYoY(e.target.checked)}
                className="w-4 h-4 text-purple-600 border-neutral-300 rounded focus:ring-purple-500"
              />
              <span className="text-sm font-medium text-neutral-700">Show Year-over-Year</span>
            </label>

            <div className="flex items-center gap-2">
              <button
                onClick={handleRefresh}
                disabled={refreshing || loading}
                className="flex items-center gap-1.5 px-3 py-1.5 text-sm font-medium text-neutral-600 bg-neutral-100 rounded-lg hover:bg-neutral-200 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
                title="Recompute data (bypasses cache)"
              >
                <svg className={`w-4 h-4 ${refreshing ? 'animate-spin' : ''}`} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
                </svg>
                {refreshing ? 'Refreshing...' : 'Refresh Data'}
              </button>
              {reportData?._meta?.fromSnapshot && reportData._meta.computedAt && (
                <span className="text-xs text-neutral-400" title={`Computed in ${reportData._meta.computationTimeMs}ms`}>
                  Cached {DateTime.fromISO(reportData._meta.computedAt).toRelative()}
                </span>
              )}
            </div>
          </div>
        </div>
      </div>

      {/* Period Timeline */}
      {reportData && !loading && (
        <div className="bg-white rounded-xl shadow-sm border border-neutral-200 p-6">
          <h2 className="text-sm font-semibold text-neutral-600 mb-4">
            {reportType === 'weekly' ? '3-Week' : reportType === 'monthly' ? '3-Month' : reportType === 'quarterly' ? '3-Quarter' : '3-Year'} Comparison
            {includeYoY && ' (with Year-over-Year)'}
          </h2>
          <div className="flex items-center justify-center gap-4 flex-wrap">
            <div className="text-center px-4 py-2 bg-neutral-50 rounded-lg">
              <div className="text-xs text-neutral-500 mb-1">2 {reportType === 'weekly' ? 'Weeks' : reportType === 'monthly' ? 'Months' : reportType === 'quarterly' ? 'Quarters' : 'Years'} Ago</div>
              <div className="text-sm font-semibold text-neutral-700">{periodLabels.twoAgo}</div>
            </div>
            <div className="text-neutral-400">&rarr;</div>
            <div className="text-center px-4 py-2 bg-neutral-50 rounded-lg">
              <div className="text-xs text-neutral-500 mb-1">Previous</div>
              <div className="text-sm font-semibold text-neutral-700">{periodLabels.previous}</div>
            </div>
            <div className="text-neutral-400">&rarr;</div>
            <div className="text-center px-4 py-2 bg-purple-50 border-2 border-purple-200 rounded-lg">
              <div className="text-xs text-purple-600 mb-1">Current ★</div>
              <div className="text-sm font-semibold text-purple-700">{periodLabels.current}</div>
            </div>
          </div>
          {includeYoY && (
            <p className="text-xs text-neutral-500 text-center mt-3">
              YoY comparison shows each period vs. the same period one year ago
            </p>
          )}
        </div>
      )}

      {/* Loading State */}
      {loading && (
        <div className="flex items-center justify-center py-12">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-purple-600"></div>
          <span className="ml-4 text-neutral-600">Loading report data...</span>
        </div>
      )}

      {/* Error State */}
      {error && (
        <div className="bg-red-50 border border-red-200 rounded-lg p-4">
          <p className="text-red-800">Error: {error}</p>
        </div>
      )}

      {/* Total Business Overview */}
      {reportData && reportData.totalBusinessMetrics && !loading && !error && (
        <TotalBusinessOverview
          totalBusinessMetrics={reportData.totalBusinessMetrics}
          periodLabels={periodLabels}
          reportType={reportType}
          onMetricClick={handleMetricClick('total')}
          includeYoY={includeYoY}
          daysInPeriod={{
            current: reportData.currentPeriod?.daysInPeriod,
            previous: reportData.previousPeriod?.daysInPeriod,
            twoAgo: reportData.twoPeriodsAgo?.daysInPeriod
          }}
        />
      )}

      {/* Report Segments */}
      {reportData && !loading && !error && (
        <div className="space-y-6">
          <SegmentCard
            title="Home Lessons" icon="🏠" segment="home"
            reportData={reportData} periodLabels={periodLabels}
            onMetricClick={handleMetricClick('home')} includeYoY={includeYoY}
            metrics={[
              { key: 'revenue', label: 'Revenue', format: 'currency' },
              { key: 'tutorPay', label: 'Tutor Pay', format: 'currency', showMargin: true },
              { key: 'activeTutors', label: 'Active Tutors', format: 'number' },
              { key: 'activeStudents', label: 'Active Students', format: 'number' },
              { key: 'newLeads', label: 'New Leads', format: 'number', divider: true },
              { key: 'trialLessons', label: 'Trial Lessons', format: 'number' },
              { key: 'firstPaidLessons', label: 'First Paid Lessons', format: 'number' },
              { key: 'thirdLessons', label: '3rd Lessons', format: 'number' },
            ]}
          />

          <SegmentCard
            title="Online Lessons" icon="💻" segment="online"
            reportData={reportData} periodLabels={periodLabels}
            onMetricClick={handleMetricClick('online')} includeYoY={includeYoY}
            metrics={[
              { key: 'revenue', label: 'Revenue', format: 'currency' },
              { key: 'tutorPay', label: 'Tutor Pay', format: 'currency', showMargin: true },
              { key: 'activeTutors', label: 'Active Tutors', format: 'number' },
              { key: 'activeStudents', label: 'Active Students', format: 'number' },
              { key: 'newLeads', label: 'New Leads', format: 'number', divider: true },
              { key: 'trialLessons', label: 'Trial Lessons', format: 'number' },
              { key: 'firstPaidLessons', label: 'First Paid Lessons', format: 'number' },
              { key: 'thirdLessons', label: '3rd Lessons', format: 'number' },
            ]}
          />

          <SegmentCard
            title="Schools" icon="🏫" segment="schools"
            reportData={reportData} periodLabels={periodLabels}
            onMetricClick={handleMetricClick('schools')} includeYoY={includeYoY}
            metrics={[
              { key: 'revenue', label: 'Revenue', format: 'currency' },
              { key: 'tutorPay', label: 'Tutor Pay', format: 'currency', showMargin: true },
              { key: 'activeTutors', label: 'Active Tutors', format: 'number' },
              { key: 'activeSchools', label: 'Active Schools', format: 'number' },
              { key: 'lessonsCompleted', label: 'Lessons Completed', format: 'number' },
            ]}
          />

          <SegmentCard
            title="Club" icon="♟️" segment="club"
            reportData={reportData} periodLabels={periodLabels}
            onMetricClick={handleMetricClick('club')} includeYoY={includeYoY}
            metrics={[
              { key: 'revenue', label: 'Revenue', format: 'currency' },
              { key: 'tutorPay', label: 'Tutor Pay', format: 'currency', showMargin: true },
              { key: 'activeTutors', label: 'Active Tutors', format: 'number' },
              { key: 'lessonsCompleted', label: 'Lessons Completed', format: 'number' },
              { key: 'activeStudents', label: 'Active Students', format: 'number' },
              { key: 'campSessions', label: 'Camp Sessions', format: 'number', divider: true },
              { key: 'campDays', label: 'Camp Days', format: 'number' },
              { key: 'campStudents', label: 'Camp Students', format: 'number' },
              { key: 'newLeads', label: 'New Leads', format: 'number', divider: true },
              { key: 'trialLessons', label: 'Trial Lessons', format: 'number' },
              { key: 'classPackPurchases', label: 'Class Pack Purchases', format: 'number' },
            ]}
          />
        </div>
      )}

      {/* Drill-down Modal */}
      <MetricDrilldownModal
        open={drilldownModal.open}
        onClose={closeDrilldownModal}
        metricKey={drilldownModal.metricKey}
        metricLabel={drilldownModal.metricLabel}
        segment={drilldownModal.segment}
        dateRange={getPeriodDateRange(drilldownModal.period)}
        currentValue={drilldownModal.currentValue}
      />
    </>
  );

  // ============================================================
  // MAIN RENDER
  // ============================================================
  return (
    <div className="space-y-6">
      {/* View Mode Toggle */}
      <div className="flex items-center gap-1 bg-neutral-100 rounded-lg p-1 w-fit">
        <button
          onClick={() => setViewMode('historical')}
          className={`px-4 py-2 text-sm font-medium rounded-md transition-all ${
            viewMode === 'historical'
              ? 'bg-white text-neutral-900 shadow-sm'
              : 'text-neutral-600 hover:text-neutral-800'
          }`}
        >
          Historical
        </button>
        <button
          onClick={() => setViewMode('forecast')}
          className={`px-4 py-2 text-sm font-medium rounded-md transition-all ${
            viewMode === 'forecast'
              ? 'bg-white text-neutral-900 shadow-sm'
              : 'text-neutral-600 hover:text-neutral-800'
          }`}
        >
          Forecast
        </button>
      </div>

      {viewMode === 'historical' ? renderHistoricalView() : renderForecastView()}

      {/* Forecast Drilldown Modal */}
      <ForecastDrilldownModal
        open={forecastDrilldown.open}
        onClose={() => setForecastDrilldown(prev => ({ ...prev, open: false }))}
        metricKey={forecastDrilldown.metricKey}
        metricLabel={forecastDrilldown.metricLabel}
        channel={forecastDrilldown.channel}
        dateRange={forecastDrilldown.dateRange || null}
        currentValue={forecastDrilldown.currentValue}
        completionRate={forecastDrilldown.completionRate}
      />
    </div>
  );
};

export default ExecutiveReports;
