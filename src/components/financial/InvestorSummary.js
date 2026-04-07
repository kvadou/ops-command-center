import React, { useState, useEffect } from 'react';
import { DocumentArrowDownIcon } from '@heroicons/react/24/outline';
import { formatCurrency } from '../../utils/formatters';

export default function InvestorSummary() {
  const [summary, setSummary] = useState(null);
  const [loading, setLoading] = useState(true);
  const [startDate, setStartDate] = useState('');
  const [endDate, setEndDate] = useState('');

  useEffect(() => {
    // Default to last 12 months
    const end = new Date();
    const start = new Date();
    start.setMonth(start.getMonth() - 12);
    setEndDate(end.toISOString().split('T')[0]);
    setStartDate(start.toISOString().split('T')[0]);
  }, []);

  useEffect(() => {
    if (startDate && endDate) {
      fetchSummary();
    }
  }, [startDate, endDate]);

  const fetchSummary = async () => {
    try {
      setLoading(true);
      const response = await fetch(
        `/api/financial/investor-summary?startDate=${startDate}&endDate=${endDate}`
      );
      if (response.ok) {
        const data = await response.json();
        setSummary(data);
      }
    } catch (error) {
      console.error('Error fetching investor summary:', error);
    } finally {
      setLoading(false);
    }
  };

  const exportToCSV = () => {
    if (!summary) return;

    const rows = [
      ['Financial Summary', '', ''],
      ['Period', `${startDate} to ${endDate}`, ''],
      ['', '', ''],
      ['Revenue by Account', '', ''],
      ...summary.revenueByAccount.map(acc => [acc.accountName, `$${acc.revenue.toLocaleString()}`, '']),
      ['Combined Revenue', `$${summary.combinedRevenue.toLocaleString()}`, ''],
      ['', '', ''],
      ['EBITDA', `$${summary.ebitda.toLocaleString()}`, ''],
      ['EBITDA Margin', `${summary.ebitdaMargin.toFixed(2)}%`, ''],
      ['Payroll as % of Revenue', `${summary.payrollAsPercentOfRevenue.toFixed(2)}%`, ''],
      ['', '', ''],
      ['Burn Trend', '', ''],
      ['Month', 'Net Burn', 'EBITDA'],
      ...summary.burnTrend.map(b => [
        b.period_month,
        `$${b.net_burn.toLocaleString()}`,
        `$${b.ebitda_proxy.toLocaleString()}`,
      ]),
    ];

    const csv = rows.map(row => row.join(',')).join('\n');
    const blob = new Blob([csv], { type: 'text/csv' });
    const url = window.URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `financial-summary-${startDate}-to-${endDate}.csv`;
    a.click();
  };


  return (
    <div className="bg-white rounded-xl shadow-sm border border-neutral-200 p-6">
      <div className="flex items-center justify-between mb-6">
        <h2 className="text-xl font-semibold text-neutral-900">Investor-Grade Financial Summary</h2>
        <div className="flex items-center gap-3">
          <input
            type="date"
            value={startDate}
            onChange={(e) => setStartDate(e.target.value)}
            className="text-sm border border-neutral-300 rounded-md px-3 py-1.5"
          />
          <span className="text-neutral-500">to</span>
          <input
            type="date"
            value={endDate}
            onChange={(e) => setEndDate(e.target.value)}
            className="text-sm border border-neutral-300 rounded-md px-3 py-1.5"
          />
          <button
            onClick={exportToCSV}
            className="flex items-center gap-2 px-4 py-2 bg-brand-purple text-white rounded-md hover:bg-brand-navy transition-colors"
          >
            <DocumentArrowDownIcon className="h-5 w-5" />
            Export CSV
          </button>
        </div>
      </div>

      {loading ? (
        <div className="text-neutral-500">Loading summary...</div>
      ) : summary ? (
        <div className="space-y-6">
          {/* Revenue Section */}
          <div>
            <h3 className="text-lg font-semibold text-neutral-900 mb-4">Revenue</h3>
            <div className="space-y-2">
              {summary.revenueByAccount.map(acc => (
                <div key={acc.accountId} className="flex justify-between items-center py-2 border-b border-neutral-100">
                  <span className="text-neutral-700">{acc.accountName}</span>
                  <span className="font-semibold text-neutral-900">{formatCurrency(acc.revenue)}</span>
                </div>
              ))}
              <div className="flex justify-between items-center py-2 border-t-2 border-neutral-300 font-semibold">
                <span className="text-neutral-900">Combined Revenue</span>
                <span className="text-neutral-900">{formatCurrency(summary.combinedRevenue)}</span>
              </div>
            </div>
          </div>

          {/* Key Metrics */}
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <div className="bg-blue-50 rounded-lg p-4 border border-blue-200">
              <p className="text-sm text-neutral-600">EBITDA</p>
              <p className="text-2xl font-bold text-neutral-900 mt-1">
                {formatCurrency(summary.ebitda)}
              </p>
            </div>
            <div className="bg-green-50 rounded-lg p-4 border border-green-200">
              <p className="text-sm text-neutral-600">EBITDA Margin</p>
              <p className="text-2xl font-bold text-neutral-900 mt-1">
                {summary.ebitdaMargin.toFixed(1)}%
              </p>
            </div>
            <div className="bg-purple-50 rounded-lg p-4 border border-purple-200">
              <p className="text-sm text-neutral-600">Payroll as % of Revenue</p>
              <p className="text-2xl font-bold text-neutral-900 mt-1">
                {summary.payrollAsPercentOfRevenue.toFixed(1)}%
              </p>
            </div>
          </div>

          {/* Burn Trend Table */}
          <div>
            <h3 className="text-lg font-semibold text-neutral-900 mb-4">Burn Trend</h3>
            <div className="overflow-x-auto">
              <table className="min-w-full divide-y divide-neutral-200">
                <thead className="bg-neutral-50">
                  <tr>
                    <th className="px-4 py-3 text-left text-xs font-medium text-neutral-500 uppercase">Month</th>
                    <th className="px-4 py-3 text-right text-xs font-medium text-neutral-500 uppercase">Net Burn</th>
                    <th className="px-4 py-3 text-right text-xs font-medium text-neutral-500 uppercase">EBITDA</th>
                    <th className="px-4 py-3 text-right text-xs font-medium text-neutral-500 uppercase">EBITDA Margin</th>
                  </tr>
                </thead>
                <tbody className="bg-white divide-y divide-neutral-200">
                  {summary.burnTrend.map((b, i) => (
                    <tr key={i}>
                      <td className="px-4 py-3 text-sm text-neutral-900">
                        {new Date(b.period_month).toLocaleDateString('en-US', { year: 'numeric', month: 'short' })}
                      </td>
                      <td className="px-4 py-3 text-sm text-right text-neutral-900">
                        {formatCurrency(b.net_burn)}
                      </td>
                      <td className="px-4 py-3 text-sm text-right text-neutral-900">
                        {formatCurrency(b.ebitda_proxy)}
                      </td>
                      <td className="px-4 py-3 text-sm text-right text-neutral-900">
                        {b.ebitda_margin ? `${(b.ebitda_margin * 100).toFixed(1)}%` : 'N/A'}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      ) : (
        <div className="text-red-500">Error loading summary</div>
      )}
    </div>
  );
}
