import React, { useState, useEffect, useCallback } from 'react';
import { io } from 'socket.io-client';
import {
  AreaChart,
  Area,
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
} from 'recharts';
import {
  ChartBarIcon,
  CurrencyDollarIcon,
  UserGroupIcon,
  ArrowTrendingUpIcon,
  CalendarIcon,
  ArrowDownTrayIcon,
  BookmarkIcon,
  BookmarkSlashIcon,
  SignalIcon,
  ArrowPathIcon,
  ClockIcon,
  CheckCircleIcon,
  ExclamationCircleIcon,
} from '@heroicons/react/24/outline';

/**
 * MarketingAnalyticsDashboard - Visual analytics for marketing performance
 *
 * Displays charts for:
 * - Spend trends over time
 * - Leads and conversion trends
 * - Campaign performance comparison
 * - Cohort retention visualization
 */
export default function MarketingAnalyticsDashboard() {
  const [dateRange, setDateRange] = useState('last_30_days');
  const [loading, setLoading] = useState(true);
  const [data, setData] = useState({
    trends: [],
    campaigns: [],
    cohorts: [],
    summary: null,
  });
  const [savedViews, setSavedViews] = useState([]);
  const [showSaveModal, setShowSaveModal] = useState(false);
  const [isConnected, setIsConnected] = useState(false);
  const [exporting, setExporting] = useState(false);
  const [syncStatus, setSyncStatus] = useState(null);
  const [syncing, setSyncing] = useState(false);

  // Load saved views and sync status
  useEffect(() => {
    loadSavedViews();
    loadSyncStatus();
  }, []);

  // WebSocket connection for real-time updates
  useEffect(() => {
    const socket = io({
      withCredentials: true,
      transports: ['websocket', 'polling'],
    });

    socket.on('connect', () => {
      setIsConnected(true);
      socket.emit('subscribe', ['marketing:dashboard', 'marketing:alerts']);
    });

    socket.on('disconnect', () => {
      setIsConnected(false);
    });

    socket.on('metrics_update', (payload) => {
      console.log('[WebSocket] Received metrics update', payload);
      // Refresh data when metrics are updated
      loadAnalyticsData();
    });

    socket.on('spend_alert', (payload) => {
      console.log('[WebSocket] Received spend alert', payload);
      // Could show a toast notification here
    });

    return () => {
      socket.emit('unsubscribe', ['marketing:dashboard', 'marketing:alerts']);
      socket.disconnect();
    };
  }, []);

  useEffect(() => {
    loadAnalyticsData();
  }, [dateRange]);

  const loadAnalyticsData = async () => {
    setLoading(true);
    try {
      const [trendsRes, campaignsRes, cohortsRes, summaryRes] = await Promise.all([
        fetch(`/api/marketing-command-center/analytics/trends?range=${dateRange}`),
        fetch(`/api/marketing-command-center/analytics/campaigns?range=${dateRange}`),
        fetch(`/api/marketing-command-center/analytics/cohorts`),
        fetch(`/api/marketing-command-center/insights-summary`),
      ]);

      const [trends, campaigns, cohorts, summary] = await Promise.all([
        trendsRes.ok ? trendsRes.json() : [],
        campaignsRes.ok ? campaignsRes.json() : [],
        cohortsRes.ok ? cohortsRes.json() : [],
        summaryRes.ok ? summaryRes.json() : null,
      ]);

      setData({ trends, campaigns, cohorts, summary });
    } catch (err) {
      console.error('Error loading analytics:', err);
    } finally {
      setLoading(false);
    }
  };

  const loadSavedViews = async () => {
    try {
      const res = await fetch('/api/marketing-command-center/saved-views');
      if (res.ok) {
        const views = await res.json();
        setSavedViews(views);
        // Apply default view if exists
        const defaultView = views.find(v => v.is_default);
        if (defaultView?.view_config?.dateRange) {
          setDateRange(defaultView.view_config.dateRange);
        }
      }
    } catch (err) {
      console.error('Error loading saved views:', err);
    }
  };

  const loadSyncStatus = async () => {
    try {
      const res = await fetch('/api/marketing-command-center/sync-status');
      if (res.ok) {
        const status = await res.json();
        setSyncStatus(status);
      }
    } catch (err) {
      console.error('Error loading sync status:', err);
    }
  };

  const triggerSync = async () => {
    setSyncing(true);
    try {
      const res = await fetch('/api/marketing-command-center/trigger-sync', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ platform: 'all', days: 30 }),
      });
      if (res.ok) {
        // Reload data after sync
        await loadSyncStatus();
        await loadAnalyticsData();
      }
    } catch (err) {
      console.error('Error triggering sync:', err);
    } finally {
      setSyncing(false);
    }
  };

  const handleSaveView = async (name, isDefault) => {
    try {
      const res = await fetch('/api/marketing-command-center/saved-views', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name,
          viewConfig: { dateRange },
          isDefault,
        }),
      });
      if (res.ok) {
        loadSavedViews();
        setShowSaveModal(false);
      }
    } catch (err) {
      console.error('Error saving view:', err);
    }
  };

  const handleLoadView = (view) => {
    if (view.view_config?.dateRange) {
      setDateRange(view.view_config.dateRange);
    }
  };

  const handleDeleteView = async (viewId) => {
    try {
      await fetch(`/api/marketing-command-center/saved-views/${viewId}`, {
        method: 'DELETE',
      });
      loadSavedViews();
    } catch (err) {
      console.error('Error deleting view:', err);
    }
  };

  const handleExport = async (type) => {
    setExporting(true);
    try {
      const res = await fetch(`/api/marketing-command-center/export/analytics?range=${dateRange}&type=${type}`);
      if (res.ok) {
        const blob = await res.blob();
        const url = window.URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = res.headers.get('content-disposition')?.split('filename=')[1]?.replace(/"/g, '') || `marketing-${type}.csv`;
        document.body.appendChild(a);
        a.click();
        a.remove();
        window.URL.revokeObjectURL(url);
      }
    } catch (err) {
      console.error('Export error:', err);
    } finally {
      setExporting(false);
    }
  };

  return (
    <div className="p-6 space-y-6">
      {/* Header */}
      <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4">
        <div className="flex items-center gap-3">
          <ChartBarIcon className="h-6 w-6 text-brand-navy" />
          <h2 className="text-lg font-semibold text-neutral-900">Marketing Analytics</h2>
          {isConnected && (
            <span className="flex items-center gap-1 text-xs text-green-600 bg-green-50 px-2 py-1 rounded-full">
              <SignalIcon className="h-3 w-3" />
              Live
            </span>
          )}
          {/* Sync Status Indicator */}
          {syncStatus && (
            <SyncStatusBadge
              lastSync={syncStatus.lastSync}
              totalRecords={syncStatus.totalRecords}
              syncing={syncing}
              onSync={triggerSync}
            />
          )}
        </div>
        <div className="flex items-center gap-3 flex-wrap">
          {/* Saved Views Dropdown */}
          {savedViews.length > 0 && (
            <select
              onChange={(e) => {
                const view = savedViews.find(v => v.id === parseInt(e.target.value));
                if (view) handleLoadView(view);
              }}
              className="text-sm border border-neutral-200 rounded-lg px-3 py-1.5
                       focus:outline-none focus:ring-2 focus:ring-brand-navy/20"
              defaultValue=""
            >
              <option value="" disabled>Load saved view...</option>
              {savedViews.map(v => (
                <option key={v.id} value={v.id}>
                  {v.name} {v.is_default ? '(Default)' : ''}
                </option>
              ))}
            </select>
          )}

          <DateRangeSelector value={dateRange} onChange={setDateRange} />

          {/* Save View Button */}
          <button
            onClick={() => setShowSaveModal(true)}
            className="flex items-center gap-1 text-sm text-neutral-600 hover:text-brand-navy
                     border border-neutral-200 rounded-lg px-3 py-1.5 hover:bg-neutral-50"
          >
            <BookmarkIcon className="h-4 w-4" />
            Save View
          </button>

          {/* Export Dropdown */}
          <div className="relative group">
            <button
              disabled={exporting}
              className="flex items-center gap-1 text-sm text-white bg-brand-navy hover:bg-brand-navy/90
                       rounded-lg px-3 py-1.5 disabled:opacity-50"
            >
              <ArrowDownTrayIcon className="h-4 w-4" />
              {exporting ? 'Exporting...' : 'Export'}
            </button>
            <div className="absolute right-0 top-full mt-1 bg-white border border-neutral-200 rounded-lg shadow-lg
                          hidden group-hover:block min-w-[140px] z-10">
              <button
                onClick={() => handleExport('trends')}
                className="w-full text-left px-4 py-2 text-sm text-neutral-700 hover:bg-neutral-50"
              >
                Trends (CSV)
              </button>
              <button
                onClick={() => handleExport('campaigns')}
                className="w-full text-left px-4 py-2 text-sm text-neutral-700 hover:bg-neutral-50"
              >
                Campaigns (CSV)
              </button>
            </div>
          </div>
        </div>
      </div>

      {/* Save View Modal */}
      {showSaveModal && (
        <SaveViewModal
          onSave={handleSaveView}
          onClose={() => setShowSaveModal(false)}
        />
      )}

      {/* Summary Cards */}
      {data.summary && (
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
          <SummaryCard
            icon={CurrencyDollarIcon}
            label="Total Spend"
            value={`$${parseFloat(data.summary.totalSpend || 0).toLocaleString()}`}
            color="blue"
          />
          <SummaryCard
            icon={UserGroupIcon}
            label="Total Leads"
            value={data.summary.totalLeads || 0}
            color="green"
          />
          <SummaryCard
            icon={ArrowTrendingUpIcon}
            label="ROAS"
            value={`${data.summary.roas || 'N/A'}x`}
            color="purple"
          />
          <SummaryCard
            icon={CurrencyDollarIcon}
            label="CPL"
            value={data.summary.cpl ? `$${data.summary.cpl}` : 'N/A'}
            color="orange"
          />
        </div>
      )}

      {loading ? (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          {[1, 2, 3, 4].map((i) => (
            <div key={i} className="bg-white rounded-xl border border-neutral-200 p-6 animate-pulse">
              <div className="h-4 bg-neutral-200 rounded w-1/3 mb-4" />
              <div className="h-64 bg-neutral-100 rounded" />
            </div>
          ))}
        </div>
      ) : (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          {/* Spend & Leads Trends */}
          <ChartCard title="Spend & Leads Over Time">
            <SpendLeadsTrendChart data={data.trends} />
          </ChartCard>

          {/* ROAS Trend */}
          <ChartCard title="ROAS Trend">
            <ROASTrendChart data={data.trends} />
          </ChartCard>

          {/* Campaign Performance */}
          <ChartCard title="Campaign Performance">
            <CampaignPerformanceChart data={data.campaigns} />
          </ChartCard>

          {/* Cohort Retention */}
          <ChartCard title="Cohort Retention (90-Day)">
            <CohortRetentionChart data={data.cohorts} />
          </ChartCard>

          {/* Platform Spend Distribution */}
          <ChartCard title="Spend by Platform">
            <PlatformSpendChart data={data.campaigns} />
          </ChartCard>

          {/* Conversion Funnel */}
          <ChartCard title="Conversion Funnel">
            <ConversionFunnelChart data={data.summary} />
          </ChartCard>
        </div>
      )}
    </div>
  );
}

