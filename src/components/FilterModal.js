import React, { useState, useEffect } from 'react';
import { XMarkIcon } from '@heroicons/react/24/outline';

export default function FilterModal({ 
  isOpen, 
  onClose, 
  filters = [], 
  activeFilters = {}, 
  onApplyFilters,
  onClearFilters 
}) {
  const [localFilters, setLocalFilters] = useState(activeFilters);

  useEffect(() => {
    if (isOpen) {
      setLocalFilters(activeFilters);
    }
  }, [isOpen, activeFilters]);

  if (!isOpen) return null;

  const handleFilterChange = (key, value) => {
    setLocalFilters(prev => {
      const updated = { ...prev };
      if (value === '' || value === null || (Array.isArray(value) && value.length === 0)) {
        delete updated[key];
      } else {
        updated[key] = value;
      }
      return updated;
    });
  };

  const handleCheckboxChange = (key, value, checked) => {
    setLocalFilters(prev => {
      const updated = { ...prev };
      if (!updated[key]) {
        updated[key] = [];
      }
      const currentValues = Array.isArray(updated[key]) ? updated[key] : [];
      if (checked) {
        updated[key] = [...currentValues, value];
      } else {
        updated[key] = currentValues.filter(v => v !== value);
      }
      if (updated[key].length === 0) {
        delete updated[key];
      }
      return updated;
    });
  };

  const handleApply = () => {
    onApplyFilters(localFilters);
    onClose();
  };

  const handleClear = () => {
    setLocalFilters({});
    onClearFilters();
    onClose();
  };

  const renderFilterField = (filter) => {
    switch (filter.type) {
      case 'text':
        return (
          <div key={filter.key} className="mb-4">
            <label className="block text-sm font-medium text-neutral-700 mb-1">
              {filter.label}
            </label>
            <input
              type="text"
              value={localFilters[filter.key] || ''}
              onChange={(e) => handleFilterChange(filter.key, e.target.value)}
              placeholder={filter.placeholder || ''}
              className="w-full px-3 py-2 border border-neutral-300 rounded-md focus:outline-none focus:ring-2 focus:ring-brand-purple"
            />
          </div>
        );

      case 'select':
        return (
          <div key={filter.key} className="mb-4">
            <label className="block text-sm font-medium text-neutral-700 mb-1">
              {filter.label}
            </label>
            <select
              value={localFilters[filter.key] || ''}
              onChange={(e) => handleFilterChange(filter.key, e.target.value)}
              className="w-full px-3 py-2 border border-neutral-300 rounded-md focus:outline-none focus:ring-2 focus:ring-brand-purple"
            >
              <option value="">----------</option>
              {filter.options?.map(opt => (
                <option key={opt.value} value={opt.value}>
                  {opt.label}
                </option>
              ))}
            </select>
          </div>
        );

      case 'date':
        return (
          <div key={filter.key} className="mb-4">
            <label className="block text-sm font-medium text-neutral-700 mb-1">
              {filter.label}
            </label>
            <input
              type="date"
              value={localFilters[filter.key] || ''}
              onChange={(e) => handleFilterChange(filter.key, e.target.value)}
              className="w-full px-3 py-2 border border-neutral-300 rounded-md focus:outline-none focus:ring-2 focus:ring-brand-purple"
            />
          </div>
        );

      case 'checkbox-group':
        return (
          <div key={filter.key} className="mb-4">
            <label className="block text-sm font-medium text-neutral-700 mb-2">
              {filter.label}
            </label>
            <div className="max-h-48 overflow-y-auto border border-neutral-200 rounded-md p-3">
              {filter.options?.map(opt => {
                const checked = Array.isArray(localFilters[filter.key]) && 
                               localFilters[filter.key].includes(opt.value);
                return (
                  <label key={opt.value} className="flex items-center mb-2 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={checked || false}
                      onChange={(e) => handleCheckboxChange(filter.key, opt.value, e.target.checked)}
                      className="mr-2 h-4 w-4 text-brand-purple focus:ring-brand-purple border-neutral-300 rounded"
                    />
                    <span className="text-sm text-neutral-700">{opt.label}</span>
                  </label>
                );
              })}
            </div>
          </div>
        );

      default:
        return null;
    }
  };

  // Group filters by section
  const groupedFilters = filters.reduce((acc, filter) => {
    const section = filter.section || 'General';
    if (!acc[section]) {
      acc[section] = [];
    }
    acc[section].push(filter);
    return acc;
  }, {});

  return (
    <div className="fixed inset-0 z-50 overflow-y-auto">
      <div className="flex items-center justify-center min-h-screen px-4 pt-4 pb-20 text-center sm:block sm:p-0">
        {/* Background overlay */}
        <div 
          className="fixed inset-0 transition-opacity bg-neutral-500 bg-opacity-75"
          onClick={onClose}
        />

        {/* Modal panel */}
        <div className="inline-block align-bottom bg-white rounded-lg text-left overflow-hidden shadow-xl transform transition-all sm:my-8 sm:align-middle sm:max-w-2xl sm:w-full">
          {/* Header */}
          <div className="flex items-center justify-between px-6 py-4 bg-neutral-50 border-b border-neutral-200">
            <h3 className="text-lg font-semibold text-neutral-900">
              Filter {filters.length > 0 ? filters[0].entityType || '' : ''}
            </h3>
            <button
              onClick={onClose}
              className="text-neutral-400 hover:text-neutral-500 focus:outline-none"
            >
              <XMarkIcon className="h-6 w-6" />
            </button>
          </div>

          {/* Content */}
          <div className="px-6 py-4 max-h-[60vh] overflow-y-auto">
            {Object.entries(groupedFilters).map(([section, sectionFilters]) => (
              <div key={section} className="mb-6">
                <h4 className="text-sm font-semibold text-neutral-700 mb-3 uppercase tracking-wide">
                  {section}
                </h4>
                {section === 'Map Filter' && (
                  <p className="text-xs text-neutral-500 mb-3">
                    Choose an address/zipcode to center the map on, and a radius
                  </p>
                )}
                <div className="space-y-4">
                  {sectionFilters.map(filter => renderFilterField(filter))}
                </div>
              </div>
            ))}
          </div>

          {/* Footer */}
          <div className="flex items-center justify-end gap-3 px-6 py-4 bg-neutral-50 border-t border-neutral-200">
            <button
              onClick={handleClear}
              className="px-4 py-2 text-sm font-medium text-neutral-700 bg-white border border-neutral-300 rounded-md hover:bg-neutral-50 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-brand-purple"
            >
              Clear All
            </button>
            <button
              onClick={handleApply}
              className="px-4 py-2 text-sm font-medium text-white bg-brand-purple border border-transparent rounded-md hover:bg-brand-navy focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-brand-purple"
            >
              Apply Filters
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

