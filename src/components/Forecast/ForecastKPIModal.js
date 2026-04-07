import React, { useState, useEffect, useMemo } from 'react';
import { DateTime } from 'luxon';
import {
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  ReferenceLine,
  Legend,
} from 'recharts';
import { XMarkIcon, ArrowTrendingUpIcon, ArrowTrendingDownIcon } from '@heroicons/react/24/outline';
import MuiTooltip from '@mui/material/Tooltip';
import { CHART_COLORS, CHART_GRID, CHART_AXIS, CHART_TARGET, CHART_FORECAST } from '../../utils/chartTheme';

// Metric configuration for labels and formatting
// Note: Always convert to Number() to ensure toLocaleString works correctly
// (database values may come as strings which don't format with commas)
const METRIC_CONFIG = {
  lessons: {
    label: 'Total Lessons',
    format: (v) => v == null ? '-' : Number(v).toLocaleString(),
    shortFormat: (v) => v == null ? '-' : (Number(v) >= 1000 ? `${(Number(v)/1000).toFixed(1)}k` : Number(v)),
    color: CHART_COLORS.lessons,
    unit: '',
  },
  hours: {
    label: 'Total Hours',
    format: (v) => v == null ? '-' : Number(v).toLocaleString('en-US', { minimumFractionDigits: 1, maximumFractionDigits: 1 }),
    shortFormat: (v) => v == null ? '-' : (Number(v) >= 1000 ? `${(Number(v)/1000).toFixed(1)}k` : Number(v).toFixed(0)),
    color: CHART_COLORS.hours,
    unit: 'hrs',
  },
  students: {
    label: 'Total Students',
    format: (v) => v == null ? '-' : Number(v).toLocaleString(),
    shortFormat: (v) => v == null ? '-' : Number(v),
    color: CHART_COLORS.students,
    unit: '',
    isAverage: true,
  },
  tutors: {
    label: 'Active Tutors',
    format: (v) => v == null ? '-' : Number(v).toLocaleString(),
    shortFormat: (v) => v == null ? '-' : Number(v),
    color: CHART_COLORS.tutors,
    unit: '',
    isAverage: true,
  },
  revenue: {
    label: 'Total Revenue',
    format: (v) => v == null ? '-' : `$${Number(v).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`,
    shortFormat: (v) => v == null ? '-' : `$${Number(v) >= 1000 ? `${(Number(v)/1000).toFixed(0)}k` : Number(v).toFixed(0)}`,
    color: CHART_COLORS.revenue,
    unit: '',
  },
  tutor_pay: {
    label: 'Total Tutor Pay',
    format: (v) => v == null ? '-' : `$${Number(v).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`,
    shortFormat: (v) => v == null ? '-' : `$${Number(v) >= 1000 ? `${(Number(v)/1000).toFixed(0)}k` : Number(v).toFixed(0)}`,
    color: CHART_COLORS.tutor_pay,
    unit: '',
  },
  adhoc_pay: {
    label: 'Total Tutor Adhoc Pay',
    format: (v) => v == null ? '-' : `$${Number(v).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`,
    shortFormat: (v) => v == null ? '-' : `$${Number(v) >= 1000 ? `${(Number(v)/1000).toFixed(0)}k` : Number(v).toFixed(0)}`,
    color: CHART_COLORS.adhoc_pay,
    unit: '',
    notTracked: true,
  },
  profit: {
    label: 'Total Profit',
    format: (v) => v == null ? '-' : `$${Number(v).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`,
    shortFormat: (v) => v == null ? '-' : `$${Number(v) >= 1000 ? `${(Number(v)/1000).toFixed(0)}k` : Number(v).toFixed(0)}`,
    color: CHART_COLORS.profit,
    unit: '',
  },
  yoy: {
    label: 'YoY Revenue Change',
    format: (v) => v == null ? '-' : `${Number(v) >= 0 ? '+' : ''}${Number(v).toFixed(1)}%`,
    shortFormat: (v) => v == null ? '-' : `${Number(v) >= 0 ? '+' : ''}${Number(v).toFixed(1)}%`,
    color: '#6A469D',
    unit: '%',
    aggregate: true,
  },
  run_rate: {
    label: 'Weekly Revenue Run Rate',
    format: (v) => v == null ? '-' : `$${Number(v).toLocaleString('en-US', { maximumFractionDigits: 0 })}`,
    shortFormat: (v) => v == null ? '-' : `$${Number(v) >= 1000 ? `${(Number(v)/1000).toFixed(0)}k` : Number(v).toFixed(0)}`,
    color: '#6A469D',
    unit: '',
    aggregate: true,
  },
  revenue_at_risk: {
    label: 'Revenue at Risk',
    format: (v) => v == null ? '-' : `$${Number(v).toLocaleString('en-US', { maximumFractionDigits: 0 })}`,
    shortFormat: (v) => v == null ? '-' : `$${Number(v) >= 1000 ? `${(Number(v)/1000).toFixed(0)}k` : Number(v).toFixed(0)}`,
    color: '#DA2E72',
    unit: '',
    aggregate: true,
  },
};

// Custom tooltip for the chart
const CustomChartTooltip = ({ active, payload, label, metric, weeklyTarget }) => {
  if (!active || !payload || !payload.length) return null;

  const config = METRIC_CONFIG[metric] || METRIC_CONFIG.lessons;
  const data = payload[0]?.payload;

  return (
    <div className="bg-white p-3 rounded-lg shadow-lg border border-neutral-200 text-sm">
      <div className="font-medium text-neutral-900 mb-2">
        {data?.label || label}
      </div>
      <div className="space-y-1">
        {data?.actual != null && (
          <div className="flex items-center gap-2">
            <div className="w-3 h-3 rounded bg-green-500"></div>
            <span className="text-neutral-600">Completed:</span>
            <span className="font-medium">{config.format(data.actual)}</span>
          </div>
        )}
        {data?.scheduled != null && (
          <div className="flex items-center gap-2">
            <div className="w-3 h-3 rounded bg-blue-500"></div>
            <span className="text-neutral-600">Scheduled:</span>
            <span className="font-medium">{config.format(data.scheduled)}</span>
          </div>
        )}
        {data?.projected != null && (
          <div className="flex items-center gap-2">
            <div className="w-3 h-3 rounded bg-purple-500"></div>
            <span className="text-neutral-600">Projected:</span>
            <span className="font-medium">{config.format(data.projected)}</span>
          </div>
        )}
        {data?.prior_year != null && (
          <div className="flex items-center gap-2">
            <div className="w-3 h-3 rounded bg-neutral-400"></div>
            <span className="text-neutral-600">Prior Year:</span>
            <span className="font-medium">{config.format(data.prior_year)}</span>
          </div>
        )}
        {weeklyTarget && (
          <div className="flex items-center gap-2">
            <div className="w-3 h-3 rounded bg-amber-500"></div>
            <span className="text-neutral-600">Target:</span>
            <span className="font-medium">{config.format(weeklyTarget)}</span>
          </div>
        )}
      </div>
    </div>
  );
};