// ============================================
// SUB-COMPONENTS
// ============================================

function SyncStatusBadge({ lastSync, totalRecords, syncing, onSync }) {
  const getTimeSinceSync = () => {
    if (!lastSync) return 'Never synced';
    const now = new Date();
    const syncTime = new Date(lastSync);
    const diffMs = now - syncTime;
    const diffMins = Math.floor(diffMs / 60000);
    const diffHours = Math.floor(diffMins / 60);
    const diffDays = Math.floor(diffHours / 24);

    if (diffMins < 60) return `${diffMins}m ago`;
    if (diffHours < 24) return `${diffHours}h ago`;
    return `${diffDays}d ago`;
  };

  const isStale = () => {
    if (!lastSync) return true;
    const now = new Date();
    const syncTime = new Date(lastSync);
    const diffMs = now - syncTime;
    const diffHours = diffMs / (1000 * 60 * 60);
    return diffHours > 24; // Consider stale if > 24 hours
  };

  const stale = isStale();

  return (
    <div className="flex items-center gap-2">
      <div className={`flex items-center gap-1.5 text-xs px-2 py-1 rounded-full ${
        stale ? 'bg-amber-50 text-amber-700' : 'bg-emerald-50 text-emerald-700'
      }`}>
        {stale ? (
          <ExclamationCircleIcon className="h-3 w-3" />
        ) : (
          <CheckCircleIcon className="h-3 w-3" />
        )}
        <ClockIcon className="h-3 w-3" />
        <span>{getTimeSinceSync()}</span>
        {totalRecords > 0 && (
          <span className="text-neutral-400">({totalRecords.toLocaleString()} records)</span>
        )}
      </div>
      <button
        onClick={onSync}
        disabled={syncing}
        className={`flex items-center gap-1 text-xs px-2 py-1 rounded-full transition-colors ${
          syncing
            ? 'bg-neutral-100 text-neutral-400 cursor-not-allowed'
            : 'bg-brand-navy/10 text-brand-navy hover:bg-brand-navy/20'
        }`}
        title="Sync ad data now"
      >
        <ArrowPathIcon className={`h-3 w-3 ${syncing ? 'animate-spin' : ''}`} />
        {syncing ? 'Syncing...' : 'Sync Now'}
      </button>
    </div>
  );
}

