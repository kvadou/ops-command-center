import React, { useState, useEffect, useCallback, Fragment } from 'react';
import axios from 'axios';
import { useToast } from '../../hooks/useToast';
import {
  ArrowPathIcon,
  ExclamationTriangleIcon,
  CheckCircleIcon,
  XCircleIcon,
  MagnifyingGlassIcon,
  EnvelopeIcon,
  ClockIcon,
  SparklesIcon,
  LightBulbIcon,
  PlusIcon,
  XMarkIcon,
  ArrowsRightLeftIcon,
  UserGroupIcon,
  ChevronDownIcon,
  ChevronRightIcon,
} from '@heroicons/react/24/outline';

/**
 * KlaviyoPage - Klaviyo Email Campaigns within Marketing Hub
 *
 * Displays email campaigns from Klaviyo.
 * Shows metrics like open rates, click rates, etc.
 */
export default function KlaviyoPage() {
  const toast = useToast();
  const [campaigns, setCampaigns] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [status, setStatus] = useState({});
  const [searchQuery, setSearchQuery] = useState('');
  const [statusFilter, setStatusFilter] = useState('all');
  const [activeTab, setActiveTab] = useState('campaigns');

  // Flows and Lists state
  const [flows, setFlows] = useState([]);
  const [lists, setLists] = useState([]);
  const [flowsLoading, setFlowsLoading] = useState(false);
  const [listsLoading, setListsLoading] = useState(false);
  const [expandedFlows, setExpandedFlows] = useState(new Set());

  // AI Insights state
  const [insights, setInsights] = useState([]);
  const [insightsLoading, setInsightsLoading] = useState(false);
  const [analysisRunning, setAnalysisRunning] = useState(false);
  const [showInsightsPanel, setShowInsightsPanel] = useState(true);
  const [syncing, setSyncing] = useState(false);

  useEffect(() => {
    fetchStatus();
    fetchCampaigns();
    fetchInsights();
    fetchFlows();
    fetchLists();
  }, []);

  const fetchInsights = useCallback(async () => {
    setInsightsLoading(true);
    try {
      const response = await axios.get('/api/marketing-command-center/ai-brain/insights', {
        params: { platform: 'klaviyo', status: 'pending' },
        withCredentials: true,
      });
      setInsights(response.data || []);
    } catch (err) {
      console.error('Error fetching insights:', err);
    } finally {
      setInsightsLoading(false);
    }
  }, []);

  const fetchFlows = async () => {
    setFlowsLoading(true);
    try {
      const response = await axios.get('/api/marketing-command-center/klaviyo/flows', {
        withCredentials: true,
      });
      setFlows(response.data || []);
    } catch (err) {
      console.error('Error fetching flows:', err);
    } finally {
      setFlowsLoading(false);
    }
  };

  const fetchLists = async () => {
    setListsLoading(true);
    try {
      const response = await axios.get('/api/marketing-command-center/klaviyo/lists', {
        withCredentials: true,
      });
      setLists(response.data || []);
    } catch (err) {
      console.error('Error fetching lists:', err);
    } finally {
      setListsLoading(false);
    }
  };

  const handleSyncKlaviyo = async () => {
    setSyncing(true);
    try {
      await axios.post('/api/marketing-command-center/klaviyo/sync', {}, {
        withCredentials: true,
      });
      // Refresh data after sync
      await Promise.all([fetchFlows(), fetchLists()]);
    } catch (err) {
      console.error('Error syncing Klaviyo:', err);
      toast.error('Failed to sync Klaviyo data.');
    } finally {
      setSyncing(false);
    }
  };

  const handleRunAnalysis = async () => {
    setAnalysisRunning(true);
    try {
      await axios.post('/api/marketing-command-center/ai-brain/analyze', {}, {
        withCredentials: true,
      });
      await fetchInsights();
    } catch (err) {
      console.error('Error running analysis:', err);
      toast.error('Failed to run AI analysis. Please try again.');
    } finally {
      setAnalysisRunning(false);
    }
  };

  const handleAddToQueue = async (insightId) => {
    try {
      await axios.post(`/api/marketing-command-center/ai-brain/insights/${insightId}/to-draft`, {}, {
        withCredentials: true,
      });
      setInsights(prev => prev.filter(i => i.id !== insightId));
    } catch (err) {
      console.error('Error adding to queue:', err);
      toast.error('Failed to add insight to queue.');
    }
  };

  const handleDismissInsight = async (insightId) => {
    try {
      await axios.post(`/api/marketing-command-center/ai-brain/insights/${insightId}/dismiss`, {}, {
        withCredentials: true,
      });
      setInsights(prev => prev.filter(i => i.id !== insightId));
    } catch (err) {
      console.error('Error dismissing insight:', err);
      toast.error('Failed to dismiss insight.');
    }
  };

  const toggleFlowExpansion = (flowId) => {
    setExpandedFlows(prev => {
      const next = new Set(prev);
      next.has(flowId) ? next.delete(flowId) : next.add(flowId);
      return next;
    });
  };

  const fetchStatus = async () => {
    try {
      const response = await axios.get('/api/ads-manager/status', { withCredentials: true });
      setStatus(response.data.klaviyo || {});
    } catch (err) {
      console.error('Error fetching status:', err);
      // Set a default status indicating the issue
      setStatus({ enabled: false, hasCredentials: false, error: 'Unable to fetch status' });
    }
  };

  const fetchCampaigns = async () => {
    setLoading(true);
    setError(null);
    try {
      const response = await axios.get('/api/ads-manager/campaigns/klaviyo', {
        params: { useCache: true },
        withCredentials: true,
      });
      setCampaigns(response.data.campaigns || []);
    } catch (err) {
      console.error('Error fetching Klaviyo campaigns:', err);
      const statusCode = err.response?.status;
      if (statusCode === 401) {
        setError('Authentication required. Please ensure you are logged in.');
      } else if (statusCode === 500) {
        setError('Klaviyo API not configured or connection failed. Check KLAVIYO_API_KEY in environment variables.');
        setStatus(prev => ({ ...prev, enabled: false, hasCredentials: false }));
      } else {
        setError(err.response?.data?.message || err.message || 'Failed to fetch campaigns');
      }
    } finally {
      setLoading(false);
    }
  };

  const formatNumber = (value) => value == null ? 'N/A' : value.toLocaleString();
  const formatPercent = (value) => value == null ? 'N/A' : `${(value * 100).toFixed(1)}%`;

  const getStatusBadge = (item) => {
    const s = (item.status || '').toLowerCase();
    if (s === 'sent') return <span className="inline-flex items-center gap-1 px-2 py-1 rounded-full text-xs font-medium bg-green-100 text-green-800"><CheckCircleIcon className="h-3 w-3" />Sent</span>;
    if (s === 'scheduled' || s === 'draft') return <span className="inline-flex items-center gap-1 px-2 py-1 rounded-full text-xs font-medium bg-blue-100 text-blue-800"><ClockIcon className="h-3 w-3" />Scheduled</span>;
    if (s === 'canceled') return <span className="inline-flex items-center gap-1 px-2 py-1 rounded-full text-xs font-medium bg-neutral-100 text-neutral-800">Canceled</span>;
    return <span className="inline-flex items-center gap-1 px-2 py-1 rounded-full text-xs font-medium bg-neutral-100 text-neutral-800">{s || 'Unknown'}</span>;
  };

  const filteredCampaigns = campaigns.filter(c => {
    const matchesSearch = !searchQuery || c.name.toLowerCase().includes(searchQuery.toLowerCase());
    const status = (c.status || '').toLowerCase();
    const matchesStatus = statusFilter === 'all' ||
      (statusFilter === 'sent' && status === 'sent') ||
      (statusFilter === 'scheduled' && (status === 'scheduled' || status === 'draft'));
    return matchesSearch && matchesStatus;
  });

  const isPlatformEnabled = status.enabled;
  const hasCredentials = status.hasCredentials;

  return (
    <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-6 space-y-6">
      {/* Header */}
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
          <div>
            <h1 className="text-2xl font-bold text-neutral-900">Klaviyo Campaigns</h1>
            <p className="mt-1 text-sm text-neutral-500">
              Manage your email marketing campaigns and view performance metrics
            </p>
          </div>
          <div className="flex items-center gap-2">
            <button
              onClick={handleRunAnalysis}
              disabled={analysisRunning}
              className="inline-flex items-center gap-2 px-4 py-2 bg-brand-purple text-white rounded-lg text-sm font-medium hover:bg-primary-700 disabled:opacity-50 transition-colors"
            >
              <SparklesIcon className={`h-4 w-4 ${analysisRunning && 'animate-pulse'}`} />
              {analysisRunning ? 'Analyzing...' : 'Run AI Analysis'}
            </button>
            <button
              onClick={handleSyncKlaviyo}
              disabled={syncing}
              className="inline-flex items-center gap-2 px-4 py-2 bg-white border border-brand-purple text-brand-purple rounded-lg text-sm font-medium hover:bg-brand-purple/5 disabled:opacity-50 transition-colors"
            >
              <ArrowsRightLeftIcon className={`h-4 w-4 ${syncing && 'animate-spin'}`} />
              {syncing ? 'Syncing...' : 'Sync Data'}
            </button>
            <a
              href="https://www.klaviyo.com/campaigns"
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-2 px-4 py-2 bg-white border border-neutral-300 rounded-lg text-sm font-medium text-neutral-700 hover:bg-neutral-50 transition-colors"
            >
              <EnvelopeIcon className="h-4 w-4" />
              Open Klaviyo
            </a>
            <button
              onClick={fetchCampaigns}
              disabled={loading}
              className="inline-flex items-center gap-2 px-3 py-2 bg-white border border-neutral-300 rounded-lg text-sm font-medium text-neutral-700 hover:bg-neutral-50 disabled:opacity-50 transition-colors"
            >
              <ArrowPathIcon className={`h-4 w-4 ${loading && 'animate-spin'}`} />
            </button>
          </div>
        </div>

        {/* Status Alerts */}
        {!hasCredentials && (
          <div className="bg-yellow-50 border border-yellow-200 rounded-lg p-4">
            <div className="flex items-start gap-3">
              <ExclamationTriangleIcon className="h-5 w-5 text-yellow-600 mt-0.5" />
              <div>
                <h3 className="text-sm font-medium text-yellow-800">Klaviyo API not configured</h3>
                <p className="mt-1 text-sm text-yellow-700">Configure KLAVIYO_API_KEY environment variable to connect to Klaviyo.</p>
              </div>
            </div>
          </div>
        )}

        {hasCredentials && !isPlatformEnabled && (
          <div className="bg-yellow-50 border border-yellow-200 rounded-lg p-4">
            <div className="flex items-start gap-3">
              <ExclamationTriangleIcon className="h-5 w-5 text-yellow-600 mt-0.5" />
              <div>
                <h3 className="text-sm font-medium text-yellow-800">Klaviyo API connection issue</h3>
                <p className="mt-1 text-sm text-yellow-700">{status.error || 'Unable to connect. Check API key.'}</p>
              </div>
            </div>
          </div>
        )}

        {error && (
          <div className="bg-red-50 border border-red-200 rounded-lg p-4">
            <div className="flex items-start gap-3">
              <XCircleIcon className="h-5 w-5 text-red-600 mt-0.5" />
              <div>
                <h3 className="text-sm font-medium text-red-800">Error</h3>
                <p className="mt-1 text-sm text-red-700">{error}</p>
              </div>
            </div>
          </div>
        )}

        {/* AI Insights Panel */}
        {showInsightsPanel && (
          <div className="bg-gradient-to-r from-brand-purple/5 to-violet-50 rounded-xl border border-brand-purple/20 overflow-hidden">
            <div className="px-4 py-3 border-b border-brand-purple/10 flex items-center justify-between">
              <div className="flex items-center gap-2">
                <SparklesIcon className="h-5 w-5 text-brand-purple" />
                <h3 className="font-semibold text-neutral-900">AI Insights for Klaviyo</h3>
                {insights.length > 0 && (
                  <span className="px-2 py-0.5 bg-brand-purple text-white text-xs font-medium rounded-full">
                    {insights.length}
                  </span>
                )}
              </div>
              <button
                onClick={() => setShowInsightsPanel(false)}
                className="text-neutral-400 hover:text-neutral-600"
              >
                <XMarkIcon className="h-5 w-5" />
              </button>
            </div>

            <div className="p-4">
              {insightsLoading ? (
                <div className="text-center py-6">
                  <ArrowPathIcon className="h-6 w-6 animate-spin text-brand-purple mx-auto" />
                  <p className="mt-2 text-sm text-neutral-500">Loading insights...</p>
                </div>
              ) : insights.length === 0 ? (
                <div className="text-center py-6">
                  <LightBulbIcon className="h-8 w-8 text-neutral-300 mx-auto" />
                  <p className="mt-2 text-sm text-neutral-500">No pending insights</p>
                  <p className="text-xs text-neutral-400 mt-1">
                    Click "Run AI Analysis" to generate new recommendations
                  </p>
                </div>
              ) : (
                <div className="space-y-3">
                  {insights.slice(0, 5).map((insight) => (
                    <InsightCard
                      key={insight.id}
                      insight={insight}
                      onAddToQueue={() => handleAddToQueue(insight.id)}
                      onDismiss={() => handleDismissInsight(insight.id)}
                    />
                  ))}
                  {insights.length > 5 && (
                    <p className="text-sm text-center text-neutral-500">
                      +{insights.length - 5} more insights
                    </p>
                  )}
                </div>
              )}
            </div>
          </div>
        )}

        {!showInsightsPanel && (
          <button
            onClick={() => setShowInsightsPanel(true)}
            className="flex items-center gap-2 px-4 py-2 text-sm font-medium text-brand-purple bg-brand-purple/10 rounded-lg hover:bg-brand-purple/20 transition-colors"
          >
            <SparklesIcon className="h-4 w-4" />
            Show AI Insights {insights.length > 0 && `(${insights.length})`}
          </button>
        )}

        {/* Tabs */}
        <div className="border-b border-neutral-200">
          <nav className="flex gap-6">
            {[
              { id: 'campaigns', label: 'Campaigns', icon: EnvelopeIcon },
              { id: 'flows', label: 'Flows', icon: ArrowsRightLeftIcon },
              { id: 'lists', label: 'Audiences', icon: UserGroupIcon },
            ].map(tab => (
              <button
                key={tab.id}
                onClick={() => setActiveTab(tab.id)}
                className={`flex items-center gap-2 pb-3 text-sm font-medium border-b-2 transition-colors ${
                  activeTab === tab.id
                    ? 'border-brand-purple text-brand-purple'
                    : 'border-transparent text-neutral-500 hover:text-neutral-700'
                }`}
              >
                <tab.icon className="h-4 w-4" />
                {tab.label}
              </button>
            ))}
          </nav>
        </div>

        {/* Filters */}
        {isPlatformEnabled && activeTab === 'campaigns' && filteredCampaigns.length > 0 && (
          <div className="bg-white rounded-lg border border-neutral-200 p-4">
            <div className="flex flex-col sm:flex-row gap-4">
              <div className="flex-1 relative">
                <MagnifyingGlassIcon className="absolute left-3 top-1/2 transform -translate-y-1/2 h-5 w-5 text-neutral-400" />
                <input
                  type="text"
                  placeholder="Search campaigns..."
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  className="w-full pl-10 pr-4 py-2 border border-neutral-300 rounded-lg text-sm focus:ring-2 focus:ring-brand-purple focus:border-transparent"
                />
              </div>
              <select
                value={statusFilter}
                onChange={(e) => setStatusFilter(e.target.value)}
                className="px-4 py-2 border border-neutral-300 rounded-lg text-sm focus:ring-2 focus:ring-brand-purple focus:border-transparent"
              >
                <option value="all">All Status</option>
                <option value="sent">Sent</option>
                <option value="scheduled">Scheduled</option>
              </select>
            </div>
          </div>
        )}

        {/* Campaigns Table */}
        {isPlatformEnabled && activeTab === 'campaigns' && (
          <div className="bg-white rounded-xl shadow-sm border border-neutral-200 overflow-hidden">
            {loading ? (
              <div className="p-12 text-center">
                <ArrowPathIcon className="h-8 w-8 animate-spin text-brand-purple mx-auto" />
                <p className="mt-4 text-sm text-neutral-600">Loading campaigns...</p>
              </div>
            ) : filteredCampaigns.length === 0 ? (
              <div className="p-12 text-center">
                <p className="text-sm text-neutral-600">No campaigns found.</p>
              </div>
            ) : (
              <div className="overflow-x-auto">
                <table className="min-w-full divide-y divide-neutral-200">
                  <thead className="bg-neutral-50">
                    <tr>
                      <th className="px-6 py-3 text-left text-xs font-medium text-neutral-500 uppercase">Campaign</th>
                      <th className="px-6 py-3 text-left text-xs font-medium text-neutral-500 uppercase">Status</th>
                      <th className="px-6 py-3 text-left text-xs font-medium text-neutral-500 uppercase">Channel</th>
                      <th className="px-6 py-3 text-left text-xs font-medium text-neutral-500 uppercase">Sent</th>
                      <th className="px-6 py-3 text-left text-xs font-medium text-neutral-500 uppercase">Opens</th>
                      <th className="px-6 py-3 text-left text-xs font-medium text-neutral-500 uppercase">Open Rate</th>
                      <th className="px-6 py-3 text-left text-xs font-medium text-neutral-500 uppercase">Clicks</th>
                      <th className="px-6 py-3 text-left text-xs font-medium text-neutral-500 uppercase">Click Rate</th>
                    </tr>
                  </thead>
                  <tbody className="bg-white divide-y divide-neutral-200">
                    {filteredCampaigns.map((campaign) => (
                      <tr key={campaign.id} className="hover:bg-neutral-50">
                        <td className="px-6 py-4">
                          <div className="text-sm font-medium text-neutral-900">{campaign.name}</div>
                          <div className="text-xs text-neutral-500">ID: {campaign.id}</div>
                        </td>
                        <td className="px-6 py-4 whitespace-nowrap">{getStatusBadge(campaign)}</td>
                        <td className="px-6 py-4 whitespace-nowrap text-sm text-neutral-900 capitalize">{campaign.channel || 'email'}</td>
                        <td className="px-6 py-4 whitespace-nowrap text-sm text-neutral-900">{campaign.metrics?.sent ? formatNumber(campaign.metrics.sent) : 'N/A'}</td>
                        <td className="px-6 py-4 whitespace-nowrap text-sm text-neutral-900">{campaign.metrics?.uniqueOpens ? formatNumber(campaign.metrics.uniqueOpens) : 'N/A'}</td>
                        <td className="px-6 py-4 whitespace-nowrap text-sm text-neutral-900">{campaign.metrics?.openRate ? formatPercent(campaign.metrics.openRate) : 'N/A'}</td>
                        <td className="px-6 py-4 whitespace-nowrap text-sm text-neutral-900">{campaign.metrics?.uniqueClicks ? formatNumber(campaign.metrics.uniqueClicks) : 'N/A'}</td>
                        <td className="px-6 py-4 whitespace-nowrap text-sm text-neutral-900">{campaign.metrics?.clickRate ? formatPercent(campaign.metrics.clickRate) : 'N/A'}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        )}

        {/* Flows Table */}
        {isPlatformEnabled && activeTab === 'flows' && (
          <div className="bg-white rounded-xl shadow-sm border border-neutral-200 overflow-hidden">
            {flowsLoading ? (
              <div className="p-12 text-center">
                <ArrowPathIcon className="h-8 w-8 animate-spin text-brand-purple mx-auto" />
                <p className="mt-4 text-sm text-neutral-600">Loading flows...</p>
              </div>
            ) : flows.length === 0 ? (
              <div className="p-12 text-center">
                <ArrowsRightLeftIcon className="h-12 w-12 text-neutral-300 mx-auto mb-4" />
                <p className="text-sm text-neutral-600">No flows synced yet.</p>
                <p className="text-xs text-neutral-500 mt-1">Click "Sync Data" to pull flows from Klaviyo.</p>
              </div>
            ) : (
              <div className="overflow-x-auto">
                <table className="min-w-full divide-y divide-neutral-200">
                  <thead className="bg-neutral-50">
                    <tr>
                      <th className="px-6 py-3 text-left text-xs font-medium text-neutral-500 uppercase">Flow</th>
                      <th className="px-6 py-3 text-left text-xs font-medium text-neutral-500 uppercase">Status</th>
                      <th className="px-6 py-3 text-left text-xs font-medium text-neutral-500 uppercase">Trigger</th>
                      <th className="px-6 py-3 text-left text-xs font-medium text-neutral-500 uppercase">Emails</th>
                      <th className="px-6 py-3 text-left text-xs font-medium text-neutral-500 uppercase">Last Synced</th>
                    </tr>
                  </thead>
                  <tbody className="bg-white divide-y divide-neutral-200">
                    {flows.map((flow) => {
                      const isExpanded = expandedFlows.has(flow.id);
                      return (
                        <React.Fragment key={flow.id}>
                          <tr className="hover:bg-neutral-50">
                            <td className="px-6 py-4">
                              <div className="flex items-center gap-2">
                                {flow.emails?.length > 0 && (
                                  <button
                                    onClick={() => toggleFlowExpansion(flow.id)}
                                    className="text-neutral-400 hover:text-neutral-600"
                                  >
                                    {isExpanded ? (
                                      <ChevronDownIcon className="h-4 w-4" />
                                    ) : (
                                      <ChevronRightIcon className="h-4 w-4" />
                                    )}
                                  </button>
                                )}
                                <div>
                                  <div className="text-sm font-medium text-neutral-900">{flow.name}</div>
                                  <div className="text-xs text-neutral-500">ID: {flow.id}</div>
                                </div>
                              </div>
                            </td>
                            <td className="px-6 py-4 whitespace-nowrap">
                              <span className={`inline-flex items-center gap-1 px-2 py-1 rounded-full text-xs font-medium ${
                                flow.status === 'live' ? 'bg-green-100 text-green-800' :
                                flow.status === 'draft' ? 'bg-yellow-100 text-yellow-800' :
                                'bg-neutral-100 text-neutral-800'
                              }`}>
                                {flow.status === 'live' && <CheckCircleIcon className="h-3 w-3" />}
                                {flow.status || 'Unknown'}
                              </span>
                            </td>
                            <td className="px-6 py-4 whitespace-nowrap text-sm text-neutral-900 capitalize">
                              {flow.trigger_type?.replace(/_/g, ' ') || 'N/A'}
                            </td>
                            <td className="px-6 py-4 whitespace-nowrap text-sm text-neutral-900">
                              {flow.emails?.length || 0}
                            </td>
                            <td className="px-6 py-4 whitespace-nowrap text-sm text-neutral-500">
                              {flow.last_synced_at ? new Date(flow.last_synced_at).toLocaleDateString() : 'Never'}
                            </td>
                          </tr>
                          {/* Expanded Flow Emails */}
                          {isExpanded && flow.emails?.map((email) => (
                            <tr key={email.klaviyo_email_id} className="bg-neutral-50">
                              <td className="px-6 py-3 pl-14" colSpan={2}>
                                <div className="text-sm text-neutral-700">{email.subject || 'No subject'}</div>
                                {email.preview_text && (
                                  <div className="text-xs text-neutral-500 mt-0.5">{email.preview_text}</div>
                                )}
                              </td>
                              <td className="px-6 py-3 whitespace-nowrap text-sm text-neutral-500">
                                Step {email.position_in_flow || '?'}
                              </td>
                              <td colSpan={2}></td>
                            </tr>
                          ))}
                        </React.Fragment>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        )}

        {/* Lists Table */}
        {isPlatformEnabled && activeTab === 'lists' && (
          <div className="bg-white rounded-xl shadow-sm border border-neutral-200 overflow-hidden">
            {listsLoading ? (
              <div className="p-12 text-center">
                <ArrowPathIcon className="h-8 w-8 animate-spin text-brand-purple mx-auto" />
                <p className="mt-4 text-sm text-neutral-600">Loading lists...</p>
              </div>
            ) : lists.length === 0 ? (
              <div className="p-12 text-center">
                <UserGroupIcon className="h-12 w-12 text-neutral-300 mx-auto mb-4" />
                <p className="text-sm text-neutral-600">No lists synced yet.</p>
                <p className="text-xs text-neutral-500 mt-1">Click "Sync Data" to pull lists from Klaviyo.</p>
              </div>
            ) : (
              <div className="overflow-x-auto">
                <table className="min-w-full divide-y divide-neutral-200">
                  <thead className="bg-neutral-50">
                    <tr>
                      <th className="px-6 py-3 text-left text-xs font-medium text-neutral-500 uppercase">List Name</th>
                      <th className="px-6 py-3 text-left text-xs font-medium text-neutral-500 uppercase">Type</th>
                      <th className="px-6 py-3 text-left text-xs font-medium text-neutral-500 uppercase">Subscribers</th>
                      <th className="px-6 py-3 text-left text-xs font-medium text-neutral-500 uppercase">Created</th>
                      <th className="px-6 py-3 text-left text-xs font-medium text-neutral-500 uppercase">Last Synced</th>
                    </tr>
                  </thead>
                  <tbody className="bg-white divide-y divide-neutral-200">
                    {lists.map((list) => (
                      <tr key={list.id} className="hover:bg-neutral-50">
                        <td className="px-6 py-4">
                          <div className="text-sm font-medium text-neutral-900">{list.name}</div>
                          <div className="text-xs text-neutral-500">ID: {list.id}</div>
                        </td>
                        <td className="px-6 py-4 whitespace-nowrap">
                          <span className={`inline-flex items-center px-2 py-1 rounded-full text-xs font-medium ${
                            list.list_type === 'segment' ? 'bg-blue-100 text-blue-800' : 'bg-purple-100 text-purple-800'
                          }`}>
                            {list.list_type || 'list'}
                          </span>
                        </td>
                        <td className="px-6 py-4 whitespace-nowrap text-sm text-neutral-900">
                          {list.profile_count ? formatNumber(list.profile_count) : 'N/A'}
                        </td>
                        <td className="px-6 py-4 whitespace-nowrap text-sm text-neutral-500">
                          {list.created_at ? new Date(list.created_at).toLocaleDateString() : 'N/A'}
                        </td>
                        <td className="px-6 py-4 whitespace-nowrap text-sm text-neutral-500">
                          {list.last_synced_at ? new Date(list.last_synced_at).toLocaleDateString() : 'Never'}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        )}
      </div>
  );
}

// InsightCard component for displaying AI insights
function InsightCard({ insight, onAddToQueue, onDismiss }) {
  const priorityColors = {
    critical: 'border-l-red-500 bg-red-50',
    high: 'border-l-orange-500 bg-orange-50',
    medium: 'border-l-yellow-500 bg-yellow-50',
    low: 'border-l-blue-500 bg-blue-50',
  };

  const priorityLabels = {
    critical: { text: 'Critical', color: 'bg-red-100 text-red-700' },
    high: { text: 'High', color: 'bg-orange-100 text-orange-700' },
    medium: { text: 'Medium', color: 'bg-yellow-100 text-yellow-700' },
    low: { text: 'Low', color: 'bg-blue-100 text-blue-700' },
  };

  const priority = priorityLabels[insight.priority] || priorityLabels.medium;

  return (
    <div className={`border-l-4 rounded-lg p-4 ${priorityColors[insight.priority] || priorityColors.medium}`}>
      <div className="flex items-start justify-between gap-3">
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 mb-1">
            <span className={`px-2 py-0.5 text-xs font-medium rounded-full ${priority.color}`}>
              {priority.text}
            </span>
            <span className="text-xs text-neutral-500 uppercase">
              {insight.insight_type?.replace(/_/g, ' ')}
            </span>
          </div>
          <h4 className="font-medium text-neutral-900 text-sm">{insight.title}</h4>
          <p className="text-xs text-neutral-600 mt-1 line-clamp-2">{insight.recommendation}</p>

          {/* Projected Impact */}
          {insight.projected_impact && (
            <div className="flex gap-3 mt-2 text-xs">
              {insight.projected_impact.estimated_open_rate && (
                <span className="text-neutral-600">
                  Est. Open Rate: <strong>{insight.projected_impact.estimated_open_rate}%</strong>
                </span>
              )}
              {insight.projected_impact.estimated_click_rate && (
                <span className="text-neutral-600">
                  Est. Click Rate: <strong>{insight.projected_impact.estimated_click_rate}%</strong>
                </span>
              )}
            </div>
          )}
        </div>

        <div className="flex items-center gap-1 flex-shrink-0">
          <button
            onClick={onAddToQueue}
            className="p-1.5 text-brand-purple hover:bg-brand-purple/10 rounded-lg transition-colors"
            title="Add to draft queue"
          >
            <PlusIcon className="h-4 w-4" />
          </button>
          <button
            onClick={onDismiss}
            className="p-1.5 text-neutral-400 hover:bg-neutral-100 rounded-lg transition-colors"
            title="Dismiss"
          >
            <XMarkIcon className="h-4 w-4" />
          </button>
        </div>
      </div>
    </div>
  );
}
