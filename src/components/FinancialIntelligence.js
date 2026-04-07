import React from 'react';
import ForecastCard from './ForecastCard';
import ExecutiveSnapshot from './financial/ExecutiveSnapshot';
import RevenueSection from './financial/RevenueSection';
import ExpensesSection from './financial/ExpensesSection';
import PayrollSection from './financial/PayrollSection';
import SpendSimulator from './financial/SpendSimulator';
import InvestorSummary from './financial/InvestorSummary';

export default function FinancialIntelligence() {
  return (
    <div className="max-w-7xl mx-auto w-full">
      {/* Section 1: Executive Snapshot */}
      <div className="mb-6">
        <ExecutiveSnapshot />
      </div>

      {/* Section 2: Revenue (Stripe) */}
      <div className="mb-6">
        <RevenueSection />
      </div>

      {/* Section 3: Expenses (Ramp) */}
      <div className="mb-6">
        <ExpensesSection />
      </div>

      {/* Section 4: Payroll */}
      <div className="mb-6">
        <PayrollSection />
      </div>

      {/* Section 5: Revenue Forecast (moved from Analytics) */}
      <div className="mb-6">
        <div className="bg-white rounded-xl shadow-sm border border-neutral-200 p-6">
          <h2 className="text-xl font-semibold text-neutral-900 mb-4">3-Month Revenue Forecast</h2>
          <ForecastCard />
        </div>
      </div>

      {/* Section 6: "What If We Cut X?" Simulator */}
      <div className="mb-6">
        <SpendSimulator />
      </div>

      {/* Section 7: Investor-Grade Financial Summary */}
      <div className="mb-6">
        <InvestorSummary />
      </div>
    </div>
  );
}
