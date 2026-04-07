import React, { useState } from 'react';
import { InformationCircleIcon } from '@heroicons/react/24/outline';
import Tooltip from '@mui/material/Tooltip';
import Popover from '@mui/material/Popover';

/**
 * Automation trigger configurations with tooltip and popover content
 */
const AUTOMATION_CONFIGS = {
  // Summary mode content (for tab labels and headers)
  won: {
    tooltip: 'Auto-moved when first paid lesson completed',
    popover: {
      title: 'Won Automation',
      description: 'Clients are automatically moved to Won when they complete their first paid lesson after a trial. This signals successful conversion from prospect to paying customer.',
      rules: [
        {
          trigger: 'first_paid_lesson',
          label: 'First Paid Lesson',
          description: 'Client completed their first paid lesson after a trial.'
        }
      ]
    }
  },
  lost: {
    tooltip: 'Auto-moved based on inactivity rules',
    popover: {
      title: 'Lost Automation Rules',
      description: 'Clients are automatically moved to Lost when certain timeout conditions are met:',
      rules: [
        {
          trigger: '14_day_timeout',
          label: '14-Day Booking Timeout',
          description: 'No progress 14+ days after registration form submitted. Client never advanced past initial contact.'
        },
        {
          trigger: '30_day_building_timeout',
          label: '30-Day Building Timeout',
          description: 'Status stuck on "Building" for 30+ days without pairing with a tutor or scheduling trial.'
        },
        {
          trigger: '30_day_trial_timeout',
          label: '30-Day Post-Trial Timeout',
          description: 'Trial completed 30+ days ago with no conversion to paid lessons.'
        },
        {
          trigger: 'manual',
          label: 'Manual',
          description: 'Pipeline stage manually changed to Lost by admin (e.g., client requested removal, invalid contact info).'
        }
      ]
    }
  },
  // Detail mode content (for individual client rows)
  triggers: {
    first_paid_lesson: {
      label: 'Converted',
      tooltip: 'First paid lesson completed',
      description: 'Client completed their first paid lesson after a trial, signaling successful conversion.',
      chipColor: 'bg-[#E8F8ED] text-[#2A9147]'
    },
    '14_day_timeout': {
      label: '14-Day Timeout',
      tooltip: '14-day booking timeout',
      description: 'No progress 14+ days after registration form submitted. Client never advanced past initial contact.',
      chipColor: 'bg-[#FEF4E8] text-[#C77A26]'
    },
    '30_day_building_timeout': {
      label: 'Building Timeout',
      tooltip: '30-day building timeout',
      description: 'Status stuck on "Building" for 30+ days without pairing with a tutor or scheduling trial.',
      chipColor: 'bg-[#FCE8F0] text-[#AE255B]'
    },
    '30_day_trial_timeout': {
      label: 'Trial Timeout',
      tooltip: '30-day post-trial timeout',
      description: 'Trial completed 30+ days ago with no conversion to paid lessons.',
      chipColor: 'bg-[#FCE8F0] text-[#AE255B]'
    },
    manual: {
      label: 'Manual',
      tooltip: 'Manually changed',
      description: 'Pipeline stage manually changed to Lost by admin.',
      chipColor: 'bg-neutral-100 text-neutral-600'
    }
  }
};

/**
 * AutomationInfoIndicator - Info icon with hover tooltip and click popover
 *
 * Two modes:
 * - "summary": Shows general automation rules for Won/Lost tabs (used in tab labels and headers)
 * - "detail": Shows specific automation trigger for individual clients (used in table rows)
 */
