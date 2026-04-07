import React, { useState, useEffect, useCallback } from 'react';
import { DateTime } from 'luxon';
import { DataGrid } from '@mui/x-data-grid';
import { formatCurrency } from '../../utils/formatters';

const COLUMN_WIDTHS_KEY = 'clubDashboard_operationsColumnWidths';
import {
  CalendarIcon,
  UserGroupIcon,
  ClockIcon,
  XMarkIcon,
  CheckCircleIcon,
  ExclamationCircleIcon,
} from '@heroicons/react/24/outline';
import DateRangePicker from '../DateRangePicker';

export default function ClubDashboardContent() {
  // Operations section state
  const today = DateTime.now().setZone('America/New_York').toISODate();
  const [operationsDateRange, setOperationsDateRange] = useState({
    startDate: today,
    endDate: today,
    preset: 'today'
  });
  const [operationsData, setOperationsData] = useState(null);
  const [operationsLoading, setOperationsLoading] = useState(false);
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
      setOperationsLoading(true);
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
      setOperationsLoading(false);
    }
  }, []);

  // Fetch operations data when date range changes
  useEffect(() => {
    if (operationsDateRange.startDate && operationsDateRange.endDate) {
      fetchOperationsData(operationsDateRange.startDate, operationsDateRange.endDate);
    }
  }, [operationsDateRange, fetchOperationsData]);

  const handleDateRangeChange = (startDate, endDate, preset) => {
    setOperationsDateRange({ startDate, endDate, preset });
  };

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


  const StatCard = ({ title, value, icon: Icon, subtitle, trend, trendValue, onClick }) => (
    <button
      onClick={onClick}
      className="bg-white rounded-xl shadow-sm border border-neutral-200 p-6 hover:shadow-md hover:border-brand-purple/20 transition-all duration-200 cursor-pointer w-full text-left group"
    >
      <div className="flex items-start justify-between">
        <div className="flex-1">
          <div className="flex items-center gap-2 mb-2">
            {Icon && <Icon className="h-5 w-5 text-brand-purple group-hover:text-brand-navy transition-colors" />}
            <h3 className="text-sm font-medium text-neutral-600 group-hover:text-neutral-900 transition-colors">{title}</h3>
          </div>
          <p className="text-2xl font-bold text-neutral-900">{value}</p>
          {subtitle && (
            <p className="text-sm text-neutral-500 mt-1">{subtitle}</p>
          )}
          {trend && trendValue && (
            <div className={`flex items-center gap-1 mt-2 ${trend === 'up' ? 'text-green-600' : 'text-red-600'}`}>
              {trend === 'up' ? (
                <ArrowTrendingUpIcon className="h-4 w-4" />
              ) : (
                <ArrowTrendingDownIcon className="h-4 w-4" />
              )}
              <span className="text-xs font-medium">{trendValue}</span>
            </div>
          )}
        </div>
      </div>
      <div className="mt-3 text-xs text-brand-purple opacity-0 group-hover:opacity-100 transition-opacity">
        Click for details →
      </div>
    </button>
  );

  return (
    <div className="space-y-6">
      {/* Operations Section with Date Range */}
      <div className="bg-white rounded-xl shadow-sm border border-neutral-200 p-6">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 mb-6">
          <div>
            <div className="flex items-center gap-3">
              <h2 className="text-xl font-semibold text-neutral-900">Operations</h2>
              <span className="px-3 py-1 bg-brand-purple/10 text-brand-purple rounded-full text-sm font-semibold">
                {getPresetLabel(operationsDateRange.preset)}
              </span>
            </div>
            <p className="text-sm text-neutral-500 mt-1">Lesson schedule, attendance, and staffing</p>
          </div>
          <DateRangePicker
            value={operationsDateRange}
            onChange={handleDateRangeChange}
            label="Date Range"
          />
        </div>

        {operationsLoading ? (
          <div className="flex items-center justify-center py-12">
            <div className="text-neutral-500">Loading operations data...</div>
          </div>
        ) : operationsData ? (
          <>
            {/* Operations Summary */}
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-6">
              <div className="bg-blue-50 rounded-lg p-4">
                <div className="flex items-center gap-2 mb-1">
                  <CalendarIcon className="h-4 w-4 text-blue-600" />
                  <span className="text-xs font-medium text-neutral-600">Lessons</span>
                </div>
                <p className="text-xl font-bold text-blue-700">{operationsData.summary.lessonCount}</p>
              </div>
              <div className="bg-blue-50 rounded-lg p-4">
                <div className="flex items-center gap-2 mb-1">
                  <UserGroupIcon className="h-4 w-4 text-blue-600" />
                  <span className="text-xs font-medium text-neutral-600">Students</span>
                </div>
                <p className="text-xl font-bold text-blue-700">{operationsData.summary.studentCount}</p>
                <p className="text-xs text-neutral-500">{operationsData.summary.totalAttendance} attendance</p>
              </div>
              {operationsData.summary.supportCount > 0 && (
                <div className="bg-pink-50 rounded-lg p-4">
                  <div className="flex items-center gap-2 mb-1">
                    <CalendarIcon className="h-4 w-4 text-pink-600" />
                    <span className="text-xs font-medium text-neutral-600">Support Sessions</span>
                  </div>
                  <p className="text-xl font-bold text-pink-700">{operationsData.summary.supportCount}</p>
                </div>
              )}
              <div className="bg-neutral-50 rounded-lg p-4">
                <div className="flex items-center gap-2 mb-1">
                  <ClockIcon className="h-4 w-4 text-neutral-600" />
                  <span className="text-xs font-medium text-neutral-600">Total Hours</span>
                </div>
                <p className="text-xl font-bold text-neutral-700">
                  {((operationsData.summary.lessonCount + operationsData.summary.supportCount) * 1).toFixed(1)}
                </p>
              </div>
            </div>

            {/* Lessons Table */}
            {operationsData.lessons.length > 0 ? (
              <div style={{ width: '100%' }}>
                <DataGrid
                  autoHeight
                  rows={operationsData.lessons.map((lesson) => ({
                    id: lesson.appointmentId,
                    ...lesson
                  }))}
                  getRowClassName={(params) => {
                    // Highlight lessons operating at a loss (but not support sessions which are expected cost centers)
                    const isSupport = params.row.label?.includes('Support');
                    const isAtLoss = params.row.profit < 0;
                    if (!isSupport && isAtLoss) {
                      return 'loss-row';
                    }
                    return '';
                  }}
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
                      field: 'tutorName',
                      headerName: 'Tutor',
                      width: savedColumnWidths.tutorName || 150,
                    },
                    {
                      field: 'studentCount',
                      headerName: 'Students',
                      width: savedColumnWidths.studentCount || 90,
                      align: 'center',
                      headerAlign: 'center',
                    },
                    {
                      field: 'status',
                      headerName: 'Status',
                      width: savedColumnWidths.status || 110,
                      align: 'center',
                      headerAlign: 'center',
                      renderCell: (params) => (
                        params.row.isCheckedOut ? (
                          <span className="inline-flex items-center gap-1 px-2 py-1 rounded-full text-xs font-medium bg-green-100 text-green-700">
                            <CheckCircleIcon className="h-3 w-3" />
                            Complete
                          </span>
                        ) : (
                          <span className="inline-flex items-center gap-1 px-2 py-1 rounded-full text-xs font-medium bg-blue-100 text-blue-700">
                            <ExclamationCircleIcon className="h-3 w-3" />
                            {params.value}
                          </span>
                        )
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
                    '& .MuiDataGrid-row.loss-row': {
                      backgroundColor: 'rgba(239, 68, 68, 0.1)',
                      '&:hover': {
                        backgroundColor: 'rgba(239, 68, 68, 0.2)',
                      },
                    },
                  }}
                />
              </div>
            ) : (
              <div className="text-center py-12 text-neutral-500">
                <CalendarIcon className="h-12 w-12 mx-auto mb-4 text-neutral-300" />
                <p className="text-sm">No lessons found for this date range</p>
              </div>
            )}
          </>
        ) : (
          <div className="text-center py-12 text-neutral-500">
            <p className="text-sm">Select a date range to view operations data</p>
          </div>
        )}
      </div>


      {/* Lesson Detail Modal - TutorCruncher Style */}
      {selectedLesson && (
        <div className="fixed inset-0 z-50 overflow-y-auto">
          <div className="flex items-center justify-center min-h-screen p-4">
            <div className="fixed inset-0 bg-black/50" onClick={() => setSelectedLesson(null)} />
            <div className="relative bg-white rounded-xl shadow-xl max-w-5xl w-full max-h-[90vh] overflow-hidden flex flex-col">
              {/* Modal Header - TutorCruncher Style */}
              <div className="bg-brand-purple text-white p-4">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-3">
                    <div
                      className={`w-4 h-4 rounded-full ${selectedLesson.label?.includes('Support') ? 'bg-pink-500' : 'bg-blue-500'}`}
                    />
                    <div>
                      <h3 className="text-lg font-semibold flex items-center gap-3">
                        Lesson: {selectedLesson.jobName}
                        <span className={`px-2 py-0.5 rounded text-xs font-medium ${
                          selectedLesson.isCheckedOut ? 'bg-green-500' : 'bg-blue-500'
                        }`}>
                          {selectedLesson.isCheckedOut ? 'Complete' : selectedLesson.status}
                        </span>
                      </h3>
                      <a
                        href={`https://account.acmeops.com/cal/appointments/${selectedLesson.appointmentId}/`}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="text-sm text-white/80 hover:text-white hover:underline"
                      >
                        Job: {selectedLesson.jobName}
                      </a>
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

              {/* Content */}
              <div className="flex-1 overflow-y-auto p-6">
                <div className="space-y-6">
                    {/* Status Card */}
                    <div className="bg-neutral-50 rounded-xl p-6 text-center border border-neutral-200">
                      <CalendarIcon className="h-12 w-12 mx-auto mb-2 text-blue-500" />
                      <h4 className={`text-xl font-semibold ${
                        selectedLesson.isCheckedOut ? 'text-green-600' : 'text-blue-600'
                      }`}>
                        {selectedLesson.isCheckedOut ? 'Complete' : selectedLesson.status?.charAt(0).toUpperCase() + selectedLesson.status?.slice(1)}
                      </h4>
                      <p className="text-sm text-neutral-500 mb-2">
                        {selectedLesson.isCheckedOut ? 'This lesson has been completed.' : 'This lesson is scheduled to happen.'}
                      </p>
                      <p className="text-lg font-bold text-neutral-900">
                        {selectedLesson.time} - {selectedLesson.endTime}
                      </p>
                      <p className="text-neutral-600">
                        {DateTime.fromISO(selectedLesson.date).toFormat('EEEE d MMMM yyyy')}
                      </p>
                    </div>

                    {/* Location */}
                    {selectedLesson.location && (
                      <div className="bg-blue-500 text-white rounded-lg p-3 text-center">
                        <span className="mr-2">📍</span>
                        {(() => {
                          try {
                            const loc = typeof selectedLesson.location === 'string'
                              ? JSON.parse(selectedLesson.location)
                              : selectedLesson.location;
                            return loc.address || loc.name || 'Location available';
                          } catch {
                            return typeof selectedLesson.location === 'string'
                              ? selectedLesson.location
                              : 'Location available';
                          }
                        })()}
                      </div>
                    )}

                    {/* Students and Tutors Grid */}
                    <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                      {/* Students */}
                      <div className="border border-neutral-200 rounded-lg">
                        <div className="bg-neutral-50 px-4 py-3 border-b border-neutral-200 flex items-center justify-between">
                          <h4 className="font-semibold text-neutral-900">Students ({selectedLesson.studentCount})</h4>
                        </div>
                        <div className="p-4 space-y-2 max-h-48 overflow-y-auto">
                          {selectedLesson.students && selectedLesson.students.length > 0 ? (
                            selectedLesson.students.map((student, idx) => (
                              <div
                                key={idx}
                                className={`flex items-center justify-between p-2 rounded ${
                                  student.status === 'missed' ? 'bg-red-50' : ''
                                }`}
                              >
                                <span className={`text-brand-purple font-medium ${student.status === 'missed' ? 'line-through text-red-400' : ''}`}>
                                  {student.name}
                                </span>
                                <span className="text-neutral-600">
                                  {formatCurrency(student.chargeRate || 0)}
                                </span>
                              </div>
                            ))
                          ) : (
                            <p className="text-neutral-500 text-sm">No Students</p>
                          )}
                        </div>
                      </div>

                      {/* Tutors */}
                      <div className="border border-neutral-200 rounded-lg">
                        <div className="bg-neutral-50 px-4 py-3 border-b border-neutral-200 flex items-center justify-between">
                          <h4 className="font-semibold text-neutral-900">
                            {selectedLesson.label?.includes('Support') ? 'Staff' : 'Tutors'}
                          </h4>
                        </div>
                        <div className="p-4 space-y-2">
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
                            <p className="text-neutral-500 text-sm">No tutors assigned</p>
                          )}
                        </div>
                      </div>
                    </div>

                    {/* Financial Summary */}
                    <div className="border border-neutral-200 rounded-lg">
                      <div className="bg-neutral-50 px-4 py-3 border-b border-neutral-200">
                        <h4 className="font-semibold text-neutral-900">Financial Summary</h4>
                      </div>
                      <div className="p-4">
                        <div className="grid grid-cols-4 gap-4">
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
                  Open in TutorCruncher →
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
