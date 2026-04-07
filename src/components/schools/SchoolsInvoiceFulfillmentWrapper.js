import React from 'react';
import SchoolPartnersInvoiceFulfillment from './SchoolPartnersInvoiceFulfillment';

/**
 * SchoolsInvoiceFulfillmentWrapper - Wraps SchoolPartnersInvoiceFulfillment
 * This allows the invoice fulfillment page to be accessed via /schools/dashboard/invoice-fulfillment
 * with the new school partners invoice fulfillment content
 */
export default function SchoolsInvoiceFulfillmentWrapper() {
  return (
      <div className="w-full">
        <SchoolPartnersInvoiceFulfillment />
      </div>
  );
}
