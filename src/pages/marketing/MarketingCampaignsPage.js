import React, { useState, useEffect } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import MarketingCampaignDrafts from '../../components/marketing/MarketingCampaignDrafts';
import ConfirmationModal from '../../components/ConfirmationModal';
import AlertDialog from '../../components/ui/AlertDialog';
import {
  PlusIcon,
  CheckCircleIcon,
  XMarkIcon,
  RocketLaunchIcon,
  PencilSquareIcon,
  TrashIcon,
  ArrowUpOnSquareIcon,
} from '@heroicons/react/24/outline';

/**
 * MarketingCampaignsPage - Campaign Manager page within Marketing Hub
 *
 * Shows campaign drafts with ability to create new campaigns via wizard
 */
export default function MarketingCampaignsPage() {
  const [searchParams] = useSearchParams();
  const [showCreatedBanner, setShowCreatedBanner] = useState(false);
  const [campaigns, setCampaigns] = useState([]);
  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState('drafts'); // drafts | ai-drafts
  const [alertState, setAlertState] = useState({ isOpen: false, title: '', message: '' });
  const [confirmState, setConfirmState] = useState({ isOpen: false, action: null, title: '', message: '' });

  // Check for newly created campaign
  useEffect(() => {
    if (searchParams.get('created')) {
      setShowCreatedBanner(true);
      // Hide banner after 5 seconds
      const timer = setTimeout(() => setShowCreatedBanner(false), 5000);
      return () => clearTimeout(timer);
    }
  }, [searchParams]);

  // Load campaigns from new API
  useEffect(() => {
    loadCampaigns();
  }, []);

  const loadCampaigns = async () => {
    setLoading(true);
    try {
      const res = await fetch('/api/marketing-command-center/campaigns');
      if (res.ok) {
        const data = await res.json();
        setCampaigns(data);
      }
    } catch (err) {
      console.error('Error loading campaigns:', err);
    } finally {
      setLoading(false);
    }
  };

  const handleDelete = (id) => {
    setConfirmState({
      isOpen: true,
      title: 'Delete Campaign Draft',
      message: 'Are you sure you want to delete this campaign draft?',
      action: async () => {
        try {
          const res = await fetch(`/api/marketing-command-center/campaigns/${id}`, {
            method: 'DELETE',
          });
          if (res.ok) {
            setCampaigns(campaigns.filter(c => c.id !== id));
          }
        } catch (err) {
          console.error('Error deleting campaign:', err);
        }
      },
    });
  };

  const handlePush = async (id, platform) => {
    try {
      const res = await fetch(`/api/marketing-command-center/campaigns/${id}/push-${platform}`, {
        method: 'POST',
      });
      const data = await res.json();
      if (data.success) {
        setAlertState({ isOpen: true, title: 'Success', message: `Campaign pushed to ${platform.charAt(0).toUpperCase() + platform.slice(1)} successfully!` });
        loadCampaigns();
      } else {
        setAlertState({ isOpen: true, title: 'Error', message: `Error: ${data.error}` });
      }
    } catch (err) {
      console.error('Error pushing campaign:', err);
      setAlertState({ isOpen: true, title: 'Error', message: 'Failed to push campaign' });
    }
  };

  const getStatusBadge = (status) => {
    const styles = {
      draft: 'bg-neutral-100 text-neutral-700',
      pending_approval: 'bg-amber-100 text-amber-700',
      approved: 'bg-emerald-100 text-emerald-700',
      publishing: 'bg-blue-100 text-blue-700',
      published: 'bg-green-100 text-green-700',
      error: 'bg-red-100 text-red-700',
    };
    return (
      <span className={`px-2 py-1 text-xs font-medium rounded-full ${styles[status] || styles.draft}`}>
        {status?.replace('_', ' ').replace(/\b\w/g, l => l.toUpperCase()) || 'Draft'}
      </span>
    );
  };

  return (
    <>
      <div className="space-y-6">
        {/* Success Banner */}
        {showCreatedBanner && (
          <div className="flex items-center justify-between p-4 bg-emerald-50 border border-emerald-200 rounded-lg">
            <div className="flex items-center gap-3">
              <CheckCircleIcon className="h-5 w-5 text-emerald-600" />
              <p className="text-sm text-emerald-800">
                Campaign draft created successfully! Review and push to start advertising.
              </p>
            </div>
            <button onClick={() => setShowCreatedBanner(false)} className="text-emerald-500 hover:text-emerald-700">
              <XMarkIcon className="h-5 w-5" />
            </button>
          </div>
        )}

        {/* Page Header */}
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div>
            <h1 className="text-2xl font-bold text-neutral-900">Campaign Manager</h1>
            <p className="mt-1 text-sm text-neutral-500">
              Create and manage Meta and Google ad campaigns
            </p>
          </div>
          <Link
            to="/marketing/campaigns/create"
            className="inline-flex items-center gap-2 px-4 py-2 bg-gradient-to-r from-brand-cyan to-brand-purple text-white text-sm font-medium rounded-lg hover:opacity-90 transition-opacity"
          >
            <PlusIcon className="h-4 w-4" />
            Create Campaign
          </Link>
        </div>

        {/* Tabs */}
        <div className="border-b border-neutral-200">
          <nav className="flex gap-6">
            <button
              onClick={() => setActiveTab('drafts')}
              className={`pb-3 text-sm font-medium border-b-2 transition-colors ${
                activeTab === 'drafts'
                  ? 'border-brand-purple text-brand-purple'
                  : 'border-transparent text-neutral-500 hover:text-neutral-700'
              }`}
            >
              Campaign Drafts
              {campaigns.length > 0 && (
                <span className="ml-2 px-2 py-0.5 text-xs bg-neutral-100 rounded-full">
                  {campaigns.length}
                </span>
              )}
            </button>
            <button
              onClick={() => setActiveTab('ai-drafts')}
              className={`pb-3 text-sm font-medium border-b-2 transition-colors ${
                activeTab === 'ai-drafts'
                  ? 'border-brand-purple text-brand-purple'
                  : 'border-transparent text-neutral-500 hover:text-neutral-700'
              }`}
            >
              AI-Generated Drafts
            </button>
          </nav>
        </div>

        {/* Campaign Drafts from Wizard */}
        {activeTab === 'drafts' && (
          <div className="space-y-4">
            {loading ? (
              <div className="flex items-center justify-center py-12">
                <div className="animate-spin h-8 w-8 border-4 border-brand-purple/20 border-t-brand-purple rounded-full" />
              </div>
            ) : campaigns.length > 0 ? (
              <div className="bg-white rounded-xl border border-neutral-200 overflow-hidden">
                <table className="min-w-full divide-y divide-neutral-200">
                  <thead className="bg-neutral-50">
                    <tr>
                      <th className="px-6 py-3 text-left text-xs font-medium text-neutral-500 uppercase tracking-wider">
                        Campaign
                      </th>
                      <th className="px-6 py-3 text-left text-xs font-medium text-neutral-500 uppercase tracking-wider">
                        Platform
                      </th>
                      <th className="px-6 py-3 text-left text-xs font-medium text-neutral-500 uppercase tracking-wider">
                        Budget
                      </th>
                      <th className="px-6 py-3 text-left text-xs font-medium text-neutral-500 uppercase tracking-wider">
                        Status
                      </th>
                      <th className="px-6 py-3 text-left text-xs font-medium text-neutral-500 uppercase tracking-wider">
                        Created
                      </th>
                      <th className="px-6 py-3 text-right text-xs font-medium text-neutral-500 uppercase tracking-wider">
                        Actions
                      </th>
                    </tr>
                  </thead>
                  <tbody className="bg-white divide-y divide-neutral-200">
                    {campaigns.map((campaign) => (
                      <tr key={campaign.id} className="hover:bg-neutral-50">
                        <td className="px-6 py-4 whitespace-nowrap">
                          <div>
                            <p className="text-sm font-medium text-neutral-900">{campaign.name}</p>
                            <p className="text-xs text-neutral-500 capitalize">{campaign.objective?.toLowerCase()}</p>
                          </div>
                        </td>
                        <td className="px-6 py-4 whitespace-nowrap">
                          <span className={`px-2 py-1 text-xs font-medium rounded ${
                            campaign.platform === 'meta' ? 'bg-blue-100 text-blue-700' : 'bg-red-100 text-red-700'
                          }`}>
                            {campaign.platform === 'meta' ? 'Meta' : 'Google'}
                          </span>
                        </td>
                        <td className="px-6 py-4 whitespace-nowrap text-sm text-neutral-700">
                          ${campaign.budget_amount}/{campaign.budget_type === 'daily' ? 'day' : 'total'}
                        </td>
                        <td className="px-6 py-4 whitespace-nowrap">
                          {getStatusBadge(campaign.status)}
                        </td>
                        <td className="px-6 py-4 whitespace-nowrap text-sm text-neutral-500">
                          {new Date(campaign.created_at).toLocaleDateString()}
                        </td>
                        <td className="px-6 py-4 whitespace-nowrap text-right">
                          <div className="flex items-center justify-end gap-2">
                            {campaign.status === 'draft' && (
                              <button
                                onClick={() => handlePush(campaign.id, campaign.platform)}
                                className="p-1.5 text-emerald-600 hover:bg-emerald-50 rounded"
                                title="Push to Platform"
                              >
                                <RocketLaunchIcon className="h-4 w-4" />
                              </button>
                            )}
                            <button
                              onClick={() => handleDelete(campaign.id)}
                              className="p-1.5 text-red-500 hover:bg-red-50 rounded"
                              title="Delete"
                            >
                              <TrashIcon className="h-4 w-4" />
                            </button>
                          </div>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            ) : (
              <div className="text-center py-12 bg-neutral-50 rounded-xl border-2 border-dashed border-neutral-200">
                <RocketLaunchIcon className="h-12 w-12 text-neutral-300 mx-auto mb-4" />
                <p className="text-neutral-600 font-medium">No campaign drafts yet</p>
                <p className="text-sm text-neutral-400 mt-1 mb-4">
                  Create your first campaign using the wizard
                </p>
                <Link
                  to="/marketing/campaigns/create"
                  className="inline-flex items-center gap-2 px-4 py-2 bg-brand-purple text-white text-sm font-medium rounded-lg hover:bg-brand-purple/90"
                >
                  <PlusIcon className="h-4 w-4" />
                  Create Campaign
                </Link>
              </div>
            )}
          </div>
        )}

        {/* AI-Generated Drafts (from MarketingCampaignDrafts component) */}
        {activeTab === 'ai-drafts' && (
          <div className="-mx-4 sm:-mx-6 lg:-mx-8 xl:-mx-12">
            <MarketingCampaignDrafts />
          </div>
        )}
      </div>
      <ConfirmationModal
        isOpen={confirmState.isOpen}
        onClose={() => setConfirmState(s => ({ ...s, isOpen: false }))}
        onConfirm={() => { confirmState.action?.(); setConfirmState(s => ({ ...s, isOpen: false })); }}
        title={confirmState.title}
        message={confirmState.message}
        isDestructive
      />
      <AlertDialog isOpen={alertState.isOpen} onClose={() => setAlertState(s => ({ ...s, isOpen: false }))} title={alertState.title} message={alertState.message} />
    </>
  );
}
