import React, { useState } from 'react';
import {
  XMarkIcon,
  CheckIcon,
  XCircleIcon,
  ArrowPathIcon,
  LinkIcon,
} from '@heroicons/react/24/outline';

function formatDate(dateStr) {
  if (!dateStr) return '\u2014';
  return new Date(dateStr).toLocaleDateString('en-US', {
    month: 'short', day: 'numeric', year: 'numeric', hour: 'numeric', minute: '2-digit'
  });
}

export default function ReferralDetailPanel({ referral, onClose, onMatch, onReject, onRefresh }) {
  const [rejecting, setRejecting] = useState(false);
  const [rejectReason, setRejectReason] = useState('');
  const [saving, setSaving] = useState(false);
  const [refreshingPoints, setRefreshingPoints] = useState(false);

  async function handleReject() {
    setSaving(true);
    try {
      const res = await fetch(`/api/referrals/${referral.id}/reject`, {
        method: 'PATCH',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ reason: rejectReason }),
      });
      if (res.ok) {
        onReject();
      }
    } catch (err) {
      console.error('Failed to reject referral', err);
    } finally {
      setSaving(false);
    }
  }

  async function handleRefreshPoints() {
    setRefreshingPoints(true);
    try {
      await fetch(`/api/referrals/${referral.id}/refresh-points`, {
        method: 'POST',
        credentials: 'include',
      });
      onRefresh();
    } catch (err) {
      console.error('Failed to refresh points', err);
    } finally {
      setRefreshingPoints(false);
    }
  }

  const canMatch = ['submitted', 'pending_review'].includes(referral.status);
  const canReject = ['submitted', 'pending_review', 'tracking'].includes(referral.status);
  const isTracking = referral.status === 'tracking';

  return (
    <div className="fixed inset-0 z-50 flex justify-end">
      <div className="absolute inset-0 bg-black/30" onClick={onClose} />
      <div className="relative w-full max-w-md bg-white shadow-xl flex flex-col">
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-neutral-200">
          <h2 className="text-lg font-semibold text-neutral-900">Referral Details</h2>
          <button onClick={onClose} className="text-neutral-400 hover:text-neutral-600 transition-colors">
            <XMarkIcon className="h-5 w-5" />
          </button>
        </div>

        {/* Body */}
        <div className="flex-1 overflow-y-auto px-6 py-4 space-y-5">
          {/* Referred person */}
          <div>
            <h3 className="text-xs font-semibold text-neutral-500 uppercase tracking-wider mb-2">Referred Person</h3>
            <p className="text-sm font-medium text-neutral-900">{referral.referred_name}</p>
            {referral.referred_email && <p className="text-sm text-neutral-600">{referral.referred_email}</p>}
            {referral.referred_phone && <p className="text-sm text-neutral-600">{referral.referred_phone}</p>}
            <p className="text-xs text-neutral-500 mt-1 capitalize">{(referral.referral_type || '').replace(/_/g, ' ')}</p>
          </div>

          {/* Referring tutor */}
          <div>
            <h3 className="text-xs font-semibold text-neutral-500 uppercase tracking-wider mb-2">Referring Tutor</h3>
            <p className="text-sm text-neutral-900">
              {referral.tutor_first_name} {referral.tutor_last_name}
              <span className="text-neutral-500 ml-1">(#{referral.contractor_id})</span>
            </p>
          </div>

          {/* Referring client */}
          {referral.referring_client_name && (
            <div>
              <h3 className="text-xs font-semibold text-neutral-500 uppercase tracking-wider mb-2">Referred By Client</h3>
              <p className="text-sm text-neutral-900">{referral.referring_client_name}</p>
            </div>
          )}

          {/* Matched client */}
          {referral.matched_client_id && (
            <div>
              <h3 className="text-xs font-semibold text-neutral-500 uppercase tracking-wider mb-2">Matched Client</h3>
              <div className="flex items-center gap-2">
                <LinkIcon className="h-4 w-4 text-brand-purple" />
                <a
                  href={`/clients/${referral.matched_client_id}`}
                  className="text-sm font-medium text-brand-purple hover:text-brand-navy transition-colors"
                >
                  {referral.matched_client_name || `Client #${referral.matched_client_id}`}
                </a>
              </div>
            </div>
          )}

          {/* Points progress */}
          {(isTracking || referral.status === 'converted') && (
            <div>
              <div className="flex items-center justify-between mb-2">
                <h3 className="text-xs font-semibold text-neutral-500 uppercase tracking-wider">Points Progress</h3>
                {isTracking && (
                  <button
                    onClick={handleRefreshPoints}
                    disabled={refreshingPoints}
                    className="text-xs text-brand-purple hover:text-brand-navy transition-colors disabled:opacity-50"
                  >
                    <ArrowPathIcon className={`h-3.5 w-3.5 inline mr-1 ${refreshingPoints ? 'animate-spin' : ''}`} />
                    Refresh
                  </button>
                )}
              </div>
              <div className="bg-neutral-50 rounded-lg p-3">
                <div className="flex justify-between text-sm mb-1.5">
                  <span className="text-neutral-600">
                    ${Number(referral.points_earned).toLocaleString()} earned
                  </span>
                  <span className="text-neutral-500">
                    ${Number(referral.points_threshold).toLocaleString()} goal
                  </span>
                </div>
                <div className="h-2 bg-neutral-200 rounded-full overflow-hidden">
                  <div
                    className={`h-full rounded-full transition-all ${referral.status === 'converted' ? 'bg-brand-green' : 'bg-brand-cyan'}`}
                    style={{ width: `${Math.min(100, Math.round((referral.points_earned / referral.points_threshold) * 100))}%` }}
                  />
                </div>
              </div>
            </div>
          )}

          {/* Notes */}
          {referral.notes && (
            <div>
              <h3 className="text-xs font-semibold text-neutral-500 uppercase tracking-wider mb-2">Notes</h3>
              <p className="text-sm text-neutral-700 whitespace-pre-wrap">{referral.notes}</p>
            </div>
          )}

          {/* Rejection reason */}
          {referral.status === 'rejected' && referral.rejection_reason && (
            <div>
              <h3 className="text-xs font-semibold text-neutral-500 uppercase tracking-wider mb-2">Rejection Reason</h3>
              <p className="text-sm text-brand-pink">{referral.rejection_reason}</p>
            </div>
          )}

          {/* Timeline */}
          <div>
            <h3 className="text-xs font-semibold text-neutral-500 uppercase tracking-wider mb-2">Timeline</h3>
            <div className="space-y-1.5 text-xs text-neutral-500">
              <p>Submitted: {formatDate(referral.submitted_at)}</p>
              {referral.matched_at && <p>Matched: {formatDate(referral.matched_at)}</p>}
              {referral.converted_at && <p>Converted: {formatDate(referral.converted_at)}</p>}
              {referral.rejected_at && <p>Rejected: {formatDate(referral.rejected_at)}</p>}
            </div>
          </div>
        </div>

        {/* Actions */}
        {(canMatch || canReject) && (
          <div className="px-6 py-4 border-t border-neutral-200 space-y-3">
            {rejecting ? (
              <div className="space-y-2">
                <textarea
                  value={rejectReason}
                  onChange={e => setRejectReason(e.target.value)}
                  placeholder="Reason for rejection (optional)"
                  rows={2}
                  className="w-full text-sm border border-neutral-300 rounded-lg px-3 py-2 focus:ring-2 focus:ring-brand-purple/50 focus:border-brand-purple outline-none resize-none"
                />
                <div className="flex gap-2">
                  <button
                    onClick={() => setRejecting(false)}
                    className="flex-1 px-3 py-2 text-sm font-medium text-neutral-600 border border-neutral-300 rounded-lg hover:bg-neutral-50 transition-colors"
                  >
                    Cancel
                  </button>
                  <button
                    onClick={handleReject}
                    disabled={saving}
                    className="flex-1 px-3 py-2 text-sm font-medium text-white bg-brand-pink rounded-lg hover:bg-brand-pink/90 transition-colors disabled:opacity-50"
                  >
                    {saving ? 'Rejecting...' : 'Confirm Reject'}
                  </button>
                </div>
              </div>
            ) : (
              <div className="flex gap-2">
                {canMatch && (
                  <button
                    onClick={onMatch}
                    className="flex-1 inline-flex items-center justify-center gap-1.5 px-3 py-2 text-sm font-medium text-white bg-brand-green rounded-lg hover:bg-brand-green/90 transition-colors"
                  >
                    <CheckIcon className="h-4 w-4" />
                    Match to Client
                  </button>
                )}
                {canReject && (
                  <button
                    onClick={() => setRejecting(true)}
                    className="flex-1 inline-flex items-center justify-center gap-1.5 px-3 py-2 text-sm font-medium text-brand-pink border border-brand-pink/30 rounded-lg hover:bg-brand-pink/5 transition-colors"
                  >
                    <XCircleIcon className="h-4 w-4" />
                    Reject
                  </button>
                )}
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