export default function AutomationInfoIndicator({
  mode = 'summary',
  automationType = null,    // 'won' | 'lost' - used in summary mode
  automationTrigger = null, // specific trigger from DB - used in detail mode
  size = 'sm',
  className = ''
}) {
  const [anchorEl, setAnchorEl] = useState(null);

  const handleClick = (event) => {
    event.stopPropagation();
    setAnchorEl(event.currentTarget);
  };

  const handleClose = () => {
    setAnchorEl(null);
  };

  const open = Boolean(anchorEl);

  const iconSize = size === 'sm' ? 'h-4 w-4' : 'h-5 w-5';

  // Summary mode - shows all automation rules for the tab type
  if (mode === 'summary' && automationType) {
    const config = AUTOMATION_CONFIGS[automationType];
    if (!config) return null;

    return (
      <>
        <Tooltip title={config.tooltip} arrow placement="top">
          <button
            onClick={handleClick}
            className={`inline-flex items-center ${className}`}
            aria-label={`Learn about ${automationType} automation rules`}
          >
            <InformationCircleIcon
              className={`${iconSize} text-neutral-400 hover:text-neutral-600 cursor-help transition-colors`}
            />
          </button>
        </Tooltip>

        <Popover
          open={open}
          anchorEl={anchorEl}
          onClose={handleClose}
          anchorOrigin={{
            vertical: 'bottom',
            horizontal: 'left',
          }}
          transformOrigin={{
            vertical: 'top',
            horizontal: 'left',
          }}
          PaperProps={{
            sx: { maxWidth: 360, p: 0 }
          }}
        >
          <div className="p-4">
            <h4 className="text-sm font-semibold text-neutral-900 mb-2">
              {config.popover.title}
            </h4>
            <p className="text-xs text-neutral-600 mb-3">
              {config.popover.description}
            </p>
            <div className="space-y-2">
              {config.popover.rules.map((rule) => (
                <div key={rule.trigger} className="flex items-start gap-2">
                  <span className={`inline-flex px-2 py-0.5 text-xs font-medium rounded-full whitespace-nowrap ${
                    AUTOMATION_CONFIGS.triggers[rule.trigger]?.chipColor || 'bg-neutral-100 text-neutral-600'
                  }`}>
                    {rule.label}
                  </span>
                  <span className="text-xs text-neutral-500 leading-relaxed">
                    {rule.description}
                  </span>
                </div>
              ))}
            </div>
          </div>
        </Popover>
      </>
    );
  }

  // Detail mode - shows specific trigger for individual client
  if (mode === 'detail') {
    const triggerConfig = automationTrigger ? AUTOMATION_CONFIGS.triggers[automationTrigger] : null;

    // If no trigger data, show a neutral indicator
    if (!triggerConfig) {
      return (
        <span className="inline-flex px-2 py-0.5 text-xs font-medium rounded-full bg-neutral-100 text-neutral-500">
          —
        </span>
      );
    }

    return (
      <>
        <Tooltip title={triggerConfig.tooltip} arrow placement="top">
          <button
            onClick={handleClick}
            className={`inline-flex items-center gap-1 px-2 py-0.5 text-xs font-medium rounded-full cursor-help transition-colors ${triggerConfig.chipColor} ${className}`}
            aria-label={`Learn about ${triggerConfig.label} automation`}
          >
            {triggerConfig.label}
            <InformationCircleIcon className="h-3 w-3 opacity-60" />
          </button>
        </Tooltip>

        <Popover
          open={open}
          anchorEl={anchorEl}
          onClose={handleClose}
          anchorOrigin={{
            vertical: 'bottom',
            horizontal: 'left',
          }}
          transformOrigin={{
            vertical: 'top',
            horizontal: 'left',
          }}
          PaperProps={{
            sx: { maxWidth: 280, p: 0 }
          }}
        >
          <div className="p-3">
            <div className="flex items-center gap-2 mb-2">
              <span className={`inline-flex px-2 py-0.5 text-xs font-medium rounded-full ${triggerConfig.chipColor}`}>
                {triggerConfig.label}
              </span>
            </div>
            <p className="text-xs text-neutral-600 leading-relaxed">
              {triggerConfig.description}
            </p>
          </div>
        </Popover>
      </>
    );
  }

  return null;
}
