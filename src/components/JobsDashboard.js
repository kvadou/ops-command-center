import React, { useState, useEffect, useMemo } from 'react';
import { useSearchParams } from 'react-router-dom';
import { DateTime } from 'luxon';
import axios from 'axios';
import EntityListPage from './EntityListPage';
import {
  ArrowPathIcon,
  ExclamationTriangleIcon,
  ChevronUpIcon,
  ChevronDownIcon,
  ArrowTopRightOnSquareIcon,
  UserGroupIcon,
  ClockIcon,
  BoltIcon,
} from '@heroicons/react/24/outline';

function classNames(...classes) {
  return classes.filter(Boolean).join(' ');
}

// Reusable column resize hook for custom tables
function useResizableColumns(storageKey) {
  const [columnWidths, setColumnWidths] = useState(() => {
    try {
      const saved = localStorage.getItem(storageKey);
      return saved ? JSON.parse(saved) : {};
    } catch { return {}; }
  });

  const handleResizeStart = (e, colKey) => {
    e.preventDefault();
    e.stopPropagation();
    const startX = e.clientX;
    const startWidth = columnWidths[colKey] || 120;

    const onMouseMove = (moveEvent) => {
      const newWidth = Math.max(80, startWidth + (moveEvent.clientX - startX));
      setColumnWidths(prev => {
        const updated = { ...prev, [colKey]: newWidth };
        localStorage.setItem(storageKey, JSON.stringify(updated));
        return updated;
      });
    };
    const onMouseUp = () => {
      document.removeEventListener('mousemove', onMouseMove);
      document.removeEventListener('mouseup', onMouseUp);
    };
    document.addEventListener('mousemove', onMouseMove);
    document.addEventListener('mouseup', onMouseUp);
  };

  return { columnWidths, handleResizeStart };
}

function ResizeHandle({ colKey, onResizeStart }) {
  return (
    <div
      className="absolute -right-1.5 top-0 bottom-0 w-3 cursor-col-resize hover:bg-primary-500/20 group z-10"
      onMouseDown={(e) => onResizeStart(e, colKey)}
      onClick={(e) => e.stopPropagation()}
    >
      <div className="mx-auto w-px h-full bg-neutral-200 group-hover:bg-primary-500/40" />
    </div>
  );
}

// === TOP-LEVEL TABS ===
const PAGE_TABS = [
  { id: 'jobs', label: 'Jobs' },
  { id: 'analytics', label: 'Analytics' },
];

export default function JobsDashboard() {
  const [searchParams, setSearchParams] = useSearchParams();
  const initialView = searchParams.get('view') || 'jobs';
  const [activeView, setActiveView] = useState(initialView);

  const handleViewChange = (view) => {
    setActiveView(view);
    const params = new URLSearchParams(searchParams);
    if (view === 'jobs') {
      params.delete('view');
    } else {
      params.set('view', view);
    }
    setSearchParams(params, { replace: true });
  };

  return (
    <div>
      {/* View toggle tabs */}
      <div className="border-b border-neutral-200 bg-white px-4 sm:px-6 lg:px-8">
        <nav className="flex gap-6 -mb-px">
          {PAGE_TABS.map(tab => (
            <button
              key={tab.id}
              onClick={() => handleViewChange(tab.id)}
              className={classNames(
                'px-1 py-3 text-sm font-medium border-b-2 transition-colors',
                activeView === tab.id
                  ? 'border-brand-purple text-brand-purple'
                  : 'border-transparent text-neutral-500 hover:text-neutral-700 hover:border-neutral-300'
              )}
            >
              {tab.label}
            </button>
          ))}
        </nav>
      </div>

      {activeView === 'jobs' && <JobsTab searchParams={searchParams} />}
      {activeView === 'analytics' && <AnalyticsTab />}
    </div>
  );
}

