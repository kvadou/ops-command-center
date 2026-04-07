import React from 'react';
import { LightBulbIcon, ExclamationTriangleIcon, InformationCircleIcon } from '@heroicons/react/24/outline';

const CALLOUT_TYPES = [
  { value: 'tip', label: 'Tip', icon: LightBulbIcon, color: 'bg-green-50 border-green-200 text-green-800' },
  { value: 'warning', label: 'Warning', icon: ExclamationTriangleIcon, color: 'bg-amber-50 border-amber-200 text-amber-800' },
  { value: 'important', label: 'Important', icon: InformationCircleIcon, color: 'bg-blue-50 border-blue-200 text-blue-800' },
];

export default function CalloutBlockEditor({ block, onChange }) {
  const selectedType = CALLOUT_TYPES.find(t => t.value === block.calloutType) || CALLOUT_TYPES[0];
  const Icon = selectedType.icon;

  return (
    <div className="space-y-3">
      <div className="flex gap-2">
        {CALLOUT_TYPES.map((type) => (
          <button
            key={type.value}
            onClick={() => onChange({ ...block, calloutType: type.value })}
            className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-sm font-medium transition-colors ${
              block.calloutType === type.value
                ? type.color + ' border'
                : 'bg-neutral-100 text-neutral-600 hover:bg-neutral-200'
            }`}
          >
            <type.icon className="h-4 w-4" />
            {type.label}
          </button>
        ))}
      </div>
      <input
        type="text"
        value={block.title || ''}
        onChange={(e) => onChange({ ...block, title: e.target.value })}
        placeholder="Title (optional)"
        className="w-full px-3 py-2 border border-neutral-200 rounded-lg text-sm focus:ring-2 focus:ring-brand-purple/20 focus:border-brand-purple"
      />
      <textarea
        value={block.content || ''}
        onChange={(e) => onChange({ ...block, content: e.target.value })}
        placeholder="Callout content..."
        rows={3}
        className="w-full px-3 py-2 border border-neutral-200 rounded-lg text-sm focus:ring-2 focus:ring-brand-purple/20 focus:border-brand-purple resize-none"
      />
      {/* Preview */}
      {(block.title || block.content) && (
        <div className={`flex gap-3 p-4 rounded-lg border ${selectedType.color}`}>
          <Icon className="h-5 w-5 flex-shrink-0 mt-0.5" />
          <div>
            {block.title && <p className="font-semibold">{block.title}</p>}
            <p className="text-sm">{block.content || 'Preview will appear here...'}</p>
          </div>
        </div>
      )}
    </div>
  );
}
