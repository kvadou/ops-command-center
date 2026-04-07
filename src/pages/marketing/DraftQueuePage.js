// src/pages/marketing/DraftQueuePage.js
import React, { useState, useEffect, useCallback } from 'react';
import AlertDialog from '../../components/ui/AlertDialog';
import PromptDialog from '../../components/ui/PromptDialog';
import {
  ClockIcon,
  CheckCircleIcon,
  XCircleIcon,
  ChartBarIcon,
  EyeIcon,
  PlayIcon,
  ArrowPathIcon,
  TrashIcon,
} from '@heroicons/react/24/outline';

const STATUS_CONFIG = {
  draft: { label: 'Draft', color: 'bg-neutral-100 text-neutral-700', icon: ClockIcon },
  approved: { label: 'Approved', color: 'bg-blue-100 text-blue-700', icon: CheckCircleIcon },
  pushed: { label: 'Live', color: 'bg-green-100 text-green-700', icon: PlayIcon },
  rejected: { label: 'Rejected', color: 'bg-red-100 text-red-700', icon: XCircleIcon },
  tracking: { label: 'Tracking', color: 'bg-purple-100 text-purple-700', icon: ChartBarIcon },
};

const PLATFORM_CONFIG = {
  meta: { label: 'Meta', color: 'bg-blue-500' },
  google: { label: 'Google', color: 'bg-green-500' },
  klaviyo: { label: 'Klaviyo', color: 'bg-purple-500' },
  cross_platform: { label: 'Cross-Platform', color: 'bg-neutral-500' },
};

export default function DraftQueuePage() {
  const [drafts, setDrafts] = useState([]);
  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState('pending');
  const [selectedDraft, setSelectedDraft] = useState(null);
  const [alertState, setAlertState] = useState({ isOpen: false, title: '', message: '' });
  const [promptState, setPromptState] = useState({ isOpen: false, title: '', defaultValue: '' });

  const fetchDrafts = useCallback(async () => {
    setLoading(true);
    try {
      const status = activeTab === 'pending' ? 'draft' :
                     activeTab === 'tracking' ? 'pushed' : activeTab;
      const res = await fetch(`/api/marketing-command-center/drafts?status=${status}`);
      if (res.ok) {
        const data = await res.json();
        setDrafts(data);
      }
    } catch (err) {
      console.error('Error fetching drafts:', err);
    } finally {
      setLoading(false);
    }
  }, [activeTab]);

  useEffect(() => {
    fetchDrafts();
  }, [fetchDrafts]);

  const handleApprove = async (draftId) => {
    try {
      const res = await fetch(`/api/marketing-command-center/drafts/${draftId}/approve`, {
        method: 'POST',
      });
      if (res.ok) {
        fetchDrafts();
      }
    } catch (err) {
      console.error('Error approving draft:', err);
    }
  };

  const handleReject = (draftId) => {
    setPromptState({
      isOpen: true,
      title: 'Reject Draft',
      message: 'Reason for rejection (optional):',
      defaultValue: '',
      placeholder: 'Reason...',
      onSubmit: async (reason) => {
        try {
          const res = await fetch(`/api/marketing-command-center/drafts/${draftId}/reject`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ reason }),
          });
          if (res.ok) {
            fetchDrafts();
          }
        } catch (err) {
          console.error('Error rejecting draft:', err);
        }
      },
    });
  };

  const handlePush = async (draftId, platform) => {
    try {
      const endpoint = platform === 'meta'
        ? `/api/marketing-command-center/campaigns/${draftId}/push-meta`
        : `/api/marketing-command-center/campaigns/${draftId}/push-google`;

      const res = await fetch(endpoint, { method: 'POST' });
      if (res.ok) {
        fetchDrafts();
      } else {
        const error = await res.json();
        setAlertState({ isOpen: true, title: 'Error', message: `Push failed: ${error.error || 'Unknown error'}` });
      }
    } catch (err) {
      console.error('Error pushing draft:', err);
    }
  };

  const handleDelete = (draftId, draftName) => {
    setAlertState({
      isOpen: true,
      title: 'Delete Draft',
      message: `Are you sure you want to delete "${draftName}"?`,
      confirmLabel: 'Delete',
      confirmVariant: 'danger',
      onConfirm: async () => {
        try {
          const res = await fetch(`/api/marketing-command-center/campaigns/${draftId}`, {
            method: 'DELETE',
          });
          if (res.ok) {
            fetchDrafts();
          }
        } catch (err) {
          console.error('Error deleting draft:', err);
        }
      },
    });
  };

  const tabs = [
    { id: 'pending', label: 'Pending Review', count: drafts.length },
    { id: 'approved', label: 'Ready to Push' },
    { id: 'tracking', label: 'Tracking Results' },
    { id: 'rejected', label: 'Rejected' },
  ];

  return (
    <>
      <div className="space-y-6">
        {/* Header */}
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-bold text-neutral-900">Draft Queue</h1>
            <p className="text-neutral-500 mt-1">Review and approve AI recommendations</p>
          </div>
          <button
            onClick={fetchDrafts}
            className="flex items-center gap-2 px-4 py-2 text-sm font-medium text-neutral-700 bg-white border border-neutral-200 rounded-lg hover:bg-neutral-50"
          >
            <ArrowPathIcon className="h-4 w-4" />
            Refresh
          </button>
        </div>

        {/* Tabs */}
        <div className="border-b border-neutral-200">
          <nav className="flex gap-6">
            {tabs.map(tab => (
              <button
                key={tab.id}
                onClick={() => setActiveTab(tab.id)}
                className={`pb-3 text-sm font-medium border-b-2 transition-colors ${
                  activeTab === tab.id
                    ? 'border-brand-purple text-brand-purple'
                    : 'border-transparent text-neutral-500 hover:text-neutral-700'
                }`}
              >
                {tab.label}
              </button>
            ))}
          </nav>
        </div>

        {/* Draft List */}
        {loading ? (
          <div className="text-center py-12 text-neutral-500">Loading...</div>
        ) : drafts.length === 0 ? (
          <div className="text-center py-12">
            <ClockIcon className="h-12 w-12 mx-auto text-neutral-300 mb-4" />
            <p className="text-neutral-500">No drafts in this queue</p>
          </div>
        ) : (
          <div className="space-y-4">
            {drafts.map(draft => (
              <DraftCard
                key={draft.id}
                draft={draft}
                onApprove={() => handleApprove(draft.id)}
                onReject={() => handleReject(draft.id)}
                onPush={() => handlePush(draft.id, draft.platform)}
                onDelete={() => handleDelete(draft.id, draft.name)}
                onViewDetails={() => setSelectedDraft(draft)}
              />
            ))}
          </div>
        )}

        {/* Detail Modal */}
        {selectedDraft && (
          <DraftDetailModal
            draft={selectedDraft}
            onClose={() => setSelectedDraft(null)}
            onApprove={() => {
              handleApprove(selectedDraft.id);
              setSelectedDraft(null);
            }}
            onReject={() => {
              handleReject(selectedDraft.id);
              setSelectedDraft(null);
            }}
          />
        )}
      </div>
      <AlertDialog
        isOpen={alertState.isOpen}
        onClose={() => setAlertState(s => ({ ...s, isOpen: false }))}
        title={alertState.title}
        message={alertState.message}
        onConfirm={alertState.onConfirm}
        confirmLabel={alertState.confirmLabel}
        confirmVariant={alertState.confirmVariant}
      />
      <PromptDialog
        isOpen={promptState.isOpen}
        onClose={() => setPromptState(s => ({ ...s, isOpen: false }))}
        onSubmit={(val) => promptState.onSubmit?.(val)}
        title={promptState.title}
        message={promptState.message}
        placeholder={promptState.placeholder}
        defaultValue={promptState.defaultValue || ''}
      />
    </>
  );
}

