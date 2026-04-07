import React from 'react';
import SchoolBilling from '../SchoolBilling';

/**
 * SchoolsBillingWrapper - Wraps SchoolBilling
 * This allows the unified billing page to be accessed via /schools/dashboard/billing
 */
export default function SchoolsBillingWrapper() {
  return (
      <div className="w-full">
        <SchoolBilling />
      </div>
  );
}
