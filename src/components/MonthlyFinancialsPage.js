import React, { useState, useEffect } from 'react';
import { useSearchParams } from 'react-router-dom';
import { useToast } from '../hooks/useToast';
import { formatCurrency } from '../utils/formatters';
import {
  ArrowDownTrayIcon,
  CheckCircleIcon,
  ExclamationTriangleIcon,
  ChevronDownIcon,
  ChevronRightIcon,
  CurrencyDollarIcon,
  ArrowTrendingUpIcon,
  ChartPieIcon,
  BuildingOfficeIcon,
  MapPinIcon,
} from '@heroicons/react/24/outline';

const MONTHS = [
  { value: 1, label: 'January' },
  { value: 2, label: 'February' },
  { value: 3, label: 'March' },
  { value: 4, label: 'April' },
  { value: 5, label: 'May' },
  { value: 6, label: 'June' },
  { value: 7, label: 'July' },
  { value: 8, label: 'August' },
  { value: 9, label: 'September' },
  { value: 10, label: 'October' },
  { value: 11, label: 'November' },
  { value: 12, label: 'December' },
];

// Categories to display (no longer includes 'other' - distributed proportionally)
const CATEGORIES = ['home', 'online', 'retail', 'schools'];

const CATEGORY_LABELS = {
  home: 'In-Home',
  online: 'Online',
  retail: 'Retail (Clubs)',
  schools: 'Schools',
};

const CATEGORY_COLORS = {
  home: 'bg-purple-100 text-purple-800',
  online: 'bg-green-100 text-green-800',
  retail: 'bg-blue-100 text-blue-800',
  schools: 'bg-orange-100 text-orange-800',
};

const CATEGORY_BAR_COLORS = {
  home: 'bg-purple-500',
  online: 'bg-green-500',
  retail: 'bg-blue-500',
  schools: 'bg-orange-500',
};

