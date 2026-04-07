import React, { useState, useEffect } from 'react';
import { CurrencyDollarIcon, ArrowTrendingDownIcon, ArrowTrendingUpIcon } from '@heroicons/react/24/outline';
import { formatCurrency } from '../../utils/formatters';

export default function ExecutiveSnapshot() {
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [selectedAccount, setSelectedAccount] = useState(null);

  useEffect(() => {
    fetchSnapshot();
  }, [selectedAccount]);

  const fetchSnapshot = async () => {
    try {
      setLoading(true);
      const params = new URLSearchParams();
      if (selectedAccount) {
        params.append('stripeAccountId', selectedAccount);
      }
      const response = await fetch(`/api/financial/snapshot?${params}`);
      if (response.ok) {
        const snapshot = await response.json();
        setData(snapshot);
      }
    } catch (error) {
      console.error('Error fetching snapshot:', error);
    } finally {
      setLoading(false);
    }
  };

  if (loading) {
    return (
      <div className="bg-white rounded-xl shadow-sm border border-neutral-200 p-6">
        <h2 className="text-xl font-semibold text-neutral-900 mb-4">Executive Snapshot</h2>
        <div className="text-neutral-500">Loading...</div>
      </div>
    );
  }

  if (!data) {
    return (
      <div className="bg-white rounded-xl shadow-sm border border-neutral-200 p-6">
        <h2 className="text-xl font-semibold text-neutral-900 mb-4">Executive Snapshot</h2>
        <div className="text-red-500">Error loading data</div>
      </div>
    );
  }


  return (
    <div className="bg-white rounded-xl shadow-sm border border-neutral-200 p-6">
      <div className="flex items-center justify-between mb-6">
        <h2 className="text-xl font-semibold text-neutral-900">Executive Snapshot</h2>
        <select
          value={selectedAccount || ''}
          onChange={(e) => setSelectedAccount(e.target.value || null)}
          className="text-sm border border-neutral-300 rounded-md px-3 py-1.5"
        >
          <option value="">All Accounts</option>
          {/* Account options will be populated from API */}
        </select>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
        <div className="bg-gradient-to-br from-blue-50 to-blue-100 rounded-lg p-4 border border-blue-200">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm text-neutral-600">MTD Revenue</p>
              <p className="text-2xl font-bold text-neutral-900 mt-1">
                {formatCurrency(data.mtdRevenue)}
              </p>
            </div>
            <CurrencyDollarIcon className="h-8 w-8 text-blue-600" />
          </div>
        </div>

        <div className="bg-gradient-to-br from-red-50 to-red-100 rounded-lg p-4 border border-red-200">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm text-neutral-600">MTD Spend</p>
              <p className="text-2xl font-bold text-neutral-900 mt-1">
                {formatCurrency(data.mtdSpend)}
              </p>
            </div>
            <ArrowTrendingDownIcon className="h-8 w-8 text-red-600" />
          </div>
        </div>

        <div className="bg-gradient-to-br from-purple-50 to-purple-100 rounded-lg p-4 border border-purple-200">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm text-neutral-600">Net Burn</p>
              <p className="text-2xl font-bold text-neutral-900 mt-1">
                {formatCurrency(data.netBurn)}
              </p>
            </div>
            {data.netBurn < 0 ? (
              <ArrowTrendingUpIcon className="h-8 w-8 text-green-600" />
            ) : (
              <ArrowTrendingDownIcon className="h-8 w-8 text-red-600" />
            )}
          </div>
        </div>

        <div className="bg-gradient-to-br from-orange-50 to-orange-100 rounded-lg p-4 border border-orange-200">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm text-neutral-600">Rolling 3-Month Burn</p>
              <p className="text-2xl font-bold text-neutral-900 mt-1">
                {formatCurrency(data.rolling3MonthBurn)}
              </p>
            </div>
            <ArrowTrendingDownIcon className="h-8 w-8 text-orange-600" />
          </div>
        </div>

        {data.topCostCategory && (
          <div className="bg-gradient-to-br from-neutral-50 to-neutral-100 rounded-lg p-4 border border-neutral-200">
            <div>
              <p className="text-sm text-neutral-600">Top Cost Category</p>
              <p className="text-lg font-semibold text-neutral-900 mt-1">
                {data.topCostCategory.category || 'N/A'}
              </p>
              <p className="text-sm text-neutral-500 mt-1">
                {formatCurrency(data.topCostCategory.total)}
              </p>
            </div>
          </div>
        )}

        {data.topVendor && (
          <div className="bg-gradient-to-br from-neutral-50 to-neutral-100 rounded-lg p-4 border border-neutral-200">
            <div>
              <p className="text-sm text-neutral-600">Top Vendor</p>
              <p className="text-lg font-semibold text-neutral-900 mt-1">
                {data.topVendor.merchant_name || 'N/A'}
              </p>
              <p className="text-sm text-neutral-500 mt-1">
                {formatCurrency(data.topVendor.total)}
              </p>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
