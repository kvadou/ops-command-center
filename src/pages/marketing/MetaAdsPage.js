import React, { useState, useEffect, useCallback } from 'react';
import axios from 'axios';
import { useToast } from '../../hooks/useToast';
import { formatCurrency } from '../../utils/formatters';
import {
  PlayIcon,
  PauseIcon,
  ArrowPathIcon,
  ExclamationTriangleIcon,
  CheckCircleIcon,
  XCircleIcon,
  ChevronDownIcon,
  ChevronRightIcon,
  PencilIcon,
  MagnifyingGlassIcon,
  CurrencyDollarIcon,
  ChartBarIcon,
  SparklesIcon,
  LightBulbIcon,
  PlusIcon,
  XMarkIcon,
} from '@heroicons/react/24/outline';

/**
 * MetaAdsPage - Meta (Facebook/Instagram) Ads Manager within Marketing Hub
 *
 * Displays campaigns, ad sets, and ads from Meta Ads Manager.
 * Allows viewing metrics and managing campaign status.
 */
export default function MetaAdsPage() {
  const toast = useToast();
  const [campaigns, setCampaigns] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [status, setStatus] = useState({});
  const [updatingCampaigns, setUpdatingCampaigns] = useState(new Set());
  const [expandedCampaigns, setExpandedCampaigns] = useState(new Set());
  const [expandedAdSets, setExpandedAdSets] = useState(new Set());
  const [campaignAdSets, setCampaignAdSets] = useState({});
  const [adSetAds, setAdSetAds] = useState({});
  const [loadingAdSets, setLoadingAdSets] = useState(new Set());
  const [loadingAds, setLoadingAds] = useState(new Set());
  const [searchQuery, setSearchQuery] = useState('');
  const [metricsLoaded, setMetricsLoaded] = useState(false);
  const [loadingMetrics, setLoadingMetrics] = useState(false);
  const [statusFilter, setStatusFilter] = useState('all');

  // AI Insights state
  const [insights, setInsights] = useState([]);
  const [insightsLoading, setInsightsLoading] = useState(false);
  const [analysisRunning, setAnalysisRunning] = useState(false);
  const [showInsightsPanel, setShowInsightsPanel] = useState(true);

  useEffect(() => {
    fetchStatus();
    fetchCampaigns();
    fetchInsights();
  }, []);

  const fetchInsights = useCallback(async () => {
    setInsightsLoading(true);
    try {
      const response = await axios.get('/api/marketing-command-center/ai-brain/insights', {
        params: { platform: 'meta', status: 'pending' },
        withCredentials: true,
      });
      setInsights(response.data || []);
    } catch (err) {
      console.error('Error fetching insights:', err);
    } finally {
      setInsightsLoading(false);
    }
  }, []);

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

  const fetchStatus = async () => {
    try {
      const response = await axios.get('/api/ads-manager/status');
      setStatus(response.data.meta || {});
    } catch (err) {
      console.error('Error fetching status:', err);
    }
  };

  const fetchCampaigns = async (includeMetrics = false) => {
    setLoading(true);
    setError(null);
    setMetricsLoaded(includeMetrics);
    try {
      const response = await axios.get('/api/ads-manager/campaigns/meta', {
        params: { includeMetrics, useCache: true },
      });
      setCampaigns(response.data.campaigns || []);
      setExpandedCampaigns(new Set());
      setExpandedAdSets(new Set());
      setCampaignAdSets({});
      setAdSetAds({});

      const hasMetrics = response.data.campaigns?.some(c => c.metrics !== null);
      if (hasMetrics) setMetricsLoaded(true);
    } catch (err) {
      console.error('Error fetching Meta campaigns:', err);
      setError(err.response?.data?.message || err.message || 'Failed to fetch campaigns');
    } finally {
      setLoading(false);
    }
  };

  const fetchMetrics = async () => {
    setLoadingMetrics(true);
    try {
      const response = await axios.get('/api/ads-manager/campaigns/meta/metrics');
      const metricsMap = response.data.metrics || {};
      setCampaigns(prev =>
        prev.map(campaign => ({
          ...campaign,
          metrics: metricsMap[campaign.id] || campaign.metrics,
        }))
      );
      setMetricsLoaded(true);
    } catch (err) {
      console.error('Error fetching metrics:', err);
      if (err.response?.status === 429) {
        setError('Rate limit exceeded. Please wait and try again.');
      }
    } finally {
      setLoadingMetrics(false);
    }
  };

  const fetchAdSets = async (campaignId) => {
    if (campaignAdSets[campaignId]) {
      toggleCampaignExpansion(campaignId);
      return;
    }
    setLoadingAdSets(prev => new Set(prev).add(campaignId));
    try {
      const response = await axios.get(`/api/ads-manager/campaigns/meta/${campaignId}/ad-sets`);
      setCampaignAdSets(prev => ({ ...prev, [campaignId]: response.data.adSets || [] }));
      toggleCampaignExpansion(campaignId);
    } catch (err) {
      setError(err.response?.data?.message || 'Failed to fetch ad sets');
    } finally {
      setLoadingAdSets(prev => { const next = new Set(prev); next.delete(campaignId); return next; });
    }
  };

  const fetchAds = async (adSetId) => {
    if (adSetAds[adSetId]) {
      toggleAdSetExpansion(adSetId);
      return;
    }
    setLoadingAds(prev => new Set(prev).add(adSetId));
    try {
      const response = await axios.get(`/api/ads-manager/ad-sets/meta/${adSetId}/ads`);
      setAdSetAds(prev => ({ ...prev, [adSetId]: response.data.ads || [] }));
      toggleAdSetExpansion(adSetId);
    } catch (err) {
      setError(err.response?.data?.message || 'Failed to fetch ads');
    } finally {
      setLoadingAds(prev => { const next = new Set(prev); next.delete(adSetId); return next; });
    }
  };

  const toggleCampaignExpansion = (campaignId) => {
    setExpandedCampaigns(prev => {
      const next = new Set(prev);
      next.has(campaignId) ? next.delete(campaignId) : next.add(campaignId);
      return next;
    });
  };

  const toggleAdSetExpansion = (adSetId) => {
    setExpandedAdSets(prev => {
      const next = new Set(prev);
      next.has(adSetId) ? next.delete(adSetId) : next.add(adSetId);
      return next;
    });
  };

  const updateCampaignStatus = async (campaignId, newStatus) => {
    setUpdatingCampaigns(prev => new Set(prev).add(campaignId));
    try {
      await axios.patch(`/api/ads-manager/campaigns/meta/${campaignId}`, {
        status: newStatus ? 'ACTIVE' : 'PAUSED',
      });
      await fetchCampaigns();
    } catch (err) {
      toast.error(err.response?.data?.message || 'Failed to update campaign');
    } finally {
      setUpdatingCampaigns(prev => { const next = new Set(prev); next.delete(campaignId); return next; });
    }
  };

  const updateAdSetStatus = async (adSetId, newStatus) => {
    setUpdatingCampaigns(prev => new Set(prev).add(`adset-${adSetId}`));
    try {
      await axios.patch(`/api/ads-manager/ad-sets/meta/${adSetId}`, {
        status: newStatus ? 'ACTIVE' : 'PAUSED',
      });
      const campaignId = Object.keys(campaignAdSets).find(id =>
        campaignAdSets[id].some(adSet => adSet.id === adSetId)
      );
      if (campaignId) {
        const response = await axios.get(`/api/ads-manager/campaigns/meta/${campaignId}/ad-sets`);
        setCampaignAdSets(prev => ({ ...prev, [campaignId]: response.data.adSets || [] }));
      }
    } catch (err) {
      toast.error(err.response?.data?.message || 'Failed to update ad set');
    } finally {
      setUpdatingCampaigns(prev => { const next = new Set(prev); next.delete(`adset-${adSetId}`); return next; });
    }
  };

  const formatNumber = (value) => value == null ? 'N/A' : value.toLocaleString();

  const isItemActive = (item) => (item.status || item.effectiveStatus || '').toUpperCase() === 'ACTIVE';

  const getStatusBadge = (item) => {
    const s = (item.status || item.effectiveStatus || '').toUpperCase();
    if (s === 'ACTIVE') return <span className="inline-flex items-center gap-1 px-2 py-1 rounded-full text-xs font-medium bg-green-100 text-green-800"><CheckCircleIcon className="h-3 w-3" />Active</span>;
    if (s === 'PAUSED') return <span className="inline-flex items-center gap-1 px-2 py-1 rounded-full text-xs font-medium bg-yellow-100 text-yellow-800"><PauseIcon className="h-3 w-3" />Paused</span>;
    return <span className="inline-flex items-center gap-1 px-2 py-1 rounded-full text-xs font-medium bg-neutral-100 text-neutral-800">{s}</span>;
  };

  const filteredCampaigns = campaigns.filter(c => {
    const matchesSearch = !searchQuery || c.name.toLowerCase().includes(searchQuery.toLowerCase());
    const matchesStatus = statusFilter === 'all' || (statusFilter === 'active' && isItemActive(c)) || (statusFilter === 'paused' && !isItemActive(c));
    return matchesSearch && matchesStatus;
  });

  const isPlatformEnabled = status.enabled;
  const hasCredentials = status.hasCredentials;

  return (
    <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-6 space-y-6">
      {/* Header */}
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
          <div>
            <h1 className="text-2xl font-bold text-neutral-900">Meta Ads Manager</h1>
            <p className="mt-1 text-sm text-neutral-500">
              Manage your Facebook and Instagram advertising campaigns
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
            {!metricsLoaded && (
              <button
                onClick={fetchMetrics}
                disabled={loadingMetrics || loading}
                className="inline-flex items-center gap-2 px-4 py-2 bg-white border border-brand-purple text-brand-purple rounded-lg text-sm font-medium hover:bg-brand-purple/5 disabled:opacity-50 transition-colors"
              >
                <ChartBarIcon className={`h-4 w-4 ${loadingMetrics && 'animate-pulse'}`} />
                Load Metrics
              </button>
            )}
            <button
              onClick={() => fetchCampaigns(false)}
              disabled={loading}
              className="inline-flex items-center gap-2 px-4 py-2 bg-white border border-neutral-300 rounded-lg text-sm font-medium text-neutral-700 hover:bg-neutral-50 disabled:opacity-50 transition-colors"
            >
              <ArrowPathIcon className={`h-4 w-4 ${loading && 'animate-spin'}`} />
              Refresh
            </button>
          </div>
        </div>

        {/* Status Alerts */}
        {!hasCredentials && (
          <div className="bg-yellow-50 border border-yellow-200 rounded-lg p-4">
            <div className="flex items-start gap-3">
              <ExclamationTriangleIcon className="h-5 w-5 text-yellow-600 mt-0.5" />
              <div>
                <h3 className="text-sm font-medium text-yellow-800">Meta Ads API not configured</h3>
                <p className="mt-1 text-sm text-yellow-700">Configure META_ACCESS_TOKEN and META_AD_ACCOUNT_ID in environment variables.</p>
              </div>
            </div>
          </div>
        )}

        {hasCredentials && !isPlatformEnabled && (
          <div className="bg-yellow-50 border border-yellow-200 rounded-lg p-4">
            <div className="flex items-start gap-3">
              <ExclamationTriangleIcon className="h-5 w-5 text-yellow-600 mt-0.5" />
              <div>
                <h3 className="text-sm font-medium text-yellow-800">Meta Ads API connection issue</h3>
                <p className="mt-1 text-sm text-yellow-700">{status.error || 'Unable to connect. Check credentials.'}</p>
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
                <h3 className="font-semibold text-neutral-900">AI Insights for Meta Ads</h3>
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

        {/* Filters */}
        {isPlatformEnabled && filteredCampaigns.length > 0 && (
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
                <option value="active">Active</option>
                <option value="paused">Paused</option>
              </select>
            </div>
          </div>
        )}

        {/* Campaigns Table */}
        {isPlatformEnabled && (
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
                      <th className="px-6 py-3 text-left text-xs font-medium text-neutral-500 uppercase">Budget</th>
                      <th className="px-6 py-3 text-left text-xs font-medium text-neutral-500 uppercase">Spend (30d)</th>
                      <th className="px-6 py-3 text-left text-xs font-medium text-neutral-500 uppercase">Impressions</th>
                      <th className="px-6 py-3 text-left text-xs font-medium text-neutral-500 uppercase">Clicks</th>
                      <th className="px-6 py-3 text-left text-xs font-medium text-neutral-500 uppercase">CTR</th>
                      <th className="px-6 py-3 text-right text-xs font-medium text-neutral-500 uppercase">Actions</th>
                    </tr>
                  </thead>
                  <tbody className="bg-white divide-y divide-neutral-200">
                    {filteredCampaigns.map((campaign) => {
                      const isActive = isItemActive(campaign);
                      const isUpdating = updatingCampaigns.has(campaign.id);
                      const isExpanded = expandedCampaigns.has(campaign.id);
                      const adSets = campaignAdSets[campaign.id] || [];

                      return (
                        <React.Fragment key={campaign.id}>
                          <tr className="hover:bg-neutral-50">
                            <td className="px-6 py-4">
                              <div className="flex items-center gap-2">
                                <button onClick={() => fetchAdSets(campaign.id)} className="text-neutral-400 hover:text-neutral-600">
                                  {loadingAdSets.has(campaign.id) ? <ArrowPathIcon className="h-4 w-4 animate-spin" /> : isExpanded ? <ChevronDownIcon className="h-4 w-4" /> : <ChevronRightIcon className="h-4 w-4" />}
                                </button>
                                <div>
                                  <div className="text-sm font-medium text-neutral-900">{campaign.name}</div>
                                  <div className="text-xs text-neutral-500">ID: {campaign.id}</div>
                                </div>
                              </div>
                            </td>
                            <td className="px-6 py-4 whitespace-nowrap">{getStatusBadge(campaign)}</td>
                            <td className="px-6 py-4 whitespace-nowrap text-sm text-neutral-900">{formatCurrency(campaign.dailyBudget || campaign.budget)}</td>
                            <td className="px-6 py-4 whitespace-nowrap text-sm text-neutral-900">{campaign.metrics?.spend ? formatCurrency(campaign.metrics.spend) : 'N/A'}</td>
                            <td className="px-6 py-4 whitespace-nowrap text-sm text-neutral-900">{campaign.metrics?.impressions ? formatNumber(campaign.metrics.impressions) : 'N/A'}</td>
                            <td className="px-6 py-4 whitespace-nowrap text-sm text-neutral-900">{campaign.metrics?.clicks ? formatNumber(campaign.metrics.clicks) : 'N/A'}</td>
                            <td className="px-6 py-4 whitespace-nowrap text-sm text-neutral-900">{campaign.metrics?.ctr ? `${campaign.metrics.ctr.toFixed(2)}%` : 'N/A'}</td>
                            <td className="px-6 py-4 whitespace-nowrap text-right">
                              <button
                                onClick={() => updateCampaignStatus(campaign.id, !isActive)}
                                disabled={isUpdating}
                                className={`inline-flex items-center gap-2 px-3 py-1.5 rounded-md text-sm font-medium transition-colors ${
                                  isActive ? 'bg-yellow-100 text-yellow-800 hover:bg-yellow-200' : 'bg-green-100 text-green-800 hover:bg-green-200'
                                } ${isUpdating && 'opacity-50 cursor-not-allowed'}`}
                              >
                                {isUpdating ? <><ArrowPathIcon className="h-4 w-4 animate-spin" />Updating...</> : isActive ? <><PauseIcon className="h-4 w-4" />Pause</> : <><PlayIcon className="h-4 w-4" />Enable</>}
                              </button>
                            </td>
                          </tr>

                          {/* Expanded Ad Sets */}
                          {isExpanded && adSets.map((adSet) => {
                            const isAdSetActive = adSet.status === 'ACTIVE';
                            const isAdSetUpdating = updatingCampaigns.has(`adset-${adSet.id}`);
                            const ads = adSetAds[adSet.id] || [];
                            const isAdSetExpanded = expandedAdSets.has(adSet.id);

                            return (
                              <React.Fragment key={adSet.id}>
                                <tr className="bg-neutral-50 hover:bg-neutral-100">
                                  <td className="px-6 py-3" colSpan={2}>
                                    <div className="flex items-center gap-2 pl-6">
                                      <button onClick={() => adSetAds[adSet.id] ? toggleAdSetExpansion(adSet.id) : fetchAds(adSet.id)} className="text-neutral-400 hover:text-neutral-600">
                                        {loadingAds.has(adSet.id) ? <ArrowPathIcon className="h-4 w-4 animate-spin" /> : isAdSetExpanded ? <ChevronDownIcon className="h-4 w-4" /> : <ChevronRightIcon className="h-4 w-4" />}
                                      </button>
                                      <div>
                                        <div className="text-sm font-medium text-neutral-700">{adSet.name}</div>
                                        <div className="text-xs text-neutral-500">Ad Set ID: {adSet.id}</div>
                                      </div>
                                    </div>
                                  </td>
                                  <td className="px-6 py-3 whitespace-nowrap">{getStatusBadge(adSet)}</td>
                                  <td className="px-6 py-3 whitespace-nowrap text-sm text-neutral-700">{adSet.dailyBudget ? formatCurrency(adSet.dailyBudget) : 'N/A'}</td>
                                  <td colSpan={3}></td>
                                  <td className="px-6 py-3 whitespace-nowrap text-right">
                                    <button
                                      onClick={() => updateAdSetStatus(adSet.id, !isAdSetActive)}
                                      disabled={isAdSetUpdating}
                                      className={`inline-flex items-center gap-2 px-3 py-1.5 rounded-md text-sm font-medium transition-colors ${
                                        isAdSetActive ? 'bg-yellow-100 text-yellow-800 hover:bg-yellow-200' : 'bg-green-100 text-green-800 hover:bg-green-200'
                                      } ${isAdSetUpdating && 'opacity-50 cursor-not-allowed'}`}
                                    >
                                      {isAdSetUpdating ? <><ArrowPathIcon className="h-4 w-4 animate-spin" /></> : isAdSetActive ? <><PauseIcon className="h-4 w-4" />Pause</> : <><PlayIcon className="h-4 w-4" />Enable</>}
                                    </button>
                                  </td>
                                </tr>

                                {/* Expanded Ads */}
                                {isAdSetExpanded && ads.map((ad) => (
                                  <tr key={ad.id} className="bg-neutral-25 hover:bg-neutral-50">
                                    <td className="px-6 py-2" colSpan={2}>
                                      <div className="pl-12">
                                        <div className="text-sm text-neutral-600">{ad.name}</div>
                                        <div className="text-xs text-neutral-400">Ad ID: {ad.id}</div>
                                      </div>
                                    </td>
                                    <td className="px-6 py-2 whitespace-nowrap">{getStatusBadge(ad)}</td>
                                    <td colSpan={5}></td>
                                  </tr>
                                ))}
                              </React.Fragment>
                            );
                          })}
                        </React.Fragment>
                      );
                    })}
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
              {insight.projected_impact.estimated_cpl && (
                <span className="text-neutral-600">
                  Est. CPL: <strong>${insight.projected_impact.estimated_cpl}</strong>
                </span>
              )}
              {insight.projected_impact.estimated_roas && (
                <span className="text-neutral-600">
                  Est. ROAS: <strong>{insight.projected_impact.estimated_roas}x</strong>
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
