import React, { useState, useEffect } from 'react';
import { useSearchParams } from 'react-router-dom';
import { useCompanyName } from '../contexts/CompanyNameContext';
import { formatCurrency } from '../utils/formatters';
import {
  ArrowDownTrayIcon,
} from '@heroicons/react/24/outline';
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
  ResponsiveContainer,
} from 'recharts';

const INTERVALS = [
  { value: 'month', label: 'Month' },
  { value: 'week', label: 'Week' },
  { value: 'day', label: 'Day' },
];

function IncomeOverTimePage() {
  const [searchParams, setSearchParams] = useSearchParams();
  const { companyName } = useCompanyName();
  const [dateType, setDateType] = useState(
    searchParams.get('dateType') || 'activity'
  );
  const [interval, setInterval] = useState(
    searchParams.get('interval') || 'month'
  );
  const [startDate, setStartDate] = useState(
    searchParams.get('startDate') ||
    new Date(Date.now() - 365 * 24 * 60 * 60 * 1000).toISOString().split('T')[0]
  );
  const [endDate, setEndDate] = useState(
    searchParams.get('endDate') ||
    new Date().toISOString().split('T')[0]
  );
  const [clientManagerId, setClientManagerId] = useState(
    searchParams.get('clientManagerId') || ''
  );
  const [showAllBranches, setShowAllBranches] = useState(false);
  const [data, setData] = useState([]);
  const [totals, setTotals] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);

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

      const response = await fetch(`/api/income-over-time?${params}`, {
        credentials: 'include',
      });

      if (!response.ok) {
        throw new Error('Failed to fetch income over time');
      }

      const result = await response.json();
      setData(result.data || []);
      setTotals(result.totals || null);

      // Update URL params
      const newParams = new URLSearchParams(searchParams);
      newParams.set('dateType', dateType);
      newParams.set('interval', interval);
      newParams.set('startDate', startDate);
      newParams.set('endDate', endDate);
      if (clientManagerId) {
        newParams.set('clientManagerId', clientManagerId);
      }
      setSearchParams(newParams, { replace: true });
    } catch (err) {
      console.error('Error fetching income over time:', err);
      setError(err.message);
      setData([]);
      setTotals(null);
    } finally {
      setLoading(false);
    }
  };

  const handleExportCSV = () => {
    if (!data.length) return;

    const periodLabel = dateType === 'activity' ? 'Charge' : 'Invoice';
    const headers = [
      periodLabel,
      'Gross Income',
      'Tutor Income',
      'Affiliate Commission',
      'Branch Tax',
      'Branch Net',
    ];

    const rows = data.map((row) => [
      row.periodLabel || 'N/A',
      parseFloat(row.gross_income || 0).toFixed(2),
      parseFloat(row.tutor_income || 0).toFixed(2),
      parseFloat(row.affiliate_commission || 0).toFixed(2),
      parseFloat(row.branch_tax || 0).toFixed(2),
      parseFloat(row.branch_net || 0).toFixed(2),
    ]);

    if (totals) {
      rows.push([
        `${periodLabel} sum`,
        parseFloat(totals.gross_income || 0).toFixed(2),
        parseFloat(totals.tutor_income || 0).toFixed(2),
        parseFloat(totals.affiliate_commission || 0).toFixed(2),
        parseFloat(totals.branch_tax || 0).toFixed(2),
        parseFloat(totals.branch_net || 0).toFixed(2),
      ]);
    }

    const csvContent = [
      headers.join(','),
      ...rows.map((row) => row.join(',')),
    ].join('\n');

    const blob = new Blob([csvContent], { type: 'text/csv' });
    const url = window.URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `income-over-time-${dateType}-${interval}-${startDate}-to-${endDate}.csv`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    window.URL.revokeObjectURL(url);
  };


  // Prepare chart data
  const chartData = data.map((row) => ({
    name: row.periodLabel || 'N/A',
    'Gross Income': parseFloat(row.gross_income || 0),
    'Tutor Income': parseFloat(row.tutor_income || 0),
    'Affiliate Commission': parseFloat(row.affiliate_commission || 0),
    'Branch Tax': parseFloat(row.branch_tax || 0),
    'Branch Net': parseFloat(row.branch_net || 0),
  }));

  return (
      <div className="max-w-7xl mx-auto w-full">
        <div className="bg-white rounded-xl shadow-sm border border-neutral-200 p-6">
          {/* Header */}
          <div className="flex items-center justify-between mb-6">
            <h1 className="text-2xl font-bold text-neutral-900">Income Over Time</h1>
            <div className="flex items-center gap-4">
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
            </div>
          </div>

          {/* Tabs and Filters */}
          <div className="mb-6">
            <div className="border-b border-neutral-200 mb-4">
              <nav className="-mb-px flex space-x-8">
                <button
                  onClick={() => setDateType('activity')}
                  className={
                    dateType === 'activity'
                      ? 'py-2 px-1 border-b-2 font-medium text-sm transition-colors border-brand-purple text-brand-purple'
                      : 'py-2 px-1 border-b-2 font-medium text-sm transition-colors border-transparent text-neutral-500 hover:text-neutral-700 hover:border-neutral-300'
                  }
                >
                  Activity Dates
                </button>
                <button
                  onClick={() => setDateType('invoice')}
                  className={
                    dateType === 'invoice'
                      ? 'py-2 px-1 border-b-2 font-medium text-sm transition-colors border-brand-purple text-brand-purple'
                      : 'py-2 px-1 border-b-2 font-medium text-sm transition-colors border-transparent text-neutral-500 hover:text-neutral-700 hover:border-neutral-300'
                  }
                >
                  Invoice Dates
                </button>
              </nav>
            </div>

            <div className="flex items-center gap-4">
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
            </div>
          </div>

          {loading && (
            <div className="text-center py-12">
              <div className="inline-block animate-spin rounded-full h-8 w-8 border-b-2 border-brand-purple"></div>
              <p className="mt-2 text-neutral-500">Loading income over time...</p>
            </div>
          )}

          {error && (
            <div className="bg-red-50 border border-red-200 rounded-lg p-4 mb-6">
              <p className="text-red-800">{error}</p>
            </div>
          )}

          {!loading && !error && (
            <>
              {/* Chart */}
              <div className="mb-8">
                <h2 className="text-lg font-semibold text-neutral-900 mb-4">Income Over Time</h2>
                <ResponsiveContainer width="100%" height={400}>
                  <BarChart data={chartData} margin={{ top: 20, right: 30, left: 20, bottom: 60 }}>
                    <CartesianGrid strokeDasharray="3 3" />
                    <XAxis 
                      dataKey="name" 
                      angle={-45}
                      textAnchor="end"
                      height={100}
                      interval={interval === 'month' ? 0 : 'preserveStartEnd'}
                    />
                    <YAxis />
                    <Tooltip 
                      formatter={(value) => formatCurrency(value)}
                      contentStyle={{ backgroundColor: 'white', border: '1px solid #e5e7eb', borderRadius: '6px' }}
                    />
                    <Legend />
                    <Bar dataKey="Gross Income" fill="#3b82f6" stackId="a" />
                    <Bar dataKey="Tutor Income" fill="#10b981" stackId="a" />
                    <Bar dataKey="Affiliate Commission" fill="#f59e0b" />
                    <Bar dataKey="Branch Tax" fill="#ef4444" />
                    <Bar dataKey="Branch Net" fill="#8b5cf6" />
                  </BarChart>
                </ResponsiveContainer>
              </div>

              {/* Info Note */}
              <div className="mb-6 text-sm text-neutral-600">
                {dateType === 'activity' ? (
                  <p>
                    Please note that you may need to regenerate accounting data to update this page. 
                    All figures are based on the dates Lesson and Ad Hoc Charges occurred.
                  </p>
                ) : (
                  <p>
                    Please note that you may need to generate invoices to update this page. 
                    It can take up to 5 minutes to update. All figures are based on Invoices, 
                    dates refer to the invoice's "date sent", it is assumed draft invoices will be sent today.
                  </p>
                )}
              </div>

              {/* Table */}
              <div className="mb-4 flex justify-end">
                <button
                  onClick={handleExportCSV}
                  className="flex items-center gap-2 px-4 py-2 text-sm font-medium text-neutral-700 bg-white border border-neutral-300 rounded-md hover:bg-neutral-50 transition-colors"
                >
                  <ArrowDownTrayIcon className="h-5 w-5" />
                  CSV Export
                </button>
              </div>

              <div className="overflow-x-auto">
                <table className="min-w-full divide-y divide-neutral-200">
                  <thead className="bg-neutral-50">
                    <tr>
                      <th className="px-6 py-3 text-left text-xs font-medium text-neutral-500 uppercase tracking-wider">
                        {dateType === 'activity' ? 'Charge' : 'Invoice'}
                      </th>
                      <th className="px-6 py-3 text-right text-xs font-medium text-neutral-500 uppercase tracking-wider">
                        Gross Income
                      </th>
                      <th className="px-6 py-3 text-right text-xs font-medium text-neutral-500 uppercase tracking-wider">
                        Tutor Income
                      </th>
                      <th className="px-6 py-3 text-right text-xs font-medium text-neutral-500 uppercase tracking-wider">
                        Affiliate Commission
                      </th>
                      <th className="px-6 py-3 text-right text-xs font-medium text-neutral-500 uppercase tracking-wider">
                        Branch Tax
                      </th>
                      <th className="px-6 py-3 text-right text-xs font-medium text-neutral-500 uppercase tracking-wider">
                        Branch Net
                      </th>
                    </tr>
                  </thead>
                  <tbody className="bg-white divide-y divide-neutral-200">
                    {data.map((row, index) => (
                      <tr key={index} className="hover:bg-neutral-50">
                        <td className="px-6 py-4 whitespace-nowrap text-sm font-medium text-neutral-900">
                          {row.periodLabel || 'N/A'}
                        </td>
                        <td className="px-6 py-4 whitespace-nowrap text-sm text-right text-neutral-900">
                          {formatCurrency(row.gross_income)}
                        </td>
                        <td className="px-6 py-4 whitespace-nowrap text-sm text-right text-neutral-900">
                          {formatCurrency(row.tutor_income)}
                        </td>
                        <td className="px-6 py-4 whitespace-nowrap text-sm text-right text-neutral-900">
                          {formatCurrency(row.affiliate_commission)}
                        </td>
                        <td className="px-6 py-4 whitespace-nowrap text-sm text-right text-neutral-900">
                          {formatCurrency(row.branch_tax)}
                        </td>
                        <td className="px-6 py-4 whitespace-nowrap text-sm text-right text-neutral-900">
                          {formatCurrency(row.branch_net)}
                        </td>
                      </tr>
                    ))}
                    {totals && (
                      <tr className="bg-neutral-50 font-semibold">
                        <td className="px-6 py-4 whitespace-nowrap text-sm font-medium text-neutral-900">
                          {dateType === 'activity' ? 'Charge' : 'Invoice'} sum
                        </td>
                        <td className="px-6 py-4 whitespace-nowrap text-sm text-right text-neutral-900">
                          {formatCurrency(totals.gross_income)}
                        </td>
                        <td className="px-6 py-4 whitespace-nowrap text-sm text-right text-neutral-900">
                          {formatCurrency(totals.tutor_income)}
                        </td>
                        <td className="px-6 py-4 whitespace-nowrap text-sm text-right text-neutral-900">
                          {formatCurrency(totals.affiliate_commission)}
                        </td>
                        <td className="px-6 py-4 whitespace-nowrap text-sm text-right text-neutral-900">
                          {formatCurrency(totals.branch_tax)}
                        </td>
                        <td className="px-6 py-4 whitespace-nowrap text-sm text-right text-neutral-900">
                          {formatCurrency(totals.branch_net)}
                        </td>
                      </tr>
                    )}
                  </tbody>
                </table>
              </div>
            </>
          )}
        </div>
      </div>
  );
}

export default IncomeOverTimePage;