function DateRangeSelector({ value, onChange }) {
  const options = [
    { value: 'last_7_days', label: '7 Days' },
    { value: 'last_30_days', label: '30 Days' },
    { value: 'last_90_days', label: '90 Days' },
  ];

  return (
    <div className="flex items-center gap-2">
      <CalendarIcon className="h-4 w-4 text-neutral-400" />
      <select
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="text-sm border border-neutral-200 rounded-lg px-3 py-1.5
                 focus:outline-none focus:ring-2 focus:ring-brand-navy/20"
      >
        {options.map((opt) => (
          <option key={opt.value} value={opt.value}>
            {opt.label}
          </option>
        ))}
      </select>
    </div>
  );
}

function SummaryCard({ icon: Icon, label, value, color }) {
  const colorClasses = {
    blue: 'bg-blue-50 text-blue-600',
    green: 'bg-green-50 text-green-600',
    purple: 'bg-purple-50 text-purple-600',
    orange: 'bg-orange-50 text-orange-600',
  };

  return (
    <div className="bg-white rounded-xl border border-neutral-200 p-4">
      <div className="flex items-center gap-2 mb-2">
        <div className={`p-1.5 rounded-lg ${colorClasses[color]}`}>
          <Icon className="h-4 w-4" />
        </div>
        <span className="text-sm text-neutral-500">{label}</span>
      </div>
      <p className="text-2xl font-semibold text-neutral-900">{value}</p>
    </div>
  );
}

