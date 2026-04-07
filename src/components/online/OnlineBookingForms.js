import React from 'react';
import { PlusIcon } from '@heroicons/react/24/outline';
import { useToast } from '../../hooks/useToast';
import { RoleProvider } from '../../contexts/RoleContext';
import { BranchProvider } from '../../contexts/BranchContext';
import EditableOnlineServicesList from './EditableOnlineServicesList';

export default function OnlineBookingForms() {
  const toast = useToast();

  return (
    <RoleProvider>
      <BranchProvider>
          <div className="space-y-6">
            {/* Header */}
            <div className="flex items-center justify-between bg-white rounded-xl shadow-sm border border-neutral-200 p-6">
              <div>
                <h1 className="text-2xl font-bold text-neutral-900">Online Service Configuration</h1>
                <p className="text-sm text-neutral-600 mt-1">
                  Manage and configure all online lesson services and booking forms
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

            {/* Editable Services List */}
            <EditableOnlineServicesList />
          </div>
      </BranchProvider>
    </RoleProvider>
  );
}









