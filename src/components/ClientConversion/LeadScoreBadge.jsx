import React from 'react';
import Tooltip from '@mui/material/Tooltip';

const TIER_CONFIG = {
  Hot:  { bg: 'bg-red-100',    text: 'text-red-700',    border: 'border-red-200',    dot: 'bg-red-500' },
  Warm: { bg: 'bg-orange-100', text: 'text-orange-700', border: 'border-orange-200', dot: 'bg-orange-500' },
  Cool: { bg: 'bg-sky-100',    text: 'text-sky-700',    border: 'border-sky-200',    dot: 'bg-sky-500' },
  Cold: { bg: 'bg-neutral-100',text: 'text-neutral-500', border: 'border-neutral-200',dot: 'bg-neutral-400' },
};

export default function LeadScoreBadge({ score, tier, reasoning, components, stale, onRescore }) {
  if (score === null || score === undefined) {
    return (
      <span className="inline-flex items-center px-1.5 py-0.5 rounded text-[10px] font-medium bg-neutral-50 text-neutral-400 border border-neutral-200">
        —
      </span>
    );
  }

  const config = TIER_CONFIG[tier] || TIER_CONFIG.Cold;

  const tooltipContent = (
    <div className="text-xs space-y-1.5 max-w-xs">
      <div className="font-semibold">{tier} Lead — Score: {score}/10</div>
      {components && (
        <div className="space-y-0.5">
          <div>Family Fit: {components.family_fit}/10</div>
          <div>Engagement: {components.engagement}/10</div>
          <div>Funnel Progress: {components.funnel_progress}/10</div>
          <div>Source Quality: {components.source_quality}/10</div>
          <div>Timing: {components.timing}/10</div>
        </div>
      )}
      {reasoning && <div className="italic text-neutral-300 border-t border-neutral-600 pt-1">{reasoning}</div>}
      {stale && <div className="text-yellow-300">⟳ Score update pending</div>}
    </div>
  );

  return (
    <Tooltip title={tooltipContent} arrow placement="right">
      <button
        type="button"
        onClick={(e) => { e.stopPropagation(); onRescore?.(); }}
        className={`inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[10px] font-semibold border transition-all hover:shadow-sm cursor-pointer ${config.bg} ${config.text} ${config.border} ${stale ? 'opacity-60' : ''}`}
      >
        <span className={`w-1.5 h-1.5 rounded-full ${config.dot}`} />
        {score}
      </button>
    </Tooltip>
  );
}
