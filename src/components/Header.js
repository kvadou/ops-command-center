import React from 'react';
import { useHeaderActions } from '../contexts/HeaderActionsContext';

/**
 * Header component - Displays a page title with optional actions
 * Actions can be provided via props or through HeaderActionsContext
 */
export default function Header({ title, actions: propActions }) {
  const { actions: contextActions } = useHeaderActions();
  const actions = propActions || contextActions;
  
  return (
    <div className="border-b border-neutral-200 bg-white shadow-sm">
      <div className="mx-auto px-4 sm:px-6 lg:px-8 py-2 sm:py-3">
        <div className="flex items-center justify-between">
          <div className="flex items-center">
            <div className="w-1 h-6 bg-gradient-to-b from-brand-purple to-brand-navy rounded-full mr-4" />
            <h1 className="text-xl sm:text-2xl lg:text-3xl font-bold text-brand-navy font-heading">
              {title}
            </h1>
          </div>
          {actions && <div className="flex items-center gap-2">{actions}</div>}
        </div>
      </div>
    </div>
  );
}

