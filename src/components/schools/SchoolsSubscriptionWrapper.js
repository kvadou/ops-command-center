import React from 'react';
import SchoolBilling from '../SchoolBilling';
import { CreditCardIcon } from '@heroicons/react/24/outline';

/**
 * SchoolsSubscriptionWrapper - Wraps SchoolBilling
 * This allows the unified billing page to be accessed via /schools/dashboard/billing
 * Handles both monthly and term billing in a single view
 */
export default function SchoolsSubscriptionWrapper() {
  return (
      <div className="w-full">
        {/* Page Header - White Background Container */}
        <div className="bg-white rounded-xl shadow-sm border border-neutral-200 p-4 sm:p-6 mb-4 sm:mb-6 hover:shadow-md hover:border-brand-purple/20 transition-all duration-200">
          <div className="flex items-center gap-3">
            <div className="p-2 bg-brand-purple rounded-lg">
              <CreditCardIcon className="h-6 w-6 text-white" />
            </div>
            <h1 className="text-xl sm:text-2xl font-bold text-neutral-900">Billing Dashboard</h1>
          </div>
        </div>
        <SchoolBilling />
      </div>
  );
}
