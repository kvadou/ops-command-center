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
  MagnifyingGlassIcon,
  SparklesIcon,
  LightBulbIcon,
  PlusIcon,
  XMarkIcon,
  ChevronRightIcon,
  PencilIcon,
  CurrencyDollarIcon,
  CalendarIcon,
  ChartBarIcon,
} from '@heroicons/react/24/outline';

/**
 * GoogleAdsPage - Google Ads Manager within Marketing Hub
 *
 * Displays campaigns from Google Ads.
 * Allows viewing metrics and managing campaign status.
 */
export default function GoogleAdsPage() {
  const toast = useToast();
  const [campaigns, setCampaigns] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [status, setStatus] = useState({});
  const [updatingCampaigns, setUpdatingCampaigns] = useState(new Set());
  const [searchQuery, setSearchQuery] = useState('');
  const [statusFilter, setStatusFilter] = useState('all');

  // AI Insights state
  const [insights, setInsights] = useState([]);
  const [insightsLoading, setInsightsLoading] = useState(false);
  const [analysisRunning, setAnalysisRunning] = useState(false);
  const [showInsightsPanel, setShowInsightsPanel] = useState(true);

  // Campaign detail drawer state
  const [selectedCampaign, setSelectedCampaign] = useState(null);
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [editingBudget, setEditingBudget] = useState(false);
  const [newBudget, setNewBudget] = useState('');
  const [budgetSaving, setBudgetSaving] = useState(false);

  useEffect(() => {
    fetchStatus();
    fetchCampaigns();
    fetchInsights();
  }, []);

  const fetchInsights = useCallback(async () => {
    setInsightsLoading(true);
    try {
      const response = await axios.get('/api/marketing-command-center/ai-brain/insights', {
        params: { platform: 'google', status: 'pending' },
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
      // Fetch fresh insights after analysis
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
      // Remove from local state
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
      // Remove from local state
      setInsights(prev => prev.filter(i => i.id !== insightId));
    } catch (err) {
      console.error('Error dismissing insight:', err);
      toast.error('Failed to dismiss insight.');
    }
  };

  const fetchStatus = async () => {
    try {
      const response = await axios.get('/api/ads-manager/status', { withCredentials: true });
      setStatus(response.data.google || {});
    } catch (err) {
      console.error('Error fetching status:', err);
      setStatus({ enabled: false, hasCredentials: false, error: 'Unable to fetch status' });
    }
  };

  const fetchCampaigns = async () => {
    setLoading(true);
    setError(null);
    try {
      const response = await axios.get('/api/ads-manager/campaigns/google', {
        params: { useCache: true },
        withCredentials: true,
      });
      setCampaigns(response.data.campaigns || []);
    } catch (err) {
      console.error('Error fetching Google campaigns:', err);
      const statusCode = err.response?.status;
      if (statusCode === 401) {
        setError('Authentication required. Please ensure you are logged in.');
      } else if (statusCode === 500) {
        setError('Google Ads API not configured or connection failed. Check GOOGLE_ADS_* environment variables.');
        setStatus(prev => ({ ...prev, enabled: false, hasCredentials: false }));
      } else {
        setError(err.response?.data?.message || err.message || 'Failed to fetch campaigns');
      }
    } finally {
      setLoading(false);
    }
  };

  const updateCampaignStatus = async (campaignId, newStatus) => {
    setUpdatingCampaigns(prev => new Set(prev).add(campaignId));
    try {
      await axios.patch(`/api/ads-manager/campaigns/google/${campaignId}`, {
        status: newStatus ? 'ENABLED' : 'PAUSED',
      }, { withCredentials: true });
      await fetchCampaigns();
      // Update selected campaign if drawer is open
      if (selectedCampaign && selectedCampaign.id === campaignId) {
        setSelectedCampaign(prev => ({ ...prev, status: newStatus ? 'ENABLED' : 'PAUSED' }));
      }
    } catch (err) {
      toast.error(err.response?.data?.message || 'Failed to update campaign');
    } finally {
      setUpdatingCampaigns(prev => { const next = new Set(prev); next.delete(campaignId); return next; });
    }
  };

  const openCampaignDrawer = (campaign) => {
    setSelectedCampaign(campaign);
    setDrawerOpen(true);
    setEditingBudget(false);
    setNewBudget(campaign.budget?.toString() || '');
  };

  const closeCampaignDrawer = () => {
    setDrawerOpen(false);
    setSelectedCampaign(null);
    setEditingBudget(false);
  };

  const handleBudgetSave = async () => {
    if (!selectedCampaign || !newBudget) return;

    const budgetValue = parseFloat(newBudget);
    if (isNaN(budgetValue) || budgetValue <= 0) {
      toast.error('Please enter a valid budget amount');
      return;
    }

    setBudgetSaving(true);
    try {
      await axios.patch(`/api/ads-manager/campaigns/google/${selectedCampaign.id}/budget`, {
        dailyBudget: budgetValue,
      }, { withCredentials: true });

      // Update local state
      setSelectedCampaign(prev => ({ ...prev, budget: budgetValue }));
      setCampaigns(prev => prev.map(c =>
        c.id === selectedCampaign.id ? { ...c, budget: budgetValue } : c
      ));
      setEditingBudget(false);
    } catch (err) {
      toast.error(err.response?.data?.message || 'Failed to update budget');
    } finally {
      setBudgetSaving(false);
    }
  };

  const formatNumber = (value) => value == null ? 'N/A' : value.toLocaleString();

  // Handle status which could be a string or an object with a name property
  const getStatusString = (item) => {
    if (!item.status) return '';
    if (typeof item.status === 'string') return item.status.toUpperCase();
    if (typeof item.status === 'object' && item.status.name) return item.status.name.toUpperCase();
    return String(item.status).toUpperCase();
  };

  const isItemActive = (item) => getStatusString(item) === 'ENABLED';

  const getStatusBadge = (item) => {
    const s = getStatusString(item);
    if (s === 'ENABLED') return <span className="inline-flex items-center gap-1 px-2 py-1 rounded-full text-xs font-medium bg-green-100 text-green-800"><CheckCircleIcon className="h-3 w-3" />Enabled</span>;
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
          <h1 className="text-2xl font-bold text-neutral-900">Google Ads Manager</h1>
            <p className="mt-1 text-sm text-neutral-500">
              Manage your Google Search and Display advertising campaigns
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
              onClick={fetchCampaigns}
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
                <h3 className="text-sm font-medium text-yellow-800">Google Ads API not configured</h3>
                <p className="mt-1 text-sm text-yellow-700">Configure GOOGLE_ADS_* environment variables to connect to Google Ads.</p>
              </div>
            </div>
          </div>
        )}

        {hasCredentials && !isPlatformEnabled && (
          <div className="bg-yellow-50 border border-yellow-200 rounded-lg p-4">
            <div className="flex items-start gap-3">
              <ExclamationTriangleIcon className="h-5 w-5 text-yellow-600 mt-0.5" />
              <div>
                <h3 className="text-sm font-medium text-yellow-800">Google Ads API connection issue</h3>
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
                <h3 className="font-semibold text-neutral-900">AI Insights for Google Ads</h3>
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
                <option value="active">Enabled</option>
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

                      return (
                        <tr key={campaign.id} className="hover:bg-neutral-50">
                          <td className="px-6 py-4">
                            <button
                              onClick={() => openCampaignDrawer(campaign)}
                              className="text-left group"
                            >
                              <div className="text-sm font-medium text-neutral-900 group-hover:text-brand-purple transition-colors flex items-center gap-1">
                                {campaign.name}
                                <ChevronRightIcon className="h-4 w-4 opacity-0 group-hover:opacity-100 transition-opacity" />
                              </div>
                              <div className="text-xs text-neutral-500">ID: {campaign.id}</div>
                            </button>
                          </td>
                          <td className="px-6 py-4 whitespace-nowrap">{getStatusBadge(campaign)}</td>
                          <td className="px-6 py-4 whitespace-nowrap text-sm text-neutral-900">{formatCurrency(campaign.budget)}</td>
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
                      );
                    })}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        )}

        {/* Campaign Detail Drawer */}
        {drawerOpen && selectedCampaign && (
          <div className="fixed inset-0 z-50 overflow-hidden">
            <div className="absolute inset-0 bg-neutral-500 bg-opacity-75 transition-opacity" onClick={closeCampaignDrawer} />
            <div className="pointer-events-none fixed inset-y-0 right-0 flex max-w-full pl-10">
              <div className="pointer-events-auto w-screen max-w-md">
                <div className="flex h-full flex-col overflow-y-scroll bg-white shadow-xl">
                  {/* Header */}
                  <div className="bg-gradient-to-r from-brand-navy to-brand-purple px-6 py-6">
                    <div className="flex items-start justify-between">
                      <div className="flex-1 min-w-0">
                        <h2 className="text-xl font-bold text-white truncate">{selectedCampaign.name}</h2>
                        <p className="mt-1 text-sm text-white/70">Campaign ID: {selectedCampaign.id}</p>
                      </div>
                      <button
                        onClick={closeCampaignDrawer}
                        className="ml-3 p-2 text-white/70 hover:text-white rounded-lg hover:bg-white/10 transition-colors"
                      >
                        <XMarkIcon className="h-6 w-6" />
                      </button>
                    </div>
                    <div className="mt-4">
                      {getStatusBadge(selectedCampaign)}
                    </div>
                  </div>

                  {/* Content */}
                  <div className="flex-1 px-6 py-6 space-y-6">
                    {/* Quick Actions */}
                    <div className="flex gap-3">
                      <button
                        onClick={() => updateCampaignStatus(selectedCampaign.id, !isItemActive(selectedCampaign))}
                        disabled={updatingCampaigns.has(selectedCampaign.id)}
                        className={`flex-1 inline-flex items-center justify-center gap-2 px-4 py-2 rounded-lg text-sm font-medium transition-colors ${
                          isItemActive(selectedCampaign)
                            ? 'bg-yellow-100 text-yellow-800 hover:bg-yellow-200'
                            : 'bg-green-100 text-green-800 hover:bg-green-200'
                        } ${updatingCampaigns.has(selectedCampaign.id) && 'opacity-50 cursor-not-allowed'}`}
                      >
                        {updatingCampaigns.has(selectedCampaign.id) ? (
                          <><ArrowPathIcon className="h-4 w-4 animate-spin" />Updating...</>
                        ) : isItemActive(selectedCampaign) ? (
                          <><PauseIcon className="h-4 w-4" />Pause Campaign</>
                        ) : (
                          <><PlayIcon className="h-4 w-4" />Enable Campaign</>
                        )}
                      </button>
                    </div>

                    {/* Budget Section */}
                    <div className="bg-neutral-50 rounded-lg p-4">
                      <div className="flex items-center justify-between mb-3">
                        <div className="flex items-center gap-2">
                          <CurrencyDollarIcon className="h-5 w-5 text-brand-purple" />
                          <h3 className="font-semibold text-neutral-900">Daily Budget</h3>
                        </div>
                        {!editingBudget && (
                          <button
                            onClick={() => {
                              setEditingBudget(true);
                              setNewBudget(selectedCampaign.budget?.toString() || '');
                            }}
                            className="text-sm text-brand-purple hover:text-primary-700 font-medium flex items-center gap-1"
                          >
                            <PencilIcon className="h-4 w-4" />
                            Edit
                          </button>
                        )}
                      </div>
                      {editingBudget ? (
                        <div className="space-y-3">
                          <div className="relative">
                            <span className="absolute left-3 top-1/2 -translate-y-1/2 text-neutral-500">$</span>
                            <input
                              type="number"
                              value={newBudget}
                              onChange={(e) => setNewBudget(e.target.value)}
                              className="w-full pl-7 pr-4 py-2 border border-neutral-300 rounded-lg text-sm focus:ring-2 focus:ring-brand-purple focus:border-transparent"
                              placeholder="Enter daily budget"
                              step="0.01"
                              min="0"
                            />
                          </div>
                          <div className="flex gap-2">
                            <button
                              onClick={handleBudgetSave}
                              disabled={budgetSaving}
                              className="flex-1 px-4 py-2 bg-brand-purple text-white rounded-lg text-sm font-medium hover:bg-primary-700 disabled:opacity-50 transition-colors"
                            >
                              {budgetSaving ? 'Saving...' : 'Save'}
                            </button>
                            <button
                              onClick={() => setEditingBudget(false)}
                              className="px-4 py-2 bg-neutral-100 text-neutral-700 rounded-lg text-sm font-medium hover:bg-neutral-200 transition-colors"
                            >
                              Cancel
                            </button>
                          </div>
                        </div>
                      ) : (
                        <p className="text-2xl font-bold text-neutral-900">
                          {formatCurrency(selectedCampaign.budget)}
                          <span className="text-sm font-normal text-neutral-500 ml-1">/ day</span>
                        </p>
                      )}
                    </div>

                    {/* Campaign Details */}
                    <div className="bg-neutral-50 rounded-lg p-4">
                      <div className="flex items-center gap-2 mb-3">
                        <CalendarIcon className="h-5 w-5 text-brand-purple" />
                        <h3 className="font-semibold text-neutral-900">Campaign Details</h3>
                      </div>
                      <dl className="space-y-3">
                        <div className="flex justify-between">
                          <dt className="text-sm text-neutral-500">Channel Type</dt>
                          <dd className="text-sm font-medium text-neutral-900">
                            {selectedCampaign.advertisingChannelType || 'N/A'}
                          </dd>
                        </div>
                        {selectedCampaign.startDate && (
                          <div className="flex justify-between">
                            <dt className="text-sm text-neutral-500">Start Date</dt>
                            <dd className="text-sm font-medium text-neutral-900">{selectedCampaign.startDate}</dd>
                          </div>
                        )}
                        {selectedCampaign.endDate && (
                          <div className="flex justify-between">
                            <dt className="text-sm text-neutral-500">End Date</dt>
                            <dd className="text-sm font-medium text-neutral-900">{selectedCampaign.endDate}</dd>
                          </div>
                        )}
                        {selectedCampaign.totalBudget && (
                          <div className="flex justify-between">
                            <dt className="text-sm text-neutral-500">Total Budget</dt>
                            <dd className="text-sm font-medium text-neutral-900">{formatCurrency(selectedCampaign.totalBudget)}</dd>
                          </div>
                        )}
                      </dl>
                    </div>

                    {/* Performance Metrics (30 days) */}
                    <div className="bg-neutral-50 rounded-lg p-4">
                      <div className="flex items-center gap-2 mb-3">
                        <ChartBarIcon className="h-5 w-5 text-brand-purple" />
                        <h3 className="font-semibold text-neutral-900">Performance (Last 30 Days)</h3>
                      </div>
                      {selectedCampaign.metrics ? (
                        <div className="grid grid-cols-2 gap-4">
                          <div className="bg-white rounded-lg p-3 border border-neutral-200">
                            <p className="text-xs text-neutral-500 uppercase">Spend</p>
                            <p className="text-lg font-bold text-neutral-900">{formatCurrency(selectedCampaign.metrics.spend)}</p>
                          </div>
                          <div className="bg-white rounded-lg p-3 border border-neutral-200">
                            <p className="text-xs text-neutral-500 uppercase">Impressions</p>
                            <p className="text-lg font-bold text-neutral-900">{formatNumber(selectedCampaign.metrics.impressions)}</p>
                          </div>
                          <div className="bg-white rounded-lg p-3 border border-neutral-200">
                            <p className="text-xs text-neutral-500 uppercase">Clicks</p>
                            <p className="text-lg font-bold text-neutral-900">{formatNumber(selectedCampaign.metrics.clicks)}</p>
                          </div>
                          <div className="bg-white rounded-lg p-3 border border-neutral-200">
                            <p className="text-xs text-neutral-500 uppercase">CTR</p>
                            <p className="text-lg font-bold text-neutral-900">{selectedCampaign.metrics.ctr?.toFixed(2)}%</p>
                          </div>
                          <div className="bg-white rounded-lg p-3 border border-neutral-200">
                            <p className="text-xs text-neutral-500 uppercase">Avg. CPC</p>
                            <p className="text-lg font-bold text-neutral-900">{formatCurrency(selectedCampaign.metrics.cpc)}</p>
                          </div>
                          <div className="bg-white rounded-lg p-3 border border-neutral-200">
                            <p className="text-xs text-neutral-500 uppercase">Conversions</p>
                            <p className="text-lg font-bold text-neutral-900">{formatNumber(selectedCampaign.metrics.conversions)}</p>
                          </div>
                        </div>
                      ) : (
                        <p className="text-sm text-neutral-500 text-center py-4">No metrics available</p>
                      )}
                    </div>
                  </div>
                </div>
              </div>
            </div>
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
