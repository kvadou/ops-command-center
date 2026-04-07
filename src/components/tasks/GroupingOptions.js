import React from 'react';
import { 
  Squares2X2Icon,
  UserIcon,
  FlagIcon,
  CalendarIcon,
  TagIcon
} from '@heroicons/react/24/outline';

const GROUPING_OPTIONS = [
  { value: 'none', label: 'No Grouping', icon: null },
  { value: 'status', label: 'Status', icon: Squares2X2Icon },
  { value: 'priority', label: 'Priority', icon: FlagIcon },
  { value: 'assignee', label: 'Assignee', icon: UserIcon },
  { value: 'due_date', label: 'Due Date', icon: CalendarIcon },
  { value: 'group', label: 'Group', icon: Squares2X2Icon },
  { value: 'tags', label: 'Tags', icon: TagIcon }
];

export default function GroupingOptions({ 
  groupBy, 
  onGroupByChange, 
  customFields = [],
  showAggregations = true,
  aggregations = {},
  onAggregationChange
}) {
  const allOptions = [
    ...GROUPING_OPTIONS,
    ...customFields.map(cf => ({
      value: `custom_${cf.id}`,
      label: cf.name,
      icon: null,
      isCustom: true
    }))
  ];

  return (
    <div className="space-y-4">
      <div>
        <label className="block text-sm font-medium text-neutral-700 mb-2">Group By</label>
        <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
          {allOptions.map(option => {
            const Icon = option.icon;
            const isSelected = groupBy === option.value;
            return (
              <button
                key={option.value}
                type="button"
                onClick={() => onGroupByChange(option.value)}
                className={`p-3 rounded-lg border-2 transition-all text-left ${
                  isSelected
                    ? 'border-brand-purple bg-brand-purple/10'
                    : 'border-neutral-200 hover:border-neutral-300'
                }`}
              >
                <div className="flex items-center gap-2 mb-1">
                  {Icon && <Icon className={`h-5 w-5 ${isSelected ? 'text-brand-purple' : 'text-neutral-400'}`} />}
                  <span className={`text-sm font-medium ${isSelected ? 'text-brand-purple' : 'text-neutral-700'}`}>
                    {option.label}
                  </span>
                </div>
              </button>
            );
          })}
        </div>
      </div>

      {groupBy !== 'none' && showAggregations && (
        <div>
          <label className="block text-sm font-medium text-neutral-700 mb-2">Group Aggregation</label>
          <select
            value={aggregations[groupBy] || 'count'}
            onChange={(e) => onAggregationChange && onAggregationChange(groupBy, e.target.value)}
            className="w-full px-3 py-2 border border-neutral-300 rounded-lg text-sm focus:ring-2 focus:ring-brand-purple focus:border-brand-purple"
          >
            <option value="count">Count</option>
            <option value="sum">Sum (for numeric fields)</option>
            <option value="average">Average (for numeric fields)</option>
            <option value="min">Min (for numeric/date fields)</option>
            <option value="max">Max (for numeric/date fields)</option>
          </select>
        </div>
      )}
    </div>
  );
}

export { GROUPING_OPTIONS };
