import React, { useState } from 'react';
import { PlusIcon } from '@heroicons/react/24/outline';
import EditableSchoolServicesList from './EditableSchoolServicesList';
import { useToast } from '../../hooks/useToast';

export default function SchoolsBookingForms() {
  const toast = useToast();
  const [selectedSchool, setSelectedSchool] = useState('all'); // 'all', 'nyc', 'la', 'sf', 'hamptons'

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between bg-white rounded-xl shadow-sm border border-neutral-200 p-6">
        <div>
          <h1 className="text-2xl font-bold text-neutral-900">Schools Service Configuration</h1>
          <p className="text-sm text-neutral-600 mt-1">
            Manage and configure all school partnership services and booking forms
          </p>
        </div>
        <button
          onClick={() => {
            // TODO: Open add service dialog
            toast.info('Add service functionality coming soon');
          }}
          className="inline-flex items-center gap-2 px-4 py-2 bg-brand-purple text-white rounded-lg hover:bg-brand-navy transition-colors duration-200 font-medium"
        >
          <PlusIcon className="h-5 w-5" />
          Add Service
        </button>
      </div>

      {/* School Location Filter */}
      <div className="bg-white rounded-xl shadow-sm border border-neutral-200 p-4">
        <label className="block text-sm font-medium text-neutral-700 mb-2">
          Filter by School Location
        </label>
        <select
          value={selectedSchool}
          onChange={(e) => setSelectedSchool(e.target.value)}
          className="w-full px-3 py-2 border border-neutral-300 rounded-lg focus:ring-2 focus:ring-brand-purple focus:border-brand-purple text-sm"
        >
          <option value="all">All Schools</option>
          <option value="nyc">School - NYC</option>
          <option value="la">School - LA</option>
          <option value="sf">School - SF</option>
          <option value="hamptons">School - Hamptons</option>
        </select>
      </div>

      {/* Editable Services List */}
      <EditableSchoolServicesList selectedSchool={selectedSchool} />
    </div>
  );
}









