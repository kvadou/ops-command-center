import React, { useState } from 'react';
import { FunnelIcon, XMarkIcon, PlusIcon, BookmarkIcon } from '@heroicons/react/24/outline';
import { Menu, MenuButton, MenuItems, MenuItem } from '@headlessui/react';
import PromptDialog from '../PromptDialog';

const FILTER_OPERATORS = {
  text: ['contains', 'does not contain', 'equals', 'starts with', 'ends with', 'is empty', 'is not empty'],
  number: ['equals', 'not equals', 'greater than', 'less than', 'greater than or equal', 'less than or equal', 'is empty', 'is not empty'],
  date: ['equals', 'before', 'after', 'between', 'is empty', 'is not empty'],
  status: ['equals', 'not equals', 'is empty', 'is not empty'],
  people: ['is', 'is not', 'contains', 'does not contain', 'is empty', 'is not empty'],
  tags: ['contains', 'does not contain', 'is empty', 'is not empty'],
  checkbox: ['equals'],
  priority: ['equals', 'not equals']
};

export default function TaskFilters({ 
  filters, 
  onFiltersChange, 
  customFields = [],
  savedPresets = [],
  onSavePreset,
  onLoadPreset,
  onDeletePreset
}) {
  const [isOpen, setIsOpen] = useState(false);
  const [filterLogic, setFilterLogic] = useState('AND'); // AND or OR
  const [promptState, setPromptState] = useState({ isOpen: false, title: '', defaultValue: '' });

  const addFilter = () => {
    const newFilter = {
      id: Date.now(),
      field: '',
      operator: '',
      value: ''
    };
    onFiltersChange([...filters, newFilter]);
  };

  const removeFilter = (filterId) => {
    onFiltersChange(filters.filter(f => f.id !== filterId));
  };

  const updateFilter = (filterId, updates) => {
    onFiltersChange(filters.map(f => 
      f.id === filterId ? { ...f, ...updates } : f
    ));
  };

  const getFieldType = (fieldName) => {
    // Standard fields
    if (['name', 'description'].includes(fieldName)) return 'text';
    if (['status'].includes(fieldName)) return 'status';
    if (['priority'].includes(fieldName)) return 'priority';
    if (['due_date', 'start_date', 'created_at', 'updated_at'].includes(fieldName)) return 'date';
    if (['assignee_id', 'creator_id'].includes(fieldName)) return 'people';
    if (['tags'].includes(fieldName)) return 'tags';
    
    // Custom fields
    const customField = customFields.find(cf => cf.id === fieldName || cf.name === fieldName);
    if (customField) return customField.field_type;
    
    return 'text';
  };

  const getOperators = (fieldName) => {
    const fieldType = getFieldType(fieldName);
    return FILTER_OPERATORS[fieldType] || FILTER_OPERATORS.text;
  };

  const getFieldOptions = () => {
    const standardFields = [
      { value: 'name', label: 'Task Name', type: 'text' },
      { value: 'description', label: 'Description', type: 'text' },
      { value: 'status', label: 'Status', type: 'status' },
      { value: 'priority', label: 'Priority', type: 'priority' },
      { value: 'due_date', label: 'Due Date', type: 'date' },
      { value: 'start_date', label: 'Start Date', type: 'date' },
      { value: 'assignee_id', label: 'Assignee', type: 'people' },
      { value: 'creator_id', label: 'Creator', type: 'people' },
      { value: 'tags', label: 'Tags', type: 'tags' },
      { value: 'created_at', label: 'Created At', type: 'date' },
      { value: 'updated_at', label: 'Updated At', type: 'date' }
    ];

    const customFieldOptions = customFields.map(cf => ({
      value: cf.id,
      label: cf.name,
      type: cf.field_type
    }));

    return [...standardFields, ...customFieldOptions];
  };

  const renderFilterValue = (filter) => {
    const fieldType = getFieldType(filter.field);
    const fieldOptions = getFieldOptions();
    const field = fieldOptions.find(f => f.value === filter.field);

    switch (fieldType) {
      case 'text':
      case 'number':
        return (
          <input
            type={fieldType === 'number' ? 'number' : 'text'}
            value={filter.value || ''}
            onChange={(e) => updateFilter(filter.id, { value: e.target.value })}
            placeholder="Enter value..."
            className="flex-1 px-3 py-2 border border-neutral-300 rounded-lg text-sm focus:ring-2 focus:ring-brand-purple focus:border-brand-purple"
          />
        );

      case 'date':
        if (filter.operator === 'between') {
          return (
            <div className="flex items-center gap-2 flex-1">
              <input
                type="date"
                value={filter.value?.start || ''}
                onChange={(e) => updateFilter(filter.id, { 
                  value: { ...filter.value, start: e.target.value }
                })}
                className="flex-1 px-3 py-2 border border-neutral-300 rounded-lg text-sm focus:ring-2 focus:ring-brand-purple focus:border-brand-purple"
              />
              <span className="text-neutral-500">to</span>
              <input
                type="date"
                value={filter.value?.end || ''}
                onChange={(e) => updateFilter(filter.id, { 
                  value: { ...filter.value, end: e.target.value }
                })}
                className="flex-1 px-3 py-2 border border-neutral-300 rounded-lg text-sm focus:ring-2 focus:ring-brand-purple focus:border-brand-purple"
              />
            </div>
          );
        }
        return (
          <input
            type="date"
            value={filter.value || ''}
            onChange={(e) => updateFilter(filter.id, { value: e.target.value })}
            className="flex-1 px-3 py-2 border border-neutral-300 rounded-lg text-sm focus:ring-2 focus:ring-brand-purple focus:border-brand-purple"
          />
        );

      case 'status':
        return (
          <select
            value={filter.value || ''}
            onChange={(e) => updateFilter(filter.id, { value: e.target.value })}
            className="flex-1 px-3 py-2 border border-neutral-300 rounded-lg text-sm focus:ring-2 focus:ring-brand-purple focus:border-brand-purple"
          >
            <option value="">Select status...</option>
            <option value="todo">To Do</option>
            <option value="in_progress">In Progress</option>
            <option value="done">Done</option>
            <option value="blocked">Blocked</option>
          </select>
        );

      case 'priority':
        return (
          <select
            value={filter.value || ''}
            onChange={(e) => updateFilter(filter.id, { value: e.target.value })}
            className="flex-1 px-3 py-2 border border-neutral-300 rounded-lg text-sm focus:ring-2 focus:ring-brand-purple focus:border-brand-purple"
          >
            <option value="">Select priority...</option>
            <option value="low">Low</option>
            <option value="medium">Medium</option>
            <option value="high">High</option>
            <option value="urgent">Urgent</option>
          </select>
        );

      case 'people':
      case 'tags':
        return (
          <input
            type="text"
            value={filter.value || ''}
            onChange={(e) => updateFilter(filter.id, { value: e.target.value })}
            placeholder="Enter value..."
            className="flex-1 px-3 py-2 border border-neutral-300 rounded-lg text-sm focus:ring-2 focus:ring-brand-purple focus:border-brand-purple"
          />
        );

      case 'checkbox':
        return (
          <select
            value={filter.value || ''}
            onChange={(e) => updateFilter(filter.id, { value: e.target.value === 'true' })}
            className="flex-1 px-3 py-2 border border-neutral-300 rounded-lg text-sm focus:ring-2 focus:ring-brand-purple focus:border-brand-purple"
          >
            <option value="">Select...</option>
            <option value="true">Yes</option>
            <option value="false">No</option>
          </select>
        );

      default:
        return (
          <input
            type="text"
            value={filter.value || ''}
            onChange={(e) => updateFilter(filter.id, { value: e.target.value })}
            placeholder="Enter value..."
            className="flex-1 px-3 py-2 border border-neutral-300 rounded-lg text-sm focus:ring-2 focus:ring-brand-purple focus:border-brand-purple"
          />
        );
    }
  };

  return (
    <div className="relative">
      <button
        onClick={() => setIsOpen(!isOpen)}
        className={`flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium transition-colors ${
          filters.length > 0
            ? 'bg-brand-purple text-white'
            : 'bg-white border border-neutral-300 text-neutral-700 hover:bg-neutral-50'
        }`}
      >
        <FunnelIcon className="h-4 w-4" />
        <span>Filters</span>
        {filters.length > 0 && (
          <span className="bg-white/20 px-2 py-0.5 rounded text-xs">
            {filters.length}
          </span>
        )}
      </button>

      {isOpen && (
        <div className="absolute top-full left-0 mt-2 w-96 bg-white rounded-xl shadow-lg border border-neutral-200 z-50">
          <div className="p-4 space-y-4">
            {/* Saved Presets */}
            {savedPresets.length > 0 && (
              <div className="border-b border-neutral-200 pb-4">
                <div className="flex items-center justify-between mb-2">
                  <label className="text-xs font-semibold text-neutral-500 uppercase">Saved Filters</label>
                </div>
                <div className="space-y-1">
                  {savedPresets.map(preset => (
                    <div key={preset.id} className="flex items-center justify-between p-2 hover:bg-neutral-50 rounded">
                      <button
                        onClick={() => {
                          onLoadPreset(preset);
                          setIsOpen(false);
                        }}
                        className="flex items-center gap-2 text-sm text-neutral-700 hover:text-brand-purple flex-1 text-left"
                      >
                        <BookmarkIcon className="h-4 w-4" />
                        {preset.name}
                      </button>
                      {onDeletePreset && (
                        <button
                          onClick={() => onDeletePreset(preset.id)}
                          className="p-1 text-red-600 hover:bg-red-50 rounded"
                        >
                          <XMarkIcon className="h-4 w-4" />
                        </button>
                      )}
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Filter Logic */}
            {filters.length > 1 && (
              <div className="flex items-center gap-2">
                <span className="text-sm text-neutral-700">Match:</span>
                <button
                  onClick={() => setFilterLogic('AND')}
                  className={`px-3 py-1 rounded text-sm font-medium ${
                    filterLogic === 'AND'
                      ? 'bg-brand-purple text-white'
                      : 'bg-neutral-100 text-neutral-700 hover:bg-neutral-200'
                  }`}
                >
                  All
                </button>
                <button
                  onClick={() => setFilterLogic('OR')}
                  className={`px-3 py-1 rounded text-sm font-medium ${
                    filterLogic === 'OR'
                      ? 'bg-brand-purple text-white'
                      : 'bg-neutral-100 text-neutral-700 hover:bg-neutral-200'
                  }`}
                >
                  Any
                </button>
              </div>
            )}

            {/* Filters */}
            <div className="space-y-3">
              {filters.map((filter, index) => (
                <div key={filter.id} className="flex items-start gap-2">
                  {index > 0 && (
                    <div className="pt-2 text-sm font-medium text-neutral-500">
                      {filterLogic}
                    </div>
                  )}
                  <div className="flex-1 space-y-2">
                    <select
                      value={filter.field}
                      onChange={(e) => {
                        updateFilter(filter.id, { 
                          field: e.target.value, 
                          operator: '',
                          value: ''
                        });
                      }}
                      className="w-full px-3 py-2 border border-neutral-300 rounded-lg text-sm focus:ring-2 focus:ring-brand-purple focus:border-brand-purple"
                    >
                      <option value="">Select field...</option>
                      {getFieldOptions().map(option => (
                        <option key={option.value} value={option.value}>
                          {option.label}
                        </option>
                      ))}
                    </select>
                    {filter.field && (
                      <>
                        <select
                          value={filter.operator}
                          onChange={(e) => updateFilter(filter.id, { operator: e.target.value, value: '' })}
                          className="w-full px-3 py-2 border border-neutral-300 rounded-lg text-sm focus:ring-2 focus:ring-brand-purple focus:border-brand-purple"
                        >
                          <option value="">Select operator...</option>
                          {getOperators(filter.field).map(op => (
                            <option key={op} value={op}>{op}</option>
                          ))}
                        </select>
                        {filter.operator && !['is empty', 'is not empty'].includes(filter.operator) && (
                          renderFilterValue(filter)
                        )}
                      </>
                    )}
                  </div>
                  <button
                    onClick={() => removeFilter(filter.id)}
                    className="p-2 text-red-600 hover:bg-red-50 rounded mt-2"
                  >
                    <XMarkIcon className="h-4 w-4" />
                  </button>
                </div>
              ))}
            </div>

            {/* Actions */}
            <div className="flex items-center justify-between pt-4 border-t border-neutral-200">
              <button
                onClick={addFilter}
                className="flex items-center gap-2 px-3 py-2 text-sm text-brand-purple hover:bg-brand-purple/10 rounded-lg"
              >
                <PlusIcon className="h-4 w-4" />
                Add Filter
              </button>
              <div className="flex items-center gap-2">
                {filters.length > 0 && (
                  <button
                    onClick={() => {
                      onFiltersChange([]);
                      setIsOpen(false);
                    }}
                    className="px-3 py-2 text-sm text-neutral-700 hover:bg-neutral-100 rounded-lg"
                  >
                    Clear All
                  </button>
                )}
                {filters.length > 0 && onSavePreset && (
                  <button
                    onClick={() => {
                      setPromptState({ isOpen: true, title: 'Save Filter', defaultValue: '' });
                    }}
                    className="px-3 py-2 text-sm bg-brand-purple text-white rounded-lg hover:bg-brand-navy"
                  >
                    Save
                  </button>
                )}
              </div>
            </div>
          </div>
        </div>
      )}

      <PromptDialog
        isOpen={promptState.isOpen}
        onClose={() => setPromptState(s => ({ ...s, isOpen: false }))}
        onSubmit={(value) => {
          if (value) {
            onSavePreset({ name: value, filters, logic: filterLogic });
          }
        }}
        title={promptState.title}
        placeholder="Enter filter name"
        defaultValue={promptState.defaultValue}
      />
    </div>
  );
}