function DraftCard({ draft, onApprove, onReject, onPush, onDelete, onViewDetails }) {
  const status = STATUS_CONFIG[draft.status] || STATUS_CONFIG.draft;
  const platform = PLATFORM_CONFIG[draft.platform] || PLATFORM_CONFIG.cross_platform;

  return (
    <div className="bg-white rounded-xl border border-neutral-200 p-6 hover:border-brand-purple/30 transition-colors">
      <div className="flex items-start justify-between gap-4">
        <div className="flex items-start gap-4 min-w-0 flex-1">
          {/* Platform badge */}
          <div className={`w-2 h-12 rounded-full flex-shrink-0 ${platform.color}`} />

          <div className="min-w-0">
            <div className="flex items-center gap-2 mb-1">
              <span className="text-xs font-medium text-neutral-500 uppercase">
                {platform.label}
              </span>
              <span className={`px-2 py-0.5 text-xs font-medium rounded-full ${status.color}`}>
                {status.label}
              </span>
            </div>

            <h3 className="text-lg font-semibold text-neutral-900">{draft.name}</h3>

            <p className="text-sm text-neutral-500 mt-1 line-clamp-2">
              {draft.ai_reasoning}
            </p>

            {/* Projected Impact */}
            {draft.projected_impact && (
              <div className="flex gap-4 mt-3 text-sm">
                {draft.projected_impact.estimated_cpl && (
                  <span className="text-neutral-600">
                    Est. CPL: <strong>${draft.projected_impact.estimated_cpl}</strong>
                  </span>
                )}
                {draft.projected_impact.estimated_roas && (
                  <span className="text-neutral-600">
                    Est. ROAS: <strong>{draft.projected_impact.estimated_roas}x</strong>
                  </span>
                )}
              </div>
            )}
          </div>
        </div>

        {/* Actions */}
        <div className="flex items-center gap-2 flex-shrink-0">
          <button
            onClick={onViewDetails}
            className="p-2 text-neutral-400 hover:text-neutral-600 hover:bg-neutral-100 rounded-lg"
            title="View details"
          >
            <EyeIcon className="h-5 w-5" />
          </button>

          <button
            onClick={onDelete}
            className="p-2 text-neutral-400 hover:text-red-600 hover:bg-red-50 rounded-lg"
            title="Delete draft"
          >
            <TrashIcon className="h-5 w-5" />
          </button>

          {draft.status === 'draft' && (
            <>
              <button
                onClick={onApprove}
                className="px-4 py-2 text-sm font-medium text-white bg-green-500 rounded-lg hover:bg-green-600 whitespace-nowrap"
              >
                Approve
              </button>
              <button
                onClick={onReject}
                className="px-4 py-2 text-sm font-medium text-red-600 border border-red-200 rounded-lg hover:bg-red-50 whitespace-nowrap"
              >
                Reject
              </button>
            </>
          )}

          {draft.status === 'approved' && (
            <button
              onClick={onPush}
              className="px-4 py-2 text-sm font-medium text-white bg-brand-purple rounded-lg hover:bg-primary-700 whitespace-nowrap"
            >
              Push to {platform.label}
            </button>
          )}
        </div>
      </div>
    </div>
  );
}