function ChartCard({ title, children }) {
  return (
    <div className="bg-white rounded-xl border border-neutral-200 p-6">
      <h3 className="text-sm font-semibold text-neutral-700 mb-4">{title}</h3>
      <div className="h-64">{children}</div>
    </div>
  );
}

// ============================================
// CHART COMPONENTS
// ============================================

function SpendLeadsTrendChart({ data }) {
  if (!data || data.length === 0) {
    return <EmptyState message="No trend data available" />;
  }

  const chartData = data.map((d) => ({
    date: formatDate(d.date),
    spend: parseFloat(d.spend || 0),
    leads: parseInt(d.leads || 0),
  }));

  return (
    <ResponsiveContainer width="100%" height="100%">
      <AreaChart data={chartData} margin={{ top: 5, right: 20, left: 0, bottom: 5 }}>
        <CartesianGrid strokeDasharray="3 3" vertical={false} />
        <XAxis dataKey="date" tick={{ fontSize: 11 }} tickLine={false} axisLine={false} />
        <YAxis yAxisId="left" tick={{ fontSize: 11 }} tickLine={false} axisLine={false}
               tickFormatter={(v) => `$${v}`} />
        <YAxis yAxisId="right" orientation="right" tick={{ fontSize: 11 }}
               tickLine={false} axisLine={false} />
        <Tooltip content={<CustomTooltip />} />
        <Legend />
        <Area yAxisId="left" type="monotone" dataKey="spend" name="Spend"
              stroke="#3B82F6" fill="#3B82F6" fillOpacity={0.1} />
        <Area yAxisId="right" type="monotone" dataKey="leads" name="Leads"
              stroke="#10B981" fill="#10B981" fillOpacity={0.1} />
      </AreaChart>
    </ResponsiveContainer>
  );
}

