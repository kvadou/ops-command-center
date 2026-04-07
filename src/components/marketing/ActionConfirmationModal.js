import React from 'react';
import {
  ExclamationTriangleIcon,
  PlayIcon,
  PauseIcon,
  CurrencyDollarIcon,
  PencilIcon,
  UserGroupIcon,
} from '@heroicons/react/24/outline';

/**
 * ActionConfirmationModal - Confirmation dialog before executing marketing actions
 *
 * Shows action details and requires explicit confirmation before execution.
 */
export default function ActionConfirmationModal({
  open,
  action,
  onConfirm,
  onCancel,
}) {
  if (!open || !action) return null;

  const actionConfig = getActionConfig(action.action_type);
  const platformConfig = getPlatformConfig(action.platform);

  return (
    <div className="fixed inset-0 z-popover flex items-center justify-center">
      {/* Backdrop */}
      <div
        className="absolute inset-0 bg-black/50"
        onClick={onCancel}
      />

      {/* Modal */}
      <div className="relative bg-white rounded-xl shadow-xl max-w-md w-full mx-4 overflow-hidden">
        {/* Header */}
        <div className={`px-6 py-4 ${platformConfig.bgColor}`}>
          <div className="flex items-center gap-3">
            <div className={`p-2 rounded-lg bg-white/20`}>
              <actionConfig.icon className={`h-6 w-6 ${platformConfig.textColor}`} />
            </div>
            <div>
              <h3 className={`font-semibold ${platformConfig.textColor}`}>
                Confirm Action
              </h3>
              <p className={`text-sm ${platformConfig.textColor} opacity-80`}>
                {actionConfig.label}
              </p>
            </div>
          </div>
        </div>

        {/* Body */}
        <div className="px-6 py-4">
          <div className="space-y-4">
            {/* Target info */}
            <div>
              <p className="text-sm text-neutral-500">Target</p>
              <p className="font-medium text-neutral-900">{action.target_name}</p>
              <p className="text-xs text-neutral-400 mt-1">
                Platform: {action.platform?.toUpperCase()} • ID: {action.target_id}
              </p>
            </div>

            {/* AI Reasoning */}
            <div>
              <p className="text-sm text-neutral-500">AI Reasoning</p>
              <p className="text-sm text-neutral-700 mt-1">{action.ai_reasoning}</p>
            </div>

            {/* Warning */}
            <div className="flex items-start gap-2 p-3 bg-amber-50 rounded-lg border border-amber-200">
              <ExclamationTriangleIcon className="h-5 w-5 text-amber-500 flex-shrink-0 mt-0.5" />
              <div>
                <p className="text-sm font-medium text-amber-800">
                  This action will be executed immediately
                </p>
                <p className="text-xs text-amber-700 mt-1">
                  Changes will be applied to your {action.platform} ad account.
                  This action can be rolled back if needed.
                </p>
              </div>
            </div>
          </div>
        </div>

        {/* Footer */}
        <div className="px-6 py-4 bg-neutral-50 border-t border-neutral-200 flex items-center justify-end gap-3">
          <button
            onClick={onCancel}
            className="px-4 py-2 text-sm font-medium text-neutral-600 hover:bg-neutral-200
                     rounded-lg transition-colors"
          >
            Cancel
          </button>
          <button
            onClick={onConfirm}
            className={`px-4 py-2 text-sm font-medium text-white rounded-lg
                     transition-colors flex items-center gap-2
                     ${platformConfig.buttonColor}`}
          >
            <actionConfig.icon className="h-4 w-4" />
            Execute Action
          </button>
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
      bgColor: 'bg-blue-100',
      textColor: 'text-blue-800',
      buttonColor: 'bg-blue-600 hover:bg-blue-700',
    },
    google: {
      bgColor: 'bg-green-100',
      textColor: 'text-green-800',
      buttonColor: 'bg-green-600 hover:bg-green-700',
    },
    klaviyo: {
      bgColor: 'bg-purple-100',
      textColor: 'text-purple-800',
      buttonColor: 'bg-purple-600 hover:bg-purple-700',
    },
    tiktok: {
      bgColor: 'bg-pink-100',
      textColor: 'text-pink-800',
      buttonColor: 'bg-pink-600 hover:bg-pink-700',
    },
    linkedin: {
      bgColor: 'bg-sky-100',
      textColor: 'text-sky-800',
      buttonColor: 'bg-sky-600 hover:bg-sky-700',
    },
  };

  return configs[platform?.toLowerCase()] || {
    bgColor: 'bg-neutral-100',
    textColor: 'text-neutral-800',
    buttonColor: 'bg-neutral-600 hover:bg-neutral-700',
  };
}