export default function ForecastKPIModal({
  open,
  onClose,
  metric, // 'lessons', 'hours', 'revenue', etc.
  channel,
  forecastTab, // 'scheduled' or 'projected'
  children, // Existing drilldown content
  targets = [],
  onDownloadCSV, // Optional callback to download all data as CSV
  csvDownloading = false, // Loading state for CSV download
  progress = null, // Current quarter progress data (completed + scheduled)
  selectedPreset = null, // Current date range preset (e.g., 'currentPayCycle', 'nextPayCycle')
  periodStart = null, // Dashboard's selected start date (for period-specific prior year)
  periodEnd = null, // Dashboard's selected end date
  completionRate = null, // Weighted avg completion rate from scenario (0-100)
  completionRates = null, // Per-channel completion rates { home: 0.68, digital: 0.85, ... }
  byChannel = null, // Per-channel scheduled data { home: { scheduled_lessons, scheduled_revenue, ... } }
  scenarioTotals = null, // Full scenario object with totals
  dashboardMetrics = null, // Computed metrics from dashboard (yoy, run rate, at risk, etc.)
}) {
  // Hide historical data box for pay cycle presets (short-term view doesn't need 3-month average)
  const isPayCycleView = selectedPreset === 'currentPayCycle' || selectedPreset === 'nextPayCycle';
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [historicalData, setHistoricalData] = useState(null);

  const config = METRIC_CONFIG[metric] || METRIC_CONFIG.lessons;
  const isAggregateMetric = config.aggregate === true;

  // Compute period duration in days and weeks for scaling targets
  const periodDays = useMemo(() => {
    if (!periodStart || !periodEnd) return 91; // default ~quarter
    const start = DateTime.fromISO(periodStart);
    const end = DateTime.fromISO(periodEnd);
    return Math.max(1, Math.round(end.diff(start, 'days').days) + 1);
  }, [periodStart, periodEnd]);
  const periodWeeks = periodDays / 7;

  // Historical adhoc pay adjustment for profit calculations
  const historicalAdhocPct = dashboardMetrics?.historicalAdhocPct || 0;
  const hasHistoricalMargin = dashboardMetrics?.hasHistoricalMargin || false;

  // Helper: extract metric value from progress object
  // Profit is always derived as revenue - tutor_pay since it has no dedicated fields
  // When historical margin data is available, also subtract estimated adhoc pay
  const getProgressValue = (progressObj, metricName, field) => {
    if (!progressObj) return null;
    if (metricName === 'profit') {
      const rev = progressObj[`${field}_revenue`] || 0;
      const pay = progressObj[`${field}_tutor_pay`] || 0;
      const lessonProfit = rev - pay;
      // Subtract estimated adhoc pay based on historical adhoc % of revenue
      if (hasHistoricalMargin && historicalAdhocPct > 0) {
        return lessonProfit - (rev * (historicalAdhocPct / 100));
      }
      return lessonProfit;
    }
    return progressObj[`${field}_${metricName}`] ?? null;
  };

  // Fetch historical KPI data when modal opens (skip for aggregate metrics)
  useEffect(() => {
    if (!open || isAggregateMetric) return;

    const fetchData = async () => {
      setLoading(true);
      setError(null);

      try {
        const params = new URLSearchParams({
          lookback_months: '3',
          forecast_months: '3',
        });
        if (channel) params.append('channel', channel);
        if (periodStart) params.append('period_start', periodStart);
        if (periodEnd) params.append('period_end', periodEnd);

        const response = await fetch(`/api/forecast/historical-kpis?${params}`, {
          credentials: 'include',
        });

        if (!response.ok) throw new Error(`HTTP ${response.status}`);
        const data = await response.json();
        setHistoricalData(data);
      } catch (err) {
        console.error('Failed to fetch historical KPIs:', err);
        setError(err.message);
      } finally {
        setLoading(false);
      }
    };

    fetchData();
  }, [open, channel, periodStart, periodEnd]);

  // Build chart data from historical + forecast with smooth transition
  // Uses connectNulls={true} on lines so they draw through gaps caused by
  // interspersed prior year data points
  const chartData = useMemo(() => {
    if (!historicalData) return [];

    const data = [];

    // Add historical weeks (completed actuals)
    for (const week of historicalData.historical || []) {
      const value = metric === 'students' ? week.unique_students
                  : metric === 'tutors' ? week.unique_tutors
                  : week[metric] || 0;

      data.push({
        date: week.week_start,
        label: DateTime.fromISO(week.week_start).toFormat('MMM d'),
        actual: value,
        scheduled: null,
        target: null,
        isHistorical: true,
      });
    }

    // Bridge: give the last historical point a scheduled value equal to its actual
    // so the blue line starts exactly where the green line ends
    if (data.length > 0) {
      data[data.length - 1].scheduled = data[data.length - 1].actual;
    }

    // Add forecast weeks (scheduled + projected data)
    for (const week of historicalData.forecast || []) {
      const scheduledKey = `scheduled_${metric}`;
      const projectedKey = `projected_${metric}`;

      let scheduled, projected;
      if (metric === 'students' || metric === 'tutors') {
        scheduled = null;
        projected = null;
      } else if (metric === 'profit') {
        const schRev = week.scheduled_revenue || 0;
        const schPay = week.scheduled_tutor_pay || 0;
        const projRev = week.projected_revenue || 0;
        const projPay = week.projected_tutor_pay || 0;
        // Subtract estimated adhoc pay based on historical % of revenue
        const adhocAdj = hasHistoricalMargin ? historicalAdhocPct / 100 : 0;
        scheduled = (schRev - schPay) - (schRev * adhocAdj);
        projected = (projRev - projPay) - (projRev * adhocAdj);
      } else {
        scheduled = week[scheduledKey] || 0;
        projected = week[projectedKey] || 0;
      }

      data.push({
        date: week.week_start,
        label: DateTime.fromISO(week.week_start).toFormat('MMM d'),
        actual: null,
        scheduled,
        projected: projected > 0 ? projected : null,
        target: null,
        isHistorical: false,
      });
    }

    // Merge prior year data by aligned week_start
    if (historicalData.prior_year?.length > 0) {
      const priorYearMap = {};
      for (const pw of historicalData.prior_year) {
        const value = metric === 'students' ? pw.unique_students
                    : metric === 'tutors' ? pw.unique_tutors
                    : metric === 'profit' ? pw.profit
                    : pw[metric] || 0;
        priorYearMap[pw.week_start] = value;
      }

      // Merge into existing data points
      for (const point of data) {
        point.prior_year = priorYearMap[point.date] ?? null;
      }

      // Add prior year points that don't overlap (for full coverage)
      const existingDates = new Set(data.map(d => d.date));
      for (const pw of historicalData.prior_year) {
        if (!existingDates.has(pw.week_start)) {
          const value = metric === 'students' ? pw.unique_students
                      : metric === 'tutors' ? pw.unique_tutors
                      : metric === 'profit' ? pw.profit
                      : pw[metric] || 0;
          data.push({
            date: pw.week_start,
            label: DateTime.fromISO(pw.week_start).toFormat('MMM d'),
            actual: null,
            scheduled: null,
            target: null,
            prior_year: value,
            isHistorical: false,
          });
        }
      }

      // Re-sort by date
      data.sort((a, b) => a.date.localeCompare(b.date));
    }

    // Filter chart data to the selected period (with 1-week buffer on each side for context)
    if (periodStart && periodEnd) {
      const rangeStart = DateTime.fromISO(periodStart).minus({ weeks: 1 }).toISODate();
      const rangeEnd = DateTime.fromISO(periodEnd).plus({ weeks: 1 }).toISODate();
      return data.filter(d => d.date >= rangeStart && d.date <= rangeEnd);
    }

    return data;
  }, [historicalData, metric, periodStart, periodEnd]);

  // Calculate summary stats
  const summary = useMemo(() => {
    if (!historicalData) return null;

    const hist = historicalData.historical_summary || {};
    const forecast = historicalData.forecast_summary || {};

    // Get metric-specific values
    let historicalTotal, forecastScheduled, forecastProjected;

    switch (metric) {
      case 'lessons':
        historicalTotal = hist.totalLessons || 0;
        forecastScheduled = forecast.scheduled_lessons || 0;
        forecastProjected = forecast.projected_lessons || 0;
        break;
      case 'hours':
        historicalTotal = hist.totalHours || 0;
        forecastScheduled = forecast.scheduled_hours || 0;
        forecastProjected = forecast.projected_hours || 0;
        break;
      case 'students':
        historicalTotal = hist.avgStudents || 0;
        forecastScheduled = historicalData.scenarios?.realistic?.unique_students || 0;
        forecastProjected = forecastScheduled;
        break;
      case 'tutors':
        historicalTotal = hist.avgTutors || 0;
        forecastScheduled = historicalData.scenarios?.realistic?.unique_tutors || 0;
        forecastProjected = forecastScheduled;
        break;
      case 'revenue':
        historicalTotal = hist.totalRevenue || 0;
        forecastScheduled = forecast.scheduled_revenue || 0;
        forecastProjected = forecast.projected_revenue || 0;
        break;
      case 'tutor_pay':
        historicalTotal = hist.totalTutorPay || 0;
        forecastScheduled = forecast.scheduled_tutor_pay || 0;
        forecastProjected = forecast.projected_tutor_pay || 0;
        break;
      case 'profit': {
        historicalTotal = hist.totalProfit || 0;
        const fSchRev = forecast.scheduled_revenue || 0;
        const fSchPay = forecast.scheduled_tutor_pay || 0;
        const fProjRev = forecast.projected_revenue || 0;
        const fProjPay = forecast.projected_tutor_pay || 0;
        const adhocAdj = hasHistoricalMargin ? historicalAdhocPct / 100 : 0;
        forecastScheduled = (fSchRev - fSchPay) - (fSchRev * adhocAdj);
        forecastProjected = (fProjRev - fProjPay) - (fProjRev * adhocAdj);
        break;
      }
      default:
        historicalTotal = 0;
        forecastScheduled = 0;
        forecastProjected = 0;
    }

    // Find relevant target (pass channel to filter correctly)
    const targetConfig = getTargetForMetric(metric, targets, channel);

    // Prior year total - prefer period-specific (matches dashboard's date range) over rolling
    const priorYearSummaryData = historicalData.period_prior_year_summary || historicalData.prior_year_summary || {};
    let priorYearTotal;
    switch (metric) {
      case 'lessons': priorYearTotal = priorYearSummaryData.totalLessons || 0; break;
      case 'hours': priorYearTotal = priorYearSummaryData.totalHours || 0; break;
      case 'revenue': priorYearTotal = priorYearSummaryData.totalRevenue || 0; break;
      case 'tutor_pay': priorYearTotal = priorYearSummaryData.totalTutorPay || 0; break;
      case 'profit': priorYearTotal = priorYearSummaryData.totalProfit || 0; break;
      default: priorYearTotal = 0;
    }

    // YoY: compare realistic forecast vs prior year (not raw total)
    // Realistic = completed + (recent pending × 50%) + (scheduled × completion rate)
    // Stale pending (>2 weeks) excluded
    let yoyChange;
    let realisticForecast;
    if (historicalData.period_prior_year_summary && progress && priorYearTotal > 0) {
      const completed = getProgressValue(progress, metric, 'completed') || 0;
      const pendingRecent = getProgressValue(progress, metric, 'pending_recent') || 0;

      let scheduledAdjusted = 0;
      if (completionRates && byChannel && !channel) {
        // byChannel values already have completion rates applied (from calculateScenario).
        // Do NOT multiply by rate again — that would double-apply completion rates.
        for (const [ch, chData] of Object.entries(byChannel)) {
          let chScheduled;
          if (metric === 'profit') {
            const chSchRev = chData.scheduled_revenue || 0;
            const chSchPay = chData.scheduled_tutor_pay || 0;
            const adhocAdj = hasHistoricalMargin ? historicalAdhocPct / 100 : 0;
            chScheduled = (chSchRev - chSchPay) - (chSchRev * adhocAdj);
          } else if (metric === 'lessons') {
            chScheduled = chData.scheduled_lessons || 0;
          } else if (metric === 'hours') {
            chScheduled = chData.scheduled_hours || 0;
          } else if (metric === 'revenue') {
            chScheduled = chData.scheduled_revenue || 0;
          } else if (metric === 'tutor_pay') {
            chScheduled = chData.scheduled_tutor_pay || 0;
          } else {
            chScheduled = 0;
          }
          scheduledAdjusted += chScheduled;
        }
      } else {
        const rate = completionRate ? completionRate / 100 : 0.73;
        const scheduled = getProgressValue(progress, metric, 'scheduled') || 0;
        scheduledAdjusted = scheduled * rate;
      }

      const currentPeriodRealistic = completed + pendingRecent * 0.5 + scheduledAdjusted;
      yoyChange = ((currentPeriodRealistic - priorYearTotal) / priorYearTotal) * 100;
      realisticForecast = currentPeriodRealistic;
    } else {
      yoyChange = priorYearTotal > 0
        ? ((historicalTotal - priorYearTotal) / priorYearTotal) * 100
        : null;
      // Still compute realisticForecast for % of target even without prior year data
      if (progress) {
        const completed = getProgressValue(progress, metric, 'completed') || 0;
        const pendingRecent = getProgressValue(progress, metric, 'pending_recent') || 0;
        let scheduledAdjusted = 0;
        if (completionRates && byChannel && !channel) {
          for (const [ch, chData] of Object.entries(byChannel)) {
            let chScheduled;
            if (metric === 'profit') {
              const cRev = chData.scheduled_revenue || 0;
              const cPay = chData.scheduled_tutor_pay || 0;
              const adj = hasHistoricalMargin ? historicalAdhocPct / 100 : 0;
              chScheduled = (cRev - cPay) - (cRev * adj);
            } else if (metric === 'lessons') chScheduled = chData.scheduled_lessons || 0;
            else if (metric === 'hours') chScheduled = chData.scheduled_hours || 0;
            else if (metric === 'revenue') chScheduled = chData.scheduled_revenue || 0;
            else if (metric === 'tutor_pay') chScheduled = chData.scheduled_tutor_pay || 0;
            else chScheduled = 0;
            scheduledAdjusted += chScheduled;
          }
        } else {
          const rate = completionRate ? completionRate / 100 : 0.73;
          const scheduled = getProgressValue(progress, metric, 'scheduled') || 0;
          scheduledAdjusted = scheduled * rate;
        }
        realisticForecast = completed + pendingRecent * 0.5 + scheduledAdjusted;
      }
    }

    return {
      historicalTotal,
      forecastScheduled,
      forecastProjected,
      priorYearTotal,
      yoyChange,
      realisticForecast: realisticForecast || null,
      target: targetConfig?.value || null,
      weeklyTarget: targetConfig?.weeklyValue || null,
      targetLabel: targetConfig?.label || 'No target set',
      weekCount: hist.weekCount || 0,
      avgPerWeek: hist.weekCount > 0 ? historicalTotal / hist.weekCount : 0,
    };
  }, [historicalData, metric, targets, channel, completionRate, completionRates, byChannel, periodWeeks, periodDays]);

  // Get target for this metric, filtered by channel
  // For lessons: derive from revenue target ÷ avg_revenue_per_lesson (matches Configure Quarterly Targets)
  function getTargetForMetric(metric, targets, channelFilter) {
    if (!targets || !targets.length) return null;

    const channelMatch = (t) => {
      if (!channelFilter) return !t.channel || t.channel === '' || t.channel === 'all';
      return t.channel === channelFilter;
    };

    // Scale to the selected period (periodWeeks) instead of always 13 weeks
    const weeks = periodWeeks;
    const weeksLabel = weeks < 1.5
      ? `${Math.round(periodDays)} days`
      : weeks < 4
      ? `${weeks.toFixed(1)} weeks`
      : `${Math.round(weeks)} weeks`;

    // For lessons: derive from revenue target to stay consistent with Configure Quarterly Targets
    if (metric === 'lessons') {
      const avgPerLesson = progress?.avg_revenue_per_lesson || 134.95;
      const revenueTarget = targets.find(t => t.target_type === 'quarterly_revenue' && channelMatch(t));
      if (revenueTarget) {
        const revenue = Number(revenueTarget.target_value);
        const quarterlyTotal = Math.round(revenue / avgPerLesson);
        const weekly = Math.round(quarterlyTotal / 13);
        // If period is a full quarter, use exact quarterly lesson total
        if (weeks >= 12.5 && weeks <= 13.5) {
          return { value: quarterlyTotal, weeklyValue: weekly, label: `Quarterly target` };
        }
        const scaled = Math.round(weekly * weeks);
        return { value: scaled, weeklyValue: weekly, label: `${weekly.toLocaleString()}/week × ${weeksLabel}` };
      }
      return null;
    }

    // For profit: derive from revenue target × margin_percent, minus adhoc adjustment
    if (metric === 'profit') {
      const revenueTarget = targets.find(t => t.target_type === 'quarterly_revenue' && channelMatch(t));
      if (!revenueTarget) return null;
      const quarterlyRevenue = Number(revenueTarget.target_value);
      const marginPct = (revenueTarget.margin_percent || 50) / 100;
      const adhocAdj = hasHistoricalMargin ? historicalAdhocPct / 100 : 0;
      // Profit = revenue × margin% - revenue × adhoc%
      const quarterlyProfit = Math.round(quarterlyRevenue * (marginPct - adhocAdj));
      const weeklyProfit = quarterlyProfit / 13;
      if (weeks >= 12.5 && weeks <= 13.5) {
        return { value: quarterlyProfit, weeklyValue: weeklyProfit, label: `Quarterly target (${Math.round(marginPct * 100)}% margin${adhocAdj > 0 ? ` - ${(adhocAdj * 100).toFixed(1)}% adhoc` : ''})` };
      }
      const scaled = Math.round(weeklyProfit * weeks);
      return { value: scaled, weeklyValue: weeklyProfit, label: `$${Math.round(weeklyProfit).toLocaleString()}/week × ${weeksLabel}` };
    }

    // For tutor_pay: derive from revenue target × (1 - margin_percent)
    if (metric === 'tutor_pay') {
      const revenueTarget = targets.find(t => t.target_type === 'quarterly_revenue' && channelMatch(t));
      if (!revenueTarget) return null;
      const quarterlyRevenue = Number(revenueTarget.target_value);
      const marginPct = (revenueTarget.margin_percent || 50) / 100;
      const quarterlyTutorPay = Math.round(quarterlyRevenue * (1 - marginPct));
      const weeklyTutorPay = quarterlyTutorPay / 13;
      if (weeks >= 12.5 && weeks <= 13.5) {
        return { value: quarterlyTutorPay, weeklyValue: weeklyTutorPay, label: `Quarterly target (${Math.round((1 - marginPct) * 100)}% of revenue)` };
      }
      const scaled = Math.round(weeklyTutorPay * weeks);
      return { value: scaled, weeklyValue: weeklyTutorPay, label: `$${Math.round(weeklyTutorPay).toLocaleString()}/week × ${weeksLabel}` };
    }

    // Map other metrics to target_type
    const targetTypeMap = {
      revenue: 'quarterly_revenue',
      hours: 'weekly_hours',
    };

    const targetType = targetTypeMap[metric];
    if (!targetType) return null;

    const target = targets.find(t => t.target_type === targetType && channelMatch(t));
    if (!target) return null;

    // Scale target to the selected period
    let weeklyValue, scaledValue, label;

    if (targetType === 'weekly_hours') {
      weeklyValue = Number(target.target_value);
      scaledValue = Math.round(weeklyValue * weeks);
      label = `${weeklyValue.toFixed(0)}/week × ${weeksLabel}`;
    } else if (targetType === 'quarterly_revenue') {
      const quarterlyTotal = Number(target.target_value);
      weeklyValue = quarterlyTotal / 13;
      // If period is a full quarter (~12.5-13.5 weeks), use the exact quarterly target
      // Quarters are 90-92 days, not exactly 13×7=91
      if (weeks >= 12.5 && weeks <= 13.5) {
        scaledValue = Math.round(quarterlyTotal);
        label = `Quarterly target`;
      } else {
        scaledValue = Math.round(weeklyValue * weeks);
        label = `$${Math.round(weeklyValue).toLocaleString()}/week × ${weeksLabel}`;
      }
    }

    return { value: scaledValue, weeklyValue, label };
  }

  // Calculate trend
  const trend = useMemo(() => {
    if (!chartData.length) return null;

    const historicalPoints = chartData.filter(d => d.isHistorical && d.actual != null);
    if (historicalPoints.length < 2) return null;

    const firstHalf = historicalPoints.slice(0, Math.floor(historicalPoints.length / 2));
    const secondHalf = historicalPoints.slice(Math.floor(historicalPoints.length / 2));

    const firstAvg = firstHalf.reduce((sum, d) => sum + d.actual, 0) / firstHalf.length;
    const secondAvg = secondHalf.reduce((sum, d) => sum + d.actual, 0) / secondHalf.length;

    if (firstAvg === 0) return null;

    const change = ((secondAvg - firstAvg) / firstAvg) * 100;
    return {
      value: change,
      direction: change >= 0 ? 'up' : 'down',
    };
  }, [chartData]);

  if (!open) return null;

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 z-50 flex items-center justify-center p-4">
      <div className="bg-white rounded-xl shadow-2xl max-w-5xl w-full max-h-[90vh] overflow-hidden flex flex-col">
        {/* Header */}
        <div className="flex items-center justify-between p-4 border-b border-neutral-200 bg-gradient-to-r from-brand-navy to-brand-purple">
          <div>
            <h2 className="text-xl font-semibold text-white">{config.label} Details</h2>
            <p className="text-sm text-white/70">
              {channel ? `${channel.charAt(0).toUpperCase() + channel.slice(1)} Channel` : 'All Channels'} •{' '}
              {forecastTab === 'scheduled' ? 'Scheduled View' : 'Projected View'}
              {periodStart && periodEnd && ` • ${DateTime.fromISO(periodStart).toFormat('MMM d')} – ${DateTime.fromISO(periodEnd).toFormat('MMM d, yyyy')}`}
            </p>
          </div>
          <button
            onClick={onClose}
            className="p-2 text-white/80 hover:text-white hover:bg-white/10 rounded-lg transition-colors"
          >
            <XMarkIcon className="h-6 w-6" />
          </button>
        </div>

        {/* Content */}
        <div className="flex-1 overflow-y-auto p-6 space-y-6">
          {/* Executive Summary Section */}
          <div className="bg-neutral-50 rounded-xl p-6">
            <h3 className="text-lg font-semibold text-neutral-900 mb-4">Executive Summary</h3>

            {loading ? (
              <div className="flex items-center justify-center h-48">
                <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-purple-600"></div>
                <span className="ml-2 text-sm text-neutral-600">Loading historical data...</span>
              </div>
            ) : error ? (
              <div className="text-center py-8 text-red-600">{error}</div>
            ) : config.notTracked ? (
              <div className="text-center py-8 text-neutral-500">
                <p className="text-lg">Adhoc pay is not currently tracked in the forecast system.</p>
                <p className="text-sm mt-2">This metric will be available in a future update.</p>
              </div>
            ) : (
              <>
                {metric === 'completion_rate' ? (
                  <div className="space-y-4 mb-4">
                    {/* Blended Rate Header */}
                    <div className="text-center">
                      <div className="text-4xl font-bold text-brand-navy">
                        {completionRate ? `${completionRate.toFixed(1)}%` : '-'}
                      </div>
                      <div className="text-sm text-neutral-500 mt-1">Revenue-Weighted Average Completion Rate</div>
                    </div>

                    {/* Channel Breakdown Table */}
                    {completionRates && byChannel && (
                      <div className="overflow-x-auto">
                        <table className="min-w-full text-sm">
                          <thead>
                            <tr className="text-left text-neutral-600 border-b border-neutral-200">
                              <th className="py-2 pr-4 font-medium">Channel</th>
                              <th className="py-2 pr-4 font-medium text-right">Completion Rate</th>
                              <th className="py-2 pr-4 font-medium text-right">Scheduled Lessons</th>
                              <th className="py-2 pr-4 font-medium text-right">Scheduled Revenue</th>
                              <th className="py-2 pr-4 font-medium text-right">Revenue Weight</th>
                            </tr>
                          </thead>
                          <tbody>
                            {(() => {
                              const totalWeight = Object.values(byChannel).reduce((sum, ch) => sum + (ch.total_revenue || 0), 0);
                              return Object.entries(completionRates)
                                .sort((a, b) => (byChannel[b[0]]?.total_revenue || 0) - (byChannel[a[0]]?.total_revenue || 0))
                                .map(([ch, rate]) => {
                                  const chData = byChannel[ch] || {};
                                  const weight = totalWeight > 0 ? ((chData.total_revenue || 0) / totalWeight) * 100 : 0;
                                  const ratePct = (rate * 100).toFixed(1);
                                  const rateColor = rate >= 0.8 ? 'text-green-700' : rate >= 0.7 ? 'text-amber-700' : 'text-red-700';
                                  return (
                                    <tr key={ch} className="border-t border-neutral-100 hover:bg-neutral-50">
                                      <td className="py-3 pr-4 font-medium capitalize">{ch === 'digital' ? 'Online' : ch}</td>
                                      <td className={`py-3 pr-4 text-right font-semibold ${rateColor}`}>{ratePct}%</td>
                                      <td className="py-3 pr-4 text-right">{(chData.scheduled_lessons || 0).toLocaleString()}</td>
                                      <td className="py-3 pr-4 text-right">${(chData.scheduled_revenue || 0).toLocaleString('en-US', { maximumFractionDigits: 0 })}</td>
                                      <td className="py-3 pr-4 text-right">{weight.toFixed(1)}%</td>
                                    </tr>
                                  );
                                });
                            })()}
                          </tbody>
                        </table>
                      </div>
                    )}

                    {/* Explanation */}
                    <div className="text-xs text-neutral-500 bg-neutral-100 rounded-lg p-3">
                      Completion rates are calculated from 6-month historical data per channel.
                      The weighted average uses each channel&apos;s revenue share as its weight.
                      Higher-revenue channels have more influence on the blended rate.
                    </div>
                  </div>
                ) : metric === 'yoy' ? (
                  <div className="space-y-4 mb-4">
                    {/* YoY Header */}
                    <div className="text-center">
                      <div className={`text-4xl font-bold ${(dashboardMetrics?.yoyPctChange || 0) >= 0 ? 'text-green-700' : 'text-red-700'}`}>
                        {dashboardMetrics?.yoyPctChange != null ? `${dashboardMetrics.yoyPctChange >= 0 ? '+' : ''}${dashboardMetrics.yoyPctChange.toFixed(1)}%` : '-'}
                      </div>
                      <div className="text-sm text-neutral-500 mt-1">Year-over-Year Revenue Change</div>
                    </div>

                    {/* Comparison Cards */}
                    <div className="grid grid-cols-2 gap-4">
                      <div className="bg-white rounded-lg p-4 shadow-sm border border-neutral-200">
                        <div className="text-sm text-neutral-500 mb-1">This Period Forecast</div>
                        <div className="text-2xl font-bold text-brand-navy">
                          ${Math.round(dashboardMetrics?.realisticForecastRevenue || 0).toLocaleString('en-US')}
                        </div>
                        <div className="text-xs text-neutral-400 mt-1">Completed + pending (50%) + scheduled × rates</div>
                      </div>
                      <div className="bg-white rounded-lg p-4 shadow-sm border border-neutral-200">
                        <div className="text-sm text-neutral-500 mb-1">Same Period Last Year</div>
                        <div className="text-2xl font-bold text-neutral-700">
                          ${Math.round(dashboardMetrics?.priorYearRevenue || 0).toLocaleString('en-US')}
                        </div>
                        <div className="text-xs text-neutral-400 mt-1">Actual completed revenue</div>
                      </div>
                    </div>

                    {/* Visual comparison bar */}
                    {dashboardMetrics?.priorYearRevenue > 0 && (
                      <div className="bg-white rounded-lg p-4 shadow-sm border border-neutral-200">
                        <div className="text-sm font-medium text-neutral-700 mb-3">Visual Comparison</div>
                        {(() => {
                          const forecast = dashboardMetrics?.realisticForecastRevenue || 0;
                          const prior = dashboardMetrics?.priorYearRevenue || 0;
                          const maxVal = Math.max(forecast, prior);
                          const forecastPct = maxVal > 0 ? (forecast / maxVal) * 100 : 0;
                          const priorPct = maxVal > 0 ? (prior / maxVal) * 100 : 0;
                          return (
                            <div className="space-y-3">
                              <div>
                                <div className="flex items-center justify-between text-xs text-neutral-600 mb-1">
                                  <span>This Period (Forecast)</span>
                                  <span className="font-medium">${Math.round(forecast).toLocaleString('en-US')}</span>
                                </div>
                                <div className="w-full bg-neutral-100 rounded-full h-4">
                                  <div className="bg-brand-navy h-4 rounded-full transition-all" style={{ width: `${forecastPct}%` }}></div>
                                </div>
                              </div>
                              <div>
                                <div className="flex items-center justify-between text-xs text-neutral-600 mb-1">
                                  <span>Same Period Last Year</span>
                                  <span className="font-medium">${Math.round(prior).toLocaleString('en-US')}</span>
                                </div>
                                <div className="w-full bg-neutral-100 rounded-full h-4">
                                  <div className="bg-neutral-400 h-4 rounded-full transition-all" style={{ width: `${priorPct}%` }}></div>
                                </div>
                              </div>
                            </div>
                          );
                        })()}
                      </div>
                    )}

                    {/* Explanation */}
                    <div className="text-xs text-neutral-500 bg-neutral-100 rounded-lg p-3">
                      Realistic forecast = completed revenue + recent pending (×50%) + scheduled revenue adjusted by channel-specific completion rates.
                      Prior year data covers the exact same calendar period one year ago.
                    </div>
                  </div>
                ) : metric === 'run_rate' ? (
                  <div className="space-y-4 mb-4">
                    {/* Run Rate Header */}
                    <div className="text-center">
                      <div className="text-4xl font-bold text-brand-navy">
                        ${Math.round(dashboardMetrics?.weeklyRunRate || 0).toLocaleString('en-US')}
                      </div>
                      <div className="text-sm text-neutral-500 mt-1">Weekly Revenue Run Rate</div>
                    </div>

                    {/* Pace vs Target */}
                    {dashboardMetrics?.weeklyRevenueTarget && (
                      <div className="bg-white rounded-lg p-4 shadow-sm border border-neutral-200">
                        <div className="text-sm font-medium text-neutral-700 mb-3">Pace vs Target</div>
                        {(() => {
                          const rate = dashboardMetrics?.weeklyRunRate || 0;
                          const target = dashboardMetrics?.weeklyRevenueTarget || 1;
                          const pace = dashboardMetrics?.pacePct || 0;
                          const barPct = Math.min(pace, 150); // Cap visual at 150%
                          const barColor = pace >= 100 ? 'bg-green-500' : pace >= 80 ? 'bg-amber-500' : 'bg-red-500';
                          return (
                            <div className="space-y-3">
                              <div className="flex items-center justify-between text-sm">
                                <span className="text-neutral-600">Weekly Target</span>
                                <span className="font-semibold text-purple-700">${Math.round(target).toLocaleString('en-US')}/wk</span>
                              </div>
                              <div className="flex items-center justify-between text-sm">
                                <span className="text-neutral-600">Current Run Rate</span>
                                <span className="font-semibold text-brand-navy">${Math.round(rate).toLocaleString('en-US')}/wk</span>
                              </div>
                              <div>
                                <div className="flex items-center justify-between text-xs text-neutral-500 mb-1">
                                  <span>Pace</span>
                                  <span className={`font-semibold ${pace >= 100 ? 'text-green-700' : pace >= 80 ? 'text-amber-700' : 'text-red-700'}`}>
                                    {pace.toFixed(1)}%
                                  </span>
                                </div>
                                <div className="w-full bg-neutral-100 rounded-full h-4 relative">
                                  <div className={`${barColor} h-4 rounded-full transition-all`} style={{ width: `${Math.min(barPct / 1.5 * 100 / 100, 100)}%` }}></div>
                                  {/* Target marker at 100% / 1.5 position */}
                                  <div className="absolute top-0 h-4 w-0.5 bg-purple-700" style={{ left: `${100 / 1.5}%` }}></div>
                                </div>
                                <div className="flex justify-between text-[10px] text-neutral-400 mt-0.5">
                                  <span>0%</span>
                                  <span style={{ position: 'relative', left: `${100 / 1.5 - 50}%` }}>Target (100%)</span>
                                  <span>150%</span>
                                </div>
                              </div>
                            </div>
                          );
                        })()}
                      </div>
                    )}

                    {/* Breakdown */}
                    <div className="grid grid-cols-3 gap-3">
                      <div className="bg-white rounded-lg p-3 shadow-sm border border-neutral-200 text-center">
                        <div className="text-xs text-neutral-500 mb-1">Period</div>
                        <div className="text-lg font-bold text-neutral-700">
                          {periodDays < 7 ? `${Math.round(periodDays)} days` : `${(periodDays / 7).toFixed(1)} wks`}
                        </div>
                      </div>
                      <div className="bg-white rounded-lg p-3 shadow-sm border border-neutral-200 text-center">
                        <div className="text-xs text-neutral-500 mb-1">Forecast Total</div>
                        <div className="text-lg font-bold text-brand-navy">
                          ${Math.round(dashboardMetrics?.fullForecastRevenue || 0).toLocaleString('en-US')}
                        </div>
                      </div>
                      <div className="bg-white rounded-lg p-3 shadow-sm border border-neutral-200 text-center">
                        <div className="text-xs text-neutral-500 mb-1">Daily Average</div>
                        <div className="text-lg font-bold text-neutral-700">
                          ${Math.round((dashboardMetrics?.fullForecastRevenue || 0) / Math.max(periodDays, 1)).toLocaleString('en-US')}
                        </div>
                      </div>
                    </div>

                    {/* Explanation */}
                    <div className="text-xs text-neutral-500 bg-neutral-100 rounded-lg p-3">
                      Run rate = total forecast revenue (completed + pending + scheduled + projected) ÷ weeks in selected period.
                      {dashboardMetrics?.weeklyRevenueTarget ? ` Target: quarterly revenue goal ($${Math.round(dashboardMetrics.weeklyRevenueTarget * 13).toLocaleString('en-US')}) ÷ 13 weeks.` : ''}
                    </div>
                  </div>
                ) : metric === 'revenue_at_risk' ? (
                  <div className="space-y-4 mb-4">
                    {/* At Risk Header */}
                    <div className="text-center">
                      <div className="text-4xl font-bold text-red-700">
                        ${Math.round(dashboardMetrics?.atRiskRevenue || 0).toLocaleString('en-US')}
                      </div>
                      <div className="text-sm text-neutral-500 mt-1">
                        {(dashboardMetrics?.atRiskPct || 0).toFixed(1)}% of scheduled revenue may not complete
                      </div>
                    </div>

                    {/* Channel Breakdown */}
                    {completionRates && byChannel && (
                      <div className="bg-white rounded-lg p-4 shadow-sm border border-neutral-200">
                        <div className="text-sm font-medium text-neutral-700 mb-3">Risk by Channel</div>
                        <div className="overflow-x-auto">
                          <table className="min-w-full text-sm">
                            <thead>
                              <tr className="text-left text-neutral-600 border-b border-neutral-200">
                                <th className="py-2 pr-4 font-medium">Channel</th>
                                <th className="py-2 pr-4 font-medium text-right">Scheduled Revenue</th>
                                <th className="py-2 pr-4 font-medium text-right">Completion Rate</th>
                                <th className="py-2 pr-4 font-medium text-right">Revenue at Risk</th>
                              </tr>
                            </thead>
                            <tbody>
                              {Object.entries(completionRates)
                                .sort((a, b) => (byChannel[b[0]]?.total_revenue || 0) - (byChannel[a[0]]?.total_revenue || 0))
                                .map(([ch, rate]) => {
                                  const chData = byChannel[ch] || {};
                                  const chRevenue = chData.total_revenue || 0;
                                  const chAtRisk = chRevenue * (1 - rate);
                                  const rateColor = rate >= 0.8 ? 'text-green-700' : rate >= 0.7 ? 'text-amber-700' : 'text-red-700';
                                  return (
                                    <tr key={ch} className="border-t border-neutral-100 hover:bg-neutral-50">
                                      <td className="py-3 pr-4 font-medium capitalize">{ch === 'digital' ? 'Online' : ch}</td>
                                      <td className="py-3 pr-4 text-right">${chRevenue.toLocaleString('en-US', { maximumFractionDigits: 0 })}</td>
                                      <td className={`py-3 pr-4 text-right font-semibold ${rateColor}`}>{(rate * 100).toFixed(1)}%</td>
                                      <td className="py-3 pr-4 text-right font-semibold text-red-700">${Math.round(chAtRisk).toLocaleString('en-US')}</td>
                                    </tr>
                                  );
                                })}
                            </tbody>
                          </table>
                        </div>
                      </div>
                    )}

                    {/* Visual Risk Bars */}
                    {completionRates && byChannel && (
                      <div className="bg-white rounded-lg p-4 shadow-sm border border-neutral-200">
                        <div className="text-sm font-medium text-neutral-700 mb-3">Risk Distribution</div>
                        <div className="space-y-3">
                          {Object.entries(completionRates)
                            .sort((a, b) => (byChannel[b[0]]?.total_revenue || 0) - (byChannel[a[0]]?.total_revenue || 0))
                            .map(([ch, rate]) => {
                              const chData = byChannel[ch] || {};
                              const chRevenue = chData.total_revenue || 0;
                              const safePct = rate * 100;
                              const riskPct = 100 - safePct;
                              return (
                                <div key={ch}>
                                  <div className="flex items-center justify-between text-xs text-neutral-600 mb-1">
                                    <span className="capitalize font-medium">{ch === 'digital' ? 'Online' : ch}</span>
                                    <span>${chRevenue.toLocaleString('en-US', { maximumFractionDigits: 0 })}</span>
                                  </div>
                                  <div className="w-full flex h-3 rounded-full overflow-hidden">
                                    <div className="bg-green-400 transition-all" style={{ width: `${safePct}%` }}></div>
                                    <div className="bg-red-400 transition-all" style={{ width: `${riskPct}%` }}></div>
                                  </div>
                                  <div className="flex justify-between text-[10px] text-neutral-400 mt-0.5">
                                    <span>{safePct.toFixed(0)}% expected to complete</span>
                                    <span>{riskPct.toFixed(0)}% at risk</span>
                                  </div>
                                </div>
                              );
                            })}
                        </div>
                      </div>
                    )}

                    {/* Explanation */}
                    <div className="text-xs text-neutral-500 bg-neutral-100 rounded-lg p-3">
                      Revenue at risk = scheduled + projected revenue × (1 - weighted completion rate).
                      Based on 6-month historical completion rates per channel. Lower completion rates = more revenue at risk.
                    </div>
                  </div>
                ) : (
                  <>
                    {/* Row 1: Baseline → Prior 12 Weeks → Realistic Forecast → Target */}
                    {!isPayCycleView && (
                      <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-4">
                        {/* 1. Baseline (Same Period Last Year) — the starting reference point */}
                        <MuiTooltip title={summary?.priorYearTotal > 0 ? `Completed ${config.label.toLowerCase()} during the same period last year. This is the baseline we compare everything against.` : 'No prior year data available for this period.'} arrow placement="top" enterDelay={300}>
                          <div className="bg-white rounded-lg p-4 shadow-sm border border-neutral-200">
                            <div className="text-sm text-neutral-500 mb-1">Baseline (Last Year)</div>
                            <div className="text-2xl font-bold text-neutral-700">
                              {summary?.priorYearTotal > 0 ? config.format(summary.priorYearTotal) : '-'}
                            </div>
                            <div className="text-xs text-neutral-400 mt-1">Same period prior year</div>
                          </div>
                        </MuiTooltip>

                        {/* 2. Prior 12 Weeks — current momentum vs baseline */}
                        {periodWeeks >= 4 ? (
                          <MuiTooltip title={`Completed ${config.label.toLowerCase()} from the prior 12 full weeks. Shows current run rate compared to last year's baseline.`} arrow placement="top" enterDelay={300}>
                            <div className="bg-white rounded-lg p-4 shadow-sm border border-neutral-200">
                              <div className="text-sm text-neutral-500 mb-1">
                                Prior 12 Weeks {config.isAverage ? '(Avg)' : ''}
                              </div>
                              <div className="text-2xl font-bold text-neutral-900">
                                {summary ? config.format(summary.historicalTotal) : '-'}
                              </div>
                              {(() => {
                                if (!summary?.historicalTotal || !summary?.priorYearTotal || summary.priorYearTotal <= 0) {
                                  return trend ? (
                                    <div className={`flex items-center gap-1 text-sm mt-1 ${trend.direction === 'up' ? 'text-green-600' : 'text-red-600'}`}>
                                      {trend.direction === 'up' ? <ArrowTrendingUpIcon className="h-4 w-4" /> : <ArrowTrendingDownIcon className="h-4 w-4" />}
                                      {Math.abs(trend.value).toFixed(1)}% momentum
                                    </div>
                                  ) : null;
                                }
                                const vsBaseline = ((summary.historicalTotal - summary.priorYearTotal) / summary.priorYearTotal) * 100;
                                return (
                                  <div className={`flex items-center gap-1 text-sm mt-1 ${vsBaseline >= 0 ? 'text-green-600' : 'text-red-600'}`}>
                                    {vsBaseline >= 0 ? <ArrowTrendingUpIcon className="h-4 w-4" /> : <ArrowTrendingDownIcon className="h-4 w-4" />}
                                    {vsBaseline >= 0 ? '+' : ''}{vsBaseline.toFixed(1)}% vs baseline
                                  </div>
                                );
                              })()}
                            </div>
                          </MuiTooltip>
                        ) : (
                          <MuiTooltip title="Your weekly average rate based on the trailing 12-week historical data. Compare this to the weekly target to gauge pace." arrow placement="top" enterDelay={300}>
                            <div className="bg-white rounded-lg p-4 shadow-sm border border-neutral-200">
                              <div className="text-sm text-neutral-500 mb-1">Weekly Avg Rate</div>
                              <div className="text-2xl font-bold text-neutral-900">
                                {summary?.avgPerWeek ? config.format(Math.round(summary.avgPerWeek)) : '-'}
                              </div>
                              <div className="text-xs text-neutral-400 mt-1">
                                {summary?.weeklyTarget ? `Target: ${config.format(summary.weeklyTarget)}/week` : 'Based on prior 12 weeks'}
                              </div>
                            </div>
                          </MuiTooltip>
                        )}

                        {/* 3. Realistic Forecast — the hero card: vs baseline + % of target */}
                        <MuiTooltip title={`Realistic projection: completed + (recent pending × 50%) + (scheduled × channel-specific completion rates). Pending >2 weeks excluded.`} arrow placement="top" enterDelay={300}>
                          <div className="bg-white rounded-lg p-4 shadow-sm border border-brand-navy/20">
                            <div className="text-sm text-brand-navy mb-1">Realistic Forecast</div>
                            <div className="text-2xl font-bold text-brand-navy">
                              {(() => {
                                if (!progress) return '-';
                                const completed = getProgressValue(progress, metric, 'completed') || 0;
                                const pendingRecent = getProgressValue(progress, metric, 'pending_recent') || 0;

                                // Use channel-specific rates if available (more accurate than weighted avg)
                                let scheduledAdjusted = 0;
                                if (completionRates && byChannel && !channel) {
                                  // byChannel values already have completion rates applied (from calculateScenario).
                                  // Do NOT multiply by rate again — that would double-apply.
                                  for (const [ch, chData] of Object.entries(byChannel)) {
                                    let chScheduled;
                                    if (metric === 'profit') {
                                      const cRev = chData.scheduled_revenue || 0;
                                      const cPay = chData.scheduled_tutor_pay || 0;
                                      const adj = hasHistoricalMargin ? historicalAdhocPct / 100 : 0;
                                      chScheduled = (cRev - cPay) - (cRev * adj);
                                    } else if (metric === 'lessons') {
                                      chScheduled = chData.scheduled_lessons || 0;
                                    } else if (metric === 'hours') {
                                      chScheduled = chData.scheduled_hours || 0;
                                    } else if (metric === 'revenue') {
                                      chScheduled = chData.scheduled_revenue || 0;
                                    } else if (metric === 'tutor_pay') {
                                      chScheduled = chData.scheduled_tutor_pay || 0;
                                    } else {
                                      chScheduled = 0;
                                    }
                                    scheduledAdjusted += chScheduled;
                                  }
                                } else {
                                  // Single channel view or no breakdown — use the passed-in rate
                                  const rate = completionRate ? completionRate / 100 : 0.73;
                                  const scheduled = getProgressValue(progress, metric, 'scheduled') || 0;
                                  scheduledAdjusted = scheduled * rate;
                                }

                                const realistic = Math.round(completed + pendingRecent * 0.5 + scheduledAdjusted);
                                return config.format(realistic);
                              })()}
                            </div>
                            {(() => {
                              // Build comparison line: "X% vs baseline · Y% of target"
                              const parts = [];
                              const yoy = summary?.yoyChange;
                              if (yoy != null && summary?.priorYearTotal > 0) {
                                parts.push({ text: `${yoy >= 0 ? '+' : ''}${yoy.toFixed(1)}% vs baseline`, positive: yoy >= 0 });
                              }
                              if (summary?.target && summary?.realisticForecast) {
                                const pctOfTarget = (summary.realisticForecast / summary.target) * 100;
                                parts.push({ text: `${pctOfTarget.toFixed(1)}% of target`, positive: pctOfTarget >= 90 });
                              }
                              if (parts.length === 0) {
                                return <div className="text-xs text-brand-navy/60 mt-1">At {completionRate ? `${completionRate.toFixed(0)}%` : '–'} completion rate</div>;
                              }
                              return (
                                <div className="flex items-center gap-1 text-sm mt-1 flex-wrap">
                                  {parts.map((p, i) => (
                                    <span key={i} className={p.positive ? 'text-green-600' : 'text-red-600'}>
                                      {i === 0 && (p.positive ? <ArrowTrendingUpIcon className="h-4 w-4 inline mr-0.5" /> : <ArrowTrendingDownIcon className="h-4 w-4 inline mr-0.5" />)}
                                      {p.text}{i < parts.length - 1 ? <span className="text-neutral-400 mx-1">·</span> : ''}
                                    </span>
                                  ))}
                                </div>
                              );
                            })()}
                          </div>
                        </MuiTooltip>

                        {/* 4. Target — the goal (with growth % vs baseline) */}
                        <MuiTooltip title={summary?.target ? `Quarterly target from Configure Quarterly Targets. ${summary?.targetLabel || ''} Growth % compares target vs last year's baseline.` : 'No target set. Configure quarterly targets to see your goal here.'} arrow placement="top" enterDelay={300}>
                          <div className={`bg-white rounded-lg p-4 shadow-sm border ${summary?.target ? 'border-purple-200' : 'border-neutral-200'}`}>
                            <div className={`text-sm mb-1 ${summary?.target ? 'text-purple-600' : 'text-neutral-400'}`}>Target</div>
                            <div className={`text-2xl font-bold ${summary?.target ? 'text-purple-700' : 'text-neutral-300'}`}>
                              {summary?.target ? config.format(summary.target) : 'Not set'}
                            </div>
                            {(() => {
                              if (!summary?.target || !summary?.priorYearTotal || summary.priorYearTotal <= 0) {
                                return summary?.targetLabel ? <div className="text-xs text-purple-500 mt-1">{summary.targetLabel}</div> : null;
                              }
                              const targetGrowth = ((summary.target - summary.priorYearTotal) / summary.priorYearTotal) * 100;
                              return (
                                <div className={`flex items-center gap-1 text-sm mt-1 ${targetGrowth >= 0 ? 'text-purple-600' : 'text-red-600'}`}>
                                  {targetGrowth >= 0 ? <ArrowTrendingUpIcon className="h-4 w-4" /> : <ArrowTrendingDownIcon className="h-4 w-4" />}
                                  {targetGrowth >= 0 ? '+' : ''}{Math.abs(targetGrowth).toFixed(1)}% vs baseline
                                </div>
                              );
                            })()}
                          </div>
                        </MuiTooltip>
                      </div>
                    )}

                    {/* Row 2: Current Period — Completed | Pending Confirmation | Scheduled | Total */}
                    <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-6">
                      {/* Completed */}
                      <MuiTooltip title={`${config.label} marked 'complete' in TutorCruncher during the current period. These are confirmed and finalized.`} arrow placement="top" enterDelay={300}>
                        <div className="bg-white rounded-lg p-4 shadow-sm border border-green-200">
                          <div className="text-sm text-green-600 mb-1">Completed</div>
                          <div className="text-2xl font-bold text-green-700">
                            {(() => {
                              if (!progress) return '-';
                              const value = getProgressValue(progress, metric, 'completed');
                              return value != null ? config.format(value) : '-';
                            })()}
                          </div>
                          <div className="text-xs text-green-500 mt-1">Confirmed in TutorCruncher</div>
                        </div>
                      </MuiTooltip>

                      {/* Pending Confirmation */}
                      <MuiTooltip title="Past lessons awaiting tutor confirmation. Recent (<2 weeks) are more likely to be confirmed — counted at 50% in the Realistic Forecast. Stale (>2 weeks) are likely forgotten and excluded from forecast." arrow placement="top" enterDelay={300}>
                        <div className="bg-white rounded-lg p-4 shadow-sm border border-amber-200">
                          <div className="text-sm text-amber-600 mb-1">Pending Confirmation</div>
                          <div className="text-2xl font-bold text-amber-700">
                            {(() => {
                              if (!progress) return '-';
                              const value = getProgressValue(progress, metric, 'pending_completion');
                              return value != null ? config.format(value) : '0';
                            })()}
                          </div>
                          <div className="text-xs text-amber-500 mt-1">
                            {(() => {
                              if (!progress) return 'Awaiting tutor confirmation';
                              const recent = getProgressValue(progress, metric, 'pending_recent') || 0;
                              const stale = getProgressValue(progress, metric, 'pending_stale') || 0;
                              return `${config.format(recent)} recent · ${config.format(stale)} stale (>2wk)`;
                            })()}
                          </div>
                        </div>
                      </MuiTooltip>

                      {/* Scheduled */}
                      <MuiTooltip title={`Future ${config.label.toLowerCase()} booked in TutorCruncher (today and beyond). These haven't happened yet but are on the calendar.`} arrow placement="top" enterDelay={300}>
                        <div className="bg-white rounded-lg p-4 shadow-sm border border-blue-200">
                          <div className="text-sm text-blue-600 mb-1">Scheduled</div>
                          <div className="text-2xl font-bold text-blue-700">
                            {(() => {
                              if (!progress) return '-';
                              const value = getProgressValue(progress, metric, 'scheduled');
                              return value != null ? config.format(value) : '-';
                            })()}
                          </div>
                          <div className="text-xs text-blue-500 mt-1">Today + future booked</div>
                        </div>
                      </MuiTooltip>

                      {/* Total */}
                      <MuiTooltip title="Sum of completed + pending + scheduled for the full period. This is the total expected outcome if all pending and scheduled lessons are completed." arrow placement="top" enterDelay={300}>
                        <div className="bg-white rounded-lg p-4 shadow-sm border border-indigo-200">
                          <div className="text-sm text-indigo-600 mb-1">Total</div>
                          <div className="text-2xl font-bold text-indigo-700">
                            {(() => {
                              if (!progress) return '-';
                              const completed = getProgressValue(progress, metric, 'completed') || 0;
                              const pending = getProgressValue(progress, metric, 'pending_completion') || 0;
                              const scheduled = getProgressValue(progress, metric, 'scheduled') || 0;
                              const total = completed + pending + scheduled;
                              return config.format(total);
                            })()}
                          </div>
                          <div className="text-xs text-indigo-500 mt-1">Completed + pending + scheduled</div>
                        </div>
                      </MuiTooltip>
                    </div>
                  </>
                )}

                {/* Adhoc pay adjustment note for profit metric */}
                {metric === 'profit' && hasHistoricalMargin && (
                  <div className="flex items-start gap-2 bg-amber-50 border border-amber-200 rounded-lg p-3 mt-2">
                    <svg className="h-4 w-4 text-amber-600 mt-0.5 flex-shrink-0" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" d="M12 9v3.75m9-.75a9 9 0 1 1-18 0 9 9 0 0 1 18 0Zm-9 3.75h.008v.008H12v-.008Z" />
                    </svg>
                    <div className="text-xs text-amber-800">
                      <span className="font-semibold">Includes estimated ad hoc tutor pay adjustment.</span>{' '}
                      Based on 6-month historical data, ad hoc payments (bonuses, background checks, etc.) average ~{historicalAdhocPct.toFixed(1)}% of revenue (~${Math.round(dashboardMetrics?.estimatedAdhocPay || 0).toLocaleString()}).
                      Tutor pay: {dashboardMetrics?.realisticCostPct?.toFixed(1) || '–'}% + adhoc: ~{historicalAdhocPct.toFixed(1)}% = {((dashboardMetrics?.realisticCostPct || 0) + historicalAdhocPct).toFixed(1)}% total cost → {dashboardMetrics?.realisticMarginPct?.toFixed(1) || '–'}% profit margin.
                    </div>
                  </div>
                )}

                {/* Trend Chart (hidden for completion_rate) */}
                {!isAggregateMetric && metric !== 'completion_rate' && chartData.length > 0 && (
                  <div className="h-64 mt-4">
                    <ResponsiveContainer width="100%" height="100%">
                      <LineChart data={chartData} margin={{ top: 10, right: 30, left: 10, bottom: 10 }}>
                        <CartesianGrid strokeDasharray="3 3" stroke={CHART_GRID} />
                        <XAxis
                          dataKey="label"
                          tick={{ fontSize: 11, fill: CHART_AXIS }}
                          interval="preserveStartEnd"
                        />
                        <YAxis
                          tickFormatter={(v) => config.shortFormat(v)}
                          tick={{ fontSize: 11, fill: CHART_AXIS }}
                          width={55}
                          domain={[0, (dataMax) => {
                            // Ensure Y-axis extends to include the weekly target line
                            const target = summary?.weeklyTarget || 0;
                            const max = Math.max(dataMax, target);
                            // Add 10% padding above the max
                            return Math.ceil(max * 1.1);
                          }]}
                        />
                        <Tooltip content={<CustomChartTooltip metric={metric} weeklyTarget={summary?.weeklyTarget} />} />
                        <Legend wrapperStyle={{ display: 'none' }} />

                        {/* Target reference line - horizontal line across the chart at weekly target */}
                        {summary?.weeklyTarget && (
                          <ReferenceLine
                            y={summary.weeklyTarget}
                            stroke={CHART_TARGET}
                            strokeDasharray="8 4"
                            strokeWidth={2}
                            label={{
                              value: metric === 'revenue'
                                ? `Target ($${Math.round(summary.weeklyTarget).toLocaleString()}/wk)`
                                : `Target (${Math.round(summary.weeklyTarget)}/wk)`,
                              fill: CHART_TARGET,
                              fontSize: 11,
                              position: 'right'
                            }}
                          />
                        )}

                        {/* Historical actuals - solid green, smooth line */}
                        <Line
                          type="monotone"
                          dataKey="actual"
                          stroke="#22c55e"
                          strokeWidth={2.5}
                          dot={false}
                          activeDot={{ r: 5, fill: '#22c55e' }}
                          name="Completed"
                          connectNulls={true}
                        />

                        {/* Scheduled forecast - solid blue, smooth line */}
                        <Line
                          type="monotone"
                          dataKey="scheduled"
                          stroke={CHART_FORECAST}
                          strokeWidth={2.5}
                          dot={false}
                          activeDot={{ r: 5, fill: CHART_FORECAST }}
                          name="Scheduled"
                          connectNulls={true}
                        />

                        {/* Projected forecast - dashed purple, smooth line */}
                        <Line
                          type="monotone"
                          dataKey="projected"
                          stroke="#8b5cf6"
                          strokeWidth={2}
                          strokeDasharray="8 4"
                          dot={false}
                          activeDot={{ r: 4, fill: '#8b5cf6' }}
                          name="Projected"
                          connectNulls={true}
                        />

                        {/* Prior year comparison - dashed gray, smooth line */}
                        <Line
                          type="monotone"
                          dataKey="prior_year"
                          stroke="#9ca3af"
                          strokeWidth={1.5}
                          strokeDasharray="6 3"
                          dot={false}
                          activeDot={{ r: 4, fill: '#9ca3af' }}
                          name="Prior Year"
                          connectNulls={true}
                        />
                      </LineChart>
                    </ResponsiveContainer>
                  </div>
                )}

                {/* Legend explanation (hidden for completion_rate) */}
                {!isAggregateMetric && metric !== 'completion_rate' && (
                  <div className="flex flex-wrap items-center justify-center gap-6 mt-4 text-xs text-neutral-500">
                    <div className="flex items-center gap-2">
                      <div className="w-6 h-0.5 bg-green-500 rounded"></div>
                      <span>Completed</span>
                    </div>
                    <div className="flex items-center gap-2">
                      <div className="w-6 h-0.5 bg-blue-500 rounded"></div>
                      <span>Scheduled</span>
                    </div>
                    <div className="flex items-center gap-2">
                      <svg width="24" height="2" className="flex-shrink-0">
                        <line x1="0" y1="1" x2="24" y2="1" stroke="#8b5cf6" strokeWidth="2" strokeDasharray="6 3" />
                      </svg>
                      <span>Projected</span>
                    </div>
                    <div className="flex items-center gap-2">
                      <svg width="24" height="2" className="flex-shrink-0">
                        <line x1="0" y1="1" x2="24" y2="1" stroke="#9ca3af" strokeWidth="1.5" strokeDasharray="4 2" />
                      </svg>
                      <span>Last Year</span>
                    </div>
                    {summary?.weeklyTarget && (
                      <div className="flex items-center gap-2">
                        <svg width="24" height="2" className="flex-shrink-0">
                          <line x1="0" y1="1" x2="24" y2="1" stroke={CHART_TARGET} strokeWidth="2" strokeDasharray="4 2" />
                        </svg>
                        <span>Weekly Target</span>
                      </div>
                    )}
                  </div>
                )}
              </>
            )}
          </div>

          {/* Detailed Data Section (children from DrilldownModal) */}
          {!isAggregateMetric && metric !== 'completion_rate' && children && (
            <div className="border-t border-neutral-200 pt-6">
              <div className="flex items-center justify-between mb-4">
                <h3 className="text-lg font-semibold text-neutral-900">Detailed Data</h3>
                {onDownloadCSV && (
                  <button
                    onClick={onDownloadCSV}
                    disabled={csvDownloading}
                    className="px-3 py-1.5 text-sm font-medium text-white bg-brand-purple hover:bg-brand-navy rounded-lg transition-colors disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-1"
                  >
                    {csvDownloading ? (
                      <>
                        <svg className="animate-spin h-4 w-4" viewBox="0 0 24 24">
                          <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" fill="none" />
                          <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
                        </svg>
                        Downloading...
                      </>
                    ) : (
                      'Download CSV'
                    )}
                  </button>
                )}
              </div>
              {children}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
