import React, { useState } from 'react';
import {
  XMarkIcon,
  CheckIcon,
  XCircleIcon,
  ClockIcon,
  ExclamationTriangleIcon,
  PauseIcon,
  PlayIcon,
  CurrencyDollarIcon,
  PencilIcon,
  UserGroupIcon,
} from '@heroicons/react/24/outline';

/**
 * PendingActionsQueue - Panel showing actions awaiting approval
 *
 * Displays recommended actions from AI with approve/reject buttons.
 * Actions require explicit user approval before execution.
 */
export default function PendingActionsQueue({
  actions = [],
  onApprove,
  onReject,
  onClose,
  executingActionId = null,
}) {
  const [processingId, setProcessingId] = useState(null);
  const [rejectingId, setRejectingId] = useState(null);
  const [rejectReason, setRejectReason] = useState('');

  const handleApprove = (action) => {
    // Pass the full action to the parent for confirmation modal
    onApprove(action);
  };

  const handleReject = async (actionId) => {
    setProcessingId(actionId);
    await onReject(actionId, rejectReason || null);
    setProcessingId(null);
    setRejectingId(null);
    setRejectReason('');
  };

  const pendingActions = actions.filter(a => a.status === 'pending');

  return (
    <div className="flex flex-col h-full">
      {/* Header */}
      <div className="flex items-center justify-between px-4 py-3 border-b border-neutral-200 bg-white">
        <div className="flex items-center gap-2">
          <ClockIcon className="h-5 w-5 text-amber-500" />
          <h3 className="font-semibold text-neutral-900">Pending Actions</h3>
          {pendingActions.length > 0 && (
            <span className="px-2 py-0.5 bg-amber-100 text-amber-700 text-xs font-medium rounded-full">
              {pendingActions.length}
            </span>
          )}
        </div>
        <button
          onClick={onClose}
          className="p-1 hover:bg-neutral-100 rounded-lg transition-colors lg:hidden"
        >
          <XMarkIcon className="h-5 w-5 text-neutral-400" />
        </button>
      </div>

      {/* Actions List */}
      <div className="flex-1 overflow-y-auto p-4 space-y-3">
        {pendingActions.length === 0 ? (
          <div className="text-center py-8">
            <CheckIcon className="h-10 w-10 mx-auto text-green-300 mb-2" />
            <p className="text-sm text-neutral-500">No pending actions</p>
            <p className="text-xs text-neutral-400 mt-1">
              AI recommendations will appear here
            </p>
          </div>
        ) : (
          pendingActions.map((action) => (
            <ActionCard
              key={action.id}
              action={action}
              isProcessing={processingId === action.id}
              isExecuting={executingActionId === action.id}
              isRejecting={rejectingId === action.id}
              rejectReason={rejectReason}
              onApprove={() => handleApprove(action)}
              onRejectStart={() => setRejectingId(action.id)}
              onRejectCancel={() => {
                setRejectingId(null);
                setRejectReason('');
              }}
              onRejectConfirm={() => handleReject(action.id)}
              onRejectReasonChange={setRejectReason}
            />
          ))
        )}
      </div>

      {/* Warning footer */}
      <div className="px-4 py-3 border-t border-neutral-200 bg-amber-50">
        <div className="flex items-start gap-2">
          <ExclamationTriangleIcon className="h-4 w-4 text-amber-500 flex-shrink-0 mt-0.5" />
          <div>
            <p className="text-xs text-amber-800 font-medium">
              Review carefully before approving
            </p>
            <p className="text-xs text-amber-700 mt-0.5">
              Approved actions will affect your ad campaigns.
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}

/**
 * Individual action card with approve/reject controls
 */
function ActionCard({
  action,
  isProcessing,
  isExecuting,
  isRejecting,
  rejectReason,
  onApprove,
  onRejectStart,
  onRejectCancel,
  onRejectConfirm,
  onRejectReasonChange,
}) {
  const actionConfig = getActionConfig(action.action_type);
  const platformConfig = getPlatformConfig(action.platform);

  const expiresAt = action.expires_at ? new Date(action.expires_at) : null;
  const isExpiringSoon = expiresAt && (expiresAt - new Date()) < 24 * 60 * 60 * 1000;

  return (
    <div className={`rounded-lg border ${platformConfig.borderColor} overflow-hidden`}>
      {/* Header */}
      <div className={`px-3 py-2 ${platformConfig.bgColor} flex items-center justify-between`}>
        <div className="flex items-center gap-2">
          <actionConfig.icon className={`h-4 w-4 ${platformConfig.textColor}`} />
          <span className={`text-xs font-medium ${platformConfig.textColor}`}>
            {actionConfig.label}
          </span>
        </div>
        <span className={`text-xs ${platformConfig.textColor} opacity-75`}>
          {action.platform.toUpperCase()}
        </span>
      </div>

      {/* Body */}
      <div className="p-3 bg-white">
        <p className="text-sm font-medium text-neutral-900">{action.target_name}</p>
        <p className="text-xs text-neutral-500 mt-1">{action.ai_reasoning}</p>

        {/* Expiration warning */}
        {isExpiringSoon && (
          <div className="mt-2 flex items-center gap-1 text-xs text-amber-600">
            <ClockIcon className="h-3 w-3" />
            Expires soon
          </div>
        )}

        {/* Reject reason input */}
        {isRejecting && (
          <div className="mt-3">
            <textarea
              value={rejectReason}
              onChange={(e) => onRejectReasonChange(e.target.value)}
              placeholder="Reason for rejection (optional)"
              className="w-full px-2 py-1 text-xs border border-neutral-200 rounded
                       focus:outline-none focus:ring-1 focus:ring-red-300"
              rows={2}
            />
          </div>
        )}

        {/* Action buttons */}
        <div className="mt-3 flex items-center gap-2">
          {isRejecting ? (
            <>
              <button
                onClick={onRejectConfirm}
                disabled={isProcessing}
                className="flex-1 flex items-center justify-center gap-1 px-3 py-1.5
                         bg-red-500 text-white text-xs font-medium rounded-lg
                         hover:bg-red-600 disabled:opacity-50 transition-colors"
              >
                <XCircleIcon className="h-3.5 w-3.5" />
                Confirm Reject
              </button>
              <button
                onClick={onRejectCancel}
                disabled={isProcessing}
                className="px-3 py-1.5 text-xs text-neutral-500 hover:bg-neutral-100
                         rounded-lg transition-colors"
              >
                Cancel
              </button>
            </>
          ) : (
            <>
              <button
                onClick={onApprove}
                disabled={isProcessing || isExecuting}
                className="flex-1 flex items-center justify-center gap-1 px-3 py-1.5
                         bg-green-500 text-white text-xs font-medium rounded-lg
                         hover:bg-green-600 disabled:opacity-50 transition-colors"
              >
                {isExecuting ? (
                  <>
                    <svg className="animate-spin h-3.5 w-3.5" viewBox="0 0 24 24">
                      <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" fill="none" />
                      <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
                    </svg>
                    Executing...
                  </>
                ) : (
                  <>
                    <CheckIcon className="h-3.5 w-3.5" />
                    Approve
                  </>
                )}
              </button>
              <button
                onClick={onRejectStart}
                disabled={isProcessing || isExecuting}
                className="flex items-center justify-center gap-1 px-3 py-1.5
                         border border-red-200 text-red-600 text-xs font-medium rounded-lg
                         hover:bg-red-50 disabled:opacity-50 transition-colors"
              >
                <XMarkIcon className="h-3.5 w-3.5" />
                Reject
              </button>
            </>
          )}
        </div>
      </div>
    </div>
  );
}

/**
 * Get configuration for action type
 */
function getActionConfig(actionType) {
  const configs = {
    PAUSE_CAMPAIGN: {
      icon: PauseIcon,
      label: 'Pause Campaign',
    },
    RESUME_CAMPAIGN: {
      icon: PlayIcon,
      label: 'Resume Campaign',
    },
    ADJUST_BUDGET: {
      icon: CurrencyDollarIcon,
      label: 'Adjust Budget',
    },
    CREATE_CAMPAIGN_DRAFT: {
      icon: PencilIcon,
      label: 'Create Campaign Draft',
    },
    MODIFY_TARGETING: {
      icon: UserGroupIcon,
      label: 'Modify Targeting',
    },
    UPDATE_AD_COPY: {
      icon: PencilIcon,
      label: 'Update Ad Copy',
    },
  };

  return configs[actionType] || {
    icon: ExclamationTriangleIcon,
    label: actionType,
  };
}

/**
 * Get configuration for platform
 */
function getPlatformConfig(platform) {
  const configs = {
    meta: {
      bgColor: 'bg-blue-50',
      textColor: 'text-blue-700',
      borderColor: 'border-blue-200',
    },
    google: {
      bgColor: 'bg-green-50',
      textColor: 'text-green-700',
      borderColor: 'border-green-200',
    },
    klaviyo: {
      bgColor: 'bg-purple-50',
      textColor: 'text-purple-700',
      borderColor: 'border-purple-200',
    },
  };

  return configs[platform?.toLowerCase()] || {
    bgColor: 'bg-neutral-50',
    textColor: 'text-neutral-700',
    borderColor: 'border-neutral-200',
  };
}
