import React, { useState, useEffect, useMemo } from 'react';
import { useSearchParams } from 'react-router-dom';
import { useCompanyName } from '../contexts/CompanyNameContext';
import { formatCurrency } from '../utils/formatters';
import {
  ArrowDownTrayIcon,
  ChevronUpIcon,
  ChevronDownIcon,
} from '@heroicons/react/24/outline';

const INTERVALS = [
  { value: 'month', label: 'Month' },
  { value: 'week', label: 'Week' },
  { value: 'day', label: 'Day' },
];

function ClientSpendPage() {
  const [searchParams, setSearchParams] = useSearchParams();
  const { companyName } = useCompanyName();
  const [dateType, setDateType] = useState(
    searchParams.get('dateType') || 'charge'
  );
  const [interval, setInterval] = useState(
    searchParams.get('interval') || 'month'
  );
  const [startDate, setStartDate] = useState(
    searchParams.get('startDate') ||
    new Date(Date.now() - 180 * 24 * 60 * 60 * 1000).toISOString().split('T')[0]
  );
  const [endDate, setEndDate] = useState(
    searchParams.get('endDate') ||
    new Date().toISOString().split('T')[0]
  );
  const [clientManagerId, setClientManagerId] = useState(
    searchParams.get('clientManagerId') || ''
  );
  const [showAllBranches, setShowAllBranches] = useState(
    searchParams.get('showAllBranches') === 'true'
  );
  const [data, setData] = useState([]);
  const [periods, setPeriods] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [sortConfig, setSortConfig] = useState({ field: 'total_spend', direction: 'desc' });

  useEffect(() => {
    fetchData();
  }, [dateType, interval, startDate, endDate, clientManagerId, showAllBranches]);

  const fetchData = async () => {
    setLoading(true);
    setError(null);
    try {
      const params = new URLSearchParams({
        dateType,
        interval,
        startDate,
        endDate,
        showAllBranches: showAllBranches.toString(),
      });

      if (clientManagerId) {
        params.set('clientManagerId', clientManagerId);
      }

      const response = await fetch(`/api/client-spend?${params}`, {
        credentials: 'include',
      });

      if (!response.ok) {
        throw new Error('Failed to fetch client spend');
      }

      const result = await response.json();
      setData(result.data || []);
      setPeriods(result.periods || []);

      // Update URL params
      const newParams = new URLSearchParams(searchParams);
      newParams.set('dateType', dateType);
      newParams.set('interval', interval);
      newParams.set('startDate', startDate);
      newParams.set('endDate', endDate);
      newParams.set('showAllBranches', showAllBranches.toString());
      if (clientManagerId) {
        newParams.set('clientManagerId', clientManagerId);
      }
      setSearchParams(newParams, { replace: true });
    } catch (err) {
      console.error('Error fetching client spend:', err);
      setError(err.message);
      setData([]);
      setPeriods([]);
    } finally {
      setLoading(false);
    }
  };

  const handleSort = (field) => {
    setSortConfig((prev) => {
      if (prev.field === field) {
        return {
          field,
          direction: prev.direction === 'asc' ? 'desc' : 'asc',
        };
      }
      return { field, direction: 'desc' };
    });
  };

  const sortedData = useMemo(() => {
    if (!data.length) return [];

    const sorted = [...data].sort((a, b) => {
      let aValue, bValue;

      if (sortConfig.field === 'client_name') {
        aValue = a.client_name || '';
        bValue = b.client_name || '';
        return sortConfig.direction === 'asc'
          ? aValue.localeCompare(bValue)
          : bValue.localeCompare(aValue);
      } else if (sortConfig.field === 'total_spend') {
        aValue = a.total_spend || 0;
        bValue = b.total_spend || 0;
        return sortConfig.direction === 'asc' ? aValue - bValue : bValue - aValue;
      } else {
        // Sorting by period column
        const periodIndex = periods.indexOf(sortConfig.field);
        if (periodIndex === -1) return 0;
        
        const aPeriod = a.periods?.[periodIndex];
        const bPeriod = b.periods?.[periodIndex];
        aValue = aPeriod?.amount || 0;
        bValue = bPeriod?.amount || 0;
        return sortConfig.direction === 'asc' ? aValue - bValue : bValue - aValue;
      }
    });

    return sorted;
  }, [data, sortConfig, periods]);

  const handleExportCSV = () => {
    if (!data.length) return;

    const headers = [
      'Name',
      'Total',
      ...periods,
    ];

    const rows = sortedData.map((row) => [
      row.client_name || 'Unknown',
      parseFloat(row.total_spend || 0).toFixed(2),
      ...periods.map((period) => {
        const periodData = row.periods?.find((p) => p.period === period);
        return parseFloat(periodData?.amount || 0).toFixed(2);
      }),
    ]);

    const csvContent = [
      headers.join(','),
      ...rows.map((row) => row.join(',')),
    ].join('\n');

    const blob = new Blob([csvContent], { type: 'text/csv' });
    const url = window.URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `client-spend-${dateType}-${interval}-${startDate}-to-${endDate}.csv`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    window.URL.revokeObjectURL(url);
  };


  const getSortIcon = (field) => {
    if (sortConfig.field !== field) {
      return null;
    }
    return sortConfig.direction === 'asc' ? (
      <ChevronUpIcon className="h-4 w-4 inline-block ml-1" />
    ) : (
      <ChevronDownIcon className="h-4 w-4 inline-block ml-1" />
    );
  };

  return (
      <div className="max-w-7xl mx-auto w-full">
        <div className="bg-white rounded-xl shadow-sm border border-neutral-200 p-6">
          {/* Header */}
          <div className="mb-6">
            <h1 className="text-2xl font-bold text-neutral-900 mb-4">Client Spend</h1>
            
            {/* Tabs */}
            <div className="border-b border-neutral-200 mb-4">
              <nav className="-mb-px flex space-x-8">
                <button
                  onClick={() => setDateType('charge')}
                  className={
                    dateType === 'charge'
                      ? 'py-2 px-1 border-b-2 font-medium text-sm transition-colors border-brand-purple text-brand-purple'
                      : 'py-2 px-1 border-b-2 font-medium text-sm transition-colors border-transparent text-neutral-500 hover:text-neutral-700 hover:border-neutral-300'
                  }
                >
                  Charge Dates
                </button>
                <button
                  onClick={() => setDateType('payment')}
                  className={
                    dateType === 'payment'
                      ? 'py-2 px-1 border-b-2 font-medium text-sm transition-colors border-brand-purple text-brand-purple'
                      : 'py-2 px-1 border-b-2 font-medium text-sm transition-colors border-transparent text-neutral-500 hover:text-neutral-700 hover:border-neutral-300'
                  }
                >
                  Payment Dates
                </button>
              </nav>
            </div>

            {/* Filters */}
            <div className="flex flex-wrap items-center gap-4 mb-4">
              <div className="flex items-center gap-2">
                <label className="text-sm text-neutral-700">Client Manager:</label>
                <select
                  value={clientManagerId}
                  onChange={(e) => setClientManagerId(e.target.value)}
                  className="border border-neutral-300 rounded-md px-3 py-1.5 text-sm"
                >
                  <option value="">All</option>
                  {/* TODO: Populate from API */}
                </select>
              </div>
              <div className="flex items-center gap-2">
                <label className="text-sm text-neutral-700">Interval:</label>
                <select
                  value={interval}
                  onChange={(e) => setInterval(e.target.value)}
                  className="border border-neutral-300 rounded-md px-3 py-1.5 text-sm"
                >
                  {INTERVALS.map((int) => (
                    <option key={int.value} value={int.value}>
                      {int.label}
                    </option>
                  ))}
                </select>
              </div>
              <label className="flex items-center gap-2 text-sm text-neutral-700">
                <input
                  type="checkbox"
                  checked={showAllBranches}
                  onChange={(e) => setShowAllBranches(e.target.checked)}
                  className="rounded border-neutral-300 text-brand-purple focus:ring-brand-purple"
                />
                <span>Show all Branches:</span>
              </label>
              <div className="flex items-center gap-2">
                <label className="text-sm text-neutral-700">Branches:</label>
                <select className="border border-neutral-300 rounded-md px-3 py-1.5 text-sm">
                  <option>{companyName}</option>
                </select>
              </div>
              <div className="flex items-center gap-2">
                <input
                  type="date"
                  value={startDate}
                  onChange={(e) => setStartDate(e.target.value)}
                  className="border border-neutral-300 rounded-md px-3 py-1.5 text-sm"
                />
                <span className="text-neutral-500">-</span>
                <input
                  type="date"
                  value={endDate}
                  onChange={(e) => setEndDate(e.target.value)}
                  className="border border-neutral-300 rounded-md px-3 py-1.5 text-sm"
                />
              </div>
              <div className="ml-auto">
                <button
                  onClick={handleExportCSV}
                  className="flex items-center gap-2 px-4 py-2 text-sm font-medium text-neutral-700 bg-white border border-neutral-300 rounded-md hover:bg-neutral-50 transition-colors"
                >
                  <ArrowDownTrayIcon className="h-5 w-5" />
                  CSV Export
                </button>
              </div>
            </div>
          </div>

          {loading && (
            <div className="text-center py-12">
              <div className="inline-block animate-spin rounded-full h-8 w-8 border-b-2 border-brand-purple"></div>
              <p className="mt-2 text-neutral-500">Loading client spend...</p>
            </div>
          )}

          {error && (
            <div className="bg-red-50 border border-red-200 rounded-lg p-4 mb-6">
              <p className="text-red-800">{error}</p>
            </div>
          )}

          {!loading && !error && (
            <>
              <p className="text-sm text-neutral-600 mb-4">
                Click on a column heading to sort on it.
              </p>

              {/* Table */}
              <div className="overflow-x-auto">
                <table className="min-w-full divide-y divide-neutral-200">
                  <thead className="bg-neutral-50">
                    <tr>
                      <th
                        className="px-6 py-3 text-left text-xs font-medium text-neutral-500 uppercase tracking-wider cursor-pointer hover:bg-neutral-100"
                        onClick={() => handleSort('client_name')}
                      >
                        <div className="flex items-center">
                          Name
                          {getSortIcon('client_name')}
                        </div>
                      </th>
                      <th
                        className="px-6 py-3 text-right text-xs font-medium text-neutral-500 uppercase tracking-wider cursor-pointer hover:bg-neutral-100"
                        onClick={() => handleSort('total_spend')}
                      >
                        <div className="flex items-center justify-end">
                          Total
                          {getSortIcon('total_spend')}
                        </div>
                      </th>
                      {periods.map((period) => (
                        <th
                          key={period}
                          className="px-6 py-3 text-right text-xs font-medium text-neutral-500 uppercase tracking-wider cursor-pointer hover:bg-neutral-100"
                          onClick={() => handleSort(period)}
                        >
                          <div className="flex items-center justify-end">
                            {period}
                            {getSortIcon(period)}
                          </div>
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody className="bg-white divide-y divide-neutral-200">
                    {sortedData.map((row) => (
                      <tr key={row.client_id} className="hover:bg-neutral-50">
                        <td className="px-6 py-4 whitespace-nowrap text-sm font-medium text-neutral-900">
                          {row.client_name || 'Unknown'}
                        </td>
                        <td className="px-6 py-4 whitespace-nowrap text-sm text-right text-neutral-900">
                          {formatCurrency(row.total_spend)}
                        </td>
                        {periods.map((period) => {
                          const periodData = row.periods?.find((p) => p.period === period);
                          const amount = parseFloat(periodData?.amount || 0);
                          const hasValue = amount > 0;
                          
                          return (
                            <td
                              key={period}
                              className={`px-6 py-4 whitespace-nowrap text-sm text-right ${
                                hasValue
                                  ? 'bg-green-50 text-neutral-900'
                                  : 'bg-red-50 text-neutral-500'
                              }`}
                            >
                              {hasValue ? formatCurrency(amount) : ''}
                            </td>
                          );
                        })}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </>
          )}
        </div>
      </div>
  );
}

export default ClientSpendPage;


























