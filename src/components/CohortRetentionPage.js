import { useState, useEffect, useCallback } from 'react';
import { ChartBarSquareIcon, ArrowPathIcon, XMarkIcon } from '@heroicons/react/24/outline';
import { useResizableColumns, ResizeHandle } from './ClientConversion/useResizableColumns';

function formatCohortPeriod(period) {
  if (!period) return period;
  const weeklyMatch = period.match(/(\d{4})-W(\d{1,2})/);
  if (weeklyMatch) {
    const [, year, week] = weeklyMatch;
    return `W${parseInt(week)} '${year.slice(2)}`;
  }
  const monthlyMatch = period.match(/(\d{4})-(\d{2})/);
  if (monthlyMatch) {
    const [, year, month] = monthlyMatch;
    const names = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
    return `${names[parseInt(month) - 1]} '${year.slice(2)}`;
  }
  return period;
}

export default function CohortRetentionPage() {
  const { columnWidths: cohortWidths, handleResizeStart: cohortResize } = useResizableColumns('columnWidths_cohortRetention');

  const [cohortData, setCohortData] = useState(null);
  const [cohortLoading, setCohortLoading] = useState(false);
  const [cohortFilters, setCohortFilters] = useState({
    period: 'monthly',
    bookingType: 'all',
    leadType: 'all',
    market: 'all',
    leadSource: 'all',
  });
  const [cohortDetailModal, setCohortDetailModal] = useState({
    open: false, cohortPeriod: null, periodOffset: null, clients: [], loading: false,
  });
  const [acquiredModal, setAcquiredModal] = useState({
    open: false, cohortPeriod: null, registrations: [], summary: null, loading: false,
    search: '', sortBy: 'created_at', sortOrder: 'desc',
  });

  const fetchCohortData = useCallback(async (filters = cohortFilters) => {
    setCohortLoading(true);
    try {
      const params = new URLSearchParams();
      params.append('period', filters.period);
      if (filters.bookingType !== 'all') params.append('bookingType', filters.bookingType);
      if (filters.leadType !== 'all') params.append('leadType', filters.leadType);
      if (filters.market !== 'all') params.append('market', filters.market);
      if (filters.leadSource !== 'all') params.append('leadSource', filters.leadSource);

      const response = await fetch(
        `/api/client-conversion-tracker/analytics/cohort-retention?${params}`,
        { credentials: 'include' }
      );
      if (!response.ok) throw new Error('Failed to fetch cohort data');
      setCohortData(await response.json());
    } catch (error) {
      console.error('Error fetching cohort data:', error);
      setCohortData(null);
    } finally {
      setCohortLoading(false);
    }
  }, []);

  useEffect(() => { fetchCohortData(); }, [fetchCohortData]);

  const handleFilterChange = (newFilters) => {
    const updated = { ...cohortFilters, ...newFilters };
    setCohortFilters(updated);
    fetchCohortData(updated);
  };

  const handleCellClick = async (cohortPeriod, periodOffset) => {
    setCohortDetailModal(prev => ({ ...prev, open: true, cohortPeriod, periodOffset, clients: [], loading: true }));
    try {
      const params = new URLSearchParams();
      params.append('cohortPeriod', cohortPeriod);
      params.append('periodOffset', periodOffset);
      params.append('period', cohortFilters.period);
      if (cohortFilters.bookingType !== 'all') params.append('bookingType', cohortFilters.bookingType);
      if (cohortFilters.leadType !== 'all') params.append('leadType', cohortFilters.leadType);
      if (cohortFilters.market !== 'all') params.append('market', cohortFilters.market);
      if (cohortFilters.leadSource !== 'all') params.append('leadSource', cohortFilters.leadSource);

      const response = await fetch(
        `/api/client-conversion-tracker/analytics/cohort-retention/clients?${params}`,
        { credentials: 'include' }
      );
      if (!response.ok) throw new Error('Failed to fetch cohort clients');
      const data = await response.json();
      setCohortDetailModal(prev => ({ ...prev, clients: data.clients || [], loading: false }));
    } catch {
      setCohortDetailModal(prev => ({ ...prev, clients: [], loading: false }));
    }
  };

  const handleAcquiredClick = async (cohortPeriod) => {
    setAcquiredModal(prev => ({ ...prev, open: true, cohortPeriod, loading: true, registrations: [], summary: null }));
    try {
      const params = new URLSearchParams({ cohortPeriod, period: cohortFilters.period });
      if (cohortFilters.bookingType !== 'all') params.append('bookingType', cohortFilters.bookingType);
      if (cohortFilters.leadType !== 'all') params.append('leadType', cohortFilters.leadType);
      if (cohortFilters.market !== 'all') params.append('market', cohortFilters.market);
      if (cohortFilters.leadSource !== 'all') params.append('leadSource', cohortFilters.leadSource);

      const response = await fetch(`/api/client-conversion-tracker/analytics/cohort-retention/acquired?${params}`);
      if (!response.ok) throw new Error('Failed to fetch acquired registrations');
      const data = await response.json();
      setAcquiredModal(prev => ({ ...prev, registrations: data.registrations, summary: data.summary, loading: false }));
    } catch {
      setAcquiredModal(prev => ({ ...prev, registrations: [], summary: null, loading: false }));
    }
  };

  return (
    <div className="max-w-7xl mx-auto w-full space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
        <h2 className="text-lg font-semibold text-neutral-900">Cohort Retention</h2>
        <button
          onClick={() => fetchCohortData(cohortFilters)}
          disabled={cohortLoading}
          className="flex items-center gap-2 px-4 py-2 text-sm font-medium text-[#6A469D] bg-[#6A469D]/10 rounded-lg hover:bg-[#6A469D]/20 transition-colors disabled:opacity-50 self-start sm:self-auto"
        >
          <ArrowPathIcon className={`h-4 w-4 ${cohortLoading ? 'animate-spin' : ''}`} />
          Refresh
        </button>
      </div>

      {/* Filters */}
      <div className="flex flex-wrap items-center gap-3">
        <div className="flex items-center bg-neutral-100 rounded-lg p-0.5">
          {['monthly', 'weekly'].map(p => (
            <button
              key={p}
              onClick={() => handleFilterChange({ period: p })}
              className={`px-3 py-1.5 rounded-md text-sm font-medium transition-colors ${
                cohortFilters.period === p
                  ? 'bg-white text-[#6A469D] shadow-sm'
                  : 'text-neutral-500 hover:text-neutral-700'
              }`}
            >
              {p.charAt(0).toUpperCase() + p.slice(1)}
            </button>
          ))}
        </div>

        <select
          value={cohortFilters.bookingType}
          onChange={(e) => handleFilterChange({ bookingType: e.target.value })}
          className="text-sm border border-neutral-200 rounded-lg px-3 py-1.5 bg-white focus:ring-2 focus:ring-[#6A469D]/30 focus:border-[#6A469D]"
        >
          <option value="all">All Booking Types</option>
          {cohortData?.filters?.bookingTypes?.map(t => <option key={t} value={t}>{t}</option>)}
        </select>

        <select
          value={cohortFilters.leadType}
          onChange={(e) => handleFilterChange({ leadType: e.target.value })}
          className="text-sm border border-neutral-200 rounded-lg px-3 py-1.5 bg-white focus:ring-2 focus:ring-[#6A469D]/30 focus:border-[#6A469D]"
        >
          <option value="all">All Lead Types</option>
          {cohortData?.filters?.leadTypes?.map(t => <option key={t} value={t}>{t}</option>)}
        </select>

        <select
          value={cohortFilters.market}
          onChange={(e) => handleFilterChange({ market: e.target.value })}
          className="text-sm border border-neutral-200 rounded-lg px-3 py-1.5 bg-white focus:ring-2 focus:ring-[#6A469D]/30 focus:border-[#6A469D]"
        >
          <option value="all">All Markets</option>
          {cohortData?.filters?.markets?.map(m => <option key={m} value={m}>{m}</option>)}
        </select>

        <select
          value={cohortFilters.leadSource}
          onChange={(e) => handleFilterChange({ leadSource: e.target.value })}
          className="text-sm border border-neutral-200 rounded-lg px-3 py-1.5 bg-white focus:ring-2 focus:ring-[#6A469D]/30 focus:border-[#6A469D]"
        >
          <option value="all">All Lead Sources</option>
          {cohortData?.filters?.leadSources?.map(s => <option key={s} value={s}>{s}</option>)}
        </select>
      </div>

      {/* Summary Stats */}
      {cohortData?.summary && (
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          <div className="bg-white rounded-xl shadow-sm border border-neutral-200 p-4">
            <p className="text-xs font-medium text-neutral-500 uppercase tracking-wide">Total Acquired</p>
            <p className="text-2xl font-bold text-neutral-900 mt-1">{cohortData.summary.total_acquired}</p>
          </div>
          <div className="bg-white rounded-xl shadow-sm border border-neutral-200 p-4">
            <p className="text-xs font-medium text-neutral-500 uppercase tracking-wide">Converted (M0)</p>
            <p className="text-2xl font-bold text-neutral-900 mt-1">{cohortData.summary.total_converted}</p>
          </div>
          <div className="bg-white rounded-xl shadow-sm border border-neutral-200 p-4">
            <p className="text-xs font-medium text-neutral-500 uppercase tracking-wide">Conversion Rate</p>
            <p className="text-2xl font-bold text-neutral-900 mt-1">{cohortData.summary.overall_conversion_rate}%</p>
          </div>
          <div className="bg-white rounded-xl shadow-sm border border-neutral-200 p-4">
            <p className="text-xs font-medium text-neutral-500 uppercase tracking-wide">Avg {cohortData.summary.reference_label} Retention</p>
            <p className="text-2xl font-bold text-neutral-900 mt-1">{cohortData.summary.avg_retention_reference}%</p>
          </div>
        </div>
      )}

      {/* Cohort Matrix */}
      <div className="bg-white rounded-xl shadow-sm border border-neutral-200 overflow-hidden">
        {cohortLoading ? (
          <div className="flex items-center justify-center py-16">
            <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-[#6A469D]" />
            <span className="ml-3 text-neutral-600">Loading cohort data...</span>
          </div>
        ) : cohortData?.cohorts?.length > 0 ? (
          <div className="overflow-x-auto">
            <table className="min-w-full table-fixed">
              <thead>
                <tr className="border-b border-neutral-200">
                  <th className="relative px-3 py-3 text-left text-[11px] font-medium text-neutral-500 uppercase tracking-wider bg-neutral-50 sticky left-0" style={{ width: cohortWidths.cohort || 110 }}>
                    Cohort
                    <ResizeHandle colKey="cohort" onResizeStart={cohortResize} />
                  </th>
                  <th className="relative px-3 py-3 text-center text-[11px] font-medium text-neutral-500 uppercase tracking-wider bg-neutral-50" style={{ width: cohortWidths.acq || 80 }}>
                    Acq
                    <ResizeHandle colKey="acq" onResizeStart={cohortResize} />
                  </th>
                  {[0, 1, 2, 3, 4, 5, 6].map(offset => (
                    <th key={offset} className="relative px-3 py-3 text-center text-[11px] font-medium text-neutral-500 uppercase tracking-wider bg-neutral-50" style={{ width: cohortWidths[`w${offset}`] || 80 }}>
                      {cohortFilters.period === 'weekly' ? `W${offset}` : `M${offset}`}
                      {offset < 6 && <ResizeHandle colKey={`w${offset}`} onResizeStart={cohortResize} />}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y divide-neutral-100">
                {cohortData.cohorts.slice(0, 12).map((cohort) => (
                  <tr key={cohort.cohort_period} className="hover:bg-neutral-50">
                    <td className="px-3 py-3 whitespace-nowrap text-sm font-medium text-neutral-900 bg-neutral-50 sticky left-0">
                      {formatCohortPeriod(cohort.cohort_period)}
                    </td>
                    <td
                      className="px-3 py-3 whitespace-nowrap text-sm text-center font-semibold text-neutral-900 cursor-pointer hover:bg-[#6A469D]/5 hover:text-[#6A469D] transition-colors"
                      onClick={() => handleAcquiredClick(cohort.cohort_period)}
                      title="Click to view all registrations"
                    >
                      {cohort.acquired}
                    </td>
                    {[0, 1, 2, 3, 4, 5, 6].map(offset => {
                      const retention = cohort.retention.find(r => r.period === offset);
                      const hasData = retention && retention.active > 0;
                      const pct = retention?.pct || 0;

                      let bgColor = 'bg-neutral-100';
                      let textColor = 'text-neutral-400';
                      if (hasData) {
                        if (pct >= 70) {
                          bgColor = 'bg-[#E8F8ED] hover:bg-[#d1f0db]';
                          textColor = 'text-[#2A9147]';
                        } else if (pct >= 40) {
                          bgColor = 'bg-[#FEF4E8] hover:bg-[#fde9c8]';
                          textColor = 'text-[#C77A26]';
                        } else {
                          bgColor = 'bg-[#FCE8F0] hover:bg-[#f9d1e0]';
                          textColor = 'text-[#AE255B]';
                        }
                      }

                      return (
                        <td
                          key={offset}
                          className={`px-3 py-2 text-center cursor-pointer transition-colors ${bgColor}`}
                          onClick={() => hasData && handleCellClick(cohort.cohort_period, offset)}
                          title={hasData ? `Click to see ${retention.active} clients` : 'No data'}
                        >
                          {hasData ? (
                            <div>
                              <div className={`text-sm font-semibold ${textColor}`}>{retention.active}</div>
                              <div className={`text-xs ${textColor} opacity-75`}>{pct}%</div>
                            </div>
                          ) : (
                            <span className="text-neutral-300">—</span>
                          )}
                        </td>
                      );
                    })}
                  </tr>
                ))}
              </tbody>
            </table>
            <div className="px-4 py-3 flex items-center gap-6 text-xs text-neutral-500 border-t border-neutral-100">
              <span className="flex items-center gap-1">
                <span className="inline-block w-3 h-3 bg-[#E8F8ED] rounded" />
                &gt;70% (Strong)
              </span>
              <span className="flex items-center gap-1">
                <span className="inline-block w-3 h-3 bg-[#FEF4E8] rounded" />
                40-70% (Average)
              </span>
              <span className="flex items-center gap-1">
                <span className="inline-block w-3 h-3 bg-[#FCE8F0] rounded" />
                &lt;40% (Weak)
              </span>
            </div>
          </div>
        ) : (
          <div className="text-center py-16 text-neutral-500">
            No cohort data available. Try adjusting your filters.
          </div>
        )}
      </div>

      {/* Cohort Detail Modal */}
      {cohortDetailModal.open && (
        <div className="fixed inset-0 z-50 overflow-y-auto">
          <div className="flex items-end justify-center min-h-screen pt-4 px-4 pb-20 text-center sm:block sm:p-0">
            <div className="fixed inset-0 bg-neutral-500 bg-opacity-75 transition-opacity" onClick={() => setCohortDetailModal(p => ({ ...p, open: false }))} />
            <span className="hidden sm:inline-block sm:align-middle sm:h-screen">&#8203;</span>
            <div className="inline-block align-bottom bg-white rounded-lg text-left overflow-hidden shadow-xl transform transition-all sm:my-8 sm:align-middle sm:max-w-4xl sm:w-full">
              <div className="bg-white px-4 pt-5 pb-4 sm:p-6">
                <div className="flex items-center justify-between mb-4">
                  <div>
                    <h3 className="text-lg font-semibold text-neutral-900">
                      {formatCohortPeriod(cohortDetailModal.cohortPeriod)} Cohort — {cohortFilters.period === 'weekly' ? `Week ${cohortDetailModal.periodOffset}` : `Month ${cohortDetailModal.periodOffset}`}
                    </h3>
                    <p className="text-sm text-neutral-500">{cohortDetailModal.clients.length} active clients</p>
                  </div>
                  <button onClick={() => setCohortDetailModal(p => ({ ...p, open: false }))} className="rounded-full p-1 text-neutral-400 hover:text-neutral-600 hover:bg-neutral-100 transition-colors">
                    <XMarkIcon className="h-6 w-6" />
                  </button>
                </div>
                {cohortDetailModal.loading ? (
                  <div className="flex items-center justify-center py-8">
                    <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-[#6A469D]" />
                    <span className="ml-3 text-neutral-600">Loading clients...</span>
                  </div>
                ) : cohortDetailModal.clients.length > 0 ? (
                  <div className="overflow-y-auto max-h-[60vh] space-y-3">
                    {cohortDetailModal.clients.map((client, idx) => (
                      <div key={client.submission_id || idx} className="bg-neutral-50 rounded-lg p-4 border border-neutral-200 hover:border-neutral-300 transition-colors">
                        <div className="flex items-start justify-between mb-2">
                          <div>
                            {client.tc_client_id ? (
                              <a href={`/people/clients/${client.tc_client_id}`} className="text-sm font-semibold text-[#6A469D] hover:text-[#2D2F8E] hover:underline">
                                {client.parent_name || '—'}
                              </a>
                            ) : (
                              <span className="text-sm font-semibold text-neutral-900">{client.parent_name || '—'}</span>
                            )}
                            <div className="text-xs text-neutral-500">{client.parent_email || '—'}</div>
                          </div>
                          <div className="text-right">
                            <div className="text-sm font-bold text-[#2A9147]">${client.total_revenue?.toLocaleString() || '0'}</div>
                            <div className="text-xs text-neutral-500">{client.invoice_count || 0} invoices</div>
                          </div>
                        </div>
                        <div className="flex flex-wrap gap-2 text-xs">
                          <span className="px-2 py-1 rounded-md bg-white border border-neutral-200 text-neutral-700">{client.booking_type || 'Unknown type'}</span>
                          {client.lead_type && <span className="px-2 py-1 rounded-md bg-[#E8FBFF] text-[#3BA8BD] border border-[#50C8DF]/20">{client.lead_type}</span>}
                          {client.market && <span className="px-2 py-1 rounded-md bg-[#6A469D]/10 text-[#6A469D] border border-[#6A469D]/20">{client.market}</span>}
                        </div>
                      </div>
                    ))}
                  </div>
                ) : (
                  <div className="text-center py-8 text-neutral-500">No clients found for this cohort/period.</div>
                )}
              </div>
              <div className="bg-neutral-50 px-4 py-3 sm:px-6 sm:flex sm:flex-row-reverse">
                <button onClick={() => setCohortDetailModal(p => ({ ...p, open: false }))} className="w-full sm:w-auto px-4 py-2 text-sm font-medium text-neutral-700 bg-white border border-neutral-300 rounded-lg hover:bg-neutral-50">
                  Close
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Acquired Registrations Modal */}
      {acquiredModal.open && (
        <div className="fixed inset-0 z-50 overflow-y-auto">
          <div className="flex items-end justify-center min-h-screen pt-4 px-4 pb-20 text-center sm:block sm:p-0">
            <div className="fixed inset-0 bg-neutral-500 bg-opacity-75 transition-opacity" onClick={() => setAcquiredModal(p => ({ ...p, open: false }))} />
            <span className="hidden sm:inline-block sm:align-middle sm:h-screen">&#8203;</span>
            <div className="inline-block align-bottom bg-white rounded-lg text-left overflow-hidden shadow-xl transform transition-all sm:my-8 sm:align-middle sm:max-w-6xl sm:w-full">
              <div className="bg-white px-4 pt-5 pb-4 sm:p-6">
                <div className="flex items-center justify-between mb-4">
                  <div>
                    <h3 className="text-lg font-semibold text-neutral-900">{formatCohortPeriod(acquiredModal.cohortPeriod)} Registrations</h3>
                    <p className="text-sm text-neutral-500">All paid/verified registrations for this period</p>
                  </div>
                  <button onClick={() => setAcquiredModal(p => ({ ...p, open: false }))} className="rounded-full p-1 text-neutral-400 hover:text-neutral-600 hover:bg-neutral-100 transition-colors">
                    <XMarkIcon className="h-6 w-6" />
                  </button>
                </div>
                {acquiredModal.loading ? (
                  <div className="flex items-center justify-center py-8">
                    <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-[#6A469D]" />
                    <span className="ml-3 text-neutral-600">Loading registrations...</span>
                  </div>
                ) : acquiredModal.registrations.length > 0 ? (
                  <div className="overflow-y-auto max-h-[60vh] space-y-3">
                    {acquiredModal.registrations.map((reg, idx) => (
                      <div key={reg.submission_id || idx} className="bg-neutral-50 rounded-lg p-4 border border-neutral-200 hover:border-neutral-300 transition-colors">
                        <div className="flex items-start justify-between mb-2">
                          <div>
                            <span className="text-sm font-semibold text-neutral-900">{reg.parent_name || '—'}</span>
                            <div className="text-xs text-neutral-500">{reg.parent_email || '—'}</div>
                          </div>
                          <div className="text-xs text-neutral-500">{reg.booking_type || 'Unknown type'}</div>
                        </div>
                      </div>
                    ))}
                  </div>
                ) : (
                  <div className="text-center py-8 text-neutral-500">No registrations found.</div>
                )}
              </div>
              <div className="bg-neutral-50 px-4 py-3 sm:px-6 sm:flex sm:flex-row-reverse">
                <button onClick={() => setAcquiredModal(p => ({ ...p, open: false }))} className="w-full sm:w-auto px-4 py-2 text-sm font-medium text-neutral-700 bg-white border border-neutral-300 rounded-lg hover:bg-neutral-50">
                  Close
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