function DraftDetailModal({ draft, onClose, onApprove, onReject }) {
  const [results, setResults] = useState([]);

  useEffect(() => {
    if (draft.status === 'pushed') {
      fetch(`/api/marketing-command-center/results/draft/${draft.id}`)
        .then(res => res.json())
        .then(data => setResults(data))
        .catch(err => console.error(err));
    }
  }, [draft]);

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50">
      <div className="bg-white rounded-xl shadow-xl max-w-2xl w-full max-h-[90vh] overflow-y-auto m-4">
        <div className="p-6 border-b border-neutral-200">
          <div className="flex items-center justify-between">
            <h2 className="text-xl font-bold text-neutral-900">{draft.name}</h2>
            <button onClick={onClose} className="text-neutral-400 hover:text-neutral-600">
              <XCircleIcon className="h-6 w-6" />
            </button>
          </div>
        </div>

        <div className="p-6 space-y-6">
          {/* AI Analysis */}
          <div>
            <h3 className="text-sm font-semibold text-neutral-700 uppercase mb-2">AI Analysis</h3>
            <p className="text-neutral-600 whitespace-pre-wrap">{draft.ai_reasoning}</p>
          </div>

          {/* Draft Data */}
          {draft.draft_data && (
            <div>
              <h3 className="text-sm font-semibold text-neutral-700 uppercase mb-2">Configuration</h3>
              <pre className="bg-neutral-50 p-4 rounded-lg text-sm overflow-x-auto">
                {JSON.stringify(draft.draft_data, null, 2)}
              </pre>
            </div>
          )}

          {/* Projected Impact */}
          {draft.projected_impact && (
            <div>
              <h3 className="text-sm font-semibold text-neutral-700 uppercase mb-2">Projected Impact</h3>
              <div className="grid grid-cols-2 gap-4">
                {Object.entries(draft.projected_impact).map(([key, value]) => (
                  <div key={key} className="bg-neutral-50 p-3 rounded-lg">
                    <div className="text-xs text-neutral-500">{key}</div>
                    <div className="text-lg font-semibold text-neutral-900">{value}</div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Results (if tracking) */}
          {results.length > 0 && (
            <div>
              <h3 className="text-sm font-semibold text-neutral-700 uppercase mb-2">Performance Results</h3>
              <div className="space-y-3">
                {results.map(result => (
                  <div key={result.id} className="bg-neutral-50 p-4 rounded-lg">
                    <div className="text-sm font-medium text-neutral-700 mb-2">
                      {result.snapshot_type.replace('_', ' ').toUpperCase()}
                    </div>
                    <div className="grid grid-cols-4 gap-2 text-sm">
                      <div>
                        <span className="text-neutral-500">Spend:</span>{' '}
                        <strong>${result.metrics?.spend || 0}</strong>
                      </div>
                      <div>
                        <span className="text-neutral-500">Clicks:</span>{' '}
                        <strong>{result.metrics?.clicks || 0}</strong>
                      </div>
                      <div>
                        <span className="text-neutral-500">CPL:</span>{' '}
                        <strong>${result.metrics?.cpl || 0}</strong>
                      </div>
                      <div>
                        <span className="text-neutral-500">ROAS:</span>{' '}
                        <strong>{result.metrics?.roas || 0}x</strong>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>

        {/* Footer Actions */}
        {draft.status === 'draft' && (
          <div className="p-6 border-t border-neutral-200 flex justify-end gap-3">
            <button
              onClick={onReject}
              className="px-4 py-2 text-sm font-medium text-red-600 border border-red-200 rounded-lg hover:bg-red-50"
            >
              Reject
            </button>
            <button
              onClick={onApprove}
              className="px-4 py-2 text-sm font-medium text-white bg-green-500 rounded-lg hover:bg-green-600"
            >
              Approve
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
