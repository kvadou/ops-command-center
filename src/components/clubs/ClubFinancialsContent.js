import React, { useState, useEffect, useCallback } from 'react';
import { DateTime } from 'luxon';
import { DataGrid } from '@mui/x-data-grid';
import { formatCurrency } from '../../utils/formatters';

const COLUMN_WIDTHS_KEY = 'clubFinancials_columnWidths';
import {
  CalendarIcon,
  CurrencyDollarIcon,
  ArrowTrendingUpIcon,
  BanknotesIcon,
  ReceiptPercentIcon,
  XMarkIcon,
  CheckCircleIcon,
  ArrowDownTrayIcon,
} from '@heroicons/react/24/outline';
import DateRangePicker from '../DateRangePicker';

export default function ClubFinancialsContent() {
  // Date range state
  const today = DateTime.now().setZone('America/New_York').toISODate();
  const [dateRange, setDateRange] = useState({
    startDate: today,
    endDate: today,
    preset: 'today'
  });
  const [operationsData, setOperationsData] = useState(null);
  const [loading, setLoading] = useState(false);
  const [selectedLesson, setSelectedLesson] = useState(null);

  // Load saved column widths from localStorage
  const [savedColumnWidths, setSavedColumnWidths] = useState(() => {
    try {
      const saved = localStorage.getItem(COLUMN_WIDTHS_KEY);
      return saved ? JSON.parse(saved) : {};
    } catch {
      return {};
    }
  });

  // Save column widths when they change
  const handleColumnWidthChange = useCallback((params) => {
    setSavedColumnWidths(prev => {
      const updated = { ...prev, [params.colDef.field]: params.width };
      localStorage.setItem(COLUMN_WIDTHS_KEY, JSON.stringify(updated));
      return updated;
    });
  }, []);

  // Fetch operations data for date range
  const fetchOperationsData = useCallback(async (startDate, endDate) => {
    try {
      setLoading(true);
      const response = await fetch(
        `/api/clubs/operations?startDate=${startDate}&endDate=${endDate}`,
        { credentials: 'include' }
      );
      if (response.ok) {
        const data = await response.json();
        setOperationsData(data);
      } else {
        console.error('Failed to fetch operations data');
      }
    } catch (error) {
      console.error('Error fetching operations data:', error);
    } finally {
      setLoading(false);
    }
  }, []);

  // Fetch operations data when date range changes
  useEffect(() => {
    if (dateRange.startDate && dateRange.endDate) {
      fetchOperationsData(dateRange.startDate, dateRange.endDate);
    }
  }, [dateRange, fetchOperationsData]);

  const handleDateRangeChange = (startDate, endDate, preset) => {
    setDateRange({ startDate, endDate, preset });
  };

  const handleDownloadCSV = useCallback(() => {
    if (!operationsData?.lessons?.length) return;
    const headers = ['Date', 'Time', 'Type', 'Job', 'Tutor', 'Students', 'Revenue', 'Tutor Pay', 'Profit', 'Margin', 'Status'];
    const escapeCSV = (val) => {
      const str = String(val ?? '');
      return str.includes(',') || str.includes('"') || str.includes('\n')
        ? `"${str.replace(/"/g, '""')}"` : str;
    };
    const rows = operationsData.lessons.map((l) => {
      const isSupport = l.label?.includes('Support');
      const margin = l.revenue > 0 ? Math.round((l.profit / l.revenue) * 100) : 0;
      return [
        DateTime.fromISO(l.date).toFormat('yyyy-MM-dd'),
        l.time || '',
        isSupport ? 'Support' : 'Lesson',
        l.jobName || '',
        l.tutorName || (l.tutors?.map(t => t.name).join('; ') || ''),
        l.studentCount ?? '',
        l.revenue ?? 0,
        l.tutorPay ?? 0,
        l.profit ?? 0,
        `${margin}%`,
        l.isCheckedOut ? 'Complete' : (l.status || ''),
      ].map(escapeCSV).join(',');
    });
    const csv = [headers.join(','), ...rows].join('\n');
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `club-financials_${dateRange.startDate}_${dateRange.endDate}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  }, [operationsData, dateRange]);

  // Get human-readable label for the current preset
  const getPresetLabel = (preset) => {
    const labels = {
      today: 'Today',
      yesterday: 'Yesterday',
      thisWeek: 'This Week',
      lastWeek: 'Last Week',
      thisMonth: 'This Month',
      lastMonth: 'Last Month',
      last3Months: 'Last 3 Months',
      last6Months: 'Last 6 Months',
      thisYear: 'This Year',
      lastYear: 'Last Year',
      custom: 'Custom Range',
    };
    return labels[preset] || preset;
  };


  return (
    <div className="space-y-6">
      {/* Financial Summary Section */}
      <div className="bg-white rounded-xl shadow-sm border border-neutral-200 p-6">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 mb-6">
          <div>
            <div className="flex items-center gap-3">
              <h2 className="text-xl font-semibold text-neutral-900">Financial Summary</h2>
              <span className="px-3 py-1 bg-green-100 text-green-700 rounded-full text-sm font-semibold">
                {getPresetLabel(dateRange.preset)}
              </span>
            </div>
            <p className="text-sm text-neutral-500 mt-1">Revenue, costs, and profitability</p>
          </div>
          <DateRangePicker
            value={dateRange}
            onChange={handleDateRangeChange}
            label="Date Range"
          />
        </div>

        {loading ? (
          <div className="flex items-center justify-center py-12">
            <div className="text-neutral-500">Loading financial data...</div>
          </div>
        ) : operationsData ? (
          <>
            {/* Teaching Revenue - Row 1 */}
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-4">
              <div className="bg-green-50 rounded-lg p-4">
                <div className="flex items-center gap-2 mb-1">
                  <CurrencyDollarIcon className="h-4 w-4 text-green-600" />
                  <span className="text-xs font-medium text-neutral-600">Gross Revenue</span>
                </div>
                <p className="text-xl font-bold text-green-700">{formatCurrency(operationsData.summary.grossRevenue)}</p>
                <p className="text-xs text-neutral-500">{operationsData.summary.lessonCount} lessons</p>
              </div>
              <div className="bg-amber-50 rounded-lg p-4">
                <div className="flex items-center gap-2 mb-1">
                  <BanknotesIcon className="h-4 w-4 text-amber-600" />
                  <span className="text-xs font-medium text-neutral-600">Tutor Costs</span>
                </div>
                <p className="text-xl font-bold text-amber-700">{formatCurrency(operationsData.summary.tutorPay)}</p>
              </div>
              <div className={`${operationsData.summary.lessonProfit >= 0 ? 'bg-green-50' : 'bg-red-50'} rounded-lg p-4`}>
                <div className="flex items-center gap-2 mb-1">
                  <ArrowTrendingUpIcon className={`h-4 w-4 ${operationsData.summary.lessonProfit >= 0 ? 'text-green-600' : 'text-red-600'}`} />
                  <span className="text-xs font-medium text-neutral-600">Lesson Profit</span>
                </div>
                <p className={`text-xl font-bold ${operationsData.summary.lessonProfit >= 0 ? 'text-green-700' : 'text-red-700'}`}>
                  {formatCurrency(operationsData.summary.lessonProfit)}
                </p>
              </div>
              <div className="bg-blue-50 rounded-lg p-4">
                <div className="flex items-center gap-2 mb-1">
                  <ReceiptPercentIcon className="h-4 w-4 text-blue-600" />
                  <span className="text-xs font-medium text-neutral-600">Lesson Margin</span>
                </div>
                <p className="text-xl font-bold text-blue-700">{operationsData.summary.lessonMargin}%</p>
              </div>
            </div>

            {/* Support & Net - Row 2 (only show if there's support data) */}
            {operationsData.summary.supportCount > 0 && (
              <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-6">
                <div className="bg-pink-50 rounded-lg p-4">
                  <div className="flex items-center gap-2 mb-1">
                    <CalendarIcon className="h-4 w-4 text-pink-600" />
                    <span className="text-xs font-medium text-neutral-600">Support Sessions</span>
                  </div>
                  <p className="text-xl font-bold text-pink-700">{operationsData.summary.supportCount}</p>
                </div>
                <div className="bg-pink-50 rounded-lg p-4">
                  <div className="flex items-center gap-2 mb-1">
                    <BanknotesIcon className="h-4 w-4 text-pink-600" />
                    <span className="text-xs font-medium text-neutral-600">Support Costs</span>
                  </div>
                  <p className="text-xl font-bold text-pink-700">{formatCurrency(operationsData.summary.supportPay)}</p>
                </div>
                <div className={`${operationsData.summary.combinedProfit >= 0 ? 'bg-green-50' : 'bg-red-50'} rounded-lg p-4`}>
                  <div className="flex items-center gap-2 mb-1">
                    <ArrowTrendingUpIcon className={`h-4 w-4 ${operationsData.summary.combinedProfit >= 0 ? 'text-green-600' : 'text-red-600'}`} />
                    <span className="text-xs font-medium text-neutral-600">Net Profit</span>
                  </div>
                  <p className={`text-xl font-bold ${operationsData.summary.combinedProfit >= 0 ? 'text-green-700' : 'text-red-700'}`}>
                    {formatCurrency(operationsData.summary.combinedProfit)}
                  </p>
                </div>
                <div className="bg-neutral-50 rounded-lg p-4">
                  <div className="flex items-center gap-2 mb-1">
                    <ReceiptPercentIcon className="h-4 w-4 text-brand-purple" />
                    <span className="text-xs font-medium text-neutral-600">Net Margin</span>
                  </div>
                  <p className="text-xl font-bold text-neutral-900">{operationsData.summary.combinedMargin}%</p>
                </div>
              </div>
            )}

            {/* Financial Details Table */}
            <div className="mt-6">
              <div className="flex items-center justify-between mb-3">
                <h3 className="text-sm font-semibold text-neutral-700">Financial Details</h3>
                {operationsData.lessons.length > 0 && (
                  <button
                    onClick={handleDownloadCSV}
                    className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-brand-purple bg-brand-purple/10 hover:bg-brand-purple/20 rounded-lg transition-colors"
                  >
                    <ArrowDownTrayIcon className="h-3.5 w-3.5" />
                    Download CSV
                  </button>
                )}
              </div>
              {operationsData.lessons.length > 0 ? (
                <div style={{ width: '100%' }}>
                  <DataGrid
                    autoHeight
                    rows={operationsData.lessons.map((lesson) => ({
                      id: lesson.appointmentId,
                      ...lesson
                    }))}
                    columns={[
                      {
                        field: 'date',
                        headerName: 'Date/Time',
                        width: savedColumnWidths.date || 120,
                        align: 'center',
                        headerAlign: 'center',
                        sortComparator: (v1, v2) => new Date(v1).getTime() - new Date(v2).getTime(),
                        renderCell: (params) => (
                          <div className="flex flex-col items-center justify-center h-full">
                            <div className="text-sm font-medium text-neutral-900">
                              {DateTime.fromISO(params.row.date).toFormat('MMM d')}
                            </div>
                            <div className="text-xs text-neutral-500">{params.row.time}</div>
                          </div>
                        ),
                      },
                      {
                        field: 'label',
                        headerName: 'Type',
                        width: savedColumnWidths.label || 100,
                        align: 'center',
                        headerAlign: 'center',
                        renderCell: (params) => {
                          const isSupport = params.value?.includes('Support');
                          return (
                            <div className="flex items-center justify-center gap-2 h-full">
                              <div
                                className={`w-3 h-3 rounded-full ${isSupport ? 'bg-pink-500' : 'bg-blue-500'}`}
                              />
                              <span className="text-xs">{isSupport ? 'Support' : 'Lesson'}</span>
                            </div>
                          );
                        },
                      },
                      {
                        field: 'jobName',
                        headerName: 'Job',
                        flex: savedColumnWidths.jobName ? 0 : 1,
                        width: savedColumnWidths.jobName || undefined,
                        minWidth: 200,
                      },
                      {
                        field: 'revenue',
                        headerName: 'Revenue',
                        width: savedColumnWidths.revenue || 110,
                        align: 'right',
                        headerAlign: 'right',
                        renderCell: (params) => {
                          const isSupport = params.row.label?.includes('Support');
                          return (
                            <span className={isSupport ? 'text-neutral-400' : 'text-green-600 font-medium'}>
                              {formatCurrency(params.value)}
                            </span>
                          );
                        },
                      },
                      {
                        field: 'tutorPay',
                        headerName: 'Tutor Pay',
                        width: savedColumnWidths.tutorPay || 110,
                        align: 'right',
                        headerAlign: 'right',
                        renderCell: (params) => {
                          const isSupport = params.row.label?.includes('Support');
                          return (
                            <span className={isSupport ? 'text-pink-600 font-medium' : 'text-amber-600'}>
                              {formatCurrency(params.value)}
                            </span>
                          );
                        },
                      },
                      {
                        field: 'profit',
                        headerName: 'Profit',
                        width: savedColumnWidths.profit || 100,
                        align: 'right',
                        headerAlign: 'right',
                        renderCell: (params) => (
                          <span className={params.value >= 0 ? 'text-green-600 font-medium' : 'text-red-600 font-medium'}>
                            {formatCurrency(params.value)}
                          </span>
                        ),
                      },
                    ]}
                    onColumnWidthChange={handleColumnWidthChange}
                    onRowClick={(params) => setSelectedLesson(params.row)}
                    disableRowSelectionOnClick
                    disableColumnMenu
                    disableColumnFilter
                    disableColumnSelector
                    pageSizeOptions={[25, 50, 100]}
                    initialState={{
                      pagination: { paginationModel: { pageSize: 50, page: 0 } },
                    }}
                    sx={{
                      border: 'none',
                      '& .MuiDataGrid-columnHeaders': {
                        backgroundColor: '#f9fafb',
                        borderBottom: '1px solid #e5e7eb',
                      },
                      '& .MuiDataGrid-cell': {
                        borderBottom: '1px solid #f3f4f6',
                      },
                      '& .MuiDataGrid-row': {
                        cursor: 'pointer',
                        '&:hover': {
                          backgroundColor: 'rgba(106, 70, 157, 0.05)',
                        },
                      },
                    }}
                  />
                </div>
              ) : (
                <div className="text-center py-12 text-neutral-500">
                  <CurrencyDollarIcon className="h-12 w-12 mx-auto mb-4 text-neutral-300" />
                  <p className="text-sm">No financial data for this date range</p>
                </div>
              )}
            </div>
          </>
        ) : (
          <div className="text-center py-12 text-neutral-500">
            <p className="text-sm">Select a date range to view financial data</p>
          </div>
        )}
      </div>

      {/* Lesson Detail Modal */}
      {selectedLesson && (
        <div className="fixed inset-0 z-50 overflow-y-auto">
          <div className="flex items-center justify-center min-h-screen p-4">
            <div className="fixed inset-0 bg-black/50" onClick={() => setSelectedLesson(null)} />
            <div className="relative bg-white rounded-xl shadow-xl max-w-3xl w-full max-h-[90vh] overflow-hidden flex flex-col">
              {/* Modal Header */}
              <div className="bg-brand-purple text-white p-4">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-3">
                    <div
                      className={`w-4 h-4 rounded-full ${selectedLesson.label?.includes('Support') ? 'bg-pink-500' : 'bg-blue-500'}`}
                    />
                    <div>
                      <h3 className="text-lg font-semibold flex items-center gap-3">
                        {selectedLesson.label?.includes('Support') ? 'Support' : 'Lesson'}: {selectedLesson.jobName}
                        <span className={`px-2 py-0.5 rounded text-xs font-medium ${
                          selectedLesson.isCheckedOut ? 'bg-green-500' : 'bg-blue-500'
                        }`}>
                          {selectedLesson.isCheckedOut ? 'Complete' : selectedLesson.status}
                        </span>
                      </h3>
                      <p className="text-sm text-white/80">
                        {DateTime.fromISO(selectedLesson.date).toFormat('EEEE, MMMM d, yyyy')} at {selectedLesson.time}
                      </p>
                    </div>
                  </div>
                  <button
                    onClick={() => setSelectedLesson(null)}
                    className="p-2 hover:bg-white/20 rounded-lg transition-colors"
                  >
                    <XMarkIcon className="h-5 w-5" />
                  </button>
                </div>
              </div>

              {/* Modal Content */}
              <div className="flex-1 overflow-y-auto p-6">
                <div className="space-y-6">
                  {/* Financial Breakdown */}
                  <div className="border border-neutral-200 rounded-lg">
                    <div className="bg-neutral-50 px-4 py-3 border-b border-neutral-200">
                      <h4 className="font-semibold text-neutral-900">Financial Breakdown</h4>
                    </div>
                    <div className="p-4">
                      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                        <div className="bg-green-50 rounded-lg p-4 text-center">
                          <p className="text-xs text-neutral-500 mb-1">Revenue</p>
                          <p className="text-xl font-bold text-green-700">{formatCurrency(selectedLesson.revenue)}</p>
                        </div>
                        <div className={`${selectedLesson.label?.includes('Support') ? 'bg-pink-50' : 'bg-amber-50'} rounded-lg p-4 text-center`}>
                          <p className="text-xs text-neutral-500 mb-1">
                            {selectedLesson.label?.includes('Support') ? 'Support Pay' : 'Tutor Pay'}
                          </p>
                          <p className={`text-xl font-bold ${selectedLesson.label?.includes('Support') ? 'text-pink-700' : 'text-amber-700'}`}>
                            {formatCurrency(selectedLesson.tutorPay)}
                          </p>
                        </div>
                        <div className={`${selectedLesson.profit >= 0 ? 'bg-green-50' : 'bg-red-50'} rounded-lg p-4 text-center`}>
                          <p className="text-xs text-neutral-500 mb-1">Profit</p>
                          <p className={`text-xl font-bold ${selectedLesson.profit >= 0 ? 'text-green-700' : 'text-red-700'}`}>
                            {formatCurrency(selectedLesson.profit)}
                          </p>
                        </div>
                        <div className="bg-neutral-50 rounded-lg p-4 text-center">
                          <p className="text-xs text-neutral-500 mb-1">Margin</p>
                          <p className="text-xl font-bold text-neutral-900">
                            {selectedLesson.revenue > 0 ? Math.round((selectedLesson.profit / selectedLesson.revenue) * 100) : 0}%
                          </p>
                        </div>
                      </div>
                    </div>
                  </div>

                  {/* Tutor Information */}
                  <div className="border border-neutral-200 rounded-lg">
                    <div className="bg-neutral-50 px-4 py-3 border-b border-neutral-200">
                      <h4 className="font-semibold text-neutral-900">
                        {selectedLesson.label?.includes('Support') ? 'Staff' : 'Tutor'}
                      </h4>
                    </div>
                    <div className="p-4">
                      {selectedLesson.tutors && selectedLesson.tutors.length > 0 ? (
                        selectedLesson.tutors.map((tutor, idx) => (
                          <div key={idx} className="flex items-center justify-between p-2">
                            <span className="text-brand-purple font-medium">{tutor.name}</span>
                            <span className={`font-medium ${selectedLesson.label?.includes('Support') ? 'text-pink-600' : 'text-amber-600'}`}>
                              {formatCurrency((tutor.payRate || 0) * (selectedLesson.units || 1))}
                            </span>
                          </div>
                        ))
                      ) : (
                        <div className="flex items-center justify-between p-2">
                          <span className="text-brand-purple font-medium">{selectedLesson.tutorName}</span>
                          <span className={`font-medium ${selectedLesson.label?.includes('Support') ? 'text-pink-600' : 'text-amber-600'}`}>
                            {formatCurrency(selectedLesson.tutorPay)}
                          </span>
                        </div>
                      )}
                    </div>
                  </div>

                  {/* Students (if teaching lesson) */}
                  {!selectedLesson.label?.includes('Support') && selectedLesson.studentCount > 0 && (
                    <div className="border border-neutral-200 rounded-lg">
                      <div className="bg-neutral-50 px-4 py-3 border-b border-neutral-200">
                        <h4 className="font-semibold text-neutral-900">Students ({selectedLesson.studentCount})</h4>
                      </div>
                      <div className="p-4 space-y-2 max-h-48 overflow-y-auto">
                        {selectedLesson.students && selectedLesson.students.length > 0 ? (
                          selectedLesson.students.map((student, idx) => (
                            <div key={idx} className="flex items-center justify-between p-2">
                              <span className="text-brand-purple font-medium">{student.name}</span>
                              <span className="text-green-600 font-medium">
                                {formatCurrency(student.chargeRate || 0)}
                              </span>
                            </div>
                          ))
                        ) : (
                          <p className="text-neutral-500 text-sm">Student details not available</p>
                        )}
                      </div>
                    </div>
                  )}
                </div>
              </div>

              {/* Modal Footer */}
              <div className="flex justify-between items-center p-4 border-t border-neutral-200 bg-neutral-50">
                <a
                  href={`https://account.acmeops.com/cal/appointments/${selectedLesson.appointmentId}/`}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="px-4 py-2 bg-brand-purple text-white rounded-lg hover:bg-brand-navy transition-colors font-medium"
                >
                  Open in TutorCruncher
                </a>
                <button
                  onClick={() => setSelectedLesson(null)}
                  className="px-4 py-2 bg-neutral-200 text-neutral-700 rounded-lg hover:bg-neutral-300 transition-colors font-medium"
                >
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
