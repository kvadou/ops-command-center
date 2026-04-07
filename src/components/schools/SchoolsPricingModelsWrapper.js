import React from 'react';
import SchoolPricingModels from '../SchoolPricingModels';

/**
 * SchoolsPricingModelsWrapper - Wraps SchoolPricingModels
 * This allows the pricing models page to be accessed via /schools/dashboard/pricing-models
 */
export default function SchoolsPricingModelsWrapper() {
  return (
      <div className="w-full">
        <SchoolPricingModels />
      </div>
  );
}