function ROASTrendChart({ data }) {
  if (!data || data.length === 0) {
    return <EmptyState message="No ROAS data available" />;
  }

  const chartData = data.map((d) => ({
    date: formatDate(d.date),
    roas: parseFloat(d.roas || 0),
  }));

  return (
    <ResponsiveContainer width="100%" height="100%">
      <LineChart data={chartData} margin={{ top: 5, right: 20, left: 0, bottom: 5 }}>
        <CartesianGrid strokeDasharray="3 3" vertical={false} />
        <XAxis dataKey="date" tick={{ fontSize: 11 }} tickLine={false} axisLine={false} />
        <YAxis tick={{ fontSize: 11 }} tickLine={false} axisLine={false}
               tickFormatter={(v) => `${v}x`} />
        <Tooltip content={<CustomTooltip suffix="x" />} />
        <Line type="monotone" dataKey="roas" name="ROAS" stroke="#8B5CF6"
              strokeWidth={2} dot={{ r: 3 }} />
      </LineChart>
    </ResponsiveContainer>
  );
}

function CampaignPerformanceChart({ data }) {
  if (!data || data.length === 0) {
    return <EmptyState message="No campaign data available" />;
  }

  const chartData = data.slice(0, 8).map((c) => ({
    name: truncate(c.campaign_name || c.name, 15),
    spend: parseFloat(c.spend || 0),
    revenue: parseFloat(c.revenue || 0),
  }));

  return (
    <ResponsiveContainer width="100%" height="100%">
      <BarChart data={chartData} margin={{ top: 5, right: 20, left: 0, bottom: 5 }}>
        <CartesianGrid strokeDasharray="3 3" vertical={false} />
        <XAxis dataKey="name" tick={{ fontSize: 10 }} tickLine={false} axisLine={false}
               interval={0} angle={-20} textAnchor="end" height={50} />
        <YAxis tick={{ fontSize: 11 }} tickLine={false} axisLine={false}
               tickFormatter={(v) => `$${v}`} />
        <Tooltip content={<CustomTooltip prefix="$" />} />
        <Legend />
        <Bar dataKey="spend" name="Spend" fill="#3B82F6" radius={[4, 4, 0, 0]} />
        <Bar dataKey="revenue" name="Revenue" fill="#10B981" radius={[4, 4, 0, 0]} />
      </BarChart>
    </ResponsiveContainer>
  );
}

