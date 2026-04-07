import React, { useState, useEffect } from 'react';
import { formatCurrency, formatDateTime } from '../../utils/formatters';
import { RoleProvider } from '../../contexts/RoleContext';
import { BranchProvider } from '../../contexts/BranchContext';
import {
  WalletIcon,
  FunnelIcon,
  ArrowUpTrayIcon,
  ChevronUpIcon,
  ChevronDownIcon,
} from '@heroicons/react/24/outline';

function BalanceUpdatesPageContent() {
  const [balanceUpdates, setBalanceUpdates] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [sortField, setSortField] = useState('created_at');
  const [sortOrder, setSortOrder] = useState('desc');
  const [summary, setSummary] = useState({
    count: 0,
    credit: 0,
    debit: 0,
    balance: 0,
  });

  useEffect(() => {
    fetchBalanceUpdates();
  }, [sortField, sortOrder]);

  const fetchBalanceUpdates = async () => {
    try {
      setLoading(true);
      const response = await fetch(`/api/accounting/balance-updates?limit=100`, {
        credentials: 'include',
      });

      if (!response.ok) throw new Error('Failed to fetch balance updates');

      const data = await response.json();
      const updates = data.balance_updates || [];
      
      setBalanceUpdates(updates);
      
      const credit = updates
        .filter(u => parseFloat(u.change_amount) > 0)
        .reduce((sum, u) => sum + parseFloat(u.change_amount), 0);
      const debit = Math.abs(updates
        .filter(u => parseFloat(u.change_amount) < 0)
        .reduce((sum, u) => sum + parseFloat(u.change_amount), 0));
      const balance = updates.length > 0 ? parseFloat(updates[0].new_balance) : 0;
      
      setSummary({
        count: updates.length,
        credit,
        debit,
        balance,
      });
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };


  const getUpdateTypeLabel = (type) => {
    const labels = {
      invoice: 'Invoice Creation',
      payment: 'Invoice Payment',
      credit: 'Credit Request Payment',
      refund: 'Refund',
      adjustment: 'Adjustment',
    };
    return labels[type] || type;
  };

  const handleSort = (field) => {
    if (sortField === field) {
      setSortOrder(sortOrder === 'asc' ? 'desc' : 'asc');
    } else {
      setSortField(field);
      setSortOrder('desc');
    }
  };

  const SortIcon = ({ field }) => {
    if (sortField !== field) return null;
    return sortOrder === 'asc' ? (
      <ChevronUpIcon className="h-4 w-4 inline ml-1" />
    ) : (
      <ChevronDownIcon className="h-4 w-4 inline ml-1" />
    );
  };

  return (
    <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-6 xl:px-8 py-4 sm:py-6">
      <div className="grid grid-cols-1 lg:grid-cols-4 gap-6">
        <div className="lg:col-span-3">
          {/* Header with Actions */}
          <div className="flex items-center justify-between mb-6">
            <h1 className="text-2xl font-bold text-neutral-900">Balance Updates</h1>
            <div className="flex gap-2">
              <button className="px-4 py-2 border border-neutral-300 rounded-lg hover:bg-neutral-50 flex items-center gap-2">
                <FunnelIcon className="h-5 w-5 text-neutral-600" />
                <span className="text-sm font-medium text-neutral-700">Filter</span>
              </button>
              <button className="px-4 py-2 border border-neutral-300 rounded-lg hover:bg-neutral-50 flex items-center gap-2">
                <ArrowUpTrayIcon className="h-5 w-5 text-neutral-600" />
                <span className="text-sm font-medium text-neutral-700">Export</span>
              </button>
            </div>
          </div>

          {/* Balance Updates Table */}
          {loading ? (
            <div className="bg-white rounded-xl shadow-sm border border-neutral-200 p-12 text-center">
              <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-brand-purple mx-auto"></div>
              <p className="mt-4 text-neutral-600">Loading balance updates...</p>
            </div>
          ) : error ? (
            <div className="bg-white rounded-xl shadow-sm border border-neutral-200 p-6">
              <div className="text-red-600">{error}</div>
            </div>
          ) : balanceUpdates.length === 0 ? (
            <div className="bg-white rounded-xl shadow-sm border border-neutral-200 p-12 text-center">
              <WalletIcon className="h-12 w-12 text-neutral-400 mx-auto mb-4" />
              <p className="text-neutral-600">No balance updates found</p>
            </div>
          ) : (
            <div className="bg-white rounded-xl shadow-sm border border-neutral-200 overflow-hidden">
              <div className="overflow-x-auto">
                <table className="min-w-full divide-y divide-neutral-200">
                  <thead className="bg-neutral-50">
                    <tr>
                      <th 
                        className="px-6 py-3 text-left text-xs font-medium text-neutral-500 uppercase tracking-wider cursor-pointer hover:bg-neutral-100"
                        onClick={() => handleSort('created_at')}
                      >
                        Created <SortIcon field="created_at" />
                      </th>
                      <th 
                        className="px-6 py-3 text-left text-xs font-medium text-neutral-500 uppercase tracking-wider cursor-pointer hover:bg-neutral-100"
                        onClick={() => handleSort('update_type')}
                      >
                        Update Type <SortIcon field="update_type" />
                      </th>
                      <th className="px-6 py-3 text-left text-xs font-medium text-neutral-500 uppercase tracking-wider">
                        Method
                      </th>
                      <th className="px-6 py-3 text-left text-xs font-medium text-neutral-500 uppercase tracking-wider">
                        Creator
                      </th>
                      <th className="px-6 py-3 text-left text-xs font-medium text-neutral-500 uppercase tracking-wider">
                        Role
                      </th>
                      <th 
                        className="px-6 py-3 text-right text-xs font-medium text-neutral-500 uppercase tracking-wider cursor-pointer hover:bg-neutral-100"
                        onClick={() => handleSort('change_amount')}
                      >
                        Amount <SortIcon field="change_amount" />
                      </th>
                    </tr>
                  </thead>
                  <tbody className="bg-white divide-y divide-neutral-200">
                    {balanceUpdates.map((update) => (
                      <tr key={update.id} className="hover:bg-neutral-50">
                        <td className="px-6 py-4 whitespace-nowrap text-sm text-neutral-500">
                          {formatDateTime(update.created_at)}
                        </td>
                        <td className="px-6 py-4 whitespace-nowrap text-sm">
                          <a href="#" className="text-brand-purple hover:text-brand-navy">
                            {getUpdateTypeLabel(update.update_type)}
                          </a>
                        </td>
                        <td className="px-6 py-4 whitespace-nowrap text-sm text-neutral-700">
                          {update.description || 'System Generated'}
                        </td>
                        <td className="px-6 py-4 whitespace-nowrap text-sm text-neutral-700">
                          {update.created_by || 'System'}
                        </td>
                        <td className="px-6 py-4 whitespace-nowrap text-sm">
                          <a href="#" className="text-brand-purple hover:text-brand-navy">
                            {update.client_first_name} {update.client_last_name}
                          </a>
                        </td>
                        <td className={`px-6 py-4 whitespace-nowrap text-sm text-right font-medium ${
                          parseFloat(update.change_amount) >= 0 ? 'text-green-600' : 'text-red-600'
                        }`}>
                          {formatCurrency(update.change_amount)}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}
        </div>

        {/* Totals Sidebar */}
        <div className="lg:col-span-1">
          <div className="bg-white rounded-xl shadow-sm border border-neutral-200 p-6 sticky top-6">
            <h3 className="text-lg font-semibold text-neutral-900 mb-4">Totals</h3>
            <div className="space-y-3">
              <div className="flex justify-between text-sm">
                <span className="text-neutral-600">Balance Update Count:</span>
                <span className="font-semibold text-neutral-900">{summary.count.toLocaleString()}</span>
              </div>
              <div className="flex justify-between text-sm">
                <span className="text-neutral-600">Credit:</span>
                <span className="font-semibold text-green-600">{formatCurrency(summary.credit)}</span>
              </div>
              <div className="flex justify-between text-sm">
                <span className="text-neutral-600">Debit:</span>
                <span className="font-semibold text-red-600">{formatCurrency(summary.debit)}</span>
              </div>
              <div className="border-t border-neutral-200 pt-3 mt-3">
                <div className="flex justify-between">
                  <span className="font-semibold text-neutral-900">Balance:</span>
                  <span className={`font-bold text-lg ${
                    summary.balance >= 0 ? 'text-green-600' : 'text-red-600'
                  }`}>
                    {formatCurrency(summary.balance)}
                  </span>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

export default function BalanceUpdatesPage() {
  return (
    <RoleProvider>
      <BranchProvider>
        <BalanceUpdatesPageContent />
      </BranchProvider>
    </RoleProvider>
  );
}

