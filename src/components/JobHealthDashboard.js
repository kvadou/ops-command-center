import React, { useState, useEffect, useMemo } from 'react';
import { DateTime } from 'luxon';
import axios from 'axios';
import {
  ArrowPathIcon,
  ExclamationTriangleIcon,
  ChevronUpIcon,
  ChevronDownIcon,
  ArrowTopRightOnSquareIcon,
  UserGroupIcon,
  ClockIcon,
  BoltIcon,
  ChartBarIcon,
} from '@heroicons/react/24/outline';

function classNames(...classes) {
  return classes.filter(Boolean).join(' ');
}

// Risk score badge
function RiskBadge({ score }) {
  let bg, text, label;
  if (score >= 70) {
    bg = 'bg-red-100'; text = 'text-red-700'; label = 'High Risk';
  } else if (score >= 40) {
    bg = 'bg-amber-100'; text = 'text-amber-700'; label = 'Medium Risk';
  } else {
    bg = 'bg-green-100'; text = 'text-green-700'; label = 'Low Risk';
  }

  return (
    <span className={classNames('inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium', bg, text)}>
      <span className="font-bold">{score}</span>
      <span className="hidden sm:inline">— {label}</span>
    </span>
  );
}

// Channel badge
function ChannelBadge({ channel }) {
  const colors = {
    Home: 'bg-green-50 text-green-700',
    Online: 'bg-blue-50 text-blue-700',
    Club: 'bg-purple-50 text-purple-700',
    School: 'bg-orange-50 text-orange-700',
    Other: 'bg-neutral-100 text-neutral-600',
  };
  return (
    <span className={classNames('text-xs px-2 py-0.5 rounded-full font-medium', colors[channel] || colors.Other)}>
      {channel}
    </span>
  );
}

// KPI Card
function KPICard({ label, value, subtitle, icon: Icon }) {
  return (
    <div className="bg-white border border-neutral-200 rounded-xl p-4 sm:p-5 shadow-sm">
      <div className="flex items-center gap-2 mb-1">
        {Icon && <Icon className="h-4 w-4 text-neutral-400" />}
        <div className="text-xs text-neutral-500">{label}</div>
      </div>
      <div className="text-2xl font-bold text-neutral-900 font-heading">{value}</div>
      {subtitle && <div className="text-xs text-neutral-500 mt-1">{subtitle}</div>}
    </div>
  );
}

// Section wrapper
function Section({ title, children, actions }) {
  return (
    <section className="bg-white border border-neutral-200 rounded-xl shadow-sm">
      <div className="flex items-center justify-between px-4 sm:px-6 py-3 border-b border-neutral-100">
        <h3 className="text-base sm:text-lg font-semibold text-brand-navy font-heading">{title}</h3>
        {actions}
      </div>
      <div className="p-4 sm:p-6">{children}</div>
    </section>
  );
}