function MonthlyFinancialsPage() {
  const toast = useToast();
  const [searchParams, setSearchParams] = useSearchParams();
  const currentDate = new Date();
  const [activeTab, setActiveTab] = useState(searchParams.get('tab') || 'main');
  const [year, setYear] = useState(
    parseInt(searchParams.get('year')) || currentDate.getFullYear()
  );
  const [month, setMonth] = useState(
    parseInt(searchParams.get('month')) || currentDate.getMonth() + 1
  );
  const [data, setData] = useState(null);
  const [franchiseeData, setFranchiseeData] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [showOtherBreakdown, setShowOtherBreakdown] = useState(false);

  useEffect(() => {
    if (activeTab === 'main') {
      fetchMainData();
    } else {
      fetchFranchiseeData();
    }
  }, [year, month, activeTab]);

  const fetchMainData = async () => {
    setLoading(true);
    setError(null);
    try {
      const params = new URLSearchParams({ year: year.toString(), month: month.toString() });
      const response = await fetch(`/api/monthly-financials?${params}`, {
        credentials: 'include',
      });

      if (!response.ok) {
        throw new Error('Failed to fetch monthly financials');
      }

      const result = await response.json();
      setData(result);
      updateUrlParams();
    } catch (err) {
      console.error('Error fetching monthly financials:', err);
      setError(err.message);
      setData(null);
    } finally {
      setLoading(false);
    }
  };

  const fetchFranchiseeData = async () => {
    setLoading(true);
    setError(null);
    try {
      const params = new URLSearchParams({ year: year.toString(), month: month.toString() });
      const response = await fetch(`/api/monthly-financials/franchisee?${params}`, {
        credentials: 'include',
      });

      if (!response.ok) {
        if (response.status === 403) {
          throw new Error('Franchisee data is only available from the main branch');
        }
        throw new Error('Failed to fetch franchisee financials');
      }

      const result = await response.json();
      setFranchiseeData(result);
      updateUrlParams();
    } catch (err) {
      console.error('Error fetching franchisee financials:', err);
      setError(err.message);
      setFranchiseeData(null);
    } finally {
      setLoading(false);
    }
  };

  const updateUrlParams = () => {
    const newParams = new URLSearchParams(searchParams);
    newParams.set('year', year.toString());
    newParams.set('month', month.toString());
    newParams.set('tab', activeTab);
    setSearchParams(newParams, { replace: true });
  };

  const handleExportCSV = async () => {
    try {
      const endpoint = activeTab === 'main'
        ? `/api/monthly-financials/export`
        : `/api/monthly-financials/franchisee/export`;
      const params = new URLSearchParams({ year: year.toString(), month: month.toString() });
      const response = await fetch(`${endpoint}?${params}`, {
        credentials: 'include',
      });

      if (!response.ok) {
        throw new Error('Failed to export');
      }

      const blob = await response.blob();
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      const prefix = activeTab === 'main' ? 'monthly-financials' : 'franchisee-financials';
      a.download = `${prefix}-${year}-${String(month).padStart(2, '0')}.csv`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      window.URL.revokeObjectURL(url);
    } catch (err) {
      console.error('Error exporting CSV:', err);
      toast.error('Failed to export CSV');
    }
  };

  const handleTabChange = (tab) => {
    setActiveTab(tab);
    setError(null);
  };


  const formatPercent = (value) => {
    return `${(value || 0).toFixed(1)}%`;
  };

  const years = [];
  for (let y = currentDate.getFullYear(); y >= 2020; y--) {
    years.push(y);
  }

  const getMargin = (revenue, cogs) => {
    if (!revenue || revenue === 0) return 0;
    return ((revenue - cogs) / revenue) * 100;
  };

  return (
    <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-6 space-y-6">
      {/* Header Card */}
      <div className="bg-white rounded-xl shadow-sm border border-neutral-200 p-6">
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
          <div>
            <h1 className="text-2xl font-bold text-neutral-900">Monthly Financial Report</h1>
            <p className="text-sm text-neutral-500 mt-1">
              Revenue, COGS, and profitability analysis
            </p>
          </div>
          <div className="flex flex-wrap items-center gap-3">
            <select
              value={month}
              onChange={(e) => setMonth(parseInt(e.target.value))}
              className="border border-neutral-300 rounded-lg px-3 py-2 text-sm focus:ring-brand-purple focus:border-brand-purple"
            >
              {MONTHS.map((m) => (
                <option key={m.value} value={m.value}>
                  {m.label}
                </option>
              ))}
            </select>
            <select
              value={year}
              onChange={(e) => setYear(parseInt(e.target.value))}
              className="border border-neutral-300 rounded-lg px-3 py-2 text-sm focus:ring-brand-purple focus:border-brand-purple"
            >
              {years.map((y) => (
                <option key={y} value={y}>
                  {y}
                </option>
              ))}
            </select>
            <button
              onClick={handleExportCSV}
              disabled={loading || (activeTab === 'main' ? !data : !franchiseeData)}
              className="flex items-center gap-2 px-4 py-2 bg-brand-purple text-white rounded-lg hover:bg-brand-navy transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
            >
              <ArrowDownTrayIcon className="h-4 w-4" />
              <span>Export CSV</span>
            </button>
          </div>
        </div>

        {/* Tabs */}
        <div className="mt-6 border-b border-neutral-200">
          <nav className="-mb-px flex space-x-8">
            <button
              onClick={() => handleTabChange('main')}
              className={`flex items-center gap-2 py-3 px-1 border-b-2 font-medium text-sm transition-colors ${
                activeTab === 'main'
                  ? 'border-brand-purple text-brand-purple'
                  : 'border-transparent text-neutral-500 hover:text-neutral-700 hover:border-neutral-300'
              }`}
            >
              <BuildingOfficeIcon className="h-5 w-5" />
              Main Business
            </button>
            <button
              onClick={() => handleTabChange('franchisee')}
              className={`flex items-center gap-2 py-3 px-1 border-b-2 font-medium text-sm transition-colors ${
                activeTab === 'franchisee'
                  ? 'border-brand-purple text-brand-purple'
                  : 'border-transparent text-neutral-500 hover:text-neutral-700 hover:border-neutral-300'
              }`}
            >
              <MapPinIcon className="h-5 w-5" />
              Franchisees
            </button>
          </nav>
        </div>
      </div>

      {/* Loading State */}
      {loading && (
        <div className="bg-white rounded-xl shadow-sm border border-neutral-200 p-12 text-center">
          <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-brand-purple mx-auto" />
          <p className="mt-4 text-neutral-500">Loading financial data...</p>
        </div>
      )}

      {/* Error State */}
      {error && (
        <div className="bg-red-50 rounded-xl border border-red-200 p-6">
          <div className="flex items-center gap-3">
            <ExclamationTriangleIcon className="h-6 w-6 text-red-500" />
            <p className="text-red-700">{error}</p>
          </div>
        </div>
      )}

      {/* Main Business Tab Content */}
      {!loading && activeTab === 'main' && data && (
        <MainBusinessContent
          data={data}
          formatCurrency={formatCurrency}
          formatPercent={formatPercent}
          getMargin={getMargin}
          showOtherBreakdown={showOtherBreakdown}
          setShowOtherBreakdown={setShowOtherBreakdown}
        />
      )}

      {/* Franchisee Tab Content */}
      {!loading && activeTab === 'franchisee' && franchiseeData && (
        <FranchiseeContent
          data={franchiseeData}
          formatCurrency={formatCurrency}
          formatPercent={formatPercent}
        />
      )}
    </div>
  );
}