// === JOBS TAB — mirrors existing JobsListPage ===
function JobsTab({ searchParams }) {
  const [availableLabels, setAvailableLabels] = useState([]);
  const [tabCounts, setTabCounts] = useState({});

  useEffect(() => {
    fetch('/api/labels')
      .then(res => res.json())
      .then(data => {
        if (data.labels) {
          setAvailableLabels(data.labels.map(l => ({
            value: l.name || l.machine_name,
            label: l.name || l.machine_name
          })));
        }
      })
      .catch(() => {});

    fetch('/api/entity-lists/jobs?limit=1')
      .then(res => res.json())
      .then(data => {
        if (data.tabCounts) {
          setTabCounts(data.tabCounts);
        } else if (data.pagination) {
          setTabCounts({ all: data.pagination.total });
        }
      })
      .catch(() => {});
  }, []);

  const getRowData = (job) => {
    const labelNames = Array.isArray(job.labels)
      ? job.labels.map(l => typeof l === 'string' ? l : (l.name || l.machine_name || '')).filter(Boolean).join(', ')
      : '';

    return {
      name: job.name || `Job ${job.service_id}`,
      status: job.status || 'Unknown',
      chargeRate: job.dft_charge_rate ? `$${parseFloat(job.dft_charge_rate).toFixed(2)}` : 'N/A',
      tutorRate: job.dft_contractor_rate ? `$${parseFloat(job.dft_contractor_rate).toFixed(2)}` : 'N/A',
      labels: labelNames || 'None',
      created: job.created_at ? new Date(job.created_at).toLocaleDateString() : 'N/A'
    };
  };

  const tabs = [
    { key: 'all', label: 'All', filter: {} },
    { key: 'available', label: 'Available for Application', filter: { status: 'planned' } },
    { key: 'in_progress', label: 'In Progress', filter: { status: 'in-progress' } },
    { key: 'finished', label: 'Finished', filter: { status: 'completed' } },
    { key: 'pending', label: 'Pending', filter: { status: 'pending' } },
    { key: 'gone_cold', label: 'Gone Cold', filter: { status: 'gone-cold' } }
  ].map(tab => ({
    ...tab,
    count: tabCounts[tab.key] || 0
  }));

  const filters = [
    {
      key: 'labels',
      label: 'Labels',
      type: 'checkbox-group',
      options: availableLabels,
      section: 'Labels',
      entityType: 'Jobs'
    }
  ];

  // Get default tab from URL params
  const urlTab = searchParams.get('tab');
  const defaultTab = urlTab || 'in_progress';

  return (
    <EntityListPage
      title="Jobs"
      entityType="jobs"
      apiEndpoint="jobs"
      getRowData={getRowData}
      columns={[
        { key: 'name', label: 'Job Name' },
        { key: 'status', label: 'Status' },
        { key: 'chargeRate', label: 'Charge Rate' },
        { key: 'tutorRate', label: 'Tutor Rate' },
        { key: 'labels', label: 'Labels' },
        { key: 'created', label: 'Created' }
      ]}
      searchPlaceholder="Search by job name..."
      tabs={tabs}
      defaultTab={defaultTab}
      filters={filters}
      getEntityLink={(job) => `/jobs/${job.service_id}`}
      getEntityName={(job) => job.name}
      getEntitySubtitle={(job) => job.status || ''}
      onTabCountsUpdate={setTabCounts}
      hideTitle={true}
      resizableColumns={true}
    />
  );
}

// === ANALYTICS TAB — job health dashboard content ===

function RiskBadge({ score }) {
  let bg, text, label;
  if (score >= 70) {
    bg = 'bg-[#FCE8F0]'; text = 'text-[#AE255B]'; label = 'High';
  } else if (score >= 40) {
    bg = 'bg-[#FEF4E8]'; text = 'text-[#C77A26]'; label = 'Med';
  } else {
    bg = 'bg-[#E8F8ED]'; text = 'text-[#2A9147]'; label = 'Low';
  }
  return (
    <span className={classNames('inline-flex items-center gap-1 px-2.5 py-0.5 rounded-sm text-xs font-medium whitespace-nowrap', bg, text)}>
      <span className="font-bold tabular-nums">{score}</span>
      <span className="hidden sm:inline">{label}</span>
    </span>
  );
}

function ChannelBadge({ channel }) {
  const colors = {
    Home: 'bg-[#E8F8ED] text-[#2A9147]',
    Online: 'bg-[#E8FBFF] text-[#3BA8BD]',
    Club: 'bg-primary-50 text-primary-700',
    School: 'bg-[#FEF4E8] text-[#C77A26]',
    Other: 'bg-neutral-100 text-neutral-600',
  };
  return (
    <span className={classNames('text-xs px-2 py-0.5 rounded-full font-medium', colors[channel] || colors.Other)}>
      {channel}
    </span>
  );
}

