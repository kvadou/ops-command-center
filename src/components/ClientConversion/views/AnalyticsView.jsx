import React, { useEffect, useState } from 'react';
import { BarChart, Bar, LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer, Cell, PieChart, Pie, ComposedChart } from 'recharts';
import { UserGroupIcon, ClockIcon, CheckCircleIcon, CurrencyDollarIcon, FunnelIcon, ChartBarSquareIcon, XMarkIcon, ArrowPathIcon, MagnifyingGlassIcon, ChevronUpDownIcon, ChevronUpIcon, ChevronDownIcon } from '@heroicons/react/24/outline';
import { useResizableColumns, ResizeHandle } from '../useResizableColumns';

/**
 * AnalyticsView - Comprehensive analytics dashboard
 *
 * Displays analytics charts and metrics for client conversion tracking.
 */
export default function AnalyticsView({
  analytics,
  clients = [],
  analyticsTimePeriod = 'weekly',
  setAnalyticsTimePeriod,
  // Cohort retention props
  cohortData,
  cohortLoading,
  cohortFilters,
  onCohortFilterChange,
  onCohortCellClick,
  cohortDetailModal,
  onCloseCohortDetailModal,
  fetchCohortData,
  // Acquired modal props
  onAcquiredClick,
  acquiredModal,
  updateAcquiredModal,
  closeAcquiredModal,
}) {
  // Resizable column hooks for all tables
  const { columnWidths: leadTypeWidths, handleResizeStart: leadTypeResize } = useResizableColumns('columnWidths_cctAnalytics_leadType');
  const { columnWidths: marketWidths, handleResizeStart: marketResize } = useResizableColumns('columnWidths_cctAnalytics_market');
  const { columnWidths: weeklyWidths, handleResizeStart: weeklyResize } = useResizableColumns('columnWidths_cctAnalytics_weekly');
  const { columnWidths: cohortWidths, handleResizeStart: cohortResize } = useResizableColumns('columnWidths_cctAnalytics_cohort');

  // Load cohort data on mount
  useEffect(() => {
    if (fetchCohortData && !cohortData && !cohortLoading) {
      fetchCohortData();
    }
  }, [fetchCohortData, cohortData, cohortLoading]);

  // Format cohort period for display (e.g., "2025-01" -> "Jan '25" or "2025-W01" -> "W1 '25")
  const formatCohortPeriod = (period) => {
    if (!period) return period;

    // Check for weekly format "2025-W01"
    const weeklyMatch = period.match(/(\d{4})-W(\d{1,2})/);
    if (weeklyMatch) {
      const [, year, week] = weeklyMatch;
      return `W${parseInt(week)} '${year.slice(2)}`;
    }

    // Monthly format "2025-01"
    const monthlyMatch = period.match(/(\d{4})-(\d{2})/);
    if (monthlyMatch) {
      const [, year, month] = monthlyMatch;
      const monthNames = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
      return `${monthNames[parseInt(month) - 1]} '${year.slice(2)}`;
    }

    return period;
  };
  // Filter clients based on selected time period
  const getFilteredClients = () => {
    const now = new Date();
    let startDate;

    switch (analyticsTimePeriod) {
      case 'daily':
        startDate = new Date(now);
        startDate.setDate(startDate.getDate() - 1);
        break;
      case 'weekly':
        startDate = new Date(now);
        startDate.setDate(startDate.getDate() - 7);
        break;
      case 'monthly':
        startDate = new Date(now);
        startDate.setMonth(startDate.getMonth() - 1);
        break;
      case 'annual':
        startDate = new Date(now.getFullYear(), 0, 1); // Start of current year
        break;
      default:
        startDate = new Date(now);
        startDate.setDate(startDate.getDate() - 7);
    }

    return clients.filter(client => {
      const clientDate = new Date(client.created_at || client.date_registration_complete);
      return clientDate >= startDate;
    });
  };

  const filteredClients = getFilteredClients();

  return (
        <div className="space-y-6">
          {/* Header with Time Period Filter */}
          <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
            <h2 className="text-lg font-semibold text-neutral-900">Conversion Analytics</h2>
            <div className="flex items-center bg-neutral-100 rounded-lg p-0.5">
              {['daily', 'weekly', 'monthly', 'annual'].map((period) => (
                <button
                  key={period}
                  onClick={() => setAnalyticsTimePeriod(period)}
                  className={`px-3 py-1.5 rounded-md text-sm font-medium transition-colors ${
                    analyticsTimePeriod === period
                      ? 'bg-white text-[#6A469D] shadow-sm'
                      : 'text-neutral-500 hover:text-neutral-700'
                  }`}
                >
                  {period.charAt(0).toUpperCase() + period.slice(1)}
                </button>
              ))}
            </div>
          </div>

          {/* Key Funnel Metrics - KPI Cards */}
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-5 gap-4">
            {/* Calculate key metrics from analytics */}
            {(() => {
              const totalClients = filteredClients.length;
              const registeredClients = filteredClients.filter(c => c.date_registration_complete || c.created_at).length;
              const pairedClients = filteredClients.filter(c => c.date_tutor_client_paired || c.assigned_tutor_name).length;
              const trialClients = filteredClients.filter(c => c.date_trial_first_lesson).length;
              const followUpClients = filteredClients.filter(c => c.trial_follow_up_completed).length;
              const firstPaidClients = filteredClients.filter(c => c.first_paid_lesson_completed).length;
              
              const registrationRate = totalClients > 0 ? ((registeredClients / totalClients) * 100).toFixed(1) : 0;
              const pairingRate = registeredClients > 0 ? ((pairedClients / registeredClients) * 100).toFixed(1) : 0;
              const trialRate = pairedClients > 0 ? ((trialClients / pairedClients) * 100).toFixed(1) : 0;
              const followUpRate = trialClients > 0 ? ((followUpClients / trialClients) * 100).toFixed(1) : 0;
              const conversionRate = trialClients > 0 ? ((firstPaidClients / trialClients) * 100).toFixed(1) : 0;
              
              return (
                <>
                  <div className="bg-white rounded-xl border border-neutral-200 shadow-sm p-5 border-l-4 border-[#50C8DF] hover:shadow-lg transition-shadow">
                    <div className="flex items-center justify-between mb-2">
                      <div className="p-2 bg-[#E8FBFF] rounded-lg">
                        <UserGroupIcon className="h-5 w-5 text-[#3BA8BD]" />
                      </div>
                      <span className="text-xs font-semibold text-[#3BA8BD] bg-[#E8FBFF] px-2 py-1 rounded">{registrationRate}%</span>
                    </div>
                    <p className="text-xs font-medium text-neutral-500 uppercase tracking-wide">Registered</p>
                    <p className="text-2xl font-bold text-neutral-900 mt-1">{registeredClients}</p>
                    <p className="text-xs text-neutral-500 mt-1">of {totalClients} total</p>
                  </div>
                  
                  <div className="bg-white rounded-xl border border-neutral-200 shadow-sm p-5 border-l-4 border-[#34B256] hover:shadow-lg transition-shadow">
                    <div className="flex items-center justify-between mb-2">
                      <div className="p-2 bg-[#E8F8ED] rounded-lg">
                        <UserGroupIcon className="h-5 w-5 text-[#2A9147]" />
                      </div>
                      <span className="text-xs font-semibold text-[#2A9147] bg-[#E8F8ED] px-2 py-1 rounded">{pairingRate}%</span>
                    </div>
                    <p className="text-xs font-medium text-neutral-500 uppercase tracking-wide">Tutor Paired</p>
                    <p className="text-2xl font-bold text-neutral-900 mt-1">{pairedClients}</p>
                    <p className="text-xs text-neutral-500 mt-1">of {registeredClients} registered</p>
                  </div>
                  
                  <div className="bg-white rounded-xl border border-neutral-200 shadow-sm p-5 border-l-4 border-[#FACC29] hover:shadow-lg transition-shadow">
                    <div className="flex items-center justify-between mb-2">
                      <div className="p-2 bg-[#FEF4E8] rounded-lg">
                        <ClockIcon className="h-5 w-5 text-[#C77A26]" />
                      </div>
                      <span className="text-xs font-semibold text-[#C77A26] bg-[#FEF4E8] px-2 py-1 rounded">{trialRate}%</span>
                    </div>
                    <p className="text-xs font-medium text-neutral-500 uppercase tracking-wide">Trial Completed</p>
                    <p className="text-2xl font-bold text-neutral-900 mt-1">{trialClients}</p>
                    <p className="text-xs text-neutral-500 mt-1">of {pairedClients} paired</p>
                  </div>
                  
                  <div className="bg-white rounded-xl border border-neutral-200 shadow-sm p-5 border-l-4 border-[#F79A30] hover:shadow-lg transition-shadow">
                    <div className="flex items-center justify-between mb-2">
                      <div className="p-2 bg-[#FEF4E8] rounded-lg">
                        <CheckCircleIcon className="h-5 w-5 text-[#C77A26]" />
                      </div>
                      <span className="text-xs font-semibold text-[#C77A26] bg-[#FEF4E8] px-2 py-1 rounded">{followUpRate}%</span>
                    </div>
                    <p className="text-xs font-medium text-neutral-500 uppercase tracking-wide">Follow-up Done</p>
                    <p className="text-2xl font-bold text-neutral-900 mt-1">{followUpClients}</p>
                    <p className="text-xs text-neutral-500 mt-1">of {trialClients} trials</p>
                  </div>
                  
                  <div className="bg-white rounded-xl border border-neutral-200 shadow-sm p-5 border-l-4 border-primary-500 hover:shadow-lg transition-shadow">
                    <div className="flex items-center justify-between mb-2">
                      <div className="p-2 bg-primary-50 rounded-lg">
                        <CurrencyDollarIcon className="h-5 w-5 text-primary-500" />
                      </div>
                      <span className="text-xs font-semibold text-primary-500 bg-primary-50 px-2 py-1 rounded">{conversionRate}%</span>
                    </div>
                    <p className="text-xs font-medium text-neutral-500 uppercase tracking-wide">First Paid</p>
                    <p className="text-2xl font-bold text-neutral-900 mt-1">{firstPaidClients}</p>
                    <p className="text-xs text-neutral-500 mt-1">of {trialClients} trials</p>
                  </div>
                </>
              );
            })()}
          </div>

          {/* Conversion Funnel Visualization */}
          <div className="bg-white rounded-lg shadow-lg p-6 border border-neutral-200">
            <div className="flex items-center justify-between mb-6">
              <div>
                <h3 className="text-xl font-bold text-neutral-900">Conversion Funnel</h3>
                <p className="text-sm text-neutral-600 mt-1">Visual representation of client progression through onboarding</p>
              </div>
              <FunnelIcon className="h-8 w-8 text-primary-500" />
            </div>
            {(() => {
              const totalClients = filteredClients.length;
              const registeredClients = filteredClients.filter(c => c.date_registration_complete || c.created_at).length;
              const pairedClients = filteredClients.filter(c => c.date_tutor_client_paired || c.assigned_tutor_name).length;
              const trialClients = filteredClients.filter(c => c.date_trial_first_lesson).length;
              const followUpClients = filteredClients.filter(c => c.trial_follow_up_completed).length;
              const firstPaidClients = filteredClients.filter(c => c.first_paid_lesson_completed).length;

              const steps = [
                { label: 'Total Prospects', count: totalClients, color: 'bg-neutral-500', borderColor: 'border-neutral-500', icon: UserGroupIcon },
                { label: 'Registration Complete', count: registeredClients, color: 'bg-[#50C8DF]', borderColor: 'border-[#50C8DF]', icon: UserGroupIcon },
                { label: 'Tutor Paired', count: pairedClients, color: 'bg-[#34B256]', borderColor: 'border-[#34B256]', icon: UserGroupIcon },
                { label: 'Trial Completed', count: trialClients, color: 'bg-[#FACC29]', borderColor: 'border-[#FACC29]', icon: ClockIcon },
                { label: 'Follow-up Completed', count: followUpClients, color: 'bg-[#F79A30]', borderColor: 'border-[#F79A30]', icon: CheckCircleIcon },
                { label: 'First Paid Lesson', count: firstPaidClients, color: 'bg-primary-500', borderColor: 'border-primary-500', icon: CurrencyDollarIcon }
              ];
              
              const maxCount = Math.max(...steps.map(s => s.count), 1);
              
              return (
                <div className="space-y-5">
                  {steps.map((step, index) => {
                    const widthPercent = maxCount > 0 ? (step.count / maxCount) * 100 : 0;
                    const dropoff = index > 0 ? steps[index - 1].count - step.count : 0;
                    const dropoffPercent = index > 0 && steps[index - 1].count > 0 
                      ? ((dropoff / steps[index - 1].count) * 100).toFixed(1) 
                      : 0;
                    const conversionPercent = index > 0 && steps[index - 1].count > 0
                      ? ((step.count / steps[index - 1].count) * 100).toFixed(1)
                      : 100;
                    const StepIcon = step.icon;
                    
                    return (
                      <div key={index} className="space-y-2">
                        <div className="flex items-center justify-between">
                          <div className="flex items-center space-x-4 flex-1">
                            <div className={`p-2 rounded-lg border-2 ${step.borderColor} ${
                              step.color === 'bg-neutral-500' ? 'bg-neutral-100' :
                              step.color === 'bg-[#50C8DF]' ? 'bg-[#E8FBFF]' :
                              step.color === 'bg-[#34B256]' ? 'bg-[#E8F8ED]' :
                              step.color === 'bg-[#FACC29]' ? 'bg-[#FEF4E8]' :
                              step.color === 'bg-[#F79A30]' ? 'bg-[#FEF4E8]' :
                              'bg-primary-50'
                            }`}>
                              <StepIcon className={`h-5 w-5 ${
                                step.color === 'bg-neutral-500' ? 'text-neutral-600' :
                                step.color === 'bg-[#50C8DF]' ? 'text-[#3BA8BD]' :
                                step.color === 'bg-[#34B256]' ? 'text-[#2A9147]' :
                                step.color === 'bg-[#FACC29]' ? 'text-[#C77A26]' :
                                step.color === 'bg-[#F79A30]' ? 'text-[#C77A26]' :
                                'text-primary-500'
                              }`} />
                            </div>
                            <div className="flex-1">
                              <div className="flex items-center space-x-3">
                                <span className="text-sm font-semibold text-neutral-900">{step.label}</span>
                                <span className="text-lg font-bold text-neutral-900">{step.count}</span>
                                {index > 0 && (
                                  <span className={`text-xs font-semibold px-2 py-0.5 rounded ${
                                    conversionPercent >= 70 ? 'bg-[#E8F8ED] text-[#2A9147]' :
                                    conversionPercent >= 50 ? 'bg-[#FEF4E8] text-[#C77A26]' :
                                    'bg-[#FCE8F0] text-[#AE255B]'
                                  }`}>
                                    {conversionPercent}% conversion
                                  </span>
                                )}
                              </div>
                              {index > 0 && dropoff > 0 && (
                                <div className="mt-1">
                                  <span className="text-xs text-[#AE255B] font-medium">
                                    ↓ {dropoff} dropped ({dropoffPercent}% dropoff)
                                  </span>
                                </div>
                              )}
                            </div>
                          </div>
                        </div>
                        <div className="w-full bg-neutral-100 rounded-full h-8 relative overflow-hidden shadow-inner">
                          <div
                            className={`${step.color} h-8 rounded-full transition-all duration-500 flex items-center justify-between px-4 shadow-sm`}
                            style={{ width: `${Math.max(widthPercent, 2)}%` }}
                          >
                            <span className="text-xs font-bold text-white">{step.count}</span>
                            {step.count > 0 && widthPercent > 15 && (
                              <span className="text-xs font-medium text-white opacity-90">
                                {widthPercent.toFixed(0)}% of max
                              </span>
                            )}
                          </div>
                        </div>
                      </div>
                    );
                  })}
                </div>
              );
            })()}
          </div>

          {/* Charts Section */}
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            {/* Weekly Trends Chart */}
            <div className="bg-white rounded-lg shadow-lg p-6 border border-neutral-200">
              <h3 className="text-lg font-semibold text-neutral-900 mb-4">
                {analyticsTimePeriod === 'daily' ? 'Daily' : 
                 analyticsTimePeriod === 'weekly' ? 'Weekly' :
                 analyticsTimePeriod === 'monthly' ? 'Monthly' :
                 'Annual'} Performance Trends
              </h3>
              {(() => {
                // Prepare chart data based on time period
                let chartData = [];
                
                if (analyticsTimePeriod === 'weekly' && analytics.weeklyStats.length > 0) {
                  chartData = analytics.weeklyStats.slice(0, 16).map(week => ({
                    name: new Date(week.week_start).toLocaleDateString('en-US', { month: 'short', day: 'numeric' }),
                    paired: week.clients_paired || 0,
                    trials: week.first_lessons_trials || 0,
                    conversions: week.conversions || 0,
                    followUps: week.follow_ups_completed || 0,
                    conversionRate: week.conversion_rate || 0,
                  }));
                } else if (analyticsTimePeriod === 'annual' && analytics.yearOverYear.length > 0) {
                  chartData = analytics.yearOverYear.map(year => ({
                    name: year.year.toString(),
                    trials: year.total_trials || 0,
                    conversions: year.converted_clients || 0,
                    bundles: year.bundle_purchases || 0,
                    conversionRate: year.conversion_percentage || 0,
                  }));
                } else {
                  // For daily/monthly, use weekly data as fallback for now
                  chartData = analytics.weeklyStats.slice(0, 12).map(week => ({
                    name: new Date(week.week_start).toLocaleDateString('en-US', { month: 'short', day: 'numeric' }),
                    paired: week.clients_paired || 0,
                    trials: week.first_lessons_trials || 0,
                    conversions: week.conversions || 0,
                  }));
                }
                
                if (chartData.length === 0) {
                  return <p className="text-neutral-500 text-sm text-center py-8">No data available for this time period</p>;
                }
                
                return (
                  <ResponsiveContainer width="100%" height={300}>
                    <ComposedChart data={chartData} margin={{ top: 5, right: 20, left: 0, bottom: 60 }}>
                      <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#f0f0f0" />
                      <XAxis 
                        dataKey="name" 
                        tick={{ fontSize: 11, fill: '#6b7280' }}
                        tickLine={false}
                        axisLine={false}
                        angle={-45}
                        textAnchor="end"
                        height={60}
                      />
                      <YAxis 
                        yAxisId="left"
                        tick={{ fontSize: 11, fill: '#6b7280' }}
                        tickLine={false}
                        axisLine={false}
                      />
                      <YAxis 
                        yAxisId="right"
                        orientation="right"
                        tick={{ fontSize: 11, fill: '#6b7280' }}
                        tickLine={false}
                        axisLine={false}
                        tickFormatter={(value) => `${value}%`}
                      />
                      <Tooltip 
                        contentStyle={{ 
                          backgroundColor: 'white', 
                          border: '1px solid #e5e7eb',
                          borderRadius: '8px',
                          padding: '8px'
                        }}
                        formatter={(value, name) => {
                          if (name === 'conversionRate') return [`${value}%`, 'Conversion Rate'];
                          return [value, name === 'paired' ? 'Paired' : name === 'trials' ? 'Trials' : name === 'conversions' ? 'Conversions' : name === 'followUps' ? 'Follow-ups' : name === 'bundles' ? 'Bundles' : name];
                        }}
                      />
                      <Legend 
                        wrapperStyle={{ paddingTop: '20px' }}
                        formatter={(value) => {
                          if (value === 'paired') return 'Paired';
                          if (value === 'trials') return 'Trials';
                          if (value === 'conversions') return 'Conversions';
                          if (value === 'followUps') return 'Follow-ups';
                          if (value === 'bundles') return 'Bundles';
                          if (value === 'conversionRate') return 'Conversion Rate';
                          return value;
                        }}
                      />
                      {analyticsTimePeriod === 'annual' ? (
                        <>
                          <Bar yAxisId="left" dataKey="trials" fill="#3b82f6" name="trials" radius={[4, 4, 0, 0]} />
                          <Bar yAxisId="left" dataKey="conversions" fill="#10b981" name="conversions" radius={[4, 4, 0, 0]} />
                          <Bar yAxisId="left" dataKey="bundles" fill="#8b5cf6" name="bundles" radius={[4, 4, 0, 0]} />
                          <Line yAxisId="right" type="monotone" dataKey="conversionRate" stroke="#f59e0b" strokeWidth={3} dot={{ r: 4 }} name="conversionRate" />
                        </>
                      ) : (
                        <>
                          <Bar yAxisId="left" dataKey="paired" fill="#3b82f6" name="paired" radius={[4, 4, 0, 0]} />
                          <Bar yAxisId="left" dataKey="trials" fill="#f59e0b" name="trials" radius={[4, 4, 0, 0]} />
                          <Bar yAxisId="left" dataKey="conversions" fill="#10b981" name="conversions" radius={[4, 4, 0, 0]} />
                          {analyticsTimePeriod === 'weekly' && (
                            <>
                              <Bar yAxisId="left" dataKey="followUps" fill="#f97316" name="followUps" radius={[4, 4, 0, 0]} />
                              <Line yAxisId="right" type="monotone" dataKey="conversionRate" stroke="#8b5cf6" strokeWidth={2} dot={{ r: 3 }} name="conversionRate" />
                            </>
                          )}
                        </>
                      )}
                    </ComposedChart>
                  </ResponsiveContainer>
                );
              })()}
            </div>

            {/* Conversion Rates by Market Chart */}
            <div className="bg-white rounded-lg shadow-lg p-6 border border-neutral-200">
              <h3 className="text-lg font-semibold text-neutral-900 mb-4">Conversion Rates by Market</h3>
              {(() => {
                const chartData = analytics.market.map(item => ({
                  name: item.market || 'N/A',
                  conversionRate: item.conversion_percentage || 0,
                  total: item.total_clients || 0,
                  converted: item.converted_clients || 0,
                })).sort((a, b) => b.conversionRate - a.conversionRate);
                
                if (chartData.length === 0) {
                  return <p className="text-neutral-500 text-sm text-center py-8">No market data available</p>;
                }
                
                return (
                  <ResponsiveContainer width="100%" height={300}>
                    <BarChart data={chartData} margin={{ top: 5, right: 20, left: 0, bottom: 5 }}>
                      <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#f0f0f0" />
                      <XAxis 
                        dataKey="name" 
                        tick={{ fontSize: 11, fill: '#6b7280' }}
                        tickLine={false}
                        axisLine={false}
                      />
                      <YAxis 
                        tick={{ fontSize: 11, fill: '#6b7280' }}
                        tickLine={false}
                        axisLine={false}
                        tickFormatter={(value) => `${value}%`}
                        domain={[0, 100]}
                      />
                      <Tooltip 
                        contentStyle={{ 
                          backgroundColor: 'white', 
                          border: '1px solid #e5e7eb',
                          borderRadius: '8px',
                          padding: '8px'
                        }}
                        formatter={(value, name, props) => {
                          if (name === 'conversionRate') return [`${value}%`, 'Conversion Rate'];
                          if (name === 'converted') return [value, 'Converted'];
                          return [value, 'Total'];
                        }}
                        labelFormatter={(label) => `Market: ${label}`}
                      />
                      <Bar 
                        dataKey="conversionRate" 
                        radius={[4, 4, 0, 0]} 
                        name="conversionRate"
                        fill="#6366f1"
                      />
                    </BarChart>
                  </ResponsiveContainer>
                );
              })()}
            </div>
          </div>

          {/* Conversion Rates by Lead Type Chart */}
          <div className="bg-white rounded-lg shadow-lg p-6 border border-neutral-200">
            <h3 className="text-lg font-semibold text-neutral-900 mb-4">Conversion Rates by Lead Type</h3>
            {(() => {
              const chartData = analytics.leadType.map(item => ({
                name: item.lead_type || 'N/A',
                conversionRate: item.conversion_percentage || 0,
                total: item.total_clients || 0,
                converted: item.converted_clients || 0,
              })).sort((a, b) => b.conversionRate - a.conversionRate);
              
              if (chartData.length === 0) {
                return <p className="text-neutral-500 text-sm text-center py-8">No lead type data available</p>;
              }
              
              return (
                <ResponsiveContainer width="100%" height={300}>
                  <BarChart data={chartData} margin={{ top: 5, right: 20, left: 0, bottom: 80 }}>
                    <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#f0f0f0" />
                    <XAxis 
                      dataKey="name" 
                      tick={{ fontSize: 11, fill: '#6b7280' }}
                      tickLine={false}
                      axisLine={false}
                      angle={-45}
                      textAnchor="end"
                      height={80}
                    />
                    <YAxis 
                      tick={{ fontSize: 11, fill: '#6b7280' }}
                      tickLine={false}
                      axisLine={false}
                      tickFormatter={(value) => `${value}%`}
                      domain={[0, 100]}
                    />
                    <Tooltip 
                      contentStyle={{ 
                        backgroundColor: 'white', 
                        border: '1px solid #e5e7eb',
                        borderRadius: '8px',
                        padding: '8px'
                      }}
                      formatter={(value, name) => {
                        if (name === 'conversionRate') return [`${value}%`, 'Conversion Rate'];
                        if (name === 'converted') return [value, 'Converted'];
                        return [value, 'Total'];
                      }}
                      labelFormatter={(label) => `Lead Type: ${label}`}
                    />
                    <Bar 
                      dataKey="conversionRate"
                      radius={[4, 4, 0, 0]}
                      name="conversionRate"
                      fill="#6366f1"
                    />
                  </BarChart>
                </ResponsiveContainer>
              );
            })()}
          </div>

          {/* Conversions by Lead Type Table - Google Sheets Format */}
            <div className="bg-white rounded-lg shadow overflow-hidden border border-neutral-200">
              <div className="px-4 py-5 sm:p-6">
              <h3 className="text-lg font-semibold text-neutral-900 mb-4">Conversions by Lead Type</h3>
              <p className="text-sm text-neutral-600 mb-4">1st Paid Lesson Complete</p>
                <div className="overflow-x-auto">
                  <table className="min-w-full table-fixed divide-y divide-neutral-200">
                    <thead className="bg-neutral-50">
                      <tr>
                      <th className="relative px-4 py-3 text-left text-xs font-medium text-neutral-500 uppercase tracking-wider" style={{ width: leadTypeWidths.type || 160 }}>Type<ResizeHandle colKey="type" onResizeStart={leadTypeResize} /></th>
                      <th className="relative px-4 py-3 text-center text-xs font-medium text-neutral-500 uppercase tracking-wider" style={{ width: leadTypeWidths.no || 80 }}>No<ResizeHandle colKey="no" onResizeStart={leadTypeResize} /></th>
                      <th className="relative px-4 py-3 text-center text-xs font-medium text-neutral-500 uppercase tracking-wider" style={{ width: leadTypeWidths.yes || 80 }}>Yes<ResizeHandle colKey="yes" onResizeStart={leadTypeResize} /></th>
                      <th className="relative px-4 py-3 text-center text-xs font-medium text-neutral-500 uppercase tracking-wider" style={{ width: leadTypeWidths.grandTotal || 110 }}>Grand Total<ResizeHandle colKey="grandTotal" onResizeStart={leadTypeResize} /></th>
                      <th className="relative px-4 py-3 text-center text-xs font-medium text-neutral-500 uppercase tracking-wider" style={{ width: leadTypeWidths.pctYes || 90 }}>% YES<ResizeHandle colKey="pctYes" onResizeStart={leadTypeResize} /></th>
                      <th className="relative px-4 py-3 text-center text-xs font-medium text-neutral-500 uppercase tracking-wider" style={{ width: leadTypeWidths.pctNo || 90 }}>% NO</th>
                      </tr>
                    </thead>
                    <tbody className="bg-white divide-y divide-neutral-200">
                    {(() => {
                      const leadTypeData = analytics.leadType || [];
                      const totals = leadTypeData.reduce((acc, item) => ({
                        no: acc.no + (item.no || 0),
                        yes: acc.yes + (item.yes || 0),
                        total: acc.total + (item.total || 0)
                      }), { no: 0, yes: 0, total: 0 });
                      const totalPercentageYes = totals.total > 0 ? ((totals.yes / totals.total) * 100).toFixed(0) : 0;
                      const totalPercentageNo = totals.total > 0 ? ((totals.no / totals.total) * 100).toFixed(0) : 0;
                      
                      return (
                        <>
                          {leadTypeData.map((item, index) => (
                            <tr key={index} className="hover:bg-neutral-50">
                              <td className="px-4 py-3 whitespace-nowrap text-sm font-medium text-neutral-900">
                                {item.lead_type || 'N/A'}
                          </td>
                              <td className="px-4 py-3 whitespace-nowrap text-sm text-neutral-900 text-center">{item.no || 0}</td>
                              <td className="px-4 py-3 whitespace-nowrap text-sm text-neutral-900 text-center">{item.yes || 0}</td>
                              <td className="px-4 py-3 whitespace-nowrap text-sm font-semibold text-neutral-900 text-center">{item.total || 0}</td>
                              <td className="px-4 py-3 whitespace-nowrap text-sm text-center">
                                <span className={`font-semibold ${parseInt(item.percentage_yes) >= 70 ? 'text-[#2A9147]' : parseInt(item.percentage_yes) >= 50 ? 'text-[#C77A26]' : 'text-[#AE255B]'}`}>
                                  {item.percentage_yes || 0}%
                            </span>
                          </td>
                              <td className="px-4 py-3 whitespace-nowrap text-sm text-center">
                                <span className="text-neutral-600">{item.percentage_no || 0}%</span>
                          </td>
                        </tr>
                      ))}
                          <tr className="bg-neutral-50 font-bold">
                            <td className="px-4 py-3 whitespace-nowrap text-sm font-bold text-neutral-900">TOTAL</td>
                            <td className="px-4 py-3 whitespace-nowrap text-sm font-bold text-neutral-900 text-center">{totals.no}</td>
                            <td className="px-4 py-3 whitespace-nowrap text-sm font-bold text-neutral-900 text-center">{totals.yes}</td>
                            <td className="px-4 py-3 whitespace-nowrap text-sm font-bold text-neutral-900 text-center">{totals.total}</td>
                            <td className="px-4 py-3 whitespace-nowrap text-sm font-bold text-center text-[#2A9147]">{totalPercentageYes}%</td>
                            <td className="px-4 py-3 whitespace-nowrap text-sm font-bold text-center text-neutral-600">{totalPercentageNo}%</td>
                          </tr>
                        </>
                      );
                    })()}
                    </tbody>
                  </table>
                </div>
              </div>
            </div>

          {/* Conversions by Market Table - Google Sheets Format */}
            <div className="bg-white rounded-lg shadow overflow-hidden border border-neutral-200">
              <div className="px-4 py-5 sm:p-6">
              <h3 className="text-lg font-semibold text-neutral-900 mb-4">Conversions by Market</h3>
              <p className="text-sm text-neutral-600 mb-4">1st Paid Lesson Complete</p>
                <div className="overflow-x-auto">
                  <table className="min-w-full table-fixed divide-y divide-neutral-200">
                    <thead className="bg-neutral-50">
                      <tr>
                        <th className="relative px-4 py-3 text-left text-xs font-medium text-neutral-500 uppercase tracking-wider" style={{ width: marketWidths.market || 160 }}>Market<ResizeHandle colKey="market" onResizeStart={marketResize} /></th>
                      <th className="relative px-4 py-3 text-center text-xs font-medium text-neutral-500 uppercase tracking-wider" style={{ width: marketWidths.no || 80 }}>No<ResizeHandle colKey="no" onResizeStart={marketResize} /></th>
                      <th className="relative px-4 py-3 text-center text-xs font-medium text-neutral-500 uppercase tracking-wider" style={{ width: marketWidths.yes || 80 }}>Yes<ResizeHandle colKey="yes" onResizeStart={marketResize} /></th>
                      <th className="relative px-4 py-3 text-center text-xs font-medium text-neutral-500 uppercase tracking-wider" style={{ width: marketWidths.grandTotal || 110 }}>Grand Total<ResizeHandle colKey="grandTotal" onResizeStart={marketResize} /></th>
                      <th className="relative px-4 py-3 text-center text-xs font-medium text-neutral-500 uppercase tracking-wider" style={{ width: marketWidths.pctYes || 90 }}>% YES<ResizeHandle colKey="pctYes" onResizeStart={marketResize} /></th>
                      <th className="relative px-4 py-3 text-center text-xs font-medium text-neutral-500 uppercase tracking-wider" style={{ width: marketWidths.pctNo || 90 }}>% NO</th>
                      </tr>
                    </thead>
                    <tbody className="bg-white divide-y divide-neutral-200">
                    {(() => {
                      const marketData = analytics.market || [];
                      const totals = marketData.reduce((acc, item) => ({
                        no: acc.no + (item.no || 0),
                        yes: acc.yes + (item.yes || 0),
                        total: acc.total + (item.total || 0)
                      }), { no: 0, yes: 0, total: 0 });
                      const totalPercentageYes = totals.total > 0 ? ((totals.yes / totals.total) * 100).toFixed(0) : 0;
                      const totalPercentageNo = totals.total > 0 ? ((totals.no / totals.total) * 100).toFixed(0) : 0;
                      
                      return (
                        <>
                          {marketData.map((item, index) => (
                            <tr key={index} className="hover:bg-neutral-50">
                          <td className="px-4 py-3 whitespace-nowrap text-sm font-medium text-neutral-900">{item.market || 'N/A'}</td>
                              <td className="px-4 py-3 whitespace-nowrap text-sm text-neutral-900 text-center">{item.no || 0}</td>
                              <td className="px-4 py-3 whitespace-nowrap text-sm text-neutral-900 text-center">{item.yes || 0}</td>
                              <td className="px-4 py-3 whitespace-nowrap text-sm font-semibold text-neutral-900 text-center">{item.total || 0}</td>
                              <td className="px-4 py-3 whitespace-nowrap text-sm text-center">
                                <span className={`font-semibold ${parseInt(item.percentage_yes) >= 70 ? 'text-[#2A9147]' : parseInt(item.percentage_yes) >= 50 ? 'text-[#C77A26]' : 'text-[#AE255B]'}`}>
                                  {item.percentage_yes || 0}%
                            </span>
                          </td>
                              <td className="px-4 py-3 whitespace-nowrap text-sm text-center">
                                <span className="text-neutral-600">{item.percentage_no || 0}%</span>
                          </td>
                        </tr>
                      ))}
                          <tr className="bg-neutral-50 font-bold">
                            <td className="px-4 py-3 whitespace-nowrap text-sm font-bold text-neutral-900">TOTAL</td>
                            <td className="px-4 py-3 whitespace-nowrap text-sm font-bold text-neutral-900 text-center">{totals.no}</td>
                            <td className="px-4 py-3 whitespace-nowrap text-sm font-bold text-neutral-900 text-center">{totals.yes}</td>
                            <td className="px-4 py-3 whitespace-nowrap text-sm font-bold text-neutral-900 text-center">{totals.total}</td>
                            <td className="px-4 py-3 whitespace-nowrap text-sm font-bold text-center text-[#2A9147]">{totalPercentageYes}%</td>
                            <td className="px-4 py-3 whitespace-nowrap text-sm font-bold text-center text-neutral-600">{totalPercentageNo}%</td>
                          </tr>
                        </>
                      );
                    })()}
                    </tbody>
                  </table>
              </div>
            </div>
          </div>

          {/* Weekly Conversion Tracking - Google Sheets Format */}
          <div className="bg-white rounded-lg shadow overflow-hidden border border-neutral-200">
            <div className="px-4 py-5 sm:p-6">
              <h3 className="text-lg font-semibold text-neutral-900 mb-4">Weekly Conversion Tracking</h3>
              <div className="overflow-x-auto">
                <table className="min-w-full table-fixed divide-y divide-neutral-200">
                  <thead className="bg-neutral-50">
                    <tr>
                      <th className="relative px-4 py-3 text-left text-xs font-medium text-neutral-500 uppercase tracking-wider" style={{ width: weeklyWidths.weekStart || 110 }}>Week Start<ResizeHandle colKey="weekStart" onResizeStart={weeklyResize} /></th>
                      <th className="relative px-4 py-3 text-left text-xs font-medium text-neutral-500 uppercase tracking-wider" style={{ width: weeklyWidths.weekEnd || 110 }}>Week End<ResizeHandle colKey="weekEnd" onResizeStart={weeklyResize} /></th>
                      <th className="relative px-4 py-3 text-right text-xs font-medium text-neutral-500 uppercase tracking-wider" style={{ width: weeklyWidths.paired || 120 }}># of paired<ResizeHandle colKey="paired" onResizeStart={weeklyResize} /></th>
                      <th className="relative px-4 py-3 text-right text-xs font-medium text-neutral-500 uppercase tracking-wider" style={{ width: weeklyWidths.pairedYoy || 130 }}>% change YOY<ResizeHandle colKey="pairedYoy" onResizeStart={weeklyResize} /></th>
                      <th className="relative px-4 py-3 text-right text-xs font-medium text-neutral-500 uppercase tracking-wider" style={{ width: weeklyWidths.firstLessons || 200 }}># of first lessons / trials<ResizeHandle colKey="firstLessons" onResizeStart={weeklyResize} /></th>
                      <th className="relative px-4 py-3 text-right text-xs font-medium text-neutral-500 uppercase tracking-wider" style={{ width: weeklyWidths.trialsYoy || 130 }}>% change YOY</th>
                    </tr>
                  </thead>
                  <tbody className="bg-white divide-y divide-neutral-200">
                    {analytics.weeklyStats.length === 0 ? (
                      <tr>
                        <td colSpan="6" className="px-4 py-8 text-center text-sm text-neutral-500">
                          No weekly data available
                        </td>
                      </tr>
                    ) : (
                      analytics.weeklyStats.map((week, index) => {
                        const weekStartDate = new Date(week.week_start);
                        const weekEndDate = new Date(week.week_end);
                        const formatDate = (date) => {
                          const month = date.getMonth() + 1;
                          const day = date.getDate();
                          return `${month}/${day}`;
                        };
                        
                        return (
                          <tr key={index} className="hover:bg-neutral-50">
                            <td className="px-4 py-3 whitespace-nowrap text-sm font-medium text-neutral-900">
                              {formatDate(weekStartDate)}
                            </td>
                        <td className="px-4 py-3 whitespace-nowrap text-sm text-neutral-900">
                              {formatDate(weekEndDate)}
                        </td>
                            <td className="px-4 py-3 whitespace-nowrap text-sm text-neutral-900 text-right font-medium">
                              {week.paired || 0}
                            </td>
                            <td className="px-4 py-3 whitespace-nowrap text-sm text-right">
                              {week.paired_yoy !== null && week.paired_yoy !== undefined ? (
                                <span className={parseFloat(week.paired_yoy) >= 0 ? 'text-[#2A9147]' : 'text-[#AE255B]'}>
                                  {parseFloat(week.paired_yoy) >= 0 ? '+' : ''}{week.paired_yoy}%
                          </span>
                              ) : (
                                <span className="text-neutral-400">—</span>
                              )}
                            </td>
                            <td className="px-4 py-3 whitespace-nowrap text-sm text-neutral-900 text-right font-medium">
                              {week.first_lessons_trials || 0}
                            </td>
                            <td className="px-4 py-3 whitespace-nowrap text-sm text-right">
                              {week.trials_yoy !== null && week.trials_yoy !== undefined ? (
                                <span className={parseFloat(week.trials_yoy) >= 0 ? 'text-[#2A9147]' : 'text-[#AE255B]'}>
                                  {parseFloat(week.trials_yoy) >= 0 ? '+' : ''}{week.trials_yoy}%
                                </span>
                              ) : (
                                <span className="text-neutral-400">—</span>
                              )}
                        </td>
                      </tr>
                        );
                      })
                    )}
                  </tbody>
                </table>
              </div>
            </div>
          </div>
          
          {/* Bar Chart: # of paired vs # of first lessons/trials */}
          <div className="bg-white rounded-lg shadow-lg p-6 border border-neutral-200">
            <h3 className="text-lg font-semibold text-neutral-900 mb-4"># of paired and # of first lessons / trials</h3>
            {(() => {
              const chartData = analytics.weeklyStats.slice(-16).map(week => ({
                name: `${new Date(week.week_start).toLocaleDateString('en-US', { month: '2-digit', day: '2-digit' })} - ${new Date(week.week_end).toLocaleDateString('en-US', { month: '2-digit', day: '2-digit' })}`,
                paired: week.paired || 0,
                trials: week.first_lessons_trials || 0
              }));
              
              if (chartData.length === 0) {
                return <p className="text-neutral-500 text-sm text-center py-8">No weekly data available</p>;
              }
              
              return (
                <ResponsiveContainer width="100%" height={400}>
                  <BarChart data={chartData} margin={{ top: 5, right: 20, left: 0, bottom: 80 }}>
                    <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#f0f0f0" />
                    <XAxis 
                      dataKey="name" 
                      tick={{ fontSize: 10, fill: '#6b7280' }}
                      tickLine={false}
                      axisLine={false}
                      angle={-45}
                      textAnchor="end"
                      height={80}
                    />
                    <YAxis 
                      tick={{ fontSize: 11, fill: '#6b7280' }}
                      tickLine={false}
                      axisLine={false}
                      domain={[0, 'dataMax']}
                    />
                    <Tooltip 
                      contentStyle={{ 
                        backgroundColor: 'white', 
                        border: '1px solid #e5e7eb',
                        borderRadius: '8px',
                        padding: '8px'
                      }}
                    />
                    <Legend />
                    <Bar dataKey="paired" fill="#3b82f6" name="# of paired" radius={[4, 4, 0, 0]} />
                    <Bar dataKey="trials" fill="#ef4444" name="# of first lessons / trials" radius={[4, 4, 0, 0]} />
                  </BarChart>
                </ResponsiveContainer>
              );
            })()}
          </div>

          {/* Year-over-Year Comparison */}
          {analytics.yearOverYear.length > 0 && (
            <div className="bg-white rounded-lg shadow overflow-hidden border border-neutral-200">
              <div className="px-4 py-5 sm:p-6">
                <h3 className="text-lg font-semibold text-neutral-900 mb-4">Annual Performance Comparison</h3>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-6 mb-6">
                  {analytics.yearOverYear.map((year, index) => (
                    <div key={year.year} className="bg-neutral-50 p-6 rounded-lg border border-neutral-200">
                      <h4 className="text-lg font-semibold text-neutral-900 mb-4">{year.year} Performance</h4>
                      <div className="space-y-3">
                        <div className="flex justify-between">
                          <span className="text-sm text-neutral-600">Total Trials:</span>
                          <span className="text-sm font-medium text-neutral-900">{year.total_trials}</span>
                        </div>
                        <div className="flex justify-between">
                          <span className="text-sm text-neutral-600">Converted Clients:</span>
                          <span className="text-sm font-medium text-neutral-900">{year.converted_clients}</span>
                        </div>
                        <div className="flex justify-between">
                          <span className="text-sm text-neutral-600">Bundle Purchases:</span>
                          <span className="text-sm font-medium text-neutral-900">{year.bundle_purchases}</span>
                        </div>
                        <div className="flex justify-between">
                          <span className="text-sm text-neutral-600">Conversion Rate:</span>
                          <span className="text-sm font-medium text-[#2A9147]">{year.conversion_percentage}%</span>
                        </div>
                        <div className="flex justify-between">
                          <span className="text-sm text-neutral-600">Bundle Conversion Rate:</span>
                          <span className="text-sm font-medium text-[#3BA8BD]">{year.bundle_conversion_percentage}%</span>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>

                {analytics.yearOverYear.length === 2 && (
                  <div className="bg-[#E8FBFF] p-6 rounded-lg border border-[#50C8DF]/30">
                    <h4 className="text-lg font-semibold text-neutral-900 mb-4">Year-over-Year Comparison</h4>
                    <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                      <div className="text-center">
                        <div className={`text-2xl font-bold ${
                          (analytics.yearOverYear[0].total_trials - analytics.yearOverYear[1].total_trials) >= 0 
                            ? 'text-[#2A9147]' : 'text-[#AE255B]'
                        }`}>
                          {(analytics.yearOverYear[0].total_trials - analytics.yearOverYear[1].total_trials) >= 0 ? '+' : ''}
                          {analytics.yearOverYear[0].total_trials - analytics.yearOverYear[1].total_trials}
                        </div>
                        <div className="text-sm text-neutral-600">Trials Change</div>
                      </div>
                      <div className="text-center">
                        <div className={`text-2xl font-bold ${
                          (analytics.yearOverYear[0].converted_clients - analytics.yearOverYear[1].converted_clients) >= 0 
                            ? 'text-[#2A9147]' : 'text-[#AE255B]'
                        }`}>
                          {(analytics.yearOverYear[0].converted_clients - analytics.yearOverYear[1].converted_clients) >= 0 ? '+' : ''}
                          {analytics.yearOverYear[0].converted_clients - analytics.yearOverYear[1].converted_clients}
                        </div>
                        <div className="text-sm text-neutral-600">Conversions Change</div>
                      </div>
                      <div className="text-center">
                        <div className={`text-2xl font-bold ${
                          (analytics.yearOverYear[0].conversion_percentage - analytics.yearOverYear[1].conversion_percentage) >= 0 
                            ? 'text-[#2A9147]' : 'text-[#AE255B]'
                        }`}>
                          {(analytics.yearOverYear[0].conversion_percentage - analytics.yearOverYear[1].conversion_percentage) >= 0 ? '+' : ''}
                          {(analytics.yearOverYear[0].conversion_percentage - analytics.yearOverYear[1].conversion_percentage).toFixed(1)}%
                        </div>
                        <div className="text-sm text-neutral-600">Rate Change</div>
                      </div>
                      <div className="text-center">
                        <div className={`text-2xl font-bold ${
                          (analytics.yearOverYear[0].bundle_purchases - analytics.yearOverYear[1].bundle_purchases) >= 0 
                            ? 'text-[#2A9147]' : 'text-[#AE255B]'
                        }`}>
                          {(analytics.yearOverYear[0].bundle_purchases - analytics.yearOverYear[1].bundle_purchases) >= 0 ? '+' : ''}
                          {analytics.yearOverYear[0].bundle_purchases - analytics.yearOverYear[1].bundle_purchases}
                        </div>
                        <div className="text-sm text-neutral-600">Bundles Change</div>
                      </div>
                    </div>
                  </div>
                )}
              </div>
            </div>
          )}

    </div>
  );
}

