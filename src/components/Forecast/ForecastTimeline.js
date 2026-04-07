import React, { useState, useEffect, useMemo } from 'react';
import { DateTime } from 'luxon';
import {
  AreaChart,
  Area,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  ReferenceLine,
} from 'recharts';
import { getHolidayRanges } from './holidays';

// Summer slump ranges for NYC markets
const getSummerSlumpRanges = (year) => {
  return [{
    name: 'NYC Summer Slump',
    start: DateTime.fromObject({ year, month: 6, day: 15 }).startOf('day'),
    end: DateTime.fromObject({ year, month: 8, day: 31 }).endOf('day'),
    color: '#fef3c7', // amber-100
  }];
};

// Custom tooltip - shows scheduled data with status context
const CustomTooltip = ({ active, payload, label }) => {
  if (!active || !payload || !payload.length) return null;

  const data = payload[0]?.payload;
  if (!data) return null;

  const statusLabel = data.is_stale ? 'Stale (30+ days)' : data.is_past ? 'Pending Confirmation' : 'Scheduled';
  const statusColor = data.is_stale ? 'text-red-600' : data.is_past ? 'text-amber-600' : 'text-green-600';
  const dotColor = data.is_stale ? 'bg-red-500' : data.is_past ? 'bg-amber-400' : 'bg-green-500';

  return (
    <div className="bg-white p-3 rounded-lg shadow-lg border border-neutral-200 text-sm">
      <div className="font-medium text-neutral-900 mb-1">
        {DateTime.fromISO(data.date).toFormat('EEEE, MMM d, yyyy')}
      </div>
      <div className={`text-xs font-medium mb-2 ${statusColor}`}>
        {statusLabel}
      </div>
      <div className="space-y-1">
        <div className="flex items-center gap-2">
          <div className={`w-3 h-3 rounded ${dotColor}`}></div>
          <span className="text-neutral-600">Revenue:</span>
          <span className="font-medium">${(data.scheduled_revenue || 0).toLocaleString()}</span>
        </div>
        <div className="flex items-center gap-2">
          <span className="text-neutral-600 ml-5">Lessons:</span>
          <span className="font-medium">{data.scheduled_lessons || 0}</span>
        </div>
      </div>
      {data.is_holiday && (
        <div className="mt-2 text-xs text-amber-600 bg-amber-50 px-2 py-1 rounded">
          Holiday Period
        </div>
      )}
      {data.is_summer_slump && (
        <div className="mt-2 text-xs text-orange-600 bg-orange-50 px-2 py-1 rounded">
          NYC Summer Slump (Seasonality Applied)
        </div>
      )}
    </div>
  );
};

