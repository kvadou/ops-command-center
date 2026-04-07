import React, { useState, useEffect, useMemo } from 'react';
import { DateTime } from 'luxon';
import { formatCurrency } from '../../utils/formatters';
import {
  XMarkIcon,
  CheckIcon,
  InformationCircleIcon,
  ArrowTrendingUpIcon,
} from '@heroicons/react/24/outline';

const CHANNELS = ['home', 'digital', 'clubs', 'schools'];

const CHANNEL_LABELS = {
  home: 'Home',
  digital: 'Digital',
  clubs: 'Clubs',
  schools: 'Schools',
};


function formatNumber(value) {
  if (value == null) return '-';
  return new Intl.NumberFormat('en-US').format(value);
}

export default function ForecastTargetsModal({ open, onClose, onSave }) {
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState(null);
  const [activeTab, setActiveTab] = useState(0);
  const [quarterlyData, setQuarterlyData] = useState(null);
  const [historicalAverages, setHistoricalAverages] = useState(null);

  // Local form state for each quarter
  const [formData, setFormData] = useState({});

  // Fetch quarterly targets data
  useEffect(() => {
    if (!open) return;

    const fetchData = async () => {
      setLoading(true);
      setError(null);

      try {
        const response = await fetch('/api/forecast/targets/quarterly', {
          credentials: 'include',
        });

        if (!response.ok) throw new Error('Failed to fetch quarterly targets');

        const data = await response.json();
        setQuarterlyData(data.quarters);
        setHistoricalAverages(data.historical_averages);

        // Initialize form data from existing targets
        const initialForm = {};
        for (const q of data.quarters) {
          const key = `${q.year}-${q.quarter}`;
          initialForm[key] = {
            revenue: q.target?.revenue || '',
            margin_percent: q.target?.margin_percent || 50,
            channel_mix: q.target?.channel_mix || data.historical_averages?.channel_mix || {
              home: 45,
              digital: 35,
              clubs: 15,
              schools: 5,
            },
          };
        }
        setFormData(initialForm);
      } catch (err) {
        setError(err.message);
      } finally {
        setLoading(false);
      }
    };

    fetchData();
  }, [open]);

  // Get current quarter data
  const currentQuarter = quarterlyData?.[activeTab];
  const currentKey = currentQuarter ? `${currentQuarter.year}-${currentQuarter.quarter}` : null;
  const currentForm = currentKey ? formData[currentKey] : null;

  // Calculate derived metrics when revenue changes
  const derivedMetrics = useMemo(() => {
    if (!currentForm?.revenue || !historicalAverages) return null;

    const revenue = parseFloat(currentForm.revenue);
    if (isNaN(revenue) || revenue <= 0) return null;

    const marginPercent = currentForm.margin_percent || 50;
    const avgRevenuePerLesson = historicalAverages.avg_revenue_per_lesson || 95;
    const lessonsTotal = Math.round(revenue / avgRevenuePerLesson);
    const weeksInQuarter = 13;
    const daysInQuarter = 91;

    return {
      profit: Math.round(revenue * (marginPercent / 100)),
      tutor_pay: Math.round(revenue * (1 - marginPercent / 100)),
      lessons_total: lessonsTotal,
      lessons_weekly: Math.round(lessonsTotal / weeksInQuarter),
      lessons_daily: Math.round(lessonsTotal / daysInQuarter),
      avg_revenue_per_lesson: avgRevenuePerLesson,
      channel_breakdown: CHANNELS.reduce((acc, ch) => {
        const pct = currentForm.channel_mix?.[ch] || 0;
        acc[ch] = Math.round(revenue * (pct / 100));
        return acc;
      }, {}),
    };
  }, [currentForm, historicalAverages]);

  // Update form field
  const updateField = (field, value) => {
    if (!currentKey) return;
    setFormData(prev => ({
      ...prev,
      [currentKey]: {
        ...prev[currentKey],
        [field]: value,
      },
    }));
  };

  // Update channel mix
  const updateChannelMix = (channel, value) => {
    if (!currentKey) return;
    const numValue = parseInt(value) || 0;
    setFormData(prev => ({
      ...prev,
      [currentKey]: {
        ...prev[currentKey],
        channel_mix: {
          ...prev[currentKey].channel_mix,
          [channel]: numValue,
        },
      },
    }));
  };

  // Normalize channel mix to 100%
  const normalizeChannelMix = () => {
    if (!currentForm?.channel_mix) return;
    const total = Object.values(currentForm.channel_mix).reduce((a, b) => a + b, 0);
    if (total === 0 || total === 100) return;

    const normalized = {};
    for (const [ch, val] of Object.entries(currentForm.channel_mix)) {
      normalized[ch] = Math.round((val / total) * 100);
    }
    updateField('channel_mix', normalized);
  };

  // Save current quarter
  const handleSave = async () => {
    if (!currentQuarter || !currentForm?.revenue) {
      setError('Please enter a revenue target');
      return;
    }

    setSaving(true);
    setError(null);

    try {
      const response = await fetch('/api/forecast/targets/quarterly', {
        method: 'POST',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          year: currentQuarter.year,
          quarter: currentQuarter.quarter,
          revenue: parseFloat(currentForm.revenue),
          margin_percent: currentForm.margin_percent,
          channel_mix: currentForm.channel_mix,
        }),
      });

      if (!response.ok) throw new Error('Failed to save target');

      // Refresh data and update form state
      const refreshResponse = await fetch('/api/forecast/targets/quarterly', {
        credentials: 'include',
      });
      const data = await refreshResponse.json();
      setQuarterlyData(data.quarters);

      // Also update formData from refreshed data so it shows saved values
      const updatedForm = { ...formData };
      for (const q of data.quarters) {
        const key = `${q.year}-${q.quarter}`;
        if (q.target) {
          updatedForm[key] = {
            revenue: q.target.revenue || '',
            margin_percent: q.target.margin_percent || 50,
            channel_mix: q.target.channel_mix || formData[key]?.channel_mix || {},
          };
        }
      }
      setFormData(updatedForm);

      if (onSave) onSave();
    } catch (err) {
      setError(err.message);
    } finally {
      setSaving(false);
    }
  };

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-50">
      <div className="absolute inset-0 bg-black/30" onClick={onClose} />
      <div className="absolute inset-0 flex items-center justify-center p-4">
        <div className="w-full max-w-4xl bg-white rounded-xl shadow-xl border border-neutral-200 overflow-hidden max-h-[90vh] flex flex-col">
          {/* Header */}
          <div className="flex items-center justify-between px-6 py-4 border-b border-neutral-100">
            <div>
              <h3 className="text-lg font-semibold text-brand-navy">Configure Quarterly Targets</h3>
              <p className="text-sm text-neutral-500 mt-0.5">Set revenue goals and let the system calculate derived metrics</p>
            </div>
            <button onClick={onClose} className="text-neutral-500 hover:text-neutral-700 p-1">
              <XMarkIcon className="h-5 w-5" />
            </button>
          </div>

          {loading ? (
            <div className="flex-1 flex items-center justify-center p-12">
              <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-brand-purple"></div>
            </div>
          ) : error ? (
            <div className="flex-1 p-6">
              <div className="bg-red-50 border border-red-200 rounded-lg p-4 text-red-700">
                {error}
              </div>
            </div>
          ) : (
            <>
              {/* Quarter Tabs */}
              <div className="border-b border-neutral-200">
                <nav className="flex px-6">
                  {quarterlyData?.map((q, idx) => (
                    <button
                      key={`${q.year}-${q.quarter}`}
                      onClick={() => setActiveTab(idx)}
                      className={`px-4 py-3 text-sm font-medium border-b-2 transition-colors ${
                        activeTab === idx
                          ? 'border-brand-purple text-brand-purple'
                          : 'border-transparent text-neutral-500 hover:text-neutral-700 hover:border-neutral-300'
                      }`}
                    >
                      <div className="text-center">
                        <div>Q{q.quarter} {q.year}</div>
                        <div className="text-xs text-neutral-400">Q{q.fiscal_quarter} FY{q.fiscal_year.toString().slice(-2)}</div>
                        {q.is_current && (
                          <span className="text-xs text-brand-purple">(current)</span>
                        )}
                      </div>
                    </button>
                  ))}
                </nav>
              </div>

              {/* Content */}
              <div className="flex-1 overflow-auto p-6">
                {currentQuarter && (
                  <div className="space-y-6">
                    {/* Date Range & Prior Year */}
                    <div className="flex items-center justify-between text-sm">
                      <span className="text-neutral-500">
                        {DateTime.fromISO(currentQuarter.start_date).toFormat('MMM d')} - {DateTime.fromISO(currentQuarter.end_date).toFormat('MMM d, yyyy')}
                      </span>
                      {currentQuarter.prior_year_actuals?.revenue > 0 && (
                        <div className="flex items-center gap-2 text-neutral-600">
                          <InformationCircleIcon className="h-4 w-4 text-neutral-400" />
                          <span>
                            Q{currentQuarter.quarter} {currentQuarter.year - 1}: {formatCurrency(currentQuarter.prior_year_actuals.revenue)} revenue ({formatNumber(currentQuarter.prior_year_actuals.lessons)} lessons)
                          </span>
                        </div>
                      )}
                    </div>

                    {/* Primary Input */}
                    <div className="bg-gradient-to-r from-brand-purple/5 to-brand-cyan/5 border border-brand-purple/20 rounded-lg p-5">
                      <div className="grid grid-cols-2 gap-6">
                        <div>
                          <label className="block text-sm font-medium text-neutral-700 mb-2">
                            Revenue Target *
                          </label>
                          <div className="relative">
                            <span className="absolute left-3 top-2.5 text-neutral-500">$</span>
                            <input
                              type="text"
                              value={currentForm?.revenue ? Number(currentForm.revenue).toLocaleString() : ''}
                              onChange={(e) => {
                                // Remove commas and non-numeric chars, keep the raw number
                                const rawValue = e.target.value.replace(/[^0-9]/g, '');
                                updateField('revenue', rawValue);
                              }}
                              className="w-full pl-8 pr-4 py-2 border border-neutral-200 rounded-lg text-lg font-semibold focus:ring-2 focus:ring-brand-purple/20 focus:border-brand-purple"
                              placeholder="500,000"
                            />
                          </div>
                        </div>
                        <div>
                          <label className="block text-sm font-medium text-neutral-700 mb-2">
                            Profit Margin %
                          </label>
                          <div className="flex items-center gap-3">
                            <input
                              type="number"
                              value={currentForm?.margin_percent || 50}
                              onChange={(e) => updateField('margin_percent', parseInt(e.target.value) || 50)}
                              className="w-24 px-3 py-2 border border-neutral-200 rounded-lg text-lg font-semibold focus:ring-2 focus:ring-brand-purple/20 focus:border-brand-purple"
                              min="0"
                              max="100"
                            />
                            <span className="text-neutral-500">%</span>
                            {derivedMetrics && (
                              <span className="text-sm text-green-600 font-medium">
                                = {formatCurrency(derivedMetrics.profit)} profit
                              </span>
                            )}
                          </div>
                        </div>
                      </div>
                    </div>

                    {/* Derived Metrics */}
                    {derivedMetrics && (
                      <div className="bg-neutral-50 border border-neutral-200 rounded-lg p-5">
                        <div className="flex items-center gap-2 mb-4">
                          <ArrowTrendingUpIcon className="h-5 w-5 text-brand-purple" />
                          <span className="text-sm font-medium text-neutral-700">Auto-Calculated Metrics</span>
                          <span className="text-xs text-neutral-400">(based on ${historicalAverages?.avg_revenue_per_lesson}/lesson avg)</span>
                        </div>
                        <div className="grid grid-cols-4 gap-4">
                          <div className="bg-white rounded-lg p-3 border border-neutral-100">
                            <div className="text-xs text-neutral-500 mb-1">Total Lessons</div>
                            <div className="text-xl font-bold text-brand-navy">{formatNumber(derivedMetrics.lessons_total)}</div>
                          </div>
                          <div className="bg-white rounded-lg p-3 border border-neutral-100">
                            <div className="text-xs text-neutral-500 mb-1">Weekly</div>
                            <div className="text-xl font-bold text-brand-navy">{formatNumber(derivedMetrics.lessons_weekly)}</div>
                            <div className="text-xs text-neutral-400">lessons/week</div>
                          </div>
                          <div className="bg-white rounded-lg p-3 border border-neutral-100">
                            <div className="text-xs text-neutral-500 mb-1">Daily</div>
                            <div className="text-xl font-bold text-brand-navy">{formatNumber(derivedMetrics.lessons_daily)}</div>
                            <div className="text-xs text-neutral-400">lessons/day</div>
                          </div>
                          <div className="bg-white rounded-lg p-3 border border-neutral-100">
                            <div className="text-xs text-neutral-500 mb-1">Tutor Pay Budget</div>
                            <div className="text-xl font-bold text-amber-600">{formatCurrency(derivedMetrics.tutor_pay)}</div>
                          </div>
                        </div>
                      </div>
                    )}

                    {/* Channel Breakdown */}
                    {currentForm && (
                      <div className="border border-neutral-200 rounded-lg p-5">
                        <div className="flex items-center justify-between mb-4">
                          <span className="text-sm font-medium text-neutral-700">Channel Revenue Mix</span>
                          <button
                            onClick={normalizeChannelMix}
                            className="text-xs text-brand-purple hover:underline"
                          >
                            Normalize to 100%
                          </button>
                        </div>
                        <div className="grid grid-cols-4 gap-4">
                          {CHANNELS.map((ch) => (
                            <div key={ch} className="space-y-2">
                              <div className="flex items-center justify-between">
                                <label className="text-sm text-neutral-600">{CHANNEL_LABELS[ch]}</label>
                                <div className="flex items-center gap-1">
                                  <input
                                    type="number"
                                    value={currentForm.channel_mix?.[ch] || 0}
                                    onChange={(e) => updateChannelMix(ch, e.target.value)}
                                    className="w-14 px-2 py-1 text-sm border border-neutral-200 rounded text-center"
                                    min="0"
                                    max="100"
                                  />
                                  <span className="text-sm text-neutral-400">%</span>
                                </div>
                              </div>
                              {derivedMetrics && (
                                <div className="text-sm text-neutral-500">
                                  {formatCurrency(derivedMetrics.channel_breakdown?.[ch])}
                                </div>
                              )}
                            </div>
                          ))}
                        </div>
                        <div className="mt-3 text-xs text-neutral-400 text-right">
                          Total: {Object.values(currentForm.channel_mix || {}).reduce((a, b) => a + b, 0)}%
                        </div>
                      </div>
                    )}

                    {/* Existing target indicator */}
                    {currentQuarter.target && (
                      <div className="flex items-center gap-2 text-sm text-green-600">
                        <CheckIcon className="h-4 w-4" />
                        Target already set for this quarter - editing will update it
                      </div>
                    )}
                  </div>
                )}
              </div>

              {/* Footer */}
              <div className="flex items-center justify-between px-6 py-4 border-t border-neutral-100 bg-neutral-50">
                <div className="text-sm text-neutral-500">
                  {historicalAverages && (
                    <span>Historical avg: {formatCurrency(historicalAverages.avg_revenue_per_lesson)}/lesson</span>
                  )}
                </div>
                <div className="flex items-center gap-3">
                  <button
                    onClick={onClose}
                    className="px-4 py-2 text-sm border border-neutral-200 text-neutral-700 rounded-md hover:bg-neutral-100"
                  >
                    Cancel
                  </button>
                  <button
                    onClick={handleSave}
                    disabled={saving || !currentForm?.revenue}
                    className="flex items-center gap-2 px-4 py-2 text-sm bg-brand-purple text-white rounded-md hover:bg-purple-700 disabled:opacity-50"
                  >
                    {saving ? (
                      <>
                        <div className="animate-spin rounded-full h-4 w-4 border-2 border-white/30 border-t-white"></div>
                        Saving...
                      </>
                    ) : (
                      <>
                        <CheckIcon className="h-4 w-4" />
                        Save Target
                      </>
                    )}
                  </button>
                </div>
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
