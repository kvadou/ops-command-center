import React, { useState, useEffect } from 'react';
import { CalculatorIcon } from '@heroicons/react/24/outline';
import { formatCurrency } from '../../utils/formatters';

export default function SpendSimulator() {
  const [vendorReductions, setVendorReductions] = useState({});
  const [categoryReductions, setCategoryReductions] = useState({});
  const [payrollAdjustment, setPayrollAdjustment] = useState(0);
  const [selectedAccount, setSelectedAccount] = useState('combined');
  const [vendors, setVendors] = useState([]);
  const [categories, setCategories] = useState([]);
  const [simulationResult, setSimulationResult] = useState(null);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    fetchVendorsAndCategories();
  }, []);

  useEffect(() => {
    if (vendors.length > 0 || categories.length > 0) {
      runSimulation();
    }
  }, [vendorReductions, categoryReductions, payrollAdjustment, selectedAccount]);

  const fetchVendorsAndCategories = async () => {
    try {
      const endDate = new Date().toISOString().split('T')[0];
      const startDate = new Date();
      startDate.setMonth(startDate.getMonth() - 1);
      const startDateStr = startDate.toISOString().split('T')[0];

      const response = await fetch(
        `/api/financial/ramp/transactions?startDate=${startDateStr}&endDate=${endDate}`
      );
      if (response.ok) {
        const transactions = await response.json();
        
        const vendorSet = new Set();
        const categorySet = new Set();
        transactions.forEach(t => {
          if (t.merchant_name) vendorSet.add(t.merchant_name);
          if (t.category) categorySet.add(t.category);
        });
        
        setVendors(Array.from(vendorSet).slice(0, 20));
        setCategories(Array.from(categorySet));
      }
    } catch (error) {
      console.error('Error fetching vendors/categories:', error);
    }
  };

  const runSimulation = async () => {
    try {
      setLoading(true);
      const endDate = new Date().toISOString().split('T')[0];
      const startDate = new Date();
      startDate.setMonth(startDate.getMonth() - 1);
      const startDateStr = startDate.toISOString().split('T')[0];

      const response = await fetch(`/api/financial/simulator?startDate=${startDateStr}&endDate=${endDate}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          vendorReductions,
          categoryReductions,
          payrollAdjustment,
          stripeAccountId: selectedAccount === 'combined' ? null : selectedAccount,
        }),
      });

      if (response.ok) {
        const result = await response.json();
        setSimulationResult(result);
      }
    } catch (error) {
      console.error('Error running simulation:', error);
    } finally {
      setLoading(false);
    }
  };


  return (
    <div className="bg-white rounded-xl shadow-sm border border-neutral-200 p-6">
      <div className="flex items-center gap-2 mb-6">
        <CalculatorIcon className="h-6 w-6 text-brand-purple" />
        <h2 className="text-xl font-semibold text-neutral-900">"What If We Cut X?" Simulator</h2>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Controls */}
        <div className="space-y-6">
          <div>
            <label className="block text-sm font-medium text-neutral-700 mb-2">
              Stripe Account
            </label>
            <select
              value={selectedAccount}
              onChange={(e) => setSelectedAccount(e.target.value)}
              className="w-full text-sm border border-neutral-300 rounded-md px-3 py-2"
            >
              <option value="combined">Combined</option>
            </select>
          </div>

          <div>
            <label className="block text-sm font-medium text-neutral-700 mb-2">
              Vendor Reductions (%)
            </label>
            <div className="space-y-2 max-h-48 overflow-y-auto">
              {vendors.map(vendor => (
                <div key={vendor} className="flex items-center gap-2">
                  <span className="text-sm text-neutral-600 flex-1 truncate">{vendor}</span>
                  <input
                    type="number"
                    min="0"
                    max="100"
                    value={vendorReductions[vendor] || 0}
                    onChange={(e) =>
                      setVendorReductions({
                        ...vendorReductions,
                        [vendor]: parseFloat(e.target.value) || 0,
                      })
                    }
                    className="w-20 text-sm border border-neutral-300 rounded px-2 py-1"
                  />
                  <span className="text-sm text-neutral-500">%</span>
                </div>
              ))}
            </div>
          </div>

          <div>
            <label className="block text-sm font-medium text-neutral-700 mb-2">
              Category Reductions (%)
            </label>
            <div className="space-y-2 max-h-48 overflow-y-auto">
              {categories.map(category => (
                <div key={category} className="flex items-center gap-2">
                  <span className="text-sm text-neutral-600 flex-1 truncate">{category}</span>
                  <input
                    type="number"
                    min="0"
                    max="100"
                    value={categoryReductions[category] || 0}
                    onChange={(e) =>
                      setCategoryReductions({
                        ...categoryReductions,
                        [category]: parseFloat(e.target.value) || 0,
                      })
                    }
                    className="w-20 text-sm border border-neutral-300 rounded px-2 py-1"
                  />
                  <span className="text-sm text-neutral-500">%</span>
                </div>
              ))}
            </div>
          </div>

          <div>
            <label className="block text-sm font-medium text-neutral-700 mb-2">
              Payroll Adjustment ($)
            </label>
            <input
              type="number"
              value={payrollAdjustment}
              onChange={(e) => setPayrollAdjustment(parseFloat(e.target.value) || 0)}
              className="w-full text-sm border border-neutral-300 rounded-md px-3 py-2"
            />
          </div>
        </div>

        {/* Results */}
        <div className="bg-neutral-50 rounded-lg p-6">
          <h3 className="text-lg font-semibold text-neutral-900 mb-4">Simulation Results</h3>
          {loading ? (
            <div className="text-neutral-500">Calculating...</div>
          ) : simulationResult ? (
            <div className="space-y-4">
              <div>
                <p className="text-sm text-neutral-600">Monthly Burn</p>
                <p className="text-2xl font-bold text-neutral-900">
                  {formatCurrency(simulationResult.monthlyBurn)}
                </p>
              </div>
              <div>
                <p className="text-sm text-neutral-600">EBITDA</p>
                <p className="text-2xl font-bold text-neutral-900">
                  {formatCurrency(simulationResult.ebitda)}
                </p>
              </div>
              <div>
                <p className="text-sm text-neutral-600">EBITDA Margin</p>
                <p className="text-2xl font-bold text-neutral-900">
                  {simulationResult.ebitdaMargin.toFixed(1)}%
                </p>
              </div>
              <div className="pt-4 border-t border-neutral-200">
                <p className="text-xs text-neutral-500">
                  Revenue: {formatCurrency(simulationResult.revenue)}
                </p>
                <p className="text-xs text-neutral-500">
                  Expenses: {formatCurrency(simulationResult.expenses)}
                </p>
                <p className="text-xs text-neutral-500">
                  Ramp Spend: {formatCurrency(simulationResult.rampSpend)}
                </p>
                <p className="text-xs text-neutral-500">
                  Payroll: {formatCurrency(simulationResult.payroll)}
                </p>
              </div>
            </div>
          ) : (
            <div className="text-neutral-500">Adjust controls to see simulation results</div>
          )}
        </div>
      </div>
    </div>
  );
}
