import React, { useState, useEffect, Fragment } from 'react';
import axios from 'axios';
import { useToast } from '../hooks/useToast';
import { formatCurrency, formatDate } from '../utils/formatters';
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
  DocumentDuplicateIcon,
  MagnifyingGlassIcon,
  FunnelIcon,
  CurrencyDollarIcon,
  CalendarIcon,
  Squares2X2Icon,
  ChartBarIcon,
} from '@heroicons/react/24/outline';
import { Dialog, Transition } from '@headlessui/react';

function classNames(...classes) {
  return classes.filter(Boolean).join(' ');
}

function AdsManagerPage() {
  const toast = useToast();
  const [activeTab, setActiveTab] = useState('meta');
  const [campaigns, setCampaigns] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [status, setStatus] = useState({ meta: {}, google: {}, klaviyo: {} });
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
  const [selectedItems, setSelectedItems] = useState(new Set());
  const [bulkAction, setBulkAction] = useState(null);
  
  // Modal states
  const [budgetModalOpen, setBudgetModalOpen] = useState(false);
  const [scheduleModalOpen, setScheduleModalOpen] = useState(false);
  const [duplicateModalOpen, setDuplicateModalOpen] = useState(false);
  const [selectedCampaign, setSelectedCampaign] = useState(null);
  const [budgetForm, setBudgetForm] = useState({ dailyBudget: '', lifetimeBudget: '' });
  const [scheduleForm, setScheduleForm] = useState({ startTime: '', endTime: '' });
  const [duplicateForm, setDuplicateForm] = useState({ newName: '', status: 'PAUSED' });

  useEffect(() => {
    fetchStatus();
    fetchCampaigns();
  }, [activeTab]);

  const fetchStatus = async () => {
    try {
      const response = await axios.get('/api/ads-manager/status');
      setStatus(response.data);
    } catch (err) {
      console.error('Error fetching status:', err);
    }
  };

  const fetchCampaigns = async (includeMetrics = false) => {
    setLoading(true);
    setError(null);
    setMetricsLoaded(includeMetrics); // Track if metrics were included
    try {
      // Load campaigns without metrics initially for faster loading (lazy loading)
      const response = await axios.get(`/api/ads-manager/campaigns/${activeTab}`, {
        params: {
          includeMetrics: includeMetrics,
          useCache: true,
        },
      });
      setCampaigns(response.data.campaigns || []);
      setExpandedCampaigns(new Set());
      setExpandedAdSets(new Set());
      setCampaignAdSets({});
      setAdSetAds({});
      setSelectedItems(new Set());
      
      // Check if campaigns already have metrics
      const hasMetrics = response.data.campaigns?.some(c => c.metrics !== null);
      if (hasMetrics) {
        setMetricsLoaded(true);
      }
    } catch (err) {
      console.error(`Error fetching ${activeTab} campaigns:`, err);
      setError(err.response?.data?.message || err.message || 'Failed to fetch campaigns');
    } finally {
      setLoading(false);
    }
  };

  const fetchMetrics = async () => {
    if (activeTab !== 'meta') return;
    
    setLoadingMetrics(true);
    try {
      // Fetch metrics for all campaigns
      const response = await axios.get('/api/ads-manager/campaigns/meta/metrics');
      const metricsMap = response.data.metrics || {};
      
      // Update campaigns with metrics
      setCampaigns(prevCampaigns => 
        prevCampaigns.map(campaign => ({
          ...campaign,
          metrics: metricsMap[campaign.id] || campaign.metrics,
        }))
      );
      
      setMetricsLoaded(true);
    } catch (err) {
      console.error('Error fetching metrics:', err);
      // Don't show error for metrics - campaigns will just show without metrics
      if (err.response?.status === 429) {
        setError('Rate limit exceeded while loading metrics. Please wait a moment and try again.');
      }
    } finally {
      setLoadingMetrics(false);
    }
  };

  const fetchAdSets = async (campaignId) => {
    if (activeTab !== 'meta') return;
    
    if (campaignAdSets[campaignId]) {
      // Already loaded, just toggle expansion
      toggleCampaignExpansion(campaignId);
      return;
    }

    setLoadingAdSets(prev => new Set(prev).add(campaignId));
    try {
      const response = await axios.get(`/api/ads-manager/campaigns/meta/${campaignId}/ad-sets`);
      setCampaignAdSets(prev => ({
        ...prev,
        [campaignId]: response.data.adSets || [],
      }));
      toggleCampaignExpansion(campaignId);
    } catch (err) {
      console.error(`Error fetching ad sets for campaign ${campaignId}:`, err);
      const errorMessage = err.response?.data?.message || err.message || 'Failed to fetch ad sets';
      setError(errorMessage);
    } finally {
      setLoadingAdSets(prev => {
        const next = new Set(prev);
        next.delete(campaignId);
        return next;
      });
    }
  };

  const fetchAds = async (adSetId) => {
    if (activeTab !== 'meta') return;
    
    if (adSetAds[adSetId]) {
      // Already loaded, just toggle expansion
      toggleAdSetExpansion(adSetId);
      return;
    }

    setLoadingAds(prev => new Set(prev).add(adSetId));
    try {
      const response = await axios.get(`/api/ads-manager/ad-sets/meta/${adSetId}/ads`);
      setAdSetAds(prev => ({
        ...prev,
        [adSetId]: response.data.ads || [],
      }));
      toggleAdSetExpansion(adSetId);
    } catch (err) {
      console.error(`Error fetching ads for ad set ${adSetId}:`, err);
      const errorMessage = err.response?.data?.message || err.message || 'Failed to fetch ads';
      setError(errorMessage);
    } finally {
      setLoadingAds(prev => {
        const next = new Set(prev);
        next.delete(adSetId);
        return next;
      });
    }
  };

  const toggleCampaignExpansion = (campaignId) => {
    setExpandedCampaigns(prev => {
      const next = new Set(prev);
      if (next.has(campaignId)) {
        next.delete(campaignId);
      } else {
        next.add(campaignId);
      }
      return next;
    });
  };

  const toggleAdSetExpansion = (adSetId) => {
    setExpandedAdSets(prev => {
      const next = new Set(prev);
      if (next.has(adSetId)) {
        next.delete(adSetId);
      } else {
        next.add(adSetId);
      }
      return next;
    });
  };

  const updateCampaignStatus = async (campaignId, newStatus) => {
    setUpdatingCampaigns(prev => new Set(prev).add(campaignId));
    try {
      let statusValue;
      if (activeTab === 'meta') {
        statusValue = newStatus ? 'ACTIVE' : 'PAUSED';
      } else if (activeTab === 'google') {
        statusValue = newStatus ? 'ENABLED' : 'PAUSED';
      } else if (activeTab === 'klaviyo') {
        statusValue = 'CANCELED';
      }

      await axios.patch(`/api/ads-manager/campaigns/${activeTab}/${campaignId}`, {
        status: statusValue,
      });

      await fetchCampaigns();
    } catch (err) {
      console.error(`Error updating ${activeTab} campaign:`, err);
      const errorMessage = err.response?.data?.message || err.message || 'Failed to update campaign';
      toast.error(errorMessage);
    } finally {
      setUpdatingCampaigns(prev => {
        const next = new Set(prev);
        next.delete(campaignId);
        return next;
      });
    }
  };

  const updateAdSetStatus = async (adSetId, newStatus) => {
    if (activeTab !== 'meta') return;
    
    setUpdatingCampaigns(prev => new Set(prev).add(`adset-${adSetId}`));
    try {
      await axios.patch(`/api/ads-manager/ad-sets/meta/${adSetId}`, {
        status: newStatus ? 'ACTIVE' : 'PAUSED',
      });

      // Refresh ad sets for the parent campaign
      const campaignId = Object.keys(campaignAdSets).find(id => 
        campaignAdSets[id].some(adSet => adSet.id === adSetId)
      );
      if (campaignId) {
        const response = await axios.get(`/api/ads-manager/campaigns/meta/${campaignId}/ad-sets`);
        setCampaignAdSets(prev => ({
          ...prev,
          [campaignId]: response.data.adSets || [],
        }));
      }
    } catch (err) {
      console.error(`Error updating ad set ${adSetId}:`, err);
      toast.error(err.response?.data?.message || err.message || 'Failed to update ad set');
    } finally {
      setUpdatingCampaigns(prev => {
        const next = new Set(prev);
        next.delete(`adset-${adSetId}`);
        return next;
      });
    }
  };

  const updateAdStatus = async (adId, newStatus) => {
    if (activeTab !== 'meta') return;
    
    setUpdatingCampaigns(prev => new Set(prev).add(`ad-${adId}`));
    try {
      await axios.patch(`/api/ads-manager/ads/meta/${adId}`, {
        status: newStatus ? 'ACTIVE' : 'PAUSED',
      });

      // Refresh ads for the parent ad set
      const adSetId = Object.keys(adSetAds).find(id => 
        adSetAds[id].some(ad => ad.id === adId)
      );
      if (adSetId) {
        const response = await axios.get(`/api/ads-manager/ad-sets/meta/${adSetId}/ads`);
        setAdSetAds(prev => ({
          ...prev,
          [adSetId]: response.data.ads || [],
        }));
      }
    } catch (err) {
      console.error(`Error updating ad ${adId}:`, err);
      toast.error(err.response?.data?.message || err.message || 'Failed to update ad');
    } finally {
      setUpdatingCampaigns(prev => {
        const next = new Set(prev);
        next.delete(`ad-${adId}`);
        return next;
      });
    }
  };

  const openBudgetModal = (campaign) => {
    setSelectedCampaign(campaign);
    setBudgetForm({
      dailyBudget: campaign.dailyBudget || campaign.budget || '',
      lifetimeBudget: campaign.lifetimeBudget || '',
    });
    setBudgetModalOpen(true);
  };

  const openScheduleModal = (campaign) => {
    setSelectedCampaign(campaign);
    setScheduleForm({
      startTime: campaign.startTime || campaign.startDate || '',
      endTime: campaign.endTime || campaign.endDate || '',
    });
    setScheduleModalOpen(true);
  };

  const openDuplicateModal = (campaign) => {
    setSelectedCampaign(campaign);
    setDuplicateForm({
      newName: `${campaign.name} (Copy)`,
      status: 'PAUSED',
    });
    setDuplicateModalOpen(true);
  };

  const handleBudgetUpdate = async () => {
    if (!selectedCampaign) return;

    try {
      await axios.patch(`/api/ads-manager/campaigns/meta/${selectedCampaign.id}/budget`, {
        dailyBudget: budgetForm.dailyBudget ? parseFloat(budgetForm.dailyBudget) : undefined,
        lifetimeBudget: budgetForm.lifetimeBudget ? parseFloat(budgetForm.lifetimeBudget) : undefined,
      });

      setBudgetModalOpen(false);
      await fetchCampaigns();
    } catch (err) {
      console.error('Error updating budget:', err);
      toast.error(err.response?.data?.message || err.message || 'Failed to update budget');
    }
  };

  const handleScheduleUpdate = async () => {
    if (!selectedCampaign) return;

    try {
      await axios.patch(`/api/ads-manager/campaigns/meta/${selectedCampaign.id}/schedule`, {
        startTime: scheduleForm.startTime || undefined,
        endTime: scheduleForm.endTime || undefined,
      });

      setScheduleModalOpen(false);
      await fetchCampaigns();
    } catch (err) {
      console.error('Error updating schedule:', err);
      toast.error(err.response?.data?.message || err.message || 'Failed to update schedule');
    }
  };

  const handleDuplicateCampaign = async () => {
    if (!selectedCampaign) return;

    try {
      await axios.post(`/api/ads-manager/campaigns/meta/${selectedCampaign.id}/duplicate`, {
        newName: duplicateForm.newName,
        status: duplicateForm.status,
      });

      setDuplicateModalOpen(false);
      await fetchCampaigns();
      toast.success('Campaign duplicated successfully!');
    } catch (err) {
      console.error('Error duplicating campaign:', err);
      toast.error(err.response?.data?.message || err.message || 'Failed to duplicate campaign');
    }
  };

  const handleBulkAction = async () => {
    if (!bulkAction || selectedItems.size === 0) return;

    const items = Array.from(selectedItems);
    const isActive = bulkAction === 'enable';
    
    try {
      // Process in batches to avoid overwhelming the API
      const batchSize = 5;
      for (let i = 0; i < items.length; i += batchSize) {
        const batch = items.slice(i, i + batchSize);
        await Promise.all(
          batch.map(itemId => {
            const [type, id] = itemId.split('-');
            if (type === 'campaign') {
              return updateCampaignStatus(id, isActive);
            } else if (type === 'adset') {
              return updateAdSetStatus(id, isActive);
            } else if (type === 'ad') {
              return updateAdStatus(id, isActive);
            }
          })
        );
      }

      setSelectedItems(new Set());
      setBulkAction(null);
      await fetchCampaigns();
    } catch (err) {
      console.error('Error performing bulk action:', err);
      toast.error('Some items failed to update. Please try again.');
    }
  };

  const toggleItemSelection = (itemId) => {
    setSelectedItems(prev => {
      const next = new Set(prev);
      if (next.has(itemId)) {
        next.delete(itemId);
      } else {
        next.add(itemId);
      }
      return next;
    });
  };

  const toggleSelectAll = () => {
    if (selectedItems.size === filteredCampaigns.length) {
      setSelectedItems(new Set());
    } else {
      const allIds = filteredCampaigns.map(c => `campaign-${c.id}`);
      setSelectedItems(new Set(allIds));
    }
  };

  const getStatusBadge = (item) => {
    let statusValue = item.status || item.effectiveStatus || 'unknown';
    
    if (activeTab === 'meta') {
      statusValue = statusValue.toUpperCase();
      if (statusValue === 'ACTIVE') {
        return (
          <span className="inline-flex items-center gap-1 px-2 py-1 rounded-full text-xs font-medium bg-green-100 text-green-800">
            <CheckCircleIcon className="h-3 w-3" />
            Active
          </span>
        );
      } else if (statusValue === 'PAUSED') {
        return (
          <span className="inline-flex items-center gap-1 px-2 py-1 rounded-full text-xs font-medium bg-yellow-100 text-yellow-800">
            <PauseIcon className="h-3 w-3" />
            Paused
          </span>
        );
      }
    } else if (activeTab === 'google') {
      statusValue = statusValue.toUpperCase();
      if (statusValue === 'ENABLED') {
        return (
          <span className="inline-flex items-center gap-1 px-2 py-1 rounded-full text-xs font-medium bg-green-100 text-green-800">
            <CheckCircleIcon className="h-3 w-3" />
            Enabled
          </span>
        );
      } else if (statusValue === 'PAUSED') {
        return (
          <span className="inline-flex items-center gap-1 px-2 py-1 rounded-full text-xs font-medium bg-yellow-100 text-yellow-800">
            <PauseIcon className="h-3 w-3" />
            Paused
          </span>
        );
      }
    } else if (activeTab === 'klaviyo') {
      statusValue = statusValue.toLowerCase();
      if (statusValue === 'scheduled' || statusValue === 'draft') {
        return (
          <span className="inline-flex items-center gap-1 px-2 py-1 rounded-full text-xs font-medium bg-blue-100 text-blue-800">
            Scheduled
          </span>
        );
      } else if (statusValue === 'sent') {
        return (
          <span className="inline-flex items-center gap-1 px-2 py-1 rounded-full text-xs font-medium bg-green-100 text-green-800">
            Sent
          </span>
        );
      } else if (statusValue === 'canceled') {
        return (
          <span className="inline-flex items-center gap-1 px-2 py-1 rounded-full text-xs font-medium bg-neutral-100 text-neutral-800">
            Canceled
          </span>
        );
      }
    }

    return (
      <span className="inline-flex items-center gap-1 px-2 py-1 rounded-full text-xs font-medium bg-neutral-100 text-neutral-800">
        {statusValue}
      </span>
    );
  };

  const isItemActive = (item) => {
    const statusValue = (item.status || item.effectiveStatus || '').toUpperCase();
    if (activeTab === 'meta') {
      return statusValue === 'ACTIVE';
    } else if (activeTab === 'google') {
      return statusValue === 'ENABLED';
    } else if (activeTab === 'klaviyo') {
      const klaviyoStatus = (item.status || '').toLowerCase();
      return klaviyoStatus === 'scheduled' || klaviyoStatus === 'draft';
    }
    return false;
  };

  const canToggleItem = (item) => {
    if (activeTab === 'klaviyo') {
      const klaviyoStatus = (item.status || '').toLowerCase();
      return klaviyoStatus === 'scheduled' || klaviyoStatus === 'draft';
    }
    return true;
  };


  const formatNumber = (value) => {
    if (value === null || value === undefined) return 'N/A';
    return new Intl.NumberFormat('en-US').format(value);
  };


  // Filter campaigns
  const filteredCampaigns = campaigns.filter(campaign => {
    const matchesSearch = !searchQuery || 
      campaign.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
      campaign.id.toString().includes(searchQuery);
    
    const matchesStatus = statusFilter === 'all' ||
      (statusFilter === 'active' && isItemActive(campaign)) ||
      (statusFilter === 'paused' && !isItemActive(campaign) && campaign.status !== 'DELETED' && campaign.status !== 'REMOVED');
    
    return matchesSearch && matchesStatus;
  });

  const tabs = [
    { id: 'meta', name: 'Meta (Facebook)', icon: '📘' },
    { id: 'google', name: 'Google Ads', icon: '🔍' },
    { id: 'klaviyo', name: 'Klaviyo', icon: '📧' },
  ];

  const platformStatus = status[activeTab] || {};
  const isPlatformEnabled = platformStatus.enabled;
  const hasCredentials = platformStatus.hasCredentials;

  return (
    <div className="min-h-screen bg-gradient-to-br from-neutral-50 via-white to-blue-50">
      {/* Header */}
      <div className="border-b border-neutral-200 bg-white shadow-sm">
        <div className="mx-auto px-4 sm:px-6 lg:px-8 py-4">
          <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
            <div>
              <p className="text-sm text-neutral-600">
                Manage your advertising campaigns across Meta, Google, and Klaviyo
              </p>
            </div>
            <div className="flex items-center gap-2">
              {activeTab === 'meta' && !metricsLoaded && (
                <button
                  onClick={fetchMetrics}
                  disabled={loadingMetrics || loading}
                  className="inline-flex items-center gap-2 px-4 py-2 bg-brand-purple text-white rounded-lg text-sm font-medium hover:bg-brand-navy disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
                  title="Load performance metrics (spend, impressions, clicks, etc.)"
                >
                  <ChartBarIcon className={classNames('h-4 w-4', loadingMetrics && 'animate-pulse')} />
                  Load Metrics
                </button>
              )}
              <button
                onClick={() => fetchCampaigns(false)}
                disabled={loading}
                className="inline-flex items-center gap-2 px-4 py-2 bg-white border border-neutral-300 rounded-lg text-sm font-medium text-neutral-700 hover:bg-neutral-50 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
              >
                <ArrowPathIcon className={classNames('h-4 w-4', loading && 'animate-spin')} />
                Refresh
              </button>
            </div>
          </div>
        </div>
      </div>

      {/* Tabs */}
      <div className="border-b border-neutral-200 bg-white">
        <div className="mx-auto px-4 sm:px-6 lg:px-8">
          <nav className="flex space-x-8" aria-label="Tabs">
            {tabs.map((tab) => {
              const tabStatus = status[tab.id] || {};
              const isEnabled = tabStatus.enabled;
              const hasCreds = tabStatus.hasCredentials;

              return (
                <button
                  key={tab.id}
                  onClick={() => setActiveTab(tab.id)}
                  className={classNames(
                    'py-4 px-1 border-b-2 font-medium text-sm transition-colors',
                    activeTab === tab.id
                      ? 'border-brand-purple text-brand-purple'
                      : 'border-transparent text-neutral-500 hover:text-neutral-700 hover:border-neutral-300'
                  )}
                >
                  <span className="flex items-center gap-2">
                    <span>{tab.icon}</span>
                    <span>{tab.name}</span>
                    {hasCreds && isEnabled ? (
                      <CheckCircleIcon className="h-4 w-4 text-green-500" />
                    ) : hasCreds ? (
                      <ExclamationTriangleIcon className="h-4 w-4 text-yellow-500" />
                    ) : (
                      <XCircleIcon className="h-4 w-4 text-neutral-400" />
                    )}
                  </span>
                </button>
              );
            })}
          </nav>
        </div>
      </div>

      {/* Content */}
      <div className="mx-auto px-4 sm:px-6 lg:px-8 py-6">
        {/* Platform Status Alert */}
        {!hasCredentials && (
          <div className="mb-6 bg-yellow-50 border border-yellow-200 rounded-lg p-4">
            <div className="flex items-start">
              <ExclamationTriangleIcon className="h-5 w-5 text-yellow-600 mt-0.5" />
              <div className="ml-3">
                <h3 className="text-sm font-medium text-yellow-800">
                  {tabs.find(t => t.id === activeTab)?.name} API not configured
                </h3>
                <p className="mt-1 text-sm text-yellow-700">
                  Please configure the API credentials in your environment variables to manage campaigns.
                </p>
                {activeTab === 'meta' && (
                  <p className="mt-2 text-xs text-yellow-600">
                    <strong>Note:</strong> For Meta Ads, your access token needs <code className="bg-yellow-100 px-1 rounded">ads_management</code> permission (not just <code className="bg-yellow-100 px-1 rounded">ads_read</code>) to enable/disable campaigns.
                  </p>
                )}
              </div>
            </div>
          </div>
        )}

        {hasCredentials && !isPlatformEnabled && (
          <div className="mb-6 bg-yellow-50 border border-yellow-200 rounded-lg p-4">
            <div className="flex items-start">
              <ExclamationTriangleIcon className="h-5 w-5 text-yellow-600 mt-0.5" />
              <div className="ml-3">
                <h3 className="text-sm font-medium text-yellow-800">
                  {tabs.find(t => t.id === activeTab)?.name} API connection issue
                </h3>
                <p className="mt-1 text-sm text-yellow-700">
                  {platformStatus.error || 'Unable to connect to the API. Please check your credentials.'}
                </p>
              </div>
            </div>
          </div>
        )}

        {/* Error Message */}
        {error && (
          <div className="mb-6 bg-red-50 border border-red-200 rounded-lg p-4">
            <div className="flex items-start">
              <XCircleIcon className="h-5 w-5 text-red-600 mt-0.5" />
              <div className="ml-3">
                <h3 className="text-sm font-medium text-red-800">Error</h3>
                <p className="mt-1 text-sm text-red-700">{error}</p>
              </div>
            </div>
          </div>
        )}

        {/* Filters and Search */}
        {isPlatformEnabled && filteredCampaigns.length > 0 && (
          <div className="mb-6 bg-white rounded-lg border border-neutral-200 p-4">
            <div className="flex flex-col sm:flex-row gap-4">
              {/* Search */}
              <div className="flex-1">
                <div className="relative">
                  <MagnifyingGlassIcon className="absolute left-3 top-1/2 transform -translate-y-1/2 h-5 w-5 text-neutral-400" />
                  <input
                    type="text"
                    placeholder="Search campaigns..."
                    value={searchQuery}
                    onChange={(e) => setSearchQuery(e.target.value)}
                    className="w-full pl-10 pr-4 py-2 border border-neutral-300 rounded-lg text-sm focus:ring-2 focus:ring-brand-purple focus:border-transparent"
                  />
                </div>
              </div>
              
              {/* Status Filter */}
              <div className="sm:w-48">
                <select
                  value={statusFilter}
                  onChange={(e) => setStatusFilter(e.target.value)}
                  className="w-full px-4 py-2 border border-neutral-300 rounded-lg text-sm focus:ring-2 focus:ring-brand-purple focus:border-transparent"
                >
                  <option value="all">All Status</option>
                  <option value="active">Active</option>
                  <option value="paused">Paused</option>
                </select>
              </div>
            </div>

            {/* Bulk Actions */}
            {selectedItems.size > 0 && (
              <div className="mt-4 pt-4 border-t border-neutral-200 flex items-center justify-between">
                <span className="text-sm text-neutral-700">
                  {selectedItems.size} item{selectedItems.size !== 1 ? 's' : ''} selected
                </span>
                <div className="flex items-center gap-2">
                  <select
                    value={bulkAction || ''}
                    onChange={(e) => setBulkAction(e.target.value)}
                    className="px-3 py-1.5 border border-neutral-300 rounded-md text-sm focus:ring-2 focus:ring-brand-purple focus:border-transparent"
                  >
                    <option value="">Select action...</option>
                    <option value="enable">Enable</option>
                    <option value="disable">Pause</option>
                  </select>
                  <button
                    onClick={handleBulkAction}
                    disabled={!bulkAction}
                    className="px-4 py-1.5 bg-brand-purple text-white rounded-md text-sm font-medium hover:bg-brand-navy disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
                  >
                    Apply
                  </button>
                  <button
                    onClick={() => {
                      setSelectedItems(new Set());
                      setBulkAction(null);
                    }}
                    className="px-4 py-1.5 bg-neutral-100 text-neutral-700 rounded-md text-sm font-medium hover:bg-neutral-200 transition-colors"
                  >
                    Clear
                  </button>
                </div>
              </div>
            )}
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
                <p className="text-sm text-neutral-600">
                  {campaigns.length === 0 ? 'No campaigns found.' : 'No campaigns match your filters.'}
                </p>
              </div>
            ) : (
              <div className="overflow-x-auto">
                <table className="min-w-full divide-y divide-neutral-200">
                  <thead className="bg-neutral-50">
                    <tr>
                      {activeTab === 'meta' && (
                        <th className="px-6 py-3 text-left">
                          <input
                            type="checkbox"
                            checked={selectedItems.size === filteredCampaigns.length && filteredCampaigns.length > 0}
                            onChange={toggleSelectAll}
                            className="rounded border-neutral-300 text-brand-purple focus:ring-brand-purple"
                          />
                        </th>
                      )}
                      <th className="px-6 py-3 text-left text-xs font-medium text-neutral-500 uppercase tracking-wider">
                        Campaign Name
                      </th>
                      <th className="px-6 py-3 text-left text-xs font-medium text-neutral-500 uppercase tracking-wider">
                        Status
                      </th>
                      {activeTab !== 'klaviyo' && (
                        <>
                          <th className="px-6 py-3 text-left text-xs font-medium text-neutral-500 uppercase tracking-wider">
                            Budget
                          </th>
                          <th className="px-6 py-3 text-left text-xs font-medium text-neutral-500 uppercase tracking-wider">
                            Spend (30d)
                          </th>
                          <th className="px-6 py-3 text-left text-xs font-medium text-neutral-500 uppercase tracking-wider">
                            Impressions
                          </th>
                          <th className="px-6 py-3 text-left text-xs font-medium text-neutral-500 uppercase tracking-wider">
                            Clicks
                          </th>
                          <th className="px-6 py-3 text-left text-xs font-medium text-neutral-500 uppercase tracking-wider">
                            CTR
                          </th>
                        </>
                      )}
                      {activeTab === 'klaviyo' && (
                        <>
                          <th className="px-6 py-3 text-left text-xs font-medium text-neutral-500 uppercase tracking-wider">
                            Channel
                          </th>
                          <th className="px-6 py-3 text-left text-xs font-medium text-neutral-500 uppercase tracking-wider">
                            Sent
                          </th>
                          <th className="px-6 py-3 text-left text-xs font-medium text-neutral-500 uppercase tracking-wider">
                            Opens
                          </th>
                          <th className="px-6 py-3 text-left text-xs font-medium text-neutral-500 uppercase tracking-wider">
                            Clicks
                          </th>
                        </>
                      )}
                      <th className="px-6 py-3 text-right text-xs font-medium text-neutral-500 uppercase tracking-wider">
                        Actions
                      </th>
                    </tr>
                  </thead>
                  <tbody className="bg-white divide-y divide-neutral-200">
                    {filteredCampaigns.map((campaign) => {
                      const isActive = isItemActive(campaign);
                      const canToggle = canToggleItem(campaign);
                      const isUpdating = updatingCampaigns.has(campaign.id);
                      const isExpanded = expandedCampaigns.has(campaign.id);
                      const campaignItemId = `campaign-${campaign.id}`;
                      const isSelected = selectedItems.has(campaignItemId);
                      const adSets = activeTab === 'meta' ? (campaignAdSets[campaign.id] || []) : [];

                      return (
                        <React.Fragment key={campaign.id}>
                          <tr className={classNames('hover:bg-neutral-50', isSelected && 'bg-blue-50')}>
                            {activeTab === 'meta' && (
                              <td className="px-6 py-4 whitespace-nowrap">
                                <input
                                  type="checkbox"
                                  checked={isSelected}
                                  onChange={() => toggleItemSelection(campaignItemId)}
                                  className="rounded border-neutral-300 text-brand-purple focus:ring-brand-purple"
                                />
                              </td>
                            )}
                            <td className="px-6 py-4">
                              <div className="flex items-center gap-2">
                                {activeTab === 'meta' && (
                                  <button
                                    onClick={() => fetchAdSets(campaign.id)}
                                    className="text-neutral-400 hover:text-neutral-600"
                                  >
                                    {loadingAdSets.has(campaign.id) ? (
                                      <ArrowPathIcon className="h-4 w-4 animate-spin" />
                                    ) : isExpanded ? (
                                      <ChevronDownIcon className="h-4 w-4" />
                                    ) : (
                                      <ChevronRightIcon className="h-4 w-4" />
                                    )}
                                  </button>
                                )}
                                <div>
                                  <div className="text-sm font-medium text-neutral-900">{campaign.name}</div>
                                  <div className="text-xs text-neutral-500">ID: {campaign.id}</div>
                                </div>
                              </div>
                            </td>
                            <td className="px-6 py-4 whitespace-nowrap">{getStatusBadge(campaign)}</td>
                            {activeTab !== 'klaviyo' && (
                              <>
                                <td className="px-6 py-4 whitespace-nowrap text-sm text-neutral-900">
                                  <div className="flex items-center gap-1">
                                    {campaign.dailyBudget
                                      ? formatCurrency(campaign.dailyBudget)
                                      : campaign.budget
                                      ? formatCurrency(campaign.budget)
                                      : 'N/A'}
                                    {activeTab === 'meta' && (campaign.dailyBudget || campaign.budget) && (
                                      <button
                                        onClick={() => openBudgetModal(campaign)}
                                        className="text-neutral-400 hover:text-brand-purple"
                                        title="Edit budget"
                                      >
                                        <PencilIcon className="h-3 w-3" />
                                      </button>
                                    )}
                                  </div>
                                </td>
                                <td className="px-6 py-4 whitespace-nowrap text-sm text-neutral-900">
                                  {campaign.metrics?.spend
                                    ? formatCurrency(campaign.metrics.spend)
                                    : 'N/A'}
                                </td>
                                <td className="px-6 py-4 whitespace-nowrap text-sm text-neutral-900">
                                  {campaign.metrics?.impressions
                                    ? formatNumber(campaign.metrics.impressions)
                                    : 'N/A'}
                                </td>
                                <td className="px-6 py-4 whitespace-nowrap text-sm text-neutral-900">
                                  {campaign.metrics?.clicks
                                    ? formatNumber(campaign.metrics.clicks)
                                    : 'N/A'}
                                </td>
                                <td className="px-6 py-4 whitespace-nowrap text-sm text-neutral-900">
                                  {campaign.metrics?.ctr
                                    ? `${campaign.metrics.ctr.toFixed(2)}%`
                                    : 'N/A'}
                                </td>
                              </>
                            )}
                            {activeTab === 'klaviyo' && (
                              <>
                                <td className="px-6 py-4 whitespace-nowrap text-sm text-neutral-900">
                                  <span className="capitalize">{campaign.channel || 'email'}</span>
                                </td>
                                <td className="px-6 py-4 whitespace-nowrap text-sm text-neutral-900">
                                  {campaign.metrics?.sent
                                    ? formatNumber(campaign.metrics.sent)
                                    : 'N/A'}
                                </td>
                                <td className="px-6 py-4 whitespace-nowrap text-sm text-neutral-900">
                                  {campaign.metrics?.uniqueOpens
                                    ? formatNumber(campaign.metrics.uniqueOpens)
                                    : 'N/A'}
                                </td>
                                <td className="px-6 py-4 whitespace-nowrap text-sm text-neutral-900">
                                  {campaign.metrics?.uniqueClicks
                                    ? formatNumber(campaign.metrics.uniqueClicks)
                                    : 'N/A'}
                                </td>
                              </>
                            )}
                            <td className="px-6 py-4 whitespace-nowrap text-right text-sm font-medium">
                              <div className="flex items-center justify-end gap-2">
                                {activeTab === 'meta' && (
                                  <>
                                    <button
                                      onClick={() => openBudgetModal(campaign)}
                                      className="text-neutral-400 hover:text-brand-purple"
                                      title="Edit budget"
                                    >
                                      <CurrencyDollarIcon className="h-4 w-4" />
                                    </button>
                                    <button
                                      onClick={() => openScheduleModal(campaign)}
                                      className="text-neutral-400 hover:text-brand-purple"
                                      title="Edit schedule"
                                    >
                                      <CalendarIcon className="h-4 w-4" />
                                    </button>
                                    <button
                                      onClick={() => openDuplicateModal(campaign)}
                                      className="text-neutral-400 hover:text-brand-purple"
                                      title="Duplicate campaign"
                                    >
                                      <DocumentDuplicateIcon className="h-4 w-4" />
                                    </button>
                                  </>
                                )}
                                {canToggle ? (
                                  <button
                                    onClick={() => updateCampaignStatus(campaign.id, !isActive)}
                                    disabled={isUpdating}
                                    className={classNames(
                                      'inline-flex items-center gap-2 px-3 py-1.5 rounded-md text-sm font-medium transition-colors',
                                      isActive
                                        ? 'bg-yellow-100 text-yellow-800 hover:bg-yellow-200'
                                        : 'bg-green-100 text-green-800 hover:bg-green-200',
                                      isUpdating && 'opacity-50 cursor-not-allowed'
                                    )}
                                  >
                                    {isUpdating ? (
                                      <>
                                        <ArrowPathIcon className="h-4 w-4 animate-spin" />
                                        Updating...
                                      </>
                                    ) : isActive ? (
                                      <>
                                        <PauseIcon className="h-4 w-4" />
                                        {activeTab === 'klaviyo' ? 'Cancel' : 'Pause'}
                                      </>
                                    ) : (
                                      <>
                                        <PlayIcon className="h-4 w-4" />
                                        {activeTab === 'klaviyo' ? 'N/A' : 'Enable'}
                                      </>
                                    )}
                                  </button>
                                ) : (
                                  <span className="text-neutral-400 text-xs">N/A</span>
                                )}
                              </div>
                            </td>
                          </tr>
                          
                          {/* Expanded Ad Sets (Meta only) */}
                          {activeTab === 'meta' && isExpanded && adSets.length > 0 && (
                            <>
                              {adSets.map((adSet) => {
                                const adSetItemId = `adset-${adSet.id}`;
                                const isAdSetSelected = selectedItems.has(adSetItemId);
                                const isAdSetActive = adSet.status === 'ACTIVE';
                                const isAdSetUpdating = updatingCampaigns.has(`adset-${adSet.id}`);
                                const ads = adSetAds[adSet.id] || [];
                                const isAdSetExpanded = expandedAdSets.has(adSet.id);

                                return (
                                  <React.Fragment key={adSet.id}>
                                    <tr className={classNames('bg-neutral-50 hover:bg-neutral-100', isAdSetSelected && 'bg-blue-100')}>
                                      <td className="px-6 py-3">
                                        <input
                                          type="checkbox"
                                          checked={isAdSetSelected}
                                          onChange={() => toggleItemSelection(adSetItemId)}
                                          className="rounded border-neutral-300 text-brand-purple focus:ring-brand-purple"
                                        />
                                      </td>
                                      <td className="px-6 py-3">
                                        <div className="flex items-center gap-2 pl-6">
                                          <button
                                            onClick={() => {
                                              if (!adSetAds[adSet.id]) {
                                                fetchAds(adSet.id);
                                              } else {
                                                toggleAdSetExpansion(adSet.id);
                                              }
                                            }}
                                            className="text-neutral-400 hover:text-neutral-600"
                                          >
                                            {loadingAds.has(adSet.id) ? (
                                              <ArrowPathIcon className="h-4 w-4 animate-spin" />
                                            ) : isAdSetExpanded ? (
                                              <ChevronDownIcon className="h-4 w-4" />
                                            ) : (
                                              <ChevronRightIcon className="h-4 w-4" />
                                            )}
                                          </button>
                                          <div>
                                            <div className="text-sm font-medium text-neutral-700">{adSet.name}</div>
                                            <div className="text-xs text-neutral-500">Ad Set ID: {adSet.id}</div>
                                          </div>
                                        </div>
                                      </td>
                                      <td className="px-6 py-3 whitespace-nowrap">{getStatusBadge(adSet)}</td>
                                      <td className="px-6 py-3 whitespace-nowrap text-sm text-neutral-700">
                                        {adSet.dailyBudget ? formatCurrency(adSet.dailyBudget) : 'N/A'}
                                      </td>
                                      <td colSpan="4" className="px-6 py-3"></td>
                                      <td className="px-6 py-3 whitespace-nowrap text-right">
                                        <button
                                          onClick={() => updateAdSetStatus(adSet.id, !isAdSetActive)}
                                          disabled={isAdSetUpdating}
                                          className={classNames(
                                            'inline-flex items-center gap-2 px-3 py-1.5 rounded-md text-sm font-medium transition-colors',
                                            isAdSetActive
                                              ? 'bg-yellow-100 text-yellow-800 hover:bg-yellow-200'
                                              : 'bg-green-100 text-green-800 hover:bg-green-200',
                                            isAdSetUpdating && 'opacity-50 cursor-not-allowed'
                                          )}
                                        >
                                          {isAdSetUpdating ? (
                                            <>
                                              <ArrowPathIcon className="h-4 w-4 animate-spin" />
                                              Updating...
                                            </>
                                          ) : isAdSetActive ? (
                                            <>
                                              <PauseIcon className="h-4 w-4" />
                                              Pause
                                            </>
                                          ) : (
                                            <>
                                              <PlayIcon className="h-4 w-4" />
                                              Enable
                                            </>
                                          )}
                                        </button>
                                      </td>
                                    </tr>
                                    
                                    {/* Expanded Ads */}
                                    {isAdSetExpanded && ads.length > 0 && (
                                      <>
                                        {ads.map((ad) => {
                                          const adItemId = `ad-${ad.id}`;
                                          const isAdSelected = selectedItems.has(adItemId);
                                          const isAdActive = ad.status === 'ACTIVE';
                                          const isAdUpdating = updatingCampaigns.has(`ad-${ad.id}`);

                                          return (
                                            <tr key={ad.id} className={classNames('bg-neutral-25 hover:bg-neutral-50', isAdSelected && 'bg-blue-50')}>
                                              <td className="px-6 py-2">
                                                <input
                                                  type="checkbox"
                                                  checked={isAdSelected}
                                                  onChange={() => toggleItemSelection(adItemId)}
                                                  className="rounded border-neutral-300 text-brand-purple focus:ring-brand-purple"
                                                />
                                              </td>
                                              <td className="px-6 py-2">
                                                <div className="pl-12">
                                                  <div className="text-sm text-neutral-600">{ad.name}</div>
                                                  <div className="text-xs text-neutral-400">Ad ID: {ad.id}</div>
                                                </div>
                                              </td>
                                              <td className="px-6 py-2 whitespace-nowrap">{getStatusBadge(ad)}</td>
                                              <td colSpan="5" className="px-6 py-2"></td>
                                              <td className="px-6 py-2 whitespace-nowrap text-right">
                                                <button
                                                  onClick={() => updateAdStatus(ad.id, !isAdActive)}
                                                  disabled={isAdUpdating}
                                                  className={classNames(
                                                    'inline-flex items-center gap-2 px-3 py-1.5 rounded-md text-sm font-medium transition-colors',
                                                    isAdActive
                                                      ? 'bg-yellow-100 text-yellow-800 hover:bg-yellow-200'
                                                      : 'bg-green-100 text-green-800 hover:bg-green-200',
                                                    isAdUpdating && 'opacity-50 cursor-not-allowed'
                                                  )}
                                                >
                                                  {isAdUpdating ? (
                                                    <>
                                                      <ArrowPathIcon className="h-4 w-4 animate-spin" />
                                                      Updating...
                                                    </>
                                                  ) : isAdActive ? (
                                                    <>
                                                      <PauseIcon className="h-4 w-4" />
                                                      Pause
                                                    </>
                                                  ) : (
                                                    <>
                                                      <PlayIcon className="h-4 w-4" />
                                                      Enable
                                                    </>
                                                  )}
                                                </button>
                                              </td>
                                            </tr>
                                          );
                                        })}
                                      </>
                                    )}
                                  </React.Fragment>
                                );
                              })}
                            </>
                          )}
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

      {/* Budget Modal */}
      <Transition show={budgetModalOpen} as={Fragment}>
        <Dialog as="div" className="relative z-50" onClose={() => setBudgetModalOpen(false)}>
          <Transition.Child
            as={Fragment}
            enter="ease-out duration-300"
            enterFrom="opacity-0"
            enterTo="opacity-100"
            leave="ease-in duration-200"
            leaveFrom="opacity-100"
            leaveTo="opacity-0"
          >
            <div className="fixed inset-0 bg-black bg-opacity-25" />
          </Transition.Child>

          <div className="fixed inset-0 overflow-y-auto">
            <div className="flex min-h-full items-center justify-center p-4">
              <Transition.Child
                as={Fragment}
                enter="ease-out duration-300"
                enterFrom="opacity-0 scale-95"
                enterTo="opacity-100 scale-100"
                leave="ease-in duration-200"
                leaveFrom="opacity-100 scale-100"
                leaveTo="opacity-0 scale-95"
              >
                <Dialog.Panel className="w-full max-w-md transform overflow-hidden rounded-2xl bg-white p-6 shadow-xl transition-all">
                  <Dialog.Title className="text-lg font-medium leading-6 text-neutral-900 mb-4">
                    Edit Budget - {selectedCampaign?.name}
                  </Dialog.Title>
                  
                  <div className="space-y-4">
                    <div>
                      <label className="block text-sm font-medium text-neutral-700 mb-1">
                        Daily Budget ($)
                      </label>
                      <input
                        type="number"
                        step="0.01"
                        value={budgetForm.dailyBudget}
                        onChange={(e) => setBudgetForm({ ...budgetForm, dailyBudget: e.target.value })}
                        className="w-full px-3 py-2 border border-neutral-300 rounded-md focus:ring-2 focus:ring-brand-purple focus:border-transparent"
                        placeholder="0.00"
                      />
                    </div>
                    
                    <div>
                      <label className="block text-sm font-medium text-neutral-700 mb-1">
                        Lifetime Budget ($)
                      </label>
                      <input
                        type="number"
                        step="0.01"
                        value={budgetForm.lifetimeBudget}
                        onChange={(e) => setBudgetForm({ ...budgetForm, lifetimeBudget: e.target.value })}
                        className="w-full px-3 py-2 border border-neutral-300 rounded-md focus:ring-2 focus:ring-brand-purple focus:border-transparent"
                        placeholder="0.00"
                      />
                      <p className="mt-1 text-xs text-neutral-500">
                        Leave empty to keep current value
                      </p>
                    </div>
                  </div>

                  <div className="mt-6 flex justify-end gap-3">
                    <button
                      onClick={() => setBudgetModalOpen(false)}
                      className="px-4 py-2 text-sm font-medium text-neutral-700 bg-white border border-neutral-300 rounded-md hover:bg-neutral-50"
                    >
                      Cancel
                    </button>
                    <button
                      onClick={handleBudgetUpdate}
                      className="px-4 py-2 text-sm font-medium text-white bg-brand-purple rounded-md hover:bg-brand-navy"
                    >
                      Update Budget
                    </button>
                  </div>
                </Dialog.Panel>
              </Transition.Child>
            </div>
          </div>
        </Dialog>
      </Transition>

      {/* Schedule Modal */}
      <Transition show={scheduleModalOpen} as={Fragment}>
        <Dialog as="div" className="relative z-50" onClose={() => setScheduleModalOpen(false)}>
          <Transition.Child
            as={Fragment}
            enter="ease-out duration-300"
            enterFrom="opacity-0"
            enterTo="opacity-100"
            leave="ease-in duration-200"
            leaveFrom="opacity-100"
            leaveTo="opacity-0"
          >
            <div className="fixed inset-0 bg-black bg-opacity-25" />
          </Transition.Child>

          <div className="fixed inset-0 overflow-y-auto">
            <div className="flex min-h-full items-center justify-center p-4">
              <Transition.Child
                as={Fragment}
                enter="ease-out duration-300"
                enterFrom="opacity-0 scale-95"
                enterTo="opacity-100 scale-100"
                leave="ease-in duration-200"
                leaveFrom="opacity-100 scale-100"
                leaveTo="opacity-0 scale-95"
              >
                <Dialog.Panel className="w-full max-w-md transform overflow-hidden rounded-2xl bg-white p-6 shadow-xl transition-all">
                  <Dialog.Title className="text-lg font-medium leading-6 text-neutral-900 mb-4">
                    Edit Schedule - {selectedCampaign?.name}
                  </Dialog.Title>
                  
                  <div className="space-y-4">
                    <div>
                      <label className="block text-sm font-medium text-neutral-700 mb-1">
                        Start Date & Time
                      </label>
                      <input
                        type="datetime-local"
                        value={scheduleForm.startTime}
                        onChange={(e) => setScheduleForm({ ...scheduleForm, startTime: e.target.value })}
                        className="w-full px-3 py-2 border border-neutral-300 rounded-md focus:ring-2 focus:ring-brand-purple focus:border-transparent"
                      />
                    </div>
                    
                    <div>
                      <label className="block text-sm font-medium text-neutral-700 mb-1">
                        End Date & Time
                      </label>
                      <input
                        type="datetime-local"
                        value={scheduleForm.endTime}
                        onChange={(e) => setScheduleForm({ ...scheduleForm, endTime: e.target.value })}
                        className="w-full px-3 py-2 border border-neutral-300 rounded-md focus:ring-2 focus:ring-brand-purple focus:border-transparent"
                      />
                      <p className="mt-1 text-xs text-neutral-500">
                        Leave empty for no end date
                      </p>
                    </div>
                  </div>

                  <div className="mt-6 flex justify-end gap-3">
                    <button
                      onClick={() => setScheduleModalOpen(false)}
                      className="px-4 py-2 text-sm font-medium text-neutral-700 bg-white border border-neutral-300 rounded-md hover:bg-neutral-50"
                    >
                      Cancel
                    </button>
                    <button
                      onClick={handleScheduleUpdate}
                      className="px-4 py-2 text-sm font-medium text-white bg-brand-purple rounded-md hover:bg-brand-navy"
                    >
                      Update Schedule
                    </button>
                  </div>
                </Dialog.Panel>
              </Transition.Child>
            </div>
          </div>
        </Dialog>
      </Transition>

      {/* Duplicate Modal */}
      <Transition show={duplicateModalOpen} as={Fragment}>
        <Dialog as="div" className="relative z-50" onClose={() => setDuplicateModalOpen(false)}>
          <Transition.Child
            as={Fragment}
            enter="ease-out duration-300"
            enterFrom="opacity-0"
            enterTo="opacity-100"
            leave="ease-in duration-200"
            leaveFrom="opacity-100"
            leaveTo="opacity-0"
          >
            <div className="fixed inset-0 bg-black bg-opacity-25" />
          </Transition.Child>

          <div className="fixed inset-0 overflow-y-auto">
            <div className="flex min-h-full items-center justify-center p-4">
              <Transition.Child
                as={Fragment}
                enter="ease-out duration-300"
                enterFrom="opacity-0 scale-95"
                enterTo="opacity-100 scale-100"
                leave="ease-in duration-200"
                leaveFrom="opacity-100 scale-100"
                leaveTo="opacity-0 scale-95"
              >
                <Dialog.Panel className="w-full max-w-md transform overflow-hidden rounded-2xl bg-white p-6 shadow-xl transition-all">
                  <Dialog.Title className="text-lg font-medium leading-6 text-neutral-900 mb-4">
                    Duplicate Campaign - {selectedCampaign?.name}
                  </Dialog.Title>
                  
                  <div className="space-y-4">
                    <div>
                      <label className="block text-sm font-medium text-neutral-700 mb-1">
                        New Campaign Name
                      </label>
                      <input
                        type="text"
                        value={duplicateForm.newName}
                        onChange={(e) => setDuplicateForm({ ...duplicateForm, newName: e.target.value })}
                        className="w-full px-3 py-2 border border-neutral-300 rounded-md focus:ring-2 focus:ring-brand-purple focus:border-transparent"
                        placeholder="Campaign Name"
                      />
                    </div>
                    
                    <div>
                      <label className="block text-sm font-medium text-neutral-700 mb-1">
                        Initial Status
                      </label>
                      <select
                        value={duplicateForm.status}
                        onChange={(e) => setDuplicateForm({ ...duplicateForm, status: e.target.value })}
                        className="w-full px-3 py-2 border border-neutral-300 rounded-md focus:ring-2 focus:ring-brand-purple focus:border-transparent"
                      >
                        <option value="PAUSED">Paused</option>
                        <option value="ACTIVE">Active</option>
                      </select>
                      <p className="mt-1 text-xs text-neutral-500">
                        New campaign will be created paused by default for safety
                      </p>
                    </div>
                  </div>

                  <div className="mt-6 flex justify-end gap-3">
                    <button
                      onClick={() => setDuplicateModalOpen(false)}
                      className="px-4 py-2 text-sm font-medium text-neutral-700 bg-white border border-neutral-300 rounded-md hover:bg-neutral-50"
                    >
                      Cancel
                    </button>
                    <button
                      onClick={handleDuplicateCampaign}
                      disabled={!duplicateForm.newName.trim()}
                      className="px-4 py-2 text-sm font-medium text-white bg-brand-purple rounded-md hover:bg-brand-navy disabled:opacity-50 disabled:cursor-not-allowed"
                    >
                      Duplicate Campaign
                    </button>
                  </div>
                </Dialog.Panel>
              </Transition.Child>
            </div>
          </div>
        </Dialog>
      </Transition>
    </div>
  );
}

export default AdsManagerPage;
