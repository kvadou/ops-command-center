import React, { useState, useEffect } from 'react';
import { useSearchParams } from 'react-router-dom';
import { useCompanyName } from '../contexts/CompanyNameContext';
import {
  IconButton,
  Tooltip,
} from '@mui/material';
import { ArrowDownTrayIcon } from '@heroicons/react/24/outline';
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip as RechartsTooltip,
  Legend,
  ResponsiveContainer,
} from 'recharts';

const TABS = [
  { value: 'tutors', label: 'Tutors' },
  { value: 'clients', label: 'Clients' },
  { value: 'students', label: 'Students' },
];

function LessonHoursPage() {
  const [searchParams, setSearchParams] = useSearchParams();
  const { companyName } = useCompanyName();
  const [tab, setTab] = useState(
    searchParams.get('tab') || 'tutors'
  );
  const [startDate, setStartDate] = useState(
    searchParams.get('startDate') ||
    new Date(Date.now() - 365 * 24 * 60 * 60 * 1000).toISOString().split('T')[0]
  );
  const [endDate, setEndDate] = useState(
    searchParams.get('endDate') ||
    new Date().toISOString().split('T')[0]
  );
  const [showAllBranches, setShowAllBranches] = useState(
    searchParams.get('showAllBranches') === 'true'
  );
  const [data, setData] = useState([]);
  const [totals, setTotals] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);

  useEffect(() => {
    fetchData();
  }, [tab, startDate, endDate, showAllBranches]);

  const fetchData = async () => {
    setLoading(true);
    setError(null);
    try {
      const params = new URLSearchParams({
        tab,
        startDate,
        endDate,
        showAllBranches: showAllBranches.toString(),
      });

      const response = await fetch(`/api/lesson-hours?${params}`, {
        credentials: 'include',
      });

      if (!response.ok) {
        throw new Error('Failed to fetch lesson hours');
      }

      const result = await response.json();
      setData(result.data || []);
      setTotals(result.totals || null);

      // Update URL params
      const newParams = new URLSearchParams(searchParams);
      newParams.set('tab', tab);
      newParams.set('startDate', startDate);
      newParams.set('endDate', endDate);
      newParams.set('showAllBranches', showAllBranches.toString());
      setSearchParams(newParams, { replace: true });
    } catch (err) {
      console.error('Error fetching lesson hours:', err);
      setError(err.message);
      setData([]);
      setTotals(null);
    } finally {
      setLoading(false);
    }
  };

  const handleExportCSV = () => {
    if (!data.length) return;

    const tabLabel = TABS.find(t => t.value === tab)?.label || tab;
    const headers = [
      tabLabel,
      'Lesson Hours',
      'Lesson Count',
    ];

    const rows = data.map((row) => [
      row.name || 'Unknown',
      row.lesson_hours_formatted || '0:00',
      row.lesson_count || 0,
    ]);

    if (totals) {
      rows.unshift([
        'Total',
        totals.lesson_hours_formatted || '0:00',
        totals.lesson_count || 0,
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
    a.download = `lesson-hours-${tab}-${startDate}-to-${endDate}.csv`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    window.URL.revokeObjectURL(url);
  };

  // Prepare chart data (limit to top 20 for readability)
  const chartData = data.slice(0, 20).map((row) => ({
    name: row.name || 'Unknown',
    'Lesson Hours': parseFloat(row.lesson_hours || 0),
    'Lesson Count': parseInt(row.lesson_count || 0),
  }));

  return (
      <div className="max-w-7xl mx-auto w-full">
        <div className="bg-white rounded-xl shadow-sm border border-neutral-200 p-6">
          {/* Header */}
          <div className="flex items-center justify-between mb-6">
            <h1 className="text-2xl font-bold text-neutral-900">Lesson Hours</h1>
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
          <div className="mb-6">
            <div className="border-b border-neutral-200">
              <nav className="-mb-px flex space-x-8">
                {TABS.map((t) => (
                  <button
                    key={t.value}
                    onClick={() => setTab(t.value)}
                    className={
                      tab === t.value
                        ? 'py-2 px-1 border-b-2 font-medium text-sm transition-colors border-brand-purple text-brand-purple'
                        : 'py-2 px-1 border-b-2 font-medium text-sm transition-colors border-transparent text-neutral-500 hover:text-neutral-700 hover:border-neutral-300'
                    }
                  >
                    {t.label}
                  </button>
                ))}
              </nav>
            </div>
          </div>

          {loading && (
            <div className="text-center py-12">
              <div className="inline-block animate-spin rounded-full h-8 w-8 border-b-2 border-brand-purple"></div>
              <p className="mt-2 text-neutral-500">Loading lesson hours...</p>
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
              {chartData.length > 0 && (
                <div className="mb-8">
                  <h2 className="text-lg font-semibold text-neutral-900 mb-4">
                    Lesson Hours Over Time
                  </h2>
                  <ResponsiveContainer width="100%" height={400}>
                    <BarChart data={chartData} margin={{ top: 20, right: 30, left: 20, bottom: 60 }}>
                      <CartesianGrid strokeDasharray="3 3" />
                      <XAxis 
                        dataKey="name" 
                        angle={-45}
                        textAnchor="end"
                        height={100}
                        interval={0}
                        tick={{ fontSize: 12 }}
                      />
                      <YAxis />
                      <RechartsTooltip 
                        contentStyle={{ backgroundColor: 'white', border: '1px solid #e5e7eb', borderRadius: '6px' }}
                        formatter={(value, name) => {
                          if (name === 'Lesson Hours') {
                            const totalMinutes = Math.round(value * 60);
                            const h = Math.floor(totalMinutes / 60);
                            const m = totalMinutes % 60;
                            return `${h}:${m.toString().padStart(2, '0')}`;
                          }
                          return value;
                        }}
                      />
                      <Legend />
                      <Bar dataKey="Lesson Hours" fill="#3b82f6" />
                      <Bar dataKey="Lesson Count" fill="#94a3b8" />
                    </BarChart>
                  </ResponsiveContainer>
                </div>
              )}

              {/* Info Note */}
              <div className="mb-6 text-sm text-neutral-600">
                <p>
                  Please note this might be different to the figures shown on your Dashboard. 
                  This is because that figure shows the total hours of lessons that have occurred, 
                  whereas this one shows the number of hours each individual has received. 
                  If 2 people are on the same 1 hour long Lesson, then we will show each person 
                  as having 1 hour of lessons here (2 hours in total) whereas the Dashboard will show 1 hour.
                </p>
              </div>

              {/* CSV Export Button */}
              <div className="mb-4 flex justify-end">
                <Tooltip title="Export CSV">
                  <IconButton
                    onClick={handleExportCSV}
                    size="small"
                    sx={{
                      color: '#6A469D', // brand purple
                      '&:hover': {
                        bgcolor: 'rgba(106, 70, 157, 0.1)', // purple10
                      },
                    }}
                  >
                    <ArrowDownTrayIcon className="h-5 w-5" />
                  </IconButton>
                </Tooltip>
              </div>

              {/* Table */}
              <div className="overflow-x-auto">
                <table className="min-w-full divide-y divide-neutral-200">
                  <thead className="bg-neutral-50">
                    <tr>
                      <th className="px-6 py-3 text-left text-xs font-medium text-neutral-500 uppercase tracking-wider">
                        {TABS.find(t => t.value === tab)?.label || tab}
                      </th>
                      <th className="px-6 py-3 text-right text-xs font-medium text-neutral-500 uppercase tracking-wider">
                        Lesson Hours
                      </th>
                      <th className="px-6 py-3 text-right text-xs font-medium text-neutral-500 uppercase tracking-wider">
                        Lesson Count
                      </th>
                    </tr>
                  </thead>
                  <tbody className="bg-white divide-y divide-neutral-200">
                    {/* Total Row */}
                    {totals && (
                      <tr className="bg-neutral-50 font-semibold">
                        <td className="px-6 py-4 whitespace-nowrap text-sm font-medium text-neutral-900">
                          Total
                        </td>
                        <td className="px-6 py-4 whitespace-nowrap text-sm text-right text-neutral-900">
                          {totals.lesson_hours_formatted || '0:00'}
                        </td>
                        <td className="px-6 py-4 whitespace-nowrap text-sm text-right text-neutral-900">
                          {totals.lesson_count || 0}
                        </td>
                      </tr>
                    )}
                    {/* Data Rows */}
                    {data.map((row) => (
                      <tr key={row.id} className="hover:bg-neutral-50">
                        <td className="px-6 py-4 whitespace-nowrap text-sm font-medium text-neutral-900">
                          {row.name || 'Unknown'}
                        </td>
                        <td className="px-6 py-4 whitespace-nowrap text-sm text-right text-neutral-900">
                          {row.lesson_hours_formatted || '0:00'}
                        </td>
                        <td className="px-6 py-4 whitespace-nowrap text-sm text-right text-neutral-900">
                          {row.lesson_count || 0}
                        </td>
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

export default LessonHoursPage;