function CohortRetentionChart({ data }) {
  if (!data || data.length === 0) {
    return <EmptyState message="No cohort data available" />;
  }

  const chartData = data.map((c) => ({
    cohort: formatCohort(c.cohort_month),
    size: parseInt(c.cohort_size || 0),
    retention: parseFloat(c.retention_rate || 0),
  })).reverse();

  return (
    <ResponsiveContainer width="100%" height="100%">
      <BarChart data={chartData} margin={{ top: 5, right: 20, left: 0, bottom: 5 }}>
        <CartesianGrid strokeDasharray="3 3" vertical={false} />
        <XAxis dataKey="cohort" tick={{ fontSize: 11 }} tickLine={false} axisLine={false} />
        <YAxis tick={{ fontSize: 11 }} tickLine={false} axisLine={false}
               tickFormatter={(v) => `${v}%`} domain={[0, 100]} />
        <Tooltip content={<RetentionTooltip />} />
        <Bar dataKey="retention" name="Retention %" fill="#8B5CF6" radius={[4, 4, 0, 0]}>
          {chartData.map((entry, index) => (
            <Cell key={`cell-${index}`} fill={getRetentionColor(entry.retention)} />
          ))}
        </Bar>
      </BarChart>
    </ResponsiveContainer>
  );
}

function PlatformSpendChart({ data }) {
  if (!data || data.length === 0) {
    return <EmptyState message="No platform data available" />;
  }

  // Aggregate by platform
  const platformMap = {};
  data.forEach((c) => {
    const platform = (c.platform || 'other').toLowerCase();
    if (!platformMap[platform]) {
      platformMap[platform] = 0;
    }
    platformMap[platform] += parseFloat(c.spend || 0);
  });

  const chartData = Object.entries(platformMap).map(([name, value]) => ({
    name: name.charAt(0).toUpperCase() + name.slice(1),
    value: Math.round(value),
  }));

  const COLORS = {
    Meta: '#3B82F6',
    Google: '#10B981',
    Klaviyo: '#8B5CF6',
    Tiktok: '#EC4899',
    Linkedin: '#0EA5E9',
    Other: '#6B7280',
  };

  return (
    <ResponsiveContainer width="100%" height="100%">
      <PieChart>
        <Pie
          data={chartData}
          cx="50%"
          cy="50%"
          innerRadius={50}
          outerRadius={80}
          paddingAngle={2}
          dataKey="value"
          label={({ name, percent }) => `${name} ${(percent * 100).toFixed(0)}%`}
          labelLine={{ strokeWidth: 1 }}
        >
          {chartData.map((entry, index) => (
            <Cell key={`cell-${index}`} fill={COLORS[entry.name] || COLORS.Other} />
          ))}
        </Pie>
        <Tooltip formatter={(value) => [`$${value.toLocaleString()}`, 'Spend']} />
      </PieChart>
    </ResponsiveContainer>
  );
}

function ConversionFunnelChart({ data }) {
  if (!data) {
    return <EmptyState message="No funnel data available" />;
  }

  const funnelData = [
    { name: 'Leads', value: parseInt(data.totalLeads || 0), fill: '#3B82F6' },
    { name: 'Trials', value: parseInt(data.trialBookings || data.totalLeads * 0.3 || 0), fill: '#8B5CF6' },
    { name: 'Conversions', value: parseInt(data.registrations || data.totalLeads * 0.1 || 0), fill: '#10B981' },
  ].filter(d => d.value > 0);

  if (funnelData.length === 0) {
    return <EmptyState message="No funnel data available" />;
  }

  return (
    <ResponsiveContainer width="100%" height="100%">
      <BarChart data={funnelData} layout="vertical" margin={{ top: 5, right: 30, left: 60, bottom: 5 }}>
        <CartesianGrid strokeDasharray="3 3" horizontal={false} />
        <XAxis type="number" tick={{ fontSize: 11 }} tickLine={false} axisLine={false} />
        <YAxis dataKey="name" type="category" tick={{ fontSize: 11 }} tickLine={false} axisLine={false} />
        <Tooltip formatter={(value) => [value.toLocaleString(), 'Count']} />
        <Bar dataKey="value" radius={[0, 4, 4, 0]}>
          {funnelData.map((entry, index) => (
            <Cell key={`cell-${index}`} fill={entry.fill} />
          ))}
        </Bar>
      </BarChart>
    </ResponsiveContainer>
  );
}