// Risk factors detail panel
function RiskFactorsPanel({ factors, actions }) {
  if (!factors || factors.length === 0) return null;

  return (
    <div className="mt-3 space-y-2">
      <div className="text-xs font-medium text-neutral-500 uppercase tracking-wide">Risk Factors</div>
      {factors.map((f, i) => (
        <div key={i} className="flex items-center gap-2 text-xs text-neutral-600">
          <span className="w-6 h-6 rounded-full bg-red-50 text-red-600 flex items-center justify-center font-bold text-[10px]">
            +{f.points}
          </span>
          <span>{f.detail}</span>
        </div>
      ))}
      {actions && actions.length > 0 && (
        <div className="pt-2 border-t border-neutral-100">
          <div className="text-xs font-medium text-neutral-500 uppercase tracking-wide mb-1">Suggested Actions</div>
          {actions.map((a, i) => (
            <div key={i} className="flex items-center gap-1.5 text-xs text-brand-purple">
              <BoltIcon className="h-3.5 w-3.5" />
              <span>{a}</span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

export default function JobHealthDashboard() {
  const [activeTab, setActiveTab] = useState('at-risk');
  const [loading, setLoading] = useState(true);
  const [recalculating, setRecalculating] = useState(false);
  const [atRiskJobs, setAtRiskJobs] = useState([]);
  const [analytics, setAnalytics] = useState(null);
  const [error, setError] = useState(null);
  const [expandedJob, setExpandedJob] = useState(null);
  const [searchQuery, setSearchQuery] = useState('');
  const [channelFilter, setChannelFilter] = useState('All');
  const [sortField, setSortField] = useState('risk_score');
  const [sortDir, setSortDir] = useState('desc');

  const tabs = [
    { id: 'at-risk', label: 'At Risk', count: atRiskJobs.length },
    { id: 'analytics', label: 'Analytics' },
    { id: 'tutor-gaps', label: 'Tutor Gaps' },
  ];

  // Fetch data
  useEffect(() => {
    fetchData();
  }, []);

  const fetchData = async () => {
    setLoading(true);
    setError(null);
    try {
      const [atRiskRes, analyticsRes] = await Promise.all([
        axios.get('/api/job-health/at-risk'),
        axios.get('/api/job-health/analytics'),
      ]);
      setAtRiskJobs(atRiskRes.data.jobs || []);
      setAnalytics(analyticsRes.data || null);
    } catch (err) {
      setError(err.response?.data?.error || 'Failed to load job health data');
    } finally {
      setLoading(false);
    }
  };

  const handleRecalculate = async () => {
    setRecalculating(true);
    try {
      await axios.post('/api/job-health/recalculate');
      await fetchData();
    } catch (err) {
      setError('Failed to recalculate scores');
    } finally {
      setRecalculating(false);
    }
  };

  // Filter and sort at-risk jobs
  const filteredJobs = useMemo(() => {
    let jobs = atRiskJobs;

    if (searchQuery) {
      const q = searchQuery.toLowerCase();
      jobs = jobs.filter(j =>
        (j.job_name || '').toLowerCase().includes(q) ||
        (j.channel || '').toLowerCase().includes(q) ||
        (j.dft_location_address || '').toLowerCase().includes(q)
      );
    }

    if (channelFilter !== 'All') {
      jobs = jobs.filter(j => j.channel === channelFilter);
    }

    return [...jobs].sort((a, b) => {
      const aVal = a[sortField] ?? (sortDir === 'desc' ? -Infinity : Infinity);
      const bVal = b[sortField] ?? (sortDir === 'desc' ? -Infinity : Infinity);
      return sortDir === 'desc' ? bVal - aVal : aVal - bVal;
    });
  }, [atRiskJobs, searchQuery, channelFilter, sortField, sortDir]);

  // Summary stats
  const stats = useMemo(() => {
    const high = atRiskJobs.filter(j => j.risk_score >= 70).length;
    const medium = atRiskJobs.filter(j => j.risk_score >= 40 && j.risk_score < 70).length;
    const low = atRiskJobs.filter(j => j.risk_score < 40).length;
    const avgDays = atRiskJobs.length > 0
      ? (atRiskJobs.reduce((sum, j) => sum + parseFloat(j.days_in_status || 0), 0) / atRiskJobs.length).toFixed(1)
      : '0';
    const zeroBids = atRiskJobs.filter(j => (j.tutor_bids_count || 0) === 0).length;
    return { high, medium, low, avgDays, zeroBids };
  }, [atRiskJobs]);

  const handleSort = (field) => {
    if (sortField === field) {
      setSortDir(d => d === 'desc' ? 'asc' : 'desc');
    } else {
      setSortField(field);
      setSortDir('desc');
    }
  };

  const SortIcon = ({ field }) => {
    if (sortField !== field) return null;
    return sortDir === 'desc'
      ? <ChevronDownIcon className="h-3 w-3 inline ml-0.5" />
      : <ChevronUpIcon className="h-3 w-3 inline ml-0.5" />;
  };

  return (
      <div className="max-w-7xl mx-auto w-full space-y-4 sm:space-y-6">
        {/* Header */}
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
          <div>
            <h1 className="text-xl sm:text-2xl font-bold text-brand-navy font-heading">Job Placement Health</h1>
            <p className="text-sm text-neutral-500 mt-0.5">Monitor unplaced jobs and placement patterns</p>
          </div>
          <div className="flex items-center gap-2">
            <button
              onClick={handleRecalculate}
              disabled={recalculating}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 text-sm font-medium rounded-lg border border-neutral-200 bg-white text-neutral-700 hover:bg-neutral-50 transition-colors disabled:opacity-50"
            >
              <ArrowPathIcon className={classNames('h-4 w-4', recalculating && 'animate-spin')} />
              Recalculate
            </button>
            <button
              onClick={fetchData}
              disabled={loading}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 text-sm font-medium rounded-lg border border-neutral-200 bg-white text-neutral-700 hover:bg-neutral-50 transition-colors disabled:opacity-50"
            >
              <ArrowPathIcon className={classNames('h-4 w-4', loading && 'animate-spin')} />
              Refresh
            </button>
          </div>
        </div>

        {/* Error state */}
        {error && (
          <div className="bg-red-50 border border-red-200 rounded-xl p-4 flex items-center gap-3">
            <ExclamationTriangleIcon className="h-5 w-5 text-red-500 flex-shrink-0" />
            <p className="text-sm text-red-700">{error}</p>
          </div>
        )}

        {/* KPI Cards */}
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-3">
          <KPICard label="Total Unplaced" value={atRiskJobs.length} icon={UserGroupIcon} />
          <KPICard label="High Risk" value={stats.high} subtitle="Score ≥ 70" icon={ExclamationTriangleIcon} />
          <KPICard label="Avg Wait" value={`${stats.avgDays}d`} subtitle="In current status" icon={ClockIcon} />
          <KPICard label="Zero Bids" value={stats.zeroBids} subtitle="No tutor applications" icon={UserGroupIcon} />
          <KPICard
            label="Cold Rate"
            value={analytics?.cold_jobs?.length ? `${analytics.cold_jobs.length}` : '—'}
            subtitle="Last 6 months"
            icon={ChartBarIcon}
          />
        </div>

        {/* Tabs */}
        <div className="border-b border-neutral-200">
          <nav className="flex gap-4 -mb-px">
            {tabs.map(tab => (
              <button
                key={tab.id}
                onClick={() => setActiveTab(tab.id)}
                className={classNames(
                  'px-1 py-2.5 text-sm font-medium border-b-2 transition-colors',
                  activeTab === tab.id
                    ? 'border-brand-purple text-brand-purple'
                    : 'border-transparent text-neutral-500 hover:text-neutral-700 hover:border-neutral-300'
                )}
              >
                {tab.label}
                {tab.count != null && (
                  <span className="ml-1.5 text-xs bg-neutral-100 text-neutral-600 px-1.5 py-0.5 rounded-full">
                    {tab.count}
                  </span>
                )}
              </button>
            ))}
          </nav>
        </div>

        {/* Loading state */}
        {loading && (
          <div className="flex items-center justify-center py-12">
            <ArrowPathIcon className="h-6 w-6 text-neutral-400 animate-spin" />
            <span className="ml-2 text-neutral-500">Loading job health data...</span>
          </div>
        )}

        {/* At Risk Tab */}
        {!loading && activeTab === 'at-risk' && (
          <AtRiskTab
            jobs={filteredJobs}
            searchQuery={searchQuery}
            setSearchQuery={setSearchQuery}
            channelFilter={channelFilter}
            setChannelFilter={setChannelFilter}
            expandedJob={expandedJob}
            setExpandedJob={setExpandedJob}
            handleSort={handleSort}
            SortIcon={SortIcon}
          />
        )}

        {/* Analytics Tab */}
        {!loading && activeTab === 'analytics' && (
          <AnalyticsTab analytics={analytics} />
        )}

        {/* Tutor Gaps Tab */}
        {!loading && activeTab === 'tutor-gaps' && (
          <TutorGapsTab jobs={atRiskJobs} />
        )}
      </div>
  );
}

// === AT RISK TAB ===
function AtRiskTab({ jobs, searchQuery, setSearchQuery, channelFilter, setChannelFilter, expandedJob, setExpandedJob, handleSort, SortIcon }) {
  const channels = ['All', 'Home', 'Online', 'Club', 'School', 'Other'];

  return (
    <div className="space-y-4">
      {/* Filters */}
      <div className="flex flex-col sm:flex-row gap-3">
        <div className="flex-1">
          <input
            type="text"
            placeholder="Search jobs..."
            value={searchQuery}
            onChange={e => setSearchQuery(e.target.value)}
            className="w-full px-3 py-2 text-sm border border-neutral-200 rounded-lg focus:ring-2 focus:ring-brand-purple/20 focus:border-brand-purple transition-colors"
          />
        </div>
        <div className="flex gap-1.5">
          {channels.map(ch => (
            <button
              key={ch}
              onClick={() => setChannelFilter(ch)}
              className={classNames(
                'px-3 py-1.5 text-xs font-medium rounded-lg transition-colors',
                channelFilter === ch
                  ? 'bg-brand-purple text-white'
                  : 'bg-neutral-100 text-neutral-600 hover:bg-neutral-200'
              )}
            >
              {ch}
            </button>
          ))}
        </div>
      </div>

      {/* Jobs table */}
      {jobs.length === 0 ? (
        <div className="text-center py-12 text-neutral-500">
          <UserGroupIcon className="h-10 w-10 mx-auto mb-3 text-neutral-300" />
          <p className="text-sm">No unplaced jobs found</p>
        </div>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-neutral-200 text-left">
                <th className="py-2 px-3 font-medium text-neutral-500 cursor-pointer hover:text-neutral-700" onClick={() => handleSort('risk_score')}>
                  Risk <SortIcon field="risk_score" />
                </th>
                <th className="py-2 px-3 font-medium text-neutral-500">Job</th>
                <th className="py-2 px-3 font-medium text-neutral-500 hidden sm:table-cell">Channel</th>
                <th className="py-2 px-3 font-medium text-neutral-500 cursor-pointer hover:text-neutral-700" onClick={() => handleSort('days_in_status')}>
                  Days <SortIcon field="days_in_status" />
                </th>
                <th className="py-2 px-3 font-medium text-neutral-500 cursor-pointer hover:text-neutral-700 hidden md:table-cell" onClick={() => handleSort('tutor_bids_count')}>
                  Bids <SortIcon field="tutor_bids_count" />
                </th>
                <th className="py-2 px-3 font-medium text-neutral-500 hidden lg:table-cell">Rate</th>
                <th className="py-2 px-3 font-medium text-neutral-500 hidden lg:table-cell">Location</th>
                <th className="py-2 px-3 font-medium text-neutral-500">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-neutral-100">
              {jobs.map(job => (
                <React.Fragment key={job.service_id}>
                  <tr
                    className={classNames(
                      'hover:bg-neutral-50 transition-colors cursor-pointer',
                      expandedJob === job.service_id && 'bg-neutral-50'
                    )}
                    onClick={() => setExpandedJob(expandedJob === job.service_id ? null : job.service_id)}
                  >
                    <td className="py-3 px-3">
                      <RiskBadge score={job.risk_score} />
                    </td>
                    <td className="py-3 px-3">
                      <div className="font-medium text-neutral-900 truncate max-w-[200px] sm:max-w-none">{job.job_name}</div>
                      <div className="text-xs text-neutral-400 sm:hidden">
                        <ChannelBadge channel={job.channel} />
                      </div>
                    </td>
                    <td className="py-3 px-3 hidden sm:table-cell">
                      <ChannelBadge channel={job.channel} />
                    </td>
                    <td className="py-3 px-3 text-neutral-700">
                      {Math.round(parseFloat(job.days_in_status) || 0)}d
                    </td>
                    <td className="py-3 px-3 text-neutral-700 hidden md:table-cell">
                      <span className={classNames(
                        'font-medium',
                        (job.tutor_bids_count || 0) === 0 ? 'text-red-600' : 'text-neutral-700'
                      )}>
                        {job.tutor_bids_count || 0}
                      </span>
                    </td>
                    <td className="py-3 px-3 text-neutral-700 hidden lg:table-cell">
                      {job.dft_charge_rate ? `$${job.dft_charge_rate}` : '—'}
                      {job.dft_contractor_rate ? (
                        <span className="text-neutral-400 text-xs ml-1">(pay: ${job.dft_contractor_rate})</span>
                      ) : null}
                    </td>
                    <td className="py-3 px-3 text-neutral-500 text-xs hidden lg:table-cell truncate max-w-[150px]">
                      {job.dft_location_address || (job.channel === 'Online' ? 'Online' : 'No location')}
                    </td>
                    <td className="py-3 px-3">
                      <a
                        href={job.tc_url}
                        target="_blank"
                        rel="noopener noreferrer"
                        onClick={e => e.stopPropagation()}
                        className="inline-flex items-center gap-1 text-xs font-medium text-brand-purple hover:text-brand-navy transition-colors"
                      >
                        TC <ArrowTopRightOnSquareIcon className="h-3 w-3" />
                      </a>
                    </td>
                  </tr>
                  {expandedJob === job.service_id && (
                    <tr>
                      <td colSpan={8} className="px-3 py-3 bg-neutral-50 border-t border-neutral-100">
                        <RiskFactorsPanel
                          factors={job.risk_factors}
                          actions={job.suggested_actions}
                        />
                      </td>
                    </tr>
                  )}
                </React.Fragment>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

// === ANALYTICS TAB ===
function AnalyticsTab({ analytics }) {
  if (!analytics) {
    return <div className="text-center py-12 text-neutral-500">No analytics data available yet</div>;
  }

  const { placement_by_channel, placement_over_time, cold_jobs } = analytics;

  return (
    <div className="space-y-6">
      {/* Placement Time by Channel */}
      <Section title="Average Placement Time by Channel">
        {placement_by_channel && placement_by_channel.length > 0 ? (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
            {placement_by_channel.map(ch => (
              <div key={ch.channel} className="border border-neutral-200 rounded-lg p-4">
                <div className="flex items-center gap-2 mb-2">
                  <ChannelBadge channel={ch.channel} />
                  <span className="text-xs text-neutral-400">{ch.total_placed} placed</span>
                </div>
                <div className="text-2xl font-bold text-neutral-900">{ch.avg_days}d</div>
                <div className="text-xs text-neutral-500 mt-1">
                  Median: {ch.median_days}d · Range: {ch.min_days}–{ch.max_days}d
                </div>
                {/* Simple bar visualization */}
                <div className="mt-3 h-2 bg-neutral-100 rounded-full overflow-hidden">
                  <div
                    className="h-full bg-brand-purple rounded-full transition-all"
                    style={{ width: `${Math.min((parseFloat(ch.avg_days) / 30) * 100, 100)}%` }}
                  />
                </div>
              </div>
            ))}
          </div>
        ) : (
          <p className="text-neutral-500 text-sm">No placement history recorded yet. Data will appear as jobs move through status changes.</p>
        )}
      </Section>

      {/* Monthly Success Rate */}
      <Section title="Monthly Placement Success Rate">
        {placement_over_time && placement_over_time.length > 0 ? (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-neutral-200">
                  <th className="py-2 px-3 text-left font-medium text-neutral-500">Month</th>
                  <th className="py-2 px-3 text-right font-medium text-neutral-500">Placed</th>
                  <th className="py-2 px-3 text-right font-medium text-neutral-500">Failed</th>
                  <th className="py-2 px-3 text-right font-medium text-neutral-500">Total</th>
                  <th className="py-2 px-3 text-right font-medium text-neutral-500">Success %</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-neutral-100">
                {placement_over_time.map((row, i) => (
                  <tr key={i} className="hover:bg-neutral-50">
                    <td className="py-2 px-3 text-neutral-700">
                      {DateTime.fromISO(row.month).toFormat('MMM yyyy')}
                    </td>
                    <td className="py-2 px-3 text-right text-green-600 font-medium">{row.placed}</td>
                    <td className="py-2 px-3 text-right text-red-600 font-medium">{row.failed}</td>
                    <td className="py-2 px-3 text-right text-neutral-700">{row.total}</td>
                    <td className="py-2 px-3 text-right">
                      <span className={classNames(
                        'font-medium',
                        parseFloat(row.success_rate) >= 80 ? 'text-green-600' : parseFloat(row.success_rate) >= 60 ? 'text-amber-600' : 'text-red-600'
                      )}>
                        {row.success_rate}%
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <p className="text-neutral-500 text-sm">No monthly data recorded yet. Data will accumulate as jobs transition through statuses.</p>
        )}
      </Section>

      {/* Cold Jobs */}
      <Section title="Recently Cold Jobs (Last 6 Months)">
        {cold_jobs && cold_jobs.length > 0 ? (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-neutral-200">
                  <th className="py-2 px-3 text-left font-medium text-neutral-500">Job</th>
                  <th className="py-2 px-3 text-left font-medium text-neutral-500">Channel</th>
                  <th className="py-2 px-3 text-right font-medium text-neutral-500">Days Before Cold</th>
                  <th className="py-2 px-3 text-right font-medium text-neutral-500">Charge Rate</th>
                  <th className="py-2 px-3 text-right font-medium text-neutral-500">Went Cold</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-neutral-100">
                {cold_jobs.slice(0, 20).map((job, i) => (
                  <tr key={i} className="hover:bg-neutral-50">
                    <td className="py-2 px-3 text-neutral-700 truncate max-w-[200px]">{job.job_name}</td>
                    <td className="py-2 px-3"><ChannelBadge channel={job.channel} /></td>
                    <td className="py-2 px-3 text-right text-neutral-700">{job.days_before_cold}d</td>
                    <td className="py-2 px-3 text-right text-neutral-700">{job.dft_charge_rate ? `$${job.dft_charge_rate}` : '—'}</td>
                    <td className="py-2 px-3 text-right text-neutral-500 text-xs">
                      {DateTime.fromISO(job.went_cold_at).toFormat('MMM d, yyyy')}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <p className="text-neutral-500 text-sm">No cold job records yet.</p>
        )}
      </Section>
    </div>
  );
}

// === TUTOR GAPS TAB ===
function TutorGapsTab({ jobs }) {
  // Group unplaced jobs by channel
  const byChannel = useMemo(() => {
    const groups = {};
    (jobs || []).forEach(job => {
      const ch = job.channel || 'Other';
      if (!groups[ch]) groups[ch] = { count: 0, totalDays: 0, zeroBids: 0, jobs: [] };
      groups[ch].count++;
      groups[ch].totalDays += parseFloat(job.days_in_status) || 0;
      if ((job.tutor_bids_count || 0) === 0) groups[ch].zeroBids++;
      groups[ch].jobs.push(job);
    });
    return groups;
  }, [jobs]);

  // Group by rate bracket
  const byRate = useMemo(() => {
    const brackets = { '$0-30': 0, '$30-50': 0, '$50-80': 0, '$80+': 0 };
    (jobs || []).forEach(job => {
      const rate = parseFloat(job.dft_contractor_rate) || 0;
      if (rate < 30) brackets['$0-30']++;
      else if (rate < 50) brackets['$30-50']++;
      else if (rate < 80) brackets['$50-80']++;
      else brackets['$80+']++;
    });
    return brackets;
  }, [jobs]);

  return (
    <div className="space-y-6">
      {/* By Channel */}
      <Section title="Unplaced Jobs by Channel">
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
          {Object.entries(byChannel).sort((a, b) => b[1].count - a[1].count).map(([channel, data]) => (
            <div key={channel} className="border border-neutral-200 rounded-lg p-4">
              <div className="flex items-center justify-between mb-2">
                <ChannelBadge channel={channel} />
                <span className="text-lg font-bold text-neutral-900">{data.count}</span>
              </div>
              <div className="space-y-1 text-xs text-neutral-500">
                <div>Avg wait: {(data.totalDays / data.count).toFixed(1)} days</div>
                <div>Zero bids: {data.zeroBids} ({Math.round((data.zeroBids / data.count) * 100)}%)</div>
              </div>
            </div>
          ))}
          {Object.keys(byChannel).length === 0 && (
            <p className="text-neutral-500 text-sm col-span-full">No unplaced jobs</p>
          )}
        </div>
      </Section>

      {/* By Rate Bracket */}
      <Section title="Unplaced Jobs by Tutor Pay Rate">
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
          {Object.entries(byRate).map(([bracket, count]) => (
            <div key={bracket} className="border border-neutral-200 rounded-lg p-4 text-center">
              <div className="text-sm font-medium text-neutral-600 mb-1">{bracket}/hr</div>
              <div className="text-2xl font-bold text-neutral-900">{count}</div>
              <div className="mt-2 h-2 bg-neutral-100 rounded-full overflow-hidden">
                <div
                  className={classNames(
                    'h-full rounded-full',
                    count > 0 ? 'bg-brand-purple' : 'bg-neutral-200'
                  )}
                  style={{ width: `${Math.min((count / Math.max(jobs.length, 1)) * 100, 100)}%` }}
                />
              </div>
            </div>
          ))}
        </div>
      </Section>

      {/* High-Risk Jobs Needing Intervention */}
      <Section title="Jobs Most Needing Tutor Outreach">
        {jobs.filter(j => j.risk_score >= 50 && (j.tutor_bids_count || 0) === 0).length > 0 ? (
          <div className="space-y-3">
            {jobs
              .filter(j => j.risk_score >= 50 && (j.tutor_bids_count || 0) === 0)
              .slice(0, 10)
              .map(job => (
                <div key={job.service_id} className="flex items-center justify-between border border-neutral-200 rounded-lg p-3">
                  <div className="flex items-center gap-3 min-w-0">
                    <RiskBadge score={job.risk_score} />
                    <div className="min-w-0">
                      <div className="font-medium text-neutral-900 truncate">{job.job_name}</div>
                      <div className="text-xs text-neutral-500 flex items-center gap-2">
                        <ChannelBadge channel={job.channel} />
                        <span>{Math.round(parseFloat(job.days_in_status))}d waiting</span>
                        {job.dft_contractor_rate && <span>Pay: ${job.dft_contractor_rate}/hr</span>}
                      </div>
                    </div>
                  </div>
                  <a
                    href={job.tc_url}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="flex-shrink-0 inline-flex items-center gap-1 text-xs font-medium text-brand-purple hover:text-brand-navy ml-2"
                  >
                    View in TC <ArrowTopRightOnSquareIcon className="h-3 w-3" />
                  </a>
                </div>
              ))}
          </div>
        ) : (
          <p className="text-neutral-500 text-sm">No high-risk jobs with zero bids currently</p>
        )}
      </Section>
    </div>
  );
}
