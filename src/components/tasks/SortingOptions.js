import React from 'react';
import { 
  ArrowUpIcon, 
  ArrowDownIcon,
  XMarkIcon,
  PlusIcon
} from '@heroicons/react/24/outline';

const SORT_OPTIONS = [
  { value: 'name', label: 'Task Name' },
  { value: 'status', label: 'Status' },
  { value: 'priority', label: 'Priority' },
  { value: 'due_date', label: 'Due Date' },
  { value: 'start_date', label: 'Start Date' },
  { value: 'created_at', label: 'Created At' },
  { value: 'updated_at', label: 'Updated At' },
  { value: 'assignee', label: 'Assignee' }
];

export default function SortingOptions({ 
  sorts, 
  onSortsChange,
  customFields = []
}) {
  const addSort = () => {
    const newSort = {
      id: Date.now(),
      field: '',
      direction: 'asc'
    };
    onSortsChange([...sorts, newSort]);
  };

  const removeSort = (sortId) => {
    onSortsChange(sorts.filter(s => s.id !== sortId));
  };

  const updateSort = (sortId, updates) => {
    onSortsChange(sorts.map(s => 
      s.id === sortId ? { ...s, ...updates } : s
    ));
  };

  const allSortOptions = [
    ...SORT_OPTIONS,
    ...customFields.map(cf => ({
      value: `custom_${cf.id}`,
      label: cf.name
    }))
  ];

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <label className="block text-sm font-medium text-neutral-700">Sort By</label>
        {sorts.length < 3 && (
          <button
            onClick={addSort}
            className="flex items-center gap-1 px-2 py-1 text-sm text-brand-purple hover:bg-brand-purple/10 rounded"
          >
            <PlusIcon className="h-4 w-4" />
            Add Sort
          </button>
        )}
      </div>

      <div className="space-y-2">
        {sorts.map((sort, index) => (
          <div key={sort.id} className="flex items-center gap-2">
            <span className="text-sm text-neutral-500 w-8">{index === 0 ? 'Primary' : index === 1 ? 'Then' : 'Then'}</span>
            <select
              value={sort.field}
              onChange={(e) => updateSort(sort.id, { field: e.target.value })}
              className="flex-1 px-3 py-2 border border-neutral-300 rounded-lg text-sm focus:ring-2 focus:ring-brand-purple focus:border-brand-purple"
            >
              <option value="">Select field...</option>
              {allSortOptions.map(option => (
                <option key={option.value} value={option.value}>
                  {option.label}
                </option>
              ))}
            </select>
            {sort.field && (
              <button
                onClick={() => updateSort(sort.id, { 
                  direction: sort.direction === 'asc' ? 'desc' : 'asc' 
                })}
                className="p-2 border border-neutral-300 rounded-lg hover:bg-neutral-50"
                title={sort.direction === 'asc' ? 'Ascending' : 'Descending'}
              >
                {sort.direction === 'asc' ? (
                  <ArrowUpIcon className="h-4 w-4 text-neutral-600" />
                ) : (
                  <ArrowDownIcon className="h-4 w-4 text-neutral-600" />
                )}
              </button>
            )}
            <button
              onClick={() => removeSort(sort.id)}
              className="p-2 text-red-600 hover:bg-red-50 rounded"
            >
              <XMarkIcon className="h-4 w-4" />
            </button>
          </div>
        ))}
        {sorts.length === 0 && (
          <button
            onClick={addSort}
            className="w-full px-3 py-2 border-2 border-dashed border-neutral-300 rounded-lg text-sm text-neutral-500 hover:border-brand-purple hover:text-brand-purple"
          >
            Add sort criteria
          </button>
        )}
      </div>
    </div>
  );
}

export { SORT_OPTIONS };