// ============================================
// HELPERS
// ============================================

function CustomTooltip({ active, payload, label, prefix = '', suffix = '' }) {
  if (!active || !payload || payload.length === 0) return null;

  return (
    <div className="bg-white border border-neutral-200 rounded-lg shadow-lg p-3 min-w-[150px]">
      <p className="font-semibold text-neutral-800 mb-2 text-sm">{label}</p>
      <div className="space-y-1">
        {payload.map((entry, index) => (
          <div key={index} className="flex items-center justify-between gap-3">
            <div className="flex items-center gap-2">
              <div className="w-2 h-2 rounded" style={{ backgroundColor: entry.color }} />
              <span className="text-xs text-neutral-600">{entry.name}</span>
            </div>
            <span className="text-xs font-semibold text-neutral-800">
              {prefix}{typeof entry.value === 'number' ? entry.value.toLocaleString() : entry.value}{suffix}
            </span>
          </div>
        ))}
      </div>
    </div>
  );
}

function RetentionTooltip({ active, payload }) {
  if (!active || !payload || payload.length === 0) return null;
  const data = payload[0].payload;

  return (
    <div className="bg-white border border-neutral-200 rounded-lg shadow-lg p-3">
      <p className="font-semibold text-neutral-800 mb-1 text-sm">{data.cohort}</p>
      <p className="text-xs text-neutral-600">Cohort Size: {data.size}</p>
      <p className="text-xs text-neutral-600">Retention: {data.retention.toFixed(1)}%</p>
    </div>
  );
}

function EmptyState({ message }) {
  return (
    <div className="h-full flex items-center justify-center">
      <p className="text-sm text-neutral-400">{message}</p>
    </div>
  );
}

function formatDate(dateStr) {
  if (!dateStr) return '';
  const d = new Date(dateStr);
  return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
}

function formatCohort(dateStr) {
  if (!dateStr) return '';
  const d = new Date(dateStr);
  return d.toLocaleDateString('en-US', { month: 'short', year: '2-digit' });
}

function truncate(str, maxLen) {
  if (!str) return '';
  return str.length > maxLen ? str.substring(0, maxLen) + '...' : str;
}

function getRetentionColor(rate) {
  if (rate >= 50) return '#10B981'; // Green
  if (rate >= 30) return '#F59E0B'; // Amber
  return '#EF4444'; // Red
}

function SaveViewModal({ onSave, onClose }) {
  const [name, setName] = useState('');
  const [isDefault, setIsDefault] = useState(false);

  const handleSubmit = (e) => {
    e.preventDefault();
    if (name.trim()) {
      onSave(name.trim(), isDefault);
    }
  };

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
      <div className="bg-white rounded-xl shadow-xl p-6 w-full max-w-md">
        <h3 className="text-lg font-semibold text-neutral-900 mb-4">Save Current View</h3>
        <form onSubmit={handleSubmit}>
          <div className="space-y-4">
            <div>
              <label className="block text-sm font-medium text-neutral-700 mb-1">
                View Name
              </label>
              <input
                type="text"
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="e.g., Monthly Overview"
                className="w-full border border-neutral-200 rounded-lg px-3 py-2
                         focus:outline-none focus:ring-2 focus:ring-brand-navy/20"
                autoFocus
              />
            </div>
            <label className="flex items-center gap-2">
              <input
                type="checkbox"
                checked={isDefault}
                onChange={(e) => setIsDefault(e.target.checked)}
                className="rounded border-neutral-300 text-brand-navy focus:ring-brand-navy/20"
              />
              <span className="text-sm text-neutral-700">Set as default view</span>
            </label>
          </div>
          <div className="flex justify-end gap-3 mt-6">
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2 text-sm text-neutral-600 hover:bg-neutral-100 rounded-lg"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={!name.trim()}
              className="px-4 py-2 text-sm text-white bg-brand-navy hover:bg-brand-navy/90
                       rounded-lg disabled:opacity-50"
            >
              Save View
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
