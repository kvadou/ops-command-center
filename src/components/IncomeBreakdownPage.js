import React, { useState, useEffect } from 'react';
import { useSearchParams } from 'react-router-dom';
import { useCompanyName } from '../contexts/CompanyNameContext';
import { formatCurrency } from '../utils/formatters';
import {
  ChartBarIcon,
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

const BREAKDOWN_TYPES = [
  { value: 'clients', label: 'Clients' },
  { value: 'client-managers', label: 'Client Managers' },
  { value: 'ad-hoc-charge-categories', label: 'Ad Hoc Charge Categories' },
  { value: 'tutors', label: 'Tutors' },
  { value: 'subjects', label: 'Subjects' },
  { value: 'subject-categories', label: 'Subject Categories' },
  { value: 'qualification-levels', label: 'Qualification Levels' },
];

function IncomeBreakdownPage() {
  const [searchParams, setSearchParams] = useSearchParams();
  const { companyName } = useCompanyName();
  const [breakdownType, setBreakdownType] = useState(
    searchParams.get('type') || 'clients'
  );
  const [startDate, setStartDate] = useState(
    searchParams.get('startDate') ||
    new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString().split('T')[0]
  );
  const [endDate, setEndDate] = useState(
    searchParams.get('endDate') ||
    new Date().toISOString().split('T')[0]
  );
  const [showAllBranches, setShowAllBranches] = useState(false);
  const [data, setData] = useState([]);
  const [totals, setTotals] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);

  useEffect(() => {
    fetchData();
  }, [breakdownType, startDate, endDate, showAllBranches]);

  const fetchData = async () => {
    setLoading(true);
    setError(null);
    try {
      const params = new URLSearchParams({
        breakdownType,
        startDate,
        endDate,
        showAllBranches: showAllBranches.toString(),
      });

      const response = await fetch(`/api/income-breakdown?${params}`, {
        credentials: 'include',
      });

      if (!response.ok) {
        throw new Error('Failed to fetch income breakdown');
      }

      const result = await response.json();
      setData(result.data || []);
      setTotals(result.totals || null);

      // Update URL params
      const newParams = new URLSearchParams(searchParams);
      newParams.set('type', breakdownType);
      newParams.set('startDate', startDate);
      newParams.set('endDate', endDate);
      setSearchParams(newParams, { replace: true });
    } catch (err) {
      console.error('Error fetching income breakdown:', err);
      setError(err.message);
      setData([]);
      setTotals(null);
    } finally {
      setLoading(false);
    }
  };

  const handleExportCSV = () => {
    if (!data.length) return;

    const headers = [
      BREAKDOWN_TYPES.find(t => t.value === breakdownType)?.label || 'Category',
      'Gross Income',
      'Tutor Income',
      'Affiliate Commission',
      'Branch Tax',
      'Branch Net',
    ];

    const rows = data.map((row) => [
      row.category_name || 'N/A',
      parseFloat(row.gross_income || 0).toFixed(2),
      parseFloat(row.tutor_income || 0).toFixed(2),
      parseFloat(row.affiliate_commission || 0).toFixed(2),
      parseFloat(row.branch_tax || 0).toFixed(2),
      parseFloat(row.branch_net || 0).toFixed(2),
    ]);

    if (totals) {
      rows.push([
        `${BREAKDOWN_TYPES.find(t => t.value === breakdownType)?.label || 'Category'} sum`,
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
    a.download = `income-breakdown-${breakdownType}-${startDate}-to-${endDate}.csv`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    window.URL.revokeObjectURL(url);
  };


  // Prepare chart data (top 20 items)
  const chartData = data.slice(0, 20).map((row) => ({
    name: row.category_name || 'N/A',
    'Gross Income': parseFloat(row.gross_income || 0),
    'Branch Net': parseFloat(row.branch_net || 0),
  }));

  return (
      <div className="max-w-7xl mx-auto w-full">
        <div className="bg-white rounded-xl shadow-sm border border-neutral-200 p-6">
        {/* Header */}
        <div className="flex items-center justify-between mb-6">
          <h1 className="text-2xl font-bold text-neutral-900">Income Breakdown</h1>
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

          {/* Tabs */}
          <div className="border-b border-neutral-200 mb-6">
            <nav className="-mb-px flex space-x-8">
              {BREAKDOWN_TYPES.map((type) => (
                <button
                  key={type.value}
                  onClick={() => setBreakdownType(type.value)}
                  className={
                    breakdownType === type.value
                      ? 'py-2 px-1 border-b-2 font-medium text-sm transition-colors border-brand-purple text-brand-purple'
                      : 'py-2 px-1 border-b-2 font-medium text-sm transition-colors border-transparent text-neutral-500 hover:text-neutral-700 hover:border-neutral-300'
                  }
                >
                  {type.label}
                </button>
              ))}
            </nav>
          </div>

          {/* Search */}
          <div className="mb-6">
            <input
              type="text"
              placeholder="search..."
              className="w-full max-w-md border border-neutral-300 rounded-md px-4 py-2 text-sm"
            />
          </div>

          {loading && (
            <div className="text-center py-12">
              <div className="inline-block animate-spin rounded-full h-8 w-8 border-b-2 border-brand-purple"></div>
              <p className="mt-2 text-neutral-500">Loading income breakdown...</p>
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
              {chartData.length > 0 ? (
                <div className="mb-8">
                  <div className="flex items-center gap-4 mb-4">
                    <div className="flex items-center gap-2">
                      <div className="w-3 h-3 rounded-full bg-blue-500"></div>
                      <span className="text-sm text-neutral-700">Gross Income</span>
                    </div>
                    <div className="flex items-center gap-2">
                      <div className="w-3 h-3 rounded-full bg-green-500"></div>
                      <span className="text-sm text-neutral-700">Branch Net</span>
                    </div>
                  </div>
                  <ResponsiveContainer width={'100%'} height={400}>
                    <BarChart data={chartData}>
                      <CartesianGrid strokeDasharray={'3 3'} />
                      <XAxis
                        dataKey="name"
                        angle={-45}
                        textAnchor="end"
                        height={100}
                        interval={0}
                        tick={{ fontSize: 12 }}
                      />
                      <YAxis tick={{ fontSize: 12 }} />
                      <Tooltip
                        formatter={(value) => formatCurrency(value)}
                        labelStyle={{ color: '#374151' }}
                      />
                      <Legend />
                      <Bar dataKey="Gross Income" fill="#3b82f6" />
                      <Bar dataKey="Branch Net" fill="#10b981" />
                    </BarChart>
                  </ResponsiveContainer>
                </div>
              ) : (
                <div className="text-center py-12 mb-8">
                  <p className="text-xl text-neutral-500">No Data Available.</p>
                </div>
              )}

              {/* Info Note */}
              <div className="bg-neutral-50 border border-neutral-200 rounded-lg p-4 mb-6 text-sm text-neutral-600">
                <p>
                  Please note that you may need to generate invoices to update this page. 
                  It can take up to 5 minutes to update. All figures are based on Invoices, 
                  dates refer to the invoice&apos;s &quot;date sent&quot;, it is assumed draft invoices will be sent today.
                </p>
              </div>

              {/* Table */}
              <div className="relative">
                <button
                  onClick={handleExportCSV}
                  className="absolute top-0 right-0 flex items-center gap-2 px-4 py-2 bg-brand-purple text-white rounded-lg hover:bg-brand-navy transition-colors text-sm"
                >
                  <ArrowDownTrayIcon className="h-4 w-4" />
                  CSV Export
                </button>

                <div className="overflow-x-auto">
                  <table className="min-w-full divide-y divide-neutral-200">
                    <thead className="bg-neutral-50">
                      <tr>
                        <th className="px-6 py-3 text-left text-xs font-medium text-neutral-500 uppercase tracking-wider">
                          {BREAKDOWN_TYPES.find(t => t.value === breakdownType)?.label || 'Category'}
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
                      {data.length === 0 ? (
                        <tr>
                          <td colSpan={6} className="px-6 py-8 text-center text-neutral-500">
                            No data available for the selected filters.
                          </td>
                        </tr>
                      ) : (
                        <>
                          {data.map((row, idx) => (
                            <tr key={idx} className="hover:bg-neutral-50">
                              <td className="px-6 py-4 whitespace-nowrap text-sm font-medium text-neutral-900">
                                {row.category_name || 'N/A'}
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
                                {BREAKDOWN_TYPES.find(t => t.value === breakdownType)?.label || 'Category'} sum
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
                        </>
                      )}
                    </tbody>
                  </table>
                </div>
              </div>
            </>
          )}
        </div>
      </div>
  );
}

export default IncomeBreakdownPage;

