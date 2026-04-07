import React, { useState, useEffect } from 'react';
import {
  DocumentTextIcon,
  PlusIcon,
  CheckIcon,
  XMarkIcon,
  PaperAirplaneIcon,
  ArchiveBoxIcon,
  PencilIcon,
} from '@heroicons/react/24/outline';
import { useToast } from '../../hooks/useToast';

/**
 * MarketingCampaignDrafts - Campaign draft management UI
 * For reviewing and pushing AI-generated campaign drafts to platforms
 */
export default function MarketingCampaignDrafts() {
  const [drafts, setDrafts] = useState([]);
  const [loading, setLoading] = useState(true);
  const [selectedDraft, setSelectedDraft] = useState(null);
  const [filter, setFilter] = useState('draft');
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [rejectModalOpen, setRejectModalOpen] = useState(false);
  const [rejectDraftId, setRejectDraftId] = useState(null);
  const [rejectReason, setRejectReason] = useState('');
  const toast = useToast();

  useEffect(() => {
    loadDrafts();
  }, [filter]);

  const loadDrafts = async () => {
    setLoading(true);
    try {
      const res = await fetch(`/api/marketing-command-center/drafts?status=${filter}`);
      if (res.ok) {
        const data = await res.json();
        setDrafts(data);
      }
    } catch (err) {
      console.error('Error loading drafts:', err);
    } finally {
      setLoading(false);
    }
  };

  const handleApprove = async (draftId) => {
    try {
      await fetch(`/api/marketing-command-center/drafts/${draftId}/approve`, {
        method: 'POST',
      });
      loadDrafts();
    } catch (err) {
      console.error('Error approving draft:', err);
    }
  };

  const handleReject = async (draftId, reason) => {
    try {
      await fetch(`/api/marketing-command-center/drafts/${draftId}/reject`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ reason }),
      });
      loadDrafts();
    } catch (err) {
      console.error('Error rejecting draft:', err);
    }
  };

  const handlePush = async (draftId) => {
    try {
      const res = await fetch(`/api/marketing-command-center/drafts/${draftId}/push`, {
        method: 'POST',
      });
      const result = await res.json();
      if (result.success) {
        toast.success('Draft pushed to platform successfully!');
        loadDrafts();
      } else {
        toast.error(`Push failed: ${result.error}`);
      }
    } catch (err) {
      console.error('Error pushing draft:', err);
    }
  };

  const handleArchive = async (draftId) => {
    try {
      await fetch(`/api/marketing-command-center/drafts/${draftId}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ status: 'archived' }),
      });
      loadDrafts();
    } catch (err) {
      console.error('Error archiving draft:', err);
    }
  };

  return (
    <div className="p-6 space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <DocumentTextIcon className="h-6 w-6 text-brand-navy" />
          <h2 className="text-lg font-semibold text-neutral-900">Campaign Drafts</h2>
        </div>
        <div className="flex items-center gap-3">
          <select
            value={filter}
            onChange={(e) => setFilter(e.target.value)}
            className="text-sm border border-neutral-200 rounded-lg px-3 py-1.5"
          >
            <option value="draft">Pending Review</option>
            <option value="approved">Approved</option>
            <option value="pushed">Pushed</option>
            <option value="rejected">Rejected</option>
            <option value="">All</option>
          </select>
          <button
            onClick={() => setShowCreateModal(true)}
            className="flex items-center gap-1 text-sm text-white bg-brand-navy
                     hover:bg-brand-navy/90 rounded-lg px-3 py-1.5"
          >
            <PlusIcon className="h-4 w-4" />
            New Draft
          </button>
        </div>
      </div>

      {/* Drafts List */}
      {loading ? (
        <div className="space-y-4">
          {[1, 2, 3].map(i => (
            <div key={i} className="bg-white rounded-xl border border-neutral-200 p-6 animate-pulse">
              <div className="h-5 bg-neutral-200 rounded w-1/3 mb-3" />
              <div className="h-4 bg-neutral-100 rounded w-2/3" />
            </div>
          ))}
        </div>
      ) : drafts.length === 0 ? (
        <div className="bg-white rounded-xl border border-neutral-200 p-12 text-center">
          <DocumentTextIcon className="h-12 w-12 text-neutral-300 mx-auto mb-4" />
          <h3 className="text-lg font-medium text-neutral-900 mb-2">No Campaign Drafts</h3>
          <p className="text-sm text-neutral-500 mb-4">
            Ask the AI to create a campaign draft, or create one manually.
          </p>
          <button
            onClick={() => setShowCreateModal(true)}
            className="inline-flex items-center gap-2 text-sm text-white bg-brand-navy
                     hover:bg-brand-navy/90 rounded-lg px-4 py-2"
          >
            <PlusIcon className="h-4 w-4" />
            Create Draft
          </button>
        </div>
      ) : (
        <div className="space-y-4">
          {drafts.map(draft => (
            <DraftCard
              key={draft.id}
              draft={draft}
              onSelect={() => setSelectedDraft(draft)}
              onApprove={handleApprove}
              onReject={handleReject}
              onPush={handlePush}
              onArchive={handleArchive}
              onOpenRejectModal={(id) => { setRejectDraftId(id); setRejectReason(''); setRejectModalOpen(true); }}
            />
          ))}
        </div>
      )}

      {/* Draft Detail Modal */}
      {selectedDraft && (
        <DraftDetailModal
          draft={selectedDraft}
          onClose={() => setSelectedDraft(null)}
          onApprove={handleApprove}
          onReject={handleReject}
          onPush={handlePush}
          onOpenRejectModal={(id) => { setRejectDraftId(id); setRejectReason(''); setRejectModalOpen(true); }}
        />
      )}

      {/* Create Draft Modal */}
      {showCreateModal && (
        <CreateDraftModal
          onClose={() => setShowCreateModal(false)}
          onCreated={() => {
            setShowCreateModal(false);
            loadDrafts();
          }}
        />
      )}

      {/* Reject Reason Modal */}
      {rejectModalOpen && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-xl shadow-xl w-full max-w-md">
            <div className="p-6 border-b">
              <h2 className="text-lg font-semibold text-neutral-900">Reject Draft</h2>
            </div>
            <div className="p-6">
              <label className="block text-sm font-medium text-neutral-700 mb-2">Rejection reason (optional)</label>
              <textarea
                value={rejectReason}
                onChange={(e) => setRejectReason(e.target.value)}
                placeholder="Enter reason for rejection..."
                rows={3}
                className="w-full border border-neutral-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-brand-purple"
                autoFocus
              />
            </div>
            <div className="flex justify-end gap-3 p-6 border-t">
              <button
                onClick={() => setRejectModalOpen(false)}
                className="px-4 py-2 text-sm text-neutral-600 hover:bg-neutral-100 rounded-lg"
              >
                Cancel
              </button>
              <button
                onClick={() => {
                  handleReject(rejectDraftId, rejectReason || null);
                  setRejectModalOpen(false);
                }}
                className="px-4 py-2 text-sm text-white bg-red-600 hover:bg-red-700 rounded-lg"
              >
                Reject
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

function DraftCard({ draft, onSelect, onApprove, onReject, onPush, onArchive, onOpenRejectModal }) {
  const statusColors = {
    draft: 'bg-yellow-100 text-yellow-700',
    approved: 'bg-green-100 text-green-700',
    pushed: 'bg-blue-100 text-blue-700',
    rejected: 'bg-red-100 text-red-700',
    archived: 'bg-neutral-100 text-neutral-500',
  };

  const platformColors = {
    meta: 'text-blue-600',
    google: 'text-green-600',
    tiktok: 'text-pink-600',
    linkedin: 'text-sky-600',
  };

  return (
    <div className="bg-white rounded-xl border border-neutral-200 p-6 hover:shadow-md transition-shadow">
      <div className="flex items-start justify-between">
        <div className="flex-1 cursor-pointer" onClick={onSelect}>
          <div className="flex items-center gap-3 mb-2">
            <h3 className="text-base font-semibold text-neutral-900">{draft.name}</h3>
            <span className={`text-xs px-2 py-0.5 rounded-full ${statusColors[draft.status]}`}>
              {draft.status}
            </span>
          </div>
          <p className={`text-sm font-medium ${platformColors[draft.platform?.toLowerCase()] || 'text-neutral-600'}`}>
            {draft.platform} - {draft.campaign_type}
          </p>
          {draft.ai_reasoning && (
            <p className="text-sm text-neutral-500 mt-2 line-clamp-2">{draft.ai_reasoning}</p>
          )}
          <p className="text-xs text-neutral-400 mt-2">
            Created {new Date(draft.created_at).toLocaleDateString()}
            {draft.created_by && ` by ${draft.created_by}`}
          </p>
        </div>
        <div className="flex items-center gap-1">
          {draft.status === 'draft' && (
            <>
              <button
                onClick={() => onApprove(draft.id)}
                className="p-2 text-neutral-500 hover:text-green-600 hover:bg-green-50 rounded-lg"
                title="Approve"
              >
                <CheckIcon className="h-5 w-5" />
              </button>
              <button
                onClick={() => onOpenRejectModal(draft.id)}
                className="p-2 text-neutral-500 hover:text-red-600 hover:bg-red-50 rounded-lg"
                title="Reject"
              >
                <XMarkIcon className="h-5 w-5" />
              </button>
            </>
          )}
          {draft.status === 'approved' && (
            <button
              onClick={() => onPush(draft.id)}
              className="p-2 text-neutral-500 hover:text-brand-navy hover:bg-brand-navy/10 rounded-lg"
              title="Push to platform"
            >
              <PaperAirplaneIcon className="h-5 w-5" />
            </button>
          )}
          {['draft', 'rejected'].includes(draft.status) && (
            <button
              onClick={() => onArchive(draft.id)}
              className="p-2 text-neutral-500 hover:text-neutral-700 hover:bg-neutral-100 rounded-lg"
              title="Archive"
            >
              <ArchiveBoxIcon className="h-5 w-5" />
            </button>
          )}
        </div>
      </div>
    </div>
  );
}

function DraftDetailModal({ draft, onClose, onApprove, onReject, onPush, onOpenRejectModal }) {
  const draftData = draft.draft_data || {};

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-xl shadow-xl w-full max-w-2xl max-h-[90vh] overflow-hidden flex flex-col">
        {/* Header */}
        <div className="flex items-center justify-between p-6 border-b">
          <div>
            <h2 className="text-lg font-semibold text-neutral-900">{draft.name}</h2>
            <p className="text-sm text-neutral-500">{draft.platform} - {draft.campaign_type}</p>
          </div>
          <button onClick={onClose} className="text-neutral-400 hover:text-neutral-600 text-2xl">
            &times;
          </button>
        </div>

        {/* Content */}
        <div className="flex-1 overflow-y-auto p-6 space-y-6">
          {/* AI Reasoning */}
          {draft.ai_reasoning && (
            <div className="bg-blue-50 rounded-lg p-4">
              <h4 className="text-sm font-medium text-blue-900 mb-1">AI Reasoning</h4>
              <p className="text-sm text-blue-700">{draft.ai_reasoning}</p>
            </div>
          )}

          {/* Campaign Details */}
          <div>
            <h4 className="text-sm font-medium text-neutral-700 mb-3">Campaign Configuration</h4>
            <div className="space-y-4">
              {/* Objective */}
              {draftData.objective && (
                <div>
                  <label className="text-xs text-neutral-500">Objective</label>
                  <p className="font-medium text-neutral-900">{draftData.objective}</p>
                </div>
              )}

              {/* Budget */}
              {draftData.budget && (
                <div>
                  <label className="text-xs text-neutral-500">Budget</label>
                  <p className="font-medium text-neutral-900">
                    ${draftData.budget.amount} / {draftData.budget.type}
                  </p>
                </div>
              )}

              {/* Targeting */}
              {draftData.targeting && (
                <div>
                  <label className="text-xs text-neutral-500">Targeting</label>
                  <div className="mt-1 space-y-1">
                    {draftData.targeting.locations?.length > 0 && (
                      <p className="text-sm text-neutral-700">
                        <span className="text-neutral-500">Locations:</span> {draftData.targeting.locations.join(', ')}
                      </p>
                    )}
                    {draftData.targeting.ageRange && (
                      <p className="text-sm text-neutral-700">
                        <span className="text-neutral-500">Age:</span> {draftData.targeting.ageRange.min}-{draftData.targeting.ageRange.max}
                      </p>
                    )}
                    {draftData.targeting.interests?.length > 0 && (
                      <p className="text-sm text-neutral-700">
                        <span className="text-neutral-500">Interests:</span> {draftData.targeting.interests.join(', ')}
                      </p>
                    )}
                  </div>
                </div>
              )}

              {/* Creative */}
              {draftData.creative && (
                <div>
                  <label className="text-xs text-neutral-500">Creative</label>
                  <div className="mt-1 bg-neutral-50 rounded-lg p-4 space-y-2">
                    {draftData.creative.headline && (
                      <div>
                        <span className="text-xs text-neutral-500">Headline:</span>
                        <p className="text-sm font-medium text-neutral-900">{draftData.creative.headline}</p>
                      </div>
                    )}
                    {draftData.creative.primaryText && (
                      <div>
                        <span className="text-xs text-neutral-500">Primary Text:</span>
                        <p className="text-sm text-neutral-700">{draftData.creative.primaryText}</p>
                      </div>
                    )}
                    {draftData.creative.description && (
                      <div>
                        <span className="text-xs text-neutral-500">Description:</span>
                        <p className="text-sm text-neutral-700">{draftData.creative.description}</p>
                      </div>
                    )}
                    {draftData.creative.callToAction && (
                      <div>
                        <span className="text-xs text-neutral-500">CTA:</span>
                        <p className="text-sm text-neutral-700">{draftData.creative.callToAction}</p>
                      </div>
                    )}
                  </div>
                </div>
              )}

              {/* Schedule */}
              {draftData.schedule && (
                <div>
                  <label className="text-xs text-neutral-500">Schedule</label>
                  <p className="text-sm text-neutral-700">
                    Start: {draftData.schedule.startDate}
                    {draftData.schedule.endDate && ` | End: ${draftData.schedule.endDate}`}
                  </p>
                </div>
              )}
            </div>
          </div>

          {/* Raw JSON (collapsed) */}
          <details className="group">
            <summary className="text-sm text-neutral-500 cursor-pointer hover:text-neutral-700">
              View raw configuration
            </summary>
            <pre className="mt-2 text-xs bg-neutral-50 rounded-lg p-4 overflow-x-auto">
              {JSON.stringify(draftData, null, 2)}
            </pre>
          </details>
        </div>

        {/* Footer */}
        <div className="p-6 border-t flex justify-between">
          <button
            onClick={onClose}
            className="px-4 py-2 text-sm text-neutral-600 hover:bg-neutral-100 rounded-lg"
          >
            Close
          </button>
          <div className="flex gap-2">
            {draft.status === 'draft' && (
              <>
                <button
                  onClick={() => {
                    onOpenRejectModal(draft.id);
                    onClose();
                  }}
                  className="px-4 py-2 text-sm text-red-600 hover:bg-red-50 rounded-lg"
                >
                  Reject
                </button>
                <button
                  onClick={() => {
                    onApprove(draft.id);
                    onClose();
                  }}
                  className="px-4 py-2 text-sm text-white bg-green-600 hover:bg-green-700 rounded-lg"
                >
                  Approve
                </button>
              </>
            )}
            {draft.status === 'approved' && (
              <button
                onClick={() => {
                  onPush(draft.id);
                  onClose();
                }}
                className="flex items-center gap-2 px-4 py-2 text-sm text-white bg-brand-navy hover:bg-brand-navy/90 rounded-lg"
              >
                <PaperAirplaneIcon className="h-4 w-4" />
                Push to {draft.platform}
              </button>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

function CreateDraftModal({ onClose, onCreated }) {
  const [form, setForm] = useState({
    platform: 'meta',
    campaignType: 'new_campaign',
    name: '',
    draftData: {
      objective: 'CONVERSIONS',
      budget: { type: 'daily', amount: 50 },
      targeting: { locations: ['United States'], ageRange: { min: 25, max: 55 } },
      creative: { headline: '', primaryText: '', callToAction: 'LEARN_MORE' },
    },
  });
  const [submitting, setSubmitting] = useState(false);

  const handleSubmit = async (e) => {
    e.preventDefault();
    setSubmitting(true);
    try {
      const res = await fetch('/api/marketing-command-center/drafts', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(form),
      });
      if (res.ok) {
        onCreated();
      }
    } catch (err) {
      console.error('Error creating draft:', err);
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-xl shadow-xl w-full max-w-lg max-h-[90vh] overflow-y-auto">
        <div className="p-6 border-b">
          <h2 className="text-lg font-semibold text-neutral-900">Create Campaign Draft</h2>
        </div>
        <form onSubmit={handleSubmit} className="p-6 space-y-4">
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-neutral-700 mb-1">Platform</label>
              <select
                value={form.platform}
                onChange={(e) => setForm({ ...form, platform: e.target.value })}
                className="w-full border border-neutral-200 rounded-lg px-3 py-2"
              >
                <option value="meta">Meta</option>
                <option value="google">Google</option>
                <option value="tiktok">TikTok</option>
                <option value="linkedin">LinkedIn</option>
              </select>
            </div>
            <div>
              <label className="block text-sm font-medium text-neutral-700 mb-1">Type</label>
              <select
                value={form.campaignType}
                onChange={(e) => setForm({ ...form, campaignType: e.target.value })}
                className="w-full border border-neutral-200 rounded-lg px-3 py-2"
              >
                <option value="new_campaign">New Campaign</option>
                <option value="ad_copy">Ad Copy</option>
                <option value="targeting">Targeting</option>
                <option value="creative">Creative</option>
              </select>
            </div>
          </div>

          <div>
            <label className="block text-sm font-medium text-neutral-700 mb-1">Campaign Name</label>
            <input
              type="text"
              value={form.name}
              onChange={(e) => setForm({ ...form, name: e.target.value })}
              placeholder="e.g., Summer Chess Campaign"
              className="w-full border border-neutral-200 rounded-lg px-3 py-2"
              required
            />
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-neutral-700 mb-1">Daily Budget</label>
              <input
                type="number"
                value={form.draftData.budget.amount}
                onChange={(e) => setForm({
                  ...form,
                  draftData: {
                    ...form.draftData,
                    budget: { ...form.draftData.budget, amount: parseInt(e.target.value) || 0 },
                  },
                })}
                className="w-full border border-neutral-200 rounded-lg px-3 py-2"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-neutral-700 mb-1">Objective</label>
              <select
                value={form.draftData.objective}
                onChange={(e) => setForm({
                  ...form,
                  draftData: { ...form.draftData, objective: e.target.value },
                })}
                className="w-full border border-neutral-200 rounded-lg px-3 py-2"
              >
                <option value="CONVERSIONS">Conversions</option>
                <option value="TRAFFIC">Traffic</option>
                <option value="REACH">Reach</option>
                <option value="AWARENESS">Awareness</option>
              </select>
            </div>
          </div>

          <div>
            <label className="block text-sm font-medium text-neutral-700 mb-1">Headline</label>
            <input
              type="text"
              value={form.draftData.creative.headline}
              onChange={(e) => setForm({
                ...form,
                draftData: {
                  ...form.draftData,
                  creative: { ...form.draftData.creative, headline: e.target.value },
                },
              })}
              placeholder="Your ad headline"
              className="w-full border border-neutral-200 rounded-lg px-3 py-2"
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-neutral-700 mb-1">Primary Text</label>
            <textarea
              value={form.draftData.creative.primaryText}
              onChange={(e) => setForm({
                ...form,
                draftData: {
                  ...form.draftData,
                  creative: { ...form.draftData.creative, primaryText: e.target.value },
                },
              })}
              placeholder="Your ad copy"
              rows={3}
              className="w-full border border-neutral-200 rounded-lg px-3 py-2"
            />
          </div>

          <div className="flex justify-end gap-3 pt-4">
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2 text-sm text-neutral-600 hover:bg-neutral-100 rounded-lg"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={submitting || !form.name.trim()}
              className="px-4 py-2 text-sm text-white bg-brand-navy hover:bg-brand-navy/90 rounded-lg disabled:opacity-50"
            >
              {submitting ? 'Creating...' : 'Create Draft'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
