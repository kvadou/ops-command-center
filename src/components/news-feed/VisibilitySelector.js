/**
 * VisibilitySelector - Audience Selection for Posts
 * 
 * Allows users to select who can see their posts based on their role.
 */

import React, { useState, useRef, useEffect } from 'react';
import {
  GlobeAltIcon,
  BuildingOfficeIcon,
  UserGroupIcon,
  AcademicCapIcon,
  UsersIcon,
  LockClosedIcon,
  ChevronDownIcon,
  CheckIcon,
} from '@heroicons/react/24/outline';

const VISIBILITY_OPTIONS = {
  hq_only: {
    label: 'HQ Only',
    description: 'Only visible to HQ staff',
    icon: LockClosedIcon,
    color: 'text-red-600',
    roles: ['admin', 'staff'],
  },
  internal: {
    label: 'Internal',
    description: 'HQ staff and operations team',
    icon: BuildingOfficeIcon,
    color: 'text-blue-600',
    roles: ['admin', 'staff'],
  },
  franchisees: {
    label: 'Franchisees',
    description: 'All franchise owners',
    icon: BuildingOfficeIcon,
    color: 'text-purple-600',
    roles: ['admin', 'staff', 'franchisee'],
  },
  franchise_specific: {
    label: 'Specific Branches',
    description: 'Select specific branches',
    icon: UserGroupIcon,
    color: 'text-indigo-600',
    roles: ['admin', 'staff', 'franchisee'],
  },
  tutors: {
    label: 'Tutors',
    description: 'All tutors can see this',
    icon: AcademicCapIcon,
    color: 'text-green-600',
    roles: ['admin', 'staff', 'franchisee', 'tutor'],
  },
  parents: {
    label: 'Parents',
    description: 'Parents and clients',
    icon: UsersIcon,
    color: 'text-orange-600',
    roles: ['admin', 'staff', 'franchisee'],
  },
  public: {
    label: 'Public',
    description: 'Everyone can see this',
    icon: GlobeAltIcon,
    color: 'text-neutral-600',
    roles: ['admin', 'staff'],
  },
};

const BRANCHES = [
  { id: 'main', label: 'Main (HQ)' },
  { id: 'westside', label: 'Westside' },
  { id: 'eastside', label: 'Eastside' },
];

const VisibilitySelector = ({
  value = 'internal',
  onChange,
  targetBranches = [],
  onTargetBranchesChange,
  currentBranch = 'main',
  currentRole = 'admin',
  compact = false,
}) => {
  const [isOpen, setIsOpen] = useState(false);
  const [showBranchSelector, setShowBranchSelector] = useState(value === 'franchise_specific');
  const dropdownRef = useRef(null);

  // Get available options based on role
  const availableOptions = Object.entries(VISIBILITY_OPTIONS).filter(([key, opt]) => 
    opt.roles.includes(currentRole)
  );

  // Close dropdown when clicking outside
  useEffect(() => {
    const handleClickOutside = (event) => {
      if (dropdownRef.current && !dropdownRef.current.contains(event.target)) {
        setIsOpen(false);
      }
    };

    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  const selectedOption = VISIBILITY_OPTIONS[value] || VISIBILITY_OPTIONS.internal;
  const Icon = selectedOption.icon;

  const handleSelect = (key) => {
    onChange(key);
    if (key === 'franchise_specific') {
      setShowBranchSelector(true);
    } else {
      setShowBranchSelector(false);
      setIsOpen(false);
    }
  };

  const toggleBranch = (branchId) => {
    if (onTargetBranchesChange) {
      if (targetBranches.includes(branchId)) {
        onTargetBranchesChange(targetBranches.filter(b => b !== branchId));
      } else {
        onTargetBranchesChange([...targetBranches, branchId]);
      }
    }
  };

  return (
    <div className="relative" ref={dropdownRef}>
      {/* Trigger Button */}
      <button
        type="button"
        onClick={() => setIsOpen(!isOpen)}
        className={`flex items-center gap-2 px-3 py-1.5 rounded-lg border border-neutral-200 hover:border-neutral-300 transition-colors ${
          compact ? 'text-xs' : 'text-sm'
        }`}
      >
        <Icon className={`h-4 w-4 ${selectedOption.color}`} />
        <span className="text-neutral-700">{selectedOption.label}</span>
        <ChevronDownIcon className={`h-4 w-4 text-neutral-400 transition-transform ${isOpen ? 'rotate-180' : ''}`} />
      </button>

      {/* Dropdown Menu */}
      {isOpen && (
        <div className="absolute right-0 mt-2 w-64 bg-white rounded-lg shadow-lg border border-neutral-200 z-50 overflow-hidden">
          <div className="p-2 border-b border-neutral-100">
            <p className="text-xs font-medium text-neutral-500 uppercase tracking-wide">
              Who can see this?
            </p>
          </div>

          <div className="max-h-64 overflow-y-auto">
            {availableOptions.map(([key, option]) => {
              const OptionIcon = option.icon;
              const isSelected = value === key;

              return (
                <button
                  key={key}
                  type="button"
                  onClick={() => handleSelect(key)}
                  className={`w-full flex items-start gap-3 px-3 py-2.5 hover:bg-neutral-50 transition-colors ${
                    isSelected ? 'bg-brand-purple/5' : ''
                  }`}
                >
                  <OptionIcon className={`h-5 w-5 mt-0.5 ${option.color}`} />
                  <div className="flex-1 text-left">
                    <div className="flex items-center gap-2">
                      <span className={`font-medium ${isSelected ? 'text-brand-purple' : 'text-neutral-900'}`}>
                        {option.label}
                      </span>
                      {isSelected && (
                        <CheckIcon className="h-4 w-4 text-brand-purple" />
                      )}
                    </div>
                    <p className="text-xs text-neutral-500">{option.description}</p>
                  </div>
                </button>
              );
            })}
          </div>

          {/* Branch Selector for franchise_specific */}
          {showBranchSelector && value === 'franchise_specific' && (
            <div className="p-3 border-t border-neutral-100 bg-neutral-50">
              <p className="text-xs font-medium text-neutral-500 mb-2">Select branches:</p>
              <div className="space-y-1">
                {BRANCHES.map((branch) => (
                  <label
                    key={branch.id}
                    className="flex items-center gap-2 cursor-pointer hover:bg-white px-2 py-1 rounded"
                  >
                    <input
                      type="checkbox"
                      checked={targetBranches.includes(branch.id)}
                      onChange={() => toggleBranch(branch.id)}
                      className="rounded border-neutral-300 text-brand-purple focus:ring-brand-purple"
                    />
                    <span className="text-sm text-neutral-700">{branch.label}</span>
                  </label>
                ))}
              </div>
              <button
                type="button"
                onClick={() => setIsOpen(false)}
                className="mt-2 w-full py-1.5 text-xs bg-brand-purple text-white rounded-lg hover:bg-brand-navy transition-colors"
              >
                Done
              </button>
            </div>
          )}
        </div>
      )}
    </div>
  );
};

export default VisibilitySelector;

