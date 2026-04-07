import React, { useState, useEffect, useMemo } from 'react';
import { useToast } from '../hooks/useToast';
import { formatCurrency } from '../utils/formatters';
import {
  AreaChart,
  Area,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
  ResponsiveContainer,
  ReferenceLine,
  ReferenceArea,
  Label
} from 'recharts';
import { DateTime } from 'luxon';
import { getHolidayRanges } from './Forecast/holidays';

function classNames(...classes) {
  return classes.filter(Boolean).join(' ');
}

export default function ForecastCard({ segment = null }) {
  const toast = useToast();
  const [forecastData, setForecastData] = useState(null);
  const [actualsData, setActualsData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [selectedLessonType, setSelectedLessonType] = useState('All');
  const [selectedMarket, setSelectedMarket] = useState('All');
  const [drilldownOpen, setDrilldownOpen] = useState(false);
  const [selectedDate, setSelectedDate] = useState(null);
  const [showAdjusted, setShowAdjusted] = useState(false);
  const [trainingInProgress, setTrainingInProgress] = useState(false);
  const [trainingProgress, setTrainingProgress] = useState(0);
  const [trainingStage, setTrainingStage] = useState('');
  const [trainingStartTime, setTrainingStartTime] = useState(null);
  const [elapsedTime, setElapsedTime] = useState(0);
  const [detailsOpen, setDetailsOpen] = useState(false);

  const lessonTypes = ['All', 'Home', 'School', 'Club', 'Online'];
  const markets = ['All', 'NYC', 'LA', 'SF', 'Hamptons', 'Westchester'];

  // Build segment from filters
  const currentSegment = useMemo(() => {
    const seg = {};
    if (selectedMarket !== 'All') seg.market = selectedMarket;
    if (selectedLessonType !== 'All') seg.lesson_type = selectedLessonType;
    return Object.keys(seg).length > 0 ? seg : null;
  }, [selectedMarket, selectedLessonType]);

  // Check for persisted training state on mount
  useEffect(() => {
    const persistedTraining = localStorage.getItem('forecast_training_state');
    if (persistedTraining) {
      try {
        const state = JSON.parse(persistedTraining);
        const now = Date.now();
        const elapsed = Math.floor((now - state.startTime) / 1000);
        
        // If training was started less than 30 minutes ago, restore the state
        if (elapsed < 1800) {
          setTrainingInProgress(true);
          setTrainingStartTime(state.startTime);
          setTrainingProgress(state.progress || 0);
          setTrainingStage(state.stage || 'Starting...');
          setElapsedTime(elapsed);
        } else {
          // Training has been running too long, clear the state
          localStorage.removeItem('forecast_training_state');
        }
      } catch (e) {
        console.error('Failed to restore training state:', e);
        localStorage.removeItem('forecast_training_state');
      }
    }
  }, []);

  // Persist training state when it changes
  useEffect(() => {
    if (trainingInProgress && trainingStartTime) {
      localStorage.setItem('forecast_training_state', JSON.stringify({
        startTime: trainingStartTime,
        progress: trainingProgress,
        stage: trainingStage
      }));
    } else {
      localStorage.removeItem('forecast_training_state');
    }
  }, [trainingInProgress, trainingStartTime, trainingProgress, trainingStage]);

  // Update elapsed time while training
  useEffect(() => {
    let interval;
    if (trainingInProgress && trainingStartTime) {
      interval = setInterval(() => {
        const elapsed = Math.floor((Date.now() - trainingStartTime) / 1000);
        setElapsedTime(elapsed);
        
        // Simulate progress stages
        if (elapsed < 30) {
          setTrainingStage('Collecting historical data...');
          setTrainingProgress(Math.min(20, (elapsed / 30) * 20));
        } else if (elapsed < 90) {
          setTrainingStage('Training Prophet time-series model...');
          setTrainingProgress(20 + Math.min(40, ((elapsed - 30) / 60) * 40));
        } else if (elapsed < 150) {
          setTrainingStage('Training LightGBM pipeline model...');
          setTrainingProgress(60 + Math.min(30, ((elapsed - 90) / 60) * 30));
        } else if (elapsed < 600) {
          // After 150 seconds, continue slowly to 98% (up to 10 minutes)
          setTrainingStage('Generating forecast predictions...');
          setTrainingProgress(Math.min(98, 90 + ((elapsed - 150) / 450) * 8));
        } else {
          // After 10 minutes, assume it might be stuck and show a warning
          setTrainingStage('Training taking longer than expected... This may take a few more minutes.');
          setTrainingProgress(98);
        }
      }, 1000);
    }
    return () => clearInterval(interval);
  }, [trainingInProgress, trainingStartTime]);

  // Fetch forecast data
  useEffect(() => {
    const fetchForecast = async () => {
      setLoading(true);
      setError(null);
      try {
        const params = new URLSearchParams();
        if (currentSegment) {
          params.append('segment', JSON.stringify(currentSegment));
        }
        if (currentSegment?.market) params.append('market', currentSegment.market);
        if (currentSegment?.lesson_type) params.append('lesson_type', currentSegment.lesson_type);

        const [forecastRes, actualsRes] = await Promise.all([
          fetch(`/api/forecast/current?${params}`, {
            credentials: 'include'
          }),
          fetch(`/api/forecast/actuals?${params}`, {
            credentials: 'include'
          })
        ]);

        if (!forecastRes.ok) throw new Error('Failed to fetch forecast');
        if (!actualsRes.ok) throw new Error('Failed to fetch actuals');

        const forecast = await forecastRes.json();
        const actuals = await actualsRes.json();

        // Check if we have a new forecast (training completed)
        const lastRunId = forecastData?.run_id;
        const hasNewForecast = forecast.run_id && forecast.run_id !== lastRunId;
        
        setForecastData(forecast);
        setActualsData(actuals);
        
        // If training was in progress and we now have a new forecast, stop training
        if (trainingInProgress && hasNewForecast) {
          setTrainingInProgress(false);
          setTrainingProgress(100);
          setTrainingStage('Complete!');
          setTimeout(() => {
            setTrainingProgress(0);
            setTrainingStage('');
          }, 2000);
        }
        
        // If training has been running for more than 15 minutes, check if it might have failed
        if (trainingInProgress && elapsedTime > 900) {
          // Still show training, but log a warning
          console.warn('Forecast training has been running for over 15 minutes. This may indicate an issue.');
        }
      } catch (err) {
        console.error('Forecast fetch error:', err);
        setError(err.message);
      } finally {
        setLoading(false);
      }
    };

    fetchForecast();
    
    // Poll for updates while training
    if (trainingInProgress) {
      const pollInterval = setInterval(fetchForecast, 10000); // Poll every 10 seconds
      return () => clearInterval(pollInterval);
    }
  }, [currentSegment, trainingInProgress, trainingStartTime, forecastData?.run_id]);

  // Get holiday ranges
  const holidays = useMemo(() => {
    const currentYear = DateTime.now().year;
    const nextYear = currentYear + 1;
    // Get holidays for current and next year
    return [...getHolidayRanges(currentYear), ...getHolidayRanges(nextYear)];
  }, []);

  // Combine actuals and forecast for chart with optional seasonal adjustment
  const chartData = useMemo(() => {
    if (!forecastData || !actualsData) return [];

    const actuals = actualsData.actuals || [];
    const forecasts = forecastData.forecasts || [];

    const today = DateTime.now().startOf('day');
    
    // Get last 3 months of actuals (for context, up to today)
    const threeMonthsAgo = today.minus({ months: 3 });
    const filteredActuals = actuals.filter(a => {
      const date = DateTime.fromISO(a.date).startOf('day');
      return date >= threeMonthsAgo && date <= today;
    });

    // Filter forecasts to only future dates (today onwards)
    const futureForecasts = forecasts.filter(f => {
      const date = DateTime.fromISO(f.date).startOf('day');
      return date >= today;
    });

    // Combine and sort by date
    let combined = [
      ...filteredActuals.map(a => ({
        date: a.date,
        revenue: a.revenue,
        type: 'actual'
      })),
      ...futureForecasts.map(f => {
        const forecastDate = DateTime.fromISO(f.date);
        // Check if date is in a holiday period
        const isHoliday = holidays.some(
          h => forecastDate >= h.start && forecastDate <= h.end
        );
        
        // If seasonal adjustment is enabled and it's a holiday, boost revenue
        // This removes the expected dip (assumes 40% dip during holidays)
        const adjustmentFactor = showAdjusted && isHoliday ? 1 / 0.6 : 1;
        
        return {
          date: f.date,
          p10: f.p10 * adjustmentFactor,
          p50: f.p50 * adjustmentFactor,
          p90: f.p90 * adjustmentFactor,
          type: 'forecast'
        };
      })
    ].sort((a, b) => new Date(a.date) - new Date(b.date));

    return combined;
  }, [forecastData, actualsData, showAdjusted, holidays]);

  // Check if we have forecast data (future dates)
  const hasFutureForecasts = useMemo(() => {
    if (!chartData || chartData.length === 0) return false;
    return chartData.some(d => d.type === 'forecast' && DateTime.fromISO(d.date) >= DateTime.now().startOf('day'));
  }, [chartData]);

  // Calculate KPIs
  const kpis = useMemo(() => {
    if (!forecastData || !forecastData.forecasts) return null;

    const forecasts = forecastData.forecasts;
    const today = DateTime.now();
    const next30Days = today.plus({ days: 30 });
    const next90Days = today.plus({ days: 90 });

    const next30 = forecasts.filter(f => {
      const date = DateTime.fromISO(f.date);
      return date >= today && date <= next30Days;
    });

    const next90 = forecasts.filter(f => {
      const date = DateTime.fromISO(f.date);
      return date >= today && date <= next90Days;
    });

    const sum30 = next30.reduce((sum, f) => sum + (f.p50 || 0), 0);
    const sum90 = next90.reduce((sum, f) => sum + (f.p50 || 0), 0);
    const p10_30 = next30.reduce((sum, f) => sum + (f.p10 || 0), 0);
    const p90_30 = next30.reduce((sum, f) => sum + (f.p90 || 0), 0);

    return {
      next30dP50: sum30,
      next30dP10: p10_30,
      next30dP90: p90_30,
      next90dP50: sum90,
      backtestMAPE: forecastData.metrics?.mape || 0,
      backtestWAPE: forecastData.metrics?.wape || 0,
      blendWeight: forecastData.blend_weight || 0.7
    };
  }, [forecastData]);

  const handlePointClick = (data) => {
    if (data.type === 'forecast') {
      setSelectedDate(data.date);
      setDrilldownOpen(true);
    }
  };

  const formatDate = (dateStr) => {
    const date = DateTime.fromISO(dateStr);
    return date.toFormat('MMM d');
  };

  if (loading) {
    return (
      <div className="bg-white border border-neutral-200 rounded-xl shadow-sm p-6">
        <div className="flex items-center justify-center py-8">
          <div className="animate-spin rounded-full h-6 w-6 border-b-2 border-purple-600"></div>
          <span className="ml-2 text-sm text-neutral-600">Loading forecast...</span>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="bg-white border border-neutral-200 rounded-xl shadow-sm p-6">
        <div className="text-sm text-red-600">Error loading forecast: {error}</div>
        <button
          onClick={() => window.location.reload()}
          className="mt-2 px-3 py-1 text-xs bg-purple-600 text-white rounded hover:bg-purple-700"
        >
          Retry
        </button>
      </div>
    );
  }

  // Training progress overlay
  const TrainingProgressOverlay = () => {
    if (!trainingInProgress) return null;
    
    const formatTime = (seconds) => {
      const mins = Math.floor(seconds / 60);
      const secs = seconds % 60;
      return `${mins}:${secs.toString().padStart(2, '0')}`;
    };
    
    return (
      <div className="absolute top-0 left-0 right-0 bottom-0 bg-gradient-to-br from-purple-50/98 via-white/98 to-purple-50/98 flex flex-col items-center justify-center p-6 sm:p-8 border-0 shadow-inner backdrop-blur-sm z-10">
        <div className="w-full max-w-lg mx-auto">
          {/* Title with gradient - proper spacing from top */}
          <div className="mb-8 text-center">
            <div className="inline-flex items-center justify-center gap-3 mb-4">
              <div className="relative">
                <div className="absolute inset-0 bg-purple-400 rounded-full animate-ping opacity-75"></div>
                <div className="absolute inset-0 bg-purple-300 rounded-full animate-pulse opacity-50"></div>
                <div className="relative bg-gradient-to-br from-purple-600 via-purple-700 to-purple-800 rounded-full p-3 shadow-xl">
                  <svg className="w-6 h-6 text-white animate-spin" fill="none" viewBox="0 0 24 24">
                    <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                    <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                  </svg>
                </div>
              </div>
              <h3 className="text-xl sm:text-2xl font-bold bg-gradient-to-r from-purple-600 via-purple-700 to-purple-800 bg-clip-text text-transparent">
                Training Forecast Model
              </h3>
            </div>
          </div>
          
          {/* Stage with fade animation - proper spacing */}
          <div className="mb-10 text-center">
            <p className="text-neutral-700 font-medium min-h-[28px] text-base sm:text-lg transition-all duration-300">
              {trainingStage || 'Starting...'}
            </p>
          </div>
          
          {/* Enhanced Progress Bar with centered spinning wheel */}
          <div className="mb-10">
            {/* Progress labels and bar */}
            <div className="flex justify-between items-center mb-4">
              <span className="text-sm font-semibold text-neutral-700">Progress</span>
              <span className="text-lg font-bold bg-gradient-to-r from-purple-600 to-purple-800 bg-clip-text text-transparent">
                {Math.round(trainingProgress)}%
              </span>
            </div>
            <div className="w-full bg-neutral-200 rounded-full h-5 overflow-hidden shadow-inner border border-neutral-300">
              <div 
                className="h-full bg-gradient-to-r from-purple-500 via-purple-600 to-purple-700 rounded-full transition-all duration-500 ease-out relative overflow-hidden"
                style={{ width: `${trainingProgress}%` }}
              >
                <div className="absolute inset-0 bg-gradient-to-r from-transparent via-white to-transparent opacity-40" style={{ animation: 'shimmer 2s infinite' }}></div>
              </div>
            </div>
          </div>
          
          {/* Time Elapsed with icon */}
          <div className="text-center mb-8">
            <div className="inline-flex items-center gap-2 px-5 py-2.5 bg-gradient-to-r from-purple-100 to-purple-200 rounded-full shadow-md border border-purple-300">
              <svg className="w-5 h-5 text-purple-600 animate-pulse" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
              </svg>
              <span className="text-base font-bold text-purple-700">
                {formatTime(elapsedTime)}
              </span>
            </div>
          </div>
          
          {/* Info Message */}
          <p className="text-xs text-neutral-500 text-center mb-6 px-4">
            This may take 2-5 minutes. The page will automatically update when complete.
          </p>
          
          {/* Animated dots */}
          <div className="flex justify-center gap-1.5">
            <div className="w-2 h-2 bg-purple-400 rounded-full animate-bounce" style={{ animationDelay: '0ms' }}></div>
            <div className="w-2 h-2 bg-purple-500 rounded-full animate-bounce" style={{ animationDelay: '150ms' }}></div>
            <div className="w-2 h-2 bg-purple-600 rounded-full animate-bounce" style={{ animationDelay: '300ms' }}></div>
          </div>
        </div>
      </div>
    );
  };

  // Check if we have forecast data (future dates) - already computed above
  if (!forecastData || !chartData.length || !hasFutureForecasts) {
    const hasRunData = forecastData && forecastData.run_id;
    return (
      <div className="bg-white border border-neutral-200 rounded-xl shadow-sm relative overflow-hidden">
        <div className="flex items-center justify-between px-4 sm:px-6 py-3 border-b border-neutral-100 relative z-20">
          <h3 className="text-base sm:text-lg font-semibold text-brand-navy font-heading">
            3-Month Revenue Forecast
          </h3>
        </div>
        <div className="p-4 sm:p-6 relative min-h-[400px]">
          <TrainingProgressOverlay />
          {hasRunData ? (
            <>
              <div className="text-sm text-neutral-500 mb-4">
                Forecast training completed but no future forecast data found. This may indicate:
                <ul className="list-disc list-inside mt-2 space-y-1">
                  <li>Forecast ran but didn't generate future dates</li>
                  <li>All forecast dates are in the past</li>
                  <li>Database connection issue</li>
                </ul>
              </div>
              <div className="text-xs text-neutral-400 mb-4">
                Last run: {forecastData.run_at ? new Date(forecastData.run_at).toLocaleString() : 'Unknown'}
              </div>
            </>
          ) : (
            <div className="text-sm text-neutral-500 mb-4">
              No forecast data available. Click below to run the first forecast training.
            </div>
          )}
          <button
            onClick={async () => {
              try {
                setTrainingInProgress(true);
                setTrainingStartTime(Date.now());
                setTrainingProgress(0);
                setTrainingStage('Initializing...');
                setElapsedTime(0);
                
                const response = await fetch('/api/forecast/run', {
                  method: 'POST',
                  headers: { 'Content-Type': 'application/json' },
                  credentials: 'include',
                  body: JSON.stringify({ horizonDays: 90, segment: currentSegment })
                });
                
                if (response.ok) {
                  const data = await response.json();
                  setTrainingStage('Training started in background...');
                  setTrainingProgress(5);
                  // The polling will be handled by the useEffect above
                } else {
                  const errorText = await response.text();
                  throw new Error(errorText || 'Failed to start forecast');
                }
              } catch (err) {
                console.error('Failed to trigger forecast:', err);
                setTrainingInProgress(false);
                setTrainingProgress(0);
                setTrainingStage('');
                toast.error(`Failed to start forecast training: ${err.message}`);
              }
            }}
            disabled={trainingInProgress}
            className={classNames(
              "px-4 py-2 text-sm rounded font-medium transition-all",
              trainingInProgress
                ? "bg-neutral-400 text-white cursor-not-allowed"
                : "bg-purple-600 text-white hover:bg-purple-700 hover:shadow-lg transform hover:scale-105"
            )}
          >
            {trainingInProgress ? 'Training in Progress...' : (hasRunData ? 'Re-run Forecast Training' : 'Run Forecast Training')}
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="bg-white border border-neutral-200 rounded-xl shadow-sm relative overflow-hidden">
      <div className="flex items-center justify-between px-4 sm:px-6 py-3 border-b border-neutral-100 relative z-20">
        <h3 className="text-base sm:text-lg font-semibold text-brand-navy font-heading">
          3-Month Revenue Forecast
        </h3>
        <div className="flex items-center gap-2">
          <button
            onClick={async () => {
              try {
                setTrainingInProgress(true);
                setTrainingStartTime(Date.now());
                setTrainingProgress(0);
                setTrainingStage('Initializing...');
                setElapsedTime(0);
                
                const response = await fetch('/api/forecast/run', {
                  method: 'POST',
                  headers: { 'Content-Type': 'application/json' },
                  credentials: 'include',
                  body: JSON.stringify({ horizonDays: 90, segment: currentSegment })
                });
                
                if (response.ok) {
                  const data = await response.json();
                  setTrainingStage('Training started in background...');
                  setTrainingProgress(5);
                  // The polling will be handled by the useEffect above
                } else {
                  const errorText = await response.text();
                  throw new Error(errorText || 'Failed to start forecast');
                }
              } catch (err) {
                console.error('Failed to trigger forecast:', err);
                setTrainingInProgress(false);
                setTrainingProgress(0);
                setTrainingStage('');
                toast.error(`Failed to start forecast training: ${err.message}`);
              }
            }}
            disabled={trainingInProgress}
            className={classNames(
              "text-xs px-2 py-1 rounded font-medium transition-all",
              trainingInProgress
                ? "bg-neutral-400 text-white cursor-not-allowed"
                : "bg-purple-600 text-white hover:bg-purple-700 hover:shadow-md"
            )}
            title="Re-run forecast"
          >
            {trainingInProgress ? 'Training...' : 'Refresh'}
          </button>
        </div>
      </div>

      <div className="p-4 sm:p-6 relative">
        <TrainingProgressOverlay />
        {/* Filters */}
        <div className="mb-4 flex flex-wrap gap-2 items-center">
          <div className="flex items-center gap-2">
            <span className="text-xs text-neutral-500">Lesson Type:</span>
            {lessonTypes.map(lt => (
              <button
                key={lt}
                onClick={() => setSelectedLessonType(lt)}
                className={classNames(
                  "px-2 py-1 text-xs rounded",
                  selectedLessonType === lt
                    ? "bg-purple-600 text-white"
                    : "bg-neutral-100 text-neutral-700 hover:bg-neutral-200"
                )}
              >
                {lt}
              </button>
            ))}
          </div>
          <div className="flex items-center gap-2">
            <span className="text-xs text-neutral-500">Market:</span>
            {markets.map(m => (
              <button
                key={m}
                onClick={() => setSelectedMarket(m)}
                className={classNames(
                  "px-2 py-1 text-xs rounded",
                  selectedMarket === m
                    ? "bg-purple-600 text-white"
                    : "bg-neutral-100 text-neutral-700 hover:bg-neutral-200"
                )}
              >
                {m}
              </button>
            ))}
          </div>
          <div className="flex items-center gap-2 ml-auto">
            <label className="flex items-center gap-1 text-xs text-neutral-600 cursor-pointer">
              <input
                type="checkbox"
                checked={showAdjusted}
                onChange={(e) => setShowAdjusted(e.target.checked)}
                className="rounded"
              />
              <span>Seasonally Adjusted</span>
            </label>
          </div>
        </div>

        {/* Chart */}
        <div className="mb-4" style={{ height: 280 }}>
          <ResponsiveContainer width="100%" height="100%">
            <AreaChart data={chartData} margin={{ top: 64, right: 16, left: 0, bottom: 0 }}>
              <CartesianGrid strokeDasharray="3 3" vertical={false} />
              <XAxis
                dataKey="date"
                tick={{ fontSize: 11 }}
                tickLine={false}
                axisLine={false}
                tickFormatter={formatDate}
                interval="preserveStartEnd"
              />
              <YAxis
                tick={{ fontSize: 11 }}
                tickLine={false}
                axisLine={false}
                tickFormatter={formatCurrency}
              />
              <Tooltip
                formatter={(value, name) => {
                  if (name === 'Revenue') return formatCurrency(value);
                  if (name === 'P50') return formatCurrency(value);
                  return formatCurrency(value);
                }}
                labelFormatter={formatDate}
                cursor={{ stroke: '#6D28D9', strokeWidth: 1 }}
              />
              <Legend />
              {/* Holiday overlays */}
              {holidays.map((holiday, idx) => {
                const holidayStart = holiday.start.toISODate();
                const holidayEnd = holiday.end.toISODate();
                // Only show holidays that are in the chart date range
                const chartDates = chartData.map(d => d.date);
                const minDate = chartDates[0];
                const maxDate = chartDates[chartDates.length - 1];
                
                if (holidayEnd < minDate || holidayStart > maxDate) {
                  return null;
                }
                
                return (
                  <ReferenceArea
                    key={idx}
                    x1={holidayStart}
                    x2={holidayEnd}
                    fill={holiday.color}
                    fillOpacity={0.35}
                    label={
                      <Label
                        value={holiday.name}
                        position="insideTop"
                        fill="#92400e"
                        fontSize={10}
                        offset={12}
                      />
                    }
                  />
                );
              })}
              {/* Actuals */}
              <Area
                type="monotone"
                dataKey="revenue"
                name="Actual Revenue"
                stroke="#16A34A"
                fill="#16A34A"
                fillOpacity={0.3}
                connectNulls
              />
              {/* Today line */}
              <ReferenceLine
                x={DateTime.now().toISODate()}
                stroke="#EF4444"
                strokeDasharray="3 3"
                label={{ value: 'Today', position: 'insideTop', offset: 12 }}
              />
              {/* Only show forecast areas if we have future forecast data */}
              {hasFutureForecasts && (
                <>
                  <Area
                    type="monotone"
                    dataKey="p90"
                    name="P90 (High)"
                    stroke="#0EA5E9"
                    fill="#0EA5E9"
                    fillOpacity={0.15}
                    connectNulls
                  />
                  <Area
                    type="monotone"
                    dataKey="p50"
                    name="P50 (Forecast)"
                    stroke="#7C3AED"
                    fill="#7C3AED"
                    fillOpacity={0.25}
                    connectNulls
                  />
                  <Area
                    type="monotone"
                    dataKey="p10"
                    name="P10 (Low)"
                    stroke="#F97316"
                    fill="#F97316"
                    fillOpacity={0.18}
                    connectNulls
                  />
                </>
              )}
            </AreaChart>
          </ResponsiveContainer>
        </div>

        {/* KPIs */}
        {kpis && (
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 text-xs">
            <div className="bg-neutral-50 p-2 rounded">
              <div className="text-neutral-500">Next 30d P50</div>
              <div className="font-semibold text-brand-navy">{formatCurrency(kpis.next30dP50)}</div>
            </div>
            <div className="bg-neutral-50 p-2 rounded">
              <div className="text-neutral-500">Next 30d Range</div>
              <div className="font-semibold text-brand-navy">
                {formatCurrency(kpis.next30dP10)} - {formatCurrency(kpis.next30dP90)}
              </div>
            </div>
            <div className="bg-neutral-50 p-2 rounded">
              <div className="text-neutral-500">Next 90d P50</div>
              <div className="font-semibold text-brand-navy">{formatCurrency(kpis.next90dP50)}</div>
            </div>
            <div className="bg-neutral-50 p-2 rounded">
              <div className="text-neutral-500">Backtest MAPE</div>
              <div className="font-semibold text-brand-navy">{kpis.backtestMAPE.toFixed(1)}%</div>
            </div>
          </div>
        )}

        {forecastData.run_at && (
          <div className="mt-3 text-xs text-neutral-500">
            Last run: {new Date(forecastData.run_at).toLocaleString()}
          </div>
        )}

        <div className="mt-4 flex justify-end">
          <button
            onClick={() => setDetailsOpen(true)}
            className="inline-flex items-center gap-2 px-3 py-2 text-xs font-semibold text-purple-700 bg-purple-50 border border-purple-200 rounded-lg hover:bg-purple-100 transition"
          >
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z" />
            </svg>
            View Forecast Details
          </button>
        </div>
      </div>

      {/* Drilldown Drawer */}
      {drilldownOpen && selectedDate && (
        <ForecastDrilldown
          open={drilldownOpen}
          onClose={() => {
            setDrilldownOpen(false);
            setSelectedDate(null);
          }}
          date={selectedDate}
          segment={currentSegment}
        />
      )}

      {/* Details Overlay */}
      {detailsOpen && (
        <ForecastDetailsOverlay
          open={detailsOpen}
          onClose={() => setDetailsOpen(false)}
          chartData={chartData}
          kpis={kpis}
          holidays={holidays}
          showAdjusted={showAdjusted}
          onToggleAdjusted={setShowAdjusted}
          formatCurrency={formatCurrency}
          formatDate={formatDate}
          forecastData={forecastData}
          actualsData={actualsData}
        />
      )}
    </div>
  );
}

// ForecastDrilldown Drawer Component
function ForecastDrilldown({ open, onClose, date, segment }) {
  const [lessons, setLessons] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!open || !date) return;

    const fetchDrilldown = async () => {
      setLoading(true);
      try {
        const params = new URLSearchParams({ date });
        if (segment) {
          params.append('segment', JSON.stringify(segment));
        }

        const res = await fetch(`/api/forecast/drilldown?${params}`, {
          credentials: 'include'
        });
        const data = await res.json();
        setLessons(data.lessons || []);
      } catch (err) {
        console.error('Failed to fetch drilldown:', err);
      } finally {
        setLoading(false);
      }
    };

    fetchDrilldown();
  }, [open, date, segment]);

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-50">
      <div className="absolute inset-0 bg-black/30" onClick={onClose} />
      <div className="absolute right-0 top-0 bottom-0 w-full max-w-2xl bg-white shadow-xl overflow-auto">
        <div className="flex items-center justify-between px-6 py-4 border-b border-neutral-200">
          <h3 className="text-lg font-semibold text-brand-navy">
            Forecast Drilldown - {date}
          </h3>
          <button
            onClick={onClose}
            className="text-neutral-500 hover:text-neutral-700"
          >
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        <div className="p-6">
          {loading ? (
            <div className="flex items-center justify-center py-8">
              <div className="animate-spin rounded-full h-6 w-6 border-b-2 border-purple-600"></div>
            </div>
          ) : lessons.length === 0 ? (
            <div className="text-sm text-neutral-500">No planned lessons found for this date</div>
          ) : (
            <>
              <div className="mb-4 text-sm text-neutral-600">
                Total Expected Value: ${lessons.reduce((sum, l) => sum + (l.expected_value || 0), 0).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
              </div>
              <div className="overflow-x-auto">
                <table className="min-w-full text-sm">
                  <thead>
                    <tr className="text-left text-neutral-600 border-b">
                      <th className="py-2 pr-4">Service</th>
                      <th className="py-2 pr-4">Client</th>
                      <th className="py-2 pr-4">Tutor</th>
                      <th className="py-2 pr-4 text-right">Price</th>
                      <th className="py-2 pr-4 text-right">Probability</th>
                      <th className="py-2 pr-4 text-right">Expected Value</th>
                      <th className="py-2"></th>
                    </tr>
                  </thead>
                  <tbody>
                    {lessons.map((lesson, idx) => (
                      <tr key={idx} className="border-b border-neutral-100">
                        <td className="py-2 pr-4">{lesson.service_name || '—'}</td>
                        <td className="py-2 pr-4">{lesson.client_name || '—'}</td>
                        <td className="py-2 pr-4">{lesson.tutor_name || '—'}</td>
                        <td className="py-2 pr-4 text-right">${Number(lesson.price || 0).toFixed(2)}</td>
                        <td className="py-2 pr-4 text-right">{(Number(lesson.probability || 0) * 100).toFixed(1)}%</td>
                        <td className="py-2 pr-4 text-right font-medium">
                          ${Number(lesson.expected_value || 0).toFixed(2)}
                        </td>
                        <td className="py-2">
                          {lesson.appointment_id && (
                            <a
                              href={`https://account.acmeops.com/cal/appointments/${lesson.appointment_id}/`}
                              target="_blank"
                              rel="noreferrer"
                              className="text-purple-600 hover:underline text-xs"
                            >
                              View
                            </a>
                          )}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  );
}

// Forecast Details Overlay Component
function ForecastDetailsOverlay({
  open,
  onClose,
  chartData,
  kpis,
  holidays,
  showAdjusted,
  onToggleAdjusted,
  formatCurrency,
  formatDate,
  forecastData,
  actualsData
}) {
  const today = useMemo(() => DateTime.now().startOf('day'), []);

  const forecastSpan = useMemo(() => {
    if (!chartData || chartData.length === 0) return null;

    const futurePoints = chartData.filter(d => d.type === 'forecast');
    const pastPoints = chartData.filter(d => d.type === 'actual');

    const start = pastPoints.length
      ? DateTime.fromISO(pastPoints[0].date).startOf('day')
      : futurePoints.length
        ? DateTime.fromISO(futurePoints[0].date).startOf('day')
        : null;
    const end = futurePoints.length
      ? DateTime.fromISO(futurePoints[futurePoints.length - 1].date).endOf('day')
      : pastPoints.length
        ? DateTime.fromISO(pastPoints[pastPoints.length - 1].date).endOf('day')
        : null;

    return start && end ? { start, end } : null;
  }, [chartData]);

  const upcomingHolidays = useMemo(() => {
    if (!forecastSpan) return [];

    return holidays
      .filter(h => h.end >= today && h.start <= forecastSpan.end)
      .map(h => {
        const days = Math.round(h.end.diff(h.start, 'days').days + 1);
        return {
          name: h.name,
          start: h.start,
          end: h.end,
          days,
          withinForecast: h.start >= today
        };
      });
  }, [holidays, today, forecastSpan]);

  const totalActuals = useMemo(() => {
    if (!actualsData?.actuals?.length) return 0;
    return actualsData.actuals.reduce((sum, a) => sum + (a.revenue || 0), 0);
  }, [actualsData]);

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-50">
      <div className="absolute inset-0 bg-black/40 backdrop-blur-sm" onClick={onClose} />
      <div className="absolute inset-y-6 inset-x-4 sm:inset-x-16 bg-white rounded-2xl shadow-2xl overflow-hidden flex flex-col">
        <div className="flex items-center justify-between px-6 sm:px-10 py-4 border-b border-neutral-200 bg-gradient-to-r from-purple-50 via-white to-purple-50">
          <div>
            <h2 className="text-lg sm:text-xl font-semibold text-brand-navy">Revenue Forecast Deep Dive</h2>
            {forecastSpan && (
              <p className="text-xs sm:text-sm text-neutral-500 mt-1">
                Showing actuals through {today.toFormat('MMM d')} and forecast out to {forecastSpan.end.toFormat('MMM d, yyyy')}
              </p>
            )}
          </div>
          <div className="flex items-center gap-3">
            <label className="flex items-center gap-2 text-xs text-neutral-600 cursor-pointer">
              <input
                type="checkbox"
                checked={showAdjusted}
                onChange={(e) => onToggleAdjusted(e.target.checked)}
                className="rounded"
              />
              <span>Seasonally Adjusted</span>
            </label>
            <button
              onClick={onClose}
              className="p-2 rounded-full text-neutral-500 hover:text-neutral-700 hover:bg-neutral-100 transition"
            >
              <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
              </svg>
            </button>
          </div>
        </div>

        <div className="px-6 sm:px-10 py-3 border-b border-neutral-100 bg-white">
          <div className="inline-flex items-center gap-1 text-xs font-medium text-neutral-500">
            <svg className="w-4 h-4 text-purple-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9.75 17L9 20l2-.75L13 20l-.75-3 2.25-2.25-3-.25L12 11l-1.5 2.75-3 .25L9.75 17z" />
            </svg>
            RFS combines Prophet time-series with LightGBM pipeline probabilities to create the percentile bands shown below.
          </div>
        </div>

        <div className="flex-1 overflow-y-auto px-6 sm:px-10 py-6 space-y-8">
          <section>
            <h3 className="text-sm sm:text-base font-semibold text-brand-navy mb-4">Forecast Bands & Concepts</h3>
            <div className="grid sm:grid-cols-2 gap-4 text-sm text-neutral-600">
              <div className="bg-neutral-50 border border-neutral-200 rounded-lg p-4 space-y-2">
                <p><span className="font-semibold text-brand-navy">Actual Revenue:</span> Historic dollars that have already cleared in the last ~3 months.</p>
                <p><span className="font-semibold text-brand-navy">P50 (Forecast):</span> Median revenue that our Prophet + LightGBM ensemble expects for each future day. Think of this as the most likely revenue outcome.</p>
                <p><span className="font-semibold text-brand-navy">P90 (High):</span> A high-case scenario—there is roughly a 10% chance revenue lands above this band.</p>
                <p><span className="font-semibold text-brand-navy">P10 (Low):</span> A conservative scenario—there is roughly a 10% chance revenue lands below this level.</p>
              </div>
              <div className="bg-purple-50 border border-purple-200 rounded-lg p-4 space-y-2">
                <p><span className="font-semibold text-brand-navy">Next 30d P50:</span> The sum of the daily P50 forecasts over the next 30 calendar days. It answers “What revenue should we plan for in the next month?”</p>
                <p><span className="font-semibold text-brand-navy">Next 30d Range:</span> Adds context by combining the P10 and P90 sums—useful for “best vs worst” cases when planning staffing or cash.</p>
                <p><span className="font-semibold text-brand-navy">Next 90d P50:</span> Medium-term planning number—what the ensemble expects over the next quarter.</p>
                <p><span className="font-semibold text-brand-navy">Backtest MAPE:</span> Mean Absolute Percentage Error from the latest backtest. Lower is better; 50% means actuals landed within ±50% of the forecast on average.</p>
              </div>
            </div>
          </section>

          <section>
            <h3 className="text-sm sm:text-base font-semibold text-brand-navy mb-4">Expanded Revenue Metrics</h3>
            {kpis ? (
              <div className="grid sm:grid-cols-2 lg:grid-cols-4 gap-4 text-sm">
                <MetricTile
                  label="Next 30d P50"
                  value={formatCurrency(kpis.next30dP50)}
                  explanation="Median of daily predictions summed for the next 30 days."
                />
                <MetricTile
                  label="Next 30d Range"
                  value={`${formatCurrency(kpis.next30dP10)} - ${formatCurrency(kpis.next30dP90)}`}
                  explanation="Low and high cases (P10 to P90) for total revenue over the next 30 days."
                />
                <MetricTile
                  label="Next 90d P50"
                  value={formatCurrency(kpis.next90dP50)}
                  explanation="Expected revenue over the next 90 days at the median scenario."
                />
                <MetricTile
                  label="Backtest MAPE"
                  value={`${(kpis.backtestMAPE || 0).toFixed(1)}%`}
                  explanation="Average percent error versus actuals in the latest backtest window."
                />
              </div>
            ) : (
              <div className="text-sm text-neutral-500">KPI data is still loading.</div>
            )}
            <p className="mt-4 text-xs text-neutral-500">
              Need a quick heuristic? Multiply the 30-day P50 by 3 to estimate a quarter, then sanity check against the 90-day P50 and pipeline changes.
            </p>
          </section>

          <section>
            <h3 className="text-sm sm:text-base font-semibold text-brand-navy mb-4">Seasonal Events & Holiday Effects</h3>
            {upcomingHolidays.length ? (
              <div className="space-y-3 text-sm text-neutral-600">
                {upcomingHolidays.map((holiday, idx) => (
                  <div
                    key={idx}
                    className="border border-amber-200 rounded-lg p-4 bg-amber-50/70"
                  >
                    <div className="flex flex-wrap items-center gap-2 justify-between">
                      <span className="font-semibold text-brand-navy">{holiday.name}</span>
                      <span className="text-xs text-neutral-500">
                        {holiday.start.toFormat('MMM d')} – {holiday.end.toFormat('MMM d')} ({holiday.days} days)
                      </span>
                    </div>
                    <p className="mt-2 text-sm">
                      The forecast automatically dampens demand during this period. Toggle <span className="font-semibold">Seasonally Adjusted</span> to strip out the expected dip and see the underlying baseline.
                    </p>
                    {holiday.name.toLowerCase().includes('thanksgiving') && (
                      <p className="mt-2 text-sm text-purple-700">
                        Thanksgiving week historically suppresses revenue; expect lighter booking volume until the following Monday.
                      </p>
                    )}
                  </div>
                ))}
              </div>
            ) : (
              <p className="text-sm text-neutral-500">No major holiday periods fall inside the current forecast window.</p>
            )}
          </section>

          <section>
            <h3 className="text-sm sm:text-base font-semibold text-brand-navy mb-4">Historical Context</h3>
            <div className="grid sm:grid-cols-2 gap-4 text-sm text-neutral-600">
              <div className="bg-white border border-neutral-200 rounded-lg p-4 shadow-sm">
                <p className="font-semibold text-brand-navy text-sm">Actual revenue captured</p>
                <p className="text-2xl font-bold text-green-600 mt-1">{formatCurrency(totalActuals)}</p>
                <p className="text-xs text-neutral-500 mt-2">
                  Sum of all historical revenue shown in the green area of the chart. Use this to benchmark whether the near-term forecast feels proportionally reasonable.
                </p>
              </div>
              <div className="bg-white border border-neutral-200 rounded-lg p-4 shadow-sm">
                <p className="font-semibold text-brand-navy text-sm">Model blend</p>
                <p className="text-2xl font-bold text-purple-600 mt-1">
                  {(forecastData?.blend_weight ? forecastData.blend_weight * 100 : 70).toFixed(0)}%
                </p>
                <p className="text-xs text-neutral-500 mt-2">
                  Share of the forecast driven by the LightGBM pipeline (remainder comes from Prophet). Higher means pipeline momentum is steering the outlook.
                </p>
              </div>
            </div>
          </section>

          <section>
            <h3 className="text-sm sm:text-base font-semibold text-brand-navy mb-4">Visual Breakdown</h3>
            <div className="bg-neutral-50 border border-neutral-200 rounded-xl p-4">
              <ResponsiveContainer width="100%" height={320}>
                <AreaChart data={chartData} margin={{ top: 64, right: 24, left: 0, bottom: 0 }}>
                  <CartesianGrid strokeDasharray="3 3" vertical={false} />
                  <XAxis
                    dataKey="date"
                    tick={{ fontSize: 12 }}
                    tickLine={false}
                    axisLine={false}
                    tickFormatter={formatDate}
                    interval="preserveStart"
                  />
                  <YAxis
                    tick={{ fontSize: 12 }}
                    tickLine={false}
                    axisLine={false}
                    tickFormatter={formatCurrency}
                  />
                  <Tooltip
                    formatter={(value) => formatCurrency(value)}
                    labelFormatter={formatDate}
                    contentStyle={{ fontSize: '12px' }}
                  />
                  <Legend />
                  {holidays.map((holiday, idx) => {
                    const holidayStart = holiday.start.toISODate();
                    const holidayEnd = holiday.end.toISODate();
                    const chartDates = chartData.map(d => d.date);
                    const minDate = chartDates[0];
                    const maxDate = chartDates[chartDates.length - 1];

                    if (holidayEnd < minDate || holidayStart > maxDate) {
                      return null;
                    }

                    return (
                      <ReferenceArea
                        key={idx}
                        x1={holidayStart}
                        x2={holidayEnd}
                        fill={holiday.color}
                        fillOpacity={0.3}
                        label={
                          <Label
                            value={holiday.name}
                            position="insideTop"
                            fill="#92400e"
                            fontSize={10}
                            offset={12}
                          />
                        }
                      />
                    );
                  })}
                  <Area
                    type="monotone"
                    dataKey="revenue"
                    name="Actual Revenue"
                    stroke="#16A34A"
                    fill="#16A34A"
                    fillOpacity={0.3}
                    connectNulls
                  />
                  <ReferenceLine
                    x={today.toISODate()}
                    stroke="#EF4444"
                    strokeDasharray="3 3"
                    label={{ value: 'Today', position: 'insideTop', offset: 12 }}
                  />
                  <Area
                    type="monotone"
                    dataKey="p90"
                    name="P90 (High)"
                    stroke="#0EA5E9"
                    fill="#0EA5E9"
                    fillOpacity={0.15}
                    connectNulls
                  />
                  <Area
                    type="monotone"
                    dataKey="p50"
                    name="P50 (Forecast)"
                    stroke="#7C3AED"
                    fill="#7C3AED"
                    fillOpacity={0.25}
                    connectNulls
                  />
                  <Area
                    type="monotone"
                    dataKey="p10"
                    name="P10 (Low)"
                    stroke="#F97316"
                    fill="#F97316"
                    fillOpacity={0.18}
                    connectNulls
                  />
                </AreaChart>
              </ResponsiveContainer>
            </div>
            <p className="mt-3 text-xs text-neutral-500">
              Tip: Hover over any point to see exact percentile values. Holiday shading is the same as the card view, just with more real estate so Thanksgiving and other dips are easier to inspect.
            </p>
          </section>
        </div>

        <div className="px-6 sm:px-10 py-4 border-t border-neutral-200 bg-neutral-50 flex flex-wrap items-center gap-3 justify-between">
          <div className="text-xs text-neutral-500">
            Data last refreshed {forecastData?.run_at ? DateTime.fromISO(forecastData.run_at).toFormat('MMM d, yyyy h:mm a') : 'recently'}.
          </div>
          <button
            onClick={onClose}
            className="px-4 py-2 text-xs font-semibold text-white bg-purple-600 rounded-lg hover:bg-purple-700 transition"
          >
            Close Overlay
          </button>
        </div>
      </div>
    </div>
  );
}

function MetricTile({ label, value, explanation }) {
  return (
    <div className="bg-white border border-neutral-200 rounded-lg p-4 shadow-sm">
      <div className="text-xs uppercase tracking-wide text-neutral-500 font-semibold">{label}</div>
      <div className="text-lg sm:text-xl font-bold text-brand-navy mt-1">{value}</div>
      <p className="text-xs text-neutral-500 mt-2">{explanation}</p>
    </div>
  );
}