// Main Business Content Component
function MainBusinessContent({ data, formatCurrency, formatPercent, getMargin, showOtherBreakdown, setShowOtherBreakdown }) {
  return (
    <>
      {/* Summary Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <div className="bg-white rounded-xl shadow-sm border border-neutral-200 p-5">
          <div className="flex items-center gap-3">
            <div className="p-2 bg-green-100 rounded-lg">
              <CurrencyDollarIcon className="h-5 w-5 text-green-600" />
            </div>
            <div>
              <p className="text-sm text-neutral-500">Total Revenue</p>
              <p className="text-xl font-bold text-neutral-900">
                {formatCurrency(data.revenueByCategory?.total)}
              </p>
            </div>
          </div>
        </div>
        <div className="bg-white rounded-xl shadow-sm border border-neutral-200 p-5">
          <div className="flex items-center gap-3">
            <div className="p-2 bg-red-100 rounded-lg">
              <CurrencyDollarIcon className="h-5 w-5 text-red-600" />
            </div>
            <div>
              <p className="text-sm text-neutral-500">Total COGS</p>
              <p className="text-xl font-bold text-neutral-900">
                {formatCurrency(data.cogsByCategory?.total)}
              </p>
            </div>
          </div>
        </div>
        <div className="bg-white rounded-xl shadow-sm border border-neutral-200 p-5">
          <div className="flex items-center gap-3">
            <div className="p-2 bg-brand-purple/10 rounded-lg">
              <ArrowTrendingUpIcon className="h-5 w-5 text-brand-purple" />
            </div>
            <div>
              <p className="text-sm text-neutral-500">Gross Profit</p>
              <p className="text-xl font-bold text-neutral-900">
                {formatCurrency(data.grossProfitByCategory?.total)}
              </p>
            </div>
          </div>
        </div>
        <div className="bg-white rounded-xl shadow-sm border border-neutral-200 p-5">
          <div className="flex items-center gap-3">
            <div className="p-2 bg-blue-100 rounded-lg">
              <ChartPieIcon className="h-5 w-5 text-blue-600" />
            </div>
            <div>
              <p className="text-sm text-neutral-500">Gross Margin</p>
              <p className="text-xl font-bold text-neutral-900">
                {formatPercent(getMargin(data.revenueByCategory?.total, data.cogsByCategory?.total))}
              </p>
            </div>
          </div>
        </div>
      </div>

      {/* Reconciliation Status */}
      <div
        className={`rounded-xl border p-4 ${
          data.reconciliation?.isReconciled
            ? 'bg-green-50 border-green-200'
            : 'bg-yellow-50 border-yellow-200'
        }`}
      >
        <div className="flex items-center gap-3">
          {data.reconciliation?.isReconciled ? (
            <CheckCircleIcon className="h-6 w-6 text-green-500" />
          ) : (
            <ExclamationTriangleIcon className="h-6 w-6 text-yellow-500" />
          )}
          <div>
            <p
              className={`font-medium ${
                data.reconciliation?.isReconciled ? 'text-green-800' : 'text-yellow-800'
              }`}
            >
              {data.reconciliation?.message}
            </p>
            {!data.reconciliation?.isReconciled && (
              <p className="text-sm text-yellow-700 mt-1">
                Discrepancy: {formatCurrency(data.reconciliation?.discrepancy)}
              </p>
            )}
          </div>
        </div>
      </div>

      {/* Revenue by Category */}
      <div className="bg-white rounded-xl shadow-sm border border-neutral-200 p-6">
        <h2 className="text-lg font-semibold text-neutral-900 mb-4">Revenue by Category</h2>
        <div className="space-y-4">
          {CATEGORIES.map((category) => {
            const revenue = data.revenueByCategory?.[category] || 0;
            const percent = data.percentOfTotal?.[category] || 0;
            return (
              <div key={category}>
                <div className="flex justify-between items-center mb-1">
                  <div className="flex items-center gap-2">
                    <span
                      className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium ${CATEGORY_COLORS[category]}`}
                    >
                      {CATEGORY_LABELS[category]}
                    </span>
                    <span className="text-sm text-neutral-500">({formatPercent(percent)})</span>
                  </div>
                  <span className="font-semibold text-neutral-900">{formatCurrency(revenue)}</span>
                </div>
                <div className="w-full bg-neutral-100 rounded-full h-2">
                  <div
                    className={`h-2 rounded-full ${CATEGORY_BAR_COLORS[category]}`}
                    style={{ width: `${Math.min(percent, 100)}%` }}
                  />
                </div>
              </div>
            );
          })}
          <div className="flex justify-between items-center pt-3 border-t border-neutral-200 mt-4">
            <span className="font-bold text-neutral-900">Total Revenue</span>
            <span className="font-bold text-brand-purple text-lg">
              {formatCurrency(data.revenueByCategory?.total)}
            </span>
          </div>
        </div>
      </div>

      {/* Three-Column Layout for COGS and Profit */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* COGS by Pay Type */}
        <div className="bg-white rounded-xl shadow-sm border border-neutral-200 p-6">
          <h2 className="text-lg font-semibold text-neutral-900 mb-4">COGS by Pay Type</h2>
          <div className="space-y-3">
            <div className="flex justify-between items-center py-3 border-b border-neutral-100">
              <div className="flex items-center gap-2">
                <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-green-100 text-green-800">
                  1099
                </span>
                <span className="text-neutral-700">Independent Contractors</span>
              </div>
              <span className="font-semibold text-neutral-900">
                {formatCurrency(data.cogsByPayType?.['1099'])}
              </span>
            </div>
            <div className="flex justify-between items-center py-3 border-b border-neutral-100">
              <div className="flex items-center gap-2">
                <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-blue-100 text-blue-800">
                  W-2
                </span>
                <span className="text-neutral-700">Employees</span>
              </div>
              <span className="font-semibold text-neutral-900">
                {formatCurrency(data.cogsByPayType?.['W-2'])}
              </span>
            </div>
            <div className="flex justify-between items-center py-3 bg-neutral-50 rounded-lg px-3 -mx-3">
              <span className="font-bold text-neutral-900">Total</span>
              <span className="font-bold text-brand-purple text-lg">
                {formatCurrency(data.cogsByPayType?.total)}
              </span>
            </div>
          </div>
        </div>

        {/* COGS by Category */}
        <div className="bg-white rounded-xl shadow-sm border border-neutral-200 p-6">
          <h2 className="text-lg font-semibold text-neutral-900 mb-4">COGS by Category</h2>
          <div className="space-y-3">
            {CATEGORIES.map((category) => (
              <div
                key={category}
                className="flex justify-between items-center py-3 border-b border-neutral-100"
              >
                <div className="flex items-center gap-2">
                  <span
                    className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium ${CATEGORY_COLORS[category]}`}
                  >
                    {CATEGORY_LABELS[category]}
                  </span>
                </div>
                <span className="font-semibold text-neutral-900">
                  {formatCurrency(data.cogsByCategory?.[category])}
                </span>
              </div>
            ))}
            <div className="flex justify-between items-center py-3 bg-neutral-50 rounded-lg px-3 -mx-3">
              <span className="font-bold text-neutral-900">Total</span>
              <span className="font-bold text-brand-purple text-lg">
                {formatCurrency(data.cogsByCategory?.total)}
              </span>
            </div>
          </div>
        </div>

        {/* Gross Profit by Category */}
        <div className="bg-white rounded-xl shadow-sm border border-neutral-200 p-6">
          <h2 className="text-lg font-semibold text-neutral-900 mb-4">Gross Profit by Category</h2>
          <div className="space-y-3">
            {CATEGORIES.map((category) => {
              const profit = data.grossProfitByCategory?.[category] || 0;
              const revenue = data.revenueByCategory?.[category] || 0;
              const margin = getMargin(revenue, data.cogsByCategory?.[category]);
              return (
                <div
                  key={category}
                  className="flex justify-between items-center py-3 border-b border-neutral-100"
                >
                  <div className="flex items-center gap-2">
                    <span
                      className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium ${CATEGORY_COLORS[category]}`}
                    >
                      {CATEGORY_LABELS[category]}
                    </span>
                    <span className="text-xs text-neutral-400">({formatPercent(margin)})</span>
                  </div>
                  <span
                    className={`font-semibold ${profit >= 0 ? 'text-green-700' : 'text-red-700'}`}
                  >
                    {formatCurrency(profit)}
                  </span>
                </div>
              );
            })}
            <div className="flex justify-between items-center py-3 bg-neutral-50 rounded-lg px-3 -mx-3">
              <div>
                <span className="font-bold text-neutral-900">Total</span>
                <span className="text-xs text-neutral-500 ml-2">
                  ({formatPercent(getMargin(data.revenueByCategory?.total, data.cogsByCategory?.total))} margin)
                </span>
              </div>
              <span
                className={`font-bold text-lg ${
                  (data.grossProfitByCategory?.total || 0) >= 0
                    ? 'text-green-700'
                    : 'text-red-700'
                }`}
              >
                {formatCurrency(data.grossProfitByCategory?.total)}
              </span>
            </div>
          </div>
        </div>
      </div>

      {/* Uncategorized Items (Distributed Proportionally) */}
      {data.otherBreakdown && data.otherBreakdown.length > 0 && (
        <div className="bg-white rounded-xl shadow-sm border border-neutral-200">
          <button
            onClick={() => setShowOtherBreakdown(!showOtherBreakdown)}
            className="w-full flex items-center justify-between p-6 text-left hover:bg-neutral-50 transition-colors rounded-xl"
          >
            <div>
              <h2 className="text-lg font-semibold text-neutral-900">
                Uncategorized Items
              </h2>
              <p className="text-sm text-neutral-500 mt-1">
                {data.otherBreakdown.length} item(s) distributed proportionally across categories
              </p>
            </div>
            {showOtherBreakdown ? (
              <ChevronDownIcon className="h-5 w-5 text-neutral-400" />
            ) : (
              <ChevronRightIcon className="h-5 w-5 text-neutral-400" />
            )}
          </button>

          {showOtherBreakdown && (
            <div className="border-t border-neutral-200">
              <div className="overflow-x-auto">
                <table className="min-w-full divide-y divide-neutral-200">
                  <thead className="bg-neutral-50">
                    <tr>
                      <th className="px-6 py-3 text-left text-xs font-medium text-neutral-500 uppercase tracking-wider">
                        Category
                      </th>
                      <th className="px-6 py-3 text-left text-xs font-medium text-neutral-500 uppercase tracking-wider">
                        Description
                      </th>
                      <th className="px-6 py-3 text-left text-xs font-medium text-neutral-500 uppercase tracking-wider">
                        Contractor
                      </th>
                      <th className="px-6 py-3 text-left text-xs font-medium text-neutral-500 uppercase tracking-wider">
                        Date
                      </th>
                      <th className="px-6 py-3 text-right text-xs font-medium text-neutral-500 uppercase tracking-wider">
                        Amount
                      </th>
                    </tr>
                  </thead>
                  <tbody className="bg-white divide-y divide-neutral-200">
                    {data.otherBreakdown.map((item, idx) => (
                      <tr key={idx} className="hover:bg-neutral-50">
                        <td className="px-6 py-4 whitespace-nowrap text-sm text-neutral-900">
                          {item.categoryName || '-'}
                        </td>
                        <td className="px-6 py-4 text-sm text-neutral-700 max-w-xs truncate">
                          {item.description || '-'}
                        </td>
                        <td className="px-6 py-4 whitespace-nowrap text-sm text-neutral-700">
                          {item.contractorName || '-'}
                        </td>
                        <td className="px-6 py-4 whitespace-nowrap text-sm text-neutral-500">
                          {item.dateOccurred
                            ? new Date(item.dateOccurred).toLocaleDateString()
                            : '-'}
                        </td>
                        <td className="px-6 py-4 whitespace-nowrap text-sm text-neutral-900 text-right font-medium">
                          {formatCurrency(item.amount)}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}
        </div>
      )}

      {/* Ad Hoc Summary */}
      {data.adhocSummary && data.adhocSummary.length > 0 && (
        <div className="bg-white rounded-xl shadow-sm border border-neutral-200 p-6">
          <h2 className="text-lg font-semibold text-neutral-900 mb-4">
            Ad Hoc Charges by Service Category
          </h2>
          <p className="text-sm text-neutral-500 mb-4">
            Summary of how ad hoc charges are categorized for COGS reporting
          </p>
          <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-4">
            {data.adhocSummary
              .filter((item) => CATEGORIES.includes(item.category))
              .map((item) => (
              <div
                key={item.category}
                className="bg-neutral-50 rounded-lg p-4 text-center"
              >
                <span
                  className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium ${
                    CATEGORY_COLORS[item.category]
                  }`}
                >
                  {CATEGORY_LABELS[item.category]}
                </span>
                <p className="mt-2 text-2xl font-bold text-neutral-900">{item.count}</p>
                <p className="text-sm text-neutral-500">charges</p>
                <p className="mt-1 font-semibold text-neutral-700">
                  {formatCurrency(item.total)}
                </p>
              </div>
            ))}
          </div>
        </div>
      )}
    </>
  );
}