export default function ForecastTimeline({ startDate, endDate, channel, scenario, dailyData: propDailyData, forecastTab = 'scheduled' }) {
  const [targets, setTargets] = useState([]);
  const [targetsLoading, setTargetsLoading] = useState(true);

  // Only fetch targets (lightweight) - daily data comes from scenarios prop
  useEffect(() => {
    const fetchTargets = async () => {
      setTargetsLoading(true);
      try {
        const targetsRes = await fetch('/api/forecast/targets', { credentials: 'include' });
        const targetsData = targetsRes.ok ? await targetsRes.json() : { targets: [] };
        setTargets(targetsData.targets || []);
      } catch (err) {
        console.error('Failed to fetch targets:', err);
      } finally {
        setTargetsLoading(false);
      }
    };

    fetchTargets();
  }, []);

  // Transform prop data to chart format with metadata
  // Split past scheduled data into stale (30+ days), pending (1-30 days), and future
  const dailyData = useMemo(() => {
    if (!propDailyData || !startDate) return [];

    const holidays = getHolidayRanges(DateTime.fromISO(startDate).year);
    const summerSlump = getSummerSlumpRanges(DateTime.fromISO(startDate).year);
    const today = DateTime.now().toISODate();
    const thirtyDaysAgo = DateTime.now().minus({ days: 30 }).toISODate();

    return propDailyData.map(entry => {
      const date = DateTime.fromISO(entry.date);
      const isHoliday = holidays.some(h => date >= h.start && date <= h.end);
      const isSummerSlump = summerSlump.some(s => date >= s.start && date <= s.end);
      const isPast = entry.date < today;
      const isStale = entry.date < thirtyDaysAgo;

      const rev = entry.scheduled_revenue || 0;

      return {
        ...entry,
        total_lessons: (entry.scheduled_lessons || 0) + (entry.projected_lessons || 0),
        total_revenue: rev + (entry.projected_revenue || 0),
        // Split revenue by time status for color-coded chart
        future_revenue: !isPast ? rev : 0,
        pending_revenue: isPast && !isStale ? rev : 0,
        stale_revenue: isStale ? rev : 0,
        is_holiday: isHoliday,
        is_summer_slump: isSummerSlump,
        is_past: isPast,
        is_stale: isStale,
      };
    });
  }, [propDailyData, startDate]);

  // Loading state depends on whether we have data
  const loading = !propDailyData;
  const error = null;

  // Calculate daily target line
  const dailyTarget = useMemo(() => {
    if (!targets.length || !startDate || !endDate) return null;

    const weeklyTarget = targets.find(t =>
      t.target_type === 'weekly_lessons' &&
      (channel ? t.channel === channel : !t.channel)
    );

    if (!weeklyTarget) return null;

    // Convert weekly lessons to daily revenue estimate
    // Rough estimate: weekly lessons / 7 days * avg revenue per lesson
    const avgRevenuePerLesson = 100; // Estimate
    return (weeklyTarget.target_value / 7) * avgRevenuePerLesson;
  }, [targets, channel, startDate, endDate]);

  // Format x-axis
  const formatXAxis = (dateStr) => {
    const date = DateTime.fromISO(dateStr);
    return date.toFormat('MMM d');
  };

  // Format y-axis
  const formatYAxis = (value) => {
    if (value >= 1000) {
      return `$${(value / 1000).toFixed(1)}k`;
    }
    return `$${value}`;
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-purple-600"></div>
        <span className="ml-2 text-sm text-neutral-600">Loading timeline...</span>
      </div>
    );
  }

  if (error) {
    return (
      <div className="flex items-center justify-center h-64 text-red-600">
        {error}
      </div>
    );
  }

  if (!dailyData.length) {
    return (
      <div className="flex items-center justify-center h-64 text-neutral-500">
        No forecast data available for selected range
      </div>
    );
  }

  return (
    <div className="h-80">
      <ResponsiveContainer width="100%" height="100%">
        <AreaChart
          data={dailyData}
          margin={{ top: 10, right: 30, left: 0, bottom: 0 }}
        >
          <defs>
            {/* Green gradient - future scheduled */}
            <linearGradient id="futureGradient" x1="0" y1="0" x2="0" y2="1">
              <stop offset="5%" stopColor="#22c55e" stopOpacity={0.8}/>
              <stop offset="95%" stopColor="#22c55e" stopOpacity={0.1}/>
            </linearGradient>
            {/* Amber gradient - pending confirmation (1-30 days past) */}
            <linearGradient id="pendingGradient" x1="0" y1="0" x2="0" y2="1">
              <stop offset="5%" stopColor="#f59e0b" stopOpacity={0.7}/>
              <stop offset="95%" stopColor="#f59e0b" stopOpacity={0.1}/>
            </linearGradient>
            {/* Red gradient - stale (30+ days past) */}
            <linearGradient id="staleGradient" x1="0" y1="0" x2="0" y2="1">
              <stop offset="5%" stopColor="#ef4444" stopOpacity={0.6}/>
              <stop offset="95%" stopColor="#ef4444" stopOpacity={0.1}/>
            </linearGradient>
          </defs>
          <CartesianGrid strokeDasharray="3 3" stroke="#e5e7eb" />
          <XAxis
            dataKey="date"
            tickFormatter={formatXAxis}
            tick={{ fontSize: 12, fill: '#6b7280' }}
            interval="preserveStartEnd"
            minTickGap={50}
          />
          <YAxis
            tickFormatter={formatYAxis}
            tick={{ fontSize: 12, fill: '#6b7280' }}
            width={60}
          />
          <Tooltip content={<CustomTooltip />} />

          {/* Target reference line */}
          {dailyTarget && (
            <ReferenceLine
              y={dailyTarget}
              stroke="#7c3aed"
              strokeDasharray="8 4"
              strokeWidth={2}
              label={{ value: 'Target', fill: '#7c3aed', fontSize: 11, position: 'right' }}
            />
          )}

          {/* Stale - red (30+ days past, likely forgotten) */}
          <Area
            type="monotone"
            dataKey="stale_revenue"
            stroke="#ef4444"
            fill="url(#staleGradient)"
            strokeWidth={1.5}
            name="Stale"
          />

          {/* Pending - amber (1-30 days past, awaiting confirmation) */}
          <Area
            type="monotone"
            dataKey="pending_revenue"
            stroke="#f59e0b"
            fill="url(#pendingGradient)"
            strokeWidth={1.5}
            name="Pending"
          />

          {/* Future - green (today + future, scheduled) */}
          <Area
            type="monotone"
            dataKey="future_revenue"
            stroke="#22c55e"
            fill="url(#futureGradient)"
            strokeWidth={2}
            name="Scheduled"
          />
        </AreaChart>
      </ResponsiveContainer>

      {/* Legend */}
      <div className="flex flex-wrap items-center justify-center gap-6 mt-4 text-xs text-neutral-500">
        <div className="flex items-center gap-2">
          <div className="w-4 h-3 bg-green-500 rounded"></div>
          <span>Scheduled (Future)</span>
        </div>
        <div className="flex items-center gap-2">
          <div className="w-4 h-3 bg-amber-400 rounded"></div>
          <span>Pending Confirmation (1-30 days)</span>
        </div>
        <div className="flex items-center gap-2">
          <div className="w-4 h-3 bg-red-500 rounded"></div>
          <span>Stale (30+ days, likely forgotten)</span>
        </div>
        <div className="flex items-center gap-2">
          <div className="w-4 h-0.5 bg-purple-500" style={{ borderTop: '2px dashed #7c3aed', height: 0 }}></div>
          <span>Daily Target</span>
        </div>
      </div>
    </div>
  );
}
