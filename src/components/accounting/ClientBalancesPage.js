import React, { useState, useEffect } from 'react';
import { RoleProvider } from '../../contexts/RoleContext';
import { BranchProvider } from '../../contexts/BranchContext';
import { formatCurrency } from '../../utils/formatters';
import {
  CurrencyDollarIcon,
  ChevronUpIcon,
  ChevronDownIcon,
} from '@heroicons/react/24/outline';

function ClientBalancesPageContent() {
  const [clients, setClients] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [sortField, setSortField] = useState('invoice_balance');
  const [sortOrder, setSortOrder] = useState('desc');
  const [filters, setFilters] = useState({
    showOnlyLive: true,
    minBalance: '',
    maxBalance: '',
  });

  useEffect(() => {
    fetchClientBalances();
  }, [sortField, sortOrder, filters]);

  const fetchClientBalances = async () => {
    try {
      setLoading(true);
      const params = new URLSearchParams({
        sort_by: sortField,
        sort_order: sortOrder,
      });

      if (filters.showOnlyLive) {
        params.set('status', 'active');
      }

      const response = await fetch(`/api/accounting/client-balances?${params}`, {
        credentials: 'include',
      });

      if (!response.ok) throw new Error('Failed to fetch client balances');

      const data = await response.json();
      let filteredClients = data.clients || [];
      
      // Apply balance filters
      if (filters.minBalance) {
        const min = parseFloat(filters.minBalance);
        filteredClients = filteredClients.filter(c => 
          parseFloat(c.invoice_balance || 0) >= min
        );
      }
      if (filters.maxBalance) {
        const max = parseFloat(filters.maxBalance);
        filteredClients = filteredClients.filter(c => 
          parseFloat(c.invoice_balance || 0) <= max
        );
      }
      
      setClients(filteredClients);
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
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

  const handleClearFilters = () => {
    setFilters({
      showOnlyLive: true,
      minBalance: '',
      maxBalance: '',
    });
  };

  const handleApplyFilters = () => {
    fetchClientBalances();
  };

  return (
    <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-6 xl:px-8 py-4 sm:py-6">
      <div className="grid grid-cols-1 lg:grid-cols-4 gap-6">
        {/* Main Content */}
        <div className="lg:col-span-3">
          <div className="mb-6">
            <h1 className="text-2xl font-bold text-neutral-900">Client Balances</h1>
            <p className="mt-1 text-sm text-neutral-500">
              View and manage client account balances
            </p>
          </div>

          {/* Client Balances Table */}
          {loading ? (
            <div className="bg-white rounded-xl shadow-sm border border-neutral-200 p-12 text-center">
              <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-brand-purple mx-auto"></div>
              <p className="mt-4 text-neutral-600">Loading client balances...</p>
            </div>
          ) : error ? (
            <div className="bg-white rounded-xl shadow-sm border border-neutral-200 p-6">
              <div className="text-red-600">{error}</div>
            </div>
          ) : clients.length === 0 ? (
            <div className="bg-white rounded-xl shadow-sm border border-neutral-200 p-12 text-center">
              <CurrencyDollarIcon className="h-12 w-12 text-neutral-400 mx-auto mb-4" />
              <p className="text-neutral-600">No client balances found</p>
            </div>
          ) : (
            <div className="bg-white rounded-xl shadow-sm border border-neutral-200 overflow-hidden">
              <div className="overflow-x-auto">
                <table className="min-w-full divide-y divide-neutral-200">
                  <thead className="bg-neutral-50">
                    <tr>
                      <th 
                        className="px-6 py-3 text-left text-xs font-medium text-neutral-500 uppercase tracking-wider cursor-pointer hover:bg-neutral-100"
                        onClick={() => handleSort('client')}
                      >
                        Client <SortIcon field="client" />
                      </th>
                      <th 
                        className="px-6 py-3 text-right text-xs font-medium text-neutral-500 uppercase tracking-wider cursor-pointer hover:bg-neutral-100"
                        onClick={() => handleSort('available_balance')}
                      >
                        Available Balance <SortIcon field="available_balance" />
                      </th>
                      <th 
                        className="px-6 py-3 text-right text-xs font-medium text-neutral-500 uppercase tracking-wider cursor-pointer hover:bg-neutral-100"
                        onClick={() => handleSort('invoice_balance')}
                      >
                        Invoice Balance <SortIcon field="invoice_balance" />
                      </th>
                    </tr>
                  </thead>
                  <tbody className="bg-white divide-y divide-neutral-200">
                    {clients.map((client) => {
                      const availableBalance = parseFloat(client.available_balance || 0);
                      const invoiceBalance = parseFloat(client.invoice_balance || 0);
                      return (
                        <tr key={client.id} className="hover:bg-neutral-50">
                          <td className="px-6 py-4 whitespace-nowrap text-sm font-medium text-neutral-900">
                            {client.first_name} {client.last_name}
                          </td>
                          <td className={`px-6 py-4 whitespace-nowrap text-sm text-right font-medium ${
                            availableBalance >= 0 ? 'text-green-600' : 'text-red-600'
                          }`}>
                            {formatCurrency(availableBalance)}
                          </td>
                          <td className={`px-6 py-4 whitespace-nowrap text-sm text-right font-medium ${
                            invoiceBalance >= 0 ? 'text-green-600' : 'text-red-600'
                          }`}>
                            {formatCurrency(invoiceBalance)}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
              
              {/* Pagination */}
              <div className="bg-neutral-50 px-6 py-3 flex items-center justify-between border-t border-neutral-200">
                <div className="flex items-center gap-2">
                  <button className="px-2 py-1 text-sm text-neutral-700 hover:bg-neutral-200 rounded">«</button>
                  <button className="px-2 py-1 text-sm text-neutral-700 hover:bg-neutral-200 rounded">‹</button>
                  <button className="px-3 py-1 text-sm font-medium bg-brand-purple text-white rounded">1</button>
                  <button className="px-2 py-1 text-sm text-neutral-700 hover:bg-neutral-200 rounded">2</button>
                  <button className="px-2 py-1 text-sm text-neutral-700 hover:bg-neutral-200 rounded">3</button>
                  <button className="px-2 py-1 text-sm text-neutral-700 hover:bg-neutral-200 rounded">›</button>
                  <button className="px-2 py-1 text-sm text-neutral-700 hover:bg-neutral-200 rounded">»</button>
                </div>
              </div>
            </div>
          )}
        </div>

        {/* Filter Sidebar */}
        <div className="lg:col-span-1">
          <div className="bg-white rounded-xl shadow-sm border border-neutral-200 p-6 sticky top-6">
            <h3 className="text-lg font-semibold text-neutral-900 mb-4">Filter</h3>
            <div className="space-y-4">
              <div>
                <label className="flex items-center">
                  <input
                    type="checkbox"
                    checked={filters.showOnlyLive}
                    onChange={(e) => setFilters({ ...filters, showOnlyLive: e.target.checked })}
                    className="h-4 w-4 text-brand-purple focus:ring-brand-purple border-neutral-300 rounded"
                  />
                  <span className="ml-2 text-sm text-neutral-700">Show only Live clients</span>
                </label>
                <p className="mt-1 text-xs text-neutral-500">
                  By default, all client's balances are shown
                </p>
              </div>
              
              <div>
                <label className="block text-sm font-medium text-neutral-700 mb-1">
                  Minimum Balance
                </label>
                <input
                  type="number"
                  value={filters.minBalance}
                  onChange={(e) => setFilters({ ...filters, minBalance: e.target.value })}
                  placeholder="0.00"
                  className="w-full px-3 py-2 border border-neutral-300 rounded-lg focus:ring-2 focus:ring-brand-purple focus:border-brand-purple"
                />
              </div>
              
              <div>
                <label className="block text-sm font-medium text-neutral-700 mb-1">
                  Maximum Balance
                </label>
                <input
                  type="number"
                  value={filters.maxBalance}
                  onChange={(e) => setFilters({ ...filters, maxBalance: e.target.value })}
                  placeholder="0.00"
                  className="w-full px-3 py-2 border border-neutral-300 rounded-lg focus:ring-2 focus:ring-brand-purple focus:border-brand-purple"
                />
              </div>
              
              <div className="flex flex-col gap-2 pt-4 border-t border-neutral-200">
                <button
                  onClick={handleClearFilters}
                  className="w-full px-4 py-2 bg-white border border-neutral-300 rounded-lg hover:bg-neutral-50 text-sm font-medium text-neutral-700"
                >
                  Clear filter
                </button>
                <button
                  onClick={handleApplyFilters}
                  className="w-full px-4 py-2 bg-brand-purple text-white rounded-lg hover:bg-brand-navy text-sm font-medium"
                >
                  Apply
                </button>
                <button className="w-full px-4 py-2 bg-brand-purple text-white rounded-lg hover:bg-brand-navy text-sm font-medium">
                  Export List
                </button>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

export default function ClientBalancesPage() {
  return (
    <RoleProvider>
      <BranchProvider>
        <ClientBalancesPageContent />
      </BranchProvider>
    </RoleProvider>
  );
}