// Franchisee Content Component
function FranchiseeContent({ data, formatCurrency, formatPercent }) {
  const { combined, locations } = data;

  return (
    <>
      {/* Combined Summary Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <div className="bg-white rounded-xl shadow-sm border border-neutral-200 p-5">
          <div className="flex items-center gap-3">
            <div className="p-2 bg-green-100 rounded-lg">
              <CurrencyDollarIcon className="h-5 w-5 text-green-600" />
            </div>
            <div>
              <p className="text-sm text-neutral-500">Total Revenue</p>
              <p className="text-xl font-bold text-neutral-900">
                {formatCurrency(combined?.revenue)}
              </p>
            </div>
          </div>
        </div>
        <div className="bg-white rounded-xl shadow-sm border border-neutral-200 p-5">
          <div className="flex items-center gap-3">
            <div className="p-2 bg-red-100 rounded-lg">
              <CurrencyDollarIcon className="h-5 w-5 text-red-600" />
            </div>
            <div>
              <p className="text-sm text-neutral-500">Total COGS</p>
              <p className="text-xl font-bold text-neutral-900">
                {formatCurrency(combined?.totalCogs)}
              </p>
            </div>
          </div>
        </div>
        <div className="bg-white rounded-xl shadow-sm border border-neutral-200 p-5">
          <div className="flex items-center gap-3">
            <div className="p-2 bg-brand-purple/10 rounded-lg">
              <ArrowTrendingUpIcon className="h-5 w-5 text-brand-purple" />
            </div>
            <div>
              <p className="text-sm text-neutral-500">Gross Profit</p>
              <p className="text-xl font-bold text-neutral-900">
                {formatCurrency(combined?.grossProfit)}
              </p>
            </div>
          </div>
        </div>
        <div className="bg-white rounded-xl shadow-sm border border-neutral-200 p-5">
          <div className="flex items-center gap-3">
            <div className="p-2 bg-blue-100 rounded-lg">
              <ChartPieIcon className="h-5 w-5 text-blue-600" />
            </div>
            <div>
              <p className="text-sm text-neutral-500">Gross Margin</p>
              <p className="text-xl font-bold text-neutral-900">
                {formatPercent(combined?.grossMargin)}
              </p>
            </div>
          </div>
        </div>
      </div>

      {/* Activity Stats */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <div className="bg-white rounded-xl shadow-sm border border-neutral-200 p-5 text-center">
          <p className="text-3xl font-bold text-brand-purple">{combined?.lessons || 0}</p>
          <p className="text-sm text-neutral-500 mt-1">Total Lessons</p>
          <p className="text-xs text-neutral-400 mt-2">
            Westside: {locations?.westside?.lessons || 0} | Eastside: {locations?.eastside?.lessons || 0}
          </p>
        </div>
        <div className="bg-white rounded-xl shadow-sm border border-neutral-200 p-5 text-center">
          <p className="text-3xl font-bold text-brand-purple">{combined?.hours || 0}</p>
          <p className="text-sm text-neutral-500 mt-1">Total Hours</p>
          <p className="text-xs text-neutral-400 mt-2">
            Westside: {locations?.westside?.hours || 0} | Eastside: {locations?.eastside?.hours || 0}
          </p>
        </div>
        <div className="bg-white rounded-xl shadow-sm border border-neutral-200 p-5 text-center">
          <p className="text-3xl font-bold text-brand-purple">{combined?.students || 0}</p>
          <p className="text-sm text-neutral-500 mt-1">Total Students</p>
          <p className="text-xs text-neutral-400 mt-2">
            Westside: {locations?.westside?.students || 0} | Eastside: {locations?.eastside?.students || 0}
          </p>
        </div>
      </div>

      {/* Combined Financials Detail */}
      <div className="bg-white rounded-xl shadow-sm border border-neutral-200 p-6">
        <h2 className="text-lg font-semibold text-neutral-900 mb-4">Combined Financial Summary</h2>
        <div className="space-y-3">
          <div className="flex justify-between items-center py-3 border-b border-neutral-100">
            <span className="text-neutral-700">Revenue</span>
            <span className="font-semibold text-neutral-900">{formatCurrency(combined?.revenue)}</span>
          </div>
          <div className="flex justify-between items-center py-3 border-b border-neutral-100">
            <span className="text-neutral-700">Tutor Pay</span>
            <span className="font-semibold text-neutral-900">{formatCurrency(combined?.tutorPay)}</span>
          </div>
          <div className="flex justify-between items-center py-3 border-b border-neutral-100">
            <span className="text-neutral-700">Ad Hoc Pay</span>
            <span className="font-semibold text-neutral-900">{formatCurrency(combined?.adhocPay)}</span>
          </div>
          <div className="flex justify-between items-center py-3 border-b border-neutral-100">
            <span className="font-medium text-neutral-900">Total COGS</span>
            <span className="font-semibold text-red-600">{formatCurrency(combined?.totalCogs)}</span>
          </div>
          <div className="flex justify-between items-center py-3 bg-neutral-50 rounded-lg px-3 -mx-3">
            <div>
              <span className="font-bold text-neutral-900">Gross Profit</span>
              <span className="text-sm text-neutral-500 ml-2">({formatPercent(combined?.grossMargin)} margin)</span>
            </div>
            <span className={`font-bold text-lg ${(combined?.grossProfit || 0) >= 0 ? 'text-green-700' : 'text-red-700'}`}>
              {formatCurrency(combined?.grossProfit)}
            </span>
          </div>
        </div>
      </div>

      {/* Location Breakdown */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Westside */}
        <div className="bg-white rounded-xl shadow-sm border border-neutral-200 p-6">
          <div className="flex items-center gap-2 mb-4">
            <MapPinIcon className="h-5 w-5 text-brand-purple" />
            <h2 className="text-lg font-semibold text-neutral-900">Westside</h2>
          </div>
          <div className="space-y-3">
            <div className="grid grid-cols-3 gap-4 mb-4">
              <div className="text-center p-3 bg-neutral-50 rounded-lg">
                <p className="text-xl font-bold text-neutral-900">{locations?.westside?.lessons || 0}</p>
                <p className="text-xs text-neutral-500">Lessons</p>
              </div>
              <div className="text-center p-3 bg-neutral-50 rounded-lg">
                <p className="text-xl font-bold text-neutral-900">{locations?.westside?.hours || 0}</p>
                <p className="text-xs text-neutral-500">Hours</p>
              </div>
              <div className="text-center p-3 bg-neutral-50 rounded-lg">
                <p className="text-xl font-bold text-neutral-900">{locations?.westside?.students || 0}</p>
                <p className="text-xs text-neutral-500">Students</p>
              </div>
            </div>
            <div className="flex justify-between items-center py-2 border-b border-neutral-100">
              <span className="text-sm text-neutral-600">Revenue</span>
              <span className="font-medium text-neutral-900">{formatCurrency(locations?.westside?.revenue)}</span>
            </div>
            <div className="flex justify-between items-center py-2 border-b border-neutral-100">
              <span className="text-sm text-neutral-600">Tutor Pay</span>
              <span className="font-medium text-neutral-900">{formatCurrency(locations?.westside?.tutorPay)}</span>
            </div>
            <div className="flex justify-between items-center py-2 border-b border-neutral-100">
              <span className="text-sm text-neutral-600">Ad Hoc Pay</span>
              <span className="font-medium text-neutral-900">{formatCurrency(locations?.westside?.adhocPay)}</span>
            </div>
            <div className="flex justify-between items-center py-2">
              <div>
                <span className="font-medium text-neutral-900">Gross Profit</span>
                <span className="text-xs text-neutral-500 ml-2">({formatPercent(locations?.westside?.grossMargin)})</span>
              </div>
              <span className={`font-semibold ${(locations?.westside?.grossProfit || 0) >= 0 ? 'text-green-700' : 'text-red-700'}`}>
                {formatCurrency(locations?.westside?.grossProfit)}
              </span>
            </div>
          </div>
        </div>

        {/* Eastside */}
        <div className="bg-white rounded-xl shadow-sm border border-neutral-200 p-6">
          <div className="flex items-center gap-2 mb-4">
            <MapPinIcon className="h-5 w-5 text-brand-orange" />
            <h2 className="text-lg font-semibold text-neutral-900">Eastside</h2>
          </div>
          <div className="space-y-3">
            <div className="grid grid-cols-3 gap-4 mb-4">
              <div className="text-center p-3 bg-neutral-50 rounded-lg">
                <p className="text-xl font-bold text-neutral-900">{locations?.eastside?.lessons || 0}</p>
                <p className="text-xs text-neutral-500">Lessons</p>
              </div>
              <div className="text-center p-3 bg-neutral-50 rounded-lg">
                <p className="text-xl font-bold text-neutral-900">{locations?.eastside?.hours || 0}</p>
                <p className="text-xs text-neutral-500">Hours</p>
              </div>
              <div className="text-center p-3 bg-neutral-50 rounded-lg">
                <p className="text-xl font-bold text-neutral-900">{locations?.eastside?.students || 0}</p>
                <p className="text-xs text-neutral-500">Students</p>
              </div>
            </div>
            <div className="flex justify-between items-center py-2 border-b border-neutral-100">
              <span className="text-sm text-neutral-600">Revenue</span>
              <span className="font-medium text-neutral-900">{formatCurrency(locations?.eastside?.revenue)}</span>
            </div>
            <div className="flex justify-between items-center py-2 border-b border-neutral-100">
              <span className="text-sm text-neutral-600">Tutor Pay</span>
              <span className="font-medium text-neutral-900">{formatCurrency(locations?.eastside?.tutorPay)}</span>
            </div>
            <div className="flex justify-between items-center py-2 border-b border-neutral-100">
              <span className="text-sm text-neutral-600">Ad Hoc Pay</span>
              <span className="font-medium text-neutral-900">{formatCurrency(locations?.eastside?.adhocPay)}</span>
            </div>
            <div className="flex justify-between items-center py-2">
              <div>
                <span className="font-medium text-neutral-900">Gross Profit</span>
                <span className="text-xs text-neutral-500 ml-2">({formatPercent(locations?.eastside?.grossMargin)})</span>
              </div>
              <span className={`font-semibold ${(locations?.eastside?.grossProfit || 0) >= 0 ? 'text-green-700' : 'text-red-700'}`}>
                {formatCurrency(locations?.eastside?.grossProfit)}
              </span>
            </div>
          </div>
        </div>
      </div>
    </>
  );
}

export default MonthlyFinancialsPage;