function KPICard({ label, value, subtitle, icon: Icon }) {
  return (
    <div className="bg-white border border-neutral-200 rounded-xl p-4 sm:p-5 shadow-sm">
      <div className="flex items-center gap-2 mb-1">
        {Icon && <Icon className="h-4 w-4 text-neutral-400" />}
        <div className="text-xs text-neutral-500">{label}</div>
      </div>
      <div className="text-2xl font-bold text-neutral-900 tabular-nums">{value}</div>
      {subtitle && <div className="text-xs text-neutral-500 mt-1">{subtitle}</div>}
    </div>
  );
}

function Section({ title, children }) {
  return (
    <section className="bg-white border border-neutral-200 rounded-xl shadow-sm">
      <div className="px-4 sm:px-6 py-3 border-b border-neutral-100">
        <h3 className="text-base sm:text-lg font-semibold text-neutral-900">{title}</h3>
      </div>
      <div className="p-4 sm:p-6">{children}</div>
    </section>
  );
}

function RiskFactorsPanel({ factors, actions }) {
  if (!factors || factors.length === 0) return null;
  return (
    <div className="mt-3 space-y-2">
      <div className="text-xs font-medium text-neutral-500 uppercase tracking-wide">Risk Factors</div>
      {factors.map((f, i) => (
        <div key={i} className="flex items-center gap-2 text-xs text-neutral-600">
          <span className="w-6 h-6 rounded-full bg-[#FCE8F0] text-[#AE255B] flex items-center justify-center font-bold text-[10px]">+{f.points}</span>
          <span>{f.detail}</span>
        </div>
      ))}
      {actions && actions.length > 0 && (
        <div className="pt-2 border-t border-neutral-100">
          <div className="text-xs font-medium text-neutral-500 uppercase tracking-wide mb-1">Suggested Actions</div>
          {actions.map((a, i) => (
            <div key={i} className="flex items-center gap-1.5 text-xs text-primary-500">
              <BoltIcon className="h-3.5 w-3.5" />
              <span>{a}</span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

function AnalyticsTab() {
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
  const [subTab, setSubTab] = useState('at-risk');

  const subTabs = [
    { id: 'at-risk', label: 'At Risk', count: atRiskJobs.length },
    { id: 'placement', label: 'Placement History' },
    { id: 'gaps', label: 'Tutor Gaps' },
  ];

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
    } catch {
      setError('Failed to recalculate scores');
    } finally {
      setRecalculating(false);
    }
  };

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

  const stats = useMemo(() => {
    const high = atRiskJobs.filter(j => j.risk_score >= 70).length;
    const avgDays = atRiskJobs.length > 0
      ? (atRiskJobs.reduce((sum, j) => sum + parseFloat(j.days_in_status || 0), 0) / atRiskJobs.length).toFixed(1)
      : '0';
    const zeroBids = atRiskJobs.filter(j => (j.tutor_bids_count || 0) === 0).length;
    return { high, avgDays, zeroBids };
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
    <div className="p-4 sm:p-6 lg:p-8 space-y-4 sm:space-y-6">
      {/* Header row */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
        <p className="text-sm text-neutral-500">Monitor unplaced jobs and placement patterns</p>
        <div className="flex items-center gap-2">
          <button
            onClick={handleRecalculate}
            disabled={recalculating}
            className="inline-flex items-center gap-1.5 px-3 py-1.5 text-sm font-medium rounded-md border border-neutral-300 bg-white text-neutral-700 hover:bg-neutral-50 hover:border-neutral-400 transition-all duration-200 disabled:opacity-50"
          >
            <ArrowPathIcon className={classNames('h-4 w-4', recalculating && 'animate-spin')} />
            Recalculate
          </button>
          <button
            onClick={fetchData}
            disabled={loading}
            className="inline-flex items-center gap-1.5 px-3 py-1.5 text-sm font-medium rounded-md border border-neutral-300 bg-white text-neutral-700 hover:bg-neutral-50 hover:border-neutral-400 transition-all duration-200 disabled:opacity-50"
          >
            <ArrowPathIcon className={classNames('h-4 w-4', loading && 'animate-spin')} />
            Refresh
          </button>
        </div>
      </div>

      {error && (
        <div className="bg-[#FCE8F0] border border-[#DA2E72]/30 rounded-xl p-4 flex items-center gap-3">
          <ExclamationTriangleIcon className="h-5 w-5 text-[#DA2E72] flex-shrink-0" />
          <p className="text-sm text-[#AE255B]">{error}</p>
        </div>
      )}

      {/* KPI Cards */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        <KPICard label="Total Unplaced" value={atRiskJobs.length} icon={UserGroupIcon} />
        <KPICard label="High Risk" value={stats.high} subtitle="Score >= 70" icon={ExclamationTriangleIcon} />
        <KPICard label="Avg Wait" value={`${stats.avgDays}d`} subtitle="In current status" icon={ClockIcon} />
        <KPICard label="Zero Bids" value={stats.zeroBids} subtitle="No tutor applications" icon={UserGroupIcon} />
      </div>

      {/* Sub-tabs */}
      <div className="border-b border-neutral-200">
        <nav className="flex gap-4 -mb-px">
          {subTabs.map(tab => (
            <button
              key={tab.id}
              onClick={() => setSubTab(tab.id)}
              className={classNames(
                'px-1 py-2.5 text-sm font-medium border-b-2 transition-colors',
                subTab === tab.id
                  ? 'border-brand-purple text-brand-purple'
                  : 'border-transparent text-neutral-500 hover:text-neutral-700 hover:border-neutral-300'
              )}
            >
              {tab.label}
              {tab.count != null && (
                <span className="ml-1.5 text-xs bg-neutral-100 text-neutral-600 px-1.5 py-0.5 rounded-full">{tab.count}</span>
              )}
            </button>
          ))}
        </nav>
      </div>

      {loading && (
        <div className="flex items-center justify-center py-12">
          <ArrowPathIcon className="h-6 w-6 text-neutral-400 animate-spin" />
          <span className="ml-2 text-neutral-500">Loading...</span>
        </div>
      )}

      {!loading && subTab === 'at-risk' && (
        <AtRiskContent
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

      {!loading && subTab === 'placement' && <PlacementContent analytics={analytics} />}
      {!loading && subTab === 'gaps' && <GapsContent jobs={atRiskJobs} />}
    </div>
  );
}

// === AT RISK CONTENT ===
function AtRiskContent({ jobs, searchQuery, setSearchQuery, channelFilter, setChannelFilter, expandedJob, setExpandedJob, handleSort, SortIcon }) {
  const channels = ['All', 'Home', 'Online', 'Club', 'School', 'Other'];
  const { columnWidths, handleResizeStart } = useResizableColumns('columnWidths_jobsAtRisk');

  return (
    <div className="space-y-4">
      <div className="flex flex-col sm:flex-row gap-3">
        <div className="flex-1">
          <input
            type="text"
            placeholder="Search jobs..."
            value={searchQuery}
            onChange={e => setSearchQuery(e.target.value)}
            className="w-full px-3 py-2 text-sm border border-neutral-300 rounded-md focus:outline-none focus:ring-2 focus:ring-primary-500 focus:border-primary-500 transition-colors"
          />
        </div>
        <div className="flex gap-1.5 flex-wrap">
          {channels.map(ch => (
            <button
              key={ch}
              onClick={() => setChannelFilter(ch)}
              className={classNames(
                'px-3 py-1.5 text-xs font-medium rounded-md transition-all duration-200',
                channelFilter === ch
                  ? 'bg-primary-500 text-white'
                  : 'bg-white text-neutral-700 border border-neutral-300 hover:bg-neutral-50'
              )}
            >
              {ch}
            </button>
          ))}
        </div>
      </div>

      {jobs.length === 0 ? (
        <div className="text-center py-12 text-neutral-500">
          <UserGroupIcon className="h-10 w-10 mx-auto mb-3 text-neutral-300" />
          <p className="text-sm">No unplaced jobs found</p>
        </div>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full text-sm table-fixed">
            <thead className="border-t border-b border-neutral-200 bg-neutral-50/50">
              <tr className="text-left">
                <th className="relative py-2.5 px-3 text-[11px] font-medium text-neutral-500 uppercase tracking-wider cursor-pointer hover:text-neutral-700 select-none" style={{ width: columnWidths.risk || 100 }} onClick={() => handleSort('risk_score')}>
                  Risk <SortIcon field="risk_score" />
                  <ResizeHandle colKey="risk" onResizeStart={handleResizeStart} />
                </th>
                <th className="relative py-2.5 px-3 text-[11px] font-medium text-neutral-500 uppercase tracking-wider" style={{ width: columnWidths.job || 280 }}>
                  Job
                  <ResizeHandle colKey="job" onResizeStart={handleResizeStart} />
                </th>
                <th className="relative py-2.5 px-3 text-[11px] font-medium text-neutral-500 uppercase tracking-wider hidden sm:table-cell" style={{ width: columnWidths.channel || 100 }}>
                  Channel
                  <ResizeHandle colKey="channel" onResizeStart={handleResizeStart} />
                </th>
                <th className="relative py-2.5 px-3 text-[11px] font-medium text-neutral-500 uppercase tracking-wider cursor-pointer hover:text-neutral-700 select-none" style={{ width: columnWidths.days || 80 }} onClick={() => handleSort('days_in_status')}>
                  Days <SortIcon field="days_in_status" />
                  <ResizeHandle colKey="days" onResizeStart={handleResizeStart} />
                </th>
                <th className="relative py-2.5 px-3 text-[11px] font-medium text-neutral-500 uppercase tracking-wider cursor-pointer hover:text-neutral-700 select-none hidden md:table-cell" style={{ width: columnWidths.bids || 70 }} onClick={() => handleSort('tutor_bids_count')}>
                  Bids <SortIcon field="tutor_bids_count" />
                  <ResizeHandle colKey="bids" onResizeStart={handleResizeStart} />
                </th>
                <th className="relative py-2.5 px-3 text-[11px] font-medium text-neutral-500 uppercase tracking-wider hidden lg:table-cell" style={{ width: columnWidths.rate || 120 }}>
                  Rate
                  <ResizeHandle colKey="rate" onResizeStart={handleResizeStart} />
                </th>
                <th className="relative py-2.5 px-3 text-[11px] font-medium text-neutral-500 uppercase tracking-wider hidden lg:table-cell" style={{ width: columnWidths.location || 150 }}>
                  Location
                  <ResizeHandle colKey="location" onResizeStart={handleResizeStart} />
                </th>
                <th className="py-2.5 px-3 text-[11px] font-medium text-neutral-500 uppercase tracking-wider" style={{ width: 80 }}>Actions</th>
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
                    <td className="py-3 px-3"><RiskBadge score={job.risk_score} /></td>
                    <td className="py-3 px-3">
                      <div className="font-medium text-neutral-900 truncate max-w-[200px] sm:max-w-none">{job.job_name}</div>
                      <div className="text-xs text-neutral-400 sm:hidden"><ChannelBadge channel={job.channel} /></div>
                    </td>
                    <td className="py-3 px-3 hidden sm:table-cell"><ChannelBadge channel={job.channel} /></td>
                    <td className="py-3 px-3 text-neutral-700">{Math.round(parseFloat(job.days_in_status) || 0)}d</td>
                    <td className="py-3 px-3 text-neutral-700 hidden md:table-cell">
                      <span className={classNames('font-medium', (job.tutor_bids_count || 0) === 0 ? 'text-[#DA2E72]' : 'text-neutral-700')}>
                        {job.tutor_bids_count || 0}
                      </span>
                    </td>
                    <td className="py-3 px-3 text-neutral-700 hidden lg:table-cell">
                      {job.dft_charge_rate ? `$${job.dft_charge_rate}` : '—'}
                      {job.dft_contractor_rate ? <span className="text-neutral-400 text-xs ml-1">(pay: ${job.dft_contractor_rate})</span> : null}
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
                        className="inline-flex items-center gap-1 text-xs font-medium text-primary-500 hover:text-primary-700 transition-colors"
                      >
                        TC <ArrowTopRightOnSquareIcon className="h-3 w-3" />
                      </a>
                    </td>
                  </tr>
                  {expandedJob === job.service_id && (
                    <tr>
                      <td colSpan={8} className="px-3 py-3 bg-neutral-50 border-t border-neutral-100">
                        <RiskFactorsPanel factors={job.risk_factors} actions={job.suggested_actions} />
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

// === PLACEMENT HISTORY CONTENT ===
function PlacementContent({ analytics }) {
  const { columnWidths: placementWidths, handleResizeStart: handlePlacementResize } = useResizableColumns('columnWidths_jobsPlacement');
  const { columnWidths: coldWidths, handleResizeStart: handleColdResize } = useResizableColumns('columnWidths_jobsCold');

  if (!analytics) {
    return <div className="text-center py-12 text-neutral-500">No analytics data available yet</div>;
  }

  const { placement_by_channel, placement_over_time, cold_jobs } = analytics;

  return (
    <div className="space-y-6">
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
                <div className="text-xs text-neutral-500 mt-1">Median: {ch.median_days}d &middot; Range: {ch.min_days}–{ch.max_days}d</div>
                <div className="mt-3 h-2 bg-neutral-100 rounded-full overflow-hidden">
                  <div className="h-full bg-primary-500 rounded-full" style={{ width: `${Math.min((parseFloat(ch.avg_days) / 30) * 100, 100)}%` }} />
                </div>
              </div>
            ))}
          </div>
        ) : (
          <p className="text-neutral-500 text-sm">No placement history recorded yet. Data will appear as jobs transition through statuses.</p>
        )}
      </Section>

      <Section title="Monthly Placement Success Rate">
        {placement_over_time && placement_over_time.length > 0 ? (
          <div className="overflow-x-auto">
            <table className="w-full text-sm table-fixed">
              <thead>
                <tr className="border-t border-b border-neutral-200 bg-neutral-50/50">
                  <th className="relative py-2.5 px-3 text-left text-[11px] font-medium text-neutral-500 uppercase tracking-wider" style={{ width: placementWidths.month || 140 }}>
                    Month
                    <ResizeHandle colKey="month" onResizeStart={handlePlacementResize} />
                  </th>
                  <th className="relative py-2.5 px-3 text-right text-[11px] font-medium text-neutral-500 uppercase tracking-wider" style={{ width: placementWidths.placed || 100 }}>
                    Placed
                    <ResizeHandle colKey="placed" onResizeStart={handlePlacementResize} />
                  </th>
                  <th className="relative py-2.5 px-3 text-right text-[11px] font-medium text-neutral-500 uppercase tracking-wider" style={{ width: placementWidths.failed || 100 }}>
                    Failed
                    <ResizeHandle colKey="failed" onResizeStart={handlePlacementResize} />
                  </th>
                  <th className="relative py-2.5 px-3 text-right text-[11px] font-medium text-neutral-500 uppercase tracking-wider" style={{ width: placementWidths.total || 100 }}>
                    Total
                    <ResizeHandle colKey="total" onResizeStart={handlePlacementResize} />
                  </th>
                  <th className="py-2.5 px-3 text-right text-[11px] font-medium text-neutral-500 uppercase tracking-wider" style={{ width: placementWidths.success || 120 }}>
                    Success %
                  </th>
                </tr>
              </thead>
              <tbody className="divide-y divide-neutral-100">
                {placement_over_time.map((row, i) => (
                  <tr key={i} className="hover:bg-neutral-50">
                    <td className="py-2 px-3 text-neutral-700">{DateTime.fromISO(row.month).toFormat('MMM yyyy')}</td>
                    <td className="py-2 px-3 text-right text-[#2A9147] font-medium tabular-nums">{row.placed}</td>
                    <td className="py-2 px-3 text-right text-[#AE255B] font-medium tabular-nums">{row.failed}</td>
                    <td className="py-2 px-3 text-right text-neutral-700">{row.total}</td>
                    <td className="py-2 px-3 text-right">
                      <span className={classNames(
                        'font-medium',
                        parseFloat(row.success_rate) >= 80 ? 'text-[#2A9147]' : parseFloat(row.success_rate) >= 60 ? 'text-[#C77A26]' : 'text-[#AE255B]'
                      )}>{row.success_rate}%</span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <p className="text-neutral-500 text-sm">No monthly data recorded yet.</p>
        )}
      </Section>

      <Section title="Recently Cold Jobs (Last 6 Months)">
        {cold_jobs && cold_jobs.length > 0 ? (
          <div className="overflow-x-auto">
            <table className="w-full text-sm table-fixed">
              <thead>
                <tr className="border-t border-b border-neutral-200 bg-neutral-50/50">
                  <th className="relative py-2.5 px-3 text-left text-[11px] font-medium text-neutral-500 uppercase tracking-wider" style={{ width: coldWidths.job || 240 }}>
                    Job
                    <ResizeHandle colKey="job" onResizeStart={handleColdResize} />
                  </th>
                  <th className="relative py-2.5 px-3 text-left text-[11px] font-medium text-neutral-500 uppercase tracking-wider" style={{ width: coldWidths.channel || 100 }}>
                    Channel
                    <ResizeHandle colKey="channel" onResizeStart={handleColdResize} />
                  </th>
                  <th className="relative py-2.5 px-3 text-right text-[11px] font-medium text-neutral-500 uppercase tracking-wider" style={{ width: coldWidths.daysCold || 140 }}>
                    Days Before Cold
                    <ResizeHandle colKey="daysCold" onResizeStart={handleColdResize} />
                  </th>
                  <th className="relative py-2.5 px-3 text-right text-[11px] font-medium text-neutral-500 uppercase tracking-wider" style={{ width: coldWidths.rate || 120 }}>
                    Charge Rate
                    <ResizeHandle colKey="rate" onResizeStart={handleColdResize} />
                  </th>
                  <th className="py-2.5 px-3 text-right text-[11px] font-medium text-neutral-500 uppercase tracking-wider" style={{ width: coldWidths.wentCold || 120 }}>
                    Went Cold
                  </th>
                </tr>
              </thead>
              <tbody className="divide-y divide-neutral-100">
                {cold_jobs.slice(0, 20).map((job, i) => (
                  <tr key={i} className="hover:bg-neutral-50">
                    <td className="py-2 px-3 text-neutral-700 truncate max-w-[200px]">{job.job_name}</td>
                    <td className="py-2 px-3"><ChannelBadge channel={job.channel} /></td>
                    <td className="py-2 px-3 text-right text-neutral-700">{job.days_before_cold}d</td>
                    <td className="py-2 px-3 text-right text-neutral-700">{job.dft_charge_rate ? `$${job.dft_charge_rate}` : '—'}</td>
                    <td className="py-2 px-3 text-right text-neutral-500 text-xs">{DateTime.fromISO(job.went_cold_at).toFormat('MMM d, yyyy')}</td>
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

// === TUTOR GAPS CONTENT ===
function GapsContent({ jobs }) {
  const byChannel = useMemo(() => {
    const groups = {};
    (jobs || []).forEach(job => {
      const ch = job.channel || 'Other';
      if (!groups[ch]) groups[ch] = { count: 0, totalDays: 0, zeroBids: 0 };
      groups[ch].count++;
      groups[ch].totalDays += parseFloat(job.days_in_status) || 0;
      if ((job.tutor_bids_count || 0) === 0) groups[ch].zeroBids++;
    });
    return groups;
  }, [jobs]);

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

      <Section title="Unplaced Jobs by Tutor Pay Rate">
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
          {Object.entries(byRate).map(([bracket, count]) => (
            <div key={bracket} className="border border-neutral-200 rounded-lg p-4 text-center">
              <div className="text-sm font-medium text-neutral-600 mb-1">{bracket}/hr</div>
              <div className="text-2xl font-bold text-neutral-900">{count}</div>
              <div className="mt-2 h-2 bg-neutral-100 rounded-full overflow-hidden">
                <div
                  className={classNames('h-full rounded-full', count > 0 ? 'bg-primary-500' : 'bg-neutral-200')}
                  style={{ width: `${Math.min((count / Math.max(jobs.length, 1)) * 100, 100)}%` }}
                />
              </div>
            </div>
          ))}
        </div>
      </Section>

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
                    className="flex-shrink-0 inline-flex items-center gap-1 text-xs font-medium text-primary-500 hover:text-primary-700 ml-2"
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
